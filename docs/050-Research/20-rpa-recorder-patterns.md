# 20 — Pattern kỹ thuật từ hệ sinh thái RPA/no-code automation & recorder

> Phạm vi: **machinery của các hệ thống tự động hóa trưởng thành** mà hpma-extension có thể học sau khi pivot sang DOM automation: bộ lệnh RPA của Hidemyacc & AdsPower (docs first-party), pattern recorder "record → parameterize → replay", engine locator kiểu Playwright port vào content script MV3 (auto-wait, actionability, bundle/CSP), self-healing selector (Healenium, Robula+, LLM-based), orchestration (queue/serial-per-profile/resume/đa tài khoản), và xu hướng AI agent lái UI (browser-use, Stagehand, Skyvern, AdsPower AI Agent, Chrome Prompt API). Kết luận cuối: pattern nào adopt, pattern nào tránh.
> Không lặp lại: kỹ thuật DOM thô trên BM/Comet (React controlled input, dispatch chuỗi click, selector rot) — xem `09-extension-techniques.md` §3.1 và file 17 (Vòng 3, DOM techniques); giáo lý anti-detection/pacing/warm-up — xem file 19 (Vòng 3, pacing/behavioral safety); cơ chế token/session & checklist vận hành — xem `15-browser-session-ops-practice.md`. File này tập trung vào **kiến trúc của hệ thống automation** (script model, engine, queue, healing), không vào chiến lược tài khoản.
> Thời điểm nghiên cứu: **2026-10-12**. AdsPower client hiện tại: 8.4.3+ (đã có AI Agent + MCP); Hidemyacc 3.0 (API v3); @testing-library/dom 10.4.2.

---

## 1. Tổng quan — vì sao phải học từ RPA/recorder

Sau pivot (bối cảnh file 16: EAAG token thiếu scope cho các edge ghi nhạy cảm), hpma-extension phải tự xây "engine" chạy flow trên UI BM. Thay vì phát minh lại, file này mổ xẻ 3 lớp sản phẩm đã được thị trường kiểm chứng nhiều năm:

1. **RPA no-code trong antidetect browser** (Hidemyacc Automation, AdsPower RPA/RPA Plus): mô hình script kéo-thả + biến + lịch chạy + log. Họ vận hành trên hàng nghìn profile/tháng với đúng đối tượng khách hàng của mình (agency MMO) → script model của họ là baseline đáng tin.
2. **Recorder-based** (UI.Vision, record feature của Hidemyacc): pattern "ghi hành vi → tham số hóa → phát lại". Rẻ để authoring nhưng có giới hạn rõ trên SPA đổi giao diện liên tục như Comet.
3. **Engine locator hiện đại** (Playwright & Testing Library) + **self-healing** (Healenium, Robula+, Stagehand): giải đúng điểm yếu của RPA no-code cổ (selector giòn).

Phát hiện then chốt xuyên suốt: **cả Hidemyacc lẫn AdsPower đều KHÔNG giải bài toán selector rot** — họ đẩy gánh nặng cho user ("paste selector lấy bằng DevTools/Inspect") [Kiểm chứng — docs 6.2 Hidemyacc hướng dẫn Inspect→Copy selector]. Đây chính là khoảng trống sản phẩm: một engine có auto-wait + locator ngữ nghĩa + healing sẽ vượt hẳn trải nghiệm RPA no-code hiện có trên BM.

---

## 2. Hidemyacc Automation — bộ lệnh & vòng đời script (first-party)

Nguồn: docs.hidemyacc.com (GitBook, mục 6.x Automation, 7.x Synchronizer — đã probe .md trực tiếp 12/10/2026).

### 2.1. Mô hình script

3 cách tạo script [Kiểm chứng — docs 6.1]: kéo-thả lệnh dựng sẵn; import script tự code; **"Record real action"**. Có ~30 script mẫu miễn phí (Facebook, TikTok, Twitter/X, Amazon, Google, eBay...). Script = danh sách lệnh tuyến tính; mọi tham số (selector, text, delay) là thuộc tính của lệnh, chỉnh bằng dialog.

### 2.2. Bảng nhóm lệnh [Kiểm chứng — docs 6.2]

