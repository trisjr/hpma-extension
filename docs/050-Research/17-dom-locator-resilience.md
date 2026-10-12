# 17 — Kỹ thuật định vị & thao tác phần tử bền vững trên Facebook Business Manager (Comet SPA)

> Phạm vi: tầng nền của hướng DOM automation sau pivot — cách chọn locator KHÔNG vỡ theo từng deploy của Meta trên `business.facebook.com` (Comet SPA): thứ tự ưu tiên aria/role → text → structure → fiber; vấn đề UI đa ngôn ngữ (EN/VI) và bảng nhãn song ngữ; kỹ thuật thao tác bền (controlled input, click, dialog/popper); theo dõi SPA navigation; MAIN world vs isolated world dưới MV3/Firefox; kiến trúc fallback đa tầng, phát hiện stale element và self-healing. Kèm code sketch TypeScript cho các primitive.
> Không lặp lại: kiến trúc extension tổng quan, intercept GraphQL, lấy token, rào cản MV3 chung (xem `09-extension-techniques.md` — file này chỉ đào sâu lớp locator/interaction mà file 09 §3.1 chỉ liệt kê); guardrail vận hành, pacing, giới hạn ngày, fail-soft theo tác vụ (xem `15-browser-session-ops-practice.md` §4); mapping nhãn quyền UI ↔ `permitted_tasks` (xem `14-partner-assign-mapping-graphql.md` §2 — bảng nhãn song ngữ ở đây là phụ lục kỹ thuật cho locator, không phải mapping quyền).
> Thời điểm nghiên cứu: **2026-10-12**. Mọi quan sát trực tiếp về DOM của Comet đều gắn [Suy luận — cần probe] vì môi trường nghiên cứu bị Meta chặn crawl (HTTP 403 cả khi qua mirror r.jina.ai); các khẳng định về trình duyệt/extension API được kiểm chứng bằng tài liệu first-party đã fetch trong phiên này.

---

## 1. Tổng quan — pivot DOM automation và bài toán "selector rot"

Sau khi hướng EAAG → Graph API vỡ ở các edge ghi nhạy cảm (lỗi 10/200 — token first-party thiếu scope), dự án chuyển trục ghi sang **DOM automation**: thao tác trực tiếp UI của BM trong phiên đăng nhập của user (UI luôn mang đủ quyền của actor, không phụ thuộc scope token). Cái giá phải trả: **toàn bộ rủi ro kỹ thuật dồn vào độ bền của locator** — Meta deploy liên tục (hàng tuần, kèm A/B test theo nhóm user), mỗi deploy có thể xáo trộn markup mà không đổi hành vi nhìn thấy. File 09 §3.8 đã đánh giá DOM automation "Ổn định trung bình → thấp, chi phí bảo trì cao"; file này biến nhận định đó thành kỹ thuật cụ thể để hạ chi phí bảo trì: **locator phải bám vào thứ ít đổi nhất — ngữ nghĩa accessible (role/tên), không bám vào thứ hay đổi nhất (class hash, cấu trúc div)** [Kiểm chứng — nguyên tắc chung của Playwright (docs first-party) + đặc tính StyleX/Comet (§2)].

Ba trụ cột của file: (A) chiến lược chọn locator (§2–§4), (B) primitive thao tác & đồng bộ với SPA (§5–§6), (C) kiến trúc chịu lỗi: fallback đa tầng + self-healing (§7–§9).

## 2. Đặc tính DOM của Comet quyết định chiến lược locator

