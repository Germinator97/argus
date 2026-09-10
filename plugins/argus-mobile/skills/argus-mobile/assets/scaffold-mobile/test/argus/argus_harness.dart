// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
// ═══════════════════════════════════════════════════════════════════════════
// Argus Mobile — la MÉCANIQUE de l'étage 1. Rien à éditer ici.
//
// Ce fichier appartient au plugin : `install-mobile.sh --update` le remplace.
// Ce que TU renseignes vit dans `harness.dart` ; les types, dans
// `argus_types.dart`. C'est le seul fichier que les suites importent : il
// ré-exporte les deux autres.
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

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
// `RenderParagraph` n'est pas ré-exporté par widgets.dart : sans cet import, la
// mesure de troncature ne compile pas.
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'argus_types.dart';
import 'harness.dart';
import 'known_issues.dart';

export 'argus_types.dart';
export 'harness.dart';
export 'known_issues.dart';

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

/// Les familles de polices que l'APPLICATION enregistre, lues dans le manifeste
/// que `flutter test` produit **lui-même** avant d'exécuter la suite.
///
/// C'est une source EXTÉRIEURE au harnais — dérivée des `pubspec.yaml` par
/// l'outil, pas de ce qu'on lui a déclaré. Sans elle, le contrôle de résolution
/// comparerait deux valeurs venues du même endroit et ne garderait rien.
///
/// Rend une liste vide si le manifeste n'existe pas : c'est « je n'ai pas pu
/// mesurer », que l'appelant doit distinguer de « rien n'est enregistré ».
List<String> argusBundledFontFamilies() {
  final File manifest = File('build/unit_test_assets/FontManifest.json');
  if (!manifest.existsSync()) {
    return const <String>[];
  }
  try {
    final dynamic brut = jsonDecode(manifest.readAsStringSync());
    if (brut is! List<dynamic>) {
      return const <String>[];
    }
    return <String>[
      for (final dynamic e in brut)
        if (e is Map<String, dynamic> && e['family'] is String)
          e['family'] as String,
    ];
  } on FormatException {
    return const <String>[];
  }
}

/// Les familles que le THÈME RÉEL de l'application demande.
///
/// Vide quand le projet n'a pas renseigné [argusTheme] : il n'y a alors rien à
/// confronter, et le harnais monte un thème qu'il fabrique lui-même — comparer
/// ce thème-là au manifeste serait circulaire.
///
/// 📌 `TextStyle(fontFamily: 'X', package: 'Y')` compose `packages/Y/X` dès le
/// constructeur : cette fonction voit donc le nom TEL QUE Flutter le résoudra,
/// ce qui est exactement ce qu'il faut comparer.
Set<String> argusThemeFontFamilies() {
  final ThemeData? theme = argusTheme();
  if (theme == null) {
    return const <String>{};
  }
  final TextTheme t = theme.textTheme;
  return <String>{
    for (final TextStyle? s in <TextStyle?>[
      t.displayLarge,
      t.displayMedium,
      t.headlineLarge,
      t.headlineMedium,
      t.titleLarge,
      t.titleMedium,
      t.bodyLarge,
      t.bodyMedium,
      t.bodySmall,
      t.labelLarge,
      t.labelMedium,
    ])
      if (s?.fontFamily != null) s!.fontFamily!,
  };
}

