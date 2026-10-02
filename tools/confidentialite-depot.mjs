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
 * Ce qu'une branche locale porte et qu'aucune branche distante n'a : ce qu'un
 * push publierait.
 */
const A_POUSSER = ['--branches', '--not', '--remotes'];

/** Le plafond d'un lot d'objets lus d'un seul `cat-file --batch` (611). */
const PLAFOND_DE_LOT = 64 * 1024 * 1024;

/**
 * 🔴 613 — CE QU'UN PUSH PUBLIERAIT : les messages et les objets des commits
 * qu'aucune branche distante ne porte encore. Le contrôle ne lisait que les
 * fichiers suivis. Mesuré le 02/10/2026 : l'arbre était propre, et vingt-deux
 * des vingt-huit commits à pousser portaient pourtant un fragment d'un nom de
 * terrain dans leurs fichiers, deux dans leur message — un push les aurait
 * publiés, et l'historique d'un dépôt public ne se corrige plus.
 *
 * ⚠️ L'historique DÉJÀ publié n'est pas relu : le corriger exigerait de
 * réécrire un dépôt public, une autre décision. Le garde du 500 balaie toute
 * la base, pour ses propres motifs.
 * @param {string} racine
 * @returns {{ou: string, texte: string}[]}
 */
export function aPousserDe(racine) {
  /** @param {string[]} args @param {string} [entree] */
  const git = (args, entree) => execFileSync('git', args, { cwd: racine, input: entree, maxBuffer: 1 << 30 });
  return [...messagesAPousser(git), ...objetsAPousser(git)];
}

/**
 * Les messages des commits à pousser, chacun désigné par son sujet.
 * @param {(args: string[], entree?: string) => Buffer} git
 */
function messagesAPousser(git) {
  const journal = git(['log', '--format=%h %s%x1f%B%x1e', ...A_POUSSER]).toString('utf8');
  return journal.split('\x1e').map((bloc) => bloc.split('\x1f'))
    .filter(([tete]) => tete?.trim())
    .map(([tete, corps]) => ({ ou: `message de ${tete.trim()}`, texte: corps ?? '' }));
}

/**
 * Les fichiers que les commits à pousser introduisent, toutes versions, lus par
 * lots bornés en taille : sur une longue branche locale, d'un seul tenant, la
 * sortie dépasserait la limite d'une chaîne Node (611).
 * @param {(args: string[], entree?: string) => Buffer} git
 */
function objetsAPousser(git) {
  /** @type {Map<string, string>} */
  const chemins = new Map();
  for (const l of git(['rev-list', '--objects', ...A_POUSSER]).toString('utf8').split('\n')) {
    const i = l.indexOf(' ');
    if (i > 0) chemins.set(l.slice(0, i), l.slice(i + 1));
  }
  if (chemins.size === 0) return [];
  const blobs = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], `${[...chemins.keys()].join('\n')}\n`)
    .toString('utf8').split('\n').map((l) => l.split(' ')).filter(([, type]) => type === 'blob');
  /** @type {string[][]} */
  const lots = [];
  let lot = [];
  let poids = 0;
  for (const [id, , taille] of blobs) {
    if (lot.length > 0 && poids + Number(taille) > PLAFOND_DE_LOT) { lots.push(lot); lot = []; poids = 0; }
    lot.push(id);
    poids += Number(taille);
  }
  if (lot.length > 0) lots.push(lot);
  return lots.flatMap((ids) => lireLot(git(['cat-file', '--batch'], `${ids.join('\n')}\n`), chemins));
}

/**
 * Découpe la sortie de `cat-file --batch` : un en-tête, puis exactement la
 * taille qu'il annonce, EN OCTETS — d'où un Buffer, jamais une chaîne.
 * @param {Buffer} brut @param {Map<string, string>} chemins
 */
