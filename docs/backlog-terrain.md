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

### 156. ✅ Corrigé le 24/08/2026 — ⚠️ Le message d'échec conseillait le levier que le SKILL interdit

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

**Corrigé** : le message nomme `startTimeoutMs`, donne le plafond effectif, et
dit de ne PAS toucher à `coldStartMs`. Le garde est **dérivé** — il lit le levier
prescrit dans le SKILL.md plutôt que de le recopier, sinon message et garde
bougeraient ensemble. Mutation vérifiée : l'ancien texte le fait tomber.

### 157. ✅ Corrigé le 24/08/2026 — ⚠️ L'ancre d'état qui ne remonte pas à Android

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

**Corrigé** : écrit là où le gabarit `screens[]` montre `home-empty` à côté de
`home-filled` — l'endroit exact où quelqu'un déclare deux états et tombe dedans.
⚠️ **Sans garde exécutable, et c'est écrit dans le SKILL** plutôt que laissé à
deviner : le fait décrit appartient à la couche d'accessibilité d'Android, donc
aucun test de ce dépôt ne l'atteint. Un garde n'y réasserterait que la prose.

### 158. ✅ Corrigé le 24/08/2026 — La couverture ne croisait jamais l'étage 1 et l'étage 2

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

**Corrigé** : la ligne porte le compte **comparé visuellement** — qui ne dérive
pas de la même source — et écrit que « N sur N » ne veut pas dire « tout est
couvert ». Elle a été **extraite** du gabarit HTML en `coverageLine()` exportée,
car elle vivait là où rien ne pouvait l'exercer : c'est ce qui l'a laissée
dériver. Trois gardes, les deux sens couverts.

### 159. ✅ Corrigé le 24/08/2026 — Aucun nom de paramètre prescrit pour un composant partagé

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

**Corrigé, arbitrage tranché par Germinator** : un défaut nommé mais
**dérogeable** — `semanticIdentifier` (aligné sur le `semanticLabel` de Flutter
et sur le champ qu'il alimente) et `anchorPrefix` pour une famille d'ancres ; un
projet qui a déjà sa convention la garde et l'**écrit dans le rapport**. Le garde
n'est pas circulaire : il compare les deux endroits qui doivent s'accorder, la
prose qui prescrit et le gabarit qui montre.

⚠️ **Le comparateur d'étalons n'est PAS corrigé**, et c'est délibéré : figé par
sha256 depuis le run 4 pour que les seize relevés restent comparables, le
modifier ferait bouger la mesure en même temps que l'objet mesuré. Son README
dit désormais que ce relevé-là ne mesure rien.

### 160. ✅ Corrigé le 24/08/2026 — Le provider que l'écran résout LUI-MÊME

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

**Corrigé** : écrit dans `harness.dart`, juste sous la ligne qui dit que le
harnais ne devine pas tes dépendances — le point d'usage, pas une note lointaine.
⚠️ Sans garde exécutable pour la même raison que le 157, et pour la même raison
l'absence est écrite plutôt que tue.

## Run 17 — le défaut que seize runs ne pouvaient pas voir

### 161. ✅ Corrigé le 24/08/2026 — ⚠️ Trois scripts ignoraient l'AVD déclaré

`device-matrix.md` promet en titre : « **Désigner un device : `avd`, pas
`udid`** », puis « `avd` est prioritaire sur `udid` », et consacre un paragraphe
au piège du port — « `emulator-5554` n'est pas une identité, c'est un numéro de
port […] Ce piège ne se signale par aucune erreur : le run se déroule
normalement, sur un autre appareil ».

**Seul `run.mjs` tient cette promesse** (`resolveByAvd`, `resolveNamedDevice`).
Trois autres sites appellent `defaultAndroidDevice()` (`config.mjs:805`), qui
prend `listed.find((udid) => udid.startsWith('emulator-'))` — le premier
émulateur d'`adb devices` — et **ne lit jamais `devices[].avd`** :
- `perf.mjs:297` — les mesures de démarrage, de mémoire et de poids ;
- `a11y.mjs:391` — le relevé d'accessibilité sur appareil ;
- `config.mjs:916` — l'ABI qui cible `--print-build-cmd`.

Son dartdoc montre le raisonnement à moitié fait : elle se protège des appareils
**réels** (« lancer, arrêter et sonder une app sur l'appareil personnel de
quelqu'un ») et pas d'un **second émulateur**. Le voisin, encore.

⚠️ **Il n'a crié que par chance.** L'app n'était pas installée sur l'autre AVD,
donc `perf.mjs` a rendu « activité de lancement introuvable ». Installée des deux
côtés — le cas courant sur une machine de développement — il aurait mesuré le
mauvais appareil **en silence**, et le rapport aurait porté des chiffres de
performance appartenant à une autre app.

⚠️ **Et seize runs ne pouvaient pas le voir** : tous s'étaient déroulés avec un
seul émulateur. La consigne « un seul émulateur à la fois », que je tenais pour
de l'hygiène, **masquait le défaut**. C'est un émulateur tiers laissé allumé par
hasard qui l'a révélé.

**Corrigé** : `defaultAndroidDevice(config)` lit `devices[].avd`, et un AVD
déclaré mais non démarré est un **refus** qui nomme ce qu'il cherchait et ce
qu'il a trouvé — jamais un repli silencieux. `avdNameFrom` a été **extraite**
vers `config.mjs` plutôt que recopiée. ⚠️ Le garde décisif porte sur le
**câblage** et non sur le comportement : `config` est un paramètre *optionnel*,
donc l'omettre compile, ne casse aucun test et fait retomber la production sur le
défaut. Il balaie tous les scripts et n'accepte **aucun** appel nu.

### 162. ✅ Corrigé le 24/08/2026 — Le scaffold ne prévoyait pas « mon app n'a pas d'authentification »

`argus.mobile.yaml` pose **cinq** `TODO(argus)` sous `auth.anchors` (écran,
identifiant, mot de passe, validation, preuve de session). Une app sans
authentification — toute app locale — ne peut en remplir aucun, et
`install-mobile.sh --check` les compte : `✏️ argus.mobile.yaml (5 TODO(argus) à
traiter)`.

Le comportement, lui, est correct et documenté : « Une seule vide → le sous-flow
skippe en entier ». Ce qui manque est la **permission de les retirer**. Le run 17
a tranché seul — TODO supprimés, décision écrite à la place — pour obtenir un
`--check` propre.

⚠️ **Le voisin le dit déjà** : `.maestro/i18n.yaml:60` porte « Si ton app n'en
affiche aucun, laisse ce bloc commenté et note… ». Un fichier du scaffold prévoit
le cas « ça ne s'applique pas à mon app », son voisin non — et c'est celui qui
pose le plus de TODO.

**Corrigé** : la permission est écrite **à côté des TODO qu'elle concerne** —
laisse les cinq vides, retire-les, écris pourquoi à leur place.

### 163. ✅ Corrigé le 24/08/2026 — ⚠️ « Une seule vide → le sous-flow skippe » valait pour UNE ancre sur cinq

Trouvé en vérifiant la promesse sur laquelle le 162 allait s'appuyer, au lieu de
la croire.

`argus.mobile.yaml` écrit, au-dessus des cinq ancres d'authentification : « Une
seule vide → le sous-flow skippe en entier **plutôt que d'échouer à mi-parcours
sur un champ introuvable** ». La condition de `login.yaml` ne teste pourtant que
deux variables :

```
${typeof QA_USER !== 'undefined' && QA_USER !== ''
  && typeof ARGUS_AUTH_USER !== 'undefined' && ARGUS_AUTH_USER !== ''}
```

`screen`, `password`, `submit` et `success` n'y sont pas. Renseigne le champ
identifiant et laisse-en une autre vide — le cas exact d'une instrumentation
commencée puis interrompue — et le bloc s'exécute : `assertVisible: id: ${ARGUS_AUTH_SCREEN}`
part avec un identifiant **vide** et échoue à mi-parcours, ce que la phrase
promettait d'éviter.

Rien ne rattrape en amont : `run.mjs:563-567` injecte les cinq ancres telles
quelles (`anchors.x ?? ''`) et `validateConfig` ne les regarde pas.

⚠️ **C'est une promesse de comportement technique que rien ne mesurait** — la
famille que ce chantier existe pour fermer, trouvée cette fois dans un commentaire
de scaffold plutôt que dans le SKILL.

**Corrigé** : la décision passe dans le **code** (`authAnchorsReady`, `run.mjs`),
le sous-flow ne fait plus que lire `ARGUS_AUTH_READY`. Reconstruire une expression
à sept variables dans une condition Maestro est ce qui l'avait rendue fausse *et*
intestable. Le garde parcourt les cinq ancres **une par une** : n'éprouver que
celle qui marchait est exactement ainsi que les quatre autres avaient survécu.

## Run 18 — le correctif de la veille tient, et quatre trous voisins

⚠️ **Ce run vérifie d'abord le 161, et il le vérifie pour de bon.** Deux
émulateurs branchés, l'indice technique **retiré du prompt** (au run 17 je lui
avais soufflé « cible par nom d'AVD ») : `perf.json` et `a11y.json` portent tous
deux `emulator-5556`, le bon, alors que `emulator-5554` était pris par un autre
projet et aurait été « le premier ». Aucun `--device` forcé nulle part. Le défaut
d'hier aurait frappé aujourd'hui ; il ne l'a pas fait.

### 164. ✅ Corrigé le 24/08/2026 — La couverture disait ce qui est DÉCLARÉ, jamais ce qui a été VISITÉ

`coverage` rend `screensDeclared: 12 · screensConfigured: 12 · notConfigured: []`
— exact. Le run a mesuré à la main, depuis les `commands.json`, que **8 écrans
sur 12 sont réellement atteints** : `history-filled`, `categories-filled`,
`confirm-sheet` et `category-sheet` ont leurs branches `goto.yaml` écrites, et
rien ne les appelle.

Le point 158 avait ajouté le compte **visuel** et la phrase « N sur N ne veut pas
dire tout est couvert ». Le run 18 est allé plus loin que mon correctif : la
donnée est là — **46 `commands.json`**, que le runner produit et relit déjà pour
`startupSamples` — et rien ne la dérive.

**Corrigé** : `coverage` porte `visited[]` et `notVisited[]`, dérivés des étapes
**COMPLETED** et non des fichiers, et le rapport **nomme** les écrans que rien
n'a atteints. Une étape `SKIPPED` ne prouve rien — la branche existait, elle n'a
pas tourné — et c'est le cas que le garde épingle, avec son opposé : un run où
tout a été vu ne doit lever aucune alerte.

### 165. ✅ Corrigé le 24/08/2026 — Le binaire de release était scanné sans qu'on dise comment le construire

`argus.mobile.yaml` demande de renseigner `build.androidScan` (« le binaire de
release, une fois pour toutes ») et exige `requireObfuscation: true`. Il ne dit
**nulle part** comment le construire.

Le run 18 a construit une release avec `flutter build apk --release` : le scan a
rendu **major — « Binaire AOT non obfusqué », 76 chemins `package:…` lisibles**.
Reconstruit avec les flags que le projet documente (`--obfuscate
--split-debug-info`) : **76 → 0, dimension verte**. Même code, seuls les flags
changeaient.

⚠️ Le finding décrivait **la commande de build de celui qui mesure**, pas l'app —
et il aurait été publié comme un défaut de l'application. L'agent l'a rattrapé en
lisant la doc de release du projet ; rien dans le skill ne l'y envoyait.

**Corrigé** : le scaffold dit désormais, à côté de `androidScan`, de construire
avec la **commande de release du projet** et d'aller la chercher dans le dépôt
(script, CI, doc de déploiement) avant d'en inventer une — avec les deux chiffres
mesurés, 76 → 0.

### 166. ✅ Corrigé le 24/08/2026 — ⚠️ Le conseil sur l'encodage valait pour l'AOT, sous une commande DEBUG

`SKILL.md` montre comment compter un marqueur dans `kernel_blob.bin` (donc un
build **debug**), puis avertit, deux paragraphes plus bas : « Dart stocke une
chaîne en Latin-1 quand tous ses points de code tiennent sur un octet, en UTF-16
sinon […] un `grep` UTF-8 rend alors `0` sur un texte pourtant présent. »

**Mesuré sur le binaire du run**, littéral accentué « Première session » dans
`kernel_blob.bin` :

| encodage | occurrences |
|---|---|
| UTF-8 | **2** |
| latin-1 | 0 |
| utf-16-le | 0 |

Contre-épreuve ASCII (`home_empty_root`) : **2** — l'instrument mesure.

En debug, le kernel stocke en **UTF-8**. Le conseil ne vaut que pour l'AOT
(`libapp.so`). Quelqu'un qui l'applique sous la commande qui le précède cherche
en latin-1, obtient `0`, et conclut « le binaire est périmé » — **précisément
l'erreur que le paragraphe existe pour éviter**.

**Corrigé** : un tableau, une ligne par mode de build, avec la mesure. Le garde
lie **deux endroits qui doivent s'accorder** — le binaire qu'ouvre la commande
d'exemple et la ligne qui décrit son encodage.

⚠️ **Et ce garde est né faux** : il comparait les deux cellules par égalité, si
bien qu'écrire « **Latin-1** » côté debug les laissait *textuellement*
différentes de « **Latin-1**, ou **UTF-16** dès que… » — vert sur un tableau qui
ne distinguait plus rien. C'est **la mutation** qui l'a dit, pas la relecture. Le
critère porte désormais sur les encodages **nommés**, dont les deux lignes ne
doivent partager aucun.

### 167. ✅ Corrigé le 24/08/2026 — `.argus-device` gravait le modèle et l'OS, jamais la LOCALE

Le fichier existe pour qu'une référence visuelle porte l'identité de l'appareil
qui l'a produite. Il contient `model`, `os`, `source` — et rien d'autre.

Or `argus.mobile.yaml` déclarait `deviceLocale: fr_FR` pendant que l'AVD tournait
en **`en-US`** (`deviceLocale` ne s'applique qu'avec `autoStart`, cf. point 154).
Les quatre références visuelles du run sont donc nées sous un système **anglais**,
et **rien ne l'enregistre**. Qui les régénère plus tard sur un appareil en
français obtient des diffs — formats système, éléments natifs — sans qu'aucune
trace n'explique l'écart.

⚠️ Le voisin, encore : on grave deux dimensions d'identité et on oublie la
troisième — celle que la configuration prétend précisément piloter.

**Corrigé** : la locale est gravée et comparée, mais **seulement si les deux
marques la portent** — une référence d'avant ce champ ne doit pas se mettre à
crier rétroactivement, sans quoi l'avertissement devient le bruit qu'on apprend à
ignorer. Quand seule la locale a bougé, le message le **dit** au lieu d'accuser
un appareil qui n'a pas changé.

⚠️ Un garde existant a rougi ici, et il avait raison : il fige la forme complète
de la marque, et le correctif y ajoutait un champ. **Étendu, pas supprimé** —
supprimer est le réflexe qui vide un garde le jour où son sujet bouge.

## Run 19 — cinq correctifs tiennent, et quatre relevés mesurent autre chose

⚠️ **Ce run a été COUPÉ par une panne d'API (529) en pleine séquence device**, puis
**repris** — son travail était sur disque, seul le compte rendu manquait. Les trois
consignes de reprise (ne rien reconstruire de mémoire, nommer ce qui reste
inachevé, arrêter son émulateur seul) ont toutes été tenues. Deuxième fois que
cette procédure sauve un run, après le 15.

⚠️ **CINQ correctifs vérifiés sur le terrain**, mesurés et non déduits :
- **156** — `coldStartMs: 2000` **intact** pendant que `startTimeoutMs` monte à
  45 000, et le projet écrit « la lenteur doit rester un finding, pas disparaître
  dans un seuil ». Le message corrigé a envoyé l'agent au bon levier ;
- **157** — `key: ValueKey<bool>(categories.isEmpty)` posé **d'office** ;
- **162** — les cinq TODO d'auth retirés, le pourquoi écrit à leur place ;
- **164** — `visited[]` / `notVisited[]` dérivés : **7 écrans sur 7 réellement
  visités**, `notVisited: []` ;
- **167** — `.argus-device` porte `"locale": "fr-FR"`.

Le **165** a envoyé l'agent lire la doc de release du projet — c'est là qu'il a
découvert qu'il ne pouvait pas la reconstruire (elle exige un secret), et il l'a
**dit** au lieu de scanner sans le signaler. C'est le 168 ci-dessous.

### 168. ✅ Corrigé le 24/08/2026 — ⚠️ La sécurité concluait sur un binaire dont rien ne disait l'âge

`sec.json` porte `platform`, `root`, `levels`, `boundary`, `findings` — **aucun
champ ne nomme le binaire scanné, ni sa date**.

Mesuré sur ce run : l'APK release scanné datait de **14:44**, l'instrumentation de
**15:34**, l'APK debug de **15:59**. Les verdicts « obfusqué », « pas un debug »,
« 0 secret » décrivaient donc un binaire **construit cinquante minutes avant les
ancres**, et qui ne les contient pas.

⚠️ **Et le rapport affirme `staleParts: []`.** Le mécanisme de péremption compare
les dates des relevés **entre eux** ; il ne peut pas voir qu'un relevé frais
décrit un sujet périmé. *La fraîcheur mesurée n'est pas celle qui compte.*

L'agent l'a signalé de lui-même dans ses inachevés — c'est le 165 qui l'y a
envoyé — mais rien dans l'outil ne l'aurait dit à quelqu'un qui ne regarde que le
rapport.

**Corrigé** : `levels.binary` porte `builtAt` et `stale`, dérivés du `.dart` le
plus récent sous `lib/` — un binaire antérieur au code ne peut pas le contenir —
et le scan le **dit avant d'écrire**. Horloge injectée dans le garde, les deux
sens couverts : un binaire postérieur doit se taire, et sans source lisible la
fonction rend `null` plutôt que d'affirmer une fraîcheur qu'elle n'a pas mesurée.

### 169. ✅ Corrigé le 24/08/2026 — La contre-épreuve visuelle pouvait échouer sur les DIMENSIONS

`SKILL.md` prescrit de « **remplacer une référence par un aplat** et vérifier que
celle-là seule rougit ». Il ne dit pas **aux dimensions exactes de la référence**.

Ce run a produit un aplat 8×8. L'échec est sorti en
`Screenshot size mismatch: expected 8x8, actual 1080x1980` — un refus de Maestro
**avant toute comparaison de pixels**. La discrimination est bien prouvée (seule
la référence corrompue rougit, la restauration ramène au vert), mais le chemin de
`visualMatchPercentage: 99` n'a **jamais été emprunté**.

⚠️ Une contre-épreuve qui rougit pour la mauvaise raison a toutes les apparences
d'une preuve. Celle-ci prouve que la boucle lit la référence, pas qu'elle sait
comparer.

**Corrigé** : le SKILL prescrit l'aplat **aux dimensions exactes**, dit pourquoi
ce n'est pas un détail, et donne la commande qui relève la taille de la
référence.

### 170. ✅ Corrigé le 24/08/2026 — `pumpArgus` déclarait une locale que `MaterialApp` n'appliquait pas

Le montage passe `locale: argusLocale` et `localizationsDelegates:` — mais
**jamais `supportedLocales`** : zéro occurrence dans tout le scaffold.

Or `MaterialApp` résout sa locale effective en croisant `locale` avec
`supportedLocales`, dont le défaut est `[Locale('en','US')]`. Une locale non
supportée est **ignorée** : les `MaterialLocalizations` restent en anglais.

Le harnais prétend donc monter l'écran en français et le monte en anglais. Sans
effet sur un projet dont les libellés sont en dur ou passés par son propre bloc de
traduction — c'est le cas ici, et l'agent l'a vérifié — mais tout ce qui vient de
Material (dates, boutons de dialogue, tooltips, `semanticsLabel` implicites) est
mesuré dans la mauvaise langue, donc à la mauvaise largeur.

⚠️ L'agent a nommé cet écart et **ne l'a pas patché** : « il appartient au cadre,
pas au projet ». Il avait raison sur les deux points.

**Corrigé** : `supportedLocales: <Locale>[argusLocale]`. Garde de **câblage** —
omettre ce paramètre compile et monte joyeusement dans la mauvaise langue — et il
vérifie aussi que la liste **contient** la locale passée : une liste qui l'exclut
laisse la déclaration tout aussi inerte.

### 171. ✅ Corrigé le 24/08/2026 — Aucune commande de comptage n'était prescrite

Le rapport d'instrumentation du §2 est le **premier livrable** du skill et repose
entièrement sur des comptes — racines, commandes, affichages, composants
partagés. Le skill ne donne **aucune commande** pour les obtenir : zéro
`grep`/`git grep` prescrit dans toute la documentation.

Conséquence mesurée deux fois, à seize runs d'écart :
- ce run a d'abord compté **17 écrans** et deux ancres inexistantes
  (`home_last_row`, `home_footer_total`) — son motif lisait le **dartdoc
  d'exemple** de `harness.dart`, qui contient `anchor: 'home_root'` et consorts ;
- mon propre comparateur d'étalons avait exactement ce défaut au run 3 (13
  `ArgusScreen(` pour 12 réels), corrigé pour lui seul et jamais remonté au skill.

Le fichier livré rend d'ailleurs `grep -c "anchor:"` = **1**, et cette unique
occurrence est en commentaire.

⚠️ Même famille que le 168 : *un relevé qui compte autre chose que ce qu'il
annonce*. Et il est en tête du rapport, donc il donne le ton de tout le reste.

**Corrigé** : les commandes sont écrites, avec l'auto-vérification qui compte —
les lancer sur le `harness.dart` **livré**, qui ne porte aucune vraie ancre : tout
autre résultat que `0` signale un motif qui lit le commentaire. Le garde **exécute**
ce comptage au lieu de relire la prose, et sa contre-épreuve passe en premier : le
jour où l'exemple perdrait ses ancres, le filtre ne prouverait plus rien et le
garde le dit au lieu de verdir.

⚠️ **Ce garde est né faux, et pour la deuxième fois de la journée** : il vérifiait
qu'un `grep -v` figurait **quelque part** dans la page, si bien que retirer le
filtre d'une des deux commandes le laissait vert. C'est la **mutation** qui l'a
dit. Le critère est désormais par commande.

## Run 20 — huit correctifs exercés, et mon compteur de la veille sous-compte

⚠️ **HUIT correctifs vérifiés**, le meilleur rendement du chantier, et plusieurs
sont cités par l'agent dans son propre raisonnement sans qu'il sache qu'ils sont
neufs :
- **171** — « Contre-épreuve du compteur, **avant de lire ce qu'il compte**, sur le
  `harness.dart` livré : `ArgusScreen(` → 0, `anchor:` → 0 » ;
- **169** — l'aplat **aux dimensions exactes** (`sips` → 1080×1980), et Maestro rend
  `threshold not met, current: 0.0%` : « donc la comparaison de pixels a bien eu
  lieu, elle n'a pas été refusée sur un `Screenshot size mismatch` » ;
- **168** — `sec.json` porte `stale: false` ;
- **166** — contre-épreuve accentuée « brûler. » → **2**, avec la mention
  « (debug ⇒ UTF-8) » ;
- **165** — commande de release reprise de la doc du projet « plutôt qu'un
  `--release` nu, **qui aurait produit un faux binaire non obfusqué** » ;
- **156** — `startTimeoutMs` relevé à 45 000, « et **pas touché à `coldStartMs`** » ;
- **164** — `notVisited: []`, et « « 8 sur 8 » ne veut pas dire « tout est couvert » » ;
- **161** — vérifié dans les conditions les plus dures du chantier : **un appareil
  physique ET deux émulateurs** branchés. `perf.json` et `a11y.json` portent tous
  deux `emulator-5556`, le bon. Le téléphone n'a jamais été ciblé.

### 172. ✅ Corrigé le 24/08/2026 — ⚠️ Le compteur prescrit la veille SOUS-COMPTAIT les familles

Le point 171, corrigé la veille, prescrit :

```bash
grep -rn "identifier: *'" lib/ | grep -v "^\s*///" | wc -l
```

Mesuré sur le terrain du run 20 :

| relevé | valeur |
|---|---|
| ce que rend la commande prescrite | **31** |
| ancres réellement déclarées dans `harness.dart` | **82** |
| gabarits interpolés (`'nav_${spec.id}'`, `'session_form_preset_${preset.id}'`) | **2** |

Un gabarit interpolé produit une **famille** — autant d'ancres que d'éléments —
et la commande n'en compte qu'une occurrence littérale. Le rapport
d'instrumentation, lui, annonce « 53 commandes posées » : un chiffre que la
commande prescrite **ne sait pas produire**.

⚠️ **Mon correctif a déplacé le défaut au lieu de le fermer.** Le 171 fermait un
compteur qui lisait le commentaire ; celui qui le remplace ne ment plus sur ce
qu'il compte, mais il ne compte pas ce que le rapport demande — et rien ne le
dit. C'est la cinquième façon dont un garde devient vacant, appliquée cette fois
à une **prescription** : le phénomène a bougé, la mesure est restée.

**Corrigé** : le SKILL dit que le compte de `lib/` est un **plancher**, donne la
commande qui voit les gabarits, et renvoie à `harness.dart` — où les familles
sont développées — pour les chiffres que le rapport annonce. Le garde **exécute**
la commande sur un fichier qui porte un gabarit, au lieu de la relire.

⚠️ **Et j'ai écrit dans le SKILL, en le corrigeant, une affirmation FAUSSE** : que
la forme en doubles quotes « rend 0 sans rien dire », avec un « mesuré : 0 contre
2 » à l'appui. Ce zéro venait de **mon** shell, pas de la commande : exécutée
telle qu'écrite via `bash -c`, la forme échappée rend `1` comme l'autre. C'est le
**harnais** qui l'a dit — la mutation bâtie sur cette prémisse ne mutait rien, et
il a rendu « VACANT ». Retirée le jour même, avec son commit.

⚠️ La forme exacte du point **149**, onze runs plus tard : *une promesse technique
écrite dans un document en corrigeant autre chose, que rien ne mesurait*. Le
chiffre du constat, lui, tient — il venait du terrain, pas d'une explication.

### 173. ✅ Corrigé le 24/08/2026 — Une image Google Play refuse la locale, et le skill n'en parlait pas

```
adbd cannot run as root in production builds
Failed to set property 'persist.sys.locale' to 'fr-FR'.
```

L'AVD `Medium_Phone_API_36.1` tourne une image **production** (Google Play) : la
locale système y est immuable, même en tentant `adb root`. `locale.deviceLocale:
fr_FR` reste donc déclaratif, et les chaînes Material restent anglaises.

Le point 154 disait déjà que `deviceLocale` n'a d'effet **qu'avec `autoStart`**.
C'est une **seconde** raison, indépendante de la première : ici même `autoStart`
n'y changerait rien, parce que l'image refuse. Rien dans le skill ne distingue
une image *Google APIs* (rootable, locale modifiable) d'une image *Google Play*
(verrouillée) — alors que c'est la première chose à regarder quand la locale ne
prend pas.

**Corrigé** : `device-matrix.md` porte un tableau des deux familles d'images —
*Google APIs* (rootable, locale modifiable) contre *Google Play* (verrouillée) —
avec les deux messages exacts, et dit de regarder l'image **avant** de chercher
plus loin.

## Run 21 — dix correctifs exercés, et la taille pèse le mauvais binaire

⚠️ **DIX correctifs vérifiés**, record du chantier. L'agent en cite plusieurs
dans son propre raisonnement, y compris des corrections de la veille :
- **172** — « 38 sites dans `lib/` pour **75 ancres déclarées** — l'écart vient des
  2 gabarits et des composants partagés », exactement la distinction prescrite ;
- **173** — « l'AVD est une image *Google Play* (`tag.id=google_apis_playstore`,
  donc `persist.sys.locale` immuable) » ;
