import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 10000,
  use: {
    headless: true,
  },
  webServer: {
    command: 'npm run dev --prefix sample-app',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
