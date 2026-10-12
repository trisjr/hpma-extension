# 01 — Tổng quan hệ sinh thái API chính thức của Meta cho automation (BM/Facebook)

> Báo cáo nghiên cứu, cập nhật **12/10/2026**. Nguồn chính: tài liệu chính thức Meta for Developers (được tải trực tiếp từ developers.facebook.com cùng ngày), chéo kiểm với SDK chính thức (Python/PHP/Node, đều ở `v26.0.2`), blog Meta for Developers (bài "Introducing Graph API v26.0 and Marketing API v26.0", 29/07/2026) và probe trực tiếp endpoint `graph.facebook.com` (v26.0 hoạt động, v27.0 chưa tồn tại).

## 1. Tổng quan

### 1.1. Phiên bản API hiện tại (đã xác thực đa nguồn)

| Thông tin                      | Giá trị                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph API mới nhất             | **v26.0** — ra mắt 29/07/2026                                                                                                                                     |
| Marketing API mới nhất         | **v26.0** — cùng ngày; _lưu ý: bắt đầu có **Marketing API auto-upgrade** từ 29/07/2026_                                                                           |
| Các version Graph API còn sống | v26 (mới nhất, chưa hạn), v25 (đến 29/07/2028), v24 (đến 18/02/2028), v23 (đến 08/10/2027), v22 (đến 20/05/2027), v21 (đến 21/01/2027); v20 đã hết hạn 24/09/2026 |
| Marketing API còn sống         | v26, v25 (chưa hạn), v24 (đến 06/10/2026)                                                                                                                         |
| Vòng đời version               | Graph API ~2 năm/version; Marketing API ~1 năm/version → **extension bắt buộc phải pin version nhưng có dự phòng tự động nâng**                                   |
| Base URL                       | `https://graph.facebook.com/v26.0/...` (bắt buộc HTTPS; không khai báo version → mặc định version cũ nhất còn sống, không khuyến nghị)                            |

### 1.2. Bản đồ các API chính thức và vai trò

Tất cả đều là "nhánh" của một Graph duy nhất; Meta chia tài liệu theo nghiệp vụ:

| API                                                                  | Bản chất                                                                                                                                                        | Vai trò cho automation BM                                                                                                                           | Rate limit áp dụng                                                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Graph API** (nền tảng)                                             | Node/edge/fields của social graph; host `graph.facebook.com`                                                                                                    | Đọc/ghi bất kỳ object nào (User, Page, Post, Comment, Ad Account...)                                                                                | **Platform Rate Limits**: app token = `200 × số DAU` calls/giờ (rolling 1h); user token = giới hạn ẩn trên mỗi user (dồn lại qua mọi app) |
| **Marketing API**                                                    | "a collection of Graph API endpoints" cho quảng cáo (docs trích nguyên văn)                                                                                     | CRUD campaign/adset/ad/creative, **Ads Insights** (báo cáo), Custom Audience, Catalog, ad rules, pixel/dataset; mọi URIs dưới `act_<AD_ACCOUNT_ID>` | **BUC Rate Limits** theo ad account + Marketing API Access Tier (xem §3.4)                                                                |
| **Business Manager API** (đổi tên thành **Business Management API**) | Quản trị asset trong BM: ad accounts (owned/client), Pages, pixels, catalogs, apps, người dùng, roles, system users, partners/agencies, "Business On Behalf Of" | Tự động hóa việc gán quyền/claim assets/liệt kê cơ cấu BM; tạo ad account (với business đủ điều kiện)                                               | BUC; **Full access tier mới dùng được đầy đủ** (xem §3.2)                                                                                 |
| **Pages API**                                                        | Settings + content của Page (posts, comments, likes, messaging, insights, webhooks)                                                                             | Đăng/lên lịch bài, moderation comment, trả lời inbox, đọc tương tác                                                                                 | User token → Platform; **Page/System token → BUC** (`4800 × số user tương tác/ngày`, rolling 24h)                                         |
| **Conversions API (CAPI)**                                           | Server-to-server gửi events (web/offline/CRM)                                                                                                                   | Chuyển tiếp event chuyển đổi từ server của doanh nghiệp (không nằm trong phạm vi chính của extension)                                               | BUC                                                                                                                                       |
| **Catalog API**                                                      | Quản lý danh mục sản phẩm                                                                                                                                       | Sync sản phẩm cho Advantage+ catalog ads                                                                                                            | BUC (tính theo catalog)                                                                                                                   |

**Mới trong 2025–2026 cần để ý:**

