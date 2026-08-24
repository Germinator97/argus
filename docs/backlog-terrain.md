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

### 63. ✅ Corrigé le 22/08/2026 — Le contrôle d'obfuscation ne discriminait RIEN

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

**Corrigé.** Le motif est ancré sur `pubspec.yaml → name:` — lu sur le disque, pas
recopié depuis `app.name`, qui vaut encore `mon_app` sur un projet dont personne
n'a édité cette ligne. Et la survivance des chemins du framework, qui était la
cause du défaut, devient la **contre-épreuve d'instrument** : sans un seul
`package:flutter/…` dans `libapp.so`, on ne conclut pas — c'est la lecture qui a
échoué, pas le binaire qui est propre. Quatre gardes tiennent les deux sens, plus
un qui prouve le **câblage** du pubspec : les autres passent le nom en argument,
donc aucun ne verrait le jour où `auditApk` cesserait d'aller le lire.

### 64. ✅ Corrigé le 22/08/2026 — `make argus` cassait sa dimension a11y : le correctif du 44 ne partait JAMAIS

La relance auto-correctrice posée au point 44 ne couvre que le cas « l'app est là
mais sur un écran inconnu ». Quand le paquet n'est **pas au premier plan du tout**
— ce que `argus-perf` produit en laissant l'app arrêtée —, un `process.exit(2)`
sort **avant** de l'atteindre.

⚠️ **Incomplet plutôt que faux.** Le correctif traitait la moitié du problème
qu'on avait sous les yeux, et rien ne signalait l'autre : le script refusait de
conclure, ce qui est le bon comportement, et masquait donc que la dimension ne
rendait rien dans le run agrégé.

**Corrigé — et le constat était en dessous de la vérité.** La relance ne couvrait
pas « un cas sur deux » : elle ne partait **jamais**. Sa condition testait
`!opts.screen`, or le défaut de `--screen` n'est pas la chaîne vide mais
`'écran courant'` — donc `!opts.screen` valait `false` à chaque `make argus-a11y`,
qui ne la passe pas. Une valeur sentinelle non vide avait vidé la condition
au moment même où on l'écrivait, et rien ne pouvait le dire : le script sortait
avec le message honnête d'une dimension qui ne conclut pas.

Trois gestes : la décision est **extraite et exportée** (`relaunchDecision`) au
lieu de vivre en ligne dans `main()` ; le refus « pas au premier plan » passe
**après** la relance, si bien que le seul état d'où l'on pouvait se rattraper
cesse d'être le seul qui n'y arrivait pas ; et la seconde lecture devient une
boucle bornée par le budget d'attente du harnais, parce qu'une app qu'on
**démarre** traverse son splash — un dump pris pendant décrirait l'entrée, pas
l'écran. Elle s'arrête dès que deux lectures coïncident, pour ne pas coûter le
budget entier à un projet dont les ancres ne sont pas encore posées.

Six gardes, dont un qui branche la décision sur la valeur que `parseArgs` produit
**vraiment** — la tester sur `''` aurait re-signé le défaut — et un qui vérifie
l'**ordre** des deux blocs dans la source.

### 65. ✅ Corrigé le 22/08/2026 — Le correctif du 58 avait CRÉÉ une contradiction dans le même paragraphe

La table ajoutée au §2c prescrit, pour une surface tapable plein écran :
`explicitChildNodes: true` **+** `onTap:` sur le `Semantics` **+**
`excludeFromSemantics: true`. Le paragraphe suivant, qui nomme explicitement
« tap-to-pause » — le même cas —, prescrit deux nœuds dont celui de commande
**sans** `explicitChildNodes`, et interdit le `onTap:`.

Ma tentative de lever la contradiction (« Dans CETTE forme ») explique *quand*
l'interdiction vaut, mais ne dit jamais **laquelle des deux recettes choisir**
pour le cas qui les concerne toutes les deux. Un lecteur applique la première
qu'il croise.

**Corrigé — et la bonne réponse était qu'il n'y a pas à choisir.** Les deux
prescriptions ne s'opposent pas, elles se **composent** : l'une dit COMBIEN de
nœuds (deux — une racine inerte, une commande), l'autre dit COMMENT écrire le
nœud commande **selon ce qu'il recouvre**. Une surface tapable plein écran relève
des deux à la fois. Le §2c porte désormais le critère en une question — « ce nœud
recouvre-t-il du contenu que quelqu'un doit entendre ? » — et l'exemple de code,
qui montrait le cas plein écran avec la recette du petit bouton, a été aligné sur
sa propre table.

⚠️ **Ce qui rendait la contradiction crédible des deux côtés : l'interdiction du
`onTap:` n'a pas deux versions, elle a un interrupteur.** Tant que le nœud
fusionne, le geste fournit l'action et la doubler crée deux nœuds tapables ; dès
qu'`explicitChildNodes: true` coupe la fusion, l'action ne remonte plus et il faut
la lui donner. Énoncée sans nommer l'interrupteur, la règle se lit comme deux
prescriptions inverses pour le même écran.

⚠️ Et ce qui a été **ajouté** est marqué comme tel : les trois lignes de l'exemple
composent deux mesures existantes, elles ne viennent pas d'un troisième relevé.
Le label de la forme d'origine n'a jamais été mesuré, et le document le dit
maintenant plutôt que de laisser croire le contraire.

### 66. ✅ Corrigé le 22/08/2026 — Un défaut du CADRE signalé par un run ne remontait pas tout seul

`argus_harness.dart:187` viole `prefer_single_quotes` — lint courant, qui fait
sortir `flutter analyze` en 1 sur un projet qui l'active. Le run 4 l'avait
signalé, et son agent l'avait patché **dans le terrain**. Le terrain a ensuite
été effacé pour le run 5, et le défaut est réapparu intact.

⚠️ **Le point 52, écrit le même jour, dit exactement quoi faire : « Dans les deux
cas, remonte-le, c'est ce qui empêche la divergence de s'installer. »** La règle
existait, elle était juste, et elle n'a pas été appliquée. Écrire la règle ne
fait pas le geste — et un terrain qu'on efface emporte tout ce qu'on n'a pas
remonté.

**Corrigé, et pas seulement la ligne.** Remonter le défaut ne vaut que s'il ne
peut plus redescendre : `tools/bench.sh` lance désormais une seconde analyse avec
cinq lints courants que `flutter_lints` n'active pas — c'est **exactement** ce
trou qui rendait le défaut invisible d'ici tout en le rendant fatal chez celui
qui les active. Le relevé est **total** : les cinq règles sur tout `test/argus`
n'ont rendu qu'**une** occurrence, celle du run 5, et rien d'autre. Contre-épreuve
faite : la double quote réintroduite fait rougir l'étape.

### 67. ✅ Corrigé le 22/08/2026 — La CI livrée ne pouvait pas comparer les références visuelles

`.github/workflows/argus-mobile.yml` fige `api-level: 33`, `profile: pixel_6`,
`arch: x86_64`, **sans marqueur `ARGUS:OWNED`** — donc non éditable sans que
`--check` déclare le fichier en retard. Or le skill dit lui-même qu'une baseline
est liée au couple device + version d'OS. Des références nées sur un autre
émulateur ne correspondront jamais : la dimension visuelle sera rouge en
permanence en CI, pour une raison qui n'est pas une régression.

**Corrigé en deux moitiés, parce qu'une seule n'aurait couvert que le cas où le
projet accepte le défaut du scaffold.**

1. **La CI dérive son émulateur de `devices[]`** d'argus.mobile.yaml
   (`api-level` ← `os`, `profile` ← `model`). Il n'y a donc plus rien à éditer,
   et le conflit avec `--check` disparaît de lui-même plutôt que d'être arbitré.
   `target` et `arch` restent figés : ce sont des choix de runner, pas des
   propriétés de l'appareil que le projet déclare.
2. **Le runner grave l'appareil à côté des références** (`.argus-device`) et
   avertit quand le run tourne sur un autre — même mécanisme que l'estampille de
   cadrage, et pour la même raison : sans lui, l'échec se lit comme une
   régression de l'app. L'empreinte est **lue sur l'appareil**, jamais recopiée
   de la config : `devices[].model` dit ce que le projet a écrit, pas ce sur quoi
   le run tourne. Le NOM (AVD, udid) n'entre pas dans la comparaison — il change
   d'une machine à l'autre pour un modèle identique, et crier là-dessus
   apprendrait à ignorer l'avertissement.

⚠️ **Le step de CI rendait 0 sur une config illisible**, ce qu'aucune relecture
n'aurait vu : le code de sortie d'un `run:` est celui de sa DERNIÈRE commande, et
le `cat` final avalait l'échec du `node`. Mesuré en extrayant le step du YAML et
en le jouant tel que GitHub le lira, sur trois configs — nominale, `os` vide,
aucun device Android. Avec `set -euo pipefail` : 0, 2, 2.

⚠️ **Et ce correctif a cassé une heure plus tard, sur la config que le skill
produit LUI-MÊME.** Le scaffold prescrit de laisser `model`/`os` **vides** dès
qu'on cible un `avd` nommé — le cas recommandé, donc le plus fréquent — et le
step échouait dessus : job rouge sur une config saine. Trouvé en préparant le run
6, en relisant la config du run 5, jamais par un test. `ciEmulator()` distingue
maintenant trois issues au lieu de deux : renseigné → dérivé ; **vide → défauts
du workflow, et le journal le dit** ; mal formé → échec. Cinq gardes, et le
commentaire de `argus.mobile.yaml` qui conseillait de les laisser vides a été
réécrit — il craignait un rapport comparant du déclaré à du mesuré, ce que
`deviceStamp` a rendu caduc le jour même.

⚠️ **Reste ouvert, et c'est un constat NEUF** : `.maestro/_baselines/<id>` est
indexé par l'`id` DÉCLARÉ du device (`android-emu`), pas par l'appareil réel.
Deux appareils différents partagent donc le même dossier — l'avertissement du
point 2 le dit maintenant, mais ne l'empêche pas. Voir `docs/chantiers-differes.md`.

### 68. ✅ Corrigé le 22/08/2026 — L'exemple d'assertion i18n était intenable sur Flutter

`i18n.yaml` propose `text: 'Bienvenue'`. Sur une app Flutter, l'attribut `text`
est **vide sur tous les nœuds** — seule l'horloge système en porte un — et le
libellé vit dans `accessibilityText`, où le sélecteur fait un match **complet**.
Un nœud ancré fusionne de surcroît le texte qu'il recouvre : `nav_history` rend
`'Historique\nHISTORIQUE'`. L'exemple livré échoue donc systématiquement, et
c'est le premier que quelqu'un copie.

**Corrigé — mais PAS par le remède qui semblait suivre du constat.** Écrire
`accessibilityText:` était ma première lecture ; `maestro check-syntax` le
**refuse** (« Unknown Property », mesuré sur 2.8.0, où seuls `text`, `id`, `css`
et `traits` passent). Livré tel quel, il aurait fait rougir l'étape « Syntaxe des
flows » du workflow qu'on livre — un remède qui casse la CI pour corriger un
exemple. Le symptôme était juste, le remède ne l'était pas, et c'est la mesure
qui les a séparés.

Ce qui casse vraiment est le **match complet** : le sélecteur porte sur le nœud
entier, donc `text: 'Bienvenue'` ne trouve que si le nœud ne contient QUE ce mot.
Les cinq sélecteurs du scaffold sont désormais encadrés — `'(?s).*…​.*'`, le
`(?s)` étant nécessaire pour franchir le saut de ligne du texte fusionné.

⚠️ **Et la même cause vidait un garde, ce que le constat ne disait pas.** Le
`assertNotVisible` des clés de traduction non résolues portait un motif nu : il
ne pouvait matcher aucun nœud, donc il **passait quoi qu'il y ait à l'écran**.
Trois formes muettes au total — `assertNotVisible` toujours vert, `tapOn` +
`optional: true` qui ne tape rien — contre une seule bruyante, l'`assertVisible`
qu'on avait sous les yeux. Un garde total exige maintenant l'encadrement de tout
sélecteur `text:`, exemples commentés compris, puisque c'est ce qu'on décommente.

### 69. ✅ Corrigé le 22/08/2026 — `commands:` n'avait aucun moyen de dire « atteignable après défilement »

Une ancre au bas d'une liste paresseuse n'existe pas au petit gabarit. Le harnais
sait maintenant le dire (point 42), mais les deux seules issues restent « suite
rouge en permanence » ou « la retirer, et plus rien ne la vérifie ». Il manque un
troisième état — `commandsAfterScroll:`, ou un gabarit de référence par écran.

**Corrigé : `commandsAfterScroll:` existe.** L'ancre y est éprouvée sur le plus
grand gabarit, là où la liste construit ce qu'elle affiche. L'indice de pli, qui
proposait jusqu'ici deux mauvaises issues, l'y renvoie.

⚠️ **L'autre moitié compte autant, et c'est elle qui empêche la dette de
s'installer** : une ancre déclarée « après défilement » mais construite dès le
gabarit de référence fait ÉCHOUER le test, avec la consigne de la remonter dans
`commands:`. Sans ça, la liste survivrait à ce qu'elle décrit et deviendrait une
permission permanente.

⚠️ **La suite du banc ne l'exerçait PAS** — `argusScreens` y est vide, donc la
nouvelle boucle ne tournait jamais et le vert ne prouvait rien. Armée par une
sonde jetable (une `ListView.builder` de 30 lignes de 120 dp), elle a été
vérifiée dans les **trois** sens : une ancre sous le pli passe, une ancre visible
dès le petit gabarit échoue sur la moitié « périmée », une ancre inexistante
échoue sur la moitié « présente ».

## Run 6 — la deuxième vérification d'affilée, et la première qui exerce les correctifs

Sixième run en aveugle, sur le terrain remis à neuf. **Neuf flows sur neuf
`COMPLETED`**, 33 tests d'ancres, 401 gardes d'étage 1, `flutter analyze` sans
issue, 175 tests du projet sans régression.

⚠️ **Ce run est le premier à EXERCER les correctifs de la passe 63–69 sur un
vrai projet, et les trois qui pouvaient l'être ont tenu :**

- **63** — le scan de la release a rendu **76 chemins `package:monapp/….dart`
  lisibles dans `libapp.so`**. Le contrôle discrimine donc sur un vrai binaire,
  là où il rendait le même verdict dans les deux sens.
