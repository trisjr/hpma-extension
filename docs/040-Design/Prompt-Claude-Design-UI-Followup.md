---
id: DES-002
type: design-prompt
status: draft
created: 2026-10-12
related: [DES-001, PRD-001, BRD-001]
---

# DES-002 — Prompt hiệu chỉnh: tổ chức UI theo 3 bề mặt (side panel / popup / options)

> Prompt follow-up gửi cho Claude Design **sau khi** nó hoàn thành lượt đầu theo [DES-001](Prompt-Claude-Design-UI.md).
> Lý do: DES-001 dùng từ "mode" cho dry-run/assist/full, gây hiểu nhầm. "3 mode" của extension thực ra là **3 bề mặt giao diện**: side panel, popup, options. Dry-run/assist/full chỉ là tuỳ chọn thực thi của một lần chạy flow, nằm trong side panel.
> Gợi ý dùng: nếu Design đã dựng xong các màn side panel ở mục A, có thể bỏ phần "giữ những gì đã dựng", chỉ giữ yêu cầu chuyển selector dry-run/assist/full xuống Flow config. Muốn đỡ nặng thì chia 2 lượt: lượt 1 = A + B + C; lượt 2 = D + E.

---

# Hiệu chỉnh brief: "3 mode" là 3 bề mặt giao diện, không phải dry-run/assist/full

Tôi cần đính chính brief trước, vì tôi đã dùng từ "mode" gây hiểu nhầm.

**Cấu trúc UI thật của extension là 3 bề mặt (surface) ngang hàng: Side panel, Popup, Options.** Chúng là 3 giao diện khác nhau về vai trò, kích thước và ngữ cảnh dùng. Dry-run / Assist / Full chỉ là **tuỳ chọn thực thi của một lần chạy flow** (nằm trong side panel), không phải khung cấu trúc của UI. Hãy giữ nguyên các màn Run/Diff/Confirm đã làm, nhưng **tổ chức lại toàn bộ deliverable theo 3 bề mặt** như bên dưới.

## 1. Vai trò từng bề mặt (phải thể hiện rõ sự khác biệt)

| Bề mặt         | Kích thước                        | Vai trò                                                                                    | Không làm                                                                 |
| -------------- | --------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Side panel** | 360px (320–420), cuộn dọc         | Nơi làm việc chính: chọn flow, nhập tham số, chạy, duyệt diff, confirm HITL, xem log/probe | —                                                                         |
| **Popup**      | 320×400px                         | Xem nhanh trạng thái + dừng khẩn cấp. Ngắn, một lượt nhìn là hiểu                          | Không chứa confirm, flow dài hay form phức tạp (popup đóng khi mất focus) |
| **Options**    | Trang tab, desktop, tối đa ~960px | Cấu hình và truy vết: pacing, limit, audit log, devtest                                    | Không chạy flow (không gắn tab BM)                                        |

Ba bề mặt phải **cùng một design language** (tokens, màu semantic theo rủi ro, type scale), nhưng mỗi bề mặt tối ưu cho ngữ cảnh riêng của nó.

## 2. Việc cần làm

### A. Side panel — giữ những gì đã dựng, rồi chỉnh

- Giữ: Flows, Flow config, Run, Diff, Confirm 2 lớp, Kết quả, Log, Probe và các trạng thái đặc biệt.
- Chuyển selector dry-run/assist/full thành **một control trong Flow config** (mặc định Dry-run, Full bị khoá kèm lý do). Không đặt nó ở header toàn cục.
- Header cố định chỉ giữ: tên BM đang bám, locale, surface hiện tại, chọn tab BM khi có nhiều tab.
- Footer cố định: quota ghi hôm nay, curfew, Kill-switch.

### B. Popup — làm đầy đủ hơn (hiện đang mỏng)

Thiết kế các trạng thái sau, mỗi trạng thái một mockup:

1. **Idle**: đang bám tab BM nào, quota hôm nay, nút "Mở side panel".
2. **Đang chạy**: tên flow, tiến độ ngắn (bước 3/8), nút **Kill-switch** nổi bật.
3. **Chờ bạn xác nhận**: báo có confirm đang chờ ở side panel, nút "Mở side panel để xác nhận" (không confirm trong popup).
4. **Không có tab BM** / **ngoài vùng hỗ trợ** (login, checkpoint, 2FA).
5. **Emergency stop**: đỏ, giải thích ngắn, không có nút "thử lại".

### C. Options — làm đầy đủ hơn

Dùng layout desktop có sidebar điều hướng bên trái. Các trang:

1. **Pacing & limit**: delay nền, jitter, limit ghi/ngày theo loại BM, curfew 0h–6h. Mọi giá trị có ngưỡng an toàn tối thiểu, ô nhập cho thấy giới hạn và cảnh báo khi chạm ngưỡng.
2. **Audit log**: bảng lọc theo ngày/flow/kết quả/runId, xem chi tiết một record (step, kết quả, trích đoạn verify), export CSV/JSONL.
3. **Ngôn ngữ & giao diện**: vi/en, light/dark.
4. **Devtest**: cờ bật devtest, `logDetail` (bật thì audit mới lưu ID chi tiết, kèm cảnh báo riêng tư).
5. **Giới thiệu & giới hạn an toàn**: giải thích ngắn dry-run/assist/full, danh sách vùng đỏ extension không làm, link privacy policy.

### D. Liên kết giữa 3 bề mặt (chưa có trong brief trước)

Vẽ một **sơ đồ luồng điều hướng** (1 trang) và thể hiện trong mockup:

- Popup → Side panel (nút mở), và Popup → Options (link cài đặt).
- Kill-switch ở popup và ở side panel **luôn đồng bộ trạng thái**. Hiện rõ trạng thái "đã dừng" ở cả hai.
- Đổi pacing/limit ở Options thì quota và curfew ở footer side panel cập nhật theo.
- Có confirm đang chờ thì popup hiện chỉ báo, còn confirm thật chỉ ở side panel.
- Audit: kết quả run ở side panel có link "Xem trong Audit log" mở Options đúng record.

### E. Màn bổ sung cho side panel

- **Walk-through lần đầu trên một BM**: hướng dẫn từng bước, user tự bấm 2–3 target đầu trước khi mở Full cho BM đó.
- **Flow config của 2 flow đại diện khác**: Đổi tên TKQC (ghi thường, confirm 1 lớp) và Kiểm kê (chỉ đọc, không confirm).

## 3. Lưu ý giữ nguyên từ brief trước

- Không có UI nào chèn vào trang business.facebook.com.
- Tailwind + DaisyUI, không inline style, light + dark, tiếng Việt là chính.
- Màu gắn với mức rủi ro, không dùng brand Meta.
- Kill-switch luôn thấy được ở popup và side panel.
- Nếu có chỗ mâu thuẫn hoặc mơ hồ (ví dụ Assist không highlight được trong trang), hãy nêu thành câu hỏi hoặc giả định rõ ràng.

## 4. Cách trình bày kết quả

Tổ chức file/trang theo thứ tự: **Design tokens → Sơ đồ liên kết 3 bề mặt → Side panel → Popup → Options**. Mỗi bề mặt một nhóm mockup riêng, có nhãn rõ.
