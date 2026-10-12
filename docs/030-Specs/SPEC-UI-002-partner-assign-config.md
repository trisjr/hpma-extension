---
id: SPEC-UI-002
type: technical-spec
status: draft
created: 2026-10-12
source: docs/040-Design/project/FlowConfig.dc.html
related: [SPEC-UI-001, PRD-001, DES-001]
---

# SPEC-UI-002 — Cấu hình flow "Gán partner vào TKQC" (side panel, wizard 4 bước)

> Nguồn thiết kế: artboard `FlowConfig.dc.html` (bước 1), `FlowConfigAccounts.dc.html` (bước 2), `FlowConfigPerms.dc.html` (bước 3), `FlowConfigReview.dc.html` (bước 4), 360 px. Yêu cầu: PRD-001 FR-04 (flow), FR-05 (HITL), FR-06 (ngân sách ghi). Mapping quyền: `050-Research/14-partner-assign-mapping-graphql.md` §2.1. Điểm vào: card `partner-assign` ở SPEC-UI-001 (`hasConfig: true`).

## 1. Mục đích

Wizard thu thập **đầu vào của flow** `partner-assign` (BM đối tác, danh sách TKQC, tập quyền) và cho user chọn mode trước khi chạy. Bước 1–3 **chỉ lưu cấu hình, không ghi gì lên BM**. Bước 4 chuyển sang màn Run (ngoài phạm vi spec này).

Flow thuộc tier **Ghi nhạy cảm — duyệt 2 lớp**; chip tier hiện ở tiêu đề mọi bước.

## 2. Vị trí & phạm vi

- Bề mặt: side panel, thay vùng `main` của tab `Flows` (tab nav vẫn ở `Flows`). Header (BM, mode switch, tab nav) và footer (bộ đếm ghi + Kill-switch) dùng lại của SPEC-UI-001, không đổi.
- Không render gì vào DOM `business.facebook.com` (NFR-02).
- Ngoài phạm vi: màn Diff (`Diff.dc.html`), Confirm 1/2, Run, Result. Spec này chỉ định nghĩa điểm vào/ra của chúng ở §8.

## 3. Cấu trúc chung mỗi bước

```
┌ header (dùng chung) ─────────────────┐
├ main (cuộn) ─────────────────────────┤
│ ‹ Flows                              │  link quay về danh sách
│ Gán partner vào TKQC  [🛡 Duyệt 2 lớp]│
│ (mô tả — chỉ bước 1)                 │
│ Bước n/4                             │
│ ●─────●─────○─────○   stepper        │
│ [tóm tắt bước đã xong — bước 2, 3]   │
│ <section nội dung bước>              │
├ action bar (cố định) ────────────────┤
│ hint ········································│
│ [Huỷ | Quay lại]        [Tiếp · …]   │
├ footer (dùng chung, 54px) ───────────┤
└──────────────────────────────────────┘
```

### 3.1. Stepper

`<nav aria-label="Các bước cấu hình">` + `<ol>` 4 mục: `1 · Đối tác`, `2 · TKQC`, `3 · Quyền`, `4 · Chạy`. Chữ `Bước n/4` ở trên.

| Trạng thái mục | Hiển thị                                         | Tương tác                                                                     |
| :------------- | :----------------------------------------------- | :---------------------------------------------------------------------------- |
| Hiện tại       | vạch đậm + nhãn `n · Tên`, `aria-current="step"` | không                                                                         |
| Đã xong        | vạch xong + dấu ✓ + tên (không số)               | `<a>` bấm để quay lại sửa; `aria-label` "Bước n, Tên: đã xong. Mở lại để sửa" |
| Chưa tới       | vạch nhạt + `n · Tên`                            | **không** bấm được (không nhảy cóc)                                           |

Chỉ cho quay lại bước đã xong. Sửa một bước đã xong **không xoá** dữ liệu các bước sau, nhưng bước sau được validate lại khi vào (ví dụ đổi BM ID thì danh sách TKQC đã chọn vẫn giữ; xem Q2).

### 3.2. Link "Flows" và nút Huỷ

