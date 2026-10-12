---
name: new-feature
description: Scaffold a new extension feature across popup/options/content/background with typed messaging, storage and manifest updates
argument-hint: <feature name> [short description]
disable-model-invocation: true
---

# New feature: $ARGUMENTS

## 1. Pin down the shape (ask only what isn't clear from the request)

- Which surfaces: popup, options, content script, background — or several?
- Data: none, `storage.sync` (small preferences), or `storage.local` (larger/device-specific)?
- New permissions or host permissions? Prefer `activeTab` / `optional_permissions` over broad grants.

## 2. Plan files before writing

Follow the layout in `CLAUDE.md`. Typical additions:

| Concern            | Location                                                   |
| ------------------ | ---------------------------------------------------------- |
| UI component       | `src/<surface>/components/<FeatureName>.tsx`               |
| Message types      | `src/types/messages.ts` (extend the discriminated union)   |
| Storage helpers    | `src/utils/storage.ts` (typed getters/setters + defaults)  |
| Background handler | `src/background/index.ts` (register once, in one listener) |
| Manifest           | `src/manifest.ts`, or `vite.config.ts` if browser-specific |

Reuse an existing file if it already exists — don't create parallel `messages`/`storage` modules.

## 3. Templates

Messages — one union, one listener per context:

```ts
// src/types/messages.ts
export type ExtMessage =
  | { type: 'feature/get'; key: string }
  | { type: 'feature/set'; key: string; value: string };
```

```ts
// src/background/index.ts
import type { ExtMessage } from '@/types/messages';
import browser from 'webextension-polyfill';

browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as ExtMessage;
  (async () => {
    switch (msg.type) {
      case 'feature/get':
        sendResponse(await getFeature(msg.key));
        break;
      default:
        break;
    }
  })();
  return true;
});
```

Storage — typed with defaults:

```ts
// src/utils/storage.ts
import browser from 'webextension-polyfill';

export interface Settings {
  enabled: boolean;
}

const DEFAULT_SETTINGS: Settings = { enabled: true };

export async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings>) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.sync.set({ settings: { ...current, ...patch } });
}
```

UI — DaisyUI + `id='my-ext'` + `data-theme` on the surface root; components inside it don't repeat the id.

## 4. Verify

1. `pnpm lint` and `pnpm build` pass (also `pnpm build:firefox` if APIs or manifest changed).
2. If the feature touches a content script, messaging, or permissions, run the `extension-security-reviewer` agent on the diff.
3. If it uses new WebExtension APIs, run the `cross-browser-checker` agent.
4. Tell the user how to try it: load `dist_chrome/` unpacked, where the feature appears, what to click.
