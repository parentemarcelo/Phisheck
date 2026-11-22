import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{shared,extension,crawler,tests}/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['./vitest.global-setup.ts'],
  },
});
