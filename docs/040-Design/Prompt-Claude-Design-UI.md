---
id: DES-001
type: design-prompt
status: draft
created: 2026-10-12
related: [PRD-001, BRD-001]
---

# DES-001 — Prompt dựng UI HPMA Copilot bằng Claude Design

> Prompt để đưa vào Claude Design dựng mockup UI cho extension. Nguồn: PRD-001 (FR-01, FR-03, FR-05, §6), BRD-001 §4.1, `../050-Research/21-architecture-dom-copilot.md` §5.1.
> Lưu ý: PRD/BRD chưa có wireframe; các màn hình và layout dưới đây là **đề xuất suy ra từ tài liệu**, chưa được duyệt. Điểm còn mở: mode **Assist** không thể highlight trong trang BM (do quyết định "no in-page UI") — hiện đang dẫn bằng text ở side panel.
> Gợi ý dùng: nếu Claude Design giới hạn độ dài, chia 2 lượt — lượt 1: mục 1–4 + màn 1–8; lượt 2: các trạng thái đặc biệt, Popup, Options.

---

# Brief: thiết kế UI cho "HPMA Copilot" — browser extension vận hành Facebook Business Manager

## 1. Sản phẩm là gì

Extension Chrome/Firefox (MV3) cho agency quảng cáo Việt Nam. Nó tự động thao tác UI Facebook Business Manager (BM) thay người dùng: gán/gỡ partner vào tài khoản quảng cáo (TKQC), share pixel, quản lý người dùng BM, đổi tên TKQC, kiểm kê tài sản. Mọi thao tác ghi đều có người duyệt (human-in-the-loop), có dry-run, pacing an toàn và audit log.

Persona: (1) chủ agency VN quản 5–30 BM, sợ nhân viên bấm nhầm, cần bằng chứng giải trình; (2) nhân viên vận hành ads làm hàng chục thao tác/ngày theo ticket. Họ cần cảm giác **kiểm soát và an toàn**, không phải "tự động cho nhanh".

## 2. Ràng buộc kiến trúc (bắt buộc)

- **KHÔNG có UI nào chèn vào trang business.facebook.com.** Toàn bộ UI nằm ở 3 extension page: **Side panel (bề mặt chính)**, **Popup**, **Options**.
- Side panel hẹp, 360px (co giãn 320–420px), cuộn dọc, header và footer cố định. Thiết kế mobile-first theo chiều rộng này, không có layout desktop rộng cho side panel.
- Options là trang tab đầy đủ (desktop, tối đa ~960px).
- Popup 320×400px.
- Stack: React 19, Tailwind CSS 4 + **DaisyUI 5**. Chỉ dùng class Tailwind/DaisyUI, không inline style. Root container có `id="my-ext"` và `data-theme`. Hỗ trợ light + dark theme của DaisyUI.
- Ngôn ngữ UI: **Tiếng Việt là chính**, có thể chuyển EN. Giữ nguyên thuật ngữ IT bằng tiếng Anh (dry-run, assist, full, probe, audit log, kill-switch, selector, partner, TKQC, BM...).

## 3. Ba mode chạy (trọng tâm của thiết kế)

Mode chọn **theo từng lần chạy**, mặc định **Dry-run**. Mỗi mode phải khác biệt rõ về màu, nhãn nút và thông điệp để không thể bấm nhầm mode ghi.

| Mode        | Hành vi                                                                                                                                                                   | Nhãn nút      | Màu/badge                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------- |
| **Dry-run** | Điều hướng + điền form, **bỏ mọi bước ghi**, chỉ hiện diff "sẽ làm gì"                                                                                                    | "Chạy thử"    | Xanh (info/success) — "Không thay đổi BM" |
| **Assist**  | Dẫn tới **trước nút commit** rồi dừng; user tự bấm bước cuối trong trang BM. Vì không có UI trong trang, panel hướng dẫn bằng text + trạng thái "đang chờ bạn bấm Assign" | "Dẫn tôi làm" | Vàng (warning) — "Bạn bấm bước cuối"      |
| **Full**    | Chạy hết, mọi bước ghi có verify-readback, kèm pacing                                                                                                                     | "Thực thi"    | Cam/đỏ (error/accent) — "Sẽ ghi thật"     |

