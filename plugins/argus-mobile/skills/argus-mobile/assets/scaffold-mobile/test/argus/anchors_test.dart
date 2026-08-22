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
      argusDrainMountException(tester);

      for (final String commande in screen.commands) {
        final List<ArgusSemanticNode> noeuds = argusNodesById(tester, commande);

        // ⚠️ ABSENTE et SOUS LE PLI rendent le même vide sur ce gabarit, et le
        // message accuserait alors l'instrumentation pour un défaut qui n'existe
        // pas. Une commande au bas d'une liste paresseuse n'est simplement pas
        // construite ici. Mesuré sur un projet réel : quatre ancres déclarées
        // « absentes » au petit gabarit, TOUTES présentes et actives au grand.
        //
        // On ne raisonne donc pas : on remonte l'écran plus haut et on regarde.
        // Rendre discernable coûte moins cher que déduire.
        String indicePli = '';
        if (noeuds.isEmpty && argusViewports.length > 1) {
          await pumpArgus(
            tester,
            screen.build(),
            viewport: argusViewports.last,
            debugLabel: screen.id,
          );
          argusDrainMountException(tester);
          if (argusNodesById(tester, commande).isNotEmpty) {
            indicePli =
                '\n\n⚠️ ELLE EXISTE, mais plus bas que ce gabarit ne le montre : '
                'présente et construite sur ${argusViewports.last.name}, absente '
                'sur ${argusViewports.first.name}. Ce n\'est PAS un défaut '
                'd\'instrumentation — c\'est une liste paresseuse qui ne '
                'construit pas ce qu\'elle n\'affiche pas. DÉPLACE-LA dans '
                '`commandsAfterScroll:` : elle y sera éprouvée sur le grand '
                'gabarit, au lieu de rougir ici en permanence — ou de sortir de '
                '`commands:` et de n\'être plus vérifiée nulle part.';
          }
          // Remonter sur le gabarit de référence : ce qui suit le mesure.
          await pumpArgus(
            tester,
            screen.build(),
            viewport: argusViewports.first,
            debugLabel: screen.id,
          );
          argusDrainMountException(tester);
        }

        await argusCheck('${screen.id} · commande « $commande » présente', () async {
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
                'fasse disparaître, sans erreur d\'aucune sorte).$indicePli',
          );
        });

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
        await argusCheck('${screen.id} · commande « $commande » active', () async {
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
        });
      }

      handle.dispose();
    });
  }

  // ── Les ancres d'AFFICHAGE : présentes, et légitimement inertes ───────────
  //
  // Un compteur, une valeur, un état lus par un flow sans être touchés. Déclarés
  // en `commands:`, ils échouent sur « nœud INERTE » — un message qui décrit un
  // défaut là où l'inertie est voulue. Retirés, plus rien ne prouve qu'ils
  // existent. On prouve donc leur PRÉSENCE, et rien d'autre.
  final List<ArgusScreen> avecAffichages = argusScreens
      .where((ArgusScreen s) => s.displays.isNotEmpty)
      .toList();

  for (final ArgusScreen screen in avecAffichages) {
    testWidgets(
      'affichages de « ${screen.id} » — ${screen.displays.length} ancre(s)',
      (WidgetTester tester) async {
        final SemanticsHandle handle = tester.ensureSemantics();
        await pumpArgus(
          tester,
          screen.build(),
          viewport: argusViewports.first,
          debugLabel: screen.id,
        );
        argusDrainMountException(tester);

        for (final String affichage in screen.displays) {
          final List<ArgusSemanticNode> noeuds = argusNodesById(
            tester,
            affichage,
          );

          await argusCheck(
            '${screen.id} · affichage « $affichage » présent',
            () async {
              expect(
                noeuds,
                isNotEmpty,
                reason:
                    'L\'écran « ${screen.id} » ne porte aucun nœud sémantique '
                    '« $affichage ». Un flow qui le LIT échouera sur device en '
                    'disant que l\'élément a disparu, sans nommer la cause.',
              );
            },
          );

          // ⚠️ L'AUTRE MOITIÉ. Sans elle, `displays:` deviendrait l'endroit où
          // l'on range les ancres qui rougissent — une permission permanente
          // sous un autre nom.
          await argusCheck(
            '${screen.id} · « $affichage » est bien un AFFICHAGE',
            () async {
              expect(
                noeuds.where((ArgusSemanticNode n) => n.isCommand),
                isEmpty,
                reason:
                    'L\'ancre « $affichage » de « ${screen.id} » est déclarée comme un '
                    'affichage, mais elle porte une action ou un état d\'activation. '
                    'Remonte-la dans `commands:`, où sa présence ET son activité '
                    'seront prouvées.',
              );
            },
          );
        }

        handle.dispose();
      },
    );
  }

  // ── Le troisième état : atteignable APRÈS défilement ──────────────────────
  //
  // Une ancre au bas d'une liste paresseuse n'existe pas au gabarit de
  // référence. Elle n'avait que deux issues, toutes deux mauvaises : rester dans
  // `commands:` et rendre la suite rouge en permanence, ou en sortir et n'être
  // plus vérifiée nulle part — alors que des flows la ciblent. On l'éprouve donc
  // là où elle est construite, sur le PLUS GRAND gabarit.
  final List<ArgusScreen> apresDefilement = argusScreens
      .where((ArgusScreen s) => s.commandsAfterScroll.isNotEmpty)
      .toList();

  if (apresDefilement.isNotEmpty && argusViewports.length < 2) {
    test(
      'commandsAfterScroll déclaré, mais un seul gabarit pour en juger',
      () {},
      skip:
          'ce troisième état se mesure en comparant deux gabarits : sans un '
          'second, « absente ici » et « absente partout » se confondent',
    );
  }

  for (final ArgusScreen screen
      in argusViewports.length < 2 ? <ArgusScreen>[] : apresDefilement) {
    testWidgets('commandes après défilement de « ${screen.id} » — '
        '${screen.commandsAfterScroll.length} ancre(s)', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();

      for (final String commande in screen.commandsAfterScroll) {
        // Le grand gabarit d'abord : c'est là qu'elle doit exister.
        await pumpArgus(
          tester,
          screen.build(),
          viewport: argusViewports.last,
          debugLabel: screen.id,
        );
        argusDrainMountException(tester);
        final bool presenteEnGrand = argusNodesById(
          tester,
          commande,
        ).isNotEmpty;

        await pumpArgus(
          tester,
          screen.build(),
          viewport: argusViewports.first,
          debugLabel: screen.id,
        );
        argusDrainMountException(tester);
        final bool presenteEnPetit = argusNodesById(
          tester,
          commande,
        ).isNotEmpty;

        await argusCheck(
          '${screen.id} · commande « $commande » présente après défilement',
          () async {
            expect(
              presenteEnGrand,
              isTrue,
              reason:
                  'L\'ancre « $commande » de « ${screen.id} » est déclarée '
                  'atteignable après défilement, mais elle n\'existe sur AUCUN '
                  'gabarit — pas même ${argusViewports.last.name}. Ce n\'est '
                  'donc pas un pli : l\'ancre n\'est pas posée, ou l\'écran ne '
                  'la construit pas dans cet état.',
            );
          },
        );

        // ⚠️ L'AUTRE MOITIÉ, ET ELLE COMPTE AUTANT. Sans elle, cette liste
        // survivrait à ce qu'elle décrit : une ancre remontée au-dessus du pli
        // resterait déclarée « après défilement » pour toujours, et cesserait
        // d'être éprouvée là où elle est désormais — une permission permanente,
        // la forme la plus courante de dette qui s'installe.
        await argusCheck(
          '${screen.id} · « $commande » est bien SOUS le pli',
          () async {
            expect(
              presenteEnPetit,
              isFalse,
              reason:
                  'L\'ancre « $commande » de « ${screen.id} » est déclarée dans '
                  '`commandsAfterScroll:`, mais elle est construite dès '
                  '${argusViewports.first.name}. La déclaration est périmée : '
                  'remonte-la dans `commands:`, où elle sera éprouvée sur le '
                  'gabarit de référence comme les autres.',
            );
          },
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
      argusDrainMountException(tester);

      await argusCheck('${screen.id} · ancre de racine présente', () async {
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
      });

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
