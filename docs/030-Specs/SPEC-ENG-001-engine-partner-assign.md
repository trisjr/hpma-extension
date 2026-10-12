---
id: SPEC-ENG-001
type: technical-spec
status: draft
created: 2026-10-12
related:
  [
    SPEC-UI-002,
    SPEC-UI-003,
    SPEC-UI-004,
    PRD-001,
    'research/17',
    'research/18',
    'research/19',
    'research/21',
  ]
---

# SPEC-ENG-001 — Action engine và flow "Gán partner vào TKQC" (Dry-run / Assist)

> Yêu cầu: PRD-001 FR-02, FR-03, FR-04, FR-05, FR-06, FR-07 (phần ghi tối thiểu), NFR-02, NFR-05, NFR-06, NFR-07. Thay simulator của SPEC-UI-003 bằng engine thật chạy trong content script. **Chưa có trường hợp nào được kiểm chứng trên BM thật** ngoài phát hiện thực địa 12/10 (PRD §4.3); mọi nhãn/selector khác đánh dấu `unverified` trong dữ liệu (§6) và engine phải dừng nhẹ nhàng (fail-soft) khi không tìm thấy.

## 1. Mục đích & phạm vi

Dựng engine tối thiểu nhưng đúng kiến trúc (file 21) để flow "Gán partner vào TKQC" chạy được ở **Dry-run** và **Assist** trên tab BM thật, qua UI side panel hiện có.

**Trong phạm vi:** primitives + locator + labels, step-runner, flow `partnerAssign`, pacing/curfew/visibility gate, watcher checkpoint, giao thức message panel ↔ content script, hook `useRunEngine`, audit tối thiểu + `writeBudget`, đổi UI sang chế độ engine (nhập TKQC bằng dán, Diff "chưa đọc").

**Ngoài phạm vi:** Full (vẫn `FULL_LOCKED`, chưa qua cổng ghi PRD §8), Confirm 1/2/Batch, Log, Probe/health-check, flow đọc kiểm kê (FR-08), nhận diện loại BM, gỡ partner, self-healing, background broker/policy gate (xem Q4), kill-switch ở popup.

## 2. Quyết định đã chốt

| #   | Quyết định                                                                                                                                                    |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Engine đi **đường Partners** (một wizard chọn nhiều TKQC), không đi đường từng-TKQC. Đây là đường duy nhất có bằng chứng thực địa (PRD §4.2, §4.3).           |
| D2  | TKQC nhập bằng **dán tên hoặc ID** (mỗi dòng một mục). Engine khớp trong danh sách tài sản của wizard. Danh sách mẫu chỉ còn cho simulator.                   |
| D3  | **Làm audit tối thiểu ngay**: mỗi target một `AuditRow`, tăng `writeBudget` khi Assist verify xong.                                                           |
| D4  | State của run ở **content script**. Panel là view + nguồn lệnh; đóng/mở panel không mất run. Reload tab BM thì run mất, **không tự chạy tiếp**.               |
| D5  | **Không điều hướng bằng `location.href`/`assign`** (tải lại trang giết content script). Chỉ bấm menu SPA; ngoài `/settings` thì dừng với `ERR_WRONG_SURFACE`. |
| D6  | Assist **không bao giờ tự bấm Assign**. Dry-run **không bao giờ** thực thi bước ghi.                                                                          |
| D7  | Simulator giữ lại, chọn bằng cờ Devtest `useSimulator` (mặc định tắt). Chip `Mô phỏng` chỉ hiện khi simulator chạy.                                           |

## 3. Kiến trúc

```
Side panel ── useRunEngine ── tabs.sendMessage(pinnedTabId, RunCommand) ──▶ content script
          ◀── runtime.sendMessage(RunEvent: snapshot RunState) ──────────      │
                                                                               ▼
                         src/content/engine/*  ──▶ DOM trang BM (chỉ các step của flow)
                                   │
                                   └──▶ storage.local: audit:<yyyy-mm>:<n>, writeBudget, lastRun
```

