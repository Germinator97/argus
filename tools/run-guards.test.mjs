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
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..');

import {
  authAnchorsReady, avdNameFrom, baselineVerdict, budgetVerdict, buildEnv, dimensionsToRun, localeFindings, localeWarnings, resolveByAvd, resolveNamedDevice, startTimeoutMs,
  startScreen, startupFindings, startupHint, startupSamples, vanishedHint, visitedScreens,
} from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { androidAvdDeclared, buildCmdForAbi, ciEmulator, deviceAbi, flutterCommand, flutterCommandIn, rankBuildTools, toolPath, usesFvm, validateConfig } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { ancresOrphelinesReport } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { CONFIG_FILES, configNonEmbarquee } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { nomAffiche, nomTechniqueEnTitre } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { outilPresent } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { PROBE_TIMEOUT_MS, SH_TIMEOUT_MS, declaredAnchors, exitCodeFor, measureBinary, platformFor,
  posedAnchors, releaseBuildCmd, sh, shTimeoutMs, undeclaredAnchors } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { sizeFinding } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { buildHintFor } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/sec.mjs';
import { coverageLine, stalenessOf } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs';
import { LIGHTBOX, STYLE, findingCards } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs';
import { consignePublication, historiqueDe, pertePossible, renderArtifact, runRecord } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs';
import { plateformeLisible, titreDuRapport, titrePublie } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs';
import { artifactFor, loadConfig } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { ECRAN_COURANT, identifyScreen, parseArgs, plancherMesure, relaunchDecision, verdictAttente } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/a11y.mjs';
import { buildFindings } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/a11y.mjs';
import { auditAndroidManifest, auditApk, auditObfuscation, exigenceNonTenue, binaryFreshness, binaryScanPlan, binaryToScan, dartPackageName, iosBinarySkipReason } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/sec.mjs';
import { binaryToWeigh } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { launchOutcome } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { thresholdFinding } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { caveatDebug, hostContext, launchTimeFindings, startupMetricLabel } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/perf.mjs';
import { baselineCropFor, baselineCrops, baselineDeviceDrift, cropFor, deviceStamp, installHint, screensWithMovedCrop } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { buildCoverage, stageOneOnly } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { startupMargin, startupMarginWarning } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { runScope } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { anchorAfterAuth } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { causeInstall } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { branchesDeGoto, ecransSansBranche } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { flowsIntrouvables } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { flowCycles } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { ciblesRunFlow } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { recadragesNonGardes } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { installedVariant } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { compteursDeLaPage, compteursDuDepot, dernierRunDu, ecarts, nombreFr, texteDeLaPage } from './artefact-compteurs.mjs';
import { EXCEPTIONS, fuitesDe } from './artefact-confidentialite.mjs';
import { litterauxDart } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';
import { masquerSecrets, secretsVides } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { bandOf, cvssOf, findingsFromOsv } from '../plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/sca.mjs';

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

// ── L'indice nomme-t-il la cause qui coûte le plus ? ────────────────────────
//
// Point 237. Le message opposait « ancre fausse » à « écran lent » et envoyait
// relever un plafond. Or l'écran peut n'être ni l'un ni l'autre : une app qui
// ne démarre pas. Vécu — « Service indisponible » à chaque lancement, faute
// d'un fichier de configuration absent du bundle. Relever le plafond n'y aurait
// JAMAIS rien changé, et un run a cherché une lenteur qui n'existait pas.

test('l\'indice de démarrage nomme les TROIS causes, et la capture qui tranche (237)', () => {
  const h = startupHint('id=home_root', 'home_root', CONFIG);
  assert.ok(h, 'l\'indice ne se produit plus sur l\'ancre de départ');

  // La cause qui coûte le plus, et le geste qui la tranche en une seconde.
  assert.match(h, /L'app ne démarre PAS/, 'l\'indice n\'envisage toujours pas une app cassée (237)');
  assert.match(h, /screenshots\//,
    'l\'indice ne dit pas OÙ est la capture — un run a dû la reprendre à la main');
  // ⚠️ DÉRIVÉ : le chemin nommé doit être celui que le runner écrit vraiment.
  // Le citer sans ce lien ferait une consigne qui se périme en silence.
  const run = readFileSync(join(SCRIPTS_DIR, 'run.mjs'), 'utf8');
  assert.match(run, /screenshots\/, screen-hierarchy\//,
    'la structure des artefacts Maestro a changé — le chemin que l\'indice nomme est peut-être faux');

  // ⚠️ L'AUTRE MOITIÉ : les deux causes d'origine restent nommées. Un correctif
  // qui n'aurait gardé que la nouvelle ferait perdre les deux leviers utiles.
  assert.match(h, /startTimeoutMs/, 'l\'indice ne nomme plus le levier de lenteur');
  assert.match(h, /argus-anchors/, 'l\'indice ne dit plus comment vérifier l\'ancre sans device');
  assert.match(h, /Ne touche PAS à thresholds\.coldStartMs/,
    'l\'indice ne protège plus le seuil que le SKILL interdit de relever');
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
  // ⚠️ Un mot peut s'intercaler (« Relève ALORS `x` ») : le motif d'origine
  // exigeait le backtick collé et il est tombé sur une reformulation du 259 —
  // un correctif JUSTE. Le phénomène mesuré n'avait pas bougé, seule sa
  // formulation ; c'est l'ancrage qui était trop serré, pas le garde.
  const prescrit = skill.match(/Relève(?:\s+\w+)?\s+`([A-Za-z.]+)`/);
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
  // ⚠️ UNE CONTRE-ÉPREUVE EST UN COMPTAGE SANS FILTRE, ET C'EST SON OBJET. Le
  // §2b prescrit désormais de vérifier l'instrument avant de lire son zéro : le
  // même motif SANS `grep -v` doit rendre > 0. Ce garde refusait donc la sonde
  // qu'il aurait dû exiger.
  //
  // La distinction est STRUCTURELLE, pas nominale : une ligne sans filtre est
  // légitime quand une ligne voisine porte le MÊME motif AVEC le filtre — c'est
  // exactement la forme d'une contre-épreuve, et rien d'autre ne l'a.
  // ⚠️ ET LE CRITÈRE EST « DÉCLARE SON ATTENDU », pas « un jumeau filtré existe
  // quelque part ». La première version excusait tout comptage non filtré dès
  // qu'un filtré traînait ailleurs dans la page — donc elle excusait aussi le
  // comptage PRESCRIT auquel on aurait retiré son filtre. La mutation l'a dit
  // en rendant VACANT. Une contre-épreuve annonce ce qu'elle attend (`# doit
  // être > 0`) ; un comptage prescrit ne l'annonce pas, il mesure.
  const declareSonAttendu = (/** @type {string} */ l) => /#\s*doit être/.test(l);
  const sansFiltre = comptages.filter((l) => !l.includes('grep -v') && !declareSonAttendu(l));
  assert.deepEqual(sansFiltre, [],
    'ces comptages liront le dartdoc d\'exemple et rendront des ancres qui n\'existent pas, '
    + 'et aucun comptage filtré du même motif ne les accompagne (donc ce ne sont pas des '
    + `contre-épreuves) : ${JSON.stringify(sansFiltre)}`);

  // ⚠️ ET LA CONTRE-ÉPREUVE DOIT EXISTER : sans elle, « ces compteurs rendent 0 »
  // ne distingue pas un filtre qui marche d'un instrument mort.
  assert.ok(comptages.some((l) => !l.includes('grep -v') && declareSonAttendu(l)),
    'le §2b ne prescrit plus aucune contre-épreuve : son « doit rendre 0 » redevient '
    + 'indistinguable d\'un grep cassé, d\'un chemin faux ou d\'un filtre trop large');
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
  assert.deepEqual(binaryScanPlan('android', apk, dossier, config, true),
    { scan: true, nature: 'ok', why: '' });

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

// ── `goto` prescrivait une branche par écran, même pour ceux qui n'en ont pas ─
//
// Point 221, et le run l'avait mal situé : la table §2c-bis couvre déjà la
// DÉCLARATION d'un état atteint après un parcours (son cas 3). Ce qui n'avait
// aucune instruction, c'est `goto.yaml`, dont le TODO demandait « une branche
// par écran » — impossible pour un état que seul le parcours crée, puisque
// `clearState` efface la donnée avant chaque flow. L'agent a inventé le remède.

test('goto dit ce qu\'il advient d\'un écran qu\'aucune branche ne peut atteindre (221)', () => {
  const flows = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro');
  // ⚠️ DÉRIVÉ : c'est `clearState` qui crée le cas. S'il disparaissait du
  // lancement, le passage de goto.yaml deviendrait sans objet — et ce garde
  // le dirait, au lieu de veiller sur une prose devenue inutile.
  const clean = readFileSync(join(flows, '_subflows/launch-clean.yaml'), 'utf8');
  assert.match(clean, /clearState/,
    'launch-clean ne purge plus l\'état — le passage de goto.yaml sur les états « pleins » est périmé');

  const goto = readFileSync(join(flows, '_subflows/goto.yaml'), 'utf8');
  assert.match(goto, /N'ADMETTENT PAS DE BRANCHE/,
    'goto.yaml ne dit plus que certains écrans n\'admettent aucune branche (221)');
  const bloc = goto.slice(goto.indexOf('N\'ADMETTENT PAS DE BRANCHE'), goto.indexOf('N\'ADMETTENT PAS DE BRANCHE') + 1400);
  assert.match(bloc, /clearState/, 'le passage ne nomme plus la CAUSE — sans elle, il se lit comme un caprice');
  assert.match(bloc, /journey-critical/, 'le passage ne dit pas OÙ vont les assertions de ces écrans');

  // ⚠️ L'AUTRE MOITIÉ : le TODO doit continuer à demander une branche pour les
  // écrans qui, eux, en admettent une. Un correctif qui dirait « pas de
  // branche » tout court viderait le sous-flow de son travail.
  assert.match(goto, /une branche par écran/,
    'le TODO ne demande plus de branche du tout — il en faut pour les écrans atteignables');
});

// ── Trois promesses de doc, chacune avec son garde ──────────────────────────

test('la reconnaissance envoie chercher le splash imposé qui décide du gate (222)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  // ⚠️ DÉRIVÉ : la clé est lue par les scripts, donc le SKILL doit dire d'aller
  // la chercher. Le jour où elle disparaît du code, ce garde le dit.
  const lue = readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.mjs'))
    .some((f) => readFileSync(join(SCRIPTS_DIR, f), 'utf8').includes('brandedSplashMs'));
  assert.equal(lue, true, 'brandedSplashMs n\'est plus lue par aucun script — le passage du SKILL est périmé');

  const bloc = skill.slice(skill.indexOf('CHERCHE AUSSI UNE DURÉE DE SPLASH'));
  assert.ok(bloc.length > 300, 'la reconnaissance ne dit plus de chercher un splash imposé (222)');
  const debut = bloc.slice(0, 1200);
  assert.match(debut, /brandedSplashMs/, 'le passage ne nomme plus la clé où reporter la durée');
  // La mesure qui fait comprendre POURQUOI : sans elle, la consigne est un ordre.
  assert.match(debut, /3415|major/, 'le passage ne dit plus ce que la clé change au verdict');
  // ⚠️ Et il doit être dans la RECONNAISSANCE : c'est le moment où on peut
  // encore lire main.dart. Ailleurs, on a déjà publié le finding.
  assert.ok(skill.indexOf('CHERCHE AUSSI UNE DURÉE DE SPLASH') < skill.indexOf('## 3.'),
    'le passage a quitté la reconnaissance — il arrive après le verdict qu\'il sert à éviter');
});

test('le gabarit du rapport porte le nom de paramètre que le SKILL prescrit d\'écrire (224)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  // La prescription doit exister…
  assert.match(skill, /écris-la dans le rapport d'instrumentation/,
    'le SKILL ne prescrit plus d\'écrire le nom du paramètre');
  // …et le gabarit, donné « dans cette forme exacte », doit avoir où l'écrire.
  const ligne = skill.split('\n').find((l) => l.includes('dont partagées'));
  assert.ok(ligne, 'la ligne « dont partagées » a disparu du gabarit');
  assert.match(ligne, /param/i,
    'le gabarit n\'a pas de case pour le nom du paramètre, que le SKILL prescrit pourtant '
    + 'd\'y écrire — une information prescrite sans case se fait inventer');
});

test('le titre se LIT avant la première republication, il ne se suppose pas (223)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const bloc = skill.slice(skill.indexOf('Garde le titre et l\'icône stables'));
  assert.ok(bloc.length > 400, 'le passage sur la stabilité du titre a disparu');
  const debut = bloc.slice(0, 1200);
  assert.match(debut, /LIS SON TITRE ACTUEL/,
    'rien ne dit plus de lire le titre existant : le défaut RENOMME la page en croyant la stabiliser');
  // ⚠️ L'AUTRE MOITIÉ : la consigne d'origine reste vraie pour une PREMIÈRE
  // publication. Un correctif qui la supprimerait laisserait le titre au hasard.
  //
  // ⚠️ ET LE DÉFAUT SE DÉRIVE, IL NE SE CITE PAS. Ce garde exigeait la chaîne
  // « Rapport Argus Mobile » ; le 253 a changé ce défaut, et le garde est tombé
  // en accusant un correctif juste — la pente aurait été de le supprimer, ce
  // qui aurait vidé la moitié qu'il protège. On lui fait donc construire le
  // gabarit avec la FONCTION qui le produit : si le format change encore, ce
  // n'est plus le garde qui se périme, c'est le SKILL qui doit suivre.
  const gabarit = titreDuRapport({ name: '<nom du projet>', platform: '<plateforme>' });
  assert.ok(gabarit.includes('<nom du projet>') && gabarit.includes('<plateforme>'),
    'le gabarit doit porter ses deux variables — sinon ce garde ne mesure rien');
  assert.ok(debut.includes(gabarit),
    `le défaut n'est plus nommé sous la forme que le code produit (${gabarit})`
    + ' — il reste juste pour une première publication');
});

// ── Ce que le SKILL prescrit pour itérer doit EXISTER dans le runner ────────
//
// Point 220. Le skill disait « reprends la séquence à `argus-run` », ce qui se
// lit comme un run complet — 310 s contre 87 en filtré, facteur 3,6 à chaque
// itération. Les drapeaux existaient ; aucun n'était documenté nulle part, et
// l'agent a dû lire `run.mjs` pour les trouver.
//
// Le garde est DÉRIVÉ : il prend les drapeaux que le SKILL nomme et exige que
// le runner les accepte. Un drapeau renommé dans le code fait rougir la doc.

test('les drapeaux que le SKILL prescrit pour itérer existent dans le runner', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const runner = readFileSync(join(SCRIPTS_DIR, 'run.mjs'), 'utf8');

  const bloc = skill.slice(skill.indexOf('ET SI C\'EST UN SEUL FLOW'));
  assert.ok(bloc.length > 200, 'le SKILL ne dit plus comment itérer sur un seul flow (point 220)');
  // ⚠️ CE GARDE EST NÉ FAUX, et de la façon la plus documentée du dépôt : sa
  // première version collectait les drapeaux de la PROSE, donc elle attrapait
  // `--flow` dans ma propre phrase disant qu'il n'existe pas. Il porte donc sur
  // le BLOC DE COMMANDE — ce que le lecteur copie —, jamais sur ce qu'on en dit.
  const commande = bloc.slice(bloc.indexOf('```bash'), bloc.indexOf('```', bloc.indexOf('```bash') + 7));
  assert.ok(commande.includes('run.mjs'), 'le bloc ne porte plus de commande à copier');
  const prescrits = [...commande.matchAll(/(--[a-z-]+)/g)].map((m) => m[1]);
  assert.ok(prescrits.length >= 2,
    `la commande ne porte plus de drapeaux (${prescrits.length}) — si sa forme a changé, mets ce garde à jour`);

  // ⚠️ DÉRIVÉ : chaque drapeau nommé doit être accepté par le runner. C'est ce
  // qui empêche la doc de citer un drapeau qui n'existe pas — le défaut exact
  // qu'un `--flow` inventé aurait produit.
  const acceptes = new Set([...runner.matchAll(/'(--[a-z-]+)'/g)].map((m) => m[1]));
  const fantomes = prescrits.filter((f) => !acceptes.has(f));
  assert.deepEqual(fantomes, [],
    'le SKILL prescrit des drapeaux que le runner n\'accepte pas — ils échoueront chez le lecteur');

  // L'autre moitié : le coût mesuré doit rester, sinon la consigne n'a pas de
  // raison, et une consigne sans raison ne se suit pas.
  assert.match(bloc.slice(0, 900), /310|87/, 'le SKILL ne dit plus ce que coûte un run complet');
  // …et le lecteur doit être détourné de `--flow`, qui n'existe pas : sans
  // cette phrase, il l'essaie, et c'est ce qui a coûté la lecture de run.mjs.
  assert.match(bloc.slice(0, 900), /n'a pas de `--flow`/,
    'le SKILL ne dit plus que `--flow` n\'existe pas — le lecteur l\'essaiera');
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

test('le croisement survit à dart format, aux paramètres nommés et aux apostrophes (225-227)', () => {
  // ⚠️ TROIS DÉFAUTS DE CE CONTRÔLE, trouvés par le run qui l'a étrenné.
  // Le pire n'est pas qu'il rate : c'est qu'il ACCUSAIT. Lu ligne à ligne, il
  // ne voyait rien d'une liste que `dart format` avait repliée — 27 ancres
  // lues au lieu de 68, et cinq déclarations correctes rapportées orphelines.
  const dossier = mkdtempSync(join(tmpdir(), 'argus-ancres3-'));
  mkdirSync(join(dossier, 'lib'), { recursive: true });
  mkdirSync(join(dossier, 'test', 'argus'), { recursive: true });

  writeFileSync(join(dossier, 'test/argus/harness.dart'), [
    "/// Exemple : ArgusScreen(anchor: 'ancre_du_dartdoc', commands: <String>['jamais_posee'])",
    "ArgusScreen(",
    "  id: 'home',",
    "  anchor: 'home_root',",
    '  commands: <String>[',            // ⚠️ repliée par dart format : le cœur du 225
    "    'home_start',        // n'existe qu'en debug — c'est voulu",
    "    // Elle N'EXISTE PAS en release — et c'est voulu.",
    "    'home_settings',",
    '  ],',
    '  displays: const <String>[],',
    '),',
  ].join('\n'));
  writeFileSync(join(dossier, 'lib/p.dart'), [
    "/// dartdoc : Semantics(identifier: 'ancre_du_commentaire')",
    "Semantics(identifier: 'home_root', child: C(",
    "  FocusButton(semanticIdentifier: 'home_start'),",
    "  NumberStepper(anchorPrefix: 'stepper'),",
    "  FocusToggle(semanticIdentifier: 'home_settings'),",
    "  Semantics(identifier: 'orpheline_reelle', child: B()),",
    "  Tab(semanticIdentifier: 'nav_${spec.id}'),",
    '));',
  ].join('\n'));

  // ── 225 : la liste repliée est LUE, donc plus de fausse accusation ───────
  const dec = declaredAnchors(dossier);
  assert.ok(dec.includes('home_start') && dec.includes('home_settings'),
    `une liste repliée par dart format n'est plus lue — le contrôle accuse à tort. Vu : ${JSON.stringify(dec)}`);
  assert.ok(!dec.includes('home'), 'l\'id de l\'écran repasse pour une ancre déclarée');
  assert.ok(!dec.includes('ancre_du_dartdoc'), 'le dartdoc d\'exemple repasse pour une déclaration');

  // ── 227 : AUCUN fantôme, deux formes de commentaire à apostrophe ─────────
  const fantomes = dec.filter((a) => /\s/.test(a));
  assert.deepEqual(fantomes, [],
    'une apostrophe française dans un commentaire ouvre encore un faux littéral');

  // ── 226 : les ancres posées par PARAMÈTRE sont vues ──────────────────────
  const poses = posedAnchors(dossier);
  assert.ok(poses.includes('home_start') && poses.includes('home_settings'),
    `les ancres posées par \`semanticIdentifier\` sont invisibles — l'angle mort que ce contrôle devait fermer. Vu : ${JSON.stringify(poses)}`);
  // ⚠️ L'AUTRE MOITIÉ : `anchorPrefix` reste DEHORS. Un préfixe n'est pas une
  // ancre ; le compter produirait un faux positif, pas une trouvaille.
  assert.ok(!poses.includes('stepper'), 'un préfixe de famille est compté comme une ancre');
  assert.ok(!poses.includes('ancre_du_commentaire'), 'le dartdoc repasse pour une ancre posée');
  assert.ok(!poses.some((a) => a.includes('$')), 'un gabarit interpolé est compté comme une ancre');

  // ── et le verdict : la SEULE vraie orpheline ─────────────────────────────
  assert.deepEqual(undeclaredAnchors(dossier, {}), ['orpheline_reelle']);

  // ── la convention maison, que le SKILL dit de GARDER ─────────────────────
  assert.ok(posedAnchors(dossier, { anchors: { paramNames: ['anchorPrefix'] } }).includes('stepper'),
    'un projet ne peut pas déclarer sa propre convention de paramètre');
  rmSync(dossier, { recursive: true, force: true });
});

test('le README du scaffold n\'enseigne pas ce que le SKILL mesure comme piège (229)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const readme = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/ARGUS-MOBILE.md'), 'utf8');

  // ⚠️ DÉRIVÉ : c'est la table du SKILL qui décide de ce qui est un piège. Si
  // elle changeait d'avis, ce garde suivrait au lieu de figer une opinion.
  assert.match(skill, /<code>ElevatedButton<\/code>|`ElevatedButton`/,
    'le SKILL ne classe plus ElevatedButton — ce garde n\'a plus de référence');
  assert.match(skill, /aucune action/,
    'la table du SKILL ne dit plus qu\'un tel nœud reste sans action');

  // La forme piège peut FIGURER dans le README — il faut bien la montrer —
  // mais jamais sous un ✅. C'est le voisinage qui compte, pas la présence :
  // chercher la forme seule attraperait la mise en garde qui la corrige.
  const lignes = readme.split('\n');
  for (let i = 0; i < lignes.length; i += 1) {
    if (!/Semantics\(identifier: '[^']*', child: ElevatedButton/.test(lignes[i])) continue;
    const avant = lignes.slice(Math.max(0, i - 8), i).join('\n');
    assert.doesNotMatch(avant, /✅/,
      `ARGUS-MOBILE.md donne encore la forme inerte comme bonne (ligne ${i + 1}) — `
      + 'c\'est le fichier que le prochain développeur du projet ouvre');
    assert.match(avant, /INERTE|piège/,
      `la forme inerte est montrée sans être nommée comme telle (ligne ${i + 1})`);
  }

  // ⚠️ L'AUTRE MOITIÉ : la bonne forme doit être là. Un README qui ne montrerait
  // que le piège laisserait le lecteur sans réponse.
  assert.match(readme, /child: Semantics\(/,
    'le README ne montre plus la forme qui MARCHE — l\'ancre sur l\'enfant');
  assert.match(readme, /Semantics\(identifier: 'card_open', child: InkWell/,
    'le README ne montre plus le cas où l\'enveloppe fusionne, qui est le cas simple');
});

test('trois informations justes qui arrivaient trop tard (231-233, 236)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const yaml = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml'), 'utf8');
  const run = readFileSync(join(SCRIPTS_DIR, 'run.mjs'), 'utf8');

  // 231 — le repli de l'ancre post-auth ne se lisait que dans run.mjs.
  // ⚠️ DÉRIVÉ : c'est l'existence du repli DANS LE CODE qui rend la phrase
  // nécessaire. S'il disparaissait, la phrase deviendrait fausse et ce garde
  // le dirait, au lieu de veiller sur une prose sans objet.
  assert.match(run, /anchorAfterAuth/, 'le repli post-auth a disparu du runner — la phrase du YAML est périmée');
  const bloc = yaml.slice(yaml.indexOf('SUR UNE APP SANS COMPTE'), yaml.indexOf('SUR UNE APP SANS COMPTE') + 700);
  assert.ok(bloc.length > 200, 'le YAML ne dit plus ce que des ancres d\'auth vides produisent (231)');
  assert.match(bloc, /ARGUS_ANCHOR_AFTER_AUTH/, 'le passage ne nomme plus la variable qui garde le parcours');
  assert.match(bloc, /ancre d'accueil/, 'le passage ne dit plus SUR QUOI le runner retombe');

  // 232 — hideKeyboard referme une feuille modale sur iOS.
  assert.match(skill, /`hideKeyboard` REFERME UNE FEUILLE MODALE SUR iOS/,
    'le piège iOS de hideKeyboard n\'est plus documenté (232)');
  assert.match(skill.slice(skill.indexOf('hideKeyboard` REFERME')), /220 s|deux flows rouges/,
    'le passage ne dit plus ce que ce piège a coûté — une consigne sans sa mesure ne se suit pas');

  // 233 — l'état TROUVÉ ne peut pas se lire dans harness.dart.
  assert.match(skill, /L'ÉTAT TROUVÉ, LUI, SE COMPTE DEPUIS `lib\/`/,
    'le SKILL demande encore de lire l\'état trouvé dans un fichier qui n\'existe pas encore (233)');

  // 236 — la ligne de démarrage dit ce qu'elle assume.
  // ⚠️ Le finding, lui, le disait DÉJÀ : deux textes du même run qui ne
  // racontaient pas la même chose. C'est cette égalité-là qu'on garde.
  assert.match(run, /hors splash de marque/, 'le finding ne dit plus qu\'il retranche le splash');
  assert.match(run, /de splash assumé/,
    'la ligne de console ne dit toujours pas ce qu\'elle assume — elle se lit comme un dépassement (236)');
  // …et elle ne le dit QUE s'il y en a un : une mention à zéro serait du bruit.
  assert.match(run, /splash > 0 \?/, 'la mention du splash n\'est plus conditionnelle');
});

test('argus-anchors lance ses DEUX moitiés, même si la première échoue (234)', () => {
  // ⚠️ Chaînées par `make`, le croisement bloquait le test Dart — et sur un
  // projet fraîchement instrumenté c'est justement lui qui échoue le plus.
  // Le test, celui qui trouve les ancres absorbées et sous le pli, ne tournait
  // alors jamais : il a fallu deux passes à un run pour découvrir sept ancres
  // sous le pli qu'il aurait nommées du premier coup.
  const mk = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'), 'utf8');
  const recette = mk.slice(mk.indexOf('\nargus-anchors:'));
  const corps = recette.slice(0, recette.indexOf('\n\n'))
    .split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  assert.match(corps, /--check-anchors/, 'le croisement a disparu de la cible');
  assert.match(corps, /test test\/argus\/anchors_test\.dart/, 'le test Dart a disparu de la cible');
  // Les deux gestes doivent être TOLÉRANTS à l'échec l'un de l'autre…
  assert.match(corps, /--check-anchors \|\| rc=/,
    'le croisement bloque de nouveau le test Dart : un garde qui empêche un autre garde de tourner');
  assert.match(corps, /anchors_test\.dart \|\| rc=/, 'le test Dart n\'accumule plus son code de sortie');
  // …et la cible doit RESTER rouge si l'un des deux a échoué.
  assert.match(corps, /exit \$\$rc/,
    'la cible ne rend plus le code de sortie accumulé — elle passerait au vert sur un échec');
});

test('un conseil ne nomme pas un objet que la plateforme n\'a pas (235)', () => {
  assert.match(localeWarnings('fr_FR', false, 'en_US', 'android').join('\n'), /émulateur/,
    'le conseil Android ne parle plus d\'émulateur');
  const ios = localeWarnings('fr_FR', false, 'en_US', 'ios').join('\n');
  assert.doesNotMatch(ios, /émulateur|\bavd\b/i,
    'le conseil iOS parle encore d\'un émulateur ou d\'un AVD — la plateforme n\'en a pas');
  assert.match(ios, /simulateur/, 'le conseil iOS ne nomme pas ce que la plateforme A');
  // ⚠️ CÂBLAGE : un paramètre optionnel jamais passé retombe sur son défaut, et
  // tous les tests resteraient verts. C'est le site d'appel qu'on lit ici.
  const run = readFileSync(join(SCRIPTS_DIR, 'run.mjs'), 'utf8');
  // ⚠️ Pas de `[^)]*` : l'appel contient `?? ''` — donc une parenthèse — et le
  // motif s'arrêtait avant d'atteindre l'argument cherché. On lit la fenêtre
  // qui suit l'appel, ce qui ne dépend pas de sa ponctuation interne.
  const i = run.indexOf('localeWarnings(', run.indexOf('export function localeWarnings') + 40);
  assert.ok(i > 0, 'le runner n\'appelle plus localeWarnings');
  assert.match(run.slice(i, i + 260), /,\s*platform\s*,?\s*\n?\s*\)/,
    'le runner ne passe plus la plateforme à localeWarnings — le conseil retombe sur Android');
});

test('les jobs de la CI livrée SUIVENT platforms:, ils ne le supposent plus (230)', () => {
  const wf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.github/workflows/argus-mobile.yml'), 'utf8');

  // Découpe en blocs de job — un job commence en colonne 2, deux espaces.
  const debut = wf.indexOf('\njobs:');
  assert.ok(debut > 0, 'le workflow n\'a plus de bloc jobs:');
  /** @type {Record<string,string>} */
  const jobs = {};
  // ⚠️ LES COMMENTAIRES D'ABORD. Ce garde attribuait au DERNIER job tout ce qui
  // suit le bloc `jobs:` — y compris les blocs de documentation en pied de
  // fichier. Un exemple commenté portant `flutter build apk` a suffi à lui faire
  // accuser `e2e-ios` de construire un APK. C'est le défaut que `flowCycles`
  // documente déjà pour le graphe des flows : un analyseur qui lit les
  // commentaires invente ce qu'il mesure.
  const corps = wf.slice(debut).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const bornes = [...corps.matchAll(/\n {2}([a-z][a-z0-9-]*):\n/g)];
  assert.ok(bornes.length >= 4, `moins de 4 jobs trouvés (${bornes.length}) — si le format a changé, mets ce garde à jour`);
  bornes.forEach((m, i) => {
    const fin = i + 1 < bornes.length ? bornes[i + 1].index : corps.length;
    jobs[m[1]] = corps.slice(m.index, fin);
  });

  // ⚠️ DÉRIVÉ DU CONTENU : c'est ce qu'un job FAIT qui décide s'il lui faut la
  // condition, jamais son nom. Un job renommé garde donc son exigence.
  const androidOnly = Object.entries(jobs).filter(([, t]) =>
    /android-emulator-runner|build apk|--platform=android/.test(t));
  // ⚠️ `>= 1`, et non un compte figé. Ce garde exigeait DEUX jobs Android, ce
  // qui décrivait l'état du jour où il a été écrit : `security` construisait
  // alors un APK debug — précisément le défaut B1, retiré depuis. Un attendu
  // qui fige un cardinal se périme au premier correctif ; ce qu'on veut savoir
  // est que le motif trouve encore quelque chose.
  assert.ok(androidOnly.length >= 1,
    `aucun job Android détecté (${androidOnly.length}) — le motif ne mesure plus rien`);
  for (const [nom, texte] of androidOnly) {
    assert.match(texte, /if:\s*needs\.cadre\.outputs\.android == 'true'/,
      `le job « ${nom} » construit un APK ou démarre un émulateur sans se conditionner : `
      + 'sur un projet iOS-seul il ne peut que rougir');
  }

  // ⚠️ L'AUTRE MOITIÉ : l'étage 1 ne dépend d'AUCUNE plateforme. Le conditionner
  // priverait un projet iOS de la seule dimension qui tourne partout.
  assert.ok(jobs.guards, 'le job guards a disparu');
  assert.doesNotMatch(jobs.guards, /needs\.cadre\.outputs\.(android|ios)/,
    'l\'étage 1 est conditionné à une plateforme — il tourne pourtant partout');

  // Et le job iOS ne doit plus être éteint par un LITTÉRAL que rien ne relie
  // à la config : c'est ce qui en faisait un geste manuel qu'on oublie.
  assert.ok(jobs['e2e-ios'], 'le job e2e-ios a disparu');
  assert.doesNotMatch(jobs['e2e-ios'], /if:\s*false/,
    'e2e-ios est de nouveau éteint en dur — rien ne rappelle de l\'allumer');
  assert.match(jobs['e2e-ios'], /needs\.cadre\.outputs\.ios == 'true'/,
    'e2e-ios ne suit plus la plateforme déclarée');
  // …et l'opt-in de coût reste explicite : on ne dépense pas à sa place.
  assert.match(jobs['e2e-ios'], /vars\.ARGUS_IOS_CI/,
    'e2e-ios s\'allumerait tout seul sur un runner macOS — ~10x le coût d\'un Linux');
});

test('le bloc auth dit ce qu\'une suite authentifiée COÛTE (241, 244)', () => {
  const scaffold = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const yaml = readFileSync(join(scaffold, 'argus.mobile.yaml'), 'utf8');

  // ⚠️ DÉRIVÉ : c'est `clearState` avant chaque flow qui crée le coût. S'il
  // disparaissait du lancement, ce passage deviendrait sans objet — et ce garde
  // le dirait plutôt que de veiller sur une prose périmée.
  const clean = readFileSync(join(scaffold, '.maestro/_subflows/launch-clean.yaml'), 'utf8');
  assert.match(clean, /clearState: true/, 'launch-clean ne purge plus — le passage sur le coût est périmé');

  const auth = yaml.slice(yaml.indexOf('\nauth:'), yaml.indexOf('\nauth:') + 4200);
  assert.ok(auth.length > 1000, 'le bloc auth a disparu ou raccourci — ce garde ne mesure plus rien');
  // Le coût, là où il se décide — pas trois fichiers plus loin.
  assert.match(auth, /RÉINSTALLER l'app/,
    'le bloc auth ne dit pas ce que clearState coûte sur iOS — c\'est pourtant lui qui décide d\'une limite de débit');
  assert.match(auth, /3 appels par minute|limite de débit/,
    'le bloc auth ne dit plus qu\'une suite peut épuiser un quota d\'envoi');
  // Le cas que rien ne couvrait : besoin d'auth SANS inclure login.
  assert.match(auth, /n'inclut PAS\s*\n?\s*#?\s*`?login\.yaml`?/,
    'le cas du flow qui a besoin de la connexion sans l\'inclure n\'est toujours pas traité (241)');
  assert.match(auth, /Trois issues/, 'le cas est nommé mais aucune issue n\'est proposée');
});

