#!/usr/bin/env node
// @ts-check
/**
 * Argus Mobile — runner de la suite Maestro
 * ------------------------------------------------------------------------
 * Enchaîne : préparation du device → installation VÉRIFIÉE du binaire →
 * déterminisme → exécution Maestro → normalisation des artefacts en
 * argus-mobile-report/report.json → gating.
 *
 * Pourquoi le runner installe lui-même : `maestro test` n'a AUCUN flag pour
 * fournir un binaire. Maestro pilote une app déjà installée sur le device — il
 * ne l'installe jamais. (Seul `maestro cloud` prend un `--app-file`.)
 *
 * Usage :
 *   node scripts/argus-mobile-run.mjs
 *   node scripts/argus-mobile-run.mjs --platform=ios
 *   node scripts/argus-mobile-run.mjs --update-baselines
 *   node scripts/argus-mobile-run.mjs --dry-run
 *   node scripts/argus-mobile-run.mjs --tags=smoke,p0
 *
 * Codes de sortie (identiques au skill web) :
 *   0 = vert · 1 = major dans le gate · 2 = blocker/critical, ou outillage
 *       manquant, ou harness non configuré
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';

import {
  activeDevices, artifactsDir, configuredScreens, detectTools, err, exitCodeFor,
  loadConfig, log, missingToolMessage, parseYaml, sh, validateConfig, warn, writeJson,
} from './argus-mobile-config.mjs';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Arguments
// ═══════════════════════════════════════════════════════════════════════════

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = {
    platform: '', device: '', tags: '', excludeTags: '',
    updateBaselines: false, dryRun: false, install: true, verbose: false,
  };
  for (const arg of argv) {
    const [key, value] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, ''];
    if (key === '--platform') opts.platform = value;
    else if (key === '--device') opts.device = value;
    else if (key === '--tags') opts.tags = value;
    else if (key === '--exclude-tags') opts.excludeTags = value;
    else if (key === '--update-baselines') opts.updateBaselines = true;
    else if (key === '--dry-run') opts.dryRun = true;
    else if (key === '--no-install') opts.install = false;
    else if (key === '--verbose') opts.verbose = true;
    else if (key === '--help' || key === '-h') { printHelp(); process.exit(0); }
    else { err(`option inconnue : ${arg}`); printHelp(); process.exit(2); }
  }
  return opts;
}

function printHelp() {
  console.log(`Argus Mobile — runner

  --platform=android|ios   plateforme visée (défaut : la première de platforms)
  --device=<id>            device de argus.mobile.yaml → devices[].id
  --tags=a,b               n'exécuter que ces tags
  --exclude-tags=a,b       tags exclus EN PLUS de ceux de .maestro/config.yaml
  --update-baselines       (re)génère les références visuelles au lieu de comparer
  --no-install             ne réinstalle pas le binaire (itération rapide)
  --dry-run                imprime les commandes sans rien exécuter
  --verbose                relaie la sortie complète de Maestro
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Devices
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Devices Android connectés. `physical` distingue un vrai téléphone d'un
 * émulateur : la distinction pilote un garde-fou, pas seulement un affichage.
 * @returns {Array<{udid:string, physical:boolean}>}
 */
function listAndroidDevices() {
  const res = sh('adb', ['devices']);
  if (!res.ok) return [];
  return res.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => ({ udid: parts[0], physical: !parts[0].startsWith('emulator-') }));
}

/** @returns {Array<{udid:string, physical:boolean, name:string}>} */
function listIosBooted() {
  const res = sh('xcrun', ['simctl', 'list', '-j', 'devices', 'booted']);
  if (!res.ok) return [];
  try {
    const data = JSON.parse(res.stdout);
    return Object.values(data.devices ?? {})
      .flat()
      .map((/** @type {any} */ d) => ({ udid: d.udid, physical: false, name: d.name ?? '' }));
  } catch {
    return [];
  }
}

