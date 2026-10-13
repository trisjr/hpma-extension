---
id: SPEC-UI-003
type: technical-spec
status: approved
created: 2026-10-12
approved: 2026-10-13
source: docs/040-Design/project/Diff.dc.html
related: [SPEC-UI-001, SPEC-UI-002, PRD-001, DES-001]
---

# SPEC-UI-003 — Diff, Run (Dry-run/Assist) và Result của flow "Gán partner vào TKQC"

> Nguồn thiết kế: `Diff.dc.html`, `Diff320.dc.html`, `RunDryRun.dc.html`, `RunAssist.dc.html`, `ResultDone.dc.html`, `ResultPending.dc.html`, `ResultFailed.dc.html`; tham chiếu trạng thái: `StateDisconnected.dc.html`, `StateCurfew.dc.html`. Yêu cầu: PRD-001 FR-03 (step-engine), FR-04, FR-05, FR-06, FR-07. Điểm vào: nút chạy ở bước 4 của SPEC-UI-002 §8.4.

## 1. Mục đích & phạm vi

Sau khi cấu hình xong (SPEC-UI-002), user **xem trước thay đổi (Diff)**, **chạy** ở Dry-run hoặc Assist và **đọc kết quả (Result)**. Spec này định nghĩa 3 màn và mô hình **run state** dùng chung, để UI dựng được trước khi có engine.

**Trong phạm vi:** Diff, Run Dry-run, Run Assist, Result `done` / `pending-approval` / `failed`, hai trạng thái chặn (mất kết nối, curfew) hiện trong Run.

**Ngoài phạm vi (chốt sau):** Run Full (`RunFull`), `ConfirmStep1/2/Batch`, màn Log, Probe, Options. Full vẫn bị khoá (SPEC-UI-001 §6). Nút "Gỡ lại (undo)" trên Result chỉ hiện dạng khoá/ẩn vì cần Full + FR-09.

## 2. Quyết định kiến trúc: run state mô phỏng (có nhãn)

Chưa có engine, content script chưa có handler flow. Để dựng và duyệt UI:

- Định nghĩa **`RunState`** (§3) ở `src/shared/run.ts` làm hợp đồng giữa UI và engine thật sau này.
- Một **simulator** `src/shared/hooks/useRunSimulator.ts` phát `RunState` theo thời gian (dry-run: 7 bước × 4 TKQC, Assist: dừng ở bước ghi chờ user, các nhánh `failed`/`pending` chọn bằng kịch bản). **Mọi màn Run/Result phải hiện chip `Mô phỏng`** (nền trung tính, `role="note"`) cho tới khi engine thật thay simulator; không để user hiểu nhầm là đã thao tác trên BM.
- Simulator **không** gửi message tới content script và **không** chạm DOM `business.facebook.com` (NFR-02). UI chỉ phụ thuộc `RunState` + hàm điều khiển (`start/stop/resume`), nên thay engine không đổi UI.
- Diff cũng mô phỏng: tính từ `PartnerAssignConfig` + "partner đã có" giả lập theo ID TKQC (cùng nguồn mẫu với `useAdAccounts`). Khi có FR-08, "đã có partner" lấy từ đọc kiểm kê.

## 3. Mô hình dữ liệu

```ts
type RunPhase = 'locate' | 'act' | 'verify';
type PhaseState = 'idle' | 'run' | 'done' | 'wait' | 'skip' | 'fail';
type StepState =
  | 'pending'
  | 'running'
  | 'ok'
  | 'waiting'
  | 'skipped'
  | 'failed';

type RunStep = {
  index: number; // 1..7
  titleKey: MessageKey;
  state: StepState;
  phases: Record<RunPhase, PhaseState>;
  isWrite: boolean; // 'bước ghi'
};

type TargetOutcome =
  | 'done'
  | 'skipped-existing'
  | 'failed'
  | 'pending-approval'
  | 'queued'
  | 'running';

type RunTarget = {
  accountId: string;
  name: string;
  outcome: TargetOutcome;
  detail?: string;
};

type RunStatus =
  | 'running'
  | 'waiting-user'
  | 'paused'
  | 'done'
  | 'pending-approval'
  | 'failed'
  | 'stopped';

type RunState = {
  runId: string; // 'run_' + 6 hex
  mode: 'dry' | 'assist'; // 'full' ngoài phạm vi
  status: RunStatus;
  startedAt: number; // epoch ms
  targets: RunTarget[];
  currentTarget: number; // 0-based
  steps: RunStep[]; // 7 bước của TKQC hiện tại
  error?: { code: string; stepIndex: number; message: string };
};
```

