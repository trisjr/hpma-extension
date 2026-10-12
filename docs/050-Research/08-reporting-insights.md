# 08 — Tự động hóa Reporting, Insights & Billing (Meta Business Manager)

> Nghiên cứu phục vụ thiết kế browser extension tự động hóa tác vụ Facebook Business Manager.
> Thời điểm nghiên cứu: tháng 10/2026. Nguồn chính: tài liệu chính thức Meta for Developers (hiện được Meta tái cấu trúc sang nhánh `developers.facebook.com/documentation/ads-commerce/...`) + Meta Business Help Centre.

## 1. Tổng quan

Mảng này gồm 3 cụm công việc mà người dùng BM/Ads Manager làm thủ công hằng ngày:

1. **Kéo báo cáo quảng cáo (Ads Insights)**: xuất báo cáo theo lịch (hằng giờ/ngày/tuần), gộp dữ liệu nhiều ad account, đẩy ra CSV / Google Sheets / dashboard của riêng user.
2. **Cảnh báo realtime**: chi tiêu vượt ngưỡng, ad bị reject / blocked delivery, tài khoản quảng cáo bị vô hiệu hóa, thanh toán bị lỗi, sát payment threshold.
3. **Theo dõi billing**: balance (số tiền đang nợ), spend_cap vs amount_spent, trạng thái payment method, prepaid/prepay balance, invoice hàng tháng (tài khoản trả sau / monthly invoicing).

**Phát hiện nền tảng quan trọng nhất (10/2026):**

- **Phiên bản API hiện tại là `v26.0`** (phát hành 29/7/2026). `v24.0` (8/10/2025) đã **hết hạn 6/10/2026 — vừa mới bị deprecate**; `v25.0` (18/2/2026) còn dùng được. Có cơ chế **auto-version upgrade**: call ở version đã deprecate mà endpoint không thay đổi sẽ được Meta tự nâng sang version kế tiếp (kèm header `X-Ad-Api-Version-Warning`), nhưng endpoint bị ảnh hưởng sẽ fail. Khuyến nghị hardcode `v26.0` và theo dõi header cảnh báo.
- **Access tier đổi tên**: “Standard Access” → **Limited Access**, “Advanced Access” → **Full Access** (ngưỡng lên Full Access giảm từ 1.500 xuống 500 Marketing API calls trong 15 ngày). Tier ảnh hưởng trực tiếp rate limit của mọi tác vụ reporting.
- **Async insights có thay đổi mới ở v25.0**: job async fail giờ trả về đầy đủ `error_code`, `error_message`, `error_subcode`, `error_user_title`, `error_user_msg` trên `GET /{ad-report-run-id}`.
- **Ads Webhooks mới (2025–2026)**: Meta hiện có hệ thống webhook trên object `ad_account`, gồm `effective_status`, `subscriptions` (INSIGHTS_UPDATED — metric vượt ngưỡng do user đặt), `with_issues_ad_objects`, `in_process_ad_objects`, `creative_fatigue`, `ad_recommendations`. Đây là thay thế chuẩn cho việc poll định kỳ để làm cảnh báo reject/vấn đề delivery — Meta khuyến cáo không gọi `/effective_status` hàng loạt trên thời gian cố định nữa mà dùng webhook.
- **Giới hạn reach cũ**: từ 10/6/2025, `reach` (+`frequency`, `cpp`) không còn trả về cho query sync có breakdown + `start_date` cũ hơn 13 tháng; muốn lấy phải dùng async job (tối đa ~10 request/ngày/ad account, theo dõi header `x-Fb-Ads-Insights-Reach-Throttle`).
- **Insights `export_format` vẫn tồn tại** trên edge insights: set `export_format=xls|csv` để Meta tự generate file report async (kèm `export_columns`, `export_name`) — rất hợp cho tính năng “export CSV”.

Bức tranh kiến trúc đề xuất: **Official Marketing API là xương sống** (insights, monitoring fields, webhooks, ad rules); **backend nhỏ + cron** chịu trách nhiệm schedule nặng và nhận webhook (MV3 service worker không phù hợp để giữ cron/webhook listener); **extension** là control plane + UI, cache kết quả, và là “browser automation layer” dự phòng cho những việc Meta không mở API (chủ yếu ở nhóm billing).

## 2. Danh sách tác vụ có thể tự động hóa

