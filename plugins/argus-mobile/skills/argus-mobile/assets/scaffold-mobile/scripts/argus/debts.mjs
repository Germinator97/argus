#!/usr/bin/env node
// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
// @ts-check
/**
 * Argus Mobile — ÉCRIT la dette assumée dans `known_issues.dart`.
 * ------------------------------------------------------------------------
 * Pourquoi ce fichier existe : `make argus-debts` DÉRIVE le bloc de dette et
 * s'arrête à l'affichage. L'écriture restait donc à la charge de celui qui
 * lit — et c'est elle, exactement elle, que `known_issues.dart` interdit en
 * majuscules trois fois de suite : son dartdoc porte la ligne de déclaration
 * mot pour mot et PLUS HAUT que la vraie, si bien qu'un `indexOf` ou un `sed`
 * ancré dessus frappe le commentaire.
 *
 * Mesuré au run 91 : un agent qui avait lu l'avertissement a écrit
 * `index('const Set<String> argusKnownIssues')`, détruit le fichier, puis l'a
 * reconstruit EN CITANT l'avertissement qu'il venait d'enfreindre. C'était la
 * troisième destruction par ce mécanisme ; le remède d'alors — un marqueur et
 * une mise en garde — était un panneau, pas un garde-fou.
 *
 * Le remède n'est pas la discipline, c'est de supprimer la raison de bricoler
 * un script : tant qu'il faut écrire le sien, on écrira `indexOf`.
 *
 *   make argus-debts                      # le bloc, comme avant
 *   make argus-debts-write                # … et il est ÉCRIT
 *   make argus-debts | node scripts/argus/argus-mobile.mjs debts --write
 *
 * ⚠️ IL AJOUTE, IL NE REMPLACE PAS. Une clé déjà inscrite ne fait plus échouer
 * la suite, donc elle n'apparaît plus dans ce que `argus-debts` dérive :
 * réécrire le fichier avec le seul bloc reçu VIDERAIT la dette assumée au
 * deuxième lancement. L'union est la seule opération correcte, et elle rend le
 * geste idempotent — relancé, il ajoute zéro.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MOI = fileURLToPath(import.meta.url);

/** Le fichier de dette, relatif à la racine du projet. */
const CIBLE = join('test', 'argus', 'known_issues.dart');

/** Ce sans quoi on n'écrit pas : le marqueur doit PRÉCÉDER la déclaration. */
const MARQUEUR = 'ARGUS:DECLARATION';
const DECLARATION = 'const Set<String> argusKnownIssues';

/**
 * Les clés que porte un texte de dette — une par ligne, quotées, suivies d'une
 * virgule, telles que le harnais les émet et que `argus-debts` les extrait.
 * @param {string} texte
 * @returns {string[]}
 */
export function clesDe(texte) {
  /** @type {string[]} */
  const cles = [];
  for (const ligne of texte.split('\n')) {
    const m = /^\s*'((?:[^'\\]|\\.)*)',\s*$/.exec(ligne);
    if (m) cles.push(m[1]);
  }
  return cles;
}

/**
 * Où vit le set, dans un fichier dont le motif apparaît DEUX fois.
 *
 * ⚠️ `lastIndexOf`, jamais `indexOf` : le dartdoc en porte un exemplaire, plus
 * haut. Et on exige que le marqueur soit AVANT ce qu'on a trouvé — sans quoi on
 * s'apprête à écrire dans un commentaire qui cite la déclaration, ce qui est
 * arrivé (« un run a écrit sa propre note au-dessus »).
 *
 * @param {string} source
 * @returns {{ ok: true, decl: number, debut: number, fin: number, cles: string[] }
 *            | { ok: false, pourquoi: string }}
 */
export function situerLeSet(source) {
  const decl = source.lastIndexOf(DECLARATION);
  if (decl === -1) {
    return { ok: false, pourquoi: `\`${DECLARATION}\` est introuvable : ce n'est pas le fichier de dette` };
  }
  const marqueur = source.lastIndexOf(MARQUEUR, decl);
  if (marqueur === -1) {
    return {
      ok: false,
      pourquoi: `le marqueur \`${MARQUEUR}\` ne précède pas la déclaration — sans lui, rien ne `
        + 'distingue le code du commentaire qui le cite, et c\'est le commentaire qu\'on réécrirait',
    };
  }
  // Le set va de la première accolade APRÈS la déclaration jusqu'à sa fermante.
  const ouvre = source.indexOf('{', decl);
  const ferme = source.indexOf('}', ouvre);
  if (ouvre === -1 || ferme === -1) {
    return { ok: false, pourquoi: 'le set n\'est pas délimité par `{` … `}` après la déclaration' };
  }
  return {
    ok: true, decl, debut: ouvre + 1, fin: ferme,
    cles: clesDe(source.slice(ouvre + 1, ferme)),
  };
}

