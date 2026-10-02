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
 *
 * 🔴 575 — ET CE QUE LA FORME NE PEUT PAS TRANCHER, ON LE CLASSE UNE FOIS. Un nom
 * d'application court et inventé n'a ni séparateur, ni majuscule interne, ni
 * huit lettres : il passait pour un mot ordinaire, et sa fuite n'aurait été
 * qu'une ligne « ambiguë » de plus, dans une liste que la sortie disait « à
 * relire une fois ». Mesuré en écrivant le 574 : le nom d'un fichier du
 * terrain, qui porte celui de l'application, écrit dans ce dépôt sans que rien
 * échoue. Chaque identifiant ambigu se classe donc dans ~/.argus-etalon/
 * identifiants-classes.txt — `mot` ou `distinctif` —, et un identifiant NON
 * classé fait échouer : un nouveau terrain force la décision au lieu de
 * rejoindre les ambigus en silence.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const RACINE = join(new URL('.', import.meta.url).pathname, '..');

/** Là où l'on déclare ses terrains — hors dépôt, puisqu'il est public. */
export const LISTE = join(homedir(), '.argus-etalon', 'terrains.txt');

/**
 * Là où l'on CLASSE, une fois, chaque identifiant ambigu — hors dépôt lui aussi :
 * il nomme ce que ce contrôle interdit d'écrire ici.
 */
export const CLASSEMENT = join(homedir(), '.argus-etalon', 'identifiants-classes.txt');

/** Les deux classes qu'un identifiant ambigu peut recevoir. */
export const CLASSES = ['mot', 'distinctif'];

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
 * 📌 Les ambigus ne sont pas jetés — ils sont CLASSÉS (575). Les taire
 * referait le trou ; les compter avec les autres rendrait le contrôle
 * inutilisable ; les rapporter à part, comme avant, laissait un nom inventé se
 * lire comme un mot. La forme dit « je ne sais pas », le classement tranche.
 * @param {string} v
 */
export function estDistinctif(v) {
  return /[._-]/.test(v) || /[a-z][A-Z]/.test(v) || v.length >= 8;
}

/**
 * Le classement privé : `mot <valeur>` ou `distinctif <valeur>`, une ligne
 * chacun, `#` pour commenter. La valeur est le reste de la ligne — un nom de
 * police peut porter une espace.
 *
 * ⚠️ UNE LIGNE ILLISIBLE ARRÊTE, elle n'est pas sautée. `distinctf kwz` sauté,
 * c'est un identifiant qu'on croit classé et qui ne l'est pas : il échouerait
 * comme non classé, mais avec un message qui accuse l'absence d'une ligne que
 * l'on a sous les yeux.
 * @param {string} texte @returns {{classes: Map<string, string>, erreurs: string[]}}
 */
