// Les compteurs de la page publiée du chantier, dérivés du dépôt.
//
// Pourquoi ce fichier existe : la page porte des chiffres qui décrivent le
// dépôt — commits, runs, gardes, mutations, prochain numéro libre — et ils y
// sont écrits À LA MAIN. Le 1er septembre 2026 elle annonçait « prochain
// numéro libre 255 » et « vidé trente-cinq fois » pour 333 et quarante et une :
// six passes et 78 points de retard, vus par un lecteur humain et par rien
// d'autre. C'est l'anti-pattern « un nombre qui décrit le contenu sans être
// dérivé de la donnée », et il vivait dans le suivi du chantier lui-même.
//
// Ce que ce module NE fait pas : republier, ni corriger la page. Il dit
// seulement quels chiffres ont menti, pour qu'une republication soit un geste
// mesuré et non une relecture de bonne volonté.
//
// ── Deux régimes, et c'est la seule subtilité ──────────────────────────────
// La page est un JOURNAL chronologique. Une phrase comme « Le backlog s'est
// vidé huit fois » y est JUSTE : elle vit sous le titre « Ce que huit runs ont
// fini par établir », c'est un bilan à sa date. Exiger que toutes les mentions
// soient égales ferait donc rougir le garde sur de l'histoire correcte — et un
// garde qui crie au loup est pire que pas de garde, il apprend à être ignoré.
//
//   · ANCRÉ   — le chiffre vit dans une tournure qui ne peut décrire que le
//               présent (le bandeau, l'arbre de fichiers, la phrase de
//               synthèse). Chaque occurrence doit être exacte.
//   · JOURNAL — le chiffre apparaît aussi en récit. Le MAXIMUM doit être
//               exact : un bilan passé est plus petit, jamais plus grand.
//               Une mention qui DÉPASSE le réel est impossible, donc fautive.
//
// Dans les deux cas, un motif qui ne trouve RIEN est un échec et non un
// silence : c'est la façon dont ce garde-ci pourrait devenir vacant.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Un chiffre écrit en toutes lettres reste un chiffre : la page alterne les deux. */
const UNITES = new Map(Object.entries({
  zéro: 0, zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
  cent: 100, cents: 100,
}));

/** Les ordinaux, parce que le backlog dit « quarante et unième » là où la page dit « quarante et une ». */
const ORDINAUX = new Map(Object.entries({
  premier: 1, première: 1, premiere: 1, unième: 1, deuxième: 2, second: 2, seconde: 2,
  troisième: 3, quatrième: 4, cinquième: 5, sixième: 6, septième: 7, huitième: 8,
  neuvième: 9, dixième: 10, onzième: 11, douzième: 12, treizième: 13,
  quatorzième: 14, quinzième: 15, seizième: 16, vingtième: 20, trentième: 30,
  quarantième: 40, cinquantième: 50, soixantième: 60, centième: 100,
}));

/**
 * Rend le nombre écrit dans `brut`, en chiffres ou en toutes lettres.
 *
 * ⚠️ LÈVE sur un mot inconnu, et c'est délibéré : rendre 0 ou null ferait
 * passer une reformulation pour un compteur juste, donc viderait le garde en
 * silence — exactement le mode de panne qu'il existe pour empêcher.
 */
