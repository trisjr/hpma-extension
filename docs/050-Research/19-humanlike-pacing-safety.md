# 19 — Pacing giống người thật, phát hiện checkpoint & an toàn vận hành khi tự động hóa DOM trên BM

> Phạm vi: **"giáo lý hành vi giống người" cho DOM automation trên Business Manager** — mô hình delay giữa các hành động (phân phối + jitter), nhịp gõ phím/chuột/scroll, ngân sách thao tác theo giờ/ngày phân theo độ "cứng" của BM, các pattern dễ bị Meta phát hiện nhất (timing hoàn hảo, chuỗi lặp y hệt, thao tác khi tab ẩn), hành vi giữa các flow, vòng đời phiên MV3 (service worker suspend/alarm/resume), phát hiện checkpoint & anti-abuse **trên UI** kèm luật dừng khẩn cấp tương đương bảng lỗi API 459/464/368, chiến lược khi flow đứt giữa chừng, khi nào bắt buộc người dùng xác nhận tay, và audit log cần ghi gì từ UI. Đây là file mở đầu **Vòng 3 — hướng DOM automation** (sau khi hướng EAAG token → Graph API gặp lỗi permission code 10/200 trên edge ghi nhạy cảm).
> Không lặp lại: khung pháp lý/ToS & case law (xem `11-policy-compliance.md` §3), kỹ thuật DOM/GraphQL/intercept trên BM (xem `09-extension-techniques.md`), cách tool thị trường vận hành & rủi ro theo tác vụ API (xem `15-browser-session-ops-practice.md` — file này kế thừa checklist §4 của nó nhưng viết lại cho bối cảnh **UI thay vì API call**), mapping quyền & payload chỉ định đối tác (xem `14-partner-assign-mapping-graphql.md`), lỗi & rate limit tầng Graph API (xem `13-eaag-token-bm-tasks.md`, `04-bm-admin-assets.md`).
> Thời điểm nghiên cứu: **2026-10-12**.

---

## 1. Tổng quan

Pivot sang DOM automation đổi **mặt trận rủi ro** chứ không xóa rủi ro:

- Hướng EAAG: rủi ro chính là **scope token** (edge ghi nhạy cảm trả lỗi thiếu quyền — code 10/200) + tín hiệu API-layer (rate limit 17/613/80004, header usage). Pivot xác nhận 12/10/2026.
- Hướng DOM: UI luôn mang đủ quyền của user đang đăng nhập nên hết lỗi scope, nhưng rủi ro chuyển sang **behavioral detection** — Meta phân tích hành vi tương tác (tốc độ, nhịp, chuỗi, ngữ cảnh hiển thị) để phân biệt người thật vs tool [Kiểm chứng — file 11 §3.2 liệt kê "identical automation patterns", "tốc độ click/typing không người"; GoLogin xác nhận hệ "Lander" theo dõi typing/navigation; Hidemyacc xác nhận 2 trục detection là "user behavior + browser/hardware parameters"].
- Điểm thuận lợi lớn của DOM automation trong extension: chạy trong **browser thật, fingerprint thật, IP thật, cookie thật** của user → loại bỏ gần như toàn bộ tín hiệu môi trường (IP mismatch, fingerprint lạ, headless flags) vốn là nguyên nhân checkpoint hàng đầu của Selenium/Puppeteer server-side [Kiểm chứng — file 15 §3.1]. Cái còn lại để quản trị chính là **pacing + cấu trúc hành vi** — chủ đề của file này.
- Nguyên tắc tối thượng giữ nguyên từ các vòng trước: **an toàn tài khoản > tính năng**; human-in-the-loop cho tác vụ nhạy cảm; fail-soft; không đụng vùng đỏ (payment/appeal/vượt checkpoint) [Kiểm chứng — file 11 §4.3, file 15 §2.3].

**Định vị đúng về "humanlike":** mục tiêu không phải "giả người để đánh lừa" (concealment là yếu tố làm nặng trong các vụ kiện — file 11 §3.2), mà là **không hành xử theo cách mà không con người nào hành xử** (10 thao tác ghi/nút bấm trong 3 giây, 200 lần click với khoảng cách đều như metronome, submit form lúc 4h sáng liên tục 8 giờ). Ranh giới thực dụng: pacing của extension không được "phi vật lý/phi sinh học", và ngân sách thao tác không vượt nhịp làm việc của một nhân sự agency chăm chỉ [Suy luận — cần test, đây là khung định tính tổng hợp từ cộng đồng, không phải thông số Meta công bố].

---

## 2. Mô hình delay giữa các hành động

### 2.1. Nguyên tắc: không bao giờ delay cố định

