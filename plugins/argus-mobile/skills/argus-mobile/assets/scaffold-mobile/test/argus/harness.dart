// ═══════════════════════════════════════════════════════════════════════════
// Argus Mobile — étage 1 : ce que TU renseignes. Rien d'autre.
// ARGUS:OWNED — à toi : l'installeur ne l'écrase ni ne le compare, jamais.
//
// C'EST LE FICHIER À ÉDITER pour brancher les gardes `flutter test` sur ton app.
// Les types (`argus_types.dart`) et la mécanique (`argus_harness.dart`) vivent
// à côté, appartiennent au plugin, et se mettent à jour toutes seules avec
// `install-mobile.sh --update`. Les suites (`anchors_test.dart`,
// `a11y_test.dart`, `layout_test.dart`) n'ont rien à modifier non plus.
// ═══════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

import 'argus_types.dart';

/// déclare les écrans à éprouver.
///
/// Un écran qui a besoin d'un BlocProvider, d'un repository ou d'un Provider se
/// construit ici avec ses doubles de test — le harnais ne devine pas tes
/// dépendances.
///
/// ⚠️ **Vérifie que l'écran ACCEPTE le provider que tu poses.** Un écran qui
/// résout lui-même sa dépendance — `GetIt`, un service locator, un provider
/// monté ailleurs dans l'app — ignore celui que tu places au-dessus : le tien
/// est masqué, et le montage lève au lieu de rendre l'écran.
///
/// Le symptôme observé est alors *une ancre manquante*, c'est-à-dire un
/// diagnostic qui accuse l'instrumentation pour un défaut de montage — sur un
/// projet réel, il a failli faire déplacer une déclaration d'ancre sur la foi
/// d'une mesure prise sous un montage cassé. Le tell est que l'exception tombe
/// au MONTAGE (`type 'Null' is not a subtype of type 'XCubit' in type cast`) et
/// non à l'assertion. Enregistre le double dans le conteneur, ou monte l'écran
/// par la voie qu'il emprunte vraiment.
///
///     final List<ArgusScreen> argusScreens = <ArgusScreen>[
///       ArgusScreen(
///         id: 'home',
///         anchor: 'home_root',
///         commands: <String>['home_start_session', 'home_settings'],
///         // Ce qu'un flow LIT sans y toucher : un compteur, une valeur. Le
///         // déclarer ici prouve sa présence sans exiger qu'il soit tapable.
///         displays: <String>['home_streak_value'],
///         // Et son pendant sous le pli, même règle que commandsAfterScroll.
///         displaysAfterScroll: <String>['home_footer_total'],
///         // Le bas d'une liste paresseuse : présent sur device après un
///         // défilement, jamais construit au gabarit de référence. Le déclarer
///         // ici le fait éprouver sur le plus grand gabarit, au lieu de le
///         // laisser rougir en permanence ou disparaître de toute vérification.
///         commandsAfterScroll: <String>['home_last_row'],
///         build: () => BlocProvider<HomeBloc>(
///           create: (_) => HomeBloc(repository: FakeHomeRepository()),
///           child: const HomeScreen(),
///         ),
///       ),
///       // Une COQUILLE n'est pas un écran : pas d'ancre, pas d'entrée dans
///       // screens[], et pourtant l'un des montages les plus rentables — sur un
///       // projet réel c'est elle qui portait le seul débordement visible à
///       // taille de texte nominale.
///       ArgusScreen(id: 'coquille', build: () => const AppShell()),
///     ];
///
/// Tant que cette liste est vide, les suites se marquent SKIPPÉES avec la
/// raison. Elles ne passent pas au vert : un garde qui ne garde rien est pire
/// qu'un garde absent, parce qu'il rassure.
final List<ArgusScreen> argusScreens =
    <ArgusScreen>[]; // TODO(argus): tes écrans