7 bước của mỗi TKQC (khớp artboard): (1) Mở Cài đặt BM › Tài khoản quảng cáo, (2) Chọn TKQC, (3) Mở hộp thoại Assign partners, (4) Nhập BM ID đối tác, (5) Tick quyền, (6) Bấm Assign (**bước ghi**), (7) Verify readback. Mỗi bước có 3 phase `locate → act → verify`.

Quy tắc theo mode (FR-03):

- **Dry-run:** bước 6 `skipped`, bước 7 `skipped` (nhãn `skipped (dry-run)`); không bao giờ có bước ghi thật.
- **Assist:** chạy tới bước 5, bước 6 `waiting` (user tự bấm Assign trong tab BM); khi "hộp thoại đóng" thì sang bước 7 verify. Không thêm nút/overlay nào vào trang BM.

`runId` hiển thị cho user, không nhạy cảm. Không lưu token/cookie trong `RunState`.

## 4. Khung chung của màn Run/Result

Dùng lại header + tab nav + footer (SPEC-UI-001). Tab nav ở tab **Run** (`aria-current="page"`). Khi có run đang chạy, mode switch ở header: mode không chọn `disabled` (SPEC-UI-001 §4.2).

Điều hướng trong tab Run (state ở `SidePanel`, không thêm router):

```
Wizard bước 4 ──[nút chạy]──▶ Run (theo mode)
Wizard bước 4 ──[Xem trước diff]──▶ Diff ──[Quay lại sửa cấu hình]──▶ Wizard bước 4
Diff ──[Tiếp tục · xác nhận 2 lớp]──▶ (Full: ConfirmStep1, ngoài phạm vi; ẩn/khoá)
Run ──[kết thúc]──▶ Result
Result ──[Xong]──▶ Flows (xoá bản nháp, §9.1 SPEC-UI-002)
```

Tab `Run` khi không có run đang chạy: hiện `ComingSoon`-style rỗng "Chưa có lần chạy nào" + nút về Flows (màn `StateEmpty`, ngoài phạm vi chi tiết).

## 5. Màn Diff (`Diff` / `Diff320`)

Bề rộng 360, tương thích 320 (`Diff320`): bảng không cuộn ngang, chữ xuống dòng.

### 5.1. Cấu trúc

| Vùng              | Nội dung                                                                                                                                                                             |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link trên         | `‹ Run` (về Run nếu mở từ Run; về wizard bước 4 nếu mở từ bước 4).                                                                                                                   |
| Tiêu đề           | `h1 "Xem trước thay đổi"`; dòng phụ `Gán partner · từ Dry-run <runId> · <giờ>` (nếu mở từ một run) hoặc `Gán partner · theo cấu hình hiện tại` (từ wizard).                          |
| Chip tổng hợp     | 4 ô: `+n thêm`, `~n thay đổi`, `−n gỡ`, `=n bỏ qua`. Tổng 4 ô = số TKQC đã chọn.                                                                                                     |
| Bảng diff         | `section[aria-label]`: hàng đầu `BM đối tác` (tên + ID), tiêu đề cột `TKQC · quyền` / `Thao tác`, rồi danh sách `<ul>` mỗi TKQC một `<li>`.                                          |
| Ghi chú ngân sách | "Sẽ ghi trên <n> TKQC, dùng 1 trong <còn lại> lượt ghi còn lại hôm nay." (đã chốt SPEC-UI-002 Q4: cả lượt chạy tính **1** lượt ghi; artboard ghi `3 trong 17` là số cũ, không theo). |
| Hành động         | Primary `Tiếp tục · xác nhận 2 lớp` (chỉ có nghĩa với Full), ghost `Quay lại sửa cấu hình`.                                                                                          |

