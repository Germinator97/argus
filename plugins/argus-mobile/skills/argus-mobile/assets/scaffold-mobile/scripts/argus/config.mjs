#!/usr/bin/env node
// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
// @ts-check
/**
 * Argus Mobile — socle partagé (lecture de config, outillage, utilitaires)
 * ------------------------------------------------------------------------
 * Tous les autres scripts de `scripts/argus/` importent depuis ici.
 *
 * Pourquoi un parseur YAML maison plutôt que `js-yaml` : un projet Flutter n'a
 * ni `package.json` ni `node_modules`. Exiger `npm install` pour lire un fichier
 * de config serait une dépendance de plus à installer avant de pouvoir lancer
 * le moindre test. Le parseur ci-dessous couvre un SOUS-ENSEMBLE strict de YAML
 * et ÉCHOUE BRUYAMMENT sur tout ce qu'il ne sait pas lire, plutôt que de deviner.
 * Un parseur permissif qui se trompe en silence serait pire que pas de parseur.
 *
 * Lancé directement, ce fichier imprime la config résolue et l'outillage détecté :
 *   node scripts/argus/config.mjs
 *
 * Node >= 18, ESM, zéro dépendance.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Parseur YAML (sous-ensemble strict)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ligne significative du document, une fois commentaires et blancs retirés.
 * @typedef {{ indent: number, text: string, line: number, raw: string }} YamlLine
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
  return parts.map((p) => p.trim()).filter((p) => p !== '' || parts.length === 1);
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
  if (t[0] === '{') throw new YamlSubsetError(ctx.file, ctx.line, ctx.raw, 'map en flow ({…}) non supportée — écris-la en map imbriquée, une clé par ligne');
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
  // Le cadrage du run, celui que le SKILL §1 demande d'écrire « près de sa clé ».
  // ⚠️ Ces deux clés ont manqué neuf runs : le contrat de sortie les promettait
  // (`run.env`, `run.mode`), le rapport ne les écrivait pas, et la consigne
  // désignait un emplacement qui n'existait pas — deux agents de suite ont donc
  // rangé ENV en commentaire d'en-tête, chacun à sa façon. Une consigne qui
  // pointe une case absente se solde par une case inventée.
  run: { env: 'local', mode: 'REGRESS' },
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
  // Injecté dans .maestro/visual.yaml (ARGUS_VISUAL_CROP) : le conteneur sur
  // lequel `cropOn` recadre les captures. Vide → plein écran.
  visualCropOn: '',
  thresholds: {
    coldStartMs: 2000, brandedSplashMs: 0, warmStartMs: 1000, memoryMb: 250,
    binarySizeMb: 60, visualMatchPercentage: 99,
  },
  a11y: { minTouchTargetDp: 48 },
  locale: { deviceLocale: 'fr_FR' },
  auth: {
    secretsFromEnv: [],
    anchors: { screen: '', user: '', password: '', submit: '', success: '' },
  },
  deepLinks: [],
  security: {
    expectedPermissions: [], forbiddenPermissions: [], requireDebuggableOff: true,
    requireCleartextDisabled: true, requireAllowBackupOff: true, requireObfuscation: true,
    secretPatterns: [], allowSecretsIn: [], scaFailOn: 'high',
  },
  budget: { maxMinutes: 25, maxFlows: 40 },
  gate: { failOn: ['blocker', 'critical', 'major'], failOnVisualDiff: true, failOnEmptyRun: true },
  artifacts: { dir: 'argus-mobile-report', baselines: '.maestro/_baselines' },
  artifact: { enabled: false, url: '', title: '', icon: '', evidence: 'all', evidenceAcknowledged: '', maxMb: 12 },
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

  // Un émulateur Android désigné par son PORT. Ça marche, jusqu'au jour où les
  // émulateurs démarrent dans un autre ordre : le port pointe alors un autre
  // AVD, le run se déroule normalement sur la mauvaise machine, et les
  // baselines visuelles — liées au couple device+OS — deviennent fausses sans
  // qu'aucun test ne rougisse. Le dire ici permet de le voir sans device.
  for (const device of config.devices ?? []) {
    if (device?.platform === 'android' && device.udid && !device.avd && device.physical !== true) {
      problems.push({
        level: 'warn',
        message: `device « ${device.id} » : « ${device.udid} » est un numéro de port, pas une identité — `
          + 'il désignera un autre AVD si l\'ordre de démarrage change. Utilise « avd: <nom> » '
          + '(emulator -list-avds), ou « physical: true » si c\'est un vrai téléphone.',
      });
    }
    if (device?.platform === 'ios' && device.avd) {
      problems.push({
        level: 'error',
        message: `device « ${device.id} » : « avd » n'existe que sur Android. Un simulateur iOS se `
          + 'désigne par son udid, qui est un UUID stable.',
      });
    }
  }
  const evidence = config.artifact?.evidence ?? 'all';
  if (!['all', 'major', 'none'].includes(evidence)) {
    problems.push({ level: 'error', message: `artifact.evidence vaut « ${evidence} » : attendu all, major ou none.` });
  }
  const maxMb = config.artifact?.maxMb;
  if (typeof maxMb !== 'number' || !(maxMb > 0)) {
    problems.push({ level: 'error', message: `artifact.maxMb vaut « ${maxMb} » : attendu un nombre > 0.` });
  }

  // Publier envoie le rapport — captures comprises — à un service tiers. Le
  // rappeler ici plutôt que dans la doc seule : c'est au moment de lire sa
  // config qu'on vérifie ce qu'on a activé, pas en relisant un README.
  //
  // ⚠️ ET IL DOIT POUVOIR SE FERMER. Cet avertissement sortait à CHAQUE
  // exécution — une dizaine de fois par run — sans qu'aucune clé n'enregistre
  // qu'on avait vérifié. Un avertissement qu'on ne peut pas acquitter finit
  // ignoré, et il emmène les autres avec lui : c'est exactement ce que le skill
  // reproche aux TODO sans objet, appliqué à sa propre sortie.
  //
  // `evidenceAcknowledged:` porte la RAISON, pas un booléen nu : « app interne,
  // pas de donnée client » se relit dans six mois, `true` ne se relit pas.
  const acquitte = String(config.artifact?.evidenceAcknowledged ?? '').trim();
  if (config.artifact?.enabled && ['all', 'major'].includes(evidence) && !acquitte) {
    problems.push({
      level: 'warn',
      message: 'artifact.enabled et artifact.evidence=' + evidence + ' : les captures d\'écran de l\'app '
        + 'partiront avec le rapport publié. Sur une app sous contrat, vérifie que c\'est permis — '
        + 'puis inscris la raison dans artifact.evidenceAcknowledged pour fermer cet avertissement '
        + '(artifact.evidence: none si les captures ne doivent pas partir).',
    });
  }

  // ⚠️ UN DEVICE D'UNE PLATEFORME QU'ON NE TESTE PAS EST UN RESTE, PAS UN CHOIX.
  // Le gabarit livre le bloc Android ACTIF et le bloc iOS en commentaire :
  // remplacer l'un par l'autre laisse derrière `avd`, `model: pixel_6`,
  // `os: android-33`… six clés à l'indentation d'un item, qui FUSIONNENT
  // silencieusement dans l'entrée iOS au lieu de lever. Un run l'a vu en
  // relisant, pas parce qu'un outil le lui a dit — `config.mjs` aurait rendu un
  // `ios-sim` avec `model: pixel_6`.
  const plateformes = new Set((config.platforms ?? []).map(String));
  for (const d of config.devices ?? []) {
    const pf = String(d?.platform ?? '');
    if (pf && plateformes.size && !plateformes.has(pf)) {
      problems.push({
        level: 'error',
        message: `devices[].platform = « ${pf} » (${d?.id ?? 'sans id'}) alors que platforms ne déclare `
          + `que ${[...plateformes].join(', ')}. Reste d'un bloc d'exemple ? Retire l'entrée entière — `
          + 'les clés orphelines fusionnent dans la suivante au lieu de lever.',
      });
    }
  }

  // ── D'où partent les flows ────────────────────────────────────────────────
  const declares = (config.screens ?? []).filter((/** @type {any} */ s) => s?.start === true);
  if (declares.length > 1) {
    problems.push({
      level: 'error',
      message: `${declares.length} écrans portent « start: true » (${declares.map((/** @type {any} */ s) => s.id).join(', ')}) : `
        + 'les flows ne peuvent partir que d\'un seul endroit. Garde-en un.',
    });
  }
  // Un « start: true » sur un écran SANS ancre ne déclenche rien : l'écran est
  // écarté avant même d'être considéré, et le runner repart en repli. On croit
  // avoir choisi, et le choix n'a jamais été lu.
  for (const s of declares) {
    if (typeof s.anchor !== 'string' || s.anchor.trim() === '') {
      problems.push({
        level: 'error',
        message: `l'écran « ${s.id} » porte « start: true » mais n'a pas d'ancre : il est ignoré, `
          + 'et le point de départ retombe silencieusement sur un autre écran.',
      });
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
/**
 * L'émulateur que la CI doit démarrer, dérivé de `devices[]`.
 *
 * ⚠️ VIDE N'EST PAS ILLISIBLE, et les confondre casse un projet sain. Le
 * scaffold dit lui-même de laisser `model`/`os` vides dès qu'on cible un `avd`
 * nommé — c'est le cas recommandé, donc le plus fréquent. Les traiter comme une
 * faute rendait le job rouge sur une config que le skill venait de produire.
 *
 * Trois issues, et c'est la distinction qui compte :
 *   renseigné       → on dérive, la CI et les références parlent du même appareil
 *   vide            → choix documenté : les défauts du workflow, et on le DIT
 *   mal formé       → faute de frappe : on échoue, plutôt que de deviner
 * @param {any} config @param {{apiLevel:string, profile:string}} [defauts]
 * @returns {{ok:boolean, apiLevel?:string, profile?:string, source?:string, why:string}}
 */
/**
 * La commande de build à PROPOSER, ciblée sur l'ABI de l'appareil visé.
 *
 * ⚠️ UN APK « FAT » EMBARQUE QUATRE ABI, L'APPAREIL N'EN LIT QU'UNE. Mesuré sur
 * un projet, `flutter clean` avant chaque build : **84,9 Mo** contre **39,7 Mo**
 * pour arm64 seul — les trois `libflutter.so` en trop pèsent 45,2 Mo stockées.
 *
 * Ce n'est pas qu'une économie, c'est plus JUSTE : le Play Store livre un APK
 * découpé par ABI, donc l'utilisateur reçoit déjà du mono-ABI. C'est le fat qui
 * ne correspond à rien de ce que quelqu'un installe, et les autres ABI ne sont
 * jamais chargées sur l'appareil visé. Au passage, ça écarte le
 * `INSTALL_FAILED_INSUFFICIENT_STORAGE` d'un émulateur dont `/data` est plein.
 *
 * ⚠️ L'ABI se LIT sur l'appareil, elle ne se devine pas : un émulateur sur
 * Apple Silicon rend `arm64-v8a`, sur Intel `x86_64`, un vieux téléphone
 * `armeabi-v7a`. Sans lecture possible, on rend la commande telle quelle plutôt
 * que d'inventer une cible — un `--target-platform` faux ne produit pas un APK
 * plus petit, il produit un APK qui ne s'installe pas.
 *
 * ⚠️ Et on ne LANCE rien : ces commandes sont AFFICHÉES. Le harnais ne construit
 * jamais à la place de qui l'utilise.
 * @param {string} commande @param {string} abi @returns {string}
 */
export function buildCmdForAbi(commande, abi) {
  const cible = { 'arm64-v8a': 'android-arm64', 'armeabi-v7a': 'android-arm', 'x86_64': 'android-x64' }[abi];
  if (!cible || !/\bbuild\s+apk\b/.test(commande) || /--target-platform/.test(commande)) return commande;
  return `${commande} --target-platform ${cible}`;
}

/**
 * L'ABI de l'appareil, LUE sur lui. Chaîne vide si on n'a pas pu.
 * @param {string} udid @param {typeof adbShell} [lire]
 * @returns {string}
 */
export function deviceAbi(udid, lire = adbShell) {
  if (!udid) return '';
  const abi = lire(udid, ['getprop', 'ro.product.cpu.abi']).stdout.trim();
  return /^[a-z0-9_-]+$/i.test(abi) ? abi : '';
}

/**
 * Le variant du paquet INSTALLÉ, lu sur l'appareil : `'debug'`, `'release'`, ou
 * chaîne vide quand la lecture n'a pas abouti.
 *
 * ⚠️ CETTE VALEUR NE SE DÉDUIT PAS DE LA COMMANDE DE BUILD, et c'est tout
 * l'objet de cette fonction. `am start -W` chronomètre — et `dumpsys meminfo`
 * pèse — le paquet POSÉ sur l'appareil, qu'aucun de ces scripts n'installe. La
 * commande configurée dit ce qu'on aurait construit, jamais ce qui a été
 * mesuré. Les deux divergent dès qu'on pèse une release sans la poser, et le
 * rapport affirme alors `binaryIsRelease: true` au-dessus d'un chrono de debug.
 * Mesuré sur `Medium_Phone_API_36.1`, médiane de trois lancements à froid :
 * **1213 ms** installé en debug contre **532 ms** en release, facteur 2,28.
 *
 * ⚠️ Un échec rend `''`, JAMAIS `'release'`. Confondre « pas mesuré » avec
 * « c'est une release » reconstruirait le défaut qu'on ferme, en silence et
 * dans le sens le plus flatteur — un paquet absent rendrait alors un rapport
 * qui se dit propre.
 * @param {string} udid @param {string} packageName @param {typeof adbShell} [lire]
 * @returns {'debug'|'release'|''}
 */
export function installedVariant(udid, packageName, lire = adbShell) {
  if (!packageName) return '';
  const out = lire(udid, ['dumpsys', 'package', packageName]).stdout ?? '';
  // `dumpsys package` rend PLUSIEURS lignes `flags=`, dont une en hexadécimal
  // (`flags=0x0`) qui ne nomme rien. Seule celle entre crochets porte les
  // drapeaux lisibles — `flags=[ DEBUGGABLE HAS_CODE … ]`, `pkgFlags=[ … ]`.
  const drapeaux = out.match(/[Ff]lags=\[([^\]]*)\]/);
  if (!drapeaux) return '';
  return /\bDEBUGGABLE\b/.test(drapeaux[1]) ? 'debug' : 'release';
}

export function ciEmulator(config, defauts = { apiLevel: '33', profile: 'pixel_6' }) {
  const device = activeDevices(config).find((/** @type {any} */ d) => d?.platform === 'android');
  if (!device) {
    return { ok: false, why: 'aucun device android actif dans argus.mobile.yaml (platforms + devices[].platform)' };
  }
  const os = String(device.os ?? '').trim();
  const model = String(device.model ?? '').trim();
  // ⚠️ L'AVD VOYAGE AVEC SES DEUX VOISINS, et son absence coûtait le job entier.
  // `model` et `os` étaient dérivés jusqu'à la CI ; `avd` — la SEULE identité
  // que le runner compare (`resolveByAvd`) — ne l'était pas. Le scaffold exige
  // pourtant de le renseigner : la configuration prescrite était donc exactement
  // celle qui faisait échouer le job, l'action provisionnant un AVD sous son
  // propre nom. Vide quand rien n'est déclaré : l'appelant retombe alors sur le
  // défaut de l'action, ce qui est le comportement d'avant.
  const avdName = String(device.avd ?? '').trim();
  if (!os && !model) {
    return {
      ok: true, ...defauts, avdName, source: 'défaut du workflow',
      why: `devices[].os et model sont vides (normal avec un avd nommé) — l'émulateur de CI reste `
        + `api-level ${defauts.apiLevel} / ${defauts.profile}. Renseigne-les pour que la CI démarre `
        + `l'appareil de tes références visuelles : ils ne gênent plus, l'empreinte des baselines est MESURÉE.`,
    };
  }
  if (!/^android-\d+$/.test(os)) {
    return { ok: false, why: `devices[].os illisible : « ${device.os} » (attendu : android-33)` };
  }
  return {
    ok: true, apiLevel: os.slice('android-'.length), profile: model || defauts.profile,
    avdName, source: 'argus.mobile.yaml', why: '',
  };
}

export function activeDevices(config) {
  return (config.devices ?? []).filter((/** @type {any} */ d) => (config.platforms ?? []).includes(d?.platform));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Outillage externe
// ═══════════════════════════════════════════════════════════════════════════

const IS_WINDOWS = process.platform === 'win32';

/**
 * Plafonds d'attente d'une commande externe, en millisecondes.
 *
 * ⚠️ ILS EXISTENT PARCE QU'UNE MESURE PEUT NE JAMAIS RENDRE LA MAIN. Relevé sur
 * un projet réel : `argus-perf` s'est bloqué 3 fois sur 5 dans la boucle des
 * démarrages à chaud — 12 min, 1 min 48, un troisième tué à 4 min — pendant
 * qu'une quatrième tentative rendait la mesure complète en 10 s. Aucun script
 * d'ici ne passait de `timeout` à `spawnSync`, donc l'attente n'avait pas de
 * fin ; et elle était MUETTE : ce qu'on lit alors en CI est « le job a expiré »,
 * jamais « une mesure de démarrage n'a pas rendu la main ».
 *
 * Le mécanisme du blocage n'est pas attribué, et le correctif n'en dépend pas :
 * un script de mesure ne doit pas POUVOIR attendre sans fin.
 *
 * Deux ordres de grandeur, parce qu'il y a deux natures de commandes :
 *   SH_TIMEOUT_MS     plafond de sécurité des commandes longues et légitimes
 *                     (`flutter build`, `gradlew`, `maestro test`). Ce n'est pas
 *                     un budget — il dit seulement « pas l'infini ».
 *   PROBE_TIMEOUT_MS  les SONDES, qui rendent en secondes ou pas du tout :
 *                     `adb shell`, `getprop`, `dumpsys`, `--version`.
 */
export const SH_TIMEOUT_MS = 15 * 60 * 1000;
export const PROBE_TIMEOUT_MS = 60 * 1000;

/**
 * Le plafond effectif d'un appel — séparé de son application POUR ÊTRE TESTÉ.
 *
 * Trois voies, dans cet ordre : ce que l'appelant demande (il a mesuré sa
 * commande), ce que l'environnement impose (`ARGUS_SH_TIMEOUT_MS`, pour relever
 * sans toucher au code une machine simplement lente), puis le défaut.
 *
 * ⚠️ `env` est un PARAMÈTRE et pas une lecture de `process.env`, pour la même
 * raison que `pinned` l'est dans [flutterCommandIn] : une valeur lue à
 * l'intérieur ne peut pas varier en test, et un garde qui n'exerce qu'une
 * branche ne garde que celle-là.
 * @param {object} [opts] @param {Record<string,string|undefined>} [env]
 * @returns {number}
 */
export function shTimeoutMs(opts = {}, env = process.env) {
  const demande = Number(/** @type {any} */ (opts).timeout ?? 0);
  if (demande > 0) return demande;
  const impose = Number(env.ARGUS_SH_TIMEOUT_MS ?? 0);
  if (impose > 0) return impose;
  return SH_TIMEOUT_MS;
}

/**
 * Exécute une commande et rend {ok, status, stdout, stderr, timedOut}. Ne lève
 * jamais : un outil manquant est une information, pas un plantage.
 * @param {string} bin @param {string[]} [args] @param {object} [opts]
 * @returns {{ok:boolean, status:number, stdout:string, stderr:string, error:string|null, timedOut:boolean}}
 */
export function sh(bin, args = [], opts = {}) {
  const plafond = shTimeoutMs(opts);
  const res = spawnSync(bin, args, {
    encoding: 'utf8', shell: IS_WINDOWS, maxBuffer: 64 * 1024 * 1024, ...opts,
    // ⚠️ APRÈS le spread, et en SIGKILL : mesuré, `timeout` seul NE TIENT PAS
    // son plafond. Un process qui ignore SIGTERM — le signal envoyé par défaut —
    // laisse `spawnSync` attendre sa fin naturelle : 9 068 ms relevés pour un
    // plafond de 300, avec `error.code = 'ETIMEDOUT'` rendu quand même, donc un
    // dépassement qui se RAPPORTE sans avoir jamais été borné. Le même appel en
    // `killSignal: 'SIGKILL'` rend la main en 306 ms.
    timeout: plafond, killSignal: 'SIGKILL',
  });
  // Un dépassement est la seule panne d'ici qui ne laisse rien derrière elle :
  // ni stdout, ni code de sortie, ni ligne de log. On l'écrit donc quoi qu'en
  // fasse l'appelant — c'est ce silence-là qui coûte, pas l'attente.
  const timedOut = /** @type {any} */ (res.error)?.code === 'ETIMEDOUT';
  if (timedOut) {
    const duree = plafond >= 1000 ? `${Math.round(plafond / 1000)} s` : `${plafond} ms`;
    warn(`\`${[bin, ...args].join(' ').slice(0, 120)}\` n'a pas rendu la main en ${duree} — tuée.`);
    warn('  Ce n\'est pas un résultat : le plafond d\'attente a été atteint, pas la fin du travail.');
    warn('  ARGUS_SH_TIMEOUT_MS=<ms> le relève si la machine est simplement lente.');
  }
  return {
    ok: !res.error && res.status === 0,
    status: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error ? res.error.message : null,
    timedOut,
  };
}

/**
 * Le projet épingle-t-il son SDK Flutter par FVM ?
 *
 * ⚠️ Ça change la commande, pas seulement le confort : la contrainte de SDK du
 * `pubspec.yaml` REJETTE la version globale, donc `flutter` du PATH échoue sur
 * tout — `pub get` compris. Le Makefile le dérivait déjà ; les scripts, non,
 * si bien qu'`argus-doctor` sondait un SDK que le projet n'utilise pas et
 * rendait sa version. Relevé sur un projet réel : 3.32.0 annoncé là où le
 * projet construit en 3.41.9.
 * @returns {boolean}
 */
export const usesFvm = () => existsSync(resolve(process.cwd(), '.fvmrc')) || existsSync(resolve(process.cwd(), '.fvm'));

/**
 * La décision, séparée de sa mesure.
 *
 * Ne préfixe que ce qui commence par `flutter ` : une commande déjà écrite
 * `fvm flutter …`, ou qui passe par un script maison, est rendue intacte.
 *
 * ⚠️ `pinned` est un paramètre, et pas un appel à [usesFvm], POUR POUVOIR ÊTRE
 * TESTÉ. Tant que la fonction lisait le disque elle-même, un garde écrit dans un
 * dépôt sans `.fvmrc` n'atteignait jamais la branche qui préfixe : il vérifiait
 * la cohérence de la logique sans jamais l'exercer, et restait vert quand on la
 * cassait. Découvert par mutation, pas par relecture.
 * @param {string} command @param {boolean} pinned @returns {string}
 */
export function flutterCommandIn(command, pinned) {
  const text = String(command ?? '').trim();
  if (!pinned || !text.startsWith('flutter ')) return text;
  return `fvm ${text}`;
}

/**
 * Une commande Flutter telle qu'il faut la TAPER dans ce projet.
 * @param {string} command @returns {string}
 */
export const flutterCommand = (command) => flutterCommandIn(command, usesFvm());

/**
 * Le code Dart, commentaires ôtés — les chaînes gardées.
 *
 * ⚠️ UN FILTRE DE LIGNES NE SUFFIT PAS, et c'est la troisième fois que ce
 * chantier le paie. Retirer les lignes qui COMMENCENT par `//` laisse passer le
 * commentaire de FIN de ligne, et une apostrophe française y ouvre un faux
 * littéral : `'home_start', // n'existe qu'en debug` a rendu deux ancres
 * fantômes (`existe qu`, `est voulu`). Il faut balayer de GAUCHE À DROITE —
 * dans une chaîne, `//` n'ouvre pas de commentaire ; hors d'une chaîne, il
 * mange jusqu'au bout de la ligne. Aucune expression régulière ne fait ça.
 * @param {string} src @returns {string}
 */
export function dartSansCommentaires(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2; continue;
    }
    if (c === '\'' || c === '"') {
      const q = c;
      out += c; i += 1;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\' && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i]; i += 1;
      }
      if (i < n) { out += src[i]; i += 1; }
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

/**
 * Les littéraux de chaîne d'un argument Dart, interpolations comprises.
 *
 * ⚠️ Pourquoi un automate plutôt qu'une expression régulière : `'([^']*)'` ne
 * sait pas qu'une apostrophe INTERNE À UNE INTERPOLATION ne ferme pas la chaîne.
 * Sur `identifier: cond ? null : '${prefix}_${x ?? 'all'}'` elle découpe trois
 * fragments et garde le dernier — si bien que le relevé rendait **`}`** comme
 * une ancre posée. Un run l'a trouvé sur du Dart parfaitement légal, et a dû
 * réécrire SON code pour contourner NOTRE motif : c'est le sens inverse de ce
 * qu'un outil de mesure doit faire.
 *
 * Rend les chaînes BRUTES, interpolation comprise : c'est l'appelant qui décide
 * ensuite si `${` en fait une famille plutôt qu'une ancre.
 */
export function litterauxDart(source) {
  const trouves = [];
  let i = 0;
  while (i < source.length) {
    const q = source[i];
    if (q !== "'" && q !== '"') { i += 1; continue; }
    // Une chaîne commence. On la suit jusqu'à SA fermeture, en sautant les
    // interpolations — qui peuvent elles-mêmes contenir des chaînes.
    const debut = i + 1;
    i = debut;
    let ferme = false;
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') { i += 2; continue; }
      if (c === q) { ferme = true; break; }
      if (c === '$' && source[i + 1] === '{') {
        let profondeur = 1;
        i += 2;
        while (i < source.length && profondeur > 0) {
          const d = source[i];
          if (d === '\\') { i += 2; continue; }
          if (d === '{') profondeur += 1;
          else if (d === '}') profondeur -= 1;
          else if (d === "'" || d === '"') {
            // une chaîne DANS l'interpolation : la sauter entièrement, sans quoi
            // son apostrophe fermante passerait pour celle de la chaîne portante
            const interne = d;
            i += 1;
            while (i < source.length && source[i] !== interne) {
              i += source[i] === '\\' ? 2 : 1;
            }
          }
          i += 1;
        }
        continue;
      }
      i += 1;
    }
    if (ferme) { trouves.push(source.slice(debut, i)); i += 1; } else break;
  }
  return trouves;
}

/**
 * Les `identifier:` posés dans lib/, littéraux seuls.
 *
 * La liste porte trois relevés attachés, hors énumération : `opaques` (la clé
 * est là, aucun littéral lisible), `familles` (un gabarit interpolé) et
 * `fichiers` (combien de `.dart` ont été LUS — le dénominateur sans lequel une
 * liste vide ne veut rien dire).
 * @param {string} root @param {any} [config]
 * @returns {string[] & {opaques:string[], familles:string[], fichiers:number}}
 */
export function posedAnchors(root, config = undefined) {
  // ⚠️ `[a-zA-Z]*[Ii]dentifier:` ET NON `identifier:`. Le motif minuscule ne
  // voyait que `Semantics(identifier: …)` et ratait `semanticIdentifier: '…'`,
  // c'est-à-dire le nom que le SKILL prescrit pour un composant partagé — donc
  // exactement l'angle mort qu'il décrit deux paragraphes plus haut, « sans nom
  // stable elles sont invisibles à tout relevé ». Mesuré sur un projet réel :
  // 20 ancres posées par paramètre, dans 8 fichiers, invisibles au contrôle.
  //
  // ⚠️ `anchorPrefix` reste DEHORS, et c'est voulu : un préfixe n'est pas une
  // ancre, il en nomme une famille. Le compter rapporterait un littéral que
  // rien ne déclare — un faux positif, pas une trouvaille.
  //
  // Un projet dont la convention ne finit pas par « identifier » l'inscrit dans
  // `anchors.paramNames` : le SKILL dit de GARDER la convention du projet, donc
  // la refuser ici rendrait le contrôle muet là où il compte le plus.
  const sur = ((config?.anchors ?? {}).paramNames ?? []).map(String).filter(Boolean);
  // ⚠️ ON NE CAPTURE PLUS UN LITTÉRAL COLLÉ À LA CLÉ, ON LIT L'ARGUMENT ENTIER.
  // Le motif d'avant exigeait `identifier: 'x'` et rendait donc INVISIBLE
  // `identifier: cond ? 'a' : 'b'` — c'est-à-dire la forme que le §2c-bis
  // PRESCRIT quand deux états sortent du même `Semantics`. Mesuré sur un projet
  // réel : **59 ancres posées, 54 vues, et le contrôle restait VERT** en
  // annonçant « 54 littérales ». Le chiffre était honnête ; il ne disait pas
  // qu'il en manquait cinq. Un garde vert par accident, sur la forme même que
  // le skill recommande.
  const cle = new RegExp(`(?:${['[a-zA-Z]*[Ii]dentifier', ...sur].join('|')}):`, 'g');
  /** @type {Set<string>} */
  const poses = new Set();
  // Le dénominateur de tout ce qui suit : une liste vide ne veut rien dire tant
  // qu'on ne sait pas si elle vient d'un corpus vide.
  let fichiers = 0;
  // Les arguments où la clé est présente mais dont AUCUN littéral ne se laisse
  // lire (`identifier: widget.anchorId`). On ne peut rien en dire — alors on le
  // DIT, plutôt que de les compter zéro en silence.
  /** @type {Set<string>} */
  const opaques = new Set();
  // Les GABARITS : `identifier: 'x_${e.name}'`, que le §2c prescrit pour un
  // ensemble fini. Une famille, pas une ancre — développée dans `harness.dart`.
  /** @type {Set<string>} */
  const familles = new Set();
  (function marcher(/** @type {string} */ dir) {
    let entrees;
    try { entrees = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) { marcher(abs); continue; }
      if (!e.name.endsWith('.dart')) continue;
      fichiers += 1;
      // Le dartdoc d'exemple porte de VRAIES ancres — deux compteurs du chantier
      // s'y sont fait prendre à seize runs d'écart. Le balayage les ôte, ainsi
      // que les commentaires de fin de ligne, que le filtre `///` laissait passer.
      const texte = dartSansCommentaires(readFileSync(abs, 'utf8'));
      for (const m of texte.matchAll(cle)) {
        const arg = argumentApres(texte, m.index + m[0].length);
        const litteraux = litterauxDart(arg)
          // ⚠️ Un gabarit INTERPOLÉ vaut une famille, pas une ancre : on ne
          // peut pas le confronter à un littéral, donc on ne le compte pas.
          .filter((v) => v !== '' && !v.includes('${'));
        if (litteraux.length === 0) {
          const nu = arg.trim();
          // ⚠️ UN GABARIT INTERPOLÉ N'EST PAS UNE ANCRE OPAQUE : c'est une
          // FAMILLE, et le §2c la PRESCRIT pour un ensemble fini d'enum. Le
          // croisement rendait un ⚠️ permanent et proposait `allowUndeclared`,
          // qui veut dire « hors périmètre » — alors que les ancres d'un gabarit
          // sont bel et bien vérifiées, développées dans `harness.dart`. Un run
          // a préféré garder l'avertissement plutôt que de mentir dans le YAML :
          // il avait raison, il n'y avait pas de bonne case.
          //
          // On les range donc à part. Elles ne sont ni « posées » (on ne peut
          // pas les confronter) ni « inconnues » (on sait ce qu'elles sont).
          const gabarit = /'[^']*\$\{[^']*'/.test(nu);
          if (nu && gabarit) familles.add(`${abs.slice(root.length + 1)} — ${nu.slice(0, 60)}`);
          else if (nu) opaques.add(`${abs.slice(root.length + 1)} — ${nu.slice(0, 60)}`);
          continue;
        }
        for (const v of litteraux) poses.add(v);
      }
    }
  })(join(root, 'lib'));
  const liste = [...poses].sort();
  // Les opaques voyagent à côté, jamais dans la liste : ce ne sont pas des
  // ancres, ce sont des endroits où l'on ne sait pas s'il y en a.
  Object.defineProperty(liste, 'opaques', { value: [...opaques].sort(), enumerable: false });
  Object.defineProperty(liste, 'familles', { value: [...familles].sort(), enumerable: false });
  // ⚠️ COMBIEN DE FICHIERS ONT ÉTÉ LUS, et c'est ce qui manquait pour distinguer
  // « aucune ancre orpheline » de « rien n'a été mesuré ». Sans `lib/` — un
  // monorepo, ou simplement le mauvais répertoire courant — la liste est vide et
  // le contrôle concluait au vert.
  Object.defineProperty(liste, 'fichiers', { value: fichiers, enumerable: false });
  // `defineProperty` est invisible au typage : le cast dit ce que la fonction
  // rend vraiment, et c'est la seule façon de le déclarer sans mentir.
  return /** @type {string[] & {opaques:string[], familles:string[], fichiers:number}} */ (liste);
}

/**
 * Le texte de l'argument qui suit une clé nommée, borné à sa virgule.
 *
 * ⚠️ LA BORNE EST TOUT L'ENJEU. Lire jusqu'à la clé suivante attraperait le
 * `label:` d'à côté et compterait « Ajouter au panier » comme une ancre : un
 * faux positif là où l'on corrigeait un faux négatif. On s'arrête donc à la
 * première virgule de MÊME niveau — parenthèses, crochets et chaînes suivis —
 * ce qui laisse passer un ternaire (`a ? 'x' : 'y'`) et rien de plus.
 * @param {string} src @param {number} debut @returns {string}
 */
function argumentApres(src, debut) {
  let profondeur = 0;
  for (let i = debut; i < src.length; i += 1) {
    const c = src[i];
    if (c === '\'' || c === '"') {                    // une chaîne : on la saute entière
      const quote = c;
      i += 1;
      while (i < src.length && src[i] !== quote) i += (src[i] === '\\' ? 2 : 1);
      continue;
    }
    if (c === '(' || c === '[' || c === '{') profondeur += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (profondeur === 0) return src.slice(debut, i);
      profondeur -= 1;
    } else if (c === ',' && profondeur === 0) return src.slice(debut, i);
  }
  return src.slice(debut);
}

