#!/usr/bin/env node
// @ts-check
/**
 * Argus Mobile — socle partagé (lecture de config, outillage, utilitaires)
 * ------------------------------------------------------------------------
 * Tous les autres scripts `argus-mobile-*.mjs` importent depuis ici.
 *
 * Pourquoi un parseur YAML maison plutôt que `js-yaml` : un projet Flutter n'a
 * ni `package.json` ni `node_modules`. Exiger `npm install` pour lire un fichier
 * de config serait une dépendance de plus à installer avant de pouvoir lancer
 * le moindre test. Le parseur ci-dessous couvre un SOUS-ENSEMBLE strict de YAML
 * et ÉCHOUE BRUYAMMENT sur tout ce qu'il ne sait pas lire, plutôt que de deviner.
 * Un parseur permissif qui se trompe en silence serait pire que pas de parseur.
 *
 * Lancé directement, ce fichier imprime la config résolue et l'outillage détecté :
 *   node scripts/argus-mobile-config.mjs
 *
 * Node >= 18, ESM, zéro dépendance.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Parseur YAML (sous-ensemble strict)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ligne significative du document, une fois commentaires et blancs retirés.
 * @typedef {{ indent: number, text: string, line: number, raw: string }} YamlLine
 */
/**
 * Contexte d'erreur porté par chaque scalaire.
 * @typedef {{ file: string, line: number, raw: string }} YamlCtx
 */

/** Scalaires que YAML 1.1 lit comme des booléens et YAML 1.2 comme du texte. */
const AMBIGUOUS_BOOLEANS = new Set(['yes', 'no', 'on', 'off', 'y', 'n']);

/** Erreur de parsing portant le fichier, la ligne et son texte brut. */
class YamlSubsetError extends Error {
  /** @param {string} file @param {number} line @param {string} raw @param {string} why */
  constructor(file, line, raw, why) {
    super(`${file}:${line} — ${why}\n  │ ${raw}`);
    this.name = 'YamlSubsetError';
    this.file = file;
    this.line = line;
  }
}

/**
 * Retire le commentaire d'une ligne sans casser un `#` situé dans une chaîne.
 * @param {string} text
 * @returns {string}
 */
function stripComment(text) {
  /** @type {string|null} */
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i);
    }
  }
  return text;
}

/**
 * Normalise le document en lignes significatives.
 * @param {string} source @param {string} file
 * @returns {YamlLine[]}
 */
function tokenize(source, file) {
  /** @type {YamlLine[]} */
  const out = [];
  const raws = String(source).split(/\r?\n/);
  for (let i = 0; i < raws.length; i += 1) {
    const raw = raws[i];
    const lineNo = i + 1;
    if (/^[ ]*\t/.test(raw)) {
      throw new YamlSubsetError(file, lineNo, raw, 'tabulation en indentation (espaces uniquement)');
    }
    const body = stripComment(raw);
    if (body.trim() === '') continue;
    if (body.trim() === '---' || body.trim() === '...') {
      throw new YamlSubsetError(file, lineNo, raw, 'marqueur de document non supporté');
    }
    out.push({ indent: body.length - body.trimStart().length, text: body.trim(), line: lineNo, raw });
  }
  return out;
}

/**
 * Coupe une chaîne sur ses virgules de premier niveau, en respectant les quotes.
 * @param {string} text @returns {string[]}
 */
function splitFlow(text) {
  /** @type {string[]} */
  const parts = [];
  let current = '';
  /** @type {string|null} */
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === '\\' && quote === '"') { current += text[i + 1] ?? ''; i += 1; }
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") { quote = ch; current += ch; }
    else if (ch === ',') { parts.push(current); current = ''; }
    else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p, idx) => p !== '' || parts.length === 1);
}

/**
 * Position du premier `:` suivi d'un espace ou de la fin, hors quotes. -1 sinon.
 * @param {string} text @returns {number}
 */
