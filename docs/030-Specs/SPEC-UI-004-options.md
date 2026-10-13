---
id: SPEC-UI-004
type: technical-spec
status: approved
created: 2026-10-12
approved: 2026-10-13
source: docs/040-Design/project/OptionsPacing.dc.html
related: [SPEC-UI-001, SPEC-UI-003, PRD-001, DES-001]
---

# SPEC-UI-004 — Trang Options (Pacing & limit, Audit log, Devtest)

> Nguồn thiết kế: `OptionsPacing.dc.html`, `OptionsAudit.dc.html`, `OptionsDevtest.dc.html`. Yêu cầu: PRD-001 FR-06 (pacing, curfew, giới hạn ghi/ngày), FR-07 (audit log), NFR-02/NFR-03. Thay thế trang Options starter hiện tại (`src/options/Options.tsx` chỉ có vài nút demo).

## 1. Mục đích & phạm vi

Options là nơi **operator chỉnh nền vận hành an toàn** và **xem lại việc đã làm**, ngoài side panel. Gồm 3 tab: **Pacing & limit**, **Audit log**, **Devtest**.

**Trong phạm vi:** khung trang + tab, 3 màn như artboard, lưu/đọc cấu hình ở `storage.local`, ép ngưỡng an toàn ở tầng dữ liệu (không chỉ ở form), thay `?scenario=` của SPEC-UI-003 bằng công tắc Devtest.

**Ngoài phạm vi (chốt sau):** engine đọc pacing thật (FR-06), background ghi audit thật (FR-07), Probe/Log trong side panel. Cho tới lúc đó cấu hình **được lưu và đọc đúng** nhưng chưa có engine nào tiêu thụ; Audit hiện dữ liệu mẫu có nhãn (§6.3).

**Nguyên tắc xuyên suốt:** Options **không bao giờ** mở khoá Full, hạ ngưỡng probe hay hạ giới hạn an toàn (artboard Devtest nói rõ). Form chỉ cho chỉnh **trong** biên an toàn; chạm biên thì báo lỗi, không lưu.

## 2. Khung trang

```
┌──────────────────────────────────────────────┐
│ Cài đặt HPMA Copilot                         │
│ v0.3.0 · áp dụng cho mọi BM trên trình duyệt │
│ [Pacing & limit] [Audit log] [Devtest]       │  ← tab, gạch chân xanh khi chọn
├──────────────────────────────────────────────┤
│ nội dung tab (max-width 960px, canh giữa)    │
└──────────────────────────────────────────────┘
```

- Nền `#f8f7fa`, nội dung `max-width: 960px`, `padding: 24px`. Font Montserrat. Trang nằm trong tab trình duyệt (Chrome `options_page`, Firefox `options_ui`), không phải side panel nên **không** áp ràng buộc 320–420px; vẫn phải dùng được ở 360px (cuộn ngang bảng, §6).
- Boot qua `createShadowRoot(styles)` như các surface khác; layout class đặt ở div con, không đặt trên root `#my-ext` (PostCSS thêm prefix `#my-ext ` dạng descendant nên class trên chính root không khớp).
- Phiên bản hiển thị lấy từ `browser.runtime.getManifest().version`, không hard-code `v0.3.0` của mock.
- Tab đang chọn: `role="tablist"` + `role="tab"` + `aria-selected`; chuyển tab bằng mũi tên trái/phải. Tab nhớ trong URL hash (`#pacing`, `#audit`, `#devtest`) để reload không mất vị trí.
- Ngôn ngữ dùng chung key `lang` với side panel (VI/EN), có nút đổi ở góc phải header.
- Tab **Devtest** luôn hiện trong Options (khác với flag `ui.probeTab` quyết định tab Probe trong side panel).

## 3. Tab "Pacing & limit"

### 3.1. Độ trễ giữa các bước

Ba ô số, mỗi ô có nhãn (`<label for>`), đơn vị bên phải và dòng chú thích bên dưới.

