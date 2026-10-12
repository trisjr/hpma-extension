# 21 — Đề xuất kiến trúc DOM copilot cho hpma-extension sau pivot

> Phạm vi: **design doc kiến trúc** (không code) cho hướng DOM automation sau khi pivot bỏ hướng "trích EAAG → gọi Graph API" — content script chỉ match `business.facebook.com` và chạy **headless** (không inject UI), UI copilot đặt ở **side panel / popup / options** (cập nhật 12/10/2026 — xem §5.1), action engine dạng step-machine, primitives, message broker ở background, cổng xác nhận human-in-the-loop (HITL), audit log append-only, storage schema, devtest mới (DOM probe/diagnostics), manifest production, khác biệt Chrome/Firefox, chiến lược kiểm thử trên BM thật, lộ trình migrate từ code hiện tại.
> Không lặp lại: kỹ thuật DOM/Comet chi tiết (`file 09 §3.1`, `09 §3.6`), mapping quyền UI→task (`14-partner-assign-mapping-graphql.md §2`), khung rủi ro & pacing vận hành (`15-browser-session-ops-practice.md §3–4`), vùng đỏ ToS (`11-policy-compliance.md §4.3`), test plan EAAG cũ (`16-test-plan-eaag-agencies.md`). File này trích các kết luận cần thiết và gắn chúng vào module cụ thể.
> Thời điểm nghiên cứu: **2026-10-12**.

---

## 1. Tổng quan

Test thực địa theo `file 16` cho kết quả **FAIL-WRITE**: token EAAG trích từ phiên `business.facebook.com` trả lỗi thiếu quyền (code 10/200) ở các edge ghi nhạy cảm — tiêu biểu `POST /act_{id}/agencies` — dù quyền đọc vẫn ổn [Kiểm chứng — kết quả chạy test plan file 16, do chủ dự án xác nhận 12/10/2026]. Theo bảng quyết định sẵn có của `file 16 §10`, FAIL-WRITE dẫn tới "GraphQL replay"; chủ dự án chọn rẽ mạnh hơn: **DOM automation thuần** — thao tác trực tiếp UI Business Manager như user thật, vì UI luôn mang đủ quyền của người đang đăng nhập, không lệ thuộc scope token [Kiểm chứng — file 15 §1: UI BM tự gọi nội bộ bằng quyền phiên; file 09 §2: ~20% tác vụ chỉ có trên UI].

Hệ quả kiến trúc: extension **không còn lớp token** (không trích, không cache, không gọi `graph.facebook.com`); thay bằng **action engine** chạy trong content script trên đúng origin BM, dưới sự giám sát của panel copilot và background broker.

> **Quyết định bổ sung (12/10/2026) — "no in-page UI":** panel copilot **không** render lên DOM của `business.facebook.com`. Content script chỉ giữ engine (headless); UI chuyển sang extension pages — **side panel là bề mặt chính**, popup cho trạng thái nhanh + kill-switch, options cho cấu hình + audit log. Lý do: (i) giảm dấu vết extension trong DOM trang mà Meta có thể quét [Suy luận — cần test; chưa có bằng chứng Meta quét DOM extension, nhưng tách UI ra ngoài loại bỏ hẳn rủi ro này]; (ii) page JS không chạm được UI/nút confirm của extension; (iii) hết nhu cầu Shadow DOM + prefix CSS cho panel; (iv) đúng tuyệt đối quy tắc "không mutate DOM host ngoài engine step". Đánh đổi: thêm lớp message panel ↔ content script, phải gắn panel với đúng `tabId`, và `sidePanel` (Chrome) ≠ `sidebar_action` (Firefox). Guardrail giữ nguyên từ `file 15 §4` và `file 11 §4.3`: an toàn tài khoản trên hết, HITL cho tác vụ nhạy cảm, fail-soft, tuyệt đối không đụng vùng đỏ (payment/appeal/verification/vượt checkpoint).

Đây là file đầu tiên của **Vòng 3 — Hướng DOM automation**; nó chốt sơ đồ module + tên file đề xuất trong `src/`, để các file research vòng 3 tiếp theo (flow cụ thể, selector registry, pacing) bám vào.

---

## 2. Bối cảnh pivot & tiền đề thiết kế (ground truth 12/10/2026)

> **Cập nhật 12/10/2026:** code prototype đã được chủ dự án **xóa** để xây lại theo thiết kế này; các mục "Tái dùng"/"Giữ lại" ở §2 và §8 liên quan tới code prototype (`engine/`, `panel/`, `flows/`, `shared/`) nay chỉ còn nghĩa là _tái dùng ý tưởng/thiết kế_. Hạ tầng starter (`createShadowRoot`, postcss, `vite.config.ts`) vẫn còn trong repo.

Kiểm kê repo thực tế trước khi thiết kế [Kiểm chứng — `find src -type f` + `git log` ngày 12/10/2026]:

| Thành phần                                                                                                              | Trạng thái thực tế                                                                                                                                    | Hệ quả cho thiết kế                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/manifest.ts`                                                                                                       | permissions `activeTab, storage`; content script `matches: <all_urls>`; `web_accessible_resources` `<all_urls>`                                       | Phải siết về `business.facebook.com` (§6); lỗi `<all_urls>` đúng như cảnh báo `file 09 §3.4`                                                                                                                                         |
| `src/background/index.ts`                                                                                               | 5 dòng hello-world của starter                                                                                                                        | Chưa có broker — xây mới hoàn toàn                                                                                                                                                                                                   |
| `src/utils/createShadowRoot.tsx`                                                                                        | Shadow DOM + `adoptedStyleSheets` + fallback `<style>` + mount node riêng né Xray Firefox                                                             | Sau quyết định "no in-page UI" (§5.1): **không còn dùng cho content script**; vẫn dùng để boot popup/options/side panel theo quy ước dự án (CLAUDE.md)                                                                               |
| `postcss.config.js`                                                                                                     | `postcss-prefix-selector` prefix `#my-ext`, map `:root/html/body → :host`, giữ `:host [data-theme]`; kèm `rem→px`                                     | Giữ nguyên vì các page vẫn boot qua `createShadowRoot`; lý do px-hóa (font-size gốc trang BM) **không còn áp dụng** cho UI vì UI không nằm trong trang BM nữa — có thể gỡ `rem→px` khi dọn [Suy luận — cần test hiển thị side panel] |
| `vite.config.ts`                                                                                                        | merge manifest theo browser: Chrome `service_worker` module / Firefox `background.scripts`; `options_page` vs `options_ui`                            | **Tái dùng nguyên vẹn** cho §6                                                                                                                                                                                                       |
| **`src/background/devtestApi.ts`, `src/devtest/messaging.ts`, LogPanel, messaging broker, guardrails của devtest EAAG** | **KHÔNG TỒN TẠI trong repo** — devtest EAAG chỉ là test plan trên giấy (`file 16`), chưa từng được implement                                          | Chi phí "loại bỏ sạch" = 0; "tái dùng" ở đây nghĩa là tái dùng **pattern thiết kế** (typed union + validate), không phải code sẵn có                                                                                                 |
| `src/content/Content.tsx`                                                                                               | Component demo DaisyUI của starter                                                                                                                    | Xóa; UI copilot nằm ở side panel (§5.1), content script không còn component React                                                                                                                                                    |
| Stack                                                                                                                   | React 19 + TS strict + Tailwind 4 + DaisyUI 5 + `webextension-polyfill` (dùng `browser.*`, không `chrome.*` — quy tắc CLAUDE.md); chưa có test runner | Không thêm dependency tiện ích (zod...) khi chưa chốt — validate viết tay trước [Suy luận — cần test khi message schema lớn]                                                                                                         |

Tiền đề kỹ thuật áp dụng nguyên văn từ research cũ: selector bền theo `role`/`aria-label`/text/href — cấm class hash; React controlled input phải set qua native setter + dispatch `input`; click "thật" bằng chuỗi `PointerEvent`; mọi flow là state machine "chờ → act → verify" vì BM là SPA React/Relay không reload (`file 09 §3.1`); service worker Chrome bị kill sau ~30s idle nên state dài hạn để ở content script/storage, SW chỉ điều phối (`file 09 §3.6`).

---

## 3. Nguyên tắc kiến trúc & guardrails (bắt buộc)