### 5.2. Hàng diff

| Thao tác | Dấu      | Điều kiện                                                             | Chip quyền                                                                                           |
| :------- | :------- | :-------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| Thêm     | `+` xanh | TKQC chưa có partner                                                  | mỗi quyền sắp gán `+ <nhãn>` nền xanh                                                                |
| Thay đổi | `~` vàng | Đã có partner nhưng thiếu một số quyền                                | quyền đã có: nhãn xám, quyền thêm: `+ <nhãn>` xanh; ghi chú "Partner đã có <x>, chỉ thêm <k> quyền." |
| Gỡ       | `−` đỏ   | Không dùng trong flow gán (giữ ô đếm `−0` cho thống nhất với flow gỡ) | n/a                                                                                                  |
| Bỏ qua   | `=` xám  | Đã đủ quyền (idempotent, FR-04)                                       | nhãn xám; ghi chú "Đã tồn tại đủ quyền, bỏ qua (idempotent)."                                        |

- Dấu (`+ ~ − =`) kèm nhãn chữ `Thêm / Thay đổi / Bỏ qua`, không chỉ dùng màu.
- Hàng `bỏ qua` nền nhạt hơn. Thứ tự hàng theo thứ tự TKQC đã chọn.
- Nếu **tất cả** hàng là `bỏ qua`: hiện thông báo "Không có gì để thay đổi. Mọi TKQC đã có đủ quyền." và **ẩn** `Tiếp tục · xác nhận 2 lớp`.
- Quyền `MANAGE` trong chip có thêm nhãn `quyền cao` (cam), và cảnh báo quyền cao của SPEC-UI-002 §7.3 lặp lại dưới bảng.

### 5.3. Khoá hành động

`Tiếp tục · xác nhận 2 lớp` **luôn `disabled`** khi Full bị khoá, kèm dòng giải thích "Full đang khoá, chỉ chạy thử hoặc Assist" (`aria-describedby`). Không thể bỏ qua lớp xác nhận (FR-05).

## 6. Màn Run (`RunDryRun` / `RunAssist`)

### 6.1. Cấu trúc

| Vùng                          | Dry-run                                                                                                                                                                                         | Assist                                                                                                                                                                                    |
| :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Banner mode (`role="status"`) | `Dry-run · Không thay đổi BM` + "Điều hướng và điền form thật, bỏ mọi bước ghi. Kết quả là diff để bạn duyệt." (nền xanh lá nhạt)                                                               | `Assist · Bạn bấm bước cuối` + "Panel dẫn tới trước nút ghi rồi dừng. Không có gì được chèn vào trang BM." (nền vàng nhạt)                                                                |
| Thẻ run                       | `h1` tên flow + chip trạng thái (`Đang chạy`), `dl`: `runId`, `Bắt đầu`, `Đã chạy mm:ss` (tick mỗi giây). Thanh `TKQC i/n · <tên>` + `Bước k/7`; dải phân đoạn tiến độ theo từng TKQC (n đoạn). | cùng, chip `Đang chờ bạn` khi `waiting-user`.                                                                                                                                             |
| Khối "Bước tiếp theo"         | không có                                                                                                                                                                                        | `h2 "Bấm Assign trong tab BM"` + danh sách 3 việc (chuyển tab BM, kiểm hộp thoại: BM ID + quyền, bấm Assign) + dòng `Đang chờ bạn bấm Assign…` với đồng hồ chờ + nút `Chuyển tới tab BM`. |
| Danh sách bước                | `<ol>` 7 bước, mỗi hàng: biểu tượng trạng thái, tiêu đề, nhãn trạng thái, 3 chip phase (`locate/act/verify`), chip `bước ghi` ở bước 6.                                                         | cùng.                                                                                                                                                                                     |
| "Sẽ làm gì (đến lúc này)"     | Danh sách dòng diff đã tích luỹ + link `Xem diff đầy đủ` → Diff.                                                                                                                                | không có (Assist: user tự ghi).                                                                                                                                                           |
| Hành động                     | Nút `Dừng`.                                                                                                                                                                                     | Nút `Dừng`.                                                                                                                                                                               |

