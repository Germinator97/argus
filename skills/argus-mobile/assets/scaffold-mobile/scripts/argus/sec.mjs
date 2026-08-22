#!/usr/bin/env node
// @ts-check
/**
 * Argus Mobile — MASVS statique (détection, jamais exploitation)
 * ------------------------------------------------------------------------
 * Manifeste, permissions, drapeaux de sécurité, secrets en dur, transport en
 * clair, deep links. Écrit argus-mobile-report/sec.json.
 *
 * ⚠️ FRONTIÈRE, NON NÉGOCIABLE : uniquement sur TES propres builds. Ce script
 * lit ton dépôt et ton binaire. Le pointer sur l'APK d'un tiers serait du
 * reverse-engineering, ce n'est pas ce que fait Argus.
 *
 * Deux niveaux, indépendants :
 *   A. LES SOURCES — toujours possible, aucun outil requis. Manifeste Android,
 *      Info.plist iOS, config de sécurité réseau, secrets dans le dépôt.
 *   B. LE BINAIRE — ce qui est réellement livré, souvent différent des sources
 *      (un manifeste fusionné hérite des permissions de ses dépendances).
 *      Demande `unzip` ; à défaut, le niveau B est SKIPPÉ avec mention.
 *
 * Usage :
 *   node scripts/argus/sec.mjs
 *   node scripts/argus/sec.mjs --platform=ios
 *   node scripts/argus/sec.mjs --require-tools   # en CI
 *
 * `--require-tools` fait ÉCHOUER quand le niveau B (binaire livré) n'a pas pu
 * s'exécuter : en CI, un `unzip` absent ou un APK non construit rendrait vert
 * une analyse qui n'a lu que les sources.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  artifactsDir, detectTools, err, exitCodeFor, flutterCommand, loadConfig, log, sh,
  warn, writeJson,
} from './config.mjs';

/**
 * Dossiers jamais scannés en repli : générés, volumineux, ou hors du projet.
 * ⚠️ `.fvm` contient une COPIE COMPLÈTE du SDK Flutter — avec ses fixtures de
 * test, ses fausses clés privées et ses READMEs. Sans lui, le scan remonte huit
 * « secrets » qui appartiennent à Flutter, pas au projet. Mesuré en vrai.
 */
const SKIP_DIRS = new Set([
  '.git', 'build', '.dart_tool', 'node_modules', '.idea', 'Pods', 'DerivedData',
  'argus-mobile-report', '.fvm', '.pub-cache', '.symlinks', 'ephemeral',
]);
/** Extensions binaires : un motif de secret y serait du bruit. */
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ttf', '.otf', '.woff', '.woff2', '.zip', '.jar', '.apk', '.aab', '.so', '.ipa', '.mp3', '.mp4', '.pdf', '.ico', '.svg']);
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = { platform: '', requireTools: false };
  for (const arg of argv) {
    const [key, value] = arg.split('=');
    if (key === '--platform') opts.platform = value ?? '';
    else if (key === '--require-tools') opts.requireTools = true;
    else if (key === '--help' || key === '-h') { console.log('Argus Mobile — MASVS statique\n  --platform=android|ios'); process.exit(0); }
    else { err(`option inconnue : ${arg}`); process.exit(2); }
  }
  return opts;
}

/**
 * @param {string} id @param {string} title @param {string} severity
 * @param {string} expected @param {string} actual @param {string} fix @param {string} [where]
 * @returns {any}
 */
const finding = (id, title, severity, expected, actual, fix, where = '') => ({
  id, title, dimension: 'security', severity, expected, actual,
  suggestedFix: fix, evidence: where ? [where] : [], status: 'open',
});

// ═══════════════════════════════════════════════════════════════════════════
// A. Sources — manifeste Android
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contrôle du manifeste Android du dépôt.
 * @param {string} root @param {any} config @returns {any[]}
 */