test('le bloc device iOS ne se contredit pas, et l\'outillage nomme xcrun (243)', () => {
  const scaffold = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const yaml = readFileSync(join(scaffold, 'argus.mobile.yaml'), 'utf8');
  const bloc = yaml.slice(yaml.indexOf('# - id: ios-sim') - 600, yaml.indexOf('# - id: ios-sim') + 400);
  assert.ok(bloc.includes('# - id: ios-sim'), 'le bloc device iOS a disparu');
  assert.doesNotMatch(bloc, /#\s+autoStart: true/,
    'le gabarit iOS prescrit encore autoStart: true, que ce même fichier déconseille sur un device nommé');
  assert.match(bloc, /autoStart: false/, 'le gabarit iOS ne prescrit plus rien pour autoStart');

  // ⚠️ MON PREMIER CRITÈRE ÉTAIT TROP LARGE — « tout outil que TOOLS vérifie
  // doit être listé » exigeait aussi `aapt2`, `apkanalyzer` et `unzip`, qui
  // n'appartiennent qu'au scan binaire et pas au démarrage. Il aurait fait
  // AJOUTER trois outils sans objet, comme le motif non ancré du point 226.
  // Le constat réel est une ASYMÉTRIE : `adb` était listé, `xcrun` non — deux
  // pilotes de plateforme, un seul nommé.
  const cfg = readFileSync(join(SCRIPTS_DIR, 'config.mjs'), 'utf8');
  const bloctools = cfg.slice(cfg.indexOf('export const TOOLS'), cfg.indexOf('export const TOOLS') + 1400);
  for (const pilote of ['adb', 'xcrun']) {
    assert.match(bloctools, new RegExp(`\\b${pilote}: \\{ probe:`),
      `${pilote} n'est plus vérifié par le harnais — ce garde n'a plus de référence`);
  }
  const install = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/scripts/install-mobile.sh'), 'utf8');
  const ligne = install.split('\n').find((l) => l.includes('for tool in')) ?? '';
  assert.ok(ligne, 'l\'installeur ne cherche plus d\'outils');
  const pilotes = ['adb', 'xcrun'].filter((t) => ligne.includes(t));
  assert.deepEqual(pilotes, ['adb', 'xcrun'],
    'l\'installeur nomme un pilote de plateforme sans l\'autre : un projet iOS voyait « ✔ adb » '
    + 'et rien sur celui dont il dépend');
});

test('le double qui sauve l\'étage 1 est présenté comme un SYMPTÔME (238)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  // ⚠️ NON-VACANCE : le remède doit toujours être prescrit, sinon la mise en
  // garde n'a plus d'objet et il faut la retirer, pas la garder.
  assert.match(skill, /`Completer\(\)` sans\n`complete`/,
    'le SKILL ne prescrit plus le double — la mise en garde du 238 est sans objet');

  const bloc = skill.slice(skill.indexOf('CE DOUBLE CACHE UN DÉFAUT DE PRODUCTION'));
  assert.ok(bloc.length > 400,
    'le SKILL ne dit plus que ce double masque un défaut de production (238) — un run a payé '
    + 'un étage 1 VERT sur l\'écran qui gèle l\'app');
  const debut = bloc.slice(0, 1600);
  assert.match(debut, /100 001|LE BESOIN DU DOUBLE EST LE SYMPTÔME/,
    'le passage ne porte plus la mesure qui l\'établit');
  // Les trois gestes, dans l'ordre : mesurer, inscrire, PUIS doubler.
  for (const geste of [/\*\*mesure\*\*/, /\*\*inscris-le\*\*/, /\*\*puis\*\* écris le double/]) {
    assert.match(debut, geste, 'le passage ne prescrit plus les trois gestes dans l\'ordre');
  }
});

