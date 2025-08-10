import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'unit',
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/shared/setup-unit.ts'],
    testTimeout: 10000, // 10 seconds max per unit test
    hookTimeout: 5000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/**', 'src/**/*.integration.test.ts', 'src/**/*.test.ts'],
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
