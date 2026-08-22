/**
 * Argus QA harness — authentication setup project.
 *
 * Stratégie (recommandation Playwright officielle, version-stable) :
 *   - Un projet `setup` se connecte UNE seule fois et sérialise le contexte
 *     navigateur (cookies + localStorage + IndexedDB) dans STORAGE_STATE_PATH.
 *   - Les autres projets déclarent `dependencies: ['setup']` et réutilisent ce
 *     fichier via `use.storageState`, donc chaque test démarre déjà authentifié.
 *
 * Secrets : QA_USER / QA_PASS sont lus EXCLUSIVEMENT depuis process.env.
 * Aucun identifiant n'est codé en dur. Le fichier de session vit sous
 * playwright/.auth/ qui DOIT être gitignoré (il contient des jetons de session).
 *
 * Garde (no-op) : si l'auth n'est pas requise (ARGUS_AUTH=off) ou si les
 * identifiants sont absents hors CI, ce setup se skip proprement et les projets
 * dépendants tournent en visiteur anonyme.
 */
import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// --- Configuration via environnement (fallbacks sains) -----------------------

/** URL de base de l'app sous test. Fallback localhost pour le dev. */
const BASE_URL = process.env.ARGUS_BASE_URL ?? 'http://localhost:3000';

/** Identifiants — JAMAIS de valeur par défaut : pas de secret en dur. */
const QA_USER = process.env.QA_USER;
const QA_PASS = process.env.QA_PASS;

/** true en CI (GitHub Actions, GitLab CI… exposent CI="true"). */
const IS_CI = !!process.env.CI;

/**
 * Active/désactive l'authentification. Par défaut activée.
 * Mettre ARGUS_AUTH=off (ou false/0/no) pour tester en visiteur anonyme.
 */
const AUTH_REQUIRED = !['off', 'false', '0', 'no'].includes(
  (process.env.ARGUS_AUTH ?? 'on').toLowerCase(),
);

/**
 * Chemin du storageState. DOIT correspondre à `use.storageState` dans
 * playwright.config.ts. Le dossier playwright/.auth/ est gitignoré.
 */
const STORAGE_STATE_PATH = path.resolve(process.cwd(), 'playwright/.auth/user.json');

/**
 * Durée de validité du cache de session (ms). Au-delà, on se reconnecte.
 * 12h par défaut : assez court pour des jetons de session courants.
 */
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// --- Helpers -----------------------------------------------------------------

/** Retourne true si un storageState récent existe déjà (re-login inutile). */
function hasFreshStorageState(): boolean {
  try {
    const stat = fs.statSync(STORAGE_STATE_PATH);
    if (stat.size === 0) return false; // fichier vide/sentinelle → invalide
    return Date.now() - stat.mtimeMs < SESSION_MAX_AGE_MS;
  } catch {
    return false; // fichier absent
  }
}

/** Écrit un storageState vide (visiteur anonyme) pour satisfaire les projets dépendants. */
async function writeAnonymousState(page: import('@playwright/test').Page): Promise<void> {
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
}

// --- Setup project -----------------------------------------------------------

setup('authenticate', async ({ page }) => {
  // 1) Auth désactivée → on écrit un état anonyme et on s'arrête (no-op).
  if (!AUTH_REQUIRED) {
    await writeAnonymousState(page);
    setup.skip(true, 'ARGUS_AUTH désactivé — exécution en visiteur anonyme.');
    return;
  }

  // 2) Session déjà valide en cache → on évite un login redondant.
  if (hasFreshStorageState()) {
    setup.skip(true, 'storageState récent réutilisé — pas de reconnexion.');
    return;
  }

  // 3) Garde sur les identifiants.
  //    En CI : échec franc (un run CI sans creds est une erreur de config).
  //    En local : skip propre + état anonyme, pour ne pas bloquer le dev.
  if (!QA_USER || !QA_PASS) {
    if (IS_CI) {
      throw new Error(
        "Identifiants manquants : définissez QA_USER et QA_PASS dans l'environnement CI " +
          '(secrets), ou désactivez l\'auth avec ARGUS_AUTH=off.',
      );
    }
    await writeAnonymousState(page);
    setup.skip(
      true,
      'QA_USER/QA_PASS absents en local — login ignoré, exécution anonyme.',
    );
    return;
  }

  // 4) Login par formulaire. Adapter les sélecteurs à votre app sous test.
  //    On privilégie les locators basés sur les rôles (accessibilité-first).
  await page.goto(`${BASE_URL}/login`);

  await page.getByLabel(/e-?mail|utilisateur|username/i).fill(QA_USER);
  await page.getByLabel(/mot de passe|password/i).fill(QA_PASS);
  await page.getByRole('button', { name: /se connecter|sign in|connexion/i }).click();

  // 5) IMPORTANT : attendre que la session soit RÉELLEMENT établie avant de
  //    sérialiser. Le login pose souvent les cookies au fil de redirections ;
  //    sauver trop tôt capture un cookie jar incomplet.
  //    Remplacer l'attente ci-dessous par un signal fiable de votre app.
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
  await expect(
    page.getByRole('button', { name: /profil|account|déconnexion|logout/i }),
  ).toBeVisible();

  // 6) Sérialiser le contexte authentifié. storageState persiste cookies +
  //    localStorage + IndexedDB (PAS sessionStorage — spécifique à l'onglet).
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