Delay cố định (vd. đúng 3000ms giữa mọi click) tạo **chuỗi thời gian có phương sai ~0** — dấu hiệu phân loại bot kinh điển, đơn giản tới mức chỉ cần thống kê mô tả trên log tương tác [Kiểm chứng — ghost-cursor & stealth-plugin đều sinh delay ngẫu nhiên thay vì cố định; file 15 §4 yêu cầu "delay nền + jitter ngẫu nhiên"; chính Meta đưa "identical automation patterns" vào hồ sơ kiện — file 11 §3.2]. BMTool.vn để "Luồng/Delay tùy chỉnh" thành cấu hình cấp 1 của sản phẩm — đồng thuận thị trường rằng pacing là điều kiện tồn tại [Kiểm chứng — file 15 §3.3].

### 2.2. Phân phối đề xuất cho delay giữa 2 hành động UI

Theo khuyến nghị cộng đồng automation humanlike (ghost-cursor, odin/autohotkey-human, thực hành RPA) và heuristic file 15 [Suy luận — cần test trên BM thật]:

| Tham số                                                             | Khuyến nghị                                                                                                          | Lý do                                                                                                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hình dáng phân phối                                                 | **Log-normal** (đuôi phải dài) hoặc Gaussian cắt đuôi trái; tuyệt đối không uniform hẹp, không constant              | Thời gian phản ứng người thật theo log-normal/nhiễu tích lũy nhiều yếu tố; uniform tạo "răng lược" nhân tạo khi vẽ histogram [Suy luận — cần test] |
| Delay nền giữa 2 thao tác trong cùng flow (đọc trường → gõ → click) | Trung vị **0.8–2.5s**, min 300ms, đuôi tới ~6s                                                                       | Người đọc-rồi-bấm không nhanh hơn 300ms; đôi khi ngẩng lên vài giây                                                                                |
| Delay giữa 2 **bước ghi** (mở dialog → điền → submit)               | Trung vị **3–8s** (khớp file 15 §4.B.8)                                                                              | Người phải đọc dialog, kiểm lại thông tin                                                                                                          |
| Delay giữa 2 **đơn vị batch** (xong TKQC này → sang TKQC kia)       | Trung vị **20–90s**, đuôi tới vài phút                                                                               | Người nghỉ giữa các ticket công việc                                                                                                               |
| Jitter                                                              | ±25–50% quanh trung vị, **re-roll mỗi lần**; định kỳ chèn "long pause" ngẫu nhiên (vd. 5–10% số lần nghỉ 30s–3 phút) | Phá chu kỳ; mô phỏng bị phân tâm                                                                                                                   |
| Correlation                                                         | Delay sau hành động "khó" (form dài, dialog confirm) dài hơn delay sau hành động "dễ" (click next)                   | Người chậm ở chỗ phải nghĩ [Suy luận — cần test]                                                                                                   |

Công thức triển khai gợi ý: `delay = clamp(lognormal(μ, σ) * scaleFactor(hành_động), min, max)` với `scaleFactor` tra theo loại hành động ở bảng trên; seed random bằng `crypto.getRandomValues` (không `Math.random` có chu kỳ lặp dễ đo [Suy luận — cần test]).

### 2.3. Nhịp vi mô: gõ phím, chuột, scroll