- `‹ Flows` và `Huỷ` (bước 1) đều về màn Flows (SPEC-UI-001). Nếu đã nhập dữ liệu, giữ **bản nháp** (§6.1), không hỏi xác nhận.
- Từ bước 2 trở đi, nút trái là `‹ Quay lại` (về bước trước), không có `Huỷ`; muốn thoát dùng `‹ Flows`.

### 3.3. Action bar (cố định, trên footer)

| Phần tử  | Hành vi                                                                                                                                                     |
| :------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hint`   | Một dòng 12/16. Bình thường xám `#4b5563` nói **bước kế tiếp / tóm tắt**; khi chưa hợp lệ đổi sang đỏ `#b91c1c` nói **việc cần sửa**. `aria-live="polite"`. |
| Nút trái | `Huỷ` / `Quay lại` (xem §3.2).                                                                                                                              |
| Nút phải | `Tiếp · <bước kế>`. Hợp lệ: `<a>`/button primary. Chưa hợp lệ: `<button disabled>` (không ẩn, không đổi chữ). Bước 4: nút chạy (§7.4).                      |

Cao tối thiểu 36px cho mọi nút (`min touch target`). Không dùng toast để báo lỗi validate; lỗi nằm tại field và ở `hint`.

## 4. Mô hình dữ liệu (cấu hình flow)

```ts
type PartnerAssignConfig = {
  partnerBmId: string; // chuỗi số 15–17 ký tự (giữ string, ID > 2^53)
  accountIds: string[]; // 'act_…', thứ tự theo danh sách
  tasks: PartnerTask[]; // ≥ 1
};
type PartnerTask = 'ADVERTISE' | 'ANALYZE' | 'MANAGE';
```

- `PartnerTask` chỉ 3 giá trị đúng với 3 nhãn UI ở §7.3. **Không** đưa `DRAFT`/`AA_ANALYZE` vào UI (file 14 §2.1: không có nhãn UI, an toàn là không chủ động gán).
- Mapping nhãn BM ↔ task dùng cho engine: `Chạy quảng cáo`→`ADVERTISE`, `Phân tích`→`ANALYZE`, `Quản lý`→`MANAGE` (`MANAGE` tự kéo theo hai quyền kia ở phía Meta).
- Mode (`dry|assist|full`) **không** nằm trong config: nó thuộc về lần chạy, đặt ở mode switch của header (SPEC-UI-001 §4.2).

## 5. Bước 1 — BM đối tác (`FlowConfig`)

Section "BM đối tác nhận quyền", mô tả "Đối tác sẽ được cấp quyền trên TKQC bạn chọn ở bước sau."

| Phần tử              | Chi tiết                                                                                                                                                                                                                                   |
| :------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label                | `BM ID đối tác`, `for="bm-id"`.                                                                                                                                                                                                            |
| Input                | `type="text"`, `inputmode="numeric"`, `autocomplete="off"`, placeholder `15–17 chữ số`, `aria-describedby="bm-msg bm-help"`, `aria-invalid` theo validate. Không dùng `type="number"` (mất số 0 đầu, cuộn đổi giá trị, vượt độ chính xác). |
| Thông điệp `#bm-msg` | Icon + chữ, cạnh dưới input.                                                                                                                                                                                                               |
| Trợ giúp `#bm-help`  | "Đối tác lấy BM ID ở Cài đặt doanh nghiệp › Thông tin doanh nghiệp."                                                                                                                                                                       |
| Banner thông tin     | "Bước 1–3 chỉ lưu cấu hình. Chưa có gì được ghi lên BM cho tới khi bạn chạy và xác nhận." (icon `shield`, nền trung tính, không phải cảnh báo).                                                                                            |

### 5.1. Validate (`/^\d{15,17}$/`, FR-04)

Validate theo thời gian thực khi gõ, nhưng **chỉ hiện lỗi sau khi field đã được chạm** (blur hoặc đã gõ ≥ 1 ký tự). Thứ tự thông điệp:

| Điều kiện              | Thông điệp                                                   | Màu                               |
| :--------------------- | :----------------------------------------------------------- | :-------------------------------- |
| Rỗng                   | `Nhập BM ID đối tác (15–17 chữ số).`                         | đỏ `#b91c1c` (viền 2px `#dc2626`) |
| Có ký tự không phải số | `BM ID chỉ gồm chữ số.`                                      | đỏ                                |
| Sai độ dài             | `BM ID phải có 15–17 chữ số · đang có N.`                    | đỏ                                |
| Hợp lệ                 | `Hợp lệ · tên BM đối tác sẽ được đọc lại khi chạy.` + icon ✓ | xanh `#15803d`                    |

- Khi dán: tự `trim()` khoảng trắng đầu/cuối và bỏ ký tự vô hình (zero-width, NBSP) trước khi validate (bài học phát hiện 2, PRD §4.3). Nếu còn ký tự lạ thì báo `chỉ gồm chữ số`.
- "Hợp lệ" chỉ là hợp lệ **về định dạng**. Extension không xác minh BM ID tồn tại ở bước này (không có API); tên đối tác được đọc lại ở lúc chạy (Q1).
- Trạng thái nút: `Tiếp · Chọn TKQC` bật khi hợp lệ. Hint: hợp lệ → "Tiếp theo: chọn TKQC nhận partner"; sai → "Sửa BM ID đối tác để tiếp tục".
- Chặn nhập BM ID của **chính BM đang bám** (gán partner cho chính mình): báo `Đây là BM hiện tại, hãy nhập BM ID của đối tác.` Chỉ làm được khi đã biết BM ID hiện tại (Q1).

## 6. Bước 2 — TKQC (`FlowConfigAccounts`)

Phía trên: thẻ tóm tắt `BM đối tác · <bmId>` + link `Sửa` (về bước 1, `aria-label="Sửa BM đối tác"`).

Section "TKQC nhận partner", mô tả "TKQC đã có partner này sẽ được bỏ qua khi chạy." (idempotent skip, FR-04).

| Phần tử     | Chi tiết                                                                                                                                                                      |
| :---------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tìm         | `<input type="search" id="acc-search">` + label ẩn thị giác `Tìm TKQC`, placeholder `Tìm theo tên hoặc ID`. Lọc client-side theo tên hoặc ID, không phân biệt hoa thường/dấu. |
| Đếm         | `Đã chọn <b>n</b>/<tổng>` (mock: `/24`). Tổng = tổng TKQC của BM, không phải số đang hiển thị.                                                                                |
| Chọn tất cả | Nút text, nhãn đổi: `Chọn tất cả đang hoạt động` ↔ `Bỏ chọn tất cả`. Chỉ tác động lên TKQC **không bị chặn** (và đang khớp bộ lọc tìm).                                      |
| Dòng TKQC   | `<label>` bao checkbox + tên (13, 600) + ID `act_…` (12, xám, monospace tuỳ chọn) + chấm trạng thái và nhãn. Cả dòng bấm được (≥ 36px).                                       |
| Xem thêm    | Nút `Xem thêm <n> TKQC` ở cuối, tải trang kế (lazy-load kiểu SPA, PRD FR-08).                                                                                                 |

### 6.1. Trạng thái TKQC

| Trạng thái | Chấm           | Chọn được                                    | Ghi chú                                                                                                                |
| :--------- | :------------- | :------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| Hoạt động  | xanh `#22c55e` | Có                                           |                                                                                                                        |
| Bị hạn chế | đỏ `#ef4444`   | **Không** (checkbox `disabled`, dòng mờ 60%) | Meta không cho gán quyền trên TKQC bị hạn chế; hiện lý do qua nhãn trạng thái, không dùng chỉ màu để truyền thông tin. |

Các trạng thái khác của TKQC (đã tắt, chờ duyệt…) chưa có trong thiết kế: xử lý như `Bị hạn chế` cho tới khi có quyết định (Q3).

### 6.2. Nguồn dữ liệu danh sách TKQC

Danh sách lấy bằng **flow đọc kiểm kê** (FR-08) qua content script, read-only. Chưa có nguồn thì bước 2 ở trạng thái:

| Trạng thái          | Hiển thị                                                                                      |
| :------------------ | :-------------------------------------------------------------------------------------------- |
| Đang tải            | skeleton 5 dòng, `aria-busy="true"`; nút Tiếp `disabled`.                                     |
| Lỗi/chưa kết nối    | alert dùng lại thông báo `unreachable` (SPEC-UI-001 §7) + nút `Kiểm tra lại`; không cho Tiếp. |
| Rỗng                | "BM này chưa có TKQC nào." (không có gì để gán) + nút `Quay lại`.                             |
| Không khớp tìm kiếm | "Không có TKQC khớp “<từ khoá>”."                                                             |

### 6.3. Validate bước 2

- Hợp lệ khi `accountIds.length ≥ 1`.
- Hint: hợp lệ → `<n> TKQC sẽ nhận partner`; không chọn → "Chọn ít nhất 1 TKQC để tiếp tục" (đỏ).
- Lô lớn: nếu `n > 10` hiện dòng cảnh báo trung tính dưới đếm: "Hơn 10 TKQC: sẽ xác nhận theo từng mẻ 10." (FR-05, batch > N). Số TKQC không ảnh hưởng ngân sách ghi: cả lượt chạy tính 1 lượt ghi (đã chốt, §14 Q4).
- Nút Tiếp: `Tiếp · Chọn quyền`.

## 7. Bước 3 — Quyền (`FlowConfigPerms`)

Phía trên: hai thẻ tóm tắt có link `Sửa`: `BM đối tác · <id>` và `TKQC · <n> · <tên 1, tên 2, …>` (cắt gọn bằng `…` + `+k`; `aria-label="Sửa danh sách TKQC"`).

Section "Quyền cấp cho partner", mô tả "Áp dụng giống nhau cho cả <n> TKQC đã chọn." (cùng một tập quyền cho mọi TKQC, không cấu hình riêng từng TKQC trong MVP).

### 7.1. Danh sách quyền

3 checkbox, mỗi dòng: nhãn (600) + `<code>` task + mô tả; dòng cao có chip `quyền cao`.

| Nhãn           | Task        | Mô tả                                         | Cao            |
| :------------- | :---------- | :-------------------------------------------- | :------------- |
| Chạy quảng cáo | `ADVERTISE` | Tạo và sửa quảng cáo trên TKQC                |                |
| Phân tích      | `ANALYZE`   | Xem hiệu quả và báo cáo                       |                |
| Quản lý        | `MANAGE`    | Toàn quyền TKQC, gồm người dùng và thanh toán | ✔ `quyền cao` |

### 7.2. Mặc định

**Nguyên tắc quyền tối thiểu (PRD FR-04: "quyền thấp nhất `ADVERTISE,ANALYZE`")**: khi mở bước lần đầu, chỉ `ADVERTISE` và `ANALYZE` được tick; `MANAGE` **không** tick. _Lưu ý: artboard mock đang tick sẵn `MANAGE` để minh hoạ cảnh báo; không lấy đó làm mặc định (Q5)._

### 7.3. Cảnh báo quyền Quản lý

Khi `MANAGE` được tick, hiện `role="alert"` (nền cam, icon cảnh báo) ngay dưới danh sách:

> **Bạn đang cấp quyền Quản lý** — BM đối tác sẽ toàn quyền trên TKQC: thêm, xoá người dùng và đổi thanh toán. Chỉ cấp khi có hợp đồng.

- Không chặn, chỉ cảnh báo: đây đã là flow 2 lớp. Cảnh báo này xuất hiện lại ở diff (lớp 1) và ở bước gõ xác nhận (lớp 2).
- Tick `MANAGE` không tự tick/bỏ tick hai quyền kia trên UI (phía Meta `MANAGE` đã bao gồm chúng). Nhãn review vẫn liệt kê đúng những gì user tick.

### 7.4. Validate bước 3

