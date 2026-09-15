#!/usr/bin/env node
// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
// @ts-check
/**
 * Argus Mobile — rapport HTML
 * ------------------------------------------------------------------------
 * Agrège les JSON produits par les autres scripts en un rapport lisible, au
 * même format que celui du skill web (references/report-format.md §C).
 *
 * Entrées (toutes optionnelles) : argus-mobile-report/{report,perf,a11y,sec,sca}.json
 * Sortie : argus-mobile-report/report.html
 *
 * ⚠️ UNE DIMENSION ABSENTE N'EST PAS UNE DIMENSION VERTE. Un fichier manquant
 * ou marqué `skipped` apparaît explicitement comme non exécutée, avec sa raison.
 * Sans cette distinction, un rapport où rien n'a tourné se lit comme un rapport
 * où rien n'a cassé.
 *
 * Usage : node scripts/argus/argus-mobile.mjs report
 */

import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { acquitter, artifactFor, artifactsDir, loadConfig, log, err, warn, writeJson } from './config.mjs';

const SEVERITIES = ['blocker', 'critical', 'major', 'minor', 'info'];

/** Les sources agrégées, avec la dimension que chacune couvre. */
const SOURCES = [
  // ⚠️ L'ÉTAGE 1 N'ÉTAIT LU PAR PERSONNE, ET LA PAGE PUBLIAIT `gate: pass`
  // PAR-DESSUS. Ce fichier agrégeait cinq relevés de device et aucun résultat de
  // `flutter test` : il ne parlait de l'étage 1 que pour la COUVERTURE — quels
  // états y sont montés — jamais pour ses findings. Un run a mesuré 117 échecs
  // réels (contrastes, cibles sous 48 dp, troncatures, débordements) pendant que
  // la page annonçait un run vert sur deux findings info. C'est la seconde fois
  // que ce chantier publie un faux vert, après le 367 (391).
  { file: 'stage1.jsonl', label: 'Gardes d\'étage 1 (sans device)', dimensions: 'a11y · disposition · ancres', how: 'make argus-guards' },
  { file: 'report.json', label: 'Parcours Maestro', dimensions: 'functional · visual · a11y · resilience · stability · i18n', how: 'node scripts/argus/argus-mobile.mjs run' },
  { file: 'perf.json', label: 'Performance', dimensions: 'performance', how: 'node scripts/argus/argus-mobile.mjs perf' },
  { file: 'a11y.json', label: 'Accessibilité (device)', dimensions: 'a11y', how: 'node scripts/argus/argus-mobile.mjs a11y' },
  { file: 'sec.json', label: 'Sécurité MASVS', dimensions: 'security', how: 'node scripts/argus/argus-mobile.mjs sec' },
  { file: 'sca.json', label: 'Dépendances (CVE)', dimensions: 'security', how: 'node scripts/argus/argus-mobile.mjs sca' },
];

/**
 * Agrège le rapport JSON-lines que `flutter test --file-reporter json:` écrit.
 *
 * Rend la MÊME forme que les autres sources — `{findings}` ou `{skipped}` — pour
 * que `collect` n'ait pas à connaître deux façons de lire une dimension.
 *
 * ⚠️ UN FICHIER SANS SA LIGNE `done` EST UN RUN INTERROMPU, pas un run vert.
 * `flutter test` écrit au fil de l'eau : tué en cours, il laisse un fichier
 * parfaitement lisible dont les tests passés sont tous verts. Le lire comme un
 * résultat rendrait exactement le faux vert que ce fichier existe pour empêcher.
 *
 * @param {string} path @returns {any}
 */
export function readStage1(path) {
  if (!existsSync(path)) return null;
  let done = null;
  const echecs = [];
  const noms = new Map();
  for (const ligne of readFileSync(path, 'utf8').split('\n')) {
    if (!ligne.trim()) continue;
    let e;
    try { e = JSON.parse(ligne); } catch { continue; }
    if (e.type === 'testStart' && e.test && !e.test.hidden) noms.set(e.test.id, e.test.name);
    else if (e.type === 'testDone' && !e.hidden && !e.skipped && e.result !== 'success') {
      echecs.push(noms.get(e.testID) ?? `test #${e.testID}`);
    } else if (e.type === 'done') done = e;
  }
  if (!done) {
    return { incomplete: true, status: 'interrompu',
      why: 'le rapport d\'étage 1 n\'a pas de ligne `done` : la suite a été tuée en cours, '
        + 'et ses tests passés ne décrivent pas une exécution complète' };
  }
  if (echecs.length === 0) return { findings: [] };
  // Un seul finding : 117 lignes noieraient la page, et le détail vit dans la
  // sortie de `make argus-guards`, qui donne la ligne EXACTE à corriger.
  return { findings: [{
    id: 'QAM-STAGE1', severity: 'major', dimension: 'a11y',
    title: `${echecs.length} garde(s) d'étage 1 en échec`,
    detail: `Mesurés sans device par \`make argus-guards\`. Les premiers : `
      + `${echecs.slice(0, 5).join(' · ')}${echecs.length > 5 ? ` … et ${echecs.length - 5} autres` : ''}. `
      + 'Relance la cible pour la liste complète : ses messages donnent la ligne à corriger.',
  }] };
}

/** @param {string} path @returns {any} */
function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {unknown} value @returns {string} */
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * Rassemble les sources présentes et distingue trois états : exécutée,
 * sautée avec raison, et jamais lancée.
 *
 * `stale` est posé par l'appelant, après coup : c'est une propriété du LOT (le
 * plus récent sert de référence), pas de la part prise isolément.
 * @param {string} dir
 * @returns {Array<{file:string, label:string, dimensions:string, how:string,
 *   state:string, reason:string, findings:any[], data:any, at:Date|null, stale?:boolean}>}
 */
function collect(dir) {
  const parts = [];
  for (const source of SOURCES) {
    const path = join(dir, source.file);
    const data = source.file.endsWith('.jsonl') ? readStage1(path) : readJson(path);
    // ⚠️ L'ÂGE de chaque part, parce que rien ne l'obligeait à être du même run.
    // Ce script agrège les JSON présents, quels qu'ils soient : après une preuve
    // par corruption de baseline, le HTML décrivait un état qui n'existait plus,
    // sans qu'une seule ligne ne le laisse voir. Un rapport est un instantané —
    // encore faut-il qu'il dise de QUAND.
    const at = data === null ? null : statSync(path).mtime;
    if (data === null) {
      parts.push({ ...source, state: 'absent', reason: `jamais lancé — ${source.how}`, findings: [], data: null, at });
    // ⚠️ LE STUB D'UN RUN INTERROMPU SE LISAIT COMME UNE DIMENSION VERTE.
    // `run.mjs` écrit `incomplete: true` + `status: 'interrompu'` quand un run
    // meurt avant d'écrire son rapport — précisément pour qu'on ne lise pas ses
    // chiffres. Ce fichier ne regardait ni l'un ni l'autre : le stub tombait
    // dans la branche `ok`, et la page annonçait « Parcours Maestro — exécutée,
    // aucun finding » sur SIX dimensions device dont AUCUN flow n'avait
    // démarré. Le pire mode de panne d'un harnais de non-régression :
    // silencieux, vert, et faux là où il promet le plus.
    } else if (data.incomplete === true || data.run?.status === 'interrompu') {
      parts.push({
        ...source,
        state: 'interrompu',
        reason: String(data.why ?? "ce run s'est arrêté avant d'écrire son rapport"),
        findings: data.findings ?? [],
        data,
        at,
      });
    } else if (data.skipped || data.cve?.scanned === false) {
      parts.push({ ...source, state: 'skipped', reason: data.skipReason ?? data.cve?.why ?? 'non exécutée', findings: data.findings ?? [], data, at });
    } else {
      parts.push({ ...source, state: 'ok', reason: '', findings: data.findings ?? [], data, at });
    }
  }
  return parts;
}

/**
 * Marque comme PÉRIMÉE toute part sensiblement plus vieille que la plus récente.
 *
 * Le seuil est dérivé de `budget.maxMinutes` — la durée qu'un run complet a le
 * droit de prendre — plutôt que deviné : au-delà, deux parts ne peuvent pas
 * venir du même run. Le choisir en dur aurait produit exactement le genre de
 * nombre qui se périme sans que rien ne le signale.
 * @param {any[]} parts @param {any} config @returns {{stale:string[], newest:Date|null, budgetMin:number}}
 */
export function stalenessOf(parts, config) {
  const budgetMin = Math.max(1, Number(config?.budget?.maxMinutes ?? 25));
  const dated = parts.filter((/** @type {any} */ p) => p.at instanceof Date);
  if (dated.length === 0) return { stale: [], newest: null, budgetMin };
  const newest = dated.reduce((/** @type {Date} */ a, /** @type {any} */ p) => (p.at > a ? p.at : a), dated[0].at);
  const stale = dated
    .filter((/** @type {any} */ p) => (newest.getTime() - p.at.getTime()) / 60000 > budgetMin)
    .map((/** @type {any} */ p) => p.file);
  return { stale, newest, budgetMin };
}

