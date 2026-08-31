// Gardes du runner mobile — les décisions de scripts/argus/run.mjs.
//
// Pourquoi ce fichier existe : le runner décidait quel device piloter et quel
// verdict rendre, et RIEN ne l'exerçait. La CI se contentait d'un `node --check`,
// qui prouve qu'un fichier parse, jamais qu'il décide juste. Deux défauts y ont
// vécu sans que personne les voie — un rapport qui recopiait l'identité du
// device au lieu de la lire, et un échec qui accusait l'ancre quand l'app
// démarrait trop lentement.
//
// Chaque garde couvre les DEUX sens : ce qui doit être écarté, et ce qui doit
// passer. Un garde qui ne vérifie que le refus se satisfait d'un composant qui
// refuse tout — c'est la moitié qu'on oublie.
//
//   node --test tools/run-guards.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..');

import {
  authAnchorsReady, avdNameFrom, baselineVerdict, budgetVerdict, buildEnv, dimensionsToRun, localeWarnings, resolveByAvd, resolveNamedDevice, startTimeoutMs,
  startScreen, startupFindings, startupHint, startupSamples, vanishedHint, visitedScreens,
} from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { androidAvdDeclared, buildCmdForAbi, ciEmulator, deviceAbi, flutterCommand, flutterCommandIn, rankBuildTools, toolPath, usesFvm, validateConfig } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { PROBE_TIMEOUT_MS, SH_TIMEOUT_MS, declaredAnchors, exitCodeFor, measureBinary, platformFor,
  posedAnchors, releaseBuildCmd, sh, shTimeoutMs, undeclaredAnchors } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { sizeFinding } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { buildHintFor } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/sec.mjs';
import { coverageLine, stalenessOf } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs';
import { LIGHTBOX, STYLE, findingCards } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs';
import { ECRAN_COURANT, identifyScreen, parseArgs, plancherMesure, relaunchDecision, verdictAttente } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/a11y.mjs';
import { buildFindings } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/a11y.mjs';
import { auditApk, auditObfuscation, binaryFreshness, binaryScanPlan, binaryToScan, dartPackageName, iosBinarySkipReason } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/sec.mjs';
import { binaryToWeigh } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { launchOutcome } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { thresholdFinding } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { caveatDebug, hostContext, launchTimeFindings, startupMetricLabel } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { baselineCropFor, baselineCrops, baselineDeviceDrift, cropFor, deviceStamp, installHint, screensWithMovedCrop } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { buildCoverage, stageOneOnly } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { startupMargin, startupMarginWarning } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { runScope } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { anchorAfterAuth } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { flowCycles } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { installedVariant } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';

/** Trois émulateurs, dans un ordre de démarrage qui n'est pas celui qu'on croit. */
const TROIS_EMULATEURS = [
  { udid: 'emulator-5554', physical: false, avd: 'Pixel_9a', model: 'sdk_gphone64_arm64', os: 'android-35' },
  { udid: 'emulator-5556', physical: false, avd: 'Autre_AVD', model: 'sdk_gphone64_arm64', os: 'android-34' },
  { udid: 'emulator-5558', physical: false, avd: 'Cible_API_36', model: 'sdk_gphone64_arm64', os: 'android-36' },
];

const CONFIG = { thresholds: { coldStartMs: 2000 } };
const DEVICE = { id: 'emu', udid: 'emulator-5558', os: 'android-36' };

// ── Identité du device ──────────────────────────────────────────────────────

test('un AVD nommé est retrouvé quel que soit le port qui le porte', () => {
  const res = resolveByAvd({ id: 'emu', platform: 'android', avd: 'Cible_API_36' }, TROIS_EMULATEURS, false);
  assert.equal(res.status, 'ok');
  assert.equal(res.device?.udid, 'emulator-5558');
  assert.equal(res.device?.avd, 'Cible_API_36');
  // L'identité vient de l'appareil listé, pas du spec : c'est tout l'objet.
  assert.equal(res.device?.measured, true);
});

test('le port ne décide de rien : le même AVD sur un autre port est suivi', () => {
  // Exactement ce qui arrive quand les émulateurs démarrent dans un autre ordre.
  const permute = TROIS_EMULATEURS.map((d, i) => ({ ...d, udid: `emulator-${5554 + 2 * (2 - i)}` }));
  const res = resolveByAvd({ id: 'emu', platform: 'android', avd: 'Cible_API_36' }, permute, false);
  assert.equal(res.status, 'ok');
  assert.equal(res.device?.udid, 'emulator-5554', 'l\'AVD visé a changé de port et doit être suivi');
});

test('un AVD absent ne retombe JAMAIS sur un autre émulateur', () => {
  const res = resolveByAvd({ id: 'emu', platform: 'android', avd: 'Jamais_Demarre' }, TROIS_EMULATEURS, false);
  assert.equal(res.status, 'absent');
  assert.equal(res.device, undefined, 'se rabattre ici ferait tourner la suite sur la mauvaise machine');
});

test('en dry-run un AVD absent passe, mais sans prétendre avoir été mesuré', () => {
  const res = resolveByAvd({ id: 'emu', platform: 'android', avd: 'Jamais_Demarre' }, [], true);
  assert.equal(res.status, 'ok');
  assert.equal(res.device?.measured, false, 'sinon le rapport annonce une identité que personne n\'a lue');
});

test('avd est refusé sur iOS, dont l\'udid est déjà une identité stable', () => {
  const res = resolveByAvd({ id: 'sim', platform: 'ios', avd: 'Nope' }, [], false);
  assert.equal(res.status, 'refused');
});

test('cibler un émulateur par son port reste possible — on avertit, on ne bloque pas', () => {
  const res = resolveNamedDevice({ id: 'emu', platform: 'android', udid: 'emulator-5558' }, TROIS_EMULATEURS, false);
  assert.equal(res.status, 'ok', 'casser ce chemin casserait toutes les configs existantes');
  assert.equal(res.device?.avd, 'Cible_API_36', 'et le rapport doit quand même porter le vrai AVD');
});

test('un téléphone réel non assumé est refusé', () => {
  const listed = [{ udid: 'R5CT10ABC', physical: true, avd: '', model: 'SM-A536B', os: 'android-34' }];
  const refuse = resolveNamedDevice({ id: 'tel', platform: 'android', udid: 'R5CT10ABC' }, listed, false);
  assert.equal(refuse.status, 'refused', 'Argus installe un binaire et efface les données de l\'app');

  const assume = resolveNamedDevice({ id: 'tel', platform: 'android', udid: 'R5CT10ABC', physical: true }, listed, false);
  assert.equal(assume.status, 'ok', 'mais un appareil de test dédié doit rester utilisable');
});

test('adb rend le nom puis « OK » — c\'est le nom qu\'on garde', () => {
  assert.equal(avdNameFrom('Cible_API_36\nOK\n'), 'Cible_API_36');
  assert.equal(avdNameFrom('\n  Cible_API_36  \nOK'), 'Cible_API_36');
  assert.equal(avdNameFrom('OK\n'), '', 'un « OK » seul n\'est pas un nom d\'AVD');
  assert.equal(avdNameFrom(''), '');
});

// ── Démarrage à froid ───────────────────────────────────────────────────────

/** Un flow qui attend deux fois la même ancre : au lancement, puis à chaud. */
const bundle = (flow, durees) => ({
  flow,
  steps: durees.map(([ms, status]) => ({
    command: { assertConditionCommand: { condition: { visible: { idRegex: 'home_root' } } } },
    metadata: { status, duration: ms, evaluatedCommand: { c: { condition: { visible: { idRegex: 'home_root' } } } } },
  })),
});

test('seule la PREMIÈRE attente est retenue : les suivantes portent une app chaude', () => {
  const samples = startupSamples([bundle('smoke', [[16645, 'COMPLETED'], [79, 'COMPLETED']])], 'home_root');
  assert.equal(samples.length, 1);
  assert.equal(samples[0].ms, 16645, 'retenir 79 ms ferait passer un démarrage de 16 s pour instantané');
});

test('sans ancre de départ, aucun échantillon inventé', () => {
  assert.deepEqual(startupSamples([bundle('smoke', [[16645, 'COMPLETED']])], ''), []);
});

test('une attente sur une AUTRE ancre n\'est pas un temps de démarrage', () => {
  assert.deepEqual(startupSamples([bundle('smoke', [[16645, 'COMPLETED']])], 'profile_root'), []);
});

test('au-dessus du seuil : un seul finding pour le lot, pas un par flow', () => {
  const samples = [
    { flow: 'smoke', ms: 19329, status: 'COMPLETED' },
    { flow: 'i18n', ms: 27289, status: 'FAILED' },
    { flow: 'a11y', ms: 21097, status: 'COMPLETED' },
  ];
  const findings = startupFindings(samples, DEVICE, 'android', CONFIG);
  assert.equal(findings.length, 1, 'trois lignes disant la même chose, c\'est un rapport qu\'on cesse de lire');
  assert.equal(findings[0].dimension, 'performance');
  assert.match(findings[0].actual, /3\/3/);
  assert.match(findings[0].actual, /i18n 27289 ms/);
  // Le flow qui a épuisé son budget doit être signalé POUR CE QU'IL EST.
  assert.match(findings[0].actual, /budget d'attente/);
});

test('sous le seuil : rien — un garde qui crie toujours ne garde rien', () => {
  const samples = [{ flow: 'smoke', ms: 850, status: 'COMPLETED' }];
  assert.deepEqual(startupFindings(samples, DEVICE, 'android', CONFIG), []);
});

test('aucun échec à signaler : la phrase sur le budget d\'attente disparaît', () => {
  const samples = [{ flow: 'smoke', ms: 9000, status: 'COMPLETED' }];
  const findings = startupFindings(samples, DEVICE, 'android', CONFIG);
  assert.equal(findings.length, 1);
  assert.doesNotMatch(findings[0].actual, /budget d'attente/);
});

// ── D'où partent les flows ──────────────────────────────────────────────────

/** Deux états du même écran, dans l'ordre PIÉGEUX : l'état plein d'abord. */
const DEUX_ETATS = {
  screens: [
    { id: 'home-filled', anchor: 'home_filled_root' },
    { id: 'home-empty', anchor: 'home_empty_root' },
  ],
};

test('« start: true » gagne sur l\'ordre de déclaration', () => {
  const config = { screens: DEUX_ETATS.screens.map((s) => ({ ...s, start: s.id === 'home-empty' })) };
  const { screen, origin } = startScreen(config);
  assert.equal(screen.id, 'home-empty', 'c\'est tout l\'objet de la clé : ne plus dépendre du rang');
  assert.equal(origin, 'declared');
});

test('sans déclaration, la convention « home » s\'applique encore', () => {
  // Rétrocompatibilité : casser ce chemin casserait toutes les configs posées.
  const { screen, origin } = startScreen({
    screens: [{ id: 'autre', anchor: 'autre_root' }, { id: 'home', anchor: 'home_root' }],
  });
  assert.equal(screen.id, 'home');
  assert.equal(origin, 'home');
});

test('sans rien, le repli est signalé COMME tel', () => {
  const { screen, origin } = startScreen(DEUX_ETATS);
  assert.equal(screen.id, 'home-filled', 'le premier déclaré — le comportement historique');
  assert.equal(origin, 'first', 'et le rapport doit pouvoir dire que c\'était une DEVINETTE');
});

test('un écran sans ancre ne peut pas être le point de départ', () => {
  // configuredScreens l'écarte : le retenir ici injecterait une ancre vide.
  const { screen } = startScreen({
    screens: [{ id: 'vide', anchor: '', start: true }, { id: 'reel', anchor: 'reel_root' }],
  });
  assert.equal(screen.id, 'reel');
});

test('deux « start: true » sont refusés, un seul passe', () => {
  const base = {
    app: { name: 'x', androidPackage: 'com.x', iosBundleId: '', flavor: '' },
    platforms: ['android'], devices: [{ id: 'd', platform: 'android' }],
    thresholds: { visualMatchPercentage: 99, coldStartMs: 2000 },
    artifact: { evidence: 'all', maxMb: 12, enabled: false },
  };
  const erreurs = (screens) => validateConfig({ ...base, screens })
    .filter((p) => p.level === 'error' && /start: true/.test(p.message));

  assert.equal(erreurs([
    { id: 'a', anchor: 'a_root', start: true },
    { id: 'b', anchor: 'b_root', start: true },
  ]).length, 1, 'deux points de départ, c\'est une config qui ne veut rien dire');

  assert.equal(erreurs([
    { id: 'a', anchor: 'a_root', start: true },
    { id: 'b', anchor: 'b_root' },
  ]).length, 0, 'un seul doit passer sans bruit');

  // Le piège : déclaré sur un écran qu'aucune ancre ne rend exploitable.
  assert.equal(erreurs([{ id: 'a', anchor: '', start: true }]).length, 1,
    'sinon le choix est écrit, jamais lu, et le départ retombe ailleurs en silence');
});

test('le budget d\'attente reste LARGEMENT au-dessus du seuil de perf', () => {
  // La règle, pas la valeur : confondre les deux fait sortir un écran lent en
  // « ancre introuvable » — le diagnostic faux qui a coûté un run entier.
  for (const coldStartMs of [500, 2000, 4000, 8000, 30000]) {
    const budget = startTimeoutMs({ thresholds: { coldStartMs } });
    assert.ok(budget > coldStartMs * 2,
      `budget ${budget} ms trop proche du seuil ${coldStartMs} ms : un écran lent sortirait en échec fonctionnel`);
  }
  // Un plancher, pour que le cas nominal ne dépende pas d'un seuil minuscule.
  assert.ok(startTimeoutMs({ thresholds: { coldStartMs: 100 } }) >= 20000);
  assert.ok(startTimeoutMs({}) >= 20000, 'une config sans seuil doit rester utilisable');
});

test('un budget d\'attente EXPLICITE l\'emporte sur la dérivation', () => {
  // Le levier qui manquait : relever le plafond anti-flake obligeait à relever
  // `coldStartMs`, donc à relâcher le gate chargé de rapporter la lenteur qui
  // cause le flake. Les deux ne mesurent pas la même chose.
  const config = { thresholds: { coldStartMs: 2000, startTimeoutMs: 45000 } };
  assert.equal(startTimeoutMs(config), 45000);
  // Et il doit pouvoir descendre SOUS la dérivation, sinon il ne découple rien.
  assert.equal(startTimeoutMs({ thresholds: { coldStartMs: 8000, startTimeoutMs: 12000 } }), 12000,
    'la dérivation rendrait 40 000 : une valeur mesurée doit pouvoir être plus basse');
});

test('sans valeur explicite, la dérivation reste — le garde ne coupe qu\'un sens', () => {
  for (const explicite of [undefined, 0]) {
    const config = { thresholds: { coldStartMs: 8000, startTimeoutMs: explicite } };
    assert.equal(startTimeoutMs(config), 40000,
      `startTimeoutMs=${explicite} doit retomber sur max(20s, coldStartMs × 5) : sans ça, ` +
      '« ajouter un levier » deviendrait « ne plus suivre le projet »');
  }
});

test('l\'indice ne s\'affiche que sur l\'ancre de départ', () => {
  const sur = startupHint('id=home_root', 'home_root', CONFIG);
  assert.match(sur, /démarrage/, 'c\'est le message qui a fait accuser l\'ancre pendant tout un run');

  // Partout ailleurs il doit se taire : un indice affiché sur chaque échec
  // n'oriente plus rien, il ajoute du bruit à ce qu'on cherche à lire.
  assert.equal(startupHint('id=submit_button', 'home_root', CONFIG), '');
  assert.equal(startupHint('text=Bienvenue', 'home_root', CONFIG), '');
  assert.equal(startupHint('id=home_root', '', CONFIG), '');
});

// ── Le message conseille-t-il le geste que la doc prescrit ? ─────────────────
//
// Ce garde ne vérifie ni une valeur ni un refus : il vérifie que deux TEXTES ne
// divergent pas. Pendant seize runs, le SKILL.md a prescrit de relever
// `startTimeoutMs` en interdisant `coldStartMs`, pendant que le seul levier cité
// par le message était… `coldStartMs`. Ni l'un ni l'autre n'était faux seul.
// Rien ne pouvait le voir : un écart entre deux textes n'a aucun comportement à
// casser, donc aucun test à faire rougir.
test('l\'indice nomme le levier que le SKILL prescrit, pas celui qu\'il interdit', () => {
  // ⚠️ DÉRIVÉ, jamais recopié. Écrire `startTimeoutMs` ici ferait un garde qui
  // suit le message au lieu de le surveiller : changer les deux ensemble le
  // laisserait vert. Le nom est LU dans la doc, qui est la source.
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const prescrit = skill.match(/Relève\s+`([A-Za-z.]+)`/);
  assert.ok(prescrit, 'le SKILL.md ne prescrit plus de levier pour le flow rouge sur un démarrage lent. '
    + 'Si la phrase a été reformulée, mets ce motif à jour — sinon ce garde ne garde plus rien.');
  const interdit = skill.match(/ne\s+touche pas à `([A-Za-z.]+)`/);
  assert.ok(interdit, 'le SKILL.md ne dit plus quel levier NE PAS toucher — même remarque.');
  assert.notEqual(prescrit[1], interdit[1], 'la doc prescrirait et interdirait la même clé');

  const sur = startupHint('id=home_root', 'home_root', CONFIG);
  assert.match(sur, new RegExp(prescrit[1]),
    `le message doit NOMMER ${prescrit[1]} : c'est le geste que la doc prescrit, et devant un flow `
    + 'rouge on relève la seule clé qu\'on nous cite');
  assert.match(sur, /Ne touche PAS/,
    `${interdit[1]} ne doit plus être cité comme un conseil : le relever relâche le gate qui `
    + 'rapporte la lenteur, ce qui est exactement le piège que le levier séparé ferme');
});

// ── La couverture dit-elle ce qu'elle ne couvre pas ? ────────────────────────
//
// Les trois relevés affichés dérivaient TOUS de `config.screens`, si bien que
// « 10 déclarés · 10 avec ancre » se lisait « tout est couvert » — alors que la
// comparaison visuelle n'en couvrait que quatre et que quatre états n'étaient
// montés qu'à l'étage 1. Le compteur ne mentait pas : il répondait à une
// question plus étroite que celle qu'on lui posait. Seizième run, point 158.
test('la couverture affiche le compte VISUEL, qui ne dérive pas de la même source', () => {
  const ligne = coverageLine({
    screensDeclared: 10, screensConfigured: 10, notConfigured: [],
    visualScreens: ['home-empty', 'history-empty', 'categories-empty', 'session-form'],
  });
  assert.match(ligne, /comparés visuellement : 4/,
    'sans ce compte, dix écrans « avec ancre » cachent six écrans que rien ne compare');
  assert.match(ligne, /ne veut donc pas dire/,
    'le relevé doit dire ce qu\'il NE dit pas : un état hors screens[] lui est invisible');
});

test('la couverture ne se tait pas sur les écrans sans ancre — et ne coupe qu\'un sens', () => {
  const avec = coverageLine({ screensDeclared: 3, screensConfigured: 2, notConfigured: ['runner-end'], visualScreens: [] });
  assert.match(avec, /runner-end/, 'un écran déclaré sans ancre doit être nommé, pas compté');

  // L'autre moitié : sur un relevé sain, aucune mention d'écran manquant ne doit
  // apparaître — un garde qui ne vérifie que l'alerte se satisfait d'un rapport
  // qui alerte toujours.
  const sain = coverageLine({ screensDeclared: 3, screensConfigured: 3, notConfigured: [], visualScreens: ['a'] });
  assert.ok(!/sans ancre/.test(sain), 'aucun écran ne manque : le rapport ne doit pas inventer une alerte');
  assert.match(sain, /comparés visuellement : 1/);

  // Et sans relevé du tout, la ligne disparaît au lieu de rendre « ? sur ? ».
  assert.equal(coverageLine(null), '');
});

// ── Le paramètre d'ancre porte-t-il le même nom aux deux endroits ? ──────────
//
// Le SKILL prescrivait le MÉCANISME (« le composant place lui-même l'ancre ») et
// montrait `<param d'ancre>` en placeholder : chaque projet inventait donc son
// nom. Conséquence mesurée au seizième run : le comparateur d'étalons cherchait
// `semanticId`, personne ne l'avait jamais employé, et son relevé rendait « 0 »
// depuis DOUZE runs sans que rien ne signale qu'il ne mesurait rien.
//
// Ce garde n'est pas circulaire : il compare deux endroits qui doivent dire la
// même chose — la prose qui prescrit, et le gabarit qui montre. Changer l'un
// sans l'autre le fait rougir, ce qu'aucune relecture ne voit.
test('le paramètre d\'ancre porte le MÊME nom dans la prose et dans le gabarit', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');

  const prescrit = skill.match(/\*\*Nomme ce paramètre `([A-Za-z]+)`\*\*/);
  assert.ok(prescrit, 'le SKILL ne prescrit plus de nom pour le paramètre d\'ancre. '
    + 'Si la phrase a été reformulée, mets ce motif à jour — sinon ce garde ne garde plus rien.');

  const lignes = skill.split('\n').filter((l) => l.includes('composant partagé,'));
  assert.equal(lignes.length, 1, 'le gabarit du rapport d\'instrumentation ne montre plus '
    + 'exactement une ligne de composant partagé — garde vacant');

  assert.ok(!/<[^>]+>/.test(lignes[0]),
    `le gabarit remontre un placeholder au lieu d'un nom : ${lignes[0]}`);
  assert.ok(lignes[0].includes(prescrit[1]),
    `le gabarit doit montrer ${prescrit[1]}, le nom que la prose prescrit — sinon on lit deux `
    + `conventions dans le même document : ${lignes[0]}`);
});

// ── Le device ciblé est-il celui qu'on a DÉCLARÉ ? ──────────────────────────
//
// `device-matrix.md` promet en titre qu'on désigne un device par son `avd` et
// non par son `udid`, et consacre un paragraphe au piège du port. Seul `run.mjs`
// tenait la promesse : trois voisins appelaient `defaultAndroidDevice()`, qui
// prenait le premier émulateur d'`adb devices`. Mesuré au dix-septième run, avec
// deux émulateurs branchés — `perf.mjs` a ciblé l'appareil d'un autre projet, et
// n'a crié que parce que l'app n'y était pas installée.
//
// ⚠️ Le garde décisif porte sur le CÂBLAGE, pas sur le comportement : `config`
// est un paramètre OPTIONNEL, donc ne pas le passer est légal, ne casse aucun
// test et fait retomber la production sur le défaut — en silence.
test('aucun script ne choisit un device sans lui passer la config', () => {
  const dir = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus');
  const scripts = readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  assert.ok(scripts.length >= 4,
    `motif introuvable : ${scripts.length} script(s) dans ${dir} — ce garde est vacant`);

  const sites = [];
  for (const f of scripts) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/defaultAndroidDevice\(([^)]*)\)/g)) {
      const arg = m[1].trim();
      if (arg === 'config = null') continue;   // la déclaration, pas un appel
      sites.push({ f, arg });
    }
  }
  assert.ok(sites.length >= 3,
    `${sites.length} appel(s) trouvé(s) : si la fonction a été renommée, mets ce motif à jour — `
    + 'sinon ce garde ne garde plus rien');

  const nus = sites.filter((s) => s.arg === '');
  assert.deepEqual(nus, [],
    'ces appels ignorent l\'AVD déclaré et cibleront le premier émulateur venu : '
    + JSON.stringify(nus));
});

test('l\'AVD déclaré est lu — et son absence ne fabrique rien', () => {
  assert.equal(androidAvdDeclared({ devices: [{ id: 'e', platform: 'android', avd: 'Medium_Phone_API_36.1' }] }),
    'Medium_Phone_API_36.1');

  // Un device sans `avd` ne doit rien rendre : c'est ce qui autorise le repli
  // sur « le premier émulateur », légitime quand personne n'a rien déclaré.
  assert.equal(androidAvdDeclared({ devices: [{ id: 'e', platform: 'android', avd: '' }] }), '');
  assert.equal(androidAvdDeclared({ devices: [] }), '');
  assert.equal(androidAvdDeclared(null), '');

  // Un AVD déclaré sur un device iOS ne concerne pas Android.
  assert.equal(androidAvdDeclared({ devices: [{ id: 's', platform: 'ios', avd: 'X' }] }), '');

  // Plateforme omise = android, comme partout ailleurs dans la config.
  assert.equal(androidAvdDeclared({ devices: [{ id: 'e', avd: 'Y' }] }), 'Y');
});

// ── « Une seule vide → le sous-flow skippe » : vrai pour combien d'ancres ? ──
//
// Le scaffold promettait, au-dessus des cinq ancres d'authentification : « Une
// seule vide → le sous-flow skippe en entier plutôt que d'échouer à mi-parcours
// sur un champ introuvable ». La condition du sous-flow ne regardait que
// `ARGUS_AUTH_USER` — une ancre sur cinq. Renseigner le champ identifiant en
// laissant l'écran vide faisait donc partir un `assertVisible` sur un id VIDE,
// c'est-à-dire précisément l'échec que la phrase disait éviter.
test('les CINQ ancres d\'authentification sont exigées, pas seulement une', () => {
  const pleines = { screen: 'a', user: 'b', password: 'c', submit: 'd', success: 'e' };
  assert.equal(authAnchorsReady(pleines), true, 'cinq ancres renseignées : le login doit s\'exécuter');

  // Chacune, retirée seule, doit suffire à faire skipper. C'est LA moitié qui
  // manquait : tester la seule qui marchait aurait laissé passer les quatre
  // autres, ce qui est exactement ce qui s'était produit.
  for (const k of Object.keys(pleines)) {
    const amputee = { ...pleines, [k]: '' };
    assert.equal(authAnchorsReady(amputee), false,
      `« ${k} » vide doit faire skipper le sous-flow — sinon il part et échoue à mi-parcours `
      + 'sur un identifiant vide, en accusant l\'app');
  }
  assert.equal(authAnchorsReady({ ...pleines, screen: '   ' }), false, 'une ancre blanche n\'est pas une ancre');
  assert.equal(authAnchorsReady(null), false);
});

test('le sous-flow de connexion LIT la décision, il ne la refait pas', () => {
  const yaml = readFileSync(
    join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/_subflows/login.yaml'),
    'utf8');
  const conditions = [...yaml.matchAll(/^\s+true: "\$\{([^}]*)\}"/gm)].map((m) => m[1]);
  assert.equal(conditions.length, 2,
    `${conditions.length} condition(s) trouvée(s) au lieu de 2 — si le sous-flow a été réécrit, `
    + 'mets ce motif à jour ; sinon ce garde est vacant');

  for (const c of conditions) {
    assert.ok(c.includes('ARGUS_AUTH_READY'),
      `une condition n'emploie pas ARGUS_AUTH_READY : ${c}`);
    // Reconstruire la décision dans le YAML est ce qui l'avait rendue fausse et
    // intestable : une seule ancre y était citée, et personne ne pouvait le voir.
    for (const nu of ['ARGUS_AUTH_SCREEN', 'ARGUS_AUTH_PASS', 'ARGUS_AUTH_SUBMIT', 'ARGUS_AUTH_SUCCESS']) {
      assert.ok(!c.includes(nu), `la condition refait la décision au lieu de la lire (${nu}) : ${c}`);
    }
  }
});

// ── Ce qui est DÉCLARÉ contre ce qui a été VU ───────────────────────────────
//
// `screensDeclared`, `screensConfigured` et `notConfigured` dérivent tous de
// `screens[]` : ils disent ce qu'on a écrit, jamais ce qu'on a testé. Un projet
// réel affichait « 12 sur 12 » pendant que quatre écrans n'étaient jamais
// atteints — leurs branches `goto.yaml` existaient, rien ne les appelait. La
// donnée était là (les `commands.json` que le runner relit déjà) et rien ne la
// dérivait. Dix-huitième run.
test('les écrans visités se dérivent des étapes EXÉCUTÉES, pas des fichiers', () => {
  const screens = [
    { id: 'home-empty', anchor: 'home_empty_root' },
    { id: 'history-filled', anchor: 'history_filled_root' },
    { id: 'sans-ancre' },
  ];
  const bundles = [{
    flow: 'smoke',
    steps: [
      { command: { assertVisibleCommand: { selector: { idRegex: 'home_empty_root' } } }, metadata: { status: 'COMPLETED' } },
      // Une étape SKIPPED ne prouve rien : la branche existait, elle n'a pas tourné.
      { command: { assertVisibleCommand: { selector: { idRegex: 'history_filled_root' } } }, metadata: { status: 'SKIPPED' } },
    ],
  }];

  assert.deepEqual(visitedScreens(bundles, screens), ['home-empty'],
    'seul un écran dont l\'ancre apparaît dans une étape COMPLETED compte comme visité');

  // L'autre moitié : un garde qui ne vérifie que l'exclusion se satisfait d'une
  // fonction qui n'inclut jamais rien.
  const tout = [{ flow: 'f', steps: [
    { command: { assertVisibleCommand: { selector: { idRegex: 'home_empty_root' } } }, metadata: { status: 'COMPLETED' } },
    { command: { assertVisibleCommand: { selector: { idRegex: 'history_filled_root' } } }, metadata: { status: 'COMPLETED' } },
  ] }];
  assert.deepEqual(visitedScreens(tout, screens), ['home-empty', 'history-filled']);

  // Un écran sans ancre ne peut pas être « visité » : rien ne le prouverait.
  assert.deepEqual(visitedScreens(tout, [{ id: 'sans-ancre' }]), []);
  assert.deepEqual(visitedScreens([], screens), []);
  assert.deepEqual(visitedScreens(null, screens), []);
});

test('le rapport NOMME les écrans déclarés que rien n\'a atteints', () => {
  const ligne = coverageLine({
    screensDeclared: 3, screensConfigured: 3, notConfigured: [],
    visited: ['home-empty'], notVisited: ['confirm-sheet', 'category-sheet'],
    visualScreens: ['home-empty'],
  });
  assert.match(ligne, /réellement visités par un flow : 1/);
  assert.match(ligne, /confirm-sheet/, 'un écran jamais atteint doit être NOMMÉ, pas compté');

  // Et sur un run où tout a été vu, aucune alerte ne doit apparaître : un
  // rapport qui alerte toujours n'alerte plus.
  const sain = coverageLine({
    screensDeclared: 2, screensConfigured: 2, notConfigured: [],
    visited: ['a', 'b'], notVisited: [], visualScreens: ['a'],
  });
  assert.ok(!/jamais visités/.test(sain));
  assert.match(sain, /réellement visités par un flow : 2/);

  // Un rapport d'avant ce relevé n'affiche simplement rien — pas « 0 visités »,
  // qui se lirait comme un échec alors que la donnée n'existait pas.
  const ancien = coverageLine({ screensDeclared: 2, screensConfigured: 2, notConfigured: [], visualScreens: [] });
  assert.ok(!/réellement visités/.test(ancien));
});

// ── L'encodage prescrit correspond-il au binaire de la commande donnée ? ────
//
// Le SKILL montrait comment compter un marqueur dans `kernel_blob.bin` (donc un
// build DEBUG), puis avertissait deux paragraphes plus bas que Dart stocke en
// Latin-1 ou UTF-16 — ce qui vaut pour l'AOT. Appliqué sous la commande qui le
// précède, ce conseil produit EXACTEMENT le zéro trompeur qu'il sert à éviter :
// on cherche en latin-1, on obtient 0, on conclut « le binaire est périmé ».
// Mesuré sur un binaire réel : « Première session » dans kernel_blob.bin rend
// 2 en UTF-8, 0 en latin-1, 0 en utf-16-le. Dix-huitième run.
//
// Ce garde n'est pas circulaire : il lie DEUX endroits qui doivent s'accorder —
// le binaire qu'ouvre la commande d'exemple, et la ligne du tableau qui décrit
// son encodage.
test('le binaire de la commande d\'exemple a sa ligne dans le tableau des encodages', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');

  const cmd = skill.match(/unzip -p [^\n]*?([A-Za-z0-9_.]+\.bin)/);
  assert.ok(cmd, 'la commande d\'exemple qui compte un marqueur a disparu du SKILL — '
    + 'si elle a été réécrite, mets ce motif à jour ; sinon ce garde ne garde plus rien');

  const lignes = skill.split('\n').filter((l) => /^\| (debug|release)/.test(l));
  assert.equal(lignes.length, 2,
    `${lignes.length} ligne(s) de tableau au lieu de 2 — le tableau des encodages a changé de forme`);

  const ligneDuBinaire = lignes.find((l) => l.includes(cmd[1]));
  assert.ok(ligneDuBinaire,
    `${cmd[1]} est le binaire que la commande ouvre, et aucune ligne du tableau ne le décrit : `
    + 'le lecteur appliquera l\'encodage de l\'autre mode');

  // Et les deux modes ne doivent partager AUCUN encodage : c'est tout l'intérêt
  // du tableau.
  //
  // ⚠️ Comparer les deux cellules par égalité ne suffit pas, et c'est la mutation
  // qui l'a montré — pas la relecture. Écrire « **Latin-1** » côté debug laisse
  // les chaînes DIFFÉRENTES de « **Latin-1**, ou **UTF-16** dès que… », donc un
  // `notEqual` passe au vert sur un tableau qui ne distingue plus rien. Le
  // critère porte sur les encodages NOMMÉS, pas sur le texte qui les entoure.
  const encodagesDe = (/** @type {string} */ ligne) =>
    new Set((ligne.match(/UTF-8|UTF-16|Latin-1/g) ?? []));
  const [a, b] = lignes.map(encodagesDe);
  assert.ok(a.size > 0 && b.size > 0,
    'une ligne du tableau ne nomme aucun encodage connu — ce garde ne mesure plus rien');
  const communs = [...a].filter((e) => b.has(e));
  assert.deepEqual(communs, [],
    `debug et release annoncent le même encodage (${communs.join(', ')}) : le tableau ne `
    + 'distingue plus rien, et c\'est précisément ce qu\'il existe pour dire');
});