| Ô                          | Mặc định | Biên an toàn (cứng) | Chú thích                                    |
| :------------------------- | :------- | :------------------ | :------------------------------------------- |
| Delay nền (giây)           | 2 (mock) | **≥ 3**             | "Ngưỡng an toàn: tối thiểu 3 giây"           |
| Jitter (± %)               | 40       | **≥ 20**            | "Ngẫu nhiên quanh delay nền · tối thiểu 20%" |
| Thêm trước bước ghi (giây) | 2        | **≥ 2**             | "Cộng thêm trước Assign, Remove, Save"       |

- **Mâu thuẫn mock:** mặc định delay nền trong mock là `2` nhưng biên tối thiểu là `3`, tức mặc định đã vi phạm biên (artboard hiện lỗi đỏ ngay khi mở). Spec chốt **mặc định = 3** (xem Q1). PRD FR-06 ghi "3–8s cho bước ghi": mặc định `3 + 2 = 5s` trước bước ghi, nằm trong khoảng PRD.
- Chấp nhận dấu `,` và `.` làm dấu thập phân (`parseFloat(value.replace(',', '.'))` như mock); bước `0.5`.
- Validate khi `change`/`blur`, không chặn gõ. Giá trị dưới biên: viền đỏ 2px, `aria-invalid="true"`, thông điệp `Không được dưới 3 giây (ngưỡng an toàn).` nối bằng `aria-describedby`. Thông điệp lỗi **thay** chú thích, màu `#b91c1c`.
- **Ép ở tầng dữ liệu:** `sanitizePacing()` (thuần, ở `src/shared/settings.ts`) kẹp mọi giá trị đọc từ storage vào biên, kể cả khi storage bị sửa tay. Không có đường code nào đưa delay `< 3` cho engine (FR-06).
- **Xem trước nhịp chạy** (khối SVG dưới 3 ô): vẽ dãy ví dụ gồm các bước đọc và bước ghi với độ rộng ∝ delay (có jitter) và dòng chữ tóm tắt `preview`, ví dụ "Bước đọc cách nhau 2,4–4,2 giây; bước ghi cách 3,6–6,3 giây." Khi có ô không hợp lệ: `Chưa xem trước được nhịp chạy khi delay nền dưới ngưỡng an toàn.` Phần chữ là nguồn sự thật, SVG chỉ minh hoạ (`aria-hidden`).

### 3.2. Giới hạn ghi mỗi ngày theo loại BM

Bảng 4 cột: **Loại BM · Nhận diện · Lượt ghi / ngày · Mẻ tối đa**; hàng là `th scope="row"`. Hai cột cuối là `<input type="number">` có `aria-label` nêu cả loại BM.

| Loại BM        | Nhận diện                | Lượt ghi / ngày (mặc định) | Mẻ tối đa (mặc định) |
| :------------- | :----------------------- | :------------------------- | :------------------- |
| BM mới         | Tạo dưới 30 ngày         | 10                         | 5                    |
| BM thường      | Mặc định                 | **20**                     | 10                   |
| BM đã xác minh | Có xác minh doanh nghiệp | 60                         | 10                   |

- Đã chốt (SPEC-UI-001 Q4): giới hạn lấy theo loại BM, mặc định `20`; số `9/60` của `ConfirmBatch` là số cũ.
- Biên: lượt ghi `1…trần của loại BM` (mới ≤ 20, thường ≤ 60, xác minh ≤ 60; không có trần toàn cục riêng), mẻ `1…10` (mẻ không vượt `BATCH_SIZE = 10` đã dùng ở SPEC-UI-002 §6). Số nguyên dương; nhập ngoài biên → lỗi inline như §3.1.
- **Không cho tăng giới hạn vượt giá trị mặc định của loại BM?** Đây là quyết định an toàn, xem Q2. Đề xuất MVP: cho chỉnh **giảm** tự do, **tăng** tối đa tới mặc định của loại BM kế trên (BM mới ≤ 20, thường ≤ 60, xác minh ≤ 60).
- Chú thích dưới tiêu đề: "Đếm mọi bước ghi thành công, kể cả pending-approval. Đọc và Dry-run không tính." **Xung đột với quyết định đã chốt** (SPEC-UI-002 Q4: cả lượt chạy tính **1** lượt ghi). Spec này sửa chú thích thành: "Mỗi lượt chạy có ghi tính 1 lượt, kể cả khi kết quả là pending-approval. Đọc và Dry-run không tính." (Q3 xin xác nhận.)
- Loại BM của BM đang bám do engine nhận diện (FR-08/Q1 của SPEC-UI-002). Hiện chưa có: side panel dùng hàng **BM thường** làm giới hạn; hook `useWriteBudget` đọc `limit` từ đây thay vì hằng `20` (đang hard-code, mặc định 0/20).

