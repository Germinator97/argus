# Argus — harness de non-régression QA (@playwright/test)

Harness QA installé par le skill **Argus**. Audit fonctionnel, régression visuelle,
accessibilité (axe/WCAG), Core Web Vitals, liens & santé réseau, le tout exécutable
en local et en CI avec gating.

## Démarrage rapide

```bash
# 1. Dépendances (les blocs de package.snippet.json ont été fusionnés dans package.json)
npm install
npx playwright install --with-deps chromium      # + firefox webkit si activés

# 2. Configurer l'app sous test
#    Éditer argus.config.ts (baseURL, routes, breakpoints, browsers, seuils)
#    et/ou exporter les variables d'env :
export ARGUS_BASE_URL="https://staging.mon-app.ci"
export ARGUS_AUTH=off                              # si pas d'authentification

# 3. Lancer
npm run argus:test
npm run argus:show                                 # rapport HTML Playwright
```

## Le fichier à éditer : `argus.config.ts`

Source unique des réglages spécifiques à l'app : `baseURL` (fallback), `browsers`
actifs, `routes` auditées, `breakpoints` visuels, `dynamicSelectors` masqués,
`thresholds`. La config Playwright et les specs lisent depuis là.

## Variables d'environnement

| Variable | Rôle | Défaut |
|----------|------|--------|
| `ARGUS_BASE_URL` | URL de base (prioritaire sur argus.config) | `http://localhost:3000` |
| `ARGUS_MODE` | `EXPLORE` \| `DEMO` \| `REGRESS` | `REGRESS` |
| `ARGUS_AUTH` | `off` → visiteur anonyme | `on` |
| `ARGUS_A11Y_IMPACT` | seuil a11y bloquant (`minor`…`critical`) | `serious` |
| `QA_USER` / `QA_PASS` | identifiants du compte de test (secrets) | — |
| `ARGUS_LINK_BUDGET` | nb max de liens vérifiés | `50` |

> **Secrets** : `QA_USER`/`QA_PASS` viennent UNIQUEMENT de l'environnement (CI secrets
> ou `.env` gitignoré). Jamais en dur. `playwright/.auth/` est gitignoré (jetons de session).

## Authentification

Le projet `setup` (`tests/_setup/auth.setup.ts`) se connecte une fois et sérialise la
session dans `playwright/.auth/user.json`, réutilisée par tous les projets navigateur.
**Adapter les sélecteurs de login** (`getByLabel`/`getByRole`) au formulaire réel.
Sans auth : `ARGUS_AUTH=off`.

## Scripts

| Script | Effet |
|--------|-------|
| `npm run argus:test` | toute la suite |
| `npm run argus:smoke` | santé page d'accueil (console/réseau/CWV) |
| `npm run argus:a11y` | accessibilité WCAG |
| `npm run argus:visual` | régression visuelle |
| `npm run argus:visual:update` | (re)générer les baselines |
| `npm run argus:links` | liens internes < 400 |
| `npm run argus:sec` | sécurité : en-têtes, cookies, secrets, authz (Playwright) |
| `npm run argus:sca` | dépendances vulnérables (npm audit / CVE) |
| `npm run argus:zap` | DAST OWASP ZAP baseline (Docker requis) |
| `npm run argus:report` | rapport HTML Argus (`argus-report/report.html`) |

## Sécurité (DAST · SCA · headers · authz)

Dimension SECURITY **non destructive** (détection, pas exploitation) :

- `npm run argus:sec` — contrôles Playwright : en-têtes (CSP, HSTS, X-Frame-Options…), flags
  cookies (Secure/HttpOnly/SameSite), contenu mixte, secrets dans les bundles JS, source maps &
  chemins sensibles (`.env`, `.git`…) exposés (avec garde anti faux-positif SPA), et accès
  anonyme aux routes protégées. Réglages : `argus.config.ts → security / protectedRoutes / roles`.
- `npm run argus:sca` — `npm audit` (CVE des dépendances) → `argus-report/sca.json` ; échoue sur
  high/critical (surcharge `ARGUS_SCA_FAIL_ON`). Détecte aussi osv-scanner / Trivy s'ils sont là.
- `npm run argus:zap` — DAST **OWASP ZAP baseline** (`ghcr.io/zaproxy/zaproxy:stable`, Docker
  requis), passif → `argus-report/zap.{html,json,md}`. Auth : `ARGUS_ZAP_AUTH_HEADER_VALUE="Bearer <token>"`.

> **Gotcha dev-server (Vite/Next…)** : un conteneur ne voit pas le `localhost` de l'hôte — le
> script réécrit la cible en `host.docker.internal`. Mais Vite **rejette** ce Host (`403`,
> protection `server.allowedHosts`). Pour un scan ZAP de contenu réel en local : viser un build
> `vite preview`/prod, **ou** ajouter `host.docker.internal` à `server.allowedHosts`. En CI, viser
> directement l'URL déployée.
>
> **Frontière** : ces contrôles automatisés couvrent le répétable ; ils ne remplacent pas un
> **pentest manuel** (exploitation active, logique métier). Scans uniquement sur tes systèmes.

## ⚠️ Régression visuelle & CI

Les snapshots sont **spécifiques à l'OS et à la version du navigateur**. Une baseline
générée sur macOS ne correspondra **jamais** au rendu Linux de la CI. Générer/rafraîchir
les baselines dans l'image Docker officielle dont le tag == version installée :

```bash
npm run argus:visual:docker-baseline
```

> Le tag de l'image (`mcr.microsoft.com/playwright:v1.61.0-noble`) **doit** correspondre
> à `npx playwright --version`. En bumpant Playwright, mettre à jour les deux ensemble,
> puis régénérer les baselines dans une PR dédiée (jamais `--update-snapshots` en CI).

## Structure

```
argus.config.ts              # réglages app (à éditer)
playwright.config.ts         # projets, reporters, seuils
tests/
  _setup/auth.setup.ts       # login → storageState
  _fixtures/axe.ts           # fixture accessibilité (AxeBuilder, tags WCAG)
  _utils/cwv.ts              # Core Web Vitals (web-vitals)
  _utils/collectors.ts       # console/pageerror/réseau/images cassées
  smoke.spec.ts              # santé page + CWV
  visual.spec.ts             # régression visuelle multi-breakpoints
  a11y.spec.ts               # violations WCAG = échec
  links.spec.ts              # liens internes < 400
scripts/argus-report.mjs     # JSON Playwright → rapport HTML Argus
.github/workflows/argus.yml  # CI
```
