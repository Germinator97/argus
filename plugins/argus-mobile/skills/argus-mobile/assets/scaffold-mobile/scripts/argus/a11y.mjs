#!/usr/bin/env node
// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
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
 *   node scripts/argus/argus-mobile.mjs a11y
 *   node scripts/argus/argus-mobile.mjs a11y --screen=home --device=<udid>
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  artifactsDir, defaultAndroidDevice, detectTools, err, exitCodeFor, loadConfig, log,
  missingToolMessage, sh, warn, writeJson,
} from './config.mjs';
// Le budget d'attente d'un démarrage vit dans run.mjs, avec sa doctrine : il est
// LARGEMENT au-dessus de `coldStartMs`, pour qu'un écran lent sorte en finding
// de lenteur et non en « ancre introuvable ». Le redériver ici en dupliquerait
// la règle, donc la ferait diverger au premier ajustement.
import { startTimeoutMs } from './run.mjs';

const DUMP_PATH = '/sdcard/argus-a11y-dump.xml';

/**
 * L'étiquette que `--screen` porte quand personne ne l'a passé.
 *
 * ⚠️ Elle est EXPORTÉE et lue par le garde, parce que c'est elle qui a vidé le
 * correctif d'avant : la relance testait `!opts.screen`, or ce défaut-ci n'est
 * pas la chaîne vide. La condition était donc fausse à chaque `make argus-a11y`,
 * et la relance ne se déclenchait dans AUCUN cas nominal.
 */
export const ECRAN_COURANT = 'écran courant';
/** Densité de référence Android : 1 dp = 1 px à 160 dpi. */
const BASELINE_DPI = 160;