- Hợp lệ khi có ≥ 1 quyền. Hint: hợp lệ → `<k> quyền` + (có `MANAGE` ? ` · có quyền cao`) + ` · tiếp theo chọn mode`; không chọn → "Chọn ít nhất 1 quyền để tiếp tục" (đỏ).
- Nút Tiếp: `Tiếp · Xem lại & chạy`.

## 8. Bước 4 — Mode & xem lại (`FlowConfigReview`)

### 8.1. Xem lại cấu hình

`<dl>` 3 hàng, mỗi hàng có link `Sửa` (đến đúng bước, `aria-label` tương ứng):

| `dt`         | `dd`                                                     | Sửa    |
| :----------- | :------------------------------------------------------- | :----- |
| `BM đối tác` | BM ID                                                    | bước 1 |
| `TKQC · n`   | danh sách tên, cắt gọn                                   | bước 2 |
| `Quyền · k`  | nhãn các quyền đã tick; chip `quyền cao` nếu có `MANAGE` | bước 3 |

### 8.2. Mode lần chạy này

Một thẻ đọc-only, màu theo mode đang chọn ở header (cùng bảng màu SPEC-UI-001 §4.2), dòng phụ "Đổi mode ở thanh trên cùng" (icon `chevronUp`/mũi tên trỏ lên header). **Không có control chọn mode thứ hai** trong thẻ (một nguồn sự thật: mode switch ở header).

| Mode    | Tiêu đề · tag          | Mô tả                                                                 |
| :------ | :--------------------- | :-------------------------------------------------------------------- |
| Dry-run | `Dry-run · Chạy thử`   | Điều hướng và điền form, bỏ mọi bước ghi. Không thay đổi BM.          |
| Assist  | `Assist · Dẫn tôi làm` | Dẫn tới trước nút Assign rồi dừng. Bạn tự bấm bước cuối trong tab BM. |
| Full    | `Full · Thực thi`      | Chạy hết, mỗi bước ghi đều verify-readback và có pacing. Sẽ ghi thật. |

- Full bị khoá → thẻ vẫn hiện mode đang chọn thực tế (không bao giờ là `full`; nếu state cũ là `full` mà đã khoá thì ép về `dry`) và hiện thêm khối thông tin khoá: "Full đang khoá: cần chạy Assist <n> lần nữa trên BM này (<đã>/<yêu cầu>). Probe <p>% và gate flow đã đạt." Số liệu lấy từ cùng điều kiện mở khoá ở SPEC-UI-001 §6 (ở mock là giá trị minh hoạ).

### 8.3. Xem trước diff

Link `Xem trước diff` (`Diff.dc.html`) mở màn Diff: bảng BM × TKQC × task set sẽ được gán, phân loại **sẽ gán / bỏ qua (đã có)**. Không bắt buộc ở Dry-run/Assist; là **lớp 1 bắt buộc** của Full (xem §9).

### 8.4. Nút chạy và hint

Nút phải là hành động chính, nhãn `<hành động> trên <n> TKQC`, màu theo mode:

| Mode    | Nhãn nút                  | Hint                                              | Đích           |
| :------ | :------------------------ | :------------------------------------------------ | :------------- |
| Dry-run | `Chạy thử trên n TKQC`    | "Không thay đổi BM · chỉ hiện diff “sẽ làm gì”"   | `RunDryRun`    |
| Assist  | `Dẫn tôi làm trên n TKQC` | "Bạn bấm bước cuối trong tab BM"                  | `RunAssist`    |
| Full    | `Thực thi trên n TKQC`    | "Sẽ ghi thật · cần xác nhận 2 lớp trước khi chạy" | `ConfirmStep1` |

- Nút chạy `disabled` khi: tab BM chưa kết nối; đang có run khác; curfew 0h–6h (với Assist/Full); ngân sách ghi còn 0, tức `used ≥ limit` (Assist/Full; một lượt chạy tính 1 lượt ghi bất kể số TKQC). Hint đỏ nêu đúng lý do, đồng bộ với các màn State\* tương ứng.
- Dry-run luôn chạy được khi đã kết nối (không ghi, không tính ngân sách).

