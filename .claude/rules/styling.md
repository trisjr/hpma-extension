---
paths:
  - 'src/**/*.{tsx,css,html}'
---

# Styling: Tailwind 4 + DaisyUI 5

Tailwind 4 is CSS-first: `src/assets/styles/index.css` holds `@import 'tailwindcss';` and `@plugin "daisyui";`. Check DaisyUI 5 docs (https://daisyui.com/docs/v5/) before using a class — many v4 names changed.

## Rules

1. DaisyUI component classes + Tailwind utilities only. No inline styles, no custom global CSS.
2. If specificity blocks a utility, use the `!` suffix sparingly (e.g. `bg-red-500!`).
3. Semantic colors only: `primary`, `secondary`, `accent`, `neutral`, `base-*`, `info`, `success`, `warning`, `error`, with `*-content` for foreground.
4. Root container has `id='my-ext'` and `data-theme`; switch themes by changing `data-theme`.
5. Responsive via Tailwind prefixes (`sm:`, `lg:`).

## Why `#my-ext` matters

PostCSS (`postcss.config.js`) prefixes every selector with `#my-ext`, rewrites `:root`/`html`/`body` to `:host`, and converts `rem` → `px` (so host-page font size can't leak in). UI outside a `#my-ext` container will be unstyled.

## Snippets

```tsx
<button type='button' className='btn btn-primary'>Primary</button>

<label className='input flex items-center gap-2'>
  <input type='text' className='grow' placeholder='Search' />
</label>

<div className='card bg-base-100 w-80 shadow'>
  <div className='card-body'>
    <h2 className='card-title'>Title</h2>
    <div className='card-actions justify-end'>
      <button type='button' className='btn btn-primary'>Action</button>
    </div>
  </div>
</div>
```