export function nombreFr(brut) {
  const texte = String(brut ?? '').trim();
  if (texte === '') throw new Error('nombreFr : chaîne vide');
  if (/^\d+$/.test(texte)) return Number(texte);

  const normalise = texte
    .toLowerCase()
    .normalize('NFC')
    .replace(/[-–—]/g, ' ')
    .replace(/\bet\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // « quatre-vingt » n'est pas 4 + 20 : sans ce cas, quatre-vingt-dix vaudrait 34.
    .replace(/\bquatre vingts?\b/g, '§80');

  let total = 0;
  for (const mot of normalise.split(' ')) {
    if (mot === '§80') { total += 80; continue; }
    if (UNITES.has(mot)) { total += UNITES.get(mot); continue; }
    if (ORDINAUX.has(mot)) { total += ORDINAUX.get(mot); continue; }
    throw new Error(`nombreFr : mot non reconnu « ${mot} » dans « ${texte} »`);
  }
  return total;
}

/**
 * Le texte lisible d'une page publiée : balises retirées, entités résolues,
 * blancs aplatis.
 *
 * ⚠️ Les trois sont nécessaires, et l'oubli d'un seul rend « 0 occurrence »
 * pour un contenu présent — vécu trois fois sur ce chantier : `<strong>333</strong>`
 * coupe le mot en deux, `&amp;` masque le motif, et le HTML est replié à ~80
 * colonnes, donc toute expression de plus de quelques mots vit sur deux lignes.
 */
export function texteDeLaPage(html) {
  const corps = String(html).split('<!-- /frame-runtime -->').pop();
  const sansScript = corps
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const sansBalises = sansScript.replace(/<[^>]+>/g, ' ');
  const entites = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  const lisible = sansBalises.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => entites[e]);
  return lisible.replace(/\s+/g, ' ').trim();
}

/**
 * Les compteurs surveillés, chacun ancré sur ce qui le DISTINGUE d'une mention
 * ordinaire.
 *
 * ⚠️ Aucun motif ne cherche le mot nu. « N gardes » apparaît seize fois dans la
 * page (« 401 gardes » d'un terrain, « trois gardes nés vacants »…) et « N runs »
 * plus de cinquante : un motif de famille ne désigne jamais le sous-ensemble
 * visé, il désigne la famille. L'ancre est donc le voisinage — le séparateur du
 * bandeau, le nom du fichier dans l'arbre, la tournure de la phrase.
 */
export const COMPTEURS = [
  {
    cle: 'commits',
    libelle: 'commits de la branche',
    regime: 'ancré',
    motif: /[·/]\s*(\d+)\s+commits\s*[·/]/g,
  },
  {
    cle: 'runs',
    libelle: 'runs joués',
    regime: 'ancré',
    motif: /[·/]\s*([\p{L}\d -]+?)\s+runs\s*[·/]/gu,
  },
  {
    cle: 'plugins',
    libelle: 'plugins du dépôt',
    regime: 'ancré',
    motif: /[·/]\s*([\p{L}\d -]+?)\s+plugins\b/gu,
  },
  {
    cle: 'gardes',
    libelle: 'gardes de la suite',
    regime: 'ancré',
    motif: /run-guards\.test\.mjs\s*←\s*(\d+)\s+gardes/g,
  },
  {
    cle: 'mutations',
    libelle: 'mutations du harnais',
    regime: 'ancré',
    motif: /mutate-run-guards\.py\s*←\s*(\d+)\s+mutations/g,
  },
  {
    cle: 'numeroLibre',
    libelle: 'prochain numéro libre du backlog',
    regime: 'ancré',
    motif: /prochain num[ée]ro libre est\s*(\d+)/gi,
  },
  {
    cle: 'vidages',
    libelle: "fois où le backlog s'est vidé",
    regime: 'journal',
    motif: /backlog s'est vid[ée]\s+([\p{L} -]+?)\s+fois/gu,
  },
];

/**
 * Ce que la PAGE annonce : pour chaque compteur, toutes ses occurrences.
 *
 * Rend aussi les occurrences illisibles plutôt que de les taire — une tournure
 * que `nombreFr` ne sait pas lire est une alerte, pas un silence.
 */
export function compteursDeLaPage(texte) {
  const releve = new Map();
  for (const { cle, libelle, regime, motif } of COMPTEURS) {
    const valeurs = [];
    const illisibles = [];
    for (const trouve of texte.matchAll(new RegExp(motif.source, motif.flags))) {
      try {
        valeurs.push(nombreFr(trouve[1]));
      } catch (erreur) {
        illisibles.push({ brut: trouve[1], raison: erreur.message });
      }
    }
    releve.set(cle, { cle, libelle, regime, valeurs, illisibles });
  }
  return releve;
}

