# 09 — Kỹ thuật automation bằng Browser Extension trên giao diện Business Manager (BM)

> Phạm vi: cách một Chrome extension Manifest V3 (MV3) tự động hóa các tác vụ trên `business.facebook.com` và `adsmanager.facebook.com`; các kỹ thuật DOM automation, intercept GraphQL nội bộ, lấy token từ session web, rào cản MV3, các dự án open-source tương tự và đánh giá rủi ro.
> Thời điểm nghiên cứu: **2026-10-12**. Phiên bản Graph API mới nhất được xác minh độc lập 3 nguồn: **v26** (prob trực tiếp `graph.facebook.com/v26.0` — v22→v26 còn hiệu lực, v27+ trả `Unknown path components`; PyPI `facebook-business` = 26.0.2, phát hành 2026-09-21; một số repo MCP quảng bá "Meta Marketing API v26"). Nhịp phát hành API của Meta hiện tại ~4–5 tháng/major version (v23: 2025-06, v24: 2025-10, v25: 2026-03, v26: 2026-08).

---

## 1. Tổng quan

Ứng dụng web BM/Ads Manager (hạ tầng "Comet" của Meta: **React + Relay + GraphQL nội bộ**, SPA) có 3 kênh để extension can thiệp:

1. **Official Graph / Marketing API** từ extension (REST tới `graph.facebook.com/v26.0/...` với access token OAuth hợp lệ). Ổn định nhất, chính sách rõ ràng, nhưng cần Meta App + quyền `ads_management` (App Review cho Advanced Access) và không phủ hết 100% thao tác trên giao diện BM.
2. **Browser automation trên chính session web**: content script thao tác DOM (điền form, click), hoặc "hybrid" — đọc token/`fb_dtsg`/cookie từ trang rồi gọi thẳng GraphQL nội bộ (`/api/graphql/`) hoặc Graph API với token EAAG trích từ HTML của BM. Mạnh, phủ gần như mọi thao tác UI, nhưng **không chính thức, dễ vỡ và rủi ro tài khoản**.
3. **Intercept**: hook `fetch`/`XMLHttpRequest` trong MAIN world để đọc/ghi các request GraphQL mà BM tự phát (phục vụ scraping dữ liệu hiển thị, audit, hoặc replay request).

Bức tranh chung: thực tế các tool BM trên thị trường (Việt Nam lẫn quốc tế) đều kết hợp nhiều lớp — official API cho phần "được phép", DOM/GraphQL nội bộ cho phần UI không có API. MV3 siết nhiều khả năng (không blocking `webRequest`, service worker bị kết thúc sau ~30s idle, cấm remote code), nên kiến trúc đúng là: **logic nặng/tương tác trang để ở content script (hoặc MAIN-world script), background service worker chỉ điều phối + lưu state bằng `chrome.storage` + `chrome.alarms`**.

---

## 2. Danh sách tác vụ có thể tự động hóa

Nhóm theo việc người dùng BM hay làm thủ công. "Official API" = Graph/Marketing API v26. "Browser" = DOM hoặc GraphQL nội bộ qua session web.

