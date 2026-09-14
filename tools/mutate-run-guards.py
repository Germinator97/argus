#!/usr/bin/env python3
"""Réintroduit chaque défaut et vérifie que le garde correspondant tombe.

Trois façons dont un harnais de mutation ment, toutes traitées ici :
  - la mutation ne mute rien (motif absent ou ambigu) → on l'exige unique ;
  - la mutation casse le build, et le rouge n'a rien à voir avec le garde
    → `node --check` avant de lancer la suite ;
  - aucun test ne tourne → on exige le compte attendu dans la sortie.
Et la restauration est prouvée par hash, pas annoncée.
"""
import hashlib
import re
import signal
import pathlib
import shutil
import subprocess
import sys

# Racine DÉRIVÉE, jamais en dur : `git checkout` résout son pathspec depuis le
# répertoire courant, et un chemin relatif ne restaurerait rien dès que la
# commande est lancée d'ailleurs — en laissant l'arbre muté, sans un mot.
ROOT = pathlib.Path(__file__).resolve().parent.parent
SCAFFOLD = ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus"
FLOWS = ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro"
CIBLES = {
    "run": SCAFFOLD / "run.mjs",
    "config": SCAFFOLD / "config.mjs",
    "sca": SCAFFOLD / "sca.mjs",
    # Depuis le 02/09 : le contrôle des compteurs de la page publiée. La page
    # vit hors dépôt, donc rien d'autre ne peut dire si l'instrument qui la
    # mesure garde encore — c'est le seul endroit d'où on le sait.
    "artefact": ROOT / "tools/artefact-compteurs.mjs",
    # 446 — le CONSOMMATEUR du lecteur d'ordre. Le 439 a rendu ce lecteur
    # bruyant sans que son appelant suive : la cible manquait, donc rien ne
    # pouvait le dire.
    "checkartefact": ROOT / "tools/check-artefact.mjs",
    "confid": ROOT / "tools/artefact-confidentialite.mjs",
    # Le contrat d'injection a DEUX bouts, et le garde ne vaut que s'il voit
    # bouger les deux : le producteur (run.mjs) et le consommateur (le flow).
    "visual": FLOWS / "visual.yaml",
    "i18n": FLOWS / "i18n.yaml",
    # Depuis le run 22 : l'aiguillage de navigation. Ses gardes lisent une
    # STRUCTURE de branches — quelle condition décide quoi —, donc rien d'autre
    # ne peut dire s'ils gardent encore.
    "goto": FLOWS / "_subflows/goto.yaml",
    # Depuis le run 23 : le GABARIT DE PROMPT. Son bloc de cadrage doit porter ce
    # que la méthodologie exige de trancher — un écart entre deux textes n'a
    # aucun comportement à casser, donc rien d'autre ne peut le voir.
    "prompts": ROOT / "plugins/argus-mobile/skills/argus-mobile/PROMPTS.md",
    # Depuis le run 24 : le Makefile porte un CÂBLAGE — `argus-lint` doit appeler
    # le contrôle du graphe d'appels, sans quoi la détection existe et personne
    # ne l'exécute.
    "makefile": SCAFFOLD.parent.parent / "Makefile",
    "report": SCAFFOLD / "report.mjs",
    "a11y": SCAFFOLD / "a11y.mjs",
    "sec": SCAFFOLD / "sec.mjs",
    # Le SKILL lui-même est une cible : deux de ses gardes ne comparent pas un
    # code à un attendu mais deux TEXTES entre eux — le levier que la doc
    # prescrit contre celui que le runner conseille, le nom prescrit contre
    # celui que le gabarit montre. Un écart entre deux textes n'a aucun
    # comportement à casser : sans mutation, rien ne prouve qu'ils gardent.
    "skill": ROOT / "plugins/argus-mobile/skills/argus-mobile/SKILL.md",
    # Depuis le run 17 : le choix du device y vit aussi, et son garde porte sur
    # le CÂBLAGE — un paramètre optionnel non passé est légal, donc rien
    # d'autre ne le verrait.
    "perf": SCAFFOLD / "perf.mjs",
    # Depuis le run 19 : le harnais Dart aussi — son montage déclare une locale
    # que `MaterialApp` ignore sans `supportedLocales`, et c'est un garde de
    # câblage, donc invisible à tout test de comportement.
    "harness": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/argus_harness.dart",
    # Depuis le run 28 : le test de disposition. Son message d'échec est de la
    # PROSE dans du Dart, donc rien d'autre ne peut dire si elle se lit encore.
    "layout": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/layout_test.dart",
    # Depuis le run 29, le premier sur un projet qui consomme une API. Ces
    # quatre-là portent des décisions que rien d'autre ne peut exercer : à qui
    # appartient le parcours d'authentification, ce qu'on asserte après lui, et
    # ce qui part dans une référence visuelle commitée.
    "login": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/_subflows/login.yaml",
    # Depuis le 382 : le point d'entrée de TOUS les flows. Il porte la promesse
    # d'état neuf — fausse sur iOS jusqu'au 381 — et le piège de l'alerte
    # système. De la prose dans un flow : rien à casser sans mutation.
    "launchclean": FLOWS / "_subflows/launch-clean.yaml",
    "dismiss": FLOWS / "_subflows/dismiss-system-alerts.yaml",
    # 486 — le sous-flow qui VÉRIFIE la coupure des animations. Il n'avait
    # aucune cible : rien ne pouvait dire que sa condition de plateforme avait
    # disparu, et son assertion optionnelle se serait remise à attendre sa borne.
    "anims": FLOWS / "_subflows/disable-animations.yaml",
    "anchorsdart": FLOWS.parent / "test/argus/anchors_test.dart",
    "lifecycle": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/lifecycle.yaml",
    "yamlconf": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml",
    "gitignore": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.gitignore",
    # Depuis le run 33 : le README du scaffold enseignait comme ✅ ce que le
    # SKILL mesure comme piège, et le workflow livré supposait Android. Deux
    # fichiers que le PROJET lit, et qu'aucune mutation ne visait.
    "readme": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/ARGUS-MOBILE.md",
    "ci": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.github/workflows/argus-mobile.yml",
    # Depuis le 14/09 : la CI DU PLUGIN est une cible, parce que le découpage de
    # la passe de mutation en tranches y vit — et que son mode de panne est
    # muet. Une matrice qui ne couvre pas tout rend N jobs VERTS pendant que des
    # mutations ne sont jouées par personne : chaque job a bien fait son
    # travail, et rien dans une CI verte ne peut le dire. ⚠️ Ne pas confondre
    # avec `ci`, qui est le workflow posé CHEZ L'HÔTE.
    "ciplugin": ROOT / ".github/workflows/plugin.yml",
    # Et le harnais LUI-MÊME, pour la même raison : sa fonction de partition
    # décide de ce que la CI joue, donc un trou dedans est invisible partout
    # ailleurs. Muter le mutateur est sans danger — Python a chargé le module
    # en mémoire au démarrage, la mutation n'atteint que le sous-processus que
    # le garde lance, c'est-à-dire précisément ce qu'on veut éprouver.
    "mutateur": ROOT / "tools/mutate-run-guards.py",
    # Depuis le run 34 : l'installeur cherchait un pilote de plateforme sans
    # l'autre, et rien ne mutait ce fichier.
    # Depuis le run 46 : son dartdoc porte une PRESCRIPTION (ouvrir un
    # échantillon avant d'accepter le lot), donc une prose gardée par un test —
    # et un texte n'a aucun comportement à casser.
    "dette": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/known_issues.dart",
    # Depuis le run 48 : la matrice d'appareils porte ce qu'on ne peut PAS
    # deviner d'une plateforme (un émulateur partagé et plein, une locale qui ne
    # s'applique qu'au démarrage). De la prose, donc rien à casser sans mutation.
    "devices": ROOT / "plugins/argus-mobile/skills/argus-mobile/references/device-matrix.md",
    # Depuis le run 49 : le dartdoc d'`ArgusScreen` porte la seule mise en garde
    # qui sépare ses champs de ceux du YAML — deux schémas au vocabulaire commun.
    # De la prose dans du Dart : rien à casser sans mutation.
    "types": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/argus_types.dart",
    # Depuis le 373 : la §3 des garde-fous, dont la matrice gouverne les
    # ÉCRITURES. Sa parité avec le web n'a aucun comportement à casser — c'est un
    # écart entre deux fichiers que personne ne lit côte à côte, et la §3 a
    # longtemps AFFIRMÉ cette parité en étant fausse.
    # Depuis le 373 : le backlog lui-même. Sa tête décrit l'état PRÉSENT pendant
    # que le compteur de vidages compte des événements PASSÉS — les deux peuvent
    # se contredire sans que rien ne lève, et c'est arrivé pendant une soirée.
    "backlog": ROOT / "docs/backlog-terrain.md",
    "methodo": ROOT / "plugins/argus-mobile/skills/argus-mobile/references/methodology-mobile.md",
    # Et l'autre moitié de la même parité : le skill WEB est la SOURCE dont le
    # garde dérive les conditions. Muter le mobile prouve qu'il voit un manque ;
    # muter le web prouve qu'il REFUSE DE CONCLURE quand il ne lit plus rien —
    # c'est la façon dont ce garde-ci pourrait devenir vacant.
    "methodoweb": ROOT / "plugins/argus-web/skills/argus/references/methodology.md",
    "installeur": ROOT / "plugins/argus-mobile/skills/argus-mobile/scripts/install-mobile.sh",
}
SUITE = ROOT / "tools/run-guards.test.mjs"
# Optionnel : sans lui, les mutations de flow ne sont pas vérifiées — et une
# mutation qui casse le YAML ferait rougir la suite pour une raison sans rapport
# avec le garde, ce qui se lit comme un succès.
MAESTRO = shutil.which("maestro")
# ⚠️ LE VÉRIFICATEUR PEUT MANQUER, ET SON ABSENCE NE DOIT PAS ACCUSER LA MUTATION.
# Les deux workflows se vérifient avec PyYAML — présent sur ce poste, ABSENT de
# l'image des runners GitHub. Sans cette détection, `import yaml` lève, la
# vérification rend un code non nul, et le harnais conclut « la mutation ne parse
# pas » : il confond « je n'ai PAS PU mesurer » et « le sujet est fautif », et il
# accuse un dépôt sain. Mesuré le 14/09 dans le conteneur — cinq mutations en
# HARNAIS, donc un job rouge sur rien.
PYYAML = subprocess.run([sys.executable, "-c", "import yaml"],
                        capture_output=True).returncode == 0
# ⚠️ DÉRIVÉ, jamais figé. Ce nombre sert à distinguer « le garde n'a pas bougé »
# de « aucun test n'a tourné » — deux verdicts opposés que la même sortie vide
# produirait. Écrit à la main, il se périmait au premier test ajouté et TOUTES
# les mutations rendaient alors « HARNAIS », ce qui masquait la mesure entière.
# Il se relève donc sur la suite PROPRE, avant la première mutation : c'est le
# seul moment où le compte est à la fois connu et digne de foi.
NB_TESTS = None

# ═══════════════════════════════════════════════════════════════════════════
# Les mutations dont le motif ne matche PLUS — relevé, pas dispense (471)
# ═══════════════════════════════════════════════════════════════════════════
#
# Une mutation dont le motif a disparu de sa cible ne prouve RIEN : le harnais
# rend « HARNAIS — motif trouvé 0× », ce qui est honnête mais ne se lit qu'en
# jouant la passe. Or la passe complète coûte des heures, donc personne ne la
# joue pour cette question-là — et 25 mutations sur 404 étaient dans ce cas sans
# que rien ne le dise, découvertes en contrôlant autre chose.
#
# `--check-motifs` répond en une seconde. Ce relevé fige l'écart connu, PAR
# ÉGALITÉ : une réparation le fait rougir autant qu'une régression. Ce n'est pas
# une liste d'exceptions, c'est l'état d'un chantier — chaque ligne affirme
# qu'une mutation est morte et attend qu'on la ré-ancre.
#
# ⚠️ Une mutation qui suit un REFACTOR change de sujet sans prévenir : elle peut
# rester verte en tombant sur un AUTRE garde que le sien, ce qui se lit comme un
# succès. Le motif inerte, lui, se voit ici.
MOTIFS_INERTES_CONNUS = set()  # ⚠️ VIDE, et c'est un ÉTAT, pas une absence de
# contrôle : les 25 mutations que ce relevé portait ont été ré-ancrées le
# 14/09/2026 sur ce que le code fait maintenant, chacune vérifiée en la voyant
# tomber sur SON garde. `set()` et non `{}`, qui serait un dict vide — la
# différence est muette jusqu'au premier `in`.