Bố cục mã:

| File                                       | Vai trò                                                                                               |
| :----------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| `src/shared/messaging.ts` (mở rộng)        | Union `RunCommand`/`RunEvent` + type guard viết tay                                                   |
| `src/shared/run.ts` (sửa)                  | Thêm `unverified`, `DiffOp 'unknown'`, `RunState.batch`, mã lỗi; `advance`/simulator giữ nguyên       |
| `src/content/engine/text.ts`               | `normalizeText` (NFC, bỏ `\p{Cf}`/`\p{Zs}` thừa, gộp khoảng trắng, hạ chữ)                            |
| `src/content/engine/locator.ts`            | `resolve(spec, scope)`: tầng 1→4, lọc ẩn, strict, `withinMain`/`within`                               |
| `src/content/engine/primitives.ts`         | `click`, `type`, `waitFor`, `waitGone`, `readText`, `isEnabled`, `scrollIntoView`; nhận `AbortSignal` |
| `src/content/engine/pacing.ts`             | Đọc settings qua `parsePacing`; `pause(kind)`; gate curfew + visibility                               |
| `src/content/engine/watchers.ts`           | Phát hiện checkpoint / login / CAPTCHA / dialog lạ / chặn tần suất                                    |
| `src/content/engine/runner.ts`             | Step-runner: chạy `FlowDef`, phát snapshot, xử lý abort, ghi audit                                    |
| `src/content/engine/labels.ts`             | Nhãn EN/VI + cờ `verified` (dữ liệu có phiên bản)                                                     |
| `src/content/engine/selectors.ts`          | `LocatorSpec` theo key                                                                                |
| `src/content/flows/partnerAssign.ts`       | `FlowDef` 7 bước (§5)                                                                                 |
| `src/content/index.ts` (sửa)               | Đăng ký listener một lần, validate, định tuyến lệnh                                                   |
| `src/shared/hooks/useRunEngine.ts`         | Cùng API với `useRunSimulator` (`run/start/stop/confirmAssist/resync/clear`)                          |
| `src/shared/audit.ts`, `useWriteBudget.ts` | Thêm ghi append; `writeBudget` đổi thành `{ day, used }`                                              |

## 4. Giao thức message

Chỉ chấp nhận `sender.id === browser.runtime.id`; mọi payload qua type guard, sai shape thì bỏ. Trang BM không có đường gửi `runtime` message vào extension (không khai `externally_connectable`).

```ts
type RunCommand =
  | {
      kind: 'run.start';
      requestId: string;
      mode: 'dry' | 'assist';
      config: RunConfig;
    }
  | { kind: 'run.stop'; runId: string }
  | { kind: 'run.sync' }
  | { kind: 'run.assistDone'; runId: string };

type RunConfig = {
  partnerBmId: string;
  queries: string[];
  tasks: PartnerTask[];
};

type RunEvent = { kind: 'run.state'; run: RunState | undefined };
```

- **Validate ở content script:** `partnerBmId` qua `sanitizeBmId` rồi `validateBmId` (15–17 chữ số); `queries` tối đa 200 mục, mỗi mục ≤ 200 ký tự sau trim, bỏ rỗng/trùng; `tasks` là tập con của `PartnerTask`, không rỗng.
- **`run.start`** trả `{ ok: true, runId } | { ok: false, code }`. `runId` do content script sinh (`newRunId`).
- **`run.state`**: toàn bộ snapshot `RunState` mỗi lần đổi (nhỏ, nên không cần diff). Phát bằng `runtime.sendMessage`; panel đóng thì reject → bỏ qua. Panel nhận chỉ khi `runId` khớp run đang theo dõi hoặc là run mới do chính nó start.
- **`run.sync`** trả snapshot hiện tại (hoặc `undefined`): panel mở lại hoặc đổi tab thì đồng bộ (P-1).
- **`run.stop`** huỷ `AbortController`; step đang chờ dừng trong ≤ 1 step (FR-01). **`run.assistDone`** chỉ giục verify (§5.3), không phải bằng chứng thành công.
- Mỗi content script chỉ giữ **một** run. `run.start` khi đang có run active → `{ ok: false, code: 'ERR_BUSY' }`.