/**
 * Le fichier réécrit, avec l'UNION des clés — et rien d'autre de touché.
 *
 * @param {string} source
 * @param {string[]} ajouts
 * @returns {{ ok: true, source: string, avant: number, ajoutees: string[], total: number }
 *            | { ok: false, pourquoi: string }}
 */
export function fusionner(source, ajouts) {
  const ou = situerLeSet(source);
  // ⚠️ `=== false`, jamais `!ou.ok` — ici et aux deux sites qui suivent. La CI
  // type ces scripts SANS `strictNullChecks`, et TypeScript ne restreint alors
  // pas une union sur la véracité d'un littéral : sous `!ou.ok`, `ou.pourquoi`
  // reste inconnu, et le typage échoue. Mesuré sur une sonde : `=== false`
  // restreint, `!` non. Ce fichier est le seul à rendre une union discriminée.
  if (ou.ok === false) return ou;
  const avant = new Set(ou.cles);
  const ajoutees = ajouts.filter((c) => !avant.has(c));
  const toutes = [...new Set([...ou.cles, ...ajouts])].sort();
  const corps = toutes.length === 0
    ? ''
    : `\n${toutes.map((c) => `  '${c}',`).join('\n')}\n`;
  // 📌 La déclaration est RÉÉCRITE sous sa forme recollée plutôt que laissée
  // repliée : le fichier livré porte `=\n    <String>{}` (vide), et n'y toucher
  // pas rendrait un Dart valide mais mal indenté, que `dart format` viendrait
  // ranger ensuite — l'outil n'a pas à créer du travail derrière lui. C'est de
  // toute façon la forme vers laquelle le formateur converge, celle-là même qui
  // rend les deux occurrences identiques et impose le `lastIndexOf` ci-dessus.
  const entete = `${DECLARATION} = <String>{`;
  return {
    ok: true,
    source: source.slice(0, ou.decl) + entete + corps + source.slice(ou.fin),
    avant: avant.size,
    ajoutees,
    total: toutes.length,
  };
}

/** @param {NodeJS.ReadStream} flux */
const lireEntree = async (flux) => {
  if (flux.isTTY) return '';
  /** @type {Buffer[]} */
  const morceaux = [];
  for await (const m of flux) morceaux.push(Buffer.from(m));
  return Buffer.concat(morceaux).toString('utf8');
};

const aide = () => {
  console.log('Argus Mobile — écrit la dette assumée dans ' + CIBLE + '\n');
  console.log('  Le bloc se lit sur l\'ENTRÉE STANDARD, tel que `make argus-debts` l\'imprime :\n');
  console.log('    make argus-debts | argus-mobile debts --write\n');
  console.log('  (sans --write)     dit ce qu\'il écrirait, et n\'écrit rien');
  console.log('  --write            écrit, en AJOUTANT à ce qui est déjà assumé');
  console.log('  --remove=<clé>     RETIRE une clé payée — l\'autre moitié du geste');
  console.log('  --help, -h         ceci\n');
  console.log('  Il s\'ancre sur la DERNIÈRE occurrence de la déclaration, le dartdoc du');
  console.log('  fichier en portant un exemplaire mot pour mot plus haut.');
};

/**
 * Retire une clé payée.
 *
 * ⚠️ CETTE MOITIÉ EXISTE PARCE QUE LE FICHIER A DEUX MESSAGES. Le harnais dit
 * « inscris-le » quand un défaut apparaît et « retire cette ligne » quand il est
 * corrigé — deux gestes, le MÊME fichier, le MÊME piège d'ancrage. N'outiller
 * que l'ajout aurait laissé le retrait à la main, c'est-à-dire laissé ouverte la
 * forme exacte du défaut qu'on vient de fermer.
 *
 * @param {string} chemin
 * @param {string} clef
 * @param {boolean} ecrit
 * @returns {number}
 */