| Tác vụ                                                                            | Cách tự động                                                                    | Độ khả thi     | Rủi ro & điều kiện                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| Export báo cáo hiệu suất campaign/ad set/ad (Insights)                            | Official API (`/insights`, asyncreport)                                         | Cao            | Cần `ads_read`/`ads_management`; Insights có tier throttle riêng (`x-fb-ads-insights-throttle`) |
| Pause/activate campaign, ad set, ad hàng loạt                                     | Official API (`POST status`)                                                    | Cao            | `ads_management`; thao tác ghi nhanh chóng hết hạn mức nếu account tier thấp                    |
| Đổi ngân sách (daily/lifetime budget) hàng loạt                                   | Official API                                                                    | Cao            | Cần chuẩn hóa đơn vị (minor unit/100)                                                           |
| Đổi bid strategy / cost cap / bid cap                                             | Official API                                                                    | Cao            | —                                                                                               |
| Đổi tên hàng loạt theo quy tắc                                                    | Official API                                                                    | Cao            | —                                                                                               |
| Duplicate campaign/ad set/ad                                                      | Official API (`/{id}/copies`)                                                   | Cao            | Với ad cần copy cả creative; dễ nhân bản lỗi                                                    |
| Tạo campaign/ad set/ad từ template                                                | Official API                                                                    | Cao → TB       | Chắc chắn nhất ở luồng "không Advantage+"; các field AI/auto cập nhật nhanh theo v26            |
| Upload ảnh/video creative, tạo ad creative + ad                                   | Official API (Ad Images/Videos, `/adcreatives`)                                 | Cao            | Video lớn qua resumable upload; extension nên proxy qua SW                                      |
| Cập nhật tracking/parameters, UTM                                                 | Official API                                                                    | Cao            | —                                                                                               |
| Tạo/quản Custom Audience, Lookalike                                               | Official API                                                                    | Cao            | Một số thao tác cần chấp nhận Terms of Service của audience                                     |
| Đọc lead từ Lead Ads (leadgen)                                                    | Official API (`leadgen_id/leadgen`) + Webhooks                                  | Cao            | Cần `leads_retrieval`; page access token                                                        |
| Đọc/ẩn/trả lời comment trên ads (dark post moderation)                            | Official API (comments edges trên ad post)                                      | Cao            | Cần quyền page (`pages_manage_engagement`)                                                      |
| Đăng/sửa Page post hàng loạt                                                      | Official API                                                                    | Cao            | `pages_manage_posts`                                                                            |
| Quản lý Catalog/Product feed (Commerce)                                           | Official API                                                                    | Cao            | `catalog_management`                                                                            |
| Rule tự động (auto-rules: tắt ad khi CPA > X)                                     | Hybrid: API poll + action                                                       | Cao            | Chính Meta có Automated Rules — nhiều khi chỉ cần expose UI                                     |
| Share audience/pixel giữa các BM/partner                                          | Hybrid (Business Management API cần system user advanced; UI share qua browser) | TB             | Phần lớn agency làm tay trên UI → ứng viên browser automation                                   |
| Thêm/xóa người trong BM, gán quyền asset                                          | Browser (UI) hoặc Business Management API (cần quyền cao)                       | TB             | Nhạy cảm, thao tác sai gây mất quyền truy cập                                                   |
| Kiểm tra ad account restriction / account quality / gửi appeal ("Request review") | Browser (Account Quality UI không có API đầy đủ)                                | TB → Thấp      | Appeal tự động = hành vi nhạy cảm; chỉ nên auto-fill, user bấm submit                           |
| Scrape Billing hub: hóa đơn, spend limit, payment method                          | Browser (scrape HTML/GraphQL nội bộ)                                            | TB             | Không có API billing đầy đủ cho user thường                                                     |
| Đọc Activity log của BM (ai làm gì, khi nào)                                      | Browser (GraphQL nội bộ)                                                        | TB             | Endpoint internal, doc_id đổi theo release                                                      |
| Accept/decline BM invitation, emergency access                                    | Browser                                                                         | TB             | —                                                                                               |
| Đổi attribution setting, optimization goal tại ad set                             | Official API                                                                    | Cao            | —                                                                                               |
| Đọc feedback score / quality ranking của Page                                     | Browser                                                                         | TB             | UI-only                                                                                         |
| Lấy EAAG token từ trang BM để nuôi tool ngoài                                     | Browser (regex page source)                                                     | Cao (kỹ thuật) | **Rủi ro cao**: token short-lived (~vài giờ), vi phạm ToS, dễ bị checkpoint                     |
| Scrape Ads Library (đối thủ)                                                      | Official Ad Library API (hoặc internal GraphQL)                                 | Cao/TB         | Có API chính thức cho Ad Library — ưu tiên dùng                                                 |

