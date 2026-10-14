---
id: QA-REPORT-003
type: qa-report
status: draft
created: 2026-10-14
related: [ROADMAP-001, PRD-001, SPEC-ENG-001, PLAN-R1]
---

# QA-REPORT-003 — Probe thực địa, locale `vi` và `en`, Chrome

Người đo: anh (14/10/2026). Phiên bản: v0.6.0 (build local). BM thường, trang `/latest/settings/partners`. Mỗi màn 20 mẫu, **chọn màn bằng tay** (`manual: true`), nên tự nhận diện chưa được kiểm chứng. Đo `vi` trước, `en` sau (lúc đó đã có bản sửa key dự phòng).

## Kết quả theo màn

| Màn             | `vi`                                                                             | `en`                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`          | 100%: `nav.users` t1, `nav.partners` t1, `partners.add` t3, `partners.search` t4 | 100%: giống `vi` (cùng tầng thắng)                                                                                                                 |
| `menu`          | 100%: `partners.give` t1                                                         | 100%: `partners.give` t1                                                                                                                           |
| `dialog-bm`     | 100%: `dialog.bmId` t1, `dialog.next` t3                                         | 100%: `dialog.bmId` **t4**, `dialog.next` t3                                                                                                       |
| `dialog-assets` | 100%: `dialog.assetTypeAdAccounts` t3, `dialog.assetSearch` t4                   | 100%: giống `vi`                                                                                                                                   |
| `dialog-access` | 71,4% lúc đo (5/7), tính lại 100% sau khi sửa key dự phòng                       | 100%: 4 `dialog.task*` t1, `dialog.assign` t3                                                                                                      |
| `detail`        | 100% sau bản sửa `duplicatesOk` (anh báo, chưa có JSON)                          | lần 1: **50%** (`partner.assign` 0/20). Sau bản sửa: **100%**, `partner.assign` t3, `partner.assignedAssets` t1; **tự nhận diện** (không `manual`) |

Tầng: t1 = nhãn khớp chính xác, t3 = nhãn khớp lỏng, t4 = đường lui cấu trúc.

## Kết luận

- **Probe 6 màn đạt 100% ở cả `vi` và `en` trên Chrome** (sau bản sửa `duplicatesOk`). Con số `detail` sau khi sửa do anh báo, chưa có JSON; các màn còn lại có JSON. Gate R1 còn: kiểm chứng tự nhận diện (mọi lần đo đều chọn tay), thử tay kill-switch, dry-run lặp lại.
- **Lỗi thật ở `partner.assign` (`en`, màn `detail`):** partner đang xem có 0 tài sản được gán nên trang hiện **hai** nút "Assign assets" cùng lúc (nút ở đầu trang và nút trong trạng thái rỗng "No assets assigned"). Locator strict-mode coi hai ứng viên là mơ hồ ở mọi tầng nên trả `ambiguous` (không phải nhãn sai: nhãn `Assign assets` khớp). Flow thật cũng dùng `SELECTORS.partnerAssign` (`partnerAssign.ts:348`) nên sẽ dừng với `ERR_LOCATE_AMBIGUOUS` trên partner có sẵn nhưng chưa có tài sản. Fail-closed (an toàn), nhưng là trường hợp phổ biến. Lần chạy thật 14/10 không gặp vì partner khi đó đã có tài sản hoặc đi đường partner mới.
- **Nguyên nhân hai key trượt ở `dialog-access` (`vi`):** UI hiện tại không có lựa chọn "Quyền truy cập một phần" (chỉ còn tiêu đề và các công tắc), và nút phụ ở bước này tên "Quay lại", không phải "Hủy". Không phải nhãn sai: flow dùng `tryResolve` cho `accessPartial` và `cancel ?? close` cho dọn dẹp (`dialog.close` trúng 20/20). `en` trượt giống hệt hai key này (`accessPartial` 0/20, `cancel` 0/20), nên cùng nguyên nhân.
- **Đã sửa probe:** `dialog.accessPartial` và `dialog.cancel` thành key dự phòng (không tính hit-rate); `dialog.cancel` hạ về `verified: false`.
- Chưa rõ "Quay lại" đóng hộp thoại hay lùi một bước, nên chưa thêm vào nhãn `dialog.cancel`. Tên nút `en` ở bước này chưa biết.
- Bốn công tắc `dialog.task*` trúng tầng 1 ở cả hai locale: điều kiện chặn viết ở PRD §4.3 (`dialog.taskManage*`) đã có bằng chứng.
- **Nhãn `en` yếu ở ba key, đang sống nhờ đường lui cấu trúc (t4):** `dialog.bmId` (`vi` t1, `en` t4), `dialog.assetSearch` (t4 cả hai), `partners.search` (t4 cả hai). Hit-rate vẫn 100% nhưng nếu Meta đổi cấu trúc thì sẽ gãy trước; nên xem lại nhãn khi có DOM.
- `nav.users` trúng 20/20 tầng 1 ở cả hai locale; đã lật `verified: true`.

- **Đã sửa `partner.assign`:** cờ `duplicatesOk` (opt-in, chỉ cho selector này) lấy nút đầu theo thứ tự DOM; reviewer bảo mật (Medium) chỉ ra nút đó chưa gắn với đúng partner, nên flow giờ chỉ bấm nút nằm trong chi tiết đã xác minh bằng BM ID, ngoài ra dừng `ERR_LOCATE_AMBIGUOUS` (có test cả hai chiều).
- **Chưa xác nhận trên BM thật (rủi ro còn lại):** `openExistingAssets` tìm đúng một ô tìm kiếm trong chi tiết partner (`partnerAssign.ts` quanh dòng 301). Trạng thái rỗng "No assets assigned" trong ảnh không thấy ô tìm kiếm, nên có thể flow vẫn dừng `ERR_LOCATE_AMBIGUOUS 'partner.assetsSearch'` trên partner có sẵn nhưng 0 tài sản, trước cả bước bấm nút. Fail-closed. Cần chạy Dry-run thật trên partner 0 tài sản; nếu đúng thì cần xử lý "không có ô tìm kiếm và không có hàng" thành "missing".

## Việc tiếp theo

- Dán JSON `detail` `vi` sau bản sửa; lật `verified` cho `partner.assignedAssets` nếu `vi` cũng trúng tầng 1 (`en` đã trúng tầng 1, 20/20).
- `detectStage` đã được kiểm chứng thực địa cho màn `detail` (`en`, không chọn tay). Các màn còn lại vẫn chỉ đo chọn tay.
- Đo lại một lần có tự nhận diện (không chọn tay) để kiểm chứng `detectStage`.
- Xem lại nhãn `dialog.bmId` (`en`), `dialog.assetSearch`, `partners.search` khi có DOM (placeholder/aria-label thật).
