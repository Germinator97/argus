#!/usr/bin/env node
// @ts-check
/**
 * Les identifiants des TERRAINS D'ESSAI fuitent-ils dans ce dépôt public ?
 *
 * 🔴 POURQUOI CE FICHIER EXISTE (541). La règle « aucun nom de projet testé dans
 * le plugin » vivait en mémoire, et RIEN ne la tenait. Le 20/09, en rédigeant le
 * compte rendu d'un run, j'ai recopié la phrase d'un garde qui nommait le paquet
 * partagé et la police d'un projet sous contrat. Personne ne l'a vu : un compte
 * rendu n'est jamais relu pour ça. Découvert au balayage manuel fait juste avant
 * le premier `git push` — c'est-à-dire par chance, et à la dernière seconde où
 * c'était encore gratuit.
 *
 * ⚠️ `artefact-confidentialite.mjs` NE CONVIENT PAS ICI, et c'est mesuré : il
 * détecte des bundle ids, des AVD, des chemins et des hôtes — pas une police ni
 * un nom de paquet interne, donc il ne voyait pas cette fuite-là. Et appliqué
 * aux fichiers du dépôt il rend **53 signalements, tous des exemples fictifs**
 * (`com.exemple.monapp`, `Exemple_API34`, `/Users/quelquun`). Un instrument qui
 * crie au loup est pire que pas d'instrument. Sa place est la page publiée, où
 * tout identifiant est suspect ; ici les exemples inventés sont légitimes.
 *
 * 📌 D'où un critère RENVERSÉ : au lieu de deviner ce qui ressemble à un nom de
 * projet, on DÉRIVE des terrains présents sur la machine ce qu'ils s'appellent
 * vraiment — nom de paquet, applicationId, bundle, polices, paquets voisins —
 * et on vérifie qu'aucun n'apparaît. Ce que le dépôt invente ne ressemble à rien
 * de réel ; ce qu'il recopie se reconnaît à coup sûr.
 *
 * ⚠️ ET IL REFUSE DE CONCLURE SANS TERRAIN. Un poste qui n'en a aucun rendrait
 * « 0 fuite », c'est-à-dire un vert qui ne mesure rien — le défaut que ce projet
 * traque partout. Sans terrain lisible, il sort en 2 et le dit.
 *
 *   node tools/confidentialite-depot.mjs             # les terrains de ~/.argus-etalon/terrains.txt
 *   node tools/confidentialite-depot.mjs <dossier>…  # ceux-là
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const RACINE = join(new URL('.', import.meta.url).pathname, '..');

/** Là où l'on déclare ses terrains — hors dépôt, puisqu'il est public. */
export const LISTE = join(homedir(), '.argus-etalon', 'terrains.txt');

/**
 * Ce qu'un terrain s'appelle : tout ce que la règle interdit de recopier.
 *
 * ⚠️ On ne lit que des fichiers de DÉCLARATION (pubspec, gradle, plist). Dériver
 * du code entier ramènerait des mots trop courants et rendrait le contrôle
 * inutilisable — c'est la même faute que le motif trop large qui compte faux.
 * @param {string} dossier @returns {{valeur: string, quoi: string}[]}
 */
export function identifiantsDe(dossier) {
  /** @type {{valeur: string, quoi: string}[]} */
  const trouves = [];
  const ajoute = (/** @type {string|undefined} */ v, /** @type {string} */ q) => {
    const s = (v ?? '').trim();
    // Trop court, ce n'est plus un identifiant : c'est un mot.
    if (s.length >= 4 && !trouves.some((t) => t.valeur === s)) trouves.push({ valeur: s, quoi: q });
  };

  const pub = join(dossier, 'pubspec.yaml');
  if (existsSync(pub)) {
    const t = readFileSync(pub, 'utf8');
    ajoute(/^name:\s*(\S+)/m.exec(t)?.[1], 'nom du paquet Dart');
    for (const m of t.matchAll(/^\s*-\s*family:\s*(\S+)/gm)) ajoute(m[1], 'police déclarée');
    for (const m of t.matchAll(/^\s*path:\s*\.\.\/(\S+)/gm)) ajoute(m[1].replace(/\/+$/, ''), 'paquet voisin');
  }
  for (const g of ['android/app/build.gradle', 'android/app/build.gradle.kts']) {
    const p = join(dossier, g);
    if (!existsSync(p)) continue;
    const t = readFileSync(p, 'utf8');
    for (const m of t.matchAll(/applicationId\s*=?\s*["']([^"']+)["']/g)) ajoute(m[1], 'applicationId');
  }
  const plist = join(dossier, 'ios/Runner/Info.plist');
  if (existsSync(plist)) {
    const t = readFileSync(plist, 'utf8');
    const b = /<key>CFBundleIdentifier<\/key>\s*<string>([^<$]+)<\/string>/.exec(t);
    ajoute(b?.[1], 'bundle iOS');
  }
  return trouves;
}