- **169** — l'aplat « **aux dimensions exactes** (1080×1980, relevées par `sips`),
  pour que le seuil soit réellement emprunté et non court-circuité par un
  `Screenshot size mismatch` » ;
- **165** — « sans ces flags, le finding « binaire non obfusqué » aurait décrit ma
  commande et non l'app » ;
- **171**, **168**, **166**, **164**, **157**, et le **161** dans les conditions
  les plus dures du chantier.

⚠️ **Le piège du port s'est produit POUR DE VRAI** : l'émulateur voisin occupait
`5554`, celui du run a reçu `5556`. Et un **téléphone personnel** était branché.
Prouvé par balayage des journaux : `Armor_X12` → aucune occurrence,
`emulator-5554` → aucune, `device=emulator-5556` → **45 fois**.

### 174. ✅ Corrigé le 24/08/2026 — ⚠️ `QAM-PERF-SIZE` pesait le binaire de TEST

`perf.mjs:273` lit `config.build.android` — le binaire que le runner installe,
**un debug presque toujours**. Le budget en regard, `binarySizeMb: 60`, est
manifestement écrit pour ce qu'on publie.

Mesuré sur ce run :

| binaire | taille | verdict |
|---|---|---|
| `app-debug.apk` (mesuré) | **92 Mo** | `QAM-PERF-SIZE` **major** |
| `app-release.apk` (publié) | **30,2 Mo** | sous le budget de 60 |

Le rapport porte donc un finding `major` qui décrit **le binaire de test**, pas
celui qui sortirait. L'agent l'a écrit noir sur blanc — « le finding de taille
décrit le binaire de test, pas ce qui serait publié » — mais rien dans l'outil ne
le dit à qui lit le rapport.

⚠️ **Même famille que le 168**, dans une autre dimension : *un verdict rendu sur
un binaire qui n'est pas celui dont on parle*.

**Corrigé** : `build.androidScan` est préférée dès qu'elle est **déclarée ET
présente** — déclarer ne suffit pas, sinon on pèserait du vide — et
`perf.metrics` porte `binaryPath` / `binaryIsRelease`, sans quoi « 92 Mo » et
« 30 Mo » se lisent comme le même relevé. À défaut de release, le script **dit**
sur quoi il est retombé.

⚠️ **Le premier garde était aveugle et la mutation l'a dit** : il éprouvait la
fonction, la mutation cassait son **appel** — la fonction peut rester parfaite
pendant que `main()` cesse de l'appeler. Même angle mort que pour le choix de
device. Un garde de câblage l'accompagne désormais.

### 175. ✅ Corrigé le 24/08/2026 — Le coût annoncé pour `argus-perf` était démenti d'un facteur soixante

`SKILL.md` écrit : « ⚠️ **`make argus-perf` coûte ~9 min à lui seul** : quatre
démarrages à froid, trois à chaud, la pesée. »

Mesuré sur ce run : **8,788 s**.

Le chiffre venait du point 155, où il avait été relevé sur un terrain dont le
démarrage à froid valait plusieurs secondes. Il est écrit comme une **propriété du
script**, alors qu'il est presque entièrement déterminé par la vitesse de
démarrage de l'app mesurée — ici 1331 ms à froid, 114 ms à chaud.

⚠️ C'est un nombre qui décrit le contenu sans être dérivé de la donnée, et il sert
à **décider** : le skill le donne pour qu'on prévoie le coût avant de lancer. Un
lecteur qui l'a lu attend neuf minutes devant une commande qui en prend neuf
secondes — ou renonce à la lancer.

**Corrigé** : le skill dit ce qui **détermine** le coût — sept lancements, donc le
démarrage de l'app — avec les deux extrêmes mesurés (8,8 s et plusieurs minutes),
et invite à chronométrer une fois sur son propre projet plutôt qu'à se fier à un
chiffre relevé ailleurs.

## Run 22 — trois défauts fonctionnels, dont un qui bloque en silence

⚠️ **Le correctif 174 fonctionne, et la chronologie le prouve** : `perf.json` est
écrit à **22:30:51**, la release n'existe qu'à **22:32:30**. Le script a donc pesé
le seul binaire disponible et l'a **dit** — `binaryPath: …app-debug.apk`,
`binaryIsRelease: false`. C'est exactement le comportement voulu… et c'est ce qui
fait apparaître le 177.

⚠️ **Deux correctifs de plus se voient à l'œuvre** : le runner a **refusé de
verdir** sur six flows tombés en 0–59 ms sans étape fautive (« 5 exécution(s)
Maestro en échec sans étape fautive identifiée », exit 2) — la cause était que
l'agent avait tué le driver Maestro pendant un diagnostic. Et le compteur d'ancres
distingue les 31 littéraux des 2 gabarits, « le compte de `lib/` est un plancher ».

### 176. ✅ Corrigé le 26/08/2026 — ⚠️ `argus-perf` pouvait attendre INDÉFINIMENT, sans un mot

Mesuré par le run : `make argus-perf` s'est bloqué **3 fois sur 5**, toujours dans
la boucle des démarrages **à chaud**. Durées relevées avant que l'agent ne tue le
processus : **12 min 00**, **1 min 48**, puis un troisième à 4 min. La quatrième
tentative a rendu la mesure complète en **10 s**.

Reproduit par lecture du code, sans device :

```
grep -n 'timeout' perf.mjs   →  aucune occurrence
am start -W  →  adb(udid, […])  →  sh()  →  spawnSync(…, { …opts })
```

`sh()` **transmet déjà** ses options à `spawnSync`, donc `{ timeout }` serait
supporté sans rien changer d'autre. Il n'est simplement jamais passé.

⚠️ **Le blocage est muet** : le script n'écrit rien, il attend. En CI, le job est
tenu jusqu'au délai global du runner — et ce qu'on lit alors est « le job a
expiré », pas « une mesure de démarrage n'a pas rendu la main ».

Le mécanisme exact du blocage n'est **pas attribué** : l'agent a relevé que le
process de l'app existe, que `Window{… MainActivity}` apparaît dans logcat, mais
que `topResumedActivity` reste le lanceur. Il l'a écrit sans l'expliquer, et c'est
la bonne façon de le rapporter. Le défaut à corriger ne dépend pas de cette
cause : **un script de mesure ne doit pas pouvoir attendre sans fin.**

**Corrigé au niveau de la CLASSE**, pas d'`am start -W` : `sh()` applique un
plafond à **toute** commande externe — `SH_TIMEOUT_MS` pour les commandes longues
et légitimes (`flutter build`, `maestro test`), `PROBE_TIMEOUT_MS` pour les
sondes, `ARGUS_SH_TIMEOUT_MS` pour relever sans toucher au code.

⚠️ **`timeout` seul NE TIENT PAS son plafond, et c'est une mesure.** Un process
qui ignore SIGTERM — le signal envoyé par défaut — laisse `spawnSync` attendre sa
fin naturelle : **9 068 ms** relevés pour un plafond de 300, avec `ETIMEDOUT`
rendu quand même. Un dépassement qui se **rapporte** sans avoir jamais été borné,
donc un garde écrit sur le seul drapeau serait resté vert pendant que le harnais
attend. Le même appel en `killSignal: 'SIGKILL'` rend la main en **306 ms**.

L'expiration s'écrit **quoi qu'en fasse l'appelant** : c'est la seule panne d'ici
qui ne laisse rien derrière elle — ni stdout, ni code de sortie, ni ligne de log.
`launchOutcome` a été extraite pour que les quatre verdicts d'`am start -W` soient
testables sans device, expiration comprise, et `perf.json` porte
`timedOutLaunches` — une médiane calculée sur les échantillons **survivants** se
lit sinon comme n'importe quelle autre.

### 177. ✅ Corrigé le 26/08/2026 — L'ordre prescrit garantissait que la taille soit mesurée sur le DEBUG

Le point 174 a appris à `perf.mjs` à peser `build.androidScan` — la release —
quand elle est déclarée et présente. Elle ne l'est jamais **au moment où `perf`
tourne** : rien dans le skill ne dit de construire la release avant, et le déroulé
naturel la construit pour la **dimension sécurité**, qui vient après.

Chronologie de ce run, à la seconde près :

| | |
|---|---|
| `perf.json` écrit | **22:30:51** |
| `app-release.apk` construit | **22:32:30** |
| `argus.mobile.yaml` renseigné (`androidScan`) | **23:01:32** |

Le correctif fait donc son travail — il dit « ce n'est pas la release » — mais la
mesure utile n'est **jamais prise**, et le rapport final porte `92 Mo` alors que la
release du même code en fait `30,2`. Personne ne relance `perf` après.

⚠️ Un correctif qui rend le relevé honnête sans le rendre juste : il faut soit
prescrire l'ordre, soit faire dire au rapport que la taille reste à mesurer.

**Corrigé en cessant de JUGER.** Quand le binaire pesé n'est pas la publication,
le rapport ne rend plus un `major` faux par construction : il **réclame** la
mesure — `QAM-PERF-SIZE-UNMEASURED`, severity `info`, parce qu'une release ne se
construit pas à chaque run et ne doit donc pas faire rougir le gate. Le finding
porte les gestes exacts, et le chemin proposé est **dérivé** du projet : un flavor
donne `app-dev-release.apk`, pas le chemin par défaut de Flutter qui n'existerait
pas chez lui. La mesure du debug reste lisible dans `actual` — elle n'est
simplement plus comparée à un budget qui ne la concerne pas.

Deux causes, deux messages : « pas déclarée » se répare dans la config,
« déclarée mais absente » par un build. Rendre le premier quand c'est le second
envoie éditer une clé qui va déjà bien.

### 178. ✅ Corrigé le 26/08/2026 — `goto.yaml` décrivait un aiguillage depuis le LANCEMENT, et est appelé en cours de flow

Le sous-flow livré porte : « `home` ne demande rien : `launch-clean.yaml` y a déjà
mené », et sa branche « rien à naviguer » se décide sur l'écran de **départ**.
C'est vrai au premier appel.

Mais `goto` est appelé **au milieu d'un flow**, après qu'on a navigué ailleurs. Le
run l'a payé :

```
[Failed] Argus — accessibilité … (Element not found: Id matching regex: home_start_session)
```

Après un passage par Catégories puis Réglages, l'ancre de l'accueil n'existe plus
— et la branche qui prétend « rien à naviguer » ne fait rien. L'agent a corrigé
ses propres branches en tapant `nav_home` d'abord, et note que `goto` est
« désormais appelable de n'importe où ».

⚠️ Le gabarit ne dit nulle part que **c'est la condition à tenir**. Il décrit un
aiguillage depuis l'état initial, alors que son contrat réel est : *amener l'app
sur cet écran, quel que soit l'endroit d'où on part*.

**Corrigé en donnant à `goto` son contrat** : trois branches là où il n'y en avait
qu'une — on y est (rien à faire), on le demande mais on n'y est plus (le retour du
projet, avec une assertion qui échoue **ici** plutôt que trois étapes plus loin),
et aucune ancre déclarée (dit à voix haute, plutôt que supposé). La condition
regarde désormais l'**écran** et non le scénario : « on demande l'écran de
départ » ne prouve pas « on est sur l'écran de départ ».

⚠️ **L'imbrication des `when` est une décision, pas un style.** Écrire `true:` et
`visible:` dans le même `when` demanderait de savoir comment Maestro les
combine — un ET **supposé**, que rien ici ne mesure sans device. Déroulé sur les
quatre cas, une lecture en OU ferait échouer un `goto` vers un **autre** écran.
Deux `when` emboîtés, portant chacun une seule nature de condition, donnent le ET
sans rien supposer ; un garde empêche désormais de « simplifier » en arrière.