function keySeparatorAt(text) {
  /** @type {string|null} */
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ':' && (i + 1 === text.length || /\s/.test(text[i + 1]))) return i;
  }
  return -1;
}

/**
 * Retire les quotes et interprète les échappements (double quotes seulement).
 * @param {string} text @param {YamlCtx} ctx @returns {string}
 */
function unquote(text, ctx) {
  const quote = text[0];
  const body = text.slice(1, -1);
  if (quote === "'") return body.replace(/''/g, "'");
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '\\') { out += body[i]; continue; }
    const next = body[i + 1];
    /** @type {Record<string, string>} */
    const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/' };
    if (next === undefined || !(next in map)) {
      throw new YamlSubsetError(ctx.file, ctx.line, ctx.raw, `échappement inconnu \\${next}`);
    }
    out += map[next];
    i += 1;
  }
  return out;
}

/**
 * Convertit un scalaire textuel en valeur JS. Refuse tout ce qui est ambigu.
 * @param {string} text @param {YamlCtx} ctx
 * @returns {string|number|boolean|null|Array<any>}
 */
function parseScalar(text, ctx) {
  const t = text.trim();
  if (t === '' || t === '~' || /^null$/i.test(t)) return null;
  if (t[0] === '&' || t[0] === '*') throw new YamlSubsetError(ctx.file, ctx.line, ctx.raw, 'ancre/alias non supporté');
  if (t === '|' || t === '>' || /^[|>][-+\d]*$/.test(t)) {
    throw new YamlSubsetError(ctx.file, ctx.line, ctx.raw, 'bloc multi-lignes (| ou >) non supporté');
  }
  if (t[0] === '{') throw new YamlSubsetError(ctx.file, ctx.line, ctx.raw, 'map en flow ({…}) non supportée');
  if (t[0] === '[') {
    if (t[t.length - 1] !== ']') throw new YamlSubsetError(ctx.file, ctx.line, ctx.raw, 'liste en flow non fermée');
    const inner = t.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlow(inner).map((item) => parseScalar(item, ctx));
  }
  if (t[0] === '"' || t[0] === "'") {
    // Une quote ouvrante sans sa fermante doit ÉCHOUER : sans ce garde, la
    // valeur retombe en chaîne nue et le fichier est mal lu en silence.
    if (t.length < 2 || t[t.length - 1] !== t[0]) {
      throw new YamlSubsetError(ctx.file, ctx.line, ctx.raw, 'chaîne quotée non fermée');
    }
    return unquote(t, ctx);
  }
  if (/^(true|false)$/i.test(t)) return /^true$/i.test(t);
  if (AMBIGUOUS_BOOLEANS.has(t.toLowerCase())) {
    throw new YamlSubsetError(ctx.file, ctx.line, ctx.raw, `« ${t} » est ambigu en YAML 1.1 — écris true/false, ou quote la valeur`);
  }
  if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10);
  if (/^-?(\d+\.\d*|\.\d+)$/.test(t)) return Number.parseFloat(t);
  return t;
}

/**
 * Largeur du tiret d'un élément de liste, espaces compris : « -   x » → 4.
 * @param {string} text @returns {number}
 */
function dashWidth(text) {
  const m = /^-(\s*)/.exec(text);
  return m ? 1 + m[1].length : 1;
}

/**
 * @param {YamlLine[]} L @param {number} i @param {number} indent @param {string} file
 * @returns {[any, number]}
 */
function parseNode(L, i, indent, file) {
  if (L[i].text === '-' || L[i].text.startsWith('- ')) return parseSequence(L, i, indent, file);
  return parseMapping(L, i, indent, file);
}

/**
 * @param {YamlLine[]} L @param {number} i @param {number} indent @param {string} file
 * @returns {[any[], number]}
 */