### 6.2. Trạng thái bước

| `StepState` | Biểu tượng         | Nhãn                | Hàng            |
| :---------- | :----------------- | :------------------ | :-------------- |
| ok          | ✓ xanh             | `ok`                | trắng           |
| running     | spinner xanh dương | `đang chạy`         | xanh dương nhạt |
| waiting     | tay/đồng hồ vàng   | `chờ bạn`           | vàng nhạt       |
| skipped     | vòng nét đứt xám   | `skipped (dry-run)` | xám nhạt        |
| failed      | ✕ đỏ               | `fail`              | đỏ nhạt         |
| pending     | số thứ tự          | `chờ`               | trắng           |

Màu chỉ phụ trợ: luôn có biểu tượng khác hình + nhãn chữ. Spinner tôn trọng `prefers-reduced-motion` (thay bằng chấm tĩnh).

### 6.3. Điều khiển

- **Dừng:** đổi `status` → `stopped`, dừng simulator/engine sau bước hiện tại, sang Result dạng `stopped` (dùng khung `failed` nhẹ, lý do "Bạn đã dừng"). Dry-run dừng không để lại gì trên BM.
- **Kill-switch** ở footer vẫn là đường dừng khẩn; handler nối ở M2 (chưa làm trong spec này).
- **Chuyển tới tab BM:** cần `tabs.update`/`windows.update` (quyền `tabs` chưa có trong manifest, NFR-03). Cho tới khi chốt quyền, nút này **ẩn** ở Assist mô phỏng và thay bằng hướng dẫn chữ; xem Q2.

### 6.4. Trạng thái chặn

| Tình huống                  | Hiển thị (theo artboard)                                                                                                                                                                                                                                 |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mất kết nối tab BM giữa run | `status: paused`; thẻ "Mất kết nối với tab BM — Run tạm dừng an toàn và chưa ghi gì"; nút `Kết nối lại (re-sync)` (đọc lại trang, kiểm đúng BM, tiếp tục cùng bước, cùng mode) và `Chọn tab BM khác` (nếu đổi sang BM khác thì **huỷ run**, không đoán). |
| Curfew 0h–6h (Assist/Full)  | Chặn **trước** khi vào Run, ở nút chạy bước 4 (đã có ở SPEC-UI-002 §8.4); Dry-run vẫn chạy được ("Chạy thử vẫn được"). Màn `StateCurfew` hiện khi user vào tab Run trong curfew mà không có run.                                                         |

## 7. Màn Result

Mọi Result hiện: khối trạng thái đầu trang, danh sách kết quả từng TKQC, chip `Mô phỏng`, và hành động kết thúc `Xong` → Flows.

### 7.1. Khối trạng thái

| `status`         | Mã                 | Tiêu đề                                                       | Vai trò ARIA | Màu  |
| :--------------- | :----------------- | :------------------------------------------------------------ | :----------- | :--- |
| done             | `done`             | `Hoàn tất · <w> ghi, <s> bỏ qua`                              | `status`     | xanh |
| pending-approval | `pending-approval` | `Chờ admin thứ 2 duyệt`                                       | `status`     | vàng |
| failed           | `failed`           | `Dừng ở bước <k> · <tên bước>` + `TKQC i/n · <runId> · <giờ>` | `alert`      | đỏ   |
| stopped          | `stopped`          | `Đã dừng bởi bạn`                                             | `status`     | xám  |

Dòng phụ chung: `<runId> · <bắt đầu> → <kết thúc>`.

### 7.2. Danh sách kết quả từng TKQC

`<ul aria-label="Kết quả từng TKQC">`, mỗi `<li>`: chấm trạng thái, tên, `detail`, nhãn trạng thái (`done · verify khớp`, `đã có · bỏ qua`, `lỗi`, `chờ duyệt`, `chưa chạy`). Mọi `TargetOutcome` có nhãn chữ riêng.

### 7.3. Biến thể

