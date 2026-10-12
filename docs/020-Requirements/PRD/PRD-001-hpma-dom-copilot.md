---
id: PRD-001
type: prd
status: draft
created: 2026-10-12
---

# PRD-001 — hpma-extension: Copilot vận hành Business Manager qua DOM automation

> Phạm vi: yêu cầu **tầng sản phẩm** cho hpma-extension sau pivot 12/10/2026 — từ "trích EAAG → gọi Graph API" sang **DOM automation**: thao tác trực tiếp UI Business Manager (BM) như user thật. Văn bản này định nghĩa scope MVP, bảng Functional Requirements kèm trạng thái triển khai thật, acceptance criteria, user flow, KPI nghiệm thu và cổng phase.
> Định vị tài liệu: đây là tầng **product** (phạm vi tính năng + tiêu chí nghiệm thu). Tầng **business** (thị trường, mô hình doanh thu, go-to-market, rủi ro kinh doanh) xem **BRD-001** (`../BRD/` — soạn song song, PRD này dẫn ngược BRD-001 ở §2, §3, §9). Chi tiết kỹ thuật xem `../050-Research/21-architecture-dom-copilot.md` (file 21 — kiến trúc), `17` (locator), `18` (flow UI), `19` (pacing/an toàn), `20` (pattern RPA), `14` (mapping quyền).
> Quy ước đánh dấu: **[Kiểm chứng — thực địa 12/10]** = đã chạy/quan sát trên BM thật ngày 12/10/2026 (do chủ dự án xác nhận); **[Suy luận — cần test]** = chưa kiểm chứng, bắt buộc test trên BM staging trước khi chốt.
> Mốc ghi nhận trạng thái triển khai: **12/10/2026** (chi tiết §4.3).

---

## 1. Executive Summary

hpma-extension là "copilot vận hành Facebook Business Manager" dành cho agency Việt Nam: một extension Chrome/Firefox (MV3) với content script chạy trên `business.facebook.com` và giao diện điều khiển ở **side panel** cạnh trang (không chèn UI vào DOM của Meta), tự động hóa các tác vụ quản trị tài sản lặp đi lặp lại — gồm một **danh mục flow**: quản lý đối tác (gán/gỡ partner), share dataset/pixel, quản lý người dùng BM, đổi tên/kiểm kê tài sản, kiểm tra chất lượng TKQC và rà 2FA (§4.1b); flow được đi sâu đầu tiên là **gán partner (BM đối tác) vào tài khoản quảng cáo (TKQC) kèm quyền**, dùng làm _flow tham chiếu_ để kiểm chứng toàn bộ đường ống — bằng cách thao tác UI BM đúng như người dùng thật, kèm dry-run, xác nhận có người (HITL), pacing an toàn và audit log.

Pivot 12/10/2026 xảy ra vì hướng "trích token EAAG → Graph API" kết luận **FAIL-WRITE**: token EAAG thiếu scope ở các edge ghi nhạy cảm (tiêu biểu `POST /act_{id}/agencies`, lỗi code 10/200) [Kiểm chứng — test thực địa, xem file 21 §1]. Hướng mới không cần token: UI BM luôn thực thi bằng đúng quyền của user đang đăng nhập.

> **Cập nhật 12/10/2026 — quyết định "no in-page UI":** panel copilot **không** render vào DOM `business.facebook.com` nữa; content script chạy headless (chỉ engine), UI chuyển sang side panel (chính) / popup / options (file 21 §5.1). Mã nguồn hiện tại vẫn là bản panel dock phải trong Shadow DOM → việc dời UI là backlog mới ở FR-01 (§4.1, §4.4) và re-baseline M0 (§8).

Trạng thái thực tế: code prototype đã **xóa** (12/10/2026) để xây lại theo kiến trúc mới; `src/` hiện gần như starter. Prototype từng có (nay chỉ còn là kinh nghiệm thiết kế): panel copilot dock phải (Shadow DOM), probe sức khỏe selector, step-engine 3 chế độ (dry-run/assist/full) + HITL, pacing + curfew + limit ghi/ngày, background broker stateless + audit log. Flow tham chiếu đầu tiên "gán partner vào TKQC" **đã dry-run thành công end-to-end trên BM thật 12/10/2026 (locale vi)** [Kiểm chứng — thực địa 12/10]; các bước ghi cuối đang chờ vá selector dialog và bài test write trên staging (§4.3). Mục tiêu MVP: chứng minh **đường ống ghi an toàn** (engine → HITL → pacing → verify-readback → audit) trên staging — trước hết bằng flow ghi đảo ngược được (đổi tên TKQC), sau đó flow tham chiếu gán/gỡ partner — và để thêm flow mới chỉ cần một `FlowDef` (§4.1b). Sản phẩm là **nền tảng flow**, không phải tool một tính năng.

---

## 2. Background & Objectives

### 2.1. Problem Statement

- **Tác vụ vận hành BM thủ công, lặp cao:** agency VN quản nhiều BM phải lặp hàng loạt thao tác trên Business Settings — gán/gỡ partner, share dataset/pixel, mời/đổi role/xóa người, đổi tên TKQC, kiểm tra trạng thái TKQC, rà 2FA (8 flow ở file 18 §2). Ví dụ gán partner: "vào Settings → Partners → Thêm → Cấp quyền → nhập BM ID → chọn TKQC → chọn quyền → Assign" nhiều lần/ngày; một lượt gán partner tay mất 2–3 phút, dễ nhầm TKQC/nhầm quyền, không có nhật ký để giải trình [Kiểm chứng — flow chuẩn Help Center, file 18 §3].
- **Đường chính thức bị chặn cả hai phía:** (i) Official Graph API cho các edge `/{asset}/agencies` yêu cầu app qua **App Review** với quyền nâng cao — rào cản thời gian/chi phí cho tool nội bộ (file 14 §3.2.5); (ii) đường tắt "trích EAAG token từ phiên trình duyệt" thì **FAIL-WRITE** ở edge ghi nhạy cảm (lỗi permission code 10/200, xác nhận 12/10/2026 — file 21 §1).
- **Hệ quả:** phần lớn tác vụ vận hành BM của agency chỉ có thể làm qua UI (khoảng 20% tác vụ chỉ tồn tại trên UI — file 09 §2, dẫn qua file 21 §1), nhưng làm tay chậm và rủi ro thao tác.

### 2.2. Goals (SMART)