| Tác vụ                                                                                                                                      | Cách tự động (Official API / Browser automation / Hybrid)                                                                                                                                                     | Độ khả thi                                                                | Rủi ro & điều kiện                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| Kéo báo cáo ads theo lịch (daily/weekly/monthly): spend, impressions, clicks, CPC/CPM/CPA, conversions, ROAS theo account/campaign/adset/ad | Official API — `GET/POST /act_{id}/insights` + cron                                                                                                                                                           | Cao                                                                       | Cần `ads_read`; chú ý rate limit (`X-FB-Ads-Insights-Throttle`), dữ liệu refresh mỗi ~15 phút, có thể thay đổi tới 28 ngày sau khi được báo                                 |
| Báo cáo breakdown (placement, age/gender, country, hourly, product_id...)                                                                   | Official API — param `breakdowns` / `action_breakdowns`                                                                                                                                                       | Cao                                                                       | Một số cặp breakdown không combine được; tránh breakdown cardinality cao trên phạm vi account + khoảng thời gian dài (lỗi data-per-call, code 100/subcode 1487534)          |
| Async insights jobs cho khoảng dữ liệu lớn / nhiều object                                                                                   | Official API — `POST /{object}/insights` → poll `GET /{report_run_id}` → `GET /{report_run_id}/insights`                                                                                                      | Cao                                                                       | Job có thể mất tới ~1h; `report_run_id` hết hạn sau 30 ngày; từ v25.0 job fail trả error fields mặc định — xử lý cả `Job Failed`                                            |
| Export báo cáo ra CSV/XLS                                                                                                                   | Official API — `export_format=csv                                                                                                                                                                             | xls` trên insights edge (file generate async), hoặc tự convert JSON → CSV | Cao                                                                                                                                                                         | Export async phải poll như async job; hoặc tự map fields |
| Đồng bộ báo cáo lên Google Sheets                                                                                                           | Hybrid — Marketing API lấy data + Google Sheets API (OAuth, `chrome.identity`)                                                                                                                                | Cao                                                                       | Token 2 hệ thống; nên upsert theo key (account+date+campaign) để tránh duplicate khi cron chạy lại                                                                          |
| Dashboard tổng hợp trong extension (biểu đồ spend/ctr/roas nhiều account)                                                                   | Official API + cache local (IndexedDB) + render ở popup/options                                                                                                                                               | Cao                                                                       | Phải dựng cache + job queue để không gọi trùng; mỗi account một timezone riêng                                                                                              |
| Báo cáo tổng hợp NHIỀU ad account của 1 user/BM                                                                                             | Official API — `GET /{business}/owned_ad_accounts` + `/client_ad_accounts`, `GET /me/adaccounts`, lặp insights từng account (gợi ý dùng Batch API) hoặc `GET /{adaccount}/reporting` (Report Builder)         | Cao                                                                       | Rate limit tính theo từng ad account; BM có hàng trăm account thì cần queue + backoff; không gộp currency khác nhau nếu chưa quy đổi                                        |
| Report Builder (dimensions/metrics/sorting/pagination giống UI)                                                                             | Official API — `GET /{ad-account-id}/reporting`, lưu spec ở `/{ad-account-id}/report_specs`                                                                                                                   | Trung bình                                                                | API “semi-documented”, ổn định thấp hơn insights; chỉ nên dùng làm fallback                                                                                                 |
| Snapshot báo cáo so sánh (comparison_time_range)                                                                                            | Official API — param `comparison_time_range` trên `/reporting` hoặc so sánh 2 window bằng insights                                                                                                            | Trung bình                                                                | Ưu tiên tự so sánh phía client (2 khoảng thời gian), ít phụ thuộc API hơn                                                                                                   |
| Cảnh báo realtime: AD BỊ REJECT / blocked / resume delivery                                                                                 | Official API — Webhook `effective_status` (ổn định, thời gian thực) hoặc `with_issues_ad_objects`; fallback poll `GET /{ad-id}?fields=effective_status,review_feedback`                                       | Cao                                                                       | Cần server nhận webhook + HTTPS callback + verify token; `subscribed_apps` cần ad-account ADMIN token; webhook chỉ báo “có thay đổi” — phải poll lại để lấy review_feedback |
| Cảnh báo: metric vượt ngưỡng do user đặt (spend/impressions/conversions vượt `GREATER_THAN/LESS_THAN/IN_RANGE`)                             | Official API — Webhook `subscriptions` với `event_type=INSIGHTS_UPDATED` / `INSIGHTS_MILESTONE_REACHED` trên `POST /act_{id}/subscriptions`                                                                   | Cao                                                                       | Write cần `ads_management` + write access tới ad account; mỗi subscription scope 1 ad account + 1 app                                                                       |
| Cảnh báo: chi tiêu vượt ngưỡng (không cần webhook server)                                                                                   | Official API — **Ad Rules** `POST /act_{id}/adrules_library` (schedule-based hoặc trigger-based), `execution_type=NOTIFICATION_ONLY` (email) hoặc PAUSE/CHANGE_BUDGET; hoặc extension tự poll spend theo cron | Cao                                                                       | Notification của ad rules là **email** (không push vào extension); poll spend nên dùng field `today_spend` cho “ngân sách hôm nay”                                          |
| Cảnh báo: TÀI KHOẢN bị vô hiệu hóa (account_status=DISABLED)                                                                                | Hybrid — poll `GET /{business}/owned_ad_accounts?fields=account_status,disable_reason` theo cron (không có webhook cho account status)                                                                        | Cao                                                                       | Phải tự poll (15–60 phút/lần là đủ); `disable_reason` cho biết lý do (rủi ro thanh toán, vi phạm chính sách...) nhưng không nói được payment method cụ thể                  |
| Cảnh báo: payment method lỗi / thẻ hết hạn                                                                                                  | Official API (gián tiếp) — đọc `expired_funding_source_details`, so sánh `funding_source_details.EXPIRATION`; phát hiện khi account chuyển `account_status=2` với `disable_reason=3 (RISK_PAYMENT)`           | Trung bình                                                                | Meta không có field “payment_declined” trực tiếp; thường nhận ra qua account UNSETTLED/DISABLED hoặc ads ngừng delivery; nhận “soft” qua balance tăng cao bất thường        |
| Cảnh báo: sát/nhận biết billing threshold (tài khoản trả sau, auto billing)                                                                 | Official API — đọc `balance` (bill amount due) so với ngưỡng tự đặt; Meta không expose field payment threshold hiện tại                                                                                       | Trung bình                                                                | Payment threshold thật chỉ xem/chỉnh trong UI (Ads Manager > Billing & payments > Payment settings > “When you'll pay”); ngoài API suy luận bằng pattern balance/charge     |
| Theo dõi balance/threshold tài khoản trả sau (postpaid)                                                                                     | Official API — `GET /act_{id}?fields=balance,amount_spent,spend_cap,currency,is_prepay_account,business` định kỳ                                                                                              | Cao                                                                       | `balance` = số tiền đang nợ chưa charge; `amount_spent` = tổng spent so với spend_cap; đơn vị là minor unit (cent)                                                          |
| Theo dõi spend_cap & đổi spend cap                                                                                                          | Official API — đọc/ghi `spend_cap` trên ad account                                                                                                                                                            | Cao                                                                       | Đổi spend cap chỉ **10 lần/ngày** (error 17/subcode 1885172); giá trị minor unit                                                                                            |
| Theo dõi daily spending limit (Meta-enforced)                                                                                               | Không có API — chỉ UI (Account overview / Billing)                                                                                                                                                            | Thấp                                                                      | Daily spending limit là giới hạn Meta set theo lịch sử tài khoản, không public qua API                                                                                      |
| Kiểm tra tài khoản prepay: available funds/prepaid balance                                                                                  | Browser automation (Hybrid) — UI Billing hub (“Add funds” screen hiển thị daily top-up limit & stored balance limit)                                                                                          | Trung bình                                                                | Không có API đọc số dư prepaid; automation bấm vào flow “Add funds” có rủi ro phát sinh giao dịch thật — chỉ nên đọc hiển thị, không click “Add” cuối cùng                  |
| Kéo invoice hàng tháng (tài khoản monthly invoicing / trả sau qua credit line)                                                              | Official API — `GET /{business-id}/business_invoices` (filter start/end, `type=INV                                                                                                                            | CM                                                                        | DM                                                                                                                                                                          | PRO_FORMA`)                                              | Trung bình | Chỉ cho business có monthly invoicing; trả node OmegaCustomerTrx (số HĐ, ngày kỳ, trạng thái); tài khoản thường không có |
| Kéo biên lai/receipt từng giao dịch (tài khoản thường)                                                                                      | Browser automation — Billing & payments > Transaction history > Download                                                                                                                                      | Thấp                                                                      | Không có API receipt; UI flow nặng, target chỉ read-only download                                                                                                           |
| Quản lý hạn mức extended credit (agency credit lines)                                                                                       | Official API (1 phần) — `GET /{business}/extendedcredits` đọc credit line; việc phân bổ hạn mức chủ yếu qua UI/partner                                                                                        | Trung bình                                                                | Write operations giới hạn cho đối tác (WhatsApp credit) — đọc OK                                                                                                            |
| Đổi payment threshold                                                                                                                       | **Chỉ UI BM/Ads Manager** (Ads Manager > Billing & payments > Payment settings)                                                                                                                               | Thấp (qua browser automation)                                             | Meta đã xác nhận trong Help Centre là thao tác trên UI; tự động hóa có rủi ro phát sinh việc chi tiền thật, chỉ nên đặt ở mức “assist” (deep link + hướng dẫn)              |
| Thêm/gỡ/đổi payment method (thẻ, PayPal, direct debit, country-specific manual methods)                                                     | **Chỉ UI BM**                                                                                                                                                                                                 | Thấp                                                                      | Không có API quản lý thẻ cho advertiser thường; tuyệt đối không tự động nhập thẻ (PCI/TOS risk)                                                                             |
| Nạp tiền manual (“Pay now”), dispute charge, khiếu nại thanh toán                                                                           | **Chỉ UI BM**                                                                                                                                                                                                 | Thấp                                                                      | Giao dịch tài chính — không tự động                                                                                                                                         |
| Đổi currency / timezone của ad account                                                                                                      | **Chỉ UI** (hoặc phải tạo account mới)                                                                                                                                                                        | Thấp                                                                      | API không cho đổi sau tạo                                                                                                                                                   |
| Cập nhật tax/VAT ID                                                                                                                         | 1 phần API (`tax_id` field trên Ad Account) + UI cho market đặc thù                                                                                                                                           | Trung bình                                                                | Tùy quốc gia là UI-only; Market-based; cần quyền MANAGE trên account                                                                                                        |
| Khiếu nại tài khoản bị disable (appeal)                                                                                                     | **Chỉ UI** (Request review trong ads manager/account quality)                                                                                                                                                 | Thấp                                                                      | Browser automation có thể hỗ trợ mở form/điền nháp, nhưng user phải submit                                                                                                  |
| Lấy activity log tài khoản (ai sửa gì)                                                                                                      | Official API — `GET /act_{id}/activities` (AdActivity)                                                                                                                                                        | Cao                                                                       | Nên dùng để audit trước khi báo cáo “ai chỉnh sửa”                                                                                                                          |

## 3. Chi tiết kỹ thuật

### 3.1 Kiến trúc chung & auth

- **App + permissions**: Meta app mode Live, product “Marketing API”. Quyền cần: `ads_read` (đọc insights + node ad account), `ads_management` (tạo ad rules, subscriptions webhook, pause/budget actions), `business_management` (business-level edges: `owned_ad_accounts`, `business_invoices`, `extendedcredits`). App Review cho Full Access (ngưỡng: ≥500 Marketing API calls trong 15 ngày).
- **Token**: System user / long-lived user token (≈60 ngày). Extension nên có cơ chế nhắc refresh token; webhook `subscribed_apps` bắt buộc **ad account ADMIN token**.
- **Versioning**: hardcode `https://graph.facebook.com/v26.0/...`; call không kèm version bị reject (Marketing API không chấp nhận unversioned). Update ngay khi v27 ra mắt (chu kỳ ~4 tháng), kiểm tra changelog trước khi nâng — theo dõi header `X-Ad-Api-Version-Warning`.

### 3.2 Insights API — endpoint & tham số chính

Các edge insights gắn trên mọi level: `/{ad-account-id}/insights`, `/{campaign-id}/insights`, `/{ad-set-id}/insights`, `/{ad-id}/insights` (lợi ích: dedupe metric unique ở level account, vd `unique_clicks`).

Param quan trọng (đối chiếu trang reference ad-account/insights):

- `fields`: `spend, impressions, clicks, cpc, cpm, cpp, ctr, reach, frequency, actions, action_values, conversions, cost_per_conversion, purchase_roas, cost_per_action_type, unique_clicks, social_spend, today_spend, account_id, campaign_id, adset_id, ad_id, account_name, campaign_name...`
- `level`: `ad | adset | campaign | account`
- `time_range={since:YYYY-MM-DD,until:YYYY-MM-DD}` hoặc `date_preset` (`today,yesterday,last_7d,last_28d...`; `maximum` trả tối đa 37 tháng; `lifetime` đã bỏ).
- `time_increment`: `all_days` | `monthly` | số ngày 1–90.
- `breakdowns` / `action_breakdowns` (vd `publisher_platform, platform_position, device_platform, age, gender, country, region, dma, product_id, hourly_stats_aggregated_by_advertiser_time_zone...`; chú ý không phải cặp nào cũng combine được).
- `action_attribution_windows` (default `["7d_click","1d_view"]`), `action_report_time` (`impression|conversion|mixed|lifetime` — quyết định conversion được tính vào ngày nào).
- `filtering` (array of `{field,operator,value}`, operator `IN` nên dùng thay `CONTAIN` khi cần summary đúng), `sort`, `limit`, `summary` / `default_summary`.
- `export_format=csv|xls` + `export_columns` + `export_name` → Meta generate file async (poll giống async job) hoặc download ở bước fetch kết quả.

**Tính ổn định dữ liệu (rất quan trọng cho cron báo cáo):** Insights refresh mỗi ~15 phút; số liệu có thể thay đổi đến 28 ngày sau khi được báo (attribution, dedup, gian lận post-processing); metric action vẫn nhích vài ngày sau khi ad kết thúc. ⇒ Hệ quả: cron nên “re-fetch lùi” (backfill N ngày), không “khóa” số liệu hôm qua một lần duy nhất; lưu `fetched_at` để biết độ tươi của dữ liệu.

### 3.3 Async insights jobs (cho báo cáo lớn)

Flow chuẩn (đối chiếu docs Best Practices):

```
POST https://graph.facebook.com/v26.0/act_<ID>/insights
     fields=...,level=...,time_range=...,breakdowns=...
→ { "report_run_id": "<ID>" }

GET  https://graph.facebook.com/v26.0/<REPORT_RUN_ID>
→ poll async_status ("Job Not Started|Job Started|Job Running|Job Completed|Job Failed")
  & async_percent_completion; từ v25.0 fail trả error_code/error_message/error_subcode/error_user_title/error_user_msg

GET  https://graph.facebook.com/v26.0/<REPORT_RUN_ID>/insights
→ dữ liệu kết quả (có paging)
```

Lưu ý: job có thể mất tới 1 giờ (gồm cả retry), `report_run_id` hết hạn sau 30 ngày; quản lý queue nhiều job theo ad account, backoff dựa trên header throttle.

### 3.4 Rate limits (ảnh hưởng trực tiếp cron đa account)

- Marketing API có hệ thống rate limit riêng (không cộng vào Graph API chung). **Ad account level**: read=1 điểm, write=3 điểm; dev tier max 60 điểm (block 300s), Full Access max 9.000 điểm (block 60s). Error: 17/subcode 2446079 hoặc 613/subcode 1487742.
- **BUC “ads_insights” per ad account / giờ**: `(190.000 nếu Full | 600 nếu dev) + 400 × số active ads − 0.001 × số user errors`. Error 80000/80003/80004/80014.
- **Insights app/account throttle header**: `X-FB-Ads-Insights-Throttle: {"app_id_util_pct":..., "acc_id_util_pct":..., "ads_api_access_tier":...}` — **bắt buộc đọc header này mỗi response để pacing**; lỗi code 4 (subcode 1504022/1504039) khi vượt. Global throttling khi load chung cao (error 4/subcode 1504022) ⇒ retry với jitter.
- Reach-throttle: `x-Fb-Ads-Insights-Reach-Throttle` cho truy vấn reach > 13 tháng có breakdown (~10 req/ngày/account qua async).
- **Best practices từ Meta**: ưu tiên `date_preset` hơn time_range custom; sync trước, async khi timeout; query metric unique riêng; giới hạn date range / số id; dùng Batch API cho nhiều sync call nhỏ; trải rải (pacing) query theo timezone account; tránh breakdown cardinality cao trên lifetime.
- Write-API liên quan (rules/subscriptions): QPS mutation 100 req/s/app/account; cùng object chỉ ~1 edit/30s (subcode 4841018); đổi spend_cap tối đa 10 lần/ngày/ad account.

### 3.5 Cảnh báo realtime: Webhooks vs Poll vs Ad Rules

**Ads Webhooks (object `ad_account`) — setup chung:**

```
# 1) Đăng ký webhook field (app token)
POST https://graph.facebook.com/<APP_ID>/subscriptions
     object=ad_account
     callback_url=<HTTPS_URL>
     fields=subscriptions,effective_status,with_issues_ad_objects
     verify_token=<token>
# Callback nhận GET verification, echo hub.challenge

# 2) Kết nối từng ad account (AD ACCOUNT ADMIN token)
POST https://graph.facebook.com/act_<ID>/subscribed_apps
```

- `effective_status` (payload in `field_changed` + `changed_fields=["effective_status"]`): báo ad **bị reject / delivery block / resume**, thay đổi cascade từ campaign → ad. Sau khi nhận: `GET /<OBJECT_ID>?fields=effective_status,configured_status,review_feedback,creative{...},adset{...},campaign{...}` để lấy lý do reject (`review_feedback`).
- `with_issues_ad_objects`: payload có `id, level (CAMPAIGN|AD_SET|AD|CREATIVE), error_code, error_summary, error_message`.
- `subscriptions` (`POST /act_{id}/subscriptions`, read `ads_read|ads_management`, write `ads_management`): 4 event types — `OBJECT_CREATED`, `OBJECT_UPDATED` (field `name/objective/billing_event/daily_budget/spend_cap/...`), **`INSIGHTS_UPDATED` với condition `{field: spent/impressions/... , operator: GREATER_THAN|LESS_THAN|IN_RANGE|NOT_IN_RANGE, value}` (đơn vị minor-unit)**, `INSIGHTS_MILESTONE_REACHED`. Đây là cơ chế **ngưỡng chi tiêu realtime** mạnh nhất hiện nay — đẩy notification cho app thay vì cron poll 5 phút/lần.
- Còn `in_process_ad_objects` (object xuất bản xong), `creative_fatigue`, `ad_recommendations`.

Hạn chế cho extension thuần: webhook **bắt buộc** HTTPS callback URL + server verify token ⇒ cần backend nhỏ (Relay → WebSocket/SSE/Firebase vào extension) hoặc ít nhất 1 thành phần trung gian; extension MV3 thuần không nhận webhook trực tiếp.

**Poll-based (không cần backend) cho billing/status:** cron 15–60 phút:

```
GET /v26.0/act_<ID>?fields=name,balance,amount_spent,spend_cap,currency,
  account_status,disable_reason,funding_source_details,expired_funding_source_details,
  is_prepay_account,business,timezone_id,timezone_name
GET /v26.0/act_<ID>/insights?fields=spend,today_spend&date_preset=today&level=account
```

- `account_status`: 1 ACTIVE, 2 DISABLED, 3 UNSETTLED, 7 PENDING_RISK_REVIEW, 8 PENDING_SETTLEMENT, 9 IN_GRACE_PERIOD, 100 PENDING_CLOSURE, 101 CLOSED.
- `disable_reason`: 1 ADS_INTEGRITY_POLICY, 2 ADS_IP_REVIEW, **3 RISK_PAYMENT (thanh toán)**, 6 BUSINESS_INTEGRITY_RAR, 11 BUSINESS_MANAGER_INTEGRITY_POLICY, 15 COMPROMISED_AD_ACCOUNT...
- `funding_source_details` yêu cầu caller có **MANAGE** permission trên account; `TYPE`: 1 CREDIT_CARD, 4 FACEBOOK_EXTENDED_CREDIT, 6 INVOICE, 17 DIRECT_DEBIT, 13 PAYPAL_BILLING_AGREEMENT, 20 STORED_BALANCE (prepay).
- Cảnh báo “payment method lỗi” nên được suy diễn: `expired_funding_source_details != null` / sắp hết hạn (`EXPIRATION`), `account_status ∈ {3,8}` balance tăng cao bất thường, ads chuyển effective_status về `WITH_ISSUES`, hoặc `disable_reason=3`. Nên combine nhiều tín hiệu trước khi báo “lỗi thanh toán” để tránh false alarm.

**Ad Rules (Meta-managed, không cần server của user):** `POST /act_{id}/adrules_library` với `name`, `evaluation_spec` (điều kiện trên insights/metadata, schedule-based hoặc trigger-based) + `execution_spec` (`execution_type`: PAUSE / UNPAUSE / **NOTIFICATION_ONLY (email)** / CHANGE_BUDGET / CHANGE_BID / REBALANCE_BUDGET). Phù hợp: rule “spend hôm nay > X → email + pause”, vận hành kể cả khi user tắt máy/extension. Nhược: notification ra email Admins của account, không tích hợp UI extension; rule count/rate của Rules engine giới hạn theo account.

### 3.6 Cơ chế schedule (cron) với extension MV3

- Trong extension thuần: `chrome.alarms` (MV3 background service worker) với chu kỳ ≥1 phút; lưu ý service worker ngủ — alarm đánh thức SW rồi SW chết lại sau ~30s idle ⇒ tác vụ nặng (queue nhiều account + async waiting) nên chia thành step nhỏ, lưu state ở `chrome.storage.local`/IndexedDB. Thực tế nên đặt ≥15 phút/lần (trùng nhịp refresh insights 15 phút) để tiết kiệm rate limit.
- Backend cron (khuyến nghị cho bản production): cần thiết cho webhook receiver + chạy job nặng + Google Sheets sync daemon; extension chỉ là console (bật/tắt job, xem log, push noti qua WebSocket).
- Timezone: insights trả theo **timezone của ad account** — khi cron “báo cáo 8h sáng hằng ngày”, cần convert theo từng account (`timezone_id/timezone_name`, các account khác nhau không đồng bộ), và report “hôm nay” dùng `today_spend`.

### 3.7 Xuất CSV / Google Sheets / Dashboard

- **CSV**: (a) `export_format=csv|xls` ngay trên insights call → poll kết quả file (đơn giản nhất, ít logic); hoặc (b) tự build từ JSON paginate (chủ động format). Ở extension, dùng `chrome.downloads` để lưu file cho người dùng.
- **Google Sheets**: Google Sheets API v4 + OAuth 2.0 (`identity.chrome`/`chrome.identity.launchWebAuthFlow`). Khuyến nghị: 1 sheet per account/tab per campaign-level, append theo key ngày; upsert để tránh duplicate khi job chạy lại; tôn trọng quota Sheets (batch 500–1000 dòng/call). Lưu ý idempotency (last_full_sync).
- **Dashboard**: dữ liệu ở IndexedDB (Dexie/lựa chọn tự do), render React options page; export PNG/pdf client-side.

### 3.8 Billing/BM UI-only (tóm tắt khẳng định)

**Chỉ làm được qua UI BM/Ads Manager (không có API chính thức hoặc bị giới hạn):** thêm/gỡ/đổi payment method; đặt/chỉnh **payment threshold** (Ads Manager > Billing & payments > Payment settings > “When you’ll pay”; set thấp hơn có hiệu lực ngay, set cao hơn tăng dần theo lịch sử thanh toán); thanh toán thủ công “Pay now”; nạp prepaid funds (daily top-up limit + stored balance limit trong Payment settings); đăng ký monthly invoicing/đàm phán credit line; đổi currency/timezone account; dispute biên lai; appeal tài khoản bị disable (Request review). Với nhóm này, extension chỉ nên **điều hướng + hỗ trợ thao tác** (deep link tới đúng màn hình, nhắc checklist), tuyệt đối không tự submit giao dịch tài chính.

### 3.9 Rủi ro TOS / bảo mật

- Bảo mật token: nếu có backend relay, token cần mã hóa khi lưu + cơ chế rotate; hoặc thiết kế “token nằm chỉ ở extension, extension đẩy kết quả/payload” (backend chỉ nhận webhook event id + metadata tối thiểu).
- Browser automation trên các trang billing có thể trigger security checkpoint của Facebook — hạn chế click trong flow thanh toán; ưu tiên hỗ trợ UI-guidance (deep link + checklist).
- Dữ liệu ads là dữ liệu “Platform Terms” — cần comply Meta Platform Terms/Data retention khi sync sang Google Sheets của user (user tự sở hữu, OK với request từ chính user).

## 4. Khuyến nghị cho extension

**Ưu tiên P0 (core, rủi ro thấp, khả thi cao):**

1. **Sync báo cáo theo lịch**: insights sync + async fallback, field preset “spend/impressions/clicks/ctr/cpc/cpm/conversions/cost_per_conversion/roas”, xuất CSV trong extension (download) + đẩy Google Sheets. Bắt đầu 5–10 account, tuân thủ throttle header.
2. **Billing watchdog polling**: mỗi 15–30 phút đọc ad account fields (`balance, amount_spent, spend_cap, account_status, disable_reason, funding_source_details, expired_funding_source_details, is_prepay_account`) + `today_spend`; rules cảnh báo local: spend ngày > X, balance > X, account_status ≠ 1, funding source sắp hết hạn. Push notification qua `chrome.notifications`.
3. **Ad-paused/rejected alerts qua polling nhẹ**: trước mắt poll `effective_status` theo chu kỳ dài; **P1** chuyển sang webhooks khi có backend.

**P1 (cần backend relay):**

4. **Webhook receiver** (effective_status + with_issues_ad_objects) → realtime reject alerts + action log kèm `review_feedback`, deep-link vào ads manager.
5. **Subscriptions `INSIGHTS_UPDATED`** cho ngưỡng spend custom theo campaign/adset/ad — thay dần polling ngắn.
6. **Google Sheets sync daemon + web dashboard**.

**P2:**

7. **Ad Rules integration** (tạo/sửa rules notify/pause budget từ UI extension), report cho agency khách hàng (Report Builder), MMM schedulers nếu user advanced.
8. **Browser-automation assist cho nhóm UI-only** (deep link + checklist, KHÔNG tự submit): chỉnh threshold, thêm payment method, nạp funds, appeal.

**Nguyên tắc chống sập**: luôn đọc `X-FB-Ads-Insights-Throttle`/`x-ad-account-usage`, backoff + jitter; mỗi account một queue riêng; backfill có giới hạn 37 tháng (`date_preset=maximum`); dữ liệu ≤28 ngày có thể đổi → re-sync cửa sổ lùi; không poll tài khoản không thay đổi quá dày; log error_subcode; smart-retry chỉ với lỗi throttling (4/17/613/800xx), lỗi OAuth 190 thì báo user re-auth.

## 5. Nguồn tham khảo

Nguồn chính thức Meta (đã fetch trực tiếp, tháng 10/2026):

1. Ads Insights API (overview + edges + ví dụ v26.0): https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights
2. Insights — Limits & Best Practices (async jobs, rate limits, reach throttle, data per call, 15-min refresh/28-day window): https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/best-practices
3. Ad Account Insights — reference (param list: export_format/export_columns/export_name, breakdowns, date_preset, filtering...): https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/insights
4. Marketing API — Rate Limiting (quota BUC ads_insights, scoring theo ad account, giới hạn 10 lần đổi spend_cap/ngày...): https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/rate-limiting
5. Marketing API — Versioning (v26 là current, 90-day grace, auto-version upgrade): https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/versioning
6. Marketing API Changelog — Versions list (v26: 29/7/2026; v25: 18/2/2026; v24 expired 6/10/2026): https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/versions
7. Marketing API Changelog v25 (async fail error fields mới trên `GET /{ad-report-run-id}`): https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version25.0
8. Marketing API Changelog v26: https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version26.0
9. Ad Account — reference (account_status, balance, amount_spent, spend_cap, disable_reason, funding_source_details, expired_funding_source_details, is_prepay_account, tax_id...): https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account
10. Ad Account — Report Builder `GET /{ad-account-id}/reporting` + `report_specs`: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/reporting ; https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/report_specs
11. Ads Webhooks — Overview: https://developers.facebook.com/documentation/ads-commerce/marketing-api/ads-webhooks/ads-webhooks-overview
12. Ads Webhooks — Effective status: https://developers.facebook.com/documentation/ads-commerce/marketing-api/ads-webhooks/effective-status
13. Ads Webhooks — With-issues ad objects: https://developers.facebook.com/documentation/ads-commerce/marketing-api/ads-webhooks/with-issues-ad-objects
14. Ads Webhooks — Subscriptions (INSIGHTS_UPDATED/INSIGHTS_MILESTONE_REACHED, event types & operators, permissions): https://developers.facebook.com/documentation/ads-commerce/marketing-api/ads-webhooks/subscriptions
15. Ad Rules (adrules_library, trigger/schedule-based): https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules
16. Business Invoices (monthly invoicing, OmegaCustomerTrx): https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/business_invoices
17. Extended Credits: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/extendedcredits
18. Business Ads Reporting Exports (read-only): https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/ads_reporting_exports

Meta Business Help Centre (billing behavior — UI-only confirmations):

19. About payment thresholds for Meta ads: https://www.facebook.com/business/help/776240779095515
20. Adjust your payment threshold (threshold chỉ chỉnh trong Ads Manager > Billing & payments > Payment settings): https://www.facebook.com/business/help/1342874532544030
21. About prepaid balance limits (daily top-up limit & stored balance, kiểm tra tại Payment settings UI): https://www.facebook.com/business/help/639210808782258

Ghi chú: một số trang docs cũ (insights/parameters, graph-api auto-generated reference) hiện đã chuyển hướng / render phía client nên nội dung được đối chiếu chéo từ các trang (1)–(18). Nhận định “không có webhook cho account status / không có API receipt / threshold chỉ qua UI” là kết quả kiểm chứng trùng lặp đường dẫn: danh mục webhook được liệt kê đầy đủ tại (11) chỉ gồm 6 field; Help Centre (20) xác nhận thao tác UI; reference ad-account (9) không còn trường billing-threshold/public receipt.
