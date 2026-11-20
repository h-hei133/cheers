import { defineConfig } from 'vitest/config';
import { defaultClientConditions, defaultServerConditions } from 'vite';

export default defineConfig({
  resolve: { conditions: ['cheers-source', ...defaultClientConditions] },
  ssr: {
    noExternal: /^@cheers\//,
    resolve: { conditions: ['cheers-source', ...defaultServerConditions] },
  },
  test: {
    environment: 'node',
    globals: true,
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 1,
    fileParallelism: false,
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
