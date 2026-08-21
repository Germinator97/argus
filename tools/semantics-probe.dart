// Sonde — ce que Flutter fait RÉELLEMENT d'un `Semantics(identifier:)` selon
// son voisinage.
//
// Elle n'est PAS un garde et la CI ne l'exécute pas : elle demande un projet
// Flutter, que ce dépôt n'est pas. Elle est ici parce que trois tableaux chiffrés
// de la doc en sortent, et qu'un relevé sans le moyen de le refaire se périme en
// silence — le jour où Flutter change, la doc reste et plus rien ne la dément.
//
// Ce qu'elle a établi, et où ça vit :
//   · SKILL.md §2c — ce que l'absorption avale (le texte) et ce qui y survit
//     (les commandes) ; la recette à deux nœuds pour un écran-commande ;
//     la table de cohabitation Tooltip / MergeSemantics / ExcludeSemantics / Hero
//   · references/methodology-mobile.md §VISUAL — les 216 px d'écart selon le côté
//     du SafeArea où la racine est posée
//
// MESURÉ SUR : Flutter 3.32.0 (stable), le 21/08/2026.
// Les chiffres de la doc valent pour CETTE version. Pour les refaire — procédure
// exécutée telle quelle, pas rédigée de mémoire :
//
//   flutter create -e /tmp/argus_probe
//   cd /tmp/argus_probe
//   flutter pub add dev:flutter_test --sdk=flutter
//   mkdir -p test && cp <ce dépôt>/tools/semantics-probe.dart test/
//   flutter test test/semantics-probe.dart --reporter expanded
//
// Les trois lignes du milieu ne sont pas du zèle : `flutter create -e` ne pose ni
// `flutter_test` ni le dossier `test/`, et un nom de projet à tiret est refusé
// (paquet Dart : underscores). Chacune de ces trois-là a fait échouer la
// procédure une fois avant d'être écrite ici.
//
// Le premier test est un TÉMOIN, et c'est lui qui rend le reste lisible : sans
// lui, « identifier absent de l'arbre » ne distingue pas « Flutter l'a mangé »
// de « la sonde ne sait pas le lire ». S'il tombe, ne lis aucun autre chiffre.

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// Un nœud tel que la couche d'accessibilité l'expose.
class Releve {
  Releve(
    this.identifier,
    this.label,
    this.rect,
    this.actions,
    this.enfants,
    this.profondeur,
  );
  final String identifier;
  final String label;
  final Rect rect;
  final List<String> actions;
  final int enfants;
  final int profondeur;

  @override
  String toString() {
    final r =
        '${rect.left.toStringAsFixed(0)},${rect.top.toStringAsFixed(0)}'
        ' ${rect.width.toStringAsFixed(0)}x${rect.height.toStringAsFixed(0)}';
    return '${'  ' * profondeur}id="$identifier" label="$label" '
        'rect=$r actions=${actions.join("+")} enfants=$enfants';
  }
}

/// Parcourt l'arbre sémantique et rend chaque nœud, rect en coordonnées écran.
List<Releve> lire(WidgetTester tester) {
  final racine = tester.binding.pipelineOwner.semanticsOwner?.rootSemanticsNode;
  final out = <Releve>[];
  if (racine == null) return out;

  // `SemanticsNode.transform` va du nœud vers son PARENT, et il n'existe pas
  // d'équivalent de `getTransformTo` ici (vérifié dans les sources 3.32) : on
  // compose donc à la descente pour obtenir des coordonnées écran.
  void visiter(SemanticsNode n, int p, Matrix4 versEcran) {
    final propre = n.transform == null
        ? versEcran
        : (versEcran.clone()..multiply(n.transform!));
    final data = n.getSemanticsData();
    final actions = <String>[];
    for (final a in SemanticsAction.values) {
      if ((data.actions & a.index) != 0) actions.add(a.name);
    }
    out.add(
      Releve(
        n.identifier,
        n.label,
        MatrixUtils.transformRect(propre, n.rect),
        actions,
        n.childrenCount,
        p,
      ),
    );
    n.visitChildren((e) {
      visiter(e, p + 1, propre);
      return true;
    });
  }

  visiter(racine, 0, Matrix4.identity());
  return out;
}

void dump(String titre, List<Releve> noeuds) {
  // ignore: avoid_print
  print('\n─── $titre ───');
  for (final n in noeuds) {
    // ignore: avoid_print
    print(n);
  }
}

/// Y a-t-il un nœud portant cet identifier ?
Releve? parId(List<Releve> n, String id) {
  for (final x in n) {
    if (x.identifier == id) return x;
  }
  return null;
}

