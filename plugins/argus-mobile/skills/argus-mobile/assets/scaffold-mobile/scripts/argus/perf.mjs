#!/usr/bin/env node
// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
// @ts-check
/**
 * Argus Mobile — performance et stabilité
 * ------------------------------------------------------------------------
 * Démarrage à froid et à chaud, mémoire, taille du binaire.
 * Écrit argus-mobile-report/perf.json et sort selon le gate.
 *
 * ⚠️ UN CHIFFRE DE PERFORMANCE NE VEUT RIEN DIRE SANS L'ÉTAT OÙ IL EST PRIS.
 * Le PREMIER lancement après installation est plusieurs fois plus lent que les
 * suivants — pas à cause de la taille de l'APK ni de la compilation ART (les
 * deux se mesurent et se réfutent), mais à cause de l'initialisation applicative
 * de premier démarrage. C'est un état RÉEL, vécu une fois par chaque
 * utilisateur, et une séance de recette le reproduit à chaque réinstallation.
 * Ce script le mesure donc SÉPARÉMENT du régime stabilisé, au lieu de mélanger
 * les deux dans une moyenne qui ne décrit aucun des deux.
 *
 * Usage :
 *   node scripts/argus/argus-mobile.mjs perf
 *   node scripts/argus/argus-mobile.mjs perf --samples=5 --device=<udid>
 *
 * Codes de sortie : 0 vert · 1 major · 2 blocker/critical ou outillage absent.
 */

import { existsSync, realpathSync, statSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  artifactsDir, defaultAndroidDevice, detectTools, err, exitCodeFor, installedVariant, loadConfig, log,
  missingToolMessage, PROBE_TIMEOUT_MS, releaseBuildCmd, sh, warn, writeJson,
} from './config.mjs';

const MB = 1024 * 1024;

/**
 * Combien on laisse au processus pour devenir visible de `dumpsys`, avant de
 * conclure que la mémoire n'est pas mesurable. Un choix, pas une mesure : il dit
 * seulement « plus qu'un aller-retour adb ».
 */
const MEMOIRE_SECONDE_CHANCE_MS = 500;

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = { samples: 3, device: '', platform: '' };
  for (const arg of argv) {
    const [key, value] = arg.split('=');
    if (key === '--samples') opts.samples = Math.max(1, Number.parseInt(value, 10) || 3);
    else if (key === '--device') opts.device = value ?? '';
    else if (key === '--platform') opts.platform = value ?? '';
    else if (key === '--help' || key === '-h') {
      console.log('Argus Mobile — perf\n  --samples=N   mesures du régime stabilisé (défaut 3)\n  --device=<udid>\n  --platform=android|ios');
      process.exit(0);
    } else { err(`option inconnue : ${arg}`); process.exit(2); }
  }
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════════
// Android — mesures
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `adb -s <udid> …`, ou sans `-s` si un seul device est branché.
 *
 * ⚠️ TOUTES les commandes d'ici sont des SONDES : elles rendent en secondes ou
 * pas du tout. Le plafond court les distingue des commandes longues et
 * légitimes du harnais (`flutter build`, `maestro test`), qui gardent celui de
 * `sh` — et il est ce qui empêche cette boucle de mesure d'attendre sans fin.
 * @param {string} udid @param {string[]} args
 */
const adb = (udid, args) => sh('adb', udid ? ['-s', udid, ...args] : args, { timeout: PROBE_TIMEOUT_MS });

/**
 * Activité de lancement du paquet. Sans elle, `am start -W` ne sait pas quoi
 * démarrer et la mesure n'a pas lieu.
 * @param {string} udid @param {string} packageName @returns {string}
 */
function launchComponent(udid, packageName) {
  const res = adb(udid, ['shell', 'cmd', 'package', 'resolve-activity', '--brief', packageName]);
  const line = res.stdout.trim().split('\n').pop() ?? '';
  return line.includes('/') ? line.trim() : '';
}

/**
 * Un lancement chronométré. `am start -W` rend TotalTime (temps jusqu'au premier
 * frame de l'app) et WaitTime (temps vu par le système, transitions comprises).
 * TotalTime est celui qui décrit l'app ; WaitTime est gardé pour le contexte.
 *
 * ⚠️ `am start` rend DEUX avertissements « Activity not started » très
 * différents, et les confondre coûte une dimension entière :
 *
 *   « intent has been delivered to currently running top-most instance »
 *       L'app était DÉJÀ devant : rien n'a été relancé. `TotalTime: 0` s'affiche
 *       alors, et ce zéro passerait pour un démarrage parfait. Ce n'est pas une
 *       mesure, c'est son absence → rejeté.
 *
 *   « its current task has been brought to the front »
 *       C'EST le démarrage à chaud. Aucune activité n'est créée, donc `am start`
 *       ne rend AUCUN TotalTime — seul `WaitTime` décrit le retour au premier
 *       plan. Rejeter ce cas laissait warmStartMs à null indéfiniment.
 *
 * ⚠️ Et un QUATRIÈME cas, qui n'est pas un verdict d'`am start` : l'expiration.
 * La commande a été tuée au plafond, donc il n'y a rien à lire — mais ce n'est
 * PAS la même chose qu'une mesure invalide, et les confondre ferait chercher un
 * défaut d'activité là où c'est le device qui n'a pas répondu.
 * ⚠️ SÉPARÉE DE SON APPEL pour être testable : tant que la lecture du verdict
 * vivait dans la fonction qui parle au device, aucun de ces quatre cas n'était
 * exercé par quoi que ce soit — il aurait fallu un émulateur, donc rien ne les
 * exerçait. C'est [timedLaunch] qui mesure, `launchOutcome` qui décide.
 * @param {{timedOut?:boolean, stdout?:string}} res
 * @returns {{totalMs:number|null, waitMs:number|null, kind:'launched'|'resumed'|'none'|'timeout'}}
 */
