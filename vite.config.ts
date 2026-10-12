import fs from 'fs';
import path, { resolve } from 'path';
import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, Plugin } from 'vite';

import manifest, { BASE_PERMISSIONS } from './src/manifest';

function touchFile(filePath: string): void {
  const time = new Date();
  fs.utimesSync(filePath, time, time);
}

type TouchGlobalCSSPluginOptions = {
  cssFilePath: string;
  watchFiles: string[];
};

export function touchGlobalCSSPlugin({
  cssFilePath,
  watchFiles,
}: TouchGlobalCSSPluginOptions): Plugin {
  return {
    name: 'touch-global-css',
    configureServer(server) {
      server.watcher.on('change', (file) => {
        if (watchFiles.some((watchFile) => file.includes(watchFile))) {
          touchFile(cssFilePath);
        }
      });
    },
  };
}

const SIDE_PANEL_PAGE = 'src/sidepanel/index.html';

// `permissions` là spread nông → nối thêm vào mảng dùng chung, không ghi đè.
// `sidePanel` chỉ khai trên Chrome (Firefox không có quyền này).
const chromeSpecificManifest = {
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  minimum_chrome_version: '116', // sidePanel.open
  permissions: [...BASE_PERMISSIONS, 'sidePanel'],
  side_panel: {
    default_path: SIDE_PANEL_PAGE,
  },
};

const firefoxSpecificManifest = {
  options_ui: {
    page: 'src/options/index.html',
    browser_style: false,
  },
  background: {
    scripts: ['src/background/index.ts'],
  },
  sidebar_action: {
    default_panel: SIDE_PANEL_PAGE,
    default_title: 'HPMA Copilot',
    open_at_install: false,
    browser_style: false,
  },
};

type Mode = 'chrome' | 'firefox';

const generateCrossBrowserManifest = (mode: Mode) => ({
  ...manifest,
  ...(mode === 'firefox' ? firefoxSpecificManifest : chromeSpecificManifest),
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    touchGlobalCSSPlugin({
      cssFilePath: path.resolve(__dirname, 'src/assets/styles/index.css'),
      watchFiles: ['.tsx'],
    }),
    crx({
      manifest: generateCrossBrowserManifest(mode as Mode) as ManifestV3Export,
      browser: mode === 'firefox' ? 'firefox' : 'chrome',
      contentScripts: {
        injectCss: true,
      },
    }),
  ],
  server: {
    cors: {
      origin: [/chrome-extension:\/\//, /moz-extension:\/\//],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@utils': resolve(__dirname, './src/utils'),
      '@assets': resolve(__dirname, './src/assets'),
    },
  },
  build: {
    outDir: mode === 'firefox' ? 'dist_firefox' : 'dist_chrome',
    rollupOptions: {
      // crxjs không tự emit trang `sidebar_action.default_panel` của Firefox
      // (Chrome `side_panel.default_path` thì có) → khai thủ công làm entry.
      ...(mode === 'firefox' && {
        input: { sidepanel: resolve(__dirname, SIDE_PANEL_PAGE) },
      }),
      output: {
        assetFileNames: (assetInfo) => {
          if (
            assetInfo.name &&
            /\.(ttf|woff|woff2|eot)$/.test(assetInfo.name)
          ) {
            return 'assets/fonts/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
}));
