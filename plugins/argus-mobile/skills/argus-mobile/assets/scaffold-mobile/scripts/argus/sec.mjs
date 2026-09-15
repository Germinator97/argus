#!/usr/bin/env node
// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
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
 *   node scripts/argus/argus-mobile.mjs sec
 *   node scripts/argus/argus-mobile.mjs sec --platform=ios
 *   node scripts/argus/argus-mobile.mjs sec --require-tools   # en CI
 *
 * `--require-tools` fait ÉCHOUER quand le niveau B (binaire livré) n'a pas pu
 * s'exécuter : en CI, un `unzip` absent ou un APK non construit rendrait vert
 * une analyse qui n'a lu que les sources.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  artifactsDir, detectTools, err, exitCodeFor, flutterCommandIn, loadConfig, log, platformFor, projectBuildCmd,
  acquitter, configNonEmbarquee, releaseBuildCmd, sh, toolPath, usesFvm, warn, writeJson,
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
  const opts = { platform: '', requireTools: false, binary: '' };
  for (const arg of argv) {
    const [key, value] = arg.split('=');
    if (key === '--platform') opts.platform = value ?? '';
    else if (key === '--binary') opts.binary = value ?? '';
    else if (key === '--require-tools') opts.requireTools = true;
    else if (key === '--help' || key === '-h') { console.log('Argus Mobile — MASVS statique\n  --platform=android|ios\n  --binary=<chemin>   le binaire à ANALYSER (défaut : build.androidScan, sinon build.android)'); process.exit(0); }
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

/**
 * Les fichiers de configuration posés dans les sources que RIEN ne câble.
 *
 * ⚠️ CE CONTRÔLE EXISTE PARCE QUE LE HARNAIS SAVAIT DÉJÀ QUE ÇA ARRIVE SANS
 * SAVOIR LE DIRE. `startupHint` orientait vers la capture — « si elle montre une
 * erreur de l'app, aucun plafond n'y changera rien » — et son commentaire citait
 * le cas exact : « Service indisponible faute d'un fichier de configuration
 * absent du bundle ». Il évitait donc la fausse piste, mais ne nommait jamais la
 * cause : c'était à l'humain de lire la capture. Un run l'a payé six flows
 * rouges et ~36 min d'appareil, pour un défaut détectable en millisecondes et
 * SANS device.
 *
 * Il vit ici, dans la dimension statique, plutôt que dans le runner : le seul
 * intérêt d'un tel contrôle est de parler AVANT qu'on paie une passe device.
 * @param {string} root @param {any} config @returns {any[]}
 */
function auditConfigFiles(root, config) {
  return configNonEmbarquee(root, config).map((o) => finding(
    `QAM-CFG-${o.id.toUpperCase()}`,
    `Configuration présente mais non embarquée : ${o.fichier}`,
    // `major` et non `blocker` : le fichier peut n'être requis que par une
    // fonctionnalité secondaire. Ce qu'on sait à coup sûr, c'est qu'il ne sera
    // pas là — pas ce que l'app en fait.
    'major',
    `${o.fichier} référencé par ${o.cable}`,
    `${o.fichier} existe dans les sources mais son nom n'apparaît pas dans ${o.cable} : `
      + 'il ne sera pas embarqué',
    `Ajoute-le à ${o.cable}. Sinon ${o.casse}.`,
    o.fichier,
  )).map((f) => ({ ...f, dimension: 'configuration' }));
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Sources — manifeste Android
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contrôle du manifeste Android du dépôt.
 * @param {string} root @param {any} config @returns {any[]}
 */
export function auditAndroidManifest(root, config) {
  // ⚠️ TOUTES LES VARIANTES, PAS SEULEMENT `main/`. Un `usesCleartextTraffic` ou
  // un `allowBackup` posé dans `src/release/` — le manifeste qui compte — n'était
  // vu NI ici (mauvais fichier) NI au niveau B : `aapt2 dump badging` ne rapporte
  // pas ces attributs, il ne rattrape que `debuggable`. La doctrine du manifeste
  // FUSIONNÉ, que ce fichier applique aux permissions et que `argus.mobile.yaml`
  // répète sur trois paragraphes, s'arrêtait aux permissions.
  //
  // Gradle fusionne `main` avec la variante construite : on lit donc l'union, et
  // chaque finding porte le fichier où l'attribut a été trouvé.
  const variantes = variantesDuManifeste(root);
  if (variantes.length === 0) return [];
  const sec = config.security ?? {};

  // Les DRAPEAUX se lisent par variante : c'est leur emplacement qui décide de
  // ce qui est publié, et le finding doit nommer le fichier fautif.
  // 🔴 ET « PAR VARIANTE » VEUT DIRE QUE CERTAINES NE SONT JAMAIS PUBLIÉES (465).
  // Confiner un `usesCleartextTraffic` au manifeste de DEBUG est la bonne
  // pratique — Gradle ne le fusionne jamais en release. Le rapporter `critical`
  // fait donc récolter un blocage à tout projet qui a bien fait, dès son premier
  // run, et l'oblige à acquitter ce qu'il a réussi. Vécu : un run a passé sa
  // passe à démonter ce finding à l'aapt2 sur l'APK publié, pour conclure qu'il
  // décrivait la bonne pratique.
  const publiees = variantes.filter(([path]) => variantePubliee(basename(dirname(path))));
  const findings = publiees.flatMap(([path, xml]) => drapeauxFindings(xml, relative(root, path), sec));

  // ⚠️ LES PERMISSIONS, ELLES, SE LISENT SUR L'UNION — une seule fois. Gradle
  // les FUSIONNE, donc les compter par variante produirait deux findings de
  // même id pour un seul défaut : le premier correctif de ce point l'a fait, et
  // aucun garde ne l'a vu parce que le cas de test ne portait pas de permission.
  const relPrincipal = relative(root, variantes[0][0]);
  const union = variantes.map(([, xml]) => xml).join('\n');
  findings.push(...auditPermissions(union, relPrincipal, sec));
  findings.push(...auditExportedComponents(union, relPrincipal));

  // Un composant déclaré dans deux manifestes ne vaut qu'un finding.
  const vus = new Set();
  return findings.filter((f) => !vus.has(f.id) && vus.add(f.id));
}

/**
 * Un source set dont le manifeste peut atteindre un binaire PUBLIÉ.
 *
 * Gradle fusionne `main` avec la variante construite. `debug` ne l'est jamais en
 * release, et `test`/`androidTest` ne le sont dans aucun binaire — un drapeau
 * qu'on y confine est donc la BONNE pratique, pas un défaut. Un flavor (`dev`,
 * `prod`…), lui, se publie : `devRelease` est un build légitime, donc on juge.
 *
 * ⚠️ La liste est celle des noms RÉSERVÉS d'Android, pas une devinette sur les
 * noms que le projet emploie : tout ce qu'on ne connaît pas est jugé. Se tromper
 * dans ce sens-là fait un faux positif qu'on peut acquitter ; dans l'autre, un
 * trafic en clair publié que personne ne voit.
 * @param {string} sourceSet @returns {boolean}
 */
export function variantePubliee(sourceSet) {
  return !['debug', 'test', 'androidTest', 'testDebug', 'androidTestDebug'].includes(String(sourceSet));
}

/**
 * Les manifestes Android du dépôt : `main` et chaque variante (`release`,
 * `debug`, les flavors). Rend des couples `[chemin, contenu]`.
 * @param {string} root @returns {Array<[string,string]>}
 */
function variantesDuManifeste(root) {
  const base = join(root, 'android/app/src');
  /** @type {Array<[string,string]>} */
  const out = [];
  let dossiers = [];
  try { dossiers = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); }
  catch { return out; }
  // `main` d'abord : c'est celui que le lecteur ouvrira en premier.
  for (const nom of ['main', ...dossiers.filter((d) => d !== 'main').sort()]) {
    const p = join(base, nom, 'AndroidManifest.xml');
    if (existsSync(p)) out.push([p, readFileSync(p, 'utf8')]);
  }
  return out;
}

/**
 * Les trois DRAPEAUX d'un manifeste donné. Séparé pour que le balayage des
 * variantes ne duplique pas la règle — et parce que les permissions, elles, se
 * lisent sur l'union et non par fichier.
 * @param {string} xml @param {string} rel @param {any} sec @returns {any[]}
 */
function drapeauxFindings(xml, rel, sec) {
  const findings = [];

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
/**
 * Le binaire scanné est-il PLUS VIEUX que le code qu'il est censé porter ?
 *
 * ⚠️ Un relevé peut être frais et son SUJET périmé, et c'est indiscernable dans
 * le rapport. Vécu au dix-neuvième run : `sec.json` venait d'être écrit, il
 * concluait « obfusqué, pas un debug, 0 secret » — sur un APK release construit
 * **cinquante minutes avant l'instrumentation**, donc sans une seule des ancres
 * qu'on venait de poser. Le mécanisme de péremption du rapport n'y voyait rien :
 * il compare les dates des relevés ENTRE EUX, jamais un relevé à son objet, et
 * il affirmait `staleParts: []`.
 *
 * Le critère est la date du fichier le plus récent sous `lib/` : si le binaire
 * lui est antérieur, il ne peut pas le contenir.
 * @param {string} binary @param {string} root @param {(p:string)=>number} mtime
 * @returns {{builtAt:number, newestSource:number, stale:boolean}|null}
 */
export function binaryFreshness(binary, root, mtime = (f) => statSync(f).mtimeMs) {
  let builtAt = 0;
  try { builtAt = mtime(binary); } catch { return null; }

  let newest = 0;
  /** @param {string} dir */
  const walk = (dir) => {
    /** @type {any[]} */
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.dart')) {
        try { newest = Math.max(newest, mtime(full)); } catch { /* fichier disparu */ }
      }
    }
  };
  walk(join(root, 'lib'));
  if (!newest) return null;
  return { builtAt, newestSource: newest, stale: builtAt < newest };
}

