// Sonde du 589 — un texte que l'application replie PAR CONCEPTION est écarté du
// garde de troncature, et DIT ; un texte tronqué hors déclaration le reste.
//
// Elle n'est pas un garde de ce dépôt, qui n'est pas un projet Flutter : elle
// se joue dans un projet où le scaffold est installé, montée par
// `tools/replis-probe.sh` — en CI (job `harness`) comme à la main.
//
// Le verdict est CONNU d'avance : deux textes tronqués, dont un seul sous une
// ancre déclarée. Sans déclaration, les deux doivent l'être — sinon le montage
// ne tronque rien, et la sonde ne mesurerait rien.
// ignore_for_file: avoid_print
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'argus/argus_harness.dart';

const String texteLong =
    'Un texte bien trop long pour tenir en deux lignes dans une colonne étroite, '
    'qui continue, continue et continue encore bien au-delà de ce qui tient.';

void main() {
  testWidgets('589 — replié par conception : écarté, et dit', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 140,
            child: Column(
              children: <Widget>[
                Semantics(
                  identifier: 'sonde_repliee',
                  container: true,
                  child: const Text(
                    texteLong,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const Text(
                  texteLong,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );

    // D'abord que le montage monte ce qu'il prétend : deux textes tronqués.
    expect(
      argusTruncatedTexts(tester),
      hasLength(2),
      reason:
          'le montage ne tronque pas ses deux textes : la sonde ne mesurerait rien',
    );

    const Set<String> replis = <String>{'sonde_repliee'};
    expect(
      argusTruncatedTexts(tester, repliesParConception: replis),
      hasLength(1),
      reason:
          'un texte replié par conception compte encore comme tronqué (589)',
    );

    final List<String> dits = argusCollapsedTexts(tester, replis);
    expect(
      dits,
      hasLength(1),
      reason: 'le texte écarté n\'est pas rendu : le garde le tairait (589)',
    );
    expect(
      dits.single,
      startsWith('sonde_repliee · '),
      reason: 'le texte écarté n\'est pas dit avec son ancre (589)',
    );
    // L'autre moitié : une ancre qui n'est pas déclarée n'écarte rien.
    expect(
      argusTruncatedTexts(
        tester,
        repliesParConception: <String>{'autre_ancre'},
      ),
      hasLength(2),
      reason: 'une ancre non déclarée écarte un texte (589)',
    );
    print(
      'CAS replié par conception : écarté et dit — « ${dits.single.substring(0, 30)}… »',
    );
  });
}
