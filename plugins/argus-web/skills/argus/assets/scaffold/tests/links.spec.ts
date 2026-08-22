import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { argus } from '../argus.config';

/**
 * argus — links.spec.ts
 *
 * Extrait les liens internes (meme origine) uniques de la baseURL, en plafonne
 * le nombre (budget), puis verifie via APIRequestContext que chacun repond < 400.
 *
 * Cible : @playwright/test 1.61.0.
 */

// --- Configuration depuis argus.config.ts (surchargée par env) --------------
const BASE_URL = argus.baseURL;
// Plafond du nombre de liens verifies (evite l'explosion sur gros sitemaps).
const LINK_BUDGET = argus.budget.maxLinks;
// Concurrence des requetes (bornee pour ne pas saturer le serveur cible).
const LINK_CONCURRENCY = argus.budget.linkConcurrency;

type BrokenLink = { url: string; status: number | 'ERROR'; detail?: string };

/**
 * Normalise une URL relative ou absolue vers une URL absolue meme origine,
 * en retirant le fragment. Retourne null si externe / non-http / non pertinent.
 */
function toInternalAbsoluteUrl(rawHref: string, origin: string): string | null {
  const href = rawHref.trim();
  if (!href) return null;
  // On ecarte les schemes non navigables.
  if (/^(mailto:|tel:|javascript:|data:|blob:|#)/i.test(href)) return null;

  let resolved: URL;
  try {
    resolved = new URL(href, origin);
  } catch {
    return null;
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
  // Meme origine uniquement (interne).
  if (resolved.origin !== new URL(origin).origin) return null;

  // On retire le hash pour dedupliquer (#section -> meme document).
  resolved.hash = '';
  return resolved.toString();
}

/**
 * Traite une liste de taches async avec une concurrence bornee.
 * Approche "worker pool" : N workers tirent dans une file partagee par index.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Verifie un lien via APIRequestContext. GET avec suivi de redirections :
 * un 3xx qui resout en < 400 passe. Une exception reseau = ERROR (echec).
 */
async function checkLink(request: APIRequestContext, url: string): Promise<BrokenLink | null> {
  try {
    const response = await request.get(url, {
      maxRedirects: 5,
      timeout: 15_000,
      // failOnStatusCode:false => on inspecte le statut nous-memes.
      failOnStatusCode: false
    });
    const status = response.status();
    return status >= 400 ? { url, status } : null;
  } catch (error) {
    return { url, status: 'ERROR', detail: (error as Error).message };
  }
}

test.describe('argus :: links', () => {
  test('tous les liens internes repondent avec un statut < 400', async ({ page, request }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Extraction des href bruts depuis le DOM.
    const rawHrefs = await page.$$eval('a[href]', (anchors) =>
      anchors.map((a) => a.getAttribute('href') ?? '')
    );

    // Normalisation + dedup + filtrage interne.
    const uniqueInternal = Array.from(
      new Set(
        rawHrefs
          .map((href) => toInternalAbsoluteUrl(href, BASE_URL))
          .filter((url): url is string => url !== null)
      )
    );

    expect(uniqueInternal.length, 'au moins un lien interne doit etre trouve').toBeGreaterThan(0);

    // Application du budget (cap dur).
    const linksToCheck = uniqueInternal.slice(0, LINK_BUDGET);
    if (uniqueInternal.length > LINK_BUDGET) {
      // eslint-disable-next-line no-console
      console.warn(
        `[argus] ${uniqueInternal.length} liens trouves, plafonnes a ${LINK_BUDGET} (ARGUS_LINK_BUDGET).`
      );
    }

    // Verification concurrente bornee.
    const outcomes = await mapWithConcurrency(linksToCheck, LINK_CONCURRENCY, (url) =>
      checkLink(request, url)
    );
    const broken = outcomes.filter((o): o is BrokenLink => o !== null);

    // Rapport agrege (on liste TOUT, pas seulement le premier echec).
    const summary = broken
      .map((b) => `  - ${b.status} ${b.url}${b.detail ? ` (${b.detail})` : ''}`)
      .join('\n');

    expect(
      broken,
      broken.length
        ? `${broken.length}/${linksToCheck.length} lien(s) casse(s) :\n${summary}`
        : ''
    ).toEqual([]);
  });
});
