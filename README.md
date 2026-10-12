# HPMA Copilot

Manifest V3 browser extension (Chrome + Firefox) that acts as a copilot for operating Facebook Business Manager (`business.facebook.com`) through DOM automation. It performs repetitive asset-management tasks (assign partners, share datasets/pixels, manage users, rename assets, ...) the way a real user would, with dry-run, human confirmation (HITL), safe pacing and an audit log.

The content script is headless (engine only); the copilot UI lives in the side panel, popup and options pages. See [`docs/000-Index.md`](./docs/000-Index.md) for product and architecture documentation.

## Tech Stack

- **Vite** + **@crxjs/vite-plugin**: build and HMR for MV3 extensions.
- **TypeScript** (strict) and **React 19**.
- **Tailwind CSS 4** + **DaisyUI 5**: styling, mounted in Shadow DOM.
- **webextension-polyfill**: one codebase for Chrome and Firefox.

## Get Started

- 1️⃣ Clone the repo: `git clone git@github.com:trisjr/hpma-extension.git`
- 2️⃣ Install dependencies: `pnpm install`
- 3️⃣ Start development (Chrome): `pnpm dev`, then load `dist_chrome/` unpacked
- 4️⃣ Start development (Firefox): `pnpm dev:firefox`, then load `dist_firefox/`
- 5️⃣ Build for production (Chrome): `pnpm build`
- 6️⃣ Build for production (Firefox): `pnpm build:firefox`

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Browser Support

| Supported browsers (min version)                          |
| --------------------------------------------------------- |
| 🟡 Chrome 88+; 🟦 Edge 88+; 🦁 Brave 88+; 🦊 Firefox 109+ |