/// Le défaut de RÉSOLUTION de police, ou `null` s'il n'y en a pas.
///
/// 🔴 CE QUE CE CONTRÔLE EXISTE POUR VOIR. Le harnais charge les `.ttf` par
/// CHEMIN, ce qui garantit qu'ils existent en test — mais l'application, elle,
/// résout une famille par son NOM. Les deux mondes ne se rencontrent nulle
/// part, et l'écart apparaît dès que la police vient d'une DÉPENDANCE : le
/// manifeste enregistre alors `packages/<paquet>/<famille>` pendant que le code
/// demande le nom NU. Flutter ne trouve pas, retombe sur la police système, et
/// ne dit rien — ni exception, ni log.
///
/// Mesuré sur un projet réel : un relevé de 45 troncatures décrivait le rendu
/// VOULU, pas celui de l'appareil. La suite était verte.
///
/// ⚠️ Ne rend un défaut que sur le cas SANS AMBIGUÏTÉ : une famille que le
/// thème demande et que le manifeste n'enregistre sous AUCUNE forme. Le nom
/// composé avec `package:` arrive ici déjà préfixé, donc il correspond — pas de
/// faux positif sur un projet sain qui fait les choses correctement.
String? argusFontResolutionIssue() => argusFontMismatch(
  demandeesParLeTheme: argusThemeFontFamilies(),
  chargeesParLeHarnais: argusFonts.keys.toSet(),
  enregistreesAuBundle: argusBundledFontFamilies(),
);

/// La décision, PURE : trois ensembles entrent, un défaut ou `null` sort.
///
/// Extraite pour être exerçable sans projet, sans device et sans manifeste sur
/// le disque — un garde qui l'APPELLE lit ce qu'elle rend, là où un garde qui
/// lirait la source ne verrait pas une valeur neutralisée.
///
/// 🔴 POURQUOI TROIS TERMES ET NON DEUX (437). La première version comparait le
/// thème au bundle, et elle était juste — mais aveugle au cas rencontré : un
/// projet dont l'app résout PARFAITEMENT sa police, et dont le harnais la charge
/// sous un AUTRE nom. Le thème demande alors une famille que `argusFonts` n'a
/// pas chargée, le montage retombe sur la police de `flutter_test` — deux fois
/// plus large — et TOUTE mesure de disposition devient fausse pendant que ce
/// contrôle reste vert. Mesuré sur un projet réel, seule cette clé changeant :
/// **297 verts / 186 rouges** sous le nom nu contre **356 / 127** sous le nom
/// résolu, soit **59 gardes** qui décrivaient un rendu inexistant.
///
/// ⚠️ Le garde voisin ne le voit pas non plus : il vérifie que
/// [argusFontFamily] est une clé de [argusFonts], donc la cohérence INTERNE du
/// harnais. Ici les deux étaient cohérents entre eux, et faux tous les deux.
///
/// L'ordre des deux verdicts est un ordre de DIAGNOSTIC : une famille absente
/// du bundle est un défaut de l'APPLICATION — l'appareil ne rend pas cette
/// police —, tandis qu'une famille non chargée est un défaut du HARNAIS : l'app
/// va bien, ce sont les mesures qui mentent. Le second se contrôle même sans
/// manifeste, d'où sa place après la sortie « pas pu mesurer ».
String? argusFontMismatch({
  required Set<String> demandeesParLeTheme,
  required Set<String> chargeesParLeHarnais,
  required List<String> enregistreesAuBundle,
}) {
  if (demandeesParLeTheme.isEmpty) {
    return null; // rien à confronter — l'appelant le dit, il ne le tait pas
  }

  // 1. Le bundle : ce que l'APPLICATION enregistre. Sauté si le manifeste
  //    manque — « pas pu mesurer » n'est pas « conforme ».
  if (enregistreesAuBundle.isNotEmpty) {
    final List<String> introuvables =
        demandeesParLeTheme
            .where((String f) => !enregistreesAuBundle.contains(f))
            .toList()
          ..sort();
    if (introuvables.isNotEmpty) {
      final String proches = enregistreesAuBundle
          .where(
            (String b) => introuvables.any((String f) => b.endsWith('/$f')),
          )
          .join(', ');
      return "Le thème de l'app demande ${introuvables.join(', ')}, "
          "que le bundle n'enregistre pas sous ce nom. Familles enregistrées : "
          '${enregistreesAuBundle.join(', ')}.'
          '${proches.isEmpty ? '' : "\n⚠️ « $proches » ne diffère que par le "
                    "préfixe de paquet : la police vient d'une DÉPENDANCE, et il "
                    "faut alors la demander avec son paquet — "
                    "`TextStyle(fontFamily: '<famille>', package: '<paquet>')` — "
                    "ou la déclarer dans le pubspec de l'app. Sans ça Flutter "
                    'retombe EN SILENCE sur la police système.'}'
          "\n📌 Tant que ce n'est pas réglé, toute mesure de disposition de cette "
          "suite décrit un rendu que l'appareil ne produit pas.";
    }
  }

  // 2. Le HARNAIS : ce que la suite charge réellement. Ne dépend d'aucun
  //    manifeste, donc se contrôle toujours.
  final List<String> nonChargees =
      demandeesParLeTheme
          .where((String f) => !chargeesParLeHarnais.contains(f))
          .toList()
        ..sort();
  if (nonChargees.isNotEmpty) {
    return "Le thème de l'app demande ${nonChargees.join(', ')}, "
        "qu'argusFonts ne charge PAS. Familles chargées : "
        '${chargeesParLeHarnais.isEmpty ? '(aucune)' : chargeesParLeHarnais.join(', ')}.'
        "\n⚠️ L'application, elle, va peut-être très bien : c'est la SUITE qui "
        'mesure faux. Une famille que le thème demande sans qu\'elle soit '
        'chargée retombe sur la police de `flutter_test` — un carré d\'un '
        'cadratin par glyphe, environ deux fois plus large.'
        '\n📌 Déclare dans argusFonts la famille TELLE QUE LE THÈME LA DEMANDE, '
        'préfixe de paquet compris, et fais-en argusFontFamily.';
  }

  return null;
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
        'test/argus/harness.dart.\n'
        "⚠️ Si ton pubspec n'en a AUCUNE, ce n'est PAS que le projet n'a pas "
        "de police : elle vient alors d'une DÉPENDANCE. Cherche `fonts:` dans "
        'le pubspec des paquets dont tu dépends, et donne ici le chemin '
        'relatif de leurs .ttf — sinon cette dimension entière se saute, et '
        'un « 371 skippés » se lit comme un projet sans police.';
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