MUTATIONS = [
    ("run", "l'AVD absent retombe sur un autre émulateur",
     "  const found = listed.find((d) => d.avd === spec.avd);",
     "  const found = listed.find((d) => d.avd === spec.avd) ?? listed.find((d) => !d.physical);"),
    ("run", "le succès ne dit plus qu'il a été mesuré",
     "  if (found) return { status: 'ok', device: { ...found, measured: true } };",
     "  if (found) return { status: 'ok', device: { ...found, measured: false } };"),
    # ⚠️ Cible passée de `run` à `config` au run 17 : `avdNameFrom` a DÉMÉNAGÉ
    # quand trois autres scripts ont eu besoin d'elle. Le harnais l'a dit de
    # lui-même — « motif trouvé 0× (attendu 1) », donc HARNAIS et non « garde
    # vacant » — au lieu de rendre un vert qui n'aurait rien mesuré.
    ("config", "avdNameFrom prend la dernière ligne, donc « OK »",
     ".find((l) => l !== '' && l !== 'OK') ?? '';",
     ".filter((l) => l !== '').pop() ?? '';"),
    ("run", "startupSamples retient la DERNIÈRE attente",
     "    const step = steps.find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')\n      && selectorOf(s) === `id=${anchor}`);",
     "    const step = [...steps].reverse().find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')\n      && selectorOf(s) === `id=${anchor}`);"),
    ("run", "startupSamples ne filtre plus sur l'ancre",
     "      && selectorOf(s) === `id=${anchor}`);",
     "      && selectorOf(s) !== '@@jamais@@');"),
    ("run", "un finding par flow au lieu d'un pour le lot",
     "  if (over.length === 0) return findings;",
     "  if (over.length === 0) return findings;\n  if (over.length > 1) return over.flatMap((s) => startupFindings([s], device, platform, config));"),
    ("run", "un finding même sous le seuil",
     '  const over = mesures.filter((s) => net(s) > budget);',
     '  const over = mesures.filter((s) => net(s) >= 0);'),
    ("run", "le budget d'attente colle au seuil de perf",
     "  return Math.max(20000, (config.thresholds?.coldStartMs ?? 2000) * 5);",
     "  return Math.max(20000, (config.thresholds?.coldStartMs ?? 2000));"),
    ("run", "l'indice s'affiche sur n'importe quel échec",
     "  if (!startupAnchor || selector !== `id=${startupAnchor}`) return '';",
     "  if (false) return '';"),
    ("run", "un émulateur ciblé par son port est refusé",
     "  if (found.physical && spec.physical !== true) {",
     "  if (spec.physical !== true) {"),
    ("config", "deux points de départ ne sont plus refusés",
     "  if (declares.length > 1) {",
     "  if (declares.length > 99) {"),
    ("config", "un start sans ancre passe en silence",
     "    if (typeof s.anchor !== 'string' || s.anchor.trim() === '') {",
     "    if (typeof s.anchor !== 'string' && false) {"),
    # ⚠️ Cibles passées de `run` à `config` le 03/09 : le choix de l'écran de
    # départ a DÉMÉNAGÉ, comme `avdNameFrom` au run 17. Le harnais l'a dit de
    # lui-même — « motif trouvé 0× », donc HARNAIS et non « garde vacant ».
    ("config", "start: true cesse de gagner",
     "  const declares = screens.filter((/** @type {any} */ s) => s.start === true);",
     "  const declares = screens.filter((/** @type {any} */ s) => s.start === undefined && false);"),
    ("config", "le repli ne se signale plus comme tel",
     "  return { screen: screens[0], origin: 'first' };",
     "  return { screen: screens[0], origin: 'home' };"),
    ("run", "un téléphone réel passe sans consentement",
     "  if (found.physical && spec.physical !== true) {",
     "  if (found.physical && spec.physical === true && false) {"),
    # ── Contrat d'injection ────────────────────────────────────────────────
    ("run", "visualCropOn cesse d'arriver au flow",
     "    ARGUS_VISUAL_CROP: String(config.visualCropOn ?? ''),\n",
     ""),
    ("run", "le runner produit une clé que plus aucun flow ne lit",
     "    ARGUS_VISUAL_MODE: 'assert',",
     "    ARGUS_VISUAL_MODE: 'assert',\n    ARGUS_REGLAGE_INERTE: '',"),
    ("config", "une clé de config renaît sans lecteur",
     "  budget: { maxMinutes: 25, maxFlows: 40 },",
     "  budget: { maxMinutes: 25, maxFlows: 40, parallelDevices: 1 },"),
    ("run", "le budget de durée cesse d'être comparé",
     "  if (maxMinutes > 0 && minutes > maxMinutes) {",
     "  if (maxMinutes > 0 && minutes > maxMinutes * 1000) {"),
    ("run", "le budget de flows cesse d'être comparé",
     "  if (maxFlows > 0 && flows > maxFlows) {",
     "  if (maxFlows > 0 && flows > maxFlows * 1000) {"),
    ("run", "--tags=visual relance la suite principale pour rien",
     "    main: includeTags.some((tag) => tag !== 'visual' && !exclus.has(tag)),",
     "    main: includeTags.some((tag) => !exclus.has(tag)),"),
    ("run", "--tags=smoke rejoue toute la boucle visuelle",
     "    visual: includeTags.includes('visual') && !exclus.has('visual'),",
     "    visual: !exclus.has('visual'),"),
    ("config", "481 · le préfixe part sur ce qui n'est PAS en position de commande",
     "  return text.replace(/(^|&&|\\|\\||;|\\|)(\\s*)flutter\\s/g, '$1$2fvm flutter ');",
     "  return text.replace(/flutter\\s/g, 'fvm flutter ');"),
    ("config", "flutterCommand ne préfixe plus rien",
     "  return text.replace(/(^|&&|\\|\\||;|\\|)(\\s*)flutter\\s/g, '$1$2fvm flutter ');",
     "  return text;"),
    ("config", "le dossier .fvm cesse de compter comme un épinglage",
     "export const usesFvm = () => existsSync(resolve(process.cwd(), '.fvmrc')) || existsSync(resolve(process.cwd(), '.fvm'));",
     "export const usesFvm = () => existsSync(resolve(process.cwd(), '.fvmrc'));"),
    ("run", "l'indice « ancre disparue » s'affiche partout",
     "  if (!seen) return '';",
     "  if (false) return '';"),
    ("run", "un échec antérieur compte comme une présence",
     "    && String(s?.metadata?.status ?? '').toUpperCase() === 'COMPLETED');",
     "    && String(s?.metadata?.status ?? '').toUpperCase() !== '@@jamais@@');"),
    ("run", "le plancher de splash cesse d'être déduit",
     '  const over = mesures.filter((s) => net(s) > budget);',
     '  const over = mesures.filter((s) => s.ms > budget);'),
    ("run", "le plancher devient un seuil relevé, donc il efface la dérive",
     "  const floor = Math.max(0, Number(config.thresholds?.brandedSplashMs ?? 0));",
     "  const floor = Math.max(0, Number(config.thresholds?.brandedSplashMs ?? 0) * 10);"),
    ("run", "le finding cache le temps brut",
     "        ? `${s.flow} ${Math.round(s.ms)} ms (${Math.round(net(s))} hors splash)`",
     "        ? `${s.flow} ${Math.round(net(s))} ms`"),
    ("report", "un relevé périmé n'est plus signalé",
     "    .filter((/** @type {any} */ p) => (newest.getTime() - p.at.getTime()) / 60000 > budgetMin)",
     "    .filter((/** @type {any} */ p) => (newest.getTime() - p.at.getTime()) / 60000 > budgetMin * 1000)"),
    ("report", "le seuil de péremption cesse de suivre le budget",
     "  const budgetMin = Math.max(1, Number(config?.budget?.maxMinutes ?? 25));",
     "  const budgetMin = 25;"),
    ("a11y", "un splash passe pour un écran du harnais",
     "  if (found.length === 0) {",
     "  if (false) {"),
    ("a11y", "mesurer un autre écran que celui demandé ne se signale plus",
     "  if (requested && requested !== ECRAN_COURANT && !found.some((/** @type {any} */ s) => s.id === requested)) {",
     "  if (false) {"),
    ("i18n", "le garde des clés non résolues redevient un motif nu, donc toujours vert",
     "          text: '(?is).*(missing[_ ]translation|\\[\\[.*\\]\\]|__[A-Z_]+__).*'",
     "          text: '(?i)(missing[_ ]translation|\\[\\[.*\\]\\]|__[A-Z_]+__)'"),
    ("a11y", "la sentinelle « écran courant » revide la condition de relance",
     '  if (requested && requested !== ECRAN_COURANT) {',
     '  if (requested) {'),
    ("a11y", "le refus « pas au premier plan » repasse avant la relance",
     '  const decision = relaunchDecision({',
     '  if (appNodes.length === 0) { process.exit(2); }\n  const decision = relaunchDecision({'),
    # ⚠️ Les trois mutations qui suivent visent le défaut mesuré au run 5 : un
    # contrôle de sécurité qui rendait le MÊME verdict sur un binaire obfusqué
    # et sur un binaire qui ne l'est pas. La première le réintroduit tel quel.
    ("sec", "le motif d'obfuscation redevient nu, donc il attrape le framework",
     "    [...dumped.stdout.matchAll(new RegExp(`package:${dartPackage}/[a-z0-9_/]+\\\\.dart`, 'g'))].map((m) => m[0]),",
     "      [...dumped.stdout.matchAll(/package:[a-z_][a-z0-9_]*\\/[a-z0-9_/]+\\.dart/g)].map((m) => m[0]),"),
    ("sec", "la contre-épreuve d'instrument disparaît",
     "  if (!/package:flutter\\/[a-z0-9_/]+\\.dart/.test(dumped.stdout)) {",
     "  if (false) {"),
    ("sec", "le nom du paquet est deviné au lieu d'être lu",
     "    return m ? m[1] : '';",
     "    return 'mon_app';"),
    ("visual", "la capture n'est plus recadrée, la comparaison si",
     "                path: ${ARGUS_SCREEN_ID}\n                cropOn:\n"
     "                  id: ${ARGUS_VISUAL_CROP}\n"
     "                label: Nouvelle référence visuelle, recadrée",
     "                path: ${ARGUS_SCREEN_ID}\n"
     "                label: Nouvelle référence visuelle, recadrée"),
    # ── Seizième run ────────────────────────────────────────────────────────
    # ⚠️ MOTIF REMIS À JOUR AU RUN 34 : le 237 a réécrit ce message pour y
    # nommer une troisième cause, et le harnais a rendu « motif trouvé 0× » —
    # donc HARNAIS et non VACANT. Troisième fois de la journée que la
    # distinction évite de chercher un garde manquant qui existe.
    ("run", "l'indice renomme le levier que la doc interdit de toucher",
     '    + ` relève thresholds.startTimeoutMs (plafond effectif ${plafond} ms), dérivé du`',
     '    + ` relève thresholds.coldStartMs (plafond effectif ${plafond} ms), dérivé du`'),
    ("report", "la couverture reperd son compte visuel",
     "    + ` \u00b7 compar\u00e9s visuellement : ${esc(visuels)}`\n",
     ""),
    ("skill", "le param\u00e8tre d'ancre redevient un placeholder",
     "composant partag\u00e9, 14 call-sites \u2192 semanticIdentifier",
     "composant partag\u00e9, 14 call-sites \u2192 <param d'ancre>"),
    # ── Dix-septième run ────────────────────────────────────────────────────
    ("perf", "un script cesse de passer la config, donc ignore l'AVD d\u00e9clar\u00e9",
     "defaultAndroidDevice(config);",
     "defaultAndroidDevice();"),
    ("run", "une seule ancre d'authentification redevient exig\u00e9e",
     "  const requises = ['screen', 'user', 'password', 'submit', 'success'];",
     "  const requises = ['user'];"),
    # ── Vingt-et-unième run ─────────────────────────────────────────────────
    ("perf", "la taille repese le binaire de test au lieu de la release",
     "  const pese = binaryToWeigh(platform, config);",
     "  const pese = { path: config.build.android, isRelease: false };"),
    # ── Dix-huitième run ────────────────────────────────────────────────────
    ("run", "un ecran compte comme visite meme si l'etape n'a pas tourne",
     "      if (String(step?.metadata?.status ?? '').toUpperCase() !== 'COMPLETED') continue;",
     "      if (false) continue;"),
    ("run", "la marque d'appareil cesse de graver la locale",
     "  return { model, os: `android-${sdk}`, locale: locale || '', source: 'mesure' };".replace('mesure', 'mesur\u00e9'),
     "  return { model, os: `android-${sdk}`, source: 'mesure' };".replace('mesure', 'mesur\u00e9')),
    ("skill", "les deux modes de build annoncent le meme encodage",
     "| debug | `assets/flutter_assets/kernel_blob.bin` | **UTF-8** |",
     "| debug | `assets/flutter_assets/kernel_blob.bin` | **Latin-1** |"),
    # ── Dix-neuvième run ────────────────────────────────────────────────────
    ("sec", "un binaire plus vieux que le code passe pour frais",
     "  return { builtAt, newestSource: newest, stale: builtAt < newest };",
     "  return { builtAt, newestSource: newest, stale: false };"),
    ("harness", "la locale declaree redevient inapplicable",
     "      supportedLocales: <Locale>[argusLocale],\n",
     ""),
    # ⚠️ Motif désambiguïsé le 01/09 : le §2b porte désormais DEUX comptages sur
    # `ArgusScreen(` — le prescrit (filtré) et sa contre-épreuve (non filtrée,
    # cf. 310). Le harnais a rendu « motif trouvé 2× », pas « VACANT » : c'est
    # cette distinction qui évite d'aller chercher un garde qui existe.
    ("skill", "la commande de comptage reperd son filtre de commentaires",
     "# Écrans et ancres DÉCLARÉS, sans l'exemple en dartdoc\ngrep -v '^\\s*//' test/argus/harness.dart | grep -c 'ArgusScreen('",
     "# Écrans et ancres DÉCLARÉS, sans l'exemple en dartdoc\ngrep -c 'ArgusScreen(' test/argus/harness.dart"),
    # ── Vingt-deuxième run ──────────────────────────────────────────────────
    # Le plafond d'attente. Deux mutations sur la MÊME ligne, parce que deux
    # défauts distincts y vivent : ne pas borner du tout, et borner avec un
    # signal qu'un process peut ignorer — le second rend `timedOut` quand même,
    # donc un garde écrit sur le seul drapeau resterait vert.
    ("config", "sh ne passe plus de plafond à spawnSync",
     "    timeout: plafond, killSignal: 'SIGKILL',",
     "    killSignal: 'SIGKILL',"),
    ("config", "le signal de mise à mort redevient SIGTERM",
     "    timeout: plafond, killSignal: 'SIGKILL',",
     "    timeout: plafond, killSignal: 'SIGTERM',"),
    ("config", "le plafond par défaut redevient l'infini",
     "  return SH_TIMEOUT_MS;\n}",
     "  return 0;\n}"),
    ("perf", "les sondes adb repartent sans plafond",
     "args, { timeout: PROBE_TIMEOUT_MS });",
     "args);"),
    ("perf", "une expiration redevient une mesure invalide",
     "  if (res.timedOut) return { totalMs: null, waitMs: null, kind: 'timeout' };\n",
     ""),
    ("perf", "la boucle à chaud ne compte plus ses expirations",
     "    const { totalMs, waitMs, kind } = timedLaunch(udid, component);\n    if (kind === 'timeout') timedOut += 1;\n",
     "    const { totalMs, waitMs, kind } = timedLaunch(udid, component);\n"),
    # La taille de publication. Le défaut d'origine n'était pas un chiffre faux
    # mais un VERDICT rendu sur le mauvais binaire — d'où des mutations qui
    # portent sur la décision de juger, pas sur la mesure.
    ("perf", "le binaire de test redevient jugé contre le budget",
     "  if (pese.isRelease) return thresholdFinding(",
     "  if (true) return thresholdFinding("),
    ("perf", "la mesure qui reste à prendre redevient bloquante",
     "    dimension: 'performance', severity: 'info',",
     "    dimension: 'performance', severity: 'major',"),
    ("perf", "le geste ignore que la clé est déjà déclarée",
     "  const gestes = declare\n",
     "  const gestes = false\n"),
    # ⚠️ Ces deux motifs ont été REMIS À JOUR au run 31 : le 215 a réécrit le
    # corps de `releaseBuildCmd` pour qu'elle lise les deux plateformes, et le
    # harnais a rendu « motif trouvé 0× » — il s'est dénoncé au lieu de rendre
    # un VACANT, qui aurait fait chercher un garde manquant qui existait.
    ("config", "la commande de release repart en debug",
     "    .replace(/--(debug|profile)\\b/g, '--release')",
     "    .replace(/--(jamais)\\b/g, '--release')"),
    ("config", "le repli perd le mode de publication",
     "  const repli = cible === 'ios' ? 'flutter build ios --release' : 'flutter build apk --release';",
     "  const repli = cible === 'ios' ? 'flutter build ios' : 'flutter build apk';"),
    ("sec", "la consigne de build ignore quel binaire manquait",
     "  const vise = publie !== '' && resolve(root, publie) === binary;",
     "  const vise = false;"),
    ("goto", "la branche d'accueil reconclut sans regarder l'écran",
     "          when:\n            visible:\n              id: ${ARGUS_ANCHOR_HOME}\n",
     "          when:\n            true: \"${true}\"\n"),
    ("goto", "la branche de retour cesse d'échouer",
     "            - assertVisible:\n                id: ${ARGUS_ANCHOR_HOME}\n",
     "            - assertTrue:\n                condition: \"${true}\"\n"),
    ("goto", "un même when remélange l'état et le contexte",
     "          when:\n            visible:",
     "          when:\n            true: \"${true}\"\n            visible:"),
    # ── Vingt-troisième run ─────────────────────────────────────────────────
    # ⚠️ Motif recalé après extraction de `buildCoverage` : le harnais a rendu
    # « motif trouvé 0× » plutôt qu'un faux vert, ce pour quoi il existe.
    ("run", "la couverture cesse de compter les états d'étage 1",
     "    stageOneOnly: stageOneOnly(harness,",
     "    stageOneOnly: [] ?? stageOneOnly(harness,"),
    ("run", "le compteur d'étage 1 relit ses propres commentaires",
     "  const utile = String(source ?? '').split('\\n').filter((l) => !/^\\s*\\/\\//.test(l)).join('\\n');",
     "  const utile = String(source ?? '');"),
    ("report", "le compte d'étage 1 n'est plus affiché",
     "    + (etageUn.length",
     "    + (false && etageUn.length"),
    ("prompts", "le cadrage reperd sa ligne de budget",
     "  BUDGET    : <N> min sur device # ce qui n'y tient pas est ÉCHANTILLONNÉ et DIT,",
     "  # (budget retiré) ce qui n'y tient pas est ÉCHANTILLONNÉ et DIT,"),
    # ── Vingt-quatrième run ─────────────────────────────────────────────────
    # ⚠️ Motif recalé : le premier visait `if (marge?.serre)`, et le garde qui
    # devait tomber lisait la SOURCE — il est resté vert. Même leçon que la
    # veille sur buildCoverage. On mute désormais la valeur rendue.
    ("run", "la marge du plafond cesse d'être dite",
     "  if (!marge?.serre) return [];",
     "  if (true) return [];"),
    ("run", "le seuil de marge devient inatteignable",
     "serre: pireMs >= plafondMs * 0.7 };",
     "serre: pireMs >= plafondMs * 5 };"),
    ("config", "le graphe d'appels cesse de voir un cycle",
     "    const i = chemin.indexOf(n);",
     "    const i = -1 * (chemin.length + 1);"),
    # ⚠️ TROIS MUTATIONS LÀ OÙ IL Y EN AVAIT DEUX, et c'est le bénéfice de la
    # source unique : la décision ne s'écrit plus qu'à un endroit, donc une
    # seule mutation casse TOUS ses lecteurs. Ce qu'il reste à couvrir n'est
    # plus la répétition mais trois propriétés distinctes — le filtre, le
    # nombre de copies, et la seconde forme de `runFlow:`.
    ("config", "sansCommentaires cesse de filtrer, et ses quatre lecteurs mentent",
     "  return String(texte ?? '').split('\\n').filter((l) => !/^\\s*#/.test(l)).join('\\n');",
     "  return String(texte ?? '');"),
    # ⚠️ Celle-ci ne change RIEN au comportement : elle recopie l'idiome à un
    # second endroit, exactement comme il vivait avant. Aucun garde de valeur ne
    # peut la voir — seul celui qui compte les copies, qui existe pour ça.
    ("config", "l'idiome des commentaires est recopié une seconde fois",
     "  const utile = sansCommentaires(texte);",
     "  const utile = String(texte ?? '').split('\\n').filter((l) => !/^\\s*#/.test(l)).join('\\n');"),
    ("config", "la forme `runFlow: file:` cesse d'être lue",
     "    ...[...utile.matchAll(/runFlow:[\\s\\S]{0,120}?file:\\s*([^\\s#]+\\.ya?ml)/g)].map((m) => m[1]),",
     "    ...[],"),
    ("makefile", "argus-lint cesse de contrôler le graphe d'appels",
     "\t@node scripts/argus/config.mjs --check-flows",
     "\t@true # contrôle du graphe retiré"),
    # ── Vingt-cinquième run ─────────────────────────────────────────────────
    ("a11y", "les findings d'accessibilité repartent sans preuve visuelle",
     "  const evidence = preuve ? [preuve] : [];",
     "  const evidence = [];"),
    ("run", "le périmètre du projet redevient un filtre",
     "  const retranche = [...include.map((t) => `+${t}`), ...excludeCli.map((t) => `-${t}`)];",
     "  const retranche = [...include.map((t) => `+${t}`), ...(excludeConfig ?? []).map((t) => `-${t}`)];"),
    # ⚠️ La mutation doit COMPILER : la première coupait une parenthèse, et le
    # harnais a rendu « la mutation ne parse pas » plutôt qu'un faux verdict.
    # ⚠️ CETTE MUTATION A CHANGÉ AU RUN 31, et c'est elle qui prouve le 192.
    # Elle retirait AUTREFOIS la lecture ET la mention, parce que retirer la
    # seule lecture laissait le garde vert : le corpus gardait les chaînes, et
    # le message de publication cite `artifact.icon` en toutes lettres. Depuis
    # que le corpus est balayé, elle ne retire plus QUE la lecture — la mention
    # reste dans le message, et le garde doit tomber quand même.
    # ⚠️ RÉ-ANCRÉE AU 416 : la ligne composée dans `main()` a été extraite dans
    # `identitePubliee`, et son `|| '👁'` a disparu avec elle. L'intention ne
    # change pas — la valeur DÉCLARÉE n'est plus lue, la mention reste.
    ("report", "l'icône de la page n'est plus lue, la mention RESTE",
     '    for (const ligne of identitePubliee(ident.icon, titre, ident.url)) log(`  ${ligne}`);',
     "    for (const ligne of identitePubliee('👁', titre, ident.url)) log(`  ${ligne}`);"),
    # ── Vingt-sixième run ───────────────────────────────────────────────────
    # ⚠️ Les trois premières visent la VALEUR RENDUE, jamais la ligne d'appel :
    # les gardes correspondants BÂTISSENT le finding et regardent dedans, donc
    # une mutation qui laisserait le motif en place doit quand même les faire
    # tomber. C'est pour ça que `launchTimeFindings` a été extraite.
    ("perf", "le démarrage à froid repart sans dire sur quel binaire il a mesuré",
     "thresholdFinding('QAM-PERF-COLD', 'Démarrage à froid', cold.medianMs, thresholds.coldStartMs, 'ms', 'performance', variante, hote.phrase),",
     "thresholdFinding('QAM-PERF-COLD', 'Démarrage à froid', cold.medianMs, thresholds.coldStartMs, 'ms', 'performance', '', hote.phrase),"),
    ("perf", "le démarrage à froid repart sans l'état de la machine qui l'a mesuré",
     "thresholdFinding('QAM-PERF-COLD', 'Démarrage à froid', cold.medianMs, thresholds.coldStartMs, 'ms', 'performance', variante, hote.phrase),",
     "thresholdFinding('QAM-PERF-COLD', 'Démarrage à froid', cold.medianMs, thresholds.coldStartMs, 'ms', 'performance', variante, ''),"),
    # Le piège que celle-ci ferme : recopier sur un temps de démarrage un
    # facteur mesuré sur des TAILLES de binaire. Le finding resterait plausible.
    ("perf", "la réserve du démarrage emprunte le chiffre mesuré sur la taille",
     "    return '⚠️ Mesuré sur un binaire DEBUG : Flutter y exécute le Dart en JIT, sans compilation AOT. '",
     "    return '⚠️ Mesuré sur un binaire DEBUG : ce budget décrit la publication, facteur trois. '"),
    ("perf", "le rapport n'écrit plus ce que le chiffre de démarrage mesure",
     "      startupMetric: mesure,",
     "      startupMetric: undefined,"),
    # ── Vingt-septième run ──────────────────────────────────────────────────
    # ⚠️ Celles-ci visent la SOURCE de la valeur, pas sa présence. Le remède du
    # 193 passait déjà la réserve aux quatre appels — elle transportait
    # simplement une valeur dérivée de la commande de build. Un garde qui se
    # contente de voir « il y a un variant » resterait vert sur les deux
    # premières : c'est ce qui rend le point 199 instructif.
    ("perf", "le variant redevient déduit de la commande de build",
     "  const variante = installedVariant(udid, packageName);",
     r"  const variante = /-debug\.(apk|aab)$/i.test(String(config.build?.android ?? '')) ? 'debug' : '';"),
    # La moitié qu'on oublie de garder : une lecture qui échoue doit se taire.
    # « release » est la supposition flatteuse — un rapport qui se dit propre
    # sans avoir rien mesuré, exactement le défaut d'origine remis en silence.
    ("config", "une lecture ratée du paquet se lit désormais « release »",
     "  const drapeaux = out.match(/[Ff]lags=\\[([^\\]]*)\\]/);\n  if (!drapeaux) return '';",
     "  const drapeaux = out.match(/[Ff]lags=\\[([^\\]]*)\\]/);\n  if (!drapeaux) return 'release';"),
    ("run", "QAM-START repart sans dire sur quel binaire il a mesuré",
     "      + (variante === 'debug' ? ' (mesuré sur un debug)' : ''),",
     "      + '',"),
    ("run", "le site d'appel cesse de LIRE le variant sur l'appareil",
     "      platform === 'android' ? installedVariant(resolved.udid, appId) : ''),",
     "      ''),"),
    # ⚠️ Le style d'AVANT, remis tel quel : `max-width` seul ne borne rien sur
    # une capture de téléphone. C'est la forme exacte du défaut, pas une
    # approximation — le garde doit tomber sur ce que la page portait vraiment.
    ("report", "les preuves reperdent leur plafond de hauteur",
     "  .shot{height:240px;width:auto;max-width:100%;object-fit:contain;object-position:top;display:block;border:1px solid var(--line);border-radius:6px;background:#0b0d11;cursor:zoom-in}",
     "  .shot{max-width:100%;display:block;border:1px solid var(--line);border-radius:6px;margin-top:8px}"),
    # Sans la rangée, trois preuves s'empilent : c'est le cas du mode REGRESS.
    ("report", "les preuves s'empilent au lieu de tenir en rangée",
     "${vignettes.length ? `<div class=\"shots\">${vignettes.map((/** @type {string} */ e) => `<img class=\"shot\" src=\"${shots.get(e)}\" alt=\"preuve : ${esc(e)}\" loading=\"lazy\">`).join('')}</div>` : ''}",
     "${vignettes.map((/** @type {string} */ e) => `<img class=\"shot\" src=\"${shots.get(e)}\" alt=\"preuve : ${esc(e)}\" loading=\"lazy\">`).join('')}"),
    # Une sortie en moins suffit : un overlay qui n'en offre qu'une enferme.
    ("report", "la visionneuse perd sa sortie au clavier",
     "  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermer(); });",
     "  // sortie clavier retirée"),
    # ⚠️ Les DEUX sens, et c'est tout l'intérêt du 201 : le garde doit tomber
    # sur le défaut d'origine ET sur le correctif qui « marche ». Interpoler
    # pour de bon doublerait ce que `Actual:` affiche déjà.
    ("layout", "le message de débordement réimprime le nom de la variable",
     '                    "le widget fautif n\'est presque jamais celui de l\'écran.",',
     '                    "le widget fautif n\'est presque jamais celui de l\'écran.\\n\\$thrown",'),
    ("layout", "le message double ce que `Actual:` affiche déjà",
     '                    "le widget fautif n\'est presque jamais celui de l\'écran.",',
     '                    "le widget fautif n\'est presque jamais celui de l\'écran.\\n$thrown",'),
    # ── Vingt-neuvième run — le premier terrain qui consomme une API ────────
    ("login", "le parcours d'authentification redevient propriété du CADRE",
     "# ARGUS:OWNED — à toi : l'installeur ne l'écrase ni ne le compare, jamais.",
     "# (marqueur retiré)"),
    # ⚠️ Ancré sur le `label:` voisin, qui est unique : le seul identifiant
    # apparaît SIX fois dans ce flow, et le harnais exige un motif unique —
    # c'est ce qui distingue « le garde ne tombe pas » de « rien n'a muté ».
    ("lifecycle", "après la connexion, on réasserte l'écran de départ",
     "          id: ${ARGUS_ANCHOR_AFTER_AUTH}\n          label: L'écran est retrouvé tel qu'il était",
     "          id: ${ARGUS_ANCHOR_HOME}\n          label: L'écran est retrouvé tel qu'il était"),
    # ⚠️ Celle-ci vise la VALEUR RENDUE : un remède qui viserait TOUJOURS
    # `success` casserait toutes les applications sans authentification.
    ("run", "l'ancre post-connexion cesse de retomber sur l'écran de départ",
     "  return String(anchors?.success || home?.anchor || '');",
     "  return String(anchors?.success || '');"),
    ("prompts", "le cadrage reperd la ligne du flavor",
     "  FLAVOR    : <dev>              # si le projet en a. À NE PAS omettre : c'est lui",
     "  # FLAVOR retiré"),
    ("skill", "le cas du composant qui vit dans un autre dépôt disparaît",
     "⚠️ **ET SI LE COMPOSANT VIT DANS UN AUTRE DÉPÔT, LE BON REMÈDE T'EST INTERDIT.**",
     "Et voilà pour les composants partagés."),
    ("gitignore", "le remède proposé redevient une clé qui n'existe pas",
     "#   - rendre la zone déterministe avant capture (`_subflows/mask-dynamic.yaml`) ;",
     "#   - masquer la zone (`dynamicRegions`), ce qui la retire de la comparaison ;"),
    # ── Trentième run — la vérification du terrain à API ────────────────────
    # ⚠️ Celle-ci vise la VALEUR : le garde compile le motif et le confronte à
    # six lignes, donc remettre la forme large doit le faire tomber même si le
    # motif « existe » toujours.
    ("yamlconf", "le motif de keystore redevient large et attrape les lectures",
     "    - '(?m)^\\s*[sS]tore[pP]assword\\s*=?\\s*[\"'']'",
     "    - '[sS]tore[pP]assword\\s*=\\s*\\S+'"),
    ("yamlconf", "la localisation redevient interdite par défaut",
     "    - android.permission.READ_CONTACTS",
     "    - android.permission.READ_CONTACTS\n    - android.permission.ACCESS_FINE_LOCATION"),
    ("skill", "le diagnostic de la suite qui pend disparaît",
     "affame la boucle",
     "ralentit la boucle"),
    ("prompts", "le cadrage cesse de demander la permission sur un paquet voisin",
     "- <si le projet tire ses composants d'un paquet VOISIN",
     "- <ligne retirée"),
    # ── Trente-et-unième run — le premier sur iOS ───────────────────────────
    # ⚠️ DEUX mutations pour un seul correctif, parce que le garde a deux
    # moitiés qui peuvent mourir séparément. La première vise la DÉCISION ; la
    # seconde débranche UN des deux sites d'appel en y remettant le littéral,
    # et c'est elle qui prouve que le garde exerce le câblage. Une décision
    # juste que personne n'appelle est exactement le défaut du point 213.
    ("config", "le défaut de plateforme redevient 'android' en dur",
     "  return flag || config?.platforms?.[0] || 'android';",
     "  return flag || 'android';"),
    ("config", "--print-binary rebranche son propre défaut Android",
     "    const platform = platformFor(config, process.argv.slice(2));\n"
     "    console.log(platform === 'ios' ? config.build.ios : config.build.android);",
     "    const platform = (process.argv.slice(2).find((a) => a.startsWith('--platform=')) ?? '')"
     ".split('=')[1] || 'android';\n"
     "    console.log(platform === 'ios' ? config.build.ios : config.build.android);"),
    # 215 — les deux fonctions qui ne lisaient que les clés Android.
    ("config", "le repli de release redevient Android-seul",
     "  const repli = cible === 'ios' ? 'flutter build ios --release' : 'flutter build apk --release';",
     "  const repli = 'flutter build apk --release';"),
    ("config", "--simulator cesse de sauter dans la release iOS",
     "    .replace(/\\s--simulator\\b/g, '');",
     "    .replace(/\\s--jamais-present\\b/g, '');"),
    ("sec", "l'indice de build relit androidScan sur un projet iOS",
     "  const cle = cible === 'ios' ? 'iosScan' : 'androidScan';",
     "  const cle = 'androidScan';"),
    # 216 — la clé lue et déclarée nulle part.
    ("yamlconf", "la déclaration d'iosScan disparaît du scaffold",
     "  # iosScan: build/ios/iphoneos/Runner.app",
     "  # (rien ici)"),
    # 214 — peser un paquet qui est un répertoire. La dernière vise le CÂBLAGE :
    # la mesure peut être juste et la recette refaire la sienne à côté.
    ("config", "un répertoire se repèse comme un fichier",
     "  if (!statSync(chemin).isDirectory()) {",
     "  if (true) {"),
    ("config", "l'empreinte d'un bundle oublie les CHEMINS",
     "      lignes.push(`${sous} ${createHash('sha256').update(buf).digest('hex')}`);",
     "      lignes.push(`${createHash('sha256').update(buf).digest('hex')}`);"),
    ("config", "« absent » redevient une empreinte qui se compare",
     "  if (!chemin || !existsSync(chemin)) return { kind: 'absent', bytes: 0, digest: '', files: 0 };",
     "  if (!chemin || !existsSync(chemin)) return { kind: 'absent', bytes: 0, digest: 'e3b0c442', files: 0 };"),
    ("makefile", "la recette refait sa propre mesure au lieu de l'interroger",
     "\tM=\"$$(node scripts/argus/config.mjs --measure-binary)\"; \\\n"
     "\tBKIND=$$(printf '%s' \"$$M\" | cut -f1); BEFORE=$$(printf '%s' \"$$M\" | cut -f2); \\",
     "\tM=\"$$(wc -c < \"$$APK\" 2>/dev/null || echo 0)\"; \\\n"
     "\tBKIND=file; BEFORE=$$M; \\"),
    # 217 — une raison qui affirmait un cas qui n'est pas forcément le sien.
    # ⚠️ La troisième est née d'une mutation : les deux premières passaient
    # pendant que le site d'appel pouvait être débranché sans un mot.
    ("sec", "la raison du saut iOS redevient « simulateur » pour tout le monde",
     "  if (/iphonesimulator/.test(rel)) {",
     "  if (rel !== '@@jamais@@') {"),
    ("sec", "l'avertissement simulateur disparaît quand il est VRAI",
     "    return `${socle} Et ${rel} est un .app de SIMULATEUR : il ne porte ni l'architecture `",
     "    return `${socle} Et ${rel} est un bundle : il ne porte ni l'architecture `"),
    # ── Run 34 — la PREMIÈRE combinaison API × iOS du chantier ──────────────
    ("run", "237 · l'indice reperd la cause « app cassée »",
     "    + ` cherche. (1) L'app ne démarre PAS : REGARDE D'ABORD la capture que`",
     "    + ` cherche. (1) Rien à signaler ici, voir la capture que`"),
    ("run", "237 · l'indice cesse de nommer la capture qui tranche",
     "    + `<nom du flow>/screenshots/ — si elle montre une erreur de l'app, aucun`",
     "    + `<nom du flow>/ — si elle montre une erreur de l'app, aucun`"),
    # ⚠️ Le 238 est le seul cas connu où une consigne du skill produisait un
    # FAUX VERT : le double qui sauve l'étage 1 masquait un gel de production.
    ("skill", "238 · la mise en garde sur le double disparaît",
     "🚨 **ET CE DOUBLE CACHE UN DÉFAUT DE PRODUCTION — écris-le avant de continuer.**",
     "📌 **Note sans objet.**"),
    ("harness", "240 · argusMonte cesse de jouer le setUp",
     "  screen.setUp?.call();\n  return screen.build();",
     "  return screen.build();"),
    ("yamlconf", "241 · le cas du flow qui a besoin de login sans l'inclure disparaît",
     "  # ⚠️ ET LE CAS QUI N'ÉTAIT PRÉVU NULLE PART : un flow qui n'inclut PAS",
     "  # ⚠️ Note sans objet : un flow qui inclut"),
    ("sec", "242 · les deux audits de sources retournent inconditionnellement",
     "  if (plateformes.includes('android')) sourceFindings.push(...auditAndroidManifest(root, config));",
     "  if (true) sourceFindings.push(...auditAndroidManifest(root, config));"),
    ("installeur", "243 · l'installeur reperd xcrun",
     "for tool in node flutter maestro adb xcrun osv-scanner; do",
     "for tool in node flutter maestro adb osv-scanner; do"),
    # ── Run 33 — dont TROIS défauts du contrôle écrit au run 32 ─────────────
    # ⚠️ Le pire n'était pas qu'il rate : il ACCUSAIT une déclaration correcte.
    # ⚠️ ANCRÉES SUR LA LIGNE QUI SUIT, et c'est MOI qui l'ai rendu nécessaire :
    # `recadragesNonGardes` (352) a créé une SECONDE occurrence de
    # `const src = dartSansCommentaires(brut);` dans ce fichier, le jour même où
    # j'y fermais une duplication du même genre. Le harnais l'a dit — « motif
    # trouvé 2× » — au lieu de rendre un vert. Ici la duplication est LÉGITIME
    # (deux fonctions dépouillent chacune leur propre lecture), donc on ancre
    # au lieu d'extraire.
    ("config", "225 · le relevé des déclarées redevient ligne à ligne",
     "  const src = dartSansCommentaires(brut);\n  const CLES = /\\b(anchor|commands|displays|commandsAfterScroll|displaysAfterScroll)\\s*:\\s*/g;",
     "  const src = dartSansCommentaires(brut).split('\\n')[0];\n  const CLES = /\\b(anchor|commands|displays|commandsAfterScroll|displaysAfterScroll)\\s*:\\s*/g;"),
    ("config", "226 · le motif reperd les paramètres nommés",
     "const CONVENTION_IDENTIFIANT = '[a-zA-Z]*[Ii]dentifier';",
     "const CONVENTION_IDENTIFIANT = 'identifier';"),
    ("config", "227 · le balayage cesse de voir les commentaires",
     "    if (c === '/' && d === '/') { while (i < n && src[i] !== '\\n') i += 1; continue; }",
     "    if (false) { while (i < n && src[i] !== '\\n') i += 1; continue; }"),
    ("perf", "228 · la prescription de taille redevient Android-seule",
     "  const attendu = platform === 'ios'",
     "  const attendu = false"),
    ("readme", "229 · la forme inerte redevient la bonne forme",
     "// ⚠️ CIBLABLE, MAIS INERTE",
     "// ✅ la bonne forme"),
    # ⚠️ Cette mutation visait `security` — le job que le correctif B4 a rendu
    # AGNOSTIQUE, précisément parce qu'il portait cette condition à tort. Son
    # motif ne matchait donc plus rien, et le garde 230 n'était plus prouvé. Elle
    # vise désormais `e2e-android`, qui est Android au sens du garde lui-même
    # (il démarre un émulateur), donc le seul endroit où retirer la condition
    # reproduit le défaut qu'il mesure.
    ("ci", "230 · un job Android cesse de suivre la plateforme",
     "  e2e-android:\n    name: e2e Android (émulateur)\n    needs: cadre\n    if: needs.cadre.outputs.android == 'true'\n",
     "  e2e-android:\n    name: e2e Android (émulateur)\n    needs: cadre\n"),
    ("ci", "230 bis · le job iOS est de nouveau éteint en dur",
     "    if: needs.cadre.outputs.ios == 'true' && vars.ARGUS_IOS_CI == 'true'",
     "    if: false"),
    ("makefile", "234 · le croisement rebloque le test Dart",
     "\tnode scripts/argus/config.mjs --check-anchors || croise=$$?; \\",
     "\tnode scripts/argus/config.mjs --check-anchors; \\"),
    ("run", "235 · le conseil de locale reparle d'émulateur sur iOS",
     "      ? '  Sur un simulateur que tu lances toi-même, règle la langue dans Réglages avant le run.'",
     "      ? '  Regle la locale sur l emulateur avant le run.'"),
    ("run", "236 · la ligne de démarrage cesse de dire le splash assumé",
     "      + (splash > 0 ? ` + ${splash} ms de splash assumé (soit ${report.startup.budgetMs + splash} ms au total)` : ''));",
     "      + '');"),
    # ── Run 32 — les six points, plus le défaut que la passe avait CRÉÉ ─────
    # 219 : les DEUX moitiés — le relevé, et son câblage dans la cible.
    # ⚠️ CES DEUX MOTIFS ONT ÉTÉ PÉRIMÉS par la réécriture du 225-227 et par
    # celle de la cible au 234 — le harnais a rendu « motif trouvé 0× », donc
    # HARNAIS et non VACANT. Deuxième fois de la journée que la distinction
    # évite de chercher un garde manquant qui existe.
    ("config", "le croisement des ancres cesse d'exclure le dartdoc",
     "  const src = dartSansCommentaires(brut);\n  const CLES = /\\b(anchor|commands|displays|commandsAfterScroll|displaysAfterScroll)\\s*:\\s*/g;",
     "  const src = brut;\n  const CLES = /\\b(anchor|commands|displays|commandsAfterScroll|displaysAfterScroll)\\s*:\\s*/g;"),
    ("makefile", "argus-anchors cesse d'appeler le croisement posé → déclaré",
     '\tnode scripts/argus/config.mjs --check-anchors || croise=$$?; \\',
     '\ttrue || croise=$$?; \\'),
    # 220 : la commande prescrite doit citer des drapeaux qui EXISTENT.
    ("skill", "la commande d'itération cite un drapeau inexistant",
     'node scripts/argus/run.mjs --tags=visual --no-install',
     'node scripts/argus/run.mjs --tags=visual --no-cache'),
    # 221-224 : quatre promesses de doc, chacune gardée.
    ("goto", "goto reperd le cas de l'écran qu'aucune branche n'atteint",
     "# ⚠️ ET CERTAINS ÉCRANS N'ADMETTENT PAS DE BRANCHE",
     "# ⚠️ Note sans objet"),
    ("skill", "la reconnaissance reperd le splash imposé",
     "⚠️ **CHERCHE AUSSI UNE DURÉE DE SPLASH IMPOSÉE, dans `main()` ou le premier",
     "⚠️ **Note sans objet, dans `main()` ou le premier"),
    ("skill", "le titre cesse de se lire avant une republication",
     "   🔴 **SUR UNE PAGE QUI EXISTE DÉJÀ, LIS SON TITRE ACTUEL D'ABORD — ET SON",
     '   🔴 **Note sans objet — ET SON'),
    # ⚠️ Motif réécrit par le 262, qui a mis la case au PLURIEL : le §2c prescrit
    # deux noms de paramètre distincts, et la case n'en tenait qu'un. Le harnais
    # l'a dit lui-même — « motif trouvé 0× », verdict HARNAIS et non VACANT.
    ("skill", "le gabarit reperd la case du nom de paramètre",
     "    dont partagées   : <C> composant(s) couvrant <S> call-sites, paramètre(s) `<NOMS>`",
     "    dont partagées   : <C> composant(s) couvrant <S> call-sites"),
    # ── Le défaut que la passe précédente avait CRÉÉ ────────────────────────
    ("makefile", "la recette cesse de lire le code de sortie du build",
     "\tSTART=$$(date +%s); eval \"$$CMD\"; RC=$$?; ELAPSED=$$(( $$(date +%s) - START )); \\",
     "\tSTART=$$(date +%s); eval \"$$CMD\"; RC=0; ELAPSED=$$(( $$(date +%s) - START )); \\"),
    ("sec", "le site d'appel rebranche un message figé",
     "  if (!plan.scan) {\n    binaryFacts = { scanned: false, why: plan.why };",
     "  if (!plan.scan) {\n    binaryFacts = { scanned: false, why: 'analyse binaire iOS non couverte : un .app de simulateur.' };"),
    # ── La page publiée : une par plateforme, et son historique (245-250) ──
    # ⚠️ Ces sept-là gardent une PERTE, pas un comportement : la page produite
    # reste valide dans tous les cas mutés. Rien ne lève, rien ne rougit —
    # c'est en la rouvrant qu'on découvre ce qui a disparu. Aucun autre
    # instrument que la mutation ne peut dire s'ils gardent encore.
    ("config", "artifactFor rend la même page aux deux plateformes",
     "    if (v && typeof v === 'object') return String(v[platform] ?? '');",
     "    if (v && typeof v === 'object') return String(Object.values(v)[0] ?? '');"),
    ("report", "la republication n'embarque que le run courant",
     "    + `${archives}\\n${script}\\n${embarqueHistorique(tous)}\\n`;",
     "    + `${archives}\\n${script}\\n${embarqueHistorique(record ? [record] : [])}\\n`;"),
    ("report", "le dernier onglet est sélectionné, pas le run courant",
     '    return `<button role="tab" aria-selected="${i === 0}" aria-controls="passe-${i}" id="ong-${i}">`',
     '    return `<button role="tab" aria-selected="${i === tous.length - 1}" aria-controls="passe-${i}" id="ong-${i}">`'),
    ("report", "un run archivé traîne ses chemins de capture",
     "      id: f.id, severity: f.severity, title: f.title, dimension: f.dimension ?? '', screen: f.screen ?? '',",
     "      id: f.id, severity: f.severity, title: f.title, dimension: f.dimension ?? '', screen: f.screen ?? '', evidence: f.evidence ?? [],"),
    ("report", "le compte des runs retirés devient plausible et faux",
     "  const perdus = Math.max(0, (context.historique ?? []).length - passes.length);",
     "  const perdus = (context.historique ?? []).length;"),
    ("report", "l'avertissement de perte se déclenche à l'envers",
     "  if (prevPath) return null;   // l'historique est repris : rien à perdre",
     "  if (!prevPath) return null;   // l'historique est repris : rien à perdre"),
    ("makefile", "argus-report cesse de transmettre ARGS",
     "\t@node scripts/argus/report.mjs $(ARGS)",
     "\t@node scripts/argus/report.mjs"),

    # ── 251-253 · le troisième barreau, et deux titres qui mentaient ──────────
    # Le 251 fige ce qu'une EXÉCUTION a établi : la page revenue d'un `read`
    # porte un préambule `frame-runtime` de ~13 Ko, et la lecture doit y
    # survivre. La mutation est le défaut réaliste — chercher la fermeture
    # depuis le début du document plutôt que depuis la marque, ce que ce
    # préambule ferait justement échouer.
    ("report", "la lecture de l'historique cherche la fermeture trop tôt",
     "const j = html.indexOf('</scr' + 'ipt>', i);",
     "const j = html.indexOf('</scr' + 'ipt>');"),

    # ⚠️ CELLE-CI EST LA PLUS IMPORTANTE DES TROIS DU 252 : elle rebranche le h1
    # sur un littéral qui contient EXACTEMENT les bons mots. Un garde qui
    # chercherait « ios » dans le titre resterait vert ; seul un garde qui
    # APPELLE la fonction et compare le rendu à ce qu'elle rend la voit.
    ("report", "le titre du rapport est rebranché sur un littéral",
     "<h1>${esc(titreDuRapport(run))}</h1>",
     "<h1>com.exemple — ios — rapport QA</h1>"),
    # ⚠️ Motif réécrit par le 254, qui a ajouté le nom du projet devant
    # l'identifiant. Le harnais l'a dit lui-même — « motif trouvé 0× », verdict
    # HARNAIS et non VACANT : c'est cette distinction qui évite d'aller chercher
    # un garde manquant qui existe.
    ("report", "le titre cesse de porter la plateforme",
     "return [run?.name || run?.appId, plateformeLisible(run?.platform), 'rapport QA'].filter(Boolean).join(' — ');",
     "return [run?.name || run?.appId, 'rapport QA'].filter(Boolean).join(' — ');"),
    ("report", "la sous-ligne répète de nouveau le titre",
     '  <div class="sub">\n    ${devices',
     '  <div class="sub">\n    ${esc(run?.appId ?? \'\')} ·\n    ${devices'),

    # ⚠️ ET CELLE-CI EST LE DÉFAUT DU 253, MOT POUR MOT. Elle a d'abord laissé la
    # suite ENTIÈRE verte : `titrePublie()` restait juste, et c'est son câblage
    # au journal que plus rien ne tenait. Seul le garde qui LANCE report.mjs la
    # voit — garde qui lit du texte < garde qui appelle < exécution.
    ("report", "le journal reprend son propre calcul du titre",
     '    const titre = titrePublie(config, context.run);',
     "    const titre = config.artifact.title || 'Rapport Argus Mobile';"),
    ("report", "le titre publié ignore la forme par plateforme",
     "  const ident = artifactFor(config ?? {}, String(run?.platform ?? ''));\n  return ident.title ||",
     "  return config?.artifact?.title ||"),
    ("report", "le repli du titre redevient une constante générique",
     "return ident.title || titreDuRapport(run);",
     "return ident.title || 'Rapport Argus Mobile';"),
    ("skill", "le SKILL cesse de décrire le titre par défaut que le code produit",
     '   `<nom du projet> — <plateforme> — rapport QA` (`app.name`, et son identifiant',
     '   un titre par défaut (`app.name`, et son identifiant'),

    # ── 254 · le nom du projet, et la plateforme qui ne se répète plus ────────
    ("report", "le titre reperd le nom du projet au profit de l'identifiant",
     "return [run?.name || run?.appId, plateformeLisible(run?.platform), 'rapport QA']",
     "return [run?.appId, plateformeLisible(run?.platform), 'rapport QA']"),
    # ⚠️ Le CÂBLAGE, pas la fonction : celle-ci reste juste, elle ne reçoit
    # simplement plus le nom. Seul le garde qui LANCE report.mjs le voit.
    ("report", "le nom de la config n'atteint plus le run",
     "const run = { ...brut, name: brut.name || brut.appName || config.app?.name || '' };",
     "const run = { ...brut, name: brut.name || brut.appName || '' };"),
    ("report", "l'onglet réécrit la plateforme que le titre porte déjà",
     "+ (detonne ? `<span class=\"muted\"> · ${esc(plate || '?')}</span>` : '') + '</button>';",
     "+ `<span class=\"muted\"> · ${esc(plate || '?')}</span>` + '</button>';"),
    # ⚠️ L'AUTRE MOITIÉ : la retirer sans condition supprime le seul signal
    # qu'une page a mélangé deux plateformes.
    ("report", "l'onglet cesse de signaler une plateforme qui détonne",
     "+ (detonne ? `<span class=\"muted\"> · ${esc(plate || '?')}</span>` : '') + '</button>';",
     "+ '</button>';"),

    # ── 256-273 · la vague Android : deux runs, deux terrains, mêmes défauts ──
    ("skill", "le SKILL remontre la forme YAML que le parseur refuse",
     "   url:                                          # les deux plateformes\n     ios: 'https://…'\n     android: 'https://…'",
     "   url: { ios: 'https://…', android: 'https://…' }   # les deux"),
    ("yamlconf", "le gabarit remontre la forme flow",
     "  #     url:\n  #       ios: 'https://…'\n  #       android: 'https://…'",
     "  #     url: { ios: 'https://…', android: 'https://…' }"),
    ("skill", "une dimension sort de la séquence",
     "make argus-sec         # MASVS statique sur le binaire — sans device, quelques secondes\n",
     ""),
    # ⚠️ Celle-ci coupe le CÂBLAGE du diagnostic vers la console, pas la fonction
    # qui le construit : c'est exactement le défaut que le 258 ferme.
    ("run", "le diagnostic de démarrage ne sort plus en console",
     "        warn(`échec sur l'écran de départ${indice}`);",
     "        void indice;"),
    ("skill", "le SKILL reprend une base de dérivation concurrente",
     # ⚠️ Motif rafraîchi le 01/09 : le 279 a réécrit cette phrase (« Sur Android,
     # dérive-le… ») et le harnais a rendu « motif trouvé 0× », pas « VACANT ».
     # C'est la distinction qui évite d'aller chercher un garde qui existe.
     "⚠️ **Sur Android, dérive-le de `firstLaunchMs`**",
     "Dérive-le du maximum que tu as observé"),
    ("skill", "le SKILL réaffirme un diagnostic unique",
     "⚠️ **Devant un `Assertion is false: id: <ancre de départ> is visible`, il y a\nQUATRE causes, et la plus chère n'est pas celle qu'on cherche.** Le runner les",
     "⚠️ **Devant un `Assertion is false: id: <ancre de départ> is visible`, la cause\nest unique, et c'est l'instrumentation.** Le runner les"),
    ("installeur", "le compteur de TODO recompte ceux qui sont SANS OBJET",
     "grep 'TODO(argus):' | grep -cvE 'TODO\\(argus\\): *(SANS OBJET|FAIT|TRAITÉ)'",
     "grep -c 'TODO(argus):'"),
    # ⚠️ Celle-ci rend au fichier le nom que les deux plateformes partageaient —
    # le défaut du 275 dans sa forme exacte. Elle vise le CÂBLAGE (le chemin
    # construit dans `main()`), pas une fonction : c'est là qu'il vivait.
    ("report", "les deux plateformes réécrivent le même fichier",
     "join(dir, `report.artifact.${plateforme}.html`)",
     "join(dir, 'report.artifact.html')"),
    # Et celle-ci redonne au journal le message rassurant, mot pour mot.
    ("report", "publier sans url redevient un simple doublon",
     """      `à REPUBLIER sur ${url} — passe cette URL à la publication`,
      'sans elle, la publication ne crée pas forcément une page neuve : elle peut'
      + " atterrir sur celle d'un run précédent et la REMPLACER",""",
     "      `à REPUBLIER sur ${url} — publier sans cette URL crée un doublon`,"),
    # L'autre moitié : une PREMIÈRE publication n'est pas garantie neuve non
    # plus, et c'est la seule branche que le run 37 empruntait.
    # ⚠️ Ces trois-là rejouent le défaut que j'ai commis DEUX FOIS : donner un
    # chiffre unique comme critère. La mutation ne remet pas le mauvais chiffre,
    # elle retire le SECOND — ce qui suffit à refaire du premier un critère.
    ("skill", "le tell de la boucle redevient un chiffre unique",
     "il a mesuré **42,9 %** pour le **même** défaut, et a failli écarter le bon\ndiagnostic à cause du chiffre qu'on lui avait donné.",
     "il ne l'a pas retrouvé."),
    ("skill", "le coût des baselines redevient un chiffre unique",
     "Deux terrains l'ont mesurée à **5 min 50** et\n**4 min 22** — l'ordre de grandeur",
     "Un terrain l'a mesurée à **5 min 50** — l'ordre de grandeur"),
    # Et celle-ci renvoie le geste au loin, c'est-à-dire l'état que l'annotation
    # du 264 laissait intact.
    ("skill", "le geste du troisième temps repart au loin",
     "```bash\nnode scripts/argus/run.mjs --tags=visual --no-install   # 2 min 17 au lieu de six\n```",
     "Le raccourci est décrit plus bas, dans le paragraphe sur la mise au point\nd'un flow isolé."),
    # ⚠️ Celle-ci remet --check dans l'état où il ne rendait qu'un compte : la
    # branche sort avant d'appeler l'inventaire. C'est le 270 exact, celui que
    # j'avais démenti.
    ("installeur", "--check reperd la liste des fichiers OWNED",
     "    inventaire_owned\n    if [ \"$outdated\" -gt 0 ]; then",
     "    if [ \"$outdated\" -gt 0 ]; then"),
    # ⚠️ Les deux sens de l'angle mort iOS : le conseil redevient unique, puis le
    # câblage se coupe — le second est celui qu'aucun test unitaire ne voit.
    ("run", "le conseil de plafond redevient le même pour les deux plateformes",
     "  const derivation = String(platform) === 'ios'",
     "  const derivation = false"),
    ("run", "la plateforme n'atteint plus le conseil de plafond",
     "startupMarginWarning(startup, report.startup.timeoutMs, report.run?.platform)",
     "startupMarginWarning(startup, report.startup.timeoutMs)"),
    # ⚠️ Le TODO reperd la mention de son périmètre : il redevient lisible comme
    # le cas général, ce qu'il n'est pas.
    ("goto", "le TODO du retour cesse de dire ce qu'il ne couvre pas",
     "            # Pour un écran NOMMÉ (`goto` vers `profile`), elle est sautée, et\n"
     "            # c'est la branche du bas — une par écran — qui décide. Remplir\n"
     "            # celle-ci n'y changera donc rien.\n",
     ""),
    ("config", "les deux natures d'ancre orpheline se confondent de nouveau",
     "  const connuesDuDevice = orphelines.filter((a) => enConfig.has(a));",
     "  const connuesDuDevice = [];"),
    ("config", "le rapport d'ancres orphelines n'est plus câblé",
     "    for (const ligne of ancresOrphelinesReport(orphelines, config)) err(ligne);",
     "    err(`${orphelines.length} ancre(s) posée(s) dans lib/ que RIEN ne déclare :`);"),
    ("skill", "le compteur de flows reperd un fichier",
     'les parcours métier — neuf fichiers',
     'les parcours métier — huit fichiers'),
    # ── La vague iOS (283-295) ───────────────────────────────────────────
    ("skill", "la consigne de demander reperd son repli",
     "- **Personne ne répond** (agent non interactif, run en aveugle) → **instrumente,",
     "- (rien : demande, et attends)   ← ce que trois runs ont dû trancher seuls"),
    ("skill", "le troisième cas de publication disparaît",
     "   🔴 **TROISIÈME CAS : L'URL EST DÉCLARÉE ET LA PAGE N'EXISTE PLUS.**",
     "   Rien de plus : une URL est soit présente, soit absente."),
    ("skill", "le geste des doubles redevient à deviner",
     "class FakeHomeBloc extends MockBloc<HomeEvent, HomeState> implements HomeBloc {}",
     "// à toi de voir comment falsifier ton bloc"),
    ("skill", "le dépannage iOS repart",
     "flutter clean && flutter pub get     # puis reconstruire",
     "# (rien pour iOS)"),
    ("skill", "la coquille de départ reperd sa case",
     "| Coquille **qui EST l'écran de départ** (elle rend l'accueil) | **oui**, avec `anchor:` | **oui**, sans `anchor:` |\n",
     ""),
    ("skill", "le périmètre reperd sa règle d'arrêt",
     "- **Étage 1 : pas de règle d'arrêt.** Il ne coûte pas de device, quelques",
     "- **Étage 1 : à toi de voir.** Il ne coûte pas de device, quelques"),
    ("skill", "le geste d'exclusion des baselines disparaît",
     "node scripts/argus/run.mjs --tags=visual --exclude-tags=functional,lifecycle",
     "# débrouille-toi pour ne pas rejouer le flow gelé"),
    ("config", "l'avertissement sur les captures redevient inacquittable",
     "&& !acquitte) {",
     ") {"),
    ("skill", "la page redevient réécrivable avant publication",
     "7. **LE FICHIER SE PUBLIE TEL QUEL — ne le réécris pas, ne le « redesigne »",
     "7. **Mets la page en forme avant de publier — ne le « redesigne »"),
    ("skill", "la séquence reperd le renvoi vers le diagnostic du runner",
     "⚠️ **SI `argus-run` ÉCHOUE SUR L'ANCRE DE DÉPART, NE DEVINE PAS : LE RUNNER TE",
     "⚠️ **Si `argus-run` échoue, cherche pourquoi. LE RUNNER TE"),
    # ── 297 : le contrôle de configuration non embarquée ─────────────────
    # Celle-ci le vide de sa substance sans toucher au motif que le garde lit.
    ("config", "le contrôle de config ne regarde plus la déclaration",
     "      if (motif && !texte.includes(motif)) {",
     "      if (false && motif && !texte.includes(motif)) {"),
    # Et celle-ci coupe l'extensibilité — la moitié qui répond à « et les autres
    # fichiers de config ? ».
    ("config", "un projet ne peut plus déclarer ses propres fichiers",
     '  const regles = [...CONFIG_FILES, ...(config?.configFiles ?? [])]',
     '  const regles = [...CONFIG_FILES]'),
    # Le câblage vers le rapport.
    ("sec", "les findings de configuration n'atteignent plus le rapport",
     "...auditSecrets(root, config), ...auditConfigFiles(root, config)]",
     "...auditSecrets(root, config)]"),
    # Et le signal précoce, celui qui épargne la passe device.
    ("config", "le signal précoce de configuration disparaît",
     "  const orphelins = configNonEmbarquee(dirname(config.__file), config);",
     "  const orphelins = [];"),
    # ── 298 : le nom affiché ─────────────────────────────────────────────
    ("config", "l'indirection @string/ est prise pour un nom affiché",
     'const label = /android:label="([^"@][^"]*)"/.exec',
     'const label = /android:label="([^"]*)"/.exec'),
    ("config", "le signal sur app.name devient inacquittable",
     "  if (configure !== paquet) return '';",
     "  if (false) return '';"),
    ("config", "le signal sur app.name n'est plus câblé",
     "  const nomTech = nomTechniqueEnTitre(dirname(config.__file), config);\n  if (nomTech) warn(nomTech);",
     "  const nomTech = '';\n  if (nomTech) warn(nomTech);"),
    ("yamlconf", "le gabarit represcrit le nom du paquet Dart",
     "  # Le nom que l'application AFFICHE — pas celui du paquet Dart.",
     "  # Nom du paquet Dart (pubspec.yaml → name)."),
    # ── La vague Android n° 2 (299-316) ──────────────────────────────────
    ("config", "le croisement d'ancres redevient aveugle au ternaire",
     "        const litteraux = litterauxDart(arg)",
     "        const litteraux = litterauxDart(arg).slice(0, 1)"),
    ("config", "le verdict vert retait les ancres non lisibles",
     "      for (const o of vues.opaques ?? []) {",
     "      for (const o of []) {"),
    ("run", "l'échec d'installation reperd sa cause dans la stack",
     "  for (const rx of NOMMANTS) {",
     "  for (const rx of []) {"),
    ("run", "le detail d'installation ne lit plus qu'un flux",
     "    const detail = causeInstall(`${res.stderr ?? ''}\\n${res.stdout ?? ''}\\n${res.error ?? ''}`);",
     "    const detail = causeInstall(res.stderr ?? '');"),
    ("skill", "la release sort de la séquence",
     "<la commande de RELEASE de ton projet>   # 🚨 PAS `make argus-build`, qui bâtit le debug\n",
     ""),
    ("skill", "la séquence reperd l'arête vers argus-perf",
     "                       # ⚠️ s'il avertit sur le PLAFOND D'ATTENTE : `make argus-perf` ICI,\n"
     "                       #    puis relève startTimeoutMs AVANT les références (voir plus bas)\n",
     ""),
    ("skill", "le repli reperd l'exception du widget privé",
     "⚠️ **UNE EXCEPTION, ET ELLE EST NOMMÉE : rendre PUBLIC un widget privé.**",
     "⚠️ **Aucune exception.**"),
    # ⚠️ Elle vise la VALEUR (la commande de contre-épreuve), pas le titre qui
    # l'annonce : retirer le titre laissait le bloc bash en place, donc le §2b
    # prescrivait toujours la sonde et le garde restait vert — à raison.
    ("skill", "le §2b reperd sa contre-épreuve de compteur",
     "grep -c 'ArgusScreen(' test/argus/harness.dart          # doit être > 0 : l'exemple existe\n",
     ""),
    ("skill", "le point de tap redevient une recette",
     "🚨 **LE POINT DÉPEND DE L'ÉCRAN — il n'y a pas de valeur par défaut, et en",
     "⚠️ **Prends `tapOn: point: 50%,25%`. Accessoirement, en"),
    ("skill", "REGRESS reperd son contrôle de jetons",
     "🚨 **EN REGRESS, IL N'Y A AUCUN PATCH INVERSE — ET C'EST LÀ QU'UNE LIGNE SE",
     "⚠️ **En REGRESS l'instrumentation reste, et le git diff suffit — UNE LIGNE SE"),
    ("makefile", "la cible qui agrège les dettes disparaît",
     "argus-debts: ## Le bloc known_issues prêt à coller, dérivé des échecs de l'étage 1",
     "argus-debts-desactive: ## (retiré)"),
    # ── La vague iOS n° 2 (317-332) ──────────────────────────────────────
    ("installeur", "un TODO FAIT ne se ferme plus",
     "grep -cvE 'TODO\\(argus\\): *(SANS OBJET|FAIT|TRAITÉ)'",
     "grep -cv 'TODO(argus): *SANS OBJET'"),
    ("run", "le conseil de plafond reparle quand l'app ne démarre pas",
     "  if (atteints.length === 0) {",
     "  if (false) {"),
    ("run", "la locale iOS redevient illisible",
     "        : sh('xcrun', ['simctl', 'spawn', resolved.udid, 'defaults', 'read', '-g', 'AppleLocale']).stdout.trim()",
     "        : ''"),
    ("config", "les gabarits d'ancres retombent dans les opaques",
     "  const gabarit = /'[^']*\\$\\{[^']*'/.test(nu) || parametreDAncre.test(nu);",
     "  const gabarit = /'[^']*\\$\\{[^']*'/.test(nu);"),
    ("report", "la plateforme du titre reperd sa casse",
     "  if (v.toLowerCase() === 'ios') return 'iOS';",
     "  if (v.toLowerCase() === 'ios') return 'ios';"),
    ("run", "l'empreinte iOS redevient « déclarée »",
     "  if (platform !== 'android' && resolu?.measured && resolu.model) {",
     "  if (false) {"),
    ("config", "un device hors plateforme repasse en silence",
     "    if (pf && plateformes.size && !plateformes.has(pf)) {",
     "    if (false) {"),
    ("skill", "la forme mocktail du défaut disparaît",
     "  .thenAnswer((_) async => null);                    // ← LE DÉFAUT, sous sa vraie forme\n",
     ""),
    ("goto", "le TODO reconseille un `back` sur iOS",
     "            # ⚠️ `back` EST ANDROID ET WEB UNIQUEMENT.",
     "            # ⚠️ Un `back` répété marche partout."),
    ("report", "une première publication cesse d'être vérifiée",
     """    "et VÉRIFIE qu'elle n'a pas remplacé une page existante : relis le titre de"
    + " l'URL rendue, ou compare la liste des artefacts avant/après. Une publication"
    + ' sans URL est rapprochée par CHEMIN DE FICHIER, pas par intention',""",
     "    'publie, puis reporte l\\'URL',"),

    # ── Les compteurs de la page publiée (333) ──────────────────────────────
    ("artefact", "nombreFr rend zéro au lieu de lever sur un mot inconnu",
     "    throw new Error(`nombreFr : mot non reconnu \u00ab ${mot} \u00bb dans \u00ab ${texte} \u00bb`);",
     "    return total;"),
    ("artefact", "quatre-vingt redevient 4 + 20",
     "    .replace(/\\bquatre vingts?\\b/g, '\u00a780');",
     "    .replace(/\\bquatre vingts?\\b/g, 'quatre vingt');"),
    ("artefact", "le texte de la page n'est plus aplati",
     "  return lisible.replace(/\\s+/g, ' ').trim();",
     "  return lisible.trim();"),
    ("artefact", "le compteur de gardes matche le mot nu",
     "    motif: /run-guards\\.test\\.mjs\\s*\u2190\\s*(\\d+)\\s+gardes/g,",
     "    motif: /(\\d+)\\s+gardes/g,"),
    ("artefact", "un motif introuvable redevient un silence",
     "    if (valeurs.length === 0) {",
     "    if (valeurs.length === 0 && false) {"),
    ("artefact", "le regime journal lit le minimum au lieu du maximum",
     "    const maximum = Math.max(...valeurs);",
     "    const maximum = Math.min(...valeurs);"),
    ("artefact", "la seconde source du numero libre recopie la premiere",
     "  const parLesCommits = numerosClos.length > 0 ? Math.max(...numerosClos) + 1 : null;",
     "  const parLesCommits = parLeBacklog;"),
    ("artefact", "le dernier point du backlog devient le premier",
     '  return Math.max(...tous);',
     '  return tous[0];'),
    ("artefact", "un compteur ancre n'est plus compare",
     "        if (valeur !== attendu) {",
     "        if (valeur !== attendu && false) {"),

    ("confid", "le detecteur d'AVD ne matche plus rien",
     "    motif: /\\b[A-Za-z]\\w*_API\\d+\\b/g,",
     "    motif: /\\bjamais_un_avd_\\d+\\b/g,"),
    ("confid", "le temoin est toujours vrai, donc ne prouve rien",
     "export const TEMOIN = /argus/i;",
     "export const TEMOIN = /(?:)/;"),
    ("confid", "une exception morte n'est plus signalee",
     "    mortes: EXCEPTIONS.filter((e) => !servies.has(e.valeur.toLowerCase())),",
     "    mortes: [],"),
    ("confid", "le motif d'identifiant capte les cles de config du skill",
     "    motif: /\\b(?:com|io|net|org|fr|dev|app|me|co|eu|be|ch|ca)\\.[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+/gi,",
     "    motif: /\\b[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*){2,}/gi,"),

    # ── La passe 334-342 ────────────────────────────────────────────────────
    ("config", "l'automate ne saute plus les chaines internes a une interpolation",
     "            const interne = d;",
     "            const interne = String.fromCharCode(0);"),
    ("config", "le releve d'ancres revient au motif naif",
     "        const litteraux = litterauxDart(arg)",
     "        const litteraux = [...arg.matchAll(/'([^']*)'/g)].map((x) => x[1])"),
    ("run", "le masquage redevient aveugle a la valeur vide",
     "    return trouve[2] === '' ? `${trouve[1]}=<VIDE>` : `${trouve[1]}=***`;",
     "    return `${trouve[1]}=***`;"),
    ("run", "aucun secret n'est jamais rapporte comme vide",
     "    .filter(([cle, valeur]) => /^QA_[A-Z0-9_]+$/.test(cle) && String(valeur ?? '') === '')",
     "    .filter(() => false)"),
    ("skill", "le geste du clavier disparait, le diagnostic reste",
     "- **sur un écran à élément flottant, ouvre le clavier en DERNIER** — touche",
     "- sur un écran à élément flottant, la disposition change — touche"),
    # ⚠️ La mutation porte sur la PRESCRIPTION entière : `startup.samples` est
    # nommé deux fois dans la phrase, et n'en muter qu'une laissait le garde vert
    # — verdict « VACANT » rendu par le harnais alors que le garde était bon.
    ("skill", "la bonne grandeur du plafond n'est plus prescrite",
     "c'est `startup.samples` qui commande, **sur les deux plateformes**",
     "c'est la mesure la plus fiable qui commande"),
    ("installeur", "le rappel des TODO n'est jamais arme",
     "      todo_rappel=1",
     "      todo_rappel=0"),

    # ── La passe 343-346 (run 45) ───────────────────────────────────────────
    ("sec", "un paquet perime est rapporte comme frais",
     "    process.stdout.write(`${f ? (f.stale ? 'perime' : 'frais') : 'inconnu'}\\n`);",
     "    process.stdout.write(`${f ? 'frais' : 'inconnu'}\\n`);"),
    ("skill", "la contre-epreuve a cinq secondes disparait",
     "maestro hierarchy | grep -c '<ton ancre>'     # 0 \u21d2 elle n'est PAS dans l'arbre",
     "maestro test .maestro/smoke.yaml              # rejoue le flow pour voir"),
    ("skill", "le rappel du dartdoc ne nomme plus le marqueur",
     "un exemplaire MOT POUR MOT de ce que tu vas chercher.** S'ancrer sur la ligne de",
     "un exemplaire de ce que tu vas chercher.** S'ancrer approximativement sur la ligne de"),
    # ── Les gardes de la revue du 02/09. Une mutation par correctif majeur. ──
    ("sca", "cvssOf ressort sur le vecteur, sautant le repli d'en dessous",
     "    if (Number.isFinite(direct)) return direct;\n  }",
     "    if (Number.isFinite(direct)) return direct;\n"
     "    if (String(entry?.score ?? '').startsWith('CVSS:')) return null;\n  }"),
    ("sec", "--require-tools échoue de nouveau sur ce que le code a DÉCIDÉ",
     "  if (facts?.nature === 'sans-objet') return null;",
     "  if (facts?.nature === 'jamais-employe') return null;"),
    ("sec", "les drapeaux redeviennent lus dans src/main seulement",
     "  const variantes = variantesDuManifeste(root);\n  if (variantes.length === 0) return [];",
     "  const variantes = variantesDuManifeste(root).slice(0, 1);\n  if (variantes.length === 0) return [];"),
    ("config", "--check-anchors conclut de nouveau sans rien avoir lu",
     "    if ((lues.fichiers ?? 0) === 0) {",
     "    if (lues.length === -1) {"),
    ("config", "ciEmulator cesse de rendre l'AVD que la config déclare",
     "  const avdName = String(device.avd ?? '').trim();",
     "  const avdName = '';"),
    # ⚠️ LA PREMIÈRE VERSION DE CETTE MUTATION A RENDU « VACANT », et elle avait
    # raison : débrancher la lecture du marqueur ne change RIEN tant que le repli
    # de prose tombe lui aussi dessus. Ce qui porte la stabilité est que le
    # marqueur arrive AVANT toute prose qui se nomme — c'est cela qu'on casse.
    ("config", "outilPresent redevient aveugle au shell qui avale l'ENOENT",
     "  if (res?.error !== null) return false;\n  return res.status !== 127 && res.status !== 9009;",
     "  if (res?.error !== null) return false;\n  return true;"),
    # ⚠️ Ancrée sur l'étape qui SUIT, propre au job Android : la ligne seule
    # apparaît dans les deux jobs, et le harnais l'a dit — « motif trouvé 2×
    # (attendu 1) », donc HARNAIS et non « garde vacant ». Casser UNE des deux
    # suffit : le garde parcourt chaque étape d'installation.
    ("ci", "plus rien ne permet d'épingler la version de Maestro",
     "          MAESTRO_VERSION: ${{ vars.ARGUS_MAESTRO_VERSION }}\n"
     "        run: |\n"
     "          curl -fsSL \"https://get.maestro.mobile.dev\" | bash\n"
     "          echo \"$HOME/.maestro/bin\" >> \"$GITHUB_PATH\"\n"
     "          \"$HOME/.maestro/bin/maestro\" --version\n"
     "\n"
     "      # Contrôle de syntaxe AVANT de démarrer l'émulateur",
     "          MAESTRO_VERSION: ''\n"
     "        run: |\n"
     "          curl -fsSL \"https://get.maestro.mobile.dev\" | bash\n"
     "          echo \"$HOME/.maestro/bin\" >> \"$GITHUB_PATH\"\n"
     "          \"$HOME/.maestro/bin/maestro\" --version\n"
     "\n"
     "      # Contrôle de syntaxe AVANT de démarrer l'émulateur"),
    # ⚠️ UNE SEULE MUTATION, PARCE QU'IL N'Y A PLUS QU'UN MOTIF. La première
    # version en portait deux : celle qui cassait la copie d'`ecransSansBranche`
    # rendait « VACANT », cette copie n'ajoutant qu'une entrée « undefined » que
    # rien n'observe. Le motif est partagé depuis, et le compteur le garde.
    ("config", "le motif de branche reprend les gardes de typage",
     "const TETE_BRANCHE = String.raw`(?<!typeof )SCREEN_ID\\s*===\\s*`;",
     "const TETE_BRANCHE = String.raw`SCREEN_ID\\s*===\\s*`;"),
    ("config", "reachedBy cesse de fermer le cas du parcours qui crée la donnée",
     "    .filter((/** @type {any} */ s) => !String(s.reachedBy ?? '').trim())",
     "    .filter((/** @type {any} */ s) => true)"),
    ("makefile", "une prose qui se nomme repasse devant le marqueur",
     "# ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.\n"
     "# Argus Mobile — raccourcis.",
     "# Argus Mobile — raccourcis.\n"
     "# ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier."),
    ("makefile", "le repli d'argus-debts redevient une branche morte",
     '\tif [ -n "$$dettes" ]; then printf \'%s\\n\' "$$dettes"; \\\n'
     '\telse echo "  (aucune dette à inscrire — la suite est verte, ou elle n\'a pas tourné)"; fi',
     '\tprintf \'%s\\n\' "$$dettes" \\\n'
     '\t  || echo "  (aucune dette à inscrire — la suite est verte, ou elle n\'a pas tourné)"'),
    # ── Le run 46 (347-352) ─────────────────────────────────────────────────
    ("goto", "347 · l'exemple retape l'onglet sans redescendre",
     "#       - tapOn:\n#           id: detail_back\n#           optional: true\n"
     "#           label: Refermer un écran poussé, s'il y en a un\n#       - tapOn:\n#           id: nav_profile",
     "#       - tapOn:\n#           id: nav_profile"),
    ("skill", "348 · rendre le widget public redevient le remède du cas gestuel",
     "Rendre le widget public n'y change rien",
     "Rendre le widget public suffit"),
    ("prompts", "349 · le cadrage cesse de demander ce que devient la télémétrie",
     "- <la TÉLÉMÉTRIE, si l'app en émet",
     "- <la télémétrie, on verra plus tard"),
    ("prompts", "350 · plus rien n'avertit que le clone rend la version publiée",
     "⚠️ **Le clone rend le plugin PUBLIÉ, et ce n'est pas forcément celui que tu\ntestes.**",
     "Le clone rend le plugin, et c'est très bien comme ça."),
    ("dette", "351 · le lot de dettes s'accepte de nouveau sans échantillon",
     "// ⚠️ AVANT D'ACCEPTER LE LOT, OUVRE-EN TROIS À LA MAIN.",
     "// Colle ce que le message d'échec te donne."),
    # ⚠️ Celle-ci vise le CÂBLAGE, pas la règle : le champ reste déclaré, le test
    # cesse simplement de le lire. C'est le mode de panne qu'aucun test de
    # comportement ne voit — le garde ne s'exécute pas, donc il ne rougit pas.
    ("layout", "352 · layout_test cesse de lire cropRoot, le garde ne tourne plus",
     "      if (screen.cropRoot && screen.anchor != null) {",
     "      if (false && screen.anchor != null) {"),
    # ── Le dépouillement des runs 47-48 (358-365) ───────────────────────────
    ("types", "368 · le dartdoc ne prévient plus des deux schémas",
     "/// ⚠️ **CETTE CLASSE ET `screens[]` DE `argus.mobile.yaml` PARTAGENT LEUR\n"
     "/// VOCABULAIRE SANS PARTAGER LEURS CHAMPS.**",
     "/// Les champs suivent argus.mobile.yaml."),
    ("skill", "369 · l'accueil authentifié redevient ARGUS_ANCHOR_HOME",
     "⚠️ **ET UNE APP AUTHENTIFIÉE A DEUX RACINES, DONT `ARGUS_ANCHOR_HOME` N'EN\nDÉSIGNE QU'UNE.**",
     "⚠️ **L'accueil se désigne par `ARGUS_ANCHOR_HOME`.**"),
    ("skill", "370 · le scan QR redevient un geste comme un autre",
     "⚠️ **ET UN CRAN PLUS LOIN : LE GESTE QUE MAESTRO NE PEUT PAS PRODUIRE DU TOUT.**",
     "⚠️ **Un scan de QR se script comme le reste.**"),
    ("config", "371 · un acquittement sans raison compte quand même",
     "      status: why === '' ? 'open' : 'acknowledged',",
     "      status: 'acknowledged',"),
    ("config", "371 bis · un acquittement périmé n'est plus signalé",
     '  return { findings: sortie, perimes: [...table.keys()].filter((id) => !vus.has(id)), malFormees };',
     '  return { findings: sortie, perimes: [], malFormees };'),
    ("config", "372 · le contrôle de config rejuge hors de sa plateforme",
     "  const regles = [...CONFIG_FILES, ...(config?.configFiles ?? [])]\n"
     "    .filter((r) => !r.plateforme || plateformes.includes(String(r.plateforme)));",
     "  const regles = [...CONFIG_FILES, ...(config?.configFiles ?? [])];"),
    ("report", "367 · un run interrompu se rend de nouveau en vert",
     "    } else if (data.incomplete === true || data.run?.status === 'interrompu') {",
     "    } else if (false) {"),
    # ⚠️ Le GATE séparément : la dimension peut être marquée INTERROMPUE et le
    # verdict rester « pass ». Ce sont deux moitiés, et la seconde est celle
    # qu'on lit en premier.
    ("report", "367 bis · un run interrompu peut de nouveau rendre gate pass",
     "  const gate = interrompues.length > 0\n    || SEVERITIES.some((s) => failOn.has(s) && bloquants[s] > 0) ? 'fail' : 'pass';",
     "  const gate = SEVERITIES.some((s) => failOn.has(s) && bloquants[s] > 0) ? 'fail' : 'pass';"),
    ("artefact", "366 · le numéro libre redevient aveugle aux points clos sans titre",
     "  const annonces = [...backlog.matchAll(/Prochain numéro libre\\s*:\\s*(\\d+)/g)]\n"
     "    .map((m) => Number(m[1]) - 1);\n"
     "  const tous = [...numeros, ...annonces];",
     "  const tous = [...numeros];"),
    ("report", "358 · un scope partiel ne se dit plus au terminal",
     "  if (String(run?.scope ?? 'complet') !== 'complet') {",
     "  if (false) {"),
    ("report", "359 · l'absence d'URL se réannonce comme une première publication",
     "    `aucune URL enregistrée pour ${plateforme} — ce qui ne veut PAS dire qu'aucune `",
     "    `première publication : reporte l'URL — ce qui ne veut PAS dire qu'aucune `"),
    ("skill", "360 · la contre-épreuve visuelle reperd son titre",
     "### La contre-épreuve visuelle — le seul temps qui prouve que la comparaison MESURE\n",
     ""),
    ("skill", "361 · la mise en garde const est écrite une seconde fois",
     "⚠️ **`Semantics` N'A PAS DE CONSTRUCTEUR `const`** — le rappel vivait à huit",
     "⚠️ **`Semantics` N'A PAS DE CONSTRUCTEUR `const`** (bis, recopié ici).\n\n"
     "⚠️ **`Semantics` N'A PAS DE CONSTRUCTEUR `const`** — le rappel vivait à huit"),
    # ⚠️ MA PREMIÈRE VERSION RENDAIT VACANT, et le harnais avait raison : elle
    # réécrivait le TITRE et laissait intacte la phrase que le garde mesure.
    # Une mutation doit viser la valeur observée, jamais la ligne d'à côté.
    ("skill", "364 · la contre-épreuve resuppose un outil d'image",
     "Ni ImageMagick ni\nPIL ne sont garantis sur un poste",
     "Un outil d'image est disponible partout"),
    ("skill", "365 · la contradiction de publication est de nouveau sans issue",
     "   ⚠️ **VOICI COMMENT ON EN SORT, parce que la nommer ne suffisait pas** : si\n"
     "   l'outil exige la passe de conception, **charge-la** — la contrainte est\n"
     "   satisfaite par le chargement, pas par une retouche — puis **n'applique rien**\n"
     "   et dis-le.",
     "   La sortie est laissée à ton jugement."),
    ("devices", "362 · l'émulateur partagé et plein redevient imprévu",
     "⚠️ **UN ÉMULATEUR DÉJÀ DÉMARRÉ EST UN ÉMULATEUR PARTAGÉ, ET IL PEUT ÊTRE PLEIN.**\n"
     "`adb install` rend alors `INSTALL_FAILED_INSUFFICIENT_STORAGE",
     "⚠️ **Un émulateur déjà démarré est prêt à recevoir l'application.**\n"
     "`adb install` rend alors `OK"),
    ("yamlconf", "363 · le gabarit repré-remplit des secrets d'office",
     "  secretsFromEnv: []\n  #   - QA_USER\n  #   - QA_PASS",
     "  secretsFromEnv:\n    - QA_USER\n    - QA_PASS"),
    # ⚠️ RÉ-ANCRÉE PAR LE 466, qui a réécrit ce message. La mutation vise le même
    # EFFET — retirer ce que l'avertissement COÛTE — sur le texte du jour ; une
    # mutation laissée sur l'ancienne formulation aurait rendu HARNAIS, et un
    # HARNAIS non lu se confond avec un garde qui tient.
    ("run", "355 · l'avertissement de locale ne dit plus ce qu'il coûte",
     "    '  ⚠️ Ce que ça coûte DÉPEND de ton application, et ce script ne peut pas le savoir : '\n"
     "      + 'si elle SUIT la locale du système, le flow i18n mesure alors celle de l\\'APPAREIL, '\n"
     "      + 'donc il est vert quoi que tu déclares ; si elle ÉPINGLE sa locale, il mesure bien '\n"
     "      + 'la tienne et cet avertissement ne te coûte rien.',\n",
     ""),
    # ⚠️ LE CÂBLAGE, pas la fonction : `localeFindings` reste parfaite, elle
    # n'atteint simplement plus le rapport. C'est l'état d'avant le correctif,
    # et aucun test de comportement ne peut le voir.
    ("run", "355 bis · le finding de locale n'atteint plus le rapport",
     "    ...localeFindings(avertissementsLocale, reportDevice, platform),\n",
     ""),
    ("prompts", "353 · le cadrage cesse de trancher les captures",
     "  EVIDENCE  : oui                # oui | non — les captures d'écran partent-elles",
     "  # EVIDENCE : l'agent verra bien"),
    ("prompts", "354 · plus rien ne dit que la doc liste PLUSIEURS adresses",
     "  ⚠️ **LA DOC DE BUILD DU PROJET EN LISTE SOUVENT PLUSIEURS, ET ELLES NE SE\n  VALENT PAS.**",
     "  L'adresse se trouve dans la doc du projet."),
    ("config", "352 bis · le croisement recompte les cropRoot en COMMENTAIRE",
     "  const src = dartSansCommentaires(brut);\n  // Un bloc par écran",
     "  const src = brut;\n  // Un bloc par écran"),
    # 373 — la condition d'écriture empruntée au web disparaît de la §3 mobile.
    # ⚠️ Elle ne vit qu'à UN endroit exprès : la cellule du tableau dit « à
    # retirer après » et non « nettoyées », pour qu'une mutation ici ne laisse
    # pas une seconde copie rendre le garde vert sur rien.
    ("methodo", "373 · la condition de NETTOYAGE quitte les garde-fous",
     "- **Nettoyage** : ce qu'un run crée en",
     "- **Hygiène** : ce qu'un run crée en"),
    # 373 — l'autre sens : la SOURCE devient illisible. Le garde ne doit pas
    # conclure « tout va bien » parce qu'il n'a plus rien à comparer.
    # 373 quinquies — la soustraction reprend TOUS les ouverts, y compris ceux
    # qui précèdent la dernière clôture et n'expliquent donc aucun retard.
    ("artefact", "373 quinquies · tous les ouverts sont soustraits, même les antérieurs",
     "    .filter((n) => n >= (depot.numeroLibreSelonLesCommits ?? 0)).length;",
     "    .filter(() => true).length;"),
    # 373 — le skill repose la QUESTION sans dire quoi faire de la réponse :
    # l'agent se retrouve exactement où il était avant de la poser.
    ("skill", "373 · le skill ne dit plus quoi faire d'un parcours à usage unique",
     "1. **Écris le parcours, sors-le de la suite, ne le lance pas.** Un fichier tagué\n   `manual`",
     "1. **À toi de voir.** Un fichier quelconque, tagué\n   `au-choix`"),
    # 386 — la consigne « note ici » retrouve son absence d'endroit.
    # ⚠️ Elle vise la FORME, pas le titre du paragraphe : muter l'en-tête laissait
    # la ligne `construit par : …` en place, donc le garde restait vert à raison —
    # la forme était toujours dite. Le harnais l'a rendu VACANT, et il avait raison.
    # ⚠️ RÉ-ANCRÉE PAR LE 467, qui a réécrit ce bloc. Même effet : la FORME de la
    # note disparaît, et « note ici » redevient une consigne sans endroit.
    ("yamlconf", "386 · « note ici » redevient une consigne sans endroit",
     "  #     # construit par : <commande>  (source : <fichier §>)",
     "  #     (note-la quelque part dans ce fichier)"),
    # 381 — le vidage du trousseau iOS cesse d'être tenté : la règle anti-flake
    # redevient muette sur toute la plateforme.
    ("run", "381 · le trousseau iOS n'est plus vidé",
     "  if (platform !== 'ios') {\n    return { ok: false, detail: 'Android : `pm clear` emporte déjà les données, trousseau compris' };",
     "  if (platform !== 'nulle-part') {\n    return { ok: false, detail: 'Android : `pm clear` emporte déjà les données, trousseau compris' };"),
    # 381 bis — la fonction reste juste, plus personne ne l'appelle.
    ("run", "381 bis · le vidage du trousseau n'est plus câblé",
     "  const keychain = resetKeychain(platform, resolved.udid, opts.dryRun);",
     "  const keychain = { ok: false, detail: 'neutralisé' };"),
    # 382 — la place du geste disparaît : on éditerait le cadre, qui est écrasé.
    ("launchclean", "382 · l'alerte système iOS n'est plus documentée",
     "# 🔴 ET IL NE COUVRE PAS L'ALERTE SYSTÈME DES NOTIFICATIONS SUR iOS.",
     "# Rien de particulier à signaler sur les permissions."),
    # 388 — le geste de l'invite système perd sa forme conditionnelle : un tap
    # inconditionnel échoue dès le second run, l'alerte n'apparaissant qu'une fois.
    ('dismiss', "388 · le geste de l'invite n'est plus conditionnel",
     '    optional: true',
     '    optional: false'),
    # 388 bis — la moitié que le 382 avait manquée : fermer l'alerte ne suffit pas.
    ('launchclean', "388 bis · le lien avec le trousseau disparaît",
     '    clearKeychain: true',
     '    clearKeychain: false'),
    # 389 — le message du runner retombe à trois causes pendant que le SKILL en
    # annonce quatre : c'est l'ACCORD des trois sources que le garde dérive.
    ("run", "389 · le runner reperd la cause de l'écran couvert",
     "    + ` plafond n'y changera rien. (2) CE N'EST PAS L'ÉCRAN QU'ON CROIT : sur la`",
     "    + ` plafond n'y changera rien. (9) CE N'EST PAS L'ÉCRAN QU'ON CROIT : sur la`"),
    # 390 — la preuve de session retombe sur la DÉCLARATION de la variable.
    # ⚠️ PREMIÈRE VERSION VACANTE, et le harnais avait raison : elle changeait le
    # `label:`, que le garde ne mesure pas. C'est l'assertion elle-même qu'il faut
    # retirer — une mutation doit viser la valeur gardée, jamais ce qui l'entoure.
    ("lifecycle", "390 · rien ne prouve plus que la session est ouverte",
     "      - assertVisible:\n          id: ${ARGUS_ANCHOR_AFTER_AUTH}\n          label: Session réellement ouverte",
     "      - assertVisible:\n          id: ${ARGUS_ANCHOR_HOME}\n          label: Session réellement ouverte"),
    # 391 — les échecs d'étage 1 repassent sous le seuil du gate. ⚠️ La mutation
    # vise la SÉVÉRITÉ, pas la présence de la source : retirer la source ferait
    # tomber le garde par une autre voie, et on croirait la sévérité gardée.
    ("report", "391 · l'étage 1 repasse sous le seuil du gate",
     "    id: 'QAM-STAGE1', severity: 'major', dimension: 'a11y',",
     "    id: 'QAM-STAGE1', severity: 'info', dimension: 'a11y',"),
    # 392 — la clé du binaire iOS reperd ce qu'un flavor y change.
    ("yamlconf", "392 · la clé build.ios ne dit plus ce qu'un flavor déplace",
     "  # ⚠️ UN FLAVOR DÉPLACE CE CHEMIN, et le défaut ci-dessous n'en porte aucun.",
     "  # Le chemin du bundle de simulateur."),
    # 396 — le geste de l'invite redevient inatteignable : launch-clean cesse de
    # l'appeler, donc il retombe dans un fichier que la plupart des flows ne
    # traversent pas. ⚠️ La mutation vise l'APPEL, pas le fichier : c'est
    # l'atteinte qui manquait, jamais le contenu.
    ("launchclean", "396 · le geste de l'invite redevient inatteignable",
     "- runFlow: dismiss-system-alerts.yaml",
     "# (plus appelé)"),
    # 396 bis — le geste cesse d'appartenir au projet : un fichier du CADRE serait
    # écrasé au prochain --update, avec les libellés que l'utilisateur a réglés.
    ("dismiss", "396 bis · le geste passe au CADRE, donc écrasable",
     "# ARGUS:OWNED — à toi : l'installeur ne l'écrase ni ne le compare, jamais.",
     "# ARGUS:CADRE — au plugin."),
    # 398 — le message d'ancre absente reperd la cause de MONTAGE, celle qui
    # n'accuse pas l'instrumentation.
    # ⚠️ PREMIÈRE VERSION VACANTE, et le harnais avait raison : elle retirait une
    # phrase intermédiaire que le garde ne mesure pas. Ce qu'il mesure, c'est le
    # RENVOI vers l'endroit où le remède est écrit — sans lui, le message nomme la
    # cause sans dire quoi en faire, ce qui est la moitié du défaut.
    ("anchorsdart", "398 · le message ne renvoie plus où le remède est écrit",
     "'note d\\'`ArgusScreen.setUp` dans argus_types.dart, qui donne le '",
     "'documentation du harnais, qui donne le '"),
    # 387 — le trousseau cesse d'être purgé à la cadence de `clearState`.
    # ⚠️ La mutation vise la VALEUR, jamais le commentaire qui l'explique : celui-ci
    # nomme `clearKeychain` deux fois, et un garde qui se contenterait de trouver le
    # mot resterait vert sur un bloc qui ne purge plus rien.
    ("launchclean", "387 · le trousseau n'est plus purgé avec l'état",
     "    clearKeychain: true\n    permissions:",
     "    permissions:"),
    # 383 — le skill prescrit une cible `make` que le Makefile ne porte pas.
    ("skill", "383 · le skill prescrit une cible make inexistante",
     "et la réponse est **`make argus-doctor`**",
     "et la réponse est **`make argus-diagnostic`**"),
    # 380 — le contrôle d'ordre cesse d'être borné au registre : il déborde sur
    # les autres tableaux de la page, dont l'un décroît volontairement.
    ("artefact", "380 · le contrôle d'ordre n'est plus borné au registre",
     "  const debut = texte.indexOf('Le backlog terrain, entièrement');",
     "  const debut = 0;"),
    # 374 — le verdict des acquittements périmés retourne dans un producteur,
    # qui ne voit que la moitié des findings et accuse donc ceux de son voisin.
    ("report", "374 · les acquittements périmés se jugent sur une MOITIÉ",
     '  const { perimes, malFormees } = acquitter(findings, config);',
     '  const { perimes, malFormees } = acquitter(findings, {});'),
    # 375 — le flow mort redevient éligible au pire temps de démarrage.
    ("run", "375 · un flow MORT peut redevenir le pire temps de démarrage",
     "  const vivantes = samples.filter((s) => String(s.status ?? '').toUpperCase() !== 'FAILED');",
     "  const vivantes = samples.slice();"),
    # 376 — le fichier Firebase redevient cherché à un chemin littéral, donc
    # invisible dès qu'un flavor le range dans son propre source set.
    ("config", "376 · le fichier Firebase redevient cherché à UN chemin",
     "    quoi: { sous: 'android/app', nom: 'google-services.json' },",
     "    quoi: 'android/app/google-services.json',"),
    # 377 — la seule issue praticable disparaît de la liste.
    ("yamlconf", "377 · la quatrième issue (goto.yaml) n'est plus nommée",
     "  #   · ✅ LA BONNE : mets la connexion dans `_subflows/goto.yaml`, qui est À TOI",
     "  #   · l'inclure — une reconnexion de plus par run, la plus simple ; À TOI"),
    # 378 — la contradiction visual+reachedBy cesse d'être câblée : la fonction
    # reste juste, plus personne ne l'appelle.
    ("config", "378 · la contradiction visuelle n'est plus câblée",
     "    const impossibles = visuelsInatteignables(config, source);",
     "    const impossibles = [];"),
    # 379 — le skill promet à nouveau que hideKeyboard est inoffensif ailleurs.
    ("skill", "379 · hideKeyboard redevient « inoffensif sur Android »",
     "⚠️ **ET « INOFFENSIF SUR ANDROID » ÉTAIT FAUX.**",
     "Sur Android le même appel est inoffensif — et voici pourquoi."),
    # 373 quater — la tête du backlog cesse d'annoncer ses points ouverts, et
    # laisse donc la phrase de vacuité de la passe du matin décrire le présent.
    ("backlog", "373 quater · la tête du backlog n'annonce plus ses points ouverts",
     '## Ce qui reste\n',
     '## Ce qui reste\n\n🔴 **3 POINTS OUVERTS.**\n'),
    ("methodoweb", "373 · le web cesse d'énoncer ses conditions d'écriture",
     "**ENV=staging** — écritures autorisées SI :",
     "**ENV=staging** — écritures autorisées sous conditions."),
    # 373 bis — le contrôleur des compteurs redevient aveugle aux points OUVERTS,
    # c'est-à-dire qu'il retrouve exactement l'angle mort qu'on vient de fermer.
    ("artefact", "373 bis · les points ouverts cessent d'être retirés du compte",
     '  const closSelonLeBacklog = depot.numeroLibre - enAvance;',
     '  const closSelonLeBacklog = depot.numeroLibre;'),
    # 373 ter — la BORNE du marqueur saute : une ouverture racontée en cours de
    # phrase serait comptée comme une ouverture, et le contrôle deviendrait
    # tolérant sans que personne l'ait décidé.
    ("artefact", "373 ter · le marqueur d'ouverture n'est plus borné au début de ligne",
     "  return [...backlog.matchAll(/^\\*\\*Ouvert le",
     "  return [...backlog.matchAll(/\\*\\*Ouvert le"),
    # ── Runs 55 et 56 · 400-405 ──────────────────────────────────────────
    # 400 — le garde de cadrage cesse de drainer : une exception laissée en
    # attente le ferait échouer au démontage, hors d'argusCheck, sans clé de dette.
    ("layout", "400 · le garde de cadrage mesure sans drainer",
     "            tester.takeException();\n            final Rect rect = tester.getRect(",
     "            final Rect rect = tester.getRect("),
    # 401 — la mesure du centre visé est débranchée : une ancre présente ET
    # active peut à nouveau désigner le mauvais rect sans que rien ne le dise.
    ("anchorsdart", "401 · la mesure du centre visé est débranchée",
     "        final List<String> horsCible = argusCentresHorsCible(tester, commande);",
     "        final List<String> horsCible = <String>[];"),
    # 402 — le publieur retrouve sa prémisse fausse : « pas d'URL, donc pas de
    # page », alors qu'il rapproche par CHEMIN et remplacerait la page voisine.
    ("report", "402 · l'absence d'URL redevient une preuve d'absence de page",
     "  if (url) {\n    return `une page existe",
     "  if (!url) return null;\n  if (url) {\n    return `une page existe"),
    # 403 — le rapport iOS reperd son bloc `metrics`, donc la taille mesurée
    # disparaît du bandeau sans qu'aucun finding ne la porte.
    ("perf", "403 · le rapport iOS reperd son bloc metrics",
     "    metrics: {\n      binarySizeMb: sizeMb,\n      binaryPath: pese.path,",
     "    metricsAbsent: {\n      binarySizeMb: sizeMb,\n      binaryPath: pese.path,"),
    # 404 — le paramètre que le §2c prescrit retombe chez les opaques, avec le
    # conseil de l'inscrire « hors périmètre ».
    ("config", "404 · le paramètre d'ancre prescrit redevient une opaque",
     " || parametreDAncre.test(nu)",
     ""),
    # 405 — la connexion cesse de refermer l'invite qu'elle fait naître : le
    # geste ne se joue plus qu'au lancement, donc trop tôt pour ces apps-là.
    # ⚠️ L'INDENTATION FAIT PARTIE DU MOTIF, et l'oublier ne rend pas la mutation
    # inerte — ce qui se verrait — mais INVALIDE, ce qui ne se voit qu'en la
    # jouant. Ce `runFlow` vit dans un `retry:`, donc à DOUZE espaces ; le motif
    # n'en portait que six, il matchait quand même (une sous-chaîne de la ligne
    # plus indentée), et le remplacement multi-ligne posait alors `condition:`
    # moins indenté que son `- assertTrue:`. Verdict « la mutation ne parse pas »,
    # rendu par le harnais sur lui-même : ni un garde vacant, ni un garde qui
    # tombe. `--check-motifs` ne pouvait pas le dire — le motif EST trouvé.
    ("login", "405 · la connexion ne referme plus l'invite qu'elle fait naître",
     "            - runFlow: dismiss-system-alerts.yaml",
     "            - assertTrue:\n                condition: \"${true}\""),
    # ── Runs 57 et 58 · 406-414 ──────────────────────────────────────────
    # 406 — le runner cesse de refuser un run sans flow : le faux vert revient,
    # et il revient exactement comme deux runs l'ont produit.
    ("run", "406 · un run sans flow redevient un succès",
     "  if (bundles.length === 0) {",
     "  if (false && bundles.length === 0) {"),
    # 407 — le message ne nomme plus les tags qui existent : il reste juste, et
    # il laisse chercher au mauvais endroit — ce qui EST le défaut.
    ("run", "407 · le message cesse de nommer les tags disponibles",
     "    lignes.push(`  Tags réellement déclarés : ${tagsDisponibles.length ? tagsDisponibles.join(', ') : '(aucun)'}`);",
     "    lignes.push('  (aucune liste)');"),
    # 407 bis — le skill recite le tag mort. Le garde dérive les deux côtés :
    # il doit tomber sans qu'on touche au code.
    ("skill", "407 bis · le skill recite un tag qu'aucun flow ne porte",
     "node scripts/argus/run.mjs --tags=smoke --no-install",
     "node scripts/argus/run.mjs --tags=journey --no-install"),
    # 408 — le gabarit repose visualCropOn sans dire que cropRoot va avec.
    ("skill", "408 · le gabarit ne dit plus que cropRoot accompagne visualCropOn",
     "# 🔴 ET L'ArgusScreen DE CET ÉCRAN DOIT DÉCLARER `cropRoot: true` (408).",
     "# 🔴 ET PENSE AU RECADRAGE (408)."),
    # 410 — la consigne dit de lire le code, et cesse de dire QUOI FAIRE ensuite.
    ("skill", "410 · le skill ne dit plus quoi faire quand le comportement est voulu",
     "**corrige\nl'assertion, pas l'app**",
     "**revois ta suite**"),
    # 413 — le balayage se limite aux SDK connus, donc manque ce qui s'envoie
    # à la main : exactement ce qu'un run a manqué.
    ("skill", "413 · le balayage des canaux sortants se limite aux SDK connus",
     "ne t'arrête pas au SDK que tu reconnais",
     "la liste ci-dessus suffit"),
    # 412 — l'attente ressort du retry : le geste redevient un ORDRE, et la
    # course que le 412 a mesurée n'est plus couverte.
    ("login", "412 · l'attente ressort du retry, la course n'est plus couverte",
     "          commands:\n            - runFlow: dismiss-system-alerts.yaml\n",
     "          commands:\n"),
    # 414 — le détecteur compte les diffs : il invente un doublon qui n'en est
    # pas, donc il crie sur un dépôt sain — et on apprend à l'ignorer.
    ("run", "414 · le détecteur de doublons compte aussi les fichiers de diff",
     "      if (!/\\.png$/i.test(e.name) || /_diff\\.png$/i.test(e.name)) continue;",
     "      if (!/\\.png$/i.test(e.name)) continue;"),
    # ── Runs 59 et 60 · 415-421 ──────────────────────────────────────────
    # 415 — le classement de la VALEUR redevient une liste de deux noms, écrite
    # au mot près, pendant que la CLÉ continue de lire un motif et `paramNames`.
    # C'est l'état exact que les deux runs ont signalé : une ancre DÉCLARÉE
    # rangée chez les opaques, avec le conseil de l'inscrire hors périmètre.
    ("config", "415 · le classement de la valeur se resserre au mot près",
     "${[CONVENTION_IDENTIFIANT, CONVENTION_PREFIXE, ...sur].join('|')}",
     "${['semanticIdentifier', 'anchorPrefix'].join('|')}"),
    # 416 a — le gabarit du titre remonte dans la première phrase du point 5 :
    # on a de quoi renseigner `artifact.title` avant d'apprendre qu'il faut
    # d'abord lire la page. C'est l'ordre exact qu'un run a suivi.
    ("skill", "416 · le gabarit du titre repasse avant la consigne de le relever",
     "5. **Garde le titre et l'icône stables** d'un run à l'autre (`artifact.title`,\n   `artifact.icon`) : c'est ainsi qu'on retrouve la page",
     "5. **Garde le titre et l'icône stables** d'un run à l'autre — `artifact.title`,\n   ou, s'il est vide, `<nom du projet> — <plateforme> — rapport QA` : c'est ainsi qu'on retrouve la page"),
    # 416 b — le journal réaffirme le pictogramme du gabarit quand rien n'est
    # déclaré : la valeur plausible revient, et avec elle la page qui change
    # d'identité.
    ("report", "416 · le journal réaffirme l'icône du gabarit",
     "  icone = String(icone ?? '').trim();",
     "  icone = String(icone ?? '').trim() || '👁';"),
    # 417 — le chemin du .app redevient un segment nu : le lecteur ne peut plus
    # savoir s'il remplace `iphonesimulator/` ou s'y ajoute, et c'est la lecture
    # qu'un run a suivie jusqu'à « AUCUN PAQUET ici ».
    ("skill", "417 · le chemin du .app redevient un segment nu",
     "`build/ios/Debug-*-iphonesimulator/Runner.app` d'un côté",
     "`Debug-*-iphonesimulator` d'un côté"),
    # 418 — le renvoi iOS ressort de la phrase : la prescription redevient
    # valable en apparence sur les deux plateformes, et le lecteur iOS court 34
    # lignes avant d'apprendre qu'elle ne le concerne pas.
    ("skill", "418 · le renvoi iOS ressort de la phrase qui prescrit",
     "`firstLaunchMs`** \u2014\n   **sur iOS, cette grandeur N'EXISTE PAS : va droit au \U0001f534 qui ferme ce point** \u2014,\n   que",
     "`firstLaunchMs`**, que"),
    # 419 a — le SKILL cesse de nommer le résidu : il reste dans le dossier des
    # références, et le suivant le découvre comme un fichier inconnu.
    ("skill", "419 · le skill ne nomme plus le résidu de la contre-épreuve",
     "`<écran>_diff.png` **à côté des références**",
     "son image de comparaison **à côté des références**"),
    # 419 b — et la preuve que le garde DÉRIVE : c'est la source qui bouge, pas
    # le skill. Le .gitignore exclut un autre nom, le skill nomme l'ancien.
    ("gitignore", "419 · le .gitignore exclut un autre résidu que celui nommé",
     "/.maestro/_baselines/**/*_diff.png",
     "/.maestro/_baselines/**/*_delta.png"),
    # 419 c — l'autre rôle : la section dit ce qu'est le résidu et ne donne plus
    # aucun geste pour l'ôter. C'est la moitié que la première version de ce
    # garde ne voyait pas, le même mot vivant dans les deux.
    ("skill", "419 · le geste qui retire le résidu disparaît",
     "find .maestro/_baselines -name '*_diff.png' -delete",
     "echo 'rien a faire'"),
    # 420 a — la clé nomme le flow et cesse de dire ce qu'il devient : « sans
    # effet » se relit comme un réglage inopérant, pas comme une dimension qui
    # passe sans mesurer.
    ("yamlconf", "420 · la clé ne dit plus que le flow passe VERT",
     "il passe VERT",
     "il n'est pas appliqué"),
    # 420 b — et la preuve que le garde DÉRIVE du runner : c'est l'avertissement
    # qui cesse de nommer le flow, et le croisement doit refuser de conclure.
    # ⚠️ Motif ancré sur la ligne 82 : la même phrase vit aussi dans le titre du
    # finding, et un motif court y matcherait deux fois.
    # ⚠️ RÉ-ANCRÉE PAR LE 466. Le message ne dit plus « tant que ce n'est pas
    # réglé » mais nomme toujours le flow : c'est ce nom-là que la mutation
    # efface, puisque c'est lui que le garde asserte.
    ("run", "420 · l'avertissement ne nomme plus le flow qu'il rend vacant",
     "si elle SUIT la locale du système, le flow i18n mesure alors celle de l\\'APPAREIL",
     "si elle SUIT la locale du système, la dimension mesure alors celle de l\\'APPAREIL"),
    # 421 a — le §2 represcrit la preuve SANS le geste : c'est l'état d'avant,
    # celui où le run devait aller chercher la commande deux cents lignes plus
    # loin, avec la table qui va avec.
    ("skill", "421 · le §2 prescrit la preuve sans le geste qui la fait",
     "unzip -p build/app/outputs/flutter-apk/app-release.apk lib/arm64-v8a/libapp.so \\\n  | grep -a -c \"<la clé>\"",
     "(voir le geste au §3g)"),
    # 421 b — l'autre moitié : le geste RESTE, la règle d'encodage s'en va. Le
    # `grep` rend alors `0` sur un littéral accentué, et ce zéro se lit comme la
    # preuve qu'on cherchait.
    ("skill", "421 · le geste reste, sa règle d'encodage s'en va",
     'La mesure qui tranche porte sur l\'AOT, et **dans les trois encodages** — un run\ny a relevé `0` partout, contre `26` avec un DSN volontairement muté :\n\n```bash\nunzip -p build/app/outputs/flutter-apk/app-release.apk lib/arm64-v8a/libapp.so \\\n  | grep -a -c "<la clé>"   # ⚠️ pipe, ne capture jamais ; latin-1 ET utf-16-le\n```\n\n⚠️ **L\'encodage n\'est pas un détail ici** : en AOT, un seul caractère accentué\nfait basculer toute la chaîne en UTF-16 et un `grep` UTF-8 rend `0` sur un texte\nprésent — c\'est-à-dire le zéro qu\'on cherchait à éviter, rendu par l\'instrument\nlui-même. La règle complète, avec la table par mode de build, est au §3g\n(« Deux contre-épreuves, une ACCENTUÉE et une ASCII ») ; fais toujours porter au\nrelevé une contre-épreuve dont l\'absence serait impossible (421).',
     'La mesure qui tranche porte sur l\'AOT — un run y a relevé `0`, contre `26`\navec un DSN volontairement muté :\n\n```bash\nunzip -p build/app/outputs/flutter-apk/app-release.apk lib/arm64-v8a/libapp.so \\\\\n  | grep -a -c "<la clé>"   # ⚠️ pipe, ne capture jamais\n```'),
    # ── Run 61 · 422-427 ─────────────────────────────────────────────────
    # 422 — le contrôle ne regarde plus que l'une des deux plateformes : la
    # parité tombe, et le défaut ne se montre jamais sur les deux à la fois.
    ("config", "422 · le contrôle du flavor perd une plateforme",
     "    const declarees = [['ios', config.build?.ios], ['android', config.build?.android]]",
     "    const declarees = [['ios', config.build?.ios]]"),
    # 423 — les deux moitiés repartagent une variable : la cible reste rouge,
    # mais plus rien ne peut dire LAQUELLE a échoué, et la dernière ligne
    # affichée redevient celle de la moitié qui passe.
    ("makefile", "423 · les deux moitiés repartagent un compteur unique",
     "$(FLUTTER) test test/argus/anchors_test.dart || suite=$$?; \\",
     "$(FLUTTER) test test/argus/anchors_test.dart || croise=$$?; \\"),
    # 424 a — le fichier cesse de prescrire la DERNIÈRE occurrence : il ne reste
    # que le piège, sans le geste qui y survit.
    ("dette", "424 · le fichier ne prescrit plus la dernière occurrence",
     "Ancre-toi donc sur la DERNIÈRE occurrence",
     "Ancre-toi donc sur la bonne occurrence"),
    # 424 b — le marqueur s'éloigne de ce qu'il ancre : le couple qui reste
    # unique cesse d'être un couple.
    ("dette", "424 · le marqueur est cité une seconde fois dans le fichier livré",
     "// ARGUS:DECLARATION — le point d'ancrage d'une édition PROGRAMMATIQUE.",
     "// une note qui parle de ARGUS:DECLARATION\n// ARGUS:DECLARATION — le point d'ancrage d'une édition PROGRAMMATIQUE."),
    # 425 — le sous-flow d'aiguillage cesse de nommer l'ancre post-connexion :
    # la mise en garde retourne vivre à neuf cents lignes de là.
    ("goto", "425 · l'aiguillage ne nomme plus l'ancre post-connexion",
     "`ARGUS_AUTH_SUCCESS`.",
     "l'ancre prévue à cet effet."),
    # 426 — l'issue disparaît : la consigne redevient inconditionnelle, et celui
    # qui n'a pas d'interlocuteur bloque ou tranche en silence.
    ("skill", "426 · l'issue cesse de dire de LAISSER ce qui ne se neutralise pas",
     "2. **Laisse le reste**, et ne va pas couper un appel dans `lib/` pour le faire",
     "2. Fais au mieux, et ne va pas couper un appel dans `lib/` pour le faire"),
    # 427 — l'arbitrage cesse de renvoyer à la mesure qui le borne : « garde
    # l'active » devient une permission permanente au lieu d'un compromis.
    ("skill", "427 · l'arbitrage perd la mesure qui le borne",
     "c'est exactement ce que `make argus-anchors`",
     "c'est ce que ton jugement"),
    # 428 — le filtre de périmètre saute : l'avertissement ressort sur une
    # plateforme que le projet ne cible pas, à chaque exécution.
    ("config", "428 · le contrôle rejuge les plateformes hors périmètre",
     "      .filter(([nom]) => platforms.includes(nom));",
     "      .filter(() => true);"),
    # ── Run 62 · 429-433 ─────────────────────────────────────────────────
    # 429 — le message d'exécution reperd le cas de la dépendance : la dimension
    # se saute et le compte de skips se lit comme un projet sans police.
    ("harness", "429 · le message de saut reperd le cas de la dépendance",
     "de police : elle vient alors d'une DÉPENDANCE. Cherche `fonts:` dans ",
     "de police : cherche `fonts:` dans "),
    # 430 — la puce reperd le canal des pixels : le secret repart en clair dans
    # la page avec le finding, masqué partout ailleurs.
    ("skill", "430 · la mise en garde reperd le canal des captures",
     "🔴 **NI DANS LES PIXELS.**",
     "⚠️ **Et fais attention aux captures.**"),
    # 431 — le relevé repasse APRÈS le build : la garde redevient vacante par
    # construction, et « PAQUET INTACT » se remet à mentir.
    ("makefile", "431 · la fraîcheur se relève de nouveau après le build",
     "\tFRESHBEFORE=\"$$(node scripts/argus/sec.mjs --print-freshness 2>/dev/null || echo inconnu)\"; \\\n\tSTART=",
     "\tSTART="),
    # 432 — la condition disparaît : la dispense redevient une suggestion nue,
    # qu'on recopie d'un projet à l'autre sans qu'elle dispense rien.
    ("yamlconf", "432 · la dispense suggérée reperd sa condition",
     "  # ⚠️ …seulement s'ils sont VERSIONNÉS (voir plus haut) : sur un projet qui\n  # utilise pourtant Firebase, ces deux entrées se sont révélées INERTES, les\n  # fichiers étant gitignorés. `git check-ignore -q <fichier>` tranche.",
     "  # ⚠️ …selon les cas."),
    # 433 — le renvoi disparaît du gabarit : la règle reste écrite cent
    # soixante-dix lignes plus haut, et personne ne la lit là où l'on cadre.
    # ⚠️ L'UNITÉ, pas une ligne : le garde protège le renvoi entier (leçon 432).
    # 435 — le motif d'ORIGINE remis : la valeur exigée sur la même ligne que
    # la clé. Le garde EXÉCUTE la commande, donc c'est bien ce qu'il asserte
    # qu'on vise ici — retirer le recollage, pas le commentaire qui l'explique.
    # 436 — le DÉCÂBLAGE, seul mode de panne que Node puisse voir. La
    # mécanique reste juste et complète ; plus personne ne l'appelle, et la
    # 439 — la sortie MUETTE remise : sur du texte dépouillé, `</table>` est
    # introuvable et le lecteur rend `[]` — « aucune rupture » — sans avoir lu
    # un seul id. C'est ce que le garde 380 asserte désormais (il exige le
    # refus), et c'est le défaut que trois republications ont porté.
    # 457 — TROIS mutations, une par moitié du garde. Le canal par défaut, le
    # canal qu'on s'ouvre, et le compteur qui revient : chacune laisse les deux
    # autres en place, donc chacune se cache derrière un texte qui a l'air complet.
    # 477 — deux bords : l'écart au faux remède retiré, et sa RAISON retirée
    # (l'interdiction reste, elle se lit alors comme une préférence de style).
    ("run", "477 · le faux remède n'est plus écarté",
     "    '  🔴 Et ne fais PAS taire cette ligne en déclarant la locale que l\\'appareil porte '",
     "    '  📌 Locale : voir la documentation. '"),
    ("run", "477 · l'interdiction reste, ce qu'elle coûte disparaît",
     "ça ne règle rien, ça retire seulement le signal. La clé dit ce que tu VEUX '",
     "évite-le. La clé dit ce que tu VEUX '"),
    # 476 — les deux moitiés du gabarit : la forme qui exporte, et la RAISON
    # sans laquelle personne ne sait quand la commande est inutile.
    ("prompts", "476 · le gabarit reperd la forme qui exporte",
     "      set -a && source <ton fichier> && set +a",
     "      source <ton fichier>"),
    ("prompts", "476 · la commande reste, sa raison disparaît",
     "un fichier de lignes `CLE=valeur` nues donne des variables de SHELL, que le\n  processus fils ne voit jamais.",
     "il faut la bonne forme."),
    # 475 — la POSITION est la variable, et c'est la seule mutation qui la
    # mesure : déplacer le relevé APRÈS la boucle laisse tout le texte en place
    # et le rend vacant. La seconde retire l'avertissement lui-même ; la
    # troisième le fait crier là où les deux CI coexistent par choix.
    # ⚠️ RÉ-ANCRÉE le 11/09 : le correctif du 478 a réécrit ce bloc, et la
    # mutation d'hier ne trouvait plus son motif — elle rendait HARNAIS, donc
    # elle ne prouvait plus rien. Elle vise toujours la POSITION du relevé, qui
    # reste la seule variable qu'un garde de texte ne peut pas voir.
    ("installeur", "475 · le relevé passe APRÈS la boucle qui pose le workflow",
     "avait_github_actions=0\nif [ -d \"$TARGET/.github/workflows\" ]; then\n  autres=$(find \"$TARGET/.github/workflows\" -type f ! -name 'argus-mobile.yml' 2>/dev/null | head -1)\n  [ -n \"$autres\" ] && avait_github_actions=1\nfi\n\ncopied=0",
     "avait_github_actions=0\n\ncopied=0"),
    # 478 — le NÔTRE compté comme un workflow du projet : l'avertissement
    # sortait une fois, puis jamais. Le motif retiré est l'exclusion elle-même.
    ("installeur", "478 · notre propre workflow recompte, et fait taire dès le 2e passage",
     "-type f ! -name 'argus-mobile.yml'",
     "-type f"),
    ("installeur", "475 · plus rien ne dit que le workflow ne tournera pas",
     "  echo \"     .github/workflows/argus-mobile.yml vient d'être posé et ne\"\n  echo \"     s'exécutera NULLE PART. Un job qui ne tourne pas ne se voit pas :\"",
     "  echo \"     .github/workflows/argus-mobile.yml a été posé.\""),
    ("installeur", "475 · l'avertissement crie aussi quand les deux CI coexistent",
     "  [ \"$avait_github_actions\" -eq 1 ] && return 0",
     "  [ \"$avait_github_actions\" -eq 2 ] && return 0"),
    # 474 — les deux moitiés séparément : le verdict (à qui appartient
    # l'exception) et l'itération (le second canal). Chacune laisse l'autre en
    # place, donc chacune se cache derrière un paragraphe qui a l'air complet.
    ("skill", "474 · l'exception de canal n'est plus attribuée au montage",
     "⚠️ **UN CANAL DE PLATEFORME MANQUANT N'EST PAS DE LA DETTE — c'est ton MONTAGE\n(474).**",
     "⚠️ **Les plugins natifs lèvent sous `flutter test`.**"),
    ("skill", "474 · le second canal n'est plus annoncé",
     "🔴 **Et fermer le premier canal en RÉVÈLE un second.**",
     "🔴 **Pose un double sur le canal.**"),
    # 473 — trois bords, un par moitié du garde : la branche NEUTRALISÉE (elle
    # est encore là, elle ne décide plus — le motif de texte y survit), le
    # paramètre rendu optionnel (un site non câblé compilerait), et un site
    # d'appel dépareillé qui cherche le doublon dans l'autre liste.
    ("harness", "473 · le paramètre redevient optionnel, donc oubliable",
     "  required List<String> listeCible,",
     "  List<String> listeCible = const <String>[],"),
    ("harness", "473 · le doublon des deux listes n'est plus distingué",
     "  if (listeCible.contains(ancre)) {",
     "  if (false && listeCible.contains(ancre)) {"),
    ("anchorsdart", "473 · un site cherche le doublon dans l'autre liste",
     "                  listeCible: screen.displaysAfterScroll,",
     "                  listeCible: screen.commandsAfterScroll,"),
    # 472 — le PÉRIMÈTRE est la variable, pas le motif : le 458 avait déjà
    # corrigé celui-ci. Retirer la racine du paquet voisin laisse la commande
    # entière, lisible et juste — elle mesure simplement le mauvais dossier.
    # C'est ce que le garde EXÉCUTE, donc c'est ce qu'on mute.
    ("skill", "472 · la commande (a) reperd la racine du paquet voisin",
     "find lib ../mon_design_system/lib -name '*.dart' -exec cat {} + | grep -v '^\\s*//' \\\n  | perl -0777 -pe 's/identifier:\\s*\\n\\s*/identifier: /g' \\\n  | grep -oE \"identifier: *[a-zA-Z_][a-zA-Z0-9_.]*\"",
     "find lib -name '*.dart' -exec cat {} + | grep -v '^\\s*//' \\\n  | perl -0777 -pe 's/identifier:\\s*\\n\\s*/identifier: /g' \\\n  | grep -oE \"identifier: *[a-zA-Z_][a-zA-Z0-9_.]*\""),
    ("skill", "472 · la découverte des voisins cesse de distinguer pub.dev d'un chemin",
     "grep -E '^\\s+path:\\s*\\.' pubspec.yaml",
     "grep -E '^\\s+path:' pubspec.yaml"),
    # 470 — l'avertissement retiré, et la commande qui le rend utile retirée.
    ("backlog", "470 · le lecteur n'est plus prévenu que ces annonces sont des traces",
     "⚠️ **« Prochain numéro libre : N » est une TRACE D'ÉPOQUE, pas un état.**",
     "⚠️ **Les annonces de numéro libre sont nombreuses.**"),
    ("backlog", "470 · l'avertissement ne dit plus comment dériver le numéro",
     "    grep -c '^### [0-9]' docs/backlog-terrain.md    # combien de points\n    grep -o '^### [0-9]*' docs/backlog-terrain.md | tail -1   # le dernier\n",
     "    (le compter à la main)\n"),
    # 469 — la POSITION est la variable : déplacer l'annonce après le lancement
    # la rend inutile sans retirer une ligne, ce qu'un garde de texte ne voit pas.
    ("run", "469 · le runner retait le silence qui suit",
     "  if (!dryRun && !verbose) {\n    log('  ⏳ ce flow ne rendra plus une ligne avant sa fin (sortie capturée) — '\n      + 'compte quelques minutes. N\\'écris pas de boucle de sondage : ajoute '\n      + 'ARGS=\"--verbose\" pour suivre Maestro en direct.');\n  }\n",
     ""),
    ("skill", "469 · le skill reperd la consigne de ne pas sonder",
     "🔴 **`argus-run` NE DIT RIEN PENDANT UN FLOW, ET C'EST NORMAL — n'écris pas de\nboucle de sondage** (469).",
     "🔴 **`argus-run` prend du temps.**"),
    # 468 — deux bords : plus de commande du tout, et une commande qui reprend
    # la CLÉ (donc qui ne matche rien, donc qui rend 0 sur zéro test).
    ("harness", "468 · le message de dette reperd sa commande de rejeu",
     "        \"      flutter test test/argus/ --plain-name '${key.split(' · ').first}'\\n\\n\"\n",
     ""),
    ("harness", "468 · la commande de rejeu reprend la clé, donc ne matche rien",
     "--plain-name '${key.split(' · ').first}'",
     "--plain-name '$key'"),
    # 467 — la clé lue mais sans effet : le cas « pire qu'absente ».
    ("config", "467 · la commande déclarée ne prime plus sur la dérivation",
     "  if (declaree) return flutterCommandIn(declaree, pinned);\n",
     ""),
    ("yamlconf", "467 · le gabarit reperd la forme de la note et sa source",
     "  #     # construit par : <commande>  (source : <fichier §>)\n",
     ""),
    # 466 — la phrase d'avant, remise mot pour mot : elle affirme au lieu de
    # conditionner, ce qui est exactement ce que le garde asserte.
    ("run", "466 · l'avertissement de locale réaffirme au lieu de conditionner",
     "    '  ⚠️ Ce que ça coûte DÉPEND de ton application, et ce script ne peut pas le savoir : '",
     "    '  ⚠️ Tant que ce n\\'est pas réglé, le flow i18n est vert quoi que tu déclares : '"),
    ("run", "466 · le lecteur n'a plus de quoi trancher entre les deux cas",
     "    '  Le tell est dans ton propre verdict : des assertions dans TA langue qui passent sur '\n      + 'un appareil réglé sur une AUTRE signent une application qui épingle.',\n",
     ""),
    # 465 — les deux bords : plus de filtre du tout, et un filtre qui dispense
    # tout le monde. Le second est le plus grave, donc il a sa mutation.
    ("sec", "465 · le débogage redevient jugé comme la production",
     "  const publiees = variantes.filter(([path]) => variantePubliee(basename(dirname(path))));\n  const findings = publiees.flatMap",
     "  const findings = variantes.flatMap"),
    ("sec", "465 · le filtre s'élargit et dispense les flavors publiables",
     "  return !['debug', 'test', 'androidTest', 'testDebug', 'androidTestDebug'].includes(String(sourceSet));",
     "  return sourceSet === 'main' || sourceSet === 'release';"),
    # 464 — la clé retirée de la doc, c'est-à-dire le gabarit d'avant. Le garde
    # dérive du CODE, donc il rougit sans qu'on ait touché au contrôle.
    ("yamlconf", "464 · la doc reperd la clé du câblage par convention",
     "#       motif: mon_plugin                   # FACULTATIF — voir juste en dessous\n",
     ""),
    ("yamlconf", "464 · la doc reperd la forme qui cherche un NOM sous un dossier",
     "#       nom: service.json\n",
     ""),
    # 463 — trois barreaux, trois mutations : la décision, le câblage, la place.
    ("run", "463 · le nettoyage des orphelins ne filtre plus rien",
     "    .filter((n) => !attendus.has(n));",
     "    .filter(() => false);"),
    ("run", "463 · la décision est déclarée mais plus appelée",
     "    for (const f of junitsVisuelsOrphelins(readdirSync(reportDir), visualScreens)) {\n      rmSync(join(reportDir, f), { force: true });\n    }\n",
     ""),
    ("run", "463 · le nettoyage emporte AUSSI le junit des flows",
     "    .filter((n) => /^report\\.visual-.+\\.junit\\.xml$/.test(n))\n",
     "    .filter((n) => /\\.junit\\.xml$/.test(n))\n"),
    # 462 — la phrase retirée, c'est-à-dire le skill d'avant. La RÈGLE, elle,
    # est mutée par le 320 : la muter ici serait le doublon que ce point évite.
    ("skill", "462 · le skill retait la règle devices[]/platforms[]",
     "🚨 **ET `devices[]` DOIT SUIVRE `platforms[]` — l'outil le REFUSE, le skill ne le\ndisait pas** (462).",
     "🚨 **Le périmètre est assumé.**"),
    ("skill", "462 · le skill ne dit plus ce que fait un retrait partiel",
     "item : elles **fusionnent silencieusement dans l'entrée suivante** au lieu de\nlever, et tu obtiens un `ios-sim` qui porte `model: pixel_6`.",
     "item.",),
    # 461 — le second passage retiré, c'est-à-dire la séquence d'avant.
    ("skill", "461 · l'étage 1 n'est plus rafraîchi avant le rapport",
     "make argus-guards      # ⚠️ ET OUI, UNE SECONDE FOIS — voir plus bas dans ce §3g\n",
     ""),
    # ⚠️ Et l'autre moitié : rafraîchir LOIN de ce qui lit ne vaut rien. Le
    # garde exige l'adjacence, donc on l'éloigne de deux commandes.
    ("skill", "461 · le rafraîchissement s'éloigne de ce qui le lit",
     "make argus-sec         # MASVS statique sur le binaire — sans device, quelques secondes\nmake argus-sca         # CVE des dépendances — sans device ; saute si `osv-scanner` manque\nmake argus-guards      # ⚠️ ET OUI, UNE SECONDE FOIS — voir plus bas dans ce §3g\n",
     "make argus-guards      # ⚠️ ET OUI, UNE SECONDE FOIS — voir plus bas dans ce §3g\nmake argus-sec         # MASVS statique sur le binaire — sans device, quelques secondes\nmake argus-sca         # CVE des dépendances — sans device ; saute si `osv-scanner` manque\n"),
    # 460 — l'ordre est la variable, donc c'est lui qu'on remet à l'envers. Il
    # suffit d'ajouter une attente d'animation AVANT : `indexOf` prend la
    # première, et le sas redevient absorbé exactement comme il l'était.
    ("launchclean", "460 · la stabilisation repasse devant le chronomètre",
     "\n- runFlow:\n    when:\n      true:",
     "\n- waitForAnimationToEnd:\n    timeout: 5000\n\n- runFlow:\n    when:\n      true:"),
    ("run", "460 · le rapport ne promet plus que le splash est compris",
     "attente de l\\'écran de départ exploitable (splash et init compris)",
     "attente de l\\'écran de départ exploitable"),
    # 459 — deux moitiés, deux cibles : ce que le gabarit MONTRE, et ce que le
    # parseur DIT. La première remet exactement la forme qui a coûté trois runs.
    ("yamlconf", "459 · l'exemple d'acquittement redevient replié",
     "  #     why: vit dans src/debug/AndroidManifest.xml, jamais fusionné en release",
     "  #     why: vit dans src/debug/AndroidManifest.xml, jamais fusionné en\n  #          release — vérifié par aapt2 dump badging sur l'APK publié"),
    ("config", "459 · le parseur reperd la distinction des deux causes",
     """      const suite = L[i + 1].text.trim();
      const structure = /^-\\s/.test(suite) || /^[^\\s:#]+\\s*:/.test(suite);
      throw new YamlSubsetError(file, item.line, item.raw, structure
        ? 'valeur sur la ligne ET bloc indenté en dessous'
        : 'valeur REPLIÉE sur la ligne suivante — ici une valeur tient sur UNE ligne : '
          + 'raccourcis-la plutôt que de la replier, elle est faite pour être relue');""",
     "      throw new YamlSubsetError(file, item.line, item.raw, 'valeur sur la ligne ET bloc indenté en dessous');"),
    # ⚠️ L'autre sens : un remède qui rendrait TOUT « replié » ne distinguerait
    # plus rien, et c'est le jumeau du garde qui le voit.
    ("config", "459 · tout devient une valeur repliée, plus rien ne distingue",
     "      const structure = /^-\\s/.test(suite) || /^[^\\s:#]+\\s*:/.test(suite);",
     "      const structure = false;"),
    # 458 — les deux commandes s'éprouvent SÉPARÉMENT, parce qu'elles se
    # trompent différemment : (a) cesse de découvrir, (b) cesse de compter.
    ("skill", "458 · (a) fige le nom du paramètre au lieu de le découvrir",
     '  | grep -oE "identifier: *[a-zA-Z_][a-zA-Z0-9_.]*" | sort | uniq -c',
     '  | grep -oE "identifier: *semanticIdentifier" | sort | uniq -c'),
    ("skill", "458 · (b) reperd ce que le formateur replie",
     '  | perl -0777 -pe \'s/<NOM>:\\s*\\n\\s*/<NOM>: /g\' | grep -c "<NOM>: *\'"',
     '  | grep -c "<NOM>: *\'"'),
    # ⚠️ Celle-ci ne casse aucun COMPTE : la commande figée rend encore 3 sur la
    # fixture. Ce qu'elle casse est la portabilité — un nom de paramètre gravé
    # est faux au projet suivant, et seul le gabarit `<NOM>` le dit.
    ("skill", "458 · (b) grave un nom de paramètre dans la commande",
     '\'s/<NOM>:\\s*\\n\\s*/<NOM>: /g\' | grep -c "<NOM>: *\'"',
     '\'s/semanticIdentifier:\\s*\\n\\s*/semanticIdentifier: /g\' | grep -c "semanticIdentifier: *\'"'),
    ("skill", "457 · le §5 reperd le canal des artefacts par défaut",
     "Maestro écrit dans `--test-output-dir` un `commands.json` par\n  flow, qui contient",
     "Maestro écrit un journal par\n  flow, qui contient"),
    ("skill", "457 · le §5 reperd le canal que l'agent s'ouvre lui-même",
     "  🔴 **NI CONTRE TOI-MÊME.** Une commande de diagnostic (`ps aux`, `pgrep -fl`)\n  recopie ces valeurs dans **ton propre compte rendu**, qui est publié. Un run en\n  aveugle s'y est vu et l'a signalé lui-même : c'est le seul canal que le\n  masquage ne peut pas fermer, parce que c'est toi qui l'ouvres.\n",
     ""),
    ("skill", "457 · le compteur de canaux revient en toutes lettres",
     "🔴 **NI DANS LES PIXELS.** `label:` ne protège que la console et les rapports :",
     "🔴 **NI DANS LES PIXELS.** `label:` protège trois canaux et pas le quatrième :"),
    # 456 — le paragraphe reperd l'erreur jumelle. La première moitié, celle
    # que le garde 425 mesure sur les flows, reste écrite : le texte a l'air
    # complet, et c'est exactement ce qui a fait écrire la condition à moitié.
    ("skill", "456 · le §2c-ter reperd l'erreur jumelle de l'aiguillage",
     "⚠️ **ET L'ERREUR JUMELLE COÛTE AUTANT : SE CONNECTER ALORS QUE L'ÉCRAN DEMANDÉ\nEST L'ÉCRAN DE CONNEXION** (point 456).",
     "⚠️ **Remarque** (point 456)."),
    # 455 — le paragraphe reperd le cas « en ligne ». Le cas volumineux, qui
    # est juste, reste écrit : rien ne signale que l'autre moitié a disparu.
    ("skill", "455 · le §3g-bis reperd le cas de la page rendue en ligne",
     "\n   ⚠️ **ET SI ELLE REVIENT EN LIGNE, IL N'Y A AUCUN CHEMIN À PASSER** (point",
     "\n   ⚠️ **Note complémentaire** (point"),
    # 454 — la section reperd la mise en garde sur le junit réécrit. Le reste de
    # la contre-épreuve tient toujours : rien d'autre ne rougit, et c'est ainsi
    # qu'un run a tiré du fichier un verdict qui n'était pas le sien.
    ("skill", "454 · la contre-épreuve reperd l'avertissement sur le junit",
     "⚠️ **ET LIS LE VERDICT APRÈS, JAMAIS PENDANT — le junit est RÉÉCRIT à chaque\ninvocation** (point 454).",
     "⚠️ **Note.**"),
    # 453 — l'exemple reperd sa mise en garde. La prose voisine continue de dire
    # que les deux remèdes s'excluent : rien d'autre ne rougit, et c'est
    # exactement ce qui a fait poser les deux à un run.
    ("skill", "453 · l'exemple ✅ reperd l'interdiction de container",
     "// ⚠️ PAS de `container: true` ICI (point 453). La recette de la racine d'écran\n//    l'exige, celle-ci l'interdit — et les combiner rend l'ancre INERTE. Un run\n//    en aveugle a lu les deux recettes, posé les deux, et perdu QUATRE ancres.\n//    Sur l'enfant, l'ancre se greffe au nœud que le composant publie déjà ; lui\n//    en fabriquer un second la coupe de l'action.\n",
     ""),
    # 452 — le filtre reperd sa seconde barre : `///` ne retire que le dartdoc,
    # et le code mis en commentaire ordinaire redevient compté. Le garde 435
    # exécute la commande, donc c'est le CHIFFRE qui bouge, pas le motif.
    ("skill", "452 · le compteur reperd les commentaires ordinaires",
     "| grep -v '^\\s*//' \\\n  | perl -0777 -pe 's/identifier:\\s*\\n\\s*/identifier: /g' | grep -c \"identifier: *'\"",
     "| grep -v \"^\\s*///\" \\\n  | perl -0777 -pe 's/identifier:\\s*\\n\\s*/identifier: /g' | grep -c \"identifier: *'\""),
    # 451 — LA PARITÉ, une mutation par côté. Retirer la forme d'un seul des
    # deux textes laisse l'autre juste : c'est ce qui rend l'écart invisible.
    ("run", "451 · le runner reperd la troisième forme au moment de l'échec",
     "    + ` ou UNE AUTRE APP au premier plan, posée sur le même appareil par un`\n",
     ""),
    ("skill", "451 · le SKILL reperd la troisième forme, le runner la garde",
     " **Troisième forme, et elle ne vient pas de ton\n   projet** : une AUTRE APPLICATION au premier plan, installée sur le même\n   appareil par un travail voisin — `adb shell pm list packages -3` croisé avec\n   le `lastUpdateTime` de `dumpsys package` la nomme en une commande, et un run\n   l'a rencontrée parce qu'un émulateur avait été libéré pour la mémoire sans\n   que l'autre session sache qu'elle n'avait plus d'appareil à elle. Dans les\n   trois cas",
     " Dans les deux cas"),
    # 449 — la note disparaît de la séquence. Le Makefile continue de
    # l'expliquer pour `argus-run` : le lecteur du SKILL, lui, ne l'a plus.
    ("skill", "449 · la séquence reperd le sens du code de sortie d'une dimension",
     "\n⚠️ **`make: *** [argus-perf] Error 1` n'est pas une panne, c'est le verdict** (449) : la sortie\nd'une dimension vient de ses findings (`exitCodeFor`) — **2** sur `blocker`/`critical`, **1** sur `major`, **0** sinon.\n",
     "\n"),
    # 448 — la précision de commande disparaît de chacun des deux textes. Le
    # paragraphe reste juste (le croisement EST dans argus-anchors) : c'est
    # exactement ce qui rend le défaut invisible à la relecture.
    ("types", "448 · le dartdoc reperd la commande qui mesure la position",
     "  /// 📌 DEUX COMMANDES, ET CE PARAGRAPHE N'EN NOMMAIT QU'UNE (point 448). Le\n  /// croisement ci-dessus tourne dans `make argus-anchors` ; **la mesure de\n  /// position, elle, vit dans `layout_test.dart`, donc dans\n  /// `make argus-guards`**",
     "  /// 📌 Le croisement ci-dessus tourne dans `make argus-anchors`"),
    ("methodo", "448 · la méthodologie reperd la distinction des deux suites",
     "position** vit dans `layout_test.dart`, donc dans **`make argus-guards`** —",
     "position** vit dans un test de l'étage 1 —"),
    # 447 — LES DEUX MOITIÉS, une mutation chacune. La première est le remède
    # qui PARAÎT juste : poser le SafeArea dans le harnais. Il ferait passer
    # toute racine sous l'inset, y compris celle posée au-dessus du SafeArea de
    # son écran — le garde `cropRoot` deviendrait vacant sans un mot.
    ("harness", "447 · le harnais applique les insets, et vide le garde cropRoot",
     "          child: Material(type: MaterialType.transparency, child: child),",
     "          child: SafeArea(\n            child: Material(type: MaterialType.transparency, child: child),\n          ),"),
    # La seconde remet la promesse fausse, mot pour mot telle qu'elle était.
    ("types", "447 · le dartdoc repromet des marges système jamais appliquées",
     "  /// pose lui-même la surface (un `Material` transparent), la police et le\n  /// thème.",
     "  /// pose lui-même la surface, la police et les marges système."),
    # 446 — l'appelant reperd le HTML : il repasse le texte dépouillé au lecteur
    # d'ordre, qui LÈVE depuis le 439. L'outil redevient inutilisable — et c'est
    # bien une panne, pas un faux vert : le garde doit voir la différence.
    ("checkartefact", "446 · le contrôle de la page reperd le HTML",
     "const ruptures = rupturesDOrdreDu(html);",
     "const ruptures = rupturesDOrdreDu(texte);"),
    # 443 — la carte reperd le statut ET la raison : le rendu redevient
    # identique pour un finding assumé et un finding ouvert, et
    # `acknowledgedWhy` ne quitte plus le JSON.
    ("report", "443 · l'acquittement redevient invisible sur la page",
     """      ${ack ? `<div class="ack">✔ acquitté — ${esc(f.acknowledgedWhy || 'sans raison déclarée')}</div>` : ''}\n""",
     ""),
    # 442 — le filtre reperd son relevé : une entrée mal formée est de nouveau
    # écartée sans un mot. ⚠️ On mute la VALEUR RENDUE, pas la ligne d'appel :
    # le motif reste en place, seul le contenu disparaît.
    ("config", "442 · l'entrée mal formée se réécarte en silence",
     """  const malFormees = declarees\n    .map((a, i) => {\n      if (a && String(a.id ?? '').trim() !== '') return null;\n      const vue = typeof a === 'string' ? `« ${a} »` : JSON.stringify(a);\n      return `entrée ${i + 1} : ${vue}`;\n    })\n    .filter((x) => x !== null);\n""",
     "  const malFormees = [];\n"),
    # 441 — la troisième clé reperd sa résolution : `icon` retombe derrière
    # `url` et `title`, exactement là où deux vagues de correctifs l'avaient
    # laissée. Le journal réannonce alors « [object Object] ».
    ("config", "441 · l'icône reperd sa résolution par plateforme",
     "  return { url: choisir(a.url), title: choisir(a.title), icon: choisir(a.icon) };",
     "  return { url: choisir(a.url), title: choisir(a.title) };"),
    ("artefact", "439 · le contrôle d'ordre se retait sur zéro id",
     "  const fin = texte.indexOf('</table>', debut);\n  if (fin === -1) {\n    throw new Error(\n      'rupturesDOrdreDu : aucun `</table>` après le titre du registre. Ce lecteur attend le HTML '\n      + 'de la page, pas le texte rendu par `texteDeLaPage`.',\n    );\n  }\n",
     "  const fin = texte.indexOf('</table>', debut);\n  if (fin === -1) return [];\n"),
    # 438 — la section retirée : un run sans constat n'a plus d'endroit où
    # être écrit, et le compteur de la page retombe au dernier run À
    # CONSTAT. C'est le défaut d'origine, et c'est ce que le garde asserte —
    # la section ET sa raison, sur le fichier réel.
    ("backlog", "438 · un run sans constat reperd son endroit",
     "## 🔴 LES RUNS QUI N'ONT RIEN RENDU — et pourquoi ils s'écrivent ICI\n\nUn run qui ne rend aucun constat n'a, par construction, **aucun point à inscrire\nplus haut**. Il ne laisse donc aucune trace dans ce fichier — alors que c'est\nexactement le run qui décide de la **sortie**.\n\n⚠️ **Ne supprime pas cette section parce qu'elle a l'air vide de contenu.** Le\ncompteur de la page publiée dérive le numéro du dernier run **de ce fichier**\n(`dernierRunDu`, `tools/artefact-compteurs.mjs`) : sans cette liste, la page\nannonce éternellement le dernier run *à constat*, et le seul run qui puisse\nouvrir la sortie est précisément celui que l'instrument ne voit pas. Mesuré le\n09/09 : `runs: 64` alors que le **run 65** était archivé et contrôlé.\n\n📌 L'instrument, lui, n'était pas en cause — vérifié en l'exécutant : il lit un\nnuméro cité en prose aussi bien que dans un titre de lot. C'est la **source** qui\nétait incomplète, et rien ne réclamait de la compléter.\n\n| le run | date | plateforme | ce qu'il a établi |\n|---|---|---|---|\n",
     ''),
    # 437 — le TROISIÈME terme retiré : on revient au 436 tel qu'il était,
    # juste sur ce qu'il compare et aveugle au harnais qui charge un autre
    # nom. C'est ce que le garde ASSERTE (le verdict « ne charge PAS »), et
    # le reste de la fonction continue de compiler — un `return null` suit.
    ("harness", "437 · la résolution de police reperd son troisième terme",
     '  // 2. Le HARNAIS : ce que la suite charge réellement. Ne dépend d\'aucun\n  //    manifeste, donc se contrôle toujours.\n  final List<String> nonChargees =\n      demandeesParLeTheme\n          .where((String f) => !chargeesParLeHarnais.contains(f))\n          .toList()\n        ..sort();\n  if (nonChargees.isNotEmpty) {\n    return "Le thème de l\'app demande ${nonChargees.join(\', \')}, "\n        "qu\'argusFonts ne charge PAS. Familles chargées : "\n        \'${chargeesParLeHarnais.isEmpty ? \'(aucune)\' : chargeesParLeHarnais.join(\', \')}.\'\n        "\\n⚠️ L\'application, elle, va peut-être très bien : c\'est la SUITE qui "\n        \'mesure faux. Une famille que le thème demande sans qu\\\'elle soit \'\n        \'chargée retombe sur la police de `flutter_test` — un carré d\\\'un \'\n        \'cadratin par glyphe, environ deux fois plus large.\'\n        \'\\n📌 Déclare dans argusFonts la famille TELLE QUE LE THÈME LA DEMANDE, \'\n        \'préfixe de paquet compris, et fais-en argusFontFamily.\';\n  }\n',
     ''),
    # suite de disposition redevient muette sur la police qu'elle mesure.
    # ⚠️ Les deux lignes ensemble : retirer l'appel seul ne compilerait pas,
    #    et une mutation qui casse le build rougit pour une autre raison.
    ("layout", "436 · la résolution de police n'est plus câblée",
     "    final String? defaut = argusFontResolutionIssue();\n    expect(defaut, isNull, reason: defaut ?? '');\n",
     ''),
    ("skill", "435 · le comptage reperd ce que le formateur replie",
     '  | perl -0777 -pe \'s/identifier:\\s*\\n\\s*/identifier: /g\' | grep -c "identifier: *\'"',
     '  | grep -c "identifier: *\'"'),
    # 434 — le SILENCE d'origine, remis. La branche du cas zéro est ce que le
    # garde asserte (il APPELLE `notesDePreuve` et lit ce qui revient) : la
    # retirer rend une page nue sans un mot, exactement comme avant.
    # ⚠️ Viser la branche, pas le dartdoc qui l'explique : muter le commentaire
    # laisserait le garde vert sur un garde parfaitement bon.
    ("report", "434 · la page sans capture se retait, et c'est le run vert",
     "  if (evidence !== 'none' && !shot.embedded && !shot.tooBig && !shot.missing && !shot.filtered) {\n    notes.push(\n      `aucune capture malgré artifact.evidence: ${evidence} — une preuve `\n      + \"s'attache à un finding, et aucun finding n'en portait\",\n    );\n  }\n",
     ""),
    # ── 482 — la contre-épreuve a un couple, pas seulement un motif ──────────
    ("skill", "482 · la contre-épreuve reperd le FICHIER de son couple",
     "joue sur `ArgusScreen(` **dans `harness.dart`**",
     "joue sur `ArgusScreen(`"),
    ("skill", "482 · la contre-épreuve reperd le MOTIF de son couple",
     "⚠️ **ET LA CONTRE-ÉPREUVE A UN COUPLE, PAS SEULEMENT UN MOTIF (482).** Elle se\njoue sur `ArgusScreen(` **dans `harness.dart`**",
     "⚠️ **ET LA CONTRE-ÉPREUVE A UN COUPLE, PAS SEULEMENT UN MOTIF (482).** Elle se\njoue sur le motif prescrit **dans `harness.dart`**"),
    # ── 480 — l'avertissement injoignable depuis l'état qu'il condamne ───────
    ("run", "480 · la note de locale ne parle plus dans l'état aligné",
     "  const note = aligned",
     "  const note = false"),
    ("run", "480 · la note parle aussi quand rien n'est déclaré",
     "  const aligned = Boolean(declared) && Boolean(onDevice)\n    && normaliser(onDevice) === normaliser(declared);",
     "  const aligned = normaliser(onDevice) === normaliser(declared);"),
    ("run", "480 · le relevé de locale n'entre plus dans le rapport",
     "    locale: {\n      declared: alignementLocale.declared,\n      onDevice: alignementLocale.onDevice,\n      aligned: alignementLocale.aligned,\n    },",
     ""),
    ("run", "480 · la note n'est plus appelée par le runner",
     "    if (avertissementsLocale.length === 0 && alignementLocale.note) log(alignementLocale.note);",
     ""),
    # ── 479 — une mesure traversée par une attente n'est pas une mesure ──────
    # Un motif par FAIT, jamais une alternative : le 477 a coûté deux gardes
    # nés avec un `A|B` dont chaque mutation ne retirait qu'un côté.
    ("run", "479 · le marquage d'absorption ne marque plus rien",
     "    const absorbed = floorMs > 0 && precedeMs >= floorMs && ms < floorMs;",
     "    const absorbed = false;"),
    ("run", "479 · ce qui a attendu avant la mesure n'est plus relevé",
     "    const precedeMs = Number.isFinite(debutMesure) && Number.isFinite(finLancement)\n      ? Math.max(0, Math.round(debutMesure - finLancement))\n      : 0;",
     "    const precedeMs = 0;"),
    ("run", "479 · le budget absorbé ne se dit que si TOUT l'est",
     "  if (absorbees.length > 0) {",
     "  if (absorbees.length > 0 && mesures.length === 0) {"),
    ("run", "479 · une mesure absorbée recompte dans le budget",
     "  const mesures = vivantes.filter((s) => !s.absorbed);",
     "  const mesures = vivantes.slice();"),
    ("skill", "433 · le cadrage reperd son renvoi à la règle de l'ancre d'état",
     "    #   ⚠️ Donc si la racine PHYSIQUE est partagée entre plusieurs états, ce\n    #   n'est pas elle qu'on cadre : c'est l'ancre d'ÉTAT qui sert d'`anchor:`\n    #   (et la racine commune passe en `displays:`) — la règle est plus haut,\n    #   au cinquième écart d'ancrage. Le plein écran, lui, embarquerait\n    #   l'horloge.\n",
     ""),
    # 485 — DEUX barreaux, et il les faut tous les deux : la VALEUR que la
    # construction rend, et le CÂBLAGE qui l'alimente. Muter la seule ligne
    # d'appel laisserait le garde de valeur vert, et muter la seule valeur
    # laisserait le garde de câblage vert : chacun ne voit que sa moitié.
    ("sca", "485 · le préfixe FVM disparaît de la valeur rendue",
     "    ? { bin: 'fvm', args: ['flutter', ...sous], label: 'fvm flutter' }",
     "    ? { bin: runner, args: sous, label: runner }"),
    ("sca", "485 · le câblage fige la décision au lieu de lire usesFvm()",
     "  const { bin, args, label } = pubOutdatedCommand(detectTools(['flutter']).flutter.present, usesFvm());",
     "  const { bin, args, label } = pubOutdatedCommand(detectTools(['flutter']).flutter.present, false);"),
    # 486 — TROIS barreaux : la décision, son câblage, et le flow livré. Chacun
    # ne voit que sa moitié — muter la seule décision laisse le garde de câblage
    # vert, et retirer la condition du YAML ne touche ni l'une ni l'autre.
    ("run", "486 · la coupure des animations redevient exigée partout",
     "  return platform === 'android';",
     "  return true;"),
    ("run", "486 · le câblage fige l'applicabilité au lieu de la dériver",
     "    ARGUS_ANIMATIONS_APPLICABLE: String(animationsApplicables(platform)),\n  });",
     "    ARGUS_ANIMATIONS_APPLICABLE: 'true',\n  });"),
    ("anims", "486 · le sous-flow reperd sa condition de plateforme",
     "    when:\n      true: \"${typeof ARGUS_ANIMATIONS_APPLICABLE === 'undefined' || ARGUS_ANIMATIONS_APPLICABLE === 'true'}\"\n",
     "    when:\n      true: \"${true}\"\n"),
    # 488 — la CLASSE. Cette mutation ne vise pas un site mais le PHÉNOMÈNE :
    # elle réintroduit une invocation NUE, celle que le garde total doit
    # dénoncer où qu'elle apparaisse. C'est la forme qu'aurait eue le 485 le
    # jour du 481, et qu'aucun garde écrit sur `flutterCommandIn` ne voyait.
    ("sca", "488 · une invocation NUE de flutter réapparaît quelque part",
     "  const res = sh(bin, args, { maxBuffer: 32 * 1024 * 1024 });",
     "  const res = sh('flutter', args, { maxBuffer: 32 * 1024 * 1024 });"),
    # ── 490 · le découpage de la passe de mutation ──────────────────────────
    # Trois façons de vider le garde, une par assertion, et toutes les trois
    # laissent une CI qui passe au vert.
    # ⚠️ Retirer l'installation ne casse RIEN de visible : le harnais cesse
    # simplement de vérifier les workflows mutés, et une mutation qui casserait
    # le fichier se lirait ensuite comme un garde qui tombe. Du câblage pur.
    ("ciplugin", "490 · le job cesse de fournir de quoi vérifier les workflows",
     "        run: python3 -m pip install --quiet --break-system-packages pyyaml\n",
     "        run: true  # rien à installer\n"),
    ("ciplugin", "490 · l'argument de tranche cesse de venir ENTIER de la matrice",
     "        run: python3 tools/mutate-run-guards.py --shard=${{ matrix.tranche }}\n",
     "        run: python3 tools/mutate-run-guards.py --shard=${{ matrix.tranche }}/10\n"),
    # ⚠️ Le dénominateur qui ne suit plus la liste : neuf tranches sur dix, donc
    # une part que personne ne joue pendant que les neuf autres passent au vert
    # sur la leur. C'est le mode de panne muet du découpage.
    ("ciplugin", "490 · un dénominateur cesse de suivre la longueur de la matrice",
     "        tranche: ['1/10', '2/10', '3/10', '4/10', '5/10',\n                  '6/10', '7/10', '8/10', '9/10', '10/10']",
     "        tranche: ['1/9', '2/9', '3/9', '4/9', '5/9',\n                  '6/9', '7/9', '8/9', '9/9', '10/9']"),
    # ⚠️ Celle-ci ne touche NI le workflow NI le garde : elle casse la partition
    # dans le harnais, là où aucune relecture du YAML ne peut la voir. C'est le
    # quatrième barreau du garde — celui qui DEMANDE au lieu de recalculer.
    # ⚠️ ET SON MOTIF TIENT SUR DEUX LIGNES, ce qui n'est pas du confort : depuis
    # que ce fichier est sa PROPRE cible, un motif d'une seule ligne apparaît
    # deux fois — dans la fonction visée, et dans la déclaration qu'on lit ici.
    # Le harnais l'exige unique, donc il l'aurait rendue INERTE, c'est-à-dire
    # une mutation qui ne prouve rien. Un vrai saut de ligne ne peut pas se
    # trouver dans cette déclaration-ci, où il s'écrit échappé.
    # ── 492 · les fences des documents livrés ──────────────────────────────
    # ⚠️ Elle reproduit le défaut EXACT qui a été trouvé : une fence de fermeture
    # à qui on donne une info-string. Elle a l'air d'une fermeture, elle n'en est
    # pas une en CommonMark, et le bloc court alors jusqu'à la suivante en
    # avalant la prose. Le fichier reste un Markdown parfaitement valide.
    ("skill", "492 · une fence de fermeture se met à porter un langage",
     "  Non enveloppables  : <W>  ← des CALL-SITES, pas des composants (voir plus bas)\n```\n",
     "  Non enveloppables  : <W>  ← des CALL-SITES, pas des composants (voir plus bas)\n```text\n"),
    ("mutateur", "490 · la partition laisse un trou que le workflow ne montre pas",
     "    debut = (k - 1) * base + min(k - 1, reste)\n    taille = base + (1 if k <= reste else 0)",
     "    debut = (k - 1) * base\n    taille = base + (1 if k <= reste else 0)"),
]