/**
 * Résout le device à piloter. Un téléphone RÉEL n'est jamais choisi
 * automatiquement : il faut l'avoir nommé par son udid ET l'avoir marqué
 * `physical: true` dans argus.mobile.yaml. Installer une app et effacer ses
 * données (clearState) sur le téléphone de quelqu'un par simple auto-détection
 * n'est pas une erreur récupérable.
 *
 * Le résultat distingue « absent » de « refusé » : démarrer un émulateur a du
 * sens dans le premier cas, jamais dans le second — un refus délibéré ne change
 * pas d'avis, et réessayer ne ferait que répéter le message deux fois.
 * @param {any} spec @param {boolean} dryRun
 * @returns {{status:'ok'|'absent'|'refused', device?:{udid:string, physical:boolean}}}
 */
function resolveDevice(spec, dryRun) {
  const listed = spec.platform === 'ios' ? listIosBooted() : listAndroidDevices();
  if (spec.udid) return resolveNamedDevice(spec, listed, dryRun);
  const auto = listed.find((d) => !d.physical);
  if (auto) return { status: 'ok', device: auto };
  if (listed.length > 0) {
    err(`aucun émulateur/simulateur pour « ${spec.platform} » — seuls des appareils réels sont branchés.`);
    err('  Argus ne les cible jamais automatiquement. Démarre un émulateur, ou nomme');
    err('  explicitement l\'udid dans argus.mobile.yaml avec « physical: true ».');
    return { status: 'refused' };
  }
  return { status: 'absent' };
}

/**
 * @param {any} spec @param {Array<{udid:string, physical:boolean}>} listed @param {boolean} dryRun
 * @returns {{status:'ok'|'absent'|'refused', device?:{udid:string, physical:boolean}}}
 */
function resolveNamedDevice(spec, listed, dryRun) {
  const found = listed.find((d) => d.udid === spec.udid);
  if (!found) return dryRun ? { status: 'ok', device: { udid: spec.udid, physical: false } } : { status: 'absent' };
  if (found.physical && spec.physical !== true) {
    err(`« ${spec.id} » désigne un appareil RÉEL (${spec.udid}) sans « physical: true ».`);
    err('  Argus installe le binaire et efface les données de l\'app (clearState).');
    err('  Ajoute « physical: true » à ce device si c\'est bien un appareil de test dédié.');
    return { status: 'refused' };
  }
  if (found.physical) warn(`appareil RÉEL ciblé (${spec.udid}) — vérifie qu'il ne porte aucune donnée personnelle.`);
  return { status: 'ok', device: found };
}

/**
 * Démarre un émulateur/simulateur via Maestro, dans la locale demandée.
 * @param {any} spec @param {string} locale @param {boolean} dryRun @returns {boolean}
 */
