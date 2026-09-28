// Sonde du 574 — les polices du harnais se DÉRIVENT du bundle, et se RENDENT.
//
// Elle n'est pas un garde de ce dépôt, qui n'est pas un projet Flutter : elle
// se joue dans un projet où le scaffold est installé, montée par
// `tools/fonts-probe.sh` — en CI (job `harness`) comme à la main :
//
//   flutter create -e /tmp/accueil
//   (cd /tmp/accueil && flutter pub add dev:flutter_test --sdk=flutter)
//   bash plugins/argus-mobile/skills/argus-mobile/scripts/install-mobile.sh /tmp/accueil
//   bash tools/fonts-probe.sh /tmp/accueil
//
// ⚠️ DÉCLARER NE PROUVE PAS CHARGER. Une famille présente dans la table mais
// absente du moteur retombe en silence sur la police de `flutter_test` — un
// carré d'un cadratin par glyphe. D'où la mesure d'une LARGEUR rendue, contre
// celle d'une famille qui n'existe pas.
//
// MESURÉ le 28/09/2026 sur Flutter 3.32.0 : dix « i » à 20 px font 200 px dans
// la police de repli, 53 en `Roboto_700`, 50,5 en `Roboto_500italic`, 48,5
// dans la famille déclarée par le pubspec.
// ignore_for_file: avoid_print
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'argus/argus_harness.dart';

/// Les familles que `fonts-probe.sh` pose : une par source de la dérivation.
const List<String> familles = <String>[
  'SondeMaison', // déclarée par le pubspec → FontManifest.json
  'Roboto_700', // Roboto-Bold.ttf en assets → convention google_fonts
  'Roboto_500italic', // Roboto-MediumItalic.ttf en assets
];

void main() {
  late int chargees;
  setUpAll(() async {
    chargees = await loadArgusFonts();
  });

  test('les deux sources du bundle sont dérivées', () {
    final Map<String, List<String>> derivees = argusDerivedFonts();
    print(
      'DERIVEES ${(derivees.keys.toList()..sort()).join(' | ')} · '
      '$chargees fichier(s) chargé(s)',
    );
    expect(derivees.keys, containsAll(familles));
  });

  testWidgets('une police dérivée est RENDUE, pas seulement déclarée', (
    WidgetTester tester,
  ) async {
    Future<double> largeur(String famille) async {
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: Text(
              'iiiiiiiiii',
              key: const Key('mesure'),
              style: TextStyle(fontFamily: famille, fontSize: 20),
            ),
          ),
        ),
      );
      return tester.getSize(find.byKey(const Key('mesure'))).width;
    }

    final double repli = await largeur('FamilleQuiNExistePas');
    for (final String famille in familles) {
      final double mesuree = await largeur(famille);
      print('LARGEUR $famille = $mesuree (repli = $repli)');
      expect(
        mesuree,
        lessThan(repli / 2),
        reason:
            '$famille est rendue dans la police de repli : déclarée, pas chargée',
      );
    }
  });
}