function parseSequence(L, i, indent, file) {
  /** @type {any[]} */
  const arr = [];
  while (i < L.length && L[i].indent === indent && (L[i].text === '-' || L[i].text.startsWith('- '))) {
    const item = L[i];
    const ctx = { file, line: item.line, raw: item.raw };
    const width = dashWidth(item.text);
    const rest = item.text.slice(width).trim();
    if (rest === '') {
      if (i + 1 < L.length && L[i + 1].indent > indent) {
        const [value, next] = parseNode(L, i + 1, L[i + 1].indent, file);
        arr.push(value);
        i = next;
      } else { arr.push(null); i += 1; }
    } else if (keySeparatorAt(rest) !== -1) {
      const synthetic = [{ indent: indent + width, text: rest, line: item.line, raw: item.raw }, ...L.slice(i + 1)];
      const [value, next] = parseMapping(synthetic, 0, indent + width, file);
      arr.push(value);
      i += next;
    } else {
      arr.push(parseScalar(rest, ctx));
      i += 1;
    }
  }
  guardDeeperLine(L, i, indent, file);
  return [arr, i];
}

/**
 * @param {YamlLine[]} L @param {number} i @param {number} indent @param {string} file
 * @returns {[Record<string, any>, number]}
 */
function parseMapping(L, i, indent, file) {
  /** @type {Record<string, any>} */
  const map = {};
  while (i < L.length && L[i].indent === indent) {
    const item = L[i];
    const ctx = { file, line: item.line, raw: item.raw };
    if (item.text === '-' || item.text.startsWith('- ')) {
      throw new YamlSubsetError(file, item.line, item.raw, 'élément de liste au niveau d\'une map');
    }
    const sep = keySeparatorAt(item.text);
    if (sep === -1) throw new YamlSubsetError(file, item.line, item.raw, 'ligne sans « clé: » (map attendue)');
    const rawKey = item.text.slice(0, sep).trim();
    const key = /^["']/.test(rawKey) ? unquote(rawKey, ctx) : rawKey;
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      throw new YamlSubsetError(file, item.line, item.raw, `clé « ${key} » dupliquée`);
    }
    const inline = item.text.slice(sep + 1).trim();
    const deeper = i + 1 < L.length && L[i + 1].indent > indent;
    // Testé AVANT le garde « inline + bloc » pour que le message nomme la vraie
    // cause : `clé: |` suivi d'un bloc déclencherait sinon le mauvais diagnostic.
    if (/^[|>][-+\d]*$/.test(inline)) {
      throw new YamlSubsetError(file, item.line, item.raw, 'bloc multi-lignes (| ou >) non supporté');
    }
    if (inline !== '' && deeper) {
      throw new YamlSubsetError(file, item.line, item.raw, 'valeur sur la ligne ET bloc indenté en dessous');
    }
    if (inline === '' && deeper) {
      const [value, next] = parseNode(L, i + 1, L[i + 1].indent, file);
      map[key] = value;
      i = next;
    } else {
      map[key] = parseScalar(inline, ctx);
      i += 1;
    }
  }
  guardDeeperLine(L, i, indent, file);
  return [map, i];
}

/**
 * Une ligne plus indentée que le bloc courant signale une indentation cassée.
 * @param {YamlLine[]} L @param {number} i @param {number} indent @param {string} file
 */
function guardDeeperLine(L, i, indent, file) {
  if (i < L.length && L[i].indent > indent) {
    throw new YamlSubsetError(file, L[i].line, L[i].raw, `indentation inattendue (${L[i].indent} > ${indent})`);
  }
}

/**
 * Parse un document YAML restreint. Lève `YamlSubsetError` sur toute construction
 * hors du sous-ensemble supporté.
 * @param {string} source @param {string} [file]
 * @returns {any}
 */
