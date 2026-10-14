---
id: SPEC-ENG-002
type: technical-spec
status: draft
created: 2026-10-14
related: [SPEC-ENG-001, SPEC-UI-003, PRD-001, 'research/18']
---

# SPEC-ENG-002 — Flow "Confirm request cấp quyền TKQC" (Dry-run / Assist / Full)

> Yêu cầu: sau flow "Gán partner vào TKQC" (SPEC-ENG-001), một số BM trả `pending-approval`: admin thứ 2 phải xử lý (Approve hoặc Decline) tại Settings → Requests → Needs review. Flow này là phần việc của admin thứ 2. Dùng lại engine, audit, budget, curfew, kill-switch của SPEC-ENG-001. Tên cũ "Duyệt request partner" đổi thành "Confirm request partner" (14/10/2026); id nội bộ giữ `partner-approve`.

## 1. Quyết định đã chốt (user, 14/10/2026)

| #   | Quyết định                                                                                                                                                                                                                    |
| :-- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Flow **độc lập** `partner-approve`, admin thứ 2 tự chạy trong profile của họ. Không nối vào run Assign.                                                                                                                       |
| D2  | Duyệt **tất cả** request loại "cấp quyền TKQC cho BM X" mà **tên BM** khớp tên anh nhập (so khớp chính xác sau chuẩn hoá).                                                                                                    |
| D3  | **Dry-run** + **Assist** (user tự bấm) + **Full** (engine tự bấm). Full chỉ chạy được khi cổng ghi (PRD §8, `FULL_LOCKED`) mở: hiện vẫn khoá, mã Full đã có nhưng không có đường kích hoạt từ panel.                          |
| D4  | (14/10/2026) User chọn **Approve hoặc Decline** cho cả lượt quét (một lựa chọn, không chọn riêng từng request). Mặc định Approve, không lưu storage; engine không có mặc định ngầm (`action` bắt buộc trong `ApproveConfig`). |
| D5  | (14/10/2026) Assist: user vẫn tự bấm. Full: engine tự bấm đúng nút đã chọn, không bao giờ nút còn lại. Quy tắc cũ "engine không bao giờ bấm Approve/Decline" bị thay thế bởi quy tắc này.                                     |

## 2. Quyết định kỹ thuật (agent, sau review)