/** Le nombre le plus grand écrit dans `### 317-332.` — les titres de points du backlog. */
export function dernierPointDu(backlog) {
  // ⚠️ Le point doit être suivi d'un ESPACE : sans ça, « ### 2.7 du run 40. »
  // est lu comme un point n° 2 et le maximum devient faux dans l'autre sens.
  const numeros = [...backlog.matchAll(/^### (\d+)(?:-(\d+))?\.\s/gm)]
    .map((m) => Number(m[2] ?? m[1]));
  // ⚠️ DEUX SOURCES, ET LE MAXIMUM DES DEUX. Les titres seuls ne suffisent
  // plus : un point peut être clos sans en avoir jamais eu, quand il va du
  // compte rendu d'un run au correctif sans transiter par le backlog. C'est ce
  // qui est arrivé aux points 347-365 — le contrôleur annonçait « prochain
  // libre 347 » alors que le fichier disait 366, et il rendait ✔ sur un
  // compteur périmé. Un outil qui garde des nombres dérivés doit dériver du
  // TOTAL de ce qui les établit, pas d'une seule de leurs traces.
  const annonces = [...backlog.matchAll(/Prochain numéro libre\s*:\s*(\d+)/g)]
    .map((m) => Number(m[1]) - 1);
  const tous = [...numeros, ...annonces];
  if (tous.length === 0) throw new Error('dernierPointDu : aucun titre de point ni annonce de numéro libre dans le backlog');
  return Math.max(...tous);
}

/**
 * Le plus grand run cité par le backlog — « Run 42 », « le run 41 », « Runs 43 et 44 ».
 *
 * ⚠️ Le motif accepte le PLURIEL et l'énumération, et il l'a appris à ses
 * dépens : `\brun\s+` exige une espace après « run », donc il ratait « Runs 43
 * et 44 » — la façon dont on nomme une CAMPAGNE plutôt qu'un run. Le compteur
 * est resté à 42 le jour même où deux runs venaient d'être joués, et c'est
 * l'outil lui-même qui l'a signalé en rendant un chiffre trop petit. Une
 * énumération dérivée du réel rate quand même les désignations collectives.
 */
export function dernierRunDu(backlog) {
  const numeros = [...backlog.matchAll(/\bruns?\s+(\d+)(?:\s*(?:et|à|-|,|\/)\s*(\d+))?/gi)]
    .flatMap((m) => [Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])]);
  if (numeros.length === 0) throw new Error('dernierRunDu : aucun run cité dans le backlog');
  return Math.max(...numeros);
}

