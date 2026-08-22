// Sonde — ce que Flutter fait d'une ancre posée AUTOUR d'un composant qui
// construit déjà son propre nœud `Semantics`. C'est le cas dominant dès qu'un
// projet a un design system, et c'est celui où l'instrumentation échoue en
// silence : l'ancre est trouvable, le `tapOn` marche, et la commande est
// anonyme pour TalkBack.
//
// Elle n'est PAS un garde et la CI ne l'exécute pas : elle demande un projet
// Flutter, que ce dépôt n'est pas. Elle est ici parce que trois tableaux de la
// doc en sortent, et qu'un relevé sans le moyen de le refaire se périme en
// silence — le jour où Flutter change, la doc reste et plus rien ne la dément.
//
// Ce qu'elle a établi, et où ça vit :
//   · SKILL.md §2c — la table « enveloppé par l'extérieur » (qui fusionne, qui
//     pose une frontière), la table des trois remèdes, et le fait que
//     `tooltip:` laisse `label` vide
//   · test/argus/argus_harness.dart — le critère d'`ArgusSemanticNode.isCommand`,
//     qui sépare un bouton DÉSACTIVÉ (légitime) d'une enveloppe INERTE (le
//     défaut) : les deux ont `actions == 0`, seul `hasEnabledState` les distingue
//
// MESURÉ SUR : Flutter 3.32.0 (stable), le 22/08/2026.
// Pour la refaire — procédure exécutée telle quelle, pas rédigée de mémoire :
//
//   flutter create -e /tmp/argus_probe
//   cd /tmp/argus_probe
//   flutter pub add dev:flutter_test --sdk=flutter
//   mkdir -p test && cp <ce dépôt>/tools/design-system-probe.dart test/
//   flutter test test/design-system-probe.dart --reporter expanded
//
// Le premier test est un TÉMOIN, et c'est lui qui rend le reste lisible : sans
// lui, « ce nœud ne porte aucune action » ne distingue pas « Flutter les a
// séparés » de « la sonde ne sait pas lire les actions ». S'il tombe, ne lis
// aucun autre chiffre.

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

/// Un nœud tel que la couche d'accessibilité l'expose.
class Releve {
  Releve(
    this.id,
    this.label,
    this.tooltip,
    this.actions,
    this.enabledState,
    this.profondeur,
  );

  final String id;
  final String label;
  final String tooltip;
  final int actions;
  final bool enabledState;
  final int profondeur;

  bool get tapable => (actions & SemanticsAction.tap.index) != 0;

  @override
  String toString() =>
      '${'  ' * profondeur}id=${id.isEmpty ? '—' : id}  label="$label"'
      '${tooltip.isEmpty ? '' : '  tooltip="$tooltip"'}'
      '  actions=${actions == 0 ? 'AUCUNE' : (tapable ? 'tap' : '$actions')}'
      '  enabledState=$enabledState';
}

List<Releve> arbre(WidgetTester tester) {
  final List<Releve> out = <Releve>[];
  void visite(SemanticsNode node, int profondeur) {
    final SemanticsData data = node.getSemanticsData();
    out.add(
      Releve(
        data.identifier,
        data.label,
        data.tooltip,
        data.actions,
        data.hasFlag(SemanticsFlag.hasEnabledState),
        profondeur,
      ),
    );
    node.visitChildren((SemanticsNode enfant) {
      visite(enfant, profondeur + 1);
      return true;
    });
  }

  // `pipelineOwner` est déprécié depuis 3.10 mais reste le seul accès simple à
  // la racine de l'arbre. C'est acceptable ICI, dans une sonde jetable qui ne
  // part pas chez l'utilisateur ; le harnais livré, lui, passe par
  // `find.bySemanticsIdentifier` et `debugSemantics`.
  // ignore: deprecated_member_use
  final SemanticsNode? racine =
      tester.binding.pipelineOwner.semanticsOwner?.rootSemanticsNode;
  if (racine != null) visite(racine, 0);
  return out;
}

/// Monte [build] et imprime la partie utile de l'arbre — la profondeur 0 à 2
/// est le décor du `MaterialApp`, identique partout.
void cas(String nom, Widget Function() build) {
  testWidgets(nom, (WidgetTester tester) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: Center(child: build())),
      ),
    );
    await tester.pumpAndSettle();
    debugPrint(
      '\n=== $nom ===\n'
      '${arbre(tester).where((Releve r) => r.profondeur > 2).join('\n')}',
    );
    handle.dispose();
  });
}