/**
 * Le binaire à ANALYSER — qui n'est pas celui qu'on installe, et ne peut pas l'être.
 *
 * `build.android` décide de ce que le runner POSE sur l'appareil : un debug,
 * presque toujours. Le scan, lui, ne conclut que sur la publication — depuis
 * qu'un binaire debug fait sauter la dimension, lire la même clé obligeait à
 * éditer la config entre deux runs.
 *
 * Ordre : l'option ponctuelle, puis la clé durable, puis le comportement d'avant.
 * @param {string} platform @param {any} config @param {string} override
 * @returns {string}
 */
/**
 * La commande qui produit LE binaire qu'on vient de chercher en vain.
 *
 * ⚠️ Tant qu'elle était toujours `androidBuildCmd` — le DEBUG —, un scan de
 * release absent envoyait relancer une commande qui ne créerait jamais le
 * fichier attendu. Une consigne fausse, avec toutes les apparences d'une
 * consigne juste : elle s'exécute sans erreur, elle reconstruit bien *un*
 * binaire, et le scan suivant échoue exactement pareil.
 *
 * ⚠️ `pinned` est un paramètre pour la même raison qu'ailleurs ici : lu à
 * l'intérieur, un garde écrit dans un dépôt sans `.fvmrc` n'exercerait jamais
 * la branche qui préfixe.
 * @param {string} binary chemin ABSOLU du binaire cherché
 * @param {string} root @param {any} config @param {boolean} [pinned]
 * @returns {string}
 */
