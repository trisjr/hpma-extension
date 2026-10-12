---
id: SPEC-UI-001
type: technical-spec
status: draft
created: 2026-10-12
source: docs/040-Design/project/Flows.dc.html
related: [PRD-001, DES-001]
---

# SPEC-UI-001 — Màn hình "1 · Flows" (side panel)

> Nguồn thiết kế: artboard `Flows.dc.html` (360×1180) và `FlowsDark.dc.html` trong canvas "HPMA Copilot UI". Yêu cầu sản phẩm: PRD-001 §4.1b (danh mục flow), FR-01, FR-05, FR-06. Design tokens: `project/ds/hpma/tokens.json`.

## 1. Mục đích

Màn vào mặc định của side panel. User chọn một **flow** để chạy, xếp theo **rủi ro tăng dần** (đọc → ghi thường → ghi nhạy cảm). Màn này chỉ điều hướng, không ghi gì lên BM.

## 2. Vị trí & phạm vi

- Bề mặt: side panel (`src/sidepanel/`), boot qua `createShadowRoot(styles)`. Root có `id='my-ext'` và `data-theme` (`hpma-light` hoặc dark).
- Chiều rộng 320–420px (mock 360). Chiều cao theo viewport. Header và footer cố định, `main` cuộn dọc.
- Không render gì vào DOM `business.facebook.com` (NFR-02).

## 3. Cấu trúc

```
┌ header ───────────────────────────────┐
│ [icon] Tab BM picker ········ [VI]    │  row 1
│ [ Dry-run | Assist | Full🔒 ]         │  row 2 · mode switch
│ Flows | Run | Log | Probe             │  row 3 · tab nav
├ main (cuộn) ──────────────────────────┤
│ Flows                  Xếp theo rủi ro│
│ ● ĐỌC · 3                             │
│   [card] [card] [card]                │
│ ● GHI THƯỜNG · 1                      │
│   [card]                              │
│ ● GHI NHẠY CẢM · 4                    │
│   [card] [card] [card] [card]         │
├ footer ───────────────────────────────┤
│ Ghi hôm nay 3/20 · Curfew 0h–6h [Kill]│
└───────────────────────────────────────┘
```

## 4. Thành phần

### 4.1. Header — tab BM picker (row 1)

| Phần tử         | Hành vi                                                                                                                                                                                                             |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Icon toà nhà    | Trang trí, `aria-hidden`.                                                                                                                                                                                           |
| Nút picker      | Hiện tên BM của tab đang bám (ví dụ `Tenomad Agency 03`), chip `n/m tab` (n = thứ tự tab đang bám, m = số tab BM đang mở), chevron. Bấm mở menu chọn tab BM khác (elevation-8). `aria-label` nêu rõ số tab đang mở. |
| Dòng trạng thái | Chấm xanh + `Đang bám · <màn BM hiện tại>` (mock: `Partners`) + dấu ✓ `hỗ trợ`. Màn BM ngoài vùng hỗ trợ xem §7.                                                                                                    |
| Nút ngôn ngữ    | `VI` ↔ `EN`, 36×40. `aria-label` nêu ngôn ngữ hiện tại và hành động. Lưu lựa chọn vào `storage.local`.                                                                                                             |

Chỉ một tab được bám tại một thời điểm. Khi chỉ có 1 tab BM, chip hiện `1/1 tab` và menu chỉ có một mục.

### 4.2. Header — mode switch (row 2)

Nhóm segmented `role="group"`, 3 nút `aria-pressed`, cao 36px, bo 8px.

| Mode    | Màu (chọn)                        | Icon    | Ghi chú                    |
| :------ | :-------------------------------- | :------ | :------------------------- |
| Dry-run | green-50 / 700 / viền 300         | mắt     | Mặc định. Bỏ mọi bước ghi. |
| Assist  | yellow-50 / 800 / viền yellow-300 | bàn tay | Dừng trước bước commit.    |
| Full    | orange-50 / 700 / viền orange-300 | tia sét | Ghi thật.                  |

