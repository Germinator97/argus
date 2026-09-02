// Ce qui ne doit pas partir dans une page publiée : les noms et identifiants
// des projets sur lesquels le skill est éprouvé.
//
// Pourquoi ce fichier existe : le 31 août, un balayage a trouvé un nom d'AVD —
// donc le nom d'un CLIENT — dans un bloc terminal publié depuis des semaines.
// Il avait traversé DIX republications sans être vu, parce qu'on relit ce qu'on
// ajoute et jamais ce qui était déjà là. Le contrôle posé ce jour-là était une
// LISTE de noms interdits, et une liste ne connaît que ce qu'on y a mis : elle
// laisse passer le nom suivant, celui auquel personne n'a encore pensé.
//
// ── Large moins les exceptions, jamais étroit plus ce qu'on a vu ────────────
// On mesure donc le PHÉNOMÈNE — un identifiant applicatif, un nom d'émulateur,
// un chemin de machine — et on soustrait ce qui est explicitement générique. La
// direction du raisonnement est tout : une énumération de noms interdits rate
// les désignations qu'on n'a pas prévues, un motif les attrape toutes et coûte
// seulement d'écrire pourquoi telle occurrence est inoffensive.
//
// Et rien ici ne NOMME un projet d'essai : ce fichier est public. Un motif ne
// désigne personne, et les exceptions ne citent que du générique.

/**
 * Le phénomène, pas la liste.
 *
 * ⚠️ Le détecteur d'identifiant est borné aux préfixes en TLD inversé
 * (`com.`, `io.`, `fr.`…) et c'est un compromis assumé : un motif à trois
 * segments quelconques capterait `auth.anchors.success` et `config.build.android`,
 * qui sont des clés de configuration du skill. Le prix est de rater un bundle
 * exotique — écrit ici pour que le prochain sache que la borne existe.
 */
export const DETECTEURS = [
  {
    cle: 'identifiant',
    quoi: 'identifiant applicatif (bundle id, nom de paquet)',
    motif: /\b(?:com|io|net|org|fr|dev|app|me|co|eu|be|ch|ca)\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+/gi,
  },
  {
    cle: 'avd',
    quoi: "nom d'AVD ou d'émulateur",
    motif: /\b[A-Za-z]\w*_API\d+\b/g,
  },
  {
    cle: 'chemin',
    quoi: 'chemin de machine (il porte un nom de compte)',
    motif: /\/(?:Users|home)\/[A-Za-z][\w.-]*/g,
  },
  {
    cle: 'hote',
    quoi: 'adresse et port d\'une machine',
    motif: /\b\d{1,3}(?:\.\d{1,3}){3}:\d+\b/g,
  },
];

/**
 * Ce qui a le droit de passer, et POURQUOI. Chaque entrée est du générique
 * publiable — jamais un vrai nom qu'on aurait décidé de tolérer.
 *
 * ⚠️ Une exception doit encore servir : `estUtilisee` à false signale une entrée
 * qui a survécu à ce qu'elle décrivait. Sans ça une liste d'exceptions devient
 * une permission permanente, ce que ce projet traque partout ailleurs.
 */
export const EXCEPTIONS = [
  { valeur: 'com.exemple.app', pourquoi: "exemple du gabarit — ne désigne aucun projet réel" },
  { valeur: 'AutreProjet_API30', pourquoi: "AVD anonymisé le 31/08/2026 ; le nom d'origine était celui d'un client" },
];

/**
 * Un motif dont l'absence serait impossible. Sans lui, une page vide, tronquée
 * ou lue de travers rendrait « rien d'interdit » — c'est-à-dire exactement le
 * verdict qu'on espère. Prouver que l'instrument mesure avant de lire ce qu'il
 * mesure.
 */
export const TEMOIN = /argus/i;

/**
 * Les fuites d'une page.
 *
 * @param texte le texte lisible de la page (balises retirées, blancs aplatis)
 * @returns {{ fuites: Array, mortes: Array, instrumentAveugle: boolean }}
 */
export function fuitesDe(texte) {
  const autorise = new Set(EXCEPTIONS.map((e) => e.valeur.toLowerCase()));
  const servies = new Set();
  const fuites = [];

  for (const { cle, quoi, motif } of DETECTEURS) {
    for (const trouve of texte.matchAll(new RegExp(motif.source, motif.flags))) {
      const valeur = trouve[0];
      if (autorise.has(valeur.toLowerCase())) { servies.add(valeur.toLowerCase()); continue; }
      fuites.push({ cle, quoi, valeur });
    }
  }

  return {
    fuites,
    mortes: EXCEPTIONS.filter((e) => !servies.has(e.valeur.toLowerCase())),
    instrumentAveugle: !TEMOIN.test(texte),
  };
}