/**
 * Les ancres DÉCLARÉES dans harness.dart.
 *
 * ⚠️ LA VERSION D'ORIGINE LISAIT LIGNE À LIGNE, et elle accusait le projet.
 * `dart format` replie toute liste qui dépasse 80 colonnes : une déclaration de
 * dix commandes devient onze lignes, et un lecteur ligne à ligne n'en voit
 * AUCUNE. Mesuré sur un projet réel : **27 ancres lues au lieu de 68**, et cinq
 * ancres parfaitement déclarées rapportées « que RIEN ne déclare ». Un garde
 * qui accuse pour un défaut de son propre analyseur est pire qu'aucun garde.
 *
 * On lit donc le fichier ENTIER, et on ne capture que ce qui SUIT chaque clé :
 * soit un littéral (`anchor: 'x'`), soit une liste dont on suit les crochets
 * (`commands: <String>[ … ]`). Capturer jusqu'à la clé suivante serait trop
 * permissif — `ArgusScreen(id: 'home', anchor: …` porte deux chaînes, et
 * compter `'home'` ferait passer pour déclarée une ancre homonyme d'un id.
 * @param {string} root @returns {string[]}
 */
export function declaredAnchors(root) {
  /** @type {Set<string>} */
  const dec = new Set();
  let brut = '';
  try { brut = readFileSync(join(root, 'test/argus/harness.dart'), 'utf8'); } catch { return []; }
  const src = dartSansCommentaires(brut);
  const CLES = /\b(anchor|commands|displays|commandsAfterScroll|displaysAfterScroll)\s*:\s*/g;
  for (const m of src.matchAll(CLES)) {
    const i = m.index + m[0].length;
    if (src[i] === '\'') {
      const fin = src.indexOf('\'', i + 1);
      if (fin > i) dec.add(src.slice(i + 1, fin));
      continue;
    }
    // `<String>[` ou `[` : on suit les crochets pour ne pas déborder sur la clé
    // suivante. Une liste vide (`const <String>[]`) est légale et rend zéro.
    const crochet = src.indexOf('[', i);
    if (crochet < 0 || crochet - i > 24) continue;
    let profondeur = 0;
    let ferme = -1;
    for (let k = crochet; k < src.length; k += 1) {
      if (src[k] === '[') profondeur += 1;
      else if (src[k] === ']') { profondeur -= 1; if (profondeur === 0) { ferme = k; break; } }
    }
    if (ferme < 0) continue;
    for (const lit of src.slice(crochet + 1, ferme).matchAll(/'([^']*)'/g)) {
      if (lit[1] !== '') dec.add(lit[1]);
    }
  }
  return [...dec].sort();
}

