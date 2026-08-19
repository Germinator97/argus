# Argus Mobile — harness de non-régression QA (Flutter · Maestro)

Harness QA installé par le skill **`/argus-mobile`**. Parcours end-to-end sur le
binaire réellement compilé, régression visuelle, accessibilité, performance,
sécurité MASVS, conditions réelles — exécutable en local et en CI, avec gating.

## Deux étages, et pourquoi

| | Ce qui tourne | Coût | Ce que ça couvre |
|---|---|---|---|
| **Étage 1** | `flutter test` | secondes, **sans device** | cibles tactiles, contrastes, labels, disposition à 130 % et 200 % de texte |
| **Étage 2** | Maestro + `adb` / `simctl` | minutes, **sur device** | parcours E2E, permissions, offline, cycle de vie, démarrage, jank, MASVS |

L'étage 1 n'est pas un doublon : les sélecteurs `width`/`height` de Maestro sont
des **égalités en pixels**, donc « ≥ 48 dp » ne s'écrit pas dans un flow. Et
changer la taille de texte système demande un réglage device, alors qu'ici c'est
un paramètre. L'étage 2 reste le cœur : c'est le seul qui pilote le binaire livré
et atteigne l'OS.

## Démarrage

```bash
# 1. Prérequis
#    Node >= 18 · Flutter >= 3.19 (Semantics identifier) · Java 17+ pour Maestro
curl -fsSL "https://get.maestro.mobile.dev" | bash
make argus-doctor          # config résolue + outillage détecté

# 2. Configurer — un SEUL fichier
#    argus.mobile.yaml : app.androidPackage, devices, screens[].anchor, seuils

# 3. Instrumenter l'app (le prix d'entrée)
#    Semantics(identifier: 'home_root', child: …) sur chaque écran clé

# 4. Construire, puis lancer
make argus-build
make argus-run
make argus-report          # rapport HTML
```

## Le fichier à éditer : `argus.mobile.yaml`

Source unique : identifiants d'app, chemins de binaire, matrice de devices,
écrans et leurs ancres sémantiques, seuils, règles de sécurité, gate. Les scripts
et les flows lisent tous depuis là.

Il est parsé par un **sous-ensemble strict de YAML** (`scripts/argus/config.mjs`)
plutôt que par une dépendance : un projet Flutter n'a ni `package.json` ni
`node_modules`, et rien ne doit s'installer avant de pouvoir lancer la suite. Le
parseur refuse ce qu'il ne sait pas lire — ancres, blocs multi-lignes, maps en
flow, `yes`/`no` nus, clés dupliquées — plutôt que de deviner.

## Le piège n°1 : les `Key` Flutter ne marchent pas

Maestro pilote le device de l'extérieur et voit ce que voit la couche
d'accessibilité. Les `Key` Flutter n'y sont **pas exposées** : un flow qui cible
une Key échoue, toujours.

```dart
// ✅ ciblable par `- tapOn: { id: login_button }`
Semantics(identifier: 'login_button', child: ElevatedButton(…))

// ✅ pour une icône sans texte
Icon(Icons.add, semanticLabel: 'fabAddIcon')

// ❌ invisible à Maestro
ElevatedButton(key: const Key('login_button'), …)
```

Sur une **racine d'écran**, la recette complète est :

```dart
Semantics(
  identifier: 'home_root',
  container: true,
  explicitChildNodes: true,  // ⚠️ sans lui, ce nœud absorbe tout le sous-arbre
  child: …,
)
```

C'est le prix d'entrée de l'automatisation — et il améliore l'accessibilité
réelle au passage, ce qui n'est pas un effet de bord négligeable.

## Le piège n°2 : tout fichier YAML doit avoir un en-tête

Maestro valide **tous** les fichiers YAML du workspace au démarrage, sous-flows
compris. Un seul sans section de configuration (`appId:` puis `---`) fait tomber
la suite entière sur `Config Section Required`, **avant qu'aucun flow ne tourne**.
Le glob `flows` de `.maestro/config.yaml` décide de ce qui s'**exécute**, pas de
ce qui se **parse**. `make argus-lint` le détecte en deux secondes, sans device.