- **"Ads Management Standard Access" đã đổi tên thành "Marketing API Access Tier"** với hai mức: **Limited access** (trước đây: Standard/dev) và **Full access** (trước đây: Advanced). Ngưỡng nâng cấp Full giảm từ 1.500 → **500 Marketing API calls trong 15 ngày gần nhất** (đồng thời error rate < 15% trong 500 calls gần nhất). Không cần đổi code. (Docs "Authorization", cập nhật 05/05/2026).
- Meta đã ra **Ads CLI** và **Ads MCP Server** chính thức (AI-agent access vào ads), kèm permission mới **`ads_mcp_management`** — bề mặt automation mới cho tác vụ AI-agent; theo dõi lâu dài.
- `metadata=1` trên node bị deprecate ở v25.0 (hết hạn hoàn toàn 19/05/2026) — dùng Graph API Explorer/reference thay thế.
- "Login with Facebook" open beta (27/08/2026) cải tiến OAuth (SSO one-tap) — chưa ảnh hưởng trực tiếp đến FBL4B.

### 1.3. Quy trình đăng ký Meta App (developers.facebook.com)

1. Đăng ký developer account → vào `developers.facebook.com/apps/creation/`.
2. **Luồng tạo app mới theo "use case"** (thay vì chọn app type trực tiếp): chọn use case → hệ thống tự gán **app type** và các permission/feature tối thiểu. Các use case liên quan cho BM automation:
   - _"Create and manage ads with Marketing API"_ → `public_profile`, `ads_management`, `ads_read`, feature **Marketing API Access Tier**, `business_management`, `pages_read_engagement`, `pages_show_list`. App trở thành loại **Business**, tự thêm **Facebook Login for Business**.
   - _"Measure ad performance data with Marketing API"_ → như trên, thiên về `ads_read`.
   - _"Capture and manage ad leads with Marketing API"_ → thêm `leads_retrieval`, `pages_manage_ads`.
   - _"Manage everything on your Page"_ → `business_management`, `pages_show_list`, `public_profile` (+ optional `pages_manage_posts`, `pages_manage_engagement`, `read_insights`...).
   - Tạo app "without a use case" được app ID trần (chưa muốn ai dùng — phải tự gán products).
3. **Loại app (app type)**: `Business`, `Consumer`, `Gaming`, `Workplace`, `None`. Khác biệt then chốt: **Business app KHÔNG có Dev/Live mode** (suốt đời "sống"), Consumer/Gaming app có Dev mode ↔ Live mode.
4. Gắn app vào **business portfolio** (BM) — được khuyến nghị ngay trong flow tạo app ("business claimed app"). Giới hạn: tối đa 15 app/1 developer nếu không gắn với legacy business đã verify.
5. Thêm products (Marketing API, Pages...), cấu hình Facebook Login / Facebook Login for Business (redirect URIs), lấy **App ID + App Secret**.
6. (Nếu phục vụ khách hàng ngoài BM)【bắt buộc × 3】: **Business Verification** + **Advanced Access** (App Review) cho từng permission + với user-token `public_profile` cũng phải Advanced. Xem §3.3.

## 2. Danh sách tác vụ có thể tự động hóa

Phân theo cách: **Official API** (qua Graph/Marketing/Pages/BM API), **Browser automation** (DOM trên facebook.com/business.facebook.com — pháp lý rủi ro cao), **Hybrid** (API chính + UI phụ). Độ khả thi đánh giá trong bối cảnh extension cá nhân-1-BM (token của chính user); phục vụ nhiều khách hàng bên ngoài thì khắt khe hơn (App Review).