/**
 * La ligne de couverture — extraite pour être MESURABLE, elle vivait dans le
 * gabarit HTML où rien ne pouvait l'exercer.
 *
 * ⚠️ Elle dit désormais ce qu'elle NE dit PAS. Les trois relevés qu'elle affichait
 * (`screensDeclared`, `screensConfigured`, `notConfigured`) dérivent tous de
 * `config.screens` : un état qui n'y figure pas est invisible aux trois. Sur un
 * projet réel, « 10 déclarés · 10 avec ancre » se lisait « tout est couvert »
 * alors que quatre états n'étaient montés qu'à l'étage 1 — un arbitrage
 * défendable, écrit dans le harnais, mais que le rapport passait sous silence —
 * et que la comparaison visuelle n'en couvrait que quatre.
 *
 * Le compteur ne mentait pas : il répondait à une question plus étroite que
 * celle qu'on lui posait.
 * @param {any} coverage @returns {string}
 */
export function coverageLine(coverage) {
  if (!coverage) return '';
  const declares = coverage.screensDeclared ?? '?';
  const avecAncre = coverage.screensConfigured ?? '?';
  const visuels = (coverage.visualScreens ?? []).length;
  const sansAncre = coverage.notConfigured ?? [];
  // ⚠️ Le seul de ces relevés qui dise ce qui a été TESTÉ : les autres décrivent
  // ce qui a été écrit dans `screens[]`. Un projet réel affichait « 12 sur 12 »
  // avec quatre écrans que rien n'appelait — leurs branches existaient.
  const visites = coverage.visited ?? null;
  const jamais = coverage.notVisited ?? [];
  // Les états que l'étage 1 monte et que `screens[]` ignore : le seul relevé de
  // cette ligne qui ne dérive PAS de la config.
  const etageUn = coverage.stageOneOnly ?? [];
  return `<p class="muted">Écrans déclarés : ${esc(declares)}`
    + ` · avec ancre sémantique : ${esc(avecAncre)}`
    + (visites ? ` · <strong>réellement visités par un flow : ${esc(visites.length)}</strong>` : '')
    + ` · comparés visuellement : ${esc(visuels)}`
    + (sansAncre.length ? ` · sans ancre, donc non testés : ${esc(sansAncre.join(', '))}` : '')
    + (jamais.length ? `<br><span class="badge bad">jamais visités</span> ${esc(jamais.join(', '))}`
      + ` — déclarés, ancrés, et qu'aucune étape exécutée n'a atteints.` : '')
    + (etageUn.length
      // ⚠️ LE CHIFFRE, PAS L'AVEU. Cette phrase disait « un état monté à l'étage 1
      // seul n'y apparaît pas » — vrai, et insuffisant : le harnais Dart est dans
      // le même dépôt, donc le nombre était à portée. Avouer une limite n'est pas
      // la lever.
      ? `<br><span class="badge">étage 1 seulement</span> ${esc(etageUn.length)} état(s)`
        + ` montés sans device et jamais atteints par un flow : ${esc(etageUn.join(', '))}.`
        + ` L'écart est légitime — le SKILL en documente quatre formes — mais il se`
        + ` compte : « ${esc(avecAncre)} sur ${esc(declares)} » décrit screens[], pas l'app.`
      : `<br>Les trois premiers comptes dérivent de <strong>screens[]</strong> : un état monté à`
        + ` l'étage 1 seul, ou jamais déclaré, n'y apparaît pas.`
        + ` « ${esc(avecAncre)} sur ${esc(declares)} » ne veut donc pas dire « tout est couvert ».`)
    + `</p>`;
}


// ═══════════════════════════════════════════════════════════════════════════
// Fragments HTML
// ═══════════════════════════════════════════════════════════════════════════