/**
 * Les ancres POSÉES que rien ne DÉCLARE — la moitié que `make argus-anchors`
 * ne voyait pas.
 *
 * ⚠️ POINT 219. `anchors_test.dart` monte les écrans déclarés et vérifie que
 * leurs ancres arrivent dans l'arbre : c'est **déclaré → présent**. L'inverse
 * n'existait nulle part, et le skill l'écrivait lui-même — « c'est la moitié de
 * son intérêt ». Une ancre posée que rien ne déclare n'est pas une ancre en
 * échec : c'est une **absence**, donc elle n'apparaît dans aucun relevé.
 *
 * L'échappatoire vit en config et se lit défensivement (`?? []`) : une
 * installation existante n'a pas la clé, et ne doit pas casser pour autant.
 * @param {string} root @param {any} config @returns {string[]}
 */
export function undeclaredAnchors(root, config) {
  const permis = new Set(((config?.anchors ?? {}).allowUndeclared ?? []).map(String));
  const declarees = new Set(declaredAnchors(root));
  return posedAnchors(root, config).filter((a) => !declarees.has(a) && !permis.has(a));
}

/**
 * Le nom que l'application AFFICHE — celui qu'un humain reconnaît.
 *
 * ⚠️ LE SKILL PRESCRIVAIT LA MAUVAISE SOURCE, et son gabarit le disait en
 * toutes lettres : « Nom du paquet Dart (pubspec.yaml → name) ». Ce nom-là est
 * un identifiant technique — `acme_colis`, `focus` — et il se retrouve
 * dans le TITRE de la page publiée, c'est-à-dire dans la seule chose qui
 * distingue deux rapports dans une galerie. Vu par Germinator sur une page
 * publiée : le titre disait « Colis » quand l'app s'appelle
 * « Acme Colis ».
 *
 * Or ce nom existe, il est déclaré, et le harnais ne le lisait nulle part.
 * Quatre sources, dans l'ordre où elles sont sûres :
 *   1. `CFBundleDisplayName` de l'Info.plist iOS — le plus explicite ;
 *   2. `resValue("string", "app_name", …)` d'un build.gradle Android ;
 *   3. `<string name="app_name">` d'un strings.xml ;
 *   4. `android:label="…"` LITTÉRAL du manifeste (jamais `@string/…`, qui est
 *      une indirection : la suivre donnerait le nom de la clé, pas la valeur).
 *
 * Rend '' quand rien n'est trouvé — un projet peut n'avoir aucun nom affiché, et
 * inventer serait pire que se taire.
 * @param {string} root @returns {string}
 */
