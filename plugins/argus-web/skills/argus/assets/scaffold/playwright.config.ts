import { defineConfig, devices } from '@playwright/test';
import { argus, type BrowserKey } from './argus.config';

/**
 * argus — configuration Playwright (point d'entrée unique).
 *
 * Tous les réglages spécifiques à l'app vivent dans argus.config.ts.
 * Ici, on assemble : projet `setup` (auth) + un projet par navigateur actif,
 * chacun réutilisant le storageState produit par `setup`.
 *
 * Cible : @playwright/test (voir version épinglée dans package.json).
 * Les baselines visuelles sont OS/navigateur-spécifiques : générer/rafraîchir
 * dans l'image Docker officielle (cf. README + script argus:visual:docker-baseline).
 */

const IS_CI = argus.isCI;
const STORAGE_STATE = argus.auth.storageState;

// Catalogue des projets navigateur disponibles, indexés par clé argus.config.
// Pixel 7 = Chromium mobile (Android 14). Pour du WebKit mobile : devices['iPhone 14'].
// `satisfies` valide les clés tout en gardant les types précis des devices.
const BROWSER_DEVICE = {
  chromium: { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  firefox: { name: 'Desktop Firefox', use: { ...devices['Desktop Firefox'] } },
  webkit: { name: 'Desktop WebKit', use: { ...devices['Desktop Safari'] } },
  mobile: { name: 'Mobile Pixel 7', use: { ...devices['Pixel 7'] } },
} satisfies Record<BrowserKey, { name: string; use: Record<string, unknown> }>;

// Projets navigateur actifs (argus.browsers), chacun dépendant de `setup`.
const activeProjects = argus.browsers.map((key) => {
  const base = BROWSER_DEVICE[key];
  return {
    name: base.name,
    use: { ...base.use, storageState: STORAGE_STATE },
    dependencies: ['setup'],
  };
});

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Interdit un test.only oublié en CI (échoue au lieu de tout filtrer).
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 2 : undefined,

  // Snapshots de référence rangés par fichier de test.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',

  // Console lisible + HTML + JSON + JUnit (intégration CI).
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: argus.thresholds.visualDiffRatio,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  use: {
    baseURL: argus.baseURL,
    // Déterminisme : locale + timezone figées → dates/nombres stables.
    locale: argus.locale,
    timezoneId: argus.timezone,
    colorScheme: 'light',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },

  projects: [
    // 1) Auth : se connecte une fois et écrit le storageState (ou état anonyme si ARGUS_AUTH=off).
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    // 2) Navigateurs actifs, réutilisant la session.
    ...activeProjects,
  ],

  // webServer : décommenter pour lancer l'app locale avant les tests.
  // webServer: {
  //   command: 'npm run start',
  //   url: argus.baseURL,
  //   timeout: 120_000,
  //   reuseExistingServer: !IS_CI,
  // },
});
