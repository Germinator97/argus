/**
 * argus — Core Web Vitals collector
 * ----------------------------------
 * Mesure les Core Web Vitals (CWV) d'une page via la librairie `web-vitals`
 * de Google, injectée DANS la page avant tout script applicatif grâce à
 * `page.addInitScript`. Les callbacks (`onCLS`, `onLCP`, `onINP`, `onTTFB`,
 * `onFCP`) poussent chaque mesure dans un buffer global (`window.__ARGUS_CWV__`)
 * que l'on récupère ensuite côté Node avec `page.evaluate`.
 *
 * Cibles confirmées :
 *   - web-vitals   : 5.3.0  (API onCLS/onLCP/onINP/onTTFB/onFCP — identique v4↔v5)
 *   - @playwright/test : 1.61.0
 *
 * Pourquoi inliner la source IIFE plutôt qu'un import npm ?
 *   `addInitScript` exécute du code DANS le navigateur, pas dans Node. On ne peut
 *   donc pas y faire `import { onLCP } from 'web-vitals'`. Deux stratégies :
 *     (A) charger le build IIFE depuis le CDN unpkg → dépendance réseau, flaky en CI.
 *     (B) lire le build IIFE local depuis node_modules et l'inliner → hermétique.
 *   On retient (B) : aucune dépendance réseau, version épinglée par le lockfile.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Notation des métriques par web-vitals.
 * `good` / `needs-improvement` / `poor` selon les seuils officiels de Google.
 */
export type CwvRating = 'good' | 'needs-improvement' | 'poor';

/** Acronymes des métriques exposées par web-vitals v4/v5. */
export type CwvMetricName = 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';

/**
 * Forme normalisée d'une métrique remontée côté Node.
 * Sous-ensemble sérialisable de l'interface `Metric` de web-vitals
 * (on omet `entries: PerformanceEntry[]` qui n'est pas JSON-sérialisable).
 */
export interface CwvMetric {
  name: CwvMetricName;
  value: number;
  rating: CwvRating;
  delta: number;
  id: string;
  navigationType: string;
}

/** Résultat agrégé : la dernière valeur connue de chaque métrique. */
export interface CwvReport {
  CLS?: CwvMetric;
  FCP?: CwvMetric;
  INP?: CwvMetric;
  LCP?: CwvMetric;
  TTFB?: CwvMetric;
}

/**
 * Seuils "good" officiels (Google web.dev). Source de vérité pour les assertions.
 * Unités : millisecondes, sauf CLS (score sans dimension).
 * Surchargeables depuis argus.config.ts si le harness fournit ses propres seuils.
 */
export const CWV_THRESHOLDS = {
  /** Largest Contentful Paint — ms (good ≤ 2500). */
  LCP: 2500,
  /** Cumulative Layout Shift — score (good ≤ 0.1). */
  CLS: 0.1,
  /** Interaction to Next Paint — ms (good ≤ 200). */
  INP: 200,
  /** Time To First Byte — ms (good ≤ 800). */
  TTFB: 800,
} as const;

export type CwvThresholdKey = keyof typeof CWV_THRESHOLDS;

/** Clé du buffer global posé dans la page. Préfixe explicite pour éviter les collisions. */
const WINDOW_BUFFER_KEY = '__ARGUS_CWV__';

/**
 * Résout et lit le build IIFE de web-vitals depuis node_modules.
 * `createRequire(import.meta.url)` permet d'utiliser `require.resolve`
 * même en module ESM (le projet argus peut être en `"type": "module"`).
 *
 * On vise le build "attribution" : il expose les mêmes onXXX mais ajoute des
 * données de diagnostic (élément LCP, cible INP) utiles en mode EXPLORE.
 * Si tu veux le build minimal, remplace par 'web-vitals/dist/web-vitals.iife.js'.
 */
let cachedIifeSource: string | null = null;

/**
 * Résout et lit le build IIFE de web-vitals depuis node_modules (mémoïsé, lazy).
 *
 * On utilise le `require` GLOBAL : Playwright charge ce fichier en CommonJS pour
 * un projet "type":"commonjs" (le défaut), où `require` est disponible. On résout
 * l'ENTRÉE PRINCIPALE du package puis on construit le chemin de l'IIFE en sibling
 * dans dist/ — éviter de résoudre un sous-chemin `web-vitals/dist/*` qui peut
 * lever ERR_PACKAGE_PATH_NOT_EXPORTED selon la version.
 *
 * Projet ESM ("type":"module") : `require` n'existe pas → remplacer par
 * createRequire(import.meta.url). L'appelant (installCwvCollector) capture toute
 * erreur, donc l'absence de CWV n'interrompt JAMAIS un test.
 */
function loadWebVitalsIifeSource(): string {
  if (cachedIifeSource !== null) return cachedIifeSource;
  const mainEntry = require.resolve('web-vitals');
  const distDir = path.dirname(mainEntry);
  // Build "attribution" (diagnostics LCP/INP, utile en EXPLORE) sinon build minimal.
  const candidates = [
    path.join(distDir, 'web-vitals.attribution.iife.js'),
    path.join(distDir, 'web-vitals.iife.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const src = readFileSync(candidate, 'utf-8');
      cachedIifeSource = src;
      return src;
    }
  }
  throw new Error(
    `[argus] build IIFE web-vitals introuvable dans ${distDir}. ` +
      'Vérifiez que web-vitals est installé (^4.2 || ^5).',
  );
}

