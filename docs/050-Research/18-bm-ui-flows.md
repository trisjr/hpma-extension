# 18 — Mapping tác vụ nghiệp vụ → luồng thao tác UI trên Business Settings

> Phạm vi: Vòng 3 — hướng **DOM automation**. Với từng tác vụ flagship (a–h), mô tả luồng click chuẩn trên UI Meta Business Suite / Business Settings **hiện hành**: điều kiện tiên quyết, URL surface, thứ tự bước, dialog xác nhận, nhãn nút/trường song ngữ EN+VI, trạng thái kết thúc, điểm bắt buộc human-in-the-loop (HITL), và ánh xạ ngược về `permitted_tasks`/tasks ở `14-partner-assign-mapping-graphql.md`. Đây là "spec" để build state machine cho content script.
> Không lặp lại: kỹ thuật DOM/selector/MutationObserver (`09-extension-techniques.md` §3.1), GraphQL nội bộ learn-then-replay (`14-partner-assign-mapping-graphql.md` §3.2), giá trị enum `permitted_tasks` (`14` §2), guardrail vận hành theo tài sản (`15-browser-session-ops-practice.md` §4), danh sách endpoint API tương đương (`04-bm-admin-assets.md`).
> Thời điểm nghiên cứu: **2026-10-12**.

---

## 1. Tổng quan

**Tại sao file này tồn tại:** hướng EAAG + Graph API gặp lỗi permission (token first-party scope hạn chế — edge ghi nhạy cảm kiểu `POST /act_{id}/agencies` trả code 10/200, xem `16-test-plan-eaag-agencies.md`). Pivot: **tự động hóa trực tiếp UI Business Settings** — UI luôn thực thi bằng Quyền của user đang đăng nhập, không phụ thuộc scope token. Mọi flow dưới đây được định nghĩa để chạy bằng DOM automation (state machine "chờ element → tác động → chờ điều kiện", kỹ thuật ở file 09 §3.1).

**Quy ước nền tảng (cross-check nhiều bài Help Center first-party):**

- Surface chính: **Meta Business Suite → Settings** = `https://business.facebook.com/latest/settings` [Kiểm chứng — link này xuất hiện nguyên văn trong mọi bài hướng dẫn dưới đây]. Deep-link được xác nhận bởi chính Meta: `/latest/settings/business_info`, `/latest/settings/requests` [Kiểm chứng]; các slug con khác (`/partners`, `/people`, `/ad_accounts`, `/ad_datasets`…) **[Suy luận — cần test]** vì Help Center chỉ dẫn đường bằng menu trái, không dẫn URL.
- Trình bày menu trái của Settings: nhóm **Users** (Người dùng) gồm **People / Partners / System users** — 3 loại user [Kiểm chứng — HC 2399703093590353]; nhóm **Accounts** (Tài khoản) gồm Pages, Ad accounts…; nhóm **Data sources** (Nguồn dữ liệu) gồm Datasets & pixels, Offline event sets… [Kiểm chứng — HC 889971929474339 + 352686481592916].
- Quyền hệ danh: **full control** = "toàn quyền kiểm soát" (cũ: business admin); **basic access** = "quyền truy cập cơ bản" (cũ: employee); **apps and integrations** (cũ: developer); tùy chọn nâng cao **finance access**; **temporary access** (quyền tạm thời 3–75 ngày, tự thu hồi) [Kiểm chứng — HC 442345745885606].
- **Nhãn VI trong tài liệu này lấy từ bản `?locale=vi_VN` của Help Center** — dịch thuật sản phẩm thực tế có thể lệch nhẹ theo cohort A/B **[Suy luận — cần test trên UI thật]**. Khuyến nghị kỹ thuật: state machine nên match cả bộ nhãn EN lẫn VI (hoặc theo `role`/`aria-label`, xem file 09 §3.1), không hardcode một locale.
- Cơ chế chung quan trọng: **nhiều thao tác phân quyền có thể cần "một người khác có toàn quyền kiểm soát" phê duyệt** tại **Requests** (`/latest/settings/requests`, VI: **Yêu cầu**) [Kiểm chứng — HC 1717412048538897, 2169003770027706, 353397428740939]. Với DOM automation điều này nghĩa là: _hoàn thành dialog ≠ hoàn thành tác vụ_ — bắt buộc verify bước cuối (xem "Trạng thái kết thúc" mỗi flow).

