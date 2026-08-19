// ═══════════════════════════════════════════════════════════════════════════
// Argus Mobile — étage 1 : les gardes qui tournent SANS device.
//
// C'EST LE FICHIER À ÉDITER pour brancher les gardes `flutter test` sur ton app.
// Les deux suites qui l'utilisent (a11y_test.dart, layout_test.dart, dans ce
// même dossier) n'ont rien à modifier.
//
// Pourquoi cet étage existe alors qu'Argus pilote déjà Maestro : deux mesures
// lui sont structurellement inaccessibles.
//   - La TAILLE DES CIBLES TACTILES : les sélecteurs `width`/`height` de Maestro
//     sont des égalités en pixels, avec une tolérance. « ≥ 48 dp » ne s'écrit pas.
//   - Le LAYOUT À GRANDE POLICE : changer la taille de texte système demande un
//     réglage device, alors qu'ici c'est un paramètre.
// Et ces tests-là tournent en secondes, sans émulateur, donc à chaque PR.
//
// Aucune dépendance ajoutée : `flutter_test` est déjà dev_dep de tout projet
// Flutter.
// ═══════════════════════════════════════════════════════════════════════════

import 'dart:io';

import 'package:flutter/material.dart';
// `RenderParagraph` n'est pas ré-exporté par widgets.dart : sans cet import, la
// mesure de troncature ne compile pas.
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Un écran à éprouver, tel qu'il se construit hors de l'application.
class ArgusScreen {
  const ArgusScreen({
    required this.id,
    required this.build,
    this.priority = 'p0',
  });

  /// Doit correspondre à `screens[].id` de argus.mobile.yaml, pour que les deux
  /// étages parlent des mêmes écrans dans le rapport.
  final String id;

  /// Le widget sous test. Fournis-le SANS Scaffold ni MaterialApp : le harnais
  /// pose lui-même la surface, la police et les marges système.
  final Widget Function() build;

  final String priority;
}

// ───────────────────────────────────────────────────────────────────────────
// 1. À REMPLIR
// ───────────────────────────────────────────────────────────────────────────

/// TODO(argus): déclare les écrans à éprouver.
///
/// Un écran qui a besoin d'un BlocProvider, d'un repository ou d'un Provider se
/// construit ici avec ses doubles de test — le harnais ne devine pas tes
/// dépendances.
///
///     final List<ArgusScreen> argusScreens = <ArgusScreen>[
///       ArgusScreen(
///         id: 'home',
///         build: () => BlocProvider<HomeBloc>(
///           create: (_) => HomeBloc(repository: FakeHomeRepository()),
///           child: const HomeScreen(),
///         ),
///       ),
///     ];
///
/// Tant que cette liste est vide, les deux suites se marquent SKIPPÉES avec la
/// raison. Elles ne passent pas au vert : un garde qui ne garde rien est pire
/// qu'un garde absent, parce qu'il rassure.
final List<ArgusScreen> argusScreens = <ArgusScreen>[];

/// TODO(argus): les polices du projet, recopiées de la section `fonts:` du
/// `pubspec.yaml` — une entrée par FAMILLE, avec ses fichiers.
///
/// ⚠️ SANS ELLES, AUCUNE MESURE DE DISPOSITION N'A DE VALEUR. La police par
/// défaut de `flutter_test` rend chaque glyphe dans un carré d'un cadratin : un
/// texte y est jusqu'à deux fois plus large qu'en Inter ou en Roboto, il replie
/// sur deux lignes, et le test déclare intenable une rangée qui tient très bien.
///
/// ⚠️ UNE FAMILLE PAR ENTRÉE. Une app sérieuse en a plusieurs — affichage,
/// texte courant, chiffres — et les enregistrer toutes sous un seul nom fausse
/// la mesure sans rien signaler : le texte serait rendu dans la mauvaise fonte,
/// à la mauvaise largeur, et le verdict porterait sur un écran qui n'existe pas.
///
/// ⚠️ Avec `google_fonts`, la famille n'est PAS le nom nu : c'est
/// `Famille_variante` (`Cinzel_700`, `CormorantGaramond_italic`). Un nom qui ne
/// correspond à rien retombe EN SILENCE sur la police de test — exactement le
/// défaut qu'on croyait écarter.
///
///     const Map<String, List<String>> argusFonts = <String, List<String>>{
///       'FamilleTexte': <String>['assets/fonts/texte/Texte-Variable.ttf'],
///       'FamilleChiffres': <String>['assets/fonts/chiffres/Chiffres-Variable.ttf'],
///     };
const Map<String, List<String>> argusFonts = <String, List<String>>{};