| Đặc tính                                                                                                                                                                                 | Bằng chứng                                                                                                                    | Hệ quả cho locator                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Class là atomic hash của StyleX** (`x1i10hfl`, `xjbqb8w`…) — StyleX là hệ CSS-in-JS do Meta phát triển và open-source, class ánh xạ tới rule CSS cụ thể chứ không ánh xạ tới component | [Kiểm chứng — repo first-party `facebook/stylex`; định dạng hash class quan sát rộng rãi trong cộng đồng scraper (thứ cấp)]   | **Cấm dùng class selector làm điểm tựa chính** (đổi theo deploy/A-B test — file 09 §3.1). Class-x-prefix chỉ phù hợp làm "mùi" debug, không làm contract |
| **SPA React + Relay**: mọi "điều hướng" là render lại trong trang, không reload                                                                                                          | [Kiểm chứng — file 09 §1/§3.1]                                                                                                | Bắt buộc primitive `waitFor` + theo dõi URL thay vì giả định sự kiện `load` (§6)                                                                         |
| **Re-render thay node**: React unmount/remount subtree khi state đổi → element vừa query xong có thể thành "mồ côi"                                                                      | [Kiểm chứng — ngữ nghĩa chung của React]                                                                                      | Không cache `Element` giữa các bước; resolve lại locator ngay trước mỗi action (§9); kiểm stale bằng `el.isConnected`                                    |
| **Comet đầu tư a11y**: control tương tác thường mang `role`/`aria-label` chuẩn (nút không-text là icon → bắt buộc aria-label)                                                            | [Suy luận — cần probe; căn cứ: Meta public về a11y + Playwright khuyến nghị role-locator hoạt động tốt trên các SPA a11y-tốt] | Đây là _điểm tựa bền nhất_: `role` + accessible name (§3)                                                                                                |
| **Overlay là React portal**: dialog/menu/popper render tách khỏi nhánh DOM của nút mở, gắn cuối `body`                                                                                   | [Suy luận — cần probe trên Comet; pattern portal là mặc định của các design system React lớn]                                 | Không tìm menu "con của nút đã bấm" — tìm trong scope toàn `document` sau khi `waitFor` overlay (§5.3)                                                   |
| **Không có `data-testid` ở production**                                                                                                                                                  | [Kiểm chứng — file 09 §3.1]                                                                                                   | Không xây chiến lược quanh testid; BM không có "testing contract" nào cho ta                                                                             |

**Kết luận §2:** bề mặt duy nhất Meta giữ ổn định (vì cần cho screen reader + người dùng thật) là **cây accessibility: role, tên truy cập, nhãn text hiển thị** — locator phải neo vào đó.

## 3. Thứ tự ưu tiên locator và CSS vs XPath

### 3.1. Chuỗi ưu tiên (áp dụng cho locator gốc ở §9)

| Tầng                       | Kỹ thuật                                                                                                                            | Ví dụ trên BM                                               | Độ bền       | Ghi chú                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1 — **role + tên**         | query `[role="button"]`/`[role="link"]`/`[role="menuitem"]` rồi lọc theo accessible name (aria-label → aria-labelledby → text ruột) | nút "Add"/"Thêm", menu item "Partners"                      | **Cao nhất** | Bám chuẩn W3C ARIA/accname — thứ Meta phải giữ cho a11y [Kiểm chứng — Playwright docs: role+name là khuyến nghị số 1] |
| 2 — **thuộc tính ổn định** | `[name]`, `[type]`, `[placeholder]`, `[href*="/settings"]`                                                                          | input tìm kiếm theo `placeholder`, link theo fragment route | Cao–TB       | `href` route của BM bền tương đối; placeholder đổi theo locale (§4)                                                   |
| 3 — **text hiển thị**      | textContent chuẩn hóa, match cả 2 locale                                                                                            | heading trang, tab "Đối tác"                                | Trung bình   | Đổi theo ngôn ngữ + copy-edit; chỉ dùng kèm bảng song ngữ (§4)                                                        |
| 4 — **cấu trúc**           | CSS descendant `:has()`, `:nth-of-type`, hoặc XPath parent-axis                                                                     | "ô chứa nút Add trong panel Partners"                       | TB–Thấp      | Không dùng class; neo từ phần tử tầng 1–3 đã tìm được, không từ `body`                                                |
| 5 — **fiber hint**         | đọc props qua `__reactFiber$*`/`__reactProps$*`                                                                                     | lấy `business_id` từ props của row                          | Thấp nhất    | CHỈ làm hint/đối chiếu, bắt buộc MAIN world, có thể chết hoàn toàn (§8)                                               |