- **67** — l'empreinte gravée à côté des références est
  `{"model":"sdk_gphone64_arm64","os":"android-36","source":"mesuré"}`, alors que
  la config déclarait `model: medium_phone`. C'est exactement l'écart que le
  correctif visait : l'empreinte est **lue sur l'appareil**, pas recopiée.
- **69** — `commandsAfterScroll` a été employé, et `argus-anchors` a rougi
  **trois fois avant d'être vert**, dont une sur la moitié « déclaration
  périmée » : `session_form_rest_minus` était déclarée sous le pli alors qu'elle
  est construite dès 360×640. C'est la moitié ajoutée pour que la liste ne
  devienne pas une permission permanente — elle a servi le jour même.

### 70. ✅ Corrigé le 22/08/2026 — `install-mobile.sh` cassait son propre compteur

```
install-mobile.sh: line 266: [: 0
0: integer expression expected
```

**Reproduit** hors du projet : `grep -c` **imprime `0` ET sort en 1** quand il ne
compte rien, donc `$(grep -c … || echo 0)` vaut `0\n0`, et `[ "$restant" -gt 0 ]`
lève. Neuf fois sur ce terrain, une par fichier `ARGUS:OWNED` sans TODO restant.

⚠️ **Le commentaire de trois lignes juste au-dessus explique qu'on a déjà corrigé
CETTE ligne** — pour une autre raison (le deux-points de `TODO(argus):`). On l'a
donc relue en la corrigeant, sans voir le défaut d'à côté.

### 71. ✅ Corrigé le 22/08/2026 — Les branches de `goto.yaml` tapaient avant que l'app soit prête

`launch-clean.yaml` rend la main sur un `waitForAnimationToEnd: 5000`, et
`visual.yaml` appelle `goto.yaml` **avant** son propre `extendedWaitUntil`. Sur ce
terrain, le démarrage à froid mesuré est de **6,4 à 9,3 s** : chaque branche de
`goto` tape donc dans le sas de démarrage, et l'échec sort en `Element not found`,
ce qui se lit comme un défaut d'instrumentation. L'ancre existait, prouvée à
l'étage 1 et lue dans l'arbre du device.

⚠️ **Le remède du rapport vise `goto.yaml`, qui est `ARGUS:OWNED`** — donc jamais
mis à jour chez les projets déjà installés. `launch-clean.yaml` est du CADRE :
y attendre l'ancre de départ couvre **tous** les flows et descend chez tout le
monde. Le symptôme est juste, le remède proposé est inférieur.

**Corrigé dans le cadre.** `launch-clean.yaml` attend maintenant l'ancre de
départ avec le budget du harnais, après le `waitForAnimationToEnd` qui reste —
« lancé » veut désormais dire **prêt**, et non « rien ne bouge », ce dont un
splash statique se satisfait aussi. L'attente est **conditionnée** à l'existence
d'une ancre déclarée : un projet qui n'en a pas encore garde le comportement
d'avant plutôt que d'hériter d'une attente sur une variable vide, qui ferait
échouer chaque flow sur un sélecteur non résolu. Deux gardes, un par moitié.

### 72. ✅ Corrigé le 22/08/2026 — `startTimeoutMs` n'avait pas de levier à lui

`Math.max(20000, coldStartMs × 5)` : le seul moyen de relever le plafond
anti-flake est `coldStartMs`, qui **relâche du même geste le gate chargé de
rapporter la lenteur qui cause le flake**. Sur une app à 2 s de splash imposé et
6,4 s de démarrage réel, aucune valeur n'est à la fois un budget honnête et un
plafond tenable.

**Corrigé — `thresholds.startTimeoutMs` existe, et la dérivation reste le
défaut.** Un BUDGET (au-delà, le rapport signale une lenteur) et un PLAFOND
(au-delà, le flow renonce) ne mesurent pas la même chose ; les découpler était le
seul remède. Vide ou `0` → `max(20 s, coldStartMs × 5)`, qui suit le projet sans
qu'on y pense — c'est l'autre moitié, sans laquelle « ajouter un levier » serait
devenu « ne plus suivre le projet ». Une valeur explicite peut être **plus basse**
que la dérivation, sinon elle ne découplerait rien.

### 73. ✅ Corrigé le 22/08/2026 — `allowSecretsIn` livrait deux entrées Firebase, et le scanner criait dessus

Le défaut du scaffold cite `google-services.json` et `GoogleService-Info.plist`.
Sur un projet sans Firebase, elles ne dispensent aucun fichier — et `sec.mjs:298`
**avertit** précisément dans ce cas. Le skill crie donc pour sa propre valeur par
défaut, ce qu'il reproche ailleurs aux rapports.

**Corrigé : la liste est vide par défaut**, et les deux entrées Firebase sont
écrites en commentaire, à recopier quand le projet en a l'usage. Une dispense
s'ajoute quand un run remonte un faux positif, pas avant.

Mesuré dans les deux sens sur le banc : liste vide → aucun avertissement ;
l'ancienne valeur par défaut remise → « 2 entrée(s) ne dispensent aucun fichier
scanné ». L'instrument mesure, donc son silence vaut quelque chose.

### 74. ✅ Corrigé le 22/08/2026 — Le bloc de compteurs de §2b n'avait pas de case pour ce qu'il prescrit

Le format impose une ligne `Commandes : <Y> posées / <N> à poser (<Y/N> %)`, et le
texte cinq lignes plus bas demande de compter « les composants partagés **une
fois**, avec leur nombre de call-sites ». Les deux ne tiennent pas dans la même
ligne. Le skill avertit pourtant qu'un agent qui improvise sa propre forme produit
exactement ce que ce bloc existe pour empêcher — et il a fallu improviser.

**Corrigé : une sous-ligne `dont partagées : <C> composant(s) couvrant <S>
call-sites`.** Elle naît du même défaut que la ligne `Racines d'état` deux runs
plus tôt — **un format qui prescrit une information sans lui donner de case la
fait inventer**, et deux rapports cessent alors d'être comparables. C'est la
deuxième fois que ce bloc se corrige par la même leçon.

### 75. ✅ Corrigé le 22/08/2026 — La table `argusScreens` / `screens[]` avait un quatrième écart légitime

Elle en couvre trois : la coquille, l'état qui ne se monte pas seul, l'état
atteignable après un parcours. Manque : **montable à l'étage 1, inatteignable de
façon déterministe à l'étage 2** — un splash qui s'auto-remplace en 2 s, un écran
d'échec qui demande une injection de panne. Choix fait sans instruction :
`argusScreens` seul.

**Corrigé : la table a quatre lignes**, et le choix que l'agent a fait sans
instruction est celui qu'elle prescrit. C'est le **symétrique** du deuxième cas —
l'un ne se monte pas seul, l'autre ne s'atteint pas seul — ce qui explique qu'il
manquait : on avait vu la moitié qui gêne à l'étage 1, pas celle qui gêne à
l'étage 2.

⚠️ Le critère écrit n'est pas « est-ce un écran » mais **« un flow peut-il y
arriver deux fois de suite ? »**. Si la réponse demande un « en général », c'est
ce cas-ci — et le mettre dans `screens[]` produirait un flow qui échoue par
intermittence, la pire des suites, celle qu'on finit par ignorer.

### 76. ✅ Corrigé le 22/08/2026 — §1 demandait une ligne « avant d'agir » qu'un sous-agent ne peut pas rendre

Un agent non interactif n'a qu'un seul canal, son rapport final : la ligne arrive
donc **après** les décisions qu'elle sert à faire démentir. Le skill suppose un
interlocuteur ; `PROMPTS.md` traite le cas inverse mais §1 ne le dit pas.

**Corrigé : §1 nomme le cas et dit quoi faire.** Écrire la ligne en tête du
rapport — elle ne prévient plus, mais elle rend relisible ce qui suit — **et** la
poser dans `argus.mobile.yaml`, près de chaque clé qu'elle gouverne : c'est le
seul endroit qui survit au rapport, et celui que la personne suivante ouvrira.

⚠️ Et surtout : **ne pas s'arrêter pour demander**. Un agent non interactif qui
attend une réponse qui ne viendra jamais ne rend rien du tout — pire qu'un choix
assumé. Six runs le confirment : ce que ces agents ont produit de plus utile est
la liste de ce qu'ils ont tranché seuls, jamais leurs questions.

### 77. ✅ Corrigé le 22/08/2026 — Le banc JETAIT la sortie de l'installeur, et n'armait pas le cas

`tools/bench.sh:34` lance `install-mobile.sh … >/dev/null 2>&1`. Et la CI du
plugin le lance sans jeter sa sortie, mais l'erreur n'est **pas fatale** : le job
reste vert avec `integer expression expected` dans son journal.

⚠️ Constat de mon fait, pas du rapport — c'est en cherchant pourquoi le 70 n'avait
jamais été vu qu'il apparaît. Un défaut qui n'est fatal nulle part n'a besoin que
d'une sortie jetée pour vivre indéfiniment.

**Corrigé, en deux temps — et le premier ne mesurait rien.** Faire lire la sortie
au banc et à la CI, avec un critère total (aucune ligne `<script>: line N:`), ne
suffisait pas : sur un scaffold **fraîchement posé**, tous les fichiers OWNED
portent encore leurs TODO, donc le compteur ne passe jamais par zéro et le défaut
ne se déclenche pas. Le banc restait vert sur le défaut réintroduit, pendant que
le contrôle avait l'air de marcher — l'entrée impossible, exactement.

Le banc **vide donc les TODO d'un fichier OWNED puis relance l'installeur**, ce
qui est l'état d'un projet réellement instrumenté — celui du run 6, qui n'avait
plus un seul TODO. Vérifié dans les deux sens : rouge sur le défaut réintroduit,
vert sans, restauration prouvée par hash.

### 78. ✅ FAUX — `isCommand` voit très bien le défaut qu'il doit attraper

Le rapport affirme que `isCommand => actions != 0 || hasEnabledState` devient
aveugle quand le composant enveloppé pose `enabled:` sur son propre `Semantics` :
le nœud ancré serait alors compté comme actif tout en étant inerte.

**Mesuré, et c'est faux.** Sonde jetée dans le banc, passant par `argusNodesById`
pour mesurer exactement ce que le garde mesure — deux montages ne différant que
par `enabled:` sur le composant enveloppé :

| Le composant pose `enabled:` | `actions` | `hasEnabledState` | `isCommand` |
|---|---|---|---|
| non | 0 | `false` | **`false`** |
| oui | 0 | `false` | **`false`** |

L'état d'activation **ne remonte pas** au nœud ancré quand la fusion est coupée —
c'est précisément ce que couper la fusion veut dire. Le garde attrape dans les
deux cas.

⚠️ **Deuxième constat démenti en six runs**, et il ressemble au 62 : l'agent a eu
raison sur ce qu'il a **mesuré** (l'ancre fusionne sur ce design system, sonde à
l'appui) et tort sur ce qu'il en a **déduit** sans mesurer. Reproduire reste la
seule façon de les séparer — d'autant qu'ici le raisonnement était plausible et
que le dartdoc du prédicat semblait lui donner raison.

## Run 7 — troisième vérification, et six correctifs exercés sur sept

**10 flows sur 10 `COMPLETED`**, 30 tests d'ancres, 352 gardes d'étage 1,
527 tests verts au total, `analyze` sans issue, `coverage.notConfigured` vide.
Le cycle visuel est prouvé en **trois** temps — génération, comparaison verte,
puis référence remplacée par un aplat : **un seul** finding, et les trois autres
restent vertes.

⚠️ **Six des sept correctifs de la passe 70–77 ont été exercés, et ils tiennent :**

- **70 + 77** — aucune erreur `integer expression expected` dans un run qui a
  pourtant rempli tous les `TODO(argus)`.
- **71** — 10/10 flows, aucun échec sur le sas de démarrage, là où le run 6 en
  perdait deux sur ce seul motif.
- **73** — allowlist vide, aucun avertissement d'entrée inerte.
- **74** — la sous-ligne a servi telle quelle : *« dont partagées : 8 composant(s)
  couvrant 25 call-sites »*.
- **75** — le quatrième cas de la table a été employé nommément pour trois
  écrans : *« cas 4 de la table (pas atteignables deux fois de suite) »*.
- **76** — le cadrage a été écrit en tête d'`argus.mobile.yaml` **et à côté de
  chaque clé qu'il gouverne**, exactement comme le §1 le prescrit désormais.

Le **72** n'a pas été exercé (aucun flake de démarrage à arbitrer).

⚠️ Et `commandsAfterScroll` a servi une seconde fois : deux ancres rouges au
premier passage, l'indice de pli les a nommées, elles sont passées dans le
troisième état — 30/30.

### 79. ✅ Corrigé le 22/08/2026 — La relance a11y sortait sur un splash STATIQUE

Ma boucle de rattrapage s'arrête dès que deux lectures de l'arbre coïncident,
sous le commentaire : *« ce n'est un splash QUE s'il bouge encore »*. **C'est
faux.** Un splash statique — une image de marque immobile pendant deux secondes —
rend deux dumps identiques à 500 ms d'intervalle : la boucle sort au bout d'une
seconde, en plein sas, et la dimension ne mesure rien.

⚠️ **C'est mot pour mot l'erreur du point 71**, corrigée la veille dans
`launch-clean.yaml` : « rien ne bouge » ne veut pas dire « prêt ». J'ai corrigé le
flow et laissé le script avec le même raisonnement, à deux fichiers de distance.

