import { test, expect } from '@playwright/test';
import { argus } from '../argus.config';
import { attachCollectors, assertPageHealthy } from './_utils/collectors';
import { installCwvCollector, flushCwv, assessCwv } from './_utils/cwv';

/**
 * argus — smoke.spec.ts
 *
 * Santé de la page d'accueil : aucune erreur console, aucune exception JS, aucune
 * requête en échec transport, aucune réponse HTTP >= 400, aucune image cassée.
 * Mesure aussi les Core Web Vitals (attachés au rapport).
 *
 * Réutilise les utils _utils/collectors.ts et _utils/cwv.ts (source unique, pas
 * de duplication). Les CWV sont volontairement INFORMATIFS ici (avertissement)
 * et non bloquants : en lab/headless ils sont bruités et feraient flaker le smoke.
 * Le gating de correction (erreurs/réseau/images) reste strict.
 */

test.describe('argus :: smoke', () => {
  test("la page d'accueil est saine (console / réseau / images) + relevé CWV", async ({
    page,
  }, testInfo) => {
    // Collecteurs branchés AVANT toute navigation, sinon on rate les premiers signaux.
    const collector = attachCollectors(page, {
      // Filtrer le bruit tiers connu au besoin :
      // ignoreUrl: (u) => /google-analytics|hotjar|segment|doubleclick/.test(u),
    });
    // L'init script CWV doit être posé avant page.goto.
    await installCwvCollector(page);

    const response = await page.goto(argus.baseURL, { waitUntil: 'networkidle' });
    expect(response, 'page.goto doit retourner une réponse').toBeTruthy();
    expect(response!.status(), 'le document principal doit être < 400').toBeLessThan(400);

    // --- Core Web Vitals : mesure, attachement, avertissement (non bloquant) ---
    const vitals = await flushCwv(page);
    await testInfo.attach('core-web-vitals.json', {
      contentType: 'application/json',
      body: JSON.stringify({ url: argus.baseURL, ci: argus.isCI, vitals }, null, 2),
    });
    for (const v of assessCwv(vitals)) {
      // eslint-disable-next-line no-console
      console.warn(`[argus] CWV hors budget : ${v.name}=${v.value} > ${v.threshold}`);
    }

    // --- Gating de correction : la page doit être saine ---
    const { healthy, summary } = await assertPageHealthy(page, collector);
    expect(healthy, `Page non saine :\n${JSON.stringify(summary, null, 2)}`).toBe(true);

    collector.dispose();
  });
});
