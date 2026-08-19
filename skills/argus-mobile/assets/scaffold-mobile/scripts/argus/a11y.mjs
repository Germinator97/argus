#!/usr/bin/env node
// @ts-check
/**
 * Argus Mobile — accessibilité mesurée sur device
 * ------------------------------------------------------------------------
 * Taille des cibles tactiles et présence des labels, sur l'écran actuellement
 * affiché. Écrit argus-mobile-report/a11y.json.
 *
 * POURQUOI CE SCRIPT EXISTE : les sélecteurs `width` / `height` de Maestro sont
 * des ÉGALITÉS en pixels, avec une `tolerance`. « ≥ 48 dp » ne s'écrit pas dans
 * un flow. La mesure se fait donc hors flow, en croisant le dump d'accessibilité
 * (`uiautomator dump`) avec la densité du device (`wm density`) — les bounds
 * sont en pixels, les seuils d'accessibilité en dp.
 *
 * CE QU'IL NE REMPLACE PAS : test/argus/a11y_test.dart, qui couvre les mêmes
 * règles via `meetsGuideline(androidTapTargetGuideline)` et
 * `meetsGuideline(textContrastGuideline)`, sans device et à chaque PR. Ce script
 * mesure le RENDU RÉEL sur un device donné ; le test Dart mesure la RÈGLE.
 * Les deux se trompent différemment, d'où l'intérêt d'avoir les deux.
 *
 * Android uniquement : iOS n'expose pas d'équivalent de `uiautomator dump` à un
 * outil externe. Le volet iOS est rapporté `skipped`, jamais vert.
 *
 * Usage :
 *   node scripts/argus/a11y.mjs
 *   node scripts/argus/a11y.mjs --screen=home --device=<udid>
 */

import { join } from 'node:path';
import process from 'node:process';

import {
  artifactsDir, defaultAndroidDevice, detectTools, err, exitCodeFor, loadConfig, log,
  missingToolMessage, sh, warn, writeJson,
} from './config.mjs';

const DUMP_PATH = '/sdcard/argus-a11y-dump.xml';
/** Densité de référence Android : 1 dp = 1 px à 160 dpi. */
const BASELINE_DPI = 160;

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = { device: '', screen: 'écran courant', platform: '' };
  for (const arg of argv) {
    const [key, value] = arg.split('=');
    if (key === '--device') opts.device = value ?? '';
    else if (key === '--screen') opts.screen = value ?? '';
    else if (key === '--platform') opts.platform = value ?? '';
    else if (key === '--help' || key === '-h') {
      console.log('Argus Mobile — a11y\n  --device=<udid>\n  --screen=<id>   étiquette de l\'écran mesuré\n  --platform=android|ios');
      process.exit(0);
    } else { err(`option inconnue : ${arg}`); process.exit(2); }
  }
  return opts;
}

/** @param {string} udid @param {string[]} args */
const adb = (udid, args) => sh('adb', udid ? ['-s', udid, ...args] : args);

/**
 * Densité effective, en dpi. « Override density » l'emporte quand elle existe :
 * c'est ce que le device applique réellement, et lire la physique donnerait des
 * dp faux sur tout appareil dont l'utilisateur a changé la taille d'affichage.
 * @param {string} udid @returns {number|null}
 */
function deviceDensity(udid) {
  const res = adb(udid, ['shell', 'wm', 'density']);
  const override = /Override density:\s*(\d+)/.exec(res.stdout);
  const physical = /Physical density:\s*(\d+)/.exec(res.stdout);
  const value = override ?? physical;
  return value ? Number.parseInt(value[1], 10) : null;
}

/**
 * Dump de l'arbre d'accessibilité de l'écran affiché.
 * @param {string} udid @returns {{xml:string|null, reason:string}}
 */
function dumpHierarchy(udid) {
  const dumped = adb(udid, ['shell', 'uiautomator', 'dump', DUMP_PATH]);
  const output = `${dumped.stdout}${dumped.stderr}`;
  if (/ERROR|could not get idle state/i.test(output)) {
    return { xml: null, reason: `uiautomator n'a pas obtenu d'état stable : ${output.trim().split('\n')[0]}` };
  }
  const xml = adb(udid, ['shell', 'cat', DUMP_PATH]).stdout;
  adb(udid, ['shell', 'rm', '-f', DUMP_PATH]);
  if (!xml.includes('<hierarchy')) return { xml: null, reason: 'dump illisible ou vide' };
  return { xml, reason: '' };
}

/**
 * Extrait les nœuds du dump. Le XML d'uiautomator est plat et régulier (une
 * balise `node` par élément, attributs sans imbrication) : une extraction par
 * expression régulière est suffisante et évite une dépendance XML.
 * @param {string} xml
 * @returns {Array<Record<string,string>>}
 */