## 9. Ràng buộc an toàn

1. **Không bao giờ ghi từ bước 1–3.** Nút `Tiếp` chỉ đổi state cục bộ.
2. Full đi qua `ConfirmStep1` (xem diff) → `ConfirmStep2` (gõ lại xác nhận). Thiếu lớp nào thì engine không chạy (FR-05). Màn chạy phải tái kiểm tra mode/lock phía engine (defense-in-depth), không tin state UI.
3. Batch `n > 10` TKQC: xác nhận theo mẻ (`ConfirmBatch`).
4. Đối chiếu idempotent: TKQC đã có partner này được **bỏ qua**, không gán lại; kết quả báo `done / pending-approval / failed` đúng FR-04.
5. Cấu hình lưu chỉ chứa ID công khai trong BM của chính user; không lưu token/cookie.

### 9.1. Bản nháp cấu hình

- Lưu `PartnerAssignConfig` + bước hiện tại vào `storage.local` key `flowDraft:partner-assign` khi đổi bất kỳ field nào (debounce ~300ms) để sống qua việc đóng side panel.
- Khôi phục khi mở lại wizard; bước hiện tại = bước **đầu tiên chưa hợp lệ**, tối đa bước 4.
- Xoá bản nháp sau khi chạy xong (`done`) hoặc khi user chủ động `Huỷ` ở bước 1 với field rỗng. Mặc định giữ khi `Huỷ`.
- Bản nháp gắn theo BM đang bám (BM ID hiện tại); chuyển BM thì không dùng bản nháp của BM khác (Q1).

## 10. i18n

Mọi chuỗi qua `translate(lang, key)` (`src/shared/i18n.ts`), VI mặc định, EN song song. Nhóm key mới đề xuất: `pa.title`, `pa.step.*`, `pa.bm.*`, `pa.acc.*`, `pa.perm.*`, `pa.review.*`, `pa.hint.*`, `pa.err.*`. Nhãn quyền tiếng Anh theo BM UI: `Run ads`, `Analyze`, `Manage`. Mã task (`ADVERTISE`…) giữ nguyên, không dịch. Số trong chuỗi truyền qua tham số, không nối chuỗi thủ công (cần helper `translate` có tham số, hiện chưa có).

## 11. Accessibility

- Mỗi bước là một `<section>` có `<h2>`; tiêu đề flow là `<h1>`. Chuyển bước: focus về `h2` của bước mới (`tabindex="-1"`), thông báo "Bước n/4" qua `aria-live`.
- Lỗi field: `aria-invalid` + `aria-describedby` trỏ `#bm-msg`; thông điệp hợp lệ/không hợp lệ không chỉ dùng màu (luôn có icon + chữ).
- Danh sách TKQC và quyền dùng `<label>` bao `<input type="checkbox">`; nhóm có `role="group"` + nhãn.
- Nút `disabled` ở action bar vẫn đọc được lý do ở `hint`; không dùng `aria-disabled` cho mục stepper chưa tới (không phải link).
- Tương phản ≥ 4.5:1 cho chữ trên cả light và dark; chấm trạng thái luôn kèm nhãn chữ.
- Phím: `Enter` trong input BM ID = `Tiếp` nếu hợp lệ; `Esc` không đóng wizard.

## 12. Trạng thái toàn cục

| Tình huống             | Hành vi                                                                                                                                      |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| Mất kết nối giữa chừng | Dữ liệu đã nhập giữ nguyên (nháp); bước 2 và 4 hiện alert `unreachable`, chặn Tiếp/Chạy. Bước 1 và 3 vẫn thao tác được (không phụ thuộc BM). |
| Đổi BM (tab khác)      | Wizard reset về bước 1 với nháp của BM mới (nếu có).                                                                                         |
| Side panel hẹp 320px   | Stepper rút nhãn: chỉ số + dấu ✓, tên hiện ở dưới mục hiện tại; action bar xuống 2 hàng nếu chữ nút không vừa (không cắt chữ).               |
| Dark theme             | Cùng cấu trúc, dùng biến màu của theme (`hpma-dark`); chip/alert giữ ngữ nghĩa màu rủi ro.                                                   |

