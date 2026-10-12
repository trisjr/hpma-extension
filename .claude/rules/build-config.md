---
paths:
  - 'vite.config.ts'
  - 'postcss.config.js'
  - 'tailwind.config.js'
  - 'tsconfig.json'
  - 'src/manifest.ts'
---

# Build & config

## Vite

- Plugins: `@vitejs/plugin-react`, `touchGlobalCSSPlugin` (needed for CSS HMR), `crx` with `contentScripts.injectCss`.
- Keep aliases `@`, `@utils`, `@assets` in sync with `tsconfig.json` `paths`.
- Fonts are emitted under `assets/fonts/`.
- Dev server CORS allows `chrome-extension://` and `moz-extension://` origins.
- Output: `dist_chrome/` or `dist_firefox/` (both gitignored, never edit by hand).

## PostCSS (order matters)

1. Tailwind
2. `postcss-prefix-selector` → prefix `#my-ext`, map `:root`/`:host`/`html`/`body` to `:host`
3. `rem` → `px`
4. Autoprefixer last

## TypeScript

- `strict`, `moduleResolution: bundler`, `jsx: react-jsx`, no emit (Vite builds; `tsc` only type-checks in `pnpm build`).