**Full bị khoá** cho tới khi đủ điều kiện (probe ≥ 95%, flow đã qua gate, và lần đầu trên BM đó đã walk-through 2–3 target). Khi khoá, hiện lý do cụ thể, ví dụ "Cần chạy Assist 2 lần nữa trên BM này".

Cần thiết kế **cùng một màn Run ở cả 3 mode** để thấy khác biệt:

- Dry-run: các step ghi hiện xám "skipped (dry-run)".
- Assist: step hiện tại được nhấn mạnh, có khối "Bước tiếp theo: bấm **Assign** trong tab BM" và trạng thái chờ.
- Full: stepper chạy liên tục, có đồng hồ pacing "bước kế tiếp sau 5s".

## 4. Cấu trúc side panel

**Header cố định:** tên BM đang bám + chấm trạng thái, locale (vi/en), surface hiện tại (vd "Partners ✓ hỗ trợ"), selector mode (3 nút segmented).
Nếu nhiều tab BM mở: dropdown chọn tab đang bám.
Nếu surface là login/checkpoint/2FA: banner "Ngoài vùng hỗ trợ", khoá nút chạy.
**Tab điều hướng:** Flows · Run · Log · Probe.
**Footer cố định:** quota ghi hôm nay (vd "3/20"), curfew nếu đang chặn (0h–6h), và nút **Kill-switch** đỏ, luôn thấy được.

## 5. Danh sách màn hình cần thiết kế

Hãy dựng **mockup high-fidelity** cho từng màn, trong khung side panel 360px:

1. **Flows (danh mục)**: card nhóm theo rủi ro tăng dần: _Đọc_ (Kiểm kê, Chất lượng TKQC, Báo cáo 2FA) → _Ghi thường_ (Đổi tên TKQC) → _Ghi nhạy cảm_ (Gán partner, Gỡ partner, Share pixel/dataset, Quản lý người dùng BM). Mỗi card có tên, mô tả 1 dòng, badge tầng HITL (xanh/vàng/cam), badge "Chưa mở write" nếu chưa qua gate.
2. **Flow config — Gán partner vào TKQC**: form gồm BM ID đối tác (validate 15–17 chữ số, báo lỗi inline), chọn TKQC (multi-select, tìm kiếm), tick quyền theo nhãn (vd Chạy quảng cáo, Phân tích, Quản lý) kèm cảnh báo nổi bật khi chọn quyền cao `MANAGE`. Cuối form là selector mode + nút chạy.
3. **Run — 3 mode (Dry-run, Assist, Full)**: stepper `locate → act → verify`, trạng thái từng step (đang chạy / ok / fail / skipped / paused), `runId`, thời gian, nút Dừng.
4. **Diff / Preview**: bảng "Sẽ gán BM X → TKQC Y · quyền Z" (BM × asset × task). Thêm/xoá/thay đổi tô màu khác nhau.
5. **Confirm 2 lớp** (tác vụ nhạy cảm): lớp 1 xem diff và tick đã đọc; lớp 2 gõ lại nội dung xác nhận (vd gõ tên TKQC hoặc "GAN 3 TKQC") mới bật nút. Có biến thể **batch > 10**: xác nhận từng mẻ, hiện "Mẻ 2/4".
6. **Kết quả**: 3 trạng thái `done` / `pending-approval` (chờ admin thứ 2 duyệt, nói rõ "không chạy lại") / `failed` (kèm lý do + nút copy). Hiện trích đoạn verify-readback và nút **Gỡ lại (undo)**. Có trạng thái "đã tồn tại — bỏ qua (idempotent)".
7. **Log**: log realtime, lọc theo mức (ok/warn/error), mỗi dòng có timestamp + step.
8. **Probe (dành cho dev/operator nâng cao)**: danh sách selector key với hit-rate %, key trượt tô đỏ, hiện tầng chiến lược thắng/trượt, nút "Copy JSON". Có tổng hit-rate và ngưỡng 95%.
9. **Trạng thái đặc biệt** (mỗi cái một mockup):
   - **Vùng đỏ bị từ chối** (thanh toán, appeal, xác minh doanh nghiệp, claim ownership): "Extension không thực hiện thao tác này" + deep-link + checklist làm tay.
   - **Emergency stop** (phát hiện checkpoint/CAPTCHA/temp-block): toàn panel chuyển đỏ, dừng queue, checklist xử lý tay, **không có nút "thử lại"**.
   - **Pacing/limit bị chặn**: "Đã đủ 20 lượt ghi hôm nay" hoặc "Đang trong curfew 0h–6h".
   - **Selector hỏng** (Meta đổi UI): "Meta vừa đổi giao diện — flow tạm dừng" + signature màn hình để báo dev.
   - **Empty state** và **panel mất kết nối tab** (re-sync).