---

## 2. Ma trận tổng hợp 8 flow

| #   | Tác vụ                                | Prereq                                               | Surface chính                          | Dialog xác nhận                                          | HITL bắt buộc                                        | Ánh xạ API (file 14/04)                                   |
| --- | ------------------------------------- | ---------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | -------- |
| a   | Chỉ định đối tác vào TKQC             | Full control BM; có BM ID đối tác                    | Settings → Users → Partners            | Có (Assign assets) + có thể approval admin thứ 2         | Trước khi nhấn Assign; khi chọn quyền full           | `POST /act_{id}/agencies` `permitted_tasks`               |
| b   | Gỡ partner                            | Full control                                         | Settings → Partners → Options          | Có (Remove partner)                                      | **Bắt buộc confirm 2 lớp** (destructive, file 15 §4) | `DELETE /act_{id}/agencies?business=`                     |
| c   | Share pixel/dataset cho partner       | Full control; BM sở hữu dataset; partner có BM riêng | Settings → Data sources → Datasets     | Next (ít xác nhận hơn a); + cụm pháp lý sharing controls | Khi cụm "declare relationship + reaffirm terms" hiện | `POST /{pixel_id}/agencies`; `shared_accounts`            |
| d   | Đổi tên TKQC                          | Quyền manage trên TKQC                               | Settings → Accounts → Ad accounts      | Không dialog riêng **[Suy luận — cần test]**             | Nhẹ — chỉ dry-run + log                              | `POST /act_{id}` `{name}`                                 |
| e   | Invite people / đổi role / remove     | Full control; email khớp tài khoản FB                | Settings → People                      | Invite; Save; Remove + confirm; có thể approval          | Khi gán full control; remove person (2 lớp)          | `POST/DELETE /{business_id}/business_users`               |
| f   | Đọc danh sách agencies/clients        | Thành viên BM (đọc); full control cho chế độ đủ      | Settings → Partners (+ per-asset view) | — (read-only)                                            | Không                                                | `GET /{business_id}/agencies                              | clients` |
| g   | Account quality / trạng thái TKQC     | Quyền vào TKQC/BM                                    | `facebook.com/accountquality`          | — (read-only)                                            | **Tuyệt đối không auto "Request review"**            | `GET /act_{id}?fields=account_status`                     |
| h   | 2FA requirement + báo cáo ai chưa bật | Full control                                         | Settings → Business portfolio info     | Confirm lựa chọn (hiệu lực ngay)                         | Chọn "Mọi người" (luồng phá khóa user chưa 2FA)      | `POST /{business_id}` `two_factor_type`; `two_fac_status` |

---

## 3. Flow (a) — Chỉ định đối tác (partner BM) vào TKQC kèm quyền

**Nguồn:** HC 1717412048538897 (đã fetch EN + VI, 12/10/2026) — **[Kiểm chứng]**; enum quyền theo file 14 §2.1.

- **Điều kiện tiên quyết:** user đang full control BM nguồn (nếu không, menu **Partners/Đối tác** không hiện); có **business portfolio ID** của đối tác (đối tác tìm ở Settings của họ — HC 1181250022022158).
- **URL surface:** `business.facebook.com/latest/settings` → menu trái nhóm **Users/Người dùng** → **Partners/Đối tác**.
- **Các bước (EN / VI):**
  1. Click **Partners** / **Đối tác** trong phần **Users** / **Người dùng** [Kiểm chứng].
  2. Click **Add** / **Thêm** → chọn **Give a partner access to your assets** / **Cấp cho đối tác quyền truy cập vào tài sản của bạn** [Kiểm chứng]. (Lựa chọn đối lập "Ask a partner to share assets with your business" — HC 408759743051505 — là chiều ngược: xin tài sản từ đối tác, không dùng cho flow này.)
  3. Nhập **partner's business portfolio ID** / **ID trang quản lý tài sản doanh nghiệp của đối tác** → **Next** / **Tiếp** [Kiểm chứng]. Automation: validate chuỗi số trước khi điền (15–17 chữ số) để tránh lỗi form ngầm.
  4. **Choose business assets + level of access** / **Chọn tài sản doanh nghiệp… và cấp độ quyền truy cập**: chọn ad account(s); nếu partial access thì tick **tasks** / **nhiệm vụ** [Kiểm chứng]. Nhãn quyền TKQC → `permitted_tasks` (file 14 §2.1): _Manage campaigns / Quản lý chiến dịch_ = `ADVERTISE,ANALYZE`; _View performance / Xem hiệu quả_ = `ANALYZE`; _Manage Creative Hub mockups_ = `DRAFT`; _Manage ad account / Quản lý tài khoản quảng cáo_ (full) = `MANAGE`.
  5. Click **Assign assets** / **Chỉ định tài sản** [Kiểm chứng].