- **G1 — Hiệu quả:** tới hết Q4/2026, rút thời gian một lượt thao tác ghi đơn lẻ của các flow trong danh mục (flow tham chiếu "gán partner vào TKQC": từ 2–3 phút thủ công xuống **< 30 giây/lượt**) trên BM staging, với **0 lỗi ghi** (đo bằng audit log đối chiếu UI thật).
- **G2 — Độ tin cậy locator:** trước khi mở chế độ write cho bất kỳ flow nào, probe hit-rate **≥ 95%** trên ma trận 2 locale (EN + vi_VN) × 2 trình duyệt (Chrome, Firefox) [Suy luận — cần test định kỳ theo deploy Meta].
- **G3 — An toàn tài khoản:** 30 ngày chạy staging liên tiếp với pacing mặc định: **0 checkpoint / 0 cảnh báo unusual activity / 0 temp-block** (watcher UI theo file 19 §6).
- **G4 — Truy vết:** **100%** thao tác ghi có audit record đầy đủ (run liên kết, step, kết quả, trích đoạn verify) và export được để giải trình với chủ tài sản.
- **G5 — Mở rộng:** một flow mới (ví dụ gỡ partner, rename TKQC, mời người dùng) chỉ cần thêm 1 file `FlowDef` + bổ sung selector/label, **không sửa engine lõi** [Suy luận — cần test thực tế ở FR-09/FR-12].

### 2.3. Non-Goals

Không làm trong phase này (và một số mục **tuyệt đối không làm** — vùng đỏ):

- **Vùng đỏ — từ chối ở tầng engine:** payment/billing, appeal/request review, business verification, claim/transfer ownership, mọi thao tác khi tài khoản đang checkpoint, và **không bao giờ** cố vượt checkpoint/2FA/CAPTCHA bằng mọi hình thức (file 11 §4.3; file 19 §6). Gặp các tình huống này: dừng, chỉ mở deep-link + checklist hướng dẫn user làm tay.
- **Không thu cookie/token ra khỏi máy:** không đọc HttpOnly cookie, không trích/lưu/truyền token EAAG (lớp token đã xóa khỏi thiết kế — file 21 §3.1, §5.9), không gửi bất kỳ dữ liệu nào về server ngoài.
- **Không dùng official Graph API ở phase này** (kể cả dự phòng); GraphQL nội bộ replay cũng chỉ là phương án opt-in tương lai, không thuộc kiến trúc lõi (file 21 §3.1).
- **Không scraping phục vụ bên thứ ba:** không thu thập dữ liệu BM rồi cung cấp cho bên ngoài; không automation engagement công khai (like/comment/follow).
- **Không mass-login / nhập credential-2FA hàng loạt** (mô hình "Login facebook" của RPA antidetect — vùng đỏ ToS, file 20 §2.2).
- **Không AI agent tự trị cho thao tác ghi:** LLM (nếu có sau này) chỉ ở lớp classify/suggest có người duyệt (file 20 §8, §9).
- **Không cam kết:** mobile app, desktop app, multi-account trong cùng một profile trình duyệt, tích hợp antidetect browser (chỉ ghi nhận như hướng tương lai ở §3).

---

## 3. Target Audience

**Persona 1 — Chủ agency quảng cáo VN (owner/founder).** Quản 5–30 business portfolio (BM của agency + BM khách), thường xuyên phải onboarding/offboarding khách: gán/gỡ BM đối tác, share pixel, mời/xóa người, đổi tên tài sản, rà quyền và trạng thái TKQC. Đau: thao tác lặp nhiều lần/ngày, sợ nhân viên bấm nhầm tài sản/quyền, không có bằng chứng giải trình khi khách hỏi "ai đã cấp quyền gì". Cần: dry-run xem trước, confirm khi nhạy cảm, audit log export được [Suy luận — cần test nhu cầu thực qua 3–5 agency pilot; khung nhu cầu ở BRD-001 §persona].

**Persona 2 — Nhân viên vận hành ads (ads operator).** Thực hiện hàng chục thao tác gán/gỡ/chia sẻ mỗi ngày theo ticket. Cần: UI đơn giản ở side panel ngay cạnh trang BM, chế độ assist (máy dẫn tới bước cuối, người bấm nút quyết định) trước khi tin tưởng chế độ full, và cảnh báo rõ khi BM đang "non" hoặc có dấu hiệu hạn chế.

**Bối cảnh sử dụng:** user dùng **nhiều BM**; chuẩn vận hành khuyến nghị 1 profile trình duyệt ↔ 1 tài khoản Facebook (file 19 §4.P7). Tương lai có thể cần chạy bên trong antidetect browser (Gologin/Hidemyacc… — thị trường agency VN hay dùng); phase này chỉ hỗ trợ Chrome/Firefox thường, tích hợp antidetect là Non-Goal (xem BRD-001 §roadmap kinh doanh).

**Không phải user mục tiêu:** cá nhân chạy ads lẻ 1 BM (tần suất thấp, không cần copilot); đội có app Meta đã qua review và chạy official API.

**Job-to-be-done trọng tâm (xếp theo tần suất ước tính ở agency):**

| #   | JTBD                                                                                 | Tần suất       | FR phục vụ                     |
| :-- | :----------------------------------------------------------------------------------- | :------------- | :----------------------------- |
| J1  | "Khi nhận khách mới, tôi muốn gán BM partner vào đúng TKQC, đúng quyền, có biên bản" | Nhiều lần/tuần | FR-04 (flow tham chiếu), FR-07 |
| J2  | "Khi bàn giao/chốt hợp đồng, tôi muốn gỡ partner an toàn, có xác nhận"               | Vài lần/tháng  | FR-09                          |
| J3  | "Tôi muốn biết BM này đang có partner nào, quyền gì, trước khi thao tác"             | Hàng ngày      | FR-08                          |
| J4  | "Tôi muốn share pixel/dataset cho partner mà không tự đồng ý điều khoản thay"        | Vài lần/tháng  | FR-10                          |

| J5 | "Khi có nhân sự vào/ra, tôi muốn mời/đổi role/gỡ người khỏi BM đúng quyền, có xác nhận" | Vài lần/tuần | FR-13 |
| J6 | "Tôi muốn đổi tên/chuẩn hóa tên hàng loạt TKQC theo quy ước mà không sửa tay từng cái" | Vài lần/tháng | FR-12 |
| J7 | "Tôi muốn biết nhanh TKQC nào đang bị hạn chế/không ổn trước khi chạy ads" | Hàng ngày | FR-14 |
| J8 | "Tôi muốn biết ai trong BM chưa bật 2FA mà không rà từng người" | Hàng tuần | FR-15 |

