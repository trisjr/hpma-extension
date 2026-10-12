---
id: GLOSSARY-001
type: glossary
status: draft
created: 2026-10-12
---

# Glossary (Từ điển Thuật ngữ)

- **MV3 (Manifest V3)**: Phiên bản manifest hiện hành của Chrome extension, dùng service worker thay background page.
- **Content Script**: Script chạy trong ngữ cảnh trang web. Trong dự án này chạy headless (chỉ engine, không render UI); UI copilot nằm ở side panel/popup/options.
- **Side panel**: Bề mặt UI chính của copilot, ngoài DOM trang (Chrome `sidePanel`, Firefox `sidebar_action`).
- **Service Worker**: Background script của extension (Chrome), vòng đời do trình duyệt quản lý.
- **Popup / Options**: Các UI surface của extension, xem `src/popup/`, `src/options/`.

_(Thêm thuật ngữ dự án tại đây.)_
