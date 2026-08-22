/**
 * argus — Page collectors (erreurs console, exceptions, réseau, images cassées)
 * -----------------------------------------------------------------------------
 * Attache des listeners sur la `Page` Playwright pour capturer passivement,
 * pendant un scénario, tous les signaux de santé d'une page :
 *   - erreurs `console.error` (et warnings, optionnel)
 *   - exceptions JS non catchées (`pageerror`)
 *   - réponses réseau en échec : 4xx / 5xx (`response`)
 *   - requêtes réseau avortées (`requestfailed` : DNS, CORS, timeout, refus...)
 * Plus un helper pour détecter les images cassées (`naturalWidth === 0`).
 *
 * Cible confirmée : @playwright/test 1.61.0
 *
 * Événements Playwright utilisés (signatures confirmées doc officielle 1.61) :
 *   - page.on('console', (msg: ConsoleMessage) => ...) → msg.type(), msg.text()
 *   - page.on('pageerror', (err: Error) => ...)
 *   - page.on('response', (res: Response) => ...) → res.status(), res.url()
 *   - page.on('requestfailed', (req: Request) => ...) → req.failure(), req.url()
 *   - page.off(event, handler) pour le teardown (évite les fuites entre tests)
 */

import type {
  ConsoleMessage,
  Page,
  Request,
  Response,
} from '@playwright/test';

/** Plancher des codes HTTP considérés comme des erreurs client. */
const HTTP_CLIENT_ERROR_MIN = 400;
/** Plafond exclusif : au-delà (≥600) ce ne sont plus des statuts HTTP standards. */
const HTTP_ERROR_MAX_EXCLUSIVE = 600;

/** Une erreur console capturée. */
export interface ConsoleError {
  /** Type du message console : 'error', 'warning', etc. */
  type: string;
  text: string;
  /** URL de la page au moment de la capture (pour le contexte multi-pages). */
  location: string;
}

/** Une exception JS non catchée (event `pageerror`). */
export interface PageException {
  message: string;
  stack?: string;
}

/** Une réponse réseau en échec (statut 4xx/5xx). */
export interface NetworkError {
  url: string;
  status: number;
  /** Méthode HTTP de la requête associée. */
  method: string;
}

/** Une requête réseau qui n'a jamais abouti (avortée / refusée). */
export interface RequestFailure {
  url: string;
  method: string;
  /** Raison brute fournie par le navigateur (ex. 'net::ERR_NAME_NOT_RESOLVED'). */
  reason: string;
}

/** Une image dont le chargement a échoué (détectée via naturalWidth === 0). */
export interface BrokenImage {
  /** Attribut `src` résolu de l'image. */
  src: string;
  /** Texte alternatif, utile pour identifier l'image dans le rapport. */
  alt: string;
}

/** Sac de tous les signaux collectés pendant un scénario. */
export interface CollectedSignals {
  consoleErrors: ConsoleError[];
  pageExceptions: PageException[];
  networkErrors: NetworkError[];
  requestFailures: RequestFailure[];
}

/**
 * Options de configuration du collecteur.
 */
export interface CollectorOptions {
  /**
   * Inclure aussi les `console.warning` en plus des `console.error`.
   * Défaut : false (on ne capture que les erreurs).
   */
  captureWarnings?: boolean;
  /**
   * Prédicat d'ignore : retourne `true` pour exclure une URL du suivi réseau.
   * Pratique pour filtrer le bruit tiers (analytics, beacons...).
   * @example (url) => url.includes('google-analytics.com')
   */
  ignoreUrl?: (url: string) => boolean;
}

/**
 * Poignée retournée par `attachCollectors` : expose les buffers (live) et
 * un `dispose()` pour détacher proprement les listeners en fin de test.
 */
export interface CollectorHandle {
  /** Buffers vivants — se remplissent au fil du scénario. */
  signals: CollectedSignals;
  /** Détache tous les listeners (à appeler en `afterEach` / teardown). */
  dispose: () => void;
}

/**
 * Détermine si un code HTTP est une erreur 4xx ou 5xx.
 * Note : on borne à <600 car au-delà ce ne sont pas des statuts HTTP valides.
 */
function isHttpError(status: number): boolean {
  return status >= HTTP_CLIENT_ERROR_MIN && status < HTTP_ERROR_MAX_EXCLUSIVE;
}

/**
 * Attache tous les listeners sur la page et commence la collecte immédiatement.
 * À appeler le plus tôt possible (avant `page.goto`) pour ne rien rater.
 *
 * IMMUTABILITÉ : les handlers poussent dans des tableaux dédiés ; les objets
 * `signals` ne sont jamais mutés en place par l'appelant — on lit, on ne modifie pas.
 *
 * @example
 *   const collector = attachCollectors(page, {
 *     ignoreUrl: (u) => u.includes('analytics'),
 *   });
 *   await page.goto(process.env.ARGUS_BASE_URL ?? 'http://localhost:3000');
 *   // ... scénario ...
 *   expect(collector.signals.pageExceptions).toHaveLength(0);
 *   collector.dispose();
 */