| Nhóm        | Lệnh tiêu biểu                                                                                                                                                                                                                                                                                                                                               | Ghi chú kỹ thuật đáng học                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Variables   | Variables (Text/Number/Boolean/Object/Array/File), Set variable (=, +,-,\*,/, concatenate), Slice variable (đọc chuỗi theo dòng/delimiter, "delete line after used" = queue tiêu dao từ file), Export variable (append/overwrite)                                                                                                                            | Kiểu dữ liệu tối thiểu; "delete line after used" là pattern queue-dữ-liệu đơn giản nhưng hiệu quả                                      |
| Browser     | New tab (kèm random keyword từ server: Google/Amazon/Etsy/eBay, hoặc random dòng text), Wait, Wait navigation, Go back/forward, Close tab, Reload tab, Take screenshot (page/full/element)                                                                                                                                                                   | "Random keyword from server" = nhúng nọi dung làm-noise vào script — phục vụ warm-up, thuộc file 19                                    |
| Interaction | Click element (CSS hoặc XPath do **user tự dán**, có "click rate", "random click", "wait navigation"), Type (**tốc độ gõ random 100–300ms/phím**, nguồn từ file txt random-dòng hoặc tuần tự), SwipeUp/Down (pixel + số lần + break time, random hoặc cố định), JavaScript code ("Run in page" = thực thi như DevTools console), Keypress (Enter/Shift/... ) | Type bắt buộc human-speed ở mức lệnh; "click rate" thừa nhận click thất bại là chuyện thường                                           |
| Condition   | Conditions (so sánh: equals/contains/starts-with/ends-with/RegEx...; `Element exists`/`not exists` kèm **waiting time**; `Variable exists`; nối And/Or), Condition break                                                                                                                                                                                     | Đây chính là "wait-for-element" nguyên thủy: kiểm tra tồn tại có timeout — bản chất giống auto-wait nhưng phải chèn tay vào từng bước  |
| Loops       | Loop data (từ số A→B, hoặc loop theo biến-list có max-data/start-index/element-variable), While loop (lặp theo Conditions), Stop loop                                                                                                                                                                                                                        | While-loop + `Element exists` = pattern "cuộn tới khi hết dữ liệu" cho trang infinite-scroll                                           |
| Facebook    | **Login facebook** (đăng nhập nhiều tài khoản cùng lúc bằng Cookie hoặc UID\|Password; file CSV gồm UID, password, 2FA, recovery email + pass, cookie; lưu kết quả ra CSV), Logout Facebook                                                                                                                                                                  | **Vùng đỏ cho hpma**: mass-login bằng credential/2FA en-masse đúng mô hình tool bị Meta truy quét (file 11) — tuyệt đối không sao chép |
| Files       | Đọc/ghi Google Sheets, Excel (từ mô tả llms.txt)                                                                                                                                                                                                                                                                                                             | Data-driven bulk ops                                                                                                                   |

### 2.3. Record real action [Kiểm chứng — docs 6.4]

- Mở một profile mới (random size), bấm Record: hành vi trong trang → lệnh tương đương (New tab/Click element/Type/Keyboard). **Chỉ ghi được hành vi trong page; thao tác ngoài trang (mở tab, URL, bookmark) không được ghi**.
- Hạn chế được docs tự thừa nhận: phải "click chính xác vào selector; click sai vị trí → hệ thống **click ngẫu nhiên trong khu vực đã chọn**"; phải đợi trang load hẳn; phải tự "double-check selector bằng Inspect" sau khi ghi. → Recorder của họ sinh CSS/XPath thô, **không có lớp chống rot**.

### 2.4. Run & schedule + Synchronizer [Kiểm chứng — docs 6.5, 7.1–7.2]

- Run: chọn N profile; **tối đa 10 profile chạy song song**; số vòng lặp; thứ tự chạy tuần tự hoặc random; **max script run time per thread** (quá giờ vẫn đóng profile); **delay trước khi mở process mới**; mute audio/hide images. Chạy test + Debug panel sau khi chạy. Schedule: 1 script/schedule, ngày-giờ, lặp daily — **yêu cầu mở màn hình Automation mới chạy được** (desktop app, không headless).
- Synchronizer: main profile/controlled profiles — thao tác tay trên main nhân bản realtime sang các controlled (Windows: kích thước/tiling; Text: same text **"Type as human"**, designated text theo thứ tự profile hoặc random; Tabs: same tabs/close tabs; Settings: click-at-once/scroll-at-once/typing speed random X–Y ms). AdsPower Synchronizer gần như tương đương (SunBrowser-based, hotkeys, multi-screen) [Kiểm chứng — help.adspower.com/docs/synchronizer].
- **Bài học cho hpma**: pattern "designated text per-profile" = chính là bulk wizard "mỗi tài khoản một bộ tham số"; còn đồng bộ thao tác tay thời gian thực thì không liên quan (extension chạy trong cùng trình duyệt, queue là đủ).

