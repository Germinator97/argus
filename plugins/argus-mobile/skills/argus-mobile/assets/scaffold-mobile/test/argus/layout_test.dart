// ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
// Argus Mobile — gardes de disposition, sans device.
//
// Éprouve chaque écran déclaré sur trois gabarits × trois échelles de texte.
// Le débordement à grande police est la première cause de casse de mise en page
// Flutter, et il ne se voit sur aucune capture d'écran prise à 100 %.
//
// CE QUE CES GARDES MESURENT, ET POURQUOI DEUX MESURES :
//
//   1. `takeException()` attrape les `RenderFlex overflowed`. C'est la mesure
//      évidente, et elle est INSUFFISANTE seule : avec `maxLines` + ellipsis,
//      ou à l'intérieur d'un `SingleChildScrollView`, rien ne déborde jamais.
//      Un test qui ne guette que ça passe sur n'importe quelle largeur, y
//      compris absurde, et ne prouve donc rien.
//
//   2. `didExceedMaxLines` attrape la TRONCATURE, qui est ce qui casse
//      réellement quand le texte est borné. C'est cette mesure-là qui trouve le
//      libellé qui ne tient plus à 130 %.
//
// ⚠️ QUAND UN DÉBORDEMENT EST SIGNALÉ, LIS SON `creator`, PAS L'ÉCRAN.
// `RenderFlex overflowed` nomme la page qu'on regarde ; le coupable est souvent
// une carte à hauteur figée trois niveaux plus bas. La ligne à chercher dans la
// sortie est « The relevant error-causing widget was ».
//
// À brancher dans test/argus/harness.dart — rien à modifier dans ce fichier.

import 'dart:ui' show Rect;

import 'package:flutter_test/flutter_test.dart';

import 'argus_harness.dart';