// ── La locale déclarée par le harnais est-elle APPLIQUÉE ? ──────────────────
//
// `MaterialApp` résout sa locale effective en croisant `locale` avec
// `supportedLocales`, dont le défaut est `[Locale('en','US')]` : une locale non
// supportée est purement IGNORÉE. Le harnais passait `locale: fr_FR` sans la
// liste, donc il déclarait le français et montait en anglais — sans exception,
// sans log. Tout ce qui vient de Material était mesuré dans la mauvaise langue,
// donc à la mauvaise largeur. Dix-neuvième run.
//
// Garde de CÂBLAGE : omettre `supportedLocales` compile et ne casse rien.
test('le montage déclare supportedLocales, sinon sa locale est ignorée', () => {
  const dir = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus');
  const harnais = readFileSync(join(dir, 'argus_harness.dart'), 'utf8');

  const materialApp = harnais.indexOf('MaterialApp(');
  assert.notEqual(materialApp, -1,
    'le montage n\'emploie plus MaterialApp — si le harnais a été réécrit, mets ce motif à jour ; '
    + 'sinon ce garde ne garde plus rien');

  // La locale passée et la liste qui la rend applicable doivent coexister : la
  // première sans la seconde est un réglage qui n'a aucun effet.
  const bloc = harnais.slice(materialApp, materialApp + 1200);
  const passeLocale = /\blocale:\s*(\w+)/.exec(bloc);
  assert.ok(passeLocale, 'le montage ne passe plus de locale du tout');
  assert.match(bloc, /supportedLocales:/,
    `le montage passe « locale: ${passeLocale[1]} » sans supportedLocales : MaterialApp l'ignorera `
    + 'et montera en en_US, ce qui mesure la disposition dans la mauvaise langue');
  assert.ok(new RegExp(`supportedLocales:[^;]*${passeLocale[1]}`).test(bloc),
    `supportedLocales doit contenir ${passeLocale[1]} — une liste qui ne l'inclut pas laisse la `
    + 'locale déclarée sans effet, ce qui est exactement le défaut qu\'on ferme');
});

// ── Le binaire scanné porte-t-il le code qu'on vient d'écrire ? ─────────────
//
// Un relevé peut être frais et son SUJET périmé — indiscernable dans le rapport.
// Au dix-neuvième run, `sec.json` venait d'être écrit et concluait « obfusqué,
// pas un debug, 0 secret » sur un APK construit CINQUANTE MINUTES avant
// l'instrumentation. Le mécanisme de péremption compare les relevés entre eux,
// jamais un relevé à son objet : il affirmait `staleParts: []`.
test('un binaire plus vieux que le code est signalé comme tel', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'argus-fresh-'));
  mkdirSync(join(dossier, 'lib'), { recursive: true });
  writeFileSync(join(dossier, 'lib', 'main.dart'), '// code');
  const apk = join(dossier, 'app.apk');
  writeFileSync(apk, 'binaire');

  // Horloge injectée : le binaire précède la source d'une heure.
  const dates = { [apk]: 1000, [join(dossier, 'lib', 'main.dart')]: 1000 + 3600_000 };
  const vieux = binaryFreshness(apk, dossier, (f) => dates[f] ?? 0);
  assert.equal(vieux?.stale, true,
    'un binaire antérieur au code ne peut pas le contenir : ses verdicts décrivent autre chose');

  // L'autre moitié — un garde qui ne sait que crier ne garde rien : un binaire
  // construit APRÈS le code est parfaitement légitime et doit se taire.
  const frais = binaryFreshness(apk, dossier, (f) => (f === apk ? 9_000_000 : 1000));
  assert.equal(frais?.stale, false);

  // Sans sources Dart, on ne prétend pas juger : null, pas « frais ».
  rmSync(join(dossier, 'lib'), { recursive: true, force: true });
  assert.equal(binaryFreshness(apk, dossier, () => 1000), null,
    'aucune source lue : rendre « frais » serait affirmer ce qu\'on n\'a pas mesuré');

  // Et un binaire absent ne doit pas faire tomber le scan entier.
  assert.equal(binaryFreshness(join(dossier, 'absent.apk'), dossier), null);
  rmSync(dossier, { recursive: true, force: true });
});

test('le rapport de sécurité DATE le binaire qu\'il a jugé', () => {
  const sec = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/sec.mjs'), 'utf8');
  // Le chemin seul ne suffit pas : deux binaires au même chemin, à deux heures
  // différentes, rendent le même rapport.
  assert.match(sec, /builtAt:/,
    'sec.json doit dater le binaire jugé — sans quoi rien ne distingue un verdict sur le binaire '
    + 'du jour d\'un verdict sur celui d\'avant-hier');
  assert.match(sec, /stale:\s*fraicheur\.stale/,
    'et dire s\'il précède le code, ce que le lecteur du rapport ne peut pas deviner');
});

// ── Le compteur d'ancres compte-t-il le code, ou l'exemple ? ────────────────
//
// Les chiffres du rapport d'instrumentation ouvrent le premier livrable du
// skill. Aucune commande n'était prescrite pour les obtenir, et DEUX compteurs
// sont tombés dans le même piège à seize runs d'écart : le dartdoc d'exemple de
// `harness.dart` porte `anchor: 'home_root'` et consorts, qu'un grep naïf compte
// comme de vraies ancres. Un run a annoncé dix-sept écrans et deux ancres
// inexistantes ; mon propre comparateur avait le défaut au run 3.
//
// Ce garde ne relit pas la prose : il EXÉCUTE le comptage prescrit sur le
// fichier livré, qui ne contient aucune vraie ancre.
test('le comptage prescrit rend zéro sur le harnais livré — et le naïf, non', () => {
  const harnais = join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/harness.dart');
  const lignes = readFileSync(harnais, 'utf8').split('\n');

  const horsCommentaire = lignes.filter((l) => !/^\s*\/\/\//.test(l));
  const compte = (/** @type {string[]} */ src, /** @type {string} */ motif) =>
    src.filter((l) => l.includes(motif)).length;

  // ⚠️ CONTRE-ÉPREUVE D'ABORD : si l'exemple ne portait plus d'ancres, le filtre
  // ne servirait à rien et ce garde passerait au vert sans rien mesurer.
  assert.ok(compte(lignes, 'anchor:') > 0,
    'le dartdoc d\'exemple ne porte plus d\'ancre : ce garde ne mesure plus la différence '
    + 'entre un compteur filtré et un compteur naïf — mets-le à jour ou retire-le');

  assert.equal(compte(horsCommentaire, 'anchor:'), 0,
    'le harnais LIVRÉ ne contient aucune vraie ancre : un compteur qui en trouve lit le commentaire');
  assert.equal(compte(horsCommentaire, 'ArgusScreen('), 0,
    'idem pour les écrans — c\'est ainsi qu\'un run a rapporté dix-sept écrans pour zéro');

  // Et le SKILL doit prescrire ce filtre sur CHAQUE comptage, pas quelque part.
  //
  // ⚠️ Ce garde vérifiait d'abord la simple PRÉSENCE d'un `grep -v` dans la page :
  // retirer le filtre d'une des deux commandes le laissait vert, puisque l'autre
  // le portait encore. C'est la mutation qui l'a dit, pas la relecture — la
  // deuxième fois qu'un garde trop littéral passe à côté de son sujet.
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const comptages = skill.split('\n').filter((l) => /grep -c .*harness\.dart|harness\.dart.*grep -c/.test(l));
  assert.ok(comptages.length >= 2,
    `${comptages.length} commande(s) de comptage sur harness.dart dans le SKILL — si le bloc a été `
    + 'réécrit, mets ce motif à jour ; sinon ce garde ne garde plus rien');
  const sansFiltre = comptages.filter((l) => !l.includes('grep -v'));
  assert.deepEqual(sansFiltre, [],
    'ces comptages liront le dartdoc d\'exemple et rendront des ancres qui n\'existent pas : '
    + JSON.stringify(sansFiltre));
});

// ── Le compteur voit-il les FAMILLES, ou seulement les littéraux ? ──────────
//
// Le point 171 avait fermé un compteur qui lisait le commentaire ; son
// remplaçant ne mentait plus sur ce qu'il comptait, mais il ne comptait pas ce
// que le rapport demande. Une ancre écrite `identifier: 'nav_${spec.id}'` est UN
// site et N ancres. Mesuré sur un projet réel : 31 sites littéraux dans `lib/`
// pour 82 ancres déclarées, tout l'écart venant de deux gabarits.
//
// ⚠️ Ce garde EXÉCUTE la commande telle qu'elle est écrite dans le SKILL, sur un
// cas qui porte un gabarit. C'est la seule forme qui vaille : en la testant à la
// main dans un autre shell que celui qui la lira, j'ai mesuré `0` là où elle rend
// `1`, et j'ai failli inscrire cette fausse mesure dans le SKILL. Une exécution
// ne mesure que si elle a lieu dans les conditions réelles. Vingtième run.
test('la commande prescrite VOIT un gabarit interpolé', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const ligne = skill.split('\n').find((l) => l.startsWith('grep') && l.includes('${'));
  assert.ok(ligne, 'le SKILL ne prescrit plus de commande pour compter les gabarits interpolés — '
    + 'si le bloc a été réécrit, mets ce motif à jour ; sinon ce garde ne garde plus rien');

  const dossier = mkdtempSync(join(tmpdir(), 'argus-compte-'));
  mkdirSync(join(dossier, 'lib'), { recursive: true });
  writeFileSync(join(dossier, 'lib', 'avec.dart'),
    "      identifier: 'nav_${spec.id}',\n      identifier: 'home_root',\n");
  // ⚠️ `grep -c` imprime son compte ET SORT EN 1 quand ce compte est zéro, donc
  // `execFileSync` lève sur le cas même que la contre-épreuve doit mesurer. Lire
  // `e.stdout` plutôt que laisser passer l'exception — c'est le piège du point 70,
  // dans lequel ce garde est tombé à l'écriture.
  const lancer = () => {
    try {
      return execFileSync('bash', ['-c', ligne], { cwd: dossier, encoding: 'utf8' }).trim();
    } catch (e) {
      return String(/** @type {any} */ (e).stdout ?? '').trim();
    }
  };

  assert.equal(lancer(), '1',
    `la commande prescrite rend « ${lancer()} » sur un fichier qui porte UN gabarit : `
    + 'en doubles quotes le shell mange ${ et elle rendrait 0 sans rien dire');

  // Contre-épreuve : sans gabarit, elle doit rendre 0 et non « tout ».
  writeFileSync(join(dossier, 'lib', 'avec.dart'), "      identifier: 'home_root',\n");
  assert.equal(lancer(), '0', 'un fichier sans gabarit ne doit rien rendre — sinon elle compte les littéraux');

  // Et le SKILL doit DIRE que le compte de lib/ est un plancher : sans cette
  // phrase, les deux chiffres se lisent comme le même, ce qui est le défaut.
  assert.match(skill, /PLANCHER, pas le chiffre du rapport/,
    'le SKILL ne dit plus que le compte de lib/ n\'est pas celui du rapport');
  rmSync(dossier, { recursive: true, force: true });
});

// ── La taille pèse-t-elle ce dont elle parle ? ──────────────────────────────
//
// `build.android` est le binaire que le runner installe : un debug presque
// toujours, ni minifié ni découpé. Le peser contre un budget écrit pour ce qui
// sort rend un finding qui décrit l'outillage. Mesuré au vingt-et-unième run :
// 92 Mo en debug (major) contre 30,2 Mo pour la release du même code, sous le
// budget de 60. Même famille que le 168 — un verdict sur un binaire dont on ne
// parle pas.
test('la taille pèse la RELEASE quand elle existe, et le dit quand ce n\'est pas elle', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'argus-poids-'));
  const release = join(dossier, 'release.apk');
  const debug = join(dossier, 'debug.apk');
  writeFileSync(debug, 'x');
  const cwd = process.cwd();
  process.chdir(dossier);
  try {
    // Sans release sur le disque, on pèse le binaire de test — et `isRelease`
    // dit que ce n'en est pas une, ce qui est la moitié qui manquait.
    const sansRelease = binaryToWeigh('android', { build: { android: debug, androidScan: release } });
    assert.equal(sansRelease.path, debug);
    assert.equal(sansRelease.isRelease, false,
      'déclarer androidScan ne suffit pas : le fichier doit exister, sinon on pèserait du vide');

    // Dès qu'elle est là, c'est elle qui compte.
    writeFileSync(release, 'y');
    const avec = binaryToWeigh('android', { build: { android: debug, androidScan: release } });
    assert.equal(avec.path, release);
    assert.equal(avec.isRelease, true);

    // Et sans androidScan du tout, on retombe sur le test sans prétendre autre chose.
    const nu = binaryToWeigh('android', { build: { android: debug } });
    assert.equal(nu.path, debug);
    assert.equal(nu.isRelease, false);
  } finally {
    process.chdir(cwd);
    rmSync(dossier, { recursive: true, force: true });
  }
});

// ⚠️ ET LE CÂBLAGE, sans quoi le garde ci-dessus est aveugle : la fonction peut
// rester parfaite pendant que `main()` cesse de l'appeler. C'est exactement ce
// qui s'est produit — la mutation a remplacé l'appel, et le test de comportement
// est resté vert. Même angle mort que pour le choix de device.
test('perf.mjs APPELLE binaryToWeigh au lieu de lire build.android en direct', () => {
  const perf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs'), 'utf8');

  const appels = [...perf.matchAll(/binaryToWeigh\(/g)];
  assert.ok(appels.length >= 2,
    `${appels.length} occurrence(s) de binaryToWeigh dans perf.mjs — la déclaration et au moins `
    + 'un appel sont attendus ; si la fonction a été renommée, mets ce motif à jour');

  // Le site de mesure ne doit plus lire le binaire de test en direct : c'est
  // cette lecture-là qui pesait le debug contre un budget de publication.
  const mesure = perf.split('\n').filter((l) => l.includes('binarySizeMb(') && l.includes('resolve('));
  assert.equal(mesure.length, 1, `${mesure.length} site(s) de mesure de taille au lieu d'un`);
  assert.ok(!/config\.build\.(android|ios)\b/.test(mesure[0]),
    `le site de mesure relit build.* en direct et contourne binaryToWeigh : ${mesure[0].trim()}`);
});

// ── Contrat d'injection : aucune variable de flow sans producteur ────────────
//
// Ce garde ne vérifie pas une valeur, il vérifie un CÂBLAGE — et il le fait dans
// les DEUX sens, parce que les deux pannes sont muettes :
//
//   flow → runner  : un flow qui cite `${ARGUS_X}` que personne ne produit reçoit
//                    la chaîne littérale « ${ARGUS_X} ». Aucune erreur : Maestro
//                    cherche un élément d'identifiant « ${ARGUS_X} », ne le
//                    trouve pas, et l'échec accuse l'écran.
//   runner → flow  : une clé produite que plus aucun flow ne lit est de la
//                    configuration morte. C'est exactement ce qui est arrivé à
//                    `visualCropOn` : déclarée, documentée, commentée dans trois
//                    fichiers, et jamais lue — au point que la méthodologie
//                    expliquait, chiffres mesurés à l'appui, comment soigner un
//                    réglage qui ne faisait rien.
//
// Il est DÉRIVÉ des deux sources, jamais d'une liste tenue à la main : une liste
// aurait vieilli à la première variable ajoutée, et se serait tue précisément
// là où elle devait parler.

const FLOWS_DIR = fileURLToPath(new URL('../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/', import.meta.url));

/** Tous les fichiers de flow, sous-flows compris. @returns {string[]} */
function flowFiles(dir = FLOWS_DIR) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? flowFiles(join(dir, e.name)) : e.name.endsWith('.yaml') ? [join(dir, e.name)] : []
  ));
}

/** Les variables `${…}` que les flows attendent du runner. @returns {Set<string>} */
function varsUsedInFlows() {
  /** @type {Set<string>} */
  const used = new Set();
  for (const file of flowFiles()) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\$\{\s*([A-Z][A-Z0-9_]*)\s*\}/g)) used.add(m[1]);
    // Maestro accepte aussi la forme nue dans une expression JS (`when:`).
    for (const m of readFileSync(file, 'utf8').matchAll(/\b(ARGUS_[A-Z0-9_]+)\b/g)) used.add(m[1]);
  }
  return used;
}

/** Le contrat produit par le runner pour une config donnée. */
const contrat = (/** @type {any} */ config) => buildEnv(config, 'com.exemple.app');

test('toute variable ARGUS_ citée par un flow est produite par le runner', () => {
  const used = [...varsUsedInFlows()].filter((v) => v === 'APP_ID' || v.startsWith('ARGUS_'));
  // Sans ce premier contrôle, un renommage de dossier viderait la boucle et le
  // garde passerait au vert en n'ayant plus rien à vérifier.
  assert.ok(used.length >= 10, `relevé vide ou tronqué (${used.length}) — les flows ont-ils bougé ?`);

  const produced = new Set(Object.keys(contrat({})));
  const orphelines = used.filter((v) => !produced.has(v));
  assert.deepEqual(orphelines, [],
    'ces variables seraient substituées par leur propre texte, et l\'échec accuserait l\'écran');
});

test('toute variable produite par le runner est lue par au moins un flow', () => {
  const used = varsUsedInFlows();
  const produced = Object.keys(contrat({})).filter((k) => k === 'APP_ID' || k.startsWith('ARGUS_'));
  assert.ok(produced.length >= 10, `contrat vide ou tronqué (${produced.length})`);

  const mortes = produced.filter((k) => !used.has(k));
  assert.deepEqual(mortes, [],
    'clé produite que plus aucun flow ne lit : de la configuration morte, le défaut que ce garde existe pour attraper');
});

test('visualCropOn arrive jusqu\'au flow, et vide veut dire plein écran', () => {
  // Le câblage, pas la valeur : c'est de ne pas l'avoir que la clé était morte.
  assert.equal(contrat({ visualCropOn: 'home_content' }).ARGUS_VISUAL_CROP, 'home_content');

  // Vide DOIT rester vide : le flow s'en sert pour choisir la branche non
  // recadrée. Y mettre un repli ferait chercher un élément qui n'existe pas.
  assert.equal(contrat({}).ARGUS_VISUAL_CROP, '');
  assert.equal(contrat({ visualCropOn: '' }).ARGUS_VISUAL_CROP, '');
});

test('les deux branches de cadrage existent, en capture comme en comparaison', () => {
  const flow = readFileSync(join(FLOWS_DIR, 'visual.yaml'), 'utf8');

  // ⚠️ Compter les MENTIONS compte aussi les commentaires — dont le mien, écrit
  // deux lignes plus haut pour expliquer pourquoi la branche vide existe. Le
  // relevé ancré sur la ligne YAML rendait 3 au lieu de 2 : un garde peut
  // naître faux en attrapant le texte qui le documente.
  const clesYaml = (/** @type {string} */ nom) => [
    ...flow.matchAll(new RegExp(`^[ \\t]*(?:-[ \\t]+)?${nom}:[ \\t]*$`, 'gm')),
  ].length;

  // Une seule branche suffirait à passer le garde précédent tout en cassant
  // l'autre moitié : Maestro exige que la RÉFÉRENCE ait été recadrée pareil.
  assert.equal(clesYaml('cropOn'), 2, 'il en faut une sur takeScreenshot ET une sur assertScreenshot');
  assert.equal(clesYaml('takeScreenshot'), 2, 'update : une branche recadrée, une plein écran');
  assert.equal(clesYaml('assertScreenshot'), 2, 'assert : une branche recadrée, une plein écran');
});

// ── Aucune clé de configuration sans lecteur ─────────────────────────────────
//
// `visualCropOn` n'était pas seule : le relevé dérivé en a trouvé ONZE autres du
// même genre — un seuil de crash que rien ne compte, des échelles de texte
// dupliquées de `harness.dart`, une forme d'authentification que personne
// n'interroge, un `failOnNewFinding` qui supposait un run précédent qu'aucun
// mécanisme ne conserve. Aucune ne produit d'erreur ; toutes se lisent comme des
// réglages, et deux se lisaient comme des garanties.
//
// Le critère est TOTAL et NÉGATIF — « aucune feuille de DEFAULTS sans lecteur »,
// où que ce soit — et non la liste des cas déjà vus. La direction compte : large
// moins les exceptions, jamais étroit plus ce qu'on a rencontré. Il n'y a
// d'ailleurs aucune exception, et c'est délibéré : une clé lue par l'agent et
// non par un script est une instruction, sa place est dans la prose.

const SCRIPTS_DIR = fileURLToPath(new URL('../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/', import.meta.url));

/** Le bloc DEFAULTS, lu dans la source — le seul endroit qui l'énumère. */
function defaultsSource() {
  const src = readFileSync(join(SCRIPTS_DIR, 'config.mjs'), 'utf8');
  const m = src.match(/const DEFAULTS = (\{[\s\S]*?\n\});/);
  assert.ok(m, 'bloc DEFAULTS introuvable dans config.mjs — le relevé ne mesure plus rien');
  return m[1];
}

/** Chemins pointés de toutes les feuilles de DEFAULTS. @returns {string[]} */
function defaultsLeaves() {
  const defaults = new Function(`return (${defaultsSource()});`)();
  /** @type {string[]} */
  const leaves = [];
  (function walk(/** @type {any} */ node, /** @type {string[]} */ path) {
    for (const [k, v] of Object.entries(node)) {
      const next = [...path, k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) walk(v, next);
      else leaves.push(next.join('.'));
    }
  })(defaults, []);
  return leaves;
}

/**
 * Le code des scripts, commentaires ôtés et bloc DEFAULTS exclu.
 *
 * Les deux retraits comptent. Un commentaire qui CITE une clé la ferait passer
 * pour lue — c'est exactement ainsi qu'un garde naît vacant, en attrapant le
 * texte qui le documente. Et DEFAULTS déclare les clés, il ne les lit pas :
 * l'y laisser rendrait chacune vivante par sa seule existence.
 */
function codeDesScripts() {
  const bloc = defaultsSource();
  return readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.mjs')).map((f) => {
    const brut = readFileSync(join(SCRIPTS_DIR, f), 'utf8').replace(bloc, '');
    return brut.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  }).join('\n');
}

/**
 * Le code des scripts, littéraux de chaîne ôtés EN PLUS des commentaires.
 *
 * ⚠️ POINT 192, resté ouvert deux passes. Le corpus ci-dessus retire les
 * commentaires, pas les CHAÎNES — si bien qu'une clé simplement CITÉE par un
 * message d'aide passait pour lue. Mesuré : la mutation qui retire la seule
 * lecture de `artifact.icon` laissait le garde vert, parce que le message de
 * publication écrit « argus.mobile.yaml → artifact.title / artifact.icon ».
 *
 * ⚠️ ET LE DURCISSEMENT ÉVIDENT EST FAUX — c'est ce qui l'avait fait laisser
 * ouvert. Retirer les chaînes par regex (`/'(?:[^'\\]|\\.)*'/`) fait
 * apparaître SEPT clés mortes qui ne le sont pas : une apostrophe française
 * dans une chaîne à guillemets doubles (`"aujourd'hui"`) ouvre un appariement
 * qui avale le code jusqu'à la quote suivante. Il faut donc balayer de GAUCHE À
 * DROITE — la première quote rencontrée décide —, ce qu'une expression
 * régulière ne sait pas faire.
 *
 * Ce que ce balayage garde délibérément : le CODE des `${…}`, qui est du vrai
 * code (`${config.artifact.icon}` EST une lecture), et les bornes des chaînes,
 * pour que la syntaxe alentour reste lisible.
 *
 * ⚠️ Il se scanne FICHIER PAR FICHIER, jamais sur la concaténation : un état
 * mal refermé en fin de fichier mangerait le suivant. Et le shebang saute — son
 * `#!/usr/bin/env` se lit sinon comme un littéral de regex, `/usr/` compris.
 */
function codeSansLitteraux(source) {
  const src = source.startsWith('#!') ? source.slice(source.indexOf('\n')) : source;
  const n = src.length;
  let out = '', i = 0, prev = '';
  /** Pile : nombre d'accolades ouvertes dans le `${}` courant, par template. */
  const tpl = [];
  const garder = (/** @type {string} */ c) => { out += c; if (!/\s/.test(c)) prev = c; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') { out += '\n'; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
      i += 2; out += ' '; continue;
    }
    if (c === '\'' || c === '"') {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; if (src[i] === '\n') out += '\n'; i++; }
      i++; out += q + q; prev = q; continue;
    }
    if (c === '`') {                       // on entre dans un template : texte sauté
      tpl.push(0); i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '\n') { out += '\n'; i++; continue; }
        if (src[i] === '`') { tpl.pop(); i++; break; }
        if (src[i] === '$' && src[i + 1] === '{') { out += ' '; i += 2; break; }  // ${ → retour au code
        i++;
      }
      continue;
    }
    if (c === '}' && tpl.length && tpl[tpl.length - 1] === 0) {
      // fin du `${}` : on retourne au texte du template, sans le consommer
      out += ' '; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '\n') { out += '\n'; i++; continue; }
        if (src[i] === '`') { tpl.pop(); i++; break; }
        if (src[i] === '$' && src[i + 1] === '{') { out += ' '; i += 2; break; }
        i++;
      }
      continue;
    }
    if (tpl.length) {                      // suivi des accolades DANS un ${}
      if (c === '{') tpl[tpl.length - 1]++;
      else if (c === '}') tpl[tpl.length - 1]--;
    }
    if (c === '/' && /[=(,:[!&|?{};+\-*%^~<>]/.test(prev)) {
      i++; let classe = false;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') classe = true;
        else if (src[i] === ']') classe = false;
        else if (src[i] === '/' && !classe) { i++; break; }
        else if (src[i] === '\n') break;
        i++;
      }
      out += ' '; prev = '/'; continue;
    }
    garder(c); i++;
  }
  return out;
}

/** Les scripts, commentaires ET littéraux ôtés — scannés un par un. */
function codeSansChaines() {
  const bloc = defaultsSource();
  return readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.mjs'))
    .map((f) => codeSansLitteraux(readFileSync(join(SCRIPTS_DIR, f), 'utf8').replace(bloc, '')))
    .join('\n');
}

test('toute clé de argus.mobile.yaml est lue par au moins un script', () => {
  const leaves = defaultsLeaves();
  assert.ok(leaves.length >= 40, `relevé vide ou tronqué (${leaves.length}) — DEFAULTS a-t-il changé de forme ?`);

  // ⚠️ Corpus SANS LES CHAÎNES (point 192) : une clé citée par un message d'aide
  // n'est pas une clé lue. Le collecteur du point 216, lui, garde les littéraux
  // — ils SONT des noms de clés chez lui. Deux corpus, deux raisons.
  const code = codeSansChaines();
  assert.ok(code.length > 10000, 'corpus vide : les scripts ont-ils bougé de dossier ?');
  // Non-vacance du balayage : s'il avalait le code, TOUTES les clés paraîtraient
  // mortes et l'assertion suivante crierait — mais s'il n'avalait RIEN, elle
  // resterait verte sans rien mesurer. On exige donc que la mention connue soit
  // bien partie, et que le corpus reste de taille plausible.
  assert.doesNotMatch(code, /argus\.mobile\.yaml → artifact\.title/,
    'le balayage ne retire plus les chaînes — une clé citée par un message repasse pour lue');
  assert.ok(code.length > codeDesScripts().length * 0.45,
    `le balayage a mangé le code (${code.length} contre ${codeDesScripts().length}) : ses états ne se referment pas`);

  // Lue = ACCÉDÉE (`config.x?.y`), pas mentionnée. C'est la forme réelle d'un
  // lecteur, et la seule qu'un commentaire ne peut pas imiter une fois les
  // commentaires retirés.
  const mortes = leaves.filter((p) => {
    const cle = p.split('.').pop() ?? '';
    return !new RegExp(`\\.\\s*${cle}\\b`).test(code);
  });
  assert.deepEqual(mortes, [],
    'clés déclarées, documentées, et que rien ne lit : les renseigner ne change rien, mais elles se lisent comme des réglages');
});

// ── …et aucune clé LUE que rien ne déclare — la direction symétrique ─────────
//
// Point 216. Le garde ci-dessus balaie « déclarée mais sans lecteur » ; l'autre
// sens n'était couvert par rien, et `iosScan` y a vécu : QUATRE sites la
// lisaient, le scaffold ne la mentionnait nulle part, et un message d'erreur
// envoyait pourtant la renseigner. Le seul moyen d'apprendre qu'elle existait
// était de lire le code des scripts.
//
// ⚠️ LE MOTIF A ÉTÉ RESSERRÉ APRÈS MESURE. Sa première version cherchait
// `build?.X` sans l'ancrer sur `config`, et rapportait une clé `version` —
// qui venait de la chaîne `'ro.build.version.sdk'`, une propriété système
// Android. Un motif trop large ne fait pas que compter faux : celui-là allait
// faire DÉCLARER dans le scaffold une clé qui n'existe pas.

/** Les clés que les scripts lisent réellement sous `build:`. @returns {string[]} */
function buildKeysRead() {
  const code = codeDesScripts();
  /** @type {Set<string>} */
  const cles = new Set();
  // 1. l'accès pointé, ancré sur `config` — c'est l'ancrage qui écarte
  //    `ro.build.version.sdk` et les autres `build.` qui ne sont pas la config.
  for (const m of code.matchAll(/config\s*\??\.\s*build\s*\??\.\s*([A-Za-z_]\w*)/g)) cles.add(m[1]);
  // 2. le sélecteur DYNAMIQUE : `(config.build ?? {})[cle]`, où `cle` sort d'un
  //    ternaire sur la plateforme. Aucun accès pointé ne le montre — c'est
  //    précisément la forme sous laquelle `iosScan` se cachait.
  for (const m of code.matchAll(/platform === 'ios' \? '([A-Za-z_]\w*)' : '([A-Za-z_]\w*)'/g)) {
    cles.add(m[1]); cles.add(m[2]);
  }
  // 3. l'alias local, résolu PAR SA PORTÉE et non par un motif large : `b` seul
  //    attrapait trois identifiants sans rapport.
  for (const m of code.matchAll(/const b = config\??\.build \?\? \{\};/g)) {
    const depuis = code.slice(m.index);
    const portee = depuis.slice(0, depuis.indexOf('\n}') + 1);
    for (const x of portee.matchAll(/(?<![\w$.])b\s*\??\.\s*([A-Za-z_]\w*)/g)) cles.add(x[1]);
  }
  return [...cles].sort();
}

