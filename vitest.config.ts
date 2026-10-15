import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// Tách khỏi vite.config.ts: không kéo crxjs/manifest vào test, không ảnh hưởng build.
export default defineConfig({
  resolve: {
    alias: {
      // Test chạy không có Firebase SDK: `@relay` trỏ vào bản rỗng (như bản build Firefox).
      '@relay': resolve(__dirname, './src/background/firebaseRelay.noop.ts'),
      '@utils': resolve(__dirname, './src/utils'),
      '@assets': resolve(__dirname, './src/assets'),
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/helpers/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
