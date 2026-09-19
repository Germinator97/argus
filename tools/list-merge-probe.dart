// Sonde — CE QUI FUSIONNE le nœud d'une ancre posée dans une carte, et ce qui
// ne le fusionne pas.
//
// Elle n'est PAS un garde et la CI ne l'exécute pas : elle demande un projet
// Flutter, que ce dépôt n'est pas. Elle est ici parce qu'un diagnostic est
// revenu du terrain et qu'elle l'a démenti — et qu'un relevé sans le moyen de
// le refaire se périme en silence.
//
// 🔴 CE QU'ELLE A ÉTABLI (534, run 94). Un run avait rapporté que `ListView`
// enveloppe chaque ligne dans un `IndexedSemantics` qui fusionne son sous-arbre,
// et qu'aucun des trois remèdes du skill ne tient. Le symptôme était réel ; le
// diagnostic ne l'était pas :
//
//   carte NON tapable, hors liste              noeud 400x600  ✖ fusionné
//   carte NON tapable, DANS un ListView        noeud 400x92   ✖ fusionné
//   carte TAPABLE,     DANS un ListView        noeud  65x20   ✔
//   + container:true sur le lien               noeud  65x20   ✔ le remède du §2c
//   le même, DANS un ListView                  noeud  65x20   ✔
//
// La liste n'y est pour rien : ce qui fusionne est l'ABSENCE de frontière
// sémantique autour du lien. Le remède que le SKILL prescrit — `container: true`
// plus `explicitChildNodes` — tient, y compris dans une liste, parce qu'un
// `GestureDetector` ne déclare aucun rôle. C'est sur un composant qui en déclare
// un que le même drapeau rend l'ancre inerte, et le §2c le dit déjà.
//
// MESURÉ SUR : Flutter 3.32.0 (stable), le 19/09/2026.
// Pour le refaire — procédure exécutée telle quelle, pas rédigée de mémoire :
//
//   flutter create -e /tmp/argus_probe534
//   cd /tmp/argus_probe534
//   flutter pub add dev:flutter_test --sdk=flutter
//   mkdir -p test && cp <ce dépôt>/tools/list-merge-probe.dart test/
//   flutter test test/list-merge-probe.dart --reporter expanded
//
// ⚠️ Le rect qui compte est celui du NŒUD, pas celui du widget : `find.by
// SemanticsIdentifier` rend l'élément qui PORTE le nœud, donc sous une fusion
// c'est déjà l'ancêtre. Comparé à lui-même, il ne dit jamais rien — c'est ce
// qui avait fait passer une première version du garde d'étage 1 pour verte.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const String kId = 'sonde';

/// Le lien qu'on veut ancrer : petit, en coin de carte, avec son propre geste.
Widget lien({bool ancreDedans = false, bool conteneur = false}) {
  final Widget etiquette = const SizedBox(
    width: 65,
    height: 20,
    child: Text('Détails', maxLines: 1),
  );
  // Deux placements : l'ancre AUTOUR du geste, ou DANS le geste (recette 400).
  if (ancreDedans) {
    return GestureDetector(
      onTap: () {},
      child: Semantics(identifier: kId, button: true, child: etiquette),
    );
  }
  return Semantics(
    identifier: kId,
    container: conteneur,
    explicitChildNodes: conteneur,
    child: GestureDetector(onTap: () {}, child: etiquette),
  );
}

/// La carte qui porte le lien. `tapable` met un geste sur TOUTE la carte.
Widget carte({
  required bool tapable,
  bool ancreDedans = false,
  bool explicite = false,
  bool conteneur = false,
}) {
  final Widget corps = Padding(
    padding: const EdgeInsets.all(12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const Text('Commande n° 42', maxLines: 1),
        const Text('Rue des Livreurs', maxLines: 1),
        Align(
          alignment: Alignment.centerRight,
          child: lien(ancreDedans: ancreDedans, conteneur: conteneur),
        ),
      ],
    ),
  );
  final Widget dedans = explicite
      ? Semantics(explicitChildNodes: true, child: corps)
      : corps;
  if (!tapable) return Card(child: dedans);
  return Card(
    child: InkWell(onTap: () {}, child: dedans),
  );
}

Widget ecran(Widget contenu) => MaterialApp(
  home: Scaffold(body: SizedBox(width: 400, height: 600, child: contenu)),
);