/// les polices du projet, recopiées de la section `fonts:` du
/// `pubspec.yaml` — une entrée par FAMILLE, avec ses fichiers.
///
/// ⚠️ SANS ELLES, AUCUNE MESURE DE DISPOSITION N'A DE VALEUR. La police par
/// défaut de `flutter_test` rend chaque glyphe dans un carré d'un cadratin : un
/// texte y est jusqu'à deux fois plus large qu'en Inter ou en Roboto, il replie
/// sur deux lignes, et le test déclare intenable une rangée qui tient très bien.
///
/// ⚠️ UNE FAMILLE PAR ENTRÉE. Une app sérieuse en a plusieurs — affichage,
/// texte courant, chiffres — et les enregistrer toutes sous un seul nom fausse
/// la mesure sans rien signaler : le texte serait rendu dans la mauvaise fonte,
/// à la mauvaise largeur, et le verdict porterait sur un écran qui n'existe pas.
///
/// ⚠️ Avec `google_fonts`, la famille n'est PAS le nom nu : c'est
/// `Famille_variante` (`Cinzel_700`, `CormorantGaramond_italic`). Un nom qui ne
/// correspond à rien retombe EN SILENCE sur la police de test — exactement le
/// défaut qu'on croyait écarter.
///
///     const Map<String, List<String>> argusFonts = <String, List<String>>{
///       'FamilleTexte': <String>['assets/fonts/texte/Texte-Variable.ttf'],
///       'FamilleChiffres': <String>['assets/fonts/chiffres/Chiffres-Variable.ttf'],
///     };
const Map<String, List<String>> argusFonts =
    <String, List<String>>{}; // TODO(argus): tes polices

/// la famille appliquée par défaut au thème de test — celle que
/// `ThemeData.fontFamily` porte dans l'app. DOIT être une clé de [argusFonts] :
/// un nom qui n'y figure pas retombe en silence sur la police de test.
const String argusFontFamily = ''; // TODO(argus): la famille par défaut

/// si ton app formate des dates ou des nombres localisés
/// (`DateFormat(…, 'fr_FR')`, pluriels `intl`), ajoute ici les delegates —
/// `flutter_localizations` doit alors être une dépendance du projet.
///
/// Un MaterialApp de test nu n'en a aucun : tout formatage localisé y lève
/// (`Locale data has not been initialized`) alors que l'app vraie ne voit rien,
/// puisqu'elle les porte. L'alternative sans dépendance est d'appeler
/// `initializeDateFormatting('fr_FR')` dans un `setUpAll`.
const List<LocalizationsDelegate<Object>> argusLocalizationsDelegates =
    <LocalizationsDelegate<Object>>[];

/// Locale imposée à la surface de test.
const Locale argusLocale = Locale('fr', 'FR');

/// le thème RÉEL de l'application.
///
/// ⚠️ SANS LUI, LE CONTRASTE NE PEUT PAS ÊTRE MESURÉ. Les widgets seraient
/// montés sur le thème Material par défaut, dont le fond est BLANC : sur une
/// app sombre, chaque texte clair y ressort autour de 1:1 et le garde rapporte
/// une dizaine de défauts qui n'existent pas. Mesurer un contraste sur le
/// mauvais fond est pire que ne pas le mesurer — ça remplit un rapport de bruit
/// et on cesse de le lire.
///
/// Tant qu'il vaut `null`, le garde de contraste se marque SKIPPÉ avec sa
/// raison ; les cibles tactiles et la disposition, elles, ne dépendent pas du
/// thème et continuent de mesurer.
///
///     ThemeData? argusTheme() => MonTheme.sombre();
///
/// ⚠️ Si ton app propose les DEUX thèmes, duplique le garde de contraste :
/// une couleur née sur les fonds sombres passe en sombre et échoue en clair,
/// et l'inverse est tout aussi vrai.
ThemeData? argusTheme() => null; // TODO(argus): le thème réel de l'app