function lireLot(brut, chemins) {
  /** @type {{ou: string, texte: string}[]} */
  const lus = [];
  let pos = 0;
  while (pos < brut.length) {
    const fin = brut.indexOf(0x0a, pos);
    const entete = brut.subarray(pos, fin).toString('utf8');
    const [id, type, taille] = entete.split(' ');
    if (type !== 'blob') throw new Error(`objet illisible : « ${entete} »`);
    const debut = fin + 1;
    lus.push({ ou: `${chemins.get(id)} @${id.slice(0, 7)}`, texte: brut.subarray(debut, debut + Number(taille)).toString('utf8') });
    pos = debut + Number(taille) + 1;
  }
  return lus;
}

/**
 * Les fuites d'un texte à pousser. Seules les FUITES comptent ici : un mot
 * ordinaire rapporté à chaque version de chaque fichier noierait la sortie.
 * ⚠️ Un premier tri sur le texte entier évite de découper en lignes les
 * dizaines de versions qui ne portent rien ; la ligne se cherche ensuite comme
 * dans un fichier, avec les mêmes limites.
 * @param {string} ou @param {string} texte @param {{valeur: string, quoi: string}[]} attendus
 * @param {(v: string) => boolean} estFuite @param {(v: string) => boolean} estNomClasse
 */
function fuitesAPousser(ou, texte, attendus, estFuite, estNomClasse) {
  const bas = texte.toLowerCase();
  /** @type {string | null} */
  let lettres = null;
  /** @type {string[]} */
  const trouvees = [];
  for (const a of attendus) {
    if (!estFuite(a.valeur)) continue;
    const nom = estNomClasse(a.valeur);
    const present = nom
      ? bas.includes(a.valeur.toLowerCase()) || (lettres ??= lettresDe(texte)).includes(lettresDe(a.valeur))
      : texte.includes(a.valeur);
    if (!present) continue;
    const { ligne, coupe } = ligneDe(texte, a.valeur, nom);
    if (ligne) trouvees.push(`${ou}:${ligne} — « ${a.valeur} »${coupe ? ' COUPÉ' : ''} (${a.quoi}) · à pousser`);
  }
  return trouvees;
}

/**
 * @param {string[]} args
 * @param {(chemin: string, enc: 'utf8') => string | Buffer} [lire]
 * @param {() => string[]} [lister]
 * @param {() => string | null} [lireClassement] le classement privé, `null` s'il n'existe pas
 * @param {() => {ou: string, texte: string}[]} [lireAPousser] ce qu'un push publierait (613)
 * @returns {{code: number, lignes: string[]}}
 */
export function controler(args, lire = readFileSync, lister = () =>
  execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' }).trim().split('\n'),
lireClassement = () => (existsSync(CLASSEMENT) ? readFileSync(CLASSEMENT, 'utf8') : null),
lireAPousser = () => aPousserDe(RACINE)) {
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
  // 613 — et ce qu'un push publierait. Un historique qu'on n'a pas pu lire
  // n'est pas un historique propre : il fait échouer.
  /** @type {{ou: string, texte: string}[]} */
  let aPousser;
  try {
    aPousser = lireAPousser();
  } catch (e) {
    return { code: 1, lignes: [`✖ historique à pousser ILLISIBLE — ${e instanceof Error ? e.message : String(e)}`,
      '   Ce contrôle n\'a pas pu le lire, ce qui ne dit pas qu\'il est propre : ne pas pousser.'] };
  }
  for (const { ou, texte } of aPousser) fuites.push(...fuitesAPousser(ou, texte, attendus, estFuite, estNomClasse));

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
  const bilan = `${attendus.length} identifiant(s) dérivé(s) de ${dossiers.length} terrain(s) · ${fichiers.length} fichiers`
    + ` · ${aPousser.length} message(s) et version(s) de fichier à pousser`;
  if (fuites.length || aClasser.length) {
    return { code: 1, lignes: [...fuites, ...(fuites.length && aClasser.length ? [''] : []), ...aClasser, '',
      `${fuites.length} fuite(s) · ${aClasser.length ? `${nonClasses.length} identifiant(s) à classer · ` : ''}${bilan}`, ...note] };
  }
  return { code: 0, lignes: [`✔ aucun identifiant de terrain dans le dépôt, ni dans ce qui reste à pousser · ${bilan}`, ...note] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { code, lignes } = controler(process.argv.slice(2));
  for (const l of lignes) console.log(l);
  process.exit(code);
}
