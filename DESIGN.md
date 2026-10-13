---
version: alpha
name: HPMA Copilot
description: Compact bilingual Business Manager copilot in a browser side panel.
colors:
  primary: '#3b82f6'
  light-background: '#f8f7fa'
  light-surface: '#ffffff'
  light-text: '#2f2b3d'
  dark-background: '#25293c'
  dark-surface: '#2f3349'
  dark-text: '#e1def5'
typography:
  sans:
    fontFamily: 'Montserrat, sans-serif'
rounded:
  DEFAULT: '0.375rem'
spacing:
  panel-padding: '1rem'
  field-gap: '0.75rem'
components:
  button: {}
  input: {}
  card: {}
---

# HPMA Copilot design

Existing runtime tokens in `src/assets/styles/index.css` own the DaisyUI light/dark
theme, typography and radius. Preserve this visual language when adding controls;
do not introduce another palette or component library.

Audience: BM operators using Vietnamese or English in a narrow browser panel.
The canonical account selection UI is `StepAccounts`: search by name/ID, native
checkboxes, active accounts selectable, other statuses blocked, and explicit load
more. Search and select-all apply only to loaded accounts. `MAX_QUERIES` owns the
run selection limit. Manual entry is a fallback, using the existing parser.

`useAdAccounts` owns asynchronous list state. Loading blocks duplicate reads;
errors explain recovery and preserve prior loaded pages when loading more fails.
Simulator data remains labeled as sample. Runtime strings belong to `i18n.ts`.
Account names render as text, tokens never render or persist, and API inventory
does not imply authority to grant partner access. The existing engine owns that
operation and its confirmation gates.

Use semantic buttons, labeled inputs and checkboxes, visible focus and inline
alerts. The wizard owns navigation and footer placement; this change adds no
animation or overlay. Colors/radius are observed existing values, not new tokens.
