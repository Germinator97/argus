// Sonde du 592 — un mot coupé entre deux lettres par un retour à la ligne est
// vu ; une coupure à une espace, après un trait d'union ou entre deux
// idéogrammes ne l'est pas.
//
// Elle n'est pas un garde de ce dépôt, qui n'est pas un projet Flutter : elle
// se joue dans un projet où le scaffold est installé, montée par
// `tools/mots-probe.sh` — en CI (job `harness`) comme à la main.
//
// Elle monte avec la police de `flutter_test` : chaque glyphe y fait un
// cadratin, donc chaque coupure tombe au même endroit sur tout poste. Elle
// n'affirme pas OÙ un mot se coupe, seulement QUE le cadre le voit — et, pour
// chaque cas légitime, que le texte passe bien à la ligne : sans quoi « rien
// n'est vu » ne prouverait rien.
// ignore_for_file: avoid_print
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'argus/argus_harness.dart';

/// Le nombre de lignes du paragraphe qui porte [texte].
int lignesDe(WidgetTester tester, String texte) {
  final RenderParagraph p = tester
      .renderObjectList<RenderParagraph>(find.byType(RichText))
      .firstWhere((RenderParagraph p) => p.text.toPlainText() == texte);
  return p
      .getBoxesForSelection(
        TextSelection(baseOffset: 0, extentOffset: texte.length),
      )
      .map((TextBox b) => b.top.round())
      .toSet()
      .length;
}

Future<void> monter(
  WidgetTester tester,
  double largeur,
  String texte, {
  String? ancre,
}) async {
  final Widget libelle = SizedBox(width: largeur, child: Text(texte));
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: ancre == null
              ? libelle
              : Semantics(identifier: ancre, container: true, child: libelle),
        ),
      ),
    ),
  );
}

void main() {
  // Les mots coupés : chacun DOIT être vu. Le nombre n'est coupé qu'une fois,
  // juste après son point — 3 cadratins tiennent dans 45 dp, pas 4 — : c'est
  // la frontière de mot d'ICU qui le voit, pas un filtre sur les lettres.
  for (final (String nom, double largeur, String texte)
      in <(String, double, String)>[
        ('mot', 40, "D'accord"),
        ('nombre', 45, '12.340'),
      ]) {
    testWidgets('592 — $nom : un mot coupé est vu', (
      WidgetTester tester,
    ) async {
      await monter(tester, largeur, texte);
      final List<String> coupes = argusMotsCoupes(tester);
      print('CAS $nom : ${lignesDe(tester, texte)} lignes · coupé=$coupes');
      expect(
        coupes,
        hasLength(1),
        reason: '$nom : un mot coupé doit être vu (592)',
      );
      // La contre-épreuve de l'angle mort : l'ancien garde ne le voyait pas.
      expect(
        argusTruncatedTexts(tester),
        isEmpty,
        reason:
            '$nom : le montage tronque au lieu de couper : il ne mesure plus le 592',
      );
    });
  }

  // Les coupures légitimes : chaque texte DOIT passer à la ligne, puis rien
  // ne doit être vu.
  for (final (String nom, double largeur, String texte)
      in <(String, double, String)>[
        ('espaces', 110, 'Bonjour tout le monde'),
        ('trait', 90, 'vingt-trois'),
        // Coupée juste après son point, là où une URL se coupe : 8 cadratins
        // tiennent dans 120 dp, pas 9.
        ('ponctuation', 120, 'exemple.com'),
        // Trois idéogrammes par ligne : « テキ / スト » tombe DANS un mot d'ICU —
        // c'est l'exclusion de l'écriture qui l'écarte, pas la frontière.
        ('cjk', 45, '日本語のテキストです'),
      ]) {
    testWidgets('592 — $nom : une coupure légitime n\'est pas un mot coupé', (
      WidgetTester tester,
    ) async {
      await monter(tester, largeur, texte);
      final int lignes = lignesDe(tester, texte);
      final List<String> coupes = argusMotsCoupes(tester);
      print('CAS $nom : $lignes lignes · coupé=$coupes');
      expect(
        lignes,
        greaterThan(1),
        reason:
            '$nom : le texte ne passe plus à la ligne, le cas ne prouve rien',
      );
      expect(
        coupes,
        isEmpty,
        reason: '$nom : coupure légitime prise pour un mot coupé (592)',
      );
    });
  }

  testWidgets('592 — un mot coupé sous un repli déclaré est écarté', (
    WidgetTester tester,
  ) async {
    await monter(tester, 40, "D'accord", ancre: 'sonde_repli');
    expect(
      argusMotsCoupes(tester),
      hasLength(1),
      reason: 'sans déclaration, le mot coupé doit être vu',
    );
    expect(
      argusMotsCoupes(tester, repliesParConception: <String>{'sonde_repli'}),
      isEmpty,
      reason:
          'un repli déclaré doit être écarté, comme pour la troncature (592)',
    );
    print('CAS repli : écarté sous ancre déclarée');
  });
}
