# Argus — plugin QA/QE pour Claude Code

**Argus** réunit deux agents QA/QE invocables dans Claude Code :

- **`/argus`** — applications **web**. Installe un harness `@playwright/test` de
  non-régression (régression visuelle, accessibilité axe/WCAG, Core Web Vitals,
  liens, console/réseau, sécurité DAST/SCA/headers/authz), ou mène un audit live.
- **`/argus-mobile`** — applications **Flutter**, Android et iOS. Installe un
  harness **Maestro** qui pilote le binaire réellement compilé, plus une couche
  `flutter_test` qui mesure sans émulateur ce que Maestro ne sait pas exprimer.

Trois modes dans les deux cas : **EXPLORE** (audit), **DEMO** (capture vidéo),
**REGRESS** (suite déterministe, gating CI).

---

## Installation

### Option A — Plugin (recommandé)
Dans Claude Code :
```
/plugin marketplace add https://github.com/Alexwilfriedo/argus-cc
/plugin install argus@alexwilfriedo
```
> En local sans Git : `/plugin marketplace add /chemin/vers/argus`.

Puis, dans n'importe quel projet : `/argus` ou `/argus-mobile`.

### Option B — Copie manuelle du skill
```bash
cp -R argus-cc/skills/argus        ~/.claude/skills/argus
cp -R argus-cc/skills/argus-mobile ~/.claude/skills/argus-mobile
```

---

## Argus — web

1. Tape `/argus`. Il demande l'objectif, l'URL, l'environnement, l'auth.
2. Pour le harness : il copie le scaffold, tu édites **`argus.config.ts`**, puis :
   ```bash
   npm install
   npx playwright install --with-deps chromium
   npm run argus:test        # smoke, visual, a11y, links, security, authz
   npm run argus:report      # rapport HTML Argus
   ```

**Prérequis** : Node ≥ 18, npm. Docker optionnel pour le DAST OWASP ZAP.

---

## Argus Mobile — Flutter

1. Tape `/argus-mobile`. Il commence par **reconnaître le projet Flutter** et
   produire un rapport d'instrumentation Semantics : c'est le prix d'entrée de
   l'automatisation mobile, et il est explicite.
2. Pour le harness : il copie le scaffold, tu édites **`argus.mobile.yaml`** (le
   seul fichier de configuration) et **`test/argus_harness.dart`**, puis :
   ```bash
   node scripts/argus-mobile-config.mjs   # config résolue + outillage détecté
   make argus-guards                      # étage 1 : a11y + disposition, sans device
   flutter build apk --debug
   make argus-run                         # étage 2 : suite Maestro sur émulateur
   make argus-baselines                   # références visuelles (1re fois)
   make argus-report                      # rapport HTML
   ```

### Le harness a deux étages

| | Ce qui tourne | Coût | Couvre |
|---|---|---|---|
| **Étage 1** | `flutter test` | secondes, **sans device** | cibles tactiles, contrastes, labels, disposition à 130 % et 200 % de texte |
| **Étage 2** | Maestro + `adb` / `simctl` | minutes, **sur device** | parcours E2E, permissions, offline, cycle de vie, démarrage, jank, MASVS |

Ce n'est pas un doublon : les sélecteurs `width`/`height` de Maestro sont des
**égalités en pixels**, donc « ≥ 48 dp » ne s'écrit pas dans un flow.

### ⚠️ Le piège n°1 : les `Key` Flutter ne marchent pas

Maestro pilote le device de l'extérieur et voit ce que voit la couche
d'accessibilité. Les `Key` Flutter n'y sont **pas exposées** : un flow qui cible
une Key échoue, toujours.

```dart
Semantics(identifier: 'login_button', child: ElevatedButton(…))  // ✅
Icon(Icons.add, semanticLabel: 'fabAddIcon')                     // ✅
ElevatedButton(key: const Key('login_button'), …)                // ❌ invisible
```

**Prérequis** : Node ≥ 18 · Flutter ≥ 3.19 (`Semantics(identifier:)`) ·
Java 17+ et la CLI Maestro (`curl -fsSL "https://get.maestro.mobile.dev" | bash`) ·
Android SDK Platform-Tools (`adb`) · Xcode pour iOS · `osv-scanner` et Docker/MobSF
optionnels. Un outil absent donne une dimension **sautée et mentionnée** dans le
rapport, jamais un faux vert.

---

## Garde-fous

Les deux skills sont **lecture seule par défaut en prod** ; écritures uniquement
en staging ou local avec données jetables ; secrets via variables d'environnement.

Côté mobile, trois refus explicites :

- **aucun mouvement d'argent**, même en staging, sans accord écrit — achats
  in-app en sandbox StoreKit / Play Billing uniquement ;
- **aucun appareil réel ciblé automatiquement** : viser un téléphone demande son
  udid ET `physical: true`, parce qu'Argus installe un binaire et efface les
  données de l'app ;
- **aucune suite verte qui ne teste rien** : sans ancre sémantique configurée, la
  suite sort en `exit 2` plutôt que de rassurer à vide.

Détails : `skills/argus/references/methodology.md` et
`skills/argus-mobile/references/methodology-mobile.md`.

---

## Mises à jour

Bumper `version` dans `.claude-plugin/plugin.json` **et**
`.claude-plugin/marketplace.json`, puis commit/push. Les utilisateurs font
`/plugin marketplace update alexwilfriedo`.

## Contenu

```
.claude-plugin/{plugin.json, marketplace.json}

skills/argus/                      # WEB — Playwright
  ├── SKILL.md                     # orchestrateur interactif
  ├── references/                  # méthodologie, mode démo, format de rapport
  ├── scripts/install.sh           # copie idempotente du scaffold
  └── assets/scaffold/             # le harness @playwright/test réel

skills/argus-mobile/               # MOBILE — Flutter × Maestro
  ├── SKILL.md                     # orchestrateur interactif
  ├── references/
  │   ├── methodology-mobile.md    # le cerveau : dimensions, sévérité, anti-flake
  │   ├── device-matrix.md         # choisir sa matrice de devices sous budget
  │   ├── demo-mode-mobile.md      # couche démo et enregistrement vidéo
  │   └── report-format-mobile.md  # le delta mobile du contrat de sortie
  ├── scripts/install-mobile.sh    # copie idempotente du scaffold
  └── assets/scaffold-mobile/      # le harness réel
      ├── argus.mobile.yaml        # LE seul fichier de configuration
      ├── .maestro/                # 7 flows + 6 sous-flows
      ├── test/                    # gardes flutter_test (étage 1)
      ├── scripts/                 # runner, perf, a11y, MASVS, SCA, rapport
      ├── .github/workflows/
      └── ARGUS-MOBILE.md          # doc du harness, côté projet d'accueil
```

*Plugin perso · v1.1.0 · MIT*