Nguyên tắc xuyên suốt: **locator càng "gần cách user nhìn trang" càng bền** — trùng khuyến nghị first-party của Playwright ("prioritize user-facing attributes"), và cũng là lý do locator tầng 4 viết dạng `<anchor tầng 1–3> → quan hệ cấu trúc ngắn` thay vì XPath tuyệt đối từ root (absolute XPath/CSS chuỗi dài được Playwright liệt vào anti-pattern [Kiểm chứng — Playwright docs §Locating elements]).

### 3.2. CSS như thế nào, XPath khi nào

| Tình huống                                                           | Chọn                              | Lý do                                                                                                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neo theo `[role]`, `[aria-label]`, `[placeholder]`, attribute bất kỳ | **CSS**                           | Native `querySelectorAll`, nhanh, đủ dùng cho ~90% nhu cầu tầng 1–3                                                                                                                    |
| Cần "container CHỨA phần tử X"                                       | **CSS `:has()`**                  | `:has()` đã có Chrome ≥105, Firefox ≥121, Safari ≥15.4 [Kiểm chứng — caniuse data, probe 12/10/2026] → thay thế hầu hết XPath cấu trúc                                                 |
| Cần đi NGƯỢC lên cha/ancestor từ node text                           | **XPath** (`ancestor::`, `..`)    | CSS không có parent-axis (ngoại trừ `:has()` ngược từ cha — ưu tiên viết lại bằng `:has()` trước)                                                                                      |
| Match text không phân biệt hoa/thường, bỏ diacritic                  | **không cái nào** — làm ở tầng JS | Chuẩn hóa trong resolver (§4.2, §9) linh hoạt hơn `translate()` của XPath 1.0; XPath trong trình duyệt hiện đại vẫn là 1.0 [Suy luận — cần kiểm chứng lịch sử XPath 2.0 trên browsers] |

## 4. Vấn đề đa ngôn ngữ: UI tiếng Anh vs tiếng Việt

### 4.1. Bản chất

Accessible name và text hiển thị **đều bị localize theo locale tài khoản FB của user**, không theo ngôn ngữ trình duyệt → cùng một flow, hai user có DOM "chữ" khác nhau hoàn toàn; `aria-label` của nút icon ("Add"/"Thêm") cũng localize. Locator text thuần EN sẽ vỡ ngay trên user Việt [Kiểm chứng — bản chất locale UI Facebook; nhãn quyền VI đã đối chiếu Help Center bản `vi_VN` ở file 14 §2]. Hệ quả: **mọi locator theo tên phải nhận MẢNG biến thể nhãn** `{en, vi}` và so khớp cả hai [Suy luận — thiết kế đề xuất].

### 4.2. Detect locale của UI + chiến lược locale-agnostic

- Đọc `document.documentElement.lang` (`vi`, `en`…) — FB set thuộc tính `lang` trên `<html>` theo locale phiên [Suy luận — cần probe trên BM thật]. **Không** dùng `navigator.languages` (đó là ngôn ngữ trình duyệt, không phải locale tài khoản) [Kiểm chứng — khác biệt khái niệm].
- Thiết kế **không cần biết locale vẫn đúng** (locale-agnostic): resolver nhận danh sách nhãn đa ngôn ngữ cho mỗi target, so khớp tất cả; locale detection chỉ dùng để (i) sắp xếp thứ tự thử (locale thật lên đầu — nhanh hơn) và (ii) hiển thị prompt trong cùng ngôn ngữ UI.
- Chuẩn hóa trước khi so: `normalize('NFC')` + trim + collapse whitespace (quy ước giống text-matching của Playwright [Kiểm chứng — Playwright docs]), so không phân biệt hoa thường; với tiếng Việt, KHÔNG bỏ dấu nếu nhãn có dấu đầy đủ (FB render Unicode đầy đủ) — bỏ dấu chỉ là fallback cuối [Suy luận — cần test biên Unicode].
- Cung cấp override thủ công trong options ("UI BM của tôi đang: English/Tiếng Việt") làm đường cứu sinh khi detect sai.

### 4.3. Bảng nhãn song ngữ tối thiểu (khởi đầu, bám flow chỉ định đối tác — file 14 §1)