/// TODO(argus): la famille appliquée par défaut au thème de test — celle que
/// `ThemeData.fontFamily` porte dans l'app. DOIT être une clé de [argusFonts] :
/// un nom qui n'y figure pas retombe en silence sur la police de test.
const String argusFontFamily = '';

/// TODO(argus): si ton app formate des dates ou des nombres localisés
/// (`DateFormat(…, 'fr_FR')`, pluriels `intl`), ajoute ici les delegates —
/// `flutter_localizations` doit alors être une dépendance du projet.
///
/// Un MaterialApp de test nu n'en a aucun : tout formatage localisé y lève
/// (`Locale data has not been initialized`) alors que l'app vraie ne voit rien,
/// puisqu'elle les porte. L'alternative sans dépendance est d'appeler
/// `initializeDateFormatting('fr_FR')` dans un `setUpAll`.
const List<LocalizationsDelegate<Object>> argusLocalizationsDelegates =
    <LocalizationsDelegate<Object>>[];

/// Locale imposée à la surface de test.
const Locale argusLocale = Locale('fr', 'FR');

/// TODO(argus): le thème RÉEL de l'application.
///
/// ⚠️ SANS LUI, LE CONTRASTE NE PEUT PAS ÊTRE MESURÉ. Les widgets seraient
/// montés sur le thème Material par défaut, dont le fond est BLANC : sur une
/// app sombre, chaque texte clair y ressort autour de 1:1 et le garde rapporte
/// une dizaine de défauts qui n'existent pas. Mesurer un contraste sur le
/// mauvais fond est pire que ne pas le mesurer — ça remplit un rapport de bruit
/// et on cesse de le lire.
///
/// Tant qu'il vaut `null`, le garde de contraste se marque SKIPPÉ avec sa
/// raison ; les cibles tactiles et la disposition, elles, ne dépendent pas du
/// thème et continuent de mesurer.
///
///     ThemeData? argusTheme() => MonTheme.sombre();
///
/// ⚠️ Si ton app propose les DEUX thèmes, duplique le garde de contraste :
/// une couleur née sur les fonds sombres passe en sombre et échoue en clair,
/// et l'inverse est tout aussi vrai.
ThemeData? argusTheme() => null;

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

// ───────────────────────────────────────────────────────────────────────────
// 3. Mécanique
// ───────────────────────────────────────────────────────────────────────────

/// Charge chaque famille déclarée dans [argusFonts] sous SON nom.
///
/// ⚠️ Un fichier déclaré mais absent fait ÉCHOUER le chargement, il n'est pas
/// sauté : une police qui manque en silence, c'est la police de test qui prend
/// sa place, et toutes les mesures qui suivent portent alors sur un rendu qui
/// n'existe nulle part. Mieux vaut un test rouge qu'un chiffre faux.
///
/// Rend le nombre de fichiers chargés.
Future<int> loadArgusFonts() async {
  int loaded = 0;
  for (final MapEntry<String, List<String>> family in argusFonts.entries) {
    final FontLoader loader = FontLoader(family.key);
    for (final String assetPath in family.value) {
      final File file = File(assetPath);
      if (!file.existsSync()) {
        throw StateError(
          "Police déclarée mais introuvable : '$assetPath' (famille "
          "'${family.key}'). Corrige argusFonts dans test/argus/harness.dart. "
          'Sans ce fichier, flutter_test rendrait le texte dans sa police par '
          "défaut — un carré d'un cadratin par glyphe — et toute mesure de "
          'disposition porterait sur un écran qui n\'existe pas.',
        );
      }
      loader.addFont(
        Future<ByteData>.value(ByteData.sublistView(file.readAsBytesSync())),
      );
      loaded += 1;
    }
    await loader.load();
  }
  return loaded;
}

