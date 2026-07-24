import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // The first dynamic import() of processing.ts (which pulls in nodemailer,
    // googleapis, etc.) can occasionally exceed the 15s default when all test
    // files run together under load — observed flaky in this environment even
    // though the same test passes instantly in isolation. 30s removes the flake
    // without hiding a real regression (a genuinely broken import fails either way).
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});