| Target                    | EN                                     | VI                        | Độ tin cậy nhãn                                                             |
| ------------------------- | -------------------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| Cài đặt BM                | Business settings                      | Cài đặt doanh nghiệp      | [Suy luận — cần probe]                                                      |
| Mục người dùng            | Users                                  | Người dùng                | [Kiểm chứng — file 14 §1, Help Center VI]                                   |
| Mục đối tác               | Partners                               | Đối tác                   | [Kiểm chứng — file 14 §1]                                                   |
| Menu tài khoản QC         | Ad accounts                            | Tài khoản quảng cáo       | [Kiểm chứng — file 14 §2.1]                                                 |
| Nút thêm                  | Add                                    | Thêm                      | [Suy luận — cần probe]                                                      |
| Hành động mở flow partner | "Give a partner access to your assets" | (câu dài, biến thể nhiều) | [Suy luận — ưu tiên neo bằng role+aria, text chỉ fallback]                  |
| Nút gán tài sản           | Assign assets                          | Chỉ định tài sản          | [Suy luận — cần probe]                                                      |
| Full control              | Full control                           | Toàn quyền kiểm soát      | [Kiểm chứng — file 14 §1]                                                   |
| Partial access            | Partial access                         | Quyền truy cập một phần   | [Kiểm chứng — file 14 §1]                                                   |
| Điều phối wizard          | Next / Done                            | Tiếp / Xong               | [Suy luận — cần probe]                                                      |
| Nút form                  | Save / Cancel / Confirm                | Lưu / Hủy / Xác nhận      | [Suy luận — cần probe]                                                      |
| Placeholder tìm kiếm      | "Search…" theo ngữ cảnh                | "Tìm kiếm…"               | [Suy luận — placeholder là attribute nên dùng tầng 2, ít rủi hơn text ruột] |

Vận hành bảng nhãn như **dữ liệu có phiên bản** (một module `labels.ts` riêng trong repo), tách khỏi code flow: khi Meta sửa copy → sửa data, không sửa logic. Bản đầy đủ cho từng tài sản cụ thể (Page/Pixel/Catalog) gom ở file 14 §2 — không nhân bản ở đây.

## 5. Primitive thao tác bền (sketch)

### 5.1. Set value cho React controlled input

`el.value = x` không chạm state React (file 09 §3.1). Pattern native-setter vẫn là chuẩn; bổ sung `change` và keyboard events cho trường có validation/formatting [Kiểm chứng — file 09 §3.1 + thực hành rộng rãi (thứ cấp)]:

```ts
function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: value,
    })
  );
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```

- Với ô **contenteditable** (một số composer/search của Comet): path input.value không áp dụng — cần focus rồi `document.execCommand('insertText', …)` (deprecated nhưng kích hoạt đúng pipeline input của React) hoặc dispatch `beforeinput`/InputEvent thủ công [Suy luận — cần test theo từng trường cụ thể trên BM].
- Sau khi set, **đọc lại state quan sát được** (`el.value` / nội dung render / dropdown gợi ý xuất hiện) thay vì giả định thành công — Comet có ô search chỉ "ghi nhận" giá trị khi xử lý xong debounce [Suy luận — cần probe].

### 5.2. Click mô phỏng người dùng

`el.click()` là event **untrusted** (`isTrusted === false` [Kiểm chứng — đặc tả DOM]); nghi ngờ tồn tại heuristic chống automation ở một số control nhạy cảm của Meta [Suy luận — cần test, chưa có bằng chứng công khai]. Chuỗi dispatch đầy đủ hơn cho checkbox/menu/popper:

```ts
async function realisticClick(el: Element) {
  el.scrollIntoView({ block: 'center' });
  const opts: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    buttons: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
  for (const type of [
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
  ])
    el.dispatchEvent(
      type.startsWith('pointer')
        ? new PointerEvent(type, opts)
        : new MouseEvent(type, opts)
    );
}
```

Thang leo khi untrusted bị từ chối: (1) chuỗi trên → (2) kèm `focus()`/`blur()` đúng thứ tự, delay 30–120ms giữa các pha (jitter, đồng bộ triết lý pacing của file 15 §4.B) → (3) chỉ khi thật sự cần trusted input mới cân nhắc `chrome.debugger` CDP `Input.dispatchMouseEvent` — và phải nhớ cái giá: banner debug + soi kỹ khi review store (file 09 §3.2/§3.6) → **không dùng cho bản phân phối**.

