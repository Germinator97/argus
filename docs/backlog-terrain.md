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

⚠️ **« Prochain numéro libre : N » est une TRACE D'ÉPOQUE, pas un état.** Ce
fichier en porte plusieurs, chacune vraie le jour de sa passe et fausse le
lendemain — la dernière du fichier annonce **180**, périmée depuis le run 22, et
elle se lit comme actuelle parce que rien ne dit qu'elle ne l'est pas. Le numéro
courant se **dérive**, il ne se recopie pas :

    grep -c '^### [0-9]' docs/backlog-terrain.md    # combien de points
    grep -o '^### [0-9]*' docs/backlog-terrain.md | tail -1   # le dernier

📌 Ces phrases ne sont pas supprimées pour autant : `dernierPointDu`
(`tools/artefact-compteurs.mjs`) les LIT, parce qu'un lot de points peut être
clos sans qu'aucun d'eux ait jamais eu de titre — c'est arrivé aux 347-365. Elles
sont donc de la donnée pour l'instrument et du bruit pour le lecteur : d'où cet
avertissement plutôt qu'une purge.

📌 **Un point qui reste OUVERT l'annonce**, en début de ligne, en gras et daté :
`**Ouvert le JJ/MM/AAAA…**`. Ce n'est pas décoratif. Le contrôleur des compteurs
s'en sert pour ne PAS réclamer un commit de clôture qui n'existe pas — il a
confondu « le numéro est pris » et « le point est clos » pendant quarante-six
passes, faute d'avoir jamais rencontré l'un sans l'autre.

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
inscrit ce point (`2312392`) porte donc un résumé faux ; il reste tel quel, c'est
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

**Corrigé** : les deux fonctions restaurées à l'octet près depuis `e52e615^`, et
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

### 245-250. ✅ Corrigés le 31/08/2026 — la page écrasait le rapport de l'autre plateforme

Signalés par Germinator en regardant les pages publiées, pas par un run : « je
constate que le rapport des runs android a été effacé pour celui de l'ios ».

| | |
|---|---|
| **245** | **une seule `artifact.url` pour un rapport qui décrit UN run**, donc une plateforme. Republier un run iOS dessus ne réunissait pas les deux, il **remplaçait** l'un par l'autre — et le premier n'existait plus nulle part. `artifactFor(config, platform)` lit désormais `url: { ios: …, android: … }`, la forme mono continuant de marcher |
| **246** | la page ne gardait **aucun** run passé. Elle est pourtant le seul support qui survive : `argus-mobile-report/` est gitignoré et effacé entre deux runs, un runner de CI est jetable. L'historique vit donc **dans la page**, en JSON embarqué, et `--previous` le relit |
| **247** | un onglet passé porte ses **mesures**, pas ses **captures** — et il le DIT. Mesuré : 652 386 octets pour un run, dont ~625 Ko d'images, contre 1 645 pour ses données ; trente runs avec leurs preuves feraient sauter le plafond de 16 Mo. Une page qui le tait laisse lire son silence comme « ce run n'avait pas de preuve » |
| **248** | le plafond **annonce ce qu'il retire**, dérivé de ce qui entre. « Les 30 derniers » écrit en dur quand il y en a douze est le compteur faux que ce dépôt traque partout ailleurs |
| **249** | sans `--previous`, une republication **efface les onglets en silence** : la page produite est valide, elle a juste un onglet. Rien ne lève, rien ne rougit. `pertePossible()` est le seul signal qui existe — extraite de `main()` exprès, pour qu'un garde l'**appelle** au lieu de chercher son texte |
| **250** | le geste **documenté** n'était pas le geste **outillé** : SKILL.md prescrivait `make argus-report ARGS=…` pendant que la recette lançait `report.mjs` nu. Ni l'un ni l'autre faux seul — c'est l'écart qui l'est, et rien ne pouvait le voir |

⚠️ **Le 250 est né en écrivant le 249.** J'ai documenté `ARGS="--previous=…"`
comme un acquis, puis vérifié le Makefile : il n'y avait pas de `ARGS`. C'est
exactement le mode de panne que la règle « geste documenté / geste outillé »
décrit, appliqué à moi-même — et il n'a coûté que dix minutes parce que la
vérification a précédé la livraison, pas parce que je m'en souvenais.

⚠️ **Fusionner les deux plateformes dans UNE page était le mauvais remède**, et
c'était le premier qui venait : il aurait fallu afficher un run d'une autre date
à côté du courant, les deux ayant l'air aussi frais. Une page par plateforme est
honnête par construction — elle décrit un run, un seul. C'est le choix qu'a
tranché Germinator (« une page par plateforme »), et il est meilleur que celui
que j'aurais pris.

### 251-253. ✅ Corrigés le 01/09/2026 — le troisième barreau, et deux titres qui mentaient

Aucun ne vient d'un run. Le **251** est un manque connu qu'on s'était noté ; les
deux autres sont nés en le fermant, dont un **signalé par Germinator en regardant
la page** — quatrième fois que la publication trouve ce que l'exécution ne voit
pas.

| | |
|---|---|
| **251** | `--previous` n'avait **jamais tourné de bout en bout**. Il était gardé (un garde qui appelle les fonctions) et muté (7/7 tombent) : les barreaux 1 et 2. Le troisième manquait, et le dépôt écrit ailleurs qu'il ne faut pas s'arrêter au deuxième en croyant avoir fini. Joué en entier — page publiée, `read`, `make argus-report ARGS="--previous=…"`, republication : la page en ligne porte **deux onglets**, et un troisième cycle en a repris deux. Le cas redouté — le préambule `frame-runtime` de ~13 Ko que `historiqueDe()` n'avait jamais vu — **ne gêne pas** ; un garde fige cette conclusion, la chaîne n'étant pas rejouable en CI puisqu'elle publie |
| **252** | le titre du rapport était **le même sur toutes les pages** (« Argus Mobile — rapport QA »). Depuis le 245, un projet publie une page **par plateforme** : deux pages du même projet portaient donc un titre identique, et deux onglets de navigateur côte à côte étaient indiscernables. Dérivé des **faits du run**, jamais de `artifact.title` — celui-là n'existe que du côté publié, or le même corps sert le rapport local |
| **253** | le titre **annoncé** n'était pas le titre **publié**. Trois expressions le calculaient séparément, deux divergeaient : sur un titre par plateforme le journal annonçait `[object Object]` pendant que « T iOS » était publié (le 245 avait ajouté la forme sans mettre le journal d'accord) ; sur un titre vide, « Rapport Argus Mobile » annoncé contre « Argus Mobile — rapport QA » publié. Le seul lecteur de cette ligne est celui qui va republier — donc celui que l'écart trompe |

⚠️ **Le 253 est le 250 sur une autre paire.** Le geste documenté n'était pas le
geste outillé ; ici c'est la valeur annoncée qui n'est pas la valeur écrite. Les
deux se découvrent de la même façon — en vérifiant plutôt qu'en se souvenant —
et aucune des deux ne lève quoi que ce soit : les valeurs sont plausibles.

⚠️ **ET LE GARDE DU 253 NE SUFFISAIT PAS.** Il appelait `titrePublie()` et lisait
ce qu'elle rend — barreau 2. La mutation qui redonne au journal son propre calcul
du titre, c'est-à-dire **le défaut lui-même, mot pour mot**, laissait la suite
entière VERTE : la fonction restait juste, et c'est son **câblage** que plus rien
ne tenait. Il a fallu un garde qui **lance le programme** et compare la ligne du
journal au `<title>` du fichier. Trois barreaux, et seul le troisième voit le
câblage — la règle était écrite, elle n'a pas empêché de s'arrêter au deuxième.

⚠️ **Le garde du 223 est tombé sur un correctif JUSTE**, parce qu'il **citait**
la chaîne « Rapport Argus Mobile » qu'il servait à protéger. La pente était de le
supprimer, ce qui aurait vidé la moitié qu'il tient. Il **construit** désormais
son gabarit avec la fonction qui le produit : si le format change encore, ce
n'est plus le garde qui se périme, c'est la doc qui doit suivre.

📌 **Et le piège du 219/e s'est présenté en vrai pendant l'essai** : une config
laissée sur une valeur de test allait **renommer la page** à la republication. Le
SKILL le dit, et c'est en le lisant qu'on s'arrête — ce point-là se paie une fois
par personne.

### 254. ✅ Corrigé le 01/09/2026 — le titre disait l'identifiant, et les onglets le répétaient

Signalé par Germinator en regardant la page publiée du 252, **deux heures après**
l'avoir demandée. Le correctif de la veille était juste et incomplet : il nommait
le projet par son `appId`, et laissait la plateforme se répéter sur chaque
onglet.

- **Le NOM, pas l'identifiant.** `app.name` existait déjà dans le yaml, et son
  propre commentaire annonçait qu'il « sert d'étiquette dans les rapports » —
  **rien ne s'en servait**. Un titre se lit : « monapp — ios — rapport QA » se
  reconnaît dans une galerie, « com.exemple.app — ios — rapport QA » se
  déchiffre. Repli sur l'identifiant, qui ne manque jamais.
- **La plateforme ne se répète plus.** Une page décrit UNE plateforme depuis le
  245, et le titre la porte : la réécrire sur chaque onglet donnait la même
  information trois fois de suite. ⚠️ Mais la retirer **sans condition**
  supprimerait le seul signal qu'une page a **mélangé** deux plateformes — ce
  que le 245 rend possible sans l'interdire. Elle ne s'affiche donc que
  lorsqu'elle **diffère** du run courant, et c'est alors une anomalie.

⚠️ **UNE DES QUATRE MUTATIONS NE COUPE PAS LA FONCTION MAIS SON CÂBLAGE** :
`report.json` ne porte pas le nom du projet — il décrit un run, pas un dépôt —,
donc `main()` le prend dans la config. Ce chaînon casse **en silence** : le titre
retombe sur l'identifiant. Aucun test unitaire ne peut le voir, puisque la
fonction du titre reçoit déjà le nom qu'on lui donne. C'est le garde qui **lance
report.mjs** qui l'attrape — la leçon du 253, appliquée le jour même à la passe
qui l'a produite.

📌 **Le garde du 223 est retombé, une seconde fois en deux heures**, et c'est
exactement son rôle depuis qu'il **construit** son gabarit avec la fonction : le
format a changé, donc la doc doit suivre. Un garde qui aurait cité la chaîne
aurait accusé un correctif juste, pour la deuxième fois.

### 255. ✅ Corrigé le 01/09/2026 — un dépôt PUBLIC qui nommait ses terrains d'essai

Règle absolue posée par Germinator : **argus ne mentionne jamais le nom ni
l'identifiant d'un projet sur lequel il est exercé** — chantier ou autre. Les
terrains ne sont pas publics, et l'un d'eux est sous contrat.

**Douze fuites**, dont **trois introduites le matin même** par la passe 252-254.
Elles vivaient dans le contenu (identifiant d'application, nom de paquet Dart,
titre de page), dans **l'historique** (163 blobs pour la seule forme la plus
fréquente) et dans **deux messages de commit**.

⚠️ **Le premier instrument a rendu `0` pour tout.** Un pipeline
`rev-list --objects | cat-file` mal formé ne mesurait rien, et ce zéro se lisait
exactement comme « l'historique est propre ». C'est la **contre-épreuve** — un
motif dont la présence est certaine — qui l'a dénoncé : elle rendait `0` aussi.

**Deux gardes, et aucun ne NOMME ce qu'il interdit** — citer les coupables
réintroduirait dans le dépôt public ce qu'on vient d'en retirer :

| | |
|---|---|
| **forme** | il ne connaît que ce qui est **autorisé** : il balaie tous les fichiers suivis pour les formes d'identifiant d'application et compare l'ensemble à une liste blanche **par égalité, dans les deux sens** — un exemple qui disparaît doit sortir de la liste, sinon elle enregistre des permissions pour des valeurs qui n'existent plus. Il a trouvé une fuite que le `grep` manuel avait ratée, **avant même d'être fini** |
| **noms** | ils n'ont aucune forme reconnaissable. Sa liste ne peut pas vivre ici, donc elle est **hors dépôt**, et le garde **échoue bruyamment** quand elle manque plutôt que de rendre un vert silencieux. Son message donne le **rang** du terme, jamais le terme : ce message atterrit dans les journaux de CI, c'est-à-dire l'endroit qu'on protège |

⚠️ **Le commentaire du second garde citait deux mots interdits** — la première
façon pour un garde de naître vacant, en matchant sa propre mention.

⚠️ **LIMITE MESURÉE, ÉCRITE DANS LA LISTE** : un nom qui est aussi du
vocabulaire technique courant ne peut pas y entrer. L'un d'eux apparaît **quinze
fois** dans le plugin web au sens de l'accessibilité clavier, et l'inscrire
ferait rougir du code juste. Un garde qui crie au loup finit désactivé. Pour
ceux-là, seules les **formes identifiantes** sont purgées — dix, relevées dans
l'historique et non supposées.

📌 **L'historique a été réécrit** (317 commits, contenu et messages), avec la
séquence complète que ce dépôt documente : suppression de `refs/original`,
expiration du reflog, `gc --prune=now`, puis contrôle sur **tous les objets**
avec témoin. Sans les trois premiers gestes, le contrôle relit les copies que
`filter-branch` laisse exprès et rend le même compte qu'avant — on croit la
purge ratée alors qu'elle a réussi.

### 256-274. ✅ Corrigés le 01/09/2026 — la vague Android : DEUX runs, DEUX terrains, LES MÊMES défauts

**Test de non-régression demandé par Germinator** : deux runs Android en
parallèle, un sur chaque terrain, agents vierges, sans se connaître. Le résultat
qui compte tient en une ligne : **ils ont buté au même endroit, deux fois**.

| | ce que les DEUX ont trouvé |
|---|---|
| **256** | le SKILL documentait `url: { ios: …, android: … }` — une map en **flow** — que son propre parseur refuse depuis toujours, et que son en-tête exclut explicitement. **Exit 2 : plus aucun script ne lit la config.** C'est la régression du **245**, écrite la veille au soir. **Trois** endroits la montraient, pas les deux que les runs ont vus : le troisième est le dartdoc de la fonction, qu'un lecteur prend pour une prescription |
| **257** | la séquence lançait sept commandes pour **cinq** dimensions, dont `argus-run` n'en alimente qu'une. `argus-sec`, `argus-sca` et le a11y device : **zéro occurrence** dans tout le SKILL. Les deux runs ont publié un rapport à moitié muet en le suivant à la lettre — et le rapport écrit honnêtement « 1/5 dimensions », ce qui se lit comme une information, jamais comme une alarme |

⚠️ **LE GARDE DU 245 NE POUVAIT PAS VOIR LE 256** : il appelle `artifactFor()`
avec un **objet JavaScript**, donc il n'emprunte jamais le chemin YAML → config.
Le troisième barreau, encore — sur le point même où on croyait l'avoir posé le
matin.

Les autres, par ordre de coût :

| | |
|---|---|
| **258** | **le bon diagnostic n'atteignait que le rapport.** Trois flows morts sur « id: <ancre> is visible » ; la console ne donnait qu'un conseil — relève le plafond — et un run l'a relevé à 20, 45 puis 90 s, la pire attente venant se coller au plafond **à 80 ms près** à chaque fois. L'app affichait « Service indisponible ». **Trois passes device.** Le bon texte existait, exact et hiérarchisé, dans le champ `actual` d'un finding |
| **259** | deux bases de dérivation **contradictoires** pour le même seuil : « le maximum observé » (90 053 ms) contre `firstLaunchMs` (9 126). Facteur dix. Aucun test ne pouvait le voir — un écart entre deux textes n'a aucun comportement à casser |
| **260** | le tell de la boucle de micro-tâches était **inversé** : « quelques pour cent de CPU » annoncés, **120,6 %** mesurés. Une boucle serrée ne dort pas. Le critère donné aurait fait écarter le bon diagnostic |
| **261** | `goto.yaml` pousse à écrire une récursion et ne dit rien là où on l'écrit ; l'avertissement vit dans le linter, qui parle **après** |
| **262** | le format du rapport avait **une** case là où le §2c prescrit **deux** noms de paramètre. Un format qui prescrit sans donner de case fait inventer |
| **263** | le coût de `argus-baselines` annoncé à trois passes, **mesuré à 5 min 50** — facteur trois. Il a fait sur-budgéter au point d'envisager de couper la contre-épreuve visuelle |
| **264** | le raccourci qui divise le troisième temps par trois vit cent lignes plus bas |
| **265** | **les références visuelles d'écrans authentifiés contiennent les données servies, et elles se commitent** : 320 Ko de noms de clients mesurés. Sur un projet sous contrat, ce n'est pas une décision de QA — et le skill ne posait jamais la question, surtout pas là où elle se décide |
| **266** | « laisser `argusScreens` vide » n'est pas l'option neutre annoncée : le croisement POSÉ → DÉCLARÉ rougit dès qu'une ancre existe dans `lib/` |
| **267** | rien n'interdisait de construire pendant que `lib/` bouge — un run a payé deux flows rouges sur un **binaire périmé**, qu'aucun symptôme ne distingue d'un défaut d'instrumentation |
| **268** | les cinq clés `auth.anchors` décrivent un **formulaire**, et la consigne « renseigne les trois premières avec les ancres du PREMIER écran » est **impossible** dès qu'un écran n'a qu'un champ — le cas même qu'elle prétend traiter |
| **269** | `hideKeyboard` proscrit **sans remplaçant**, alors qu'un clavier ouvert recouvre le bouton de validation |
| **271** | le coût d'une suite authentifiée face à un endpoint borné vivait dans un commentaire d'`argus.mobile.yaml` — un fichier qui **n'existe pas encore** quand on planifie |
| **273** | un `TODO(argus)` sans objet ne pouvait jamais se fermer : le seul inventaire que la personne suivante lira affichait du travail inachevé qui était achevé |
| **274** | cinquième écart légitime : l'état est atteignable mais il **COÛTE**. Les quatre écarts documentés parlent de nature, aucun de prix — et la décision prise seule déplaçait cinq écrans sur onze |

### 270 et 272. ✅ DÉMENTIS à la reproduction — 01/09/2026

Deux sur dix-neuf, le taux habituel. Ils restent ici : ce qui vaut n'est pas le
correctif, c'est la raison pour laquelle on cherchait au mauvais endroit.

- **272** — « la mesure des 216 px vit dans la méthodologie, je l'ai lue après
  avoir posé mes racines ». **Faux** : elle est au **§2**, exactement là où l'on
  pose les racines, avec le chiffre, l'horloge système et un renvoi pour le
  détail. Le run l'a manquée ; elle n'est pas mal placée.
- **270** — « l'installeur annonce *1 conservé* sans dire lequel, et `--check`
  n'imprime aucune liste ». **Faux des deux côtés** : la ligne qui nomme le
  fichier est **directement au-dessus** de l'incrément du compteur, et `--check`
  lancé sur un terrain en retard imprime bien ses fichiers, nommément — mesuré.
  Sur un terrain à jour il n'a rien à dire, ce qui est correct.

📌 **Ce que l'écriture des gardes a trouvé en plus des runs** : le garde du 256 a
débusqué **deux occurrences que ni les runs ni aucun `grep` n'avaient vues** — et
**deux FAUSSES**, le gabarit de cadrage en prose de la méthodologie
(`APP : { pubspec: … }`), qu'il ne fallait surtout pas « corriger ». Le motif est
ancré sur la forme d'une clé YAML.

⚠️ **Et un garde EXISTANT est tombé sur un correctif juste, troisième fois de la
journée** : il exigeait le backtick collé à « Relève », or la reformulation dit
« Relève alors ». Le phénomène n'avait pas bougé, seul son ancrage était trop
serré.

⚠️ **Le piège de zsh, payé sur ma propre procédure.** Les archives des deux runs
étaient **vides de leurs racines** : `tar czf … $racines` non quoté ne fait pas
de word-splitting sous zsh, l'outil reçoit un seul nom de fichier. C'est le
contrôle de couverture qui l'a vu — 38 et 36 fichiers manquants — pas moi, et
`check-etalons.sh` rendait « 0 manquant » puisqu'il vérifie la présence des
fichiers, jamais leur contenu.

### 275-295. ✅ Corrigés le 01/09/2026 — la vague iOS : le geste le plus destructeur du parcours n'était nulle part

**Runs 37 et 38**, iOS, en parallèle, agents vierges, sur les deux mêmes
terrains que la vague Android — commits de base identiques (`5f0ed193` et
`884c7328`), ce qui compte pour le 275.

⚠️ **Ces constats ont failli être perdus.** Les six fichiers d'un étalon
décrivent le TERRAIN ; le **compte rendu de l'agent** n'en fait pas partie et ne
vit donc que dans la session, qui a été vidée après la vague. Ils ont survécu
dans `~/.argus-etalon/run35-38-constats.md`. **Le compte rendu est le septième
fichier**, et la procédure le dit désormais.

| | le plus grave, et il n'était pas dans le skill |
|---|---|
| **275** | 🚨 **une publication sans `url` peut atterrir sur la page d'un AUTRE run et la remplacer.** L'outil rapproche par **chemin de fichier**, et les deux plateformes d'un terrain écrivaient le même `report.artifact.html` — un run iOS a donc effacé la page Android de son propre terrain, titre passé de « — Android » à « — iOS ». Mesuré indépendamment par les deux runs. Le message du script disait « publier sans cette URL crée un doublon » : **l'inverse exact du danger**. Le skill protégeait contre l'écrasement DÉLIBÉRÉ et pas du tout contre celui PAR DÉFAUT, qui ne demande aucune erreur |

**Trois de mes correctifs du matin même, mis à l'épreuve l'après-midi :**

| | |
|---|---|
| **276** | le **260** et le **263** ont échoué de la même façon — j'ai remplacé un nombre deviné par un nombre **mesuré dans un seul état**. « 120,6 % de CPU » n'a pas été retrouvé par un run sur machine partagée (**42,9 %**, même défaut), et « vingt minutes » a fait sur-budgéter deux runs au point d'envisager de couper la contre-épreuve visuelle. La leçon n'est pas la valeur : **une** valeur ne reconnaît rien |
| **277** | le **264** — j'avais **annoté** l'éloignement du raccourci au lieu de le **déplacer**. Le run suivant a fait l'aller-retour quand même et l'a écrit mot pour mot |
| **278** | le **270 est ROUVERT : mon démenti était faux.** J'avais mesuré `--check` sur un terrain **en retard**, où il imprime la liste des fichiers *en retard* — pas celle des fichiers *OWNED* dont le constat parlait. *J'ai mesuré autre chose que ce que le constat visait, et démenti un constat juste* |

**Ce que les runs ont trouvé, par ordre de coût :**

| | |
|---|---|
| **279** | `startTimeoutMs` se dérive de `firstLaunchMs`, **que iOS ne produit pas** — `perf.mjs` y rend un `skipReason`. C'est le **259 corrigé le matin** qui a créé cet angle mort ; la table du §1 l'annonçait, à neuf cents lignes de là. La bonne grandeur existe pourtant et se trouve une ligne plus haut : la pire attente que le runner vient de relever |
| **280** | le TODO du retour à l'accueil vit dans une branche que `SCREEN_ID === ARGUS_START_SCREEN` rend inatteignable pour un écran **nommé** — rempli en croyant traiter le cas général : un flow rouge, ~160 s de device, une fausse piste vers « l'ancre est absente » |
| **281** | `--check-anchors` disait « que RIEN ne déclare » d'ancres écrites noir sur blanc dans `screens[]`. Le signal est bon — « déclaré » veut dire « monté par l'étage 1 » — mais le mot le rendait indéchiffrable. ⚠️ Le remède qui vient à l'esprit (faire lire `screens[]` au croisement) est le **mauvais** : l'ancre passerait un contrôle que l'étage 1 ne monte jamais |
| **282** | « sept fichiers » de flows, il y en a **huit**. Un compteur périmé s'affiche exactement comme un compteur juste |
| **283** | §2c « demande confirmation avant d'éditer du code applicatif » contre §1 « ne t'arrête pas pour demander ». **Trois runs successifs ont tranché seuls** — 111 à 257 lignes dans le code de quelqu'un, chacun sous sa propre règle, aucun n'ayant tort |
| **284** | une URL **déclarée dont la page n'existe plus** n'avait aucun cas : `read` rend « artifact not found » pendant que le script annonce « à REPUBLIER sur <url morte> ». Les deux runs l'ont rencontré le même jour — **par mon erreur de cadrage**, qui leur avait donné deux URL mortes comme « pages existantes » |
| **285** | **le seul « débrouille-toi » du parcours** : le §2c disait OÙ poser les doubles et jamais COMMENT les écrire, ce que 90 % des projets Flutter/BLoC devront produire. Et c'est là que se décide la boucle de micro-tâches — un run l'a heurtée au **premier `argus-anchors`**, cinq minutes après son premier double |
| **286** | le dépannage de build est **entièrement Android**. L'échec iOS rencontré (`native assets … references objective_c`) ne ressemble à rien de ce qui est décrit |
| **287** | une coquille **qui EST l'écran de départ** n'avait pas de case : la table dit « pas d'ancre », mais celle-ci rend l'accueil et c'est elle que `launch-clean.yaml` attend |
| **288** | aucune **règle d'arrêt** du périmètre — 8 écrans retenus sur ~13 sans critère —, et aucun pour l'écran dont le contenu suit l'horloge (6 passés en `visual: false`, à raison). La règle ne porte pas sur les écrans mais sur l'**étage** |
| **289** | générer les références devient **infaisable** quand un flow gèle (6 min 20 par passage). Le §3g l'autorisait « en esprit » sans donner la commande |
| **290** | le chemin du kernel **iOS** n'est nulle part — et là-bas le binaire est un **répertoire**, donc pas d'`unzip` |
| **291** | l'avertissement sur les captures sortait **dix fois par run** sans qu'aucune clé n'enregistre qu'on avait vérifié. Un avertissement inacquittable finit ignoré, et il emmène les autres : ce que le skill reproche aux TODO sans objet, appliqué à sa propre sortie |
| **292** | le point 5 du §3g-bis **se retourne** quand la page n'existe pas : « lis son titre actuel d'abord » a fait renseigner `artifact.title` d'un titre **inventé** |
| **293** | l'outil de publication réclame une passe de conception, le §3g-bis dit de publier tel quel. Un run s'est arrêté entre les deux, faute d'arbitrage écrit — or réécrire la page **détruit son historique embarqué** |
| **294-295** | deux choses justes au mauvais endroit : le diagnostic des trois causes à des centaines de lignes de la séquence, et `hideKeyboard` — un piège de flow **iOS** — logé entre deux paragraphes sur la taille des **APK Android** |

⚠️ **CE QUE LA MUTATION A TROUVÉ, ET QUE LA RELECTURE N'AURAIT PAS VU** : **quatre**
de mes gardes étaient **vacants**, tous pour la même raison — le motif matchait une
**mention** au lieu de la valeur. Un garde de câblage cherchait
`ancresOrphelinesReport(orphelines, config)`, motif que la **déclaration** de la
fonction contient mot pour mot ; un autre acceptait le **titre** d'un paragraphe
(« ET SANS INTERLOCUTEUR ? ») qui pose la question sans y répondre ; un troisième
acceptait `MockCubit<` cité dans un commentaire voisin. Ancrés sur l'usage
(`for (const ligne of …(`, `extends MockBloc<`) ou sur une structure — une même
LIGNE qui porte le cas ET le geste —, ils tombent.

⚠️ **Et un garde a rougi sur un retour à la ligne** : le markdown est enveloppé à
~78 colonnes, donc « deux fois de suite » y vit sur deux lignes et un motif
multi-mots ne le trouve pas. Les gardes de prose écrits ce jour-là aplatissent
désormais les blancs — ils avaient tous la même fragilité, ils ne l'avaient
simplement pas encore montrée.

### 297. ✅ Corrigé le 01/09/2026 — « présent » ne veut pas dire « embarqué »

**Vient d'une question de Germinator** : *« est-ce que le rapport mentionne les
points de configuration manquants, fichiers Firebase ou autres ? »* Mesuré :
**non**. La seule occurrence de `google-services.json` dans tout le harnais était
une **liste blanche de secrets** — pour ne PAS l'alarmer, jamais pour détecter
son absence.

📌 **Le harnais SAVAIT que ça arrive sans savoir le dire.** `startupHint`
orientait déjà vers la capture (« si elle montre une erreur de l'app, aucun
plafond n'y changera rien ») et son commentaire citait le cas exact — « Service
indisponible faute d'un fichier de configuration absent du bundle ». Il évitait
donc la fausse piste, mais laissait l'humain nommer la cause : **six flows
rouges et ~36 min d'appareil** au run 38, pour un défaut détectable en
millisecondes et **sans device**.

🎯 **ET LA CONCEPTION A CHANGÉ EN COURS DE ROUTE, sur une objection de
Germinator** : *« là on spécifie seulement firebase, mais il pourrait y avoir
d'autres fichiers de config non ? »* — posée avant que la première ligne soit
écrite. Elle était juste : coder `si Firebase` aurait reproduit le défaut que ce
dépôt reproche ailleurs — **énumérer les défauts CONNUS au lieu de mesurer le
PHÉNOMÈNE** — et rendu « 0 » sur le quatrième fichier que personne n'a imaginé.

Le phénomène est unique : *un fichier posé dans les sources que rien ne câble,
donc jamais embarqué, et dont l'absence ne se voit qu'à l'exécution*. Seule
change la déclaration qui fait l'embarquement. Chaque règle dit donc trois
choses — **QUOI** chercher, **QUELLE** déclaration câble, ce qui **CASSE** — et
un projet ajoute les siennes dans `argus.mobile.yaml → configFiles:`.

⚠️ **Ce qui n'y est PAS est aussi une décision** : les assets Flutter ordinaires
en sont exclus. Un asset manquant lève **bruyamment** au premier usage, donc il
se diagnostique seul ; l'inclure noierait les trois cas silencieux sous des
lignes sans valeur. *On ne contrôle que ce qui échoue SANS le dire.*

📌 **Éprouvé sur un projet RÉEL avant d'être écrit** — sans Firebase, trois
familles de polices déclarées **par dossier** (`assets/fonts/geist/`) : **zéro
finding**. C'est cette mesure qui a corrigé la détection des polices, qu'une
lecture rapide aurait faite fichier par fichier.

📌 **Câblé aux DEUX bouts**, et le second est celui qui épargne la passe device :
`sec.json` le porte en dimension `configuration`, et `config.mjs` l'imprime au
**§3d**, avant qu'on lance quoi que ce soit. Les deux mutations de câblage
tombent.

### 298. ✅ Corrigé le 01/09/2026 — `app.name` était le nom du PAQUET, pas celui de l'app

**Vu par Germinator sur une page publiée** : le titre nommait l'app d'un seul
mot là où elle en affiche deux. **Sixième fois que la lecture d'un livrable
trouve ce que l'exécution ne voit pas.**

Le gabarit prescrivait la mauvaise source **en toutes lettres** — « Nom du
paquet Dart (pubspec.yaml → name) » — et ce nom finit dans le **titre de la page
publiée**, donc dans la seule chose qui distingue un rapport des autres dans une
galerie. Un identifiant de paquet est une poignée technique ; l'app affiche un
nom qu'un humain reconnaît, et il est **déclaré**, dans un fichier que le
harnais ne lisait nulle part.

`nomAffiche()` le lit dans l'ordre où les sources sont sûres : `CFBundleDisplayName`,
un `resValue("string", "app_name", …)` de Gradle, un `<string name="app_name">`,
puis un `android:label` **littéral**. ⚠️ **Jamais une indirection `@string/…`** :
la suivre naïvement rendrait le nom de la CLÉ, soit un titre pire que celui
qu'on corrige. Rend `''` quand rien n'existe — inventer serait pire que se taire.
Éprouvé sur les deux terrains réels, qui exercent à eux deux trois des quatre
sources.

📌 **Le signal ne parle QUE tant que personne n'a choisi** : il ne sort que si
`app.name` porte *exactement* le défaut posé par l'installeur. Le nom affiché,
ou n'importe quel autre nom, le fait taire. C'est la leçon du **291 appliquée le
jour même à l'avertissement qu'on ajoute** — un avertissement inacquittable finit
ignoré, et il emmène les autres.

⚠️ **ET LE GARDE 255 M'A ARRÊTÉ EN CHEMIN** : en documentant ce point, j'ai écrit
des noms de projets réels dans un dépôt **public**. Il a rougi avant le commit,
en donnant les rangs et jamais les termes — exactement ce pour quoi il existe.
📌 **Un de mes remplacements avait rendu « fait » à tort** : la phrase était
**enveloppée sur deux lignes** par le markdown, donc la recherche littérale ne
la voyait pas. C'est le piège écrit une heure plus tôt dans cette même passe, et
seul un balayage **total et négatif** l'a trouvé — pas la substitution qui venait
d'annoncer son succès.

### 299-316. ✅ Corrigés le 01/09/2026 — la seconde vague Android : un garde qui rendait VERT par accident

**Runs 39 et 40**, Android, en parallèle, agents vierges, sur les deux terrains
remis à neuf. Comptes rendus archivés (`run39-constats.md`, `run40-constats.md`)
— **le huitième fichier mord sur ses premiers runs réels.**

🎯 **LE RÉSULTAT QUI COMPTE : LES DEUX ONT BUTÉ AU MÊME ENDROIT.** Troisième
couple de runs qui converge, et c'est toujours le signal le plus fort.

| | ce que les DEUX ont trouvé |
|---|---|
| **303** | **le build de RELEASE n'est nulle part dans la séquence**, alors que deux dimensions en dépendent. Suivie à la lettre, elle fait juger le debug : 62,2 Mo au lieu de 27,1 sur un terrain, 126 au lieu de 79,1 sur l'autre — un `major` **faux** d'un côté, et MASVS qui ne conclut pas du tout. Les deux runs l'ont construite hors séquence parce qu'ils n'avaient pas le choix |
| **305** | **`firstLaunchMs` n'est pas reproductible sur machine partagée** : 7100 → 2281 ms sur un terrain, facteur 2 sur l'autre, même binaire, même appareil. Le §3g prescrivait d'en dériver `startTimeoutMs` sans dire que le seuil serait aussi instable que la mesure |

**Les trois plus graves :**

| | |
|---|---|
| **299** | 🔴 **UN GARDE QUI RENDAIT VERT PAR ACCIDENT, sur la forme que le skill PRESCRIT.** Le croisement POSÉE → DÉCLARÉE n'acceptait qu'un littéral collé à la clé : `identifier: cond ? 'a' : 'b'` lui était invisible — c'est-à-dire ce que le §2c-bis recommande. **59 posées, 54 vues, verdict vert**, avec un « 54 littérales » honnête qui taisait les cinq manquantes. Il lit désormais l'argument entier, **borné à sa virgule** (lire jusqu'à la clé suivante compterait le `label:` voisin : un faux positif à la place d'un faux négatif, et le pire des deux). Et ce qu'il ne sait pas lire, il le **dit** |
| **301** | 🔴 **35 MINUTES PERDUES sur un message qui jetait sa cause.** On gardait les trois dernières lignes d'`adb` — la queue d'une stack Java — pendant que `Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]` était ailleurs. ⚠️ **Et la conséquence était pire** : `installHint` cherche le code DANS ce détail, donc **l'indice du §3g n'a jamais été affiché**. Le skill avait la réponse, le chemin pour y aller était coupé — mesuré dans les deux sens |
| **300** | 🔴 **UN GARDE NON HERMÉTIQUE, découvert par accident.** `--print-build-cmd` interroge `adb devices` : la commande sort nue sans émulateur, ciblée avec. Le garde avait donc passé des mois **sans jamais exercer le ciblage d'ABI**, et il est tombé le jour où deux runs ont laissé leurs émulateurs allumés — en accusant un correctif sans rapport. Il fixe désormais son environnement et asserte **les deux** états |

**Et ma contradiction, rouverte par mon propre correctif :**

**302** — le repli « sans interlocuteur » du **283**, écrit le matin même, disait
« rien d'autre… **pas de renommage** » ; deux paragraphes plus haut le skill
recommande comme **première** option de rendre public un widget privé, ce qui
EST un renommage. Un run a tranché restrictif, à raison, et deux états sont
restés hors de l'étage 1. *Borner « ce qu'on s'autorise » sans relire ce que le
skill recommande ailleurs rouvre exactement la contradiction qu'on fermait.*
L'exception est nommée, avec son critère — **est-ce que ça change ce que le
programme FAIT** — et ce qui demeure interdit.

**Le reste (304, 306-316)** : l'arête manquante vers `argus-perf` quand le
plafond est frôlé · le **diff de JETONS** comme contrôle d'après-instrumentation
en REGRESS, **inventé par un agent** qui y avait perdu trois lignes de code dans
un diff que la réindentation noie (1 577 insertions pour 361 neuves) ·
l'unicité de l'`anchor:`, montrée et jamais énoncée · le bloc de compteurs qui
**se tronque en silence sous `&&`** (`grep -c` sort en 1 sur zéro) · sa
contre-épreuve manquante (`0` est aussi ce que rend un instrument mort) · la
chaîne YAML quotée multi-lignes · le `tapOn: point: 50%,25%` **écrit comme une
recette**, qui serait tombé sur une rangée de préréglages et aurait changé un
formulaire en silence · `--no-install` au-delà de `--tags` · le double générique
qui n'infère pas · la racine d'une coquille à onglets · et `make argus-debts`,
qui agrège les dettes que quatre lancements recopiaient à la main.

### 2.7 du run 40. ✅ DÉMENTI à l'exécution — 01/09/2026

« L'installeur compte sa propre documentation comme un TODO ouvert ». **Faux** :
l'installeur rend 11, `grep -c 'TODO(argus):'` rend 11 — la ligne de doc ne
porte **pas** le deux-points, et c'est précisément le mécanisme du **273** qui la
protège. Le run a raisonné sur le motif sans le lancer ; dix secondes
d'exécution le disaient.

📌 **CE QUE LE JOUR A VALIDÉ, sans que personne le cherche** : le **297**, écrit
le matin, a **attrapé un vrai défaut sans device** — un `GoogleService-Info.plist`
absent du projet Xcode, sur un run **Android** qui ne l'aurait jamais rencontré à
l'exécution. Le **278** a été vérifié par les deux runs plutôt que supposé, le
**276** tient (baselines à 6 min 08), et les deux ont appliqué le contrôle
avant/après publication du **275**.

⚠️ **TROIS FOIS DANS CETTE PASSE, un garde neuf a matché le TEXTE QUI INTERDIT
ce qu'il traque** — `argus-perf` dans le commentaire « lance `argus-perf` ici »,
`make argus-build` dans la mise en garde contre lui. Ancrer sur le début de
ligne à chaque fois. Et **deux de mes instruments** ont dû être corrigés avant
que la passe de mutation soit propre : une mutation qui visait un titre au lieu
d'une valeur, et un garde qui excusait trop large.

### 317-332. ✅ Corrigés le 01/09/2026 — la vague iOS : le correctif du matin trouvé en deux minutes

**Runs 41 et 42**, iOS, en parallèle, agents vierges, sur les deux terrains
remis à neuf. Simulateurs neufs, fenêtre attachée, **charge attendue avant le
lancement** (pic à 49 au démarrage des deux — lancer là-dessus aurait reproduit
le 305 le jour de son écriture).

🎯 **LE 297, ÉCRIT LE MATIN, A FAIT EXACTEMENT CE POUR QUOI IL A ÉTÉ ÉCRIT.**

> « Prouvé trois fois : par `config.mjs` en quelques millisecondes **sans
> device**, par le journal du simulateur, et par la capture Maestro. C'est
> exactement le scénario que le §3d décrit — **trouvé ici en deux minutes au lieu
> des ~36 min d'appareil qu'il cite**. » — run 42

Le même défaut Firebase, sur le même terrain, avait coûté **six flows rouges et
36 minutes** au run 38.

📌 **Le run 41 a rendu `gate: pass`** — 0 finding, 563 tests verts, 80 ancres,
`allowUndeclared: []`. Le premier run entièrement vert du chantier.

### 🔴 CE QUE LES DEUX RUNS ONT TROUVÉ (quatrième convergence du chantier)

**317** — **le compteur de TODO ne sait fermer qu'un `SANS OBJET`, jamais un
« FAIT ».** Chacun l'a rencontré par un bout différent : l'un a écrit
`TODO(argus): TRAITÉ — …`, l'inventaire a continué d'imprimer « 1 à traiter », et
il a dû **SUPPRIMER le marqueur** — *exactement ce que la règle interdit pour
l'autre cas* ; l'autre a rempli `artifact.title` en gardant sa doc d'origine et
s'est vu compter « 2 à traiter » pour du travail achevé. Le seul inventaire que
la personne suivante lira était faux **dans les deux sens**. Trois formes
ferment désormais.

### Les plus graves

| | |
|---|---|
| **327** | 🔴 **le runner se contredisait à six lignes d'intervalle** : « (1) L'app ne démarre PAS : **aucun plafond n'y changera rien** », puis un bloc pressant de relever `startTimeoutMs` de 20 à 31 s. Les 20 392 ms étaient le plafond **consommé à vide**. *« Suivre la fin de la sortie aurait doublé la durée de six flows condamnés. Le second bloc ne connaît pas le diagnostic du premier. »* |
| **319** | 🔴 **un avertissement inacquittable, imprimé CINQ fois** : « la locale de l'appareil n'a pas pu être lue » — alors qu'une commande la rend (`fr_CI`). La lecture était gardée par `platform === 'android'` : on n'interrogeait pas, et le message accusait l'appareil d'être muet |
| **329** | 🔴 **le 299 sur son autre moitié** : j'avais fait voir les ternaires au croisement, pas les **gabarits**, que le code écartait. Or `identifier: 'x_${e.name}'` est **ce que le §2c prescrit**. Le contrôle ne proposait que `allowUndeclared`, qui veut dire « hors périmètre », pour des ancres **vérifiées**. Un run a gardé l'avertissement plutôt que de mentir dans le YAML : il avait raison, il n'y avait pas de bonne case |
| **328** | **la forme qu'on écrit ne ressemble pas à celle qu'on nomme** — 30 min, sur un paragraphe **lu**. Le skill nomme `Future.value(null)` ; avec mocktail on écrit `thenAnswer((_) async => null)`, qui **est** un futur déjà complété et n'y ressemble en rien |
| **318** | `goto.yaml` conseillait « un `back` répété » pendant que la méthodologie du **même scaffold** écrit que `back` est Android-seul et qu'un retour non gardé « passe au vert sur iOS sans rien tester ». *Deux fichiers livrés ensemble qui se contredisent, et c'est celui qu'on ÉDITE qui avait tort* |

**Le reste** : `identityMeasured: true` contre `"source": "déclaré"` dans deux
artefacts du même run (**322**) · un device d'une plateforme non déclarée dont
les clés **fusionnent** dans l'entrée suivante (**320**) · deux orthographes
pour un même titre, `iOS` et `ios` (**323**) · la contre-épreuve du §2b qui
exige un fichier que le §3 pose (**321**, écrit le matin) · l'avertissement
`grep -c` lu comme **local** alors qu'il est général (**330**, écrit le matin) ·
le `.app` de simulateur qui survit au build release (**325**) · une ancre
composée **au call-site** sans case dans la table (**331**) · un test du projet
rougi par une instrumentation légitime, qui mesurait une **distance en
caractères** (**332**) · `evidence: all` qui n'embarque rien sur un run vert
(**324**) · le rappel `Semantics` sans `const` à huit cents lignes (**326**).

### 📌 CE QUE LES RUNS ONT VALIDÉ SANS QU'ON LE DEMANDE

- **297** — deux minutes contre trente-six (ci-dessus).
- **298** — le titre publié porte le **nom affiché**, plus l'identifiant de paquet.
- **306** — le **diff de jetons** utilisé par les deux : « 0 jeton perdu » sur un
  terrain, « 2 perdus = exactement les 2 renommages voulus » sur l'autre — et
  **l'instrument éprouvé** avant d'être lu, dans les deux cas.
- **316** — `make argus-debts` : **55 lignes** de dette prêtes à coller, aucune
  réécrite de mémoire.
- **302** — l'exception du widget privé a servi : deux widgets rendus publics,
  « une visibilité ne change ni le rendu, ni le comportement, ni un appelant ».
- **276** — `flutter_tester` mesuré à **7,0 %** de CPU : l'ancien critère chiffré
  aurait fait écarter le bon diagnostic. Le run le note lui-même.
- **290** — le chemin du kernel iOS est faux avec un flavor, **et coût nul** :
  « le paragraphe suivant dit *ne devine pas, demande-le au disque*, et je l'ai
  suivi. C'est le bon design : la consigne rattrape son propre exemple. »
- **275** et **305** — l'un a vérifié la galerie avant/après et laissé
  `artifact.url.android` vide (« ce n'est pas à ce run de deviner l'URL d'un
  autre ») ; l'autre a refusé de figer un seuil dérivé d'une mesure prise sous
  charge.

⚠️ **Et trois fenêtres de gardes ont dû SUIVRE le texte** plutôt qu'être
élargies au hasard : chaque écart re-mesuré, et le motif du 309 ré-ancré sur son
**sujet** parce que le 330 l'avait reformulé — un garde qui citait l'ancienne
phrase serait devenu rouge sur un correctif juste.

### 333. ✅ Corrigé le 02/09/2026 — les compteurs de la page publiée, dérivés au lieu d'être tapés

**Demandé par Germinator** après qu'il eut vu la page annoncer « prochain numéro
libre 255 » et « vidé trente-cinq fois » pour **333** et **quarante et une** :
six passes et 78 points de retard. Republier une fois de plus n'était pas le
remède — les chiffres se seraient repérimés à la passe suivante. C'est
l'anti-pattern *« un nombre qui décrit le contenu sans être dérivé de la
donnée »*, et il vivait dans le suivi du chantier lui-même.

`tools/check-artefact.mjs` dérive chaque compteur du dépôt et **refuse** une page
qui ne correspond plus (sortie 1). Sept compteurs : commits, runs, plugins,
gardes, mutations, prochain numéro libre, fois où le backlog s'est vidé.

📌 **DEUX RÉGIMES, ET C'EST TOUTE LA CONCEPTION.** La page est un **journal
chronologique** : « le backlog s'est vidé **huit** fois » y est **juste**, sous le
titre « ce que huit runs ont fini par établir ». Exiger que toutes les mentions
soient égales aurait fait rougir le garde sur de l'histoire correcte — et un
garde qui crie au loup apprend à être ignoré. Donc : *ancré* (le bandeau, l'arbre
de fichiers, la phrase de synthèse) → **chaque** occurrence exacte ; *journal* → le
**maximum** exact, un bilan passé étant plus petit et jamais plus grand.

⚠️ **J'ALLAIS CORRIGER CE « HUIT FOIS ».** Le relevé le donnait pour un compteur
périmé de trente-trois passes, et c'était faux : seule la lecture du **contexte**
l'a dit. C'est la règle connue — *ne pas corriger ce qu'un audit signale sans
l'avoir reproduit* — et « reproduire » voulait dire ici lire les deux cents
caractères qui précèdent, pas relancer une mesure.

📌 **AUCUN MOTIF NE CHERCHE LE MOT NU.** « N gardes » apparaît **seize** fois dans
la page (dont « 401 gardes » qui décrit un terrain) et « N runs » **plus de
cinquante**. Un marqueur nommé d'après une famille désigne la famille, jamais le
sous-ensemble visé : l'ancre est le voisinage — le séparateur du bandeau, le nom
du fichier dans l'arbre.

📌 **LE NUMÉRO LIBRE A DEUX SOURCES INDÉPENDANTES** — les titres `### N-M.` du
backlog et les sujets `docs: close N-M` — et elles doivent s'accorder **entre
elles** avant que l'une soit comparée à la page. Un dépôt qui se contredit ne
peut pas juger un livrable.

⚠️ **DEUX INSTRUMENTS ONT MENTI EN CHEMIN, ET LES DEUX RENDAIENT « 0 ».** Un
`replace` qui ne remplaçait rien, suivi d'un contrôle dont le motif ne matchait
pas davantage : « 0 classe fautive » lu comme une correction réussie. Puis un
motif de mutation absent du HTML **brut** — le texte y est coupé par une balise
et replié à ~78 colonnes — qui aurait produit une page « mutée » identique à
l'originale, donc un garde déclaré aveugle à tort. Les deux ont été démasqués par
la même chose : un **témoin** dont la valeur ne peut pas être zéro.

⚠️ **ET DEUX MONTAGES DE TEST ONT ACCUSÉ LE CODE À TORT** : mon backlog de
laboratoire ne citait aucun run, donc `dernierRunDu` levait — exactement comme
conçu ; puis ma page de laboratoire annonçait dix runs contre un dépôt qui en
disait quarante et un. Aucun n'était un défaut du module, chacun se lisait comme
tel.

📌 **`fetch-depth: 0` en CI n'est pas du confort** : la dérivation lit
l'historique. Sous le clone superficiel par défaut, `rev-list --count` rend **1**
et aucun `docs: close` n'est visible — le garde aurait accusé le code pour un
défaut de montage.

**9 mutations, 9 tombées**, chacune faisant rougir exactement le garde qu'elle
vise. 302/302.

### 334-342. ✅ Corrigés le 02/09/2026 — la campagne 43/44, et trois constats démentis par la reproduction

**Runs 43 et 44**, en parallèle, agents vierges, sur les deux terrains — iOS sans
API d'un côté, Android avec API de l'autre. Les deux combinaisons étaient **déjà
exercées** : c'est le critère posé la veille pour mesurer la sortie plutôt que
l'estimer.

**Le run iOS est le plus propre du chantier** : `gate: pass`, 12 flows, 0 blocker,
0 critical, 0 major, 0 minor, un seul `info`. Le run Android rend `gate: fail`
avec 11 findings tous justifiés, et **5/5 dimensions exécutées**.

📌 **LA REPRODUCTION A DÉMENTI TROIS CONSTATS SUR DOUZE**, et c'est le résultat
qui compte le plus. Deux d'entre eux auraient fait **ajouter ce qui existait
déjà** :

| démenti | la mesure qui l'établit |
|---|---|
| « la clé qui décide du jugement de taille manque au tableau du §1 » | elle y est, ligne 84 — le run avait lu le tableau et pas la ligne au-dessus |
| « un outil du scaffold consomme plus que sa cible » | cet outil **n'existe pas** dans le skill : l'agent se l'était écrit |
| « la règle du pli arrive après la table d'ancres » | elle est **avant** — ligne 1090 contre 1205 |

### 334. Le clavier qui DÉPLACE, là où on lit celui qui CACHE

⚠️ **CE CONSTAT A DÛ ÊTRE REFORMULÉ** : le skill disait **déjà** qu'un clavier
recouvre un contrôle et fait échouer `tapOn`. Ce que le run a rencontré est
l'inverse, et coûte davantage — un élément **flottant** que le clavier **remonte**
au-dessus des autres contrôles, si bien que le `tapOn` **réussit sur un autre
widget** et que rien ne rougit à cet endroit. Cacher est bruyant, déplacer est
silencieux.

L'échec n'est apparu que trois étapes plus loin, sur une ancre sans rapport, et
l'agent allait conclure « la puce est sous le pli ». **C'est la capture qui l'a
démenti**, pas le message d'erreur — lequel désignait le mauvais endroit avec
aplomb. Le geste général est désormais écrit : *quand un `tapOn` réussit mais que
l'étape suivante trouve un écran inattendu, regarde la capture avant de
soupçonner l'ancre.*

### 336. `firstLaunchMs` mesure la PREMIÈRE FRAME, pas l'écran exploitable

**Le plus instructif de la vague.** Le skill expliquait déjà l'instabilité de
cette grandeur — par la **charge de l'hôte**. C'est vrai, et c'est exactement ce
qui a fait **cesser de chercher la seconde cause**. `am start -W` s'arrête au
premier rendu, donc au splash : **8 103 ms mesurés contre 22 à 49 s** d'attente
réelle sur une app dont l'écran de départ vit derrière un aller-retour réseau. Un
facteur 3 à 4 qu'un hôte au repos ne corrige pas, parce qu'il ne s'agit pas de
bruit mais de deux choses différentes.

Un plafond dérivé de `firstLaunchMs` aurait valu ~16 s et **laissé la suite rouge
en permanence**. C'est l'anti-pattern « isoler une variable et conclure qu'il n'y
en a pas d'autre », appliqué à un texte que ce chantier avait lui-même écrit.

### 337. Un secret déclaré mais VIDE s'affichait comme un secret plein

`buildEnv` remplit un secret absent par `''` — délibérément, pour que le flow
décide plutôt que de casser. Mais **rien ne le disait**, et le masquage
remplaçait tout ce qui suit le `=` sans regarder la valeur : `QA_PHONE=***`
s'affichait à l'identique dans les deux cas, **précisément à l'endroit où l'on
regarde pour vérifier**. Coût mesuré : sept minutes de device et un login sauté
sans un mot, son seul indice enterré dans un artefact.

Les deux moitiés, parce que l'une seule laisse le piège : l'affichage distingue
désormais `<VIDE>` de `***`, **et** le runner NOMME les secrets vides avant la
commande — lire `<VIDE>` dans une ligne de trois cents caractères revient à ne
rien lire.

### 338. Le relevé d'ancres rendait `}` sur du Dart parfaitement légal

`'([^']*)'` ne sait pas qu'une apostrophe **interne à une interpolation** ne ferme
pas la chaîne : sur `identifier: cond ? null : '${prefix}_${x ?? 'all'}'` elle
découpe trois fragments et garde le dernier. **Le run a réécrit SON code pour
contourner NOTRE motif** — le sens inverse de ce qu'un outil de mesure doit
provoquer. Remplacé par un automate qui suit les interpolations, y compris les
chaînes qu'elles contiennent.

📌 La moitié qui comptait autant : les **deux formes que le skill prescrit**
rendent toujours leurs littéraux — le ternaire à deux états du §2c-bis, et le
gabarit simple qui reste une famille. Un correctif qui les aurait coupées valait
moins que le défaut.

### 339-342. Quatre « justes mais mal placés »

`ArgusScreen.setUp` est **synchrone** alors que les conteneurs d'injection rendent
des `Future` : le montage à trois lignes qui marche vit désormais dans son
dartdoc (**339**). Le levier qui économise le plus de temps device est entré dans
la séquence numérotée (**335**). Comment trouver **quel** service doubler quand la
boucle affamante vit dans une **dépendance** et non dans son propre code, avec la
mesure bornée qui en fait un finding — 1 234 appels contre 1 (**340**). La longue
note de publication annonce en tête la phrase qui répond à la question qu'on se
pose en arrivant (**342**).

⚠️ **ET LE 341 S'EST RETOURNÉ CONTRE MOI** : le rappel sur la fermeture d'un TODO
devait vivre là où l'on lit le compte — je l'ai posé **au mauvais endroit**, dans
le `case`, trois lignes **avant** que la fonction qui l'arme ne soit appelée. Il
ne s'affichait donc dans **aucun** des deux cas, et mon contrôle rendait « 0
occurrence, comme attendu » en ne mesurant rien : le `findsNothing` sans jumeau,
dans un correctif dont le sujet était précisément le mauvais placement. Son garde
**exécute** l'installeur et lit sa sortie, dans les deux sens.

📌 **UN VERDICT « VACANT » ÉTAIT LE HARNAIS, PAS LE GARDE** : `startup.samples`
est nommé **deux fois** dans la même phrase, et la mutation n'en retirait qu'une.
Corrigé des deux côtés — la mutation porte sur la prescription entière, et le
garde asserte la prescription plutôt que le token, puisqu'une mention suffisait à
le contenter.

### 343-346. ✅ Corrigés le 02/09/2026 — le run de CONFIRMATION, et un binaire qui n'était pas le sien

**Run 45**, terrain n° 2 (API, Android), joué pour **mesurer la sortie plutôt que
l'estimer**. Résultat : `gate: fail`, 9 findings, **5/5 dimensions**, 6 flows
sans échec, 35/35 ancres, 358/358 gardes, 598 tests projet. L'authentification à
trois écrans passe de bout en bout.

⚠️ **Quatre constats, TOUS coûteux, et TOUS des « justes mais mal placés ».**
Aucun mécanisme cassé : l'information existait à chaque fois **dans le
document**, au mauvais endroit. Et la reproduction en a **aggravé deux** au lieu
d'en démentir.

### 343. 🔴 « PAQUET INTACT » : une énumération de causes qui manquait la plus fréquente

**~35 minutes d'appareil perdues sur un binaire qui n'était pas le sien.** Douze
flows rouges sur `id: identification_root is visible` — pendant que la capture
montrait l'écran **correctement affiché**. Le kernel portait
`auth_identification_root`, le nommage d'une **session Argus antérieure**,
survivant dans le cache Gradle.

`make argus-build` disait « PAQUET INTACT — même empreinte » et proposait
`flutter clean` **à condition que la commande ait changé** (ABI, flavor, flags).
La commande n'avait pas changé : c'est `lib/` qui avait changé. Le run a lu la
condition, vu qu'elle ne s'appliquait pas, et **écarté le remède**.

⚠️ **La reproduction a aggravé le constat.** Le run croyait que le skill décrivait
ce cas — mesuré : `PAQUET INTACT` **n'apparaît pas** dans le SKILL, et le
`flutter clean` qu'il y avait lu concerne une **erreur iOS de native assets**,
sans rapport. *La présence d'un remède pour un autre cas lui a fait croire qu'il
couvrait celui-ci.*

📌 **La mesure qui tranche existait déjà** — `binaryFreshness` compare la date du
paquet à la plus récente des sources `lib/**/*.dart` — mais elle ne servait qu'à
l'audit de sécurité. Elle est désormais interrogeable là où le build se juge, et
la recette **ÉCHOUE** (exit 1) sur un paquet périmé : un paquet intact *après*
que `lib/` a changé n'est jamais une information, c'est un défaut.

⚠️ **Deux erreurs à moi en l'écrivant, toutes deux prises par l'EXÉCUTION** : le
drapeau posé **après** `parseArgs`, qui refuse les options inconnues, donc il ne
s'exécutait jamais — *le même défaut que le rappel des TODO posé trois lignes
avant la fonction qui l'arme, deux fois dans la journée* ; et une première
version lisant `binaryToScan`, qui rend le binaire **scanné** (souvent la
release) et non celui que la recette vient de produire.

### 344-345. La contre-épreuve à cinq secondes n'était pas dans la liste

Devant l'échec, une commande départage ce que les trois causes ne font que
resserrer : `maestro hierarchy | grep -c <ancre>` demande à l'appareil ce qu'il
porte. Elle existait — **430 lignes après** la liste, donc après le moment où
l'on en a besoin. Le run la disait « listée en cause (3) » ; **elle n'y était pas
du tout**.

📌 **Et le comptage du marqueur avait manqué le défaut** : le run avait bien
compté dans le binaire, et obtenu « 2 » — parce que `identification_root` est une
**sous-chaîne** de `auth_identification_root`. Le skill enseigne d'ancrer les
motifs ; il ne le redisait pas **là où l'on compte dans un binaire**, c'est-à-dire
là où un nombre plausible est le plus convaincant.

### 346. Le piège du dartdoc, à neuf cents lignes de l'endroit où il mord

Le §2b prévient que `harness.dart` et `known_issues.dart` portent dans leur
dartdoc un exemplaire **mot pour mot** de ce qu'on va y chercher. Le §3c, qui
demande de les remplir, est neuf cents lignes plus loin. Le run l'avait lu, puis
s'est ancré sur la ligne de déclaration au lieu du marqueur — fichier cassé, non
suivi par git donc irrécupérable par `checkout`, reconstruit depuis le scaffold.

📌 **Les gardes assertent l'ORDRE, pas la présence** : chacune de ces phrases
existait déjà quelque part. Un garde satisfait par leur existence serait resté
vert pendant les trente-cinq minutes qu'elles ont coûtées.

📌 **Deux correctifs du chantier se sont bien comportés** : le rapport interrompu
(un arrêt a écrasé 14 418 octets par un stub de 334 portant `"incomplete": true`
et « aucun chiffre de ce fichier ne décrit une exécution complète ») et le remède
`icon:`, qui a guéri six ancres inertes.

## Ce qui reste

Les **505 à 510** sont fermés — les cinq premiers rendus par la paire de
confirmation 82-83 du 16/09/2026, le dernier rencontré en les fermant. Chacun
porte son garde ; tous sauf le 510 portent aussi leur mutation, et celui-là dit
pourquoi il ne peut pas en avoir.

✅ **494 FERMÉ le 14/09/2026 — le format dépend de la VERSION du formateur.**
Le job sur la stable du jour (Flutter 3.47.4) échouait sur le format seul, tout
le reste passant : le scaffold est compatible, l'écart est stylistique. Style à
version fixe, compatibilité sur stable — deux jobs, deux buts. **Les quatre jobs
de la CI passent désormais dans un conteneur Linux.**

✅ **493 FERMÉ le 14/09/2026 — le job de CI qu'on avait écrit, gardé, muté, et
jamais fait TOURNER.** Trois défauts, dont un contexte supposé sur lequel un
garde avait été écrit, et une mutation qui cessait de prouver quand le cardinal
divisait juste. Aucun n'était visible autrement qu'en l'exécutant.

✅ **492 FERMÉ le 14/09/2026 — la première passe de mutation dont le verdict
veuille dire quelque chose.** 436/438 : deux gardes creux, que les passes
précédentes rapportaient comme « tombés ». Et l'un des deux, en résistant à sa
correction, a révélé deux fences manquantes dans le skill — soit 117 lignes de
prose rendues comme du code, dans un fichier que personne n'avait affiché.

✅ **490 et 491 FERMÉS le 14/09/2026 — la CI, jouée pour la première fois en 79
runs, et ce qu'elle a fait tomber.** Le 490 découpe la passe de mutation en dix
tranches, parce que son produit « durée × cardinal » n'avait jamais été mesuré.
Le 491 est ce que le garde du 490 a révélé en chemin : le verdict du harnais
était rendu par un garde qui tombait sous chaque mutation, donc il approuvait
tout depuis quatre jours.

✅ **488 FERMÉ le 14/09/2026 — la classe, et non le cas.** Ce qui le ferme n'est
pas un troisième correctif ponctuel mais un garde qui porte sur le **phénomène**
plutôt que sur le site : « zéro invocation nue, où que ce soit ». Écrit le jour du
481, il aurait attrapé le 485 — qu'un garde posé sur `flutterCommandIn` ne
pouvait structurellement pas voir. Il prouve qu'il sait VOIR avant de dire qu'il
n'a rien vu, dépouille les commentaires, et porte une contre-épreuve sur une
source dont la réponse est connue.

✅ **485 à 487 FERMÉS le 14/09/2026 — backlog vidé une 96e fois**, sur la paire
78-79. Le 485 rendait la fraîcheur des dépendances muette sur tout projet dont le
PATH porte une autre version que le pubspec ; le 486 faisait attendre 11 s par
passe pour un geste que la plateforme ne peut pas exécuter. Les deux correctifs
portent leur garde **et** leurs mutations dans le même commit.

✅ **485 à 488 INSCRITS le 14/09/2026, sur la paire 78-79** — deux constats neufs
(485, 486), tous deux rendus par le **run 78** ; **quatre démentis** groupés en
487, tous du run 79 et tous du même motif : *le skill avait déjà répondu, et
l'agent a relayé son texte*. Le run 79 n'a rendu **aucun constat neuf**.
📌 **Le palier** : pour la première fois depuis la paire 74-75, aucun mécanisme
cassé, aucun faux vert, aucune passe device perdue — et l'un des deux runs est
entièrement muet. Le 485 ne se déclenche même que sur une **divergence** entre la
version épinglée par le projet et celle du PATH : sur la plupart des postes, il
dort.


✅ **452 à 457 FERMÉS le 09/09/2026 — backlog vidé une 65e fois**, sur les six
points du **run 69** (iOS, terrain avec API). Quatre correctifs, deux constats
mal formulés dont le fond était juste (453, 455), **trois parités** (452, 453,
456).
🔴 **Ce que la passe a payé** : en écrivant le point 457 — celui qui traite des
fuites de secrets — j'ai cité le nom d'un projet sous contrat dans ce fichier
public. C'est le garde de confidentialité qui l'a vu, pas moi.

✅ **456 FERMÉ le 09/09/2026** — la connexion conditionnelle n'avait qu'une moitié
de condition, et rien ne levait : la capture était valide, simplement d'un autre
écran. Troisième parité du lot.

✅ **455 FERMÉ le 09/09/2026** — constat mal formulé (le seuil ÉTAIT écrit), geste
réellement manquant. Le symptôme observé était juste, son diagnostic à côté.

✅ **454 FERMÉ le 09/09/2026** — le junit lu pendant le run rend le verdict de la
passe précédente, et un run en a tiré la conclusion inverse du vrai. Le garde est
né vacant sur un motif non replié : c'est son échec qui l'a dit.

✅ **453 FERMÉ le 09/09/2026** — l'information existait, dans un paragraphe qui
décrivait un autre symptôme. La mise en garde est désormais DANS l'exemple.

✅ **452 FERMÉ le 09/09/2026** — le compteur d'ancres comptait le code mis en
commentaire ordinaire (3 pour 1, mesuré). Le filtre juste vivait DÉJÀ deux cents
lignes plus haut dans le même document.

✅ **447 à 451 FERMÉS le 09/09/2026 — backlog vidé une 64e fois**, sur les cinq
points du **run 68** (Android, terrain sans API). Trois correctifs vrais (447,
448, 449), un démenti double (450), une parité runner/SKILL (451).
📌 **Ce que la passe apprend, et ce n'est pas dans les correctifs** : le 450 m'a
vu écrire un garde et une mutation qui existaient déjà depuis le point 278,
motif pour motif. Ce n'est pas une relecture qui l'a dit — c'est le harnais,
en rendant `TOMBE` sur **un test qui n'était pas le mien**. Lire le nom du test
qui tombe est la seule chose qui distingue « mon garde marche » de « un autre
faisait déjà le travail ».
⚠️ Et le 449 m'a fait tomber un garde de PROXIMITÉ en écrivant sa propre note :
le remède honnête était de condenser, jamais de relever le seuil.

✅ **450 DÉMENTI le 09/09/2026** — la promesse du §2b est vraie ET gardée depuis
le point 278. Mon « correctif » dupliquait ce garde et sa mutation, motif pour
motif ; c'est le harnais qui l'a dit, en nommant un test qui n'était pas le mien.

✅ **449 FERMÉ le 09/09/2026** — `make: *** [argus-perf] Error 1` est un verdict,
pas une panne : `exitCodeFor` rend 2 sur blocker/critical, 1 sur major. Le
Makefile le disait pour `argus-run`, le SKILL pour personne. 📌 Et le dépôt m'a
corrigé en chemin : ma note a fait tomber un garde de PROXIMITÉ, qu'il fallait
respecter en condensant plutôt qu'en relevant son seuil.

✅ **448 FERMÉ le 09/09/2026** — la règle et la commande qui la vérifie
n'étaient pas dans la même suite : `argus-anchors` ne lance qu'`anchors_test.dart`,
le garde de position vit dans `layout_test.dart`. Un run a muté, relancé la
mauvaise cible, vu VERT, et conclu que son garde était vacant. Le garde dérive
désormais la cible du Makefile plutôt que de la citer.

✅ **447 FERMÉ le 09/09/2026**, premier point du run 68 (Android, terrain sans
API) : le dartdoc de `build:` promettait que le harnais « pose les marges
système ». Il les DÉCLARE (`view.padding` + `viewPadding`) et n'en applique
aucune — un écran monté nu commence à 0,0 dp, contre un inset de 24,0 exigé par
`cropRoot`. Deux consignes inconciliables, qu'un run en aveugle a tranchées seul.
📌 **Le remède qui paraît juste est le pire** : poser le `SafeArea` dans le
harnais mettrait TOUTE racine sous l'inset — y compris celle posée au-dessus du
`SafeArea` de son écran, c'est-à-dire le défaut que `cropRoot` existe pour voir.
Le garde tient donc les deux moitiés, et ses deux mutations le prouvent.

✅ **440 à 446 FERMÉS le 09/09/2026 — backlog vidé DEUX fois dans la journée
(62e et 63e).** Le second vidage est le 446, né de la passe elle-même :
l'outil de republication a crashé pendant qu'on s'en servait pour publier. Quatre
correctifs et deux démentis, rendus par la **paire de confirmation** (runs 66 et
67) que Germinator a demandée plutôt que d'assumer le relevé unique du run 65.

🔴 **CETTE PAIRE A ROUVERT LA SORTIE, et c'est tout son intérêt.** Le run 65
seul rendait « aucun constat » ; deux runs sur deux plateformes et deux terrains
en ont rendu **quatre**, tous dans ce qui est LIVRÉ — donc tous coûtant à qui
applique le skill. La confirmation par plateforme n'était pas une précaution de
principe : c'est elle qui a mesuré.

📌 **Trois des quatre étaient des PARITÉS manquées**, et c'est la classe à
retenir : `icon` laissée derrière `url` et `title` par deux vagues de correctifs
successives (441) ; une entrée mal formée sans message quand sa voisine en avait
un (442) ; un statut lu par le JSON et jamais par le rendu (443). Aucune ne
produit d'erreur — chaque moitié est correcte prise à part.

🔴 **ET LE MOTIF S'EST REJOUÉ DANS LA MÊME PASSE, DEUX HEURES PLUS TARD (446).**
En relançant `check-artefact.mjs` pour republier la page de cette passe, il a
**crashé** : le correctif du 439, la veille, avait rendu son lecteur d'ordre
bruyant sans mettre l'appelant d'accord. L'outil était inutilisable depuis vingt-
quatre heures, et personne ne l'avait vu — *parce que personne ne l'avait
relancé*. Même dépôt, même journée, même cause : aucun garde, aucune CI.
📌 **Fermer le silence d'un instrument ne suffit pas : il faut rejouer ses
appelants.** On remplace sinon un faux vert par une panne, qui se cache aussi
bien tant que rien ne lance l'outil.

⚠️ **Et le quatrième dit autre chose, de pire** : le garde du 440 EXISTAIT,
visait juste, et son propre commentaire racontait l'histoire du défaut qu'il
devait empêcher. **Personne ne le lançait.** Pendant ce temps la CI faisait le
bon geste avec les lints par défaut, donc en aveugle. *Un garde qui n'est jamais
exécuté n'est pas un garde* — et son commentaire donne l'illusion que le cas est
traité, au point que j'ai failli conclure « c'est couvert » en le lisant.

📌 **Deux constats sur six ont été DÉMENTIS par reproduction** (444, 445), tous
deux parce que le skill avait déjà traité le cas — mieux que ce que l'agent
supposait pour la locale. Les garder écrits évite qu'un troisième run les
rouvre.

✅ **439 FERMÉ le 09/09/2026 — backlog VIDE (61e vidage).** Il venait de
l'outillage de suivi (`tools/`, non livré), donc il n'a jamais fermé la sortie.
Le contrôle d'ordre du registre rendait « aucune rupture » **sans rien lire**,
trois republications de suite — **trouvé par Germinator, en regardant la page**.
📌 **Septième fois que la lecture d'un livrable trouve ce que l'exécution ne voit
pas**, et la deuxième fois de suite que l'instrument va bien pendant que l'usage
qu'on en fait ne va pas.

✅ **438 FERMÉ le 09/09/2026 — backlog VIDE (60e vidage).** Il venait de
l'outillage de suivi, pas du skill livré. Le **run 65** (iOS) n'a rendu **aucun
constat**, et c'est précisément ce qui l'a révélé : le run qui peut ouvrir la
sortie est celui que le compteur ne voyait pas.

🔴 **LE CRITÈRE DE SORTIE EST REMPLI SUR LE RUN 65.** Gate `pass`, 7/7 flows,
41/41 ancres, 416/416 gardes d'étage 1, 693 tests du projet — et chaque élément
de son compte rendu passé au critère : aucun ne coûte à qui applique le skill
sans le connaître. ⚠️ **Réserve posée** : le 07/09 demandait une confirmation
**par plateforme** pour que ce verdict ne repose pas sur un relevé unique. Le run
64 (Android) avait rendu le 437, fermé et éprouvé par le 65 — mais aucune
confirmation Android n'a tourné sur le plugin actuel.

✅ **437 FERMÉ le 08/09/2026 — backlog VIDE (59e vidage).** Un garde, une
mutation. Le **run 64** (confirmation Android) a rendu 8 flows, `scope: complet`,
**7/7 écrans visités**, et les correctifs d'application de Germinator ont porté —
mais le seul point qu'il a ouvert **ne vient pas de l'app : il vient de mon
correctif de la veille.**

🔴 **DEUX JOURS DE SUITE, LA MÊME FORME.** Le 429 a ouvert le 436, et le 436
ouvre le 437 : il comparait deux termes sur trois et restait vert pendant que
**59 gardes** de disposition mesuraient un rendu que l'appareil ne produit pas.
*Une correction déplace un mode de panne plus souvent qu'elle ne le ferme* — et
ce qui l'attrape n'est jamais la relecture, c'est le run suivant.

✅ **434 à 436 FERMÉS le 08/09/2026 — backlog VIDE (58e vidage).** Trois gardes,
trois mutations. Le **run 63** (confirmation iOS) a rendu **7 flows,
`scope: complet`**, et neuf correctifs des trois passes ont payé de façon
mesurable — dont le **427**, que deux runs avaient rencontré sans savoir quoi
faire et que le troisième a appliqué à la lettre.

🔴 **LES TROIS POINTS ÉTAIENT LA MÊME ESPÈCE : des instruments qui mesuraient
autre chose que ce qu'ils annonçaient**, et aucun ne produisait d'erreur. Une
page qui se tait, un compteur qui sous-compte les écrans les plus imbriqués, un
harnais qui mesure une police que l'appareil ne rend pas.

🔴 **ET LE PIRE EST NÉ D'UN CORRECTIF JUSTE, FERMÉ LA VEILLE.** Le 429 a fait
charger les polices d'une dépendance — c'était le bon remède, il a rendu 371
tests à une dimension qui se sautait en silence. Il a du même geste ouvert le
436 : rien ne vérifiait que la famille chargée soit celle que l'app RÉSOUT.
*Une correction ne ferme pas un mode de panne, elle le déplace souvent.*

⚠️ **UN GARDE EN PLACE A REFUSÉ UN CORRECTIF JUSTE, pour la quatrième fois du
chantier**, et un second m'a repris sur la tête du backlog que je laissais
mentir. Les deux avaient raison.

✅ **429 à 433 FERMÉS le 08/09/2026 — backlog VIDE (57e vidage).** Cinq gardes,
six mutations. Le **run 62** (confirmation Android) avait rendu 4 flows sur 6 —
les deux rouges étant un défaut de l'app et une absorption d'ancre non résolue.

🔴 **LE DÉFAUT LE PLUS GRAVE ÉTAIT PIRE QUE SON CONSTAT.** Le 431 : la garde de
fraîcheur relevait sa mesure APRÈS le build, qui vient de réécrire la date du
paquet — elle était **vacante par construction** depuis le 343-346, et ne pouvait
plus jamais dire « périmé ». Un run a lu « PAQUET INTACT » en 6 s sur trois
fichiers modifiés ; seul le comptage d'un marqueur l'a démenti.

⚠️ **DEUX CONSTATS SUR CINQ SONT EN PARTIE DÉMENTIS, et j'ai écrit le doublon
avant de le voir — une fois sur deux.** Le 432 : j'ai ajouté une condition qui
existait quatorze lignes plus haut, **neuvième fois du chantier**. Le 433 : même
forme, mais vérifiée AVANT d'écrire, une demi-heure plus tard. *La leçon a tenu
au deuxième essai, pas au premier.*

⚠️ **Et il a fallu QUATRE mutations pour faire tomber un seul garde** (432), les
trois premières visant mon INTENTION au lieu de ce que le garde ASSERTE. Le
harnais a par ailleurs refusé de démarrer sur un fichier non commité — le
garde-fou a fonctionné.

✅ **422 à 427 FERMÉS le 08/09/2026 — 55e vidage.**

✅ **422 à 427 FERMÉS le 08/09/2026 — 55e vidage.**

🔴 **CE QUI A COÛTÉ LE PLUS N'EST AUCUN DES SIX : c'est ce que la passe a trouvé
en les fermant.** Quatre gardes ont refusé un correctif juste ou une mutation à
côté, et chacun avait raison — le **417** sur mon propre commentaire, le **239**
sur un marqueur qui dérivait de ce qu'il ancre, le **410/413** sur une phrase
poussée hors de sa fenêtre, le harnais sur une mutation qui ne mutait pas la
valeur gardée. Et **mon script d'édition est tombé deux fois dans le piège que le
marqueur du 424 ferme** ; il a levé avant d'écrire, ce qui est la seule raison
pour laquelle rien n'a été détruit.

📌 **Un motif trop large a failli me faire AGIR à tort** : le garde du 425
signalait `launch-clean.yaml`, qui emploie l'ancre de départ pour ATTENDRE
l'écran de départ — son rôle exact. Attendre n'est pas aiguiller.

🔴 **LA SORTIE : il faut une confirmation de plus.** Le critère se juge sur le
DERNIER run, et rien de ce qui vient d'être écrit n'a été éprouvé en aveugle.

✅ **415 à 421 FERMÉS le 08/09/2026 — 54e vidage.** La passe a
rendu **8 gardes** et **12 mutations**, chacune vérifiée en tombant. Un seul des
sept était un défaut de code (**415**), un était **FAUX** (**418**), cinq étaient
des informations exactes au mauvais endroit.

🔴 **UN CONSTAT SUR SEPT ÉTAIT DÉMENTI, ET IL ACCUSAIT UN CORRECTIF DÉJÀ ÉCRIT.**
Le **418** reprochait au §3g d'envoyer dériver `startTimeoutMs` de
`firstLaunchMs` sans dire que la grandeur n'existe pas sur iOS. Mesuré sur le
SKILL **tel que le run l'a lu** (`cca3076`, deux heures avant lui) : la
prescription portait déjà « Sur Android », le bloc « SUR iOS, `firstLaunchMs`
N'EXISTE PAS » était là depuis le 01/09 (279), et `startupMarginWarning` imprimait
déjà la dérivation iOS — le tout gardé dans les deux sens. Le run a même repris
la formulation du correctif (« à neuf cents lignes d'ici ») pour décrire le manque
qu'elle décrit. 📌 *Le symptôme restait vrai* : 34 lignes séparaient la
prescription du bloc qui la borne, et un lecteur iOS applique la première avant
d'atteindre la seconde. C'est ce qui a été corrigé, pas ce qui était demandé.

⚠️ **LE HARNAIS M'A REPRIS DEUX FOIS, ET UNE MUTATION A MENTI UNE FOIS.**
- Mon garde **419** cherchait le résidu N'IMPORTE OÙ dans sa section : retirer la
  phrase qui l'explique le laissait vert, la commande de nettoyage portant le même
  mot vingt lignes plus bas. Les deux RÔLES sont maintenant séparés — la prose qui
  dit ce que c'est, le geste qui l'efface — et chacun a sa mutation.
- Ma mutation **420 b** a rendu « motif trouvé 0× » : l'apostrophe est échappée
  dans le source JS. Le harnais a refusé de conclure au lieu de rendre un
  « garde vacant » — c'est la différence entre un instrument et un chiffre.
- ⚠️ Et la mutation du **192**, que le 416 obligeait à déplacer, a d'abord été
  ré-ancrée **au mauvais endroit** : elle réécrivait la ligne rendue alors que la
  lecture de `.icon` avait migré deux lignes plus haut, dans la fonction extraite.
  Elle a donc cessé de prouver ce pour quoi elle existait et est tombée sur le
  garde NEUF, ce qui se lit comme un succès. Vérifié à la main — mutation
  appliquée, garde des clés mortes joué seul, restauration prouvée — puis
  ré-ancrée sur la lecture.

📌 Les correctifs du 07/09 ont payé : le **401** attrape une ancre fusionnée à
l'étage 1 SANS device (deux runs de suite), le **413** fait trouver les canaux
sortants que le run 57 avait manqués, le **410** est appliqué mot pour mot.
Les comptes rendus des runs sont dans `~/.argus-etalon/run59-constats.md` et
`run60-constats.md`.

🔴 **CE QUI RESTE EST LA SORTIE, ET UNE CONFIRMATION DE PLUS.** Le critère se juge
sur le DERNIER run : la passe qui vient d'être faite n'a pas encore été éprouvée
par un run en aveugle.

### Verdict précédent — les runs 57 et 58

✅ **406 à 414 FERMÉS le 07/09/2026.** La passe de
CONFIRMATION (runs 57 et 58) a trouvé un **faux vert** que deux runs indépendants
ont produit par deux causes différentes : un run qui n'exécute AUCUN flow rend
`exit 0`. La sortie reste donc fermée. ✅ Mais le garde 401, né le matin, a fait
corriger deux ancres **à l'étage 1, sans device** — le défaut que les runs 55 et 56
avaient dû diagnostiquer sur appareil.

### Verdict précédent — les runs 55 et 56

✅ **400 à 405 FERMÉS le 07/09/2026.** Les runs
**55 et 56** ont été joués en parallèle, iOS sur le projet à API et Android sur
le projet hors ligne, par deux agents vierges qui s'ignoraient. Ils ont trouvé
**indépendamment le même défaut de fond** (401) : une ancre peut être présente,
active, et désigner le mauvais rectangle — l'étage 1 la valide, seul l'appareil
le voit. Deux constats de leurs comptes rendus n'ont PAS été inscrits, la
reproduction les ayant démentis.

📌 **Et le 400 était déjà gardé.** Le job `harness` porte depuis le 22/08 un
`dart format --set-exit-if-changed test/argus scripts`, écrit précisément pour
qu'un fichier du cadre non formaté ne rende pas rouge la CI de l'hôte. Il n'a
jamais tourné : la CI attend la PR. *Un garde qu'on n'exécute pas ne garde rien*
— et le niveau 1 de la séquence de sortie l'aurait trouvé sans aucun run.

### Verdict précédent — rendu le 07/09/2026 sur les runs du 05/09

🔴 **LA SORTIE RESTE FERMÉE, et c'est iOS qui la
ferme.** Le critère du 26/08 se juge sur les constats du dernier run ; les
derniers sont les deux du 05/09, joués en parallèle sur les deux plateformes.
Sur leurs sept constats, **trois coûtent** :

- **381** — `clearState` ne remet rien à zéro sur iOS : premier flow 78-142 ms,
  tous les suivants ~20 200 ms, et **l'échec accuse une ancre correcte** ;
- **382** — l'alerte système des notifications fait tomber les cinq flows
  suivants, l'accueil rendu derrière elle pendant que le flow annonce l'ancre
  introuvable ;
- **384** — une sentinelle qui attend `real` sous `zsh` **bloque la chaîne
  entière sans message** : c'est le 176 à l'identique, l'exemple même que le
  critère cite comme ce qui ferme la sortie.

Les trois autres ne coûtent que du temps de lecture — **383** est à la
frontière (une dimension abandonnée sur une croyance fausse), **385** et **386**
sont des consignes sans endroit où s'appliquer. Le septième est un **démenti** :
le skill était juste.

⚠️ **AUCUN DES TROIS N'EST UN DÉFAUT ANDROID**, et c'est ce que le classement
fait apparaître plutôt que le comptage. 381 et 382 sont iOS ; 383 et 384 sont
l'environnement du poste. La décrue côté Android est nette : le run 50 rendait
**cinq** constats qui coûtent — 375 publiait 20 021 ms d'un flow mort en
« l'écran met 20 s », 376 rendait le contrôle Firebase muet sur la disposition
standard d'AGP, 377 n'offrait aucune issue praticable, 378 brûlait 32 s
d'appareil pour une référence sur deux, 379 perdait deux flows — quand le run 51
n'en rend **aucun** en propre.

Côté iOS le compte est tout autre : **trois passes seulement** en cinquante-deux
(les runs 31, 47 et celui du 05/09), et la dernière découvre que la règle
anti-flake fondamentale du harnais ne fait rien sur la plateforme. C'est la
maturité d'un chantier jeune, pas d'un chantier qui sort. 📌 Le skill annonce
honnêtement les dimensions qu'iOS ne couvre PAS (table §« Ce que chaque
plateforme reçoit vraiment ») ; ce que rien ne dit encore, c'est que le peu
qu'il couvre y a été bien moins éprouvé.

⚠️ **ET UN VOLET DE L'ANGLE MORT N'A JAMAIS ÉTÉ FERMÉ.** Le verdict précédent
nommait trois choses sous « le serveur qui varie ». Deux sont traitées — où
passer les secrets (`secrets_from_env`, passage par `-e`) et l'état qui ne
revient pas (**373**). La troisième — **distinguer « l'app est cassée » de « le
serveur refuse »** — rend **zéro occurrence** sur tout le skill, scripts et
assets compris ; contre-épreuve faite, le mot « serveur » y vit dans quatre
fichiers et les seuls `500`/`503` sont des millisecondes. Le 373 s'annonce comme
« le dernier des deux angles morts » et n'en a refermé qu'un tiers : ce qui
restait n'était pas UN angle mort mais trois, dont deux seulement ont été vus.

✅ **CE QUI OUVRIRAIT LA SORTIE** : une passe de confirmation **par plateforme**,
avec 381 et 382 en place — iOS d'abord, puisque c'est elle qui décide, et une
seconde sur Android pour que « aucun constat qui coûte » ne repose pas sur un
relevé unique. Une seule passe couvrant les deux plateformes suffirait si le
terrain s'y prête.


✅ **Backlog vide.** Le 373, seul point jamais laissé ouvert de ce chantier, est
fermé le 05/09 — et ce qui l'a tenu ouvert n'était pas sa difficulté.

⚠️ **La phrase qui suit décrit la passe du 04/09 au matin**, et elle reste vraie à
sa date. Elle ne décrit plus l'état présent, et pendant quelques heures elle a
affirmé le contraire de ce que le fichier portait trente lignes plus bas. C'est
le motif que ce document traque partout ailleurs : une affirmation juste le jour
où on l'écrit, fausse le lendemain, et que **rien ne pouvait signaler** — le
compteur de vidages compte des **événements passés**, donc il ne peut par
construction rien dire de l'état *présent*. Un garde le tient désormais : le
nombre annoncé ici doit égaler celui que le corps du fichier porte.
📌 Trouvé par Germinator **en regardant l'artefact**, où le 373 s'affiche
« ouvert » pendant que le backlog se disait vide. Sixième fois que la lecture
d'un livrable trouve ce que l'exécution ne voit pas.

Les points **366 à 372** sont fermés le 04/09/2026 — backlog vide pour la
**quarante-sixième** fois. Le run 49 rejouait le 48 sur l'**API locale**, pour
lever l'erreur de cadrage qui avait tué son verdict device.

🔴 **L'ÉTAGE 2 N'A PAS TOURNÉ NON PLUS, et cette fois la cause était la mienne.**
`INSTALL_FAILED_INSUFFICIENT_STORAGE` : j'avais laissé `/data` à 92 % exprès,
pour exercer le 362 écrit le matin même. Il l'a été — et l'émulateur était
irrécupérable : neuf sessions de mise à jour Mainline que `pm install-abandon`
refuse de toucher (`Session does not belong to uid 2000`). Diagnostic complet et
honnête de l'agent. ⚠️ Son compte rendu ne dit pas s'il a essayé d'installer la
**release** (63,7 Mo contre 127,8), la sortie que `device-matrix` prescrit et
que le run 48 avait employée — reste à vérifier.

🔴 **367 — UN RUN INTERROMPU SE RENDAIT EN VERT.** `run.mjs` écrit
`incomplete: true` **exprès**, pour qu'on ne lise pas ses chiffres ; `report.mjs`
ne regardait ni ce champ ni `status`, et la page annonçait « Parcours Maestro —
exécutée, aucun finding » sur **six dimensions device dont aucun flow n'avait
démarré**. Pire : le gate ne se calculait que sur les sévérités, donc un run qui
n'a pas tourné rendait **`pass`** dès que les autres relevés étaient propres.
Celui-ci n'a échoué que parce que `sec` avait trouvé autre chose.
📌 C'est le stub sur lequel je m'appuyais la veille en disant « sans lui j'aurais
conclu à un run vert ». La page me l'aurait dit **en vert**.

⚠️ **366 — ET MON PROPRE CONTRÔLEUR AVAIT L'ANGLE MORT QU'IL SURVEILLE.** Il
dérivait le prochain numéro libre des seuls titres `### n.`, or un point clos
sans passer par le backlog n'en a pas : il annonçait 347 quand le fichier disait
366, et rendait ✔ sur un compteur périmé.

Les cinq autres (**368-372**) : deux schémas au vocabulaire commun sans champs
communs (26 erreurs de compilation) · une app authentifiée a **deux racines** ·
le **scan QR** qu'aucun flow ne peut produire · l'**acquittement** qui manquait
aux findings de sécurité, avec son expiration · et une **parité** de plateforme
qu'un contrôle honorait et pas son voisin.

### 373. ✅ Fermé le 05/09/2026 — et sa condition de clôture était IMPOSSIBLE

**Né le 04/09/2026 d'une question de Germinator, fermé le 05.** C'était le dernier des
deux angles morts structurels — l'authentification multi-écrans a été fermée par
le 357, celui-ci ne l'est pas.

La §1 porte une alerte en tête, et elle est juste : « une suite de six flows en
consomme six, et elle se fait couper au milieu » — le **quota** d'envoi d'un code.
Mais un quota **se recharge** : on attend une minute, la suite repart. Rien, nulle
part, ne parle d'un état serveur qui **ne revient pas** — un compte qui n'a pas
encore créé son code secret, un code d'invitation, un stock, une commande qu'on
ne peut passer qu'une fois. Le premier run est vert, le second rouge, et **rien
dans le rapport ne distingue ça d'une régression**.

⚠️ **Et le geste qui protège l'isolation est celui qui consomme** : `clearState`
s'exécute avant chaque flow. Ce qui garantit qu'un flow ne dépend pas du
précédent est exactement ce qui le fait repayer l'état serveur.

**Ce que le skill web en fait — mesuré, et ce n'est pas une réponse.**

- Son `ENV=staging` autorise les écritures « SI comptes de test dédiés, données
  préfixées `qa_`, **opérations idempotentes, nettoyage après coup** ». Les deux
  dernières conditions **manquent au mobile**, dont la matrice §3 ne pose que
  `données qa_`. L'emprunt est à faire et il est petit.
- Mais « opérations idempotentes » **exclut** le cas au lieu de le traiter : un
  parcours de création de code secret n'est pas idempotent par nature, donc la
  règle reviendrait à dire « ne le teste pas » — ce qui n'est pas une réponse
  quand c'est précisément le parcours qu'on veut couvrir. Et « nettoyage après
  coup » suppose de pouvoir **défaire**, donc d'administrer le backend : la
  limite que les deux plugins s'interdisent explicitement (« tu consommes l'API,
  tu ne l'administres pas »).
- 📌 **Le web s'en tire par CONSTRUCTION, pas par sagesse.** Son harnais se
  connecte **une seule fois** et sérialise le contexte (`storageState`), que tous
  les projets réutilisent ; le mobile reconnecte à chaque flow. La question se
  pose donc beaucoup plus fort ici, et c'est pour ça qu'elle n'a pas de réponse
  ailleurs à copier.

**Le critère existe déjà, appliqué au mauvais objet.** Le skill demande « un flow
peut-il y arriver **deux fois de suite** ? » — mais pour écarter des ÉCRANS de
`screens[]`. Appliqué aux FLOWS, c'est le remède ; l'écrire n'est donc pas
inventer une règle, c'est finir celle qui existe.

**Trois issues, à trancher par l'utilisateur et à ÉCRIRE** — aucune n'est bonne
dans l'absolu, comme pour le flow derrière la connexion :
- une commande de remise à zéro que le projet **fournit et assume**, que le
  runner joue avant le flow — le plugin l'exécute, il ne la devine jamais ;
- le flow sort de la suite de régression et se lance à la main ;
- le parcours est joué **une fois en EXPLORE**, et n'entre jamais en REGRESS.

🔴 **NE PAS L'ÉCRIRE AVANT DE L'AVOIR VÉCU.** Six constats du 04/09 ont été
démentis parce qu'ils décrivaient un mécanisme qu'on n'avait pas exercé. Un
second compte de test, **neuf**, sera fourni sur le terrain qui consomme une API :
le prochain run rencontrera le cas pour de vrai, et ce qu'il fera — ou ratera —
dira quelle case manquait vraiment.

🔴 **CE QUI L'A TENU OUVERT N'ÉTAIT PAS SA DIFFICULTÉ — C'ÉTAIT MA CONDITION.**
J'avais écrit : « se ferme quand un run aura joué le parcours de création **puis
l'aura REJOUÉ** ». Or rejouer exige de remettre l'état à zéro, donc
d'**administrer le backend** — ce que `PROMPTS.md:185` interdit à l'agent en
toutes lettres. *Une condition qui exige un geste qu'on interdit ne peut jamais
être remplie* : elle ne se vérifie pas, elle attend indéfiniment. C'est la
quatrième façon de naître vacant — guetter un phénomène que le code interdit par
construction — appliquée non à un test mais à un **critère de sortie**.

✅ **ET LA RÉPONSE ÉTAIT DÉJÀ LÀ, RENDUE DEUX FOIS.** Les runs **50** et **52**,
en aveugle, sur deux passes sans rapport, ont rencontré le cas et rendu la MÊME
décision sans qu'on la leur prescrive : écrire le parcours, le taguer `manual`
pour le sortir de la suite, **ne pas le lancer**, et rendre l'arbitrage à qui
possède les données. Le 52 a même trouvé l'endpoint de remise à zéro et **refusé
de l'appeler** — « administration du backend, hors de mon périmètre ». C'est la
convergence de deux agents indépendants, le signal le plus fort qu'une paire de
runs sache donner, et il attendait qu'on veuille bien le lire.

Le skill porte désormais les **trois issues**, avec ce que les runs y ont ajouté :
la commande de remise à zéro doit être **DÉCLARÉE PAR L'UTILISATEUR** au cadrage,
puisque l'agent ne peut ni la découvrir ni l'appeler. Et il porte la leçon sur le
critère lui-même, pour qu'on ne la repose pas ailleurs.

📌 Ce qui se mesure ici est ce que l'agent **DÉCIDE** devant un parcours à usage
unique — pas ce qu'il parvient à rejouer.

### 374-379. Le run 50 — deux verdicts rendus sur la moitié des preuves

**Fermés le 04/09/2026 au soir.** Le premier run joué sur l'AVD de remplacement,
et le premier à rencontrer le 373 pour de vrai.

🎯 **LA QUESTION DU CADRAGE A SERVI.** L'agent a identifié seul que le compte de
test neuf **consomme un état que le serveur ne rend pas**, a écrit son flow, l'a
tagué `manual` pour le sortir de la suite, et **ne l'a jamais lancé** — en rendant
la décision. Il a même trouvé l'endpoint de remise à zéro et **refusé de
l'appeler** : « administration du backend, hors de mon périmètre ». C'est la
troisième issue que le 373 listait, trouvée sans qu'on la prescrive.
📌 Et il a affiné le point : la première issue — « une commande de remise à zéro »
— ne peut pas être *découverte* par l'agent, elle doit être **déclarée par
l'utilisateur**, sinon elle est hors de sa limite.

🔴 **DEUX VERDICTS RENDUS SUR LA MOITIÉ DES PREUVES**, et le premier est de moi,
écrit le matin même. `sec.mjs` et `sca.mjs` partagent `security.acknowledged`
sans partager leurs findings : chacun déclarait **périmés les acquittements de
l'autre**. Mesuré : « acquittement PÉRIMÉ : QAM-SEC-CLEAR » imprimé par `sca`
pendant que `sec` l'honorait, dans le même rapport. *Un relevé ne peut pas juger
ce qu'il ne mesure pas* — le verdict appartient à `report.mjs`, seul à voir
l'union. ⚠️ Le garde livré avec le défaut exerçait `acquitter` **en isolation**,
jamais deux appelants partageant une table.

Le second : **`QAM-START` prenait son pire cas sur des flows FAILED**. Un flow
qui expire a mesuré **son propre plafond**, pas l'écran — 20 021 ms d'un flow mort
sur une erreur d'application publiés en « l'écran de départ met 20 s », pendant
que les six autres tenaient entre 947 et 2646 ms. Le code **connaissait** le
statut (il le comptait dans `timedOut`) et ne s'en servait pas. Les échantillons
censurés sont désormais exclus **et nommés**.

**376** — le contrôle Firebase cherchait un chemin **littéral**, donc il était
muet sur toute application dont le flavor range le fichier dans son source set,
la disposition standard d'AGP. Le mécanisme était dérivé ; son **emplacement**
était énuméré. ⚠️ Et mon premier correctif partait **inerte** :
`fichiersSous(dir, [])` filtre par `extensions.some(...)`, qui rend `false` sur
une liste vide — il aurait rendu zéro fichier en ayant l'air corrigé.

**377** — des trois issues offertes au « flow qui a besoin de la connexion sans
l'inclure », **aucune n'était praticable** : la première demande d'éditer
`visual.yaml`, qui est du CADRE. La seule qui marche — poser la connexion dans
`goto.yaml`, qui appartient au projet — n'était nommée nulle part. Un run l'a
payée, puis a défait.

**378** — `visual: true` et `reachedBy:` se contredisent **en silence** :
`visual.yaml` appelle `goto` quoi qu'il arrive, donc la référence naît sur l'écran
où `goto` s'est arrêté. Ni erreur, ni avertissement. 32 s d'appareil et une
référence sur deux.

**379** — « Sur Android le même appel est inoffensif » : **faux**. Maestro 2.8.0
refuse `hideKeyboard` sur API 30 (« Couldn't hide the keyboard »), deux flows
perdus. Une promesse de comportement que rien ne mesurait.

🔴 **UN CONSTAT SUR SEPT EST DÉMENTI** — le run signalait que rien ne dit quoi
faire quand `firstLaunchMs` est très inférieur à l'attente réelle. C'est écrit
**deux fois** : dans le SKILL (« si `startup.samples` vaut plusieurs fois
`firstLaunchMs`, c'est `startup.samples` qui commande », avec le même ordre de
grandeur) et dans le message du runner lui-même (« pas de `firstLaunchMs` »).

⚠️ **DEUX GARDES ANCIENS SONT TOMBÉS SUR CES CORRECTIFS JUSTES**, et la pente
était de les supprimer : l'un figeait l'ancien dénominateur `3/3`, l'autre
**citait** le libellé « Trois issues » — devenu faux le jour où une quatrième a
été ajoutée. Tous deux **étendus** : le second compte désormais les issues.

📌 **Ce que le run a trouvé DANS le projet, et qui n'est pas du plugin** : le
`catch` d'initialisation n'a qu'un seul destinataire, `Sentry.captureException`,
et le flavor de développement n'initialise jamais Sentry. Un échec d'init ne
laisse donc **aucune trace** dans l'environnement où l'on développe — le
commentaire du code promet pourtant l'inverse. Remonté à Germinator.

⚠️ **Et deux gestes de MON cadrage ont coûté** : l'URL de republication venait de
ma mémoire et **la page n'existait plus** (le run a mesuré, refusé de deviner
laquelle la remplaçait, et publié une page neuve) ; et j'avais **dicté le titre**,
que le skill sait dériver — `report.mjs` fait `ident.title || titreDuRapport(run)`,
donc une valeur dictée écrase le dérivé. Le skill et le run étaient justes.

### 380. Le registre de la page se lit comme ORDONNÉ, et rien ne le vérifiait

**Fermé le 04/09/2026 au soir.** Germinator a lu « 373 · ouvert » posé **après**
374-379 dans le tableau de la page publiée. C'est la **deuxième fois** — la
première signalée le 02/09 (« deux sections étaient dans le désordre ») — et les
deux fois c'est un **lecteur** qui l'a vu : la page est valide, chaque ligne est
juste, les compteurs restent exacts. Un registre n'est cherchable que parce qu'on
suppose qu'il croît.

`check-artefact.mjs` refuse désormais une page en rupture. ⚠️ **La moitié qui
compte est le BORNAGE** : la page porte d'autres tableaux dont la colonne `id`
décroît volontairement (les réponses du device vont de 10 à 8). Un contrôle non
borné y verrait trois ruptures et crierait au loup sur du contenu juste. Et une
plage se compare par sa **borne haute**, sinon `374-379` paraîtrait rompre
l'ordre avec la ligne suivante.

### 381-385. Les runs 51 et 52 — et `clearState` ne remettait rien à zéro sur iOS

**Fermés le 05/09/2026.** Deux runs en parallèle, Android sur le terrain sans API
et iOS sur celui qui en consomme une.

🔴 **381 — LE DÉFAUT LE PLUS LOURD TROUVÉ SUR UNE PLATEFORME.** `launch-clean.yaml`
appelait `clearState` « la première règle anti-flake mobile » et promettait, pour
iOS, « Maestro RÉINSTALLE l'app (plus lent, mais **état vraiment neuf**) ». C'est
faux : les jetons vivent dans le **trousseau**, qui SURVIT à la suppression de
l'app — là où le `pm clear` d'Android les emporte. Mesuré sur quatre passes,
trousseau vidé à la main juste avant : **premier flow 78-142 ms** sur l'écran
d'identification, **tous les suivants ~20 200 ms**, parce que l'app y démarre
après la connexion. La règle tombait en silence sur toute la plateforme, et
l'échec accusait une ancre correcte — le pire verdict que ce harnais sache
produire. Le geste ne peut pas vivre dans le sous-flow (sandbox sans shell) : il
appartient au runner, comme la coupure des animations côté Android, et il est
câblé **avant** les flows — après, il ne servirait qu'au run suivant.

🔴 **382** — `permissions.all: allow` **ne couvre pas** l'alerte système des
notifications sur iOS 26.3. Un seul flow qui la laisse ouverte fait échouer les
cinq suivants, et la capture montrait l'accueil **entièrement rendu derrière
elle** pendant que le flow rapportait l'ancre introuvable. Le geste est
documenté avec sa **PLACE** — `goto.yaml`, qui appartient au projet, le sous-flow
étant du cadre — et avec le `when:` qui le rend rejouable.

**383-385, trois instruments qui mentent.** `command -v aapt2` rend « ABSENT » sur
une machine équipée (l'outil vit dans `build-tools/` du SDK) — **deux runs
indépendants s'y sont fait prendre le même soir**, ce qui est le signal le plus
fort qu'une paire de runs sache donner ; sous `zsh`, `time` n'imprime pas `real`
mais « … cpu … total », et une sentinelle qui l'attend **bloque la chaîne entière**
sans message ; et « relève TON point sur TA capture » suppose une capture que
seul le premier run produit.

⚠️ **EN ÉCRIVANT LE 383, J'AI CITÉ UNE COMMANDE QUI N'EXISTE PAS** (`config.mjs
--doctor` ; la cible s'appelle `make argus-doctor`). Le garde ne vérifie donc pas
cette phrase-là : il **dérive toutes** les cibles `make` que le skill prescrit et
exige qu'elles existent dans le Makefile livré. La classe, pas le cas.

⚠️ **ET LE GARDE DU 256 M'A REPRIS SUR LE POINT MÊME QU'IL SURVEILLE** : mon
exemple du 382 était écrit en map de flow (`{ visible: … }`), que le parseur
refuse. Maestro l'accepterait, mais un exemple se recopie. Récrit en bloc, garde
intact.

🔴 **UN CONSTAT SUR SEPT EST DÉMENTI** — le run 51 signalait que `report.json` est
tronqué au démarrage « et rien ne le dit ». C'est écrit sur **douze lignes** à
l'endroit exact (`run.mjs:1847`), né du septième run : le rapport précédent ne
doit pas survivre, sinon il se lit comme frais.

📌 **Trois gestes de MON cadrage ont coûté, et jamais le skill** : le run 51 a émis
de la **télémétrie dans le projet de monitoring réel** pendant deux passes device,
parce que mon prompt omettait le point que `PROMPTS.md:152` demande explicitement
(constat **349**) — 7 des 8 points couverts, et le huitième était le seul à effet
sortant. Avant lui : l'API du run 48, l'URL périmée et le titre dicté du run 50.
La procédure porte désormais un geste de plus, **avant** d'écrire le prompt :
dériver la liste du gabarit au lieu de la reconstituer.

📌 **Ce que les deux runs ont bien fait** : le 52 a **refusé de générer les
références visuelles** sur une suite instable (« figer une capture d'un flow dont
on n'a pas prouvé qu'il tourne rend vert pour toujours ce qu'elle a photographié
de travers ») et rapporté la dimension **non exécutée**, pas verte ; il a refusé
de relever `startTimeoutMs` malgré l'invite du runner, la capture montrant que les
20 s n'étaient pas de la lenteur ; et **les deux ont exercé le compte neuf hors
suite sans le brûler**, en rendant la décision. Le 51 a appliqué la consigne de
charge à la lettre — 4312 ms contre 4000, mais `loadAvg` 9,25 et pic 15,34 :
« je n'en conclus rien sur l'application ».

### 386. « Note ici la commande de release » — sans endroit où la noter

**Fermé le 05/09/2026.** Le gabarit demandait de chercher la commande de release
dans le dépôt « et de noter ici celle que tu as employée », sans dire **où ni sous
quelle forme**. Deux runs s'y sont arrêtés : l'un a trouvé sa commande dans un
`SENTRY.md §7` et n'a pas su où la reporter ; l'autre a **créé une clé** pour la
porter, puis l'a **retirée** en mesurant qu'aucun script ne la lit — et il avait
raison, une clé morte se relit comme un geste outillé alors qu'il ne l'est pas.
La forme est désormais écrite (`# construit par : <commande>  (source : <fichier
§>)`), et le garde exige aussi que **la source** y soit : sans elle, le suivant
cherchera au même endroit que toi, et ce n'est jamais le même selon les projets.

### 387-393. Le run 53 — la vérification qui trouve la MOITIÉ manquante d'un correctif

**Le run de confirmation iOS**, joué le 07/09 sur le terrain à API, sans qu'un mot
du cadrage ne souffle 381 ni 382. Cinq passes, ~20 min 40 de simulateur sur 60, et
la progression dit que les remèdes portent : pire attente sur l'écran de départ
**20 268 ms → 45 205 → … → 101 ms**, dernière passe **7/7 flows verts**,
`gate: pass`, scope « complet ». Instrumentation partie de zéro : 14 racines / 14,
19 commandes / 19. Aucun DSN Sentry dans le kernel — la consigne de télémétrie a
tenu. **Six constats sur sept reproduits, un démenti.**

🔴 **387 — MON CORRECTIF DU 381 N'EN COUVRAIT QUE LA MOITIÉ.** `resetKeychain` a
**un seul site d'appel** (`run.mjs:1933`), dans la préparation du run, avant la
boucle des flows. Or `clearState`, lui, s'exécute **avant chaque flow**. Le
trousseau est donc vidé une fois : le premier flow part d'une app vierge, s'y
connecte, écrit son jeton — et **tous les suivants démarrent connectés**, sur
l'écran d'après-connexion, où ils échouent sur l'ancre de départ à trois écrans de
la cause. Le commentaire du correctif décrit exactement ce symptôme et le traite
une seule fois. *Le correctif était local, le défaut est une manière de raisonner :
ce qui isole doit s'exécuter à la même cadence que ce qu'il isole.*

🔴 **388 — LE GESTE QUI FERME L'INVITE SYSTÈME N'EST PAS LÀ OÙ ON L'ÉCRIT.** Le
382 documente le geste **avec sa place** — `goto.yaml`, qui appartient au projet —
mais il ne le documente QUE dans le commentaire de `launch-clean.yaml`, qui
appartient au cadre. Contre-épreuve : le mot « alerte » vit dans **deux** fichiers
du scaffold, et `goto.yaml` n'en fait pas partie. L'agent a donc dû retrouver le
geste seul, et il l'a posé **dans le fichier du cadre** — donc écrasé à la
prochaine mise à jour. ⚠️ Et son relevé ajoute ce que le 382 ne disait pas :
**l'invite ne suffisait pas seule**. L'invite et le trousseau sont deux causes
distinctes d'un même symptôme, et l'échec accuse une ancre correcte dans les deux
cas — donc rien ne les sépare tant qu'on n'a pas traité les deux.

🔴 **389 — LES TROIS CAUSES DE `startupHint` EN MANQUENT UNE, ET C'EST CELLE QUI
EST ARRIVÉE.** Le message énumère « l'app ne démarre pas · l'écran est lent ·
l'ancre est fausse ». Le cas du run n'est aucun des trois : l'app démarre, l'écran
arrive, l'ancre est juste — mais **ce n'est pas l'écran qu'on croit**, parce
qu'une modale système le couvre ou qu'une session a survécu. Le lecteur regarde la
capture comme (1) le lui dit, n'y voit pas d'erreur d'application, et passe à (2) :
relever le plafond. **Le run l'a fait deux fois.** ⚠️ Et le tell était dans les
chiffres : la pire attente s'est collée au plafond à ~200 ms près **deux fois de
suite** (20 268/20 000 puis 45 205/45 000) — signature d'un écran qui n'arrive
JAMAIS, pas d'un écran lent. Même famille que le **343** : une énumération de
causes qui manque la plus fréquente.

🔴 **390 — `lifecycle.yaml` INCLUT `login.yaml` SANS LE DIRE**, et ses assertions
post-authentification sont gardées par la **déclaration** de l'ancre
(`typeof ARGUS_ANCHOR_AFTER_AUTH !== 'undefined' && !== ''`), jamais par
l'existence d'une session. Sans connexion elles s'exécutent quand même et
échouent. Sur un terrain à quota d'OTP, ce `runFlow` invisible consomme en plus un
second envoi et contamine les flows suivants.

🔴 **391 — LES 117 GARDES ROUGES DE L'ÉTAGE 1 NE REMONTENT PAS DANS LE RAPPORT, ET
LA PAGE PUBLIE `gate: pass`.** `report.mjs` lit cinq relevés de dimensions et
**aucun résultat de `flutter test`** : il ne parle de l'étage 1 que pour la
*couverture*, jamais pour ses findings. Le run a mesuré 117 échecs réels —
14 labels de cible, 12 contrastes, 12 cibles < 48 dp, 42 troncatures, 8
débordements, dont `home_account` à **40×40 dp** et un contraste à **2,83:1** — et
la page publiée annonce **un run vert sur deux findings info**. C'est le pire mode
de panne d'un harnais de non-régression, et c'est la seconde fois que ce chantier
le rencontre après le **367**. ⚠️ Le run, lui, a refusé d'inscrire ces 117 en
dette : « les inscrire aurait rendu la suite verte sur 117 défauts réels et non
lus ». Il les a laissés rouges. C'est le harnais qui ne les a pas publiés.

🟠 **392 — LE CHEMIN DU BINAIRE iOS NE DIT PAS CE QU'UN FLAVOR Y CHANGE.** Le
scaffold livre `ios: build/ios/iphonesimulator/Runner.app` ; avec un flavor Flutter
écrit sous `Debug-dev-iphonesimulator`, et le défaut pointe alors un chemin qui
n'existe pas. L'information EXISTE — `SKILL.md` §3g décrit la cohabitation
`Debug-*-iphonesimulator` / `iphoneos` — mais pas à la clé qu'on remplit. L'échec
est bruyant (« AUCUN PAQUET à cet emplacement »), donc le coût est du temps de
lecture, pas un faux verdict.

✅ **393 — DÉMENTI : les blocs YAML sont refusés avec un message qui nomme la
ligne.** Le run signalait que `config.mjs` casse sur un bloc `|` et que le
sous-ensemble « est documenté 780 lignes plus haut ». Reproduit **en exécutant**,
sur une copie du scaffold : le parseur rend `✖ argus.mobile.yaml:731 — bloc
multi-lignes (| ou >) non supporté` avec la ligne fautive affichée, et la forme
repliée en quotes rend `valeur sur la ligne ET bloc indenté en dessous`. Le
sous-ensemble accepté ET refusé est écrit en tête du fichier, et il porte déjà la
phrase « une valeur tient sur UNE ligne ; si elle est longue, raccourcis-la ».
*Appliquer le remède aurait ajouté ce qui existait déjà, pour la huitième fois.*
Résidu vrai et plus étroit : le commentaire d'`evidenceAcknowledged` invite à
écrire une phrase sans rappeler la contrainte d'une ligne.

🔴 **394 — NÉ DE LA PASSE : LE GARDE DES SÉLECTEURS ACCUSAIT UN FLOW JUSTE.** En
écrivant l'exemple du 388, un garde ancien m'a repris — tout sélecteur `text:`
doit être encadré (`'(?s).*Libellé.*'`), parce qu'un nœud Flutter fusionne le
texte qu'il recouvre. Il avait raison. Mais il dépouille le `#` de **début** de
ligne et jamais celui de **fin** : `text: '(?s).*Valider.*'   # le bouton` était
rapporté comme NU, puisque la valeur extraite ne se termine plus par `.*'`. C'est
un **faux positif**, donc le pire des deux sens — il envoie « corriger » ce qui
est déjà juste, et sur un fichier du projet, pas du cadre. Troisième fois que ce
chantier retire des commentaires par la gauche en oubliant ceux de fin de ligne.
Remède : un balayage **gauche à droite** qui respecte les quotes — une regex
`#.*$` couperait au premier `#` du motif lui-même. Gardé dans les deux sens, y
compris « un `#` DANS le motif ne termine pas la valeur » et « un motif nu reste
nu ».

### 395-399. Le run 54 — la seconde vérification, et TROIS constats sur cinq démentis

**Fermés le 07/09/2026** — cinquante et unième fois que le backlog se vide.

**La confirmation iOS jouée sur le plugin corrigé une heure plus tôt.** Dix
passes, ~22 min sur 60, gate **pass** — 0 blocker / 0 critical / 0 major /
0 minor / 1 info, 7/7 écrans, 568 tests du projet verts, aucun DSN, aucun
identifiant dans la page.

✅ **LES TROIS CORRECTIFS DU MATIN ONT PORTÉ.** Plus aucun symptôme de trousseau
sur dix passes (**387**), l'écran de départ tombant à **99 / 104 / 121 / 136 ms**.
L'étage 1 remonte au gate (**391**). Et le **389** a fait mieux que tenir : l'agent
l'a **cité pour raisonner** sans savoir qu'il était neuf, refusant de relever
`startTimeoutMs` malgré la suggestion du runner — « la pire attente était collée
au plafond à **349 ms** près, ce qui désigne un écran qui n'arrive jamais ».

✅ **395 — DÉMENTI, ET IL ALLAIT ME FAIRE DÉFAIRE UN CORRECTIF JUSTE.** Le run
affirmait, mesure à l'appui, que le geste prescrit pour l'invite système ne peut
pas fonctionner : `maestro hierarchy | grep -icE "autoriser|allow|notification"`
→ 0, « l'alerte appartient à SpringBoard, pas à l'arbre de l'app ». Reproduit sur
appareil, avec contre-épreuve à chaque étape : l'arbre pris **pendant** que
l'alerte est affichée porte « Autorisez-vous… », « Refuser » et « Autoriser » ;
le `tapOn: text: '(?s).*(Refuser|Don.t Allow).*'` rend COMPLETED ; et le dump
suivant montre l'alerte **partie** et l'app revenue à l'accueil. *Le geste
marche.* Son `hierarchy` et sa capture n'étaient pas simultanés — un état final
lu là où il fallait l'ordre des événements — et **SpringBoard a crashé à 13:04,
en plein milieu de son run** (`XCTAutomationSession initWithAccessibilityFramework`,
le crash que la procédure décrit, sur un simulateur à 1 h 06 de sessions
accumulées). ⚠️ Sans le rapport de crash que Germinator a lu, j'inscrivais ce
constat et je retirais un remède qui fonctionne.

🔴 **396 — ET LE VRAI DÉFAUT EST LE MIEN, ÉCRIT LE MATIN MÊME.** L'observation de
départ du run était juste : ses trois gestes ne s'exécutaient pas. La cause n'est
pas le sélecteur, c'est la PLACE — celle que le **388** a prescrite. Mesuré sur le
scaffold livré : `goto.yaml` n'a **qu'un seul appelant réel**, `visual.yaml` ; les
mentions d'`a11y.yaml` sont dans un `TODO` commenté, et **six flows sur huit**
entrent par `launch-clean.yaml`. J'ai donc déplacé le geste vers le fichier qui ne
le joue presque jamais — en écrivant un garde qui fige cette place. *Un garde ne
rend pas vrai ce qu'il garde.*

✅ **397 — DÉMENTI sur le cas documenté.** Le run signalait qu'`argus-anchors`
valide l'action et non la tapabilité du centre du rect. Le skill le dit déjà, mot
pour mot, dans le message d'échec du garde : « Maestro la tapera quand même (il
vise le centre du rect), mais TalkBack annoncera un bouton anonyme ». **Résidu
vrai et plus étroit** : ce message couvre l'enveloppe INERTE ; le cas du run est
un conteneur **actif** dont le centre tombe hors du contrôle — verte au garde,
inopérante sur l'appareil.

✅ **398 — DÉMENTI, avec son remède déjà écrit.** `argus_types.dart` porte huit
lignes sur le sujet : « CE RAPPEL EST SYNCHRONE, ET LES CONTENEURS D'INJECTION NE
LE SONT PAS — `GetIt.reset()` et `unregister()` rendent des `Future` », suivies du
montage qui marche (enregistrer une fois en `setUpAll` des fabriques qui lisent
une variable de module). **Résidu vrai** : le message d'échec du garde dit
« aucun nœud ne porte cet identifiant » — un diagnostic d'INSTRUMENTATION pour un
défaut de MONTAGE — et ne renvoie pas vers cette note. 22 gardes rouges sur 26.

🔴 **399 — L'ÉCRAN D'APRÈS `killApp` N'EST PAS CELUI D'APRÈS UN RETOUR
D'ARRIÈRE-PLAN.** `lifecycle.yaml` attend `ARGUS_ANCHOR_AFTER_AUTH` dans les deux
cas, sous le libellé « L'app repart proprement après mort du processus ». Une app
qui redemande son code secret après une mort de processus — décision de sécurité
courante — échoue donc sur une assertion qui décrit une AUTRE application.

**Prochain numéro libre : 400.**

Les points **347 à 365** sont fermés le 04/09/2026 — backlog vide pour la
**quarante-cinquième** fois. Trois runs (46 · terrain sans API, Android ;
47 · le même, iOS ; 48 · terrain avec API, Android), **treize constats**, et
dix-neuf points parce que deux sont nés de questions plutôt que d'un run.

🎯 **LE RUN 47 A RENDU `gate: PASS`** — 1 finding (info), 10 flows, 0 échec,
9 écrans sur 9, `notConfigured: []`. Deuxième run entièrement vert du chantier,
et le premier sur un plugin corrigé le matin même.

🔴 **QUATRE CONSTATS SUR TREIZE ÉTAIENT DÉJÀ TRAITÉS**, et les quatre ont été
démentis **en exécutant**, jamais en relisant le fichier voisin. Ils restent ici
avec leur mesure, parce que le remède demandé aurait chaque fois abîmé un
mécanisme correct :

| ce que le run affirmait | ce que la mesure a établi | résidu vrai |
|---|---|---|
| le masquage affiche `***` même pour une valeur vide | `masquerSecrets` rend `<VIDE>` depuis le 337, `secretsVides` les nomme, l'avertissement existe en quatre lignes | **356** — il nommait la frontière de PROCESSUS, pas celle de l'EXPORT |
| `auth.anchors` suppose un écran, rien ne le signale | la limite est écrite dans le fichier que le run ÉDITAIT, et sa décision y est nommée « la bonne réponse » ; son remède (`steps[]`) y est refusé | **357** — `SKILL.md` ne contenait AUCUN `auth.` |
| `run.scope` partiel n'est qu'un champ | la page publiée porte déjà un bandeau `partiel` | **358** — le TERMINAL, lui, se taisait |
| `const Semantics` n'est signalé nulle part | documenté 800 lignes plus tôt, au point où l'on instrumente, dans une note qui dit avoir DÉJÀ été rapprochée pour cette raison | **361** — un doublon a été écrit avant qu'un garde d'unicité ne le dise |

⚠️ **LE VERDICT DEVICE DU RUN 48 NE MESURE PAS LE PLUGIN — il mesure une erreur
de cadrage.** `API_HOST` avait été pris dans le bloc « Démarrer » du README, qui
ne montre que la recette **partagée et distante** ; le fichier de build que ce
README RÉFÉRENCE documente aussi une API locale. Mesuré après coup : la locale
répond en 16 ms, la distante en 922 ms et tombe par intermittence. Cinq flows sur
sept sont morts au plafond d'attente sur un « service indisponible » qui
n'appartenait ni au skill ni à l'application. → point **354**.

📌 **Ce que le run 48 a bien fait** : il a PROUVÉ l'intermittence au lieu de la
supposer — deux flows ont vu l'écran de départ en 23 et 71 ms **dans la même
fenêtre** où cinq autres expiraient. Il n'a pas relancé jusqu'à obtenir du vert.

🔴 **LA SORTIE RESTE FERMÉE**, et cette fois ce n'est pas une question de nombre :
il reste **deux angles morts structurels**, tous deux propres aux applications
qui consomment une API. L'authentification multi-écrans est désormais documentée
(**357**) ; **le serveur qui varie n'a toujours pas d'histoire dans le skill** —
où passer des secrets réels, comment distinguer « l'app est cassée » de « le
serveur refuse », que faire d'un état qui change entre deux runs. Le run 48
n'a pas pu le mesurer, puisqu'il pointait la mauvaise API.

**Prochain numéro libre : 366.**

Les points **343 à 346** sont fermés le 02/09/2026 — backlog vide pour la
**quarante-quatrième** fois. Le run 45 était un run de **confirmation**, joué
pour trancher la sortie sur une mesure.

🔴 **LA SORTIE RESTE FERMÉE** : les quatre constats coûtent, dont un à
**~35 minutes d'appareil**. Mais leur nature s'est resserrée encore — **les
quatre sont des « justes mais MAL PLACÉS »**. Après quarante-cinq runs, ce qui
reste n'est plus un mécanisme qui se trompe : c'est un document dont l'ordre ne
suit pas celui des gestes.

Les points **334 à 342** sont fermés le 02/09/2026 — backlog vide pour la
**quarante-troisième** fois. Neuf points pour **douze constats**, parce que la
reproduction en a **démenti trois**, dont deux qui auraient fait ajouter ce que
le skill portait déjà.

⚠️ **LA SORTIE RESTE FERMÉE, mais la décrue est nette** — 19 → 21 → 18 → 16 →
**9**. Quatre constats coûtaient : un piège non documenté, une grandeur mal
choisie, un affichage qui ment, un motif trop large. **Aucun n'est un mécanisme
cassé** : les deux runs ont mené leur mission au bout, l'un entièrement vert,
l'autre en rendant onze findings tous justifiés.

📌 **Ce que les agents ont bien fait, et qui compte autant que les constats** :
l'un a **refusé de conclure** sur un flow dont deux mesures se contredisaient
(« le montage ne mesure rien tout en rendant un verdict ») et l'a laissé rouge
plutôt que de l'assouplir ; l'autre a **refusé de couvrir un écran en visuel**
parce que sa référence aurait embarqué des données réelles dans un dépôt. Et l'un
d'eux a reproduit à l'identique un anti-pattern de ce chantier — une boucle shell
qui rend « 0 » sans rien parcourir.

Le point **333** est fermé le 02/09/2026 — backlog vide pour la
**quarante-deuxième** fois. Il ne vient pas d'un run mais d'une **demande** de
Germinator, et sa valeur n'est pas l'outil : c'est qu'il a trouvé un faux
constat avant d'exister. Le relevé donnait « le backlog s'est vidé huit fois »
pour un compteur périmé ; c'était un bilan à sa date, et le corriger aurait
abîmé un texte juste.

Les points **317 à 332** sont fermés le 01/09/2026 — backlog vide pour la
**quarante et unième** fois. Seize points, quatre vagues dans la journée, et la
**quatrième convergence** du chantier (les deux runs iOS sur le compteur de
TODO).

📌 **Six points visaient du code écrit le matin même**, et deux d'entre eux
étaient des correctifs *de cette vague-là* (321, 330). Mais le résultat qui
compte va dans l'autre sens : **le 297 a économisé trente-quatre minutes
d'appareil le jour de son écriture**, et sept autres correctifs du jour ont été
exercés et ont tenu.

Les points **299 à 316** sont fermés le 01/09/2026 — backlog vide pour la
**quarantième** fois. Dix-huit points, un démenti, et **deux runs qui ont buté au
même endroit** pour la troisième fois du chantier. Le plus grave — un garde qui
rendait vert par accident sur la forme que le skill prescrit — n'aurait été vu
par aucune relecture : il fallait un terrain qui écrive vraiment cette forme-là.

📌 **Cinq points sur dix-huit visaient du code écrit le jour même**, dont ma
propre contradiction du 283. Le délai entre l'écriture et la mise à l'épreuve
s'est encore raccourci : quelques heures.

Les points **297 et 298** sont fermés le 01/09/2026 — backlog vide pour la
**trente-neuvième** fois. **Aucun des deux ne vient d'un run** : le premier d'une
question de Germinator sur ce que le rapport dit, le second de sa lecture d'une
page publiée. Et la conception du 297 a été corrigée par une **seconde** question
avant la première ligne de code.

Le point **297** est fermé le 01/09/2026 — backlog vide pour la **trente-huitième**
fois. Il ne vient pas d'un run mais d'une **question** de Germinator sur ce que
le rapport dit, et sa conception a été corrigée par une **seconde** question
avant la première ligne de code. C'est la cinquième fois que la lecture d'un
livrable trouve ce que l'exécution ne voit pas — et la première fois qu'une
objection arrive assez tôt pour changer le remède plutôt que le corriger après.

Les points **275 à 295** sont fermés le 01/09/2026 — backlog vide pour la
**trente-septième** fois. Tous viennent des deux runs iOS, et **cinq d'entre eux
portent sur des correctifs écrits le matin même** : le 259 a créé l'angle mort
du 279, le 260 et le 263 ont échangé un nombre deviné contre un nombre mesuré
dans un seul état (276), le 264 a annoté au lieu de déplacer (277), et le 270 —
que j'avais démenti — était juste (278). **Un correctif est une hypothèse tant
qu'un terrain ne l'a pas exercé**, et le délai entre l'écriture et la mise à
l'épreuve était ici de quelques heures.

📌 Le 275 est le plus grave jamais trouvé sur ce chantier, et il n'était **pas
dans le skill** : le geste le plus destructeur du parcours — publier sans passer
l'URL — y était décrit comme le plus anodin.

Les points **251 à 274** sont fermés le 01/09/2026 — backlog vide pour la
**trente-sixième** fois. Aucun ne vient d'un run : le 251 était un manque qu'on
s'était noté, et les deux autres sont nés en le fermant — le 252 d'une remarque
de Germinator sur la page qu'il venait d'ouvrir, le 253 d'un `grep` fait pour
autre chose. **Quatrième fois que la publication trouve ce que l'exécution ne
voit pas.**

Les points **245 à 250** sont fermés le 31/08/2026 — backlog vide pour la
**trente-quatrième** fois, **cinquième passe de la journée**. Aucun ne vient d'un
run : les six sortent d'une observation de Germinator sur les pages publiées,
comme le 187 et le 200 avant eux. C'est la troisième fois que la **publication**
— et non l'exécution — est ce qui trouve le défaut, ce qui confirme la règle du
livrable que personne ne regarde : une page non lue n'est pas éprouvée.

⚠️ **Ces six points ont été écrits DEUX FOIS.** Le harnais de mutation tournait
en fond ; il restaure ses cibles par `git checkout`, donc depuis `HEAD`. Il a
effacé les trois morceaux non commités au moment précis où ils marchaient. La
règle connue — « commiter AVANT de muter » — visait la passe de mutation ; sa
moitié manquante est qu'un harnais **lancé en fond** ouvre la même fenêtre sur
tout le temps où l'on continue de travailler. Le harnais l'a d'ailleurs dit à sa
façon : `120/141`, avec des `HARNAIS · la suite n'a pas tourné entièrement` en
série. Il n'a pas rendu un faux chiffre, il a refusé de conclure.

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

### 400-405. Les runs 55 et 56 — deux runs en aveugle, un même défaut de fond

**Fermés le 07/09/2026** — cinquante-deuxième fois que le backlog se vide.

Deux runs joués EN PARALLÈLE sur deux terrains, deux
plateformes, par deux agents vierges qui s'ignoraient : iOS sur le projet qui
consomme une API (run 55, 19 min 26 s sur 60, gate propre, 8 flows / 0 finding),
Android sur le projet hors ligne (run 56, 10 flows, `scope: complet`, 14/14
écrans visités, `notVisited: []`).

✅ **CE QUE LA PASSE DE LA VEILLE A RENDU** — le **387** tient (démarrage 87 →
219 ms au pire sur huit flows, budget 2000, aucun symptôme de trousseau) ; le
**391** agrège (467 tests d'un côté, 632 de l'autre, tous au gate) ; et les
messages du **397-399** ont **servi à trouver** : c'est le garde disant lui-même
qu'il prouve un nœud *actif* et non que son centre soit sur le contrôle qui a
mené au 401 ci-dessous.

⚠️ **DEUX CONSTATS DES RUNS N'ONT PAS ÉTÉ INSCRITS, LA REPRODUCTION LES A
DÉMENTIS** — le `*_diff.png` laissé dans `_baselines/` est déjà couvert par
`.gitignore:110` (`/.maestro/_baselines/**/*_diff.png`), vérifié sur les deux
terrains ; et les deux écarts entre mes relevés et les comptes rendus
(`harness.screens` +2, `maestro.baselines` +1, constants sur les deux runs)
viennent de **mon comparateur**, qui compte `ArgusScreen(` jusque dans les
déclarations de type et tous les `*.png` sans exclure les diffs. `compare-runs.sh`
n'est pas corrigé : il est figé par sha256 et sert à comparer 55 runs entre eux —
l'écart est documenté dans les relevés, il ne se répare pas dans l'outil.

### 400. Le garde de cadrage MESURE SANS DRAINER, quand ses deux voisins drainent

`layout_test.dart`, garde « racine de recadrage sous la barre d'état » : il
appelle `tester.getRect()` sans avoir consommé l'exception que le montage a pu
laisser. Les DEUX gardes de la boucle suivante, eux, la consomment (l. 105 et
131) — dont un dont le commentaire explique précisément pourquoi. *Trois gardes
du même fichier, deux drainent, le troisième pas.*

Conséquence mesurée sur un vrai projet : un `RenderFlex overflowed by 41 pixels`
laissé en attente fait échouer le test **au démontage, donc HORS d'`argusCheck`**
— il ne propose aucune clé de dette, et la clé écrite de mémoire ne correspond à
rien. Le garde devient impossible à faire taire autrement qu'en le retirant, sur
un projet où le débordement est **déjà** mesuré et inscrit par le garde voisin.

📌 **Et le même correctif ferme un second constat** : le fichier livré n'était pas
`dart format`-propre sous Dart 3.8 (le seul des sept), ce qui cassait la commande
de vérification du projet d'accueil. Mesuré : le fichier corrigé passe
`--set-exit-if-changed`. Les deux runs ont dû le patcher chacun de leur côté.

### 401. Une ancre PRÉSENTE et ACTIVE peut désigner le MAUVAIS RECTANGLE

🔴 **Trouvé indépendamment par les deux runs, sur deux plateformes.** L'étage 1
valide l'ancre — elle existe, elle porte une action — et Maestro vise le CENTRE
de son rect, qui tombe sur du texte inerte à des centaines de pixels du contrôle.

- run 56 : `session_form_back` → `[53,163][1028,263]`, **975 px, toute la
  rangée** (titre et pastille RESET absorbés), faute de `container: true` — que
  sa voisine `session_form_reset` portait, elle. Après correction : 99 px.
- run 55 : `delivery_card_details` → `[20,348][381,485]`, **la carte entière**,
  centre à ~100 pt du lien « Détails ».

Le message du 397-399 le DIT déjà — mais rien ne le MESURE, et c'est la
différence entre un avertissement et un garde. Critère **dérivé, non deviné** :
*le rect d'une ancre ne doit pas contenir celui d'une autre ancre déclarée.* Un
CTA pleine largeur n'en contient aucune ; une ancre qui a absorbé ses sœurs, si.

### 402. `pertePossible()` se tait exactement là où le danger vit

`if (!url) return null; // aucune page n'existe : rien à écraser` — la prémisse
est fausse, et **le dartdoc de la fonction suivante la contredit dix lignes plus
bas** : l'outil de publication rapproche par CHEMIN DE FICHIER, donc une
publication sans `url` atterrit sur la page du run précédent et la REMPLACE. Une
URL vide veut dire « la config ne la connaît pas », jamais « la page n'existe
pas ».

Les deux runs y étaient exposés ; **seule leur initiative de lire la galerie** a
évité d'effacer 4 onglets d'historique et de renommer une page. Le run 56 a
trouvé DEUX pages au même titre — la trace d'un run antérieur qui n'a pas eu
cette initiative.

### 403. Sur iOS, la taille du binaire est mesurée, écrite, et INVISIBLE au rapport

`perf.mjs:508` (chemin iOS) écrit `binarySizeMb` **à la racine** du JSON, sans
bloc `metrics` ; `report.mjs:258` fait `const metrics = perf?.metrics; if
(!metrics) return ''`. Le bandeau ne rend donc **aucune ligne de perf** sur iOS —
y compris la taille, pourtant mesurée (28,7 Mo) et comparée à son budget. Tant
qu'elle est SOUS le budget, aucun finding ne la porte non plus : la mesure
disparaît sans un mot.

Et `report-format-mobile.md:212` promet l'inverse, sans réserve de plateforme :
« **`perf.metrics` porte `binaryPath` et `binaryIsRelease`** ». Parité entre
plateformes : la décision existe d'un côté et n'a jamais traversé.

### 404. Le paramètre nu que le skill PRESCRIT est classé « ancre opaque »

Le croisement POSÉ→DÉCLARÉ range à part les gabarits interpolés (`'x_${y}'`,
critère `/'[^']*\$\{[^']*'/`) — bien vu, et le commentaire explique pourquoi les
ranger avec les opaques « pousserait à écrire *hors périmètre* sur des ancres bel
et bien vérifiées ». Mais le critère ne reconnaît **que la chaîne interpolée** :
un paramètre NU (`identifier: semanticIdentifier`) tombe dans `opaques`, avec le
conseil « Rends-la littérale, ou inscris-la dans `anchors.allowUndeclared` ».

Or c'est la forme que le SKILL prescrit lui-même pour les composants partagés,
et il la NOMME (l. 836-838 : « Nomme ce paramètre `semanticIdentifier` » ·
« `anchorPrefix` quand il préfixe une famille »). Le run 56 en a huit, couvrant
24 call-sites. Le remède se dérive donc du skill au lieu de se deviner : ces deux
noms-là sont des familles, pas des opaques.

### 405. Mon correctif du 396 a DÉPLACÉ le défaut au lieu de le fermer

Le geste qui referme l'invite système vivait dans `goto.yaml` — un seul appelant.
Je l'ai porté dans `launch-clean.yaml`, par où six flows sur huit entrent : il est
désormais **atteint**. Et il arrive **trop tôt**. L'app du run 55 déclenche
`requestAuthorization` au montage de l'ACCUEIL, donc *après* la connexion, quand
`launch-clean` a déjà refermé au lancement. Trois flows rouges, un quatrième vert
**par chronométrage** — un flake, pas un succès.

*Un remède ne supprime pas toujours un mode de panne : il le déplace.* J'avais
corrigé l'ATTEINTE et cassé le MOMENT, et les deux moitiés sont nécessaires — le
geste doit être joué par tous les chemins ET là où l'invite naît.

### 406-414. Les runs 57 et 58 — la passe de CONFIRMATION, et le faux vert qu'elle a trouvé

**Fermés le 07/09/2026** — cinquante-troisième fois que le backlog se vide.
⚠️ **Deux des neuf sont des DÉMENTIS** : le 409 (le flow porte bien sa marque, comme
les 14 livrés) et le constat d'origine du 411 (le contrôle du graphe attrape le cas,
reproduit dans les deux sens). Les deux gardent leur numéro et leur mesure.

Deux runs joués pour **trancher la sortie sur une mesure** plutôt que sur une
impression : iOS sur le projet à API, Android sur le projet hors ligne, tous deux
sur le plugin corrigé le jour même. ⚠️ Les deux ont été **coupés par une limite
de quota d'API**, puis **repris** en leur mesurant l'état du disque — l'un après
que son émulateur eut été tué par la pression mémoire, donc sur un appareil neuf.

✅ **La passe du matin a porté, et ça se lit dans ce qu'ils ont ÉCRIT.** Le garde
**401**, né le matin, a fait corriger **deux ancres** au run 57 pour la raison
exacte qu'il mesure (`container: true`, ancre descendue sur le `label:`) : le
défaut que les runs 55 et 56 avaient dû diagnostiquer **sur device** a été
attrapé **à l'étage 1, sans appareil**. Et plus aucun patch de `layout_test.dart`
(**400**). Le run 58 signe par ailleurs la meilleure preuve de télémétrie du
chantier — DSN mesuré sur les DEUX variants, deux sondes runtime avec leur
mutation, rebuild après mutation, et l'encodage latin-1 de l'AOT confirmé.

### 406. 🔴 Un run qui n'exécute AUCUN flow rend `exit 0`

Confirmé par **deux runs indépendants, deux terrains, deux plateformes, deux
causes différentes** — le signal le plus fort qu'une paire de runs sache donner :

- run 57 — Maestro refuse le workspace entier (`Parsing Failed`),
  `flowsExecuted: 0`, **exit 0** ;
- run 58 — `--tags=journey`, un filtre qui ne matche rien, 0 flow joué, **exit 0**.

Mesuré : `flowsExecuted` n'apparaît qu'**une fois** dans `run.mjs` (l. 2130), dans
le rapport, **jamais dans un verdict**. Le code de sortie vient de
`exitCodeFor(findings, gate)`, et le seul garde voisin porte sur `failedRuns > 0`
— il couvre « Maestro a échoué sans étape fautive », pas « Maestro n'a jamais
démarré ». Zéro flow ne produit aucun finding, donc aucune sévérité, donc vert.

📌 **Aucun des deux agents n'a été alerté par le code de sortie** : c'est la
**durée** qui les a sauvés (18 s au lieu de 180 ; 9 s), et pour l'un
l'avertissement sur les écrans jamais atteints. C'est la classe du **366-372**
— un run interrompu se rendait en vert — fermée pour l'interruption et **pas**
pour le run qui ne démarre jamais.

### 407. L'exemple `--tags=journey` du skill ne correspond à aucun tag livré

Le §3g donne `--tags=journey` comme la façon de rejouer un flow seul. **Ce tag
n'existe dans aucun flow du scaffold** : ils portent `argus`, `functional`, `p0`.
Le suivre à la lettre produit exactement le run vide du **406** — et aucune liste
des tags réellement livrés n'existe nulle part. Le run 58 l'a payé en croyant
rejouer son parcours.

### 408. `cropRoot: true` est exigé par l'outil et absent de là où on le remplit

`argus-anchors` refuse — correctement — qu'une racine serve de `visualCropOn`
sans que son `ArgusScreen` déclare `cropRoot: true`. Mais cette exigence n'est
écrite **ni au §3f-bis ni au §2c-bis**, c'est-à-dire nulle part où l'on remplit
`screens[]` et `visualCropOn` : elle vit dans un dartdoc d'`argus_types.dart` et
dans `methodology-mobile.md`. Le run 58 ne l'a apprise que par le refus, après
avoir cru la section complète. *Le refus est excellent ; il arrive après.*

### 409. `lifecycle.yaml` appartient au projet, et le run l'a cru du cadre

Le run 57 a raisonné une bonne partie de sa passe en le croyant intouchable, et
allait laisser un `major` **faux** dans le rapport plutôt que de corriger une
assertion. C'est l'inventaire d'`install-mobile.sh --check` qui l'a détrompé,
après coup — rien dans le flow lui-même ne dit à qui il appartient.

### 410. Rien ne sépare « l'app fait autre chose » de « l'app est cassée »

Le skill donne le **geste** (regarder la capture avant de soupçonner l'ancre) et
le **tell chiffré** (la pire attente est-elle collée au plafond ? — au run 57,
non : 103-205 ms pour un plafond de 20 000). Ces deux-là ont épargné deux passes
device. Mais devant une relance post-`killApp` qui retombe sur un écran de
verrouillage, seule la **lecture du code de l'app** a permis de dire que c'est
voulu. Aucun outil ne l'a rendu, et c'est le troisième volet de l'angle mort
« le serveur qui varie », sous une autre forme.

### 411. Le chemin d'un `runFlow` est relatif au fichier appelant — jamais écrit

⚠️ **Le constat qui l'a fait naître est DÉMENTI** : le run 57 accusait
`argus-lint` de conclure « tous les flows parsent » sur un workspace cassé.
Reproduit dans les deux sens sur un workspace jetable — la cible enchaîne
`check-syntax` **et** `--check-flows`, et celui-ci attrape le cas (`exit 1`), avec
un message qui nomme la cause. Le chemin correct rend `exit 0`. L'agent n'avait
pas relancé la cible après avoir écrit son appel.

📌 Résidu vrai et plus étroit : **le skill ne dit nulle part** que ce chemin est
relatif au fichier appelant. Et le correctif **405 a doublé** le nombre d'appels
copiables depuis `_subflows/` vers `.maestro/` — les deux sites livrés sont
justes, mais le geste est deux fois plus copiable au mauvais endroit.

### 412. Le 405 est incomplet : l'invite peut naître PENDANT l'attente

Mon correctif place l'appel **après** l'attente de l'ancre post-connexion. Or
l'app du run 57 monte son bloc d'amorçage en `lazy: false` : l'invite système
naît alors qu'`extendedWaitUntil` court **déjà**. Ce n'est pas un ordre à
corriger mais une **course**, que l'agent a tranchée par un `retry` rejouant la
paire. Le geste est au bon endroit ; il lui manque de tenir quand l'invite naît
en cours d'attente.

### 413. Rien ne prescrit de CHERCHER les canaux sortants

Le gabarit demande à l'utilisateur de trancher la télémétrie, et le run 58 l'a
prouvée admirablement. Mais le run 57 a manqué
`RegisterDeviceToken(ignorePermission: true)` — le jeton FCM enregistré **même
quand les notifications sont refusées** —, et le dit lui-même : il a vérifié ce
qu'on lui nommait, pas ce que l'app émet. Le skill n'a aucun geste pour
**inventorier** les canaux sortants avant la première passe device.

### 414. Deux références visuelles pixel-identiques, sans que rien ne prévienne

Sur le terrain 1, `shell.png` et `home-empty.png` portent la **même empreinte** :
la coquille EST l'écran de départ, et les deux recadrent sur la même racine. L'un
des deux ne garde donc rien de plus que l'autre — 32 s de device par run, et une
référence commitée en double. Rien dans le skill ne prévient de ce cas.

### 415-421. Les runs 59 et 60 — la seconde confirmation, et ce qu'elle n'a PAS trouvé

Deux runs joués **séparément** (la mémoire avait tué l'émulateur deux fois dans
la journée), sur le plugin corrigé quelques heures plus tôt. Les deux rendent
`scope: complet`, **8 flows, 0 major** — 15 min 47 s et ~20 min de device sur 60.

✅ **AUCUN MÉCANISME CASSÉ, AUCUN FAUX VERT, AUCUNE PASSE DEVICE PERDUE.** Ce qui
reste est de sept ordres différents, dont **un seul est un défaut de code** — et
c'est un de mes correctifs de la veille, incomplet.

📌 **Les correctifs du jour ont payé, et ça se lit dans ce que les agents ont
écrit** : le **401** a attrapé une ancre fusionnée **à l'étage 1, sans device**,
deux runs de suite (« le nœud retenu mesure 320×38 dp quand le widget en fait
38×38 ; le centre visé (180, 51) tombe HORS du contrôle ») ; le **413** a fait
trouver au run 59 le canal sortant que le run 57 avait manqué — il **cite le §2**
en le rapportant — et au run 60 deux canaux de plus ; le **410** a été appliqué
mot pour mot (« c'est un garde de sécurité : j'ai corrigé l'assertion, pas
l'app »).

### 415. 🔴 Le 404 est incomplet : la convention n'est reconnue qu'au mot près

**Fermé le 08/09/2026.** La convention vit désormais en UN SEUL endroit, que la
CLÉ et la VALEUR composent toutes deux — deux copies d'un même motif dont une
seule est mesurée, c'est toujours l'autre qui dérive. La valeur accepte en plus
la forme de préfixe que la clé écarte délibérément (`anchorPrefix:` ne POSE pas
d'ancre, mais `identifier: widget.rowAnchorPrefix` en nomme une famille). Tout
nom hors convention et non inscrit reste opaque : le remède ne vide pas le 404.
📌 Le garde porte sur l'ACCORD des deux moitiés, pas sur les deux noms du
constat : chaque nom du corpus est posé en clé ET en valeur, et le classement ne
doit jamais les séparer. Le corpus se dérive du SKILL, si bien qu'un troisième
nom prescrit demain le fera tomber sans qu'on y pense.

**Les DEUX runs le signalent, sur deux terrains.** Le croisement POSÉ→DÉCLARÉ
reconnaît `semanticIdentifier` et `anchorPrefix` **exactement**, jamais les noms
dérivés de la même convention. Reproduit : `detailsSemanticIdentifier` et
`widget.codeSemanticIdentifier` tombent chez les **opaques** — donc « ancre NON
LISIBLE », avec le conseil de les déclarer hors périmètre — alors qu'ils sont
inscrits dans `anchors.paramNames`.

📌 La cause est nette : `paramNames` gouverne la détection de la **clé**
(`[a-zA-Z]*[Ii]dentifier:`), jamais le classement de la **valeur**. Le run 60 le
formule exactement : *« Elles SONT déclarées, le croisement ne peut simplement
pas le lire. »* Remède dérivé, pas deviné : une valeur dont le nom suit la
convention que la clé accepte déjà (`*[Ii]dentifier`, `*[Pp]refix`), ou qui
figure dans `paramNames`, est une **famille**.

### 416. L'ordre du §3g bis fait renseigner le titre AVANT de lire la page

**Fermé le 08/09/2026.** La condition passe devant : le point 5 dit d'abord que
titre ET icône se RELÈVENT sur une page qui existe, et le défaut est explicitement
borné à une première publication.
🔴 **Et l'icône était le vrai défaut, parce que rien ne pouvait l'attraper.** Le
journal rendait `config.artifact.icon || '👁'` : un projet qui n'a rien déclaré
s'entendait donc annoncer l'icône du gabarit, avec l'aplomb d'une valeur relevée.
Le titre, lui, est VÉRIFIABLE — il est dans la page, et un garde compare l'annonce
au `<title>` publié ; l'icône ne l'est pas, le favicon partant à l'outil de
publication et jamais dans le HTML. Sur ce qu'il ne peut pas mesurer, le journal
dit maintenant QUOI FAIRE au lieu d'affirmer. La construction a été extraite
(`identitePubliee`) pour qu'un garde l'APPELLE, et le critère est dérivé — aucun
pictogramme quand rien n'est déclaré — plutôt que de citer celui du gabarit.

Le point 5 (« garde le titre stable ») se lit **avant** le point 3 (« récupère la
page »), alors que le skill prescrit l'inverse deux paragraphes plus bas. Un run
a donc rempli `artifact.title` dans le YAML avant le `read` : la valeur est
tombée juste, la méthode était celle que le skill interdit.

⚠️ **Et `artifact.icon` était FAUX** : il portait le défaut du scaffold (👁) quand
la page publiée porte 🧪. *« Sans le `read`, je publiais une page qui changeait
d'identité. »* Le défaut du scaffold agit ici comme une valeur plausible — le
pire genre.

### 417. Le chemin du `.app` avec flavor est donné sans son parent

**Fermé le 08/09/2026.** Les deux fichiers livrés qui le mentionnaient donnent
le chemin depuis `build/ios/`, la phrase dit que le segment REMPLACE
`iphonesimulator/` au lieu de s'y ajouter, et le geste qui tranche (`find`) passe
AVANT l'explication.
📌 Le garde ne vise pas les deux lignes du constat : il balaie tout ce que le
plugin livre et refuse tout segment de configuration Xcode qui ne porte pas sa
racine — la prochaine mention, écrite ailleurs, tombera dessus.

L'avertissement nomme `Debug-dev-iphonesimulator/` sans dire **sous quel
dossier** : deux lectures sont plausibles, une seule existe.
`✖ BUILD RÉUSSI, MAIS AUCUN PAQUET ici après 20s`. Le conseil qui sauve
(« demande le chemin au disque ») est dans le même encadré, **après**.

### 418. Le §3g fait dériver un seuil d'une mesure qui n'existe pas sur iOS

🔴 **DÉMENTI le 08/09/2026 — le constat accusait un correctif déjà écrit.**
Mesuré sur le SKILL tel que le run 59 l'a lu (`cca3076`) : la prescription portait
déjà « **Sur Android**, dérive-le de `firstLaunchMs` », le bloc « SUR iOS,
`firstLaunchMs` N'EXISTE PAS » y était depuis le 01/09 (**279**), et
`startupMarginWarning` imprimait déjà, sur iOS, « dérive-le de la pire attente
ci-dessus, pas de `firstLaunchMs` ». Les deux sont gardés dans les deux sens
(279 et 259). Le run a repris la formulation du correctif — « à neuf cents lignes
d'ici » — pour décrire le manque que cette phrase décrit.
📌 **Le symptôme, lui, était réel**, et c'est lui qui a été traité : 34 lignes et
trois avertissements qui ne concernent pas iOS séparaient la prescription du bloc
qui la borne. Le renvoi vit désormais DANS la phrase qui prescrit, et le garde
mesure la classe — toute prescription marquée « Sur Android » doit router l'autre
plateforme dans sa propre phrase, la fin de phrase étant dérivée de la
typographie du document et non d'une fenêtre en caractères.

Il envoie dériver `startTimeoutMs` de `firstLaunchMs` ; la table du §1 dit
« démarrage ✖ sur iOS » — **neuf cents lignes plus haut**. Sur un run iOS, la
prescription n'a donc pas d'objet, et rien ne le dit là où on la lit.

### 419. Le `_diff.png` résiduel n'est mentionné nulle part

**Fermé le 08/09/2026.** La section qui PRESCRIT la contre-épreuve nomme
maintenant le résidu et donne le geste qui l'ôte : restaurer la référence ne
l'efface pas — c'est un fichier de plus, pas une version d'un fichier.
📌 Le nom se DÉRIVE du `.gitignore` livré, jamais cité : si Maestro renomme son
résidu, c'est cette source qui bouge et le SKILL doit suivre. Une mutation le
prouve en renommant l'exclusion.
⚠️ **La première version du garde était trop faible, et le harnais l'a dit** :
il cherchait le résidu n'importe où dans la section, si bien que retirer la phrase
qui l'explique le laissait vert — la commande de nettoyage porte le même mot vingt
lignes plus bas. Un mot présent deux fois dans une fenêtre ne garde aucune de ses
occurrences.

La contre-épreuve visuelle laisse son diff **dans le dossier des références**,
que le projet versionne. ⚠️ Le démenti des runs 55/56 tient — `.gitignore:110`
l'empêche de partir au commit — mais le skill n'en dit rien, et c'est le contrôle
par empreinte d'un agent qui l'a attrapé, pas une consigne.

### 420. L'avertissement de locale inerte arrive après qu'on en a eu besoin

**Fermé le 08/09/2026.** Le prix est dit À LA CLÉ, là où on décide : non pas
« ce réglage est sans effet » mais « le flow `i18n.yaml` mesure alors la locale de
L'APPAREIL, donc il passe VERT quoi que tu écrives ici », avec le cas qui le
prouve (une assertion de libellé français verte sur un appareil en `fr_CI`).
📌 Le garde croise deux sources VIVANTES, comme le 259 croise le SKILL et le
runner : il APPELLE `localeWarnings`, prend dans ce qu'elle rend le nom du flow
rendu vacant, et exige que le gabarit le nomme à la clé. Aucun des deux côtés
n'est recopié — une mutation qui retire le nom du message fait refuser de
conclure, ce qui prouve la dérivation.

« La clé est sans effet, le flow i18n mesure la locale de l'APPAREIL » ne sort
qu'au **premier `argus-run`**, donc une fois `i18n.yaml` écrit. L'information est
exacte et arrive trop tard pour décider.

### 421. La table des encodages vit à 200 lignes du geste qu'elle explique

**Fermé le 08/09/2026.** Le §2 porte désormais le geste qui tranche — sur
l'AOT, pipé, dans les trois encodages, avec sa contre-épreuve — et dit ce que le
kernel debug rend : **une occurrence, toujours**, le `defaultValue` étant un
littéral de source présent quelle que soit la valeur effective. Ce `1` n'est pas
un échec de neutralisation, c'est le seul résultat possible.
📌 Le garde ne rapproche pas deux textes à la main : il découpe le SKILL sur ses
propres titres et exige que TOUTE section prescrivant un comptage binaire dise
quelque chose de l'encodage — un littéral accentué en AOT rend `0`, et ce zéro-là
se lit comme la preuve qu'on cherchait alors qu'il vient de l'instrument.

Un run a compté **1 occurrence résiduelle** d'un DSN dans le kernel debug et a
**failli conclure à un échec de neutralisation** — l'occurrence est le
`defaultValue` en tant que littéral de source, présent quelle que soit la valeur
effective. Ce qui l'a sauvé est la phrase du §2 (« la preuve se fait sur la
release »), pas la table du §3g, qui explique le phénomène deux cents lignes plus
loin.

### 422-427. Le run 61 — la confirmation iOS, et ce qu'elle a encore trouvé

Sous-agent vierge, simulateur redémarré et prouvé, joué SEUL sur le plugin corrigé
le matin même. **7 flows, `scope: complet`, gate `pass`** — 0 blocker, 0 critical,
0 major, 0 minor, 1 info — en **~13 min de device sur 60**. 614 tests du projet
verts, instrumentation partie de zéro (15 racines / 15, 28 commandes / 28).

✅ **Deux correctifs du matin ont payé, mot pour mot.** Le **416** : le rapport
s'ouvre sur « titre et icône **relevés** sur la page avant d'être écrits », neuf
onglets, aucun écrasement — c'est l'ordre que le correctif a mis devant le
gabarit, et l'icône est nommée avec le titre. Le **419** : « restauration prouvée
par empreinte **+ `_diff.png` retiré** », le résidu nommé et le geste joué sans y
penser. 📌 Et le **401** parle toujours : `home_scan` rend « nœud 324×48 dp pour
un widget de 18×18 », à l'étage 1, sans device.

### 422. 🔴 Le 417 est incomplet : c'est `flutter build` qui imprime le mauvais chemin

**Fermé le 08/09/2026.** Le harnais MESURE désormais au lieu d'espérer qu'on ait
lu : un flavor déclaré déplace le paquet, et un chemin qui ne le porte pas est
celui qu'un build sans flavor produit. L'avertissement tombe **avant** le build,
là où le Makefile ne parlait qu'après vingt secondes de « AUCUN PAQUET ».
📌 **Les deux plateformes**, parce que le défaut n'en montre qu'une à la fois —
`app-dev-debug.apk` d'un côté, `build/ios/Debug-dev-iphonesimulator/` de l'autre.
Le garde tient la parité, et se tait sur un chemin correct comme sur un projet
sans flavor.
⚠️ **Le garde 417 m'a attrapé sur ce commit même** : j'avais écrit le segment iOS
nu dans le commentaire du correctif. Il avait raison — la règle est totale.

> « `flutter build` imprime `✓ Built build/ios/iphonesimulator/Runner.app`, alors
> que le paquet réel avec flavor est `build/ios/Debug-dev-iphonesimulator/Runner.app`.
> L'avertissement est dans le gabarit, **que je n'avais pas encore ouvert quand
> j'ai rempli `build:`**. »

Le correctif du matin a mis le chemin ENTIER à la clé — ce qui est juste — et il
suppose qu'on lise la clé avant de la remplir. Le run remplit `build:` en se
fiant à **ce que l'outil vient d'imprimer**, et cette ligne-là ment sur un projet
à flavors. *Bon du point de vue de la PROPRIÉTÉ, à côté du point de vue du
MOMENT* — la même paire que le 396. Mesuré : le skill ne met en garde nulle part
contre le chemin que `flutter build` affiche (0 occurrence).

### 423. `argus-anchors` sort en 2 en affichant « All tests passed! »

**Fermé le 08/09/2026.** On ne réordonne pas — la seconde moitié doit tourner
même si la première échoue (234) : la cible **résume** après les deux, en nommant
celle qui a échoué et ce qu'elle mesure. Exercée dans les quatre cas.
📌 Le garde exige le MÉCANISME, pas une phrase : une variable de sortie par
moitié, chacune relue, le résumé après les deux. Revenir à un `rc` unique le fait
tomber.
⚠️ **Deux gardes ont dû bouger, et aucun n'avait tort.** Ma première version
cherchait le mot « ÉCHOUE », qui vit déjà dans le commentaire du 234 — le défaut
du 419, refait le même jour. Et le **234** CITAIT l'ancienne forme (`|| rc=`) :
étendu au mécanisme, pas supprimé, avec sa mutation ré-ancrée sur ce qu'elle doit
retirer.

Reproduit dans le `Makefile` livré : la cible garde le **pire** code de sortie de
ses deux moitiés (`rc`), et lance le croisement AVANT le test Dart. Un croisement
rouge suivi d'un test vert affiche donc « All tests passed! » **en dernier** et
sort en 2. La dernière ligne qu'on lit dit l'inverse du verdict.

📌 Le chaînage est délibéré et il est bon (point 234 : un garde qui en empêche un
autre coûte plus qu'il ne rapporte). Ce qui manque est le **résumé** qui dit
laquelle des deux moitiés a échoué, après les deux.

### 424. « Ce marqueur est unique dans le fichier » — une promesse que le premier commentaire dément

**Fermé le 08/09/2026.** L'explication passe AVANT, et le marqueur devient la
dernière ligne avant la déclaration : un écart d'une ligne, ce qui est tout
l'objet d'un point d'ancrage. Ce qui reste unique est le COUPLE, et le fichier
prescrit désormais la **dernière** occurrence.
📌 Le garde n'assarte pas la phrase : il EXERCE le piège sur le fichier livré —
il duplique le marqueur comme le run l'a fait, et mesure que la dernière
occurrence serre la déclaration là où la première ne le fait plus.
⚠️ Trois choses apprises en le fermant : une assertion qui CITAIT l'ancienne
promesse a été retirée (nommer ce qu'on interdit est proscrit partout ailleurs) ;
le garde **239** a refusé la première version, où le marqueur dérivait à vingt
lignes de ce qu'il ancre ; et **mon propre script d'édition est tombé dans le
piège que ce marqueur ferme**, deux fois — `index('const Set<String> …')` trouve
l'exemplaire du dartdoc, plus haut. Il a levé avant d'écrire : « tout calculer
d'abord, ouvrir ensuite » est ce qui a sauvé le fichier.

`known_issues.dart:74` l'écrit en toutes lettres : *« Ce marqueur est unique dans
le fichier : ancre-toi dessus. »* C'est vrai à la livraison et faux dès que
quelqu'un le CITE — ce que le run a fait en écrivant son propre commentaire. Son
script s'est ancré sur la première occurrence et a **détruit 40 lignes de
raisonnement** (données intactes, restauré à la main).

Le fichier avertit du dartdoc en double ; il ne dit rien du marqueur qu'on ajoute
soi-même. C'est une **promesse de comportement technique sans garde**, dans un
fichier que le projet possède — donc jamais mis à jour chez les installations
existantes.

### 425. L'avertissement des deux racines vit à 900 lignes du fichier qui l'emploie

**Fermé le 08/09/2026.** La mise en garde vit désormais dans le sous-flow
d'aiguillage, qui emploie la variable six fois, et nomme l'ancre post-connexion.
📌 Le garde ne compare pas deux textes : il exige que tout flow livré qui
**aiguille** vers un écran — signature : il lit `SCREEN_ID` — nomme l'ancre
post-connexion, dont il dérive le nom du runner.
⚠️ **Sa première version était trop large et m'aurait fait AGIR** :
`launch-clean.yaml` emploie l'ancre de départ pour ATTENDRE l'écran de départ,
ce qui est son rôle exact. Attendre n'est pas aiguiller — sans la contre-épreuve,
une mise en garde inutile atterrissait dans un flow correct.

Sur une app authentifiée, `ARGUS_ANCHOR_HOME` n'est pas l'accueil : c'est l'écran
de connexion. Le SKILL le dit (« UNE APP AUTHENTIFIÉE A DEUX RACINES, DONT
`ARGUS_ANCHOR_HOME` N'EN [nomme qu'une] »), à ~900 lignes de `goto.yaml`, qui
emploie la variable **six fois** sans porter la mise en garde. Le 366-372 avait
écrit la phrase ; il ne l'a pas mise là où elle mord.

### 426. Le skill demande de signaler « avant de lancer » à qui n'a pas de canal

**Fermé le 08/09/2026.** Le §2 porte l'autre moitié : neutraliser ce qui se
neutralise sans toucher au comportement de l'app, **laisser le reste** plutôt que
de couper un appel dans `lib/` — on changerait l'app qu'on est venu mesurer —, et
écrire les DEUX listes dans le compte rendu. C'est ce que le run a fait de
lui-même ; le correctif en fait la prescription plutôt qu'un bon réflexe.
⚠️ Le garde **410/413** a attrapé l'insertion : sa fenêtre est un nombre de
caractères, et le nouveau bloc en poussait dehors la phrase « la preuve se fait
sur la release ». Cette phrase appartient à la neutralisation — elle a été
REMONTÉE près de la demande plutôt que la fenêtre élargie. Le garde avait raison
que les deux se lisent ensemble.
⚠️ Et la mutation est revenue VACANTE d'abord : elle dégraissait un item que le
garde ne mesure pas. Une mutation vise la valeur GARDÉE.

Le §1 fait rendre l'inventaire des canaux sortants « avant la première passe
device », avec ce qu'on propose d'en faire. Un agent qui travaille en une passe
n'a qu'un seul canal — son compte rendu — et il arrive APRÈS. Le run le nomme
lui-même : *« C'est la contradiction que le skill nomme au §1. »*

⚠️ **Part de responsabilité du cadrage** : mon prompt disait aussi « dis-le-moi
avant de lancer quoi que ce soit ». Le remède doit dire ce qu'on fait quand
personne ne peut répondre — le skill le fait déjà ailleurs (« §1 dit quoi faire
quand personne n'écoute », point 71-76) : c'est cette forme-là qui manque ici.

### 427. Sur un composant à enfant iconique, les deux remèdes s'excluent

**Fermé le 08/09/2026.** Le §2c dit maintenant qu'aucun des trois remèdes ne
suffit sur certains composants, et **lequel garder** : l'ancre ACTIVE, parce
qu'une ancre inerte n'est tapable par rien tandis qu'une active mal cadrée l'est
encore — tant que le centre du nœud tombe sur le contrôle.
📌 L'arbitrage renvoie à la MESURE qui le borne (`make argus-anchors`, qui rend
le rectangle, le centre visé et le remède), et le garde l'exige : sans cette
borne, « garde l'active » deviendrait une permission permanente au lieu d'un
compromis. Le nom de la cible se dérive du Makefile livré.

Mesuré dans les deux sens, et **pour la seconde fois** (déjà au run 59) : sans
`container: true`, l'ancre est active et le nœud mesure 324×48 dp pour un widget
de 18×18 ; avec, la géométrie colle et l'ancre devient **inerte**. Le run a gardé
l'active et inscrit l'écart.

La recette du §2c ne couvre pas ce composant-là, et c'est la mesure qui le dit,
pas la lecture. Deux runs indépendants y sont tombés.

### 428-433. Le run 62 — la confirmation Android, et une régression du matin

Sous-agent vierge, émulateur Android, joué SEUL après le run 61, sur le plugin
corrigé quelques heures plus tôt. **4 flows sur 6**, trois passes device.
`argus-anchors` +30, `argus-guards` **+402**, suite du projet +259, `analyze`
sans un mot. Instrumentation partie de zéro : 25 racines / 25, 19 commandes / 19.

⚠️ **Plus dur que le run 61, et ce n'est pas le skill** : un flow rouge est un
défaut de l'app (une sonde de joignabilité amorcée mais non attendue, qui échoue
au démarrage à froid sous charge), l'autre une absorption d'ancre non résolue.

✅ **Trois correctifs ont porté, mesurés dans ce que l'agent a fait.** Le **421**
a SAUVÉ le run : `argus-build` a annoncé « PAQUET INTACT » en 6 s alors que trois
fichiers venaient de changer, et c'est le comptage prescrit qui l'a démenti —
marqueur du jour **0**, ancre retirée **2**, contre-épreuves ASCII 2, accentuée 2,
impossibilité 0 ; après `clean` : 3 / 0 / 2. *« Sans ce comptage je pilotais le
binaire d'avant. »* Le **426** a été appliqué sans que rien ne le souffle : deux
canaux trouvés là où le cadrage en nommait un, Sentry coupé et **prouvé sur la
release**, Firebase laissé avec le raisonnement écrit, les deux listes rendues.
Et le **401/427** a parlé **avant le device** sur une ancre absorbée.

### 428. 🔴 Ma régression du matin : un contrôle qui juge une plateforme hors périmètre

**Fermé le 08/09/2026, le jour où il est né.**

Le correctif 422 bouclait sur les deux plateformes sans regarder lesquelles sont
DÉCLARÉES : un projet `platforms: [android]` recevait un avertissement sur
`build.ios` **à chaque exécution**. Reproduit en dix secondes.

📌 **C'est le symétrique exact du 237-244**, fermé le 02/09 dans l'autre sens —
là, l'audit du manifeste Android faisait échouer le gate d'un projet iOS. Le même
axe, l'autre sens, et refait en fermant un point sans rapport. Un avertissement
hors périmètre s'apprend à ignorer, et il emmène les autres avec lui.
Le garde tient les deux moitiés : un projet mono-plateforme ne voit juger que la
sienne, un projet qui déclare les deux les voit toutes deux — **filtrer trop est
l'autre façon de se tromper**.

### 429. 🔴 « Recopie la section `fonts:` du pubspec » n'a pas de réponse quand la police vient d'une dépendance

**Fermé le 08/09/2026.** Les DEUX endroits qui portent la consigne le disent
désormais : le message d'exécution — qui vit dans le CADRE, donc descend chez les
installations existantes — et le dartdoc du gabarit, qu'on lit en remplissant.
Les deux nomment toujours le pubspec, sinon on enverrait le lecteur à deux
endroits différents.
📌 Lignes gardées sous 80 colonnes : `dart format` reformate le code, les
concaténations de chaînes comprises, et la CI le joue avec
`--set-exit-if-changed` sur un projet neuf.

Le dartdoc de `argusFonts` dit : « les polices du projet, **recopiées de la
section `fonts:` du `pubspec.yaml`** ». Le terrain n'en a AUCUNE — sa police
arrive par une **dépendance**. L'absence se lit alors « ce projet n'a pas de
police », ce qui est faux, et `argusSkipReason()` saute toute la dimension :
**371 tests sautés sur 401, en silence**. Renseignée en chemin relatif vers la
dépendance : **+283 −118**, puis +402 une fois la dette inscrite.

📌 Une consigne sans réponse possible ferme une dimension entière sans rien dire.
Le dartdoc met déjà en garde contre `google_fonts` (« la famille n'est PAS le nom
nu ») — c'est le même genre de piège, sur la source cette fois.

### 430. La capture publie le secret que `label:` protège partout ailleurs

**Fermé le 08/09/2026.** Le §5 nomme le quatrième canal — les **pixels** — et
dit quoi faire : sortir ce finding des preuves plutôt que d'avertir seulement.
Un avertissement sans issue se lit une fois puis s'oublie.

Le §5 énumère les canaux que `label:` masque — console, rapports — et nomme celui
qu'il ne masque pas : les journaux de debug bruts. Il manque le quatrième : **les
pixels**. Avec `evidence: all`, la capture d'un écran de code à usage unique
publie ce code **en clair** dans la page, et rien ne le signale.

📌 La ligne voisine dit bien qu'« une baseline d'un écran authentifié contient des
données réelles » — mais elle parle des RÉFÉRENCES et de données, pas des
**preuves de findings** et d'un **secret**. Trois protections nommées, une
quatrième absente : c'est la parité entre canaux d'une même phrase.

### 431. La garde de fraîcheur compare des DATES, et rate un kernel non recompilé

**Fermé le 08/09/2026 — et le défaut était pire que le constat.** La garde du
343-346 était **VACANTE PAR CONSTRUCTION** : elle relevait la fraîcheur APRÈS le
build, qui vient de réécrire la date du paquet. `stale` ne pouvait donc plus
jamais être vrai dès que le build touchait le paquet.
📌 Le relevé se fait maintenant AVANT, et le message « PAQUET INTACT » dit ce
qu'une empreinte ne prouve pas, avec le tell — la DURÉE. Le garde mesure la
POSITION, et que le relevé soit **relu** après : une mesure prise et jetée est
pire que pas de mesure, parce qu'elle ressemble à un contrôle.

`argus-build` a annoncé « PAQUET INTACT — lib/ n'a pas changé depuis » **en 6 s**
alors que trois fichiers venaient d'être modifiés. La branche « PAQUET PÉRIMÉ »
existe (343-346) et n'a pas parlé : elle s'appuie sur `--print-freshness`, qui
compare des **horodatages**. Un build qui réécrit le paquet sans recompiler le
kernel le rend donc « frais ».

📌 Ce que le run a fait est ce qu'il fallait : compter un **marqueur** dans le
binaire — 0 pour l'ancre du jour, 2 pour celle qu'il venait de retirer. Le tell
était la DURÉE (6 s), exactement ce que le CLAUDE.md du chantier décrit. La garde
devrait dire ce qu'elle ne peut pas voir, ou compter au lieu de dater.

### 432. Les entrées que la doc suggère pour les secrets sont inertes ici

⚠️ **EN PARTIE DÉMENTI le 08/09/2026, et c'est ma correction qui l'a montré.**
J'ai commencé par ÉCRIRE la condition — qui existait déjà quatorze lignes plus
haut, et mieux dite : « n'y liste QUE des fichiers VERSIONNÉS ; un fichier
gitignoré n'est déjà pas regardé ». J'ajoutais ce qui était là, **pour la
neuvième fois du chantier**.
📌 Le résidu vrai est plus étroit : la SUGGESTION se lit seule, loin de sa
condition, et c'est elle qu'on recopie. Un renvoi de trois lignes remplace ma
redite de six, et le garde tient exactement ça.
⚠️ **Quatre mutations ont été nécessaires**, et les trois premières manquaient
pour la même raison : elles visaient mon INTENTION (le titre, puis le mot
« INERTE ») au lieu de ce que le garde ASSERTE. Et le garde acceptait
`VERSIONN|gitignor` — un garde qui accepte des synonymes ne mesure que le plus
facile à écrire. *Partir de l'assertion, jamais de ce qu'on croit protéger.*

`allowSecretsIn` : les deux entrées Firebase que la documentation propose ne
servent à rien sur ce terrain — les fichiers sont **gitignorés**, donc déjà hors
du scan. La suggestion n'est pas fausse, elle est sans objet, et une dispense sans
objet se relit comme une dispense nécessaire.

### 433. Rien ne dit quoi faire quand la racine de cadrage est PARTAGÉE entre états

⚠️ **EN PARTIE DÉMENTI le 08/09/2026 — et cette fois vérifié AVANT d'écrire.**
La règle existe : « quand plusieurs états partagent une racine d'écran, c'est
l'ancre d'ÉTAT qui sert d'`anchor:`, et la racine commune passe en `displays:` ».
Elle vit ~170 lignes avant le gabarit, dans les écarts d'ancrage.
📌 Le résidu vrai : rien ne la reliait au CADRAGE, où la question se pose. Un
renvoi, pas une redite — c'est la leçon du 432, appliquée dans la demi-heure.
Le garde tient le LIEN : la règle d'un côté, le renvoi de l'autre, et il suit la
formulation de la règle plutôt que de la citer.

`visualCropOn` se cadre sur une racine ; ici la même racine sert **quatre états**,
donc aucun `ArgusScreen` ne peut la porter comme `anchor:` (elle doit être
unique), et le garde refuse la paire `visualCropOn`/`cropRoot`. L'agent a cadré
sur l'état plein et écarté le plein écran (qui embarquerait l'horloge) — bon
arbitrage, rendu sans instruction.

### 434-436. Le run 63 — la confirmation iOS, et trois mesures qui décrivent autre chose que ce qu'on croit

Sous-agent vierge, simulateur iOS, terrain remis à neuf, sur le plugin corrigé
la veille. **7 flows, `scope: complet`**, `argus-anchors` exit 0 (41 tests,
58 ancres), `argus-guards` **+434**, suite du projet +259, instrumentation partie
de zéro : 22 racines / 22, 39 commandes / 39.

✅ **Neuf correctifs des trois passes ont payé, et ça se mesure.** Le 429 a fait
remplir les polices depuis la dépendance au lieu de sauter la dimension ; le 430
a fait sortir du périmètre visuel les deux écrans qui affichent un secret, le run
écrivant lui-même que « le masquage ne protège pas les pixels » ; le **427**, que
deux runs avaient rencontré sans savoir quoi faire, a été appliqué à la lettre au
troisième — ancre active gardée, centre vérifié tombant sur le contrôle ; le 421
a refermé son piège d'encodage, une chaîne accentuée ressortant **0 en UTF-8 et 1
en Latin-1**, ce qu'une recherche UTF-8 seule aurait lu comme « le marqueur est
absent ».

🔴 **Ce que le run a rendu de neuf tient en une phrase : trois instruments
mesuraient autre chose que ce qu'ils annonçaient**, et aucun des trois ne
produisait d'erreur.

### 434. Une page publiée sans capture ne dit pas pourquoi, et c'est le run VERT qui la produit

**Fermé le 08/09/2026.** La construction des notes est **extraite** dans
`notesDePreuve`, que le garde APPELLE — lire le texte de `report.mjs` ne verrait
pas une note neutralisée. Le cas zéro parle désormais, et il dit POURQUOI : une
preuve s'attache à un finding. Les deux zéros sont séparés, parce qu'ils
n'appellent pas la même action — « rien à montrer » est un fait, « quatre
captures écartées par ton seuil » est un réglage à revoir.
📌 Le garde tient les deux moitiés. Le défaut était un SILENCE, donc la pente est
de n'asserter que « ça parle » — ce qui serait vert sur une fonction qui
bavarderait à tort. Les cas nominaux doivent garder leurs notes, et `none` ne
doit pas recevoir celle du run vert.

Le rapport n'embarque une image que si un **finding**
la porte. Un run sans finding porteur — c'est-à-dire le run **vert**, celui qu'on
publie — sort donc une page sans une seule capture, et les quatre notes que le
rapport sait écrire sont toutes fausses dans ce cas : `evidence: none` non,
`embedded` non, `tooBig` non, `missing` non. La ligne « Preuves : … » n'est alors
pas rendue du tout.

Le lecteur qui a demandé `all` voit une page nue et ne peut pas distinguer « il
n'y avait rien à montrer » de « le mécanisme a échoué ». C'est le motif du
livrable que personne ne relit : le run l'a signalé de lui-même — « aucune
capture, **malgré** `evidence: all` » — parce qu'il avait le réglage sous les yeux
et pas seulement la page.

📌 Le remède n'est pas d'embarquer des captures sans finding : c'est de **dire**
ce qui s'est passé, à l'endroit prévu pour ça.

### 435. La commande de comptage que le skill PRESCRIT rate les arguments repliés par le formateur

**Fermé le 08/09/2026.** Les deux commandes **recollent** la valeur à sa clé
avant de compter, et l'encadré dit pourquoi, avec sa mesure. Le garde EXÉCUTE la
commande telle que le skill l'écrit, sur un corpus qui porte un argument replié —
lire son texte n'aurait rien dit : le motif d'origine était parfaitement lisible
et comptait faux. L'autre moitié y est aussi : les exemples du dartdoc ne doivent
toujours pas compter, sinon un remède qui compterait TOUT passerait pour un
correctif.
⚠️ **Le garde voisin a refusé le correctif d'abord**, et il avait raison : il
cherchait une ligne unique commençant par `grep`, or la commande en occupe trois.
Son extraction lit le PARAGRAPHE maintenant — l'unité, pas la ligne. C'est la
quatrième fois du chantier qu'un garde en place arrête un correctif juste.
📌 Et la première mutation a rendu « motif trouvé 0× » : une r-string Python
garde le backslash de `\"`, donc la chaîne cherchée n'était pas celle du fichier.
Le harnais a **refusé de conclure** au lieu d'annoncer un garde vacant.

Le skill donne la commande qui compte les sites
d'instrumentation, et l'encadré qui l'entoure prévient déjà contre trois pièges —
les commentaires, les gabarits interpolés, les `grep -c` chaînés par `&&`. Il ne
prévient pas contre le quatrième, qui est dans la commande elle-même : elle exige
la valeur **sur la même ligne** que la clé, or le formateur la replie dès que
l'imbrication est profonde.

Mesuré sur le terrain, en exécutant : la commande prescrite rend **48**, la
réalité est **50** ; sur le seul fichier le plus imbriqué, elle compte **1** là
où il y en a **3**. Le run l'a vu par **désaccord** — il savait en avoir posé
trois — et personne d'autre n'aurait pu.

📌 Deux choses aggravent. Ce chiffre **ouvre le rapport**, l'encadré le dit
lui-même (« ils donnent le ton de tout le reste »), donc un sous-comptage y passe
pour une mesure. Et l'erreur est **corrélée à la complexité** : les sites que le
motif rate sont ceux des écrans les plus profondément imbriqués.

### 436. L'étage 1 charge la police par CHEMIN et ne vérifie jamais que l'app la RÉSOUT par nom

**Fermé le 08/09/2026.** Le contrôle croise le thème **RÉEL** de l'app
(`argusTheme()`) avec le manifeste de polices que `flutter test` produit
lui-même — une source **extérieure** au harnais, dérivée des pubspecs par
l'outil. Comparer quoi que ce soit de déclaré au harnais avec lui-même aurait
été circulaire, et c'est exactement ce qui manquait au garde existant.

📌 **Aucun faux positif possible** : `TextStyle(fontFamily:, package:)` compose
le nom préfixé dès son constructeur, donc un projet qui fait les choses
correctement correspond au manifeste. C'est le piège inverse — resserrer un
matcher crée un sous-matching — et il a été écarté en mesurant les deux sens.

🔴 **Prouvé par EXÉCUTION sur le cas réel, dans les trois directions** : le nom
nu contre un manifeste préfixé **rougit** en nommant le remède ; le nom préfixé
des deux côtés **passe** ; l'absence de thème **skippe en imprimant sa raison**.
Le troisième état compte autant que les deux autres — un refus muet se lit comme
un vert —, et la **CI l'exerce** sur un projet fraîchement créé, seule exécution
réelle de ce mécanisme dans le dépôt.

⚠️ **Le garde Node n'est que le barreau du CÂBLAGE, et il le dit.** Une mécanique
que plus personne n'appelle mesure encore parfaitement, et sa suite reste verte :
c'est le seul mode de panne que Node puisse voir ici. La hiérarchie du chantier
vaut telle quelle — lire du texte < appeler et lire ce qui revient < exécuter de
bout en bout — et le dernier barreau vit dans la CI, pas dans la suite de gardes.

Le harnais garantit que la famille déclarée est bien
**chargée en test** — c'est le garde écrit contre le repli silencieux sur la
police de `flutter_test`. Rien ne garantit qu'elle soit celle que l'**application**
enregistre : le test charge un fichier par son chemin, l'app résout une famille
par son **nom**, et les deux mondes ne se rencontrent nulle part.

L'écart apparaît dès que la police vient d'une **dépendance** — le cas que le 429
vient d'ouvrir. Le manifeste de polices enregistre alors la famille **préfixée**
(`packages/<paquet>/<famille>`) tandis que le code de l'app demande le nom **nu** :
Flutter ne trouve pas, retombe sur la police système, sans erreur ni log. Mesuré
sur le terrain — code `'<Famille>'`, manifeste `packages/<paquet>/<Famille>`.

🔴 **Conséquence directe, que le run a eu l'honnêteté d'écrire lui-même** : les
45 troncatures qu'il a relevées décrivent le rendu **voulu**, pas celui de
l'appareil. Un relevé de dette entier porte sur un écran que personne ne voit.

📌 La source de vérité existe et elle est gratuite : `flutter test` **produit
lui-même** le manifeste des polices de l'app, à l'étage 1, sans device et sans
build. C'est une source **extérieure** au harnais, donc elle ne peut pas être
circulaire — ce qui est exactement ce qui manquait au garde existant.

### 437. Le garde de résolution de police ne confrontait que DEUX termes sur trois

**Fermé le 08/09/2026.** La décision est **extraite** en fonction pure — trois
ensembles entrent, un défaut ou `null` sort —, ce qui la rend exerçable sans
projet, sans device et sans manifeste sur le disque. C'est l'extraction qui rend
le garde possible : lire la source ne verrait pas une valeur neutralisée, et
monter un vrai projet pour éprouver une comparaison n'est pas un test que
quelqu'un rejoue.

📌 **Les deux verdicts restent DISTINCTS, et c'est le cœur du correctif** : une
famille absente du bundle est un défaut de l'**application** — l'appareil ne rend
pas cette police —, une famille non chargée est un défaut de la **suite** :
l'app va bien, ce sont les mesures qui mentent. Les confondre enverrait réparer
du code qui marche.

📌 Le contrôle du harnais tourne **même sans manifeste**, d'où sa place après la
sortie « pas pu mesurer » : le ranger derrière ce garde-là l'aurait rendu vacant
sur toute machine n'ayant pas encore lancé `flutter test`.

✅ **Exercé en Dart pur sur la fonction EXTRAITE DU FICHIER LIVRÉ**, cinq cas,
**5/5 conformes** — dont celui qui n'a pas de manifeste. ⚠️ Mon premier
extracteur rendait **164 caractères pour une fonction de 58 lignes** : il
s'arrêtait sur l'accolade de la signature. C'est le compilateur qui l'a dit, et
l'extraction porte désormais sa contre-épreuve (un plancher de lignes, et les
deux verdicts exigés).

⚠️ **Un garde ancien a refusé le correctif d'abord, pour une raison
instructive** : il cherchait « le premier `reason:` du fichier », et le nouveau
groupe de tests en a posé un au-dessus — il mesurait donc le message de
quelqu'un d'autre. Ré-ancré sur le test qu'il garde, par son nom. **Cinquième
fois du chantier qu'un garde en place arrête un correctif juste.**

Le **436**, écrit la veille, compare ce que le THÈME de
l'app demande à ce que le BUNDLE enregistre. Les deux mesures sont justes, et il
reste **vert** sur le cas que le run 64 a produit : une application qui résout
parfaitement sa police, et un harnais qui la charge **sous un autre nom**.

Le thème demande alors une famille que `argusFonts` n'a pas chargée, le montage
retombe sur la police de `flutter_test` — un carré d'un cadratin par glyphe,
environ deux fois plus large — et **toute mesure de disposition devient fausse**
pendant que le contrôle annonce « conforme ».

🔴 Mesuré par le run, seule cette clé changeant : **297 verts / 186 rouges** sous
le nom nu contre **356 / 127** sous le nom résolu. **59 gardes basculent**, et ils
décrivaient un rendu que l'appareil ne produit jamais.

⚠️ **Le garde voisin ne le voit pas non plus** : il vérifie que `argusFontFamily`
est une clé de `argusFonts`, c'est-à-dire la cohérence **interne** du harnais.
Ici les deux étaient cohérents entre eux, et faux tous les deux. Reproduit sur le
terrain, restauration prouvée par hash à chaque essai.

📌 C'est le motif du chantier appliqué à mon propre correctif, deux jours de
suite : le **429** a ouvert le **436**, et le **436** ouvre celui-ci. *Une
correction déplace un mode de panne plus souvent qu'elle ne le ferme.*

### 438. Un run qui ne rend AUCUN constat est invisible au compteur de la page

**Fermé le 09/09/2026.** Un run sans constat a désormais **un endroit où être
écrit** — la section ci-dessous —, et elle porte sa propre raison pour que
personne ne la retire comme une liste vide de contenu. Le garde tient les deux
moitiés : le **fichier réel** (la section existe, elle dit pourquoi, son tableau
nomme ses runs) et un **corpus fabriqué** où le dernier run n'apparaît QUE là.

🔴 **Et ce garde a trouvé un défaut dans mon propre remède, le jour même.** Le
tableau écrivait `| **65** |` sans le mot « run » : le compteur lisait le numéro
**par accident**, dans le paragraphe au-dessus. Mettre à jour une ligne sans
toucher la prose aurait laissé le chiffre en arrière, en silence — exactement le
défaut qu'on venait de fermer, reproduit dans sa correction. Le tableau nomme
ses runs, et le garde exige cette forme **dans le tableau**.

Le numéro de run affiché par la page publiée dérivait du
**backlog** — le plus grand run qu'il cite. Or un run sans constat n'a rien à y
inscrire : il n'apparaît nulle part, et le compteur reste au précédent. Mesuré
après le run 65 : `runs: 64`, alors que `check-etalons` en contrôlait 64 de run2
à run65.

🔴 **C'est le run qui compte le plus qui est invisible.** Le critère de sortie
est « aucun constat ne coûterait quelque chose à quelqu'un qui applique le
skill » : le run qui le remplit est, par définition, celui qui n'écrit rien.

📌 **Le diagnostic évident était faux, et l'exécution l'a corrigé.** J'ai d'abord
écrit que le compteur « ne pouvait pas voir » ce cas. Exercé sur quatre formes,
il lit un numéro en prose (`65`), dans un titre de lot (`62`), dans une
énumération de campagne (`44`) et dans une section dédiée (`65`). **L'instrument
va bien ; c'est la source qui ne recevait rien.** Corriger l'instrument aurait
été le remède d'à côté.

### 439. Le contrôle d'ordre du registre rendait « aucune rupture » sans rien lire

**Fermé le 09/09/2026.** Les **trois** sorties du lecteur refusent désormais de
se taire — titre introuvable, `</table>` absent, zéro `<td class="id">` — parce
que les trois veulent dire « je n'ai rien mesuré », jamais « rien à signaler ».
Le désordre est corrigé dans la page : `422–427` a retrouvé sa place entre
`415–421` et `428–433`, et le contrôle rejoué **sur le HTML** rend zéro rupture,
cette fois en ayant lu.

`rupturesDOrdreDu` lit le HTML de la page — elle
cherche `<td class="id">` entre le titre du registre et son `</table>`. Passée le
texte **dépouillé** que rend `texteDeLaPage`, elle ne trouve ni l'un ni l'autre,
sort par un `return []`, et l'appelant lit **« ✅ aucune rupture »**.

🔴 **Trois republications de suite l'ont annoncé** — runs 63, 64, 65 — pendant
qu'une entrée du registre était rangée **deux cents lignes trop haut** :
`422–427` coincé entre `213–217` et `218–224`. C'est Germinator qui l'a vu, en
regardant la page : « je crois que certains numéros ont sauté ». Aucun n'avait
sauté ; c'était un désordre, et le seul instrument qui pouvait le dire se taisait.

📌 **Le garde n'était pas en cause, l'APPEL l'était** — vérifié en l'exécutant
sur le HTML brut, où il rend la rupture exacte du premier coup. C'est la
deuxième fois en deux points (438, 439) que l'instrument va bien et que la façon
de s'en servir ne va pas.

⚠️ **Et un garde en place figeait le comportement muet** : il assertait
`rupturesDOrdreDu('<p>rien ici</p>') === []`, sous le commentaire « il ne conclut
pas ». Or rendre une liste vide EST une conclusion — elle se lit « aucune
rupture ». *« Je n'ai rien lu » et « tout est en ordre » ne peuvent pas rendre la
même valeur.*

## Runs 66 et 67 — la confirmation par plateforme, et elle ROUVRE la sortie

Deux runs en aveugle joués le 09/09/2026 pour lever la réserve du 07/09 : le
critère de sortie était rempli sur le **seul** run 65, et le verdict demandait
une confirmation **par plateforme**. Germinator a tranché pour deux runs — un par
terrain, un par plateforme — plutôt que d'assumer le relevé unique.

Il a eu raison, et c'est la mesure qui le dit : **le run 65 seul rendait « aucun
constat » ; ces deux-là en rendent quatre.** Aucune des deux combinaisons jouées
n'avait été exercée récemment — c'est le seul choix de terrain qui pouvait les
trouver.

| le run | plateforme | terrain | ce qu'il a rendu |
|---|---|---|---|
| **run 66** | iOS | sans API | 0 ancre trouvée → **82 posées** · 41 + 417 tests d'étage 1 en 0 · **10 flows, 0 major** · 11/11 écrans · 21,8 min de device sur 60 · **2 constats** |
| **run 67** | Android | avec API | 16 commandes déjà posées / 31 → **100 %** · 44/44 puis 604/604 · scope `complet`, 6/6 écrans · **2 constats** |

⚠️ **Trois autres points remontés par les agents ont été DÉMENTIS** par
reproduction (444, 445). Ils restent écrits : ce qui a de la valeur n'est pas
qu'ils étaient faux, c'est que le skill avait déjà traité le cas — et mieux que
ce que l'agent supposait.

📌 **Ce que les deux runs ont prouvé du skill, sans qu'on le leur demande** : la
police résolue (**174,3 dp** contre **202,5** avec une famille inexistante — le
**437** paie une troisième fois), le DSN de télémétrie à **0 dans les trois
encodages sur la RELEASE**, la contre-épreuve visuelle par aplat magenta **aux
dimensions exactes** où un seul écran rougit, et le garde « une page par
plateforme » qui a tenu alors que le cadrage donnait à l'agent l'URL de l'**autre**
plateforme — il a trouvé la bonne page seul et n'a rien écrasé.

### 440. Le Dart LIVRÉ ne passe pas l'analyse statique, et rien ne l'analyse

**Fermé le 09/09/2026.** Les trois quotes sont corrigées, et surtout la mesure
qui les voit est désormais JOUÉE : la liste de lints vit dans
`tools/scaffold-lints.yaml`, que `bench.sh` **et** la CI LISENT — la recopier
dans les deux les aurait fait diverger une règle à la fois. Prouvé dans cet
ordre : banc rouge sur les trois sites exacts, **toujours rouge après le
recâblage** (donc il n'a pas été vidé), vert après correction.

Trois chaînes à double quote dans le scaffold — `argus_harness.dart:239`,
`layout_test.dart:61` et `:78` — font rougir `flutter analyze` sur tout projet
qui active `prefer_single_quotes`. Le terrain du run 66 l'active.

🔴 **Ces deux fichiers sont classés `ARGUS:CADRE`, donc « remplaçable par
`--update` ».** Le correctif que l'agent a appliqué chez lui sera donc **effacé
au prochain update**, et le rouge reviendra. Le défaut se rejoue indéfiniment ;
il ne peut se fermer que dans le plugin.

⚠️ **`git blame` : les quatre occurrences viennent du MÊME commit du 08/09**,
celui du **437**. Un correctif de la veille a introduit un défaut d'un autre
ordre dans le livrable — et aucune des relectures de ce correctif ne pouvait le
voir, puisqu'elles portaient sur la police.

📌 **Le point n'est pas les trois quotes, c'est qu'aucun garde ne lit le Dart
livré.** `check-scaffold.sh` fige la *classification* des 34 fichiers, jamais
leur validité : un fichier peut être parfaitement classé et refuser de compiler.
Le scaffold porte **7 fichiers Dart** posés chez des tiers, et rien ne les
soumet à l'analyse que ces tiers appliquent.

⚠️ **Le remède ne doit PAS être un balayage textuel des doubles quotes** : le
mien, écrit pour reproduire, a sous-compté — son motif excluait les `\`, donc il
ratait la ligne 239 qui porte un `\n`. Et il aurait sur-compté dans l'autre
sens : la quatrième occurrence (l. 215) est une chaîne imbriquée qui **contient**
des apostrophes, où les doubles quotes sont obligatoires. L'agent, lui, a
discriminé correctement les trois vraies des une fausse.

### 441. `artifactFor` résout deux clés sur trois par plateforme

**Fermé le 09/09/2026.** `artifactFor` résout les trois clés, et
`identitePubliee` reçoit l'icône **déjà résolue**, comme le titre et l'url :
le correctif supprime l'endroit où la lecture à plat pouvait vivre, au lieu de
la relire attentivement. Le garde gagne la moitié qui manquait — les deux
icônes suivent leur plateforme et aucune ne fuit sur l'autre — plus un critère
**total et négatif qui ne nomme aucune clé** : aucune ligne rendue ne contient
`[object Object]`. Un garde qui énumérerait `url`/`title`/`icon` raterait la
quatrième, exactement comme les deux vagues précédentes.

```js
return { url: choisir(a.url), title: choisir(a.title) };
```

`choisir` sait pourtant déjà lire les deux formes (chaîne, ou objet indexé par
plateforme). Il n'est simplement pas appliqué à `icon` — la troisième clé qui
décrit la même page.

Conséquence mesurée : un projet à deux plateformes porte deux pages, chacune avec
son icône. Une valeur unique en renommerait une des deux, et une icône qui change
se lit comme une seconde page (le skill le dit lui-même : « c'est ainsi qu'on
retrouve la page »). L'agent a donc laissé `artifact.icon` **vide**, faute de
forme exprimable, et l'a écrit dans ses arbitrages.

📌 C'est le motif de la **parité entre voisins**, appliqué à trois clés d'un même
bloc : deux ont reçu le traitement par plateforme quand il a été ajouté, la
troisième est restée derrière. Rien ne pouvait le voir — chaque clé est correcte
prise à part.

### 442. Un acquittement MAL FORMÉ est écarté sans un mot

**Fermé le 09/09/2026.** `acquitter` rend `malFormees`, et `report.mjs`
l'annonce **hors** du garde `toutesLues` : une entrée mal formée l'est quelles
que soient les dimensions qui ont tourné, et la taire tant que l'inventaire est
incomplet aurait rejoué le défaut qu'on ferme. Le garde couvre les deux
moitiés — la chaîne nue est nommée et n'acquitte toujours rien, la forme
correcte reste silencieuse et acquitte — plus le cas vide, pour qu'un projet
qui n'acquitte rien ne reçoive pas d'avertissement.

```js
.filter((a) => a && String(a.id ?? '').trim() !== '')
```

Écrite en chaîne nue (`- QAM-SEC-CLEAR` au lieu de `{id, why}`), l'entrée a un
`a.id` `undefined` : elle est filtrée **en silence**. Le finding reste `open`, et
rien n'indique que la forme était mauvaise — l'utilisateur croit avoir acquitté.

⚠️ **L'asymétrie est ce qui condamne le code**, pas le filtre lui-même : le cas
voisin — un `id` correct mais un `why` vide — est traité avec soin trois lignes
plus bas (`status: 'open'` **et** un message « acquittement SANS raison : il ne
compte pas. Écris pourquoi. »). Une case a son message, sa voisine n'a rien.

⚠️ Et l'entrée mal formée ne tombe même pas dans `perimes`, qui est pourtant le
canal déjà prévu pour signaler un acquittement inutile : elle est filtrée
**avant** d'y arriver. Doublement invisible.

📌 Motif connu : un composant dont le rôle est d'**écarter** produit une absence,
et une absence ressemble à « il ne s'est rien passé ».

### 443. Un acquittement HONORÉ n'atteint pas la page publiée — et le compteur contredit la liste

**Fermé le 09/09/2026.** La carte porte sa marque et sa raison, et le titre
de groupe distingue les assumés sans rien retirer du total.

🔴 **ET MON DIAGNOSTIC ÉTAIT FAUX SUR UN POINT — corrigé dans le code plutôt que
laissé debout.** J'avais écrit que le compteur contredisait la liste. Non :
`counts` compte TOUS les findings, exprès et documenté (« un signal qu'on assume
ne se supprime pas, il change de statut »), et seul `bloquants` — qui ne nourrit
que le gate — les exclut. Les deux étaient d'accord. Ce qui manquait était le
statut à l'écran, rien d'autre. *Un commentaire faux vaut un garde faux* : il a
été réécrit avant d'être commité.

`acquitter()` pose bien `status: 'acknowledged'` et `acknowledgedWhy` dans
`sec.json`. Le rapport HTML en lit **une moitié** :

- le compte par sévérité **exclut** l'acquitté
  (`f.severity === s && f.status !== 'acknowledged'`) ;
- `findingCards` groupe par sévérité **sans regarder le statut**, et
  `acknowledgedWhy` n'apparaît nulle part dans le rendu.

🔴 **Donc la page affiche un `critical` nu qui n'est pas compté dans son propre
total.** Deux mesures du même objet, sur la même page, qui ne peuvent pas être
vraies ensemble — et la **raison** de l'acquittement, qui est tout l'intérêt du
mécanisme, ne sort jamais du JSON.

⚠️ Le run 67 a fait exactement ce que le §3d bis prescrit : *« correctif
SÉMANTIQUE → on remonte, on ne diverge pas »*. Il n'a pas patché `report.mjs`.

### 444. ✅ DÉMENTI — « le flow i18n serait vert quoi qu'on déclare »

**Rendu par les DEUX runs (66 et 67), démenti par lecture du code le 09/09/2026.**

Les deux agents ont observé, chacun sur sa plateforme, que la locale de
l'appareil n'est pas celle déclarée et que le flow i18n mesure donc la première.
C'est **exact** — et le skill l'avait déjà traité, plus finement que ce qu'ils
supposaient :

- `localeWarnings()` avertit que `locale.deviceLocale` « n'aura AUCUN effet » et
  dit explicitement que « le flow i18n mesure la locale de L'APPAREIL » ;
- `localeFindings()` émet `QAM-LOCALE-INERTE` **pour que l'avertissement survive
  au terminal** — son dartdoc dit qu'il ne sortait qu'en console, « donc elle
  mourait avec la [session] » ;
- et l'avertissement a été **volontairement restreint** : il sortait « dès que la
  clé était renseignée et `autoStart` faux — c'est-à-dire sur la disposition que
  le skill RECOMMANDE », et ne sort désormais que si la locale effective diffère
  de la demandée.

📌 Les deux runs l'ont rapporté comme une limite ; c'est en réalité le mécanisme
qui fonctionne, et qui les a informés. Le garder ici évite qu'un troisième run le
rouvre.

### 445. ✅ DÉMENTI pour l'essentiel — « la limite des blocs YAML n'est écrite nulle part »

**Rendu par le run 67, démenti par lecture le 09/09/2026.**

Le parseur refuse `|` et `>` (`bloc multi-lignes (| ou >) non supporté`) — c'est
exact. Mais l'agent écrit que « la limite n'est écrite nulle part dans
`argus.mobile.yaml` », et c'est **faux** : elle est en tête du fichier, ligne 27,
dans la liste de ce que le sous-ensemble ne supporte pas — « ancres/alias (&, *)
· blocs multi-lignes (|, >) · maps en flow ({a: 1}) ».

⚠️ **Ce qui reste vrai, et vaut moins qu'un point** : une autre clé du fichier
porte un rappel **local** (« ⚠️ SUR UNE SEULE LIGNE »), celle où l'agent est tombé
n'en a pas. C'est la même parité entre voisins que le 441, à un degré mineur.

### 446. Le correctif du 439 a rendu son propre outil inutilisable, une journée durant

**Fermé le 09/09/2026**, trouvé en relançant `check-artefact.mjs` pour republier
la page de cette passe.

Le **439** a rendu `rupturesDOrdreDu` BRUYANTE : elle lève désormais au lieu de
rendre `[]` quand elle n'a rien lu. C'est le bon correctif. Mais **son appelant
est resté sur le texte dépouillé** — `check-artefact.mjs:123` passait `texte` là
où il faut `html`. Le faux vert est donc devenu un **CRASH** : l'outil ne peut
plus rendre aucun verdict, et il est resté ainsi **une journée entière** sans que
personne le voie, faute d'avoir été relancé.

📌 **Fermer le silence d'un instrument ne suffit pas : il faut rejouer ses
appelants.** Sinon on remplace un faux vert par une panne — et la panne est plus
honnête, mais elle ne se voit pas davantage tant que rien ne lance l'outil.

⚠️ **C'est le 440, une seconde fois, le même jour et dans le même dépôt** :
aucun garde ne couvrait `check-artefact.mjs`, aucune CI ne le lance. Le garde
écrit ici l'EXÉCUTE sur une page fabriquée, et couvre les deux sens — registre en
ordre reconnu comme tel, registre en désordre nommé (`11 vient après 12`).

⚠️ **Et mon premier montage était AVEUGLE, ce qui accusait le code à tort.**
`'…' + '…'.repeat(60)` n'applique `repeat` qu'à la SECONDE chaîne : le bourrage
retombait sous le plancher de 5 000 caractères lisibles, l'outil sortait en
« instrument aveugle », et le garde échouait en désignant le défaut 446 — qui
était pourtant déjà corrigé. *Un montage qui n'arme pas ne se tait pas, il
rapporte autre chose comme un fait.* Ce sont les DEUX refus de l'outil (plancher
de lisibilité, témoin `/argus/i`) qui l'ont dit — ils sont justes, et ce sont eux
qui rendent le montage vérifiable.

### 447. Le dartdoc promettait des marges système que le harnais n'applique pas

**Fermé le 09/09/2026**, rapporté par le run 68 (Android, terrain sans API) et
reproduit en lisant `pumpArgus`. Les deux mutations font tomber le garde.

Le dartdoc de `build:` disait : « Fournis-le SANS Scaffold ni MaterialApp : le
harnais pose lui-même la surface, la police et **les marges système**. » Les deux
premières, oui. La troisième, non : `pumpArgus` renseigne `view.padding` ET
`view.viewPadding` — il **déclare** les insets — et ne pose **aucun** `SafeArea`
qui les consomme. Un écran monté nu commence donc à **0,0 dp**.

Le run l'a découvert par l'autre bout : `cropRoot: true` exige que la racine ne
commence pas plus haut que l'inset, mesuré à **24,0 dp**. Deux consignes
inconciliables — *monte nu* et *sois sous l'inset* — dont aucune ne dit laquelle
décrit le montage. Il a tranché seul, correctement, en reproduisant la coquille
(`Scaffold(body: SafeArea(…))`), et a écrit que le skill devrait le dire.

🔴 **Et le remède évident est le mauvais.** Poser un `SafeArea` dans `pumpArgus`
ferait passer le garde partout — y compris sur une racine posée AU-DESSUS du
`SafeArea` de son propre écran, c'est-à-dire **exactement le défaut que
`cropRoot` existe pour voir**. Le garde deviendrait vacant sans un mot, et la
méthodologie raconte qu'il a déjà fallu trois racines à 0 dp pour s'en apercevoir
une première fois. Le correctif est donc **documentaire**, et le garde tient les
DEUX moitiés : les insets restent déclarés, et rien ne doit les appliquer.

⚠️ **Le garde a failli naître faux, et c'est son propre refus qui l'a dit.** Deux
fois : (1) `pumpArgus` **parle** de `SafeArea` dans le commentaire qui explique
pourquoi les deux paddings sont renseignés — un motif nu aurait été rouge sur un
fichier sain, d'où le dépouillement des commentaires ; (2) borner la fenêtre sur
`\n}` matchait la **signature** (`}) async {` ferme les paramètres nommés), si
bien que le corps scanné s'arrêtait avant la première ligne utile. C'est
l'assertion « le commentaire doit être là » qui a fait tomber le test, sur un
code pourtant correct. *Une fenêtre calculée par index se prouve avant de servir.*

### 448. La règle et l'outil qui la vérifie n'étaient pas dans la même commande

**Fermé le 09/09/2026**, rapporté par le run 68 et mesuré dans le Makefile. Les
deux mutations font tomber le garde.

Le dartdoc de `cropRoot` décrit la mesure de position, puis nomme
`--check-anchors` à la ligne suivante. La méthodologie fait pareil. **Les deux
phrases sont justes séparément** — le croisement EST dans `make argus-anchors` —
mais accolées, elles disent qu'on vérifie la position là.

Mesuré dans le Makefile : `argus-anchors` lance `config.mjs --check-anchors` et
**`test/argus/anchors_test.dart` seulement** ; le garde de position vit dans
`layout_test.dart`, que seul `argus-guards` lance (`flutter test test/argus`).

🔴 **Le coût est un FAUX VERT, le pire des verdicts.** Le run a muté son montage
pour prouver le garde, relancé `argus-anchors`, l'a vu passer — et en a conclu
que le garde était vacant. Deux verdicts de mutation perdus, dont un qui
affirmait le contraire de la vérité. *Une information juste au mauvais endroit ne
sert personne ; nommée à côté d'une règle, elle dit où la vérifier.*

📌 **Le garde DÉRIVE la cible du Makefile au lieu de la citer** : il découpe les
recettes, cherche laquelle couvre `layout_test.dart`, et exige que les deux
textes nomment celle-là. Si la suite déménage, c'est lui qui le dira.
⚠️ Et il a fallu un discriminant que je n'avais pas prévu : **`argus-debts` lance
la même suite**, mais pipe sa sortie pour en extraire les clés de dette — le code
de sortie du test n'y décide plus de rien. La cible à nommer est celle qui laisse
ce code parler, donc celle qui ne pipe pas. Le garde a refusé de conclure devant
les deux, ce qui est exactement ce qu'on lui demande.

### 449. Un code de sortie qui est un VERDICT se lisait comme une panne

**Fermé le 09/09/2026**, rapporté par le run 68 et dérivé du code. La mutation
fait tomber le garde.

`make: *** [argus-perf] Error 1` ressemble à un outil cassé. C'est le contraire :
`exitCodeFor` rend **2** sur un `blocker`/`critical` retenu par le gate, **1** sur
un `major`, **0** sinon — la dimension a trouvé ce qu'on lui demandait de
chercher. Le Makefile l'explique, mais **pour `argus-run` et pour la cible
`argus`**, pas pour les dimensions ; le SKILL ne le disait nulle part, et c'est
le SKILL qu'on lit d'abord.

📌 **Le garde DÉRIVE la liste des dimensions** : il relève les scripts dont le
code de sortie dépend de `exitCodeFor`, exige que le SKILL prévienne là où il
énumère la séquence, et vérifie que les deux codes annoncés sont ceux que la
fonction rend. Une dimension ajoutée demain entre dans le compte toute seule.

⚠️ **Et le dépôt m'a corrigé en écrivant ce correctif.** Ma note faisait quatorze
lignes ; elle a fait tomber un garde de PROXIMITÉ (294) qui exige que le renvoi
vers le diagnostic reste à moins de quarante lignes de la séquence — « c'est là
qu'on lance `argus-run`, donc là qu'il faut savoir ». Trois tentatives pour
repasser sous le seuil (48, 41, 40 lignes), et le seul remède honnête était de
condenser : **relever le seuil aurait affaibli un garde existant pour faire de la
place à ma prose.** Un texte de référence a une économie, et elle se mesure.

### 450. ✅ DÉMENTI EN ENTIER — et mon remède l'était aussi

**Fermé le 09/09/2026.** Le run 68 proposait de lever la réserve du §2b :
`install-mobile.sh --check` imprime bien l'inventaire nommément, donc la mise en
garde serait périmée.

🔴 **Exécuté sur un vrai terrain** : l'inventaire sort, `argus_fakes.dart` y
figure, exit 0. La phrase est donc vraie — mais **la réserve est au PASSÉ**
(« cette seconde moitié A ÉTÉ fausse pendant plusieurs runs ») et elle raconte en
outre un piège de mesure : sur un terrain EN RETARD, `--check` imprime une autre
liste, celle des fichiers en retard. Rien à lever, les deux phrases sont justes.
*Une réserve écrite au passé se lit comme active ; c'est ce qui a trompé le run.*

🔴 **ET J'AI FAIT PIRE QUE LUI.** J'ai cru trouver derrière ce démenti une parité
manquante — « la moitié `--check` n'a pas de garde » —, écrit ce garde, écrit sa
mutation, commité les deux. **Les deux existaient depuis le point 278**, et ma
mutation reprenait *le motif exact* de la mutation 175, à la ligne près. J'ai
ajouté un filet que le dépôt portait déjà, dans une passe dont c'était justement
le sujet.

📌 **Ce n'est pas une relecture qui l'a dit, c'est la MUTATION** : le harnais a
rendu `TOMBE` en nommant « `--check` imprime la liste des fichiers À TOI (278) »,
c'est-à-dire **un test qui n'était pas le mien**. Sans lire ce nom, j'aurais lu
le vert comme la preuve de mon propre garde et publié le doublon.
⚠️ *Le harnais affiche le test qui tombe ; c'est la seule chose qui distingue
« mon garde marche » de « un autre garde faisait déjà le travail ».*
📌 Et le geste qui l'aurait évité coûte dix secondes : **chercher le garde
existant avant d'en écrire un** (`grep` du nom de la commande dans la suite), au
lieu de déduire son absence du fait qu'on ne l'a pas croisé.

### 451. Le tell aiguillait vers deux formes, le run en a rencontré une troisième

**Fermé le 09/09/2026**, rapporté par le run 68. Les deux mutations font tomber
le garde — une par côté, puisque c'est la parité qu'il tient.

Le tell « la pire attente est-elle COLLÉE au plafond ? » est le meilleur outil de
diagnostic du skill — le run l'a suivi et dit qu'il lui a épargné deux passes
device. Il aiguille vers la cause 2, « ce n'est pas l'écran qu'on croit », qui
nommait **deux** formes : la modale système et l'écran d'après-connexion.

Il en a rencontré une troisième, que rien ne nomme : **une AUTRE APPLICATION au
premier plan**, installée sur le même appareil par un travail voisin. Trois flows
sur huit morts, pire attente **20 725 ms contre un plafond de 20 000** — collée à
725 ms. Sa capture montrait l'écran de connexion d'une app sans rapport.

📌 Il a trouvé seul le geste qui tranche : `adb shell pm list packages -3` croisé
avec le `lastUpdateTime` de `dumpsys package`. Une commande, et le nom du
coupable avec son horodatage.

🔴 **Et la cause est de NOUS, pas du skill.** L'émulateur du second terrain avait
été éteint pour libérer la mémoire ; la session qui y travaillait s'est donc
rabattue sur **le seul appareil listé** — celui du run. C'est le piège du run 17
(« prendre le premier appareil sans lire l'AVD déclaré »), retourné contre notre
propre protocole. *Éteindre un émulateur ne suffit pas : il faut que l'autre
travail sache qu'il n'a plus d'appareil à lui.*

📌 **Le garde porte la PARITÉ, pas la phrase.** La liste des causes vit à deux
endroits — le message que le runner imprime à l'instant de l'échec, et le SKILL
qu'on lit avant — et il exige les trois formes **des deux côtés**, plus le geste
qui tranche. Ajouter une forme à un seul texte est exactement le défaut que ce
dépôt traque : deux textes justes séparément, dont l'écart ne casse rien.

### 452. Le compteur d'ancres comptait le code mis en COMMENTAIRE

**Fermé le 09/09/2026**, rapporté par le run 69 (iOS, terrain avec API) et
reproduit par exécution. La mutation fait tomber le garde 435 étendu.

Les comptages du §2b filtraient `grep -v "^\s*///"` : le dartdoc, et **rien
d'autre**. Tout code mis en commentaire ORDINAIRE restait compté —
`// Semantics(identifier: 'x')`, ce que produit chaque refonte d'écran.

Le run l'a mesuré sur sa propre fixture (attendu 1, obtenu **2**). Reproduit
ici sur une fixture à **une** vraie ancre, avec les trois formes de commentaire :
la commande rendait **3**. Le filtre en `//` — qui couvre `///` par construction
— rend **1**.

📌 **Et le SKILL portait DÉJÀ la bonne forme, deux cents lignes plus haut** : le
§2a inventorie les canaux sortants avec `grep -v '^\s*//'`. Une parité manquée
**à l'intérieur du même document**, entre deux commandes qui font le même geste
— la classe des runs 66-67, appliquée à un texte au lieu d'un code.

⚠️ **La limite est dite plutôt que taise** : un filtre par LIGNE ne voit pas un
commentaire en fin de ligne (`x; // identifier: 'y'`). Mieux vaut l'écrire que
laisser croire à une étanchéité.

📌 **Pas de garde neuf : le garde 435 exécutait déjà cette commande** sur une
fixture, il lui manquait cette forme. L'étendre valait mieux qu'un jumeau —
leçon du 450, appliquée le jour même.
⚠️ **Et je l'ai d'abord étendu à l'ENVERS** : ma fixture était écrite APRÈS le
`spawnSync` qui mesure, donc jamais lue — le garde passait au vert sans voir la
forme qu'on venait d'ajouter. C'est le défaut du 449 (« la mesure prise avant
l'action qu'elle juge »), commis dans l'autre sens. Un contrôle de POSITION le
tranche en deux lignes, et il est désormais dans le fichier.

### 453. ⚠️ VRAI À MOITIÉ — l'information existait, pas là où on la lit

**Fermé le 09/09/2026**, rapporté par le run 69. La mutation fait tomber le
garde 427 étendu.

Le run dit que le §2c prescrit « ancre sur l'ENFANT » sans jamais dire d'omettre
`container: true`, et qu'il a posé les deux — la recette voisine, celle de la
racine d'écran, l'exigeant — pour obtenir **4 ancres inertes**.

🔴 **Vérifié, et le SKILL le dit** : dix lignes sous l'exemple, « ajouter
`container: true` colle la géométrie et rend l'ancre **inerte**. Les deux
remèdes s'excluent. » L'information est là, elle est juste, et le point 427 lui a
même donné un garde.

⚠️ **Mais elle vit dans un paragraphe qui traite d'un AUTRE symptôme** — le nœud
fusionné avec la rangée (324×48 dp pour un widget de 18×18). Un lecteur qui n'a
pas ce symptôme ne s'y reconnaît pas, et rien dans l'exemple ✅ ne l'avertit. Le
document porte donc deux recettes qui se contredisent sur `container: true`, à
quinze lignes l'une de l'autre, sans que la seconde le dise.

📌 *Une information juste au mauvais endroit ne sert personne* — la phrase est
dans ce dépôt depuis le point 294, appliquée ici à un cas qu'elle n'avait pas vu.
Le remède est **une mise en garde DANS l'exemple**, et le garde 427 — qui bornait
déjà cette section — l'exige désormais. Pas de garde neuf : leçon du 450.

### 454. Le verdict lu PENDANT le run est celui de la passe précédente

**Fermé le 09/09/2026**, rapporté par le run 69 et vérifié dans `run.mjs`.
La mutation fait tomber le garde.

`report.junit.xml` et `report.visual-<écran>.junit.xml` sont des chemins
**FIXES** (`junitPath: join(reportDir, …)`) : chaque invocation les réécrit. Le
run en a ouvert un pendant qu'un run tournait, y a lu un vert, et a conclu **« la
comparaison visuelle ne mesure pas »** — l'inverse du vrai. Sa relecture, treize
secondes plus tard, disait `failures="1"`.

📌 C'est le défaut du **449** dans l'autre sens : *une mesure prise avant l'action
qu'elle juge ne dit rien de cette action* — et ici elle affirme le contraire.
Le §3g le prévient désormais, à l'endroit où l'on lit le verdict.

📌 **Le garde DÉRIVE la condition** : il relève les chemins junit dans `run.mjs`
et n'exige la mise en garde que s'ils sont dépourvus d'horodatage. Le jour où ils
en porteraient, la mise en garde décrirait un mécanisme mort — et c'est ce test
qui le dirait, par un `assert.fail` explicite.

⚠️ **Et il est né VACANT, pour une raison de mise en forme.** Mon motif exigeait
« réécrit à chaque invocation » sur une seule ligne ; la prose du SKILL est
repliée à 80 colonnes, donc il ne matchait rien. Le garde a échoué en accusant un
texte que je venais d'écrire — c'est ce qui l'a dit. Les espaces sont désormais
normalisés avant la recherche, comme les autres gardes de prose de ce dépôt le
font déjà. *Un motif de plus de trois mots ne se cherche pas dans du texte brut.*

### 455. ⚠️ MAL FORMULÉ, MAIS LE GESTE MANQUAIT VRAIMENT

**Fermé le 09/09/2026**, rapporté par le run 69. La mutation fait tomber le garde.

Le run écrit que le §3g-bis est **faux** : « une page volumineuse revient sous
forme de fichier local, dont `read` donne le chemin » — alors que sa page est
revenue EN LIGNE.

🔴 **Le texte n'est pas faux** : il dit « volumineuse (**≈ 650 Ko** dès qu'elle
embarque ses captures) », et sa page en faisait **52**. Une page sans captures
n'est pas volumineuse ; le SKILL ne promettait donc rien sur son cas.

✅ **Mais son problème était réel, et le geste manquait** : quand le HTML arrive
dans la réponse, il n'y a **aucun chemin** à passer, et `--previous` attend un
fichier. Republier sans lui perd tout l'historique. Il a reconstruit le fichier
depuis le `<script id="argus-runs">` de sa propre initiative, **et l'a vérifié**
par `historiqueDe()` — onze onglets sauvés, sur un geste écrit nulle part.

📌 Le §3g-bis porte désormais les DEUX cas, avec le contrôle : `historiqueDe`
rend le compte réel d'un HTML, et `[]` sur une page qui n'a pas le bloc. Le garde
exige le geste **et** son contrôle, puis exerce la fonction citée — reconstruire
un fichier est exactement le genre d'opération qu'on croit réussie.

📌 **La leçon de formulation** : le constat aurait été rejeté si je m'étais arrêté
à « c'est faux, le seuil est écrit ». Le symptôme observé était juste ; c'est son
diagnostic qui portait à côté. *Un rapport contient deux choses de valeur inégale.*

### 456. La connexion conditionnelle n'avait qu'une moitié de condition

**Fermé le 09/09/2026**, rapporté par le run 69. La mutation fait tomber le garde.

Le §2c-ter dit qu'une app authentifiée a **deux racines**, et décrit l'erreur qui
en découle : une branche `goto` qui ramène à l'écran de connexion en croyant
rejoindre l'accueil. Le garde 425 la mesure sur les flows livrés.

🔴 **L'erreur JUMELLE n'y était pas.** Une connexion conditionnelle écrite « si
l'authentification est prête, connecte-toi » se déclenche **aussi** quand
`SCREEN_ID` désigne l'écran de départ lui-même : le flow s'authentifie, quitte
l'écran qu'il devait capturer, et la référence est prise **ailleurs**. La
condition a donc deux moitiés — prête **ET**
`SCREEN_ID !== ARGUS_START_SCREEN`.

⚠️ **Rien ne lève.** La capture est valide, le flow est vert, et c'est simplement
un autre écran. Le run l'a payé d'une génération de références complète, cinq
minutes d'appareil, et ne l'a vu qu'en regardant l'image.

📌 **Le garde porte sur la PRESCRIPTION**, et c'est délibéré : la condition
fautive s'écrit dans le `goto.yaml` du projet, que l'agent possède — rien de
livré ne peut la porter, donc rien de livré ne peut la garder. Il exige que les
deux erreurs soient nommées, qu'elles restent **jumelles** (une phrase unique les
ferait lire comme un seul conseil, ce qui est exactement comment on n'en voit
qu'une), et que le texte dise que la condition EST une conjonction.

📌 **Troisième parité de ce lot**, après 452 (deux commandes du même document) et
453 (deux recettes qui se contredisent). Les runs 66-67 en avaient rendu trois
sur quatre ; le motif ne s'épuise pas.

### 457. Deux canaux de fuite manquaient, dont celui qui s'ouvre par défaut

**Fermé le 09/09/2026**, rapporté par le run 69 pour moitié, mesuré par moi pour
l'autre. Les trois mutations font tomber le garde. Les deux sont inscrits ensemble parce que
**c'est la paire qui est le constat** : le §5 énumérait ses canaux, et il en
manquait aux deux bouts de la chaîne.

🔴 **Le canal PAR DÉFAUT.** Maestro écrit un `commands.json` par flow dans
`--test-output-dir`, contenant le **bloc entier des variables d'environnement** —
donc chaque valeur passée par `-e`, en clair, quoi que fasse `label:`. Mesuré sur
le run 69 : le numéro de test dans **88 fichiers** du rapport (10 chiffres, donc
pas un faux positif), **0** dans les flows écrits par l'agent, **0** dans le HTML.
⚠️ **La mise en garde existante visait le mauvais fichier** : « ne publie jamais
`--debug-output` » — une OPTION, qu'on ne passe pas. Ceci est le comportement par
défaut, à chaque run, sans rien demander.
✅ Et `label:` fait bien son travail : la SAISIE est protégée. Ce qui fuit est
l'environnement, que rien ne masque.

🔴 **Le canal qu'on s'ouvre SOI-MÊME.** Une commande de diagnostic (`ps aux`,
`pgrep -fl`) recopie ces valeurs dans le compte rendu de l'agent, qui est publié.
Le run s'y est vu et l'a signalé — c'est le seul canal que le masquage ne peut
pas fermer, puisque c'est le lecteur qui l'ouvre.

📌 **Le compteur est RETIRÉ, pas incrémenté.** Le §5 disait « `label:` protège
trois canaux et pas le quatrième » : un nombre qui décrit une liste se périme au
prochain ajout, et rien ne le signale — le motif que le point 331 a fermé
ailleurs, revenu dans une consigne de sécurité. Le garde interdit désormais toute
forme « protège N canaux ».

📌 **Et mon premier contrôle a rendu des comptes VIDES**, le chemin du terrain
contenant une espace (un nom de dossier à deux mots) dans un `for f in $(find …)` — le zshisme
que ce dépôt documente. Son zéro se lisait comme « rien ne fuit », c'est-à-dire
la réponse qu'on espère. Refait en `-print0`, il a rendu 88.

🔴 **ET EN ÉCRIVANT CE POINT, J'AI MOI-MÊME FAIT FUITER LE NOM DU CLIENT.** Pour
expliquer le zshisme ci-dessus, j'ai cité le nom du dossier — c'est-à-dire le nom
d'un projet sous contrat — **dans ce fichier, qui vit dans un dépôt PUBLIC**. Ce
n'est pas une relecture qui l'a vu : c'est le garde de confidentialité, à la
première exécution de la suite après le commit. Retiré, puis prouvé sur **tous
les objets du dépôt** (`cat-file --batch-all-objects`, 1396 blobs, 0 occurrence,
contre-épreuve à 63 225) après `reflog expire` et `gc --prune=now`. Le nom n'est
jamais sorti de la machine : `feat/argus-mobile` n'a aucun upstream, et seul un
commit initial existe en distant.
📌 *Le paragraphe qui explique une fuite est exactement celui où l'on cite ce qui
fuit.* Un garde qui balaie tout le fichier vaut mieux que l'attention de qui
l'écrit — surtout quand ce qu'il écrit est une leçon sur les fuites.

## Runs 70 et 71 — la seconde paire de confirmation

Deux runs en aveugle joués les 09 et 10/09/2026, un par plateforme et un par
terrain, pour confirmer le skill après la passe 440-457. La sortie reste
**fermée** : ils rendent quatorze points, dont un que **deux runs indépendants
avaient déjà signalé sans qu'il soit jamais ouvert**.

| le run | plateforme | terrain | ce qu'il a rendu |
|---|---|---|---|
| **run 70** | iOS | sans API | 0 ancre trouvée → **48 commandes posées** · 31/31 puis 364/364 · **6/6 flows, 4/4 comparaisons visuelles** · 9/9 écrans · gate `pass` · ~32 min de device sur 60 · **6 points** |
| **run 71** | Android | avec API | 18/34 commandes déjà posées → **43/43 ancres** · 510/0 gardes · **793 tests** · 6/6 flows · release obfusquée 47,8 Mo · gate `fail` · ~12 min 30 · **7 points** |

📌 **Ce que les deux ont fait de mieux que leurs prédécesseurs, et qui n'est pas
un point à corriger** : le 70 a **refusé deux dettes** parce qu'elles venaient de
son propre montage (relevé passé de 64 à 62, prouvé) ; le 71 a **refusé de
corriger l'app** sur un échec de flow, le code montrant que le verrou après
`killApp` était délibéré — il a corrigé l'assertion — et il a **démonté deux de
ses propres findings**. `argus-reach` a par ailleurs prédit une contradiction
**avant** qu'elle coûte une référence fausse : le seul garde du chantier à voir
un défaut d'avance.

### 458. Le compteur d'ancres était aveugle au CAS DOMINANT

**Fermé le 10/09/2026**, rapporté par le run 71 — et déjà par le **run 67, quatre
runs plus tôt**, sans jamais avoir été ouvert. Les trois mutations font tomber le
garde.

Les deux commandes du §2b ne comptaient que les ancres écrites **en clair**
(`Semantics(identifier: 'x')`). Sur un projet mature, la plupart passent par un
**paramètre de fabrique** (`MonBouton(semanticIdentifier: 'x')`) — ce que le §2c
appelle lui-même, deux cents lignes plus bas, *« LE CAS DOMINANT SUR UN PROJET
MATURE »*.

📌 **Le skill RÉCLAMAIT déjà ce chiffre.** Le gabarit du rapport d'instrumentation
porte la ligne « dont partagées : `<C>` composant(s) couvrant `<S>` call-sites,
paramètre(s) `<NOMS>` » — un nombre qu'aucune de ses commandes n'a jamais su
produire. Ce n'est donc pas un oubli de mesure, c'est une **demande sans
instrument**, ce qui est pire : elle a l'air couverte.

**Reproduit par exécution** sur un projet réel : la commande prescrite rend
**42** là où il y en a **60** — 18 invisibles, soit **30 % du relevé qui ouvre le
rapport**, et le §2b écrit lui-même que ce chiffre « donne le ton de tout le
reste ».

🔴 **ET LA MESURE A TROUVÉ DEUX FORMES QUE LES RUNS N'AVAIENT PAS ISOLÉES** — la
raison pour laquelle le remède ne fige aucun motif de plus :
- `identifier: cond ? 'a' : 'b'` porte **deux** ancres et n'en fait compter
  **aucune** : la valeur recollée vaut `identifier: cond`, sans apostrophe ;
- la commande des **gabarits** rendait `0` sur un projet qui en porte un, son
  recollage ne franchissant qu'**UN** repli — or `dart format` en produit trois
  sur une expression conditionnelle.

Le remède ne cite donc aucun nom : **(a) découvre** quels identifiants alimentent
un `identifier:` — conduits et expressions ensemble —, et sa sortie alimente le
`<NOM>` de **(b)**, qui compte les call-sites. Un nom de paramètre gravé serait
faux au projet suivant ; c'est la troisième mutation qui garde cette portabilité,
et elle ne casse aucun compte — seulement la promesse.

📌 **Et le compte qui fait foi est dit** : `make argus-anchors`, qui les exerce.
Ces commandes servent à l'**état des lieux**, avant que le harnais existe.

📌 **Dette du 452 payée au passage** : le commentaire annonçait encore « le
filtre `///` est indispensable » alors que la commande était passée à `//` neuf
runs plus tôt. Une ligne de commentaire qui contredit la commande qu'elle
surmonte — le lecteur croit le commentaire.

### 459. Le gabarit MONTRAIT une forme que son propre parseur refuse

**Fermé le 10/09/2026**, rapporté par le run 71 (point 8) et par le run 70
(point 4). Les trois mutations font tomber les gardes.

**Trois runs sont tombés sur ce mécanisme** — le 445, le point 4 du run 70, le
point 8 du run 71 — et les deux premiers ont été traités comme un **rappel
manquant**, clé par clé : le 445 a même été démenti « pour l'essentiel », en
notant que la limite était bien écrite en tête du fichier et qu'il ne restait
qu'une parité mineure entre voisines. Deux runs de plus ont montré que la parité
n'était pas mineure.

🔴 **ET LA MESURE A TROUVÉ PIRE QUE CE QU'ILS DISAIENT.** L'exemple que le
gabarit montre sous `security.acknowledged` — deux lignes commentées, prêtes à
décommenter — **est lui-même la forme interdite**. Décommenté *tel quel*, sans en
changer un mot :

    argus.mobile.yaml:538 — valeur sur la ligne ET bloc indenté en dessous

Toutes les commandes s'arrêtent. Ce n'est donc pas un rappel qui manque : c'est
un gabarit qui **enseigne le défaut**, et celui qui suit l'exemple croit avoir
mal recopié.

**Le remède ne recopie aucun rappel** — un rappel posé clé par clé se périme au
prochain ajout, ce que trois runs viennent de démontrer :
1. l'exemple tient sur une ligne, avec la contrainte dite là où on la lit ;
2. le **parseur** distingue les deux causes — une phrase repliée n'est pas un
   bloc indenté — et dit **quoi faire** (« raccourcis-la »). Il couvre ainsi les
   clés qui n'existent pas encore ;
3. un garde décommente **chaque** exemple du gabarit LIVRÉ et exige que le vrai
   parseur l'accepte. Total et négatif : aucun exemple, présent ou futur, ne peut
   être refusé.

📌 Les deux sens sont mesurés : l'exemple corrigé parse, une raison repliée est
refusée avec le nouveau message, et un **vrai** bloc indenté garde le sien —
sans ce jumeau, un remède qui déclarerait tout « replié » passerait pour un
correctif.

🔴 **ET LE GARDE EST NÉ VACANT — c'est la mutation qui l'a dit, pas une
relecture.** Sa première version bornait le bloc d'exemple par *« cette ligne
ressemble-t-elle à du YAML ? »*. Or une continuation de chaîne repliée
(`release — vérifié par…`) **ne ressemble jamais à du YAML** : le critère
excluait par construction la forme qu'il cherchait. Il coupait l'exemple une
ligne avant la faute et parsait un reste parfaitement valide, donc il était vert.
📌 *Une borne de fenêtre doit être **structurelle** — ici l'indentation —, jamais
sémantique : un critère qui décrit ce que la ligne RACONTE est aveugle à ce
qu'elle est.* C'est une façon de naître vacant que le chantier n'avait pas encore
répertoriée.

### 460. Un budget qu'aucune valeur ne peut dépasser a l'air d'un budget tenu

**Fermé le 10/09/2026**, rapporté par le run 70 (point 1). Les deux mutations
font tomber les deux gardes.

`startup.samples` chronomètre la **première attente sur l'ancre**. Tout ce qui
attend AVANT elle lui est donc soustrait, en silence — et
`waitForAnimationToEnd: 5000` attendait avant, absorbant le sas de démarrage.
Mesuré par le run sur une app dont le splash de marque tient **2 s** :
**86 à 130 ms**, ce qui est physiquement impossible si la mesure contenait le
splash. C'est ce désaccord qui l'a démasqué, pas une relecture.

🔴 **ET LA SECONDE MOITIÉ EST PIRE QUE LE LABEL FAUX.** Le relevé s'annonce
« splash et init compris » — faux sur toute app à splash tenu. Mais surtout,
`thresholds.brandedSplashMs` est **soustrait** de cette mesure : un plancher de
2000 ms retranché de 130 rend **0**, donc `QAM-START` ne peut **plus jamais**
sortir. Le seuil de démarrage était mort, et rien ne pouvait le dire — un budget
que rien ne peut dépasser se lit exactement comme un budget tenu.

**Le remède est un ordre, pas un texte** : l'attente d'ancre passe en premier,
donc elle part du lancement et mesure ce qu'elle prétend mesurer. Rien n'est
perdu — son budget (`ARGUS_START_TIMEOUT_MS`) était déjà largement au-dessus du
seuil de performance, et il couvre désormais **tout** le sas au lieu de ce qui
restait après cinq secondes d'animation.

📌 **Les deux gardes portent sur la POSITION**, parce que c'est elle la variable :
les deux commandes étaient présentes, correctes, et chacune documentée par un
paragraphe qui la justifie. Un garde qui aurait lu leur texte les aurait trouvées
irréprochables. Le second relie la **promesse** du rapport (« splash et init
compris ») à l'**ordre** qui la rend vraie — deux fichiers que rien ne rapproche
à la lecture : si la promesse tombe, l'ordre n'a plus de raison d'être gardé ; si
l'ordre saute, la promesse devient un mensonge.

📌 **Et le harnais a repris ma mutation** : « motif trouvé 0× », parce que
l'apostrophe est échappée dans le source JS et pas dans mon motif. Il a rendu
HARNAIS et non VACANT — c'est exactement la distinction qui évite de partir
chercher un garde manquant qui existe.

### 461. La séquence périmait son propre relevé, et c'est elle qui le disait

**Fermé le 10/09/2026**, rapporté par le run 70 (point 2). Les deux mutations
font tomber le garde.

`argus-guards` était en **deuxième** position du §3g, `argus-report` en
**dernière** — avec deux passes device, une boucle visuelle et un build de
release entre les deux. Au-delà de `budget.maxMinutes` (25 par défaut), le
rapport avertit que `stage1.jsonl` est périmé. **À chaque run.**

📌 **L'avertissement était juste ; c'est la séquence qui le fabriquait.** Un
signal qu'on ne peut pas faire taire en ayant raison finit ignoré, et il emmène
ses voisins — le motif que `security.acknowledged` avait déjà fermé ailleurs.

📌 **Et l'enjeu n'est pas la fraîcheur affichée** : si `lib/` a bougé pendant la
passe — une ancre corrigée, une dette payée —, le premier relevé décrit un code
qui n'existe plus, et c'est **lui** qui part dans le rapport publié.

📌 **Le garde exige l'ADJACENCE, pas la présence.** Un second passage placé trois
commandes plus haut redeviendrait périmé au prochain ajout de dimension : ce qui
rafraîchit doit toucher ce qui lit. La seconde mutation ne fait que l'éloigner de
deux lignes, et elle tombe.

📌 **Poser cet encadré a fait rougir le garde 293**, qui tient le renvoi vers le
diagnostic du runner à moins de 40 lignes de la séquence. Il avait raison :
c'est là qu'on lance `argus-run`, donc là qu'il faut savoir que le runner donne
l'ordre de dépannage. L'encadré est passé après lui.

### 462. L'outil avait raison, le skill ne le disait pas

**Fermé le 10/09/2026**, rapporté par le run 70 (point 3). Les deux mutations
font tomber le garde.

`validateConfig` refuse une entrée `devices[]` dont la `platform` n'est pas
déclarée dans `platforms[]` — à raison : c'est le reste d'un bloc d'exemple. Le
gabarit livre en effet Android **actif** et iOS **en commentaire**, si bien que
changer de plateforme demande de décommenter l'un *et de retirer l'autre en
entier*. Le SKILL ne le disait **nulle part** : on écrit donc une configuration
qu'il autorise, et toutes les commandes s'arrêtent.

📌 **LA RÈGLE ÉTAIT DÉJÀ GARDÉE EN ENTIER** — point 320, les deux sens plus le cas
toléré (une entrée sans `platform`, que les installations d'avant n'ont pas).
J'ai commencé par écrire un garde qui la redoublait, et c'est **son exécution**
qui a fait apparaître l'existant : le doublon complet du 450, évité de justesse.
Le garde livré ne garde donc que la moitié neuve — la phrase — tout en vérifiant
qu'elle reste **adossée à un contrôle qui existe**, faute de quoi elle
décrirait un refus disparu.

📌 **Et il dit ce qu'un retrait PARTIEL produit** : les clés laissées derrière
(`avd`, `model: pixel_6`, `os: android-33`) sont à l'indentation d'un item, donc
elles **fusionnent dans l'entrée suivante** au lieu de lever. On obtient un
`ios-sim` qui porte `model: pixel_6`, et le rapport nomme un appareil qui
n'existe pas.

⚠️ **Reproduit en deux temps, et le premier a démenti la lecture évidente** : le
bloc iOS du gabarit, décommenté *tel quel*, **parse sans erreur** — le refus ne
vient pas du parseur (comme au 459) mais de la validation. Deux mécanismes
voisins qu'un même symptôme aurait confondus.

### 463. Un junit ORPHELIN garde son ancien verdict

**Fermé le 10/09/2026**, rapporté par le run 70 (point 5). Les trois mutations
font tomber les deux gardes.

Le **454** dit que les junit sont réécrits à chaque invocation. C'est vrai — *des
écrans encore joués*. Un écran passé à `visual: false` sort de la boucle, et son
`report.visual-<écran>.junit.xml` **survit** avec le `failures="1"` de la fois
d'avant. Le run l'a vu sur `home-filled`.

🔴 **Personne ne le lit ICI, et c'est ce qui le rend dangereux, pas inoffensif.**
Aucun script du scaffold ne relit ces fichiers — mais le workflow publie
`argus-mobile-report/*.xml` **en bloc**, donc n'importe quel agrégateur de junit
(GitHub, Jenkins, Allure) compte un échec sur un écran que plus rien ne teste.
*Ce qui produit doit nettoyer ce qu'il ne produit plus.*

📌 **La décision est EXTRAITE pour que le garde l'APPELLE** au lieu de lire une
ligne d'appel : un motif peut rester en place pendant que sa valeur est
neutralisée. Et un second garde couvre le **câblage** et la **place** — le
troisième barreau, celui qu'on croit acquis quand on a extrait.

⚠️ **La place est une décision, pas un détail** : le nettoyage vit DANS la branche
qui exécute la boucle visuelle. Ailleurs, une passe ciblée (`--tags=perf`)
effacerait des verdicts qu'elle ne rejoue pas — le défaut inverse, et il détruit
au lieu de mentir. La troisième mutation garde l'autre bord : un filtre élargi à
`*.junit.xml` emporterait le verdict fonctionnel du run en cours.

### 464. Une clé qu'on ne peut pas deviner n'existe pas pour l'utilisateur

**Fermé le 10/09/2026**, rapporté par le run 71 (point b). Les deux mutations
font tomber le garde.

`configNonEmbarquee` lit une clé `motif:` que la doc utilisateur ne mentionnait
**nulle part**. C'est pourtant la seule qui exprime « câblé par CONVENTION » : un
fichier que **rien ne nomme**, et qu'un plugin trouve seul. Sans elle, la seule
question posable est « le fichier est-il nommé dans la déclaration ? », dont la
réponse est **NON sur un projet parfaitement correct** — donc un `major` que
personne ne peut corriger.

📌 Le skill s'en servait déjà : la règle `firebase-android` livrée porte
`motif: 'google-services'`, le nom du plugin Gradle qui lit le fichier. Le
mécanisme était juste ; seule sa documentation manquait.

📌 **LE GARDE DÉRIVE LA LISTE DES CLÉS DU CODE**, il ne l'énumère pas — une clé
ajoutée demain sera exigée dans la doc sans qu'on y pense. C'est ce qui a fait
apparaître **`quoi.nom`** en plus de `motif` : la forme qui retrouve un fichier
qu'un source set de flavor a déplacé, et que le run n'avait pas vue non plus.
*La direction du raisonnement est tout : large moins les exceptions, jamais
étroit plus ce qu'on a vu.*

🔴 **ET LE GARDE A ÉTÉ VACANT DEUX FOIS, POUR DEUX RAISONS DIFFÉRENTES.** Sa
première version cherchait la clé n'importe où dans le bloc : « le NOM du
fichier » satisfaisait `nom`, et le paragraphe qui **explique** `motif:`
satisfaisait `motif`. Il mesurait donc la **mention**, jamais l'exemple — et il
avait raison sur le fond, ce qui rend le vert particulièrement trompeur. Le
critère est devenu structurel (une ligne dont le contenu commence par `<clé>:`),
puis il a fallu tolérer le tiret d'item, `- id:` étant une clé aussi.

📌 **Et écrire les formes a fait rougir le garde 256** : mes exemples
`{ sous: …, nom: … }` sont des **maps en flow**, que le parseur refuse — le
cousin exact du 459, attrapé cette fois par un garde qui existait déjà.

### 465. Le projet qui avait BIEN fait devait acquitter sa réussite

**Fermé le 10/09/2026**, rapporté par le run 71 (point d) — qui l'a démonté
lui-même, à l'aapt2, sur l'APK publié. Les deux mutations font tomber le garde.

Confiner un `usesCleartextTraffic` au manifeste de **debug** est la bonne
pratique : Gradle ne fusionne jamais `src/debug/` en release. Le scan le
rapportait `critical` quand même — donc **tout projet qui a bien fait récolte un
blocage à son premier run**, et doit acquitter ce qu'il a réussi.

📌 Le coût réel n'est pas le finding, c'est ce qu'il fait faire : le run a passé
une partie de sa passe à le réfuter (manifeste fusionné, `aapt2 dump badging`)
pour conclure qu'il décrivait un comportement correct. *Un signal qu'on ne peut
pas faire taire en ayant raison finit ignoré, et il emmène ses voisins* — la même
phrase que le 461, sur une autre dimension.

**Les source sets qui n'atteignent aucun binaire publié** (`debug`, `test`,
`androidTest`) ne sont plus jugés pour les drapeaux. La liste est celle des noms
**réservés d'Android**, jamais une devinette sur les noms du projet : tout ce
qu'on ne connaît pas reste jugé. ⚠️ Se tromper dans ce sens coûte un faux positif
acquittable ; dans l'autre, un trafic en clair **publié que personne ne voit**.

📌 **Le garde M4 garde l'autre moitié et n'a pas bougé** : « toutes les variantes
sont lues », `src/release/` compris. Les deux se tiennent — et la seconde
mutation le prouve : un remède élargi en dispense laisse passer un flavor `dev`
publiable, et c'est ce cas-là qui rougit.

### 466. L'avertissement affirmait une conséquence qu'il ne peut pas connaître

**Fermé le 10/09/2026**, rapporté par le run 71 (point e). Les deux mutations
font tomber le garde.

`localeWarnings` concluait : « le flow i18n mesure la locale de L'APPAREIL, pas
celle que tu déclares : **il est vert quoi que tu déclares** ». C'est vrai d'une
application qui **suit** la locale du système, et **faux** d'une application qui
l'**épingle**. Le run l'a mesuré : appareil en `en-US`, assertions françaises
vertes — parce que l'app force sa locale. Le flow y mesurait exactement ce qu'il
prétend mesurer.

📌 **Le fait dont tout dépend est hors de portée du script** : il lit la locale de
l'appareil, jamais la façon dont l'app la traite. Affirmer là-dessus produit un
avertissement **faux sur un projet sain** — et un avertissement faux se fait
ignorer, en emmenant les vrais avec lui. Le remède n'est pas de le supprimer mais
de **dire la condition** : les deux branches, et le **tell** qui les sépare (des
assertions dans ta langue qui passent sur un appareil réglé sur une autre signent
une app qui épingle).

📌 **Le garde existant a été ÉTENDU, pas doublé.** Le 444 gardait *quand* il
parle — silence sur la disposition recommandée, parole dès que l'écart est réel.
Celui-ci garde *ce qu'il conclut*. Deux moitiés du même avertissement, dans le
même test.

📌 **Et c'est le troisième run à revenir sur cette clé** (66, 67, 71) : les deux
premiers avaient rapporté le mécanisme comme une limite, et le 444 l'a démenti —
à raison. Le 71 ne rouvre pas ce démenti : il vise la **phrase** que le démenti
avait laissée en place.

### 467. La dérivation ne peut pas inventer un flag qui n'existe pas en debug

**Fermé le 10/09/2026**, rapporté par le run 71 (point f). Les deux mutations
font tomber le garde 386 étendu.

`releaseBuildCmd` **dérivait** la commande de publication de la commande de
**debug** du projet, en échangeant le mode. Ça garde l'ABI, le flavor et les
`--dart-define` — mais `--obfuscate` et `--split-debug-info` ne figurent dans
**aucune** commande de debug, jamais. Le conseil rendu était donc un `--release`
nu, qui produit un binaire non obfusqué, donc un `major` décrivant **notre
commande** et non l'application. Le run l'a payé exactement ainsi.

`build.androidScanBuildCmd` / `iosScanBuildCmd` la portent désormais et sont
rendues **telles quelles** ; la dérivation reste le repli.

⚠️ **CETTE CLÉ AVAIT DÉJÀ ÉTÉ CRÉÉE PUIS RETIRÉE**, par un run qui avait mesuré
qu'aucun script ne la lisait — et il avait **raison à l'époque** : une clé morte
se relit comme un geste outillé alors qu'il ne l'est pas (point 11). Ce qui
change n'est pas l'avis, c'est le fait : *elle a un lecteur*. La note en
commentaire reste, parce que la clé porte la commande et jamais **d'où elle
vient**.

📌 **LE GARDE 386 AVAIT RAISON DE ROUGIR** : mon correctif avait emporté la forme
`# construit par : …` qu'il exige. Il a été **étendu**, pas doublé, sur deux
points — son motif ne voyait qu'un `scanBuildCmd` **nu**, donc il était aveugle à
`androidScanBuildCmd`, c'est-à-dire à la seule clé de ce genre que ce dépôt ait
jamais déclarée ; et il vérifie maintenant que la clé **prime** sur la
dérivation, une clé lue et sans effet étant pire qu'absente.

### 468. Le zéro d'une commande qui n'a rien mesuré se lit comme un vert

**Fermé le 10/09/2026**, rapporté par le run 71 (point g) — **comme mineur, et il
ne l'est pas**. Les deux mutations font tomber le garde.

Le geste naturel pour rejouer un garde de dette est de coller sa clé dans
`--plain-name`. Elle ne matche **rien** : la clé porte des « · » et des mots que
le nom du test n'a pas. Mesuré — clé `cibles tactiles à 200 % de taille de
texte`, nom du test `cibles tactiles **TENUES** à 200 % de taille de texte` : ce
ne sont pas deux formats, ce sont **deux chaînes écrites séparément**.

🔴 **CE QUI LE REND GRAVE EST LE CODE DE SORTIE.** Mesuré sur le terrain :

    No tests ran.
    No tests match "home-empty · contraste du texte (WCAG AA)".
    code de sortie : 0

Un `0` rendu par une commande qui n'a **rien exécuté** est indiscernable d'un
succès — et on le lit au moment précis où l'on vérifie qu'une dette est payée.
Un `&&` enchaîne, un script conclut, personne ne voit la ligne du milieu.

**Le message d'échec DÉRIVE désormais un motif qui matche** : l'identifiant
d'écran, seul morceau commun à la clé et au nom du test (le nom tient son segment
d'écran du `group()`). Et il dit le piège, parce que la tentation de coller la
clé est plus forte que la commande qu'on propose.

📌 Le skill ne prescrivait `--plain-name` **nulle part** : le run l'a employé de
lui-même. Un piège n'a pas besoin d'être prescrit pour être payé.

### 470. Une trace d'époque qui se lit comme un état

**Fermé le 10/09/2026**, rapporté par le run 70 (point hors run). Les deux
mutations font tomber le garde.

Le fichier porte six annonces « **Prochain numéro libre : N** » — 400, 366, 218,
187, 184, 180 — chacune vraie le jour de sa passe. La plus basse est la
**dernière du fichier**, donc la première qu'un lecteur qui déroule rencontre :
elle annonce **180**, périmée depuis le run 22.

📌 **On ne les supprime pas, et c'est le point intéressant.** `dernierPointDu`
(`tools/artefact-compteurs.mjs`) les **lit** : un lot de points peut être clos
sans qu'aucun d'eux ait jamais eu de titre — c'est arrivé aux 347-365, et
l'instrument annonçait alors « prochain libre 347 » quand le fichier disait 366.
Ces phrases sont donc **de la donnée pour l'instrument et du bruit pour le
lecteur**. D'où un avertissement en tête plutôt qu'une purge, avec la commande
qui **dérive** le numéro courant.

⚠️ **J'ai failli les DATER, et la dérivation était fausse.** Prendre « la date la
plus proche avant » donnait 26/08/2026 pour l'annonce 218, qui date en réalité du
31/08 — la section qui la porte se termine par des paragraphes plus anciens.
*Une date devinée aurait remplacé un nombre périmé par une affirmation fausse*,
c'est-à-dire le pire des deux. Quand la valeur n'est pas dérivable, on dit quoi
faire au lieu d'affirmer.

📌 **Le garde est DÉRIVÉ et se désarme tout seul** : il ne réclame
l'avertissement que s'il existe au moins une annonce ≤ au dernier point titré.
Le jour où elles seraient toutes à jour, il ne demanderait plus rien — un garde
qui survit à ce qu'il décrit devient une consigne sans objet.

### 471. Vingt-cinq mutations ne prouvaient rien, et seule une passe de 7 h le disait

**Fermé le 10/09/2026**, trouvé **en instruisant les autres points** — pas
rapporté par un run. Prouvé par une paire de gardes qui se gardent l'un l'autre.

Une mutation dont le motif a disparu de sa cible ne prouve **rien** : le harnais
rend honnêtement « HARNAIS — motif trouvé 0× »… mais ce verdict ne se lit qu'en
**jouant la passe**, laquelle coûte des heures. Personne ne la joue pour cette
question-là. Mesuré : **25 mutations sur 404** étaient dans ce cas, et rien dans
le dépôt ne le disait.

📌 **Elles ont été trouvées en contrôlant autre chose** — je vérifiais que mes
propres correctifs n'avaient pas débranché de mutation existante. Ils en avaient
débranché **trois** (355, 386, 420, dont les messages ont été réécrits par les
points 466 et 467), et les vingt-cinq autres étaient là depuis plus longtemps.

⚠️ **La comparaison devait se faire par NOM, pas par index.** Ma première mesure
opposait des numéros de `--list` entre l'avant et l'après — or insérer des
mutations décale tous les suivants : l'écart obtenu aurait accusé des mutations
intactes et blanchi les vraies. *Un identifiant qui bouge ne compare rien.*

`--check-motifs` répond désormais **en une seconde**, sans toucher un fichier, et
fige l'écart connu **par égalité** : une réparation le fait rougir autant qu'une
régression. Ce n'est pas une liste d'exceptions, c'est l'état d'un chantier —
chaque ligne affirme qu'une mutation est morte et attend d'être ré-ancrée.

🔴 **AUCUNE MUTATION NE VISE LE HARNAIS LUI-MÊME, ET C'EST DÉLIBÉRÉ** : muter le
fichier qui restaure l'arbre est le seul endroit où une restauration ratée n'a
pas de filet. La **paire de gardes** la remplace — l'un exige `exit 0` sur le
dépôt réel, son jumeau fabrique une copie sabotée portant un motif impossible et
exige qu'elle soit dénoncée. *Un contrôle qui ne sait pas rendre son verdict
négatif approuve tout, et un outil qui approuve tout ressemble à un dépôt sain.*

📌 **Les 25 restent à ré-ancrer** — c'est un chantier à part, désormais mesurable
et visible (`make` n'a pas de cible : `python3 tools/mutate-run-guards.py
--check-motifs`).

## 🔴 LES RUNS QUI N'ONT RIEN RENDU — et pourquoi ils s'écrivent ICI

Un run qui ne rend aucun constat n'a, par construction, **aucun point à inscrire
plus haut**. Il ne laisse donc aucune trace dans ce fichier — alors que c'est
exactement le run qui décide de la **sortie**.

⚠️ **Ne supprime pas cette section parce qu'elle a l'air vide de contenu.** Le
compteur de la page publiée dérive le numéro du dernier run **de ce fichier**
(`dernierRunDu`, `tools/artefact-compteurs.mjs`) : sans cette liste, la page
annonce éternellement le dernier run *à constat*, et le seul run qui puisse
ouvrir la sortie est précisément celui que l'instrument ne voit pas. Mesuré le
09/09 : `runs: 64` alors que le **run 65** était archivé et contrôlé.

📌 L'instrument, lui, n'était pas en cause — vérifié en l'exécutant : il lit un
numéro cité en prose aussi bien que dans un titre de lot. C'est la **source** qui
était incomplète, et rien ne réclamait de la compléter.

| le run | date | plateforme | ce qu'il a établi |
|---|---|---|---|
| **run 65** | 09/09/2026 | iOS | **Aucun constat contre le skill.** Gate `pass`, 7/7 flows, 41/41 ancres, 416/416 gardes d'étage 1, 693 tests du projet. Le **410** a payé sur ses quatre points, cités mot pour mot par un agent qui les ignorait neufs ; le **437** a payé deux fois — le garde passe, et l'agent s'en sert comme contre-épreuve de son propre montage. **Le critère de sortie est rempli sur ce run.** |

## 🎯 LE PLAN DU 19/08 EST CLOS — décidé par Germinator le 31/08/2026

**Il n'y aura pas de troisième terrain : les deux couvrent la totalité.** Le plan
du 19/08 en prévoyait trois ; le terrain **local** (puis iOS) et celui **avec
API** ont exercé entre eux tout ce que le skill sait faire — les deux étages, les
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

### 472. Le comptage d'ancres cherchait le paramètre là où il n'est jamais écrit

**Fermé le 10/09/2026**, rapporté par le **run 73** (iOS, projet à design system
partagé) — et c'est la **quatrième fois** qu'un run bute sur ce relevé, après les
runs 67, 71 et le 458 qui les avait fermés.

Le 458 avait corrigé le **motif** des commandes du §2b ; il leur laissait le
mauvais **périmètre**. `identifier: <nom>` n'est écrit qu'à **un** endroit — le
composant qui TRANSMET l'ancre — et sur un projet à design system partagé, cet
endroit vit dans le **paquet voisin**, hors du `lib` que la commande balaie. La
commande (a) rend donc zéro, et le zéro se lit exactement comme « ce projet n'est
pas instrumenté ».

**Reproduit par exécution**, dans les deux sens, sur le projet du run 73 :

| mesure | valeur |
|---|---|
| noms rendus par (a) sur `lib/` du projet | **0** |
| noms rendus par (a) sur le `lib/` du paquet voisin | **3** |
| call-sites réels dans `lib/` du projet | **21** |

L'agent a écrit son propre compteur, l'a vu rendre 0, l'a corrigé et
contre-éprouvé lui-même — c'est-à-dire qu'il a refait à la main ce que le §2b
prescrit, parce que ce que le §2b prescrit ne pouvait pas marcher chez lui.

📌 **Le remède est une commande (a0) qui DÉCOUVRE les paquets voisins** avant de
balayer, plutôt qu'un chemin cité. Son ancrage compte autant que son existence :
la valeur d'un `path:` local commence par un point (`../mon_design_system`),
là où le paquet `path` de pub.dev s'écrit `path: ^1.9.1` — **même clé, même
fichier**. Un motif non ancré rend le second comme un paquet voisin et envoie
balayer `^1.9.1/lib`.

⚠️ **Le tell, et il est gratuit** : *(a) qui rend zéro sur un projet dont les
boutons sont partagés mesure un périmètre trop étroit, pas un projet vierge.*

Le garde EXÉCUTE les deux commandes sur une fixture à deux paquets — le
call-site chez le projet, le site qui transmet chez le voisin — et exige les
deux sens : le nom trouvé quand le voisin est là, **rien** quand on le retire.
Relire la prose n'aurait rien dit : le défaut n'est pas dans ce que le §2b
affirme, il est dans les racines que sa ligne `find` énumère.

### 473. L'indice « sous le pli » prescrivait un geste déjà fait

**Fermé le 10/09/2026**, rapporté par le **run 72** (Android) — au SECOND passage
d'`argus-anchors`, sur les deux mêmes ancres que le premier.

Une ancre déclarée à la fois dans `commands` et dans `commandsAfterScroll` fait
échouer le premier test : elle n'est pas au gabarit de référence. L'indice
l'envoyait alors vers `commandsAfterScroll` — **où elle était déjà**. Le message
est techniquement vrai (« elle existe, mais plus bas ») et sa prescription est
inapplicable, ce qui est la pire des deux : le lecteur refait le geste, échoue,
et n'a rien appris.

📌 **La cause tient en une phrase : « déplacer » est DEUX gestes, et on n'en
fait qu'un.** L'agent a ajouté à la seconde liste sans retirer de la première.
Rien ne détectait l'intersection : le contrôle d'unicité du harnais ne porte que
sur les ancres de **racine**, et son commentaire autorise explicitement la
répétition des ancres de commande (« lignes de liste, bouton présent dans deux
états ») — ce qui est juste pour deux écrans, et faux pour deux listes du même
écran, qui s'excluent.

Le diagnostic distingue désormais les deux cas et nomme le geste manquant :
*RETIRE-la d'ici ; l'ajouter ne suffisait pas.*

⚠️ **Le paramètre qui porte la liste cible est REQUIS, pas optionnel.** Un
paramètre facultatif aurait laissé un site d'appel non câblé compiler et
retomber en silence sur l'ancien message — exactement le mode de panne du 350.
Requis, le compilateur nomme les deux sites.

Le garde tient trois choses, et c'est la deuxième qu'on oublie : que la branche
existe, qu'elle soit **atteinte avant** le message qu'elle remplace (placée
après, elle est morte et un garde de texte reste vert — le défaut du 431), et
que chaque site d'appel passe la liste **qui correspond à son champ** — un site
qui annonce `displaysAfterScroll:` en passant `commandsAfterScroll` est câblé et
faux, il chercherait le doublon dans la mauvaise liste.

### 474. Une exception de CANAL se lisait comme une dette de l'application

**Fermé le 10/09/2026**, rapporté par le **run 73** (iOS) — qui a eu la bonne
réaction, mais seul et après coup.

Un plugin natif — `permission_handler`, `geolocator`, tout ce qui parle à l'OS —
n'a **aucune implémentation** sous `flutter test`. L'écran qui l'interroge au
montage lève `MissingPluginException(No implementation found for method <m> on
channel <c>)`, le garde d'étage 1 rougit, et la ligne ressemble à s'y méprendre
à un défaut de l'application. Le run a failli l'inscrire dans
`known_issues.dart` : elle y aurait figé un échec qui **décrit l'outillage**, pas
le projet — une dette qui n'est pas la sienne est pire qu'une dette de plus.

**Mesuré : 0 occurrence de `MissingPluginException` dans tout le skill**, alors
que le montage de l'étage 1 est précisément ce qu'il prescrit.

🔴 **Et c'est la SECONDE moitié qui manque toujours : fermer le premier canal en
révèle un second.** Le run a posé un double sur
`flutter.baseflow.com/permissions/methods` et vu l'exception reparaître aussitôt
sur `flutter.baseflow.com/geolocator` — deux plugins, deux canaux, **une seule
exception à la fois**. Un avertissement qui ne dirait que la première moitié
laisserait conclure sur un vert obtenu à mi-chemin, et il aurait l'air complet.

📌 **Le tell est gratuit et se lit en une seconde : le message nomme un CANAL**
(`on channel …`). Une dette d'application nomme un widget, une contrainte, un
ratio ou une taille — jamais un canal.

Le garde borne sa fenêtre par la **structure** (jusqu'au prochain titre) et non
par un index calculé : un `indexOf` qui échoue rend `-1`, et le `slice` retombe
alors sur le fichier entier — le motif se trouverait n'importe où. Ce piège-là a
été payé deux fois dans ce dépôt.

### 475. Le workflow posé sur un projet qui n'est pas sur GitHub

**Fermé le 10/09/2026**, rapporté par le **run 72** (Android) — qui l'a tranché
seul, et bien : il a laissé le fichier et l'a écrit dans son compte rendu.

L'installeur pose `.github/workflows/argus-mobile.yml` **sans jamais regarder
quel CI le projet utilise**. Mesuré : le skill dit « github » **27 fois** et
« gitlab » **zéro**. Le terrain porte un `.gitlab-ci.yml` de 20 Ko, **suivi par
git** — donc celui du projet, pas un résidu — et les 28 Ko de workflow posés à
côté ne s'exécuteront nulle part.

📌 **Le symptôme est une ABSENCE**, donc le plus silencieux qui soit : rien ne
rougit, aucune erreur n'est levée, et la garde n'existe que sur le disque. C'est
la famille de défauts que ce chantier traque, appliquée à sa propre livraison.

**Ce n'est pas à l'installeur de décider** : un projet peut vouloir les deux, et
retirer le fichier lui ôterait la référence de ce qu'il faut lancer. Il refuse
seulement de laisser croire que la garde est en place — il nomme le fichier qui
l'a déclenché, pour que le verdict soit vérifiable plutôt que cru.

⚠️ **Et le relevé se prend AVANT la boucle de copie**, sinon le contrôle est
vacant le jour de son écriture : c'est cette même boucle qui crée
`.github/workflows/`, donc « ce projet avait-il des workflows ? » vaudrait
« oui » à jamais. C'est exactement le défaut du 431, et aucune relecture ne le
voit — seule l'exécution le dit.

Le garde LANCE l'installeur sur trois fixtures plutôt que de relire son texte :
GitLab seul (l'avertissement doit sortir **et nommer le fichier**), les deux CI
qui coexistent (il doit se taire — un avertissement qui crie sur un choix
délibéré s'apprend à ignorer), et aucun autre CI (rien à dire).

### 476. « Sourcer » n'était pas le geste, et le rattrapage coûte une passe device

**Fermé le 10/09/2026**, rapporté par le **run 75** (Android) — et le constat
brut était **démenti** : le skill le dit déjà. Ce qui restait est plus étroit, et
c'est lui qui coûte.

Le gabarit prescrit, pour les comptes de test, « un fichier hors dépôt à
**sourcer** ». Or un fichier de lignes `CLE=valeur` nues donne des variables de
**shell**, que le processus fils ne voit jamais : Maestro reçoit
`-e QA_PHONE=<VIDE>`, le flow authentifié est sauté, et rien d'autre ne le dit.

📌 **Le runner rattrape, et parfaitement** : il nomme les secrets vides, nomme la
frontière de processus, nomme celle de l'export, et donne la forme exacte —
`set -a && source <fichier> && set +a`. Ce mécanisme est un correctif de ce
chantier (337, puis son extension), et il a fonctionné : le run l'a lu et s'est
corrigé seul.

🔴 **Mais il ne parle qu'une fois la passe device LANCÉE.** Le gabarit, lui, est
lu avant — c'est le seul endroit où la phrase épargne le coût. Mesuré sur ce
run : **98 s de device** pour une passe qui ne pouvait rien mesurer.
**0 occurrence** de `set -a` ou `export` dans tout `PROMPTS.md` avant ce point.

Le garde porte sur l'**accord des deux textes**, jamais sur la présence dans
l'un : deux endroits qui disent la même chose divergent toujours par celui qu'on
ne mesure pas — et c'est le gabarit, puisque rien ne l'exécute. Sa contre-épreuve
vient d'abord (le runner porte-t-il encore le remède ?), sans quoi il comparerait
le gabarit à rien et passerait au vert.

### 477. Nommer le bon remède ne suffit pas quand le mauvais est plus court

**Fermé le 10/09/2026**, rapporté par les **DEUX runs** de la paire 74-75 —
terrains différents, plateformes différentes, agents qui ne se connaissaient pas.
*C'est le signal le plus fort qu'une paire sache donner.*

Le **466** avait appris à l'avertissement de locale à dire sa condition et son
tell, et il nomme le bon remède depuis : *« règle la langue de l'appareil avant
le run »*. Les deux runs l'ont lu. L'un a quand même fait autre chose.

🔴 **Il a fait taire la ligne en DÉCLARANT la locale que l'appareil portait
déjà** — `fr_CI` au lieu de `fr_FR` — et il l'a écrit noir sur blanc : *« garder
`fr_FR` décrit une intention jamais réalisée et produit le finding
`QAM-LOCALE-INERTE` des 5 runs archivés »*. Le raisonnement est bon, le geste ne
règle rien : **il retire le signal en laissant la mesure exactement où elle
était**. La clé dit ce qu'on VEUT mesurer, l'appareil dit ce qui SERA mesuré ;
les rendre égaux ne les réconcilie pas, ça rend l'écart invisible.

**Mesuré avant d'écrire** : 0 occurrence d'un écart au faux remède dans le runner
comme dans le SKILL, sur des fichiers où « locale » apparaît 56 et 2 fois —
l'instrument mesurait.

📌 **La leçon dépasse la locale** : un avertissement qui nomme le bon geste laisse
intact tout geste plus court qui le fait taire. Et celui-là se trouve tout seul,
parce qu'il est *rationnel* — on l'adopte en croyant nettoyer une configuration.
Un message qui prescrit doit donc aussi **écarter**, et dire ce que le
raccourci coûte, sinon « ne fais pas ça » se lit comme une préférence de style.

Le garde **appelle** `localeWarnings` et lit ce qu'elle rend — un garde de texte
serait satisfait par le commentaire qui explique le piège, deux lignes plus haut
dans le même fichier. Il couvre les deux sens : la ligne sort sur l'écart, et
**rien** ne sort quand l'appareil est déjà dans la locale demandée.

### 478. Mon correctif de la veille avertissait une fois, puis plus jamais

**Fermé le 11/09/2026**, **trouvé en instruisant la paire 74-75** — pas rapporté
par un run, et aucun n'aurait pu le voir.

Le **475** fait dire à l'installeur qu'un workflow GitHub posé sur un projet qui
n'est pas sur GitHub Actions ne s'exécutera nulle part. Il relève, avant la
boucle de copie, si le projet portait déjà des workflows — et se tait s'il en a,
parce que deux CI qui coexistent sont un choix, pas un oubli.

🔴 **Le relevé comptait TOUT workflow présent, y compris le nôtre.** Au second
passage, `.github/workflows/argus-mobile.yml` — que la boucle venait de poser —
suffisait donc à faire croire que le projet en avait. Mesuré :

| passage | avertissement |
|---|---|
| 1er (projet neuf) | **1** |
| 2e | **0** |
| `--update` | **0** |

Or `--update` est le **geste ordinaire**, et c'est là que la ligne compte le
plus : elle rappelle qu'une garde n'existe que sur le disque. Le correctif
n'avertissait donc qu'une fois dans la vie d'un projet — à l'installation, quand
on a mille autres choses à lire.

📌 **Aucun run ne pouvait le rapporter** : le run 75 a fait un premier passage, a
vu la ligne, et l'a relayée correctement dans son compte rendu. *Personne ne
relance un installeur pour relire un message.* Il a fallu poser la question à
l'outil — quatre passages sur une fixture — pour que le second réponde.

Le relevé ignore désormais `argus-mobile.yml`, et le garde du 475 couvre les
**quatre** cas : premier passage, second, `--update`, et un workflow qui
appartient au projet (là, il doit toujours se taire).

### 479. Un correctif juste a rendu injoignable le garde d'un autre correctif juste

**Fermé le 11/09/2026**, rapporté par le run 76 (Android, terrain 1) — symptôme exact, **diagnostic
démenti**, et la cause est pire que ce qu'il croyait.

Le rapport annonce, pour `startup`, « attente de l'écran de départ exploitable
(**splash et init compris**) ». Mesuré sur ce run :

| flow | mesure |
|---|---|
| a11y · lifecycle · i18n · smoke · visual ×4 · journey-critical | **52 à 104 ms** |
| resilience | **2 697 ms** |

L'app tient un splash de marque de **2 000 ms** et `am start -W` la chronomètre
à **1 160 ms** : 52 ms ne peut pas contenir le sas. Et comme `brandedSplashMs`
en est **soustrait**, `QAM-START` ne peut plus jamais sortir — *un budget
qu'aucune valeur ne peut dépasser*, c'est-à-dire exactement le **460**, rouvert.

🔴 **Le run accusait le `launchApp` de Maestro. Faux** : mesuré dans les
`commands.json`, il dure **441 à 690 ms**. La séquence réelle, identique sur les
neuf flows :

    runFlowCommand   ~7300 ms   ← dismiss-system-alerts.yaml
      tapOnElement   ~7090 ms   ← le tapOn `optional: true` qui ATTEND sa borne
    runFlowCommand     ~60 ms
      assertCondition  ~55 ms   ← ce que `startupSamples` retient

**7 017 à 7 144 ms sur 40 exécutions** : une constante, donc un **timeout**, pas
un geste. Aucune alerte système n'apparaît sur ce terrain, le tap optionnel
attend sa borne — et l'app démarre pendant ce temps. `resilience` ne passe pas
par `launch-clean.yaml`, donc sa mesure contient encore le sas : **c'est le flow
témoin, et il prouve que le mécanisme sait mesurer.**

📌 **La cause est une composition de deux correctifs justes.** Le 460 avait pour
remède un ORDRE — « l'attente d'ancre passe en premier, donc elle part du
lancement ». Le **405** a ensuite porté le geste d'invite système DANS
`launch-clean.yaml`, pour qu'il soit atteint par tous les flows : geste juste,
et il s'insère avant elle.

⚠️ **Le remède évident casserait le 405** : si l'alerte système couvre l'écran,
l'attente d'ancre échoue — c'est littéralement le couple *atteinte / moment* que
ce point-là avait fermé. Le remède doit donc porter sur **ce qui peut attendre
avant la mesure**, jamais sur l'ordre de deux lignes ; sinon un troisième
correctif du même genre la re-videra sans que rien ne le dise.

### 480. L'avertissement qui écarte un raccourci ne s'adresse qu'à ceux qui ne l'ont pas pris

**Fermé le 11/09/2026**, rapporté par le run 77 (iOS, terrain 2) — et c'est le **477 rejoué un jour
après son correctif**, par un agent qui ne pouvait pas savoir qu'il était neuf.

Le run a écrit `deviceLocale: fr_CI`, avec une justification meilleure que celle
du run 75 : *« relevé sur l'appareil, c'est le marché de l'app ; le flow i18n
mesure quand même, parce que l'app ÉPINGLE sa langue »*.

🔴 **La mesure dit qu'il se trompe sur le fait** :

    <paquet partagé>/lib/.../constants.dart:30
        static const Locale locale = Locale('fr', 'FR');
    <app>/lib/main.dart:304
        supportedLocales: const [AppConstants.locale]

L'app épingle **`fr_FR`**. La clé aurait dû dire `fr_FR` — ce que le harnais
DOIT mesurer. En écrivant `fr_CI`, il l'a rendue égale à l'appareil.

🔴 **Et le correctif du 477 ne pouvait pas l'arrêter**, parce qu'il sort avant
d'avoir parlé :

    localeWarnings(demandee, autoStart, surDevice, platform) {
      if (!demandee || autoStart) return [];
      if (surDevice && normaliser(surDevice) === normaliser(demandee)) return [];

Dès que la déclaration égale l'appareil, la fonction rend `[]`. Mesuré :
`report.json` du run 77 porte **0 occurrence** de `QAM-LOCALE`, et aucun fichier
du rapport ne contient « AUCUN effet ». La phrase qui écarte le raccourci est
bien là — elle est simplement **injoignable depuis l'état qu'elle condamne**.

📌 *Un avertissement qui dissuade d'un raccourci doit pouvoir parler APRÈS que le
raccourci a été pris.* Sinon ce n'est pas un garde, c'est un panneau posé avant
le virage : celui qui a tourné ne le lira plus jamais.

⚠️ Le remède ne peut pas être « parler toujours » : ce silence est ce qui évite
de crier sur un projet sain, et le **466** l'avait précisément éteint. Ce qui
sépare les deux cas est mesurable et vit dans l'app — épingle-t-elle sa locale,
ou suit-elle le système ? Contre-épreuve obligatoire du garde : une app qui SUIT
et un `deviceLocale` égal à l'appareil ne doivent produire **aucun** message.

### 481. Le préfixe FVM se perd dès que la commande ne commence pas par `flutter`

**Fermé le 11/09/2026**, rapporté par le run 76, confirmé **par exécution** de la fonction :

    PRÉFIXÉ  "flutter build apk --release"
    INTACT   "rm -rf build/native_assets && flutter build apk --release …"   ← le cas
    INTACT   "fvm flutter build apk --release"     (légitime : déjà préfixé)
    INTACT   "./scripts/release.sh"                (légitime : script maison)

`flutterCommandIn` ne préfixe que ce qui **commence** par `flutter ` — et son
dartdoc le dit, donc la décision est délibérée. Le prix ne l'était pas : la doc
du projet imposait un nettoyage avant le build, la commande devient composée, et
le conseil imprimé est **injouable** quand le PATH porte une version différente
de celle qu'exige le `pubspec` (mesuré : 3.32.0 contre 3.41.9).

### 482. Une contre-épreuve qui ne dit pas sur quel couple elle se joue

**Fermé le 11/09/2026**, rapporté par le run 76. Le skill prescrit, pour prouver qu'un compteur n'est
pas mort : *« le **même motif** SANS le filtre `///` doit rendre `> 0` »*.
Mesuré sur le `harness.dart` LIVRÉ, avec filtre / sans filtre :

    ArgusScreen(     0 / 2     ← la contre-épreuve fonctionne pour CE motif
    identifier:      0 / 0     ← 🔴 vacante : même zéro des deux côtés
    anchor:          0 / 1     ← ce que le dartdoc porte réellement

La règle est écrite en général et illustrée sur un seul couple. Jouée sur
`identifier:` — le motif du comptage de `lib/` — elle rend `0/0` et ne distingue
plus « le filtre marche » de « je ne mesure rien », soit exactement ce qu'elle
existe pour écarter.

### 483. ❌ DÉMENTI — le garde `cropRoot` serait « muet »

Le run 76 rapporte que le garde de position ne s'exécute pas si `screens[]` est
vide, « et son absence est muette ». **Faux** : le câblage vit dans
`config.mjs:2529-2546`, au seul endroit qui voie les deux fichiers, et couvre
les deux cas — `warn` quand aucun `ArgusScreen` ne porte l'ancre de
`visualCropOn`, `err` quand elle est portée sans `cropRoot: true`. Le message
porte mot pour mot la phrase « le garde qui mesure sa position ne s'exécute donc
PAS — et son absence est muette ». C'est ce message que l'agent cite comme
l'ayant repris : **le mécanisme a fonctionné.**

### 484. ❌ DÉMENTI — le piège `GetIt.reset()` ne serait pas couvert

Le run 77 a payé une passe (45 gardes rouges) sur un conteneur d'injection vidé
de façon asynchrone. Le harnais porte pourtant le remède à l'endroit où on le
lit : `anchors_test.dart:534-556` énumère **quatre causes par ordre de
fréquence**, met le conteneur d'injection en tête, cite `GetIt.reset()`, renvoie
au montage qui marche — et dit même qu'« un run a lu ce message comme un défaut
d'instrumentation ». `argusDrainMountException` draine l'exception du montage
pour que ce `reason` s'affiche au lieu de l'erreur brute. Rien à ajouter.

### 485. Le préfixe FVM manque là où le runner est CHOISI, pas composé

**Fermé le 14/09/2026**, rapporté par le run 78 et reproduit avant inscription.
`sca.mjs:163` portait :

    const runner = detectTools(['flutter']).flutter.present ? 'flutter' : 'dart';

Il DÉTECTE correctement, puis invoque le **nom nu**. Symptôme mesuré :
`JSON pub outdated illisible : Unexpected token '┌'` — `fvm` sans argument
imprime son aide. La sous-dimension « fraîcheur » tombe alors en
`scanned: false` **avec sa raison** : honnête, pas un faux vert, et le scan CVE
lui-même a bien tourné (0 finding).

🔴 **C'est le 481 chez son voisin.** Le 481 a appris à `flutterCommandIn` à
préfixer tout `flutter` en *position de commande* dans une chaîne composée.
`sca.mjs` ne compose pas de chaîne — il choisit un runner. Le correctif ne
pouvait pas l'atteindre, et rien ne pouvait le signaler.

Périmètre **mesuré, pas supposé** : un seul site. `config.mjs:2070` porte le
préfixe (`name === 'flutter' && usesFvm() ? sh('fvm', ['flutter', …])`), `sec.mjs`
l'importe aussi, et les quatre autres scripts n'invoquent ni `flutter` ni `dart`.
⚠️ Le run rapportait que `run.mjs` dérive déjà le préfixe : **faux** — il
n'appelle jamais `usesFvm`. *Symptôme juste, diagnostic faux.*

🔴 **Confirmé PAR L'ABSENCE au run 79.** Le second terrain épingle exactement la
version que porte le PATH, donc le défaut y est **invisible** et `pub outdated`
rend ses 87 dépendances. Il ne se déclenche que sur une **divergence** entre la
version épinglée et celle du PATH — c'est-à-dire qu'il dort sur la plupart des
postes, où `flutter` du PATH *est* celui de FVM. Il fallait deux terrains
épinglant des versions différentes pour le voir.

### 486. Un pas dont la condition est INATTEIGNABLE sur une plateforme attend sa borne à chaque flow

**Fermé le 14/09/2026**, rapporté par le run 78. `disable-animations.yaml` ne
contenait qu'un pas :

    - assertTrue:
        condition: "${typeof ARGUS_ANIMATIONS_DISABLED !== 'undefined' && …=== 'true'}"
        optional: true

Or le fichier documente lui-même que Maestro n'a **pas accès à `adb`** : sur un
simulateur iOS, la variable ne peut jamais valoir `'true'`. La condition est donc
fausse **par construction**, et Maestro attend son timeout plutôt que d'échouer
vite : **1 898 ms mesurés, × 6 flows ≈ 11 s par passe**, pour un geste que la
plateforme ne peut pas exécuter.

C'est la forme du 479 — un pas `optional` qui attend sa borne — mais le coût est
ici **structurel** et non accidentel : il se produit à chaque exécution iOS, sur
tous les projets. Le 479 a rendu la mesure honnête (`QAM-START-ABSORBE` l'a bien
signalé sur 7 flows/9) ; il n'a pas supprimé l'attente, et ce n'était pas son
objet.

### 487. ❌ DÉMENTIS — les quatre constats du run 79 disent tous la même chose

Le run 79 n'a rendu **aucun constat neuf**. Ses quatre points partagent un motif
unique, et c'est lui qui vaut d'être gardé : **le skill avait déjà répondu, et
l'agent a relayé son texte sans savoir qu'il répondait déjà.**

| rapporté | ce que la reproduction dit |
|---|---|
| « les blocs post-auth gardent sur la DÉCLARATION d'une variable, jamais sur l'existence d'une session » | écrit **mot pour mot** dans `lifecycle.yaml` livré, avec son remède (point 390). L'agent l'écrit lui-même : « le fichier livré porte l'avertissement ; je l'ai payé quand même » |
| « `evidence: all` publierait une capture de l'écran de code à usage unique » | `SKILL.md:2654` le documente et donne le remède (`evidence: major`), en disant que c'est du vécu |
| « le workflow GitHub ne s'exécutera nulle part » | c'est le correctif du **475** qui parle. Déjà démenti à la paire 74-75, sur l'autre terrain |
| `maxRuns` refusé par `check-syntax` · un double de service SMS | **aucun des deux n'existe dans le skill** — son propre montage |

📌 Le premier a failli être inscrit comme le meilleur constat du run. Ce qui l'a
arrêté est la règle ordinaire : **reproduire avant d'inscrire**. Un rapport
d'agent qui cite une phrase du document ressemble exactement à un rapport qui
décrit un défaut.

### 488. Porter un correctif à ses VOISINS — la classe, et non le cas

**Fermé le 14/09/2026.** Ce n'est pas un constat de terrain mais ce que trois
paires consécutives ont fini par établir. Le motif, à l'identique :

    477  →  480      un remède juste, son voisin non couvert
    481  →  485      un remède juste, son voisin non couvert

Dans les deux cas le remède était exact, il fermait ce qu'il visait, et il
laissait à côté de lui une **autre forme du même défaut** que son motif ne
pouvait pas atteindre — le 480 parce que la phrase vivait derrière un
`return []`, le 485 parce que le voisin choisit un runner au lieu de composer une
chaîne. Aucun test ne peut voir ça : chaque correctif est juste pris à part.

Ce que ce point demande n'est donc pas un troisième correctif ponctuel, mais le
geste qui empêche la quatrième occurrence : quand on ferme un défaut, **chercher
les autres formes du même geste** — les autres sites qui font la même chose
autrement — et le prouver, plutôt que de le promettre.

**Ce qui l'a fermé** : un garde qui balaie TOUS les scripts et exige zéro
invocation nue de `flutter` ou `dart`, plus sa mutation, qui réintroduit
précisément la forme qu'avait le 485. Mesuré : il nomme le site fautif
(`sca.mjs:202`) au lieu de se contenter d'un compte.

⚠️ **La direction du raisonnement est tout** : LARGE moins les exceptions, jamais
*étroit plus ce qu'on a rencontré*. Une énumération des formes déjà vues rend
« 0 » et laisse passer toutes celles qu'on n'a pas imaginées — c'est ce qui a
laissé le 485 vivre un mois après le 481.

### 489. Un test qui ESPÉRAIT un écart de date, sur un disque qui ne le doit pas

**Fermé le 14/09/2026** (`ccc8664`). Trouvé par la **première exécution de la
CI du plugin**, qui n'avait jamais tourné en 79 runs.

Le test 343 écrivait le paquet, écrivait ensuite `lib/main.dart`, et attendait
que la source soit **plus récente**. C'est vrai sur APFS, qui horodate à la
nanoseconde. Ce ne l'est pas sur l'overlayfs d'un conteneur, dont la résolution
est la **seconde** : les deux fichiers partagent leur mtime, `binaryFreshness`
rend `frais`, et l'assertion qui devait prouver le garde échoue.

    ✖ un paquet plus VIEUX que lib/ est déclaré périmé, pas « intact » (343)
      'frais' !== 'perime'

Vert sur cette machine depuis le jour de son écriture, rouge la première fois
qu'une autre plateforme l'a joué. L'écart est désormais **forcé** (`utimesSync`,
−10 s pour le paquet, +10 s après reconstruction) au lieu d'être espéré.

**La classe** — et c'est elle qui vaut : *tout test dont le verdict dépend d'une
propriété NON DÉCLARÉE de son système de fichiers*. La résolution d'horodatage
en est une ; l'ordre de `readdirSync` et la sensibilité à la casse en sont deux
autres, et elles diffèrent entre APFS et ext4/overlayfs de la même façon.

**Le balayage des voisins** (le geste du 488, appliqué le jour même) — mesuré,
pas promis. Trois familles dans la suite, une seule était malade :

| famille | verdict | pourquoi |
|---|---|---|
| écart de date entre deux écritures | 🔴 **343** | espérait au lieu de forcer |
| budgets en temps réel (`sh`, plafonds) | ✅ sain | marge large et dérivée — 3 000 ms pour un plafond de 400 ; verts dans le conteneur |
| ordre de `readdirSync` (17 sites livrés) | ✅ sain | aucun ne décide sur « le premier » : tous parcourent l'ensemble, ou trient (`rankBuildTools`, `sec.mjs:190`, `config.mjs:1813`) |

⚠️ **Ce que ce point ne dit pas** : `binaryFreshness` accepte déjà un lecteur de
date injectable (`mtime = (f) => statSync(f).mtimeMs`), et le test aurait pu
s'en servir pour ne jamais toucher le disque. Il ne le fait pas, **et c'est
voulu** : injecter aurait rendu le test indépendant de la plateforme en cessant
d'exercer le vrai `statSync` — le barreau du dessous. Forcer les dates garde les
deux.

### 490. La passe de mutation ne tenait pas dans un job de CI

**Fermé le 14/09/2026.** Mesuré au premier passage de la CI. Dernière étape du job
`scaffold` : `python3 tools/mutate-run-guards.py`, soit **435 mutations**, dont
chacune rejoue la suite entière.

    suite complète, en local (Apple Silicon)      12,3 s   → × 435 = 1 h 29
    suite complète, conteneur act (amd64 émulé)   65,9 s   → × 435 = 7 h 58

Les deux chiffres sont des mesures ; celui d'un runner GitHub `ubuntu-latest`
(2 vCPU, x86 natif) n'en est pas un — il se situe **entre** les deux, donc entre
1 h 30 et 8 h, pour une limite de job de 6 h. Autrement dit : au mieux, chaque
pull request bloque un runner une heure et demie ; au pire, le job ne finit
jamais.

C'est exactement le produit que personne ne mesure — durée unitaire × cardinal —
et il a grandi d'une mutation à la fois. Rien ne s'en est jamais plaint, puisque
chaque moitié reste raisonnable.

⚠️ **Le remède n'est PAS de retirer l'étape.** Elle est le seul contrôle qui
prouve que les 497 gardes gardent encore, et une suite verte ne dit rien de ça.
Trois options, à trancher avec Germinator :

1. **Matrice** — dix tranches `--only=` en parallèle, ~10 min chacune. Garde le
   contrôle sur chaque PR, coûte dix runners.
2. **Déclencheur dédié** — nocturne, ou sur label. Coûte peu, mais une PR peut
   alors vider un garde sans que rien ne le dise avant le lendemain.
3. **Tranche dérivée du diff** — ne muter que ce que la PR touche. Le moins
   cher, et le plus exposé : c'est une énumération *étroite plus ce qu'on a vu*,
   la direction que le 488 vient précisément de condamner.

📌 Le job `scaffold` a été joué dans un conteneur Linux le 14/09 : **ses dix
premières étapes sont vertes**, la onzième est celle-ci et n'a pas été jouée là.

**Ce qui l'a fermé** — l'option 1, une matrice de dix tranches. Mais la mesure a
d'abord démenti la prémisse des trois options ci-dessus : elles supposaient toutes
que les 12,3 s d'une suite étaient incompressibles, alors que **dix tests sur 497
en portent 8,2 s** (73 %), et vingt en portent 92 % — tous des tests qui lancent
un sous-processus. Et le dépôt étant public, les minutes d'Actions sont gratuites :
l'arbitrage ne portait pas sur de l'argent mais sur du délai.

Le harnais a reçu `--shard=K/N`, qui **diffère d'`--only` par sa NATURE et non par
son périmètre** — et c'est cela seul qui l'autorise à rendre 0. `--only` est une
sélection : rien ne garantit que le reste sera joué, donc elle sort en 1, sinon un
« 45/435 » se lirait comme un dépôt sain. `--shard` est une partition annoncée,
prouvée par égalité pour N = 1, 2, 3, 7, 10, 13, 100 et *total*.

⚠️ **Et le cardinal n'est écrit nulle part dans le workflow** : N se dérive de la
matrice (`strategy.job-total`). Un nombre recopié à côté d'une liste est juste le
jour où on l'écrit et faux dès qu'on ajoute une tranche — et le trou ne se voit
nulle part, puisque les jobs restants passent au vert sur leur propre part.

### 491. Le verdict du harnais était rendu par un garde qui tombait toujours

**Fermé le 14/09/2026.** Trouvé en écrivant le garde du 490, et par le seul geste
qui l'attrape : **lire le NOM du test qui tombe**, au lieu du verdict.

Un garde écrit le 10/09 rejoue le contrôle des motifs *à l'intérieur de la suite*
— et la suite est rejouée sous **chaque** mutation. En lisant l'arbre de travail,
il y voyait le motif que le harnais venait de remplacer, se déclarait donc inerte,
et rougissait. À chaque fois.

Or le harnais tranche `TOMBE` / `VACANT` sur le **seul code de retour** de la
suite. Il y avait donc toujours un rouge, et il rendait `TOMBE` quel que soit
l'état du garde qu'on croyait éprouver. *Un instrument qui approuve tout ressemble
exactement à un dépôt sain*, et il y ressemblait depuis quatre jours.

    sous une mutation ordinaire, AVANT :  2 tests rouges — le garde visé ET celui-ci
    sous une mutation ordinaire, APRÈS :  1 test rouge  — le garde visé
    sous une sonde INOFFENSIVE, APRÈS  :  VACANT — il sait de nouveau dire non

Mesuré sur **deux cibles distinctes** avant de conclure, puis contre-éprouvé dans
les deux sens : c'est la seconde ligne qui prouve le correctif, et la troisième qui
prouve l'instrument.

**Le remède** : le contrôle lit désormais le dépôt **commité** (`--from-head`,
un seul `git cat-file --batch` pour les 37 cibles — 14 ms contre 160). Ce n'est
pas une commodité : c'est la sémantique du harnais lui-même, qui restaure par
`git checkout`. Le contrôle et la restauration parlent enfin du même état.

⚠️ **Son câblage porte son propre garde**, parce que perdre le drapeau ne casse
rien de visible : sur un arbre propre, HEAD et l'arbre disent la même chose et la
suite reste verte. Le prix se paie à la passe suivante, en silence. Le garde est
ancré sur le harnais **du dépôt** — la suite invoque aussi ce contrôle sur une
copie *sabotée*, qui doit continuer de lire l'arbre, faute de quoi sa sonde,
jamais commitée, deviendrait invisible.

📌 **Ce que ça coûte au passé** : toute passe jouée entre le 10/09 et le 14/09 —
y compris celle de 438 mutations jouée le matin même — rendait `TOMBE` sans que
ce verdict distingue un garde qui tombe d'un garde vacant. Les correctifs qu'elles
ont accompagnés restent valables ; c'est leur *preuve* qui était vide.

**Comment rejouer cette CI en local** — écrit ici parce que rien d'autre ne le
porte, et que la prochaine reprise le cherchera :

    brew install act                     # 0.2.89 le 14/09 ; Docker ou OrbStack requis
    act push -j scaffold --container-architecture linux/amd64 \
        -P ubuntu-latest=catthehacker/ubuntu:act-latest

⚠️ **Le job `harness` ne s'exécute PAS sous `act`**, et ce n'est pas un défaut du
dépôt : `subosito/flutter-action` lit `$RUNNER_ARCH`, qu'`act` renseigne depuis
la machine HÔTE (`arm64`) et non depuis le conteneur (`amd64`). Le SDK Flutter
n'existant pas en Linux arm64, l'action s'arrête à `Set action inputs` :

    Unable to determine Flutter version for channel: stable ... architecture: arm64

Le discriminant vaut d'être retenu : échec au stade du **provisionnement**, log
de 46 lignes, rien du dépôt n'a tourné. `--env RUNNER_ARCH=X64` corrige un step
`run:` (mesuré : le conteneur voit alors `X64` / `x86_64`) mais **pas** une
action composite, qu'`act` ré-environne. Le contenu du job se prouve donc à la
main, et c'est ce qui a été fait le 14/09 — `flutter create` + installeur +
`dart format` + `flutter analyze` ×2 + `flutter test`, les six étapes vertes
(`+5 ~4`, les deux greps satisfaits). ⚠️ Sur macOS et Flutter 3.32.0, quand la CI
prendrait la `stable` du jour sous Linux : c'est précisément l'écart qui a
produit le 489, donc cette réserve n'est pas de style.

### 492. Ce que la première passe HONNÊTE a trouvé — deux gardes creux, deux fences

**Fermé le 14/09/2026.** La passe de 438 mutations rejouée après la réparation
du 491 — la première dont le verdict veuille dire quelque chose depuis le 10/09.
Bilan : **436/438**, donc **deux gardes vacants** que les passes précédentes
avaient tous deux rapportés comme « tombés ».

**Le premier** gardait la contre-épreuve que le skill prescrit au §2b. Le skill
écrit cette commande **deux fois** : une fois comme *prescription*, dans un bloc
clôturé que le lecteur copie, et une fois plus bas comme *exemple* d'un couple
qui ne prouve rien — même forme exacte. Le garde collectait toutes les lignes de
comptage de la page et exigeait « au moins une, quelque part » : l'exemple
excusait donc le retrait de la prescription. Son propre commentaire annonçait
déjà « la deuxième fois que ce garde passe à côté de son sujet ». C'était la
troisième. Il porte désormais sur le **bloc exécutable**.

**Le second** gardait l'ancrage du marqueur d'ouverture. Son cas lisait *« on se
souvient qu'il fut **Ouvert le …** »* et attendait zéro. Il obtenait bien zéro —
mais **parce qu'aucun titre `### N.` ne précède la mention**, donc la fonction
mappe sur `null` et filtre, jamais parce que l'ancre `^` l'avait écartée. Vert
avec ou sans l'ancre : il mesurait l'absence de titre en croyant mesurer la
borne. Le cas porte maintenant un titre — ce qui fait de l'ancre la seule
variable — et un jumeau qui exige qu'un vrai marqueur, lui, COMPTE.

⚠️ **Et le premier a révélé autre chose en résistant.** En corrigeant son garde,
l'extracteur de blocs exécutables classait l'exemple comme prescription et
ratait la prescription. L'instrument n'était pas faux : **le fichier l'était.**
Deux gabarits du skill avaient perdu une fence — l'un son ouverture, l'autre sa
fermeture :

    ligne 305   ```        ouvre le gabarit du rapport … et rien ne le ferme
    ligne 322   ```bash    ne le ferme PAS : en CommonMark une fermeture ne
                           porte jamais d'info-string
    ligne 353   ```        le ferme enfin — 48 lignes plus bas

    ligne 511   ```        FERME un gabarit que rien n'avait ouvert
                           → 69 lignes de prose avalées dans un bloc

Entre les deux, quatre avertissements en gras s'affichaient en monospace,
astérisques compris, et la ligne ` ```bash ` s'imprimait littéralement. **Rien ne
pouvait le voir** : le fichier est un Markdown valide, il rend simplement autre
chose que ce qu'il dit. C'est un livrable que personne n'avait affiché pour le
regarder — et il a fallu qu'un garde sans rapport bute dessus.

**Ce qui le ferme** : un garde sur le **phénomène** et non sur le fichier où on
l'a trouvé — les treize documents markdown livrés, un critère total et négatif,
et la preuve qu'il a VU avant de dire qu'il n'a rien vu (dix documents au
minimum, plus de cinquante fences lues) ; plus sa mutation, qui donne une
info-string à une fence de fermeture, exactement la forme du défaut.

📌 **Et le dispositif de la passe a changé** : douze tranches jouées dans des
`git worktree` détachés, jusqu'à six en parallèle. Un arbre par tranche est ce
qui le rend possible — sinon la suite de l'une voit la mutation de l'autre et
rend un rouge parasite, soit le 491 revenu par la porte du parallélisme. Un
**témoin** de résultat connu (37/37 en séquentiel) a voyagé dans chaque lot et
rendu 37/37 aux deux charges : c'est ce qui autorise à lire les autres tranches.
Mesuré : 13 min 21 s pour six tranches contre ~42 en séquentiel.

### 493. Le job de CI qu'on avait écrit, gardé, muté — et jamais fait TOURNER

**Fermé le 14/09/2026.** Trois défauts, tous dans le job de matrice du 490, et
aucun n'était visible autrement qu'en l'exécutant. Il avait pourtant été écrit,
gardé, muté et relu le matin même.

**1 — Un contexte SUPPOSÉ.** Le nombre de tranches se dérivait de
`strategy.job-total`, que j'avais présumé sans le mesurer. Il rend **vide** :
chaque tranche serait partie avec `--shard=3/`, le harnais aurait refusé, et
personne ne l'aurait su avant la première pull request. ⚠️ Le plus gênant n'est
pas l'erreur mais qu'**un garde avait été écrit dessus** : correct, fidèle, et
gardant une chose qui n'existe pas. *Un garde retient une mesure, il n'en fait
pas une.* Chaque entrée porte désormais `K/N` en entier — apparence de
redondance, et le garde vérifie la liste **par égalité** contre ce qu'elle
devrait valoir pour sa propre longueur. Un trou, un doublon et un dénominateur
qui décroche tombent tous les trois, et cette forme-là s'éprouve ici.

**2 — Un vérificateur absent, rapporté comme un sujet fautif.** Les deux
workflows se contrôlent avec **PyYAML**, présent sur ce poste et **absent de
l'image des runners**. L'import lève, le contrôle rend un code non nul, et le
harnais conclut « la mutation ne parse pas » : il confond *« je n'ai PAS PU
mesurer »* et *« le sujet est fautif »*, et il condamne cinq mutations sur un
dépôt sain. Il sait pourtant le faire pour maestro — il avertit au démarrage et
cesse de vérifier. Il ne l'avait jamais appris pour son autre vérificateur.
⚠️ Et ne pas vérifier n'est pas gratuit non plus : sans PyYAML, une mutation qui
casserait vraiment un workflow se lirait comme un garde qui tombe. La CI
l'installe donc, et cette ligne — du câblage pur, dont la perte ne casse rien de
visible — porte son garde et sa mutation.

**3 — Une mutation dont le pouvoir de preuve dépendait d'un nombre qui bouge.**

    439 mutations, 10 tranches → reste 9 · la mutation change quelque chose
    440 mutations, 10 tranches → reste 0 · elle ne change RIEN
    441 mutations, 10 tranches → reste 1 · elle change quelque chose

Elle retirait le terme de reste de la partition — un défaut réel, mais nul quand
le cardinal divise exactement par le nombre de tranches. Elle prouvait donc le
garde à 439 et plus rien à 440, **une fois sur dix**, au gré des ajouts. C'est le
conteneur qui l'a dit en la rendant VACANT le jour où la 440ᵉ est arrivée :
aucune relecture ne voit qu'une mutation a cessé de muter selon la parité d'un
compte. Elle retire maintenant un élément de chaque tranche, ce qui troue la
partition quel que soit le reste.

📌 **Ce que les trois ont en commun** : le job était *correct à la lecture*. Ce
qui les a trouvés n'est ni un test, ni un garde, ni une relecture — c'est de
**l'avoir exécuté**. Un livrable que la CI n'exécute pas dérive en silence ; un
job de CI que rien n'exécute est le cas dégénéré de cette règle, et il aura fallu
cinquante minutes de conteneur par tentative pour le voir.

### 494. Le format dépend de la VERSION du formateur, pas du dépôt

**Fermé le 14/09/2026.** Le job qui monte Flutter a enfin tourné sous Linux avec
la **stable du jour** — 3.47.4, quinze versions mineures au-delà de ce que la
vérification manuelle couvrait — et il a échoué. Sur le format, et rien d'autre :

    dart format                        ✖  3 fichiers du CADRE reformatés
    flutter analyze (défaut)           ✔
    flutter analyze (lints courants)   ✔
    flutter test + les deux greps      ✔

**Le scaffold est donc COMPATIBLE** ; l'écart est purement stylistique —
`MediaQuery.of(context).copyWith(…)` remis en chaîne, les arguments de
`testWidgets` repliés autrement. Le formateur de Dart change d'avis entre
versions : ce qui est formaté sous 3.8 ne l'est plus sous 3.13, et réciproquement.

⚠️ **Tant que ce contrôle vivait dans un job sur `channel: stable`, il était une
bombe à retardement** : rouge à la prochaine évolution du formateur, sans qu'une
ligne du dépôt ait bougé — et ce rouge-là n'aurait signalé **aucun défaut**,
contrairement à celui d'une incompatibilité réelle. Les deux se ressemblent
pourtant à s'y méprendre dans un journal de CI.

**Ce qui le ferme** : deux jobs, deux buts. Le **style** sur une version FIXE, où
il est déterministe ; la **compatibilité** sur la stable, où elle est censée
bouger. Monter l'épinglage devient une décision délibérée, prise avec le
reformatage du cadre dans le même commit.

⚠️ **Le garde tient la séparation DANS LES DEUX SENS** : exactement un job
formate et il doit être épinglé, **et** au moins un job doit continuer à suivre
`stable` sans formater. Sans cette seconde moitié, tout épingler passerait la
première tout en supprimant la seule chose qui détecte une rupture réelle — or
c'est précisément en jouant la stable du jour qu'on a appris que le scaffold la
suit.

📌 **Mesuré aussi, et ça change l'enjeu** : le workflow que l'installeur pose
CHEZ L'HÔTE ne lance pas `dart format` — il fait `analyze` et `test`. Le
commentaire qui justifiait cette étape décrivait donc un risque qu'il ne crée pas
lui-même. Il reste réel (beaucoup de projets formatent en CI), mais aucun format
ne peut satisfaire toutes les versions à la fois : c'est une limite, pas un bug.

📌 **Les quatre jobs de la CI tournent et passent maintenant dans un conteneur
Linux** — `scaffold`, `mutation` (44/44), `format`, `harness`. C'est la première
fois depuis que ce dépôt existe.

### 495. Un fichier qui change de camp ne casse rien, nulle part

**Fermé le 15/09/2026**, en ouvrant le chantier **F** de
`docs/chantiers-differes.md` (l'installation globale) : c'en est la troisième
épreuve, *figer la classification effective par ÉGALITÉ, avant tout déplacement*.

L'installeur range chaque fichier livré dans l'un de trois camps, lus sur les
vingt premières lignes de la **source** :

    ARGUS:OWNED   12 fichiers   au projet — jamais remplacés
    ARGUS:MERGE    2 fichiers   à fusionner dans un homonyme
    ARGUS:CADRE   20 fichiers   à nous — remplacés par `--update`

Ce classement décide **de qui écrase le travail de qui**, et rien ne le
surveillait. Les deux sens coûtent cher, et les deux sont muets. Un OWNED qui
perd son marqueur devient du cadre, donc `--update` efface le harnais rempli,
les ancres et les parcours métier — chez quelqu'un qui n'a fait que mettre à
jour. Un CADRE qui gagne un OWNED cesse d'être mis à jour, pour toujours et chez
tous les hôtes, y compris ceux qui ne lancent jamais rien. Et le cas le plus
courant n'est ni l'un ni l'autre : un fichier **ajouté sans marqueur** tombe dans
le camp par défaut sans que personne l'ait décidé.

**Ce qui le ferme** : deux gardes. Le premier fige la table des trente-quatre
fichiers **par égalité** — il rougit à chaque ajout, retrait ou déplacement, et
c'est le but : le camp se choisit en écrivant une ligne, pas en oubliant un
en-tête. Le second mesure l'**effet** et non la déclaration : il installe, ajoute
une ligne témoin à chaque fichier posé comme si le projet l'avait édité, lance
`--update`, et exige qu'**exactement** les fichiers de cadre aient perdu leur
témoin. Les deux moitiés refusent de conclure quand elles cessent de
discriminer : rien de relevé, rien de remplacé, ou tout remplacé.

⚠️ **Le second n'est pas un doublon du premier : c'est ce qui l'empêche de
dériver.** La table déclarée recopie l'ordre de lecture de l'installeur, et une
recopie dérive ; un changement d'ordre ou une reconnaissance cassée sépare
désormais les deux relevés.

⚠️ **Il a fallu deux essais pour que la mutation garde le BON garde.** Casser la
reconnaissance du marqueur OWNED fait bien tomber quelque chose — mais le **341**,
qui voit revenir les `TODO(argus)` que le plugin livre, et le harnais crédite le
PREMIER test qui rougit. Une mutation qui tombe sur le garde du voisin ne garde
plus le sien : celui-ci pourrait devenir vacant sans que rien ne le dise. Le camp
MERGE ne porte aucun TODO, donc lui seul sépare — mesuré à 503 verts et un seul
rouge, le bon. Le défaut qu'elle réintroduit est d'ailleurs le plus grave des
trois : le `.gitignore` du projet **écrasé** par le nôtre, au lieu d'être fusionné
dans son bloc délimité.

📌 Re-mesuré le 15/09 en rouvrant le dossier F, et c'est cette table que le
chantier consultera pour dire ce qui déménage et ce qui reste : le moteur pèse
**9 148 lignes sur 14 717**, soit 62 % du scaffold ; les invocations à fermer sont
toujours 41, dans trois fichiers (Makefile 19, CI 12, snippet npm 10) ; et le
couplage du cadre vers le possédé tient toujours en deux points.

### 496. Quarante et un sites savaient où vit le moteur

**Fermé le 15/09/2026**, deuxième temps du chantier **F**. Le chemin
`scripts/argus/<x>.mjs` était écrit **81 fois** : 41 dans les trois fichiers qui
EXÉCUTENT (Makefile 19, workflow 12, snippet npm 10) et 40 en mentions. Chacune
est une copie de la même décision, et une copie dérive — le jour où le moteur
déménage, il faut toutes les retrouver, y compris celles que rien ne fait rougir.

**Ce qui le ferme** : un lanceur, `scripts/argus/argus-mobile.mjs`, qui **cherche**
le moteur au lieu de le savoir — `$ARGUS_MOBILE_ENGINE`, puis son propre dossier,
puis l'installation globale. Un dossier ne compte que s'il porte vraiment le
moteur, et l'échec nomme les endroits regardés, dans l'ordre. Il EXÉCUTE les
scripts au lieu de les importer : chacun ne travaille que s'il est invoqué
directement, donc les importer les rendrait muets — rien à l'écran, exit 0.

Les 41 sites passent par lui, avec **une seule définition par fichier**, dans
l'idiome de ce fichier : `ARGUS :=` dans le Makefile, à côté du `FLUTTER :=`
qu'il dérivait déjà ; une clé `env:` dans le workflow ; le chemin dans le snippet
npm, où aucune variable n'existe.

🔴 **Un défaut trouvé AVANT de livrer, et seulement par la contre-épreuve.** La
première version du lanceur **repliait** : `ARGUS_MOBILE_ENGINE` pointé sur un
dossier vide, elle rendait tranquillement la réponse du moteur du **projet**. On
croit épingler un moteur et on exécute l'autre ; en CI, une variable mal
renseignée ferait mesurer le mauvais **tout en affichant un succès**. Imposé veut
dire imposé : c'est une erreur, jamais un repli.

⚠️ **Sept mentions sur quarante ne devaient PAS être réécrites**, et un balayage
générique en aurait fait sept phrases fausses. C'est le même récit de mesure,
recopié dans chaque fichier du moteur, qui explique le `realpathSync` des deux
côtés : il oppose `node scripts/argus/perf.mjs` au **même fichier atteint par un
chemin traversant un lien symbolique**. Réécrit, il aurait comparé le lanceur à
lui-même. Protégées nommément, le reste balayé ensuite.

⚠️ **Six gardes sont tombés ensemble** sur la nouvelle forme — chacun portait sa
copie du motif. Ils sont ré-ancrés sur **un** reconnaisseur, qui accepte les trois
formes que portent les fichiers livrés : six copies, c'est six occasions de
dériver, et celle qu'on oublie ne rougit pas, elle devient **vacante**. Les six
ont été remis à l'épreuve un par un, et deux fois la mutation a dû être refaite
avant de conclure : commenter `make argus-sec` laisse la chaîne que le garde
cherche, donc la mutation était inerte et le garde paraissait mort.

⚠️ **Dix mutations du harnais sont devenues inertes** pour la même raison, et
elles sont ré-ancrées **dans le même commit** — chacune suivant l'idiome de sa
cible. Une mutation dont le motif a disparu ne prouve rien, et ça ne se voit
qu'en jouant la passe entière.

📌 **Ce que l'écriture apprend au dossier F** : en mode global, le moteur ne vit
plus dans le projet — or le **runner de CI n'a aucune installation globale**. Le
workflow que l'installeur pose chez l'hôte n'a donc plus de moteur à appeler, et
le dossier ne l'avait pas vu. C'est l'arbitrage du troisième temps, pas un détail
d'implémentation.

### 497. L'installation globale : la commande une fois, le cadre par projet

**Fermé le 15/09/2026**, troisième temps du chantier **F** — la question posée le
14/09 : *installer le skill globalement, comme `flutter` ou `git`, ou dans le
projet au choix*.

`install-mobile.sh --global` pose `~/.argus-mobile` et un lien `argus-mobile`
dans le PATH. **La maison reproduit exactement la structure du skill**
(`assets/scaffold-mobile`, `scripts/`, `bin/`), ce qui n'est pas cosmétique :
l'installeur copié dedans y retrouve son scaffold par le même chemin relatif,
donc il n'a **pas une ligne à changer** selon l'endroit d'où il tourne. La
commande du PATH est un lien symbolique, parce qu'`import.meta.url` porte le
chemin réel : le lanceur en dérive sa maison même invoqué à travers le lien.

🔴 **Le moteur reste COPIÉ dans chaque projet, et c'est une décision.** Un runner
de CI n'a aucune installation globale : un projet dont le moteur vivrait dans la
maison n'aurait plus rien à appeler en intégration, et le dev exécuterait une
autre version que son intégration. Rien dans le code ne dit cela, donc **un garde
le porte**. La voie inverse — le moteur en global, la CI qui va le chercher à un
SHA épinglé — reste ouverte, mais elle est **suspendue à la publication du
plugin** : le dépôt public ne contient aujourd'hui que le commit initial, zéro
fichier du moteur, et 676 commits ne sont pas poussés. Arbitrage de Germinator :
voie 2 maintenant, voie 3 après la PR.

⚠️ **Un trou que seule la conception du global a révélé** : le lanceur ne
cherchait le moteur qu'**auprès de lui-même**. Installé dans `~/.argus-mobile/bin`,
il n'aurait jamais trouvé celui du projet où on l'invoque — le seul que ce projet
ait testé et épinglé — et le mode global aurait été inutilisable **le jour de sa
pose**. Invisible depuis le dépôt, où le lanceur est toujours posé à côté du
moteur : il faut l'exécuter d'ailleurs pour que la question se pose. Et **pas de
remontée vers le dossier parent** : les sept scripts résolvent le projet depuis
`process.cwd()` sans remonter non plus, et un lanceur plus malin qu'eux
trouverait un moteur là où eux ne trouveraient plus le projet.

📌 **Deux refus, et leurs deux moitiés.** Un `argus-mobile` déjà présent qui ne
porte pas la signature n'est jamais remplacé — le geste qu'on ne rattrape pas —
pendant que **notre** copie doit continuer de l'être, sinon plus rien ne se met à
jour ; la seconde moitié est mesurée en abîmant la copie et en vérifiant qu'elle
revient. Et un drapeau inconnu **arrête** désormais l'installeur : `--updat`
mourait sur un `cd: --: invalid option` qui ne nomme ni la cause ni le drapeau,
au moment précis où quelqu'un cherche encore comment s'en servir.

📌 Le PATH n'est jamais modifié : si le dossier n'y est pas, l'installeur imprime
la ligne à ajouter plutôt que d'éditer un fichier de shell.

### 498. La désinstallation, le seul geste qui supprime

**Fermé le 15/09/2026**, première épreuve du chantier **F** et la seule
irrattrapable. Retirer le scaffold en bloc effacerait le harnais rempli, les
parcours écrits et la config — des jours de travail qui n'ont **jamais**
appartenu au plugin.

Ce qui part est le cadre dont la copie locale porte **encore la signature**, et
rien d'autre ; ce qui reste est **énuméré**, parce qu'une suppression muette
laisse celui qui la lance sans moyen de savoir ce qu'il a perdu.

⚠️ **Aucun repli de prose ici, contrairement à `--update`.** Là-bas, ne pas
reconnaître une copie ancienne la fige à jamais ; ici, la reconnaître à tort la
**détruit**. Les deux erreurs n'ont pas le même prix, donc pas le même seuil : un
fichier gardé de trop se supprime à la main, l'inverse ne se répare pas.

📌 **Les dossiers vides ne partent que par `rmdir`**, qui refuse tout le reste :
c'est ce qui protège `.maestro/_baselines` et le dossier de rapports **sans
avoir à les nommer** — une liste de noms aurait vieilli au premier dossier ajouté.

📌 **Le gabarit jamais modifié s'en va, celui qu'on a annoté reste.** Le laisser
intact, c'est laisser derrière soi un fichier qui parle d'un outil désinstallé ;
mais dès qu'il diffère de la source, il porte la trace de quelqu'un.

**Mesuré sur un projet où l'on avait travaillé** : 23 retirés, 12 gardés, chaque
fichier marqué intact, et le `.gitignore` gardant sa propre ligne tout en perdant
notre bloc. `--uninstall-global` suit la même règle : un `argus-mobile` qui n'est
pas le nôtre reste où il est, et un dossier sans installation Argus n'est pas
effacé.

⚠️ **Et l'aide ne disait pas ce que l'outil sait faire** : l'en-tête dont elle
dérive décrivait deux drapeaux sur cinq. Aucun comportement à casser, donc aucun
test à faire rougir — le geste documenté qui diverge du geste outillé, dans sa
plus petite forme. Le garde **dérive les drapeaux du parseur** et tient les deux
sens : ce qui est accepté doit être documenté, et ce que le SKILL prescrit doit
être accepté. Une liste écrite à la main se serait périmée au premier drapeau
ajouté, et c'est le drapeau neuf — celui que personne ne connaît encore — qui
aurait manqué.

⚠️ **Le harnais a fait payer sa règle une fois de plus**, le jour même où elle
est écrite : un `git checkout --` lancé pour défaire une mutation manuelle a
effacé l'en-tête que je venais d'écrire et n'avais pas commité. Rien ne le
signale — la contre-épreuve avait réussi, le garde tombait bien. *Commiter avant
de muter* vaut aussi pour les mutations qu'on fait à la main, et surtout pour
celles-là.

### 499. Le garde du job Flutter couvrait un job sur deux, et se taisait

**Fermé le 15/09/2026**, et **trouvé par la passe de mutation complète — par rien
d'autre**. Sur 456 mutations, 455 sont tombées ; la seule qui ne tombait pas était
*« le job Flutter redevient injouable hors d'un vrai runner »*, rendue **VACANTE**.

Le garde lisait **une seule action** — `match` sans le drapeau `g` rend la
première — et comparait son architecture au `runs-on` du job `harness`, **écrit en
dur**, alors que l'action qu'il venait de lire appartenait à un **autre job**. Deux
défauts dans trois lignes, dont aucun ne se voyait tant qu'il n'y avait qu'un seul
job Flutter.

🔴 **Le jour où le 494 a créé le second job, la moitié du phénomène a cessé d'être
gardée — sans qu'une ligne bouge.** Le garde restait vert, sa mutation n'avait pas
été rejouée en passe entière depuis, et le défaut a vécu une journée. C'est le
mode de panne que la passe complète existe pour trouver, et il a fallu qu'elle
tourne pour qu'on l'apprenne.

**Ce qui le ferme** : le garde parcourt **tous** les jobs, contrôle **chaque**
`flutter-action` contre le `runs-on` de **son** job, et **prouve d'abord qu'il les
a toutes vues** — `vues === total`. C'est ce compte qui manquait, et lui seul
aurait attrapé la panne. ⚠️ *Un garde écrit contre un SITE se périme dès qu'un
second site apparaît* ; celui-ci porte désormais sur le phénomène.

📌 **Et le second site n'avait aucune mutation à lui.** Cette absence est
exactement pourquoi la couverture a pu tomber de moitié sans bruit : **le site que
personne ne mute est le site dont personne n'apprend rien.** Elle est ajoutée, et
les deux tombent maintenant sur le même garde.

📌 Les deux sens ont été mesurés en restaurant le workflow **par copie** et non
par `git checkout` — le correctif n'était pas encore commité, et c'est ce même
geste qui avait effacé un en-tête une heure plus tôt (498). Restauration prouvée
par empreinte, pas annoncée.

### 500. La confidentialité mesurait la page, jamais l'HISTOIRE

**Fermé le 15/09/2026**, sur une **question** — *« donc la PR prévoit de pousser
sur le distant ? »* — et non sur un run. La réponse est oui : **691 commits** sur
un dépôt **public**, dont l'accès anonyme a été vérifié. Ce qui a suivi n'était
pas prévu.

Le détecteur de fuites existe depuis le **333**. Il ne s'applique qu'à un
**texte** : celui de la page publiée. Les six cent quatre-vingt-onze commits que
ce dépôt garde n'avaient **jamais** été mesurés — et ce sont eux qu'une pull
request rend publics, pas seulement l'état courant.

    arbre courant       11 valeurs distinctes — toutes des exemples ou des faux positifs
    TOUS les objets     12 valeurs distinctes — une de plus
                        /Users/<compte>/…/tools/mutate-run-guards.py

🔴 **La douzième vient d'un `.pyc`** : `tools/__pycache__/mutate-run-guards.cpython-314.pyc`,
commité par accident le 10/09 (point **471**), retiré de l'arbre le 14/09. Du
bytecode Python embarque le chemin absolu de son source. Absent de l'arbre,
couvert par le `.gitignore` — et **récupéré par tout clone**. *Un fichier retiré
n'est pas un fichier parti.*

⚠️ **Deux mesures se sont contredites, et c'est ce qui a tranché.** Le détecteur
en comptait une, `grep` n'en trouvait aucune : le blob est **binaire**, et c'est
le contexte extrait — du bytecode, `subprocess`, `capture_output` — qui a nommé
le coupable en une lecture. Devant deux instruments qui ne peuvent pas avoir
raison ensemble, on extrait, on ne choisit pas.

**Ce qui le ferme** : la purge complète — réécriture, `refs/original` supprimées,
`reflog expire --expire=now --all`, `gc --prune=now` — puis la **preuve par
balayage de tous les objets**, où le compte tombe de douze valeurs à onze. Et un
garde, celui qui manquait : le détecteur appliqué aux objets du dépôt et non à
un texte.

⚠️ **Les deux gestes n'ont pas le même critère, et les confondre coûte dans les
deux sens.** Pour *prouver une purge*, il faut **tous** les objets
(`--batch-all-objects`) : c'est la seule façon de voir ce que `refs/original`, le
reflog et les orphelins gardent encore, et `git log -S` n'en montre rien. Pour
*garder en continu*, il faut l'**atteignable** (`rev-list --objects --all`) :
c'est exactement ce qu'un `push` envoie, et rien d'autre. Écrit d'abord sur le
premier critère, le garde a rougi sur le blob qu'un `commit --amend` venait de
détacher — du travail local que personne ne verra jamais. Il couvre en prime les
**messages de commit**, qui sont atteignables eux aussi.

📌 **La fenêtre comptait plus que la gravité.** Un chemin de compte n'est ni un
secret ni un client. Mais tant que rien n'est poussé, réécrire ne casse aucun
clone ni aucun fork ; après, ça ne redevient jamais gratuit. Mesuré avant
d'agir : **91 commits** réécrits, aucun ne devient vide — donc le compte de 696
tient —, `main` n'est pas concernée, et **un seul** SHA cité par les docs est
touché. La page publiée en cite trois, qui sont republiés avec elle.

⚠️ **Et il a attrapé son propre auteur, dans l'heure.** Cette entrée-ci citait
le chemin en clair pour l'expliquer : le garde a rougi au commit suivant. *Un
garde ne nomme pas ce qu'il interdit* — la valeur est anonymisée ci-dessus, et
c'est le détecteur, pas une relecture, qui l'a exigé.

⚠️ **Le garde tient les deux sens, prouvé par un blob écrit droit dans la base
d'objets** (`git hash-object -w`, sans commit) : il tombe **en nommant la
valeur**, puis redevient vert dès que `gc` la retire. Il refuse aussi de conclure
sur un dépôt qui ne lui donne rien à lire — moins de cinq cents blobs, ou un
témoin absent —, parce qu'un « aucune fuite » rendu par un balayage vide est
exactement la réponse qu'on espère. Coût : **1,5 s** pour 1603 blobs et 255 Mo.

### 501. Le contrôle de classification n'avait aucun lecteur LOCAL

**Fermé le 15/09/2026**, sur un **commit** — celui qui ajoutait au relevé de
`check-scaffold.sh` la ligne du lanceur posé au scaffold le jour même. Le commit
était juste ; c'est l'écart entre les deux gestes qui ne l'était pas.

    lanceur ajouté au scaffold      13:16
    entrée posée au relevé          16:56
    entre les deux                  3 h 40 où le contrôle aurait échoué

Rien ne rougissait, et l'en-tête du script prescrit pourtant de mettre le relevé
à jour **dans le même commit**. La raison est mesurable : son seul appelant
exécutable est `.github/workflows/plugin.yml`, donc une CI qui ne tourne que sur
`main` et sur les pull requests — et rien n'a jamais été poussé. *Un garde dont
le seul lecteur est un événement qui n'a pas encore eu lieu ne garde pas : il
attend.*

⚠️ **Son unique occurrence dans la suite était une MENTION, pas une invocation** :
le nom du script apparaissait dans le libellé d'un autre test, ce qui suffit à
faire croire à un `grep` qu'il est câblé. Le marqueur existait pour une autre
raison, légitime — la septième façon de naître vacant.

📌 **Et il n'avait aucune cible de mutation.** Les deux manques vont ensemble :
personne ne l'exécutait, donc personne ne pouvait apprendre qu'il avait cessé de
garder. *Le site que personne ne mute est le site dont personne n'apprend rien.*

**Ce qui le ferme** : le contrôle est joué par la suite locale, à chaque
exécution ; il porte sa mutation ; et il sait désormais refuser de conclure.

⚠️ **L'INSTRUMENT vient de l'arbre, les DONNÉES de l'état COMMITÉ — et cette
asymétrie est tout le montage.** Lancé sur l'arbre de travail, ce contrôle
verrait la mutation que le harnais vient d'écrire dans le scaffold et la
dénoncerait. Or le harnais crédite le **premier** test rouge : « le garde
tombe » serait alors vrai pour des mutations sans rapport, y compris au-dessus
de gardes parfaitement vacants. *Un test qui rougit sous toute mutation est un
harnais qui approuve tout.* Le script, lui, reste pris dans l'arbre : c'est ce
qui le laisse mutable. Coût mesuré : **0,22 s** par exécution, export de `HEAD`
compris — soit moins de deux minutes sur une passe entière.

⚠️ **Rendre la racine surchargeable a OUVERT un chemin où le script mesurait le
mauvais sujet**, et c'est la contre-épreuve de cette surcharge qui l'a montré :
sur une racine sans scaffold, le `cd` échoue **sans arrêter le script**, `find .`
relève alors le répertoire courant — `.git/` compris — et le diff accuse une
classification qui n'a jamais été lue. Le verdict a l'apparence d'un sujet
fautif alors que rien n'a pu être mesuré. Trois états désormais distincts :
`0` conforme, `1` sujet fautif, `2` pas pu mesurer — et le garde exige **1**, pas
« non nul », sinon un montage cassé passerait pour une détection.

⚠️ **L'ORDRE des assertions comptait plus que leur contenu.** La preuve « le
contrôle a bien tout lu » était écrite avant le verdict ; sous une classification
fautive le script n'imprime plus son compte, donc c'est elle qui parlait la
première — en accusant le garde de ne plus savoir lire, et en taisant le diff qui
dit quoi corriger. Le montage d'abord, le sujet ensuite, l'instrument en dernier.

📌 Le compte attendu se **dérive des données** (les fichiers réellement présents
dans l'export), jamais du relevé figé — qui rendrait le contrôle circulaire — ni
d'un plancher deviné. C'est le seul critère qui voie aussi une **troncature** de
l'instrument.

### 502. Le remède que `QAM-START-ABSORBE` prescrit n'existe pas dans Maestro

**Fermé le 15/09/2026**, rapporté par le run 80 (Android, terrain 1) et
reproduit avec sa contre-épreuve avant inscription.

**Ce qui le ferme** : le remède prescrit désormais les deux gestes que des runs
ont réellement joués — retirer l'appel quand rien ne peut ouvrir d'invite,
le déplacer là où elle naît sinon — et dit que ces fichiers appartiennent au
projet, sans quoi le lecteur attend une mise à jour qui ne viendra jamais.

⚠️ **Le garde évident ne marchait pas, et c'est la mesure qui l'a dit AVANT
qu'il soit écrit.** Exiger que toute propriété citée soit « employée par un flow
livré » ne discrimine rien : `timeout:` **est** valide — sur `extendedWaitUntil`,
pas sur `tapOn`. La validité tient au COUPLE commande/propriété, jamais à la
propriété seule. Et le motif aurait en prime matché la mention que le remède
fait de la propriété pour l'écarter. Le garde porte donc sur ce que le remède
PRESCRIT, jamais sur ce qu'il interdit — un garde qui nomme la forme fautive se
périme à la première reformulation et remet dans le dépôt la chaîne qu'il sert
à en sortir.

Le finding du **479** est juste, sa mesure est juste, et il censure correctement
les échantillons absorbés au lieu de rendre un budget tenu sur du néant. C'est ce
qu'il CONSEILLE qui ne tient pas :

> `suggestedFix` : « donne un `timeout:` court au geste optionnel »

    maestro --version                            → 2.8.0
    check-syntax, tapOn AVEC timeout:            → exit 1
       Unknown Property: timeout at /syntax-checker:-1:-1
    check-syntax, LE MÊME flow SANS timeout:     → exit 0, OK

Les deux fichiers ne diffèrent que par cette ligne : l'instrument discrimine, et
la propriété que le plugin conseille est **rejetée par l'outil qu'il pilote**.

⚠️ **Et l'alternative coûte la même chose.** L'agent a mesuré un garde
`runFlow: when: visible:` à la place : **7 088 ms** contre 7 190–7 490. Il ne
reste donc que *retirer* le geste — ce que ce terrain permettait (manifeste à
**0** `uses-permission`, `lib/` sans `requestPermission`) et qu'un projet à
permissions ne permettrait pas sans rouvrir le **405**.

🔴 **Aucun garde ne pouvait le voir, et c'est le cœur du point.** Un
`suggestedFix` est de la PROSE dans un objet de finding : ni le typecheck, ni les
517 gardes, ni la CI ne l'exécutent. Il est vrai le jour où on l'écrit et faux
quand l'outil change, sans que rien ne bouge. C'est la classe « promesse de
comportement technique non couverte par un test », et le remède devra donc porter
sur le fait que la prescription soit EXERCÉE — un flow d'exemple que
`check-syntax` valide en CI —, pas sur la reformulation de la phrase.

### 503. L'analyse binaire iOS n'est pas couverte, et un défaut de parité y a vécu

**Fermé le 15/09/2026**, rapporté par le run 81 (iOS, terrain 2).

**Ce qui le ferme** : la DÉCISION est séparée de l'extraction, parce qu'elle est
la même des deux côtés quand le format d'archive ne l'est pas. Elle garde ses
deux gestes — motif ancré sur le paquet du projet, sonde de présence certaine —
et iOS lit son AOT dans `Frameworks/App.framework/App`, directement.

⚠️ **Le troisième barreau a failli manquer.** La fonction peut être juste et
n'avoir aucun appelant : une mesure qu'on n'invoque jamais est indiscernable
d'une mesure qui ne trouve rien, c'est-à-dire le défaut même qu'on ferme. Le
garde tient donc aussi le CÂBLAGE — et son premier motif était vacant le jour
de son écriture, `auditObfuscationIos(` matchant sa propre DÉCLARATION dans le
même fichier. Ancré sur l'affectation, prouvé dans les deux sens.

📌 **Le refactor a périmé deux mutations existantes** — la sonde et le motif ont
changé de fonction, donc de nom de variable. Ré-ancrées dans le commit du
correctif, comme la règle le demande.

    80 chemins `package:<le paquet de l'app>` LISIBLES dans l'AOT iOS release
    contre-épreuve : 60 sur un motif témoin — l'instrument discrimine

`docs/FLAVORS.md` du terrain porte `--obfuscate --split-debug-info` sur les
**deux** lignes Android et sur **aucune** ligne iOS. Le défaut appartient au
projet ; ce qui appartient au plugin, c'est qu'**aucun finding ne pouvait le
dire** : `sec.mjs` analyse l'APK (chaînes, permissions, manifeste fusionné) et
n'a pas d'équivalent pour un `.app`. C'est l'agent qui est allé mesurer de
lui-même, hors harnais.

📌 C'est l'anti-pattern de **parité entre plateformes** au mot près : la bonne
décision existait dans le projet, écrite et commentée du côté Android, et elle
n'avait simplement pas traversé. Le harnais reproduit la même asymétrie.

⚠️ **Le remède ne doit pas être un balayage de chaînes de plus.** Ce qui manque
est une dimension : *ce que la release iOS publie d'elle-même*. La mesure existe
déjà côté Android et elle a son vocabulaire — à porter, pas à réinventer. Et le
garde devra prouver qu'il sait VOIR avant de dire qu'il n'a rien vu, sinon un
`.app` obfusqué et un `.app` que le scanner n'ouvre pas rendront le même zéro.

### 504. Un avertissement écrit DEUX FOIS a échoué QUATRE fois

**Fermé le 15/09/2026**, rapporté par les runs 80 **et** 81 — deux terrains,
deux plateformes, deux agents qui ne se connaissent pas.

**Ce qui le ferme** : le message du parseur DIT quoi faire, comme le fait son
voisin immédiat depuis toujours — et il le dit en **un seul endroit**, les deux
copies précédentes n'attendant que de diverger. Le garde l'EXERCE au lieu de
le lire, sur les deux formes de bloc, et prouve que ce qu'il prescrit **passe**
réellement : un remède non exercé est exactement le défaut que le 502 ferme à
deux fichiers d'ici.

📌 **La place comptait plus que le texte.** Le fichier prévenait deux fois, et
bien ; mais un commentaire s'adresse à qui n'a pas encore le problème, un
message d'erreur à qui l'a. Le premier se lit avant d'écrire sa valeur — donc
jamais ; le second au moment où ça casse — donc toujours.

`evidenceAcknowledged` a reçu un bloc YAML replié dans les deux runs
(`argus.mobile.yaml:919` au 80, `:1058` au 81), et le parseur a refusé :

    bloc multi-lignes (| ou >) non supporté

Le refus est **délibéré et bien fait** : le parseur est un sous-ensemble YAML
assumé, il nomme la ligne au lieu de mal interpréter, et toutes les commandes
s'arrêtent tant que ce n'est pas corrigé. Rien à reprocher au mécanisme.

🔴 **Ce qui est en cause est le remède du 393.** Le fichier livré prévient
**deux fois** — en tête (« chaînes QUOTÉES repliées … un run l'a rencontrée sur
`evidenceAcknowledged`, dont le commentaire invite à écrire une phrase ») et à la
clé elle-même (« une invitation à *écrire une phrase* y a déjà conduit deux
fois »). Les deux textes sont justes, précis, et placés au bon endroit.

**Quatre occurrences, et le quatrième lecteur n'a pas plus vu l'avertissement que
le premier.** Le constat n'est donc plus sur le parseur ni sur l'attention du
lecteur : *une clé qui appelle une phrase, dans un format qui n'accepte qu'une
ligne, est un écart de CONCEPTION que nul avertissement ne comble.* Deux remèdes
possibles, et il faut choisir plutôt qu'avertir une troisième fois : le parseur
accepte `>` pour les clés de prose, ou la clé cesse d'inviter à écrire une phrase
(un champ court, une énumération, un booléen plus un motif borné).

📌 À rapprocher du **480** — « l'avertissement qui écarte un raccourci ne
s'adresse qu'à ceux qui ne l'ont pas pris ». Même famille : le texte est lu par
ceux qui n'en avaient pas besoin.

## Rendu par la paire de CONFIRMATION 82-83 — 16/09/2026

Deux agents vierges, deux terrains, deux plateformes, et des prompts **identiques
au caractère près** à ceux des runs 78 et 79 (diff prouvé dans les deux sens) :
la seule variable était le plugin. C'est la passe qui manquait aux 502-504, dont
les correctifs n'étaient gardés que par des tests et des mutations.

**Ce que la paire a confirmé**, chaque ligne mesurée sur les artefacts :

| | |
|---|---|
| **502** | le finding rend le NOUVEAU remède, fausse piste fermée en toutes lettres, et l'agent a fait la vérification qu'il prescrit |
| **503** | `obfuscation.scanned: true`, `projectPaths: 0`, distinct du scan d'archive qui dit POURQUOI il ne conclut pas. Son pendant sur l'autre plateforme a tourné au 83 |
| **504** | **non exercé** — aucun bloc replié écrit ni sur un terrain ni sur l'autre. Il reste gardé par ses seuls tests |
| **475** | l'avertissement de l'installeur a été relayé par les DEUX agents, l'un le classant reste-à-faire n° 1 |
| **479** | l'autre moitié : il ne censure pas quand il y a une vraie mesure. Les trois cas sont maintenant vus — rien à censurer (81), tout absorbé (82), vraie lenteur (83) |
| réserve de variant | la mise en garde « mesuré sur un debug » est bien sur le DÉMARRAGE, l'appel qui l'avait perdue |

⚠️ **Deux constats des agents étaient la SORTIE d'un remède**, pas un défaut : le
workflow posé sur un projet dont la forge est autre (475), et les valeurs saisies
présentes dans les artefacts par défaut (documenté au SKILL). Les inscrire aurait
dédoublé des points fermés. *Un journal de vérification n'est pas un journal de
résultats* — le piège s'est présenté aux deux runs.

### 505. Le remède du 502 est lisible, suivi, et il ne TRANCHE pas

**Fermé le 16/09/2026**, rapporté par le run 82 et reproduit sur les artefacts.

**Ce qui le ferme** : le remède chiffre désormais la troisième branche — garder le
geste quand rien ne peut ouvrir d'invite, ce que le run 82 a fait — avec ce
qu'elle coûte et ce qu'elle PERD. Le garde vise ce que lui seul lit, les deux
autres branches ayant déjà le leur, et il asserte qu'elles survivent : *un remède
se complète, il ne se remplace pas.*

Deux agents vierges, **le même terrain**, deux décisions opposées sur le même
geste : le run 80 a RETIRÉ l'appel au sous-flow qui referme les invites système ;
le run 82 l'a GARDÉ, en écrivant sa raison dans le fichier — aucune permission
déclarée, mais l'invite reste utile pour ce que la plateforme présente d'elle-même.

    10/10 flows absorbés · 7 254 à 7 354 ms attendus avant la mesure
    mesures retenues : 80, 80, 82, 85, 85, 85, 88, 199, 353 ms
    ⇒ le budget de démarrage n'est jugeable sur AUCUN flow

Le remède dit quoi faire **si l'app ne demande aucune permission** (retirer), et
ce que coûte de le garder **si elle en demande** (« en acceptant le coût sur les
flows concernés »). Il ne dit pas ce que coûte de le **garder quand rien ne peut
ouvrir d'invite** — c'est-à-dire le seul cas où le coût est intégral, et
précisément celui où le lecteur hésite.

📌 Le correctif du 502 reste juste : il a supprimé une prescription que l'outil
rejette. Ce point-ci porte sur ce qui manque à côté — *un remède qui laisse le
choix ouvert doit chiffrer les deux branches, sinon il départage par le tempérament
du lecteur.* Deux runs, deux tempéraments, deux résultats.

### 506. Un libellé qui porte une virgule, dans une syntaxe qui s'y coupe

**Fermé le 16/09/2026**, rapporté par le run 82.

**Ce qui le ferme** : `--check-flows` nomme la cause — fichier, ligne, segment
coupé — et donne les deux issues, avant que l'outil piloté ne rende son message
opaque. Le découpage respecte les guillemets, sans quoi la forme JUSTE serait
accusée : *un contrôle qui rougit sur ce qui va bien apprend à être ignoré, et
vaut alors moins que pas de contrôle.* Un garde s'exerce sur les flows LIVRÉS et
non sur un montage, parce qu'un montage propre prouve la logique et jamais la
rencontre avec ce qui est distribué.

L'agent a écrit treize commandes sous forme de map **en flow** dont le libellé
est une phrase française :

    - tapOn: { id: …, label: Refermer le formulaire, s'il est ouvert }

YAML coupe la map sur la virgule, et c'est l'outil piloté qui refuse — avec un
message qui ne nomme pas la cause : `Unknown Property: s'il est ouvert`.

Mesuré : le scaffold n'écrit **aucune** map en flow (0 occurrence dans tout
`assets/scaffold-mobile`, 0 dans le SKILL et ses références) — il écrit en bloc,
où la virgule passe. **Le plugin n'y conduit donc pas**, et c'est ce qui borne la
valeur de ce point.

📌 Mais c'est le **phénomène du 504**, à un fichier de distance : *un champ qui
invite à écrire une phrase, dans une syntaxe qui n'accepte pas ce qu'une phrase
contient* — une virgule ici, un retour à la ligne là. Le garde du 504 vit dans le
parseur de configuration et ne peut structurellement pas atteindre les flows.
Ce que le lint peut faire, lui, c'est nommer la cause au lieu de relayer.

### 507. Le runner coupe les animations et ne les rend JAMAIS

**Fermé le 16/09/2026**, rapporté par le run 83 — et **prouvé par l'expérience**
plutôt que par lecture : les trois échelles ont été remises à `1.0` avant le run
(relevé après coup), elles valaient `0` à la fin.

**Ce qui le ferme** : la restauration, armée sur `exit` et sur les deux signaux —
`main()` sort par une dizaine de `process.exit()` placés APRÈS la coupure, si
bien qu'un geste posé « à la fin » n'aurait été joué que sur un chemin sur dix.
Et deux verdicts au lieu d'un : `ok` dit l'ÉTAT, `prouve` dit si l'écriture a été
MESURÉE. *Les deux moitiés se ferment par le même geste* — restaurer est ce qui
rend la preuve possible au run suivant.

`run.mjs` définit les trois échelles, les met à zéro et **relit la valeur pour le
prouver** — ce qui est bien. Mais la constante n'a que **deux** usages dans tout
le fichier, et **aucune fonction ne restaure**. Deux conséquences, et la seconde
est la pire :

1. *Hygiène* — le runner modifie un réglage **système global**, pas un réglage de
   l'app, et laisse l'appareil ainsi. Rencontré à **quatre préparations de suite**,
   sur les deux terrains.
2. 🔴 *Garde vacant* — au run suivant sur le même appareil, les échelles valent
   déjà `0` : la relecture rend `0` **sans que l'écriture ait rien changé**. La
   preuve de coupure ne peut alors plus dire non, et le commentaire du 486
   explique précisément pourquoi ce signal compte sur cette plateforme.

Le remède doit fermer les deux : relever les valeurs AVANT, les restaurer après,
et faire porter la preuve sur l'**écart** (autre chose avant, `0` après) plutôt
que sur la valeur seule — sans quoi on garde une mesure qui ne peut plus échouer.

### 508. Un canal sortant que le cadrage ne PEUT pas neutraliser

**Fermé le 16/09/2026**, rapporté par les runs 82 **et** 83 — deux terrains, deux
agents qui ne se connaissent pas, deux SDK différents, le même mur.

**Ce qui le ferme, et Germinator a tranché « les deux »** : la classification au
§2 du SKILL, qui fait reconnaître le cas à l'inventaire ; et `telemetry.leftOpen`,
que le rapport publie sous « Canaux laissés ouverts ». 🔴 `why` est une
ÉNUMÉRATION FERMÉE et non du texte libre : *une clé qui invite à écrire une
phrase, dans un parseur qui n'accepte qu'une ligne, est l'écart de conception que
le 504 a payé quatre fois* — fermé ici par le TYPE, pas par un avertissement de
plus. L'exemple livré est asserté DÉCOMMENTÉ, puisque l'échec du 504 était un
exemple qu'on ne pouvait pas suivre.

Le gabarit de prompt demande de neutraliser la télémétrie et de le prouver, et il
suppose qu'un canal se coupe par une injection de build. Les deux agents ont
trouvé une classe pour laquelle c'est structurellement faux :

| run | canal | pourquoi il est resté ouvert |
|---|---|---|
| 82 | une vérification de mise à jour interrogeant la fiche du magasin à chaque ouverture des réglages | « aucune injection de build ne le gouverne ; le couper aurait demandé de toucher `lib/`, donc de changer l'app que je viens tester » |
| 83 | la messagerie push, qui demande un jeton après l'accueil | « le seul moyen était de toucher `lib/` ou de retirer le fichier de configuration — l'amorçage de l'accueil échouerait » |

Les deux l'ont **dit au compte rendu**, ce qui est le comportement attendu et
montre que la consigne « vérifie toi-même ce que ce projet émet d'autre » porte.
Ce qui manque est en amont : *le skill classe les canaux en « à neutraliser »
sans distinguer ceux que le build gouverne de ceux qui vivent dans le code*. Pour
les seconds, la seule réponse honnête est de les inventorier, de dire ce qu'ils
émettent et vers qui, et de laisser la décision à qui connaît le projet — jamais
de laisser croire qu'une passe QA est muette.

⚠️ Deux remèdes possibles, à choisir plutôt qu'à cumuler : l'inventaire de §2a
rend une **classification** (gouverné par le build / dans le code / inerte), ou
le rapport porte une ligne « canaux laissés ouverts » que le gate ne fait pas
échouer mais qu'il ne peut pas taire.

### 509. Deux instruments du harnais se contredisent, et le rapport se tait

**Fermé le 16/09/2026**, rapporté par le run 83.

**Ce qui le ferme** : croiser les deux sources est impossible — l'étage 1 publie
un finding agrégé sans ancre, donc l'information n'est pas dans le rapport. Le
finding device porte donc la réserve lui-même, **bornée au seul cas qui la
mérite** : un champ de saisie. Un bouton-icône anonyme est un défaut sans
ambiguïté, et lui coller la même prose apprendrait à sauter la ligne.

Sur le même écran : l'étage 1, qui lit l'arbre sémantique du framework, ne
rapporte **aucun** libellé manquant ; la passe device, qui lit le dump de la
plateforme, y voit un champ de saisie sans libellé, bornes à l'appui. Les deux
lisent des arbres différents — le second voit vraisemblablement la vue native
créée pour la saisie.

L'agent a **refusé de trancher** laquelle décrit ce que le lecteur d'écran
annonce, et il a eu raison de le dire plutôt que de le supposer. Ce qui manque
est que **rien dans le rapport ne signale l'écart** : deux dimensions rendent des
verdicts inconciliables sur le même nœud, et elles sont publiées côte à côte sans
un mot. 📌 La cible tactile, elle, **concorde** des deux côtés — ce qui montre que
le désaccord porte sur la nature du nœud lu, pas sur la mesure.

### 510. Un garde borne sa fenêtre par un NOMBRE, et se casse à distance

**Fermé le 16/09/2026**, rencontré en fermant le 508 — pas rapporté par un run.

**Ce qui le ferme, et la mesure a décidé du remède** : le balayage en a compté
**38** dans le même fichier. Celui qui avait cassé n'était donc pas le problème,
il en était un cas — et les réécrire toutes aurait été le mauvais geste, puisque
certaines fenêtrent deux lignes de CODE, où un nombre est juste et local.

Ce qui se ferme est la **classe** : `sectionDepuis` borne par le titre suivant —
qui est aussi le vrai critère de proximité, la phrase devant vivre dans la MÊME
section que la consigne — et le compte est **figé par égalité**, si bien qu'une
fenêtre de plus est une décision et non une dérive. Le garde du 413 prend
désormais sa section : **7060 caractères au lieu de 1800**, les quatre phrases
requises dedans.

📌 **L'une des 38 est la contre-épreuve du garde voisin**, qui DOIT fenêtrer par
un nombre puisque c'est ce qu'elle démontre — sans elle, rien ne prouverait que
la structure apporte quelque chose. Elle est légitime, elle est comptée, et la
raison est écrite : *masquer une occurrence rendrait le relevé faux.*

⚠️ **Ce point repart sans mutation, et voici pourquoi** : le sujet de ces gardes
est le fichier de test lui-même, que le harnais ne cible pas — ce serait
circulaire. Deux choses en tiennent lieu, et elles ont été vérifiées : le relevé
a **réellement rougi** pendant l'écriture (38 contre 37, attrapé par sa propre
égalité), et le garde du 413 garde la mutation qu'il avait déjà. Rejouée à la
main sur le SKILL, elle fait tomber **exactement** le garde reborné — vérifié en
lisant tous les noms qui rougissent, le harnais n'en affichant qu'un tronqué.

Le garde du 413 cherche une consigne dans le SKILL, puis vérifie trois phrases
dans les **1800 caractères** qui suivent. Ajouter la classification du 508 dans
ce paragraphe a repoussé la troisième au-delà de la borne : *un garde exact,
rendu rouge par un ajout légitime, à un endroit qu'il ne surveillait pas.*

Le remède appliqué a été de déplacer la prose hors du paragraphe — ce qui rend le
garde vert sans rien régler : **la borne reste un nombre deviné**, et le prochain
ajout la refranchira. Ce qu'il faut est une fenêtre bornée par la STRUCTURE (du
motif jusqu'au prochain titre), qui ne dépend d'aucune longueur.

📌 À rapprocher de la règle « une fenêtre calculée par index retombe sur le
fichier entier quand la recherche échoue » : ici la recherche réussit, et c'est
la TAILLE qui ment. Même famille, autre moitié.

⚠️ Et le balayage doit être total : ce fichier n'est sans doute pas le seul garde
à fenêtrer par un nombre. Compter d'abord, corriger ensuite.