export function nomAffiche(root) {
  const lire = (rel) => { try { return readFileSync(join(root, rel), 'utf8'); } catch { return ''; } };

  // 1. iOS — la clé est suivie de sa valeur dans le <dict>.
  const plist = lire('ios/Runner/Info.plist');
  const ios = /<key>CFBundleDisplayName<\/key>\s*<string>([^<]*)<\/string>/.exec(plist);
  if (ios && ios[1].trim()) return ios[1].trim();

  // 2. Android — le nom peut être injecté par Gradle plutôt que par une ressource.
  for (const g of ['android/app/build.gradle.kts', 'android/app/build.gradle']) {
    const m = /resValue\(?\s*["']string["']\s*,\s*["']app_name["']\s*,\s*["']([^"']+)["']/.exec(lire(g));
    if (m && m[1].trim()) return m[1].trim();
  }

  // 3. Android — la ressource classique, sur toutes les variantes livrées.
  for (const v of ['main', 'release', 'debug']) {
    const m = /<string name="app_name">([^<]*)<\/string>/.exec(lire(`android/app/src/${v}/res/values/strings.xml`));
    if (m && m[1].trim()) return m[1].trim();
  }

  // 4. Le manifeste, mais seulement s'il porte un LITTÉRAL.
  const label = /android:label="([^"@][^"]*)"/.exec(lire('android/app/src/main/AndroidManifest.xml'));
  if (label && label[1].trim()) return label[1].trim();

  return '';
}

/**
 * Le message dû quand `app.name` porte l'identifiant technique alors que l'app
 * affiche autre chose. Vide sinon.
 *
 * ⚠️ IL NE SORT QUE SI PERSONNE N'A CHOISI. La condition est que `app.name`
 * égale EXACTEMENT le nom du paquet Dart, c'est-à-dire le défaut que
 * l'installeur pose et que nul n'a touché. Dès qu'il vaut autre chose — le nom
 * affiché, ou n'importe quoi d'autre —, c'est une décision et on se tait.
 * Sans cette condition l'avertissement serait INACQUITTABLE, et un
 * avertissement qu'on ne peut pas fermer finit ignoré en emmenant les autres.
 * @param {string} root @param {any} config @returns {string}
 */
export function nomTechniqueEnTitre(root, config) {
  const configure = String(config?.app?.name ?? '').trim();
  if (!configure) return '';
  let paquet = '';
  try {
    paquet = (/^name:\s*(\S+)/m.exec(readFileSync(join(root, 'pubspec.yaml'), 'utf8')) ?? [])[1] ?? '';
  } catch { return ''; }
  if (configure !== paquet) return '';          // quelqu'un a choisi : on se tait
  const affiche = nomAffiche(root);
  if (!affiche || affiche === configure) return '';
  return `app.name vaut « ${configure} » — le nom du paquet Dart. L'application s'affiche `
    + `« ${affiche} », et c'est ce nom-là qui distingue ton rapport des autres dans une `
    + 'galerie : le titre de la page publiée en dérive.';
}

/**
 * Les familles de fichiers dont la PRÉSENCE ne prouve pas l'EMBARQUEMENT.
 *
 * ⚠️ CE N'EST PAS UNE LISTE DE FICHIERS FIREBASE, ET C'EST VOULU. Le cas vécu
 * était un `GoogleService-Info.plist` posé dans les sources et référencé nulle
 * part dans le projet Xcode : jamais copié dans le bundle, l'init lève au
 * lancement, l'app affiche son écran de service indisponible, et les six flows
 * rougissent en accusant l'instrumentation. Six flows, ~36 min d'appareil.
 *
 * Mais coder « si Firebase » reproduirait le défaut que ce dépôt reproche
 * ailleurs : énumérer les défauts CONNUS au lieu de mesurer le PHÉNOMÈNE. Le
 * phénomène est le même pour tous — un fichier posé dans les sources que rien
 * ne câble, donc jamais embarqué, et dont l'absence ne se voit qu'à l'exécution.
 * Seule change la déclaration qui fait l'embarquement.
 *
 * Chaque règle dit donc trois choses, et rien de plus : QUOI chercher sur le
 * disque, QUELLE déclaration le câble, ce qui CASSE sinon. Un projet ajoute les
 * siennes dans `argus.mobile.yaml → configFiles:` — c'est la réponse à « il y a
 * d'autres fichiers de config », qui est vraie et le restera.
 *
 * ⚠️ Ce qui n'est PAS ici est aussi une décision : les assets Flutter
 * ordinaires en sont absents. Un asset manquant lève **bruyamment** au premier
 * usage, donc il se diagnostique tout seul ; l'inclure noierait les trois cas
 * silencieux sous des lignes sans valeur. On ne contrôle que ce qui échoue SANS
 * le dire.
 */
export const CONFIG_FILES = [
  {
    id: 'firebase-ios',
    quoi: 'ios/Runner/GoogleService-Info.plist',
    cable: 'ios/Runner.xcodeproj/project.pbxproj',
    casse: "l'initialisation Firebase lève au lancement : l'app affiche son écran d'erreur "
      + 'et TOUS les flows rougissent en accusant l\'instrumentation',
  },
  {
    id: 'firebase-android',
    quoi: 'android/app/google-services.json',
    cable: ['android/app/build.gradle', 'android/app/build.gradle.kts'],
    motif: 'google-services',
    casse: "le plugin Gradle qui LIT ce fichier n'est pas appliqué : Firebase ne s'initialise pas",
  },
  {
    id: 'polices',
    quoi: { sous: 'assets', extensions: ['.ttf', '.otf'] },
    cable: 'pubspec.yaml',
    casse: 'la police retombe en SILENCE sur celle du système — aucune exception, aucun log, '
      + 'et le texte change de fonte au milieu d\'un mot',
  },
];

/**
 * Les fichiers de configuration présents dans les sources que RIEN ne câble.
 *
 * Le mécanisme est unique et la table est de la donnée : pour chaque règle, le
 * fichier doit exister (sinon il n'y a rien à dire — un projet sans Firebase
 * n'est pas en défaut) ET son nom doit apparaître dans la déclaration qui
 * l'embarque. C'est la présence du fichier qui déclenche, jamais une supposition
 * sur ce que le projet utilise : quelqu'un l'a posé là exprès.
 *
 * @param {string} root @param {any} config @returns {{id:string, fichier:string, cable:string, casse:string}[]}
 */
export function configNonEmbarquee(root, config) {
  const regles = [...CONFIG_FILES, ...(config?.configFiles ?? [])];
  /** @type {{id:string, fichier:string, cable:string, casse:string}[]} */
  const orphelins = [];

  for (const regle of regles) {
    // Où chercher : un chemin exact, ou une famille d'extensions sous un dossier.
    /** @type {string[]} */
    let trouves = [];
    if (typeof regle.quoi === 'string') {
      if (existsSync(join(root, regle.quoi))) trouves = [regle.quoi];
    } else if (regle.quoi && typeof regle.quoi === 'object') {
      // ⚠️ `relative()`, jamais une découpe par LONGUEUR. Avec `root` valant
      // « . » — ce que rend `dirname('argus.mobile.yaml')`, donc le cas par
      // défaut — `join('.', 'assets')` se normalise en « assets » sans le
      // « ./ », et `slice(root.length + 1)` retirait deux vrais caractères :
      // le rapport annonçait « sets/fonts/X.ttf ». Le verdict restait juste (le
      // motif dérive du basename), seul le chemin qu'on va chercher était faux.
      trouves = fichiersSous(join(root, regle.quoi.sous), regle.quoi.extensions ?? [])
        .map((f) => relative(root, f));
    }
    if (trouves.length === 0) continue;

    // Où le câblage se déclare : le premier fichier de la liste qui existe.
    const candidats = Array.isArray(regle.cable) ? regle.cable : [regle.cable];
    const declaration = candidats.find((c) => existsSync(join(root, c)));
    if (!declaration) {
      // ⚠️ Pas de déclaration DU TOUT : on le dit, plutôt que de conclure au
      // câblage. Un projet sans `build.gradle` n'est pas un projet conforme.
      for (const f of trouves) {
        orphelins.push({ id: regle.id, fichier: f, cable: candidats.join(' ou '), casse: regle.casse });
      }
      continue;
    }
    const texte = lireOuVide(join(root, declaration));
    for (const f of trouves) {
      // Le motif est fixe quand la règle en donne un, sinon c'est le NOM du
      // fichier trouvé — c'est ce que porte une déclaration d'asset ou de police.
      const motif = regle.motif ?? f.split('/').pop();
      if (motif && !texte.includes(motif)) {
        orphelins.push({ id: regle.id, fichier: f, cable: declaration, casse: regle.casse });
      }
    }
  }
  return orphelins;
}

/** Les fichiers d'une extension donnée sous un dossier, récursivement. Vide s'il n'existe pas. */
function fichiersSous(dir, extensions) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiersSous(chemin, extensions));
    else if (extensions.some((x) => e.name.toLowerCase().endsWith(x))) out.push(chemin);
  }
  return out;
}

