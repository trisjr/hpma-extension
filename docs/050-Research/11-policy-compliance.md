# Báo cáo #11 — Chính sách Meta & rủi ro compliance khi tự động hóa Business Manager

> Phạm vi: Meta Platform Terms & Developer Policies, điều khoản cấm automation/scraping, rủi ro checkpoint/khóa tài khoản cá nhân & BM, App Review, chính sách Chrome Web Store, best practices giảm rủi ro và "vạch đỏ".
> Dữ liệu cập nhật đến **tháng 10/2026**. Graph API mới nhất tại thời điểm viết: **v26.0** (phát hành 29/7/2026).

---

## 1. Tổng quan

Khi tự động hóa Facebook Business Manager (BM) có **3 tầng rủi ro riêng biệt**, cần đánh giá song song:

1. **Rủi ro tài sản Meta (tài khoản & BM bị khóa).** Meta enforcement bằng cả hệ thống tự động và thủ công ("Enforcement can be both automated and manual" — Platform Terms §7.e.ii). Điểm đặc biệt nguy hiểm: **cascade ban** — một tài khoản cá nhân bị flag có thể kéo theo toàn bộ tài sản liên kết (pages, ad accounts, BM) bị suspend. BBC ghi nhận trường hợp một tài khoản Instagram cá nhân bị suspend khiến toàn bộ pages/kinh doanh của user bị khóa theo, với quy trình kháng cái gần như hoàn toàn do AI xử lý và không có human support (6–7/2025).
2. **Rủi ro pháp lý / hợp đồng.** Meta có đội chuyên trách >100 người chống scraping/abuse và >300 enforcement actions/năm (công bố 2021). Meta đã kiện và thắng các vụ liên quan trực tiếp đến browser automation và scraping logged-in (BrandTotal/Unimania — browser extensions; Octopus; Voyager Labs). Ngược lại, vụ Bright Data (1/2024) cho thấy Meta **thua** khi scraping chỉ dừng ở public data, logged-out, không dùng tài khoản — tức ranh giới pháp lý nằm ở **việc dùng tài khoản đăng nhập để tự động thu thập/thao tác**.
3. **Rủi ro kênh phân phối (Chrome Web Store).** Extension tương tác Facebook phải tuân thủ Limited Use (chỉ dùng dữ liệu cho "single purpose" đã khai báo — bao gồm cả dữ liệu scraped), yêu cầu permission tối thiểu, privacy policy công khai, không inject quảng cáo/hijack trang. Extension đủ tiêu chuẩn về mặt Google nhưng vẫn có thể bị Meta enforcement ở tầng nền tảng.

**Nguyên tắc phân ranh của Meta:** Official API (Graph API/Marketing API qua Meta App) = được phép, có điều kiện (App Review, rate limits, data use). Còn lại: Terms of Service cấm "access or collect data from our Products using automated means (without our prior permission)", Developer Policies §2 yêu cầu "Respect the way Meta Products look and function" — tức **UI automation trên giao diện web facebook.com/business.facebook.com là vi phạm điều khoản**, bất kể mục đích "giúp user". Các vụ kiện Octopus dùng đúng cụm "unauthorized and automated scraping **and attempting to conceal**" — hành vi che giấu (fake fingerprint, xoay IP, bypass CAPTCHA) là yếu tố làm nặng.

Bản chất bài toán của extension: **API-first cho mọi thứ API có; UI chỉ nên "hỗ trợ" (deep-link, checklist, prefill, hướng dẫn có user xác nhận), không "tự vận hành".**

---

## 2. Danh sách tác vụ BM thường làm thủ công → mức độ tự động hóa được theo compliance

Nhóm theo vùng rủi ro. "Official API" = có endpoint chính thức; "UI-only" = Meta chỉ cho làm qua giao diện; "ToS-violating" = làm qua browser automation sẽ vi phạm điều khoản.

### A. Vùng an toàn — Official API (nên làm)