test('le crochet de montage est câblé à TOUS les sites, pas à deux (240)', () => {
  const argus = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus');
  const types = readFileSync(join(argus, 'argus_types.dart'), 'utf8');
  assert.match(types, /final void Function\(\)\? setUp;/,
    'ArgusScreen n\'a plus de point d\'accroche : un écran qui résout par get_it n\'a nulle part où poser son double');

  const harness = readFileSync(join(argus, 'argus_harness.dart'), 'utf8');
  assert.match(harness, /Widget argusMonte\(ArgusScreen screen\) \{[\s\S]{0,120}screen\.setUp\?\.call\(\);/,
    'argusMonte ne joue plus le setUp avant de construire');

  // ⚠️ LE CÂBLAGE EST TOUT L'ENJEU. Écrit d'abord, ce crochet n'était branché
  // qu'à DEUX sites sur seize : il aurait marché pour l'indice de pli et n'aurait
  // rien fait dans les suites — un défaut invisible, puisque rien ne casse.
  const suites = ['layout_test.dart', 'a11y_test.dart', 'anchors_test.dart', 'argus_harness.dart'];
  let montages = 0;
  for (const f of suites) {
    const src2 = readFileSync(join(argus, f), 'utf8');
    montages += (src2.match(/argusMonte\(screen\)/g) ?? []).length;
    // Le seul `screen.build()` toléré est celui DANS argusMonte.
    const directs = src2.split('\n').filter((l) => l.includes('screen.build()') && !l.includes('return screen.build();'));
    assert.deepEqual(directs.map((l) => l.trim()), [],
      `${f} monte encore un écran sans jouer son setUp — le crochet y est inerte`);
  }
  assert.ok(montages >= 14, `seulement ${montages} montages câblés — le compte a chuté, un site est passé au travers`);
});

// ── Une édition programmatique doit avoir où s'ancrer ───────────────────────
//
// Point 239. Les deux fichiers OWNED portent leur ligne de déclaration mot pour
// mot dans leur dartdoc, et plus HAUT que la vraie. Un `indexOf` ancré dessus
// matche le commentaire et réécrit la doc à la place du code : deux fichiers
// détruits sur un projet réel. Le SKILL prévenait pour COMPTER, pas pour ÉCRIRE.

test('les fichiers du projet portent un point d\'ancrage d\'édition unique (239)', () => {
  const argus = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus');
  for (const [f, decl] of [['harness.dart', 'final List<ArgusScreen> argusScreens ='],
    ['known_issues.dart', 'const Set<String> argusKnownIssues =']]) {
    const src = readFileSync(join(argus, f), 'utf8');
    const lignes = src.split('\n');

    // ⚠️ NON-VACANCE : le piège doit EXISTER, sinon ce garde ne mesure rien.
    // C'est le dartdoc qui porte la déclaration en double — s'il cessait, le
    // marqueur deviendrait sans objet et il faudrait le dire, pas le garder.
    const enDoc = lignes.filter((l) => l.trimStart().startsWith('///') && l.includes(decl)).length;
    assert.ok(enDoc >= 1,
      `${f} : le dartdoc ne porte plus la déclaration en double — le marqueur n'a plus d'objet`);

    // Le marqueur est unique, et jamais en commentaire de doc.
    const marques = lignes.filter((l) => l.includes('ARGUS:DECLARATION'));
    assert.equal(marques.length, 1, `${f} : ${marques.length} marqueur(s) au lieu d'un — un point d'ancrage se doit d'être unique`);
    assert.ok(!marques[0].trimStart().startsWith('///'),
      `${f} : le marqueur est dans un dartdoc, donc il tombe dans le piège qu'il ferme`);

    // …et il précède la VRAIE déclaration, pas une autre.
    const iMarque = lignes.findIndex((l) => l.includes('ARGUS:DECLARATION'));
    const iDecl = lignes.findIndex((l, k) => k > iMarque && !l.trimStart().startsWith('///') && l.includes(decl));
    assert.ok(iDecl > iMarque && iDecl - iMarque < 14,
      `${f} : le marqueur ne précède pas la déclaration (marqueur ${iMarque + 1}, déclaration ${iDecl + 1})`);
  }

  // Et le SKILL doit dire que le geste dangereux est l'ÉCRITURE, pas le comptage.
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  assert.match(skill, /LA MÊME PRUDENCE VAUT POUR ÉDITER/,
    'le SKILL ne prévient que pour compter — or c\'est l\'écriture qui détruit');
  assert.match(skill, /ARGUS:DECLARATION/, 'le SKILL ne nomme pas le marqueur sur lequel s\'ancrer');
});

// ── Une plateforme hors périmètre ne doit pas faire échouer le gate ─────────
//
// Point 242, image inversée des 213-217 : là, tout supposait Android ; ici,
// Android s'invitait là où on ne l'avait pas demandé. Les deux audits de
// sources tournaient quelle que soit la plateforme, donc sur `platforms: [ios]`
// le manifeste Android rendait un `major` — et `major` est dans `gate.failOn`.

test('sec.mjs ne juge que les plateformes déclarées, et DIT le reste (242)', () => {
  const scaffold = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const yaml = readFileSync(join(scaffold, 'argus.mobile.yaml'), 'utf8');
  assert.match(yaml, /^platforms:\n {2}- android$/m,
    'le scaffold ne déclare plus `platforms: [android]` — le montage ne bascule plus rien');

  const monter = (/** @type {string} */ plats) => {
    const d = mkdtempSync(join(tmpdir(), 'argus-sec-plat-'));
    mkdirSync(join(d, 'android/app/src/main'), { recursive: true });
    mkdirSync(join(d, 'ios/Runner'), { recursive: true });
    cpSync(join(scaffold, 'scripts'), join(d, 'scripts'), { recursive: true });
    writeFileSync(join(d, 'argus.mobile.yaml'), yaml
      .replace(/^platforms:\n {2}- android$/m, `platforms:\n${plats}`)
      .replace(/^ {2}androidPackage: ''.*$/m, '  androidPackage: com.exemple.a')
      .replace(/^ {2}iosBundleId: ''.*$/m, '  iosBundleId: com.exemple.a'));
    // ⚠️ Une permission que la config n'attend PAS : c'est elle qui produit le
    // `major`. Sans elle le montage rendrait 0 partout et ne mesurerait rien.
    writeFileSync(join(d, 'android/app/src/main/AndroidManifest.xml'),
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n'
      + '<uses-permission android:name="android.permission.CAMERA"/>\n'
      + '<application android:label="a"/>\n</manifest>\n');
    writeFileSync(join(d, 'ios/Runner/Info.plist'), '<plist><dict></dict></plist>\n');
    let out = '';
    try {
      out = execFileSync('bash', ['-c', 'node scripts/argus/sec.mjs 2>&1'], { cwd: d, encoding: 'utf8' });
    } catch (e) { const x = /** @type {any} */ (e); out = String(x.stdout ?? '') + String(x.stderr ?? ''); }
    rmSync(d, { recursive: true, force: true });
    return out;
  };

  // ── iOS seul : le manifeste Android n'est pas jugé, et on le DIT ─────────
  const ios = monter('  - ios');
  assert.match(ios, /0 finding\(s\)/,
    `un projet iOS échoue encore sur une permission Android — reçu : ${ios.slice(0, 300)}`);
  assert.match(ios, /non jugé — le manifeste Android/,
    'ce qui n\'est pas jugé se tait : un audit absent ressemble à un audit qui n\'a rien trouvé');

  // ── ⚠️ L'AUTRE MOITIÉ : Android déclaré, le manifeste EST jugé ───────────
  // Sans ce cas, un correctif qui n'auditerait plus rien passerait.
  const android = monter('  - android');
  assert.match(android, /1 finding\(s\)/, 'la permission Android n\'est plus jugée quand android EST déclaré');
  assert.match(android, /non jugé — l'Info\.plist iOS/, 'l\'audit iOS sauté ne se dit pas');

  // ── Les deux : rien n'est sauté, donc rien à annoncer ────────────────────
  const deux = monter('  - android\n  - ios');
  assert.match(deux, /1 finding\(s\)/, 'le manifeste Android n\'est plus jugé quand les deux sont déclarés');
  assert.doesNotMatch(deux, /non jugé/, 'un run qui juge tout annonce quand même des absences');
});

test('la taille ne prescrit pas le binaire que la config INTERDIT (228)', () => {
  // ⚠️ La dérivation était de forme Android (`-debug.` → `-release.`), donc un
  // no-op sur un chemin iOS : le finding prescrivait `iphonesimulator` pendant
  // que le commentaire de la clé dit « `iphoneos`, PAS `iphonesimulator` ».
  // La prescription fausse est partie dans un rapport PUBLIÉ.
  const yaml = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml'), 'utf8');
  // ⚠️ DÉRIVÉ DE LA CONFIG : si le commentaire change d'avis, ce garde suit.
  // L'y coder en dur ferait deux sources qui divergeraient en silence — le
  // défaut même qu'on ferme.
  assert.match(yaml, /`iphoneos`, pas `iphonesimulator`/,
    'la config ne dit plus quel build iOS se publie — ce garde n\'a plus de référence');

  const cfg = { thresholds: { binarySizeMb: 60 } };
  const prescrit = (/** @type {string} */ p, /** @type {string} */ plat) =>
    String(sizeFinding({ path: p, isRelease: false }, 92, cfg, plat, 'cmd')?.suggestedFix ?? '');

  const ios = prescrit('build/ios/iphonesimulator/Runner.app', 'ios');
  assert.match(ios, /iosScan: build\/ios\/iphoneos\//,
    'la taille ne prescrit plus un build device sur iOS');
  assert.doesNotMatch(ios.split('\n').find((l) => l.includes('déclare-la')) ?? '', /iphonesimulator/,
    'la taille prescrit encore le simulateur — ce que la config INTERDIT');

  // Le nom de cible est DÉRIVÉ, pas figé : un projet dont l'app ne s'appelle pas
  // Runner garderait sinon le nom par défaut dans une consigne qui le concerne.
  assert.match(prescrit('build/ios/iphonesimulator/MonApp.app', 'ios'), /iphoneos\/MonApp\.app/,
    'le nom de la cible est figé au lieu d\'être dérivé du chemin mesuré');

  // ⚠️ L'AUTRE MOITIÉ : Android ne bouge pas. C'est la direction qu'un correctif
  // de plateforme casse en silence.
  assert.match(prescrit('build/app/outputs/flutter-apk/app-dev-debug.apk', 'android'),
    /androidScan: build\/app\/outputs\/flutter-apk\/app-dev-release\.apk/,
    'la dérivation Android a changé — flavor compris');
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

  // ⚠️ CE GARDE N'ÉTAIT PAS HERMÉTIQUE, et son verdict dépendait de ce qui était
  // branché sur la machine. `--print-build-cmd` interroge `adb devices` pour
  // cibler l'ABI ; sans émulateur allumé la commande sort nue, avec un émulateur
  // elle porte `--target-platform android-arm64`. Le garde a donc passé pendant
  // des mois SANS JAMAIS exercer le ciblage — et il est tombé le jour où deux
  // runs ont laissé leurs émulateurs allumés, en accusant un correctif sans
  // rapport. Un test dont le résultat dépend d'une variable qu'il ne contrôle
  // pas ne mesure ni l'un ni l'autre de ses états.
  //
  // On fixe donc l'environnement : un PATH sans `adb` (aucun device), et un
  // `adb` factice (un device). Les DEUX états sont désormais exercés.
  // ⚠️ DEUX dossiers, et c'est le montage qui a menti la première fois : mettre
  // le faux `adb` dans le PATH censé être VIDE le rendait joignable des deux
  // côtés, donc les deux états ciblaient l'ABI et l'assertion « sans device »
  // tombait sur mon propre montage, pas sur le code.
  const faux = mkdtempSync(join(tmpdir(), 'argus-adb-'));
  const vide = mkdtempSync(join(tmpdir(), 'argus-sans-adb-'));
  // `process.execPath` et non 'node' : le PATH réduit ne contient pas node non plus.
  const lancerSans = (/** @type {string[]} */ args) =>
    execFileSync(process.execPath, ['scripts/argus/config.mjs', ...args],
      { cwd: dossier, encoding: 'utf8', env: { ...process.env, PATH: vide } }).trim();
  writeFileSync(join(faux, 'adb'),
    '#!/bin/sh\ncase "$*" in\n  "devices") printf \'List of devices attached\\nemulator-5554\\tdevice\\n\' ;;\n'
    + '  *"abi"*) echo arm64-v8a ;;\n  *"avd name"*) echo Pixel_9a ;;\n  *) echo "" ;;\nesac\n', 'utf8');
  chmodSync(join(faux, 'adb'), 0o755);
  const lancerAvec = (/** @type {string[]} */ args) =>
    execFileSync(process.execPath, ['scripts/argus/config.mjs', ...args],
      { cwd: dossier, encoding: 'utf8', env: { ...process.env, PATH: `${faux}:${process.env.PATH}` } }).trim();
  const lancer = lancerSans;

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

  // ⚠️ ET L'AUTRE ÉTAT, celui qu'aucune exécution n'avait jamais exercé : device
  // branché ⇒ la commande CIBLE l'ABI. C'est le geste par défaut d'`argus-build`
  // depuis le point 267, et rien ne le mesurait.
  assert.equal(lancerAvec(['--print-build-cmd', '--platform=android']),
    'flutter build apk --debug --target-platform android-arm64',
    'un device branché doit faire cibler l\'ABI : c\'est le geste par défaut, plus rapide et '
    + 'plus léger, et il n\'était exercé dans aucun état');
  // Le binaire, lui, ne bouge pas : seul le build change.
  assert.equal(lancerAvec(['--print-binary', '--platform=android']),
    'build/app/outputs/flutter-apk/app-debug.apk');

  rmSync(faux, { recursive: true, force: true });
  rmSync(vide, { recursive: true, force: true });
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

test('le conseil de plafond ne renvoie pas iOS vers une mesure qu\'il ne produit PAS (279)', () => {
  // 🔴 ANGLE MORT CRÉÉ PAR LE CORRECTIF QUI L'A ÉCRIT — le mien, la veille.
  // « Dérive-le de firstLaunchMs » est juste sur Android et impossible sur iOS :
  // `perf.mjs` y rend un `skipReason` et ne mesure AUCUN démarrage, faute
  // d'équivalent local à `am start -W`. Un run iOS a donc reçu un conseil
  // désignant une grandeur que sa plateforme ne produit pas. La table du §1
  // l'annonçait — « démarrage ✖ sur iOS » — à neuf cents lignes de là.
  const echantillons = [{ ms: 20039 }];

  const ios = startupMarginWarning(echantillons, 20000, 'ios').join('\n');
  assert.ok(ios.length > 0, 'une marge serrée doit avertir sur iOS aussi — sinon ce garde ne mesure rien');
  assert.ok(!/dérive-le de `firstLaunchMs`/i.test(ios),
    'iOS est renvoyé vers `firstLaunchMs`, que argus-perf n\'y mesure pas : le conseil désigne '
    + 'une grandeur qui n\'existe pas sur cette plateforme');
  // Et il doit donner une grandeur QUI EXISTE : celle qu'on vient de relever.
  assert.match(ios, /20039 ms/,
    'le conseil iOS doit dériver de la pire attente relevée — c\'est la seule mesure de '
    + 'démarrage dont on dispose sur cette plateforme');

  // ⚠️ L'AUTRE MOITIÉ : Android garde son conseil, qui est le bon. Un correctif
  // qui retire `firstLaunchMs` PARTOUT échangerait un angle mort contre l'autre.
  const android = startupMarginWarning(echantillons, 20000, 'android').join('\n');
  assert.match(android, /firstLaunchMs/,
    'Android doit continuer de dériver de firstLaunchMs : argus-perf le mesure, et c\'est '
    + 'une grandeur dédiée, pas un relevé de circonstance');
  assert.notEqual(ios, android, 'les deux plateformes ne peuvent pas recevoir le même conseil');

  // Les deux disent ce qu'il ne faut PAS toucher : la lenteur reste un finding.
  for (const [quoi, msg] of [['ios', ios], ['android', android]]) {
    assert.match(msg, /Ne touche PAS `coldStartMs`/, `${quoi} : la clé qui RAPPORTE la lenteur doit rester nommée`);
  }

  // ⚠️ ET LE CÂBLAGE, sinon la production retombe en silence sur le conseil
  // Android : le paramètre a une valeur par défaut, ne pas le passer est légal,
  // et aucun test unitaire ne le verrait puisqu'ils le fournissent eux-mêmes.
  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  const appel = /startupMarginWarning\(startup,[^)]*\)/.exec(run);
  assert.ok(appel, 'l\'appel de startupMarginWarning dans main() a changé de forme — garde à mettre à jour');
  assert.match(appel[0], /platform/,
    'main() ne passe plus la plateforme : un run iOS recevrait le conseil Android sans que '
    + 'rien ne le signale');
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

// ═══════════════════════════════════════════════════════════════════════════
// La page publiée : une PAR PLATEFORME, et elle garde ses runs passés (245-250)
// ═══════════════════════════════════════════════════════════════════════════

/** Un contexte de run minimal, mais complet pour ce que la page en tire. */
function ctxRun({ plateforme = 'android', gate = 'pass', quand = '2026-08-31T10:00:00.000Z' } = {}) {
  return {
    generatedAt: quand, gate, shots: new Map(), evidenceNote: '', coverage: null, perf: null,
    run: { platform: plateforme, appId: 'com.exemple', scope: 'complet', devices: [], startup: {} },
    counts: { critical: 0, high: 1, medium: 0, low: 0 },
    parts: [{ file: 'a11y.json', state: 'ok', findings: [1] }],
    findings: [{ id: 'Q-1', severity: 'high', title: 'un défaut', dimension: 'a11y', screen: 'accueil', evidence: ['/tmp/x.png'] }],
  };
}
const pageDe = (o, historique = []) => renderArtifact({ ...ctxRun(o), record: runRecord(ctxRun(o)), historique });

test('une page PAR PLATEFORME, et la forme mono continue de marcher (245)', () => {
  // ⚠️ Le défaut fermé : une seule `artifact.url` pour un rapport qui décrit UN
  // run, donc UNE plateforme. Le run iOS republiait sur l'URL du run Android,
  // qui disparaissait — « je constate que le rapport des runs android a été
  // effacé pour celui de l'ios ». Rien ne le signalait : la page était valide.
  const deux = { artifact: { url: { ios: 'https://a/ios', android: 'https://a/dro' },
    title: { ios: 'T iOS', android: 'T Android' } } };
  assert.equal(artifactFor(deux, 'ios').url, 'https://a/ios');
  assert.equal(artifactFor(deux, 'android').url, 'https://a/dro');
  assert.notEqual(artifactFor(deux, 'ios').url, artifactFor(deux, 'android').url,
    'les deux plateformes doivent avoir des pages DIFFÉRENTES — sinon l\'une écrase l\'autre');
  assert.equal(artifactFor(deux, 'ios').title, 'T iOS', 'le titre suit la plateforme, comme l\'URL');

  // ⚠️ L'AUTRE MOITIÉ : un projet mono-plateforme écrit une chaîne, et rien ne
  // doit l'obliger à la transformer en objet. Casser ça casserait tous les
  // projets déjà configurés — un correctif qui coupe trop.
  const un = { artifact: { url: 'https://a/seule', title: 'T' } };
  assert.equal(artifactFor(un, 'ios').url, 'https://a/seule');
  assert.equal(artifactFor(un, 'android').url, 'https://a/seule');
  assert.equal(artifactFor({}, 'ios').url, '', 'et sans config, une chaîne vide, pas une exception');
});

test('l\'historique survit à une republication, et une page étrangère ne le casse pas (246)', () => {
  // L'historique ne peut vivre QUE dans la page : `argus-mobile-report/` est
  // gitignoré et effacé entre deux runs, un runner de CI est jetable.
  const p1 = pageDe({ gate: 'warn', quand: '2026-08-29T10:00:00.000Z' });
  const h1 = historiqueDe(p1);
  assert.equal(h1.length, 1, 'une page doit porter son propre run');
  const p2 = pageDe({ gate: 'fail', quand: '2026-08-30T10:00:00.000Z' }, h1);
  const h2 = historiqueDe(p2);
  assert.equal(h2.length, 2, 'la republication doit AJOUTER, pas remplacer');
  assert.deepEqual(h2.map((r) => r.gate), ['fail', 'warn'], 'le plus récent d\'abord');
  assert.match(p2, /id="passe-1"/, 'et le run passé doit être RENDU, pas seulement stocké');

  // ⚠️ L'AUTRE MOITIÉ : rendre `[]` plutôt que lever. Un historique vide fait
  // perdre le PASSÉ ; une exception ferait perdre le RUN. Le premier se voit.
  assert.deepEqual(historiqueDe('<h1>une autre page</h1>'), [], 'page étrangère');
  assert.deepEqual(historiqueDe(''), [], 'page vide');
  assert.deepEqual(historiqueDe(`<script type="application/json" id="argus-runs">{oops</scr` + `ipt>`), [],
    'JSON abîmé — on repart de zéro, on ne meurt pas');
});

test('le titre du rapport nomme le projet ET la plateforme (252)', () => {
  // ⚠️ Le défaut fermé : « Argus Mobile — rapport QA », le même sur toutes les
  // pages. Depuis le 245-250 un projet publie UNE page par plateforme — deux
  // pages du même projet portaient donc un titre identique, et deux onglets de
  // navigateur côte à côte étaient indiscernables. Rien ne le signalait : la
  // page était juste, et elle disait « ios » une ligne plus bas.
  const h1De = (p) => (p.match(/<h1>(.*?)<\/h1>/) ?? [])[1];

  const ios = h1De(pageDe({ plateforme: 'ios' }));
  const dro = h1De(pageDe({ plateforme: 'android' }));
  assert.ok(ios, 'le rendu doit porter un h1 — sinon ce garde ne mesure rien');

  // ⚠️ LE NOM DU PROJET, PAS SON IDENTIFIANT. `app.name` existait déjà, et son
  // propre commentaire dans le yaml annonçait qu'il « sert d'étiquette dans les
  // rapports » — rien ne s'en servait. Un titre se lit : un nom se reconnaît
  // dans une galerie, « com.exemple.app » se déchiffre.
  assert.equal(titreDuRapport({ name: 'monapp', appId: 'com.x.monapp', platform: 'ios' }),
    'monapp — iOS — rapport QA', 'le nom l\'emporte sur l\'identifiant');
  // ⚠️ L'AUTRE MOITIÉ : le nom peut manquer (un projet qui ne l'a pas configuré),
  // l'identifiant jamais. Mieux vaut un titre technique qu'un titre amputé de ce
  // qui le distingue.
  assert.equal(titreDuRapport({ appId: 'com.x.monapp', platform: 'ios' }),
    'com.x.monapp — iOS — rapport QA', 'sans nom, le repli est l\'identifiant');

  // ⚠️ UNE SEULE ORTHOGRAPHE PAR PAGE (323). Le `<title>` disait « iOS » et le
  // H1 « ios », parce que l'un venait d'un titre écrit à la main et l'autre de
  // `run.platform`, une clé de config en minuscules. Sans conséquence
  // fonctionnelle — mais ce titre est « la seule chose qui distingue ton rapport
  // des autres », et deux orthographes défont ce qu'il sert à faire.
  assert.equal(plateformeLisible('ios'), 'iOS');
  assert.equal(plateformeLisible('android'), 'Android');
  // Et une plateforme inconnue passe telle quelle : inventer une casse serait pire.
  assert.equal(plateformeLisible('harmonyos'), 'harmonyos');
  assert.equal(plateformeLisible(undefined), '');

  // ⚠️ ON APPELLE LA FONCTION, ET ON VÉRIFIE QUE LE SITE D'APPEL LA REND. Un
  // garde qui se contenterait de chercher « ios » dans le h1 resterait vert le
  // jour où quelqu'un rebranche le titre sur un littéral qui contient le mot :
  // c'est l'écart entre les deux qui se mesure, pas la présence d'un motif.
  assert.equal(ios, titreDuRapport({ appId: 'com.exemple', platform: 'ios' }),
    'le h1 doit RENDRE ce que titreDuRapport() rend, pas quelque chose qui y ressemble');
  assert.match(ios, /com\.exemple/, 'le titre doit nommer le projet');
  // ⚠️ DÉRIVÉ, pas cité : la plateforme s'écrit avec sa casse d'affichage (323),
  // et figer « ios » ici referait le garde faux au prochain changement de forme.
  assert.match(ios, new RegExp(`\\b${plateformeLisible('ios')}\\b`), 'et la plateforme');
  assert.notEqual(ios, dro,
    'deux plateformes du même projet doivent porter des titres DIFFÉRENTS — toute la raison du 245');

  // ⚠️ L'AUTRE MOITIÉ : les morceaux vides doivent tomber, sinon un run sans
  // plateforme rend « com.exemple —  — rapport QA ». Le séparateur orphelin est
  // le défaut par défaut de toute jointure, et il ne lève rien.
  const nu = renderArtifact({ ...ctxRun(), run: { devices: [], startup: {} }, historique: [] });
  assert.equal(h1De(nu), 'rapport QA', 'sans appId ni plateforme, aucun séparateur orphelin');
  assert.equal(titreDuRapport(undefined), 'rapport QA', 'ni sur un run absent');

  // ⚠️ ET LA SOUS-LIGNE NE DOIT PLUS RÉPÉTER LE TITRE. Elle portait l'appId et
  // la plateforme, qui sont montés dans le h1 : les laisser donnait deux lignes
  // qui se suivent en disant la même chose. Elle garde ce que le titre ne dit
  // pas — appareil, horodatage, gate.
  const sub = (pageDe({ plateforme: 'ios' }).match(/<div class="sub">([\s\S]*?)<\/div>/) ?? [])[1] ?? '';
  assert.ok(sub.includes('gate:'), 'la sous-ligne doit exister — sinon ce garde ne mesure rien');
  assert.ok(!sub.includes('com.exemple'), 'la sous-ligne ne doit plus répéter le projet du titre');
});

test('le titre ANNONCÉ est le titre PUBLIÉ, dans les trois formes (253)', () => {
  // ⚠️ Trois expressions calculaient ce titre séparément, et deux divergeaient.
  // Mesuré le 01/09/2026 :
  //   · titre PAR PLATEFORME — le journal lisait `config.artifact.title` sans
  //     passer par `artifactFor` : il annonçait « [object Object] » pendant que
  //     « T iOS » était publié. Le 245 avait ajouté la forme sans mettre le
  //     journal d'accord ;
  //   · titre VIDE — le journal annonçait « Rapport Argus Mobile », la page
  //     publiait « Argus Mobile — rapport QA ».
  // Rien ne levait : les deux valeurs sont des chaînes plausibles, et le seul
  // lecteur du journal est celui qui va republier — donc celui que l'écart
  // trompe. C'est le motif du 250, sur une autre paire.
  const run = { platform: 'ios', appId: 'com.exemple' };

  const parPlateforme = { artifact: { title: { ios: 'T iOS', android: 'T Android' } } };
  assert.equal(titrePublie(parPlateforme, run), 'T iOS',
    'la forme par plateforme doit passer par artifactFor, pas être lue à plat');
  assert.equal(titrePublie(parPlateforme, { platform: 'android', appId: 'com.exemple' }), 'T Android',
    'et suivre la plateforme — sinon les deux pages reprennent le même titre');

  assert.equal(titrePublie({ artifact: { title: 'T unique' } }, run), 'T unique',
    'la forme mono continue de marcher');

  // Le repli nomme le projet ET la plateforme, comme le h1 : un défaut
  // générique rendrait toutes les cartes de galerie identiques, c'est-à-dire le
  // défaut que le 252 ferme un cran plus bas.
  assert.equal(titrePublie({ artifact: {} }, run), titreDuRapport(run),
    'sans titre configuré, le repli est celui du h1');
  assert.equal(titrePublie(undefined, run), titreDuRapport(run), 'et une config absente ne lève pas');

  // ⚠️ ET LE RENDU DOIT RENDRE CETTE VALEUR-LÀ. Sans ce maillon, la fonction
  // pourrait être juste pendant que la page publie autre chose : c'est
  // exactement l'écart qu'on vient de fermer.
  const titre = titrePublie(parPlateforme, run);
  const page = renderArtifact({ ...ctxRun({ plateforme: 'ios' }), title: titre, historique: [] });
  assert.equal((page.match(/<title>(.*?)<\/title>/) ?? [])[1], titre,
    'le <title> publié doit être la valeur que titrePublie() rend');

  // ⚠️ L'AUTRE MOITIÉ : sans titre, le rendu retombe sur le titre du run, pas
  // sur une constante — sinon deux projets publieraient la même carte.
  const sansTitre = renderArtifact({ ...ctxRun({ plateforme: 'ios' }), title: '', historique: [] });
  assert.equal((sansTitre.match(/<title>(.*?)<\/title>/) ?? [])[1], titreDuRapport(ctxRun({ plateforme: 'ios' }).run),
    'et le repli du rendu est le même que celui de titrePublie');
});

test('le journal annonce EXACTEMENT le titre que le fichier porte (253, troisième barreau)', () => {
  // ⚠️ CE GARDE EXISTE PARCE QUE LE PRÉCÉDENT NE SUFFISAIT PAS. La mutation qui
  // redonne au journal son propre calcul du titre — le défaut du 253, mot pour
  // mot — laissait toute la suite VERTE : `titrePublie()` restait juste, et
  // c'est son CÂBLAGE au journal que plus rien ne tenait. Garde qui lit du
  // texte < garde qui appelle < exécution du programme ; les deux premiers
  // étaient là, le troisième manquait.
  //
  // Il ne lit donc aucun motif de source : il LANCE report.mjs et compare ce
  // que le journal annonce à ce que le fichier porte.
  const dir = mkdtempSync(join(tmpdir(), 'argus-titre-'));
  try {
    // ⚠️ Un nom DISTINCTIF, pour que sa présence dans le titre prouve le câblage
    // `app.name` → titre, et non une coïncidence. Ce chaînon vit dans `main()` :
    // aucun test unitaire ne peut le voir, puisque la fonction du titre reçoit
    // déjà le nom qu'on lui donne.
    writeFileSync(join(dir, 'argus.mobile.yaml'),
      'app:\n  name: projetsonde\n  id: com.exemple\nartifact:\n  enabled: true\n  title:\n', 'utf8');
    // ⚠️ Chemin ABSOLU et racine figée AVANT le changement de dossier : un
    // chemin relatif ne survit pas au `cwd`, et `realpathSync` des deux côtés
    // décide si le script se reconnaît comme point d'entrée.
    const script = join(RACINE,
      'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs');
    // ⚠️ stderr COMPRIS : un garde voisin a déjà rougi sur son propre montage
    // pour avoir lu une sortie amputée.
    const sortie = execFileSync(process.execPath, [script],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    const annonce = (sortie.match(/titre « (.*?) »/) ?? [])[1];
    assert.ok(annonce, `le journal ne dit plus quel titre il publie — ou le programme n'a pas tourné.\n${sortie}`);

    const page = readFileSync(join(dir, 'argus-mobile-report', 'report.artifact.android.html'), 'utf8');
    const publie = (page.match(/<title>(.*?)<\/title>/) ?? [])[1];
    assert.ok(publie, 'la page publiable ne porte pas de <title> — le montage est cassé, pas le code');

    assert.equal(annonce, publie,
      'le titre ANNONCÉ n\'est pas le titre PUBLIÉ : le seul lecteur de cette ligne est '
      + 'celui qui va republier, donc celui que l\'écart trompe');

    // ⚠️ ET LE NOM DE LA CONFIG DOIT ARRIVER JUSQU'AU TITRE. `report.json` ne le
    // porte pas — il décrit un run, pas un dépôt : c'est `main()` qui le prend
    // dans la config, et ce chaînon-là ne casse rien s'il disparaît. Le titre
    // retombe simplement sur l'identifiant, en silence.
    assert.match(publie, /projetsonde/,
      `le nom de app.name n'atteint plus le titre — il retombe sur l'identifiant sans le dire (${publie})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('la consigne de publication annonce le RISQUE, pas un doublon (275)', () => {
  // ⚠️ CE MESSAGE DISAIT L'INVERSE DU DANGER. Il annonçait qu'une publication
  // sans URL « crée un doublon » — au pire deux pages, rien de perdu. La mesure
  // du 01/09 dit le contraire : l'outil de publication rapproche par CHEMIN DE
  // FICHIER, un run iOS a donc atterri sur la page Android de son propre
  // terrain et l'a remplacée. Le message rassurait sur le seul geste qui
  // détruit.
  //
  // Le garde APPELLE la fonction et lit ce qui revient : chercher son texte
  // dans la source resterait vert sur une valeur neutralisée.
  const republie = consignePublication('https://exemple/abc', 'ios');
  const premiere = consignePublication('', 'ios');

  // Les deux branches portent leur consigne ET son avertissement — c'est la
  // seconde ligne qui est le correctif, et elle doit exister des deux côtés :
  // une PREMIÈRE publication n'est pas garantie neuve non plus.
  // Trois lignes en republication depuis le 284 : où publier, ce qu'une
  // publication nue risque, et ce qu'on fait si l'URL ne résout plus — trois
  // informations distinctes, pas trois versions de la même (cf. 276).
  assert.equal(republie.length, 3,
    'une republication doit dire où publier, ce qu\'une publication nue risque, et quoi faire '
    + 'si l\'URL est morte');
  assert.equal(premiere.length, 2, 'une première publication doit dire où reporter l\'URL ET quoi vérifier après');
  assert.ok(republie.some((l) => /ne résout plus/.test(l)),
    'le cas de l\'URL morte doit être dit LÀ OÙ on lit l\'URL — deux runs l\'ont rencontré '
    + 'le même jour, et le §3g-bis ne connaissait que « présente » et « absente »');
  for (const [quoi, lignes] of [['republication', republie], ['première', premiere]]) {
    assert.ok(lignes.every((l) => l.trim().length > 30),
      `${quoi} : une consigne vide ou lapidaire ne prévient de rien (${JSON.stringify(lignes)})`);
    assert.notEqual(lignes[0], lignes[1], `${quoi} : l'avertissement ne doit pas répéter la consigne`);
  }

  // ⚠️ L'AUTRE MOITIÉ : la branche qui connaît l'URL doit la DIRE. Sans elle,
  // celui qui lit ne sait pas quoi passer, et repart précisément sur la
  // publication nue que l'avertissement décrit.
  assert.ok(republie.some((l) => l.includes('https://exemple/abc')),
    'la consigne de republication doit porter l\'URL à passer');
  assert.ok(premiere.some((l) => l.includes('artifact.url.ios')),
    'la première publication doit dire SOUS QUELLE CLÉ reporter l\'URL obtenue');

  // Et les deux consignes diffèrent : un message unique pour les deux cas
  // redonnerait le conseil de republication à qui n'a pas encore de page.
  assert.notDeepEqual(republie, premiere,
    'republier et publier pour la première fois ne demandent pas le même geste');
});

test('deux plateformes du MÊME terrain écrivent deux fichiers DIFFÉRENTS (275, troisième barreau)', () => {
  // ⚠️ C'EST CE GARDE QUI FERME LE DÉFAUT, et il ne peut pas être unitaire : le
  // nom du fichier se décide dans `main()`, à partir de la plateforme du run.
  // Tant que les deux runs d'un terrain écrivaient `report.artifact.html`,
  // l'outil de publication — qui rapproche par CHEMIN — remplaçait la page du
  // premier par celle du second. Mesuré : les runs 35 (Android) et 37 (iOS)
  // partagent leur commit de base, donc leur chemin absolu.
  //
  // Le garde ne lit aucun motif de source : il LANCE report.mjs deux fois, une
  // par plateforme, et compare les chemins produits.
  const script = join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs');
  const produits = {};
  for (const plateforme of ['ios', 'android']) {
    const dir = mkdtempSync(join(tmpdir(), `argus-275-${plateforme}-`));
    try {
      writeFileSync(join(dir, 'argus.mobile.yaml'),
        `app:\n  name: sonde\n  id: com.exemple\nplatforms: [${plateforme}]\nartifact:\n  enabled: true\n`, 'utf8');
      execFileSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const pages = readdirSync(join(dir, 'argus-mobile-report')).filter((f) => f.startsWith('report.artifact'));
      assert.equal(pages.length, 1, `${plateforme} : une page publiable et une seule (${pages.join(', ')})`);
      produits[plateforme] = pages[0];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Le cœur du 275, et il est dérivé : deux plateformes, deux noms. Peu importe
  // lesquels — c'est leur DIFFÉRENCE qui empêche l'écrasement.
  assert.notEqual(produits.ios, produits.android,
    `les deux plateformes écrivent le même fichier (${produits.ios}) : publier la seconde sans URL `
    + 'atterrit sur la page de la première et la REMPLACE — le défaut du 01/09, rouvert');

  // Et chaque nom doit porter SA plateforme, sinon on ne sait pas laquelle on
  // publie — le 252 sur une autre paire.
  for (const [plateforme, fichier] of Object.entries(produits)) {
    assert.ok(fichier.includes(plateforme),
      `le fichier de ${plateforme} ne le dit pas (${fichier}) : celui qui publie ne sait pas ce qu'il envoie`);
  }
});

test('un onglet ne répète la plateforme que si elle DÉTONNE (254)', () => {
  // ⚠️ Une page décrit UNE plateforme depuis le 245, et le titre la porte : la
  // réécrire sur chaque onglet donnait la même information trois fois de suite.
  const rec = (plateforme, at) => ({ at, platform: plateforme, appId: 'com.x', gate: 'pass',
    counts: {}, dimensions: [], findings: [] });
  const base = { ...ctxRun({ plateforme: 'ios' }) };
  const ongletsDe = (h) => [...h.matchAll(/<button role="tab"[^>]*>(.*?)<\/button>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim());

  const meme = renderArtifact({ ...base, record: rec('ios', '2026-09-01 11:20'),
    historique: [rec('ios', '2026-08-31 10:00')] });
  const etiquettes = ongletsDe(meme);
  assert.equal(etiquettes.length, 2, 'deux runs doivent donner deux onglets — sinon ce garde ne mesure rien');
  assert.ok(!etiquettes.some((e) => e.includes('ios')),
    'la plateforme du titre ne doit pas être répétée sur chaque onglet');

  // ⚠️ L'AUTRE MOITIÉ, ET C'EST ELLE QUI COMPTE : la retirer sans condition
  // supprimerait le seul signal qu'une page a MÉLANGÉ deux plateformes — ce que
  // le 245 rend possible sans l'interdire. Elle doit reparaître dès qu'elle
  // diffère de celle du run courant.
  const melange = renderArtifact({ ...base, record: rec('ios', '2026-09-01 11:20'),
    historique: [rec('android', '2026-08-31 10:00')] });
  const mel = ongletsDe(melange);
  assert.ok(mel.some((e) => e.includes('android')),
    'un run d\'une AUTRE plateforme doit se voir — c\'est une anomalie, pas du décor');
  assert.ok(!mel[0].includes('ios'), 'mais le run courant ne se signale pas lui-même');
});

// ═══════════════════════════════════════════════════════════════════════════
// Ce dépôt est PUBLIC : aucun nom, aucun identifiant de projet réel (255)
// ═══════════════════════════════════════════════════════════════════════════

test('aucun identifiant d\'application réel dans le dépôt (255)', () => {
  // ⚠️ Ce dépôt est public, et les projets sur lesquels le skill est exercé ne
  // le sont pas — l'un d'eux est sous contrat. La règle est absolue : ni leur
  // nom, ni leur identifiant, ni leurs ancres, ni leurs libellés. Les constats
  // s'écrivent en termes génériques.
  //
  // ⚠️ CE GARDE NE NOMME PAS CE QU'IL INTERDIT — il ne connaît que ce qui est
  // AUTORISÉ. Citer les coupables réintroduirait dans le dépôt public ce qu'on
  // vient d'en retirer, et la liste se périmerait au projet suivant.
  //
  // ⚠️ ET IL COMPARE PAR ÉGALITÉ, jamais par inclusion : un relevé figé par
  // inclusion survit à ce qu'il décrit et devient une permission permanente.
  const AUTORISES = new Set([
    // Exemples de la documentation et des fixtures — aucun projet ne les porte.
    'com.exemple.a', 'com.exemple.app', 'com.exemple.monapp', 'com.x.monapp',
    'com.exemple.autreapp',
    // Tiers légitime : c'est Flutter qui le déclare, pas nous.
    'io.flutter.splash',
  ]);
  const MOTIF = /\b(?:com|io|org|net|app|fr|dev|me|eu|uk)\.[a-z0-9_]+(?:\.[a-z0-9_]+)+/g;

  const fichiers = execFileSync('git', ['ls-files', '-z'], { cwd: RACINE, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  assert.ok(fichiers.length > 20, 'aucun fichier listé — le montage est cassé, pas le dépôt');

  const vus = new Map();
  for (const f of fichiers) {
    let texte;
    try { texte = readFileSync(join(RACINE, f), 'utf8'); } catch { continue; }
    for (const m of texte.matchAll(MOTIF)) {
      if (!vus.has(m[0])) vus.set(m[0], f);
    }
  }
  // ⚠️ Le motif doit avoir trouvé QUELQUE CHOSE : un motif qui ne matche plus
  // rend un ensemble vide, donc une égalité vraie, donc un garde vert qui ne
  // mesure plus rien.
  assert.ok(vus.size > 0, 'le motif d\'identifiant ne matche plus rien — ce garde est devenu vacant');

  const intrus = [...vus.keys()].filter((x) => !AUTORISES.has(x));
  assert.deepEqual(intrus, [],
    'identifiant(s) de projet réel dans un dépôt PUBLIC — récris le constat en termes '
    + `génériques. Trouvé(s) dans : ${intrus.map((x) => vus.get(x)).join(', ')}`);

  // ⚠️ L'AUTRE MOITIÉ : la liste d'autorisés ne doit pas non plus VIEILLIR. Un
  // exemple retiré du dépôt doit sortir de la liste, sinon elle enregistre des
  // permissions pour des valeurs qui n'existent plus.
  const orphelins = [...AUTORISES].filter((x) => !vus.has(x));
  assert.deepEqual(orphelins, [],
    'valeur(s) autorisée(s) qui n\'apparaissent plus nulle part : retire-les de la liste');
});

test('aucun nom de projet réel — liste tenue HORS du dépôt (255)', () => {
  // ⚠️ Un NOM de projet n'a aucune forme reconnaissable : ce sont des mots
  // ordinaires, et certains sont même du vocabulaire technique courant. Aucun motif ne peut donc les distinguer, et la
  // liste des vrais noms ne peut pas vivre ici — l'écrire publierait exactement
  // ce qu'elle sert à cacher.
  //
  // Elle vit donc hors dépôt. Le garde est alors CONDITIONNEL, et c'est le
  // danger : sans la liste, il rendrait un vert silencieux qui ressemble à une
  // preuve. Il se met en échec explicite si elle manque, sauf en CI où elle ne
  // peut pas exister — et il le DIT.
  const liste = join(homedir(), '.argus-etalon', 'noms-interdits.txt');
  if (!existsSync(liste)) {
    assert.ok(process.env.CI,
      `liste absente (${liste}) : ce garde ne peut RIEN prouver. Crée-la (un terme par `
      + 'ligne, les lignes vides et # ignorés) ou lance avec CI=1 pour l\'accepter.');
    return;
  }
  const termes = readFileSync(liste, 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  assert.ok(termes.length > 0, 'la liste existe mais est vide — elle ne prouve rien');

  const fichiers = execFileSync('git', ['ls-files', '-z'], { cwd: RACINE, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  const messages = execFileSync('git', ['log', '--all', '--format=%H%n%s%n%b'],
    { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  // ⚠️ LE MESSAGE D'ÉCHEC NE CITE PAS LE TERME. Il finirait dans un journal de
  // CI, c'est-à-dire à l'endroit même qu'on protège. On donne son RANG.
  const fautes = [];
  termes.forEach((t, i) => {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    for (const f of fichiers) {
      let texte;
      try { texte = readFileSync(join(RACINE, f), 'utf8'); } catch { continue; }
      if (re.test(texte)) { fautes.push(`terme n°${i + 1} → ${f}`); break; }
    }
    if (re.test(messages)) fautes.push(`terme n°${i + 1} → un message de commit`);
  });
  assert.deepEqual(fautes, [],
    `nom(s) de projet réel dans un dépôt PUBLIC (rangs dans ${liste}) : ${fautes.join(' · ')}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// Ce que le skill MONTRE doit être ce que son parseur ACCEPTE (256)
// ═══════════════════════════════════════════════════════════════════════════

test('toute dimension que le rapport JUGE est lancée par la séquence du skill (257)', () => {
  // ⚠️ DEUX RUNS INDÉPENDANTS ONT PUBLIÉ UN RAPPORT À MOITIÉ MUET, en suivant la
  // séquence à la lettre. Elle listait sept commandes ; le rapport juge CINQ
  // dimensions, et `argus-run` n'en alimente qu'une. `argus-sec`, `argus-sca` et
  // le a11y device n'apparaissaient nulle part dans le SKILL — zéro occurrence —
  // et `argus-perf` seulement dans un encadré de coût.
  //
  // Rien ne le signalait : le rapport écrit honnêtement « 1/5 dimensions
  // exécutées », ce qui se lit comme une information et non comme une alarme.
  // Les quatre commandes coûtent moins d'une minute.
  //
  // ⚠️ La liste des dimensions est DÉRIVÉE de `report.mjs`, jamais recopiée : une
  // sixième dimension ajoutée demain hérite du garde sans qu'on y pense.
  const rapport = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/report.mjs'), 'utf8');
  const sources = [...rapport.matchAll(/how:\s*'node scripts\/argus\/(\w+)\.mjs'/g)].map((m) => m[1]);
  assert.ok(sources.length >= 5,
    `seulement ${sources.length} source(s) dérivée(s) de report.mjs — le motif ne matche plus, ce garde est vacant`);

  // La cible Makefile qui produit chaque source, dérivée du Makefile lui-même.
  const makefile = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'), 'utf8');
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');

  const absentes = [];
  for (const script of sources) {
    // ⚠️ BORNÉ À LA RECETTE. Une fenêtre de N caractères après la cible déborde
    // sur les suivantes : elle attribuait `perf.json` à la cible `argus-smoke`,
    // trois recettes plus loin. Une recette Make s'arrête à la première ligne
    // qui recommence en colonne 0 — c'est ce qui la délimite, pas une distance.
    const recettes = new Map();
    let courante = null;
    for (const ligne of makefile.split('\n')) {
      const entete = /^(argus-[\w-]+):/.exec(ligne);
      if (entete) { courante = entete[1]; recettes.set(courante, []); continue; }
      if (courante && /^[\t ]/.test(ligne)) recettes.get(courante).push(ligne);
      else if (courante && ligne.trim() !== '') courante = null;
    }
    assert.ok(recettes.size > 5, 'aucune recette Make lue — ce garde ne mesure plus rien');
    const cible = [...recettes.entries()]
      .find(([, lignes]) => lignes.some((l) => l.includes(`scripts/argus/${script}.mjs`)))?.[0];
    if (!cible) { absentes.push(`${script}.mjs → aucune cible Makefile`); continue; }
    // La séquence, c'est LE bloc bash qui va jusqu'au rapport. Il y en a
    // plusieurs qui commencent par `make argus-…` — prendre le premier venu
    // faisait tomber ce garde sur un bloc d'une seule ligne, quelques lignes
    // plus haut. On l'identifie par ce qui le termine, pas par ce qui l'ouvre.
    const bloc = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)]
      .map((m) => m[1]).find((b) => b.includes('make argus-report')) ?? '';
    assert.ok(bloc.includes('make argus-report'),
      'le bloc de séquence du SKILL est introuvable — ce garde ne mesure plus rien');
    if (!bloc.includes(`make ${cible}`)) absentes.push(`${cible} (produit ${script}.json)`);
  }
  assert.deepEqual(absentes, [],
    'dimension(s) que le rapport juge et que la séquence ne lance pas : un run qui suit '
    + 'le skill à la lettre publiera un rapport à moitié muet, sans que rien ne le signale');
});

test('le diagnostic de démarrage sort en CONSOLE, pas seulement dans le rapport (258)', () => {
  // ⚠️ CE POINT A COÛTÉ TROIS PASSES DEVICE À UN RUN. Trois flows mouraient sur
  // « id: <ancre> is visible ». La console ne portait qu'un seul conseil —
  // « relève thresholds.startTimeoutMs » — et il a relevé à 20, 45 puis 90 s ;
  // la pire attente est venue se coller au plafond à 80 ms près à chaque fois.
  // L'app affichait « Service indisponible » et ne démarrait pas du tout.
  //
  // Le bon diagnostic EXISTAIT, exact et hiérarchisé, et nomme cette cause en
  // n° 1 — mais rattaché au champ `actual` d'un finding, donc lisible dans le
  // rapport HTML, à la fin. Les deux textes coexistaient ; seul le mauvais
  // arrivait en premier, par le canal qu'on lit d'abord.
  //
  // ⚠️ LIMITE ASSUMÉE DE CE GARDE : il lit la SOURCE. Le troisième barreau
  // serait d'exécuter run.mjs, qui pilote un device — hors d'atteinte d'ici.
  // Il ne voit donc pas une valeur neutralisée, seulement un débranchement.
  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');

  // Le hint doit être CONSTRUIT une fois et passé aux deux canaux.
  const appels = [...run.matchAll(/startupHint\(/g)].length;
  assert.ok(appels >= 2, `startupHint n'est appelé que ${appels} fois — le garde ne mesure plus rien`);

  // Canal 1 : le finding, pour le rapport.
  assert.match(run, /actual:[\s\S]{0,200}?(startupHint\(|indice)/,
    'le diagnostic ne va plus dans le finding — le rapport perdrait sa cause n° 1');

  // Canal 2 : la console, celui qu'on lit en premier. C'est CELUI qui manquait.
  assert.match(run, /warn\([^)]*indice/,
    'le diagnostic ne sort plus en CONSOLE : un run le lira à la fin, dans le rapport, '
    + 'après avoir suivi le seul conseil que la console lui donne — relever un plafond '
    + 'qui n\'y changera rien');

  // ⚠️ L'AUTRE MOITIÉ : un indice répété à chaque flow en échec n'est plus un
  // indice. Sur une suite où l'app ne démarre pas, il sortirait six fois.
  assert.match(run, /indiceDeDemarrageDit/,
    'plus de garde-fou contre la répétition : l\'indice sortirait à chaque flow');
});

test('le SKILL et le runner prescrivent la MÊME base de dérivation (259)', () => {
  // ⚠️ Deux textes, deux formules, facteur 10 entre elles. Le SKILL disait
  // « dérivé du maximum que tu as observé » (90 053 ms chez un run), le runner
  // « dérive-le de firstLaunchMs » (9 126 ms chez le même). Ni l'un ni l'autre
  // n'était faux séparément : c'est l'écart qui l'était, et aucun test ne
  // pouvait le voir — un écart entre deux textes n'a aucun comportement à
  // casser. Le run a tranché en croisant deux calculs qui tombaient au même
  // endroit ; il n'aurait pas dû avoir à le faire.
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');

  // ⚠️ La grandeur est DÉRIVÉE du runner, jamais citée ici : si elle change, le
  // garde suit et c'est la doc qui doit rattraper.
  const m = /dérive-le de `(\w+)`/.exec(run);
  assert.ok(m, 'le runner ne prescrit plus de base de dérivation — ce garde est vacant');
  const grandeur = m[1];

  // ⚠️ IL FAUT LA PRESCRIPTION, PAS LA MENTION — et c'est le 279 qui l'a montré.
  // Ce garde cherchait le mot `firstLaunchMs` n'importe où ; depuis que le SKILL
  // porte aussi « sur iOS, … PAS de `firstLaunchMs` », cette phrase-là suffisait
  // à le satisfaire. Le mot était présent, la prescription supprimée, et le
  // harnais a rendu VACANT. Un correctif ne supprime pas toujours un mode de
  // panne : parfois il vide le garde du voisin.
  const prescrit = new RegExp(`dérive-le de \`${grandeur}\``, 'i');
  assert.match(skill, prescrit,
    `le SKILL ne PRESCRIT plus « ${grandeur} », la grandeur que le runner prescrit : `
    + 'deux formules concurrentes, et celui qui lit doit arbitrer seul');

  // ⚠️ L'AUTRE MOITIÉ, et c'est elle qui a coûté trois passes device : le SKILL
  // affirmait « ce n'est pas l'instrumentation, c'est le plafond d'attente » —
  // un diagnostic unique là où le runner en imprime trois.
  assert.ok(!/n'est pas l'instrumentation, c'est le plafond/.test(skill),
    'le SKILL réaffirme un diagnostic UNIQUE là où il y a trois causes, et la plus '
    + 'chère — l\'app qui ne démarre pas — n\'est pas celle-là');
  assert.match(skill, /TROIS causes/,
    'le SKILL ne présente plus les trois causes dans l\'ordre du runner');
});

test('un repère chiffré du SKILL ne vient jamais SEUL (276)', () => {
  // ⚠️ LE MÊME DÉFAUT, DEUX FOIS, ET C'EST MOI QUI L'AI ÉCRIT LES DEUX FOIS.
  // Un chiffre mesuré sur un seul terrain, donné comme critère de
  // reconnaissance ou comme budget, fait écarter le bon diagnostic dès que la
  // machine suivante ne le retrouve pas :
  //   · « sature un cœur, 120,6 % » → un run sur hôte partagé mesure 42,9 %
  //     pour le MÊME défaut, et manque de conclure que ce n'en est pas un ;
  //   · « vingt minutes » pour argus-baselines → deux runs se sur-budgètent et
  //     envisagent de couper la contre-épreuve visuelle, seule chose qui prouve
  //     que la comparaison mesure.
  // Corriger le premier chiffre par un second, plus juste, ne suffit pas : la
  // leçon n'est pas la valeur, c'est qu'UNE valeur ne reconnaît rien. Le garde
  // exige donc DEUX mesures distinctes partout où le skill en donne une.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8').split('\n');
  const blocApres = (ancre, n) => {
    const i = skill.findIndex((l) => l.includes(ancre));
    // ⚠️ Sans cette assertion, une reformulation rend le garde VACANT : la
    // recherche échoue, le bloc est vide, et « aucun chiffre » passe pour sain.
    assert.notEqual(i, -1, `ancre introuvable dans le SKILL : « ${ancre} » — reformulée ? mets ce garde à jour`);
    return skill.slice(i, i + n).join('\n');
  };

  const cas = [
    { quoi: 'le tell de la boucle de micro-tâches',
      ancre: 'boucle de micro-tâches', lignes: 14, rx: /\d+[,.]\d+\s*%/g,
      note: "le CPU suit la charge de l'hôte, pas la gravité" },
    { quoi: "le coût d'argus-baselines",
      ancre: "n'est pas l'étape courte du milieu", lignes: 14, rx: /\d+\s*min\s*\d+/g,
      note: 'une durée prise ailleurs fait renoncer à la contre-épreuve' },
  ];

  for (const { quoi, ancre, lignes, rx, note } of cas) {
    const bloc = blocApres(ancre, lignes);
    const mesures = [...new Set(bloc.match(rx) ?? [])];
    assert.ok(mesures.length >= 2,
      `${quoi} : ${mesures.length} mesure(s) citée(s) (${mesures.join(', ') || 'aucune'}). `
      + `Un chiffre seul se lit comme un critère — ${note}. Donne-en deux, pris sur deux terrains, `
      + "ou n'en donne aucun.");
  }
});

test('le geste du troisième temps est ÉCRIT là où il sert (277)', () => {
  // ⚠️ ANNOTER UN ÉLOIGNEMENT N'EST PAS LE CORRIGER. Le skill disait « le
  // raccourci est décrit plus bas, à une centaine de lignes d'ici : c'est
  // pourtant ICI qu'il change quelque chose » — et le run suivant a fait
  // l'aller-retour quand même, puis a écrit mot pour mot que le remède aurait
  // été de DÉPLACER le geste, pas de commenter sa distance.
  //
  // Le garde mesure donc la distance, seule chose qu'une annotation ne change pas.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8').split('\n');
  const enonce = skill.findIndex((l) => l.includes('prouve-la en trois temps'));
  assert.notEqual(enonce, -1, "l'énoncé du troisième temps a été reformulé — mets ce garde à jour");

  const geste = skill.findIndex((l, i) => i > enonce
    && l.trim().startsWith('node ') && l.includes('--tags=visual') && l.includes('--no-install'));
  assert.notEqual(geste, -1,
    'le geste du troisième temps (`--tags=visual --no-install`) n\'est plus écrit APRÈS son énoncé : '
    + 'celui qui contre-éprouve doit le chercher ailleurs, et deux runs ont failli sacrifier la '
    + 'contre-épreuve pour ne pas l\'avoir trouvé');

  const distance = geste - enonce;
  assert.ok(distance <= 25,
    `le geste est à ${distance} lignes de son énoncé — il était à une centaine, et l'annoter n'y `
    + 'avait rien changé. Déplace-le, ne le commente pas.');
});

test('--check imprime la liste des fichiers À TOI, pas seulement leur compte (278)', () => {
  // ⚠️ CONSTAT QUE J'AVAIS DÉMENTI À TORT. Le SKILL promet qu'un fichier déclaré
  // `ARGUS:OWNED` apparaît « dans la liste que l'installeur imprime en sortant,
  // et dans son --check ». La seconde moitié était fausse : le mode check
  // sortait (exit 0/1) des dizaines de lignes avant l'inventaire, et ne rendait
  // qu'un COMPTE agrégé — « 33 fichier(s) conformes ou à toi », où « conforme »
  // et « à toi » sont justement les deux choses qu'on venait distinguer.
  //
  // Mon démenti venait d'une mesure prise sur un terrain EN RETARD, où --check
  // imprime bien une liste : celle des fichiers en retard. J'ai mesuré autre
  // chose que ce que le constat visait. Le garde mesure les DEUX états.
  const installeur = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/scripts/install-mobile.sh');
  const dir = mkdtempSync(join(tmpdir(), 'argus-278-'));
  const check = () => {
    // ⚠️ --check sort en 1 sur un terrain en retard : `execFileSync` lèverait.
    const r = spawnSync('bash', [installeur, dir, '--check'], { encoding: 'utf8' });
    return `${r.stdout ?? ''}${r.stderr ?? ''}`;
  };
  try {
    execFileSync('bash', [installeur, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    // Le fichier que le SKILL décrit : créé par l'utilisateur, dans SON projet,
    // marqueur posé. Il n'existe pas dans le scaffold — c'est tout l'intérêt.
    writeFileSync(join(dir, 'test/argus/argus_fakes.dart'),
      '// ARGUS:OWNED — les doubles de mes écrans\nvoid main() {}\n', 'utf8');
    // Et son jumeau SANS marqueur, qui prouve que la liste discrimine. Sans lui,
    // un inventaire qui imprimerait tout passerait pour un inventaire juste.
    writeFileSync(join(dir, 'test/argus/pas_a_moi.dart'), 'void main() {}\n', 'utf8');

    const ajour = check();
    assert.match(ajour, /qui t'appartiennent/,
      '--check n\'imprime aucun inventaire des fichiers OWNED : celui qui vient de poser un '
      + 'marqueur n\'a aucun moyen de vérifier qu\'il a été pris en compte');
    assert.match(ajour, /argus_fakes\.dart/,
      'un fichier OWNED créé dans le PROJET doit apparaître dans --check — c\'est la promesse du §2b');
    assert.ok(!ajour.includes('pas_a_moi.dart'),
      'un fichier SANS marqueur ne doit pas y apparaître : sinon la liste ne discrimine rien '
      + 'et son vert ne prouve pas que le marqueur sert à quelque chose');

    // ⚠️ ET SUR UN TERRAIN EN RETARD — l'état où j'avais mesuré, et où une AUTRE
    // liste (les fichiers en retard) m'avait fait croire que celle-ci existait.
    writeFileSync(join(dir, 'scripts/argus/run.mjs'),
      `${readFileSync(join(dir, 'scripts/argus/run.mjs'), 'utf8')}\n// périmé\n`, 'utf8');
    const enRetard = check();
    assert.match(enRetard, /en retard sur le plugin/,
      'le montage est cassé : le terrain devait être en retard');
    assert.match(enRetard, /argus_fakes\.dart/,
      'la liste OWNED disparaît dès qu\'un fichier est en retard — c\'est exactement l\'état où '
      + 'j\'ai mesuré, et où la liste des fichiers EN RETARD se fait passer pour elle');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('le TODO du retour à l\'accueil DIT qu\'il ne couvre pas les écrans nommés (280)', () => {
  // ⚠️ UN TODO PLACÉ DANS UNE BRANCHE QUI NE S'EXÉCUTE PAS POUR LE CAS QU'ON
  // CROIT TRAITER. La branche « ramener l'app à l'accueil » est gardée par
  // `SCREEN_ID === '' || SCREEN_ID === ARGUS_START_SCREEN` : pour un `goto`
  // vers un écran NOMMÉ elle est sautée, et c'est la branche du bas qui décide.
  // Un run l'a rempli en croyant traiter le cas général ; son écran n'a pas été
  // atteint et l'échec est sorti trois étapes plus loin, en accusant une ancre
  // présente. Coût : un flow rouge et ~160 s de device.
  const goto = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/_subflows/goto.yaml'), 'utf8');

  // ⚠️ On ÉVALUE la condition du fichier, on ne cite pas son texte : si elle
  // change, le garde suit. La citer le rendrait vrai par construction.
  const m = /true: "\$\{(\(typeof SCREEN_ID[^"]*?)\}"/.exec(goto);
  assert.ok(m, 'la condition de la branche « écran de départ » a changé de forme — ce garde ne mesure plus rien');
  // eslint-disable-next-line no-new-func
  const evalue = new Function('SCREEN_ID', 'ARGUS_START_SCREEN', 'ARGUS_ANCHOR_HOME', `return ${m[1]};`);

  assert.equal(evalue('', 'home', 'home_root'), true, 'un SCREEN_ID vide doit entrer dans la branche');
  assert.equal(evalue('home', 'home', 'home_root'), true, "et l'écran de départ demandé aussi");
  assert.equal(evalue('profile', 'home', 'home_root'), false,
    'un écran NOMMÉ ne doit pas entrer dans cette branche — si ce garde tombe ici, le contrat a '
    + 'changé et le TODO doit être relu, pas ce test');

  // Le TODO vit donc dans une branche partielle : il doit le DIRE, puisque rien
  // dans son voisinage immédiat ne permet de le deviner.
  const lignes = goto.split('\n');
  const iTodo = lignes.findIndex((l) => l.includes("TODO(argus): le retour à l'écran de départ"));
  assert.notEqual(iTodo, -1, 'le TODO du retour à l\'accueil a été reformulé — mets ce garde à jour');
  // 20 lignes : le TODO a gagné l'avertissement sur `back` (318), qui vit entre
  // la mention du périmètre et lui. Mesuré (écart 16), pas élargi au hasard.
  const voisinage = lignes.slice(Math.max(0, iTodo - 20), iTodo).join('\n');
  assert.match(voisinage, /écran NOMMÉ|écrans nommés/,
    'le TODO ne dit pas qu\'il ne couvre PAS les écrans nommés : celui qui le remplit croira '
    + 'traiter le cas général, et son flow échouera trois étapes plus loin sur une ancre saine');
});

test('une ancre connue de screens[] mais pas du harness est DISTINGUÉE (281)', () => {
  // ⚠️ « QUE RIEN NE DÉCLARE » ÉTAIT FAUX POUR LA MOITIÉ DES CAS. Le croisement
  // ne lit que harness.dart — à raison : « déclaré » veut dire « monté par
  // l'étage 1 », et une ancre que seul `screens[]` connaît sert au device.
  // Mais le message rendait ce vrai signal indéchiffrable : un run a lu
  // « RIEN », a trouvé ses deux ancres écrites noir sur blanc dans `screens[]`,
  // et a conclu que l'outil se trompait.
  const config = { screens: [{ id: 'profile', anchor: 'profile_root' }, { id: 'home', anchor: 'home_root' }] };

  const melange = ancresOrphelinesReport(['profile_root', 'jamais_vue'], config).join('\n');
  assert.match(melange, /screens\[\]/,
    'le message doit nommer screens[] quand l\'ancre y est : sans ça, « rien ne la déclare » '
    + 'contredit ce que le lecteur a sous les yeux');
  assert.ok(!/que RIEN ne déclare/.test(melange),
    'le message ne peut plus affirmer que RIEN ne la déclare — c\'est faux dès qu\'elle est en config');
  assert.match(melange, /harness\.dart/,
    'et il doit dire OÙ la déclaration manque, sinon le remède reste à deviner');

  // ⚠️ L'AUTRE MOITIÉ, sinon un correctif qui explique tout à tout le monde
  // passerait : une ancre que PERSONNE ne connaît ne doit pas recevoir
  // l'explication sur screens[], qui l'enverrait chercher une ligne inexistante.
  const inconnues = ancresOrphelinesReport(['jamais_vue'], config).join('\n');
  assert.ok(!/screens\[\]/.test(inconnues),
    'une ancre absente de screens[] ne doit pas recevoir l\'explication sur screens[] : '
    + 'elle irait chercher une déclaration qui n\'existe nulle part');
  assert.match(inconnues, /allowUndeclared/, 'les deux issues restent offertes dans tous les cas');

  // Le compte reste juste quelle que soit la répartition.
  for (const [quoi, msg] of [['mélange', melange], ['inconnues', inconnues]]) {
    const n = Number((/^(\d+) ancre\(s\)/.exec(msg) ?? [])[1]);
    assert.ok(Number.isFinite(n), `${quoi} : le message ne porte plus le compte`);
  }
  assert.match(melange, /^2 ancre\(s\)/, 'deux orphelines doivent se compter deux');

  // ⚠️ ET LE CÂBLAGE : le site d'appel doit INTERROGER la fonction, pas
  // recopier son texte — sinon les deux divergent et le garde tient la copie
  // morte pour la vraie.
  const conf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs'), 'utf8');
  // ⚠️ ANCRÉ SUR L'USAGE, PAS SUR LE NOM. La première version de ce garde
  // cherchait `ancresOrphelinesReport(orphelines, config)` — motif que la
  // DÉCLARATION de la fonction contient mot pour mot. Il restait donc vert avec
  // le site d'appel supprimé : le harnais l'a rendu VACANT, et c'est ainsi qu'on
  // l'a su. C'est le piège du nom nu, dans le garde même censé voir le câblage.
  assert.match(conf, /for \(const ligne of ancresOrphelinesReport\(/,
    '--check-anchors n\'appelle plus ancresOrphelinesReport : la fonction peut rester juste '
    + 'pendant que la commande imprime autre chose');
});

test('le nombre de flows annoncé par le SKILL est celui du scaffold (282)', () => {
  // ⚠️ UN COMPTEUR ÉCRIT À LA MAIN QUE LA SOURCE PEUT FOURNIR. Le §3c annonçait
  // « sept fichiers » ; il y en a huit. Un compteur faux s'affiche exactement
  // comme un compteur juste : rien ne lève, aucun test ne rougit, et le lecteur
  // qui compte ses fichiers conclut qu'il en a un de trop.
  //
  // Le garde ne fige pas « huit » : il DÉRIVE le compte du scaffold et le
  // compare à ce que la phrase annonce. Figer la valeur le rendrait faux au
  // prochain flow ajouté — c'est-à-dire exactement le défaut qu'il ferme.
  const flowsDir = join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro');
  const fichiers = [];
  const parcourir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const chemin = join(d, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (e.name.endsWith('.yaml')) fichiers.push(chemin);
    }
  };
  parcourir(flowsDir);
  assert.ok(fichiers.length > 0, 'aucun flow trouvé : le montage est cassé, pas le SKILL');
  const owned = fichiers.filter((f) => readFileSync(f, 'utf8').split('\n').slice(0, 20)
    .some((l) => l.includes('ARGUS:OWNED')));
  assert.ok(owned.length > 0, 'aucun flow ARGUS:OWNED : le marqueur a changé, mets ce garde à jour');

  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const ligne = skill.split('\n').find((l) => l.includes('les flows `ARGUS:OWNED`'));
  assert.ok(ligne, 'la ligne du tableau qui annonce les flows a été reformulée — mets ce garde à jour');

  const MOTS = { un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12 };
  const m = /\b([a-zéêè]+)\s+fichiers\b/.exec(ligne);
  assert.ok(m, `la ligne n'annonce plus un nombre de fichiers : « ${ligne} »`);
  const annonce = MOTS[m[1]] ?? Number(m[1]);
  assert.ok(Number.isFinite(annonce), `« ${m[1]} » n'est pas un nombre connu de ce garde`);

  assert.equal(annonce, owned.length,
    `le SKILL annonce ${annonce} flows ARGUS:OWNED, le scaffold en porte ${owned.length} `
    + `(${owned.map((f) => basename(f)).sort().join(', ')}). Un compteur périmé s'affiche `
    + 'exactement comme un compteur juste.');
});

test('toute consigne de DEMANDER offre son repli sans interlocuteur (283)', () => {
  // ⚠️ TROIS RUNS SUCCESSIFS ONT TRANCHÉ SEULS, et aucun n'avait tort : le §2c
  // disait « demande confirmation avant d'éditer du code applicatif » pendant
  // que le §1 disait « ne t'arrête PAS pour demander ». Entre 111 et 257 lignes
  // ajoutées au code de quelqu'un, chacun avec sa propre règle. La
  // contradiction était dans le skill, pas dans leur jugement.
  //
  // Le garde ne vise pas CETTE phrase-là : il balaie toutes les injonctions de
  // demander et exige que chacune dise quoi faire quand personne ne répond.
  // Étroit-plus-ce-qu'on-a-vu laisserait passer la prochaine.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8').split('\n');

  const INJONCTION = /\*\*Demande confirmation|\bNe tranche pas seul\b/;
  const sites = skill.map((l, i) => (INJONCTION.test(l) ? i : -1)).filter((i) => i >= 0);
  // ⚠️ Sans cette assertion, une reformulation vide le garde en silence : zéro
  // site, zéro boucle, zéro assertion, et le vert ne dit plus rien.
  assert.ok(sites.length >= 2,
    `${sites.length} injonction(s) de demander trouvée(s) dans le SKILL — il y en avait deux. `
    + 'Reformulées ? mets ce garde à jour plutôt que de le laisser mesurer le vide.');

  // ⚠️ DEUX FAÇONS DONT CE GARDE A ÉTÉ VACANT, ET LA MUTATION A TROUVÉ LES DEUX.
  // 1. Chercher « sans interlocuteur » acceptait le TITRE — qui pose le cas sans
  //    le trancher : retirer la réponse laissait le garde vert.
  // 2. Chercher un verbe seul acceptait « un run qui INSTRUMENTE sans le dire »,
  //    une phrase du paragraphe voisin qui ne prescrit rien.
  // Le critère est donc STRUCTUREL : il faut UNE MÊME LIGNE qui porte à la fois
  // le cas (personne ne répond) et le geste. Une prose qui parle du cas ailleurs
  // et d'un geste ailleurs ne prescrit rien.
  const CAS = /répond|interlocuteur|non interactif|en attendant/i;
  const GESTE = /\b(instrumente|tranche|inscris|poursuis|publie)\b/i;
  for (const i of sites) {
    const paragraphe = skill.slice(i, i + 30);
    const prescrit = paragraphe.some((l) => CAS.test(l) && GESTE.test(l));
    assert.ok(prescrit,
      `« ${skill[i].trim().slice(0, 70)}… » (ligne ${i + 1}) demande sans dire quoi faire si personne `
      + 'ne répond. Le §1 prescrit de trancher ; une consigne qui l\'ignore fait décider chaque '
      + 'run à sa façon, sur le code de quelqu\'un d\'autre. Il faut une ligne qui nomme le cas ET '
      + 'donne le geste.');
  }

  // ⚠️ L'AUTRE MOITIÉ : lever la contradiction ne doit pas supprimer la
  // prudence. Le repli doit BORNER ce qu'on s'autorise, sinon « tranche seul »
  // devient un permis de refactorer.
  const iCode = skill.findIndex((l) => /\*\*Demande confirmation avant d'éditer du code applicatif\*\*/.test(l));
  assert.notEqual(iCode, -1, 'la consigne sur le code applicatif a été reformulée — garde à mettre à jour');
  // 40 lignes : le repli a gagné son exception nommée (302), et la phrase sur le
  // compte rendu vit désormais à +35. Mesuré, pas élargi au hasard.
  const bloc = skill.slice(iCode, iCode + 40).join(' ').replace(/\s+/g, ' ');
  assert.match(bloc, /Semantics/,
    'le repli doit dire CE QU\'ON S\'AUTORISE : sans borne, « tranche seul » autorise tout');
  assert.match(bloc, /rapport/,
    'et exiger que ce qui a été touché soit rendu — sinon quelqu\'un découvre le diff sans '
    + 'savoir d\'où il vient');
});

test('le §3g-bis connaît la page MORTE, et lit avant de renommer (284, 292)', () => {
  // ⚠️ DEUX RUNS L'ONT RENCONTRÉ LE MÊME JOUR. Le paragraphe de publication ne
  // connaissait que « une URL » et « pas d'URL » : une URL déclarée dont la
  // page a été supprimée n'avait aucun cas, et `report.mjs` continuait
  // d'annoncer « à REPUBLIER sur <url morte> ».
  //
  // Et le point 5 se retournait dans ce cas : « lis son titre actuel d'abord »
  // suppose que la page existe. Un run a renseigné `artifact.title` d'un titre
  // INVENTÉ avant de découvrir que l'URL était morte — il avait suivi le point 5
  // avant le point 3.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const i = skill.indexOf('**g bis. Publier le rapport');
  assert.notEqual(i, -1, 'le §3g-bis a été renommé — mets ce garde à jour');
  const j = skill.indexOf('**h. Récapitule', i);
  assert.ok(j > i, 'la fin du §3g-bis est introuvable : ce garde mesurerait tout le fichier');
  const para = skill.slice(i, j).replace(/\s+/g, ' ');

  // Le troisième cas existe, et il dit les trois gestes qui le composent.
  // ⚠️ Le motif doit désigner le CAS, pas une tournure qui vit ailleurs dans le
  // paragraphe : « n'existe plus » y apparaît deux fois, et la première version
  // de ce garde restait verte avec le troisième cas retiré.
  assert.match(para, /TROISIÈME CAS/,
    'le §3g-bis ne connaît toujours que « présente » et « absente » : une page supprimée '
    + 'n\'a aucun cas, et deux runs s\'y sont arrêtés');
  assert.match(para, /action: "list"/,
    'le troisième cas doit dire comment VÉRIFIER la disparition — un read qui échoue peut '
    + 'aussi être un droit manquant');
  assert.match(para, /[Nn]e devine pas/,
    'et interdire de deviner la page qui la remplace : republier « sur celle qui ressemble » '
    + 'écrase le travail d\'un autre run');

  // ⚠️ ET L'ORDRE : le read AVANT artifact.title. Sans lui, le point 5 fait
  // inventer un titre pour une page qui n'existe pas.
  const iTitre = para.indexOf('LIS SON TITRE ACTUEL');
  assert.notEqual(iTitre, -1, 'la consigne de titre a été reformulée — garde à mettre à jour');
  const bloc = para.slice(iTitre, iTitre + 1400);
  assert.match(bloc, /le `read` D'ABORD|si le `read` échoue|Si le `read` échoue/,
    'le point 5 ne dit pas qu\'il vient APRÈS le read : suivi dans l\'autre sens, il fait '
    + 'renseigner artifact.title d\'un titre inventé pour une page morte');
});

test('le SKILL donne le GESTE des doubles, et la boucle est dite là où on les écrit (285)', () => {
  // ⚠️ LE SEUL « DÉBROUILLE-TOI » DU PARCOURS. Le §2c disait OÙ poser les
  // doubles et jamais COMMENT les écrire — or c'est ce que la plupart des
  // projets Flutter/BLoC devront produire, et un run y a passé une dizaine de
  // minutes à deviner.
  //
  // ⚠️ Et c'est ICI que se décide la boucle de micro-tâches — `Future.value(null)`
  // contre `Completer()` — pas au §3g, où elle n'est décrite que comme symptôme :
  // un run l'a heurtée au PREMIER `argus-anchors`, cinq minutes après avoir
  // écrit son premier double.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8').split('\n');
  const i = skill.findIndex((l) => l.includes('Où poser les doubles de test'));
  assert.notEqual(i, -1, 'le paragraphe des doubles a été reformulé — mets ce garde à jour');

  // Le geste est écrit AVANT ou AUTOUR de « où les poser » : on prend large et
  // on borne au paragraphe suivant plutôt que de deviner un ordre.
  // 60 lignes en amont : le paragraphe a gagné la forme mocktail du défaut
  // (328), qui s'intercale entre le geste et l'ancre. Mesuré (écart max 49),
  // pas élargi au hasard — une fenêtre devinée redeviendrait fausse au prochain
  // ajout, et c'est ainsi qu'un garde meurt sans qu'on l'ait voulu.
  const bloc = skill.slice(Math.max(0, i - 60), i + 20).join(' ').replace(/\s+/g, ' ');

  for (const [quoi, rx] of [
    // ⚠️ `extends` : sans lui, le motif matche la MENTION de MockCubit dans le
    // commentaire voisin, et le garde survit au retrait du code lui-même.
    ['le double d\'un bloc', /extends MockBloc<|extends MockCubit</],
    ['le stub de son état', /whenListen\(/],
    ['le double d\'un repository', /extends Mock implements/],
  ]) {
    assert.match(bloc, rx,
      `${quoi} n'est pas montré : le §2c dit où poser les doubles sans dire comment les écrire, `
      + 'et c\'est le seul endroit du parcours où le skill laisse deviner');
  }

  // ⚠️ LE CHOIX QUI DÉCIDE, au même endroit que l'écriture du double.
  assert.match(bloc, /Completer/,
    'le choix `Future.value(null)` contre `Completer()` n\'est pas dit là où l\'on écrit le '
    + 'double : c\'est pourtant là qu\'il se prend, et un run a payé une commande qui ne rend '
    + 'jamais la main cinq minutes après avoir écrit le sien');
  assert.match(bloc, /micro-tâches/i,
    'et il faut nommer le phénomène, sinon celui qui le rencontrera ne fera pas le lien');
});

test('le dépannage de build a son pendant iOS, pas seulement Android (286)', () => {
  // ⚠️ TROIS ÉCRANS DE DIAGNOSTIC, TOUS ANDROID. Le §3g décrivait
  // `INSTALL_FAILED_INSUFFICIENT_STORAGE`, le ciblage d'ABI et le marqueur dans
  // `kernel_blob.bin` — et rien pour l'autre plateforme. Un run iOS s'est
  // arrêté sur un échec (`native assets … references objective_c`) dont le
  // symptôme ne ressemble à rien de ce qui est décrit, et l'a résolu seul.
  //
  // C'est l'asymétrie du § « ajouter un contrôle d'un côté sans le répliquer
  // de l'autre » : une omission, pas un choix. Le garde vérifie la PARITÉ des
  // gestes dont les deux plateformes ont besoin.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');

  const PAIRES = [
    { quoi: 'désinstaller pour libérer la place',
      android: /adb -s <udid> uninstall/, ios: /xcrun simctl uninstall/ },
    { quoi: 'compter un marqueur dans le binaire',
      android: /flutter-apk\/app-debug\.apk/, ios: /App\.framework\/flutter_assets\/kernel_blob\.bin/ },
  ];
  for (const { quoi, android, ios } of PAIRES) {
    // ⚠️ D'abord le côté Android : s'il a disparu, ce garde compare deux
    // absences et son vert ne dit rien.
    assert.match(skill, android, `« ${quoi} » : le geste Android a disparu — ce garde ne compare plus rien`);
    assert.match(skill, ios,
      `« ${quoi} » n'a pas son pendant iOS. Un run iOS doit alors le retrouver seul, et le `
      + 'symptôme qu\'il rencontre ne ressemble à rien de ce que le skill décrit.');
  }

  // Et l'échec de build propre à iOS, qui n'a aucun équivalent Android.
  assert.match(skill, /native assets/,
    'l\'échec `native assets … references objective_c` n\'est nulle part : il est fréquent '
    + 'après un changement de dépendances, ne nomme aucun coupable utile, et se résout par '
    + 'le geste qu\'on essaie en dernier');
  assert.match(skill, /flutter clean && flutter pub get/,
    'et son remède doit être écrit à côté, sinon le diagnostic ne sert à rien');
});

test('la coquille qui EST l\'écran de départ a sa case dans la table (287)', () => {
  // ⚠️ « Une coquille n'est pas un écran, donc pas d'ancre » est vrai d'une
  // barre d'onglets et FAUX du conteneur qui rend l'accueil : c'est lui que
  // tout flow atteint au lancement, donc il lui faut une ancre — sans quoi
  // `launch-clean.yaml` n'a rien à attendre et chaque flow tape pendant le sas
  // de démarrage. Un run a buté dessus faute de case où se ranger.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8').split('\n');
  const lignes = skill.filter((l) => /^\| Coquille/.test(l));
  assert.equal(lignes.length, 2,
    `${lignes.length} ligne(s) « Coquille » dans la table des écarts légitimes. Il en faut deux : `
    + 'ce qu\'une coquille EST (une barre : pas un écran) et ce qu\'elle FAIT (rendre l\'accueil : '
    + 'alors c\'est aussi un écran).');

  const [barre, depart] = lignes;
  // La barre reste hors de screens[] ; la coquille de départ y entre AVEC ancre.
  assert.match(barre, /non/, 'la coquille ordinaire doit rester hors de screens[]');
  assert.match(depart, /écran de départ/i, 'la seconde ligne doit être celle de la coquille de départ');
  assert.match(depart, /\*\*oui\*\*, avec `anchor:`/,
    'la coquille qui rend l\'accueil doit entrer dans screens[] AVEC une ancre : c\'est elle '
    + 'que launch-clean.yaml attend');
});

test('le périmètre a une règle d\'arrêt, et l\'écran à horloge un critère (288)', () => {
  // ⚠️ AUCUNE RÈGLE D'ARRÊT CÔTÉ ÉCRANS. Un run en a retenu 8 sur ~13 sans
  // pouvoir dire pourquoi ceux-là, et en a passé 6 en `visual: false` — à
  // raison — sans que le skill lui donne le critère.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');

  const i = skill.indexOf('La règle d\'arrêt ne porte pas sur les écrans');
  assert.notEqual(i, -1,
    'le SKILL ne dit toujours pas jusqu\'où va le périmètre : chaque run choisit alors le sien '
    + 'et personne ne peut le reconstituer après coup');
  // ⚠️ APLATIR LES BLANCS. Le markdown est enveloppé à ~78 colonnes : « deux
  // fois de suite » y vit sur deux lignes, et un motif multi-mots ne le trouve
  // pas. Un garde de prose qui ne normalise pas rougit sur un simple
  // re-formatage — ou reste vert sur autre chose que ce qu'il croit lire.
  const bloc = skill.slice(i, i + 2600).replace(/\s+/g, ' ');

  // La distinction qui EST la règle : l'étage 1 ne coûte pas de device.
  assert.match(bloc, /Étage 1 : pas de règle d'arrêt/,
    'la règle doit dire que l\'étage 1 prend tout : un écran laissé dehors n\'est pas économisé, '
    + 'il est non mesuré');
  assert.match(bloc, /deux fois de suite/,
    'et l\'étage 2 doit reprendre le critère du quatrième cas — un flow qui n\'y arrive pas deux '
    + 'fois de suite produit une suite intermittente');

  // Le critère de l'écran à horloge, et la nuance qui évite de tout jeter.
  assert.match(bloc, /visual: false/,
    'le critère de l\'écran dont le contenu suit l\'horloge n\'est pas donné : sa référence '
    + 'rougirait le lendemain sans qu\'une ligne ait changé');
  assert.match(bloc, /mask-dynamic/,
    'et il faut dire que masquer la zone mouvante vaut mieux que renoncer à l\'écran entier');

  // ⚠️ La clé prescrite doit EXISTER : une consigne qui nomme une clé morte est
  // pire que pas de consigne. Le runner filtre bien sur `visual !== false`.
  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  assert.match(run, /s\.visual !== false/,
    'le runner ne filtre plus sur `visual` : le SKILL prescrirait une clé que plus rien ne lit');
});

test('générer les références reste faisable quand un flow gèle (289)', () => {
  // ⚠️ LE CAS N'AVAIT PAS DE GESTE. `argus-baselines` rejoue la suite
  // fonctionnelle avant de produire les captures ; un flow qui GÈLE — 6 min 20
  // par passage sur un terrain réel, sur un défaut de l'app déjà identifié —
  // multiplie ce coût, et la contre-épreuve visuelle devient la première chose
  // qu'on sacrifie. Le §3g l'autorisait « en esprit » sans donner la commande,
  // et un run a dû la trouver seul.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const i = skill.indexOf('UN FLOW CONNU-ROUGE');
  assert.notEqual(i, -1,
    'le SKILL ne dit toujours pas quoi faire quand un flow gelé rend la génération infaisable');
  const bloc = skill.slice(i, i + 1400).replace(/\s+/g, ' ');

  assert.match(bloc, /--exclude-tags=/,
    'le geste doit être ÉCRIT, pas suggéré : c\'est ce qui manquait');
  // ⚠️ Les deux conditions, sans lesquelles le raccourci devient une échappatoire.
  assert.match(bloc, /known_issues\.dart/,
    'sans l\'inscription en dette, on n\'exclut pas le flow : on le CACHE');
  assert.match(bloc, /dernier run avant `argus-report` doit rester complet/,
    'et le rapport publierait un périmètre amputé sous un bandeau que personne ne lit');

  // ⚠️ Et le drapeau prescrit doit EXISTER dans le runner.
  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  assert.match(run, /'--exclude-tags'/,
    'le runner ne connaît plus --exclude-tags : le SKILL prescrirait un drapeau mort');
});

test('l\'avertissement sur les captures peut se FERMER (291)', () => {
  // ⚠️ IL SORTAIT À CHAQUE EXÉCUTION — une dizaine de fois par run — sans
  // qu'aucune clé n'enregistre qu'on avait vérifié. Un avertissement qu'on ne
  // peut pas acquitter finit ignoré, et il emmène les autres avec lui : c'est
  // ce que le skill reproche aux TODO sans objet, appliqué à sa propre sortie.
  const base = {
    app: { id: 'com.exemple' }, thresholds: { visualMatchPercentage: 95 }, screens: [],
    artifact: { enabled: true, evidence: 'all' },
  };
  const avertissements = (/** @type {any} */ patch) => (validateConfig({
    ...base, artifact: { ...base.artifact, ...patch },
  }) ?? []).filter((/** @type {any} */ p) => /captures d/.test(p.message));

  assert.equal(avertissements({}).length, 1,
    'sans acquittement, l\'avertissement doit sortir — sinon ce garde ne mesure rien');
  assert.equal(avertissements({ evidenceAcknowledged: 'app interne, aucune donnée client' }).length, 0,
    'une raison inscrite doit le fermer : c\'est tout l\'objet du correctif');

  // ⚠️ L'AUTRE MOITIÉ, et c'est elle qui empêche l'échappatoire : un
  // acquittement VIDE ne ferme rien. Sinon la clé devient un interrupteur qu'on
  // pose sans réfléchir, ce que « écris la raison » servait à empêcher.
  assert.equal(avertissements({ evidenceAcknowledged: '   ' }).length, 1,
    'un acquittement blanc ne doit rien fermer : la valeur est la RAISON, pas un booléen');

  // Et le vrai remède quand les captures ne doivent pas partir reste offert.
  assert.equal(avertissements({ evidence: 'none' }).length, 0,
    'evidence: none n\'envoie aucune capture, donc n\'a rien à faire acquitter');

  // Le message doit dire les DEUX issues, sinon on acquitte ce qu'il fallait couper.
  const msg = avertissements({})[0].message;
  assert.match(msg, /evidenceAcknowledged/, 'le message doit nommer la clé qui le ferme');
  assert.match(msg, /evidence: none/,
    'et rappeler que si les captures ne doivent PAS partir, l\'acquittement est la mauvaise porte');
});

test('trois choses écrites là où elles servent (293, 294, 295)', () => {
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const lignes = skill.split('\n');
  const ligneDe = (rx, quoi) => {
    const i = lignes.findIndex((l) => rx.test(l));
    assert.notEqual(i, -1, `${quoi} : introuvable — reformulé ? mets ce garde à jour`);
    return i;
  };

  // ── 293 : la page se publie telle quelle ─────────────────────────────────
  // ⚠️ Un run s'est arrêté entre deux consignes : l'outil de publication
  // réclamait une passe de conception, le §3g-bis disait de publier tel quel.
  // Il l'a signalé sans le résoudre, faute d'arbitrage écrit.
  const i293 = skill.indexOf('SE PUBLIE TEL QUEL');
  assert.notEqual(i293, -1,
    'le §3g-bis ne tranche pas la question de réécrire la page : un run s\'y est arrêté');
  const bloc293 = skill.slice(i293, i293 + 1400).replace(/\s+/g, ' ');
  assert.match(bloc293, /application\/json/,
    'la raison doit être dite : la page porte son historique, et le réécrire le détruit '
    + 'en silence — sans le pourquoi, la consigne se lit comme une préférence');

  // ── 294 : le diagnostic de démarrage, dans la SÉQUENCE ────────────────────
  // ⚠️ La liste des trois causes est excellente et imprimée par le runner au bon
  // moment ; dans la DOC elle vivait à des centaines de lignes de la séquence.
  const sequence = ligneDe(/^make argus-report\s+# rapport HTML/, 'la séquence de commandes');
  const renvoi = ligneDe(/NE DEVINE PAS : LE RUNNER TE/, 'le renvoi vers le diagnostic du runner');
  const detail = ligneDe(/TROIS causes, et la plus chère/, 'le détail des trois causes');
  assert.ok(renvoi - sequence > 0 && renvoi - sequence < 40,
    `le renvoi vers le diagnostic est à ${renvoi - sequence} lignes de la séquence : c'est là `
    + 'qu\'on lance argus-run, donc là qu\'il faut savoir que le runner donne l\'ordre');
  assert.ok(detail > renvoi,
    'le détail doit rester APRÈS le renvoi — on le lit quand on dépanne, pas quand on lance');

  // ── 295 : le piège du clavier, hors de l'enclave Android ──────────────────
  // ⚠️ « hideKeyboard referme une feuille modale sur iOS » était logé ENTRE deux
  // paragraphes sur la taille des APK Android : un piège de flow iOS rangé dans
  // le dépannage de build d'une autre plateforme.
  const clavier = ligneDe(/`hideKeyboard` REFERME UNE FEUILLE MODALE/, 'le piège du clavier');
  const depannageAndroid = ligneDe(/CE QUI SUIT EST ANDROID/, 'le dépannage de build');
  assert.ok(clavier < depannageAndroid,
    `le piège du clavier (ligne ${clavier + 1}) est encore dans le dépannage de build Android `
    + `(ligne ${depannageAndroid + 1}) : c'est un piège de FLOW, et le ranger là le rend `
    + 'introuvable pour qui écrit ses flows');

  // Et il reste collé à son remplaçant : le proscrire sans remède laisse le
  // problème entier — un clavier ouvert recouvre le bouton de validation.
  const remede = ligneDe(/ET IL FAUT BIEN REFERMER CE CLAVIER/, 'le remplaçant de hideKeyboard');
  assert.ok(remede - clavier > 0 && remede - clavier < 12,
    `le remède est à ${remede - clavier} lignes de l'interdiction : les deux se lisent ensemble `
    + 'ou pas du tout');
});

test('un fichier de config posé mais non CÂBLÉ est détecté sans device (297)', () => {
  // ⚠️ LE HARNAIS SAVAIT QUE ÇA ARRIVE SANS SAVOIR LE DIRE. `startupHint`
  // orientait vers la capture — « si elle montre une erreur de l'app, aucun
  // plafond n'y changera rien » — et son commentaire citait le cas exact :
  // « Service indisponible faute d'un fichier de configuration absent du
  // bundle ». Il évitait la fausse piste sans jamais nommer la cause. Un run l'a
  // payé six flows rouges et ~36 min d'appareil, pour un défaut détectable en
  // millisecondes et SANS device.
  const dir = mkdtempSync(join(tmpdir(), 'argus-297-'));
  const ecrire = (rel, contenu) => {
    mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
    writeFileSync(join(dir, rel), contenu, 'utf8');
  };
  try {
    // Le défaut du run 38, reconstitué : le plist est là, le projet Xcode l'ignore.
    ecrire('ios/Runner/GoogleService-Info.plist', '<plist/>\n');
    ecrire('ios/Runner.xcodeproj/project.pbxproj', '/* objects */ Runner.app; Info.plist;\n');
    const casse = configNonEmbarquee(dir, {});
    assert.equal(casse.length, 1, `un seul finding attendu, reçu ${JSON.stringify(casse)}`);
    assert.match(casse[0].fichier, /GoogleService-Info\.plist/);
    assert.match(casse[0].cable, /project\.pbxproj/,
      'le finding doit nommer la DÉCLARATION qui manque, pas seulement le fichier — sinon le '
      + 'remède reste à deviner');

    // ⚠️ L'AUTRE MOITIÉ, et c'est elle qui décide de la valeur du contrôle : une
    // fois câblé, il se TAIT. Un contrôle qui alarme toujours est du bruit, et
    // le bruit finit ignoré — il emmène les autres avec lui (cf. 291).
    ecrire('ios/Runner.xcodeproj/project.pbxproj', '/* objects */ GoogleService-Info.plist;\n');
    assert.deepEqual(configNonEmbarquee(dir, {}), [],
      'un fichier correctement câblé ne doit RIEN produire');

    // Et un projet qui n'a pas le fichier du tout n'est pas en défaut : c'est la
    // PRÉSENCE qui déclenche, jamais une supposition sur ce que le projet utilise.
    const vide = mkdtempSync(join(tmpdir(), 'argus-297-vide-'));
    try {
      assert.deepEqual(configNonEmbarquee(vide, {}), [],
        'un projet sans aucun de ces fichiers ne doit rien produire');
    } finally { rmSync(vide, { recursive: true, force: true }); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('le contrôle de config est un MÉCANISME, pas une liste Firebase (297)', () => {
  // ⚠️ C'EST LA MOITIÉ QUI COMPTE, et elle vient d'une objection de Germinator :
  // « on spécifie seulement firebase, mais il pourrait y avoir d'autres fichiers
  // de config ». Coder `si Firebase` reproduirait le défaut que ce dépôt
  // reproche ailleurs — énumérer les défauts CONNUS au lieu de mesurer le
  // PHÉNOMÈNE — et rendrait « 0 » sur le quatrième fichier que personne n'avait
  // imaginé. Le garde vérifie donc que la table est de la DONNÉE et qu'un projet
  // peut la compléter.
  assert.ok(CONFIG_FILES.length >= 2,
    'la table livrée est vide ou dégénérée — ce garde ne mesurerait rien');
  for (const r of CONFIG_FILES) {
    assert.ok(r.id && r.quoi && r.cable && r.casse,
      `règle incomplète (${r.id}) : il faut QUOI chercher, QUELLE déclaration câble, et ce qui CASSE`);
  }
  // La table ne parle pas que de Firebase : le mécanisme doit déjà servir à
  // autre chose, sinon rien ne prouve qu'il est générique.
  assert.ok(CONFIG_FILES.some((r) => !/firebase/i.test(r.id)),
    'toutes les règles livrées sont Firebase : le mécanisme n\'est alors qu\'un `if` déguisé, '
    + 'et il rendra « 0 » sur le prochain fichier de config d\'une autre nature');

  // ⚠️ ET UN PROJET DOIT POUVOIR AJOUTER LA SIENNE — c'est la vraie réponse à
  // « il y a d'autres fichiers », qui est vraie et le restera.
  const dir = mkdtempSync(join(tmpdir(), 'argus-297-ext-'));
  try {
    mkdirSync(join(dir, 'config'), { recursive: true });
    writeFileSync(join(dir, 'config/maison.json'), '{}', 'utf8');
    writeFileSync(join(dir, 'pubspec.yaml'), 'name: x\n', 'utf8');
    const regleProjet = {
      id: 'maison',
      quoi: 'config/maison.json',
      cable: 'pubspec.yaml',
      casse: 'le service maison ne démarre pas',
    };
    const vus = configNonEmbarquee(dir, { configFiles: [regleProjet] });
    assert.equal(vus.length, 1,
      'une règle déclarée par le projet doit être appliquée : sans ça, la table livrée est un '
      + 'plafond et non un point de départ');
    assert.equal(vus[0].id, 'maison');

    // Et elle se tait aussi quand c'est câblé — même exigence que pour les nôtres.
    writeFileSync(join(dir, 'pubspec.yaml'), 'name: x\nassets:\n  - config/maison.json\n', 'utf8');
    assert.deepEqual(configNonEmbarquee(dir, { configFiles: [regleProjet] }), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  // ⚠️ LE CÂBLAGE, aux DEUX sites : le rapport (sec.mjs, sans device) et le
  // signal précoce (config.mjs au §3d). Le second est celui qui épargne la passe
  // device, donc celui dont l'absence coûte le plus — et aucun test unitaire ne
  // le verrait, la fonction restant juste.
  const sec = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/sec.mjs'), 'utf8');
  assert.match(sec, /auditConfigFiles\(root, config\)\]/,
    'sec.mjs n\'ajoute plus ces findings au rapport : le contrôle peut rester juste pendant que '
    + 'le rapport n\'en dit rien');
  const conf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs'), 'utf8');
  assert.match(conf, /const orphelins = configNonEmbarquee\(/,
    'config.mjs ne signale plus rien au §3d : le défaut ne se verrait qu\'APRÈS une passe device, '
    + 'ce qui est exactement le coût qu\'on voulait supprimer');
});

test('le nom du titre est celui que l\'app AFFICHE, pas le paquet Dart (298)', () => {
  // ⚠️ LE GABARIT PRESCRIVAIT LA MAUVAISE SOURCE, noir sur blanc : « Nom du
  // paquet Dart (pubspec.yaml → name) ». Or ce nom finit dans le TITRE de la
  // page publiée, donc dans la seule chose qui distingue un rapport des autres
  // dans une galerie. Vu par Germinator sur une page en ligne : un titre qui
  // disait « Colis » pour une app nommée « Acme Colis ».
  const dir = mkdtempSync(join(tmpdir(), 'argus-298-'));
  const ecrire = (rel, contenu) => {
    mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
    writeFileSync(join(dir, rel), contenu, 'utf8');
  };
  try {
    // Les quatre sources, chacune seule : une seule qui marche ne prouve rien
    // sur les autres, et les projets réels ne les portent pas toutes.
    ecrire('ios/Runner/Info.plist',
      '<dict><key>CFBundleDisplayName</key>\n\t<string>Acme Colis</string></dict>\n');
    assert.equal(nomAffiche(dir), 'Acme Colis', 'source 1 : CFBundleDisplayName');

    rmSync(join(dir, 'ios'), { recursive: true, force: true });
    ecrire('android/app/build.gradle.kts', 'resValue("string", "app_name", "Acme Colis")\n');
    assert.equal(nomAffiche(dir), 'Acme Colis', 'source 2 : resValue du build.gradle');

    rmSync(join(dir, 'android'), { recursive: true, force: true });
    ecrire('android/app/src/main/res/values/strings.xml', '<string name="app_name">Focus</string>\n');
    assert.equal(nomAffiche(dir), 'Focus', 'source 3 : strings.xml');

    rmSync(join(dir, 'android'), { recursive: true, force: true });
    ecrire('android/app/src/main/AndroidManifest.xml', '<application android:label="Focus">\n');
    assert.equal(nomAffiche(dir), 'Focus', 'source 4 : android:label littéral');

    // ⚠️ ET L'INDIRECTION NE COMPTE PAS. `android:label="@string/app_name"` est
    // un renvoi : le suivre naïvement donnerait « @string/app_name » comme nom
    // affiché, soit un titre pire que celui qu'on corrige.
    ecrire('android/app/src/main/AndroidManifest.xml', '<application android:label="@string/app_name">\n');
    assert.equal(nomAffiche(dir), '', 'une indirection @string/ ne doit JAMAIS être prise pour un nom');

    // Un projet qui n'affiche rien : on se tait plutôt que d'inventer.
    rmSync(join(dir, 'android'), { recursive: true, force: true });
    assert.equal(nomAffiche(dir), '', 'sans aucune source, rendre \'\' — inventer serait pire');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('le signal sur app.name ne parle QUE si personne n\'a choisi (298)', () => {
  // ⚠️ UN AVERTISSEMENT INACQUITTABLE FINIT IGNORÉ, et il emmène les autres —
  // c'est la leçon du 291, appliquée le jour même à l'avertissement qu'on
  // ajoute. Celui-ci se ferme tout seul : il ne sort que tant que `app.name`
  // porte EXACTEMENT le défaut posé par l'installeur.
  const dir = mkdtempSync(join(tmpdir(), 'argus-298-sig-'));
  const ecrire = (rel, contenu) => {
    mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
    writeFileSync(join(dir, rel), contenu, 'utf8');
  };
  try {
    ecrire('pubspec.yaml', 'name: acme_colis\n');
    ecrire('ios/Runner/Info.plist',
      '<dict><key>CFBundleDisplayName</key>\n\t<string>Acme Colis</string></dict>\n');

    const surLeDefaut = nomTechniqueEnTitre(dir, { app: { name: 'acme_colis' } });
    assert.ok(surLeDefaut, 'sur le défaut non touché, le signal doit sortir — sinon il ne sert à rien');
    assert.match(surLeDefaut, /Acme Colis/,
      'et il doit DIRE le nom affiché : « ton nom est mauvais » sans donner le bon ne sert à rien');

    // ⚠️ LES TROIS FAÇONS DE SE TAIRE, et ce sont elles qui rendent le signal
    // acquittable.
    assert.equal(nomTechniqueEnTitre(dir, { app: { name: 'Acme Colis' } }), '',
      'le nom affiché choisi : plus rien à dire');
    assert.equal(nomTechniqueEnTitre(dir, { app: { name: 'Colis Acme' } }), '',
      'un AUTRE nom est une décision délibérée — se taire, sinon l\'avertissement est inacquittable');
    assert.equal(nomTechniqueEnTitre(dir, { app: { name: '' } }), '',
      'pas de nom configuré : ce n\'est pas le défaut visé');

    // Et sans nom affiché nulle part, aucun conseil à donner.
    rmSync(join(dir, 'ios'), { recursive: true, force: true });
    assert.equal(nomTechniqueEnTitre(dir, { app: { name: 'acme_colis' } }), '',
      'sans nom affiché, se taire plutôt que de conseiller l\'inconnu');
  } finally { rmSync(dir, { recursive: true, force: true }); }

  // ⚠️ LE CÂBLAGE : la fonction peut rester juste pendant que personne ne l'appelle.
  const conf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs'), 'utf8');
  assert.match(conf, /const nomTech = nomTechniqueEnTitre\(/,
    'config.mjs ne signale plus le nom technique : le défaut ne se verrait qu\'une fois la page publiée');

  // Et le gabarit ne doit plus PRESCRIRE la mauvaise source.
  const gabarit = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml'), 'utf8');
  const i = gabarit.indexOf('\n  name:');
  assert.notEqual(i, -1, 'la clé app.name a disparu du gabarit — mets ce garde à jour');
  const avant = gabarit.slice(Math.max(0, i - 700), i).replace(/\s+/g, ' ');
  assert.match(avant, /AFFICHE/,
    'le gabarit ne dit pas que app.name est le nom AFFICHÉ : il prescrivait le nom du paquet Dart, '
    + 'et c\'est cette phrase-là qui a produit le titre publié');
});

test('le croisement voit les ancres CONDITIONNELLES, et dit ce qu\'il ne lit pas (299)', () => {
  // 🔴 UN GARDE QUI RENDAIT VERT PAR ACCIDENT, sur la forme que le skill
  // PRESCRIT. Le motif exigeait `identifier: 'x'` collé à la clé, donc
  // `identifier: cond ? 'a' : 'b'` lui était invisible — or c'est exactement ce
  // que le §2c-bis recommande quand deux états sortent du même `Semantics`.
  // Mesuré sur un projet réel : **59 posées, 54 vues, verdict VERT**, avec un
  // « 54 littérales » honnête qui taisait les cinq manquantes.
  const dir = mkdtempSync(join(tmpdir(), 'argus-299-'));
  try {
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'lib/x.dart'), [
      "Semantics(identifier: 'home_root', label: 'NE DOIT PAS COMPTER', child: X());",
      "Semantics(identifier: vide ? 'etat_a' : 'etat_b', label: 'NON PLUS', child: Y());",
      'Semantics(identifier: widget.anchorId, child: Z());',
      "Semantics(identifier: 'liste_\\${i}', child: W());",
    ].join('\n'), 'utf8');

    const vues = posedAnchors(dir);
    // Le cœur du correctif : les deux branches du ternaire sont des ancres.
    assert.deepEqual(vues, ['etat_a', 'etat_b', 'home_root'],
      `les ancres conditionnelles restent invisibles (${JSON.stringify(vues)}) : le contrôle rendrait `
      + 'vert sur la forme même que le §2c-bis prescrit');

    // ⚠️ L'AUTRE MOITIÉ, et c'est elle qui rend le remède sûr : lire l'argument
    // entier ne doit PAS déborder sur la clé suivante. Sans borne, `label:`
    // deviendrait une ancre — un faux positif là où l'on corrigeait un faux
    // négatif, et le pire des deux puisqu'il accuse.
    assert.ok(!vues.some((a) => /NE DOIT PAS|NON PLUS/.test(a)),
      `un libellé voisin a été compté comme ancre (${JSON.stringify(vues)}) : la borne de `
      + 'l\'argument ne tient pas');

    // Ce qu'on ne sait PAS lire doit être DIT. Une clé sans littéral analysable
    // n'est pas une absence d'ancre, c'est une absence de mesure — et la taire
    // déplace simplement le trou.
    // ⚠️ LE GABARIT A CHANGÉ DE CATÉGORIE AU 329, il n'a pas disparu : c'est une
    // FAMILLE que le §2c prescrit, pas une ancre illisible. Le phénomène a
    // bougé, la mesure bouge avec lui — sans quoi on croirait le garde vacant.
    const opaques = vues.opaques ?? [];
    const familles = vues.familles ?? [];
    assert.equal(opaques.length, 1,
      `1 argument vraiment illisible attendu, ${opaques.length} : ${JSON.stringify(opaques)}`);
    assert.ok(opaques.some((o) => o.includes('widget.anchorId')), 'une ancre calculée doit être signalée');
    assert.equal(familles.length, 1,
      `le gabarit doit être rangé en famille, pas perdu : ${JSON.stringify(familles)}`);
    assert.ok(familles.some((f) => f.includes('liste_')), 'et nommé');
    for (const o of [...opaques, ...familles]) {
      assert.match(o, /x\.dart/, 'et chaque signalement doit porter son FICHIER, sinon il est inactionnable');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }

  // ⚠️ LE CÂBLAGE : la branche verte doit imprimer les opaques. C'est là que le
  // silence coûtait — un « ✔ » qui ne dit pas ce qu'il n'a pas regardé.
  const conf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs'), 'utf8');
  assert.match(conf, /for \(const o of vues\.opaques \?\? \[\]\)/,
    'le verdict vert n\'énumère plus les ancres non lisibles : il redevient un « ✔ » qui tait '
    + 'ce qu\'il n\'a pas pu mesurer');
});

test('l\'échec d\'installation NOMME sa cause, et l\'indice arrive (301)', () => {
  // 🔴 35 MINUTES PERDUES, la plus chère d'un run. Le message prenait les TROIS
  // DERNIÈRES lignes de la sortie d'`adb` — c'est-à-dire la fin d'une stack
  // Java — pendant que `Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]` était
  // ailleurs et jetée. L'agent a dû rejouer l'installation à la main pour lire
  // ce que l'outil avait déjà sous les yeux.
  //
  // ⚠️ ET LA CONSÉQUENCE ÉTAIT PIRE QUE LE MESSAGE : `installHint` cherche le
  // code d'échec DANS ce détail. Une stack Java n'en contient aucun, donc
  // l'indice du §3g — qui décrit ce cas exactement et donne ses deux gestes —
  // n'a jamais été affiché. Le skill avait la réponse, le chemin pour y aller
  // était coupé.
  const SORTIE_REELLE = [
    'Performing Streamed Install',
    'adb: failed to install app.apk: Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]',
    'java.lang.SecurityException: ...',
    '\tat android.os.ShellCommand.exec(ShellCommand.java:38)',
    '\tat android.server.pm.PackageManagerShellCommand.onCommand(x.java:12)',
  ].join('\n');

  assert.equal(causeInstall(SORTIE_REELLE), 'Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]',
    'la ligne qui NOMME la cause doit gagner sur la queue de sortie');

  // ⚠️ CE QUI COMPTE VRAIMENT : le détail doit porter le code, sinon l'indice
  // du §3g ne se déclenche pas. C'est le maillon qui manquait.
  assert.match(causeInstall(SORTIE_REELLE), /INSTALL_FAILED_INSUFFICIENT_STORAGE/,
    'sans le code dans le détail, installHint ne matche pas et le §3g reste introuvable — '
    + 'c\'est ce qui a coûté les 35 minutes');

  // L'ancienne façon de faire, gardée ici pour que l'écart reste mesurable.
  const ancien = SORTIE_REELLE.trim().split('\n').slice(-3).join(' ');
  assert.ok(!/INSTALL_FAILED/.test(ancien),
    'le montage est cassé : la sortie de référence doit être de celles où la queue NE porte PAS '
    + 'le code, sinon ce garde ne mesure pas le défaut');

  // Les autres formes que le terrain rend.
  assert.match(causeInstall('adb: failed to install x.apk: some other reason'), /adb: failed to install/,
    'le refus explicite d\'adb est nommant, même sans code entre crochets');
  assert.equal(causeInstall(''), 'sortie vide');
  assert.equal(causeInstall('\tat a.b.C(x.java:1)\n\tat d.e.F(y.java:2)'), 'sortie vide',
    'une stack SEULE ne nomme rien : la rendre telle quelle serait revenir au défaut');

  // ⚠️ ET QUAND RIEN NE NOMME, ON LE DIT. Rendre la queue en silence la ferait
  // passer pour un diagnostic — c'est exactement ce qui trompait.
  const flou = causeInstall('quelque chose d\'inattendu\nsur deux lignes');
  assert.match(flou, /aucune ligne ne nomme la cause/,
    'un pis-aller doit s\'annoncer comme tel, sinon il se lit comme la cause');

  // Le câblage : les DEUX flux, pas l'un OU l'autre — adb écrit son Failure sur
  // stdout tout en remplissant stderr d'une stack.
  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  assert.match(run, /const detail = causeInstall\(/,
    'installAndroid n\'appelle plus causeInstall : le message peut redevenir une stack Java');
  const appel = /const detail = causeInstall\(([^;]*)\);/.exec(run);
  assert.ok(appel && /stderr/.test(appel[1]) && /stdout/.test(appel[1]),
    'les deux flux doivent être passés : adb met son « Failure » sur stdout et sa stack sur stderr, '
    + `et un « || » n'en garderait qu'un (${appel?.[1] ?? '—'})`);
});

test('la séquence construit la RELEASE, et sait quand insérer perf (302-304)', () => {
  // 🚨 DEUX RUNS INDÉPENDANTS, DEUX TERRAINS SANS RAPPORT, MÊME DÉFAUT. Les deux
  // ont dû construire la release HORS séquence parce que `make argus-build`
  // bâtit le debug, alors que `argus-sec` ne conclut que sur un binaire de
  // publication et que `binarySizeMb` juge ce qui sort. Suivie à la lettre, la
  // liste faisait rendre un `major` qui décrit l'outillage : 62,2 Mo au lieu de
  // 27,1 sur un terrain, 126 au lieu de 79,1 sur l'autre.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8').split('\n');

  const debut = skill.findIndex((l) => l.trim() === 'make argus-anchors');
  assert.notEqual(debut, -1, 'la séquence de commandes est introuvable — mets ce garde à jour');
  const fin = skill.findIndex((l, i) => i > debut && l.trim() === '```');
  assert.ok(fin > debut, 'la fin du bloc de séquence est introuvable');
  const bloc = skill.slice(debut, fin);

  // La release est DANS le bloc, et avant les dimensions qui en dépendent.
  const iRelease = bloc.findIndex((l) => /RELEASE/i.test(l));
  assert.notEqual(iRelease, -1,
    'la séquence ne construit toujours pas la release : `argus-sec` scannera un debug et '
    + '`binarySizeMb` jugera le mauvais binaire — les deux runs ont dû le faire eux-mêmes');
  // ⚠️ La COMMANDE, pas sa mention : le bloc porte aussi un commentaire qui dit
  // « `make argus-perf` ICI », et un `includes` le trouvait en premier — le
  // piège du motif qui matche une mention, une fois de plus.
  const commande = (/** @type {string} */ nom) => bloc.findIndex((l) => l.trimStart().startsWith(`make ${nom}`));
  const iSec = commande('argus-sec');
  const iPerf = commande('argus-perf');
  assert.ok(iRelease < iSec, 'la release doit précéder argus-sec, qui la scanne');
  assert.ok(iRelease < iPerf, 'et argus-perf, qui pèse le binaire livré');

  // ⚠️ Et elle ne doit PAS être présentée comme `make argus-build`, qui bâtit
  // le debug : c'est cette confusion même qui a coûté deux verdicts.
  // ⚠️ Le DÉBUT de la ligne, pas son contenu : elle porte justement la mise en
  // garde « PAS `make argus-build` », que le motif nu matchait. Troisième fois
  // dans cette passe qu'un garde attrape le texte qui interdit ce qu'il traque.
  assert.ok(!bloc[iRelease].trimStart().startsWith('make argus-build'),
    'la ligne de release ne peut pas ÊTRE `make argus-build` — c\'est la commande du debug');

  // 304 : l'arête manquante. Le chemin nominal n'a jamais besoin de perf tôt ;
  // le chemin « démarrage lent » l'exige, et il est fréquent.
  const iRun = commande('argus-run');
  const avantBaselines = bloc.slice(iRun, commande('argus-baselines')).join(' ');
  assert.match(avantBaselines, /argus-perf/,
    'la séquence ne dit pas d\'insérer argus-perf quand le plafond d\'attente est frôlé : le run '
    + 'doit alors casser l\'ordre prescrit pour dériver son seuil, sans savoir que c\'est permis');
});

test('le repli sans interlocuteur NOMME l\'exception qu\'il doit tolérer (302)', () => {
  // ⚠️ MA PROPRE CONTRADICTION, ROUVERTE PAR MON PROPRE CORRECTIF. Le repli du
  // 283 disait « rien d'autre … pas de renommage » ; deux paragraphes plus haut
  // le skill recommande comme PREMIÈRE option de rendre public un widget privé,
  // ce qui EST un renommage. Un run a tranché restrictif, à raison, et deux
  // états sont restés hors de l'étage 1. Borner « ce qu'on s'autorise » sans
  // relire ce que le skill recommande ailleurs rouvre la contradiction qu'on
  // venait de fermer.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');

  // Le skill recommande toujours de rendre le contenu public — sinon ce garde
  // compare deux absences.
  assert.match(skill, /Rendre le contenu public/,
    'le skill ne recommande plus de rendre un widget privé public : ce garde ne mesure plus rien');

  const i = skill.indexOf('Ce que tu t\'autorises alors');
  assert.notEqual(i, -1, 'le repli sans interlocuteur a été reformulé — mets ce garde à jour');
  const bloc = skill.slice(i, i + 1800).replace(/\s+/g, ' ');

  assert.match(bloc, /rendre PUBLIC un widget privé|rendre public un widget privé/i,
    'le repli interdit le renommage sans nommer l\'exception que le skill recommande ailleurs : '
    + 'celui qui applique les deux à la lettre se bloque, et tranche seul');
  // ⚠️ L'AUTRE MOITIÉ : l'exception doit rester BORNÉE. « Plus de renommage
  // interdit » transformerait le repli en permis de refactorer.
  assert.match(bloc, /change ce que le programme FAIT|comportement/i,
    'l\'exception doit donner son CRITÈRE, sinon elle s\'étend à tout renommage');
  assert.match(bloc, /reste interdit|Tout autre renommage/i,
    'et redire ce qui demeure interdit — sinon lever une contradiction ouvre une porte');
});

test('REGRESS a son contrôle d\'après-instrumentation, et il s\'éprouve (306)', () => {
  // 🚨 EN REGRESS IL N'Y A AUCUN PATCH INVERSE. Le §4 prouve le retrait par un
  // `git status` vide — mais en REGRESS l'instrumentation RESTE, donc rien ne
  // prouve rien. Un run y a perdu trois lignes de code applicatif avec son
  // propre script (index glissés de neuf positions), et rien ne l'a signalé :
  // ni le diff (1 577 insertions pour 361 neuves, noyé par la réindentation),
  // ni l'analyse, qui compilait encore.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const i = skill.indexOf('AUCUN PATCH INVERSE');
  assert.notEqual(i, -1,
    'le SKILL ne dit pas qu\'en REGRESS rien ne prouve le retrait : le seul contrôle offert '
    + 'reste un git diff que la réindentation rend illisible');
  const bloc = skill.slice(i, i + 2200);

  assert.match(bloc, /comm -23/,
    'le contrôle de jetons n\'est pas donné : c\'est le seul geste qui voie une ligne perdue '
    + 'dans un diff noyé');
  // ⚠️ Et il doit exiger sa PROPRE épreuve — un comm qui rend toujours vide ne
  // dit pas que rien n'est perdu, il dit qu'il ne mesure pas.
  assert.match(bloc.replace(/\s+/g, ' '), /retire un jeton à la main|prouve l'instrument/i,
    'le contrôle est donné sans sa contre-épreuve : un « vide » non prouvé est indistinguable '
    + 'd\'un instrument mort, ce que ce skill refuse partout ailleurs');

  // ⚠️ ET LE GESTE DOIT MARCHER. On l'exécute sur le cas exact du run : un
  // fichier enveloppé correctement, et le même dont une ligne a sauté. Le diff
  // de LIGNES ne les distingue pas ; celui des jetons doit les distinguer.
  const dir = mkdtempSync(join(tmpdir(), 'argus-306-'));
  try {
    const avant = 'Widget build() {\n  return Column(children: [\n    Text(titre),\n'
      + '    Bouton(message: state.message),\n  ]);\n}\n';
    const bon = 'Widget build() {\n  return Semantics(\n    identifier: "r",\n    child: Column(\n'
      + '      children: [\n        Text(titre),\n        Bouton(message: state.message),\n'
      + '      ],\n    ),\n  );\n}\n';
    const perdu = bon.replace('Bouton(message: state.message)', 'Bouton()');
    const jetons = (/** @type {string} */ s) =>
      s.split(/[^A-Za-z0-9_]+/).filter(Boolean).sort();
    const manquants = (/** @type {string} */ a, /** @type {string} */ b) => {
      const reste = jetons(b);
      return jetons(a).filter((t) => {
        const k = reste.indexOf(t);
        if (k < 0) return true;
        reste.splice(k, 1);
        return false;
      });
    };
    assert.deepEqual(manquants(avant, bon), [],
      'un enveloppement correct ne doit perdre AUCUN jeton — sinon le contrôle crie au loup '
      + 'sur chaque instrumentation et on apprend à l\'ignorer');
    const perdus = manquants(avant, perdu);
    assert.ok(perdus.includes('message') && perdus.includes('state'),
      `le contrôle ne voit pas la ligne perdue (${JSON.stringify(perdus)}) : il ne mesure rien`);
    writeFileSync(join(dir, 'x'), '', 'utf8');   // le dossier sert de témoin de nettoyage
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('les consignes que deux runs ont payées sont écrites (305, 307, 309-315)', () => {
  // Un garde groupé pour un lot de consignes manquantes, chacune mesurée sur le
  // terrain. Il ne cite pas de formulation : il vérifie que le SUJET est traité
  // là où le run l'a cherché.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8').replace(/\s+/g, ' ');
  const yaml = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml'), 'utf8');

  const attendus = [
    ['305', skill, /pas reproductible sur une machine partagée/i,
      '`firstLaunchMs` varie d\'un facteur 3 selon la charge : un seuil qui en dérive est aussi instable'],
    ['307', skill, /l'`anchor:` d'un `ArgusScreen` est unique/i,
      'l\'unicité de l\'anchor n\'était énoncée nulle part, seulement montrée'],
    // ⚠️ Ancré sur le SUJET, pas sur la phrase : le 330 a reformulé « ces quatre
    // lignes » en « ici ni ailleurs » — le phénomène est le même, mieux dit, et
    // un motif qui citait la formulation d'origine serait devenu faux pour un
    // correctif JUSTE.
    ['309', skill, /ne chaîne (pas|jamais)[^.]*`?grep -c`?|`grep -c`[^.]*par `&&`/i,
      '`grep -c` sort en 1 sur zéro : la chaîne se tronque en silence'],
    ['330', skill, /ici ni ailleurs|n'appartient pas à ce bloc/i,
      'le piège de `grep -c` appartient à la commande, pas au bloc où il est décrit'],
    ['310', skill, /0` ne prouve rien tout seul|contre-épreuve/i,
      'la vérification prescrite ne distingue pas un filtre qui marche d\'un instrument mort'],
    ['312', skill, /le point dépend de l'écran/i,
      'un `point:` en dur se lit comme une recette et tombe sur une commande'],
    ['313', skill, /vaut pour toute commande du runner/i,
      '`--no-install` n\'était documenté que pour `--tags`'],
    ['314', skill, /n'infère pas `S`|type le double explicitement/i,
      'le helper générique de doubles n\'infère pas son état'],
    ['315', skill, /coquille à onglets donne trois réponses/i,
      'où poser la racine quand un écran n\'est pas un Scaffold'],
    ['311', yaml, /chaînes QUOTÉES repliées/i,
      'la forme refusée manquait à la liste, rencontrée sur evidenceAcknowledged'],
  ];
  for (const [num, texte, rx, pourquoi] of attendus) {
    assert.match(texte, rx, `${num} — ${pourquoi} : la consigne n'est pas écrite`);
  }
});

test('la cible qui agrège les dettes lit le format que le harnais ÉMET (316)', () => {
  // ⚠️ QUATRE LANCEMENTS DE `argus-guards` POUR UNE PREMIÈRE INSTALLATION, dont
  // deux de pur recopiage. Les messages donnaient déjà la ligne exacte à
  // inscrire — c'est ce qui a permis d'en poser 48 sans en réécrire une de
  // mémoire — mais rien ne les agrégeait.
  //
  // Le danger d'une telle cible est de DEVINER le format. Ce garde croise donc
  // le motif du Makefile avec ce que `argus_harness.dart` émet vraiment : les
  // deux ne peuvent plus diverger en silence.
  const makefile = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'), 'utf8');
  const harnais = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/argus_harness.dart'), 'utf8');

  assert.match(makefile, /^argus-debts:/m,
    'la cible qui agrège les dettes a disparu : on repart à quatre lancements dont deux de recopiage');

  // Le format ÉMIS, lu dans le code — jamais recopié ici.
  // La ligne émise se termine par un ou plusieurs `\n` selon le message : on
  // ancre sur ce qui compte — l'indentation et la clé quotée suivie d'une virgule.
  const emis = /"( +)'\$key',\\n/.exec(harnais);
  assert.ok(emis, 'le harnais n\'émet plus la ligne prête à coller sous la forme attendue — '
    + 'si elle a changé, la cible doit suivre, et ce garde est ce qui le dira');
  const indentation = emis[1].length;
  assert.ok(indentation > 0,
    'la ligne émise n\'est plus indentée : le motif du Makefile, ancré sur `^ +`, ne la verra plus');

  // Et le motif du Makefile doit accepter cette forme-là.
  const cible = makefile.slice(makefile.indexOf('argus-debts:'), makefile.indexOf('argus-debts:') + 600);
  assert.match(cible, /grep -oE/, 'la cible n\'extrait plus rien');
  const motif = /grep -oE "([^"]+)"/.exec(cible);
  assert.ok(motif, 'le motif d\'extraction est illisible — ce garde ne peut plus le croiser');
  // ⚠️ ON L'EXÉCUTE sur la ligne que le code émet, plutôt que de comparer deux
  // textes : c'est la seule façon de savoir qu'il matche.
  const ligneEmise = `${' '.repeat(indentation)}'home:overflow:13px',`;
  const rx = new RegExp(motif[1].replace(/\$\$/g, '$'));
  assert.match(ligneEmise, rx,
    `le motif du Makefile (${motif[1]}) ne matche pas la ligne que le harnais émet `
    + `(${JSON.stringify(ligneEmise)}) : la cible rendrait vide sur une suite pleine de dettes`);

  // ⚠️ L'AUTRE MOITIÉ : il ne doit pas matcher n'importe quelle ligne de sortie,
  // sinon le bloc « prêt à coller » se remplit de bruit.
  for (const bruit of ['All tests passed!', '00:03 +12 -1: layout home', "  final x = 'abc';"]) {
    assert.ok(!rx.test(bruit),
      `le motif attrape une ligne qui n'est pas une dette (${JSON.stringify(bruit)})`);
  }

  // La couleur doit être retirée avant : `flutter test` colore ses échecs, et
  // un code ANSI collé au début de ligne casse l'ancrage `^ +`.
  assert.match(cible, /\\x1b\\\[\[0-9;\]\*m|sed -e 's\/.x1b/,
    'la cible ne retire pas les codes ANSI : une ligne colorée ne commence plus par des espaces');
});

test('le conseil de plafond se TAIT quand l\'app ne démarre pas (327)', () => {
  // 🔴 LE RUNNER SE CONTREDISAIT À SIX LIGNES D'INTERVALLE. Il imprime d'abord,
  // correctement, « (1) L'app ne démarre PAS : aucun plafond n'y changera
  // rien » — puis ce bloc pressait de relever `startTimeoutMs` de 20 à 31 s.
  // Vécu : les 20 392 ms relevés étaient le plafond CONSOMMÉ À VIDE, et suivre
  // la fin de la sortie aurait doublé la durée de six flows condamnés. Le
  // second bloc ne connaissait pas le diagnostic du premier.
  const morts = [{ ms: 20392, status: 'FAILED' }, { ms: 20388, status: 'FAILED' }];
  const sortie = startupMarginWarning(morts, 20000, 'ios').join(' ');
  assert.ok(sortie, 'le cas doit produire un message — se taire tout à fait perdrait le signal');
  assert.ok(!/Relève `thresholds.startTimeoutMs`/.test(sortie),
    'le runner presse encore de relever le plafond alors qu\'aucun flow n\'a atteint l\'écran : '
    + 'ce n\'est pas une marge trop mince, c\'est une app qui ne démarre pas');
  assert.match(sortie, /cause \(1\)|capture/i,
    'et il doit renvoyer au diagnostic n° 1, celui qu\'il vient lui-même d\'imprimer');

  // ⚠️ L'AUTRE MOITIÉ, et sans elle le correctif rendrait le conseil muet pour
  // de bon : une app LENTE mais qui démarre doit toujours recevoir son conseil.
  const lents = [{ ms: 19777, status: 'COMPLETED' }, { ms: 8011, status: 'COMPLETED' }];
  assert.match(startupMarginWarning(lents, 20000, 'ios').join(' '), /Relève `thresholds.startTimeoutMs`/,
    'une app lente qui DÉMARRE doit encore se voir conseiller de relever le plafond');

  // Et un cas mixte reste un cas de marge : au moins un flow y est arrivé.
  const mixte = [{ ms: 20392, status: 'FAILED' }, { ms: 19000, status: 'COMPLETED' }];
  assert.match(startupMarginWarning(mixte, 20000, 'ios').join(' '), /Relève `thresholds.startTimeoutMs`/,
    'si un seul flow atteint l\'écran, la marge se mesure et le conseil vaut');
});

test('la locale du simulateur iOS se LIT, elle n\'est pas déclarée illisible (319)', () => {
  // 🔴 UN AVERTISSEMENT INACQUITTABLE, IMPRIMÉ CINQ FOIS. « la locale de
  // l'appareil n'a pas pu être lue » sortait à chaque passage device d'un run
  // iOS — alors qu'une seule commande la rend :
  //   xcrun simctl spawn <udid> defaults read -g AppleLocale  →  fr_CI
  // La lecture était gardée par `platform === 'android'` : on n'interrogeait
  // pas, et le message accusait l'appareil d'être muet.
  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');

  // ⚠️ LE CÂBLAGE : sans lui, `localeWarnings` reste juste et reçoit toujours
  // `null` — la fonction ne peut pas savoir qu'on ne lui a rien donné.
  assert.match(run, /simctl', 'spawn'[^)]*'AppleLocale'/,
    'la locale iOS n\'est plus lue : l\'avertissement redeviendra « n\'a pas pu être lue » à '
    + 'chaque passage device, sans moyen de le faire taire');
  const bloc = run.slice(run.indexOf('const lue ='), run.indexOf('const lue =') + 700);
  assert.ok(!/platform === 'android' \?\s*\n?\s*adbShell[^]*?: '';/.test(bloc),
    'la lecture retombe sur une chaîne vide hors Android — c\'est exactement le défaut');

  // Et le message doit alors NOMMER ce qu'il a lu, pour être actionnable.
  const divergent = localeWarnings('fr_FR', false, 'fr_CI', 'ios').join(' ');
  assert.match(divergent, /fr_CI/,
    'quand les locales diffèrent, le message doit dire CELLE DE L\'APPAREIL : sans elle on ne '
    + 'sait pas quoi corriger');

  // ⚠️ L'AUTRE MOITIÉ : il se tait quand l'intention est satisfaite. Un
  // avertissement qu'on ne peut pas faire taire en corrigeant finit ignoré.
  assert.deepEqual(localeWarnings('fr_CI', false, 'fr_CI', 'ios'), [],
    'locales identiques : l\'intention est satisfaite, quel qu\'en soit le moyen');
  assert.deepEqual(localeWarnings('fr_FR', true, null, 'ios'), [],
    'et avec autoStart le runner règle la locale lui-même : rien à dire');
});

test('un GABARIT d\'ancre n\'est ni une ancre opaque ni du hors-périmètre (329)', () => {
  // 🔴 LE 299 SUR SON AUTRE MOITIÉ. J'ai fait voir les ternaires au croisement,
  // pas les gabarits — que le code écartait explicitement. Or
  // `identifier: 'orders_filter_${e.name}'` est EXACTEMENT ce que le §2c
  // prescrit pour un ensemble fini d'enum. Le contrôle rendait un ⚠️ permanent
  // et ne proposait que `allowUndeclared`, qui veut dire « hors périmètre » —
  // alors que les ancres du gabarit sont vérifiées, développées dans
  // `harness.dart`. Un run a préféré garder l'avertissement plutôt que de
  // mentir dans le YAML : il avait raison, il n'y avait pas de bonne case.
  const dir = mkdtempSync(join(tmpdir(), 'argus-329-'));
  try {
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'lib/x.dart'), [
      "Semantics(identifier: 'home_root', child: A());",
      "Semantics(identifier: 'orders_filter_\\${f?.name ?? \"all\"}', child: B());",
      'Semantics(identifier: widget.anchorId, child: C());',
    ].join('\n'), 'utf8');

    const vues = posedAnchors(dir);
    assert.deepEqual(vues, ['home_root'], 'seule l\'ancre littérale est confrontable');
    assert.equal((vues.familles ?? []).length, 1,
      `le gabarit doit être rangé comme FAMILLE (${JSON.stringify(vues.familles)})`);
    assert.ok((vues.familles ?? [])[0].includes('orders_filter'), 'et nommé');

    // ⚠️ LA DISTINCTION EST TOUT L'ENJEU : un gabarit n'est pas une ancre
    // calculée. Les confondre pousse à écrire « hors périmètre » sur du
    // vérifié — ce que le run a refusé de faire, à raison.
    assert.equal((vues.opaques ?? []).length, 1,
      `seule l'ancre calculée est opaque (${JSON.stringify(vues.opaques)})`);
    assert.ok((vues.opaques ?? [])[0].includes('anchorId'));
  } finally { rmSync(dir, { recursive: true, force: true }); }

  // Et le verdict doit les dire SANS alarme — c'est ce qui les sépare.
  const conf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs'), 'utf8');
  const bloc = conf.slice(conf.indexOf('for (const f of vues.familles'), conf.indexOf('for (const f of vues.familles') + 200);
  assert.match(bloc, /log\(/,
    'les familles doivent sortir en log, pas en warn : les alarmer poussait à les inscrire en '
    + 'allowUndeclared, donc à déclarer hors périmètre des ancres vérifiées');
});

test('les consignes que la vague iOS a payées sont écrites (318, 321, 325, 328, 331, 332)', () => {
  // Un garde groupé pour les consignes manquantes de la vague iOS, chacune
  // mesurée sur le terrain. Il vérifie que le SUJET est traité là où le run l'a
  // cherché, sans citer de formulation.
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8').replace(/\s+/g, ' ');
  const goto = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/_subflows/goto.yaml'), 'utf8');

  const attendus = [
    ['318', goto, /back` EST ANDROID ET WEB|back.{0,40}Android et Web/i,
      'le TODO conseillait un `back` que la méthodologie du même scaffold déclare inopérant sur iOS'],
    ['321', skill, /exige `harness\.dart`, que l'installeur pose/i,
      'la contre-épreuve du §2b réclame un fichier que le §3 pose — l\'ordre affiché n\'est pas suivable'],
    ['325', skill, /\.app` de simulateur SURVIT/i,
      'rien ne disait si le build de release iOS écrase le binaire de simulateur'],
    // ⚠️ Le motif nu matchait la PHRASE qui explique la forme, pas le bloc de
    // code qui la montre : la mutation retirait l'exemple et le garde restait
    // vert. On exige les deux formes CÔTE À CÔTE, ce que seule la démonstration
    // porte — c'est elle qui a manqué au run, pas l'explication.
    ['328', skill, /thenAnswer\(\(_\) async => null\);[^]{0,120}LE DÉFAUT/,
      'la forme mocktail du défaut ne ressemble pas à celle que le skill nomme — 30 min payées'],
    ['328b', skill, /thenAnswer\(\(_\) => Completer</,
      'et le remède doit être montré sous la même forme, sinon on ne sait pas quoi écrire'],
    ['331', skill, /ancre composée au call-site|COMPOSÉE AU CALL-SITE/i,
      'une ancre posée à l\'endroit de l\'appel n\'est pas portée par l\'écran monté seul'],
    ['332', skill, /distance en caractères|rougit à cause de ton instrumentation/i,
      'aucune règle ne disait quoi faire d\'un test du projet cassé par une instrumentation légitime'],
  ];
  for (const [num, texte, rx, pourquoi] of attendus) {
    assert.match(texte, rx, `${num} — ${pourquoi} : la consigne n'est pas écrite`);
  }

  // ⚠️ Le 318 doit AUSSI rester cohérent avec la méthodologie : c'est leur écart
  // qui était le défaut, pas l'une des deux phrases.
  const metho = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/references/methodology-mobile.md'), 'utf8');
  assert.match(metho, /`back`[^.]*Android/i,
    'la méthodologie ne dit plus que `back` est Android : ce garde compare deux textes, et '
    + 'l\'un vient de disparaître');
});

test('les deux relevés d\'identité du device disent la MÊME chose (320, 322)', () => {
  // ⚠️ DEUX ARTEFACTS DU MÊME RUN SE CONTREDISAIENT. `report.json` écrivait
  // `identityMeasured: true` pendant que `.argus-device` écrivait
  // `"source": "déclaré"`, alors que `report-format-mobile.md` promet que cette
  // empreinte est « LUE SUR L'APPAREIL, jamais recopiée ». Les deux ne peuvent
  // pas être vrais ensemble — et c'est l'empreinte qui avait tort : sur iOS,
  // `simctl list -j devices booted` rend le nom et le runtime, donc lus sur la
  // machine.
  const spec = { model: 'iPhone 17', os: 'ios-26' };
  const resolu = { measured: true, model: 'iPhone 17', os: 'iOS-26-3' };

  const mesure = deviceStamp('ios', 'UDID', spec, null, resolu);
  assert.equal(mesure.source, 'mesuré',
    'hors Android, une identité RÉSOLUE sur l\'appareil doit être dite mesurée — sinon le fichier '
    + 'd\'empreinte contredit le rapport du même run');
  assert.equal(mesure.os, 'iOS-26-3', 'et porter ce que l\'appareil a rendu, pas la déclaration');

  // ⚠️ L'AUTRE MOITIÉ : une identité NON résolue reste déclarée. Sans elle, le
  // correctif ferait passer toute déclaration pour une mesure — l'inverse exact
  // du défaut, et le plus grave des deux.
  assert.equal(deviceStamp('ios', 'UDID', spec, null, { measured: false }).source, 'déclaré',
    'un device non résolu ne peut pas rendre une empreinte « mesurée »');
  assert.equal(deviceStamp('ios', 'UDID', spec, null, null).source, 'déclaré',
    'et sans résolution du tout non plus');

  // 320 — un device d'une plateforme non déclarée est un RESTE. Le gabarit livre
  // Android actif et iOS en commentaire : remplacer l'un par l'autre laisse six
  // clés orphelines qui FUSIONNENT dans l'entrée suivante au lieu de lever.
  const base = { app: { id: 'com.x' }, thresholds: { visualMatchPercentage: 95 }, screens: [], platforms: ['ios'] };
  const orphelin = (/** @type {any} */ devices) => (validateConfig({ ...base, devices }) ?? [])
    .filter((/** @type {any} */ p) => /devices\[\]\.platform/.test(p.message));

  assert.equal(orphelin([{ id: 'ios-sim', platform: 'ios' }, { id: 'emu', platform: 'android' }]).length, 1,
    'un device Android dans un projet déclaré iOS doit être refusé : sinon config.mjs rend un '
    + 'simulateur avec le modèle d\'un téléphone Android');
  assert.equal(orphelin([{ id: 'ios-sim', platform: 'ios' }]).length, 0,
    'une config cohérente ne doit rien produire');
  // ⚠️ Et une entrée sans `platform` reste tolérée : les installations
  // existantes n'ont pas la clé, et casser leur config n'apprendrait rien.
  assert.equal(orphelin([{ id: 'x' }]).length, 0,
    'un device sans platform déclarée ne doit pas rougir — les configs d\'avant n\'ont pas la clé');
});

test('un TODO(argus) SANS OBJET se ferme, et le compteur l\'exclut (273)', () => {
  // ⚠️ Deux flows livrés n'ont rien à recevoir sur certains projets. L'inventaire
  // les comptait « à traiter » indéfiniment — et comptait aussi ceux qu'un run
  // avait REMPLIS en gardant le gabarit d'origine en commentaire. Le seul relevé
  // que la personne suivante lira affichait du travail inachevé qui était achevé,
  // sans moyen d'écrire « traité : sans objet ».
  //
  // ⚠️ Ce garde EXÉCUTE la commande de comptage extraite de l'installeur, il ne
  // lit pas un motif : c'est la valeur rendue qui compte, pas la ligne d'appel.
  const installeur = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/scripts/install-mobile.sh'), 'utf8');
  const m = /restant="\$\(([^)]*\|\|[^)]*)\)"/.exec(installeur)
    ?? /restant="\$\((.+)\)"/.exec(installeur);
  assert.ok(m, 'la commande de comptage des TODO a changé de forme — ce garde ne mesure plus rien');
  const commande = m[1].replace(/"\$TARGET\/\$rel"/g, '"$FICHIER"');

  const dir = mkdtempSync(join(tmpdir(), 'argus-todo-'));
  try {
    const compte = (contenu) => {
      writeFileSync(join(dir, 'f.yaml'), contenu, 'utf8');
      return Number(execFileSync('bash', ['-c', `FICHIER='${join(dir, 'f.yaml')}'; ${commande}`],
        { encoding: 'utf8' }).trim());
    };
    assert.equal(compte('# TODO(argus): remplir\n'), 1, 'un TODO ouvert doit compter');
    assert.equal(compte('# TODO(argus): SANS OBJET — pas d\'authentification ici\n'), 0,
      'un TODO déclaré SANS OBJET doit se fermer, sinon il reste au relevé pour toujours');
    assert.equal(compte('# TODO(argus): remplir\n# TODO(argus): SANS OBJET — rien\n'), 1,
      'les deux doivent coexister : fermer l\'un ne ferme pas l\'autre');

    // ⚠️ TROIS FAÇONS DE FERMER, ET `SANS OBJET` NE COUVRAIT QUE LA PLUS RARE.
    // Les deux runs iOS l'ont trouvé, chacun par un bout : l'un a écrit
    // `TRAITÉ`, l'inventaire a continué de compter, et il a dû SUPPRIMER le
    // marqueur — exactement ce que la règle interdit pour l'autre cas ; l'autre
    // a rempli une clé en gardant sa doc et s'est vu compter du travail achevé.
    assert.equal(compte('# TODO(argus): FAIT — la valeur est posée, la doc reste utile\n'), 0,
      'un TODO rempli dont on garde la doc doit se fermer : sinon on est forcé de retirer le '
      + 'commentaire, donc de perdre l\'explication qu\'il portait');
    assert.equal(compte('# TODO(argus): TRAITÉ — assertion écrite dans le flow\n'), 0,
      'un TODO dont le travail a été fait ailleurs doit se fermer');
    // Et rien d'autre ne ferme : un mot-clé inventé laisse le TODO ouvert.
    assert.equal(compte('# TODO(argus): PLUS TARD — on verra\n'), 1,
      'seuls SANS OBJET, FAIT et TRAITÉ ferment — sinon la convention devient un mot magique '
      + 'que chacun réinvente, et le relevé ne veut plus rien dire');
  } finally { rmSync(dir, { recursive: true, force: true }); }

  // La convention ne sert à rien si personne ne sait qu'elle existe.
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  // Les TROIS formes doivent être documentées, pas seulement celle d'origine.
  for (const forme of ['SANS OBJET', 'FAIT', 'TRAITÉ']) {
    assert.ok(skill.includes(`TODO(argus): ${forme}`),
      `le SKILL ne documente pas « TODO(argus): ${forme} » : la convention existe dans le code `
      + 'et reste introuvable pour qui remplit le scaffold');
  }
});

test('le gabarit de configuration livré parse avec le parseur du skill (256)', () => {
  // Le premier utilisateur du parseur, c'est le fichier que l'installeur pose.
  // S'il ne parse pas, TOUS les scripts sortent en 2 et plus rien ne lit la
  // config — la panne la plus large que ce harnais puisse produire.
  const dir = mkdtempSync(join(tmpdir(), 'argus-yaml-'));
  try {
    cpSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml'),
      join(dir, 'argus.mobile.yaml'));
    const avant = process.cwd();
    process.chdir(dir);
    try {
      const config = loadConfig();
      assert.ok(Object.keys(config).length > 5,
        'le gabarit parse mais ne rend presque rien — le montage est cassé, pas le fichier');
    } finally { process.chdir(avant); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('aucun exemple de config ne montre une construction que le parseur REFUSE (256)', () => {
  // ⚠️ CE GARDE EXISTE PARCE QUE DEUX RUNS INDÉPENDANTS ONT BUTÉ AU MÊME
  // ENDROIT, sur deux terrains sans rapport. Le 245 avait documenté
  // `url: { ios: …, android: … }` — une map en FLOW — que le sous-ensemble YAML
  // du skill refuse depuis toujours, et que son propre en-tête exclut. Trois
  // endroits la montraient : le SKILL, le gabarit, et le dartdoc de la fonction.
  //
  // Le garde du 245 ne pouvait pas le voir : il appelle `artifactFor()` avec un
  // OBJET JavaScript, donc il n'emprunte jamais le chemin YAML → config. Encore
  // le troisième barreau, sur le point même où on croyait l'avoir posé.
  //
  // ⚠️ La liste des constructions refusées est DÉRIVÉE du parseur, jamais
  // recopiée : si le sous-ensemble s'élargit un jour, ce garde suit.
  const parseur = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs'), 'utf8');
  assert.match(parseur, /map en flow/,
    'le parseur ne refuse plus les maps en flow — ce garde est devenu vacant, relis-le');

  // Les fichiers qu'on LIT comme du YAML : la doc, le gabarit, et les
  // commentaires des scripts — un dartdoc qui montre une config est lu comme
  // une prescription, pas comme du JavaScript.
  const fichiers = execFileSync('git', ['ls-files', 'plugins/argus-mobile'],
    { cwd: RACINE, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(fichiers.length > 10, 'aucun fichier listé — le montage est cassé');

  const fautes = [];
  for (const f of fichiers) {
    let texte;
    try { texte = readFileSync(join(RACINE, f), 'utf8'); } catch { continue; }
    const doc = f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml');
    texte.split('\n').forEach((ligne, i) => {
      // Dans un script, seules les lignes de COMMENTAIRE sont lues comme de la
      // config ; le code, lui, écrit légitimement des objets JavaScript.
      const commentaire = /^\s*(\/\/|\*|#)/.test(ligne);
      if (!doc && !commentaire) return;
      // Une clé de config suivie d'une accolade ouvrante : la map en flow.
      // ⚠️ ANCRÉ SUR LA FORME D'UNE CLÉ YAML — minuscule initiale, et le
      // deux-points COLLÉ. Sans cet ancrage, le motif attrape le gabarit de
      // cadrage en prose de la méthodologie (`APP          : { pubspec: … }`),
      // qui n'est pas de la configuration et qu'il ne faut surtout pas
      // « corriger » : un motif trop large ne fait pas que mesurer faux, il
      // fait AGIR à tort. Trouvé en écrivant ce garde, deux occurrences.
      if (/^\s*[#*/\s]*[a-z][a-zA-Z0-9_]*:\s*\{/.test(ligne)) fautes.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(fautes, [],
    'exemple(s) de configuration en map de flow — le parseur du skill les REFUSE '
    + '(exit 2, plus aucun script ne lit la config). Écris-les en map imbriquée.');
});

test('la page revenue d\'un `read` reste lisible malgré son préambule (251)', () => {
  // ⚠️ CE GARDE FIGE UNE EXÉCUTION, PAS UNE HYPOTHÈSE. Les gardes voisins
  // montent la page telle que `renderArtifact` la rend ; personne ne la montait
  // telle qu'elle REVIENT — c'est-à-dire enveloppée par la plateforme, qui
  // insère devant elle un préambule `frame-runtime` de ~13 Ko de JavaScript.
  // C'était le seul point du cycle que rien n'éprouvait, et il était noté comme
  // « ce qui casse le plus probablement ».
  //
  // Mesuré le 01/09/2026 en jouant le cycle entier — publication d'une page,
  // `Artifact action:"read"`, `make argus-report ARGS="--previous=<fichier>"`,
  // republication —, la page en ligne portant bien DEUX onglets et deux runs.
  // Cette chaîne-là n'est pas rejouable en CI (elle publie) : ce test fige sa
  // conclusion, il ne la remplace pas.
  //
  // L'extrait ci-dessous est copié d'un vrai retour de `read`, tronqué : il
  // porte ce qui compte, c'est-à-dire d'AUTRES balises `<script>` et des
  // `</scr`+`ipt>` AVANT la nôtre.
  const PREAMBULE = '<!doctype html><html><head><!-- frame-runtime -->'
    + '<script>window.__FRAME_PREAMBLE={"v":1,"capabilities":{"artifact":"artifact.js"}}</scr' + 'ipt>'
    + '<script>(function(){"use strict";var te=["light","dark","system"]})();</scr' + 'ipt>'
    + '<!-- /frame-runtime --><meta charset=utf8>'
    + '<style>body{margin:0}</style></head><body>\n';
  const revenue = PREAMBULE + pageDe({ gate: 'pass', quand: '2026-09-01T11:02:52.000Z' })
    + '\n</body></html>';

  // Le préambule porte bien ce qui pourrait égarer la lecture — sans quoi ce
  // garde se contenterait d'un habillage inoffensif et ne mesurerait rien.
  assert.ok(revenue.includes('</scr' + 'ipt>'), 'le préambule doit fermer des balises AVANT la nôtre');
  assert.ok(revenue.indexOf('<scr' + 'ipt>') < revenue.indexOf('id="argus-runs"'),
    'et en ouvrir avant elle, sinon l\'enveloppe ne ressemble à rien');

  const h = historiqueDe(revenue);
  assert.equal(h.length, 1, 'l\'historique doit survivre à l\'enveloppe de la plateforme');
  assert.equal(h[0].gate, 'pass', 'et rendre le run, pas un objet vide');

  // ⚠️ L'AUTRE MOITIÉ, sans quoi on ne sait pas si l'instrument sait chercher :
  // le préambule SEUL ne doit rien rendre. S'il rendait quelque chose, le
  // succès ci-dessus viendrait de l'enveloppe et non de la page.
  assert.deepEqual(historiqueDe(PREAMBULE + '<p>rien à nous</p></body></html>'), [],
    'le préambule seul ne porte aucun run');
});

test('le run courant est le premier onglet, et le seul à porter ses preuves (247)', () => {
  const p = pageDe({ gate: 'pass' }, historiqueDe(pageDe({ gate: 'fail' })));
  const onglets = [...p.matchAll(/<button role="tab" aria-selected="(true|false)"/g)].map((m) => m[1]);
  assert.ok(onglets.length >= 2, 'deux runs doivent donner deux onglets — sinon ce garde ne mesure rien');
  assert.deepEqual(onglets, ['true', 'false'],
    'ouvrir la page doit montrer ce qui vient d\'être mesuré, jamais un relevé d\'il y a trois semaines');
  assert.match(p, /<section id="passe-0" role="tabpanel">/, 'le courant est visible');
  assert.match(p, /<section id="passe-1" role="tabpanel" hidden>/, 'les passés sont masqués');

  // ⚠️ Un onglet passé DIT qu'il n'a pas ses preuves. Mesuré : 652 386 octets
  // pour un run, dont ~625 Ko de captures, contre 1 645 pour ses données —
  // trente runs avec leurs images feraient sauter le plafond de 16 Mo. Une page
  // qui le TAIT laisse lire son silence comme « ce run n'avait pas de preuve ».
  assert.match(p, /pas ses captures/, 'la page doit dire ce qu\'elle ne garde pas');
  const record = runRecord(ctxRun({}));
  assert.ok(!('evidence' in record.findings[0]),
    'un finding archivé ne doit pas traîner ses chemins de capture — c\'est ce qui tient dans 16 Mo');
  assert.equal(record.findings[0].title, 'un défaut', 'mais son TEXTE reste : c\'est ce qui se relit');
});

test('le plafond retient 30 runs et ANNONCE ce qu\'il retire (248)', () => {
  let h = [];
  for (let i = 0; i < 41; i++) h = historiqueDe(pageDe({ quand: `2026-07-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z` }, h));
  assert.equal(h.length, 30, 'le plafond doit tenir');
  // ⚠️ Le compte des runs retirés se DÉRIVE de ce qui entre, il ne s'annonce
  // pas : « les 30 derniers » quand il y en a douze est le compteur faux que ce
  // projet traque partout ailleurs.
  const p = pageDe({}, h);
  const m = p.match(/(\d+) run\(s\) plus ancien\(s\) retiré/);
  assert.ok(m, 'la page doit dire combien de runs elle a retirés');
  assert.equal(Number(m[1]), h.length - 29, 'et le compte doit être JUSTE, pas plausible');
  // L'autre moitié : sous le plafond, aucune coupe à annoncer.
  assert.doesNotMatch(pageDe({}, h.slice(0, 3)), /plus ancien\(s\) retiré/,
    'ne pas annoncer une coupe qui n\'a pas eu lieu');
});

test('sans --previous, la republication AVERTIT qu\'elle va effacer (249)', () => {
  // ⚠️ Cette perte-là est silencieuse par nature : la page produite est valide,
  // elle a juste un seul onglet. Rien ne lève, rien ne rougit, et on l'apprend
  // en rouvrant la page. L'avertissement est le seul signal qui existe.
  const dit = pertePossible('', 'https://a/ios');
  assert.ok(dit, 'une page existe et --previous manque : il FAUT le dire');
  assert.match(dit, /--previous/, 'et nommer le remède, pas seulement le symptôme');
  // Les deux autres moitiés : un avertissement qui crie toujours s'ignore.
  assert.equal(pertePossible('/tmp/page.html', 'https://a/ios'), null, 'historique repris : rien à perdre');
  assert.equal(pertePossible('', ''), null, 'première publication : rien à écraser');
});

test('le geste documenté est le geste outillé : ARGS arrive jusqu\'au rapport (250)', () => {
  // ⚠️ Le piège fermé : SKILL.md prescrivait `make argus-report ARGS=…` pendant
  // que la recette lançait `node scripts/argus/report.mjs` nu. Ni l'un ni
  // l'autre n'est faux seul — c'est leur ÉCART qui l'est, et rien ne peut le
  // voir : il n'y a aucun comportement à casser, donc aucun test à faire rougir.
  const mk = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'), 'utf8');
  const recette = mk.match(/^argus-report:.*\n((?:\t.*\n)+)/m);
  assert.ok(recette, 'la recette argus-report a disparu — mets ce garde à jour');
  assert.match(recette[1], /report\.mjs \$\(ARGS\)/,
    'la recette doit transmettre ARGS, sinon --previous n\'atteint jamais le script');
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  assert.match(skill, /ARGS="--previous=/, 'et le skill doit prescrire le geste que la recette offre');
  assert.match(skill, /UNE PAGE PAR PLATEFORME/, 'et dire pourquoi une page ne vaut pas pour les deux');
});

// ─────────────────────────────────────────────────────────────────────────────
// Les compteurs de la page publiée du chantier (333) — cf. tools/artefact-compteurs.mjs
//
// ⚠️ Ce que ces gardes protègent n'est PAS la page : c'est l'instrument qui la
// mesure. La page vit hors dépôt — elle nomme les terrains d'essai — donc la CI
// ne la lira jamais. Ce qu'elle peut garder, c'est que l'outil sache encore
// dériver du dépôt, distinguer un bilan d'histoire d'un compteur périmé, et
// surtout ÉCHOUER quand un motif ne trouve plus rien. Sans ce dernier point,
// une reformulation de la page rendrait le contrôle vert en ne mesurant plus
// rien, ce qui est exactement le défaut qu'il existe pour empêcher.

/** Un dépôt de laboratoire : les I/O sont injectées, aucun vrai dépôt n'est lu. */
const depotFictif = ({
  backlog = '## Run 10 — x\n### 1-10. x\n', sujets = ['docs: close 1-10'], commits = 12,
  suite = 'test(\ntest(\n', plugins = ['a', 'b', 'c'], mutations = '  1. m\n  2. m\n',
} = {}) => compteursDuDepot({
  racine: '/aucune-racine',
  lire: (chemin) => (chemin.includes('backlog') ? backlog : suite),
  lister: () => plugins,
  execute: (bin, args) => {
    if (bin === 'git' && args[0] === 'rev-list') return `${commits}\n`;
    if (bin === 'git') return sujets.join('\n');
    return mutations;
  },
});

/** Une page de laboratoire, avec le bandeau et les tournures que la vraie porte. */
const pageFictive = ({ commits = 12, runs = 'dix', plugins = 'trois', gardes = 2,
                       mutations = 2, libre = 11, vidages = ['une'] } = {}) => `
  <p>argus-cc / branche · ${commits} commits · ${runs} runs · ${plugins} plugins</p>
  <pre>├── run-guards.test.mjs ← ${gardes} gardes sur les décisions
├── mutate-run-guards.py ← ${mutations} mutations : les gardes gardent-ils ?</pre>
  <p><strong>Le prochain numéro libre
      est ${libre}</strong> : le registre oublie ce qu'il ferme.</p>
  ${vidages.map((v) => `<p>Le backlog s'est vidé ${v} fois.</p>`).join('\n')}`;

const ecartsDe = (page, depot) => ecarts(compteursDeLaPage(texteDeLaPage(page)), depot);

test('nombreFr lit les lettres, et LÈVE plutôt que de rendre zéro (333)', () => {
  assert.equal(nombreFr('333'), 333);
  assert.equal(nombreFr('quarante et une'), 41, 'la page écrit le féminin, le backlog l\'ordinal');
  assert.equal(nombreFr('quarante-deux'), 42);
  assert.equal(nombreFr('quarante et unième'), 41, 'et l\'ordinal doit valoir le cardinal');
  // ⚠️ quatre-vingt-dix ne vaut pas 4 + 20 + 10 : sans le cas spécial il rendrait 34,
  // c'est-à-dire un nombre plausible — la pire des réponses fausses.
  assert.equal(nombreFr('quatre-vingt-dix'), 90);
  // L'autre moitié, et c'est elle qui compte : un mot inconnu doit LEVER. S'il
  // rendait 0 ou null, une reformulation passerait pour un compteur juste.
  assert.throws(() => nombreFr('zorglub'), /non reconnu/, 'un mot inconnu doit lever');
  assert.throws(() => nombreFr(''), /vide/, 'une capture vide aussi');
});

test('texteDeLaPage retrouve un compteur coupé par une balise et replié (333)', () => {
  const page = pageFictive({ libre: 333 });
  // La contre-épreuve d'abord : sur le HTML BRUT, la tournure n'existe pas. Sans
  // ce constat on croirait le traitement facultatif — il est ce qui fait tout.
  assert.doesNotMatch(page, /prochain numéro libre est/,
    'le brut ne porte pas la tournure : elle est coupée par une balise et un repli');
  assert.match(texteDeLaPage(page), /prochain numéro libre est 333/,
    'une fois détagué et aplati, le compteur doit se lire');
});

test('un compteur ancré doit être exact à CHAQUE occurrence (333)', () => {
  const depot = depotFictif({ commits: 12 });
  assert.deepEqual(ecartsDe(pageFictive({ commits: 12 }), depot), [], 'une page juste ne signale rien');

  const faux = ecartsDe(pageFictive({ commits: 9 }), depot);
  assert.equal(faux.length, 1, 'un commit de retard doit être vu');
  assert.equal(faux[0].cle, 'commits');
  assert.equal(faux[0].genre, 'périmé');
  assert.match(faux[0].message, /9.*12|12.*9/, 'le message doit porter les deux chiffres, pas seulement l\'alerte');
});

test('le régime journal tolère un bilan passé et refuse qu\'il DEVANCE (333)', () => {
  const depot = depotFictif({ sujets: Array.from({ length: 41 }, (_, i) => `docs: close ${i + 1}`), backlog: '## Run 41 — x\n### 41. x\n' });
  assert.equal(depot.vidages, 41);

  // ⚠️ Le cas qui a failli faire corriger du texte correct : la vraie page dit
  // « le backlog s'est vidé huit fois » sous le titre « ce que huit runs ont
  // établi ». C'est un bilan à sa date, pas un compteur périmé.
  assert.deepEqual(ecartsDe(pageFictive({ libre: 42, runs: 'quarante et un', vidages: ['huit', 'quarante et une'] }), depot), [],
    'un bilan d\'histoire plus petit est légitime dans un journal');

  const enRetard = ecartsDe(pageFictive({ libre: 42, runs: 'quarante et un', vidages: ['huit', 'trente-cinq'] }), depot);
  assert.equal(enRetard.length, 1, 'mais la mention la PLUS RÉCENTE doit être à jour');
  assert.equal(enRetard[0].genre, 'périmé');

  const devance = ecartsDe(pageFictive({ libre: 42, runs: 'quarante et un', vidages: ['cinquante'] }), depot);
  assert.equal(devance.length, 1);
  assert.equal(devance[0].genre, 'impossible', 'un journal ne peut pas raconter plus de passes qu\'il n\'y en a eu');
});

test('un motif qui ne trouve plus rien ÉCHOUE, il ne se tait pas (333)', () => {
  const depot = depotFictif();
  // La page a été reformulée : « prochain numéro libre » n'y est plus.
  const reformulee = pageFictive().replace('Le prochain numéro libre\n      est', 'Le numéro suivant est');
  const vus = ecartsDe(reformulee, depot);
  const vacant = vus.find((e) => e.cle === 'numeroLibre');
  assert.ok(vacant, 'une tournure disparue doit être signalée, pas ignorée');
  assert.equal(vacant.genre, 'introuvable');
  assert.match(vacant.message, /COMPTEURS/, 'et le message doit dire OÙ mettre le motif à jour');
});

test('les compteurs ancrés ignorent les mentions ORDINAIRES du même mot (333)', () => {
  // ⚠️ La moitié qu'on oublie. « N gardes » apparaît seize fois dans la vraie
  // page et « N runs » plus de cinquante — un motif de famille les capterait
  // toutes et ferait rougir le contrôle sur de la prose correcte, ce qui est la
  // façon la plus sûre d'apprendre à l'ignorer.
  const prose = texteDeLaPage(`<p>Les deux runs ont buté au même endroit. Neuf flows sur neuf,
    401 gardes du projet, et trois gardes écrits ce jour-là sont nés vacants.
    Vingt-cinq runs plus tard, 26 runs avaient publié leur page.</p>`);
  const releve = compteursDeLaPage(prose);
  assert.deepEqual(releve.get('runs').valeurs, [], 'aucune de ces mentions de « runs » n\'est le compteur');
  assert.deepEqual(releve.get('gardes').valeurs, [], 'ni « 401 gardes », qui décrit un terrain');
  // Et l'autre sens : sur une page qui porte VRAIMENT le bandeau, il est capté.
  const vraie = compteursDeLaPage(texteDeLaPage(pageFictive({ gardes: 7 })));
  assert.deepEqual(vraie.get('gardes').valeurs, [7], 'le compteur ancré, lui, doit être lu');
});

test('les deux sources du numéro libre doivent s\'accorder AVANT la page (333)', () => {
  // Le backlog mène à 11, les commits de clôture à 21 : une passe a fermé des
  // points sans les inscrire. Comparer à la page n'aurait aucun sens tant que
  // le dépôt ne s'accorde pas avec lui-même.
  const brouille = depotFictif({ backlog: '## Run 10 — x\n### 1-10. x\n', sujets: ['docs: close 1-10', 'docs: close 11-20'] });
  const vus = ecarts(compteursDeLaPage(texteDeLaPage(pageFictive({ libre: 11 }))), brouille);
  const desaccord = vus.find((e) => e.genre === 'sources en désaccord');
  assert.ok(desaccord, 'un dépôt qui se contredit doit le dire avant de juger la page');
  assert.match(desaccord.message, /11.*21|21.*11/);
  // L'autre moitié : quand les deux sources s'accordent, aucun bruit.
  assert.equal(ecartsDe(pageFictive({ libre: 11 }), depotFictif()).length, 0);
});

test('la dérivation tient sur le VRAI dépôt, et ses deux sources s\'accordent (333)', () => {
  // ⚠️ Ce garde-ci est le seul à toucher le dépôt réel, et c'est pour cela qu'il
  // vaut : il attrape le jour où le backlog change de forme de titre, où la
  // suite renomme ses tests, ou où le harnais perd son `--list`. Il n'assère
  // AUCUNE valeur figée — un `commits === 367` serait faux au commit suivant.
  const vrai = compteursDuDepot({ racine: RACINE });
  assert.ok(vrai.commits > 300, `le compte de commits doit venir d'un dépôt complet, reçu ${vrai.commits}`);
  // ⚠️ Ce garde rougit AUSSI pendant la fenêtre normale d'une passe : entre le
  // moment où l'on inscrit une clôture au backlog et celui où on la commite,
  // les deux sources divergent d'un point. Ce n'est pas un bug, c'est le rappel
  // de commiter — et c'est le seul état où le désaccord est légitime.
  assert.equal(vrai.numeroLibre, vrai.numeroLibreSelonLesCommits,
    `le backlog mène à ${vrai.numeroLibre} et les commits de clôture à ${vrai.numeroLibreSelonLesCommits} : `
    + 'soit la clôture n\'est pas encore commitée (commite, le garde redevient vert), '
    + 'soit une passe a fermé des points sans les inscrire');
  assert.ok(vrai.gardes > 250, 'les gardes de cette suite doivent se compter');
  assert.ok(vrai.mutations > 150, 'et les mutations du harnais aussi');
  assert.equal(vrai.plugins, 3, 'trois plugins : argus, argus-mobile, argus-web');
  assert.ok(vrai.runs >= 42, `le dernier run cité par le backlog, reçu ${vrai.runs}`);
});

test('la confidentialité mesure le PHÉNOMÈNE, pas une liste de noms (333)', () => {
  // ⚠️ Le défaut d'origine : le contrôle était une liste de noms interdits, et
  // une liste ne connaît que ce qu'on y a mis. Elle laisse passer le nom
  // suivant — celui auquel personne n'a encore pensé. Ces quatre-là n'ont
  // jamais été inscrits nulle part et doivent pourtant tomber.
  const { fuites } = fuitesDe(texteDeLaPage(`<p>argus a tourné sur com.exemple.autreapp,
    AVD Exemple_API34, depuis /Users/quelquun/dev, contre 192.168.1.42:5555.</p>`));
  const valeurs = fuites.map((f) => f.valeur);
  assert.ok(valeurs.includes('com.exemple.autreapp'), 'un bundle id doit tomber');
  assert.ok(valeurs.includes('Exemple_API34'), "un nom d'AVD aussi");
  assert.ok(valeurs.includes('/Users/quelquun'), 'un chemin de machine porte un nom de compte');
  assert.ok(valeurs.includes('192.168.1.42:5555'), "l'adresse d'une machine aussi");
});

test('la confidentialité ne rougit pas sur les clés de config du skill (333)', () => {
  // La moitié qu'on oublie, et celle qui décide si l'outil sera utilisé : un
  // motif à trois segments quelconques capterait les clés du skill, donc
  // crierait au loup à chaque page. C'est la borne en TLD inversé qui l'évite.
  const propre = texteDeLaPage(`<p>argus lit auth.anchors.success, config.build.android,
    ro.build.version.sdk, argus.mobile.yaml et report.artifact.html.</p>`);
  assert.deepEqual(fuitesDe(propre).fuites, [], 'aucune de ces clés n\'est un identifiant de projet');
});

test('une exception explicite passe, et meurt quand elle ne sert plus (333)', () => {
  const avec = fuitesDe(texteDeLaPage('<p>argus : com.exemple.app sur AutreProjet_API30</p>'));
  assert.deepEqual(avec.fuites, [], 'le générique déclaré doit passer');
  assert.deepEqual(avec.mortes, [], 'et les deux exceptions sont servies');

  // ⚠️ Une exception qui survit à ce qu'elle décrivait devient une permission
  // permanente — le défaut que ce projet traque partout ailleurs.
  const sans = fuitesDe(texteDeLaPage('<p>argus n\'y cite plus aucun exemple.</p>'));
  assert.equal(sans.mortes.length, EXCEPTIONS.length, 'une exception inutilisée doit être signalée');
  assert.ok(sans.mortes.every((m) => m.pourquoi.length > 0), 'et porter la raison de son existence');
});

test('le balayage prouve qu\'il VOIT avant de dire qu\'il n\'a rien vu (333)', () => {
  // Sans témoin, une page vide ou lue de travers rend « rien d'interdit »,
  // c'est-à-dire précisément le verdict qu'on espère.
  assert.equal(fuitesDe('du texte sans rapport').instrumentAveugle, true,
    'une page où le témoin manque ne permet aucun verdict');
  assert.equal(fuitesDe('une page du chantier argus').instrumentAveugle, false,
    'et une vraie page doit pouvoir être jugée');
});

test('un littéral Dart survit à une interpolation qui porte des apostrophes (338)', () => {
  // ⚠️ Le défaut fermé : `'([^']*)'` ne sait pas qu'une apostrophe INTERNE à une
  // interpolation ne ferme pas la chaîne. Sur du Dart parfaitement légal, le
  // relevé rendait « } » comme une ancre posée — et le run a réécrit SON code
  // pour contourner NOTRE motif, ce qui est le sens inverse de ce qu'un outil
  // de mesure doit faire.
  assert.deepEqual(litterauxDart("cond ? null : '${prefix}_${x ?? 'all'}'"),
    ["${prefix}_${x ?? 'all'}"],
    'la chaîne doit être lue ENTIÈRE, apostrophes de l\'interpolation comprises');
  // L'autre moitié, et c'est elle qui dirait qu'on a trop coupé : les deux formes
  // que le §2c-bis PRESCRIT doivent continuer de rendre leurs littéraux.
  assert.deepEqual(litterauxDart("vide ? 'home_empty_root' : 'home_filled_root'"),
    ['home_empty_root', 'home_filled_root'], 'le ternaire à deux états reste lu');
  assert.deepEqual(litterauxDart("'simple'"), ['simple']);
  assert.deepEqual(litterauxDart('nothing here'), [], 'un argument sans chaîne ne rend rien');
});

test('le relevé d\'ancres ne rend plus « } » sur une interpolation (338)', () => {
  const racine = mkdtempSync(join(tmpdir(), 'argus-ancres-'));
  mkdirSync(join(racine, 'lib'), { recursive: true });
  writeFileSync(join(racine, 'lib', 'p.dart'), [
    "Semantics(identifier: 'ancre_saine', child: X());",
    "Semantics(identifier: cond ? null : '${prefix}_${x ?? 'all'}', child: X());",
    "Semantics(identifier: vide ? 'home_empty_root' : 'home_filled_root', child: X());",
  ].join('\n'));
  const vus = posedAnchors(racine).sort();
  // Le garde porte sur la VALEUR rendue, pas sur la présence du motif.
  assert.deepEqual(vus, ['ancre_saine', 'home_empty_root', 'home_filled_root'],
    'une interpolation est une famille : elle ne pose ni ancre ni accolade');
  rmSync(racine, { recursive: true, force: true });
});

test('un secret VIDE ne s\'affiche pas comme un secret plein (337)', () => {
  // ⚠️ L'ancien masquage remplaçait tout après le `=` sans regarder la valeur :
  // un secret ABSENT s'affichait `QA_PHONE=***`, à l'identique d'un secret
  // présent — exactement à l'endroit où l'on regarde pour vérifier. Coût mesuré
  // par un run : sept minutes de device et un login sauté sans un mot.
  const vu = masquerSecrets(['-e', 'QA_PHONE=', '-e', 'QA_PIN=1234', '-e', 'ARGUS_AUTH_READY=1']);
  assert.ok(vu.includes('QA_PHONE=<VIDE>'), 'un secret vide doit se voir comme vide');
  assert.ok(vu.includes('QA_PIN=***'), 'et un secret plein rester masqué');
  // L'autre moitié : le remède ne doit pas faire fuir ce qu'il masquait.
  assert.doesNotMatch(vu.join(' '), /1234/, 'la valeur d\'un secret plein ne doit jamais s\'imprimer');
  assert.ok(vu.includes('ARGUS_AUTH_READY=1'), 'et ce qui n\'est pas un secret reste lisible');
});

test('les secrets déclarés mais vides sont NOMMÉS, pas tus (337)', () => {
  assert.deepEqual(secretsVides({ QA_PHONE: '', QA_PIN: '1234', ARGUS_X: '' }), ['QA_PHONE'],
    'seuls les secrets QA_ vides comptent — ARGUS_X vide est une valeur, pas un secret manquant');
  // L'autre moitié : ne rien dire quand tout est là, sinon l'avertissement s'ignore.
  assert.deepEqual(secretsVides({ QA_PHONE: '06', QA_PIN: '1234' }), [],
    'un environnement complet ne doit produire AUCUN avertissement');
  assert.deepEqual(secretsVides(undefined), [], 'et un environnement absent ne doit pas lever');
});

test('le clavier qui DÉPLACE est nommé là où on lit celui qui CACHE (334)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const plat = skill.replace(/\s+/g, ' ');
  // ⚠️ Le critère est STRUCTUREL — la proximité —, pas la présence. Le skill
  // décrivait déjà le cas bruyant (« un clavier ouvert recouvre le bouton ») ;
  // ce qui manquait est le cas SILENCIEUX, où le tap RÉUSSIT sur un autre
  // widget. Écrit ailleurs, il ne serait pas lu au moment où il sert.
  const cache = plat.indexOf('hideKeyboard');
  assert.ok(cache > 0, 'le passage hideKeyboard a disparu — mets ce garde à jour');
  const deplace = plat.indexOf("LE PIRE N'EST PAS QU'IL CACHE");
  assert.ok(deplace > 0, 'le cas « le clavier DÉPLACE un élément flottant » doit être écrit');
  assert.ok(deplace - cache > 0 && deplace - cache < 3000,
    `les deux cas doivent se lire ensemble : ${deplace - cache} caractères les séparent`);
  // Et il doit porter le GESTE, pas seulement le diagnostic.
  const bloc = plat.slice(deplace, deplace + 2500);
  assert.match(bloc, /ouvre le clavier en DERNIER/, 'le remède doit être prescrit, pas déduit');
  assert.match(bloc, /regarde la capture/, 'et le geste de diagnostic aussi : le message d\'erreur ment');
});

test('le conseil sur startTimeoutMs dit ce que firstLaunchMs MESURE (336)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const plat = skill.replace(/\s+/g, ' ');
  const i = plat.indexOf('MESURE LA PREMIÈRE FRAME');
  assert.ok(i > 0, 'la seconde cause — la GRANDEUR, pas la dispersion — doit être écrite');
  const bloc = plat.slice(i, i + 1200);
  // ⚠️ Ce qui rendait ce garde nécessaire : le skill expliquait déjà l'instabilité
  // par la charge de l'hôte. L'explication était juste, et c'est elle qui a fait
  // cesser de chercher — deux causes indépendantes du même symptôme.
  // ⚠️ Sur la PRESCRIPTION, pas sur le token : `startup.samples` apparaît deux
  // fois dans la même phrase, si bien qu'une mutation qui n'en retirait qu'une
  // laissait ce garde vert. C'est le harnais qui l'a dit, pas une relecture.
  assert.match(bloc, /c'est `startup\.samples` qui commande/,
    'la bonne grandeur doit être PRESCRITE, pas seulement mentionnée');
  assert.match(bloc, /sur les deux plateformes/,
    'et la prescription doit valoir des deux côtés, sans quoi elle rejoue le trou du 279');
  assert.match(bloc, /indépendante de la charge/, 'et distinguée de la cause déjà écrite');
});

test('l\'installeur rappelle comment fermer un TODO, et SEULEMENT s\'il en reste (341)', () => {
  // ⚠️ Garde d'EXÉCUTION, pas de texte : il lance l'installeur et lit ce qui sort.
  // Un garde qui aurait cherché la phrase dans le script serait resté vert avec
  // le bloc posé au mauvais endroit — ce qui est arrivé en l'écrivant : la
  // variable était testée dans le `case`, trois lignes AVANT que la fonction qui
  // la renseigne ne soit appelée.
  const hote = mkdtempSync(join(tmpdir(), 'argus-todo-'));
  writeFileSync(join(hote, 'pubspec.yaml'), 'name: hote\n');
  const installeur = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/scripts/install-mobile.sh');
  execFileSync('bash', [installeur, hote], { encoding: 'utf8' });

  const check = () => execFileSync('bash', [installeur, '--check', hote], { encoding: 'utf8' });
  assert.match(check(), /TODO\(argus\) se FERME/,
    'des TODO restent ouverts : le rappel doit s\'afficher là où on lit le compte');

  // L'autre moitié, et c'est elle qui prouve que le premier n'est pas un décor :
  // tous les TODO fermés, le rappel doit se TAIRE.
  for (const f of readdirSync(hote, { recursive: true, withFileTypes: true })) {
    if (!f.isFile()) continue;
    const p = join(f.parentPath ?? f.path, f.name);
    let t;
    try { t = readFileSync(p, 'utf8'); } catch { continue; }
    const ferme = t.replace(/TODO\(argus\): (?!SANS OBJET|FAIT|TRAITÉ)/g, 'TODO(argus): FAIT — ');
    if (ferme !== t) writeFileSync(p, ferme);
  }
  assert.doesNotMatch(check(), /TODO\(argus\) se FERME/,
    'plus rien à fermer : un rappel qui parle toujours finit ignoré');
  rmSync(hote, { recursive: true, force: true });
});

test('le compteur de runs lit aussi la désignation COLLECTIVE (333)', () => {
  // ⚠️ Trouvé par l'outil lui-même : `\brun\s+` exige une espace après « run »,
  // donc il ratait « Runs 43 et 44 » — la façon dont on nomme une CAMPAGNE. Le
  // compteur est resté à 42 le jour où deux runs venaient d'être joués. Une
  // énumération dérivée du réel rate quand même les désignations collectives.
  assert.equal(dernierRunDu('## Run 42 — x'), 42, 'le singulier doit continuer de marcher');
  assert.equal(dernierRunDu('**Runs 43 et 44**, en parallèle'), 44, 'le pluriel et l\'énumération aussi');
  assert.equal(dernierRunDu('les runs 39/40 puis le run 41'), 41, 'et la barre oblique');
  assert.equal(dernierRunDu('Run 7. Puis Runs 43 et 44.'), 44, 'le MAXIMUM, pas le dernier cité');
  // L'autre moitié : ne pas inventer un run là où il n'y en a pas.
  assert.throws(() => dernierRunDu('aucun numéro ici'), /aucun run cité/,
    'un backlog sans run doit lever, pas rendre zéro');
});

test('un paquet plus VIEUX que lib/ est déclaré périmé, pas « intact » (343)', () => {
  // ⚠️ Garde d'EXÉCUTION : il lance le script et lit ce qu'il rend. Un garde de
  // texte serait resté vert avec le drapeau posé APRÈS `parseArgs`, qui refuse
  // les options inconnues — c'est ce qui est arrivé en l'écrivant, et seul
  // l'appel réel l'a dit (« ✖ option inconnue »).
  //
  // Le défaut fermé : `argus-build` disait « PAQUET INTACT — même empreinte » et
  // ne proposait `flutter clean` QUE si la commande avait changé (ABI, flavor,
  // flags). Un run a perdu ~35 min d'appareil sur un binaire qui n'était pas le
  // sien : la commande n'avait pas bougé, c'est `lib/` qui avait changé.
  const hote = mkdtempSync(join(tmpdir(), 'argus-fresh-'));
  writeFileSync(join(hote, 'pubspec.yaml'), 'name: h\n');
  execFileSync('bash', [join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/scripts/install-mobile.sh'), hote],
    { encoding: 'utf8' });

  const apk = join(hote, 'build/app/outputs/flutter-apk/app-debug.apk');
  mkdirSync(join(hote, 'build/app/outputs/flutter-apk'), { recursive: true });
  mkdirSync(join(hote, 'lib'), { recursive: true });
  const cfg = join(hote, 'argus.mobile.yaml');
  writeFileSync(cfg, readFileSync(cfg, 'utf8')
    .replace(/^(\s*)#?\s*android:\s*build\/.*$/m, '$1android: build/app/outputs/flutter-apk/app-debug.apk'));

  const verdict = () => execFileSync('node', ['scripts/argus/sec.mjs', '--print-freshness'],
    { cwd: hote, encoding: 'utf8' }).trim();

  writeFileSync(apk, 'x');
  writeFileSync(join(hote, 'lib', 'main.dart'), 'void main() {}\n');   // source PLUS RÉCENTE
  assert.equal(verdict(), 'perime', 'lib/ plus récent que le paquet ⇒ périmé — c\'est le cas du run 45');

  writeFileSync(apk, 'y');                                            // paquet reconstruit
  assert.equal(verdict(), 'frais', 'paquet plus récent ⇒ frais, sinon le garde crierait toujours');

  // La troisième issue compte autant : sans binaire, il se TAIT plutôt que de
  // trancher — un « frais » inventé vaudrait pire que pas de mesure.
  rmSync(apk);
  assert.equal(verdict(), 'inconnu', 'aucun paquet ⇒ inconnu, jamais un verdict');
  rmSync(hote, { recursive: true, force: true });
});

test('la contre-épreuve à cinq secondes vient AVANT les trois causes (344, 345)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const plat = skill.replace(/\s+/g, ' ');
  // ⚠️ Critère STRUCTUREL : l'ordre, pas la présence. La commande existait déjà
  // dans le document — 430 lignes après la liste des causes, donc après le
  // moment où l'on en a besoin. Un run a payé ~35 min pour la retrouver.
  const contre = plat.indexOf('maestro hierarchy | grep -c');
  const causes = plat.indexOf('TROIS causes, et la plus chère');
  assert.ok(contre > 0, 'la contre-épreuve doit être écrite');
  assert.ok(causes > 0, 'la liste des trois causes a changé de forme — mets ce garde à jour');
  assert.ok(contre > causes && contre - causes < 1200,
    `elle doit suivre immédiatement l'annonce des causes, pas vivre ailleurs (écart ${contre - causes})`);
  // 345 : et elle doit dire d'ANCRER le motif — c'est ce qui manquait.
  const bloc = plat.slice(causes, causes + 1800);
  assert.match(bloc, /sous-chaîne/, 'le piège de la sous-chaîne doit être nommé là où l\'on compte');
  assert.match(bloc, /ancrant le motif|ancrer le motif/, 'et le geste qui l\'évite prescrit');
});

test('le piège du dartdoc est rappelé LÀ OÙ l\'on édite ces fichiers (346)', () => {
  const skill = readFileSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const plat = skill.replace(/\s+/g, ' ');
  const rappel = plat.indexOf('leur dartdoc porte un exemplaire MOT POUR MOT');
  const todo = plat.indexOf('UN TODO SE FERME');
  assert.ok(rappel > 0, 'le rappel doit exister au §3c');
  assert.ok(todo > 0 && rappel < todo && todo - rappel < 900,
    'il doit précéder immédiatement la consigne de remplir ces fichiers');
  assert.match(plat.slice(rappel, todo), /ARGUS:DECLARATION/,
    'et nommer le marqueur sur lequel s\'ancrer, sinon il décrit le piège sans le fermer');
});


// ── B2 · la notation d'une CVE, et le repli que le chemin nominal sautait ──
// Une vulnérabilité OSV porte son score sous forme de VECTEUR (`CVSS:3.1/…`),
// jamais de nombre : c'est la forme dominante, pas le cas limite. Tant que
// `cvssOf` sortait sur ce vecteur, le repli `database_specific.severity` écrit
// deux lignes plus bas n'était JAMAIS atteint — toute CVE, même `low`,
// ressortait `major` et franchissait n'importe quel `scaFailOn`.
const VULN_LOW = {
  id: 'GHSA-xxxx-yyyy-zzzz',
  summary: 'quelque chose de bénin',
  severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:N/A:N' }],
  database_specific: { severity: 'LOW' },
};

test('une CVE dont le score est un VECTEUR se lit quand même par sa bande nommée', () => {
  assert.equal(cvssOf(VULN_LOW), 0, 'le repli database_specific doit être atteint');
  assert.equal(bandOf(cvssOf(VULN_LOW)).band, 'low');
});

test('un score NUMÉRIQUE l\'emporte toujours sur la bande nommée', () => {
  // L'ordre compte : un chiffre publié est plus précis qu'une bande.
  const precis = { severity: [{ score: '9.8' }], database_specific: { severity: 'LOW' } };
  assert.equal(cvssOf(precis), 9.8);
  assert.equal(bandOf(9.8).band, 'critical');
});

test('sans score NI bande nommée, on ne devine pas — `unknown`, donc jugé', () => {
  // L'autre moitié : ne pas transformer ce correctif en « tout devient low ».
  assert.equal(cvssOf({ severity: [{ score: 'CVSS:3.1/AV:N' }] }), null);
  assert.equal(bandOf(null).band, 'unknown');
  assert.equal(bandOf(null).severity, 'major', 'une CVE non notée reste traitée comme grave');
});

test('scaFailOn écarte réellement ce qui est sous le seuil (B2)', () => {
  const resultats = [{
    source: { path: 'pubspec.lock' },
    packages: [{ package: { name: 'paquet', version: '1.0.0' }, vulnerabilities: [VULN_LOW] }],
  }];
  const sousSeuil = findingsFromOsv(resultats, process.cwd(), 'high');
  assert.equal(sousSeuil.length, 1, 'la CVE est rapportée…');
  assert.equal(sousSeuil[0].severity, 'info',
    '…mais hors du gate : c\'est tout l\'objet de scaFailOn, et il ne filtrait rien');

  // Et l'autre sens, sans quoi « ne plus faire échouer » deviendrait le remède.
  const auSeuil = findingsFromOsv(resultats, process.cwd(), 'low');
  assert.equal(auSeuil[0].severity, 'info',
    'une bande `low` reste `info` même quand le seuil descend à low — c\'est sa sévérité propre');

  const grave = [{
    source: { path: 'pubspec.lock' },
    packages: [{
      package: { name: 'p', version: '1' },
      vulnerabilities: [{ id: 'X', severity: [{ score: '9.1' }] }],
    }],
  }];
  assert.equal(findingsFromOsv(grave, process.cwd(), 'high')[0].severity, 'critical',
    'une CVE réellement critique doit continuer de faire échouer');
});

// ── B1 · « pas pu mesurer » n'est pas « rien à conclure ici » ──────────────
// `--require-tools` existe pour qu'une dimension non exécutée ne passe pas pour
// verte. Il confondait deux causes de non-scan : un défaut d'ENVIRONNEMENT
// (unzip absent, binaire jamais construit — réparable) et une DÉCISION du code
// (un debug, sur lequel un scan de sécurité ne dit rien de la publication).
// La CI livrée construisait un debug puis exigeait le scan : le job échouait
// par construction, sur un projet sain, au premier run.

test('--require-tools n\'échoue PAS sur ce que le code a décidé de ne pas juger (B1)', () => {
  const debug = auditApk(fauxApk(['assets/flutter_assets/kernel_blob.bin']), {}).facts;
  assert.equal(debug.scanned, false);
  assert.equal(debug.nature, 'sans-objet', 'un debug est une décision, pas une panne');
  assert.equal(exigenceNonTenue(debug), null,
    'exiger une analyse que le code refuse de rendre fait échouer un projet sain');
});

test('--require-tools échoue TOUJOURS sur un défaut d\'environnement (B1, l\'autre moitié)', () => {
  // Sans ce cas, « ne plus échouer sur un debug » deviendrait « ne plus jamais
  // échouer », c'est-à-dire le faux vert que ce flag existe pour empêcher.
  for (const facts of [
    { scanned: false, nature: 'environnement', why: 'unzip absent du PATH' },
    { scanned: false, nature: 'environnement', why: 'binaire absent (build/…apk)' },
    { scanned: false, why: 'forme ancienne, sans nature' },
  ]) {
    const message = exigenceNonTenue(facts);
    assert.ok(message, `doit échouer : ${facts.why}`);
    assert.match(message, /require-tools/);
    assert.match(message, new RegExp(facts.why.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'et le message doit porter la raison, pas seulement le flag');
  }
  assert.equal(exigenceNonTenue({ scanned: true }), null, 'un scan réussi ne déclenche rien');
});

test('binaryScanPlan dit la NATURE de son refus, pas seulement sa raison (B1)', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'argus-nature-'));
  const apk = join(dossier, 'app-release.apk');
  writeFileSync(apk, 'PK');
  const config = { platforms: ['android'], build: { androidBuildCmd: 'flutter build apk --debug' } };

  assert.equal(binaryScanPlan('ios', '/p/x.app', '/p', config, true).nature, 'sans-objet',
    'le harnais ne sait pas lire un bundle iOS : aucun outil posé n\'y changera rien');
  assert.equal(binaryScanPlan('android', join(dossier, 'absent.apk'), dossier, config, true).nature,
    'environnement', 'un binaire jamais construit se répare');
  assert.equal(binaryScanPlan('android', apk, dossier, config, false).nature,
    'environnement', 'un unzip manquant se répare');
  assert.equal(binaryScanPlan('android', apk, dossier, config, true).nature, 'ok');
  rmSync(dossier, { recursive: true, force: true });
});

test('la CI n\'exige pas un scan binaire du paquet qu\'elle vient de construire en DEBUG (B1)', () => {
  // Garde de CÂBLAGE, dérivé plutôt que cité : on lit le workflow livré, on
  // découpe par job, et on refuse qu'un même job construise un debug puis exige
  // l'analyse binaire. C'est l'assemblage qui était faux, pas chaque moitié.
  const wf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.github/workflows/argus-mobile.yml'), 'utf8');
  // Commentaires ôtés : un exemple commenté n'est pas une étape exécutée.
  const utile = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const jobs = utile.split(/\n  (?=[a-z][a-z0-9-]*:\n)/);
  assert.ok(jobs.length > 3, 'le découpage par job n\'a rien trouvé — mets ce garde à jour');
  assert.ok(jobs.some((j) => /sec\.mjs/.test(j)), 'aucun job ne lance sec.mjs — le garde est vacant');

  // ⚠️ LE DÉTECTEUR EST EXTRAIT ET EXERCÉ DANS LES DEUX SENS. Écrit « il doit
  // exister un job qui passe --require-tools, et il ne doit pas construire de
  // debug », ce garde serait devenu VACANT le jour même : le correctif consiste
  // justement à retirer ce drapeau, donc la boucle n'aurait plus eu de sujet et
  // serait passée au vert sans rien vérifier.
  const combineLesDeux = (job) =>
    /sec\.mjs[^\n]*--require-tools/.test(job) && /flutter build apk --debug/.test(job);

  for (const job of jobs) {
    assert.ok(!combineLesDeux(job),
      'un job construit un debug ET exige l\'analyse binaire : elle ne peut pas conclure, exit 2 garanti');
  }
  // La contre-épreuve : le détecteur sait-il seulement dire oui ?
  assert.ok(combineLesDeux('  x:\n    steps:\n      - run: flutter build apk --debug\n'
    + '      - run: node scripts/argus/sec.mjs --require-tools\n'),
  'le détecteur ne reconnaît plus l\'assemblage qu\'il interdit — il ne garde plus rien');
});

test('la CVE et le scan de secrets ne se conditionnent à AUCUNE plateforme (B4)', () => {
  // Le job portait `if: android == true`, ce qui paraît juste — le niveau B lit
  // un APK — et coupait au passage trois contrôles qui ne dépendent d'aucune
  // plateforme. Un projet iOS-seul perdait TOUTE la dimension sécurité.
  const wf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.github/workflows/argus-mobile.yml'), 'utf8');
  // Commentaires ôtés : un exemple commenté n'est pas une étape exécutée.
  const utile = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const jobs = utile.split(/\n  (?=[a-z][a-z0-9-]*:\n)/);
  const porteurs = jobs.filter((j) => /sca\.mjs|sec\.mjs/.test(j) && !/^#/.test(j));
  assert.ok(porteurs.length > 0, 'aucun job ne lance sca.mjs/sec.mjs — le garde ne mesure plus rien');
  for (const job of porteurs) {
    const entete = job.split('steps:')[0];
    assert.ok(!/^\s+if:.*outputs\.(android|ios)/m.test(entete),
      'ce job porte la sécurité ET une condition de plateforme : sur l\'autre plateforme, '
      + 'le scan de secrets et les CVE disparaissent sans que rien ne le dise');
  }
});

// ── B3 · l'AVD que la CI doit créer, dérivé comme ses deux voisins ────────
// Le scaffold exige en majuscules de renseigner `devices[].avd` — la seule
// identité stable en local — pendant que l'action qui provisionne l'émulateur
// en CI crée un AVD portant SON nom. `resolveByAvd` ne trouvait donc rien, et
// le job échouait sur la configuration même que la doc prescrit.

test('ciEmulator rend l\'AVD déclaré, pas seulement api-level et profile (B3)', () => {
  const avec = ciEmulator({
    platforms: ['android'],
    devices: [{ id: 'a', platform: 'android', avd: 'Medium_Phone_API_36', model: 'pixel_6', os: 'android-36' }],
  });
  assert.equal(avec.ok, true);
  assert.equal(avec.apiLevel, '36');
  assert.equal(avec.profile, 'pixel_6');
  assert.equal(avec.avdName, 'Medium_Phone_API_36',
    'sans lui, la CI crée un AVD que le runner ne reconnaîtra pas');

  // ⚠️ LE CAS RECOMMANDÉ EST CELUI-CI : un `avd` nommé, `model`/`os` vides —
  // c'est ce que le scaffold conseille, donc le plus fréquent. Il passe par
  // l'autre branche de retour, celle qui retombe sur les défauts du workflow.
  const nu = ciEmulator({
    platforms: ['android'],
    devices: [{ id: 'a', platform: 'android', avd: 'MonAvd' }],
  });
  assert.equal(nu.ok, true);
  assert.equal(nu.avdName, 'MonAvd', 'la branche « défauts du workflow » oubliait l\'AVD');

  // Et sans AVD déclaré : chaîne vide, jamais undefined — l'appelant retombe
  // alors sur le défaut de l'action, ce qui est le comportement d'avant.
  assert.equal(ciEmulator({
    platforms: ['android'], devices: [{ id: 'a', platform: 'android', model: 'pixel_6', os: 'android-33' }],
  }).avdName, '');
});

test('le workflow crée l\'émulateur sous le nom que la config déclare (B3)', () => {
  const wf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.github/workflows/argus-mobile.yml'), 'utf8');
  const utile = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  // La source est la MÊME que pour ses deux voisins : c'est ce qui empêche le
  // geste outillé de diverger du geste configuré.
  assert.match(utile, /avd-name:/, 'l\'action provisionne un AVD sans que la config le nomme');
  const etape = utile.slice(utile.indexOf('android-emulator-runner'));
  const bloc = etape.slice(0, etape.indexOf('script:'));
  for (const cle of ['api-level:', 'profile:', 'avd-name:']) {
    assert.ok(bloc.includes(cle), `${cle} manque au bloc qui provisionne l'émulateur`);
    assert.match(bloc.slice(bloc.indexOf(cle)), /^[^\n]*steps\.appareil\.outputs/,
      `${cle} n'est pas dérivé de la config — c'est ainsi que l'AVD avait divergé`);
  }
});

// ── M1 · un contrôle qui n'a rien lu ne conclut pas ───────────────────────
// `--check-flows` refuse explicitement de conclure sur zéro flow (« le contrôle
// n'a rien mesuré », exit 2). Son voisin `--check-anchors`, quatre-vingts lignes
// plus loin dans le MÊME fichier, rendait `✔ toute ancre est déclarée (0 lue)`
// et sortait en 0 dès que `lib/` n'existait pas — sur un monorepo, ou lancé du
// mauvais répertoire. Le remède était pensé local alors que l'erreur était une
// manière de conclure.

const CONFIG_MINIMALE = [
  'app:', '  androidPackage: com.exemple.monapp', 'platforms:', '  - android',
  'devices:', '  - id: a', '    platform: android', '    avd: MonAvd',
  'screens:', '  - id: home', '    anchor: home_root', '',
].join('\n');

/** Un projet jetable, avec ou sans `lib/`. Rend son chemin. */
const projetJetable = ({ avecLib }) => {
  const dir = mkdtempSync(join(tmpdir(), 'argus-anchors-'));
  writeFileSync(join(dir, 'argus.mobile.yaml'), CONFIG_MINIMALE);
  writeFileSync(join(dir, 'pubspec.yaml'), 'name: mon_app\n');
  mkdirSync(join(dir, 'scripts/argus'), { recursive: true });
  const src = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus');
  for (const f of readdirSync(src)) cpSync(join(src, f), join(dir, 'scripts/argus', f));
  if (avecLib) {
    mkdirSync(join(dir, 'lib'), { recursive: true });
    writeFileSync(join(dir, 'lib/main.dart'),
      "import 'x';\nWidget b() => Semantics(identifier: 'home_root', child: X());\n");
    // ⚠️ Le croisement lit `harness.dart`, JAMAIS `screens[]` — et c'est voulu :
    // « déclaré » veut dire ici « monté par l'étage 1 ». La première version de
    // ce garde déclarait l'ancre dans `screens[]` et s'attendait à un vert :
    // exactement le contresens que `ancresOrphelinesReport` existe pour lever.
    mkdirSync(join(dir, 'test/argus'), { recursive: true });
    writeFileSync(join(dir, 'test/argus/harness.dart'),
      "final x = <ArgusScreen>[ArgusScreen(id: 'home', anchor: 'home_root')];\n");
  }
  return dir;
};

/** Lance `config.mjs <drapeau>` dans [dir] et rend son code de sortie. */
const codeDe = (dir, drapeau) => {
  try {
    execFileSync(process.execPath, ['scripts/argus/config.mjs', drapeau], { cwd: dir, stdio: 'pipe' });
    return 0;
  } catch (e) { return e.status ?? -1; }
};

test('--check-anchors REFUSE de conclure quand il n\'a lu aucun fichier (M1)', () => {
  const sansLib = projetJetable({ avecLib: false });
  assert.notEqual(codeDe(sansLib, '--check-anchors'), 0,
    'un ✔ vert sur zéro fichier lu est un garde vacant : c\'est la pastille qu\'on lit, pas le « (0 lue) »');
  rmSync(sansLib, { recursive: true, force: true });
});

test('--check-anchors conclut normalement dès qu\'il a de quoi mesurer (M1, l\'autre moitié)', () => {
  // Sans ce cas, « refuser de conclure sur zéro » deviendrait « refuser toujours ».
  const avecLib = projetJetable({ avecLib: true });
  assert.equal(codeDe(avecLib, '--check-anchors'), 0,
    'une ancre posée ET déclarée dans screens[] doit passer');
  rmSync(avecLib, { recursive: true, force: true });
});

// ── M2 · reconnaître SA copie sans dépendre d'une phrase de prose ─────────
// L'installeur reconnaissait sa copie par « la première ligne de la source qui
// contient argus ». Reformuler un en-tête change donc la signature : chez tous
// les hôtes DÉJÀ installés, le fichier bascule en « pas d'origine Argus », plus
// jamais remplacé par --update, jamais compté en retard par --check, CI verte.
// C'est la seconde moitié de la règle qui tombe, et elle tombe en silence.

const INSTALLEUR = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/scripts/install-mobile.sh');
const installe = (cible, ...args) =>
  execFileSync('bash', [INSTALLEUR, cible, ...args], { encoding: 'utf8', stdio: 'pipe' });

test('un fichier de cadre reste MIEN quand la source reformule son en-tête (M2)', () => {
  const hote = mkdtempSync(join(tmpdir(), 'argus-sig-'));
  writeFileSync(join(hote, 'pubspec.yaml'), 'name: hote\n');
  installe(hote);

  const local = join(hote, 'scripts/argus/config.mjs');
  assert.ok(existsSync(local), 'le scaffold n\'a pas été posé — le montage est cassé');

  // On simule une reformulation d'en-tête CÔTÉ HÔTE : la copie posée vient
  // d'une version dont la ligne de signature était rédigée autrement.
  const pose = readFileSync(local, 'utf8').split('\n');
  // ⚠️ On reformule la PROSE, pas le marqueur : c'est ce qui arrive en vrai, et
  // la première version de ce garde écrasait `ARGUS:CADRE` lui-même — elle
  // simulait donc un fichier qu'on aurait délibérément dé-marqué, pas une
  // reformulation d'en-tête.
  const iSig = pose.findIndex((l) => /argus/i.test(l) && !l.includes('ARGUS:CADRE'));
  assert.ok(iSig >= 0, 'la copie ne porte aucune trace d\'Argus — le garde ne mesure plus rien');
  pose[iSig] = ' * Argus Mobile — socle partagé (formulation d\'une version antérieure)';
  writeFileSync(local, pose.join('\n'));

  const sortie = installe(hote, '--update');
  assert.ok(!/pas d'origine Argus[^\n]*config\.mjs/.test(sortie),
    'une reformulation d\'en-tête a suffi à faire renier la copie : elle ne sera plus jamais mise à jour');
  assert.equal(readFileSync(local, 'utf8'), readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs'), 'utf8'),
  '--update doit avoir remis la version du plugin');
  rmSync(hote, { recursive: true, force: true });
});

test('le marqueur est la PREMIÈRE ligne qui se nomme, dans chaque fichier de cadre (M2)', () => {
  // ⚠️ CE GARDE EXISTE PARCE QUE LE HARNAIS DE MUTATION A DIT « VACANT ». Le
  // garde ci-dessus prouve que la reconnaissance survit à une reformulation —
  // et il reste vert quand on débranche la lecture du marqueur, parce que le
  // repli de prose (`grep -m1 -i argus` sur la source) tombe LUI AUSSI sur la
  // ligne du marqueur : les deux chemins rendent le même verdict, donc aucun
  // test ne peut les distinguer.
  //
  // Ce qui rend la signature stable n'est donc pas la branche, c'est cette
  // PROPRIÉTÉ : le marqueur arrive avant toute prose qui se nomme. Qu'on
  // insère un titre « Argus … » au-dessus, et la signature redevient une phrase
  // qu'on est libre de réécrire — le défaut d'origine, intact. La branche
  // marqueur est le rempart de ce jour-là ; cette assertion est ce qui dit
  // qu'on n'y est pas encore.
  const base = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const releve = execFileSync('bash', ['-c',
    `cd "${base}" && grep -rl 'ARGUS:CADRE' . | sort`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(releve.length >= 15, `${releve.length} fichiers de cadre marqués — le motif ne mesure plus rien`);
  for (const rel of releve) {
    const premiere = readFileSync(join(base, rel), 'utf8').split('\n').find((l) => /argus/i.test(l));
    assert.match(premiere ?? '', /ARGUS:CADRE/,
      `${rel} : « ${premiere} » se nomme avant le marqueur, donc c'est ELLE qui sert de `
      + 'signature — et une phrase de prose se réécrit');
  }
});

test('un homonyme du projet n\'est toujours PAS écrasé (M2, l\'autre moitié)', () => {
  // Le piège par défaut est de corriger la reconnaissance en la rendant si large
  // qu'elle absorbe le fichier de l'hôte.
  const hote = mkdtempSync(join(tmpdir(), 'argus-homo-'));
  writeFileSync(join(hote, 'pubspec.yaml'), 'name: hote\n');
  writeFileSync(join(hote, 'Makefile'), 'build:\n\t@echo a-moi\n');
  installe(hote);
  installe(hote, '--update');
  assert.match(readFileSync(join(hote, 'Makefile'), 'utf8'), /a-moi/,
    'le Makefile du projet a été écrasé');
  rmSync(hote, { recursive: true, force: true });
});

test('le chemin rapporté par configNonEmbarquee EXISTE vraiment (M6)', () => {
  // Il était découpé par longueur (`f.slice(root.length + 1)`), avec `root`
  // valant « . » : `join('.','assets')` se normalise en « assets », sans le
  // « ./ », donc la découpe retirait deux vrais caractères. Le rapport disait
  // « sets/fonts/X.ttf » — un chemin que personne ne trouve sur son disque.
  const dir = mkdtempSync(join(tmpdir(), 'argus-chemin-'));
  mkdirSync(join(dir, 'assets/fonts'), { recursive: true });
  writeFileSync(join(dir, 'assets/fonts/Nunito.ttf'), 'ttf');
  writeFileSync(join(dir, 'pubspec.yaml'), 'name: x\n');
  const avant = process.cwd();
  process.chdir(dir);
  try {
    for (const racine of ['.', dir]) {
      const trouves = configNonEmbarquee(racine, {});
      assert.equal(trouves.length, 1, `une police non câblée attendue (racine ${racine})`);
      assert.ok(existsSync(join(dir, trouves[0].fichier)),
        `« ${trouves[0].fichier} » n'existe pas : le rapport envoie chercher un fichier inventé`);
    }
  } finally { process.chdir(avant); rmSync(dir, { recursive: true, force: true }); }
});

test('les drapeaux de sécurité sont lus dans TOUTES les variantes du manifeste (M4)', () => {
  // Ils n'étaient cherchés que dans `src/main/`. Un `usesCleartextTraffic=true`
  // posé dans `src/release/` — le cas qui compte — n'était vu ni au niveau A
  // (mauvais fichier) ni au niveau B (`aapt2 dump badging` ne sort pas cet
  // attribut). Seul `debuggable` était rattrapé sur le binaire.
  const dir = mkdtempSync(join(tmpdir(), 'argus-manif-'));
  mkdirSync(join(dir, 'android/app/src/main'), { recursive: true });
  mkdirSync(join(dir, 'android/app/src/release'), { recursive: true });
  writeFileSync(join(dir, 'android/app/src/main/AndroidManifest.xml'),
    '<manifest><application android:label="x"></application></manifest>');
  writeFileSync(join(dir, 'android/app/src/release/AndroidManifest.xml'),
    '<manifest><application android:usesCleartextTraffic="true"></application></manifest>');

  const config = { security: { requireCleartextDisabled: true } };
  const ids = auditAndroidManifest(dir, config).map((f) => f.id);
  assert.ok(ids.includes('QAM-SEC-CLEAR'),
    'le trafic en clair déclaré dans la variante release passe entre les deux niveaux');

  // ⚠️ ET PAS DEUX FOIS LE MÊME. Les permissions sont fusionnées par Gradle :
  // les auditer par variante produirait deux findings de même id pour un seul
  // défaut. Le premier correctif de ce point l'a fait, et le cas de test d'alors
  // ne portait aucune permission — il ne pouvait pas le voir.
  writeFileSync(join(dir, 'android/app/src/main/AndroidManifest.xml'),
    '<manifest><uses-permission android:name="android.permission.CAMERA"/>'
    + '<application android:label="x"></application></manifest>');
  writeFileSync(join(dir, 'android/app/src/release/AndroidManifest.xml'),
    '<manifest><uses-permission android:name="android.permission.CAMERA"/>'
    + '<application android:usesCleartextTraffic="true"></application></manifest>');
  const doubles = auditAndroidManifest(dir, {
    security: { requireCleartextDisabled: true, expectedPermissions: ['android.permission.INTERNET'] },
  });
  assert.equal(new Set(doubles.map((f) => f.id)).size, doubles.length,
    `un même défaut rapporté deux fois : ${doubles.map((f) => f.id).join(', ')}`);
  assert.equal(doubles.filter((f) => f.id === 'QAM-SEC-PERM-X').length, 1);

  // L'autre moitié : un projet sain ne doit pas se mettre à rougir.
  const propre = mkdtempSync(join(tmpdir(), 'argus-manif-ok-'));
  mkdirSync(join(propre, 'android/app/src/main'), { recursive: true });
  writeFileSync(join(propre, 'android/app/src/main/AndroidManifest.xml'),
    '<manifest><application android:label="x"></application></manifest>');
  assert.deepEqual(auditAndroidManifest(propre, config), []);
  rmSync(dir, { recursive: true, force: true });
  rmSync(propre, { recursive: true, force: true });
});

// ── M3 / M7 · deux règles que les flows livrés doivent tenir ──────────────
const FLOWS_LIVRES = (() => {
  const base = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro');
  /** @type {Array<[string,string]>} */
  const out = [];
  const marcher = (d, p) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) marcher(join(d, e.name), `${p}${e.name}/`);
      else if (/\.ya?ml$/.test(e.name)) out.push([`${p}${e.name}`, readFileSync(join(d, e.name), 'utf8')]);
    }
  };
  marcher(base, '');
  return out;
})();

test('toute attente d\'écran lit le plafond CONFIGURÉ, jamais un nombre figé (M7)', () => {
  // `startupMarginWarning` conseille « relève thresholds.startTimeoutMs » quand
  // la marge se resserre. Deux attentes portaient `timeout: 20000` en dur —
  // la comparaison visuelle et l'attente post-connexion, soit les deux plus
  // lentes sur une app authentifiée : suivre le conseil ne les touchait pas.
  let vues = 0;
  for (const [nom, texte] of FLOWS_LIVRES) {
    const utile = texte.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    for (const bloc of utile.split('extendedWaitUntil:').slice(1)) {
      const entete = bloc.slice(0, 400);
      vues += 1;
      const m = /timeout:\s*(\S+)/.exec(entete);
      assert.ok(m, `${nom} : une attente sans timeout`);
      assert.equal(m[1], '${ARGUS_START_TIMEOUT_MS}',
        `${nom} : plafond figé à ${m[1]} — relever thresholds.startTimeoutMs ne le touchera pas`);
    }
  }
  assert.ok(vues >= 5, `seulement ${vues} attentes trouvées — le motif ne mesure plus rien`);
});

test('toute saisie d\'un secret porte son label de masquage (M3)', () => {
  // `label:` remplace la valeur en console et dans les rapports. La forme courte
  // (`- inputText: ${QA_USER}`) n'en admet pas : elle laisse la valeur en clair.
  let vues = 0;
  for (const [nom, texte] of FLOWS_LIVRES) {
    const utile = texte.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    // ⚠️ Le bloc s'arrête au prochain élément de liste. Une capture « toutes les
    // lignes indentées qui suivent » avale l'étape suivante, donc les DEUX
    // saisies n'en faisaient qu'une — le garde comptait 1 là où il y en a 2, et
    // se serait tu sur la seconde.
    for (const brut of utile.split('- inputText:').slice(1)) {
      const fin = brut.search(/\n\s*- /);
      const bloc = fin >= 0 ? brut.slice(0, fin) : brut;
      if (!/\$\{QA_/.test(bloc)) continue;
      vues += 1;
      assert.equal(bloc.split('\n')[0].trim(), '',
        `${nom} : secret saisi en forme courte — aucun label possible, la valeur part en clair`);
      assert.match(bloc, /label:/, `${nom} : saisie de secret sans label de masquage`);
    }
  }
  assert.ok(vues >= 2, `seulement ${vues} saisies de secret trouvées — le motif ne mesure plus rien`);
});

// ── M5 · le repli d'argus-debts, exercé en LANÇANT la recette ────────────
// Le `|| echo` portait sur le dernier maillon du pipeline (un `sed`, qui rend 0
// sur une entrée vide) : le message ne sortait jamais. Suite verte et suite non
// lancée produisaient le même silence — les deux cas qu'il devait distinguer.

/** Un projet jetable avec le Makefile livré et un faux `flutter` scriptable. */
const terrainMake = (sortieDeFlutter) => {
  const dir = mkdtempSync(join(tmpdir(), 'argus-debts-'));
  cpSync(join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'),
    join(dir, 'Makefile'));
  mkdirSync(join(dir, 'bin'), { recursive: true });
  const faux = join(dir, 'bin/flutter');
  writeFileSync(faux, `#!/bin/sh\ncat <<'EOF'\n${sortieDeFlutter}\nEOF\n`);
  chmodSync(faux, 0o755);
  return dir;
};
const faireDettes = (dir) => execFileSync('make', ['argus-debts'], {
  cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
});

test('argus-debts DIT qu\'il n\'y a rien à inscrire quand la suite est verte (M5)', () => {
  const dir = terrainMake('00:01 +12: All tests passed!');
  assert.match(faireDettes(dir), /aucune dette à inscrire/,
    'le repli est une branche morte : le silence total ne distingue pas « verte » de « pas tournée »');
  rmSync(dir, { recursive: true, force: true });
});

test('argus-debts rend le bloc prêt à coller quand il y a des dettes (M5, l\'autre moitié)', () => {
  // Sans ce cas, « toujours afficher le repli » passerait pour un correctif.
  const dir = terrainMake("      'home · cibles tactiles ≥ 48 dp (Android)',\n      'panier · texte ×2.0',");
  const sortie = faireDettes(dir);
  assert.match(sortie, /'home · cibles tactiles/);
  assert.match(sortie, /'panier · texte/);
  assert.ok(!/aucune dette/.test(sortie), 'le repli ne doit pas s\'afficher quand il y a des dettes');
  rmSync(dir, { recursive: true, force: true });
});

test('la table des cibles d\'ARGUS-MOBILE.md est DÉRIVÉE du Makefile (m4)', () => {
  // Elle en listait onze sur treize, et les deux absentes étaient celles que le
  // SKILL présente comme les plus rentables. Un tableau qui a l'air exhaustif et
  // ne l'est pas coûte plus qu'une liste partielle assumée. Le critère est une
  // ÉGALITÉ : une cible ajoutée au Makefile fait rougir ce garde tant qu'elle
  // n'est pas documentée, et une cible retirée aussi.
  const base = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const mk = readFileSync(join(base, 'Makefile'), 'utf8');
  const doc = readFileSync(join(base, 'ARGUS-MOBILE.md'), 'utf8');

  const cibles = new Set([...mk.matchAll(/^(argus[a-z-]*):.*## /gm)].map((m) => m[1]));
  assert.ok(cibles.size >= 10, `${cibles.size} cibles lues dans le Makefile — le motif ne mesure plus rien`);
  const documentees = new Set([...doc.matchAll(/\| `make (argus[a-z0-9-]*)` \|/g)].map((m) => m[1]));
  assert.ok(documentees.size > 0, 'la table des cibles a changé de forme — mets ce garde à jour');

  // `argus-help` et `argus` (la chaîne complète) ne sont pas des dimensions :
  // la table décrit ce qu'on lance pour mesurer, et les nommer l'allongerait
  // sans rien apprendre. C'est une exception ÉCRITE, pas un oubli.
  const horsTable = new Set(['argus-help', 'argus', 'argus-doctor', 'argus-build']);
  const attendues = [...cibles].filter((c) => !horsTable.has(c)).sort();
  const manquantes = attendues.filter((c) => !documentees.has(c));
  assert.deepEqual(manquantes, [],
    `cible(s) du Makefile absente(s) de la table que lit l'utilisateur : ${manquantes.join(', ')}`);
});

test('un runFlow vers un fichier ABSENT est nommé sans device (m13)', () => {
  // `check-syntax` valide un fichier à la fois ; le contrôle du graphe traitait
  // la cible manquante comme un nœud sans arête. L'échec n'arrivait donc que sur
  // device, après avoir payé le run.
  const manquants = flowsIntrouvables({
    'smoke.yaml': '- runFlow: _subflows/launch-clean.yaml\n- runFlow: _subflows/typo.yaml\n',
    '_subflows/launch-clean.yaml': '- launchApp\n',
  });
  assert.deepEqual(manquants, [['smoke.yaml', '_subflows/typo.yaml']]);

  // L'autre moitié : un workspace sain reste muet, commentaires compris.
  assert.deepEqual(flowsIntrouvables({
    'a.yaml': '# - runFlow: exemple-commente.yaml\n- runFlow: _subflows/b.yaml\n',
    '_subflows/b.yaml': '- back\n',
  }), [], 'un exemple commenté n\'est pas un appel');
});

test('la sentinelle « écran courant » n\'existe qu\'à UN endroit (m6)', () => {
  // Elle a été extraite en constante EXPORTÉE précisément parce que sa valeur en
  // dur avait déjà vidé un correctif — c'est écrit dans son dartdoc. Deux
  // comparaisons la recopiaient pourtant en littéral.
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/a11y.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const litteraux = [...code.matchAll(/'écran courant'/g)].length;
  assert.equal(litteraux, 1,
    `${litteraux} littéraux « écran courant » dans le code : seule la déclaration de ECRAN_COURANT doit en porter un`);
  assert.match(code, /requested !== ECRAN_COURANT/, 'les comparaisons doivent passer par la constante');
});

test('argus-build refuse de conclure quand la mesure du paquet a échoué (m10)', () => {
  // Deux empreintes VIDES sont égales : la garde annonçait « PAQUET INTACT —
  // même empreinte » sans avoir rien mesuré. C'est le défaut du point 214,
  // revenu par le chemin d'erreur.
  const mk = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/Makefile'), 'utf8');
  const recette = mk.slice(mk.indexOf('argus-build:'), mk.indexOf('argus-lint:'));
  assert.ok(recette.includes('--measure-binary'), 'la recette ne mesure plus — mets ce garde à jour');
  const iVide = recette.indexOf('-z "$$AKIND"');
  const iIntact = recette.indexOf('PAQUET INTACT');
  assert.ok(iVide > 0, 'rien ne distingue une empreinte vide d\'une empreinte égale');
  assert.ok(iIntact > iVide, 'le refus doit précéder le verdict, sinon il ne l\'empêche pas');
});

// ── m7 · le shell masque l'absence d'un binaire ───────────────────────────
// `detectTools` décidait `present = res.error === null`. C'est juste tant qu'on
// spawne directement : un binaire absent rend ENOENT. Mais `sh()` passe par le
// shell sur Windows (`shell: IS_WINDOWS`, nécessaire pour `aapt2.exe` et
// `apkanalyzer.bat`), et un shell ne rend PAS d'ENOENT sur une commande
// inconnue — il rend le code 127. Tous les outils étaient donc déclarés
// présents, et la panne arrivait plus loin, sur un message moins clair.
//
// Le défaut n'est pas propre à Windows : c'est le shell. Il se reproduit donc
// ici, ce qui est ce qui permet de le garder.

test('un binaire absent reste ABSENT même quand un shell avale l\'ENOENT (m7)', () => {
  const direct = sh('binaire-inexistant-xyz', ['--version']);
  assert.equal(outilPresent(direct), false, 'sans shell, l\'ENOENT suffisait déjà');

  const parShell = sh('binaire-inexistant-xyz', ['--version'], { shell: true });
  assert.equal(parShell.error, null, 'le shell a bien avalé l\'ENOENT — sinon ce garde ne mesure rien');
  assert.equal(parShell.status, 127, 'et rend 127, le « command not found » POSIX');
  assert.equal(outilPresent(parShell), false,
    'déclaré présent : la moitié de la dimension sécurité se croira outillée');
});

test('un outil PRÉSENT qui sort en code non nul reste présent (m7, l\'autre moitié)', () => {
  // `apkanalyzer -h` prouve sa présence en sortant non nul : un correctif qui
  // exigerait `status === 0` ferait sauter la dimension pour un outil installé.
  assert.equal(outilPresent({ error: null, status: 1 }), true);
  assert.equal(outilPresent({ error: null, status: 0 }), true);
  assert.equal(outilPresent({ error: 'spawn ENOENT', status: -1 }), false);
});

test('chaque outil installé par la CI est épinglable ET imprime sa version (m2)', () => {
  // Deux runs à un jour d'écart n'analysaient pas forcément avec le même
  // scanner, et rien dans le rapport ne le disait. L'épinglage reste un CHOIX
  // (un scanner de CVE figé fige sa connaissance des vulnérabilités) ; ce qui
  // ne doit pas l'être, c'est la possibilité de le faire et la trace de ce qui
  // a servi.
  const wf = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.github/workflows/argus-mobile.yml'), 'utf8');
  const utile = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  const etapes = utile.split(/\n      - name: Installer /).slice(1);
  assert.ok(etapes.length >= 2, `${etapes.length} étape(s) d'installation — le motif ne mesure plus rien`);
  for (const etape of etapes) {
    const nom = etape.split('\n')[0].trim();
    const bloc = etape.split(/\n      - /)[0];
    assert.match(bloc, /vars\.ARGUS_[A-Z_]+_VERSION/,
      `${nom} : aucune variable de dépôt ne permet d'épingler sa version`);
    assert.match(bloc, /--version|version\)/,
      `${nom} : la version employée n'est pas imprimée, donc un rapport passé n'est pas relisible`);
  }
});

// ── Atteignabilité · « non atteint » n'est pas « inatteignable » ──────────
// `coverage.notVisited` répond à « qu'ai-je atteint ? », demande un device, et
// mélange trois causes. Une seule se mesure sans device : aucune branche de
// goto.yaml ne dessert l'écran.

const GOTO_BRANCHES = (branches) => [
  '# - runFlow:',
  "#     when: { true: \"${SCREEN_ID === 'commente'}\" }",   // un exemple COMMENTÉ
  '- runFlow:',
  '    when:',
  '      true: "${SCREEN_ID === ARGUS_START_SCREEN}"',
  ...branches.map((b) => `      true: "\${SCREEN_ID === '${b}'}"`),
].join('\n');

test('un écran ancré qu\'aucune branche ne dessert est NOMMÉ (atteignabilité)', () => {
  const config = { screens: [
    { id: 'home', anchor: 'home_root' },
    { id: 'profile', anchor: 'profile_root' },
    { id: 'panier', anchor: 'panier_root' },
  ] };
  assert.deepEqual(ecransSansBranche(config, GOTO_BRANCHES(['profile']), 'home'), ['panier']);
});

test('les trois sorties légitimes ne comptent pas comme orphelines', () => {
  const source = GOTO_BRANCHES(['profile']);
  // 1 · l'écran de départ, amené par launch-clean.yaml
  assert.deepEqual(ecransSansBranche({ screens: [{ id: 'home', anchor: 'a' }] }, source, 'home'), []);
  // 2 · un écran sans ancre : déjà dit par coverage.notConfigured
  assert.deepEqual(ecransSansBranche({ screens: [{ id: 'x', anchor: '' }] }, source, 'home'), []);
  // 3 · un état que le parcours CRÉE — la sortie écrite du troisième cas
  assert.deepEqual(ecransSansBranche(
    { screens: [{ id: 'plein', anchor: 'p', reachedBy: 'journey-critical' }] }, source, 'home'), []);
});

test('une branche COMMENTÉE ne rend pas un écran atteignable', () => {
  // Le gabarit livré porte `SCREEN_ID === 'profile'` en commentaire : un
  // analyseur qui le lit déclare desservi un écran que rien ne dessert.
  const config = { screens: [{ id: 'commente', anchor: 'c' }] };
  assert.deepEqual(ecransSansBranche(config, GOTO_BRANCHES([]), 'home'), ['commente'],
    'l\'exemple commenté du gabarit a été pris pour une branche');
});

test('le gabarit LIVRÉ ne compte aucune branche (atteignabilité)', () => {
  // ⚠️ CE GARDE EXISTE PARCE QUE LES AUTRES ÉTAIENT CONSTRUITS SUR UN MONTAGE.
  // Ils fabriquaient un goto.yaml idéalisé, où `typeof SCREEN_ID === '…'`
  // n'apparaît pas — alors que le fichier livré en porte deux, et que le motif
  // les comptait comme des branches vers un écran nommé « undefined ». Résultat
  // mesuré : « 4 branche(s) lue(s) » sur un scaffold qui n'en déclare aucune,
  // donc un refus de conclure qui ne se déclenchait jamais.
  const source = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/_subflows/goto.yaml'), 'utf8');
  assert.match(source, /typeof SCREEN_ID === 'undefined'/,
    'le gabarit ne porte plus la garde de typage — ce garde ne mesure plus rien');
  // Le gabarit porte DEUX branches, et seulement deux : celles de l'écran de
  // départ, écrites et non commentées. Ses exemples d'écran nommé sont en
  // commentaire, et ses `typeof` ne sont pas des chemins. Ces deux-là sont le
  // témoin que le motif lit encore quelque chose : si elles tombent à zéro, le
  // contrôle refuse de conclure — ce qui est exactement ce qu'on veut d'un
  // motif cassé ou d'un fichier vidé.
  assert.equal(branchesDeGoto(source), 2,
    'ni plus (un `typeof` compté pour un chemin) ni moins (le motif ne lit plus rien)');
  assert.equal(branchesDeGoto(source.split('\n').map((l) => `# ${l}`).join('\n')), 0,
    'tout commenter doit rendre zéro — sinon le refus de conclure est inatteignable');
  assert.deepEqual(
    ecransSansBranche({ screens: [{ id: 'x', anchor: 'x_root' }] }, source, 'home'), ['x'],
    'un écran ancré doit ressortir orphelin sur le gabarit livré');
});

test('le contrôle refuse de conclure sans branche lue (atteignabilité)', () => {
  // Même règle que ses deux voisins : une liste vide sur un corpus vide n'est
  // pas un bon résultat, c'est une absence de mesure.
  assert.equal(branchesDeGoto(''), 0);
  assert.equal(branchesDeGoto("# true: \"${SCREEN_ID === 'x'}\""), 0, 'les commentaires ne comptent pas');
  assert.equal(branchesDeGoto(GOTO_BRANCHES(['a', 'b'])), 3, 'deux branches nommées + celle du départ');
});

test('ciblesRunFlow lit les DEUX formes et ignore les exemples commentés (m76)', () => {
  // ⚠️ Un garde qui APPELLE, pas qui lit du texte. La décision « un exemple
  // commenté n'est pas un appel » vivait en trois exemplaires dans config.mjs ;
  // elle a désormais une source unique, et c'est elle qu'on exerce ici.
  assert.deepEqual(ciblesRunFlow('- runFlow: _subflows/goto.yaml\n'),
    ['_subflows/goto.yaml'], 'la forme courte n\'est plus lue');
  assert.deepEqual(ciblesRunFlow('- runFlow:\n    file: _subflows/login.yaml\n    env:\n      X: 1\n'),
    ['_subflows/login.yaml'], 'la forme `file:` n\'est plus lue');
  assert.deepEqual(ciblesRunFlow('# - runFlow: exemple-commente.yaml\n- launchApp\n'),
    [], 'un exemple commenté est compté comme un appel');

  // ⚠️ L'AUTRE MOITIÉ, sans quoi un filtre trop large passerait pour un
  // correctif : ce qui n'est PAS commenté doit toujours sortir, y compris à
  // côté d'un commentaire et suivi d'un commentaire de fin de ligne.
  assert.deepEqual(ciblesRunFlow('# un exemple\n- runFlow: vrai.yaml\n'),
    ['vrai.yaml'], 'un appel voisin d\'un commentaire a été avalé');
});

test('le retrait des commentaires n\'a qu\'UNE source dans config.mjs (m76 bis)', () => {
  // Cette idiome y vivait en TROIS exemplaires, et le harnais de mutation l'a
  // dit avant nous : son motif en matchait deux, donc il refusait de conclure
  // et AUCUNE des deux copies n'était exercée. Ce garde tient le NOMBRE ; le
  // garde ci-dessus tient la valeur. Même défaut que TETE_BRANCHE, mêmes
  // fonctions, autre motif — c'est la deuxième fois qu'il faut le fermer.
  const src = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs'), 'utf8');
  // ⚠️ Les commentaires d'abord : la règle est expliquée juste au-dessus de la
  // fonction qu'elle garde, donc à portée du motif. Un garde qui compte sa
  // propre explication est vacant le jour de son écriture.
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const copies = code.split(String.raw`.filter((l) => !/^\s*#/.test(l))`).length - 1;
  assert.equal(copies, 1,
    `le retrait des lignes commentées est écrit ${copies}× dans config.mjs — une seule `
    + 'source, sinon la copie que rien ne mesure diverge de celle qui est gardée');
});

test("l'exemple de goto MONTRE le retour qu'il prescrit, il ne le décrit pas seulement (347)", () => {
  const goto = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/_subflows/goto.yaml'), 'utf8');

  // ⚠️ LA RÈGLE ÉTAIT DÉJÀ ÉCRITE — « écris-la comme un RETOUR, pas comme un
  // aller ». C'est l'EXEMPLE qui la contredisait, en tapant l'onglet dès sa
  // première commande. Un run l'a recopié et a perdu un flow sur « Element not
  // found », donc en accusant une ancre correcte. Même classe que le 229 : la
  // forme inerte enseignée comme la bonne. Ce garde tient les DEUX — la règle
  // en prose, et l'exemple qui doit la montrer.
  assert.match(goto, /comme un RETOUR, pas comme un aller/,
    "goto.yaml ne prescrit plus le retour — l'exemple ci-dessous n'aurait plus de raison d'être");

  const i = goto.lastIndexOf('#     when:');
  assert.notEqual(i, -1, "l'exemple commenté a disparu de goto.yaml — mets ce garde à jour");
  const exemple = goto.slice(i);

  // ⚠️ ANCRÉ SUR LA LIGNE YAML, jamais sur le mot : le commentaire que je viens
  // d'écrire au-dessus de l'exemple contient « optional: true » et
  // « nav_profile » en toutes lettres. Un garde qui les cherche nus se
  // satisferait de ma propre explication et resterait vert sur un exemple vidé.
  const retour = exemple.search(/^#\s+optional: true$/m);
  const onglet = exemple.search(/^#\s+id: nav_/m);
  assert.notEqual(retour, -1,
    "l'exemple ne montre plus de retour défensif : il enseigne l'aller que la règle interdit");
  assert.notEqual(onglet, -1, "l'exemple ne tape plus d'onglet — mets ce garde à jour");
  assert.ok(retour < onglet,
    "le retour défensif arrive APRÈS le tap sur l'onglet : dans cet ordre il ne sert à rien, "
    + "puisque c'est le tap qui échoue quand l'app est sur un écran poussé");
});

test('le SKILL sépare la commande derrière un GESTE des deux cas voisins (348)', () => {
  const skill = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/SKILL.md'), 'utf8');
  const harness = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/argus_harness.dart'), 'utf8');

  // ⚠️ DÉRIVÉ DU CODE, pas cité. La table du SKILL oppose ce que l'étage 1 DIT
  // dans chacun des trois cas ; le jour où le harnais cesse de produire ce
  // message, elle ment, et c'est ce garde qui le dit — plutôt que de veiller
  // sur une prose que rien ne relie à ce qu'elle décrit.
  assert.match(harness, /ELLE EXISTE, mais plus bas/,
    "le harnais ne rend plus « ELLE EXISTE, mais plus bas » — la table du SKILL est périmée");
  assert.ok(skill.includes('ELLE EXISTE, mais plus bas'),
    "le SKILL n'oppose plus le message du pli à celui de l'absence : les trois cas redeviennent indiscernables");

  const i = skill.indexOf('DERRIÈRE UN GESTE');
  assert.notEqual(i, -1, 'le SKILL ne traite plus la commande derrière un geste (348)');
  // Le markdown est enveloppé à ~78 colonnes : on aplatit avant de chercher.
  const bloc = skill.slice(i, i + 2400).replace(/\s+/g, ' ');

  // Le cœur du cas : c'est CE QUI LE DISTINGUE du voisin qui compte, pas son
  // existence. Un run a perdu du temps précisément parce que « rendre public »
  // — le remède du voisin — ne s'applique pas ici.
  assert.match(bloc, /Rendre le widget public n'y change rien/,
    "le SKILL ne dit plus que rendre le widget public ne résout PAS ce cas-là : "
    + "sans cette phrase, le lecteur applique le remède du cas voisin");

  // Et les trois gestes prescrits, faute de quoi le cas est nommé sans issue.
  assert.match(bloc, /sort de `commands:`/, 'le SKILL ne dit plus ce que devient la commande');
  assert.match(bloc, /swipe/, "le SKILL ne dit plus que l'assertion passe à l'étage 2, qui FAIT le geste");
  assert.match(bloc, /dette et elle s'inscrit/,
    "le SKILL ne dit plus quoi faire quand le budget device ne suit pas — l'ancre se retirerait en silence");
});

test('le cadrage demande ce que devient la TÉLÉMÉTRIE pendant une passe QA (349)', () => {
  const prompts = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/PROMPTS.md'), 'utf8');
  const bloc = prompts.replace(/\s+/g, ' ');

  // ⚠️ DÉRIVÉ : c'est `resilience.yaml` qui PROVOQUE des erreurs, donc qui rend
  // la question inévitable. S'il disparaissait des flows livrés, cette ligne du
  // cadrage perdrait sa cause — et ce garde le dirait au lieu de veiller sur
  // une prose devenue sans objet.
  const flows = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro');
  assert.ok(readdirSync(flows).includes('resilience.yaml'),
    "resilience.yaml a disparu des flows livrés — la passe QA ne provoque plus d'erreurs, "
    + "et la ligne de cadrage sur la télémétrie n'a plus de raison d'être");

  assert.match(bloc, /la TÉLÉMÉTRIE, si l'app en émet/,
    "le cadrage ne demande plus ce que devient la télémétrie : une passe QA envoie alors "
    + "ses sessions et ses erreurs provoquées dans le monitoring RÉEL du projet");
  assert.match(bloc, /erreurs PROVOQUÉES/,
    "le cadrage ne dit plus POURQUOI la question se pose — sans la cause, elle se lit comme un caprice");
});

test('le prompt avertit que le clone rend le plugin PUBLIÉ, pas celui en cours (350)', () => {
  const prompts = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/PROMPTS.md'), 'utf8');
  const bloc = prompts.replace(/\s+/g, ' ');

  // ⚠️ DÉRIVÉ : l'avertissement n'a de sens que tant que le prompt propose un
  // clone. Le jour où ce repli disparaît, le garde tombe plutôt que de veiller.
  assert.match(bloc, /git clone --depth 1/,
    "le prompt ne propose plus de clone — l'avertissement du 350 est sans objet");
  assert.match(bloc, /Le clone rend le plugin PUBLIÉ/,
    "le prompt n'avertit plus que le clone rend la version publiée : quelqu'un qui met son "
    + "skill à l'épreuve testera une version d'avant, et RIEN ne le lui dira");
  assert.match(bloc, /lecture seule/,
    "le prompt ne dit plus quoi faire à la place — nommer le piège sans l'issue ne sert à rien");
});

test("known_issues prescrit d'ouvrir un échantillon avant d'accepter le lot (351)", () => {
  const dette = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/test/argus/known_issues.dart'), 'utf8');
  const bloc = dette.replace(/\s+/g, ' ');

  assert.match(bloc, /OUVRE-EN TROIS/,
    "known_issues ne prescrit plus de vérifier un échantillon : un défaut du MONTAGE "
    + "(police non chargée, padding non simulé) se fige alors en dette du projet");
  // Le cœur : POURQUOI trois suffisent. Sans la raison, le geste se lit comme
  // un rite et se saute au premier lot pressé.
  assert.match(bloc, /cause COMMUNE/,
    "known_issues ne dit plus pourquoi trois suffisent — un geste sans raison ne se fait pas");
  assert.match(bloc, /PIRE qu'une suite rouge/,
    "known_issues ne dit plus ce que coûte un relevé faux : il est vert, c'est tout le problème");
});

test('le câblage du garde de recadrage se voit, drapeau posé ou non (352)', () => {
  // ⚠️ GARDE QUI APPELLE. Un `cropRoot` oublié est LÉGAL — un paramètre
  // optionnel non passé l'est toujours —, donc aucun test de comportement ne
  // peut le voir : le garde de position ne s'exécute simplement pas. Ce
  // croisement est le seul endroit d'où on l'apprend.
  const dir = mkdtempSync(join(tmpdir(), 'argus-crop-'));
  try {
    mkdirSync(join(dir, 'test/argus'), { recursive: true });
    writeFileSync(join(dir, 'test/argus/harness.dart'), [
      'const List<ArgusScreen> argusScreens = <ArgusScreen>[',
      "  ArgusScreen(id: 'a', anchor: 'a_root', cropRoot: true, build: _a),",
      "  ArgusScreen(id: 'b', anchor: 'b_root', build: _b),",
      '];',
    ].join('\n'), 'utf8');

    const verdicts = recadragesNonGardes(dir, {
      visualCropOn: 'a_root',
      screens: [{ visualCropOn: 'b_root' }, { visualCropOn: 'z_root' }],
    });
    assert.equal(verdicts.get('a_root'), true, "l'écran qui déclare le drapeau est vu comme gardé");
    assert.equal(verdicts.get('b_root'), false,
      "l'écran qui l'oublie doit ressortir : sans ça, le garde de position disparaît en silence");
    assert.equal(verdicts.get('z_root'), null,
      "une racine de recadrage qui n'est la racine d'AUCUN écran n'a rien à déclarer — "
      + "l'exiger ferait rougir un projet sain");

    // ⚠️ L'AUTRE MOITIÉ, ET MA PREMIÈRE VERSION ÉTAIT VACANTE — le harnais l'a
    // dit. J'avais mis la mention en TÊTE DE FICHIER, donc avant le premier
    // `ArgusScreen(`, c'est-à-dire dans le morceau que le découpage jette : le
    // contrôle ne pouvait pas la voir, et casser le retrait des commentaires ne
    // changeait rien. Le cas réel est le drapeau COMMENTÉ DANS la déclaration —
    // quelqu'un qui le désactive sans le supprimer.
    writeFileSync(join(dir, 'test/argus/harness.dart'), [
      "ArgusScreen(id: 'b',",
      "  anchor: 'b_root',",
      '  // cropRoot: true — à réactiver quand cet écran servira de recadrage',
      '  build: _b),',
    ].join('\n'), 'utf8');
    assert.equal(recadragesNonGardes(dir, { visualCropOn: 'b_root' }).get('b_root'), false,
      'un `cropRoot: true` COMMENTÉ compte comme le drapeau : le contrôle est vacant, '
      + 'et il suffirait de désactiver le drapeau sans le supprimer pour perdre le garde');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('le scaffold LIVRÉ porte le drapeau, le garde qui le lit, et ne crie pas à vide (352 bis)', () => {
  // ⚠️ SUR LE FICHIER LIVRÉ, pas sur un montage : trois de mes gardes ont déjà
  // été bâtis sur une fixture pendant que le gabarit réel contenait autre chose.
  const S = join(RACINE, 'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile');
  const types = readFileSync(join(S, 'test/argus/argus_types.dart'), 'utf8');
  const layout = readFileSync(join(S, 'test/argus/layout_test.dart'), 'utf8');

  assert.match(types, /this\.cropRoot = false,/, 'ArgusScreen ne porte plus le drapeau cropRoot');
  // Le CÂBLAGE : le drapeau doit être LU par le test, pas seulement déclaré.
  assert.match(layout, /screen\.cropRoot/,
    'layout_test ne lit plus screen.cropRoot — le champ existerait sans que rien ne le mesure');
  // Et la mesure elle-même : sans la division, on compare des pixels physiques
  // à des dp et le garde devient un tirage.
  assert.match(layout, /padding\.top \/ [A-Za-z]+\.devicePixelRatio/,
    'layout_test ne ramène plus l\'inset en dp : FakeViewPadding est en pixels PHYSIQUES');

  // ⚠️ ET IL NE DOIT PAS CRIER SUR LE SCAFFOLD NU. `visualCropOn` y vaut '' par
  // défaut : un contrôle qui rougirait à l'installation serait désactivé le jour
  // même.
  const nu = recadragesNonGardes(S, { visualCropOn: '', screens: [] });
  assert.equal(nu.size, 0, 'le scaffold livré, sans visualCropOn, déclenche déjà le contrôle');
});

test('le cadrage tranche les CAPTURES, il ne les laisse pas à l\'agent (353)', () => {
  const prompts = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/PROMPTS.md'), 'utf8');
  const yaml = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/argus.mobile.yaml'), 'utf8');

  // ⚠️ DÉRIVÉ : la ligne de cadrage n'a de sens que parce que la config porte
  // vraiment ce levier. Le jour où `evidence:` disparaît du scaffold, ce garde
  // tombe au lieu de veiller sur une prescription sans objet.
  assert.match(yaml, /^\s*evidence: /m,
    "argus.mobile.yaml ne porte plus de clé `evidence` — la ligne de cadrage du 353 est sans objet");

  // ⚠️ LE BLOC DE CADRAGE EST COMMENTÉ : aplatir les blancs ne suffit pas, les
  // « # » de continuation restent AU MILIEU des phrases. Ce garde a rougi
  // dessus le jour de son écriture, sur un texte pourtant exact. On retire donc
  // les marqueurs de début de ligne avant d'aplatir.
  const bloc = prompts.replace(/^[ \t]*#[ \t]?/gm, '').replace(/\s+/g, ' ');
  assert.match(bloc, /EVIDENCE\s*: oui/,
    "le cadrage ne tranche plus les captures : l'agent décide alors seul, et il ne peut pas "
    + "savoir d'où viennent les données qu'il voit");
  // Le cœur : le CRITÈRE. Sans lui, la ligne se remplit au hasard.
  assert.match(bloc, /d'où vient ce que l'appareil affiche/,
    "le cadrage ne donne plus le critère — « ça a l'air sensible » est justement le mauvais");
  assert.match(bloc, /jetable/,
    "le cadrage ne distingue plus une base locale jetable d'une recette portant des données réelles");
});

test('le cadrage envoie ouvrir la doc de BUILD, pas seulement la page d\'accueil (354)', () => {
  const prompts = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/PROMPTS.md'), 'utf8');
  const bloc = prompts.replace(/\s+/g, ' ');

  // ⚠️ DÉRIVÉ : l'avertissement n'a de sens que tant que le cadrage réclame une
  // adresse d'API. S'il cessait, ce garde tomberait plutôt que de veiller.
  assert.match(bloc, /l'adresse EXACTE que le binaire doit porter/,
    "le cadrage ne réclame plus d'adresse d'API — l'avertissement du 354 est sans objet");
  assert.match(bloc, /LISTE SOUVENT PLUSIEURS, ET ELLES NE SE VALENT PAS/,
    "le cadrage n'avertit plus qu'un projet documente plusieurs adresses : reprendre la première "
    + "venue fait mesurer une recette partagée en croyant mesurer l'application");
  // Ce qui distingue les deux cibles, et pourquoi ça compte au-delà de l'adresse.
  assert.match(bloc, /elle varie d'un run à l'autre/,
    "le cadrage ne dit plus ce qui sépare les deux cibles — sans ça, elles se valent");
  assert.match(bloc, /commande aussi `ENV` et `EVIDENCE`/,
    "le cadrage ne relie plus le choix d'adresse aux deux autres décisions qu'il entraîne");
});

test("l'avertissement de locale dit ce qu'il COÛTE, et il survit au terminal (355)", () => {
  // ⚠️ GARDE QUI APPELLE. Le message était exact et incomplet : « la clé est
  // sans effet » se lit comme un réglage inopérant, alors que le vrai prix est
  // qu'une DIMENSION cesse de mesurer. Vécu : un flow i18n assertant un libellé
  // français, vert sur un appareil en « fr_CI » — français lui aussi. Il aurait
  // été vert quoi qu'on déclare.
  const w = localeWarnings('fr_FR', false, 'en_US', 'android');
  assert.ok(w.length >= 2, "l'avertissement de locale a disparu");
  assert.ok(w.some((l) => /vert quoi que tu déclares/.test(l)),
    "l'avertissement ne dit plus ce qu'il coûte : sans cette phrase, on croit à un réglage "
    + "inopérant au lieu d'une dimension qui ne mesure plus rien");

  // ⚠️ L'AUTRE MOITIÉ : quand la locale COÏNCIDE, l'intention est satisfaite et
  // le silence est juste. Un remède qui parlerait toujours serait du bruit, et
  // un avertissement qu'on ne peut pas faire taire finit ignoré.
  assert.deepEqual(localeWarnings('fr_FR', false, 'fr-FR', 'android'), [],
    'la locale coïncide et le runner parle quand même — trois lignes de bruit par exécution');

  // Le finding : il ne naît que s'il y a quelque chose à dire.
  assert.deepEqual(localeFindings([], { id: 'x' }, 'android'), [],
    'un finding de locale naît sans avertissement — il accuserait un run sain');
  const f = localeFindings(w, { id: 'emulator-5554', os: '36' }, 'android');
  assert.equal(f.length, 1);
  assert.equal(f[0].dimension, 'i18n', "le finding ne porte plus sur la dimension qui a cessé de mesurer");
  assert.equal(f[0].severity, 'info', "rien n'est cassé : c'est une COUVERTURE qui manque, pas un défaut");
  assert.match(f[0].suggestedFix, /vert quoi que tu déclares/,
    'le finding ne porte plus la raison — un lecteur du rapport ne peut pas la retrouver');

  // ⚠️ ET LE CÂBLAGE. Le finding peut être parfait et n'atteindre personne : la
  // version d'avant ne sortait qu'en `warn()`, donc elle mourait avec le
  // terminal pendant que la page publiée montrait une dimension i18n verte.
  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  const code = run.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.match(code, /\.\.\.localeFindings\(/,
    'localeFindings existe mais personne ne la verse dans les findings du rapport : '
    + "l'avertissement retombe en ligne de console, qui meurt avec la session");
});

test("l'avertissement de secrets vides nomme les DEUX frontières (356)", () => {
  // ⚠️ CE CONSTAT EST NÉ D'UN DÉMENTI. Un run a rapporté que le masquage
  // affichait `***` même pour une valeur vide, donc qu'il cachait le défaut.
  // MESURÉ EN L'EXÉCUTANT : faux — `masquerSecrets` rend `<VIDE>` depuis le 337,
  // `secretsVides` les nomme, et l'avertissement existe. Le remède demandé
  // aurait « corrigé » un mécanisme correct.
  // Ce qui restait vrai est plus étroit : l'avertissement nommait la frontière
  // de PROCESSUS (« chaque appel shell est neuf ») et pas celle de l'EXPORT.
  // Un fichier de `CLE=valeur` nues, sourcé dans la même commande, donne des
  // variables de shell que le fils ne voit pas — et c'est exactement là que le
  // run s'est arrêté, après avoir suivi le conseil à la lettre.
  const run = readFileSync(join(RACINE,
    'plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs'), 'utf8');
  const bloc = run.slice(run.indexOf('secretsVides(env)'));
  const avert = bloc.slice(0, bloc.indexOf('log(shown)'));

  assert.match(avert, /MÊME commande/,
    "l'avertissement ne nomme plus la frontière de processus");
  assert.match(avert, /EXPORTÉS/,
    "l'avertissement ne nomme plus la frontière de l'EXPORT : un run a suivi le conseil "
    + 'à la lettre, sourcé dans la même commande, et les valeurs n\'arrivaient toujours pas');
  assert.match(avert, /set -a/,
    "l'avertissement nomme le problème sans donner le geste — le lecteur doit le deviner");

  // ⚠️ ET LE DÉMENTI LUI-MÊME EST GARDÉ : si `masquerSecrets` cessait de
  // distinguer le vide, le constat démenti redeviendrait vrai et cette longue
  // explication mentirait.
  assert.ok(masquerSecrets(['-e', 'QA_PHONE=']).includes('QA_PHONE=<VIDE>'),
    'le masquage ne distingue plus une valeur vide — le constat démenti au 356 redevient vrai');
  assert.ok(masquerSecrets(['-e', 'QA_PHONE=06']).includes('QA_PHONE=***'),
    'et un secret plein doit rester masqué');
});
