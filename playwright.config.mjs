import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:4325',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4325',
    url: 'http://127.0.0.1:4325/es/',
    timeout: 60_000,
  },
});
