# Argus — Contrat de sortie (rapports)

> À lire au moment de produire un rapport. Deux publics : la **machine** (CI) et l'**humain**.
> En mode REGRESS, le harness `@playwright/test` produit déjà le JSON et le JUnit via ses
> reporters ; `scripts/render-report.mjs` transforme ce JSON en rapport HTML Argus.

## A. `report.json` (machine / CI)
```json
{
  "run":     { "id", "startedAt", "finishedAt", "baseUrl", "env", "mode",
               "browsers", "breakpoints", "commit?" },
  "summary": { "pagesTested", "checksRun",
               "findings": { "blocker", "critical", "major", "minor", "info" },
               "passed", "failed", "flaky", "gate": "pass|fail" },
  "findings": [
    { "id": "QA-001", "title", "severity", "dimension",
      "url", "selector", "viewport", "browser",
      "expected", "actual", "evidence": ["paths"], "repro": ["steps"],
      "suggestedFix", "wcag?", "status": "open|known|fixed", "occurrences" }
  ],
  "metrics": {
    "perf": { "<url>": { "lcp", "cls", "inp", "ttfb" } },
    "coverage": { "routesDiscovered", "routesTested", "sampledOut": [] }
  }
}
```
`dimension` ∈ functional | visual | console | network | performance | a11y | seo | security | i18n | state.

## B. `report.junit.xml`
Le reporter `junit` de Playwright suffit pour l'intégration CI native (GitHub Actions, GitLab…).

## C. Rapport HTML Argus (humain)
Généré par `scripts/render-report.mjs` à partir du JSON Playwright. Sections :
- **Header** : BASE_URL · ENV · MODE · date · commit · durée.
- **Bandeau métriques** : pages testées · checks · findings par sévérité · gate (vert/rouge) ·
  Δ vs run précédent (régressions / améliorations).
- **Core Web Vitals** : tableau par page clé, code couleur vs seuils.
- **Findings** groupés par sévérité puis dimension : badge, url+sélecteur, expected/actual,
  steps, fix suggéré, preuve embarquée (screenshot base64 / lien trace + HAR).
- **Couverture** : routes découvertes vs testées vs échantillonnées-hors.
- **✅ Ce qui fonctionne** : parcours validés.
- **Section vidéo** (mode DEMO) : chemin .webm + chapitres.
- **Footer** : « Généré par Argus (Claude Code) · <date> ».

Ouvrir : `open argus-report/<RUN_NAME>/report.html`.

## D. Exit codes (CI)
- `0` vert (aucune sévérité bloquante au-delà du gate).
- `1` major présent dans GATE.fail_on.
- `2` blocker / critical.
Voir la matrice de sévérité dans `references/methodology.md` §8.
