---
id: DOC-INDEX-000
type: index
status: live
created: 2026-10-12
updated: 2026-10-12
---

# HPMA Extension — Project Documentation — Master Index

Đây là **MOC gốc** của thư mục `docs/` — tài liệu **đặc thù dự án**, tổ chức theo mã Dewey **3 chữ số**. Tri thức nền tảng dùng chung nằm ở [knowledge-base/](../../TNMCore-OS/knowledge-base/00-Index.md) (Dewey 2 chữ số, của TNMCORE-OS).

> [!NOTE]
> Trước khi tạo bất kỳ tài liệu nào, tra cứu bảng [Document Type Mapping](../../TNMCore-OS/knowledge-base/99-Templates/Documents-Template.md#ánh-xạ-loại-tài-liệu-document-type-mapping) để xác định đúng thư mục và naming convention.

## Mục lục

| Dewey   | Thư mục      | MOC                                                        | Nội dung                                                             |
| :------ | :----------- | :--------------------------------------------------------- | :------------------------------------------------------------------- |
| **010** | Planning     | [Planning-MOC](./010-Planning/Planning-MOC.md)             | Charter, Roadmap, OKRs, Sprints, Risk Register, Implementation Plans |
| **020** | Requirements | [Requirements-MOC](./020-Requirements/Requirements-MOC.md) | PRD, SRS, BRD, NFR, Use Cases                                        |
| **022** | User Stories | [Stories-MOC](./022-User-Stories/Stories-MOC.md)           | Epics, Backlog, Active Sprint Stories                                |
| **030** | Specs        | [Specs-MOC](./030-Specs/Specs-MOC.md)                      | SDD, ADR, RFC, API Specs, DB Schema, Security Specs                  |
| **035** | QA           | [QA-MOC](./035-QA/QA-MOC.md)                               | Test Plans, Test Cases, Reports, Bug Reports, Performance            |
| **040** | Design       | [Design-MOC](./040-Design/Design-MOC.md)                   | Design System, Wireframes, User Flows, Prototype Specs               |
| **050** | Research     | [Research-MOC](./050-Research/Research-MOC.md)             | Analysis, Competitor Analysis, User Interviews, Surveys              |
| **060** | Manuals      | [Manuals-MOC](./060-Manuals/Manuals-MOC.md)                | User Guide, Admin Guide, FAQ                                         |
| **070** | Deployment   | [Deployment-MOC](./070-Deployment/Deployment-MOC.md)       | Release Notes, CHANGELOG, Deploy Guides, Runbooks, Rollback          |
| **080** | Operations   | [Operations-MOC](./080-Operations/Operations-MOC.md)       | Incident Reports, Post-Mortems, SLAs                                 |
| **999** | Resources    | [Resources-MOC](./999-Resources/Resources-MOC.md)          | Glossary, Templates                                                  |

---

## Tài liệu hiện có

### 010-Planning

- [Roadmap](./010-Planning/Roadmap.md)
- [OKRs](./010-Planning/OKRs.md)
- [pm-runs/](./010-Planning/pm-runs/README.md) — run-state của các PM runs

### 999-Resources

- [Glossary](./999-Resources/Glossary.md) — từ điển thuật ngữ dự án
- [Templates/](./999-Resources/Templates/) — 15 bản mẫu tài liệu (Charter, PRD, SRS, SDD, Spec, Test Plan, Release Notes, Risk Register, WBS/ETA, Incident Report, Status Report, Daily Report, Report Unit, Analysis, Component)

Tra MOC từng thư mục để xem tài liệu hiện hành.

---

## Quy trình sinh ra tài liệu ở đây

| Track       | Khi nào dùng                                                         | Quy trình                                                                                          |
| :---------- | :------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| 🔴 **Full** | Khách hàng yêu cầu tài liệu, team ≥ 3, có PII/payment, có compliance | [SDLC-Agile-Workflow](../../TNMCore-OS/knowledge-base/20-Project/SDLC-Agile-Workflow.md) — 9 Phase |
| 🟢 **Lite** | Dự án cá nhân / nội bộ, 1–2 dev, không PII, không compliance         | [SDLC-Lite-Workflow](../../TNMCore-OS/knowledge-base/20-Project/SDLC-Lite-Workflow.md) — 4 Stage   |

Ở **cấp task**, mọi thay đổi đi theo [Universal Workflow 6 bước](../../TNMCore-OS/knowledge-base/20-Project/Universal-Workflow.md).

---

## Tài liệu tham khảo

1. [Knowledge Base Master Index (TNMCORE-OS)](../../TNMCore-OS/knowledge-base/00-Index.md)
2. [Documents-Template — Quy tắc cấu trúc tài liệu](../../TNMCore-OS/knowledge-base/99-Templates/Documents-Template.md)
3. [CLAUDE.md — Primary Context](../CLAUDE.md)
4. [README.md](../README.md)

---

_Master MOC của `docs/`. Tạo theo cấu trúc [TNMCORE-OS/docs](../../TNMCore-OS/docs/000-Index.md)._
