---
id: SPEC-ENG-002
type: technical-spec
status: draft
created: 2026-10-14
related: [SPEC-ENG-001, SPEC-UI-003, PRD-001, 'research/18']
---

# SPEC-ENG-002 — Flow "Duyệt request cấp quyền TKQC" (Dry-run / Assist)

> Yêu cầu: sau flow "Gán partner vào TKQC" (SPEC-ENG-001), một số BM trả `pending-approval`: admin thứ 2 phải duyệt tại Settings → Requests → Needs review. Flow này là phần việc của admin thứ 2. Dùng lại engine, audit, budget, curfew, kill-switch của SPEC-ENG-001.

## 1. Quyết định đã chốt (user, 14/10/2026)

| #   | Quyết định                                                                                                                 |
| :-- | :------------------------------------------------------------------------------------------------------------------------- |
| D1  | Flow **độc lập** `partner-approve`, admin thứ 2 tự chạy trong profile của họ. Không nối vào run Assign.                    |
| D2  | Duyệt **tất cả** request loại "cấp quyền TKQC cho BM X" mà **tên BM** khớp tên anh nhập (so khớp chính xác sau chuẩn hoá). |
| D3  | Mức tự động như Assign: **Dry-run** + **Assist** (user tự bấm Approve). Full vẫn khoá theo gate ghi hiện có.               |

## 2. Quyết định kỹ thuật (agent, sau review)

- **Quét trước, chạy sau.** Lệnh chỉ-đọc `requests.read` (panel → content script) trả các request khớp (người yêu cầu, tên BM, TKQC). User xem danh sách rồi mới Dry-run/Assist. `run.start` mang chính danh sách đó (`requests`), nên request mới đến giữa chừng không bao giờ được duyệt khi chưa hiện cho user. Số request duyệt tối đa = số đã quét.
- **Mỗi request là một "mẻ" 1 target** (`beginBatch`), dùng bộ 7 bước, bước 6 là bước ghi, bước 7 là verify.
- Chỉ nhận request đọc được là "X requests to give B access to the A ad account"; hàng không parse được hoặc loại khác (mời người, gỡ người…) **bị bỏ qua, không bao giờ duyệt**. Câu có một cụm khoá ("requests to give", "access to the", "ad account") xuất hiện **hơn một lần** là mơ hồ (tên BM/TKQC do bên ngoài đặt có thể chứa chính các cụm này để đánh lừa ranh giới) nên cũng bị bỏ qua; hệ quả có chủ đích là TKQC có chữ "ad account" trong tên phải duyệt tay.
- Tên BM so **bằng nhau** sau `normalizeText` ("Tris BM" không khớp "Tris BM 2"). Vì tên không phải danh tính, BM ID (đọc trong khung của request đang mở, không quét cả trang; nhiều ID khác nhau trong khung thì không đoán) hiện ở dòng định danh phụ của target để user đối chiếu **trước khi tự bấm Approve**. BM ID không nằm trong `name` nên **không vào audit ở mức `basic`**; `lastRun` ở mức `off` bị che hết (tên BM, requester, TKQC, ID).
- Engine **không bao giờ định vị hay bấm Decline**; Dry-run chỉ định vị nút Approve, không cố bật nó khi đang mờ.
- Assist: engine mở chi tiết, kiểm tên BM + TKQC khớp, rồi dừng chờ user bấm Approve. Engine theo dõi (listener `click` capture, chỉ đọc) cú bấm Approve/Decline với ba điều kiện: nút đang bật (nút `aria-disabled` vẫn phát `click` nhưng trang bỏ qua), nằm trong khung chi tiết của request đang mở, và chỉ **quyết định đầu tiên** được chốt (Decline ở request khác sau đó không đè lên).
- Sau cú bấm Approve, engine chờ tiếp tới khi request rời danh sách, user bấm "kiểm tra ngay", hoặc hết hạn chờ Assist: Approve có thể kéo theo bước xác nhận/đăng nhập lại cần thời gian.
- Verify cần hai bằng chứng: đã quan sát cú bấm Approve **và** request đã rời Needs review → `done`. "Đã rời" chỉ tính khi danh sách **đọc được** (thấy tab Needs review, tab không báo "không được chọn", không có chỉ báo đang tải), số hàng khớp giảm, và còn đúng sau một nhịp (danh sách có thể chớp trống khi dựng lại). Cú bấm là Decline → `failed` `ERR_NOT_APPROVED`. Chỉ một trong hai bằng chứng → `unverified`, **không retry**. Không có bằng chứng nào → `failed` `ERR_NOT_APPROVED`.
- Gặp kết quả khác `done` thì dừng cả run (target còn lại giữ `queued`).
- **Ngân sách ghi:** mỗi request là một lần ghi riêng lên Meta nên Assist tính **theo từng target** `done`/`unverified` (khác flow Gán partner: một run tính một lần), và controller từ chối cả run (`ERR_BUDGET`) nếu số request vượt ngân sách còn lại trong ngày, không cắt bớt âm thầm. Dry không tính.
- **Probe:** key `requests.*` thuộc stage `requests` (danh sách), `request.approve` thuộc stage `request-detail` (chỉ có khi mở một request); cả hai tách khỏi stage `page` của trang Partners. Hệ quả: `gateStatus` cần báo cáo ở hai stage mới này, nên người đã đạt gate trước đó sẽ thấy `incomplete` cho tới khi probe trang Requests.
- Nếu Approve kéo theo màn kiểm tra danh tính/mật khẩu, watcher hiện có raise `ERR_CHECKPOINT` và khoá khẩn cấp (chấp nhận được).
- Bề mặt mới `requests` (`/latest/settings/requests`): panel đưa tab tới đó trước khi quét/chạy. Engine không điều hướng bằng href.