### 3.3. Curfew

- Công tắc `role="switch"` (có nhãn trạng thái chữ "Đang bật/Đang tắt", không chỉ màu). Mặc định **bật**.
- Ba điều khiển: **Từ** (mặc định `00:00`), **Đến** (`06:00`), **Múi giờ** (`Asia/Ho_Chi_Minh (GMT+7)`, `Asia/Bangkok (GMT+7)`). Khi tắt công tắc: 3 điều khiển `disabled` + mờ 50%.
- Chú thích: "Trong khung giờ này chỉ chạy flow đọc và Dry-run."
- Khớp side panel: `PartnerAssignWizard` hiện chặn Assist/Full khi `new Date().getHours() < 6` (hard-code). Sau spec này, hàm `isCurfew(now, settings)` ở `src/shared/settings.ts` thay đoạn đó, tính theo múi giờ đã chọn. PRD ghi curfew là "giờ địa phương tài khoản"; Options chỉ có hai múi giờ GMT+7 (xem Q4).
- Khung giờ có thể băng qua nửa đêm (`22:00 → 06:00`): `isCurfew` xử lý `from > to`. `from == to` coi là không có khung (không chặn).
- Tắt curfew: hiện dòng cảnh báo trung tính dưới công tắc "Tắt curfew cho phép chạy ghi lúc 0h–6h. Khuyến nghị giữ bật." và **ghi một dòng audit** `settings.curfewOff` (khi có FR-07).

### 3.4. Lưu / khôi phục

- Footer dính cuối nội dung: nút **Khôi phục mặc định** (ghost) · dòng `saveHint` · nút **Lưu thay đổi** (primary xanh).
- `saveHint`: không đổi → "Chưa có thay đổi."; có đổi hợp lệ → "Có thay đổi chưa lưu."; có lỗi → "Sửa các ô báo lỗi trước khi lưu." (`aria-live="polite"`).
- **Lưu** disabled khi không có thay đổi hoặc còn lỗi. Lưu thành công: hint "Đã lưu." 3 giây.
- **Khôi phục mặc định** chỉ đưa form về mặc định (chưa lưu); user bấm Lưu mới ghi. Có `confirm` inline (không dùng `window.confirm`, tránh khoá extension) khi form đang có thay đổi chưa lưu.
- Rời tab/đóng trang khi còn thay đổi chưa lưu: `beforeunload` cảnh báo.

## 4. Tab "Audit log"

Nguồn dữ liệu FR-07: chunk `audit:<yyyy-mm>:<n>` trong `storage.local`, append-only, không PII, không secrets. Mỗi bước ghi, **kể cả Dry-run**, có một dòng. Lưu cục bộ 90 ngày.

### 4.1. Bố cục

1. Tiêu đề + chú thích: "Mỗi bước ghi, kể cả Dry-run, đều có một dòng. Lưu cục bộ 90 ngày." Bên phải: nút **Export CSV**, **Export JSONL**.
2. **Bộ lọc** (lưới tự co `minmax(170px, 1fr)`): Từ ngày · Đến ngày · Flow (Tất cả/Gán partner/Gỡ partner/Đổi tên TKQC) · Kết quả (Tất cả/done/pending-approval/failed/bỏ qua/không ghi (dry-run)) · ô **Tìm** (khớp BM, target, runId).
3. **Bảng** 8 cột: Thời gian · Flow · BM · Target · Mode · Kết quả · runId · Người chạy.
4. **Phân trang:** `1–10 trong 248 dòng` + nút trang `‹ 1 2 3 ›` (10 dòng/trang).
5. Trạng thái rỗng: "Không có dòng nào khớp bộ lọc." (khi có dữ liệu nhưng lọc ra 0) và "Chưa có dòng audit nào." (khi chưa từng ghi).