export function buildHintFor(binary, root, config, pinned = usesFvm(), platform = '') {
  // ⚠️ NE LISAIT QUE LES CLÉS ANDROID (point 215). Sur un projet iOS elle
  // conseillait de construire un APK pour obtenir un `.app` — la consigne
  // s'exécute sans erreur et ne produit jamais le fichier attendu.
  const cible = platform || platformFor(config);
  const cle = cible === 'ios' ? 'iosScan' : 'androidScan';
  // ⚠️ La clé de SCAN, pas `binaryToScan` : celle-ci retombe sur le binaire de
  // TEST quand la clé manque, ce qui ferait prescrire une release pour le
  // debug qu'on pilote.
  const publie = String(config?.build?.[cle] ?? '');
  const vise = publie !== '' && resolve(root, publie) === binary;
  return vise
    ? releaseBuildCmd(config, pinned, cible)
    : flutterCommandIn(projectBuildCmd(config, cible), pinned);
}

/**
 * Faut-il analyser ce binaire, et sinon pourquoi — la décision, pas son effet.
 *
 * ⚠️ EXTRAITE PARCE QU'UN GARDE NE POUVAIT PAS L'ATTEINDRE. La raison iOS était
 * juste et calculée par une fonction éprouvée, mais le site qui l'appelle
 * pouvait la débrancher sans qu'un seul garde ne bouge — mesuré par mutation :
 * remettre le message figé laissait la suite verte. C'est la forme exacte du
 * point 213, une décision correcte que personne n'appelle, et le seul remède
 * est de rendre le CÂBLAGE lisible en valeur plutôt qu'en texte.
 * @param {string} platform @param {string} binary @param {string} root
 * @param {any} config @param {boolean} unzipPresent
 * @returns {{scan:boolean, nature:'ok'|'environnement'|'sans-objet', why:string}}
 */
