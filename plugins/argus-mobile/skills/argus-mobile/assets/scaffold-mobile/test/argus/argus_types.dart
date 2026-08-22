// ═══════════════════════════════════════════════════════════════════════════
// Argus Mobile — les TYPES de l'étage 1. Rien à éditer ici.
//
// Ce fichier appartient au plugin : `install-mobile.sh --update` le remplace.
//
// Trois fichiers, dans cet ordre strict et pour une raison précise :
//   argus_types.dart    les types           ← ce fichier, ne dépend de rien
//   harness.dart        TES données         ← à toi, importe les types
//   argus_harness.dart  la mécanique        ← au plugin, importe les deux
//
// L'ordre n'est pas cosmétique. Tant que types et données vivaient ensemble, le
// fichier entier était marqué à toi — donc jamais mis à jour —, et la moindre
// évolution d'`ArgusScreen` cassait la compilation des suites que `--update`
// livrait. Et les réunir en deux fichiers qui s'importent l'un l'autre ne marche
// pas : Dart résout mal ce cycle, l'analyseur déclare chaque nom du cadre
// « défini dans les deux bibliothèques », et plus rien ne compile. Mesuré.
// ═══════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Un écran à éprouver, tel qu'il se construit hors de l'application.
class ArgusScreen {
  const ArgusScreen({
    required this.id,
    required this.build,
    this.anchor,
    this.commands = const <String>[],
    this.commandsAfterScroll = const <String>[],
    this.displays = const <String>[],
    this.displaysAfterScroll = const <String>[],
    this.priority = 'p0',
  });

  /// Doit correspondre à `screens[].id` de argus.mobile.yaml, pour que les deux
  /// étages parlent des mêmes écrans dans le rapport.
  final String id;

  /// L'ancre sémantique de la racine — la même valeur que `screens[].anchor`
  /// de argus.mobile.yaml, celle que les flows Maestro ciblent.
  ///
  /// La renseigner branche `anchors_test.dart`, qui PROUVE que l'identifiant
  /// arrive réellement dans l'arbre sémantique. Sans lui, l'instrumentation
  /// n'est vérifiée qu'à l'étage 2, sur device, où son absence se manifeste par
  /// un flow entier qui échoue sans dire pourquoi.
  ///
  /// ⚠️ Il est LÉGITIME de le laisser nul. Une coquille d'application — barre du
  /// haut, onglets, conteneur de navigation — n'est pas un écran, n'a pas
  /// d'entrée dans `screens[]`, et se monte quand même très utilement : sur un
  /// projet réel, c'est elle qui a trouvé le seul débordement présent à taille
  /// de texte NOMINALE. Un écran sans ancre est exclu d'`anchors_test.dart`
  /// (il n'a rien à y prouver) et mesuré par tous les autres gardes.
  final String? anchor;

  /// Les ancres de COMMANDE que cet écran doit exposer — boutons, champs,
  /// lignes de liste — c'est-à-dire tout ce que les flows Maestro ciblent qui
  /// n'est pas la racine.
  ///
  /// ⚠️ C'est l'angle mort qui a coûté le plus cher. `anchor` étant singulier,
  /// seules les racines étaient prouvées : sur un projet réel, 55 ancres de
  /// commande n'avaient aucun endroit où être déclarées, donc aucune n'était
  /// vérifiée — et c'est là qu'un défaut s'était logé, garde au vert.
  ///
  /// Une même ancre peut apparaître PLUSIEURS fois (lignes d'une liste
  /// dynamique, commande présente dans deux états) : c'est prévu et ce n'est
  /// pas un défaut.
  final List<String> commands;

  /// Les ancres que cet écran n'expose qu'APRÈS un défilement — le bas d'une
  /// liste paresseuse, qui n'est pas construit au gabarit de référence.
  ///
  /// ⚠️ C'est le TROISIÈME ÉTAT, et son absence coûtait cher. Une telle ancre
  /// n'avait que deux issues : rester dans [commands], où elle rend la suite
  /// rouge en permanence, ou en sortir — et alors plus rien ne la vérifie,
  /// jamais, alors que c'est bien une ancre que des flows ciblent. Le harnais
  /// savait déjà DIRE qu'une commande n'était qu'invisible ici (il remonte
  /// l'écran au grand gabarit pour trancher) ; il n'avait aucun endroit où
  /// l'écrire.
  ///
  /// Elle est éprouvée sur le PLUS GRAND gabarit de [argusViewports], où la
  /// liste construit ce qu'elle affiche.
  ///
  /// ⚠️ Et la déclaration ne survit pas à ce qu'elle décrit : une ancre inscrite
  /// ici qui devient visible au gabarit de référence fait ÉCHOUER le test, avec
  /// la consigne de la remonter dans [commands]. Sans cette moitié-là, la liste
  /// deviendrait une permission permanente — la forme la plus courante de dette
  /// qui s'installe.
  final List<String> commandsAfterScroll;