### 5.3. Dialog, menu và popper của Comet

Pattern làm việc với overlay [Suy luận — pattern ARIA APG (W3C) + portal React (§2), cần probe trên Comet]:

1. Mở overlay bằng control có `aria-haspopup` (`menu`/`dialog`/`listbox`); **không giả định overlay là con DOM của control** — portal render ở cuối `body`.
2. `waitFor` container theo role: `[role="dialog"]`, `[role="menu"]`, `[role="listbox"]` (có thể kèm `aria-label` theo ngữ cảnh). Nếu nhiều dialog xếp chồng, lấy cái xuất hiện SAU (mutation mới nhất) và scope mọi locator con vào trong dialog đó (tương đương `locator.within(dialog)` của Playwright [Kiểm chứng — Playwright docs]).
3. Đóng bằng Escape hoặc nút `aria-label` "Close"/"Đóng"; sau đó `waitFor` dialog biến mất (wait-detach, không chỉ wait-appear) trước bước kế tiếp — vì portal unmount async.
4. Focus: Comet quản focus-trap trong dialog; khi automation cần điền vào dialog, focus vào field TRONG dialog, không quay ra ngoài giữa chừng [Suy luận — cần probe].

## 6. Theo dõi SPA navigation và primitive đồng bộ

BM không reload trang → trục đồng bộ là URL + DOM mutation:

- **`pushState`/`replaceState` không bắn `popstate`** (popstate chỉ sảy ra khi user back/forward chủ động); `pushState` cũng **không bao giờ bắn `hashchange`** [Kiểm chứng — MDN History: pushState, fetch 12/10/2026] → muốn biết navigation lập trình phải **hook History API trong MAIN world** (patch ở isolated world page không thấy — lý do ở §7):

```ts
// world: 'MAIN' — dispatch sự kiện tuỳ chỉnh để isolated world lắng nghe
for (const m of ['pushState', 'replaceState'] as const) {
  const orig = history[m];
  history[m] = function (...args) {
    const r = orig.apply(this, args);
    window.dispatchEvent(
      new CustomEvent('hpma:locationchange', { detail: location.href })
    );
    return r;
  };
}
window.addEventListener('popstate', () =>
  window.dispatchEvent(
    new CustomEvent('hpma:locationchange', { detail: location.href })
  )
);
```

- Fallback không cần MAIN world: poll `location.href` mỗi 250–500ms từ isolated world (đơn giản, đủ cho state machine; độ trễ chấp nhận được vì automation pace chậm theo file 15).
- **`waitFor` dựa trên MutationObserver** (throttled) + điều kiện hủy rõ ràng — cùng tư tưởng file 09 §3.1; mỗi step của flow là `waitFor(locatorSpec) → act → waitFor(điều_kiện_thành_công)`:

```ts
function waitFor<T>(
  probe: () => T | null,
  { timeout = 8000, root = document.body }: WaitOpts = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const hit = probe();
    if (hit) return resolve(hit);
    const obs = new MutationObserver(() => {
      const v = probe();
      if (v) {
        obs.disconnect();
        resolve(v);
      }
    });
    obs.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    setTimeout(() => {
      obs.disconnect();
      reject(new Error('waitFor timeout'));
    }, timeout);
  });
}
```

Route guard cho từng flow: so khớp `location.pathname` với pattern màn hình kỳ vọng (`/settings/partners`…) trước khi chạy, và phát hiện **bị đẩy về trang checkpoint/2FA** (URL hoặc heading đặc trưng) để fail-soft ngay theo guardrail file 15 §4.B.11 [Suy luận — pattern route BM cần probe].

## 7. MAIN world vs isolated world (MV3 + Firefox)