export function parseYaml(source, file = '<yaml>') {
  const lines = tokenize(source, file);
  if (lines.length === 0) return null;
  const [value, next] = parseNode(lines, 0, lines[0].indent, file);
  if (next < lines.length) {
    throw new YamlSubsetError(file, lines[next].line, lines[next].raw, 'indentation incohérente au niveau racine');
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Chargement et validation de argus.mobile.yaml
// ═══════════════════════════════════════════════════════════════════════════

/** Défauts appliqués sous la config lue : un fichier amputé ne fait pas planter. */
const DEFAULTS = {
  app: { name: 'app', androidPackage: '', iosBundleId: '', flavor: '' },
  build: {
    android: 'build/app/outputs/flutter-apk/app-debug.apk',
    ios: 'build/ios/iphonesimulator/Runner.app',
    androidBuildCmd: 'flutter build apk --debug',
    iosBuildCmd: 'flutter build ios --debug --simulator',
  },
  platforms: ['android'],
  devices: [],
  screens: [],
  dynamicRegions: [],
  visualCropOn: '',
  thresholds: {
    coldStartMs: 2000, warmStartMs: 1000, jankFramesPct: 1, memoryMb: 250,
    binarySizeMb: 60, crashFreePct: 99.5, visualMatchPercentage: 99,
  },
  a11y: { minTouchTargetDp: 48, textScales: [1.0, 1.3, 2.0], minContrastRatio: 4.5 },
  locale: { deviceLocale: 'fr_FR', currency: 'XOF', currencySample: '1 234 567 FCFA', timezone: 'Africa/Abidjan' },
  auth: {
    required: false, kind: 'form', secretsFromEnv: [],
    anchors: { screen: '', user: '', password: '', submit: '', success: '' },
  },
  deepLinks: [],
  security: {
    expectedPermissions: [], forbiddenPermissions: [], requireDebuggableOff: true,
    requireCleartextDisabled: true, requireAllowBackupOff: true, requireObfuscation: true,
    secretPatterns: [], allowSecretsIn: [], scaFailOn: 'high',
  },
  budget: { maxMinutes: 25, maxFlows: 40, parallelDevices: 1 },
  gate: { failOn: ['blocker', 'critical', 'major'], failOnNewFinding: true, failOnVisualDiff: true, failOnEmptyRun: true },
  artifacts: { dir: 'argus-mobile-report', baselines: '.maestro/_baselines' },
};

/** @param {any} v @returns {boolean} */
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Fusion profonde : la valeur lue gagne, le défaut comble les trous.
 * @param {any} base @param {any} override @returns {any}
 */
function mergeDefaults(base, override) {
  if (!isPlainObject(override)) return override === null || override === undefined ? base : override;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(base?.[key]) ? mergeDefaults(base[key], value) : value;
  }
  return out;
}

/**
 * Charge et normalise `argus.mobile.yaml`.
 * @param {string} [file]
 * @returns {any}
 */
export function loadConfig(file = process.env.ARGUS_MOBILE_CONFIG ?? 'argus.mobile.yaml') {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) {
    throw new Error(
      `${file} introuvable dans ${process.cwd()}.\n` +
        '  Installe le scaffold : bash <SKILL_DIR>/scripts/install-mobile.sh .',
    );
  }
  const parsed = parseYaml(readFileSync(path, 'utf8'), file);
  if (!isPlainObject(parsed)) throw new Error(`${file} : la racine doit être une map clé/valeur.`);
  const config = mergeDefaults(DEFAULTS, parsed);
  config.__file = file;
  return config;
}

/**
 * Contrôles sémantiques : ce que le fichier ne peut pas exprimer par sa forme.
 * Ne lève pas — rend la liste des problèmes pour que l'appelant décide.
 * @param {any} config
 * @returns {Array<{level:'error'|'warn', message:string}>}
 */