function parseNodes(xml) {
  /** @type {Array<Record<string,string>>} */
  const nodes = [];
  for (const match of xml.matchAll(/<node\s([^>]*?)\/?>/g)) {
    /** @type {Record<string,string>} */
    const attrs = {};
    for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
    nodes.push(attrs);
  }
  return nodes;
}

/**
 * `bounds="[x1,y1][x2,y2]"` → dimensions en pixels.
 * @param {string} bounds @returns {{width:number, height:number}|null}
 */
function boundsSize(bounds) {
  const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(bounds ?? '');
  if (!m) return null;
  return { width: Number(m[3]) - Number(m[1]), height: Number(m[4]) - Number(m[2]) };
}

/**
 * Analyse les éléments interactifs de l'écran.
 * @param {Array<Record<string,string>>} nodes @param {number} dpi @param {number} minDp
 */
function analyse(nodes, dpi, minDp) {
  const toDp = (/** @type {number} */ px) => Math.round((px * BASELINE_DPI) / dpi);
  const interactive = nodes.filter((n) => n.clickable === 'true' && n.enabled !== 'false');
  const tooSmall = [];
  const unlabeled = [];
  for (const node of interactive) {
    const size = boundsSize(node.bounds);
    if (!size) continue;
    const widthDp = toDp(size.width);
    const heightDp = toDp(size.height);
    const describe = node['resource-id'] || node['content-desc'] || node.text || node.class || '(sans identité)';
    if (Math.min(widthDp, heightDp) < minDp) {
      tooSmall.push({ element: describe, widthDp, heightDp, bounds: node.bounds, class: node.class });
    }
    if (!(node['content-desc'] ?? '').trim() && !(node.text ?? '').trim()) {
      unlabeled.push({ element: describe, bounds: node.bounds, class: node.class });
    }
  }
  return { interactive: interactive.length, tooSmall, unlabeled };
}

/**
 * Findings a11y. L'accessibilité est une dimension de premier ordre : une cible
 * trop petite ou non étiquetée est `major`, pas une remarque cosmétique.
 * @param {{tooSmall:any[], unlabeled:any[]}} result @param {number} minDp @returns {any[]}
 */
