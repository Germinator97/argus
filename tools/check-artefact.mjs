#!/usr/bin/env node
// Le contrôle à passer AVANT de republier la page du chantier.
//
//   node tools/check-artefact.mjs ~/.argus-etalon/artefact-<date>/<page>.html
//
// Il compare les chiffres écrits dans la page à ce que le dépôt établit. Il ne
// corrige rien : il dit ce qui a menti, et sort en 1 pour qu'on ne publie pas
// par-dessus. Le « pourquoi » est en tête de tools/artefact-compteurs.mjs.
//
// ⚠️ Ce script LIT, il n'écrit nulle part et ne mute aucun fichier — c'est
// délibéré : un outil qu'on lance en découvrant comment il marche ne doit pas
// pouvoir abîmer quoi que ce soit. Un argument manquant ou inconnu sort en
// erreur AVANT toute lecture, et n'exécute jamais « le seul comportement qu'il
// offre » par défaut.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compteursDeLaPage, compteursDuDepot, ecarts, rupturesDOrdreDu, texteDeLaPage } from './artefact-compteurs.mjs';
import { fuitesDe } from './artefact-confidentialite.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage(sortie) {
  process.stdout.write([
    'Contrôle des compteurs de la page publiée du chantier.',
    '',
    '  node tools/check-artefact.mjs <page.html>   compare la page au dépôt',
    '  node tools/check-artefact.mjs --derive      montre seulement ce que le dépôt établit',
    '',
    'Sort en 1 dès qu\'un chiffre de la page ne correspond plus au dépôt,',
    'ou qu\'un compteur est devenu introuvable (tournure changée).',
    '',
  ].join('\n'));
  process.exit(sortie);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) usage(args.length === 0 ? 2 : 0);

const inconnus = args.filter((a) => a.startsWith('-') && a !== '--derive');
if (inconnus.length > 0) {
  process.stderr.write(`✖ option inconnue : ${inconnus.join(', ')}\n`);
  usage(2);
}

const depot = compteursDuDepot({ racine: RACINE });

if (args.includes('--derive')) {
  process.stdout.write('Ce que le dépôt établit :\n');
  for (const [cle, valeur] of Object.entries(depot)) {
    process.stdout.write(`  ${cle.padEnd(30)} ${valeur}\n`);
  }
  process.exit(0);
}

const chemin = args[0];
let html;
try {
  html = readFileSync(chemin, 'utf8');
} catch (erreur) {
  process.stderr.write(`✖ page illisible : ${erreur.message}\n`);
  process.exit(2);
}

const texte = texteDeLaPage(html);

// ⚠️ Contre-épreuve d'instrument, avant toute lecture de résultat : sans elle,
// un fichier vide, un HTML dont la structure a changé ou une lecture binaire
// tronquée rendraient « aucun écart » — c'est-à-dire le verdict qu'on espère.
// Prouver que l'instrument mesure avant de lire ce qu'il mesure.
if (texte.length < 5000) {
  process.stderr.write(`✖ instrument aveugle : ${texte.length} caractères lisibles extraits de ${chemin}.\n`
    + '  Une page de chantier en fait des centaines de milliers — le fichier est\n'
    + '  tronqué, vide, ou n\'est pas la page. Aucun verdict n\'est rendu.\n');
  process.exit(2);
}

const releve = compteursDeLaPage(texte);
const trouves = ecarts(releve, depot);

process.stdout.write(`Page : ${chemin}\n`);
process.stdout.write(`${texte.length.toLocaleString('fr-FR')} caractères lisibles · ${depot.commits} commits`
  + `${depot.runsNonMesure ? '' : ` · ${depot.runs} runs`}\n\n`);

for (const { cle, libelle, regime, valeurs } of releve.values()) {
  const attendu = depot[cle];
  if (attendu === undefined) continue;
  const faux = trouves.some((e) => e.cle === cle);
  const marque = faux ? '✖' : '✔';
  const vues = valeurs.length === 0 ? '(aucune)' : [...new Set(valeurs)].join(', ');
  process.stdout.write(`  ${marque} ${libelle.padEnd(34)} dépôt ${String(attendu).padStart(4)}   page ${vues}${regime === 'journal' ? '  [journal : le max fait foi]' : ''}\n`);
}

