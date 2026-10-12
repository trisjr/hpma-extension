# Research 03 — Tự động hóa Facebook Pages & Nội dung

> Phạm vi: đăng/đăng chéo bài lên nhiều Page, lên lịch bài + Reels hàng loạt, auto-reply comment theo keyword,
> ẩn/xóa comment spam, private reply vào inbox, auto-response tin nhắn, đồng bộ bài giữa các Page, moderation profile/từ cấm.
> Thời điểm nghiên cứu: **12/10/2026**. Graph API mới nhất: **v26.0** (phát hành 29/7/2026); v25.0 (18/2/2026) và v24.0 (8/10/2025) còn hỗ trợ.
> Nghiên cứu dựa trên tài liệu chính thức Meta (developers.facebook.com — nhiều trang được cập nhật tới 09/2026) và Meta Business Help Center.

---

## 1. Tổng quan

**Bức tranh API (10/2026):**

- **Pages API** là tên gọi chính thức hiện nay cho toàn bộ bề mặt công khai liên quan Facebook Pages
  (`developers.facebook.com/documentation/pages-api/*`). "Content Publishing API" — từng là closed beta (2023) cho
  Facebook Pages — **không còn là sản phẩm/docs riêng** (trang docs beta cũ nay 404); toàn bộ khả năng publish nằm trong
  Pages API: `/{page}/feed`, `/{page}/photos`, `/{page}/videos`, `/{page}/video_reels`. (Tên "Content Publishing API"
  hiện chỉ còn dùng cho **Instagram**, thuộc phạm vi file khác.)
- Tất cả thao tác đều qua **Page access token** (lấy từ user có page task phù hợp qua Facebook Login / Facebook Login
  for Business / Business Manager). Long-lived Page token **không có ngày hết hạn** (chỉ mất hiệu lực trong vài điều
  kiện), nên extension có thể lưu token và chạy tự động lâu dài [14].
- Hai "đường băng" chính thức cho gần như mọi tác vụ mục tiêu:
  1. **Graph API Writes**: đăng bài, lên lịch, comment, ẩn/xóa comment, ban user, gửi tin nhắn.
  2. **Webhooks** (field `feed`, `messages`, `conversations`): nhận sự kiện comment/tin nhắn **realtime** → nền tảng
     cho auto-reply, auto-hide spam, auto-DM.
- Meta Business Suite (MBS) đã làm sẵn khá nhiều (Planner lên lịch, Inbox Automations) nhưng có những **khoảng trống
  rõ rệt** — đây chính là giá trị extension nên lấp: đăng đồng loạt nhiều Facebook Page, bulk scheduling từ CSV/danh
  sách, auto-moderate comment theo keyword tùy ý, cross-page content sync, private reply theo rule.

**Điểm quan trọng về deprecation/thay đổi gần đây (2024–2026) [1][2][3][4]:**

- Graph API **v26.0** (7/2026): không có breaking change nào cho Pages publishing/Messenger; đáng chú ý là deprecation
  Commerce Order API, một số legacy protocol behavior (bỏ `pretty`, `debug`, `date_format`, `GET /?ids=`), và xóa vài
  field Page cũ cho New Pages Experience. v20.0 hết hạn 24/9/2026; v21 hết 1/2027 → **extension nên target v25/v26**.
- **v25.0** (2/2026): deprecate loạt Page/Post/Video Insights metrics (`page_posts_impressions*`, `post_impressions_unique`
  …) — ảnh hưởng tới báo cáo hiệu suất, không ảnh hưởng publishing. **mTLS Webhook**: từ 31/3/2026 Meta ký webhook cert
  bằng CA của Meta — server/backend nào verify cert webhook phải cập nhật trust store (với extension client-side thì ít
  liên quan, nhưng backend relay cần lưu ý).