| Tác vụ                                                   | Cách tự động                                                                                     | Khả thi    | Rủi ro & điều kiện                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đọc báo cáo hiệu suất (Insights), export report          | Official API (Insights API, async report) + Webhooks (88+ loại notification, tài liệu 22/7/2026) | Cao        | Rate limit riêng Ads Insights (app-level); cần `ads_read`/`read_insights`.                                                                                                 |
| Tạo/sửa/duplicate campaign, ad set, ad hàng loạt         | Official API (Marketing API, `ads_management`)                                                   | Cao        | Giới hạn: đổi budget ad set ≤4 lần/giờ (error 613/1487632); ad creation giới hạn theo daily spend. Cần Standard/Advanced Access qua App Review.                            |
| Tắt/mở campaign–ad set–ad theo điều kiện                 | Official API hoặc native Automated Rules / Ad Rules Engine API                                   | Cao        | Nên ưu tiên Automated Rules (native, Meta khuyến khích).                                                                                                                   |
| Điều chỉnh budget, bidding event                         | Official API                                                                                     | Cao        | Đổi `spend_cap` ≤10 lần/ngày (error 17/1885172).                                                                                                                           |
| Upload creative (ảnh/video/carousel) hàng loạt           | Official API (Ad Creative + video upload)                                                        | Cao        | V26+ chặn tạo poll creative mới (27/10/2026 áp cho mọi version).                                                                                                           |
| Custom Audiences từ CRM (hash PII)                       | Official API (`ads_management` / custom_audience)                                                | Cao        | BUC limit 190k–700k/h; **nghĩa vụ data handling** (hash SHA-256, consent, Platform Terms §3). Tuyệt đối không upload PII người khác không có consent.                      |
| Lấy Lead Ads leads realtime                              | Official API (`leads_retrieval`) + Webhooks (leadgen)                                            | Cao        | Data deletion obligations khi không còn cần.                                                                                                                               |
| Catalog/feed management (commerce)                       | Official API (`catalog_management`)                                                              | Cao        | Lưu ý: **47 Commerce Order Management endpoints đã bị remove ở v26.0** (checkout Shops khai tử) — chỉ còn quản lý catalog, không quản lý order.                            |
| Đăng/lên lịch bài Page, sửa bài, xóa                     | Official API (Pages API, `pages_manage_posts`)                                                   | Cao        | Developer Policies §1: "Obtain consent from people before publishing content or taking any other action on their behalf" — mọi thao tác đăng thay user phải có consent rõ. |
| Trả lời bình luận/tin nhắn Page (moderation)             | Official API (Pages API, Messenger Platform, `pages_messaging`)                                  | Cao        | Không spam mass-DM; có chính sách riêng Messenger (Developer Policies §5): 24h window, opt-in/opt-out.                                                                     |
| Kiểm tra trạng thái asset/quality, đọc ad account status | Official API (Business/Ad Account nodes, read-only)                                              | Cao        | Read-only, rủi ro ~0 — ứng viên MVP tốt.                                                                                                                                   |
| Đồng bộ events (Pixel → server)                          | Official API (Conversions API)                                                                   | Trung bình | Phải có consent (GDPR/DMA ở EU); v26 tích hợp Parameter Builder auto-hash.                                                                                                 |
| Tra cứu quảng cáo đối thủ (Ad Library)                   | Official API (Ad Library API)                                                                    | Trung bình | Phải xác minh danh tính; **scraping Ad Library UI thay thế API = vi phạm**.                                                                                                |
| Quản lý user/role trong BM, System User, agency access   | Official API (Business Management API, `business_management`)                                    | Trung bình | Nhạy cảm bảo mật; nên read + thao tác có confirm; log mọi thay đổi.                                                                                                        |
| Webhook subscribe thông báo ads                          | Official API (Webhooks endpoint, 88+ notification types)                                         | Cao        | Mới tài liệu hóa 7/2026, tham chiếu v25/v26.                                                                                                                               |

### B. Vùng vàng — UI-only: KHÔNG tự động, chỉ "assist"