test('toute clé build LUE par un script est déclarée dans le scaffold livré', () => {
  const lues = buildKeysRead();

  // ⚠️ NON-VACANCE, DÉRIVÉE : les clés que DEFAULTS déclare sous `build` sont
  // forcément lues quelque part. Si le collecteur en rate une, il est cassé —
  // et ce contrôle-ci le dit AVANT que l'assertion suivante ne rende un vert
  // qui ne mesurerait rien. Dérivé plutôt qu'écrit à la main : une liste
  // recopiée ici se périmerait à la première clé ajoutée.
  const declarees = Object.keys(new Function(`return (${defaultsSource()});`)().build ?? {});
  assert.ok(declarees.length >= 4, `DEFAULTS.build a changé de forme (${declarees.length} clés)`);
  const ratees = declarees.filter((k) => !lues.includes(k));
  assert.deepEqual(ratees, [],
    'le collecteur ne voit plus des clés que DEFAULTS déclare — il est cassé, '
    + 'et l\'assertion suivante rendrait un vert qui ne mesure rien');

  const yaml = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml'), 'utf8');
  // Déclarée OU commentée : une clé optionnelle se documente en commentaire,
  // c'est ce que fait déjà `androidScan`. Ce qui est interdit, c'est le silence.
  const muettes = lues.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(yaml));
  assert.deepEqual(muettes, [],
    'clés que les scripts LISENT et que le scaffold ne mentionne nulle part : '
    + 'un message peut envoyer les renseigner, on ne les trouve qu\'en lisant le code');
});

test('le budget d\'exécution se compare vraiment à ce qui a été dépensé', () => {
  const config = { budget: { maxMinutes: 25, maxFlows: 40 } };
  const ilYA = (/** @type {number} */ minutes) => new Date(Date.now() - minutes * 60000);

  // Sous le budget : rien. Un garde qui parle toujours n'informe plus.
  assert.deepEqual(budgetVerdict(config, ilYA(3), 12).warnings, []);

  // Chaque moitié compte séparément — un run court peut noyer la CI de flows,
  // un run d'un seul flow peut durer une heure.
  assert.equal(budgetVerdict(config, ilYA(40), 12).warnings.length, 1);
  assert.equal(budgetVerdict(config, ilYA(3), 99).warnings.length, 1);
  assert.equal(budgetVerdict(config, ilYA(40), 99).warnings.length, 2);

  // Le relevé est publié quoi qu'il arrive : c'est lui qu'on relit six mois
  // plus tard pour savoir si le budget était réaliste.
  const v = budgetVerdict(config, ilYA(10), 7);
  assert.equal(v.flows, 7);
  assert.ok(v.minutes >= 9.9 && v.minutes <= 10.1, `durée mesurée aberrante : ${v.minutes}`);

  // Budget à zéro = pas de budget, pas un budget impossible à tenir.
  assert.deepEqual(budgetVerdict({}, ilYA(600), 9999).warnings, []);
});

// ── Quelles dimensions un `--tags` demande-t-il vraiment ? ───────────────────
//
// La dimension visuelle a sa PROPRE boucle : un flow Maestro ne sait ni itérer
// sur des écrans ni naviguer vers chacun, donc c'est le runner qui rappelle
// visual.yaml une fois par écran. La suite principale exclut donc toujours
// `visual` — et demander `--tags=visual` lui laissait un ensemble vide, qu'elle
// exécutait quand même : une JVM Maestro démarrée pour rien, dont la seule
// sortie était la ligne de skip du flow visuel.
//
// ⚠️ Un relevé de terrain en a conclu que `make argus-visual` « ne fait pas de
// régression visuelle ». Mesuré avant de corriger : il la faisait, dans les
// deux exécutions suivantes. Le symptôme était réel, le diagnostic faux.
//
// Le symétrique comptait autant : `--tags=smoke`, annoncé comme « le plus
// rapide », lançait la boucle visuelle entière. Corriger un sur-déclenchement
// fabrique un sous-déclenchement — les deux sens sont donc testés ici.

test('--tags=visual ne lance QUE la boucle visuelle', () => {
  const d = dimensionsToRun(['visual'], ['wip', 'manual']);
  assert.equal(d.main, false, 'la suite principale exclut visual : elle n\'aurait rien à exécuter');
  assert.equal(d.visual, true);
});

test('--tags=smoke ne lance PAS la boucle visuelle', () => {
  const d = dimensionsToRun(['smoke'], ['wip', 'manual']);
  assert.equal(d.main, true);
  assert.equal(d.visual, false, '« le plus rapide » ne doit pas photographier tous les écrans');
});

test('sans tag, tout tourne — c\'est le run complet', () => {
  const d = dimensionsToRun([], ['wip', 'manual']);
  assert.deepEqual(d, { main: true, visual: true });
});

test('les deux ensemble lancent les deux', () => {
  assert.deepEqual(dimensionsToRun(['smoke', 'visual'], []), { main: true, visual: true });
});

test('exclure visual le retire, même sans rien demander', () => {
  assert.deepEqual(dimensionsToRun([], ['visual']), { main: true, visual: false });
  // Et l'exclusion gagne sur la demande : c'est le sens habituel des deux flags.
  assert.deepEqual(dimensionsToRun(['visual'], ['visual']), { main: false, visual: false });
});

test('un tag exclu ne suffit pas à faire tourner la suite principale', () => {
  // Demander uniquement ce qui est exclu ne doit rien lancer du tout.
  assert.deepEqual(dimensionsToRun(['wip'], ['wip']), { main: false, visual: false });
});

// ── La commande Flutter est celle du PROJET ─────────────────────────────────

test('une commande flutter n\'est préfixée que si le projet épingle son SDK', () => {
  // ⚠️ Les DEUX valeurs de `pinned`, et c'est tout l'objet. La première version
  // de ce garde appelait `flutterCommand`, qui lit le disque : dans un dépôt
  // sans `.fvmrc` la branche qui préfixe est INATTEIGNABLE, si bien que le test
  // restait vert en la cassant. Une mutation l'a dit ; aucune relecture ne
  // l'aurait vu.
  assert.equal(flutterCommandIn('flutter build apk --debug', true), 'fvm flutter build apk --debug');
  assert.equal(flutterCommandIn('flutter build apk --debug', false), 'flutter build apk --debug');

  // Ce qui n'est pas une commande flutter n'est jamais touché, épinglé ou non.
  for (const pinned of [true, false]) {
    assert.equal(flutterCommandIn('make argus-build', pinned), 'make argus-build');
    assert.equal(flutterCommandIn('fvm flutter build apk --debug', pinned), 'fvm flutter build apk --debug');
    assert.equal(flutterCommandIn('', pinned), '');
    assert.equal(flutterCommandIn(undefined, pinned), '');
  }
});

test('l\'épinglage se lit sur le disque, et les deux marqueurs comptent', () => {
  // Le CÂBLAGE, pas la décision : sans lui, `usesFvm` pourrait rendre `false`
  // partout et les tests ci-dessus resteraient verts.
  const base = mkdtempSync(join(tmpdir(), 'argus-fvm-'));
  const avant = process.cwd();
  try {
    process.chdir(base);
    assert.equal(usesFvm(), false, 'un dossier nu n\'épingle rien');

    writeFileSync(join(base, '.fvmrc'), '{"flutter":"3.32.0"}\n');
    assert.equal(usesFvm(), true, '.fvmrc suffit');
    assert.equal(flutterCommand('flutter test'), 'fvm flutter test');

    rmSync(join(base, '.fvmrc'));
    mkdirSync(join(base, '.fvm'));
    assert.equal(usesFvm(), true, 'le dossier .fvm aussi — un projet peut n\'avoir que lui');
  } finally {
    process.chdir(avant);
    rmSync(base, { recursive: true, force: true });
  }
});

// ── Un rapport doit dire de QUAND il parle ───────────────────────────────────
//
// `argus-report` agrège les JSON présents, quel que soit leur âge. Après une
// preuve par corruption de baseline, le HTML décrivait un état qui n'existait
// plus, et rien dans la page ne permettait de s'en apercevoir. Le seuil est
// DÉRIVÉ de `budget.maxMinutes` — la durée qu'un run complet a le droit de
// prendre — plutôt que choisi : un nombre en dur se périmerait en silence, ce
// qui est exactement le défaut qu'on répare.

const part = (/** @type {string} */ file, /** @type {number} */ ageMin) => ({
  file, at: new Date(Date.now() - ageMin * 60000),
});

test('des relevés du même run ne sont jamais marqués périmés', () => {
  const parts = [part('report.json', 0), part('perf.json', 3), part('a11y.json', 12)];
  assert.deepEqual(stalenessOf(parts, { budget: { maxMinutes: 25 } }).stale, []);
});

test('un relevé plus vieux que le budget du run est marqué', () => {
  const parts = [part('report.json', 0), part('sec.json', 400)];
  const v = stalenessOf(parts, { budget: { maxMinutes: 25 } });
  assert.deepEqual(v.stale, ['sec.json'], 'quatre heures d\'écart ne peuvent pas venir du même run');
  assert.equal(v.budgetMin, 25);
});

test('le seuil SUIT le budget déclaré — c\'est ce qui le rend non deviné', () => {
  const parts = [part('report.json', 0), part('sec.json', 45)];
  // Deux configs qui ne diffèrent QUE par la variable testée.
  assert.deepEqual(stalenessOf(parts, { budget: { maxMinutes: 25 } }).stale, ['sec.json']);
  assert.deepEqual(stalenessOf(parts, { budget: { maxMinutes: 90 } }).stale, []);
});

test('sans budget lisible, un plancher raisonnable plutôt qu\'une division par rien', () => {
  const parts = [part('report.json', 0), part('sec.json', 400)];
  assert.deepEqual(stalenessOf(parts, {}).stale, ['sec.json'], 'défaut de 25 min');
  assert.equal(stalenessOf(parts, { budget: { maxMinutes: 0 } }).budgetMin, 1, 'zéro ne doit pas rendre tout périmé par construction');
});

test('aucun relevé daté : on ne conclut rien, on ne plante pas', () => {
  const v = stalenessOf([{ file: 'report.json', at: null }], { budget: { maxMinutes: 25 } });
  assert.deepEqual(v.stale, []);
  assert.equal(v.newest, null);
});

// ── L'écran mesuré est celui qu'on croit ────────────────────────────────────
//
// `--screen` n'était qu'une ÉTIQUETTE : le rapport portait le nom tapé, pas
// celui de l'écran affiché. Lancé après une suite, le script a mesuré le SPLASH
// et rendu « rien à mesurer » — honnête, vide, et indiscernable d'un écran
// réellement sans contrôles.

const CONFIG_ECRANS = {
  screens: [
    { id: 'home', anchor: 'home_root' },
    { id: 'login', anchor: 'login_root' },
    { id: 'profile', anchor: '' },
  ],
};
const dump = (/** @type {string[]} */ ids) => ids.map((id) => ({ 'resource-id': id, class: 'android.view.View' }));

test('l\'écran affiché est reconnu par son ancre, pas par ce qu\'on a tapé', () => {
  const v = identifyScreen(dump(['home_root', 'autre']), CONFIG_ECRANS, 'home');
  assert.equal(v.matched, true);
  assert.equal(v.id, 'home');
});

test('un splash ne se fait pas passer pour un écran du harnais', () => {
  const v = identifyScreen(dump(['io.flutter.splash', 'decor_view']), CONFIG_ECRANS, 'home');
  // ⚠️ `kind`, pas `matched`. Une mutation a montré que ce garde restait vert
  // en supprimant cette branche : « aucune ancre à l'écran » retombait alors
  // dans « pas l'écran demandé », qui rend lui aussi matched:false. Les deux
  // n'appellent pourtant pas le même geste, et un booléen ne les sépare pas.
  assert.equal(v.kind, 'aucune', 'ce qui est mesuré n\'est aucun écran du harnais');
  assert.equal(v.matched, false);
  assert.equal(v.id, '');
  assert.match(v.detail, /home/, 'et il doit dire ce qu\'on attendait');
});

test('mesurer login en croyant mesurer home est signalé, et distinctement', () => {
  const v = identifyScreen(dump(['login_root']), CONFIG_ECRANS, 'login');
  assert.equal(v.kind, 'reconnu');
  assert.equal(v.matched, true);

  const faux = identifyScreen(dump(['login_root']), CONFIG_ECRANS, 'home');
  assert.equal(faux.kind, 'autre', 'un vrai écran du harnais, mais pas celui demandé');
  assert.equal(faux.matched, false);
  assert.equal(faux.id, 'login', 'et on doit quand même savoir lequel c\'était');
});

test('sans ancre déclarée nulle part, on le DIT plutôt que d\'affirmer', () => {
  const v = identifyScreen(dump(['quoi']), { screens: [{ id: 'home', anchor: '' }] }, '');
  assert.equal(v.kind, 'sans-declaration');
  assert.equal(v.matched, false);
  assert.match(v.detail, /aucun écran déclaré/);
});

test('les quatre verdicts sont bien quatre — sinon deux causes se confondent', () => {
  const rendus = [
    identifyScreen(dump(['home_root']), CONFIG_ECRANS, 'home').kind,
    identifyScreen(dump(['login_root']), CONFIG_ECRANS, 'home').kind,
    identifyScreen(dump(['splash']), CONFIG_ECRANS, 'home').kind,
    identifyScreen(dump(['splash']), { screens: [] }, 'home').kind,
  ];
  assert.deepEqual(rendus, ['reconnu', 'autre', 'aucune', 'sans-declaration']);
});

// ── Le plancher de splash n'est pas un seuil relevé ──────────────────────────
//
// Une app qui s'impose 2 s de splash de marque rend `coldStartMs: 2000` rouge
// par construction. La seule issue offerte était de relever le seuil — ce qui
// efface d'un coup le plancher assumé ET ce qui a dérivé. Soustraire garde les
// deux lisibles.

const SPLASH = { thresholds: { coldStartMs: 2000, brandedSplashMs: 2000 } };

test('sous le seuil UNE FOIS le splash déduit : aucun finding', () => {
  // 3,5 s bruts, 1,5 s hors splash : conforme, et un seuil relevé à 4000 aurait
  // dit la même chose — la différence se voit au cas suivant.
  const samples = [{ flow: 'smoke', ms: 3500, status: 'COMPLETED' }];
  assert.deepEqual(startupFindings(samples, DEVICE, 'android', SPLASH), []);
});

test('un seuil RELEVÉ laisserait passer ce que le plancher attrape', () => {
  const samples = [{ flow: 'smoke', ms: 4200, status: 'COMPLETED' }];
  // Avec le plancher : 2200 ms hors splash, au-dessus de 2000 → finding.
  assert.equal(startupFindings(samples, DEVICE, 'android', SPLASH).length, 1);
  // Avec un seuil simplement relevé à 4500 : rien. C'est exactement ce qu'on
  // refuse — la dérive disparaît en même temps que le plancher.
  assert.deepEqual(
    startupFindings(samples, DEVICE, 'android', { thresholds: { coldStartMs: 4500 } }),
    [],
  );
});

test('le finding dit les DEUX chiffres, sinon on ne peut pas relire le verdict', () => {
  const samples = [{ flow: 'smoke', ms: 6200, status: 'COMPLETED' }];
  const f = startupFindings(samples, DEVICE, 'android', SPLASH)[0];
  assert.match(f.title, /6 s/);
  assert.match(f.title, /2000 ms de splash assumés/);
  assert.match(f.actual, /6200 ms \(4200 hors splash\)/);
});

test('sans plancher déclaré, rien ne change — et le message ne parle pas de splash', () => {
  const samples = [{ flow: 'smoke', ms: 9000, status: 'COMPLETED' }];
  const f = startupFindings(samples, DEVICE, 'android', CONFIG)[0];
  assert.doesNotMatch(f.title, /splash/, 'une app sans splash n\'a pas à lire ce mot');
  assert.doesNotMatch(f.actual, /hors splash/);
});

test('un plancher plus grand que la mesure ne rend pas un temps négatif', () => {
  const samples = [{ flow: 'smoke', ms: 500, status: 'COMPLETED' }];
  assert.deepEqual(startupFindings(samples, DEVICE, 'android', SPLASH), []);
});

// ── L'ancre était là, puis elle n'y était plus ──────────────────────────────
//
// Même famille que l'indice de démarrage, sur un autre défaut : le message de
// Maestro nomme le sélecteur, donc il désigne un coupable, et c'est le mauvais.
// Vécu : une session de test de 10 s se terminait avant les étapes d'abandon, et
// le rapport disait « confirm_sheet_root n'est pas visible ». On part alors
// chercher une ancre qui n'a jamais eu de problème.

const etape = (/** @type {string} */ id, /** @type {string} */ status) => ({
  command: { assertConditionCommand: { condition: { visible: { idRegex: id } } } },
  metadata: {
    status,
    evaluatedCommand: { c: { condition: { visible: { idRegex: id } } } },
  },
});

test('une ancre vue puis perdue accuse l\'ÉTAT, pas l\'instrumentation', () => {
  const steps = [etape('sheet_root', 'COMPLETED'), etape('autre', 'COMPLETED'), etape('sheet_root', 'FAILED')];
  const hint = vanishedHint(steps, 2, 'id=sheet_root');
  assert.match(hint, /TROUVÉE plus tôt/);
  assert.match(hint, /durée métier/, 'et il doit dire où regarder');
});

test('une ancre jamais vue ne déclenche rien — sinon l\'indice est partout', () => {
  const steps = [etape('autre', 'COMPLETED'), etape('sheet_root', 'FAILED')];
  assert.equal(vanishedHint(steps, 1, 'id=sheet_root'), '');
});

test('une ancre vue en ÉCHEC plus tôt ne prouve pas qu\'elle a existé', () => {
  const steps = [etape('sheet_root', 'FAILED'), etape('sheet_root', 'FAILED')];
  assert.equal(vanishedHint(steps, 1, 'id=sheet_root'), '',
    'deux échecs de suite sur la même ancre, c\'est l\'instrumentation qu\'il faut suspecter');
});

test('un sélecteur par TEXTE n\'est pas concerné', () => {
  const steps = [etape('x', 'COMPLETED')];
  assert.equal(vanishedHint(steps, 0, 'text=Bienvenue'), '');
  assert.equal(vanishedHint(steps, 0, ''), '');
});


// ───────────────────────────────────────────────────────────────────────────
// sec.mjs — ce qu'un binaire DEBUG doit produire, et ce qu'il ne doit pas
// ───────────────────────────────────────────────────────────────────────────
//
// Un scan de sécurité sur un build debug ne dit rien de ce que reçoivent les
// utilisateurs : il se marque donc SAUTÉ, avec sa raison. Le rendre en `major`
// et `blocker` faisait échouer le gate d'emblée, sur le binaire même que le
// scaffold prescrit d'analyser par défaut.
//
// Les deux sens sont gardés : un correctif qui ferait sauter la dimension pour
// TOUT binaire passerait le premier test et rougirait le second.

/**
 * Fabrique un faux APK. Le listing suffit à la plupart des contrôles ; celui de
 * l'obfuscation LIT le contenu de `libapp.so`, d'où la forme `[chemin, contenu]`.
 * @param {(string|[string, string])[]} entrees
 */
const fauxApk = (entrees) => {
  const dir = mkdtempSync(join(tmpdir(), 'argus-apk-'));
  for (const e of entrees) {
    const [chemin, contenu] = typeof e === 'string' ? [e, 'x'] : e;
    const f = join(dir, chemin);
    mkdirSync(join(f, '..'), { recursive: true });
    writeFileSync(f, contenu);
  }
  const apk = join(dir, 'app.apk');
  execFileSync('zip', ['-q', '-r', apk, '.'], { cwd: dir });
  return apk;
};

test('un binaire DEBUG fait sauter la dimension, sans rendre un seul finding', () => {
  const { findings, facts } = auditApk(fauxApk(['assets/flutter_assets/kernel_blob.bin']), {});
  assert.equal(facts.scanned, false, 'un debug ne se scanne pas : il se saute');
  assert.equal(findings.length, 0,
    'aucun finding — sinon le gate échoue sur le binaire que le scaffold pointe par défaut');
  assert.match(facts.why, /debug/i, 'et la raison doit nommer le variant');
  assert.match(facts.why, /release/i, 'et dire quoi faire pour conclure');
});

test('un binaire de PUBLICATION est bien scanné — le garde coupe dans un seul sens', () => {
  const { facts } = auditApk(fauxApk(['lib/arm64-v8a/libapp.so']), {});
  assert.equal(facts.scanned, true,
    'sans ça, sauter « sur un debug » se serait mué en « ne jamais rien scanner »');
  assert.equal(facts.isDebugBuild, false);
});


// ───────────────────────────────────────────────────────────────────────────
// sec.mjs — l'obfuscation doit DISCRIMINER, et le prouver dans les deux sens
// ───────────────────────────────────────────────────────────────────────────
//
// Le motif d'avant (`package:<n'importe quoi>/….dart`) rendait le MÊME verdict
// sur un binaire obfusqué et sur un binaire qui ne l'est pas : `--obfuscate`
// n'efface jamais les chemins du framework. Mesuré sur un projet réel, deux
// builds release — 42 chemins du projet sans l'option, 0 avec, `QAM-SEC-OBFUS`
// major dans les deux cas.
//
// Ces gardes-ci existent pour qu'un contrôle de sécurité ne puisse plus rendre
// le même résultat quoi qu'on fasse. Le second est le seul qui aurait rougi.

/** Ce qu'un libapp.so porte TOUJOURS : les chemins du framework y survivent. */
const FRAMEWORK = 'package:flutter/src/services/platform_channel.dart\n'
  + 'package:flutter/src/widgets/framework.dart\n';
const PROJET = 'package:mon_app/features/home/home_page.dart\n'
  + 'package:mon_app/core/api/client.dart\n';
const SO = 'lib/arm64-v8a/libapp.so';

test('un binaire NON obfusqué est signalé, et le finding cite ce qu\'il a compté', () => {
  const { findings, scanned, projectPaths } = auditObfuscation(
    fauxApk([[SO, FRAMEWORK + PROJET]]), [SO], 'mon_app',
  );
  assert.equal(scanned, true);
  assert.equal(projectPaths, 2, 'deux chemins distincts du projet');
  assert.equal(findings.length, 1);
  assert.match(findings[0].actual, /mon_app/,
    'le verdict doit nommer le paquet mesuré, sinon on ne peut pas le relire');
});

test('un binaire OBFUSQUÉ ne rend plus rien — c\'est le garde qui manquait', () => {
  const { findings, scanned, projectPaths } = auditObfuscation(
    fauxApk([[SO, FRAMEWORK]]), [SO], 'mon_app',
  );
  assert.equal(scanned, true, 'il a bien mesuré : les chemins du framework sont là');
  assert.equal(projectPaths, 0);
  assert.equal(findings.length, 0,
    'avec l\'ancien motif, `package:flutter/…` suffisait à rendre le même major');
});

test('sans chemin de framework, on ne conclut PAS : c\'est l\'instrument qui est muet', () => {
  const { findings, scanned, why } = auditObfuscation(
    fauxApk([[SO, 'octets sans le moindre chemin dart']]), [SO], 'mon_app',
  );
  assert.equal(scanned, false,
    'zéro chemin du projet ET zéro du framework = une lecture ratée, pas une obfuscation');
  assert.equal(findings.length, 0);
  assert.match(why, /lecture/i, 'et la raison doit désigner la mesure, pas le binaire');
});

test('sans nom de paquet, on ne conclut pas non plus — un motif nu ne discrimine rien', () => {
  const { scanned, why } = auditObfuscation(fauxApk([[SO, FRAMEWORK + PROJET]]), [SO], '');
  assert.equal(scanned, false);
  assert.match(why, /pubspec/, 'la raison doit dire OÙ le nom se lit');
});

test('le nom du paquet se lit dans le pubspec, pas dans la config recopiée à la main', () => {
  const dir = mkdtempSync(join(tmpdir(), 'argus-pubspec-'));
  writeFileSync(join(dir, 'pubspec.yaml'), 'name: vrai_projet\nversion: 1.2.3+4\n');
  assert.equal(dartPackageName(dir), 'vrai_projet');
  assert.equal(dartPackageName(mkdtempSync(join(tmpdir(), 'argus-vide-'))), '',
    'pubspec absent : chaîne vide, donc « non conclu » — jamais un nom deviné');
});

test('auditApk CÂBLE le pubspec du projet — sans quoi le défaut d\'origine reviendrait', () => {
  // ⚠️ Les gardes ci-dessus passent le nom en argument : ils prouvent la
  // décision, jamais son branchement. Celui-ci ne passe rien et vérifie que la
  // valeur par défaut va bien LIRE le pubspec du répertoire courant.
  const projet = mkdtempSync(join(tmpdir(), 'argus-cwd-'));
  writeFileSync(join(projet, 'pubspec.yaml'), 'name: appli_du_cwd\n');
  const apk = fauxApk([[SO, FRAMEWORK + 'package:appli_du_cwd/main.dart\n']]);
  const avant = process.cwd();
  try {
    process.chdir(projet);
    const { findings } = auditApk(apk, { security: { requireObfuscation: true } });
    // ⚠️ On compte le PHÉNOMÈNE, pas le total : `auditApk` rend aussi un `info`
    // quand aapt2 manque, et l'assertion sur `findings.length` mesurait ça.
    const obfus = findings.filter((/** @type {any} */ f) => f.id === 'QAM-SEC-OBFUS');
    assert.equal(obfus.length, 1, 'le paquet lu dans le pubspec doit être celui qu\'on cherche');
    assert.match(obfus[0].actual, /appli_du_cwd/);
  } finally {
    process.chdir(avant);
  }
});


// ───────────────────────────────────────────────────────────────────────────
// config.mjs — VIDE n'est pas ILLISIBLE, et les confondre casse un projet sain
// ───────────────────────────────────────────────────────────────────────────
//
// Dériver l'émulateur de CI depuis `devices[]` a introduit un défaut le jour
// même : le scaffold dit lui-même de laisser `model`/`os` VIDES dès qu'on cible
// un `avd` nommé — le cas recommandé, donc le plus fréquent — et la première
// version échouait dessus. Le job serait devenu rouge sur une config que le
// skill venait de produire.
//
// Trouvé en préparant un run, pas par un test : la config d'un run précédent
// portait `os: ''` avec le commentaire qui explique pourquoi.

const AVEC = (/** @type {any} */ device) => ({ platforms: ['android'], devices: [device] });

// ⚠️ Un APK « fat » embarque quatre ABI, l'appareil n'en lit qu'une : 84,9 Mo
// contre 39,7 mesurés, flutter clean avant chaque build. Plus petit, et plus
// juste — le Play Store livre déjà du mono-ABI.

test('la commande proposée cible l\'ABI de l\'appareil', () => {
  assert.equal(buildCmdForAbi('flutter build apk --debug', 'arm64-v8a'),
    'flutter build apk --debug --target-platform android-arm64');
  assert.equal(buildCmdForAbi('flutter build apk --debug', 'x86_64'),
    'flutter build apk --debug --target-platform android-x64');
});

test('ABI illisible : on rend la commande TELLE QUELLE, on n\'invente pas de cible', () => {
  // Un --target-platform faux ne produit pas un APK plus petit : il produit un
  // APK qui ne s\'installe pas.
  assert.equal(buildCmdForAbi('flutter build apk --debug', ''), 'flutter build apk --debug');
  assert.equal(buildCmdForAbi('flutter build apk --debug', 'mips64'), 'flutter build apk --debug');
});

test('une commande qui n\'est pas un build apk, ou déjà ciblée, n\'est pas touchée', () => {
  assert.equal(buildCmdForAbi('flutter build appbundle', 'arm64-v8a'), 'flutter build appbundle',
    'un App Bundle est découpé par le store : le cibler ici n\'aurait pas de sens');
  const deja = 'flutter build apk --debug --target-platform android-arm';
  assert.equal(buildCmdForAbi(deja, 'arm64-v8a'), deja, 'un choix explicite l\'emporte');
});

test('l\'ABI est LUE sur l\'appareil, et une lecture douteuse ne passe pas', () => {
  const adb = (/** @type {any} */ out) => () => ({ stdout: out, stderr: '', ok: true });
  assert.equal(deviceAbi('emulator-5554', adb('arm64-v8a\n')), 'arm64-v8a');
  assert.equal(deviceAbi('emulator-5554', adb('')), '', 'rien lu : rien de deviné');
  assert.equal(deviceAbi('emulator-5554', adb('arm64-v8a; rm -rf /')), '',
    'une valeur qui n\'a pas la forme d\'une ABI ne va pas dans une ligne de commande');
  assert.equal(deviceAbi('', adb('arm64-v8a')), '');
});

test('os renseigné : la CI démarre l\'appareil du projet', () => {
  const r = ciEmulator(AVEC({ platform: 'android', model: 'pixel_9a', os: 'android-36' }));
  assert.equal(r.ok, true);
  assert.equal(r.apiLevel, '36');
  assert.equal(r.profile, 'pixel_9a');
  assert.equal(r.source, 'argus.mobile.yaml');
});

test('avd nommé, os et model vides : ça PASSE, et le journal le dit', () => {
  const r = ciEmulator(AVEC({ platform: 'android', avd: 'Medium_Phone_API_36.1', model: '', os: '' }));
  assert.equal(r.ok, true,
    'le scaffold prescrit lui-même de les laisser vides avec un avd nommé : échouer '
    + 'ici rendait le job rouge sur une config saine');
  assert.equal(r.apiLevel, '33', 'les défauts du workflow, inchangés');
  assert.match(r.why, /vides/, 'et le silence ne suffit pas : le journal doit dire d\'où viennent ces valeurs');
});

test('os mal formé : on échoue, plutôt que de deviner', () => {
  const r = ciEmulator(AVEC({ platform: 'android', model: 'pixel_6', os: 'pixel-33' }));
  assert.equal(r.ok, false, 'une faute de frappe n\'est pas un choix documenté');
  assert.match(r.why, /pixel-33/, 'le message doit citer ce qu\'il a lu');
});

test('aucun device android actif : on échoue en nommant les deux clés', () => {
  const r = ciEmulator({ platforms: ['ios'], devices: [{ platform: 'ios' }] });
  assert.equal(r.ok, false);
  assert.match(r.why, /platforms/);
});

test('model seul renseigné : on ne le jette pas, mais l\'os reste un défaut', () => {
  // Une moitié renseignée est une config en cours d'écriture, pas une faute.
  const r = ciEmulator(AVEC({ platform: 'android', model: 'pixel_9a', os: '' }));
  assert.equal(r.ok, false,
    'os vide ET model rempli : on ne peut pas deviner l\'api-level, et un défaut '
    + 'silencieux ferait comparer les références sur un autre appareil');
  assert.match(r.why, /android-33/, 'le message doit montrer la forme attendue');
});


// ───────────────────────────────────────────────────────────────────────────
// run.mjs — une référence visuelle est liée au COUPLE appareil + version d'OS
// ───────────────────────────────────────────────────────────────────────────
//
// La CI livrée figeait `api-level: 33` / `pixel_6` sans rapport avec l'appareil
// du projet : des références nées ailleurs ne correspondent JAMAIS, et la
// dimension visuelle y était rouge en permanence pour une raison qui n'est pas
// une régression. Le workflow dérive maintenant son émulateur de `devices[]` ;
// ce qui suit garde l'autre moitié — savoir DIRE que l'appareil a changé, au
// lieu de laisser l'échec se faire passer pour un défaut de l'app.

const ADB = (/** @type {Record<string,string>} */ reponses) =>
  (/** @type {string} */ _udid, /** @type {string[]} */ cmd) =>
    ({ stdout: reponses[cmd[cmd.length - 1]] ?? '', stderr: '', ok: true });

test('l\'appareil gravé est MESURÉ, pas recopié depuis la config', () => {
  const stamp = deviceStamp('android', 'emulator-5554',
    { model: 'pixel_6', os: 'android-33' },
    ADB({ 'ro.product.model': 'Pixel 9a', 'ro.build.version.sdk': '36', system_locales: 'fr-FR' }));
  assert.deepEqual(stamp, { model: 'Pixel 9a', os: 'android-36', locale: 'fr-FR', source: 'mesuré' },
    'devices[].model est recopié à la main : le graver rendrait une empreinte fausse, '
    + 'et le garde qui la relit ne verrait rien');
});

// ── La troisième dimension d'identité : la LOCALE ───────────────────────────
//
// Ce fichier existe pour qu'une référence porte l'identité de l'appareil qui l'a
// produite, et il en gravait deux sur trois. Sur un projet réel, `deviceLocale:
// fr_FR` était déclaré pendant que l'AVD tournait en `en-US` — cette clé ne
// pilote la locale qu'avec `autoStart` — donc les références sont nées sous un
// système ANGLAIS sans que rien ne l'enregistre. Dix-huitième run.
test('la locale système est gravée avec l\'appareil', () => {
  const stamp = deviceStamp('android', 'emulator-5554', { model: 'p', os: 'android-33' },
    ADB({ 'ro.product.model': 'Pixel 9a', 'ro.build.version.sdk': '36', system_locales: 'en-US' }));
  assert.equal(stamp.locale, 'en-US',
    'sans elle, une référence née sous un système anglais est indiscernable d\'une autre');
});

