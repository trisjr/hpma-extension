# 14 — Mapping quyền UI Facebook → API + GraphQL nội bộ cho tác vụ "Chỉ định đối tác" (Partner Assignment)

> Phạm vi: tác vụ "Chỉ định đối tác (partner BM) vào tài sản TKQC kèm quyền" (edge `POST /act_{ad_account_id}/agencies`) và các tài sản liền kề (Page, Pixel/Dataset, Catalog). Nội dung: (a) bảng mapping nhãn quyền trên UI Business Settings (EN + VI) → giá trị `permitted_tasks`/`tasks`; (b) GraphQL nội bộ của UI `business.facebook.com` cho thao tác này — thực trạng nguồn tin công khai, cách learn-then-replay, độ ổn định; (c) payload mẫu hoàn chỉnh. Bổ sung góc nhìn token-trình-duyệt lên `04-bm-admin-assets.md` (đã cover official API) và không lặp lại kỹ thuật extension chung đã có ở `09-extension-techniques.md`.
> Trạng thái: **10/2026**, Graph API **v26**. Mỗi khẳng định được gắn **[Kiểm chứng]** (≥2 nguồn hoặc trích trực tiếp) hoặc **[Suy luận — cần test]**.

---

## 1. Tổng quan

Trên UI, thao tác "Chỉ định đối tác" nằm tại: **Meta Business Suite → Settings → mục Users → Partners → Add → "Give a partner access to your assets" → nhập Business Portfolio ID của đối tác → chọn tài sản + mức truy cập → "Assign assets"** [Kiểm chứng — Meta Business Help Center 1717412048538897, bản EN & VI]. Đặc điểm quan trọng của luồng này:

- Chỉ người có **full control** (VN: "toàn quyền kiểm soát") business portfolio mới add được partner; nếu BM có nhiều admin, hành động **có thể cần một admin khác approve** (UI có cơ chế approval 2 người) [Kiểm chứng — cùng nguồn trên].
- Partner nhận **full control** của tài sản chỉ quản lý được "mọi thứ" nhưng **không thể share tiếp tài sản đó cho BM thứ ba** — chỉ BM sở hữu mới share được [Kiểm chứng — Help Center 1717412048538897].
- Partner nhận **partial access** (VN: "quyền truy cập một phần") chỉ có thể gán cho người trong BM của họ đúng các task đã được cấp — thiết kế cho chuỗi agency 2 tầng [Kiểm chứng — Help Center 1717412048538897 + 442345745885606].
- Ở tầng API, phép gán này là edge **`/{asset_id}/agencies`** với 2 param chính: `business` (ID BM đối tác) và `permitted_tasks` (mảng enum). Đọc lại: `GET /{asset_id}/agencies` trả về các node Business kèm 4 field mặc định: `access_requested_time`, `access_status`, `access_updated_time`, `permitted_tasks` [Kiểm chứng — reference ad-account/agencies.md]. Edge song hành cho người cá nhân là `/{asset_id}/assigned_users` với param `user` + `tasks` (báo cáo 04 đã cover; ở đây chỉ dùng để đối chiếu enum).

**Bộ enum chính thức của Meta (v26)** — trích trực tiếp từ source Business SDK, cùng bộ giá trị ở cả Node SDK (`main`, v26.x) lẫn PHP SDK (`main`) → **[Kiểm chứng, 2 SDK độc lập]**:

| Object         | `PermittedTasks` (edge /agencies)                                                                                                                                                                                                                                                                    | `Tasks` (edge /assigned_users)                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| AdAccount      | `AA_ANALYZE, ADVERTISE, ANALYZE, DRAFT, MANAGE`                                                                                                                                                                                                                                                      | `AA_ANALYZE, ADVERTISE, ANALYZE, DRAFT, MANAGE` |
| AdsPixel       | `ADVERTISE, ANALYZE, EDIT, UPLOAD`                                                                                                                                                                                                                                                                   | `AA_ANALYZE, ADVERTISE, ANALYZE, EDIT, UPLOAD`  |
| ProductCatalog | `AA_ANALYZE, ADVERTISE, MANAGE, MANAGE_AR`                                                                                                                                                                                                                                                           | `AA_ANALYZE, ADVERTISE, MANAGE, MANAGE_AR`      |
| Page           | 29 giá trị: `ADVERTISE, ANALYZE, CASHIER_ROLE, CREATE_CONTENT, GLOBAL_STRUCTURE_MANAGEMENT, MANAGE, MANAGE_JOBS, MANAGE_LEADS, MESSAGING, MODERATE, MODERATE_COMMUNITY, PAGES_MESSAGING, PAGES_MESSAGING_SUBSCRIPTIONS, PROFILE_PLUS_*(14 giá trị), READ_PAGE_MAILBOXES, VIEW_MONETIZATION_INSIGHTS` | (giống PermittedTasks)                          |

