import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 10000,
  use: {
    headless: true,
  },
  webServer: [
    {
      command: 'npm run dev --prefix sample-app',
      port: 5199,
      reuseExistingServer: !process.env.CI,
      timeout: 10000,
    },
    {
      command: 'npm run dev --prefix sample-app-for-suspense',
      port: 3999,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