/** Le contenu d'un fichier, ou une chaîne vide s'il est illisible — jamais une exception. */
function lireOuVide(chemin) {
  try { return readFileSync(chemin, 'utf8'); } catch { return ''; }
}

/**
 * Le rapport d'une ancre orpheline — et la distinction que « RIEN » écrasait.
 *
 * ⚠️ « QUE RIEN NE DÉCLARE » ÉTAIT FAUX POUR LA MOITIÉ DES CAS. Le croisement
 * ne lit que `harness.dart`, parce que « déclaré » veut dire ici « monté par
 * l'étage 1 » — une ancre que seul `screens[]` connaît sert au DEVICE et n'est
 * jamais montée sans device. C'est un vrai signal, mais le message le rendait
 * indéchiffrable : un run a lu « RIEN » au pied de la lettre, est allé vérifier
 * `screens[]` où ses deux ancres étaient bel et bien écrites, et a conclu que
 * l'outil se trompait.
 *
 * ⚠️ Et le remède qui vient à l'esprit — faire lire `screens[]` au croisement —
 * est le mauvais : l'ancre passerait le contrôle sans que l'étage 1 la monte
 * jamais, c'est-à-dire en perdant exactement ce que ce contrôle mesure.
 *
 * Extrait pour qu'un garde APPELLE et lise ce qui revient, plutôt que de
 * chercher un texte dans la source.
 * @param {string[]} orphelines @param {any} config @returns {string[]}
 */
export function ancresOrphelinesReport(orphelines, config) {
  const enConfig = new Set((config?.screens ?? [])
    .filter((/** @type {any} */ s) => s && typeof s.anchor === 'string' && s.anchor.trim() !== '')
    .map((/** @type {any} */ s) => String(s.anchor).trim()));
  const connuesDuDevice = orphelines.filter((a) => enConfig.has(a));
  const inconnues = orphelines.filter((a) => !enConfig.has(a));

  const lignes = [`${orphelines.length} ancre(s) posée(s) dans lib/ que test/argus/harness.dart ne déclare pas :`];
  for (const a of inconnues) lignes.push(`    ${a}`);
  for (const a of connuesDuDevice) lignes.push(`    ${a}   ← déclarée dans screens[], mais PAS dans harness.dart`);
  if (connuesDuDevice.length) {
    lignes.push('  ⚠️ `screens[]` ne compte pas comme déclaration ICI : il sert aux flows sur');
    lignes.push('     device, alors que ce contrôle vérifie ce que l\'étage 1 MONTE, sans device.');
    lignes.push('     Les deux listes sont distinctes et doivent l\'être ; une ancre utile aux');
    lignes.push('     deux s\'écrit aux deux endroits.');
  }
  lignes.push('  Une ancre non déclarée n\'est pas en échec — elle est ABSENTE de tout relevé,');
  lignes.push('  donc aucun garde ne dit qu\'elle n\'est pas couverte. Deux issues :');
  lignes.push('    · la déclarer sur son ArgusScreen (commands: / displays: / anchor:) ;');
  lignes.push('    · si elle est hors périmètre exprès, l\'inscrire dans');
  lignes.push('      argus.mobile.yaml → anchors.allowUndeclared, avec la raison à côté.');
  return lignes;
}

/**
 * La plateforme sur laquelle une commande porte quand personne ne l'a dite.
 *
 * ⚠️ LE DÉFAUT ÉTAIT `'android'` EN DUR, aux deux sites qui servent le Makefile
 * — lequel ne passe jamais `--platform`. Un projet déclaré `platforms: [ios]`
 * voyait donc `make argus-build` construire un APK, la preuve de taille porter
 * sur un binaire sans rapport, et le runner installer autre chose que ce qui
 * venait d'être bâti. Rien ne levait : les valeurs iOS existaient et étaient
 * justes, c'est le défaut qui les court-circuitait avant qu'on les atteigne.
 *
 * D'où une fonction plutôt que deux littéraux : elle a une valeur de retour,
 * donc un garde peut l'appeler et lire ce qui revient. Un garde qui lirait la
 * source resterait vert sur une valeur neutralisée.
 *
 * `argv` est vide par défaut pour que l'appelant NON-CLI (une dimension qui
 * veut simplement savoir sur quoi porte le projet) n'hérite pas des arguments
 * du processus par accident.
 * @param {any} config @param {string[]} [argv] @returns {string}
 */
export function platformFor(config, argv = []) {
  const flag = (argv.find((a) => a.startsWith('--platform=')) ?? '').split('=')[1] ?? '';
  return flag || config?.platforms?.[0] || 'android';
}

/**
 * Ce que pèse un paquet, et de quoi il est fait — fichier OU répertoire.
 *
 * ⚠️ UN `.app` EST UN RÉPERTOIRE, et c'est tout le point 214. Le Makefile
 * mesurait par `wc -c` et `shasum`, qui rendent l'un 0 et l'autre une erreur
 * sur un dossier : la garde de fraîcheur affichait donc « 0 → 0 octets » sur
 * chaque build iOS. Elle ne se taisait pas, elle affirmait — et un chiffre qui
 * n'a rien mesuré se lit exactement comme un chiffre qui a mesuré.
 *
 * `kind` existe pour que l'appelant puisse DIRE « absent » au lieu d'imprimer
 * un zéro : c'est la différence entre se taire et mentir.
 * @param {string} chemin
 * @returns {{kind:'absent'|'file'|'dir', bytes:number, digest:string, files:number}}
 */
