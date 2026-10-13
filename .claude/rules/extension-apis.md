---
paths:
  - 'src/**/*.{ts,tsx}'
  - 'vite.config.ts'
---

# WebExtension APIs, permissions, cross-browser

## Manifest

- Shared manifest: `src/manifest.ts` (name gets ` ➡️ Dev` suffix in dev; version comes from `package.json`).
- Browser-specific keys are merged in `vite.config.ts`:
  - Chrome: `options_page`, `background.service_worker` (module), `side_panel` + `sidePanel` permission
  - Firefox: `options_ui`, `background.scripts`, `sidebar_action` (`open_at_install: false`); Firefox must not declare `sidePanel`
  - The merge is a shallow spread: arrays like `permissions` are concatenated explicitly (`BASE_PERMISSIONS` from `src/manifest.ts`), not overwritten.
  - crxjs emits the Chrome side panel page automatically but not the Firefox `sidebar_action` page — it is added to `build.rollupOptions.input` for Firefox only.
- Current permissions: `storage` (+ `sidePanel` on Chrome). No `tabs`: `tabs.query` returns the tab id and `tabs.sendMessage` works through the content-script match on Chrome. On Firefox MV3 the match counts as a host permission the user can leave ungranted or revoke, so `host_permissions: ['https://business.facebook.com/*']` plus a fixed `gecko.id` live in `firefoxSpecificManifest` (`vite.config.ts`, not the shared manifest).
- Graph host (`GRAPH_ORIGIN_PATTERN`, `src/shared/adAccounts.ts`): Chrome and Firefox (≥ 128) declare it as `optional_host_permissions` (`chromeSpecificManifest` / `firefoxSpecificManifest`), so an update does not disable the extension waiting for consent. The side panel asks for it with `permissions.request` from a click handler (`useAdAccounts.grantAccess`), and both the panel and the background check `permissions.contains` first (`'access'` error). `strict_min_version` is 128.0.
- If the panel stays "unreachable", check `about:addons` → Permissions. Add only what a feature needs; prefer `optional_permissions` / host permissions over broad grants.
- Opening the side panel needs a user gesture on both browsers: resolve `windowId` beforehand and call `src/utils/openSidePanel.ts` synchronously inside the click handler (no `await` before it). It is the one place `chrome.*` is allowed (no polyfill equivalent), feature-detected.
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
- Check: no extension element in the Business Manager DOM; popup "Mở copilot" opens the side panel/sidebar; side panel shows "connected" on a reloaded `business.facebook.com` tab; popup/options render and switch themes.