Widget page(Widget corps) => MaterialApp(home: Scaffold(body: corps));

void main() {
  late SemanticsHandle handle;
  setUp(
    () => handle = TestWidgetsFlutterBinding.ensureInitialized()
        .ensureSemantics(),
  );
  tearDown(() => handle.dispose());

  // ═════════════════════════════════════════════════════════════════════════
  // TÉMOIN — prouver que la sonde voit une ancre avant de lire ce qu'elle dit
  // d'un cas difficile. Sans lui, « identifier absent » ne distingue pas
  // « Flutter l'a mangé » de « ma sonde ne sait pas le lire ».
  // ═════════════════════════════════════════════════════════════════════════
  testWidgets('TÉMOIN — une ancre nue est lisible', (tester) async {
    await tester.pumpWidget(
      page(
        Semantics(
          identifier: 'temoin_root',
          container: true,
          explicitChildNodes: true,
          child: const Text('bonjour'),
        ),
      ),
    );
    final n = lire(tester);
    dump('témoin', n);
    expect(
      parId(n, 'temoin_root'),
      isNotNull,
      reason:
          'la sonde ne sait pas lire un identifier : tout le reste est ininterprétable',
    );
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POINT 1 — une racine d'écran qui est AUSSI une commande
  // ═════════════════════════════════════════════════════════════════════════
  group('point 1 — racine-commande', () {
    testWidgets('A. un seul nœud : ancre + onTap sur le même Semantics', (
      tester,
    ) async {
      await tester.pumpWidget(
        page(
          Semantics(
            identifier: 'player_root',
            container: true,
            explicitChildNodes: true,
            onTap: () {},
            child: GestureDetector(
              onTap: () {},
              child: const SizedBox.expand(child: Text('lecture')),
            ),
          ),
        ),
      );
      dump('1A — un seul nœud (ancre + action)', lire(tester));
    });

    testWidgets('B. deux nœuds : racine inerte + commande à l\'intérieur', (
      tester,
    ) async {
      await tester.pumpWidget(
        page(
          Semantics(
            identifier: 'player_root',
            container: true,
            explicitChildNodes: true,
            child: Semantics(
              identifier: 'player_toggle',
              container: true,
              button: true,
              onTap: () {},
              child: GestureDetector(
                onTap: () {},
                child: const SizedBox.expand(child: Text('lecture')),
              ),
            ),
          ),
        ),
      );
      dump('1B — deux nœuds (racine inerte + commande)', lire(tester));
    });

    testWidgets('C. la racine SANS explicitChildNodes absorbe-t-elle ?', (
      tester,
    ) async {
      await tester.pumpWidget(
        page(
          Semantics(
            identifier: 'player_root',
            container: true,
            onTap: () {},
            child: GestureDetector(
              onTap: () {},
              child: const SizedBox.expand(child: Text('lecture')),
            ),
          ),
        ),
      );
      dump('1C — sans explicitChildNodes', lire(tester));
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POINT 4 — cohabitation avec les autres producteurs de sémantique
  // ═════════════════════════════════════════════════════════════════════════
  group('point 4 — cohabitation', () {
    testWidgets('Tooltip — ancre DEHORS', (tester) async {
      await tester.pumpWidget(
        page(
          Center(
            child: Semantics(
              identifier: 'act_save',
              container: true,
              child: Tooltip(
                message: 'Enregistrer',
                child: IconButton(
                  icon: const Icon(Icons.save),
                  onPressed: () {},
                ),
              ),
            ),
          ),
        ),
      );
      dump('4 — Tooltip, ancre dehors', lire(tester));
    });

    testWidgets('Tooltip — ancre DEDANS (sur le bouton)', (tester) async {
      await tester.pumpWidget(
        page(
          Center(
            child: Tooltip(
              message: 'Enregistrer',
              child: Semantics(
                identifier: 'act_save',
                container: true,
                child: IconButton(
                  icon: const Icon(Icons.save),
                  onPressed: () {},
                ),
              ),
            ),
          ),
        ),
      );
      dump('4 — Tooltip, ancre dedans', lire(tester));
    });

    testWidgets('MergeSemantics — ancre DEDANS', (tester) async {
      await tester.pumpWidget(
        page(
          Center(
            child: MergeSemantics(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Semantics(
                    identifier: 'row_flag',
                    container: true,
                    child: const Icon(Icons.flag),
                  ),
                  const Text('Signalé'),
                ],
              ),
            ),
          ),
        ),
      );
      dump('4 — MergeSemantics, ancre dedans', lire(tester));
    });

    testWidgets('MergeSemantics — ancre DEHORS', (tester) async {
      await tester.pumpWidget(
        page(
          Center(
            child: Semantics(
              identifier: 'row_flag',
              container: true,
              child: MergeSemantics(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [Icon(Icons.flag), Text('Signalé')],
                ),
              ),
            ),
          ),
        ),
      );
      dump('4 — MergeSemantics, ancre dehors', lire(tester));
    });

    testWidgets('ExcludeSemantics — ancre DEDANS', (tester) async {
      await tester.pumpWidget(
        page(
          Center(
            child: ExcludeSemantics(
              child: Semantics(
                identifier: 'deco_badge',
                container: true,
                child: const Text('12'),
              ),
            ),
          ),
        ),
      );
      dump('4 — ExcludeSemantics, ancre dedans', lire(tester));
    });

    testWidgets('Hero — ancre dedans', (tester) async {
      await tester.pumpWidget(
        page(
          Center(
            child: Hero(
              tag: 'photo',
              child: Semantics(
                identifier: 'card_photo',
                container: true,
                child: const SizedBox(
                  width: 80,
                  height: 80,
                  child: Text('img'),
                ),
              ),
            ),
          ),
        ),
      );
      dump('4 — Hero, ancre dedans', lire(tester));
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // POINT 5 — la géométrie de la racine, et ce qu'elle cadre
  // ═════════════════════════════════════════════════════════════════════════
  group('point 5 — géométrie', () {
    Future<void> avecBarres(WidgetTester tester, Widget corps) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3.0;
      // Barre d'état 48 dp en haut, barre de gestes 24 dp en bas.
      tester.view.padding = const FakeViewPadding(top: 144, bottom: 72);
      tester.view.viewPadding = const FakeViewPadding(top: 144, bottom: 72);
      addTearDown(tester.view.reset);
      await tester.pumpWidget(corps);
    }

    testWidgets('racine AUTOUR du SafeArea', (tester) async {
      await avecBarres(
        tester,
        page(
          Semantics(
            identifier: 'home_root',
            container: true,
            explicitChildNodes: true,
            child: const SafeArea(
              child: SizedBox.expand(child: Text('contenu')),
            ),
          ),
        ),
      );
      final n = lire(tester);
      dump('5 — racine AUTOUR du SafeArea', n);
    });

    testWidgets('racine DEDANS le SafeArea', (tester) async {
      await avecBarres(
        tester,
        page(
          SafeArea(
            child: Semantics(
              identifier: 'home_root',
              container: true,
              explicitChildNodes: true,
              child: const SizedBox.expand(child: Text('contenu')),
            ),
          ),
        ),
      );
      final n = lire(tester);
      dump('5 — racine DEDANS le SafeArea', n);
    });
  });

  // ═══ absorption ═══
  Widget ecran({required bool explicite, required bool interactif}) => page(
    Semantics(
      identifier: 'x_root',
      container: true,
      explicitChildNodes: explicite,
      child: Column(
        children: [
          const Text('Titre'),
          const Text('Sous-titre'),
          if (interactif)
            TextButton(onPressed: () {}, child: const Text('Agir')),
        ],
      ),
    ),
  );

  testWidgets('texte nu — AVEC explicitChildNodes', (t) async {
    await t.pumpWidget(ecran(explicite: true, interactif: false));
    dump('texte nu · explicitChildNodes: true', lire(t));
  });
  testWidgets('texte nu — SANS explicitChildNodes', (t) async {
    await t.pumpWidget(ecran(explicite: false, interactif: false));
    dump('texte nu · explicitChildNodes: false', lire(t));
  });
  testWidgets('avec un bouton — SANS explicitChildNodes', (t) async {
    await t.pumpWidget(ecran(explicite: false, interactif: true));
    dump('avec bouton · explicitChildNodes: false', lire(t));
  });

  // ═══ recette retenue ═══
  testWidgets('recette retenue : racine inerte + commande étiquetée', (
    t,
  ) async {
    await t.pumpWidget(
      page(
        Semantics(
          identifier: 'player_root',
          container: true,
          explicitChildNodes: true,
          child: Semantics(
            identifier: 'player_toggle',
            container: true,
            button: true,
            label: 'Lecture ou pause',
            child: GestureDetector(
              onTap: () {},
              child: const SizedBox.expand(child: Text('00:42')),
            ),
          ),
        ),
      ),
    );
    dump('recette retenue', lire(t));
  });
}
