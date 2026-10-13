# CLAUDE.md

Manifest V3 browser extension (Chrome + Firefox) built with Vite 6 + `@crxjs/vite-plugin`, React 19, TypeScript 5 (strict), Tailwind CSS 4 + DaisyUI 5, and `webextension-polyfill`.

## Commands

- `pnpm dev` — Chrome dev build with HMR → load `dist_chrome/` unpacked
- `pnpm dev:firefox` — Firefox watch build → `dist_firefox/`
- `pnpm build` / `pnpm build:firefox` — `tsc -p tsconfig.build.json` (src only, tests excluded) + production build; `pnpm typecheck` checks everything including `tests/`
- `pnpm lint` — ESLint (airbnb, `--max-warnings 0`)
- `pnpm lint:spell` — cspell
- `pnpm test` — Vitest + jsdom (needs Node ≥ 22.22.2); `pnpm test:watch` for watch mode
- pnpm only (enforced by `preinstall`).

## Layout

- `src/manifest.ts` — shared manifest; browser-specific parts (background, options page) are merged in `vite.config.ts`
- `src/background/index.ts` — service worker (Chrome) / background script (Firefox)
- `src/popup/`, `src/options/`, `src/sidepanel/` — pages, booted via `createShadowRoot(styles)`; side panel is the main copilot UI
- `src/content/` — headless content script (`index.ts`): engine + message listener, no UI
- `src/shared/messaging.ts` — typed messages between extension pages and the content script
- `src/utils/createShadowRoot.tsx` — Shadow DOM + `adoptedStyleSheets` mount helper
- `src/assets/styles/index.css` — Tailwind + DaisyUI entry, fonts

Aliases: `@/*` → `src/*`, `@utils` → `src/utils`, `@assets` → `src/assets`.

## Core rules

- Functional React components only, explicit `JSX.Element` return type, PascalCase file names.
- Style with Tailwind + DaisyUI classes only — no inline styles, no ad-hoc global CSS.
- Root container of every UI surface has `id='my-ext'` and `data-theme`.
- No extension UI in the host page: the content script is headless and the copilot UI lives in the side panel/popup/options. The host page DOM is touched only by the action engine's steps.
- Use `browser.*` from `webextension-polyfill`, not `chrome.*`, so code runs on both browsers.
- Request the minimum permissions; any change goes through `src/manifest.ts` (or `vite.config.ts` for browser-specific keys).
- Import order: external → aliases → relative → styles (enforced by Prettier sort-imports).
- Conventional commits (commitlint); pre-commit runs lint-staged (ESLint + Prettier).

Scoped rules live in `.claude/rules/` and load when matching files are touched.

## After changes

- Content script, messaging, permissions or manifest changed → run the `extension-security-reviewer` agent.
- New WebExtension APIs or background logic → run the `cross-browser-checker` agent.