---

## 3. AdsPower RPA / RPA Plus — vòng đời tác vụ hai tầng (first-party)

Nguồn: help.adspower.com/docs/rpa + blog adspower.com (probe 12/10/2026).

### 3.1. RPA thường [Kiểm chứng]

Process = task-flow dạng danh sách ("Create a task flow", số "điểm" = số bước); chọn hành vi khi lỗi: **skip hoặc stop**; tùy chọn dọn tab/đóng profile sau khi xong; quản lý theo group; **share template bằng sharing-code có giới hạn số lần dùng và thời hạn**; Settings: **task threads song song tối đa 100**; Scheduled task (định kỳ/1 lần); **Task log** chi tiết theo bước, filter theo trạng thái (Waiting/Pending/Running/Complete/Error/Cancelled/Insufficient points) và **Re-execute** từ log (chỉ task Complete/Error/Cancelled); phân quyền team member (vd. cấm "Delete process"); tính phí theo **RPA points** (chạy hỏng/thiếu điểm → hoàn điểm). Marketplace template (Facebook warm-up: add suggested friends + like posts; Amazon add-to-cart/review crawling...). Operations mới bổ sung theo thời gian [Kiểm chứng — blog/news]: **OpenAI prompt (điền biến vào API key/prompt)**, 2Captcha, lấy pasteboard content, fill random numbers, screenshot đặt tên bằng biến.

### 3.2. RPA Plus (khác biệt cốt lõi) [Kiểm chứng — blog adspower-rpa-plus]

| Trục        | RPA                              | RPA Plus                                                                                                                                            | Ẩn ý cho hpma                                      |
| ----------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Editor      | List-based                       | Visual/graph editor, chọn nhiều node, copy/xóa batch; limit 500 → **3.000 node**                                                                    | Flow dài cần editor bậc cao hơn list               |
| Debug       | Chạy lại từ đầu                  | **Debug từ node bất kỳ**, enable/disable từng node, skip node                                                                                       | Resume-step trong queue của mình phải có           |
| Biến        | Không có                         | **Process variables tập trung**, tái dùng mọi nơi                                                                                                   | Tham số hóa ngay từ v1                             |
| JS          | Input đơn giản                   | Code editor cho JS phức tạp                                                                                                                         | Escape hatch JS trong flow                         |
| Exception   | Skip/Abort                       | **Node riêng chạy sau exception**                                                                                                                   | Error-handling như một nhánh flow, không phải flag |
| Task        | Không có khái niệm task tái dùng | **Task = Process + profiles + settings**, rerun, sửa profiles sau, **xem task cross-device**, log theo task/batch (phân bố success/failure một chỗ) | "Job registry" = tài sản cần persist               |
| Marketplace | Template free                    | + paid templates, lưu thẳng thành process, tạo task ngay từ marketplace                                                                             | Mô hình chia sẻ flow cho team/community            |

### 3.3. AI Agent & MCP (2026) [Kiểm chứng — blog + help docs]

- **AdsPower AI Agent** (client ≥ 8.4.3, JS ≥ 2.8.8.4, rollout dần): ra lệnh ngôn ngữ tự nhiên để tạo profile, mở profile → đăng nhập → đăng nội dung, thu thập dữ liệu web (giá/rating/review count, bio/follower...), kết nối MCP server & Skills; tính phí credit ($3/200 credit, valid 360 ngày; hết credit giữa chừng → **task pause, resume đúng chỗ cũ khi nạp thêm**).
- **AdsPower MCP server**: `npx -y local-api-mcp-typescript` (TypeScript + Playwright), Claude Desktop/Cursor điều khiển Local API bằng ngôn ngữ tự nhiên; phải tắt "API verification" khi dùng (cảnh báo bảo mật).
- **Ẩn ý**: thị trường antidetect+RPA đã chính thức bước vào kỷ nguyên "RPA làm xương sống deterministic, AI làm lớp hiểu-ngôn-ngữ ở trên". Chi phí agent được tính chặt theo credit → chi phí agent/UI-step là con số kinh doanh thật, không phải đồ chơi.

---

## 4. Pattern recorder "record → parameterize → replay"

### 4.1. Ưu điểm [Kiểm chứng phần nguồn + phân tích]

