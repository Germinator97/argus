# Ce que le terrain a signalé et qui n'est pas encore traité

Ce fichier n'est pas une liste de souhaits : chaque entrée vient d'un projet
Flutter réel sur lequel le skill a été exercé, et décrit un endroit où il a
laissé décider sans instruction. Les points traités en sortent — ils sont dans
le skill, avec le commit qui les explique.

Une exception : un point **tranché contre l'hypothèse qu'on en avait** reste
ici, marqué ✅, avec la mesure qui l'a établi. Le retirer effacerait ce qui a le
plus de valeur : pas le correctif, mais la raison pour laquelle on cherchait au
mauvais endroit.

⚠️ **Les numéros ne se réutilisent pas et ne se resserrent pas.** Ils sont cités
par des messages de commit et par la page publiée du chantier ; renuméroter après
une clôture ferait pointer ces renvois sur autre chose. Un point qui sort laisse
son numéro vide.

Formulé sans jamais nommer les projets d'essai : ce dépôt est public.

## Écrit par un agent qui découvrait le skill — clos

Un agent sans connaissance du projet cible a appliqué l'étape 2 à partir du
skill seul. Il a produit une instrumentation plus complète que celle écrite à la
main auparavant — 49 ancres contre 7, 16 racines d'état contre 7 racines
d'écran — et a rendu **14 points de friction. Les quatorze sont clos**, les cinq
derniers le 21/08/2026 :

| # | Ce qu'il avait signalé | Ce qui l'a fermé |
|---|---|---|
| 1 | Une racine d'écran qui est aussi une commande | Recette à deux nœuds, mesurée sur Flutter 3.32 — plus la précision sur ce que l'absorption avale (le texte) et ce qui y survit (les commandes) |
| 2 | Le rapport d'instrumentation n'a pas de format | Forme littérale en §2b, et son sort tranché par mode : un finding `a11y` en EXPLORE/DEMO, un reste-à-faire bloquant en REGRESS |
| 3 | Le passage de témoin entre §2 et §3 | La table d'ancres devient un livrable de §2c-bis, réclamé par §3c |
| 4 | Cohabitation avec les autres producteurs de sémantique | Table mesurée : `ExcludeSemantics` fait disparaître l'ancre, `MergeSemantics` lui rétrécit le `rect` |
| 5 | La géométrie de la racine, pas seulement son absorption | 216 px d'écart selon le côté du `SafeArea` — soit l'horloge système dans la référence visuelle |

Ce que ces cinq-là avaient en commun : **aucun ne produit d'erreur**. Pas de
compilation cassée, pas d'avertissement d'analyse, pas d'exception. Ils
déplacent un `rect`, vident un nœud, ou perdent une liste — et le résultat est
toujours un rapport qui a l'air normal.

## Trouvé en exécutant l'étage 2 sur un device

### 7. ✅ Tranché le 21/08/2026 — l'app démarrait, le message accusait l'ancre
Deux flows sur six échouaient sur « l'ancre de départ n'est pas visible » alors
que le dump montrait l'ancre présente. Résolu **sans device**, en relisant les
artefacts du run — voici ce qui l'a établi, dans l'ordre :

1. les **six** flows assertent la même ancre ; quatre la trouvent. Une ancre
   fausse ou absente les ferait tomber tous les six ;
2. l'ancre est présente, en plein écran, dans le dump pris à l'instant de
   l'échec ;
3. la même assertion coûte 12 à 28 s **y compris quand elle réussit**, et
   500 ms séparent le pire succès du meilleur échec : c'est une course, pas un
   état binaire ;
4. décisif — dans un même flow, la 1ʳᵉ attente de cette ancre coûte
   **16 645 ms**, la 2ᵉ **79 ms**. L'écart n'est pas de la lecture d'arbre,
   c'est l'app qui démarre.