[J1–J8 là suy luận từ vận hành agency điển hình — cần xác nhận qua pilot; BRD-001 §persona có phân tích thị trường sâu hơn.]

---

## 4. Functional Requirements

### 4.1. Bảng FR tổng hợp

Trạng thái ghi nhận tại **12/10/2026**. Quy ước: **Done** = code chạy đúng phạm vi đã test; **In-progress** = có code, chưa đủ kiểm chứng; **Planned** = chưa có code.

> **Re-baseline:** toàn bộ code prototype (`engine/`, `flows/`, `panel/`, `shared/`, `auditLog.ts`) đã bị xóa khỏi `src/` theo quyết định của chủ dự án; dự án **xây lại từ đầu** theo kiến trúc mới (side panel + content script headless, danh mục flow). Mọi FR đặt lại **Planned (làm lại)**. Những gì còn giá trị: thiết kế (file 21), các bài học thực địa 12/10 (§4.3) và kết quả dry-run thực địa như bằng chứng rằng hướng DOM automation khả thi — nhưng **không còn là bằng chứng cho trạng thái code**.

| ID    | Tính năng                                                     | Mô tả                                                                                                                                                                                                                                                                                                               | Ưu tiên | Trạng thái                                                                                                                                                                                                                                                                                                           |
| :---- | :------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | Content script headless + UI copilot ngoài trang (side panel) | Content script chỉ match `business.facebook.com`, **không mount UI**, chạy engine + listener message; UI ở **side panel** (Chrome `sidePanel` / Firefox `sidebar_action`) — chọn flow, xem diff/progress, confirm HITL, log; popup = trạng thái + kill-switch; options = cấu hình + audit (`#my-ext`, `data-theme`) | P0      | **Done (phạm vi khung M0)** — content script headless `index.ts`, side panel Chrome/Firefox, popup mở panel, ping/pong; build + lint pass cả 2 browser; user đã xác nhận thực địa 12/10 (load unpacked, panel "Đã kết nối" trên tab BM). Engine/UI flow = M1+; P-1 (đóng/mở panel giữa run) chưa test vì chưa có run |
| FR-02 | SelectorRegistry + probe P0                                   | Registry v2 key → chuỗi chiến lược fallback (role/name EN-VI → attr → text → structure), nhãn song ngữ; probe đo hit-rate từng key + copy báo cáo JSON (kèm phiên/locale)                                                                                                                                           | P0      | **Planned (làm lại)** — bài học thiết kế v2 giữ lại (§4.3)                                                                                                                                                                                                                                                           |
| FR-03 | Step-engine 3 chế độ                                          | State machine "locate → act → verify"; chế độ **dry-run** (bỏ mọi step ghi), **assist** (dừng trước bước commit), **full**; event `step-start/ok/fail`, `verify-fail`, `paused-confirm`; timeout mặc định 15s; abort lan qua AbortSignal                                                                            | P0      | **Planned (làm lại)**                                                                                                                                                                                                                                                                                                |
| FR-04 | Flow tham chiếu #1: gán partner vào TKQC (flow a)             | `flows/partnerAssign.ts`: Partners → Thêm → "Cấp cho đối tác quyền truy cập" → nhập BM ID (validate 15–17 số) → Next → chọn TKQC + tick quyền (mapping nhãn → task file 14 §2.1) → Assign; verify-readback danh sách partner; báo đúng `done/pending-approval/failed`                                               | P0      | **Planned (làm lại)** — prototype từng dry-run pass 12/10 (code đã xóa); khi dựng lại phải xử lý key `dialog.accessPartial`/`dialog.taskManage*` (§4.3)                                                                                                                                                              |
| FR-05 | HITL theo ma trận 4 tầng                                      | Read: chạy tự do; Write thường: dry-run + confirm 1 lớp; Nhạy cảm: dry-run + confirm **2 lớp** (xem diff + gõ xác nhận), batch > N (mặc định 10) confirm từng mẻo; **Đỏ: từ chối chạy** + deep-link/checklist                                                                                                       | P0      | **Planned (làm lại)**                                                                                                                                                                                                                                                                                                |
| FR-06 | Pacing + curfew + limit ghi/ngày                              | Delay nền + jitter trước mọi hành động (3–8s cho bước ghi), giới hạn ghi/ngày theo độ "cứng" BM, curfew 0h–6h; đếm persist `storage.local` (chịu SW chết/refresh tab); lỗi `PacingBlockedError` nêu rõ lý do                                                                                                        | P0      | **Planned (làm lại)** — constants chờ hiệu chỉnh bằng dữ liệu thực địa [Suy luận — cần test]                                                                                                                                                                                                                         |
| FR-07 | Audit log append-only + xem/export                            | Background `auditLog.ts` ghi chunk `audit:<yyyy-mm>:<n>` append-only vào `storage.local` (không PII, không secrets); Options xem/lọc + export CSV/JSONL                                                                                                                                                             | P1      | **Planned (làm lại)**                                                                                                                                                                                                                                                                                                |
| FR-08 | Flow đọc kiểm kê                                              | Đọc danh sách BM/TKQC/partner hiện có từ UI (read-only, flow f file 18 §8), pagination SPA lazy-load; nền cho pre-flight & diff dry-run                                                                                                                                                                             | P1      | **Planned**                                                                                                                                                                                                                                                                                                          |
| FR-09 | Flow gỡ partner (= undo)                                      | Gỡ partner khỏi BM/TKQC (flow b file 18 §4); confirm 2 lớp + audit; là thao tác undo chuẩn cho FR-04, cũng tính vào ngân sách ghi + cùng pacing                                                                                                                                                                     | P1      | **Planned**                                                                                                                                                                                                                                                                                                          |
| FR-10 | Flow share dataset/pixel cho partner                          | Gán partner vào dataset/pixel kèm cấp độ truy cập (flow c file 18 §5); HITL tại bước khai báo quan hệ + reaffirm điều khoản — không tự tick thay user                                                                                                                                                               | P1      | **Planned**                                                                                                                                                                                                                                                                                                          |
| FR-11 | Self-healing locator + selector-pack versioning               | Fallback có ngưỡng điểm (1 ứng viên duy nhất mới heal), log mọi lần heal vào audit; pack selector versioned kèm kết quả health-check + `server_revision`; vá pack khi Meta đổi UI, không sửa code flow                                                                                                              | P2      | **Planned**                                                                                                                                                                                                                                                                                                          |
| FR-12 | Flow đổi tên TKQC                                             | Rename (write đảo ngược được — flow d file 18 §6): dry-run + audit, verify-readback, đổi lại tên cũ; **ứng viên test write đầu tiên** trên staging                                                                                                                                                                  | P1      | **Planned**                                                                                                                                                                                                                                                                                                          |