| Tác vụ                                       | Cách tự động                                                                | Khả thi               | Rủi ro & điều kiện                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| Gửi appeal khi ad account/BM bị restrict     | UI-only → Extension deep-link + checklist, user tự bấm                      | Thấp (với automation) | Tự động nộp appeal = UI automation vi phạm ToS + làm Meta đánh giá pattern bot.     |
| Verify business / nộp giấy tờ xác minh       | UI-only, hướng dẫn                                                          | Thấp                  | Tự động upload giấy tờ = red line (vùng identity).                                  |
| Thêm/đổi phương thức thanh toán              | UI-only (phần lớn)                                                          | Thấp                  | Giao dịch tài chính — không tự động.                                                |
| Duyệt draft posts/draft campaigns            | UI-only (BM drafts)                                                         | Thấp–trung bình       | Có thể deep-link tới trang draft để user 1-click duyệt; không auto-click hàng loạt. |
| Share asset cho agency/partner (một số flow) | Hybrid: Business Management API khi cấu hình được; UI-only các flow còn lại | Trung bình            | Chỉ tự động phần API hỗ trợ.                                                        |

### C. Vùng đỏ — vạch đỏ tuyệt đối (chi tiết ở §4.3)

Nuôi nick/fake accounts, account farming, mua–bán–thuê BM/agency ad account, mượn/cung cấp cookie & mật khẩu cho bên thứ ba (Octopus precedent), bypass CAPTCHA/2FA/checkpoint (Voyager precedent, "attempting to conceal"), tạo app/account mới để lách lệnh cấm (Platform Terms §7.e.i.3 cấm tường minh), scraping dữ liệu sau login (profile/friends), công cụ surveillance/eligibility (cấm tại Platform Terms §3.a.ii–iii), engagement bait mua like/share (Developer Policies §2).

---

## 3. Chi tiết kỹ thuật

### 3.1. Khung pháp lý chính (đã đọc bản gốc — capture Common Crawl 8/2026, "Last updated February 3, 2026")

**Meta Platform Terms** (`developers.facebook.com/terms/`):

- Điều kiện áp dụng kèm: Meta ToS, Meta Commercial Terms, **Business Tools Terms**, Developer Policies, và Documentation (§1.b–c). Vi phạm → "we may suspend or terminate your App or account" (§1.e).
- **Prohibited Practices §3.a:** cấm dùng Platform Data để phân biệt đối xử; cấm "eligibility determinations" (housing/jobs/credit...); cấm **"tools for surveillance"**; cấm bán/mua Platform Data; cấm build/augment user profiles không có consent; cấm re-identify/de-anonymize/reverse-engineer data; cấm đổi core functionality của app mà không re-submit App Review (§3.a.vii).
- **§3.d:** nghĩa vụ xóa dữ liệu khi không còn mục đích, khi user yêu cầu, khi app ngừng hoạt động, hoặc khi Meta yêu cầu (kèm proof of deletion).
- **§4:** bắt buộc privacy policy URL công khai, "easily accessible (including by our crawlers), non-geoblocked", khai báo trong App Dashboard.
- **§7 (Compliance):** Meta + Third-Party Auditors được **monitor thường xuyên**, audit 1 lần/năm (10 ngày notice), yêu cầu certifications định kỳ; enforcement **tự động hoặc thủ công, có thể không báo trước**, bao gồm suspend/xóa app & account, yêu cầu xóa data, "terminating other agreements with you or your ability to use Meta Products" — tức **cấm ở cấp pháp nhân, không chỉ cấp app**.
- **§7.e.i.3:** cấm tạo/duy trì app mới để circumvent enforcement — tạo app clone sau khi bị cấm = vi phạm riêng.
- **§7.e.iii:** Meta thu hồi permission/feature mà app **không dùng trong 28 ngày** → extension phải có cơ chế giữ permission "ấm" hoặc xử lý graceful khi mất quyền.

**Meta Developer Policies** (`developers.facebook.com/devpolicy/`):

