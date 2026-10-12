---
paths:
  - 'src/**/*.{ts,tsx}'
  - 'vite.config.ts'
---

# WebExtension APIs, permissions, cross-browser

## Manifest

- Shared manifest: `src/manifest.ts` (name gets ` ➡️ Dev` suffix in dev; version comes from `package.json`).
- Browser-specific keys are merged in `vite.config.ts`:
  - Chrome: `options_page`, `background.service_worker` (module)
  - Firefox: `options_ui`, `background.scripts`
- Current permissions: `activeTab`, `storage`. Add only what a feature needs; prefer `optional_permissions` / host permissions over broad grants.
- Firefox metadata (`browser_specific_settings.gecko.id`, `strict_min_version`) is ignored by Chrome — safe to add.

## Cross-browser API usage

- Always `import browser from 'webextension-polyfill'` and use `browser.*` (promise-based). Avoid `chrome.*` in runtime code.
- Avoid `chrome.scripting` without a fallback; declare content scripts in the manifest.

## Storage

```ts
await browser.storage.local.set({ key: value });
const { key } = await browser.storage.local.get(['key']);
```

- `storage.sync` for small cross-device preferences; `storage.local` for larger/device-specific data.
- Define typed shapes and defaults; handle quota errors.

## Messaging

```ts
// Content/Popup → Background
const res = await browser.runtime.sendMessage({ type: 'getData' });

// Background
browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'getData') sendResponse({ data: 'ok' });
  })();
  return true; // keep channel open for async response
});
```

- Background → content: `browser.tabs.sendMessage(tabId, msg)`, not `runtime.sendMessage`.
- Use a typed discriminated union for message `type`s; register listeners once per context.
- Active tab: `const [tab] = await browser.tabs.query({ active: true, currentWindow: true });`

## Verifying on both browsers

- Chrome: `pnpm build` → `chrome://extensions` → Load unpacked `dist_chrome/`. Service worker console via "Inspect views".
- Firefox: `pnpm build:firefox` → `about:debugging` → This Firefox → Load Temporary Add-on → `dist_firefox/manifest.json`.
- Check: content UI renders in Shadow DOM with styles, popup/options render and switch themes, background answers messages.