### 4.1b. Danh mục flow (flow catalogue)

Hpma-extension là **nền tảng flow**: các FR nền (FR-01→FR-03, FR-05→FR-07, FR-11) dùng chung cho mọi tác vụ; mỗi tác vụ nghiệp vụ là một `FlowDef` riêng gắn vào engine (NFR-06). Danh mục bám 8 flow đã nghiên cứu ở `file 18 §2`; **gán partner chỉ là một dòng trong danh mục** — được chọn làm _flow tham chiếu_ vì đã đi xa nhất (đã dry-run thực địa) và buộc kiểm chứng được mọi cơ chế khó (wizard nhiều bước, dialog portal, quyền theo nhãn, pending-approval).

| Flow (file 18)                                 | FR        | Loại / tầng HITL                                                                                                                                                                      | Đảo ngược được?    | Pha dự kiến              | Trạng thái                 |
| :--------------------------------------------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------- | :----------------------- | :------------------------- |
| (f) Kiểm kê agencies/clients/partner           | FR-08     | Đọc — tự do                                                                                                                                                                           | n/a                | M2                       | Planned                    |
| (d) Đổi tên TKQC                               | FR-12     | Ghi thường — confirm 1 lớp                                                                                                                                                            | Có (đổi lại)       | M2 — **write đầu tiên**  | Planned                    |
| (a) Gán partner vào TKQC                       | FR-04     | Ghi nhạy cảm — confirm 2 lớp                                                                                                                                                          | Có (FR-09)         | M3 — **flow tham chiếu** | In-progress (dry-run pass) |
| (b) Gỡ partner                                 | FR-09     | Ghi nhạy cảm — confirm 2 lớp (destructive)                                                                                                                                            | Một phần (gán lại) | M3                       | Planned                    |
| (c) Share dataset/pixel cho partner            | FR-10     | Ghi nhạy cảm — HITL tại bước điều khoản                                                                                                                                               | Có (gỡ share)      | M4                       | Planned                    |
| (e) Mời / đổi role / gỡ người trong BM         | **FR-13** | Ghi nhạy cảm — 2 lớp khi gán full control hoặc xóa người                                                                                                                              | Một phần           | M4+                      | Planned (mới)              |
| (g) Account quality / trạng thái TKQC          | **FR-14** | Đọc — tự do; **tuyệt đối không auto "Request review"** (vùng đỏ)                                                                                                                      | n/a                | M4+                      | Planned (mới)              |
| (h) 2FA: yêu cầu toàn BM + báo cáo ai chưa bật | **FR-15** | **Phạm vi hiện tại: chỉ báo cáo (đọc).** Phần đặt yêu cầu "Mọi người" nằm ngoài phạm vi phase này (nhạy cảm, có thể khóa user chưa 2FA) — chỉ xem xét lại sau khi có dữ liệu vận hành | n/a (báo cáo)      | M4+                      | Planned (mới)              |

- **FR-13/14/15** là FR mới tách từ flow (e)/(g)/(h) của file 18; đặc tả acceptance chi tiết viết khi tới pha tương ứng (không đặc tả sớm khi chưa probe UI thật).
- **Thứ tự ưu tiên theo rủi ro tăng dần:** đọc (FR-08, FR-14) → ghi đảo ngược (FR-12) → ghi nhạy cảm (FR-04/09/10/13) (flow ghi khó đảo ngược như đặt yêu cầu 2FA toàn BM chưa vào phạm vi — FR-15 chỉ báo cáo). Không flow nào được nâng tầng rủi ro mà thiếu cổng nghiệm thu (§8).
- **Quy tắc thêm flow mới (đạt G5):** (1) khai báo `FlowDef` kèm `risk` tầng HITL; (2) bổ sung key vào SelectorRegistry + nhãn EN/vi; (3) probe hit-rate các key của flow ≥ 95% trước khi mở write; (4) dry-run pass + verify-readback; (5) có đường undo hoặc ghi rõ "không đảo ngược" kèm confirm 2 lớp; (6) không sửa engine lõi — nếu phải sửa thì đó là FR nền, không phải FR flow.
- Flow thuộc vùng đỏ (payment, appeal/request review, verification, claim ownership) **không bao giờ vào danh mục** (§2.3).

### 4.2. Acceptance criteria (các FR P0)

**FR-01 — Content script headless + side panel.**

- Content script match **chỉ** `https://business.facebook.com/*`, chạy `document_idle`; không `<all_urls>` ở bất kỳ khóa manifest nào [Kiểm chứng — `src/manifest.ts`].
- **Không UI nào của extension trong DOM trang BM**: content script không mount React/Shadow DOM; phần tử duy nhất extension tác động lên DOM BM là các step của engine. Kiểm bằng cách mở DevTools trên tab BM — không có host element của extension.
- UI copilot (chọn flow, dry-run diff, progress, confirm HITL 2 lớp, log) ở side panel; root `id='my-ext'` + `data-theme`, boot qua `createShadowRoot` như popup/options.
- Side panel bám đúng `tabId` của tab BM đang active; nhiều tab BM → hiển thị tab đang bám và cho chọn lại [Suy luận — cần test].
- **State chạy flow + pending-confirm nằm ở content script**: đóng/mở side panel hoặc SW chết giữa run không làm mất flow; mở lại panel thì re-sync trạng thái run hiện tại (message `SyncState`).
- Trang login/checkpoint/2FA: side panel hiện "ngoài vùng hỗ trợ" và khóa nút chạy [Suy luận — cần test trên tài khoản checkpoint giả lập].
- Kill-switch (ở side panel và popup) dừng được queue + abort step đang chờ trong ≤ 1 step [Kiểm chứng — thực địa 12/10, dry-run, trên bản panel in-page; cần kiểm lại sau khi dời sang side panel].
- Chạy được trên cả Chrome (`sidePanel`) và Firefox (`sidebar_action`) với cùng giao diện [Suy luận — cần test version sàn].

**FR-02 — SelectorRegistry + probe P0.**