/// Écrans où l'on a constaté une animation qui ne s'arrête jamais.
///
/// Un `Set` plutôt qu'un message par montage : chaque écran est monté trois
/// fois par gabarit et trois fois par échelle de texte, et neuf lignes
/// identiques noieraient le reste.
final Set<String> argusPerpetualAnimations = <String>{};

/// Combien de temps SIMULÉ on attend qu'un écran se pose avant de conclure
/// qu'il ne se posera pas.
///
/// ⚠️ Le défaut de `pumpAndSettle` est de DIX MINUTES simulées, soit six mille
/// itérations de 100 ms. Sur un écran qui porte une animation perpétuelle —
/// halo qui respire, indicateur, point pulsé, et tout écran soigné en a — il
/// les fait toutes avant de lever, et ce que l'on voit ressemble à un test lent,
/// pas à un montage qui n'aboutit pas.
const Duration argusSettleTimeout = Duration(seconds: 5);

/// Monte [child] sur une surface de mesure honnête : vraie taille, vraies
/// marges système, vraie police, échelle de texte imposée.
///
/// [debugLabel] sert uniquement aux messages — donne l'`id` de l'écran, sinon
/// un avertissement d'animation perpétuelle ne dira pas de qui il parle.
Future<void> pumpArgus(
  WidgetTester tester,
  Widget child, {
  required ArgusViewport viewport,
  double textScale = 1.0,
  String debugLabel = '',
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
      // ⚠️ `supportedLocales` EST REQUIS pour que `locale` s'applique. Sans
      // cette liste, `MaterialApp` retombe sur son défaut — `[Locale('en','US')]`
      // — et résout la locale effective en croisant les deux : une locale non
      // supportée est purement IGNORÉE. Le harnais déclarait donc `fr_FR` et
      // montait en anglais, sans que rien ne le dise. Tout ce qui vient de
      // Material (dates, boutons de dialogue, tooltips) était alors mesuré dans
      // la mauvaise langue, donc à la mauvaise largeur — ce qui fausse une
      // mesure de disposition sans jamais lever d'exception.
      supportedLocales: <Locale>[argusLocale],
      localizationsDelegates: argusLocalizationsDelegates.isEmpty
          ? null
          : argusLocalizationsDelegates,
      theme:
          argusTheme() ??
          ThemeData(
            fontFamily: argusFontFamily.isEmpty ? null : argusFontFamily,
          ),
      debugShowCheckedModeBanner: false,
      home: Builder(
        builder: (BuildContext context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          // `MaterialApp.home` ne fournit PAS de `Material` ancêtre — c'est le
          // `Scaffold` qui en pose un. Sans lui, tout écran contenant un
          // `InkWell`, un `ListTile` ou un champ Material lève « No Material
          // widget found » au montage, et l'échec qu'on lit ensuite est une
          // conséquence sans rapport (relevé : un débordement de 99805 px).
          // On pose donc le minimum manquant, en transparence : un écran qui
          // porte déjà son propre Scaffold reste rendu tel qu'il est écrit.
          child: Material(type: MaterialType.transparency, child: child),
        ),
      ),
    ),
  );

  // ⚠️ Un écran qui ne se pose JAMAIS n'est pas une erreur de l'écran, et
  // l'exclure du harnais serait le pire remède : ce sont souvent les plus
  // travaillés, donc ceux qui ont le plus à cacher. On lui laisse le temps de
  // finir son animation d'ENTRÉE — mesurer pendant qu'un écran entre rend des
  // rectangles exacts qui décrivent un état qui n'existera plus — puis on
  // avance d'une durée fixe et on mesure là.
  //
  // Deux avancées plutôt qu'une : la première laisse retomber ce qui était en
  // vol, la seconde donne un état comparable à lui-même.
  try {
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      argusSettleTimeout,
    );
  } on FlutterError {
    if (debugLabel.isNotEmpty && argusPerpetualAnimations.add(debugLabel)) {
      debugPrint(
        '⚠️  « $debugLabel » ne se stabilise pas en ${argusSettleTimeout.inSeconds} s : '
        'il porte une animation perpétuelle. La mesure est prise après une '
        "avance d'horloge fixe, ce qui reste valable — mais note que "
        '`waitForAnimationToEnd` expirera aussi sur cet écran à l\'étage 2 '
        '(mesuré : ~7,3 s, au-delà de son propre timeout de 5 s).',
      );
    }
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
  }
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