- §1: dùng "authentic account" để quản app; **"Obtain consent from people before publishing content or taking any other action on their behalf"** — nền tảng cho quy tắc "user-initiated/user-confirmed actions".
- §2: **"Respect the way Meta Products look and function, and the limits we've placed on product functionality"** — cơ sở Meta dùng để kết tội UI automation; cấm tham gia thị trường mua bán Like/Share/Follower/**Accounts**.
- §3: Meta liên lạc qua email `meta.com`/`fb.com`/`facebookmail.com` — bắt buộc theo dõi Developer Alerts (bỏ lỡ certification request = bị enforce).

**Meta Terms of Service** (mức user, §3.2): cấm "access or collect data from our Products using automated means (without our prior permission) or attempt to access data you do not have permission to access". (Trang ToS chặn IP môi trường nghiên cứu; câu chữ được xác nhận qua các complaint Meta trích trong các vụ kiện và bài about.fb.com.)

### 3.2. Case law & thực tiễn enforcement (nguồn chéo ≥2)

| Vụ việc                                             | Đối tượng                                                                                                                                       | Kết quả                                                                                                                            | Ý nghĩa cho extension                                                                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Meta v. BrandTotal & Unimania (2020→settle 10/2022) | **Browser extensions** "Ads Feed" & "UpVoice" thu thập dữ liệu FB/IG                                                                            | Permanent injunction, xóa code+data, nộp khoản tiền "significant". Court: FB ToS enforceable; CFAA không vi phạm                   | Precedent gần nhất với mô hình extension: **extension chạy trong session logged-in của user vẫn bị truy cứu trách nhiệm hợp đồng**.              |
| Meta v. Octopus (7/2022, thắng 2024)                | Dịch vụ scraping; khách tự cấp credentials                                                                                                      | Permanent injunction. Meta dùng cụm khách hàng "**self-compromised** their accounts by providing their authentication information" | Cho bên thứ ba giữ cookie/session/password = vi phạm, kể cả user tự nguyện.                                                                      |
| Meta v. Voyager Labs (1/2023 → settle 12/2024)      | Fake accounts + scraping logged-in, che giấu verification                                                                                       | Permanent injunction + tiền                                                                                                        | Fake identity + concealment = nghiêm trọng nhất. "Voyager did not compromise Facebook, instead it used fake accounts" — fake account đã đủ kiện. |
| Meta v. Bright Data (2023 → 1–2/2024)               | Scraping public data khi logged-out                                                                                                             | **Meta THUA** breach-of-contract; rút đơn 23/2/2024, từ bỏ quyền appeal                                                            | Public data, không login, không dùng account → ToS khó áp. Nhưng BM automation luôn logged-in → **không được shelter bởi precedent này**.        |
| Nền tảng chung                                      | 100+ người đội anti-scraping; 300+ enforcement actions/năm; PFBID (identifier xoay theo thời gian) chống enumeration                            | —                                                                                                                                  | Meta đầu tư kỹ thuật chống automation chủ động.                                                                                                  |
| Sóng ban 5–7/2025 (BBC)                             | Hàng chục nghìn user/business bị suspend oan (kể cả nhóm lớn 680k–3.5M member); kháng cái bị AI từ chối sau ~2 phút; **linked-account cascade** | Meta thừa nhận "technical error" với Groups                                                                                        | Enforcement tự động có false positives thật; khi dính automation-flag, tài sản liên kết đi theo; rất khó gỡ.                                     |

**Dấu hiệu Meta dùng để phát hiện browser automation / multi-account** (tổng hợp Multilogin + các vụ kiện): device/browser fingerprint (screen, fonts, timezone, WebGL), lịch sử IP & geo bất thường, trùng cookie/storage giữa tài khoản, **mẫu hành vi giống hệt nhau giữa các tài khoản/session (identical automation patterns)**, spend spikes đột ngột, tốc độ click/typing không người, headless flags, bypass CAPTCHA (trong vụ Voyager/Bright Data, "automate logging in" và bypass CAPTCHA là yếu tố Meta đưa ra tòa).

### 3.3. Versions & rate limits (bắt buộc nắm khi build)

- **Graph API/Marketing API v26.0** — bản mới nhất (29/7/2026). v20.0 đã retire 24/9/2026; v21.0 retire 21/1/2027. Các breaking change của v26 áp cho **mọi version còn lại từ 27/10/2026** (chu kỳ 90 ngày). → Luôn pin version, và lên lịch nâng version định kỳ cho extension (Meta cho ~2 năm/version nhưng breaking change lan rộng 90 ngày).
- **Access tiers:** App mới ở Development tier (Marketing API score 60, decay 300s, block 300s) → cần **App Review + Business Verification** để lên **Standard Access** (score 9000, block 60s) và nâng lên **Advanced** khi cần thêm quota. `ads_management_standard_access` là feature mới quản quota riêng.
- **Rate limits quan trọng (Marketing API docs, 11/2025):**
  - Record: read=1 điểm, write=3 điểm; error 17/2446079, 613/1487742 (ad-account), 4 (app-level), 80000–80014 (BUC).
  - BUC per ad account/giờ: ads_management = 100.000 (Standard) / 300 (Dev) + 40×số active ads; ads_insights = 190.000 / 600 + 400×active ads; custom_audience ≥190.000 / 5.000 + 40×audiences.
  - Thao tác riêng: ad set budget **≤4 lần/giờ** (613/1487632); ad account spend_cap **≤10 lần/ngày** (17/1885172); ad creation giới hạn theo daily spend (613/1487225).
  - Marketing API loại trừ khỏi Graph API throttling chung và ngược lại; theo dõi header `X-Business-Use-Case` để phân loại.
- **Auth cho extension:** OAuth qua Meta App (Facebook Login for Business / config system users); dùng **System User token / long-lived token ở server trung gian** khi cần headless; trong extension lưu token ở `chrome.storage.local` (không sync cloud), không bao giờ thu password/cookie user (Octopus precedent + CWS data handling: "Keep authentication information secure"). Scoped permission tối thiểu: `ads_read`, `read_insights` cho MVP read-only; thêm `ads_management`, `business_management` khi có write flow + đã qua App Review.
- **Graph API v26 protocol removals:** bỏ `pretty`, `debug`, `date_format`, root `/?ids=`, ETag/304 — kiểm thử extension trên v26 trước 27/10/2026.

### 3.4. Chrome Web Store — các điều khoản ảnh hưởng trực tiếp

- **Limited Use (11/2022):** chỉ thu thập/dùng dữ liệu cần cho "disclosed single purpose"; **quy định này áp cả với "scraped content or otherwise automatically gathered user data"** — tức cấm dùng extension để thu dữ liệu FB rồi bán/chia sẻ; cấm transfer/sell cho ads platform, data broker; phải có câu khẳng định tuân thủ Limited Use trong privacy policy web.
- **Permissions:** "narrowest permissions necessary" — `host_permissions` tới `facebook.com`/`business.facebook.com` phải justification trong submission notes; không xin quyền "future-proof".
- **Quality / single purpose (7/2024):** một extension một mục đích; không bundle chức năng không liên quan; **cấm inject quảng cáo vào trang** — không được chèn lớp UI/ads của riêng mình vào giao diện facebook.com.
- **Data Handling:** truyền data qua modern crypto (HTTPS); không public disclosure auth info. **Privacy Policies:** bắt buộc URL privacy policy nếu handle user data, khai báo trong Developer Dashboard.
- **Impersonation/IP:** không đặt tên/logo gây nhầm với "Facebook", "Meta", "Ads Manager" (trùng brand kết hợp Meta Brand Resource Center).

### 3.5. App Review — nếu build app công khai

- Quy trình: Meta App (type Business) → Business Verification → xin **Standard Access** cho từng permission/feature (kèm screencast demo từng use case, test instructions) → Data Use Checkup định kỳ hàng năm → Advanced Access khi cần volume lớn.
- Cấu hình bắt buộc: privacy policy URL (PT §4), data deletion callback URL, category use case khai báo đúng (sai use case = lý do reject phổ biến), contact email theo dõi (Dev Policies §3).
- Lưu ý: App Review xin `ads_management` trọng điểm vào việc app thao tác đúng ad account của chính user/business; các use case "quản lý hộ nhiều client" cần mô tả rõ agency model và Tech Provider terms (PT §5).
- Không thay đổi core functionality/data processing mà không re-submit (PT §3.a.vii) — khi extension thêm feature mới dùng dữ liệu khác ban đầu, phải submit lại.

---

## 4. Khuyến nghị cho extension (Lên → Xuống theo thứ tự ưu tiên)

### 4.1. Lộ trình ưu tiên (API-first, rủi ro thấp trước)

1. **Phase 0 — Read-only insights (rủi ro ~0):** dashboard tổng hợp ad accounts/pages/BM, export Insights (async report), cảnh báo bất thường (webhooks 88 notification types), kiểm tra account/asset status. OAuth `ads_read`/`read_insights`. Đây là nhóm vừa an toàn vừa đáp ứng review dễ.
2. **Phase 1 — Write qua Marketing API có confirm:** pause/resume campaign/ad set/ad, điều chỉnh budget (tôn trọng 4 lần/giờ & 10 spend_cap/ngày — nên route ưu tiên qua **Automated Rules** native), duplicate campaign, bulk creative upload. Mọi write = user-confirm với diff preview (tuân thủ "obtain consent" Dev Policies §1).
3. **Phase 2 — "Assist, không automate" cho tác vụ UI-only:** deep-link tới đúng màn BM (drafts approval, billing, business verification, appeal center) + checklist hướng dẫn + prefill forms có sẵn để user bấm xác nhận cuối. Tuyệt đối không auto-submit hàng loạt.
4. **Phase 3 (cân nhắc kỹ) — DOM automation tối thiểu, user-initiated:** chỉ auto-fill/auto-click **một hành động đơn lẻ, trong session thật của user, theo yêu cầu trực tiếp của user tại thời điểm đó**; không loop, không batch, không headless, không spoof fingerprint/proxy. Ghi rõ trong docs là tiện ích trợ lý UI. Rủi ro vẫn ≠ 0: Meta có thể coi là "automated means"; khuyến nghị giới hạn feature này ở bản nội bộ, không public.

### 4.2. Best practices giảm rủi ro vận hành

- **Official API trước, UI sau** — mọi tính năng phải trả lời được "có endpoint cho việc này không?" trước khi nghĩ đến DOM.
- Tôn trọng rate limits: exponential backoff + jitter, đọc `X-Business-Use-Case`, xử lý error 17/613/80000+ bằng cách dừng chứ không retry storm.
- Không giả lập hành vi người (không random-mouse, không proxy-xoay) — concealment là yếu tố làm nặng trong mọi vụ kiện của Meta.
- Tránh mảng nhạy cảm: **không nuôi nick, không flight/farm ad accounts, không thuê BM**, không multi-account từ cùng thiết bị; user mang nhiều BM vào extension → cảnh báo cascade risk và không đồng bộ hành vi giữa các BM.
- Data minimization (PT §3.d + CWS Limited Use): không lưu Platform Data quá nhu cầu; endpoint xóa data + proof; privacy policy public, non-geoblocked.
- Token hygiene: system user + long-lived token qua server trung gian cho backend jobs; không gửi cookie session cho bất kỳ ai; 2FA cho mọi tài khoản quản trị extension.
- Theo dõi Developer Alerts/email `facebookmail.com`; giữ permission "ấm" trước quy tắc thu hồi 28 ngày (job health-check read nhẹ định kỳ, hoặc xử lý xin lại quyền).
- Khi checkpoint xuất hiện ở tài khoản/BM: **dừng mọi automation ngay**, chuyển chế độ read-only, hướng dẫn user appeal thủ công — không retry để "chờ hết".
- Chu kỳ nâng version API: theo dõi changelog; trước mỗi mốc retire (v21: 21/1/2027; breaking wave: 27/10/2026) phải release bản tương thích.
- Với CWS: single purpose statement, Limited-Use disclosure trong privacy policy, justification từng permission, không inject quảng cáo vào facebook.com, không dùng brand Facebook/Meta trong tên extension.

### 4.3. Vạch đỏ — các tác vụ KHÔNG được tự động

1. **Checkpoint/identity:** tự động vượt CAPTCHA, 2FA, xác minh danh tính, upload giấy tờ, "confirm identity" (Voyager; "attempting to conceal" = làm nặng).
2. **Tài khoản:** tạo tài khoản, nuôi nick, dùng fake accounts, mua/bán/tặng account-page-group-BM (Dev Policies §2; ToS fake accounts).
3. **Credentials:** thu/cho thuê password, cookie, session token; nhúng session user vào SaaS bên thứ ba (Octopus).
4. **Lách cấm:** tạo app/account mới sau khi bị enforce (PT §7.e.i.3); cloaking nội dung quảng cáo; xoay IP/fingerprint để trốn detection.
5. **Thu thập:** scraping dữ liệu sau login (profile, friends, groups), build dataset người dùng, resell data (PT §3.a.iv–v); tự động duyệt/tải Ad Library thay API.
6. **Surveillance/eligibility:** mọi tool chấm điểm con người, ra quyết định housing/jobs/credit/insurance (PT §3.a.ii–iii).
7. **Engagement công khai:** auto like/share/comment/mass DM/mass friend request/mass group post (ToS + spam policies).
8. **Tài chính:** thêm/sửa/xóa phương thức thanh toán, đổi billing threshold, rút tiền — để user tự thao tác.
9. **Appeal/review:** tự động nộp appeal, spam nộp appeal, tự động trả lời Meta ở Support inbox.
10. **Nội dung thay mặt không consent:** đăng/sửa/xóa nội dung hoặc thao tác ads khi user chưa xác nhận từng lần (Dev Policies §1 — mỗi write cần consent kiểm chứng được).

---

## 5. Nguồn tham khảo

Chính thức (trang `facebook.com`/`meta.com` chặn IP môi trường này — bản Platform Terms & Developer Policies đọc qua capture Common Crawl CC-MAIN-2026-34 tháng 8/2026, cả hai hiển thị "Last updated February 3, 2026"):

1. Meta Platform Terms — https://developers.facebook.com/terms/
2. Meta Developer Policies — https://developers.facebook.com/devpolicy/
3. Marketing API Rate Limiting — https://developers.facebook.com/docs/marketing-api/overview/rate-limiting (capture CC-MAIN-2025-47, 11/2025)
4. Meta Terms of Service — https://www.facebook.com/legal/terms
5. "Leading the Fight Against Scraping-for-Hire" (12/1/2023; update settlement Voyager 13/12/2024) — https://about.fb.com/news/2023/01/leading-the-fight-against-scraping-for-hire/
6. "Taking Action Against Scraping for Hire" (Octopus/Mystalk, 7/2022) — https://about.fb.com/news/2022/07/actions-against-scraping-for-hire/
7. "Deterring Scraping by Protecting Facebook Identifiers" (9/2022, PFBID) — https://about.fb.com/news/2022/09/deterring-scraping-by-protecting-facebook-identifiers/
8. Meta Developer Blog (v26.0 release notes, 29/7/2026) — https://developers.facebook.com/blog/

Thứ cấp / case thực tế:

9. TechCrunch — "Meta settles lawsuit for 'significant' sum… BrandTotal/Unimania" (3/10/2022): https://techcrunch.com/2022/10/03/meta-settles-lawsuit-for-significant-sum-against-businesses-scraping-facebook-and-instagram-data/
10. TechCrunch — "Court rules in favor of a web scraper, Bright Data…" (24/1/2024): https://techcrunch.com/2024/01/24/court-rules-in-favor-of-a-web-scraper-bright-data-which-meta-had-used-and-then-sued/
11. TechCrunch — "Meta drops lawsuit against Bright Data" (26/2/2024): https://techcrunch.com/2024/02/26/meta-drops-lawsuit-against-web-scraping-firm-bright-data-that-sold-millions-of-instagram-records/
12. BBC — "Facebook and Instagram users complain of account bans" (7/2025): https://www.bbc.co.uk/news/articles/cvgnp9ykm3xo
13. BBC — "Meta admits wrongly suspending Facebook Groups" (7/2025): https://www.bbc.co.uk/news/articles/c3r9nwgvwy3o
14. PPC Land — "Meta blocks 47 commerce endpoints as Graph API v26.0 lands today" (29/7/2026): https://ppc.land/meta-blocks-47-commerce-endpoints-as-graph-api-v26-0-lands-today/
15. Multilogin Academy — "Why Do Facebook Ad Accounts Get Banned" (dấu hiệu detection): https://multilogin.com/academy/why-do-facebook-ad-accounts-get-banned/
16. Sprout Social — "Facebook automation: The ultimate guide" (khung automation-an-toàn phía brand): https://sproutsocial.com/insights/facebook-automation/

Chrome Web Store (truy cập trực tiếp 10/2026):

17. Program Policies (hub) — https://developer.chrome.com/docs/webstore/program-policies/
18. Limited Use — https://developer.chrome.com/docs/webstore/program-policies/limited-use/
19. Use of Permissions — https://developer.chrome.com/docs/webstore/program-policies/permissions/
20. Data Handling — https://developer.chrome.com/docs/webstore/program-policies/data-handling/
21. Privacy Policies — https://developer.chrome.com/docs/webstore/program-policies/privacy/
22. Quality Guidelines (single purpose) — https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines/