- Mọi locator đi qua registry key; **cấm class hash StyleX**; mỗi key ≥ 2 tầng chiến lược fallback (file 17 §3, §9.2).
- Nhãn EN + vi_VN cho mọi key liên quan flow tham chiếu (gán partner) và mỗi flow mới khi thêm vào danh mục (nguồn nhãn file 14 §2 / file 18); locale chỉ ảnh hưởng thứ tự thử, không ảnh hưởng đúng/sai.
- Strict-mode: ≥ 2 ứng viên ở cùng tầng = ambiguous → xuống tầng dưới, **không lấy `first()` mù**; lọc ứng viên ẩn trước khi đếm [Kiểm chứng — thực địa 12/10: vá 2 nút "Thêm" trùng nhãn].
- Probe P0 trên DOM sống báo hit-rate từng key + nút copy JSON; kết quả lưu kèm phiên/locale phục vụ chẩn đoán rot.

**FR-03 — Step-engine.**

- dry-run không thực thi bất kỳ step `risk: 'write'` nào — không có ngoại lệ [Kiểm chứng — thực địa 12/10: các bước ghi bị bỏ qua đúng thiết kế].
- assist dừng trước bước commit cuối và bàn giao nút bấm cho user.
- full: mọi step ghi có `verify` bắt buộc đọc lại từ DOM (không tin toast/optimistic UI); verify-fail → không retry vô hạn, xử lý theo `onFail`.
- Event đủ `step-start/step-ok/step-fail/verify-fail` + `paused-confirm` khi `onFail: 'askUser'`; resume chỉ sau quyết định user.

**FR-04 — Flow tham chiếu #1: gán partner.** _(Là một flow trong danh mục §4.1b; các tiêu chí dưới đây vừa là acceptance riêng của flow, vừa là khuôn mẫu cho acceptance của flow ghi sau.)_

- Dry-run end-to-end pass: tự mở Partners → Thêm → "Cấp cho đối tác quyền truy cập" → nhập BM ID → Next tới wizard chọn tài sản [Kiểm chứng — thực địa 12/10, locale vi].
- BM ID validate 15–17 chữ số trước khi điền (tránh lỗi form ngầm — file 18 §3 bước 3).
- Write pass trên staging (sau vá `dialog.*`): gán BM đối tác quyền thấp nhất `ADVERTISE,ANALYZE` vào 1 TKQC → verify-readback thấy partner trong danh sách; chạy lại cùng input → **skip idempotent, không double-submit** (mục tiêu KPI §7).
- Trạng thái pending-approval (chờ admin thứ 2) được nhận diện và báo đúng, **không replay** thao tác (file 18 §3).
- **Điều kiện mở write (gate):** probe hit-rate ≥ 95% (G2) + dry-run 100% bước 1–5 + hoàn tất FR-12 trên staging (§8).

**FR-05 — HITL 4 tầng.**

- Tầng nhạy cảm có đủ 2 lớp: (1) xem diff BM × asset × task set, (2) gõ lại nội dung xác nhận; thiếu lớp nào engine không chạy.
- Batch > N (mặc định 10): xác nhận từng mẻo thay vì một lần cho cả lô.
- Tầng đỏ: engine trả lỗi từ chối + chỉ mở deep-link/checklist (file 11 §4.3) — broker chặn lần thứ 2 (defense-in-depth, file 21 §5.5).
- Lần đầu chạy một flow trên một BM cụ thể: chế độ walk-through, user tự bấm submit 2–3 target đầu (file 19 §8) [Suy luận — cần test UX].

**FR-06 — Pacing + curfew + limit.**

- Không có đường code nào cho phép delay < ngưỡng min an toàn từ settings; jitter re-roll mỗi lần (chống timing đều — file 19 §2.1).
- Số ghi/ngày persist `storage.local` theo key ngày; re-hydrate đúng sau khi SW Chrome chết (~30s idle) hoặc refresh tab [Kiểm chứng — thiết kế `pacing.ts`; hành vi SW — file 09 §3.6].
- Curfew 0h–6h (giờ địa phương tài khoản) chặn mọi write với lỗi rõ ràng.
- Gate `visibility + focus`: engine chỉ chạy khi tab BM `visible` và `hasFocus`; `visibilitychange → hidden` pause queue ngay (file 19 §4.P3) [Suy luận — cần test].

### 4.3. Phát hiện thực địa 12/10 & hàm ý cho backlog

Dry-run flow tham chiếu (gán partner) trên BM thật (locale vi, 12/10/2026) cho 4 phát hiện [Kiểm chứng — thực địa 12/10]. Phát hiện 1–3 là **bài học cấp nền tảng** (trùng nhãn, ký tự vô hình, nút disabled) — áp dụng cho mọi flow, không riêng gán partner; phát hiện 4 riêng cho flow này:

1. **Hai nút "Thêm" trùng nhãn** trong DOM (một ẩn/trong chrome ngoài vùng main) → **đã vá**: registry v2 lọc ứng viên ẩn + cho phép strategy scope `withinMain`.
2. **Nhãn Meta chứa zero-width space** (vd. `Thêm​` kèm U+200B) → exact-match sau chuẩn hóa trượt → **CHƯA vá — item đang mở**: `normalizeText` phải strip zero-width/invisible chars trước so khớp; bổ sung regression vào probe P0.
3. **Nút Assign bị disable tới khi tick chọn asset** → step engine phải chờ enabled-state (actionability), không click nút disabled; hành vi optimistic/disabled của Comet cần thêm vào checklist verify [Suy luận — cần test].
4. **Key `dialog.accessPartial` + `dialog.taskManage*` chưa xác minh** vì chúng chỉ hiện sau khi tick chọn một asset trong wizard → **bắt buộc probe lại ở trạng thái dialog-đã-chọn-asset** trước khi cho phép write; đây là blocker duy nhất trước bài test write của FR-04.

### 4.4. Phụ thuộc giữa các FR & thứ tự build