Nguồn bổ sung thứ 3: chính docs reference của Meta xác nhận `tasks` POST `/act_{id}/assigned_users` là `array<enum {MANAGE, ADVERTISE, ANALYZE, DRAFT, AA_ANALYZE}>` và catalog là `array<enum {MANAGE, ADVERTISE, MANAGE_AR, AA_ANALYZE}>` — required [Kiểm chứng — ad-account_assigned_users.md, product-catalog_assigned_users.md].

---

## 2. Bảng mapping UI → API (phần a)

Nhãn UI lấy nguyên văn từ bảng chính thức của Meta "Business portfolio assets and their task-based access settings" (Help Center **1242256693745272**, cả bản EN lẫn `?locale=vi_VN`) [Kiểm chứng]. Cột "Giá trị API" map sang enum §1; các dòng có dấu `*?*` là map theo mô tả chức năng, chưa probe được ServerJS/UI trực tiếp → **[Suy luận — cần test]**.

### 2.1. Ad Account (Tài khoản quảng cáo) — edge `POST /act_{id}/agencies` & `POST /act_{id}/assigned_users`

| Nhãn quyền trên UI (EN)                   | Nhãn UI tiếng Việt                      | Giá trị API               | Loại truy cập | Ghi chú                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | --------------------------------------- | ------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manage campaigns                          | Quản lý chiến dịch                      | `["ADVERTISE","ANALYZE"]` | Partial       | Mô tả UI: "View ads, Create and edit ads, Access reports" = đúng định nghĩa role GENERAL_USER→`ADVERTISE+ANALYZE` trong docs [Kiểm chứng]                                                                                                                                        |
| View performance                          | Xem hiệu quả                            | `["ANALYZE"]`             | Partial       | Mô tả UI: "View ads, Access reports" [Kiểm chứng — tương đương role ANALYZE-only của docs]                                                                                                                                                                                       |
| Manage Creative Hub mockups               | Quản lý mẫu mô phỏng trong Creative Hub | `["DRAFT"]`               | Partial       | Docs: role `CREATIVE_HUB_MOCKUPS_MANAGER → ['DRAFT']` [Kiểm chứng]                                                                                                                                                                                                               |
| **Manage ad account** (cột "Full access") | Quản lý tài khoản quảng cáo             | `["MANAGE"]`              | Full          | Mô tả UI: "Control ad account settings, finances and permissions"; docs role `ADMIN → ['MANAGE','ADVERTISE','ANALYZE']` — khi gán `MANAGE` server tự suy ra ADVERTISE+ANALYZE [Kiểm chứng map chức năng; **suy luận** ở chi tiết server tự thêm task khi đọc lại — cần test GET] |
| — (không có nhãn UI)                      | —                                       | `AA_ANALYZE`              | —             | Không được Help Center nhắc; chỉ xuất hiện trong enum SDK + docs. Tên gợi ý task đọc-only phụ; an toàn nhất là **không chủ động gán**, chỉ quan sát khi GET [Suy luận — cần test]                                                                                                |

Legacy role→tasks chính thức (docs ad-account/assigned_users, section Updating — [Kiểm chứng], giữ lại để đọc dữ liệu cũ): `ADMIN → [MANAGE,ADVERTISE,ANALYZE]`; `GENERAL_USER → [ADVERTISE,ANALYZE]`; `REPORTS_ONLY → [ANALYZE]`; và cho Page: `MANAGER → [MANAGE,CREATE_CONTENT,MODERATE,ADVERTISE,ANALYZE,DRAFT]`, `CONTENT_CREATOR → [CREATE_CONTENT,MODERATE,ADVERTISE,ANALYZE,DRAFT]`, `MODERATOR → [MODERATE,ADVERTISE,ANALYZE,DRAFT]`, `ADVERTISER → [ADVERTISE,ANALYZE,DRAFT]`, `INSIGHTS_ANALYST → [ANALYZE,DRAFT]`, `CREATIVE_HUB_MOCKUPS_MANAGER → [DRAFT]`.

### 2.2. Page (Trang) — edge `POST /{page_id}/agencies` & `/assigned_users`