- Nút không chọn: nền trong suốt, chữ `#4b5563`.
- **Full bị khoá** (`disabled`, icon khoá, chữ `#9ca3af`) khi chưa đủ điều kiện mở write. Điều kiện mở: xem §6.
- Mode là thuộc tính của **lần chạy tiếp theo**, không đổi trạng thái BM. Khi có run đang chạy, các mode còn lại bị `disabled` (xem `ConfirmBatch`, `RunFull`).

### 4.3. Header — tab nav (row 3)

`Flows | Run | Log | Probe`, mỗi tab cao 42px, chia đều. Tab hiện tại: `aria-current="page"`, chữ `#2563eb` weight 600, vạch dưới 2px `#3b82f6`. Tab `Run` trỏ tới màn Run tương ứng mode đang chọn (`RunDryRun` / `RunAssist` / `RunFull`).

### 4.4. Main — tiêu đề

`h1 "Flows"` (18/28, 500) bên trái; chú thích `Xếp theo rủi ro tăng dần` (12/16) bên phải.

### 4.5. Main — nhóm rủi ro

Mỗi nhóm là một `section` với `h2` overline (12/14, hoa, letter-spacing 0.05rem), chấm màu 8px và số lượng `· n`. Thứ tự cố định:

| Nhóm         | Chấm      | Tier badge                 | Màu badge                            | Số flow |
| :----------- | :-------- | :------------------------- | :----------------------------------- | :------ |
| Đọc          | `#22c55e` | Không cần duyệt (icon mắt) | green-50 / viền 200 / chữ 700        | 3       |
| Ghi thường   | `#eab308` | Duyệt 1 lớp (icon ✓)       | yellow-50 / viền amber-200 / chữ 800 | 1       |
| Ghi nhạy cảm | `#f97316` | Duyệt 2 lớp (icon khiên)   | orange-50 / viền 200 / chữ 700       | 4       |

Nhóm không có flow nào thì ẩn cả nhóm. Số lượng `n` phải khớp số card trong nhóm.

### 4.6. Flow card

Một `<a>` (không phải div) bao toàn card. Nền trắng, viền 1px `rgba(47,43,61,.12)`, bo 6px, đệm 12px, không đổ bóng.

| Vùng      | Nội dung                                                              |
| :-------- | :-------------------------------------------------------------------- |
| Tên       | 14/20, 600, `#2f2b3d`.                                                |
| Mô tả     | 13/18, `#4b5563`, tối đa 2 dòng.                                      |
| Tier chip | Cùng màu/icon/nhãn với badge của nhóm. Cao 22px.                      |
| Chip khoá | `Chưa mở write` (icon khoá, nền gray-100), chỉ hiện khi flow bị khoá. |
| Chevron   | 18px, `#9ca3af`, `aria-hidden`.                                       |

Hành vi bấm:

- Flow mở: điều hướng tới màn cấu hình của flow (mock: `Gán partner vào TKQC` → `FlowConfig`, bước 2.1).
- Flow khoá: **không** vào được bước ghi. Xem câu hỏi mở Q2.

### 4.7. Footer (cố định, 54px)

- Trái: `Ghi hôm nay <đã dùng>/<giới hạn> · Curfew 0h–6h` và thanh tiến độ 4px (pill, fill `#6b7280`). Số liệu lấy từ bộ đếm FR-06 trong `storage.local`.
- Phải: nút **Kill-switch** 36px, nền `#b91c1c`, chữ trắng, icon vuông dừng. Luôn hiển thị, **không bao giờ bị khoá hay `disabled`**. Bấm dừng mọi queue (hành vi chi tiết ở màn `StateEmergency`).

## 5. Dữ liệu — danh mục flow

Nguồn danh mục là `FlowDef` trong engine (NFR-06). Panel không hard-code danh sách. Mỗi flow cần: `id`, `name`, `desc`, `risk` (`read` | `write` | `sensitive`), `locked` (suy ra, xem §6), `route`.