def sh(args, cwd=ROOT):
    return subprocess.run(args, cwd=str(cwd), capture_output=True, text=True)


def digest(cible):
    return hashlib.sha256(cible.read_bytes()).hexdigest()[:12]


def restaure(cle, attendu):
    cible = CIBLES[cle]
    sh(["git", "checkout", "--", str(cible.relative_to(ROOT))])
    obtenu = digest(cible)
    if obtenu != attendu:
        print(f"\n✖ RESTAURATION ÉCHOUÉE ({obtenu} ≠ {attendu}) — arbre laissé muté, on s'arrête.")
        sys.exit(1)


def restaure_tout(propres):
    """Ramène chaque cible à son état propre — le filet des sorties BRUTALES.

    ⚠️ CE FILET MANQUAIT, ET LA PASSE COMPLÈTE NE TIENT PLUS DANS UNE SEULE
    EXÉCUTION. 190 mutations dépassent la limite de temps d'une commande : le
    processus est alors TUÉ entre l'écriture d'une mutation et sa restauration,
    et le fichier reste muté dans l'arbre — sans un mot, exactement comme
    l'interruption d'un `--help` l'avait fait avant que les arguments soient
    lus. Vécu le 01/09 : `run.mjs` retrouvé muté après un timeout de dix
    minutes, et rien dans la sortie ne le disait.

    La boucle restaure déjà après chaque mutation ; ce filet couvre ce qu'elle
    ne peut pas couvrir — être interrompue au milieu.
    """
    for cle in CIBLES:
        cible = CIBLES[cle]
        if digest(cible) != propres[cle]:
            sh(["git", "checkout", "--", str(cible.relative_to(ROOT))])
            etat = "restauré" if digest(cible) == propres[cle] else "TOUJOURS MUTÉ"
            print(f"  · {cible.name} : {etat}")