  /// Les ancres d'AFFICHAGE — un compteur, une valeur, un état — que des flows
  /// lisent sans jamais les toucher.
  ///
  /// ⚠️ Elles n'avaient de case NULLE PART, et les deux issues étaient mauvaises.
  /// Déclarée en [commands], une telle ancre échoue sur « nœud INERTE » — un
  /// message qui décrit un défaut alors qu'ici l'inertie **est le comportement
  /// voulu**. Retirée, plus rien ne prouve qu'elle existe, alors qu'un flow la
  /// cible : le jour où elle disparaît, c'est l'étage 2 qui le découvre, sur
  /// device, en accusant l'instrumentation.
  ///
  /// Ce qui est prouvé ici est donc la PRÉSENCE, jamais l'activité.
  ///
  /// ⚠️ Et l'autre moitié : une ancre déclarée ici qui se révèle **interactive**
  /// fait échouer le test, avec la consigne de la remonter dans [commands].
  /// Sans quoi cette liste deviendrait l'endroit où l'on range ce qui rougit.
  final List<String> displays;

  /// Les affichages que cet écran n'expose qu'APRÈS un défilement.
  ///
  /// ⚠️ Le pendant exact de [commandsAfterScroll], et il a manqué une passe
  /// entière. Un affichage sous le pli avait les deux mêmes mauvaises issues
  /// qu'une commande sous le pli — rouge en permanence, ou plus vérifié du
  /// tout —, et le troisième état n'avait été ouvert que d'un côté. Un projet
  /// réel a donc laissé une ancre posée dans le code, déclarée nulle part.
  ///
  /// Mêmes deux moitiés que [commandsAfterScroll] : prouvé présent au plus grand
  /// gabarit, et **absent** au gabarit de référence — sinon la déclaration est
  /// périmée et le test le dit.
  final List<String> displaysAfterScroll;

  /// Le widget sous test. Fournis-le SANS Scaffold ni MaterialApp : le harnais
  /// pose lui-même la surface, la police et les marges système.
  final Widget Function() build;

  final String priority;
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Gabarits de mesure
// ───────────────────────────────────────────────────────────────────────────

/// Un gabarit d'écran, marges système comprises.
class ArgusViewport {
  const ArgusViewport({
    required this.name,
    required this.physicalSize,
    required this.devicePixelRatio,
    required this.padding,
  });

  final String name;

  /// Taille PHYSIQUE, en pixels. `tester.view.physicalSize` donne l'écran
  /// entier ; l'app n'en a jamais autant, d'où [padding].
  final Size physicalSize;

  final double devicePixelRatio;

  /// ⚠️ Barre d'état + barre de gestes valent ~48 dp sur un téléphone courant —
  /// souvent l'ordre de grandeur du débordement qu'on cherche. Les ignorer fait
  /// mesurer un écran qui n'existe pas.
  final FakeViewPadding padding;
}

/// Trois gabarits : un petit d'entrée de gamme, un grand récent, une tablette.
/// La densité et la hauteur utile comptent plus que le modèle.
const List<ArgusViewport> argusViewports = <ArgusViewport>[
  ArgusViewport(
    name: 'compact 360×640',
    physicalSize: Size(720, 1280),
    devicePixelRatio: 2,
    padding: FakeViewPadding(top: 48, bottom: 48),
  ),
  ArgusViewport(
    name: 'courant 412×915',
    physicalSize: Size(1080, 2400),
    devicePixelRatio: 2.625,
    padding: FakeViewPadding(top: 63, bottom: 63),
  ),
  ArgusViewport(
    name: 'tablette 800×1280',
    physicalSize: Size(1600, 2560),
    devicePixelRatio: 2,
    padding: FakeViewPadding(top: 48, bottom: 0),
  ),
];

/// ⚠️ PIÈGE VÉRIFIÉ DANS LA SOURCE DE `MinimumTapTargetGuideline` : la guideline
/// IGNORE tout nœud qui touche le bord de la vue, ou le bord d'un conteneur
/// défilant (`_isAtBoundary`), pour ne pas accuser un élément partiellement
/// sorti de l'écran. Conséquence pratique : une cible tactile collée au bord
/// n'est PAS mesurée, et le garde passe au vert sans l'avoir regardée.
///
/// Ça s'est produit ici même : une cible de 24 dp posée au coin supérieur gauche
/// n'a rien déclenché, et il a fallu lire la source pour comprendre que c'était
/// la SONDE qui était fautive, pas le garde. Si tu doutes qu'un élément soit
/// couvert, écarte-le des bords et regarde si le verdict change.
///
/// La comparaison, elle, se fait bien en dp : la guideline divise les bornes de
/// peinture par `devicePixelRatio` avant de comparer à 48 (ou 44 sur iOS).

/// Échelles de texte éprouvées. 1.3 est un cran de réglage système courant, pas
/// un cas limite ; 2.0 est le maximum qu'un utilisateur malvoyant applique
/// réellement.
const List<double> argusTextScales = <double>[1.0, 1.3, 2.0];
