import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.integration.test.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/shared/setup-integration.ts'],
    testTimeout: 60000, // 60 seconds for integration tests
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/**'],
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Prevent database conflicts
        minForks: 1,
        maxForks: 2,
      },
    },
    sequence: {
      concurrent: false, // Run integration tests sequentially
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests'),
      '@lorachain/shared': resolve(__dirname, '../shared/src'),
      '@lorachain/core': resolve(__dirname, './src'),
    },
  },
});