**Kết luận nhanh:** ~70% tác vụ bulk thao tác quảng cáo làm được hoàn toàn bằng Official API; ~20% (billing, activity log, share asset, account quality, notification) chỉ có trên UI → bắt buộc browser automation; ~10% (appeal, thêm người) nhạy cảm — chỉ nên assist, không full-auto.

---

## 3. Chi tiết kỹ thuật

### 3.1 Lớp DOM automation trên BM (React internals, selector rot)

BM là SPA React (Comet), render bằng Relay. Đặc điểm ảnh hưởng trực tiếp tới extension:

- **Class name auto-generated** (dạng `x1i10hfl xjbqb8w ...`) thay đổi theo từng deploy → **không dùng class selector**. Selector bền theo thứ tự: `role` + `aria-label` (Meta khá chuẩn vì a11y), nội dung text button, `href`/route, thứ tự tab; cuối cùng mới tới XPath tương đối.
- BM **hiếm `data-testid` ở production**; các tool selenium công khai (vd `MurtazaGujar/Auto-GrouP-Adder`, dòng script "ameerzaher") chủ yếu dựa `name`/`id` input — những hook cũ này hầu như không còn trên Comet.
- **React controlled input**: gán `input.value = x` trực tiếp không ghi vào state React. Pattern chuẩn cần dùng:
  ```js
  const setVal = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  ).set;
  setVal.call(el, newValue);
  el.dispatchEvent(new Event('input', { bubbles: true })); // hoặc 'change'
  ```
- **Click "thật"**: `el.click()` thường đủ cho button; với checkboxes/menu phức tạp nên dispatch chuỗi `pointerdown → mousedown → pointerup → mouseup → click` (`PointerEvent`) để qua được các guard.
- **SPA navigation**: không có page reload — dùng `MutationObserver` + hook `history.pushState` (hoặc poll URL) để biết màn hình đổi; flow automation phải viết dạng state machine "chờ element → act → chờ điều kiện", có timeout/retry. Repo tham chiếu `ntphong1501/Extension-Get-Token-EAAG` cũng dùng `MutationObserver` throttled để re-extract khi DOM đổi — pattern tương tự áp dụng cho wait-for-element.
- **React internals**: có thể duyệt cây fiber qua key `__reactFiber$*` trên DOM node để đọc props/state (vd lấy campaign id của dòng đang hiển thị). Mạnh nhưng **rất giòn** — key và shape fiber đổi theo version React (BM chạy React build riêng của Meta), chỉ nên dùng làm _hint_, không làm source of truth.
- **Content script chạy ở isolated world**: thấy DOM nhưng không thấy JS objects của trang (không `window.require`, không fiber-traverse trực tiếp). Muốn chạm JS context của trang phải inject vào **MAIN world** (`chrome.scripting.executeScript({world: 'MAIN'})`, hỗ trợ từ Chrome 111) và giao tiếp ngược lại bằng `window.postMessage`/`CustomEvent`.

### 3.2 Đọc/intercept GraphQL nội bộ của BM

BM gọi GraphQL nội bộ chủ yếu `POST https://www.facebook.com/api/graphql/` và `https://business.facebook.com/api/graphql/`, body form-urlencoded gồm các trường điển hình:

- `fb_dtsg` — CSRF token per-session (lấy từ input ẩn `name="fb_dtsg"` hoặc `DTSGInitialData` trong script nhúng). Hết hạn cùng phiên; thiếu/sai → 403.
- `jazoest` — hằng số kiểm tra sinh từ `fb_dtsg` (thường thấy dạng `jazoest=2xxxx`), trích từ page source.
- `lsd` — token phụ của form Facebook (input `name="lsd"` / key `LSD` trong JS bootstrap); BM GraphQL POST yêu cầu cả hai.
- `doc_id` — ID của persisted query. Mỗi màn hình BM dùng nhiều `doc_id`; **Meta rotate doc_id theo từng đợt deploy** (hàng tuần) → hardcode doc_id là nguồn vỡ số 1.
- `fb_api_req_friendly_name` — tên operation (vd các mutation kiểu `useAdsManager*Mutation`, `BusinessManager*`); bền hơn doc_id, dùng để định danh request khi intercept.
- `variables` — JSON payload thật của operation; `server_timestamps=true`, `av`/`__user` = uid tài khoản.

**Ba cách intercept từ MV3 extension** (theo độ thực dụng):

1. **Hook `fetch` + `XMLHttpRequest` trong MAIN world** (khuyến nghị): inject script ghi đè `window.fetch`/`XHR.prototype.send/Response`, parse body để lấy `fb_dtsg`/`lsd`/`doc_id`/`friendly_name`, đọc response (clone `response.clone()`), đẩy kết quả về content script qua `postMessage`. Ưu: thấy được cả request _và response_, không cần permission đặc biệt ngoài host/scripting. Nhược: cần inject sớm (`document_start`); nếu dùng `<script src>` sẽ dính CSP của trang → dùng `chrome.scripting.executeScript` (extension-privileged, không chịu CSP trang cho lần inject đầu).
2. **chrome.debugger (CDP `Network.getResponseBody`)**: mạnh nhất (thấy toàn bộ network như DevTools), nhưng **hiện banner "…đang debug trình duyệt này"** và `chrome.debugger` bị Chrome Web Store soi kỹ. Chỉ nên dùng nội bộ/dev, không dùng cho sản phẩm phân phối.
3. **declarativeNetRequest**: chỉ block/redirect/sửa header theo rule, **không đọc được body** — vô dụng cho sniffing GraphQL (đây là thay thế MV3 cho blocking `webRequest` của MV2, xem mục 3.6). `webRequest` còn lại ở MV3 chỉ ở dạng _observational_ (đọc metadata request), không có response body.

**Replay request**: sau khi học được format, extension có thể tự gọi `fetch('https://business.facebook.com/api/graphql/', {method:'POST', body: formData, credentials:'include'})` ngay trong MAIN world/page context (cookie + CSRF hợp lệ sẵn). Đây là cách nhanh nhất để "gọi thẳng API nội bộ từ extension". Bắt buộc gọi từ page context để kèm đúng cookie/CSRF; gọi từ background service worker sẽ thiếu ngữ cảnh cookie `HttpOnly` trừ khi dùng `chrome.cookies` để ghép thủ công (cookie `c_user`, `xs` là HttpOnly — đọc được qua `chrome.cookies` API nếu khai host permission, nhưng việc export cookie ra ngoài là rủi ro bảo mật lớn).

Cross-check cách cộng đồng làm: scraper Python `facebook-graphql-scraper` (FaustRen) dùng `selenium_wire` để capture GraphQL trả về khi cuộn trang — cùng tư tưởng intercept; tool desktop `Ids_DataXtractor_Automation` (TechQaiser) trích xuất đúng bộ `access_token, cookies, business token, fb_dtsg jazoest lsd` — xác nhận bộ tham số trên vẫn là "chìa khóa" năm 2026.

### 3.3 Lấy access token từ session web (EAAG)