10. **Popup**: tab BM đang bám, flow đang chạy, nút "Mở side panel", **Kill-switch**.
11. **Options** (3 tab): Pacing & limit (delay nền, jitter, limit/ngày theo loại BM, curfew; delay không được xuống dưới ngưỡng an toàn); Audit log (bảng lọc theo ngày/flow/kết quả, export CSV/JSONL); Devtest (cờ bật, `logDetail`).

## 6. Hướng thẩm mỹ & nguyên tắc UX

- Cảm giác: **công cụ vận hành đáng tin cậy**, tinh tế, tiết chế, không "game hoá". Nhiều thông tin trên không gian hẹp nên cần mật độ vừa phải, phân cấp chữ rõ.
- Màu gắn với **rủi ro**, không trang trí: xanh = đọc/không thay đổi, vàng = cần bạn, cam/đỏ = ghi thật/nguy hiểm. Dùng nhất quán trên mọi màn.
- Dùng màu semantic của DaisyUI (info/success/warning/error), không tự thêm bảng màu lạ. Không dùng màu xanh Facebook/Meta, không dùng logo hay brand của Meta (tránh vi phạm policy Chrome Web Store).
- Hành động nguy hiểm (Full, Gỡ partner, quyền MANAGE) phải **có ma sát có chủ đích**: nút khác màu, cần xác nhận, không đặt sát nút an toàn.
- Kill-switch luôn hiện và luôn bấm được, nhưng không chiếm quá nhiều chỗ.
- Mọi trạng thái đều có text rõ ràng, không chỉ dựa vào màu (accessibility, tương phản AA).
- Light + dark theme. Vùng chạm tối thiểu 36px.

## 7. Cách tôi muốn nhận kết quả

- Trước hết đề xuất **1 hướng thiết kế** (design tokens: màu semantic, type scale, spacing, hình dạng góc) rồi áp dụng nhất quán.
- Xuất mockup **theo thứ tự**: Flows → Flow config → Run ×3 mode → Diff → Confirm 2 lớp → Kết quả → các trạng thái đặc biệt → Popup → Options.
- **Chỉ xuất React + class Tailwind/DaisyUI.** Không CSS riêng, không inline style, không thư viện hay font tải từ CDN/bên ngoài (extension MV3 không tải được script từ xa; thư viện cần thiết sẽ được cài qua pnpm).
- **Tách mock data khỏi component:** mỗi trạng thái (3 mode Run, từng trạng thái đặc biệt) là một component nhận props; dữ liệu giả để trong một file riêng.
- **Component dùng chung:** stepper, badge tầng rủi ro, bảng diff, hộp confirm làm thành component tái sử dụng, không lặp lại ở từng màn.
- **Độ rộng:** side panel Chrome do user kéo giãn, sidebar Firefox có độ rộng khác — layout phải co giãn tốt trong 320–420px, không chỉ cố định 360px.
- **Số liệu là minh hoạ:** các con số như "3/20" lượt ghi, curfew 0h–6h, ngưỡng 95% là giả định chưa hiệu chỉnh (PRD đánh dấu cần test); dùng làm dữ liệu mẫu, không coi là giá trị cố định.
- Nếu chỗ nào tôi mô tả mơ hồ hoặc mâu thuẫn (ví dụ Assist không thể highlight trong trang), hãy nêu thành câu hỏi hoặc giả định rõ ràng thay vì tự đoán im lặng.
