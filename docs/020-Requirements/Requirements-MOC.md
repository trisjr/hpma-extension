---
id: MOC-020
type: moc
status: draft
created: 2026-10-12
---

# 📂 020-Requirements Map of Content

Trung tâm quản lý Yêu cầu (Requirements) của dự án. Thư mục này chứa toàn bộ tài liệu định nghĩa "Sản phẩm cần làm gì" (What) và "Tại sao cần làm" (Why).

## 📍 Định Hướng (Navigation)

### 🏢 020.10 - Business Requirements (BRD)

_Yêu cầu nghiệp vụ cấp cao từ Stakeholders, định nghĩa Business Goals và Scope._

- [BRD Folder](./BRD/)
- [[BRD-001-hpma-dom-copilot]] — Copilot vận hành Facebook BM bằng DOM automation (pivot từ EAAG token, 12/10/2026)

### 📦 020.20 - Product Requirements (PRD)

_Yêu cầu sản phẩm chi tiết, tính năng và logic vận hành._

- [[PRD-001-hpma-dom-copilot]] — PRD copilot DOM: 12 FR, HITL 4 tầng, KPI nghiệm thu, roadmap M0–M4
- _(Template: [Template-PRD](../999-Resources/Templates/Template-PRD.md))_

### 👤 020.30 - Use Cases & User Models

_Mô tả tương tác người dùng, Actors, và kịch bản sử dụng._

- [Use-Cases Folder](./Use-Cases/)
- _(Chưa khởi tạo)_

### 🛡️ 020.40 - Non-Functional Requirements (NFR)

_Yêu cầu phi chức năng: Hiệu năng, Bảo mật, Độ tin cậy._

- _(Chưa khởi tạo)_

---

## 📝 Quy Trình Làm Việc (BA Workflow)

Mọi tài liệu trong thư mục này cần tuân thủ quy trình kiểm soát chất lượng của BA:

1.  **Elicitation:** Thu thập yêu cầu thô (Raw reqs) -> Lưu vào `Meeting-Notes` hoặc draft.
2.  **Analysis:** Phân tích và cấu trúc hóa -> Tạo PRD/BRD.
3.  **Validation:** Review với Stakeholders -> Cập nhật trạng thái `approved`.
4.  **Specification:** Chuyển đổi thành User Stories (tại `022-User-Stories`).

> **Lưu ý:** Luôn đảm bảo tính **Nhất quán (Consistency)** và **Khả thi (Feasibility)** với đội ngũ Technical.

---

_MOC theo cấu trúc TNMCORE-OS._