- Trang `business.facebook.com` (đáng chú ý route `business_locations`) nhúng **user access token dạng EAAG ngay trong HTML/script inline** (JSON bootstrap). Một MV3 extension thực tế (`ntphong1501/Extension-Get-Token-EAAG`, mô tả: "Browser extension helps users get EAAG Token quickly") làm đúng vậy: content script `document_end` lấy `document.documentElement.outerHTML`, regex `/EAAG[A-Za-z0-9_-]{100,}/` qua nhiều pattern (`"apiAccessToken":"..."`, chuỗi JSON array, rà soát script tag, `localStorage/sessionStorage`, cả `window.*` objects như `bizKitSettingsConfig`), rồi lưu `chrome.storage.local` và bắn message về popup; có `MutationObserver` để bắt lại khi SPA render thêm.
- Đặc tính token EAAG loại này: **short-lived** (thường chỉ sống vài giờ — đúng định nghĩa short-lived user token của Meta), full quyền theo session web, và việc dùng nó gọi API từ tool ngoài là **dùng sai mục đích thiết kế** (Meta có thể phát hiện qua pattern gọi/IP/user-agent lệch chuẩn → checkpoint/khóa tài khoản). Chỉ nên dùng cho _đọc dữ liệu bổ trợ ngắn hạn trong chính phiên_, không nên lưu trữ lâu dài hay ship về server của bên thứ ba.
- Cách lấy token "đường chính": Meta for Developers App + Facebook Login (`ads_management`, `ads_read`, `business_management`...) → user token ngắn → đổi **long-lived ~60 ngày**, hoặc System User token (không hết hạn) trong BM cho tích hợp doanh nghiệp. Extension nên ưu tiên OAuth qua `chrome.identity.launchWebAuthFlow` hoặc kèm backend trung gian giữ token (refresh tại server), hạn chế tối đa việc trữ token trong extension.

### 3.4 Lưu trữ & bảo mật token trong extension

- `chrome.storage.local` là mặc định tiện nhất nhưng **không mã hóa**: file LevelDB trong profile có thể bị đọc vật lý, và `chrome.storage` bị rò qua DevTools của chính extension. Với token ngắn hạn EAAG: chấp nhận được cho cache phiên; với token dài hạn: **không lưu plaintext**.
- Lựa chọn tốt hơn: `chrome.storage.session` (chỉ RAM, mất khi trình duyệt đóng/SW restart — phù hợp token vài giờ); mã hóa envelope bằng WebCrypto (AES-GCM) với key dẫn xuất từ secret người dùng hoặc lưu key trong `storage.session`; tối ưu nhất: **token nằm ở backend OAuth của bạn**, extension chỉ giữ session cookie với backend.
- Nguyên tắc vận hành: không `console.log` token (repo mẫu ở mục 3.3 log 50 ký tự đầu — anti-pattern cần tránh); không gửi token trong URL (query string hiện trong history/logs); khai báo `host_permissions` tối thiểu (`business.facebook.com`, `www.facebook.com`, `graph.facebook.com`); không cho phép `web_accessible_resources` lộ asset chứa logic nhạy cảm (`matches: <all_urls>` trong repo mẫu kia là quá rộng — extension audit của Chrome Web Store sẽ soi); giới hạn quyền `cookies`/`debugger` nếu không bắt buộc.
- Việc trích cookie `c_user`/`xs` ra khỏi trình duyệt tương đương đánh cắp phiên — về mặt tuyến chính sách của Meta là nghiêm cấm, về kỹ thuật bảo mật là nợ rủi ro. Phần khuyến nghị ở mục 4 mặc định **không export cookie**.

### 3.5 Official Graph/Marketing API từ extension (khi dùng "đường chính")

- Base: `https://graph.facebook.com/v26.0/...`. Extension gọi trực tiếp từ background service worker (`fetch` không bị CORS với host permissions) — không cần nội dung trang.
- Permissions điển hình: `ads_read` (đọc/report), `ads_management` (ghi mọi thứ ads), `business_management` (đọc cấu trúc BM/asset), `pages_*` cho moderation/post; với Standard Access chỉ quản lý được tài khoản thuộc app/BM của người phát triển — muốn chạy cho khách cần **Advanced Access (App Review + Business Verification)**.
- Rate limits (đáng kể với extension nhiều người dùng):
  - Đếm theo **score/usage trả về qua header**: `x-app-usage`, `x-ad-account-usage`, `x-business-use-case-usage`, `x-fb-ads-insights-throttle` (riêng cho Insights). Chiến lược: đọc header, throttle client-side khi >70%, backoff theo `estimated_time_to_regain_access`.
  - Ghi hàng loạt (pause + đổi budget cả nghìn ad set) dễ chạm trần nhanh → gom batch API (`/?batch=[...]`) tới 50 request/batch và chạy qua SW với queue + `chrome.alarms`.
  - Insights nặng → dùng **async reports** (`/insights` với `async=true`/`adreportruns`) thay vì query đồng bộ.