/**
 * Un identifiant est-il DISTINCTIF, ou pourrait-il être un mot ordinaire ?
 *
 * 🔴 Mesuré en écrivant ce contrôle : un terrain s'appelle `focus`, qui est
 * aussi le mot du clavier. Le premier balayage a rendu **5 signalements, tous
 * légitimes** — `FocusScope`, « le champ perd le focus »… Un instrument qui crie
 * au loup est pire que pas d'instrument : on apprend à l'ignorer, et il emmène
 * les vraies fuites avec lui.
 *
 * ⚠️ Le critère est une FORME, jamais une liste de mots courants — une liste ne
 * connaît que ce qu'on y a mis, et il faudrait la tenir en deux langues. Un
 * identifiant distinctif porte une structure : un séparateur, une majuscule
 * interne, ou assez de longueur pour n'être plus un mot. `common_app_core`,
 * `WorkSans`, `com.exemple.app` en ont ; `focus` n'en a pas.
 *
 * 📌 Les ambigus ne sont pas jetés — ils sont RAPPORTÉS À PART, sans faire
 * échouer. Les taire referait le trou ; les compter avec les autres rendrait le
 * contrôle inutilisable.
 * @param {string} v
 */
export function estDistinctif(v) {
  return /[._-]/.test(v) || /[a-z][A-Z]/.test(v) || v.length >= 8;
}

/** Les dossiers à inspecter : l'argument, sinon la liste déclarée. */
export function terrainsDe(args) {
  if (args.length) return args;
  if (!existsSync(LISTE)) return [];
  return readFileSync(LISTE, 'utf8').split('\n')
    .map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
}

/** @param {string[]} args @returns {{code: number, lignes: string[]}} */
export function controler(args, lire = readFileSync, lister = () =>
  execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' }).trim().split('\n')) {
  const dossiers = terrainsDe(args).filter((d) => existsSync(d));
  if (dossiers.length === 0) {
    return { code: 2, lignes: [
      '⚠️  AUCUN TERRAIN LISIBLE — ce contrôle n\'a rien mesuré.',
      `    Déclare-les dans ${LISTE} (un chemin par ligne), ou passe-les en argument.`,
      '    Un « 0 fuite » rendu sans terrain serait un vert qui ne mesure rien.',
    ] };
  }
  const attendus = dossiers.flatMap((d) => identifiantsDe(d).map((i) => ({ ...i, d })));
  if (attendus.length === 0) {
    return { code: 2, lignes: [`⚠️  ${dossiers.length} terrain(s) lus, AUCUN identifiant dérivé : `
      + 'les fichiers de déclaration ont changé de forme, et ce contrôle ne mesure plus rien.'] };
  }
  const fichiers = lister().filter((/** @type {string} */ f) => f && !f.startsWith('.git/'));
  /** @type {string[]} */
  const fuites = [];
  /** @type {string[]} */
  const ambigus = [];
  for (const f of fichiers) {
    let t; try { t = String(lire(join(RACINE, f), 'utf8')); } catch { continue; }
    for (const a of attendus) {
      if (!t.includes(a.valeur)) continue;
      const ligne = t.split('\n').findIndex((l) => l.includes(a.valeur)) + 1;
      const ou = `${f}:${ligne} — « ${a.valeur} » (${a.quoi})`;
      (estDistinctif(a.valeur) ? fuites : ambigus).push(ou);
    }
  }
  const note = ambigus.length
    ? ['', `⚪ ${ambigus.length} mention(s) d'un identifiant AMBIGU — il ressemble à un mot ordinaire,`,
       '   donc on ne peut pas trancher par le texte. À relire une fois, pas à chaque passe :',
       ...ambigus.slice(0, 5).map((x) => `   ${x}`)]
    : [];
  return fuites.length
    ? { code: 1, lignes: [...fuites, '', `${fuites.length} fuite(s) DISTINCTIVE(s) · ${attendus.length} identifiant(s) dérivé(s) de ${dossiers.length} terrain(s)`, ...note] }
    : { code: 0, lignes: [`✔ aucun identifiant DISTINCTIF de terrain dans le dépôt · ${attendus.length} dérivé(s) de ${dossiers.length} terrain(s) · ${fichiers.length} fichiers`, ...note] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code, lignes } = controler(process.argv.slice(2));
  for (const l of lignes) console.log(l);
  process.exit(code);
}