// ───────────────────────────────────────────────────────────────────────────
// 4. Lecture de l'arbre sémantique
// ───────────────────────────────────────────────────────────────────────────

/// Un nœud tel que la couche d'accessibilité l'expose — c'est-à-dire tel que
/// Maestro et TalkBack le verront.
class ArgusSemanticNode {
  const ArgusSemanticNode({
    required this.identifier,
    required this.label,
    required this.actions,
    required this.hasEnabledState,
  });

  final String identifier;
  final String label;

  /// Champ de bits des actions. Zéro = le nœud ne fait rien.
  final int actions;

  /// Le nœud déclare-t-il un état d'activation ? C'est ce qui distingue une
  /// commande DÉSACTIVÉE (légitime) d'une enveloppe inerte (le défaut).
  final bool hasEnabledState;

  /// `true` quand ce nœud est une commande, active ou non.
  ///
  /// Mesuré sur Flutter 3.32, trois cas qui ne se distinguent QUE par ces deux
  /// champs :
  ///
  /// | cas | `actions` | `hasEnabledState` |
  /// |---|---|---|
  /// | bouton actif | ≠ 0 | `true` |
  /// | bouton **désactivé** | 0 | **`true`** |
  /// | enveloppe inerte autour d'un bouton | 0 | **`false`** |
  ///
  /// Ne juger que sur `actions` ferait donc rougir tout écran monté avec un
  /// bouton grisé — un état parfaitement normal, et l'un des plus utiles à
  /// photographier.
  bool get isCommand => actions != 0 || hasEnabledState;
}