UI Page có **3 cột**: Partial access / Full access ("Everything") / **Full access with partner access** ("Everything except sensitive actions") — riêng cho partner, không làm được "sensitive actions" (gán/gỡ người, bước xóa Page) [Kiểm chứng — Help Center 1242256693745272 header Page; VI: "Quyền truy cập đầy đủ với quyền truy cập của đối tác" / "Mọi thứ, ngoại trừ các hành động nhạy cảm"].

| Nhãn UI (EN)                                       | Nhãn UI tiếng Việt                        | Giá trị API (Page hiện đại, NPE)                         | Giá trị legacy (BM cũ)           | Ghi chú                                                                                                                              |
| -------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Content                                            | Nội dung                                  | `PROFILE_PLUS_CREATE_CONTENT`                            | `CREATE_CONTENT`                 |                                                                                                                                      |
| Community activity                                 | Hoạt động cộng đồng                       | `PROFILE_PLUS_MODERATE`                                  | `MODERATE`                       |                                                                                                                                      |
| Messages and calls                                 | Tin nhắn và cuộc gọi                      | `PROFILE_PLUS_MESSAGING`                                 | `MESSAGING` / `PAGES_MESSAGING`  |                                                                                                                                      |
| Ads                                                | Quảng cáo                                 | `PROFILE_PLUS_ADVERTISE`                                 | `ADVERTISE`                      |                                                                                                                                      |
| Insights                                           | Thông tin chi tiết                        | `PROFILE_PLUS_ANALYZE`                                   | `ANALYZE`                        |                                                                                                                                      |
| Revenue                                            | Doanh thu                                 | `PROFILE_PLUS_REVENUE`                                   | `VIEW_MONETIZATION_INSIGHTS` _?_ | Map theo mô tả chức năng [Suy luận — cần test]                                                                                       |
| Creator management                                 | Quản lý người sáng tạo nội dung           | `PROFILE_PLUS_CREATOR_MANAGEMENT`                        | —                                | [Suy luận — cần test: chỉ hiện khi Page có quyền Creator Hub]                                                                        |
| Creator content                                    | Nội dung của người sáng tạo               | `PROFILE_PLUS_CREATIVE_MANAGEMENT` _?_                   | —                                | [Suy luận — cần test]                                                                                                                |
| Everything                                         | Tất cả                                    | `PROFILE_PLUS_FULL_CONTROL`                              | `MANAGE`                         | Gồm "Switch into the Page" (`PROFILE_PLUS_FACEBOOK_ACCESS` thường đi kèm trên NPE) [Suy luận cụm — cần test GET]                     |
| Everything except sensitive actions (partner full) | Mọi thứ, ngoại trừ các hành động nhạy cảm | `PROFILE_PLUS_FULL_CONTROL` kèm giới hạn server-side _?_ | `MANAGE` _?_                     | Meta không public enum "except sensitive"; UI có thể gửi cùng task set và backend gắn cờ partner-scope [Suy luận — cần test capture] |

> Phần còn lại của enum Page (`CASHIER_ROLE, MANAGE_JOBS, MANAGE_LEADS, MODERATE_COMMUNITY, PAGES_MESSAGING_SUBSCRIPTIONS, READ_PAGE_MAILBOXES, GLOBAL_STRUCTURE_MANAGEMENT/PROFILE_PLUS_GLOBAL_STRUCTURE_MANAGEMENT, PROFILE_PLUS_MANAGE, PROFILE_PLUS_MANAGE_LEADS, PROFILE_PLUS_MODERATE_DELEGATE_COMMUNITY`) tương ứng các tính năng chuyên biệt (Jobs, Leads, WhatsApp/subscription messaging, cộng đồng) — extension nên **pass-through** giá trị do người dùng chọn thay vì hardcode nhãn.

### 2.3. Pixel / Dataset (Tập dữ liệu & pixel) — edge `POST /{pixel_id}/agencies` & `/assigned_users`