⚠️ **Et `a11y.yaml` affirmait le mécanisme INVERSE** — « chaque `goto.yaml` part
de là où `launch-clean` a laissé l'app » — en mettant la charge sur chaque
appelant plutôt que sur le sous-flow dont c'est le travail. C'est ce commentaire,
écrit pour prévenir du piège, qui l'a laissé vivre deux runs.

Syntaxe **mesurée** et non supposée : `maestro 2.8.0 check-syntax` sur les
12 flows, avec contre-épreuve — une propriété renommée est rejetée (exit 1).

### 179. ✅ Corrigé le 26/08/2026 (né de la passe du 177) — « construis-le » proposait la commande de DEBUG pour un scan de RELEASE

Trouvé **en corrigeant le 177**, dans le même tissu. Quand le binaire à scanner
est absent, `sec.mjs` disait « construis-le : `flutter build apk --debug` » —
c'est-à-dire la commande qui ne produira **jamais** `app-release.apk`.

Une consigne fausse avec toutes les apparences d'une consigne juste : elle
s'exécute sans erreur, elle reconstruit bien *un* binaire, et le scan suivant
échoue exactement pareil. Rien ne pouvait la démentir.

Cause : le harnais ne savait construire que ce qu'il **pilote**. `releaseBuildCmd`
dérive la commande de publication de celle du projet — flavor, ABI et
`--dart-define` gardés, seul le mode change — et `buildHintFor` choisit celle qui
produit **le** binaire qu'on vient de chercher en vain.

### 180. ✅ Corrigé le 26/08/2026 — La couverture ne mesurait que ce qu'on lui avait DÉCLARÉ

`coverage` porte trois relevés — `notConfigured`, `notVisited`, `visualScreens` —
et **tous trois se dérivent de `config.screens`** (`run.mjs:1632, 1639, 1642`).
Sur ce run : `notConfigured: []`, `notVisited: []`, `visualScreens` 4 sur 7. Ça se
lit comme une couverture complète.

Or le terrain monte **15 états à l'étage 1** et n'en déclare que **7** en étage 2.
Les **8 autres** — `runner-break`, `runner-end`, `runner-error`, les deux feuilles,
la coquille, et les deux états pleins que seul `journey-critical` traverse — ne
figurent dans **aucun** des trois relevés. Ils ne sont ni « non configurés » ni
« non visités » : ils n'existent pas pour le rapport.

⚠️ Le SKILL **sait** que les deux listes diffèrent — il porte une table des
**quatre écarts légitimes** entre `argusScreens` et `screens[]` (SKILL.md:664).
Ce qui manque n'est donc pas la connaissance de l'écart, c'est sa **mesure** :
rien ne rapproche les deux listes, alors que les deux sont déclarées dans le même
dépôt et lues par le même harnais.

Famille : *un relevé qui mesure ce qu'on lui a donné et se lit comme s'il mesurait
ce qui existe*. C'est le run lui-même qui l'a écrit, dans son compte rendu : « ce
que ce vide ne dit pas ».

⚠️ **Corrigé en écrivant, et le constat était en dessous.** `coverageLine`
**avouait déjà** la limite — « un état monté à l'étage 1 seul n'y apparaît pas »,
écrit lors d'une passe précédente. Ce n'est donc pas « le rapport ne le dit pas »
mais « il dit qu'il ne sait pas, alors qu'il peut savoir » : le harnais Dart est
dans le même dépôt, à deux fichiers de là. Même motif que le **177** — *avouer une
limite n'est pas la lever*.

**Corrigé** : `stageOneOnly()` lit les `ArgusScreen(` du harnais, en **retirant
les commentaires** du corpus (un compteur qui lit sa propre illustration invente
un écart — payé deux fois par ce chantier), et `coverage.stageOneOnly` porte les
états d'étage 1 que `screens[]` ignore. Le rapport les **nomme et les compte**,
sans en faire un finding : l'écart est légitime, le SKILL en documente quatre
formes ; ce qui manquait n'était pas un verdict, c'était le nombre.

⚠️ **Le premier garde était VACANT, et le harnais l'a dit le jour même.** Il
comptait les occurrences de `stageOneOnly(` dans le source ; la mutation
`stageOneOnly: [] ?? …` laisse chaque occurrence en place et vide la valeur. Un
garde de câblage qui lit du TEXTE ne voit pas une valeur neutralisée. Remède :
extraire `buildCoverage()` pour que le garde **construise l'objet** et regarde ce
qu'il contient. Puis la mutation elle-même est devenue périmée sous le
refactor — « motif trouvé 0× », rendu comme un défaut du harnais et non comme un
garde resté vert.

### 181. ✅ Corrigé le 26/08/2026 — Le gabarit de cadrage n'avait pas de ligne « budget device », que la méthodologie exige

`methodology-mobile.md` §4.5 est explicite : « **Budget explicite.** Si le temps
plafonne avant couverture complète, loggue ce qui a été échantillonné ET ce qui a
été ignoré. Jamais de troncature silencieuse. »

Le bloc CADRAGE de `PROMPTS.md` tranche `MODE`, `ENV`, `PLATFORMS`, `DEVICE` et
`APP` — et **rien sur le temps**. L'agent a donc dû couper 15 écrans à 7 sans
budget, et il l'a dit à la ligne : *« ce qui aurait levé l'ambiguïté : un budget
de minutes-device et "si tu dois couper, garde X" »*.

⚠️ Ni le document ni le gabarit ne sont faux séparément — c'est leur **écart** qui
l'est, et aucun test ne peut le voir : un écart entre deux textes n'a aucun
comportement à casser. Même forme que le point 156.

📌 Son arbitrage, lui, était **juste** : il a appliqué le quatrième écart de la
table du SKILL (« non atteignable de façon déterministe → étage 1 seulement »)
sans savoir qu'elle existait. Ce n'est pas le critère qui manquait, c'est le
budget qui l'aurait rendu inutile de deviner.

**Corrigé** : le bloc CADRAGE porte une ligne `BUDGET`, avec ce qu'il faut garder
si on doit couper — les parcours critiques — et l'obligation d'écrire ce qu'on a
laissé. Le garde **lit la contrainte dans la méthodologie** plutôt que de la
recopier : changer les deux ensemble ne peut pas le laisser vert, et il vérifie
que le bloc tranche toujours les cinq autres clés, sans quoi un bloc vidé
passerait.

### 182. ⚠️ DÉMENTI À MOITIÉ, ROUVERT EN 185 — « le plafond d'attente dérivé est trop bas »

Le run a perdu une passe device complète (8 min 39, 4 flows sur 6 morts sur
`Assertion is false: id: home_empty_root is visible`) avec le plafond dérivé de
20 s, contre des attentes relevées à `17162 · 20269 · 22824 · 25139 · 26951 ·
29083 ms`. La lecture naturelle est que `max(20 s, coldStartMs × 5)` sous-estime
une app à splash de marque.

**Mesuré sur les trois runs précédents, même terrain, même AVD, même app :**

| run | min | médiane | max | plafond |
|---|---|---|---|---|
| 20 | 6 389 | **7 552** | 8 617 | 45 000 |
| 21 | 6 793 | **8 134** | 11 121 | **20 000** (le dérivé) |
| 22 | 6 691 | **7 781** | 11 882 | 45 000 |
| 23 | 323 | **17 233** | 24 042 | 60 000 |

Le run 21 a tenu **avec le dérivé** et un pire cas à 11,9 s. Le run 23 démarre
**2,2× plus lentement** que ses trois prédécesseurs : la variable n'est pas le
seuil, c'est la charge de l'hôte — l'agent l'a relevée lui-même
(`load average 17,15`, un second émulateur, un `flutter_tester` d'un autre projet
à 68 % CPU).

Et le skill a fait exactement ce qu'il devait : échec **au bon endroit**, message
nommant `startTimeoutMs`, `coldStartMs` **non touché** pour que la lenteur reste
un finding. C'est le correctif 156-160, vérifié une fois de plus.

## ⚠️ Ce démenti était FAUX pour moitié — rouvert le 26/08/2026 en 185

Le run 24, sur une machine **peu chargée** (3,49 contre 17,15), a relevé
**20 039 ms contre un plafond de 20 000** : un flow terminé à **39 ms de marge**,
et 29 255 ms au run suivant. La charge n'était donc pas la seule variable.

📌 **L'erreur de raisonnement, à retenir** : j'ai isolé UNE variable — la charge —
vérifié qu'elle expliquait l'écart *entre les runs*, et conclu qu'il n'y en avait
pas d'autre. Elle expliquait la dispersion, pas la **minceur de la marge**. Isoler
une variable prouve ce qu'elle explique, jamais ce qu'elle épuise.

Ce qui reste vrai du démenti : le seuil n'est pas « trop bas » dans l'absolu, et
le run 21 a bien tenu avec lui. Ce qui était faux : en conclure qu'il n'y avait
rien. Le vrai défaut est que le plafond est dérivé de la **mauvaise grandeur** —
voir 185.

### 183. ✅ Corrigé le 26/08/2026 — Rien ne relevait la charge de la MACHINE, donc un run lent ressemblait à un skill lent

Le point précédent a failli être inscrit comme un vrai défaut. Ce qui l'a démenti
n'est pas une relecture : c'est d'avoir comparé les attentes de démarrage de
quatre runs. Cette comparaison n'était possible que parce que `startup.samples`
survit dans les rapports archivés — **par chance, pas par protocole**.

Aucun des six fichiers d'un étalon ne porte l'état de la machine au moment du
run : charge, appareils branchés, autres processus. Or ce run montre que cette
variable **double les temps** et **fait échouer des flows**, donc qu'elle produit
des symptômes indiscernables d'un défaut du skill.

📌 C'est un point sur **ma procédure**, pas sur le skill — comme le 77 (le banc
qui envoyait la sortie de l'installeur vers `/dev/null`) et comme le contrôle de
sauvegarde du run 16, qui était vert et mesurait autre chose.

**Corrigé** : `~/.argus-etalon/snapshot-machine.sh <N>`, à lancer **avant** le
sous-agent — charge, appareils branchés, AVD porté par chaque port, six processus
les plus gourmands. `check-etalons.sh` l'exige comme **septième fichier à partir
du run 24**, le numéro étant dérivé du nom de fichier pour qu'un run ajouté
demain hérite du critère sans qu'on y pense ; l'historique reste vert, ses runs
ayant été pris avant que le geste existe.

Contre-épreuve jouée : un run 24 factice sans son relevé sort en `MANQUE`, le même
avec le relevé sort `complet`, et les 22 runs réels restent verts.

⚠️ **Une ligne du script mentait à sa première exécution** — « mémoire libre :
0,0 Go », `Pages free` seul ne décrivant pas macOS, qui garde tout en inactif. Un
chiffre faux est pire qu'une ligne absente : remplacé par `memory_pressure`.

📌 Et le relevé a trouvé quelque chose dès son essai : **le téléphone personnel
est branché** alors qu'il ne l'était pas pendant le run — l'agent avait
explicitement rapporté « aucun appareil physique n'est apparu ». C'est exactement
ce que ce fichier existe pour capter.

### 184. ✅ Corrigé le 26/08/2026 — `argus-lint` ne voyait pas les CYCLES d'appels entre flows

Le run a perdu son premier `argus-run` :

```
[argus-mobile] ✖ 1 exécution(s) Maestro en échec sans étape fautive identifiée
```

Dossier d'artefacts vide, aucun JUnit. La commande rejouée à la main dit la vraie
cause : `Parsing Failed at .maestro/_subflows/goto.yaml:277:3` — une branche de
`goto.yaml` appelait `goto.yaml`. **Maestro rejette le workspace entier au
démarrage**, donc rien ne s'exécute et il n'y a pas d'étape fautive à nommer.

**Reproduit sans device**, sur un workspace jetable de deux fichiers :

```
maestro check-syntax .maestro/smoke.yaml                → OK
maestro check-syntax .maestro/_subflows/goto.yaml       → OK    ← il s'appelle lui-même
```

`make argus-lint` boucle exactement ainsi, fichier par fichier, et imprime
« ✔ tous les flows parsent ». La cible **valide chaque fichier et ne résout pas le
graphe d'appels** : un lint vert ne prouve donc pas qu'un workspace démarre.

Famille dominante du chantier : *un contrôle vert qui mesure autre chose*. Et son
symptôme est ici particulièrement trompeur, puisque l'échec qui suit ne nomme
aucune étape — l'endroit où l'on cherche est le dernier flow lancé, pas le
sous-flow fautif.

**Corrigé** : `flowCycles()` résout le graphe d'appels — `runFlow: x.yaml` et
`runFlow:` + `file:`, chemins relatifs résolus, **commentaires retirés** pour que
l'exemple commenté du gabarit ne fabrique pas d'arêtes — et
`config.mjs --check-flows` la câble à `make argus-lint`.

Prouvé **dans les deux sens** : `exit 0` sur le scaffold livré (12 flows, aucun
cycle) et `exit 1` sur un workspace jetable récursif, en nommant le cycle.

⚠️ **Deux défauts trouvés dans mon propre correctif, par la mesure et non par la
relecture.** Le contrôle était placé **après** `loadConfig()`, donc il échouait
sur « argus.mobile.yaml introuvable » dans un workspace jetable — c'est-à-dire
exactement là où on veut l'éprouver : *un contrôle qu'on ne peut pas voir dire NON
n'a rien prouvé*. Et `flowCycles` rapportait le même cycle **deux fois**, une par
point de départ, la clé de déduplication gardant la liste répétée au lieu de
l'ensemble des fichiers.

### 185. ✅ Corrigé le 26/08/2026 — Le plafond d'attente était dérivé du RÉGIME STABILISÉ, pas de ce que chaque flow paie

Mesuré sur ce run, machine peu chargée :

```
firstLaunchMs : 13 463 ms   ← ce que chaque flow paie : chacun fait clearState
coldStartMs   :  1 801 ms   ← ce dont le plafond est dérivé (× 5)
plafond dérivé = max(20 000, coldStartMs × 5) = 20 000 ms
attentes relevées : 8011 · 8615 · 8627 · 8771 · 18085 · 20039   puis 29 255
```

`clearState` remet l'app à l'état d'une installation fraîche, donc **chaque flow
paie un premier lancement**, pas un démarrage stabilisé. Le plafond, lui, se
dérive de `coldStartMs`, qui décrit le régime stabilisé — 1 801 ms ici, soit
**7,5 fois moins** que ce que le flow paie réellement. La marge est de 6,5 s sur
une grandeur qui varie, et un flow a terminé à **39 ms** de l'échec.

⚠️ Le harnais **mesure déjà** la bonne grandeur : `argus-perf` rapporte
`firstLaunchMs`, et il l'isole exprès du régime stabilisé. Mais `perf` tourne
APRÈS les flows, et rien ne relie les deux.

⚠️ **Et personne ne pouvait le voir venir** : un flow qui passe à 39 ms près rend
exactement le même vert qu'un flow qui passe avec dix secondes de marge. Le
rapport porte `startup.samples` et le plafond ; il ne dit jamais ce qui les
sépare.

📌 C'est la réouverture du **182**, que j'avais démenti la veille en isolant la
charge de l'hôte. Elle expliquait la dispersion entre les runs, pas la minceur de
la marge.

**Corrigé en disant la MARGE**, puisque c'est l'information qui manquait : le
runner avertit dès que la pire attente consomme 70 % du plafond — un choix, écrit
comme tel — et son message **nomme la bonne grandeur** : dérive `startTimeoutMs`
de `firstLaunchMs`, que `argus-perf` mesure déjà, parce que `clearState` fait
payer un premier lancement à **chaque** flow. Et il redit de ne pas toucher
`coldStartMs`, qui RAPPORTE la lenteur.

⚠️ **Le plafond lui-même n'est pas relevé, et c'est délibéré** : mettre un autre
nombre à la place d'un nombre deviné n'aurait rien prouvé. Ce qui manquait n'était
pas une valeur, c'était de savoir qu'on passait à 39 ms de l'échec.

⚠️ **Mon garde est né vacant — le deuxième jour de suite, sur le même motif.** Il
vérifiait le câblage en LISANT la source ; la mutation `if (false && marge?.serre)`
laisse le texte intact. `startupMarginWarning()` est extraite pour que le garde
l'appelle et lise ce qui revient. La leçon, deux fois payée : *un garde de câblage
qui lit du texte ne voit pas une valeur neutralisée*.

### 186. ❌ DÉMENTI — « la clé `budget` manque au gabarit de config »

`config.mjs:361` porte `budget: { maxMinutes: 25, maxFlows: 40 }`, et le runner
publie `run.budget` dans le rapport. Le gabarit `argus.mobile.yaml` livré, lui,
**ne la montre nulle part** — le mot n'y apparaît que dans des commentaires qui
parlent d'autre chose (`binarySizeMb`, choix du device).

Conséquence mesurée : le gabarit de prompt demande depuis aujourd'hui de trancher
un `BUDGET` (point 181), l'agent l'a fait, et il a dû **écrire la clé lui-même**
sans qu'aucun exemple ne la lui montre. Il est tombé juste ; rien ne le
garantissait.

**Faux, et c'est le parseur du skill qui l'a dit.** En ajoutant la clé, le
chargement de la config a rendu :

```
[argus-mobile] ✖ argus.mobile.yaml:455 — clé « budget » dupliquée
```

Elle était là depuis toujours, **ligne 439**, avec `maxMinutes: 25` et
`maxFlows: 40`. Mon `grep` initial la cherchait bien, mais un `head -3` a tronqué
la sortie aux trois premières occurrences — toutes des commentaires parlant
d'autre chose. J'ai conclu sur une mesure incomplète.

📌 *Un chiffre issu d'un grep se vérifie en listant ce qu'il a compté.* Ici, il a
suffi que l'instrument affiche trois lignes au lieu de toutes pour qu'un constat
naisse. Le correctif a été annulé (`git checkout`) et le gabarit est intact.

📌 Ce qui reste vrai : le **181** — le gabarit de PROMPT ne demandait pas de
trancher ce budget, et c'est corrigé. La clé, elle, existait.

### 187. ✅ Corrigé le 26/08/2026 — Une capture ne pouvait exister que sur ÉCHEC, donc la page publiée n'en avait jamais

`artifact.evidence: all` promet « les captures des findings embarquées dans la
page ». Relevé de **tous** les producteurs du champ `evidence` :

| producteur | ce qu'il y met |
|---|---|
| `run.mjs:826` | les artefacts Maestro d'une **étape en échec** — les seules images |
| `run.mjs:1026` | `[]` — le finding de démarrage |
| `sec.mjs:74` | un chemin de fichier **source** |
| `sca.mjs:135` | une source de CVE |

Et `embedEvidence` filtre sur le type MIME : ce qui n'est pas une image est
ignoré, « le chemin suffit ». **Le seul producteur d'images est donc l'échec.**

Mesuré sur ce run : `report.json` porte **1 finding**, `evidence: []`. Les 23
findings de la page viennent de l'agrégat des cinq dimensions, et **aucun** ne
porte d'image. Pendant ce temps **18 PNG existent sur le disque** — les 4
références visuelles et les captures de la passe visuelle — qu'aucun finding ne
référence.

⚠️ **Le paradoxe est structurel** : un run vert est précisément celui qu'on
publie, et c'est celui qui ne peut rien montrer. Les findings qui gagneraient le
plus à être vus — 18 cibles tactiles sous 48 dp, un contraste à 2,86, un
débordement de 41 px à taille NOMINALE — viennent de l'étage 1 et d'`argus-a11y`,
qui n'attachent aucune capture.

📌 Trouvé par Germinator **en regardant la page publiée**, pas par un test. Sans
le run 25, personne n'ouvrait ce livrable — et le compte rendu de l'agent portait
déjà le signal, dans un mot : « aucune capture, **malgré** `evidence: all` ».

**Corrigé** : `argus-a11y` parle déjà au device ; il capture désormais l'écran
qu'il vient de mesurer et l'attache aux deux familles de findings. **Par fichier
puis `pull`, jamais `exec-out`** : `screencap -p` écrit du PNG sur stdout et
`sh()` décode en UTF-8 — l'image reviendrait corrompue sans un mot.