export function attachCollectors(
  page: Page,
  options: CollectorOptions = {},
): CollectorHandle {
  const { captureWarnings = false, ignoreUrl } = options;

  const consoleErrors: ConsoleError[] = [];
  const pageExceptions: PageException[] = [];
  const networkErrors: NetworkError[] = [];
  const requestFailures: RequestFailure[] = [];

  const shouldIgnore = (url: string): boolean =>
    typeof ignoreUrl === 'function' && ignoreUrl(url);

  // --- console.error (+ warning optionnel) -----------------------------------
  const onConsole = (msg: ConsoleMessage): void => {
    const type = msg.type();
    const isError = type === 'error';
    const isWarning = type === 'warning';
    if (isError || (captureWarnings && isWarning)) {
      consoleErrors.push({
        type,
        text: msg.text(),
        location: page.url(),
      });
    }
  };

  // --- exceptions JS non catchées (event 'pageerror' → reçoit un Error) -------
  const onPageError = (error: Error): void => {
    pageExceptions.push({
      message: error.message,
      stack: error.stack,
    });
  };

  // --- réponses HTTP 4xx / 5xx (event 'response') ----------------------------
  const onResponse = (response: Response): void => {
    const url = response.url();
    if (shouldIgnore(url)) return;
    const status = response.status();
    if (isHttpError(status)) {
      networkErrors.push({
        url,
        status,
        method: response.request().method(),
      });
    }
  };

  // --- requêtes avortées (event 'requestfailed' → reçoit un Request) ---------
  // Couvre DNS, CORS bloqué, timeout, connexion refusée : pas de réponse du tout.
  const onRequestFailed = (request: Request): void => {
    const url = request.url();
    if (shouldIgnore(url)) return;
    requestFailures.push({
      url,
      method: request.method(),
      // failure() peut être null en théorie ; fallback message explicite.
      reason: request.failure()?.errorText ?? 'unknown failure',
    });
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  const dispose = (): void => {
    // page.off détache les listeners → indispensable si la page est réutilisée
    // entre tests, sinon fuite mémoire + double comptage.
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
  };

  return {
    signals: { consoleErrors, pageExceptions, networkErrors, requestFailures },
    dispose,
  };
}

/**
 * Détecte les images cassées de la page courante.
 * Une image est "cassée" si elle est terminée (`complete`) mais que son
 * `naturalWidth` vaut 0 — signature classique d'un 404/format invalide.
 *
 * On évalue côté navigateur via `page.evaluate`, en ne retournant que des
 * données sérialisables (src/alt). Les `<img loading="lazy">` hors viewport
 * et non encore chargées sont volontairement exclues (`complete === false`)
 * pour éviter les faux positifs.
 *
 * @example
 *   const broken = await findBrokenImages(page);
 *   expect(broken, JSON.stringify(broken)).toHaveLength(0);
 */
export async function findBrokenImages(page: Page): Promise<BrokenImage[]> {
  return page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => ({
        // `img.src` renvoie l'URL résolue absolue (ou '' si pas de src).
        src: img.currentSrc || img.src,
        alt: img.alt,
      }));
  });
}

/**
 * Agrège tous les signaux + images cassées en un verdict booléen + détail.
 * Helper de confort pour les assertions "la page est saine".
 *
 * @example
 *   const { healthy, summary } = await assertPageHealthy(page, collector);
 *   expect(healthy, JSON.stringify(summary, null, 2)).toBe(true);
 */
export async function assertPageHealthy(
  page: Page,
  collector: CollectorHandle,
): Promise<{
  healthy: boolean;
  summary: CollectedSignals & { brokenImages: BrokenImage[] };
}> {
  const brokenImages = await findBrokenImages(page);
  const { signals } = collector;
  const healthy =
    signals.consoleErrors.length === 0 &&
    signals.pageExceptions.length === 0 &&
    signals.networkErrors.length === 0 &&
    signals.requestFailures.length === 0 &&
    brokenImages.length === 0;

  return {
    healthy,
    // Copie défensive (immutabilité) : l'appelant ne modifie pas les buffers vivants.
    summary: {
      consoleErrors: [...signals.consoleErrors],
      pageExceptions: [...signals.pageExceptions],
      networkErrors: [...signals.networkErrors],
      requestFailures: [...signals.requestFailures],
      brokenImages,
    },
  };
}