export function measureBinary(chemin) {
  if (!chemin || !existsSync(chemin)) return { kind: 'absent', bytes: 0, digest: '', files: 0 };
  if (!statSync(chemin).isDirectory()) {
    const buf = readFileSync(chemin);
    return { kind: 'file', bytes: buf.length, digest: createHash('sha256').update(buf).digest('hex'), files: 1 };
  }
  // Un bundle se résume par le hash de SES ENTRÉES, chemin compris et TRIÉES :
  // deux bundles de même taille dont un fichier a bougé doivent différer, et
  // l'ordre de lecture du système de fichiers n'est pas stable.
  /** @type {string[]} */
  const lignes = [];
  let bytes = 0;
  (function marcher(/** @type {string} */ dir, /** @type {string} */ rel) {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const abs = join(dir, e.name);
      const sous = rel ? `${rel}/${e.name}` : e.name;
      // Un lien symbolique se résume par sa CIBLE, jamais suivi : un bundle iOS
      // en porte, et les suivre ferait boucler ou compter deux fois.
      if (e.isSymbolicLink()) { lignes.push(`${sous} @symlink`); continue; }
      if (e.isDirectory()) { marcher(abs, sous); continue; }
      const buf = readFileSync(abs);
      bytes += buf.length;
      lignes.push(`${sous} ${createHash('sha256').update(buf).digest('hex')}`);
    }
  })(chemin, '');
  return {
    kind: 'dir', bytes, files: lignes.length,
    digest: createHash('sha256').update(lignes.join('\n')).digest('hex'),
  };
}

/**
 * L'identité de la page publiée POUR CETTE PLATEFORME — son URL et son titre.
 *
 * ⚠️ IL N'Y EN AVAIT QU'UNE, et un rapport est par plateforme. Un run iOS
 * republiait donc par-dessus le rapport Android, qui disparaissait : la page
 * disait bien « ios », mais les résultats Android n'existaient plus nulle part.
 * L'unité de la page et l'unité du rapport ne coïncidaient pas.
 *
 * ⚠️ Fusionner les deux plateformes dans UNE page aurait demandé d'y afficher un
 * run d'une autre date à côté du courant, les deux ayant l'air frais — le piège
 * du relevé périmé que ce harnais traque ailleurs. Une page par plateforme est
 * honnête par construction : elle décrit un run, un seul.
 *
 * Les deux formes se lisent, et l'ancienne continue de marcher. En YAML — la
 * seule forme que le sous-ensemble accepte, les maps en flow étant refusées :
 *   artifact:
 *     url: 'https://…'          ← mono-plateforme
 *   artifact:
 *     url:
 *       ios: 'https://…'
 *       android: '…'
 * @param {any} config @param {string} platform @returns {{url:string, title:string}}
 */
export function artifactFor(config, platform) {
  const a = config?.artifact ?? {};
  const choisir = (/** @type {any} */ v) => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') return String(v[platform] ?? '');
    return '';
  };
  return { url: choisir(a.url), title: choisir(a.title) };
}

/**
 * La commande de build que le projet déclare pour cette plateforme.
 *
 * Extraite parce qu'elle était recopiée trois fois — `--print-build-cmd`, le
 * message d'installation du runner, et la dérivation de release. C'est le motif
 * du VOISIN : trois copies qui divergent une par une, et celle qu'on oublie est
 * celle qui compte.
 * @param {any} config @param {string} platform @returns {string}
 */
export function projectBuildCmd(config, platform) {
  const b = config?.build ?? {};
  return String((platform === 'ios' ? b.iosBuildCmd : b.androidBuildCmd) ?? '').trim();
}

/**
 * La commande qui produit le binaire de PUBLICATION, dérivée de celle du projet.
 *
 * ⚠️ ELLE MANQUAIT, et son absence coûtait deux choses. Le harnais sait
 * construire ce qu'il PILOTE (`androidBuildCmd`, un debug) et rien d'autre :
 * quand une dimension réclamait la release — pour la peser ou la scanner —, le
 * seul geste qu'elle savait proposer était celui du debug, c'est-à-dire une
 * commande qui ne produirait jamais le fichier attendu. Le message avait toutes
 * les apparences d'une consigne juste.
 *
 * Dérivée plutôt qu'écrite en dur : un projet qui cible une ABI, un flavor ou
 * un `--dart-define` garde tout cela, seul le mode change. Le repli ne sert
 * qu'au projet qui n'a rien déclaré.
 *
 * ⚠️ ELLE NE LISAIT QUE LES CLÉS ANDROID (point 215), repli littéral compris :
 * sur un projet iOS, la seule chose qu'elle savait conseiller était
 * `flutter build apk --release`. Suivie, elle produit un APK et laisse la
 * mesure iOS toujours absente — une consigne qui s'exécute sans erreur, donc
 * qui a toutes les apparences d'une consigne juste. C'est la forme exacte du
 * défaut que ce dartdoc décrivait déjà, revenue par l'autre plateforme.
 *
 * ⚠️ Et `--simulator` SAUTE. Un `.app` de simulateur ne se publie pas : le
 * garder ferait de cette fonction une prescription qui ne peut pas tenir sa
 * promesse, ce qui est pire que ne rien prescrire.
 * @param {any} config @param {boolean} [pinned] @param {string} [platform] @returns {string}
 */
export function releaseBuildCmd(config, pinned = usesFvm(), platform = '') {
  const cible = platform || platformFor(config);
  const repli = cible === 'ios' ? 'flutter build ios --release' : 'flutter build apk --release';
  const derive = projectBuildCmd(config, cible)
    .replace(/--(debug|profile)\b/g, '--release')
    .replace(/\s--simulator\b/g, '');
  return flutterCommandIn(derive.includes('--release') ? derive : repli, pinned);
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
  unzip: { probe: ['-v'], why: 'lecture du contenu de l\'APK', install: 'présent par défaut sur macOS et Linux ; sur Windows, via Git Bash ou WSL' },
};

/**
 * Racines plausibles du SDK Android, dans l'ordre où on les essaie.
 * @returns {string[]}
 */
function androidSdkRoots() {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  return [
    process.env.ANDROID_HOME ?? '',
    process.env.ANDROID_SDK_ROOT ?? '',
    home ? resolve(home, 'Library/Android/sdk') : '',   // macOS
    home ? resolve(home, 'Android/Sdk') : '',           // Linux
    process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Android/Sdk') : '',
  ].filter(Boolean);
}

/**
 * Classe les dossiers de Build-Tools, du meilleur au pire.
 *
 * ⚠️ `sort()` est ALPHABÉTIQUE, et sur des versions il ment deux fois : il place
 * « 9.0.0 » après « 35.0.0 », et il préfère « 37.0.0-rc2 » à « 35.0.0 » stable.
 * Mesuré en écrivant ce correctif — la première version choisissait bien la RC.
 *
 * Une STABLE l'emporte donc toujours sur une préversion, même plus récente : cet
 * outil établit un fait de sécurité (les permissions du manifeste fusionné), et
 * sur ce terrain la prévisibilité vaut mieux que la nouveauté — une RC peut être
 * retirée ou changer d'avis. À défaut de stable, la préversion sert quand même :
 * mieux vaut une RC que la dimension sautée.
 * @param {string[]} versions @returns {string[]}
 */
export function rankBuildTools(versions) {
  /** @param {string} v */
  const cle = (v) => ({
    parts: v.split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0),
    pre: v.includes('-'),
  });
  return [...versions].sort((a, b) => {
    const [x, y] = [cle(a), cle(b)];
    if (x.pre !== y.pre) return x.pre ? 1 : -1;   // toute stable avant toute préversion
    for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i += 1) {
      const d = (y.parts[i] ?? 0) - (x.parts[i] ?? 0);
      if (d !== 0) return d;
    }
    return a < b ? 1 : -1;
  });
}

/**
 * Le chemin d'un outil : le PATH d'abord, puis là où le SDK Android le range.
 *
 * ⚠️ `aapt2` et `apkanalyzer` existent sur TOUTE machine ayant les Build-Tools
 * ou les Command-line Tools — ils n'y sont simplement pas exposés. Les traiter
 * en binaire présent/absent faisait sauter la moitié de la dimension sécurité
 * pour une variable d'environnement : mesuré au run 9, un `export PATH=…` la
 * débloquait entièrement (142 entrées lues, obfuscation confirmée).
 *
 * Rend le nom nu si rien n'est trouvé : l'appelant obtient alors l'ENOENT
 * habituel, et le message d'outil absent reste celui qu'on connaît.
 * @param {string} name @returns {string}
 */
export function toolPath(name) {
  if (!['aapt2', 'apkanalyzer'].includes(name)) return name;
  for (const root of androidSdkRoots()) {
    // Build-Tools : une version par dossier, on prend la plus récente.
    if (name === 'aapt2') {
      const dir = join(root, 'build-tools');
      let versions = [];
      try { versions = rankBuildTools(readdirSync(dir)); } catch { versions = []; }
      for (const v of versions) {
        const p = join(dir, v, IS_WINDOWS ? 'aapt2.exe' : 'aapt2');
        if (existsSync(p)) return p;
      }
    } else {
      for (const rel of ['cmdline-tools/latest/bin', 'cmdline-tools/bin', 'tools/bin']) {
        const p = join(root, rel, IS_WINDOWS ? 'apkanalyzer.bat' : 'apkanalyzer');
        if (existsSync(p)) return p;
      }
    }
  }
  return name;
}

/**
 * Un relevé de sonde prouve-t-il la PRÉSENCE de l'outil ?
 *
 * `apkanalyzer -h` sort en code non nul tout en prouvant qu'il est là :
 * l'absence se reconnaît donc à l'erreur de spawn (ENOENT), pas au status.
 *
 * ⚠️ SAUF QUAND UN SHELL S'INTERPOSE, ET IL S'EN INTERPOSE UN. `sh()` passe par
 * le shell sur Windows — `shell: IS_WINDOWS`, nécessaire pour `aapt2.exe` et
 * `apkanalyzer.bat` — et un shell n'échoue PAS au spawn sur une commande
 * inconnue : il démarre, ne trouve rien, et rend 127 (POSIX) ou 9009 (cmd.exe).
 * `error` reste nul. Le critère déclarait donc TOUS les outils présents, et la
 * panne arrivait plus loin, sur un message qui ne la nomme pas.
 *
 * Le défaut n'appartient pas à Windows, il appartient au shell : il se
 * reproduit partout en passant `shell: true`, et c'est ce qui permet de le
 * garder ici plutôt que de le documenter comme une limite.
 *
 * Les deux moitiés comptent : un outil ABSENT reste absent derrière un shell,
 * et un outil PRÉSENT qui sort en code non nul reste présent — exiger
 * `status === 0` ferait sauter la dimension pour `apkanalyzer`.
 * @param {{error:string|null, status:number}} res @returns {boolean}
 */