export function classementDe(texte) {
  /** @type {Map<string, string>} */
  const classes = new Map();
  /** @type {string[]} */
  const erreurs = [];
  texte.split('\n').forEach((brute, i) => {
    const l = brute.replace(/#.*$/, '').trim();
    if (!l) return;
    const m = /^(\S+)\s+(.+)$/.exec(l);
    if (!m || !CLASSES.includes(m[1])) {
      erreurs.push(`ligne ${i + 1} non reconnue : « ${l} » — attendu « mot <valeur> » ou « distinctif <valeur> »`);
      return;
    }
    classes.set(m[2].trim(), m[1]);
  });
  return { classes, erreurs };
}

/**
 * Les seules lettres d'un texte, en minuscules : ce qui reste d'un nom une fois
 * ôté ce qui le coupe.
 * @param {string} t
 */
export function lettresDe(t) {
  return t.toLowerCase().replace(/[^\p{L}]/gu, '');
}

/**
 * La première ligne (1-indexée) qui porte la valeur, 0 si aucune — et si le nom
 * n'y figure que COUPÉ.
 *
 * ⚠️ Un `distinctif` classé se cherche SANS la casse : c'est un nom, et il fuit
 * aussi bien capitalisé en tête de phrase qu'en minuscules dans un chemin.
 * Mesuré en écrivant ce correctif : un chemin de police d'un terrain, en
 * minuscules, vivait dans ce dépôt pendant que le paquet se cherchait avec sa
 * majuscule. Un identifiant distinctif par sa FORME garde la casse : c'est sa
 * forme exacte qui le rend sûr, et l'élargir ferait crier au loup.
 *
 * 🔴 612 — ET UN NOM CLASSÉ SE CHERCHE AUSSI RECOLLÉ. Recopiant mot pour mot ce
 * qu'un run avait relevé — un titre dont les deux moitiés du nom de
 * l'application étaient rendues à deux tailles —, j'ai écrit ce nom coupé par
 * une barre, dans trois fichiers de ce dépôt : la chaîne entière n'y était
 * nulle part, et rien n'a échoué. Une ligne dont les seules lettres portent le
 * nom le porte. Seuls les noms CLASSÉS se recollent : ailleurs la forme exacte
 * fait la sûreté, et joindre les mots ferait crier au loup.
 * ⚠️ LIMITE : la coupure se recolle, pas la paraphrase. Deux moitiés séparées
 * par des MOTS (« Zor » en 28 px, « blo »), par une fin de ligne ou par une
 * balise faite de lettres (`Zor</b>blo` — mesuré) ne se voient pas.
 * @param {string} texte @param {string} valeur @param {boolean} insensible
 * @returns {{ ligne: number, coupe: boolean }}
 */
function ligneDe(texte, valeur, insensible) {
  const lignes = texte.split('\n');
  const cherche = insensible ? valeur.toLowerCase() : valeur;
  const entiere = lignes.findIndex((l) => (insensible ? l.toLowerCase() : l).includes(cherche)) + 1;
  if (entiere || !insensible) return { ligne: entiere, coupe: false };
  const nom = lettresDe(valeur);
  const coupee = nom ? lignes.findIndex((l) => lettresDe(l).includes(nom)) + 1 : 0;
  return { ligne: coupee, coupe: coupee > 0 };
}

/** Les dossiers à inspecter : l'argument, sinon la liste déclarée. */
export function terrainsDe(args) {
  if (args.length) return args;
  if (!existsSync(LISTE)) return [];
  return readFileSync(LISTE, 'utf8').split('\n')
    .map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
}

/**
 * @param {string[]} args
 * @param {(chemin: string, enc: 'utf8') => string | Buffer} [lire]
 * @param {() => string[]} [lister]
 * @param {() => string | null} [lireClassement] le classement privé, `null` s'il n'existe pas
 * @returns {{code: number, lignes: string[]}}
 */
export function controler(args, lire = readFileSync, lister = () =>
  execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' }).trim().split('\n'),
lireClassement = () => (existsSync(CLASSEMENT) ? readFileSync(CLASSEMENT, 'utf8') : null)) {
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
  // 575 — ce que la forme ne tranche pas, le classement le tranche. Il ne peut
  // que DURCIR : un `mot` posé sur un identifiant distinctif par sa forme est
  // sans effet, sinon une ligne du fichier privé suffirait à taire une fuite.
  const brut = lireClassement();
  const { classes, erreurs } = classementDe(brut ?? '');
  const ambigusDerives = [...new Map(attendus.filter((a) => !estDistinctif(a.valeur))
    .map((a) => [a.valeur, a])).values()];
  const nonClasses = ambigusDerives.filter((a) => !classes.has(a.valeur));
  const estNomClasse = (/** @type {string} */ v) => classes.get(v) === 'distinctif';
  const estFuite = (/** @type {string} */ v) => estDistinctif(v) || estNomClasse(v);

  const fichiers = lister().filter((/** @type {string} */ f) => f && !f.startsWith('.git/'));
  /** @type {string[]} */
  const fuites = [];
  /** @type {string[]} */
  const ambigus = [];
  for (const f of fichiers) {
    let t; try { t = String(lire(join(RACINE, f), 'utf8')); } catch { continue; }
    for (const a of attendus) {
      const { ligne, coupe } = ligneDe(t, a.valeur, estNomClasse(a.valeur));
      if (!ligne) continue;
      const ou = `${f}:${ligne} — « ${a.valeur} »${coupe ? ' COUPÉ' : ''} (${a.quoi})`;
      (estFuite(a.valeur) ? fuites : ambigus).push(ou);
    }
  }

  const aClasser = [
    ...erreurs.map((e) => `✖ classement illisible — ${e}`),
    ...nonClasses.map((a) => `✖ identifiant AMBIGU non classé : « ${a.valeur} » (${a.quoi})`),
  ];
  if (aClasser.length) {
    aClasser.push(`   → une ligne par identifiant dans ${CLASSEMENT}${brut === null ? ' (le fichier n\'existe pas encore)' : ''} :`,
      '     « mot <valeur> »        un mot ordinaire : ses mentions sont rapportées, sans échec ;',
      '     « distinctif <valeur> » un nom : la moindre mention échoue, quelle que soit sa casse.',
      '   La forme ne peut pas trancher, toi si — une fois par identifiant.');
  }
  const derives = new Set(attendus.map((a) => a.valeur));
  const orphelins = [...classes.keys()].filter((v) => !derives.has(v));
  const sansEffet = [...classes].filter(([v, c]) => c === 'mot' && estDistinctif(v)).map(([v]) => v);
  const note = [
    ...(ambigus.length
      ? ['', `⚪ ${ambigus.length} mention(s) d'un identifiant AMBIGU qui n'est pas tenu pour un nom`,
         '   (classé « mot », ou pas encore classé) — pas une fuite par le texte :',
         ...ambigus.slice(0, 5).map((x) => `   ${x}`)]
      : []),
    ...(orphelins.length
      ? ['', `⚪ ${orphelins.length} classement(s) sans identifiant dérivé — terrain absent ou renommé : `
         + orphelins.map((v) => `« ${v} »`).join(', ')]
      : []),
    ...(sansEffet.length
      ? ['', `⚪ classé « mot » mais distinctif par sa forme, donc sans effet : ${sansEffet.map((v) => `« ${v} »`).join(', ')}`]
      : []),
  ];
  const bilan = `${attendus.length} identifiant(s) dérivé(s) de ${dossiers.length} terrain(s) · ${fichiers.length} fichiers`;
  if (fuites.length || aClasser.length) {
    return { code: 1, lignes: [...fuites, ...(fuites.length && aClasser.length ? [''] : []), ...aClasser, '',
      `${fuites.length} fuite(s) · ${aClasser.length ? `${nonClasses.length} identifiant(s) à classer · ` : ''}${bilan}`, ...note] };
  }
  return { code: 0, lignes: [`✔ aucun identifiant de terrain dans le dépôt · ${bilan}`, ...note] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code, lignes } = controler(process.argv.slice(2));
  for (const l of lignes) console.log(l);
  process.exit(code);
}