function auditAndroidManifest(root, config) {
  const path = join(root, 'android/app/src/main/AndroidManifest.xml');
  if (!existsSync(path)) return [];
  const xml = readFileSync(path, 'utf8');
  const rel = relative(root, path);
  const findings = [];
  const sec = config.security ?? {};

  if (sec.requireDebuggableOff && /android:debuggable\s*=\s*"true"/.test(xml)) {
    findings.push(finding('QAM-SEC-DEBUG', 'Application débogable', 'blocker',
      'android:debuggable absent ou false',
      'android:debuggable="true" dans le manifeste',
      'Retire l\'attribut : Gradle le pose déjà pour les builds debug. Le laisser en release ouvre le débogueur à quiconque.', rel));
  }
  if (sec.requireCleartextDisabled && /android:usesCleartextTraffic\s*=\s*"true"/.test(xml)) {
    findings.push(finding('QAM-SEC-CLEAR', 'Trafic en clair autorisé', 'critical',
      'usesCleartextTraffic false, ou absent (défaut depuis API 28)',
      'android:usesCleartextTraffic="true"',
      'Passe en HTTPS. Si un hôte de dev doit rester en clair, isole-le dans un networkSecurityConfig limité à ce domaine et au flavor de dev.', rel));
  }
  if (sec.requireAllowBackupOff && /android:allowBackup\s*=\s*"true"/.test(xml)) {
    findings.push(finding('QAM-SEC-BACKUP', 'Sauvegarde applicative autorisée', 'major',
      'android:allowBackup="false"',
      'android:allowBackup="true"',
      'adb backup extrait alors les données de l\'app, jetons de session compris, sans root.', rel));
  }
  findings.push(...auditPermissions(xml, rel, sec));
  findings.push(...auditExportedComponents(xml, rel));
  return findings;
}

/**
 * Permissions déclarées vs attendues. Une permission accordée « au cas où » est
 * une surface d'attaque et un motif de rejet sur les stores.
 * @param {string} xml @param {string} rel @param {any} sec @returns {any[]}
 */
function auditPermissions(xml, rel, sec) {
  const declared = [...xml.matchAll(/<uses-permission[^>]*android:name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const expected = new Set(sec.expectedPermissions ?? []);
  const forbidden = new Set(sec.forbiddenPermissions ?? []);
  const findings = [];
  for (const permission of forbidden) {
    if (declared.includes(permission)) {
      findings.push(finding(`QAM-SEC-PERM-F-${permission.split('.').pop()}`, `Permission interdite : ${permission}`, 'critical',
        'permission absente du manifeste', 'déclarée',
        'Elle figure dans security.forbiddenPermissions. Si elle est devenue nécessaire, retire-la de cette liste consciemment.', rel));
    }
  }
  const unexpected = declared.filter((p) => !expected.has(p) && !forbidden.has(p));
  if (expected.size > 0 && unexpected.length > 0) {
    findings.push(finding('QAM-SEC-PERM-X', 'Permissions non prévues', 'major',
      `uniquement ${[...expected].join(', ')}`, unexpected.join(', '),
      'Vérifie que chacune est réellement utilisée. Une permission héritée d\'une dépendance compte aussi : c\'est l\'utilisateur qui l\'accorde.', rel));
  }
  return findings;
}

/**
 * Composants exportés sans permission : une autre app peut les invoquer.
 * @param {string} xml @param {string} rel @returns {any[]}
 */
function auditExportedComponents(xml, rel) {
  const findings = [];
  for (const match of xml.matchAll(/<(activity|service|receiver|provider)\b([^>]*)>/g)) {
    const [, kind, attrs] = match;
    if (!/android:exported\s*=\s*"true"/.test(attrs)) continue;
    if (/android:permission\s*=/.test(attrs)) continue;
    const name = /android:name\s*=\s*"([^"]+)"/.exec(attrs)?.[1] ?? '(sans nom)';
    // L'activité principale est exportée par nature : c'est le point d'entrée.
    if (kind === 'activity' && /MainActivity/.test(name)) continue;
    findings.push(finding(`QAM-SEC-EXP-${kind}-${name.split('.').pop()}`, `${kind} exporté sans permission`, 'major',
      'android:exported="false", ou protégé par android:permission',
      `${kind} ${name} exporté et non protégé`,
      'Toute app installée peut l\'invoquer. Valide les entrées reçues ou restreins l\'export.', rel));
  }
  return findings;
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Sources — iOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contrôle de l'Info.plist iOS. Un plist binaire est converti si `plutil` est là.
 * @param {string} root @returns {any[]}
 */
function auditIosPlist(root) {
  const path = join(root, 'ios/Runner/Info.plist');
  if (!existsSync(path)) return [];
  let text = readFileSync(path, 'utf8');
  if (!text.includes('<?xml')) {
    const converted = sh('plutil', ['-convert', 'xml1', '-o', '-', path]);
    if (!converted.ok) return [];
    text = converted.stdout;
  }
  const rel = relative(root, path);
  const findings = [];
  if (/<key>NSAllowsArbitraryLoads<\/key>\s*<true\s*\/>/.test(text)) {
    findings.push(finding('QAM-SEC-ATS', 'App Transport Security désactivé', 'critical',
      'NSAllowsArbitraryLoads absent ou false',
      'NSAllowsArbitraryLoads = true',
      'ATS désactivé globalement autorise le HTTP en clair vers n\'importe quel hôte. Utilise NSExceptionDomains pour le seul domaine concerné.', rel));
  }
  const schemes = [...text.matchAll(/<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g)]
    .flatMap((m) => [...m[1].matchAll(/<string>([^<]+)<\/string>/g)].map((s) => s[1]));
  if (schemes.length > 0) {
    findings.push(finding('QAM-SEC-SCHEME', 'Schémas d\'URL personnalisés déclarés', 'info',
      'schémas validés côté app', schemes.join(', '),
      'Un schéma personnalisé est revendicable par une autre app : ne fais jamais confiance aux paramètres reçus, et ne les utilise pas pour authentifier.', rel));
  }
  return findings;
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Sources — secrets
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compile un motif de secret. Tolère le préfixe d'options PCRE `(?i)`, que
 * JavaScript ne connaît pas : sans cette traduction, un motif copié depuis un
 * outil tiers fait lever `new RegExp` et — c'est là le vrai danger — emportait
 * TOUT l'audit de sécurité. Un motif illisible est désormais signalé et ignoré,
 * les autres continuent de s'appliquer.
 * @param {string} source @returns {{regex:RegExp, source:string}|{error:string, source:string}}
 */
function compilePattern(source) {
  const inlineFlags = /^\(\?([imsux]+)\)/.exec(source);
  const body = inlineFlags ? source.slice(inlineFlags[0].length) : source;
  const flags = inlineFlags ? inlineFlags[1].replace(/[^ims]/g, '') : '';
  try {
    return { regex: new RegExp(body, flags), source };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), source };
  }
}