export function outilPresent(res) {
  if (res?.error !== null) return false;
  return res.status !== 127 && res.status !== 9009;
}

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
    // Le SDK du PROJET, pas celui du PATH — sinon on rapporte la version d'un
    // Flutter avec lequel rien ne se construit ici.
    const res = name === 'flutter' && usesFvm()
      ? sh('fvm', ['flutter', ...spec.probe])
      : sh(toolPath(name), spec.probe);
    const present = outilPresent(res);
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
 * Nom d'AVD extrait de la sortie d'`adb emu avd name`.
 *
 * ⚠️ Cette commande rend DEUX lignes : le nom, puis un « OK » de la console
 * émulateur. Prendre la première ligne donne le nom ; prendre la dernière, ou
 * trimmer le tout, donne « OK » — un nom d'AVD qui ne correspondra à rien et
 * fera échouer la résolution en désignant un coupable inexistant.
 *
 * ⚠️ Vit ici, et non dans le runner qui l'employait seul : trois autres scripts
 * en avaient besoin pour cesser de cibler le premier port venu. Extraite, pas
 * recopiée — c'est la seule forme qui ne diverge pas.
 * @param {string} stdout @returns {string}
 */
export function avdNameFrom(stdout) {
  return String(stdout).split('\n').map((l) => l.trim()).find((l) => l !== '' && l !== 'OK') ?? '';
}

/**
 * L'AVD que la configuration DÉCLARE pour Android, ou '' si elle n'en nomme
 * aucun. Premier device android portant un `avd` : c'est la même règle de
 * priorité que le runner applique (`avd` avant `udid`).
 * @param {any} config @returns {string}
 */
export function androidAvdDeclared(config) {
  const devices = config?.devices ?? [];
  const spec = devices.find((/** @type {any} */ d) => (d?.platform ?? 'android') === 'android' && d?.avd);
  return spec?.avd ?? '';
}

/**
 * Device Android à cibler par défaut : un ÉMULATEUR, jamais un téléphone.
 *
 * Prendre le premier de `adb devices` reviendrait à lancer, arrêter et sonder
 * une app sur l'appareil personnel de quelqu'un simplement parce qu'il était
 * branché. Un appareil réel doit être nommé explicitement par `--device`.
 *
 * ⚠️ ET JAMAIS « LE PREMIER ÉMULATEUR » NON PLUS quand la config nomme un AVD.
 * Ce raisonnement n'était fait qu'à moitié : il écartait les appareils réels et
 * laissait passer le second émulateur. `device-matrix.md` promet pourtant en
 * titre que l'on désigne un device par son `avd` et non par son `udid` — seul
 * `run.mjs` tenait cette promesse, ses trois voisins prenaient le premier port
 * venu. Mesuré au dix-septième run, avec deux émulateurs branchés : `perf.mjs`
 * a ciblé l'appareil d'un AUTRE projet. Il n'a crié que parce que l'app n'y
 * était pas installée ; installée des deux côtés, il aurait mesuré le mauvais
 * appareil **en silence**, et le rapport aurait porté ses chiffres.
 * @param {any} config la configuration chargée, pour lire `devices[].avd`
 * @returns {{udid:string, why:string}}
 */
export function defaultAndroidDevice(config = null) {
  const res = sh('adb', ['devices']);
  const listed = res.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => parts[0]);

  // L'AVD déclaré gagne, et son absence est un REFUS — jamais un repli sur le
  // premier venu, qui est précisément le défaut qu'on ferme ici.
  const voulu = androidAvdDeclared(config);
  if (voulu) {
    const emus = listed.filter((udid) => udid.startsWith('emulator-'));
    const avdDe = (/** @type {string} */ udid) => avdNameFrom(sh('adb', ['-s', udid, 'emu', 'avd', 'name']).stdout);
    const trouve = emus.find((udid) => avdDe(udid) === voulu);
    if (trouve) return { udid: trouve, why: '' };
    const vus = emus.map((udid) => `${avdDe(udid) || '?'} (${udid})`).join(', ');
    return {
      udid: '',
      why: `l'AVD « ${voulu} », déclaré dans devices[], n'est pas démarré. `
        + (emus.length ? `Émulateurs trouvés : ${vus}. ` : 'Aucun émulateur Android n\'est démarré. ')
        + `Démarre-le (emulator -avd ${voulu}), ou passe --device=<udid> en connaissance de cause — `
        + 'ne pas le faire ferait mesurer un autre appareil sans que rien ne le signale.',
    };
  }

  const emulator = listed.find((udid) => udid.startsWith('emulator-'));
  if (emulator) return { udid: emulator, why: '' };
  if (listed.length > 0) {
    return {
      udid: '',
      why: `aucun émulateur branché — seuls des appareils réels le sont (${listed.join(', ')}). `
        + 'Argus ne les cible jamais par défaut : démarre un émulateur, ou passe --device=<udid> en connaissance de cause.',
    };
  }
  return { udid: '', why: 'aucun device Android connecté (adb devices).' };
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

/**
 * Les cycles d'appels entre flows Maestro.
 *
 * ⚠️ POURQUOI CETTE FONCTION EXISTE. `maestro check-syntax` valide un fichier
 * À LA FOIS : un sous-flow qui s'appelle lui-même passe, et `argus-lint`, qui
 * boucle exactement ainsi, imprime « ✔ tous les flows parsent ». Puis Maestro
 * rejette le WORKSPACE ENTIER au démarrage — `Parsing Failed at …/goto.yaml` —
 * donc rien ne s'exécute, aucune étape n'est fautive, et le runner ne peut
 * rapporter qu'un « échec sans étape fautive identifiée ». On cherche alors dans
 * le dernier flow lancé, pas dans le sous-flow coupable.
 *
 * Reproduit sur un workspace jetable de deux fichiers : `check-syntax` rend `OK`
 * sur les deux, dont celui qui s'appelle lui-même.
 *
 * @param {Record<string,string>} flows chemin relatif au workspace → contenu
 * @returns {string[][]} un tableau par cycle, du premier fichier au retour
 */