/// Tous les nœuds portant [identifier] dans l'arbre actuellement monté.
///
/// Rend une LISTE, jamais un nœud : une ancre de commande se répète
/// légitimement sur les lignes d'une liste dynamique, où c'est même le seul
/// moyen de les adresser (le flow choisit par rang). `tester.getSemantics`, qui
/// exige une correspondance unique, ne saurait donc pas les lire.
///
/// ⚠️ Demande `tester.ensureSemantics()` avant le montage — sinon le finder
/// lève, avec la bonne raison.
///
/// La remontée par `isMergedIntoParent` reproduit ce que fait
/// `SemanticsController.find` : un nœud fusionné n'existe pas pour la couche
/// d'accessibilité, seul son parent est exposé. Lire le nœud fusionné rendrait
/// des champs vides pour un élément parfaitement annoncé.
List<ArgusSemanticNode> argusNodesById(WidgetTester tester, String identifier) {
  return tester
      .elementList(find.bySemanticsIdentifier(identifier))
      .map((Element element) {
        RenderObject? render = element.renderObject;
        SemanticsNode? node = render?.debugSemantics;
        while (render != null && (node == null || node.isMergedIntoParent)) {
          render = render.parent;
          node = render?.debugSemantics;
        }
        return node;
      })
      .whereType<SemanticsNode>()
      .map((SemanticsNode node) {
        final SemanticsData data = node.getSemanticsData();
        return ArgusSemanticNode(
          identifier: data.identifier,
          label: data.label,
          actions: data.actions,
          // `flagsCollection` remplace `hasFlag` depuis Flutter 3.32, mais ce
          // harnais annonce fonctionner à partir de **3.19** : migrer casserait
          // toute la moitié basse de cette plage, où le nouveau symbole n'existe
          // pas. On garde donc l'ancien, et on tait l'avertissement plutôt que
          // de le laisser rougir une CI. À rebasculer le jour où le plancher de
          // version passe au-dessus de 3.32 — pas avant.
          // ignore: deprecated_member_use
          hasEnabledState: data.hasFlag(SemanticsFlag.hasEnabledState),
        );
      })
      .toList();
}