| Tác vụ người dùng BM thường làm                                                                  | Cách tự động                                                                       | Độ khả thi                                              | Rủi ro & điều kiện                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Dump báo cáo hiệu suất ads (insights theo ngày/tháng, breakdown)                              | Official — `GET /act_<id>/insights` (`ads_read`)                                   | Cao                                                     | Rate limit BUC ad-insights; cần user/token có quyền trên ad account; async reports cho tập lớn                                                                                  |
| 2. Export báo cáo CSV/JSON định kỳ về máy                                                        | Official API + extension tải file                                                  | Cao                                                     | Job nền trong service worker MV3 (hoặc alarms API)                                                                                                                              |
| 3. Pause/resume/xóa campaign, ad set, ad                                                         | Official — `POST /<id> {status}` (`ads_management`)                                | Cao                                                     | Write ops nhạy cảm → nên có confirm UI trong extension                                                                                                                          |
| 4. Đổi daily/lifetime budget, bid                                                                | Official — POST budget fields                                                      | Cao                                                     | Race với delivery; nên re-read trước khi ghi                                                                                                                                    |
| 5. Sửa tên, lịch chạy, tracking params                                                           | Official                                                                           | Cao                                                     | —                                                                                                                                                                               |
| 6. Tạo campaign/adset/ad mới; duplicate (`/copies`)                                              | Official — POST cascade campaign→adset→ad creative→ad (`ads_management`)           | Cao (với template); Trung bình (form-free ads phức tạp) | Validation creatives phức tạp; nên bắt đầu bằng duplicate-publish                                                                                                               |
| 7. Upload ảnh/video creative                                                                     | Official — `/adimages`, `/advideos` (multipart)                                    | Cao                                                     | Video lớn dùng chuỗi upload resumable                                                                                                                                           |
| 8. Tạo/sửa Custom Audience (customer file, website, engagement)                                  | Official — `/customaudiences` (+ ToS acceptance 1 lần qua `/customaudiencestos`)   | Trung bình                                              | Hashing SHA-256 của PII bắt buộc client-side; ToS per ad account                                                                                                                |
| 9. Tạo Lookalike Audience                                                                        | Official                                                                           | Trung bình                                              | Phụ thuộc kích thước seed                                                                                                                                                       |
| 10. Automated rules (đọc; tạo rule log)                                                          | Official — Ad Rules Engine                                                         | Trung bình                                              | Phức tạp; MVP có thể chỉ pause-theo-ngưỡng bằng logic nội bộ extension                                                                                                          |
| 11. Reach/frequency estimate, delivery estimate                                                  | Official — `/delivery_estimate`, `/reachestimate`                                  | Cao                                                     | —                                                                                                                                                                               |
| 12. Pull leads từ Lead Ads forms (bulk)                                                          | Official — `/leads` của form / `<LEAD_ID>` (`leads_retrieval`)                     | Cao                                                     | Permission dependency dài (ads_management, pages_manage_ads,...); Page phải được gán quyền lead (Leads Access Manager); rate limit leads: ~`200×24×lượng leads 90 ngày` cho 24h |
| 13. Nhận lead realtime (webhook `leadgen`)                                                       | Hybrid — Webhooks + backend HTTPS                                                  | Trung bình                                              | Extension client-side không tự host HTTPS endpoint → cần server phụ (hoặc polling)                                                                                              |
| 14. Sync leads → CRM/Sheet định kỳ                                                               | Official + extension poll mỗi 15–60 phút                                           | Cao                                                     | An toàn quota hơn webhook                                                                                                                                                       |
| 15. Đăng bài/lên lịch bài Page (feed, ảnh, video, reels)                                         | Official — Pages API với Page token (`pages_manage_posts` + task `CREATE_CONTENT`) | Cao                                                     | User phải có task CREATE_CONTENT; Page token dài hạn                                                                                                                            |
| 16. Reply/like/delete/hide comment bài Page                                                      | Official — `pages_manage_engagement` (+ `pages_read_user_content` để đọc)          | Cao                                                     | —                                                                                                                                                                               |
| 17. Đọc comment/inbox gom dashboard, badge alert                                                 | Official + webhooks/polling                                                        | Cao                                                     | PSID scoping; webhooks cần backend                                                                                                                                              |
| 18. Trả lời Messenger inbox tự động/thủ công                                                     | Official — Messenger Platform (`pages_messaging`)                                  | Trung bình                                              | Quy tắc 24h window; nhiều policy messaging; Page token                                                                                                                          |
| 19. Đọc Page insights                                                                            | Official — `/insights` của Page (`read_insights`/`pages_read_engagement`)          | Cao                                                     | —                                                                                                                                                                               |
| 20. Cập nhật settings Page, subscribe webhooks Page                                              | Official — `pages_manage_metadata`                                                 | Cao                                                     | Cần task MANAGE                                                                                                                                                                 |
| 21. Liệt kê BM, ad accounts, Pages, pixels, catalogs, apps, người dùng                           | Official — BM API `/{business_id}/...` (`business_management`)                     | Cao                                                     | **Full access tier** cho client assets; limited tier không cho BM APIs                                                                                                          |
| 22. Gán quyền người dùng trên ad account/Page (thêm/xóa)                                         | Official — BM API (`business_management`)                                          | Trung bình                                              | Cần user là Admin của BM; ops write nhạy cảm                                                                                                                                    |
| 23. Tạo ad account mới cho BM                                                                    | Official — `POST /{business_id}/adaccount`                                         | Thấp–Trung bình                                         | Chỉ business đủ điều kiện (verified, đúng loại); dễ bị từ chối                                                                                                                  |
| 24. Claim/request truy cập asset (agency share, "Business On Behalf Of")                         | Official — BM API                                                                  | Thấp–Trung bình                                         | Quy trình 2 chiều; docs rời rạc                                                                                                                                                 |
| 25. Tạo/gỡ system user & token bằng API                                                          | Official — `/system_users`, `/system_user_access_tokens`                           | Trung bình                                              | Limited tier: chỉ 1 system user; Full tier: 10. Tự tạo bằng BM UI đơn giản hơn                                                                                                  |
| 26. Quản lý pixel/dataset, đọc event stats                                                       | Official (`ads_management` hoặc `ads_read` + `/?fields=...`)                       | Cao–Trung bình                                          | —                                                                                                                                                                               |
| 27. Kiểm tra quality/restriction của ad account                                                  | Official — `/{ad_account}?fields=account_status,...`                               | Cao                                                     | Một số trạng thái chỉ thấy trên UI                                                                                                                                              |
| 28. Quản lý catalog sản phẩm (CRUD items)                                                        | Official — Catalog API (`catalog_management`)                                      | Trung bình                                              | Volume lớn → items_batch; rate limit theo catalog                                                                                                                               |
| 29. Đọc hoá đơn/invoices, prepay funds, credit line                                              | Official — BM API edges `business_invoices`, `extendedcredits`, `prepay_funds`     | Trung bình                                              | Chủ yếu áp dụng cho tài khoản dùng credit line (agency); billing thường UI-only                                                                                                 |
| 30. Đổi payment method, thanh toán khoản nợ                                                      | UI-only (+ browser)                                                                | Thấp                                                    | Không có API; browser automation nhạy cảm bảo mật                                                                                                                               |
| 31. Appeal restriction, verify business, upload giấy tờ                                          | Browser-only                                                                       | Thấp                                                    | Không có API chính thức                                                                                                                                                         |
| 32. Quét/gặm public content của competitor Pages                                                 | Official giới hạn — Page Public Content Access (feature, App Review) hoặc scraping | Thấp                                                    | Scraping CẤM bởi Platform Terms §3.2 (docs rate-limit FAQ dẫn thẳng "scraping terms")                                                                                           |
| 33. Tác vụ cá nhân (đăng bài profile, message cá nhân, join group)                               | Browser-only                                                                       | Thấp                                                    | Không có API cho user-profile posting từ lâu; ToS rủi ro rất cao                                                                                                                |
| 34. Các tác vụ UI-only mới (beta UI, Advantage+ switches chưa public, checklist của Ads Manager) | Browser automation / Hybrid                                                        | Trung bình                                              | Selector thay đổi thường xuyên; rủi ro checkpoint/block session                                                                                                                 |
| 35. Tự động theo dõi thay đổi (audit log ai đã sửa gì)                                           | Official — `/{object}/activities` (Ad Activity) + extension diff                   | Cao                                                     | —                                                                                                                                                                               |
| 36. Tự động gắn prefix UTM/naming template                                                       | Official (viết trực tiếp lúc tạo)                                                  | Cao                                                     | Naming Templates edge có sẵn                                                                                                                                                    |