test('locale changée, même appareil : on le dit, et on dit que c\'est ELLE', () => {
  const grave = { model: 'Pixel 9a', os: 'android-36', locale: 'en-US', source: 'mesuré' };
  const courant = { model: 'Pixel 9a', os: 'android-36', locale: 'fr-FR', source: 'mesuré' };
  const derive = baselineDeviceDrift(grave, courant);
  assert.ok(derive, 'même appareil mais autre langue : les comparaisons vont échouer sur la LANGUE');
  assert.equal(derive.localeSeule, true,
    'le message doit pouvoir nommer la locale plutôt que d\'accuser l\'appareil, qui n\'a pas bougé');
});

test('locale identique : aucun avertissement — le garde ne coupe qu\'un sens', () => {
  const m = { model: 'Pixel 9a', os: 'android-36', locale: 'fr-FR', source: 'mesuré' };
  assert.equal(baselineDeviceDrift(m, { ...m }), null);
});

test('une marque d\'AVANT ce champ ne se met pas à crier rétroactivement', () => {
  // Elle n'a pas de `locale` : la comparer à une marque qui en a une ferait
  // rougir toutes les références existantes, d'un coup, pour rien. C'est ainsi
  // qu'un avertissement devient le bruit qu'on apprend à ignorer.
  const ancienne = { model: 'Pixel 9a', os: 'android-36', source: 'mesuré' };
  const courant = { model: 'Pixel 9a', os: 'android-36', locale: 'fr-FR', source: 'mesuré' };
  assert.equal(baselineDeviceDrift(ancienne, courant), null);

  // Et l'appareil, lui, doit continuer d'être vu même sans locale gravée.
  const autre = { model: 'Pixel 6', os: 'android-33', locale: 'fr-FR', source: 'mesuré' };
  assert.ok(baselineDeviceDrift(ancienne, autre), 'un changement d\'appareil reste un changement');
});

test('adb muet : on retombe sur la déclaration, et le champ le DIT', () => {
  const stamp = deviceStamp('android', 'emulator-5554', { model: 'pixel_6', os: 'android-33' }, ADB({}));
  assert.equal(stamp.source, 'déclaré',
    'une empreinte déclarée vaut mieux que rien, à condition de ne pas passer pour une mesure');
  assert.equal(stamp.model, 'pixel_6');
});

test('hors Android, on ne prétend pas mesurer — et on n\'appelle pas adb', () => {
  let appels = 0;
  const stamp = deviceStamp('ios', 'UUID', { model: 'iPhone-16', os: 'iOS-18-2' },
    () => { appels += 1; return { stdout: 'Pixel 9a', stderr: '', ok: true }; });
  assert.equal(appels, 0, 'adb sur un simulateur iOS rendrait une valeur d\'un autre appareil');
  assert.equal(stamp.source, 'déclaré');
  assert.equal(stamp.os, 'iOS-18-2');
});

test('même appareil : aucun avertissement — un garde qui crie toujours ne garde rien', () => {
  const ici = { model: 'Pixel 9a', os: 'android-36', source: 'mesuré' };
  assert.equal(baselineDeviceDrift({ model: 'Pixel 9a', os: 'android-36' }, ici), null);
});

test('le NOM de l\'appareil n\'entre pas dans la comparaison', () => {
  // Un AVD s'appelle autrement d'une machine à l'autre pour un modèle
  // identique. Crier là-dessus apprendrait à ignorer l'avertissement.
  const drift = baselineDeviceDrift(
    { model: 'Pixel 9a', os: 'android-36', name: 'Pixel_9a_API_36' },
    { model: 'Pixel 9a', os: 'android-36', name: 'CI_emulator', source: 'mesuré' });
  assert.equal(drift, null);
});

test('modèle ou OS différent : la dérive est nommée des DEUX côtés', () => {
  const drift = baselineDeviceDrift({ model: 'pixel_6', os: 'android-33' },
    { model: 'Pixel 9a', os: 'android-36', source: 'mesuré' });
  assert.ok(drift, 'sans ça, la comparaison échoue en accusant l\'application');
  assert.equal(drift.grave.model, 'pixel_6');
  assert.equal(drift.courant.model, 'Pixel 9a',
    'le message doit dire d\'où viennent les références ET où l\'on tourne');
});

test('références d\'avant l\'empreinte : rien à comparer, donc rien à dire', () => {
  const ici = { model: 'Pixel 9a', os: 'android-36', source: 'mesuré' };
  assert.equal(baselineDeviceDrift(null, ici), null, 'les références déjà commitées n\'en ont pas');
  assert.equal(baselineDeviceDrift({ model: '', os: '' }, ici), null,
    'une empreinte vide n\'est pas une empreinte différente');
});



// ───────────────────────────────────────────────────────────────────────────
// La doc livrée — une ligne de tableau détachée s'affiche en texte brut
// ───────────────────────────────────────────────────────────────────────────
//
// Un tableau du SKILL.md avait été coupé par douze lignes de prose : ses deux
// premières lignes rendaient un tableau, la troisième — « Étage 2 », la plus
// utile — s'affichait telle quelle, barres verticales comprises, chez qui lit le
// skill. Rien ne le voit : le fichier est valide, le lien n'est pas cassé, et
// l'agent qui le lit n'a pas de raison de signaler une ligne un peu étrange.
//
// Le critère est TOTAL : toute ligne de tableau, dans TOUS les documents livrés,
// doit toucher son tableau. Une ligne d'en-tête est reconnue à ce qui la suit —
// le séparateur `|---|` — et non à ce qui la précède.

const DOCS_SKILL = [
  'SKILL.md', 'PROMPTS.md', 'PROMPTS-by-mode.md',
  'references/methodology-mobile.md', 'references/device-matrix.md',
  'references/report-format-mobile.md', 'references/demo-mode-mobile.md',
];

/** Les lignes de tableau qui ne touchent aucun tableau. */
function lignesDetachees(fichier) {
  const chemin = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile', fichier);
  const lignes = readFileSync(chemin, 'utf8').split('\n');
  const detachees = [];
  let vues = 0;
  for (const [i, ligne] of lignes.entries()) {
    if (!ligne.startsWith('|')) continue;
    vues += 1;
    const apres = lignes[i + 1] ?? '';
    const avant = i > 0 ? lignes[i - 1] : '';
    if (apres.startsWith('|-')) continue;      // en-tête : son séparateur suit
    if (avant.startsWith('|')) continue;       // corps : elle touche sa table
    detachees.push(`${fichier}:${i + 1} — ${ligne.slice(0, 60)}`);
  }
  return { detachees, vues };
}

test('aucune ligne de tableau détachée dans la doc livrée', () => {
  const detachees = [];
  let vues = 0;
  for (const fichier of DOCS_SKILL) {
    const r = lignesDetachees(fichier);
    detachees.push(...r.detachees);
    vues += r.vues;
  }

  // ⚠️ Prouver d'abord que le balayage a vu des tableaux : renommés ou déplacés,
  // ces fichiers rendraient « zéro ligne détachée » avec exactement le même vert.
  assert.ok(vues > 60, `${vues} lignes de tableau lues : le balayage n'a rien ouvert`);

  assert.deepEqual(detachees, [],
    'une ligne de tableau séparée de son tableau s\'affiche en texte brut, barres '
    + 'verticales comprises, chez qui lit le skill');
});


// ───────────────────────────────────────────────────────────────────────────
// .maestro — « lancé » doit vouloir dire PRÊT, pas seulement immobile
// ───────────────────────────────────────────────────────────────────────────
//
// `launch-clean.yaml` est le point d'entrée de tous les flows. Il rendait la
// main sur un `waitForAnimationToEnd: 5000`, qui se satisfait de n'importe quel
// écran immobile — un splash statique compris — et plafonne à 5 s, quand un
// démarrage à froid mesuré sur un projet réel va de 6,4 à 9,3 s.
//
// Tout ce qui suivait tapait donc dans le sas de démarrage, et l'échec sortait
// en « Element not found » : on le lit comme une ancre manquante et on part
// chercher un défaut d'instrumentation qui n'existe pas. Deux flows visuels du
// sixième run sont tombés là-dessus, sur des ancres prouvées présentes.

test('le lancement attend un ÉTAT, pas seulement la fin des animations', () => {
  const source = readFileSync(join(FLOWS_DIR, '_subflows/launch-clean.yaml'), 'utf8');

  // ⚠️ Prouver d'abord que le fichier a été lu : renommé ou déplacé, la lecture
  // lèverait — mais un jour où elle rendrait du vide, les deux assertions qui
  // suivent passeraient sur une chaîne vide sans rien garder.
  assert.match(source, /launchApp:/, 'ce n\'est pas le sous-flow de lancement');

  assert.match(source, /extendedWaitUntil:/,
    '`waitForAnimationToEnd` seul se satisfait d\'un splash statique et plafonne à 5 s : '
    + 'les flows suivants tapent alors pendant le démarrage, et l\'échec accuse l\'ancre');
  assert.match(source, /\$\{ARGUS_ANCHOR_HOME\}/,
    'l\'attente doit porter sur l\'ancre de DÉPART, la seule qui prouve que l\'app est prête');
  assert.match(source, /\$\{ARGUS_START_TIMEOUT_MS\}/,
    'et sur le budget du harnais, pas sur un délai écrit à la main : un démarrage lent '
    + 'doit sortir en finding de lenteur, jamais en échec fonctionnel');
});

test('sans ancre de départ, le lancement ne prétend rien attendre', () => {
  const source = readFileSync(join(FLOWS_DIR, '_subflows/launch-clean.yaml'), 'utf8');
  // L'autre moitié : un projet qui n'a pas encore déclaré d'ancre doit garder le
  // comportement d'avant, pas hériter d'une attente sur une variable vide — qui
  // ferait échouer chaque flow sur un sélecteur non résolu.
  assert.match(source, /ARGUS_ANCHOR_HOME !== ''/,
    'l\'attente doit être conditionnée, sinon elle casse les projets sans ancre déclarée');
});

// ───────────────────────────────────────────────────────────────────────────
// .maestro — un sélecteur `text:` non encadré ne matche RIEN, parfois en silence
// ───────────────────────────────────────────────────────────────────────────
//
// Le sélecteur matche le nœud ENTIER, et sur Flutter un nœud ancré fusionne le
// texte qu'il recouvre : `nav_history` rend « Historique\nHISTORIQUE ». Un
// `text: 'Bienvenue'` échoue donc quel que soit le libellé.
//
// Les deux sens n'ont pas le même prix. `assertVisible` échoue bruyamment ;
// `assertNotVisible` PASSE toujours, et `tapOn` + `optional: true` ne fait rien
// — deux gardes verts par construction, qui occupent la place de ceux qu'on
// croyait avoir. Le scaffold en livrait un sur les clés de traduction non
// résolues.
//
// ⚠️ Le remède rapporté par le run était `accessibilityText:`. Mesuré :
// `maestro check-syntax` le REFUSE (« Unknown Property », Maestro 2.8.0) — il
// aurait fait rougir l'étape « Syntaxe des flows » de la CI livrée. Le symptôme
// était juste, le remède ne l'était pas.
//
// Le critère est TOTAL — tout sélecteur `text:`, y compris dans les exemples
// commentés, puisque c'est exactement ce qu'on décommente.

/** Les sélecteurs `text:` des flows, commentés compris. */
function selecteursTexte() {
  const trouves = [];
  let lignesLues = 0;
  for (const chemin of flowFiles()) {
    const fichier = chemin.slice(FLOWS_DIR.length);
    const lignes = readFileSync(chemin, 'utf8').split('\n');
    let precedente = '';
    for (const [i, brute] of lignes.entries()) {
      lignesLues += 1;
      // On retire un éventuel `#` de commentaire ET un `- ` de liste : ce qui
      // reste est la clé YAML, qu'elle soit active ou en exemple.
      const nue = brute.replace(/^\s*#?\s*/, '').replace(/^-\s*/, '');
      const m = /^text:\s*(.+)$/.exec(nue);
      if (m) {
        // `inputText:` ouvre un bloc dont `text:` est la valeur SAISIE, pas une
        // cible : rien à encadrer, et l'encadrer taperait les points au clavier.
        const parent = precedente.replace(/^\s*#?\s*/, '').replace(/^-\s*/, '');
        if (!/^inputText:/.test(parent)) trouves.push({ fichier, ligne: i + 1, motif: m[1].trim() });
      }
      if (nue.trim()) precedente = brute;
    }
  }
  return { trouves, lignesLues };
}

test('tout sélecteur `text:` est encadré — sinon il ne matche jamais le nœud fusionné', () => {
  const { trouves, lignesLues } = selecteursTexte();

  // ⚠️ D'abord prouver que le balayage a mesuré : un `flowFiles()` qui rend une
  // liste vide, ou une regex qui ne reconnaît plus la clé, rendrait « zéro
  // sélecteur mal écrit » avec exactement le même vert.
  assert.ok(lignesLues > 100, `${lignesLues} lignes lues : le balayage n'a rien ouvert`);
  assert.ok(trouves.length > 0,
    'aucun sélecteur `text:` reconnu dans les flows — c\'est la reconnaissance qui est cassée, pas les flows');

  const nus = trouves.filter((t) => !/^'\(\?[a-z]*s[a-z]*\)\.\*/.test(t.motif) || !/\.\*'$/.test(t.motif));
  assert.deepEqual(nus, [],
    'un sélecteur matche le nœud ENTIER, et un nœud Flutter fusionne le texte qu\'il '
    + 'recouvre : écris \'(?s).*Libellé.*\'. Le (?s) est nécessaire, sans lui le point '
    + 'ne franchit pas le saut de ligne.');
});


// ───────────────────────────────────────────────────────────────────────────
// a11y.mjs — la relance doit atteindre l'état d'où l'on peut se rattraper
// ───────────────────────────────────────────────────────────────────────────
//
// Le rattrapage posé au point 44 ne se déclenchait dans AUCUN cas nominal : sa
// condition testait `!opts.screen`, alors que le défaut de `--screen` n'est pas
// la chaîne vide mais « écran courant ». Et le seul état d'où l'on avait
// vraiment besoin de se rattraper — l'app pas au premier plan, ce que
// `argus-perf` laisse derrière lui — sortait plus haut en `process.exit(2)`,
// avant même d'y arriver.
//
// D'où une décision extraite, et un garde qui la branche sur la valeur que
// `parseArgs` produit VRAIMENT : la tester sur '' aurait re-signé le défaut.

test('sans --screen, la relance a lieu — c\'est la condition qui était morte', () => {
  const defaut = parseArgs([]).screen;
  assert.equal(defaut, ECRAN_COURANT,
    'si ce défaut change, la décision ci-dessous doit changer avec lui');
  assert.equal(relaunchDecision({ foreground: true, matched: false, requested: defaut }).relaunch, true,
    '`!opts.screen` valait false sur cette valeur : la relance ne partait jamais');
});

test('app absente du premier plan : on relance, au lieu de sortir en erreur', () => {
  const { relaunch, why } = relaunchDecision({ foreground: false, matched: false, requested: ECRAN_COURANT });
  assert.equal(relaunch, true);
  assert.match(why, /premier plan/, 'et la raison doit nommer l\'état, pas seulement le geste');
});

test('un --screen explicite interdit la relance — l\'état vient de l\'utilisateur', () => {
  const { relaunch, why } = relaunchDecision({ foreground: true, matched: false, requested: 'profil' });
  assert.equal(relaunch, false,
    'relancer mesurerait l\'écran de départ tout en le rapportant sous « profil »');
  assert.match(why, /profil/);
});

test('écran déjà reconnu : rien à relancer — le garde ne coupe qu\'un sens', () => {
  assert.equal(
    relaunchDecision({ foreground: true, matched: true, requested: ECRAN_COURANT }).relaunch, false,
    'sans ça, « relancer quand il le faut » deviendrait « relancer toujours », et chaque '
    + 'mesure repartirait de l\'écran d\'accueil',
  );
});

// ⚠️ « IMMOBILE » NE VEUT PAS DIRE « PRÊT ». La version d'avant sortait dès que
// deux lectures de l'arbre coïncidaient : un splash STATIQUE en rend deux
// identiques à 500 ms d'intervalle, donc la boucle sortait en plein sas et la
// dimension ne mesurait rien. C'est mot pour mot l'erreur corrigée la veille
// dans launch-clean.yaml, restée intacte deux fichiers plus loin.

const ATTENTE = { matched: false, kind: 'aucune', immobile: false, ecouleMs: 0, plancherMs: 2000 };

// ⚠️ CE GARDE EXISTE CONTRE UN MOTIF, PAS CONTRE UN DÉFAUT. Le point 84 a filtré
// `startupHint` par la commande en échec ; son voisin `vanishedHint`, dix lignes
// plus bas, est resté tel quel et collait son explication d'ancre sur une
// comparaison d'image. Trois runs consécutifs ont vu la même chose : le
// correctif est pensé pour UN endroit, le voisin l'attend en vain.
//
// D'où un critère TOTAL, et non une liste : TOUT indice ajouté à un message
// d'échec doit être filtré. Le jour où un troisième apparaît, il tombera ici
// sans que personne y pense.

test('tout indice collé à un message d\'échec est filtré par la commande', () => {
  const source = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  const appels = [...source.matchAll(/\+ (\w+Hint)\(([^)]*)\)/g)].map((m) => [m[1], m[2]]);

  // Prouver d'abord que le balayage a trouvé : une regex qui ne matche plus rend
  // « aucun indice non filtré » avec exactement le même vert.
  assert.ok(appels.length >= 2,
    `${appels.length} indice(s) trouvé(s) — c'est la reconnaissance qui est cassée, pas le code`);

  const nus = appels.filter(([, args]) => !/\bkey\b/.test(args)).map(([nom]) => nom);
  assert.deepEqual(nus, [],
    'un indice non filtré se colle à un assertScreenshot, dont l\'échec est un SEUIL '
    + 'd\'image et non un élément introuvable : il envoie chercher un défaut '
    + 'd\'instrumentation là où une référence a changé');
});

test('un splash STATIQUE ne fait plus renoncer — c\'est le défaut qui a coûté la dimension', () => {
  assert.equal(verdictAttente({ ...ATTENTE, immobile: true, ecouleMs: 900 }), 'attendre',
    'deux dumps identiques pendant le splash déclaré ne prouvent rien : ils prouvent qu\'il est fixe');
});

test('passé le splash déclaré, l\'immobilité vaut « posé » — le garde ne coupe qu\'un sens', () => {
  assert.equal(verdictAttente({ ...ATTENTE, immobile: true, ecouleMs: 2500 }), 'renoncer',
    'sans ça, « ne plus sortir trop tôt » deviendrait « attendre le budget entier à chaque run »');
  assert.equal(verdictAttente({ ...ATTENTE, immobile: false, ecouleMs: 9000 }), 'attendre',
    'un écran qui bouge encore n\'est pas posé, quel que soit le temps écoulé');
});

test('le plancher se LIT dans le rapport, il ne se devine pas', () => {
  // ⚠️ Le splash déclaré (2 s) n'est pas le temps d'arrivée de l'écran
  // exploitable (5–7 s mesurés sur un vrai projet). Poser le premier revient à
  // conclure pendant le second — c'est ce qui a coûté la dimension deux fois.
  const rapport = (/** @type {any} */ o) => () => JSON.stringify(o);
  assert.equal(plancherMesure('/x', rapport({ startup: { samples: [{ ms: 5015 }, { ms: 7299 }] } })), 7299,
    'la PLUS GRANDE : se tromper vers le haut coûte du temps, vers le bas coûte la mesure');
  assert.equal(plancherMesure('/x', rapport({ startup: { samples: [] } })), 0);
  assert.equal(plancherMesure('/x', rapport({})), 0);
  assert.equal(plancherMesure('/x', () => 'pas du json'), 0, 'un rapport illisible ne rend pas un plancher inventé');
  assert.equal(plancherMesure('/x', () => { throw new Error('ENOENT'); }), 0, 'rapport absent : zéro, pas une exception');
});

test('rien de déclaré : on renonce tout de suite, attendre ne servirait JAMAIS', () => {
  assert.equal(verdictAttente({ ...ATTENTE, kind: 'sans-declaration', immobile: false }), 'renoncer',
    'aucun écran ne peut être reconnu : le budget entier serait du gaspillage pur');
});

test('sans brandedSplashMs, on n\'invente pas de plancher — on attend', () => {
  // Un nombre deviné ici serait exactement le défaut d'avant, avec un autre
  // habillage : lent mais jamais faux vaut mieux que rapide et faux.
  assert.equal(verdictAttente({ ...ATTENTE, immobile: true, ecouleMs: 99000, plancherMs: 0 }), 'attendre');
});

test('un écran reconnu l\'emporte sur tout le reste', () => {
  assert.equal(verdictAttente({ ...ATTENTE, matched: true, immobile: false, ecouleMs: 0 }), 'reconnu');
  assert.equal(verdictAttente({ matched: true, kind: 'sans-declaration', immobile: true, ecouleMs: 0, plancherMs: 0 }),
    'reconnu', 'la reconnaissance passe avant le renoncement, sinon on jette une mesure valide');
});

test('la relance est CÂBLÉE avant le refus, pas seulement décidée', () => {
  // ⚠️ Les quatre gardes ci-dessus prouvent la décision ; aucun ne verrait le
  // jour où main() cesserait de l'appeler, ou la rappellerait après le
  // `process.exit(2)` — c'est-à-dire le défaut d'origine, à l'identique.
  const source = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/a11y.mjs'), 'utf8');
  // ⚠️ Ancré sur l'APPEL, jamais sur le nom nu : `relaunchDecision({` matche
  // aussi sa propre DÉFINITION, tout en haut du fichier — le garde comparait
  // donc la position d'une déclaration à celle du refus, et restait vert quelle
  // que soit la place de l'appel. Trouvé par mutation, pas par relecture.
  const appel = source.indexOf('const decision = relaunchDecision(');
  const refus = source.indexOf('if (appNodes.length === 0) {');
  assert.ok(appel > 0, 'main() n\'appelle plus relaunchDecision — le garde ci-dessus est devenu décoratif');
  assert.ok(refus > 0, 'le refus « pas au premier plan » a disparu ou changé de forme : relis ce garde');
  assert.ok(appel < refus,
    'le refus repasse AVANT la relance : l\'app arrêtée redevient le seul état qu\'on ne rattrape pas');
});


// ───────────────────────────────────────────────────────────────────────────
// perf.mjs — un pourcentage n'est comparable que si l'échantillon le permet
// ───────────────────────────────────────────────────────────────────────────
// Aucun script de MESURE n'efface les données de l'app
// ───────────────────────────────────────────────────────────────────────────
//
// Effacer les données est une ÉCRITURE, que la matrice de garde-fous gouverne
// par ENV. Un script de mesure qui le ferait au passage produirait exactement
// l'effet de bord qu'aucun ENV n'a autorisé — et sur un appareil réel, il
// détruirait les données de quelqu'un.
//
// Le critère est total et négatif : TOUS les scripts, pas ceux qu'on soupçonne.
// Et il cherche l'APPEL, jamais le mot : a11y.mjs explique en commentaire
// pourquoi il ne le fait pas, et un garde qui compterait sa propre mention
// serait rouge pour la documentation de sa propre règle.

test('aucun script de mesure n\'efface les données de l\'app', () => {
  const dir = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus');
  const scripts = readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  assert.ok(scripts.length >= 5, `motif introuvable : ${scripts.length} script(s) lus, le garde ne garde rien`);

  for (const f of scripts) {
    const code = readFileSync(join(dir, f), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    assert.ok(!/'pm',\s*\n?\s*'clear'/.test(code) && !/shell.{0,20}pm\s+clear/.test(code),
      `${f} efface les données de l'app — c'est une écriture, elle relève d'ENV, pas d'un script de mesure`);
  }
});


// ───────────────────────────────────────────────────────────────────────────
// Le contrat de sortie documenté décrit le rapport réellement écrit
// ───────────────────────────────────────────────────────────────────────────
//
// La doc promettait `metrics.perf` dans report.json. Le fichier ne l'a jamais
// porté : perf.mjs tourne APRÈS run.mjs, donc les métriques n'existent pas
// encore quand le rapport est écrit. Rien ne levait — un consommateur qui les
// cherchait trouvait `undefined`, sans erreur d'aucune sorte.
//
// Le garde ne fige pas une liste écrite à la main : il la DÉRIVE des deux
// sources et exige qu'elles coïncident. Une clé ajoutée au code sans être
// documentée le fait rougir, et une clé promise sans être écrite aussi.

/** Les clés de premier niveau du littéral `report` de run.mjs. */
function clesDuRapport() {
  const src = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  const i = src.indexOf('const report = {');
  assert.notEqual(i, -1, 'le littéral `const report = {` est introuvable — le garde ne garde plus rien');
  let prof = 0; let fin = i;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}' && --prof === 0) { fin = k; break; }
  }
  const bloc = src.slice(i, fin + 1);
  const cles = []; let p = 0;
  for (const ligne of bloc.split('\n')) {
    // `nom:` comme `nom,` — le raccourci de propriété n'a pas de deux-points
    const m = /^ {4}([a-zA-Z_]+)\s*[:,]/.exec(ligne);
    if (m && p === 1) cles.push(m[1]);
    p += (ligne.match(/\{/g) ?? []).length - (ligne.match(/\}/g) ?? []).length;
  }
  return cles.sort();
}

/** Les clés que le contrat de sortie annonce, dans la phrase qui les liste. */
function clesDocumentees() {
  const doc = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/references/report-format-mobile.md'), 'utf8');
  const m = /clés de premier niveau de `report\.json` sont\s*:\s*([^.]+)\./s.exec(doc);
  assert.ok(m, 'la phrase qui liste les clés a disparu de la doc — reformulée ? le garde est vacant');
  return [...m[1].matchAll(/`([a-zA-Z_]+)`/g)].map((x) => x[1]).sort();
}

test('le contrat de sortie documenté = les clés réellement écrites', () => {
  const reelles = clesDuRapport();
  assert.ok(reelles.length >= 4, `motif trouvé mais vide : ${reelles.length} clé(s)`);
  assert.deepEqual(clesDocumentees(), reelles,
    'la doc et run.mjs ne décrivent plus le même rapport — mets à jour celle des deux qui a tort');
});

test('le rapport ne promet plus de métriques qu\'il n\'écrit pas', () => {
  assert.ok(!clesDuRapport().includes('metrics'),
    'si report.json porte enfin `metrics`, c\'est la doc qu\'il faut rouvrir : elle explique pourquoi il ne le pouvait pas');
});


// ───────────────────────────────────────────────────────────────────────────
// Un marqueur ne doit pas compter les fichiers qui en PARLENT
// ───────────────────────────────────────────────────────────────────────────
//
// L'installeur comptait les marqueurs de tâche avec un grep nu, si bien que la
// ligne d'argus.mobile.yaml qui EXPLIQUE le mécanisme était comptée comme une
// tâche : ce fichier rapportait « 1 à traiter » pour l'éternité, même
// entièrement rempli. C'est exactement ce que l'en-tête de install-mobile.sh
// décrit pour ARGUS:OWNED, et dont la protection n'avait pas été étendue.
//
// Le deux-points sépare la DIRECTIVE de la MENTION. Une mention en prose reste
// permise entre backticks — sans quoi la doc du mécanisme deviendrait
// impossible à écrire, ce qui est l'autre moitié du même piège.
//
// ⚠️ Le motif est CONCATÉNÉ : écrit en clair, ce garde compterait sa propre
// mention et rougirait sur lui-même.

test('tout marqueur de tâche du scaffold est une directive, ou une mention citée', () => {
  const marqueur = 'TODO' + '(argus)';
  const racine = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const fichiers = [];
  const parcourir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const chemin = join(d, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else fichiers.push(chemin);
    }
  };
  parcourir(racine);
  assert.ok(fichiers.length >= 30, `motif introuvable : ${fichiers.length} fichier(s) lus`);

  let vus = 0;
  for (const f of fichiers) {
    let texte;
    try { texte = readFileSync(f, 'utf8'); } catch { continue; }
    for (const ligne of texte.split('\n')) {
      const i = ligne.indexOf(marqueur);
      if (i === -1) continue;
      vus++;
      const suite = ligne.slice(i + marqueur.length);
      const cite = ligne[i - 1] === '`' || suite.startsWith('`');
      assert.ok(suite.startsWith(':') || cite,
        `${f.slice(racine.length + 1)} : « ${ligne.trim()} » — un marqueur doit dire quoi faire `
        + '(deux-points) ou être cité entre backticks. Sans ça, un fichier qui PARLE du mécanisme '
        + 'est compté comme ayant du travail en attente, pour toujours.');
    }
  }
  assert.ok(vus >= 10, `garde vacant : ${vus} marqueur(s) rencontré(s) dans tout le scaffold`);
});


// ───────────────────────────────────────────────────────────────────────────
// Le cadrage visuel est LOCAL, comme les racines qu'il vise
// ───────────────────────────────────────────────────────────────────────────
//
// `visualCropOn` était une clé globale alors que chaque écran a sa propre
// racine : dès le deuxième écran en `visual: true`, aucune valeur ne convient.
// Sur un projet réel, elle est restée vide et l'horloge du système est entrée
// dans les quatre références visuelles.

test('un écran impose son cadrage, le global reste le défaut', () => {
  assert.equal(cropFor({ id: 'a', visualCropOn: 'local' }, { visualCropOn: 'global' }), 'local');
  assert.equal(cropFor({ id: 'a' }, { visualCropOn: 'global' }), 'global',
    'sans quoi « cadrage par écran » deviendrait « plus de cadrage du tout » pour les autres');
});

test('un cadrage vide n\'est pas un cadrage — il retombe sur le défaut', () => {
  // Un sélecteur vide ne se passe pas à `cropOn:` : Maestro chercherait un
  // élément d'identifiant « » et échouerait. Vide veut dire « plein écran ».
  assert.equal(cropFor({ id: 'a', visualCropOn: '   ' }, { visualCropOn: 'global' }), 'global');
  assert.equal(cropFor({ id: 'a' }, {}), '');
});


// ───────────────────────────────────────────────────────────────────────────
// Le skill mobile est AUTONOME — il ne lit rien du skill web
// ───────────────────────────────────────────────────────────────────────────
//
// Il a longtemps délégué au web la méthodologie de base, les garde-fous
// transverses et le contrat de sortie. Copier `plugins/argus-mobile/skills/argus-mobile/` seul — ce
// que propose l'option B du README — cassait donc ces chemins EN SILENCE :
// l'agent lisait que le format de base vivait ailleurs, ne le trouvait pas, et
// inventait un format de rapport.
//
// Mesuré avant de trancher : l'emprunt valait 76 lignes et non 248 — le §3 du
// web (25 lignes) alors que le mobile a le sien (31 lignes), et un contrat de
// sortie de 51 lignes portant NEUF mentions de vocabulaire web, au point que le
// mobile devait publier une table pour les transposer. La dépendance coûtait
// une lecture de plus qu'elle n'économisait de duplication.
//
// Le critère est total et négatif : AUCUN chemin sortant, où que ce soit.