- **Quét trước, chạy sau.** Lệnh chỉ-đọc `requests.read` (panel → content script) trả các request khớp (người yêu cầu, tên BM, TKQC). User xem danh sách rồi mới Dry-run/Assist. `run.start` mang chính danh sách đó (`requests`), nên request mới đến giữa chừng không bao giờ được duyệt khi chưa hiện cho user. Số request duyệt tối đa = số đã quét.
- **Mỗi request là một "mẻ" 1 target** (`beginBatch`), dùng bộ 7 bước, bước 6 là bước ghi, bước 7 là verify.
- Chỉ nhận request đọc được là "X requests to give B access to the A ad account"; hàng không parse được hoặc loại khác (mời người, gỡ người…) **bị bỏ qua, không bao giờ duyệt**. Câu có một cụm khoá ("requests to give", "access to the", "ad account") xuất hiện **hơn một lần** là mơ hồ (tên BM/TKQC do bên ngoài đặt có thể chứa chính các cụm này để đánh lừa ranh giới) nên cũng bị bỏ qua; hệ quả có chủ đích là TKQC có chữ "ad account" trong tên phải duyệt tay.
- Tên BM so **bằng nhau** sau `normalizeText` ("Tris BM" không khớp "Tris BM 2"). Vì tên không phải danh tính, BM ID (đọc trong khung của request đang mở, không quét cả trang; nhiều ID khác nhau trong khung thì không đoán) hiện ở dòng định danh phụ của target để user đối chiếu **trước khi tự bấm Approve**. BM ID không nằm trong `name` nên **không vào audit ở mức `basic`**; `lastRun` ở mức `off` bị che hết (tên BM, requester, TKQC, ID).
- Engine chỉ **định vị nút của quyết định đã chọn** (`request.approve` hoặc `request.decline`); không bao giờ định vị hay bấm nút còn lại. Dry-run chỉ định vị nút đó, không cố bật nó khi đang mờ. Dry-run với Decline là cách duy nhất để thử selector `request.decline` (chưa kiểm chứng trên DOM thật) trước khi Full bấm nó.
- **Full:** sau bước 5, engine định vị lại nút và đối chiếu lại khung chi tiết với request đã quét **ngay trước khi bấm** (không khớp → `ERR_TARGET_NOT_FOUND`, không bấm), gọi `markWriteStarted()` rồi bấm đúng một lần, chờ trang cập nhật, rồi verify. Nếu sau cú bấm một hộp thoại lạ hiện ra (vd. bước xác nhận của Meta, **chưa từng được quan sát cho cả Approve lẫn Decline**) mà request chưa rời Needs review thì dừng `ERR_UNEXPECTED_DIALOG`; engine không bấm xuyên qua hộp thoại nó không nhận ra. Vì đã gọi `markWriteStarted()`, target còn `running` thành `unverified` và được tính một lần ghi.
- Full đi qua **mọi cổng** như Assist: khẩn cấp, rate-limit, curfew (cả trong từng hành động), ngân sách (cả danh sách phải nằm gọn). `isRunCommand` chỉ nhận `mode: 'full'` khi `flow === 'partner-approve'`, và controller từ chối Full cho flow Gán partner (`ERR_INVALID_CONFIG`) vì flow đó coi mọi mode khác Dry là Assist.
- Assist: engine mở chi tiết, kiểm tên BM + TKQC khớp, rồi dừng chờ user bấm nút đã chọn. Engine theo dõi (listener `click` capture, chỉ đọc) cú bấm Approve/Decline với ba điều kiện: nút đang bật (nút `aria-disabled` vẫn phát `click` nhưng trang bỏ qua), nằm trong khung chi tiết của request đang mở, và chỉ **quyết định đầu tiên** được chốt (Decline ở request khác sau đó không đè lên).
- Sau cú bấm đúng quyết định đã chọn (Assist), engine chờ tiếp tới khi request rời danh sách, user bấm "kiểm tra ngay", hoặc hết hạn chờ Assist: Approve có thể kéo theo bước xác nhận/đăng nhập lại cần thời gian.
- Verify cần hai bằng chứng: đã có cú bấm **đúng quyết định đã chọn** (user bấm ở Assist, engine bấm ở Full) **và** request đã rời Needs review → `done`. "Đã rời" chỉ tính khi danh sách **đọc được** (thấy tab Needs review, tab không báo "không được chọn", không có chỉ báo đang tải), số hàng khớp giảm, và còn đúng sau một nhịp (danh sách có thể chớp trống khi dựng lại). Cú bấm là nút **ngược** quyết định đã chọn (vd. chọn Approve nhưng bấm Decline) → `failed` `ERR_WRONG_ACTION`: đó vẫn là một lần ghi thật lên Meta nên **được tính ngân sách và audit** (khác `ERR_NOT_APPROVED`, vốn không tính). Chỉ một trong hai bằng chứng → `unverified`, **không retry**. Không có bằng chứng nào → `failed` `ERR_NOT_APPROVED`.
- Gặp kết quả khác `done` thì dừng cả run (target còn lại giữ `queued`).
- **Ngân sách ghi:** mỗi request là một lần ghi riêng lên Meta nên Assist **và Full** tính **theo từng target** `done`/`unverified`/`failed ERR_WRONG_ACTION` (khác flow Gán partner: một run tính một lần), và controller từ chối cả run (`ERR_BUDGET`) nếu số request vượt ngân sách còn lại trong ngày, không cắt bớt âm thầm. Dry không tính.
- **Audit:** `target` luôn kèm quyết định đã chọn (`Request #n · approve|decline`, `tên TKQC · decline`, …) để Decline không bị ghi như Approve; `mode` là `full` khi Full. Quyết định không phải PII nên có ở mọi mức log.
- **Probe:** key `requests.*` thuộc stage `requests` (danh sách), `request.approve` thuộc stage `request-detail` (chỉ có khi mở một request); cả hai tách khỏi stage `page` của trang Partners. Hệ quả: `gateStatus` cần báo cáo ở hai stage mới này, nên người đã đạt gate trước đó sẽ thấy `incomplete` cho tới khi probe trang Requests.
- Nếu Approve kéo theo màn kiểm tra danh tính/mật khẩu, watcher hiện có raise `ERR_CHECKPOINT` và khoá khẩn cấp (chấp nhận được).
- Bề mặt mới `requests` (`/latest/settings/requests`): panel đưa tab tới đó trước khi quét/chạy. Engine không điều hướng bằng href.

## 3. Hợp đồng

- `RunStartCommand.flow?: 'partner-assign' | 'partner-approve'` (vắng = assign, tương thích ngược). `config` được parse theo `flow`.
- `ApproveConfig = { partnerName: string; action: 'approve' | 'decline'; requests: { requester: string; account: string }[] }`. Thiếu hoặc sai `action` → `ERR_INVALID_CONFIG`.
- `RunState.action?` (vắng ở run cũ = `approve`) quyết định tiêu đề bước 5–7 (`approve.step.N` / `approve.step.N.decline`).
- `RunState.flow?` và `RunState.partnerName?` đều tuỳ chọn; approve vẫn điền `tasks: []`, `partnerBmId: ''` để `isRunState` không loại snapshot.
- Mã lỗi mới: `ERR_NOT_APPROVED`, `ERR_WRONG_ACTION`.
- Audit: `flow: 'partner-approve'`; `target` = `Request #n` (off) / tên TKQC (basic) / `tên TKQC → tên BM` (verbose).
- `accountId` của target duyệt là chuỗi duy nhất kèm số thứ tự (`approveTargetId`): hai request trùng hệt nhau là hợp lệ và UI dùng nó làm khoá React.