/**
 * Les fichiers à scanner : ceux que git SUIT quand on est dans un dépôt,
 * sinon un parcours de répertoire filtré par [SKIP_DIRS].
 * @param {string} root @returns {string[]}
 */
function scannableFiles(root) {
  const tracked = sh('git', ['-C', root, 'ls-files', '-z']);
  if (tracked.ok) {
    return tracked.stdout
      .split('\0')
      .filter(Boolean)
      .map((rel) => join(root, rel))
      .filter((f) => existsSync(f) && !SKIP_EXT.has(extname(f).toLowerCase()) && statSync(f).size <= MAX_SCAN_BYTES);
  }
  warn('hors dépôt git : le scan de secrets parcourt le disque et peut remonter des fichiers non versionnés.');
  return walkFiles(root, root);
}

/** @param {string} dir @param {string} root @returns {string[]} */
function walkFiles(dir, root) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walkFiles(full, root));
    else if (!SKIP_EXT.has(extname(entry).toLowerCase()) && stat.size <= MAX_SCAN_BYTES) out.push(full);
  }
  return out;
}

/**
 * Recherche des motifs de secrets dans les sources.
 *
 * `allowSecretsIn` est indispensable, pas une facilité : la clé `AIza` de
 * google-services.json est une clé client publique. Sans cette liste, chaque
 * run remonterait le même faux positif — et un rapport qui crie au loup à
 * chaque fois finit par ne plus être lu du tout.
 * ⚠️ ON NE SCANNE QUE CE QUE GIT SUIT. Un secret présent sur le disque mais
 * gitignoré n'est PAS une fuite — c'est même la pratique correcte
 * (`android/key.properties` en est l'exemple type). Scanner l'arborescence
 * entière remonterait ce fichier en `blocker`, plus tout le SDK vendu dans
 * `.fvm/`. Sur un projet réel, ça faisait 9 findings bloquants dont 9 faux, et
 * 6 127 fichiers parcourus là où git en suit 288.
 *
 * Hors dépôt git, on retombe sur le parcours de répertoire et [SKIP_DIRS].
 * @param {string} root @param {any} config @returns {any[]}
 */