export function binaryScanPlan(platform, binary, root, config, unzipPresent) {
  if (platform !== 'android') {
    return { scan: false, nature: 'sans-objet', why: iosBinarySkipReason(binary, root) };
  }
  if (!existsSync(binary)) {
    return { scan: false, nature: 'environnement', why: `binaire absent (${relative(root, binary)}) — construis-le : ${buildHintFor(binary, root, config, undefined, platform)}` };
  }
  if (!unzipPresent) {
    return { scan: false, nature: 'environnement', why: 'unzip absent du PATH : niveau B (binaire livré) non exécuté.' };
  }
  return { scan: true, nature: 'ok', why: '' };
}

/**
 * Pourquoi l'analyse binaire ne conclut pas sur iOS — sans rien affirmer de faux.
/**
 * Pourquoi l'analyse binaire ne conclut pas sur iOS — sans rien affirmer de faux.
 *
 * ⚠️ LE MESSAGE AFFIRMAIT « un .app de SIMULATEUR » (point 217). Le saut est
 * bon — le scan lit un APK, il n'a pas d'équivalent iOS — mais sa raison
 * décrivait un cas qui n'est pas forcément celui du lecteur : `iosScan` peut
 * pointer un build device release, et c'est ce que le premier run iOS avait
 * fait. Celui qui a pris la peine de construire une release s'entendait donc
 * expliquer qu'il avait un build de simulateur.
 *
 * Une raison FAUSSE dans un message honnête coûte plus qu'une raison absente :
 * elle fait chercher au mauvais endroit. D'où trois formulations, et aucune qui
 * décide à la place de ce que le chemin montre.
 * @param {string} binary @param {string} root @returns {string}
 */
export function iosBinarySkipReason(binary, root) {
  const rel = binary ? relative(root, binary) : '';
  const socle = 'analyse binaire iOS non couverte : le scan lit un APK (unzip + aapt2), '
    + 'il n\'a pas d\'équivalent pour un bundle iOS.';
  if (/iphonesimulator/.test(rel)) {
    return `${socle} Et ${rel} est un .app de SIMULATEUR : il ne porte ni l'architecture `
      + 'ni la signature de ce que reçoivent les utilisateurs. Utilise MobSF sur l\'IPA.';
  }
  if (/iphoneos/.test(rel)) {
    return `${socle} ${rel} est bien un build device — passe-le à MobSF, ou exporte l'IPA.`;
  }
  return `${socle} Utilise MobSF sur l'IPA${rel ? ` (déclaré : ${rel})` : ''}.`;
}

export function binaryToScan(platform, config, override = '') {
  const b = config?.build ?? {};
  return platform === 'ios'
    ? (override || b.iosScan || b.ios || '')
    : (override || b.androidScan || b.android || '');
}

export function auditApk(apk, config, dartPackage = dartPackageName(process.cwd())) {
  /** @type {any[]} */
  const findings = [];
  const listing = sh('unzip', ['-Z1', apk]);
  if (!listing.ok) {
    return { findings, facts: { scanned: false, nature: 'environnement', why: 'unzip a échoué sur l\'APK' } };
  }
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
        // ⚠️ UNE DÉCISION, PAS UNE PANNE — et c'est toute la différence pour
        // `--require-tools`. Voir [exigenceNonTenue].
        nature: 'sans-objet',
        isDebugBuild: true,
        why: 'binaire debug (assets/flutter_assets/kernel_blob.bin présent) — un scan '
          + 'de sécurité n\'y dit rien de la publication. Construis la release, puis relance.',
      },
    };
  }
  /** @type {any} */
  let obfuscation = null;
  if (config.security?.requireObfuscation && hasAot) {
    obfuscation = auditObfuscation(apk, entries, dartPackage);
    findings.push(...obfuscation.findings);
  }

  // aapt2 lit le manifeste COMPILÉ, c'est-à-dire l'état réel après fusion.
  const badging = sh(toolPath('aapt2'), ['dump', 'badging', apk]);
  const facts = { scanned: true, nature: 'ok', entries: entries.length, isDebugBuild, hasAot, badging: badging.ok, obfuscation };
  if (badging.ok) findings.push(...auditBadging(badging.stdout, apk, config));
  else findings.push(finding('QAM-SEC-AAPT2', 'Manifeste compilé non lu', 'info',
    'aapt2 disponible', 'aapt2 absent du PATH (il n\'y est pas par défaut : $ANDROID_HOME/build-tools/<version>/aapt2)',
    'Le manifeste FUSIONNÉ (permissions héritées des dépendances comprises) n\'a pas été vérifié. '
    + 'Ajoute les Build-Tools du SDK Android au PATH. ⚠️ Tant qu\'il manque, `security.expectedPermissions` '
    + 'ne peut être comparé qu\'au manifeste du dépôt, qui ne porte pas ce que les dépendances injectent : '
    + 'la liste se remplit APRÈS un `aapt2 dump permissions` sur l\'APK, pas avant.', apk));
  return { findings, facts };
}

