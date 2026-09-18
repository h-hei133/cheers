import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Browser and CLI scenario suites spawn real child processes and take 8-16s
    // on their own; the 5s default turns them into load-dependent flakes when the
    // suite runs concurrently. A hang still fails, just later.
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
});
