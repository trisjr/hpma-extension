---
id: BRD-001
type: brd
status: draft
created: 2026-10-12
---

# BRD-001 — Business Requirements Document: HPMA DOM Copilot

> Tài liệu yêu cầu nghiệp vụ cấp cao (business-level) cho **hpma-extension** — extension Chrome/Firefox (MV3) đóng vai trò **"copilot vận hành Facebook Business Manager"** cho agency Việt Nam: tự động thao tác UI Business Manager như người dùng thật, có người trong vòng kiểm soát (human-in-the-loop).
> Tài liệu này KHÔNG mô tả chi tiết tính năng/kỹ thuật (đó là phạm vi của PRD và tài liệu kiến trúc). Mọi số liệu dẫn từ bộ research 21 file tại `docs/050-Research/` (3 vòng, cập nhật 12/10/2026).

---

## 1. Bối cảnh & vấn đề

### 1.1. Bối cảnh ngành

Agency và freelancer quảng cáo tại Việt Nam vận hành đồng thời nhiều Business Manager (BM — nay là Meta Business Portfolio) của nhiều khách hàng. Phần lớn công việc hằng ngày không nằm ở "tối ưu quảng cáo" (đã có nhiều SaaS quốc tế) mà nằm ở **vận hành tài sản BM**: chỉ định đối tác (partner/agency) vào tài khoản quảng cáo kèm quyền, gỡ đối tác khi kết thúc hợp đồng, share pixel/dataset giữa các BM, kiểm kê quyền và tài sản, kiểm tra sức khỏe BM/TKQC.

Đây là các tác vụ:

- **Lặp lại cao**: onboarding một khách hàng mới = cùng một chuỗi thao tác trên N BM × M TKQC; chính Meta cũng không cung cấp template onboarding "1 cú click" (file 12, gap #10).
- **Chỉ thao tác được bằng tay**: phần lớn flow partner/asset share là UI-only hoặc chỉ có API hạn chế (file 10 §2; file 01 §3.6 — write cấu trúc BM cần Full access tier).
- **Dễ sai, khó truy vết**: thao tác tay hàng chục lần trên nhiều tài sản → cấp nhầm quyền, sót gỡ quyền khi hết hợp đồng, không có nhật ký để đối chiếu khi tranh chấp.
- **Nhạy cảm rủi ro**: thao tác ghi trên BM là write-action nhạy cảm; sai quy trình có thể kéo theo checkpoint và mất tài sản của chính agency lẫn khách hàng (file 11, 15).

### 1.2. Ba con đường đã được khảo sát

Hai tháng nghiên cứu (kết luận 12/10/2026) cho thấy chỉ có 3 con đường kỹ thuật, và cả 2 con đường "sạch" đều không đi tới được:

1. **Official API (Graph/Marketing API qua Meta App)**: hợp lệ nhưng write cấu trúc BM (gán quyền, chỉ định partner) cần **App Review + Business Verification + Full access tier** của Business Management API — permission `business_management` thuộc nhóm khó duyệt, không phù hợp giai đoạn đầu (file 01 §3.2–3.3). Đây vẫn là lộ trình dài hạn hợp lệ hóa (xem §8).
2. **EAAG token trích từ phiên BM → gọi Graph API từ trình duyệt** (mô hình BMTool.vn đang bán): test thực địa theo test-plan cho kết quả **FAIL-WRITE** — token first-party thiếu scope, các edge ghi nhạy cảm (tiêu biểu `POST /act_{id}/agencies`) trả lỗi permission (code 10/200) dù quyền đọc vẫn hoạt động. Kết quả do chủ dự án xác nhận ngày **12/10/2026** (file 16, dẫn lại tại file 21 §1).
3. **DOM automation — thao tác UI Business Manager như người dùng thật** (hướng đã chọn): UI luôn mang đủ quyền của phiên đăng nhập, không lệ thuộc scope token; phù hợp với khoảng ~20% tác vụ chỉ tồn tại trên UI (file 09, dẫn tại file 21 §1). Đánh đổi rõ ràng: vi phạm ToS ở mức kỹ thuật (xem §6.5) và mong manh trước thay đổi UI của Meta (xem §6.3).

### 1.3. Trạng thái dự án tại thời điểm lập tài liệu (12/10/2026)

- Đã hoàn thành **21 file research trong 3 vòng** (V1: khảo sát tác vụ & API; V2: hướng EAAG token; V3: hướng DOM automation sau pivot) — xem `docs/050-Research/Research-MOC.md`.
- **Prototype copilot từng chạy dry-run end-to-end trên BM thật** ở mức thử nghiệm nội bộ (chưa ghi dữ liệu thật, chưa phát hành) — chứng minh hướng DOM automation khả thi. Code prototype sau đó đã bị **xóa** để xây lại theo kiến trúc mới; giá trị giữ lại là thiết kế và bài học thực địa.
- Hướng EAAG token đã bị loại bỏ khỏi lộ trình sản phẩm; codebase đang dọn dẹp và tái cấu trúc theo kiến trúc DOM copilot (file 21).
- **Quyết định sản phẩm 12/10/2026 — "no in-page UI":** giao diện copilot đặt ở **side panel** (kèm popup/options), **không chèn UI vào trang Business Manager**; phần chạy trên trang chỉ là engine không hiển thị. Prototype cũ (panel trong trang) đã bị xóa; bản mới xây thẳng theo side panel (PRD-001 FR-01).

---

## 2. Cơ hội thị trường & đối thủ

### 2.1. Cơ cấu thị trường (file 10)

Thị trường tự động hóa Facebook BM chia 4 nhóm với triết lý khác hẳn nhau:

| Nhóm                                | Đại diện                                         | Mô hình                                                             | Giá tham khảo (10/2026)                                          |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A — SaaS official API (quốc tế)     | Birch (Revealbot), Madgicx, AdEspresso/Hootsuite | App Meta đã App Review; tập trung tối ưu ads (rules, AI, reporting) | Từ **$49/tháng** (Birch Essential) lên tới $5,000/tháng (Socioh) |
| B — iPaaS                           | Zapier, Make, n8n                                | Lead sync, CAPI; không chuyên BM                                    | Zapier bắt buộc gói trả phí cho Facebook Lead Ads                |
| C — Messaging                       | ManyChat, Pancake/Botcake                        | Hội thoại Messenger/IG/WA                                           | ManyChat Pro ~$15/tháng                                          |
| D — Tool "vận hành tài khoản" VN/CN | **BMTool.vn**, AdsPower, Hidemyacc, GPM Login    | Session/browser automation, tầng môi trường đa tài khoản            | BMTool freemium qua mã Zalo; GPM từ $9/tháng                     |

**Đối thủ trực tiếp duy nhất: BMTool.vn** — web app + Chrome extension 29.61 KiB (v1.7.2, cập nhật 07/2026), đã vượt Chrome Web Store review, đang bán đúng nhóm tác vụ mục tiêu (share BM/TKQC/pixel batch, backup đối tác, check live/die). Đây là đối chứng mạnh nhất rằng nhu cầu tồn tại và kênh phân phối CWS chấp nhận nhóm sản phẩm này.

### 2.2. Nhận định cơ hội

1. **Gap hybrid thật**: SaaS official không bao giờ chạm tác vụ share BM/pixel/đối tác (vì App Review không duyệt); tool VN chạm được nhưng UX thô, thiếu lớp kiểm soát rủi ro, kém bền. Chưa có sản phẩm nào phủ được cả hai thế giới (file 10, "Gap chưa ai làm tốt" #1).
2. **Khoảng trống giá < ~$10/tháng**: giữa SaaS $49+/tháng (không có tính năng cần) và tool VN miễn phí-nhưng-thô tồn tại khoảng trống cho sản phẩm "giá Việt Nam, chất lượng quốc tế" (file 10, gap #3). Mốc mục tiêu: solo < ~$10/tháng, gói agency theo số BM/profile (khuyến nghị file 10 §5 #8).
3. **Vòng đời tool VN rất ngắn = cơ hội thay thế**: loạt tên tuổi một thời đã chết domain tại thời điểm khảo sát (phanmemninja.com, maxcare.vn, fplus.vn, simpleaccount.vn/ATP, bigbom.com, upads.vn) — người dùng VN quen với churn và sẵn sàng chuyển sang sản phẩm mới nếu kênh phân phối (Zalo group) và thông điệp niềm tin đúng (file 10 §1).
4. **Không cần thay thế tầng antidetect**: người dùng mục tiêu đã dùng Hidemyacc/GPM/AdsPower; yêu cầu bắt buộc là extension **tương thích chạy bên trong** các môi trường đó, không cạnh tranh với chúng (file 10 §3.4).
5. **Meta native không lấp gap**: tính năng native chỉ thiên về tối ưu ads black-box; partner access vẫn thủ công từng asset/từng BM, không có template onboarding; audit quyền cross-BM hoàn toàn thủ công (file 12, gap #10). Ngày 11/10/2026 Meta gỡ "access verification" cho developer — tín hiệu nới điều kiện cho lộ trình official API sau này (file 12 §3.1).

### 2.3. Định vị sản phẩm

**"Copilot vận hành BM chạy ngay trong trình duyệt của bạn — không server, không giữ cookie/token, mọi hành động ghi đều có bạn duyệt."** Khác biệt cốt lõi so với BMTool.vn: human-in-the-loop bắt buộc theo tầng rủi ro, dry-run trước khi ghi, audit log để đối chiếu, và công khai giới hạn an toàn thay vì "multi-thread chạy thật nhanh". Điểm khác biệt bổ sung: **không chèn giao diện vào trang Facebook** — bảng điều khiển nằm ở side panel của trình duyệt, giúp bạn kiểm soát rõ ràng và giảm dấu vết extension trong trang Meta.

---

## 3. Mục tiêu kinh doanh (SMART)

### Giai đoạn 1 — Nội bộ làm việc thật (mục tiêu: 3 tháng kể từ 12/10/2026)

| #    | Mục tiêu                                                                                                                              | Thước đo                                                                                                                                        | Mốc          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| G1.1 | Đưa tool vào vận hành thật của team (internal dogfooding) cho nhóm tác vụ vận hành BM (BM-ops: partner, dataset, người dùng, kiểm kê) | ≥ 80% thao tác BM-ops thuộc các flow đã phát hành của team chạy qua extension thay vì thủ công                                                  | Cuối tháng 2 |
| G1.2 | Rút ngắn thời gian thao tác lặp                                                                                                       | Thời gian hoàn thành một quy trình onboarding/offboarding khách (chuỗi thao tác BM-ops: partner, người dùng, kiểm kê) giảm ≥ 50% so với làm tay | Cuối tháng 3 |
| G1.3 | Không sự cố an toàn tài sản                                                                                                           | 0 checkpoint/ban trên BM/TKQC chạy thử nghiệm gắn với extension trong suốt giai đoạn                                                            | Liên tục     |
| G1.4 | Chứng minh độ bền kỹ thuật                                                                                                            | Mỗi đợt "selector rot" (Meta đổi UI làm flow hỏng) được vá và phát hành lại trong ≤ 3 ngày làm việc                                             | Liên tục     |

### Giai đoạn 2 — Sản phẩm hóa freemium (mục tiêu: 6–12 tháng, quyết định go sau khi G1 đạt)

| #    | Mục tiêu                                                                               | Thước đo                                                                                                                        | Mốc               |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| G2.1 | Phát hành công khai bản read/audit + các flow ghi mức rủi ro thấp lên Chrome Web Store | Vượt CWS review; listing khai báo đúng Limited Use, privacy policy công khai                                                    | Q sau khi G1 đạt  |
| G2.2 | Dựng cộng đồng người dùng qua kênh VN                                                  | ≥ 500 thành viên nhóm Zalo; ≥ 200 người dùng hoạt động tuần                                                                     | +3 tháng sau G2.1 |
| G2.3 | Kiểm chứng mô hình trả phí                                                             | ≥ 20 tài khoản trả phí ở mức < ~$10/tháng (solo) hoặc gói agency                                                                | +6 tháng sau G2.1 |
| G2.4 | Quyết định lộ trình hợp lệ hóa                                                         | Dựa vào doanh thu & phản hồi G2 để quyết định đầu tư hồ sơ App Review cho nhóm tính năng official-API (rules, alerts, insights) | Cuối giai đoạn 2  |

> Ràng buộc công bằng: các mốc G2 phụ thuộc kết quả đánh giá lại rủi ro pháp lý (§6.5) trước khi go — việc phát hành công khai khả năng ghi hàng loạt có thể bị giới hạn ở bản nội bộ theo khuyến nghị compliance (file 11 §4.1 phase 3).

---

## 4. Phạm vi (Scope)

### 4.1. Trong phạm vi (In)

Tự động hóa thao tác UI Business Manager **trong phiên đăng nhập thật của chính người dùng**, luôn có human-in-the-loop (xem diff/dry-run trước khi ghi, xác nhận theo tầng rủi ro):

Sản phẩm được định vị là **nền tảng flow vận hành BM (BM-ops)**: một bộ engine an toàn dùng chung (dry-run, HITL, pacing, audit) và một **danh mục flow** mở rộng dần. Danh mục hiện nhắm tới:

1. **Gán/gỡ partner (đối tác) trên TKQC/BM** kèm quyền — flow tham chiếu đầu tiên (đi sâu nhất để kiểm chứng đường ống ghi), batch nhỏ có confirm nhiều lớp.
2. **Share pixel/dataset** giữa các BM/TKQC.
3. **Quản lý người dùng BM**: mời, đổi role, gỡ người — confirm nhiều lớp khi gán quyền cao hoặc xóa.
4. **Kiểm kê & audit read-only**: dashboard đa BM/TKQC (trạng thái, ngưỡng, chi tiêu, danh sách admin/đối tác), trạng thái chất lượng TKQC (chỉ đọc, không tự "Request review"), báo cáo ai chưa bật 2FA, export Excel, cảnh báo quyền bất thường.
5. **Bulk-organize rủi ro thấp**: đổi tên BM/TKQC, đặt nhãn/ghi chú nội bộ (lưu local).
6. **UI-assist cho tác vụ UI-only**: mở đúng màn BM (deep-link) + checklist hướng dẫn để người dùng tự bấm các bước nhạy cảm.
7. **Giao diện điều khiển ngoài trang (side panel)**: chọn flow, dry-run, confirm nhiều lớp, nhật ký chạy và kill-switch đặt ở side panel/popup/options của trình duyệt; không inject UI vào `business.facebook.com`.
8. **Nền vận hành an toàn**: pacing giống người thật, giới hạn ngày theo độ "cứng" BM, audit log append-only, fail-soft, tương thích antidetect browsers (Hidemyacc/GPM/AdsPower).

### 4.2. Ngoài phạm vi tuyệt đối (Out — vùng đỏ, theo file 11 §4.3)

1. **Tài chính**: thêm/sửa/xóa phương thức thanh toán, đổi billing threshold, thanh toán khoản nợ.
2. **Appeal/verification**: tự động nộp appeal, tự động xác minh doanh nghiệp, upload giấy tờ, trả lời Support inbox của Meta.
3. **Vượt checkpoint/identity**: CAPTCHA, 2FA, xác minh danh tính, fake account, nuôi nick, mua–bán–thuê tài khoản/BM.
4. **Rò rỉ credential**: thu/xuất cookie, token, mật khẩu ra khỏi máy người dùng; nhúng phiên vào server bên thứ ba (precedent Meta v. Octopus).
5. **Thu thập dữ liệu**: scraping dữ liệu sau login gửi về server ngoài; build dataset người dùng; resell data.
6. **Che giấu automation**: xoay IP/fingerprint, giả lập headless, lách enforcement (yếu tố "concealment" làm nặng mọi vụ kiện của Meta).
7. **Tối ưu quảng cáo**: rules, bidding, creative AI, reporting — không cạnh tranh với nhóm SaaS nhóm A ở giai đoạn này (để lộ trình official API sau).
8. **Messaging automation**: DM/comment bot (vũ trụ của ManyChat/Pancake — không đi lấn).

---

## 5. Stakeholders & giả định

### 5.1. Stakeholders

| Vai trò                 | Ai                                                              | Quan tâm chính                                                |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| Chủ dự án / Sponsor     | Founder agency                                                  | Giảm chi phí vận hành, an toàn tài sản, hướng thương mại hóa  |
| Người dùng Gđ1 (nội bộ) | Nhân sự vận hành BM của agency                                  | Ít thao tác tay lặp lại, không sợ "tool làm chết BM"          |
| Người dùng Gđ2 (ngoài)  | Agency/freelancer ads VN & ĐNÁ                                  | Giá Việt Nam, hỗ trợ tiếng Việt, chạy trong môi trường sẵn có |
| Đối tác phân phối       | Cộng đồng Zalo/Facebook group ngành ads                         | Kênh growth + support theo văn hóa tool VN                    |
| Chủ thể ràng buộc       | Meta (ToS/enforcement), Chrome Web Store / Firefox AMO (review) | Tuân thủ chính sách nền tảng & cửa hàng                       |
| Đội kỹ thuật            | Dev extension                                                   | Selector bền, kiến trúc fail-soft, quyền tối thiểu            |

### 5.2. Giả định business (cần kiểm chứng dần)

1. Nhu cầu BM-ops (partner, dataset, người dùng, kiểm kê) là đau thật và trả tiền được — giả định dựa trên sự tồn tại của BMTool.vn (đã qua CWS review, rating 5.0 suốt 2026) và hệ sinh thái thuê/share BM (file 10, 15). **[Kiểm chứng: G2.2–G2.3]**
2. Người dùng VN chấp nhận mô hình freemium + mã kích hoạt qua Zalo thay vì thanh toán thẻ quốc tế (file 10 §3.3).
3. Pacing "giống người thật" + giới hạn ngày đủ giữ rủi ro checkpoint ở mức chấp nhận được cho quy mô internal — định lượng tỉ lệ checkpoint **không tồn tại công khai**; mọi con số hiện có là heuristic cộng đồng [anecdotal] (file 15 §3.2).
4. Meta sẽ tiếp tục không mở official API cho các flow UI-only trong 12–18 tháng tới → gap sản phẩm không tự biến mất (file 01 §3.6, file 12).
5. Chrome Web Store tiếp tục cho phép nhóm extension tương tác BM với khai báo đúng (precedent BMTool; rủi ro ngược lại xem §6.2).
6. Người dùng agency chấp nhận làm việc với **side panel cạnh trang BM** thay vì bảng điều khiển ngay trong trang (ít trực quan hơn một chút, đổi lại an toàn/kiểm soát hơn) — **[Kiểm chứng: G1 qua phản hồi nội bộ/pilot]**; đồng thời giả định "UI ngoài trang giảm rủi ro bị Meta nhận diện extension" **chưa có bằng chứng** — chỉ chắc chắn là giảm dấu vết DOM, không giảm rủi ro hành vi.

---

## 6. Rủi ro business & giảm thiểu

| #   | Rủi ro                                                                                                                                                                                                                                                          | Mức                                                                   | Mitigation                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | **Cascade-ban tài sản Meta**: một tài khoản bị flag automation kéo theo pages/TKQC/BM liên kết bị suspend; appeal gần như do AI xử lý, khó gỡ (BBC 5–7/2025; file 11 §1, §3.2)                                                                                  | Cao                                                                   | Human-in-the-loop bắt buộc cho mọi write; pacing 3–8s + jitter, giới hạn ngày theo độ cứng BM (khung heuristic file 15 §4); chặn write lên BM/TKQC mới tạo hoặc đang có vấn đề; fail-soft dừng toàn bộ khi có dấu hiệu checkpoint; cảnh báo user không chạy nhiều phiên trên cùng thiết bị/IP; không giả lập/che giấu hành vi                                                                   |
| 6.2 | **CWS review từ chối / gỡ extension**: vi phạm Limited Use, xin quyền thừa, nhầm brand Meta, hoặc chính sách siết (file 11 §3.4)                                                                                                                                | Cao                                                                   | Quyền chỉ `business.facebook.com` (không `<all_urls>`); single-purpose statement; privacy policy công khai + Limited-Use disclosure; không inject quảng cáo/UI nào vào facebook.com (UI nằm ở side panel; khai báo thêm quyền `sidePanel` trên Chrome trong single-purpose statement); tên không đụng brand Facebook/Meta/Ads Manager; kênh phân phối dự phòng (bản tự cài nội bộ, Firefox AMO) |
| 6.3 | **Selector rot**: Meta deploy UI Comet thường xuyên → flow hỏng không báo trước (file 10 §3.5, file 15 §1)                                                                                                                                                      | Cao (tần suất) — Trung bình (thiệt hại)                               | Lớp locator đa tầng (role/aria/text/cấu trúc) + nhãn song ngữ EN/VI + self-healing; selector registry versioned; health-check tự động; SLA vá ≤ 3 ngày (KPI G1.4); fail-soft báo "Meta vừa đổi UI" thay vì click sai                                                                                                                                                                            |
| 6.4 | **Phát hiện automation về hành vi**: tốc độ/tần suất/pattern giống nhau giữa phiên là tín hiệu detection hàng đầu (file 15 §3.1)                                                                                                                                | Trung bình                                                            | Pacing/jitter mặc định không cho tắt; ngân sách thao tác/ngày theo độ cứng BM; không multi-thread trá hình; không đồng bộ hành vi giữa các BM; audit log để điều chỉnh pacing từ dữ liệu thật; UI đặt ngoài trang (side panel) chỉ giảm dấu vết DOM, không thay thế các biện pháp pacing                                                                                                        |
| 6.5 | **Rủi ro pháp lý ToS**: UI automation là "automated means" bị ToS cấm; precedents Meta v. BrandTotal/Unimania (extension), Octopus, Voyager đều thua Meta; Bright Data thắng chỉ vì logged-out public data — không cứu được logged-in automation (file 11 §1–2) | Cao (lý thuyết) — nhưng enforcement với tool cỡ nhỏ chưa có precedent | Không che giấu (concealment = làm nặng); không thu cookie/token ra khỏi máy (Octopus line); dữ liệu tối thiểu, xử lý local; GĐ2 chỉ public nhóm tính năng read/audit + write rủi ro thấp, cân nhắc giữ flow ghi hàng loạt ở bản nội bộ (theo file 11 §4.1); lộ trình App Review hợp lệ hóa song song; sẵn sàng sunset tính năng nếu Meta gửi notice                                             |
| 6.6 | **Vòng đời sản phẩm ngắn như đa số tool VN** (minh chứng loạt domain chết, file 10 §1)                                                                                                                                                                          | Trung bình                                                            | Niềm tin qua minh bạch (audit log, giới hạn công khai, privacy policy), support Zalo phản hồi nhanh, giá mềm, cam kết vá selector-rot — biến "bền" thành khác biệt cạnh tranh                                                                                                                                                                                                                   |
| 6.7 | **Phụ thuộc một kênh/chủ thể**: Meta đổi chính sách enforcement bất ngờ; kênh Zalo group bị kẹt                                                                                                                                                                 | Trung bình                                                            | Không vendor lock hệ sinh thái nặng; đa kênh phân phối (CWS + AMO + tự cài); lộ trình official API là B-đường dài hạn (§8)                                                                                                                                                                                                                                                                      |

---

## 7. Chỉ số thành công cấp business (KPI)

| Nhóm                   | KPI                                                                           | Mục tiêu                                         |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| Hiệu quả vận hành (G1) | % thao tác BM-ops (các flow đã phát hành) chạy qua extension tại nội bộ       | ≥ 80% (cuối tháng 2 G1)                          |
| Hiệu quả vận hành (G1) | Thời gian 1 quy trình onboarding/offboarding khách                            | Giảm ≥ 50% vs. thủ công                          |
| An toàn (G1)           | Số checkpoint/ban trên tài sản chạy thử                                       | 0                                                |
| Độ bền (G1)            | Thời gian vá selector rot                                                     | ≤ 3 ngày làm việc/đợt                            |
| Chất lượng vận hành    | Tỉ lệ phiên chạy kết thúc fail-soft an toàn (không click sai, không ghi nhầm) | 100% — mọi lỗi phải dừng & báo, không "bấm tiếp" |
| Tăng trưởng (G2)       | Người dùng hoạt động tuần sau public                                          | ≥ 200 (sau 3 tháng)                              |
| Thương mại (G2)        | Tài khoản trả phí                                                             | ≥ 20 (sau 6 tháng public)                        |
| Giữ chân (G2)          | Tỉ lệ người dùng trả phí gia hạn tháng thứ 2                                  | ≥ 70%                                            |

> KPI kỹ thuật chi tiết (độ phủ flow, thời gian chạy từng step, tỉ lệ verify thành công sau ghi...) thuộc phạm vi PRD/NFR, không liệt kê ở đây.

---

## 8. Lộ trình cấp cao

Lộ trình bám theo các pha **M0–M4** đã chốt trong tài liệu kiến trúc (file 21 §lộ trình); ở tầng business, mỗi pha tương ứng một mốc giá trị:

| Pha    | Giá trị business tương ứng                                                                                                                                                         | Phục vụ mục tiêu          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **M0** | Nền sản phẩm sạch: quyền tối thiểu đúng compliance, panel copilot (side panel, content script headless trên BM) hiện diện — điều kiện tiên quyết để qua review & gây niềm tin      | G1.3, G2.1 (chuẩn bị)     |
| **M1** | Chạy được **kiểm kê/audit read-only** đầu tiên trên BM thật — giá trị thấy ngay, rủi ro ~0                                                                                         | G1.1 (phần đọc)           |
| **M2** | Ghi thật lần đầu ở tác vụ **dễ đảo ngược** (đổi tên), kèm hạ tầng an toàn (confirm nhiều lớp, audit log) — chứng minh vòng lặp "dry-run → duyệt → ghi → đối soát"                  | G1.1, G1.3                |
| **M3** | Flow **chỉ định partner** (flow tham chiếu đầu tiên) có dry-run/confirm 2 lớp/batch nhỏ — đúng nỗi đau ăn tiền của thị trường, đồng thời chứng minh đường ống ghi cho các flow sau | G1.1, G1.2                |
| **M4** | **Mở rộng danh mục flow** (share pixel/dataset, quản lý người dùng, chất lượng TKQC/2FA) + tinh chỉnh pacing từ audit thực địa — hoàn thiện bộ tác vụ BM-ops cốt lõi               | G1.2; gate đánh giá go G2 |

2 pha tiếp theo ở tầng business (ngoài M0–M4):

- **G2 — Sản phẩm hóa**: đóng gói public (CWS/AMO), onboarding qua Zalo, freemium + mã kích hoạt; kèm hoàn thiện tương thích antidetect browsers.
- **Hợp lệ hóa dài hạn**: chuẩn bị hồ sơ Meta App (Business Verification + App Review) cho nhóm tính năng official-API (rules, alerts, insights) để phục vụ phân khúc "white-hat" — tín hiệu thuận lợi: Meta vừa gỡ access verification (11/10/2026, file 12 §3.1); quyết định đầu tư theo KPI G2.4.

---

## 9. Nguồn tham khảo

Toàn bộ số liệu trong BRD này dẫn từ bộ research nội bộ (3 vòng, kết thúc 12/10/2026):

| File                                                                   | Dùng cho                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `docs/050-Research/Research-MOC.md`                                    | Bản đồ 21 file research 3 vòng; bối cảnh pivot                                                                                     |
| `docs/050-Research/01-meta-apis-overview.md`                           | Đường official API: App Review, Full access tier, `business_management` khó duyệt; phạm vi tác vụ official phủ được                |
| `docs/050-Research/10-existing-tools.md`                               | Cơ cấu thị trường 4 nhóm, BMTool.vn (29.61 KiB, v1.7.2, 07/2026), giá SaaS $49+, churn tool VN, gap hybrid + khoảng trống giá <$10 |
| `docs/050-Research/11-policy-compliance.md`                            | 3 tầng rủi ro, cascade-ban (BBC), precedents kiện (BrandTotal/Octopus/Voyager/Bright Data), CWS Limited Use, vùng đỏ §4.3          |
| `docs/050-Research/12-native-meta-automation.md`                       | Gap native của Meta (partner access thủ công, không onboarding template); Meta gỡ access verification 11/10/2026                   |
| `docs/050-Research/15-browser-session-ops-practice.md`                 | Thực hành thị trường (M1/M2/M3), tín hiệu Meta flag, heuristic pacing & giới hạn ngày, checklist vận hành an toàn                  |
| `docs/050-Research/16-test-plan-eaag-agencies.md` (dẫn qua file 21 §1) | Kết quả FAIL-WRITE của hướng EAAG — căn cứ pivot                                                                                   |
| `docs/050-Research/21-architecture-dom-copilot.md` (§1 bối cảnh pivot) | Xác nhận pivot 12/10/2026, nguyên tắc guardrail, khung pha M0–M4                                                                   |

---

_Tài liệu này ở trạng thái `draft` — cần review với chủ dự án trước khi chuyển `approved`. Chi tiết tính năng (FR/NFR) được đặc tả trong PRD (020.20), không trùng lặp tại đây._