- **Dialog/xác nhận:** bước 1–5 nằm trong 1 dialog/flow nhiều bước; sau Assign có thể xuất hiện thông báo _"Someone else with full control… may need to approve this action"_ → yêu cầu chuyển sang **Requests/Yêu cầu** [Kiểm chứng].
- **Trạng thái kết thúc:** partner xuất hiện ở trang Partners cả 2 phía; tài sản dùng chung hiện trong Settings của cả 2 BM. Automation phải **re-read trang Partners** (hoặc reload) để xác nhận [Kiểm chứng]; nếu thấy trạng thái pending-approval → báo "chờ admin thứ 2 duyệt", KHÔNG replay lại thao tác (trùng yêu cầu).
- **HITL bắt buộc:** (i) trước bước 5 — hiển thị diff (BM đối tác × asset × task set) cho user bấm xác nhận; (ii) khi chọn mức full/`MANAGE` — confirm 2 lớp (đồng bộ guardrail file 15 §4.B); (iii) nếu dialog approval admin-thứ-2 xuất hiện → dừng, giao user xử lý.
- **Ánh xạ ngược file 14:** UI "Give a partner access… → Assign assets" chính là phần tử UI tương ứng mutation internal `AssignPartnerToAsset` (file 14 §3.2.2) và edge `POST /{asset}/agencies` — nhãn quyền lấy tức thì từ bảng 14 §2.

## 4. Flow (b) — Gỡ partner khỏi BM

**Nguồn:** HC 2222659621282858 (đã fetch EN; bản VI bị login wall — nhãn VI đánh dấu suy luận) — **[Kiểm chứng EN]**.