- Webhooks (leadgen, ad object changes) không chạy được trong extension — cần backend nhận callback; extension chỉ là client.

### 3.6 Rào cản MV3 cụ thể (và hướng xử lý)

| Rào cản                                      | Chi tiết                                                                                                                    | Hướng xử lý trong hpma-extension                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocking `webRequest` bị xóa                 | MV3 thay bằng `declarativeNetRequest` (rules, không đọc body); blocking chỉ còn cho extension cài qua **enterprise policy** | Intercept bằng MAIN-world fetch/XHR hook (mục 3.2); DNR chỉ để sửa header khi cần                                                                                     |
| Background = service worker                  | Không DOM; **bị kill sau ~30s không hoạt động**; không `window`                                                             | Tự động hóa dài chạy tại content script/tab; SW chỉ điều phối; dùng `chrome.alarms` cho lịch; state persist ở `chrome.storage`; DOM parsing nặng → offscreen document |
| Cấm remotely hosted code                     | Mọi JS phải bundle sẵn; CSP extension page `script-src 'self'` (không `eval`)                                               | CRXJS/Vite build sẵn OK; không load engine automation từ CDN                                                                                                          |
| CSP của trang Facebook                       | Facebook có CSP chặt → không chèn `<script src>`, không `eval` trong page context                                           | Inject qua `chrome.scripting.executeScript` (world `MAIN`) thay vì script tag                                                                                         |
| Host permissions bị soi khi submit Web Store | `*.facebook.com/*` + `storage` + `scripting` là hợp lý; `debugger`/`cookies` phải justify                                   | Khai tối thiểu; tách optional permissions (`chrome.permissions.request`) cho tính năng nâng cao                                                                       |
| `chrome.debugger` banner                     | Cảnh báo người dùng liên tục                                                                                                | Tránh cho bản production                                                                                                                                              |
| SW idle & token hết hạn phiên                | Token EAAG vài giờ + SW không chạy liên tục                                                                                 | Refresh-on-demand từ tab BM đang mở; fail-soft khi không có tab hợp lệ                                                                                                |

### 3.7 Các dự án open-source tương tự và bài học