- **done:** thêm khối `Verify-readback · <tên TKQC>` (`<pre>` đọc lại: giờ, `act_…`, partner, quyền, `so khớp k/k đúng như diff`) + nút `Copy`; link `Xem readback các TKQC còn lại trong Log`; link `Mở audit log của lần chạy này`; khối `Cần hoàn tác?` với nút `Gỡ lại (undo) <n> TKQC` ở trạng thái **khoá** (cần Full, FR-09; xem Q3).
- **pending-approval:** đoạn giải thích; khung nhấn mạnh **"Extension sẽ không chạy lại. Bấm lại sẽ tạo yêu cầu trùng"**; nút `Kiểm tra lại trạng thái` (chỉ đọc, không gửi yêu cầu mới) kèm `Lần kiểm tra cuối <giờ>`; nút `Copy lời nhắc gửi admin`. **Không có nút chạy lại** ở màn này (FR-04: pending không replay).
- **failed:** khối `Lý do` (câu người đọc được + `<pre>` mã lỗi `ERR_*`, bước, selector, readback) + `Copy lỗi` + `Xem trong Log`; gợi ý khắc phục; link `Cấu hình lại cho <n> TKQC chưa xong` (về wizard bước 2 với chỉ các TKQC chưa xong); khối `<TKQC> đã được gán trước khi lỗi xảy ra` + `Gỡ lại (undo)` khoá như trên. Verify-readback phải nói rõ TKQC lỗi **chưa bị thay đổi** hay đã đổi.

## 8. Ràng buộc an toàn

1. **Không bao giờ ghi.** Spec này chỉ có Dry-run và Assist; Dry-run bỏ mọi bước `isWrite`; Assist dừng trước bước ghi. Simulator không có đường code ghi; khi engine thật nối vào, bước ghi chỉ được gọi từ mode Full qua đủ 2 lớp xác nhận (engine tái kiểm tra, không tin UI).
2. **Không UI trong trang BM.** Mọi hướng dẫn Assist nằm ở side panel (NFR-02).
3. `pending-approval` **không replay**; `failed` không có nút "thử lại ngay" ghi.
4. Nội dung copy (lỗi, readback, lời nhắc) không chứa token/cookie/ID phiên; chỉ BM ID, `act_…`, tên, mã lỗi.
5. `runId` và log chỉ lưu cục bộ. Lưu run đã hoàn tất vào `storage.local` (`lastRun`) để mở lại Result sau khi đóng panel; xoá khi bắt đầu run mới.

## 9. i18n

Nhóm key mới `run.*`, `diff.*`, `result.*` trong `src/shared/i18n.ts`, VI mặc định, EN song song; số/tên truyền qua tham số `translate(lang, key, params)`. Tên bước dùng key `run.step.1…7`. Mã (`ERR_*`, `locate/act/verify`, `runId`) giữ nguyên, không dịch.

## 10. Accessibility

- Banner mode, thẻ trạng thái, đồng hồ chờ: `role="status"`; Result `failed`: `role="alert"`.
- Danh sách bước là `<ol>`; trạng thái đọc được bằng chữ, không chỉ màu/biểu tượng. Bước hiện tại có `aria-current="step"`.
- Tiến độ run: cập nhật qua một vùng `aria-live="polite"` duy nhất (ví dụ "TKQC 1/4, bước 5/7"); **không** thông báo mỗi giây của đồng hồ.
- Diff: dấu `+ ~ − =` ẩn khỏi trình đọc (`aria-hidden`), nhãn chữ `Thêm/Thay đổi/Bỏ qua` đọc được; hàng có tên + ID + quyền trong một nhóm.
- Nút `Copy` báo kết quả qua `aria-live` ("Đã sao chép"), không dùng toast mất tiêu điểm.
- Mọi nút ≥ 36px; focus hiển thị rõ; chuyển màn đưa focus về `h1` của màn mới.
- Tương phản ≥ 4.5:1 ở light và dark; 320 px không cuộn ngang.

## 11. Trạng thái toàn cục