⚠️ **Deux choses attrapées dans mon propre correctif.** `node --check` est passé
sur un appel à une variable **qui n'existait pas** (`ecran` au lieu de
`identity.id`) — la leçon du run 11 : il prouve qu'un fichier parse, jamais qu'il
décide juste ; seul l'import, puis le garde, l'ont vu. Et le câblage d'une capture
RÉELLE **n'a pas de garde exécutable**, parce qu'il faut un appareil pour en
produire une : c'est écrit dans le code plutôt que laissé passer pour un oubli.

### 188. ✅ Corrigé le 26/08/2026 — Le bandeau « partiel » se déclenchait sur la configuration PAR DÉFAUT

`.maestro/config.yaml` livré porte `excludeTags: [wip, manual]`. Tout run normal
est donc étiqueté `scope: "filtré (-wip -manual)"`, et le rapport affiche son
bandeau « partiel ».

Ce bandeau vient des points 141-148 : il existe pour qu'un run **filtré à la
main** — celui de la contre-épreuve visuelle — ne passe pas pour complet. Mais
`wip` et `manual` désignent des flows qui *ne doivent jamais tourner*, pas un
rétrécissement de périmètre.

⚠️ Un avertissement qui se déclenche **toujours** n'avertit plus. Et depuis le
run 25 il est **publié** : la page destinée à d'autres s'annonce incomplète alors
qu'elle décrit un run complet.

**Corrigé** : `runScope()` sépare ce que le **workspace** exclut par nature de ce
qu'une **ligne de commande** retranche. Seul le second fait un run « filtré ». Le
périmètre du projet reste **dit**, en ligne simple et sans badge — le taire ferait
croire qu'un run complet exécute tout ce que le dépôt contient, ce qui est faux
aussi. Et l'autre moitié est gardée : un run filtré à la main se dénonce toujours,
ce pour quoi le point 141 existe.

### 189. ✅ Corrigé le 26/08/2026 — `argusLocalizationsDelegates` : la condition écrite était trop étroite

Le gabarit dit : « **si** ton app formate des dates ou des nombres localisés
(`DateFormat(…, 'fr_FR')`, pluriels `intl`), ajoute ici les delegates ».

Le vrai déclencheur, mesuré : **tout écran qui monte un `AppBar` ou un
`TextField`**, c'est-à-dire n'importe quel écran Material.

```
The following assertion was thrown building AppBar(...): No MaterialLocalizations found.
```

⚠️ **Et le symptôme ne désigne pas la cause** : le montage lève, l'arbre reste à
moitié construit, et ce qui échoue ensuite n'a aucun rapport — quatre gardes
rouges sur `form_reps_minus` et `form_reps_plus`. C'est la forme exacte du piège
« une mesure absurde n'est pas un défaut de disposition, c'est une exception plus
haut ».

### 190. ✅ Corrigé le 26/08/2026 — Un `back` sur la racine met l'app en ARRIÈRE-PLAN au lieu de dépiler

L'agent avait écrit `- back: optional: true` en tête de chaque branche de `goto`,
« au cas où ». Sur Android, quand la pile ne contient que la coquille, `back` ne
dépile rien : **il met l'app en arrière-plan**. Tout ce qui suit échoue alors en
accusant une ancre parfaitement correcte —
`Element not found: Id matching regex: nav_history`, sur une ancre que le dump
montre présente.

Ni le SKILL ni les sous-flows livrés ne mentionnent ce piège, alors que le
scaffold recommande par ailleurs des gestes de navigation défensifs. Le remède
appliqué par l'agent est le bon et mérite d'être prescrit : conditionner tout
`back` à `notVisible:` sur l'ancre témoin de la coquille.

### 191. ✅ Corrigé le 26/08/2026 — La publication exigeait un titre et une icône STABLES sans les prescrire

`SKILL.md` §g bis demande de « garder le titre et l'icône stables d'un run à
l'autre ». Il ne dit ni lequel, ni où le noter — `artifact.title` existe, aucune
clé ne porte l'icône.

Conséquence : l'agent a choisi 📱🔍 et l'a écrit dans son compte rendu, pas dans
la config. **Le prochain run en choisira un autre**, et la page changera
d'identité — « un favicon qui change fait lire la page comme une autre ».

📌 Et le gabarit `PROMPTS.md` ne porte aucune ligne `ARTEFACT`, alors que deux
runs consécutifs (23 et 24) se sont arrêtés faute de cette décision, en le
signalant tous deux au §3. Même motif que le **181**.

**Corrigé** : `artifact.icon` existe à côté d'`artifact.title`, et `report.mjs`
**imprime les deux** au moment de publier — l'identité se lit, elle ne se retient
pas. `PROMPTS.md` porte une ligne `ARTEFACT`, qui dit que le défaut « non » est
sûr *et* que tant qu'on ne tranche pas, le livrable n'existe jamais.

### 192. ✅ Corrigé le 31/08/2026 — Le garde des clés sans lecteur compte une mention en CHAÎNE comme une lecture

Né de la passe. En ajoutant `artifact.icon`, la mutation qui **retire sa lecture**
a laissé le garde vert — `VACANT` rendu par le harnais.

Cause : le garde retire les **commentaires** du corpus, pas les **chaînes**. Le
message de publication écrit `« … argus.mobile.yaml → artifact.title /
artifact.icon »`, donc le motif du lecteur (`\.icon\b`) y matche. Une clé cette
par un message d'aide passe pour lue.

⚠️ **Et le durcissement évident est FAUX.** Retirer les chaînes par regex
(`/'(?:[^'\\]|\\.)*'/`) fait apparaître **six clés mortes qui ne le sont pas** —
`budget.maxMinutes`, `gate.failOnVisualDiff`, `artifact.maxMb`… Mesuré : une
apostrophe française dans une chaîne à guillemets doubles (`"aujourd'hui"`) ouvre
un appariement qui **avale le code** jusqu'à la quote suivante, emportant de
vraies lectures. Corriger demande un lexer, pas une expression régulière.

📌 Laissé **ouvert** avec sa mesure plutôt que fermé par un remède qui casse
davantage. La mutation, elle, retire lecture *et* mention, donc le garde reste
prouvé pour ce qu'il fait — et ce qu'il ne fait pas est désormais écrit.

### ✅ Fermé le 31/08/2026 — par un balayage, pas par une regex

Le diagnostic tenait : il fallait scanner de **gauche à droite**, la première
quote rencontrée décidant. Les sept fausses mortes de la regex ont été
**re-mesurées le jour même** — mêmes sept, le constat n'avait pas vieilli.

Le balayage retire commentaires et littéraux, **garde le code des `${…}`**
(`${config.artifact.icon}` EST une lecture), scanne **fichier par fichier**
(un état mal refermé mangerait le fichier suivant) et saute le shebang, dont le
`#!/usr/bin/env` se lit sinon comme un littéral de regex.

⚠️ **Deux versions du scanner ont été écrites, et la première était fausse** —
elle recursait sur le contenu des `${}` en comptant les accolades à part, et
perdait **8 clés** dont les lectures étaient bien réelles. Ce qui l'a démasquée
n'est pas une relecture mais l'**oracle à deux sens** : « zéro morte » ET « la
mention connue a disparu ». La première version échouait la moitié gauche.

**Épreuve décisive** : la mutation du harnais ne retire plus que **la lecture**,
en laissant la mention dans le message — le cas qui restait vert. Elle tombe.

📌 **Deux corpus désormais**, chacun avec sa raison : le garde des clés mortes
retire les chaînes, le collecteur du point 216 les **garde** — chez lui, ce sont
des noms de clés, pas de la prose.

## Run 26 — la publication tient, et le seul `critical` de la page ne dit pas d'où il vient

Vingt-sixième run, même terrain remis à neuf. Le run 25 avait publié la page pour
la première fois ; le 26 éprouve **l'autre moitié de la boucle** — republier sur
l'URL existante au lieu d'en créer une seconde. **Elle tient** : page mise à jour
sur son URL, titre et icône conservés, **aucune page en double** (vérifié en
listant les artefacts, pas en croyant le compte rendu).

Le run est propre : 38 tests d'ancres, **383 gardes verts**, 558 tests du projet
intacts, `flutter analyze` sans issue, **10/10 flows verts**, contre-épreuve
visuelle prouvée en quatre temps et restauration prouvée par hash. Le Makefile a
détecté FVM **seul**, alors que le cadrage que je lui avais écrit affirmait le
contraire.

⚠️ **Trois de mes quatre hypothèses de départ sont tombées à la reproduction**, et
la quatrième s'est retournée en cours de route : je cherchais une réserve fausse,
c'est une réserve **absente** qu'il y avait.

### 193. ✅ Corrigé le 26/08/2026 — Le verdict de DÉMARRAGE ne dit pas sur quel binaire il a été pris, alors que ses deux voisins le disent

`perf.mjs` dérive un `variante` du chemin de `build.android` — le binaire que le
runner **installe**, un debug presque toujours. Il le passe à `QAM-PERF-SIZE`
(l. 334) et à `QAM-PERF-MEM` (l. 509), qui affichent alors « (mesuré sur un
debug) » et invitent à comparer à la release avant de conclure.
**`QAM-PERF-COLD` et `QAM-PERF-WARM` (l. 507-508) ne le reçoivent pas.**

Or `am start -W` chronomètre le **paquet installé** : exactement le binaire que la
mémoire mesure. Et le démarrage est *plus* sensible au variant que la mémoire —
debug, profile et release donnent couramment un facteur 4 sur le même code.

Mesuré au run 26 : `coldStartMs: 11745` contre un budget de 2000, donc `critical`
(la sévérité passe au-delà du double). C'est **le seul `critical` de la page
publiée**, et rien à côté ne dit qu'il vient d'un debug — pendant que le finding
mémoire, moins grave, porte la réserve.

⚠️ Le commentaire de `thresholdFinding` affirme même l'inverse : « ces deux
métriques-ci sont **encore plus** sensibles au variant », en parlant de la mémoire
et de la taille. La phrase est vraie de ce qu'elle compare, et fausse de ce
qu'elle laisse dehors.

📌 La forme du 188 retournée : là, un bandeau se déclenchait **toujours** ; ici,
une réserve manque **là où elle compte le plus**. Et la forme du chantier : une
leçon apprise pour deux métriques, jamais étendue aux deux voisines du même appel.

### 194. ✅ Corrigé le 26/08/2026 — Rien ne relève l'état de l'HÔTE à côté d'une mesure de démarrage

L'en-tête de `perf.mjs` porte la règle en capitales — « **UN CHIFFRE DE
PERFORMANCE NE VEUT RIEN DIRE SANS L'ÉTAT OÙ IL EST PRIS** » — et l'applique à une
variable : le premier lancement, mesuré séparément du régime stabilisé.
`deviceContext` relève même l'état de compilation ART, c'est-à-dire le mécanisme
qu'une mesure avait **réfuté**. La charge de l'hôte, elle, n'est relevée nulle
part : un `grep` sur tout le skill ne rend aucun `loadavg`, aucun `uptime`.

Or c'est elle qui a coûté une passe device complète au run 23 — médiane de
démarrage à **17 233 ms** contre 7 552, 8 134 et 7 781 aux trois runs précédents,
même terrain, même AVD, même app. Le chantier en a tiré un relevé machine **pour
lui-même**, et ne l'a jamais reporté dans le skill qu'il éprouve.

Le run 26 rejoue la scène : `coldStartSamples: [12184, 10137, 11745]` avec un
second émulateur allumé et des builds en cours, quand le même binaire sur le même
AVD donnait **1 768 ms** plus tôt dans la journée. L'agent a refusé de conclure —
correctement — et a dû écrire sa réserve **à la main** dans sa config, où aucun
lecteur de la page ne la verra.

⚠️ Un émulateur partage le CPU de l'hôte, un appareil physique non : le relevé n'a
de sens que sur émulateur, sans quoi il ajoute du bruit sur les vrais téléphones.

### 195. ✅ Corrigé le 26/08/2026 — Le gabarit demande un budget sans dire ce qui est incompressible

`PROMPTS.md` fait de `BUDGET` une des cinq lignes qu'on ne supprime pas et
explique pourquoi — mais ne dit pas ce que la première passe coûte. `SKILL.md`
l'écrit pourtant : « sur un émulateur, la séquence complète approche les vingt
minutes », plus un `argus-perf` dont le coût *suit le démarrage de l'app*. Le dev,
lui, remplit le gabarit **avant** d'avoir lu le skill en entier.

Mesuré : budget de 30 min donné au run 26, **43 min 16 s** consommées (+44 %).

⚠️ **Ce n'est pas un défaut de comportement, et c'était mon hypothèse de départ.**
Le skill annonce le coût, déclare la contre-épreuve obligatoire en quatre temps,
et le dépassement a été *dit* comme la méthodologie l'exige. C'est un écart de
**place** : le chiffre est demandé là où l'information qui permet de le calibrer
n'est pas.

### 196. ✅ Corrigé le 26/08/2026 — Le harnais de mutation lance sa passe sur un drapeau qu'il ne connaît pas

Né de la passe, et vécu en direct : `python3 tools/mutate-run-guards.py --help`,
tapé pour savoir comment lister les mutations, a **démarré les 80 mutations**.
`main()` ne lisait aucun argument — tout ce qui n'était pas géré tombait dans le
seul comportement du script.

