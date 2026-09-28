// Sonde du 573 — le contraste se juge sur les couleurs RÉSOLUES, et un fond
// peint repasse aux pixels, images chargées.
//
// Elle n'est pas un garde de ce dépôt, qui n'est pas un projet Flutter : elle
// se joue dans un projet où le scaffold est installé, montée par
// `tools/contrast-probe.sh` — en CI (job `harness`) comme à la main.
//
// Chaque montage a un verdict CONNU d'avance, et le ratio attendu s'écrit en
// clair : un attendu calculé par la fonction mesurée ne mesurerait rien.
// ignore_for_file: avoid_print
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'argus/argus_harness.dart';

/// Un PNG d'un pixel, gris très sombre (#202020) : le fond PEINT du montage.
final Uint8List pixelSombre = Uint8List.fromList(<int>[
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, //
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, //
  0x0C, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x50, 0x50, 0x50, 0x00, //
  0x00, 0x00, 0xC4, 0x00, 0x61, 0x29, 0x95, 0xF9, 0xB0, 0x00, 0x00, 0x00, //
  0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82, //
]);

Future<void> monter(WidgetTester tester, Widget corps) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        backgroundColor: Colors.white,
        body: Center(child: corps),
      ),
    ),
  );
}

Future<Evaluation> juger(WidgetTester tester) async =>
    const ArgusTextContrastGuideline().evaluate(tester);

ArgusMesureContraste mesure(WidgetTester tester, String texte) {
  final Element e = find.text(texte).evaluate().single;
  return argusMesureContraste(
    e,
    DefaultTextStyle.of(e).style.merge((e.widget as Text).style),
  );
}

