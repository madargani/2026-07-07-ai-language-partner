import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: 'src/__tests__',
    environment: 'node',
    setupFiles: ['./setup.ts'],
    reporter: 'verbose',
  },
});
