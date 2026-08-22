// Argus Mobile — l'instrumentation, prouvée sans device.
//
// POURQUOI CETTE SUITE EXISTE. Poser `Semantics(identifier: 'x')` ne garantit
// pas que `x` ARRIVE dans l'arbre sémantique. Un parent qui absorbe ses
// descendants, un identifiant posé sur un widget qui ne construit pas de nœud,
// un écran monté dans un état qui ne rend pas l'ancre : aucun de ces cas
// n'échoue à la compilation, et `flutter analyze` n'en dit rien.
//
// Sans cette suite, l'étape d'instrumentation se termine sur du code qu'on
// CROIT juste, et le défaut se découvre à l'étage 2 — sur device, sous la forme
// d'un flow entier qui échoue sans nommer sa cause, puisque du point de vue de
// Maestro l'élément a simplement disparu.
//
// Elle ne remplace pas l'étage 2 : elle prouve que l'ancre existe là où le
// widget est monté seul. Un écran peut encore la perdre dans l'app réelle, sous
// un parent qui fusionne — mais alors on aura éliminé la moitié des causes.
//
// À brancher dans test/argus/harness.dart : renseigne `anchor:` sur tes
// ArgusScreen. Rien à modifier dans ce fichier.

import 'package:flutter_test/flutter_test.dart';

import 'argus_harness.dart';

