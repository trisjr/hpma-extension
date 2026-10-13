---
id: ROADMAP-001
type: roadmap
status: draft
created: 2026-10-12
updated: 2026-10-13
related:
  [PRD-001, SPEC-ENG-001, SPEC-UI-001, SPEC-UI-002, SPEC-UI-003, SPEC-UI-004]
---

# Project Roadmap

> Nguồn: PRD-001 §4.1b, §4.4, §8 (lộ trình M0–M4) đối chiếu với code tại **v0.3.0** (13/10/2026). Nguyên tắc cổng của PRD giữ nguyên: **không qua gate → không sang phase**. Trạng thái ghi theo code thực tế; khi lệch PRD thì ghi rõ để cập nhật PRD sau.

## 1. Hiện trạng (v0.3.0)

| Hạng mục                                                                | Trạng thái   | Ghi chú                                                                   |
| :---------------------------------------------------------------------- | :----------- | :------------------------------------------------------------------------ |
| Content script headless + side panel + popup + options (FR-01)          | Done (khung) | Chrome + Firefox; P-1 mới test trên BM giả                                |
| Action engine: dry-run, Assist, pacing, curfew, ngân sách ghi (FR-03/6) | In-progress  | Có code + test jsdom; chưa kiểm chứng trên BM thật; chưa có mode `full`   |
| Flow gán partner vào TKQC, gồm cả partner có sẵn (FR-04)                | In-progress  | Chỉ Dry-run/Assist; `Full` vẫn `FULL_LOCKED`; `dialog.*` còn `unverified` |
| Audit log + trang Options (FR-07)                                       | In-progress  | SPEC-UI-004; chưa kiểm chứng trên BM thật                                 |
| Load ad accounts vào side panel (một phần FR-08)                        | In-progress  | Graph API là optional permission trên Chrome và Firefox (≥ 128)           |
| Probe + SelectorRegistry (FR-02)                                        | In-progress  | Có locator/selectors/labels; chưa có probe P0 và báo cáo hit-rate         |
| Test tự động                                                            | Có           | Vitest + jsdom, 290 test; `pnpm test` và pre-commit; không có CI          |
| Kill-switch, resync khi mất tab BM, nút Undo                            | Chưa làm     | SPEC-UI-003 §7 ghi "handler nối ở M2"; Undo hiện khoá chờ FR-09           |

> Trạng thái dùng thuật ngữ của PRD-001 §4.1 (đã cập nhật 13/10/2026): "Done" chỉ khi đã kiểm chứng; có code nhưng chưa chạy trên BM thật là "In-progress".

## 2. Các mốc

### R0 — Chốt nền (tuần này)

Mục tiêu: tài liệu khớp code, có nền test trước khi mở rộng.

- [x] Duyệt 5 spec (`SPEC-ENG-001`, `SPEC-UI-001…004`) → `approved` (13/10/2026)
- [x] Cập nhật PRD-001 §4.1, §4.2, §8, §9 và mục 10 theo trạng thái code (FR-02…FR-08, Q2 bỏ `hasFocus`)
- [x] Thêm Vitest + jsdom (290 test, 22 file) cho engine, pacing, `adAccounts`, flows; chạy bằng `pnpm test` và pre-commit (không có CI)
- [x] Chạy `extension-security-reviewer` và `cross-browser-checker` trên v0.3.0: 0 Critical/High/Medium
- [x] Sửa theo review: `engines.node >=22.22.2`, `tsconfig.build.json` (build không type-check `tests/`), Firefox `strict_min_version 128.0` + Graph chuyển sang optional, tự host font Montserrat
- [ ] Chạy lại `extension-security-reviewer` trên thay đổi manifest/HTML ở mục trên
- [ ] Thử tay `dist_chrome/` và `dist_firefox/` (Firefox 128): xin quyền Graph từ side panel, font hiển thị đúng

**Gate:** test chạy xanh; PRD khớp code.

**Backlog từ review v0.3.0 (Low, không chặn gate; chi tiết ở [QA-REPORT-001](../035-QA/QA-REPORT-001-r0-review.md)):**

- Low 2: `web_accessible_resources` cho phép trang BM dò ra extension qua `chrome-extension://<id>/assets/...`. Cần build content script thành một file không qua loader (crxjs 2.0.3 gán cứng `use_dynamic_url: false`).
- Low 3: bộ trích token (`src/shared/adAccounts.ts:109`) decode `\"` nên có thể nhận nhầm chuỗi `accessToken` nằm trong tên TKQC do người ngoài đặt. Cần parse JSON theo key path; sửa comment dòng 97-98.
- Low 4: draft wizard và `lastRun` của simulator lưu nguyên BM ID/tên TKQC trong `storage.local`, không theo `logDetail`. Ghi rõ trong docs; redact `lastRun` ở simulator.

