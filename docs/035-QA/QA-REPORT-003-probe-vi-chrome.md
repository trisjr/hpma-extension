---
id: QA-REPORT-003
type: qa-report
status: draft
created: 2026-10-14
related: [ROADMAP-001, PRD-001, SPEC-ENG-001, PLAN-R1]
---

# QA-REPORT-003 — Probe thực địa, locale `vi`, Chrome

Người đo: anh (14/10/2026). Phiên bản: v0.6.0 (build local). BM thường, trang `/latest/settings/partners`. Mỗi màn 20 mẫu, **chọn màn bằng tay** (`manual: true`), nên tự nhận diện chưa được kiểm chứng.

## Kết quả theo màn

| Màn             | Hit-rate  | Ghi chú                                                                                                                                                        |
| --------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`          | 100%      | `nav.users` t1, `nav.partners` t1, `partners.add` t3, `partners.search` t4                                                                                     |
| `menu`          | 100%      | `partners.give` t1                                                                                                                                             |
| `dialog-bm`     | 100%      | `dialog.bmId` t1, `dialog.next` t3                                                                                                                             |
| `dialog-assets` | 100%      | `dialog.assetTypeAdAccounts` t3, `dialog.assetSearch` t4                                                                                                       |
| `dialog-access` | **71,4%** | 5/7 key bắt buộc. **Trượt:** `dialog.accessPartial` 0/20, `dialog.cancel` 0/20. Trúng: 4 `dialog.task*` (t1), `dialog.assign` t3, `dialog.close` t3 (dự phòng) |
| `detail`        | chưa đo   | `partner.assign`, `partner.assignedAssets`                                                                                                                     |

## Kết luận

- **Chưa qua gate R1.** Còn thiếu: màn `detail` và locale `en`.
- **Nguyên nhân hai key trượt (ảnh chụp bước quyền, 14/10):** UI hiện tại không có lựa chọn "Quyền truy cập một phần" (chỉ còn tiêu đề và các công tắc), và nút phụ ở bước này tên "Quay lại", không phải "Hủy". Không phải nhãn sai: flow dùng `tryResolve` cho `accessPartial` và `cancel ?? close` cho dọn dẹp (`dialog.close` trúng 20/20).
- **Đã sửa probe:** `dialog.accessPartial` và `dialog.cancel` thành key dự phòng (không tính hit-rate); `dialog.cancel` hạ về `verified: false`. Với báo cáo này, `dialog-access` tính lại là 5/5 = 100%.
- Chưa rõ "Quay lại" đóng hộp thoại hay lùi một bước, nên chưa thêm vào nhãn `dialog.cancel`.
- Bốn công tắc `dialog.task*` trúng tầng 1, nên PRD §4.3 (blocker `dialog.accessPartial`, `dialog.taskManage*`) chỉ còn chờ xác nhận lại ở `en`.
- `nav.users` trúng 20/20 tầng 1 trên `vi`: đủ cơ sở lật `verified`.

## Việc tiếp theo

- Đo `detail`, rồi lặp cả 6 màn với locale `en`.
- Đo lại một lần có tự nhận diện (không chọn tay) để kiểm chứng `detectStage`.