/**
 * Le nom du paquet Dart, lu dans le `pubspec.yaml` du projet — la seule source
 * de vérité. `app.name` d'argus.mobile.yaml porte la même chose, mais c'est une
 * valeur RECOPIÉE à la main : elle vaut encore `mon_app` sur un projet dont
 * personne n'a édité cette ligne, et un contrôle de sécurité ancré dessus se
 * tairait pour de bon.
 *
 * Rien de lisible → chaîne vide, et l'appelant NE CONCLUT PAS. Un nom deviné
 * produirait ici un vert silencieux, ce qui est le seul verdict qu'un scan de
 * sécurité n'a pas le droit de rendre.
 *
 * La capture est bornée à `[A-Za-z0-9_]` : le nom ainsi extrait ne porte aucun
 * métacaractère, et l'interpoler dans une expression régulière est sûr sans
 * échappement.
 * @param {string} root @returns {string}
 */
export function dartPackageName(root) {
  try {
    const texte = readFileSync(resolve(root, 'pubspec.yaml'), 'utf8');
    const m = /^name:\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*$/m.exec(texte);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/**
 * Obfuscation : sans `--obfuscate --split-debug-info`, les noms des
 * bibliothèques Dart DU PROJET restent lisibles dans le binaire AOT.
 *
 * ⚠️ CE CONTRÔLE A LONGTEMPS RENDU LE MÊME VERDICT DANS LES DEUX SENS. Il
 * cherchait `package:<n'importe quoi>/….dart`, or `--obfuscate` n'efface JAMAIS
 * les chemins du framework : `package:flutter/src/services/platform_channel.dart`
 * survit à tout. Mesuré sur un même projet, deux builds release — 42 chemins du
 * projet sans l'option, 0 avec, `QAM-SEC-OBFUS` major dans les deux cas. Un
 * contrôle qui ne discrimine rien ne mesure rien, et celui-ci vit dans la
 * dimension dont c'est précisément le métier de ne pas rassurer à tort.
 *
 * D'où les deux gestes : le motif est ANCRÉ sur le paquet du projet, et la
 * survivance des chemins du framework sert de CONTRE-ÉPREUVE d'instrument —
 * leur absence ne signe pas une obfuscation réussie, elle signe une mesure qui
 * n'a pas eu lieu (mauvaise extraction, binaire non-Flutter, encodage). On rend
 * alors « non conclu », jamais « rien trouvé ».
 * @param {string} apk @param {string[]} entries @param {string} dartPackage
 * @returns {{findings:any[], scanned:boolean, why:string, projectPaths:number}}
 */
export function auditObfuscation(apk, entries, dartPackage) {
  const nope = (/** @type {string} */ why) => ({ findings: [], scanned: false, why, projectPaths: 0 });
  const soEntry = entries.find((e) => /lib\/[^/]+\/libapp\.so$/.test(e));
  if (!soEntry) return nope('aucun lib/<abi>/libapp.so dans l\'APK : rien à lire pour juger l\'obfuscation.');
  const dumped = sh('unzip', ['-p', apk, soEntry], { maxBuffer: 256 * 1024 * 1024, encoding: 'latin1' });
  if (!dumped.ok) return nope(`unzip n'a pas rendu ${soEntry} — obfuscation non jugée.`);

  // La sonde de présence certaine. Elle partage la nature de ce qu'elle
  // contrôle : même forme de chemin, même encodage, même extraction.
  if (!/package:flutter\/[a-z0-9_/]+\.dart/.test(dumped.stdout)) {
    return nope('aucun chemin `package:flutter/…` dans libapp.so — or ceux-là survivent à '
      + '`--obfuscate`. Leur absence dit que la LECTURE a échoué, pas que le binaire est obfusqué.');
  }
  if (!dartPackage) {
    return nope('nom du paquet Dart introuvable (pubspec.yaml → name:) — sans lui, le motif '
      + 'attraperait les chemins du framework, qui sont là dans les deux cas.');
  }

  const trouves = new Set(
    [...dumped.stdout.matchAll(new RegExp(`package:${dartPackage}/[a-z0-9_/]+\\.dart`, 'g'))].map((m) => m[0]),
  );
  if (trouves.size === 0) return { findings: [], scanned: true, why: '', projectPaths: 0 };
  return {
    scanned: true, why: '', projectPaths: trouves.size,
    findings: [finding('QAM-SEC-OBFUS', 'Binaire AOT non obfusqué', 'major',
      'build avec --obfuscate --split-debug-info=<dir>',
      `${trouves.size} chemin(s) \`package:${dartPackage}/….dart\` lisibles dans libapp.so `
        + `(p. ex. ${[...trouves][0]})`,
      'Reconstruis avec --obfuscate --split-debug-info, et conserve la table de symboles hors du dépôt : sans elle les traces de crash deviennent illisibles.', apk)],
  };
}

/**
 * Ce que `--require-tools` doit refuser — et ce qu'il doit laisser passer.
 *
 * ⚠️ IL CONFONDAIT DEUX CAUSES DE NON-SCAN, et la CI livrée en mourait. Un
 * défaut d'ENVIRONNEMENT (unzip absent, binaire jamais construit) est réparable
 * et doit faire échouer : c'est exactement le faux vert que ce drapeau existe
 * pour empêcher. Une DÉCISION du code — « ce binaire est un debug, un scan de
 * sécurité n'y dit rien de la publication » — n'est pas réparable en posant un
 * outil, et la traiter comme une panne fait rougir un projet sain.
 *
 * Mesuré sur le workflow livré : il construisait `flutter build apk --debug`
 * puis lançait `sec.mjs --require-tools`. Les deux moitiés étaient justes
 * séparément ; leur assemblage rendait `exit 2` au premier run, sur un dépôt
 * neuf, pour un défaut qui n'existait pas.
 *
 * ⚠️ Une forme SANS `nature` échoue, délibérément : un relevé d'une version
 * antérieure ne doit pas devenir vert en traversant cette fonction.
 * @param {any} facts le bloc `facts` rendu par [binaryScanPlan] ou [auditApk]
 * @returns {string|null} le message d'échec, ou `null` s'il n'y a rien à exiger
 */
export function exigenceNonTenue(facts) {
  if (facts?.scanned) return null;
  if (facts?.nature === 'sans-objet') return null;
  return `--require-tools : le binaire livré n'a pas été analysé (${facts?.why || 'raison non rapportée'}).`;
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
  // ⚠️ AVANT `parseArgs`, qui refuse toute option inconnue — un drapeau posé
  // après lui ne s'exécute jamais. (Écrit une première fois APRÈS, et le test
  // l'a dit : « ✖ option inconnue ». C'est le même défaut que le rappel des
  // TODO posé trois lignes avant la fonction qui l'arme : un correctif placé
  // derrière ce qui l'empêche ne corrige rien.)
  //
  // Le paquet est-il plus VIEUX que les sources ? Un run a perdu ~35 minutes
  // d'appareil sur un binaire qui n'était pas le sien : `argus-build` disait
  // « PAQUET INTACT — même empreinte » et ne proposait `flutter clean` QUE si
  // la commande avait changé (ABI, flavor, flags). Ici la commande n'avait pas
  // bougé, c'est `lib/` qui avait changé — la condition énumérait trois causes
  // et manquait la plus fréquente. La mesure qui tranche existait déjà, elle ne
  // servait qu'à l'audit de sécurité.
  if (process.argv.slice(2).includes('--print-freshness')) {
    let cfg;
    try { cfg = loadConfig(); } catch { process.stdout.write('inconnu\n'); process.exit(0); }
    // ⚠️ `--platform=<x>`, comme PARTOUT ailleurs dans ce fichier. Cette branche
    // lisait la forme séparée (`--platform ios`), que `parseArgs` refuse : un
    // `--print-freshness --platform=ios` retombait donc en silence sur la
    // première plateforme déclarée et jugeait la fraîcheur du binaire Android.
    const drapeau = process.argv.slice(2).find((x) => x.startsWith('--platform='));
    const plateforme = (drapeau ? drapeau.split('=')[1] : '') || (cfg.platforms ?? ['android'])[0];
    // Le paquet que `argus-build` PRODUIT (`build.android`/`build.ios`), jamais
    // celui que l'audit SCANNE (`androidScan`, souvent la release) : les
    // confondre rendrait « frais » sur un paquet que la commande ne touche pas.
    const b = cfg?.build ?? {};
    const binaire = plateforme === 'ios' ? (b.ios || '') : (b.android || '');
    const f = binaire ? binaryFreshness(binaire, process.cwd()) : null;
    process.stdout.write(`${f ? (f.stale ? 'perime' : 'frais') : 'inconnu'}\n`);
    process.exit(0);
  }

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

  // ⚠️ LES DEUX AUDITS DE SOURCES TOURNAIENT QUELLE QUE SOIT LA PLATEFORME, et
  // c'est le gate qui payait (point 242). Sur un projet `platforms: [ios]`, le
  // manifeste Android était jugé et rendait un `major` « Permissions non
  // prévues » — or `major` est dans `gate.failOn` par défaut : **une plateforme
  // explicitement hors périmètre faisait échouer le run**. Mesuré sur un
  // scaffold neuf : 1 finding, major, sur une plateforme qu'on avait dit
  // d'ignorer.
  //
  // C'est l'image inversée des points 213-217 : là, tout supposait Android ;
  // ici, Android s'invite là où on ne l'a pas demandé.
  //
  // ⚠️ On ne se contente PAS de retirer l'audit : ce qui n'est pas jugé se DIT.
  // Un audit silencieusement absent ressemble trait pour trait à un audit qui
  // n'a rien trouvé — c'est le mode de panne que ce script traque ailleurs.
  const plateformes = (config.platforms ?? ['android']).map(String);
  /** @type {string[]} */
  const nonJuges = [];
  const sourceFindings = [...auditSecrets(root, config), ...auditConfigFiles(root, config)];
  if (plateformes.includes('android')) sourceFindings.push(...auditAndroidManifest(root, config));
  else nonJuges.push('le manifeste Android (android n\'est pas dans platforms)');
  if (plateformes.includes('ios')) sourceFindings.push(...auditIosPlist(root));
  else nonJuges.push('l\'Info.plist iOS (ios n\'est pas dans platforms)');
  // ⚠️ Les fichiers de config suivent la même règle depuis le 372 : ce qui n'est
  // pas jugé se DIT, sinon un audit absent ressemble à un audit qui n'a rien
  // trouvé. `configNonEmbarquee` filtre déjà ; ici on le rend visible.
  for (const p of ['android', 'ios']) {
    if (!plateformes.includes(p)) nonJuges.push(`les fichiers de configuration ${p} (${p} n'est pas dans platforms)`);
  }
  for (const quoi of nonJuges) warn(`non jugé — ${quoi}`);

  let binaryFindings = [];
  /** @type {any} */
  let binaryFacts = { scanned: false, why: '' };
  // ⚠️ LE BINAIRE QU'ON ANALYSE N'EST PAS CELUI QU'ON INSTALLE, et il ne peut pas
  // l'être. `build.android` décide de ce que le runner POSE sur l'appareil — un
  // debug, presque toujours. Le scan, lui, ne conclut que sur la publication :
  // depuis qu'un binaire debug fait sauter la dimension, lire la même clé
  // obligeait à éditer la config entre deux runs, c'est-à-dire à faire à la main
  // ce que deux clés séparées font sans y penser.
  //
  // Ordre : `--binary=` (ponctuel) › `build.androidScan` (durable) ›
  // `build.android` (le comportement d'avant, pour ne rien casser).
  const binary = resolve(root, binaryToScan(platform, config, opts.binary));
  const tools = detectTools(['unzip', 'aapt2']);
  const plan = binaryScanPlan(platform, binary, root, config, tools.unzip.present);
  if (!plan.scan) {
    binaryFacts = { scanned: false, why: plan.why };
  } else {
    const result = auditApk(binary, config);
    binaryFindings = result.findings;
    binaryFacts = result.facts;
  }
  if (!binaryFacts.scanned) warn(`analyse du binaire non faite — ${binaryFacts.why}`);

  // ⚠️ LE BINAIRE PEUT AVOIR ÉTÉ SCANNÉ SANS QUE L'OBFUSCATION SOIT JUGÉE, et
  // ce silence-là ressemble trait pour trait à « rien à signaler ». Il se dit,
  // comme se dit toute dimension qui n'a pas conclu.
  const obfuscation = binaryFacts.obfuscation;
  if (obfuscation && !obfuscation.scanned) warn(`obfuscation non jugée — ${obfuscation.why}`);

  // ⚠️ Dit AVANT d'écrire : un verdict de sécurité sur un binaire plus vieux que
  // le code ne décrit pas l'application qu'on vient d'instrumenter.
  const fraicheur = binaryFreshness(binary, root);
  if (fraicheur?.stale) {
    warn(`le binaire scanné est ANTÉRIEUR au code : construit le `
      + `${new Date(fraicheur.builtAt).toISOString()}, dernière source modifiée le `
      + `${new Date(fraicheur.newestSource).toISOString()}.`);
    warn('  Ses verdicts (obfuscation, debug, secrets) décrivent un binaire qui ne porte pas');
    warn('  tes changements. Reconstruis-le avec la commande de release DE TON PROJET,');
    warn('  puis relance ce scan — sinon la dimension est verte pour la mauvaise raison.');
  }

  // ⚠️ L'ACQUITTEMENT, ET SON EXPIRATION. Un finding jugé inerte pour CE binaire
  // doit pouvoir être acté, sinon il réapparaît indéfiniment et on cesse de lire
  // la dimension entière. Mais un acquittement qui survit à ce qu'il décrit est
  // une permission permanente : on dit donc aussi ceux qui ne correspondent plus
  // à rien.
  // ⚠️ ON IGNORE `perimes` ICI, ET C'EST LE CORRECTIF. Ce script ne voit QUE ses
  // propres findings : tout acquittement appartenant à `sca.mjs` lui paraîtrait
  // périmé, et réciproquement. Les deux partagent `security.acknowledged` sans
  // partager leurs findings, si bien que chacun dénonçait les acquittements de
  // l'autre. Mesuré : `sca.mjs` annonçait « PÉRIMÉ : QAM-SEC-CLEAR » pendant que
  // `sec.mjs` l'honorait, sur le même run. Le verdict appartient à `report.mjs`,
  // seul à voir l'UNION — un relevé ne peut pas juger ce qu'il ne mesure pas.
  const { findings } = acquitter([...sourceFindings, ...binaryFindings], config);
  {
  }
  writeJson(reportPath, {
    platform, root,
    levels: {
      sources: { scanned: true, findings: sourceFindings.length },
      binary: {
        ...binaryFacts, findings: binaryFindings.length, path: relative(root, binary),
        // Quand le binaire a été construit, et s'il précède le code : sans ces
        // deux-là, rien ne distingue un verdict sur le binaire du jour d'un
        // verdict sur celui d'avant-hier.
        ...(fraicheur ? {
          builtAt: new Date(fraicheur.builtAt).toISOString(),
          stale: fraicheur.stale,
        } : {}),
      },
    },
    boundary: 'Détection uniquement, sur tes propres builds. Le pentest mobile manuel (hooking, '
      + 'contournement de pinning, abus de logique métier) reste une intervention humaine séparée.',
    findings,
  });

  const bySeverity = ['blocker', 'critical', 'major', 'minor', 'info']
    .map((s) => `${findings.filter((f) => f.severity === s).length} ${s}`).join(' · ');
  log(`${findings.length} finding(s) — ${bySeverity}`);
  log(`rapport : ${reportPath}`);
  const manque = opts.requireTools ? exigenceNonTenue(binaryFacts) : null;
  if (manque) {
    err(manque);
    process.exit(2);
  }
  // Un scan SAUTÉ pour une raison légitime reste dit, sans faire échouer : la
  // dimension apparaît « sautée » dans le rapport, jamais verte.
  if (opts.requireTools && !binaryFacts.scanned) {
    warn(`--require-tools : rien à exiger ici — ${binaryFacts.why}`);
  }
  if (opts.requireTools && obfuscation && !obfuscation.scanned) {
    err(`--require-tools : l'obfuscation n'a pas pu être jugée (${obfuscation.why}).`);
    process.exit(2);
  }
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