L'interrompre a laissé `perf.mjs` **muté dans l'arbre de travail** (la borne
d'expiration retirée de `measureWarmStarts`), sans un mot. Restauré, prouvé par
hash — `5fef7541…` attendu, obtenu.

⚠️ **Ce script réécrit des fichiers suivis et les restaure par `git checkout`.**
C'est précisément celui qui ne doit pas tomber dans son mode le plus destructeur
sur un doute. Et le piège frappe pendant la **reconnaissance**, quand on cherche
encore comment l'utiliser.

**Corrigé** : `--help` imprime les options, `--list` nomme les mutations sans
toucher un fichier, tout le reste sort en 2. Mesuré : **0,04 à 0,06 s** pour les
trois formes, contre plusieurs minutes pour une vraie passe — et l'arbre reste
propre. La durée est la preuve qu'aucune mutation n'a démarré.

📌 **Deuxième correction à ma procédure du jour** : ma note disait que le harnais
réécrit « `run.mjs`, `report.mjs` et `SKILL.md` ». Il porte **treize** cibles, dont
`perf.mjs` — celle qui est restée mutée. Une liste partielle avait valeur de
garantie.

### 197. ✅ Corrigé le 26/08/2026 — La phrase qui dit ce que le démarrage MESURE était construite et jetée

`perf.mjs` construisait `const mesure = 'am start -W : jusqu'à la première frame,
splash de marque compris mais PAS l'initialisation applicative qui suit…'` —
**et rien ne la lisait**. Elle vivait sous ses trois lignes de commentaire, qui
expliquent pourquoi elle est indispensable : sans elle, le chiffre se lit en
regard de `startup.samples` du rapport principal — qui mesure l'écran
*exploitable* — et l'écart passe pour une contradiction.

Morte avant cette passe, vérifiée dans `HEAD` : une seule occurrence de
l'identifiant, sa déclaration.

⚠️ **Aucun test ne pouvait la voir**, et c'est ce qui rend le cas instructif :
une variable inutilisée ne casse rien, ne lève rien, et `node --check` encore
moins. C'est l'**analyseur de types** qui l'a nommée, en passant, pendant que je
corrigeais autre chose — le même genre de hasard que l'émulateur du run 17.

**Corrigé** : extraite en `startupMetricLabel()` et écrite dans `perf.json` sous
`metrics.startupMetric`. Le garde **appelle** la fonction et vérifie la clé, au
lieu de chercher un motif dans la source.


### 198. ✅ Corrigé le 28/08/2026 — Le finding de démarrage des FLOWS ne dit pas sur quel binaire il a mesuré

`QAM-START` est un finding **major** — « l'écran de départ met 10 s à
apparaître », 10/10 flows au-dessus du seuil au run 27. Il porte `device`,
`platform`, `osVersion`, une commande de reproduction… et **rien sur le variant
du binaire**. Or les flows Maestro s'exécutent sur le paquet posé par
`argus-build`, c'est-à-dire le **debug**.

Mesuré sur le rapport du run 27 : `report.json` contient **0 occurrence** de
`debug`, `release`, `variant` ou `apk`.

C'est le **193 chez le voisin**. Le remède du 193 avait été posé dans
`perf.mjs`, où il est correct ; `run.mjs:1006` produit l'autre finding de
démarrage, et ne l'a jamais reçu. Forme exacte de la règle « une mise en garde
passée à N-1 appels sur N » — sauf que le N-ième vit dans un **autre fichier**,
ce qui est précisément ce qui l'a fait manquer.

⚠️ **Aggravant, et c'est ce qui rend le point intéressant** : `report.mjs:267`
*sait* que les deux grandeurs de démarrage se lisent comme une contradiction, et
il a été corrigé pour afficher la phrase qui les sépare — première frame contre
écran exploitable. Mais cette phrase explique l'écart de **grandeur**, pas
l'écart de **binaire**. Deux causes indépendantes produisent le même symptôme, et
le rapport n'en nomme qu'une : le lecteur attribue donc tout l'écart à
l'initialisation applicative, et rien au JIT du debug.

### 199. ✅ Corrigé le 28/08/2026 — La variante du binaire est dérivée de la commande de BUILD, jamais du paquet MESURÉ

`perf.mjs:584` :

```js
// Le variant du binaire mesuré : `-debug.apk` dans le chemin suffit à le dire,
const variante = /-debug\.(apk|aab)$/i.test(String(config.build?.android ?? '')) ? 'debug' : '';
```

Le commentaire dit « le binaire **mesuré** » ; la ligne lit `config.build.android`,
c'est-à-dire la commande de build **configurée**. Or `perf.mjs` **n'installe
rien** : `am start -W` chronomètre le paquet déjà posé sur l'appareil. Trois
sources cohabitent donc dans un seul bloc `metrics`, présentées comme une seule
mesure :

| valeur | d'où elle vient |
|---|---|
| `variante` | la commande de build **configurée** |
| `binaryIsRelease` | l'**APK sur disque**, pesé |
| `coldStartMs` / `warmStartMs` / `memoryMb` | le **paquet installé**, chronométré |

**Mesuré le 28/08/2026** sur `Medium_Phone_API_36.1`, `am start -W`, médiane de
trois lancements à froid après rodage :

| paquet installé | lancements | médiane |
|---|---|---|
| debug (`flags=[ DEBUGGABLE … ]`) | 1180 · 1246 · 1213 | **1213 ms** |
| release (`Success` confirmé, plus de `DEBUGGABLE`) | 525 · 602 · 532 | **532 ms** |

Écart **681 ms, facteur 2,28**. Le `perf.json` du run 27 affirme
`coldStartMs: 1313` **sous `binaryIsRelease: true`** : ces 1313 ms décrivaient le
debug.

⚠️ Le fichier ne se contente pas de taire la réserve, **il affirme le
contraire** — ce qui est pire qu'un silence : un lecteur qui compare son
démarrage à son budget croit mesurer ce qu'il publie, alors qu'il est 2,28× plus
rapide. C'est la forme « le garde mesure la DÉCLARATION au lieu de l'EFFET »,
appliquée cette fois au **remède du 193 lui-même** : la réserve est bien passée
aux quatre appels, elle transporte simplement une valeur qui ne vient pas de la
mesure.

### 200. ✅ Corrigé le 28/08/2026 — Les captures de preuve ne sont bornées en hauteur nulle part

`report.mjs:251` : `.shot{max-width:100%;display:block;border:…;margin-top:8px}`
— **aucune `max-height`**. Les preuves sont des captures de téléphone
(`1080×2400`, ratio 1:2,22), donc rendues à pleine largeur elles occupent
~2 600 px de haut **chacune**. Le run 27 en embarque **5** dans une page de
1,13 Mo : un finding de quatre lignes est suivi de trois écrans de défilement, et
la page cesse d'être parcourable — ce qui est pourtant son seul usage.

Trouvé par Germinator **en regardant la page publiée**, comme le 187.

⚠️ **Ce défaut a été CRÉÉ par le correctif du 187.** Tant qu'une capture ne
pouvait exister que sur échec, la page publiée n'en portait jamais, et le défaut
de dimensionnement était hors d'atteinte de toute mesure. Le remède déplace le
mode de panne : c'est la cinquième façon pour un garde de devenir vacant,
observée ici sur le livrable au lieu du test.

⚠️ **Et le cas qui compte n'est pas celui qu'on observe.** Relevé sur les 26 runs
archivés (instrument validé par contre-épreuve sur le run 27 : 7 findings dont 5
avec preuve, exactement ce que la page rend) :

| | |
|---|---|
| findings dépouillés | **320** |
| portant plus d'une preuve | **0** — maximum observé : 1 |
| par dimension | a11y 199 · performance 82 · security 39 · **visual 0** |

Lu seul, ce relevé dit que le multi-captures n'existe pas. Mais `run.mjs:826`
attache à un finding **tous** les artefacts de son flow — pour un échec visuel :
référence, capture actuelle et diff, soit trois images. Si aucun run n'en a
produit, c'est qu'**aucune régression visuelle n'a encore été attrapée** : celle
du run 27 a dû être forcée à l'aplat magenta. Le cas multi-captures est donc le
cas **nominal** du mode REGRESS, et le jour où il se produit la page empile
~8 000 px. Conclure de l'absence d'observation à l'absence de besoin aurait été
l'erreur.


**Corrigé** : `installedVariant(udid, packageName)` dans `config.mjs` lit
`flags=[ … ]` sur l'appareil et rend `'debug' | 'release' | ''`. Le vide dit
« pas mesuré » et **jamais** « release » — confondre les deux reconstruirait le
défaut en silence, dans le sens flatteur. `perf.json` gagne
`metrics.measuredVariant` **à côté** de `binaryIsRelease`, si bien que le paquet
chronométré et le binaire pesé se lisent l'un contre l'autre au lieu de se
contredire. `QAM-START` reçoit la même valeur, et `caveatDebug` le reconnaît
plutôt que `run.mjs` ne recopie la phrase — les trois démarrages ne peuvent plus
diverger. Sept mutations, dont « une lecture ratée se lit release » et « le site
d'appel cesse de LIRE le variant ».

**Corrigé (200)** : les vignettes tiennent dans une rangée qui replie, bornées
en hauteur et en ratio ; un clic ouvre la capture en grand dans une visionneuse
à **trois sorties** — croix, clic extérieur, Échap. Sans image embarquée, ni
rangée ni visionneuse : `evidence: none` ne laisse pas de gouttière morte. Le
garde qui compte le plus est celui des **trois** preuves, le cas nominal du mode
REGRESS que vingt-six runs n'ont jamais produit.


### 201. ✅ Corrigé le 28/08/2026 — Le message de débordement imprime `$thrown` en toutes lettres

`layout_test.dart:68`. Le `reason:` est fait de trois fragments concaténés, et le
troisième passe en **guillemets doubles** parce qu'il porte des apostrophes
françaises (`n'est`, `l'écran`). Dans une chaîne Dart à guillemets doubles,
`\$thrown` **échappe** le `$` : le littéral est imprimé.

Les deux premiers fragments, eux, sont en guillemets simples et interpolent
correctement (`${screen.id}`, `$label`). C'est le changement de délimiteur — imposé
par la ponctuation, pas choisi — qui a désarmé l'interpolation du troisième.

**Reproduit en exécutant**, pas en lisant : une ligne retirée de
`known_issues.dart` sur le terrain fait rougir le test, et la sortie donne

```
Expected: null
  Actual: FlutterError:<A RenderFlex overflowed by 55 pixels on the right.>
Débordement sur categories-empty en compact 360×640 · texte ×2.0.
Cherche « The relevant error-causing widget was » dans la sortie : le widget
fautif n'est presque jamais celui de l'écran.
$thrown
```

⚠️ **Et c'est la mesure qui tranche entre les deux remèdes**, là où la lecture ne
le pouvait pas. Interpoler pour de bon **doublerait** ce que `Actual:` affiche une
ligne plus haut — l'exception est déjà là, en entier. Le jeton n'ajoutait donc
rien même quand il fonctionnait : il est **retiré**, pas réparé.

📌 Le run l'a signalé sans proposer de remède, en écrivant que les deux
possibles « ne disent pas la même chose » et qu'il ne trancherait pas dans un
fichier du CADRE. C'est exactement le bon partage : le symptôme est observé, le
remède se décide là où l'on voit les deux sorties.

**Corrigé** : le jeton retiré, et un garde qui **appelle** la construction du
message pour vérifier qu'aucun `$` littéral n'y survit — sur les trois fragments,
pas sur celui qu'on vient de toucher.


### 202. ✅ Corrigé le 28/08/2026 — `_subflows/login.yaml` est classé CADRE — alors que la config prescrit d'y écrire le parcours métier

`argus.mobile.yaml` le dit en toutes lettres, au-dessus de la clé `auth` :

> « La forme de l'authentification (formulaire, OTP, SSO, biométrie) ne se
> déclare pas : elle **s'écrit**, dans `.maestro/_subflows/login.yaml`. »

Or ce fichier ne porte **aucun marqueur de classement**, quand ses deux voisins
qu'on personnalise aussi — `goto.yaml` et `mask-dynamic.yaml` — sont
`ARGUS:OWNED`. C'est une asymétrie, pas une décision : relevé sur les treize
flows livrés, `login.yaml` est le seul fichier que la doc invite à réécrire et
que l'installeur croit sien.

Conséquence mesurée dans `install-mobile.sh` : un fichier sans marqueur tombe
dans `update) cp "$src" "$dest"` (l. 181) — **le parcours d'authentification du
projet est écrasé** au prochain `--update`.

⚠️ **Et l'utilisateur ne peut rien y faire**, ce qui est la moitié qui compte :
l'installeur classe d'après `head -20 "$src"` (l. 134 et 150), c'est-à-dire la
**source livrée**, jamais la copie locale. Poser `ARGUS:OWNED` dans son propre
`login.yaml` ne protège donc de rien — le run qui l'a fait ne s'en est tiré que
parce que son fichier avait cessé de ressembler à celui d'origine.

C'est la forme exacte de la règle « un outil qui écrit chez l'hôte doit
reconnaître SA copie », appliquée au seul fichier dont le contenu est, par
construction, celui de l'hôte.

### 203. ✅ Corrigé le 28/08/2026 — Après la connexion, deux flows assertent l'écran de DÉPART

`lifecycle.yaml` fait `runFlow: _subflows/login.yaml` (l. 13) puis
`assertVisible: id: ${ARGUS_ANCHOR_HOME}` (l. 28). Or `ARGUS_ANCHOR_HOME` porte
l'ancre de l'écran `start: true` — sur une application authentifiée, **celui
qu'on vient de quitter**.

Périmètre mesuré, et il n'est pas d'un fichier : sur les treize flows livrés,
**deux** enchaînent les deux gestes — `lifecycle.yaml` (4 occurrences) et
`journey-critical.yaml` (3). `launch-clean.yaml`, lui, attend
`ARGUS_ANCHOR_HOME` **avant** la connexion, ce qui est juste.

⚠️ Le symptôme trompe deux fois. L'échec dit `Assertion is false: id: <ancre> is
visible` **avec une capture de l'accueil parfaitement affiché**, donc il accuse
l'instrumentation ; et le message d'aide prescrit de relever `startTimeoutMs`,
pour une lenteur qui n'existe pas.

📌 **Le remède proposé par le run était d'ajouter une clé `postAuthAnchor`. La
mesure l'a écarté** : `auth.anchors.success` existe déjà — « ancre prouvant que
la session est ouverte » — et le runner l'injecte sous `ARGUS_AUTH_SUCCESS`
(`run.mjs:584`). Elle n'est simplement consommée **que par `login.yaml`**,
pendant que huit fichiers lisent `ARGUS_ANCHOR_HOME`. Ajouter une clé aurait
doublé celle qui manquait de lecteurs.

### 204. ✅ Corrigé le 28/08/2026 — `auth.anchors` décrit un FORMULAIRE, pas un parcours

Les cinq clés livrées — `screen`, `user`, `password`, `submit`, `success` —
supposent un écran unique à deux champs. Un parcours en trois écrans (identifiant
→ code à usage unique → code secret) n'a nulle part où se décrire : il faut les
remplir avec les ancres du premier écran pour débloquer `ARGUS_AUTH_READY`, et
écrire ailleurs que c'est leur seul rôle.

Ce n'est pas un défaut de `login.yaml`, qui est fait pour porter la forme réelle
(cf. 202) : c'est que les cinq clés **prétendent la décrire** alors qu'elles ne
servent qu'à ouvrir la porte. Le commentaire qui les accompagne dit « ancres
sémantiques du formulaire de connexion » — vrai du cas simple, trompeur des
autres.

### 205. ✅ Corrigé le 28/08/2026 — Rien ne dit ce que l'authentification COÛTE à chaque flow

`clearState: true` avant chaque flow est la première règle anti-flake du skill,
et elle est juste. Sur une application authentifiée, elle impose une
**reconnexion par flow** — donc autant d'allers-retours vers l'API que de flows.

Relevé sur un projet réel : l'endpoint d'envoi du code à usage unique est borné
à **trois appels par minute**, et une suite complète en consomme déjà trois. Les
flows suivants échouent alors sur une limite de débit, c'est-à-dire sur un
symptôme qui ne ressemble à rien de ce que le skill décrit.

Mesuré : **zéro** occurrence de `quota`, `rate limit`, `coût d'authentification`
ou `session partagée` dans la configuration livrée. Il n'y a pas de clé pour
déclarer qu'une authentification est chère, ni de recette pour la partager entre
flows.

⚠️ Même famille : un code à usage unique **réel** est un effet de bord
**sortant**. Le skill interdit bien « les SMS/OTP réels vers des numéros tiers »,
mais ne dit nulle part comment un flow d'authentification l'évite — un
`ENV` mal choisi suffit à envoyer de vrais messages.

### 206. ✅ Corrigé le 28/08/2026 — Les données servies par l'API entrent dans les références visuelles COMMITÉES

Le `.gitignore` livré porte une exception explicite et justifiée :
`!/.maestro/_baselines/` — « les baselines visuelles se COMMITENT. Sans elles, la
dimension ne compare rien ». C'est vrai.

Mais sur une application qui consomme une API, la capture de l'écran principal
**contient les données servies** : sur un projet réel, une référence de 320 Ko
portait des noms de clients et des numéros de commande. Le skill envisage le cas
d'un « compte de test » ; il n'envisage pas un **jeu de données** servi par un
backend, qui se retrouve versionné dans le dépôt du projet.

Ce n'est pas un défaut à corriger en silence : c'est une décision que le skill
doit faire prendre — masquer, cadrer plus serré, ou assumer — avant que la
première référence ne soit écrite.

### 207. ✅ Corrigé le 28/08/2026 — Le skill prescrit de toucher aux composants partagés, sans dire ce qu'est un paquet VOISIN

`SKILL.md` traite abondamment le design system — « dans un design system, il est
à l'intérieur du composant », « composant partagé, 14 call-sites →
semanticIdentifier ». Tous ses exemples vivent **dans le même dépôt**
(`lib/…/shared/bouton.dart`).

Un projet réel peut tirer ses composants d'un paquet dans un **autre dépôt**,
partagé avec des applications en production. La prescription du skill s'y
applique mot pour mot, et elle est alors **inapplicable sans arbitrage** : il
faut décider si l'on modifie l'API publique d'un paquet tiers.

Conséquence mesurée quand on décide de ne pas y toucher : **six ancres de
commande restent inertes** — posées au call-site autour d'un composant qui
construit son propre nœud —, inscrites en dette faute de pouvoir poser le
paramètre une couche plus bas. Le skill ne dit ni que le cas existe, ni ce qu'il
coûte, ni comment l'inscrire.

### 208. ✅ Corrigé le 28/08/2026 — Le gabarit de prompt n'a AUCUNE ligne pour une application qui consomme une API

Mesuré : **zéro** occurrence de `API`, `backend`, `flavor` ou `dart-define` dans
`PROMPTS.md`. Son bloc `CADRAGE` porte sept lignes — `MODE`, `ENV`, `PLATFORMS`,
`DEVICE`, `APP`, `ARTEFACT`, `BUDGET` — et aucune ne suffit :

| ce qu'il faut trancher | pourquoi le gabarit n'y répond pas |
|---|---|
| le **flavor** | l'identifiant d'application en dépend (`applicationIdSuffix`), donc « APP : déduis-le du repo » n'a plus de réponse unique |
| l'**adresse de l'API** | rien dans un dépôt ne dit vers quoi pointer — et `localhost` ne désigne pas la même machine depuis un émulateur |
| les **injections de build** obligatoires | sans elles l'application peut refuser de démarrer : l'agent obtient un binaire qui ne s'ouvre pas |
| d'**où viennent** les identifiants | le gabarit cite `$QA_USER`/`$QA_PASS` sans dire comment ils arrivent dans l'environnement |
| la **limite** sur le backend | l'étage 2 tape le vrai serveur : sans consigne, l'administrer est dans le périmètre |

⚠️ `ENV` mérite mieux que son commentaire actuel. Il explique `local | staging |
prod` sans dire que le choix se dérive de **vers quoi l'application pointe** —
la question même que pose une API. C'est le pendant exact du point 195 : une
ligne existe, mais elle ne dit pas ce qui la décide.


### 209. ✅ Corrigé le 28/08/2026 — Le scan de secrets classe BLOCKER une lecture depuis un fichier gitignoré

Le scaffold livre `'[sS]tore[pP]assword\s*=\s*\S+'`. Il matche
`storePassword = keystoreProperties.getProperty("storePassword")` — une ligne
qui **lit** la valeur depuis un fichier hors dépôt — et rend un finding
`blocker` prescrivant de « révoquer la clé, elle est dans l'historique git ».

Arrivé aux **deux runs** du terrain, avec deux remèdes différents : le premier a
inscrit le fichier dans `allowSecretsIn`, le second a resserré le motif en
notant que la dispense « aurait dispensé le fichier entier de tout scan ». Le
second a raison — mais la mesure va plus loin que lui.

**Les quatre candidats, sur six cas** (exécutés, dont le pipeline JS réel) :

| motif | faux positifs | faux négatifs |
|---|---|---|
| livré | **3** | 1 |
| `= ` requis (remède du run 30) | **1** | 1 |
| `=` optionnel, non ancré | 2 | 0 |
| **`(?m)^\s*…\s*=?\s*["\']`** | **0** | **0** |

⚠️ **Le faux positif que le remède du run laissait est instructif : un
COMMENTAIRE qui parle du motif.** L'agent en avait justement écrit un dans sa
propre configuration — son remède se serait signalé lui-même. C'est le piège que
ce chantier connaît sous une autre forme : *un fichier doit pouvoir parler d'un
mécanisme sans être classé par ce qu'il en dit.*

📌 **Aucun changement de code n'est nécessaire** : `compilePattern` accepte déjà
les drapeaux inline `(?m)`, et aucun motif livré n'emploie `^` ni `$`, donc le
drapeau n'a aucun effet de bord. Et le motif ancré **gagne** un cas que les deux
autres manquaient — la forme Groovy `storePassword 'valeur'`, sans `=`.

### 210. ✅ Corrigé le 28/08/2026 — Une boucle de micro-tâches fige l'étage 1 SANS UN MOT, et aucun plafond ne la coupe

Relevé sur un projet réel : `flutter test test/argus` s'est figé **dix minutes**,
`flutter_tester` à ~10 % de CPU, aucune sortie. La cause était dans le projet —
un champ de saisie de code à usage unique dont le service rend
`Future.value(null)` **immédiatement** hors Android, si bien que la boucle qui
l'interroge réempile une micro-tâche sans délai.

⚠️ **Et le remède habituel ne marche pas.** En temps simulé, une boucle de
micro-tâches **affame la boucle d'événements** : aucun timer ne s'exécute plus,
donc aucun `timeout:` sur `testWidgets` ne se déclenche. Les quinze
`testWidgets` du scaffold n'en portent d'ailleurs aucun, et en ajouter ne
changerait rien.

⚠️ Un plafond **externe** ne se pose pas non plus : `argus-guards` lance
`flutter test` nu, et `timeout` n'existe ni sur macOS par défaut ni sans
coreutils — vérifié sur la machine du chantier, ni `timeout` ni `gtimeout`. Le
poser quand même donnerait une protection qui ne protège que sur Linux, ce qui
est pire qu'aucune.

Reste ce que le skill peut vraiment faire : **nommer le symptôme et son
diagnostic**, là où on lance l'étage 1. Une suite qui pend sans un mot se
diagnostique en une phrase quand on sait quoi chercher, et se cherche une heure
quand on ne le sait pas.

### 211. ✅ Corrigé le 28/08/2026 — `ACCESS_FINE_LOCATION` est interdite par défaut, alors qu'elle est métier pour toute une famille d'applications

`forbiddenPermissions` livre quatre entrées, dont `ACCESS_FINE_LOCATION`. Sur les
**deux** runs du terrain, l'agent a dû la retirer : la position est une exigence
du produit — le serveur refuse l'opération sans elle.

Les trois autres (`READ_SMS`, `RECEIVE_SMS`, `READ_CONTACTS`) sont d'une autre
nature : leur présence est presque toujours un signal. La localisation, non —
livraison, transport, cartographie, terrain. Laisser le défaut produit un
`critical` permanent sur une exigence légitime, et l'agent doit le désarmer sans
que rien lui dise que c'est prévu.

📌 Ce n'est pas une clé à supprimer : c'est un **défaut à justifier**. Une liste
de permissions interdites n'a de sens que si l'on sait laquelle relève du signal
et laquelle relève du métier.

### 212. ✅ Corrigé le 28/08/2026 — Le gabarit ne dit pas si l'agent a le droit d'écrire dans un paquet VOISIN

Le point 207 a fait dire au SKILL quoi faire quand le composant vit dans un autre
dépôt : ne pas trancher seul, inscrire la dette. Le run suivant l'a lu et
appliqué — il cite la phrase presque mot pour mot.

Mais il termine par : *« ce qui aurait levé l'ambiguïté : une ligne disant si
j'avais le droit d'y écrire »*. Le skill dit quoi faire ; le **cadrage** ne dit
pas ce qui est permis. Mesuré : **zéro** occurrence de « paquet voisin », « autre
dépôt » ou « paquet partagé » dans `PROMPTS.md`.

C'est la forme exacte du point 208, une passe plus tard : une chose que l'agent
doit trancher seul et qui ne se déduit d'aucun dépôt. Deux runs de suite ont
laissé **six et cinq ancres inertes** faute de cette ligne.


### 213. ✅ Corrigé le 31/08/2026 — Le défaut de plateforme est `'android'` EN DUR, et il ignore `platforms:`

`config.mjs`, aux **deux** sites qui servent le Makefile :

```js
const platform = arg('--platform') || 'android';   // l. 1188, --print-build-cmd
const platform = (…'--platform='…) || 'android';   // l. 1199, --print-binary
```

Et le Makefile ne passe **jamais** `--platform`. Sur un projet déclaré
`platforms: [ios]`, mesuré avec la configuration du scaffold **livré** :

| commande | rendu | attendu |
|---|---|---|
| `--print-build-cmd` | `flutter build apk --debug` | `flutter build ios --debug --simulator` |
| `--print-binary` | `…/app-debug.apk` | `…/iphonesimulator/Runner.app` |

⚠️ **Les valeurs iOS existent et sont justes** — `--platform=ios` les rend
correctement. C'est le défaut qui les ignore, pas la configuration qui manque.

Ce que ça coûte : `make argus-build` construit un **APK sur un projet iOS**, la
preuve de taille porte sur un binaire qui n'a rien à voir, et le runner installe
ensuite autre chose que ce qui vient d'être construit. Un build de vingt
secondes pour rien, puis le temps de comprendre pourquoi.

📌 Le run l'a corrigé sur son terrain, en dérivant le défaut de
`config.platforms?.[0]`, et a vérifié dans les deux sens. Le correctif est bon ;
il vit dans un fichier du CADRE, donc il repart à la remise à neuf s'il n'est pas
remonté ici.

📌 **Corrigé en extrayant `platformFor()`** plutôt qu'en réparant deux fois le
littéral : elle rend une valeur, donc un garde l'appelle et lit ce qui revient.
Un garde qui aurait lu la source serait resté vert sur une valeur neutralisée.

⚠️ **La machinerie iOS était DÉJÀ entièrement câblée** — `iosBuildCmd` et
`build.ios` avaient chacun leur branche aux deux sites. Seul le défaut les
court-circuitait avant qu'on les atteigne, ce qui explique que la fonction se
lise comme correcte : il n'y manquait rien, il y avait une valeur de trop.

⚠️ **Il a fallu DEUX mutations**, et c'est la seconde qui enseigne : débrancher
un seul des deux sites d'appel laisse le garde de décision vert. Seul le garde
qui LANCE le script sur une config iOS dérivée du scaffold livré le voit.

⚠️ **Et un second symptôme rapporté était FAUX** — je l'ai cru avant de mesurer
proprement. `--print-binary` semblait rendre une *commande* au lieu d'un chemin ;
c'était ma configuration de test qui portait la commande sous la clé du chemin.
`build.android` est le binaire, `build.androidBuildCmd` la commande : deux clés
voisines, et un montage bâclé les confond.

### 214. ✅ Corrigé le 31/08/2026 — La garde de fraîcheur du binaire est INERTE sur iOS

`Makefile`, cible `argus-build` :

```make
APK="$(node scripts/argus/config.mjs --print-binary)"
BEFORE=$(wc -c < "$APK" …)
BEFOREH=$(shasum -a 256 "$APK" …)
```

Sur iOS, le binaire est `Runner.app` — un **répertoire**. `wc -c` y rend 0 et
`shasum` échoue : la comparaison avant/après compare donc `0` à `0`, et la garde
qui doit dire « taille inchangée ⇒ lance `flutter clean` » ne peut plus rien
dire. Elle ne se tait pas : elle affirme `0 → 0 octets`, ce qui se lit comme une
mesure.

C'est le mode de panne que ce chantier connaît le mieux — un instrument qui rend
un chiffre sans avoir mesuré. Relevé à la main sur le terrain : le bundle pèse
**198 128 Ko**.

📌 **La mesure a déménagé dans `measureBinary()`**, que la recette INTERROGE au
lieu d'en tenir une seconde version — l'écart entre le geste documenté et le
geste outillé étant précisément ce qui a produit ce point. Un bundle se résume
par les empreintes triées de ses entrées, **chemin compris**.

Exercé pour de vrai sur quatre cas. Le décisif : **160 026 → 160 026 octets,
empreinte différente** — même taille, contenu réécrit. C'est ce que produit un
rebuild, et c'est exactement ce que l'ancienne version ne pouvait pas voir.

⚠️ **`kind: 'absent'` existe pour que la recette puisse SE TAIRE** : un build qui
n'écrit rien à l'emplacement déclaré sort maintenant en erreur, au lieu
d'imprimer un zéro qui se lit comme une mesure.

⚠️ **Deux gardes sont nés faux dans l'heure.** Celui du Makefile cherchait
`wc -c` absent de la recette — et matchait le **commentaire** qui explique
pourquoi on l'a retiré. Et la promesse « chemin compris » repartait sans son
garde : la mutation qui retire le chemin du résumé est restée **verte** jusqu'à
ce qu'on ajoute le cas du fichier déplacé.

### 215. ✅ Corrigé le 31/08/2026 — `releaseBuildCmd()` et `buildHintFor()` conseillent un build ANDROID sur un projet iOS

Deux fonctions du cadre ne lisent que les clés Android :

- `config.mjs:776` — `String(config?.build?.androidBuildCmd ?? '')`, avec un repli
  littéral `flutter build apk --release` ;
- `sec.mjs:401` — `String(config?.build?.androidScan ?? '')` puis
  `config?.build?.androidBuildCmd`.

Conséquence sur un projet iOS : quand la taille de publication manque, `perf.mjs`
prescrit `flutter build apk --release` — une commande qui, si on la suit, produit
un APK et laisse la mesure iOS toujours absente. La consigne s'exécute sans
erreur, ce qui est la pire forme : elle a toutes les apparences d'une consigne
juste.

📌 **C'est la forme exacte du défaut que le dartdoc de `releaseBuildCmd`
décrivait déjà** — « le harnais sait construire ce qu'il pilote et rien d'autre »
— revenue par l'autre plateforme. Une mise en garde écrite ne ferme pas le piège
qu'elle décrit.

⚠️ **`--simulator` saute** dans la dérivation : un `.app` de simulateur ne se
publie pas, donc le garder aurait fait de cette fonction une prescription
incapable de tenir sa promesse. `flutter build ios --debug --simulator` rend
donc `flutter build ios --release`, et un flavor déjà déclaré survit.

📌 **`projectBuildCmd()` extraite au passage** : l'aiguillage ios/android était
recopié **trois** fois — `--print-build-cmd`, le message d'installation du
runner, la dérivation de release. Trois copies divergent une par une, et celle
qu'on oublie est celle qui compte.

### 216. ✅ Corrigé le 31/08/2026 — `iosScan` est lue par QUATRE sites et documentée NULLE PART

Mesuré sur le scaffold livré : `grep -c iosScan argus.mobile.yaml` → **0**,
contre **3** lectures dans `perf.mjs` et **1** dans `sec.mjs`. Sa jumelle
`androidScan`, elle, est déclarée.

Un message d'erreur envoie pourtant la renseigner. L'utilisateur cherche donc
une clé dans un fichier qui ne la mentionne pas — et le seul moyen d'apprendre
qu'elle existe est de lire le code des scripts.

C'est la forme symétrique du point 11 : là on avait des clés déclarées que rien
ne lisait, ici une clé lue que rien ne déclare. Les deux se trouvent par le même
garde, dérivé, et une seule des deux directions était couverte.

📌 **Le garde est dérivé, pas une liste de cas** : il collecte les clés que les
scripts lisent réellement — accès pointé, sélecteur dynamique `[cle]`, et alias
local résolu **par sa portée** — et exige que chacune paraisse dans
`argus.mobile.yaml`, déclarée ou commentée. Sa non-vacance l'est aussi : toute
clé de `DEFAULTS.build` doit être retrouvée par le collecteur, sinon il se
dénonce au lieu de rendre un vert qui ne mesure rien.

⚠️ **LE MOTIF A FAILLI FAIRE AGIR À TORT.** Sa première version n'était pas
ancrée sur `config` et rapportait une clé `version` — qui venait de la chaîne
`'ro.build.version.sdk'`, une propriété système Android. Sans la vérification,
j'ajoutais au scaffold la déclaration d'une clé **qui n'existe pas**. Un motif
trop large ne fait pas que compter faux.

### 217. ✅ Corrigé le 31/08/2026 — Le saut de l'analyse binaire iOS explique par une raison qui peut être FAUSSE

`sec.mjs:620` saute dès que `platform !== 'android'` — ce qui est correct,
l'analyse iOS n'est pas couverte. Mais le message affirme :

> « analyse binaire iOS non couverte : un `.app` de **simulateur** n'est pas le
> binaire signé de l'App Store. »

Or `iosScan` peut parfaitement pointer un build **device release**
(`build/ios/iphoneos/Runner.app`), ce que le run a fait. Le lecteur qui a pris la
peine de construire une release se voit alors expliquer qu'il a un build de
simulateur.

Le saut est bon ; sa justification décrit un cas qui n'est pas forcément le sien.
Une raison fausse dans un message honnête coûte plus qu'une raison absente : elle
fait chercher au mauvais endroit.

📌 **Trois formulations désormais** — device, simulateur, indéterminé — et aucune
n'affirme plus que ce que le chemin montre. Le garde exige **l'autre moitié** :
retirer l'affirmation fausse ne doit pas faire perdre l'avertissement quand il
est **vrai**, sans quoi un correctif qui se contente de supprimer le mot
« simulateur » passerait.

⚠️ **DEUX CORRECTIFS ONT ÉTÉ NÉCESSAIRES, ET C'EST LA MUTATION QUI L'A DIT.** Le
premier était juste et sa fonction éprouvée — mais le site d'appel pouvait être
débranché, message figé remis, et **la suite entière restait verte**. Forme
exacte du 213 rencontrée une heure plus tôt : une décision correcte que personne
n'appelle. D'où `binaryScanPlan()`, qui rend une valeur, **et** un troisième
garde qui LANCE `sec.mjs` de bout en bout sur le scénario du run 31.

⚠️ **Ce garde-là a rougi sur son propre montage d'abord** : l'avertissement part
sur `stderr`, qu'`execFileSync` ne rend pas quand la commande sort en 0. Il
lisait une sortie amputée. Son message disait ce qu'il avait vraiment reçu — ce
qui l'a rendu diagnosticable en une lecture, au lieu de m'envoyer chercher dans
le code.


### 218. ✅ Corrigé le 31/08/2026 — « le build a échoué » était dit « ta config est fausse »

**Né de la passe 213–217, et rapporté par le run suivant** — le plus court
aller-retour du chantier entre un correctif et son défaut.

Le correctif du 214 lisait la mesure avant/après du paquet, mais `eval "$CMD"`
n'a jamais vu son **code de sortie**. Un build qui LÈVE tombait donc dans la
branche « aucun paquet ici » :

```
Exception: The native assets specification … references objective_c
  ✖ AUCUN PAQUET à cet emplacement après 30s
      Vérifie que build.android / build.ios désigne ce que la commande produit.
```

La config était juste. L'agent a perdu ~2 min à la vérifier.

⚠️ **L'ancienne version se TAISAIT** (« 0 → 0 octets », aucune branche). La
mienne **parlait, et parlait faux** — ce qui est pire, parce qu'on la croit. Un
correctif ne supprime pas toujours un mode de panne : ici il l'a rendu bavard.

Deux causes rendent le même symptôme — rien à l'emplacement déclaré — et elles
disent désormais des choses différentes : *lire le build*, ou *vérifier la
config*. Le garde **exécute** la recette sur les deux, **plus le chemin
nominal** : un garde qui ne verrait que les deux échecs accepterait une recette
qui crie toujours.

### 219. ✅ Corrigé le 31/08/2026 — Rien ne croise les ancres POSÉES avec les ancres DÉCLARÉES

`make argus-anchors` monte les écrans déclarés et vérifie que leurs ancres
arrivent dans l'arbre : c'est **déclaré → présent**. L'inverse n'existe nulle
part — mesuré : aucun script ne lit les `identifier:` posés dans `lib/`.

⚠️ **Le skill le SAIT et l'écrit** (§ sur les composants partagés) :

> `make argus-anchors` attrape ce défaut à condition que l'ancre soit déclarée
> en `commands:` sur l'`ArgusScreen`. **C'est la moitié de son intérêt.**

La moitié manquante n'a aucun instrument. Le run 32 l'a payée : une ancre posée
dans `lib/`, parfaitement ciblable, **gardée par rien** — elle n'apparaît dans
aucun relevé, donc rien ne signale qu'elle n'est pas couverte.

Une ancre non déclarée n'est pas une ancre en échec, c'est une **absence** —
exactement ce contre quoi le skill met en garde partout ailleurs. C'est la
**forme symétrique du 216** (une clé lue que rien ne déclare), et son remède a la
même forme : un garde dérivé, total et négatif.

📌 **Le run le met en premier de ses sept points.**

📌 **Fermé par `--check-anchors`**, que `make argus-anchors` appelle AVANT la
suite Dart : les deux moitiés dans la même cible. Le contrôle exclut le dartdoc
(deux compteurs du chantier s'y étaient fait prendre) et les gabarits interpolés,
qu'on ne peut pas confronter à un littéral.

⚠️ **L'échappatoire ne pouvait pas vivre où on l'attendrait.** `harness.dart` et
`known_issues.dart` sont **OWNED** : y ajouter un symbole ferait cesser de
compiler les suites déjà installées — le piège que la scission du harnais en
trois fichiers avait déjà documenté. Elle vit donc en config
(`anchors.allowUndeclared`), lue **défensivement** : une installation sans la clé
obtient `[]` et ne casse pas.

⚠️ **Le garde a trouvé un défaut de MA propre implémentation avant qu'elle ne
parte** : extraire toutes les chaînes d'une ligne attrapait aussi `id: 'home'`,
donc une ancre homonyme d'un identifiant d'écran serait passée pour déclarée.
Le relevé ne lit plus que le segment qui suit chaque clé.

### 220. ✅ Corrigé le 31/08/2026 — Aucun moyen documenté d'itérer sur UN flow

`--flow` n'existe pas. Le runner accepte `--tags`, `--include-tags`,
`--exclude-tags`, `--no-install` — et **aucun de ces quatre n'apparaît dans le
SKILL, ni dans `references/`, ni dans `ARGUS-MOBILE.md`**. Mesuré à zéro
occurrence.

Ce que le skill dit après un flow rouge : *« Reprends ensuite la séquence à
`argus-run` »*, ce qui se lit comme un run complet.

Coût relevé sur le terrain : **310–315 s** pour un run complet contre **87 s**
en filtré — facteur **3,6**, à chaque itération sur un flow qu'on met au point.
L'agent a dû lire `run.mjs` pour les trouver.

📌 Le refus de `--flow` est propre — le runner imprime son aide. C'est la
documentation qui manque, pas la surface.

📌 **Fermé en §3g**, avec la commande à copier et le coût mesuré à côté — une
consigne sans sa raison ne se suit pas. Le garde est **dérivé** : chaque drapeau
de la commande doit être accepté par `run.mjs`, donc un drapeau renommé dans le
code fait rougir la doc.

⚠️ **Ce garde est né faux, de la façon la plus documentée du dépôt** : sa
première version collectait les drapeaux de la **prose**, donc elle attrapait
`--flow` dans ma propre phrase disant qu'il n'existe pas. Troisième fois de ce
chantier que le motif matche sa propre mention — et la règle avait été écrite le
matin même. Il porte désormais sur le **bloc de commande**, ce que le lecteur
copie.

### 221. ✅ Corrigé le 31/08/2026 — ⚠️ DÉPLACÉ : ce n'est pas la table des écarts, c'est le TODO de `goto`

Le run rapporte « un cinquième écart légitime absent de la table §2c-bis » : sur
une app à base locale, `clearState` avant chaque flow rend tout état « plein »
inatteignable par `goto`.

**Reproduit — le symptôme est juste, le diagnostic porte à côté.** La table
§2c-bis a bien quatre cas, mais son **troisième** couvre déjà la déclaration :
*« État atteignable seulement après un parcours → `screens[]` oui,
`argusScreens` oui »*. Rien ne manque de ce côté.

Ce qui manque est ailleurs, et c'est plus net : `goto.yaml:95` prescrit

```yaml
# TODO(argus): une branche par écran de argus.mobile.yaml → screens[].
```

— une branche **par écran**, alors qu'un état que seul le parcours crée n'en
admet aucune. Et **`goto` n'apparaît pas une seule fois dans le SKILL** : rien
ne dit ce que devient un tel état, ni que l'absence de branche est légitime.

L'agent a inventé le remède (pas de branche, assertions dans
`journey-critical`, un bloc écrit dans `goto.yaml` expliquant l'absence) et
obtenu 11/11 visités. Il a eu raison — mais il l'a inventé.

### 222. ✅ Corrigé le 31/08/2026 — Un splash de marque décide du gate, et la reconnaissance ne dit pas de le chercher

`thresholds.brandedSplashMs` est déclarée (défaut `0`), lue par **trois**
scripts, documentée dans `argus.mobile.yaml`. Mais le mot « splash » n'apparaît
**qu'une fois** dans le SKILL, dans un tout autre contexte — aucune étape de §2
ne dit d'aller chercher une durée de splash imposée.

Mesuré sur le même projet, à deux runs d'écart :

| | verdict de démarrage |
|---|---|
| run précédent, clé à `0` | `QAM-START` **major** — « l'écran de départ met 3 s à apparaître » |
| run 32, clé à `2000` | max **3415 ms**, budget 2000, **0 finding** |

La valeur est en clair dans `lib/main.dart` (`_kMinSplashDuration`). Sans elle,
un run honnête publie un `major` qui **décrit une décision produit**, pas un
défaut.

### 223. ✅ Corrigé le 31/08/2026 — Le défaut d'`artifact.title` RENOMME une page existante

§3g-bis, point 4 :

> **Garde le titre et l'icône stables** d'un run à l'autre — `artifact.title`,
> ou « Rapport Argus Mobile » s'il est vide.

Suivie à la lettre sur une page qui existe déjà sous un autre nom, cette
consigne **renomme en croyant stabiliser** : la page du projet s'appelait
« Argus Mobile — <projet> », `title` était vide, et le défaut vaut « Rapport Argus
Mobile ».

⚠️ Le défaut est correct pour une **première** publication et faux pour une
**republication** — le seul cas où la consigne parle de stabilité. Rien ne dit
de lire le titre actuel avant la première republication. L'agent ne l'a vu que
parce que l'outil l'obligeait à lire la page.

### 224. ✅ Corrigé le 31/08/2026 — Le gabarit du rapport n'a pas de case pour le nom du paramètre

Le skill prescrit explicitement :

> Si le projet a déjà sa convention, garde-la — et **écris-la dans le rapport
> d'instrumentation, à la ligne du composant partagé**.

Or la forme exacte, donnée « sans quoi deux agents en rendent deux », est :

```
    dont partagées   : <C> composant(s) couvrant <S> call-sites
```

**Aucun emplacement pour le nom.** Suivre la forme exacte perd l'information ;
l'écrire dévie de la forme. Le run 32 a fait les deux : il a inventé un
`(sur 27)` dans la ligne et listé les noms de paramètres ailleurs.

C'est le mécanisme que le skill documente déjà pour « dont partagées » —
**une information prescrite sans case se fait inventer** — appliqué à la ligne
qui l'a fait naître.

### 225-227. ✅ Corrigés le 31/08/2026 — le contrôle d'ancres écrit le matin ACCUSAIT

Trois défauts du croisement posé au run 32, tous trouvés par le run qui l'a
étrenné. Le pire n'est pas qu'il rate : **il accusait**.

**225 — `declaredAnchors` lisait ligne à ligne**, et `dart format` replie toute
liste au-delà de 80 colonnes. Une déclaration de dix commandes devient onze
lignes et le lecteur n'en voit **aucune**. Mesuré sur le terrain : **27 ancres
lues au lieu de 68**, et **cinq déclarations parfaitement correctes rapportées
« que RIEN ne déclare »**. Un garde qui accuse pour un défaut de son propre
analyseur coûte plus qu'aucun garde.

**226 — le motif ne voyait pas les paramètres nommés.** Il cherchait
`identifier:` en minuscules ; `semanticIdentifier:` porte un I majuscule. **20
ancres posées par paramètre, dans 8 fichiers, invisibles** — et le skill écrit
deux paragraphes plus haut que ce sont précisément celles-là qui « sont
invisibles à tout relevé sans nom stable ». *L'instrument portait l'angle mort
qu'il servait à fermer.*

⚠️ `anchorPrefix` reste **dehors**, et c'est un arbitrage : un préfixe n'est pas
une ancre, le compter rendrait un faux positif. Un projet dont la convention
diffère l'inscrit dans `anchors.paramNames` — le skill dit de **garder** la
convention du projet, la refuser rendrait le contrôle muet là où il compte.

**227 — il fabriquait des ancres fantômes**, une apostrophe française dans un
commentaire ouvrant un faux littéral (`"est voulu\n      "`). Il ne se voit
qu'**une fois 225 corrigé** : le premier masque le second.

📌 **Le remède du 227 est celui du 192, écrit le matin même** : un balayage
**gauche-à-droite**, pas un filtre de lignes. Le correctif rapporté ne retirait
que les commentaires de ligne entière ; mesuré, un commentaire de **fin de
ligne** produisait encore deux fantômes. Dans une chaîne, `//` n'ouvre rien ;
hors d'une chaîne, il mange la ligne. Aucune expression régulière ne fait ça.

⚠️ **Et le garde a trouvé un quatrième défaut à l'écriture** : extraire toutes
les chaînes d'une ligne attrapait aussi `id: 'home'`, donc une ancre homonyme
d'un identifiant d'écran serait passée pour déclarée.

### 228. ✅ Corrigé le 31/08/2026 — la taille prescrivait le binaire que la config INTERDIT

La dérivation du chemin de release est de forme Android (`-debug.` →
`-release.`) : un chemin iOS n'en contient pas, donc no-op. Le finding disait
`build.iosScan: build/ios/iphonesimulator/Runner.app` pendant que le commentaire
de cette clé — écrit le matin même — dit « **`iphoneos`, pas `iphonesimulator`**
: un `.app` de simulateur ne porte ni la même architecture ni la même
signature ». Deux textes de nous, contradictoires.

⚠️ **La prescription fausse est partie dans un rapport PUBLIÉ.**

📌 Elle **dérive** désormais du chemin mesuré des deux côtés plutôt que de figer
un nom : un projet dont la cible ne s'appelle pas `Runner` recevrait sinon le nom
par défaut dans une consigne qui le concerne. Le garde lit l'exigence **dans le
commentaire de la config**, pour que les deux ne puissent plus diverger.

### 229. ✅ Corrigé le 31/08/2026 — le README enseignait comme ✅ ce que le SKILL mesure comme piège

`Semantics(identifier: …, child: ElevatedButton(…))` y était donné sous un ✅
comme LA bonne forme. La table mesurée du skill dit l'inverse : un composant qui
déclare déjà un rôle de bouton pose une frontière sémantique, donc l'enveloppe
rend un nœud portant l'identifiant, un label **vide** et **aucune action** —
pendant que la vraie commande reste anonyme en dessous. Le `tapOn` marche quand
même, donc rien ne le signale ; seul VoiceOver en souffre.

**C'est le fichier que le prochain développeur du projet ouvre.**

📌 La forme piège reste montrée — il faut bien la montrer — mais jamais sous un
✅, et toujours nommée. Le garde lit le **voisinage** (huit lignes au-dessus) et
non la forme seule : la chercher attraperait la mise en garde qui la corrige.

### 230. ✅ Corrigé le 31/08/2026 — ⚠️ LARGEMENT DÉMENTI : la CI n'est pas Android-seule

Le run rapporte « la CI livrée est **Android seul** … ce workflow ne peut pas
tourner ». **Reproduit : faux.** Le workflow porte un job `e2e-ios` complet, sur
`macos-latest`, avec lecture de la version FVM, `flutter build ios --simulator`
et Maestro. **Troisième fois de la journée** qu'un symptôme juste vient avec un
diagnostic à côté.

Ce qui est vrai est plus étroit, et se corrige : `security` et `e2e-android`
tournaient **inconditionnellement**, donc sur un projet `platforms: [ios]` ils ne
pouvaient que rougir ; et `e2e-ios` était éteint par un **`if: false` écrit en
dur**, que rien ne reliait à la configuration — l'allumer était un geste manuel
dont rien ne rappelait l'existence.

📌 Un job `cadre` **interroge** la config (`--print-platforms`), même source que
les scripts. Les jobs Android se **sautent** au lieu d'échouer ; l'étage 1 reste
inconditionnel puisqu'il tourne partout.

⚠️ **On ne dépense pas l'argent d'autrui** : un runner macOS coûte ~10× un Linux,
donc le job iOS reste derrière un opt-in explicite (`vars.ARGUS_IOS_CI`). Ce qui
change, c'est que l'oubli est désormais **signalé**.

### 231-236. ✅ Corrigés le 31/08/2026 — cinq informations justes qui arrivaient trop tard

Le run le demandait explicitement : *« signale-moi aussi ce qui était juste mais
mal placé — une information exacte qu'on ne trouve qu'après en avoir eu besoin
compte comme un défaut »*. Cinq sont revenues.

| | |
|---|---|
| **231** | tout `journey-critical` est gardé par `ARGUS_ANCHOR_AFTER_AUTH` : on croit que le parcours va se sauter sur une app sans compte. Il ne se saute pas — le runner retombe sur l'ancre d'accueil. **Le comportement est bon ; ne le lire nulle part est le défaut**, il ne se découvrait qu'en ouvrant `run.mjs` |
| **232** | `hideKeyboard` sur iOS ne masque pas un clavier au-dessus d'une feuille modale : il **la referme, en validant**. La capture suivante montre la donnée créée et l'ancre introuvable — ça se lit comme un défaut d'instrumentation. Coût : deux flows rouges, 220 s de device |
| **233** | §2b dit que les chiffres « se lisent dans `harness.dart` » et réclame l'état **TROUVÉ**, qui est antérieur à l'installation : le fichier n'existe pas encore |
| **234** | `argus-anchors` chaînait ses deux moitiés : le croisement **bloquait** le test Dart — et sur un projet fraîchement instrumenté c'est justement lui qui échoue. Le test qui trouve les ancres absorbées et sous le pli ne tournait **jamais** : il a fallu deux passes pour découvrir sept ancres qu'il aurait nommées d'un coup |
| **235** | le conseil de locale nommait « l'émulateur » sur une plateforme qui n'en a pas |
| **236** | « 3445 ms au pire, budget 2000 » se lit comme un dépassement, alors que le harnais ne produit **aucun** finding — il retranche le splash assumé. Le finding le disait ; **la ligne de console, non** |

📌 Le **234 est de moi**, posé au run 32 : un garde qui empêche un autre garde de
s'exécuter coûte plus qu'il ne rapporte.

### 237. ✅ Corrigé le 31/08/2026 — L'indice de démarrage n'envisageait pas une app CASSÉE

Le message oppose « ancre fausse » à « écran lent » et envoie relever
`startTimeoutMs`. L'écran peut n'être ni l'un ni l'autre. Mesuré : l'app affichait
« Service indisponible » à chaque lancement, un fichier de configuration absent
du bundle — **relever le plafond n'y aurait jamais rien changé**, et le run a
cherché une lenteur qui n'existait pas.

📌 Trois causes désormais, la plus chère en premier — et le geste qui tranche en
une seconde ne coûte rien : **Maestro écrit une capture à l'instant de l'échec**.
L'indice nomme son chemin, au lieu de laisser quelqu'un la reprendre à la main.
Le garde **dérive** ce chemin de la structure d'artefacts documentée dans
`run.mjs`, pour qu'il ne puisse pas se périmer en silence.

### 238. ✅ Corrigé le 31/08/2026 — 🚨 Le double prescrit par le skill CACHAIT un gel de production

Le skill prescrit un `Completer` non complété pour un service interrogé en
boucle, afin que l'étage 1 n'affame pas la boucle d'événements. **Juste pour le
harnais, faux comme modèle de la plateforme** : le vrai service rend un `Future`
**déjà complété** sur iOS, et c'est précisément pourquoi la boucle s'emballe. Le
remplacer fait passer l'étage 1 au vert **sur l'écran même qui gèle l'app**.

Sonde bornée, même boucle, seule la complétion change :

```
Future.value(null)         → 100 001 appels en 200 ms
Completer non complété     →         1 appel  en 200 ms
```

Sur device : *« process main thread busy for 30.0s »*.

📌 **Le besoin du double EST le symptôme.** Trois gestes désormais, dans l'ordre :
mesurer le vrai service, inscrire le défaut, **puis** écrire le double.

⚠️ C'est le **seul cas connu** où une consigne de ce skill produisait un faux
vert, et il n'a été trouvé que parce qu'un run a suivi la consigne à la lettre.

### 239. ✅ Corrigé le 31/08/2026 — Le dartdoc porte la déclaration mot pour mot, et plus HAUT que la vraie

`harness.dart` et `known_issues.dart` portent chacun leur ligne de déclaration
dans leur dartdoc. Un `indexOf` ou un `sed` ancré dessus matche donc le
**commentaire** d'abord. Vécu : **deux fichiers détruits, deux reconstructions**.

Les deux formes ne sont pas identiques dans le scaffold **livré** — la vraie
déclaration se replie après `=`. Elles le deviennent quand le projet remplit le
fichier et que `dart format` recolle la ligne, **c'est-à-dire le chemin normal**.

📌 Un marqueur `// ARGUS:DECLARATION`, unique et jamais en dartdoc, est posé
au-dessus de la vraie. Le SKILL prévenait pour **compter** ; le geste dangereux
est d'**écrire**, et il le dit maintenant.

### 240. ✅ Corrigé le 31/08/2026 — Aucun point d'accroche pour câbler un double

`ArgusScreen` n'avait pas de crochet de cycle de vie. Un écran qui résout ses
dépendances lui-même (`get_it`) ignore tout provider posé au-dessus : le seul
endroit restant était le corps de `build()`, appelé N fois — d'où une fonction
idempotente qu'un projet réel a dû inventer.

⚠️ **Écrit d'abord, le crochet n'était câblé qu'à DEUX sites sur SEIZE.** Il
aurait marché pour l'indice de pli et n'aurait rien fait dans les suites — un
défaut invisible, puisque rien ne casse. Les seize passent désormais par
`argusMonte`, et le garde les **compte**.

### 241-244. ✅ Corrigés le 31/08/2026 — trois choses justes, mal placées, et une contradiction

| | |
|---|---|
| **241** | « retire `login.yaml` des flows qui n'en ont pas besoin » ne couvre pas le cas qui se produit : un flow qui n'inclut PAS login mais dont les écrans sont derrière lui — la régression visuelle. Il en a besoin, il ne l'inclut simplement pas. Trois issues nommées ; celle qui compte est celle qu'on écrit |
| **242** | **`sec.mjs` faisait échouer le gate sur une plateforme hors périmètre.** Les deux audits de sources tournaient quoi qu'on déclare : sur `platforms: [ios]`, le manifeste Android rendait un `major`, et `major` est dans `gate.failOn`. Image inversée des 213-217. Ce qui n'est plus jugé **se dit** — un audit absent ressemble sinon à un audit qui n'a rien trouvé |
| **243** | le gabarit de device iOS prescrivait `autoStart: true`, que le même fichier déconseille sur un appareil nommé ; et l'installeur cherchait `adb` **sans** `xcrun` — un projet iOS voyait « ✔ adb » et rien sur l'outil dont il dépend |
| **244** | `clearState` **réinstalle** l'app sur iOS et tourne avant chaque flow, donc chaque flow se reconnecte : c'est ce qui décide si une suite tient sous une limite de débit, et ça vivait dans un commentaire de `launch-clean.yaml`. C'est près du bloc `auth:` que ça se lit |

⚠️ **Le premier critère du garde 243 était trop large** — « tout outil que
`TOOLS` vérifie doit être listé » aurait forcé `aapt2`, `apkanalyzer` et `unzip`,
qui appartiennent au scan binaire et pas au démarrage. Il m'aurait fait **ajouter
trois outils sans objet**, même forme que le motif non ancré du 226. Le constat
réel est une **asymétrie** entre les deux pilotes de plateforme.

## Ce qui reste

Les points **237 à 244** sont fermés le 31/08/2026 — backlog vide pour la
**trente-troisième** fois, quatrième passe de la journée. Le run 34 est la
**PREMIÈRE combinaison API × iOS** du chantier : les runs 29-30 étaient une API
sur Android, les 31-33 iOS sans backend. La case n'avait jamais été exercée, et
elle rend huit points dont aucun ne pouvait apparaître ailleurs.

⚠️ **LE 238 EST LE SEUL CAS CONNU OÙ UNE CONSIGNE DE CE SKILL PRODUISAIT UN FAUX
VERT.** Le double qu'il prescrit pour empêcher l'étage 1 de geler masque le gel
de production qu'il modélise à l'envers. Il n'a été trouvé que parce qu'un run a
suivi la consigne **à la lettre** — c'est-à-dire par le seul chemin qui pouvait
le révéler.

📌 **Deux constats de ce run appartiennent au PROJET, pas au skill**, et le second
compte : la page OTP gèle l'app sur iOS, et son remède vit dans un paquet
**partagé avec une autre application**. Mesuré par sonde bornée — 100 001 appels
en 200 ms contre 1. C'est le mécanisme du point 210, cette fois en production.

📌 **Le cadrage a de nouveau rapporté une classe entière.** La question ajoutée
au run 33 — *« signale-moi ce qui était juste mais MAL PLACÉ »* — a rendu trois
points de plus (241, 243, 244). Deux runs de suite qu'une seule ligne de prompt
produit une catégorie de défauts que rien d'autre ne trouve.

⚠️ **Et deux gardes ont failli faire agir à tort**, tous deux par un critère
**trop large** : celui du 243 aurait fait ajouter trois outils sans objet, et le
crochet du 240 n'était câblé qu'à deux sites sur seize — il aurait marché là où
personne ne regarde et rien fait là où tout se joue.

Les points **225 à 236** sont fermés le 31/08/2026 — le backlog se vide pour la
**trente-deuxième** fois, et c'est la **troisième passe de la journée**. Le run
33 est une vérification iOS, et **six correctifs sur sept ont tenu** : gate
`pass`, 9/9 flows, 0 finding, 509/509 tests, 25 min 26 s sur 50, boucle visuelle
prouvée en quatre temps avec restauration par empreinte.

Les six se lisent dans ce que l'agent a ÉCRIT, sans savoir qu'ils étaient neufs :
titre relevé **avant** republication (223), `--tags … --no-install` employé avec
son facteur mesuré (220), `brandedSplashMs` trouvé parce que §2 dit de le
chercher (222), la case du paramètre remplie (224), le build en échec qui
n'envoie plus vérifier la config (218).

⚠️ **LE SEPTIÈME, LE 219, ÉTAIT CASSÉ DE TROIS FAÇONS** — et c'est le seul
instrument que la passe précédente avait écrit. Il **accusait** cinq déclarations
correctes, ratait 20 ancres posées par paramètre, et fabriquait des fantômes. Un
outil neuf a détruit plus de confiance qu'il n'en a produit, le jour même.

📌 **Trois constats sur douze ont été DÉPLACÉS par la reproduction**, et le motif
se répète : le symptôme est presque toujours juste, le diagnostic beaucoup moins.
Le 230 est le cas le plus net — « la CI est Android seule » est **faux**, elle
porte un job iOS complet ; ce qui manquait, c'est que les jobs suivent
`platforms:` au lieu de le supposer.

📌 **Et cinq points sont d'une classe que le cadrage a fait apparaître.** J'avais
ajouté au prompt : *« signale-moi aussi ce qui était juste mais MAL PLACÉ »*.
Cinq sont revenues (231-236), dont une qui coûtait 220 s de device. Une question
posée en plus rapporte une classe de défauts entière — c'est la leçon de « où le
skill t'a-t-il laissé décider seul ? », appliquée à un autre axe.

⚠️ **Le run s'est déroulé sur un environnement dégradé**, et la chronologie est
dans `run33-machine.txt` : cinq crashs dans la journée, dont un **SpringBoard**
en plein `XCTAutomationSession` — la couche que Maestro pilote. Le simulateur
n'avait pas redémarré depuis le run 32, soit 2 h 48. Un des remèdes de flow du
run (un second appui « au cas où ») est probablement un contournement de ce
crash, pas d'un défaut de l'app. Les deux passes finales, elles, sont
postérieures au crash et vertes.

Les points **218 à 224** sont fermés le 31/08/2026 — le backlog se vide pour la
**trente-et-unième** fois, dans la même journée que la passe précédente. Le run
32 est une **vérification iOS**, et son premier résultat est que **les cinq
correctifs du matin ont tenu** : gate `pass`, 10 flows, 11/11 écrans visités,
0 finding fonctionnel, 27 min 39 s sur 50. Deux preuves valent mieux que le
verdict — le binaire est **pesé à 202 570 334 octets** alors que c'est un
répertoire (donc le 214 tient), et le tableau de couverture iOS écrit le matin
est jugé « **tenu, mot pour mot** » par un lecteur qui ignorait qu'il était neuf.

⚠️ **ET LA PASSE DU MATIN AVAIT CRÉÉ UN DÉFAUT** — le 218, rapporté l'après-midi
par le run suivant. Le plus court aller-retour du chantier entre un correctif et
sa conséquence. Ce qu'il enseigne n'est pas l'oubli d'un `$?` : c'est que
**l'ancienne version se taisait et que la mienne accuse**. Un remède ne supprime
pas toujours un mode de panne ; celui-ci l'a rendu bavard, donc crédible.

**Ce que la reproduction a corrigé au rapport :**

| | ce que le run disait / ce que la mesure a établi |
|---|---|
| **221** | « un cinquième écart absent de la table §2c-bis » → le **cas 3 couvre déjà** la déclaration ; ce qui n'a aucune instruction est le TODO de `goto.yaml`, qui prescrit une branche par écran pour un état qui n'en admet aucune |
| **219** | « rien ne croise posé et déclaré » → **exact, et le skill l'écrivait déjà** : « c'est la moitié de son intérêt ». La moitié manquante n'avait aucun instrument |
| **224** | « pas de case dans le gabarit » → **exact, et c'est une contradiction interne** : le skill prescrit d'écrire le nom, et donne une forme « exacte » qui ne peut pas le porter |

⚠️ **Deux gardes écrits ce jour-là sont nés faux**, tous deux attrapés à
l'écriture : celui du 220 collectait les drapeaux de la **prose**, donc il
matchait `--flow` dans ma propre phrase disant qu'il n'existe pas — troisième
fois de ce chantier, et la règle avait été écrite le matin. Et le relevé du 219
comptait `id: 'home'` comme une ancre déclarée, ce qui l'aurait rendu trop
permissif ; c'est son propre garde qui l'a dit, avant livraison.

📌 **Une contrainte de structure a décidé d'un remède** : l'échappatoire du 219
ne pouvait pas vivre dans `harness.dart` ni `known_issues.dart`, tous deux
**OWNED** — y ajouter un symbole ferait cesser de compiler les suites déjà
installées. Elle vit en config, lue défensivement. La structure du scaffold est
une contrainte de conception, pas un détail d'installation.

## 🎯 LE PLAN DU 19/08 EST CLOS — décidé par Germinator le 31/08/2026

**Il n'y aura pas de troisième terrain : les deux couvrent la totalité.** Le plan
du 19/08 en prévoyait trois ; `le-terrain-local` (local, puis iOS) et `un-projet-avec-api` (avec
API) ont exercé entre eux tout ce que le skill sait faire — les deux étages, les
cinq dimensions, les deux plateformes, la publication de la page, et le seul
volet qui n'avait jamais tourné (le backend).

Ce qui reste ouvert n'est donc plus du terrain mais du **périmètre**, et il est
désormais **écrit et gardé** : le SKILL porte un tableau de ce que chaque
plateforme reçoit vraiment, dérivé du code — le jour où quelqu'un implémente
l'accessibilité iOS, le garde rougit et force sa mise à jour.

Les points **213 à 217** sont fermés le 31/08/2026 — le backlog se vide pour la
**trentième** fois. C'est la passe du **premier run iOS**, et les cinq points
tiennent toujours en une phrase : *tout ce qui avait un défaut supposait
Android.* Aucun n'a été démenti par la reproduction ; tous les cinq étaient
encore vrais dans le code du jour, trois jours après avoir été inscrits.

**Ce que la passe a ajouté aux constats, et que le run n'avait pas vu :**

| | ce que la mesure a trouvé en plus |
|---|---|
| 213 | la machinerie iOS était **déjà câblée** aux deux sites : il n'y manquait rien, il y avait une valeur de trop |
| 214 | le cas décisif n'est pas le poids mais **l'empreinte à poids égal** — 160 026 → 160 026 octets, contenu réécrit |
| 215 | l'aiguillage ios/android était recopié **trois** fois ; et `--simulator` devait sauter, sinon la consigne ne pouvait pas tenir |
| 216 | le motif du garde, non ancré, allait faire **déclarer une clé qui n'existe pas** (`version`, tirée de `ro.build.version.sdk`) |
| 217 | le premier correctif était juste **et débranchable sans qu'un garde bouge** — il en a fallu un second |

⚠️ **TROIS GARDES SONT NÉS FAUX DANS LA MÊME PASSE**, chacun d'une façon déjà
répertoriée, ce qui ne les a pas empêchés de se reproduire :
- celui du Makefile cherchait `wc -c` absent de la recette — et matchait **le
  commentaire qui explique pourquoi on l'a retiré** ;
- la promesse « empreinte, chemin compris » repartait **sans son garde** : la
  mutation qui retire le chemin est restée verte jusqu'à ce qu'on ajoute le cas
  du fichier déplacé ;
- celui qui lance `sec.mjs` lisait une sortie **amputée de `stderr`**, donc il a
  rougi sur son propre montage. Son message disait ce qu'il avait vraiment reçu,
  et c'est ce qui l'a rendu diagnosticable en une lecture.

⚠️ **ET J'AI DÉTRUIT DEUX ÉDITIONS NON COMMITÉES AVEC `git checkout`** — la
déclaration `iosScan` et le garde du 216, d'un coup, au moment précis où je
prouvais qu'ils marchaient. Quatrième fois dans ce projet. La cause n'est pas
l'oubli de la règle : mon aide-mémoire de mutation ad hoc n'avait pas le
garde-fou que le **vrai** harnais porte, lequel refuse de démarrer sur une cible
sale. Un outil qui mute doit porter ce refus, pas compter sur la mémoire de qui
l'appelle.

⚠️ **Et le même aide-mémoire annonçait « TOMBE » quoi qu'il arrive** : il
cherchait `# fail 0` là où le rapporteur écrit `ℹ fail 0`, donc son motif ne
matchait jamais. Sept verdicts ont dû être rejoués. Ce qui l'a démasqué n'est
pas une relecture mais une **absence** — une mutation « tombée » sans qu'aucune
ligne `✖` ne l'accompagne. Un instrument se prouve avant d'être lu : la version
corrigée décide sur le **code de sortie**, et sait rendre VACANT sur une
mutation inoffensive.

📌 **Le harnais complet, lui, ne s'est pas laissé prendre** : deux mutations
préexistantes visaient le corps de `releaseBuildCmd`, réécrit par le 215, et il
a rendu **HARNAIS — « motif trouvé 0× »** au lieu de VACANT. C'est exactement la
distinction qui évite de partir chercher un garde manquant qui existe.
**114/116 avant remise à jour, 116/116 après.**

Les points **209 à 212** sont fermés le 28/08/2026 — le backlog se vide pour la
**vingt-neuvième** fois. Le run 30 est la **première vérification du terrain
n° 2**, et les **sept** correctifs de la veille ont porté, mesurés sur le terrain
et non déduits du compte rendu :

| | mesuré au run 30 |
|---|---|
| 202 | `login.yaml` porte `ARGUS:OWNED` et **8 références** du parcours que l'agent y a écrit |
| 203 | les deux flows assertent l'ancre post-connexion · **0** occurrence de l'ancienne |
| 205 | *« `visual: false`, et le motif n'est pas la disposition — c'est le COÛT »* |
| 206 | *« l'écran affiche les données d'UNE livraison servie »* |
| 207 | *« modifier l'API publique d'un paquet partagé n'est pas une décision de QA »* — la phrase du skill, reprise, et la dette inscrite avec le dépôt où vit le remède |
| 208 | flavor déduit, adresse `10.0.2.2` employée, aucune question posée |

📌 **Les deux mises en garde ont fait exactement ce qu'on leur demandait** :
faire prendre la décision, pas la prendre. L'agent écrit ses raisons dans la
configuration, à l'endroit où elles se relisent.

⚠️ **Le 209 est le cas où la mesure a battu le remède rapporté.** Le run avait
resserré le motif — et avait raison de préférer ça à une dispense. Mais une
matrice de six cas, exercée dans le vrai pipeline, départage quatre candidats :
livré **3/1**, remède du run **1/1**, et la forme ancrée **0/0**, qui gagne en
prime la forme Groovy sans `=`. Le faux positif qu'elle supprime est **un
commentaire qui parle du motif** — l'agent en avait écrit un dans sa propre
configuration, si bien que son remède se serait signalé lui-même.

⚠️ **Le 210 repart sans garde exécutable, et le skill l'écrit.** Une boucle de
micro-tâches affame la boucle d'événements sous temps simulé : aucun `timeout:`
ne peut s'y déclencher, et aucun plafond externe n'est portable — ni `timeout` ni
`gtimeout` sur la machine du chantier. Ce que le skill peut faire, c'est nommer
le symptôme et son mécanisme.

⚠️ **Et deux de mes gardes sont nés faux, tous deux dénoncés par leur propre
échec** : `/store/` ne matche pas `[sS]tore` — la chaîne littérale n'est pas dans
le motif —, si bien qu'un garde éprouvait les lignes `keyPassword` contre le
motif `storePassword` ; et une assertion sur de la prose enjambait encore un
retour à la ligne. **Le harnais a aussi révélé une cible VACANTE** : `yamlconf`
existait depuis le run 29 sans qu'aucune mutation ne la vise, et sa validation
passait par `maestro check-syntax`, qui ne sait lire que des flows.

Le **192** reste ouvert, seul, avec sa mesure.

Les points **202 à 208** sont fermés le 28/08/2026, le jour même de leur
inscription — le backlog se vide pour la **vingt-huitième** fois. Le run 29 est
le **premier sur un projet qui consomme une API**, le chantier ouvert depuis le
22/08, et il rouvre le compteur que le run 28 avait refermé : c'est ce qu'on
attendait de lui.

⚠️ **Sept constats, et aucun ne pouvait apparaître sur une application locale.**
Ils tiennent en une phrase : *le harnais suppose partout qu'après le lancement on
est déjà chez soi*. `login.yaml` appartenait au cadre alors que la config y
envoie écrire, deux flows assertaient l'écran de connexion après s'être
connectés, les cinq `auth.anchors` décrivent un formulaire, et rien ne disait ce
qu'une reconnexion par flow coûte à un backend qui compte les appels.

📌 **Le 203 a corrigé le remède du run.** Il proposait une clé `postAuthAnchor` ;
la mesure a montré que `auth.anchors.success` existe déjà, est déjà injectée
sous `ARGUS_AUTH_SUCCESS`, et qu'elle est simplement lue par **un** fichier
quand huit lisent `ARGUS_ANCHOR_HOME`. Ajouter une clé aurait doublé celle qui
manquait de lecteurs.

⚠️ **Trois de mes propres gestes ont été pris en défaut pendant la passe**, tous
par un instrument et jamais par une relecture :
- le garde écrit pour vérifier que les remèdes cités existent a fait tomber **ma
  propre mise en garde**, rédigée deux minutes plus tôt : elle proposait
  `dynamicRegions`, clé retirée au point 11 parce que rien ne la lisait ;
- un motif de garde sur de la prose **enjambait un retour à la ligne**, donc il
  ne pouvait pas matcher — la prose est reformatée à chaque édition ;
- mon script d'édition a **tronqué le harnais de mutation** de 93 lignes,
  `main()` compris, en remplaçant la fin du fichier au lieu d'y insérer. Il était
  commité : c'est la seule raison pour laquelle ça n'a rien coûté.

**Le run 28 ne rend QU'UN constat, et il ne coûte rien** — un jeton littéral dans
un message d'échec, sur un rapport qui dit déjà tout ce qu'il faut une ligne plus
haut. **La condition de sortie révisée le 26/08 est donc remplie pour la première
fois du chantier** : *aucun constat ne coûterait quelque chose à quelqu'un qui
applique le skill sans le connaître*.

Les quatre correctifs de la veille ont porté, mesurés dans les artefacts et non
déduits du compte rendu :

| | attendu | mesuré au run 28 |
|---|---|---|
| 199 · `measuredVariant` à côté de `binaryIsRelease` | présent | `'debug'` / `true` — le fichier dit enfin que le paquet chronométré n'est pas le binaire pesé |
| 198 · `QAM-START` nomme son binaire | présent | titre, `actual` et `suggestedFix` ; `report.json` passe de **0 à 3** occurrences de « debug » |
| 200 · vignettes en rangée, bornées | 5 / 5 / oui | **5 / 5 / oui** |
| 200 · visionneuse à trois sorties | 3 | **3** — croix, clic extérieur, Échap |

⚠️ **Deux anomalies du run 28 ne viennent pas du skill mais de MA procédure**, et
il faut les écrire ici pour qu'elles ne repartent pas en constat :

- L'agent a trouvé un `app-release.apk` daté de 14:11 contenant des chaînes qu'il
  croyait avoir écrites à 15:30. **`build/` n'est pas dans la liste d'effacement
  du terrain** : l'APK du run 27 avait survécu, et le run 27 posait les mêmes
  ancres sur le même terrain — d'où des chaînes parfaitement plausibles. Le skill,
  lui, l'aurait dit : `binaryFreshness` compare la mtime du binaire à la plus
  récente des sources `lib/**/*.dart`, donc `stale: true`. L'agent a reconstruit
  avant que le scan ne tourne, ce qui a rendu la question sans objet.
- Le refus d'installation (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) vient de **la
  release que j'avais installée** pour mesurer le point 199. Le garde-fou du skill
  a fonctionné : le runner s'est arrêté au lieu de piloter le binaire précédent.

Le **192** reste ouvert, seul, avec sa mesure.

Les points **198 à 200** sont fermés le 28/08/2026, le jour même de leur
inscription — le backlog se vide pour la **vingt-septième** fois. Le run 27 était
une **vérification** : 194, 195 et 197 ont porté sur le terrain, et **193 était
en place sans être exercé**, le démarrage ayant atterri à 1313 ms sous un budget
de 2000. C'est en cherchant pourquoi qu'on a trouvé le 199.

⚠️ **Les trois points ne font qu'un défaut dit à trois endroits**, et aucun
n'avait été rapporté par le run : le 199 est sorti d'une mesure prise pour
vérifier le 193, le 198 de la lecture du voisin qu'elle a entraînée, et le 200
de Germinator regardant la page publiée.

⚠️ **Le 199 corrige le remède du 193**, ce qui est le cas le plus instructif du
lot : la réserve était bien passée aux quatre appels — le correctif tenait — mais
elle transportait une valeur dérivée de la **commande de build** au lieu du
**paquet mesuré**. Un garde qui vérifie qu'une réserve est *présente* ne dit rien
de ce qu'elle *contient*.

⚠️ **Et le 200 a été créé par le correctif du 187.** Tant qu'une capture ne
pouvait exister que sur un échec, la page publiée n'en portait aucune, donc rien
ne pouvait être trop haut. Le remède déplace le mode de panne.

Le **192** reste ouvert, seul, avec sa mesure.

Les points **193 à 197** sont fermés le 26/08/2026, le jour même de leur
inscription — le backlog se vide pour la **vingt-sixième** fois. Le run 26 est
**le premier à REPUBLIER sur une page existante** : l'autre moitié de la boucle,
jamais empruntée en vingt-cinq runs, et elle tient.

⚠️ **Deux d'entre eux sont nés de la passe** — le 196 en tapant `--help` sur mon
propre harnais, le 197 par un diagnostic de l'analyseur de types pendant que je
corrigeais le 193. Aucun des deux n'a été rapporté par le run.

⚠️ **Trois de mes quatre hypothèses de départ sont tombées à la reproduction** :
le budget dépassé est un comportement que le skill documente (« vingt minutes »,
plus quatre temps obligatoires), le flow qui a mal navigué avait été écrit par
l'agent et non livré par le scaffold, et le FVM manqué venait de **mon** cadrage
— un `ls` aliasé sur un outil qui masque les fichiers gitignorés. Le Makefile,
lui, a détecté FVM seul.

**Le point 192**, hérité de la passe précédente, reste **ouvert** avec sa mesure :
le corriger demande un lexer, et le remède évident casse six lectures légitimes.

Les points **187 à 191** ont été fermés le 26/08/2026, le jour même de leur
inscription. Le run 25 est **le premier à publier sa page de rapport**.

**Prochain numéro libre : 218.**

⚠️ **Trois des cinq viennent de la publication**, et deux d'entre eux n'étaient
pas atteignables autrement : le 187 a été trouvé par Germinator **en regardant la
page**, et le 188 ne coûtait rien tant que le bandeau restait dans un rapport
local. *Publier un livrable, c'est le faire lire — et c'est la seule façon de
savoir ce qu'il dit.*

Les points **184 et 185** ont été fermés le 26/08/2026, le jour même de leur
inscription. Le **186 est démenti**, et le **185 avait rouvert le 182**.

⚠️ **Deux de mes quatre constats du jour étaient faux ou mal formulés**, et dans
les deux cas c'est un instrument du skill qui l'a dit : le parseur de config a
rendu « clé dupliquée » sur le 186, et le harnais de mutation a rendu « VACANT »
sur mon garde du 185 — **le deuxième jour de suite sur le même motif**.

**Prochain numéro libre : 187.**

## ⚠️ LE CRITÈRE DE SORTIE A CHANGÉ — décidé par Germinator le 26/08/2026

L'ancien, du 23/08, était *« un run sans vrai correctif à faire »*. Il ne tombera
peut-être jamais : un skill est un texte qui fait décider quelqu'un d'autre, donc
chaque correctif déplace la frontière de ce qu'il reste à décider — 24 runs le
montrent, et le compte oscille entre 2 et 4 depuis huit runs sans redescendre.

**Le nouveau : *aucun constat ne coûterait quelque chose à quelqu'un qui applique
le skill sans le connaître*.**

Ce qui compte n'est plus le nombre mais ce que le constat **coûte** :
- un script qui pend sans un mot (176), un flow qui meurt sur un seuil mal dérivé
  (185), un verdict rendu sur le mauvais binaire (174) → **ça coûte**, la sortie
  reste fermée ;
- un écart entre deux textes du skill (181), un relevé qui pourrait compter ce
  qu'il avoue ignorer (180) → ça coûte du **temps de lecture**, jamais une
  mauvaise décision, et la sortie reste ouverte.

📌 Au run 24, les deux points restants sont du second type. La sortie était donc
**ouverte** — le run 25 est joué pour une autre raison : exercer la **publication
de l'artefact**, la seule boucle du skill que vingt-quatre runs n'ont jamais
empruntée.

⚠️ **Les correctifs du jour ont porté, et l'agent s'en est SERVI POUR RAISONNER
sans savoir qu'ils étaient neufs.** `coverage.stageOneOnly` rend six écrans, et
son compte rendu écrit : *« `notConfigured: []` ne veut pas dire tout est couvert ;
le chiffre à lire en regard est `stageOneOnly` »* — c'est-à-dire exactement la
phrase que le correctif existait pour rendre possible. Le budget de même :
`run.budget: {maxMinutes: 45, minutes: 9.4, flows: 8}`, et une section entière du
rapport dit ce qui a été échantillonné **et où c'est écrit**.

⚠️ **Le run est par ailleurs le plus propre du chantier** : 8 flows verts,
528 tests, sécurité **0 finding** après dérivation des permissions du manifeste
fusionné, **0 blocker et 0 critical**, et l'appareil physique branché n'apparaît
dans aucun des six JSON (`grep -c` → 0 partout).

Les points **180, 181 et 183** ont été fermés le 26/08/2026, le jour même de leur
inscription — le backlog s'était vidé pour la vingt-troisième fois.

⚠️ **Le 180 était en dessous de la vérité** : le rapport avouait déjà sa limite,
donc le travail n'était pas de la dire mais de la lever. Et son premier garde est
né **vacant** — il lisait du texte là où la mutation vidait une valeur.

**Prochain numéro libre : 184.**

⚠️ **Les quatre correctifs de la veille ont porté, et se lisent dans les
artefacts** — pas dans le compte rendu : `perf.json` porte `timedOutLaunches: 0`
là où le run 22 bloquait 3 fois sur 5 (176) ; la taille est mesurée sur
`app-release.apk`, 28,8 Mo contre un budget de 60, donc **aucun** finding (177) ;
la branche `notVisible` de `goto.yaml` a été **remplie exactement comme prévu**,
l'agent y ayant mis son retour et gardé l'assertion qui fait échouer au bon
endroit (178) ; et la commande de release a été documentée plutôt que devinée,
« un `--release` nu aurait rendu un finding *non obfusqué* décrivant ma
commande » (179).

⚠️ **Il est allé plus loin que le correctif** : plutôt que de dupliquer le retour
dans sept branches, il l'a factorisé dans un sous-flow `to-shell.yaml` — et son
commentaire y documente un piège que le chantier ne connaissait pas : le bloc du
runner étant un **singleton d'application**, dépiler la page n'arrête pas le
chronomètre, qui continue avec son audio par-dessus l'écran suivant.

Les points **176 à 179** ont été fermés le 26/08/2026 — le backlog s'était vidé
pour la vingt-deuxième fois, avec un jour de retard.

⚠️ **Le compteur de sortie remonte à TROIS** (7 → 5 → 3 → 4 → 4 → 2 → 2 → **3**),
mais leur **nature** change et c'est ce qui compte : après quatre runs de
« relevés qui mesurent autre chose », **le 176 est un défaut fonctionnel franc** —
un script qui peut attendre sans fin et sans un mot. Le chantier n'en avait plus
trouvé depuis le 161.

⚠️ **Trois correctifs se voient à l'œuvre dans ce run**, dont deux ce jour-là : le
**174** a pesé le debug **et l'a dit** (chronologie à l'appui — `perf` tourne
1 min 39 avant que la release n'existe), le compteur d'ancres distingue littéraux
et gabarits, et le runner a **refusé de verdir** sur six flows tombés en 0–59 ms
sans étape fautive.

⚠️ **Le 177 est né du 174**, et c'est le motif à retenir : *un correctif peut
rendre un relevé honnête sans le rendre juste*. Dire « ce n'est pas la release »
est exact, utile, et laisse la mesure utile jamais prise.

⚠️ **Ce que le run a bien fait et qu'il faut noter** : devant un blocage qu'il ne
s'expliquait pas, l'agent a **refusé d'attribuer un mécanisme** — « la seule
différence est […] je ne l'ai pas prouvé, je ne l'affirme donc pas ». Et il a
démasqué **son propre instrument** : cinq mesures rendant toutes exactement 40 s,
un sous-shell tenant le tube ouvert. La contre-épreuve (`adb shell echo` à 23 ms)
est ce qui l'a dit.

Le reste ne concerne pas le skill : 54 entrées de dette décrivent l'application
d'essai, et `osv-scanner` reste une affaire de machine.

**Prochain numéro libre : 180.** La condition de sortie n'est pas remplie — le
run 22 a exigé trois correctifs de `plugins/argus-mobile/`, donc c'est une
**vérification** qui vient, sur le même terrain.
