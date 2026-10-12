---
id: test-plan-eaag-agencies
type: test-plan
status: ready-to-run
created: 2026-10-12
related: [[13-eaag-token-bm-tasks]], [[14-partner-assign-mapping-graphql]], [[15-browser-session-ops-practice]]
---

# Test Plan — Xác minh EAAG token gọi được `POST /act_{id}/agencies`

> **Mục tiêu:** trả lời câu hỏi mở duy nhất còn lại của vòng research token & trình duyệt:
> _Token EAAG trích từ phiên `business.facebook.com` có `POST` được endpoint chỉ định đối tác vào TKQC hay không?_
> Kết quả test quyết định kiến trúc: **EAAG-first** (thành công) hay **GraphQL replay fallback** (thất bại).
>
> Chi phí: ~15–20 phút, 1 lần chạy, có undo. Rủi ro: thấp nếu tuân thủ guardrails ở mục 7.

## 1. Chuẩn bị

| Mục               | Yêu cầu                                                                             | Ghi chú                         |
| ----------------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| Tài khoản FB      | Nick phụ/quen dùng, **bật 2FA**, không dùng nick chính quý                          | Chấp nhận rủi ro checkpoint nhỏ |
| BM nguồn (BM-A)   | Có **1 TKQC test** (không chạy ads thật); càng "cứng" (tuổi cao, verified) càng tốt | Lấy `business_id` BM-A          |
| BM đối tác (BM-B) | BM thứ 2 hợp lệ (của mình hoặc đồng đội tin cậy)                                    | Lấy `business_id` BM-B          |
| Môi trường        | Chrome profile sạch, IP nhà thường dùng, **không VPN đổi vùng**, không antidetect   | Giữ fingerprint khớp phiên thật |
| Tool              | curl (hoặc fetch trong Console) + DevTools                                          | —                               |

Biến dùng xuyên suốt test:

```bash
TOKEN="EAA..."        # trích ở bước 2
BM_A="<business_id_nguon>"
TKQC="<ad_account_id_so>"          # chỉ số id, KHÔNG gồm 'act_'
BM_B="<business_id_doi_tac>"
API="https://graph.facebook.com/v26.0"
```

## 2. Bước 1 — Trích token EAAG

Đăng nhập tab `business.facebook.com`, thử theo thứ tự (chi tiết file 13 §A):

1. **Cách chính (kiểm chứng 09/2026):** mở tab mới gọi bootloader endpoint rồi search `access_token` trong response:
   ```
   https://business.facebook.com/ajax/bootloader-endpoint/?modules=AdsCanvasComposerDialog.react&__a=1
   ```
   Regex: `"access_token":"(EAA[A-Za-z0-9]+)"`
2. **Cách phụ:** view-source `https://business.facebook.com/business_locations` → search `EAA`.
3. **Cách 3:** DevTools Console: `window.require("WebApiApplication").getAccessToken()` (có thể undefined tùy phiên bản trang).

Kiểm tra token sống:

```bash
curl -s "$API/me?access_token=$TOKEN"
# Kỳ vọng: 200 {"id":..., "name":...} — nếu lỗi 190/463/467 → trích lại
```

## 3. Bước 2 — Sanity check quyền đọc

```bash
curl -s "$API/$BM_A?fields=id,name,verification_status&access_token=$TOKEN"
curl -s "$API/$BM_A/owned_ad_accounts?fields=id,name,account_status&access_token=$TOKEN"
```

- **200 cả hai** → token đủ quyền đọc BM → qua bước 3.
- **Lỗi permission (code 10 / 200)** ngay từ lúc đọc → token EAAG thiếu scope BM → **dừng test, ghi nhận "FAIL-READ"**, chuyển hướng GraphQL replay (file 14 §B).

## 4. Bước 3 — Snapshot trạng thái đối tác hiện tại

```bash
curl -s "$API/act_$TKQC/agencies?access_token=$TOKEN"
```

Ghi lại danh sách (thường rỗng). Đây là baseline để đối chiếu sau POST.

## 5. Bước 4 — POST chỉ định đối tác (quyền THẤP nhất trước)

```bash
curl -s -X POST "$API/act_$TKQC/agencies" \
  -d "business=$BM_B" \
  -d 'permitted_tasks=["ADVERTISE","ANALYZE"]' \
  -d "access_token=$TOKEN"
```

Diễn giải kết quả:

| Response                   | Ý nghĩa                             | Hành động                                                |
| -------------------------- | ----------------------------------- | -------------------------------------------------------- |
| `{"success": true}`        | ✅ **EAAG gọi được /agencies**      | Sang bước 5 verify                                       |
| code 10 / 200 (permission) | EAAG không đủ scope cho write này   | Ghi "FAIL-WRITE", chuyển GraphQL replay                  |
| code 190 sub 463/467       | Token hết hạn                       | Trích lại token, thử 1 lần nữa                           |
| code 368                   | Anti-abuse chặn thao tác phân quyền | DỪNG test, thử lại sau 24h bằng BM cứng hơn              |
| code 459 / 464             | **CHECKPOINT**                      | **DỪNG TOÀN BỘ**, không retry, xử lý checkpoint thủ công |
| code 17 / 613 / 80004      | Rate limit                          | Dừng 30–60 phút                                          |

## 6. Bước 5 — Verify 3 chiều

```bash
# 5a. API — phải thấy BM_B với đúng permitted_tasks
curl -s "$API/act_$TKQC/agencies?access_token=$TOKEN"

# 5b. Phía BM-B đã nhìn thấy TKQC chưa
curl -s "$API/$BM_B/client_ad_accounts?fields=id,name&access_token=$TOKEN"
```

- **5c. UI:** vào Business Settings → Ad Accounts → chọn TKQC → tab **Partners/Đối tác** → xác nhận BM-B hiển thị đúng tên, quyền tương đương "Quản lý chiến dịch" (ADVERTISE+ANALYZE — mapping file 14 §A).

## 7. Bước 6 — Undo và verify sạch

```bash
curl -s -X DELETE "$API/act_$TKQC/agencies" \
  -d "business=$BM_B" \
  -d "access_token=$TOKEN"
# Kỳ vọng: {"success": true} → GET lại /agencies = rỗng, UI sạch
```

## 8. Bước 7 (tùy chọn, nâng dần — chỉ khi bước 4–6 PASS)

Thử từng mục, mỗi mục cách nhau ≥ 1 phút:

1. POST lại với `permitted_tasks=["MANAGE"]` (toàn quyền) → verify → DELETE.
2. Cùng pattern trên Pixel/Dataset: `POST /{pixel_id}/agencies` (task: ADVERTISE/ANALYZE — file 14).
3. Gán nhân viên: `POST /act_$TKQC/assigned_users` `{user, business, tasks}` (lưu ý anti-abuse 368 mạnh hơn — dừng ngay nếu gặp).

## 7. Guardrails bắt buộc trong suốt test

- Mỗi call cách nhau **≥ 5–10 giây**; tổng quá trình test **≤ 15 request**, không chạy vòng lặp.
- Không test trên TKQC đang chạy quảng cáo; không test từ IP/VPN đổi vùng.
- Gặp **459/464 (checkpoint)** hoặc **368** → dừng ngay, không retry; đây là tín hiệu Meta đã để ý.
- Log mọi response (che token) vào bảng kết quả mục 9.

## 9. Mẫu bảng ghi kết quả

| #   | Bước        | Endpoint            | HTTP | Code/Subcode | Kết quả                            | Thời gian |
| --- | ----------- | ------------------- | ---- | ------------ | ---------------------------------- | --------- |
| 1   | Trích token | bootloader-endpoint |      |              | EAA dấu đầu: `EAAI...` / `EAAG...` |           |
| 2   | me          | GET /me             |      |              |                                    |           |
| ... |             |                     |      |              |                                    |           |

**Thông tin môi trường kèm theo:** tuổi BM-A / đã verify chưa? _; BM-B tuổi? _; IP loại gì? _; token prefix? _

## 10. Kết luận → quyết định kiến trúc

| Kết quả                 | Kết luận                                    | Bước tiếp theo                                                                       |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| PASS (bước 4–6)         | EAAG-first khả thi cho chỉ định đối tác     | Chốt thiết kế feature; guardrails theo file 15 §4                                    |
| FAIL-WRITE (permission) | EAAG thiếu scope write /agencies            | PoC GraphQL replay (file 14 §B: surface `AssignPartnerToAsset`, `^BizKitSettings.*`) |
| FAIL-READ               | Token EAAG không dùng được cho BM endpoints | Đánh giá lại toàn bộ hướng token; cân nhắc GraphQL replay hoặc chờ app review        |
| FAIL-368 / checkpoint   | Anti-abuse chặn cohort này                  | Ghi nhận ngưỡng rủi ro, giảm scope (chỉ read + tác vụ nhẹ), không cố vượt            |