## 4. Bảy bước

"Nút đã chọn" là Approve hoặc Decline theo `action`.

| #   | Bước                                                  | Dry        | Assist                   | Full                                      |
| :-- | :---------------------------------------------------- | :--------- | :----------------------- | :---------------------------------------- |
| 1   | Kiểm đang ở Requests, chọn tab Needs review           | chạy       | chạy                     | chạy                                      |
| 2   | Tìm request khớp trong danh sách                      | chạy       | chạy                     | chạy                                      |
| 3   | Mở chi tiết request                                   | chạy       | chạy                     | chạy                                      |
| 4   | Đối chiếu tên BM, BM ID, TKQC với danh sách đã quét   | chạy       | chạy                     | chạy                                      |
| 5   | Tìm nút đã chọn (ghi nhận bật/tắt), chuẩn bị cho user | chạy       | chạy                     | chạy                                      |
| 6   | Bấm nút đã chọn                                       | **bỏ qua** | **user bấm**, engine chờ | **engine bấm** (đối chiếu lại ngay trước) |
| 7   | Verify: đúng cú bấm + request rời Needs review        | bỏ qua     | chạy                     | chạy                                      |

## 5. Chưa kiểm chứng

- Nhãn/cấu trúc DOM chỉ dựa trên ảnh chụp EN ngày 14/10/2026 (locale `en`). Nhãn `vi` là suy luận (`verified: false`), cần probe trên BM tiếng Việt.
- Điều kiện bật nút Approve (nút mờ lúc mới mở) chưa rõ; chạy Dry-run trên BM thật để ghi lại.
- **Nhãn/selector nút Decline chưa kiểm chứng trên DOM thật** (`request.decline`, `verified: false`). Chạy Dry-run với quyết định Decline trên BM thật và Probe (stage `request-detail` giờ gồm cả `request.decline`) trước khi bao giờ mở Full.
- **Meta có hiện bước xác nhận sau Decline/Approve hay không chưa biết.** Full xử lý bằng cách dừng `ERR_UNEXPECTED_DIALOG` khi gặp hộp thoại lạ; chưa từng chạy Full trên BM thật, test Full chỉ chạy trên fixture do chúng ta viết.
- Decline giả định làm request rời Needs review như Approve; chưa kiểm chứng.
- Danh sách có phân trang/cuộn vô hạn chưa xét: chỉ đọc phần đang hiển thị.
- 16 test flow dựng trên fixture do chính chúng ta viết theo hai ảnh chụp EN; chúng chứng minh parser khớp fixture, **không** chứng minh khớp DOM thật của Meta. Việc kiểm chứng đầu tiên là Dry-run trên trang Requests thật (Dry chỉ đọc nhưng có bấm Respond để mở chi tiết).
- Với BM chứa nhiều ID/tên trùng: danh sách quét chưa hiện BM ID (chỉ có ở khung chi tiết); user đối chiếu ID lúc Assist.
- **Việc còn lại trước khi mở `FULL_LOCKED` (từ security review):**
  - Full khớp request chỉ theo tên BM, không có BM ID: BM trùng tên sẽ bị duyệt như nhau. Cần chốt `bmId` lúc quét và bắt buộc khớp trước khi bấm.
  - Budget/audit chỉ ghi khi run kết thúc: tab reload giữa chừng thì các cú bấm đã xảy ra không được tính. Cần ghi trước (write-ahead) tại `markWriteStarted`.
  - `reachedAssign` tính theo cả run, không theo từng target (target sau cú bấm đầu có thể bị tính một lần ghi thừa).
  - Engine chưa có khoá riêng cho Full; hiện chỉ `FULL_LOCKED` ở panel.
  - `observeDecision` chỉ khớp theo `textContent` của nút, trong khi `locate` thử `aria-label` trước. Nếu nút thật chỉ có icon + `aria-label`, cú bấm của engine không được observer nhận ra và mọi lần chạy Full sẽ ra `unverified` rồi dừng sau request đầu (fail-safe, nhưng là ẩn số trên DOM thật).
  - Đã xử lý: nút phải nằm trong khung chi tiết và được đối chiếu lại ngay trước khi nhấn và nhả (`click` có `guard`); verify dùng nút đã bấm thật (`observeDecision` chạy cả Full); audit ghi hành động thực sự khi `ERR_WRONG_ACTION`.