## 3. Chi tiết kỹ thuật

### 3.1. Access token — đủ loại dùng cho extension

| Loại token                                              | Cách phát hành                                                                                    | Thời hạn                                                                                      | Ghi chú                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User access token** (short)                           | OAuth dialog (JS SDK / manual flow)                                                               | ~1–2 giờ                                                                                      | Không dùng cho job nền                                                                                                                                                     |
| **User access token (long-lived)**                      | Đổi short token bằng `GET oauth/access_token?grant_type=fb_exchange_token&client_secret=...`      | ~60 ngày                                                                                      | **Bắt buộc gọi server-side vì chứa app secret**; hết hạn → login lại; hủy sớm khi đổi mật khẩu (subcode 460), user bị checkpoint (459/464), gỡ app (458), revoke (463/467) |
| **Page access token**                                   | Long-lived Page token: `GET /{user-id}/accounts` với long-lived User token trên                   | Không hết hạn theo thời gian (chỉ bị invalidate khi mất quyền, token nguồn hỏng, hoặc policy) | Token riêng theo cặp (Page, admin, app); chính là "luật chơi" để Pages automation                                                                                          |
| **System User token**                                   | BM Settings → System Users → Generate token, gán app với Manage app permission + chọn permissions | **Không hết hạn theo thời gian** (tùy chọn 60 ngày); tồn tại đến khi revoke                   | Admin system user = mọi asset của BM; Employee = theo asset gán; cấu hình trong BM UI vài phút, không cần App Review cho BM của chính mình                                 |
| **Business Integration System User token (FBL4B/SUAT)** | Qua Facebook Login for Business (config_id, response_type=code)                                   | Mặc định never-expire; tham số `set_token_expires_in_60_days=true` nếu muốn expire            | Dành cho app trung gian phục vụ nhiều client BM (Tech Provider); token gắn `client_business_id`; endpoint quản lý: `POST /{CLIENT_BUSINESS_ID}/system_user_access_tokens`  |
| **App token / Client token**                            | `app_id\|app_secret` (server-only) / `app_id\|client_token` (embeddable, không bí mật)            | —                                                                                             | Không đọc được user data; hạn chế dùng                                                                                                                                     |

