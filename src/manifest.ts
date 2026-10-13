import { defineManifest } from '@crxjs/vite-plugin';

import packageData from '../package.json';

const isDev = process.env.NODE_ENV === 'development';

// Pivot DOM automation (docs/050-Research/21 §6): siết phạm vi về đúng origin
// Business Manager, tối thiểu quyền — chỉ `storage`; không `<all_urls>`,
// không `tabs` (Chrome: tabs.sendMessage chạy được nhờ content_scripts matches).
// Graph host đọc TKQC không khai ở đây: Chrome và Firefox (≥ 128) đều xin khi user bấm (optional, vite.config.ts).
// Khóa side panel theo browser cũng nằm ở `vite.config.ts`.
const BM_ORIGIN = 'https://business.facebook.com/*';

// Quyền dùng chung hai browser; `vite.config.ts` nối thêm quyền riêng từng bên.
export const BASE_PERMISSIONS = ['storage'];

export default defineManifest({
  manifest_version: 3,
  name: `${packageData.displayName || packageData.name}${
    isDev ? ` ➡️ Dev` : ''
  }`,
  version: packageData.version,
  description: packageData.description,
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icon16.png',
      32: 'icon32.png',
      48: 'icon48.png',
      128: 'icon128.png',
    },
  },
  icons: {
    16: 'icon16.png',
    32: 'icon32.png',
    48: 'icon48.png',
    128: 'icon128.png',
  },
  permissions: BASE_PERMISSIONS,
  // Content script headless: chỉ engine + listener message, không render UI
  // vào DOM trang BM (docs/050-Research/21 §3.7, §5.1).
  content_scripts: [
    {
      js: ['src/content/index.ts'],
      matches: [BM_ORIGIN],
      run_at: 'document_idle',
    },
  ],
});