Ce que le harnais sait déjà et qui tranche : `identifyScreen` distingue
`sans-declaration` (rien n'est déclaré, attendre ne servira JAMAIS) de `aucune`
(des écrans sont déclarés, celui-ci peut encore arriver). Et `brandedSplashMs`
donne la durée du sas, déclarée par le projet.

**Corrigé : `verdictAttente()` rend trois issues au lieu d'un booléen** —
`reconnu`, `renoncer`, `attendre` — et chacune se dérive de ce que le projet a
déjà déclaré. L'immobilité ne vaut « posé » qu'**après** le splash déclaré ;
`sans-declaration` renonce immédiatement, puisque attendre ne servirait jamais.

⚠️ **Sans `brandedSplashMs`, on n'invente pas de plancher** : on attend le budget
entier — lent, mais jamais faux — et un avertissement dit quoi renseigner pour que
ça cesse. Un nombre deviné ici aurait été le même défaut sous un autre habillage.

Cinq gardes, dont celui qui tient l'autre moitié : passé le splash, l'immobilité
doit faire renoncer, sinon « ne plus sortir trop tôt » deviendrait « attendre le
budget entier à chaque run ».

### 80. ✅ Corrigé le 22/08/2026 — Le taux de couverture de §2b était faux

`Commandes : <Y> posées / <N> à poser  (<Y/N> %)`. Si `N` est le reste à poser,
le taux est `Y/(Y+N)`. Sur 41 posées et 3 restantes, la formule écrite rend
**1367 %**. Même flou sur `<R> posées / <RT> à poser` : le jeton `RT` se lit
« Racines Total » quand la légende dit « à poser ».

⚠️ **Ce bloc a été relu la veille**, en y ajoutant la sous-ligne du point 74 — et
la formule d'à côté n'a pas été vue. Deuxième fois en deux passes qu'une ligne
fautive survit à l'édition de sa voisine (cf. 70).

**Corrigé** : le taux s'écrit `<Y/(Y+RESTE)>`, et le jeton du dénominateur
s'appelle `RESTE` — `N` et `RT` se lisaient « Nombre total » et « Racines Total »
quand la légende disait « à poser », si bien que le même gabarit produisait deux
relevés incomparables selon comment on l'avait lu.

### 81. ✅ Corrigé le 22/08/2026 — Une ancre d'affichage n'avait de case nulle part

`session_form_reps_value` est un nœud de VALEUR, ciblé par `journey-critical.yaml`
pour vérifier ce qui est affiché. La déclarer en `commands:` la fait échouer sur
« ancre posée sur un nœud INERTE » — un message qui décrit un défaut, alors
qu'ici l'inertie **est le comportement voulu**. La retirer, et plus rien ne
prouve qu'elle existe, alors qu'un flow la cible.

C'est exactement la forme du point 69 (`commandsAfterScroll`), sur un autre axe :
deux mauvaises issues, pas de troisième état.

**Corrigé : `displays:` prouve la PRÉSENCE, jamais l'activité.** Et l'autre
moitié, sans laquelle cette liste serait devenue l'endroit où l'on range ce qui
rougit : une ancre déclarée en affichage qui se révèle **interactive** fait
échouer le test, avec la consigne de la remonter dans `commands:`.

Armé par une sonde jetable et vérifié dans les trois sens : un nœud inerte passe,
un nœud tapable échoue sur « est bien un AFFICHAGE », un absent échoue sur
« présent ».

### 82. ✅ Corrigé le 22/08/2026 — `report.json` survivait à un run qui n'avait jamais atteint Maestro

Quand le runner s'arrête avant la suite — installation refusée, par exemple — le
rapport du run PRÉCÉDENT reste sur le disque et se lit comme frais. L'agent s'y
est fait prendre et a failli conclure que la comparaison visuelle ne mesurait
rien ; c'est le journal qui l'a détrompé, pas le rapport.

⚠️ Un `0` rendu par une commande qui a échoué n'est pas un `0` de mesure — et ici
c'est le harnais lui-même qui fabrique le piège.

**Corrigé : le rapport est PÉRIMÉ dès l'ouverture du run**, remplacé par un
`{incomplete: true}` qui dit ce qu'il est. S'il survit, il dénonce lui-même le
run interrompu au lieu de se faire passer pour son résultat.

### 83. ✅ Corrigé le 22/08/2026 — Une ligne de tableau orpheline en §3c

La table `Config / Étage 1 / Étage 2` est coupée : deux lignes, puis douze lignes
de prose, puis la ligne « Étage 2 » — qui ne rejoindra jamais son tableau au
rendu Markdown et s'affichera comme du texte brut avec ses barres verticales.

**Corrigé, et gardé.** La ligne est remontée dans sa table. Un garde balaie
désormais **les sept documents livrés** : toute ligne de tableau doit toucher son
tableau, une ligne d'en-tête étant reconnue à ce qui la SUIT (le séparateur) et
non à ce qui la précède.

⚠️ Mon premier détecteur comptait **huit** défauts là où il y en avait un : il
prenait chaque en-tête de tableau pour une orpheline. Un contrôle qui accuse
partout ne mesure rien de plus qu'un contrôle qui se tait.

### 84. ✅ Corrigé le 22/08/2026 — `startupHint` collait une hypothèse fausse sur un finding visuel

L'indice « c'est l'écran de DÉPART qui n'est pas arrivé à temps » est le bon
conseil pour un `extendedWaitUntil` qui expire. Il s'ajoute aujourd'hui à **toute**
étape en échec dont le sélecteur vaut l'ancre de départ — `assertScreenshot`
compris. Observé sur une vraie divergence d'image (5,04 % de correspondance) :
le message conseille de vérifier le temps de démarrage alors que la comparaison a
parfaitement eu lieu.

Le code porte déjà `WAIT_COMMANDS`, juste au-dessus, et ne s'en sert pas ici.

**Corrigé** : l'indice exige désormais que l'étape ait ATTENDU. Vérifié dans les
deux sens — `extendedWaitUntil` le reçoit, `assertScreenshot` et `tapOn` ne le
reçoivent plus.

### 85. ✅ Corrigé le 22/08/2026 — `perf` disait « jank non conclu » puis « jank 0 % »

`warn('jank non conclu — 0 frame(s)')` en ligne 360, puis
`log('jank ${jank.jankFramesPct ?? '?'} %')` en ligne 385 — la valeur **brute**,
pas la valeur comparable. Et `perf.json` reçoit `jankFramesPct` sans marqueur de
non-conclusion : seul `framesRendered: 0` à côté permet de ne pas le lire comme
une mesure.

**Corrigé** : la ligne de log affiche la valeur **comparable** (« jank non
conclu ») et non plus la brute, et `perf.json` porte `jankComparable` + `jankWhy`
à côté du relevé. Les deux chiffres restent lisibles ; un seul porte un verdict.

### 86. ✅ Corrigé le 22/08/2026 — `declared.model` / `declared.os` étaient `null`, et ce n'était plus vrai

Le rapport les met à `null` hors `autoStart`, avec sept lignes de commentaire
expliquant qu'ils « ne servent QU'À `autoStart` ». **Ce n'est plus le cas depuis
le point 67** : `ciEmulator()` les lit pour choisir l'émulateur de la CI. Le
commentaire est périmé par mon propre correctif, et le rapport tait deux clés qui
gouvernent désormais quelque chose.

⚠️ Le constat de l'agent était juste, son diagnostic incomplet : il y voyait un
champ vide, c'est une décision devenue fausse.

**Corrigé : les deux clés sont rendues, avec `role` qui dit ce qu'elles
gouvernent.** C'est ce champ-là qui empêche de les lire comme une description de
l'appareil — le danger d'origine, qui reste réel. Les taire protégeait d'une
lecture fausse en en cachant une vraie.

### 87. ✅ Corrigé le 22/08/2026 — §3g faisait générer les références APRÈS le premier run, sans le dire

Ce qui garantit une première passe visuelle non exécutée. C'est défendable — on
prouve d'abord que les flows tournent — mais rien ne le dit, et l'ordre se lit
comme une erreur.

**Corrigé, et il manquait une ligne au bloc.** La raison est écrite : une
référence prise sur une suite dont on n'a pas prouvé qu'elle tourne fige un écran
qu'on n'a jamais vu arriver, et une baseline fausse est pire qu'une baseline
absente — elle rend vert pour toujours ce qu'elle a photographié de travers.

⚠️ **Et le bloc oubliait le second `argus-run`** : sans lui, le premier run ne
compare rien (pas de références) et le suivant n'existe pas. On livrait donc une
séquence au terme de laquelle la boucle visuelle **n'a jamais tourné une seule
fois**. C'est le run 7 qui l'a fait sans qu'on le lui dise, et ses 10/10 en
dépendent.

La preuve en trois temps est écrite au même endroit : générer, comparer vert,
puis remplacer une référence par un aplat et vérifier que celle-là seule rougit.

### 88. ✅ Corrigé le 22/08/2026 — Deux temps de démarrage côte à côte, sans dire qu'ils diffèrent

`am start -W` mesure 1,2 s (première frame) quand l'écran d'accueil réel met ~6 s
(splash imposé + init). Les deux chiffres sont justes et ne mesurent pas la même
chose ; le rapport les affiche l'un près de l'autre sans le dire. Un lecteur
pressé y voit une contradiction. `brandedSplashMs` existe et fonctionne, mais il
n'explique pas cet écart-là.

**Corrigé : chaque chiffre porte `measures`**, une phrase qui dit ce qu'il mesure
et renvoie à l'autre. `perf.json` précise que `am start -W` s'arrête à la première
frame ; `startup` du rapport précise qu'il attend l'écran **exploitable**, splash
et init compris, et qu'il est normalement plus grand. Les deux restent affichés :
c'est leur écart qui informe, à condition qu'on sache le lire.

## Run 8 — le VOISIN, trois fois

**11 flows sur 11 `COMPLETED`**, 35 tests d'ancres, 380 gardes d'étage 1,
555 tests verts, `coverage.notConfigured` vide, cycle visuel prouvé en trois
temps avec restauration par hash.

⚠️ **Les huit correctifs de la passe 79–88 ont été exercés**, et les nouveautés
ont servi telles quelles : `displays:` employé pour cinq ancres, le second
`argus-run` de §3g joué sans qu'on le demande, et la commande de build ciblée
(`--target-platform android-arm64`, 118 → 92 Mo) reprise pour sortir d'un
`INSTALL_FAILED_INSUFFICIENT_STORAGE`.

⚠️ **Et quatre des neuf constats désignent la passe de la veille — trois par le
MÊME mécanisme.** Corriger un endroit laisse le voisin intact :

| corrigé la veille | le voisin, resté fautif |
|---|---|
| `startupHint` filtré par commande (84) | `vanishedHint`, dix lignes plus bas, ne l'est pas |
| le commentaire de `run.mjs` sur `model`/`os` (86) | celui d'`argus.mobile.yaml` dit encore « uniquement » |
| `commandsAfterScroll` pour les commandes (69) | `displays:` n'a pas son troisième état (81) |

C'est la **troisième passe consécutive** où ce motif sort, et la deuxième où il
sort trois fois. Ce n'est plus un oubli, c'est la façon dont les correctifs sont
pensés : locaux, alors que les défauts sont des manières de raisonner.

### 89. ✅ Corrigé le 22/08/2026 — `displays:` n'avait pas de troisième état

Un affichage sous le pli a **exactement** les deux mauvaises issues que
`commandsAfterScroll` a fermées pour les commandes : le déclarer rend la suite
rouge en permanence, l'omettre le sort de toute vérification. `form_reps_value`
est resté non déclaré pour cette seule raison — c'est le seul écart entre les
72 ancres posées et les 71 prouvées.

**Corrigé : `displaysAfterScroll:`**, avec les deux mêmes moitiés que son pendant
— présent au grand gabarit, **absent** au gabarit de référence, sinon la
déclaration est périmée et le test le dit. Armé par une sonde, vérifié dans les
trois sens.

⚠️ **Le 81 avait ouvert le troisième état d'un seul côté** : je l'ai écrit en
regardant `commandsAfterScroll` — dont le dartdoc explique exactement pourquoi il
existe — sans voir que je créais la même impasse à côté. Le voisin, encore.

### 90. ✅ Corrigé le 22/08/2026 — `vanishedHint` collait son diagnostic sur un finding visuel

Corrigé la veille pour `startupHint` (point 84), pas pour son voisin de dix
lignes. Un `QAM-001` de seuil visuel porte donc : « cette ancre a été TROUVÉE
plus tôt puis a disparu : l'instrumentation est bonne, c'est l'ÉTAT de l'app qui
a changé ». Diagnostic exact pour une autre classe de finding, recollé sur une
image de référence qui a simplement changé.

**Corrigé — et cette fois par un critère TOTAL plutôt qu'un second correctif
ponctuel.** `SELECTOR_COMMANDS` nomme les commandes dont l'échec parle d'un
élément ; les deux indices y sont filtrés. Et un garde balaie **tous** les
`…Hint(` ajoutés à un message d'échec : le jour où un troisième apparaît, il
tombera sans que personne y pense. C'est ce garde-là, pas le correctif, qui
répond au motif que trois runs ont nommé.

### 91. ✅ Corrigé le 22/08/2026 — Le plancher d'attente a11y était le splash, pas le temps d'écran exploitable

Mon correctif du 79 attend `brandedSplashMs` avant de conclure qu'un écran
immobile est posé. Sur ce projet : **splash déclaré 2000 ms, écran exploitable
mesuré 5015 à 7299 ms**. La boucle sort donc encore trop tôt, et `make argus-a11y`
a mesuré le splash — l'agent a dû le contourner à la main.

⚠️ **J'ai confondu les deux grandeurs que le point 88 m'a fait documenter la
veille**, dans la même passe. Écrire la distinction ne suffit pas à s'en servir.

**Corrigé : le plancher se LIT au lieu de se deviner.** `plancherMesure()` relit
`startup.samples` du rapport — le temps réel d'arrivée de l'écran de départ, que
le runner mesure déjà — et rend la **plus grande** des mesures : se tromper vers
le haut coûte du temps, vers le bas coûte la mesure.

À défaut de rapport, repli sur `brandedSplashMs` **en le disant** : « c'est la
durée du SPLASH, pas celle de l'écran exploitable, qui est plus longue ». Le
paramètre s'appelle désormais `plancherMs` et non plus `splashMs` — le nom
portait l'erreur autant que la valeur.

### 92. ✅ Corrigé le 22/08/2026 — `devices[].model` avait deux vocabulaires pour une clé

`argus.mobile.yaml` dit « ce sont des noms **MAESTRO**, consommés par `autoStart`
**uniquement** » ; `ciEmulator()` s'en sert comme **profil `avdmanager`** pour
`android-emulator-runner`. Les deux nomenclatures se ressemblent assez pour qu'on
ne voie pas l'écart, et assez peu pour qu'un nom valide d'un côté ne le soit pas
de l'autre. Le mot « uniquement » est faux depuis le point 67 — c'est le
commentaire que le 86 a corrigé dans `run.mjs`, et pas ici.

**Corrigé** : « DEUX consommateurs, et deux vocabulaires », avec les deux
commandes qui tranchent écrites à côté — `avdmanager list device` pour ce que la
CI acceptera, `maestro start-device --help` pour `autoStart`.

### 93. ✅ Corrigé le 22/08/2026 — §2c-bis prescrivait `home-empty`, `goto.yaml` ne connaissait que `home`

Le gabarit du skill donne `id: home-empty` (« une entrée PAR ÉTAT »), et la
branche « rien à naviguer » du sous-flow teste `SCREEN_ID === 'home'`. En suivant
le skill à la lettre, elle ne matche jamais.

**Corrigé** : `startsWith('home')`. Le gabarit demandait une entrée par ÉTAT et le
sous-flow attendait un nom d'écran — deux fichiers livrés ensemble qui ne se
rejoignaient pas.

### 94. ✅ Corrigé le 22/08/2026 — La table §2c ne couvrait pas `InkResponse`

C'est pourtant le bouton-icône réel de deux écrans de ce projet. L'agent a
raisonné par analogie avec `InkWell`, puis mesuré — alors que le §2c invite
précisément à ne pas raisonner par analogie.

**Corrigé** : `InkResponse` et `GestureDetector` rejoignent la table, et surtout
il est écrit que **c'est une illustration, pas un inventaire**. Devant un widget
absent de la liste, la question est toujours la même — déclare-t-il un rôle, ou
n'ajoute-t-il qu'un geste ? — et `make argus-anchors` tranche en quelques
secondes plutôt que de raisonner.

### 95. ✅ Corrigé le 22/08/2026 — §3g ne prévoyait pas que l'installation puisse échouer

La séquence suppose que `argus-run` passe. Quand l'installation refuse — place
disque, ici — il faut rebâtir et tout reprendre : deux runs de plus, non annoncés.
La méthodologie le dit ailleurs (« INSTALL n'est pas une formalité ») ; §3g ne le
laisse pas prévoir.

**Corrigé** : §3g porte les deux gestes qui débloquent, dans l'ordre —
désinstaller (réinstaller par-dessus demande PLUS de place) puis rebâtir avec la
commande ciblée sur l'ABI. Et il dit où reprendre la séquence, plutôt que de la
laisser recommencer au début.

### 96. ✅ Corrigé le 22/08/2026 — Le compteur de l'installeur comptait les `TODO(argus):` qui EXPLIQUENT

Les cinq champs de `harness.dart` portent leur consigne dans un **dartdoc** qui
commence par `TODO(argus):`. Remplis, ils restent comptés : le fichier rapporte
« 5 TODO à traiter » pour l'éternité.

⚠️ C'est le défaut que l'en-tête de l'installeur décrit lui-même pour
`ARGUS:OWNED` — un fichier classé par ce qu'il **dit** — et dont la protection
n'a jamais été étendue au compteur. Deuxième défaut de ce compteur en deux runs
(cf. 70).

**Corrigé des deux côtés.** Le marqueur descend du dartdoc vers **la ligne qu'on
édite** (`final … = <ArgusScreen>[]; // TODO(argus): tes écrans`) : il disparaît
quand on remplit, ce qui est son seul travail. Et le compteur **exclut les
dartdoc**, pour qu'un projet qui documente son champ ne retombe pas dans le
piège.

⚠️ **Mon premier motif était faux** : `^[^/]*TODO(argus):` excluait TOUS les
commentaires, donc les directives légitimes en fin de ligne — `harness.dart`
tombait à zéro alors qu'il en portait quatre. Deux instruments successifs pour un
compteur de quatre lignes, et c'est la mesure dans les deux sens qui l'a dit :
4 à traiter, 3 après avoir rempli la liste des écrans.

### 97. ✅ Corrigé le 22/08/2026 — Une phrase interrompue en tête de `methodology-mobile.md`

« *Ce qui est identique au web n'est pas recopié : sévérité, exit codes,* » —
puis rien. Coupure d'édition, dans les sept premières lignes du document le plus
lu après le SKILL.

**Corrigé** : la phrase est terminée, et dit ce qu'elle annonçait — ce qui est
écrit ici est ce que le mobile fait AUTREMENT.

### 98. ✅ Corrigé le 23/08/2026 — `make argus-build` construit l'APK **gras**, alors que §3g le prescrit juste après `adb uninstall`

Le runner sait proposer la bonne commande : quand l'installation échoue, il rend
`buildCmdForAbi(brute, deviceAbi(udid))` — ciblée sur l'ABI de l'appareil qu'il
vient de résoudre. Mais la cible que §3g demande de lancer ensuite est
`@$(FLUTTER) build apk --debug`, **écrite en dur dans le `Makefile`**, qui ne lit
ni `build.androidBuildCmd` ni l'ABI. La séquence prescrite reconstruit donc
exactement le binaire qui vient de ne pas rentrer.

Le run 9 l'a vécu sans le nommer : il a dû construire à la main avec
`--target-platform android-arm64`.

⚠️ **Deux chemins de build coexistent** — celui du `Makefile` (en dur) et celui
que `run.mjs:1295` compose depuis la config. C'est le motif du voisin sous sa
forme la plus coûteuse : le geste documenté et le geste outillé ne font pas la
même chose.

**Corrigé** : `argus-build` demande sa commande à la config (`config.mjs --print-build-cmd`),
qui résout le préfixe FVM et le `--target-platform` de l'ABI du device branché. Un
garde balaie **toutes** les recettes tabulées du Makefile — une seconde cible qui
recoderait un build tomberait seule.

### 99. ✅ Corrigé le 23/08/2026 — Un build peut réussir **sans re-packager**, et rien ne le dit

Mesuré au run 9 : un premier `--target-platform android-arm64` a duré **8,5 s** et
rendu **123 230 339** octets contre **123 230 484** avant — 145 octets d'écart,
c'est-à-dire des horodatages. Le build suivant a rendu **96 438 630**. Entre les
deux, la seule différence lisible était la durée.

`argus-build` s'arrête à `✓ Built` : ni taille, ni hash. C'est le pendant exact
de la règle sur le `kernel_blob.bin`, mais côté paquet — et le run 9 en a tiré la
conclusion inverse de la réalité (« le ciblage ne sert à rien »), écrite avant
d'être démentie par la mesure suivante.

**Corrigé** : la cible mesure le paquet avant et après, et le dit. Taille inchangée
après un changement de commande ⇒ le message nomme `flutter clean`.

### 100. ✅ Corrigé le 23/08/2026 — « le ciblage divise sa taille par deux » — un chiffre vrai une fois, écrit comme une loi

`SKILL.md:791`. La mesure qui l'a produit est réelle (84,9 Mo contre 39,7, run 8).
Sur le projet du run 9 : **123 230 484 → 96 438 630 octets**, soit 117,5 → 92,0 Mo,
**−21,7 %**. Le terme dominant n'y était pas les ABI mais
`assets/flutter_assets/kernel_blob.bin` (**84,3 Mo**), que `--target-platform` ne
touche pas — et le ciblage ne retire pas tout : `lib/x86_64` et `lib/armeabi-v7a`
survivent (4,8 Mo de `.so` de plugins qui livrent toutes les ABI).

Surtout, la phrase qui suit — « et c'est souvent tout ce qui manquait » — a été
démentie dans le même run : le ciblage **n'a pas suffi**, c'est `adb uninstall`
qui a débloqué. Dire ce qui **détermine** le gain vaut mieux qu'un ratio.

**Corrigé** : §3g donne les deux mesures (84,9 → 39,7 et 117,5 → 92,0), dit que le
gain dépend de ce qui pèse dans le paquet, et que le ciblage **ne suffit pas
toujours** — sur le second projet c'est la désinstallation qui a débloqué.

### 101. ✅ Corrigé le 23/08/2026 — L'indice du pli existe pour `commands:` et pas pour `displays:` — le voisin du 89

Une `commands:` introuvable déclenche une sonde : le test remonte au plus grand
gabarit et, si l'ancre y est, rend « ⚠️ ELLE EXISTE, mais plus bas que ce gabarit
ne le montre … DÉPLACE-LA dans `commandsAfterScroll:` ». Une `displays:`
introuvable ne déclenche rien : le message accuse l'instrumentation et **ne
mentionne jamais `displaysAfterScroll:`**, qui existe pourtant depuis le 89.

Deux des quatre échecs du run 9 étaient dans ce cas. Le champ a été créé sans
l'indice qui apprend à s'en servir — *mon* correctif, une passe plus tôt.

⚠️ Le remède ponctuel serait de recopier la sonde dans le chemin `displays`. Le
remède **total** est de l'extraire, pour que le troisième axe l'ait par
construction.

**Corrigé — par extraction, pas par recopie.** `argusFoldHint` vit dans le harnais et
les deux axes l'appellent ; le troisième l'aura par construction. Éprouvé sur le
banc dans les deux sens : sous le pli ⇒ l'indice nomme `displaysAfterScroll:`,
vraiment absente ⇒ **zéro** indice et le message accuse l'instrumentation, ce qui
est juste.

### 102. ❌ FAUX — « `devices[].os` ne peut pas satisfaire ses deux consommateurs »

Le run 9 écrit : « J'ai mis la forme Maestro ; la CI retombera sur son défaut. »
**Mesuré, elle ne retombe sur rien** — `ciEmulator` traduit :

```
os=android-36 model=pixel_6 → {"ok":true,"apiLevel":"36","profile":"pixel_6","source":"argus.mobile.yaml"}
os vide                     → {"ok":true,"apiLevel":"33",…,"source":"défaut du workflow"}
os=36  (la forme CI)        → {"ok":false,"why":"devices[].os illisible : « 36 » (attendu : android-33)"}
```

Le champ unique sert bien les deux : la forme Maestro est la seule acceptée, et
la CI en **dérive** son `api-level`. C'est exactement ce que le 67 avait posé. La
seule façon de retomber sur le défaut est de laisser `os` vide — et le harnais le
dit alors dans son `why`.

⚠️ **Deux lectures fausses avant la mesure, dont la mienne.** Le rapport voyait
un champ à un seul vocabulaire ; moi j'ai inscrit « le voisin du 92 : `os` n'a
rien reçu » après avoir lu le commentaire du YAML — qui dit pourtant
« `model`/`os` → DEUX consommateurs » — **sans ouvrir `ciEmulator`**. Reproduire
n'est pas lire le fichier voisin : c'est exécuter la fonction. Le commit qui a
inscrit ce point (`1a8d58b`) porte donc un résumé faux ; il reste tel quel, c'est
ici que la vérité vit.

### 103. ✅ Corrigé le 23/08/2026 — Deux identifiants qui tombent dans le même nœud fusionné : le second disparaît, en silence

Le skill couvre l'**absorption** (une racine qui avale ses descendants →
`container: true` + `explicitChildNodes: true`) et l'ancre inerte. Il ne dit nulle
part que **deux `Semantics(identifier:)` frères recouverts par un même nœud
fusionné n'en gardent qu'un**.

Mesuré au run 9 par une sonde jetable, avec contre-épreuve :

```
SONDE home_streak_value elements = 1     ← l'ancre de contrôle
SONDE home_total_value  elements = 0
widget id=home_total_value               ← le widget EST dans l'arbre
node id=home_streak_value rect=(0,0,312,158.5)   ← 312 px : la RANGÉE ENTIÈRE
```

Le widget est dans l'arbre, `flutter analyze` est vert, rien ne lève : seul le
second identifiant a disparu. Remède `container: true` sur chacun, revérifié —
`rect=(0,0,32.3,63.0)` et `rect=(0,0,82.5,32.0)`. La table « §2c » gagnerait une
quatrième ligne.

**Corrigé** : §2c porte la sonde, la contre-épreuve, le `rect` qui trahit (312 px =
la rangée entière) et le remède revérifié. Et la consigne de lecture : devant une
ancre « absente » qu'on voit dans le code, lire le `rect` de sa **voisine**.

### 104. ✅ Corrigé le 23/08/2026 — `mask-dynamic.yaml` n'avertit que d'un côté — et c'est l'autre qui a mordu

Le fichier prévient qu'un motif **trop étroit** échoue en silence sous
`optional: true`. Rien sur le motif **trop large**, dont le dégât est pire : il
tape quelque chose.

Au run 9, `(?s).*(Erreur|Validation|Diagnostic).*` a attrapé la section
« DIAGNOSTIC » des Réglages, dont le tap **envoie un événement Sentry** ; le
bandeau de confirmation a ensuite pollué la capture et fait diverger la référence
à **98,60849919 %**. Un `optional: true` qui tape la mauvaise chose est plus
dangereux qu'un qui ne tape rien.

⚠️ **La moitié démentie du constat.** Le run 9 écrit que « donner une ancre à ce
qui flotte, puis cibler par `id`, n'est proposé nulle part » : c'est faux, c'est
le **premier** exemple commenté du fichier (`id: banner_dismiss`). Le symptôme
était juste, le diagnostic non.

**Corrigé** : l'avertissement porte les deux sens, avec la mesure du dégât (98,6 %),
et dit pourquoi l'exemple `id:` vient en premier — c'est le seul ciblage qui sait ce
qu'il touche.

### 105. ✅ Corrigé le 23/08/2026 — `perf.mjs` ne dit rien pendant qu'il travaille

**4 appels à `log()` en 416 lignes** : `mesures sur <udid>` à la ligne 340, puis
plus rien jusqu'aux résultats (396). Entre les deux se jouent N démarrages à
froid, les démarrages à chaud, le jank et la mémoire.

Le run 9 a vu deux exécutions dépasser **10 min** (`make: *** [argus-perf]
Terminated: 15`) contre trois à **5 s**, même commande, même device — sans qu'une
seule ligne permette de distinguer « ça calcule » de « ça ne rendra jamais la
main ». La variable n'a pas été isolée, donc aucun mécanisme n'est avancé ici :
ce qui est certain est que le script est muet.

**Corrigé** : une ligne par phase (froid, chaud, jank, mémoire). Ça ne corrige pas la
lenteur — personne n'en a isolé la cause — ça la rend lisible.

### 106. ✅ Corrigé le 23/08/2026 — `aapt2` et `apkanalyzer` sont cherchés au PATH seulement, jamais là où ils vivent

`detectTools` fait `sh(name, probe)` : présent au PATH ou absent. Or ces deux-là
existent sur **toute** machine ayant les Android SDK Build-Tools — ils n'y sont
simplement pas exposés. `TOOLS.aapt2.install` le sait déjà et dit « (ajoute-le au
PATH) », mais rien ne va le chercher.

Conséquence mesurée au run 9 : la moitié de la dimension sécurité a été sautée
jusqu'à un `export PATH=…/build-tools/35.0.0:$PATH`, après quoi elle a rendu
`binary: 142 entrées, isDebugBuild false, hasAot true, obfuscation projectPaths: 0`.
Sonder `$ANDROID_HOME/build-tools/*/` avant de déclarer absent coûte quelques
lignes ; ce qu'on y gagne est une dimension entière.

**Corrigé** : `toolPath()` les résout depuis `ANDROID_HOME` et les racines usuelles, et
**la sonde comme le site d'appel** l'utilisent — détecter un outil qu'on ne sait
ensuite pas lancer serait le même défaut en plus petit.

⚠️ **Ma première écriture s'est trompée deux fois**, et c'est la mesure qui l'a dit :
`sort()` alphabétique place « 9.0.0 » après « 35.0.0 », et il choisissait une
`37.0.0-rc2` contre une stable. Le classement est gardé, et une stable prime
toujours — cet outil établit un fait de sécurité.

### 107. ✅ Corrigé le 23/08/2026 — `androidBuildCmd` par défaut ne porte pas le préfixe FVM

`argus.mobile.yaml:62` et `config.mjs:328` valent `flutter build apk --debug`,
sans `fvm`, alors que tout le reste du scaffold dérive le préfixe. Sans
conséquence à l'exécution — `flutterCommand()` le rétablit — mais c'est une ligne
de configuration qu'on lit et qu'on copie, et elle donne alors le mauvais SDK.

**Corrigé** : le commentaire du YAML dit qui **affiche** ces commandes (les scripts de
mesure) et qui les **exécute** (`make argus-build`), et qu'il ne faut pas y écrire
`fvm` — le préfixe est dérivé, l'ajouter le doublerait.

### 108. ❌ FAUX — « `adb uninstall` est présenté comme un remède, pas comme une routine »

Le run 9 le signale et propose de le « mettre dans la séquence ». Il y est déjà :
`SKILL.md:786-788` donne les **deux gestes dans cet ordre**,
`adb -s <udid> uninstall <appId>` puis `make argus-build`, sous le titre
« `argus-run` peut refuser de démarrer, et c'est prévu ».

⚠️ **Mon premier grep a confirmé le constat à tort** : `grep "adb uninstall"` ne
matche pas `adb -s <udid> uninstall`. J'allais inscrire « le skill ne mentionne
jamais la désinstallation », l'exact contraire de ce que le fichier porte. Un
motif non ancré compte faux ; ici il aurait fait *ajouter* ce qui existait.

Ce qui reste vrai, et vaut pour le 98 : le geste est dans une section
conditionnelle, et sur cet AVD il n'a rien de conditionnel — 3 paquets tiers
installés, 621 Mo libres sur `/data`, un APK debug de 92 Mo qui en demande le
double.

### 109. ✅ Corrigé le 23/08/2026 — `report-format-mobile.md` promet `run.env` et `run.mode` ; rien ne les écrit

Le contrat de sortie annonce
`"run": { "startedAt", "platform", "appVersion", "env", "mode", "commit?" }`.
Le rapport produit, lui, rend `startedAt, platform, appVersion, appName, flavor,
appId, budget, devices, animationsDisabled, installProof` — mesuré au run 10 par
`Object.keys(report.json.run)`. **`env`, `mode` et `commit` n'existent nulle
part**, ni dans `run.mjs`, ni comme clé de `argus.mobile.yaml`.

⚠️ Ce n'est pas qu'un champ manquant. `SKILL.md` §1 demande d'écrire le cadrage
« dans `argus.mobile.yaml`, à l'endroit que chaque choix gouverne — `ENV` près de
sa clé ». **La clé n'existe pas**, donc l'agent range `ENV` où il peut : deux runs
de suite l'ont mis en commentaire d'en-tête, chacun à sa façon. Une consigne qui
désigne un emplacement inexistant se solde par un emplacement inventé.

**Corrigé** : `run.env` / `run.mode` existent dans `DEFAULTS`, dans le YAML (bloc
`run:` en tête, là où le cadrage se lit) et dans le rapport. **Et le garde du
contrat descend d'un niveau** : il figeait les clés de premier niveau — il a
tenu — mais rien ne lisait ce que le bloc jsonc promet à `run`.

⚠️ **Ce garde a demandé trois essais, chacun rattrapé par sa propre assertion de
non-vacuité et non par une relecture** : il lisait le rapport d'INTERRUPTION au
lieu du principal (0 clé), puis la seule première clé de chaque ligne (3 fausses
omissions), puis mangeait la virgule dont le match suivant avait besoin (1 de
plus). Prouver l'instrument avant de croire ce qu'il rend.

### 110. ✅ Corrigé le 23/08/2026 — Le gabarit du rapport d'instrumentation n'a pas de case pour les `displays` — troisième voisin

§2b compte « Racines d'état », « Commandes », « Non enveloppables ». Pas les
affichages. Or `displays:` existe depuis le 81, `displaysAfterScroll:` depuis le
89, et l'indice qui les annonce depuis le 101 : le run 10 en a posé **7** et
n'avait nulle part où les compter.

⚠️ **C'est la troisième fois que `displays` révèle un voisin oublié, en trois
runs.** Le champ (81), l'indice (101), le gabarit (110). Le remède du 101 —
extraire plutôt que recopier — était le bon geste et n'a pas suffi : il couvrait
le *code*, pas les *énumérations en prose*. Ce que ça enseigne dépasse le point :
**quand on ajoute un axe à une notion, ce qui casse n'est pas un endroit, c'est
la liste de tous les endroits qui énuméraient les axes.**

Et le bloc §2b se condamne lui-même : « Un format qui prescrit une information
sans lui donner de case la fait inventer. » Le run 10 s'est abstenu d'inventer une
ligne — et l'a dit.

**Corrigé** : le gabarit compte les affichages et le sous-le-pli. **Et le garde
dérive les axes du TYPE** (`argus_types.dart`) : un quatrième axe ajouté à
`ArgusScreen` fera rougir tant que le gabarit ne le nomme pas. Mutation vérifiée
— un axe factice fait tomber le garde, qui le nomme.

### 111. ✅ Corrigé le 23/08/2026 — « Un RÔLE casse la fusion » généralise depuis un seul rôle mesuré

L'avertissement de §2c dit : *« Un RÔLE posé sur l'enveloppe suffit à casser la
fusion, même sur les composants de la colonne "fusionne" »*, et l'illustre par
`textField: true`. Le mot « rôle » est un pluriel implicite ; la mesure derrière
est **singulière**.

Or `Semantics(button: true, child: InkWell(…))` est la forme exacte qu'employaient
déjà quatre composants partagés du projet d'essai — et le run 10 a mesuré **52
ancres actives** avec elle. `button:` ne casse donc pas la fusion, `textField:`
si. L'avertissement, lu tel quel, envoie défaire une instrumentation correcte.

⚠️ Le run 10 s'en est sorti parce que le skill dit ailleurs « ne raisonne pas :
`make argus-anchors` tranche ». Le repli a joué son rôle — mais un avertissement
qui oblige à recourir au repli est un avertissement qui coûte un aller-retour.

**Corrigé** : l'avertissement dit « CERTAINS rôles », nomme celui qui a été mesuré
(`textField:`), donne le contre-exemple mesuré (`button:` fusionne, 52 ancres
actives) et renvoie à la commande qui tranche plutôt qu'à l'analogie.

### 112. ✅ Corrigé le 23/08/2026 — `SlidableAction` : le critère « déclare-t-il un rôle ? » ne prédit pas un `ParentDataWidget`

Deux runs de suite ont buté dessus. `SlidableAction` n'est ni « composant qui
déclare son rôle » ni « geste » : il **retourne un `Expanded`**
(`flutter_slidable 4.0.3`, `lib/src/actions.dart:101`), donc l'envelopper lève un
`ParentDataWidget` **à l'exécution** — pas à la compilation, pas à l'analyse.

Le repli n° 3 est le bon, et les deux runs l'ont trouvé. Ce qui manque est
**l'antériorité** : la table §2c fait décider sur le rôle, et il a fallu ouvrir
la source du paquet pour savoir. Le gabarit §2b connaît pourtant la catégorie
(« Non enveloppables (ParentDataWidget, slivers) ») — la table, elle, ne dit pas
comment y arriver avant de se prendre l'exception.

**Corrigé** : une question précède désormais la table — « le composant rend-il un
widget de POSITION ? » — avec le tell (un composant qui se place dans une liste),
le geste (ouvrir la source, ou ancrer l'enfant) et le repli.

### 113. ✅ Corrigé le 23/08/2026 — `make argus-baselines` sort en ÉCHEC alors qu'il a parfaitement réussi

`--update-baselines` écrit les références, les estampille (cadrage + appareil),
loge « N référence(s) visuelle(s) écrite(s) »… puis **continue le chemin normal**
jusqu'à `exitCodeFor(findings, config.gate)`. Il hérite donc du gate des flows
qu'il vient de jouer : au run 10, `exit 1` sur une génération impeccable.

Sur un run en aveugle, ce rouge se lit « la génération a échoué » et fait
recommencer. C'est le motif du **code de sortie qui ment sur ce qui vient d'être
fait** : la seule action de la commande a réussi, son verdict porte sur autre
chose.

**Corrigé** : `baselineVerdict` est extraite, exportée et gardée. Une génération
réussie sort en 0 en disant pourquoi le gate ne s'applique pas ; **zéro référence
écrite reste un échec**, sinon « ne plus appliquer le gate » deviendrait « ne
plus jamais échouer ».

### 114. ✅ Corrigé le 23/08/2026 — `maestro check-syntax` n'accepte qu'un fichier — dit dans les références, pas dans le SKILL

`methodology-mobile.md:537` le précise (« un fichier à la fois ») ; `SKILL.md`
§3d ne le dit pas, et `make argus-lint` boucle correctement — donc le harnais est
juste, c'est la main qui se trompe. Deux minutes perdues au run 10 sur
`maestro check-syntax a.yaml b.yaml` → `Unmatched argument at index 2`.

Constat mineur, inscrit pour ce qu'il coûte, pas pour ce qu'il casse.

**Corrigé** : §3d le dit, avec le message d'erreur exact, et renvoie à la cible qui
boucle.

### 115. ✅ Corrigé le 23/08/2026 — Le ciblage d'ABI mérite d'être le geste par défaut, pas un remède

§3g le présente comme la sortie d'un `INSTALL_FAILED_INSUFFICIENT_STORAGE`. Le
run 10 l'a mesuré des deux côtés, sur le même projet :

```
make argus-build  (sans device)   →  123 231 176 octets en 15 s
make argus-build  (device branché) →   96 438 630 octets en 10 s   (−26,8 Mo, −21,7 %)
```

Il ne coûte rien — il est même **plus rapide** — et il ne demande qu'un device
branché, ce que la séquence a de toute façon à cette étape. En faire un remède,
c'est le réserver aux gens dont le disque est déjà plein.

⚠️ Le correctif du 98 rend déjà ce ciblage automatique **quand un device est
là** : le constat porte donc sur la PROSE, pas sur le code. Elle décrit encore un
geste de rattrapage.

**Corrigé** : §3g présente le ciblage comme le geste par défaut, avec les deux
mesures, et dit que construire avant de brancher l'appareil produit l'APK gras
pour rien.

### 116. ✅ Tranché le 23/08/2026 — Le jank n'a JAMAIS conclu, et la dimension est RETIRÉE

Constat non rapporté : personne ne l'a signalé, parce que le harnais est honnête
et dit « non conclu » plutôt que « 0 % ». Relevé dans les `perf.json`
sauvegardés :

```
run 5   framesRendered=0   jankComparable=null
run 6   framesRendered=1   jankComparable=null
run 7   framesRendered=0   jankComparable=null
run 8   framesRendered=1   jankComparable=null   « échantillon trop court : 1 frame, il en faut 100 »
run 9   framesRendered=1   jankComparable=null   « … 1 frame … »
run 10  framesRendered=0   jankComparable=null   « … 0 frame … »
```

⚠️ **Mon premier diagnostic était FAUX, et c'est la mesure qui l'a dit.** J'avais
écrit « c'est le protocole qui ne peut pas atteindre le seuil » et j'allais
prescrire un défilement piloté pour produire des frames. Mesuré sur device, sur
ce terrain, app au premier plan et processus vivant :

```
6 swipes verticaux                    → frames = 0
8 taps de navigation (transitions)    → frames = 0
les deux combinés                     → frames = 0
CONTRE-ÉPREUVE, appli système Réglages, mêmes 6 swipes → frames = 70
```

L'instrument mesure ; il ne voit simplement pas cette app. **`dumpsys gfxinfo`
compte le rendu HWUI de la hiérarchie de vues Android, or Flutter dessine dans
une `SurfaceView`** — visible dans les layers :
`SurfaceView[com.exemple.app/...](BLAST)#143`. Les « 1 ou 2 frames » des six
runs sont celles de la coquille Android, jamais celles de l'app.

**Ce n'est donc pas le mauvais protocole, c'est le mauvais instrument** — et
aucun défilement, si long soit-il, n'y changera rien.

Un instrument qui, lui, voit ces frames existe et a été mesuré :

```
dumpsys SurfaceFlinger --timestats -enable / -dump
  layerName   = 788924b SurfaceView[com.exemple.app/…](BLAST)#143
  totalFrames = 22            ← pour 8 swipes, là où gfxinfo en voyait 0
  droppedFrames = 0
  Jank payload for this layer: totalTimelineFrames = 0   ← VIDE sur cet Android
```

⚠️ **Mais il ne rend pas le jank par layer sur cet appareil** (`totalTimelineFrames
= 0`) ; seul l'agrégat global l'est (`jankyFrames = 1` sur 18). Basculer la
dimension dessus changerait donc sa **sémantique** — « frames tombées » n'est pas
« frames en retard » — et son contrat de sortie. **Arbitrage à trancher, pas à
prendre seul.**

**Tranché par Germinator : la dimension est retirée.** Le raisonnement décisif
n'est pas « c'est cassé » mais **« même réparé, ça mesure le mauvais binaire »** :
ce harnais tourne sur un **debug**, sur émulateur, où un chiffre de jank n'a
aucun rapport avec ce que voit un utilisateur. L'écart d'instrument masquait un
second écart, qui lui survivait.

Retiré de **tous** les consommateurs, trouvés en balayant le **vocabulaire** et
non en listant les fichiers de mémoire — deux ne me seraient pas venus : le
**manifeste du plugin** et la **description du marketplace**, c'est-à-dire ce que
lit quelqu'un qui l'installe. Et un troisième était pire qu'une prose : le
frontmatter du SKILL portait « mesurer un temps de démarrage à froid, **du jank
ou des frames sautées** » — un **déclencheur d'invocation**. Garder le
déclencheur d'une capacité retirée, c'est router la demande ici pour ne rien lui
répondre.

Les six gardes de `jankIfComparable` partent avec la fonction qu'ils gardaient.
Deux fichiers gardent le mot, et tous deux **expliquent le retrait** (tête de
`perf.mjs`, section performance de la méthodologie) : sans eux, quelqu'un le
rajoute dans six mois.

⚠️ **Si le jank redevient nécessaire**, la voie est `FrameTiming`
(`SchedulerBinding.addTimingsCallback`) côté application, en profile ou release,
sur appareil réel. Pas `adb`. Et c'est un autre chantier : le skill ne touche
aujourd'hui au code de production que pour les ancres.

### 117. ✅ Corrigé le 23/08/2026 — Mon retrait du jank a emporté DEUX fonctions, et rien ne l'a vu

`measureMemory` et `deviceContext` étaient appelées et définies nulle part. **La
dimension performance était morte à l'installation** : le run 11 l'a découverte
en `ReferenceError` à l'exécution, l'une après l'autre — corriger la première
fait apparaître la seconde.

Mon découpage a coupé du début du dartdoc du jank jusqu'au bandeau de section
suivant, et les deux fonctions vivaient dans cet intervalle.

⚠️ **Ce qui rend ce défaut instructif, c'est que TOUS mes contrôles étaient
verts** : `node --check` ne prouve que la syntaxe ; le banc n'exécutait aucun
script de mesure ; les 122 gardes ne touchent pas `perf.mjs` ; et mon propre
contrôle — « perf.mjs tourne-t-il encore sans device ? » — a rendu « ✖ aucun
device Android connecté » que j'ai lu comme une **sortie propre**. Le script
mourait avant d'atteindre le code que je venais de supprimer.

**Corrigé** : les deux fonctions restaurées à l'octet près depuis `1695fc5^`, et
le banc gagne une étape qui **déroule** `perf.mjs` et `a11y.mjs` sur leur chemin
nominal derrière un faux `adb`, en échouant sur `ReferenceError`. Mutation
vérifiée : le défaut réintroduit fait tomber le banc en nommant la fonction.

### 118. ✅ Corrigé le 23/08/2026 — Un script lancé par un chemin SYMLINKÉ ne s'exécute pas, et sort 0

Trouvé en écrivant le garde du 117, pas par le run. Le garde d'entrée compare
`resolve(process.argv[1])` à `fileURLToPath(import.meta.url)` — or **`resolve`
normalise sans résoudre les liens symboliques**, tandis que l'URL du module porte
le chemin réel. Sur macOS, `$TMPDIR` et `/tmp` sont des liens vers `/private/…` :

```
node scripts/argus/perf.mjs        → [argus-mobile] mesures sur emulator-5554 …
node /var/folders/…/perf.mjs       → (RIEN)   exit 0
```

Le script ne fait rien, ne dit rien, et rend 0. `config.mjs` est pire encore :
il compare des chaînes (`import.meta.url === \`file://${process.argv[1]}\``), ce
qui casse en plus sur tout chemin non canonique.

⚠️ **Ma première version du garde du 117 est tombée dans ce piège** : elle
lançait les scripts par chemin absolu, donc elle rapportait « déroulé » sur des
scripts qui ne s'exécutaient pas — **verte sur le défaut qu'elle venait d'être
écrite pour attraper**.

**Corrigé** : `realpathSync` des deux côtés dans les sept scripts, et le banc
exige une **sortie non vide** — un montage qui ne peut pas montrer qu'il a mesuré
ne doit pas être lu comme un succès.

### 119. ✅ Corrigé le 23/08/2026 — `known_issues.dart` promet « par égalité », mais réconcilie par clé EXERCÉE

Son en-tête dit : « CE N'EST PAS UNE LISTE D'EXCEPTIONS, C'EST UN RELEVÉ ASSERTÉ
PAR ÉGALITÉ. » Le mécanisme est `argusCheck(key, …)` → `if
(!argusKnownIssues.contains(key))`. La confrontation n'a donc lieu **que si la
clé est exercée**.

Une clé qu'aucun appel ne produit — faute de frappe, écran retiré, libellé
d'assertion reformulé — n'est jamais réconciliée et devient **une permission
permanente, en silence**. Le run 11 l'a mesuré par mutation :

| Mutation | Attendu | Obtenu |
|---|---|---|
| clé exercée dont le défaut est absent | rouge | ✅ rouge, avec « retire cette ligne » |
| clé **jamais exercée** (`shell · defaut-qui-nexiste-pas`) | rouge | ❌ **All tests passed** |

Ce que « par égalité » exigerait : comparer en fin de suite l'ensemble des clés
**produites** à l'ensemble **déclaré**, et rougir sur la différence dans les deux
sens.

**Corrigé** : un garde dérive les ids d'écran d'`argusScreens` et rougit sur toute
ligne de dette qui n'en nomme aucun — éprouvé dans les deux sens sur le banc. Et
l'en-tête dit désormais la **limite exacte** du mécanisme au lieu de promettre
l'égalité. Le reste — comparer les clés produites aux clés déclarées à travers
toutes les suites — est écrit dans le fichier, faute d'une orchestration qui
l'autorise.

### 120. ✅ Corrigé le 23/08/2026 — « TAILLE INCHANGÉE ⇒ `flutter clean` » a produit une fausse alerte

Mon correctif du 99 avertit quand le paquet ne change pas de taille. Le run 11 l'a
reçu sur un build **démontrablement frais** : marqueur unique compté dans le
`kernel_blob.bin` (`'Lecture ou pause'` → 2, chaîne introduite par cette passe),
mtime de l'APK postérieure à la dernière édition de `lib/`. L'APK préexistant
pesait simplement le même nombre d'octets.

Le remède prescrit coûte ~50 s pour rien. L'heuristique « même taille ⇒ rien
re-packagé » ne tient pas ; c'est un **indice**, pas une preuve. La technique qui
tranche — compter un marqueur du changement dans le kernel — est connue du
chantier et n'est pas câblée à l'endroit précis où elle servirait.

**Corrigé** : le critère est le **sha256**, pas la taille. Deux paquets de même
taille ont des contenus différents ; un hash identique, lui, prouve que le
fichier n'a pas été réécrit. Le garde du Makefile suit le nouveau critère.

### 121. ✅ Corrigé le 23/08/2026 — Le bloc `screens[]` « prêt à coller » de §2c-bis ne porte pas `visualCropOn`

Le gabarit donne `anchor:`, `visual:`, `priority:` — pas le cadrage. Or
`argus.mobile.yaml` explique dix lignes plus loin que « dès le deuxième écran en
`visual: true`, aucune valeur globale ne convient ». Le bloc produit donc une
configuration à retoucher aussitôt. Une ligne commentée suffirait.

**Corrigé** : le bloc porte `visualCropOn:` sur le second écran visuel, avec la
règle en commentaire — la valeur est l'ancre de la racine, juste au-dessus.

### 122. ✅ Corrigé le 23/08/2026 — `goto.yaml` : `startsWith('home')` avale le second état d'accueil sans le dire

Le point 93 a remplacé `=== 'home'` par `startsWith('home')` pour que le gabarit
et le sous-flow se rejoignent, et le commentaire l'explique bien. Ce qu'il ne dit
pas : `home-filled` matche la **même** branche, celle qui rend `assertTrue(true)`
et ne navigue nulle part.

Conséquence si quelqu'un met `home-filled` en `visual: true` : on photographie
`home-empty` sous le nom de `home-filled`, et **rien ne le signale**. Le run 11
l'a évité en ne mettant pas cet écran en visuel — par un autre raisonnement.

**Corrigé** : le commentaire dit ce que la branche coûte — tous les états
d'accueil y tombent, et un état « plein » en `visual: true` ferait photographier
l'accueil VIDE sous son nom. Un état qui demande des données a besoin de sa
propre branche.

### 123. ✅ Corrigé le 23/08/2026 — `anchors_test.dart` s'arrêtait au PREMIER échec par écran

`argusCheck` lève, donc la boucle sur `screen.commands` abandonne. Sur un écran à
24 commandes dont plusieurs sous le pli, découvrir l'ensemble demande une
exécution par ancre. Le run 11 s'en est sorti en **déduisant** les ancres voisines
— exactement ce que le skill dit de ne pas faire (« on ne raisonne pas : on
mesure »).

Le message et l'indice de pli sont bons ; il manque de les **collecter** avant de
lever.

**Corrigé — et la façon dont il l'a été compte autant que le correctif.** La
première tentative câblait les quatre boucles **par substitution** : deux fois un
fichier qui ne compile plus, parce qu'envelopper `await argusCheck(…)` demande de
refermer une parenthèse dont la position dépend du corps de l'appel.

La reprise change d'angle plutôt que d'insister : la collecte devient
**ambiante**. `argusCheck` route sa levée par un seul point qui, selon qu'une
collecte est ouverte, lève ou **retient**. Chaque boucle gagne alors **deux
lignes** — `argusCollecteDebut()` après `ensureSemantics`, `argusCollecteFin(id)`
après `dispose`. Aucun site d'appel touché, aucune parenthèse déplacée.

⚠️ Deux pièges fermés en chemin :
- **retenir doit RENDRE LA MAIN, pas relancer** — une exception à cet endroit
  arrêterait la boucle, c'est-à-dire le défaut qu'on corrige ;
- le désarmement est posé en `addTearDown`, donc il a lieu même si le test meurt
  avant la fin : sans ça, une collecte restée ouverte avalerait les échecs du
  test suivant.

**Éprouvé sur le banc, quatre fois** : deux ancres absentes rendent **4 défauts
en une exécution** ; un seul échec sort **tel quel**, sans enrobage « N défauts » ;
un écran sain reste vert ; et la mutation (le collecteur qui relance) fait
retomber le relevé de **8 mentions à 2**.

⚠️ **La mutation a d'abord rendu « 0 », et ce zéro ne mesurait rien** : le banc
repose le scaffold à chaque exécution, donc il avait écrasé ma sonde. Vérifier
que le montage arme AVANT de lire son verdict — c'est la troisième fois de la
journée que ce contrôle change une conclusion.

### 124. ✅ Corrigé le 23/08/2026 — Le `argus.mobile.yaml` livré contredit le cadrage que le §1 recommande

Valeurs par défaut : `avd: ''` + `autoStart: true`. Or le §1 demande d'écrire
« device = émulateur `<AVD>` », et `device-matrix.md` dit que `avd` et
`autoStart: true` **ne se combinent pas** (`start-device` crée son propre AVD).
Suivre le cadrage impose donc de retourner le drapeau soi-même, sans que rien ne
le rappelle à cet endroit.

**Corrigé** : l'entrée de device dit, à l'endroit où on la lit, qu'il faut
renseigner `avd:` et retourner `autoStart:` — et pourquoi les deux ne se
combinent pas. Les valeurs livrées sont celles d'une CI, pas d'une machine.

### 125. ✅ Corrigé le 23/08/2026 — La table §6 de la méthodologie laisse croire que la couverture d'ancres est mesurée

« Couverture des ancres sémantiques → `.maestro/a11y.yaml` » se lit comme une
mesure automatique. Le flow livré n'asserte que l'ancre d'accueil ; **tout le
reste est à écrire à la main**. La table gagnerait à le dire.

**Corrigé** : la ligne porte « une assertion par ancre, que TU écris », et un
avertissement dit que le flow livré n'asserte que l'ancre d'accueil.

### 126. ✅ Corrigé le 23/08/2026 — Le cadrage est dispersé : `run:` en tête, le device 90 lignes plus bas

Conséquence directe de mon correctif du 109. Le §1 demande d'écrire le cadrage
« à l'endroit que chaque choix gouverne » ; `env` et `mode` ont désormais leur
clé en tête du fichier, le device vit dans `devices[]`, et le run 11 a dû écrire
le cadrage **à deux endroits** pour le rendre relisible d'un bloc.

⚠️ Le correctif du 109 était juste et ce point ne le défait pas : il demande
seulement que le §1 dise où va quoi, ou qu'un renvoi relie les deux.

**Corrigé** : le §1 nomme les trois emplacements (`run:`, `devices[]`, `app:`) et
assume que le cadrage est réparti — avec la raison, et l'interdit qui va avec :
un bloc en tête **en plus**, jamais **à la place**, parce qu'un commentaire ne
gouverne rien.

### 127. ✅ Corrigé le 23/08/2026 — §3g dit « la suite », alors que le critère est « le flow qui produit la capture »

Le texte justifie l'ordre run → baselines → run ainsi : « une référence prise sur
une suite dont on n'a pas encore prouvé qu'elle tourne fige un écran qu'on n'a
jamais vu arriver ». Juste — mais trop large.

Le run 12 est arrivé au premier `argus-run` avec **un** flow rouge, le sien
(`lifecycle`, un retour manquant vers l'accueil), sans aucun rapport avec les
quatre écrans visuels. Il a généré quand même, à raison, et l'a écrit : *le skill
ne dit pas si c'est légitime*. Ce qui doit être vert avant de figer une
référence, c'est **le flow qui la produit**, pas la suite entière.

**Corrigé** : §3g dit désormais que le critère est **le flow qui produit la
capture**, avec le cas vécu — un `lifecycle` rouge n'invalide aucune référence de
`home-empty`, il ne la produit pas.

### 128. ✅ Corrigé le 23/08/2026 — Le piège du `startsWith` vaut pour TOUTE famille d'états — voisin de mon 122

Mon correctif d'aujourd'hui a documenté, dans `goto.yaml`, ce que la branche
`startsWith('home')` coûte : tous les états d'accueil y tombent, et un
`home-filled` en `visual: true` ferait photographier l'accueil vide sous son nom.

Le run 12 a rencontré **exactement le même piège pour `history-empty` /
`history-filled`**, et a dû écrire la condition à la main. Le fichier ne parle que
de `home`.

⚠️ **C'est mon propre correctif du jour qui a laissé son voisin.** J'ai écrit le
coût de la branche pour la famille que le run précédent avait citée, au lieu de
l'écrire pour **les familles d'états** en général. La leçon du chantier
s'applique à moi une fois de plus : un correctif ponctuel là où il fallait un
énoncé général.

**Corrigé par la RÈGLE, pas par le cas** : le commentaire énonce « une branche
par état qui demande une préparation ; le `startsWith` n'est légitime que pour
les états auxquels le lancement mène déjà », et nomme les familles voisines
(`history-*`, `categories-*`) pour qu'on n'ait pas à les redécouvrir une par une.

### 129. ✅ Corrigé le 23/08/2026 — Rien ne dit COMMENT choisir entre `commands:` et `commandsAfterScroll:`

`argus_types.dart` documente parfaitement le troisième état et ses deux moitiés
— mais pas la méthode. Or la seule praticable est : **tout déclarer en
`commands:`, lancer, et déplacer ce que le message prescrit**. Le harnais tranche
dans les deux sens (absente-mais-plus-bas, et déclaration périmée), c'est même sa
force.

Le run 12 l'a découvert en payant une itération : son découpage initial était une
intuition, et le harnais a corrigé **neuf** déclarations d'un coup. Une phrase —
« ne devine pas le pli, le harnais te le donne » — ferait gagner ce tour à tout
le monde.

**Corrigé** : le dartdoc ouvre sur « NE DEVINE PAS LE PLI » et donne la méthode —
déclarer, lancer, déplacer ce que le message prescrit — en rappelant que le
harnais tranche dans les **deux** sens.

### 130. ✅ Corrigé le 23/08/2026 — Le §SECURITY de la méthodologie ne mentionne pas `build.androidScan`

C'est pourtant la clé qui **débloque la dimension** : sans elle, le scan porte sur
un binaire debug et s'arrête avec « un scan de sécurité n'y dit rien de la
publication ». Elle est très bien documentée dans `argus.mobile.yaml`, et absente
de la section qui décrit la mesure. Le run 12 l'a trouvée **en lisant
`sec.mjs`**.

**Corrigé** : le §PERFORMANCE/SÉCURITÉ nomme `build.androidScan` et dit qu'elle
est ce qui envoie le scan sur un binaire de publication.

### 131. ✅ Corrigé le 23/08/2026 — Le skill fait prouver l'INSTALLATION, jamais le CONTENU du binaire

`installProof` est soigné — « Success » plus `pm list packages`. Mais rien ne
demande de vérifier que le binaire installé porte **le code du moment**, et c'est
un geste distinct : une installation prouvée n'exclut pas un kernel périmé.

Le run 12 l'a fait de lui-même, et s'est heurté au piège classique : sa première
contre-épreuve, `com.exemple.app`, rendait **0** dans le `kernel_blob.bin`
— l'identifiant vit dans le manifeste, pas dans le kernel Dart. Un instrument
mort qui aurait pu faire conclure « le binaire est périmé ». Il l'a démasqué en
prenant un littéral Dart de l'app comme motif certain.

**Corrigé** : §3g porte la commande de comptage du marqueur, et les deux pièges —
**piper** au lieu de capturer (une capture tronque au premier octet nul et rend 0
pour tout motif), et une **contre-épreuve** dont l'absence serait impossible, avec
l'erreur exacte du run (l'identifiant d'application rend 0 : il vit dans le
manifeste, pas dans le kernel Dart).

### 132. ✅ Corrigé le 23/08/2026 — L'avertissement de locale est systématique dans la disposition RECOMMANDÉE — voisin de mon 124

`run.mjs:1284` avertit dès que `locale.deviceLocale` est renseignée et
`autoStart: false`. Or c'est **exactement** la disposition que mon correctif du
124 vient de recommander (`avd:` nommé ⇒ `autoStart: false`). Trois lignes de
bruit à chaque exécution, sur une configuration que le skill demande.

L'avertissement dit vrai — la locale déclarée n'a aucun effet sans `autoStart`.
Mais il ne devrait sortir que quand ça **compte** : quand la locale du device
diffère de celle demandée. Le runner sait la lire
(`adb shell settings get system system_locales`).

**Corrigé** : `localeWarnings` est extraite, décidée **après** la résolution du
device, et compare la locale demandée à celle que l'appareil rend. Silence quand
elles coïncident — le cas nominal du skill —, avertissement quand l'écart est
réel ou la locale illisible. Six cas éprouvés, mutation vérifiée.

### 133. ✅ Corrigé le 23/08/2026 — `goto.yaml` DOCUMENTAIT son piège sans le fermer

Vingt-quatre lignes de commentaire expliquaient pourquoi `startsWith('home')`
sert un état et ment sur ses voisins — **directement au-dessus de la ligne qui
posait le piège**. Le run 13 l'a dit sans détour : « le fichier documente son
propre piège sans le désamorcer », et a remplacé la condition à la main.

⚠️ **Mes deux passes précédentes sur ce fichier (122 puis 128) n'ont fait que
décrire.** J'ai écrit le coût, puis la règle générale, sans jamais toucher au
code. Trois runs consécutifs sont tombés dessus.

**Corrigé — la branche se DÉRIVE.** `buildEnv` expose `ARGUS_START_SCREEN`,
l'id de l'écran déclaré `start: true`, à côté de l'ancre qu'il exposait déjà ;
`goto.yaml` compare dessus. Mesuré des deux côtés : `home-empty` obtient « rien à
naviguer », tandis que `home-filled`, `history-empty` et `categories-filled`
tombent enfin dans une branche qui doit les **préparer**.

Le commentaire est passé de 24 lignes à 8, et c'est le vrai signe : **un piège
décrit demande des paragraphes, un piège fermé demande une phrase.**

### 134. ✅ Corrigé le 23/08/2026 — Le §VISUAL parle de `visualCropOn` comme d'une clé globale

`methodology-mobile.md` la présente au niveau global ; `argus.mobile.yaml`
explique en commentaire qu'elle se pose **par écran** dès le deuxième écran
visuel. Les deux sont justes, et rien ne relie l'un à l'autre : le run 13 a dû
lire les deux pour comprendre que la clé globale devait rester vide.

**Corrigé** : le §VISUAL dit « par ÉCRAN dès que deux écrans sont en `visual:
true` », que la clé globale reste alors vide, et renvoie au détail du YAML.

### 135. ✅ Corrigé le 23/08/2026 — Le device livré contredit toujours la consigne — et je l'avais seulement COMMENTÉ

Le point 124 a ajouté, dans `argus.mobile.yaml`, un avertissement disant de
renseigner `avd:` et de retourner `autoStart:`. **Les valeurs livrées n'ont pas
bougé** (`avd: ''`, `autoStart: true`) — donc le seul endroit du scaffold où le
défaut contredit la consigne principale du §1 le contredit encore.

⚠️ **Même motif que le 133, découvert dans le même run** : j'ai décrit ce qu'il
fallait changer au lieu de le changer. Le run 13 propose le bon défaut :
`autoStart: false`, qui échoue **bruyamment** si personne n'a démarré le device —
au lieu d'en créer un autre en silence.

**Corrigé — la VALEUR, pas le commentaire.** `autoStart: false` devient le défaut :
il échoue bruyamment si personne n'a démarré le device, au lieu d'en fabriquer un
autre en silence. Et il convient aussi en CI, où l'action de provisionnement a
déjà démarré l'émulateur.

### 136. ✅ Corrigé le 23/08/2026 — Le gabarit `screens[]` de §2c-bis ignore le troisième état — voisin du 110

Le 110 a doté le **rapport d'instrumentation** de ses cases manquantes
(« Affichages », « Sous le pli »). Le gabarit YAML « prêt à coller » de la même
section, lui, ne montre toujours ni `commandsAfterScroll` ni
`displays`/`displaysAfterScroll`.

Sur ce projet, **7 des 79 ancres** relevaient du troisième état. Le run 13 ne l'a
su qu'en lançant `argus-anchors` — ce qui est le bon geste (129), mais le gabarit
laisse croire que le relevé se fait à l'œil.

**Corrigé** : le gabarit nomme `commandsAfterScroll:` / `displaysAfterScroll:` et
dit de ne pas les deviner — déclarer, lancer, déplacer ce que le message
prescrit. Avec le chiffre du terrain : 7 ancres sur 79, aucune visible à l'œil.

### 137. ✅ Corrigé le 23/08/2026 — `a11y.yaml` : chaque `goto` suppose l'état de sortie de `launch-clean`

Non dit, et ça a coûté **un run device complet (~7 min)**. Enchaîner deux `goto`
sans revenir à l'onglet d'accueil échoue sur `Element not found: Id matching
regex: home_empty_start` — c'est-à-dire le message qui envoie chercher un défaut
d'instrumentation inexistant, exactement le piège que le skill décrit ailleurs.

**Corrigé** : l'avertissement est en tête d'`a11y.yaml`, avec le message d'erreur
exact qu'on obtient et le geste qui l'évite.

### 138. ✅ Corrigé le 23/08/2026 — `make argus-baselines` relance TOUTE la suite fonctionnelle

12 flows au lieu des 6 qui produisent des captures. Le skill la présente comme
l'étape courte entre deux `argus-run` ; en pratique la séquence prescrite coûte
**trois passes device pleines**, et ce coût n'est chiffré nulle part.

**Corrigé** : §3g chiffre la séquence — **trois passes device pleines**, `argus-baselines`
rejouant toute la suite fonctionnelle (12 flows pour 6 captures). Et dit que ça
ne se refait qu'une fois.

### 139. ✅ Corrigé le 23/08/2026 — Le tableau du §7 présente la couverture a11y comme une capacité livrée

`a11y (couverture sémantique) | Maestro | device` se lit comme une mesure fournie.
C'est **entièrement du travail projet** — 75 étapes écrites à la main sur ce
run. Le §A11Y le corrige deux pages plus loin ; le tableau est ce qu'on lit en
premier. C'est le voisin du 125, qui avait corrigé l'autre table.

**Corrigé** : la ligne du tableau porte « flow à ÉCRIRE, une assertion par ancre ».
C'est le voisin du 125, qui avait corrigé l'autre table — les deux disent
maintenant la même chose.

### 140. ✅ Corrigé le 23/08/2026 — La contre-épreuve du marqueur binaire mérite les deux encodages

Le §3g dit de prendre « un littéral que l'app affiche ». Sur une app francophone,
un littéral affiché est **accentué**, donc encodé autrement dans le
`kernel_blob.bin` — le conseil et l'avertissement d'encodage vivent dans deux
documents séparés. Le run 13 a pris les deux « à tout hasard » et les deux ont
rendu 2 ; réunis, ils diraient : **un accentué ET un ASCII**.

**Corrigé** : §3g demande **deux** contre-épreuves, une accentuée et une ASCII, avec
le mécanisme (Latin-1 tant que tout tient sur un octet, UTF-16 dès la première
lettre accentuée) et ce qu'un zéro ferait conclure à tort.

### 141. ✅ Corrigé le 23/08/2026 — Le gabarit du rapport d'instrumentation n'a pas de case pour l'AVANT/APRÈS

§2b décrit l'état *trouvé* (`X posées / Y à poser`) — mais en REGRESS le livrable
est justement que `Y` tombe à zéro. Rendu une seule fois, le bloc est soit
périmé, soit trompeur : « 53 posées / 0 à poser (100 %) » cache que **tout** était
à faire.

Le run 14 a rendu les deux états, et l'a dit : c'est exactement l'improvisation
de format que ce bloc existe pour empêcher.

**Corrigé** : §2b demande le relevé **deux fois en REGRESS** — état trouvé, état
laissé — et dit pourquoi une seule fois ment.

### 142. ✅ Corrigé le 23/08/2026 — ⚠️ La séquence du §3g fait PUBLIER une fausse régression

L'ordre prescrit finit par : contre-épreuve (remplacer une référence par un
aplat, relancer la comparaison) puis `argus-report`. Or `make argus-visual` est
`run.mjs --tags=visual`, qui **réécrit `report.json`** (l. 1572) — avec la
régression fabriquée dedans. Rien ne dit de rejouer `argus-run` derrière.

Un agent qui suit la lettre publie donc, comme un fait, un défaut qu'il vient de
créer lui-même. C'est l'anti-pattern « lire un journal de VÉRIFICATION comme un
journal de RÉSULTATS » — **provoqué par le skill**. Le run 14 s'en est aperçu et
a rejoué une troisième passe ; il ne le devait qu'à sa vigilance.

⚠️ Le fond du défaut n'est pas la ligne manquante : c'est qu'un run **partiel**
(`--tags=…`) écrase le rapport complet sans que rien ne l'indique. Le rapport ne
porte aucune trace des tags employés.

**Corrigé À LA SOURCE, pas par une ligne à retenir.** `report.run.scope` se dérive
des tags, et le HTML affiche un bandeau « partiel » qui nomme le filtre. Un
rapport issu d'un run filtré ne peut plus passer pour complet. Éprouvé des deux
côtés : `complet` n'affiche rien, `filtré (+visual)` affiche le bandeau.

§3g gagne quand même son **quatrième temps** (restaurer, puis rejouer un run
COMPLET avant le rapport) : le bandeau prévient après coup, l'ordre doit être bon
avant.

### 143. ✅ Corrigé le 23/08/2026 — `methodology-mobile.md` situe mal l'empreinte de cadrage

La doc dit `.maestro/_baselines/.argus-crop`. Le code écrit dans `baselineDir`,
qui vaut `.maestro/_baselines/<device-id>/` (`run.mjs:1359`). Le fichier
`.argus-device`, écrit au même endroit, n'est pas mentionné du tout. Deux minutes
perdues et un `cat` en erreur dans le relevé du run.

**Corrigé** : le chemin porte l'id du device, et `.argus-device` — qui vit à côté
et n'était pas documenté — est nommé avec ce qu'il sert à empêcher.

### 144. ✅ Corrigé le 23/08/2026 — `argus-build` ne dit rien quand le paquet a bien changé

Mon correctif du 120 avertit sur un sha256 **identique**. Quand le hash diffère,
il se tait — et le run 14, voyant `96 438 630 → 96 438 630 octets`, n'avait aucun
moyen de savoir si le contrôle avait tourné. Un silence se lit « rien n'a été
vérifié » aussi bien que « tout va bien ».

**Corrigé** : la cible dit aussi quand le paquet **a** été réécrit, et pourquoi le
hash tranche là où deux tailles égales ne prouvent rien.

### 145. ✅ Corrigé le 23/08/2026 — Aucune règle d'arrêt pour `a11y.yaml`

Le §6 demande « une assertion par ancre déclarée » — avec 53 ancres de commande,
le flow ferait plusieurs centaines de lignes et des minutes de device. `visual:
true` a sa règle d'arrêt explicite ; la couverture a11y n'en a aucune. Le run 14
a retenu les racines + la coquille + 2 à 4 commandes par écran, **faute de
critère**, et l'a signalé.

**Corrigé** : la règle d'arrêt est écrite — racine de chaque écran déclaré, la
coquille, deux à quatre commandes par écran — avec l'argument qui la justifie :
le reste appartient à `anchors_test`, qui les couvre toutes pour zéro seconde de
device.

### 146. ✅ Corrigé le 23/08/2026 — Rien ne dit où poser les doubles de test du projet

`harness.dart` est présenté comme « le fichier à éditer », mais un écran qui
exige quatre blocs falsifiés et un service d'injection y ajoute 150 lignes qui ne
sont pas de la déclaration. Le run 14 a créé `test/argus/argus_fakes.dart` (159
lignes) — bon réflexe, mais ce fichier n'a **ni marqueur de classement, ni ligne
dans l'inventaire que l'installeur imprime**. Il disparaît du seul relevé que la
personne suivante lira.

**Corrigé** : un fichier voisin, et **le marqueur `ARGUS:OWNED` en en-tête** — sans
lui il n'apparaît ni dans la liste de sortie de l'installeur, ni dans `--check`.

### 147. ✅ Corrigé le 23/08/2026 — Deux chiffres de démarrage se lisent comme une contradiction dans le HTML

`perf.json` rend `coldStartMs: 1314` (sous le budget de 2 000) pendant que
`QAM-START` annonce 8 031 ms en `major`. Les deux sont justes — première frame
contre écran exploitable — et `report.json` porte un champ `measures` qui
l'explique. Mais le HTML les met côte à côte **sans reprendre cette phrase**, et
la lecture naturelle est « l'outil se contredit ».

**Corrigé** : le HTML rend la phrase que `report.json` portait déjà et que rien
n'affichait. Éprouvé dans les deux sens.

### 148. ❌ PAS un défaut du skill — le tap-to-pause n'est exercé par aucun flow

Le run 14 signale que `runner_toggle` est prouvé porteur d'une action par
`argus-anchors`, mais qu'aucun flow ne le tape : la forme est vérifiée, l'effet
non. Le constat est juste et honnête — **c'est un manque de SON parcours
critique**, pas du skill, qui ne prescrit pas quels gestes métier éprouver.

Inscrit pour ce qu'il enseigne : une ancre prouvée *présente et active* ne dit
rien de ce que son appui déclenche. La distinction vaut d'être connue ; elle
n'appelle aucune correction ici.

### 149. ✅ Corrigé le 24/08/2026 — ⚠️ Le SKILL promettait quelque chose que le code ne faisait pas

Le 146, écrit la veille, dit : « déclare-le `ARGUS:OWNED` en en-tête : sans ce
marqueur, il n'apparaît ni dans la liste que l'installeur imprime en sortant, ni
dans son `--check` ». **C'était faux le jour où je l'ai écrit.** La boucle finale
itérait `find "$SCAFFOLD_DIR"`, donc elle ne pouvait lister que les fichiers du
scaffold — jamais un fichier créé dans le projet.

Le run 15 a posé le marqueur, mesuré, et n'a rien trouvé. Reproduit ici : le
fichier porte bien `ARGUS:OWNED` et reste invisible.

⚠️ **C'est l'anti-pattern que ma propre mémoire décrit** — une promesse de
comportement technique écrite dans un document, que rien ne mesure — et je l'ai
commise **en corrigeant un autre constat**. Un correctif de doc est du code non
testé tant qu'un garde ne le tient pas.

**Corrigé** : la liste parcourt la cible d'abord (sa copie fait foi, c'est elle
qu'on ouvrira) puis le scaffold, dédupliquée sur le chemin relatif. Gardé de bout
en bout dans un dossier temporaire : un fichier marqué du projet est listé, un
non marqué ne l'est pas, aucun doublon, aucune erreur shell.

⚠️ **Deux instruments ont menti en l'écrivant** : une substitution de processus
imbriquée faisait **exécuter** les noms de fichiers par bash, et `sort -t"\t"`
passe un antislash et un « t » au lieu d'une tabulation — la déduplication
tournait sur le mauvais champ et coupait la liste de dix entrées à deux, sans un
mot. Les deux ont été pris en mesurant la sortie, jamais en la relisant.

### 150. ✅ Corrigé le 24/08/2026 — `perf.mjs` pouvait perdre la mémoire en silence

`dumpsys meminfo` rend « No process found » sur un processus mort, la regex ne
matche pas, et `memoryMb` valait **`null`** — sans finding, sans « sauté », sans
un mot. Le run 15 a relevé 314,6 Mo à la main pour un budget de 250 : **un
finding `major` que la chaîne avait silencieusement perdu**.

Le skill promet pourtant qu'« un outil absent donne une dimension sautée et
mentionnée, jamais un faux vert ». Ici l'outil était là et fonctionnait.

**Corrigé** : l'app est relancée avant la pesée, une seconde tentative suit, et
une mesure absente est **annoncée** — parce qu'un `null` muet est pire qu'une
dimension sautée : il ne se voit nulle part. Éprouvé des deux côtés derrière un
faux `adb`.

### 151. ✅ Corrigé le 24/08/2026 — `make` aplatit le contrat de sortie 0/1/2

Mesuré : `run.mjs --tags=smoke` rend **1**, `make argus-smoke` rend **2** pour le
même run. GNU make sort en 2 dès qu'une recette échoue. Un humain qui lit `make`
ne distingue donc pas un `major` d'un `blocker`.

**Corrigé** : dit là où les cibles sont définies. La CI appelle le script
directement, elle n'est pas concernée.

### 152. ✅ Corrigé le 24/08/2026 — `<W>` du gabarit : des widgets ou des call-sites ?

La ligne « Non enveloppables : `<W>` » ne disait pas ce que `W` compte. Le run 15
a compté les call-sites (4 `SlidableAction`), un autre compterait 1 composant.
Les trois ⚠️ voisines ferment exactement ce genre d'ambiguïté sur les autres
lignes.

### 153. ✅ Corrigé le 24/08/2026 — §3g ne couvre pas le flow rouge pour raison de TIMING

Le skill dit qu'un flow rouge sans rapport n'invalide pas une référence. Il ne
dit rien du cas où le flow échoue **parce que l'app est lente** : l'échec est
alors un `Assertion is false: id: <ancre de départ> is visible`, il concerne tous
les flows, et il faut relever `startTimeoutMs` **avant** de générer.

⚠️ Avec la précision qui compte : **ne pas toucher à `coldStartMs`**, sinon la
lenteur disparaît dans un seuil au lieu de rester un finding. Le run a mesuré une
dispersion de 6 090 à 23 244 ms sur le même écran, **sans identifier le
mécanisme** — et l'a écrit plutôt que d'inventer une explication.

### 154. ✅ Corrigé le 24/08/2026 — Que faire quand l'AVD est DÉJÀ dans la bonne locale

`device-matrix.md` explique que `deviceLocale` n'a aucun effet sans `autoStart`,
sans dire s'il faut alors vider la clé. **Corrigé** : la laisser — elle documente
l'intention, et depuis le 132 le runner ne parle que lorsque l'écart est réel.

### 155. ✅ Corrigé le 24/08/2026 — `argus-perf` n'était pas chiffré

~9 min à lui seul (quatre démarrages à froid, trois à chaud, la pesée). Le run 15
l'a tué deux fois avec son propre timeout de dix minutes avant de comprendre que
le script allait bien. **Corrigé** : chiffré à côté du coût des références.

## Run 16 — quatrième vérification, et le message qui conseille l'inverse de la doc

### 156. ⚠️ Le message d'échec conseille le levier que le SKILL interdit de toucher

`startupHint` (`run.mjs`) colle à un flow rouge : « Vérifie d'abord le temps de
démarrage (`thresholds.coldStartMs` = 2000 ms, relevé dans `startup.samples`) ».
Le SKILL.md dit l'inverse, mot pour mot : « Relève `startTimeoutMs` **avant** de
générer […] **et ne touche pas à `coldStartMs`** : la lenteur doit rester un
finding, pas disparaître dans un seuil. »

Mesuré : `startTimeoutMs` n'apparaît dans **aucun** message émis par le runner
(grep des `log(`, `warn(`, `return \``). Le seul nom de clé qu'on donne à
quelqu'un dont le flow est rouge est donc celui qu'il ne faut pas bouger — et le
relever *marche*, via `Math.max(20000, coldStartMs * 5)`, en rendant muet le gate
de performance. C'est exactement le piège que le commentaire de `startTimeoutMs`
décrit sur seize lignes, et pour lequel la fonction a reçu un levier à elle.

Même famille que le 98 : ni la doc ni le code ne sont faux séparément, c'est leur
**écart** qui l'est — et aucun test ne peut le voir, puisqu'il n'y a aucun
comportement à casser.

### 157. ⚠️ L'ancre d'état qui ne remonte pas à Android — absente du skill

Le run a buté sur `Assertion is false: id: categories_filled_root is visible`,
avec un dump de hiérarchie montrant `categories_empty_root` **contenant**
`categories_item` : un nœud « vide » plein de contenu.

Faire varier `identifier` sur un `Semantics` **réutilisé** ne se propage pas à la
couche d'accessibilité Android — le nœud garde l'identifiant de sa première
construction. L'agent a d'abord soupçonné l'instrumentation, puis **réfuté cette
hypothèse par une sonde à l'étage 1** : Flutter rendait bien les deux ancres.
Remède posé : `key: ValueKey<bool>(…)`, qui force un nœud neuf.

Zéro occurrence dans le skill (`ValueKey`, `nœud neuf`, `ne se propage`). C'est un
défaut **fonctionnel**, pas un trou de prescription : le flow échoue, et le
message accuse l'ancre.

### 158. La couverture ne croise jamais l'étage 1 et l'étage 2

`coverage.notConfigured` a rendu `[]` — vrai, et flatteur. Les trois relevés
(`screensDeclared`, `screensConfigured`, `notConfigured`) dérivent **tous** de
`config.screens` : un état absent de cette liste est invisible aux trois.

Le run en avait quatre, montés à l'étage 1 seul et volontairement hors `screens[]`
(`runner-break`, `runner-error`, `confirm-sheet`, `category-sheet`) — un arbitrage
défendable, l'agent l'écrit dans `harness.dart`. Mais **le rapport, lui, ne le dit
pas** : il affiche « 10 déclarés · 10 avec ancre », quand `visualScreens` n'en
couvre que 4.

Le compteur ne ment pas : il répond à une question plus étroite que celle qu'on
lui pose. Même famille que le nombre qui décrit le contenu sans le dériver de la
donnée.

### 159. Aucun nom de paramètre prescrit pour propager une ancre à un composant partagé

Le SKILL.md écrit `composant partagé, 14 call-sites → <param d'ancre>` : un
**placeholder**, jamais un nom. Le mécanisme est prescrit — « le composant place
lui-même l'ancre sur son enfant, et le call-site n'écrit qu'une chaîne » — le
vocabulaire non.

Conséquence mesurée : ce run a employé `semanticIdentifier:` (19 sites) et
`anchorPrefix:` (2 composants). Le comparateur d'étalons, lui, cherche
`semanticId:` / `semanticIdPrefix:` — un nom que **personne n'a jamais employé** :
son relevé `anchors.byParam` vaut **0 sur les douze runs mesurés** (4 à 16). Il
n'a jamais rien mesuré, et la cause est ici.

⚠️ Le remède n'est pas évident et ne doit pas être expédié : le nom d'un paramètre
d'API appartient au projet hôte, et l'imposer serait intrusif. Mais sans
convention, rien de stable n'est mesurable — ni par un garde du scaffold, ni d'un
run au suivant.

### 160. Le provider que l'écran résout LUI-MÊME, dont le symptôme est une fausse ancre manquante

`_TypeError: type 'Null' is not a subtype of type 'AppVersionCubit' in type cast`
au montage d'un écran : celui-ci résolvait son cubit dans `get_it`, si bien que le
provider posé par le test **au-dessus** était ignoré.

⚠️ **Le symptôme observé était « une ancre manquante »** — un diagnostic qui
accuse l'instrumentation pour un défaut de montage. Et c'est ce correctif qui a
fait passer `settings_version` de « absente partout » à « sous le pli » : sans
lui, on déplaçait une déclaration sur la foi d'une mesure prise sous un montage
cassé.

Le skill explique comment monter un écran qui a besoin d'un `BlocProvider`
(`harness.dart`), jamais ce cas-ci — où le provider du test est **masqué** par
celui que l'écran se donne. Le tell est que l'exception tombe au montage et non à
l'assertion.

## Ce qui reste

**Les points 156 à 160**, inscrits le 24/08/2026 au dépouillement du run 16.
Aucun n'est encore traité.

⚠️ **Le compteur de sortie : CINQ constats, cinq exigent de modifier le skill.**
Pas encore la sortie — mais le meilleur run depuis le 11 sur deux axes que le
seul ratio ne montre pas : **aucune régression introduite par mes correctifs**
(le run 11 en avait deux), et **aucune promesse fausse** (le run 15 en avait une,
écrite la veille). Deux constats sont fonctionnels (156, 157), trois sont des
trous de prescription (158, 159, 160).

⚠️ **Trois constats du compte rendu ont été DÉMENTIS en les reproduisant**, et
c'est ce que le dépouillement rapporte de mieux :
- les deux grandeurs de démarrage (`am start -W` contre l'attente d'ancre) sont
  déjà distinguées **explicitement** dans le code, commentaire à l'appui ;
- l'entrée périmée de `.argus-crop` disparaîtra bien seule : le fichier est
  **reconstruit** (`Object.fromEntries(visualScreens.map(…))`), jamais fusionné ;
- rendre public un widget privé pour le monter n'était pas un arbitrage sans
  instruction : le skill le prescrit, et `_ConfirmSheet` → `ConfirmSheet` est son
  exemple littéral.

Le reste du compte rendu ne concerne pas le skill : les 55 entrées de dette
décrivent l'application d'essai (25 débordements, 14 cibles sous 48 dp, 9
contrastes sous AA, 2 surfaces tapables sans label), et `osv-scanner` absent est
une affaire de machine — la dimension a été **sautée et dite**, jamais verte.
