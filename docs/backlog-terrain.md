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

## Ce qui reste

**Rien — et ça ne veut pas dire grand-chose.** Le 21/08 au matin, le backlog était
vide aussi ; le soir, un second agent vierge en rendait vingt-cinq. C'est le
résultat le plus utile de ces deux journées, et il porte sur la méthode plus que
sur le skill : une passe trouve ce qui manque, la suivante trouve ce que la
correction a introduit ou n'a pas branché.

Deux choses valent d'être notées pour la prochaine remise à neuf du terrain :

- **Onze réglages de configuration n'avaient aucun lecteur**, et non deux. Le
  point 11 en nommait le seul dont quelqu'un s'était aperçu ; c'est un garde
  dérivé — « aucune feuille de `DEFAULTS` sans lecteur » — qui a trouvé les dix
  autres, dont deux se lisaient comme des garanties. Chercher la classe d'un
  défaut plutôt que le défaut a rapporté cinq fois plus que le corriger.
- **Trois gardes écrits pendant cette passe sont nés vacants ou trop faibles**, et
  c'est le harnais de mutation qui l'a dit à chaque fois — jamais la relecture.
  Un comptait sa propre mention, un exerçait une branche inatteignable dans ce
  dépôt, un confondait deux causes sous le même verdict.