void main() {
  testWidgets(
    'TÉMOIN — un Semantics nu porte son id, son label et son action',
    (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: Semantics(
                identifier: 'temoin',
                container: true,
                button: true,
                label: 'Témoin',
                child: GestureDetector(
                  onTap: () {},
                  child: const SizedBox(width: 48, height: 48),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final Releve n = arbre(tester).firstWhere((Releve r) => r.id == 'temoin');
      expect(
        n.label,
        'Témoin',
        reason: 'si le témoin tombe, ne lis aucun autre relevé',
      );
      expect(n.tapable, isTrue, reason: 'la sonde doit savoir lire une action');
      handle.dispose();
    },
  );

  // ── Enveloppé par l'EXTÉRIEUR : qui fusionne, qui pose une frontière ──────
  cas(
    'InkWell',
    () => Material(
      child: InkWell(
        onTap: () {},
        child: Semantics(
          identifier: 'cmd',
          child: const SizedBox(width: 80, height: 48, child: Text('Valider')),
        ),
      ),
    ),
  );
  cas(
    'InkWell — ancre AUTOUR',
    () => Semantics(
      identifier: 'cmd',
      child: Material(
        child: InkWell(
          onTap: () {},
          child: const SizedBox(width: 80, height: 48, child: Text('Valider')),
        ),
      ),
    ),
  );
  cas(
    'ListTile — ancre AUTOUR',
    () => Material(
      child: Semantics(
        identifier: 'cmd',
        child: ListTile(title: const Text('Ligne'), onTap: () {}),
      ),
    ),
  );
  cas(
    'TextField — ancre AUTOUR',
    () => Semantics(identifier: 'cmd', child: const TextField()),
  );
  cas(
    'IconButton — ancre AUTOUR',
    () => Semantics(
      identifier: 'cmd',
      child: IconButton(onPressed: () {}, icon: const Icon(Icons.add)),
    ),
  );
  cas(
    'ElevatedButton — ancre AUTOUR',
    () => Semantics(
      identifier: 'cmd',
      child: ElevatedButton(onPressed: () {}, child: const Text('Valider')),
    ),
  );

  // ── Les trois remèdes ────────────────────────────────────────────────────
  cas(
    'remède A — container+button+label AUTOUR (le piège)',
    () => Semantics(
      identifier: 'cmd',
      container: true,
      button: true,
      label: 'Ajouter',
      child: IconButton(onPressed: () {}, icon: const Icon(Icons.add)),
    ),
  );
  cas(
    'remède B — MergeSemantics autour de l\'enveloppe',
    () => MergeSemantics(
      child: Semantics(
        identifier: 'cmd',
        child: IconButton(onPressed: () {}, icon: const Icon(Icons.add)),
      ),
    ),
  );
  cas(
    'remède C — ancre sur l\'ENFANT reçu par le composant',
    () => IconButton(
      onPressed: () {},
      icon: Semantics(identifier: 'cmd', child: const Icon(Icons.add)),
    ),
  );

  // ── Le libellé : tooltip ne le remplit pas ───────────────────────────────
  cas(
    'tooltip seul — label reste vide',
    () => IconButton(
      onPressed: () {},
      tooltip: 'Ajouter',
      icon: Semantics(identifier: 'cmd', child: const Icon(Icons.add)),
    ),
  );
  cas(
    'tooltip + label explicite',
    () => IconButton(
      onPressed: () {},
      tooltip: 'Ajouter',
      icon: Semantics(
        identifier: 'cmd',
        label: 'Ajouter',
        child: const Icon(Icons.add),
      ),
    ),
  );

  // ── Désactivé contre inerte : les deux ont actions == 0 ──────────────────
  // C'est ce couple qui décide du critère d'`isCommand`. Juger sur `actions`
  // seul ferait rougir tout écran monté avec un bouton grisé.
  cas(
    'bouton DÉSACTIVÉ, ancre bien posée',
    () => ElevatedButton(
      onPressed: null,
      child: Semantics(identifier: 'cmd', child: const Text('Valider')),
    ),
  );
  cas(
    'enveloppe INERTE autour d\'un bouton actif',
    () => Semantics(
      identifier: 'cmd',
      container: true,
      button: true,
      label: 'Ajouter',
      child: IconButton(onPressed: () {}, icon: const Icon(Icons.add)),
    ),
  );
}