/// Le rect que Maestro recevrait, et celui du widget réellement ancré.
({Rect noeud, Rect widget})? mesurer(WidgetTester tester) {
  final Iterable<Element> porteurs = tester.elementList(
    find.bySemanticsIdentifier(kId),
  );
  if (porteurs.isEmpty) return null;
  final RenderObject? vise = porteurs.first.renderObject;
  if (vise is! RenderBox || !vise.hasSize) return null;
  final Rect duNoeud = vise.localToGlobal(Offset.zero) & vise.size;

  final Iterable<RenderBox> ancres = tester
      .elementList(
        find.byWidgetPredicate(
          (Widget w) => w is Semantics && w.properties.identifier == kId,
        ),
      )
      .map((Element e) => e.renderObject)
      .whereType<RenderBox>()
      .where((RenderBox b) => b.hasSize);
  if (ancres.isEmpty) return null;
  Rect? duWidget;
  for (final RenderBox b in ancres) {
    final Rect r = b.localToGlobal(Offset.zero) & b.size;
    if (r.isEmpty) continue;
    if (duWidget == null ||
        r.width * r.height < duWidget.width * duWidget.height) {
      duWidget = r;
    }
  }
  if (duWidget == null) return null;
  return (noeud: duNoeud, widget: duWidget);
}

void relever(WidgetTester tester, String cas) {
  final m = mesurer(tester);
  if (m == null) {
    debugPrint('SONDE534 | ${cas.padRight(46)} | ANCRE INTROUVABLE');
    return;
  }
  final bool centreDedans = m.widget.contains(m.noeud.center);
  debugPrint(
    'SONDE534 | ${cas.padRight(46)} | '
    'noeud ${m.noeud.width.toStringAsFixed(0)}x${m.noeud.height.toStringAsFixed(0)} | '
    'widget ${m.widget.width.toStringAsFixed(0)}x${m.widget.height.toStringAsFixed(0)} | '
    'centre ${centreDedans ? "DANS le lien  ✔" : "HORS du lien  ✖"}',
  );
}

void main() {
  testWidgets('534 — qui fusionne le lien ?', (WidgetTester tester) async {
    final SemanticsHandle handle = tester.ensureSemantics();

    // 1. Témoin : le lien seul, aucune liste, aucune carte.
    await tester.pumpWidget(ecran(Center(child: lien())));
    relever(tester, '1. temoin — le lien seul');

    // 2. Une carte NON tapable, hors liste.
    await tester.pumpWidget(ecran(carte(tapable: false)));
    relever(tester, '2. carte non tapable, hors liste');

    // 3. La MÊME carte, dans un ListView. Seule la liste change.
    await tester.pumpWidget(
      ecran(ListView(children: <Widget>[carte(tapable: false)])),
    );
    relever(tester, '3. carte non tapable, DANS un ListView');

    // 4. Carte TAPABLE hors liste : le geste englobant, sans la liste.
    await tester.pumpWidget(ecran(carte(tapable: true)));
    relever(tester, '4. carte TAPABLE, hors liste');

    // 5. Le cas du terrain : carte tapable dans un ListView.
    await tester.pumpWidget(
      ecran(ListView(children: <Widget>[carte(tapable: true)])),
    );
    relever(tester, '5. carte TAPABLE, DANS un ListView  <- le terrain');

    // 6. Le même, avec `explicitChildNodes` sur le corps de la carte.
    await tester.pumpWidget(
      ecran(
        ListView(children: <Widget>[carte(tapable: true, explicite: true)]),
      ),
    );
    relever(tester, '6. + explicitChildNodes sur le corps');

    // 7. Le même, ancre posée DANS le geste du lien (recette du 400).
    await tester.pumpWidget(
      ecran(
        ListView(children: <Widget>[carte(tapable: true, ancreDedans: true)]),
      ),
    );
    relever(tester, '7. + ancre DANS le geste du lien');

    // 8. Les deux à la fois.
    await tester.pumpWidget(
      ecran(
        ListView(
          children: <Widget>[
            carte(tapable: true, ancreDedans: true, explicite: true),
          ],
        ),
      ),
    );
    relever(tester, '8. + ancre dans le geste ET explicitChildNodes');

    // 9. ListView.builder, la forme que le run a mesurée.
    await tester.pumpWidget(
      ecran(
        ListView.builder(
          itemCount: 3,
          itemBuilder: (BuildContext c, int i) => i == 0
              ? carte(tapable: true, ancreDedans: true)
              : const SizedBox(height: 80),
        ),
      ),
    );
    relever(tester, '9. ListView.builder + ancre dans le geste');

    // 10. LE REMÈDE que le skill prescrit, et que l'agent a écrit dans le code
    //     du terrain : `container: true` + `explicitChildNodes` sur un geste nu.
    await tester.pumpWidget(ecran(carte(tapable: false, conteneur: true)));
    relever(tester, '10. carte non tapable + container:true sur le lien');

    await tester.pumpWidget(
        ecran(ListView(children: <Widget>[carte(tapable: false, conteneur: true)])));
    relever(tester, '11. le meme, DANS un ListView');

    handle.dispose();
  });
}
