import { test, expect, type Page } from '@playwright/test';
import { argus } from '../argus.config';

/**
 * argus — régression visuelle (full-page) sur N breakpoints.
 *
 * Réglages depuis argus.config.ts : routes, breakpoints, dynamicSelectors, seuils.
 * Auth gérée en amont par le projet `setup` (storageState) — pas de login ici.
 *
 * Création / mise à jour des baselines :
 *   npm run argus:visual:update
 * GOTCHA CI : les baselines sont OS/navigateur-spécifiques (suffixe
 * `-<project>-<platform>.png`). Une baseline macOS ne matchera JAMAIS le CI Linux.
 *   → générer/rafraîchir dans l'image Docker officielle : npm run argus:visual:docker-baseline
 */

// Tolérance de diff par mode : REGRESS strict, DEMO laxiste, EXPLORE jamais bloquant.
const DIFF_BUDGET: Record<string, { maxDiffPixelRatio: number; threshold: number }> = {
  REGRESS: { maxDiffPixelRatio: argus.thresholds.visualDiffRatio, threshold: 0.2 },
  DEMO: { maxDiffPixelRatio: 0.05, threshold: 0.3 },
  EXPLORE: { maxDiffPixelRatio: 1, threshold: 0.2 },
};
const budget = DIFF_BUDGET[argus.mode] ?? DIFF_BUDGET.REGRESS;

/**
 * Stabilise la page avant capture : réseau au repos, contenu lazy forcé (scroll
 * de haut en bas puis retour), polices prêtes. Sans ça, images lazy non chargées
 * et FOUT rendent les snapshots flaky.
 */
async function stabilizePage(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        const { scrollHeight } = document.body;
        window.scrollBy(0, step);
        total += step;
        if (total >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0); // cadrage stable
          resolve();
        }
      }, 50);
    });
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

test.describe('argus — régression visuelle (full-page)', () => {
  for (const route of argus.routes) {
    for (const bp of argus.breakpoints) {
      const routeSlug =
        route === '/' ? 'home' : route.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
      const snapshotName = `${routeSlug}-${bp.name}-${bp.width}x${bp.height}.png`;

      test(`${routeSlug} @ ${bp.name} (${bp.width}x${bp.height})`, async ({ page }) => {
        if (argus.mode === 'EXPLORE') {
          test
            .info()
            .annotations.push({ type: 'argus-mode', description: 'EXPLORE (non-bloquant)' });
        }

        // Viewport AVANT navigation pour un layout correct.
        await page.setViewportSize({ width: bp.width, height: bp.height });
        await page.goto(route, { waitUntil: 'domcontentloaded' }); // baseURL via config
        await stabilizePage(page);

        await expect(page).toHaveScreenshot(snapshotName, {
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
          mask: argus.dynamicSelectors.map((sel) => page.locator(sel)),
          maskColor: '#FF00FF',
          maxDiffPixelRatio: budget.maxDiffPixelRatio,
          threshold: budget.threshold,
          timeout: argus.isCI ? 30_000 : 15_000,
        });
      });
    }
  }
});