export function validateConfig(config) {
  /** @type {Array<{level:'error'|'warn', message:string}>} */
  const problems = [];
  const platforms = config.platforms ?? [];
  if (platforms.length === 0) problems.push({ level: 'error', message: 'platforms est vide : rien à tester.' });
  if (platforms.includes('android') && !config.app.androidPackage) {
    problems.push({ level: 'error', message: 'app.androidPackage est vide (requis pour la plateforme android).' });
  }
  if (platforms.includes('ios') && !config.app.iosBundleId) {
    problems.push({ level: 'error', message: 'app.iosBundleId est vide (requis pour la plateforme ios).' });
  }
  for (const platform of platforms) {
    if (!config.devices.some((/** @type {any} */ d) => d.platform === platform)) {
      problems.push({ level: 'error', message: `aucun device déclaré pour la plateforme « ${platform} ».` });
    }
  }
  const configured = configuredScreens(config);
  if (configured.length === 0) {
    problems.push({
      level: 'warn',
      message: 'aucun écran n\'a d\'ancre sémantique : tous les flows vont skipper. Renseigne screens[].anchor.',
    });
  }
  if (config.thresholds.visualMatchPercentage <= 50) {
    problems.push({
      level: 'error',
      message: `thresholds.visualMatchPercentage = ${config.thresholds.visualMatchPercentage} : c'est un POURCENTAGE DE CORRESPONDANCE (défaut Maestro 95), pas un ratio de différence. 1 % de diff toléré s'écrit 99.`,
    });
  }
  return problems;
}

/**
 * Écrans réellement exploitables (ancre sémantique renseignée).
 * @param {any} config @returns {any[]}
 */
export function configuredScreens(config) {
  return (config.screens ?? []).filter((/** @type {any} */ s) => s && typeof s.anchor === 'string' && s.anchor.trim() !== '');
}

/**
 * Devices déclarés pour les plateformes activées.
 * @param {any} config @returns {any[]}
 */