void main() {
  setUpAll(() async {
    await loadArgusFonts();
  });

  // ── 437 ──────────────────────────────────────────────────────────────────
  // La décision de résolution, exercée sur des valeurs FABRIQUÉES : elle ne
  // dépend ni d'un projet, ni d'un device, ni d'un manifeste sur le disque,
  // donc elle tourne partout — y compris sur une installation neuve où le
  // contrôle réel ci-dessous se met en `skip`.
  //
  // ⚠️ C'est ce qui manquait au 436 : il comparait DEUX termes sur trois, et
  // restait vert sur un projet dont l'app résolvait parfaitement sa police
  // pendant que la suite la chargeait sous un autre nom.
  group('résolution de police — les trois termes (437)', () {
    const String demandee = 'packages/mon_paquet/MaPolice';

    test('accord des trois : aucun défaut', () {
      expect(
        argusFontMismatch(
          demandeesParLeTheme: <String>{demandee},
          chargeesParLeHarnais: <String>{demandee},
          enregistreesAuBundle: <String>[demandee],
        ),
        isNull,
      );
    });

    test('le HARNAIS charge un autre nom que celui que le thème demande', () {
      final String? defaut = argusFontMismatch(
        demandeesParLeTheme: <String>{demandee},
        chargeesParLeHarnais: <String>{'MaPolice'}, // le nom NU
        enregistreesAuBundle: <String>[demandee], //   l'app va BIEN
      );
      expect(
        defaut,
        isNotNull,
        reason:
            "l'app résout sa police et la suite la charge sous un autre nom : le "
            'montage retombe sur la police de flutter_test et TOUTE mesure de '
            'disposition est fausse, sans que rien ne le dise (437)',
      );
      expect(defaut, contains('ne charge PAS'));
    });

    test('sans manifeste, le défaut de HARNAIS se voit quand même', () {
      // Le second contrôle ne dépend d'aucun manifeste : le sauter quand le
      // fichier manque le rendrait vacant sur une machine qui n'a pas encore
      // lancé `flutter test`.
      expect(
        argusFontMismatch(
          demandeesParLeTheme: <String>{demandee},
          chargeesParLeHarnais: <String>{'MaPolice'},
          enregistreesAuBundle: const <String>[],
        ),
        contains('ne charge PAS'),
      );
    });

    test("le défaut de l'APPLICATION reste détecté, et se distingue", () {
      final String? defaut = argusFontMismatch(
        demandeesParLeTheme: <String>{'MaPolice'}, // le thème demande le nom NU
        chargeesParLeHarnais: <String>{'MaPolice'},
        enregistreesAuBundle: <String>[
          demandee,
        ], // le bundle n'a que le préfixé
      );
      expect(defaut, contains("n'enregistre pas sous ce nom"));
      expect(
        defaut,
        isNot(contains('ne charge PAS')),
        reason:
            'les deux défauts appellent des gestes opposés — corriger le code de '
            "l'app, ou corriger la déclaration de la suite : les confondre envoie "
            'réparer ce qui marche',
      );
    });

    test('aucun thème déclaré : rien à confronter, pas un vert', () {
      expect(
        argusFontMismatch(
          demandeesParLeTheme: const <String>{},
          chargeesParLeHarnais: const <String>{},
          enregistreesAuBundle: const <String>[],
        ),
        isNull,
      );
    });
  });

  // ── 436 ──────────────────────────────────────────────────────────────────
  // 🔴 CE CONTRÔLE COMMANDE TOUS LES AUTRES DE CE FICHIER. Le harnais charge
  // les polices par CHEMIN, donc elles existent toujours en test ; l'app, elle,
  // les résout par NOM. Quand les deux divergent — le cas dès que la police
  // vient d'une dépendance — l'appareil rend la police système et chaque mesure
  // de disposition ci-dessous décrit un écran que personne ne voit. Mesuré sur
  // un projet réel : 45 troncatures relevées sur un rendu qui n'existait pas.
  test(argusName("la police mesurée est celle que l'app résout"), () {
    final Set<String> demandees = argusThemeFontFamilies();
    if (demandees.isEmpty) {
      // Pas un vert : on le DIT. Sans `argusTheme()`, le harnais monte un thème
      // qu'il fabrique, et le comparer au bundle serait circulaire.
      markTestSkipped(
        "argusTheme() ne rend pas le thème de l'app : la résolution des polices "
        'ne peut pas être confrontée. Renseigne-le dans test/argus/harness.dart.',
      );
      return;
    }
    if (argusBundledFontFamilies().isEmpty) {
      markTestSkipped(
        'build/unit_test_assets/FontManifest.json est absent ou illisible : '
        "le contrôle n'a rien mesuré (ce n'est pas « conforme »).",
      );
      return;
    }
    final String? defaut = argusFontResolutionIssue();
    expect(defaut, isNull, reason: defaut ?? '');
  });

  if (argusScreens.isEmpty) {
    testWidgets(
      argusName('gardes de disposition non branchées'),
      (WidgetTester tester) async {},
      skip: argusShouldSkip,
    );
    return;
  }

  for (final ArgusScreen screen in argusScreens) {
    group('disposition — ${screen.id}', () {
      // ⚠️ LA RACINE DE RECADRAGE NE DOIT PAS REMONTER SOUS LA BARRE D'ÉTAT.
      // Un `visualCropOn` posé au-dessus du `SafeArea` embarque l'horloge
      // système dans chaque référence visuelle : elle change à chaque minute,
      // donc la comparaison devient un tirage. La règle est écrite depuis
      // longtemps dans la méthodologie ; jusqu'ici rien ne la mesurait, et un
      // run l'a rattrapée par relecture seule. Un seul gabarit suffit : ce qui
      // est en cause est l'inset, pas la taille.
      if (screen.cropRoot && screen.anchor != null) {
        final ArgusViewport gabarit = argusViewports.first;
        testWidgets(
          argusName('racine de recadrage sous la barre d\'état'),
          (WidgetTester tester) async {
            await pumpArgus(
              tester,
              argusMonte(screen),
              viewport: gabarit,
              textScale: 1,
              debugLabel: screen.id,
            );
            // ⚠️ DRAINER AVANT DE MESURER — et ce garde-ci était le seul des trois
            // à ne pas le faire. Une exception laissée EN ATTENTE par le montage
            // (un `RenderFlex overflowed` de l'écran, mesuré ailleurs) fait échouer
            // le test au DÉMONTAGE, donc hors d'`argusCheck` : il ne propose alors
            // aucune clé de dette, et la clé écrite de mémoire ne correspond à
            // rien. Le garde devient impossible à faire taire autrement qu'en le
            // retirant — sur un projet où le débordement est déjà mesuré et
            // inscrit par « rien ne déborde », qui le draine, lui.
            // Deux runs en aveugle ont dû ajouter cette ligne chacun de leur côté.
            tester.takeException();
            final Rect rect = tester.getRect(
              find.bySemanticsIdentifier(screen.anchor!),
            );
            // `FakeViewPadding` est en pixels PHYSIQUES ; les rects sont logiques.
            final double insetHaut =
                gabarit.padding.top / gabarit.devicePixelRatio;
            await argusCheck('${screen.id} · racine de recadrage', () async {
              expect(
                rect.top,
                greaterThanOrEqualTo(insetHaut),
                reason:
                    'La racine « ${screen.anchor} » de ${screen.id} commence à '
                    '${rect.top.toStringAsFixed(1)} dp, au-dessus de l\'inset '
                    'système (${insetHaut.toStringAsFixed(1)} dp).\n'
                    'Elle sert de visualCropOn : le recadrage embarque donc la '
                    "barre d'état, et la référence changera à chaque minute.\n"
                    'Pose le Semantics racine DANS le SafeArea (ou dans celui de '
                    'la coquille), pas autour du Scaffold.',
              );
            });
          },
          skip: argusShouldSkip,
        );
      }

      for (final ArgusViewport viewport in argusViewports) {
        for (final double scale in argusTextScales) {
          final String label = '${viewport.name} · texte ×$scale';

          testWidgets(argusName('$label — rien ne déborde'), (
            WidgetTester tester,
          ) async {
            await pumpArgus(
              tester,
              argusMonte(screen),
              viewport: viewport,
              textScale: scale,
              debugLabel: screen.id,
            );
            final Object? thrown = tester.takeException();
            await argusCheck('${screen.id} · $label · rien ne déborde', () async {
              expect(
                thrown,
                isNull,
                reason:
                    'Débordement sur ${screen.id} en $label.\n'
                    '${argusDernierCoupable.isEmpty ? "Flutter n'a nommé aucun widget fautif pour ce débordement." : "Widget fautif : $argusDernierCoupable"}\n'
                    "Le coupable n'est presque jamais celui de l'écran : "
                    'un `RenderFlex overflowed` nomme la page, pas la carte à '
                    'hauteur figée trois niveaux plus bas.',
              );
            });
          }, skip: argusShouldSkip);

          testWidgets(argusName('$label — aucun texte tronqué'), (
            WidgetTester tester,
          ) async {
            await pumpArgus(
              tester,
              argusMonte(screen),
              viewport: viewport,
              textScale: scale,
              debugLabel: screen.id,
            );
            // Une exception pendant le montage laisse un arbre à moitié
            // construit : ce qui suit mesurerait alors autre chose. On la
            // consomme d'abord — le garde ci-dessus est celui qui la rapporte.
            tester.takeException();
            final List<String> truncated = argusTruncatedTexts(tester);
            await argusCheck('${screen.id} · $label · aucun texte tronqué', () async {
              expect(
                truncated,
                isEmpty,
                reason:
                    'Texte(s) tronqué(s) sur ${screen.id} en $label :\n'
                    '  ${truncated.join('\n  ')}\n'
                    'Un libellé se raccourcit, un NOMBRE ne se tronque pas : « 12 340 XP » '
                    "coupé en « 1234… » affiche un montant qui n'existe pas. Fais rétrécir "
                    'les valeurs (FittedBox scaleDown) et raccourcis le libellé.',
              );
            });
          }, skip: argusShouldSkip);
        }
      }
    });
  }
}