1. **`ntphong1501/Extension-Get-Token-EAAG`** (JS, MV3, 2025) — extension lấy EAAG từ `business.facebook.com`: regex HTML, script tags, storage, window objects; `MutationObserver` re-extract; offscreen document. → chứng minh _kỹ thuật token-harvest vẫn sống_, và manifest mẫu (`host_permissions facebook.com`, `storage`, `scripting`, `offscreen`).
2. **`TechQaiser/Ids_DataXtractor_Automation`** (Python/Selenium + ChromeDriver) — trích `access_token, cookies, business token, fb_dtsg, jazoest, lsd` hàng loạt tài khoản ra Excel; có luồng 2FA. → xác nhận bộ tham số GraphQL nội bộ cần thu thập; kiến trúc "log in + harvest" của tool desktop.
3. **`FaustRen/facebook-graphql-scraper`** (Python, `selenium_wire`) — bắt GraphQL response khi cuộn page → parse thành dữ liệu có cấu trúc. → kỹ thuật intercept-ngược từ browser; tác giả tự cảnh báo "có thể bị block tài khoản kể cả khi chỉ cuộn trang".
4. **`athm793/meta-ads-scraper`** (TypeScript, 55★, active 2026) — thu thập Meta Ad Library **bằng reverse-engineer internal GraphQL, không API key**. → minh chứng chuỗi intercept/replay hiện tại vẫn hiệu quả, nhưng phải bảo trì liên tục theo deploy của Meta.
5. Dòng repo legacy fb_dtsg (`MurtazaGujar/Auto-GrouP-Adder`, `muhammadyaacob/AutoTag-Friends-`, loạt script "ameerzaher") — pattern cũ `document.getElementsByName('fb_dtsg')[0]` + POST form; hầu hết trên giao diện cũ, đa số đã chết theo Comet → bài học về selector/endpoint rot.
6. Tham chiếu thị trường (không open-source): fingerprint browser (AdsPower/GoLogin/Dolphin) + tool VN (MAXcare, FPlus…) vận hành bằng cookie+GraphQL nội bộ; SaaS automation quy tắc (Revealbot, Madgicx, AdEspresso) chạy 100% Marketing API chính thức. Hệ sinh thái MCP mới 2025–2026 (pipeboard Meta Ads MCP, amekala/ads-mcp…) cho thấy xu hướng chính thống đang dồn về **official API + agent**, không phải browser automation.

### 3.8 Đánh giá độ ổn định & rủi ro từng kỹ thuật

| Kỹ thuật                                            | Ổn định với deploy của Meta                                                               | Rủi ro tài khoản                       | Rủi ro pháp lý/ToS   | Chi phí bảo trì |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------- | -------------------- | --------------- |
| Official Graph/Marketing API (token OAuth)          | Cao (versioned, sunset 2 năm/version)                                                     | Thấp                                   | Thấp (đúng sách)     | Thấp            |
| DOM automation (content script)                     | Trung bình → thấp (selector/flow đổi, A/B test)                                           | Trung bình (behavioral detection)      | Trung bình           | Cao             |
| MAIN-world hook & replay GraphQL nội bộ (`doc_id`…) | Thấp (doc_id/LSO rotate hàng tuần, schema đổi)                                            | Trung bình → cao                       | Cao (non-public API) | Rất cao         |
| EAAG harvest + gọi Graph API                        | Trung bình (token vẫn nhúng trong HTML hiện tại — đã kiểm chứng bằng repo hoạt động 2025) | Cao (token lạ IP/pattern → checkpoint) | Cao                  | Trung bình      |
| Export cookie c_user/xs cho tool ngoài              | Trung bình                                                                                | Rất cao                                | Rất cao              | —               |
| chrome.debugger scraping                            | Cao về kỹ thuật                                                                           | Thấp về detection nhưng UX xấu         | Cao (store policy)   | Trung bình      |

---

## 4. Khuyến nghị cho extension (hpma-extension)

Lộ trình đề xuất theo thứ tự (repo hiện đã có sẵn MV3 + background SW + content script + popup/options, Vite/CRXJS + React 19 + TS — đủ nền):