export function flowCycles(flows) {
  const dirOf = (/** @type {string} */ f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '');
  const norm = (/** @type {string} */ base, /** @type {string} */ cible) => {
    const parts = (base ? `${base}/${cible}` : cible).split('/');
    /** @type {string[]} */
    const out = [];
    for (const seg of parts) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return out.join('/');
  };
  /** @type {Record<string,string[]>} */
  const graphe = {};
  for (const [nom, texte] of Object.entries(flows ?? {})) {
    // ⚠️ Les commentaires d'abord : le gabarit livré porte des exemples
    // commentés, et un graphe qui les lit invente des arêtes qui n'existent pas.
    const utile = String(texte ?? '').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    const cibles = [
      ...[...utile.matchAll(/runFlow:\s*([^\s#{][^\s#]*\.ya?ml)/g)].map((m) => m[1]),
      ...[...utile.matchAll(/runFlow:[\s\S]{0,120}?file:\s*([^\s#]+\.ya?ml)/g)].map((m) => m[1]),
    ];
    graphe[nom] = [...new Set(cibles.map((c) => norm(dirOf(nom), c)))];
  }
  /** @type {string[][]} */
  const cycles = [];
  const vus = new Set();
  const explore = (/** @type {string} */ n, /** @type {string[]} */ chemin) => {
    const i = chemin.indexOf(n);
    if (i !== -1) {
      const cycle = [...chemin.slice(i), n];
      // ⚠️ La clé porte sur l'ENSEMBLE des fichiers du cycle, jamais sur la
      // liste : le même cycle parcouru depuis deux points de départ donne deux
      // listes différentes (`a→b→a` et `b→a→b`) et serait rapporté deux fois.
      const cle = [...new Set(cycle)].sort().join('>');
      if (!vus.has(cle)) { vus.add(cle); cycles.push(cycle); }
      return;
    }
    for (const suiv of graphe[n] ?? []) explore(suiv, [...chemin, n]);
  };
  for (const nom of Object.keys(graphe)) explore(nom, []);
  return cycles;
}

/**
 * Les `runFlow:` qui désignent un fichier absent du workspace.
 *
 * Rend des couples `[flow appelant, cible manquante]`. Séparé de [flowCycles]
 * parce que ce sont deux défauts distincts : l'un rejette le workspace entier au
 * démarrage, l'autre échoue à l'étape, sur device, après avoir payé le run.
 * @param {Record<string,string>} flows @returns {Array<[string,string]>}
 */
export function flowsIntrouvables(flows) {
  const noms = new Set(Object.keys(flows ?? {}));
  const dirOf = (/** @type {string} */ f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '');
  const norm = (/** @type {string} */ base, /** @type {string} */ cible) => {
    /** @type {string[]} */
    const out = [];
    for (const seg of (base ? `${base}/${cible}` : cible).split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return out.join('/');
  };
  /** @type {Array<[string,string]>} */
  const manquants = [];
  for (const [nom, texte] of Object.entries(flows ?? {})) {
    // Les commentaires d'abord : le gabarit livré porte des exemples commentés.
    const utile = String(texte ?? '').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    const cibles = [
      ...[...utile.matchAll(/runFlow:\s*([^\s#{][^\s#]*\.ya?ml)/g)].map((m) => m[1]),
      ...[...utile.matchAll(/runFlow:[\s\S]{0,120}?file:\s*([^\s#]+\.ya?ml)/g)].map((m) => m[1]),
    ];
    for (const cible of new Set(cibles)) {
      if (!noms.has(norm(dirOf(nom), cible))) manquants.push([nom, cible]);
    }
  }
  return manquants;
}

function main() {
  // ⚠️ AVANT `loadConfig()`, à dessein : le graphe d'appels ne dépend d'aucune
  // config, et l'y coupler faisait échouer le contrôle sur « argus.mobile.yaml
  // introuvable » — dans un workspace jetable, c'est-à-dire précisément là où on
  // veut l'éprouver. Un contrôle qu'on ne peut pas voir dire NON n'a rien prouvé.
  // ── `--check-flows` : le graphe d'appels, que check-syntax ne résout pas. ──
  if (process.argv.slice(2).includes('--check-flows')) {
    const racine = resolve(process.cwd(), '.maestro');
    /** @type {Record<string,string>} */
    const flows = {};
    const lire = (/** @type {string} */ dir, /** @type {string} */ prefixe) => {
      if (!existsSync(dir)) return;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) lire(join(dir, e.name), `${prefixe}${e.name}/`);
        else if (/\.ya?ml$/.test(e.name) && e.name !== 'config.yaml') {
          flows[`${prefixe}${e.name}`] = readFileSync(join(dir, e.name), 'utf8');
        }
      }
    };
    lire(racine, '');
    const n = Object.keys(flows).length;
    if (n === 0) {
      err('aucun flow lu sous .maestro/ — le contrôle du graphe n\'a rien mesuré.');
      process.exit(2);
    }
    // ⚠️ UN `runFlow:` VERS UN FICHIER ABSENT ne se signalait nulle part :
    // `check-syntax` valide un fichier à la fois et ne résout pas le graphe,
    // et ce contrôle-ci traitait la cible manquante comme un nœud sans arête
    // (`graphe[n] ?? []`). L'échec n'arrivait donc que sur device.
    const manquants = flowsIntrouvables(flows);
    for (const [depuis, cible] of manquants) {
      err(`${depuis} appelle « ${cible} », qui n'existe pas sous .maestro/`);
    }
    if (manquants.length) {
      err('  Maestro ne le dira qu\'au lancement, sur device. Corrige le chemin — il est');
      err('  relatif au dossier du flow appelant, pas à la racine du workspace.');
      process.exit(1);
    }
    const cycles = flowCycles(flows);
    for (const c of cycles) err(`cycle d'appels entre flows : ${c.join(' → ')}`);
    if (cycles.length) {
      err('  Maestro rejette le workspace ENTIER au démarrage sur un cycle, donc aucune étape');
      err('  ne sera fautive et l\'échec accusera le dernier flow lancé. `check-syntax` ne le voit');
      err('  pas : il valide un fichier à la fois et ne résout pas le graphe.');
      process.exit(1);
    }
    log(`✔ ${n} flows, aucun cycle d'appels`);
    process.exit(0);
  }

  let config;
  try {
    config = loadConfig();
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
    return;
  }

  // ── `--print-build-cmd` : la commande que la CONFIG porte, résolue. ───────
  //
  // ⚠️ Elle existe parce que la valeur configurée et la valeur exécutée
  // n'étaient pas la même : `argus.mobile.yaml` portait `androidBuildCmd`,
  // que les scripts de mesure AFFICHENT quand le binaire manque, pendant que
  // `make argus-build` lançait sa propre ligne, écrite en dur et jamais
  // ciblée. Un projet qui configurait la première reconstruisait la seconde —
  // et sur un `/data` plein, c'est exactement l'APK gras qui vient d'être
  // refusé à l'installation.
  //
  // Le ciblage d'ABI est appliqué ici, une seule fois, avec la même fonction
  // que le runner emploie pour PROPOSER la commande. Sans device branché,
  // `deviceAbi('')` rend '' et la commande sort inchangée : la dégradation
  // est silencieuse parce qu'elle est correcte, pas parce qu'elle est cachée.
  const printCmd = process.argv.slice(2).find((a) => a === '--print-build-cmd');
  if (printCmd) {
    const arg = (/** @type {string} */ name) =>
      (process.argv.slice(2).find((a) => a.startsWith(`${name}=`)) ?? '').split('=')[1] ?? '';
    const platform = platformFor(config, process.argv.slice(2));
    const brute = projectBuildCmd(config, platform);
    const udid = arg('--device') || (platform === 'android' ? defaultAndroidDevice(config).udid : '');
    const ciblee = platform === 'ios' ? brute : buildCmdForAbi(brute, deviceAbi(udid));
    console.log(flutterCommand(ciblee));
    return;
  }

  // Le chemin du binaire que cette commande produit — pour que l'appelant
  // puisse MESURER le paquet avant et après, au lieu de croire « ✓ Built ».
  if (process.argv.slice(2).includes('--print-binary')) {
    const platform = platformFor(config, process.argv.slice(2));
    console.log(platform === 'ios' ? config.build.ios : config.build.android);
    return;
  }

  // ── `--print-platforms` : ce que le projet déclare, pour la CI. ──────────
  //
  // La CI livrée porte deux jobs qui n'ont de sens que sur Android (build APK,
  // émulateur) et un qui tourne partout (l'étage 1). Sur un projet iOS-seul,
  // les deux premiers ne pouvaient que rougir (point 230). Ils se conditionnent
  // désormais à cette sortie — le workflow INTERROGE la config au lieu d'y
  // grepper, pour que le geste outillé et le geste configuré ne divergent pas.
  if (process.argv.slice(2).includes('--print-platforms')) {
    console.log((config.platforms ?? []).join(' '));
    return;
  }

  // ── `--check-anchors` : les ancres POSÉES que rien ne DÉCLARE. ───────────
  //
  // La moitié manquante de `make argus-anchors`, qui ne prouvait que
  // déclaré → présent (point 219). Sort en 1 pour que la cible échoue : une
  // ancre non déclarée est une absence, donc rien d'autre ne la signale.
  if (process.argv.slice(2).includes('--check-anchors')) {
    // ⚠️ RIEN LU, RIEN À CONCLURE — et ce garde manquait ici alors que son
    // voisin `--check-flows` le porte depuis toujours, quatre-vingts lignes plus
    // haut. Sans `lib/` (monorepo, mauvais répertoire courant), la liste des
    // ancres posées est vide, aucune orpheline n'apparaît, et le contrôle
    // rendait `✔ toute ancre posée est déclarée (0 lue)` avec un exit 0. Le
    // compte était honnête ; c'est la pastille verte devant qui se lit.
    const lues = posedAnchors(process.cwd(), config);
    if ((lues.fichiers ?? 0) === 0) {
      err('aucun fichier .dart lu sous lib/ — le contrôle des ancres n\'a rien mesuré.');
      err(`  Cherché dans : ${join(process.cwd(), 'lib')}`);
      err('  Lance-le à la racine du projet Flutter. Sur un monorepo, c\'est le dossier');
      err('  qui porte pubspec.yaml et lib/, pas celui qui les contient.');
      process.exit(2);
    }
    const orphelines = undeclaredAnchors(process.cwd(), config);
    if (orphelines.length === 0) {
      // ⚠️ LE COMPTE SEUL A DÉJÀ MENTI. « 54 littérales » était exact et taisait
      // qu'il en manquait cinq, invisibles au motif d'alors. On dit donc aussi
      // ce qu'on n'a PAS pu lire : un endroit où la clé est là sans littéral
      // analysable n'est pas une absence d'ancre, c'est une absence de mesure.
      const vues = posedAnchors(process.cwd(), config);
      log(`✔ toute ancre posée dans lib/ est déclarée (${vues.length} lue(s))`);
      for (const o of vues.opaques ?? []) {
        warn(`  ancre NON LISIBLE, donc non vérifiée : ${o}`);
      }
      if ((vues.opaques ?? []).length) {
        warn('  Une ancre calculée à l\'exécution ne peut pas être confrontée à une déclaration.');
        warn('  Rends-la littérale, ou inscris-la dans anchors.allowUndeclared avec sa raison.');
      }
      // ⚠️ LES GABARITS SE DISENT, MAIS SANS ALARME : ce sont des familles que
      // le §2c prescrit, développées dans `harness.dart`. Les ranger avec les
      // opaques poussait à les inscrire en `allowUndeclared`, c'est-à-dire à
      // écrire « hors périmètre » sur des ancres bel et bien vérifiées.
      for (const f of vues.familles ?? []) {
        log(`  famille d'ancres (développée dans harness.dart) : ${f}`);
      }
      return;
    }
    for (const ligne of ancresOrphelinesReport(orphelines, config)) err(ligne);
    process.exit(1);
  }

  // ── `--measure-binary` : ce que pèse le paquet, fichier OU répertoire. ────
  //
  // ⚠️ Le Makefile mesurait lui-même, par `wc -c` et `shasum`. Les deux
  // échouent sur un `.app`, qui est un RÉPERTOIRE : la garde de fraîcheur
  // annonçait « 0 → 0 octets » à chaque build iOS (point 214). La mesure vit
  // donc ici, où un garde peut l'appeler et lire ce qu'elle rend — le Makefile
  // l'INTERROGE au lieu de la recopier, pour que le geste outillé et le geste
  // mesuré ne puissent plus diverger.
  //
  // Une ligne, trois champs séparés par des tabulations : `kind`, `bytes`,
  // `digest`. `kind=absent` existe pour que l'appelant puisse DIRE qu'il n'y a
  // rien, au lieu d'imprimer un zéro qui se lit comme une mesure.
  if (process.argv.slice(2).includes('--measure-binary')) {
    const platform = platformFor(config, process.argv.slice(2));
    const chemin = platform === 'ios' ? config.build.ios : config.build.android;
    const m = measureBinary(resolve(process.cwd(), String(chemin ?? '')));
    console.log([m.kind, m.bytes, m.digest].join('\t'));
    return;
  }

  log(`config lue : ${config.__file}`);
  console.log(JSON.stringify({ ...config, __file: undefined }, null, 2));

  const problems = validateConfig(config);
  for (const p of problems) (p.level === 'error' ? err : warn)(p.message);

  // ⚠️ ICI, PAS SEULEMENT DANS LE RAPPORT. Un fichier de configuration non
  // embarqué fait échouer TOUS les flows au lancement ; le dire au §3d — la
  // commande de vérification préalable — coûte quelques millisecondes et
  // épargne une passe device entière. Le rapport le porte aussi (dimension
  // `configuration` de sec.json), mais il arrive après.
  // ⚠️ LE TITRE D'UNE PAGE PUBLIÉE EST CE QUI LA DISTINGUE. Vu par Germinator
  // sur une page en ligne : le titre disait « Colis » là où l'app s'appelle
  // « Acme Colis » — le nom du paquet Dart au lieu du nom affiché.
  const nomTech = nomTechniqueEnTitre(dirname(config.__file), config);
  if (nomTech) warn(nomTech);

  const orphelins = configNonEmbarquee(dirname(config.__file), config);
  if (orphelins.length) {
    console.log('\nConfiguration présente mais NON EMBARQUÉE :');
    for (const o of orphelins) {
      console.log(`  ✖ ${o.fichier}`);
      console.log(`      son nom n'apparaît pas dans ${o.cable} — il ne sera pas embarqué.`);
      console.log(`      Sinon : ${o.casse}.`);
    }
  }

  console.log('\nOutillage :');
  const tools = detectTools();
  for (const [name, info] of Object.entries(tools)) {
    console.log(info.present ? `  ✔ ${name.padEnd(12)} ${info.version ?? ''}` : `  ○ ${name.padEnd(12)} absent — ${TOOLS[name].install}`);
  }
  process.exitCode = problems.some((p) => p.level === 'error') ? 2 : 0;
}

// ⚠️ `realpathSync` DES DEUX CÔTÉS. `resolve()` normalise sans résoudre les
// liens symboliques, or `import.meta.url` porte le chemin RÉEL : lancé par un
// chemin qui traverse un lien (sur macOS, `$TMPDIR` et `/tmp` en sont),
// le script ne se reconnaît pas, `main()` n'est jamais appelé — pas de sortie,
// pas d'erreur, exit 0. Mesuré : `node scripts/argus/perf.mjs` mesure,
// `node /var/folders/…/perf.mjs` ne fait rien et rend 0.
const invokedDirectly = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) main();
