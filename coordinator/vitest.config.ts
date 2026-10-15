import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Cấu hình riêng: không thừa hưởng vitest.config.ts của extension (jsdom, setup).
// Alias `@` trỏ vào src của extension để dùng chung parser với engine (D3).
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '../src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Mọi file dùng chung một emulator và gọi clearDatabase: chạy song song sẽ xoá dữ liệu của nhau.
    fileParallelism: false,
  },
});