- Authoring nhanh cho người không biết code; WYSIWYG; transcript phản ánh đúng luồng tay. UI.Vision (extension RPA trên Chrome/Edge/Firefox, chạy ngay ở MV3-era) nâng cấp v10: **visual record & replay, screenshot-driven automation (image-click + OCR, chạy được kể cả khi cửa sổ ở nền), AI macro assistant mô tả-bằng-lời → macro, MCP bridge cho AI client** [Kiểm chứng — ui.vision v10]. Tức recorder-ext vẫn sống khỏe trong MV3 và đang tiếp hóa AI.
- **Parameterize**: biến tập trung (AdsPower), data-driven từ CSV/Sheets (Hidemyacc Files, UI.Vision CSV import), designated-per-profile → đây là lớp bắt buộc để transcript trở thành "flow".

### 4.2. Nhược điểm — đặc biệt chết người trên Comet/BM

1. Transcript là CSS/XPath **dài, chắc tại thời điểm record**: BM đổi class/hash theo deploy (file 09 §3.1) → vỡ sau vài ngày. **[Suy luận — cần test: đo chu kỳ sống của selector XPath-recorded trên BM settings]**
2. Không nhìn thấu A/B test/ngôn ngữ UI: text-recorded "Đối tác" vs "Partners".
3. Timing cứng: replay nhanh hơn render; recorder không ghi "điều kiện đủ để bước tiếp theo chạy" → phải đính kèm wait thủ công ("Wait for page load fully" — Hidemyacc tự nhắc).
4. Recorder không ghi iframe/shadow-DOM đúng cách và không ghi được tác vụ ngoài page (giới hạn tự thừa nhận của Hidemyacc 6.4).
5. Sự cố an toàn: click lệch → "random click within area" (Hidemyacc) là chấp nhận được ở warm-up, **không chấp nhận được trên màn hình ghi của BM** (click nhầm = ghi sai dữ liệu tài sản).

**Kết luận ứng dụng**: recorder chỉ nên tồn tại ở vị trí **authoring-assist cho dev** (sinh draft flow khi thiết kế tác vụ mới), đầu ra phải chuyển ngay sang dạng "semantic step" (đích là role/text/đường route + nghiệp vụ), **tuyệt đối không ship transcript thô cho người dùng chạy**. Screenshot/image-click kiểu UI.Vision chỉ hợp làm **fallback cuối** (trang render bất thường) chứ không làm cơ chế chính.

---

## 5. Engine locator kiểu Playwright — bản đồ port vào MV3 content script

### 5.1. Những gì cần port (chuẩn Playwright/Testing Library)

- **Selector engines**: css, xpath, text (substring/exact), **role + accessible name** (getByRole) — engine role dựa trên cây ARIA, bền với class-rot của Comet vì Meta chuẩn a11y (đồng bộ khuyến nghị file 09 §3.1) [Kiểm chứng — Playwright docs].
- **Auto-waiting + actionability checks** trước mọi action [Kiểm chứng — playwright.dev/docs/actionability]: element resolve đúng 1 phần tử; Visible (bbox non-empty, không visibility:hidden), Stable (giữ bbox 2 animation-frame liên tiếp), **Receives Events** (element tại action-point là hit target — vượt quan trọng với overlay/spinner của BM), Enabled, Editable (cho fill). Auto-retry assertions (toBeVisible/toHaveText...) với timeout → thay thế hoàn toàn `sleep` cứng.
- **No codegen ở runtime**: phù hợp MV3 (codegen chỉ là công cụ dev).

### 5.2. Đánh giá khả dụng cụ thể trong content script MV3

| Phương án                                                  | Đánh giá                                                              | Ghi chú                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle trực tiếp playwright-core                           | **Không** [Kiểm chứng — kiến trúc PW]                                 | Phụ thuộc Node (ws, fs), driver qua CDP/IPC — không chạy được trong tab                                                                                                                                                                                                                                                                             |
| Trích "injected script" của Playwright (cụm chạy in-page)  | Khả thi kỹ thuật nhưng **không nên** [Suy luận]                       | Bundle nội bộ không đóng gói để tiêu thụ ngoài; maintain theo upstream rất đau; license/size không kiểm soát                                                                                                                                                                                                                                        |
| **`@testing-library/dom`** queries + tự viết actionability | **Khuyến nghị** [Kiểm chứng — npm & probe build]                      | v10.4.2; deps aria-query 5.3.0 + dom-accessibility-api 0.5.x; **đo build thật bằng esbuild 12/10/2026: chỉ import getByRole/getByText/queryByRole → bundle min ≈ 180 KB nén ≈ 38 KB gzip** — chấp nhận được cho content script; không dùng eval → **CSP-safe** trong isolated world (script extension đã bundle không chịu page CSP — file 09 §3.6) |
| XPath                                                      | Dùng **`document.evaluate` native** — không cần polyfill [Kiểm chứng] | Loại toàn bộ lib xpath dùng `new Function` (ví CSP `unsafe-eval` của extension)                                                                                                                                                                                                                                                                     |
| Actionability tự viết                                      | **Bắt buộc** (Testing Library chỉ query, không act)                   | ~200–400 dòng: polling bằng rAF/MutationObserver cho attached/visible/stable; `elementsFromPoint` cho receives-events; disabled/aria-disabled cho enabled [Suy luận — cần test trên dialog/spinner thật của BM]                                                                                                                                     |

