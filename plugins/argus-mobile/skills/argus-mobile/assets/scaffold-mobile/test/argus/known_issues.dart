// ═══════════════════════════════════════════════════════════════════════════
// Argus Mobile — la dette que les gardes ont RÉVÉLÉE, et que tu n'as pas encore
// corrigée.
// ARGUS:OWNED — à toi : l'installeur ne l'écrase ni ne le compare, jamais.
// ARGUS:PURGE — …mais il le RETIRE à la désinstallation, et c'est le seul fichier
// dans ce cas. Les autres décrivent TON application — tes écrans, tes parcours, ta
// config — et tu les retrouves si tu réinstalles. Celui-ci décrit ce que NOS gardes
// ont relevé sur elle : les gardes partis, il fige un verdict que plus rien ne peut
// rejouer, en Dart, dans `test/`, où il continue de compiler sans rien garder. Et
// `make argus-debts-write` le régénère en une commande — c'est la seule chose de toi
// qui vive ici, et la seule qui ne coûte rien à refaire.
//
// À QUOI ÇA SERT. Installer l'étage 1 sur une application existante ne crée
// aucun défaut : il en découvre. Sur un projet réel, la première exécution a
// rendu 43 échecs — des cibles tactiles sous 48 dp, des contrastes sous WCAG AA,
// des débordements à 200 % de taille de texte. Ils appartiennent au projet,
// pas au harnais, et ils ne se corrigent pas dans la journée.
//
// Restaient trois issues, et deux sont mauvaises :
//   · corriger tout avant d'installer — le harnais n'entre jamais ;
//   · installer rouge — une suite rouge en permanence finit désactivée, et le
//     jour où elle l'est, elle ne garde plus rien du tout ;
//   · FIGER le relevé, ce que fait ce fichier.
//
// ⚠️ AVANT D'ACCEPTER LE LOT, OUVRE-EN TROIS À LA MAIN.
// Coller trente ou quarante lignes d'un coup est le geste normal — et c'est
// aussi celui qui fige un défaut du MONTAGE en le prenant pour un défaut du
// projet. Une police non chargée, un padding système non simulé, une locale
// absente ne produisent pas un échec : ils en produisent des dizaines, tous
// plausibles, tous du même genre que de vrais défauts. Le relevé devient alors
// un mensonge figé, et il est PIRE qu'une suite rouge, parce qu'il est vert.
// Trois suffisent, de trois natures différentes (un label, un contraste, un
// débordement) : ce qu'on cherche est une cause COMMUNE, et une cause commune
// s'attrape sur n'importe lequel de ses effets. Si les trois décrivent bien
// l'application, le lot est du projet ; si l'un d'eux décrit ton harnais, ils
// le décrivent probablement tous.

// ⚠️ CE N'EST PAS UNE LISTE D'EXCEPTIONS, C'EST UN RELEVÉ.
// Une ligne inscrite ici affirme que le défaut EST ENCORE LÀ. Le jour où tu le
// corriges, le test rougit et te demande de retirer la ligne. C'est ce qui
// empêche la liste de survivre à ce qu'elle décrit : sans ça, elle deviendrait
// une permission permanente et le garde cesserait de garder sans le dire.
//
// ⚠️ ET VOICI SA LIMITE EXACTE, parce qu'elle a été mesurée. La confrontation a
// lieu quand la clé est EXERCÉE : `argusCheck` compare ce que la mesure vient
// de rendre à ce que cette liste déclare. Une clé qu'aucun appel ne produit
// n'est donc confrontée à rien — elle ne rougit jamais, et personne ne
// l'apprend. Ce fichier disait « asserté par égalité », ce qui promettait plus.
//
// Deux choses ferment la porte, et la seconde est ta vigilance :
//   · un garde vérifie que chaque ligne nomme un ÉCRAN DÉCLARÉ, ce qui attrape
//     l'écran retiré et la faute de frappe sur l'écran ;
//   · pour le reste de la clé, COLLE ce que le message d'échec te donne. Une
//     clé réécrite de mémoire ne correspond à rien, et ce rien est silencieux.
//
// La clé exacte à inscrire est donnée par le message d'échec, prête à coller.
// Ne la réécris pas de mémoire : elle porte l'écran, le gabarit et l'échelle de
// texte, et une clé approximative ne correspond à rien — ce qui laisse le test
// rouge en donnant l'impression que la ligne a été prise en compte.
// ═══════════════════════════════════════════════════════════════════════════

/// la dette que tu assumes, une ligne par défaut, telle que le
/// message d'échec te la donne.
///
///     const Set<String> argusKnownIssues = <String>{
///       'home · cibles tactiles ≥ 48 dp (Android)',
///       'panier · compact 360×640 · texte ×2.0 · aucun texte tronqué',
///     };
///
/// Vide est le bon état par défaut : sur un projet neuf il n'y a rien à
/// assumer, et le premier défaut doit se corriger, pas s'inscrire.
// ⚠️ N'ANCRE JAMAIS UNE ÉDITION SUR LA LIGNE DE DÉCLARATION ELLE-MÊME. Le
// dartdoc ci-dessus en porte un exemplaire mot pour mot, plus HAUT dans le
// fichier : un `indexOf` ou un `sed` sur la déclaration matche donc le
// COMMENTAIRE d'abord, et réécrit la doc au lieu du code. Vécu sur un projet
// réel : deux fichiers détruits, deux reconstructions. Le SKILL prévenait pour
// COMPTER (`grep -v '///'`) — pas pour ÉDITER, et c'est le geste dangereux.
//
// ⚠️ ET LE POINT D'ANCRAGE CI-DESSOUS N'EST PAS UNIQUE POUR AUTANT. Il
// l'est à la LIVRAISON, et il
// cesse de l'être dès que quelqu'un le CITE — ce qui arrive au premier
// commentaire qui explique comment s'ancrer dessus. Vécu : un run a écrit sa
// propre note au-dessus, son script s'est ancré sur la PREMIÈRE occurrence, et
// quarante lignes de raisonnement ont disparu (les données, elles, étaient
// intactes). La phrase qui promettait l'unicité était vraie le jour où elle a
// été écrite, et fausse le jour où on s'en est servi.
//
// Ce qui reste unique, c'est le COUPLE : ce marqueur SUIVI de la déclaration.
// Ancre-toi donc sur la DERNIÈRE occurrence — `lastIndexOf`, `rindex`,
// `tac | grep -m1` — jamais sur la première, et compte-les avant d'écrire.
//
// ARGUS:DECLARATION — le point d'ancrage d'une édition PROGRAMMATIQUE.
const Set<String> argusKnownIssues =
    <String>{}; // TODO(argus): la dette assumée
