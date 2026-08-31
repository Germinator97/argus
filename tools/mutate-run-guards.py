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
    "lifecycle": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/lifecycle.yaml",
    "yamlconf": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml",
    "gitignore": ROOT / "plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.gitignore",
}
SUITE = ROOT / "tools/run-guards.test.mjs"
# Optionnel : sans lui, les mutations de flow ne sont pas vérifiées — et une
# mutation qui casse le YAML ferait rougir la suite pour une raison sans rapport
# avec le garde, ce qui se lit comme un succès.
MAESTRO = shutil.which("maestro")
# ⚠️ DÉRIVÉ, jamais figé. Ce nombre sert à distinguer « le garde n'a pas bougé »
# de « aucun test n'a tourné » — deux verdicts opposés que la même sortie vide
# produirait. Écrit à la main, il se périmait au premier test ajouté et TOUTES
# les mutations rendaient alors « HARNAIS », ce qui masquait la mesure entière.
# Il se relève donc sur la suite PROPRE, avant la première mutation : c'est le
# seul moment où le compte est à la fois connu et digne de foi.
NB_TESTS = None

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
     "    const step = (bundle.steps ?? []).find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')\n      && selectorOf(s) === `id=${anchor}`);",
     "    const step = [...(bundle.steps ?? [])].reverse().find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')\n      && selectorOf(s) === `id=${anchor}`);"),
    ("run", "startupSamples ne filtre plus sur l'ancre",
     "      && selectorOf(s) === `id=${anchor}`);",
     "      && selectorOf(s) !== '@@jamais@@');"),
    ("run", "un finding par flow au lieu d'un pour le lot",
     "  if (over.length === 0) return [];",
     "  if (over.length === 0) return [];\n  if (over.length > 1) return over.flatMap((s) => startupFindings([s], device, platform, config));"),
    ("run", "un finding même sous le seuil",
     "  const over = samples.filter((s) => net(s) > budget);",
     "  const over = samples.filter((s) => net(s) >= 0);"),
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
    ("run", "start: true cesse de gagner",
     "  const declares = screens.filter((/** @type {any} */ s) => s.start === true);",
     "  const declares = screens.filter((/** @type {any} */ s) => s.start === undefined && false);"),
    ("run", "le repli ne se signale plus comme tel",
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
    ("config", "flutterCommand préfixe ce qui n'est pas du flutter",
     "  if (!pinned || !text.startsWith('flutter ')) return text;",
     "  if (!pinned) return text;"),
    ("config", "flutterCommand ne préfixe plus rien",
     "  return `fvm ${text}`;",
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
     "  const over = samples.filter((s) => net(s) > budget);",
     "  const over = samples.filter((s) => s.ms > budget);"),
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
     "  if (requested && requested !== 'écran courant' && !found.some((/** @type {any} */ s) => s.id === requested)) {",
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
    ("run", "l'indice renomme le levier que la doc interdit de toucher",
     "    + ` l'ancre qui est fausse. Relève thresholds.startTimeoutMs (plafond effectif`",
     "    + ` l'ancre qui est fausse. Vérifie d'abord thresholds.coldStartMs (plafond effectif`"),
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
    ("skill", "la commande de comptage reperd son filtre de commentaires",
     "grep -v '^\\s*///' test/argus/harness.dart | grep -c 'ArgusScreen('",
     "grep -c 'ArgusScreen(' test/argus/harness.dart"),
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
    ("config", "les commentaires refabriquent des arêtes dans le graphe",
     "    const utile = String(texte ?? '').split('\\n').filter((l) => !/^\\s*#/.test(l)).join('\\n');",
     "    const utile = String(texte ?? '');"),
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
    ("report", "l'icône de la page n'est plus lue, la mention RESTE",
     "· icône ${config.artifact.icon || '👁'}",
     "· icône 👁"),
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
    # ── Run 32 — le défaut que la passe précédente avait CRÉÉ ───────────────
    ("makefile", "la recette cesse de lire le code de sortie du build",
     "\tSTART=$$(date +%s); eval \"$$CMD\"; RC=$$?; ELAPSED=$$(( $$(date +%s) - START )); \\",
     "\tSTART=$$(date +%s); eval \"$$CMD\"; RC=0; ELAPSED=$$(( $$(date +%s) - START )); \\"),
    ("sec", "le site d'appel rebranche un message figé",
     "  if (!plan.scan) {\n    binaryFacts = { scanned: false, why: plan.why };",
     "  if (!plan.scan) {\n    binaryFacts = { scanned: false, why: 'analyse binaire iOS non couverte : un .app de simulateur.' };"),
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
        print("  --help, -h        ceci")
        return 0
    if args == ["--list"]:
        for i, (cle, *_reste) in enumerate(MUTATIONS, 1):
            print(f"{i:3}. {cle}")
        print(f"\n{len(MUTATIONS)} mutations · aucun fichier touché")
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

    if not MAESTRO:
        flows = sum(1 for c, *_ in MUTATIONS if CIBLES[c].suffix in (".yaml", ".yml"))
        print(f"⚠  maestro absent du PATH — les {flows} mutations de flow ne seront pas vérifiées")
        print("   syntaxiquement : un YAML cassé s'y lira comme un garde qui tombe.")

    propres = {k: digest(v) for k, v in CIBLES.items()}
    originaux = {k: v.read_text(encoding="utf-8") for k, v in CIBLES.items()}
    bilan = []

    for cle, nom, avant, apres in MUTATIONS:
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

    print(f"\n{'':2} {'défaut réintroduit':52} verdict")
    print("─" * 96)
    for etat, nom, detail in bilan:
        icone = {"TOMBE": "✔", "VACANT": "✖", "HARNAIS": "⚠"}[etat]
        print(f"{icone}  {nom:52} {etat:8} {detail[:34]}")

    tombes = sum(1 for e, _, _ in bilan if e == "TOMBE")
    hashs = " ".join(f"{k}={digest(v)}" for k, v in CIBLES.items())
    print(f"\n{tombes}/{len(MUTATIONS)} défauts détectés · hashs restaurés : {hashs}")
    return 0 if tombes == len(MUTATIONS) else 1


if __name__ == "__main__":
    sys.exit(main())