def textes_depuis_head():
    """Le contenu COMMITÉ de chaque cible, en un seul appel git.

    ⚠️ POURQUOI HEAD ET NON L'ARBRE, et pourquoi ce n'est pas une commodité.
    Ce contrôle est joué par un garde de la suite, et la suite est rejouée sous
    CHAQUE mutation. En lisant l'arbre, il voit le motif que le harnais vient de
    remplacer, se déclare donc inerte, et rougit — à chaque fois. Or le harnais
    décide TOMBE/VACANT sur le seul code de retour de la suite : il y avait
    toujours un rouge, donc il rendait TOMBE quel que soit l'état du garde qu'on
    croyait éprouver. Un harnais qui approuve tout ressemble à un dépôt sain.
    Mesuré le 14/09 sur deux cibles distinctes : deux tests rouges sous une
    mutation ordinaire, le garde visé ET celui-ci.

    Lire HEAD est par ailleurs la sémantique du harnais lui-même, qui restaure
    par `git checkout` : le contrôle et la restauration parlent du même état.
    Un seul `git cat-file --batch` pour les 37 cibles — 14 ms contre 160 en
    appels séparés, soit six secondes sur une passe entière au lieu d'une minute.
    """
    entree = "".join(f"HEAD:{c.relative_to(ROOT).as_posix()}\n" for c in CIBLES.values())
    r = subprocess.run(["git", "cat-file", "--batch"], cwd=str(ROOT),
                       input=entree.encode(), capture_output=True)
    if r.returncode != 0:
        return None
    flux, textes, pos = r.stdout, {}, 0
    for cle in CIBLES:
        fin = flux.find(b"\n", pos)
        if fin < 0:
            return None
        entete = flux[pos:fin].decode(errors="replace")
        if " blob " not in entete:
            return None
        try:
            taille = int(entete.rsplit(" ", 1)[1])
        except ValueError:
            return None
        debut = fin + 1
        textes[cle] = flux[debut:debut + taille].decode("utf-8")
        pos = debut + taille + 1
    return textes


