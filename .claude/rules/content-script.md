---
paths:
  - 'src/content/**'
  - 'src/utils/createShadowRoot.tsx'
---

# Content script & Shadow DOM

`src/manifest.ts` picks the entry by `NODE_ENV`: `index.dev.tsx` in dev, `index.prod.tsx` in prod. Changes to boot logic usually need to land in both.

## Dev (HMR) — `index.dev.tsx`

- Import CSS normally so Vite injects `<style data-vite-dev-id>`.
- Create a container, attach Shadow DOM, move the dev style element into the shadow root, render `Content` there. This is what makes CSS HMR work.
- `touchGlobalCSSPlugin` in `vite.config.ts` re-touches `index.css` on `.tsx` changes so new Tailwind classes get generated — keep it.

## Production — `index.prod.tsx`

```tsx
import styles from '@assets/styles/index.css?inline';
import createShadowRoot from '@utils/createShadowRoot';

import Content from './Content';

const root = createShadowRoot(styles);
root.render(<Content />);
```

`createShadowRoot` uses constructable stylesheets (`adoptedStyleSheets`) and falls back to a `<style>` tag (Firefox); it mounts into an inner node to avoid Firefox Xray wrapper issues.

## Rules

- Never render into or mutate the host page DOM outside the shadow root.
- Root container keeps `id='my-ext'` and `data-theme`.
- Content scripts run on `<all_urls>`: treat page data and `window.postMessage` input as untrusted; never use `innerHTML`/`dangerouslySetInnerHTML` with page-derived strings.