| Cần làm                                                                                                              | World bắt buộc                                               | Lý do                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query DOM, dispatch event, click, set value, MutationObserver                                                        | **ISOLATED (mặc định)**                                      | DOM dùng chung giữa hai world; event dispatch từ isolated world hoạt động bình thường [Kiểm chứng — mô hình content script]                               |
| Hook `fetch`/`XHR`, patch `history.pushState`, đọc `window.require`, đọc expando do JS trang ghi (`__reactFiber$*`…) | **MAIN**                                                     | Isolated world có wrapper JS riêng: patch của ta trang không thấy; expando của trang ta không đọc được [Kiểm chứng — semantics isolated world của Chrome] |
| Giao tiếp MAIN ↔ ISOLATED                                                                                           | `window.postMessage` / `CustomEvent` qua `window`/`document` | Kênh chuẩn (file 09 §3.1); CustomEvent `detail` bị structured-clone — chỉ truyền dữ liệu plain                                                            |

Ràng buộc nền tảng [Kiểm chứng — MDN Browser Compat Data, probe raw JSON 12/10/2026]:

- `chrome.scripting` API: Chrome ≥88, **Firefox ≥102**, Safari ≥15.4 (lưu ý `InjectionResult.error` Chrome chưa hỗ trợ — phải tự try/catch trong code inject).
- `world: 'MAIN'` trong `chrome.scripting.executeScript`: **Chrome ≥95; Firefox ≥128; Safari ≥15.4**. Trong `registerContentScripts` (inject sớm `document_start` + persist): Chrome ≥102, Firefox ≥128, Safari ≥16.4. → Yêu cầu thực địa cho hpma-extension: mọi Chrome/Firefox hiện hành năm 2026 đều đủ; **Firefox <128 (ESR cũ) không có MAIN world** — nếu buộc hỗ trợ thì fallback `window.wrappedJSObject` (kỹ thuật Xray riêng của Firefox, era MV2) — khuyến nghị: không hỗ trợ, khai `strict_min_version` Firefox 128.
- Inject dùng `func` được serialize lại (mất closure — mọi tham số truyền qua `args`, JSON-serializable) [Kiểm chứng — Chrome scripting reference]; với Vite/crxjs, đóng gói hẳn một entry bundle cho MAIN-world script rồi inject bằng `files`, tránh serialize function dài.
- Script MAIN inject qua `chrome.scripting` chạy với đặc quyền inject của extension — **không chịu CSP của trang Facebook** (CSP chỉ chặn `<script>` do trang tự chèn) [Kiểm chứng — file 09 §3.6]; vẫn cần `"scripting"` + host permission tối thiểu (file 09 §3.6).

Về phần "111" ở file 09 §3.1: con số được dẫn chiếu nhiều từ blog recap, nhưng dữ liệu compat chính thức của MDN ghi Chrome 95 (executeScript) / 102 (registerContentScripts) — dùng 95/102 làm mốc kỹ thuật [Kiểm chứng — MDN BCD].

## 8. `__reactFiber traverse` — hint cuối cùng, và giới hạn mới

Aura từ source React (đọc trực tiếp `packages/react-dom-bindings/src/client/ReactDOMComponentTree.js` trên branch `main`, probe 12/10/2026) [Kiểm chứng]:

1. Khoá gắn lên DOM node được **random theo mỗi lần tải bundle**: `__reactFiber$<random>`, `__reactProps$<random>` (sinh bằng `Math.random()`) → không hardcode hậu tố; phải **dò khoá động** mỗi phiên (`Object.keys(el).find(k => k.startsWith('__reactFiber$'))`).
2. **Thay đổi kiến trúc lớn:** feature flag `enableInternalInstanceMap` chuyển ánh xạ node→fiber vào **WeakMap bên trong module React**; khi flag bật, khoá `__reactFiber$*` chỉ còn được set `__DEV__` — tức trên production build mới có thể **không tồn tại gì để đọc từ bên ngoài**. Comet dùng React fork riêng của Meta, không biết flag hiện tại [Suy luận — cần probe trên BM thật, và probe phải lặp lại định kỳ vì Meta đổi bundle].
3. Hệ quả thiết kế: fiber path được xây dạng **opportunistic** — `probeFiber(el)` trả `null` cũng là kết quả hợp lệ → flow vẫn chạy bằng tầng 1–4. Use-case chính nếu còn sống: đối chiếu dữ liệu (vd. id tài sản trong props row — file 09 §3.1), xác nhận locator trúng đúng ô, KHÔNG làm source of truth.
4. Nếu fiber chết hoàn toàn, kênh dữ liệu thay thế là **intercept GraphQL của chính phiên** (file 09 §3.2) — DOM locator chỉ lo phần "tay chân", dữ liệu lấy từ network.

