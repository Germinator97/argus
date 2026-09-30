// Sonde du 593 — une locale que les délégués du montage ne prennent pas en
// charge est REFUSÉE avec sa raison, au lieu de se lire en « débordement » sur
// chaque écran.
//
// Elle n'est pas un garde de ce dépôt, qui n'est pas un projet Flutter : elle
// se joue dans un projet où le scaffold est installé, montée par
// `tools/locale-probe.sh` — en CI (job `harness`) comme à la main.
//
// Le verdict attendu est connu cas par cas, et il est double : ce que FLUTTER
// signale au montage, et ce que le cadre refuse. Les deux doivent coïncider —
// un refus qui ne suivrait pas Flutter couperait des suites saines, ou en
// laisserait passer qui liront l'avertissement comme un débordement.
// ignore_for_file: avoid_print
import 'package:flutter/cupertino.dart'
    show CupertinoLocalizations, DefaultCupertinoLocalizations;
import 'package:flutter/foundation.dart'
    show FlutterExceptionHandler, SynchronousFuture;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'argus/argus_harness.dart';

/// Un délégué qui prend le français en charge, et rien d'autre.
class _Francais<T> extends LocalizationsDelegate<T> {
  const _Francais(this.valeur);
  final T valeur;
  @override
  bool isSupported(Locale locale) => locale.languageCode == 'fr';
  @override
  Future<T> load(Locale locale) => SynchronousFuture<T>(valeur);
  @override
  bool shouldReload(_Francais<T> old) => false;
}

const List<LocalizationsDelegate<Object?>> aucun =
    <LocalizationsDelegate<Object?>>[];
const List<LocalizationsDelegate<Object?>> complets =
    <LocalizationsDelegate<Object?>>[
      _Francais<MaterialLocalizations>(DefaultMaterialLocalizations()),
      _Francais<CupertinoLocalizations>(DefaultCupertinoLocalizations()),
      _Francais<WidgetsLocalizations>(DefaultWidgetsLocalizations()),
    ];
const List<LocalizationsDelegate<Object?>> sansCupertino =
    <LocalizationsDelegate<Object?>>[
      _Francais<MaterialLocalizations>(DefaultMaterialLocalizations()),
      _Francais<WidgetsLocalizations>(DefaultWidgetsLocalizations()),
    ];

/// Ce que Flutter signale en montant cette locale avec ces délégués.
Future<bool> flutterSignale(
  WidgetTester tester,
  Locale locale,
  List<LocalizationsDelegate<Object?>> delegues,
) async {
  final List<String> signales = <String>[];
  final FlutterExceptionHandler? precedent = FlutterError.onError;
  FlutterError.onError = (FlutterErrorDetails d) =>
      signales.add('${d.exception}');
  try {
    await tester.pumpWidget(
      MaterialApp(
        locale: locale,
        supportedLocales: <Locale>[locale],
        localizationsDelegates: delegues.isEmpty ? null : delegues,
        home: const SizedBox(),
      ),
    );
  } finally {
    // Rendu AVANT toute assertion : un `expect` qui échouerait pendant le
    // détournement ferait geler le fichier de test sans un mot.
    FlutterError.onError = precedent;
  }
  return signales.any(
    (String s) => s.contains('is not supported by all of its localization'),
  );
}

void main() {
  test('593 — le refus nomme chaque type sans délégué, et lui seul', () {
    expect(
      argusLocaleNonPriseEnCharge(const Locale('fr', 'FR'), aucun),
      containsAll(<String>['CupertinoLocalizations', 'MaterialLocalizations']),
      reason: 'fr_FR sans délégué doit être refusée, types nommés (593)',
    );
    expect(
      argusLocaleNonPriseEnCharge(const Locale('fr', 'FR'), sansCupertino),
      <String>['CupertinoLocalizations'],
      reason: 'le seul type sans délégué doit être nommé, seul (593)',
    );
    // L'AUTRE MOITIÉ : refuser à tort couperait toutes les suites d'un projet.
    expect(
      argusLocaleNonPriseEnCharge(const Locale('en', 'US'), aucun),
      isEmpty,
      reason: "l'anglais est pris en charge par les délégués par défaut (593)",
    );
    expect(
      argusLocaleNonPriseEnCharge(const Locale('fr', 'FR'), complets),
      isEmpty,
      reason: 'des délégués qui prennent fr en charge doivent suffire (593)',
    );
  });

  // Le verdict de Flutter est ÉCRIT pour chaque cas : l'accord avec une
  // vérité qu'on ne connaîtrait pas ne prouverait rien.
  const List<(String, Locale, List<LocalizationsDelegate<Object?>>, bool)> cas =
      <(String, Locale, List<LocalizationsDelegate<Object?>>, bool)>[
        ('fr_FR sans délégué', Locale('fr', 'FR'), aucun, true),
        ('fr_FR sans Cupertino', Locale('fr', 'FR'), sansCupertino, true),
        ('en_US sans délégué', Locale('en', 'US'), aucun, false),
        ('fr_FR complet', Locale('fr', 'FR'), complets, false),
      ];
  for (final (
        String nom,
        Locale locale,
        List<LocalizationsDelegate<Object?>> delegues,
        bool flutterAttendu,
      )
      in cas) {
    testWidgets('593 — $nom : le cadre refuse ce que Flutter signale', (
      WidgetTester tester,
    ) async {
      final bool signale = await flutterSignale(tester, locale, delegues);
      final bool refuse = argusLocaleNonPriseEnCharge(
        locale,
        delegues,
      ).isNotEmpty;
      print('CAS $nom : Flutter signale=$signale · le cadre refuse=$refuse');
      expect(
        signale,
        flutterAttendu,
        reason: '$nom : Flutter ne signale plus ce que la sonde attend',
      );
      expect(
        refuse,
        signale,
        reason: '$nom : le cadre et Flutter ne disent pas la même chose (593)',
      );
    });
  }
}
