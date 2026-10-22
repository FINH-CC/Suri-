import { defineConfig, devices } from '@playwright/test';

// The legacy project serves the parked pre-rebuild build (npm run legacy, port 3241)
// through its own webServer entry; it is the parity reference for later tasks.
// The prod project smoke-tests the production build (npm run build && vite preview, port 3250).
// Playwright has no per-project webServer, so read the --project filter: the prod build only starts when the prod
// project will run (no filter, or one that names prod).
const argv = process.argv.slice(2);
const projects = argv.flatMap((a, i) => (a.startsWith('--project=') ? [a.slice(10)] : a === '--project' && argv[i + 1] ? [argv[i + 1]] : []));
const runsProd = projects.length === 0 || projects.some((p) => p === 'prod' || p.includes('*'));

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] },
  },
  webServer: [
    { command: 'npm run dev', port: 3240, reuseExistingServer: true },
    { command: 'npm run legacy', port: 3241, reuseExistingServer: true },
    ...(runsProd ? [{ command: 'npm run build && npx vite preview --port 3250 --strictPort', port: 3250, reuseExistingServer: !process.env.CI, timeout: 120_000 }] : []),
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