| Tình huống                            | Hành vi                                                                                                                                                                   |
| :------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Đóng/mở lại panel giữa run (mô phỏng) | Run mô phỏng **không** tiếp tục (simulator chỉ sống trong phiên panel); mở lại thấy Result `stopped` hoặc Flows. Engine thật sẽ re-hydrate từ background (ngoài phạm vi). |
| Đổi ngôn ngữ giữa run                 | Giữ nguyên `RunState`, chỉ đổi chuỗi.                                                                                                                                     |
| Dark theme                            | Dùng biến màu theme; màu trạng thái giữ ngữ nghĩa.                                                                                                                        |
| `n` TKQC = 0                          | Không thể tới đây (wizard chặn); nếu có, Diff hiện trạng thái rỗng.                                                                                                       |

## 12. Tiêu chí chấp nhận

1. Nút `Xem trước diff` ở bước 4 mở Diff; `Quay lại sửa cấu hình` về đúng bước 4 với dữ liệu nguyên vẹn.
2. Diff: 4 chip đếm khớp tổng số TKQC; mỗi hàng đúng dấu/nhãn/quyền; tất cả `bỏ qua` thì ẩn nút xác nhận; ghi chú ngân sách luôn nói "1 lượt ghi".
3. Nút `Tiếp tục · xác nhận 2 lớp` luôn bị khoá khi Full khoá và có lý do đọc được.
4. Nút chạy ở bước 4 (Dry-run) dẫn tới `RunDryRun`; 7 bước chạy tuần tự qua từng TKQC; bước 6/7 hiện `skipped (dry-run)`; kết thúc sang Result.
5. Assist: dừng ở bước 6 với trạng thái `chờ bạn` và khối "Bước tiếp theo"; đồng hồ chờ chạy; sau "bước ghi" do user xác nhận (mô phỏng) sang verify rồi Result.
6. `Dừng` kết thúc run ngay sau bước hiện tại và hiện Result `stopped`; mode switch bị `disabled` khi đang chạy.
7. Result `done`, `pending-approval`, `failed` hiển thị đúng khối riêng (§7.3); `pending-approval` không có nút chạy lại; `failed` nói rõ BM đã đổi hay chưa.
8. Mọi màn Run/Result hiện chip `Mô phỏng`; không có message nào gửi tới content script/tab BM từ simulator.
9. Mất kết nối giữa run (giả lập) hiện thẻ tạm dừng với `Kết nối lại` và `Chọn tab BM khác`; không ghi gì.
10. VI/EN đủ key; đổi ngôn ngữ giữa run không mất trạng thái.
11. `pnpm lint`, `tsc`, `lint:spell`, `pnpm build`, `pnpm build:firefox` pass; bố cục đúng 320/360/420 px, light và dark.

## 13. Câu hỏi mở

| #   | Câu hỏi                                                                                                | Đề xuất                                                                                                                      |
| :-- | :----------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Run state do ai giữ khi có engine thật: background (sống qua đóng panel) hay content script?           | Background broker, panel chỉ subscribe (file 21). Spec này giữ hợp đồng `RunState` để đổi nguồn không đổi UI.                |
| Q2  | ~~Nút `Chuyển tới tab BM`: xin quyền `tabs` hay hướng dẫn chữ?~~                                       | **Đã chốt: chưa xin quyền (NFR-03), dùng hướng dẫn chữ.** Xét lại cùng Q3 của SPEC-UI-001 và `extension-security-reviewer`.  |
| Q3  | ~~Nút `Gỡ lại (undo)`: khoá hay ẩn khi FR-09 chưa có?~~                                                | **Đã chốt: hiện dạng khoá, chú thích "Cần Full và flow Gỡ partner".**                                                        |
| Q4  | ~~Simulator chọn nhánh bằng cách nào?~~                                                                | **Đã chốt: công tắc ở Options › Devtest là đích cuối.** Tới khi Options có (SPEC-UI-004), giữ `?scenario=`; mặc định `done`. |
| Q5  | Lưu lịch sử run: chỉ `lastRun` hay danh sách?                                                          | Chỉ `lastRun` cho đến khi có Log/audit (FR-07).                                                                              |
| Q6  | "Từ Dry-run `<runId>`" ở Diff: Diff luôn dựa trên kết quả dry-run gần nhất hay trên cấu hình hiện tại? | Nếu có dry-run gần nhất khớp cấu hình thì dùng, ngược lại tính theo cấu hình và ghi rõ nguồn.                                |