- FR-04/08/09/10/12 (mọi flow nghiệp vụ) phụ thuộc FR-01→FR-03 (panel, registry, engine) và bắt buộc đi kèm FR-05/06/07 (HITL, pacing, audit) khi có bước ghi — không flow ghi nào được ship thiếu một trong ba.
- FR-12 (rename) build **trước** FR-04-write: write đảo ngược được, rủi ro thấp nhất, là bài kiểm đầu cho toàn bộ đường ống write → verify → audit.
- FR-09 (gỡ partner) build song song FR-04-write để làm đường undo/rollback cho bài test flow tham chiếu (gán rồi gỡ trên staging).
- FR-13/14/15 (people, account quality, 2FA) chỉ bắt đầu sau khi M3 chứng minh đường ống ghi; riêng phần **đọc** của FR-14/FR-15 có thể làm sớm (rủi ro ~0) song song với FR-08.
- FR-11 (self-healing) chỉ bắt đầu sau khi có dữ liệu rot thật từ probe định kỳ; giai đoạn đầu healing ở chế độ "chỉ đề xuất cho read", tuyệt đối không auto-heal nút ghi (file 20 §6.2).
- **FR-01 (dời UI sang side panel) build trước mọi flow ghi mới:** các FR dùng UI panel (FR-05 confirm HITL, FR-07 xem audit) cần bề mặt mới; thứ tự: (i) manifest `sidePanel`/`sidebar_action` + content script headless; (ii) dời `ConfirmDialog`/`LogPanel`/`FlowCard`/`ProbeCard` sang side panel qua message; (iii) bài test plumbing P-1 (file 21 §7) — rồi mới tiếp tục vá `dialog.*` và test write.
- Backlog mở trực tiếp từ §4.3: (i) strip zero-width/invisible chars trong `normalizeText`; (ii) actionability chờ enabled-state trước click; (iii) probe ở trạng thái dialog-đã-chọn-asset; (iv) regression 2 nút trùng nhãn vào bộ probe P0.

---

## 5. Non-Functional Requirements

- **NFR-01 — Nền tảng:** MV3 cả Chrome (service worker module) lẫn Firefox (event page qua `vite.config.ts`); **Firefox ≥ 128** cho `world: 'MAIN'` — chỉ dùng diagnostics opt-in (surface/server_revision), engine thao tác thuần isolated world + DOM (file 17 §7) [Kiểm chứng — MDN BCD].
- **NFR-02 — Cách ly UI (no in-page UI):** **không render UI extension vào DOM `business.facebook.com`**; mọi UI nằm ở side panel/popup/options (extension pages, boot qua `createShadowRoot` + `#my-ext` để dùng chung hạ tầng CSS). Page JS không chạm được UI hay nút confirm của extension; content script chỉ nhận message từ chính extension (`sender.id`) và đối chiếu `requestId`/`runId` với pending-confirm. Không mutate host DOM ngoài hành động nghiệp vụ của engine (file 21 §3.7, §5.1, §5.5). Lưu ý: UI ngoài trang chỉ giảm dấu vết DOM và bề mặt tấn công, **không** giảm rủi ro behavioral detection vì engine vẫn thao tác DOM [Suy luận — cần test].
- **NFR-03 — Quyền tối thiểu:** `storage` + host `https://business.facebook.com/*` + `sidePanel` (chỉ Chrome, cho UI chính; Firefox dùng khóa manifest `sidebar_action`, không cần permission riêng) (+ `scripting` chỉ phục vụ diagnostics opt-in). **Không** `<all_urls>`, `cookies`, `tabs` (bám tab BM dựa vào host permission; cần test đủ chưa), `webRequest`, `debugger` ở bản phân phối (file 21 §6; CWS review — file 11 §3.4).
- **NFR-04 — Riêng tư dữ liệu:** không backend; settings/audit/selector packs nằm trong `storage.local` của máy user; không telemetry ra ngoài; audit không ghi cookie/token/PII ngoài ID công việc (ID đối tác chỉ lưu khi user bật "log chi tiết" — file 21 §5.7).
- **NFR-05 — Hiệu năng:** không chặn main thread của tab BM; `waitFor` bằng MutationObserver có timeout (không poll vô hạn); panel idle chi phí ~0; ngân sách bundle content script < ~500 KB gzip (file 20 §5.2) [Suy luận — cần test máy yếu].
- **NFR-06 — Khả mở (G5):** flow mới = một `FlowDef` mới (`id`, `version`, step list + risk tier) trong `src/content/flows/`; nhãn/selector là dữ liệu versioned (`labels.ts`, `selectors.ts`), khi Meta đổi UI thì vá data, không vá logic engine (file 17 §4.3, §10).
- **NFR-07 — Tin cậy vận hành:** mọi step timeout mặc định 15s; fail-soft (verify-fail → dừng, không retry vô hạn); broker stateless chịu SW chết ~30s; audit append-only không sửa record cũ (file 21 §5.5–5.7).

---

## 6. User Flows & UX Requirements

**(a) Probe → vá selector (developer/operator nâng cao).** Mở BM → mở side panel → tab Probe → chạy P0 → xem hit-rate từng key trên DOM sống → copy JSON (kèm locale + phiên). Key trượt → vá registry/labels → chạy lại probe tới khi ≥ 95%. UX: key lỗi tô đỏ, hiển thị tầng chiến lược thắng/trượt.

**(b) Dry-run làm quen (lần đầu dùng flow).** User chọn flow → nhập tham số (BM đối tác, TKQC, quyền) → bấm **Dry-run** → engine đi hết các bước điều hướng/điền form **nhưng bỏ mọi bước ghi** → panel hiện diff "sẽ gán X vào Y với quyền Z". Không có bất kỳ thay đổi nào lên BM [Kiểm chứng — thực địa 12/10].

**(c) Assist cho tác vụ đầu tiên trên một BM.** Walk-through: engine highlight + dẫn từng bước, dừng **trước nút commit** (Assign/Save); user tự bấm ở 2–3 target đầu; sau đó mới mở quyền chạy full cho BM đó (file 19 §8).

**(d) Full cho tác vụ quen.** User đã hiểu diff → chạy full. Tác vụ **nhạy cảm** (gán quyền cao `MANAGE`, gỡ partner, batch > 10): dry-run diff → confirm lớp 1 (xem diff) → confirm lớp 2 (gõ lại xác nhận) → engine chạy kèm pacing; mọi bước ghi verify-readback và ghi audit.

**(e) Phản ứng checkpoint / tín hiệu anti-abuse.** Watcher URL/dialog phát hiện checkpoint, mất phiên, temp-block, CAPTCHA (bảng tín hiệu file 19 §6.1) → **dừng ngay toàn bộ queue**, đặt cờ `emergency_stop` khóa automation của actor (không tự clear), panel chuyển trạng thái đỏ + hướng dẫn user xử lý tay + checklist gỡ checkpoint. Tuyệt đối không retry, không "chờ hết hạn rồi chạy tiếp" [Suy luận — cần test bằng logout tay/checkpoint giả lập trên staging].