// 555 · LE TROISIÈME ÉTAT, ET IL DOIT SE VOIR. La boucle ci-dessus saute tout
// compteur que le dépôt n'a pas établi — c'est juste, `ecarts` ne peut rien
// comparer — mais le sauter SANS UN MOT le ferait passer pour contrôlé. Le
// dossier des étalons vit hors du dépôt, donc il manque sur un runner de CI et
// chez quiconque n'est pas la machine du chantier : « je n'ai PAS PU mesurer »
// n'est ni un zéro ni un défaut du sujet, et c'est l'absence d'affichage qui le
// transformerait en accord tacite.
if (depot.runsNonMesure) {
  const vues = [...new Set(releve.get('runs')?.valeurs ?? [])];
  process.stdout.write(`  ⚠ runs joués                         NON MESURÉ   page ${vues.length ? vues.join(', ') : '(aucune)'}\n`
    + `      · ${depot.runsNonMesure}\n`
    + `      · le backlog en cite ${depot.runsSelonLeBacklog} — c'est un second relevé, pas la source\n`);
}

// ── Confidentialité, dans le MÊME geste ────────────────────────────────────
// Deux outils dont l'un s'oublie valent moins qu'un seul qu'on lance. Un nom de
// client a vécu des semaines en ligne parce que le balayage était un geste
// séparé, qu'on faisait « quand on y pensait ».
const { fuites, mortes, instrumentAveugle } = fuitesDe(texte);

if (instrumentAveugle) {
  process.stderr.write('✖ instrument aveugle : le témoin est introuvable dans la page.\n'
    + '  Un balayage qui ne peut rien trouver rend « rien d\'interdit », soit le\n'
    + '  verdict qu\'on espère. Aucun verdict n\'est rendu.\n');
  process.exit(2);
}

process.stdout.write(`\n  ${fuites.length === 0 ? '✔' : '✖'} confidentialité                     `
  + `${fuites.length === 0 ? 'aucun nom ni identifiant de projet' : `${fuites.length} à retirer`}\n`);

for (const { quoi, valeur } of fuites) {
  process.stdout.write(`      · ${valeur}  (${quoi})\n`);
}
for (const { valeur, pourquoi } of mortes) {
  process.stdout.write(`      · exception morte : « ${valeur} » n'est plus dans la page — ${pourquoi}\n`);
}

// ── L'ORDRE du registre, dans le même geste ────────────────────────────────
// Le tableau du backlog se LIT comme un registre : on y cherche un numéro, donc
// on suppose qu'il croît. Deux fois une ligne a été insérée au mauvais endroit,
// et les deux fois c'est un lecteur qui l'a vu — la page est valide, chaque
// ligne est juste, les compteurs restent exacts. Rien d'autre ne peut le dire.
// ⚠️ 446 — LE HTML, PAS LE TEXTE DÉPOUILLÉ. C'est la seconde moitié du 439,
// et elle n'avait pas été faite : ce correctif-là a rendu le lecteur BRUYANT
// — il lève au lieu de rendre `[]` quand il n'a rien à lire — mais l'appel est
// resté sur `texte`, où il n'y a ni `</table>` ni `<td class="id">`. Le silence
// est donc devenu un CRASH, et `check-artefact.mjs` est resté inutilisable une
// journée entière sans que personne le voie, faute d'avoir été relancé.
// 📌 Fermer le silence d'un instrument ne suffit pas : il faut rejouer ses
// appelants, sinon on remplace un faux vert par une panne.
const ruptures = rupturesDOrdreDu(html);
process.stdout.write(`  ${ruptures.length === 0 ? '✔' : '✖'} ordre du registre                   `
  + `${ruptures.length === 0 ? 'les numéros croissent' : `${ruptures.length} rupture(s)`}\n`);
for (const { avant, apres } of ruptures) {
  process.stdout.write(`      · ${apres} vient après ${avant}\n`);
}

if (trouves.length === 0 && fuites.length === 0 && mortes.length === 0 && ruptures.length === 0) {
  process.stdout.write('\n✔ compteurs à jour, ordre tenu, rien à anonymiser : la page peut être republiée.\n');
  process.exit(0);
}

if (fuites.length > 0 || mortes.length > 0) {
  process.stdout.write(`\n✖ ${fuites.length} fuite(s) et ${mortes.length} exception(s) morte(s).\n`
    + '  Une exception qui ne sert plus est une permission permanente : la retirer.\n');
}

if (trouves.length > 0) {
  process.stdout.write(`\n✖ ${trouves.length} écart(s) de compteur — la page ne doit pas être republiée en l'état :\n\n`);
}
for (const { libelle, genre, message } of trouves) {
  process.stdout.write(`  · ${libelle} [${genre}]\n    ${message}\n`);
}
process.stdout.write('\n');
process.exit(1);