- Non-versioned 2025: chủ yếu thay đổi oEmbed — không ảnh hưởng Pages automation.
- Reels API có **rate limit cứng: 30 bài đăng qua API trong 24 giờ rolling / Page** (áp cho `POST /{page}/video_reels`
  khi publish) [7]. Đây là con số quan trọng nhất cho tính năng "lên lịch Reels hàng loạt".

---

## 2. Danh sách tác vụ có thể tự động hóa

Chú thích: **Official API** = Graph API/Webhooks chính thức; **Browser** = automation trên UI facebook.com/Business
Suite (DOM); **Hybrid** = kết hợp cả hai. Độ khả thi xét cả chi phí App Review/duy trì.

| #   | Tác vụ                                                                | Cách tự động                                                                                                            | Độ khả thi     | Rủi ro & điều kiện                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Đăng bài text/link/ảnh lên 1 Page                                     | Official: `POST /{page}/feed`, `POST /{page}/photos` [8]                                                                | **Cao**        | `pages_manage_posts`, task `CREATE_CONTENT`. Post chỉ sửa được nếu do chính app đó tạo.                                                                                                                                                               |
| 2   | Đăng bài video (non-Reel)                                             | Official: Video API (3-phase upload)                                                                                    | **Cao**        | Thêm permission `publish_video`; upload resumable.                                                                                                                                                                                                    |
| 3   | **Đăng cùng nội dung lên nhiều Page (multi-page blast)**              | Official (loop qua từng Page token) — **MBS không có**                                                                  | **Cao**        | Mỗi Page cần token + `CREATE_CONTENT`; media phải upload lại từng Page (URL fbcdn bị reject) [7]. Nguy cơ bị spam-filter nếu duplicate trên số Page rất lớn trong thời gian ngắn — nên jitter/delay.                                                  |
| 4   | **Lên lịch bài hàng loạt (queue/CSV)**                                | Official: `/feed` với `published=false` + `scheduled_publish_time` [8]                                                  | **Cao**        | Khung lịch: **tối thiểu 10 phút, tối đa 30 ngày** tính từ lúc gọi API. Quản lý qua `GET /{page}/scheduled_posts` [12].                                                                                                                                |
| 5   | **Lên lịch Reels hàng loạt**                                          | Official: `POST /{page}/video_reels` (3 bước), `video_state=SCHEDULED` + `scheduled_publish_time` [7][9]                | **Cao**        | **Giới hạn 30 API-posts/24h/Page**; spec bắt buộc: 9:16, 540×960 min, 3–90s, 24–60fps, H.264/H.265.                                                                                                                                                   |
| 6   | Sửa / dời lịch / hủy bài đã lên lịch                                  | Official: `POST /{post-id}`, `DELETE /{post-id}`                                                                        | **Cao**        | Chỉ tác động được bài do chính app tạo ra (bài lên lịch bằng MBS không sửa được bằng API của app khác).                                                                                                                                               |
| 7   | Crosspost video/Reels giữa các Page                                   | Official + UI setup                                                                                                     | Trung bình     | Cần thiết lập quan hệ crosspost giữa 2 Page (xem `GET /{page}/crosspost_whitelisted_pages`); Reels chỉ crosspost sang Page (không sang profile/group) [7][17]. Với các Page tự sở hữu trong cùng BM, loop đăng trực tiếp thường đơn giản hơn.         |
| 8   | **Collaborator invite cho Reels (đăng lên Page của đối tác)**         | Official: `POST /{video-id}/collaborators` [7]                                                                          | **Cao**        | Tối đa **10 lời mời/Page/24h**; đối phương phải accept → phù hợp agency nhờ Page khách hàng đăng, không phải bulk.                                                                                                                                    |
| 9   | **Đồng bộ nội dung giữa các Page (mirror post)**                      | Official (đọc post nguồn → đăng lại các Page đích)                                                                      | Trung bình     | Không có cơ chế "sync" tự động của Meta; phải tự quản lý mapping post-id ↔ post-id; media phải host lại (fbcdn reject); nên có chính sách "source of truth".                                                                                         |
| 10  | Repost/re-queue bài cũ (evergreen)                                    | Official: đọc `/{page}/published_posts` → đăng lại                                                                      | **Cao**        | Tránh repost nguyên văn quá dày (spam signal).                                                                                                                                                                                                        |
| 11  | **Auto-reply comment theo keyword (rule engine riêng)**               | Official: Webhooks `feed` realtime + match + `POST /{comment-id}/comments`; có thể @mention bằng `@[PSID]` [10][13][16] | **Cao**        | `pages_manage_engagement`, task `MODERATE` + `CREATE_CONTENT`; subscribe webhook cần `pages_manage_metadata`. MBS chỉ có "comment to message" theo **hashtag** (desktop-only) — extension làm keyword tùy ý tốt hơn hẳn.                              |
| 12  | Batch reply nhiều comment (1 campaign trả lời hàng loạt)              | Official                                                                                                                | **Cao**        | Docs hỗ trợ nêu rõ use-case batch reply + mention nhiều PSID [10]; coi chừng rate limit và spam-pattern (náy reply text giống hệt nhau).                                                                                                              |
| 13  | **Tự động ẩn comment spam theo keyword/regex**                        | Official: `POST /{comment-id}` với `is_hidden=true` [15]                                                                | **Cao**        | Ưu tiên **hide** thay delete (hidden vẫn thấy bởi tác giả → an toàn chống "ghost ban" tranh cãi, undo dễ). Comment do Page của mình sở hữu post thì mới hide/delete được (kể cả comment trên ad posts).                                               |
| 14  | **Xóa comment spam hàng loạt**                                        | Official: `DELETE /{comment-id}`                                                                                        | **Cao**        | Không có bulk endpoint → 1 call/comment; theo dõi header `x-business-use-case-usage` / lỗi 80001/613. Nên có human-review queue cho trường hợp borderline.                                                                                            |
| 15  | Quét & dọn spam định kỳ (sweep) trên N bài gần nhất                   | Official: `GET /{post}/comments` (filter `toplevel`/`stream`) → rule → hide/delete                                      | **Cao**        | Webhook realtime tốt hơn polling; polling chịu rate limit (4800 × engaged users / 24h / app theo Page token).                                                                                                                                         |
| 16  | **Auto-moderate bằng AI (LLM chấm điểm toxic/spam)**                  | Hybrid: webhook + LLM + hide/delete                                                                                     | Trung bình–cao | Không phải API của Meta; rủi ro false-positive → mặc định hide + log + undo; cân nhắc chi phí latency (<30s không bắt buộc với comment, chỉ bắt buộc với bot Messenger).                                                                              |
| 17  | Ban/block user khỏi Page (hàng loạt)                                  | Official: `POST /{page}/blocked` (nhận list `user`/`psid`) [18]                                                         | **Cao**        | `pages_manage_engagement`; hành động nặng → nên log, cần rule rõ ràng (ví dụ: chỉ ban khi ≥N vi phạm).                                                                                                                                                |
| 18  | **Keyword blocklist / profanity filter ("từ cấm") của Page**          | Browser automation trên Settings UI, hoặc bỏ qua và dùng engine riêng (#13)                                             | Trung bình     | **Không có public Graph API** để set danh sách từ cấm (UI: Settings → Followers and public content; tối đa ~1.000 từ, tự ẩn cả biến thể chính tả) [20][21]. Khuyến nghị: dùng engine hide/delete riêng qua API thay vì ghi đè setting.                |
| 19  | **Private reply comment → Messenger inbox**                           | Official: `POST /{page}/messages` với `recipient.comment_id` (hoặc `post_id`) [11]                                      | **Cao**        | `pages_messaging` + task `MESSAGING`; **chỉ 1 tin/comment**, gửi trong **7 ngày** kể từ lúc comment; check field `can_reply_privately`; không gửi private reply cho Page khác.                                                                        |
| 20  | **Auto-response tin nhắn (chatbot keyword/FAQ)**                      | Official: Webhooks `messages` + Send API [5][6]                                                                         | **Cao**        | Standard messaging window 24h (tới 7 ngày nếu user đến từ Click-to-Messenger ad); ngoài window cần Message Tags / Human Agent tag (7 ngày) / OTN / Sponsored Messages. Bot "automated" phải trả lời mọi input trong 30s và có disclosure tự động hóa. |
| 21  | Gắn label, phân loại conversation trong inbox                         | Official: Custom Labels API                                                                                             | Trung bình     | Page admin phải accept Page Contact Terms một lần [6].                                                                                                                                                                                                |
| 22  | Đọc/quản lý inbox conversations (CRM nhẹ)                             | Official: `GET /{page}/conversations`, `/messages`                                                                      | **Cao**        | Conversations API: 2 calls/s/Page; Send API: 300 text calls/s/Page.                                                                                                                                                                                   |
| 23  | Đăng Story lên Page                                                   | Official: edge stories (photo/video) hoặc reel-as-story (≤60s)                                                          | Trung bình     | Tài liệu mỏng, ít cập nhật; Story 24h tự hết hạn — ưu tiên thấp.                                                                                                                                                                                      |
| 24  | Lấy danh sách bài đã đăng/đã lên lịch (dashboard tổng hợp nhiều Page) | Official: `/{page}/published_posts`, `/{page}/feed`, `/{page}/scheduled_posts`, `/{page}/video_reels` [8][12]           | **Cao**        | Rate limit theo Page engaged users; nên cache + incremental sync.                                                                                                                                                                                     |
| 25  | Auto-reply cho **comment trên ad posts** (dark posts)                 | Official: cùng Comment API; webhook `feed` vẫn push cho comments trên ad posts [16]                                     | **Cao**        | Ad posts cần thêm `pages_read_engagement`; lọc `post.promotion_status`.                                                                                                                                                                               |

---

## 3. Chi tiết kỹ thuật

### 3.1. Bản đồ endpoint chính (Graph API v26.0)

| Mục đích                | Endpoint                                                       | Method        | Ghi chú                                                                                                           |
| ----------------------- | -------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Đăng/sửa/xóa bài        | `/{page-id}/feed`, `/{page-id}/photos`, `/{post-id}`           | POST / DELETE | `message`, `link`, `published`, `scheduled_publish_time` (10' – 30 ngày) [8]                                      |
| Đăng Reels              | `/{page-id}/video_reels`                                       | POST          | 3 bước: `upload_phase=start` → upload lên `rupload.facebook.com` → `upload_phase=finish` + `video_state=PUBLISHED | SCHEDULED                              | DRAFT`, `description`, `title`, `place`, `is_ai_generated` [7][9] |
| Danh sách Reels/lịch    | `GET /{page-id}/video_reels`, `GET /{page-id}/scheduled_posts` | GET           | `since`/`until` khi list reels [7][12]                                                                            |
| Crosspost whitelist     | `GET /{page-id}/crosspost_whitelisted_pages`                   | GET           | Kiểm tra quan hệ crosspost đã thiết lập [17]                                                                      |
| Collaborator Reels      | `POST/GET /{video-id}/collaborators`                           | POST          | `target_id` = Page ID cộng tác; 10 mời/Page/24h [7]                                                               |
| Đọc comment             | `GET /{post-id}/comments`                                      | GET           | `fields=from,message,created_time`, paging cursor [10]                                                            |
| Reply comment           | `POST /{post-id}/comments`, `POST /{comment-id}/comments`      | POST          | Mention: `message=...@@[PSID]` (batch nhiều PSID được) [10]                                                       |
| Ẩn/hiện comment         | `POST /{comment-id}`                                           | POST          | `is_hidden=true                                                                                                   | false` [15]                            |
| Xóa comment             | `DELETE /{comment-id}`                                         | DELETE        | Task `MODERATE`                                                                                                   |
| Private reply           | `POST /{page-id}/messages`                                     | POST          | `recipient:{comment_id                                                                                            | post_id}`; 1 lần/comment, ≤7 ngày [11] |
| Gửi tin nhắn (Send API) | `POST /{page-id}/messages`                                     | POST          | `recipient:{id:PSID}`, 24h window / tags [5][6]                                                                   |
| Đọc inbox               | `GET /{page-id}/conversations`                                 | GET           | 2 calls/s/Page                                                                                                    |
| Ban user                | `POST /{page-id}/blocked`                                      | POST          | `user` (list), hoặc `psid`/`asid` list [18]                                                                       |
| Subscribe webhook       | `POST /{page-id}/subscribed_apps`                              | POST          | `subscribed_fields=feed,messages,...` [13]                                                                        |
| Webhook events          | server callback                                                | –             | Field `feed` (comment/post/reaction, kể cả comment trên ad post), `messages` [16]                                 |

### 3.2. Permissions & Page tasks

| Permission                   | Dùng cho                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pages_manage_posts`         | Đăng/sửa/xóa bài, schedule                                                                                             |
| `pages_read_engagement`      | Đọc post/comment/metadata Page                                                                                         |
| `pages_manage_engagement`    | Reply/hide/delete comment, ban user                                                                                    |
| `pages_read_user_engagement` | Đọc info người comment (PSID, name)                                                                                    |
| `pages_manage_metadata`      | Subscribe/unsubscribe webhooks (`subscribed_apps`)                                                                     |
| `pages_messaging`            | Send API, private reply, đọc conversations                                                                             |
| `pages_show_list`            | Liệt kê Pages của user (`/me/accounts`)                                                                                |
| `publish_video`              | Đăng video (non-reel)                                                                                                  |
| `business_management`        | **Dependency bắt buộc** của `pages_messaging`, `pages_show_list`, `instagram_manage_messages` (với Business Login) [5] |

Page tasks tương ứng: `CREATE_CONTENT` (publish), `MODERATE` (comment hide/delete/reply), `MESSAGING` (gửi tin), `MANAGE`
(subscribe webhook) [8][10][5][13]. Features qua App Review: **Page Public Content Access** (đọc nội dung public khi
không manage Page), **Page Mentioning**.

### 3.3. Auth flow & token (rất quan trọng cho extension)

1. User đăng nhập qua **Facebook Login** (app type Business kèm **Facebook Login for Business** nếu làm dạng Tech Provider/agency) với các permission trên → nhận short-lived **User token** (~1–2h).
2. Đổi sang **long-lived User token** (~60 ngày) qua `GET /oauth/access_token?grant_type=fb_exchange_token&client_id&client_secret&fb_exchange_token` — **bắt buộc gọi server-side vì chứa app secret** [14].
3. Gọi `GET /{app-scoped-user-id}/accounts` (hoặc `/me/accounts`) bằng long-lived User token → nhận **long-lived Page access token cho từng Page: không có ngày hết hạn** [14]. Đây là token extension lưu trữ và dùng gọi `/feed`, `/messages`…
4. Phương án cho chủ BM quản lý nhiều Page nội bộ: **System User token** (Business Manager) gắn sẵn assets → không hết hạn theo thời gian, phù hợp backend; nhưng yêu cầu Business Verification. (Chi tiết BM thuộc file nghiên cứu khác.)

**Lưu ý riêng cho Chrome extension (MV3):**

- Không nhúng được Facebook JS SDK login như web thường (CSP của MV3, popup/iframe bị hạn chế). Dùng
  `chrome.identity.launchWebAuthFlow` mở OAuth dialog của Facebook; redirect về `https://<extension-id>.chromiumapp.org/`.
- Vì bước đổi long-lived token cần **app secret**, cần một backend proxy nhỏ (hoặc dùng cơ chế code exchange
  `oauth/client_code` Meta hỗ trợ cho multi-client) — không được hard-code secret vào extension.
- Mọi call Graph API từ background service worker thuần `fetch` là đủ (REST), upload Reels bằng `fetch` binary lên
  `rupload.facebook.com`.
- Nếu app chỉ phục vụ các Page của chính team (user có role trên app): **Standard Access không cần App Review** —
  phù hợp giai đoạn đầu. Phân phối cho khách bên ngoài thì cần **Advanced Access + App Review + Business Verification**
  cho các permission trên [5][8].

### 3.4. Rate limits chính thức [19]

| Bề mặt                             | Giới hạn                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages API (Page/System-user token) | `4.800 × số engaged users` calls / **24h rolling** / app (per Page)                                                                                              |
| Platform (User/App token)          | `200 × số users` calls / **1h rolling** / app                                                                                                                    |
| Reels publishing                   | **30 API-posts / 24h rolling / Page** (cứng) [7]                                                                                                                 |
| Reels collaborator invites         | 10 mời / Page / 24h [7]                                                                                                                                          |
| Send API                           | 300 calls/s/Page (text), 10 calls/s/Page (media); cảnh báo "rate limited nếu spam 1 thread"                                                                      |
| Conversations API                  | 2 calls/s/Page                                                                                                                                                   |
| Private replies                    | 750 calls/h/Page (con số Meta công bố cho IG; FB áp cơ chế tương tự, không ghi số riêng)                                                                         |
| Mã lỗi thường gặp                  | `613` (app rate limit), `80001` (**too many calls to this Page account** — throttle theo Page), `368` (abusive/spam), `190` (token), `200`/283 (permission/task) |

Khuyến nghị kỹ thuật: đọc header `x-app-usage` / `x-business-use-case-usage` sau mỗi response để tự throttle; queue
per-Page + exponential backoff; **không** song song hóa ghi vào cùng 1 Page.

### 3.5. Realtime: Webhooks [13][16]

- Subscribe: `POST /{page-id}/subscribed_apps?subscribed_fields=feed` (cần `pages_manage_metadata` + `pages_show_list`,
  task CREATE_CONTENT/MANAGE/MODERATE). App cũng phải add webhook subscription cho object `page` trong App Dashboard.
- Field `feed` push gần như mọi thay đổi trên feed: comment mới (kèm `comment_id`, `from`, `message`, `post_id`),
  reaction, post mới… — không push cho ad posts nhưng **có push cho comment trên ad posts**. Page like chỉ push khi Page <10K likes.
- Đây là nền cho auto-reply/auto-hide **gần-thời-gian-thực**; với extension thuần client thì cần một webhook receiver
  (server nhỏ) hoặc chấp nhận **polling định kỳ** `GET /{post}/comments` khi người dùng mở browser — trade-off cần
  chốt sớm trong kiến trúc chung của nhóm.
- Lưu ý v25: CA ký chứng chỉ mTLS webhook đổi 31/3/2026 — backend verify cert phải cập nhật trust store [2].

### 3.6. Meta Business Suite đã làm sẵn (đừng tái tạo; hãy lấp gap) [22][23][24][25]

| MBS native                                                                                                                                                                                                                                                                                                  | Giới hạn                                                                                                                    | Khoảng trống cho extension                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Planner**: lịch tuần/tháng; schedule post/reel/story cho **1 FB Page + 1 IG lúc**; gợi ý "Active times" (7 ngày gần nhất) [22][24]                                                                                                                                                                        | Không đăng 1 lúc lên nhiều Facebook Page; không import CSV/bulk; quản lý từng bài một                                       | Multi-page scheduler + bulk queue (chức năng lõi)                                                    |
| **Content tab**: edit/reschedule/duplicate/delete/drafts/collaborator [24]                                                                                                                                                                                                                                  | Thao tác thủ công từng item                                                                                                 | Bulk actions, template, re-queue evergreen                                                           |
| **Inbox Automations**: Instant reply, Away message, FAQ, Location/Hours/Contact, **Custom keywords** (tối đa 5 keyword/1 automation, **exact match, case-sensitive**, gửi sau **15 phút**, chỉ desktop, template được ưu tiên hơn keyword), **Comment to message** (chỉ theo **hashtag**, chỉ desktop) [23] | Keyword chỉ áp cho **tin nhắn**, không áp cho public comment; chỉ hashtag cho comment; exact-match cứng; 15' delay bắt buộc | Rule engine cho **comment**: keyword/regex/AI → public reply / hide / private reply **ngay lập tức** |
| Moderation UI: keyword blocklist (~1.000 từ, ẩn cả biến thể), profanity filter, tag review, blocking [20][21]                                                                                                                                                                                               | Set thủ công từng Page, không API                                                                                           | Đồng bộ moderation profile giữa nhiều Page + engine xử lý tự động                                    |
| Meta Business Agent (AI trả lời Hội thoại)                                                                                                                                                                                                                                                                  | Khi bật thì các automations thủ công bị pause [23]                                                                          | Extension cung cấp rule-based control thay thế                                                       |

---

## 4. Khuyến nghị cho extension

**Ưu tiên P0 (làm trước — gap lớn nhất, API ổn định, ít rủi ro chính sách):**

1. **Multi-page publisher + bulk scheduler (posts + Reels)**: một màn hình soạn bài → chọn N Page → đăng ngay hoặc
   xếp hàng lên lịch theo khung giờ cho từng Page. Chu vi kỹ thuật: token pool per-Page, per-Page queue có jitter,
   tuân thủ cứng **30 Reels/24h/Page** (app phải tự enforce trước khi bắn API, vì Meta recommend như vậy [7]) và cửa
   sổ schedule 10'–30 ngày. Media upload per-Page.
2. **Comment command center + auto-moderation rules**: dashboard comment đa Page (polling khi mở extension, ưu tiên
   bài có comment mới), rule keyword/regex → **hide (mặc định) / delete / reply / private reply**, sweep hàng loạt,
   log + undo. Dùng `is_hidden` mặc định vì an toàn và lật ngược được.

**Ưu tiên P1:** 3. **Auto-reply comment theo keyword** (kèm mention `@[PSID]`, randomize nội dung reply để tránh spam pattern). 4. **Private reply → inbox** theo rule (check `can_reply_privately`, window 7 ngày, 1 tin/comment). 5. **Moderation profile đồng bộ giữa các Page**: quản lý 1 danh sách từ khóa tập trung; với mỗi Page vừa enforce
engine hide/delete riêng qua API, vừa (tùy chọn) hướng dẫn user set UI blocklist ~1.000 từ.

**Ưu tiên P2:** 6. Auto-DM bot (Send API + webhooks) — vì cần webhook receiver ổn định và phải tuân thủ policy bot (30s response,
disclosure, 24h window). Nếu nhóm có backend relay, đưa phần realtime (comment+messenger về) vào đó. 7. Evergreen re-queue, collaborator invites, Story posting — làm sau.

**Nguyên tắc an toàn/bền vững:**

- Chỉ dựa **Official API** cho các thao tác ghi; browser automation trên facebook.com dùng tối đa cho thứ không có API
  (ví dụ cài UI keyword blocklist) và phải đánh dấu "best effort, dễ vỡ".
- Không bao giờ đăng duplicate nguyên văn lên quá nhiều Page trong vài phút — stagger 2–5 phút/Page; tránh lỗi 368.
- Giữ `app_secret` ngoài extension (proxy đổi token hoặc PKCE-style code flow); lưu Page token trong
  `chrome.storage` local (không gửi lên server nếu không cần).
- Target **Graph API v25/v26**, viết version vào mọi call (`graph.facebook.com/v26.0/...`), theo dõi changelog theo
  chu kỳ ~6 tháng/version (v20 hết hạn 9/2026 → bài học là không hard-code version cũ).
- Hiển thị disclosure cho Reels (yêu cầu của Reels API: user phải thấy thông tin control + audience Public) và flag
  `is_ai_generated` khi nội dung AI [7].

---

## 5. Nguồn tham khảo

Tài liệu chính thức Meta (truy cập 12/10/2026):

1. Graph API Versions — https://developers.facebook.com/docs/graph-api/changelog/versions (v26.0 ra 29/7/2026)
2. Changelog v25.0 — https://developers.facebook.com/docs/graph-api/changelog/version25.0 (Insights deprecations, webhook mTLS CA)
3. Changelog v26.0 — https://developers.facebook.com/docs/graph-api/changelog/version26.0
4. Changelog v24.0 — https://developers.facebook.com/docs/graph-api/changelog/version24.0
5. Messenger Platform Overview (updated 28/9/2026) — https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview
6. Messenger Platform Policy (updated 28/9/2026) — https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy
7. Reels Publishing API (updated 30/7/2026) — https://developers.facebook.com/documentation/video-api/guides/reels-publishing
8. Pages API — Posts (updated 17/4/2026) — https://developers.facebook.com/docs/pages-api/posts
9. Reference: Page Video Reels v26 — https://developers.facebook.com/docs/graph-api/reference/page/video_reels
10. Pages API — Comments & @mentions (updated 16/4/2026) — https://developers.facebook.com/documentation/pages-api/comments-mentions
11. Private Replies (updated 16/4/2026) — https://developers.facebook.com/docs/messenger-platform/discovery/private-replies
12. Reference: Page Scheduled Posts — https://developers.facebook.com/docs/graph-api/reference/page/scheduled_posts
13. Reference: Page subscribed_apps (webhooks subscribe) — https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps
14. Long-lived access tokens (updated 30/6/2026) — https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived
15. Reference: Comment node (fields `can_reply_privately`, `is_private`…) — https://developers.facebook.com/docs/graph-api/reference/comment ; hide comment qua `POST /{comment-id} is_hidden=true` (xác nhận thêm trong guide Branded Content: https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/branded-content)
16. Webhooks reference — Page (`feed` field) — https://developers.facebook.com/docs/graph-api/webhooks/reference/page
17. Reference: Page crosspost_whitelisted_pages — https://developers.facebook.com/docs/graph-api/reference/page/crosspost_whitelisted_pages
18. Reference: Page blocked (ban user) — https://developers.facebook.com/docs/graph-api/reference/page/blocked
19. Graph API Rate Limiting — https://developers.facebook.com/docs/graph-api/overview/rate-limiting
20. Pages API Overview (tasks, tokens, PSID) — https://developers.facebook.com/documentation/pages-api/overview
21. FB Help: Block certain words from comments on your Page — https://www.facebook.com/help/messenger-app/131671940241729/
22. About Automated Responses in Meta Business Suite Inbox — https://www.facebook.com/business/help/395965998733706/
23. Use Planner in Meta Business Suite — https://www.facebook.com/business/help/1678733516458988/
24. Create and Manage Posts in Meta Business Suite — https://www.facebook.com/business/help/942827662903020
25. About Moderation for Facebook Pages (Meta Business Help) — https://business.facebook.com/business/help/552951912183103/
26. Out-of-cycle changes log — https://developers.facebook.com/docs/graph-api/changelog/out-of-cycle-changes (non-versioned 2025: oEmbed)
27. Nguồn phụ (cross-check MBS automations): blabla.ai/blog/facebook-page-auto-reply; napoleoncat.com/blog/facebook-automated-responses; commentwatchdog.com/blog (giới hạn ~1.000 từ của keyword blocklist)

**Ghi chú nghiên cứu:** developers.facebook.com chặn IP datacenter (HTTP 400); toàn bộ tài liệu được đọc qua reader
proxy + DuckDuckGo search. Một số URL cũ của "Content Publishing API beta" (2023) và crossposting guide nay 404 — đã
ghi nhận trong mục Tổng quan; khuyến nghị kiểm chứng lại bằng tài khoản developer thật trước khi chốt scope build.