### 4.2. Quy ước hiển thị

| Cột        | Quy ước                                                                                                                   |
| :--------- | :------------------------------------------------------------------------------------------------------------------------ |
| Thời gian  | `dd/MM HH:mm`, giờ máy; `title` = ISO đầy đủ. Mới nhất ở trên.                                                            |
| Mode       | Chữ **và** màu: Full cam `#c2410c`, Assist vàng đậm `#854d0e`, Dry-run xanh `#15803d`, Đọc xám `#4b5563`                  |
| Kết quả    | Chữ + icon, không chỉ màu: `done` xanh · `pending-approval` vàng · `failed` đỏ · `bỏ qua` xám · `không ghi (dry-run)` xám |
| runId      | font mono, có nút copy (36px) — `run_…`                                                                                   |
| Người chạy | Xem Q5 (mâu thuẫn "không PII")                                                                                            |

- Bảng dùng `<table>` thật (`th scope="col"`), `min-width: 904px` trong vùng cuộn ngang có `tabIndex=0` và `aria-label`, để dùng được ở màn nhỏ.
- Lọc, tìm, phân trang chạy **ở client** trên tập đã nạp. Nạp theo tháng (chunk) khi lọc `Từ ngày/Đến ngày` chạm tháng mới. Tìm không phân biệt hoa thường và dấu.

### 4.3. Export

- **CSV:** UTF-8 có BOM (mở được bằng Excel), 8 cột như bảng, dùng bộ lọc hiện tại (xuất **toàn bộ dòng khớp**, không chỉ trang đang xem). Escape `"`, xuống dòng, và **chống CSV-injection**: ô bắt đầu bằng `= + - @ \t \r` thì thêm `'` đứng trước.
- **JSONL:** mỗi dòng một object đầy đủ trường (không rút gọn theo cột hiển thị), cùng bộ lọc.
- Tên file: `hpma-audit-<yyyyMMdd-HHmm>.csv|jsonl`. Tạo bằng `Blob` + `URL.createObjectURL` + `<a download>`; không cần quyền `downloads`.
- Mức `logDetail = verbose` (Devtest) có thể thêm tên TKQC/BM ID vào log và lọt vào export: hiện cảnh báo ngay tại nút Export khi `logDetail === 'verbose'`.

### 4.4. Dữ liệu cho tới khi có FR-07

Chưa có background nào ghi audit. Để dựng và duyệt UI (cùng hướng SPEC-UI-003 §2):

- `useAuditLog()` trả về `{ rows, isSample }`. Khi `storage.local` không có chunk `audit:*`, trả **10 dòng mẫu của artboard** với `isSample: true`.
- Khi `isSample`, hiện chip trung tính **`Dữ liệu mẫu`** (`role="note"`) ngay dưới tiêu đề và gắn vào mọi file export (cột/trường `sample: true`), tránh nhầm với dữ liệu thật.
- Simulator của SPEC-UI-003 **không** ghi audit (nó không phải thao tác thật). Khi có FR-07, đổi nguồn không đổi UI.
- Dòng mẫu có `Full` dù Full đang khoá: chỉ là dữ liệu minh hoạ, không phản ánh chức năng đã mở.

## 5. Tab "Devtest"

Tiêu đề + chú thích: "Dành cho dev và operator nâng cao. Cờ ở đây không mở khoá Full, không hạ ngưỡng probe hay giới hạn an toàn."

### 5.1. Cờ bật/tắt

Mỗi cờ là một thẻ: nhãn, `key` (mono, nhỏ), mô tả, công tắc `role="switch"` + chữ `Bật/Tắt`.

