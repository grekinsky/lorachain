import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'all',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.integration.test.ts',
    ],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/shared/setup-all.ts'],
    testTimeout: 60000, // 60 seconds to accommodate integration tests
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/**', 'src/**/*.test.ts', 'src/**/*.integration.test.ts'],
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        minForks: 1,
        maxForks: 4,
      },
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
