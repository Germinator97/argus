// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
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
///
/// ⚠️ **CETTE CLASSE ET `screens[]` DE `argus.mobile.yaml` PARTAGENT LEUR
/// VOCABULAIRE SANS PARTAGER LEURS CHAMPS.** `id`, `anchor`, `commands`,
/// `displays` et `priority` existent des deux côtés et doivent coïncider —
/// c'est voulu, et chaque champ le dit. Mais `start:`, `visual:` et
/// `visualCropOn:` n'existent QUE dans le YAML : ils décrivent ce que fait
/// l'étage 2 sur un device, dont cette classe ne sait rien.
///
/// Un run les a écrits ici en toute logique, puisqu'il venait de les remplir
/// dans le YAML : **26 erreurs `undefined_named_parameter` d'un coup**. Le
/// compilateur l'a dit tout de suite — c'est le seul cas de cette famille où
/// rien ne se perd en silence —, mais le temps était passé.
///
/// Le seul champ de cette classe qui parle du device est [cropRoot], et il ne
/// remplace pas `visualCropOn` : il DÉCLARE que cette racine en sert, pour que
/// l'étage 1 puisse mesurer sa position.
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
    this.setUp,
    this.cropRoot = false,
  });

  /// Ce qu'il faut FAIRE avant de monter cet écran — enregistrer un double,
  /// poser un état. Appelé **une fois par montage**, avant `build()`.
  ///
  /// ⚠️ IL N'Y AVAIT AUCUN ENDROIT POUR ÇA (point 240), et le manque ne se voit
  /// qu'avec un conteneur d'injection : un écran qui résout ses dépendances
  /// lui-même (`get_it`, un service locator) ignore tout provider posé
  /// au-dessus de lui. Le seul point d'accroche restant était le corps de
  /// `build()` — appelé N fois, donc il fallait inventer une fonction
  /// idempotente, ce qu'un projet réel a dû faire.
  ///
  /// ```dart
  /// ArgusScreen(
  ///   id: 'reglages',
  ///   setUp: () => sl.registerSingleton<VersionCubit>(FakeVersionCubit()),
  ///   build: () => const SettingsPage(),
  /// )
  /// ```
  ///
  /// Le harnais ne défait rien après coup : c'est à toi de rendre
  /// l'enregistrement idempotent (`if (sl.isRegistered<T>()) return;`) si le
  /// même double sert plusieurs écrans.
  /// ⚠️ **CE RAPPEL EST SYNCHRONE, ET LES CONTENEURS D'INJECTION NE LE SONT PAS.**
  /// `GetIt.reset()` et `unregister()` rendent des `Future` : on ne peut donc PAS
  /// défaire puis refaire un enregistrement d'un écran à l'autre depuis ici. Un
  /// run l'a découvert en essayant, et le montage qui marche vaut trois lignes :
  /// enregistrer **une seule fois**, en `setUpAll`, des fabriques qui lisent une
  /// variable de module, puis faire varier cette variable dans `setUp` :
  ///
  /// ```dart
  /// late VersionCubit courant;                       // la variable de module
  /// setUpAll(() => sl.registerFactory<VersionCubit>(() => courant));
  /// // puis, par écran :
  /// setUp: () => courant = FakeVersionCubit(),       // synchrone, donc légal
  /// ```
  ///
  /// Les doubles eux-mêmes vivent dans `test/argus/argus_fakes.dart` — c'est ici
  /// qu'on en a besoin, et non au moment où l'on instrumente.
  /// Cette racine sert-elle de `visualCropOn` au recadrage des captures ?
  ///
  /// ⚠️ LA RÈGLE ÉTAIT ÉCRITE, RIEN NE LA VÉRIFIAIT. « Pose la racine DANS le
  /// `SafeArea` quand elle sert de `visualCropOn` » figure dans la méthodologie,
  /// avec son coût chiffré (216 px, soit l'horloge système dans la référence).
  /// Un run l'a lue, a cru l'appliquer — sa page A un `SafeArea` — et avait posé
  /// le `Semantics` racine AUTOUR du `Scaffold` entier, donc au-dessus. Il l'a
  /// rattrapé en le raisonnant après coup, par aucun garde.
  ///
  /// Le poser à `true` fait mesurer la racine : elle ne doit pas commencer plus
  /// haut que l'inset système, sans quoi le cadrage embarque la barre d'état et
  /// la référence devient non déterministe — elle changera à chaque minute qui
  /// passe.
  ///
  /// ⚠️ Il ne se DEVINE pas : `--check-anchors` vérifie que l'écran désigné par
  /// `visualCropOn` dans `argus.mobile.yaml` le déclare bien ici. Sans ce
  /// croisement, oublier le drapeau retirerait le garde en silence — un
  /// paramètre optionnel non passé est légal.
  final bool cropRoot;

  final void Function()? setUp;

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
  /// ⚠️ NE DEVINE PAS LE PLI — déclare tout en [commands] / [displays], lance
  /// `make argus-anchors`, et déplace ce que le message prescrit. Le harnais
  /// tranche dans les DEUX sens : il dit « ELLE EXISTE, mais plus bas » pour ce
  /// qui doit descendre, et « déclarée ici, mais construite dès le petit
  /// gabarit » pour ce qui doit remonter. Un run réel a vu neuf déclarations
  /// corrigées d'un coup, là où son intuition en avait mal placé neuf.
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