| Nhãn UI (EN)          | Nhãn UI tiếng Việt             | Giá trị API                                   | Loại truy cập | Ghi chú                                                                                                                                                                                                                      |
| --------------------- | ------------------------------ | --------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use events dataset    | Sử dụng tập dữ liệu về sự kiện | `["ADVERTISE","ANALYZE"]` (+ `UPLOAD` _?_)    | Partial       | Mô tả UI: "View data, View analytics, Create conversion ads with this dataset" → ADVERTISE (tạo qc chuyển đổi) + ANALYZE (xem); **cần test xem server có tự thêm `UPLOAD`** [Kiểm chứng map chức năng / Suy luận thành phần] |
| Manage events dataset | Quản lý tập dữ liệu về sự kiện | `["EDIT","UPLOAD","ADVERTISE","ANALYZE"]` _?_ | Full          | Mô tả UI: "Control all settings, add or remove events, edit user access and create audiences" → theo enum Pixel ("full" = cả 4 giá trị của PermittedTasks); phần tử trọng tâm là `EDIT` [Suy luận — cần test]                |
| —                     | —                              | `AA_ANALYZE`                                  | —             | Chỉ có trong `Tasks` (đọc lại), không có trong `PermittedTasks` Pixel → không gán trực tiếp ở /agencies [Kiểm chứng — đối chiếu 2 enum SDK]                                                                                  |

### 2.4. Catalog (Danh mục) — edge `POST /{catalog_id}/agencies` & `/assigned_users`

| Nhãn UI (EN)      | Nhãn UI tiếng Việt | Giá trị API     | Loại truy cập | Ghi chú                                                                                                                                                                                            |
| ----------------- | ------------------ | --------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic             | Cơ bản             | `["ADVERTISE"]` | Partial       | Mô tả UI: "View products and data sources, create/edit product sets, select catalog when creating an ad, view events and catalog match rate" = legacy role `ADVERTISER` [Kiểm chứng map chức năng] |
| Manage everything | Quản lý mọi thứ    | `["MANAGE"]`    | Full          | Legacy `PermittedRoles.ADMIN` → `MANAGE` [Kiểm chứng — SDK enum + docs enum POST]                                                                                                                  |
| —                 | —                  | `MANAGE_AR`     | —             | Không có nhãn UI trong Help Center; theo tên là quản trị catalog **AR (Augmented Reality)** — chỉ áp dụng catalog loại AR [Suy luận — cần test]                                                    |
| —                 | —                  | `AA_ANALYZE`    | —             | Như AdAccount: chỉ nên quan sát khi GET [Suy luận — cần test]                                                                                                                                      |

---

## 3. Chi tiết kỹ thuật

### 3.1. Bộ endpoint tóm tắt (Graph API v26)

