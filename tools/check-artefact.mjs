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

import { compteursDeLaPage, compteursDuDepot, ecarts, texteDeLaPage } from './artefact-compteurs.mjs';

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
process.stdout.write(`${texte.length.toLocaleString('fr-FR')} caractères lisibles · ${depot.commits} commits · ${depot.runs} runs\n\n`);

for (const { cle, libelle, regime, valeurs } of releve.values()) {
  const attendu = depot[cle];
  if (attendu === undefined) continue;
  const faux = trouves.some((e) => e.cle === cle);
  const marque = faux ? '✖' : '✔';
  const vues = valeurs.length === 0 ? '(aucune)' : [...new Set(valeurs)].join(', ');
  process.stdout.write(`  ${marque} ${libelle.padEnd(34)} dépôt ${String(attendu).padStart(4)}   page ${vues}${regime === 'journal' ? '  [journal : le max fait foi]' : ''}\n`);
}

if (trouves.length === 0) {
  process.stdout.write('\n✔ tous les compteurs de la page correspondent au dépôt.\n');
  process.exit(0);
}

process.stdout.write(`\n✖ ${trouves.length} écart(s) — la page ne doit pas être republiée en l'état :\n\n`);
for (const { libelle, genre, message } of trouves) {
  process.stdout.write(`  · ${libelle} [${genre}]\n    ${message}\n`);
}
process.stdout.write('\n');
process.exit(1);