test('le skill mobile ne référence aucun fichier du skill web', () => {
  const dir = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile');
  const sortants = [];
  let lus = 0;
  const parcourir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const c = join(d, e.name);
      if (e.isDirectory()) { parcourir(c); continue; }
      if (!/\.(md|mjs|dart|sh|ya?ml|json)$/.test(e.name)) continue;
      lus++;
      for (const m of readFileSync(c, 'utf8').matchAll(/\.\.\/\.\.\/argus\/[^\s`)'"]+/g)) {
        sortants.push(`${c.slice(dir.length + 1)} -> ${m[0]}`);
      }
    }
  };
  parcourir(dir);
  assert.ok(lus >= 30, `garde vacant : ${lus} fichier(s) lus`);
  assert.deepEqual(sortants, [],
    'le skill mobile s\'est remis a lire le skill web. Copie seul, ces chemins ne '
    + 'resolvent nulle part et rien ne leve : l\'agent invente ce qu\'il ne trouve '
    + 'pas. Absorbe ce dont tu as besoin, ou rouvre docs/chantiers-differes.md § A.');
});


// ───────────────────────────────────────────────────────────────────────────
// Un échec d'installation dit le GESTE, pas seulement le symptôme
// ───────────────────────────────────────────────────────────────────────────
//
// Le harnais n'installe qu'avec `-r` et ne désinstalle jamais. Les échecs qui en
// découlent sont bruyants — le double contrôle interdit de poursuivre sur la
// version précédente — mais le message brut d'adb nomme un code sans dire quoi
// en faire, et le lecteur doit deviner. C'est le défaut que le point 7 avait
// déjà corrigé ailleurs.

test('les trois échecs d\'installation courants nomment le geste', () => {
  for (const code of ['INSTALL_FAILED_UPDATE_INCOMPATIBLE', 'signatures do not match',
    'INSTALL_FAILED_VERSION_DOWNGRADE', 'INSTALL_FAILED_INSUFFICIENT_STORAGE']) {
    const hint = installHint(code, 'com.exemple.app');
    assert.notEqual(hint, '', `${code} n'est pas reconnu — le lecteur reste avec un code brut`);
    assert.ok(/relance|repartira|Libère/.test(hint), `${code} explique sans dire quoi faire`);
  }
});

test('proposer une désinstallation dit toujours ce qu\'elle DÉTRUIT', () => {
  // C'est une écriture irréversible sur l'appareil de quelqu'un. Le harnais ne
  // la fait pas à sa place ; s'il la suggère, il en donne le prix.
  for (const code of ['INSTALL_FAILED_UPDATE_INCOMPATIBLE', 'INSTALL_FAILED_VERSION_DOWNGRADE']) {
    const hint = installHint(code, 'com.exemple.app');
    assert.match(hint, /adb uninstall com\.exemple\.app/, 'la commande doit être donnée telle quelle');
    assert.match(hint, /EFFACE les données/, `${code} propose une désinstallation sans en dire le prix`);
  }
  // Le manque de place ne se règle pas en désinstallant l'app qu'on veut poser.
  assert.ok(!installHint('INSTALL_FAILED_INSUFFICIENT_STORAGE', 'x').includes('adb uninstall'),
    'suggérer de désinstaller ici ferait détruire des données pour rien');
});

test('un échec inconnu n\'invente pas de remède', () => {
  assert.equal(installHint('quelque chose que personne n\'a prévu', 'x'), '',
    'un conseil inventé sur un code non reconnu enverrait chercher au mauvais endroit');
});


// ───────────────────────────────────────────────────────────────────────────
// Le garde du cadrage a été VACANT — voici le cas exact qui le vidait
// ───────────────────────────────────────────────────────────────────────────
//
// Le cadrage est devenu local (par écran), et la comparaison a été refaite écran
// par écran — mais la CONDITION est restée globale : `stamped !== visualCrop`.
// Avec un `visualCropOn` global vide et des cadrages posés sur les écrans, elle
// valait `'' !== ''`, donc faux. L'avertissement ne sortait jamais et l'échec
// suivant se lisait comme une régression de l'application.
//
// ⚠️ Un correctif ne supprime pas toujours un mode de panne : souvent il le
// DÉPLACE, et le garde qui veillait sur l'ancien passe au vert sans rien
// mesurer. Ce test rejoue la configuration précise qui produisait ce silence.

// ⚠️ On appelle LA fonction du runner, pas une copie. La première version de ce
// garde réimplémentait la décision ici : il vérifiait sa propre copie, et muter
// run.mjs ne le faisait pas tomber. C'est la mutation qui l'a dit, pas la
// relecture.
const ontBouge = (graves, ecrans, config) =>
  screensWithMovedCrop(graves, ecrans, config).map((sc) => sc.id);

test('un cadrage par écran qui bouge est vu, même avec un global vide', () => {
  // la configuration exacte qui rendait le garde muet
  const graves = { home: 'home_canvas', form: '' };
  const ecrans = [{ id: 'home', visualCropOn: 'AUTRE_CONTENEUR' }, { id: 'form' }];
  assert.deepEqual(ontBouge(graves, ecrans, { visualCropOn: '' }), ['home'],
    'global vide et gravé vide : la comparaison globale valait \'\' !== \'\' et ne voyait rien');
});

test('rien ne bouge quand rien n\'a bougé — le garde ne crie pas pour rien', () => {
  const graves = { home: 'home_canvas', form: '' };
  const ecrans = [{ id: 'home', visualCropOn: 'home_canvas' }, { id: 'form' }];
  assert.deepEqual(ontBouge(graves, ecrans, { visualCropOn: '' }), []);
});

test('une empreinte de l\'ancien format vaut pour tous les écrans', () => {
  // ⚠️ On fait PRODUIRE l'objet par la lecture du fichier, on ne le fabrique
  // pas ici : un test qui construit `{'*': …}` lui-même ne garde pas le maillon
  // qui la produit — vérifié par mutation, il restait vert.
  const dir = mkdtempSync(join(tmpdir(), 'argus-crop-'));
  writeFileSync(join(dir, '.argus-crop'), 'ancien_conteneur\n');
  const ancien = baselineCrops(dir);
  assert.equal(baselineCropFor(ancien, 'home'), 'ancien_conteneur',
    'un fichier de l\'ancien format doit valoir pour tous les écrans');
  assert.equal(baselineCropFor(ancien, 'nimporte_lequel'), 'ancien_conteneur');

  // et le format actuel, lu du disque lui aussi
  writeFileSync(join(dir, '.argus-crop'), JSON.stringify({ home: 'home_canvas', form: '' }));
  const neuf = baselineCrops(dir);
  assert.equal(baselineCropFor(neuf, 'home'), 'home_canvas');
  assert.equal(baselineCropFor(neuf, 'form'), '');
  assert.equal(baselineCropFor(neuf, 'inconnu'), null, 'un écran non gravé n\'a rien à comparer');

  rmSync(dir, { recursive: true, force: true });
  assert.equal(baselineCropFor(null, 'home'), null, 'pas de références : rien à comparer');
  assert.equal(baselineCrops(dir), null, 'dossier absent : pas d\'empreinte');
});


// ───────────────────────────────────────────────────────────────────────────
// Ce qu'on installe n'est pas ce qu'on analyse
// ───────────────────────────────────────────────────────────────────────────

test('le binaire scanné suit son propre chemin, sans toucher à celui qu\'on installe', () => {
  const config = { build: { android: 'app-debug.apk', androidScan: 'app-release.apk' } };
  assert.equal(binaryToScan('android', config), 'app-release.apk');
  assert.equal(binaryToScan('android', config, 'ponctuel.apk'), 'ponctuel.apk',
    'l\'option doit primer sur la clé durable');
  assert.equal(config.build.android, 'app-debug.apk',
    'et l\'installation ne doit pas avoir bougé — c\'est tout l\'objet de la séparation');
});

test('sans clé dédiée, le comportement d\'avant est conservé', () => {
  assert.equal(binaryToScan('android', { build: { android: 'app-debug.apk' } }), 'app-debug.apk',
    'sinon une config existante cesserait de scanner quoi que ce soit');
  assert.equal(binaryToScan('ios', { build: { ios: 'Runner.app' } }), 'Runner.app');
  assert.equal(binaryToScan('android', {}), '', 'rien de déclaré : rien à scanner, pas de plantage');
});

// ───────────────────────────────────────────────────────────────────────────
// Un budget de publication appliqué à un debug le DIT
// ───────────────────────────────────────────────────────────────────────────
//
// Mesuré sur un projet réel : 117,5 Mo contre un budget de 60 — la release du
// même projet fait 32,1. Le finding ne disait pas sur quoi il avait mesuré.

test('un dépassement mesuré sur un debug nomme le variant', () => {
  const f = thresholdFinding('QAM-PERF-SIZE', 'Taille du binaire', 117.5, 60, 'Mo', 'performance', 'debug');
  assert.match(f.title, /debug/, 'le titre doit dire sur quoi la mesure a été prise');
  assert.match(f.suggestedFix, /release/i, 'et renvoyer à la comparaison qui tranche');
});

test('sur un binaire de publication, le finding reste ce qu\'il était', () => {
  const f = thresholdFinding('QAM-PERF-SIZE', 'Taille du binaire', 117.5, 60, 'Mo', 'performance', '');
  assert.ok(!/debug/.test(f.title), 'pas de mention parasite quand il n\'y a rien à nuancer');
  assert.ok(!/DEBUG/.test(f.suggestedFix));
  assert.equal(thresholdFinding('QAM-PERF-SIZE', 'x', 30, 60, 'Mo'), null,
    'et sous le budget, toujours aucun finding');
});

// ───────────────────────────────────────────────────────────────────────────
// Le DÉMARRAGE porte son contexte de mesure — variant du binaire ET état de l'hôte
// ───────────────────────────────────────────────────────────────────────────
//
// Run 26, point 193 : la réserve de variant n'était passée qu'à la taille et à
// la mémoire. Le démarrage — la métrique la PLUS sensible au variant, un debug
// exécutant le Dart en JIT — partait nu, et c'est lui qui produit le seul
// `critical` d'une page publiée : « 11 745 ms contre 2 000 », sans un mot sur
// le binaire mesuré.
//
// Ces gardes APPELLENT la construction au lieu de chercher un motif dans la
// source : un garde de câblage qui lit du texte reste vert devant une valeur
// neutralisée, leçon payée deux jours de suite sur ce chantier.

test('les deux findings de démarrage nomment le variant ET l\'état de l\'hôte', () => {
  const hote = hostContext(true);
  const fs = launchTimeFindings({ medianMs: 11745 }, { medianMs: 4000 },
    { coldStartMs: 2000, warmStartMs: 1000 }, 'debug', hote);
  assert.equal(fs.length, 2, 'les deux dépassements doivent produire un finding');
  for (const f of fs) {
    assert.match(f.title, /debug/, `${f.id} : le titre doit dire sur quel binaire on a mesuré`);
    assert.match(f.suggestedFix, /charge hôte/, `${f.id} : et dans quel état était la machine`);
  }
});

test('la réserve du démarrage est la sienne, pas celle de la taille', () => {
  // Le « facteur trois » a été relevé sur des tailles de binaire. Le recopier
  // sur un temps de démarrage serait un nombre deviné — précisément ce que ce
  // harnais reproche aux relevés qu'il lit.
  assert.match(caveatDebug('QAM-PERF-COLD'), /JIT/, 'le démarrage explique POURQUOI un debug ment');
  assert.ok(!/facteur trois/.test(caveatDebug('QAM-PERF-COLD')),
    'et n\'emprunte pas un chiffre mesuré sur une autre grandeur');
  assert.match(caveatDebug('QAM-PERF-SIZE'), /facteur trois/, 'la taille garde le sien, qui est mesuré');
  assert.ok(!/JIT/.test(caveatDebug('QAM-PERF-MEM')));
});

test('en release, le contexte hôte reste et la mention debug disparaît', () => {
  const fs = launchTimeFindings({ medianMs: 11745 }, { medianMs: 4000 },
    { coldStartMs: 2000, warmStartMs: 1000 }, '', hostContext(true));
  assert.equal(fs.length, 2);
  for (const f of fs) {
    assert.ok(!/debug|DEBUG/.test(f.title + f.suggestedFix), `${f.id} : rien à nuancer sur une release`);
    assert.match(f.suggestedFix, /charge hôte/, `${f.id} : l'hôte, lui, compte quel que soit le binaire`);
  }
});

test('sous les budgets, le démarrage ne produit toujours rien', () => {
  const fs = launchTimeFindings({ medianMs: 900 }, { medianMs: 500 },
    { coldStartMs: 2000, warmStartMs: 1000 }, 'debug', hostContext(true));
  assert.equal(fs.length, 0, 'un contexte de mesure ne doit pas fabriquer de finding');
});

test('hostContext RELÈVE et ne juge pas', () => {
  const emu = hostContext(true);
  assert.equal(typeof emu.loadAvg1, 'number');
  assert.ok(emu.cpuCount > 0, 'le nombre de cœurs doit être lu, pas supposé');
  assert.equal(emu.loadPerCpu, Math.round((emu.loadAvg1 / emu.cpuCount) * 100) / 100);
  assert.match(emu.phrase, /ÉMULATEUR/, 'un émulateur partage le CPU de l\'hôte, et la phrase le dit');
  const phys = hostContext(false);
  assert.match(phys.phrase, /physique/, 'un appareil physique a sa charge propre');
  assert.ok(!/ÉMULATEUR/.test(phys.phrase));
  // ⚠️ Aucun seuil : « charge > 1 par cœur » aurait été VACANT sur le cas qui
  // motive ce relevé — 0,53 par cœur pendant qu'un démarrage passait de 1 768
  // à 11 745 ms. Ce que le lecteur doit pouvoir faire, c'est comparer deux runs.
  assert.ok(!/trop chargé|surchargé|seuil/i.test(emu.phrase),
    'le relevé ne rend aucun verdict : il donne de quoi comparer');
});

test('perf.json ÉCRIT ce que le chiffre de démarrage mesure', () => {
  // Point 197, né de la passe : la phrase existait, elle était construite dans
  // une variable locale, et rien ne la lisait — sous les trois lignes de
  // commentaire qui expliquent pourquoi elle est indispensable.
  const label = startupMetricLabel();
  assert.match(label, /am start -W/, 'la phrase doit nommer l\'instrument');
  assert.match(label, /startup\.samples/, 'et renvoyer à l\'autre grandeur, sinon l\'écart passe pour une contradiction');
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs'), 'utf8');
  const cle = src.match(/startupMetric:\s*(\w+)/);
  assert.ok(cle, 'plus aucune clé `startupMetric:` dans le rapport — si elle a été renommée, mets ce garde à jour');
  assert.equal(cle[1], 'mesure', 'la clé doit porter la valeur construite, pas une constante réécrite à côté');
});

// ───────────────────────────────────────────────────────────────────────────
// La valeur configurée EST la valeur exécutée
// ───────────────────────────────────────────────────────────────────────────
//
// Le run 9 : `argus.mobile.yaml` portait `androidBuildCmd`, les scripts de
// mesure l'AFFICHAIENT quand le binaire manquait, et `make argus-build`
// lançait sa propre ligne écrite en dur. Un projet qui ciblait son ABI
// reconstruisait donc l'APK gras — celui que l'installation venait de refuser.
//
// Le garde ne surveille pas la ligne corrigée : il balaie TOUT le Makefile.
// Une seconde cible qui recoderait un build en dur tomberait sans que personne
// y pense — c'est le seul remède au motif qui domine ce chantier.

test('aucune cible du Makefile ne code en dur un build que la config porte', () => {
  const makefile = readFileSync(
    join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'), 'utf8');

  // Les lignes de recette (celles qui s'exécutent) : elles commencent par une
  // tabulation. Les commentaires et la doc des cibles ne s'exécutent pas.
  const recettes = makefile.split('\n').filter((l) => l.startsWith('\t'));
  assert.ok(recettes.length > 10, 'motif introuvable : le Makefile n\'a plus de recettes tabulées ?');

  const enDur = recettes.filter((l) => /\bbuild\s+(apk|appbundle|ios|ipa)\b/.test(l));
  assert.deepEqual(enDur, [],
    'ces recettes lancent un build littéral au lieu de résoudre la commande de la config '
    + '(`node scripts/argus/config.mjs --print-build-cmd`) :\n  ' + enDur.join('\n  '));

  // L'autre moitié : la cible existe toujours et passe bien par la config.
  const cible = /^argus-build:.*?(?=\n[a-z-]+:)/ms.exec(makefile);
  assert.ok(cible, 'la cible argus-build a disparu — le garde ci-dessus deviendrait vacant');
  assert.match(cible[0], /--print-build-cmd/,
    'argus-build doit demander la commande à la config, pas l\'inventer');
  assert.match(cible[0], /--print-binary/,
    'et mesurer le paquet : « Built » ne prouve pas qu\'un paquet a été refait');
  // ⚠️ Le critère est le HASH, pas la taille. La taille a crié au loup sur un
  // build démontrablement frais (run 11) : deux paquets de même taille ont des
  // contenus différents, et le remède prescrit coûtait ~50 s pour rien. Un
  // sha256 identique, lui, prouve que le fichier n'a pas été réécrit.
  assert.match(cible[0], /shasum/,
    'l\'avertissement doit se décider sur le hash — la taille confond deux paquets différents');
});

test('la commande de build reste ciblable sur l\'ABI, dans les deux sens', () => {
  const base = 'flutter build apk --debug';
  assert.equal(buildCmdForAbi(base, 'arm64-v8a'), `${base} --target-platform android-arm64`);
  assert.equal(buildCmdForAbi(base, ''), base, 'sans device, la commande sort intacte');
  assert.equal(buildCmdForAbi(`${base} --target-platform android-arm64`, 'x86_64'),
    `${base} --target-platform android-arm64`, 'un ciblage déjà écrit à la main prime');
});

// ───────────────────────────────────────────────────────────────────────────
// Un outil du SDK n'est pas « absent » parce qu'il n'est pas au PATH
// ───────────────────────────────────────────────────────────────────────────
//
// Run 9 : la moitié de la dimension sécurité sautait faute d'`aapt2` au PATH,
// alors qu'il est livré avec les Build-Tools de toute machine Android. Le
// classement des versions est gardé ici parce que ma PREMIÈRE écriture s'est
// trompée deux fois — `sort()` alphabétique place « 9.0.0 » après « 35.0.0 »,
// et préférait une release candidate à une stable.

test('le classement des Build-Tools est numérique, et la stable prime', () => {
  assert.equal(rankBuildTools(['9.0.0', '35.0.0', '34.0.0'])[0], '35.0.0',
    'un tri alphabétique placerait 9.0.0 en tête');
  assert.equal(rankBuildTools(['37.0.0-rc2', '35.0.0'])[0], '35.0.0',
    'une préversion ne prime jamais sur une stable, même plus récente');
  assert.equal(rankBuildTools(['37.0.0', '37.0.0-rc2'])[0], '37.0.0');
  assert.equal(rankBuildTools(['37.0.0-rc2'])[0], '37.0.0-rc2',
    'à défaut de stable, la RC sert : mieux qu\'une dimension sautée');
  assert.deepEqual(rankBuildTools([]), [], 'aucun dossier : aucun plantage');
});

test('toolPath ne détourne que les outils du SDK, et rend le nom nu sinon', () => {
  for (const nu of ['adb', 'maestro', 'flutter', 'unzip', 'osv-scanner']) {
    assert.equal(toolPath(nu), nu, `${nu} doit rester résolu par le PATH`);
  }
  // L'autre moitié : sur une machine sans SDK, les deux outils du SDK sortent
  // nus eux aussi — l'appelant reçoit alors l'ENOENT habituel, et le message
  // d'outil absent reste celui qu'on connaît.
  for (const sdk of ['aapt2', 'apkanalyzer']) {
    const p = toolPath(sdk);
    assert.ok(p === sdk || p.endsWith(sdk) || p.endsWith(`${sdk}.exe`) || p.endsWith(`${sdk}.bat`),
      `toolPath('${sdk}') doit rendre un chemin vers ${sdk}, ou son nom nu — obtenu « ${p} »`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────
//
// Run 10 : `make argus-baselines` a écrit ses 4 références, l'a dit, puis est
// sorti en 1 — il héritait du gate des flows qu'il venait de jouer pour les
// produire. Sur un run en aveugle ce rouge se lit « la génération a échoué »,
// et on recommence ce qui était déjà fait.

test('une génération réussie sort en 0, même si le gate aurait échoué', () => {
  const v = baselineVerdict(4, 1, 'argus-mobile-report');
  assert.equal(v.exit, 0, 'le verdict doit porter sur ce que LA COMMANDE fait');
  assert.equal(v.errors.length, 0);
  assert.ok(v.warnings.some((l) => /ne compare pas/.test(l)),
    'et dire pourquoi le gate ne s\'applique pas, sinon le silence ressemble à un oubli');
  assert.ok(v.warnings.some((l) => /4 référence/.test(l)), 'avec le compte de ce qui a été écrit');
});

test('zéro référence écrite reste un ÉCHEC — le garde ne coupe qu\'un sens', () => {
  const v = baselineVerdict(0, 0, 'argus-mobile-report');
  assert.equal(v.exit, 2,
    'sans ça, « ne plus appliquer le gate » deviendrait « ne plus jamais échouer »');
  assert.ok(v.errors.some((l) => /aucune référence/.test(l)));
  assert.ok(v.errors.some((l) => /visual: true/.test(l)), 'et nommer le geste qui débloque');
});

test('une génération réussie sans finding ne dit rien de superflu', () => {
  const v = baselineVerdict(5, 0);
  assert.deepEqual({ exit: v.exit, w: v.warnings.length, e: v.errors.length }, { exit: 0, w: 0, e: 0 },
    'pas d\'avertissement quand il n\'y a rien à expliquer');
});

// ───────────────────────────────────────────────────────────────────────────
// Le contrat de sortie, un cran PLUS BAS
// ───────────────────────────────────────────────────────────────────────────
//
// Le garde du dessus fige les clés de PREMIER niveau, et il a tenu. Le bloc
// jsonc, lui, promet aussi le contenu de `run` — dont `env` et `mode`, qui
// n'ont jamais été écrits : neuf runs, aucun rouge. Le garde existait, il
// s'arrêtait à un niveau. C'est le motif du chantier appliqué à un garde.
//
// `commit?` porte un point d'interrogation : le contrat le déclare facultatif,
// il est donc exclu du relevé — la marque est ce qui rend la promesse tenable.

/** Les sous-clés que le bloc jsonc promet à `run`, hors optionnelles. */
function sousClesRunDocumentees() {
  const doc = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/references/report-format-mobile.md'), 'utf8');
  const m = /"run":\s*\{([^}]*)\}/.exec(doc);
  assert.ok(m, 'le bloc jsonc ne décrit plus `run` — reformulé ? le garde est vacant');
  const cles = [...m[1].matchAll(/"([a-zA-Z_]+)(\??)"/g)]
    .filter((x) => x[2] !== '?').map((x) => x[1]).sort();
  assert.ok(cles.length >= 3, `motif trouvé mais quasi vide : ${cles.length} clé(s)`);
  return cles;
}

/** Les sous-clés réellement écrites dans `report.run` par run.mjs. */
function sousClesRunEcrites() {
  const src = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  // ⚠️ Depuis `const report = {`, jamais depuis le début du fichier : la
  // PREMIÈRE occurrence de `run: {` est le rapport d'interruption, écrit sur
  // une ligne et porteur de trois clés. Ancré là, ce garde relevait « 0 clé »
  // et son assertion de non-vacuité l'a dit — sinon il aurait comparé le
  // contrat au mauvais bloc, et rendu un verdict sur autre chose.
  const base = src.indexOf('const report = {');
  assert.notEqual(base, -1, 'le littéral `const report = {` est introuvable — le garde ne garde plus rien');
  const i = src.indexOf('    run: {', base);
  assert.notEqual(i, -1, 'le bloc `run` du rapport est introuvable — le garde ne garde plus rien');
  let prof = 0; let fin = i;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}' && --prof === 0) { fin = k; break; }
  }
  const cles = []; let p = 0;
  for (const ligne of src.slice(i, fin + 1).split('\n')) {
    // ⚠️ TOUTES les clés de la ligne, pas la première : le rapport en groupe
    // plusieurs par ligne (`startedAt: …, platform, appVersion: …`). Ne lire que
    // la première faisait manquer `platform`, `appVersion` et `mode`, et le
    // garde accusait le code d'omissions qu'il n'avait pas.
    if (p === 1 && !/^\s*\/\//.test(ligne)) {
      // Le délimiteur de fin en LOOKAHEAD : le consommer mangeait la virgule
      // qui sert d'ancre au match suivant, si bien qu'une clé sur deux
      // disparaissait dans une ligne groupée (`platform, appVersion: …`).
      for (const m of ligne.matchAll(/(?:^\s{6}|[{,]\s*)([a-zA-Z_]+)(?=\s*[:,])/g)) cles.push(m[1]);
    }
    p += (ligne.match(/\{/g) ?? []).length - (ligne.match(/\}/g) ?? []).length;
  }
  assert.ok(cles.length >= 4, `motif trouvé mais quasi vide : ${cles.length} clé(s)`);
  return cles.sort();
}

test('tout ce que le contrat promet à `run` est écrit', () => {
  const promis = sousClesRunDocumentees();
  const ecrites = sousClesRunEcrites();
  const manquantes = promis.filter((k) => !ecrites.includes(k));
  assert.deepEqual(manquantes, [],
    'le contrat de sortie promet ces sous-clés de `run` et rien ne les écrit — '
    + 'écris-les, ou retire-les du contrat :\n  ' + manquantes.join(', '));
});

// ───────────────────────────────────────────────────────────────────────────
// Tout axe d'ancres que le TYPE porte, le gabarit du rapport le compte
// ───────────────────────────────────────────────────────────────────────────
//
// `displays:` est arrivé au run 8, son indice au run 9, et au run 10 le gabarit
// du rapport d'instrumentation ne le connaissait toujours pas : un agent en a
// posé 7 et n'avait nulle part où les compter. Troisième voisin de la même
// notion en trois runs.
//
// Le remède du run 9 — extraire plutôt que recopier — couvrait le CODE. Il ne
// couvrait pas les énumérations en PROSE, et c'est là que le trou est resté.
// Ce garde dérive donc les axes du type lui-même : un quatrième axe ajouté à
// ArgusScreen fera rougir tant que le gabarit ne le nomme pas.

test('le gabarit du rapport d\'instrumentation nomme tous les axes du type', () => {
  const types = readFileSync(
    join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/argus_types.dart'), 'utf8');
  const axes = [...types.matchAll(/^ {2}final List<String> ([a-zA-Z]+);/gm)].map((m) => m[1]);
  assert.ok(axes.length >= 3, `motif introuvable dans argus_types.dart : ${axes.length} axe(s) — le garde est vacant`);

  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const i = skill.indexOf("Racines d'état");
  assert.notEqual(i, -1, 'le gabarit du rapport d\'instrumentation a disparu du SKILL — garde vacant');
  const gabarit = skill.slice(i, i + 900);

  const absents = axes.filter((a) => !gabarit.includes(a));
  assert.deepEqual(absents, [],
    'ces axes existent dans ArgusScreen et le gabarit du rapport ne les compte nulle part — '
    + 'un agent qui en pose n\'a pas de case où les mettre, et s\'abstient ou invente :\n  '
    + absents.join(', '));
});

// ───────────────────────────────────────────────────────────────────────────
// L'avertissement de locale ne parle que quand il a quelque chose à dire
// ───────────────────────────────────────────────────────────────────────────
//
// Il sortait dès que la clé était renseignée et `autoStart` faux — la
// disposition que le skill RECOMMANDE depuis le point 124. Trois lignes de bruit
// par exécution sur une configuration correcte, relevées comme telles au run 12.
// Un avertissement systématique cesse d'être lu, et emporte les vrais avec lui.

test('locale : silence quand l\'appareil est DÉJÀ dans la locale demandée', () => {
  assert.deepEqual(localeWarnings('fr_FR', false, 'fr-FR'), [],
    'le cas nominal du skill — avd nommé, device réglé — ne doit rien dire');
  assert.deepEqual(localeWarnings('fr_FR', false, 'fr-FR,en-US'), [],
    'une liste de locales : c\'est la première qui compte');
  assert.deepEqual(localeWarnings('fr_FR', true, 'en-US'), [],
    'sous autoStart la locale SERA appliquée : rien à signaler');
  assert.deepEqual(localeWarnings('', false, 'en-US'), [], 'rien de demandé, rien à dire');
});

test('locale : il parle quand l\'écart est réel — le garde ne coupe qu\'un sens', () => {
  const differe = localeWarnings('fr_FR', false, 'en-US');
  assert.ok(differe.length >= 1, 'sans ça, « moins de bruit » deviendrait « ne prévient jamais »');
  assert.match(differe[0], /en-US/, 'et il doit dire ce que l\'appareil rend, pas seulement ce qu\'on voulait');
  const illisible = localeWarnings('fr_FR', false, null);
  assert.ok(illisible.length >= 1, 'locale illisible : on ne peut pas conclure au silence');
  assert.match(illisible[0], /pas pu être lue/);
});

// ───────────────────────────────────────────────────────────────────────────
// La branche « rien à naviguer » se DÉRIVE, elle ne se devine pas
// ───────────────────────────────────────────────────────────────────────────
//
// `goto.yaml` décidait par `startsWith('home')` : ça sert l'écran de départ et
// ça MENT sur son voisin de famille, qu'aucune branche ne prépare alors que la
// condition prétend l'avoir atteint. Trois runs de suite l'ont rencontré — et
// mes deux premières passes se sont contentées de le DÉCRIRE, en commentaire,
// au-dessus de la ligne qui le posait. Décrire un piège ne le ferme pas.

test('buildEnv expose l\'id de l\'écran de départ, pas seulement son ancre', () => {
  const env = buildEnv({
    screens: [
      { id: 'home-empty', anchor: 'home_empty_root', start: true },
      { id: 'home-filled', anchor: 'home_filled_root' },
    ],
  }, 'com.exemple.app');
  assert.equal(env.ARGUS_START_SCREEN, 'home-empty',
    'sans cet id, goto.yaml ne peut que deviner par préfixe');
  assert.equal(env.ARGUS_ANCHOR_HOME, 'home_empty_root', 'et l\'ancre reste exposée');
});

test('la condition dérivée sert le départ et laisse passer son voisin de famille', () => {
  const env = buildEnv({
    screens: [{ id: 'home-empty', anchor: 'a', start: true }, { id: 'home-filled', anchor: 'b' }],
  }, 'app');
  const rienANaviguer = (/** @type {string} */ id) => id === '' || id === env.ARGUS_START_SCREEN;
  assert.ok(rienANaviguer('home-empty'), 'le lancement y mène déjà');
  assert.ok(rienANaviguer(''), 'aucun écran demandé : on est là où le lancement laisse');
  for (const voisin of ['home-filled', 'history-empty', 'categories-filled']) {
    assert.ok(!rienANaviguer(voisin),
      `${voisin} doit tomber dans une branche qui le PRÉPARE — un startsWith l'avalait`);
  }
});

test('le sous-flow livré emploie la condition dérivée, pas un préfixe', () => {
  const goto = readFileSync(
    join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/_subflows/goto.yaml'), 'utf8');
  const conditions = goto.split('\n').filter((l) => l.includes('true: "${'));
  assert.ok(conditions.length > 0, 'aucune condition trouvée — le garde est vacant');
  const devinees = conditions.filter((l) => /startsWith\(/.test(l));
  assert.deepEqual(devinees, [],
    'ces conditions décident par préfixe : elles servent un état et mentent sur ses voisins\n  '
    + devinees.join('\n  '));
  assert.ok(goto.includes('ARGUS_START_SCREEN'), 'et la branche du départ doit se dériver de la config');
});

// ───────────────────────────────────────────────────────────────────────────
// Un rapport PARTIEL ne doit pas pouvoir passer pour complet
// ───────────────────────────────────────────────────────────────────────────
//
// La contre-épreuve visuelle prescrite par le skill lance `run.mjs --tags=visual`,
// qui écrit le MÊME report.json qu'une passe complète — avec dedans la régression
// qu'on vient de fabriquer pour prouver que la comparaison mesure. Un
// `argus-report` lancé derrière la publiait comme un fait : le journal de
// VÉRIFICATION lu comme un journal de RÉSULTATS, et c'est le skill qui y menait.

test('le rapport porte le périmètre du run qui l\'a produit', () => {
  const src = readFileSync(
    join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  const i = src.indexOf('const report = {');
  assert.notEqual(i, -1, 'littéral du rapport introuvable — le garde est vacant');
  const bloc = src.slice(i, i + 2000);
  assert.match(bloc, /scope:/, 'sans ce champ, rien ne distingue un run filtré d\'une passe complète');
  assert.match(bloc, /includeTags|excludeTags/, 'et il doit se DÉRIVER des tags, pas être écrit à la main');
});

test('le rapport HTML avertit sur un run filtré, et se tait sur un run complet', () => {
  const src = readFileSync(
    join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs'), 'utf8');
  const m = /run\?\.scope[^\n]*\n?[^\n]*/.exec(src);
  assert.ok(m, 'le rendu ne lit plus `run.scope` — le bandeau a disparu');
  assert.match(m[0], /!==\s*'complet'/,
    'la condition doit exclure le cas complet, sinon le bandeau crie sur chaque rapport');
  const i = src.indexOf('run?.scope');
  assert.match(src.slice(i, i + 700), /partiel/, 'et le bandeau doit se nommer');
});

// ───────────────────────────────────────────────────────────────────────────
// Une promesse écrite dans le SKILL doit être TENUE par le code
// ───────────────────────────────────────────────────────────────────────────
//
// Le §2b dit : « déclare-le ARGUS:OWNED, sinon il n'apparaît ni dans la liste
// que l'installeur imprime en sortant, ni dans son --check ». C'était FAUX le
// jour où je l'ai écrit : la boucle finale n'itérait que le scaffold, donc un
// fichier créé dans le PROJET restait invisible quel que soit son marqueur.
// Rien ne mesurait cette promesse — c'est exactement le défaut que la règle
// « une phrase de doc se traduit en test » existe pour empêcher.

test('l\'installeur liste aussi les fichiers OWNED que le PROJET a créés', () => {
  const dir = mkdtempSync(join(tmpdir(), 'argus-owned-'));
  try {
    mkdirSync(join(dir, 'test/argus'), { recursive: true });
    writeFileSync(join(dir, 'test/argus/argus_fakes.dart'), '// ARGUS:OWNED — sonde\nconst x = 1;\n');
    writeFileSync(join(dir, 'test/argus/sans_marqueur.dart'), '// rien\nconst y = 2;\n');
    const script = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/scripts/install-mobile.sh');
    const out = execFileSync('bash', [script, dir], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    const i = out.indexOf("Les fichiers qui t'appartiennent");
    assert.notEqual(i, -1, 'la liste a disparu de la sortie — le garde est vacant');
    const liste = out.slice(i, out.indexOf('\n\n', i));
    assert.ok(liste.split('\n').length > 5, `liste quasi vide (${liste.split('\n').length} lignes) : l'instrument ne mesure pas`);

    assert.match(liste, /argus_fakes\.dart/,
      'un fichier du PROJET portant ARGUS:OWNED doit être listé — le SKILL le promet');
    assert.ok(!/sans_marqueur/.test(liste),
      'et un fichier SANS marqueur ne doit pas l\'être, sinon la liste ne veut plus rien dire');

    const noms = [...liste.matchAll(/[✏✔][^\s]*\s+(\S+)/g)].map((m) => m[1]);
    assert.deepEqual(noms.filter((n, k) => noms.indexOf(n) !== k), [],
      'un fichier présent des deux côtés ne doit apparaître qu\'une fois');
    assert.ok(!/install-mobile\.sh: line \d+:/.test(out), 'l\'installeur a émis une erreur shell');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


// ── Le plafond d'attente : aucune mesure ne doit pouvoir attendre sans fin ──
//
// Pourquoi ces gardes existent : `argus-perf` s'est bloqué 3 fois sur 5 dans sa
// boucle de démarrages à chaud — 12 min, 1 min 48, un troisième tué à 4 min,
// pendant qu'une quatrième tentative rendait la mesure complète en 10 s. Aucun
// script ne passait de `timeout` à `spawnSync`, et le blocage était MUET : ce
// qu'on lit alors en CI est « le job a expiré », jamais « une mesure de
// démarrage n'a pas rendu la main ».
//
// Les commandes de test sont des `node -e`, pas des `sleep` : le plafond doit
// être mesuré là où la suite tourne, sans rien supposer du système hôte.

const NODE = process.execPath;
/** Un process qui dort — et, au besoin, qui refuse de mourir poliment. */
const DORT = (tetu) => ['-e', `${tetu ? 'process.on("SIGTERM",()=>{});' : ''}setTimeout(()=>{},9000)`];

test('le plafond suit trois voies, et l\'appelant l\'emporte sur les deux autres', () => {
  assert.equal(shTimeoutMs({}, {}), SH_TIMEOUT_MS, 'sans rien, le défaut');
  assert.equal(shTimeoutMs({}, { ARGUS_SH_TIMEOUT_MS: '1234' }), 1234, 'l\'environnement passe devant le défaut');
  assert.equal(shTimeoutMs({ timeout: 77 }, { ARGUS_SH_TIMEOUT_MS: '1234' }), 77,
    'un appelant qui a mesuré sa commande passe devant l\'environnement');
});

test('une valeur vide, nulle ou absurde ne devient pas un plafond', () => {
  // `Number('')` vaut 0 et `Number('oui')` vaut NaN : les deux passeraient pour
  // « pas d'attente du tout », c'est-à-dire une commande tuée avant de démarrer.
  for (const valeur of ['', '0', '-1', 'oui']) {
    assert.equal(shTimeoutMs({}, { ARGUS_SH_TIMEOUT_MS: valeur }), SH_TIMEOUT_MS,
      `ARGUS_SH_TIMEOUT_MS=${JSON.stringify(valeur)} doit retomber sur le défaut`);
  }
  assert.equal(shTimeoutMs({ timeout: 0 }, {}), SH_TIMEOUT_MS, 'timeout: 0 est une absence, pas un plafond');
});

test('sh rend la main au plafond, et le rapporte', () => {
  const depart = Date.now();
  const res = sh(NODE, DORT(false), { timeout: 400 });
  const duree = Date.now() - depart;
  assert.equal(res.timedOut, true, 'un dépassement doit se voir dans le résultat, pas seulement dans la durée');
  assert.equal(res.ok, false);
  assert.ok(duree < 3000, `${duree} ms pour un plafond de 400 : la commande n'a pas été bornée`);
});

test('le plafond tient MÊME contre un process qui ignore SIGTERM', () => {
  // ⚠️ Mesuré, pas supposé : `timeout` seul ne borne rien ici. Le signal envoyé
  // par défaut est SIGTERM, et un process qui l'ignore laisse `spawnSync`
  // attendre sa fin naturelle — 9 068 ms relevés pour un plafond de 300, avec
  // `ETIMEDOUT` rendu quand même. C'est le pire des deux mondes : un dépassement
  // qui se RAPPORTE sans avoir jamais été borné, donc un garde écrit sur le seul
  // `timedOut` resterait vert pendant que le harnais attend.
  const depart = Date.now();
  const res = sh(NODE, DORT(true), { timeout: 400 });
  const duree = Date.now() - depart;
  assert.equal(res.timedOut, true);
  assert.ok(duree < 3000,
    `${duree} ms pour un plafond de 400 — le signal de mise à mort ne suffit pas à borner l'attente`);
});

test('et l\'autre moitié : une commande qui répond n\'est pas marquée expirée', () => {
  // Un plafond qui tue tout aurait passé les trois gardes ci-dessus.
  const res = sh(NODE, ['-e', 'console.log("vivant")'], { timeout: 10000 });
  assert.equal(res.timedOut, false);
  assert.equal(res.ok, true);
  assert.equal(res.stdout.trim(), 'vivant');
});

test('sh applique un plafond même quand AUCUN appelant n\'en passe', () => {
  // Le câblage, pas la fonction : `shTimeoutMs` peut rester parfaite pendant que
  // `sh` cesse de l'appeler, et c'est un défaut qu'aucun appelant ne verrait —
  // il tiendrait quinze minutes au lieu de l'infini, donc jamais en test.
  const avant = process.env.ARGUS_SH_TIMEOUT_MS;
  process.env.ARGUS_SH_TIMEOUT_MS = '400';
  try {
    const depart = Date.now();
    const res = sh(NODE, DORT(false));
    const duree = Date.now() - depart;
    assert.equal(res.timedOut, true, 'le plafond de l\'environnement n\'a pas été appliqué');
    assert.ok(duree < 3000, `${duree} ms : sh n'a pas passé de plafond à spawnSync`);
  } finally {
    if (avant === undefined) delete process.env.ARGUS_SH_TIMEOUT_MS;
    else process.env.ARGUS_SH_TIMEOUT_MS = avant;
  }
});

test('les sondes adb de perf.mjs partent avec le plafond COURT', () => {
  const perf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs'), 'utf8');
  // Critère total et négatif : aucun `sh('adb'` de ce fichier sans plafond, et
  // pas « celui que je viens d'écrire en porte un ».
  const sondes = perf.split('\n').filter((l) => /\bsh\('adb'/.test(l));
  assert.ok(sondes.length >= 1, 'plus aucun appel adb dans perf.mjs — si le nom a changé, mets ce motif à jour');
  for (const ligne of sondes) {
    assert.match(ligne, /timeout:\s*PROBE_TIMEOUT_MS/,
      `une sonde adb sans plafond court : ${ligne.trim()}`);
  }
  assert.ok(PROBE_TIMEOUT_MS < SH_TIMEOUT_MS,
    'le plafond des sondes doit rester bien en dessous de celui des commandes longues');
});

test('launchOutcome distingue une expiration d\'une mesure invalide', () => {
  // Les quatre cas, dont celui qui n'existait pas avant le plafond. Les
  // confondre envoie chercher un défaut d'activité là où le device n'a pas
  // répondu — le message d'erreur de perf.mjs branche sur cette distinction.
  assert.equal(launchOutcome({ timedOut: true, stdout: '' }).kind, 'timeout');
  assert.equal(launchOutcome({ stdout: 'Warning: Activity not started, intent has been delivered to currently running top-most instance' }).kind, 'none');
  const chaud = launchOutcome({ stdout: 'Warning: Activity not started, its current task has been brought to the front\nWaitTime: 137' });
  assert.equal(chaud.kind, 'resumed');
  assert.equal(chaud.waitMs, 137);
  const froid = launchOutcome({ stdout: 'Status: ok\nTotalTime: 842\nWaitTime: 871' });
  assert.equal(froid.kind, 'launched');
  assert.equal(froid.totalMs, 842);
  // Une expiration n'est PAS un TotalTime nul : le stdout d'une commande tuée
  // peut porter n'importe quoi, et c'est le drapeau qui tranche.
  assert.equal(launchOutcome({ timedOut: true, stdout: 'Status: ok\nTotalTime: 842' }).totalMs, null);
});

test('perf.mjs LIT son verdict par launchOutcome au lieu de le refaire', () => {
  const perf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs'), 'utf8');
  const appels = [...perf.matchAll(/launchOutcome\(/g)];
  assert.ok(appels.length >= 2,
    `${appels.length} occurrence(s) de launchOutcome — la déclaration et au moins un appel sont attendus`);
  // Et le compte des expirations doit ressortir : une médiane calculée sur les
  // échantillons survivants se lit comme n'importe quelle autre.
  assert.match(perf, /timedOutLaunches/,
    'perf.json ne porte plus le compte des lancements expirés : le relevé redevient muet');
  const boucles = perf.split('\n').filter((l) => /kind === 'timeout'/.test(l));
  assert.equal(boucles.length, 2,
    `${boucles.length} boucle(s) de mesure comptent les expirations au lieu de 2 (à froid ET à chaud)`);
});


// ── La raison d'un saut ne doit rien affirmer qu'on n'ait vérifié ───────────
//
// Point 217. Le saut de l'analyse binaire iOS est bon — le scan lit un APK, il
// n'a pas d'équivalent — mais il l'expliquait par « un .app de SIMULATEUR ».
// Or `iosScan` peut pointer un build device release, ce que le premier run iOS
// a fait : celui qui avait pris la peine de construire une release s'entendait
// expliquer qu'il avait un build de simulateur.
//
// Une raison FAUSSE dans un message honnête coûte plus qu'une raison absente :
// elle fait chercher au mauvais endroit.

test('le saut de l\'analyse iOS décrit le binaire QU\'ON A, pas celui qu\'on suppose', () => {
  const root = '/projet';
  const device = iosBinarySkipReason('/projet/build/ios/iphoneos/Runner.app', root);
  const simu = iosBinarySkipReason('/projet/build/ios/iphonesimulator/Runner.app', root);

  // ⚠️ LE CŒUR DU POINT : un build device ne doit PAS être appelé simulateur.
  assert.doesNotMatch(device, /simulateur/i,
    'un build device s\'entend encore dire qu\'il est un simulateur');
  assert.match(device, /build device/, 'la raison ne dit plus ce que le chemin montre');
  assert.match(device, /iphoneos\/Runner\.app/, 'la raison ne nomme pas le binaire dont elle parle');

  // ⚠️ L'AUTRE MOITIÉ, et elle compte autant : corriger l'affirmation fausse ne
  // doit pas faire perdre l'avertissement quand il est VRAI. Un correctif qui
  // se contenterait de retirer le mot « simulateur » passerait sans elle.
  assert.match(simu, /SIMULATEUR/, 'un vrai .app de simulateur n\'est plus signalé comme tel');

  // Les deux disent pourquoi le scan ne conclut pas — c'est la part qui, elle,
  // est vraie dans tous les cas.
  for (const r of [device, simu, iosBinarySkipReason('', root)]) {
    assert.match(r, /analyse binaire iOS non couverte/);
    assert.match(r, /MobSF|IPA/, 'la raison ne dit plus quoi faire à la place');
  }

  // Rien de déclaré : ne rien affirmer du tout sur ce qu'on n'a pas.
  const vide = iosBinarySkipReason('', root);
  assert.doesNotMatch(vide, /simulateur|build device/i,
    'sans chemin, la raison qualifie quand même un binaire qu\'elle n\'a pas vu');
});

test('la décision de sauter le scan est CÂBLÉE, pas seulement juste', () => {
  // ⚠️ CE GARDE EXISTE À CAUSE D'UNE MUTATION. La raison iOS était juste et
  // éprouvée, mais le site qui l'appelle pouvait la débrancher sans qu'un seul
  // garde ne bouge : remettre le message figé laissait la suite verte. C'est la
  // forme exacte du point 213 — une décision correcte que personne n'appelle.
  const dossier = mkdtempSync(join(tmpdir(), 'argus-plan-'));
  const apk = join(dossier, 'app-release.apk');
  writeFileSync(apk, 'PK');
  const config = { platforms: ['android'], build: { androidBuildCmd: 'flutter build apk --debug' } };

  // iOS : on ne scanne pas, et la raison est celle que la fonction dédiée rend —
  // c'est cette égalité qui prouve le câblage, et non la présence d'un nom.
  const ios = binaryScanPlan('ios', '/p/build/ios/iphoneos/Runner.app', '/p', config, true);
  assert.equal(ios.scan, false);
  assert.equal(ios.why, iosBinarySkipReason('/p/build/ios/iphoneos/Runner.app', '/p'));

  // Android, binaire présent, unzip là : on scanne. Sans ce cas, un plan qui
  // refuserait TOUT passerait — c'est la moitié qu'on oublie.
  assert.deepEqual(binaryScanPlan('android', apk, dossier, config, true), { scan: true, why: '' });

  // Les deux refus qui restent, chacun avec sa raison propre.
  const absent = binaryScanPlan('android', join(dossier, 'nulle-part.apk'), dossier, config, true);
  assert.equal(absent.scan, false);
  assert.match(absent.why, /binaire absent/);
  assert.match(absent.why, /flutter build apk/, 'le refus ne dit plus comment le construire');

  const sansUnzip = binaryScanPlan('android', apk, dossier, config, false);
  assert.equal(sansUnzip.scan, false);
  assert.match(sansUnzip.why, /unzip absent/);
  rmSync(dossier, { recursive: true, force: true });
});

test('et sec.mjs, LANCÉ POUR DE VRAI, sort la raison qui décrit ce build-là', () => {
  // ⚠️ LES DEUX GARDES CI-DESSUS NE SUFFISENT PAS, et une mutation l'a dit :
  // la décision peut être juste, sa fonction éprouvée, et le site d'appel la
  // débrancher sans que rien ne bouge. Seule une exécution voit le câblage.
  // Le montage reproduit le scénario du run 31 : projet iOS dont `iosScan`
  // désigne un build DEVICE — le cas où l'ancien message mentait.
  const scaffold = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const dossier = mkdtempSync(join(tmpdir(), 'argus-sec-ios-'));
  const yaml = readFileSync(join(scaffold, 'argus.mobile.yaml'), 'utf8');
  assert.match(yaml, /^ {2}# iosScan: /m,
    'le scaffold ne porte plus la ligne `# iosScan:` — si elle a bougé, mets ce montage à jour ; '
    + 'sinon la substitution ci-dessous ne substitue rien et le garde ne mesure plus rien');
  cpSync(join(scaffold, 'scripts'), join(dossier, 'scripts'), { recursive: true });
  writeFileSync(join(dossier, 'argus.mobile.yaml'), yaml
    .replace(/^platforms:\n {2}- android$/m, 'platforms:\n  - ios')
    .replace(/^ {2}androidPackage: ''.*$/m, '  androidPackage: com.exemple.monapp')
    .replace(/^ {2}iosBundleId: ''.*$/m, '  iosBundleId: com.exemple.monapp')
    .replace(/^ {2}# iosScan: .*$/m, '  iosScan: build/ios/iphoneos/Runner.app'));
  mkdirSync(join(dossier, 'build/ios/iphoneos/Runner.app'), { recursive: true });
  writeFileSync(join(dossier, 'build/ios/iphoneos/Runner.app/Runner'), 'x');

  // ⚠️ `2>&1`, ET C'EST LE MONTAGE QUI A ÉCHOUÉ D'ABORD : l'avertissement part
  // sur stderr, qu'`execFileSync` ne rend pas quand la commande sort en 0. Le
  // garde a donc rougi sur une sortie amputée, pas sur un défaut du code.
  let sortie = '';
  try {
    sortie = execFileSync('bash', ['-c', 'node scripts/argus/sec.mjs 2>&1'],
      { cwd: dossier, encoding: 'utf8' });
  } catch (e) {
    // Le script peut sortir non nul sur ses findings : c'est sa sortie qu'on lit,
    // pas son code — sans ce rattrapage le garde tomberait pour la mauvaise raison.
    const err = /** @type {any} */ (e);
    sortie = String(err.stdout ?? '') + String(err.stderr ?? '');
  }
  const ligne = sortie.split('\n').find((l) => l.includes('analyse du binaire non faite'));
  assert.ok(ligne, `sec.mjs ne dit plus pourquoi il n'a pas analysé — sortie : ${sortie.slice(0, 400)}`);
  assert.doesNotMatch(ligne, /simulateur/i,
    'sec.mjs explique encore un build DEVICE par un .app de simulateur (point 217)');
  assert.match(ligne, /build device/, 'la raison servie par sec.mjs ne décrit plus le binaire déclaré');
  rmSync(dossier, { recursive: true, force: true });
});

// ── Le tableau de couverture iOS dit-il ce que les scripts FONT ? ───────────
//
// Le SKILL annonce, plateforme par plateforme, ce qui tourne et ce qui se
// rapporte `skipped`. C'est une promesse : elle est vraie le jour où on l'écrit
// et fausse le lendemain, sans que rien ne le dise. Elle est donc DÉRIVÉE du
// code — le jour où quelqu'un implémente l'accessibilité iOS, la mesure change
// et ce garde rougit, ce qui force la mise à jour du tableau.

test('ce que le SKILL promet par plateforme est ce que les scripts font', () => {
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const debut = skill.indexOf('### Ce que chaque plateforme reçoit VRAIMENT');
  assert.ok(debut > 0, 'le tableau de couverture par plateforme a disparu du SKILL — '
    + 'si la section a été renommée, mets ce garde à jour ; sinon il ne garde plus rien');
  const tableau = skill.slice(debut, debut + 2000);

  /** Un script SAUTE-t-il tout hors Android ? @param {string} f */
  const sauteHorsAndroid = (f) => {
    const s = readFileSync(join(SCRIPTS_DIR, f), 'utf8');
    return /if \(platform !== 'android'\)/.test(s) && /skipped: true/.test(s);
  };

  // ── Non-vacance : le motif doit distinguer, sinon il ne mesure rien. ──────
  assert.equal(sauteHorsAndroid('a11y.mjs'), true, 'a11y.mjs ne saute plus hors Android — le tableau est périmé');
  assert.equal(sauteHorsAndroid('perf.mjs'), true, 'perf.mjs ne saute plus hors Android — le tableau est périmé');
  assert.equal(sauteHorsAndroid('sca.mjs'), false, 'sca.mjs saute désormais hors Android — le tableau le dit couvert des deux côtés');

  // ── Ce que le tableau doit porter, ligne par ligne. ───────────────────────
  assert.match(tableau, /accessibilité \*\*sur appareil\*\* \| ✔ \| ✖/,
    'le tableau ne dit plus que l\'accessibilité device est Android-seule');
  assert.match(tableau, /démarrage et mémoire\*\* \| ✔ \| ✖/,
    'le tableau ne dit plus que démarrage et mémoire sont Android-seuls');
  assert.match(tableau, /sécurité, \*\*binaire\*\* \| ✔[^|]*\| ✖/,
    'le tableau ne dit plus que l\'analyse binaire iOS n\'est pas couverte');
  // ⚠️ L'AUTRE MOITIÉ : un tableau qui dirait ✖ partout serait « exact » et
  // inutile. Ce qui TOURNE sur iOS doit y figurer comme tel.
  assert.match(tableau, /parcours fonctionnels[^|]*\| ✔ \| ✔/, 'les flows tournent sur iOS, le tableau doit le dire');
  assert.match(tableau, /régression visuelle \| ✔ \| ✔/, 'le visuel tourne sur iOS, le tableau doit le dire');
  assert.match(tableau, /dépendances vulnérables \(SCA\) \| ✔ \| ✔/, 'le SCA ne lit pas la plateforme');

  // Et la promesse du `description` ne doit pas rouvrir ce qu'on vient de fermer.
  const entete = skill.slice(0, skill.indexOf('\n---', 4));
  assert.doesNotMatch(entete, /APK\/IPA/,
    'le description promet à nouveau « APK/IPA » sans qualifier — l\'analyse binaire iOS n\'existe pas');
});

// ── Peser un paquet qui est un RÉPERTOIRE ───────────────────────────────────
//
// Point 214. Le Makefile mesurait par `wc -c` et `shasum` : le premier rend 0
// sur un répertoire, le second y échoue. Or un `.app` iOS EST un répertoire, si
// bien que la garde de fraîcheur affichait « 0 → 0 octets » à chaque build iOS.
// Elle ne se taisait pas — elle affirmait, et un chiffre qui n'a rien mesuré se
// lit exactement comme un chiffre qui a mesuré. C'est le mode de panne que ce
// chantier connaît le mieux.

test('un bundle .app se pèse comme un paquet, pas comme un fichier vide', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'argus-mesure-'));
  const app = join(dossier, 'Runner.app');
  mkdirSync(join(app, 'Frameworks'), { recursive: true });
  writeFileSync(join(app, 'Runner'), 'x'.repeat(1000));
  writeFileSync(join(app, 'Info.plist'), 'a');
  writeFileSync(join(app, 'Frameworks', 'Flutter'), 'y'.repeat(500));

  const m = measureBinary(app);
  assert.equal(m.kind, 'dir');
  assert.equal(m.bytes, 1501, 'le poids d\'un bundle est celui de son contenu, pas 0');
  assert.equal(m.files, 3);
  assert.match(m.digest, /^[0-9a-f]{64}$/);

  // ⚠️ LE CAS DÉCISIF, et celui que l'ancienne mesure ne pouvait pas voir : même
  // taille, contenu différent. C'est exactement ce qu'un rebuild produit, et
  // c'est pourquoi la garde parle d'empreinte et non de taille.
  writeFileSync(join(app, 'Info.plist'), 'b');
  const apres = measureBinary(app);
  assert.equal(apres.bytes, m.bytes, 'le montage doit garder la taille constante, sinon il ne mesure pas ce cas');
  assert.notEqual(apres.digest, m.digest, 'deux bundles de même taille et de contenu différent ont la même empreinte');

  // ⚠️ ET LE CHEMIN COMPTE, pas seulement le contenu. Le dartdoc le promet
  // (« chemin compris et triées ») ; sans ce cas, la promesse repartait sans
  // son garde — et un fichier DÉPLACÉ dans le bundle rendait la même empreinte.
  // Mesuré : la mutation qui retire le chemin du résumé restait verte.
  rmSync(join(app, 'Frameworks', 'Flutter'));
  writeFileSync(join(app, 'Flutter'), 'y'.repeat(500));
  const deplace = measureBinary(app);
  assert.equal(deplace.bytes, apres.bytes, 'le montage doit garder la taille constante pour isoler le chemin');
  assert.equal(deplace.files, apres.files, '… et le nombre de fichiers, sinon on mesure autre chose');
  assert.notEqual(deplace.digest, apres.digest,
    'un fichier déplacé dans le bundle rend la même empreinte : le chemin ne compte pas');

  // Un fichier ordinaire n'a pas changé de comportement : c'est l'autre moitié.
  const apk = join(dossier, 'app-debug.apk');
  writeFileSync(apk, 'z'.repeat(4096));
  const f = measureBinary(apk);
  assert.equal(f.kind, 'file');
  assert.equal(f.bytes, 4096);
  assert.equal(f.files, 1);
  assert.match(f.digest, /^[0-9a-f]{64}$/);

  // ⚠️ « absent » se DIT, il ne s'imprime pas en zéro : c'est la différence
  // entre se taire et mentir, et c'est tout le point 214.
  const rien = measureBinary(join(dossier, 'nulle-part.apk'));
  assert.equal(rien.kind, 'absent');
  assert.equal(rien.digest, '', 'un paquet absent ne doit pas porter d\'empreinte — elle se comparerait');
  rmSync(dossier, { recursive: true, force: true });
});

// ── L'autre moitié de `make argus-anchors` ──────────────────────────────────
//
// Point 219. La suite Dart monte les écrans DÉCLARÉS et vérifie que leurs
// ancres arrivent dans l'arbre — déclaré → présent. L'inverse n'existait nulle
// part, et le skill l'écrivait lui-même : « c'est la moitié de son intérêt ».
// Une ancre posée que rien ne déclare n'est pas une ancre en échec, c'est une
// ABSENCE — elle n'apparaît dans aucun relevé, donc rien ne la signale. Même
// classe que le 216, et même remède : un critère total et négatif.

test('une ancre posée dans lib/ que rien ne déclare est signalée', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'argus-ancres-'));
  mkdirSync(join(dossier, 'lib', 'presentation'), { recursive: true });
  mkdirSync(join(dossier, 'test', 'argus'), { recursive: true });
  writeFileSync(join(dossier, 'lib/presentation/page.dart'), [
    "/// dartdoc d'exemple : identifier: 'ancre_du_commentaire'",
    "Semantics(identifier: 'home_root', child: C(",
    "  Semantics(identifier: 'home_start_session', child: B()),",
    "  Semantics(identifier: 'category_sheet_submit', child: B()),",
    "  Semantics(identifier: 'nav_${spec.id}', child: T()),",
    '));',
  ].join('\n'));
  writeFileSync(join(dossier, 'test/argus/harness.dart'), [
    "/// ArgusScreen(anchor: 'ancre_du_dartdoc', commands: <String>['jamais_posee'])",
    "ArgusScreen(id: 'home', anchor: 'home_root',",
    "  commands: <String>['home_start_session'], build: () => const HomePage()),",
  ].join('\n'));

  // ── le relevé des POSÉES : ni le dartdoc, ni le gabarit interpolé ────────
  const poses = posedAnchors(dossier);
  assert.deepEqual(poses, ['category_sheet_submit', 'home_root', 'home_start_session'],
    'le relevé compte le dartdoc, ou le gabarit interpolé, ou en oublie');
  // Non-vacance : sans ces deux pièges dans le montage, le filtre ne mesure rien.
  assert.ok(!poses.includes('ancre_du_commentaire'), 'le filtre /// ne filtre plus');
  assert.ok(!poses.some((a) => a.includes('$')), 'un gabarit interpolé est compté comme une ancre');

  // ── le relevé des DÉCLARÉES, dartdoc exclu lui aussi ─────────────────────
  const dec = declaredAnchors(dossier);
  assert.deepEqual(dec, ['home_root', 'home_start_session'],
    'les déclarées comptent le dartdoc d\'exemple, ou en oublient');

  // ── le cœur : celle que rien ne déclare, et elle SEULE ───────────────────
  assert.deepEqual(undeclaredAnchors(dossier, {}), ['category_sheet_submit']);
  // ⚠️ L'AUTRE MOITIÉ : un contrôle qui refuserait TOUT passerait le test
  // ci-dessus. Les deux ancres correctement déclarées ne doivent rien produire.
  assert.ok(!undeclaredAnchors(dossier, {}).includes('home_root'),
    'une ancre déclarée est signalée comme orpheline — le contrôle refuse tout');

  // ── l'échappatoire, et sa lecture DÉFENSIVE ──────────────────────────────
  assert.deepEqual(
    undeclaredAnchors(dossier, { anchors: { allowUndeclared: ['category_sheet_submit'] } }), []);
  // Une installation existante n'a pas la clé : elle ne doit pas casser.
  assert.deepEqual(undeclaredAnchors(dossier, { anchors: {} }), ['category_sheet_submit']);
  assert.deepEqual(undeclaredAnchors(dossier, undefined), ['category_sheet_submit']);
  rmSync(dossier, { recursive: true, force: true });
});

test('la cible argus-anchors APPELLE ce contrôle, elle ne fait pas que tester', () => {
  const mk = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'), 'utf8');
  const recette = mk.slice(mk.indexOf('\nargus-anchors:'));
  const corps = recette.slice(0, recette.indexOf('\n\n'))
    .split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  assert.ok(corps.includes('argus-anchors:'), 'la cible argus-anchors a disparu');
  // ⚠️ Une décision juste que personne n'appelle est le défaut du 213 et du 217.
  assert.match(corps, /--check-anchors/,
    'argus-anchors ne croise plus posé → déclaré : la moitié manquante l\'est de nouveau');
  assert.match(corps, /test test\/argus\/anchors_test\.dart/,
    'argus-anchors ne lance plus la suite qui prouve déclaré → présent');
});

// ── « le build a échoué » n'est pas « la config est fausse » ────────────────
//
// ⚠️ DÉFAUT INTRODUIT PAR LE CORRECTIF DU POINT 214, et rapporté par le run
// suivant. `eval "$CMD"` ne voyait pas son code de sortie : un build qui LÈVE
// tombait dans la branche « aucun paquet ici » et envoyait vérifier une config
// parfaitement juste. L'ancienne version se taisait (« 0 → 0 octets ») ; la
// mienne parlait, et parlait faux — ce qui est pire, parce qu'on la croit.
//
// Le garde EXÉCUTE la recette sur les deux causes : elles rendent le même
// symptôme (rien à l'emplacement déclaré) et doivent rendre des messages
// différents. Un garde qui lirait la source ne verrait pas laquelle sort.

test('argus-build distingue un build QUI ÉCHOUE d\'un build qui écrit AILLEURS', () => {
  const scaffold = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const dossier = mkdtempSync(join(tmpdir(), 'argus-build-'));
  cpSync(join(scaffold, 'scripts'), join(dossier, 'scripts'), { recursive: true });
  cpSync(join(scaffold, 'Makefile'), join(dossier, 'Makefile'));
  const yaml = readFileSync(join(scaffold, 'argus.mobile.yaml'), 'utf8');
  const config = (/** @type {string} */ cmd) => writeFileSync(join(dossier, 'argus.mobile.yaml'),
    yaml.replace(/^ {2}androidPackage: ''.*$/m, '  androidPackage: com.exemple.monapp')
      .replace(/^ {2}androidBuildCmd: .*$/m, `  androidBuildCmd: ${cmd}`));

  const lancer = () => {
    try {
      return execFileSync('make', ['argus-build'], { cwd: dossier, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const err = /** @type {any} */ (e);
      return String(err.stdout ?? '') + String(err.stderr ?? '');
    }
  };

  // ── cause 1 : le build LÈVE. La config n'y est pour rien. ────────────────
  writeFileSync(join(dossier, 'echoue.sh'), 'echo "Exception: native assets" >&2\nexit 1\n');
  config('bash echoue.sh');
  const echoue = lancer();
  assert.match(echoue, /LE BUILD A ÉCHOUÉ/, 'un build qui lève n\'est plus signalé comme tel');
  assert.doesNotMatch(echoue, /Vérifie que build\.android/,
    'un build qui LÈVE envoie encore vérifier la config — elle est juste, c\'est le build qu\'il faut lire');

  // ── cause 2 : le build RÉUSSIT, mais pas là où la config le dit. ─────────
  writeFileSync(join(dossier, 'ailleurs.sh'), 'mkdir -p build/autre && echo x > build/autre/app.apk\n');
  config('bash ailleurs.sh');
  const ailleurs = lancer();
  assert.match(ailleurs, /Vérifie que build\.android/, 'le cas « écrit ailleurs » ne renvoie plus vers la config');
  assert.doesNotMatch(ailleurs, /LE BUILD A ÉCHOUÉ/, 'un build réussi est annoncé comme ayant échoué');

  // ⚠️ Et le chemin NOMINAL doit rester silencieux : un garde qui ne verrait
  // que les deux échecs se satisferait d'une recette qui crie toujours.
  writeFileSync(join(dossier, 'ok.sh'),
    'mkdir -p build/app/outputs/flutter-apk && head -c 2048 /dev/urandom > build/app/outputs/flutter-apk/app-debug.apk\n');
  config('bash ok.sh');
  const nominal = lancer();
  assert.doesNotMatch(nominal, /✖/, `un build sain ne doit rien signaler — reçu : ${nominal.slice(0, 300)}`);
  assert.match(nominal, /paquet créé|paquet réécrit/, 'un build sain ne dit plus ce qu\'il a produit');
  rmSync(dossier, { recursive: true, force: true });
});

test('le Makefile INTERROGE la mesure au lieu de la refaire à sa façon', () => {
  const mk = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'), 'utf8');
  const recette = mk.slice(mk.indexOf('\nargus-build:'));
  // ⚠️ LES COMMENTAIRES SONT ÔTÉS, et ce garde est né faux sans ce retrait : le
  // commentaire qui explique POURQUOI `wc -c` a été retiré contient `wc -c`, si
  // bien que l'assertion tombait sur ma propre mention du symbole. C'est la
  // façon la plus courante pour un garde de naître vacant — ici elle l'a fait
  // rougir, ce qui est le sens chanceux.
  const corps = recette.slice(0, recette.indexOf('\n\n'))
    .split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  assert.ok(corps.includes('argus-build:'), 'la cible argus-build a disparu du Makefile');

  // Le geste OUTILLÉ doit être le geste MESURÉ : la recette appelle la source,
  // elle n'en tient pas une seconde version.
  assert.match(corps, /--measure-binary/,
    'argus-build ne demande plus la mesure au script — il en refait donc une, '
    + 'et c\'est l\'écart entre les deux qui a produit le point 214');
  // ⚠️ Et surtout : plus aucune mesure locale. Ces deux-là sont muettes sur un
  // répertoire, ce qui est la cause exacte du défaut.
  assert.doesNotMatch(corps, /wc -c/, 'wc -c rend 0 sur un .app — il est revenu dans la recette');
  assert.doesNotMatch(corps, /shasum/, 'shasum échoue sur un .app — il est revenu dans la recette');
  // Le cas « rien produit » doit RESTER distingué : sans lui, un build qui
  // n'écrit rien affiche « 0 octets » et se lit comme une mesure.
  assert.match(corps, /AUCUN PAQUET/, 'la recette ne distingue plus « absent » de « pesé à zéro »');
});

// ── Sur quelle plateforme une commande porte-t-elle quand on ne l'a pas dite ─
//
// Point 213, premier run iOS. Le défaut valait `'android'` EN DUR aux deux
// sites que le Makefile appelle — lequel ne passe jamais `--platform`. Un
// projet `platforms: [ios]` construisait donc un APK, et le runner installait
// ensuite autre chose que ce qui venait d'être bâti.
//
// ⚠️ CE GARDE A DEUX MOITIÉS, et la seconde est celle qui compte. La première
// exerce la décision ; la seconde LANCE le script sur une config dérivée du
// scaffold LIVRÉ, parce qu'une décision juste que personne n'appelle est
// exactement le défaut qu'on vient de corriger. Un garde qui n'aurait que la
// première resterait vert si l'on remettait le littéral aux deux sites.

test('sans `--platform`, la plateforme est celle que le projet DÉCLARE', () => {
  // Le drapeau prime sur tout : c'est lui qu'on tape pour l'autre plateforme.
  assert.equal(platformFor({ platforms: ['ios'] }, ['--platform=android']), 'android');
  assert.equal(platformFor({ platforms: ['android'] }, ['--platform=ios']), 'ios');
  // Sans drapeau, la déclaration décide — le cœur du 213.
  assert.equal(platformFor({ platforms: ['ios'] }), 'ios');
  assert.equal(platformFor({ platforms: ['ios', 'android'] }), 'ios');
  assert.equal(platformFor({ platforms: ['android'] }), 'android');
  // Un projet qui n'a rien déclaré garde le comportement d'avant.
  assert.equal(platformFor({}), 'android');
  assert.equal(platformFor({ platforms: [] }), 'android');
  // `argv` vide par défaut : un appelant non-CLI n'hérite pas du processus.
  assert.equal(platformFor({ platforms: ['ios'] }, []), 'ios');
});

test('le Makefile, qui ne passe JAMAIS `--platform`, reçoit bien les valeurs iOS', () => {
  const scaffold = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const dossier = mkdtempSync(join(tmpdir(), 'argus-plateforme-'));
  // ⚠️ LA CONFIG VIENT DU SCAFFOLD LIVRÉ. Une config écrite à la main pour aller
  // vite a produit un faux constat au run 31 — elle portait la commande sous la
  // clé du chemin. On ne réécrit donc que la ligne qui distingue les deux
  // plateformes, et on garde tout le reste tel qu'il est livré.
  const yaml = readFileSync(join(scaffold, 'argus.mobile.yaml'), 'utf8');
  assert.match(yaml, /^platforms:\n {2}- android$/m,
    'le scaffold ne déclare plus `platforms: [android]` — si le bloc a bougé, mets ce montage '
    + 'à jour ; sinon la bascule ci-dessous ne bascule rien et ce garde ne mesure plus rien');
  cpSync(join(scaffold, 'scripts'), join(dossier, 'scripts'), { recursive: true });
  writeFileSync(join(dossier, 'argus.mobile.yaml'), yaml
    .replace(/^platforms:\n {2}- android$/m, 'platforms:\n  - ios')
    .replace(/^ {2}androidPackage: ''.*$/m, '  androidPackage: com.exemple.monapp')
    .replace(/^ {2}iosBundleId: ''.*$/m, '  iosBundleId: com.exemple.monapp'));

  const lancer = (/** @type {string[]} */ args) =>
    execFileSync('node', ['scripts/argus/config.mjs', ...args], { cwd: dossier, encoding: 'utf8' }).trim();

  // Sans drapeau — exactement ce que fait `make argus-build`.
  assert.equal(lancer(['--print-build-cmd']), 'flutter build ios --debug --simulator',
    'un projet iOS se voit encore prescrire un build Android (point 213)');
  assert.equal(lancer(['--print-binary']), 'build/ios/iphonesimulator/Runner.app',
    'un projet iOS se voit encore désigner un APK (point 213)');

  // ⚠️ L'AUTRE MOITIÉ : dériver le défaut de la déclaration ne doit pas rendre
  // le drapeau inopérant. Sans ces deux lignes, un correctif qui IGNORE
  // `--platform` passerait pour bon.
  assert.equal(lancer(['--print-build-cmd', '--platform=android']), 'flutter build apk --debug');
  assert.equal(lancer(['--print-binary', '--platform=android']),
    'build/app/outputs/flutter-apk/app-debug.apk');
  rmSync(dossier, { recursive: true, force: true });
});

// ── La taille de publication : réclamer la mesure, ne pas juger l'outillage ──
//
// Un correctif peut rendre un relevé honnête sans le rendre juste. Le rapport
// disait déjà « mesuré sur un debug » — exact — puis jugeait quand même 92 Mo
// contre un budget que la release du même code tient à 30,2. Le verdict était
// faux par construction, et la mesure utile n'était jamais prise : rien ne dit
// de construire la release avant, et le déroulé la construit pour la dimension
// sécurité, qui vient après.

const GATE = { failOn: ['blocker', 'critical', 'major'] };

test('la commande de release DÉRIVE de celle du projet — flavor et ABI compris', () => {
  assert.equal(
    releaseBuildCmd({ build: { androidBuildCmd: 'flutter build apk --debug --target-platform android-arm64' } }, false),
    'flutter build apk --release --target-platform android-arm64');
  // Un projet qui construit DÉJÀ en release n'est pas réécrit.
  assert.equal(
    releaseBuildCmd({ build: { androidBuildCmd: 'flutter build appbundle --release --flavor prod' } }, false),
    'flutter build appbundle --release --flavor prod');
  // `--profile` est un binaire de test lui aussi.
  assert.equal(releaseBuildCmd({ build: { androidBuildCmd: 'flutter build apk --profile' } }, false),
    'flutter build apk --release');
  // Le repli ne sert qu'au projet qui n'a rien déclaré.
  assert.equal(releaseBuildCmd({}, false), 'flutter build apk --release');
  // Et le SDK épinglé : sans le préfixe, la consigne est fausse — la contrainte
  // du pubspec rejette le flutter du PATH.
  assert.equal(releaseBuildCmd({ build: { androidBuildCmd: 'flutter build apk --debug' } }, true),
    'fvm flutter build apk --release');
});

test('sur un projet iOS, la release conseillée est une release iOS — sans simulateur', () => {
  // Point 215. La fonction ne lisait que les clés Android, repli littéral
  // compris : un projet iOS s'entendait conseiller `flutter build apk
  // --release`. Suivie, la consigne s'exécute sans erreur, produit un APK, et
  // laisse la mesure iOS toujours absente — la pire forme d'une consigne fausse.
  const livre = {
    platforms: ['ios'],
    build: { iosBuildCmd: 'flutter build ios --debug --simulator', androidBuildCmd: 'flutter build apk --debug' },
  };
  // ⚠️ `--simulator` SAUTE : un .app de simulateur ne se publie pas, donc le
  // garder ferait de cette commande une prescription qui ne peut pas tenir.
  assert.equal(releaseBuildCmd(livre, false), 'flutter build ios --release');
  assert.equal(releaseBuildCmd({ platforms: ['ios'] }, false), 'flutter build ios --release');
  // Ce que le projet a déjà déclaré survit — flavor compris.
  assert.equal(releaseBuildCmd({ platforms: ['ios'], build: { iosBuildCmd: 'flutter build ipa --release --flavor prod' } }, false),
    'flutter build ipa --release --flavor prod');

  // ⚠️ L'AUTRE MOITIÉ. Rendre la fonction sensible à iOS ne doit rien changer à
  // Android : c'est la direction qu'un correctif de plateforme casse en silence.
  assert.equal(releaseBuildCmd(livre, false, 'android'), 'flutter build apk --release');
  assert.equal(releaseBuildCmd({ platforms: ['android'], build: { androidBuildCmd: 'flutter build apk --debug' } }, false),
    'flutter build apk --release');
});

test('l\'indice de build d\'un scan iOS ne renvoie pas vers un APK', () => {
  const root = '/projet';
  const config = {
    platforms: ['ios'],
    build: {
      iosScan: 'build/ios/iphoneos/Runner.app',
      iosBuildCmd: 'flutter build ios --debug --simulator',
      androidScan: 'build/app/outputs/flutter-apk/app-release.apk',
      androidBuildCmd: 'flutter build apk --debug',
    },
  };
  // Le binaire visé EST celui qu'on publie → la commande de release iOS.
  assert.equal(buildHintFor('/projet/build/ios/iphoneos/Runner.app', root, config, false),
    'flutter build ios --release');
  // Un autre binaire → la commande de build ordinaire du projet, côté iOS.
  assert.equal(buildHintFor('/projet/build/ios/iphonesimulator/Runner.app', root, config, false),
    'flutter build ios --debug --simulator');
  // ⚠️ Et la clé de SCAN, jamais `binaryToScan` : celle-ci retomberait sur le
  // binaire de test quand la clé manque, et prescrirait une release pour lui.
  assert.equal(buildHintFor('/projet/build/ios/iphoneos/Runner.app', root,
    { platforms: ['ios'], build: { iosBuildCmd: 'flutter build ios --debug --simulator' } }, false),
  'flutter build ios --debug --simulator');
  // L'autre moitié : Android forcé explicitement reste Android.
  assert.equal(buildHintFor('/projet/build/app/outputs/flutter-apk/app-release.apk', root, config, false, 'android'),
    'flutter build apk --release');
});

test('la taille d\'un binaire de TEST ne devient pas un verdict de publication', () => {
  const config = { thresholds: { binarySizeMb: 60 }, build: { android: 'build/app/outputs/flutter-apk/app-dev-debug.apk' } };
  const f = sizeFinding({ path: config.build.android, isRelease: false }, 92, config, 'android', 'flutter build apk --release');
  assert.equal(f.id, 'QAM-PERF-SIZE-UNMEASURED');
  assert.equal(f.severity, 'info');
  assert.equal(exitCodeFor([f], GATE), 0, 'une mesure qui reste à prendre ne doit pas faire rougir le gate');
  // La mesure du debug reste LISIBLE — elle n'est simplement plus jugée.
  assert.match(f.actual, /92 Mo/);
  // Et le chemin proposé est dérivé du projet : un flavor donne app-dev-release.
  assert.match(f.suggestedFix, /app-dev-release\.apk/);
});

test('… et quand la release est là, elle est jugée normalement', () => {
  const config = { thresholds: { binarySizeMb: 60 }, build: { androidScan: 'build/app/outputs/flutter-apk/app-release.apk' } };
  const pese = { path: config.build.androidScan, isRelease: true };
  const f = sizeFinding(pese, 92, config, 'android', 'x');
  assert.equal(f.id, 'QAM-PERF-SIZE');
  assert.equal(f.severity, 'major');
  assert.equal(exitCodeFor([f], GATE), 1, 'un budget de publication dépassé doit toujours faire rougir');
  // L'autre moitié : sous le budget, aucun finding. Un garde qui ne teste que
  // le refus se satisfait d'une fonction qui refuse tout.
  assert.equal(sizeFinding(pese, 30.2, config, 'android', 'x'), null);
});

test('déclarée-mais-absente et pas-déclarée-du-tout ne demandent pas le même geste', () => {
  const build = { android: 'build/app/outputs/flutter-apk/app-debug.apk' };
  const sans = sizeFinding({ path: build.android, isRelease: false }, 92, { build }, 'android', 'CMD');
  assert.match(sans.suggestedFix, /déclare-la/, 'sans clé, le geste est d\'abord dans la config');
  const avec = sizeFinding({ path: build.android, isRelease: false }, 92,
    { build: { ...build, androidScan: 'build/app/outputs/flutter-apk/app-release.apk' } }, 'android', 'CMD');
  assert.match(avec.suggestedFix, /n'est pas là/, 'avec la clé, le geste est un build');
  assert.ok(!/déclare-la/.test(avec.suggestedFix),
    'une clé déjà bonne ne doit pas être renvoyée à la config : le message enverrait éditer ce qui va bien');
});

test('perf.mjs ne juge plus la taille en direct', () => {
  const perf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs'), 'utf8');
  const appels = [...perf.matchAll(/sizeFinding\(/g)];
  assert.ok(appels.length >= 3,
    `${appels.length} occurrence(s) de sizeFinding — la déclaration et les DEUX appels (iOS, Android) sont attendus`);
  const juges = perf.split('\n').filter((l) => /thresholdFinding\('QAM-PERF-SIZE'/.test(l));
  assert.equal(juges.length, 1,
    `${juges.length} site(s) jugent QAM-PERF-SIZE : le seul admis est celui de sizeFinding, qui a vérifié le variant`);
});

test('sec propose la commande qui produit LE binaire cherché, pas l\'autre', () => {
  const root = '/projet';
  const config = {
    build: {
      android: 'build/app-debug.apk',
      androidScan: 'build/app-release.apk',
      androidBuildCmd: 'flutter build apk --debug',
    },
  };
  assert.equal(buildHintFor('/projet/build/app-release.apk', root, config, false), 'flutter build apk --release',
    'un scan de release absent doit renvoyer à un build de release');
  assert.equal(buildHintFor('/projet/build/app-debug.apk', root, config, false), 'flutter build apk --debug',
    'et le binaire piloté garde la commande du projet — corriger un sens ne doit pas casser l\'autre');
  // Sans clé de publication déclarée, rien ne change pour personne.
  assert.equal(buildHintFor('/projet/build/app-debug.apk', root,
    { build: { android: 'build/app-debug.apk', androidBuildCmd: 'flutter build apk --debug' } }, false),
    'flutter build apk --debug');
});


// ── `goto` : un RETOUR, pas un aller depuis l'accueil ───────────────────────
//
// Le sous-flow décidait « rien à naviguer » sur le SCÉNARIO — l'écran demandé
// est-il celui de départ ? — quand la question est l'ÉTAT : l'app y est-elle
// encore ? Vrai au premier appel, faux à tous les suivants, et l'échec tombait
// trois étapes plus loin sur « Element not found », en accusant une ancre qui
// n'avait rien fait.

const FLOWS = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro');
const GOTO = join(FLOWS, '_subflows/goto.yaml');

/**
 * Le corps exécutable d'un flow : sans la section de configuration, et SANS LES
 * COMMENTAIRES — le gabarit porte un exemple commenté qui contient `when:`,
 * `true:` et `tapOn:`, donc un garde qui lit le fichier brut mesure la doc.
 */
function corpsDeFlow(chemin) {
  const brut = readFileSync(chemin, 'utf8');
  const i = brut.indexOf('\n---\n');
  const apres = i === -1 ? brut : brut.slice(i + 5);
  return apres.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
}

test('goto ne conclut « rien à naviguer » qu\'après avoir REGARDÉ l\'écran', () => {
  const corps = corpsDeFlow(GOTO);
  // ⚠️ À TOUT NIVEAU, pas seulement au premier : les branches d'état sont
  // EMBOÎTÉES dans celle qui décide du contexte, si bien qu'un découpage de
  // premier niveau les mélange — une sous-branche vidée de son `visible:`
  // resterait couverte par le `notVisible:` de sa voisine, et le garde serait
  // vert sur le défaut même qu'il surveille.
  const branches = corps.split(/^\s*- runFlow:/m).slice(1);
  assert.ok(branches.length >= 3,
    `${branches.length} branche(s) dans goto.yaml — si la structure a changé, mets ce motif à jour`);

  // Critère TOTAL et négatif : aucune conclusion « c'est bon » qui n'ait regardé
  // l'écran, à la seule exception avouée — pas d'ancre déclarée, donc rien à
  // regarder. C'est le garde de la classe, pas de la branche qu'on vient d'écrire.
  for (const branche of branches) {
    if (!/assertTrue:/.test(branche)) continue;
    const regarde = /[Vv]isible:/.test(branche);
    const avoue = /ARGUS_ANCHOR_HOME === ''/.test(branche);
    assert.ok(regarde || avoue,
      `une branche de goto conclut sans regarder l'écran : ${branche.trim().slice(0, 140)}`);
  }
});

test('goto porte la branche du RETOUR, et elle échoue là où le défaut est', () => {
  const corps = corpsDeFlow(GOTO);
  assert.match(corps, /notVisible:/,
    'plus de branche « on n\'y est plus » : le retour redevient muet et l\'échec repart trois étapes plus loin');
  const retour = corps.slice(corps.indexOf('notVisible:'));
  assert.match(retour, /assertVisible:/,
    'la branche de retour doit ÉCHOUER ici — sans assertion, elle ne fait rien et ne dit rien');
  assert.match(retour, /ARGUS_ANCHOR_HOME/,
    'et sur l\'ancre de l\'écran de départ, seule chose qui prouve qu\'on y est revenu');
});

test('aucun `when` du scaffold ne mélange une condition d\'état et une de contexte', () => {
  // ⚠️ Décision de structure, pas de style : `true:` et `visible:` dans le MÊME
  // `when` demanderaient de savoir comment Maestro les combine — un ET supposé,
  // que rien ici ne mesure sans device. Déroulé sur les quatre cas, une lecture
  // en OU ferait échouer un `goto` vers un autre écran. L'imbrication donne le
  // ET sans rien supposer, et ce garde empêche quiconque de « simplifier ».
  const fichiers = [...readdirSync(FLOWS), ...readdirSync(join(FLOWS, '_subflows')).map((f) => join('_subflows', f))]
    .filter((f) => f.endsWith('.yaml') && !f.endsWith('config.yaml'));
  assert.ok(fichiers.length >= 10, `${fichiers.length} flows lus — le motif de collecte ne trouve plus rien`);

  let blocs = 0;
  for (const nom of fichiers) {
    const lignes = corpsDeFlow(join(FLOWS, nom)).split('\n');
    for (let i = 0; i < lignes.length; i += 1) {
      const m = /^(\s*)when:\s*$/.exec(lignes[i]);
      if (!m) continue;
      blocs += 1;
      const cles = [];
      for (let j = i + 1; j < lignes.length; j += 1) {
        const ligne = lignes[j];
        if (ligne.trim() === '') continue;
        const indent = ligne.length - ligne.trimStart().length;
        if (indent <= m[1].length) break;
        const cle = /^\s*([A-Za-z]+):/.exec(ligne);
        if (cle && indent === m[1].length + 2) cles.push(cle[1]);
      }
      const etat = cles.some((c) => c === 'visible' || c === 'notVisible');
      assert.ok(!(etat && cles.includes('true')),
        `${nom}:${i + 1} — un même \`when\` porte ${cles.join(' + ')} : emboîte-les plutôt que de supposer comment Maestro les combine`);
    }
  }
  assert.ok(blocs >= 8, `${blocs} bloc(s) \`when\` inspectés — l'instrument ne mesure pas`);
});


// ── Le cadrage demande-t-il ce que la méthodologie exige ? ───────────────────
//
// Même famille que le garde du levier ci-dessus : deux TEXTES du même skill qui
// divergent, sans qu'aucun des deux soit faux seul. La méthodologie réclame un
// budget explicite — « jamais de troncature silencieuse » — et le bloc de
// cadrage du gabarit tranchait MODE, ENV, PLATFORMS, DEVICE et APP, jamais le
// temps. L'agent coupe alors quand même, parce qu'il le doit : mesuré sur un
// projet réel, quinze états montables réduits à sept, arbitrage rendu sans
// budget et signalé comme tel dans le compte rendu.
test('le cadrage du gabarit porte la contrainte que la méthodologie exige', () => {
  // ⚠️ DÉRIVÉ, jamais recopié : le nom de la contrainte est LU dans la
  // méthodologie. L'écrire ici ferait un garde qui suit le gabarit au lieu de le
  // surveiller — changer les deux ensemble le laisserait vert.
  const metho = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/references/methodology-mobile.md'), 'utf8');
  const exige = metho.match(/\*\*([A-Za-zÀ-ÿ]+) explicite\.\*\*/);
  assert.ok(exige, 'la méthodologie ne réclame plus rien « d\'explicite » dans sa stratégie '
    + 'de passage à l\'échelle — si la phrase a été reformulée, mets ce motif à jour, '
    + 'sinon ce garde ne garde plus rien');
  const cle = exige[1].toUpperCase();

  const prompts = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/PROMPTS.md'), 'utf8');
  const debut = prompts.indexOf('CADRAGE —');
  const fin = prompts.indexOf('AUTORISATIONS ET LIMITES', debut);
  assert.ok(debut !== -1 && fin > debut, 'le bloc CADRAGE a disparu du gabarit');
  const cadrage = prompts.slice(debut, fin);

  // L'autre moitié : sans elle, un bloc vidé de tout passerait le test suivant.
  for (const attendue of ['MODE', 'ENV', 'PLATFORMS', 'DEVICE', 'APP']) {
    assert.match(cadrage, new RegExp(`\\b${attendue}\\b`),
      `le bloc CADRAGE ne tranche plus ${attendue} — ce garde compare deux textes, `
      + 'il faut que le premier existe encore');
  }

  assert.match(cadrage, new RegExp(`\\b${cle}\\b`),
    `la méthodologie exige un « ${exige[1]} explicite » et le bloc CADRAGE ne le demande pas. `
    + 'Ce que le gabarit ne fixe pas, l\'agent le fixe en silence — ici, ce qu\'il coupe faute de temps');
});


// ── La couverture compte-t-elle ce qu'elle avouait ignorer ? ────────────────
//
// Les trois comptes de `coverage` dérivent de `screens[]`, donc un état monté à
// l'étage 1 seul leur est invisible. Le rapport l'AVOUAIT — « un état monté à
// l'étage 1 seul n'y apparaît pas » — ce qui est vrai et insuffisant : le
// harnais Dart est dans le même dépôt, le nombre était à portée. Mesuré sur un
// projet réel : 15 états montables, 7 déclarés, 8 invisibles au rapport.

/** Un harnais d'étage 1 tel qu'un projet l'écrit — exemple commenté compris. */
const HARNESS = `
final screens = <ArgusScreen>[
  ArgusScreen(
    id: 'shell',
    builder: (_) => const AppShell(),
  ),
  ArgusScreen(
    id: 'home-empty',
    anchor: 'home_empty_root',
  ),
  // ArgusScreen(
  //   id: 'exemple-commente',
  //   anchor: 'jamais',
  // ),
  ArgusScreen(
    id: 'runner-error',
    builder: (_) => const RunnerError(),
  ),
];
`;

test('la couverture compte les états que l\'étage 1 monte et que screens[] ignore', () => {
  const seuls = stageOneOnly(HARNESS, ['home-empty']);
  assert.deepEqual(seuls, ['shell', 'runner-error'],
    'les états d\'étage 1 non déclarés doivent ressortir, et eux seuls');

  // ⚠️ L'exemple COMMENTÉ ne compte pas : un compteur qui lit sa propre
  // illustration rend un écart qui n'existe pas. Le chantier l'a payé deux fois.
  assert.ok(!seuls.includes('exemple-commente'),
    'un ArgusScreen en commentaire a été compté — retire les commentaires du corpus');

  // L'autre moitié : tout déclaré ⇒ rien à signaler. Sans elle, une fonction qui
  // rend toujours la liste entière passerait le test ci-dessus.
  assert.deepEqual(stageOneOnly(HARNESS, ['shell', 'home-empty', 'runner-error']), []);
  // Et un projet sans harnais d'étage 1 ne fabrique pas d'écart.
  assert.deepEqual(stageOneOnly('', ['home-empty']), []);
});

test('coverage PORTE le relevé, et le rapport l\'affiche', () => {
  // ⚠️ EXERCÉ, pas lu. La première version de ce garde comptait les occurrences
  // de `stageOneOnly(` dans le source : la mutation `stageOneOnly: [] ?? …`
  // laisse le motif intact et vide la valeur, et le harnais l'a rendu VACANT le
  // jour même. Un garde de câblage qui lit du texte ne voit pas une valeur
  // neutralisée — il faut construire l'objet et regarder ce qu'il contient.
  const cov = buildCoverage(
    { screens: [{ id: 'home-empty' }] }, [{ id: 'home-empty' }], ['home-empty'],
    [{ id: 'home-empty' }], 'assert', HARNESS,
  );
  assert.deepEqual(cov.stageOneOnly, ['shell', 'runner-error'],
    'coverage doit porter les états que l\'étage 1 monte seul — sinon le rapport '
    + 'retombe à « tout est couvert » sur les seuls écrans déclarés');
  assert.equal(cov.screensDeclared, 1);
  assert.deepEqual(cov.notVisited, [], 'les autres relevés doivent survivre à l\'extraction');

  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  assert.match(run, /coverage: buildCoverage\(/,
    'main() ne construit plus la couverture par buildCoverage : la fonction peut rester '
    + 'parfaite pendant que le rapport porte autre chose');
  assert.match(run, /harness\.dart/,
    'le relevé ne lit plus le harnais d\'étage 1 : il ne peut donc rien compter');

  // ⚠️ Et l'affichage, sans quoi le chiffre existe et personne ne le lit — le
  // symétrique exact du défaut qu'on vient de fermer.
  const avec = coverageLine({ screensDeclared: 7, screensConfigured: 7, visited: [],
    stageOneOnly: ['shell', 'runner-error'] });
  assert.match(avec, /shell/, 'la ligne de couverture doit NOMMER les états d\'étage 1');
  assert.match(avec, /2 état/, 'et les compter');

  // Sans relevé — projet sans harnais —, l'aveu d'origine reste : il vaut mieux
  // qu'un silence.
  const sans = coverageLine({ screensDeclared: 7, screensConfigured: 7, visited: [] });
  assert.match(sans, /ne veut donc pas dire/,
    'sans relevé, la ligne doit continuer de dire que ses comptes dérivent de screens[]');
});


// ── La marge du plafond de démarrage ────────────────────────────────────────
//
// Un flow qui passe à 39 ms de l'échec rend exactement le même vert qu'un flow
// qui passe avec dix secondes de marge. Le rapport portait la pire attente ET le
// plafond, jamais ce qui les sépare — mesuré : 20 039 ms contre 20 000, sur une
// machine peu chargée, puis 29 255 ms au passage suivant.

test('la marge du plafond de démarrage se dit AVANT que la suite ne flake', () => {
  const serre = startupMargin([{ ms: 8011 }, { ms: 20039 }], 20000);
  assert.equal(serre?.pireMs, 20039);
  assert.equal(serre?.pct, 100);
  assert.equal(serre?.serre, true, '100 % du plafond consommé doit être signalé');

  // L'autre moitié : une marge confortable ne doit RIEN dire, sinon
  // l'avertissement devient du bruit et on apprend à l'ignorer.
  const large = startupMargin([{ ms: 8011 }, { ms: 8771 }], 45000);
  assert.equal(large?.serre, false);
  assert.equal(large?.pct, 19);   // 8771 / 45000 — arrondi vérifié, pas supposé

  // La frontière est exercée des deux côtés : sans ça, un seuil déplacé passe.
  assert.equal(startupMargin([{ ms: 6999 }], 10000)?.serre, false);
  assert.equal(startupMargin([{ ms: 7000 }], 10000)?.serre, true);

  // Et pas de mesure ⇒ pas de verdict fabriqué.
  assert.equal(startupMargin([], 20000), null);
  assert.equal(startupMargin([{ ms: 100 }], 0), null);
});

test('le runner AVERTIT sur une marge serrée, en nommant la bonne grandeur', () => {
  // ⚠️ EXERCÉ, pas lu — leçon apprise la veille sur buildCoverage et refaite le
  // lendemain : un garde de câblage qui lit la source ne voit pas
  // `if (false && …)`. Le harnais a rendu « VACANT » deux jours de suite.
  const lignes = startupMarginWarning([{ ms: 20039 }], 20000).join('\n');
  assert.match(lignes, /20039 ms/, 'le message doit porter la mesure, pas un verdict nu');
  assert.match(lignes, /100 %/);
  // La substance du correctif : nommer la BONNE grandeur.
  assert.match(lignes, /firstLaunchMs/,
    'l\'avertissement doit nommer la grandeur dont il faut dériver le plafond');
  assert.match(lignes, /clearState/, 'et dire POURQUOI chaque flow la paie');
  assert.match(lignes, /Ne touche PAS `coldStartMs`/,
    'et redire quelle clé ne pas relever — c\'est elle qui RAPPORTE la lenteur');

  // L'autre moitié : une marge large ne dit RIEN.
  assert.deepEqual(startupMarginWarning([{ ms: 8771 }], 45000), []);

  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  assert.match(run, /startupMarginWarning\(startup,/,
    'main() n\'appelle plus startupMarginWarning : la fonction peut rester juste '
    + 'pendant que personne ne l\'exerce');
});

// ── Le graphe d'appels entre flows ──────────────────────────────────────────
//
// `maestro check-syntax` valide un fichier à la fois : un sous-flow qui
// s'appelle lui-même passe, `argus-lint` imprime « tous les flows parsent », et
// Maestro rejette ensuite le WORKSPACE ENTIER au démarrage — sans étape fautive
// à nommer, donc en envoyant chercher dans le mauvais fichier.

test('un cycle d\'appels entre flows est détecté, direct comme indirect', () => {
  const direct = flowCycles({ '_subflows/goto.yaml': '- runFlow: goto.yaml' });
  assert.equal(direct.length, 1, 'un sous-flow qui s\'appelle lui-même est un cycle');
  assert.deepEqual(direct[0], ['_subflows/goto.yaml', '_subflows/goto.yaml']);

  const indirect = flowCycles({
    'a.yaml': '- runFlow: _subflows/b.yaml',
    '_subflows/b.yaml': '- runFlow:\n    file: ../a.yaml',
  });
  assert.equal(indirect.length, 1, 'a → b → a est un cycle, et les chemins relatifs se résolvent');

  // L'autre moitié, et c'est celle qui compte : un workspace SAIN ne doit rien
  // signaler, sinon le contrôle devient du bruit qu'on désactive.
  assert.deepEqual(flowCycles({
    'visual.yaml': '- runFlow: _subflows/goto.yaml',
    '_subflows/goto.yaml': '- runFlow: to-shell.yaml',
    '_subflows/to-shell.yaml': '- back',
  }), []);

  // ⚠️ Et les commentaires ne fabriquent pas d'arêtes : le gabarit livré porte
  // un exemple commenté qui cite `runFlow`.
  assert.deepEqual(flowCycles({ 'a.yaml': '# - runFlow: a.yaml\n- launchApp' }), []);
});

test('le scaffold livré ne porte aucun cycle, et argus-lint le VÉRIFIE', () => {
  const dir = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro');
  /** @type {Record<string,string>} */
  const flows = {};
  const lire = (/** @type {string} */ d, /** @type {string} */ prefixe) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) lire(join(d, e.name), `${prefixe}${e.name}/`);
      else if (/\.ya?ml$/.test(e.name) && e.name !== 'config.yaml') {
        flows[`${prefixe}${e.name}`] = readFileSync(join(d, e.name), 'utf8');
      }
    }
  };
  lire(dir, '');
  assert.ok(Object.keys(flows).length >= 10,
    `${Object.keys(flows).length} flows lus — l'instrument ne mesure pas`);
  assert.deepEqual(flowCycles(flows), [], 'le scaffold livré ne doit porter aucun cycle');

  // Le câblage : sans lui, la détection existe et personne ne l'appelle — c'est
  // exactement le défaut qu'on vient de fermer, un cran plus haut.
  const makefile = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'), 'utf8');
  const lint = makefile.slice(makefile.indexOf('argus-lint:'), makefile.indexOf('argus-guards:'));
  assert.match(lint, /--check-flows/,
    'argus-lint ne contrôle plus le graphe : il redirait « tous les flows parsent » '
    + 'sur un workspace que Maestro refuse de démarrer');
});


// ── Une preuve visuelle sur les findings d'accessibilité ────────────────────
//
// `artifact.evidence` promet « les captures des findings », et le seul
// producteur de chemins d'images était le finding d'étape Maestro EN ÉCHEC. Un
// run vert — celui qu'on publie — ne pouvait donc porter aucune image, pendant
// que 18 PNG dormaient sur le disque et que les findings qui gagnent le plus à
// être vus n'en attachaient aucun.
test('les findings d\'accessibilité portent la capture de l\'écran mesuré', () => {
  const mesure = {
    tooSmall: [{ element: 'app_settings', widthDp: 40, heightDp: 40, bounds: '[0,0][40,40]' }],
    unlabeled: [{ element: 'form_name', bounds: '[0,0][10,10]', class: 'EditText' }],
  };
  const avec = buildFindings(mesure, 48, 'argus-mobile-report/a11y-settings.png');
  assert.equal(avec.length, 2);
  for (const f of avec) {
    assert.deepEqual(f.evidence, ['argus-mobile-report/a11y-settings.png'],
      `${f.id} doit porter la capture : sans elle, la page publiée d'un run vert ne montre rien`);
  }

  // L'autre moitié : pas de capture ⇒ pas de champ fabriqué. Un chemin inventé
  // compterait comme « preuve manquante » à l'embarquement, ce qui se lit
  // « il n'y avait pas de preuve » — l'inverse de ce qui s'est passé.
  for (const f of buildFindings(mesure, 48)) {
    assert.deepEqual(f.evidence, [], `${f.id} ne doit pas inventer de preuve`);
  }
  assert.deepEqual(buildFindings({ tooSmall: [], unlabeled: [] }, 48, 'x.png'), [],
    'aucun défaut ⇒ aucun finding, capture ou pas');
});


// ── « Partiel » ne doit se dire que d'un run VRAIMENT retranché ─────────────
//
// Le scaffold livre `excludeTags: [wip, manual]` — des flows qui ne doivent
// jamais tourner, pas un rétrécissement. En les comptant comme un filtre, tout
// run normal s'annonçait « filtré (-wip -manual) » et le rapport affichait son
// bandeau « partiel ». Depuis que la page est publiée, d'autres le lisent.
test('le périmètre par défaut du scaffold n\'est PAS un run filtré', () => {
  const normal = runScope([], [], ['wip', 'manual']);
  assert.equal(normal.scope, 'complet',
    'un run sans filtre en ligne de commande est complet, même si le workspace exclut des tags');
  assert.equal(normal.baseline, '-wip -manual',
    'et ce que le workspace exclut reste DIT : le taire ferait croire qu\'un run complet exécute tout');

  // L'autre moitié, et c'est celle que le point 141 protège : un run retranché à
  // la main doit toujours se dénoncer, sinon la contre-épreuve visuelle repasse
  // pour une passe complète.
  assert.match(runScope(['visual'], [], ['wip', 'manual']).scope, /^filtré \(\+visual\)/);
  assert.match(runScope([], ['lifecycle'], []).scope, /^filtré \(-lifecycle\)/);
  assert.equal(runScope([], [], []).scope, 'complet');
});


// ═══════════════════════════════════════════════════════════════════════════
// Points 198 et 199 — le variant vient de la MESURE, et il le dit partout
//
// Le 193 avait fait dire aux findings de `perf.mjs` sur quel binaire ils
// mesuraient. Deux choses lui manquaient, et un run les a trouvées ensemble :
// la valeur qu'il transportait était dérivée de la commande de build (199), et
// le finding de démarrage produit par `run.mjs` ne la recevait pas du tout
// (198). Ces gardes APPELLENT les deux constructions.
// ═══════════════════════════════════════════════════════════════════════════

test('installedVariant LIT le paquet posé, et ne suppose rien quand il ne lit pas', () => {
  // `dumpsys package` rend plusieurs lignes `flags=` : une en hexadécimal, qui
  // ne nomme rien, et une entre crochets, qui porte les drapeaux.
  const debuggable = () => ({ stdout: '  flags=0x0\n  flags=[ DEBUGGABLE HAS_CODE ALLOW_BACKUP ]\n' });
  const publiee = () => ({ stdout: '  flags=0x0\n  flags=[ HAS_CODE ALLOW_BACKUP KILL_AFTER_RESTORE ]\n' });
  const absent = () => ({ stdout: 'Unable to find package: com.exemple.app\n' });

  assert.equal(installedVariant('emulator-5554', 'com.exemple.app', debuggable), 'debug');
  assert.equal(installedVariant('emulator-5554', 'com.exemple.app', publiee), 'release');
  // ⚠️ La moitié qui compte : un paquet absent ne doit PAS se lire « release ».
  // Ce serait le défaut d'origine reconstruit en silence, et dans le sens le
  // plus flatteur — un rapport qui se dit propre sans avoir rien mesuré.
  assert.equal(installedVariant('emulator-5554', 'com.exemple.app', absent), '',
    'une lecture qui échoue rend la chaîne vide, jamais une supposition');
  assert.equal(installedVariant('emulator-5554', '', debuggable), '',
    'sans nom de paquet il n\'y a rien à lire');
  // `pkgFlags=[ … ]` porte les mêmes drapeaux sous un autre nom selon l'API.
  assert.equal(installedVariant('x', 'com.exemple.app',
    () => ({ stdout: '  pkgFlags=[ DEBUGGABLE HAS_CODE ]\n' })), 'debug');
});

test('le variant n\'est plus dérivé de la commande de build', () => {
  // ⚠️ Ce garde lit la SOURCE, ce qui ne voit pas une valeur neutralisée. Il ne
  // tient que parce que la construction est extraite et exercée juste au-dessus :
  // ici on vérifie le CÂBLAGE, là on vérifie ce que la fonction rend.
  for (const f of ['perf.mjs', 'run.mjs']) {
    const src = readFileSync(join(RACINE,
      'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus', f), 'utf8');
    assert.ok(src.length > 1000, `${f} : source non lue — ce garde ne mesurerait rien`);
    assert.match(src, /installedVariant\(/,
      `${f} : le variant doit être LU sur l'appareil, pas déduit d'une configuration`);
    assert.ok(!/-debug\\\.\(apk\|aab\)\$\/i\.test\(String\(config\.build/.test(src),
      `${f} : la commande de build dit ce qu'on aurait construit, jamais ce qui a été mesuré`);
  }
});

test('QAM-START dit sur quel binaire il a mesuré, dans les deux sens', () => {
  const samples = [{ flow: 'smoke', ms: 9512, status: 'COMPLETED' }];
  const device = { id: 'android-emu', udid: 'emulator-5554', os: 'android-36' };
  const config = { thresholds: { coldStartMs: 2000, brandedSplashMs: 2000 } };

  const [dbg] = startupFindings(samples, device, 'android', config, 'debug');
  assert.ok(dbg, 'un dépassement doit produire le finding');
  assert.match(dbg.title, /debug/, 'le titre doit nommer le binaire mesuré');
  assert.match(dbg.actual, /\(debug\)/, 'et le relevé aussi');
  assert.match(dbg.suggestedFix, /JIT/,
    'la réserve du démarrage explique POURQUOI un debug ment — elle n\'emprunte pas celle de la taille');
  assert.ok(!/facteur trois/.test(dbg.suggestedFix),
    'ce chiffre-là a été mesuré sur des tailles de binaire, pas sur un temps');

  // ⚠️ L'autre moitié : sur une release, il ne reste rien à nuancer. Un remède
  // qui mentionnerait « debug » partout serait aussi faux que le silence.
  const [rel] = startupFindings(samples, device, 'android', config, 'release');
  assert.ok(!/debug/i.test(rel.title + rel.suggestedFix), 'rien à nuancer sur une release');
  assert.match(rel.actual, /\(release\)/, 'mais on dit quand même ce qui a été mesuré');

  // Et quand la lecture n'a pas abouti, on ne raconte rien.
  const [inc] = startupFindings(samples, device, 'android', config, '');
  assert.ok(!/debug|release/i.test(inc.title + (inc.suggestedFix ?? '')),
    'sans mesure du variant, le finding se tait plutôt que de supposer');
});

test('un contexte de mesure ne fabrique jamais de finding', () => {
  const sous = [{ flow: 'smoke', ms: 2500, status: 'COMPLETED' }];
  const config = { thresholds: { coldStartMs: 2000, brandedSplashMs: 2000 } };
  assert.equal(
    startupFindings(sous, { id: 'x', udid: 'y', os: 'z' }, 'android', config, 'debug').length, 0,
    '2500 ms moins 2000 de splash assumé passe sous le budget : rien à signaler');
});


// ═══════════════════════════════════════════════════════════════════════════
// Point 200 — la page publiée doit rester PARCOURABLE
//
// Trouvé en regardant la page, comme le 187 — et créé PAR le correctif du 187 :
// tant qu'une capture ne pouvait exister que sur échec, la page n'en portait
// jamais, donc rien ne pouvait être trop haut. Ces gardes appellent le rendu.
// ═══════════════════════════════════════════════════════════════════════════

/** Un finding porteur de N preuves, dont M sont embarquées. */
const findingAvec = (evidence) => ({
  severity: 'major', id: 'QAM-DEMO', title: 'un titre', dimension: 'a11y',
  expected: 'e', actual: 'a', evidence,
});

test('la hauteur des vignettes est bornée, pas seulement leur largeur', () => {
  const regle = STYLE.match(/\.shot\{([^}]*)\}/);
  assert.ok(regle, '.shot a disparu du style — si la classe a été renommée, mets ce garde à jour');
  // ⚠️ `max-width:100%` seul ne borne RIEN sur une capture de téléphone : à
  // 1080×2400 elle est rendue sur ~2 600 px de haut, et un finding de quatre
  // lignes se retrouve suivi de trois écrans de défilement.
  assert.match(regle[1], /(^|;)\s*height:/,
    'une preuve doit avoir une hauteur, sinon la page cesse d\'être parcourable');
  assert.match(regle[1], /object-fit:\s*contain/,
    'et garder son ratio : une capture déformée ne prouve plus ce qu\'elle montre');
});

test('N preuves tiennent dans UNE rangée, une comme trois', () => {
  const shots = new Map([
    ['ref.png', 'data:image/png;base64,AAA'],
    ['actuel.png', 'data:image/png;base64,BBB'],
    ['diff.png', 'data:image/png;base64,CCC'],
  ]);
  // ⚠️ Le cas de trois est le cas NOMINAL du mode REGRESS — un échec visuel
  // porte référence, capture et diff. Aucun des 320 findings des 26 runs
  // archivés n'en portait plus d'un, parce qu'aucune régression visuelle
  // n'avait encore été attrapée : l'absence d'observation n'est pas l'absence
  // de besoin, et c'est exactement ce cas-là qui empilerait ~8 000 px.
  const trois = findingCards([findingAvec(['ref.png', 'actuel.png', 'diff.png'])], shots);
  assert.equal((trois.match(/class="shot"/g) ?? []).length, 3, 'les trois preuves sont rendues');
  assert.equal((trois.match(/class="shots"/g) ?? []).length, 1, 'dans une seule rangée');

  const une = findingCards([findingAvec(['ref.png'])], shots);
  assert.equal((une.match(/class="shot"/g) ?? []).length, 1);
  assert.equal((une.match(/class="shots"/g) ?? []).length, 1, 'le cas à une preuve passe par la même rangée');
});

test('sans capture embarquée, ni rangée ni gouttière vide', () => {
  // C'est `evidence: none`, et le rapport local : les chemins restent, les
  // images non. Une rangée vide laisserait un blanc sous chaque finding.
  const html = findingCards([findingAvec(['ref.png'])], new Map());
  assert.match(html, /preuve : ref\.png/, 'le chemin de la preuve reste lisible');
  assert.ok(!/class="shots"/.test(html), 'mais aucune rangée n\'est ouverte');
  assert.ok(!/class="shot"/.test(html), 'et aucune vignette');
});

test('la visionneuse a TROIS sorties, et le garde les nomme', () => {
  // ⚠️ Un overlay plein cadre recouvre tout ce qui est sous lui, barre de
  // retour comprise. C'est le défaut qu'on ferme ailleurs dans ce rapport ;
  // l'ajouter ici en n'offrant qu'une sortie serait le rejouer.
  assert.ok(LIGHTBOX.length > 200, 'la visionneuse est vide — ce garde ne mesurerait rien');
  assert.match(LIGHTBOX, /class="lb-x"/, 'sortie 1 : la croix');
  assert.match(LIGHTBOX, /t === lb/, 'sortie 2 : le clic hors de l\'image');
  assert.match(LIGHTBOX, /'Escape'/, 'sortie 3 : la touche Échap');
  assert.match(LIGHTBOX, /aria-modal="true"/, 'et elle se déclare comme modale');
});


// ═══════════════════════════════════════════════════════════════════════════
// Point 201 — aucune interpolation DÉSARMÉE dans le Dart livré
//
// `"…\$thrown"` imprime le littéral : dans une chaîne Dart à guillemets doubles,
// `\$` échappe le dollar. Le fragment fautif était en guillemets doubles parce
// qu'il porte des apostrophes françaises — le délimiteur était imposé par la
// ponctuation, pas choisi, et c'est ce qui a désarmé l'interpolation sans que
// personne le voie. Ses deux voisins, en guillemets simples, interpolent bien.
//
// Garde TOTAL et NÉGATIF : zéro occurrence dans tout le scaffold, jamais une
// liste des formes déjà vues. Et il compte d'abord ce qu'il a lu — sans ce
// compte, un dossier renommé le rendrait vert en ne lisant plus rien.
// ═══════════════════════════════════════════════════════════════════════════

test('aucun `$` échappé devant un identifiant dans le Dart du scaffold', () => {
  const racine = join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  /** @param {string} dir @returns {string[]} */
  const dartFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? dartFiles(p) : (e.name.endsWith('.dart') ? [p] : []);
  });
  const fichiers = dartFiles(racine);
  assert.ok(fichiers.length >= 5,
    `seulement ${fichiers.length} fichier(s) Dart lu(s) — le scaffold a bougé, mets ce garde à jour`);

  const fautifs = [];
  for (const f of fichiers) {
    const src = readFileSync(f, 'utf8');
    // `\$` suivi de ce qui ressemble à un nom : `\$ ` ou `\$1` resteraient
    // légitimes (un vrai symbole dollar), et ne sont donc pas comptés.
    for (const [i, ligne] of src.split('\n').entries()) {
      if (/\\\$[a-zA-Z_{]/.test(ligne)) fautifs.push(`${basename(f)}:${i + 1}`);
    }
  }
  assert.deepEqual(fautifs, [],
    'interpolation désarmée : le message imprimera le nom de la variable au lieu de sa valeur');
});

test('le message de débordement n\'annonce pas ce que `Actual:` dit déjà', () => {
  // ⚠️ La moitié qu'on oublie : le remède était de RETIRER le jeton, pas de le
  // réparer. `expect(thrown, isNull)` affiche l'exception entière dans
  // `Actual:` — mesuré sur un vrai échec :
  //   Actual: FlutterError:<A RenderFlex overflowed by 55 pixels on the right.>
  // L'interpoler pour de bon la doublerait. Ce garde échouerait donc AUSSI sur
  // un correctif qui « marche ».
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/layout_test.dart'), 'utf8');
  const bloc = src.match(/reason:\s*\n([\s\S]{0,400}?)\);/);
  assert.ok(bloc, 'le `reason:` du test de débordement a disparu — mets ce garde à jour');
  assert.match(bloc[1], /error-causing widget/,
    'le message doit continuer de dire où chercher le vrai coupable');
  assert.ok(!/thrown/.test(bloc[1]),
    'l\'exception est déjà rendue par `Actual:` — la citer une seconde fois est du bruit');
});


// ═══════════════════════════════════════════════════════════════════════════
// Point 202 — un flow où le PROJET écrit ne peut pas appartenir au CADRE
//
// `argus.mobile.yaml` dit que la forme de l'authentification « s'écrit, dans
// _subflows/login.yaml ». Ce fichier n'avait aucun marqueur : `--update` faisait
// donc `cp src dest` par-dessus le parcours métier. Et l'utilisateur ne pouvait
// pas se protéger — l'installeur classe d'après la SOURCE, jamais d'après la
// copie locale.
//
// Le garde porte sur la CONSÉQUENCE, pas sur la prose : un flow qui invite à
// écrire (`TODO(argus)`) doit être `ARGUS:OWNED`.
//
// ⚠️ Il est borné à `.maestro/`, et c'est mesuré : hors de là, `ARGUS-MOBILE.md`
// cite `TODO(argus)` dans une phrase qui EXPLIQUE le mécanisme. Un fichier doit
// pouvoir parler d'un marqueur sans être classé par ce qu'il en dit.
// ═══════════════════════════════════════════════════════════════════════════

test('tout flow qui invite le projet à écrire est ARGUS:OWNED', () => {
  const racine = join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro');
  /** @param {string} dir @returns {string[]} */
  const flows = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? flows(p) : (e.name.endsWith('.yaml') ? [p] : []);
  });
  const tous = flows(racine);
  assert.ok(tous.length >= 10,
    `seulement ${tous.length} flow(s) lu(s) — le scaffold a bougé, mets ce garde à jour`);

  const invitants = tous.filter((f) => readFileSync(f, 'utf8').includes('TODO(argus)'));
  assert.ok(invitants.length > 0,
    'aucun flow ne porte de TODO(argus) — le garde ne mesurerait rien');

  const nonProteges = invitants
    .filter((f) => !readFileSync(f, 'utf8').split('\n').slice(0, 20).join('\n').includes('ARGUS:OWNED'))
    .map((f) => basename(f));
  assert.deepEqual(nonProteges, [],
    'un flow où le projet écrit son parcours sera écrasé par `install-mobile.sh --update`');
});

test('login.yaml porte le marqueur, et la config continue d\'y envoyer', () => {
  // Les deux moitiés : le fichier est protégé, ET la phrase qui y envoie existe
  // toujours. Retirer l'une sans l'autre laisse le défaut sous une autre forme.
  const base = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const flow = readFileSync(join(base, '.maestro/_subflows/login.yaml'), 'utf8');
  assert.match(flow.split('\n').slice(0, 20).join('\n'), /ARGUS:OWNED/,
    'le seul fichier dont le contenu est par construction celui de l\'hôte');
  assert.match(flow, /TODO\(argus\)/,
    'et il dit quoi y faire — sinon `check-scaffold.sh` le refuse, à raison');
  const cfg = readFileSync(join(base, 'argus.mobile.yaml'), 'utf8');
  assert.match(cfg, /login\.yaml/,
    'la config doit continuer de nommer le fichier où la forme réelle s\'écrit');
});


// ═══════════════════════════════════════════════════════════════════════════
// Point 203 — après la connexion, ce n'est plus l'écran de départ
// ═══════════════════════════════════════════════════════════════════════════

test('anchorAfterAuth vise la session ouverte, et retombe sur le départ sans auth', () => {
  // Le cas qui motive : l'écran `start: true` est celui de CONNEXION.
  assert.equal(anchorAfterAuth({ success: 'home_root' }, { anchor: 'login_root' }), 'home_root');
  // ⚠️ L'autre moitié : sans authentification configurée, l'écran de départ EST
  // le bon. Un remède qui viserait toujours `success` casserait toute app locale.
  assert.equal(anchorAfterAuth({ success: '' }, { anchor: 'home_root' }), 'home_root');
  assert.equal(anchorAfterAuth({}, { anchor: 'home_root' }), 'home_root');
  assert.equal(anchorAfterAuth({}, null), '', 'rien de configuré : on ne fabrique pas d\'ancre');
});

test('aucun flow n\'asserte l\'écran de départ APRÈS s\'être connecté', () => {
  const dir = join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro');
  /** @param {string} d @returns {string[]} */
  const flows = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = join(d, e.name);
    return e.isDirectory() ? flows(p) : (e.name.endsWith('.yaml') ? [p] : []);
  });
  const tous = flows(dir);
  assert.ok(tous.length >= 10, `${tous.length} flow(s) lu(s) — le scaffold a bougé`);

  const fautifs = tous.filter((f) => {
    const src = readFileSync(f, 'utf8');
    return src.includes('login.yaml') && src.includes('ARGUS_ANCHOR_HOME');
  }).map((f) => basename(f));
  assert.deepEqual(fautifs, [],
    'ce flow se connecte puis asserte l\'écran qu\'il vient de quitter — l\'échec accusera l\'instrumentation');

  // ⚠️ Et le garde doit voir que quelqu'un se connecte : sans ça il resterait
  // vert le jour où plus aucun flow n'appelle login, en ne mesurant rien.
  const connectants = tous.filter((f) => readFileSync(f, 'utf8').includes('login.yaml'));
  assert.ok(connectants.length >= 2,
    'aucun flow n\'appelle login.yaml — ce garde ne mesure plus rien');
});

test('launch-clean attend toujours l\'écran de départ, lui', () => {
  // La moitié qu'un balayage trop large aurait emportée : AVANT la connexion,
  // l'écran de départ est exactement ce qu'il faut attendre.
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/_subflows/launch-clean.yaml'), 'utf8');
  assert.match(src, /ARGUS_ANCHOR_HOME/,
    'le lancement à état vide vise bien l\'écran de départ, et doit continuer');
  assert.ok(!src.includes('login.yaml'),
    'et il ne se connecte pas — c\'est ce qui rend son attente correcte');
});


// ═══════════════════════════════════════════════════════════════════════════
// Points 205 et 206 — les mises en garde citent des clés qui doivent EXISTER
//
// Ce chantier a déjà payé une consigne qui rangeait une valeur « près de sa
// clé » — une clé qui n'existait pas. Une mise en garde qui nomme un levier
// inexistant envoie chercher ce qu'on ne trouvera pas.
// ═══════════════════════════════════════════════════════════════════════════

test('les leviers proposés face aux données servies existent vraiment', () => {
  const base = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const ignore = readFileSync(join(base, '.gitignore'), 'utf8');
  const cfg = readFileSync(join(base, 'argus.mobile.yaml'), 'utf8');

  // ⚠️ Ce garde a fait tomber sa propre mise en garde, écrite deux minutes plus
  // tôt : elle proposait `dynamicRegions`, une clé RETIRÉE du scaffold parce que
  // rien ne la lisait. Un remède se relit contre le code du JOUR.
  assert.match(ignore, /visualCropOn/, 'le cadrage reste un levier cité');
  assert.match(cfg, /^\s*visualCropOn:/m,
    '`visualCropOn` est proposé comme remède : il doit exister dans la configuration');
  assert.match(ignore, /mask-dynamic\.yaml/, 'et le masquage passe par le sous-flow, pas par une clé');
  assert.ok(existsSync(join(base, '.maestro/_subflows/mask-dynamic.yaml')),
    'le sous-flow de masquage est cité comme remède : il doit être livré');
  assert.ok(!/dynamicRegions/.test(ignore),
    'clé retirée du scaffold — la citer renvoie chercher ce qui n\'existe pas');
});

test('tous les flows ne se connectent pas — le levier du coût existe', () => {
  // La mise en garde dit « tous les flows n'ont pas besoin d'être
  // authentifiés ». C'est une affirmation sur le scaffold : elle se vérifie.
  const dir = join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro');
  const flows = readdirSync(dir).filter((f) => f.endsWith('.yaml'));
  assert.ok(flows.length >= 5, `${flows.length} flow(s) — le scaffold a bougé`);
  const sansAuth = flows.filter((f) => !readFileSync(join(dir, f), 'utf8').includes('login.yaml'));
  assert.ok(sansAuth.length > 0,
    'tous les flows appellent login.yaml : la phrase qui dit le contraire est devenue fausse');
});


// ═══════════════════════════════════════════════════════════════════════════
// Point 208 — le gabarit doit cadrer une application qui consomme une API
//
// Il n'en disait RIEN : zéro mention d'API, de flavor ou d'injection de build,
// pour un bloc de cadrage à sept lignes. Un agent non interactif tranchait donc
// seul l'adresse du backend, le flavor dont dépend l'identifiant d'application,
// et jusqu'au droit d'administrer le serveur.
// ═══════════════════════════════════════════════════════════════════════════

test('le gabarit cadre une app qui consomme une API', () => {
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/PROMPTS.md'), 'utf8');
  const bloc = src.match(/^CADRAGE[\s\S]*?Tout le reste/m);
  assert.ok(bloc, 'le bloc CADRAGE a disparu du gabarit — mets ce garde à jour');

  assert.match(bloc[0], /^\s*FLAVOR\s*:/m,
    'sans flavor, « déduis l\'identifiant du repo » n\'a plus de réponse unique');
  assert.match(bloc[0], /pointe/,
    'ENV doit dire d\'où se dérive son choix : vers quoi l\'app pointe');

  for (const [quoi, motif] of [
    ['l\'adresse vue DU DEVICE', /10\.0\.2\.2/],
    ['les injections de build obligatoires', /injections de build/],
    ['la limite sur le backend', /administres pas/],
    ['le coût de l\'authentification', /clearState.{0,80}reconnexion/s],
    ['la doc DU projet', /documentation DU PROJET/],
  ]) {
    assert.match(src, motif, `le gabarit doit dire : ${quoi}`);
  }

  // ⚠️ La moitié qu'on oublie : ces lignes ne servent QUE si le projet a une
  // API. Elles sont donc conditionnelles, pas ajoutées au cadrage de tous.
  assert.match(src, /SI L'APPLICATION CONSOMME UNE API/,
    'le bloc doit rester conditionnel — une app locale n\'a rien à y répondre');
});


// ═══════════════════════════════════════════════════════════════════════════
// Point 207 — le bon remède suppose qu'on peut éditer le composant
//
// Tous les exemples du skill vivent dans le même dépôt (`lib/…/shared/`). Un
// projet mature tire son design system d'un paquet VOISIN, parfois partagé avec
// une application en production : la recette s'y applique mot pour mot et
// devient un arbitrage. Six ancres inertes ont été inscrites en dette faute de
// pouvoir poser un paramètre une couche plus bas.
// ═══════════════════════════════════════════════════════════════════════════

test('le skill dit quoi faire quand le composant vit dans un autre dépôt', () => {
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  // Le cas est nommé…
  assert.match(src, /AUTRE DÉPÔT/,
    'le cas du paquet voisin doit être nommé, pas laissé à l\'analogie');
  // …et il prescrit les deux gestes, pas seulement le constat.
  assert.match(src, /Ne tranche pas seul/,
    'modifier l\'API publique d\'un paquet tiers n\'est pas une décision de QA');
  assert.match(src, /known_issues\.dart/,
    'et le coût s\'inscrit en dette plutôt que de rester tu');
  // ⚠️ La moitié qui compte : il doit dire que l'ancre POSÉE reste utile, sinon
  // le lecteur la retire et perd le `tapOn` en plus de la preuve.
  assert.match(src, /inerte/,
    'l\'ancre reste trouvable par Maestro — c\'est ce qu\'elle PROUVE qui disparaît');
});


// ═══════════════════════════════════════════════════════════════════════════
// Points 209 à 212 — ce que le second terrain a rendu en vérification
// ═══════════════════════════════════════════════════════════════════════════

test('le motif de keystore discrimine une LECTURE d\'un SECRET', () => {
  // ⚠️ Ce garde EXERCE le motif tel que le scan le compilera — il ne le lit pas.
  // La version livrée jusqu'ici rendait `blocker` sur
  // `storePassword = props.getProperty("storePassword")`, une ligne qui lit une
  // valeur hors dépôt, et prescrivait de « révoquer la clé ».
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml'), 'utf8');
  const motifs = [...src.matchAll(/^\s*- '(\(\?m\)[^']*(?:''[^']*)*)'/gm)].map((m) => m[1].replace(/''/g, "'"));
  const keystore = motifs.filter((m) => /assword/.test(m));
  assert.equal(keystore.length, 2,
    `${keystore.length} motif(s) de mot de passe trouvé(s), 2 attendus — mets ce garde à jour`);

  for (const source of keystore) {
    const inline = /^\(\?([imsux]+)\)/.exec(source);
    const re = new RegExp(inline ? source.slice(inline[0].length) : source,
      inline ? inline[1].replace(/[^ims]/g, '') : '');
    const quoi = /tore\[pP\]assword/.test(source) ? 'storePassword' : 'keyPassword';
    // ce qui doit être IGNORÉ
    for (const sain of [
      `${quoi} = keystoreProperties.getProperty("${quoi}")`,
      `${quoi} = System.getenv("SECRET")`,
      `// ${quoi} = "…" en dur matche toujours`,
    ]) {
      assert.ok(!re.test(sain), `faux positif sur une ligne saine : ${sain}`);
    }
    // ce qui doit être ATTRAPÉ — les deux moitiés, dont la forme Groovy sans `=`
    for (const secret of [`        ${quoi} = "secret123"`, `        ${quoi} 'secret123'`]) {
      assert.ok(re.test(secret), `secret manqué : ${secret}`);
    }
  }
});

test('la localisation n\'est plus interdite par défaut, les trois autres le restent', () => {
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml'), 'utf8');
  const bloc = src.match(/forbiddenPermissions:\n((?:\s+-\s+\S+\n)+)/);
  assert.ok(bloc, 'forbiddenPermissions a disparu — mets ce garde à jour');
  const perms = bloc[1].split('\n').map((l) => l.trim().replace(/^-\s*/, '')).filter(Boolean);
  // ⚠️ Les deux moitiés. Retirer la localisation ne doit pas vider la liste :
  // les trois autres sont d'une autre nature — leur présence est un signal.
  assert.ok(!perms.includes('android.permission.ACCESS_FINE_LOCATION'),
    'la localisation est métier pour toute une famille d\'apps — deux projets ont dû la désarmer');
  for (const p of ['READ_SMS', 'RECEIVE_SMS', 'READ_CONTACTS']) {
    assert.ok(perms.some((x) => x.endsWith(p)), `${p} doit rester interdite par défaut`);
  }
  assert.match(src, /ACCESS_FINE_LOCATION/,
    'et le défaut doit rester REMETTABLE : la ligne est commentée, pas supprimée');
});

test('le skill nomme la suite qui pend, et dit qu\'aucun plafond ne sauve', () => {
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  assert.match(src, /micro-tâches/, 'le symptôme doit être nommé par sa cause');
  assert.match(src, /affame la boucle/, 'et par le mécanisme, sinon on cherche un test lent');
  // ⚠️ La moitié qui compte : dire que le remède habituel NE MARCHE PAS, sinon
  // le lecteur passe une heure à poser des timeouts qui ne se déclenchent pas.
  assert.match(src, /déclenche pas/, 'un timeout est lui-même un timer');
  assert.match(src, /Completer\(\)/, 'et le remède réel est dans le double');
});

test('le gabarit demande si l\'agent peut écrire dans un paquet voisin', () => {
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/PROMPTS.md'), 'utf8');
  assert.match(src, /paquet VOISIN/,
    'le skill dit quoi faire sans la permission ; le cadrage doit dire si elle existe');
  assert.match(src, /ancres inertes/,
    'et ce que son absence coûte, mesuré sur deux projets');
});