| Flow                  | FR    | Nhóm         | Trạng thái trong mock |
| :-------------------- | :---- | :----------- | :-------------------- |
| Kiểm kê tài sản       | FR-08 | Đọc          | Mở                    |
| Chất lượng TKQC       | FR-14 | Đọc          | Mở                    |
| Báo cáo 2FA           | FR-15 | Đọc          | Mở                    |
| Đổi tên TKQC          | FR-12 | Ghi thường   | Mở                    |
| Gán partner vào TKQC  | FR-04 | Ghi nhạy cảm | Mở, có màn cấu hình   |
| Gỡ partner            | FR-09 | Ghi nhạy cảm | Khoá                  |
| Share pixel / dataset | FR-10 | Ghi nhạy cảm | Khoá                  |
| Quản lý người dùng BM | FR-13 | Ghi nhạy cảm | Khoá                  |

Flow thuộc vùng đỏ (payment, appeal, verification, claim ownership) **không bao giờ** xuất hiện (PRD §2.3, §4.1b).

## 6. Logic khoá

- **Full khoá** và **flow `Chưa mở write` khoá** do cùng một cổng: chỉ mở write khi probe hit-rate các key của flow ≥ 95% (PRD §4.1b, quy tắc thêm flow mới #3) và flow đã qua dry-run + verify-readback.
- Trạng thái khoá tính theo **flow**, không theo toàn cục. Mode `Full` khoá khi flow đang chọn chưa mở write. Trên màn Flows (chưa chọn flow) Full hiển thị khoá nếu **không flow ghi nào** đang mở.
- Flow nhóm Đọc không bao giờ bị khoá.
- Lý do khoá phải truy cập được bằng chữ, không chỉ bằng icon (xem Q2).

## 7. Trạng thái màn hình

| Trạng thái        | Điều kiện                                    | Hiển thị                                                       |
| :---------------- | :------------------------------------------- | :------------------------------------------------------------- |
| Mặc định          | Có tab BM được bám, màn hỗ trợ               | Như §3.                                                        |
| Chưa có tab BM    | Không có tab `business.facebook.com`         | `StateEmpty` (9f).                                             |
| Mất kết nối tab   | Tab đóng hoặc content script không ping được | `StateDisconnected` (9g).                                      |
| Ngoài vùng hỗ trợ | Login, 2FA, checkpoint                       | `StateOutOfScope` (9h).                                        |
| Emergency stop    | Cờ `emergency_stop` bật                      | `StateEmergency` (9b). Card ghi bị chặn, chỉ xem.              |
| Hết quota ghi     | Đã dùng đủ giới hạn ngày                     | `StateLimit` (9c). Footer hiện 100%, flow ghi không chạy được. |
| Curfew            | Trong khung 0h–6h                            | `StateCurfew` (9d).                                            |

Các trạng thái trên thay hoặc phủ lên `main`. Header và footer (kể cả Kill-switch) vẫn hiện.

## 8. Điều hướng

| Từ                          | Tới                                   | Điều kiện             |
| :-------------------------- | :------------------------------------ | :-------------------- |
| Card `Gán partner vào TKQC` | `FlowConfig` (2.1)                    | Flow mở               |
| Card các flow khác          | Màn cấu hình tương ứng                | Chưa thiết kế, xem Q1 |
| Tab `Run`                   | `RunDryRun` / `RunAssist` / `RunFull` | Theo mode             |
| Tab `Log`                   | `Log`                                 |                       |
| Tab `Probe`                 | `Probe`                               |                       |

## 9. Theme

Light (`hpma-light`) là chuẩn. Dark (`FlowsDark`) dùng cùng cấu trúc, đổi token màu. Màu vẫn mang nghĩa rủi ro, mọi trạng thái vẫn có chữ và icon (không chỉ dựa vào màu).

## 10. Accessibility

- Mọi vùng chạm ≥ 36px (nút chính 40px).
- Card là `<a href>`. Nút icon-only (nếu có) có `aria-label`. SVG trang trí `aria-hidden`.
- Mode switch dùng `aria-pressed`. Nút khoá dùng `disabled`.
- Tab nav `aria-current="page"` trên tab hiện tại.
- Contrast chữ ≥ 4.5:1 (≥ 3:1 từ 24px). Chữ phụ dùng `#4b5563`, không dùng xám nhạt hơn. `#9ca3af` chỉ cho phần tử `disabled` và chevron trang trí.
- Thứ tự Tab: picker → ngôn ngữ → mode → tab nav → các card theo thứ tự trên xuống → Kill-switch.
- Hoạt động ở 320px mà không cuộn ngang. Tên flow xuống dòng, không cắt.

## 11. Quy tắc triển khai (theo CLAUDE.md)

- Component React hàm, trả về `JSX.Element`, tên file PascalCase.
- Style bằng Tailwind + DaisyUI, không inline style. Mock dùng inline style vì là artboard, **không copy nguyên**. Ánh xạ màu sang token HPMA trong `tokens.json`.
- Dùng `browser.*` từ `webextension-polyfill`.
- Không thêm permission mới cho màn này. Xem Q3.

## 12. Tiêu chí nghiệm thu

1. Màn mở mặc định khi bật side panel trên tab BM đã bám, hiển thị đủ 3 nhóm theo thứ tự đọc → ghi thường → ghi nhạy cảm.
2. Số `n` trên header nhóm bằng số card của nhóm.
3. Danh sách card sinh từ `FlowDef`. Thêm một `FlowDef` mới thì card xuất hiện mà không sửa component.
4. Flow khoá không dẫn tới bước ghi, có nhãn chữ giải thích lý do.
5. Full bị khoá khi chưa đủ điều kiện mở write và không chọn được bằng bàn phím.
6. Kill-switch luôn hiển thị và bấm được ở mọi trạng thái, kể cả emergency stop, hết quota và curfew.
7. Chip `n/m tab` phản ánh đúng số tab BM đang mở và cập nhật khi mở hoặc đóng tab.
8. Đổi VI ↔ EN cập nhật toàn bộ chữ trên màn mà không tải lại panel.
9. Số `Ghi hôm nay` khớp bộ đếm FR-06, giữ nguyên sau khi đóng và mở lại panel hoặc refresh tab BM.
10. Dark theme đạt cùng tiêu chí contrast.
11. Không có UI nào xuất hiện trong trang `business.facebook.com`.

## 13. Câu hỏi mở

| #   | Câu hỏi                                                                                                                                                                                                                      | Đề xuất                                                                                                                      |
| :-- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Card flow Đọc, Ghi thường và các flow khoá trong mock đều có `href="#"`, chưa có màn đích. Chưa thiết kế màn cấu hình cho Kiểm kê, Chất lượng TKQC, Báo cáo 2FA, Đổi tên.                                                    | Thiết kế bổ sung theo pha M2 (PRD §4.1b). Trước đó card hiện nhưng `aria-disabled`.                                          |
| Q2  | Card khoá hiện chưa nói rõ vì sao khoá và có điều hướng được không.                                                                                                                                                          | Card khoá vẫn bấm được để xem **mô tả + điều kiện mở** (probe ≥ 95%, dry-run pass), nhưng không có nút chạy.                 |
| Q3  | Chip `n/m tab` và picker cần liệt kê các tab BM đang mở. NFR-03 đang không xin permission `tabs`. Host permission `business.facebook.com/*` có thể đủ để đọc `url`/`title` của tab khớp, cần test trên cả Chrome và Firefox. | Test sớm. Nếu không đủ, đây là thay đổi permission, phải qua `extension-security-reviewer`.                                  |
| Q4  | ~~Footer mock ghi `3/20` ở Flows nhưng `9/60` ở `ConfirmBatch`. Giới hạn ngày là hằng số hay theo BM?~~                                                                                                                      | **Đã chốt: giới hạn lấy từ cấu hình theo BM (FR-06), mặc định 20.** `9/60` ở mock là số cũ, cần sửa artboard `ConfirmBatch`. |
| Q5  | Mode switch nằm ở header mọi màn, nhưng trên màn Flows chưa chọn flow. Full khoá theo flow (§6) hay theo toàn cục?                                                                                                           | Hiển thị theo flow đang chọn gần nhất, mặc định khoá.                                                                        |