### R1 — Probe và an toàn vận hành (FR-02, FR-06 phần còn lại)

Mục tiêu: đủ bằng chứng để biết selector còn đúng và dừng được khi cần.

- [ ] Probe P0 + báo cáo JSON (hit-rate từng key, kèm locale/phiên)
- [ ] Probe lại ở trạng thái dialog-đã-chọn-asset để xác minh `dialog.accessPartial`, `dialog.taskManage*` (blocker duy nhất trước write, PRD §4.3)
- [ ] **Kill-switch** ở footer side panel và popup, nối vào `run.stop`
- [ ] **Mất kết nối tab BM giữa run:** trạng thái `paused`, `re-sync`, huỷ run nếu đổi BM (SPEC-UI-003 §7)
- [ ] Xử lý trạng thái TKQC khác (tắt, chờ duyệt) trong SPEC-UI-002 Q3

**Gate (PRD §8):** probe ≥ 95% trên EN/vi_VN × Chrome/Firefox; dry-run 100% bước 1–5 lặp lại được.

### R2 — Write an toàn đầu tiên (FR-12, FR-08)

Mục tiêu: chứng minh đường ống write → verify → audit bằng thao tác rủi ro thấp nhất.

- [ ] **Rename TKQC** (FR-12), ghi đảo ngược được, là write đầu tiên
- [ ] HITL 2 lớp đúng ma trận (FR-05), kèm walk-through lần đầu trên một BM
- [ ] Flow đọc kiểm kê đầy đủ (FR-08): BM, TKQC, partner hiện có; nhận diện loại BM
- [ ] Cân nhắc chuyển policy gate sang background broker (SPEC-ENG-001 Q4/Q5) nếu cần khoá liên tab

**Gate:** rename + đổi lại tên cũ pass trên staging; audit đủ trường cho mọi write.

### R3 — Flow tham chiếu mở write (FR-04, FR-09)

Mục tiêu: mở `Full` cho gán partner, kèm đường undo.

- [ ] **Flow gỡ partner** (FR-09), confirm 2 lớp, tính vào ngân sách ghi
- [ ] Nút `Gỡ lại (undo)` trong Result (SPEC-UI-003 Q3) mở khoá
- [ ] Mở chế độ `Full` cho gán partner sau khi qua gate ghi

**Gate ghi (PRD §8):** probe ≥ 95% + dry-run 100% + vá xong `dialog.*` + R2 pass; sau đó **30 ngày staging, 0 checkpoint, 0 ghi sai, 0 lặp request**.

### R4 — Mở rộng danh mục flow (FR-10, FR-13, FR-14, FR-15, FR-11)

Mở sau khi R3 ổn định 30 ngày. Thứ tự theo rủi ro tăng dần.

- [ ] Phần đọc của FR-14 (chất lượng TKQC) và FR-15 (báo cáo 2FA)
- [ ] Share dataset/pixel (FR-10), quản lý người dùng BM (FR-13)
- [ ] Self-healing (FR-11): chạy trên read trước, write sau với ngưỡng cao hơn
- [ ] Hiệu chỉnh hằng số pacing từ audit thực địa

**Gate:** R3 pass ổn định 30 ngày.

## 3. Thứ tự và phụ thuộc

```text
R0 ──► R1 ──► R2 ──► R3 ──► R4
        │             ▲
        └ probe + dialog.* là điều kiện mở write
```

- Không flow ghi nào được ship thiếu HITL, pacing và audit (PRD §4.4).
- FR-09 làm song song với bài test write của FR-04 để có đường rollback.
- Phần đọc của FR-14/FR-15 có thể làm sớm song song với FR-08 vì rủi ro gần 0.

## 4. Rủi ro chính

| Rủi ro                                            | Ảnh hưởng          | Giảm thiểu                                                                                  |
| :------------------------------------------------ | :----------------- | :------------------------------------------------------------------------------------------ |
| Meta đổi UI, selector gãy                         | Flow dừng          | Probe định kỳ, nhãn/selector là dữ liệu versioned, fail-soft                                |
| Behavioral detection (timing, hành vi phi vật lý) | Cao: checkpoint TK | Pacing + jitter, curfew, giới hạn ghi/ngày; hiệu chỉnh hằng số bằng audit                   |
| Quyền Graph/token extraction bị CWS review        | Chặn phát hành     | Giữ optional permission, rà bảo mật mỗi release; token extractor còn Low 3 (xem báo cáo QA) |
| Test chỉ chạy trên jsdom, chưa trên BM thật       | Hồi quy ẩn         | Probe P0 (R1) và thử tay trước mỗi release; `pnpm test` + `pnpm typecheck` ở pre-commit     |

## 5. Câu hỏi mở

- Ngày mục tiêu cho từng mốc: chưa có, cần anh chốt.
- Có cần Firefox đạt ngang Chrome ở từng gate hay chỉ ở gate ghi (R3)?
