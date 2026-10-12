---
paths:
  - 'src/content/**'
  - 'src/utils/createShadowRoot.tsx'
---

# Content script (headless) & Shadow DOM

The content script is **headless**: it renders no UI and does not mutate the host page DOM except through the action engine's steps (docs/050-Research/21 §3.7, §5.1). All copilot UI lives in extension pages — side panel (`src/sidepanel/`), popup, options.

## Entry

- Single entry `src/content/index.ts` (no dev/prod split — there is no React/CSS to HMR in the page). Declared in `src/manifest.ts`, matched only to `https://business.facebook.com/*`.
- It registers `browser.runtime.onMessage` once, accepts only messages from this extension (`sender.id === browser.runtime.id`) and validates them with a type guard from `src/shared/messaging.ts`.
- Side panel/popup reach it via `browser.tabs.sendMessage(tabId, msg)`.

## Shadow DOM

`createShadowRoot` (constructable stylesheets with `<style>` fallback, inner mount node for Firefox Xray) is used to boot **extension pages** (popup, options, side panel), not the content script.

## Rules

- Never render UI into the host page DOM. Root container of every UI surface (extension pages) keeps `id='my-ext'` and `data-theme`.
- The content script runs on the Business Manager origin only: treat page data and `window.postMessage` input as untrusted; never use `innerHTML`/`dangerouslySetInnerHTML` with page-derived strings.
- Flow runtime state and pending confirmations live in the content script, not in the service worker or the side panel.