1. **Ưu tiên 1 — "Copilot trong trang BM"** _(cập nhật 12/10/2026: sau pivot DOM automation, UI copilot đặt ở side panel/popup/options, content script chạy headless — xem `file 21 §5.1`; câu dưới là khuyến nghị gốc trước pivot)_: content script trên `business.facebook.com`/`adsmanager.facebook.com` render panel (bảng bulk-action: filter theo tên → pause/đổi budget/đổi tên). Bản đầu thực thi qua **Official Marketing API v26** với token người dùng nhập/OAuth (`chrome.identity`); đây là phần an toàn, bền, chiếm ~70% giá trị. Gom batch + queue trong service worker, đọc header usage để throttle.
2. **Ưu tiên 2 — Token/session helper**: auto-detect EAAG trên trang BM theo đúng kỹ thuật repo mẫu (regex HTML + script tags), lưu `chrome.storage.session`, dùng làm fallback đọc-nhanh khi chưa có OAuth; xây sẵn đường đổi sang long-lived token/backend. Không ship token ra server ngoài mặc định.
3. **Ưu tiên 3 — MAIN-world interceptor (opt-in, tính năng nâng cao)**: inject hook `fetch`/XHR bằng `chrome.scripting` world `MAIN`, lưu _bản đồ doc_id ↔ friendly_name_ observed theo thời gian thực của chính browser user (không hardcode doc_id!), chỉ dùng cho các tác vụ UI-only: billing, activity log, account quality, share audience/pixel. Thiết kế "learn-then-replay": request nội bộ chỉ replay sau khi đã quan sát được payload mẫu trên phiên hiện tại → giảm tối đa breakage do rotate.
4. **Assist thay vì full-auto cho tác vụ nhạy cảm** (appeal, thêm người vào BM): auto-fill + highlight, người dùng bấm xác nhận. Log mọi thao tác ghi (audit trail trong options page).
5. **Nguyên tắc vận hành**: fail-soft (không retry vô hạn khi 403/checkpoint), human-in-the-loop cho bulk destructive, rate-limit client-side, consent rõ ràng trong onboarding về việc dùng non-public endpoints; cân nhắc phân phối ngoài Chrome Web Store (developer mode/enterprise) cho các module `debugger`/interceptor vì review store sẽ khó.

---

## 5. Nguồn tham khảo

- Probe trực tiếp phiên bản Graph API (script check v22–v28): `https://graph.facebook.com/v26.0/me` — v26 hợp lệ, v27+ `Unknown path components` (kiểm tra 2026-10-12).
- PyPI `facebook-business`: lịch sử release 23.0.0 (2025-06-17) → 26.0.2 (2026-09-21): https://pypi.org/pypi/facebook-business/json
- Meta Graph API Changelog (canonical): https://developers.facebook.com/docs/graph-api/changelog
- Meta Rate Limiting: https://developers.facebook.com/docs/graph-api/overview/rate-limiting
- Meta Access Tokens & expiration: https://developers.facebook.com/docs/facebook-login/guides/access-tokens
- Marketing API: https://developers.facebook.com/docs/marketing-apis ; Ad Library API: https://www.facebook.com/ads/library/api
- Chrome: Extension service workers: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
- Chrome: Content scripts (isolated worlds, capabilities): https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome: MV3 — thay blocking web requests bằng declarativeNetRequest: https://developer.chrome.com/docs/extensions/develop/migrate/blocking-web-requests
- Chrome: MV3 — thay `tabs.executeScript` bằng `chrome.scripting`: https://developer.chrome.com/docs/extensions/develop/migrate/api-calls ; ExecutionWorld MAIN: https://developer.chrome.com/docs/extensions/reference/api/scripting
- GitHub `ntphong1501/Extension-Get-Token-EAAG` (+ `content.js`, `manifest.json`): https://github.com/ntphong1501/Extension-Get-Token-EAAG
- GitHub `TechQaiser/Ids_DataXtractor_Automation`: https://github.com/TechQaiser/Ids_DataXtractor_Automation
- GitHub `FaustRen/facebook-graphql-scraper`: https://github.com/FaustRen/facebook-graphql-scraper
- GitHub `athm793/meta-ads-scraper` (55★, reverse-engineered internal GraphQL, Ad Library): https://github.com/athm793/meta-ads-scraper
- GitHub topics meta-ads/facebook-graph-api/facebook-marketing-api (quét hệ sinh thái MCP/Marketing API 2026): https://github.com/topics/meta-ads , https://github.com/topics/facebook-graph-api

> Lưu ý: các URL `developers.facebook.com` chặn bot-fetch (HTTP 400 từ môi trường nghiên cứu) — thông tin API được cross-check qua probe `graph.facebook.com` trực tiếp, metadata PyPI của Business SDK chính thức và các repo mã nguồn nêu trên.
