#!/usr/bin/env node
// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
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
 *   node scripts/argus/argus-mobile.mjs run
 *   node scripts/argus/argus-mobile.mjs run --platform=ios
 *   node scripts/argus/argus-mobile.mjs run --update-baselines
 *   node scripts/argus/argus-mobile.mjs run --dry-run
 *   node scripts/argus/argus-mobile.mjs run --tags=smoke,p0
 *
 * Codes de sortie (identiques au skill web) :
 *   0 = vert · 1 = major dans le gate · 2 = blocker/critical, ou outillage
 *       manquant, ou harness non configuré
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  activeDevices, adbShell, artifactsDir, avdNameFrom, buildCmdForAbi, configuredScreens, detectTools,
  startScreen,
  deviceAbi, err, exitCodeFor, flutterCommand, installedVariant, loadConfig, log, missingToolMessage, parseYaml, projectBuildCmd,
  sh, validateConfig, warn, writeJson,
  lireFlows, tagsDeclares, ETATS_INVITES_SYSTEME } from './config.mjs';
// La réserve de variant vit là où elle a été écrite ; la recopier ici l'aurait
// laissée diverger de celle des deux autres démarrages, qui disent la même chose.
import { caveatDebug } from './perf.mjs';

/**
 * Faut-il avertir que `locale.deviceLocale` restera sans effet ?
 *
 * ⚠️ Cet avertissement sortait dès que la clé était renseignée et `autoStart`
 * faux — c'est-à-dire sur la disposition que le skill RECOMMANDE (un `avd`
 * nommé, qu'on lance soi-même). Trois lignes de bruit à chaque exécution, sur
 * une configuration correcte : le run 12 les a relevées comme telles.
 *
 * Il dit vrai — la clé n'a aucun effet sans `autoStart` — mais il ne devient
 * UTILE que si la locale du device diffère de celle demandée. Quand elles
 * coïncident, l'intention est satisfaite, quel qu'en soit le moyen : se taire.
 *
 * @param {string} demandee ce que `locale.deviceLocale` déclare (`fr_FR`)
 * @param {boolean} autoStart le runner démarre-t-il le device lui-même
 * @param {string|null} surDevice ce que l'appareil rend, `null` si illisible
 * @returns {string[]} les lignes à avertir, vide si le silence est justifié
 */
/**
 * La locale LUE sur l'appareil — ou `null` quand il n'y en a pas.
 *
 * 🔴 POURQUOI CETTE FONCTION EXISTE (540). `adb shell settings get system
 * system_locales` ne rend pas une chaîne vide quand le réglage n'existe pas :
 * il rend la chaîne littérale **`"null"`**, longue de quatre caractères et donc
 * VRAIE en JavaScript. Les deux consommateurs la prenaient pour une locale.
 *
 * Ce qu'elle coûtait, mesuré sur un run réel :
 *   · le rapport publiait « l'appareil est en « null » » — une valeur présentée
 *     comme MESURÉE, qui n'existe pas — puis prescrivait de la corriger ;
 *   · `.maestro/_baselines/<device>/.argus-device`, un fichier qui SE COMMITE,
 *     figeait `"locale": "null", "source": "mesuré"`. Deux appareils dont la
 *     locale est illisible y portent la même valeur et passent pour identiques :
 *     c'est précisément ce que ce fichier existe pour empêcher.
 *
 * ⚠️ Les deux appelants avaient DÉJÀ leur branche pour le cas illisible — un
 * `'n\'a pas pu être lue'` d'un côté, un `locale || ''` de l'autre. Elles
 * étaient justes, et INATTEIGNABLES : la valeur réelle ne les visitait jamais.
 * *Le remède était écrit, le chemin n'y menait pas.*
 *
 * 📌 On valide la FORME plutôt que d'écarter des valeurs connues. Une liste de
 * mots interdits ne connaît que ce qu'on y a mis — et `settings get` n'est pas
 * seul à répondre en prose : `Setting not found`, un message d'erreur, une
 * sortie vide. Ce qui n'a pas la forme d'une locale n'en est pas une.
 *
 * @param {string|null|undefined} sortie ce que la commande a rendu
 * @returns {string|null} la locale, ou `null` si ce n'en est pas une
 */
export function localeLue(sortie) {
  const v = String(sortie ?? '').trim();
  const UNE = '[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*';
  return new RegExp(`^${UNE}(,${UNE})*$`).test(v) ? v : null;
}

export function localeWarnings(demandee, autoStart, surDevice, platform = 'android') {
  if (!demandee || autoStart) return [];
  const normaliser = (/** @type {string} */ v) => v.trim().toLowerCase().replace(/_/g, '-').split(',')[0];
  if (surDevice && normaliser(surDevice) === normaliser(demandee)) return [];
  const constat = surDevice
    ? `l'appareil est en « ${surDevice} »`
    : 'la locale de l\'appareil n\'a pas pu être lue';
  return [
    `locale.deviceLocale = « ${demandee} » n'aura AUCUN effet : elle ne s'applique `
      + `qu'au démarrage du device, et seul \`autoStart: true\` le démarre — or ${constat}.`,
    // ⚠️ « l'émulateur » sur iOS ne désigne rien (point 235) : un conseil qui
    // nomme un objet inexistant se lit comme une consigne pour quelqu'un
    // d'autre, et on cesse de lire les suivantes.
    platform === 'ios'
      ? '  Sur un simulateur que tu lances toi-même, règle la langue dans Réglages avant le run.'
      : '  Avec un `avd` que tu lances toi-même, règle la locale sur l\'émulateur avant le run.',
    // ⚠️ CE QUE ÇA COÛTE, et c'est la phrase qui manquait. Dire « la clé est
    // sans effet » laisse croire à un réglage inopérant ; le prix possible est
    // que la dimension i18n MESURE ALORS LA LOCALE DE L'APPAREIL. Vécu : un flow
    // i18n qui assertait un libellé français est passé vert sur un appareil en
    // « fr_CI » — français lui aussi.
    // 🔴 MAIS « POSSIBLE » N'EST PAS « CERTAIN », ET LA PHRASE CONCLUAIT TROP
    // FORT (466). Elle affirmait « il est vert quoi que tu déclares » — ce qui
    // dépend d'un fait que ce script ne peut pas connaître : l'application
    // SUIT-ELLE la locale du système, ou l'ÉPINGLE-T-ELLE ? Mesuré sur un projet
    // réel : appareil en « en-US », assertions françaises vertes, parce que
    // l'app force sa locale — le flow y mesurait donc bien ce qu'il prétend.
    // Un avertissement qui affirme faux sur un projet sain se fait ignorer, et
    // il emmène les vrais avec lui. On dit donc la condition, et le tell.
    '  ⚠️ Ce que ça coûte DÉPEND de ton application, et ce script ne peut pas le savoir : '
      + 'si elle SUIT la locale du système, le flow i18n mesure alors celle de l\'APPAREIL, '
      + 'donc il est vert quoi que tu déclares ; si elle ÉPINGLE sa locale, il mesure bien '
      + 'la tienne et cet avertissement ne te coûte rien.',
    '  Le tell est dans ton propre verdict : des assertions dans TA langue qui passent sur '
      + 'un appareil réglé sur une AUTRE signent une application qui épingle.',
    // 🔴 ÉCARTER LE FAUX REMÈDE, PARCE QU'IL EST LE PREMIER QU'ON TROUVE (477).
    // Deux runs ont buté ici ; l'un a fait taire cet avertissement en DÉCLARANT
    // la locale que l'appareil portait déjà, et l'a écrit noir sur blanc :
    // « pour ne pas produire le finding ». Le geste est rationnel et il ne règle
    // rien — il retire le signal en laissant la mesure exactement où elle était.
    // Nommer le bon remède ne suffit pas quand le mauvais est plus court.
    '  🔴 Et ne fais PAS taire cette ligne en déclarant la locale que l\'appareil porte '
      + 'déjà : ça ne règle rien, ça retire seulement le signal. La clé dit ce que tu VEUX '
      + 'mesurer, l\'appareil dit ce qui SERA mesuré — les rendre égaux ne les réconcilie '
      + 'pas, ça rend l\'écart invisible.',
  ];
}

/**
 * Ce que la locale déclarée et celle de l'appareil disent ENSEMBLE.
 *
 * 🔴 POURQUOI CETTE FONCTION EXISTE (480). [localeWarnings] sort par
 * `return []` dès que la déclaration égale l'appareil — silence délibéré, et
 * juste : sur un projet sain il n'y a rien à dire, et le 466 avait éteint ce
 * bruit exprès. Mais c'est aussi l'état qu'on atteint en prenant le raccourci
 * que le 477 condamne : faire taire la ligne en DÉCLARANT la locale que
 * l'appareil porte déjà. La phrase qui l'écarte vit dans [localeWarnings],
 * donc elle est INJOIGNABLE depuis l'état qu'elle condamne — un panneau posé
 * avant le virage, que celui qui a tourné ne lira plus jamais.
 *
 * Mesuré : le run 77 a écrit `fr_CI` sur un appareil en `fr_CI` alors que
 * l'application épingle `fr_FR`. `report.json` porte **0 occurrence** de
 * `QAM-LOCALE`, et aucun fichier du rapport ne contient « AUCUN effet ».
 *
 * ⚠️ CE QUE LE HARNAIS NE PEUT PAS SAVOIR, et pourquoi il ne l'invente pas.
 * Le remède évident serait de lire la locale que l'app ÉPINGLE et de la
 * comparer. Mesuré sur les deux terrains du chantier : elle n'est un littéral
 * NI dans l'un (`supportedLocales: const [AppConstants.locale]`, une constante
 * d'un paquet voisin) NI dans l'autre (`Locale(Language.FR.name.toLowerCase())`,
 * une expression). Un lecteur de source rendrait donc « rien trouvé » dans les
 * deux cas, c'est-à-dire un instrument qui ne mesure jamais.
 *
 * Alors on ne conclut pas, on RELÈVE : les deux valeurs, leur égalité, et la
 * vérification que seul l'auteur peut faire. C'est une note, pas un
 * avertissement — elle ne crée aucun finding, donc aucun bruit sur un projet
 * sain, et elle atteint le seul état d'où le raccourci est visible.
 * @param {string} demandee @param {string|null} surDevice
 * @returns {{declared:string, onDevice:string, aligned:boolean, note:string}}
 */
export function localeAlignment(demandee, surDevice) {
  const declared = String(demandee ?? '').trim();
  const onDevice = String(surDevice ?? '').trim();
  const normaliser = (/** @type {string} */ v) => v.trim().toLowerCase().replace(/_/g, '-').split(',')[0];
  const aligned = Boolean(declared) && Boolean(onDevice)
    && normaliser(onDevice) === normaliser(declared);
  const note = aligned
    ? `locale : « ${declared} » déclarée, « ${onDevice} » sur l'appareil — les deux sont d'accord, `
      + 'donc rien à signaler. Vérifie quand même que c\'est la locale que ton APPLICATION rend : '
      + 'si elle en épingle une autre, les rendre égales n\'a pas réconcilié la mesure, ça a rendu '
      + 'l\'écart invisible.'
    : '';
  return { declared, onDevice, aligned, note };
}

/**
 * Le finding qui fait SURVIVRE l'avertissement de locale au terminal.
 *
 * ⚠️ [localeWarnings] ne sortait qu'en console, donc elle mourait avec la
 * session : la page publiée montrait une dimension i18n verte sans un mot sur
 * le fait qu'elle n'avait pas mesuré ce qu'elle annonçait. Un lecteur du
 * rapport n'avait aucun moyen de le savoir.
 *
 * `info`, pas `major` : rien n'est cassé, c'est une COUVERTURE qui manque.
 * @param {string[]} avertissements @param {any} device @param {string} platform
 * @returns {any[]}
 */
export function localeFindings(avertissements, device, platform) {
  if (avertissements.length === 0) return [];
  return [{
    id: 'QAM-LOCALE-INERTE',
    title: 'la locale déclarée n\'a pas été appliquée : le flow i18n mesure celle de l\'appareil',
    suggestedFix: avertissements.join('\n'),
    severity: 'info',
    dimension: 'i18n',
    screen: '',
    step: 0,
    selector: '',
    device: device?.id ?? '',
    platform,
    osVersion: device?.os ?? '',
    expected: 'la locale déclarée par locale.deviceLocale',
    actual: 'celle que l\'appareil portait déjà',
  }];
}

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
 * Les cinq ancres d'authentification sont-elles TOUTES renseignées ?
 *
 * Le sous-flow de connexion est tout ou rien : il faut l'écran, les deux champs,
 * le bouton et la preuve que la session est ouverte. Une seule manquante et le
 * flow échoue à mi-parcours sur un identifiant vide — un échec qui accuse l'app
 * alors qu'il décrit une configuration incomplète.
 * @param {any} anchors @returns {boolean}
 */