## Commandes

| Cible | Effet |
|---|---|
| `make argus-doctor` | config résolue, outillage détecté, problèmes de configuration |
| `make argus-lint` | syntaxe des flows Maestro, sans device |
| `make argus-guards` | étage 1 : a11y + disposition, sans device |
| `make argus-run` | étage 2 : suite Maestro complète |
| `make argus-smoke` | smoke seul — le plus rapide |
| `make argus-visual` | régression visuelle seule |
| `make argus-baselines` | (re)génère les références visuelles |
| `make argus-perf` | démarrage à froid/à chaud, jank, mémoire, taille |
| `make argus-a11y` | cibles tactiles et labels, sur l'écran affiché |
| `make argus-sec` | MASVS statique (sources + binaire) |
| `make argus-sca` | CVE des dépendances Dart et natives |
| `make argus-report` | agrège tout en `argus-mobile-report/report.html` |
| `make argus` | tout, dans l'ordre |

Si le projet a un `package.json`, `package.snippet.json` expose les mêmes cibles
en scripts npm.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `QA_USER` / `QA_PASS` | identifiants du compte de test — **environnement uniquement** |
| `ARGUS_MOBILE_CONFIG` | chemin d'un autre `argus.mobile.yaml` |

Les secrets sont passés aux flows par `maestro test -e`. ⚠️ Ils sont donc
**visibles dans `ps`** pendant le run : le runner le signale. Et `label:` masque
la valeur en console et dans les rapports, **mais pas dans les journaux de debug
bruts** de Maestro — ne publie jamais `--debug-output` comme artefact CI ouvert.

## Ce que le harness refuse de faire

- **Cibler un appareil réel sans consentement explicite.** L'auto-détection ne
  choisit que des émulateurs et simulateurs. Viser un téléphone demande son udid
  ET `physical: true` dans la config — parce qu'Argus installe un binaire et
  efface les données de l'app (`clearState`).
- **Rendre vert une suite qui ne teste rien.** Aucun écran sans ancre sémantique
  ⇒ `exit 2` avec la marche à suivre (`gate.failOnEmptyRun`).
- **Faire passer un outil absent pour un succès.** Une dimension non exécutée
  apparaît `sautée` avec sa raison dans le rapport. En CI, `--require-tools`
  transforme cette absence en échec.
- **Mesurer un démarrage à 0 ms.** `am start -W` rend `TotalTime: 0` quand
  l'activité est déjà au premier plan ; ce zéro est rejeté, pas agrégé.

## ⚠️ Régression visuelle

Une référence est liée au **couple device + version d'OS**. Générée sur ton
simulateur, elle ne correspondra jamais au rendu de l'émulateur de la CI — même
piège que les snapshots Playwright du harness web.

```bash
make argus-baselines       # dans la MÊME configuration que la CI
git add .maestro/_baselines/
```

Ne lance jamais `--update-baselines` **dans** la CI : une référence régénérée
accepte la régression qu'elle devait détecter.

Deux limites à connaître :

- **Maestro n'a pas de masquage de pixels.** L'équivalent de `dynamicSelectors`
  du harness web n'existe pas ; seul `cropOn` restreint la capture. Rends l'écran
  déterministe avant de le photographier (`_subflows/mask-dynamic.yaml`), ou
  recadre avec `visualCropOn`.
- **`visualMatchPercentage` est un pourcentage de CORRESPONDANCE**, pas un ratio
  de différence (défaut Maestro : 95). « 1 % de diff toléré » s'écrit `99`.
  Y mettre `0.01` accepterait n'importe quelle image.

## Sécurité — la frontière

`make argus-sec` et `make argus-sca` détectent, ils n'exploitent pas, et
**uniquement sur tes propres builds**. Le pentest mobile manuel — hooking Frida,
contournement de pinning, abus de logique métier — reste une intervention humaine
séparée. Argus défriche le répétable.

## Structure

