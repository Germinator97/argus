# Argus Mobile — contrat de sortie

> À lire au moment de produire un rapport. Deux publics : la **machine** (CI) et
> l'**humain**. Ce document se suffit à lui-même : il portait auparavant le seul
> *delta* d'un contrat écrit pour le web, ce qui obligeait à lire deux documents
> — dont un qui parle de `baseUrl`, de `browsers` et de Core Web Vitals — puis
> une table pour transposer. Le socle est donc ici, en mobile.

## A. `report.json`

**Le socle**, commun à tout rapport Argus :

```jsonc
{
  "run":     { "startedAt", "platform", "appVersion", "env", "mode", "commit?" },
  "summary": { "findings": { "blocker", "critical", "major", "minor", "info" },
               "passed", "failed", "flaky", "gate": "pass|fail" },
  "findings": [
    { "id", "title", "severity", "dimension",
      "expected", "actual", "evidence": ["chemins"], "repro": ["étapes"],
      "suggestedFix", "status": "open|known|fixed", "occurrences" }
  ],
  "coverage": { … }, "startup": { … }
}
```

⚠️ **Ces clés de premier niveau sont figées par égalité** dans la suite de gardes :
`run`, `summary`, `findings`, `coverage`, `startup`. Une clé ajoutée au code sans
être écrite ici fait rougir la CI, et une clé promise ici sans être écrite aussi.

### Les champs propres au mobile

**`run` gagne :**
```jsonc
"run": {
  "platform": "android | ios",
  "appId": "com.exemple.app",          // package Android ou bundle iOS
  "appVersion": "…", "flavor": "…", "buildId": "…",
  "devices": [ {
    "id": "android-emu",
    "udid": "emulator-5558",           // ⚠️ un PORT sur Android, pas une identité
    "avd": "Pixel_6_API_30",           // MESURÉ (adb emu avd name) — l'identité stable
    "model": "sdk_gphone64_arm64",     // MESURÉ (ro.product.model)
    "os": "android-36",                // MESURÉ (ro.build.version.sdk)
    "physical": false,
    "identityMeasured": true,          // false en --dry-run : rien n'a été interrogé
    "declared": { "avd": "…", "model": "pixel_6", "os": "android-33" }
  } ],
  "animationsDisabled": true,          // déterminisme effectivement appliqué
  "installProof": "pm list packages confirme com.exemple.app"
}
```

`installProof` n'est pas décoratif : Maestro n'installe pas l'app, et une
installation ratée laisse tourner la version précédente. Sans cette trace, un
rapport peut décrire le comportement d'un binaire qui n'est pas celui qu'on croit.

⚠️ **L'identité du device est MESURÉE, jamais recopiée de `argus.mobile.yaml`.**
Une version antérieure écrivait `model`/`os` depuis la config : le rapport
décrivait alors l'appareil *voulu* en ayant l'air de décrire celui *obtenu*, et
aucune relecture ne pouvait voir l'écart — d'autant que sur Android l'udid est un
numéro de port réattribué à l'ordre de démarrage. `declared` reste à côté du
mesuré pour que la comparaison soit une lecture. Voir `device-matrix.md`.

**`startup`** — ce que l'écran de départ a coûté, flow par flow :
```jsonc
"startup": {
  "screen": "home", "anchor": "home_root",
  "origin": "declared",          // declared | home | first — voir ci-dessous
  "budgetMs": 2000,              // thresholds.coldStartMs
  "samples": [ { "flow": "smoke", "ms": 19329, "status": "COMPLETED" } ]
}
```
`origin` dit COMMENT l'écran de départ a été choisi, et les trois valeurs ne se
valent pas : `declared` — un écran porte `start: true`, c'est le seul cas où
quelqu'un a décidé ; `home` — convention historique sur l'identifiant ; `first` —
repli sur le premier écran déclaré, qui est un pari. Un booléen ne pouvait pas
distinguer « on me l'a dit » de « j'ai deviné et ça tombait bien ».