/// Raison de sauter les gardes, ou `null` s'ils sont exploitables.
///
/// Rendre une RAISON plutôt qu'un booléen : « skippé » sans explication se
/// transforme en « ça a toujours été comme ça » au bout de deux semaines.
String? argusSkipReason() {
  if (argusScreens.isEmpty) {
    return 'aucun écran déclaré — remplis argusScreens dans test/argus/harness.dart';
  }
  if (argusFonts.isEmpty) {
    return 'argusFonts est vide : sans les vraies polices, la mesure de disposition '
        'ne vaut rien (la police de flutter_test rend chaque glyphe dans un carré '
        "d'un cadratin). Recopie la section fonts: du pubspec dans "
        'test/argus/harness.dart.';
  }
  if (argusFontFamily.isEmpty) {
    return 'argusFontFamily est vide : indique la famille par défaut du thème.';
  }
  if (!argusFonts.containsKey(argusFontFamily)) {
    // Le piège exact qu'on veut écarter : un nom qui ne correspond à rien
    // retombe EN SILENCE sur la police de test.
    return "argusFontFamily vaut '$argusFontFamily', qui n'est pas une clé de "
        'argusFonts (${argusFonts.keys.join(', ')}). Un nom qui ne correspond à '
        'aucune famille chargée retombe en silence sur la police de test.';
  }
  return null;
}

/// Monte [child] sur une surface de mesure honnête : vraie taille, vraies
/// marges système, vraie police, échelle de texte imposée.
Future<void> pumpArgus(
  WidgetTester tester,
  Widget child, {
  required ArgusViewport viewport,
  double textScale = 1.0,
}) async {
  tester.view.devicePixelRatio = viewport.devicePixelRatio;
  tester.view.physicalSize = viewport.physicalSize;
  // `SafeArea` lit `padding`, un padding bas posé à la main lit `viewPadding` :
  // renseigner un seul des deux laisse la moitié du décor hors de la mesure.
  tester.view.padding = viewport.padding;
  tester.view.viewPadding = viewport.padding;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      locale: argusLocale,
      localizationsDelegates: argusLocalizationsDelegates.isEmpty
          ? null
          : argusLocalizationsDelegates,
      theme:
          argusTheme() ??
          ThemeData(fontFamily: argusFontFamily.isEmpty ? null : argusFontFamily),
      debugShowCheckedModeBanner: false,
      home: Builder(
        builder: (BuildContext context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// `true` quand les gardes ne sont pas exploitables.
///
/// `testWidgets` n'accepte qu'un booléen en `skip` — contrairement à `test` du
/// paquet `test`, qui prend une chaîne. La raison passe donc par [argusName],
/// sans quoi un test sauté n'expliquerait rien à celui qui lit le rapport.
bool get argusShouldSkip => argusSkipReason() != null;

/// Nom de test portant, le cas échéant, la raison du saut.
String argusName(String name) {
  final String? reason = argusSkipReason();
  return reason == null ? name : '$name  [SKIP — $reason]';
}

/// Textes tronqués à l'écran courant, avec leur contenu.
///
/// ⚠️ C'est LA mesure qui compte quand les textes portent `maxLines` + ellipsis :
/// dans ce cas rien ne « déborde » jamais, `tester.takeException()` reste vide,
/// et un test qui guette une exception passe sur n'importe quelle largeur, même
/// absurde. Ce qui casse, c'est la troncature — et c'est `didExceedMaxLines`
/// qui la voit, pas le mécanisme d'erreur.
List<String> argusTruncatedTexts(WidgetTester tester) {
  return tester
      .renderObjectList<RenderParagraph>(find.byType(RichText))
      .where((RenderParagraph paragraph) => paragraph.didExceedMaxLines)
      .map((RenderParagraph paragraph) => paragraph.text.toPlainText())
      .toList();
}