/// Les ancres dont le CENTRE VISÉ ne tombe pas sur le widget ancré.
///
/// ⚠️ **Une ancre peut être présente, active, et rester intapable.** Le garde
/// « commande active » ne voit que l'enveloppe inerte ; celui-ci mesure ce qu'il
/// annonçait sans le mesurer. Quand un `Semantics` fusionne avec son parent —
/// faute de `container: true` —, le nœud retenu est celui d'un ANCÊTRE, et son
/// rect englobe les voisins. Maestro vise le CENTRE de ce rect : le tap part
/// alors sur le titre de la rangée ou sur le nom au milieu d'une carte, à des
/// centaines de pixels du contrôle. Le tap est rapporté COMPLETED, et c'est
/// l'écran SUIVANT qui échoue, en accusant une ancre parfaitement correcte.
///
/// 📌 Le critère est le centre, pas le débordement : une fusion qui laisse le
/// centre sur le contrôle est sans conséquence (`InkWell`, `ListTile` et
/// `TextField` fusionnent ainsi, et le §2c s'appuie dessus). C'est le tap qui
/// manque sa cible qui casse, et lui seul.
///
/// Mesuré sur deux projets réels, deux plateformes, par deux runs qui
/// s'ignoraient : une commande de retour dont le nœud faisait 975 px de large au
/// lieu de 99, et le lien d'une carte dont le nœud couvrait la carte entière.
///
/// Rend une description par occurrence, vide quand tout va bien.
List<String> argusCentresHorsCible(WidgetTester tester, String identifier) {
  final List<String> hors = <String>[];
  for (final Element element in tester.elementList(
    find.bySemanticsIdentifier(identifier),
  )) {
    final RenderObject? vise = element.renderObject;
    if (vise is! RenderBox || !vise.attached || !vise.hasSize) continue;
    final Rect duNoeud = vise.localToGlobal(Offset.zero) & vise.size;
    if (duNoeud.isEmpty) continue;

    // ⚠️ ET LE WIDGET ANCRÉ NE SE TROUVE PAS PAR SA SÉMANTIQUE — c'est tout le
    // piège, et il a fait passer une première version de ce garde pour verte.
    // `find.bySemanticsIdentifier` rend l'élément qui PORTE le nœud : sous un
    // `MergeSemantics`, c'est déjà l'ancêtre fusionnant, si bien que le comparer
    // à lui-même ne dit jamais rien. Mesuré sur la sonde : rect rendu
    // 0,0→800,48 (la rangée) là où le bouton fait 48×48.
    // Le contrôle qu'on a voulu désigner est le WIDGET `Semantics`, qu'on
    // retrouve par son arbre de widgets et non par la sémantique qu'il produit.
    final Iterable<RenderBox> ancres = tester
        .elementList(
          find.byWidgetPredicate(
            (Widget w) =>
                w is Semantics && w.properties.identifier == identifier,
          ),
        )
        .map((Element e) => e.renderObject)
        .whereType<RenderBox>()
        .where((RenderBox b) => b.attached && b.hasSize);
    if (ancres.isEmpty) continue;

    // Celui que ce nœud recouvre : le rect visé englobe le contrôle ancré.
    Rect? duWidget;
    for (final RenderBox b in ancres) {
      final Rect r = b.localToGlobal(Offset.zero) & b.size;
      if (r.isEmpty || !duNoeud.overlaps(r)) continue;
      if (duWidget == null ||
          r.width * r.height < duWidget.width * duWidget.height) {
        duWidget = r;
      }
    }
    if (duWidget == null) continue;
    if (duWidget.contains(duNoeud.center)) continue;

    hors.add(
      '« $identifier » : le nœud retenu mesure '
      '${duNoeud.width.toStringAsFixed(0)}×${duNoeud.height.toStringAsFixed(0)} dp '
      'quand le widget ancré en fait '
      '${duWidget.width.toStringAsFixed(0)}×${duWidget.height.toStringAsFixed(0)} ; '
      'le centre visé (${duNoeud.center.dx.toStringAsFixed(0)}, '
      '${duNoeud.center.dy.toStringAsFixed(0)}) tombe HORS du contrôle',
    );
  }
  return hors;
}

/// Consomme l'exception qu'un montage a pu laisser en attente, sans la juger.
///
/// ⚠️ **Ce n'est pas une mise sous le tapis, et ça ne le reste que sous une
/// condition.** Une exception laissée en attente fait tomber le test AVANT
/// qu'[argusCheck] n'ait produit un verdict : le message devient générique,
/// aucune clé n'est émise, et `known_issues.dart` — dont c'est précisément le
/// rôle — ne peut plus rien absorber. Mesuré sur un projet réel : onze écrans
/// sur quatorze, donc une suite rouge en permanence et irrécupérable par la
/// dette.
///
/// La condition est qu'un AUTRE garde rapporte ce qui est drainé ici.
/// `layout_test.dart` monte les mêmes écrans sur tous les gabarits et toutes
/// les échelles, et asserte que rien n'a été levé : c'est lui le rapporteur.
/// Le jour où il cesserait de couvrir les mêmes écrans, tout appel à cette
/// fonction deviendrait un silence — et rien ne le signalerait.
void argusDrainMountException(WidgetTester tester) {
  tester.takeException();
}

// ───────────────────────────────────────────────────────────────────────────
// 5. La dette assumée
// ───────────────────────────────────────────────────────────────────────────

