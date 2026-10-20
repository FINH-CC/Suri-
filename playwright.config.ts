import { defineConfig, devices } from '@playwright/test';

// The legacy project serves the parked pre-rebuild build (npm run legacy, port 3241)
// through its own webServer entry; it is the parity reference for later tasks.
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] },
  },
  webServer: [
    { command: 'npm run dev', port: 3240, reuseExistingServer: true },
    { command: 'npm run legacy', port: 3241, reuseExistingServer: true },
  ],
  projects: [
    {
      name: 'desktop',
      testIgnore: 'legacy.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:3240' },
    },
    {
      name: 'mobile',
      testIgnore: 'legacy.spec.ts',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', baseURL: 'http://localhost:3240' },
    },
    {
      name: 'legacy',
      testMatch: 'legacy.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:3241' },
    },
  ],
});
