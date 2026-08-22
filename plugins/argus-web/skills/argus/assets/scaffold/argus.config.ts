/**
 * argus.config.ts — réglages du harness QA spécifiques à l'application.
 *
 * C'EST LE FICHIER À ÉDITER pour adapter Argus à une app : URL, navigateurs
 * actifs, routes auditées, breakpoints, régions dynamiques masquées, seuils.
 * La config Playwright et les specs importent depuis ici (source unique).
 *
 * Les valeurs sensibles (URL d'env, identifiants) restent surchargeables via
 * variables d'environnement — indispensables en CI :
 *   ARGUS_BASE_URL · ARGUS_MODE · ARGUS_AUTH · ARGUS_A11Y_IMPACT · QA_USER · QA_PASS
 */

export type Breakpoint = { readonly name: string; readonly width: number; readonly height: number };
export type BrowserKey = 'chromium' | 'firefox' | 'webkit' | 'mobile';
export type ArgusMode = 'EXPLORE' | 'DEMO' | 'REGRESS';
export type A11yImpact = 'minor' | 'moderate' | 'serious' | 'critical';

const envOr = (key: string, fallback: string): string => process.env[key] ?? fallback;

export const argus = {
  /** URL de base. Fallback dev ; en CI, surcharger via ARGUS_BASE_URL (secret). */
  baseURL: envOr('ARGUS_BASE_URL', 'http://localhost:3000'),

  /** true en CI (GitHub Actions, GitLab… exposent CI). */
  isCI: !!process.env.CI,

  /** Mode courant. Pilote la tolérance visuelle et le gating (voir specs). */
  mode: envOr('ARGUS_MODE', 'REGRESS').toUpperCase() as ArgusMode,

  /** Navigateurs/projets actifs. Ajouter 'firefox', 'webkit', 'mobile' au besoin. */
  browsers: ['chromium'] as BrowserKey[],

  /** Breakpoints pour la régression visuelle (mobile / tablette / desktop). */
  breakpoints: [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ] as Breakpoint[],

  /** Routes clés à auditer (visual + a11y partent d'ici). Adapter à l'app. */
  routes: ['/'] as string[],

  /**
   * Régions non déterministes masquées dans les snapshots visuels
   * (dates, soldes Mobile Money live, carrousels, toasts…). Sans masquage,
   * ces zones rendent les snapshots flaky.
   */
  dynamicSelectors: [
    '[data-testid="current-date"]',
    '[data-testid="live-balance"]',
    '[data-dynamic="true"]',
    '.cookie-banner',
    '.toast, [role="status"]',
    'video, [data-testid="carousel"]',
    'time',
  ] as string[],

  /** Seuils QA. Standards Google/WCAG ; changent rarement. */
  thresholds: {
    lcpMs: 2500,
    cls: 0.1,
    inpMs: 200,
    ttfbMs: 800,
    /** Ratio de pixels divergents toléré en régression visuelle (0..1). */
    visualDiffRatio: 0.01,
  },

  /** Seuil d'impact a11y bloquant (minor<moderate<serious<critical). */
  a11yImpact: envOr('ARGUS_A11Y_IMPACT', 'serious') as A11yImpact,

  /** Localisation (Afrique de l'Ouest, Mobile Money). Fige dates/nombres → snapshots stables. */
  locale: 'fr-FR',
  timezone: 'Africa/Abidjan',

  /** Authentification. Secrets via env UNIQUEMENT (jamais en dur). */
  auth: {
    /** ARGUS_AUTH=off → exécution en visiteur anonyme. */
    required: !['off', 'false', '0', 'no'].includes(envOr('ARGUS_AUTH', 'on').toLowerCase()),
    /** Doit correspondre à use.storageState dans playwright.config.ts. */
    storageState: 'playwright/.auth/user.json',
    loginPath: '/login',
  },

  /** Budget d'audit des liens internes (évite l'explosion sur gros sitemaps). */
  budget: {
    maxLinks: Number(process.env.ARGUS_LINK_BUDGET ?? '50'),
    linkConcurrency: Number(process.env.ARGUS_LINK_CONCURRENCY ?? '8'),
  },

  /** Dimension SECURITY (DAST/SCA/headers/cookies/secrets/authz). Voir tests/security.spec.ts. */
  security: {
    /** En-têtes de réponse EXIGÉS (manquant = finding bloquant). */
    requiredHeaders: [
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
    ] as string[],
    /** En-têtes RECOMMANDÉS (manquant = finding mineur, non bloquant). */
    recommendedHeaders: ['permissions-policy', 'cross-origin-opener-policy'] as string[],
    /** Strict-Transport-Security : exigé uniquement en HTTPS (ignoré en http local). */
    requireHstsOnHttps: true,
    /** Cookies de session (regex nom) devant être Secure+HttpOnly+SameSite. */
    sessionCookiePattern: 'sess|sid|token|auth|jwt|csrf',
    /** Chemins sensibles qui NE doivent PAS répondre 200. */
    forbiddenPaths: [
      '/.env',
      '/.env.local',
      '/.git/config',
      '/.git/HEAD',
      '/config.json',
      '/.aws/credentials',
      '/server-status',
    ] as string[],
    /** Détecter les source maps exposées (*.js.map atteignables). */
    checkSourceMaps: true,
    /** Motifs de secrets recherchés dans les bundles JS chargés côté client. */
    secretPatterns: [
      'AKIA[0-9A-Z]{16}', // AWS access key id
      'sk_live_[0-9a-zA-Z]{16,}', // Stripe live secret
      'AIza[0-9A-Za-z\\-_]{35}', // Google API key
      'ghp_[0-9A-Za-z]{36}', // GitHub PAT
      'xox[baprs]-[0-9A-Za-z-]{10,}', // Slack token
      '-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----', // clé privée
    ] as string[],
    /** Sévérité npm audit / SCA qui fait échouer (low|moderate|high|critical). */
    scaFailOn: (process.env.ARGUS_SCA_FAIL_ON ?? 'high') as 'low' | 'moderate' | 'high' | 'critical',
  },

  /**
   * Rôles pour les tests d'autorisation (authz/IDOR). Chaque rôle a son storageState.
   * Vide → les tests cross-rôle sont skippés (mais le contrôle anonyme reste actif).
   */
  roles: [
    // { name: 'admin', storageState: 'playwright/.auth/admin.json' },
    // { name: 'user',  storageState: 'playwright/.auth/user.json' },
  ] as Array<{ name: string; storageState: string }>,

  /** Routes censées être protégées (un visiteur anonyme ne doit PAS y accéder). */
  protectedRoutes: [
    // '/dashboard', '/admin', '/users',
  ] as string[],
};

export default argus;
