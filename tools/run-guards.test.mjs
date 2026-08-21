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
import { test } from 'node:test';

import {
  avdNameFrom, resolveByAvd, resolveNamedDevice, startTimeoutMs,
  startupFindings, startupHint, startupSamples,
} from '../skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs';

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