## 5. Flow `partnerAssign`

### 5.1. Bảy bước (mỗi mẻ ≤ `BATCH_SIZE` = 10 TKQC)

| #   | Bước (tiêu đề UI giữ nguyên key `run.step.N`, nội dung cập nhật) | Hành động engine                                                                                                   | Ghi? |
| :-- | :--------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- | :--- |
| 1   | Mở Cài đặt BM › Đối tác                                          | Kiểm `pathname` chứa `/settings`; bấm mục **Partners/Đối tác** (mở nhóm Users nếu đang gập); chờ danh sách partner | —    |
| 2   | Mở "Cấp cho đối tác quyền truy cập"                              | Bấm **Add/Thêm** (trong vùng main) → bấm mục **Give a partner access…**                                            | —    |
| 3   | Nhập BM ID đối tác                                               | Gõ từng ký tự vào ô ID → **Next/Tiếp**; chờ wizard chọn tài sản                                                    | —    |
| 4   | Chọn TKQC                                                        | Với mỗi query: nhập search; ID chọn tài sản đầu tiên, tên chọn hàng trùng chính xác; bỏ qua Chọn tất cả, tick      | —    |
| 5   | Tick quyền                                                       | Tick công tắc task theo config; chọn "partial" nếu UI có nút chọn nhóm; kiểm tra quyền dư                          | —    |
| 6   | Bấm Assign                                                       | **Dry:** bỏ qua, đóng wizard bằng Cancel/Close. **Assist:** dừng, `waiting-user`, chờ hộp thoại đóng               | Có   |
| 7   | Verify readback                                                  | Đọc lại danh sách partner/tài sản; chốt kết quả từng target                                                        | —    |

Khác simulator: bước 1–3 chạy **một lần mỗi mẻ**; bước 4–5 và 7 làm theo **từng target trong mẻ**; `RunState.steps` là 7 bước của mẻ hiện tại, thêm `RunState.batch = { index, total }`. Nhiều mẻ thì lặp bước 1–7; giữa hai mẻ chờ nhịp "giữa đơn vị batch" (§7) và ở Assist, hộp thoại mẻ sau chỉ mở khi mẻ trước đã verify xong. **Cả run vẫn tính 1 lần ghi** (SPEC-UI-002 Q4).

### 5.2. Kết quả từng target (`TargetOutcome`)

`done` · `skipped-existing` · `failed` · `pending-approval` · `queued` · `running` · **`unverified`** (mới).

- Không có kết quả search hoặc không khớp tên chính xác → `failed`, mã `ERR_TARGET_NOT_FOUND` (target khác vẫn chạy). Tên trùng ≥ 2 mục → `failed`, `ERR_TARGET_AMBIGUOUS` (không đoán). ID dùng tài sản đầu tiên trong kết quả search của Meta, kể cả khi hàng chỉ hiện tên.
- Hàng tài sản bị vô hiệu hoặc có dấu "đã chỉ định" (nhãn `asset.alreadyAssigned`, `unverified`) → `skipped-existing`.
- Không chọn được target nào trong mẻ → run `failed`.
- `unverified`: đã (hoặc có thể đã) ghi nhưng không đọc lại được → hiển thị cảnh báo **"Chưa xác minh được. Kiểm tra tay trước khi chạy lại"**; **không bao giờ retry** (file 19 §7 mức (c)). Run kết thúc `failed` với `ERR_VERIFY_UNREADABLE`.

### 5.3. Assist và verify