function auditSecrets(root, config) {
  const compiled = (config.security?.secretPatterns ?? []).map((/** @type {string} */ p) => compilePattern(p));
  /** @type {any[]} */
  const findings = [];
  for (const bad of compiled.filter((/** @type {any} */ c) => 'error' in c)) {
    warn(`motif de secret ignoré — « ${bad.source} » : ${bad.error}`);
    findings.push(finding('QAM-SEC-PATTERN', 'Motif de secret invalide', 'major',
      'une expression régulière JavaScript valide', `« ${bad.source} » : ${bad.error}`,
      'Corrige security.secretPatterns dans argus.mobile.yaml. Tant qu\'il est invalide, ce motif ne cherche rien — et une recherche qui ne cherche rien ne trouve rien.',
      'argus.mobile.yaml'));
  }
  const patterns = compiled.filter((/** @type {any} */ c) => 'regex' in c);
  if (patterns.length === 0) return findings;
  const allowed = (config.security?.allowSecretsIn ?? []).map(String);
  const scannables = scannableFiles(root);
  const relatifs = scannables.map((/** @type {string} */ f) => relative(root, f));

  // ⚠️ Une entrée qui ne dispense AUCUN fichier ne fait rien — et ne le dit pas.
  // Le cas le plus fréquent est de lister un fichier gitignoré (`key.properties`,
  // `.env`) : il n'est déjà pas scanné, donc l'inscrire est redondant. Une
  // dispense inutile ressemble pourtant à une décision de sécurité, et personne
  // ne la remet en cause. Deuxième cas, plus grave : le chemin a bougé, la
  // dispense pointe dans le vide, et le fichier réel se met à remonter — ou
  // pas, si le motif a bougé aussi.
  const inertes = allowed.filter((/** @type {string} */ a) =>
    !relatifs.some((/** @type {string} */ rel) => rel === a || rel.endsWith(a)));
  if (inertes.length) {
    warn(`allowSecretsIn : ${inertes.length} entrée(s) ne dispensent aucun fichier scanné — ${inertes.join(', ')}`);
    warn('  Soit le fichier est gitignoré (donc déjà hors du scan, et la ligne est de trop),');
    warn('  soit son chemin a changé et la dispense ne protège plus rien.');
  }

  for (const file of scannables) {
    const rel = relative(root, file);
    if (allowed.some((/** @type {string} */ a) => rel === a || rel.endsWith(a))) continue;
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue; // binaire déguisé en texte : ignoré, pas fatal
    }
    for (const { source, regex } of patterns) {
      const match = regex.exec(content);
      if (!match) continue;
      const line = content.slice(0, match.index).split('\n').length;
      findings.push(finding(`QAM-SEC-SECRET-${findings.length + 1}`, 'Secret potentiel dans les sources', 'blocker',
        'aucun secret versionné', `motif « ${source} » à ${rel}:${line}`,
        'Sors la valeur du dépôt (variable d\'environnement, --dart-define, coffre CI) ET révoque-la : elle est dans l\'historique git.', `${rel}:${line}`));
      break; // un finding par fichier suffit à déclencher la revue
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════════════════════════════
// B. Binaire livré
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contrôles sur l'APK réellement produit. Le manifeste fusionné y diffère
 * souvent des sources : les dépendances y ajoutent leurs propres permissions.
 * @param {string} apk @param {any} config @returns {{findings:any[], facts:any}}
 */
export function auditApk(apk, config) {
  /** @type {any[]} */
  const findings = [];
  const listing = sh('unzip', ['-Z1', apk]);
  if (!listing.ok) return { findings, facts: { scanned: false, why: 'unzip a échoué sur l\'APK' } };
  const entries = listing.stdout.split('\n').map((l) => l.trim()).filter(Boolean);

  // Un `kernel_blob.bin` signe un build DEBUG : le Dart y est interprété et
  // lisible.
  const isDebugBuild = entries.some((e) => e.includes('flutter_assets/kernel_blob.bin'));
  const hasAot = entries.some((e) => /lib\/[^/]+\/libapp\.so$/.test(e));

  // ⚠️ SUR UN BUILD DEBUG, RIEN DE CE QUI SUIT NE CONCLUT — la dimension se
  // marque donc SAUTÉE, avec sa raison, plutôt que de rendre des findings.
  //
  // Un debug n'est ni obfusqué, ni signé comme la release, et Gradle y pose
  // lui-même `debuggable`. Les verdicts qu'on en tirerait ne disent rien de ce
  // que reçoivent les utilisateurs : les rendre en `major` et `blocker` faisait
  // échouer le gate d'emblée — sur le binaire que le scaffold prescrit par
  // défaut d'analyser. C'est le même traitement que pour un outil absent, et
  // pour la même raison : un scanner qui n'a pas pu conclure et un scanner qui
  // n'a rien trouvé produisent le même silence, il faut donc les distinguer.
  //
  // ⚠️ Ce n'est PAS un adoucissement du garde : en `--require-tools` (la CI),
  // une dimension non scannée reste un échec. Ce qui change est qu'un poste de
  // développement cesse d'être rouge pour une raison qui n'est pas un défaut.
  if (isDebugBuild) {
    return {
      findings: [],
      facts: {
        scanned: false,
        isDebugBuild: true,
        why: 'binaire debug (assets/flutter_assets/kernel_blob.bin présent) — un scan '
          + 'de sécurité n\'y dit rien de la publication. Construis la release, puis relance.',
      },
    };
  }
  if (config.security?.requireObfuscation && hasAot) {
    findings.push(...auditObfuscation(apk, entries));
  }

  // aapt2 lit le manifeste COMPILÉ, c'est-à-dire l'état réel après fusion.
  const badging = sh('aapt2', ['dump', 'badging', apk]);
  const facts = { scanned: true, entries: entries.length, isDebugBuild, hasAot, badging: badging.ok };
  if (badging.ok) findings.push(...auditBadging(badging.stdout, apk, config));
  else findings.push(finding('QAM-SEC-AAPT2', 'Manifeste compilé non lu', 'info',
    'aapt2 disponible', 'aapt2 absent du PATH',
    'Le manifeste FUSIONNÉ (permissions héritées des dépendances comprises) n\'a pas été vérifié. '
    + 'Ajoute les Build-Tools du SDK Android au PATH. ⚠️ Tant qu\'il manque, `security.expectedPermissions` '
    + 'ne peut être comparé qu\'au manifeste du dépôt, qui ne porte pas ce que les dépendances injectent : '
    + 'la liste se remplit APRÈS un `aapt2 dump permissions` sur l\'APK, pas avant.', apk));
  return { findings, facts };
}

/**
 * Obfuscation : sans `--obfuscate --split-debug-info`, les noms Dart restent
 * lisibles dans le binaire AOT.
 * @param {string} apk @param {string[]} entries @returns {any[]}
 */
function auditObfuscation(apk, entries) {
  const soEntry = entries.find((e) => /lib\/[^/]+\/libapp\.so$/.test(e));
  if (!soEntry) return [];
  const dumped = sh('unzip', ['-p', apk, soEntry], { maxBuffer: 256 * 1024 * 1024, encoding: 'latin1' });
  if (!dumped.ok) return [];
  // Repère de non-obfuscation : les noms de bibliothèques Dart du projet restent
  // en clair. On cherche un marqueur générique et stable, pas un nom de classe
  // du projet — qui varierait d'un projet à l'autre.
  const readable = /package:[a-z_][a-z0-9_]*\/[a-z0-9_/]+\.dart/.test(dumped.stdout);
  if (!readable) return [];
  return [finding('QAM-SEC-OBFUS', 'Binaire AOT non obfusqué', 'major',
    'build avec --obfuscate --split-debug-info=<dir>',
    'chemins `package:…/….dart` lisibles dans libapp.so',
    'Reconstruis avec --obfuscate --split-debug-info, et conserve la table de symboles hors du dépôt : sans elle les traces de crash deviennent illisibles.', apk)];
}

/**
 * @param {string} badging @param {string} apk @param {any} config @returns {any[]}
 */
function auditBadging(badging, apk, config) {
  const findings = [];
  const sec = config.security ?? {};
  // On n'arrive ici que sur un binaire de PUBLICATION : l'analyse s'arrête plus
  // haut, sautée, dès qu'un `kernel_blob.bin` signe un build debug. Ce drapeau
  // reste donc ce qu'il a toujours été — un blocker — sans avoir à distinguer
  // le variant une seconde fois.
  if (/application-debuggable/.test(badging)) {
    findings.push(finding('QAM-SEC-DEBUG-APK', 'Binaire livré débogable', 'blocker',
      'aucun drapeau debuggable', 'application-debuggable dans le manifeste compilé',
      'Un APK débogable laisse attacher un débogueur et lire la mémoire du processus sur n\'importe quel appareil.', apk));
  }
  const declared = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]);
  const expected = new Set(sec.expectedPermissions ?? []);
  const forbidden = new Set(sec.forbiddenPermissions ?? []);
  const merged = declared.filter((p) => !expected.has(p) && !forbidden.has(p));
  for (const permission of declared.filter((p) => forbidden.has(p))) {
    findings.push(finding(`QAM-SEC-PERM-APK-${permission.split('.').pop()}`, `Permission interdite dans le binaire : ${permission}`, 'critical',
      'absente du manifeste fusionné', 'présente après fusion',
      'Elle vient peut-être d\'une dépendance : `<uses-permission tools:node="remove">` la retire.', apk));
  }
  if (expected.size > 0 && merged.length > 0) {
    findings.push(finding('QAM-SEC-PERM-APK-X', 'Permissions ajoutées par la fusion du manifeste', 'major',
      `uniquement ${[...expected].join(', ')}`, merged.join(', '),
      'Ces permissions ne sont pas dans tes sources : elles viennent de tes dépendances. C\'est pourtant l\'utilisateur qui les accorde.', apk));
  }
  return findings;
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

  const root = process.cwd();
  const platform = opts.platform || (config.platforms ?? ['android'])[0];
  const reportPath = join(artifactsDir(config), 'sec.json');

  const sourceFindings = [
    ...auditAndroidManifest(root, config),
    ...auditIosPlist(root),
    ...auditSecrets(root, config),
  ];

  let binaryFindings = [];
  let binaryFacts = { scanned: false, why: '' };
  const binary = resolve(root, platform === 'ios' ? config.build.ios : config.build.android);
  const tools = detectTools(['unzip', 'aapt2']);
  if (platform !== 'android') {
    binaryFacts = { scanned: false, why: 'analyse binaire iOS non couverte : un .app de simulateur n\'est pas le binaire signé de l\'App Store. Utilise MobSF sur l\'IPA.' };
  } else if (!existsSync(binary)) {
    binaryFacts = { scanned: false, why: `binaire absent (${relative(root, binary)}) — construis-le : ${flutterCommand(config.build.androidBuildCmd)}` };
  } else if (!tools.unzip.present) {
    binaryFacts = { scanned: false, why: 'unzip absent du PATH : niveau B (binaire livré) non exécuté.' };
  } else {
    const result = auditApk(binary, config);
    binaryFindings = result.findings;
    binaryFacts = result.facts;
  }
  if (!binaryFacts.scanned) warn(`analyse du binaire non faite — ${binaryFacts.why}`);

  const findings = [...sourceFindings, ...binaryFindings];
  writeJson(reportPath, {
    platform, root,
    levels: {
      sources: { scanned: true, findings: sourceFindings.length },
      binary: { ...binaryFacts, findings: binaryFindings.length, path: relative(root, binary) },
    },
    boundary: 'Détection uniquement, sur tes propres builds. Le pentest mobile manuel (hooking, '
      + 'contournement de pinning, abus de logique métier) reste une intervention humaine séparée.',
    findings,
  });

  const bySeverity = ['blocker', 'critical', 'major', 'minor', 'info']
    .map((s) => `${findings.filter((f) => f.severity === s).length} ${s}`).join(' · ');
  log(`${findings.length} finding(s) — ${bySeverity}`);
  log(`rapport : ${reportPath}`);
  if (opts.requireTools && !binaryFacts.scanned) {
    err(`--require-tools : le binaire livré n'a pas été analysé (${binaryFacts.why}).`);
    process.exit(2);
  }
  process.exit(exitCodeFor(findings, config.gate));
}

// Comme pour run.mjs : ne lancer que si CE fichier est le point d'entrée. Sans
// ce garde, l'importer pour en tester une fonction déclencherait un vrai run —
// et c'est ce qui rendait ces scripts intestables, donc non testés.
const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
