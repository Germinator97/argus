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

## Rendu par le run 3 — un troisième agent vierge, 22/08/2026

Troisième passe en aveugle, sur le même terrain remis à neuf. Onze constats ont
été reproduits dans le dépôt avant d'être inscrits ici : **onze confirmés, aucun
démenti**.

⚠️ **Ce que ce run a mesuré en creux.** Les deux runs précédents avaient posé
56 ancres en `Semantics(identifier:)` littéraux. Celui-ci en pose **56 aussi** —
mais 26 par **paramètre optionnel** de composant partagé (`semanticId`,
`semanticIdPrefix`), 30 en littéral. Même volume, stratégie opposée. Le skill
laisse donc ce choix entièrement ouvert, et les deux voies marchent.

⚠️ **Et ce qu'il ne pouvait pas voir** : le terrain n'appelle aucun backend.
Rien ici ne porte sur cette dimension — voir `chantiers-differes.md` § C.

### La classe dominante : le scaffold livré ne passe pas ses propres gardes

**26. Rien ne vérifie que le harnais posé sort en 0.** Les quatre points suivants
sont indépendants et se découvrent un par un ; ce qui les réunit est qu'aucun
d'eux n'aurait survécu à un garde dérivé — *poser le scaffold sur un projet neuf
et exiger que chaque cible du Makefile sorte en 0*. La CI monte déjà un projet
Flutter à partir de rien et l'analyse ; elle ne lance pas les cibles.

**27. Trois fichiers du CADRE ne passent pas `dart format`.** Mesuré sur la copie
vierge du dépôt, pas sur une édition : `a11y_test.dart`, `anchors_test.dart`,
`layout_test.dart`, exit 1. Or le workflow que l'installeur pose lance
`flutter analyze` — **la CI livrée est rouge à la minute où elle est installée**,
et sur un projet qui active `prefer_single_quotes`, elle l'est deux fois.

**28. `a11y_test.dart` ne consomme jamais `tester.takeException()`** — quand
`layout_test.dart` le fait, en le justifiant. Le garde a11y monte pourtant les
mêmes écrans à `textScale: 2`. Sur un écran qui déborde à cette échelle,
l'exception reste en attente et fait tomber le test **avant** que `argusCheck`
n'ait produit un verdict : message générique, **aucune clé**, donc
`known_issues.dart` est impuissant. Mesuré sur le terrain : **11 écrans sur 14**,
soit une suite rouge en permanence et irrécupérable par la dette.

**29. `make argus-sec` ne peut pas être vert avec les défauts livrés.**
`build.android` pointe l'APK **debug** et `requireDebuggableOff` vaut `true` :
le scaffold prescrit donc de scanner un binaire qu'il condamne ensuite en
**blocker**. Deux valeurs par défaut justes séparément, contradictoires ensemble.

**30. `jankFramesPct` n'a aucun garde d'échantillon minimal.** Deux exécutions du
même binaire sur le même device ont rendu `jank 0 %` puis `jank 100 %
(framesRendered: 1)` — sévérité `critical`, donc exit 2. Un pourcentage tiré
d'une seule frame n'est pas une mesure, et il fait échouer la CI.

### Deuxième classe : un instrument qui rend un verdict sans savoir distinguer deux causes

**31. La classe.** Trois relevés donnent le même verdict pour des causes
différentes, et leur message oriente alors activement à côté. C'est la famille de
défaut la plus coûteuse du lot, parce qu'elle envoie chercher là où il n'y a rien.

**32. `anchors_test.dart` ne monte qu'`argusViewports.first`.** Une commande sous
le pli d'une liste paresseuse y est **indiscernable d'une ancre absente** — et le
message d'échec énumère trois causes possibles sans jamais citer le pli. Mesuré :
4 ancres déclarées « absentes » au petit gabarit, **toutes présentes et actives**
au grand.

**33. `anchors_test.dart` n'a ni `argusCheck` ni dette inscriptible** (0 contre 5
dans `a11y_test.dart`). Un débordement **préexistant** sur un écran rend donc son
instrumentation impossible : le garde tombe au montage, sans clé à inscrire, et
la seule issue est de modifier le jeu d'essai du projet.

**34. `argus-a11y` s'exécute après `argus-run` dans la cible `argus`.**
`a11y.mjs` mesure « l'écran affiché » ; après une suite Maestro, personne ne sait
lequel c'est. Mesuré dans la chaîne : `0 interactif, 0 finding`, quand le même
script lancé sur un écran connu en rend cinq. Le script refuse correctement de
mentir — c'est l'ordonnancement qui le met en position de ne rien mesurer.

### Troisième classe : la doc affirme ce que le code ne fait pas