export function launchOutcome(res) {
  if (res.timedOut) return { totalMs: null, waitMs: null, kind: 'timeout' };
  const out = res.stdout ?? '';
  if (/top-most instance/i.test(out)) return { totalMs: null, waitMs: null, kind: 'none' };
  const total = /TotalTime:\s*(\d+)/.exec(out);
  const wait = /WaitTime:\s*(\d+)/.exec(out);
  const waitMs = wait ? Number.parseInt(wait[1], 10) : null;
  if (/brought to the front/i.test(out)) return { totalMs: null, waitMs, kind: 'resumed' };
  const totalMs = total ? Number.parseInt(total[1], 10) : null;
  return { totalMs: totalMs === 0 ? null : totalMs, waitMs, kind: 'launched' };
}

/**
 * Un lancement chronométré sur le device, lu par [launchOutcome].
 * @param {string} udid @param {string} component
 */
function timedLaunch(udid, component) {
  return launchOutcome(adb(udid, ['shell', 'am', 'start', '-W', '-n', component]));
}

/** @param {number[]} values @returns {number|null} */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Démarrages à froid : l'app est arrêtée avant chaque mesure.
 * Le PREMIER échantillon est isolé — c'est l'état « premier lancement après
 * installation », qui n'a rien à voir avec le régime stabilisé.
 * @param {string} udid @param {string} packageName @param {string} component @param {number} samples
 */
function measureColdStarts(udid, packageName, component, samples) {
  /** @type {number[]} */
  const values = [];
  let timedOut = 0;
  for (let i = 0; i < samples + 1; i += 1) {
    adb(udid, ['shell', 'am', 'force-stop', packageName]);
    const { totalMs, kind } = timedLaunch(udid, component);
    if (kind === 'timeout') timedOut += 1;
    if (totalMs !== null) values.push(totalMs);
  }
  return {
    firstLaunchMs: values[0] ?? null, samples: values.slice(1),
    medianMs: median(values.slice(1)), timedOut,
  };
}

/**
 * Démarrages à chaud : l'app reste en mémoire, on la renvoie juste à l'écran.
 *
 * La grandeur mesurée ici est un `WaitTime`, pas un `TotalTime` : c'est le seul
 * chiffre qu'`am start` produit quand il ne fait que ramener une tâche au
 * premier plan. Le rapport le dit, pour qu'on ne compare jamais ce nombre au
 * démarrage à froid comme s'il décrivait la même chose.
 * @param {string} udid @param {string} component @param {number} samples
 */
