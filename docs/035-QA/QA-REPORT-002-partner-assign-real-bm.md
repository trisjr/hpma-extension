---
id: QA-REPORT-002
type: qa-report
status: draft
created: 2026-10-14
related: [ROADMAP-001, PRD-001, SPEC-ENG-001]
---

# QA-REPORT-002 — Chạy thử flow "Gán partner vào TKQC" trên BM thật

Người thử: anh (thử tay, 14/10/2026). Phiên bản: v0.5.0.

## Phạm vi đã kiểm chứng

- Mode: Dry-run và Assist.
- Trường hợp: gán partner **mới** và partner **có sẵn**.
- Môi trường: **1 BM thường** thật, locale giao diện Meta Business **`vi`**. Số TKQC và trình duyệt chưa ghi nhận.
- Kết quả: thành công.

## Chưa kiểm chứng

- Mode `Full` (vẫn `FULL_LOCKED`).
- Nhiều BM, loại BM khác (ngoài BM thường), locale `en`, Firefox.
- Từng nhãn/selector `dialog.*`, `asset.alreadyAssigned`, `signal.approval`: chưa đối chiếu nên cờ `verified` trong `src/content/engine/labels.ts` chưa đổi.
- Tình huống `pending-approval`, `unverified`, Cancel giữa chừng, mất tab BM.

## Việc tiếp theo

- Đối chiếu nhãn đã chạy đúng rồi chuyển `verified: true`.
- Bổ sung số TKQC và trình duyệt vào báo cáo này.