export function authAnchorsReady(anchors) {
  const requises = ['screen', 'user', 'password', 'submit', 'success'];
  return requises.every((k) => String(anchors?.[k] ?? '').trim() !== '');
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
/**
 * La ligne qui NOMME la cause d'un échec d'installation, dans un fouillis.
 *
 * ⚠️ LE DÉFAUT COÛTAIT 35 MINUTES, la perte la plus chère d'un run. On prenait
 * les TROIS DERNIÈRES lignes de la sortie — c'est-à-dire la fin d'une stack
 * Java (`at android.os.ShellCommand.exec(ShellCommand.java:38) at
 * …PackageManagerShellCommand…`) — pendant que la ligne utile,
 * `Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]`, était ailleurs et jetée. Le
 * §3g décrit précisément ce cas et ses deux gestes ; encore faut-il que le
 * message y envoie, et une stack Java n'y envoie pas. L'agent a dû rejouer
 * l'installation à la main pour lire ce que l'outil avait déjà lu.
 *
 * On cherche donc d'abord ce qui NOMME, et on ne retombe sur la queue de sortie
 * qu'à défaut — en le disant, pour qu'un silence ne passe pas pour un
 * diagnostic.
 * @param {string} sortie @returns {string}
 */
export function causeInstall(sortie) {
  const lignes = String(sortie ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lignes.length === 0) return 'sortie vide';
  // Par ordre de précision : le code d'échec d'adb, puis son refus explicite,
  // puis une erreur nommée. Une stack Java ne nomme jamais rien d'actionnable.
  const NOMMANTS = [
    /Failure \[[^\]]+\]/,
    /adb: failed to [^\n]+/i,
    /INSTALL_[A-Z_]+/,
    /^Error:[^\n]*/i,
  ];
  for (const rx of NOMMANTS) {
    const trouve = lignes.map((l) => rx.exec(l)).find(Boolean);
    if (trouve) return trouve[0];
  }
  // Rien de nommant : on rend la queue, mais on DIT que c'est un pis-aller.
  const queue = lignes.filter((l) => !/^at [\w.$]+\(/.test(l)).slice(-3).join(' ');
  return queue ? `${queue} (aucune ligne ne nomme la cause)` : 'sortie vide';
}

function installAndroid(udid, apk, packageName) {
  const res = sh('adb', ['-s', udid, 'install', '-r', apk]);
  const said = /Success/i.test(`${res.stdout}${res.stderr}`);
  if (!res.ok || !said) {
    // ⚠️ LES DEUX FLUX, pas l'un OU l'autre : `adb` écrit son `Failure [...]` sur
    // stdout tout en remplissant stderr d'une stack. Le `||` d'avant prenait
    // stderr et jetait la seule ligne utile.
    const detail = causeInstall(`${res.stderr ?? ''}\n${res.stdout ?? ''}\n${res.error ?? ''}`);
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
 * Le geste de coupure des animations a-t-il un SENS sur cette plateforme ?
 *
 * ⚠️ POURQUOI CETTE FONCTION EXISTE (486). `disableAnimations` rend
 * `{ok: false}` dès que la plateforme n'est pas Android — c'est juste, il n'y a
 * pas d'équivalent local à `settings put`. Mais le sous-flow recevait alors
 * `ARGUS_ANIMATIONS_DISABLED='false'` et son `assertTrue … optional: true`
 * attendait sa BORNE avant d'abandonner : 1898 ms mesurés, à chaque flow, pour
 * une condition que la plateforme ne peut pas satisfaire. Six flows, ~11 s par
 * passe, et rien ne le disait.
 *
 * C'est la confusion entre « j'ai mesuré, et c'est NON » — sur Android, où un
 * `settings put` peut échouer et où le signal compte — et « il n'y a RIEN À
 * CONCLURE ici ». Le premier mérite son assertion ; le second doit être sauté,
 * parce qu'un `when: true:` s'évalue quand une assertion optionnelle ATTEND.
 *
 * ⚠️ LA PRÉCISION `true:` N'EST PAS COSMÉTIQUE, et elle a coûté le 517. Ce
 * commentaire disait « un `when:` s'évalue », ce qui est FAUX du `when:
 * visible:` — celui-là interroge l'arbre, donc il attend sa borne comme
 * l'assertion qu'il remplaçait (mesuré : 6,26 s contre 6,41 s). Le 486 est
 * juste parce qu'il conditionne sur une EXPRESSION (`${…}`), pas parce qu'il
 * emploie le mot `when` ; le 516 a recopié le mot et laissé la raison.
 * @param {string} platform
 * @returns {boolean}
 */
function animationsApplicables(platform) {
  return platform === 'android';
}

/**
 * Les permissions dont on SAIT qu'elles n'ouvrent jamais d'invite système.
 *
 * ⚠️ LA DIRECTION DU RAISONNEMENT EST « LARGE MOINS LES EXCEPTIONS », et c'est
 * le seul sens sûr. Énumérer les permissions *dangereuses* ferait rater
 * l'invite de celle qu'on n'aurait pas listée — et ce symptôme-là est un flow
 * ROUGE. Énumérer celles qui sont inertes fait, au pire, jouer un geste inutile
 * qui coûte sa borne : on perd du temps, on ne casse rien. Une permission
 * inconnue tombe donc du bon côté.
 */
const PERMISSIONS_SANS_INVITE = new Set([
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.WAKE_LOCK',
  'android.permission.VIBRATE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'com.android.vending.BILLING',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
]);

/**
 * Les mêmes, quand leur nom PORTE l'applicationId et ne peut donc pas être cité.
 *
 * 🔴 CETTE LISTE EXISTE PARCE QUE LA PREMIÈRE VERSION DU 517 A RATÉ SON PROPRE
 * TERRAIN. J'avais écrit `android.permission.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
 * de mémoire ; AndroidX la déclare en fait sous
 * `${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` — son préfixe est
 * donc le paquet de l'application, jamais `android.permission.`. La dérivation rendait
 * donc JOUE sur l'application sans aucune permission runtime — le correctif
 * n'aurait rien soulagé là où le défaut avait été relevé, et rien ne l'aurait
 * dit : un geste inutile ne lève pas, il coûte.
 *
 * Le tell est général : *une permission dont le préfixe est le nom du paquet ne
 * peut pas figurer dans une liste de noms exacts.* Elle se reconnaît par son
 * SUFFIXE, et c'est une mesure sur le cas réel qui l'a montré, pas une relecture.
 */
const SUFFIXES_SANS_INVITE = [
  '.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
  '.permission.C2D_MESSAGE',
];

/**
 * Une invite SYSTÈME peut-elle naître dans cette application ?
 *
 * 🔴 POURQUOI CETTE DÉRIVATION EXISTE (517), ET CE QU'ELLE CORRIGE DU 516. Le
 * pas qui referme l'invite interroge l'ARBRE, et un sélecteur absent n'échoue
 * pas vite : il attend sa borne. Le 516 avait cru fermer ce coût en passant de
 * `tapOn … optional: true` à `runFlow … when: visible:` — les deux coûtent la
 * MÊME chose. Mesuré sur un projet sans aucune permission runtime, trois
 * répétitions, témoin à 8,5 s :
 *
 *     when: visible: sur élément ABSENT   14,87 / 14,93 / 14,80  → ~6,4 s
 *     tapOn … optional: true              15,06 / 14,79 / 15,03  → ~6,4 s
 *     when: visible: sur élément PRÉSENT    8,27 /  8,14 /  8,16  → ~0
 *     when: true: (expression JS) fausse    8,24 /  8,21 /  8,18  → ~0
 *
 * La distinction qui compte n'est donc pas `when` contre `optional` : c'est
 * **interroger l'arbre** contre **évaluer une expression**. Et `timeout:` est
 * refusé dans un `when:` (`Unknown Property: timeout`), donc la borne n'est pas
 * réglable — il faut ne pas poser la question du tout.
 *
 * ⚠️ Le run qui a rendu le 516 mesurait une amélioration RÉELLE sur son terrain
 * (absorption 5/6 → 3/6) : c'est ce qui a fait conclure trop vite. Sur le
 * fichier livré, le `precedeMs` est resté à ~7,1 s et l'absorption est passée
 * de 7/8 à **10/10** — plus aucune mesure de démarrage jugeable.
 *
 * La valeur se DÉRIVE de `security.expectedPermissions`, que le projet remplit
 * déjà depuis le manifeste fusionné de sa release : aucune clé de plus à faire
 * écrire, et rien à recopier. En l'absence de liste on JOUE le geste, comme
 * avant : un projet qui n'a pas encore rempli sa config ne doit pas hériter
 * d'un silence qu'il n'a pas demandé.
 * @param {any} config
 * @returns {boolean}
 */
/**
 * Le flow local qui referme l'invite système a-t-il MANQUÉ le correctif du 517 ?
 *
 * 🔴 POURQUOI CETTE DÉTECTION EXISTE, ET C'EST LA MOITIÉ QUI MANQUE D'HABITUDE.
 * `dismiss-system-alerts.yaml` porte `ARGUS:OWNED` : l'installeur ne l'écrase
 * ni ne le compare, jamais — c'est ce qui protège les libellés et les invites
 * que le projet y a ajoutés. Conséquence exacte : le correctif du 517 atteint
 * les projets NEUFS et **aucun projet déjà installé**. Ni `--update` ni
 * `--check` n'y changent quoi que ce soit, et le symptôme est une absence —
 * 6,4 s par flow que personne ne voit passer.
 *
 * Le remède ne peut donc pas être d'écrire chez l'hôte. Il est de LIRE ce qui
 * s'y trouve : si le flow interroge encore l'arbre sans lire la variable qui
 * rend le geste gratuit, la variable qu'on vient de lui passer est INERTE, et
 * c'est mesurable en une lecture.
 *
 * ⚠️ Un flow qui n'interroge plus l'arbre du tout ne déclenche rien : le projet
 * a le droit d'avoir retiré ce geste, c'est son fichier. On n'avertit que sur
 * l'écart entre ce que le runner injecte et ce que le flow lit.
 * @param {string|null} flow le contenu du flow local, ou null s'il n'existe pas
 * @returns {string|null} le message à émettre, ou null s'il n'y a rien à dire
 */
function inviteSystemeInerte(flow) {
  if (!flow) return null;
  // Commentaires dépouillés : ce fichier EXPLIQUE `optional: true` et le 517 en
  // prose, et un motif compterait ces explications comme du code.
  const nu = flow.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  const interroge = /when:\s*\n\s*(?:visible|notVisible):/.test(nu) || /optional:\s*true/.test(nu);
  if (!interroge) return null;
  if (/ARGUS_SYSTEM_ALERTS/.test(nu)) return null;
  return '.maestro/_subflows/dismiss-system-alerts.yaml interroge l\'arbre sans lire '
    + '`ARGUS_SYSTEM_ALERTS` : ce geste attend donc sa borne à CHAQUE flow (~6,4 s mesurés, '
    + '~44 s par suite) même quand aucune invite ne peut naître. Ce fichier t\'appartient, '
    + 'l\'installeur ne le remplace pas — reprends la forme livrée dans le scaffold (517), '
    + 'qui enveloppe l\'interrogation dans un `when: true:` dérivé de tes permissions.';
}

function invitesSystemePossibles(config) {
  // ⚠️ 525 — CETTE LISTE EST ANDROID PAR NATURE, et son commentaire le dit : il
  // prescrit de la dériver de `aapt2 dump permissions … app-release.apk`. Un
  // projet iOS n'a aucun APK dont la tirer, donc elle reste à la valeur LIVRÉE
  // — `[android.permission.INTERNET]`, inerte, c'est-à-dire la SEULE qui
  // désarme (clé absente et liste vide rendent toutes deux `true`).
  // Mesuré au run 90 : 5 flows rouges, 159 s de device, et un message qui
  // accusait une ancre parfaitement correcte pendant que l'invite de
  // notifications couvrait le splash. Dès qu'iOS est déclaré, on ne décide donc
  // pas : on joue. C'est la direction que le 517 avait lui-même écrite —
  // rater une invite donne un flow ROUGE, un geste inutile coûte 6,4 s.
  // ⚠️ ET LE REMÈDE ÉVIDENT EST FAUX : dériver des `NS*UsageDescription` de
  // l'Info.plist raterait PRÉCISÉMENT le cas rencontré, l'invite de
  // notifications n'en portant aucune.
  // 📌 La plateforme se lit dans `config` et non en paramètre : le 517 avait
  // raison de refuser un câblage de plus, qui peut s'oublier en silence.
  //
  // 🔴 531 — ET CE QUE LE PLUGIN NE PEUT PAS DÉCOUVRIR, L'UTILISATEUR LE DÉCLARE.
  // Le run 93 a mesuré ce que « un geste inutile ne casse rien » taisait : sur
  // iOS le geste inconditionnel ABSORBE la mesure de démarrage — 7 flows sur 8,
  // 83 à 95 ms retenus derrière 7 110 à 7 160 ms d'attente — donc le budget
  // n'est jugeable sur aucun. La déclaration passe AVANT toute dérivation,
  // puisqu'elle est le seul endroit où la réponse existe sur cette plateforme.
  // Le défaut est `auto`, c'est-à-dire le comportement d'hier : aucun projet
  // déjà installé ne change de verdict sans l'avoir écrit.
  const etat = String(config.security?.systemAlerts ?? 'auto');
  // ⚠️ REFUSER, jamais replier : une faute de frappe qui retomberait sur `auto`
  // rendrait la déclaration inerte en silence — et le lecteur croirait avoir
  // désarmé le geste pendant qu'il continue de coûter. C'est la forme du 508.
  if (!(etat in ETATS_INVITES_SYSTEME)) {
    throw new Error(`argus.mobile.yaml — \`security.systemAlerts: ${etat}\` n'est pas un état admis. `
      + `Choisis parmi ${Object.keys(ETATS_INVITES_SYSTEME).join(' | ')} : c'est une énumération, `
      + 'pas une phrase. ' + Object.entries(ETATS_INVITES_SYSTEME).map(([k, d]) => `${k} = ${d}`).join(' · '));
  }
  if (etat === 'never') return false;
  if (etat === 'always') return true;
  const plateformes = (config.platforms ?? []).map((p) => String(p).toLowerCase());
  if (plateformes.includes('ios')) return true;
  const declarees = config.security?.expectedPermissions ?? [];
  if (declarees.length === 0) return true;
  const inerte = (/** @type {string} */ p) => PERMISSIONS_SANS_INVITE.has(p)
    || SUFFIXES_SANS_INVITE.some((s) => p.endsWith(s));
  return declarees.map(String).some((/** @type {string} */ p) => !inerte(p));
}

/**
 * Coupe les animations système et RELIT la valeur pour le prouver. Un
 * `settings put` peut échouer silencieusement selon l'image de l'émulateur.
 *
 * ⚠️ Les trois champs optionnels n'existent que sur le chemin Android MESURÉ :
 * c'est `verdictAnimations` (507) qui les apporte, plus le relevé d'`avant`.
 * Le JSDoc disait `{ok, detail}` seul, et l'appelant lisait `aRestaurer` — un
 * écart que seul `tsc` voit, donc que rien ne voyait hors de la CI.
 * @param {string} platform @param {string} udid @param {boolean} dryRun
 * @returns {{ok:boolean, detail:string, prouve?:boolean, aRestaurer?:string[]|null, avant?:string[]}}
 */
function disableAnimations(platform, udid, dryRun) {
  if (platform !== 'android') {
    return { ok: false, detail: 'iOS : pas d\'équivalent local à `settings put` (disableAnimations du config.yaml est Cloud only)' };
  }
  if (dryRun) return { ok: true, detail: 'dry-run' };
  const avant = ANIMATION_SCALES.map((key) => sh('adb', ['-s', udid, 'shell', 'settings', 'get', 'global', key]).stdout.trim());
  const apres = [];
  for (const key of ANIMATION_SCALES) {
    sh('adb', ['-s', udid, 'shell', 'settings', 'put', 'global', key, '0']);
    apres.push(sh('adb', ['-s', udid, 'shell', 'settings', 'get', 'global', key]).stdout.trim());
  }
  return { ...verdictAnimations(avant, apres), avant };
}

/**
 * Ce que la coupure a établi, et ce qu'il faudra rendre.
 *
 * 🔴 POURQUOI CETTE FONCTION EXISTE (507). La version d'avant écrivait `0`,
 * relisait, et concluait `ok` sur `tout vaut 0`. C'est juste — et ça cesse de
 * prouver quoi que ce soit dès le SECOND run sur le même appareil, parce que
 * personne ne restaurait : les échelles valaient déjà `0` en arrivant, la
 * relecture rendait `0`, et l'écriture n'avait rien eu à faire. *Un garde qui ne
 * peut plus dire non n'est plus un garde* — or le commentaire d'`animationsApplicables`
 * explique précisément pourquoi ce signal compte ici : un `settings put` peut
 * échouer selon l'image de l'émulateur, et c'est ce cas-là qu'on veut voir.
 *
 * D'où deux verdicts au lieu d'un. `ok` dit l'ÉTAT (le run sera déterministe),
 * `prouve` dit si l'écriture a été MESURÉE — ce qui n'est possible que si au
 * moins une valeur d'avant différait. Les deux sont utiles et ils ne disent pas
 * la même chose.
 *
 * 📌 Et c'est la restauration qui rend la preuve possible au run suivant : les
 * deux moitiés de ce point se ferment par le même geste, l'une servant l'autre.
 *
 * @param {string[]} avant valeurs relevées avant l'écriture
 * @param {string[]} apres valeurs relues après
 * @returns {{ok:boolean, prouve:boolean, aRestaurer:string[]|null, detail:string}}
 */
export function verdictAnimations(avant, apres) {
  const zero = (/** @type {string} */ v) => Number.parseFloat(v) === 0;
  const ok = apres.length === ANIMATION_SCALES.length && apres.every(zero);
  // Une valeur illisible (`null`, vide, appareil perdu) n'est pas un `0` : on ne
  // restaure que ce qu'on a su lire, et un tel relevé ne prouve rien non plus.
  const lisible = avant.length === ANIMATION_SCALES.length && avant.every((v) => Number.isFinite(Number.parseFloat(v)));
  const prouve = ok && lisible && avant.some((v) => !zero(v));
  const detail = !ok
    ? `${ANIMATION_SCALES.length} échelles → ${apres.join(', ')}`
    : prouve
      ? `${ANIMATION_SCALES.length} échelles coupées (étaient ${avant.join(', ')}) — restaurées en fin de run`
      : lisible
        ? `${ANIMATION_SCALES.length} échelles à 0, mais elles y étaient DÉJÀ : l'écriture n'a rien pu prouver, et rien n'est à rendre`
        : `${ANIMATION_SCALES.length} échelles à 0, mais le relevé d'AVANT est illisible (${avant.join(', ')}) : rien ne sera restauré`;
  return { ok, prouve, aRestaurer: prouve ? avant : null, detail };
}

/**
 * Rend à l'appareil les échelles qu'on lui a prises.
 * @param {string} udid @param {string[]} valeurs
 */
function restoreAnimations(udid, valeurs) {
  ANIMATION_SCALES.forEach((key, i) => {
    sh('adb', ['-s', udid, 'shell', 'settings', 'put', 'global', key, valeurs[i]]);
  });
}

/**
 * Arme la restauration sur TOUTES les sorties, et pas seulement sur la bonne.
 *
 * ⚠️ `main()` sort par une dizaine de `process.exit()` répartis après la
 * coupure : un geste posé « à la fin » n'aurait été joué que sur un chemin sur
 * dix, ce qui est la façon la plus sûre d'écrire un remède que rien n'exerce.
 * `exit` les couvre tous — et il ne couvre QUE le synchrone, ce qui tombe bien :
 * `sh` est un `spawnSync`.
 *
 * ⚠️ Un `exit` seul ne se déroule pas sur Ctrl+C, d'où les deux signaux. La
 * garde `fait` rend le geste idempotent : sur SIGINT, `exit` suit.
 *
 * @param {{on:Function, exit:Function}} proc @param {() => void} rendre
 * @param {string[]|null} aRestaurer
 * @returns {boolean} vrai si la restauration a été armée
 */
export function armerRestaurationAnimations(proc, rendre, aRestaurer) {
  if (!aRestaurer || aRestaurer.length === 0) return false;
  let fait = false;
  const uneFois = () => { if (fait) return; fait = true; rendre(); };
  proc.on('exit', uneFois);
  for (const signal of ['SIGINT', 'SIGTERM']) proc.on(signal, () => { uneFois(); proc.exit(130); });
  return true;
}

/**
 * Vide le TROUSSEAU du simulateur iOS — ce que `clearState` ne fait pas.
 *
 * 🔴 POURQUOI CETTE FONCTION EXISTE, et c'est la panne la plus coûteuse trouvée
 * sur cette plateforme. `launch-clean.yaml` annonce `clearState` comme « la
 * première règle anti-flake mobile », et ce fichier promet ailleurs qu'il « remet
 * l'app à l'état d'une installation fraîche ». **C'est faux sur iOS** : les jetons
 * d'authentification vivent dans le trousseau, qui SURVIT à la suppression de
 * l'app — là où le `pm clear` d'Android les emporte.
 *
 * Mesuré sur quatre passes d'un projet réel, trousseau vidé à la main juste
 * avant : le PREMIER flow atteint l'écran d'identification en **78 à 142 ms**,
 * tous les suivants expirent à **~20 200 ms** parce que l'application y démarre
 * sur l'écran de code secret. La règle anti-flake tombe donc en silence sur une
 * plateforme entière, et l'échec accuse une ancre parfaitement correcte — le pire
 * verdict que ce harnais sache produire.
 *
 * ⚠️ Le geste ne peut pas vivre dans le sous-flow : la sandbox de Maestro n'a ni
 * shell ni système de fichiers. Il appartient au runner, exactement comme la
 * coupure des animations côté Android.
 *
 * ⚠️ Et il RELIT son propre effet plutôt que de l'annoncer : `simctl` rend 0 même
 * quand il n'a rien fait, donc seul le code de sortie ne prouve rien.
 * @param {string} platform @param {string} udid @param {boolean} dryRun
 * @returns {{ok:boolean, detail:string}}
 */
function resetKeychain(platform, udid, dryRun) {
  if (platform !== 'ios') {
    return { ok: false, detail: 'Android : `pm clear` emporte déjà les données, trousseau compris' };
  }
  if (dryRun) return { ok: true, detail: 'dry-run' };
  const r = sh('xcrun', ['simctl', 'keychain', udid, 'reset']);
  if (r.status !== 0) {
    return { ok: false, detail: `xcrun simctl keychain reset a échoué (${(r.stderr || '').trim().slice(0, 120)})` };
  }
  return { ok: true, detail: 'trousseau vidé — les jetons d\'une session précédente ne survivent pas' };
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

// `startScreen` vit désormais dans `config.mjs` : `--check-reachability` en a
// besoin, et config ne peut pas importer run (run importe perf, qui importe
// config). Extraite, pas recopiée — c'est la seule forme qui ne diverge pas.
// Réexportée plus bas, pour que rien de ce qui l'importait ne change.

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
    // L'ID de l'écran de départ, pas seulement son ancre : c'est lui qui permet
    // à `goto.yaml` de savoir quel écran le lancement atteint DÉJÀ, au lieu de
    // le deviner par un préfixe. Un `startsWith('home')` sert `home-empty` et
    // ment sur `home-filled` — et le même piège attend chaque famille d'états.
    ARGUS_START_SCREEN: home?.id ?? '',
    ARGUS_AUTH_SCREEN: anchors.screen ?? '',
    ARGUS_AUTH_USER: anchors.user ?? '',
    ARGUS_AUTH_PASS: anchors.password ?? '',
    ARGUS_AUTH_SUBMIT: anchors.submit ?? '',
    ARGUS_AUTH_SUCCESS: anchors.success ?? '',
    // L'écran qu'on doit voir APRÈS `login.yaml` — et ce n'est PAS l'écran de
    // départ. Sur une app authentifiée, `ARGUS_ANCHOR_HOME` porte l'ancre de
    // l'écran `start: true`, donc celui de CONNEXION : deux flows l'assertaient
    // juste après s'être connectés, c'est-à-dire l'écran qu'ils venaient de
    // quitter. L'échec accusait alors l'instrumentation — capture de l'accueil
    // à l'appui — et conseillait de relever `startTimeoutMs`, pour une lenteur
    // qui n'existait pas.
    //
    // ⚠️ Dérivée ICI et pas recopiée dans chaque flow : la décision « après
    // authentification, ce n'est plus l'écran de départ » est une, et les deux
    // `when` qui l'auraient portée auraient divergé au premier flow ajouté.
    // Sans authentification configurée, `success` est vide et la valeur retombe
    // sur l'écran de départ, qui est alors le bon.
    ARGUS_ANCHOR_AFTER_AUTH: anchorAfterAuth(anchors, home),
    // ⚠️ LA DÉCISION VIT ICI, pas dans la condition du sous-flow. Le commentaire
    // de `argus.mobile.yaml` promettait « une seule vide → le sous-flow skippe
    // en entier, plutôt que d'échouer à mi-parcours sur un champ introuvable » ;
    // la condition, elle, ne regardait que `ARGUS_AUTH_USER`. Renseigner le champ
    // identifiant en laissant `screen` vide — une instrumentation commencée puis
    // interrompue — faisait donc partir un `assertVisible` sur un id VIDE, soit
    // exactement ce que la phrase disait éviter. Dix-septième run.
    //
    // Reconstruire l'expression à sept variables dans le YAML l'aurait rendue
    // illisible et intestable ; ici, un garde l'exerce dans les deux sens.
    ARGUS_AUTH_READY: authAnchorsReady(anchors) ? '1' : '',
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
    // Repli SÛR : en l'absence d'injection, le pas joue comme avant le 486.
    ARGUS_ANIMATIONS_APPLICABLE: 'true',
    // 517 — dérivé ICI et nulle part ailleurs : `buildEnv` reçoit déjà `config`,
    // donc la valeur ne peut pas manquer à un site d'appel. Le 486, lui, dépend
    // de `platform` et doit être passé trois fois : un câblage de plus est un
    // câblage qui peut s'oublier, et son oubli est SILENCIEUX (repli légal).
    ARGUS_SYSTEM_ALERTS: String(invitesSystemePossibles(config)),
    ...extra,
  };
  // Secrets : uniquement depuis l'environnement, jamais depuis le fichier.
  for (const name of config.auth?.secretsFromEnv ?? []) {
    env[name] = process.env[name] ?? '';
  }
  return env;
}

/**
 * Les secrets DÉCLARÉS dont la valeur est vide.
 *
 * ⚠️ `buildEnv` remplit un secret absent par `''` — délibérément, pour que le
 * flow décide plutôt que de casser. Mais rien ne le DISAIT : un run a perdu une
 * passe device de sept minutes sur un login sauté en silence, parce que chaque
 * appel shell d'un agent est un processus neuf et que le `source` du fichier de
 * secrets ne survivait pas d'un appel à l'autre.
 */
export function secretsVides(env) {
  return Object.entries(env ?? {})
    .filter(([cle, valeur]) => /^QA_[A-Z0-9_]+$/.test(cle) && String(valeur ?? '') === '')
    .map(([cle]) => cle);
}

/**
 * La commande telle qu'on l'imprime : secrets masqués, MAIS un secret vide
 * affiché comme vide.
 *
 * ⚠️ C'est la moitié qui manquait, et c'est elle qui coûtait. L'ancien masquage
 * remplaçait tout ce qui suit le `=` sans regarder la valeur, si bien qu'un
 * secret ABSENT s'affichait `QA_PHONE=***`, à l'identique d'un secret présent —
 * exactement à l'endroit où l'on regarde pour vérifier. Un affichage qui ne sait
 * pas distinguer les deux cas n'est pas une précaution, c'est un piège.
 */
export function masquerSecrets(args) {
  return (args ?? []).map((a) => {
    const trouve = /^(QA_[A-Z0-9_]+)=([\s\S]*)$/.exec(String(a));
    if (!trouve) return a;
    return trouve[2] === '' ? `${trouve[1]}=<VIDE>` : `${trouve[1]}=***`;
  });
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

  const shown = `maestro ${masquerSecrets(args).join(' ')}`;
  // ⚠️ L'avertissement compte autant que l'affichage : sans lui, on lit `<VIDE>`
  // dans une ligne de commande longue de trois cents caractères, ce qui revient à
  // ne rien lire du tout.
  const vides = secretsVides(env);
  if (vides.length) {
    console.warn(`⚠️  secret(s) déclaré(s) dans auth.secretsFromEnv mais VIDE(s) : ${vides.join(', ')}`);
    console.warn('    Le flow qui en dépend sera SAUTÉ, sans autre signe que cette ligne.');
    console.warn('    Chaque appel shell est un processus neuf : source les secrets et lance');
    console.warn('    le runner dans la MÊME commande, sinon ils ne survivent pas.');
    // ⚠️ LA SECONDE FRONTIÈRE, ET C'EST ELLE QUI MORD. Un run a lu cet
    // avertissement, sourcé le fichier dans la même commande — et les valeurs
    // n'arrivaient toujours pas. Un fichier de lignes `CLE=valeur` nues donne
    // des variables de SHELL, que le processus fils ne voit pas : il faut
    // qu'elles soient EXPORTÉES. Nommer la frontière de processus sans nommer
    // celle de l'export laisse à mi-chemin, au seul endroit où l'on regarde.
    console.warn('    Et il faut qu\'ils soient EXPORTÉS : un fichier de `CLE=valeur` nues');
    console.warn('    sourcé tel quel ne donne que des variables de shell, invisibles au');
    console.warn('    processus fils. Utilise `set -a && source <fichier> && set +a`.');
  }
  log(shown);
  // 🔴 DIRE QUE LE SILENCE EST NORMAL, ET COMBIEN IL DURE (469). Hors
  // `--verbose`, la sortie de Maestro est CAPTURÉE : ce flow ne dira plus rien
  // jusqu'à sa dernière ligne, et il dure des minutes. Un run en aveugle en a
  // conclu que la commande était pendue, a lancé **une dizaine de boucles
  // d'attente** en arrière-plan pour suivre l'avancement sur le disque, et le
  // système a fini par tuer ce tas — en emportant le simulateur avec lui.
  // *Un outil qui ne donne aucun signe de vie fabrique lui-même les sondes qui
  // le tuent.* Une ligne coûte moins cher que le tas.
  if (!dryRun && !verbose) {
    log('  ⏳ ce flow ne rendra plus une ligne avant sa fin (sortie capturée) — '
      + 'compte quelques minutes. N\'écris pas de boucle de sondage : ajoute '
      + 'ARGS="--verbose" pour suivre Maestro en direct.');
  }
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
      // ⚠️ LE BON DIAGNOSTIC DOIT SORTIR EN CONSOLE, PAS SEULEMENT DANS LE
      // RAPPORT. Il était rattaché au champ `actual` du finding — donc lisible
      // à la fin, dans le HTML — pendant que la console ne portait que
      // `startupMarginWarning` : « relève le plafond ». Un run l'a suivi et a
      // relevé à 20, 45 puis 90 s ; la pire attente est venue se coller au
      // plafond à 80 ms près à chaque fois, parce que l'app affichait « Service
      // indisponible » et ne démarrait pas du tout. TROIS passes device pour
      // un diagnostic que le rapport nommait déjà en cause n° 1.
      // Les deux textes existaient ; seul le mauvais arrivait en premier.
      const indice = startupHint(selector, startupAnchor, config, key);
      if (indice && !indiceDeDemarrageDit) {
        indiceDeDemarrageDit = true;
        warn(`échec sur l'écran de départ${indice}`);
      }
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
// ⚠️ Un indice répété à chaque flow en échec n'est plus un indice : sur une suite
// où l'app ne démarre pas, il sortirait six fois de suite et noierait le reste.
// Un process = un run, donc un drapeau de module suffit.
let indiceDeDemarrageDit = false;

function startupHint(selector, startupAnchor, config, commandKey = '') {
  if (!startupAnchor || selector !== `id=${startupAnchor}`) return '';
  // ⚠️ ET SEULEMENT SI L'ÉTAPE ATTENDAIT. Collé à n'importe quelle étape portant
  // ce sélecteur, l'indice se retrouve sur un `assertScreenshot` — qui a bien
  // comparé, sur un écran bien arrivé — et conseille alors de vérifier le temps
  // de démarrage devant une vraie divergence d'image. Observé au septième run
  // sur une divergence de 5,04 %. `WAIT_COMMANDS` est défini vingt lignes plus
  // haut et n'était pas consulté ici.
  if (commandKey && !WAIT_COMMANDS.has(commandKey)) return '';
  // ⚠️ ET IL DOIT NOMMER LE BON LEVIER. Ce message ne citait que
  // `thresholds.coldStartMs` — donc la seule clé qu'on relève quand on est
  // pressé, et précisément celle que `startTimeoutMs` existe pour épargner : la
  // relever relâche du même coup le gate chargé de RAPPORTER cette lenteur, ce
  // que le SKILL.md interdit en toutes lettres. La doc prescrivait un geste,
  // l'outil en conseillait un autre, et rien ne pouvait le voir — un écart entre
  // deux textes n'a aucun comportement à casser. Trouvé au seizième run.
  const plafond = startTimeoutMs(config);
  const froid = config.thresholds?.coldStartMs ?? 2000;
  // ⚠️ ET LA QUATRIÈME EST ARRIVÉE APRÈS (point 389) : deux runs ont relevé le
  // plafond parce qu'aucune des trois ne décrivait ce qu'ils voyaient — l'écran
  // arrivait, l'ancre était juste, mais une modale système le couvrait, puis une
  // session survivante en affichait un AUTRE. Le tell était dans les chiffres et
  // n'était écrit nulle part : la pire attente collée au plafond à ~200 ms près,
  // DEUX fois de suite (20 268/20 000 puis 45 205/45 000), signe d'un écran qui
  // n'arrive jamais et non d'un écran lent.
  // ⚠️ ET IL MANQUAIT LA TROISIÈME HYPOTHÈSE, celle qui coûte le plus (point
  // 237). Ce message opposait « ancre fausse » à « écran lent » et envoyait
  // relever un plafond — or l'écran peut n'être ni l'un ni l'autre : une app
  // qui ne démarre pas. Vécu sur un projet réel : « Service indisponible » à
  // chaque lancement faute d'un fichier de configuration absent du bundle.
  // Relever le plafond n'y aurait JAMAIS rien changé, et l'agent a perdu du
  // temps à chercher une lenteur qui n'existait pas.
  //
  // Le geste qui tranche en une seconde ne coûte rien : Maestro écrit une
  // capture À L'INSTANT de l'échec. On la NOMME, plutôt que de laisser
  // quelqu'un la chercher ou la reprendre à la main.
  return ` — quatre causes possibles, et la plus chère n'est pas celle qu'on`
    + ` cherche. (1) L'app ne démarre PAS : REGARDE D'ABORD la capture que`
    + ` Maestro vient de prendre, dans argus-mobile-report/maestro/<horodatage>/`
    + `<nom du flow>/screenshots/ — si elle montre une erreur de l'app, aucun`
    + ` plafond n'y changera rien. (2) CE N'EST PAS L'ÉCRAN QU'ON CROIT : sur la`
    + ` MÊME capture, une modale SYSTÈME par-dessus (permissions.all: allow ne`
    + ` couvre pas celle que l'OS présente lui-même), ou un écran d'APRÈS-connexion`
    + ` (sur iOS le trousseau survit à clearState — mets clearKeychain avec lui),`
    + ` ou UNE AUTRE APP au premier plan, posée sur le même appareil par un`
    + ` travail voisin : \`adb shell pm list packages -3\` croisé avec le`
    + ` lastUpdateTime de dumpsys le dit en une commande.`
    + ` L'ancre est correcte dans les trois cas, et l'attente consomme TOUT le`
    + ` plafond : si la pire attente est collée au plafond à quelques dizaines de`
    + ` ms, c'est ce cas-ci et jamais une lenteur. (3) L'écran de départ est LENT :`
    + ` relève thresholds.startTimeoutMs (plafond effectif ${plafond} ms), dérivé du`
    + ` maximum que montre startup.samples du rapport. (4) L'ancre est fausse :`
    + ` \`make argus-anchors\` le dit sans device. Ne touche PAS à`
    + ` thresholds.coldStartMs (${froid} ms) : la lenteur de démarrage doit`
    + ` rester un finding, pas disparaître dans un seuil.`;
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
 * Les junit visuels que ce run ne réécrira PAS, donc qui mentiraient.
 *
 * Le chemin d'un junit est fixe et réécrit à chaque invocation (454) — mais
 * seulement pour les écrans encore joués. Un écran passé à `visual: false` sort
 * de la boucle, et son fichier reste avec le `failures="1"` de la fois d'avant.
 * Aucun script d'ici ne le lit, ce qui le rend plus dangereux et non moins : la
 * CI publie `argus-mobile-report/*.xml` en bloc, donc tout agrégateur de junit
 * compte un échec sur un écran que plus personne ne teste.
 *
 * @param {string[]} fichiers ce que contient le dossier de rapport
 * @param {Array<{id:string}>} visualScreens les écrans que ce run va rejouer
 * @returns {string[]} les noms à retirer
 */
export function junitsVisuelsOrphelins(fichiers, visualScreens) {
  const attendus = new Set((visualScreens ?? []).map((s) => `report.visual-${s?.id}.junit.xml`));
  return (fichiers ?? [])
    .filter((n) => /^report\.visual-.+\.junit\.xml$/.test(n))
    .filter((n) => !attendus.has(n));
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
 * @returns {Array<{flow:string, ms:number, status:string, precedeMs:number, absorbed:boolean}>}
 */
function startupSamples(bundles, anchor, floorMs = 0) {
  /** @type {Array<{flow:string, ms:number, status:string, precedeMs:number, absorbed:boolean}>} */
  const samples = [];
  if (!anchor) return samples;
  for (const bundle of bundles) {
    const steps = bundle.steps ?? [];
    // La PREMIÈRE seulement : les suivantes portent une app déjà chaude.
    const step = steps.find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')
      && selectorOf(s) === `id=${anchor}`);
    const ms = Number(step?.metadata?.duration ?? NaN);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    // ⚠️ CE QUI ATTEND AVANT LA MESURE LUI EST SOUSTRAIT, ET LE 460 N'EN A FERMÉ
    // QU'UNE FORME. Son remède était un ORDRE — l'attente d'ancre en premier,
    // pour qu'elle parte du lancement. Le 405 a ensuite porté le geste d'invite
    // système DANS `launch-clean.yaml`, pour qu'il soit atteint par tous les
    // flows : correctif juste, et il s'insère AVANT elle. Mesuré au run 76 sur
    // une app à splash de 2 s : son `tapOn` optionnel attend sa borne — 7017 à
    // 7144 ms sur 40 exécutions, une CONSTANTE, donc un timeout et non un geste
    // — et l'app démarre pendant ce temps. La mesure retenue tombait alors à
    // 52-104 ms sur neuf flows sur dix, `brandedSplashMs` en était soustrait, et
    // `QAM-START` ne pouvait PLUS JAMAIS sortir.
    //
    // On ne peut pas le corriger par l'ordre — l'alerte système doit être
    // écartée avant qu'on cherche l'ancre, sinon elle couvre l'écran (405).
    // Donc on MESURE ce qui s'est intercalé, et on le dit : `timestamp` est le
    // DÉBUT d'une étape (vérifié sur les artefacts : launchApp à ts+441 est
    // suivi de l'étape ts+442), d'où l'écart entre la FIN du lancement et le
    // DÉBUT de la mesure.
    const lancement = steps.find((s) => Object.keys(s?.command ?? {})[0] === 'launchAppCommand');
    const debutMesure = Number(step?.metadata?.timestamp ?? NaN);
    const finLancement = Number(lancement?.metadata?.timestamp ?? NaN)
      + Number(lancement?.metadata?.duration ?? 0);
    const precedeMs = Number.isFinite(debutMesure) && Number.isFinite(finLancement)
      ? Math.max(0, Math.round(debutMesure - finLancement))
      : 0;
    // Le critère est DÉRIVÉ, jamais deviné : il n'emploie que le plancher de
    // splash DÉJÀ déclaré. Quelque chose a attendu au moins aussi longtemps que
    // le splash assumé, et la mesure retenue est plus courte que lui : elle ne
    // peut donc pas le contenir. Sur le run 76 ça sépare exactement les deux
    // cas — 7355 ms avant une mesure de 58 pour les neuf flows qui passent par
    // `launch-clean`, 1750 avant 2697 pour celui qui lance lui-même, et ce
    // dernier reste une mesure. Sans `brandedSplashMs`, on ne conclut pas : le
    // relevé porte quand même `precedeMs`, et le lecteur tranche.
    const absorbed = floorMs > 0 && precedeMs >= floorMs && ms < floorMs;
    samples.push({
      flow: bundle.flow,
      ms,
      status: String(step.metadata?.status ?? ''),
      precedeMs,
      absorbed,
    });
  }
  return samples;
}

/**
 * Les écrans que les flows ont RÉELLEMENT atteints, dérivés des étapes exécutées.
 *
 * ⚠️ `screensDeclared` et `screensConfigured` répondent à « qu'ai-je écrit dans
 * `screens[]` ? », jamais à « qu'ai-je testé ? ». Sur un projet réel, « 12 sur
 * 12 » se lisait comme une couverture complète alors que quatre écrans
 * n'étaient jamais visités : leurs branches `goto.yaml` existaient, rien ne les
 * appelait. La donnée était pourtant là — 46 `commands.json` que le runner
 * produit et relit déjà pour `startupSamples` — et rien ne la dérivait.
 *
 * Un écran compte comme atteint quand son ancre de racine apparaît dans une
 * étape COMPLETED : c'est la preuve qu'un flow l'a eu sous les yeux, et non
 * qu'un fichier le mentionne.
 * @param {any[]} bundles @param {any[]} screens @returns {string[]}
 */
export function visitedScreens(bundles, screens) {
  /** @type {Set<string>} */
  const vues = new Set();
  for (const bundle of bundles ?? []) {
    for (const step of bundle?.steps ?? []) {
      if (String(step?.metadata?.status ?? '').toUpperCase() !== 'COMPLETED') continue;
      const sel = selectorOf(step);
      if (sel.startsWith('id=')) vues.add(sel.slice(3));
    }
  }
  return (screens ?? [])
    .filter((/** @type {any} */ sc) => sc?.anchor && vues.has(sc.anchor))
    .map((/** @type {any} */ sc) => sc.id);
}

/**
 * L'ancre qu'on doit voir APRÈS `login.yaml`.
 *
 * ⚠️ Ce n'est PAS l'écran de départ. Sur une application authentifiée, l'écran
 * `start: true` est celui de CONNEXION — l'asserter après s'être connecté, c'est
 * viser celui qu'on vient de quitter. Deux flows le faisaient, et l'échec
 * accusait l'instrumentation, capture de l'accueil à l'appui, en conseillant de
 * relever `startTimeoutMs` pour une lenteur qui n'existait pas.
 *
 * ⚠️ Sans authentification configurée, `success` est vide et l'on retombe sur
 * l'écran de départ — qui est alors le bon. Les deux moitiés comptent : un
 * remède qui viserait toujours `success` casserait toutes les apps locales.
 * @param {any} anchors @param {any} home @returns {string}
 */
/**
 * L'ancre d'où part le parcours critique — l'après-connexion s'il y en a une,
 * sinon l'ACCUEIL.
 *
 * ⚠️ Le nom dit « after auth » et la valeur n'en vient pas toujours : sur une
 * app sans compte, elle vaut l'ancre d'accueil, donc elle n'est JAMAIS vide dès
 * que le projet est instrumenté. La branche `=== ''` de `journey-critical.yaml`
 * est alors injoignable — un corps écrit dedans ne s'exécute pas et le flow
 * rend « 0 failures ». Exportée pour qu'un garde APPELLE cette décision au lieu
 * de lire le fichier : un garde de texte ne verrait pas une branche morte.
 * @param {any} anchors les ancres d'authentification déclarées
 * @param {any} home l'écran d'accueil déclaré
 * @returns {string} l'ancre de départ, ou '' si rien n'est instrumenté
 * (l'export vit dans la liste de fin de fichier, avec ses voisins)
 */
function anchorAfterAuth(anchors, home) {
  return String(anchors?.success || home?.anchor || '');
}

/**
 * Le démarrage à froid dépasse-t-il le seuil déclaré ? Un seul finding pour le
 * lot : six lignes disant la même chose sur six flows, c'est du bruit qui fait
 * cesser de lire les rapports.
 * ⚠️ `variante` est le binaire RÉELLEMENT posé sur l'appareil, lu par
 * `installedVariant`. Ces flows s'exécutent sur le paquet qu'`argus-build` a
 * installé — donc un debug par défaut, où Flutter tourne en JIT. Le finding
 * partait sans le dire pendant que ses deux jumeaux de `perf.mjs` le disaient.
 * @param {Array<{flow:string, ms:number, status:string, precedeMs:number, absorbed:boolean}>} samples
 * @param {any} device @param {string} platform @param {any} config
 * @param {'debug'|'release'|''} [variante]
 * @returns {any[]}
 */
/**
 * Le remède d'une absorption dépend de CE QUI a fait attendre — et le runner le
 * sait déjà : si aucune permission déclarée n'ouvre d'invite, le geste d'invite
 * ne joue pas, donc ce n'est pas lui. Prescrire de le retirer enverrait alors
 * défaire un appel déjà inerte (524, rendu par le run 89).
 * ⚠️ Extraite pour que le garde l'APPELLE et lise ce qui revient : un garde qui
 * lirait le texte du fichier ne verrait pas une branche devenue morte.
 * @param {boolean} invitePossible une permission déclarée peut-elle ouvrir une invite
 * @param {string} flow le flow qui a le plus attendu — celui qu'il faut ouvrir
 * @returns {string}
 */
function remedeAbsorption(invitePossible, flow) {
  const ici = flow ? `« ${flow} »` : 'le flow qui a le plus attendu';
  if (!invitePossible) {
    return `Ce n'est PAS le geste d'invite système : aucune de tes permissions déclarées `
      + `n'ouvre d'invite, il ne joue donc pas — et les autres flows le prouvent, ils mesurent `
      + `sans attendre. Le retard vient d'AILLEURS, dans ${ici} : ouvre-le et cherche, entre son `
      + '`launchApp` et sa première attente d\'ancre, toute commande qui patiente. Le cas connu '
      + 'est `waitForAnimationToEnd`, dont la place est APRÈS l\'attente d\'ancre et non avant : '
      + '`startup.samples` chronomètre cette attente-là, donc tout ce qui patiente devant elle '
      + 'lui est soustrait en silence. Ce flow t\'appartient, l\'installeur ne le remplacera pas.';
  }
  return `Le geste qui précède l'attente d'ancre attend sa BORNE quand il n'a rien à fermer — `
    + `~7 s par flow, mesuré, et c'est ${ici} qui a le plus attendu. Si ton app ne demande aucune `
    + 'permission (vérifie ton manifeste ET `lib/`, pas seulement l\'un des deux), déclare-le : '
    + '`security.systemAlerts: never` dans argus.mobile.yaml, et `dismiss-system-alerts.yaml` '
    + 'cesse d\'être joué — c\'est l\'équivalent d\'en retirer l\'appel, en une ligne que la mise '
    + 'à jour ne reposera pas. '
    + 'Si elle en demande, garde-le et joue-le là où l\'invite NAÎT — souvent après la connexion, '
    + 'pas au lancement — en acceptant le coût sur les flows concernés. '
    + 'Et si tu le gardes ALORS QUE rien ne peut ouvrir d\'invite — défendable, la plateforme en '
    + 'présente parfois d\'elle-même — sache ce que ça coûte : ce même délai sur CHAQUE flow, et '
    + 'le budget de démarrage ne sera jugeable sur AUCUN d\'eux, aussi longtemps que le geste '
    + 'restera là. Ne cherche pas à borner le tap : `timeout:` n\'est pas une propriété de `tapOn`. '
    + '⚠️ Et n\'essaie pas de retirer l\'appel de `launch-clean.yaml` : ce fichier est au CADRE, '
    + 'donc `--update` le reposerait — ce texte a prescrit ce geste en affirmant qu\'il '
    + 't\'appartenait, et un run l\'a payé en cherchant comment faire.';
}

function startupFindings(samples, device, platform, config, variante = '') {
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
  // ⚠️ UN FLOW MORT NE MESURE PAS UNE DURÉE — IL MESURE LE PLAFOND. Un échantillon
  // `FAILED` s'est arrêté parce que l'attente a expiré : sa valeur est le seuil
  // qu'on lui a donné, pas le temps qu'aurait mis l'écran. C'est une mesure
  // CENSURÉE, au sens statistique — on sait « au moins tant », jamais « tant ».
  // La retenir comme pire cas transforme une panne d'application en finding de
  // PERFORMANCE : mesuré sur un run réel, un flow tombé à 20 021 ms sur un écran
  // d'erreur a produit « l'écran de départ met 20 s » pendant que les six autres
  // étaient entre 947 et 2646 ms. Le code connaissait déjà le statut — il le
  // comptait dans `timedOut` — et ne s'en servait pas pour choisir le pire.
  const vivantes = samples.filter((s) => String(s.status ?? '').toUpperCase() !== 'FAILED');
  const timedOut = samples.length - vivantes.length;
  // ⚠️ UNE MESURE ABSORBÉE EST CENSURÉE COMME UN FLOW MORT, DANS L'AUTRE SENS.
  // Un flow `FAILED` dit « au moins tant » ; un échantillon absorbé dit « au
  // plus tant », parce que le sas s'est déroulé pendant ce qui l'a précédé. Les
  // deux sont des non-mesures, et les garder fait rendre un verdict sur du
  // néant — ici un budget TENU, ce qui est le pire des deux sens (479).
  const absorbees = vivantes.filter((s) => s.absorbed);
  const mesures = vivantes.filter((s) => !s.absorbed);
  const over = mesures.filter((s) => net(s) > budget);
  // ⚠️ Et si TOUT est censuré, on ne conclut pas : rendre un finding de lenteur
  // sur zéro mesure serait exactement le « vert sur du néant » que le 367 a fermé,
  // dans l'autre sens. Les flows morts se rapportent par leur propre échec.
  // 🔴 UNE ABSORPTION N'A AUCUN AUTRE CANAL POUR SE DIRE. Un flow mort se
  // rapporte tout seul — il est rouge. Un échantillon absorbé, lui, laisse une
  // suite VERTE et un budget qui n'a pas été jugé : c'est le défaut que le 460
  // avait fermé et que le 405 a rouvert sans le savoir. Se taire serait le
  // reproduire une troisième fois.
  //
  // ⚠️ Il sort dès QU'UN SEUL échantillon est absorbé, pas « quand la majorité
  // l'est » : un seuil de proportion serait un nombre deviné, et sur le run 76
  // il restait trois mesures valides sur quarante — assez pour que le budget
  // ait l'air jugé, alors que 37 flows n'avaient rien mesuré. La sévérité est
  // `info` : il informe, il ne fait pas échouer le gate.
  /** @type {any[]} */
  const findings = [];
  if (absorbees.length > 0) {
    const pire = absorbees.reduce((a, b) => (b.precedeMs > a.precedeMs ? b : a));
    findings.push({
        id: 'QAM-START-ABSORBE',
        title: `le budget de démarrage n'a pas pu être jugé : ${absorbees.length}/${samples.length} `
          + 'flows ont attendu autre chose avant de mesurer l\'écran de départ',
        // ⚠️ CE REMÈDE A PRESCRIT UNE PROPRIÉTÉ QUI N'EXISTE PAS (502). Il
        // conseillait « donne un `timeout:` court au geste optionnel » — or
        // `maestro check-syntax` rend « Unknown Property: timeout » sur un
        // `tapOn` en 2.8.0, le même flow sans cette ligne passant en exit 0.
        // C'est la DEUXIÈME fois du chantier qu'un remède cite une propriété
        // que Maestro refuse ; la première (`accessibilityText:`) avait été
        // attrapée avant livraison, celle-ci a été trouvée par un run qui
        // tentait de l'appliquer. Un `suggestedFix` est de la PROSE dans un
        // objet : rien ne l'exécute, donc il se périme en silence.
        //
        // ⚠️ Et l'alternative évidente ne vaut pas mieux : mesuré sur le même
        // terrain, un `when: visible:` coûte 7 088 ms contre les 7 190-7 490
        // qu'on voulait éviter. La raison tient en un mot — `visible:` ATTEND
        // un élément, quand `true:` ÉVALUE une expression (486).
        //
        // Ce qui reste est donc ce que le run a fait, et qui a marché : ne pas
        // jouer le geste là où il n'a rien à fermer. Le sous-flow t'appartient.
        //
        // ⚠️ ET IL FAUT CHIFFRER LES DEUX BRANCHES (505). Ce texte disait le coût
        // de garder quand l'app demande des permissions, et rien du coût de
        // garder quand elle n'en demande aucune — c'est-à-dire le seul cas où il
        // est INTÉGRAL, et précisément celui où le lecteur hésite. Mesuré : deux
        // agents vierges, le même projet, deux décisions opposées ; celui qui a
        // gardé le geste a vu 10 flows sur 10 absorbés et un budget qu'aucun
        // d'eux ne pouvait juger. *Un remède qui laisse le choix ouvert sans
        // chiffrer les deux branches départage par le tempérament du lecteur.*
        // ⚠️ TROISIÈME PÉREMPTION DE CE REMÈDE (524), et d'une nature neuve : il
        // ne connaissait qu'UNE cause. Il prescrivait de retirer le geste
        // d'invite système — alors que sur le run 89 ce geste ne jouait DÉJÀ
        // pas (aucune permission déclarée n'ouvre d'invite, et les neuf autres
        // flows mesuraient à 8-32 ms). Le lecteur qui l'applique retire un
        // appel inerte, et le finding revient au run suivant. La MESURE était
        // juste et nommait le flow ; c'est le REMÈDE qui était mono-cause.
        suggestedFix: remedeAbsorption(invitesSystemePossibles(config), pire.flow),
        severity: 'info',
        dimension: 'performance',
        screen: 'démarrage',
        step: 0,
        selector: '',
        device: device.id,
        platform,
        osVersion: device.os ?? '',
        expected: `une mesure qui contienne le sas, donc au moins le plancher de marque (${floor} ms)`,
        actual: `${pire.precedeMs} ms attendus avant la mesure sur « ${pire.flow} », `
          + `pour une mesure retenue de ${Math.round(pire.ms)} ms — `
          + absorbees.map((x) => `${x.flow} ${Math.round(x.ms)} ms après ${x.precedeMs}`).join(', '),
      evidence: [],
      repro: [],
      status: 'open',
    });
  }
  // 🔴 ET SANS PLANCHER DE MARQUE, LE MÉCANISME CI-DESSUS EST VACANT (522). Le
  // critère d'absorption n'emploie que `brandedSplashMs` — délibérément, pour ne
  // deviner aucun nombre — donc `absorbed` est TOUJOURS faux quand ce plancher
  // vaut 0, c'est-à-dire sur tout projet sans splash de marque. Le commentaire
  // d'à côté dit « se taire serait le reproduire une troisième fois » ; à 0, il
  // se tait. Mesuré sur un run réel, mêmes chiffres, seule cette clé changeant :
  //
  //     brandedSplashMs = 2000  →  6/7 absorbés · QAM-START-ABSORBE [info]
  //     brandedSplashMs =    0  →  0/7 absorbés · aucun mot sur l'attente
  //
  // et les six relevés valaient 8 à 58 ms derrière 7 022 à 7 097 ms d'attente.
  // ⚠️ Ce run-là n'a produit un verdict que par ACCIDENT : un seul de ses sept
  // flows fait son propre `launchApp`, et c'est lui qui portait la seule vraie
  // mesure. La même suite sans ce flow rend **zéro finding**, donc un budget
  // TENU sur six relevés dont aucun ne mesure le démarrage — le 479 à
  // l'identique. Rien dans le skill n'impose qu'un tel flow existe.
  //
  // 📌 ON NE CONCLUT TOUJOURS PAS, ET C'EST JUSTE : sans plancher, rien ne dit
  // que l'écran ne pouvait pas être prêt avant qu'on cherche. Ce qui manquait
  // n'est pas un verdict, c'est de DIRE qu'on n'a pas pu en rendre un — et le
  // commentaire d'à côté l'affirmait déjà (« le relevé porte quand même
  // `precedeMs`, et le lecteur tranche »), sauf que la page publiée n'en porte
  // AUCUNE trace : mesuré, 0 occurrence de `precede`, `attente` ou `absorb`
  // dans le HTML, contre 7 dans le JSON. *Le lecteur ne peut pas trancher sur un
  // chiffre qu'il ne voit pas.*
  // ⚠️ Le seuil de l'attente est DÉRIVÉ du budget déclaré, jamais deviné : une
  // attente qui vaut à elle seule tout le budget de démarrage est de l'ordre de
  // grandeur qui compte, et `resilience` (1 079 ms devant 2 000) reste donc une
  // mesure — exactement la séparation que le plancher produisait.
  if (floor === 0) {
    const nonJugeables = vivantes.filter((s) => s.precedeMs >= budget && s.ms < budget);
    if (nonJugeables.length > 0) {
      const pire = nonJugeables.reduce((a, b) => (b.precedeMs > a.precedeMs ? b : a));
      findings.push({
        id: 'QAM-START-NONJUGEABLE',
        title: `le budget de démarrage n'a pas pu être jugé sur ${nonJugeables.length}/${samples.length} `
          + 'flows : une attente les précède, et aucun plancher de marque ne permet de trancher',
        // 🔴 CE REMÈDE COMPOSE, IL NE RECOPIE PAS (533). Sa première version
        // récitait une cause unique — « c'est presque toujours le geste d'invite
        // système : s'il n'a rien à fermer chez toi, retire-le » — et renvoyait
        // à QAM-START-ABSORBE en écrivant « même cause, même remède ». C'était
        // vrai le jour où elle a été écrite, et faux dès le lendemain : le 524 a
        // appris à ABSORBE à DÉRIVER sa branche des permissions déclarées, et
        // son voisin immédiat ne l'a jamais reçu. Mesuré sur le run 94, dont
        // l'app déclare CAMERA, POST_NOTIFICATIONS et ACCESS_FINE_LOCATION : le
        // geste avait TOUT à fermer, et le texte prescrivait de le retirer —
        // 5 flows rouges et 159 s de device, mesuré au 525, sur une ancre
        // parfaitement correcte.
        // 📌 La partie commune vient donc de la MÊME fonction que celle
        // d'ABSORBE : deux copies d'une décision divergent à la première
        // retouche, et c'est exactement ce qui s'est produit ici. Ce qui reste
        // en propre est le plancher — la raison d'être de ce finding-ci.
        suggestedFix: 'Deux gestes, et le premier suffit souvent. (1) '
          + remedeAbsorption(invitesSystemePossibles(config), pire.flow)
          + ' (2) Si ton app impose une durée d\'affichage à son écran de marque, déclare-la dans '
          + '`thresholds.brandedSplashMs` : c\'est ce plancher qui permet de dire si une mesure '
          + 'CONTIENT le démarrage ou s\'est déroulée pendant l\'attente. Sans lui, ce relevé ne '
          + 'peut ni conclure ni se taire — il te rend les deux chiffres et te laisse trancher.',
        severity: 'info',
        dimension: 'performance',
        screen: 'démarrage',
        step: 0,
        selector: '',
        device: device.id,
        platform,
        osVersion: device.os ?? '',
        expected: `une mesure non précédée d'une attente de l'ordre du budget (${budget} ms)`,
        actual: `${pire.precedeMs} ms attendus avant la mesure sur « ${pire.flow} », pour une mesure `
          + `retenue de ${Math.round(pire.ms)} ms — `
          + nonJugeables.map((x) => `${x.flow} ${Math.round(x.ms)} ms après ${x.precedeMs}`).join(', '),
        evidence: [],
        repro: [],
        status: 'open',
      });
    }
  }
  if (over.length === 0) return findings;
  const worst = over.reduce((a, b) => (b.ms > a.ms ? b : a));
  const dont = floor > 0 ? `, dont ${floor} ms de splash assumés` : '';
  findings.push({
    id: 'QAM-START',
    title: `l'écran de départ met ${Math.round(worst.ms / 1000)} s à apparaître${dont} (seuil ${budget} ms)`
      + (variante === 'debug' ? ' (mesuré sur un debug)' : ''),
    suggestedFix: variante === 'debug' ? caveatDebug('QAM-START') : '',
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
    actual: `${over.length}/${mesures.length} flows mesurés au-dessus du seuil${variante ? ` (${variante})` : ''} : `
      + over.map((s) => (floor > 0
        ? `${s.flow} ${Math.round(s.ms)} ms (${Math.round(net(s))} hors splash)`
        : `${s.flow} ${Math.round(s.ms)} ms`)).join(', ')
      // ⚠️ Les flows morts sont NOMMÉS mais EXCLUS du calcul, et la phrase dit
      // les deux. Elle affirmait auparavant « la cause est ce temps-ci » — ce qui
      // est précisément l'erreur : un flow qui expire peut mourir sur une panne
      // d'application, et son temps n'est alors que le plafond qu'on lui a donné.
      + (timedOut > 0
        ? `. ${timedOut} flow(s) exclu(s) : ils ont épuisé leur budget d'attente, donc leur durée EST ce plafond — `
          + 'ce n\'est pas une mesure de lenteur, et leur cause se lit dans leur propre échec.'
        : ''),
    evidence: [],
    repro: [`maestro --device=${device.udid} test .maestro/${worst.flow}.yaml`],
    status: 'open',
  });
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
/**
 * Les références visuelles PIXEL-IDENTIQUES entre elles.
 *
 * ⚠️ **Deux écrans distincts peuvent produire la même image**, et rien ne le
 * disait. Mesuré sur un projet réel : la coquille de navigation EST l'écran de
 * départ, les deux recadrent sur la même racine, et leurs deux références
 * portaient la même empreinte. L'un des deux ne gardait donc **rien de plus**
 * que l'autre — au prix d'une passe device par run et d'une image commitée en
 * double.
 *
 * Ce n'est pas un défaut : c'est une information que seul le harnais peut voir,
 * puisqu'il faut comparer les fichiers deux à deux après génération. On
 * AVERTIT, on ne fait pas échouer — le doublon peut être assumé (deux écrans qui
 * doivent rester identiques), et faire rougir là-dessus apprendrait à ignorer le
 * rouge.
 *
 * @param {string} baselineDir @returns {string[][]} un groupe par empreinte partagée
 */
export function baselinesEnDoublon(baselineDir) {
  if (!existsSync(baselineDir)) return [];
  /** @type {Map<string, string[]>} */
  const parEmpreinte = new Map();
  const visiter = (/** @type {string} */ dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const chemin = join(dir, e.name);
      if (e.isDirectory()) { visiter(chemin); continue; }
      // Les diffs ne sont pas des références : les compter ferait naître des
      // doublons qui n'en sont pas.
      if (!/\.png$/i.test(e.name) || /_diff\.png$/i.test(e.name)) continue;
      const cle = createHash('sha1').update(readFileSync(chemin)).digest('hex');
      parEmpreinte.set(cle, [...(parEmpreinte.get(cle) ?? []), basename(chemin)]);
    }
  };
  visiter(baselineDir);
  return [...parEmpreinte.values()].filter((g) => g.length > 1).map((g) => g.sort());
}

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
 * @returns {{model:string, os:string, source:string, locale?:string}}
 */
export function deviceStamp(platform, udid, spec, lire = adbShell, resolu = null) {
  const declare = { model: String(spec?.model ?? ''), os: String(spec?.os ?? ''), source: 'déclaré' };
  // ⚠️ HORS ANDROID, L'IDENTITÉ EST DÉJÀ MESURÉE — et ce fichier disait le
  // contraire. Un run a relevé que `report.json` écrivait
  // `identityMeasured: true` pendant que `.argus-device` écrivait
  // `"source": "déclaré"` : les deux ne peuvent pas être vrais ensemble, et
  // c'est celui-ci qui avait tort. `xcrun simctl list -j devices booted` rend
  // le nom de l'appareil et son runtime — donc lus SUR la machine, pas
  // recopiés d'une déclaration.
  //
  // On les prend quand la résolution les a mesurés, quelle que soit la
  // plateforme. `adb` reste la voie Android : il donne le modèle RÉEL
  // (`sdk_gphone64_arm64`) là où la config porte un alias (`pixel_6`).
  if (platform !== 'android' && resolu?.measured && resolu.model) {
    return { model: String(resolu.model), os: String(resolu.os ?? ''), source: 'mesuré' };
  }
  if (platform !== 'android' || !udid) return declare;
  const model = lire(udid, ['getprop', 'ro.product.model']).stdout.trim();
  const sdk = lire(udid, ['getprop', 'ro.build.version.sdk']).stdout.trim();
  if (!model || !sdk) return declare;
  // ⚠️ LA LOCALE AUSSI, et c'est la plus mouvante des trois. Ce fichier existait
  // pour qu'une référence porte l'identité de l'appareil qui l'a produite, et il
  // gravait deux dimensions sur trois. Sur un projet réel, `deviceLocale: fr_FR`
  // était déclaré pendant que l'AVD tournait en `en-US` — `deviceLocale` ne
  // s'applique qu'avec `autoStart` — donc les références sont nées sous un
  // système ANGLAIS et rien ne l'enregistrait. Qui les régénère plus tard sur un
  // appareil français obtient des diffs (formats système, éléments natifs) sans
  // qu'aucune trace n'explique l'écart.
  // 540 — `locale || ''` prévoyait le cas illisible, et ne le voyait jamais :
  // `settings get` rend la chaîne « null », qui est vraie. Ce fichier SE COMMITE
  // et porte « source: mesuré » — y figer une valeur qu'on n'a pas lue fait
  // passer deux appareils différents pour le même.
  const locale = localeLue(lire(udid, ['settings', 'get', 'system', 'system_locales']).stdout);
  return { model, os: `android-${sdk}`, locale: locale ?? '', source: 'mesuré' };
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
 * @param {any} grave @param {any} courant
 * @returns {null|{grave:any, courant:any, localeSeule:boolean}}
 */
export function baselineDeviceDrift(grave, courant) {
  if (!grave || !grave.model || !grave.os) return null;
  const memeAppareil = grave.model === courant.model && grave.os === courant.os;
  // ⚠️ La locale ne se compare que si les DEUX marques la portent : une
  // référence gravée avant que ce champ n'existe ne doit pas se mettre à crier
  // rétroactivement — elle deviendrait le bruit qui apprend à ignorer l'alerte.
  const compareLocale = typeof grave.locale === 'string' && grave.locale !== ''
    && typeof courant?.locale === 'string' && courant.locale !== '';
  const memeLocale = !compareLocale || grave.locale === courant.locale;
  if (memeAppareil && memeLocale) return null;
  return { grave, courant, localeSeule: memeAppareil && !memeLocale };
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
 * @param {string} baselineDir @param {Record<string,string>} crops
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
 * @param {string[]} includeTags @param {string[]} excludeTags
 * @returns {{main:boolean, visual:boolean}}
 */
/**
 * Ce qu'on dit quand AUCUN flow n'a été exécuté — et pourquoi ça n'est pas un succès.
 *
 * ⚠️ **Rien ne gardait ce cas (406).** `flowsExecuted` n'existait que dans le
 * rapport, et le code de sortie ne regarde que les sévérités : un run qui ne joue
 * rien ne produit aucun finding, donc aucune sévérité, donc vert. Deux runs en
 * aveugle l'ont produit le même soir, par DEUX causes différentes — un workspace
 * refusé par Maestro au démarrage, et un `--tags=` qui ne matche aucun flow (un
 * filtre inconnu ne lève pas). **Aucun des deux n'a été alerté par le code de
 * sortie** : c'est la DURÉE qui les a sauvés, 18 s au lieu de 180, puis 9 s.
 *
 * 📌 Le garde voisin couvre « Maestro a échoué sans étape fautive » ; celui-ci
 * couvre « Maestro n'a jamais démarré », qui n'est pas le même cas.
 *
 * 📌 Extraite de `main()` exprès : un garde qui chercherait ce refus dans la
 * source resterait vert sur une valeur neutralisée. Ici il APPELLE et lit ce qui
 * revient — y compris les tags nommés, qui sont la moitié utile du message.
 * @param {string[]} includeTags @param {string[]} tagsDisponibles
 * @returns {string[]} les lignes à écrire, la première dit toujours le fait
 */
export function verdictSansFlow(includeTags, tagsDisponibles) {
  const lignes = ['aucun flow n\'a été exécuté — ce run n\'a RIEN mesuré, et un verdict ne peut pas en sortir.'];
  if (includeTags.length) {
    // Nommer les tags qui EXISTENT referme la question sur place. Le §3g du
    // SKILL donnait lui-même un tag qu'aucun flow ne porte : un message qui
    // dirait seulement « aucun flow » laisserait chercher au mauvais endroit.
    lignes.push(`  --tags=${includeTags.join(',')} ne correspond à aucun flow du workspace.`);
    lignes.push(`  Tags réellement déclarés : ${tagsDisponibles.length ? tagsDisponibles.join(', ') : '(aucun)'}`);
  } else {
    lignes.push('  Maestro n\'a produit aucun bundle : le workspace a été refusé au démarrage,');
    lignes.push('  ou aucun flow ne vit sous .maestro/. `make argus-lint` dit lequel des deux.');
  }
  return lignes;
}

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

/**
 * Les états que l'étage 1 sait monter et que `screens[]` ne déclare PAS.
 *
 * ⚠️ POURQUOI CE RELEVÉ EXISTE. Les trois comptes de `coverage` dérivent tous de
 * `config.screens` : un état monté à l'étage 1 seul leur est invisible. Le
 * rapport l'AVOUAIT déjà — « un état monté à l'étage 1 seul n'y apparaît pas » —
 * mais avouer une limite n'est pas la lever : l'information était disponible, à
 * deux fichiers de là, et personne n'allait la chercher. Mesuré sur un projet
 * réel : 15 états montables, 7 déclarés, **8 invisibles au rapport**, dont la
 * coquille et trois états du runner.
 *
 * L'écart n'est PAS un défaut — le SKILL en documente quatre formes légitimes.
 * C'est pour ça qu'il est rapporté et non transformé en finding : ce qui manque
 * n'est pas un verdict, c'est le nombre.
 *
 * ⚠️ Les commentaires sont retirés du corpus AVANT de compter. Le gabarit livré
 * porte des exemples commentés, et un compteur qui les lit rend un écart qui
 * n'existe pas — le chantier a déjà payé cette erreur deux fois.
 * @param {string} source contenu de `test/argus/harness.dart`
 * @param {string[]} declares les `id` de `screens[]`
 * @returns {string[]}
 */
export function stageOneOnly(source, declares) {
  const utile = String(source ?? '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  /** @type {string[]} */
  const ids = [];
  for (const m of utile.matchAll(/ArgusScreen\(/g)) {
    // La fenêtre couvre l'en-tête du constructeur : `id:` y est nommé en
    // premier dans le gabarit, mais un projet peut l'écrire après un builder.
    const id = utile.slice(m.index ?? 0, (m.index ?? 0) + 400).match(/\bid:\s*'([^']+)'/);
    if (id) ids.push(id[1]);
  }
  const connus = new Set(declares ?? []);
  return [...new Set(ids)].filter((id) => !connus.has(id));
}

/** Le harnais d'étage 1 du projet, ou une chaîne vide s'il n'y en a pas. */
function harnessSource() {
  const chemin = resolve(process.cwd(), 'test/argus/harness.dart');
  return existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
}

/**
 * L'objet `coverage` du rapport.
 *
 * ⚠️ EXTRAIT POUR ÊTRE EXERCÉ. Tant qu'il était construit en ligne dans
 * `main()`, seul un garde TEXTUEL pouvait le surveiller — et un garde textuel ne
 * voit pas une valeur neutralisée : la mutation `stageOneOnly: [] ?? …` laisse le
 * motif intact et vide le relevé. Le harnais de mutation l'a rendu « VACANT » le
 * jour même où le garde a été écrit.
 * @param {any} config @param {any[]} avecAncre @param {string[]} visites
 * @param {any[]} visuels @param {string} visualMode @param {string} harness
 */
export function buildCoverage(config, avecAncre, visites, visuels, visualMode, harness) {
  const declares = config.screens ?? [];
  return {
    screensDeclared: declares.length,
    screensConfigured: avecAncre.length,
    notConfigured: declares.filter((/** @type {any} */ s) => !avecAncre.includes(s))
      .map((/** @type {any} */ s) => s.id),
    // Ce que les flows ont VU, par opposition à ce que la config déclare. Les
    // trois lignes du dessus dérivent toutes de `screens[]` et répondent donc à
    // une question plus étroite que celle qu'on leur pose.
    visited: visites,
    notVisited: declares.map((/** @type {any} */ s) => s.id)
      .filter((/** @type {string} */ id) => !visites.includes(id)),
    visualScreens: visuels.map((/** @type {any} */ s) => s.id),
    visualMode,
    // Ce que les quatre comptes ci-dessus ne peuvent pas voir, et qui se lisait
    // « tout est couvert » : les états que l'étage 1 monte sans qu'aucun flow ne
    // les atteigne. Le chiffre, pas l'aveu.
    stageOneOnly: stageOneOnly(harness, declares.map((/** @type {any} */ s) => s.id)),
  };
}

/**
 * La marge qui restait entre la pire attente et le plafond.
 *
 * ⚠️ POURQUOI CE RELEVÉ EXISTE. Un flow qui passe à 39 ms de l'échec rend
 * exactement le même vert qu'un flow qui passe avec dix secondes de marge — le
 * rapport portait les deux nombres et jamais ce qui les sépare. Mesuré : 20 039 ms
 * relevés contre un plafond de 20 000, puis 29 255 ms au passage suivant, sur une
 * machine peu chargée.
 *
 * ⚠️ ET LA CAUSE N'EST PAS LA LENTEUR, C'EST LA GRANDEUR DONT LE PLAFOND SE
 * DÉRIVE. `clearState` remet l'app à l'état d'une installation fraîche (sur iOS,
 * à condition que `resetKeychain` ait vidé le trousseau — voir sa note), donc
 * CHAQUE flow paie un PREMIER lancement — 13 463 ms mesurés — tandis que le
 * plafond se dérive de `coldStartMs`, qui décrit le régime stabilisé : 1 801 ms
 * sur le même projet, soit sept fois et demie moins. `argus-perf` mesure déjà la
 * bonne grandeur (`firstLaunchMs`) et l'isole exprès ; rien ne reliait les deux.
 *
 * Le seuil de 70 % est un choix, pas une mesure : il dit « la marge n'est plus
 * confortable », assez tôt pour qu'on relève avant de flaker.
 * @param {{ms:number, status?:string}[]} samples @param {number} plafondMs
 * @returns {{pireMs:number, pct:number, serre:boolean}|null}
 */
export function startupMargin(samples, plafondMs) {
  const ms = (samples ?? []).map((s) => Number(s?.ms)).filter((n) => Number.isFinite(n));
  if (ms.length === 0 || !(plafondMs > 0)) return null;
  const pireMs = Math.round(Math.max(...ms));
  return { pireMs, pct: Math.round((pireMs / plafondMs) * 100), serre: pireMs >= plafondMs * 0.7 };
}

/**
 * Les lignes d'avertissement d'une marge trop mince — vides si elle est large.
 *
 * ⚠️ SÉPARÉE DE SON APPEL, comme [buildCoverage] et pour la même raison, apprise
 * la veille et refaite le lendemain : un garde qui vérifie le CÂBLAGE en lisant
 * la source ne voit pas `if (false && …)`. Le harnais de mutation a rendu
 * « VACANT » deux jours de suite sur ce motif. Le message se teste donc en
 * l'appelant, pas en le cherchant dans un fichier.
 *
 * ⚠️ ET LE CONSEIL DÉPEND DE LA PLATEFORME — angle mort créé par le correctif
 * qui l'a écrit. « Dérive-le de `firstLaunchMs` » est juste sur Android et
 * IMPOSSIBLE sur iOS : `perf.mjs` y rend `skipReason` et ne mesure aucun
 * démarrage (pas d'équivalent local de `am start -W`). Un run iOS a donc reçu
 * un conseil qui désigne une grandeur que sa plateforme ne produit pas, sans
 * rien qui le dise — la table du §1 l'annonce, à neuf cents lignes de là.
 *
 * La bonne grandeur existe pourtant sur iOS, et elle est ICI : `marge.pireMs`,
 * la pire attente que le runner vient de relever. C'est exactement ce que
 * `firstLaunchMs` approche sur Android — chaque flow fait `clearState`, donc
 * chacun paie un premier lancement.
 * @param {{ms:number, status?:string}[]} samples @param {number} plafondMs @param {string} platform
 * @returns {string[]}
 */
export function startupMarginWarning(samples, plafondMs, platform = '') {
  const marge = startupMargin(samples, plafondMs);
  if (!marge?.serre) return [];
  // 🚨 ET IL SE TAIT QUAND L'APP NE DÉMARRE PAS. Le runner imprime d'abord, à
  // raison, « (1) L'app ne démarre PAS : aucun plafond n'y changera rien » —
  // puis ce bloc-ci, six lignes plus bas, pressait de relever le plafond de 20 à
  // 31 s. Vécu : les 20 392 ms relevés étaient le plafond CONSOMMÉ À VIDE, pas
  // une lenteur, et suivre la fin de la sortie aurait doublé la durée de six
  // flows condamnés. *Le second bloc ne connaissait pas le diagnostic du
  // premier.*
  //
  // Le critère est net : si AUCUN échantillon n'a atteint l'écran de départ, il
  // n'y a pas de marge à mesurer — il y a une app qui ne démarre pas.
  const atteints = (samples ?? []).filter((s) => String(s?.status ?? '').toUpperCase() !== 'FAILED');
  if (atteints.length === 0) {
    return [
      `les ${samples.length} flow(s) ont ÉPUISÉ le plafond (${plafondMs} ms) sans jamais atteindre`,
      "l'écran de départ. Ce n'est pas une marge trop mince : c'est la cause (1) ci-dessus.",
      'Regarde la capture avant de toucher au moindre seuil — relever le plafond ne ferait',
      'que rallonger des flows condamnés.',
    ];
  }
  // Sur iOS on ne renvoie pas vers une mesure qui n'existe pas : on dérive du
  // relevé qu'on tient déjà, majoré de moitié pour absorber un hoquet.
  const derivation = String(platform) === 'ios'
    ? [
      'Relève `thresholds.startTimeoutMs` — sur iOS, dérive-le de la pire attente',
      `ci-dessus (${marge.pireMs} ms), pas de \`firstLaunchMs\` : \`argus-perf\` ne mesure`,
      'AUCUN démarrage sur cette plateforme (voir `skipReason` dans perf.json), il',
      `n'y a donc rien à en tirer. Un plafond de ${Math.ceil((marge.pireMs * 1.5) / 1000) * 1000} ms`,
      'laisserait la moitié de marge en plus ; chronomètre-le si tu veux mieux.',
    ]
    : [
      'Relève `thresholds.startTimeoutMs` — et dérive-le de `firstLaunchMs`, que',
      '`argus-perf` mesure : chaque flow fait clearState, donc chacun paie un PREMIER',
      'lancement, jamais le régime stabilisé dont `coldStartMs` parle.',
    ];
  return [
    `la pire attente (${marge.pireMs} ms) a consommé ${marge.pct} % du plafond `
      + `(${plafondMs} ms) : la suite flakera au prochain hoquet.`,
    ...derivation,
    'Ne touche PAS `coldStartMs` : c\'est lui qui RAPPORTE la lenteur.',
  ];
}

/**
 * Le périmètre d'un run : *complet* ou *filtré*, et par quoi.
 *
 * ⚠️ LA DISTINCTION QUI MANQUAIT. Le scaffold livre `excludeTags: [wip, manual]`
 * — des flows qui ne DOIVENT jamais tourner, pas un rétrécissement de périmètre.
 * En les comptant comme un filtre, tout run normal s'annonçait « filtré
 * (-wip -manual) » et le rapport affichait son bandeau « partiel ». Depuis que
 * la page est publiée, ce bandeau se lit par d'autres : une page qui décrit un
 * run complet s'annonçait incomplète.
 *
 * Un avertissement qui se déclenche TOUJOURS n'avertit plus. Le bandeau existe
 * pour le point 141 — qu'un run filtré à la main ne passe pas pour complet — et
 * seule la ligne de commande retranche vraiment.
 * @param {string[]} include tags demandés en ligne de commande (`--tags`)
 * @param {string[]} excludeCli tags retranchés en ligne de commande
 * @param {string[]} excludeConfig tags exclus par le workspace
 * @returns {{scope:string, baseline:string}}
 */
export function runScope(include, excludeCli, excludeConfig) {
  const retranche = [...include.map((t) => `+${t}`), ...excludeCli.map((t) => `-${t}`)];
  const base = (excludeConfig ?? []).map((t) => `-${t}`).join(' ');
  return {
    scope: retranche.length ? `filtré (${retranche.join(' ')})` : 'complet',
    // Le périmètre normal du projet reste DIT — le taire ferait croire qu'un run
    // complet exécute tout ce que le dépôt contient, ce qui est faux aussi.
    baseline: base,
  };
}

async function main() {
  /** @type {string[]} Les avertissements de locale, à faire survivre au terminal. */
  let avertissementsLocale = [];
  /** @type {{declared:string, onDevice:string, aligned:boolean, note:string}} */
  let alignementLocale = { declared: '', onDevice: '', aligned: false, note: '' };
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

  // ⚠️ APRÈS la résolution, pas avant : l'avertissement ne vaut que si la locale
  // du device diffère de celle demandée, et il faut un device pour la lire.
  {
    // ⚠️ ELLE SE LIT SUR iOS AUSSI, et l'avertissement affirmait le contraire.
    // « la locale de l'appareil n'a pas pu être lue » sortait à CHAQUE passage
    // device d'un run iOS — cinq fois — alors qu'une seule commande la rend :
    // `xcrun simctl spawn <udid> defaults read -g AppleLocale` → « fr_CI ».
    // Un avertissement qu'on ne peut pas faire taire en corrigeant finit ignoré,
    // et il emmène les autres avec lui : c'est la leçon du 291, ici appliquée à
    // un message qui accusait l'appareil d'être muet quand c'est nous qui ne
    // l'interrogions pas.
    // 540 — NORMALISÉE AU POINT DE LECTURE. `settings get` rend la chaîne
    // « null » quand le réglage n'existe pas : la laisser voyager jusqu'aux
    // consommateurs rendait leurs branches « illisible » inatteignables.
    const lue = !resolved.udid || opts.dryRun ? null : localeLue(
      platform === 'android'
        ? adbShell(resolved.udid, ['settings', 'get', 'system', 'system_locales']).stdout
        : sh('xcrun', ['simctl', 'spawn', resolved.udid, 'defaults', 'read', '-g', 'AppleLocale']).stdout,
    );
    // 540 — `lue` peut valoir la chaîne « null » : on ne la croit que si elle a
    // la forme d'une locale, sans quoi la branche « n'a pas pu être lue » reste
    // inatteignable et le rapport publie une valeur qu'il n'a pas mesurée.
    avertissementsLocale = localeWarnings(
      String(config.locale?.deviceLocale ?? ''), Boolean(spec.autoStart), lue, platform,
    );
    for (const ligne of avertissementsLocale) warn(ligne);
    // 🔴 ET L'AUTRE MOITIÉ (480) : quand il n'y a PAS d'avertissement, c'est
    // soit un projet sain, soit quelqu'un qui vient d'aligner sa déclaration
    // sur l'appareil pour faire taire la ligne. `localeWarnings` ne peut pas
    // les distinguer — elle est déjà sortie. La note, elle, atteint cet état.
    alignementLocale = localeAlignment(String(config.locale?.deviceLocale ?? ''), lue);
    if (avertissementsLocale.length === 0 && alignementLocale.note) log(alignementLocale.note);
  }

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
      const brute = projectBuildCmd(config, platform);
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
  // 507 — ce qu'on prend à l'appareil, on le lui rend : c'est un réglage SYSTÈME,
  // pas un réglage de l'app, et le laisser à zéro vide la preuve du run suivant.
  armerRestaurationAnimations(process, () => restoreAnimations(resolved.udid, /** @type {string[]} */ (animations.aRestaurer)), animations.aRestaurer ?? null);

  // 🔴 LE PENDANT iOS DE `clearState`, et il manquait. Voir `resetKeychain` : sans
  // lui, le premier flow part d'une app vierge et TOUS les suivants démarrent sur
  // l'écran d'après-connexion, parce que le trousseau a survécu. Mesuré : 78 ms
  // pour le premier, ~20 200 ms pour les cinq autres, sur la même ancre.
  const keychain = resetKeychain(platform, resolved.udid, opts.dryRun);
  if (platform === 'ios') (keychain.ok ? log : warn)(`trousseau : ${keychain.detail}`);

  // 517 — la variable qu'on vient de dériver est-elle LUE par le flow local ?
  const cheminInvite = resolve(process.cwd(), '.maestro/_subflows/dismiss-system-alerts.yaml');
  const alerteInvite = inviteSystemeInerte(
    existsSync(cheminInvite) ? readFileSync(cheminInvite, 'utf8') : null);
  if (alerteInvite) warn(alerteInvite);

  const secretsPassed = (config.auth?.secretsFromEnv ?? []).filter((/** @type {string} */ n) => process.env[n]);
  if (secretsPassed.length) {
    warn(`${secretsPassed.join(', ')} passés à Maestro via -e : visibles dans \`ps\` le temps du run.`);
  }

  const excludeTags = [...new Set([...configExcludeTags(), ...opts.excludeTags.split(',').filter(Boolean)])];
  const includeTags = opts.tags.split(',').filter(Boolean);
  const baseEnv = buildEnv(config, appId, {
    ARGUS_ANIMATIONS_DISABLED: String(animations.ok),
    ARGUS_ANIMATIONS_APPLICABLE: String(animationsApplicables(platform)),
  });

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
      warn('  Régénère : node scripts/argus/argus-mobile.mjs run --update-baselines');
    }

    const derive = baselineDeviceDrift(baselineDevice(baselineDir),
      deviceStamp(platform, resolved.udid, spec, adbShell, resolved));
    if (derive && derive.localeSeule) {
      warn(`références produites sous la locale système « ${derive.grave.locale} », `
        + `run en cours sous « ${derive.courant.locale} » — même appareil, même OS.`);
      warn('  Les formats système et les éléments natifs changent avec elle : les');
      warn('  comparaisons vont échouer sur la LANGUE, pas sur une régression de l\'app.');
      warn('  ⚠️ `locale.deviceLocale` ne pilote la locale QU\'AVEC `autoStart` : sur un');
      warn('  appareil déjà démarré, il la décrit sans l\'imposer. Règle l\'appareil, ou');
      warn('  régénère les références sous la locale que tu veux figer.');
    } else if (derive) {
      warn(`références produites sur ${derive.grave.model} / ${derive.grave.os}, `
        + `run en cours sur ${derive.courant.model} / ${derive.courant.os}.`);
      warn('  Une référence est liée au COUPLE appareil + version d\'OS : les comparaisons');
      warn('  vont échouer sur l\'APPAREIL, pas sur une régression de l\'app.');
      warn('  Régénère sur cet appareil, ou lance la suite sur celui des références.');
    }
  }
  if (dimensions.visual && visualMode === 'assert' && !existsSync(baselineDir)) {
    warn(`aucune référence visuelle dans ${baselineDir} → dimension VISUAL non exécutée.`);
    warn('  Génère-les : node scripts/argus/argus-mobile.mjs run --update-baselines');
  } else {
    // 🔴 UN JUNIT ORPHELIN GARDE SON ANCIEN VERDICT. Le chemin est fixe et
    // réécrit à chaque invocation (454) — mais SEULEMENT pour les écrans encore
    // joués. Un écran passé à `visual: false` sort de la boucle et son fichier
    // reste, avec le `failures="1"` de la fois d'avant. Vécu sur un run réel.
    // Il n'est lu par aucun script d'ici, ce qui le rend d'autant plus
    // dangereux : la CI publie `argus-mobile-report/*.xml` en bloc, donc
    // n'importe quel agrégateur de junit compte un échec sur un écran que plus
    // personne ne teste. *Ce qui produit doit nettoyer ce qu'il ne produit plus.*
    // ⚠️ Uniquement ICI, dans la branche où la boucle visuelle s'exécute : sur
    // une passe ciblée (`--tags=perf`) elle ne tourne pas, et effacer les
    // verdicts d'une passe visuelle antérieure serait le défaut inverse.
    for (const f of junitsVisuelsOrphelins(readdirSync(reportDir), visualScreens)) {
      rmSync(join(reportDir, f), { force: true });
    }
    for (const screen of visualScreens) {
      runs.push(runMaestro({
        udid: resolved.udid, target: '.maestro/visual.yaml',
        junitPath: join(reportDir, `report.visual-${screen.id}.junit.xml`), outputDir,
        env: buildEnv(config, appId, {
          ARGUS_ANIMATIONS_DISABLED: String(animations.ok),
          ARGUS_ANIMATIONS_APPLICABLE: String(animationsApplicables(platform)),
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
  const visites = visitedScreens(bundles, config.screens ?? []);
  let baselinesWritten = 0;
  if (opts.updateBaselines) {
    const written = promoteBaselines(bundles, baselineDir);
    baselinesWritten = written;
    for (const groupe of baselinesEnDoublon(baselineDir)) {
      warn(`références PIXEL-IDENTIQUES : ${groupe.join(' = ')}`);
      warn('  Ces écrans produisent la même image : l\'un ne garde rien de plus que l\'autre,');
      warn('  et chacun coûte une passe device par run. Assume-le, ou retire `visual: true`');
      warn('  à celui des deux qui est déjà couvert.');
    }
    // Graver le cadrage EFFECTIF de chaque écran, pas la valeur globale : c'est
    // ce que la comparaison relira, écran par écran.
    stampBaselineCrops(baselineDir, Object.fromEntries(
      visualScreens.map((sc) => [sc.id, cropFor(sc, config)]),
    ));
    // Et l'appareil : sans lui, des références nées ailleurs échouent en se
    // faisant passer pour une régression.
    writeFileSync(join(baselineDir, DEVICE_STAMP),
      `${JSON.stringify(deviceStamp(platform, resolved.udid, spec, adbShell, resolved), null, 2)}\n`, 'utf8');
    log(`${written} référence(s) visuelle(s) écrite(s) dans ${baselineDir}`);
  }

  const reportDevice = { ...spec, udid: resolved.udid, os: resolved.os || spec.os };
  const start = startScreen(config);
  const home = start.screen;
  const startup = startupSamples(bundles, home?.anchor ?? '',
    Math.max(0, Number(config.thresholds?.brandedSplashMs ?? 0)));
  const findings = [
    ...findingsFrom(bundles, reportDevice, platform, config, home?.anchor ?? ''),
    // Le variant est LU sur l'appareil, pas déduit de la commande de build :
    // ces flows tournent sur ce qu'`argus-build` a posé. Sur iOS la lecture
    // rend '' — le finding ne dira rien plutôt que de supposer.
    ...startupFindings(startup, reportDevice, platform, config,
      platform === 'android' ? installedVariant(resolved.udid, appId) : ''),
    // ⚠️ Un avertissement de console meurt avec le terminal. Celui-ci dit qu'une
    // dimension ne mesure pas ce qu'elle annonce : il doit atteindre la page.
    ...localeFindings(avertissementsLocale, reportDevice, platform),
  ];
  const budget = budgetVerdict(config, startedAt, bundles.length);
  for (const line of budget.warnings) warn(line);

  const report = {
    run: {
      startedAt: startedAt.toISOString(), platform, appVersion: pubspecVersion(), appName: config.app.name,
      // Le cadrage, tel qu'il est CONFIGURÉ. Le contrat de sortie promettait ces
      // deux clés depuis le début et rien ne les écrivait — neuf runs, aucun
      // rouge, parce que le garde du contrat s'arrêtait au premier niveau.
      env: config.run.env, mode: config.run.mode,
      // ⚠️ CE QUI A TOURNÉ. Un run filtré (`--tags=visual`) écrit le MÊME
      // `report.json` qu'un run complet : la contre-épreuve visuelle prescrite
      // par le skill écrasait donc le rapport avec la régression qu'on venait
      // de fabriquer, et `argus-report` la publiait comme un fait. Rien ne
      // distinguait les deux fichiers. Désormais si.
      ...(() => {
        const p = runScope(includeTags, opts.excludeTags.split(',').filter(Boolean), configExcludeTags());
        return { scope: p.scope, scopeBaseline: p.baseline };
      })(),
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
      // ⚠️ CE COMPTE N'EST PAS CELUI DU RAPPORT, et les lire côte à côte sans le
      // dire fait publier un chiffre faux. Ici on compte les findings des FLOWS,
      // parce que ce fichier est écrit à la fin d'`argus-run`, quand `perf`,
      // `a11y`, `sec` et `sca` n'ont pas encore tourné. Le total de TOUTES les
      // dimensions vit dans `summary.json`, sous `counts` — c'est lui que la
      // page publie, et c'est lui qu'il faut citer.
      // 🔴 536 — DEUX LECTEURS INDÉPENDANTS S'Y SONT TROMPÉS LE MÊME JOUR. La
      // structure est identique à celle de l'agrégé : cinq sévérités, mêmes
      // noms, valeurs plausibles. Rien ne signale qu'on en lit une moitié, et
      // les noms de fichiers sont croisés — `report.json` porte une clé
      // `summary`, `summary.json` porte une clé `counts`. Un agent a publié
      // « info: 1 » quand sa propre page affichait « info (2) ».
      // 📌 Même remède que `startup.measures`, deux clés plus bas, sur un cas
      // identique (« CE TEMPS N'EST PAS coldStartMs ») : la donnée porte son
      // périmètre, au lieu d'être renommée ou expliquée ailleurs.
      measures: 'les findings des FLOWS seuls — à ne pas confondre avec `counts` '
        + 'de summary.json, qui agrège toutes les dimensions et que le rapport publie',
      findings: Object.fromEntries(['blocker', 'critical', 'major', 'minor', 'info'].map((s) => [s, findings.filter((f) => f.severity === s).length])),
    },
    findings,
    coverage: buildCoverage(config, screens, visites, visualScreens, visualMode, harnessSource()),
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
    // ⚠️ Une note de console meurt avec la session (355). Celle-ci dit ce que
    // la dimension i18n a RÉELLEMENT sous les yeux : les deux locales et leur
    // accord. Ce n'est pas un finding — rien n'est cassé sur un projet sain —
    // mais la donnée reste lisible six mois plus tard, et depuis l'état que le
    // raccourci du 477 produit (480).
    locale: {
      declared: alignementLocale.declared,
      onDevice: alignementLocale.onDevice,
      aligned: alignementLocale.aligned,
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
    // ⚠️ ELLE SE LISAIT COMME UN DÉPASSEMENT (point 236). « 3445 ms au pire,
    // budget 2000 » sans un mot du splash assumé : le lecteur voit un verdict
    // raté là où le harnais, lui, ne produit aucun finding — parce qu'il
    // soustrait ce splash. Le finding le DIT déjà (« hors splash de marque ») ;
    // la ligne de console, elle, ne le disait pas. Deux textes du même run qui
    // ne racontent pas la même chose.
    const splash = Math.max(0, Number(report.startup.brandedSplashMs ?? 0));
    log(`écran de départ « ${home?.id} » : ${worst} ms au pire sur ${startup.length} flow(s), `
      + `budget ${report.startup.budgetMs} ms`
      + (splash > 0 ? ` + ${splash} ms de splash assumé (soit ${report.startup.budgetMs + splash} ms au total)` : ''));
    // ⚠️ DIRE LA MARGE, PAS SEULEMENT LES DEUX NOMBRES. Un flow qui passe de
    // justesse est vert, et le rapport portait déjà le pire temps et le plafond
    // sans jamais dire ce qui les sépare : personne ne voit venir le flake.
    // ⚠️ LA PLATEFORME EST L'ARGUMENT QUI COMPTE : sans elle, un run iOS reçoit
    // le conseil Android, qui désigne une mesure que sa plateforme ne produit pas.
    for (const ligne of startupMarginWarning(startup, report.startup.timeoutMs, report.run?.platform)) warn(ligne);
  }

  if (report.coverage.notConfigured.length) {
    warn(`écrans déclarés mais sans ancre, donc non testés : ${report.coverage.notConfigured.join(', ')}`);
  }
  // ⚠️ IL N'EXISTAIT QUE DANS LE HTML. `notVisited` est le seul des quatre
  // comptes qui dise ce qui a été ATTEINT plutôt que ce qui a été écrit dans
  // `screens[]` — et il ne sortait ni en finding, ni en avertissement, pendant
  // que son voisin `notConfigured`, moins grave, en avait un. Un relevé qu'on
  // ne voit qu'en ouvrant une page n'est pas lu.
  if (report.coverage.notVisited.length) {
    warn(`écrans déclarés et ancrés qu'AUCUNE étape n'a atteints : ${report.coverage.notVisited.join(', ')}`);
    warn('  Trois causes, et une seule se mesure sans device : `make argus-reach` dit');
    warn('  lesquels aucune branche de goto.yaml ne dessert. Les autres sont atteignables');
    warn('  et non testés, ou atteints par un parcours (screens[].reachedBy).');
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
  // ⚠️ ZÉRO FLOW EXÉCUTÉ N'EST PAS UN SUCCÈS (406). Rien ne gardait ce cas :
  // `flowsExecuted` n'existait que dans le rapport, et le code de sortie ne
  // regarde que les sévérités — or un run qui ne joue rien ne produit aucun
  // finding, donc aucune sévérité, donc vert. Deux runs en aveugle l'ont produit
  // le même soir, par DEUX causes différentes : un workspace refusé par Maestro
  // au démarrage, et un `--tags=` qui ne matche aucun flow (un filtre inconnu ne
  // lève pas). Aucun des deux n'a été alerté par le code de sortie — c'est la
  // DURÉE qui les a sauvés, 18 s au lieu de 180, puis 9 s.
  // Le garde voisin ci-dessous couvre « Maestro a échoué sans étape fautive » ;
  // celui-ci couvre « Maestro n'a jamais démarré », qui n'est pas le même cas.
  if (bundles.length === 0) {
    const dispo = includeTags.length
      ? tagsDeclares(lireFlows(resolve(process.cwd(), '.maestro')))
      : [];
    for (const ligne of verdictSansFlow(includeTags, dispo)) err(ligne);
    process.exit(2);
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
// ⚠️ `realpathSync` DES DEUX CÔTÉS. `resolve()` normalise sans résoudre les
// liens symboliques, or `import.meta.url` porte le chemin RÉEL : lancé par un
// chemin qui traverse un lien (sur macOS, `$TMPDIR` et `/tmp` en sont),
// le script ne se reconnaît pas, `main()` n'est jamais appelé — pas de sortie,
// pas d'erreur, exit 0. Mesuré : `node scripts/argus/perf.mjs` mesure,
// `node /var/folders/…/perf.mjs` ne fait rien et rend 0.
const invokedDirectly = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

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
  anchorAfterAuth, animationsApplicables, invitesSystemePossibles, inviteSystemeInerte,
  remedeAbsorption, resetKeychain, startScreen, startTimeoutMs, startupFindings, startupHint, startupSamples, vanishedHint,
};