```
argus.mobile.yaml            # LE fichier à éditer
.maestro/
  config.yaml                # découverte des flows, tags globaux
  _subflows/                 # launch-clean · login · goto · animations · déterminisme
  smoke.yaml                 # lancement + écran d'accueil                 [smoke, p0]
  journey-critical.yaml      # parcours métier P0 (squelette à remplir)    [functional, p0]
  visual.yaml                # une capture par écran, piloté par le runner [visual]
  a11y.yaml                  # couverture des ancres sémantiques           [a11y]
  resilience.yaml            # permissions refusées, avion, rotation       [resilience]
  lifecycle.yaml             # arrière-plan, mort du processus, deep links [lifecycle]
  i18n.yaml                  # fr-FR, format XOF, clés manquantes          [i18n]
test/
  argus/                     # tout le harness ici : un seul dossier à retirer
    harness.dart             # étage 1 : LE fichier à éditer
    a11y_test.dart           # cibles tactiles, contrastes, labels
    layout_test.dart         # 3 gabarits × 3 échelles de texte
scripts/
  argus/
    config.mjs               # config + outillage + parseur YAML (socle partagé)
    run.mjs                  # devices, install vérifiée, Maestro, report.json
    perf.mjs                 # démarrage, jank, mémoire, taille
    a11y.mjs                 # cibles tactiles sur device
    sec.mjs                  # MASVS statique
    sca.mjs                  # CVE
    report.mjs               # agrégation → rapport HTML
.github/workflows/argus-mobile.yml
Makefile · package.snippet.json · .gitignore · ARGUS-MOBILE.md
```

## Mettre le harness à jour

L'installeur **n'écrase jamais** un fichier existant. Sans action, une
amélioration du plugin ne redescend donc **pas** ici : la copie locale reste
celle du jour de l'installation, et rien ne le signale.

```bash
bash <SKILL_DIR>/scripts/install-mobile.sh . --check    # signale, sort en 1
bash <SKILL_DIR>/scripts/install-mobile.sh . --update   # remet le cadre à niveau
```

La frontière est **dérivée de la source**, pas d'une liste : chaque fichier du
scaffold se déclare dans ses vingt premières lignes. `ARGUS:OWNED` t'appartient
(config, ancres, parcours métier) et n'est jamais touché ; `ARGUS:MERGE` est à
fusionner à la main dans ton homonyme ; tout le reste est du cadre — scripts,
suites de test, CI — et se remplace.

Les marqueurs sont réservés et bornés à l'en-tête pour qu'un fichier puisse en
**parler** sans être classé par ce qu'il dit — cette page-ci les cite, et reste
du cadre. Un fichier de cadre n'est comparé que si ta copie porte la signature
d'Argus : ton propre `Makefile` n'est donc ni écrasé, ni compté en retard.

`--check` sort en 1 : à câbler en CI pour que la dérive se voie au lieu de
s'installer.

## Retirer le harness

Tout ce qu'Argus pose vit dans des dossiers ou des noms qui lui appartiennent :
rien n'est mélangé à tes fichiers, donc le retrait est un `rm`, sans tri.

```bash
rm -rf test/argus scripts/argus .maestro argus-mobile-report
rm -f argus.mobile.yaml ARGUS-MOBILE.md package.snippet.json \
      .github/workflows/argus-mobile.yml
```

Deux fichiers demandent un geste manuel, parce qu'ils ont pu être fusionnés
dans les tiens : le `Makefile` (retire les cibles `argus-*` si tu en avais
d'autres) et le `.gitignore` (retire le bloc Argus).

⚠️ `.maestro/_baselines/` part avec le reste, et c'est le seul artefact du
harness qui coûte un device à reconstruire. Pour un retrait temporaire, garde
ce dossier.

⚠️ L'instrumentation `Semantics(identifier:)` posée dans `lib/` **reste** : elle
est dans ton code, pas dans le harness. Elle ne coûte rien à garder — un nœud
sémantique de plus — et c'est ce qui rendra une réinstallation immédiate.

## Codes de sortie

`0` vert · `1` un `major` présent dans `gate.failOn` · `2` `blocker`/`critical`,
outillage requis absent, ou harness non configuré. Identiques au skill web.