def numeros_de_tranche(total, k, n):
    """Les numéros de mutation (1-based) de la tranche `k` sur `n`.

    ⚠️ C'EST UNE PARTITION, et c'est tout ce qui la sépare d'une sélection. Les
    `n` tranches doivent couvrir exactement 1..total — sans trou ni
    recouvrement —, sinon la matrice de la CI rend `n` jobs verts pendant que
    des mutations ne sont jouées par personne : une CI verte ne rapporte pas ce
    mode de panne-là, puisque chaque job, pris à part, a bien fait son travail.
    Le reste est distribué sur les PREMIÈRES tranches plutôt qu'allongé sur la
    dernière — 435 en 10 rend cinq tranches de 44 puis cinq de 43, jamais neuf
    de 44 et une de 39, qui ferait attendre un job pour rien.
    """
    base, reste = divmod(total, n)
    debut = (k - 1) * base + min(k - 1, reste)
    taille = base + (1 if k <= reste else 0)
    return list(range(debut + 1, debut + taille + 1))


def main():
    global NB_TESTS

    # ⚠️ CE SCRIPT MUTE DES FICHIERS SUIVIS ET RESTAURE PAR `git checkout`.
    # Il ne lisait AUCUN argument : `--help` ne l'aidait pas, il lançait la
    # passe entière. Vécu — un `--help` de reconnaissance a démarré 80 mutations,
    # et l'interrompre a laissé `perf.mjs` MUTÉ dans l'arbre de travail, sans
    # que rien ne le dise. Un flag inconnu doit refuser de démarrer, jamais
    # tomber dans le comportement le plus destructeur qu'offre le script.
    args = sys.argv[1:]
    if args in (["--help"], ["-h"]):
        print(__doc__ or "harnais de mutation des gardes")
        print(f"\n  (aucun argument)  joue les {len(MUTATIONS)} mutations")
        print("  --list            les nomme sans rien muter")
        print("  --only=3,7        ne joue QUE ces mutations (numéros de --list)")
        print("                    — c'est le raccourci SÛR : il garde le refus de")
        print("                      démarrer sur un arbre sale et la preuve de")
        print("                      restauration. Une copie jetable ne les a pas.")
        print("  --shard=K/N       la tranche K d'une PARTITION en N — les N tranches")
        print("                    couvrent tout, donc celle-ci rend 0 si elle est")
        print("                    entière ; c'est l'assembleur (matrice de CI) qui")
        print("                    exige les N verts. Ajoute --list pour la voir.")
        print("  --check-motifs    dit quelles mutations ne mutent plus rien —")
        print("                    ajoute --from-head pour lire le dépôt COMMITÉ,")
        print("                    seule façon de le jouer PENDANT une mutation")
        print("                    aucun fichier touché, une seconde au lieu d'heures")
        print("  --help, -h        ceci")
        return 0
    if args and args[0] == "--check-motifs" and set(args[1:]) <= {"--from-head"}:
        # Ne mute rien, n'écrit rien : compte, compare, conclut.
        # ⚠️ `--from-head` n'est pas une option de confort — voir textes_depuis_head.
        if "--from-head" in args[1:]:
            textes = textes_depuis_head()
            if textes is None:
                print("✖ impossible de lire les cibles depuis HEAD : le contrôle n'a RIEN mesuré,")
                print("  et son silence se lirait comme « aucune mutation inerte ».")
                return 2
        else:
            textes = {cle: c.read_text(encoding="utf-8") for cle, c in CIBLES.items()}
        morts = sorted({nom for (cle, nom, motif, _) in MUTATIONS
                        if textes[cle].count(motif) != 1})
        neuves = [n for n in morts if n not in MOTIFS_INERTES_CONNUS]
        guaries = [n for n in MOTIFS_INERTES_CONNUS if n not in morts]
        for n in neuves:
            print(f"🔴 INERTE ET NON DÉCLARÉE : {n}")
        for n in guaries:
            print(f"✔ RÉPARÉE, retire-la de MOTIFS_INERTES_CONNUS : {n}")
        print(f"\n{len(MUTATIONS)} mutations · {len(morts)} inerte(s) · "
              f"{len(neuves)} non déclarée(s) · {len(guaries)} à retirer du relevé")
        if neuves:
            print("\n⚠️ Une mutation dont le motif a disparu ne prouve RIEN. Ré-ancre-la sur le")
            print("   texte du jour — c'est presque toujours un refactor qui a déplacé sa cible.")
        return 1 if (neuves or guaries) else 0

    # ⚠️ CE MODE EXISTE POUR QU'UN GARDE PUISSE DEMANDER PLUTÔT QUE RECALCULER.
    # La couverture est la seule chose qui rende une matrice de CI honnête : si
    # les N tranches laissent un trou, N jobs passent au vert sur des mutations
    # que personne n'a jouées — et chaque job, pris à part, a bien fait son
    # travail, donc rien ne peut le dire. L'attendu (`1..total`) ne dérive PAS
    # de la partition qu'il juge : c'est ce qui l'empêche d'être circulaire.
    if args and args[0].startswith("--check-shards="):
        brut = args[0][len("--check-shards="):].strip()
        if not brut.isdigit() or not 1 <= int(brut) <= len(MUTATIONS):
            print(f"✖ --check-shards attend un N dans 1..{len(MUTATIONS)}, reçu : {brut}")
            return 2
        nb = int(brut)
        union = []
        for k in range(1, nb + 1):
            union += numeros_de_tranche(len(MUTATIONS), k, nb)
        attendu = list(range(1, len(MUTATIONS) + 1))
        if union != attendu:
            manquants = sorted(set(attendu) - set(union))
            doubles = sorted({i for i in union if union.count(i) > 1})
            print(f"✖ {nb} tranches NE couvrent PAS 1..{len(MUTATIONS)} :"
                  f" {len(manquants)} jamais joué(s), {len(doubles)} joué(s) deux fois")
            if manquants:
                print(f"  jamais joués : {manquants[:12]}{' …' if len(manquants) > 12 else ''}")
            return 1
        tailles = sorted({len(numeros_de_tranche(len(MUTATIONS), k, nb)) for k in range(1, nb + 1)})
        print(f"✔ {nb} tranches couvrent exactement 1..{len(MUTATIONS)} · tailles {tailles}")
        return 0

    if args == ["--list"]:
        for i, (cle, nom, *_reste) in enumerate(MUTATIONS, 1):
            print(f"{i:3}. {cle:9} {nom}")
        print(f"\n{len(MUTATIONS)} mutations · aucun fichier touché")
        return 0

    # ⚠️ `--only` EXISTE POUR QU'ON N'ÉCRIVE PAS DE COPIE JETABLE. Sans lui,
    # prouver UN garde coûtait la passe entière, donc on écrivait dix lignes de
    # shell qui font « la même chose » — sauf qu'elles n'ont ni le refus de
    # démarrer sur un arbre sale, ni la preuve de restauration par hash, ni la
    # distinction TOMBE/VACANT/HARNAIS. Ce sont ces dix lignes-là qui ont détruit
    # du travail deux fois dans une même séance. Le raccourci sûr est celui que
    # l'outil offre ; celui qu'on se fabrique laisse dehors ce qui le rend sûr.
    choisies = None
    if len(args) == 1 and args[0].startswith("--only="):
        brut = args[0][len("--only="):]
        try:
            nums = sorted({int(x) for x in brut.split(",") if x.strip()})
        except ValueError:
            print(f"✖ --only attend des numéros séparés par des virgules, reçu : {brut}")
            return 2
        hors = [n for n in nums if not 1 <= n <= len(MUTATIONS)]
        if not nums or hors:
            print(f"✖ --only : {hors or 'aucun numéro'} hors des 1-{len(MUTATIONS)} (voir --list)")
            return 2
        choisies = nums
        args = []

    # ⚠️ `--shard=K/N` DIFFÈRE DE `--only` PAR SA NATURE, pas par son périmètre,
    # et c'est cela seul qui l'autorise à rendre 0. `--only` est une SÉLECTION :
    # rien ne garantit que le reste sera joué un jour, donc elle sort en 1 —
    # sinon un « 45/435 » se lirait comme un dépôt sain, ce qui est exactement
    # le relevé tronqué qui se prend pour une mesure. `--shard` est une
    # PARTITION annoncée : les N tranches couvrent 1..total sans trou, et c'est
    # l'assembleur — la matrice de la CI — qui exige les N verts. Sa tranche
    # entière vaut donc 0, et le bandeau écrit qu'elle ne prouve qu'elle-même.
    tranche = None
    if choisies is None and args and args[0].startswith("--shard="):
        brut = args[0][len("--shard="):].strip()
        forme = re.fullmatch(r"(\d+)/(\d+)", brut)
        if not forme:
            print(f"✖ --shard attend K/N (ex. --shard=3/10), reçu : {brut}")
            return 2
        k, nb = int(forme.group(1)), int(forme.group(2))
        if not 1 <= k <= nb or not 1 <= nb <= len(MUTATIONS):
            print(f"✖ --shard={brut} : K doit tenir dans 1..N, et N dans 1..{len(MUTATIONS)}")
            return 2
        tranche = (k, nb)
        choisies = numeros_de_tranche(len(MUTATIONS), k, nb)
        args = args[1:]
        if args == ["--list"]:
            print(f"tranche {k}/{nb} : {len(choisies)} mutations "
                  f"({choisies[0]}-{choisies[-1]}) sur {len(MUTATIONS)} — aucun fichier touché")
            for i in choisies:
                cle, nom, *_reste = MUTATIONS[i - 1]
                print(f"{i:3}. {cle:9} {nom}")
            return 0
    if args:
        print(f"✖ argument inconnu : {' '.join(args)}")
        print("  Ce script MUTE des fichiers suivis — il ne démarre pas sur un doute.")
        print("  `--help` pour les options, `--list` pour voir les mutations sans rien toucher.")
        return 2

    base = sh(["node", "--test", str(SUITE)])
    m = re.search(r"tests (\d+)", base.stdout + base.stderr)
    if not m:
        print("✖ impossible de relever le compte de tests sur la suite propre —")
        print("  sans lui, « aucun test n'a tourné » et « le garde est vacant » sont indistinguables.")
        return 1
    NB_TESTS = int(m.group(1))
    if base.returncode != 0:
        print(f"✖ la suite est DÉJÀ rouge ({NB_TESTS} tests) — corrige avant de muter.")
        return 1

    for cle, cible in CIBLES.items():
        if sh(["git", "status", "--porcelain", str(cible.relative_to(ROOT))]).stdout.strip():
            print(f"✖ {cible.name} a des modifications non commitées : commite d'abord.")
            print("  (git checkout restaure depuis HEAD — il DÉTRUIRAIT ce travail.)")
            return 1

    if not PYYAML:
        workflows = sum(1 for c, *_ in MUTATIONS
                        if CIBLES[c].name in ("argus-mobile.yml", "plugin.yml"))
        print(f"⚠  PyYAML absent — les {workflows} mutations de workflow ne seront pas vérifiées")
        print("   syntaxiquement. Elles ne seront pas ACCUSÉES pour autant : un vérificateur")
        print("   qui manque n'est pas une mutation fautive.  (pip install pyyaml)")

    if not MAESTRO:
        flows = sum(1 for c, *_ in MUTATIONS if CIBLES[c].suffix in (".yaml", ".yml"))
        print(f"⚠  maestro absent du PATH — les {flows} mutations de flow ne seront pas vérifiées")
        print("   syntaxiquement : un YAML cassé s'y lira comme un garde qui tombe.")

    propres = {k: digest(v) for k, v in CIBLES.items()}
    originaux = {k: v.read_text(encoding="utf-8") for k, v in CIBLES.items()}
    bilan = []

    # ⚠️ Le sous-ensemble est ANNONCÉ. Une passe partielle qui rend « 7/7 » se
    # lit comme une passe complète — le relevé tronqué qui se prend pour une
    # mesure. Le bilan final le redit, pour qu'on ne le lise pas hors contexte.
    jouees = MUTATIONS if choisies is None else [MUTATIONS[n - 1] for n in choisies]
    if tranche is not None:
        print(f"⚠  TRANCHE {tranche[0]}/{tranche[1]} : {len(jouees)}/{len(MUTATIONS)} mutations"
              f" ({choisies[0]}-{choisies[-1]}) — elle ne prouve QU'ELLE-MÊME."
              f" Le dépôt n'est gardé que si les {tranche[1]} tranches passent.\n")
    elif choisies is not None:
        print(f"⚠  PASSE PARTIELLE : {len(jouees)}/{len(MUTATIONS)} mutations"
              f" (--only={','.join(map(str, choisies))}) — ce n'est PAS une passe complète.\n")

    # ⚠️ TOUT CE QUI SUIT MUTE DES FICHIERS SUIVIS. Une sortie brutale — signal,
    # timeout de l'appelant, Ctrl-C — doit laisser l'arbre propre, sinon le
    # fichier muté survit à la séance et le prochain qui le lit croit au code.
    interrompu = False
    # ⚠️ UN `finally` NE SE DÉROULE PAS SUR SIGTERM — et SIGTERM est justement le
    # signal qu'envoie un appelant qui expire, c'est-à-dire le cas vécu. Sans ce
    # handler, le filet ci-dessous couvre Ctrl-C et rien d'autre : la seule
    # sortie brutale qu'on subit vraiment passerait à travers.
    def _sigterm(_sig, _frm):
        raise KeyboardInterrupt
    precedent = signal.signal(signal.SIGTERM, _sigterm)
    try:
      for cle, nom, avant, apres in jouees:
          cible, propre, original = CIBLES[cle], propres[cle], originaux[cle]
          occurrences = original.count(avant)
          if occurrences != 1:
              bilan.append(("HARNAIS", nom, f"motif trouvé {occurrences}× (attendu 1)"))
              continue

          cible.write_text(original.replace(avant, apres, 1), encoding="utf-8")
          if digest(cible) == propre:
              restaure(cle, propre)
              bilan.append(("HARNAIS", nom, "le fichier n'a pas changé"))
              continue

          # Une mutation qui casse le build fait rougir pour une raison sans
          # rapport avec le garde, et ce rouge-là se lit comme un succès. Pour un
          # flow, c'est `maestro check-syntax` qui le dit — aucun parseur d'ici ne
          # les lit, leur `---` sortant du sous-ensemble YAML du harness. Quand
          # maestro manque, on ne vérifie pas : on l'ANNONCE (voir main), plutôt
          # que de laisser croire que ça l'a été.
          verif = None
          if cible.suffix == ".mjs":
              verif = ["node", "--check", str(cible)]
          elif cible.suffix == ".sh":
              # ⚠️ AJOUTÉ AU RUN 34, même leçon que le workflow : une cible sans
              # validateur laisse passer une mutation qui casse la syntaxe, et le
              # rouge qui suit se lit comme un garde qui tombe.
              verif = ["bash", "-n", str(cible)]
          elif cible.name == "argus.mobile.yaml":
              # ⚠️ CE fichier-là n'est PAS un flow : c'est la configuration, et
              # `maestro check-syntax` la rejette toujours — il n'y trouve pas de
              # section de flow. La cible existait depuis le run 29 sans qu'aucune
              # mutation ne l'exerce, donc personne ne pouvait le savoir : une
              # cible sans mutation est vacante, comme un garde sans épreuve.
              # C'est le parseur du skill qui fait foi ici.
              verif = ["node", "-e",
                       "import('" + str(SCAFFOLD / "config.mjs").replace("\\", "/")
                       + "').then(m => m.loadConfig('" + str(cible).replace("\\", "/")
                       + "')).catch(e => { console.error(e.message); process.exit(1); })"]
          elif cible.name in ("argus-mobile.yml", "plugin.yml") and PYYAML:
              # ⚠️ MÊME PIÈGE QUE `argus.mobile.yaml` AU RUN 30, sur un autre
              # fichier : un workflow GitHub n'est PAS un flow Maestro, donc
              # `check-syntax` le rejette toujours et TOUTE mutation rendait
              # « ne parse pas ». La cible existait sans qu'aucune mutation ne
              # puisse aboutir. C'est un YAML : on le parse comme tel.
              verif = ["python3", "-c",
                       "import yaml,sys; yaml.safe_load(open(sys.argv[1]))", str(cible)]
          elif cible.suffix == ".py":
              # ⚠️ Même exigence que `node --check` pour le JS : une mutation qui
              # casse la syntaxe fait rougir la suite pour une raison sans
              # rapport avec le garde, et ce rouge se lit comme un succès.
              verif = ["python3", "-m", "py_compile", str(cible)]
          elif cible.suffix in (".yaml", ".yml") and MAESTRO:
              verif = [MAESTRO, "check-syntax", str(cible)]
          if verif is not None:
              check = sh(verif)
              if check.returncode != 0:
                  restaure(cle, propre)
                  bilan.append(("HARNAIS", nom, "la mutation ne parse pas"))
                  continue

          res = sh(["node", "--test", str(SUITE)])
          sortie = res.stdout + res.stderr
          restaure(cle, propre)

          if f"tests {NB_TESTS}" not in sortie:
              bilan.append(("HARNAIS", nom, "la suite n'a pas tourné entièrement"))
          elif res.returncode != 0:
              echecs = [l.strip()[2:] for l in sortie.splitlines() if l.strip().startswith("✖ ")
                        and "subtest" not in l]
              bilan.append(("TOMBE", nom, echecs[0] if echecs else "un garde a rougi"))
          else:
              bilan.append(("VACANT", nom, "aucun garde n'a bougé"))

    except KeyboardInterrupt:
        interrompu = True
        print("\n⚠  INTERROMPU — restauration des cibles avant de sortir :")
    finally:
        # ⚠️ LE FILET. La boucle restaure après chaque mutation ; ceci couvre
        # ce qu'elle ne peut pas couvrir — être TUÉE au milieu. Sans lui, un
        # timeout de l'appelant laisse la mutation en cours dans l'arbre, sans
        # un mot. Vécu : `run.mjs` retrouvé muté après un timeout de dix
        # minutes, la passe complète ne tenant plus dans une seule exécution.
        restaure_tout(propres)
        signal.signal(signal.SIGTERM, precedent)
    if interrompu:
        print("  (passe incomplète : aucun verdict n'est rendu)")
        return 130

    print(f"\n{'':2} {'défaut réintroduit':52} verdict")
    print("─" * 96)
    for etat, nom, detail in bilan:
        icone = {"TOMBE": "✔", "VACANT": "✖", "HARNAIS": "⚠"}[etat]
        print(f"{icone}  {nom:52} {etat:8} {detail[:34]}")

    tombes = sum(1 for e, _, _ in bilan if e == "TOMBE")
    hashs = " ".join(f"{cle}={digest(v)}" for cle, v in CIBLES.items())
    # ⚠️ L'ATTENDU D'UNE TRANCHE EST SA PROPRE TAILLE, celui de tout le reste est
    # le cardinal ENTIER. C'est la seule ligne qui sépare « la CI assemble N
    # tranches » de « quelqu'un a joué 45 mutations et lu un vert ».
    attendu = len(jouees) if tranche is not None else len(MUTATIONS)
    ou = f" · tranche {tranche[0]}/{tranche[1]}" if tranche is not None else ""
    print(f"\n{tombes}/{attendu} défauts détectés{ou} · hashs restaurés : {hashs}")
    return 0 if tombes == attendu else 1


if __name__ == "__main__":
    sys.exit(main())