function startDevice(spec, locale, dryRun) {
  const args = ['start-device', '--platform', spec.platform];
  if (spec.model) args.push('--device-model', spec.model);
  if (spec.os) args.push('--device-os', spec.os);
  // `--device-locale` n'existe QUE sur start-device et cloud : c'est le seul
  // moment où la locale peut être fixée. Aucun flow ne peut la changer ensuite.
  if (locale) args.push('--device-locale', locale);
  log(`démarrage du device : maestro ${args.join(' ')}`);
  if (dryRun) return true;
  const res = sh('maestro', args, { stdio: 'inherit' });
  return res.ok;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Installation — et sa PREUVE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Installe le binaire et PROUVE qu'il est là.
 *
 * `adb install` peut échouer en rendant tout de même un statut favorable dans un
 * pipeline (stockage plein, signature incompatible) : on valide alors le
 * comportement de la version PRÉCÉDENTE, et le diagnostic part dans le décor.
 * D'où deux contrôles : la sortie doit contenir « Success », ET le paquet doit
 * apparaître dans la liste des paquets installés.
 * @param {string} platform @param {string} udid @param {string} binaryPath
 * @param {string} appId @param {boolean} dryRun
 * @returns {{ok:boolean, proof:string}}
 */
function installApp(platform, udid, binaryPath, appId, dryRun) {
  const missing = !existsSync(binaryPath);
  // En dry-run, un binaire absent se SIGNALE mais n'interrompt pas : le but est
  // justement de montrer le plan complet avant d'avoir construit quoi que ce soit.
  if (dryRun) return { ok: true, proof: missing ? `dry-run — binaire encore absent : ${binaryPath}` : 'dry-run' };
  if (missing) return { ok: false, proof: `binaire introuvable : ${binaryPath}` };
  return platform === 'ios'
    ? installIos(udid, binaryPath, appId)
    : installAndroid(udid, binaryPath, appId);
}

/**
 * @param {string} udid @param {string} apk @param {string} packageName
 * @returns {{ok:boolean, proof:string}}
 */
function installAndroid(udid, apk, packageName) {
  const res = sh('adb', ['-s', udid, 'install', '-r', apk]);
  const said = /Success/i.test(`${res.stdout}${res.stderr}`);
  if (!res.ok || !said) {
    const detail = (res.stderr || res.stdout || res.error || '').trim().split('\n').slice(-3).join(' ');
    return { ok: false, proof: `adb install n'a pas dit « Success » : ${detail || 'sortie vide'}` };
  }
  const listed = sh('adb', ['-s', udid, 'shell', 'pm', 'list', 'packages', packageName]);
  if (!listed.stdout.includes(`package:${packageName}`)) {
    return { ok: false, proof: `« Success » annoncé mais ${packageName} absent de pm list packages` };
  }
  return { ok: true, proof: `pm list packages confirme ${packageName}` };
}

/**
 * @param {string} udid @param {string} appPath @param {string} bundleId
 * @returns {{ok:boolean, proof:string}}
 */
function installIos(udid, appPath, bundleId) {
  const res = sh('xcrun', ['simctl', 'install', udid, appPath]);
  if (!res.ok) {
    return { ok: false, proof: `simctl install a échoué : ${(res.stderr || res.error || '').trim()}` };
  }
  const container = sh('xcrun', ['simctl', 'get_app_container', udid, bundleId, 'app']);
  if (!container.ok) {
    return { ok: false, proof: `installé sans erreur mais get_app_container ne trouve pas ${bundleId}` };
  }
  return { ok: true, proof: `get_app_container confirme ${bundleId}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Déterminisme
// ═══════════════════════════════════════════════════════════════════════════

/** Les trois échelles comptent : en couper deux laisse assez de mouvement pour rendre une capture instable. */
const ANIMATION_SCALES = ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'];

/**
 * Coupe les animations système et RELIT la valeur pour le prouver. Un
 * `settings put` peut échouer silencieusement selon l'image de l'émulateur.
 * @param {string} platform @param {string} udid @param {boolean} dryRun
 * @returns {{ok:boolean, detail:string}}
 */
function disableAnimations(platform, udid, dryRun) {
  if (platform !== 'android') {
    return { ok: false, detail: 'iOS : pas d\'équivalent local à `settings put` (disableAnimations du config.yaml est Cloud only)' };
  }
  if (dryRun) return { ok: true, detail: 'dry-run' };
  const readback = [];
  for (const key of ANIMATION_SCALES) {
    sh('adb', ['-s', udid, 'shell', 'settings', 'put', 'global', key, '0']);
    readback.push(sh('adb', ['-s', udid, 'shell', 'settings', 'get', 'global', key]).stdout.trim());
  }
  const ok = readback.every((v) => Number.parseFloat(v) === 0);
  return { ok, detail: `${ANIMATION_SCALES.length} échelles → ${readback.join(', ')}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Variables injectées dans les flows
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contrat d'injection consommé par les flows (`${…}`). Toutes les clés sont
 * toujours présentes, même vides : un flow doit pouvoir se garder sur une valeur
 * vide plutôt que sur une variable absente.
 * @param {any} config @param {string} appId @param {Record<string,string>} [extra]
 * @returns {Record<string,string>}
 */
function buildEnv(config, appId, extra = {}) {
  const screens = configuredScreens(config);
  const home = screens.find((s) => s.id === 'home') ?? screens[0];
  const anchors = config.auth?.anchors ?? {};
  /** @type {Record<string,string>} */
  const env = {
    APP_ID: appId,
    ARGUS_ANCHOR_HOME: home?.anchor ?? '',
    ARGUS_AUTH_SCREEN: anchors.screen ?? '',
    ARGUS_AUTH_USER: anchors.user ?? '',
    ARGUS_AUTH_PASS: anchors.password ?? '',
    ARGUS_AUTH_SUBMIT: anchors.submit ?? '',
    ARGUS_AUTH_SUCCESS: anchors.success ?? '',
    ARGUS_DEEPLINK: (config.deepLinks ?? [])[0] ?? '',
    ARGUS_VISUAL_THRESHOLD: String(config.thresholds?.visualMatchPercentage ?? 99),
    ARGUS_SCREEN_ID: '',
    ARGUS_SCREEN_ANCHOR: '',
    ARGUS_BASELINE_DIR: '',
    ARGUS_VISUAL_MODE: 'assert',
    ARGUS_ANIMATIONS_DISABLED: 'false',
    ...extra,
  };
  // Secrets : uniquement depuis l'environnement, jamais depuis le fichier.
  for (const name of config.auth?.secretsFromEnv ?? []) {
    env[name] = process.env[name] ?? '';
  }
  return env;
}

/** Aplati le contrat en `-e K=V`. */
/** @param {Record<string,string>} env @returns {string[]} */
const envArgs = (env) => Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${String(v).replace(/\n/g, ' ')}`]);

// ═══════════════════════════════════════════════════════════════════════════
// 6. Exécution Maestro
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tags exclus par .maestro/config.yaml — à ré-émettre car le flag CLI REMPLACE le fichier.
 * @returns {string[]}
 */
function configExcludeTags() {
  const path = resolve(process.cwd(), '.maestro/config.yaml');
  if (!existsSync(path)) return [];
  try {
    const parsed = parseYaml(readFileSync(path, 'utf8'), '.maestro/config.yaml');
    return Array.isArray(parsed?.excludeTags) ? parsed.excludeTags.map(String) : [];
  } catch (e) {
    warn(`.maestro/config.yaml illisible (${e instanceof Error ? e.message.split('\n')[0] : e}) — tags exclus non repris.`);
    return [];
  }
}

/**
 * Lance une exécution Maestro. `--device` est une option GLOBALE : elle doit
 * précéder le sous-commande `test`, sans quoi Maestro ne la voit pas.
 * @param {{udid:string, target:string, junitPath:string, outputDir:string,
 *          env:Record<string,string>, includeTags:string[], excludeTags:string[],
 *          dryRun:boolean, verbose:boolean}} params
 * @returns {{ok:boolean, status:number, command:string}}
 */
function runMaestro({ udid, target, junitPath, outputDir, env, includeTags, excludeTags, dryRun, verbose }) {
  const args = [];
  if (udid) args.push(`--device=${udid}`);
  args.push('test', '--format', 'junit', '--output', junitPath, '--test-output-dir', outputDir);
  if (includeTags.length) args.push('--include-tags', includeTags.join(','));
  if (excludeTags.length) args.push('--exclude-tags', excludeTags.join(','));
  args.push(...envArgs(env), target);

  const shown = `maestro ${args.map((a) => (a.startsWith('QA_') || /^(QA_[A-Z_]+)=/.test(a) ? a.replace(/=.*/, '=***') : a)).join(' ')}`;
  log(shown);
  if (dryRun) return { ok: true, status: 0, command: shown };
  const res = sh('maestro', args, verbose ? { stdio: 'inherit' } : {});
  if (!verbose && !res.ok) console.error(res.stdout || res.stderr);
  return { ok: res.ok, status: res.status, command: shown };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Récolte des artefacts (contrat documenté : manifest.json + commands.json)
// ═══════════════════════════════════════════════════════════════════════════

/** @param {string} dir @returns {string[]} */
const subdirs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()) : []);

/**
 * Lit les dossiers de session apparus depuis `before` et rend un bundle par flow.
 * Le manifeste est le contrat documenté : on le lit plutôt que de balayer le
 * dossier à l'aveugle.
 * @param {string} outputDir @param {Set<string>} before
 * @returns {Array<{flow:string, dir:string, steps:any[], artifacts:any[]}>}
 */
function harvest(outputDir, before) {
  const sessions = subdirs(outputDir).filter((name) => !before.has(name));
  /** @type {Array<{flow:string, dir:string, steps:any[], artifacts:any[]}>} */
  const bundles = [];
  for (const session of sessions) {
    const sessionDir = join(outputDir, session);
    for (const flow of subdirs(sessionDir)) {
      const dir = join(sessionDir, flow);
      bundles.push({
        flow,
        dir,
        steps: readJsonSafe(join(dir, 'commands.json')) ?? [],
        artifacts: readJsonSafe(join(dir, 'manifest.json'))?.artifacts ?? [],
      });
    }
  }
  return bundles;
}

/** @param {string} path @returns {any} */
function readJsonSafe(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Une étape en échec devient un finding portant sa preuve.
 * @param {Array<{flow:string, dir:string, steps:any[], artifacts:any[]}>} bundles
 * @param {any} device @param {string} platform @param {any} config @returns {any[]}
 */
function findingsFrom(bundles, device, platform, config) {
  /** @type {any[]} */
  const findings = [];
  for (const bundle of bundles) {
    const failed = bundle.steps.filter((s) => String(s?.status ?? '').toUpperCase() === 'FAILED');
    for (const [index, step] of failed.entries()) {
      findings.push({
        id: `QAM-${String(findings.length + 1).padStart(3, '0')}`,
        title: step.label ?? step.command ?? `étape ${step.sequenceNumber ?? index}`,
        severity: severityForFlow(bundle.flow, config),
        dimension: dimensionForFlow(bundle.flow),
        screen: bundle.flow,
        step: step.sequenceNumber ?? index,
        selector: selectorOf(step),
        device: device.id,
        platform,
        osVersion: device.os ?? '',
        expected: 'étape réussie',
        actual: String(step.error ?? 'échec sans message'),
        evidence: bundle.artifacts.map((a) => join(bundle.dir, a.relativePath ?? '')).filter(Boolean),
        repro: [`maestro --device=${device.udid} test .maestro/${bundle.flow}.yaml`],
        status: 'open',
      });
    }
  }
  return findings;
}

/**
 * Un flow p0 qui casse est bloquant : plus rien derrière lui n'a de valeur.
 * @param {string} flow @param {any} config @returns {string}
 */
function severityForFlow(flow, config) {
  if (flow.startsWith('smoke')) return 'blocker';
  if (flow.startsWith('journey')) return 'critical';
  if (flow.startsWith('visual')) return config.gate?.failOnVisualDiff ? 'major' : 'minor';
  return 'major';
}

/** @type {Record<string,string>} */
const DIMENSION_BY_FLOW = {
  smoke: 'functional', 'journey-critical': 'functional', visual: 'visual',
  a11y: 'a11y', resilience: 'resilience', lifecycle: 'stability', i18n: 'i18n',
};

/** @param {string} flow @returns {string} */
const dimensionForFlow = (flow) => DIMENSION_BY_FLOW[flow.replace(/-\d+$/, '')] ?? 'functional';

/** @param {any} step @returns {string} */
function selectorOf(step) {
  const raw = JSON.stringify(step?.command ?? {});
  const byId = /"id"\s*:\s*"([^"]+)"/.exec(raw);
  if (byId) return `id=${byId[1]}`;
  const byText = /"text"\s*:\s*"([^"]+)"/.exec(raw);
  return byText ? `text=${byText[1]}` : '';
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Baselines visuelles
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recopie les captures produites en mode `update` vers le dossier de références.
 * Elles sont rangées PAR DEVICE : une baseline est liée au couple device + OS,
 * et une référence prise sur un simulateur ne correspondra jamais au rendu de
 * l'émulateur de la CI.
 * @param {Array<{dir:string}>} bundles @param {string} baselineDir
 * @returns {number} nombre de références écrites
 */
function promoteBaselines(bundles, baselineDir) {
  let written = 0;
  for (const bundle of bundles) {
    const shots = join(bundle.dir, 'takeScreenshot');
    if (!existsSync(shots)) continue;
    mkdirSync(baselineDir, { recursive: true });
    for (const file of readdirSync(shots).filter((f) => f.endsWith('.png'))) {
      cpSync(join(shots, file), join(baselineDir, file));
      log(`référence visuelle : ${join(baselineDir, basename(file))}`);
      written += 1;
    }
  }
  return written;
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Point d'entrée
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let config;
  try {
    config = loadConfig();
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  const problems = validateConfig(config);
  for (const p of problems) (p.level === 'error' ? err : warn)(p.message);
  if (problems.some((p) => p.level === 'error') && !opts.dryRun) process.exit(2);

  // Un harness dont aucune ancre n'est renseignée ne teste RIEN. Le dire, et
  // sortir en 2 : un vert obtenu en n'exécutant aucune assertion est le pire
  // résultat possible pour une garde de non-régression.
  const screens = configuredScreens(config);
  if (screens.length === 0 && config.gate?.failOnEmptyRun && !opts.dryRun) {
    err('aucun écran n\'a d\'ancre sémantique : la suite ne testerait rien.');
    err('  Renseigne screens[].anchor dans argus.mobile.yaml (et pose les');
    err('  Semantics(identifier: …) correspondants côté Dart), puis relance.');
    err('  Pour lever ce garde volontairement : gate.failOnEmptyRun: false.');
    process.exit(2);
  }

  const tools = detectTools(['maestro', 'adb', 'xcrun']);
  if (!tools.maestro.present && !opts.dryRun) {
    err(missingToolMessage('maestro'));
    process.exit(2);
  }

  const platform = opts.platform || (config.platforms ?? ['android'])[0];
  const appId = platform === 'ios' ? config.app.iosBundleId : config.app.androidPackage;
  const specs = activeDevices(config).filter((d) => d.platform === platform && (!opts.device || d.id === opts.device));
  if (specs.length === 0) {
    err(`aucun device « ${platform} » dans argus.mobile.yaml${opts.device ? ` avec l'id « ${opts.device} »` : ''}.`);
    process.exit(2);
  }
  const spec = specs[0];

  let attempt = resolveDevice(spec, opts.dryRun);
  // On ne réessaie QUE si le device est simplement absent. Un refus (appareil
  // réel non consenti) ne se rattrape pas en démarrant un émulateur.
  if (attempt.status === 'absent' && spec.autoStart) {
    startDevice(spec, config.locale?.deviceLocale, opts.dryRun);
    attempt = resolveDevice(spec, opts.dryRun);
  }
  if (attempt.status !== 'ok' || !attempt.device) {
    err(`aucun device utilisable pour « ${spec.id} » (${attempt.status === 'refused' ? 'refusé par garde-fou' : 'absent'}).`);
    process.exit(2);
  }
  const resolved = attempt.device;

  const reportDir = artifactsDir(config);
  const outputDir = join(reportDir, 'maestro');
  mkdirSync(outputDir, { recursive: true });
  const baselineDir = resolve(process.cwd(), config.artifacts?.baselines ?? '.maestro/_baselines', spec.id);

  // ── Installation ────────────────────────────────────────────────────────
  let install = { ok: true, proof: 'installation ignorée (--no-install)' };
  if (opts.install) {
    const binary = resolve(process.cwd(), platform === 'ios' ? config.build.ios : config.build.android);
    install = installApp(platform, resolved.udid, binary, appId, opts.dryRun);
    if (!install.ok) {
      err(`installation non prouvée — ${install.proof}`);
      err(`  Construis le binaire : ${platform === 'ios' ? config.build.iosBuildCmd : config.build.androidBuildCmd}`);
      process.exit(2);
    }
    log(`installation prouvée — ${install.proof}`);
  } else {
    warn(install.proof);
  }

  const animations = disableAnimations(platform, resolved.udid, opts.dryRun);
  (animations.ok ? log : warn)(`animations : ${animations.detail}`);

  const secretsPassed = (config.auth?.secretsFromEnv ?? []).filter((/** @type {string} */ n) => process.env[n]);
  if (secretsPassed.length) {
    warn(`${secretsPassed.join(', ')} passés à Maestro via -e : visibles dans \`ps\` le temps du run.`);
  }

  const excludeTags = [...new Set([...configExcludeTags(), ...opts.excludeTags.split(',').filter(Boolean)])];
  const includeTags = opts.tags.split(',').filter(Boolean);
  const baseEnv = buildEnv(config, appId, { ARGUS_ANIMATIONS_DISABLED: String(animations.ok) });

  const before = new Set(subdirs(outputDir));
  const runs = [];

  // ── Suite principale (le visuel a sa propre boucle) ─────────────────────
  runs.push(runMaestro({
    udid: resolved.udid, target: '.maestro', junitPath: join(reportDir, 'report.junit.xml'),
    outputDir, env: baseEnv, includeTags, excludeTags: [...excludeTags, 'visual'],
    dryRun: opts.dryRun, verbose: opts.verbose,
  }));

  // ── Boucle visuelle : un passage par écran ──────────────────────────────
  // Un flow Maestro ne sait pas itérer sur une liste d'écrans, et surtout il ne
  // saurait pas naviguer vers chacun. C'est donc le runner qui boucle.
  const visualScreens = screens.filter((s) => s.visual !== false);
  const visualMode = opts.updateBaselines ? 'update' : 'assert';
  if (visualMode === 'assert' && !existsSync(baselineDir)) {
    warn(`aucune référence visuelle dans ${baselineDir} → dimension VISUAL non exécutée.`);
    warn('  Génère-les : node scripts/argus-mobile-run.mjs --update-baselines');
  } else {
    for (const screen of visualScreens) {
      runs.push(runMaestro({
        udid: resolved.udid, target: '.maestro/visual.yaml',
        junitPath: join(reportDir, `report.visual-${screen.id}.junit.xml`), outputDir,
        env: buildEnv(config, appId, {
          ARGUS_ANIMATIONS_DISABLED: String(animations.ok),
          ARGUS_SCREEN_ID: screen.id, ARGUS_SCREEN_ANCHOR: screen.anchor,
          ARGUS_BASELINE_DIR: baselineDir, ARGUS_VISUAL_MODE: visualMode,
        }),
        includeTags: [], excludeTags: [], dryRun: opts.dryRun, verbose: opts.verbose,
      }));
    }
  }

  if (opts.dryRun) {
    log(`dry-run : ${runs.length} exécution(s) Maestro auraient été lancées.`);
    process.exit(0);
  }

  // ── Normalisation ───────────────────────────────────────────────────────
  const bundles = harvest(outputDir, before);
  if (opts.updateBaselines) {
    const written = promoteBaselines(bundles, baselineDir);
    log(`${written} référence(s) visuelle(s) écrite(s) dans ${baselineDir}`);
  }

  const findings = findingsFrom(bundles, { ...spec, udid: resolved.udid }, platform, config);
  const report = {
    run: {
      startedAt: new Date().toISOString(), platform, appVersion: config.app.name,
      flavor: config.app.flavor, appId,
      devices: [{ id: spec.id, udid: resolved.udid, model: spec.model ?? '', os: spec.os ?? '', physical: resolved.physical }],
      animationsDisabled: animations.ok, installProof: install.proof,
    },
    summary: {
      flowsExecuted: bundles.length,
      findings: Object.fromEntries(['blocker', 'critical', 'major', 'minor', 'info'].map((s) => [s, findings.filter((f) => f.severity === s).length])),
    },
    findings,
    coverage: {
      screensDeclared: (config.screens ?? []).length,
      screensConfigured: screens.length,
      notConfigured: (config.screens ?? [])
        .filter((/** @type {any} */ s) => !screens.includes(s))
        .map((/** @type {any} */ s) => s.id),
      visualScreens: visualScreens.map((s) => s.id),
      visualMode,
    },
  };
  writeJson(join(reportDir, 'report.json'), report);
  log(`rapport : ${join(reportDir, 'report.json')}`);

  if (report.coverage.notConfigured.length) {
    warn(`écrans déclarés mais sans ancre, donc non testés : ${report.coverage.notConfigured.join(', ')}`);
  }

  const code = exitCodeFor(findings, config.gate);
  const failedRuns = runs.filter((r) => !r.ok).length;
  if (code === 0 && failedRuns > 0 && findings.length === 0) {
    // Maestro a échoué sans qu'aucune étape ne soit marquée FAILED : le défaut
    // est en amont des flows (device perdu, app absente, driver). Ne pas rendre
    // vert dans ce cas — un échec sans finding n'est pas un succès.
    err(`${failedRuns} exécution(s) Maestro en échec sans étape fautive identifiée — voir ${outputDir}`);
    process.exit(2);
  }
  process.exit(code);
}

main().catch((e) => {
  err(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(2);
});