| Nhãn                                | `key`                  | Mặc định (mock) | Mô tả                                                           |
| :---------------------------------- | :--------------------- | :-------------- | :-------------------------------------------------------------- |
| Bật devtest                         | `devtest`              | Bật → xem Q6    | Hiện công cụ debug trong side panel và ghi thời gian từng bước. |
| Hiện tab Probe                      | `ui.probeTab`          | Bật → xem Q6    | Cho operator xem hit-rate selector ngay trong side panel.       |
| Lưu DOM snapshot khi selector trượt | `probe.snapshotOnMiss` | Tắt             | Chỉ lưu cục bộ, tự xoá sau 24 giờ. Không gửi đi đâu.            |

### 5.2. Mức chi tiết log

`<select id="log-detail">` (`logDetail`): `off` (chỉ audit) · `basic` (thêm step và selector) · `verbose` (thêm nội dung field). Mặc định `off`.

- Chọn `verbose`: hiện khối cảnh báo cam, `role="alert"`: "verbose ghi cả tên TKQC và BM ID vào log cục bộ, có thể lọt vào file export. Tắt khi debug xong."
- Quy tắc an toàn: `logDetail` **tự về `off`** khi đóng trình duyệt hoặc sau 24 giờ (đề xuất, Q7), để cờ debug không bị bỏ quên.

### 5.3. Khối "Luôn bật, không tắt được"

Thẻ chỉ đọc, không có công tắc: "Kill-switch · audit log · từ chối vùng đỏ · emergency stop khi gặp checkpoint, CAPTCHA, temp-block." Icon khoá + chữ, không chỉ màu. Spec không cho phép đặt cờ nào làm tắt các mục này.

### 5.4. Kịch bản simulator (thay `?scenario=`)

Chốt từ SPEC-UI-003 Q4: công tắc kịch bản của simulator nằm ở Devtest. Thêm một thẻ, **chỉ hiện khi `devtest` bật**:

- Nhãn **"Kịch bản mô phỏng"**, `key` = `sim.scenario`, `<select>`: `done` (mặc định) · `pending` · `failed` · `disconnect`.
- Mô tả: "Chỉ áp dụng cho run mô phỏng. Không ảnh hưởng BM thật."
- `useRunSimulator` đọc `sim.scenario` từ `storage.local` (ưu tiên) và **vẫn nhận `?scenario=`** để không phá cách test hiện tại; query thắng storage khi có (Q8 xin bỏ query sau khi Devtest ổn).

## 6. Dữ liệu & lưu trữ

Mọi cấu hình ở `storage.local` (không `sync`: thiết lập vận hành gắn với máy/profile antidetect, không đồng bộ). Kiểu và hàm thuần ở `src/shared/settings.ts`, hook `useSettings()` ở `src/shared/hooks/`.

```ts
type PacingSettings = {
  delayBaseSec: number; // ≥ 3
  jitterPct: number; // ≥ 20
  writeExtraSec: number; // ≥ 2
  curfew: { on: boolean; from: string; to: string; tz: CurfewTz }; // 'HH:mm'
};

type BmKind = 'new' | 'standard' | 'verified';
type LimitSettings = Record<BmKind, { writesPerDay: number; maxBatch: number }>;

type DevtestSettings = {
  devtest: boolean;
  probeTab: boolean; // ui.probeTab
  snapshotOnMiss: boolean; // probe.snapshotOnMiss
  logDetail: 'off' | 'basic' | 'verbose';
  simScenario: RunScenario; // sim.scenario
};
```

| Key `storage.local` | Nội dung                           | Ghi chú                                                 |
| :------------------ | :--------------------------------- | :------------------------------------------------------ |
| `settings:pacing`   | `PacingSettings` + `LimitSettings` | Đọc qua `parseSettings()` luôn kẹp biên an toàn         |
| `settings:devtest`  | `DevtestSettings`                  | `logDetail` có thêm `logDetailAt` (mốc bật)             |
| `lang`              | dùng chung với side panel          | Đã có                                                   |
| `writeBudget`       | `{used, limit}`                    | Đã có; `limit` lấy từ `settings:pacing`, không nhập tay |