**(f) Khi Meta deploy đổi UI.** Health-check định kỳ (chạy lại probe P0, đối chiếu `server_revision` nếu đọc được) → phát hiện key chết → vá selector-pack + nhãn → **bump version pack** → probe lại đạt ≥ 95% mới mở lại write. Trong thời gian vá, flow ghi chuyển fail-soft: dừng + báo signature màn hình (URL + role/name đang hiện, không PII) để dev cập nhật (file 17 §9.3, FR-11).

---

## 7. Success Metrics

| KPI                                                                                               | Ngưỡng                                                                              | Cách đo                                                              | Gắn                                                                      |
| :------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------- | :------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| Probe hit-rate                                                                                    | **≥ 95%** trên 2 locale (EN, vi_VN) × 2 trình duyệt (Chrome, Firefox)               | Báo cáo probe P0 trước khi mở write; re-chạy khi Meta deploy         | G2 · FR-02 · Gate §8                                                     |
| Dry-run mỗi flow (tham chiếu: gán partner)                                                        | **100% bước 1–5 pass** (điều hướng → wizard chọn tài sản)                           | Chạy dry-run trên staging sau mỗi vá selector                        | FR-04 [Kiểm chứng — đạt 12/10 trên 1 cấu hình; cần lặp lại theo ma trận] |
| Đúng ghi                                                                                          | **0 ghi sai asset/quyền; 0 lặp request** (double-submit)                            | Đối chiếu audit vs UI thật sau mỗi run; idempotent skip khi chạy lại | FR-04 · G1                                                               |
| Thời gian 1 lượt ghi đơn lẻ (đo trên flow tham chiếu gán partner; flow khác đo tương tự khi ship) | **< 30 giây** (so với 2–3 phút thủ công)                                            | Timestamp run trong audit                                            | G1                                                                       |
| An toàn tài khoản                                                                                 | **0 checkpoint / 0 temp-block / 0 cảnh báo unusual activity trong 30 ngày** staging | Watcher UI (file 19 §6) + theo dõi tay                               | G3                                                                       |
| Truy vết                                                                                          | **100% write có audit record đủ trường** (kèm excerpt verify)                       | Rà soát chunk `audit:*` định kỳ; export được CSV/JSONL               | G4 · FR-07                                                               |

Ngưỡng là **điều kiện nghiệm thu**, không phải mục tiêu khuyến khích: không đạt một KPI nào trong bảng thì không mở tính năng tương ứng cho user thật.

---

## 8. Roadmap & cổng nghiệm thu

Mapping theo lộ trình M0–M4 của file 21 §8 (trạng thái tại 12/10/2026):

| Milestone                                                                                    | Nội dung                                                                                                                                           | FR liên quan                             | Cổng nghiệm thu (không qua → không sang phase)                                                                                                                                                                                                                   |
| :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — Nền (**Done phần khung — user xác nhận thực địa 12/10; P-1 chuyển sang M1 khi có run**) | Siết manifest về `business.facebook.com`; content script headless + boot side panel rỗng (thay cho panel Shadow DOM trong trang)                   | FR-01                                    | Side panel mở ổn định cạnh tab BM, 0 lỗi console, **không có host element extension trong DOM BM**; pass P-1 plumbing (đóng/mở panel giữa run không mất flow; Chrome + Firefox) [bản in-page đã Kiểm chứng — thực địa 12/10; bản side panel Suy luận — cần test] |
| M1 — Engine + probe (**Planned — làm lại**)                                                  | Primitives, stepMachine, probe P0, SelectorRegistry v2; (read flow dời sang M2)                                                                    | FR-02, FR-03                             | Probe chạy trên DOM sống, báo cáo JSON; dry-run/assist/full hoạt động [Kiểm chứng — thực địa 12/10]                                                                                                                                                              |
| M2 — Write an toàn đầu tiên                                                                  | Broker + audit + HITL + pacing hoàn chỉnh; **rename TKQC** làm write đầu tiên; flow đọc kiểm kê                                                    | FR-05, FR-06, FR-07, FR-12, FR-08        | Rename + đổi lại tên cũ pass trên staging; audit đủ trường cho mọi write; HITL 2 lớp đúng ma trận                                                                                                                                                                |
| M3 — Flow tham chiếu write (partner)                                                         | Flow gán partner (và gỡ partner = undo) lên write — flow nghiệp vụ đầu tiên đi hết đường ống ghi sau rename                                        | FR-04, FR-09                             | **Gate ghi:** probe ≥ 95% (2 locale × 2 browser) + dry-run 100% bước 1–5 + vá xong `dialog.*` + M2 pass; sau đó: 30 ngày staging 0 checkpoint, 0 ghi sai/0 lặp                                                                                                   |
| M4 — Mở rộng danh mục flow                                                                   | Share dataset/pixel; quản lý người dùng BM; chất lượng TKQC + báo cáo 2FA (đọc trước); self-healing; hiệu chỉnh constants pacing từ audit thực địa | FR-10, FR-13, FR-14, FR-15, FR-11, FR-06 | M3 pass ổn định 30 ngày; healing chỉ chạy trên read trước, sau đó mới cho write với ngưỡng cao hơn                                                                                                                                                               |

**Gate chung cho mọi flow ghi** (áp cho từng flow trong §4.1b, không chỉ gán partner): (1) probe hit-rate các key của flow ≥ 95% (2 locale × 2 browser); (2) dry-run pass 100% các bước điều hướng/điền form; (3) verify-readback + idempotent skip khi chạy lại; (4) có đường undo hoặc xác nhận 2 lớp nếu không đảo ngược được; (5) audit đủ trường; (6) pass bài test write trên staging. Các điều kiện riêng của gán partner (vá `dialog.*`...) là **gate bổ sung của riêng flow đó**.

Nguyên tắc cổng: **không qua gate → không sang phase**; mọi gate có bằng chứng lưu trong audit/báo cáo probe (khớp test plan tổng thể file 21 §7; dự kiến văn bản hóa thành test plan riêng ở `docs/035-QA/`).

---

## 9. Rủi ro kỹ thuật & compliance (tóm tắt)