/// Exerce [verifier] en tenant compte du relevé figé de [argusKnownIssues].
///
/// Deux sens, et c'est ce qui distingue un relevé d'une liste d'exceptions :
///
///   clé ABSENTE du relevé  → le défaut doit être absent. Sinon, échec, avec la
///                            ligne exacte à inscrire si on l'assume.
///   clé PRÉSENTE           → le défaut doit être ENCORE LÀ. S'il a disparu,
///                            échec aussi : la ligne doit sortir.
///
/// Le second sens est celui qu'on oublie, et sans lui la liste se transforme en
/// permission permanente — elle survit à ce qu'elle décrit, et le garde cesse
/// de garder sans rien dire.
/// Les défauts retenus par la collecte en cours, `null` si personne ne collecte.
List<Object>? _argusCollecte;

/// Ouvre une collecte : à partir d'ici, [argusCheck] RETIENT ses défauts au lieu
/// de lever au premier.
///
/// ⚠️ Sans elle, une boucle de vérifications s'arrête au premier échec — sur un
/// écran à 24 commandes, découvrir l'ensemble demandait une exécution PAR ancre.
/// Un run réel s'en est sorti en DÉDUISANT les ancres voisines, exactement ce
/// que ce harnais dit de ne pas faire (« on ne raisonne pas : on mesure »).
///
/// Rien de ce qui est jugé ne change : chaque vérification garde sa clé, sa
/// réconciliation de dette et son message. Seul le MOMENT de la levée change.
///
/// Le désarmement est posé en `addTearDown`, donc il a lieu même si le test
/// meurt avant [argusCollecteFin] — sans quoi un test suivant qui ne collecte
/// pas verrait ses propres échecs avalés par une collecte restée ouverte.
void argusCollecteDebut() {
  _argusCollecte = <Object>[];
  addTearDown(() => _argusCollecte = null);
}

/// Ferme la collecte et lève UNE fois avec tout ce qui a été retenu.
void argusCollecteFin(String contexte) {
  final List<Object> echecs = _argusCollecte ?? <Object>[];
  _argusCollecte = null;
  if (echecs.isEmpty) return;
  if (echecs.length == 1) fail(echecs.first.toString());
  fail(
    '${echecs.length} défauts sur « $contexte » — ils sont TOUS listés '
    'ci-dessous. Inutile de relancer pour découvrir le suivant, et surtout : '
    'ne DÉDUIS pas les autres à partir de celui-ci.\n\n'
    '${echecs.join('\n\n────────────────────────────────────────\n\n')}',
  );
}

Future<void> argusCheck(String key, Future<void> Function() verifier) async {
  Object? echec;
  try {
    await verifier();
  } catch (e) {
    echec = e;
  }

  if (!argusKnownIssues.contains(key)) {
    if (echec != null) {
      _argusLever(
        '$echec\n\n'
        '── Défaut PRÉEXISTANT ? ────────────────────────────────────────────\n'
        'Si celui-ci appartient à l\'application et ne se corrige pas maintenant, '
        'inscris-le TEL QUEL dans test/argus/known_issues.dart :\n\n'
        "      '$key',\n\n"
        'La suite repassera au vert — et rougira à nouveau le jour où il sera '
        'corrigé, pour te demander de retirer la ligne. Ce n\'est pas une '
        'exception, c\'est un relevé.\n\n'
        '── Pour rejouer ces gardes-là seuls ────────────────────────────────\n'
        "      flutter test test/argus/ --plain-name '${key.split(' · ').first}'\n\n"
        '⚠️ NE COLLE PAS LA CLÉ CI-DESSUS DANS `--plain-name`. Elle porte des '
        '« · » et des mots que le nom du test n\'a pas : le motif ne matche alors '
        'RIEN, et `flutter test` sort en **0** sur « No tests ran ». Un zéro rendu '
        'par une commande qui n\'a rien mesuré se lit exactement comme un vert — '
        'et c\'est ce qu\'on lit au moment précis où on vérifie qu\'une dette est '
        'payée. L\'identifiant d\'écran ci-dessus, lui, vient du groupe : il matche.',
      );
    }
    return;
  }

  if (echec == null) {
    _argusLever(
      '« $key » figure dans test/argus/known_issues.dart, mais l\'écran PASSE.\n'
      'Retire cette ligne. Une dette corrigée qui reste inscrite devient une '
      'permission permanente : la liste survit à ce qu\'elle décrit, et plus '
      'rien ne mesure ce défaut-là.',
    );
  }
}