**35. La classe.** `tools/check-scaffold.sh` fige déjà les compteurs de la doc.
Le garde à dériver est le même, étendu aux **affirmations de structure** : un
champ promis dans un format de sortie doit exister dans le fichier produit.

**36. `report-format-mobile.md` §A décrit un `report.json` qui n'existe pas.**
Il promet `metrics.perf` ; le fichier réel porte `run`, `summary`, `findings`,
`coverage`, `startup` — **aucune clé `metrics`**. Et `run.appVersion` reçoit le
**nom** du paquet, pas sa version.

**37. Contradiction sur la locale, entre deux fichiers de référence.**
`device-matrix.md` recommande de lancer soi-même son AVD (`avd` et `autoStart`
ne se combinent pas) ; `methodology-mobile.md` §I18N précise que `--device-locale`
n'existe que sur `maestro start-device`. Or `run.mjs` ne passe `deviceLocale`
qu'à `startDevice`. Donc dans la disposition **recommandée**, `locale.deviceLocale`
existe et **n'a aucun effet**. Aucun des deux documents ne signale le conflit.

**38. `buildCmd` est décrit comme « jamais lancé sans confirmation ».** Il n'est
lancé **jamais du tout** : aucun script ne le référence, il est seulement affiché.
La formulation laisse croire à une garde qui n'a pas lieu d'être.

**39. La table « enveloppé par l'extérieur » du §2 est incomplète.** Elle donne
`TextField` → « un seul nœud », ce qui est vrai. Mais poser un **rôle** sur
l'enveloppe (`Semantics(identifier: …, textField: true, child: TextField(…))`)
crée une frontière et rend le nœud **inerte** ; le retirer le rend actif. La
table prévient pour les composants qui construisent déjà leur nœud, pas pour le
rôle ajouté à l'enveloppe.

### Points isolés

**40. Le compteur `TODO(argus)` de l'installeur compte sa propre documentation.**
`argus.mobile.yaml` porte en commentaire une ligne qui **explique** le mécanisme
et contient le marqueur : ce fichier rapportera éternellement « 1 TODO(argus) à
traiter », même entièrement rempli. C'est l'anti-pattern que l'en-tête de
`install-mobile.sh` décrit pour `ARGUS:OWNED`/`ARGUS:MERGE` — marqueur réservé et
borné à l'en-tête — **dont la protection n'a pas été étendue à `TODO(argus)`**.

**41. `visualCropOn` est une clé globale, la doctrine des racines est locale.**
Dès le deuxième écran en `visual: true`, aucune valeur ne convient : chaque écran
a sa racine. Le skill consacre deux longues mises en garde au cadrage sans jamais
dire comment concilier les deux. Sur le terrain, l'agent l'a laissée vide et
l'horloge système est entrée dans les quatre références.

**42. Le skill ne dit pas quoi faire quand le défaut est DANS le cadre.** L'agent
a patché un fichier `ARGUS:OWNED`-non (le cadre), mesure à l'appui, et a laissé
`install-mobile.sh --check` en échec — puis n'a **pas** patché un second défaut du
cadre, jugeant sa migration sémantique et non textuelle. Deux décisions opposées
sur la même question, faute de règle.

**43. Une racine d'écran qui est aussi une commande absorbe le texte en dessous.**
Quand la surface tapable est l'écran entier, le nœud commande prend dans son
label le contenu qu'il recouvre. La recette du §2 ne le dit pas ; son exemple ne
couvre pas ce cas.

**44. À partir de combien de dettes un projet n'est-il « pas prêt » ?** Le skill
dit que `known_issues.dart` vide est le bon état par défaut et que le premier
défaut doit se corriger plutôt que s'inscrire. Le terrain en a produit **53** d'un
coup. Aucun seuil, aucune conduite à tenir.

**45. Les build-tools ne sont pas dans le PATH par défaut, et rien ne le dit.**
Sans `aapt2`, `make argus-sec` saute la lecture du **manifeste fusionné** —
précisément l'étape qui révèle les permissions ajoutées par les dépendances, et
donc celle qui sert à remplir `expectedPermissions`.

**46. `expectedPermissions` se dérive d'un manifeste fusionné — mais de quel
variant ?** Le skill dit de construire l'APK et de lire le manifeste, sans
préciser debug ou release. Les deux peuvent différer.

## Ce qui reste

**Les vingt et un points du run 3, ci-dessus.** Le backlog était vide le 22/08 au
matin — pour la troisième fois — et un agent vierge l'a rempli le soir même, sur
un skill pourtant corrigé partout où le run précédent avait mordu.

C'est le résultat le plus stable de ce chantier, et il porte sur la méthode :
**une passe trouve ce qui manque, la suivante trouve ce que la correction a
introduit ou n'a pas branché.** Ne pas relire un backlog vide comme une fin.
