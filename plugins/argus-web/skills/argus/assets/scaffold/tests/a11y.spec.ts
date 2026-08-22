// tests/a11y.spec.ts
//
// Argus QA harness — suite d'accessibilité (axe WCAG 2.0/2.1 A+AA).
// Routes auditées depuis argus.config.ts. Quand l'auth est active, les pages sont
// scannées AVEC la session (storageState du projet `setup`).
//
// Pour chaque route : navigation → scan axe → attache le JSON au rapport →
// assert zéro violation >= au seuil d'impact (ARGUS_A11Y_IMPACT, def. serious).
// Plus un contrôle de visibilité du focus clavier (WCAG 2.4.7), qu'axe ne couvre pas.

import {
  test,
  expect,
  attachAxeResults,
  filterViolationsByImpact,
  summarizeViolations,
  ARGUS_IMPACT_THRESHOLD,
} from './_fixtures/axe';
import { argus } from '../argus.config';

function routeName(route: string): string {
  return route === '/' ? 'home' : route.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
}

test.describe('Accessibilité (axe WCAG 2.0/2.1 A+AA)', () => {
  // Les scans axe peuvent être lents sur des pages riches.
  test.slow(argus.isCI, 'Scans axe potentiellement lents en CI.');

  for (const route of argus.routes) {
    const name = routeName(route);

    test(`la page "${name}" n'a aucune violation a11y >= ${ARGUS_IMPACT_THRESHOLD}`, async ({
      page,
      makeAxeBuilder,
    }, testInfo) => {
      // baseURL via config ; 'load' couvre le contenu critique.
      await page.goto(route, { waitUntil: 'load' });

      const results = await makeAxeBuilder().analyze();
      await attachAxeResults(testInfo, results, `axe-${name}`);

      const blocking = filterViolationsByImpact(results.violations);
      expect(
        blocking,
        `Violations a11y bloquantes sur "${name}" (seuil: ${ARGUS_IMPACT_THRESHOLD}) :\n${summarizeViolations(blocking)}`,
      ).toEqual([]);
    });
  }
});

test.describe('Visibilité du focus clavier', () => {
  // axe ne valide pas de façon fiable que le focus est VISIBLE (c'est du rendu).
  // On vérifie ici que tabuler à travers la page :
  //   - déplace bien le focus (pas piégé / pas perdu sur <body>),
  //   - produit un indicateur de focus visible (outline / box-shadow / ring).
  // NB : heuristique perfectible (custom focus styles, :focus-visible en headless) —
  //      à ajuster selon le design system.
  const firstRoute = argus.routes[0] ?? '/';

  test('le focus est visible en tabulant sur la première route', async ({ page }, testInfo) => {
    await page.goto(firstRoute, { waitUntil: 'load' });

    const MAX_TABS = 15; // borne raisonnable pour parcourir le header/nav.
    const offenders: string[] = [];

    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press('Tab');

      const focusInfo = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) {
          return null;
        }
        const style = window.getComputedStyle(el);
        const after = window.getComputedStyle(el, '::after');
        const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const hasBoxShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
        const hasAfterRing =
          after.content !== 'none' &&
          (after.boxShadow !== 'none' || parseFloat(after.borderWidth || '0') > 0);
        const hasVisibleFocus = hasOutline || hasBoxShadow || hasAfterRing;
        return {
          tag: el.tagName.toLowerCase(),
          label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '',
          hasVisibleFocus,
        };
      });

      if (focusInfo === null) {
        break; // plus d'élément focusable atteignable
      }
      if (!focusInfo.hasVisibleFocus) {
        offenders.push(`${focusInfo.tag} "${focusInfo.label}"`);
      }
    }

    await testInfo.attach('focus-visibility-offenders', {
      body: JSON.stringify(offenders, null, 2),
      contentType: 'application/json',
    });

    expect(
      offenders,
      `Éléments focusables sans indicateur de focus visible :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  // "Skip link" (lien d'évitement) reçu au 1er Tab — WCAG 2.4.1. Skippé si absent.
  test("le premier élément tabulable expose un lien d'évitement (optionnel)", async ({ page }) => {
    await page.goto(firstRoute, { waitUntil: 'load' });
    await page.keyboard.press('Tab');

    const firstFocused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? { tag: el.tagName.toLowerCase(), text: el.textContent?.trim() ?? '' } : null;
    });

    test.skip(
      firstFocused?.tag !== 'a' ||
        !/skip|aller au contenu|contenu principal/i.test(firstFocused?.text ?? ''),
      'Pas de skip link détecté — contrôle ignoré.',
    );

    expect(firstFocused?.tag).toBe('a');
  });
});