La suite chronométrait déjà ce temps sans le savoir : la **première** attente
d'ancre de chaque flow n'est pas une assertion, c'est le démarrage à froid de
l'app. Relevé sur un projet réel — la même assertion, sur la même ancre, dans le
même flow : **16 645 ms** en première position, **79 ms** en seconde. L'écart
n'est pas de la lecture d'arbre.

⚠️ Deux flows y mouraient, et Maestro rapportait « `id: home_root` n'est pas
visible » : un message exact et un **diagnostic faux**, qui envoie chercher un
défaut d'instrumentation là où l'ancre était bonne et l'app simplement lente. Un
finding `QAM-START` porte désormais la mesure, et le message d'échec renvoie
vers elle.

**`finding` — les correspondances avec le web :**

| Web | Mobile | Contenu |
|---|---|---|
| `url` | `screen` + `step` | nom du flow Maestro et numéro d'étape |
| `selector` | `selector` | sélecteur **sémantique** : `id=login_button`, `text=Bienvenue` |
| `viewport` | `device` + `orientation` + `textScaleFactor` | |
| `browser` | `platform` + `osVersion` | `android` + API level, ou `ios` + version |

**`dimension`** ∈ `functional | visual | a11y | performance | security |
resilience | i18n | stability`.

⚠️ **`metrics.perf` ne vit PAS dans `report.json`, et ne le peut pas.** La chaîne
écrit `report.json` à la fin de `argus-run`, alors que `perf.mjs` n'a pas encore
tourné : les métriques ci-dessous sont donc dans **`perf.json`**, et seul le
rapport HTML les agrège. Un consommateur qui les cherche dans `report.json` les
trouvera absentes, sans erreur d'aucune sorte — c'est ce que ce paragraphe disait
avant d'être corrigé.

Les clés de premier niveau de `report.json` sont : `run`, `summary`, `findings`,
`coverage`, `startup`. Un garde les fige par égalité contre cette liste.

**`metrics.perf`**, dans `perf.json` :
```jsonc
{
  "firstLaunchMs": 3700,   // PREMIER lancement après installation — état à part
  "coldStartMs": 910, "warmStartMs": 320,
  "memoryMb": 187, "binarySizeMb": 42.1
}
```
`firstLaunchMs` est isolé volontairement : c'est un état réel, vécu une fois par
chaque utilisateur, et le moyenner avec le régime stabilisé ne décrirait ni l'un
ni l'autre.

**`coverage`** gagne `screensDeclared`, `screensConfigured`, `notConfigured[]`
(écrans déclarés sans ancre sémantique, donc non testés), `visualScreens[]` et
`visualMode`.

⚠️ **Les quatre premiers dérivent tous de `screens[]`**, donc aucun ne voit ce qui
n'y est pas déclaré : un état monté à l'étage 1 seul lui est invisible. Le rapport
HTML affiche pour cette raison le compte **comparé visuellement** à côté du compte
déclaré, et écrit noir sur blanc que « N sur N » ne veut pas dire « tout est
couvert ». Sans cette phrase, un relevé exact — il l'était — se lit comme une
garantie qu'il ne donne pas.

## B. Preuves

| Preuve | Où la trouver |
|---|---|
| capture de l'étape en échec | `<sortie>/<session>/<flow>/screenshots/` |
| dump de hiérarchie de l'étape | `<sortie>/<session>/<flow>/screen-hierarchy/` |
| vidéo demandée par le flow | `<sortie>/<session>/<flow>/startRecording/` |
| journal device | `logs/device-logcat.txt` (Android) · `logs/device-simulator.log` (iOS) |
| crash / ANR | `logs/crash-report.txt` · `logs/anr-report.txt` |
| index de tout le bundle | `manifest.json` → clé **`entries`** (pas `artifacts`) |
| instrumentation rendue (EXPLORE/DEMO) | `instrumentation.patch` à la racine du dossier de rapport |
| une entrée par étape exécutée | `commands.json` → `[{command, metadata}]` |

⚠️ **Forme relevée sur Maestro 2.8.0**, différente de ce que la doc laisse croire :
- le dossier d'un flow porte son champ **`name:`**, pas son nom de fichier —
  celui-ci se relit dans `commands.json` via `MAESTRO_FILENAME` ;