- **Gõ phím:** từng ký tự riêng, inter-key interval log-normal trung vị **80–200ms** (tốc độ gõ người ~40–70 WPM ↔ ~90–250ms/phím, có biến thiên mạnh theo cặp phím), thỉnh thoảng dừng 0.5–2s giữa từ; KHÔNG dùng `element.value = text` một phát cho các trường nhạy cảm (email invite, business ID) — fill tức thì không kèm keystroke event là tín hiệu automation tầng JS [Kiểm chứng — BM là React SPA bắt sự kiện per-keystroke, file 09 §3.1]. Cho phép lỗi gõ giả lập (gõ nhầm → backspace → sửa) với xác suất thấp (~1–2%) chỉ ở bản thử nghiệm nội bộ; bản production có thể bỏ nếu thấy gượng [Suy luận — cần test].
- **Chuột:** đường đi cong (Bezier qua 1–2 control point), vận tốc theo **định luật Fitts** (thời gian tỉ lệ với log2(khoảng*cách/kích_thước*đích + 1)), click vào **điểm ngẫu nhiên trong phần tử chứ không bao giờ đúng tâm**, tỉ lệ overshoot-rồi-chỉnh khi đích xa [Kiểm chứng — ghost-cursor mô tả đúng cơ chế này: bezier đa điểm + Fitts's law + overshoot threshold + random point in padding]. Lưu ý ghost-cursor viết cho Puppeteer/CDP; trong extension content script ta **không điều khiển được OS cursor** mà chỉ dispatch synthetic events — quỹ đạo chuột chỉ giả lập được ở tầng sự kiện `mousemove` [Kiểm chứng — file 09 §3.1: content script chạy trong isolated/MAIN world, không phải native input].
- **Câu hỏi mấu chốt: click DOM trực tiếp (`el.click()`) hay dispatch chuỗi `mousemove→mousedown→focus→mouseup→click`?** Nhiều hệ anti-bot so sánh sự tồn tại của chuỗi sự kiện tiền-click; `el.click()` mà không có pointer/keyboard event đi kèm là dấu hiệu phổ biến [Suy luận — cần test trên BM thật: quan sát log event của chính BM (qua interceptor file 09 §3.2) xem BM có nghe các listener này không trước khi tốn công giả lập]. Khuyến nghị bảo thủ: dispatch đầy đủ chuỗi trusted-shape events + `isTrusted` không giả mạo được (browser tự set `isTrusted=false` cho synthetic — **chấp nhận, không cố bypass**, vì cố bypass = concealment).
- **Scroll:** cuộn từng đoạn 300–800px với nhịp ngắt quãng (không `scrollTo` tức thì tới đích), dừng "đọc" 0.5–2s; scrollIntoView smooth thay vì instant [Kiểm chứng — thực hành ghost-cursor: `scrollSpeed < 100` + `scrollDelay ~200ms`].

---

## 3. Ngân sách thao tác theo giờ/ngày (phân theo độ "cứng" của BM)

Kế thừa heuristic file 15 §4.B.9 (vốn viết cho API calls), chuyển ngữ sang **đơn vị "hành động UI ghi"** (1 hành động ghi = 1 lần submit dialog gây thay đổi state BM: assign partner, share pixel, đổi tên, remove partner...) [Suy luận — cần test, heuristic cộng đồng, không có số liệu Meta công bố]:

| Nhóm BM (theo file 15 §3.1: tuổi, verify, lịch sử spend) | Ghi giờ đầu (tích lũy)                                            | Ghi/ngày (đề xuất UI) | Ghi/giờ tối đa | Nghỉ bắt buộc                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------- | --------------------- | -------------- | ------------------------------------------------------- |
| BM mới <2 tuần / chưa verify / TKQC mới                  | **0 — không tự động** (đồng nhất file 15 §4.A.2: chặn tác vụ ghi) | 0                     | 0              | —                                                       |
| BM 2 tuần–3 tháng ("non mới")                            | warm-up tay: tuần đầu chỉ đọc + điều hướng                        | **≤3–5**              | ≤2             | ≥15 phút giữa 2 hành động ghi                           |
| BM ≥3 tháng, có spend, verified ("cứng")                 | —                                                                 | **≤10–20**            | ≤5             | ≥5 phút; nghỉ dài 30–60 phút sau mỗi 5 ghi              |
| Tổng mọi write/ngày/actor (mọi BM cộng lại)              | —                                                                 | **≤50**               | ≤10            | nghỉ đêm: không chạy 0h–6h giờ địa phương của tài khoản |

So sánh với API: file 15 đề xuất 5–10 partner-adds/ngày cho BM mới và 20–50 cho BM cứng ở tầng API. Bản UI chọn **thấp hơn ~50%**, vì: (i) thao tác UI sinh nhiều footprint hành vi hơn một request (mỗi write là chuỗi click/đọc), (ii) UI có rate-limit ẩn riêng (§6), (iii) tốc độ thấp vốn là cái giá chấp nhận được của hướng DOM [Suy luận — cần test]. Nguyên tắc **tăng dần theo tuần** (không spike) giữ nguyên từ warm-up Hidemyacc [Kiểm chứng — file 15 §3.3: "frequency must increase gradually by the week", spike 1 ngày → cơ chế check].

Đếm ngân sách theo **cửa sổ trượt 24h và 1h** lưu ở `chrome.storage.local`, scope theo (actor_user_id × business_id) — một actor thao tác nhiều BM trong cùng giờ phải chia sẻ ngân sách tổng, tránh pattern "vòng qua 10 BM, mỗi BM 5 write" [Suy luận — cần test].

---

## 4. Các pattern dễ bị phát hiện nhất (danh sách kiểm trước khi ship)

| #   | Anti-pattern                                                                                                      | Vì sao bị bắt                                                                                                                                                                                                                                                                                     | Luật phòng trong extension                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Timing hoàn hảo/đều (độ lệch chuẩn ~0)                                                                            | Phương sai thời gian của người luôn > 0 (§2.1)                                                                                                                                                                                                                                                    | Jitter bắt buộc; unit-test: histogram delay của 100 lần chạy phải không-giống-uniform                                                                                                   |
| P2  | Chuỗi hành động lặp y hệt (cùng thứ tự click, cùng tọa độ, cùng khoảng dừng qua mọi lần lặp)                      | "Identical automation patterns" là tín hiệu Meta nêu tên [Kiểm chứng — file 11 §3.2]                                                                                                                                                                                                              | Random hóa thứ tự xử lý batch; đôi khi chọn đường UI khác (menu A vs breadcrumb B); điểm click ngẫu nhiên trong element                                                                 |
| P3  | Thao tác khi tab ẩn/inactive                                                                                      | Page Visibility API + background timer throttling: người thật không click khi tab hidden; mà sự kiện "vẫn diễn ra ở tab ẩn" là hiện tượng duy nhất chỉ tool tạo ra [Kiểm chứng — MDN Page Visibility: `document.hidden`/`visibilitychange`; Chrome throttle timer tab nền sau ~10s, budget-based] | **Gate cứng**: content script chỉ chạy khi `document.visibilityState === 'visible'` VÀ tab BM đang focused (`document.hasFocus()`); `visibilitychange` → hidden ⇒ pause queue ngay (§5) |
| P4  | Zero-error (gõ 200 ký tự không một lần sửa, form nào cũng đúng lần đầu)                                           | Người có lỗi gõ                                                                                                                                                                                                                                                                                   | §2.3 (tùy chọn lỗi giả lập; tối thiểu không cố tối ưu "perfect run")                                                                                                                    |
| P5  | Tốc độ phi vật lý (điền form 10 trường trong 1s; 5 dialog liên tiếp không đọc)                                    | Phản ứng người ≥300ms (§2.2)                                                                                                                                                                                                                                                                      | Min-delay cứng theo loại hành động; không cho config delay < ngưỡng an toàn                                                                                                             |
| P6  | Chạy 24/7, xuyên đêm, không ngày nghỉ                                                                             | Chu kỳ sinh học                                                                                                                                                                                                                                                                                   | §3: curfew 0h–6h; tối đa ~8–10h hoạt động/ngày; nghỉ cuối tuần một phần [Suy luận — cần test]                                                                                           |
| P7  | Nhiều "phiên FB" cùng máy/browser profile chạy cùng pattern cùng giờ                                              | Cluster linking [Kiểm chứng — file 15 §3.1: trùng IP/fingerprint/cookie + hành vi]                                                                                                                                                                                                                | Khuyến cáo user: 1 profile Chrome ↔ 1 FB; không lên lịch cùng action giờ giống nhau giữa các profile; khác nhịp delay giữa profile                                                     |
| P8  | Điều hướng thẳng tới màn ghi (deep-link vào Business Settings → submit → rời tab) không có hành vi đọc xung quanh | Phiên người có "nhiễu" điều hướng                                                                                                                                                                                                                                                                 | §5: xen kẽ flow với điều hướng đọc (dashboard, account quality) + idle                                                                                                                  |

---

## 5. Hành vi giữa các flow & vòng đời phiên làm việc MV3

### 5.1. Phiên-tab và nghỉ giữa flow

- Extension **không tự mở tab BM mới** âm thầm; yêu cầu user mở tab `business.facebook.com` và để tab đó visible trong cửa sổ đang dùng (đồng thời thỏa P3). Trạng thái đủ-điều-kiện-chạy = `{tab BM tồn tại && visible && hasFocus && user đã bấm "Bắt đầu"}` [Suy luận — cần test, khuyến nghị thiết kế].
- **Idle nền tự nhiên:** giữa các đơn vị công việc, chèn "điều hướng nhiễu" mức nhẹ: cuộn dashboard, mở trang danh sách TKQC (tap đọc) — KHÔNG giả lập tương tác ngoài phạm vi công việc (like/comment) vì vượt phạm vi "copilot vận hành" và chạm vùng engagement công khai (file 11 §4.3.7) [Suy luận — cần test mức độ cần thiết].
- **Nghỉ dài (long pause):** sau mỗi cụm 5–10 hành động ghi → nghỉ 15–60 phút; sau khi dùng hết ~50% ngân sách ngày → đề nghị nghỉ ≥2 giờ (khớp nhịp làm việc agency thật) [Suy luận — cần test].

### 5.2. Vòng đời MV3 — vấn đề service worker suspend & giải pháp

- Background service worker MV3 bị **terminate sau ~30s idle** → toàn bộ timer delay dài (delay giữa hành động, nghỉ giữa flow) **không thể đặt ở service worker** bằng `setTimeout` [Kiểm chứng — file 09 §3.6: SW kill sau ~30s; `chrome.alarms` dùng cho lịch].
- Kiến trúc đúng cho DOM automation dài hơi: **state machine + timer đặt trong content script của tab BM** (tab còn sống thì setTimeout còn chạy — với điều kiện tab visible, vì tab nền bị throttle timer sau ~10s, khớp P3); SW chỉ làm điều phối nhẹ và nhận heartbeat [Kiểm chứng — MDN: timer tab ẩn bị throttle budget-based; trùng với quyết định kiến trúc file 09 §1 "logic nặng/tương tác trang ở content script, SW chỉ điều phối"].
- `chrome.alarms` dùng cho 2 việc: (i) **đánh thức SW định kỳ** để kiểm tra queue & heartbeat với content script — lưu ý **độ phân giải tối thiểu 30 giây** với extension đã đóng gói (Chrome clamp `delayInMinutes`/`periodInMinutes` < 0.5 phút, "may be delayed arbitrarily" — không dùng alarm làm pacing chính) [Kiểm chứng — Chrome docs alarms]; (ii) lịch resume sau khoảng nghỉ dài.
- **State bền:** mọi bước của flow checkpoint vào `chrome.storage.local` (job_id, step hiện tại, danh sách target còn lại, số ghi đã dùng trong ngày) — vì (a) SW chết bất cứ lúc nào, (b) user có thể reload tab BM giữa chừng, (c) SPA BM có thể tự reload khi đổi route [Kiểm chứng — file 09 §3.6 "state persist ở chrome.storage"; BM là SPA React/Relay, file 09 §3.1].
- **Resume sau sự cố tab:** khi content script mount lại (tab reload/SW wake), đọc state → nếu đang có job dở → KHÔNG tự resume; hiện trên side panel (ngoài trang BM — `file 21 §5.1`) "Job X dừng ở bước 3/8 (đã submit 2 target). Tiếp tục?" — resume chỉ sau confirm, và bắt đầu bằng **re-read trạng thái thật trên UI** (§7) [Suy luận — cần test, khuyến nghị thiết kế; đồng nhất tư tưởng idempotent ở file 15 §4.B.10].
- Heartbeat content script → SW mỗi ~20–25s (trước ngưỡng 30s) chỉ khi đang có job chạy; không giữ SW sống vô điều kiện (gây nghi ngờ tốn tài nguyên, không cần thiết) [Suy luận — cần test].

---

## 6. Phát hiện checkpoint & anti-abuse TRÊN UI + luật dừng khẩn cấp

### 6.1. Bảng tín hiệu trên UI ↔ tương đương mã lỗi API

Hướng API dùng bảng lỗi để dừng (file 15 §4.B.11: 190 = token die; 80004/17/613 = rate-limit; 200 = thiếu quyền). Hướng DOM không còn mã lỗi — tín hiệu chuyển thành **hiện tượng UI**. Ba mã "checkpoint đỏ" của hệ thống lỗi Meta thường trích trong tài liệu/device-flow là **368** (spam/temporarily blocked from performing action), **464** (phiên bị thu hồi/đổi mật khẩu — logged-out/must-relogin) và **459** (tài khoản bị đưa vào checkpoint, phải hoàn tất xác minh mới dùng tiếp) [Suy luận — cần test; cộng đồng device-login & docs lỗi livestream của Meta mô tả nhóm này là "checkpoint/relogin" errors; chưa probe được first-party từ môi trường research]. Tương đương UI:

| Tín hiệu trên UI (content script quan sát được)                                                                                                   | Tương đương API                  | Mức phản ứng                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL redirect sang `facebook.com/checkpoint/...` hoặc `.../checkpoint/?next=...`; xuất hiện màn "Confirm your identity" / upload ID / selfie video | **459** (vào checkpoint)         | **DỪNG KHẨN CẤP toàn bộ** (mọi job, mọi BM của actor đó) + khóa automation của actor cho tới khi user báo đã gỡ thủ công + log sự kiện                         |
| Đẩy về `login.php` / form đăng nhập lại / "Session expired" dialog                                                                                | **464** (mất phiên)              | Dừng job; không tự điền mật khẩu (vùng đỏ — file 11 §4.3.1); chờ user login lại tay                                                                            |
| Dialog/Toast "You're temporarily blocked" / "You can't use this feature right now" / "We limit how often you can do X"                            | **368** / 80004 / 613            | Dừng job đó ≥24h; hạ ngân sách ngày còn 50% trong 7 ngày tiếp theo; nếu lặp lại ≥2 lần/tuần → khóa tính năng ghi của BM đó                                     |
| Form hiển thị lỗi đỏ ngay sau submit (không đi tiếp được), button submit quay về trạng thái ban đầu                                               | 10 / 200 (thiếu quyền / invalid) | Dừng target đó, đánh dấu failed, **không retry**; tiếp tục target khác nhưng giảm nhịp; ≥3 fail liên tiếp → dừng cả job (fail-soft, đồng nhất file 15 §4.B.10) |
| CAPTCHA xuất hiện trong flow (checkpoint captcha/nhận diện ảnh)                                                                                   | —                                | **DỪNG ngay, không tự giải** (bypass CAPTCHA = vạch đỏ + yếu tố làm nặng pháp lý) [Kiểm chứng — file 11 §4.3.1, Voyager "attempting to conceal"]               |
| Dialog xác nhận lạ không có trong bản đồ flow (2FA prompt, "Was this you?", duyệt thiết bị mới)                                                   | —                                | Dừng, nhường điều khiển cho user; coi như tín hiệu vàng-đỏ                                                                                                     |
| Trang trắc trở tải chậm bất thường + nhiều request GraphQL trả lỗi (quan sát qua interceptor file 09 §3.2)                                        | header usage vọt                 | Vàng: tăng delay ×2, giảm ngân sách 50% phiên hiện tại                                                                                                         |
| Account Quality banner "Ad account restricted" / BM bị hạn chế xuất hiện khi điều hướng                                                           | —                                | Đóng băng mọi ghi vào BM đó; chuyển chế độ read-only (đồng nhất file 11 §4.2: checkpoint → dừng mọi automation, chuyển read-only)                              |

### 6.2. Cài đặt kỹ thuật của bộ phát hiện

- **Watcher URL**: `MutationObserver` + `NavigationObserver` (SPA — hook `history.pushState`/`popstate` hoặc poll `location.href` tần số thấp) nhận diện `checkpoint` trong path [Kiểm chứng — BM là SPA React pushState, file 09 §3.1]; watcher URL là cách phát hiện checkpoint sớm nhất vì Meta redirect trước khi render dialog.
- **Watcher dialog**: quét text các dialog mới mount (role="dialog") theo bộ từ khóa EN+VI ("temporarily blocked/tạm thời bị chặn", "confirm your identity/xác minh danh tính", "unusual activity/hoạt động bất thường", "try again later/thử lại sau") [Suy luận — cần test; danh sách từ khóa phải duy trì theo thực địa vì Meta A/B copy liên tục].
- **Nguyên tắc chung của mọi tín hiệu đỏ:** dừng = pause queue + persist "emergency_stop" flag + không tự clear; hành vi "chờ hết hạn rồi chạy tiếp" bị cấm tuyệt đối (đồng nhất file 11 §4.2: "không retry để chờ hết").

---

## 7. Khi flow đứt giữa chừng: trạng thái dở dang, rollback hay để nguyên

Thiết kế theo biên bản partial-state (mỗi target là một "giao dịch" nhỏ, không coi cả batch là nguyên tử) [Suy luận — cần test, khuyến nghị thiết kế]:

1. **Nhận diện trạng thái dở:** có 4 mức — (a) chưa chạm dialog; (b) đã mở dialog điền nhưng chưa submit; (c) đã submit, chưa thấy xác nhận thành công; (d) thấy xác nhận. Mức (c) là nguy hiểm nhất (không biết Meta đã ghi chưa).
2. **Luật xử lý:**
   - Mức (a)/(b): an toàn — hủy bỏ phần dở (đóng dialog bằng nút Cancel/Hủy nếu có, hoặc để nguyên rồi điều hướng đi); target chưa ghi → đưa lại queue.
   - Mức (c): **quy tắc "đọc-lại-trước-khi-quyết"**: khi resume, trước hết re-read trạng thái thật trên UI (mở lại danh sách partners/pixels của asset đó, xem target đã xuất hiện chưa; hoặc vào BM Setting Log hoạt động gần nhất — file 04 #29). Nếu đã ghi → ghi nhận success, không làm lại (tránh double-assign). Nếu chưa → chạy lại như target mới. **Tuyệt đối không submit mù lần hai** [Kiểm chứng — nguyên tắc idempotent "đọc → bỏ qua mục đã tồn tại → ghi → re-read" từ file 15 §4.B.10 mang nguyên sang UI].
   - Mức (d) với target thành công: để nguyên.
3. **Rollback khi nào:** chỉ rollback (thao tác ngược — vd. remove partner vừa assign) khi (i) user yêu cầu undo, hoặc (ii) phát hiện đã ghi SAI (sai business ID/profile) — và rollback cũng là một hành động ghi nên **tính vào ngân sách + chạy cùng pacing** (đồng nhất "undo với cùng pacing" file 15 §4.C.13). Không bao giờ auto-rollback theo heuristics trong phiên đang chạy; chỉ suggest.
4. **Không dọn dẹp "cho đẹp":** để nguyên dialog dở + điều hướng sang trang khác còn tự nhiên hơn là loạt thao tác cố đóng mọi thứ tức tốc ngay sau lỗi [Suy luận — cần test].

---

## 8. Khi nào BẮT BUỘC người dùng xác nhận tay

Kế thừa hợp nhất các luật human-in-the-loop (file 11 §4.3, file 15 §4.B.7, file 09 ưu tiên 4), viết cho DOM:

| Tình huống                                                             | Hình thức confirm                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Mỗi lần bắt đầu job ghi (start of run)                                 | User bấm "Chạy thật" sau khi xem dry-run diff (đồng nhất dry-run mặc định file 15 §4.B.6)                          |
| Batch > N target (N mặc định 10)                                       | Confirm lớp 2 (gõ xác nhận lại số lượng)                                                                           |
| Thao tác destructive (remove partner, thu hồi pixel, xóa user khỏi BM) | Confirm từng target                                                                                                |
| Thao tác cấp quyền cao (`full control`, assign admin)                  | Confirm từng target + hiển thị cảnh báo đỏ                                                                         |
| Resume job đang dở (§5.2, §7)                                          | Confirm trước khi resume                                                                                           |
| Bất kỳ tín hiệu §6 nào từ mức vàng trở lên khi đang chạy               | Dừng → chờ user quyết (chạy tiếp với ngân sách hạ hay nghỉ)                                                        |
| Mọi tác vụ vùng đỏ (payment, appeal, identity, 2FA, CAPTCHA)           | **Extension không chạm** — chỉ deep-link + checklist (đồng nhất file 11 §4.3; file 15 §2.3)                        |
| Lần đầu chạy một flow mới trên một BM cụ thể                           | Chế độ "walk-through": extension highlight từng bước, user bấm ở bước submit ở 2–3 target đầu, sau đó mới cho auto |

---

## 9. Audit log ghi gì từ UI

Giữ nguyên khung append-only + export CSV (file 15 §4.C.12), đổi payload cho thực tế DOM — mỗi record:

`timestamp, run_id, actor_user_id (c_user), business_id, asset (type+id), target (vd. partner business id), action (assign/remove/rename/share_pixel...), step, kết quả (success/fail/aborted), bằng chứng UI (text của toast xác nhận / URL sau submit / screenshot-hash tùy chọn), lỗi quan sát (loại tín hiệu §6), delay_profile đã dùng, trạng thái visibility/focus lúc chạy, số ngân sách đã tiêu tốn`.

Nguyên tắc: (i) **không ghi cookie/token/PII ngoài ID công việc** (đồng nhất file 15 §4.C.14); (ii) ghi cả sự kiện dừng khẩn cấp và tín hiệu kích hoạt — đây là bằng chứng phục vụ user khi bị Meta hỏi; (iii) screenshot tùy chọn ở bước submit & khi gặp tín hiệu đỏ (lưu local, user tự quyết chia sẻ) [Suy luận — cần test dung lượng]; (iv) em nhúng nút "Xuất biên bản kiểm tra" tạo bản PDF/CSV cho từng BM — đáp ứng nhu cầu agency giải trình với chủ tài sản.

---

## 10. Checklist tổng hợp (gộp để đưa vào spec kỹ thuật)

1. Delay log-normal + jitter re-roll, min-delay cứng theo loại hành động, long-pause ngẫu nhiên (§2).
2. Keystroke từng ký tự; click kèm đầy đủ chuỗi sự kiện; không cố bypass `isTrusted` (§2.3).
3. Ngân sách theo bảng §3, cửa sổ trượt, shared budget theo actor, curfew đêm.
4. Chống 8 anti-pattern P1–P8; gate `visible+focus` là điều kiện tiên quyết của mọi action (§4).
5. Timer trong content script; SW điều phối qua `chrome.alarms` ≥30s; state persist mọi bước; resume chỉ sau confirm + re-read (§5).
6. Watcher URL/dialog/log mạng cho bộ tín hiệu §6; dừng khẩn cấp khóa cứng, không tự clear; tuyệt đối không retry/vượt checkpoint/CAPTCHA.
7. Partial-state theo 4 mức; quy tắc đọc-lại-trước-khi-quyết; rollback tính ngân sách (§7).
8. Confirm tay theo bảng §8; vùng đỏ chỉ deep-link + checklist.
9. Audit log §9 append-only, không secrets, có sự kiện dừng.
10. Toàn bộ ngưỡng số là **heuristic khởi đầu, phải A/B đo trên tài sản test** trước khi chốt constants (kế thừa tính toàn vẹn của file 15 §5).

---

## 11. Nguồn tham khảo

**First-party / tài liệu chuẩn:**

1. Chrome Extensions — `chrome.alarms` API (clamp tối thiểu 30s cho extension đóng gói, "may be delayed arbitrarily", persistAcrossSessions Chrome 150+) — https://developer.chrome.com/docs/extensions/reference/api/alarms **[first-party, fetch trực tiếp 12/10/2026]**
2. MDN — Page Visibility API (`document.hidden`, `visibilitychange`; chính sách throttle timer/rAF của tab nền: Chrome throttle sau ~10s, budget-based ±) — https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API **[first-party, fetch trực tiếp 12/10/2026]**

**Cộng đồng automation / antidetect (có động cơ marketing hoặc cat-and-mouse — dùng để cross-check, không coi là chân lý):** 3. GitHub `Xetera/ghost-cursor` — mô hình chuột giống người: Bezier đa control-point, định luật Fitts cho tốc độ theo khoảng cách/kích thước đích, overshoot khi đích xa, click điểm ngẫu nhiên trong element, timestamps theo trapezoidal rule, `scrollDelay`/`hesitate`/`waitForClick` — https://github.com/Xetera/ghost-cursor **[mã nguồn mở, README fetch trực tiếp 12/10/2026; viết cho Puppeteer/CDP — phần quỹ đạo con trỏ OS-level không chuyển thẳng được sang content script]** 4. GitHub `berstend/puppeteer-extra` — `puppeteer-extra-plugin-stealth`: danh mục evasion fingerprinting (navigator.webdriver, UA, WebGL vendor, window.outerdimensions...), ghi nhận "cat & mouse" và tác động tới reCAPTCHA v3 score — https://github.com/berstend/puppeteer-extra **[mã nguồn mở, fetch trực tiếp 12/10/2026; chứng minh trục detection môi trường — extension chạy trong browser thật của user né trục này sẵn]** 5. Hidemyacc Blog — "Facebook Automation Tool" (2 trục detection: behavior + browser/hardware params; cookie aging; tương tác theo kịch bản; fingerprint riêng + proxy riêng per profile) — https://hidemyacc.com/blog/hidemyacc-facebook-automation-tool **[vendor blog, độ tin cậy TB, fetch trực tiếp 12/10/2026]**; bài farming warm-up & checkpoint đã trích ở `15-browser-session-ops-practice.md` §5 (nguồn 8–10 của file đó).

**Nội bộ dự án (kế thừa khẳng định đã kiểm chứng ở các vòng):** 6. `11-policy-compliance.md` §3.2 (tín hiệu Meta dùng để phát hiện automation/multi-account; yếu tố concealment trong các vụ kiện) & §4.2–4.3 (best practices, vạch đỏ). 7. `15-browser-session-ops-practice.md` §3 (khung tín hiệu flag, rủi ro theo tác vụ) & §4 (checklist vận hành: pre-flight, pacing 3–8s + jitter, limit theo độ cứng BM, dừng khẩn cấp, audit/undo) — file này chuyển ngữ checklist đó sang UI. 8. `09-extension-techniques.md` §3.1 (BM = SPA Comet React/Relay, selector rot), §3.6 (rào cản MV3: SW ~30s, alarms, chrome.storage), ưu tiên kiến trúc §4. 9. `14-partner-assign-mapping-graphql.md` §1 (kênh UI gốc của tác vụ assign partner) — là màn hình chính mà pacing §2/§3 nhắm tới.

**Ghi chú phương pháp:** mã lỗi 368/459/464 và bảng tương đương UI ở §6.1 là **tổng hợp cộng đồng, chưa probe first-party** (facebook.com chặn môi trường research — nhất quán với ghi chú ở file 11/15, không decode được trang checkpoint trực tiếp); ngưỡng ngân sách §3 là heuristic suy rộng từ file 15 cho bối cảnh UI — toàn bộ đánh **[Suy luận — cần test]** và phải hiệu chỉnh bằng test thực địa trên tài sản test trước khi chốt constants. DuckDuckGo/Bing search từ môi trường research bị challenge/SEO-noise (12/10/2026) → phần behavioral biometrics dựa trên nguồn 3–5 + tri thức đã cross-check ở các file 11/15.