- **Prereq:** full control BM; partner đang nằm trong BM của mình (khác với gỡ từng người trên từng asset — bài phân biệt rõ 2 thao tác).
- **Bước:** 1. **Settings** → **Partners** / **Đối tác**; 2. Click nút **Options** (biểu tượng 3 chấm, góc trên phải) → **Remove from business portfolio**; 3. Click **Remove partner** trong dialog xác nhận [Kiểm chứng — EN nguyên văn]. Nhãn VI suy luận: **Tùy chọn** → **Xóa khỏi trang quản lý tài sản doanh nghiệp** → **Xóa đối tác** — cụm "xóa đối tác khỏi trang quản lý tài sản doanh nghiệp" được xác nhận từ link chéo tiếng Việt trong HC 1717412048538897-VI [Kiểm chứng cụm dài / Suy luận nhãn nút ngắn].
- **Trạng thái kết thúc:** partner biến mất khỏi danh sách; tài sản đã share cho họ bị thu hồi theo **từng asset** — lưu ý flow này gỡ partner ở cấp BM; gỡ partner trên **1 asset** (vd. chỉ gỡ khỏi 1 TKQC) theo logic file 14 là `DELETE /{asset}/agencies?business=` — trên UI làm trong detail panel của asset đó **[Suy luận — cần test vị trí nút]**.
- **HITL:** destructive + ảnh hưởng ngay hoạt động ads của đối tác → **confirm 2 lớp + ghi audit** (file 15 §4.B quy tắc chung; file 04 #30). Không batch gỡ partner tự động khi chưa có dry-run.

## 5. Flow (c) — Share pixel/dataset cho partner

**Nguồn:** HC 889971929474339 (EN+VI, đã fetch) + HC 352686481592916 (sharing controls) — **[Kiểm chứng]**.

- **Prereq:** BM sở hữu dataset; user full control; partner có BM riêng.
- **Bước (EN / VI):** 1. **Settings** → **Data sources** / **Nguồn dữ liệu**; 2. chọn **Datasets** / **Tập dữ liệu** (UI cũ: "Datasets & pixels"); 3. click **Assign partners** / **Chỉ định đối tác**; 4. nhập **partner's business portfolio ID**; 5. **Toggle the level of access** / **Bật cấp độ quyền truy cập** muốn cấp; 6. **Next** / **Tiếp** [Kiểm chứng cả 2 ngôn ngữ].
- **Nhãn quyền → tasks (file 14 §2.3):** _Use events dataset / Sử dụng tập dữ liệu về sự kiện_ ≈ `ADVERTISE,ANALYZE` (+ `UPLOAD` suy luận); _Manage events dataset / Quản lý tập dữ liệu về sự kiện_ ≈ `EDIT,UPLOAD,ADVERTISE,ANALYZE`.
- **Lớp pháp lý đi kèm (sharing controls):** khi share lần đầu cho một BM, Meta yêu cầu **declare business relationship type** + **reaffirm Business Tools Terms** + **đối tác đích phải đồng ý (recipient agreement)** [Kiểm chứng — HC 352686481592916]. Request chờ xử lý xem tại **Settings → Data sources → Datasets & pixels → Partners** (tương tự Offline event sets, Apps) [Kiểm chứng]. → Automation phải coi đây là **bước HITL**: không tự tick đồng ý điều khoản thay user; sau khi submit phải kiểm tra tab Partners để xác nhận pending/accepted **[Suy luận trạng thái cuối — cần test]**.
- **Gỡ quyền:** bài liên kết "How to remove access from your dataset" (HC 1386566848933413 — chưa fetch, **cần kiểm chứng nhãn**).
- **Ánh xạ:** tương đương `POST /{pixel_id}/agencies` / `shared_accounts` (file 04 #18); khi pivot cần cho phép chọn **ad account nhận share** trong bước toggle quyền — tham số `account_id|ad_account` phía API **[Suy luận vị trí UI — cần test]**.

## 6. Flow (d) — Đổi tên TKQC

**Nguồn:** không tìm thấy bài Help Center first-party riêng cho "rename ad account" hiện hành → thân flow là **[Suy luận — cần test]**, neo bởi: HC 410559398627376 (vị trí "Ad account settings"/"Ad account setup") + bằng chứng tool M1 (BMTool đổi tên TKQC công khai — file 15 §2.1) + API tương đương đã kiểm chứng với session token (`POST /act_{id}` `{name}` — file 13 §2.2).

- **Surface 1 (Business Settings):** `latest/settings` → **Accounts / Tài khoản** → **Ad accounts / Tài khoản quảng cáo** → chọn TKQC → panel chi tiết phải → sửa ô **tên** (hoặc menu "…" → Rename) **[Suy luận — cần test control chính xác]**. Save inline → re-read tên sau khi blur/Enter.
- **Surface 2 (Ads Manager):** **Ad account settings** → mục **Ad account setup** → edit tên [Kiểm chứng vị trí nhóm setting — HC 410559398627376; Suy luận nhãn field].
- **HITL:** thấp — chỉ cần dry-run + audit log; nhưng **không rename hàng loạt khi TKQC đang UNSETTLED/RISK_REVIEW** (pre-flight file 15 §4.A).
- **Trạng thái kết thúc:** tên mới hiển thị đồng nhất trên cả 2 surface; nếu phải reload mới thấy → ghi nhận cache SPA, verify bằng reload.

## 7. Flow (e) — Mời người vào BM, đổi role, xóa người

**Nguồn:** HC 2169003770027706 (EN+VI, đã fetch) + 353397428740939 (EN) + 299504287548592 (EN+VI) — **[Kiểm chứng]**.

**Invite:**

1. **Settings** → **People / Mọi người** → **Invite people / Mời mọi người** (góc trên phải) [Kiểm chứng].
2. Nhập **email khớp tài khoản Facebook** của người được mời (hoặc chọn managed Meta account nếu org đã migrate) → **Next / Tiếp** [Kiểm chứng].
3. Chọn **portfolio permissions** (mặc định **basic**; full control = admin) → **Next / Tiếp** [Kiểm chứng].
4. Chọn **business assets + permissions** → **Invite / Mời** [Kiểm chứng].

- **Trạng thái kết thúc:** người được mời **phải tự accept** (HC 351956468742349) — Meta ghi "vài ngày mới đủ tính năng" [Kiểm chứng]; automation tuyệt đối không nhắm tới bước accept phía nhận (hybrid flow — file 04 #32; file 15 §2.3). Trục trặc hay gặp: actor chưa confirm email của chính mình (giải quyết ở **Business info / Thông tin doanh nghiệp**), hoặc cần approval admin thứ 2 tại **Requests / Yêu cầu** [Kiểm chứng — mục Troubleshoot của bài].
- **HITL:** cấp **full control** cho người mới = nhạy cảm → confirm 2 lớp; bulk invite chống spam (file 04 §3.4; file 15 §5 — ưu tiên semi-manual).

**Đổi role/quyền (HC 299504287548592, EN+VI):** People → click **tên người** → phần **Business portfolio access / Quyền truy cập trang quản lý tài sản doanh nghiệp** → **Manage / Quản lý** → sửa → **Save / Lưu**; với từng asset: **Manage** bên phải asset → Save hoặc **Remove access / Gỡ quyền truy cập** → confirm [Kiểm chứng]. Lưu ý giới hạn: không sửa được quyền người khác nếu mình chỉ full control _asset_ chứ không full control _BM_; asset do partner share sang thì bị chặn theo quyền partner cấp [Kiểm chứng].

**Remove person (HC 353397428740939):** People → click tên → **Remove** → confirm; gỡ là mất cả portfolio + mọi asset access; có thể cần approval tại Requests [Kiểm chứng — EN]. Nhãn VI **[Suy luận]**. **HITL bắt buộc:** confirm 2 lớp + không gỡ admin cuối cùng (ràng buộc phía Meta, file 04 #3) — automation phải đọc số full-control hiện còn trước khi cho phép remove.

## 8. Flow (f) — Đọc danh sách agencies/clients hiện có

- **Toàn cục:** Settings → **Partners / Đối tác** — danh sách partner businesses của BM (cả chiều "mình share cho họ" lẫn "họ share cho mình"; bài "About users" xác nhận Partners là loại user riêng cạnh People/System users [Kiểm chứng — HC 2399703093590353]). Click từng partner → xem assets + tasks đã cấp **[Suy luận cấu trúc detail — cần test]**.
- **Theo asset:** Settings → Accounts → Ad accounts → chọn TKQC → xem mục đối tác/người được gán (file 16 §6 giả định tab **Partners/Đối tác** trên panel TKQC — **[Suy luận — cần test]**).
- **Ánh xạ API:** `GET /{business_id}/agencies` (đối tác agency của mình), `GET /{business_id}/clients` (client của agency), `GET /act_{id}/agencies` (partner trên 1 TKQC) — file 04 ##2 (#16–17). DOM route dùng làm fallback khi API bị permission-chặn; trường hợp đọc thuần, rủi ro thấp, nhưng phải pagination cuộn danh sách (SPA lazy-load — kỹ thuật chờ element file 09 §3.1).
- **HITL:** không cần (read-only); chỉ cần pacing + cache.

## 9. Flow (g) — Account Quality / trạng thái TKQC

- **URL surfaces [Kiểm chứng]:** canonical mới: `https://www.facebook.com/accountquality` = **Meta Business Support Home** (HC 254088759757736 gọi cả 2 tên); alias `https://www.facebook.com/business-support-home`; bản BM-skinned `https://business.facebook.com/accountquality` (đây cũng là route file 13 dùng trích EAAE token).
- **Bước đọc (HC 254088759757736):** mở surface → **Account status overview** → chọn mốc ngày (lịch góc trên phải: **14/30/90 ngày**) → tab **Outstanding** (vấn đề đang tồn tại) hoặc **Resolved** → click từng account xem chi tiết + "actions you can take" [Kiểm chứng — EN; nhãn VI cần test].
- **Các loại hình chế tài (HC 975570072950669):** áp trên **business portfolio / ad account / Page / personal profile**; hình phạt từ giới hạn chi tiêu/ngưỡng thanh toán → mất tính năng thanh toán → mất khả năng quảng cáo [Kiểm chứng]. Quan trọng với guardrail: hạn chế "unusual activity" có thể gồm **"loss of the ability to add admins, partners or users"** → trước mọi batch gán partner/invite, automation **bắt buộc pre-flight đọc surface này**; nếu thấy restriction → abort fail-soft (đồng bộ file 15 §4.A.2).
- **Ánh xạ API:** `GET /act_{id}?fields=account_status,disable_reason` + bảng mã trạng thái (file 04 #26) — API cho trạng thái số; DOM cho **lý do vi phạm + nút hành động** (phần API không expose đủ — file 09 §2 "Account quality UI không có API đầy đủ").
- **HITL / vùng đỏ:** tab chi tiết có nút **Request review** — **KHÔNG tự động click, không auto-fill-nop-nộp**; appeal/payment/verification là vùng đỏ theo thống nhất toàn bộ research (file 04 #24/#33, file 15 §3.2). Extension chỉ đọc + trình bày.

## 10. Flow (h) — 2FA: đặt yêu cầu toàn BM + báo cáo ai chưa bật

**Nguồn:** HC 280940009201586 (EN+VI, đã fetch) + 216940652189296 (Security Center, EN) — **[Kiểm chứng]**.

**Đặt yêu cầu:**

1. **Settings** → **Business portfolio info / Thông tin trang quản lý tài sản doanh nghiệp** (khác với **Business info / Thông tin doanh nghiệp** = `/latest/settings/business_info` — 2 mục riêng, cẩn thận selector) [Kiểm chứng].
2. Cuộn tới **Business options / Tùy chọn cho doanh nghiệp** → dropdown cạnh **Two-factor authentication / Xác thực 2 yếu tố** [Kiểm chứng].
3. Chọn: **Admins only / Chỉ quản trị viên** | **Everyone / Mọi người** | **No one / Không ai cả** (lựa chọn cuối bị khóa nếu Meta đã tự bắt buộc 2FA với BM > 90 ngày) → **Confirm / Xác nhận** [Kiểm chứng cả 2 ngôn ngữ].

- **Hiệu lực:** **ngay lập tức**; người chưa bật 2FA **bị chặn truy cập BM ở lần đăng nhập kế** [Kiểm chứng] → **HITL bắt buộc**: khi chọn "Mọi người" phải cảnh báo đỏ + confirm 2 lớp (đồng bộ file 04 #25). BM < 90 ngày: 2FA tùy chọn; BM > 90 ngày: có thể đã bị Meta bắt buộc, không tắt được [Kiểm chứng].
- **Security Center** (surface phụ, vào từ Settings): hiển thị thẻ cảnh báo bảo mật gồm "Require two-factor authentication", "Add another person with full control", "Check business verification status" [Kiểm chứng — HC 216940652189296] — là nguồn tốt để đọc **trạng thái verification** kèm theo.

**Đọc ai chưa bật 2FA (báo cáo):** API equivalent là `business_users` field `two_fac_status` (file 04 #25). Trên UI hiện hành: danh sách **People** của BM hiển thị trạng thái 2FA theo người **[Suy luận — cần test]** (UI BM thế hệ trước có cột/bộ lọc này; chưa xác nhận nhãn/selector trên `/latest/settings` thế hệ mới). Đây là một trong số ít chỗ research này **chưa xác minh được** → nằm trong danh sách test đầu tiên khi có BM thật (xem §11).

## 11. Khuyến nghị cho extension (state machine & guardrails)

1. **Mỗi flow = một state machine** dạng `waitForElement(role/text EN|VI) → act → waitForOutcome`, timeout + fail-soft; không polling vô hạn (file 09 §3.1). Selector ưu tiên `role`+`aria-label`, text EN/VI kép — không class class-hashe. Panel Settings là SPA: chờ router ổn định (`MutationObserver` trên content region) trước khi đọc bảng Partners/People (lazy-load).
2. **Idempotent trước khi ghi:** luôn re-read danh sách đích (Partners page / tab Partners của dataset) trước khi Assign/Remove để skip mục đã ở trạng thái mong muốn — tránh double-submit khi user spam nút trong extension.
3. **Verify 2 chiều sau ghi:** (i) reload/re-read UI; (ii) kiểm tra **Requests / Yêu cầu** xem có approval-pending không. Trạng thái trả về cho user chỉ là `done | pending-approval | failed`, không bao giờ "giả định thành công".
4. **HITL cố định** tại các điểm đã đánh dấu: Assign assets (a), Remove partner (b) + Remove person (e) — 2 lớp; bước pháp lý sharing controls (c); chọn "Mọi người" ở 2FA (h). Điểm tuyệt đối không chạm: Request review / accept lời mời hộ user / payment.
5. **Pre-flight chéo flow (g):** quét Account Quality trước các batch ghi (a/b/c/e) — phát hiện "loss of ability to add partners/users" thì abort.
6. **Pacing + audit:** mọi thao tác ghi đi kèm delay 3–8s + jitter, audit log append-only theo chuẩn file 15 §4.B/C; DOM automation không thay đổi nhu cầu này, chỉ thay kênh thực thi.
7. **Danh sách cần kiểm chứng trên BM thật (ưu tiên test đầu):** nhãn/nút chính xác của rename TKQC (flow d); tab Partners trong panel chi tiết TKQC (flow f); cột/trạng thái 2FA theo người trên trang People (flow h); trạng thái pending sau share dataset (flow c); slug deep-link `/latest/settings/*`; nhãn VI của remove partner/person (b/e).

## 12. Nguồn tham khảo

**First-party Meta Business Help Center** (đọc 12/10/2026 qua mirror `r.jina.ai` vì môi trường nghiên cứu bị chặn; đã cross-check EN+VI ở các bài đánh dấu \*):

1. HC 1717412048538897\* — Give a partner access to business assets (flow a; approval; full/partial).
2. HC 2222659621282858 — Remove partners from your business portfolio (flow b; EN only — VI bị login wall).
3. HC 2169003770027706\* — Add people + assign assets (flow e invite; troubleshoot email/approval).
4. HC 353397428740939 — Remove people from your business portfolio (flow e remove; EN only).
5. HC 299504287548592\* — Change a person's permissions (flow e role change; giới hạn partner-shared asset).
6. HC 889971929474339\* — Add a partner to a dataset (flow c) + HC 352686481592916 — Sharing controls cho dataset/Pixel/app/offline (declare relationship, reaffirm terms, recipient agreement; trang pending shares).
7. HC 280940009201586\* — Require two-factor authentication (flow h; 90-ngày rule; hiệu lực ngay).
8. HC 216940652189296 — About Security Center (surface Settings; 2FA card, verification status).
9. HC 442345745885606 — Full control vs partial access; basic/apps&integrations/finance/temporary access (hệ quyền dùng xuyên suốt).
10. HC 2399703093590353 — About users: People / Partners / System users (cấu trúc menu Users).
11. HC 254088759757736 — About Meta Business Support Home (= accountquality; Outstanding/Resolved, mốc 14/30/90 ngày) + HC 975570072950669 — About advertising restrictions (mức trừng phạt; "loss of ability to add admins, partners or users").
12. HC 410559398627376 — Ad account settings trong Ads Manager (neo cho flow d).

**Thứ cấp / cần kiểm chứng:** nhãn VI của flow (b) và remove-person (bản vi_VN bị login wall); flow đổi tên TKQC (không có bài first-party — tái cấu trúc từ HC 410559398627376 + BMTool.vn quan sát ở file 15); slug deep-link và nhãn tab per-asset; HC 1386566848933413 (remove access from dataset — chưa fetch); HC 1181250022022158 (tìm business portfolio ID — đã fetch nhưng không trích ở đây).

**Kế thừa nội bộ:** `14-partner-assign-mapping-graphql.md` (bảng nhãn quyền ↔ `permitted_tasks`, component `AssignPartnerToAsset`), `04-bm-admin-assets.md` (endpoint tương đương + mã `account_status`), `09-extension-techniques.md` §3.1 (kỹ thuật DOM), `15-browser-session-ops-practice.md` §4 (guardrails), `16-test-plan-eaag-agencies.md` (bối cảnh pivot + giả định tab Partners cần kiểm chứng).

> **Phương pháp:** mọi bước click quan trọng đều trích gần-nguyên-văn từ ≥1 bài Help Center first-party (đa số cross-check song ngữ); phần không có nguồn first-party (rename TKQC, nhãn VI ở login wall, tab per-asset, cột 2FA) được gắn nhãn **[Suy luận — cần test]** và gom vào checklist kiểm chứng §11.