/**
 * Init script injecté dans la page. S'exécute AVANT les scripts applicatifs,
 * ce qui est indispensable : onLCP/onCLS/onINP doivent observer dès le départ.
 *
 * Le build IIFE expose tout sur le global `webVitals`.
 * `reportAllChanges: true` → on reçoit chaque mise à jour, donc on garde
 * toujours la dernière valeur (LCP/CLS/INP évoluent jusqu'au unload).
 */
function buildInitScript(): string {
  return `
    (() => {
      // Buffer des dernières métriques connues (1 entrée max par métrique).
      window.${WINDOW_BUFFER_KEY} = window.${WINDOW_BUFFER_KEY} || {};

      // Source de la librairie web-vitals (build IIFE → global \`webVitals\`).
      ${loadWebVitalsIifeSource()}

      const record = (metric) => {
        // On ne conserve que les champs sérialisables (pas \`entries\`).
        window.${WINDOW_BUFFER_KEY}[metric.name] = {
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          delta: metric.delta,
          id: metric.id,
          navigationType: metric.navigationType,
        };
      };

      // reportAllChanges:true → on garde la valeur la plus récente de chaque métrique.
      const opts = { reportAllChanges: true };
      webVitals.onCLS(record, opts);
      webVitals.onLCP(record, opts);
      webVitals.onINP(record, opts);
      webVitals.onTTFB(record, opts);
      webVitals.onFCP(record, opts);
    })();
  `;
}

/**
 * Installe le collecteur CWV sur la page. À appeler AVANT `page.goto`,
 * sinon l'init script ne s'exécute pas pour la navigation en cours.
 *
 * @example
 *   await installCwvCollector(page);
 *   await page.goto(process.env.ARGUS_BASE_URL ?? 'http://localhost:3000');
 *   const report = await collectCwv(page);
 */
export async function installCwvCollector(page: Page): Promise<boolean> {
  try {
    await page.addInitScript({ content: buildInitScript() });
    return true;
  } catch (error) {
    // L'absence/non-résolution de web-vitals ne doit JAMAIS casser un test :
    // on avertit et on continue sans CWV (collectCwv renverra {}).
    // eslint-disable-next-line no-console
    console.warn('[argus] collecteur CWV non installé :', (error as Error).message);
    return false;
  }
}

/**
 * Récupère le rapport CWV courant depuis la page.
 *
 * IMPORTANT (gotchas) :
 *   - LCP et INP ne sont "finalisés" qu'au moment où la page passe en arrière-plan
 *     (visibilitychange → hidden) ou au unload. En test headless, on force ce
 *     basculement pour obtenir des valeurs stables (voir `flushCwv`).
 *   - INP requiert une interaction utilisateur réelle ; sans clic/clavier il
 *     restera `undefined`. C'est attendu sur une page consultée passivement.
 *   - TTFB/FCP/LCP/CLS sont généralement disponibles après le `load`.
 */
export async function collectCwv(page: Page): Promise<CwvReport> {
  return page.evaluate(
    (key) => (window as unknown as Record<string, CwvReport>)[key] ?? {},
    WINDOW_BUFFER_KEY,
  );
}

/**
 * Force web-vitals à émettre les valeurs finales de LCP/INP/CLS en simulant
 * un passage en arrière-plan (dispatch d'un `visibilitychange`), puis lit le
 * rapport. À privilégier avant les assertions de fin de test.
 *
 * On laisse une micro-pause (`waitForTimeout`) pour que les callbacks
 * asynchrones de web-vitals aient le temps de pousser dans le buffer.
 */
export async function flushCwv(page: Page): Promise<CwvReport> {
  await page.evaluate(() => {
    // Simule le passage onglet→arrière-plan : déclenche le report final de web-vitals.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Laisse le temps aux callbacks (PerformanceObserver) de flusher. 200ms suffisent.
  await page.waitForTimeout(200);
  return collectCwv(page);
}

/**
 * Évalue un rapport CWV contre les seuils `CWV_THRESHOLDS`.
 * Retourne la liste des violations (vide = tout est dans le vert).
 * Métriques absentes (ex. INP sans interaction) → ignorées, pas comptées en échec.
 *
 * @example
 *   const report = await flushCwv(page);
 *   const violations = assessCwv(report);
 *   expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
 */
export function assessCwv(report: CwvReport): Array<{
  name: CwvThresholdKey;
  value: number;
  threshold: number;
}> {
  const violations: Array<{
    name: CwvThresholdKey;
    value: number;
    threshold: number;
  }> = [];

  (Object.keys(CWV_THRESHOLDS) as CwvThresholdKey[]).forEach((key) => {
    const metric = report[key];
    if (!metric) return; // métrique non mesurée → on ne juge pas
    const threshold = CWV_THRESHOLDS[key];
    if (metric.value > threshold) {
      violations.push({ name: key, value: metric.value, threshold });
    }
  });

  return violations;
}