- le statut d'une étape est à `metadata.status`, pas à la racine ; l'erreur à
  `metadata.error.message` ; les preuves de l'étape à `metadata.artifacts[]`
  (`{type, path}`) — bien plus utiles que l'index global du bundle ;
- `metadata.evaluatedCommand` porte les variables **résolues** : sans lui, un
  finding annonce `id=${ARGUS_ANCHOR_HOME}` au lieu de l'ancre cherchée ;
- les sélecteurs sont sérialisés en `idRegex` / `textRegex`, pas `id` / `text` ;
- l'échec d'une commande **conteneur** (`runFlow`, `repeat`, `retry`) n'est que
  la conséquence de celui d'une étape déjà rapportée : la compter doublerait
  chaque finding.

⚠️ Le rapport **JUnit n'est PAS dans `--test-output-dir`** : il va où pointe
`--output`, et par défaut dans `report.xml` du répertoire courant.

⚠️ `--debug-output` reçoit `maestro.log`, `--test-output-dir` reçoit les
captures, vidéos et `commands.json`. Ce ne sont pas les mêmes artefacts, et
**`--debug-output` contient les valeurs de secrets en clair** : il ne se publie
jamais en artefact CI ouvert.

## B bis. L'instrumentation rendue (EXPLORE/DEMO seulement)

Un audit live pose les ancres qui manquent, mesure, puis **les retire** : le
projet repart comme il était. Ce qui a été posé n'est pas perdu pour autant, il
est rendu — `instrumentation.patch`, applicable par `git apply`, accompagné d'un
finding qui le justifie :

```jsonc
{
  "id": "QA-0xx", "severity": "major", "dimension": "a11y",
  "title": "N écrans et M widgets interactifs sans identifiant sémantique",
  "expected": "chaque écran clé et chaque contrôle porte un Semantics(identifier:)",
  "actual": "aucun identifiant : ni un lecteur d'écran ni un outil de test ne peut les nommer",
  "evidence": ["argus-mobile-report/instrumentation.patch"],
  "suggestedFix": "git apply argus-mobile-report/instrumentation.patch — pose les ancres "
                  + "utilisées pendant cet audit. Gain d'accessibilité réel, indépendant d'Argus."
}
```

⚠️ Le finding décrit **l'app**, pas l'audit. Écrire « je n'ai pas pu mesurer »
en ferait un rapport sur soi-même ; ce qui intéresse le lecteur est que ses
contrôles ne sont nommés nulle part — pour un outil de test comme pour un
lecteur d'écran.

En REGRESS il n'y a pas de patch : l'instrumentation reste dans le code, et
c'est `coverage.notConfigured[]` qui dit ce qui n'a pas d'ancre.

## C. Rapport HTML

Même structure que le web (`report-format.md` §C) : header, bandeau métriques,
findings groupés par sévérité puis dimension, couverture, « ✅ ce qui fonctionne »,
footer « Généré par Argus Mobile (Claude Code) ». Généré par
`scripts/argus/report.mjs`, qui agrège les cinq JSON.

**Une section en plus, et elle est essentielle : la COUVERTURE PAR DIMENSION.**
Chaque source y a l'un de trois états :

| État | Sens |
|---|---|
| `exécutée` | le script a tourné et rendu un verdict |
| `sautée` | il a tourné mais n'a pas pu mesurer — **avec la raison** |
| `non lancée` | personne ne l'a lancé — **avec la commande pour le faire** |

Sans cette distinction, un rapport où rien n'a tourné se lit exactement comme un
rapport où rien n'a cassé. C'est la différence entre « aucun problème » et
« aucune mesure », et elle décide de la confiance qu'on peut accorder au vert.

## D. Exit codes

**Identiques au web** : `0` vert · `1` un `major` dans `gate.failOn` ·
`2` `blocker`/`critical`.

Deux causes de `2` propres au mobile, toutes deux volontaires :
- **harness non configuré** — aucun écran n'a d'ancre sémantique, donc la suite
  ne testerait rien (`gate.failOnEmptyRun`) ;
- **outil requis absent** en CI (`--require-tools`) — une dimension non exécutée
  ne peut pas être verte.
