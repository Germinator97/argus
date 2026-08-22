import { test, expect } from '@playwright/test';
import { argus } from '../argus.config';

/**
 * argus :: authz — contrôle d'accès (broken access control / IDOR).
 *
 * 1) Un visiteur ANONYME ne doit pas atteindre les routes protégées
 *    (argus.config.protectedRoutes). Actif dès qu'au moins une route est déclarée.
 * 2) Isolation inter-rôles (IDOR) — template, actif si >= 2 rôles configurés
 *    (argus.config.roles, chacun avec son storageState).
 *
 * Non destructif : on NAVIGUE et on observe le verdict d'accès, sans rien muter.
 */

test.describe("argus :: authz (contrôle d'accès)", () => {
  test('un visiteur anonyme ne peut PAS accéder aux routes protégées', async ({ browser }) => {
    test.skip(
      argus.protectedRoutes.length === 0,
      'Aucune route protégée déclarée (argus.config.protectedRoutes).',
    );

    // Contexte VIERGE sans storageState → vrai anonyme (ignore l'auth du projet).
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const leaks: string[] = [];

    try {
      for (const route of argus.protectedRoutes) {
        const url = new URL(route, argus.baseURL).toString();
        const res = await page.goto(url, { waitUntil: 'load' }).catch(() => null);
        const status = res?.status() ?? 0;
        const finalUrl = page.url();
        const redirectedToAuth = /login|signin|sign-in|auth|connexion/i.test(finalUrl);
        const blockedStatus = status === 401 || status === 403;
        // Accès correctement refusé si 401/403 OU redirigé vers une page d'auth.
        if (!blockedStatus && !redirectedToAuth) {
          leaks.push(`${route} → HTTP ${status} (URL finale: ${finalUrl})`);
        }
      }
    } finally {
      await ctx.close();
    }

    expect(
      leaks,
      leaks.length ? `Routes protégées atteignables en anonyme :\n${leaks.join('\n')}` : '',
    ).toEqual([]);
  });

  test('isolation inter-rôles (IDOR) — template', async ({ browser }) => {
    test.skip(
      argus.roles.length < 2,
      'Configurer >= 2 rôles (argus.config.roles) pour activer ce contrôle.',
    );

    // Patron : le storageState du rôle A ne doit PAS accéder à une ressource
    // réservée au rôle B. À adapter aux ressources réelles de l'app.
    const [roleA, roleB] = argus.roles;
    const ctxA = await browser.newContext({ storageState: roleA.storageState });
    try {
      // Exemple à dé-commenter et adapter :
      // const pageA = await ctxA.newPage();
      // const url = new URL('/admin/secret-de-' + roleB.name, argus.baseURL).toString();
      // const res = await pageA.goto(url, { waitUntil: 'load' });
      // expect([401, 403], `${roleA.name} ne doit pas accéder à la ressource de ${roleB.name}`)
      //   .toContain(res?.status() ?? 0);
      expect(roleB.name, 'template authz : configurer la ressource réelle').toBeTruthy();
    } finally {
      await ctxA.close();
    }
  });
});