## 3. Hợp đồng

- `RunStartCommand.flow?: 'partner-assign' | 'partner-approve'` (vắng = assign, tương thích ngược). `config` được parse theo `flow`.
- `ApproveConfig = { partnerName: string; requests: { requester: string; account: string }[] }`.
- `RunState.flow?` và `RunState.partnerName?` đều tuỳ chọn; approve vẫn điền `tasks: []`, `partnerBmId: ''` để `isRunState` không loại snapshot.
- Mã lỗi mới: `ERR_NOT_APPROVED`.
- Audit: `flow: 'partner-approve'`; `target` = `Request #n` (off) / tên TKQC (basic) / `tên TKQC → tên BM` (verbose).
- `accountId` của target duyệt là chuỗi duy nhất kèm số thứ tự (`approveTargetId`): hai request trùng hệt nhau là hợp lệ và UI dùng nó làm khoá React.

## 4. Bảy bước

| #   | Bước                                                  | Dry        | Assist                   |
| :-- | :---------------------------------------------------- | :--------- | :----------------------- |
| 1   | Kiểm đang ở Requests, chọn tab Needs review           | chạy       | chạy                     |
| 2   | Tìm request khớp trong danh sách                      | chạy       | chạy                     |
| 3   | Mở chi tiết request                                   | chạy       | chạy                     |
| 4   | Đối chiếu tên BM, BM ID, TKQC với danh sách đã quét   | chạy       | chạy                     |
| 5   | Tìm nút Approve (ghi nhận bật/tắt), chuẩn bị cho user | chạy       | chạy                     |
| 6   | Bấm Approve                                           | **bỏ qua** | **user bấm**, engine chờ |
| 7   | Verify: request rời Needs review                      | bỏ qua     | chạy                     |

## 5. Chưa kiểm chứng

- Nhãn/cấu trúc DOM chỉ dựa trên ảnh chụp EN ngày 14/10/2026 (locale `en`). Nhãn `vi` là suy luận (`verified: false`), cần probe trên BM tiếng Việt.
- Điều kiện bật nút Approve (nút mờ lúc mới mở) chưa rõ; chạy Dry-run trên BM thật để ghi lại.
- Danh sách có phân trang/cuộn vô hạn chưa xét: chỉ đọc phần đang hiển thị.
- 16 test flow dựng trên fixture do chính chúng ta viết theo hai ảnh chụp EN; chúng chứng minh parser khớp fixture, **không** chứng minh khớp DOM thật của Meta. Việc kiểm chứng đầu tiên là Dry-run trên trang Requests thật (Dry chỉ đọc nhưng có bấm Respond để mở chi tiết).
- Với BM chứa nhiều ID/tên trùng: danh sách quét chưa hiện BM ID (chỉ có ở khung chi tiết); user đối chiếu ID lúc Assist.