function buildFindings(result, minDp) {
  const findings = [];
  for (const [index, item] of result.tooSmall.entries()) {
    findings.push({
      id: `QAM-A11Y-T${String(index + 1).padStart(2, '0')}`,
      title: `Cible tactile sous ${minDp} dp`, dimension: 'a11y', severity: 'major',
      selector: item.element, expected: `≥ ${minDp} dp dans les deux dimensions`,
      actual: `${item.widthDp}×${item.heightDp} dp (bounds ${item.bounds})`,
      suggestedFix: 'Agrandir la zone tactile sans forcément agrandir le visuel : padding, ou un parent qui porte le geste.',
      wcag: 'WCAG 2.1 AA — 2.5.5 Target Size', status: 'open',
    });
  }
  for (const [index, item] of result.unlabeled.entries()) {
    findings.push({
      id: `QAM-A11Y-L${String(index + 1).padStart(2, '0')}`,
      title: 'Élément interactif sans label', dimension: 'a11y', severity: 'major',
      selector: item.element, expected: 'un texte ou un content-desc annonçable',
      actual: `aucun (bounds ${item.bounds}, ${item.class})`,
      suggestedFix: 'Côté Flutter : Icon(semanticLabel: …) ou Semantics(label: …). Sans label, TalkBack annonce « bouton », rien de plus.',
      wcag: 'WCAG 2.1 A — 4.1.2 Name, Role, Value', status: 'open',
    });
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

  const reportPath = join(artifactsDir(config), 'a11y.json');
  const platform = opts.platform || (config.platforms ?? ['android'])[0];
  const minDp = config.a11y?.minTouchTargetDp ?? 48;

  if (platform !== 'android') {
    writeJson(reportPath, {
      platform, skipped: true,
      skipReason: 'iOS n\'expose pas d\'équivalent d\'`uiautomator dump` à un outil externe. '
        + 'Les cibles tactiles et les contrastes iOS sont couverts par test/argus/a11y_test.dart '
        + '(iOSTapTargetGuideline, textContrastGuideline), sans device.',
      findings: [],
    });
    warn('a11y sur device non mesurée sur iOS — la couverture passe par les gardes flutter_test.');
    process.exit(0);
  }

  if (!detectTools(['adb']).adb.present) {
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

  const dpi = deviceDensity(udid);
  if (!dpi) {
    err('densité du device illisible (adb shell wm density) — impossible de convertir les pixels en dp.');
    process.exit(2);
  }

  const { xml, reason } = dumpHierarchy(udid);
  if (!xml) {
    err(`dump d'accessibilité indisponible : ${reason}`);
    writeJson(reportPath, { platform, skipped: true, skipReason: reason, findings: [] });
    process.exit(2);
  }

  const nodes = parseNodes(xml);

  // Le dump porte TOUT ce qui est à l'écran, barre système comprise. Mesurer
  // sans filtrer reviendrait à noter l'accessibilité de l'app qui se trouve
  // devant — et à la publier sous le nom de la nôtre.
  const packageName = config.app.androidPackage;
  const appNodes = nodes.filter((n) => n.package === packageName);
  if (appNodes.length === 0) {
    const seen = [...new Set(nodes.map((n) => n.package).filter(Boolean))];
    const why = `« ${packageName} » n'est pas au premier plan sur ${udid} `
      + `(paquets vus : ${seen.join(', ') || 'aucun'}). Lance l'app avant de mesurer.`;
    err(why);
    writeJson(reportPath, { platform, device: { udid, dpi }, screen: opts.screen, skipped: true, skipReason: why, findings: [] });
    process.exit(2);
  }

  const result = analyse(appNodes, dpi, minDp);
  const labelled = appNodes.filter((n) => (n['content-desc'] ?? '').trim() || (n.text ?? '').trim()).length;

  // ⚠️ Zéro élément interactif n'est PAS un bon résultat : c'est le symptôme d'un
  // arbre d'accessibilité vide. Flutter ne peuple sa couche sémantique que
  // lorsqu'un service d'accessibilité la demande ; si ce n'est pas le cas ici,
  // le dump ne contient qu'une vue-conteneur et tout paraît parfait. Rapporter
  // « aucun problème » dans cet état serait exactement le faux vert que ce
  // script est censé empêcher.
  // Zéro élément interactif alors que des nœuds portent du texte ou une
  // description : la couche sémantique EST peuplée, l'écran n'a simplement
  // aucun contrôle. C'est un résultat légitime (écran de chargement, reçu,
  // splash), pas une panne de mesure. Ne crier que quand rien n'est annonçable.
  if (result.interactive === 0 && labelled === 0) {
    const reasonEmpty = `aucun élément interactif dans l'arbre d'accessibilité de ${packageName} `
      + `(${appNodes.length} nœuds, dont ${labelled} porteurs de texte ou de description). `
      + 'Sur une app Flutter, cela signifie presque toujours que la couche sémantique n\'est pas peuplée : '
      + 'lance la mesure pendant qu\'un service d\'accessibilité est actif (TalkBack, ou un run Maestro en cours), '
      + 'et vérifie que l\'app est bien au premier plan.';
    err(reasonEmpty);
    writeJson(reportPath, {
      platform, device: { udid, dpi }, screen: opts.screen, skipped: true,
      skipReason: reasonEmpty, nodesSeen: appNodes.length, nodesWithSemantics: labelled, findings: [],
    });
    process.exit(2);
  }

  if (result.interactive === 0) {
    warn(`aucun contrôle interactif sur cet écran (${appNodes.length} nœuds, ${labelled} annonçables) — rien à mesurer ici, mais la couche sémantique répond.`);
  }

  const findings = buildFindings(result, minDp);
  const report = {
    platform, device: { udid, dpi }, screen: opts.screen,
    metrics: {
      nodesSeen: appNodes.length,
      nodesTotalOnScreen: nodes.length,
      nodesWithSemantics: labelled,
      interactiveElements: result.interactive,
      tooSmall: result.tooSmall.length,
      unlabeled: result.unlabeled.length,
      // `null` plutôt que NaN quand il n'y a rien à diviser : un NaN affiché
      // se lit comme une valeur, et une valeur fausse est pire qu'une absence.
      labelCoveragePct: result.interactive === 0
        ? null
        : Math.round(((result.interactive - result.unlabeled.length) / result.interactive) * 1000) / 10,
      minTouchTargetDp: minDp,
    },
    details: { tooSmall: result.tooSmall, unlabeled: result.unlabeled },
    findings,
  };
  writeJson(reportPath, report);

  log(`${packageName} : ${appNodes.length} nœud(s), ${result.interactive} interactif(s) · ${result.tooSmall.length} sous ${minDp} dp · ${result.unlabeled.length} sans label`);
  const coverage = report.metrics.labelCoveragePct;
  log(`couverture de label : ${coverage === null ? 'sans objet' : `${coverage} %`} · rapport : ${reportPath}`);
  process.exit(exitCodeFor(findings, config.gate));
}

main();