- **Bundle budget**: content script nên < ~500 KB gzip tổng để inject nhanh; 38 KB cho query layer là hợp lý [Suy luận — need perf test trên máy yếu].
- Lưu ý i18n: accessible name/text đổi theo ngôn ngữ UI của user → locator phải lưu map đa ngôn ngữ (vi/en) hoặc ưu tiên role+href/aria-label ổn định, text chỉ là fallback [Suy luận — cần test 2 locale].

---

## 6. Self-healing selector — cơ chế & open-source tham chiếu

### 6.1. Bốn họ cơ chế

| Họ                            | Cơ chế                                                                                                     | Ví dụ open-source                                                                                                                                                                                                                    | Đánh giá cho hpma                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fallback chain nhiều locator  | Lưu N locator cho 1 step, thử lần lượt                                                                     | Katalon/TestProject-style; Hidemyacc/AdsPower **không có**                                                                                                                                                                           | **Adopt** — rẻ, dễ audit                                                                                                                                                         |
| Snapshot + similarity scoring | Lưu "path" phần tử lúc pass; khi NoSuchElement → so khớp cây DOM để tìm ứng viên gần nhất trên ngưỡng điểm | **Healenium** (healenium-web 201★, proxy Selenium; `score-cap=0.5` = chỉ heal khi xác suất khớp ≥50%, `recovery-tries`, backend lưu locator history, thành phần "imitator" chuẩn bị lúc thành công) [Kiểm chứng — README]            | **Adopt dạng nhẹ**: fingerprint (ancestor-chain role/text + thuộc tính ổn định) lưu trong chính storage extension, re-score ngay tại content script khi miss — không cần backend |
| XPath repair heuristic        | Sinh lại XPath robust từ mô tả phần tử cũ                                                                  | **Robula+** (cyluxx/robula-plus, 187★, **stalled từ 2023** — dự án không còn maintain) [Kiểm chứng — GitHub API]                                                                                                                     | Không phụ thuộc repo chết; chỉ tham khảo thuật toán nếu tự viết                                                                                                                  |
| LLM re-location               | Mô tả đích bằng ngôn ngữ tự nhiên; khi UI đổi, model tìm lại selector rồi cache                            | **Stagehand `act()/observe()` "refresh how an action happens when the site changes"** (25.6k★; localBrowser session persist; v4 chạy cạnh browser như extension để giảm latency) [Kiểm chứng — README; *vendor claim về độ tin cậy*] | Chỉ dùng cho **authoring/suggest có người duyệt**, không cho nút ghi tự động                                                                                                     |

### 6.2. Nguyên tắc healing riêng của hpma (khác test automation)

Trong test automation, heal rồi báo "pass" là OK. Trên BM, **click nhầm = sự cố ghi dữ liệu tài sản**. Vậy: (1) healing chỉ kích hoạt khi **đúng 1 ứng viên vượt ngưỡng điểm** (tương tự score-cap của Healenium); (2) đa ứng viên mơ hồ → **dừng, fail-soft hỏi user** (đồng bộ file 15 §4); (3) mọi lần heal ghi vào audit log (step, locator cũ, locator mới, điểm số, thời điểm) — log này vừa là tư liệu bảo trì flow vừa là bằng chứng khi user khiếu nại; (4) heal threshold cho tác vụ ghi phải cao hơn tác vụ đọc. [Suy luận — cần test trên tác vụ rename tài sản thật]

---

## 7. Orchestration: queue, serial-per-profile, resume, đa tab/đa tài khoản

Học từ cả hai vendor rồi map sang MV3:

| Bài học từ RPA vendors                                | Tương đương trong hpma-extension (MV3)                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task threads ≤100 (AdsPower), ≤10 profile (Hidemyacc) | **Song song thấp là đủ**: 1–2 tab thực thi đồng thời — user phải nhìn kịp để can thiệp (human-in-the-loop); tài nguyên logic là tài khoản, không phải CPU                                                                                                                                                                                                                              |
| Max runtime per thread + đóng profile khi hết giờ     | Timeout per-step và per-job; hết giờ → abort nhẹ nhàng, đóng tab phụ, báo log                                                                                                                                                                                                                                                                                                          |
| "Clear tabs & close profile after task"               | Quản lý tab lifecycle: mở tab thao tác → re-focus tab cũ của user khi xong → dọn tab rác                                                                                                                                                                                                                                                                                               |
| Scheduled task + Re-execute từ log                    | `chrome.alarms` (ngầm ≥30s/1 phút — file 09 §3.6) + **job store** trong `chrome.storage` (SW bị kill sau ~30s idle nên mọi state phải persist sau mỗi step); job = `{flowId, accountScope(c_user), steps[], cursor, retries, status}`; resume = load job, nhảy tới cursor [Kiểm chứng — chrome docs + file 09; thiết kế cụ thể: Suy luận]                                              |
| RPA Plus: debug từ node bất kỳ / exception node       | Queue hỗ trợ "resume từ step i" và error-branch per-step (khác flag skip/abort đơn giản)                                                                                                                                                                                                                                                                                               |
| "Delay before opening a new process"                  | **Delay mở tác vụ kế tiếp cùng tài khoản** — vẫn là pacing (file 19), nhưng cơ chế nằm ở scheduler                                                                                                                                                                                                                                                                                     |
| Serial-per-profile (một profile = một luồng)          | **Khóa theo tài khoản**: extension chạy trong cookie store của profile ⇒ 1 tác vụ/1 tài khoản tại một thời điểm; xác định accountScope bằng cookie `c_user` đọc được từ môi trường tab [Kiểm chứng — bản chất cookie jar; API: Suy luận cần host permission]                                                                                                                           |
| Đa tài khoản đồng thời                                | Chrome: **không có container tabs** → nhiều tài khoản = nhiều Chrome profile = nhiều cửa sổ có extension riêng (queue chia theo profile tự nhiên). **Firefox**: `contextualIdentities` API (cookieStoreId riêng từng container, extension mở tab vào container chỉ định) [Kiểm chứng — MDN] ⇒ bản Firefox có thể chạy N phiên FB trong một cửa sổ — khác biệt kiến trúc đáng khai thác |
| (Không có ở vendors) chống xung đột với user          | User đang thao tác tab BM trong khi job chạy → content script gắn listener input báo SW "user-active" → **pause queue của tab đó** [Suy luận — cần test]                                                                                                                                                                                                                               |

Không copy: Synchronizer "mirror thao tác tay realtime" (không có use-case trong extension đơn-profile); chỉ lấy ý tưởng **designated-data-per-account** cho bulk wizard.

---

## 8. AI agent lái UI cho tác vụ BM — khả thi đến đâu?

Cảnh quan 10/2026 [Kiểm chứng — GitHub API & docs]:

- **browser-use** (117.7k★, Python/TS, MIT): DOM-serialization agent; bản mới có CLI "Browser Harness", cloud browser, benchmark riêng **BU Bench v2** — chính họ gọi đây là _"this very hard benchmark... very hard browser tasks"_ ⇒ agent tự chủ trên web thật vẫn là bài toán khó ngay cả với model mạnh.
- **Stagehand** (Browserbase, 25.6k★, TS/Python/Go): ba primitive `observe/act/extract`; session persist bằng userDataDir; "act() self-heals khi site redesign"; v4 chạy cạnh browser; cache server-side để tiết kiệm token. ⇒ Mô hình "deterministic-có-thể + LLM-khi-cần" là chuẩn mực mới của browser agent.
- **Skyvern** (23.2k★): đi hướng CV+LLM (vision-grounded), nặng hạng cho workflow phức tạp.
- **UI.Vision v10**: AI macro assistant miễn phí trong chính extension (mô tả → macro → chạy → tự sửa lỗi) + MCP bridge. ⇒ "AI bên trong extension" đã là sản phẩm thật.
- **AdsPower AI Agent + MCP** (§3.3): ngôn ngữ tự nhiên đa profile, pause/resume theo credit.
- **Chrome built-in AI — Prompt API (Gemini Nano)**: **stable từ Chrome 138 _dành riêng cho Chrome Extensions_** [Kiểm chứng — developer.chrome.com built-in APIs]: LLM on-device, không gửi dữ liệu ra ngoài — phù hợp red-line bảo mật của dự án (file 09 §3.4); hạn chế: cửa sổ ngữ cảnh nhỏ, không vision [Suy luận — cần test].

