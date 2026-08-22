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

import 'package:flutter_test/flutter_test.dart';

import 'argus_harness.dart';

void main() {
  setUpAll(() async {
    await loadArgusFonts();
  });

  if (argusScreens.isEmpty) {
    testWidgets(argusName('gardes de disposition non branchées'),
      (WidgetTester tester) async {},
      skip: argusShouldSkip,
    );
    return;
  }

  for (final ArgusScreen screen in argusScreens) {
    group('disposition — ${screen.id}', () {
      for (final ArgusViewport viewport in argusViewports) {
        for (final double scale in argusTextScales) {
          final String label = '${viewport.name} · texte ×$scale';

          testWidgets(argusName('$label — rien ne déborde'), (WidgetTester tester) async {
            await pumpArgus(
              tester,
              screen.build(),
              viewport: viewport,
              textScale: scale,
            );
            final Object? thrown = tester.takeException();
            expect(
              thrown,
              isNull,
              reason:
                  'Débordement sur ${screen.id} en $label.\n'
                  'Cherche « The relevant error-causing widget was » dans la sortie : '
                  "le widget fautif n'est presque jamais celui de l'écran.\n\$thrown",
            );
          }, skip: argusShouldSkip);

          testWidgets(argusName('$label — aucun texte tronqué'), (
            WidgetTester tester,
          ) async {
            await pumpArgus(
              tester,
              screen.build(),
              viewport: viewport,
              textScale: scale,
            );
            // Une exception pendant le montage laisse un arbre à moitié
            // construit : ce qui suit mesurerait alors autre chose. On la
            // consomme d'abord — le garde ci-dessus est celui qui la rapporte.
            tester.takeException();
            final List<String> truncated = argusTruncatedTexts(tester);
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
          }, skip: argusShouldSkip);
        }
      }
    });
  }
}