Le harnais chronométrait donc le démarrage à froid sans le savoir, et le jetait.
Corrigé : le relevé `startup` du rapport, un finding `QAM-START` quand le budget
`coldStartMs` est dépassé, et un message d'échec qui renvoie vers la mesure au
lieu de laisser accuser l'instrumentation.

⚠️ La leçon qui vaut au-delà d'ici : **le message d'échec nommait le sélecteur,
donc il désignait un coupable — et c'était le mauvais.** Un rapport qui n'a que
le symptôme envoie chercher là où il n'y a rien.

## Éprouvé sur device le 21/08/2026 — clos

Les trois derniers points ouverts demandaient tous un émulateur, et ont été
traités dans une seule session, sur un projet Flutter jetable — même montage,
même démarrage.

| # | Ce qu'on ne savait pas | Ce que la mesure a répondu |
|---|---|---|
| 8 | Les références visuelles n'avaient jamais été générées | Cycle complet éprouvé — génération, comparaison conforme, référence remplacée par un aplat (finding `visual`/`major`), restauration, retour au vert |
| 9 | `waitForAnimationToEnd` expire presque toujours : animation perpétuelle, ou critère trop strict ? | **Les deux.** ~3,1 s sur un écran où rien ne bouge (c'est le prix de deux captures), ~7,3 s avec un indicateur perpétuel — au-delà de son propre timeout de 5 s |
| 10 | Maestro interpole-t-il `${…}` dans `timeout:` ? | **Oui**, prouvé en faisant varier la valeur : 15 000 rend 15 192 ms, 1 000 rend 2 570 ms. L'injection retirée faute de preuve est rétablie |

⚠️ Deux instruments ont failli donner la réponse inverse, et c'est la partie à
retenir. `check-syntax` **accepte** `timeout: ${VAR}` — ce qui prouve que le
fichier parse, rien de plus. Et `commands.json` enregistre le texte **source**,
non substitué : le lire pour savoir si l'interpolation a eu lieu conclut qu'elle
n'a pas eu lieu. Seule la durée le dit, et seulement en faisant varier la valeur
entre deux runs — une mesure isolée à 1 000 ms a rendu 414 ms, sous la cible,
et se serait lue comme un succès.

⚠️ Le point 8 a rendu deux choses qu'on ne cherchait pas : le seuil visuel ne
peut pas monter à 100 (deux écrans recomparés sans changement de code
correspondent à 99,949 % et 99,870 % — aucun écran n'est pixel-parfait), et une
comparaison verte **ne prouve pas** que l'écran est déterministe : elle prouve
que ce qui bouge pèse moins que le seuil. Un indicateur qui tourne sans fin
passe à 99, en ne pesant que 0,13 % des pixels.

## Rendu par le run 2 — un second agent vierge, 21/08/2026 — clos

Le terrain a été **remis à neuf** (production du run 1 sauvegardée hors dépôt) et
le skill ré-appliqué de zéro par un agent sans contexte, quelques heures après la
clôture des dix premiers points. Il en a rendu **25**. Aucun ne figurait ici.

Les numéros repartent à 11 : ils ne se réutilisent pas.

⚠️ Marqués **[vérifié]** : je les ai reproduits moi-même dans le dépôt plutôt que
de les croire. Six sur six l'étaient. Les autres viennent de son rapport et
restent à confirmer.

Les vingt-cinq sont clos, le 22/08/2026, en dix passes. Un seul reste ici, parce
qu'il a été tranché **contre** l'hypothèse qu'on en avait.

| # | Ce qu'il avait signalé | Ce qui l'a fermé |
|---|---|---|
| 11 | `visualCropOn` et `dynamicRegions` : configuration morte | `visualCropOn` branché de bout en bout (`cropOn` sur la capture ET la comparaison) ; `dynamicRegions` retiré — Maestro n'a aucun masquage de pixels |
| 12 | `argus-anchors` ne prouve que les racines | `ArgusScreen.commands`, avec un critère mesuré : le nœud doit porter une action, ou déclarer un état d'activation |
| 13 | « le SEUL fichier à éditer » en nommait trois | La liste est **dérivée** des marqueurs et imprimée par l'installeur, avec les TODO restants |
| 14 | Le rapport d'instrumentation n'a pas de case pour les racines | Deux lignes de compteurs, la première pour les racines d'état |
| 15 | Aucun critère pour « instrumenté » | `Semantics(identifier:)` et lui seul. Un `semanticLabel:` n'est pas une ancre |
| 16 | Le composant qui porte déjà son `Semantics` | Table mesurée : qui fusionne, qui pose une frontière, et le seul remède qui donne un nœud unique |
| 17 | Écrans impossibles à monter seuls | `argusScreens` et `screens[]` ne sont pas en bijection — et le contenu d'une feuille modale se rend public |
| 18 | Écrans à animation perpétuelle | `pumpArgus` n'attend plus la stabilisation : durée bornée, puis avance fixe, en nommant l'écran |
| 19 | Un `ArgusScreen` sans ancre | Légitime, documenté, et la suite ne sort plus avant de l'atteindre |
| 20 | Que faire des défauts préexistants | `known_issues.dart`, assertée **dans les deux sens** |
| 21 | L'ancre dont la clé stable est la valeur affichée | Dériver de la valeur du modèle, jamais de la chaîne rendue |
| 22 | Un seuil face à un plancher assumé | `brandedSplashMs`, soustrait — pas un seuil relevé |
| 23 | Combien d'états déclarer | Règle d'arrêt en deux critères, et ce que `screensConfigured` compte vraiment |
| 24 | Un message d'instrumentation pour un défaut de scénario | L'ancre vue puis perdue est reconnue et le dit |
| 26 | `make argus` n'atteint jamais `argus-report` | Les dimensions sont enchaînées, le pire code retenu, le rapport toujours produit |
| 27 | `argus-doctor` sonde le mauvais `flutter` | La détection passe par le SDK du projet |
| 28 | `flutter build` sans `fvm` | Les docs pointent `make argus-build`, qui le dérive |
| 29 | `argus-a11y` mesure ce qui traîne | L'écran est **reconnu** par ses ancres, en quatre verdicts distincts |
| 30 | `argus-report` agrège des JSON périmés | Chaque part porte sa date, l'écart au-delà du budget est marqué |
| 31 | `model`/`os` déclarés sans objet | `null` quand `autoStart: false` |
| 32 | Le bloc i18n présume une app monétaire | Il vérifie un FORMAT dépendant de la locale, quel qu'il soit |
| 33 | Fusion du `.gitignore` sans règle | L'installeur écrit un bloc délimité et signé, idempotent |
| 34 | `allowSecretsIn` et les fichiers gitignorés | Une entrée qui ne dispense rien est signalée |
| 35 | `expectedPermissions` sur le manifeste fusionné | L'ordre est écrit là où la liste se remplit |
| §1 | Le dialogue de cadrage n'a pas eu lieu | Ce qui reste à trancher se **déclare** avant d'agir, garde-fous nommés |

**25. ✅ Tranché le 22/08/2026 — la boucle visuelle tournait, le message disait
le contraire.** Le relevé concluait que `make argus-visual` « ne fait pas de
régression visuelle ». Mesuré avant de corriger, par `--dry-run` : sur ses trois
exécutions Maestro, **deux portaient un `ARGUS_SCREEN_ID`** et comparaient bien
leur écran. Ce qui était vrai : la première incluait ET excluait le tag `visual`,
donc démarrait une JVM pour n'exécuter aucun flow, et la seule ligne qu'elle
imprimait était le skip du flow visuel. On lisait ce skip, on concluait que la
cible était inerte.

Gardé parce que ce qu'il enseigne n'est pas le correctif : **un symptôme observé
est presque toujours juste, le diagnostic qui l'accompagne beaucoup moins.**
Appliquer le remède demandé — « seul `argus-run` complet boucle » — aurait fait
ajouter une boucle qui existait déjà. Et corriger le vrai défaut a immédiatement
révélé son symétrique, que personne n'avait signalé : `--tags=smoke`, annoncé
comme le plus rapide, lançait la boucle visuelle entière.

## Rendu par le run 3 — un troisième agent vierge, 22/08/2026 — clos

Vingt et un points (36–56), traités en une passe. Onze avaient été reproduits
dans le dépôt avant d'être inscrits : onze confirmés, aucun démenti.

⚠️ **Ce que ce run a mesuré en creux.** Les deux runs précédents avaient posé
56 ancres en `Semantics(identifier:)` littéraux. Celui-ci en pose **56 aussi** —
mais 26 par **paramètre optionnel** de composant partagé, 30 en littéral. Même
volume, stratégie opposée, les deux viables. Le skill laisse ce choix ouvert, et
c'est mesuré plutôt que supposé.

⚠️ **Et ce qu'il ne pouvait pas voir** : le terrain n'appelle aucun backend.
Rien ici ne porte sur cette dimension — voir `chantiers-differes.md` § C.

### 43. ✅ Tranché le 22/08/2026 — le constat était juste, le diagnostic incomplet

Le run rapportait qu'`anchors_test` n'avait pas d'équivalent de
`known_issues.dart`, donc qu'un défaut préexistant y bloquait l'instrumentation
sans laisser de clé à inscrire. Exact. Mais **envelopper les assertions dans
`argusCheck` n'aurait rien changé** : le fichier portait aussi le défaut du
point 40 — aucune exception de montage n'était consommée, si bien que le test
mourait AVANT qu'`argusCheck` ne produise quoi que ce soit, sur le message
générique « Test failed. See exception logs above. ».

Le remède demandé aurait donc été posé, vérifié en relecture, et n'aurait rien
produit. C'est le drain qui rend la dette possible, et la dette qui rend le drain
utile — l'un sans l'autre ne garde rien.

⚠️ La leçon dépasse ce point : **un rapport décrit ce qu'il a vu, pas ce qui
l'empêche de le voir**. Le run avait constaté l'absence de clé sans pouvoir
savoir qu'une seconde cause la produisait aussi. Reproduire avant de corriger
n'est pas une précaution contre les rapports faux — celui-ci était juste — mais
contre les remèdes incomplets.

### Ce que la classe a rapporté au-delà des points

Le garde dérivé du point 36 — *poser le scaffold sur un projet neuf et exiger que
tout sorte en 0* — a trouvé ce qu'aucun run n'avait signalé : **la CI de ce dépôt
était elle-même rouge**. `flutter analyze test/argus`, une étape que le job
`harness` exécutait déjà, sortait en 1 sur un projet neuf. Invisible depuis
soixante-dix commits pour une raison simple : rien n'a jamais été poussé, donc le
workflow n'a jamais tourné une seule fois. **Un garde qui ne s'exécute pas est
indiscernable d'un garde qui passe.**

## Rendu par le run 4 — vérification, 22/08/2026 — clos

**Un run de VÉRIFICATION**, pas de découverte : même terrain remis à neuf, pour
contrôler que les vingt et un correctifs du run 3 avaient porté. Ils ont porté —
le run le constate un par un : `dart format` à zéro fichier, `analyze` sans un
mot, le jank « non conclu » plutôt que vert à 0 %, l'avertissement `deviceLocale`
sorti et juste, la dimension sécurité sautée sur un binaire debug, et surtout ces
deux-là que le harnais a dits **de lui-même** :

> ⚠️ ELLE EXISTE, mais plus bas que ce gabarit ne le montre.
> « … » figure dans known_issues.dart, mais l'écran PASSE. Retire cette ligne.

Étage 1 : **375 réussis / 0 échec**. Dette : 53 → **66 clés**, toutes des défauts
de l'application — dont **deux débordements à taille NOMINALE**, visibles par
tout le monde et sur n'importe quel appareil.

⚠️ **Trois agents, trois stratégies d'ancrage** pour le même projet : 56 ancres
littérales (run 2), 30 littérales + 26 par paramètre de composant (run 3), 34
littérales dont plusieurs interpolées (run 4). Le skill laisse ce choix
entièrement ouvert, et les trois marchent.

### 57. ✅ Corrigé le 22/08/2026 — le correctif du matin avait VIDÉ un garde

Rendre le cadrage visuel local (point 51) a refait la comparaison écran par
écran, mais a **laissé la condition globale** : `stamped !== visualCrop`. Avec un
cadrage global vide et des cadrages posés sur les écrans, elle valait
`'' !== ''` — l'avertissement ne sortait **jamais**, et l'échec suivant se lisait
comme une régression de l'application, exactement ce que le commentaire voisin
dit prévenir. Le run l'a mesuré : le fichier d'empreinte faisait **un octet**.

L'autre moitié était dans l'empreinte elle-même, qui gravait une seule chaîne
pour tout le dossier : deux écrans cadrés différemment rendaient la même valeur.
Elle est par écran désormais, en lisant l'ancien format comme « ce cadrage valait
pour tous ».

⚠️ **La leçon, et elle vaut plus que le correctif : un remède ne supprime pas
toujours un mode de panne, souvent il le DÉPLACE** — et le garde qui veillait sur
l'ancien passe au vert sans rien mesurer. C'est la cinquième façon pour un garde
de devenir vacant, et la seule qu'aucune relecture ne voit : il n'est pas né
vacant, il l'est devenu, le jour où on a corrigé autre chose.

⚠️ **Deux gardes écrits pour le fermer étaient eux-mêmes circulaires** : ils
réimplémentaient la décision dans le fichier de test, donc ils vérifiaient leur
propre copie et muter le code de production les laissait verts. C'est la mutation
qui l'a dit, jamais la relecture. La décision est extraite et exportée ; le test
de rétrocompatibilité lit un vrai fichier au lieu de fabriquer l'objet.

### 58. ✅ Corrigé le 22/08/2026 — `explicitChildNodes: true` sur un nœud commande plein écran rend l'ancre INERTE

Ajouté au §2c le matin même — « à défaut, `explicitChildNodes: true` sur le nœud
commande garde ses descendants distincts » — et il contredit une phrase du même
document : « Ne mets pas `onTap:` sur ce `Semantics` ». Les trois réglages,
mesurés sur deux écrans :

| Réglage | Résultat |
|---|---|
| `explicitChildNodes: false` | le nœud porte le tap **mais avale tout le texte de l'écran** |
| `explicitChildNodes: true` seul | descendants distincts, **ancre inerte** — `argus-anchors` rougit |
| `true` + `onTap:` sur le `Semantics` + `excludeFromSemantics: true` sur le geste | un seul nœud, ancré, actif, libellé ✅ |

La troisième voie manque, et l'interdiction du `onTap:` n'est vraie que quand le
nœud fusionne.

### 59. ✅ Corrigé le 22/08/2026 — Le bloc `.gitignore` ne couvre pas les diffs visuels

Un run visuel en échec écrit `<écran>_diff.png` **dans** le dossier des
références, volontairement versionné. `git status` le voit. Il manque
`/.maestro/_baselines/**/*_diff.png` dans le bloc géré par l'installeur.

### 60. ✅ Corrigé le 22/08/2026 — `argus-sec` exige la release, mais lit la clé qui sert à INSTALLER

`sec.mjs` lit `config.build.android` — la même clé qui décide de ce que le runner
**installe** sur l'appareil. Les deux usages tirent en sens inverse et il
n'existe aucun override (`parseArgs` n'accepte que `--platform` et
`--require-tools`). Conséquence directe du point 39 : depuis qu'un binaire debug
fait sauter la dimension, il faut pointer la release — donc éditer la config
entre deux runs. Il faut un chemin distinct pour l'analyse, ou un override.

### 61. ✅ Corrigé le 22/08/2026 — Taille et mémoire comparées à des budgets de RELEASE sur un build debug

`binarySizeMb` 117,5 contre un budget de 60 → finding `major`. La release du même
projet fait **32,1 Mo**, largement sous le seuil. La config avertit explicitement
pour les *permissions* (« dérive cette liste de la RELEASE, pas du debug ») ; la
même mise en garde manque pour la taille et la mémoire, qui sont pourtant les
deux métriques les plus sensibles au variant.

### 62. ✅ FAUX — le premier constat démenti en quatre runs

Le run rapportait que le compteur `TODO(argus)` inclut la prose qui explique le
marqueur. C'était vrai le matin, et **corrigé le matin même** (point 50) : la
mention est entre backticks et l'installeur compte `TODO(argus):`, avec le
deux-points qui sépare une directive d'une mention.

⚠️ **Gardé exprès, comme le 7 et le 25.** Sur dix-sept constats reproduits aux
runs 2 et 3, aucun n'avait été démenti. Celui-ci l'est, et il enseigne comment :
l'agent a lu la ligne 14 — exacte — et conclu sans lire **ce que l'installeur
compte**. Un constat juste sur la moitié qu'on regarde peut être faux sur celle
qu'on n'a pas regardée. Reproduire, toujours, y compris quand le rapporteur a eu
raison dix-sept fois.

## Rendu par le run 5 — vérification, 22/08/2026

Deuxième vérification d'affilée, sur le terrain remis à neuf. Les correctifs
57–61 ont porté, et le skill a été lu **depuis sa nouvelle racine** — la
restructuration en trois plugins tient. `argus-anchors` 30/30, `argus-guards`
375 passés, cycle visuel prouvé en trois temps, `visualCropOn` par écran employé,
`build.androidScan` utilisé pour scanner la release, jank « non conclu ».

⚠️ **Trois des six constats désignent les correctifs de la veille**, et c'est ce
qui rend cette passe utile : deux étaient **incomplets plutôt que faux** — ils
traitaient la moitié visible du problème — et le troisième n'avait jamais été
remonté du terrain au dépôt.

### 63. Le contrôle d'obfuscation ne discrimine RIEN

`sec.mjs` cherche `/package:[a-z_][a-z0-9_]*\/[a-z0-9_\/]+\.dart/` dans
`libapp.so`. Or `--obfuscate` n'efface jamais les chemins du **framework** :
`package:flutter/src/services/platform_channel.dart` survit à tout.

Mesuré dans les deux sens sur le même projet :

| build release | chemins du projet | verdict |
|---|---|---|
| **sans** `--obfuscate` | 42 | `QAM-SEC-OBFUS` major |
| **avec** `--obfuscate` | 0 | `QAM-SEC-OBFUS` major |

**Verdict identique.** Un contrôle de sécurité qui rend le même résultat quoi
qu'on fasse ne mesure rien — et il vit dans la dimension dont c'est précisément
le métier de ne pas rassurer à tort.

⚠️ Le commentaire juste au-dessus du motif dit ce que le code ne fait pas : « du
projet — qui varierait d'un projet à l'autre ». L'intention était juste, le motif
ne l'a jamais servie. Remède : ancrer sur `package:<nom du pubspec>/`.

### 64. `make argus` casse encore sa dimension a11y — le correctif du 44 était à moitié fait

La relance auto-correctrice posée au point 44 ne couvre que le cas « l'app est là
mais sur un écran inconnu ». Quand le paquet n'est **pas au premier plan du tout**
— ce que `argus-perf` produit en laissant l'app arrêtée —, un `process.exit(2)`
sort **avant** de l'atteindre.

⚠️ **Incomplet plutôt que faux.** Le correctif traitait la moitié du problème
qu'on avait sous les yeux, et rien ne signalait l'autre : le script refusait de
conclure, ce qui est le bon comportement, et masquait donc que la dimension ne
rendait rien dans le run agrégé.

### 65. Le correctif du 58 a CRÉÉ une contradiction dans le même paragraphe

La table ajoutée au §2c prescrit, pour une surface tapable plein écran :
`explicitChildNodes: true` **+** `onTap:` sur le `Semantics` **+**
`excludeFromSemantics: true`. Le paragraphe suivant, qui nomme explicitement
« tap-to-pause » — le même cas —, prescrit deux nœuds dont celui de commande
**sans** `explicitChildNodes`, et interdit le `onTap:`.

Ma tentative de lever la contradiction (« Dans CETTE forme ») explique *quand*
l'interdiction vaut, mais ne dit jamais **laquelle des deux recettes choisir**
pour le cas qui les concerne toutes les deux. Un lecteur applique la première
qu'il croise.

### 66. Un défaut du CADRE signalé par un run ne remonte pas tout seul

`argus_harness.dart:187` viole `prefer_single_quotes` — lint courant, qui fait
sortir `flutter analyze` en 1 sur un projet qui l'active. Le run 4 l'avait
signalé, et son agent l'avait patché **dans le terrain**. Le terrain a ensuite
été effacé pour le run 5, et le défaut est réapparu intact.

⚠️ **Le point 52, écrit le même jour, dit exactement quoi faire : « Dans les deux
cas, remonte-le, c'est ce qui empêche la divergence de s'installer. »** La règle
existait, elle était juste, et elle n'a pas été appliquée. Écrire la règle ne
fait pas le geste — et un terrain qu'on efface emporte tout ce qu'on n'a pas
remonté.

### 67. La CI livrée ne peut pas comparer les références visuelles

`.github/workflows/argus-mobile.yml` fige `api-level: 33`, `profile: pixel_6`,
`arch: x86_64`, **sans marqueur `ARGUS:OWNED`** — donc non éditable sans que
`--check` déclare le fichier en retard. Or le skill dit lui-même qu'une baseline
est liée au couple device + version d'OS. Des références nées sur un autre
émulateur ne correspondront jamais : la dimension visuelle sera rouge en
permanence en CI, pour une raison qui n'est pas une régression.

### 68. L'exemple d'assertion i18n est intenable sur Flutter

`i18n.yaml` propose `text: 'Bienvenue'`. Sur une app Flutter, l'attribut `text`
est **vide sur tous les nœuds** — seule l'horloge système en porte un — et le
libellé vit dans `accessibilityText`, où le sélecteur fait un match **complet**.
Un nœud ancré fusionne de surcroît le texte qu'il recouvre : `nav_history` rend
`'Historique\nHISTORIQUE'`. L'exemple livré échoue donc systématiquement, et
c'est le premier que quelqu'un copie.

### 69. `commands:` n'a aucun moyen de dire « atteignable après défilement »

Une ancre au bas d'une liste paresseuse n'existe pas au petit gabarit. Le harnais
sait maintenant le dire (point 42), mais les deux seules issues restent « suite
rouge en permanence » ou « la retirer, et plus rien ne la vérifie ». Il manque un
troisième état — `commandsAfterScroll:`, ou un gabarit de référence par écran.

## Ce qui reste

**Les points 63 à 69**, à traiter dans la session suivante.

Et ce que cinq runs ont établi, qui ne se périme pas : une passe trouve ce qui
manque, la suivante trouve ce que la correction a introduit **ou n'a pas
terminé**. Les runs 4 et 5 ont chacun désigné des correctifs de la veille — non
pas faux, mais **incomplets** : ils traitaient la moitié du problème qu'on avait
sous les yeux.
