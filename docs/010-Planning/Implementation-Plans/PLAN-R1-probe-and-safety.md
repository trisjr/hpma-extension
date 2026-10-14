---
id: PLAN-R1
type: implementation-plan
status: draft
created: 2026-10-14
related:
  [ROADMAP-001, PRD-001, SPEC-ENG-001, SPEC-UI-002, SPEC-UI-003, QA-REPORT-002]
---

# PLAN-R1 — Probe và an toàn vận hành

Mục tiêu (Roadmap R1): đủ bằng chứng để biết selector còn đúng, và dừng được run khi cần. **Đây là kế hoạch đóng khoảng trống**: phần lớn R1 đã có code, chỉ thiếu vài điểm cụ thể bên dưới.

## 1. Hiện trạng đối chiếu với code (14/10/2026, v0.5.1)

| Mục Roadmap R1                   | Thực tế trong code                                                                                                                                                                                        | Còn thiếu                                                                                            |
| :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| Probe P0 + báo cáo               | `src/content/engine/probe.ts`, `src/shared/probe.ts`, `ProbeScreen`, `useProbe` đã có; báo cáo lưu theo stage (`ProbeReports`)                                                                            | Xem §2: 2 lỗi thiết kế khiến hit-rate không thể đạt 95%; chưa kiểm tra có xuất JSON không            |
| Probe lại ở dialog-đã-chọn-asset | `dialog.*` dùng chung một stage                                                                                                                                                                           | Phụ thuộc §2.2                                                                                       |
| Kill-switch                      | Nút ở footer side panel và popup **không có `onClick`** ("Handler nối ở M2"). Đã có cờ `EMERGENCY_KEY` trong `storage.local`; content script đọc khi bắt đầu run (`loadGates`) và từ chối `ERR_EMERGENCY` | Chưa ai ghi cờ từ nút; content script không nghe `storage.onChanged` nên run đang chạy không dừng    |
| Mất kết nối tab BM giữa run      | `lostRun` (`useRunEngine.ts`) xử lý reload tab; trạng thái `paused` có trong `RunStatus` nhưng chỉ dùng cho simulator (`scenario: 'disconnect'`)                                                          | Content script không phát hiện đổi BM (`business_id`) giữa run; watcher chỉ xét `pathname` nguy hiểm |
| TKQC trạng thái khác             | `adAccounts.ts:148`: `account_status === 1` là `active`, còn lại `restricted` → bị chặn; SPEC-UI-002 Q3 đã chốt                                                                                           | Xong về chặn. Chưa phân biệt lý do (tắt/chờ duyệt) trong nhãn, chờ capture ở FR-08                   |

## 2. Hai lỗi probe cần sửa trước khi đo thực địa

Nếu không sửa, dữ liệu thực địa phải đo lại hai lần.

1. **Stage `detail` không có bộ nhận diện.** `stageOfKey` gán `partner.*` vào `detail`, nhưng `detectStage()` chỉ trả `page | menu | dialog`. Các key này không bao giờ được đo, cổng ghi (PRD §4.3 điểm 4) mãi đóng.
2. **Mọi key `dialog.*` dùng chung một stage.** Khi dialog mở, probe lấy mẫu cả key của các bước khác (`dialog.bmId` ở bước nhập ID, `dialog.accessPartial` và `dialog.task*` ở bước chọn quyền). Key chưa hiển thị bị tính là trượt, nên hit-rate của dialog không thể đạt 95% trong một lần probe. Hướng sửa: tách sub-stage theo bước wizard, hoặc gộp kết quả theo từng key qua nhiều lần probe (hiện `useProbe.ts:86` ghi đè cả báo cáo theo stage).

## 3. Công việc code

Thứ tự **em đề xuất** (đánh số theo thứ tự làm):

