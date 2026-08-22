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
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  avdNameFrom, budgetVerdict, buildEnv, dimensionsToRun, resolveByAvd, resolveNamedDevice, startTimeoutMs,
  startScreen, startupFindings, startupHint, startupSamples,
} from '../skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';
import { flutterCommand, flutterCommandIn, usesFvm, validateConfig } from '../skills/argus-mobile/assets/scaffold-mobile/scripts/argus/config.mjs';

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

test('l\'indice ne s\'affiche que sur l\'ancre de départ', () => {
  const sur = startupHint('id=home_root', 'home_root', CONFIG);
  assert.match(sur, /démarrage/, 'c\'est le message qui a fait accuser l\'ancre pendant tout un run');

  // Partout ailleurs il doit se taire : un indice affiché sur chaque échec
  // n'oriente plus rien, il ajoute du bruit à ce qu'on cherche à lire.
  assert.equal(startupHint('id=submit_button', 'home_root', CONFIG), '');
  assert.equal(startupHint('text=Bienvenue', 'home_root', CONFIG), '');
  assert.equal(startupHint('id=home_root', '', CONFIG), '');
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

const FLOWS_DIR = fileURLToPath(new URL('../skills/argus-mobile/assets/scaffold-mobile/.maestro/', import.meta.url));

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

const SCRIPTS_DIR = fileURLToPath(new URL('../skills/argus-mobile/assets/scaffold-mobile/scripts/argus/', import.meta.url));

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

test('toute clé de argus.mobile.yaml est lue par au moins un script', () => {
  const leaves = defaultsLeaves();
  assert.ok(leaves.length >= 40, `relevé vide ou tronqué (${leaves.length}) — DEFAULTS a-t-il changé de forme ?`);

  const code = codeDesScripts();
  assert.ok(code.length > 10000, 'corpus vide : les scripts ont-ils bougé de dossier ?');

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
