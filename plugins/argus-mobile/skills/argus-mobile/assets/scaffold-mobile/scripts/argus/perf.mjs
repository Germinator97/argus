#!/usr/bin/env node
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
 *   node scripts/argus/perf.mjs
 *   node scripts/argus/perf.mjs --samples=5 --device=<udid>
 *
 * Codes de sortie : 0 vert · 1 major · 2 blocker/critical ou outillage absent.
 */

import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  artifactsDir, defaultAndroidDevice, detectTools, err, exitCodeFor, loadConfig, log,
  missingToolMessage, sh, warn, writeJson,
} from './config.mjs';

const MB = 1024 * 1024;

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
 * @param {string} udid @param {string[]} args
 */
const adb = (udid, args) => sh('adb', udid ? ['-s', udid, ...args] : args);

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
 * @param {string} udid @param {string} component
 * @returns {{totalMs:number|null, waitMs:number|null, kind:'launched'|'resumed'|'none'}}
 */
function timedLaunch(udid, component) {
  const res = adb(udid, ['shell', 'am', 'start', '-W', '-n', component]);
  const out = res.stdout;
  if (/top-most instance/i.test(out)) return { totalMs: null, waitMs: null, kind: 'none' };
  const total = /TotalTime:\s*(\d+)/.exec(out);
  const wait = /WaitTime:\s*(\d+)/.exec(out);
  const waitMs = wait ? Number.parseInt(wait[1], 10) : null;
  if (/brought to the front/i.test(out)) return { totalMs: null, waitMs, kind: 'resumed' };
  const totalMs = total ? Number.parseInt(total[1], 10) : null;
  return { totalMs: totalMs === 0 ? null : totalMs, waitMs, kind: 'launched' };
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
  for (let i = 0; i < samples + 1; i += 1) {
    adb(udid, ['shell', 'am', 'force-stop', packageName]);
    const { totalMs } = timedLaunch(udid, component);
    if (totalMs !== null) values.push(totalMs);
  }
  return { firstLaunchMs: values[0] ?? null, samples: values.slice(1), medianMs: median(values.slice(1)) };
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
  for (let i = 0; i < samples; i += 1) {
    adb(udid, ['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
    const { totalMs, waitMs, kind } = timedLaunch(udid, component);
    const value = kind === 'resumed' ? waitMs : totalMs;
    if (value !== null) values.push(value);
  }
  return { samples: values, medianMs: median(values), metric: 'WaitTime (retour au premier plan)' };
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

// ═══════════════════════════════════════════════════════════════════════════
// Taille du binaire
// ═══════════════════════════════════════════════════════════════════════════

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
export function thresholdFinding(id, label, value, budget, unit, dimension = 'performance', variante = '') {
  if (value === null || value === undefined || value <= budget) return null;
  // ⚠️ Un budget est écrit pour la PUBLICATION. Appliqué à un build debug, il
  // rend un `major` sur une valeur qui n'a aucun rapport avec ce que les
  // utilisateurs reçoivent : mesuré sur un projet réel, 117,5 Mo contre un
  // budget de 60, quand la release du même projet fait 32,1. La config avertit
  // déjà pour les permissions ; ces deux métriques-ci sont encore plus
  // sensibles au variant, et le finding le disait nulle part.
  const misePlusieurs = variante === 'debug'
    ? '\n⚠️ Mesuré sur un binaire DEBUG : ce budget décrit la publication. '
      + 'Compare-le à la release avant de conclure — l\'écart est couramment d\'un facteur trois.'
    : '';
  return {
    id, title: `${label} au-dessus du budget${variante === 'debug' ? ' (mesuré sur un debug)' : ''}`, dimension,
    severity: value > budget * 2 ? 'critical' : 'major',
    expected: `≤ ${budget} ${unit}`, actual: `${value} ${unit}${variante ? ` (${variante})` : ''}`,
    suggestedFix: 'Profiler le chemin concerné avant d\'optimiser : un mécanisme plausible mais non isolé fait optimiser à côté.'
      + misePlusieurs,
    status: 'open',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Point d'entrée
// ═══════════════════════════════════════════════════════════════════════════

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
  const sizeMb = binarySizeMb(resolve(process.cwd(), platform === 'ios' ? config.build.ios : config.build.android));

  // iOS : pas d'équivalent local à `am start -W`. On le DIT et on rapporte
  // `skipped`, plutôt que de rendre un vert qui laisserait croire à une mesure.
  if (platform !== 'android') {
    const findings = [thresholdFinding('QAM-PERF-SIZE', 'Taille du binaire', sizeMb, thresholds.binarySizeMb, 'Mo')].filter(Boolean);
    writeJson(reportPath, {
      platform, skipped: true,
      skipReason: 'iOS : aucun équivalent local de `adb shell am start -W` / `dumpsys gfxinfo`. '
        + 'Le démarrage iOS se mesure avec Instruments (App Launch, Animation Hitches), '
        + 'hors périmètre automatisable de ce harness.',
      binarySizeMb: sizeMb, findings,
    });
    warn('perf iOS non mesurée (voir skipReason dans perf.json) — seule la taille du binaire est relevée.');
    process.exit(exitCodeFor(findings, config.gate));
  }

  const tools = detectTools(['adb']);
  if (!tools.adb.present) {
    err(missingToolMessage('adb'));
    writeJson(reportPath, { platform, skipped: true, skipReason: 'adb absent', findings: [] });
    process.exit(2);
  }

  const picked = opts.device ? { udid: opts.device, why: '' } : defaultAndroidDevice();
  if (!picked.udid) {
    err(picked.why);
    process.exit(2);
  }
  const udid = picked.udid;
  const packageName = config.app.androidPackage;
  const component = launchComponent(udid, packageName);
  if (!component) {
    err(`activité de lancement introuvable pour ${packageName} — l'app est-elle installée sur ${udid} ?`);
    err('  node scripts/argus/run.mjs installe et vérifie l\'installation.');
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
  log('  mémoire…');
  const memoryMb = measureMemory(udid, packageName);
  const context = deviceContext(udid, packageName);

  if (cold.medianMs === null && warm.medianMs === null) {
    err('aucun lancement chronométrable : `am start -W` n\'a rendu que des « Activity not started ».');
    err(`  Vérifie que ${component} est bien l'activité de lancement et que l'app n'est pas figée.`);
    writeJson(reportPath, { platform, device: { udid }, package: packageName, skipped: true, skipReason: 'aucun échantillon de démarrage valide', findings: [] });
    process.exit(2);
  }

  // Le variant du binaire mesuré : `-debug.apk` dans le chemin suffit à le dire,
  // et c'est ce que le scaffold pointe par défaut.
  const variante = /-debug\.(apk|aab)$/i.test(String(config.build?.android ?? '')) ? 'debug' : '';
  // ⚠️ Ce que `am start -W` mesure, écrit à côté du chiffre : sans ça, il se lit
  // en regard de `startup.samples` du rapport principal — qui mesure l'écran
  // exploitable, splash compris — et l'écart passe pour une contradiction.
  const mesure = 'am start -W : jusqu\'à la première frame, splash de marque compris mais '
    + 'PAS l\'initialisation applicative qui suit. Le temps jusqu\'à l\'écran exploitable est '
    + 'dans startup.samples du rapport principal, et il est normalement plus grand.';
  const findings = [
    thresholdFinding('QAM-PERF-COLD', 'Démarrage à froid', cold.medianMs, thresholds.coldStartMs, 'ms'),
    thresholdFinding('QAM-PERF-WARM', 'Démarrage à chaud', warm.medianMs, thresholds.warmStartMs, 'ms'),
    thresholdFinding('QAM-PERF-MEM', 'Mémoire (TOTAL PSS)', memoryMb, thresholds.memoryMb, 'Mo', 'performance', variante),
    thresholdFinding('QAM-PERF-SIZE', 'Taille du binaire', sizeMb, thresholds.binarySizeMb, 'Mo', 'performance', variante),
  ].filter(Boolean);

  const report = {
    platform, device: { udid, ...context }, package: packageName,
    metrics: {
      // Isolé du régime stabilisé : c'est un état réel, pas une valeur aberrante.
      firstLaunchMs: cold.firstLaunchMs,
      coldStartMs: cold.medianMs, coldStartSamples: cold.samples,
      warmStartMs: warm.medianMs, warmStartSamples: warm.samples, warmStartMetric: warm.metric,
      memoryMb, binarySizeMb: sizeMb,
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
const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