| #                         | Việc                                                                                                                                         | File chính                                                      | Ghi chú                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (**đề xuất làm trước**) | **Kill-switch.** Nút footer và popup ghi `EMERGENCY_KEY` vào `storage.local`; content script nghe `storage.onChanged` và gọi `active.stop()` | `PanelFooter.tsx`, `Popup.tsx`, `controller.ts`, `store.ts`     | Không cần `runId`/`tabId`/quyền mới, dừng được mọi tab BM, và `ERR_EMERGENCY` đã chặn run kế tiếp. Nút không bao giờ `disabled` (DES-001). Gỡ cờ ở Options › Devtest (đã có `useEmergencyLock`). **Đã làm 14/10** (bấm một lần là dừng, không hỏi lại; nhãn nút đổi thành "Đã dừng · Assist bị khoá" kèm gợi ý gỡ khoá). Reviewer: 0 Critical/High/Medium; Low 1 (kill lúc run đang `starting`) đã sửa. Còn mở: Dry-run vẫn chạy được khi bị khoá (chỉ Assist bị chặn, chờ anh quyết); content script mồ côi sau reload extension cần thử tay |
| 2                         | **Guard đổi BM giữa run.** Ghi `business_id` lúc bắt đầu, so khi poll; khác thì dừng run kèm mã lỗi                                          | `watchers.ts`, `runner.ts`, `shared/run.ts` (mã lỗi mới)        | Quan trọng về an toàn: nếu không, run chạy tiếp trên BM sai sau khi SPA điều hướng. `paused`/re-sync ở panel là UX, làm sau                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3                         | **Sửa probe** theo §2: bộ nhận diện màn `detail`, sub-stage hoặc gộp theo key cho `dialog.*`                                                 | `probe.ts`, `shared/probe.ts`, `useProbe.ts`, `ProbeScreen.tsx` | Phải xong **trước** khi anh đo thực địa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 4                         | **Xuất báo cáo JSON** (nếu chưa có), kèm `lang`, `browser`, stage                                                                            | `ProbeScreen.tsx`                                               | Báo cáo đã không chứa ID/token (`probe.ts` header)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 5                         | Xác nhận Q3 và sửa nhãn lý do chặn nếu cần                                                                                                   | `StepAccounts.tsx`                                              | Chỉ rà soát, không làm lớn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Mỗi việc có test Vitest đi kèm (`tests/`). Item 1, 2 đụng content script và messaging/storage nên theo CLAUDE.md phải chạy `extension-security-reviewer`; item 1 thêm `cross-browser-checker` (có dùng `storage.onChanged` trong content script trên cả hai trình duyệt).

## 4. Việc thực địa (anh làm)

Chạy sau khi xong §3 mục 3–4:

- Probe **vi và en trên Chrome** (Firefox ≥ 128 dời sang gate ghi, chỉ thử tay kill-switch), mỗi locale ở đủ các màn: `page`, `menu`, từng bước của dialog, `detail`.
- Dry-run bước 1–5 lặp lại được 100% (gate PRD §8).
- Thử kill-switch giữa một run Assist thật: run dừng, run kế tiếp bị `ERR_EMERGENCY`, gỡ khoá ở Options chạy lại được.
- Thử đổi BM giữa run: run phải dừng.
- Reload extension giữa một run Assist: xem trang BM có còn bị thao tác không (content script cũ mất context, kill không tới được).
- Ghi kết quả vào `QA-REPORT-003`.

## 5. Việc tài liệu

- Roadmap §1: dòng "Probe + SelectorRegistry" đã cũ (đã có Probe tab từ v0.5.0, chưa có báo cáo hit-rate); cập nhật.
- Roadmap R1: Q3 (TKQC khác) đã chốt ở SPEC-UI-002; chuyển thành `[x]` sau khi rà soát mục 5.
- Cập nhật `Planning-MOC.md` trỏ tới plan này.

## 6. Gate R1 (PRD §8)

Probe ≥ 95% trên Chrome × (vi, en); dry-run 100% bước 1–5 lặp lại được. Kill-switch và guard đổi BM pass thử tay trên Chrome, kill-switch thử tay thêm trên Firefox. Firefox ≥ 95% dời sang gate ghi (§7 mục 2).

## 7. Quyết định đã chốt (14/10/2026, em chốt theo uỷ quyền của anh; anh đổi được)

| #   | Câu hỏi                                     | Quyết định                                                                                 | Lý do                                                                                                                                                                                                                                                                                 |
| :-- | :------------------------------------------ | :----------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Kill-switch khoá hay chỉ dừng run hiện tại? | **Khoá bằng cờ `storage.local` (`EMERGENCY_KEY`) cho tới khi gỡ tay ở Options › Devtest.** | Kill-switch là dừng khẩn cấp: nếu không khoá, run kế tiếp có thể chạy ngay trên cùng BM đang có vấn đề. Tái dùng cơ chế `ERR_EMERGENCY` đã có nên không thêm trạng thái mới. Bấm một lần là dừng (không có bước xác nhận, vì sẽ làm chậm nút khẩn cấp); phản hồi rõ ràng sau khi bấm. |
| 2   | Firefox đạt 95% ở R1 hay ở R3?              | **R1 chốt trên Chrome (vi + en). Firefox bắt buộc đạt ≥ 95% trước gate ghi (R3).**         | `Full` chưa mở nên chưa có rủi ro ghi trên Firefox. Dồn đo Firefox một lần ở gate ghi tránh đo lại khi selector còn đổi. Firefox vẫn phải thử tay kill-switch và build chạy được ở R1. Lệch với câu chữ gate R1 hiện tại trong Roadmap (đã sửa theo).                                 |
| 3   | Ngày mục tiêu R1                            | **28/10/2026**: code §3 xong ~21/10, thực địa §4 và `QA-REPORT-003` ~28/10.                | Ước lượng của em, chưa kiểm chứng; ngày thực địa phụ thuộc anh rảnh. Dời nếu probe phát hiện selector gãy.                                                                                                                                                                            |