**Điểm then chốt cho automation:** với app có product Marketing API, docs khẳng định "Apps with Standard access to the Marketing API receive long-lived tokens that do not expire based on time" — tức token Marketing API hiệu dụng không hết hạn theo đồng hồ (vẫn invalidate được bởi revoke/policy), giống system user token. Ngoài ra mọi permission không dùng trong **90 ngày** sẽ hết hiệu lực và phải xin cấp lại (docs Permissions Reference).

### 3.2. Hai lớp "tier" dễ nhầm lẫn (rất quan trọng)

1. **Access Level của permission/feature** — _Standard access_ (mặc định, tự approved) vs _Advanced access_ (phải Business Verification + qua App Review từng permission).
   - Business app: **không cần App Review** nếu chỉ dùng bởi user có (a) role trên app, hoặc (b) **role trên Business (BM) đã "claim" app**. Chỉ khi phục vụ user ngoài BM claim app mới cần Advanced access/App Review cho từng permission.
   - Consumer/Gaming app: Dev mode cho phép xin bất kỳ permission nào từ user có role trên app (không cần review); Live mode + Advanced access để phục vụ user ngoài.
2. **Marketing API Access Tier** — _Limited access_ (mặc định khi thêm product Marketing API) vs _Full access_ (bấm "+Upgrade" trong App Dashboard; điều kiện ≥500 Marketing API calls/15 ngày + error rate <15% trong 500 calls gần nhất).
   - Limited: rate limits rất thấp ("for development only", không cho production live advertisers); **không dùng được đầy đủ Business Manager & Catalog APIs** (không quản lý ad account/user permissions/Pages qua BM API); tối đa 1 system user + 1 admin system user.
   - Full: rate limits nhẹ hơn nhiều; đầy đủ BM + Catalog APIs; 10 system users + 1 admin system user.

→ **Phương án cho extension "nội bộ 1 BM" bằng System User token của chính BM đó:** Standard-access permissions (không cần App Review) + Limited tier là đủ cho đọc insights, pause/budget, leads, posts, moderation trên asset của mình. Vấn đề chỉ nằm ở các write BM-structure (§2, mục 21–24) → cần Full tier (điều kiện mở = vượt ngưỡng 500 calls, không phải App Review).

### 3.3. App Review vs chế độ "không review"

- **App Review** (quy trình Meta test app trực tiếp, ghi hình screencast cho từng permission) **chỉ bắt buộc khi** app phục vụ user không có role trên app hoặc không có role trên Business đã claim app. Nội bộ → miễn.
- **Business Verification** bắt buộc cho mọi app xin **Advanced Access** (kể cả việc app Business-type nội bộ muốn nâng permission cho user ngoài BM). Advanced access đi kèm **Data Use Checkup hằng năm** và Ongoing Review; app dùng Facebook Login for Business được giảm nhẹ yêu cầu ongoing.
- Permission review khó dễ như sau (xếp theo kinh nghiệm + chính sách):
  - **Dễ/được duyệt nhanh thường là use case rõ**: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `read_insights` — screencast minh họa đăng/đọc content là được.
  - **Trung bình**: `ads_read`, `ads_management` (cần minh họa dashboard quảng cáo thực tế), `pages_manage_metadata`, `pages_manage_ads`, `catalog_management`.
  - **Khó (nên tránh ở MVP)**: `business_management` (BM-wide write), `leads_retrieval` (PII của người dùng — cần giải thích use case CRM rất cụ thể, dependency nhiều permission), `pages_messaging` (messaging policy nghiêm), `ads_mcp_management` (mới), các feature `Page Public Content Access` (chống scraping).