| Rủi ro                                                                                                                                                                                                   | Mức                 | Giảm thiểu                                                                                                                                                                                                                        |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selector rot theo deploy Meta (tuần–2 tuần kèm A/B test)                                                                                                                                                 | Cao                 | Locator neo role/accessible name, cấm class hash (file 17 §2); probe định kỳ + pack versioned (FR-11); fail-soft + signature khi hết chiến lược                                                                                   |
| Behavioral detection (timing/phi vật lý)                                                                                                                                                                 | Cao                 | Pacing+jitter, curfew, limit/ngày, gate visible+focus (FR-06; file 19 §2–§4); constants hiệu chỉnh bằng audit trước khi chốt [Suy luận — cần test]                                                                                |
| Checkpoint/temp-block giữa run                                                                                                                                                                           | Cao (tác động)      | Watcher UI + dừng khẩn cấp khóa cứng, không tự clear, không vượt checkpoint (file 19 §6); user xử lý tay theo checklist                                                                                                           |
| Ghi sai/double-submit khi mạng/UI chậm                                                                                                                                                                   | Trung bình          | Idempotent re-read trước ghi + verify-readback; quy tắc "đọc-lại-trước-khi-quyết" cho partial-state (file 19 §7)                                                                                                                  |
| Approval admin thứ 2 làm flow "treo"                                                                                                                                                                     | Thấp                | Nhận diện pending-approval, báo đúng trạng thái, không replay (file 18 §3)                                                                                                                                                        |
| Side panel: khác biệt API Chrome (`sidePanel`) vs Firefox (`sidebar_action`), bám tab, Port mất khi tab điều hướng/panel đóng                                                                            | Trung bình          | Manifest tách theo browser trong `vite.config.ts`; state run ở content script + `SyncState` khi panel mở lại; test P-1 trên cả 2 browser (file 21 §5.1, §7) [Suy luận — cần test]                                                 |
| Chrome: `web_accessible_resources` do crxjs sinh cho loader content script cho phép JS của Meta dò ra extension (ID cố định) → nguy cơ bị flag account. **Chặn publish CWS** (review M0, security Low 1) | Cao (trước publish) | `use_dynamic_url: true` (cần test loader) hoặc build content script tự chứa không dynamic import; Firefox không bị (UUID ngẫu nhiên) [Suy luận — cần test]                                                                        |
| Firefox MV3: content-script match có thể là host permission chưa được cấp → panel luôn "chưa kết nối"; loader `import()` chưa test dưới CSP của BM (review M0, cross-browser #1, #2)                     | Trung bình          | Kiểm `about:addons` → Permissions + Console tab BM; nếu đúng thì thêm `host_permissions` ở M1 và chạy lại security review [Suy luận — cần test]                                                                                   |
| Firefox < 128 thiếu MAIN world                                                                                                                                                                           | Thấp                | `strict_min_version` 128; MAIN world chỉ diagnostics, không chặn chức năng chính (file 17 §7)                                                                                                                                     |
| Compliance ToS/CWS review                                                                                                                                                                                | Trung bình          | Vùng đỏ từ chối ở engine+broker; không concealment (không bypass `isTrusted`, không giả CAPTCHA); quyền tối thiểu, không thu dữ liệu rời máy (file 11 §3.4, §4.3; chi tiết kinh doanh/pháp lý xem **BRD-001 §rủi ro & tuân thủ**) |
| Pilot agency phụ thuộp antidetect browser                                                                                                                                                                | Thấp (scope)        | Phase này chỉ Chrome/Firefox thường; đánh giá lại ở BRD-001 roadmap                                                                                                                                                               |

---

## 10. Nguồn tham khảo

**Nội bộ dự án (first-party):**

1. `../BRD/` — **BRD-001**: Business Requirements Document (soạn song song; PRD này dẫn §2 problem, §3 persona, §9 rủi ro/compliance).
2. `../050-Research/21-architecture-dom-copilot.md` — kiến trúc DOM copilot sau pivot: sơ đồ module, FlowDef/stepMachine, SelectorRegistry, broker, HITL, audit, manifest, test plan pha P0–P5, lộ trình M0–M4 (nguồn chính cho §4–§8).
3. `../050-Research/18-bm-ui-flows.md` — 8 flow UI Business Settings song ngữ EN/VI: flow (a) gán partner §3, (b) gỡ partner §4, (c) share dataset §5, (d) rename §6, (f) kiểm kê §8; cơ chế approval admin thứ 2 (nguồn chính cho FR-04/08/09/10/12).
4. `../050-Research/14-partner-assign-mapping-graphql.md` §2 — bảng mapping nhãn quyền UI EN/VI ↔ `permitted_tasks` (nguồn nhãn cho SelectorRegistry và diff dry-run).
5. `../050-Research/17-dom-locator-resilience.md` — chiến lược locator đa tầng, song ngữ, self-healing, MAIN vs isolated world (nguồn cho FR-02/FR-11, NFR-01/02).
6. `../050-Research/19-humanlike-pacing-safety.md` — pacing/jitter/ngân sách ghi, anti-pattern P1–P8, watcher checkpoint, HITL bắt buộc, audit payload (nguồn cho FR-05/FR-06, user flow (e)).
7. `../050-Research/20-rpa-recorder-patterns.md` — pattern RPA/recorder/self-healing/orchestration đã chọn lọc (nguồn cho FR-11 và quyết định "không replay transcript thô").
8. `../050-Research/11-policy-compliance.md` §3–§4 — khung tuân thủ Meta ToS + CWS policy, vạch đỏ vận hành (nguồn cho §2.3, §9).
9. `../050-Research/09-extension-techniques.md` §3.1/§3.6 — tiền đề kỹ thuật: BM là SPA Comet, controlled input, SW ~30s idle.
10. **`CLAUDE.md` + mã nguồn `src/`** (probe 12/10/2026): `content/engine/{stepMachine,primitives,selectors,pacing,labels}.ts`, `content/flows/partnerAssign.ts`, `content/panel/*` (sẽ dời sang `src/sidepanel/`), `background/{index,auditLog}.ts`, `shared/messaging.ts`, `utils/createShadowRoot.tsx` — bằng chứng trạng thái Done/In-progress trong §4.1.

**Bên ngoài (thứ cấp qua research):** Meta Business Help Center (flow partner/people/dataset — trích trong file 18 §12), MDN/Chrome docs (`scripting` ExecutionWorld, Page Visibility, alarms — trích trong file 17 §11, 19 §11).

> **Tính toàn vẹn:** trạng thái triển khai đối chiếu `src/` ngày 12/10/2026 sau khi xóa prototype (mục 10 liệt kê file prototype chỉ để tham chiếu lịch sử, không còn tồn tại); mọi con số vận hành (delay, ngưỡng limit) là khung khởi đầu [Suy luận — cần test] phải hiệu chỉnh bằng audit trên BM staging trước khi chốt constants. Không phóng đại: tính năng chưa kiểm chứng ghi rõ Planned/In-progress kèm điều kiện mở.
