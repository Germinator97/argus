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

### 81. Une ancre d'affichage n'a de case nulle part

`session_form_reps_value` est un nœud de VALEUR, ciblé par `journey-critical.yaml`
pour vérifier ce qui est affiché. La déclarer en `commands:` la fait échouer sur
« ancre posée sur un nœud INERTE » — un message qui décrit un défaut, alors
qu'ici l'inertie **est le comportement voulu**. La retirer, et plus rien ne
prouve qu'elle existe, alors qu'un flow la cible.

C'est exactement la forme du point 69 (`commandsAfterScroll`), sur un autre axe :
deux mauvaises issues, pas de troisième état.

### 82. `report.json` survit à un run qui n'a jamais atteint Maestro

Quand le runner s'arrête avant la suite — installation refusée, par exemple — le
rapport du run PRÉCÉDENT reste sur le disque et se lit comme frais. L'agent s'y
est fait prendre et a failli conclure que la comparaison visuelle ne mesurait
rien ; c'est le journal qui l'a détrompé, pas le rapport.

⚠️ Un `0` rendu par une commande qui a échoué n'est pas un `0` de mesure — et ici
c'est le harnais lui-même qui fabrique le piège.

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

### 84. `startupHint` colle une hypothèse fausse sur un finding visuel

L'indice « c'est l'écran de DÉPART qui n'est pas arrivé à temps » est le bon
conseil pour un `extendedWaitUntil` qui expire. Il s'ajoute aujourd'hui à **toute**
étape en échec dont le sélecteur vaut l'ancre de départ — `assertScreenshot`
compris. Observé sur une vraie divergence d'image (5,04 % de correspondance) :
le message conseille de vérifier le temps de démarrage alors que la comparaison a
parfaitement eu lieu.

Le code porte déjà `WAIT_COMMANDS`, juste au-dessus, et ne s'en sert pas ici.

### 85. `perf` dit « jank non conclu » puis « jank 0 % », à vingt-cinq lignes

`warn('jank non conclu — 0 frame(s)')` en ligne 360, puis
`log('jank ${jank.jankFramesPct ?? '?'} %')` en ligne 385 — la valeur **brute**,
pas la valeur comparable. Et `perf.json` reçoit `jankFramesPct` sans marqueur de
non-conclusion : seul `framesRendered: 0` à côté permet de ne pas le lire comme
une mesure.

### 86. `declared.model` / `declared.os` sont `null` — et ce n'est plus vrai

Le rapport les met à `null` hors `autoStart`, avec sept lignes de commentaire
expliquant qu'ils « ne servent QU'À `autoStart` ». **Ce n'est plus le cas depuis
le point 67** : `ciEmulator()` les lit pour choisir l'émulateur de la CI. Le
commentaire est périmé par mon propre correctif, et le rapport tait deux clés qui
gouvernent désormais quelque chose.

⚠️ Le constat de l'agent était juste, son diagnostic incomplet : il y voyait un
champ vide, c'est une décision devenue fausse.

### 87. §3g fait générer les références APRÈS le premier run

Ce qui garantit une première passe visuelle non exécutée. C'est défendable — on
prouve d'abord que les flows tournent — mais rien ne le dit, et l'ordre se lit
comme une erreur.

### 88. Deux temps de démarrage présentés côte à côte sans dire qu'ils diffèrent

`am start -W` mesure 1,2 s (première frame) quand l'écran d'accueil réel met ~6 s
(splash imposé + init). Les deux chiffres sont justes et ne mesurent pas la même
chose ; le rapport les affiche l'un près de l'autre sans le dire. Un lecteur
pressé y voit une contradiction. `brandedSplashMs` existe et fonctionne, mais il
n'explique pas cet écart-là.

## Ce qui reste

**Les points 79 à 88**, rendus par le run 7 et tous reproduits avant d'être
inscrits — dont le **79**, qui est un correctif de la veille resté à moitié, et
le **80**, une ligne fautive que l'édition de sa voisine n'a pas vue.

Et le chantier **§ E** de `docs/chantiers-differes.md` : l'APK installé embarque
quatre ABI quand l'appareil n'en lit qu'une — 84,9 Mo contre 39,7.

Et ce que cinq runs ont établi, qui ne se périme pas : une passe trouve ce qui
manque, la suivante trouve ce que la correction a introduit **ou n'a pas
terminé**. Les runs 4 et 5 ont chacun désigné des correctifs de la veille — non
pas faux, mais **incomplets** : ils traitaient la moitié du problème qu'on avait
sous les yeux.