1. Đến bước 6, engine không chạm nút Assign. Chờ `waitGone(dialog)` (timeout 10 phút, huỷ được) **hoặc** `run.assistDone`.
2. Khi hộp thoại đóng, quét văn bản dialog/toast cuối cùng: có cụm "cần người khác duyệt / may need to approve" (nhãn `signal.approval`) → mọi target đã chọn `pending-approval`, run `pending-approval`, **không replay** (FR-04).
3. Ngược lại chuyển bước 7: đọc lại; thấy → `done`, không thấy → `unverified`.
4. User đóng hộp thoại bằng Cancel thì bước 7 đọc lại cũng không thấy → `unverified`; UI nêu rõ "có thể bạn đã huỷ".

## 6. Locator, nhãn, primitives

- **Nhãn là dữ liệu**: `labels.ts` mỗi key có `{ vi: string[], en: string[], verified: boolean }`. Nhãn đã có trong tài liệu (Partners/Đối tác, Thêm/Add, Chỉ định tài sản/Assign assets, Tiếp/Next) gắn `verified: false` trừ những gì PRD §4.3 đã ghi nhận chạy thực địa (đến bước vào wizard chọn tài sản, locale vi). `dialog.accessPartial`, `dialog.task*`, `asset.alreadyAssigned`, `signal.approval` đều `unverified`.
- **`LocatorSpec`** theo file 17 §9.2: `role`, `names`, `attrs`, `texts`, `within`, `structure`. Thứ tự tầng 1→4; tầng fiber không dùng.
- **`resolve`**: (a) tìm lại từ DOM ở **mỗi** lần gọi, kiểm `isConnected`; (b) lọc phần tử ẩn (`hidden`, `aria-hidden`, kích thước 0, `display:none`/`visibility:hidden`); (c) ≥ 2 ứng viên cùng tầng → thu hẹp bằng `within`/vùng main, vẫn nhiều → lỗi `ERR_LOCATE_AMBIGUOUS`, **không lấy `first()`**; (d) không ứng viên → `ERR_LOCATE_TIMEOUT` kèm `key`.
- **`normalizeText`** bỏ `\p{Cf}` (zero-width) và quy mọi `\p{Zs}` về khoảng trắng thường trước khi so (PRD §4.3 điểm 2). Không bỏ dấu tiếng Việt, trừ fallback cuối.
- **`click`**: chờ phần tử **enabled** (không `disabled`, không `aria-disabled="true"`) tối đa timeout; `scrollIntoView`; chuỗi `pointerdown → mousedown → pointerup → mouseup → click` với trễ 30–120 ms; `el.click()` chỉ là fallback. Không cố giả mạo `isTrusted`.
- **`type`**: native setter + `InputEvent` từng ký tự, khoảng cách phím log-normal trung vị ~120 ms (80–250 ms); sau khi gõ đọc lại `value` phải khớp, sai thì `ERR_TYPE_MISMATCH`.
- **`waitFor`/`waitGone`**: `MutationObserver` trên `document.body` + một lần poll chốt; timeout mặc định **15 s**; nhận `AbortSignal` (huỷ ném `AbortError`, runner coi là `stopped`).
- Chỉ ghi vào DOM qua `click`/`type`. Không `innerHTML` với dữ liệu trang. Dữ liệu đọc từ trang (tên TKQC) chỉ đi vào `RunState`/audit dạng chuỗi thuần.

## 7. Pacing, curfew, an toàn

- Mọi bước ghi/hành động đi qua `pacing.pause(kind)`. `kind`: `micro` (giữa thao tác trong cùng bước: 0.3–2.5 s), `step` (giữa hai bước: `delayBase` ± jitter), `write` (`delayBase + writeExtra` ± jitter), `batch` (giữa hai mẻ: 20–90 s). Giá trị đọc từ `storage.local` qua **`parsePacing`** trong content script nên mức sàn an toàn giữ ở lớp engine. Jitter tính lại mỗi lần, nguồn `crypto.getRandomValues`. **Dry-run cũng chờ theo nhịp như thật** (hành vi DOM giống nhau).
- **Cổng trước mỗi hành động:** (1) `isCurfew` → run `failed` `ERR_CURFEW` (chỉ Assist, khớp wizard; Dry được phép); (2) `document.visibilityState === 'visible'`, hidden thì **tạm dừng** (`paused`) đến khi hiển thị lại, không tính vào timeout bước. Không dùng `hasFocus` vì side panel đang giữ focus thì tab BM luôn "không focus" (khác PRD FR-06, xem Q2).
- **Ngân sách:** Assist từ chối start khi `writeBudget.used ≥ limit` (hàng `standard`, SPEC-UI-004 Q9) với `ERR_BUDGET`. `used` +1 **chỉ khi** run Assist kết thúc với ít nhất một target `done`.
- **Watchers** (chạy suốt run, kiểm đường dẫn mỗi 500 ms + `MutationObserver` cho dialog mới):

