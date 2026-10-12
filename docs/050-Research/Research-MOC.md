---
id: MOC-RESEARCH
type: moc
status: draft
created: 2026-10-12
---

# Research Map of Content (MOC)

Phân tích, nghiên cứu đối thủ, phỏng vấn người dùng, khảo sát — dùng [Template-Analysis](../999-Resources/Templates/Template-Analysis.md).

## Vòng 1 — Khảo sát tác vụ tự động hóa Facebook BM (12/10/2026)

| File                          | Nội dung                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| [[01-meta-apis-overview]]     | Hệ sinh thái API Meta (Graph/Marketing v26), auth, permissions, rate limits                     |
| [[02-ads-automation]]         | Tự động hóa Ads Manager: bulk ops, Ad Rules API, Advantage+, webhooks                           |
| [[03-pages-content]]          | Pages & nội dung: đăng/lên lịch đa page, moderation comment, auto-reply                         |
| [[04-bm-admin-assets]]        | BM admin & assets: users, phân quyền, `/agencies` (chỉ định đối tác), share pixel, system users |
| [[05-pixel-events-capi]]      | Pixel/Dataset, Conversions API, AEM, domain verification                                        |
| [[06-audiences-catalog]]      | Custom/Lookalike Audience, Catalog & feed                                                       |
| [[07-leads-messaging]]        | Lead Ads, Messenger/IG DM, WhatsApp Cloud API                                                   |
| [[08-reporting-insights]]     | Insights API, báo cáo định kỳ, billing watchdog                                                 |
| [[09-extension-techniques]]   | Kỹ thuật extension MV3 trên BM: DOM, GraphQL nội bộ, EAAG token                                 |
| [[10-existing-tools]]         | Survey công cụ thị trường (Revealbot/Birch, Madgicx, BMTool.vn...)                              |
| [[11-policy-compliance]]      | Chính sách Meta, ToS, vạch đỏ, giảm rủi ro                                                      |
| [[12-native-meta-automation]] | Tính năng tự động native của Meta & gap còn lại                                                 |

## Vòng 2 — Hướng token & trình duyệt (không cần app review) (12/10/2026)

| File                                  | Nội dung                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [[13-eaag-token-bm-tasks]]            | Trích EAAG token từ phiên BM, endpoint nào gọi được, rate limit & lỗi                          |
| [[14-partner-assign-mapping-graphql]] | Mapping quyền UI → `permitted_tasks`/`tasks`, GraphQL nội bộ cho chỉ định đối tác, payload mẫu |
| [[15-browser-session-ops-practice]]   | Cách tool thị trường làm (BMTool.vn...), rủi ro thực tế, checklist vận hành an toàn            |
| [[16-test-plan-eaag-agencies]]        | Test plan: xác minh EAAG gọi được `POST /act_{id}/agencies` trên BM thật                       |

## Vòng 3 — Hướng DOM automation (pivot 12/10/2026)

> Pivot: hướng EAAG token → Graph API vướng lỗi permission (token first-party scope hạn chế, edge ghi nhạy cảm như `/agencies` trả thiếu quyền). Chuyển sang **tự động thao tác UI Business Manager như user thật** — UI luôn mang đủ quyền của phiên đăng nhập. Đồng thời dọn code devtest EAAG trong `src/`.

| File                            | Nội dung                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [[17-dom-locator-resilience]]   | Locator bền trên Comet SPA: 5 tầng role/aria/text/cấu trúc/fiber, nhãn song ngữ, React input, SPA navigation, self-healing                                                                          |
| [[18-bm-ui-flows]]              | Mapping tác vụ → luồng click trên Business Settings (gán/gỡ partner, share pixel, invite people, account quality, 2FA...)                                                                           |
| [[19-humanlike-pacing-safety]]  | Pacing giống người thật, ngân sách thao tác theo độ cứng BM, phát hiện checkpoint trên UI, luật dừng khẩn cấp                                                                                       |
| [[20-rpa-recorder-patterns]]    | Bài học machinery từ RPA (Hidemyacc/AdsPower/UI.Vision), recorder, port locator engine vào MV3, self-healing, orchestration                                                                         |
| [[21-architecture-dom-copilot]] | Đề xuất kiến trúc DOM copilot cho hpma-extension: content script headless + UI ở side panel/popup/options (không inject vào trang), step-machine, primitives, HITL 4 tầng, audit log, manifest prod |