- Khoá cấu hình thiếu/hỏng → dùng mặc định; không throw. Mọi hàm `parse*` thuần, có kiểm chứng bằng script tạm như `run.ts`.
- Quan sát thay đổi bằng `storage.onChanged`: side panel đang mở cập nhật ngay khi Options lưu (budget, curfew, scenario).
- Không thêm quyền: chỉ cần `storage` (đã có). Export dùng `Blob`, không cần `downloads`.

## 7. Trạng thái & lỗi

| Tình huống                      | Hiển thị                                                                  |
| :------------------------------ | :------------------------------------------------------------------------ |
| Chưa tải xong settings          | Khung xương (skeleton) cho form, không nhấp nháy giá trị mặc định rồi đổi |
| `storage.local` lỗi ghi (quota) | Hint đỏ "Không lưu được: hết dung lượng lưu trữ." + giữ form nguyên       |
| Ô không hợp lệ                  | Viền đỏ + thông điệp `aria-describedby`; nút Lưu disabled                 |
| Audit chưa có dữ liệu thật      | Chip `Dữ liệu mẫu` (§4.4)                                                 |

## 8. Cấu trúc code

```
src/options/Options.tsx            ← khung + tab + hash routing
src/options/components/
  OptionsShell.tsx                  ← header, tab nav, footer dính
  PacingTab.tsx  DelayFields.tsx  LimitTable.tsx  CurfewSection.tsx
  AuditTab.tsx   AuditFilters.tsx  AuditTable.tsx  AuditPager.tsx
  DevtestTab.tsx FlagCard.tsx
  Switch.tsx NumberField.tsx        ← dùng chung 3 tab
src/shared/settings.ts              ← kiểu, DEFAULT_*, sanitizePacing, parseSettings, isCurfew
src/shared/audit.ts                 ← AuditRow, filterAudit, toCsv, toJsonl, SAMPLE_AUDIT
src/shared/hooks/useSettings.ts  useAuditLog.ts
```

- Component chức năng, `JSX.Element` tường minh, PascalCase. Chỉ Tailwind + DaisyUI, không inline style (mock dùng inline style → chuyển hết sang class).
- Dùng lại `translate`/`i18n.ts`; thêm key `opt.*` cho cả vi và en.
- Mọi hàm `settings.ts`/`audit.ts` thuần và không phụ thuộc `browser` để kiểm chứng ngoài UI.

## 9. Accessibility & i18n

- Tab theo APG Tabs (mũi tên, `aria-controls`, panel có `role="tabpanel"`). Mọi ô có `<label>`; lỗi nối `aria-describedby`; trạng thái công tắc nói bằng chữ.
- Touch target ≥ 36px (nút, ô số, công tắc). Tương phản chữ ≥ 4.5:1: không dùng xám nhạt cho chú thích (mock dùng `#4b5563`/`#52525b`, giữ).
- Màu không phải kênh duy nhất: Mode và Kết quả luôn có chữ.
- Hỗ trợ light/dark theo `data-theme`; bảng và thẻ không dùng màu cứng (dùng token).
- Đổi ngôn ngữ giữa chừng không mất giá trị form chưa lưu.

## 10. Tiêu chí nghiệm thu

1. Ba tab hiển thị đúng artboard ở 1280px, và dùng được ở 360px (bảng cuộn ngang), light + dark.
2. Delay nền `< 3`, jitter `< 20`, thêm trước bước ghi `< 2`: báo lỗi, Lưu bị khoá; storage chứa giá trị dưới biên vẫn được kẹp lên biên khi đọc.
3. Giới hạn ghi/ngày và curfew lưu được; side panel đang mở cập nhật `limit` và chặn curfew theo cấu hình mới mà không cần reload.
4. `isCurfew` đúng cho khung băng nửa đêm, `from == to`, tắt curfew, múi giờ đã chọn.
5. Audit: lọc theo ngày/flow/kết quả/tìm, phân trang, trạng thái rỗng; export CSV có BOM và chống CSV-injection; JSONL đủ trường; có chip `Dữ liệu mẫu` khi chưa có audit thật.
6. Devtest: 3 cờ + `logDetail` lưu được; chọn `verbose` hiện cảnh báo; khối "Luôn bật" không có công tắc.
7. Công tắc Kịch bản mô phỏng điều khiển `useRunSimulator`; `?scenario=` vẫn chạy.
8. Không có UI nào xuất hiện trong trang `business.facebook.com`; không thêm permission mới.
9. VI/EN đủ key. `pnpm lint`, `tsc`, `lint:spell`, `pnpm build`, `pnpm build:firefox` pass.