| Tín hiệu                                                        | Phản ứng                                                                             |
| :-------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| `pathname` chứa `/checkpoint`; CAPTCHA/ "Confirm your identity" | Dừng khẩn cấp `ERR_CHECKPOINT`; ghi cờ `emergencyStop` vào storage; **không tự xoá** |
| Về trang đăng nhập / "Session expired"                          | Dừng `ERR_LOGGED_OUT`; không tự điền gì                                              |
| "temporarily blocked / bị chặn tạm thời", "try again later"     | Dừng `ERR_RATE_LIMITED`; Assist bị chặn start 24 giờ (cờ `rateLimitedUntil`)         |
| Dialog lạ không thuộc bản đồ flow                               | Dừng `ERR_UNEXPECTED_DIALOG`; nhường user                                            |

`emergencyStop`/`rateLimitedUntil` chặn **Assist** ở lần start sau cho tới khi user xoá ở Options › Devtest (nút "Gỡ khoá khẩn cấp", chỉ hiện khi cờ tồn tại). Dry-run vẫn chạy được.

- **Mã lỗi** nằm trong `RunState.error = { code, stepIndex }`; không đưa dữ liệu nhạy cảm vào `message`. Khi `logDetail ≠ off`, thêm `detail` gồm `key` của locator và `lang` của trang (không có nội dung trang).

## 8. Audit và `writeBudget`

- Mỗi target kết thúc → một `AuditRow` (`flow: 'partner-assign'`, `mode`, `result` ánh xạ: `done→done`, `pending-approval→pending`, `failed|unverified→failed`, `skipped-existing→skip`, dry → `dry`). Append vào `audit:<yyyy-mm>:<n>` (chunk tối đa 200 dòng; chunk đầy thì tăng `n`). Không sửa dòng cũ.
- **Không PII:** `bm` mặc định là `BM nguồn` (chưa đọc được tên BM thật), `target` mặc định là `TKQC #<thứ tự trong mẻ>`; **tên TKQC và ID partner chỉ ghi khi `logDetail = verbose`** (còn hiệu lực 24 giờ), `basic` thêm tên TKQC. Không bao giờ ghi cookie/token.
- Options › Audit hết dùng dữ liệu mẫu khi có ít nhất một dòng thật (`useAuditLog` đã làm vậy); chip "Dữ liệu mẫu" biến mất.
- `writeBudget`: `{ day: 'yyyy-mm-dd' (giờ máy), used }`. `useWriteBudget` coi `day` khác hôm nay là `used = 0`. Content script đọc-cộng-ghi; không khoá liên tục giữa nhiều tab (Q5).
- Ghi lỗi quota thì bỏ qua âm thầm nhưng đặt cờ `auditFailed` vào snapshot để UI nêu "Không ghi được audit".

## 9. Thay đổi UI

