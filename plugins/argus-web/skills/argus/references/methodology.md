# Argus — Méthodologie QA/QE (référence complète)

> Lis ce document pour tout audit réel et pour décider quoi tester, comment tester à grande
> échelle, et comment classer un défaut. SKILL.md est l'orchestrateur ; ceci est le cerveau.

## Sommaire
1. RUN CONFIG (paramètres d'exécution)
2. Modes opératoires (EXPLORE / DEMO / REGRESS)
3. Garde-fous de sécurité (env-aware)
4. Stratégie de passage à l'échelle (très grosses apps)
5. Boucle d'exécution
6. Dimensions de test (le « tous aspects QA/QE »)
7. Outillage hybride + arborescence du scaffold
8. Sévérité & gating CI
9. Déterminisme & anti-flake

═══════════════════════════════════════════════════════════════════════════════
## 1. RUN CONFIG (à remplir avant de lancer — défauts entre [])
═══════════════════════════════════════════════════════════════════════════════
```
BASE_URL     : <https://…>
ENV          : prod | staging | local            # pilote les garde-fous (§3)
MODE         : EXPLORE | DEMO | REGRESS           # voir §2
RUN_NAME     : <slug-court>                        # ex: checkout-fr
SCOPE        : { sitemap: auto|<url>, routes: [...], crawl_budget: [40] pages, depth: [3] }
AUTH         : { required: false, kind: none|form|sso|token,
                 login_url: <…>, secrets_from_env: [QA_USER, QA_PASS],
                 storage_state: playwright/.auth/<role>.json, roles: [anon] }
BREAKPOINTS  : [ 390x844 (mobile), 768x1024 (tablette), 1440x900 (desktop) ]
BROWSERS     : [ chromium ]   # REGRESS multi : [chromium, firefox, webkit]
BUDGET       : { max_minutes: [20], max_pages: [40], concurrency: [4] }
THRESHOLDS   : { lcp_ms: 2500, cls: 0.1, inp_ms: 200, ttfb_ms: 800,
                 a11y_min: "WCAG 2.1 AA", visual_diff_ratio: 0.01 }
LOCALE       : { lang: fr, currency: XOF, sample_amount_format: "1 234 567 FCFA" }
ARTIFACTS    : argus-report/<RUN_NAME>/   # screenshots, traces, har, video, reports
BASELINE     : tests/**/__screenshots__   # snapshots visuels (gérés par Playwright)
GATE         : { fail_on: [blocker, critical, major], fail_on_new_finding: true,
                 fail_on_visual_diff: true }
```
Ne demande à l'utilisateur que ce qui manque ; déduis le reste du repo. Champs requis :
BASE_URL, ENV, MODE.

═══════════════════════════════════════════════════════════════════════════════
## 2. Modes opératoires
═══════════════════════════════════════════════════════════════════════════════
**EXPLORE** — Audit exhaustif et exploratoire. Découvre, teste toutes les dimensions (§6),
produit findings + métriques + rapport. Headed possible. Mode par défaut pour un audit ad hoc.

**DEMO** — Exécute la logique EXPLORE, MAIS surcouche cinématique pour capture vidéo (YouTube) :
voir `references/demo-mode.md`. Toujours headed, rythme lisible. La démo illustre l'audit réel,
elle ne le remplace pas.

**REGRESS** — Mode CI / non-régression. Headless, déterministe, parallélisé.
1. Exécute la suite codifiée `@playwright/test` (specs issues des runs EXPLORE précédents).
2. Compare aux baselines (régression visuelle + findings connus).
3. Balayage *diff-aware* : ré-audite en priorité les routes/composants touchés par le diff.
4. Émet JSON + JUnit + exit code (§8). Aucun `sleep` arbitraire, aucune action non déterministe.
Toute trouvaille EXPLORE stable DOIT être codifiée en spec ici — c'est ainsi que la couverture
s'accumule.

═══════════════════════════════════════════════════════════════════════════════
## 3. Garde-fous de sécurité (NON NÉGOCIABLE — adaptés à ENV)
═══════════════════════════════════════════════════════════════════════════════
RÈGLE D'OR : par défaut READ-ONLY. Toute action sortante ou irréversible exige soit
ENV=staging avec données jetables, soit une confirmation explicite.

**ENV=prod (lecture seule stricte)** — INTERDIT :
- Soumettre un formulaire qui persiste (création compte, contact, commande)
- Paiement / checkout / transfert / mouvement d'argent — JAMAIS, même staging sans accord
- Suppression, action en masse, requête API non-idempotente, envoi email/SMS/push
- Mutation de panier / profil / solde

AUTORISÉ : navigation, lecture, hover, ouverture menus/accordéons, déclenchement de la
validation client *sans* submit, requêtes GET, mesures, screenshots.

**ENV=staging** — écritures autorisées SI : comptes de test dédiés, données préfixées `qa_`,
opérations idempotentes, nettoyage après coup. Toujours pas de paiement réel.

**Transverse** :
- Secrets uniquement via env ; jamais en dur, jamais loggés. Masque tokens/cookies/PII dans
  les HAR, traces et rapports.
- Throttle : respecte BUDGET.concurrency ; identifie-toi via header `X-Argus-QA: 1` si autorisé.
- Liens/domaines externes : statut HTTP en HEAD/GET seulement, aucune interaction.
- En cas de doute sur une action destructrice/sortante → STOP, signale, demande.

═══════════════════════════════════════════════════════════════════════════════
## 4. Stratégie de passage à l'échelle (très grosses applications)
═══════════════════════════════════════════════════════════════════════════════
On ne teste pas « toutes les pages ». On teste intelligemment sous BUDGET :
1. **Découverte** : `sitemap.xml` / `robots.txt` → sinon crawl borné (depth, budget, même
   origine). Construis un *route manifest* (URL, template détecté, profondeur, dynamique ?).
2. **Dédup par template** : regroupe les URLs partageant le même gabarit (ex : 10 000 fiches
   produit → 1 layout). Teste 1–3 instances représentatives par template + cas limites
   (item épuisé, prix 0, titre très long, image manquante).
3. **Priorisation** : P0 parcours critiques métier (login, recherche, tunnel clé, paiement *en
   staging*) → P1 pages à fort trafic / entrées SEO → P2 long-tail échantillonné.
4. **Parallélisation** : workers = BUDGET.concurrency ; pages indépendantes en parallèle.
5. **Budget explicite** : si le temps/pages plafonne avant couverture complète, **loggue ce qui
   a été échantillonné vs ignoré** (jamais de troncature silencieuse).
6. **REGRESS diff-aware** : ré-audite à fond seulement les routes/composants impactés par le
   diff ; smoke-test le reste.

═══════════════════════════════════════════════════════════════════════════════
## 5. Boucle d'exécution
═══════════════════════════════════════════════════════════════════════════════
SETUP → DISCOVER → PLAN → pour chaque cible : EXÉCUTER (§6) → CAPTURER PREUVE →
TRIER (sévérité §8) → VÉRIFIER (re-run pour tuer le flake) → REPORTER → [CI] GATER.

Chaque finding doit être REPRODUCTIBLE : url + sélecteur + viewport + navigateur +
expected/actual + preuve + steps + fix suggéré. Sans ça, ce n'est pas un finding.

═══════════════════════════════════════════════════════════════════════════════
## 6. Dimensions de test (le « tous aspects QA/QE » — coche chacune)
═══════════════════════════════════════════════════════════════════════════════
- **FUNCTIONAL** : parcours critiques de bout en bout ; formulaires (validation, erreurs FR,
  champs requis, formats) ; navigation/routing ; CRUD (staging) ; états vides, chargement,
  erreur, succès ; double-clic/idempotence ; back/forward.
- **VISUAL** : rendu par BREAKPOINT ; débordements, chevauchements, contenu coupé ; dark mode ;
  **régression visuelle** `expect(page).toHaveScreenshot()` (tolérance THRESHOLDS.visual_diff_ratio).
- **CONSOLE** : erreurs, warnings, unhandled rejections, violations CSP, 404 de ressources.
- **NETWORK** : requêtes 4xx/5xx ; liens internes ET externes (statut HTTP) ; images/ressources
  cassées (lazy-load déclenché) ; mixed content ; requêtes anormalement lentes.
- **PERFORMANCE** : Core Web Vitals par page clé (LCP, CLS, INP, TTFB vs THRESHOLDS) ;
  poids/nombre de requêtes ; bundles JS ; régression perf vs run précédent.
- **A11Y** : axe-core (WCAG A/AA) ; navigation clavier + focus visible ; ordre de tabulation ;
  contrastes ; alt ; labels ; ARIA ; landmarks. Dimension de 1er ordre, pas un bonus.
- **SEO/META** : title, meta description, canonical, OG/Twitter, hreflang, hiérarchie Hn unique,
  `<html lang>`, données structurées, sitemap/robots cohérents.
- **SECURITY** (dimension complète, NON destructive — détection, pas exploitation) :
  - **DAST** : scan dynamique OWASP ZAP baseline (`scripts/argus-zap.sh`) → XSS, injection,
    en-têtes manquants, fuites d'info. Baseline = passif + actif sûr (pas de fuzzing destructif).
  - **SCA** : CVE des dépendances (`scripts/argus-sca.mjs` → `npm audit` ; osv-scanner/Trivy si présents).
  - **Headers/cookies/secrets** (`tests/security.spec.ts`) : CSP, HSTS (HTTPS only), X-Frame-Options,
    X-Content-Type-Options, Referrer-Policy, Permissions-Policy ; flags cookies (Secure/HttpOnly/SameSite) ;
    contenu mixte ; source maps & chemins sensibles (`.env`, `.git`…) exposés — avec garde anti
    faux-positif SPA (catch-all index.html en 200 ignoré) ; secrets dans les bundles JS.
  - **Authz / IDOR** (`tests/authz.spec.ts`) : un anonyme ne doit pas atteindre `protectedRoutes` ;
    template d'isolation inter-rôles (storageState par rôle).
  > **Frontière** : tout ceci est automatisable et gatable en CI. Le **pentest manuel** (exploitation
  > active, chaînage, abus de logique métier, escalade) reste une intervention humaine séparée —
  > Argus défriche le répétable, il ne remplace pas un red-team. Scans actifs : sur tes systèmes
  > (local/staging), jamais sur du tiers ni en prod sans accord (cf. §3).
- **I18N/L10N** : locale ; format monétaire (XOF/FCFA), dates, nombres ; clés de traduction
  manquantes / texte non traduit ; débordements liés à la longueur FR.
- **STATE/EDGE** : réseau throttlé (3G), offline, données massives, sessions expirées, droits
  insuffisants par rôle ; inputs limites (vide, 0, négatif, unicode, tentatives XSS/SQLi côté
  validation — sans exploitation).

═══════════════════════════════════════════════════════════════════════════════
## 7. Outillage hybride + arborescence du scaffold
═══════════════════════════════════════════════════════════════════════════════
**EXPLORE / DEMO** → exploration live : `playwright-cli` (open, resize, console, mousewheel,
highlight, mousemove, --raw eval, video-start|chapter|stop, close) OU le MCP Playwright. Mesures
ad hoc, capture. Voir `references/demo-mode.md` pour les commandes.

**REGRESS** → `@playwright/test` (assertions codifiées, déterministes, CI). C'est le scaffold
installé dans le projet :
```
<projet>/
├── argus.config.ts            # SEUL fichier à éditer : baseURL, breakpoints, browsers, seuils, env
├── playwright.config.ts       # projects (setup+chromium/firefox/webkit/mobile), reporters json/junit/html
├── tests/
│   ├── _setup/auth.setup.ts   # login une fois → storageState (secrets via env)
│   ├── _fixtures/axe.ts       # fixture accessibilité (AxeBuilder, tags WCAG)
│   ├── _utils/cwv.ts          # mesure Core Web Vitals (web-vitals)
│   ├── _utils/collectors.ts   # capture console/pageerror/réseau/images cassées
│   ├── smoke.spec.ts          # parcours critique + zéro erreur console/réseau + CWV
│   ├── visual.spec.ts         # régression visuelle multi-breakpoints
│   ├── a11y.spec.ts           # violations WCAG = échec
│   └── links.spec.ts          # liens internes → statut HTTP < 400
├── .github/workflows/argus.yml
└── README.md
```
RÈGLE : tout finding EXPLORE stable et reproductible → codifié en spec `@playwright/test` pour
entrer dans la garde de non-régression.

═══════════════════════════════════════════════════════════════════════════════
## 8. Sévérité & gating CI
═══════════════════════════════════════════════════════════════════════════════
| Sévérité | Définition | Effet CI |
|----------|-----------|----------|
| **blocker**  | app inutilisable / parcours critique cassé / perte de données / secret exposé | exit 2 |
| **critical** | fonctionnalité majeure cassée, sans contournement | exit 2 |
| **major**    | dégradation nette / régression a11y ou perf significative / contournement existe | exit 1 |
| **minor**    | cosmétique, cas limite rare | warn |
| **info**     | observation / amélioration | exit 0 |

GATE (REGRESS) : échec si sévérité ∈ GATE.fail_on, OU nouveau finding absent de la baseline
(si fail_on_new_finding), OU diff visuel > seuil (si fail_on_visual_diff). exit 0 = vert.

═══════════════════════════════════════════════════════════════════════════════
## 9. Déterminisme & anti-flake (surtout REGRESS)
═══════════════════════════════════════════════════════════════════════════════
- Waits sur ÉTAT (élément visible / réseau idle / réponse reçue), jamais `sleep` fixe (sauf DEMO).
- Sélecteurs stables : `getByRole` / `data-testid` > CSS fragile ; jamais d'index positionnel.
- Avant de déclarer un échec : RE-RUN. Échec constant = bug ; intermittent = `@flaky` + quarantaine.
- Fige l'aléa : horloge/seed mockés si l'app les expose ; gèle les animations pour le visuel.
