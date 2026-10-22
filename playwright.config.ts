import { defineConfig, devices } from '@playwright/test';

// The legacy project serves the parked pre-rebuild build (npm run legacy, port 3241)
// through its own webServer entry; it is the parity reference for later tasks.
// The prod project smoke-tests the production build (npm run build && vite preview, port 3250).
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] },
  },
  webServer: [
    { command: 'npm run dev', port: 3240, reuseExistingServer: true },
    { command: 'npm run legacy', port: 3241, reuseExistingServer: true },
    { command: 'npm run build && npx vite preview --port 3250 --strictPort', port: 3250, reuseExistingServer: false, timeout: 120_000 },
  ],
  projects: [
    {
      name: 'desktop',
      testIgnore: ['legacy.spec.ts', 'prod.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:3240' },
    },
    {
      name: 'mobile',
      testIgnore: ['legacy.spec.ts', 'prod.spec.ts'],
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', baseURL: 'http://localhost:3240' },
    },
    {
      name: 'prod',
      testMatch: 'prod.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:3250' },
    },
    {
      name: 'legacy',
      testMatch: 'legacy.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:3241' },
    },
  ],
});