## 9. Kiến trúc locator đa tầng fallback, stale-proof và self-healing

### 9.1. Mô hình "locator như truy vấn", không như element

Playwright resolve locator mới trước MỖI action để vô hiệu stale [Kiểm chứng — Playwright docs §Locating elements] → ta chép nguyên lý: flow không giữ `Element` qua các bước; mỗi step gọi `resolve(spec)` lấy element tươi, kiểm `el.isConnected` trước khi act (re-query nếu mồ côi) [Kiểm chứng — DOM spec `Node.isConnected`; áp dụng là thiết kế của ta].

### 9.2. LocatorSpec đa chiến lược

```ts
type LocatorSpec = {
  key: string; // định danh ổn định: 'bs.partners.addButton'
  role?: string; // tầng 1: 'button' | 'menuitem' | 'dialog' | 'link' | 'tab' | 'searchbox'...
  names?: string[]; // mọi biến thể accessible name (en + vi + biến thể lịch sử), exact-match sau chuẩn hoá
  attrs?: Record<string, string>; // tầng 2: { placeholder: '...' } / { name: '...' } / { href: '/partners' }
  texts?: string[]; // tầng 3: text hiển thị (đa ngôn ngữ)
  within?: string; // key của spec cha (scope trong dialog/panel) — tương đương locator.within()
  structure?: { css?: string; xpath?: string }; // tầng 4: neo từ anchor tầng 1–3, không từ body
  fiberHint?: (props: any) => unknown; // tầng 5: opportunistic, world MAIN, cho phép null
};
```

`resolve(spec)` thử lần lượt tầng 1→4 (5 chỉ làm đối chiếu hậu kỳ); **strict-mode**: ≥2 candidate cùng khớp một tầng = lỗi (tương tự Playwright strict — tránh click nhầm [Kiểm chứng — thiết kế theo nguyên tắc Playwright]); match không unique → escalates: bó hẹp `within` rồi thử lại, thay vì lấy `first()` mù quáng [Suy luận — thiết kế đề xuất].

### 9.3. Self-healing an toàn

- **Ghi nhận biến thể thành công:** khi tầng ưu tiên trượt nhưng tầng sau trúng (vd. nhãn mới "Đối tác kinh doanh"), resolver log `{spec.key, winningTier, matchedValue}` vào `chrome.storage.local`; lần chạy sau, biến thể đã-thắng được **đẩy lên thử trước** (adopting variant) — giảm thời gian fallback lặp lại.
- **Telemetry hỏng:** khi TẤT CẢ tầng fail → dừng flow (fail-soft, file 15), chụp signature màn hình (URL + `lang` + role/name của các control đang hiện — KHÔNG chụp dữ liệu cá nhân) hiển thị ở options page kèm nút "báo bản build xấu" → dev cập nhật `labels.ts`/spec rồi phát hành vá nhỏ. Tự-động "đoán" element khác khi hết chiến lược là cấm kỵ với tác vụ ghi [Suy luận — thiết kế; bám guardrail an toàn file 15].
- **Bộ đo sức khoẻ locator:** cron nội bộ (dev/tài sản test) chạy "dry-resolve" toàn bộ registry spec trên các màn hình chính sau mỗi phiên → tỷ lệ spec trượt = cảnh báo sớm deploy của Meta, trước khi user thật chạy flow ghi [Suy luận — thiết kế đề xuất, chưa triển khai].

## 10. Khuyến nghị áp dụng cho hpma-extension