/** Le nombre de gardes de la suite : un `test(` par garde, en début de ligne. */
export function nombreDeGardes(suite) {
  const trouves = suite.match(/^test\(/gm) ?? [];
  if (trouves.length === 0) throw new Error('nombreDeGardes : aucun `test(` trouvé — la suite a changé de forme');
  return trouves.length;
}

/**
 * Ce que le DÉPÔT établit. Les commandes passent par `execute` pour que les
 * gardes puissent les fournir eux-mêmes plutôt que dépendre d'un vrai dépôt.
 */
export function compteursDuDepot({
  racine,
  lire = (chemin) => readFileSync(join(racine, chemin), 'utf8'),
  lister = (chemin) => readdirSync(join(racine, chemin)),
  execute = (bin, args) => execFileSync(bin, args, { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
} = {}) {
  const backlog = lire('docs/backlog-terrain.md');
  const sujets = execute('git', ['log', '--format=%s']).split('\n');
  const clotures = sujets.filter((s) => /^docs: close\b/.test(s));

  // Le prochain numéro libre a DEUX sources indépendantes : les titres du
  // backlog et les sujets des commits de clôture. Elles doivent concorder —
  // sinon une passe a fermé des points sans les inscrire, ou l'inverse.
  const parLeBacklog = dernierPointDu(backlog) + 1;
  const numerosClos = clotures.flatMap((s) => [...s.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1])));
  const parLesCommits = numerosClos.length > 0 ? Math.max(...numerosClos) + 1 : null;

  return {
    commits: Number(execute('git', ['rev-list', '--count', 'HEAD']).trim()),
    // Une passe de clôture = un vidage du backlog = un commit `docs: close`.
    vidages: clotures.length,
    numeroLibre: parLeBacklog,
    numeroLibreSelonLesCommits: parLesCommits,
    runs: dernierRunDu(backlog),
    plugins: lister('plugins').length,
    gardes: nombreDeGardes(lire('tools/run-guards.test.mjs')),
    mutations: nombreDeMutations({ racine, execute }),
  };
}

/**
 * Le harnais compte ses propres mutations : `--list` les énumère sans en jouer
 * une seule (0,08 s contre plusieurs minutes pour une passe — c'est la DURÉE
 * qui prouve que rien n'a été muté, jamais le code de sortie).
 */
export function nombreDeMutations({ racine, execute = (bin, args) => execFileSync(bin, args, { cwd: racine, encoding: 'utf8' }) } = {}) {
  const sortie = execute('python3', ['tools/mutate-run-guards.py', '--list']);
  const lignes = sortie.match(/^\s*\d+\./gm) ?? [];
  if (lignes.length === 0) throw new Error('nombreDeMutations : `--list` n\'a rien énuméré — le harnais a changé de forme');
  return lignes.length;
}

/**
 * Les écarts entre ce que la page annonce et ce que le dépôt établit.
 *
 * Rend une liste vide quand tout concorde. Chaque écart porte de quoi agir :
 * ce qui est écrit, ce qui est vrai, et pourquoi c'est un écart.
 */
export function ecarts(releve, depot) {
  const trouves = [];

  for (const { cle, libelle, regime, valeurs, illisibles } of releve.values()) {
    const attendu = depot[cle];
    if (attendu === undefined) continue;

    for (const { brut, raison } of illisibles) {
      trouves.push({ cle, libelle, genre: 'illisible', attendu, trouve: brut, message: raison });
    }

    // ⚠️ La façon dont CE garde deviendrait vacant : une reformulation de la
    // page, et le motif ne matche plus rien. Le silence serait pris pour un
    // accord. Il doit donc échouer, en disant quoi mettre à jour.
    if (valeurs.length === 0) {
      trouves.push({
        cle, libelle, genre: 'introuvable', attendu, trouve: null,
        message: `aucune mention de « ${libelle} » trouvée dans la page : soit elle a disparu, soit sa tournure a changé et le motif de COMPTEURS est à reprendre`,
      });
      continue;
    }

    if (regime === 'ancré') {
      for (const valeur of valeurs) {
        if (valeur !== attendu) {
          trouves.push({
            cle, libelle, genre: 'périmé', attendu, trouve: valeur,
            message: `la page dit ${valeur}, le dépôt dit ${attendu}`,
          });
        }
      }
      continue;
    }

    // Régime journal : un bilan passé est plus petit, jamais plus grand.
    const maximum = Math.max(...valeurs);
    if (maximum !== attendu) {
      trouves.push({
        cle, libelle, genre: maximum > attendu ? 'impossible' : 'périmé', attendu, trouve: maximum,
        message: maximum > attendu
          ? `la page annonce ${maximum}, plus que les ${attendu} du dépôt : un journal ne peut pas devancer ce qu'il raconte`
          : `la mention la plus récente dit ${maximum}, le dépôt dit ${attendu}`,
      });
    }
  }

  // Les deux sources du numéro libre doivent concorder entre elles, sans quoi
  // le chiffre comparé à la page n'est lui-même pas établi.
  if (depot.numeroLibreSelonLesCommits !== null
      && depot.numeroLibreSelonLesCommits !== depot.numeroLibre) {
    trouves.push({
      cle: 'numeroLibre', libelle: 'prochain numéro libre du backlog', genre: 'sources en désaccord',
      attendu: depot.numeroLibre, trouve: depot.numeroLibreSelonLesCommits,
      message: `le backlog mène à ${depot.numeroLibre} et les commits de clôture à ${depot.numeroLibreSelonLesCommits} : une passe a fermé des points sans les inscrire, ou l'inverse`,
    });
  }

  return trouves;
}