**Đánh giá cho tác vụ BM:**

- **Phù hợp ngay**: (a) authoring-assist — từ mô tả tác vụ gợi ý draft flow; (b) **classify màn hình** (màn này là settings nào? dialog này loại gì? có phải checkpoint không?) bằng Gemini Nano — giúp flow tự định vị giữa Comet A/B; (c) healing có giám sát (§6.2); (d) dịch màn hình lỗi → khuyến nghị hành động cho user.
- **Chưa phù hợp (tránh)**: agent loop tự chủ toàn phần cho tác vụ ghi hàng loạt — non-deterministic, latency/chi phí mỗi step, và lỗi click sai trên màn quản trị tài sản là không chấp nhận được; vendor benchmark còn tự nhận "very hard". Computer-use screenshot-click càng xa thực tế MV3.
- **Kiến trúc khuyến nghị (hybrid)**: **deterministic flow là xương sống; LLM chỉ ngồi ở các nút "hiểu"** (classify/suggest/extract) và ở authoring; mọi bước ghi vẫn qua preview-diff + xác nhận khi nhạy cảm (đồng bộ guardrail file 15 §4 & 19). Đây đúng bằng mô hình Stagehand (deterministic driver + LLM primitives) và là hướng AdsPower cũng đã chọn (RPA + AI Agent tách tầng).

---

## 9. Kết luận: adopt / tránh cho hpma-extension

**Nên adopt** (thứ tự ưu tiên):

1. **Script model hai tầng kiểu RPA Plus**: "Flow" (định nghĩa tái dùng, có biến tập trung) + "Job" (gắn tài khoản + tham số + log + re-run từ log). Task log là first-class entity, lọc theo trạng thái.
2. **Locator ngữ nghĩa + auto-wait/actionability**: engine `@testing-library/dom` (~38 KB gzip, CSP-safe) + lớp actionability tự viết (visible/stable/receives-events/enabled) — loại bỏ `sleep` cứng (ngoại trừ pacing ở file 19).
3. **Fallback chain + soft-healing có ngưỡng điểm** trong content script (fingerprint lúc record-ở-dev, re-score một ứng viên, đa-nghĩa thì hỏi user), kèm audit log mọi lần heal.
4. **Queue persistent** chịu được SW-kill: state sau mỗi step vào storage, resume bằng cursor, khóa serial-per-account (`c_user`), timeout per-step/per-job, pause khi user-active; Firefox khai thác `contextualIdentities` cho đa tài khoản một cửa sổ.
5. **Recorder ở vị trí dev-tool** (sinh draft semantic flow), từng bước chuyển thành role/text/route-based step; giữ lại screenshot ở thời điểm thiết kế làm fingerprint.
6. **AI ở lớp "hiểu"**: Gemini Nano classify màn hình + author-assist + healing-suggest; OpenAI-prompt-style variable (AdsPower) chứng minh cần khe cắm biến trong prompt.
7. Lệnh **đặc thù domain** tách riêng nhóm "BM surface" (open Settings → surface X, fill partner id...) — tương đương nhóm "Facebook group" của Hidemyacc nhưng nội dung là điều hướng BM chứ không phải mass-login.

**Nên tránh:**

1. Replay transcript CSS/XPath thô (chết theo deploy Comet — file 09 §3.1, file 14 về rot) và mọi "random click when selector bad" trên màn hình ghi.
2. Full-autonomy AI agent cho tác vụ ghi; screenshot-image-click làm cơ chế chính (UI.Vision-style chỉ để fallback).
3. Mass-login/credential-CSV (nhóm lệnh "Login facebook" của Hidemyacc) — đụng vùng đỏ ToS (file 11) và nguy hiểm hơn cả export cookie.
4. Song song cao / nhiều tài khoản trong cùng Chrome profile (cookie conflict; tín hiệu cluster — file 15 §3.1); vendor tự giới hạn 10–100 luồng cho antidetect riêng từng máy, extension đơn-profile còn phải thấp hơn nhiều.
5. Phụ thuộc repo self-healing đã chết (Robula+) hoặc backend healing ngoài (Healenium) — giữ toàn bộ healing on-device.