## 13. Tiêu chí chấp nhận

1. Từ card `Gán partner vào TKQC` ở Flows vào được bước 1; các flow `hasConfig: false` vẫn hiện `ComingSoon`.
2. Bước 1: bốn thông điệp validate đúng §5.1; chỉ ID 15–17 chữ số mới bật `Tiếp`; dán ID có khoảng trắng/ký tự vô hình được làm sạch.
3. Stepper: bước đã xong bấm quay lại được, bước chưa tới không bấm được; sửa bước trước không mất dữ liệu bước sau.
4. Bước 2: tìm, chọn tất cả, đếm `n/tổng`; TKQC `Bị hạn chế` không chọn được và không bị "chọn tất cả" chạm tới; 0 TKQC thì `Tiếp` bị khoá.
5. Bước 3: mặc định `ADVERTISE`+`ANALYZE`, `MANAGE` tắt; tick `MANAGE` hiện alert quyền cao; 0 quyền thì `Tiếp` bị khoá.
6. Bước 4: thẻ review khớp 100% dữ liệu đã nhập; link `Sửa` đúng bước; nhãn nút chạy đúng mode và đúng `n`.
7. Full đang khoá thì không bao giờ chạy được ở bước 4 và hiện khối giải thích; Full mở khoá đi qua `ConfirmStep1` rồi `ConfirmStep2`.
8. Không có lệnh ghi nào gửi tới tab BM trong bước 1–3 (kiểm bằng log messaging: chỉ có `ping` và message đọc danh sách TKQC).
9. Đóng và mở lại side panel giữa chừng khôi phục đúng bước và dữ liệu (§9.1).
10. VI/EN đủ key, đổi ngôn ngữ giữa chừng không mất dữ liệu; tab nav đạt `aria-current` và focus đúng quy tắc §11.
11. `pnpm lint`, `tsc`, `pnpm build`, `pnpm build:firefox` pass; bố cục đúng ở 320px và 420px, light và dark.

## 14. Câu hỏi mở

| #   | Câu hỏi                                                              | Đề xuất                                                                                                                                              |
| :-- | :------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | ~~Lấy tên/ID BM hiện tại bằng cách nào?~~                            | **Đã chốt: đọc từ DOM/URL `business_id` qua content script (read-only).** Làm cùng engine; tới lúc đó header giữ chữ cố định, chưa chặn tự gán.      |
| Q2  | ~~Sửa bước 1 sau khi đã chọn TKQC: giữ hay đọc lại?~~                | **Đã chốt: giữ lựa chọn, đánh dấu lại nhãn "đã có partner" khi vào bước 2.**                                                                         |
| Q3  | ~~Các trạng thái TKQC khác và lý do chặn.~~                          | **Đã chốt: chặn mọi trạng thái khác `Hoạt động`, kèm nhãn lý do.** Danh sách trạng thái cần capture thực địa khi làm FR-08.                          |
| Q4  | ~~Ngân sách ghi: một lượt gán `n` TKQC tính `n` ghi hay 1?~~         | **Đã chốt: tính 1 lượt ghi cho cả lượt chạy.** Không cảnh báo theo `n`; chỉ chặn khi ngân sách còn 0. (Con số 3/20 vs 9/60 ở SPEC-UI-001 Q4 vẫn mở.) |
| Q5  | ~~Mock đang tick sẵn `MANAGE`; mặc định chỉ `ADVERTISE`+`ANALYZE`?~~ | **Đã chốt: không tick sẵn `MANAGE`.** Cần cập nhật artboard `FlowConfigPerms` cho khớp.                                                              |
| Q6  | ~~Cấu hình riêng quyền theo từng TKQC?~~                             | **Đã chốt: không trong MVP; một tập quyền chung (§7).**                                                                                              |
| Q7  | ~~Bước 4 có cần nhập "lý do/ghi chú" cho audit log không?~~          | **Đã chốt: không trong MVP; audit ghi tự động đủ trường (FR-07).**                                                                                   |