/** @param {string} label @param {string|number} value @param {string} [cls] */
const metric = (label, value, cls = '') =>
  `<div class="metric ${cls}"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;

/** @param {any[]} parts @returns {string} */
function coverageRows(parts) {
  /** @type {Record<string,string>} */
  const badges = { ok: 'good', skipped: 'warn', absent: 'bad', interrompu: 'bad' };
  /** @type {Record<string,string>} */
  // ⚠️ « interrompue » n'est PAS « sautée » : sautée veut dire qu'on a décidé de
  // ne pas la mesurer, interrompue qu'on a essayé et qu'on ne sait pas.
  const states = {
    ok: 'exécutée', skipped: 'sautée', absent: 'non lancée', interrompu: 'INTERROMPUE',
  };
  return parts.map((part) => {
    const badge = badges[part.state];
    const state = states[part.state];
    const age = part.at instanceof Date ? part.at.toISOString().replace('T', ' ').slice(0, 16) : '—';
    const perime = part.stale ? ' <span class="badge bad">périmée</span>' : '';
    return `<tr><td>${esc(part.label)}</td><td class="muted">${esc(part.dimensions)}</td>`
      + `<td><span class="badge ${badge}">${state}</span>${perime}</td>`
      + `<td class="muted">${esc(age)}</td>`
      + `<td class="muted">${esc(part.reason)}</td></tr>`;
  }).join('');
}

/** @param {any} perf @returns {string} */
export function perfRows(perf) {
  const metrics = perf?.metrics;
  if (!metrics) return '';
  const thresholds = perf.thresholds ?? {};
  /** @type {Array<[string, any, any, string]>} */
  const rows = [
    ['Premier lancement après installation', metrics.firstLaunchMs, null, 'ms'],
    ['Démarrage à froid (médiane)', metrics.coldStartMs, thresholds.coldStartMs, 'ms'],
    ['Démarrage à chaud (médiane)', metrics.warmStartMs, thresholds.warmStartMs, 'ms'],
    ['Mémoire (TOTAL PSS)', metrics.memoryMb, thresholds.memoryMb, 'Mo'],
    ['Taille du binaire', metrics.binarySizeMb, thresholds.binarySizeMb, 'Mo'],
  ];
  return rows.filter(([, value]) => value !== null && value !== undefined).map(([label, value, budget, unit]) => {
    const cls = budget === null || budget === undefined ? '' : (value <= budget ? 'good' : 'bad');
    return `<tr><td>${esc(label)}</td><td class="${cls}">${esc(value)} ${esc(unit)}</td>`
      + `<td class="muted">${budget === null || budget === undefined ? '— (contexte)' : `${budget} ${unit}`}</td></tr>`;
  }).join('');
}

/**
 * La visionneuse des preuves. Les vignettes sont bornées pour que la page reste
 * parcourable ; celle-ci rend la capture lisible quand on la demande.
 *
 * ⚠️ TROIS SORTIES, et c'est la seule chose qui compte ici : la croix, le clic
 * hors de l'image, et Échap. Un overlay plein cadre recouvre tout ce qui est
 * sous lui — y compris la barre par laquelle on croyait pouvoir revenir — et
 * c'est le défaut qu'on ferme ailleurs dans ce rapport, pas celui qu'on ajoute.
 *
 * ⚠️ Un seul écouteur, délégué au document : les vignettes sont rendues dans
 * des cartes que ce script ne connaît pas, et brancher chaque image aurait
 * laissé muettes celles d'un futur bloc. Le geste porte sur la classe.
 */
export const LIGHTBOX = `<div class="lb" id="argus-lb" role="dialog" aria-modal="true" aria-label="preuve agrandie">
<button class="lb-x" type="button" aria-label="Fermer la preuve">&times;</button><img alt=""></div>
<script>
(function () {
  var lb = document.getElementById('argus-lb');
  if (!lb) return;
  var img = lb.querySelector('img');
  function fermer() { lb.classList.remove('on'); img.removeAttribute('src'); }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.classList) return;
    if (t.classList.contains('shot')) { img.src = t.src; img.alt = t.alt; lb.classList.add('on'); return; }
    if (t === lb || t.classList.contains('lb-x')) fermer();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermer(); });
})();
</script>`;

/** @param {any[]} findings @param {Map<string,string>} shots @returns {string} */
export function findingCards(findings, shots = new Map()) {
  if (findings.length === 0) return '<p class="muted">Aucun finding. 🎉</p>';
  return SEVERITIES.map((severity) => {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) return '';
    // 443 — UN ACQUITTEMENT HONORÉ NE SE VOYAIT PAS SUR LA PAGE. `acquitter()`
    // pose `status: 'acknowledged'` et `acknowledgedWhy` dans le JSON ; ce rendu
    // ne lisait NI l'un NI l'autre. La carte sortait donc identique à un finding
    // ouvert, et la RAISON — tout l'intérêt du mécanisme, ce qu'on relit dans six
    // mois pour décider si l'acquittement tient encore — restait dans le JSON.
    // ⚠️ CE N'EST PAS une contradiction entre le total et la liste, et l'avoir
    // d'abord cru était une erreur de lecture : `counts` compte TOUS les findings
    // (c'est voulu et documenté deux cents lignes plus bas — « un signal qu'on
    // assume ne se supprime pas, il change de statut »), et seul `bloquants`, qui
    // ne sert qu'au gate, les exclut. Les deux étaient d'accord ; ce qui manquait
    // était le statut à l'écran.
    // Le titre de groupe gagne quand même la distinction : « 2 critical » sans
    // préciser que l'un est assumé fait chercher deux défauts là où il y en a un.
    const acquittes = group.filter((f) => f.status === 'acknowledged').length;
    const cards = group.map((f) => {
      const ack = f.status === 'acknowledged';
      // Rendu SEULEMENT s'il y a des images : avec `evidence: none` le rapport
      // ne porte que des chemins, et une rangée vide laisserait une gouttière
      // morte sous chaque finding.
      const vignettes = (f.evidence ?? []).filter((/** @type {string} */ e) => shots.has(e));
      return `<div class="card ${severity}${ack ? ' acquitte' : ''}">
      <div class="card-h"><span class="badge ${severity}">${severity}</span> <strong>${esc(f.title)}</strong> <span class="muted">${esc(f.id)}</span></div>
      ${ack ? `<div class="ack">✔ acquitté — ${esc(f.acknowledgedWhy || 'sans raison déclarée')}</div>` : ''}
      <div class="meta">${esc(f.dimension ?? '')}${f.screen ? ` · écran ${esc(f.screen)}` : ''}${f.selector ? ` · ${esc(f.selector)}` : ''}${f.device ? ` · ${esc(f.device)}` : ''}${f.platform ? ` · ${esc(f.platform)}` : ''}</div>
      <table class="kv"><tr><th>attendu</th><td>${esc(f.expected)}</td></tr><tr><th>constaté</th><td>${esc(f.actual)}</td></tr></table>
      ${f.suggestedFix ? `<div class="fix">${esc(f.suggestedFix)}</div>` : ''}
      ${(f.evidence ?? []).length ? `<div class="meta">preuve : ${(f.evidence ?? []).map((/** @type {string} */ e) => esc(e)).join(' · ')}</div>` : ''}${vignettes.length ? `<div class="shots">${vignettes.map((/** @type {string} */ e) => `<img class="shot" src="${shots.get(e)}" alt="preuve : ${esc(e)}" loading="lazy">`).join('')}</div>` : ''}
      ${(f.repro ?? []).length ? `<pre>${(f.repro ?? []).map((/** @type {string} */ r) => esc(r)).join('\n')}</pre>` : ''}
      ${f.wcag ? `<div class="meta">${esc(f.wcag)}</div>` : ''}
    </div>`;
    }).join('');
    // Le total reste le même (1 + 1 = 2, comme `counts`) : on ne retire rien, on
    // dit seulement ce qui est assumé.
    const ouverts = group.length - acquittes;
    const compte = acquittes ? `${ouverts} + ${acquittes} acquitté${acquittes > 1 ? 's' : ''}` : `${group.length}`;
    return `<h3>${severity} (${compte})</h3>${cards}`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// Rendu
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le titre du rapport — celui du h1 ET du <title> local, dérivé des FAITS du
 * run.
 *
 * ⚠️ « Argus Mobile — rapport QA » était le même sur toutes les pages. Depuis
 * le 245-250, un projet publie UNE page par plateforme : deux pages du même
 * projet portaient donc un titre identique et ne se distinguaient qu'en lisant
 * la ligne d'en dessous. Deux onglets de navigateur côte à côte étaient
 * indiscernables, et rien ne le signalait — la page était juste.
 *
 * ⚠️ Dérivé du run, jamais de `artifact.title` : celui-là n'existe que pour la
 * page publiée, or `renderBody` sert AUSSI le rapport local, et les deux
 * décrivent le même run. Les faire diverger serait le défaut d'à côté.
 *
 * ⚠️ Et c'est une FONCTION, pas une expression recopiée aux deux sites : un
 * garde qui l'APPELLE lit ce qu'elle rend, là où un garde qui cherche un motif
 * resterait vert si on rebranchait l'un des deux sites sur un littéral.
 * @param {any} run @returns {string}
 */
export function titreDuRapport(run) {
  // ⚠️ LE NOM, PAS L'IDENTIFIANT. `app.name` du yaml existait déjà et son propre
  // commentaire annonçait qu'il « sert d'étiquette dans les rapports » — rien ne
  // s'en servait. Un titre se lit : « monapp — ios — rapport QA » se reconnaît
  // dans une galerie, « com.exemple.app — ios — rapport QA » se déchiffre.
  // Repli sur l'identifiant, qui ne manque jamais : mieux vaut un titre technique
  // qu'un titre amputé de ce qui le distingue.
  // Les morceaux vides tombent : sans eux, un run sans plateforme rendrait
  // « monapp —  — rapport QA ». Le séparateur orphelin ne lève rien.
  return [run?.name || run?.appId, plateformeLisible(run?.platform), 'rapport QA'].filter(Boolean).join(' — ');
}

/**
 * La plateforme telle qu'on l'ÉCRIT, pas telle qu'on la stocke.
 *
 * ⚠️ DEUX TITRES POUR UNE PAGE. Le `<title>` disait « … — iOS — rapport QA » et
 * le H1 rendu « … — ios — rapport QA », parce que l'un venait d'`artifact.title`
 * écrit à la main et l'autre de `run.platform`, qui est une clé de
 * configuration en minuscules. Sans conséquence fonctionnelle, mais le skill
 * insiste précisément sur le fait que ce titre est « la seule chose qui
 * distingue ton rapport des autres » : deux orthographes pour la même page
 * défont ce qu'il sert à faire.
 *
 * Toute autre valeur passe telle quelle — inventer une casse pour une
 * plateforme qu'on ne connaît pas serait pire que la laisser.
 * @param {unknown} p @returns {string}
 */
export function plateformeLisible(p) {
  const v = String(p ?? '').trim();
  if (v.toLowerCase() === 'ios') return 'iOS';
  if (v.toLowerCase() === 'android') return 'Android';
  return v;
}

/**
 * Le titre de la PAGE PUBLIÉE — celui du `<title>`, et celui que le journal
 * annonce. Les deux, par la même fonction.
 *
 * ⚠️ CE QUI EST ANNONCÉ DOIT ÊTRE CE QUI EST PUBLIÉ. Trois expressions
 * calculaient ce titre séparément, et deux divergeaient — mesuré le
 * 01/09/2026 :
 *   · sur un titre PAR PLATEFORME (la forme du 245), le journal lisait
 *     `config.artifact.title` sans passer par `artifactFor` : il annonçait
 *     « [object Object] » pendant que « T iOS » était publié. Le 245 avait
 *     ajouté la forme sans mettre le journal d'accord ;
 *   · sur un titre VIDE, le journal annonçait « Rapport Argus Mobile » et la
 *     page publiait « Argus Mobile — rapport QA ».
 * Rien ne levait : les deux valeurs sont des chaînes plausibles, et le seul
 * lecteur du journal est celui qui va justement republier — donc celui que
 * l'écart trompe. C'est le motif du 250, sur une autre paire.
 *
 * Le repli nomme le projet et la plateforme, comme le h1 : un défaut générique
 * rendrait toutes les cartes de galerie identiques, c'est-à-dire exactement le
 * défaut que le 252 vient de fermer un cran plus bas.
 * @param {any} config @param {any} run @returns {string}
 */
export function titrePublie(config, run) {
  const ident = artifactFor(config ?? {}, String(run?.platform ?? ''));
  return ident.title || titreDuRapport(run);
}


/** Le style, partagé par les deux rendus. */
// Exporté pour que les gardes LISENT le style rendu au lieu d'un motif de source.
export const STYLE = `<style>
  :root{--bg:#0f1115;--card:#181b22;--fg:#e7e9ee;--muted:#8b93a7;--ok:#2ecc71;--bad:#e85d26;--warn:#f1c40f;--line:#262b36}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:32px 20px}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 12px;border-bottom:1px solid var(--line);padding-bottom:8px}
  h3{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:20px 0 8px}
  .sub{color:var(--muted);margin-bottom:24px;font-size:13px}
  .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}
  .metric{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;text-align:center}
  .metric .v{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}.metric .l{color:var(--muted);font-size:12px;margin-top:4px}
  .metric.blocker .v,.metric.critical .v{color:var(--bad)}.metric.major .v{color:var(--warn)}.metric.pass .v{color:var(--ok)}
  .gate{display:inline-block;padding:6px 14px;border-radius:999px;font-weight:700}
  .gate.pass{background:rgba(46,204,113,.15);color:var(--ok)}.gate.fail{background:rgba(232,93,38,.15);color:var(--bad)}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
  tr:last-child td{border-bottom:none}
  td.good{color:var(--ok)}td.bad{color:var(--bad)}
  .card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--muted);border-radius:8px;padding:14px;margin-bottom:12px}
  .card.blocker,.card.critical{border-left-color:var(--bad)}.card.major{border-left-color:var(--warn)}.card.minor{border-left-color:var(--muted)}
  .card-h{font-size:14px}.meta{color:var(--muted);font-size:12px;margin:6px 0}
  .fix{font-size:13px;margin-top:8px;padding-left:10px;border-left:2px solid var(--line);color:var(--fg)}
  table.kv{margin:8px 0;background:transparent;border:none}table.kv th{width:90px;font-size:12px}table.kv td,table.kv th{border-bottom:none;padding:2px 8px 2px 0}
  .badge{font-size:11px;text-transform:uppercase;padding:2px 8px;border-radius:999px;font-weight:700}
  .badge.blocker,.badge.critical,.badge.bad{background:rgba(232,93,38,.18);color:var(--bad)}
  .badge.major,.badge.warn{background:rgba(241,196,15,.18);color:var(--warn)}
  .badge.minor,.badge.info{background:rgba(139,147,167,.18);color:var(--muted)}
  .badge.good{background:rgba(46,204,113,.18);color:var(--ok)}
  /* 443 — une carte ACQUITTÉE ne peut pas se lire comme un finding ouvert : le
     compteur de sévérité l'exclut déjà, donc une carte rouge vif sans marque
     faisait dire à la page deux choses contradictoires sur le même objet. */
  .card.acquitte{border-left-color:var(--ok);opacity:.72}
  .card.acquitte .badge{text-decoration:line-through}
  .ack{color:var(--ok);font-size:12px;margin:6px 0 2px}
  pre{background:#0b0d11;border:1px solid var(--line);border-radius:6px;padding:10px;overflow:auto;font-size:12px;white-space:pre-wrap;margin:8px 0 0}
  /* ⚠️ UNE HAUTEUR, sinon la page cesse d'être parcourable. Une preuve est une
     capture de téléphone — 1080×2400, ratio 1:2,22 — donc rendue à pleine
     largeur elle occupe ~2 600 px de haut À ELLE SEULE, et un finding de quatre
     lignes se retrouve suivi de trois écrans de défilement. Le rapport n'a
     jamais eu d'autre usage que d'être parcouru.
     ⚠️ Le défaut est né du correctif qui a rendu les captures possibles sur un
     run vert : tant qu'aucune image n'était rendue, rien ne pouvait être trop
     haut. Un remède déplace le mode de panne plus souvent qu'il ne le supprime.
     ⚠️ Et la rangée compte autant que la hauteur. Un finding porte tous les
     artefacts de son flow : pour un échec visuel, référence + capture + diff.
     Aucun des 320 findings des 26 runs archivés n'en portait plus d'un, parce
     qu'aucune régression visuelle n'avait encore été attrapée — c'est-à-dire
     que le cas non observé est le cas NOMINAL du mode REGRESS. */
  .shots{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  .shot{height:240px;width:auto;max-width:100%;object-fit:contain;object-position:top;display:block;border:1px solid var(--line);border-radius:6px;background:#0b0d11;cursor:zoom-in}
  .lb{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none;align-items:center;justify-content:center;z-index:99;padding:24px}
  .lb.on{display:flex}
  .lb img{max-width:92vw;max-height:88vh;object-fit:contain;border-radius:6px}
  .lb-x{position:absolute;top:12px;right:16px;font:inherit;font-size:26px;line-height:1;color:#fff;background:rgba(0,0,0,.55);border:1px solid var(--line);border-radius:6px;padding:2px 12px;cursor:pointer}
  .ok-list{list-style:none;padding:0}.ok-list li{margin:4px 0}
  .muted{color:var(--muted)}footer{margin-top:40px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:16px}
</style>`;

/**
 * Le corps du rapport — SEULE source de vérité des deux rendus. Les dupliquer
 * les aurait laissés diverger dès la première section ajoutée d'un seul côté.
 * @param {any} context @returns {string}
 */
function renderBody(context) {
  const { run, counts, gate, parts, findings, coverage, perf, generatedAt } = context;
  const shots = context.shots ?? new Map();
  const devices = (run?.devices ?? []).map((/** @type {any} */ d) => `${d.id} (${d.model || '?'} · ${d.os || '?'}${d.physical ? ' · APPAREIL RÉEL' : ''})`).join(', ');
  const ok = parts.filter((/** @type {any} */ p) => p.state === 'ok' && p.findings.length === 0);
  // ⚠️ LES DEUX GRANDEURS DE DÉMARRAGE, côte à côte, se lisent comme une
  // contradiction : `coldStartMs` sous son budget pendant que QAM-START rougit à
  // 8 s. Les deux sont justes — première frame contre écran exploitable — et
  // `report.json` porte déjà la phrase qui les sépare (`startup.measures`).
  // Elle n'était rendue nulle part : le HTML montrait les chiffres sans elle.
  const mesureDemarrage = String(context.run?.startup?.measures ?? run?.startup?.measures ?? '');

  // ⚠️ LE TITRE DOIT NOMMER CE QU'IL COIFFE. « Argus Mobile — rapport QA » était
  // le même sur toutes les pages : depuis le 245-250, un projet publie UNE page
  // par plateforme, donc deux pages du même projet portaient un titre identique
  // et ne se distinguaient qu'en lisant la ligne d'en dessous. Deux onglets de
  // navigateur côte à côte étaient alors indiscernables.
  // Dérivé des FAITS du run — jamais du titre configuré, qui n'existe que pour
  // la page publiée : `renderBody` sert aussi le rapport local, et les deux
  // doivent dire la même chose du même run.
  return `<div class="wrap">
  <h1>${esc(titreDuRapport(run))}</h1>
  <div class="sub">
    ${devices ? `${esc(devices)} · ` : ''}
    ${esc(generatedAt)} ·
    <span class="gate ${gate}">gate: ${gate}</span>
  </div>

  <div class="metrics">
    ${SEVERITIES.map((s) => metric(s, counts[s], counts[s] > 0 ? s : 'pass')).join('')}
    ${metric('dimensions exécutées', `${parts.filter((/** @type {any} */ p) => p.state === 'ok').length}/${parts.length}`)}
  </div>

  <h2>Couverture</h2>
  ${mesureDemarrage ? `<p class="muted">Deux grandeurs de démarrage coexistent ici, et elles ne mesurent pas la même chose : ${esc(mesureDemarrage)}</p>` : ''}
  ${run?.scopeBaseline ? `<p class="muted">Périmètre du projet : <strong>${esc(run.scopeBaseline)}</strong> — des flows que le workspace exclut d'office (travail en cours, gestes humains). Ce n'est pas un filtre : un run « complet » ne les exécute jamais.</p>` : ''}
  ${run?.scope && run.scope !== 'complet' ? `<p class="muted"><span class="badge bad">partiel</span> ce rapport vient d'un run <strong>${esc(run.scope)}</strong>, pas d'une passe complète : les dimensions que le filtre a écartées ne sont pas mesurées ici, elles sont ABSENTES. Rejoue <code>make argus-run</code> avant de conclure — c'est notamment le cas après la contre-épreuve visuelle, qui réécrit ce fichier avec la régression qu'on vient de fabriquer.</p>` : ''}
  ${(context.staleness?.stale ?? []).length ? `<p class="muted"><span class="badge bad">périmée</span> ${(context.staleness.stale).length} relevé(s) ont plus de ${context.staleness.budgetMin} min d'écart avec le plus récent : ils ne viennent pas de ce run. Le rapport les agrège en le disant plutôt que de les taire.</p>` : ''}
  <table><tr><th>Source</th><th>Dimensions</th><th>État</th><th>Mesurée le</th><th>Raison</th></tr>${coverageRows(parts)}</table>
  ${coverageLine(coverage)}

  ${perfRows(perf) ? `<h2>Performance</h2><table><tr><th>Mesure</th><th>Valeur</th><th>Budget</th></tr>${perfRows(perf)}</table>
  <p class="muted">Le premier lancement après installation est mesuré à part : c'est un état réel, vécu une fois par chaque utilisateur, et le moyenner avec le régime stabilisé ne décrirait ni l'un ni l'autre.</p>` : ''}

  <h2>Findings (${findings.length})</h2>
  ${context.evidenceNote ?? ''}${findingCards(findings, shots)}

  <h2>✅ Ce qui fonctionne</h2>
  ${ok.length ? `<ul class="ok-list">${ok.map((/** @type {any} */ p) => `<li>${esc(p.label)} <span class="muted">— exécutée, aucun finding</span></li>`).join('')}</ul>` : '<p class="muted">Aucune dimension n\'a tourné sans finding.</p>'}

  <footer>Généré par Argus Mobile (Claude Code) · ${esc(generatedAt)}</footer>
</div>
${shots.size ? LIGHTBOX : ''}`;
}

/** Le rapport tel qu'il s'ouvre depuis le disque, enveloppe comprise.
 * @param {any} context @returns {string} */
function render(context) {
  // Le même titre que le h1 : un rapport local ouvert dans un onglet doit dire
  // de quel projet il parle.
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titreDuRapport(context.run))}</title>
${STYLE}</head><body>${renderBody(context)}</body></html>`;
}

/**
 * Page prête à publier. Le format d'artefact fournit lui-même l'enveloppe
 * <html>/<head>/<body> et REFUSE qu'on la redonne : on ne livre donc que le
 * titre, le style et le corps. Le <title> doit rester dans les premiers Ko,
 * c'est là qu'il est lu.
 * @param {any} context @returns {string}
 */
/**
 * L'HISTORIQUE DES RUNS VIT DANS LA PAGE ELLE-MÊME, et il ne peut pas vivre
 * ailleurs.
 *
 * ⚠️ POURQUOI. `argus-mobile-report/` est ignoré par git et effacé entre deux
 * runs ; un runner de CI est jetable par construction. Le seul support qui
 * survit d'un run à l'autre est la page publiée. Elle porte donc ses propres
 * données, en JSON, et la génération suivante les relit.
 *
 * ⚠️ CE QU'UN ONGLET PASSÉ NE PORTE PAS : ses preuves. Mesuré sur un rapport
 * réel — la page pèse **652 386 octets**, dont ~625 Ko de captures embarquées
 * en data-URI pour UN run, quand ses données tiennent en **1 645**. Garder les
 * images de chaque run ferait sauter la limite de 16 Mo en vingt-cinq passes.
 * Un onglet passé montre donc ce qui a été MESURÉ, pas sa photographie — et il
 * le DIT, plutôt que de laisser croire que l'image manque.
 */
const HISTORIQUE_MAX = 30;
const MARQUE_HISTO = 'argus-runs';

/**
 * L'avertissement dû quand une republication s'apprête à EFFACER l'historique.
 *
 * ⚠️ Extrait de `main()` exprès : laissé dedans, il ne serait gardable qu'en
 * cherchant son texte dans la source — le barreau le plus faible, celui qu'une
 * valeur neutralisée (`if (false && …)`) laisse vert. Ici le garde APPELLE et
 * lit ce qui revient.
 * @param {string} prevPath @param {string} url @returns {string|null}
 */
export function pertePossible(prevPath, url) {
  if (prevPath) return null;   // l'historique est repris : rien à perdre
  if (url) {
    return `une page existe (${url}) et --previous n'a pas été passé :`
      + ' cette republication EFFACERAIT ses onglets. Enregistre la page publiée,'
      + ' puis relance report.mjs avec --previous=<fichier>';
  }
  // ⚠️ ET C'EST ICI QUE LE DANGER VIT, PAS AU-DESSUS. Ce cas rendait `null` sur
  // la prémisse « aucune page n'existe : rien à écraser » — que le commentaire
  // de `consignePublication`, dix lignes plus bas, contredit depuis qu'il a été
  // écrit : l'outil de publication rapproche par CHEMIN DE FICHIER, donc une
  // publication sans URL atterrit sur la page du run précédent et la REMPLACE.
  // Une URL vide dit que la CONFIG ne la connaît pas, jamais qu'il n'y a rien.
  // Deux runs en aveugle y étaient exposés le même jour ; seule leur initiative
  // d'aller lire la galerie a évité d'effacer quatre onglets et de renommer une
  // page. Un troisième, plus tôt, ne l'avait pas eue — d'où deux pages au même
  // titre, dont l'une est morte.
  return 'aucune artifact.url en config, et --previous n\'a pas été passé — ce qui ne'
    + ' prouve PAS qu\'aucune page n\'existe : la publication rapproche par CHEMIN,'
    + ' donc elle atterrirait sur la page d\'un run précédent et REMPLACERAIT ses'
    + ' onglets. Va lire la galerie ; si une page de ce terrain existe, enregistre-la,'
    + ' relance avec --previous=<fichier>, et reporte son URL dans'
    + ' argus.mobile.yaml → artifact.url.<plateforme>.';
}

/**
 * Ce que le journal doit dire AVANT de publier — et le danger que « doublon » cachait.
 *
 * ⚠️ CE MESSAGE ANNONÇAIT L'INVERSE DU RISQUE. Il disait qu'une publication
 * sans `url` « crée un doublon » : au pire deux pages, rien de perdu. La mesure
 * dit le contraire — l'outil de publication rapproche par CHEMIN DE FICHIER, et
 * tous les runs d'un même terrain écrivaient le même `report.artifact.html`.
 * Une publication sans `url` atterrit donc sur la page du run précédent et la
 * REMPLACE. Vécu le 01/09 : un run iOS a écrasé la page Android de SON PROPRE
 * terrain (commit de base identique, donc même chemin absolu), le titre passant
 * de « — Android » à « — iOS ». Rien ne le signale : l'URL rendue a l'air neuve,
 * et les deux runs ne l'ont vu qu'en comparant deux listings d'artefacts.
 *
 * Depuis, le nom du fichier porte la plateforme — ce qui sépare les deux runs
 * d'un même terrain. Ce message porte le reste, qu'aucun nom de fichier ne peut
 * dire : une première publication n'est pas garantie neuve non plus.
 *
 * Extrait de `main()` pour la même raison que `pertePossible` : un garde qui
 * l'APPELLE lit ce qui revient, là où un garde qui cherche son texte dans la
 * source reste vert sur une valeur neutralisée.
 * @param {string} url @param {string} plateforme @returns {string[]}
 */
export function consignePublication(url, plateforme) {
  if (url) {
    return [
      `à REPUBLIER sur ${url} — passe cette URL à la publication`,
      'sans elle, la publication ne crée pas forcément une page neuve : elle peut'
      + " atterrir sur celle d'un run précédent et la REMPLACER",
      "et si cette URL ne résout plus (page supprimée), ne devine pas laquelle la"
      + ' remplace : publie une page neuve et dis-le dans le rapport',
    ];
  }
  return [
    // ⚠️ « PREMIÈRE PUBLICATION » AFFIRMAIT CE QU'ON NE PEUT PAS SAVOIR. Une URL
    // absente de la config ne dit rien de l'existence d'une page : elle dit
    // qu'on ne l'a pas ENREGISTRÉE. Un run a trouvé, par la liste des artefacts,
    // une page publiée deux jours plus tôt là où ce message annonçait une
    // première fois — et c'est le mécanisme du défaut le plus grave de ce
    // chantier, une publication qui atterrit sur la page d'un autre run.
    `aucune URL enregistrée pour ${plateforme} — ce qui ne veut PAS dire qu'aucune `
    + `page n'existe. Cherche-la AVANT de publier (liste des artefacts, titre `
    + `identique), puis reporte l'URL dans argus.mobile.yaml → artifact.url.${plateforme} `
    + `— une page PAR PLATEFORME, pas une pour les deux`,
    "et VÉRIFIE qu'elle n'a pas remplacé une page existante : relis le titre de"
    + " l'URL rendue, ou compare la liste des artefacts avant/après. Une publication"
    + ' sans URL est rapprochée par CHEMIN DE FICHIER, pas par intention',
  ];
}

/**
 * Ce que le journal dit de l'IDENTITÉ de la page — titre, icône — au moment de
 * republier.
 *
 * ⚠️ IL ANNONÇAIT UNE ICÔNE QUE PERSONNE N'AVAIT CHOISIE. La ligne rendait
 * `config.artifact.icon || '👁'` : sur un projet qui n'a rien déclaré — c'est le
 * défaut du scaffold —, elle nommait donc le pictogramme du gabarit avec
 * l'aplomb d'une valeur relevée. Un run l'a recopié tel quel sur une page qui
 * en portait un autre : « sans le `read`, je publiais une page qui changeait
 * d'identité ». Le défaut du gabarit agit ici comme une valeur plausible, le
 * pire genre — rien ne lève, et l'écart ne se voit qu'en rouvrant la page.
 *
 * Le titre, lui, se VÉRIFIE : il est dans la page, et un garde compare l'annonce
 * au `<title>` publié. L'icône NON — le favicon part à l'outil de publication,
 * pas dans le HTML, donc le programme ne peut pas savoir ce que la page porte.
 * D'où la règle : sur ce qu'il ne peut pas mesurer, le journal dit QUOI FAIRE,
 * il n'affirme pas. Une republication garde l'icône en place tant qu'on ne lui
 * en passe pas ; le seul geste juste est de relever celle de la page.
 *
 * Extraite de `main()` pour la raison du 373 : un garde qui APPELLE lit ce qui
 * revient, là où un garde qui cherche un motif de source reste vert sur une
 * valeur neutralisée.
 * ⚠️ 441 — ELLE PREND L'ICÔNE DÉJÀ RÉSOLUE, et c'est le correctif lui-même.
 * Elle recevait `config` et relisait `artifact.icon` À PLAT, pendant que le
 * titre et l'url lui arrivaient résolus par `artifactFor` : deux valeurs sur
 * trois traitées, la troisième laissée derrière. Passer l'icône résolue ne
 * corrige pas seulement le cas — il supprime l'endroit où le défaut pouvait
 * vivre, ce qu'une relecture attentive de la lecture à plat n'aurait pas fait.
 * @param {string} icone @param {string} titre @param {string} url @returns {string[]}
 */
export function identitePubliee(icone, titre, url) {
  icone = String(icone ?? '').trim();
  const lignes = [`titre « ${titre} » — le MÊME à chaque republication (argus.mobile.yaml → artifact.title)`];
  if (icone) {
    lignes.push(`icône ${icone} — la même à chaque republication (argus.mobile.yaml → artifact.icon)`);
  } else if (url) {
    // ⚠️ AUCUN PICTOGRAMME ICI : nommer celui du gabarit est exactement le
    // défaut. On ne sait pas ce que la page porte, on dit où le lire.
    lignes.push('aucune icône déclarée (artifact.icon vide) — n\'en passe pas : une republication'
      + ' GARDE celle de la page. Si tu renseignes artifact.icon, relève d\'abord celle que la'
      + ' page porte, avec le read qui t\'a rendu son historique');
  } else {
    lignes.push('aucune icône déclarée (artifact.icon vide) — choisis-la à cette première'
      + ' publication et reporte-la dans argus.mobile.yaml, sinon la prochaine republication'
      + ' en choisira une autre et la page changera d\'identité');
  }
  return lignes;
}

/** L'enregistrement compact d'un run — ce qu'un onglet passé sait montrer. */
export function runRecord(context) {
  const { run, counts, gate, parts, findings, generatedAt } = context;
  return {
    at: generatedAt,
    platform: String(run?.platform ?? ''),
    appId: String(run?.appId ?? ''),
    scope: String(run?.scope ?? 'complet'),
    gate,
    counts,
    dimensions: (parts ?? []).map((/** @type {any} */ p) => ({
      source: p.file, state: p.state, reason: p.reason ?? '', findings: p.findings.length,
    })),
    // Les findings SANS leurs preuves : c'est le texte qui se relit six mois
    // plus tard, pas la capture.
    findings: (findings ?? []).map((/** @type {any} */ f) => ({
      id: f.id, severity: f.severity, title: f.title, dimension: f.dimension ?? '', screen: f.screen ?? '',
    })),
  };
}

/**
 * L'historique porté par une page déjà publiée.
 *
 * ⚠️ Rend `[]` sur tout ce qui n'est pas une page à nous — page absente, HTML
 * sans la marque, JSON abîmé. Un historique vide fait perdre le PASSÉ ; une
 * exception ferait perdre le RUN. Le premier se voit, le second non.
 * @param {string} html @returns {any[]}
 */
export function historiqueDe(html) {
  const ouvre = `<script type="application/json" id="${MARQUE_HISTO}">`;
  const i = String(html ?? '').indexOf(ouvre);
  if (i < 0) return [];
  const j = html.indexOf('</scr' + 'ipt>', i);
  if (j < 0) return [];
  try {
    const lu = JSON.parse(html.slice(i + ouvre.length, j));
    return Array.isArray(lu) ? lu : [];
  } catch { return []; }
}

/** L'historique embarqué, pour que la génération suivante le relise. */
function embarqueHistorique(records) {
  // ⚠️ `</scr`+`ipt>` dans une donnée fermerait la balise : on l'échappe. C'est
  // le seul caractère qui peut casser un JSON embarqué dans du HTML.
  const json = JSON.stringify(records).replace(/<\//g, '<\\/');
  return `<script type="application/json" id="${MARQUE_HISTO}">${json}</scr` + `ipt>`;
}

const STYLE_ONGLETS = `<style>
.onglets{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 18px;border-bottom:1px solid var(--bord);padding-bottom:0}
.onglets button{font:inherit;font-size:13px;padding:8px 14px;border:1px solid transparent;border-bottom:none;
  border-radius:6px 6px 0 0;background:none;color:var(--doux);cursor:pointer;margin-bottom:-1px}
.onglets button:hover{color:var(--texte)}
.onglets button[aria-selected=true]{background:var(--carte);border-color:var(--bord);color:var(--texte);font-weight:600}
.onglets .pastille{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:1px}
.pastille.pass{background:#16a34a}.pastille.warn{background:#d97706}.pastille.fail{background:#dc2626}
.passe-meta{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--doux);margin:0 0 16px}
.sans-preuve{font-size:13px;color:var(--doux);border-left:3px solid var(--bord);padding:8px 12px;margin:16px 0}
</style>`;

/**
 * Le panneau d'un run PASSÉ — ses mesures, sans ses preuves.
 *
 * ⚠️ Il DIT que les captures ne sont pas gardées. Une page qui les tait laisse
 * lire son silence comme « ce run n'en avait pas », ce qui est faux : il en
 * avait, elles ont été écartées pour tenir dans les 16 Mo de la page.
 */
function panneauPasse(r, i) {
  const badge = String(r.gate || 'pass');
  const cnt = r.counts || {};
  const dims = (r.dimensions || []).map((d) => {
    const etat = d.state === 'ok' ? `${d.findings} finding(s)` : `non exécutée — ${d.reason || '?'}`;
    return `<tr><td>${esc(d.source)}</td><td>${esc(etat)}</td></tr>`;
  }).join('');
  const finds = (r.findings || []).map((f) => `<tr><td>${esc(f.id)}</td><td>${esc(f.severity)}</td>`
    + `<td>${esc(f.title)}</td><td>${esc(f.dimension)}</td><td>${esc(f.screen)}</td></tr>`).join('');
  return `<section id="passe-${i}" role="tabpanel" hidden><div class="wrap">
  <p class="passe-meta"><span><strong>${esc(badge.toUpperCase())}</strong></span>
    <span>${esc(String(r.at || '').replace('T', ' ').slice(0, 16))}</span>
    <span>plateforme ${esc(r.platform || '?')}</span>
    <span>${esc(r.appId || '')}</span>
    <span>portée ${esc(r.scope || 'complet')}</span></p>
  <p>${Number(cnt.critical || 0)} critical · ${Number(cnt.high || 0)} high · ${Number(cnt.medium || 0)} medium · ${Number(cnt.low || 0)} low</p>
  <h2>Dimensions</h2><table><tr><th>source</th><th>état</th></tr>${dims || '<tr><td colspan="2">—</td></tr>'}</table>
  <h2>Findings</h2>${finds
    ? `<table><tr><th>id</th><th>sévérité</th><th>titre</th><th>dimension</th><th>écran</th></tr>${finds}</table>`
    : '<p class="muted">aucun</p>'}
  <p class="sans-preuve">Run archivé : ses mesures sont conservées, <strong>pas ses captures</strong>.
    Un seul run porte ses preuves — le courant — parce qu'elles pèsent à elles seules plusieurs
    centaines de kilo-octets et que la page est plafonnée à 16 Mo.</p>
</div></section>`;
}

/**
 * La page publiable : le run courant, puis un onglet par run archivé.
 *
 * ⚠️ Le run courant est le PREMIER onglet et il est sélectionné : ouvrir la page
 * doit montrer ce qui vient d'être mesuré, jamais un relevé d'il y a trois
 * semaines qui aurait l'air aussi frais que lui.
 */
export function renderArtifact(context) {
  const record = context.record;
  const passes = (context.historique ?? []).slice(0, HISTORIQUE_MAX - 1);
  const tous = record ? [record, ...passes] : passes;
  // ⚠️ LA PLATEFORME N'APPARAÎT QUE SI ELLE DÉTONNE. Une page décrit UNE
  // plateforme depuis le 245, et le titre la porte : la réécrire sur chaque
  // onglet était la même information trois fois de suite. Mais la retirer sans
  // condition supprimerait aussi le seul signal qu'une page a mélangé deux
  // plateformes — ce que le 245 rend possible sans l'interdire. Elle ne
  // s'affiche donc que lorsqu'elle DIFFÈRE de celle du run courant, et c'est
  // alors une anomalie qu'on veut voir.
  const plateformeCourante = String(tous[0]?.platform || '');
  const etiquette = (r, i) => {
    const quand = String(r.at || '').replace('T', ' ').slice(5, 16);
    const nom = i === 0 ? 'Run courant' : quand;
    const plate = String(r.platform || '');
    const detonne = plate !== plateformeCourante;
    return `<button role="tab" aria-selected="${i === 0}" aria-controls="passe-${i}" id="ong-${i}">`
      + `<span class="pastille ${esc(String(r.gate || 'pass'))}"></span>${esc(nom)}`
      + (detonne ? `<span class="muted"> · ${esc(plate || '?')}</span>` : '') + '</button>';
  };
  const onglets = tous.length > 1
    ? `<div class="onglets" role="tablist">${tous.map(etiquette).join('')}</div>`
    : '';
  const archives = passes.map((r, i) => panneauPasse(r, i + 1)).join('\n');
  // ⚠️ Le compte des runs perdus se DÉRIVE, il ne s'annonce pas : dire « les 30
  // derniers » quand il y en a douze est le compteur faux que ce projet traque.
  const perdus = Math.max(0, (context.historique ?? []).length - passes.length);
  const coupe = perdus
    ? `<p class="muted">${perdus} run(s) plus ancien(s) retiré(s) — la page en garde ${HISTORIQUE_MAX}.</p>`
    : '';
  const script = tous.length > 1 ? `<script>
(function () {
  var ongs = Array.prototype.slice.call(document.querySelectorAll('.onglets button'));
  var pans = ongs.map(function (b) { return document.getElementById(b.getAttribute('aria-controls')); });
  function montre(i) {
    ongs.forEach(function (b, j) { b.setAttribute('aria-selected', String(j === i)); });
    pans.forEach(function (p, j) { if (p) p.hidden = j !== i; });
  }
  ongs.forEach(function (b, i) { b.addEventListener('click', function () { montre(i); }); });
  montre(0);
}());
</scr` + `ipt>` : '';
  return `<title>${context.title || titreDuRapport(context.run)}</title>\n${STYLE}\n${STYLE_ONGLETS}\n`
    + `<div class="wrap">${onglets}</div>\n`
    + `<section id="passe-0" role="tabpanel">${renderBody(context)}${coupe}</section>\n`
    + `${archives}\n${script}\n${embarqueHistorique(tous)}\n`;
}

/** @param {number} bytes @returns {string} */
const humanSize = (bytes) => (bytes < 1048576 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1048576).toFixed(1)} Mo`);

/** @type {Record<string, string|undefined>} */
const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

/**
 * Charge les captures de preuve en data URI, des findings les plus graves aux
 * moins graves, sous un plafond de taille.
 *
 * ⚠️ Ce qui ne rentre pas — ou ne se lit pas — est COMPTÉ et rendu à
 * l'appelant, qui l'affiche. Une preuve absente sans un mot se lit « il n'y
 * avait pas de preuve », c'est-à-dire l'inverse de ce qui s'est passé.
 *
 * @param {any[]} findings
 * @param {{evidence:string, maxMb:number}} options
 */
function embedEvidence(findings, options) {
  /** @type {Map<string,string>} */
  const shots = new Map();
  const result = { shots, embedded: 0, tooBig: 0, missing: 0, filtered: 0, bytes: 0 };
  if (options.evidence === 'none') return result;

  const keep = options.evidence === 'major'
    ? new Set(['blocker', 'critical', 'major'])
    : new Set(SEVERITIES);
  const budget = options.maxMb * 1024 * 1024;

  for (const severity of SEVERITIES) {
    if (!keep.has(severity)) {
      // Ce que le SEUIL de sévérité écarte se compte aussi : « 0 capture » et
      // « 3 captures écartées par ton réglage » sont deux situations
      // différentes, et une seule appelle une action.
      for (const finding of findings.filter((f) => f.severity === severity)) {
        for (const rel of finding.evidence ?? []) {
          if (IMAGE_MIME[extname(rel).toLowerCase()]) result.filtered += 1;
        }
      }
      continue;
    }
    for (const finding of findings.filter((f) => f.severity === severity)) {
      for (const rel of finding.evidence ?? []) {
        if (shots.has(rel)) continue;
        const mime = IMAGE_MIME[extname(rel).toLowerCase()];
        if (!mime) continue;                       // dumps, journaux : le chemin suffit
        const full = resolve(process.cwd(), rel);
        if (!existsSync(full)) { result.missing += 1; continue; }
        const uri = `data:${mime};base64,${readFileSync(full).toString('base64')}`;
        if (result.bytes + uri.length > budget) { result.tooBig += 1; continue; }
        shots.set(rel, uri);
        result.bytes += uri.length;
        result.embedded += 1;
      }
    }
  }
  return result;
}

/**
 * Ce que la page dit de ses preuves — appelée, jamais recopiée.
 *
 * 🔴 LE CAS QUI SE TAISAIT, ET C'ÉTAIT LE RUN VERT. Une capture ne part
 * qu'attachée à un FINDING. Un run sans finding porteur — donc le run vert,
 * celui qu'on publie — sortait une page sans une seule image et sans une ligne
 * pour le dire : les quatre compteurs valaient zéro, la note n'était pas rendue,
 * et le lecteur qui avait demandé `all` ne pouvait pas distinguer « il n'y avait
 * rien à montrer » d'un mécanisme en panne. Le dartdoc d'`embedEvidence`
 * promettait déjà l'inverse — « une preuve absente sans un mot se lit *il n'y
 * avait pas de preuve* » — pour tous les cas sauf celui-là.
 *
 * ⚠️ Ne pas confondre les deux zéros : aucune image à embarquer, et des images
 * ÉCARTÉES par `evidence: major`. Le second est un réglage à revoir, le premier
 * n'appelle aucune action — les annoncer pareil ferait chercher une panne
 * inexistante.
 *
 * @param {string} evidence @param {{embedded:number, tooBig:number, missing:number, filtered:number, bytes:number}} shot
 * @param {number} maxMb @returns {string[]}
 */
export function notesDePreuve(evidence, shot, maxMb) {
  const notes = [];
  if (evidence === 'none') notes.push('captures laissées en chemin (artifact.evidence: none)');
  if (shot.embedded) notes.push(`${shot.embedded} capture(s) embarquée(s), ${humanSize(shot.bytes)}`);
  if (shot.tooBig) notes.push(`${shot.tooBig} au-delà du plafond de ${maxMb} Mo, laissée(s) en chemin`);
  if (shot.missing) notes.push(`${shot.missing} introuvable(s) sur le disque`);
  if (shot.filtered) notes.push(`${shot.filtered} écartée(s) par artifact.evidence: ${evidence}`);
  if (evidence !== 'none' && !shot.embedded && !shot.tooBig && !shot.missing && !shot.filtered) {
    notes.push(
      `aucune capture malgré artifact.evidence: ${evidence} — une preuve `
      + "s'attache à un finding, et aucun finding n'en portait",
    );
  }
  return notes;
}

// ═══════════════════════════════════════════════════════════════════════════
// Point d'entrée
// ═══════════════════════════════════════════════════════════════════════════

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  const dir = artifactsDir(config);
  const parts = collect(dir);

  // Un rapport agrège ce qu'il TROUVE, et rien ne garantit que ce soit du même
  // run. Le dire est peu de chose ; ne pas le dire produit une page qui décrit
  // avec assurance un état qui n'existe plus.
  const staleness = stalenessOf(parts, config);
  for (const part of parts) part.stale = staleness.stale.includes(part.file);
  if (staleness.stale.length) {
    warn(`${staleness.stale.length} relevé(s) plus vieux que ${staleness.budgetMin} min par rapport au plus récent : ${staleness.stale.join(', ')}`);
    warn('  Le rapport les agrège quand même, en les marquant — mais ils ne viennent pas de ce run.');
  }

  const findings = parts.flatMap((p) => p.findings);

  // ⚠️ LES ACQUITTEMENTS PÉRIMÉS SE JUGENT ICI, ET NULLE PART AILLEURS. Chaque
  // producteur ne voit que ses propres findings : `sec.mjs` ignore les CVE,
  // `sca.mjs` ignore le MASVS, et tous deux lisent la MÊME liste
  // `security.acknowledged`. Chacun déclarait donc périmés les acquittements de
  // l'autre — mesuré sur un run : « PÉRIMÉ : QAM-SEC-CLEAR » annoncé par `sca`
  // pendant que `sec` l'honorait dans le même rapport. Un acquittement n'est
  // périmé que s'il ne correspond à AUCUN finding, toutes dimensions réunies :
  // c'est une propriété de l'union, donc de ce fichier.
  // ⚠️ Et il faut que TOUTES les dimensions aient tourné pour conclure — sinon
  // un relevé absent fait passer ses acquittements pour périmés. On se tait
  // quand une source manque, plutôt que d'accuser sur un inventaire incomplet.
  const toutesLues = parts.every((p) => p.state === 'ok' || p.state === 'skipped');
  const { perimes, malFormees } = acquitter(findings, config);
  // 442 — HORS du `toutesLues` : une entrée mal formée l'est quelles que soient
  // les dimensions qui ont tourné. La taire tant que l'inventaire est incomplet
  // reviendrait à rejouer le défaut qu'on ferme.
  for (const quoi of malFormees) {
    warn(`acquittement IGNORÉ, forme invalide — ${quoi}. Attendu : « - {id: QAM-…, why: pourquoi} ».`);
    warn('  Tel quel il ne compte pas : le finding reste ouvert alors que tu le crois acquitté.');
  }
  if (toutesLues) {
    for (const id of perimes) {
      warn(`acquittement PÉRIMÉ : « ${id} » ne correspond à aucun finding de ce run — retire-le de security.acknowledged.`);
    }
  } else if (perimes.length) {
    warn(`${perimes.length} acquittement(s) sans finding, mais une dimension n'a pas tourné : rien n'est conclu.`);
  }

  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));

  const failOn = new Set(config.gate?.failOn ?? []);
  // ⚠️ ET LE GATE, QUI EST LA MOITIÉ QUI COMPTE. Il ne se calculait que sur les
  // sévérités : une dimension interrompue ne produit AUCUN finding, donc un run
  // dont pas un flow n'a démarré rendait `pass` dès que les autres relevés
  // étaient propres. Vécu : un run n'a échoué que parce que le scan de sécurité
  // avait trouvé autre chose — sans ça, la page aurait affiché un vert franc
  // sur du néant. On ne peut pas conclure « ça passe » sur ce qu'on n'a pas mesuré.
  const interrompues = parts.filter((p) => p.state === 'interrompu');
  // ⚠️ UN FINDING ACQUITTÉ NE FAIT PAS ÉCHOUER LE GATE — c'est tout l'objet de
  // l'acquittement. Mais il reste COMPTÉ et AFFICHÉ : un signal qu'on assume ne
  // se supprime pas, il change de statut. Sans quoi l'acquittement deviendrait
  // une suppression, et la page mentirait par omission.
  const bloquants = Object.fromEntries(SEVERITIES.map((s) => [s,
    findings.filter((f) => f.severity === s && f.status !== 'acknowledged').length]));
  const gate = interrompues.length > 0
    || SEVERITIES.some((s) => failOn.has(s) && bloquants[s] > 0) ? 'fail' : 'pass';
  const brut = parts.find((p) => p.file === 'report.json')?.data?.run ?? { platform: (config.platforms ?? [])[0], appId: config.app?.androidPackage || config.app?.iosBundleId };
  // `report.json` ne porte pas le nom du projet — il décrit un run, pas un
  // dépôt. On le prend dans la config, sans écraser celui qui viendrait de là.
  // `report.json` écrit `appName` ; ce fichier lisait `name`, et le repli sur la
  // config masquait l'écart — les deux clés portaient la même valeur par hasard.
  const run = { ...brut, name: brut.name || brut.appName || config.app?.name || '' };
  const coverage = parts.find((p) => p.file === 'report.json')?.data?.coverage ?? null;
  const perf = parts.find((p) => p.file === 'perf.json')?.data ?? null;
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const htmlPath = join(dir, 'report.html');
  const context = { run, counts, gate, parts, findings, coverage, perf, generatedAt, staleness };
  writeJson(join(dir, 'summary.json'), {
    generatedAt, gate, counts, findings: findings.length,
    staleParts: staleness.stale,
    dimensions: parts.map((p) => ({
      source: p.file, state: p.state, reason: p.reason, findings: p.findings.length,
      measuredAt: p.at instanceof Date ? p.at.toISOString() : null, stale: p.stale === true,
    })),
  });
  writeFileSync(htmlPath, render(context), 'utf8');

  // Page publiable, EN PLUS des fichiers. Les scripts ne publient pas : seul
  // l'agent en a le moyen (voir SKILL.md), et une CI n'a pas d'agent — un job
  // produira donc toujours ce fichier, jamais une URL.
  if (config.artifact?.enabled) {
    const evidence = config.artifact.evidence ?? 'all';
    const maxMb = config.artifact.maxMb ?? 12;
    const shot = embedEvidence(findings, { evidence, maxMb });
    const notes = notesDePreuve(evidence, shot, maxMb);
    const evidenceNote = notes.length ? `<p class="muted">Preuves : ${esc(notes.join(' · '))}</p>` : '';
    // ⚠️ LE NOM PORTE LA PLATEFORME, et ce n'est pas cosmétique. L'outil de
    // publication rapproche par CHEMIN DE FICHIER : tant que les deux runs d'un
    // même terrain écrivaient `report.artifact.html`, publier le second sans
    // passer d'URL atterrissait sur la page du premier et la remplaçait. Mesuré
    // le 01/09 — un run iOS a effacé la page Android de son propre terrain.
    const plateforme = String(context.run?.platform ?? 'android');
    const artifactPath = join(dir, `report.artifact.${plateforme}.html`);

    // L'HISTORIQUE vient de la page DÉJÀ PUBLIÉE, que l'agent enregistre avant
    // de republier (`--previous=<fichier>`). Rien d'autre ne survit : le dossier
    // de rapport est ignoré par git et effacé entre deux runs.
    const prevArg = process.argv.find((x) => x.startsWith('--previous='));
    const prevPath = prevArg ? prevArg.slice('--previous='.length) : '';
    let historique = [];
    if (prevPath) {
      if (existsSync(prevPath)) {
        historique = historiqueDe(readFileSync(prevPath, 'utf8'));
        log(`  historique repris : ${historique.length} run(s) depuis ${prevPath}`);
      } else warn(`--previous=${prevPath} : fichier absent — l'historique repart de zéro`);
    }
    // ⚠️ CE SILENCE-LÀ COÛTE LE PASSÉ. Une page existe (son URL est déclarée),
    // on va republier par-dessus, et sans `--previous` la nouvelle n'a qu'un
    // onglet : les runs précédents ne sont pas « masqués », ils sont ÉCRASÉS.
    // Rien ne lève, la page est valide, et la perte ne se voit qu'en la rouvrant.
    const ident = artifactFor(config, String(context.run?.platform ?? ''));
    const perte = pertePossible(prevPath, ident.url);
    if (perte) warn(perte);

    const titre = titrePublie(config, context.run);
    writeFileSync(artifactPath, renderArtifact({
      ...context, shots: shot.shots, evidenceNote,
      title: titre,
      record: runRecord(context), historique,
    }), 'utf8');
    log(`page publiable : ${artifactPath}`);
    for (const note of notes) log(`  · ${note}`);
    // ⚠️ UNE PAGE PAR PLATEFORME. Un rapport décrit un run, donc une plateforme ;
    // republier un run iOS sur l'URL d'un run Android ne les réunit pas, il
    // remplace l'un par l'autre — et le premier n'existe plus nulle part.
    for (const ligne of consignePublication(ident.url, plateforme)) log(`  ${ligne}`);
    // ⚠️ L'identité de la page se LIT ici, elle ne se retient pas. Le skill exige
    // titre et icône stables d'un run à l'autre ; sans les rappeler, celui qui
    // republie en choisit d'autres et la page se lit comme une seconde page.
    for (const ligne of identitePubliee(ident.icon, titre, ident.url)) log(`  ${ligne}`);
  }

  const notRun = parts.filter((p) => p.state !== 'ok');
  // ⚠️ LE BANDEAU « PARTIEL » VIT DANS LA PAGE, ET LA PAGE N'EST PAS CE QU'ON
  // REGARDE EN PREMIER. Un run a produit un rapport depuis une passe filtrée,
  // et ne s'en est aperçu qu'en LISANT le JSON avant de publier — le terminal,
  // lui, annonçait un compte de findings comme n'importe quel autre run. Le
  // chiffre était exact et la conclusion qu'il invitait à tirer, fausse.
  if (String(run?.scope ?? 'complet') !== 'complet') {
    warn(`ce rapport vient d'un run « ${run.scope} », PAS d'une passe complète.`);
    warn('    Les dimensions que le filtre a écartées ne sont pas mesurées : elles sont ABSENTES,');
    warn('    et le compte ci-dessous ne décrit qu\'une partie. Rejoue `make argus-run` avant de');
    warn('    conclure — c\'est notamment le cas après la contre-épreuve visuelle.');
  }
  log(`${findings.length} finding(s) · gate ${gate} · ${parts.length - notRun.length}/${parts.length} dimension(s) exécutée(s)`);
  for (const part of notRun) log(`  ○ ${part.label} : ${part.reason}`);
  log(`rapport : ${htmlPath}`);
  log(`ouvrir : open ${htmlPath}   (ou : xdg-open / start)`);
}

// Comme pour run.mjs : ne lancer que si CE fichier est le point d'entrée. Sans
// ce garde, l'importer pour en tester une fonction déclencherait un vrai run —
// et c'est ce qui rendait ces scripts intestables, donc non testés.
// ⚠️ `realpathSync` DES DEUX CÔTÉS. `resolve()` normalise sans résoudre les
// liens symboliques, or `import.meta.url` porte le chemin RÉEL : lancé par un
// chemin qui traverse un lien (sur macOS, `$TMPDIR` et `/tmp` en sont),
// le script ne se reconnaît pas, `main()` n'est jamais appelé — pas de sortie,
// pas d'erreur, exit 0. Mesuré : `node scripts/argus/perf.mjs` mesure,
// `node /var/folders/…/perf.mjs` ne fait rien et rend 0.
const invokedDirectly = process.argv[1] !== undefined
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
