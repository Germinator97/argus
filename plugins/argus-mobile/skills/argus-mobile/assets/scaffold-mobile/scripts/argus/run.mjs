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
 *   node scripts/argus/run.mjs
 *   node scripts/argus/run.mjs --platform=ios
 *   node scripts/argus/run.mjs --update-baselines
 *   node scripts/argus/run.mjs --dry-run
 *   node scripts/argus/run.mjs --tags=smoke,p0
 *
 * Codes de sortie (identiques au skill web) :
 *   0 = vert · 1 = major dans le gate · 2 = blocker/critical, ou outillage
 *       manquant, ou harness non configuré
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  activeDevices, adbShell, artifactsDir, buildCmdForAbi, configuredScreens, detectTools,
  deviceAbi, err, exitCodeFor, flutterCommand, loadConfig, log, missingToolMessage, parseYaml,
  sh, validateConfig, warn, writeJson,
} from './config.mjs';

/**
 * Le verdict d'une commande qui GÉNÈRE des références visuelles.
 *
 * ⚠️ Générer n'est pas comparer. Ce chemin rejouait la suite puis sortait sur le
 * gate des flows qu'il venait de jouer : une génération impeccable rendait
 * `exit 1`, et sur un run en aveugle ce rouge se lit « la génération a échoué »
 * — donc on recommence ce qui était déjà fait. Le verdict d'une commande doit
 * porter sur CE QU'ELLE FAIT.
 *
 * L'autre moitié compte autant : zéro référence écrite est un échec. Sans elle,
 * « ne plus appliquer le gate » deviendrait « ne plus jamais échouer ».
 *
 * @param {number} written références écrites
 * @param {number} gateCode ce que le gate aurait rendu
 * @param {string} outputDir où regarder en cas d'échec
 * @returns {{exit:number, warnings:string[], errors:string[]}}
 */
export function baselineVerdict(written, gateCode, outputDir = '') {
  if (written === 0) {
    return {
      exit: 2,
      errors: [
        'aucune référence visuelle écrite — la génération n\'a rien produit.',
        `  Vérifie qu'un écran porte \`visual: true\` et que les flows ont tourné${outputDir ? ` : ${outputDir}` : ''}`,
      ],
      warnings: [],
    };
  }
  if (gateCode !== 0) {
    return {
      exit: 0,
      errors: [],
      warnings: [
        'gate non appliqué : cette commande GÉNÈRE des références, elle ne compare pas.',
        `  ${written} référence(s) écrite(s). Les findings ci-dessus viennent des flows`,
        '  rejoués pour les produire — relance `make argus-run` pour un verdict qui compare.',
      ],
    };
  }
  return { exit: 0, errors: [], warnings: [] };
}

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
 * @typedef {{udid:string, physical:boolean, avd:string, model:string, os:string}} ListedDevice
 * @typedef {ListedDevice & {measured:boolean}} ResolvedDevice
 *
 * `measured` dit si l'identité vient de l'APPAREIL ou de la config. Le rapport
 * a besoin de la distinction : en `--dry-run` aucun device n'est interrogé, et
 * publier « modèle X » sans l'avoir lu est exactement le défaut qu'on corrige.
 */

/**
 * Nom d'AVD extrait de la sortie d'`adb emu avd name`.
 *
 * ⚠️ Cette commande rend DEUX lignes : le nom, puis un « OK » de la console
 * émulateur. Prendre la première ligne donne le nom ; prendre la dernière, ou
 * trimmer le tout, donne « OK » — un nom d'AVD qui ne correspondra à rien et
 * fera échouer la résolution en désignant un coupable inexistant.
 * @param {string} stdout @returns {string}
 */
function avdNameFrom(stdout) {
  return String(stdout).split('\n').map((l) => l.trim()).find((l) => l !== '' && l !== 'OK') ?? '';
}

/**
 * Identité RÉELLE d'un device Android, lue sur l'appareil.
 *
 * ⚠️ `emulator-5554` n'est pas une identité : c'est un NUMÉRO DE PORT, attribué
 * dans l'ordre de démarrage (5554, 5556, 5558…). Le même udid désigne un AVD
 * différent d'une session à l'autre, selon ce qui a démarré en premier. Cibler
 * « par udid explicite » ne fixe donc pas l'appareil — ça déplace seulement le
 * choix, du runner vers l'ordre de démarrage. Mesuré sur un cas réel : un
 * rapport annonçait un modèle que le port ne portait plus.
 *
 * Le nom d'AVD, lui, est stable. C'est la seule identité qu'on puisse comparer.
 * @param {string} udid @returns {{avd:string, model:string, os:string}}
 */
function probeAndroidIdentity(udid) {
  const avdRes = sh('adb', ['-s', udid, 'emu', 'avd', 'name']);
  const avd = avdRes.ok ? avdNameFrom(avdRes.stdout) : '';
  const prop = (/** @type {string} */ name) => {
    const res = sh('adb', ['-s', udid, 'shell', 'getprop', name]);
    return res.ok ? res.stdout.trim() : '';
  };
  const sdk = prop('ro.build.version.sdk');
  return { avd, model: prop('ro.product.model'), os: sdk ? `android-${sdk}` : '' };
}

/**
 * Devices Android connectés, avec leur identité mesurée. `physical` distingue
 * un vrai téléphone d'un émulateur : la distinction pilote un garde-fou, pas
 * seulement un affichage.
 * @returns {Array<{udid:string, physical:boolean, avd:string, model:string, os:string}>}
 */
function listAndroidDevices() {
  const res = sh('adb', ['devices']);
  if (!res.ok) return [];
  return res.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => ({
      udid: parts[0],
      physical: !parts[0].startsWith('emulator-'),
      ...probeAndroidIdentity(parts[0]),
    }));
}

/**
 * Simulateurs iOS démarrés.
 *
 * Pas d'équivalent d'`avd` ici, et ce n'est pas un oubli : l'udid d'un
 * simulateur est un UUID attribué à sa CRÉATION et stable à vie. Le piège du
 * port réattribué (voir `probeAndroidIdentity`) est propre à Android.
 * @returns {Array<{udid:string, physical:boolean, avd:string, model:string, os:string}>}
 */