- Mẹo docs: chỉ xin permission "cần đúng thôi" — "Selecting unneeded permissions is a common reason for rejection".

### 3.4. Rate limits chi tiết (docs "Rate Limits", cập nhật tới 2026)

**Platform Rate Limits** (Graph API nói chung, user token):

- App token: `200 × NumberOfUsers` calls/giờ (rolling). User token: giới hạn ẩn/user, dồn qua mọi app.
- Headers: `X-App-Usage {call_count, total_cputime, total_time}` (0–100%). Lỗi: code **4** (app), **17** (user), **32** (Pages bằng user token), **613** (custom), **341** (application limit).

**Business Use Case (BUC) Rate Limits** — Marketing API + Pages(Pages/System token); tính theo ad account/BU-case, đọc qua `X-Business-Use-Case-Usage` (có `estimated_time_to_regain_access`, phút):

| BUC                       | Tier thấp (dev/Limited, header `development_access`)                                           | Tier cao (header `standard_access`) | Lỗi                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| Ads Insights              | `600 + 400×số_ad_đang_chạy − 0.001×errors` /giờ                                                | `190,000 + 400×số_ad − errors` /giờ | 80000 / subcode 2446079                   |
| Ads Management            | `300 + 40×số_ad` /giờ                                                                          | `100,000 + 40×số_ad` /giờ           | 80004 / 2446079                           |
| Custom Audience           | `5,000 + 40×số_CA_đang_dùng` /giờ                                                              | `190,000 + 40×số_CA` (trần 700,000) | 80003 / 2446079                           |
| Pages (Page/System token) | `4,800 × số_user_tương_tác_Page` /24h                                                          | —                                   | 80001 (Pages/Page token), 32 (user token) |
| LeadGen                   | `4,800 × số_leads_90_ngày_qua` /24h theo Page                                                  | —                                   | 80005                                     |
| Messenger                 | `200 × số_user_đã_engage` /24h + per-second caps (2 conv/s, 300 send text/s)                   | —                                   | 80006                                     |
| Instagram                 | `4,800 × impressions` /24h                                                                     | —                                   | 80002                                     |
| Catalog batch/mgmt        | Batch: `8 + 8×log2(DA impressions + PDP visits)` /phút; Mgmt: `20,000 + 20,000×log2(...)` /giờ | —                                   | 80014 / 80009                             |
| WhatsApp Mgmt             | 200 req/giờ/app/WABA (5,000 nếu WABA có số điện thoại active)                                  | —                                   | 80008                                     |

**Kỹ thuật giảm quota/extension-idiom:**

- **Batch API**: `POST https://graph.facebook.com/v26.0` với `batch=[{method, relative_url},...]` (tối đa 50 request/batch; mọi id trong `?ids=` cũng đếm từng id, nên gom id vào một request).
- **Async insights**: long-running ad reports chạy qua `POST /act_<id>/insights` với `async=true` (report_run_id) + polling.
- Field filtering: luôn truyền `fields=` và `$filter` để tránh trả dữ liệu thừa.
- Backoff đúng: đọc `error_subcode 2446079` hoặc `estimated_time_to_regain_access`; không retry vòng lặp nóng (docs: "stop making API calls").
- Tránh spike: chia nhỏ query lớn (shorter time range, ít breakdown).
- Mã lỗi liên quan token: 102/OAuthException, 190, subcode 458/459/460/463/464/467/492 — map ra UI "cần đăng nhập lại" thay vì im lặng fail.

### 3.5. Lưu ý triển khai cho Chrome extension (MV3, Vite+CRXJS — đúng stack của repo)

- **Gọi trực tiếp Graph API từ background service worker** bằng `fetch` tới `https://graph.facebook.com/v26.0/...` — khai báo `host_permissions: ["https://graph.facebook.com/*"]`; khỏi đụng CORS.
- **Login flow**: dùng `chrome.identity.launchWebAuthFlow()` mở `https://www.facebook.com/v26.0/dialog/oauth?client_id=...&redirect_uri=https://<ext-id>.chromiumapp.org/&scope=ads_read,ads_management,...&response_type=...`. URL pseudo-origin `https://<ext-id>.chromiumapp.org/` phải khai báo trong _Facebook Login → Valid OAuth Redirect URIs_ của app. Không nhúng Facebook JS SDK (đòi cookie origin www.facebook.com — vốn khó trong context extension; đường manual an toàn hơn).
- **KHÔNG đưa App Secret vào extension** → không đổi long-lived token client-side. 2 cách hợp lệ:
  1. User tự paste **System User token** (never-expire) tạo trong BM của họ — MVP, không cần server.
  2. Nếu cần token từ OAuth flow → bắt buộc **backend trung gian** (cũng nắm `client_secret`, đổi code→token, lưu trữ, proxy).
