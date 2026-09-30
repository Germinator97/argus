// Sonde du 591 — une cible tactile collée au bord d'une zone qui défile est
// MESURÉE ; seule une cible qu'un défilement coupe est dispensée.
//
// Elle n'est pas un garde de ce dépôt, qui n'est pas un projet Flutter : elle
// se joue dans un projet où le scaffold est installé, montée par
// `tools/cibles-probe.sh` — en CI (job `harness`) comme à la main.
//
// Chaque montage a son verdict écrit, pour la guideline du cadre ET pour celle
// de Flutter : là où Flutter reste aveugle, la sonde exige qu'il le soit encore
// — sinon le montage n'exercerait plus l'angle mort, et la sonde ne prouverait
// rien.
// ignore_for_file: avoid_print
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'argus/argus_harness.dart';

Widget petite() => SizedBox(
  width: 24,
  height: 24,
  child: InkWell(onTap: () {}, child: const Icon(Icons.pause, size: 16)),
);

Widget ample() => SizedBox(
  width: 48,
  height: 48,
  child: InkWell(onTap: () {}, child: const Icon(Icons.pause)),
);

/// Les montages : un nom, l'écran, et les verdicts attendus (cadre, Flutter).
final List<(String, Widget, bool, bool)>
montages = <(String, Widget, bool, bool)>[
  // Collée au bord haut-droit de la zone qui défile : Flutter la saute.
  (
    'bord',
    Scaffold(
      appBar: AppBar(title: const Text('bord')),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            petite(),
            const SizedBox(height: 1200, width: double.infinity),
          ],
        ),
      ),
    ),
    false,
    true,
  ),
  // Le cas courant : des rangées pleine largeur, qui touchent les deux côtés.
  (
    'liste',
    Scaffold(
      appBar: AppBar(title: const Text('liste')),
      body: ListView(
        children: <Widget>[
          for (int i = 0; i < 30; i++)
            SizedBox(
              height: 36,
              child: InkWell(onTap: () {}, child: Text('Rangée $i')),
            ),
        ],
      ),
    ),
    false,
    true,
  ),
  // La même petite cible, loin des bords : les deux la mesurent.
  (
    'milieu',
    Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: <Widget>[
            petite(),
            const SizedBox(height: 1200, width: double.infinity),
          ],
        ),
      ),
    ),
    false,
    false,
  ),
  // L'AUTRE MOITIÉ : une cible de 48 dp COUPÉE par le pli — 20 dp visibles.
  // La mesurer rendrait un faux défaut : elle reste dispensée.
  (
    'pli',
    Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: <Widget>[
            const SizedBox(height: 620, width: double.infinity),
            ample(),
            const SizedBox(height: 600),
          ],
        ),
      ),
    ),
    true,
    true,
  ),
  // Et sur l'autre axe : un carrousel qui coupe une cible au bord droit —
  // 58 dp par pas, la septième commence à 348 dp : 12 dp visibles.
  (
    'carrousel',
    Scaffold(
      body: Center(
        child: SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: <Widget>[
              for (int i = 0; i < 12; i++)
                Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: ample(),
                ),
            ],
          ),
        ),
      ),
    ),
    true,
    true,
  ),
  // Des cibles conformes collées aux bords : rien à redire.
  (
    'conforme',
    Scaffold(
      body: ListView(
        children: <Widget>[
          for (int i = 0; i < 30; i++)
            SizedBox(
              height: 56,
              child: InkWell(onTap: () {}, child: Text('Rangée $i')),
            ),
        ],
      ),
    ),
    true,
    true,
  ),
];

void main() {
  for (final (String nom, Widget ecran, bool cadrePasse, bool flutterPasse)
      in montages) {
    testWidgets('591 — $nom', (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final SemanticsHandle handle = tester.ensureSemantics();
      await tester.pumpWidget(MaterialApp(home: ecran));
      final Evaluation cadre = await argusAndroidTapTargetGuideline.evaluate(
        tester,
      );
      final Evaluation flutter = await androidTapTargetGuideline.evaluate(
        tester,
      );
      handle.dispose();
      print(
        'CAS $nom : cadre=${cadre.passed ? "passe" : "échoue"} · '
        'Flutter=${flutter.passed ? "passe" : "échoue"}',
      );
      expect(
        flutter.passed,
        flutterPasse,
        reason:
            '$nom : Flutter ne rend plus le verdict écrit — le montage '
            "n'exerce plus ce qu'il prétend",
      );
      expect(
        cadre.passed,
        cadrePasse,
        reason:
            '$nom : la guideline du cadre rend le mauvais verdict (591)\n'
            '${cadre.reason}',
      );
    });
  }
}
