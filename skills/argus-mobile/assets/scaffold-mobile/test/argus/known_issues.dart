// ═══════════════════════════════════════════════════════════════════════════
// Argus Mobile — la dette que les gardes ont RÉVÉLÉE, et que tu n'as pas encore
// corrigée.
// ARGUS:OWNED — à toi : l'installeur ne l'écrase ni ne le compare, jamais.
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
// ⚠️ CE N'EST PAS UNE LISTE D'EXCEPTIONS, C'EST UN RELEVÉ ASSERTÉ PAR ÉGALITÉ.
// Une ligne inscrite ici affirme que le défaut EST ENCORE LÀ. Le jour où tu le
// corriges, le test rougit et te demande de retirer la ligne. C'est ce qui
// empêche la liste de survivre à ce qu'elle décrit : sans ça, elle deviendrait
// une permission permanente et le garde cesserait de garder sans le dire.
//
// La clé exacte à inscrire est donnée par le message d'échec, prête à coller.
// Ne la réécris pas de mémoire : elle porte l'écran, le gabarit et l'échelle de
// texte, et une clé approximative ne correspond à rien — ce qui laisse le test
// rouge en donnant l'impression que la ligne a été prise en compte.
// ═══════════════════════════════════════════════════════════════════════════

/// TODO(argus): la dette que tu assumes, une ligne par défaut, telle que le
/// message d'échec te la donne.
///
///     const Set<String> argusKnownIssues = <String>{
///       'home · cibles tactiles ≥ 48 dp (Android)',
///       'panier · compact 360×640 · texte ×2.0 · aucun texte tronqué',
///     };
///
/// Vide est le bon état par défaut : sur un projet neuf il n'y a rien à
/// assumer, et le premier défaut doit se corriger, pas s'inscrire.
const Set<String> argusKnownIssues = <String>{};