/// Distingue « l'ancre n'existe pas » de « elle est sous le pli ».
///
/// ⚠️ ABSENTE et SOUS LE PLI rendent le même vide sur le gabarit de référence,
/// et le message accuserait alors l'instrumentation pour un défaut qui n'existe
/// pas. Une ancre au bas d'une liste paresseuse n'y est simplement pas
/// construite. Mesuré sur un projet réel : quatre ancres déclarées « absentes »
/// au petit gabarit, TOUTES présentes au grand.
///
/// On ne raisonne donc pas : on remonte l'écran plus haut et on regarde. Rendre
/// discernable coûte moins cher que déduire.
///
/// ⚠️ **Cette sonde a vécu une passe entière dans le seul chemin des
/// commandes.** `displaysAfterScroll` existait déjà, et le message des
/// affichages ne le nommait nulle part : deux échecs sur quatre du run suivant
/// étaient exactement ce cas. Elle est ici — et non recopiée là-bas — pour que
/// le troisième axe l'ait par construction plutôt que par attention.
///
/// Rend l'indice à coller au message d'échec, ou `''` si l'ancre est vraiment
/// absente. Laisse l'écran remonté sur le gabarit de référence : ce qui suit
/// l'appel mesure là.
/// Le widget d'un écran, son `setUp` joué d'abord.
///
/// ⚠️ Un écran qui résout ses dépendances lui-même (`get_it`, un service
/// locator) ignore tout provider posé au-dessus de lui : il n'y avait donc
/// AUCUN endroit où enregistrer un double, sinon le corps de `build()` — appelé
/// N fois (point 240). Ce point d'accroche vaut pour tous les montages, et il
/// est nommé plutôt qu'écrit en ligne : un `(setUp(), build()).$2` est correct
/// et illisible dans un fichier que le projet relit.
Widget argusMonte(ArgusScreen screen) {
  screen.setUp?.call();
  return screen.build();
}

Future<String> argusFoldHint(
  WidgetTester tester,
  ArgusScreen screen,
  String ancre, {
  required String champ,
}) async {
  if (argusViewports.length < 2) return '';

  await pumpArgus(
    tester,
    argusMonte(screen),
    viewport: argusViewports.last,
    debugLabel: screen.id,
  );
  argusDrainMountException(tester);
  final bool existeAilleurs = argusNodesById(tester, ancre).isNotEmpty;

  // Remonter sur le gabarit de référence : ce qui suit le mesure.
  await pumpArgus(
    tester,
    argusMonte(screen),
    viewport: argusViewports.first,
    debugLabel: screen.id,
  );
  argusDrainMountException(tester);

  if (!existeAilleurs) return '';
  return '\n\n⚠️ ELLE EXISTE, mais plus bas que ce gabarit ne le montre : '
      'présente et construite sur ${argusViewports.last.name}, absente sur '
      '${argusViewports.first.name}. Ce n\'est PAS un défaut d\'instrumentation '
      '— c\'est une liste paresseuse qui ne construit pas ce qu\'elle n\'affiche '
      'pas. DÉPLACE-LA dans `$champ` : elle y sera éprouvée sur le grand '
      'gabarit, au lieu de rougir ici en permanence — ou de sortir de sa liste '
      'et de n\'être plus vérifiée nulle part.';
}

/// Lève, ou RETIENT si une collecte est ouverte. Le seul endroit qui décide.
///
/// ⚠️ Retenir doit RENDRE LA MAIN, pas relancer : une exception ici remonterait
/// à la boucle appelante et l'arrêterait — c'est-à-dire exactement le défaut que
/// la collecte existe pour corriger.
void _argusLever(String message) {
  final List<Object>? collecte = _argusCollecte;
  if (collecte == null) {
    fail(message);
  }
  collecte.add(message);
}