---

## 10. Nguồn tham khảo

**First-party, đã probe trực tiếp 12/10/2026 (độ tin cậy Cao):**

1. Hidemyacc Docs (GitBook): llms.txt + 6.1 Overview; 6.2 Command groups (Variables, Browser, Interaction, Condition, Loops, Facebook, Files); 6.4 Record real action; 6.5 Run & schedule; 7.1–7.2 Synchronizer — https://docs.hidemyacc.com/llms.txt (truy cập bản `.md` từng trang).
2. AdsPower Help Center: RPA (process/group/share-code/settings 100 threads/scheduled/task log/permissions) — https://help.adspower.com/docs/rpa ; Synchronizer — https://help.adspower.com/docs/synchronizer ; MCP (local-api-mcp-typescript) — https://help.adspower.com/docs/MCP
3. AdsPower Blog/News (first-party marketing, tin cậy TB–Cao cho tính năng): "AdsPower RPA Plus Is Live" — https://www.adspower.com/blog/adspower-rpa-plus ; "AdsPower Unveils AI Agent" — https://www.adspower.com/blog/adspower-ai-agent ; "What Is New to RPA" (OpenAI/2Captcha variables, task log filter + re-execute) — https://www.adspower.com/blog/what-is-new-to-rpa ; "Expand Automation Possibilities through New RPA Operations" — https://www.adspower.com/news/expand-automation-possibilities-through-new-rpa-operations ; "Step-by-step instructions for RPA" — https://www.adspower.com/blog/step-by-step-instructions-for-using-rpa-automation-from-adspower ; "AI Agentic Browser vs Traditional Browser Automation" (khung so sánh step-based vs goal-oriented — vendor opinion) — https://www.adspower.com/blog/ai-agentic-browser-traditional-browser-automation
4. Playwright Docs: Auto-waiting & actionability (bảng check từng action) — https://playwright.dev/docs/actionability
5. UI.Vision v10 (extension RPA: visual record & replay, screenshot-driven automation, AI macro assistant, MCP bridge) — https://ui.vision/rpa/docs/xmodules
6. Chrome Developers: Built-in AI APIs (Prompt API stable Chrome 138 dành riêng cho Extensions) — https://developer.chrome.com/docs/ai/built-in-apis
7. MDN: `contextualIdentities` (cookieStoreId độc lập per container; chỉ Firefox) — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/contextualIdentities
8. npm registry `@testing-library/dom@10.4.2` (deps aria-query 5.3.0, dom-accessibility-api ^0.5.9, unpacked ~2.4 MB) — https://registry.npmjs.org/@testing-library/dom/latest

**Đo đạc trên môi trường nghiên cứu:** 9. Bundle probe: cài `@testing-library/dom@10.4.2` trong /tmp, esbuild minify iife chỉ với `getByRole/getByText/queryByRole` → **184.775 B, gzip 38.334 B** (2026-10-12). 10. GitHub API (probe stars/pushed 2026-10-12): browser-use/browser-use 117.701★ (pushed 2026-10-09); browserbase/stagehand 25.635★ (2026-10-10); Skyvern-AI/skyvern 23.185★ (2026-10-12); healenium/healenium-web 201★ (2026-10-06); cyluxx/robula-plus 187★ (**pushed 2023-01-07 — stalled**). 11. README: Healenium (score-cap 0.5, recovery-tries, @DisableHealing, kiến trúc proxy+backend) — https://github.com/healenium/healenium-web ; Stagehand (observe→selector, act self-heal, localBrowser session persist, chạy cạnh browser — _một phần vendor claim_); browser-use (BU Bench v2 "very hard", Browser Harness CLI, cloud).

**Nguồn không tiếp cận được & giới hạn:**

- archive.org trả 429 từ môi trường nghiên cứu (không lấy được snapshot trang RPA cũ của AdsPower); trang `help.adspower.com/docs/rpa` là SPA — nội dung lấy qua text-extraction, chi tiết từng "operation" nhỏ của editor AdsPower không enumerate hết được từ docs công khai → danh sách operation AdsPower ở §3.1 là các nhóm mức-help + bổ sung từ blog update, **không phải inventory đầy đủ** [cần bổ sung khi có quyền truy cập app].
- Các con số thị phần/độ tin cậy tự công bố của vendor (Stars không suy ra chất lượng; "self-heals" của Stagehand là tuyên bố marketing chưa benchmark độc lập).