const retirer = (chemin, clef, ecrit) => {
  let source;
  try {
    source = readFileSync(chemin, 'utf8');
  } catch {
    console.error(`✖ ${CIBLE} est illisible depuis ${process.cwd()}`);
    return 2;
  }
  const ou = situerLeSet(source);
  if (ou.ok === false) {
    console.error(`✖ ${CIBLE} : ${ou.pourquoi}`);
    return 2;
  }
  // ⚠️ Une clé absente est une ERREUR, jamais un succès silencieux : c'est le
  // cas d'une clé recopiée de travers, et se taire laisserait croire au retrait.
  if (!ou.cles.includes(clef)) {
    console.error(`✖ « ${clef} » n'est pas dans la dette assumée (${ou.cles.length} clé(s)).`);
    console.error('  Recopie-la TELLE QUELLE depuis le message d\'échec — elle porte des « · ».');
    return 2;
  }
  const restantes = ou.cles.filter((c) => c !== clef);
  const corps = restantes.length === 0
    ? ''
    : `\n${restantes.map((c) => `  '${c}',`).join('\n')}\n`;
  const entete = `${DECLARATION} = <String>{`;
  if (ecrit) {
    writeFileSync(chemin, source.slice(0, ou.decl) + entete + corps + source.slice(ou.fin), 'utf8');
  }
  console.log(`  1 clé ${ecrit ? 'retirée' : 'à retirer'} · ${restantes.length} restante(s)`);
  console.log(`    − ${clef}`);
  if (!ecrit) console.log('\n  Rien n\'a été écrit. Ajoute `--write`.');
  return 0;
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { aide(); return 0; }

  // ⚠️ Un outil qui ÉCRIT ne démarre pas sur un argument qu'il ne comprend pas :
  // le flag inconnu tomberait dans le seul comportement offert, c'est-à-dire le
  // plus destructeur, et il frapperait pendant la reconnaissance.
  const aRetirer = args.find((a) => a.startsWith('--remove='));
  const inconnus = args.filter((a) => a !== '--write' && a !== aRetirer);
  if (inconnus.length > 0) {
    console.error(`✖ option inconnue : ${inconnus.join(', ')}`);
    console.error('  `--help` dit ce que cette commande accepte.');
    return 2;
  }

  if (aRetirer !== undefined) {
    const clef = aRetirer.slice('--remove='.length);
    if (clef === '') {
      console.error('✖ `--remove=` sans clé. Recopie-la depuis le message d\'échec.');
      return 2;
    }
    return retirer(join(process.cwd(), CIBLE), clef, args.includes('--write'));
  }

  const entree = await lireEntree(process.stdin);
  const ajouts = clesDe(entree);
  if (ajouts.length === 0) {
    // ⚠️ « rien à écrire » n'est pas « la dette est vide » : on ne TOUCHE donc
    // pas au fichier. Vider un set parce qu'une suite verte n'a rien rendu
    // effacerait précisément ce qui la rend verte.
    console.log('  (aucune clé sur l\'entrée — rien n\'est écrit, et la dette existante est intacte)');
    console.log('  Attendu : le bloc de `make argus-debts`, une clé quotée par ligne.');
    return 0;
  }

  const chemin = join(process.cwd(), CIBLE);
  let source;
  try {
    source = readFileSync(chemin, 'utf8');
  } catch {
    console.error(`✖ ${relative(process.cwd(), chemin)} est illisible depuis ${process.cwd()}`);
    console.error('  Lance la commande depuis la racine du projet instrumenté.');
    return 2;
  }

  const fusion = fusionner(source, ajouts);
  if (fusion.ok === false) {
    console.error(`✖ ${CIBLE} : ${fusion.pourquoi}`);
    return 2;
  }

  const ecrit = args.includes('--write');
  // ⚠️ Tout est calculé AVANT d'ouvrir : un `writeFileSync` tronque, donc un
  // calcul qui lèverait entre l'ouverture et l'écriture laisserait le fichier
  // vide — et l'exception se lirait comme « rien n'a été fait ».
  if (ecrit) writeFileSync(chemin, fusion.source, 'utf8');

  const quoi = ecrit ? 'inscrite(s)' : 'à inscrire';
  console.log(`  ${fusion.ajoutees.length} clé(s) ${quoi} · ${fusion.avant} déjà assumée(s) · ${fusion.total} au total`);
  for (const c of fusion.ajoutees) console.log(`    + ${c}`);
  if (!ecrit) console.log('\n  Rien n\'a été écrit. Ajoute `--write` (ou lance `make argus-debts-write`).');
  return 0;
};

const invokedDirectly = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(MOI);

if (invokedDirectly) main().then((code) => process.exit(code));