function measureWarmStarts(udid, component, samples) {
  /** @type {number[]} */
  const values = [];
  let timedOut = 0;
  for (let i = 0; i < samples; i += 1) {
    adb(udid, ['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
    const { totalMs, waitMs, kind } = timedLaunch(udid, component);
    if (kind === 'timeout') timedOut += 1;
    const value = kind === 'resumed' ? waitMs : totalMs;
    if (value !== null) values.push(value);
  }
  return {
    samples: values, medianMs: median(values),
    metric: 'WaitTime (retour au premier plan)', timedOut,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Le jank a été RETIRÉ le 23/08/2026 — et voici pourquoi, pour qu'il ne
// revienne pas par inadvertance.
//
// Il a vécu ici dix runs sans jamais conclure une seule fois : `framesRendered`
// valait 0 ou 1 là où le seuil en demandait 100. Ce n'était pas un échantillon
// trop court, c'était le mauvais instrument — mesuré :
//
//   6 swipes → 0 frame · 8 transitions → 0 frame · les deux → 0 frame
//   CONTRE-ÉPREUVE, mêmes swipes sur une appli système → 70 frames
//
// `dumpsys gfxinfo` compte le rendu HWUI de la hiérarchie de vues Android, et
// Flutter dessine dans une SurfaceView (`SurfaceView[<appId>/…](BLAST)` dans
// `dumpsys SurfaceFlinger --list`). Ce qu'on lisait était la coquille Android.
//
// ⚠️ ET LA RÉPARATION N'AURAIT PAS SUFFI. `dumpsys SurfaceFlinger --timestats`
// voit bien ce layer (22 frames là où gfxinfo en rendait 0), mais son
// `Jank payload` par layer est vide sur Android 36 — seul l'agrégat GLOBAL est
// rempli, tous layers confondus, donc non attribuable à l'app. Et surtout : ce
// harnais mesure un binaire de DEBUG sur émulateur, où le jank n'a aucun
// rapport avec ce que voit un utilisateur.
//
// Une mesure de jank qui vaudrait quelque chose demande `FrameTiming`
// (`SchedulerBinding.addTimingsCallback`) côté application, en profile ou
// release, sur un appareil réel. C'est un autre chantier que celui-ci.

/**
 * Mémoire : TOTAL PSS, la mesure qui compte pour un budget d'app.
 * @param {string} udid @param {string} packageName @returns {number|null}
 */
function measureMemory(udid, packageName) {
  const res = adb(udid, ['shell', 'dumpsys', 'meminfo', packageName]);
  const match = /TOTAL(?:\s+PSS)?:?\s+(\d+)/.exec(res.stdout);
  return match ? Math.round((Number.parseInt(match[1], 10) / 1024) * 10) / 10 : null;
}

/**
 * Contexte du device. Enregistré POUR SITUER la mesure, jamais pour expliquer
 * un écart : attribuer un chiffre de performance à un mécanisme sans l'avoir
 * isolé fait optimiser à côté.
 * @param {string} udid @param {string} packageName
 */
function deviceContext(udid, packageName) {
  const prop = (/** @type {string} */ name) => adb(udid, ['shell', 'getprop', name]).stdout.trim();
  const compile = adb(udid, ['shell', 'dumpsys', 'package', packageName]).stdout;
  const status = /\[status=([a-z-]+)\]/.exec(compile) ?? /status=([a-z-]+)/.exec(compile);
  return {
    androidRelease: prop('ro.build.version.release'),
    sdkInt: prop('ro.build.version.sdk'),
    model: prop('ro.product.model'),
    artCompilation: status ? status[1] : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Taille du binaire
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le binaire dont la TAILLE compte — celui qu'on publierait, pas celui qu'on teste.
 *
 * ⚠️ `build.android` est le binaire que le runner installe : un **debug** presque
 * toujours, et un debug n'est ni minifié ni découpé. Le peser contre
 * `thresholds.binarySizeMb`, budget écrit pour ce qui sort, rend un finding qui
 * décrit l'outillage et non l'application. Mesuré au vingt-et-unième run : 92 Mo
 * en debug (finding `major`) contre **30,2 Mo** pour la release du même code,
 * largement sous le budget de 60.
 *
 * `build.androidScan` — la release, celle que le scan de sécurité emploie déjà —
 * est donc préférée quand elle est renseignée ET présente. Sinon on pèse le
 * binaire de test, et le rapport le DIT plutôt que de laisser croire au contraire.
 * @param {string} platform @param {any} config @returns {{path:string, isRelease:boolean}}
 */
export function binaryToWeigh(platform, config) {
  const b = config?.build ?? {};
  const publie = platform === 'ios' ? b.iosScan : b.androidScan;
  const teste = platform === 'ios' ? b.ios : b.android;
  if (publie && existsSync(resolve(process.cwd(), publie))) return { path: publie, isRelease: true };
  return { path: teste ?? '', isRelease: false };
}

/**
 * Taille du binaire livré. Sur un dossier `.app` iOS, on somme récursivement.
 * @param {string} path @returns {number|null} Mo
 */
function binarySizeMb(path) {
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  if (stat.isFile()) return Math.round((stat.size / MB) * 10) / 10;
  const res = sh('du', ['-sk', path]);
  const kb = Number.parseInt(res.stdout.trim().split(/\s+/)[0], 10);
  return Number.isFinite(kb) ? Math.round((kb / 1024) * 10) / 10 : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Findings
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Un seuil dépassé devient un finding. Au-delà du double du seuil, c'est
 * `critical` : ce n'est plus une dégradation, c'est un parcours abandonné.
 * @param {string} id @param {string} label @param {number|null|undefined} value
 * @param {number} budget @param {string} unit @param {string} [dimension]
 * @returns {any}
 */
export function thresholdFinding(id, label, value, budget, unit, dimension = 'performance', variante = '', hote = '') {
  if (value === null || value === undefined || value <= budget) return null;
  // ⚠️ Un budget est écrit pour la PUBLICATION. Appliqué à un build debug, il
  // rend un `major` sur une valeur qui n'a aucun rapport avec ce que les
  // utilisateurs reçoivent : mesuré sur un projet réel, 117,5 Mo contre un
  // budget de 60, quand la release du même projet fait 32,1.
  //
  // ⚠️ ET LA RÉSERVE MANQUAIT LÀ OÙ ELLE COMPTE LE PLUS. Elle n'était passée
  // qu'à la taille et à la mémoire ; le DÉMARRAGE, qui est la métrique la plus
  // sensible au variant — un debug exécute le Dart en JIT, sans AOT — partait
  // nu. Relevé sur un run publié : un `critical` « 11 745 ms contre 2 000 »
  // en tête de page, sans que rien ne dise qu'il venait d'un debug, pendant
  // que le finding mémoire, moins grave, portait bien sa mise en garde.
  const misePlusieurs = variante === 'debug' ? `\n${caveatDebug(id)}` : '';
  return {
    id, title: `${label} au-dessus du budget${variante === 'debug' ? ' (mesuré sur un debug)' : ''}`, dimension,
    severity: value > budget * 2 ? 'critical' : 'major',
    expected: `≤ ${budget} ${unit}`, actual: `${value} ${unit}${variante ? ` (${variante})` : ''}`,
    suggestedFix: 'Profiler le chemin concerné avant d\'optimiser : un mécanisme plausible mais non isolé fait optimiser à côté.'
      + misePlusieurs + (hote ? `\n${hote}` : ''),
    status: 'open',
  };
}

/**
 * La mise en garde de variant, PAR MÉTRIQUE — parce que le chiffre qui
 * l'accompagne doit venir d'une mesure, pas d'une généralisation. « Un facteur
 * trois » a été relevé sur des tailles de binaire ; l'appliquer au démarrage
 * serait un nombre deviné, exactement ce que ce harnais reproche aux autres.
 * @param {string} id @returns {string}
 */
export function caveatDebug(id) {
  // ⚠️ `QAM-START` est ici parce qu'il mesure la MÊME chose sur le même
  // binaire, depuis un autre fichier : le remède posé sur les deux
  // démarrages de `perf.mjs` avait laissé dehors celui que `run.mjs`
  // produit à partir des flows. Une mise en garde passée à N-1 appels sur N.
  if (id === 'QAM-PERF-COLD' || id === 'QAM-PERF-WARM' || id === 'QAM-START') {
    return '⚠️ Mesuré sur un binaire DEBUG : Flutter y exécute le Dart en JIT, sans compilation AOT. '
      + 'Un temps de démarrage debug ne dit rien de celui d\'une release — reconstruis en release et '
      + 're-mesure avant de conclure quoi que ce soit sur l\'app.';
  }
  return '⚠️ Mesuré sur un binaire DEBUG : ce budget décrit la publication. '
    + 'Compare-le à la release avant de conclure — l\'écart est couramment d\'un facteur trois.';
}

/**
 * Ce que le chiffre de démarrage MESURE, en toutes lettres.
 * @returns {string}
 */
export function startupMetricLabel() {
  // ⚠️ Ce que `am start -W` mesure, écrit à côté du chiffre : sans ça, il se lit
  // en regard de `startup.samples` du rapport principal — qui mesure l'écran
  // exploitable, splash compris — et l'écart passe pour une contradiction.
  //
  // ⚠️ Cette phrase a vécu SANS ATTEINDRE PERSONNE : elle était construite dans
  // une variable locale que rien ne lisait, sous les trois lignes de commentaire
  // qui expliquent pourquoi elle est indispensable. Aucun test ne pouvait la
  // voir — une variable inutilisée ne casse rien, et `node --check` encore moins.
  return 'am start -W : jusqu\'à la première frame, splash de marque compris mais '
    + 'PAS l\'initialisation applicative qui suit. Le temps jusqu\'à l\'écran exploitable est '
    + 'dans startup.samples du rapport principal, et il est normalement plus grand.';
}

/**
 * Les deux findings de DÉMARRAGE, construits ensemble.
 *
 * ⚠️ Extraits pour qu'un garde puisse les BÂTIR au lieu de chercher un motif
 * dans la source : un garde de câblage qui lit du texte reste vert devant une
 * valeur neutralisée (`variante` remplacé par `''` laisse chaque occurrence en
 * place). Ce chantier a payé cette leçon deux jours de suite.
 * @param {{medianMs:number|null}} cold @param {{medianMs:number|null}} warm
 * @param {any} thresholds @param {string} variante
 * @param {{phrase:string}} hote @returns {any[]}
 */
export function launchTimeFindings(cold, warm, thresholds, variante, hote) {
  return [
    thresholdFinding('QAM-PERF-COLD', 'Démarrage à froid', cold.medianMs, thresholds.coldStartMs, 'ms', 'performance', variante, hote.phrase),
    thresholdFinding('QAM-PERF-WARM', 'Démarrage à chaud', warm.medianMs, thresholds.warmStartMs, 'ms', 'performance', variante, hote.phrase),
  ].filter(Boolean);
}

/**
 * L'état de l'HÔTE au moment de la mesure — relevé, jamais jugé.
 *
 * ⚠️ Un chiffre de démarrage ne veut rien dire sans lui, et ce harnais l'avait
 * appris pour une variable seulement : le premier lancement, isolé du régime
 * stabilisé. La charge de la machine, elle, n'était relevée nulle part — alors
 * qu'elle a doublé la médiane d'attente d'un run entier (17 233 ms contre 7 552,
 * 8 134 et 7 781 aux trois précédents, même terrain, même AVD, même app).
 *
 * ⚠️ AUCUN SEUIL ICI, ET C'EST DÉLIBÉRÉ. « Charge > 1 par cœur » serait un
 * nombre deviné, et il serait VACANT sur le cas qui motive ce relevé : la
 * machine était à 0,53 par cœur pendant qu'un démarrage passait de 1 768 à
 * 11 745 ms. Ce qui manque au lecteur n'est pas un verdict, c'est de quoi
 * comparer deux runs entre eux. Un émulateur partage le CPU de l'hôte ; un
 * appareil physique non, d'où la mention du type de device dans la phrase.
 * @param {boolean} partageLeCpu @returns {{loadAvg1:number, cpuCount:number, loadPerCpu:number, phrase:string}}
 */
export function hostContext(partageLeCpu) {
  const loadAvg1 = Math.round(loadavg()[0] * 100) / 100;
  const cpuCount = cpus().length;
  const loadPerCpu = cpuCount > 0 ? Math.round((loadAvg1 / cpuCount) * 100) / 100 : 0;
  const phrase = `Mesuré avec une charge hôte de ${loadAvg1} sur ${cpuCount} cœurs (${loadPerCpu} par cœur)`
    + (partageLeCpu
      ? ', sur un ÉMULATEUR — qui partage ce CPU. Compare ce chiffre à un relevé pris '
        + 'à charge comparable avant d\'en conclure quoi que ce soit sur l\'app.'
      : ', sur un appareil physique — sa charge lui est propre.');
  return { loadAvg1, cpuCount, loadPerCpu, phrase };
}

/**
 * Le finding de taille — ou le REFUS d'en juger un.
 *
 * ⚠️ UN CORRECTIF PEUT RENDRE UN RELEVÉ HONNÊTE SANS LE RENDRE JUSTE, et c'est
 * ce qui s'est passé ici. Le rapport disait déjà « mesuré sur un debug », ce qui
 * est exact — puis jugeait quand même ces 92 Mo contre un budget de publication
 * que la release du même code tient à 30,2. Un `major` faux par construction,
 * pendant que la mesure utile n'était jamais prise : rien ne dit de construire
 * la release avant, et le déroulé la construit pour la dimension SÉCURITÉ, qui
 * vient après. Chronologie relevée sur un run réel — perf.json à 22:30:51,
 * app-release.apk à 22:32:30, la clé renseignée à 23:01:32.
 *
 * Alors on ne juge plus, on RÉCLAME : un finding `info` (donc sans effet sur le
 * gate — une release ne se construit pas à chaque run) qui porte les gestes
 * exacts. Le rapport cesse de contenir un verdict faux et se met à contenir une
 * tâche visible.
 * @param {{path:string, isRelease:boolean}} pese @param {number|null} sizeMb
 * @param {any} config @param {string} platform @param {string} buildCmd
 * @returns {any|null}
 */
export function sizeFinding(pese, sizeMb, config, platform, buildCmd) {
  const budget = (config?.thresholds ?? {}).binarySizeMb;
  const variante = /-debug\.(apk|aab)$/i.test(String(pese.path ?? '')) ? 'debug' : '';
  if (pese.isRelease) return thresholdFinding('QAM-PERF-SIZE', 'Taille du binaire', sizeMb, budget, 'Mo', 'performance', variante);

  const cle = platform === 'ios' ? 'iosScan' : 'androidScan';
  const declare = String((config?.build ?? {})[cle] ?? '');
  // Le chemin proposé est DÉRIVÉ de celui du binaire de test : un projet à
  // flavors donne `app-dev-debug.apk`, donc `app-dev-release.apk`, et non le
  // chemin par défaut de Flutter qui n'existerait pas chez lui.
  // ⚠️ CETTE DÉRIVATION ÉTAIT DE FORME ANDROID, et elle prescrivait le contraire
  // de ce que la config interdit (point 228). Elle remplace `-debug.` par
  // `-release.` ; un chemin iOS n'en contient pas, donc le remplacement était un
  // no-op et le finding disait `build.iosScan: …/iphonesimulator/Runner.app` —
  // pendant que le commentaire de cette clé dit « `iphoneos`, PAS
  // `iphonesimulator` : un .app de simulateur ne porte ni la même architecture
  // ni la même signature ». La prescription est partie telle quelle dans un
  // rapport PUBLIÉ.
  //
  // Elle DÉRIVE du chemin mesuré des deux côtés, plutôt que de figer un nom :
  // un projet dont la cible ne s'appelle pas `Runner` garderait sinon le nom
  // par défaut dans une consigne qui le concerne.
  const attendu = platform === 'ios'
    ? (String(pese.path ?? '').includes('iphonesimulator')
      ? String(pese.path).replace('iphonesimulator', 'iphoneos')
      : 'build/ios/iphoneos/Runner.app')
    : String(pese.path ?? '').replace(/-debug\./, '-release.');
  const gestes = declare
    ? [`\`${cle}\` déclare ${declare}, mais le fichier n'est pas là — construis-le : ${buildCmd}`]
    : [`construis la release : ${buildCmd}`,
      `déclare-la dans argus.mobile.yaml : build.${cle}: ${attendu || '<le binaire que tu publies>'}`];
  return {
    id: 'QAM-PERF-SIZE-UNMEASURED', title: 'Taille de publication non mesurée',
    dimension: 'performance', severity: 'info',
    expected: budget ? `≤ ${budget} Mo sur le binaire publié` : 'une mesure sur le binaire publié',
    actual: sizeMb === null
      ? `aucun binaire pesé (${pese.path || 'aucun chemin déclaré'})`
      : `${sizeMb} Mo mesurés sur ${pese.path} — un binaire de TEST, sans rapport avec ce que reçoivent les utilisateurs`,
    suggestedFix: [...gestes, 'puis relance `make argus-perf` : c\'est la seule mesure comparable au budget.'].join('\n'),
    status: 'open',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Point d'entrée
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le rapport d'une plateforme dont le DÉMARRAGE ne se mesure pas ici — mais
 * dont la taille du binaire, elle, a été pesée.
 *
 * ⚠️ **`metrics` n'est pas décoratif : c'est le SEUL endroit que le rapport
 * lit.** `perfRows` fait `if (!metrics) return ''`, si bien qu'un perf.json iOS
 * qui n'écrivait la taille qu'à la racine la faisait disparaître du bandeau —
 * une valeur pourtant mesurée et comparée à son budget. Rien ne le disait :
 * sous le budget, aucun finding ne la porte non plus, et l'absence se lit comme
 * « pas mesuré ». `report-format-mobile.md` promet `binaryPath` et
 * `binaryIsRelease` sans réserve de plateforme ; la décision existait côté
 * Android et n'avait jamais traversé.
 *
 * 📌 Extrait de `main()` exprès, comme `pertePossible` : laissé dedans, il ne
 * serait gardable qu'en cherchant son texte dans la source — le barreau le plus
 * faible, celui qu'une valeur neutralisée laisse vert. Ici le garde APPELLE et
 * lit ce qui revient. La clé de racine est conservée : des rapports archivés la
 * portent.
 *
 * @param {string} platform @param {{path:string,isRelease:boolean}} pese
 * @param {number|null} sizeMb @param {any} config @param {any[]} findings
 * @returns {any}
 */
export function rapportSansDemarrage(platform, pese, sizeMb, config, findings) {
  return {
    platform,
    skipped: true,
    skipReason: 'iOS : aucun équivalent local de `adb shell am start -W` / `dumpsys gfxinfo`. '
      + 'Le démarrage iOS se mesure avec Instruments (App Launch, Animation Hitches), '
      + 'hors périmètre automatisable de ce harness.',
    binarySizeMb: sizeMb,
    metrics: {
      binarySizeMb: sizeMb,
      binaryPath: pese.path,
      binaryIsRelease: pese.isRelease,
    },
    thresholds: config?.thresholds ?? {},
    findings,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  const platform = opts.platform || (config.platforms ?? ['android'])[0];
  const reportPath = join(artifactsDir(config), 'perf.json');
  const thresholds = config.thresholds ?? {};
  const pese = binaryToWeigh(platform, config);
  const sizeMb = binarySizeMb(resolve(process.cwd(), pese.path));
  const buildRelease = releaseBuildCmd(config, undefined, platform);
  if (!pese.isRelease) {
    // Deux causes, deux messages : « pas déclarée » se répare dans la config,
    // « déclarée mais absente » se répare par un build. Rendre le premier quand
    // c'est le second envoie éditer une clé déjà bonne.
    const cle = platform === 'ios' ? 'iosScan' : 'androidScan';
    const declare = String((config.build ?? {})[cle] ?? '');
    warn(`taille mesurée sur ${pese.path} — un binaire de TEST : le budget binarySizeMb vise ce que tu publies.`);
    warn(declare
      ? `  build.${cle} déclare ${declare}, absent au moment de la mesure — construis-le : ${buildRelease}`
      : `  déclare build.${cle} et construis la release : ${buildRelease}`);
    warn('  Le rapport porte une tâche ouverte (QAM-PERF-SIZE-UNMEASURED), pas un verdict sur ce chiffre.');
  }

  // iOS : pas d'équivalent local à `am start -W`. On le DIT et on rapporte
  // `skipped`, plutôt que de rendre un vert qui laisserait croire à une mesure.
  if (platform !== 'android') {
    const findings = [sizeFinding(pese, sizeMb, config, platform, buildRelease)].filter(Boolean);
    writeJson(reportPath, rapportSansDemarrage(platform, pese, sizeMb, config, findings));
    warn('perf iOS non mesurée (voir skipReason dans perf.json) — seule la taille du binaire est relevée.');
    process.exit(exitCodeFor(findings, config.gate));
  }

  const tools = detectTools(['adb']);
  if (!tools.adb.present) {
    err(missingToolMessage('adb'));
    writeJson(reportPath, { platform, skipped: true, skipReason: 'adb absent', findings: [] });
    process.exit(2);
  }

  // ⚠️ `config` PASSÉE, jamais omise : sans elle, l'AVD déclaré est ignoré et
  // c'est le premier émulateur venu qui est mesuré — en silence. Un garde de
  // CÂBLAGE le tient, parce qu'un paramètre optionnel non passé est légal.
  const picked = opts.device ? { udid: opts.device, why: '' } : defaultAndroidDevice(config);
  if (!picked.udid) {
    err(picked.why);
    process.exit(2);
  }
  const udid = picked.udid;
  const packageName = config.app.androidPackage;
  const component = launchComponent(udid, packageName);
  if (!component) {
    err(`activité de lancement introuvable pour ${packageName} — l'app est-elle installée sur ${udid} ?`);
    err('  node scripts/argus/argus-mobile.mjs run installe et vérifie l\'installation.');
    process.exit(2);
  }

  log(`mesures sur ${udid} · ${component}`);

  // ⚠️ UNE PHASE, UNE LIGNE. Ce bloc était muet de bout en bout : entre le log
  // ci-dessus et celui des résultats, il n'y avait rien — pendant N démarrages
  // à froid (chacun un `force-stop` + un `am start -W`), N à chaud, une passe
  // et une de mémoire. Mesuré au run 9 : deux exécutions au-delà de
  // 10 min contre trois à 5 s, même commande et même device, sans une ligne
  // pour distinguer « ça calcule » de « ça ne rendra jamais la main ». La
  // variable n'a jamais été isolée, donc rien ici ne prétend l'expliquer :
  // ces logs ne corrigent pas la lenteur, ils la rendent LISIBLE.
  log(`  démarrages à froid (${opts.samples} + le premier lancement)…`);
  const cold = measureColdStarts(udid, packageName, component, opts.samples);
  log(`  démarrages à chaud (${opts.samples})…`);
  const warm = measureWarmStarts(udid, component, opts.samples);
  // ⚠️ UNE MESURE QUI A EXPIRÉ N'EST PAS UNE MESURE ABSENTE. Sans cette ligne,
  // les échantillons restants font une médiane parfaitement lisible, calculée
  // sur ce qui a bien voulu répondre — un chiffre juste sur un échantillon
  // amputé, ce qui est la forme la plus discrète d'un relevé faux.
  const expirations = cold.timedOut + warm.timedOut;
  if (expirations > 0) {
    warn(`${expirations} lancement(s) sur ${2 * opts.samples + 1} n'ont pas rendu la main dans le plafond de sonde.`);
    warn('  Les médianes ci-dessous portent sur les échantillons SURVIVANTS : `timedOutLaunches` les compte dans perf.json.');
  }
  // ⚠️ L'APP DOIT ÊTRE EN VIE POUR QU'ON PUISSE LA PESER, et rien ne le
  // garantissait ici : `dumpsys meminfo` rend « No process found » sur un
  // processus mort, la regex ne matche pas, et `memoryMb` valait **null** — un
  // trou qui traversait toute la chaîne sans un mot, ni finding, ni « sauté ».
  // Mesuré sur un projet réel : 314,6 Mo relevés à la main pour un budget de
  // 250, donc un finding `major` que le rapport avait silencieusement perdu.
  log('  mémoire…');
  timedLaunch(udid, component);
  let memoryMb = measureMemory(udid, packageName);
  if (memoryMb === null) {
    // Une seconde chance APRÈS UN VRAI DÉLAI : le processus peut n'être pas
    // encore visible de `dumpsys`. Le commentaire promettait « après un
    // instant » et le code rappelait la sonde dans la foulée — le seul délai
    // était celui d'un aller-retour adb, ni choisi ni mesuré, donc la seconde
    // chance n'en était pas une. `Atomics.wait` attend sans boucler à vide,
    // comme la relance de `a11y.mjs`.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, MEMOIRE_SECONDE_CHANCE_MS);
    memoryMb = measureMemory(udid, packageName);
  }
  if (memoryMb === null) {
    warn('mémoire non mesurée — `dumpsys meminfo` n\'a rendu aucun TOTAL PSS.');
    warn(`  L'app était-elle en vie ? \`adb -s ${udid} shell dumpsys meminfo ${packageName}\``);
    warn('  Le rapport porte `memoryMb: null` : c\'est une mesure ABSENTE, pas un budget tenu.');
  }
  const context = deviceContext(udid, packageName);

  if (cold.medianMs === null && warm.medianMs === null) {
    // ⚠️ DEUX CAUSES, DEUX MESSAGES. « Activity not started » envoie vérifier
    // l'activité de lancement ; une expiration envoie vérifier le device. Rendre
    // le premier quand c'est le second nomme un symptôme qui n'a pas eu lieu.
    if (expirations > 0) {
      err(`aucun lancement chronométrable : ${expirations} commande(s) tuée(s) au plafond de ${Math.round(PROBE_TIMEOUT_MS / 1000)} s.`);
      err(`  Le device n'a pas répondu — \`adb -s ${udid} shell am start -W -n ${component}\` à la main le dira.`);
      err('  Relève ARGUS_SH_TIMEOUT_MS si la machine est simplement lente ; ce n\'est pas un défaut de l\'app.');
    } else {
      err('aucun lancement chronométrable : `am start -W` n\'a rendu que des « Activity not started ».');
      err(`  Vérifie que ${component} est bien l'activité de lancement et que l'app n'est pas figée.`);
    }
    writeJson(reportPath, {
      platform, device: { udid }, package: packageName, skipped: true,
      skipReason: expirations > 0
        ? `aucun échantillon : ${expirations} lancement(s) expiré(s) au plafond de sonde`
        : 'aucun échantillon de démarrage valide',
      timedOutLaunches: expirations, findings: [],
    });
    process.exit(2);
  }

  // Le variant du paquet MESURÉ, lu sur l'appareil — et non déduit de la
  // commande de build, qui dit ce qu'on aurait construit et pas ce qui a été
  // chronométré. Ce script n'installe rien : peser une release sans la poser
  // laissait `binaryIsRelease: true` au-dessus d'un chrono de debug, mesuré à
  // 1213 ms contre 532 sur le même appareil.
  const variante = installedVariant(udid, packageName);
  if (!variante) {
    warn('variant du paquet installé non lu — les findings de démarrage et de mémoire partiront sans le dire.');
    warn(`  \`adb -s ${udid} shell dumpsys package ${packageName}\` doit rendre une ligne \`flags=[ … ]\`.`);
    warn('  Le rapport ne dira RIEN plutôt que de supposer une release : une absence de mesure n\'est pas un bon résultat.');
  }
  const mesure = startupMetricLabel();
  // L'état de l'hôte, relevé À L'INSTANT de la mesure et non après coup. Un
  // `emulator-<port>` partage le CPU de la machine ; un appareil physique non.
  const hote = hostContext(/^emulator-/.test(udid));
  const findings = [
    // ⚠️ `variante` ET `hote` sur les DEUX démarrages : ce sont les métriques
    // les plus sensibles au binaire mesuré comme à la machine qui mesure, et
    // ce sont précisément les deux qui partaient sans rien dire de l'un ni de
    // l'autre — pendant que la mémoire, moins grave, portait sa réserve.
    ...launchTimeFindings(cold, warm, thresholds, variante, hote),
    thresholdFinding('QAM-PERF-MEM', 'Mémoire (TOTAL PSS)', memoryMb, thresholds.memoryMb, 'Mo', 'performance', variante),
    sizeFinding(pese, sizeMb, config, platform, buildRelease),
  ].filter(Boolean);

  const report = {
    platform, device: { udid, ...context }, package: packageName,
    // ⚠️ Écrit MÊME quand aucun seuil n'est dépassé : c'est ce qui permet de
    // comparer deux runs entre eux, et c'est cette comparaison — pas un seuil —
    // qui a démenti un jour un « le plafond est trop bas » parfaitement plausible.
    host: { loadAvg1: hote.loadAvg1, cpuCount: hote.cpuCount, loadPerCpu: hote.loadPerCpu },
    metrics: {
      // Ce que `am start -W` mesure, écrit À CÔTÉ du chiffre — la phrase
      // existait, elle était construite, et elle n'était écrite nulle part.
      startupMetric: mesure,
      // Isolé du régime stabilisé : c'est un état réel, pas une valeur aberrante.
      firstLaunchMs: cold.firstLaunchMs,
      coldStartMs: cold.medianMs, coldStartSamples: cold.samples,
      warmStartMs: warm.medianMs, warmStartSamples: warm.samples, warmStartMetric: warm.metric,
      memoryMb, binarySizeMb: sizeMb,
      // Combien de lancements ont été tués au plafond : sans ce compte, une
      // médiane calculée sur deux échantillons au lieu de cinq se lit comme
      // n'importe quelle autre.
      timedOutLaunches: expirations,
      // QUEL binaire a été pesé, et s'il s'agit de celui qu'on publierait : sans
      // ces deux-là, « 92 Mo » et « 30 Mo » se lisent comme le même relevé.
      binaryPath: pese.path, binaryIsRelease: pese.isRelease,
      // ⚠️ ET CE N'EST PAS LE MÊME BINAIRE que celui qui a été chronométré. Ces
      // deux clés-ci décrivent l'APK PESÉ sur le disque ; `coldStartMs`,
      // `warmStartMs` et `memoryMb` décrivent le paquet POSÉ sur l'appareil, que
      // ce script n'installe pas. Peser une release sans la poser rendait donc
      // `binaryIsRelease: true` au-dessus d'un chrono de debug — le fichier
      // n'omettait pas la réserve, il AFFIRMAIT le contraire. Les deux valeurs
      // cohabitent désormais nommément, et se lisent l'une contre l'autre.
      measuredVariant: variante,
    },
    thresholds, findings,
  };
  writeJson(reportPath, report);

  log(`premier lancement ${cold.firstLaunchMs ?? '?'} ms · à froid ${cold.medianMs ?? '?'} ms · à chaud ${warm.medianMs ?? '?'} ms`);
  log(`mémoire ${memoryMb ?? '?'} Mo · binaire ${sizeMb ?? '?'} Mo`);
  if (cold.firstLaunchMs && cold.medianMs && cold.firstLaunchMs > cold.medianMs * 1.5) {
    warn(`premier lancement ${Math.round((cold.firstLaunchMs / cold.medianMs) * 10) / 10}× plus lent que le régime stabilisé — chaque utilisateur le vit une fois.`);
  }
  log(`rapport : ${reportPath}`);
  process.exit(exitCodeFor(findings, config.gate));
}

// Comme pour run.mjs : ne lancer que si CE fichier est le point d'entrée. Sans
// ce garde, l'importer pour en tester une fonction déclencherait un vrai run —
// et c'est ce qui rendait ces scripts intestables, donc non testés.
// ⚠️ `realpathSync` DES DEUX CÔTÉS. `resolve()` normalise sans résoudre les
// liens symboliques, or `import.meta.url` porte le chemin RÉEL : lancé par un
// chemin qui traverse un lien (sur macOS, `$TMPDIR` et `/tmp` en sont),
// le script ne se reconnaît pas, `main()` n'est jamais appelé — pas de sortie,
// pas d'erreur, exit 0. Mesuré : `node scripts/argus/perf.mjs` mesure,
// `node /var/folders/…/perf.mjs` ne fait rien et rend 0.
const invokedDirectly = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
