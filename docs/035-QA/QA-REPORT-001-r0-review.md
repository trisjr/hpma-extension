---
id: QA-REPORT-001
type: qa-report
status: draft
created: 2026-10-13
related: [ROADMAP-001, PRD-001, SPEC-ENG-001]
---

# QA-REPORT-001 — Review bảo mật và cross-browser v0.3.0 (mốc R0)

Phạm vi: v0.3.0 (HEAD `0916a92`) cùng thay đổi chưa commit của R0 (Vitest/jsdom, `tests/`, lint-staged). Hai agent chỉ đọc: `extension-security-reviewer` và `cross-browser-checker`. Chưa thử tay trên trình duyệt thật.

## 1. Kết quả tổng

| Nguồn               | Critical | High | Medium | Low |
| :------------------ | :------- | :--- | :----- | :-- |
| Security review     | 0        | 0    | 0      | 4   |
| Cross-browser check | 0        | 0    | 2      | 3   |

Không có lỗi chặn release.

## 2. Phát hiện bảo mật (Low)

| #   | Vấn đề                                                                                                                                                                                               | Trạng thái                                                                                        |
| :-- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| L1  | Popup, Options, Side panel tải Montserrat từ Google Fonts, mỗi lần mở panel gọi tới bên thứ ba (`src/*/index.html`)                                                                                  | **Đã sửa trong R0**: tự host qua `@fontsource-variable/montserrat`, `src/assets/styles/fonts.css` |
| L2  | `web_accessible_resources` (7 chunk, chỉ match BM) cho phép trang BM dò ra extension qua `chrome-extension://<id>/assets/...`. crxjs 2.0.3 gán cứng `use_dynamic_url: false`                         | Backlog: build content script thành một file không qua loader                                     |
| L3  | Bộ trích token (`src/shared/adAccounts.ts:109`) decode `\"` rồi match, nên chuỗi `"accessToken":"EAA…"` nằm trong tên TKQC do người ngoài đặt có thể bị nhận nhầm. Comment dòng 97-98 chưa chính xác | Backlog: parse JSON theo key path; sửa comment                                                    |
| L4  | Draft wizard (`usePartnerDraft.ts:48-50`) và `lastRun` của simulator (`useRunSimulator.ts:67-70`) lưu nguyên BM ID/tên TKQC vào `storage.local`, không theo `logDetail`                              | Backlog: ghi rõ trong docs; redact `lastRun` ở simulator                                          |

## 3. Phát hiện cross-browser

| Mức    | Vấn đề                                                                           | Trạng thái                                                                                                |
| :----- | :------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| Medium | `strict_min_version` 127.0 lệch yêu cầu Firefox ≥ 128                            | **Đã sửa**: `128.0`                                                                                       |
| Medium | Firefox khai Graph là `host_permissions` bắt buộc, Chrome thì optional           | **Đã sửa**: MDN BCD ghi `optional_host_permissions` Firefox 128+; Graph chuyển sang optional trên Firefox |
| Low    | `tsconfig.json` có `"types"` nằm ngoài `compilerOptions`                         | **Đã sửa**                                                                                                |
| Low    | `useAdAccounts.ts:191` không được dựa vào `change.url` (thiếu quyền `tabs`)      | Không cần sửa                                                                                             |
| Low    | Firefox dùng `service-worker-loader.js` làm background script với `type: module` | Hợp lệ từ Firefox 112; thử tay một lần ở `about:debugging`                                                |

## 4. Đã kiểm và ổn

- **Quyền:** chỉ `storage` (+ `sidePanel` Chrome); không `tabs`, `activeTab`, `<all_urls>`; content script chỉ match `https://business.facebook.com/*`; `permissions.request` gọi đồng bộ trong click handler; `permissions.contains` kiểm ở cả panel và background; không có CSP tuỳ chỉnh hay `externally_connectable`.
- **Token:** content script gửi token cho background, background chỉ trả danh sách account; token không lưu storage, không log; regex `EAA[A-Za-z0-9_-]{20,4096}` chặn header injection; fetch Graph dùng `redirect: 'error'`, không theo `paging.next`; `businessId` chỉ chữ số; `edge` chỉ nhận 2 giá trị cố định.
- **Messaging:** kiểm `sender.id`; lệnh run/account/location chỉ nhận từ extension page; background yêu cầu `sender.tab` + origin BM + `business_id` khớp `sender.url`; kiểm `runId` cho stop/assistDone; `config` được validate lại bằng `parseRunConfig`; không có `onMessageExternal` hay `window.postMessage`.
- **Content script headless:** không có `createElement`/`appendChild`/`setAttribute`/`innerHTML` trong `src/content`.
- **Audit/storage:** mặc định `logDetail: 'off'`, tự về `off` sau 24 giờ; audit và `lastRun` của engine được redact; export CSV chặn CSV injection; không dùng `storage.sync`.
- **XSS/remote code:** không có `innerHTML`, `eval`, `new Function`, `setTimeout` nhận chuỗi.
- **Build:** `pnpm build` và `pnpm build:firefox` thành công; cấu hình test không lọt vào `dist_*`.
- **Manifest hai browser:** khác biệt chỉ nằm ở các khóa riêng từng browser; runtime dùng `browser.*`, chỗ duy nhất dùng `chrome.*` là `src/utils/openSidePanel.ts` (có feature-detect).

## 5. Review lại sau các sửa của R0

`extension-security-reviewer` chạy lại trên thay đổi manifest Firefox, font tự host và `tsconfig.build.json`: **0 Critical/High/Medium, không có Low bảo mật mới.**

- `dist_firefox/manifest.json`: `host_permissions` chỉ còn BM, `optional_host_permissions` có Graph, `strict_min_version` 128.0; bản Chrome không đổi.
- Luồng xin quyền đúng: `permissions.request` trong click handler không có `await` đứng trước; `permissions.contains` kiểm ở panel và background trước khi lấy token hoặc gọi Graph. Không còn chỗ nào giả định Firefox có sẵn quyền Graph lúc cài.
- Font: không còn request tới Google trong `src/`, `dist_chrome/`, `dist_firefox/`; 3 file woff2 nằm trong `assets/fonts/`, không thuộc `web_accessible_resources`; gói npm chỉ có CSS/woff2/JSON/SCSS, không script, không dependency.
- `tsconfig.build.json` kế thừa `noEmit`, không đổi bundle; vitest/jsdom không lọt vào `dist_*`.
- Kiểm gate: lỗi type cố ý trong `tests/` làm `pnpm typecheck` fail nhưng không làm bước `tsc` của build fail; `pnpm typecheck` đã nối vào `.husky/pre-commit`.

Việc nên làm tiếp, không chặn ship:

- Thiếu test cho luồng xin quyền ở panel: mock `browserMock.ts` không có `permissions.request` và `contains` mặc định `true`; chưa có test cho `useAdAccounts.ts:81-91` (`contains` false thì báo lỗi `access`, không gửi `tabs.sendMessage`) và `grantAccess` (`request` true thì đọc lại).

## 6. Chưa kiểm

- Nạp thử `dist_chrome/` và `dist_firefox/` (Firefox 128) vào trình duyệt thật.
- Firefox: `permissions.request` từ side panel có thực sự hiện prompt không; hành vi của bản nâng cấp từ cài đặt cũ đã được cấp Graph lúc cài.
- Hiển thị font Montserrat trên 3 trang (popup, options, side panel).