/** @param {string[]} argv */
export function parseArgs(argv) {
  const opts = { device: '', screen: ECRAN_COURANT, platform: '' };
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
 * Quel écran DÉCLARÉ est affiché, d'après les ancres présentes dans le dump.
 *
 * Rend toujours un verdict lisible, y compris « aucun » : une mesure qui ne
 * sait pas de quel écran elle parle vaut mieux si elle le dit.
 *
 * ⚠️ `kind` porte la NATURE du verdict, et pas seulement son échec. Quatre
 * situations, dont deux qu'un simple booléen confondait :
 *
 *   `reconnu`          l'écran affiché est celui qu'on visait
 *   `autre`            un écran du harnais, mais pas celui demandé
 *   `aucune`           aucune ancre déclarée à l'écran — splash, système, état
 *                      non déclaré : le relevé ne dit RIEN de ta couverture
 *   `sans-declaration` rien n'est déclaré : on ne peut reconnaître quoi que ce soit
 *
 * `aucune` et `autre` ne veulent pas dire la même chose et n'appellent pas le
 * même geste — le premier dit que la mesure est hors sujet, le second qu'elle
 * porte sur un écran réel qu'on n'avait pas demandé. Les avoir tous deux en
 * `matched: false` rendait le garde incapable de les distinguer, ce qu'une
 * mutation a montré et qu'aucune relecture n'avait vu.
 * @param {Array<Record<string,string>>} nodes @param {any} config @param {string} requested
 * @returns {{id:string, matched:boolean, kind:'reconnu'|'autre'|'aucune'|'sans-declaration', detail:string}}
 */
/**
 * Faut-il relancer l'app avant de mesurer ?
 *
 * ⚠️ CETTE DÉCISION EST EXTRAITE POUR ÊTRE MESURABLE. Elle vivait en ligne dans
 * `main()`, sous la forme `!identity.matched && !opts.screen`, et elle portait
 * DEUX défauts qu'aucune relecture n'a vus :
 *
 *   — `!opts.screen` est faux dès que personne ne passe `--screen`, puisque le
 *     défaut vaut alors `ECRAN_COURANT` et non la chaîne vide. La relance ne se
 *     déclenchait donc jamais en usage nominal ;
 *   — et le cas « l'app n'est pas au premier plan DU TOUT » sortait plus haut,
 *     en `process.exit(2)`, sans jamais l'atteindre. C'est précisément ce que
 *     `argus-perf` produit en laissant l'app arrêtée, donc ce que la chaîne
 *     `make argus` rencontre.
 *
 * Un `--screen` explicite interdit la relance, et c'est le seul cas : l'état a
 * été posé à la main, le relancer mesurerait un autre écran tout en le
 * rapportant sous le nom demandé.
 * @param {{foreground:boolean, matched:boolean, requested:string}} etat
 * @returns {{relaunch:boolean, why:string}}
 */
export function relaunchDecision({ foreground, matched, requested }) {
  if (requested && requested !== ECRAN_COURANT) {
    return {
      relaunch: false,
      why: `« ${requested} » a été demandé explicitement : l'état vient de toi, on ne le défait pas.`,
    };
  }
  if (!foreground) {
    return {
      relaunch: true,
      why: 'l\'application n\'est pas au premier plan — c\'est l\'état dans lequel '
        + '`argus-perf` la laisse, donc celui que la chaîne `make argus` rencontre.',
    };
  }
  if (!matched) {
    return { relaunch: true, why: 'l\'app est là, mais sur un écran qu\'aucune ancre déclarée ne reconnaît.' };
  }
  return { relaunch: false, why: '' };
}

/**
 * Peut-on cesser d'attendre l'écran, après une relance ?
 *
 * ⚠️ « IMMOBILE » NE VEUT PAS DIRE « PRÊT », et c'est la deuxième fois que ce
 * raisonnement coûte cher. La version d'avant sortait dès que deux lectures de
 * l'arbre coïncidaient, sous le commentaire « ce n'est un splash QUE s'il bouge
 * encore ». Un splash STATIQUE — une image de marque immobile deux secondes —
 * rend deux dumps identiques à 500 ms d'intervalle : la boucle sortait au bout
 * d'une seconde, en plein sas, et la dimension ne mesurait rien.
 *
 * C'est mot pour mot l'erreur corrigée la veille dans `launch-clean.yaml`, où
 * `waitForAnimationToEnd` se satisfaisait du même silence. Le correctif avait
 * été pensé comme local alors que l'erreur était une manière de penser.
 *
 * Trois issues, et chacune se dérive de ce que le projet a déjà déclaré :
 *   `reconnu`  un écran déclaré est à l'écran — c'est fini
 *   `renoncer` soit rien n'est déclaré (aucun écran ne sera JAMAIS reconnu, et
 *              attendre est du gaspillage pur), soit l'écran est immobile ET le
 *              splash déclaré est passé
 *   `attendre` tout le reste, y compris un écran immobile pendant son splash
 *
 * ⚠️ `plancherMs` N'EST PAS `brandedSplashMs`, et les confondre a coûté la
 * dimension une seconde fois. Le splash de marque dure 2 s ; l'écran
 * EXPLOITABLE, lui, arrive à 5–7 s sur le même projet — splash, initialisation,
 * premier rendu. Attendre le premier revient à conclure pendant le second.
 *
 * C'est exactement la distinction que le point 88 a fait écrire dans le rapport,
 * dans la MÊME passe que ce correctif. L'avoir documentée trois fichiers plus
 * loin ne l'a pas rendue présente à l'esprit ici.
 *
 * Le plancher se dérive donc du temps RÉEL d'arrivée de l'écran de départ, que
 * le harnais mesure déjà (`startup.samples` du rapport). À défaut de mesure, on
 * n'invente rien : on attend le budget entier — lent, jamais faux — et
 * l'appelant dit quoi faire pour que ça cesse.
 * @param {{matched:boolean, kind:string, immobile:boolean, ecouleMs:number, plancherMs:number}} etat
 * @returns {'reconnu'|'renoncer'|'attendre'}
 */
export function verdictAttente({ matched, kind, immobile, ecouleMs, plancherMs }) {
  if (matched) return 'reconnu';
  if (kind === 'sans-declaration') return 'renoncer';
  if (immobile && plancherMs > 0 && ecouleMs >= plancherMs) return 'renoncer';
  return 'attendre';
}

/**
 * Le temps qu'a mis l'écran de départ à arriver, au dernier run mesuré.
 *
 * ⚠️ C'est la SEULE grandeur qui vaille ici, et elle ne se devine pas : elle
 * dépend du splash, de l'initialisation et de l'appareil. Le runner l'a déjà
 * relevée — `startup.samples` — et l'a écrite dans le rapport. On la relit.
 *
 * On rend la PLUS GRANDE des mesures, pas la médiane : ce plancher sert à ne pas
 * conclure trop tôt, donc se tromper vers le haut ne coûte que du temps, et vers
 * le bas coûte la mesure.
 * @param {string} reportPath @param {typeof readFileSync} [lire]
 * @returns {number} 0 si rien de lisible
 */
export function plancherMesure(reportPath, lire = readFileSync) {
  try {
    const rapport = JSON.parse(String(lire(reportPath, 'utf8')));
    const ms = (rapport?.startup?.samples ?? [])
      .map((/** @type {any} */ s) => Number(s?.ms ?? 0))
      .filter((/** @type {number} */ n) => Number.isFinite(n) && n > 0);
    return ms.length ? Math.max(...ms) : 0;
  } catch {
    return 0;
  }
}

export function identifyScreen(nodes, config, requested) {
  const declared = (config.screens ?? []).filter((/** @type {any} */ s) => (s.anchor ?? '').trim());
  if (declared.length === 0) {
    return {
      id: '', matched: false, kind: 'sans-declaration',
      detail: 'aucun écran déclaré avec une ancre : impossible de reconnaître ce qui est affiché.',
    };
  }
  // L'ancre apparaît dans `resource-id` sur les dumps Android ; on balaie aussi
  // les autres attributs textuels, parce que le dump n'a pas de forme garantie
  // d'une version d'Android à l'autre.
  const haystack = nodes.map((n) => Object.values(n).join('\u0000')).join('\u0000');
  const found = declared.filter((/** @type {any} */ s) => haystack.includes(s.anchor));

  if (found.length === 0) {
    const attendu = requested && requested !== ECRAN_COURANT ? ` (attendu : « ${requested} »)` : '';
    return {
      id: '',
      matched: false,
      kind: 'aucune',
      detail: `aucune ancre déclarée n'est présente à l'écran${attendu} — ce qui est mesuré n'est PAS un écran du harnais.`
        + ' Splash, écran système, ou état non déclaré : le relevé ne dit rien de ta couverture.',
    };
  }
  const id = found.map((/** @type {any} */ s) => s.id).join('+');
  if (requested && requested !== ECRAN_COURANT && !found.some((/** @type {any} */ s) => s.id === requested)) {
    return { id, matched: false, kind: 'autre', detail: `écran affiché « ${id} », qui n'est pas « ${requested} » — la mesure ne porte pas sur ce que tu as demandé.` };
  }
  return { id, matched: true, kind: 'reconnu', detail: `écran reconnu : « ${id} ».` };
}

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
 * Une capture de l'écran mesuré, pour que les findings aient une PREUVE.
 *
 * ⚠️ POURQUOI ELLE EXISTE. `artifact.evidence` promet « les captures des
 * findings », et le seul producteur de chemins d'images était le finding
 * d'étape Maestro EN ÉCHEC. Un run vert — celui qu'on publie — ne pouvait donc
 * porter aucune image, pendant que les findings qui gagnent le plus à être vus
 * (cible tactile sous le seuil, élément sans label) n'en attachaient aucune.
 * Relevé sur un projet réel : 18 findings de cibles, 18 PNG sur le disque,
 * aucun lien entre les deux.
 *
 * ⚠️ PAR FICHIER, JAMAIS PAR `exec-out`. `screencap -p` écrit du PNG sur stdout,
 * et `sh()` décode en UTF-8 : l'image reviendrait corrompue sans qu'aucune
 * erreur ne le dise. On passe donc par le device puis `pull`, comme le dump.
 * @param {string} udid @param {string} dir dossier d'artefacts (absolu)
 * @param {string} ecran identifiant de l'écran mesuré
 * @returns {string} chemin RELATIF au projet, ou '' si la capture a échoué
 */
function captureEcran(udid, dir, ecran) {
  const distant = '/sdcard/argus-a11y-shot.png';
  const nom = `a11y-${(ecran || 'ecran').replace(/[^\w.-]/g, '-')}.png`;
  const local = join(dir, nom);
  if (!adb(udid, ['shell', 'screencap', '-p', distant]).ok) return '';
  if (!adb(udid, ['pull', distant, local]).ok) return '';
  adb(udid, ['shell', 'rm', '-f', distant]);
  if (!existsSync(local)) return '';
  // `embedEvidence` résout depuis le cwd : un chemin absolu y serait cherché
  // sous le projet et manquerait, ce qui compte comme « preuve absente ».
  return relative(process.cwd(), local);
}

/**
 * Findings a11y. L'accessibilité est une dimension de premier ordre : une cible
 * trop petite ou non étiquetée est `major`, pas une remarque cosmétique.
 * @param {{tooSmall:any[], unlabeled:any[]}} result @param {number} minDp
 * @param {string} [preuve] capture de l'écran mesuré, chemin relatif
 * @returns {any[]}
 *
 * ⚠️ SANS GARDE EXÉCUTABLE POUR SON CÂBLAGE, et c'est dit plutôt que tu. La
 * fonction est éprouvée dans les deux sens par la suite du plugin ; ce qui ne
 * l'est pas, c'est que `main()` lui passe une capture RÉELLE, parce qu'il faut
 * un appareil pour en produire une. Le harnais de mutation ne peut donc pas le
 * couvrir : le lire dans la source serait un garde de texte, et un garde de
 * texte ne voit pas une valeur neutralisée.
 */
export function buildFindings(result, minDp, preuve = '') {
  const evidence = preuve ? [preuve] : [];
  const findings = [];
  for (const [index, item] of result.tooSmall.entries()) {
    findings.push({
      id: `QAM-A11Y-T${String(index + 1).padStart(2, '0')}`,
      title: `Cible tactile sous ${minDp} dp`, dimension: 'a11y', severity: 'major',
      selector: item.element, expected: `≥ ${minDp} dp dans les deux dimensions`,
      actual: `${item.widthDp}×${item.heightDp} dp (bounds ${item.bounds})`,
      suggestedFix: 'Agrandir la zone tactile sans forcément agrandir le visuel : padding, ou un parent qui porte le geste.',
      wcag: 'WCAG 2.1 AA — 2.5.5 Target Size', evidence, status: 'open',
    });
  }
  for (const [index, item] of result.unlabeled.entries()) {
    findings.push({
      id: `QAM-A11Y-L${String(index + 1).padStart(2, '0')}`,
      title: 'Élément interactif sans label', dimension: 'a11y', severity: 'major',
      selector: item.element, expected: 'un texte ou un content-desc annonçable',
      actual: `aucun (bounds ${item.bounds}, ${item.class})`,
      suggestedFix: 'Côté Flutter : Icon(semanticLabel: …) ou Semantics(label: …). Sans label, TalkBack annonce « bouton », rien de plus.',
      wcag: 'WCAG 2.1 A — 4.1.2 Name, Role, Value', evidence, status: 'open',
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

  // ⚠️ `config` PASSÉE, jamais omise : sans elle, l'AVD déclaré est ignoré et
  // c'est le premier émulateur venu qui est mesuré — en silence. Un garde de
  // CÂBLAGE le tient, parce qu'un paramètre optionnel non passé est légal.
  const picked = opts.device ? { udid: opts.device, why: '' } : defaultAndroidDevice(config);
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
  let dernierDump = nodes;
  let appNodes = nodes.filter((n) => n.package === packageName);

  // ⚠️ Quel écran est-on en train de mesurer ? `--screen` n'était qu'une
  // ÉTIQUETTE : on écrivait dans le rapport le nom qu'on avait tapé, pas celui
  // de l'écran affiché. Sur le terrain, ce script lancé après une suite a
  // mesuré le SPLASH et rendu « rien à mesurer » — honnête, vide, et
  // indiscernable d'un écran réellement sans contrôles.
  //
  // On le RECONNAÎT donc, en croisant le dump avec les ancres déclarées. C'est
  // le seul moyen d'affirmer quoi que ce soit sur l'écran mesuré.
  let identity = appNodes.length > 0
    ? identifyScreen(appNodes, config, opts.screen)
    : { id: '', matched: false, kind: /** @type {const} */ ('aucune'), detail: `« ${packageName} » n'est pas au premier plan sur ${udid}.` };

  // ⚠️ UNE SEULE RELANCE, PLUSIEURS LECTURES, ET C'EST DIT.
  //
  // La cible `argus` enchaîne ce script APRÈS la suite Maestro, qui laisse
  // l'app là où son dernier flow s'est arrêté — personne ne sait où. Mesuré
  // dans la chaîne : « 0 interactif, 0 finding », quand le même script pointé
  // sur un écran connu en rend cinq. Le script avait raison de refuser de
  // conclure ; c'était l'ordonnancement qui le mettait en position de ne rien
  // mesurer.
  //
  // On relance donc l'app une fois — `am force-stop` puis le lanceur suffit à
  // revenir à l'écran de départ — et on relit jusqu'à ce que l'écran soit posé.
  //
  // ⚠️ PAS de `pm clear` ici, et c'est délibéré : effacer les données de l'app
  // est une ÉCRITURE, que la matrice de garde-fous gouverne par `ENV`. Un
  // simple redémarrage obtient le même écran sans rien détruire — le faire au
  // passage, dans un script de mesure, serait exactement le genre d'effet de
  // bord qu'aucun ENV n'a autorisé.
  const decision = relaunchDecision({
    foreground: appNodes.length > 0, matched: identity.matched, requested: opts.screen,
  });
  if (decision.relaunch) {
    warn(`${decision.why}\n  → relance de l'app pour mesurer un écran connu, puis seconde lecture.`);
    adb(udid, ['shell', 'am', 'force-stop', packageName]);
    adb(udid, ['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);

    // ⚠️ UN SEUL DUMP NE SUFFIT PLUS DEPUIS QUE L'APP PEUT ÊTRE ARRÊTÉE. Une
    // app qu'on ramène au premier plan est là tout de suite ; une app qu'on
    // DÉMARRE traverse son splash, et le dump pris pendant montre un écran que
    // personne ne verra — le relevé porterait alors sur l'entrée, pas sur
    // l'écran. On relit donc jusqu'à reconnaître un écran déclaré, dans le
    // budget d'attente du harnais et pas une seconde de plus.
    const depart = Date.now();
    const limite = depart + startTimeoutMs(config);
    // Le temps RÉEL d'arrivée de l'écran, relu du dernier rapport ; à défaut, le
    // splash déclaré, qui vaut mieux que rien mais qu'on sait trop court.
    const mesure = plancherMesure(join(artifactsDir(config), 'report.json'));
    const plancherMs = mesure || Number(config.thresholds?.brandedSplashMs ?? 0);
    const pause = new Int32Array(new SharedArrayBuffer(4));
    let empreinte = '';
    let verdict = 'attendre';
    do {
      const relu = dumpHierarchy(udid);
      if (relu.xml) {
        dernierDump = parseNodes(relu.xml);
        const encore = dernierDump.filter((n) => n.package === packageName);
        if (encore.length > 0) {
          appNodes = encore;
          identity = identifyScreen(appNodes, config, opts.screen);
          const vu = `${encore.length}·${encore.map((n) => n['resource-id'] ?? '').sort().join('|')}`;
          verdict = verdictAttente({
            matched: identity.matched, kind: identity.kind,
            immobile: vu === empreinte, ecouleMs: Date.now() - depart, plancherMs,
          });
          empreinte = vu;
          if (verdict !== 'attendre') break;
        }
      }
      Atomics.wait(pause, 0, 0, 500);
    } while (Date.now() < limite);

    if (!identity.matched && plancherMs === 0) {
      warn('aucun temps de démarrage connu : ni `startup.samples` dans le rapport (lance '
        + '`make argus-run` d\'abord), ni `thresholds.brandedSplashMs`. Un écran immobile ne '
        + 'peut donc pas être distingué d\'un splash, et on a attendu le budget entier.');
    } else if (!identity.matched && !mesure) {
      warn(`plancher pris sur thresholds.brandedSplashMs (${plancherMs} ms) faute de mesure — `
        + 'c\'est la durée du SPLASH, pas celle de l\'écran exploitable, qui est plus longue. '
        + 'Lance `make argus-run` une fois : son `startup.samples` donnera le bon chiffre.');
    }
  }

  // ⚠️ CE REFUS VIENT APRÈS LA RELANCE, ET C'ÉTAIT TOUT LE DÉFAUT. Il sortait
  // plus haut, si bien que le seul état d'où l'on pouvait se rattraper — l'app
  // arrêtée — était le seul qui n'atteignait jamais le rattrapage.
  if (appNodes.length === 0) {
    const seen = [...new Set(dernierDump.map((n) => n.package).filter(Boolean))];
    const why = `« ${packageName} » n'est pas au premier plan sur ${udid} `
      + `(paquets vus : ${seen.join(', ') || 'aucun'}) — ${decision.relaunch
        ? 'et la relance n\'y a rien changé. Vérifie que le paquet est bien installé (adb shell pm list packages | grep …).'
        : 'lance l\'app avant de mesurer.'}`;
    err(why);
    writeJson(reportPath, {
      platform, device: { udid, dpi },
      screen: { requested: opts.screen, identified: '', matched: false },
      skipped: true, skipReason: why, findings: [],
    });
    process.exit(2);
  }

  (identity.matched ? log : warn)(identity.detail);

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
      platform, device: { udid, dpi },
      screen: (() => {
        const id = identifyScreen(appNodes, config, opts.screen);
        return { requested: opts.screen, identified: id.id, matched: false, kind: id.kind };
      })(),
      skipped: true,
      skipReason: reasonEmpty, nodesSeen: appNodes.length, nodesWithSemantics: labelled, findings: [],
    });
    process.exit(2);
  }

  if (result.interactive === 0) {
    warn(`aucun contrôle interactif sur cet écran (${appNodes.length} nœuds, ${labelled} annonçables) — rien à mesurer ici, mais la couche sémantique répond.`);
  }

  // La preuve visuelle, prise SUR L'ÉCRAN QU'ON VIENT DE MESURER — sans elle,
  // une page publiée par un run vert ne montre jamais rien.
  const preuve = captureEcran(udid, artifactsDir(config), identity.id);
  if (!preuve) warn('capture de l\'écran impossible — les findings partiront sans preuve visuelle.');
  const findings = buildFindings(result, minDp, preuve);
  const report = {
    platform, device: { udid, dpi },
    // Ce qui a été demandé et ce qui a été RECONNU, côte à côte : les
    // confondre est précisément ce qui a fait publier une mesure de splash
    // sous le nom d'un écran métier.
    screen: {
      requested: opts.screen, identified: identity.id,
      matched: identity.matched, kind: identity.kind,
    },
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

// Comme pour run.mjs : ne lancer la mesure que si CE fichier est le point
// d'entrée, sans quoi l'importer pour en tester une fonction sonderait un
// device.
// ⚠️ `realpathSync` DES DEUX CÔTÉS. `resolve()` normalise sans résoudre les
// liens symboliques, or `import.meta.url` porte le chemin RÉEL : lancé par un
// chemin qui traverse un lien (sur macOS, `$TMPDIR` et `/tmp` en sont),
// le script ne se reconnaît pas, `main()` n'est jamais appelé — pas de sortie,
// pas d'erreur, exit 0. Mesuré : `node scripts/argus/perf.mjs` mesure,
// `node /var/folders/…/perf.mjs` ne fait rien et rend 0.
const invokedDirectly = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
