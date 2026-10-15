import { defineConfig } from 'vitest/config';

// Cấu hình riêng: không thừa hưởng vitest.config.ts của extension (jsdom, alias, setup).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