## 11. Câu hỏi đã chốt

**Q1–Q10 đã chốt theo đề xuất** (cột "Đề xuất" bên dưới là quyết định), kèm các điều chỉnh khi build:

- Q2: bỏ "giới hạn cứng toàn cục 200"; chỉ còn trần theo loại BM (không bao giờ chạm 200 nên là luật thừa).
- Q7: chỉ làm phần **hết hạn 24 giờ**, kiểm tra lúc đọc. Phần "reset khi khởi động lại trình duyệt" cần `runtime.onStartup` ở background nên **hoãn** tới khi có broker (FR-07).
- §7: bỏ dòng "Run đang chạy dùng cấu hình cũ" vì simulator giữ run trong bộ nhớ panel, Options không biết run có đang chạy hay không. Thêm lại khi run state được lưu ở background.
- Firefox: `options_ui.open_in_tab = true` để trang không bị nhúng trong khung hẹp của `about:addons` (layout 960px và tải file export cần tab riêng).

| #   | Câu hỏi                                                                                                          | Đề xuất                                                                                                          |
| :-- | :--------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| Q1  | Mock đặt mặc định delay nền `2` nhưng biên tối thiểu `3` (mặc định đã vi phạm). Mặc định là bao nhiêu?           | **3 giây.** Sửa artboard `OptionsPacing`.                                                                        |
| Q2  | Operator có được **tăng** giới hạn ghi/ngày vượt mặc định của loại BM không?                                     | Giảm tự do; tăng tối đa tới mặc định loại BM kế trên (§3.2).                                                     |
| Q3  | Chú thích bảng giới hạn nói "đếm mọi bước ghi", mâu thuẫn quyết định "cả lượt chạy tính 1" (SPEC-UI-002 Q4).     | Sửa chú thích theo quyết định đã chốt (§3.2); sửa artboard.                                                      |
| Q4  | Curfew "giờ địa phương tài khoản" (PRD) nhưng Options chỉ có hai múi giờ GMT+7. Có cần danh sách múi giờ đầy đủ? | Giữ 2 múi giờ cho MVP; mặc định theo `Intl.DateTimeFormat().resolvedOptions().timeZone` nếu nằm trong danh sách. |
| Q5  | Cột "Người chạy" (`ops.an`) mâu thuẫn FR-07 "không PII". Extension không có khái niệm tài khoản đăng nhập.       | Bỏ cột ở MVP; thay bằng nhãn hồ sơ trình duyệt do operator tự đặt (tuỳ chọn) nếu cần phân biệt nhiều máy.        |
| Q6  | Mock bật sẵn `devtest` và `ui.probeTab` (và `logDetail = verbose`). Mặc định ngoài sản xuất?                     | Mặc định **tắt** cả hai và `logDetail = off`; bản dev (`import.meta.env.DEV`) bật sẵn `devtest`.                 |
| Q7  | `logDetail` có tự về `off` sau một thời gian?                                                                    | Có: về `off` sau 24 giờ hoặc khi khởi động lại trình duyệt.                                                      |
| Q8  | Có bỏ `?scenario=` khi công tắc Devtest xong?                                                                    | Giữ cả hai trong M1; bỏ query khi có test tự động dùng storage.                                                  |
| Q9  | Nguồn nhận diện "loại BM" (mới/thường/đã xác minh) khi chưa có engine.                                           | Dùng hàng "BM thường" cho tới khi FR-08 đọc được tuổi BM và trạng thái xác minh.                                 |
| Q10 | Audit 90 ngày: ai dọn? (background chưa có)                                                                      | Làm cùng FR-07: dọn chunk quá hạn khi ghi chunk mới; Options chỉ hiện "đang giữ n ngày".                         |