void main() {
  setUpAll(() async {
    // Une vraie police FINE : c'est elle qui fait mentir les pixels. La police
    // de flutter_test rend des carrés pleins, où rien n'est anticrénelé.
    final FontLoader fine = FontLoader('SondeFine')
      ..addFont(
        Future<ByteData>.value(
          ByteData.sublistView(
            File('test/sonde_contraste/Roboto-Thin.ttf').readAsBytesSync(),
          ),
        ),
      );
    await fine.load();
  });

  testWidgets(
    '1 · un texte fin et rétréci : les pixels mentent, les couleurs non',
    (WidgetTester tester) async {
      final SemanticsHandle h = tester.ensureSemantics();
      await monter(
        tester,
        const SizedBox(
          width: 60,
          height: 8,
          child: FittedBox(
            child: Text(
              'Royaume des brumes',
              style: TextStyle(
                fontFamily: 'SondeFine',
                fontSize: 40,
                color: Color(0xFF444444),
              ),
            ),
          ),
        ),
      );
      final Evaluation pixels = await textContrastGuideline.evaluate(tester);
      final Evaluation argus = await juger(tester);
      final ArgusMesureContraste m = mesure(tester, 'Royaume des brumes');
      print(
        'CAS 1 · pixels ${pixels.passed ? "passe" : "échoue"} · argus ${argus.passed ? "passe" : "échoue"} '
        '· résolu ${m.ratio?.toStringAsFixed(2)}:1',
      );
      expect(
        pixels.passed,
        isFalse,
        reason: 'le montage ne reproduit plus le faux positif des pixels',
      );
      expect(
        argus.passed,
        isTrue,
        reason: '#444444 sur blanc fait 9,74:1 — ${argus.reason}',
      );
      expect(m.ratio, closeTo(9.74, 0.02));
      h.dispose();
    },
  );

  testWidgets('2 · un fond d\'IMAGE : repli sur les pixels, images chargées', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle h = tester.ensureSemantics();
    await monter(
      tester,
      SizedBox(
        width: 200,
        height: 80,
        child: Stack(
          children: <Widget>[
            Positioned.fill(child: Image.memory(pixelSombre, fit: BoxFit.fill)),
            const Center(
              child: Text(
                'Passer',
                style: TextStyle(fontSize: 20, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
    // Avant tout chargement, les pixels voient du blanc sur du blanc : le
    // verdict qui dépendait de l'instant.
    final Evaluation avant = await textContrastGuideline.evaluate(tester);
    final ArgusMesureContraste m = mesure(tester, 'Passer');
    final Evaluation argus = await juger(tester);
    print(
      'CAS 2 · pixels avant chargement ${avant.passed ? "passe" : "échoue"} · peint : ${m.peint} '
      '· argus ${argus.passed ? "passe" : "échoue"}',
    );
    expect(
      m.peint,
      isNotNull,
      reason: 'une image SŒUR sous le texte n\'est pas vue comme un fond peint',
    );
    expect(
      argus.passed,
      isTrue,
      reason: 'blanc sur #202020, image chargée — ${argus.reason}',
    );
    h.dispose();
  });

  testWidgets(
    '3 · un vrai défaut : échoue, sur les couleurs résolues, et le dit',
    (WidgetTester tester) async {
      final SemanticsHandle h = tester.ensureSemantics();
      await monter(
        tester,
        const Text(
          'Faible',
          style: TextStyle(fontSize: 14, color: Color(0xFF9E9E9E)),
        ),
      );
      final Evaluation argus = await juger(tester);
      print('CAS 3 · ${argus.reason}');
      expect(argus.passed, isFalse);
      expect(
        argus.reason,
        contains('couleurs résolues : texte #9E9E9E sur fond #FFFFFF'),
      );
      h.dispose();
    },
  );

  testWidgets('4 · un voile translucide se compose avec ce qu\'il recouvre', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle h = tester.ensureSemantics();
    await monter(
      tester,
      Container(
        color: const Color(0x80000000),
        padding: const EdgeInsets.all(8),
        child: const Text(
          'Voile',
          style: TextStyle(fontSize: 14, color: Colors.white),
        ),
      ),
    );
    final Evaluation argus = await juger(tester);
    print('CAS 4 · ${argus.reason}');
    // 0x80 de noir sur blanc : #7F7F7F. Blanc dessus : 4,00:1 < 4,5. Tenu pour
    // opaque, le voile rendrait du blanc sur NOIR, 21:1 — un vert faux.
    expect(argus.passed, isFalse);
    expect(argus.reason, contains('sur fond #7F7F7F'));
    h.dispose();
  });

  testWidgets('5 · une opacité posée sur le texte l\'éclaircit', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle h = tester.ensureSemantics();
    await monter(
      tester,
      const Opacity(
        opacity: 0.5,
        child: Text(
          'Estompé',
          style: TextStyle(fontSize: 14, color: Colors.black),
        ),
      ),
    );
    final ArgusMesureContraste m = mesure(tester, 'Estompé');
    final Evaluation argus = await juger(tester);
    print('CAS 5 · résolu ${m.ratio?.toStringAsFixed(2)}:1 · ${argus.reason}');
    // Noir à 50 % sur blanc : ~#808080, soit ~3,95:1. Ignorée, l'opacité
    // laisserait du noir sur blanc, 21:1.
    expect(m.ratio, closeTo(3.95, 0.1));
    expect(argus.passed, isFalse);
    h.dispose();
  });

  testWidgets('6 · un Text.rich : la couleur la plus faible décide', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle h = tester.ensureSemantics();
    await monter(
      tester,
      const Text.rich(
        TextSpan(
          style: TextStyle(fontSize: 14, color: Colors.black),
          children: <InlineSpan>[
            TextSpan(text: 'Noir '),
            TextSpan(
              text: 'et gris',
              style: TextStyle(color: Color(0xFFBDBDBD)),
            ),
          ],
        ),
      ),
    );
    final Evaluation argus = await juger(tester);
    print('CAS 6 · ${argus.reason}');
    expect(argus.passed, isFalse);
    expect(argus.reason, contains('texte #BDBDBD'));
    h.dispose();
  });
}
