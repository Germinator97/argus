// Argus Mobile — gardes d'accessibilité, sans device.
//
// ⚠️ CHAQUE MONTAGE DRAINE SON EXCEPTION, ET CE N'EST PAS UNE MISE SOUS LE
// TAPIS. Une exception laissée en attente fait tomber le test AVANT
// qu'`argusCheck` n'ait produit un verdict : le message est générique, aucune
// clé n'est émise, et `known_issues.dart` — qui existe précisément pour
// absorber un défaut assumé — ne peut alors rien. Mesuré sur un projet réel :
// onze écrans sur quatorze, donc une suite rouge en permanence et
// irrécupérable.
//
// Drainer ici est légitime pour une seule raison : `layout_test.dart` monte les
// MÊMES écrans sur tous les gabarits et toutes les échelles, et asserte que
// rien n'a été levé. C'est LUI qui rapporte. Le jour où cette suite cesserait
// de couvrir les mêmes écrans, ce drain deviendrait un silence.
//
// Couvre exactement ce qu'un flow Maestro ne sait pas exprimer : la taille des
// cibles tactiles et le contraste. Les sélecteurs `width`/`height` de Maestro
// sont des égalités en pixels ; « ≥ 48 dp » ne s'y écrit pas.
//
// Le pendant sur device est scripts/argus/a11y.mjs, qui mesure le RENDU
// RÉEL sur un appareil donné. Ici on mesure la RÈGLE. Les deux se trompent
// différemment, d'où l'intérêt d'avoir les deux.
//
// À brancher dans test/argus/harness.dart — rien à modifier dans ce fichier.

import 'package:flutter_test/flutter_test.dart';

import 'argus_harness.dart';

void main() {
  setUpAll(() async {
    await loadArgusFonts();
  });

  // Aucun écran branché : on le DIT, dans le rapport de test, plutôt que de ne
  // rien déclarer. Une suite vide se lit « tout va bien » ; une suite qui skippe
  // avec sa raison se lit « personne n'a encore branché ça ».
  if (argusScreens.isEmpty) {
    testWidgets(
      argusName('gardes a11y non branchées'),
      (WidgetTester tester) async {},
      skip: argusShouldSkip,
    );
    return;
  }

  for (final ArgusScreen screen in argusScreens) {
    group('a11y — ${screen.id}', () {
      testWidgets(argusName('cibles tactiles ≥ 48 dp (Android)'), (
        WidgetTester tester,
      ) async {
        final SemanticsHandle handle = tester.ensureSemantics();
        await pumpArgus(
          tester,
          argusMonte(screen),
          viewport: argusViewports.first,
          debugLabel: screen.id,
        );
        argusDrainMountException(tester);
        await argusCheck(
          '${screen.id} · cibles tactiles ≥ 48 dp (Android)',
          () => expectLater(tester, meetsGuideline(androidTapTargetGuideline)),
        );
        handle.dispose();
      }, skip: argusShouldSkip);

      testWidgets(argusName('cibles tactiles ≥ 44 dp (iOS)'), (
        WidgetTester tester,
      ) async {
        final SemanticsHandle handle = tester.ensureSemantics();
        await pumpArgus(
          tester,
          argusMonte(screen),
          viewport: argusViewports.first,
          debugLabel: screen.id,
        );
        argusDrainMountException(tester);
        await argusCheck(
          '${screen.id} · cibles tactiles ≥ 44 dp (iOS)',
          () => expectLater(tester, meetsGuideline(iOSTapTargetGuideline)),
        );
        handle.dispose();
      }, skip: argusShouldSkip);

      // Un audit mené sur un seul thème conclut à côté : une couleur née sur les
      // fonds sombres passe en sombre et échoue en clair, et l'inverse est tout
      // aussi vrai. Le garde ci-dessous mesure le thème que `pumpArgus` applique ;
      // duplique-le avec un thème sombre dès que ton app en propose un.
      // ⚠️ Skippé tant qu'`argusTheme` n'est pas renseigné : mesurer un
      // contraste sur le thème Material par défaut (fond blanc) donnerait des
      // défauts inventés sur toute app sombre.
      testWidgets(
        argusName(
          argusTheme() == null
              ? "contraste du texte (WCAG AA)  [SKIP — argusTheme() vaut null : le fond mesuré ne serait pas celui de l'app]"
              : 'contraste du texte (WCAG AA)',
        ),
        (WidgetTester tester) async {
          final SemanticsHandle handle = tester.ensureSemantics();
          await pumpArgus(
            tester,
            argusMonte(screen),
            viewport: argusViewports.first,
            debugLabel: screen.id,
          );
          argusDrainMountException(tester);
          await argusCheck(
            '${screen.id} · contraste du texte (WCAG AA)',
            () => expectLater(tester, meetsGuideline(textContrastGuideline)),
          );
          handle.dispose();
        },
        skip: argusShouldSkip || argusTheme() == null,
      );

      // Ce que Maestro voit d'un élément, c'est ce que TalkBack et VoiceOver en
      // annoncent. Une cible sans label est un bouton que le lecteur d'écran
      // décrit comme « bouton », rien de plus.
      testWidgets(argusName('toute cible tactile porte un label'), (
        WidgetTester tester,
      ) async {
        final SemanticsHandle handle = tester.ensureSemantics();
        await pumpArgus(
          tester,
          argusMonte(screen),
          viewport: argusViewports.first,
          debugLabel: screen.id,
        );
        argusDrainMountException(tester);
        await argusCheck(
          '${screen.id} · toute cible tactile porte un label',
          () => expectLater(tester, meetsGuideline(labeledTapTargetGuideline)),
        );
        handle.dispose();
      }, skip: argusShouldSkip);

      // À 200 % de taille de texte, une cible dimensionnée « juste » passe sous
      // le seuil parce que son contenu la pousse. C'est le cas que personne ne
      // regarde, et c'est celui des utilisateurs qui en ont le plus besoin.
      testWidgets(
        argusName('cibles tactiles tenues à 200 % de taille de texte'),
        (WidgetTester tester) async {
          final SemanticsHandle handle = tester.ensureSemantics();
          await pumpArgus(
            tester,
            argusMonte(screen),
            viewport: argusViewports.first,
            textScale: 2,
            debugLabel: screen.id,
          );
          argusDrainMountException(tester);
          await argusCheck(
            '${screen.id} · cibles tactiles à 200 % de taille de texte',
            () =>
                expectLater(tester, meetsGuideline(androidTapTargetGuideline)),
          );
          handle.dispose();
        },
        skip: argusShouldSkip,
      );
    });
  }
}