- **Hook**: `useRunEngine` thay `useRunSimulator` ở `SidePanel` trừ khi cờ `useSimulator` bật. Hợp đồng trả về giữ nguyên. Khi `connection.status ≠ connected` thì `start` bị khoá như hiện nay.
- **Run đang chạy bị mất** (reload tab BM): `run.sync` trả `undefined` trong khi panel đang giữ run active → panel đặt `status: 'stopped'`, `error: ERR_TAB_RELOADED`.
- **StepAccounts (engine mode):** ô textarea "Dán tên hoặc ID TKQC, mỗi dòng một mục", đếm số mục hợp lệ, hiện cảnh báo trùng/quá dài; ẩn danh sách mẫu và nhãn "dữ liệu mẫu". `PartnerAssignConfig.accountIds` mang các chuỗi query này.
- **Diff (engine mode):** cột "đã có" hiện `Chưa đọc` (`DiffOp 'unknown'`), không dùng `SAMPLE_EXISTING_TASKS`; dòng chú: "Engine sẽ bỏ qua TKQC đã có partner nếu nhận ra khi chạy".
- **Result:** thêm trạng thái target `unverified` + cảnh báo; hiển thị `error.code`; nút **Sao chép mã lỗi** (đã có `CopyButton`) kèm `runId`, `stepIndex`, `code`, `lang` để user gửi lại.
- **Run:** khi `surface` sai hiện hướng dẫn "Mở Cài đặt doanh nghiệp (`business.facebook.com/latest/settings`) rồi chạy lại".
- **Options › Devtest:** thêm cờ `useSimulator` và nút "Gỡ khoá khẩn cấp". Thêm key i18n vi/en tương ứng.

## 10. Manifest & quyền

- Content script đã khớp `https://business.facebook.com/*`. Chrome nhận `tabs.sendMessage` nhờ khớp này.
- **Firefox:** engine cần panel gọi được content script, nên lỗ hổng quyền host trên Firefox (`.claude/rules/extension-apis.md`) thành chặn thật. Đề xuất thêm `host_permissions: ['https://business.facebook.com/*']` vào `src/manifest.ts` (cùng origin đã có trong `content_scripts`, không nới phạm vi) và `browser_specific_settings.gecko.id`/`strict_min_version` ở `vite.config.ts`. **Đây là thay đổi quyền → chỉ làm sau khi `extension-security-reviewer` rà** và cần anh đồng ý (Q1).
- Không thêm `tabs`, `scripting`, `activeTab`.

## 11. Kiểm chứng

- **Test thuần** (script tạm ngoài repo, vì repo chưa có test runner): `normalizeText` (zero-width, NBSP), ma trận locator trên DOM giả (ẩn, trùng nhãn, strict), `validate` lệnh, ánh xạ outcome→audit, chunk audit, `writeBudget` theo ngày, jitter không cố định.
- **Gate:** `pnpm lint`, `tsc`, `lint:spell`, `pnpm build`, `pnpm build:firefox`; rồi `extension-security-reviewer` và `cross-browser-checker` (CLAUDE.md).
- **Thực địa (anh làm, BM staging):** Dry-run 1 TKQC → Dry-run 3 TKQC → Assist 1 TKQC (quyền `ADVERTISE,ANALYZE`) → chạy lại cùng input. Mỗi lỗi có mã + `stepIndex` + `key` để gửi em vá `labels.ts`/`selectors.ts`.

## 12. Tiêu chí chấp nhận

1. Dry-run: đi từ trang Settings tới wizard chọn tài sản, chọn đúng TKQC, tick quyền, **không bấm Assign**, đóng wizard; không có dòng ghi nào thay đổi trên BM.
2. Assist: dừng ở bước 6, không chạm nút Assign; sau khi user bấm và hộp thoại đóng thì verify; pending-approval không bị replay.
3. Đóng/mở panel giữa run: panel đồng bộ lại đúng trạng thái; Dừng kết thúc trong ≤ 1 step.
4. Không có phần tử extension nào trong DOM trang BM.
5. Nhãn không tìm thấy → dừng `ERR_LOCATE_TIMEOUT` có `key`, không click bừa; ≥ 2 ứng viên → `ERR_LOCATE_AMBIGUOUS`.
6. Mọi khoảng nghỉ đều ≥ sàn trong `parsePacing` và không hai khoảng nghỉ liên tiếp bằng nhau.
7. Mỗi target kết thúc có đúng một `AuditRow`; mặc định không chứa tên TKQC/ID partner.
8. `writeBudget` chỉ tăng ở Assist có target `done`, và về 0 sang ngày mới.
9. Checkpoint/đăng nhập/CAPTCHA làm run dừng và khoá Assist.
10. Lint, tsc, spell, build Chrome + Firefox qua; hai reviewer không còn lỗi mức cao.