void main() {
  setUpAll(() async {
    await loadArgusFonts();
  });

  // Aucun écran branché : on le DIT plutôt que de ne rien déclarer. Une suite
  // vide se lit « tout va bien » ; une suite qui skippe avec sa raison se lit
  // « personne n'a encore branché ça ».
  if (argusScreens.isEmpty) {
    testWidgets(
      argusName('ancres non branchées'),
      (WidgetTester tester) async {},
      skip: argusShouldSkip,
    );
    return;
  }

  // ⚠️ Cette suite ne partage PAS `argusShouldSkip`. Ce garde-là couvre surtout
  // l'absence de polices réelles, qui invalide une mesure de disposition ou de
  // contraste — mais pas la présence d'un identifiant, qui n'en dépend
  // aucunement. Le partager rendrait cette suite muette sur tout projet n'ayant
  // pas encore déclaré ses fontes, c'est-à-dire précisément au moment où l'on
  // vient d'instrumenter et où l'on a le plus besoin de la preuve.
  final List<ArgusScreen> ancres = argusScreens
      .where((ArgusScreen s) => (s.anchor ?? '').isNotEmpty)
      .toList();

  // Des écrans, mais aucune ancre de RACINE : on le dit, plutôt que de boucler
  // sur une liste vide et de passer au vert — c'est exactement ainsi qu'un garde
  // cesse de garder sans prévenir.
  //
  // ⚠️ On ne SORT pas pour autant. Un écran peut légitimement n'avoir pas de
  // racine — une coquille d'application n'est pas un écran — tout en déclarant
  // des commandes, et ce sont elles qui restaient sans preuve. Sortir ici
  // rendrait la moitié utile de cette suite inatteignable précisément dans ce
  // cas-là.
  if (ancres.isEmpty) {
    test(
      'ancres de racine non déclarées — renseigne anchor: sur tes ArgusScreen '
      '(${argusScreens.length} écran(s) déclaré(s), 0 avec ancre)',
      () {},
      skip: 'aucun ArgusScreen ne porte d\'ancre de racine',
    );
  }

  test('les ancres de racine sont uniques', () {
    final Map<String, int> vues = <String, int>{};
    for (final ArgusScreen s in ancres) {
      vues[s.anchor!] = (vues[s.anchor!] ?? 0) + 1;
    }
    final Iterable<String> doublons = vues.entries
        .where((MapEntry<String, int> e) => e.value > 1)
        .map((MapEntry<String, int> e) => e.key);
    expect(
      doublons,
      isEmpty,
      reason:
          'Deux écrans partagent la même ancre de racine : un flow qui la '
          'cible ne saura pas où il a atterri. Les ancres de COMMANDE peuvent '
          'se répéter (lignes de liste, bouton présent dans deux états) ; '
          'celles de racine, non.',
    );
  });

  // ── Les ancres de COMMANDE ────────────────────────────────────────────────
  //
  // `anchor` est singulier, donc jusqu'ici seules les RACINES étaient prouvées.
  // Sur un projet réel, 55 ancres de commande n'avaient aucun endroit où être
  // déclarées — et c'est dans cet angle mort qu'un défaut s'était logé : une
  // ancre posée sur l'enveloppe d'un composant, le nœud tapable restant anonyme
  // en dessous. Rien ne rougissait, et le `tapOn` de Maestro marchait quand
  // même (il tape au centre du rect), si bien que seul TalkBack en souffrait.
  final List<ArgusScreen> avecCommandes = argusScreens
      .where((ArgusScreen s) => s.commands.isNotEmpty)
      .toList();

  if (avecCommandes.isEmpty) {
    test(
      'ancres de commande non déclarées — renseigne commands: sur tes ArgusScreen '
      '(${argusScreens.length} écran(s) déclaré(s), 0 avec commandes)',
      () {},
      skip:
          'aucun ArgusScreen ne déclare de commande : les boutons, champs et '
          'lignes que ciblent tes flows ne sont vérifiés NULLE PART',
    );
  }

  for (final ArgusScreen screen in avecCommandes) {
    testWidgets('commandes de « ${screen.id} » — ${screen.commands.length} ancre(s)', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpArgus(
        tester,
        screen.build(),
        viewport: argusViewports.first,
        debugLabel: screen.id,
      );

      for (final String commande in screen.commands) {
        final List<ArgusSemanticNode> noeuds = argusNodesById(tester, commande);

        expect(
          noeuds,
          isNotEmpty,
          reason:
              'L\'écran « ${screen.id} » ne porte aucun nœud sémantique '
              '« $commande ». Le flow Maestro qui le cible échouera sur device '
              'en disant que l\'élément a disparu — sans nommer la cause. '
              'Vérifie que l\'ancre est posée sur ce sous-arbre, que l\'écran '
              'est monté dans l\'état qui la rend, et qu\'aucun '
              '`ExcludeSemantics` ne la couvre (c\'est le seul voisin qui la '
              'fasse disparaître, sans erreur d\'aucune sorte).',
        );

        // Présente ne suffit pas : elle doit être posée sur la COMMANDE.
        //
        // Mesuré sur Flutter 3.32 — envelopper par l'extérieur ne donne pas le
        // même résultat selon le composant. `InkWell`, `ListTile` et
        // `TextField` fusionnent avec l'enveloppe, donc l'ancre porte l'action.
        // `IconButton` et `ElevatedButton`, eux, construisent leur propre nœud
        // frontière : l'ancre reste au-dessus, INERTE, et la commande vit en
        // dessous sans identifiant. Les deux se compilent, ne lèvent rien, et
        // ne se distinguent QUE par ce champ.
        final Iterable<ArgusSemanticNode> commandes = noeuds.where(
          (ArgusSemanticNode n) => n.isCommand,
        );
        expect(
          commandes,
          isNotEmpty,
          reason:
              'L\'ancre « $commande » de « ${screen.id} » est posée sur un '
              'nœud INERTE : il ne porte aucune action et ne déclare pas d\'état '
              'd\'activation. C\'est la signature d\'une enveloppe autour d\'un '
              'composant qui construit déjà son propre nœud — IconButton, '
              'ElevatedButton et la plupart des boutons d\'un design system. '
              'La vraie commande est un cran plus bas, sans identifiant : '
              'Maestro la tapera quand même (il vise le centre du rect), mais '
              'TalkBack annoncera un bouton anonyme et la dimension a11y le '
              'comptera comme tel. Pose l\'ancre sur l\'ENFANT que le composant '
              'reçoit (son `icon:`, son `child:`) plutôt qu\'autour de lui — '
              'mesuré : un seul nœud, qui porte l\'ancre, l\'action et le label.',
        );
      }

      handle.dispose();
    });
  }

  for (final ArgusScreen screen in ancres) {
    testWidgets('ancre « ${screen.anchor} » présente — ${screen.id}', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpArgus(
        tester,
        screen.build(),
        viewport: argusViewports.first,
        debugLabel: screen.id,
      );

      expect(
        find.bySemanticsIdentifier(screen.anchor!),
        findsOneWidget,
        reason:
            'L\'écran « ${screen.id} » se construit, mais aucun nœud '
            'sémantique ne porte l\'identifiant « ${screen.anchor} ». '
            'Trois causes, par ordre de fréquence : l\'ancre n\'est pas posée '
            'sur ce sous-arbre ; elle est posée sur un widget qui ne construit '
            'pas de nœud propre ; ou un parent l\'absorbe faute de '
            '`explicitChildNodes: true`. Tant que ce test est rouge, tout flow '
            'Maestro visant cet écran échouera sur device.',
      );

      // Trouver l'ancre ne suffit pas : sans `explicitChildNodes: true`, le
      // nœud EXISTE mais AVALE le texte de ses descendants. Le premier
      // `expect` passe alors, et le flow échoue quand même sur device.
      //
      // Le signal est le LABEL, pas le nombre d'enfants — mesuré : une racine
      // saine rend `children=2, label=""`, la même sans explicitChildNodes rend
      // `children=1, label="Bonjour"`. L'absorption est partielle : ce qui
      // porte déjà un Semantics garde son nœud, seul le texte nu est aspiré.
      // Compter les enfants ne voit donc rien ; lire le label, si.
      expect(
        tester.getSemantics(find.bySemanticsIdentifier(screen.anchor!)).label,
        isEmpty,
        reason:
            'La racine « ${screen.anchor} » a avalé le texte de ses '
            'descendants : son label devrait être vide, il porte le contenu de '
            'l\'écran. Ajoute `explicitChildNodes: true` à côté de '
            '`container: true`. Sans lui, ce nœud devient un bloc unique — et '
            'les commandes qu\'il contient cessent d\'être adressables. '
            '(Si tu as délibérément posé un `label:` sur cette racine, c\'est '
            'ce test qu\'il faut ajuster, pas l\'écran.)',
      );

      handle.dispose();
    });
  }
}