function listIosBooted() {
  const res = sh('xcrun', ['simctl', 'list', '-j', 'devices', 'booted']);
  if (!res.ok) return [];
  try {
    const data = JSON.parse(res.stdout);
    return Object.entries(data.devices ?? {}).flatMap(([runtime, list]) =>
      (/** @type {any[]} */ (list)).map((/** @type {any} */ d) => ({
        udid: d.udid,
        physical: false,
        avd: '',
        model: d.name ?? '',
        // « com.apple.CoreSimulator.SimRuntime.iOS-18-2 » → « iOS-18-2 »
        os: String(runtime).split('.').pop() ?? '',
      })));
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
 *
 * Ordre de priorité : `avd` (identité stable, émulateurs Android) puis `udid`
 * (identité stable côté iOS, et seule désignation possible d'un téléphone
 * physique) puis auto-détection.
 * @param {any} spec @param {boolean} dryRun
 * @returns {{status:'ok'|'absent'|'refused', device?:ResolvedDevice}}
 */
function resolveDevice(spec, dryRun) {
  const listed = spec.platform === 'ios' ? listIosBooted() : listAndroidDevices();
  if (spec.avd) return resolveByAvd(spec, listed, dryRun);
  if (spec.udid) return resolveNamedDevice(spec, listed, dryRun);
  const auto = listed.find((d) => !d.physical);
  if (auto) return { status: 'ok', device: { ...auto, measured: true } };
  if (listed.length > 0) {
    err(`aucun émulateur/simulateur pour « ${spec.platform} » — seuls des appareils réels sont branchés.`);
    err('  Argus ne les cible jamais automatiquement. Démarre un émulateur, ou nomme');
    err('  explicitement l\'udid dans argus.mobile.yaml avec « physical: true ».');
    return { status: 'refused' };
  }
  return { status: 'absent' };
}

/**
 * Résout un émulateur Android par son NOM D'AVD, en interrogeant chaque device
 * connecté. C'est la seule désignation qui survive à un redémarrage : le port
 * change, l'AVD non.
 *
 * ⚠️ On ne compare QUE l'AVD. Confronter `spec.model` au `ro.product.model`
 * mesuré serait un faux positif à chaque run : la config porte un nom de modèle
 * MAESTRO (`pixel_6`, consommé par `start-device`), l'appareil rend un nom de
 * produit ANDROID (`sdk_gphone64_arm64`). Deux vocabulaires, jamais égaux.
 * @param {any} spec @param {ListedDevice[]} listed @param {boolean} dryRun
 * @returns {{status:'ok'|'absent'|'refused', device?:ResolvedDevice}}
 */
function resolveByAvd(spec, listed, dryRun) {
  if (spec.platform === 'ios') {
    err(`« ${spec.id} » déclare « avd », qui n'existe que sur Android.`);
    err('  Un simulateur iOS se désigne par son udid : c\'est un UUID stable,');
    err('  pas un numéro de port réattribué (xcrun simctl list devices booted).');
    return { status: 'refused' };
  }
  const found = listed.find((d) => d.avd === spec.avd);
  if (found) return { status: 'ok', device: { ...found, measured: true } };
  if (dryRun) {
    return { status: 'ok', device: { udid: spec.udid ?? '', physical: false, avd: spec.avd, model: '', os: '', measured: false } };
  }
  // Nommer ce qu'on cherchait ET ce qu'on a trouvé : sans la seconde moitié, le
  // message envoie vérifier une configuration qui est déjà juste.
  const others = listed.filter((d) => !d.physical);
  err(`l'AVD « ${spec.avd} » n'est pas démarré (device « ${spec.id} »).`);
  err(others.length > 0
    ? `  Émulateurs trouvés : ${others.map((d) => `${d.avd || '?'} (${d.udid})`).join(', ')}.`
    : '  Aucun émulateur Android n\'est démarré.');
  err(`  Démarre-le : emulator -avd ${spec.avd}   (liste : emulator -list-avds)`);
  return { status: 'absent' };
}

/**
 * @param {any} spec @param {ListedDevice[]} listed @param {boolean} dryRun
 * @returns {{status:'ok'|'absent'|'refused', device?:ResolvedDevice}}
 */
function resolveNamedDevice(spec, listed, dryRun) {
  const found = listed.find((d) => d.udid === spec.udid);
  if (!found) {
    return dryRun
      ? { status: 'ok', device: { udid: spec.udid, physical: false, avd: '', model: '', os: '', measured: false } }
      : { status: 'absent' };
  }
  if (found.physical && spec.physical !== true) {
    err(`« ${spec.id} » désigne un appareil RÉEL (${spec.udid}) sans « physical: true ».`);
    err('  Argus installe le binaire et efface les données de l\'app (clearState).');
    err('  Ajoute « physical: true » à ce device si c\'est bien un appareil de test dédié.');
    return { status: 'refused' };
  }
  if (found.physical) warn(`appareil RÉEL ciblé (${spec.udid}) — vérifie qu'il ne porte aucune donnée personnelle.`);
  // Un émulateur nommé par son port : ça marche aujourd'hui et désignera peut-être
  // un autre AVD demain. On le dit sans bloquer — le run reste valable, c'est sa
  // REPRODUCTIBILITÉ qui ne l'est pas, et les baselines visuelles en dépendent.
  if (!found.physical && spec.platform !== 'ios') {
    warn(`« ${spec.id} » cible le port ${spec.udid}, qui porte actuellement l'AVD « ${found.avd || '?'} ».`);
    warn(`  Un port est réattribué à l'ordre de démarrage. Écris plutôt « avd: ${found.avd || '<nom>'} ».`);
  }
  return { status: 'ok', device: { ...found, measured: true } };
}

/**
 * Démarre un émulateur/simulateur via Maestro, dans la locale demandée.
 * @param {any} spec @param {string} locale @param {boolean} dryRun @returns {boolean}
 */
function startDevice(spec, locale, dryRun) {
  if (spec.avd) {
    // `maestro start-device` CRÉE son propre AVD (maestro_android_…) : il ne
    // sait pas démarrer un AVD existant. Le faire nous-mêmes demanderait de
    // détacher un processus et d'attendre son apparition dans `adb devices` —
    // du code que rien ici n'exercerait. Autant le dire que le promettre.
    err(`« ${spec.id} » nomme l'AVD « ${spec.avd} » : autoStart ne sait pas le démarrer.`);
    err(`  Lance-le d'abord :  emulator -avd ${spec.avd} &`);
    err('  (maestro start-device crée un AVD à lui, il ne réutilise pas le tien.)');
    return false;
  }
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
 * Traduit un échec d'`adb install` en geste à faire.
 *
 * ⚠️ Le harnais n'installe qu'avec `-r` — réinstaller par-dessus — et ne
 * désinstalle jamais : effacer l'app de quelqu'un n'est pas à lui d'en décider.
 * Trois échecs courants en découlent, et le message brut d'`adb` les nomme sans
 * dire quoi en faire. Un rapport qui n'a que le symptôme envoie chercher là où
 * il n'y a rien — c'est le même défaut que le message d'ancre du point 7.
 *
 * On ne propose donc PAS de désinstaller à la place de l'utilisateur : on lui
 * donne la commande, avec ce qu'elle détruit.
 * @param {string} sortie @param {string} packageName @returns {string}
 */
export function installHint(sortie, packageName) {
  const geste = `\n  → adb uninstall ${packageName} puis relance. `
    + '⚠️ Cela EFFACE les données de cette app sur cet appareil.';
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match|INCONSISTENT_CERTIFICATES/i.test(sortie)) {
    return `\n  L'app est déjà installée avec une AUTRE signature — un build du store, `
      + `ou un autre keystore. Android refuse de la remplacer.${geste}`;
  }
  if (/INSTALL_FAILED_VERSION_DOWNGRADE/i.test(sortie)) {
    return `\n  La version installée est plus RÉCENTE que celle que tu poses. `
      + `\`-r\` ne sait pas revenir en arrière.${geste}`;
  }
  if (/INSTALL_FAILED_INSUFFICIENT_STORAGE/i.test(sortie)) {
    return '\n  L\'appareil n\'a plus de place. Libère de l\'espace ou recrée l\'émulateur — '
      + 'inutile de désinstaller quoi que ce soit d\'autre, l\'installation repartira.';
  }
  return '';
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
    return { ok: false, proof: `adb install n'a pas dit « Success » : ${detail || 'sortie vide'}${installHint(detail, packageName)}` };
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
 * Budget d'attente de l'écran de départ, injecté aux flows.
 *
 * ⚠️ Ce n'est PAS `coldStartMs`, et les confondre produit le pire verdict qui
 * soit : un écran simplement lent sort alors en « ancre introuvable », ce qui
 * envoie chercher un défaut d'instrumentation là où il n'y en a pas. Vécu sur un
 * projet réel, deux flows sur six. Les deux verdicts restent donc séparés — on
 * abandonne LARGEMENT après le seuil de performance, pour qu'un démarrage trop
 * lent sorte en finding de lenteur, chiffré, et non en échec fonctionnel.
 *
 * Le facteur 5 et le plancher de 20 s sont des choix, pas des mesures : ils
 * disent seulement « bien après le seuil ». Ce qui est mesuré, c'est que Maestro
 * SUBSTITUE cette variable dans un champ `timeout:` — éprouvé sur 2.8.0, en
 * faisant varier la valeur : 15 000 rend 15 192 ms d'attente, 1 000 en rend
 * 2 570. ⚠️ Ne pas chercher à le vérifier dans `commands.json` : le champ y
 * garde le texte SOURCE (`"${ARGUS_START_TIMEOUT_MS}"`), et le lire donnerait la
 * conclusion inverse. Seule la durée le dit.
 * @param {any} config @returns {number}
 */
function startTimeoutMs(config) {
  // ⚠️ UN LEVIER À LUI, PARCE QUE LES DEUX NE MESURENT PAS LA MÊME CHOSE. Tant
  // que ce budget se dérivait du seul `coldStartMs`, le relever — le seul geste
  // possible quand la suite flake sur un démarrage lent — RELÂCHAIT du même coup
  // le gate chargé de rapporter cette lenteur. Sur une app à 2 s de splash
  // imposé et 6,4 s de démarrage réel, aucune valeur n'était à la fois un budget
  // honnête et un plafond tenable : il fallait choisir entre une suite rouge et
  // un verdict de performance muet.
  //
  // La dérivation reste le DÉFAUT — elle a l'avantage de suivre le projet sans
  // qu'on y pense. `startTimeoutMs` ne fait que la court-circuiter quand
  // quelqu'un a mesuré son démarrage et décidé.
  const explicite = Number(config.thresholds?.startTimeoutMs ?? 0);
  if (explicite > 0) return explicite;
  return Math.max(20000, (config.thresholds?.coldStartMs ?? 2000) * 5);
}

/**
 * Écran d'où partent tous les flows, et par quelle voie il a été choisi.
 *
 * Trois voies, dans cet ordre :
 *   `declared` — un écran porte `start: true`. C'est la seule qui soit un CHOIX ;
 *   `home`     — convention historique sur l'identifiant `home` ;
 *   `first`    — repli sur le premier écran configuré.
 *
 * ⚠️ `first` est un piège, et c'est pour lui que `start:` existe. Un écran a
 * souvent plusieurs ÉTATS (« liste vide », « liste pleine »), chacun déclaré
 * séparément ; si le premier de la liste est l'état plein, son ancre n'existe pas
 * après un `clearState` et TOUS les flows partent de travers — par intermittence,
 * donc en accusant autre chose. Les deux voies de repli restent pour ne casser
 * aucune config existante, mais elles se signalent.
 *
 * Le contrat de retour porte `origin` plutôt qu'un booléen : le rapport doit
 * pouvoir distinguer « on me l'a dit » de « je l'ai deviné et ça tombait bien ».
 * @param {any} config @returns {{screen:any, origin:'declared'|'home'|'first'}}
 */
function startScreen(config) {
  const screens = configuredScreens(config);
  const declares = screens.filter((/** @type {any} */ s) => s.start === true);
  if (declares.length > 0) return { screen: declares[0], origin: 'declared' };
  const home = screens.find((/** @type {any} */ s) => s.id === 'home');
  if (home) return { screen: home, origin: 'home' };
  return { screen: screens[0], origin: 'first' };
}

/**
 * Contrat d'injection consommé par les flows (`${…}`). Toutes les clés sont
 * toujours présentes, même vides : un flow doit pouvoir se garder sur une valeur
 * vide plutôt que sur une variable absente.
 * @param {any} config @param {string} appId @param {Record<string,string>} [extra]
 * @returns {Record<string,string>}
 */
function buildEnv(config, appId, extra = {}) {
  const home = startScreen(config).screen;
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
    // Maestro n'a pas de masquage de pixels : `cropOn` est le SEUL levier qui
    // reste depuis un flow pour sortir une zone non déterministe du cadre.
    // Vide = plein écran ; le flow se garde dessus, il ne reçoit jamais un
    // sélecteur vide à résoudre.
    ARGUS_VISUAL_CROP: String(config.visualCropOn ?? ''),
    ARGUS_START_TIMEOUT_MS: String(startTimeoutMs(config)),
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
 *
 * Structure réelle, relevée sur Maestro 2.8.0 :
 *   <outputDir>/<horodatage>/<NOM DU FLOW>/{commands.json, manifest.json, logs/,
 *                                           screenshots/, screen-hierarchy/,
 *                                           takeScreenshot/, startRecording/}
 * ⚠️ Le dossier porte le champ `name:` du flow — avec ses espaces et ses tirets
 * cadratins — pas son nom de fichier. Le nom de fichier, lui, est injecté par
 * Maestro dans `MAESTRO_FILENAME` et se relit dans commands.json : c'est cette
 * clé-là qui sert à attribuer une dimension, parce qu'elle ne bouge pas quand
 * quelqu'un reformule le `name:`.
 * @param {string} outputDir @param {Set<string>} before
 * @returns {Array<{flow:string, name:string, tags:string[], dir:string, steps:any[], artifacts:any[]}>}
 */
function harvest(outputDir, before) {
  const sessions = subdirs(outputDir).filter((name) => !before.has(name));
  /** @type {Array<{flow:string, name:string, tags:string[], dir:string, steps:any[], artifacts:any[]}>} */
  const bundles = [];
  for (const session of sessions) {
    const sessionDir = join(outputDir, session);
    for (const dirName of subdirs(sessionDir)) {
      const dir = join(sessionDir, dirName);
      const steps = readJsonSafe(join(dir, 'commands.json')) ?? [];
      const config = flowConfig(steps);
      bundles.push({
        flow: flowFilename(steps) || dirName,
        name: config.name ?? dirName,
        tags: Array.isArray(config.tags) ? config.tags.map(String) : [],
        dir,
        steps,
        // Le manifeste expose `entries`, pas `artifacts` : un index de haut
        // niveau du bundle. Les preuves PAR ÉTAPE vivent dans commands.json.
        artifacts: readJsonSafe(join(dir, 'manifest.json'))?.entries ?? [],
      });
    }
  }
  return bundles;
}

/**
 * Commandes CONTENEUR : leur échec n'est que la conséquence de celui d'une
 * étape qu'elles enveloppent, déjà rapportée pour elle-même. Les garder
 * doublerait chaque finding, avec en prime un libellé vide et une capture
 * générique — deux entrées pour un seul défaut.
 */
const CONTAINER_COMMANDS = new Set(['runFlowCommand', 'repeatCommand', 'retryCommand']);

/**
 * Corps de la première (et unique) clé d'une commande Maestro sérialisée.
 *
 * On lit `evaluatedCommand` en priorité : il porte les variables RÉSOLUES.
 * Sans ça, un finding annonce « id=${ARGUS_ANCHOR_HOME} » au lieu de l'ancre
 * réellement cherchée, ce qui n'aide personne à reproduire.
 * @param {any} step @returns {{key:string, body:any}}
 */
function commandBody(step) {
  const command = step?.metadata?.evaluatedCommand ?? step?.command ?? {};
  const key = Object.keys(command)[0];
  return { key: key ?? '', body: key ? command[key] : {} };
}

/**
 * Libellé lisible quand la commande n'en porte pas.
 * @param {string} key @param {any} body @param {string} selector @returns {string}
 */
function describeCommand(key, body, selector) {
  const name = key.replace(/Command$/, '');
  return selector ? `${name} ${selector}` : name;
}

/**
 * `MAESTRO_FILENAME` injecté par Maestro en tête de chaque flow.
 * @param {any[]} steps @returns {string}
 */
function flowFilename(steps) {
  for (const step of steps) {
    const env = step?.command?.defineVariablesCommand?.env;
    if (env?.MAESTRO_FILENAME) return String(env.MAESTRO_FILENAME);
  }
  return '';
}

/**
 * En-tête du flow (`appId`, `name`, `tags`) tel que Maestro l'a appliqué.
 * @param {any[]} steps @returns {any}
 */
function flowConfig(steps) {
  for (const step of steps) {
    const config = step?.command?.applyConfigurationCommand?.config;
    if (config) return config;
  }
  return {};
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
 *
 * Forme relevée sur Maestro 2.8.0 : chaque entrée de commands.json est
 * `{command: {<nomCommande>: {...}}, metadata: {status, sequenceNumber, error,
 * artifacts}}`. Le statut n'est PAS à la racine — le lire là rendait zéro
 * finding sur une suite pourtant rouge, soit exactement le faux vert que tout
 * le reste du harness s'emploie à empêcher.
 * @param {Array<{flow:string, name:string, dir:string, steps:any[]}>} bundles
 * @param {any} device @param {string} platform @param {any} config
 * @param {string} [startupAnchor] ancre de l'écran de départ, pour reconnaître
 *   l'échec qui n'accuse pas la bonne chose (voir `startupHint`)
 * @returns {any[]}
 */
function findingsFrom(bundles, device, platform, config, startupAnchor = '') {
  /** @type {any[]} */
  const findings = [];
  for (const bundle of bundles) {
    const failed = bundle.steps
      .filter((s) => String(s?.metadata?.status ?? '').toUpperCase() === 'FAILED')
      .filter((s) => !CONTAINER_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? ''));
    for (const [index, step] of failed.entries()) {
      // Rang dans le flow ENTIER, pas dans les seuls échecs : c'est ce qui
      // permet de savoir ce qui s'est passé AVANT.
      const rank = bundle.steps.indexOf(step);
      const meta = step.metadata ?? {};
      const { key, body } = commandBody(step);
      const selector = selectorOf(step);
      findings.push({
        id: `QAM-${String(findings.length + 1).padStart(3, '0')}`,
        title: body?.label ?? describeCommand(key, body, selector) ?? `étape ${meta.sequenceNumber ?? index}`,
        severity: severityForFlow(bundle.flow, config),
        dimension: dimensionForFlow(bundle.flow),
        screen: bundle.name,
        step: meta.sequenceNumber ?? index,
        selector,
        device: device.id,
        platform,
        osVersion: device.os ?? '',
        expected: 'étape réussie',
        // ⚠️ Le message de Maestro nomme le SÉLECTEUR, jamais la cause. Sur
        // l'attente de l'écran de départ, « id=X n'est pas visible » se lit
        // « l'ancre est mauvaise » alors que l'ancre est bonne et que l'app
        // n'avait pas fini de démarrer. Vécu : deux flows sur six, et le
        // diagnostic est parti dans l'instrumentation pour rien. On rattache
        // donc la mesure au message, là où quelqu'un la lira.
        actual: String(meta.error?.message ?? 'échec sans message')
          + startupHint(selector, startupAnchor, config, key)
          + vanishedHint(bundle.steps, rank, selector, key),
        // Les preuves de L'ÉTAPE (capture et dump de hiérarchie du moment où ça
        // casse) valent bien mieux que l'index global du bundle.
        evidence: (meta.artifacts ?? []).map((/** @type {any} */ a) => join(bundle.dir, a.path ?? '')).filter(Boolean),
        repro: [`maestro --device=${device.udid} test .maestro/${bundle.flow}.yaml`],
        status: 'open',
      });
    }
  }
  return findings;
}

/** Commandes qui ATTENDENT une ancre au lieu de la lire tout de suite. */
const WAIT_COMMANDS = new Set(['assertConditionCommand', 'extendedWaitUntilCommand', 'waitUntilVisibleCommand']);

/**
 * Commandes dont l'échec parle d'un ÉLÉMENT qu'on n'a pas trouvé.
 *
 * ⚠️ Tout indice qui explique une ancre doit être filtré par cet ensemble. La
 * comparaison d'image (`assertScreenshot`) échoue sur un SEUIL, pas sur un
 * élément : lui coller une explication d'ancre envoie chercher un défaut
 * d'instrumentation là où une référence a simplement changé.
 */
const SELECTOR_COMMANDS = new Set([
  ...WAIT_COMMANDS, 'tapOnCommand', 'assertVisibleCommand', 'assertNotVisibleCommand',
  'inputTextCommand', 'scrollUntilVisibleCommand', 'longPressOnCommand',
]);

/**
 * Phrase à coller au message d'échec quand ce qui a échoué est l'attente de
 * l'écran de départ. Vide dans tous les autres cas — un indice affiché partout
 * ne serait plus un indice.
 * @param {string} selector @param {string} startupAnchor @param {any} config
 * @returns {string}
 */
function startupHint(selector, startupAnchor, config, commandKey = '') {
  if (!startupAnchor || selector !== `id=${startupAnchor}`) return '';
  // ⚠️ ET SEULEMENT SI L'ÉTAPE ATTENDAIT. Collé à n'importe quelle étape portant
  // ce sélecteur, l'indice se retrouve sur un `assertScreenshot` — qui a bien
  // comparé, sur un écran bien arrivé — et conseille alors de vérifier le temps
  // de démarrage devant une vraie divergence d'image. Observé au septième run
  // sur une divergence de 5,04 %. `WAIT_COMMANDS` est défini vingt lignes plus
  // haut et n'était pas consulté ici.
  if (commandKey && !WAIT_COMMANDS.has(commandKey)) return '';
  return ` — c'est l'écran de DÉPART qui n'est pas arrivé à temps, pas forcément`
    + ` l'ancre qui est fausse. Vérifie d'abord le temps de démarrage`
    + ` (thresholds.coldStartMs = ${config.thresholds?.coldStartMs ?? 2000} ms,`
    + ` relevé dans startup.samples du rapport) avant de soupçonner l'instrumentation.`;
}

/**
 * Phrase à coller quand l'ancre qui manque a été TROUVÉE plus tôt dans le même
 * flow. Vide sinon — un indice affiché partout n'est plus un indice.
 *
 * ⚠️ C'est la même famille que `startupHint`, sur un autre défaut : le message
 * de Maestro nomme le sélecteur, donc il désigne un coupable, et c'est le
 * mauvais. Ici l'élément a EXISTÉ puis a disparu — l'app a changé d'écran toute
 * seule pendant que le flow continuait. Vécu sur un projet réel : une session
 * de test de 10 s se terminait avant les étapes d'abandon, et le rapport disait
 * « confirm_sheet_root n'est pas visible ». On cherche alors une ancre qui n'a
 * jamais eu de problème.
 *
 * Le signal est sûr : si la même ancre a été satisfaite plus tôt dans CE flow,
 * elle est correctement posée, et ce qui a changé est l'état de l'app.
 * @param {any[]} steps @param {number} index @param {string} selector @returns {string}
 */
function vanishedHint(steps, index, selector, commandKey = '') {
  // ⚠️ COMME `startupHint`, ET POUR LA MÊME RAISON — qui n'avait été appliquée
  // qu'à lui. Cet indice explique qu'une ancre a existé puis a disparu : c'est
  // exact pour une commande qui CHERCHE un élément, et faux collé à un
  // `assertScreenshot`, dont l'échec est un seuil d'image. Observé au huitième
  // run : un `QAM-001` de comparaison visuelle conseillait de regarder la durée
  // métier avant de toucher aux Semantics.
  //
  // Le point 84 a filtré son voisin dix lignes plus haut et s'est arrêté là. Un
  // correctif pensé pour UNE fonction laisse l'autre intacte : c'est le motif
  // que trois runs consécutifs ont fini par nommer.
  if (commandKey && !SELECTOR_COMMANDS.has(commandKey)) return '';
  if (!selector || !selector.startsWith('id=')) return '';
  const seen = steps.slice(0, index).some((/** @type {any} */ s) =>
    selectorOf(s) === selector
    && String(s?.metadata?.status ?? '').toUpperCase() === 'COMPLETED');
  if (!seen) return '';
  return ` — cette ancre a été TROUVÉE plus tôt dans ce flow, puis a disparu :`
    + ` l'instrumentation est donc bonne, c'est l'ÉTAT de l'app qui a changé`
    + ` pendant que le flow continuait (session terminée d'elle-même, redirection,`
    + ` écran refermé). Regarde la durée métier avant de toucher aux Semantics.`;
}

/**
 * Temps que l'écran de départ met à APPARAÎTRE, relevé par flow.
 *
 * La suite chronométrait déjà ce temps sans le savoir, et le jetait : la
 * première assertion d'ancre de chaque flow n'est pas une assertion, c'est le
 * démarrage à froid de l'app. Mesuré sur un projet réel : la MÊME assertion, sur
 * la MÊME ancre, dans le MÊME flow, coûtait 16 645 ms en première position et
 * 79 ms en seconde. L'écart n'est pas de la lecture d'arbre — c'est l'app qui
 * démarre. Deux flows sur six mouraient dessus, en accusant l'ancre.
 *
 * D'où ce relevé : il rend visible ce que le harnais payait déjà.
 * @param {Array<{flow:string, steps:any[]}>} bundles @param {string} anchor
 * @returns {Array<{flow:string, ms:number, status:string}>}
 */
function startupSamples(bundles, anchor) {
  /** @type {Array<{flow:string, ms:number, status:string}>} */
  const samples = [];
  if (!anchor) return samples;
  for (const bundle of bundles) {
    // La PREMIÈRE seulement : les suivantes portent une app déjà chaude.
    const step = (bundle.steps ?? []).find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')
      && selectorOf(s) === `id=${anchor}`);
    const ms = Number(step?.metadata?.duration ?? NaN);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    samples.push({ flow: bundle.flow, ms, status: String(step.metadata?.status ?? '') });
  }
  return samples;
}

/**
 * Le démarrage à froid dépasse-t-il le seuil déclaré ? Un seul finding pour le
 * lot : six lignes disant la même chose sur six flows, c'est du bruit qui fait
 * cesser de lire les rapports.
 * @param {Array<{flow:string, ms:number, status:string}>} samples
 * @param {any} device @param {string} platform @param {any} config
 * @returns {any[]}
 */
function startupFindings(samples, device, platform, config) {
  const budget = config.thresholds?.coldStartMs ?? 2000;
  // ⚠️ Le plancher de marque n'est PAS un assouplissement du seuil : c'est une
  // durée que le produit a DÉCIDÉ d'imposer, et qui n'a donc rien à voir avec
  // une régression. Une app à splash de 2 s rendait `coldStartMs: 2000` rouge
  // par construction, et la seule issue offerte était de relever le seuil — ce
  // qui efface les deux à la fois, le plancher assumé et ce qui a dérivé.
  // Ici on soustrait, on compare ce qui reste, et le rapport dit les deux
  // chiffres : « 6200 ms dont 2000 assumés ».
  const floor = Math.max(0, Number(config.thresholds?.brandedSplashMs ?? 0));
  const net = (/** @type {any} */ s) => Math.max(0, s.ms - floor);
  const over = samples.filter((s) => net(s) > budget);
  if (over.length === 0) return [];
  const worst = over.reduce((a, b) => (b.ms > a.ms ? b : a));
  const timedOut = samples.filter((s) => s.status.toUpperCase() === 'FAILED').length;
  const dont = floor > 0 ? `, dont ${floor} ms de splash assumés` : '';
  return [{
    id: 'QAM-START',
    title: `l'écran de départ met ${Math.round(worst.ms / 1000)} s à apparaître${dont} (seuil ${budget} ms)`,
    severity: 'major',
    dimension: 'performance',
    screen: 'démarrage',
    step: 0,
    selector: '',
    device: device.id,
    platform,
    osVersion: device.os ?? '',
    expected: floor > 0
      ? `écran de départ visible sous ${budget} ms hors splash de marque (thresholds.coldStartMs + brandedSplashMs)`
      : `écran de départ visible sous ${budget} ms (thresholds.coldStartMs)`,
    actual: `${over.length}/${samples.length} flows au-dessus du seuil : `
      + over.map((s) => (floor > 0
        ? `${s.flow} ${Math.round(s.ms)} ms (${Math.round(net(s))} hors splash)`
        : `${s.flow} ${Math.round(s.ms)} ms`)).join(', ')
      + (timedOut > 0
        ? `. ${timedOut} y ont épuisé leur budget d'attente — l'échec rapporté nomme l'ancre, mais la cause est ce temps-ci.`
        : ''),
    evidence: [],
    repro: [`maestro --device=${device.udid} test .maestro/${worst.flow}.yaml`],
    status: 'open',
  }];
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

/**
 * Sélecteur employé par l'étape. Maestro sérialise les sélecteurs en `idRegex`
 * et `textRegex` — pas en `id`/`text`, qui sont la forme d'ÉCRITURE du YAML.
 * Lu sur la commande ÉVALUÉE, pour rendre la valeur réelle et non `${VAR}`.
 * @param {any} step @returns {string}
 */
function selectorOf(step) {
  const raw = JSON.stringify(step?.metadata?.evaluatedCommand ?? step?.command ?? {});
  const byId = /"idRegex"\s*:\s*"([^"]+)"/.exec(raw);
  if (byId) return `id=${byId[1]}`;
  const byText = /"textRegex"\s*:\s*"([^"]+)"/.exec(raw);
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

/** Fichier où l'on note SOUS QUEL CADRAGE les références ont été produites. */
const CROP_STAMP = '.argus-crop';
const DEVICE_STAMP = '.argus-device';

/**
 * Le cadrage sous lequel les références ont été produites, ou `null` si le
 * dossier ne le dit pas (références antérieures à cette marque).
 * @param {string} baselineDir @returns {string|null}
 */
/**
 * Le cadrage qui s'applique à CET écran.
 *
 * ⚠️ `visualCropOn` est une clé globale, et la doctrine des racines est locale :
 * chaque écran a la sienne. Dès le deuxième écran en `visual: true`, aucune
 * valeur globale ne convient — sur un projet réel, l'agent a dû la laisser vide
 * et l'horloge du système est entrée dans les quatre références.
 *
 * Un `visualCropOn` posé sur une entrée de `screens[]` l'emporte donc sur le
 * global, qui reste le défaut. Additif : une config existante ne change pas de
 * comportement.
 * @param {any} screen @param {any} config @returns {string}
 */
export function cropFor(screen, config) {
  const local = screen?.visualCropOn;
  if (typeof local === 'string' && local.trim() !== '') return local.trim();
  return String(config?.visualCropOn ?? '');
}

/**
 * Les cadrages gravés à côté des références, PAR ÉCRAN.
 *
 * ⚠️ C'était une seule chaîne pour tout le dossier — mesuré sur un projet réel :
 * un fichier d'un octet. Le cadrage étant devenu local, une valeur globale ne
 * pouvait plus décrire ce qui avait servi.
 *
 * Rétrocompatible : un fichier de l'ancien format se lit « ce cadrage valait
 * pour tous », ce qu'il voulait effectivement dire.
 * @param {string} baselineDir @returns {Record<string,string>|null}
 */
export function baselineCrops(baselineDir) {
  const path = join(baselineDir, CROP_STAMP);
  if (!existsSync(path)) return null;
  const brut = readFileSync(path, 'utf8').trim();
  try {
    const lu = JSON.parse(brut);
    if (lu && typeof lu === 'object' && !Array.isArray(lu)) return lu;
  } catch { /* ancien format : une chaîne nue */ }
  return { '*': brut };
}

/** Le cadrage gravé pour [id], en retombant sur l'ancien format global. */
export function baselineCropFor(crops, id) {
  if (crops === null) return null;
  return crops[id] ?? crops['*'] ?? null;
}

/**
 * Les écrans dont le cadrage EFFECTIF diffère de celui gravé.
 *
 * ⚠️ Extrait du corps du runner pour être GARDÉ, et la raison vaut d'être dite :
 * la version précédente comparait l'empreinte à la valeur GLOBALE. Avec un
 * `visualCropOn` global vide et des cadrages posés par écran, elle valait
 * `'' !== ''` — le garde ne disait JAMAIS rien, et l'échec suivant se lisait
 * comme une régression de l'application. Un correctif ne supprime pas toujours
 * un mode de panne : souvent il le déplace, et le garde qui veillait sur
 * l'ancien passe au vert sans rien mesurer.
 *
 * ⚠️ Un test qui réimplémenterait cette décision de son côté ne garderait rien —
 * il vérifierait sa propre copie. C'est pour ça qu'elle est ici et exportée.
 * @param {Record<string,string>|null} graves @param {any[]} ecrans @param {any} config
 * @returns {any[]}
 */
export function screensWithMovedCrop(graves, ecrans, config) {
  return ecrans.filter((sc) => {
    const grave = baselineCropFor(graves, sc.id);
    return grave !== null && grave !== cropFor(sc, config);
  });
}

/**
 * L'appareil qui produit les références, MESURÉ plutôt que déclaré.
 *
 * ⚠️ `devices[].model` et `os` sont recopiés à la main : ils disent ce que le
 * projet a écrit, pas sur quoi le run tourne. Un dev qui garde `model: pixel_6`
 * en lançant sur son propre AVD grave donc une empreinte fausse, et le garde
 * qui la relit ne verrait rien. On lit l'appareil.
 *
 * Hors Android on retombe sur la déclaration, et le champ `source` le dit : une
 * empreinte déclarée vaut mieux que pas d'empreinte, à condition de ne pas la
 * faire passer pour une mesure.
 * @param {string} platform @param {string} udid @param {any} spec
 * @returns {{model:string, os:string, source:string}}
 */
export function deviceStamp(platform, udid, spec, lire = adbShell) {
  const declare = { model: String(spec?.model ?? ''), os: String(spec?.os ?? ''), source: 'déclaré' };
  if (platform !== 'android' || !udid) return declare;
  const model = lire(udid, ['getprop', 'ro.product.model']).stdout.trim();
  const sdk = lire(udid, ['getprop', 'ro.build.version.sdk']).stdout.trim();
  if (!model || !sdk) return declare;
  return { model, os: `android-${sdk}`, source: 'mesuré' };
}

/**
 * L'appareil a-t-il changé depuis la génération des références ?
 *
 * ⚠️ Une capture de référence est liée au COUPLE appareil + version d'OS : une
 * référence née ailleurs ne correspondra JAMAIS, et l'échec se lit comme une
 * régression de l'app. C'est le piège que la CI livrée portait — elle figeait
 * `api-level: 33` / `pixel_6` sans rapport avec l'appareil du projet, et la
 * dimension visuelle y était rouge en permanence pour une raison qui n'en est
 * pas une.
 *
 * Le NOM de l'appareil (AVD, udid) n'entre pas dans la comparaison : il change
 * d'une machine à l'autre pour un modèle identique, et crier là-dessus
 * apprendrait à ignorer l'avertissement.
 * @param {any} grave @param {any} courant @returns {null|{grave:any, courant:any}}
 */
export function baselineDeviceDrift(grave, courant) {
  if (!grave || !grave.model || !grave.os) return null;
  if (grave.model === courant.model && grave.os === courant.os) return null;
  return { grave, courant };
}

/** L'empreinte d'appareil gravée à côté des références, ou null. */
export function baselineDevice(baselineDir) {
  const path = join(baselineDir, DEVICE_STAMP);
  if (!existsSync(path)) return null;
  try {
    const lu = JSON.parse(readFileSync(path, 'utf8'));
    return lu && typeof lu === 'object' && !Array.isArray(lu) ? lu : null;
  } catch {
    return null;
  }
}

/**
 * Grave le cadrage à côté des références qu'il a produites.
 *
 * ⚠️ La doc de Maestro est explicite : « the comparison screenshot must also
 * have been cropped ». Changer `visualCropOn` APRÈS avoir généré les références
 * compare donc une capture recadrée à une référence plein écran — et l'échec
 * qui en sort se lit comme une régression visuelle de l'app, pas comme un
 * changement de config. Rien d'autre ne peut le voir : les deux images sont
 * valides, elles ne cadrent simplement pas la même chose.
 * @param {string} baselineDir @param {string} crop
 */
function stampBaselineCrops(baselineDir, crops) {
  mkdirSync(baselineDir, { recursive: true });
  writeFileSync(join(baselineDir, CROP_STAMP), `${JSON.stringify(crops, null, 2)}\n`, 'utf8');
}

/**
 * La suite principale a-t-elle quelque chose à exécuter ?
 *
 * Elle exclut TOUJOURS `visual` : la dimension visuelle a sa propre boucle,
 * parce qu'un flow Maestro ne sait ni itérer sur des écrans ni naviguer vers
 * chacun. Demander `--tags=visual` lui laisse donc un ensemble vide, et elle
 * démarrait quand même une JVM Maestro pour ne rien exécuter — la seule chose
 * qu'on lisait alors était la ligne de skip du flow visuel.
 *
 * ⚠️ C'est ce skip qui a fait conclure, sur le terrain, que `make argus-visual`
 * « ne fait pas de régression visuelle ». Mesuré : il la faisait, dans les deux
 * exécutions suivantes. Le défaut n'était pas l'absence de boucle mais un run
 * inutile dont la sortie disait le contraire de ce qui se passait juste après.
 * @param {string[]} includeTags @param {string[]} excludeTags @returns {boolean}
 */
function dimensionsToRun(includeTags, excludeTags) {
  const exclus = new Set(excludeTags);
  // Rien de demandé = tout ce qui n'est pas exclu. C'est le run complet.
  if (includeTags.length === 0) return { main: true, visual: !exclus.has('visual') };
  return {
    main: includeTags.some((tag) => tag !== 'visual' && !exclus.has(tag)),
    visual: includeTags.includes('visual') && !exclus.has('visual'),
  };
}

/**
 * Ce que le run a coûté, face à ce que `budget` autorisait.
 *
 * Avertit, ne fait pas échouer : dépasser un budget est une information de
 * capacité, pas un défaut de l'application — et faire rougir la CI là-dessus
 * apprendrait à ignorer le rouge. Mais le dire est ce qui rend les deux clés
 * lisibles ; sans lecteur elles décrivaient une discipline que rien n'exerçait.
 * @param {any} config @param {Date} startedAt @param {number} flows
 * @returns {{maxMinutes:number, maxFlows:number, minutes:number, flows:number, warnings:string[]}}
 */
/**
 * La version DÉCLARÉE de l'app, lue dans le `pubspec.yaml` du projet.
 *
 * ⚠️ Le champ s'appelait `appVersion` et recevait `config.app.name`, c'est-à-dire
 * le NOM du paquet. Un rapport qui titre « version : mon_app » n'a l'air de rien
 * mais rend deux runs indistinguables : on ne sait plus lequel a testé quoi, et
 * c'est précisément la question qu'on pose à un rapport archivé.
 *
 * Absente ou illisible, on rend `null` : mieux vaut un trou qu'une valeur
 * plausible et fausse.
 * @returns {string|null}
 */
export function pubspecVersion() {
  try {
    const texte = readFileSync(resolve(process.cwd(), 'pubspec.yaml'), 'utf8');
    const m = /^version:\s*(\S+)/m.exec(texte);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function budgetVerdict(config, startedAt, flows) {
  const maxMinutes = Number(config.budget?.maxMinutes ?? 0);
  const maxFlows = Number(config.budget?.maxFlows ?? 0);
  const minutes = Math.round(((Date.now() - startedAt.getTime()) / 60000) * 10) / 10;
  /** @type {string[]} */
  const warnings = [];
  if (maxMinutes > 0 && minutes > maxMinutes) {
    warnings.push(`budget de durée dépassé : ${minutes} min pour ${maxMinutes} autorisées (budget.maxMinutes).`);
  }
  if (maxFlows > 0 && flows > maxFlows) {
    warnings.push(`budget de flows dépassé : ${flows} exécutés pour ${maxFlows} autorisés (budget.maxFlows).`);
  }
  return { maxMinutes, maxFlows, minutes, flows, warnings };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Point d'entrée
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  // Pris ICI, pas au moment d'écrire le rapport : `startedAt` y était rempli
  // après le dernier flow, donc il datait la FIN du run en disant « début ».
  const startedAt = new Date();
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

  // ⚠️ `locale.deviceLocale` n'est appliqué QUE par `startDevice`, donc
  // uniquement sous `autoStart`. Or `autoStart` et `avd` ne se combinent pas :
  // `maestro start-device` CRÉE son propre AVD et ne sait pas démarrer le tien.
  // La disposition recommandée — lancer soi-même un AVD nommé — rend donc ce
  // réglage INOPÉRANT, et il n'existait aucune trace de ce conflit : la clé
  // était renseignée, plausible, et sans effet.
  const localeDemandee = String(config.locale?.deviceLocale ?? '');
  if (localeDemandee && !spec.autoStart) {
    warn(`locale.deviceLocale = « ${localeDemandee} » n'aura AUCUN effet : elle ne s'applique `
      + 'qu\'au démarrage du device, et seul `autoStart: true` le démarre.');
    warn('  Avec un `avd` que tu lances toi-même, règle la locale sur l\'émulateur avant le run.');
  }

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

  // ⚠️ LE RAPPORT DU RUN PRÉCÉDENT NE DOIT PAS SURVIVRE À CELUI-CI. Quand le
  // runner s'arrête avant Maestro — installation refusée, device absent, budget
  // épuisé —, l'ancien `report.json` restait sur le disque et se lisait comme
  // frais : mêmes findings, même horodatage plausible, rien pour dire qu'il
  // décrit un autre run. Vécu au septième run en aveugle, où l'agent a failli
  // conclure que la comparaison visuelle ne mesurait rien ; c'est le journal qui
  // l'a détrompé, pas le rapport.
  //
  // On le remplace donc TOUT DE SUITE par un rapport « en cours », qui dit ce
  // qu'il est. S'il survit, il dénonce lui-même le run interrompu au lieu de se
  // faire passer pour son résultat.
  writeJson(join(reportDir, 'report.json'), {
    run: { startedAt: startedAt.toISOString(), platform, status: 'interrompu' },
    incomplete: true,
    why: 'ce run s\'est arrêté avant d\'écrire son rapport — relis le journal du runner. '
      + 'Aucun chiffre de ce fichier ne décrit une exécution complète.',
    summary: {}, findings: [],
  });
  const baselineDir = resolve(process.cwd(), config.artifacts?.baselines ?? '.maestro/_baselines', spec.id);

  // ── Installation ────────────────────────────────────────────────────────
  let install = { ok: true, proof: 'installation ignorée (--no-install)' };
  if (opts.install) {
    const binary = resolve(process.cwd(), platform === 'ios' ? config.build.ios : config.build.android);
    install = installApp(platform, resolved.udid, binary, appId, opts.dryRun);
    if (!install.ok) {
      err(`installation non prouvée — ${install.proof}`);
      // La commande PROPOSÉE est ciblée sur l'ABI de l'appareil qu'on vient de
      // résoudre : un fat APK embarque quatre ABI dont trois ne seront jamais
      // lues, et pèse deux fois plus (84,9 Mo contre 39,7 mesurés).
      const brute = platform === 'ios' ? config.build.iosBuildCmd : config.build.androidBuildCmd;
      const ciblee = platform === 'ios' ? brute : buildCmdForAbi(brute, deviceAbi(resolved.udid));
      err(`  Construis le binaire : ${flutterCommand(ciblee)}`);
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
  const dimensions = dimensionsToRun(includeTags, excludeTags);
  if (dimensions.main) {
    runs.push(runMaestro({
      udid: resolved.udid, target: '.maestro', junitPath: join(reportDir, 'report.junit.xml'),
      outputDir, env: baseEnv, includeTags, excludeTags: [...excludeTags, 'visual'],
      dryRun: opts.dryRun, verbose: opts.verbose,
    }));
  }

  // ── Boucle visuelle : un passage par écran ──────────────────────────────
  // Un flow Maestro ne sait pas itérer sur une liste d'écrans, et surtout il ne
  // saurait pas naviguer vers chacun. C'est donc le runner qui boucle.
  const visualScreens = dimensions.visual ? screens.filter((s) => s.visual !== false) : [];
  const visualMode = opts.updateBaselines ? 'update' : 'assert';
  const visualCrop = String(config.visualCropOn ?? '');
  if (visualCrop) log(`captures recadrées sur « ${visualCrop} »`);
  if (dimensions.visual && visualMode === 'assert') {
    // Le cadrage doit être le MÊME qu'à la génération, sinon on compare deux
    // images qui ne cadrent pas la même chose — et l'échec accuse l'app.
    // Le cadrage pouvant désormais différer d'un écran à l'autre, l'estampille
    // ne peut plus être comparée à UNE valeur : on la compare à celle qui
    // s'appliquerait, écran par écran, et on n'avertit que si l'une a bougé.
    const stamped = baselineCrops(baselineDir);
    const bouge = screensWithMovedCrop(stamped, visualScreens, config);
    if (bouge.length > 0) {
      const exemples = bouge.slice(0, 3).map((sc) =>
        `${sc.id} : « ${baselineCropFor(stamped, sc.id) || '(plein écran)'} » → « ${cropFor(sc, config) || '(plein écran)'} »`);
      warn(`le cadrage a changé depuis la génération des références sur ${bouge.length} écran(s) : `
        + `${exemples.join(', ')}${bouge.length > 3 ? '…' : ''}`);
      warn('  Les comparaisons vont échouer sur le CADRAGE, pas sur une régression.');
      warn('  Régénère : node scripts/argus/run.mjs --update-baselines');
    }

    const derive = baselineDeviceDrift(baselineDevice(baselineDir),
      deviceStamp(platform, resolved.udid, spec));
    if (derive) {
      warn(`références produites sur ${derive.grave.model} / ${derive.grave.os}, `
        + `run en cours sur ${derive.courant.model} / ${derive.courant.os}.`);
      warn('  Une référence est liée au COUPLE appareil + version d\'OS : les comparaisons');
      warn('  vont échouer sur l\'APPAREIL, pas sur une régression de l\'app.');
      warn('  Régénère sur cet appareil, ou lance la suite sur celui des références.');
    }
  }
  if (dimensions.visual && visualMode === 'assert' && !existsSync(baselineDir)) {
    warn(`aucune référence visuelle dans ${baselineDir} → dimension VISUAL non exécutée.`);
    warn('  Génère-les : node scripts/argus/run.mjs --update-baselines');
  } else {
    for (const screen of visualScreens) {
      runs.push(runMaestro({
        udid: resolved.udid, target: '.maestro/visual.yaml',
        junitPath: join(reportDir, `report.visual-${screen.id}.junit.xml`), outputDir,
        env: buildEnv(config, appId, {
          ARGUS_ANIMATIONS_DISABLED: String(animations.ok),
          ARGUS_SCREEN_ID: screen.id, ARGUS_SCREEN_ANCHOR: screen.anchor,
          ARGUS_BASELINE_DIR: baselineDir, ARGUS_VISUAL_MODE: visualMode,
          ARGUS_VISUAL_CROP: cropFor(screen, config),
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
  let baselinesWritten = 0;
  if (opts.updateBaselines) {
    const written = promoteBaselines(bundles, baselineDir);
    baselinesWritten = written;
    // Graver le cadrage EFFECTIF de chaque écran, pas la valeur globale : c'est
    // ce que la comparaison relira, écran par écran.
    stampBaselineCrops(baselineDir, Object.fromEntries(
      visualScreens.map((sc) => [sc.id, cropFor(sc, config)]),
    ));
    // Et l'appareil : sans lui, des références nées ailleurs échouent en se
    // faisant passer pour une régression.
    writeFileSync(join(baselineDir, DEVICE_STAMP),
      `${JSON.stringify(deviceStamp(platform, resolved.udid, spec), null, 2)}\n`, 'utf8');
    log(`${written} référence(s) visuelle(s) écrite(s) dans ${baselineDir}`);
  }

  const reportDevice = { ...spec, udid: resolved.udid, os: resolved.os || spec.os };
  const start = startScreen(config);
  const home = start.screen;
  const startup = startupSamples(bundles, home?.anchor ?? '');
  const findings = [
    ...findingsFrom(bundles, reportDevice, platform, config, home?.anchor ?? ''),
    ...startupFindings(startup, reportDevice, platform, config),
  ];
  const budget = budgetVerdict(config, startedAt, bundles.length);
  for (const line of budget.warnings) warn(line);

  const report = {
    run: {
      startedAt: startedAt.toISOString(), platform, appVersion: pubspecVersion(), appName: config.app.name,
      flavor: config.app.flavor, appId, budget,
      // L'identité vient de l'APPAREIL, jamais de argus.mobile.yaml. Recopier
      // la config ici ferait dire au rapport « Medium_Phone » quel que soit le
      // device qui a réellement tourné : il décrirait l'intention en ayant l'air
      // de décrire un fait, et aucune relecture ne pourrait voir l'écart.
      // `declared` reste à côté pour qu'on puisse les comparer d'un coup d'œil.
      devices: [{
        id: spec.id,
        udid: resolved.udid,
        avd: resolved.avd,
        model: resolved.model,
        os: resolved.os,
        physical: resolved.physical,
        identityMeasured: resolved.measured,
        // ⚠️ `model` et `os` NE DÉCRIVENT PAS l'appareil mesuré, et les lire comme
        // tels fabrique une comparaison sans objet : `pixel_6` en regard de
        // `sdk_gphone64_arm64` se lit comme un écart alors que les deux ne
        // parlent pas de la même chose. C'est pour ça qu'ils étaient rendus
        // `null` hors `autoStart`.
        //
        // ⚠️ Mais ils ont acquis un SECOND RÔLE depuis : la CI les lit
        // (`ciEmulator`) pour choisir l'émulateur qui comparera les références
        // visuelles. Les taire revenait donc à cacher deux clés qui gouvernent
        // quelque chose — et le commentaire qui disait « ils ne servent QU'À
        // autoStart » était devenu faux le jour même où on l'a écrit ailleurs.
        //
        // On les rend, avec ce qu'ils gouvernent écrit à côté : c'est `role` qui
        // empêche de les lire comme une description de l'appareil.
        declared: {
          avd: spec.avd ?? '',
          model: spec.model ?? '',
          os: spec.os ?? '',
          role: spec.autoStart === true
            ? 'ce que Maestro doit CRÉER — jamais une description du device mesuré'
            : 'l\'émulateur que la CI démarrera — jamais une description du device mesuré',
        },
      }],
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
    // Ce que l'écran de départ a coûté, flow par flow. Le harnais payait déjà
    // ce temps ; il ne le disait pas.
    startup: {
      // ⚠️ CE TEMPS N'EST PAS `coldStartMs`, et les lire côte à côte sans le dire
      // fait conclure à une contradiction. Ici on mesure l'attente de l'ancre de
      // DÉPART, c'est-à-dire l'écran réellement exploitable — splash imposé et
      // initialisation compris. `am start -W` de `argus-perf` mesure la première
      // frame. Sur un projet réel : 6 s ici, 1,2 s là-bas, les deux justes.
      measures: 'attente de l\'écran de départ exploitable (splash et init compris) — '
        + 'à ne pas confondre avec thresholds.coldStartMs, qui juge la première frame',
      screen: home?.id ?? '',
      anchor: home?.anchor ?? '',
      origin: start.origin,   // declared | home | first — voir startScreen()
      budgetMs: config.thresholds?.coldStartMs ?? 2000,
      brandedSplashMs: Math.max(0, Number(config.thresholds?.brandedSplashMs ?? 0)),
      timeoutMs: startTimeoutMs(config),
      samples: startup,
    },
  };
  writeJson(join(reportDir, 'report.json'), report);
  log(`rapport : ${join(reportDir, 'report.json')}`);

  // Dire ce qu'on n'a PAS pu mesurer vaut mieux que rendre un relevé vide qui
  // se lira « tout va bien ».
  if (startup.length === 0 && bundles.length > 0) {
    warn(`aucune mesure d'apparition de l'écran de départ (ancre « ${home?.anchor ?? '—'} »).`);
    warn('  Les flows ne l\'attendent donc pas explicitement : leur verdict dépend d\'un timeout implicite.');
  }
  if (start.origin === 'first') {
    warn(`écran de départ « ${home?.id} » — choisi par REPLI : aucun écran ne porte « start: true »`);
    warn('  et aucun n\'a l\'identifiant « home ». Si c\'est un ÉTAT (liste vide/pleine), son ancre');
    warn('  peut ne pas exister au lancement, et les flows échoueront par intermittence.');
  }
  if (startup.length > 0) {
    const worst = Math.round(Math.max(...startup.map((s) => s.ms)));
    log(`écran de départ « ${home?.id} » : ${worst} ms au pire sur ${startup.length} flow(s), budget ${report.startup.budgetMs} ms`);
  }

  if (report.coverage.notConfigured.length) {
    warn(`écrans déclarés mais sans ancre, donc non testés : ${report.coverage.notConfigured.join(', ')}`);
  }

  const code = exitCodeFor(findings, config.gate);
  const failedRuns = runs.filter((r) => !r.ok).length;

  // ⚠️ GÉNÉRER DES RÉFÉRENCES N'EST PAS LES COMPARER. Ce chemin rejouait la
  // suite puis sortait sur le gate des flows qu'il venait de jouer : une
  // génération impeccable rendait `exit 1`, et sur un run en aveugle ce rouge
  // se lit « la génération a échoué » — donc on recommence ce qui était fait.
  // Le verdict d'une commande doit porter sur CE QU'ELLE FAIT.
  //
  // L'autre moitié compte autant : si rien n'a été écrit, elle échoue. Sans
  // ça, « ne plus appliquer le gate » deviendrait « ne plus jamais échouer ».
  if (opts.updateBaselines) {
    const verdict = baselineVerdict(baselinesWritten, code, outputDir);
    for (const line of verdict.errors) err(line);
    for (const line of verdict.warnings) warn(line);
    process.exit(verdict.exit);
  }
  if (code === 0 && failedRuns > 0 && findings.length === 0) {
    // Maestro a échoué sans qu'aucune étape ne soit marquée FAILED : le défaut
    // est en amont des flows (device perdu, app absente, driver). Ne pas rendre
    // vert dans ce cas — un échec sans finding n'est pas un succès.
    err(`${failedRuns} exécution(s) Maestro en échec sans étape fautive identifiée — voir ${outputDir}`);
    process.exit(2);
  }
  process.exit(code);
}

// On ne lance la suite que si CE fichier est le point d'entrée. Sans ce garde,
// l'importer pour en tester une fonction déclencherait un vrai run : install
// du binaire, clearState sur le device, la totale. C'est ce qui rendait le
// runner intestable, et donc non testé.
const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((e) => {
    err(e instanceof Error ? e.stack ?? e.message : String(e));
    process.exit(2);
  });
}

// Surface exposée aux gardes de tools/. Ce sont les fonctions qui décident
// — quel device, quel verdict — et qui n'ont aucun autre lecteur automatique.
export {
  avdNameFrom, budgetVerdict, buildEnv, dimensionsToRun, findingsFrom, resolveByAvd, resolveNamedDevice,
  startScreen, startTimeoutMs, startupFindings, startupHint, startupSamples, vanishedHint,
};