1. **UI-as-truth**: engine chỉ "nhìn" và "chạm" DOM của tab BM đang đăng nhập; không giả lập request, không replay GraphQL ở giai đoạn này (replay nội bộ vẫn là phương án dự phòng opt-in — `file 14 §3.2` — nhưng **không** thuộc kiến trúc lõi pivot).
2. **Fail-soft**: mọi step có timeout; verify thất bại → dừng flow, báo panel, không retry vô hạn, không "bấm tiếp cho chắc" (đồng nhất `file 09 §4` #5 và `file 15 §4.B` #10).
3. **Human-in-the-loop theo tầng rủi ro** (ma trận §5.6); vùng đỏ `file 11 §4.3` (payment, appeal, business verification, claim/transfer ownership, vượt checkpoint, đổi thông tin bảo mật) engine **từ chối chạy** — chỉ mở deep-link + checklist hướng dẫn tay.
4. **Pacing như người thật**: delay nền 3–8s + jitter giữa mọi hành động ghi; giới hạn/ngày theo độ "cứng" BM (khung `file 15 §4.B` #8–9, giữ nguyên vì behavioral detection áp dụng cho cả DOM automation [Kiểm chứng — tín hiệu "tốc độ/tần suất" ở file 15 §3.1]; mức số cụ thể tinh chỉnh khi có dữ liệu thực địa [Suy luận — cần test]).
5. **Tối thiểu quyền**: chỉ `business.facebook.com`, không `<all_urls>`, không cookie/token, không gửi dữ liệu ra server ngoài (`file 09 §3.4`, `file 11 §3.4`).
6. **Idempotent & verify-readback**: trước khi ghi, đọc trạng thái hiện tại từ DOM; sau khi ghi, đọc lại từ DOM (không tin toast/optimistic UI); bỏ qua mục đã đúng trạng thái (kế thừa `file 15 §4.B` #10).
7. **No in-page UI**: không render bất kỳ UI nào của extension vào DOM `business.facebook.com`. Content script = engine + listener message; mọi hiển thị và xác nhận HITL diễn ra ở extension pages. Phần tử duy nhất extension tác động lên DOM BM là các step của engine.

---

## 4. Sơ đồ kiến trúc tổng thể

```
Side panel (chính) / Popup / Options  — extension pages (React), KHÔNG nằm trong DOM BM
   │  browser.tabs.connect(tabId) / tabs.sendMessage(tabId)  ← typed union + validate
   │  ← events step/verify/fail/confirm-needed (content script → runtime.sendMessage / Port)
   ▼
Content script HEADLESS (business.facebook.com, không mount UI)
   ├─ Action engine ──> Primitives ──> DOM của BM (locate/act/verify)
   ├─ SelectorRegistry (bảng selector versioned theo surface + locale)
   ├─ FlowRegistry (danh sách flow + risk tier)
   └─ surfaceDetect → báo surface hiện tại cho side panel
Background broker (SW Chrome / event page Firefox) ── stateless:
   policy gate ─ HITL confirm round-trip ─ audit append-only ─ điều hướng tab
Storage: browser.storage.local (settings, audit chunks, selector packs) —
         runtime state + pending-confirm giữ tại content script (SW chết ~30s,
         đóng side panel giữa chừng đều không làm mất flow)
```

Panel ↔ content script đi **trực tiếp** qua `tabs.connect(tabId)`/`tabs.sendMessage(tabId)` (extension page được phép gọi API `tabs`); background chỉ tham gia ở các bước policy/audit/điều hướng, không làm relay bắt buộc [Suy luận — cần test hành vi Port khi tab điều hướng SPA/reload và khi side panel đóng-mở lại].

| Module (đề xuất trong `src/`)                                                                                                            | Trách nhiệm                                                                                                                    | Giao tiếp                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/content/index.prod.tsx` (sửa từ starter)                                                                                            | Boot content script **headless**: chỉ khởi động engine + listener message khi URL thuộc whitelist route BM; **không mount UI** | Nhận lệnh từ side panel, phát event ngược lại                                                           |
| `src/sidepanel/` (dời từ `src/content/panel/`: `CopilotPanel.tsx`, `ConfirmDialog.tsx`, `LogPanel.tsx`, `FlowCard.tsx`, `ProbeCard.tsx`) | UI copilot chính: chọn flow, xem diff/dry-run, progress, confirm HITL, nhật ký chạy; theo dõi tab BM đang active (`tabId`)     | `tabs.connect(tabId)` tới content script; root `id='my-ext'` + `data-theme` theo quy tắc CLAUDE.md      |
| `src/popup/` (mở rộng)                                                                                                                   | Trạng thái nhanh (tab BM nào, flow đang chạy), nút mở side panel, **kill-switch**                                              | Không đặt confirm HITL/flow dài ở đây (popup đóng khi mất focus)                                        |
| Dialog window (tuỳ chọn)                                                                                                                 | Confirm 2 lớp cho tác vụ nhạy cảm khi cần nổi bật hơn side panel — `windows.create({type:'popup'})`                            | Là cửa sổ tách rời, **không** phải dialog trong trang                                                   |
| `src/content/engine/stepMachine.ts`                                                                                                      | Thực thi `FlowDef`: lặp step → gọi primitive → verify → phát event; timeout/abort/kill-switch                                  | Được side panel kích hoạt qua message; emit `FlowProgress`/`FlowResult`                                 |
| `src/content/engine/primitives.ts`                                                                                                       | `click, type, select, waitFor, waitGone, assertText, readText, scrollIntoView` (§5.3)                                          | Thuần DOM, không dependency extension                                                                   |
| `src/content/engine/selectors.ts`                                                                                                        | SelectorRegistry: key → chuỗi selector + nhãn EN/VI, versioned theo surface; health-check dùng cho devtest                     | Được primitives & devtest probe dùng                                                                    |
| `src/content/flows/*.ts` (vd `flows/partnerAssign.ts`, `flows/renameAdAccount.ts`, `flows/sharePixel.ts`)                                | Định nghĩa flow (step list + risk tier + hàm dựng diff dry-run) — mapping quyền theo `file 14 §2` làm config                   | Import bởi engine; side panel chỉ lấy metadata flow (id, title, risk) qua message hoặc import type-only |
| `src/shared/messaging.ts`                                                                                                                | Typed union `BrokerMessage` + `validateMessage()` (type guard viết tay) + `requestId` tương quan                               | Dùng chung panel ↔ background ↔ popup/options                                                         |
| `src/background/index.ts` → `src/background/broker.ts`                                                                                   | Router message stateless: kiểm policy (rate/ngày, vùng đỏ), điều phối confirm round-trip, điều hướng/mở tab BM                 | `browser.runtime.onMessage`/Port; đọc-ghi storage                                                       |
| `src/background/auditLog.ts`                                                                                                             | Ghi audit append-only vào `storage.local` (chunk theo tháng)                                                                   | Được broker gọi sau mỗi sự kiện                                                                         |
| `src/options/Options.tsx` (mở rộng)                                                                                                      | Trang cấu hình pacing/giới hạn + xem/export audit log                                                                          | `browser.storage` trực tiếp                                                                             |
| `src/devtest/probe.ts` + `src/devtest/TraceRecorder.ts`                                                                                  | Devtest mới: surface detect, selector health, trace recorder (§5.8)                                                            | Chỉ build dev / flag bật                                                                                |

---

## 5. Thiết kế module chi tiết

### 5.1. UI copilot ngoài trang: side panel / popup / options (thay cho panel Shadow DOM)

> Thay thế thiết kế ban đầu "panel trong Shadow DOM của content script" (quyết định 12/10/2026, xem §1 và nguyên tắc §3.7).

- Content script prod match **chỉ** `https://business.facebook.com/*` và **không mount UI**. Nó chạy engine, lắng nghe message từ extension pages, và báo `surfaceDetect` (URL + marker DOM; re-check khi SPA đổi route qua hook `history.pushState` + `MutationObserver` — pattern `file 09 §3.1`). Ngoại lệ duy nhất đối với "không mutate DOM host": **engine mutate DOM BM theo step** (đó là chức năng) [Kiểm chứng — quy tắc CLAUDE.md].
- **Phân vai bề mặt UI:**

| Bề mặt                                                                | Dùng cho                                                                            | Giới hạn                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Side panel** (chính) — Chrome `sidePanel`, Firefox `sidebar_action` | Chọn flow, dry-run diff, progress, confirm HITL (cả 2 lớp), log realtime, ProbeCard | Hai API khác nhau giữa 2 browser → manifest key tách trong `vite.config.ts` (§6); giao diện dùng chung |
| **Popup**                                                             | Trạng thái nhanh, mở side panel, kill-switch                                        | Đóng khi mất focus → không giữ flow dài/confirm                                                        |
| **Options**                                                           | Pacing, limit/ngày, `logDetail`, xem/export audit log, cờ devtest                   | Không gắn tab → không chạy flow                                                                        |
| **Dialog window** (tuỳ chọn)                                          | Confirm nổi bật cho tác vụ cam                                                      | Cửa sổ tách rời, không phải overlay trong trang                                                        |

- **Gắn panel với tab:** side panel theo dõi `tabId` của tab BM đang active (`tabs.onActivated`/`onUpdated`); nhiều tab BM → panel hiển thị tab đang bám và cho chọn lại. Chỉ khi tab ở surface hỗ trợ mới bật nút chạy flow; login/checkpoint/2FA → panel hiện "ngoài vùng hỗ trợ" và khóa chạy [Suy luận — cần test: Chrome `sidePanel` bật theo-tab hay toàn cục, và `sidebar_action` Firefox theo-window].
- Toàn bộ state chạy flow và pending-confirm giữ ở **content script**; side panel chỉ là view + nguồn lệnh, nên đóng/mở panel hay SW chết không làm mất flow. Panel mở lại thì re-sync trạng thái run hiện tại từ content script (message `SyncState`).
- Panel React vẫn dùng DaisyUI, root `id='my-ext'` + `data-theme` (CLAUDE.md), boot qua `createShadowRoot` như popup/options để dùng chung hạ tầng CSS.

### 5.2. Action engine — step-machine

`FlowDef = { id, version, surface, risk: 'read'|'write'|'sensitive', buildInputs(userArgs) → Step[], buildDiff(userArgs) → DryRunDiff }`, mỗi `Step = { name, do(ctx), verify(ctx)?, timeoutMs, onFail: 'abort'|'retryOnce'|'askUser' }`. Chu trình chuẩn của một flow: **điều hướng surface → định vị (locate) → thao tác (act) → verify đọc lại từ DOM**. Verify là step bắt buộc của mọi step ghi: sau "bấm Assign", flow chờ dialog đóng + đọc lại dòng partner trong bảng; toast/optimistic render không được tính là bằng chứng [Suy luận — cần test: hành vi optimistic UI của Comet trên từng surface].

Engine có: kill-switch toàn cục (dừng mọi queue + abort step đang chờ), `runId` tương quan mọi event, chế độ **dry-run** (chạy navigate+locate+đọc diff, bỏ act) và pacing trung tâm (delay+jitter cấu hình trong options, mặc định theo `file 15 §4.B`).

### 5.3. Primitives

| Primitive                      | Cách làm (theo `file 09 §3.1`)                                                                                                                       | Ghi chú                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `click(target)`                | Chuỗi `pointerdown → mousedown → pointerup → mouseup → click` (`PointerEvent`, bubbles)                                                              | Vượt guard của menu/checkbox Comet; `el.click()` chỉ fallback                          |
| `type(target, text)`           | Native setter qua `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` + dispatch `input`/`change`; gõ từng ký tự kèm delay nhỏ | Controlled input của React; delay mô phỏng người gõ [Suy luận — cần test ngưỡng delay] |
| `select(target, optionText)`   | click mở dropdown → `waitFor` option theo `role='option'`/text → click                                                                               | Chuẩn cho combobox của BM; không set value trực tiếp                                   |
| `waitFor(target, timeout)`     | `MutationObserver` trên `document.body` + poll chốt lần cuối; trả element hoặc timeout-error                                                         | Mặc định timeout theo step; không poll vô hạn                                          |
| `waitGone(target, timeout)`    | Như trên, điều kiện ngược                                                                                                                            | Cho dialog đóng/skeleton biến mất                                                      |
| `assertText(target, expected)` | Đọc `textContent`/value, chuẩn hóa khoảng trắng, so khớp (kèm bản dịch EN/VI từ registry)                                                            | Nền của verify-readback                                                                |
| `readText(target)`             | Trích text/value phục vụ dry-run diff & audit snapshot                                                                                               | Read-only                                                                              |
| `scrollIntoView(target)`       | `el.scrollIntoView({block:'center'})` + chờ ổn định khung hình                                                                                       | Cần trước click ở vùng lazy-render                                                     |

`target` luôn là **key trong SelectorRegistry**, không hardcode selector rời rạc trong flow.

### 5.4. SelectorRegistry

- Thứ tự ưu tiên selector: `role`+`aria-label` → text node ổn định → `href`/route → XPath tương đối — cấm class auto-gen (`file 09 §3.1`) [Kiểm chứng]. BM hiếm `data-testid` production → không dựa vào [Kiểm chứng — file 09].
- Mỗi key có 2 bộ nhãn **EN + vi_VN** (user BM hay dùng tiếng Việt — nhãn quyền lấy nguyên văn Help Center theo `file 14 §2`); runtime chọn theo `document.documentElement.lang`/locale đo được [Suy luận — cần test cách detect locale ổn định trên Comet].
- Versioned: registry kèm `surfaceVersion` + ngày probe; devtest health-check (§5.8) cho biết khi nào Meta deploy làm selector chết (cadence rot thực tế = [Suy luận — cần test], giả định ban đầu "vài tuần–deploy" tương tự doc_id `file 14 §3.2.4`).

### 5.5. Background broker (orchestration)

- `src/shared/messaging.ts`: union `BrokerMessage = FlowRunRequest | FlowProgress | FlowResult | ConfirmRequest | ConfirmResponse | ProbeRequest | ProbeResponse | AuditQuery | NavigateToSurface | SyncState | SurfaceChanged | KillSwitch`, mọi message có `schemaVersion` + `requestId`; `validateMessage()` là type-guard viết tay kiểm `kind` + shape tối thiểu — đây là **tái dùng pattern** mà devtest EAAG định dùng (typed union + validate ở biên), dù code đó chưa từng tồn tại trong repo (§2).
- Broker stateless: route theo `sender.tab.id`; chặn flow vùng đỏ tại đây (defense-in-depth ngoài UI); round-trip confirm: content script phát `ConfirmRequest` → side panel (hoặc dialog window) hiển thị → user trả lời → `ConfirmResponse` về content script, broker chỉ log quyết định; content script **chỉ chấp nhận** message từ chính extension (`sender.id === browser.runtime.id`), và validate `requestId`/`runId` khớp pending-confirm để confirm cũ/giả không kích hoạt step ghi [Suy luận — cần extension-security-reviewer rà]; pending-confirm giữ ở **content script** nên SW chết giữa chừng không mất flow (SW ~30s idle — `file 09 §3.6` [Kiểm chứng qua Chrome docs]; Firefox dùng event page — `vite.config.ts` [Kiểm chứng]).
- Broker cũng là nơi policy rate/ngày (đếm write trong ngày từ audit log, so với limit trong settings) — đặt ở background để không bị vô hiệu bởi refresh tab.

### 5.6. Cổng xác nhận HITL — ma trận tầng

| Tầng                     | Ví dụ tác vụ                                                                                                          | Hành vi engine                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read (xanh)              | Kiểm kê BM/TKQC/partner hiện có (đọc list từ UI)                                                                      | Chạy tự do, pacing nhẹ                                                                                                                                    |
| Write thường (vàng nhạt) | Đổi tên BM/TKQC                                                                                                       | Dry-run diff → confirm 1 lớp trong panel                                                                                                                  |
| Nhạy cảm (cam)           | Chỉ định partner (`MANAGE`), share pixel, xóa partner                                                                 | Dry-run diff → confirm **2 lớp** (xem diff + gõ xác nhận) tại side panel/dialog window, batch > N (mặc định 10, theo `file 15 §4.B` #7) xác nhận từng mẻo |
| Đỏ                       | Payment, appeal/request review, business verification, claim/transfer ownership, mọi thao tác khi tab đang checkpoint | **Từ chối**; mở deep-link + checklist làm tay (`file 11 §4.3`, `file 15 §5`)                                                                              |

### 5.7. Audit log append-only

Broker ghi qua `src/background/auditLog.ts`: record `{ ts, runId, flowId@version, stepIndex, targetKey, action, result, verifyExcerpt (hash/text rút gọn), error? }` vào `storage.local` dạng chunk `audit:<yyyy-mm>:<n>` (append-only, không sửa record cũ — kế thừa `file 15 §4.C` #12). Không ghi giá trị nhạy cảm (email đối tác, id BM chỉ lưu khi user bật "log chi tiết" trong options — mặc định hash). Options page xem/lọc + export CSV/JSONL. Quota: `storage.local` mặc định ~5MB → dự phòng khai `unlimitedStorage` chỉ khi audit vượt trần [Suy luận — cần test dung lượng thực tế/khảo sát quota Firefox].

### 5.8. Devtest mới = DOM probe/diagnostics; phán quyết devtest EAAG

- **Devtest EAAG (trích token, `devtestApi.ts`, messaging EAAG): loại bỏ sạch — chi phí 0** vì chưa từng được implement trong `src/` (§2) [Kiểm chứng]. Khuyến nghị (không làm trong file này): đánh dấu `file 16` là superseded khi cập nhật MOC ở lượt khác.
- **Devtest mới** (build dev / sau flag `devtest:enabled`): (i) **surface detector** — nhận diện màn/dialog BM hiện tại từ URL + marker DOM; (ii) **selector health-check** — chạy toàn bộ SelectorRegistry lên DOM sống, báo hit-rate từng key, lưu kết quả kèm `server_revision` đọc từ bootstrap của trang nếu lấy được (dấu hiệu deploy, `file 14 §3.2.4`); (iii) **TraceRecorder** — ghi lại chuỗi locate/act khi user thao tác tay một lần, xuất draft `FlowDef` (bản DOM của "learn-then-replay", `file 09 §4` ưu tiên 3 / `file 14 §3.2.3`); (iv) diagnostics LogPanel trong-panel hiển thị event engine thời gian thực.
- MAIN-world probe (ví dụ kiểm tra sự tồn tại của `window.require`, đọc `server_revision`) chỉ dùng cho diagnostics opt-in, qua `browser.scripting.executeScript({world:'MAIN'})` — Chrome ≥111 [Kiểm chứng — file 09 §3.1]; Firefox yêu cầu bản hỗ trợ `ExecutionWorld MAIN` [Suy luận — cần test version sàn; MDN xác nhận API tồn tại]. Không dùng MAIN world để hỗ trợ thao tác chính của engine (engine thuần isolated world + DOM).

### 5.9. Storage schema mới

| Key / vùng                      | Nội dung                                                                                                | Ghi chú                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `storage.local` `schemaVersion` | Số version schema; migrate khi bump                                                                     | Bắt buộc đọc đầu tiên khi boot                                                          |
| `storage.local` `settings`      | pacing (delay nền, jitter), limit/ngày theo loại BM, locale override, cờ `devtest:enabled`, `logDetail` | Sửa từ Options                                                                          |
| `storage.local` `selectorPacks` | Bản cache SelectorRegistry + kết quả health-check gần nhất + `server_revision`                          | Phục vụ chẩn đoán rot                                                                   |
| `storage.local` `audit:*`       | Chunk append-only (§5.7)                                                                                | Export CSV/JSONL ở Options                                                              |
| `storage.session` (tuỳ chọn)    | trạng thái resume phiên chạy (nếu cần cross-tab)                                                        | RAM-only, mất khi đóng trình duyệt; hỗ trợ Firefox cần kiểm chứng [Suy luận — cần test] |
| Không tồn tại                   | ~~token EAAG, extractTime, cookie~~                                                                     | Lớp token bị xóa khỏi thiết kế                                                          |

---

## 6. Thay đổi manifest cho production & khác biệt Chrome/Firefox

| Khoá                               | Hiện tại (starter)   | Đề xuất prod                                                                             | Lý do                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissions`                      | `activeTab, storage` | `storage, scripting, tabs`?, + `sidePanel` (chỉ Chrome)                                  | `scripting` cho MAIN-world diagnostics opt-in; `sidePanel` cho UI chính; bỏ `activeTab`. `tabs` chỉ thêm nếu cần đọc `tab.url` để bám tab BM — với `host_permissions` BM thì URL tab BM đã đọc được, nên **ưu tiên không xin `tabs`** [Suy luận — cần test]. Tối thiểu quyền (`file 09 §3.6`, CLAUDE.md) |
| `side_panel` / `sidebar_action`    | —                    | Chrome: `side_panel.default_path` + `sidePanel`; Firefox: `sidebar_action.default_panel` | API khác nhau → merge theo browser trong `vite.config.ts` cùng chỗ đã split background/options; version sàn Chrome (`sidePanel`) và hành vi theo-tab/theo-window [Suy luận — cần test/kiểm chứng docs]                                                                                                   |
| `host_permissions`                 | —                    | `https://business.facebook.com/*`                                                        | Inject diagnostics + điều hướng tab đúng origin                                                                                                                                                                                                                                                          |
| `content_scripts.matches`          | `<all_urls>`         | `https://business.facebook.com/*` (run `document_idle`)                                  | Cốt lõi pivot; stage 2 cân nhắc thêm `adsmanager.facebook.com` [Suy luận — cần test phạm vi BM suite]                                                                                                                                                                                                    |
| `web_accessible_resources.matches` | `<all_urls>`         | `https://business.facebook.com/*`                                                        | Sửa lỗi bị soi khi CWS review (`file 09 §3.4`)                                                                                                                                                                                                                                                           |
| `optional_permissions`             | —                    | (dự phòng) `graph.facebook.com`                                                          | Chỉ khi sau này thêm module official-API đọc phụ trợ; hiện **bỏ hẳn** theo pivot                                                                                                                                                                                                                         |

Chrome/Firefox: `vite.config.ts` đã split (service worker module vs `background.scripts` event page; `options_page` vs `options_ui`) [Kiểm chứng]. Điểm cần kiểm chứng thêm khi implement: SW Chrome chết ~30s idle → broker stateless (`file 09 §3.6`) [Kiểm chứng]; Firefox `world:'MAIN'` + `storage.session` ở version sàn bao nhiêu [Suy luận — cần test]; HMR content script với crxjs trên Firefox watch build (hiện đang dùng ổn theo README/CLAUDE.md) [Kiểm chứng — trạng thái repo].

---

## 7. Chiến lược kiểm thử trên BM thật

Tái dùng staging của `file 16 §1`: nick phụ bật 2FA, BM-A có TKQC test không chạy ads, BM-B đối tác tin cậy, Chrome profile sạch + IP nhà quen dùng, không VPN đổi vùng. Manual QA script (không có test runner — CLAUDE.md) theo pha:

0. **P-1 Side panel plumbing**: mở/đóng side panel giữa lúc flow chạy → flow không mất, panel re-sync đúng; đổi tab/đa tab BM → panel bám đúng `tabId`; reload tab BM → content script re-boot, không tự resume (`file 19 §7`); kiểm cả Chrome (`sidePanel`) và Firefox (`sidebar_action`).
1. **P0 Probe**: devtest surface detector + selector health-check trên cả 2 locale EN/vi_VN, cả Chrome lẫn Firefox; lưu `server_revision`.
2. **P1 Read flow**: kiểm kê BM/TKQC/partner qua UI — so khớp với nhìn tay.
3. **P2 Assist flow**: flow chỉ định partner nhưng **dừng trước nút Assign cuối** — user tự bấm (khớp "assist, không full-auto" `file 09 §4` #4).
4. **P3 Write đảo ngược được**: đổi tên TKQC → verify-readback → đổi lại tên cũ.
5. **P4 Write nhạy cảm đơn lẻ**: chỉ định BM-B quyền thấp nhất (`ADVERTISE,ANALYZE`) → verify 3 chiều + undo = xóa partner, theo đúng bước `file 16 §5–7` nhưng thực hiện qua DOM.
6. **P5 Batch nhỏ + pacing**: 3–5 mục, delay/jitter mặc định; diễn tập kill-switch giữa chừng và diễn tập "tab BM bị logout/checkpoint giữa run" → flow phải fail-soft [Suy luận — cần test, mô phỏng bằng cách logout tay].
7. **Regression theo deploy**: mỗi tuần hoặc khi `server_revision` đổi → chạy lại P0; selector chết → vá registry, bump `version` của pack.

---

## 8. Lộ trình migrate từ code hiện tại

| Giữ lại / tái dùng                                                                                                 | Loại bỏ / không làm                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createShadowRoot` + config postcss `#my-ext` (cho popup/options/side panel; không còn mount trong content script) | Component demo `Content.tsx`; mọi mount UI trong content script (`index.dev.tsx`/`index.prod.tsx` chỉ còn boot engine)                               |
| `src/content/panel/*` → **dời** sang `src/sidepanel/` (đổi lớp truyền dữ liệu sang message)                        | Mount `CopilotPanel` vào DOM trang BM                                                                                                                |
| `vite.config.ts` split manifest Chrome/Firefox; alias, stack React/Tailwind/DaisyUI/polyfill                       | `<all_urls>` ở cả content script lẫn `web_accessible_resources`                                                                                      |
| Pattern messaging typed union + validate (thiết kế devtest cũ) → `src/shared/messaging.ts`                         | Toàn bộ kế hoạch devtest EAAG (chưa implement → chi phí bỏ = 0); route trích token bootloader/business_locations; schema lưu token `storage.session` |
| Ý tưởng LogPanel devtest → diagnostics panel mới                                                                   | `host_permissions graph.facebook.com` (không cần vì không gọi API; chỉ dự phòng optional)                                                            |
| Guardrails & pacing `file 15 §4`; vùng đỏ `file 11 §4.3`; mapping quyền `file 14 §2` (làm flow config)             | Bảng mã lỗi Graph 190/8xx của hướng token (thay bằng xử lý lỗi UI-readback)                                                                          |

Pha triển khai đề xuất: **M0** siết manifest + boot side panel rỗng + content script headless trên BM (ship nền); **M1** primitives + stepMachine + devtest probe + 1 read flow; **M2** broker + audit + HITL + 1 write flow dễ đảo ngược (rename); **M3** flow flagship chỉ định partner có dry-run/confirm 2 lớp/batch nhỏ; **M4** share pixel + pacing tinh chỉnh từ audit thực địa.

---

## 9. Rủi ro & câu hỏi mở nổi bật

- **[Suy luận — cần test]** Cadence selector rot thực tế của Business Settings (giả định tuần–hai tuần theo deploy, chờ số liệu từ health-check P0/P7).
- **[Suy luận — cần test]** Ngưỡng pacing hình vi người thật đủ an toàn cho DOM automation (tín hiệu tốc độ/hành vi ở `file 15 §3.1` áp dụng đầy đủ; mức số/ngày phải đo trên BM staging).
- **[Suy luận — cần test]** Độ ổn định của label-text selectors dưới A/B test của Meta (Comet thử nghiệm nhãn liên tục) → registry cần alias nhiều nhãn/khóa.
- **[Suy luận — cần test]** Firefox: version sàn cho `scripting` `world:'MAIN'`, `storage.session`, hành vi event page khi tab BM treo lâu.
- **[Suy luận — cần test]** Phát hiện UI checkpoint/login-wall từ DOM để auto dừng flow (cần probe trên tài khoản bị checkpoint giả lập).
- **[Suy luận — cần test]** Side panel: `sidePanel` Chrome bật theo-tab hay toàn cục, version sàn; `sidebar_action` Firefox theo-window; độ ổn định `tabs.connect` Port khi tab BM điều hướng SPA/reload hoặc side panel đóng-mở; UX khi nhiều tab BM mở song song.
- **[Suy luận — cần test]** Giả định "UI ngoài trang giảm rủi ro bị Meta phát hiện": chưa có bằng chứng Meta quét DOM extension; lợi ích chắc chắn chỉ là cô lập UI/confirm khỏi page JS. Lưu ý engine vẫn mutate DOM BM nên **không** làm giảm rủi ro behavioral detection (`file 15 §3.1`, `file 19`).
- Rủi ro CWS review với `scripting` + host `business.facebook.com` dự kiến thấp hơn nhiều so với combo `<all_urls>` + token harvesting (`file 09 §3.6`, `file 11 §3.4`) [Kiểm chứng — khung policy], nhưng quyết định cuối thuộc reviewer.

---

## 10. Nguồn tham khảo

**Trạng thái repo (đã probe trực tiếp ngày 12/10/2026 — first-party của dự án):**

1. `src/manifest.ts`, `src/background/index.ts`, `src/utils/createShadowRoot.tsx`, `src/content/Content.tsx` — mã nguồn hiện tại (starter gần nguyên bản; không tồn tại `devtestApi.ts`/`src/devtest/`).
2. `postcss.config.js` (`#my-ext` prefix + transform `:host`), `vite.config.ts` (merge manifest Chrome/Firefox), `package.json` (không zod/test runner), `CLAUDE.md` (quy tắc Shadow DOM, `#my-ext`, `browser.*`).

**Research nội bộ (first-party của dự án):** 3. `file 16 §10` (bảng quyết định FAIL-WRITE → chuyển hướng) + kết quả thực địa FAIL-WRITE do chủ dự án xác nhận 12/10/2026. 4. `file 09 §3.1/§3.4/§3.6/§4` (kỹ thuật DOM/Comet, giới hạn MV3, khuyến nghị copilot + assist); `file 14 §2/§3.2` (mapping quyền EN/VI, BizKit/learn-then-replay, server_revision); `file 15 §3–5` (tín hiệu rủi ro, pacing 3–8s+jitter, audit append-only, vùng đỏ); `file 11 §3.4/§4.3` (CWS policy, vạch đỏ).

**Tài liệu bên ngoài:** 5. MDN — `scripting.ExecutionWorld` (fetch trực tiếp 12/10/2026 — first-party; xác nhận giá trị ISOLATED/MAIN + cảnh báo trang có thể phát hiện code MAIN; bảng tương thích version cần JS → **chưa đọc được, version sàn Firefox đánh [Suy luận — cần test]**): https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/ExecutionWorld 6. Chrome for Developers — extension service workers & content scripts (**thứ cấp**, trích qua `file 09 §5`, chưa re-fetch lượt này): https://developer.chrome.com/docs/extensions/develop/concepts/service-workers 7. Chrome `sidePanel` API và MDN `sidebar_action` — **chưa fetch lượt này**; mọi chi tiết version sàn/hành vi theo-tab ở §5.1, §6 đánh [Suy luận — cần test] cho đến khi đọc docs chính thức.

> **Tính toàn vẹn:** mọi khẳng định về trạng thái code đều đã probe trực tiếp trên repo (đánh [Kiểm chứng]); mọi con số vận hành (delay, limit/ngày) là khung khởi đầu từ `file 15` — heuristic cộng đồng, phải đo lại bằng audit log trên BM staging trước khi chốt constants.
