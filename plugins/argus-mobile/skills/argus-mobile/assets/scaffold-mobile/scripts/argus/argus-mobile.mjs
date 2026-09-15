#!/usr/bin/env node
// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
// @ts-check
/**
 * Argus Mobile — le lanceur, seul endroit du projet qui sait où vit le moteur.
 * ------------------------------------------------------------------------
 * Pourquoi ce fichier existe : le chemin `scripts/argus/<x>.mjs` était écrit
 * quarante et une fois dans les trois fichiers qui EXÉCUTENT (Makefile 19,
 * workflow 12, scripts npm 10), et quarante fois de plus en mentions — dont des
 * messages que le programme imprime à l'utilisateur. Chacun de ces sites est une
 * copie de la même décision, et une copie dérive : le jour où le moteur déménage,
 * il faut les retrouver tous, y compris ceux qui ne s'exécutent jamais et que
 * rien ne fait rougir. C'est l'anti-pattern du geste documenté qui diverge du
 * geste outillé, déjà payé ici une fois.
 *
 * Un seul fichier connaît désormais cet emplacement, et il le CHERCHE plutôt que
 * de le savoir :
 *
 *   1. $ARGUS_MOBILE_ENGINE      — imposé, pour épingler ou pour un test
 *   2. le dossier de ce lanceur  — le moteur est copié dans le projet
 *   3. ~/.argus-mobile/engine    — le moteur est installé une fois pour toutes
 *
 * Aucun des trois n'est deviné : un dossier n'est retenu que s'il porte vraiment
 * le moteur, et le message d'échec nomme les endroits regardés, dans l'ordre.
 *
 * ⚠️ Il EXÉCUTE les scripts, il ne les importe pas. Chacun d'eux ne fait son
 * travail que s'il est invoqué directement (`process.argv[1]` comparé à son
 * propre chemin, realpath des deux côtés) : les importer d'ici les rendrait
 * muets — ils ne feraient rien et sortiraient en 0.
 *
 *   node scripts/argus/argus-mobile.mjs --help
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOI = fileURLToPath(import.meta.url);

/** Un dossier n'est un moteur que s'il porte le script qui enchaîne les autres. */
const PIERRE_DE_TOUCHE = 'run.mjs';

/**
 * Les endroits où chercher QUAND RIEN N'EST IMPOSÉ, dans l'ordre, chacun avec le
 * nom sous lequel on l'annoncera — un chemin qu'on ne sait pas nommer ne se met
 * pas dans un message d'erreur.
 * @returns {Array<[string, string]>}
 */
const candidats = () => [
  ['le dossier de ce lanceur', dirname(MOI)],
  ['l\'installation globale', join(homedir(), '.argus-mobile', 'engine')],
];

/**
 * @returns {{ moteur: string | null, origine: string | null, regardes: string[],
 *             impose: boolean }}
 */
const resoudreMoteur = () => {
  // ⚠️ IMPOSÉ VEUT DIRE IMPOSÉ. Une variable posée qui ne porte pas le moteur est
  // une ERREUR, jamais un repli sur le candidat suivant. Mesuré avant de livrer :
  // la version qui repliait rendait `android` avec ARGUS_MOBILE_ENGINE pointé sur
  // un dossier vide — on croit épingler un moteur, on exécute l'autre, et rien ne
  // le dit. En CI, une variable mal renseignée ferait mesurer le mauvais moteur
  // tout en affichant un succès.
  const impose = process.env.ARGUS_MOBILE_ENGINE;
  if (impose) {
    const regardes = [`$ARGUS_MOBILE_ENGINE : ${impose}`];
    return existsSync(join(impose, PIERRE_DE_TOUCHE))
      ? { moteur: impose, origine: '$ARGUS_MOBILE_ENGINE', regardes, impose: true }
      : { moteur: null, origine: null, regardes, impose: true };
  }

  /** @type {string[]} */
  const regardes = [];
  for (const [origine, chemin] of candidats()) {
    regardes.push(`${origine} : ${chemin}`);
    if (existsSync(join(chemin, PIERRE_DE_TOUCHE))) {
      return { moteur: chemin, origine, regardes, impose: false };
    }
  }
  return { moteur: null, origine: null, regardes, impose: false };
};

/**
 * Les commandes sont DÉRIVÉES du moteur, jamais listées ici : une liste écrite à
 * la main se périme au premier script ajouté, et se périme en silence — la
 * commande neuve serait simplement « inconnue ».
 * @param {string} moteur
 */
const commandesDe = (moteur) => readdirSync(moteur)
  .filter((f) => f.endsWith('.mjs') && f !== basename(MOI))
  .map((f) => f.slice(0, -'.mjs'.length))
  .sort();

/**
 * @param {string[]} commandes
 * @param {string} origine
 * @param {string} moteur
 */
const aide = (commandes, origine, moteur) => {
  console.log('Argus Mobile — usage : argus-mobile <commande> [options…]\n');
  console.log('  commandes  ' + commandes.join(', '));
  console.log(`  moteur     ${moteur}\n             (trouvé par ${origine})\n`);
  console.log('  Les options sont passées telles quelles à la commande :');
  console.log('    argus-mobile run --tags=smoke');
  console.log('    argus-mobile config --print-binary');
};

const main = () => {
  const [commande, ...reste] = process.argv.slice(2);
  const { moteur, origine, regardes, impose } = resoudreMoteur();

  if (moteur === null || origine === null) {
    console.error(impose
      ? '✖ ARGUS_MOBILE_ENGINE désigne un dossier qui ne porte pas le moteur :'
      : '✖ moteur Argus introuvable. Regardé, dans cet ordre :');
    for (const r of regardes) console.error(`    ${r}`);
    console.error(`\n  Un dossier ne compte que s'il porte ${PIERRE_DE_TOUCHE}.`);
    console.error(impose
      ? '  Corrige la variable, ou retire-la pour laisser chercher le lanceur.'
      : '  Pose-le dans le projet (`install-mobile.sh <projet>`), ou désigne-le\n'
        + '  par ARGUS_MOBILE_ENGINE.');
    process.exit(2);
  }

  const commandes = commandesDe(moteur);

  // ⚠️ Sans argument, on n'exécute RIEN. `run` pilote un device et `sec`
  // fabrique des rapports : un lanceur qui « fait quelque chose par défaut »
  // agit pendant qu'on cherche encore comment s'en servir.
  if (commande === undefined) {
    aide(commandes, origine, moteur);
    process.exit(2);
  }
  if (commande === '--help' || commande === '-h') {
    aide(commandes, origine, moteur);
    process.exit(0);
  }
  if (!commandes.includes(commande)) {
    console.error(`✖ commande inconnue : ${commande}`);
    console.error(`  connues : ${commandes.join(', ')}`);
    console.error(`  (dérivées de ${moteur})`);
    process.exit(2);
  }

  const r = spawnSync(process.execPath, [join(moteur, `${commande}.mjs`), ...reste],
    { stdio: 'inherit' });
  if (r.error) {
    console.error(`✖ ${commande} n'a pas pu être lancée : ${r.error.message}`);
    process.exit(2);
  }
  if (r.signal) {
    console.error(`✖ ${commande} interrompue par ${r.signal}`);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
};

// ⚠️ realpath DES DEUX CÔTÉS, comme le reste du moteur : en global, ce fichier
// est atteint par un lien symbolique posé dans le PATH, et une comparaison de
// chemins bruts le ferait alors se croire importé — il ne ferait rien, et
// sortirait en 0.
const invokedDirectly = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(MOI);

if (invokedDirectly) main();