- Lưu token trong `chrome.storage.local` (nội bộ) hoặc `chrome.storage.session` nếu nhạy cảm hơn; có nút "xóa token"; map lỗi 190/463→yêu cầu paste/renew lại.
- Content script chèn trên `business.facebook.com` chỉ nên dùng cho đọc ngữ cảnh UI (hiện có của user) và điều hướng người dùng đến đúng màn hình UI-only (billing, appeal), **không** giả lập click hàng loạt (Platform Terms §3.2 + anti-abuse của Meta).
- Pin version `v26.0` trong mọi base URL + cơ chế config từ xa để nâng version khi Meta sunset (Graph API ~2 năm, Marketing API ~1 năm — cơ chế auto-upgrade từ 07/2026 áp cho các call không chỉ định version).
- Webhooks (`leadgen`, page changes...): extension nguyên thuỷ không host được HTTPS callback → cần backend nhỏ, hoặc fallback polling (đủ dùng cho lead sync cá nhân).

### 3.6. Kết luận — "bề mặt tự động hóa chính thức"

Hợp pháp và đủ rộng cho ~80% tác vụ BM hằng ngày:

- **Báo cáo & insights** (ads_read) — qua Marketing API, không cần review cho asset của mình.
- **Vận hành ads** (pause/resume/budget/edit/duplicate/bulk-create/preview) — ads_management, official được.
- **Leads** (bulk + định kỳ) — leads_retrieval; realtime cần backend webhook.
- **Page ops** (post/schedule/moderate/comments/insights) — pages\_\* + long-lived Page token.
- **Cấu trúc BM** (assign user, claim assets, system users) — business_management nhưng **chỉ khi Full access tier**; mức MVP hãy giới hạn ở read-only liệt kê assets (lượng tk ads, pages, pixels, catalogs) rồi deep-link tới UI BM cho thao tác gán quyền.
- **Phần còn lại** (billing, verification, appeal, một số switch UI-only, add-friend/group/scrape người ngoài) **không có API chính thức** — chỉ dọn "UI-assist" (mở đúng màn, hướng dẫn thao tác) hoặc chấp nhận rủi ro browser automation rất cao.

**Mô hình auth khuyến nghị cho extension:**

1. **Phase 1 — "Bring your own token" (MVP, 0 App Review):** user tạo (hoặc đã có) Meta app loại Business claim vào BM của họ → tạo **System User token** trong BM Settings → dán vào extension. Extension tự gọi Graph API trực tiếp. Bao phủ §2 mục 1–20, 26, 35, 36. Nếu thiếu Permission trên token → lỗi 102/200-299/10, hiển thị hướng dẫn bổ sung.
   - Biến thể thân thiện hơn: cho phép user đăng nhập OAuth qua app của họ (nếu họ chịu tạo app) bằng `chrome.identity` — vẫn "0 review" vì user có role trên app/BM-claimed.
2. **Phase 2 — OAuth qua app trung gian (khi bán cho nhiều doanh nghiệp):** dùng **Facebook Login for Business** (Business type app + `config_id`, khuyến nghị **Business Integration System User token** never-expire): cần backend giữ secret, Business Verification + App Review (ads_read/ads_management/leads... tùy scope) và Ongoing Review. Nên mở cho user có role trên app trước (beta), review sau.
3. **Tránh:** lưu app secret trong extension; bắt user đăng nhập mật khẩu FB qua extension (vi phạm & bắn checkpoint); tự động bằng scraping/DOM (ToS).

## 4. Khuyến nghị ưu tiên cho extension