## 12a. Ghi chú triển khai (bổ sung/lệch so với bản duyệt)

Q1–Q7 đã chốt theo cột "Đề xuất" (anh duyệt ngày 12/10/2026). Khi build có các điểm sau:

- **`run.clear`** là lệnh thứ năm trong `RunCommand` (xoá run đã kết thúc ở content script + `lastRun`); bị từ chối khi đang có run active.
- **Quyền không biểu diễn được trên UI:** nhãn "Manage campaigns" luôn kèm ANALYZE và Creative Hub nên cấu hình chỉ có `ADVERTISE` (không `ANALYZE`) bị từ chối `ERR_INVALID_CONFIG`, thay vì cấp dư quyền. `MANAGE` chọn nhãn "Manage ad account" (bao trọn mọi công tắc). Quyền Meta tự bật thuộc các gói này không bị coi là quyền dư; công tắc ngoài gói đang bật vẫn bị từ chối.
- **Cỡ mẻ** = `min(10, pacing.limits.standard.maxBatch)`.
- **Nhiều TKQC đã đủ quyền:** nếu cả mẻ đều `skipped-existing` thì engine huỷ wizard, bước 5–7 `skipped`, sang mẻ sau (không đòi user bấm Assign).
- **Kết thúc run:** có ít nhất một target `done`/`skipped-existing` → `done` (target lỗi vẫn hiện `failed` kèm mã); không target nào → `failed` với mã của target đầu; có `pending-approval` → dừng toàn run; có `unverified` → `failed` `ERR_VERIFY_UNREADABLE`.
- **Watcher "dialog lạ"** chỉ theo từ khoá (checkpoint/danh tính/CAPTCHA/hết phiên/chặn tần suất) trên dialog và alert mới mount; chưa có nhận diện dialog lạ tổng quát. Dialog còn sót trước khi chạy → `ERR_UNEXPECTED_DIALOG`.
- **Jitter** chỉ kéo dài (không bao giờ ngắn hơn delay nền), phân phối đuôi phải cắt cụt ở ×(1 + 3·jitter); chưa có "long pause" ngẫu nhiên.
- **`store.ts`** gọi `parseDevtest(..., isDev = false)` vì `import.meta.env` không dùng trong content script; `isDev` chỉ đổi mặc định cờ `devtest`.
- Hook `useRunEngine` chỉ bật khi Devtest đã đọc xong; `useSimulator` chỉ có tác dụng khi `devtest` bật.
- **Ngân sách (lệch spec):** Assist tính 1 lần ghi khi có target `done`, `pending-approval` hoặc `unverified` (spec gốc chỉ tính `done`), vì đếm thừa an toàn hơn đếm thiếu. Một run nhiều mẻ vẫn tính 1 lần (đúng §5.1); reviewer đề xuất tính theo mẻ, chờ anh quyết.
- **Mất phiên** (`ERR_LOGGED_OUT`) chỉ dừng run, không khoá khẩn cấp; chỉ `ERR_CHECKPOINT` khoá. `ERR_RATE_LIMITED` đặt khoá 24 h.
- **Run kết thúc bất thường sau khi tới bước chờ Assign:** target còn `running` chuyển `unverified` trước khi ghi audit/ngân sách.
- **Verify (bước 7):** đọc danh sách TKQC trong chi tiết đúng partner ID, tab "Tài sản bạn đã chỉ định" phải được chọn. `done` khi đúng một hàng TKQC có ID/tên trùng token lấy từ hàng đã chọn, kể cả chi tiết đã mở sẵn sau Assign; ngược lại `unverified`, không bao giờ thử lại.
- **Pending-approval:** chỉ cụm nhiều từ, và chỉ tính nếu cụm chưa có trong văn bản lúc bắt đầu chờ.
- **Nguồn lệnh:** content script chỉ nhận `run.*` khi `sender.url` thuộc extension (không dựa vào `sender.tab`).
- **Sau security review và kiểm chứng UI:** (a) Chọn `accessPartial` nếu có nút; UI chỉ có tiêu đề thì tick công tắc trực tiếp. Đọc lại bốn công tắc quyền, quyền ngoài gói đang bật hoặc quyền cần có không bật được → `ERR_PERMISSION_MISMATCH`. (b) Khớp TKQC sau search: ID chọn tài sản đầu tiên; tên khớp chính xác, nên `Shop Lan 1` không khớp `Shop Lan 10`. (c) Dry-run lỗi giữa chừng thì cố huỷ wizard (best-effort; Dừng/tín hiệu nguy hiểm không huỷ). (d) `lastRun` ở mức log `off` không lưu tên/ID TKQC hay BM ID. (e) `lang` của trang chỉ nhận dạng mã ngắn. (f) Dedupe query dùng cùng cách gộp dấu gạch như khi khớp.
- **Manifest Firefox** (Q1, sau khi reviewer rà): `host_permissions` chỉ đặt trong `firefoxSpecificManifest`, kèm `gecko.id` cố định, `strict_min_version` 127 và `data_collection_permissions: none` (đúng khi font Google tự host, xem việc còn lại). Chưa có nút `permissions.request` khi user thu hồi quyền.