export function activeDevices(config) {
  return (config.devices ?? []).filter((/** @type {any} */ d) => (config.platforms ?? []).includes(d?.platform));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Outillage externe
// ═══════════════════════════════════════════════════════════════════════════

const IS_WINDOWS = process.platform === 'win32';

/**
 * Exécute une commande et rend {ok, status, stdout, stderr}. Ne lève jamais :
 * un outil manquant est une information, pas un plantage.
 */
/**
 * @param {string} bin @param {string[]} [args] @param {object} [opts]
 * @returns {{ok:boolean, status:number, stdout:string, stderr:string, error:string|null}}
 */
export function sh(bin, args = [], opts = {}) {
  const res = spawnSync(bin, args, {
    encoding: 'utf8', shell: IS_WINDOWS, maxBuffer: 64 * 1024 * 1024, ...opts,
  });
  return {
    ok: !res.error && res.status === 0,
    status: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error ? res.error.message : null,
  };
}

/**
 * Outils optionnels, avec la raison de leur présence et comment les installer.
 * @type {Record<string, {probe:string[], why:string, install:string}>}
 */
export const TOOLS = {
  maestro: { probe: ['--version'], why: 'moteur de test', install: 'curl -fsSL "https://get.maestro.mobile.dev" | bash  (Java 17+ requis)' },
  adb: { probe: ['version'], why: 'devices, install, perf, logcat Android', install: 'Android SDK Platform-Tools' },
  xcrun: { probe: ['--version'], why: 'simulateurs iOS', install: 'Xcode Command Line Tools (macOS)' },
  flutter: { probe: ['--version'], why: 'build et gardes flutter_test', install: 'https://docs.flutter.dev/get-started/install' },
  aapt2: { probe: ['version'], why: 'lecture du manifeste de l\'APK', install: 'Android SDK Build-Tools (ajoute-le au PATH)' },
  apkanalyzer: { probe: ['-h'], why: 'taille et contenu de l\'APK', install: 'Android SDK Command-line Tools' },
  'osv-scanner': { probe: ['--version'], why: 'CVE des dépendances', install: 'https://google.github.io/osv-scanner/installation/' },
};

/**
 * Détecte les outils disponibles.
 * @param {string[]} [names]
 * @returns {Record<string, {present:boolean, version:string|null}>}
 */
export function detectTools(names = Object.keys(TOOLS)) {
  /** @type {Record<string, {present:boolean, version:string|null}>} */
  const out = {};
  for (const name of names) {
    const spec = TOOLS[name] ?? { probe: ['--version'] };
    const res = sh(name, spec.probe);
    // `apkanalyzer -h` sort en code non nul tout en prouvant sa présence :
    // l'absence se reconnaît à l'erreur de spawn (ENOENT), pas au status.
    const present = res.error === null;
    out[name] = { present, version: present ? firstLine(res.stdout || res.stderr) : null };
  }
  return out;
}

/** @param {string} text @returns {string|null} */
const firstLine = (text) => (String(text).trim().split('\n')[0] ?? '').trim() || null;

/**
 * Message actionnable quand un outil manque — jamais une stack trace.
 * @param {string} name @returns {string}
 */
export function missingToolMessage(name) {
  const spec = TOOLS[name];
  const why = spec ? ` (${spec.why})` : '';
  const how = spec ? `\n  Installation : ${spec.install}` : '';
  return `outil « ${name} » absent${why}.${how}`;
}

/**
 * `adb -s <udid> shell …` avec repli quand un seul device est branché.
 * @param {string} udid @param {string[]} command
 */
export function adbShell(udid, command) {
  const args = udid ? ['-s', udid, 'shell', ...command] : ['shell', ...command];
  return sh('adb', args);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Sévérité, gating, sorties
// ═══════════════════════════════════════════════════════════════════════════

/** Taxonomie IDENTIQUE au skill web (references/methodology.md §8). */
export const SEVERITIES = ['blocker', 'critical', 'major', 'minor', 'info'];

/**
 * Exit code d'une dimension. 2 = blocker/critical, 1 = major dans le gate,
 * 0 = vert. Identique au harness web : la cohérence entre les deux skills est
 * un objectif en soi.
 * @param {Array<{severity:string}>} findings @param {any} [gate] @returns {0|1|2}
 */
export function exitCodeFor(findings, gate = DEFAULTS.gate) {
  const failOn = new Set(gate.failOn ?? []);
  const present = new Set(findings.map((f) => f.severity));
  if ((present.has('blocker') && failOn.has('blocker')) || (present.has('critical') && failOn.has('critical'))) return 2;
  if (present.has('major') && failOn.has('major')) return 1;
  return 0;
}

/**
 * Crée le dossier d'artefacts et rend son chemin absolu.
 * @param {any} config @param {string} [sub] @returns {string}
 */
export function artifactsDir(config, sub = '') {
  const dir = resolve(process.cwd(), config.artifacts?.dir ?? 'argus-mobile-report', sub);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Écrit un JSON indenté, en créant l'arborescence au besoin.
 * @param {string} path @param {any} data @returns {string}
 */
export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return path;
}

/** @param {string} msg */
export const log = (msg) => console.log(`[argus-mobile] ${msg}`);
/** @param {string} msg */
export const warn = (msg) => console.warn(`[argus-mobile] ⚠️  ${msg}`);
/** @param {string} msg */
export const err = (msg) => console.error(`[argus-mobile] ✖ ${msg}`);

// ═══════════════════════════════════════════════════════════════════════════
// 5. Mode direct : imprimer la config résolue et l'outillage
// ═══════════════════════════════════════════════════════════════════════════

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
    return;
  }
  log(`config lue : ${config.__file}`);
  console.log(JSON.stringify({ ...config, __file: undefined }, null, 2));

  const problems = validateConfig(config);
  for (const p of problems) (p.level === 'error' ? err : warn)(p.message);

  console.log('\nOutillage :');
  const tools = detectTools();
  for (const [name, info] of Object.entries(tools)) {
    console.log(info.present ? `  ✔ ${name.padEnd(12)} ${info.version ?? ''}` : `  ○ ${name.padEnd(12)} absent — ${TOOLS[name].install}`);
  }
  process.exitCode = problems.some((p) => p.level === 'error') ? 2 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