| Thao tác                                     | Endpoint                                              | Param                                                                 | Return/Lỗi                                                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gán partner vào TKQC                         | `POST /v26.0/act_{ad_account_id}/agencies`            | `business` (numeric, **required**), `permitted_tasks` (array enum)    | `{success:true}` [Kiểm chứng — SDK createAgency + reference DELETE; body POST **không còn được docs render** nhưng đã xác nhận qua SDK + kiểm chứng thực tiễn báo cáo 04] |
| Đọc danh sách partner của TKQC               | `GET /v26.0/act_{id}/agencies`                        | —                                                                     | node Business + `access_status`, `permitted_tasks`, `access_requested_time`, `access_updated_time`; lỗi 100/190/200/80004 [Kiểm chứng — reference]                        |
| Gỡ partner                                   | `DELETE /v26.0/act_{id}/agencies`                     | `business` (required)                                                 | `{success:true}`; lỗi 100/200 [Kiểm chứng — reference]                                                                                                                    |
| Gán user (cá nhân BSUID/SystemUser) vào TKQC | `POST /v26.0/act_{id}/assigned_users`                 | `user` (UID, required), `tasks` (array enum), `business` (BM context) | `{success:true}`; lỗi 100/200/**2620** ("Invalid call to update account permissions") [Kiểm chứng — reference]                                                            |
| Đọc user đã gán                              | `GET /v26.0/act_{id}/assigned_users?business={bm_id}` | `business` required                                                   | AssignedUser + `permitted_tasks` (task gán được), `tasks` (unpacked role→task của user đó); lỗi 100/190/200/368/80004 [Kiểm chứng — reference]                            |
| Gỡ user                                      | `DELETE .../assigned_users`                           | `user` required                                                       | `{success:true}`; lỗi 100/190/3919 [Kiểm chứng — reference]                                                                                                               |
| Tương tự cho Pixel/Catalog                   | `POST                                                 | GET                                                                   | DELETE /{pixel_id\|catalog_id}/agencies`+`/assigned_users`                                                                                                                | cùng dạng | Catalog POST `/assigned_users` yêu cầu `tasks` (**required**) enum `{MANAGE, ADVERTISE, MANAGE_AR, AA_ANALYZE}` [Kiểm chứng — reference catalog] |

> Lưu ý 368 ("action deemed abusive") xuất hiện trong bảng lỗi chính thức của assigned_users — dấu hiệu Meta áp anti-abuse lên thao tác này; extension phải throttle + human-in-the-loop [Kiểm chứng — reference].

### 3.2. GraphQL nội bộ của UI BM cho thao tác Chỉ định đối tác (phần b)

**3.2.1. Khảo sát nguồn công khai — kết quả thực trạng.** Đã quét GitHub code search (`gh search code`) & Sourcegraph các cụm: `fb_api_req_friendly_name` + `agency|Partner|AssetScoping|BusinessManager`, `AssignPartnerToAsset`, `AssetAssign … graphql`, `BusinessPortfoliosMutation`, `GiveAccessToPartner`, `bizkit_web`, `permitted_tasks agencies`… **[Kiểm chứng: không một repo công khai nào chứa capture request của mutation "assign partner" hiện hành]**. Các repo về `fb_api_req_friendly_name` chỉ quanh flow user cá nhân (Instagram stories, friends, reactions); các dump JS màu mè cứu được từ site save chỉ là redirect stub. Kết luận vận hành: **không thể hardcode friendly_name/doc_id từ nguồn ngoài — bắt buộc learn-then-replay trên chính phiên của người dùng**. Đây vốn cũng là phương án đã chốt ở báo cáo 09 (Ưu tiên 3), mục này bổ sung bằng chứng thực địa.

**3.2.2. Manh mối chính chủ từ infra Meta (đáng tin nhất hiện có).** Trong bootstrap ServerJS do máy chủ Meta phục vụ trực tiếp (trang developers.facebook.com, locale vi_VN, 10/2026), cấu hình `AutoLoggingComponentValidatorListSitevarConfig` khai báo surface `business_settings` với allow-list component:

```
business_settings: COMPONENT_ALLOW_LIST: ["Ads.*","Business.*","^BizNotif(ication)?Jewel.*","^Billing.*",
  "AdAccount","Advertising","^BizKitSettings.*","AddEventsDataset","AssignPartnerToAsset",
  "AddProductCatalogDialogController"]
```

→ Xác nhận 3 điều **[Kiểm chứng — trích từ payload Meta phục vụ]**: (i) namespace module của Business Settings là **`BizKitSettings*`**; (ii) component flow gán partner tên **`AssignPartnerToAsset`** (và các dialog anh em `AddEventsDataset`, `AddProductCatalogDialogController`); (iii) phía server MH, "scoping" tài sản cho partner nằm trong family module này. Friendly name của Relay operation theo quy ước Comet thường dạng `<Component>...Mutation` / `use...Mutation` (hoặc `BizKitSettings...Mutation`) — **tên chính xác là [Suy luận — cần capture]**, nhưng regex lọc khi learn chỉ cần `/partner|asset|assign|agenc|scop/i` trên `fb_api_req_friendly_name` là đủ bắt đúng request.

**3.2.3. Quy trình "learn-then-replay" thực tế (cho extension MV3):**

1. **Learn (học)**: Bật DevTools → Network → filter `api/graphql` (hoặc `graphqlbatch`) trên `business.facebook.com` → thực hiện thủ công luồng Partners → Add → chọn asset + quyền → Assign **một lần**. Với mỗi POST liên quan (lọc thêm `friendly_name` theo regex trên) lưu lại toàn bộ form fields: `av`, `__user`, `__a=1`, `__req`, `dpr`, `fb_dtsg`, `jazoest`, `lsd`, `spin_r/spin_b/spin_t`, `server_timestamps=true`, `fb_api_req_friendly_name`, `fb_api_caller_class`, `doc_id`, `variables` (JSON).
   - `fb_dtsg` — trích từ JSON block `DTSGInitialData` / `DTSGInitData.token` trong HTML phiên; `lsd` từ block `"LSD",[],{"token":"..."}`; `jazoest` từ `SprinkleConfig` (`param_name:"jazoest", version:2` — giá trị đi kèm trong body dạng `jazoest=2xxxx`) **[Kiểm chứng — cả 3 block này hiện diện nguyên vẹn trong bootstrap Meta thật, đã trích đối chiếu từ chính dump 3.2.2]**.
   - `jazoest`: `SprinkleConfig` chỉ cung cấp **tên param** (`param_name:"jazoest"`) và **`version:2`** (chính là số `2` đứng đầu giá trị `jazoest=2xxxx`); bản thân giá trị là **checksum phía client tính từ `fb_dtsg`** — dạng `2` + tổng `charCodeAt` của chuỗi token (khớp cơ chế trong báo cáo 09). Lời khuyên vận hành vẫn an toàn như cũ: đọc trực tiếp từ page/request, không tự sinh [Kiểm chứng — SprinkleConfig version 2 trong bootstrap + đối chiếu báo cáo 09].
2. **Replay**: gọi `fetch('https://business.facebook.com/api/graphql/', {method:'POST', credentials:'include', body: FormData|URLSearchParams})` **trong MAIN world của tab BM đang mở** (kế thừa cookie HttpOnly + CSRF của phiên — xem báo cáo 09 §3.2). Chỉ thay các biến trong `variables` (ID tài sản `act_...`, `business` BM đối tác, task set, `client_mutation_id`).
3. **Re-learn khi lỗi**: request với `doc_id` cũ thường trả lỗi dạng invalid/expired query → fallback: yêu cầu người dùng mở lại dialog partner để extension "học" doc_id mới (interceptor Ưu tiên 3 ở báo cáo 09 thu thập doc_id theo thời gian thực).

**3.2.4. Độ ổn định.** Bootstrap cho thấy field `server_revision`/`__spin_r` (`"trunk"`) — mỗi deploy thay rev, và `doc_id` của persisted query đi kèm rev: **doc_id xoay theo chu kỳ deploy tuần–2 tuần**, còn `fb_api_req_friendly_name` + shape `variables` bền hơn đáng kể (đổi theo quý–năm) [Kiểm chứng logic từ cấu trúc bootstrap + khớp quan sát cộng đồng ghi ở báo cáo 09 §3.2]. Rủi ro phụ: các mutation **ghi** của BizKit có thể bị gắn thêm challenge/anti-abuse (em mục 368 ở trên, cùng họ hàng) → throttle, không retry vô hạn, bắt buộc confirm người dùng [Suy luận — dựa trên cơ chế error reference].

**3.2.5. Khi nào dùng GraphQL nội bộ thay EAAG+Graph API:**

- **Dùng EAAG + Graph API (REST)** cho Chỉ định đối tác vào TKQC/Page/Pixel/Catalog: edge `/agencies` ổn định nhiều năm, versioned, dễ kiểm thử, đỡ nhất sự phụ thuộc doc_id. Token EAAG trích từ phiên BM thuộc app web chính chủ Meta (full quyền session) → gọi được các edge Business Management mà app OAuth thường phải App Review `business_management` advanced mới có [Kiểm chứng cơ chế token (báo cáo 09 §3.3); **suy luận** khả năng gọi /agencies bằng EAAG — cần smoke test đầu triển khai].
- **Chỉ dùng GraphQL nội bộ** khi: asset/flow không có edge Graph tương đương (ví dụ Business Asset Group, một số flow Commerce/WABA/offline event set "full control", hoặc luồng approval 2-admin phải chạy đúng kênh UI), hoặc cần hiển thị đúng hành vi UI Meta.

### 3.3. Payload mẫu hoàn chỉnh (phần c)

**(c1) Chỉ định đối tác vào TKQC, FULL quyền ("Quản lý tài khoản quảng cáo") — Official Graph API + EAAG:**

```bash
curl -X POST "https://graph.facebook.com/v26.0/act_123456789/agencies" \
  -F "business=987654321098765" \
  -F 'permitted_tasks=["MANAGE"]' \
  -F "access_token=EAAG..."
```

**(c2) Partial — quyền chạy quảng cáo ("Quản lý chiến dịch" + "Xem hiệu quả"):**

```bash
curl -X POST "https://graph.facebook.com/v26.0/act_123456789/agencies" \
  -F "business=987654321098765" \
  -F 'permitted_tasks=["ADVERTISE","ANALYZE"]' \
  -F "access_token=EAAG..."
```

**(c3) Gán đa tài sản cùng partner qua Batch (Page + Pixel + Catalog):**

```jsonc
// POST https://graph.facebook.com/v26.0/?access_token=EAAG...
// body batch=[...] — 50 sub-request tối đa
[
  {
    "method": "POST",
    "relative_url": "act_123456789/agencies",
    "body": "business=987654321098765&permitted_tasks=[\"MANAGE\"]",
  },
  {
    "method": "POST",
    "relative_url": "111222333444/agencies",
    "body": "business=987654321098765&permitted_tasks=[\"PROFILE_PLUS_FULL_CONTROL\"]",
  }, // Page full (partner) — *suy luận task NPE, cần test; legacy dùng MANAGE*
  {
    "method": "POST",
    "relative_url": "555666777888/agencies",
    "body": "business=987654321098765&permitted_tasks=[\"EDIT\",\"UPLOAD\",\"ADVERTISE\",\"ANALYZE\"]",
  }, // Pixel full — *suy luận*
  {
    "method": "POST",
    "relative_url": "999000111222/agencies",
    "body": "business=987654321098765&permitted_tasks=[\"MANAGE\"]",
  }, // Catalog full — kiểm chứng
]
```

**(c4) Kiểm chứng sau khi gán (verify-read) + rollback:**

```bash
curl "https://graph.facebook.com/v26.0/act_123456789/agencies?access_token=EAAG..."
# mong đợi: data[] chứa Business 987654321098765 với access_status + permitted_tasks
curl -X DELETE "https://graph.facebook.com/v26.0/act_123456789/agencies?business=987654321098765&access_token=EAAG..."
```

**(c5) Template replay GraphQL nội bộ** — _giá trị `<...>` học từ capture theo §3.2.3; KHÔNG shipping sẵn trong extension_:

```js
await fetch('https://business.facebook.com/api/graphql/', {
  method: 'POST',
  credentials: 'include',
  body: new URLSearchParams({
    av: '<uid>',
    __user: '<uid>',
    __a: '1',
    __req: '<hex tăng dần trong phiên>',
    dpr: '1',
    fb_dtsg: '<DTSGInitData.token>',
    jazoest: '<jazoest>',
    lsd: '<LSD.token>',
    server_timestamps: 'true',
    fb_api_req_friendly_name: '<...AssignPartnerToAsset...Mutation>',
    fb_api_caller_class: 'RelayModern',
    doc_id: '<doc_id hiện hành>',
    variables: JSON.stringify({
      input: {
        business_id: '<BM của mình>',
        partner_business_id: '987654321098765',
        assets: [{ asset_id: 'act_123456789', tasks: ['MANAGE'] }], // shape thật theo capture
        client_mutation_id: '1',
      },
    }),
  }),
});
```

---

## 4. Khuyến nghị cho extension (hpma-extension)

1. **Đường chính cho tác vụ mục tiêu**: EAAG (trích từ tab `business.facebook.com`, xem báo cáo 09 §3.3) + `POST /v26.0/act_{id}/agencies` như (c1/c2). Đây là tổ hợp nhanh, không cần app review, edge ổn định. Smoke test ngay khi bắt tay implement: EAAG + POST /agencies + GET verify (§3.3 c4).
   > **Ghi chú phạm vi**: báo cáo 09 giới hạn EAAG ở mức **chỉ đọc**; file này mở rộng sang đường **GHI** (`POST /agencies`). Việc mở rộng chỉ chấp nhận được kèm điều kiện ràng buộc: bắt buộc smoke-test trên tài khoản thật (theo ma trận test ở khuyến nghị #6 bên dưới) và luôn có confirm của người dùng cho mọi thao tác write [Suy luận — cần test].
2. **Popup hiển thị song ngữ** các nhãn quyền theo đúng bảng §2 (EN/VI nguyên văn Help Center) — tránh tự dịch lệch nhãn (`Xem hiệu quả`, `Quản lý mẫu mô phỏng trong Creative Hub`, `Sử dụng tập dữ liệu về sự kiện`, `Quản lý mọi thứ`...).
3. **Guardrails**: (i) Dry-run + hiển thị diff (BM đối tác → asset → task set) trước khi POST; (ii) xác nhận 2 lớp khi có `MANAGE`/`PROFILE_PLUS_FULL_CONTROL`/`EDIT` (thao tác đọc lỗi từ `GET /agencies` sau POST — nếu `access_status` ≠ trạng thái kỳ vọng thì báo "có thể đang chờ approval của admin khác" — khớp cơ chế approval trong Help Center); (iii) throttle + xử lý lỗi 368/2620 (báo user, không retry ngay); (iv) log audit nội bộ từng call (CSV/JSONL trong options page như khuyến nghị chung báo cáo 04/09).
4. **Không hardcode**: enum đọc từ config nội bộ của extension (file JSON versioned), nhãn UI tách riêng; `AA_ANALYZE`/`MANAGE_AR` và các giá trị enum unused không render cho người dùng.
5. **GraphQL nội bộ chỉ là module opt-in** (Ưu tiên 3 của báo cáo 09) cho asset không có edge `/agencies`; áp dụng learn-then-replay §3.2.3, lọc friendly bằng regex `/partner|asset|assign|agenc|scop/i`, cache doc_id per-phiên, re-learn khi lỗi; không replay nếu chưa từng capture cùng surface cùng phiên.
6. **Ma trận cần test khi vào giai đoạn implement** (từ phần [Suy luận]): ý nghĩa thật của `AA_ANALYZE`; bộ task server trả về khi chọn "Full access" ở Pixel/Catalog/TKQC; `permitted_tasks` chính xác cho Page partner-full ("Everything except sensitive actions"); profile_NPE legacy hay PROFILE_PLUS được chấp nhận ở `/{page_id}/agencies`; EAAG từ BM có POST được `/agencies` cho mọi asset (đặc biệt Page) hay cần scope khác.

---

## 5. Nguồn tham khảo

1. Meta for Developers — Marketing API Reference (định dạng LLM `.md`, fetch trực tiếp 10/2026):
   - https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/agencies.md — GET/DELETE `/act_{id}/agencies`, 4 field mặc định (`access_requested_time/access_status/access_updated_time/permitted_tasks`), error codes 100/190/200/80004.
   - https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/assigned_users.md — enum POST `tasks {MANAGE,ADVERTISE,ANALYZE,DRAFT,AA_ANALYZE}` (required `user`), bảng legacy role→tasks, lỗi 2620/368/3919.
   - https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ads-pixel/agencies.md, …/ads-pixel/assigned_users.md, …/product-catalog/agencies.md, …/product-catalog/assigned_users.md — catalog POST enum `{MANAGE,ADVERTISE,MANAGE_AR,AA_ANALYZE}` (tasks required).
   - Index đầy đủ: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/llms.txt
2. Meta Business Help Center (đọc qua proxy r.jina.ai vì domain chặn bot trực tiếp):
   - https://www.facebook.com/business/help/1717412048538897 (+ `?locale=vi_VN`) — flow Partners → Add → Give a partner access; full control/partial access; approval; partner full control không share tiếp; partial ⇒ chỉ gán lại task đã được cấp.
   - https://business.facebook.com/business/help/442345745885606 — khái niệm full control/partial access của people & partner.
   - https://business.facebook.com/business/help/1242256693745272 (+ `?locale=vi_VN`) — **bảng chính thức "task-based access settings" cho từng asset** (Page/Ad account/IG/Threads/App/Datasets & pixels/Commerce/Catalog/WABA/Custom conversion/Offline event set/…), nguồn của mọi nhãn EN/VI trong §2.
3. Source Business SDK (cross-check enum; cùng giá trị ở cả 2 SDK):
   - https://raw.githubusercontent.com/facebook/facebook-nodejs-business-sdk/main/src/objects/ad-account.js, ads-pixel.js, product-catalog.js, page.js — enum `PermittedTasks`/`Tasks`.
   - https://github.com/facebook/facebook-php-business-sdk → `src/FacebookAds/Object/Values/{AdAccountTasksValues,AdAccountPermittedTasksValues,AdsPixelTasksValues,ProductCatalogPermittedTasksValues,PageTasksValues,PagePermittedTasksValues}.php`.
4. Chứng cứ infra Meta trích trực tiếp (bootstrap ServerJS của trang developers.facebook.com phục vụ 10/2026, lưu ở `/tmp/fbmd/product-catalog_agencies.md`): `AutoLoggingComponentValidatorListSitevarConfig → business_settings COMPONENT_ALLOW_LIST` chứa `AssignPartnerToAsset`, `^BizKitSettings.*`; block `SprinkleConfig` (jazoest v2), `LSD`, `DTSGInitData/DTSGInitialData`; `server_revision/__spin_r="trunk"` — cơ sở cho §3.2.2–3.2.4.
5. Quét khoảng trống nguồn: GitHub code search (qua `gh search code`, 10+ truy vấn cụm friendly_name/partner/agency/AssetScoping — kết quả rỗng), Sourcegraph stream search (`AssetScoping`, `AssignPartner`), grep.app (bị chặn), DuckDuckGo HTML qua r.jina.ai (dùng để tìm bài Help Center trên).
6. Kế thừa nội bộ: `docs/050-Research/04-bm-admin-assets.md` (endpoints/assumptions /agencies), `docs/050-Research/09-extension-techniques.md` (kỹ thuật EAAG, MAIN-world replay, giới hạn MV3) — file này chỉ bổ sung mapping quyền + tình trạng GraphQL nội bộ.