Kiểm chứng đã chạy (script tạm ngoài repo, jsdom + `chrome.*` giả): 97 kiểm tra thuần (chuẩn hoá nhãn, delay, tín hiệu, validate, ánh xạ quyền, audit/budget, locator, primitives) và 61 kiểm tra end-to-end trên BM giả (Dry không ghi, Assist không bấm Assign, pending-approval, unverified, ambiguous/not-found, checkpoint → khoá khẩn cấp, budget/curfew/rate-limit, tab ẩn, Dừng, nhiều mẻ). **Chưa chạy trên BM thật.**

## 13. Câu hỏi mở

| #   | Câu hỏi                                                                                       | Đề xuất                                                                                                                  |
| :-- | :-------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| Q1  | Thêm `host_permissions` BM cho Firefox trong đợt này?                                         | Có, sau khi `extension-security-reviewer` rà. Chrome không đổi.                                                          |
| Q2  | Bỏ `hasFocus` khỏi cổng "visible + focus" (vì side panel giữ focus)?                          | Bỏ, chỉ giữ `visibilityState`. Ghi lại khác biệt với PRD FR-06 và cập nhật PRD sau khi thử thực địa.                     |
| Q3  | Tên BM nguồn/ID BM thật đưa vào audit khi nào?                                                | Để sau, khi có nhận diện BM (FR-08). Hiện `BM nguồn`.                                                                    |
| Q4  | Policy gate (budget/curfew/emergency) đặt ở content script hay background broker như file 21? | Content script trong đợt này (đủ cho Dry/Assist, không phụ thuộc SW chết). Chuyển broker khi làm Full/popup kill-switch. |
| Q5  | Khoá liên tab cho run và `writeBudget`?                                                       | Chưa. Mỗi panel ghim một tab; ghi rủi ro "hai panel cùng chạy". Làm khi có broker.                                       |
| Q6  | Walk-through lần đầu trên một BM (FR-05, file 19 §8)?                                         | Assist vốn đã là user tự bấm Assign nên đủ cho đợt này; walk-through thật làm cùng Full.                                 |
| Q7  | Khi nhãn Assign/`dialog.*` chưa kiểm chứng, có cho Assist chạy hay chặn cứng tới khi probe?   | Cho chạy: Assist không tự bấm gì ở bước ghi; mọi bước trước đó là chọn/tick có thể huỷ. Dry-run là bài kiểm đầu.         |