1. Xây một module `@/content/locator` (resolver + waitFor + labels registry) dùng chung cho mọi flow; flow chỉ khai báo `LocatorSpec`, không tự viết `querySelector` lẻ tẻ — để khi Meta xáo UI chỉ vá registry.
2. Mặc định tầng 1 (role+name đa ngôn ngữ); mọi spec bắt buộc có ≥2 tầng trở lên; cấm class-hash selector trong code review (ESLint custom rule là khả thi — [Suy luận]).
3. Tách rõ 2 file inject: `dom-bridge.ts` (ISOLATED, mọi thao tác DOM/event) và `page-bridge.ts` (MAIN, chỉ chứa: hook location §6, interceptor file 09 §3.2, fiber probe §8) giao tiếp `CustomEvent`; Firefox yêu cầu ≥128 — khai `browser_specific_settings.gecko.strict_min_version`.
4. Mọi click/set-value đi qua wrapper (§5) có sẵn jitter delay; dialog pattern dùng helper `openOverlay → actWithin(spec cha) → waitDetach` (§5.3).
5. Bộ nhãn §4.3 khởi đầu phải được **xác nhận bằng probe trên UI thật cả EN lẫn VI** ngay sprint đầu (nhiều dòng đang [Suy luận]); định kỳ re-probe; mở rộng theo flow.
6. Ngay từ scaffold: log-healing §9.3 (storage + màn hình options) — rẻ khi làm sớm, cực đắt khi gắn lại sau.

## 11. Nguồn tham khảo

**First-party, đã fetch trực tiếp trong phiên nghiên cứu (2026-10-12) [Kiểm chứng]:**

1. Chrome Docs — `chrome.scripting` API reference (ExecutionWorld ISOLATED/MAIN; semantics `func` serialize, InjectionResult, registerContentScripts): https://developer.chrome.com/docs/extensions/reference/api/scripting
2. MDN — `scripting.executeScript()`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/executeScript
3. MDN Browser Compat Data (raw JSON) — `webextensions/api/scripting`: xác nhận Firefox ≥102 (API), **≥128 (world MAIN)**, Chrome ≥95/≥102, Safari ≥15.4/≥16.4: https://raw.githubusercontent.com/mdn/browser-compat-data/main/webextensions/api/scripting.json
4. MDN — `History.pushState()` (không bắn hashchange; popstate chỉ khi điều hướng chủ động): https://developer.mozilla.org/en-US/docs/Web/API/History/pushState
5. Playwright Docs — Locators (ưu tiên getByRole/accessible name chuẩn W3C; resolve mới mỗi action; strict mode; `within`/`filter`: https://playwright.dev/docs/locators
6. React source (branch main) — `ReactDOMComponentTree.js`: khoá `__reactFiber$<random>`/`__reactProps$<random>` random mỗi bundle; flag `enableInternalInstanceMap` chuyển sang WeakMap: https://github.com/facebook/react/blob/main/packages/react-dom-bindings/src/client/ReactDOMComponentTree.js
7. StyleX (first-party Meta) — README repo `facebook/stylex`: https://github.com/facebook/stylex
8. caniuse data — `css-has` (`:has()` Chrome ≥105, Firefox ≥121): https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/css-has.json

**Cross-ref nội bộ:** `09-extension-techniques.md` §3.1 (class auto-gen, native setter, MutationObserver, fiber làm hint), §3.2/§3.6 (MAIN world, CSP, debugger); `14-partner-assign-mapping-graphql.md` §1–§2 (nhãn quyền EN/VI đã kiểm chứng Help Center); `15-browser-session-ops-practice.md` §4 (guardrail fail-soft, pacing).

**Không probe được — ghi rõ:** Facebook Help Center + `business.facebook.com` chặn crawl từ môi trường nghiên cứu (HTTP 403, kể cả qua mirror r.jina.ai, 12/10/2026) → mọi quan sát về DOM cụ thể của Comet (aria-label thật, role thật, pattern route, trạng thái fiber key trên React fork của Meta) đều gắn [Suy luận — cần probe] và phải kiểm chứng first-hand trên tài sản test theo hướng test plan kiểu file `16-test-plan-eaag-agencies.md`. Chuẩn W3C tham chiếu không probe: ARIA Authoring Practices Guide (dialog/menu/popper), AccName 1.2 (accessible name computation).