1. **Sprint 1 — nền tảng auth & đọc (rủi ro thấp nhất, giá trị ngay):** token-input + validate qua `/debug_token` (grants/app_id), liệt kê ad accounts (`/me/adaccounts` với user token hoặc business edges), insights reader (daily spend/impressions/CPA) + export CSV. Rate limit rất dư cho nhóm này.
2. **Sprint 2 — an toàn ghi:** pause/resume campaign/adset/ad + sửa budget có confirm + activity feed (`/{obj}/activities`) — giải bài toán thao tác nhầm/trễ khi vận hành BM thủ công.
3. **Sprint 3 — leads pipeline:** bulk pull định kỳ (alarm 30–60 phút) → lưu nội bộ + xuất CSV / gửi webhook tùy chọn; nếu có backend sau này → webhook realtime.
4. **Sprint 4 — Page ops:** post/schedule + comment moderation + reply inbox (kèm cảnh báo policy messaging).
5. **Sprint 5 — nâng cấp auth tập thể:** Facebook Login for Business + SUAT cho mode "đội/agency", upgrade Marketing API Access Tier (đạt ngưỡng 500 calls/15d tự nhiên khi team dùng).
6. **Luôn kèm:** UI-assist (deep-link tới đúng màn BM cho các thao tác UI-only: billing, verification, tickets), và hạ tầng rate-limit/batch/backoff ngay từ Sprint 1. Với nhóm tính năng browser-automation (nếu quyết định làm), tách module riêng, cảnh báo rõ ràng, tắt mặc định.

## 5. Nguồn tham khảo

Tài liệu chính thức (truy cập & lưu trực tiếp 12/10/2026):

1. Graph API Changelog (bảng version, ngày ra mắt kèm "Available Until"): <https://developers.facebook.com/docs/graph-api/changelog/>
2. Graph API Overview: <https://developers.facebook.com/docs/graph-api/overview/>
3. Graph API Rate Limits (formulas BUC/Platform, error codes, headers): <https://developers.facebook.com/docs/graph-api/overview/rate-limiting/>
4. Handling Errors (error codes/subcodes): <https://developers.facebook.com/docs/graph-api/guides/error-handling/>
5. Marketing API — Authorization (Access Tier Limited/Full, ngưỡng 500 calls, system users, use cases): <https://developers.facebook.com/docs/marketing-api/overview/authorization>
6. Marketing API Overview / hub: <https://developers.facebook.com/docs/marketing-apis>
7. Access Levels (Standard/Advanced, Business Verification, Data Use Checkup): <https://developers.facebook.com/docs/graph-api/overview/access-levels/>
8. Access Tokens (5 loại token, short/long-lived, system user): <https://developers.facebook.com/docs/facebook-login/guides/access-tokens/>
9. Long-lived access tokens (60 ngày, Page token không hết hạn, client code flow): <https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/>
10. Facebook Login for Business (config_id, SUAT never-expire, granular tokens, Permissions được hỗ trợ, `system_user_access_tokens` endpoint): <https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/>
11. Create an App with Meta (use-case driven, permissions map, business portfolio, app limits): <https://developers.facebook.com/docs/development/create-an-app>
12. App Review process (khi nào bắt buộc, role trên app/BM-claim): <https://developers.facebook.com/docs/app-review/>
13. Permissions Reference for Meta Technologies APIs (dependencies & review requirements từng permission, 90-day expiry, cập nhật 29/09/2026): <https://developers.facebook.com/docs/permissions/reference/>
14. Pages API Overview (tasks ADVERTISE/ANALYZE/CREATE_CONTENT/MANAGE/MANAGE_LEADS/MESSAGING/MODERATE, Page tokens, Business app mode note): <https://developers.facebook.com/docs/pages-api/overview/>
15. Business Management APIs — Business Manager: <https://developers.facebook.com/docs/marketing-api/business-manager>
16. System Users guide: <https://developers.facebook.com/docs/marketing-api/system-users/>
17. Lead Ads — Retrieving (webhook vs bulk, permissions, rate limit leads): <https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving>
18. Meta for Developers Blog — "Introducing Graph API v26.0 and Marketing API v26.0" (29/07/2026): <https://developers.facebook.com/blog/>
19. SDK chính thức (xác thực chéo version mới nhất = v26.0.2): <https://github.com/facebook/facebook-python-business-sdk> | <https://github.com/facebook/facebook-php-business-sdk> | <https://github.com/facebook/facebook-nodejs-business-sdk>
20. Kiểm chứng live: `GET https://graph.facebook.com/v26.0/me` (yêu cầu token = version sống), `.../v27.0/me` ("Unknown path components" = chưa phát hành).

---

_Lưu ý về độ tin cậy: mọi con số (rate-limit formulas, ngưỡng 500 calls/15 ngày, thời hạn token 60 ngày/never-expire, rule "role trên app hoặc BM-claim app") đều trích dẫn từ tài liệu chính thức lấy về trong ngày viết báo cáo; các đánh giá "mức độ khó duyệt permission" là phân tích tổng hợp (docs + thực hành lĩnh vực), không phải công bố chính thức của Meta._
