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

## Rendu par le run 2 — un second agent vierge, 21/08/2026

Le terrain a été **remis à neuf** (production du run 1 sauvegardée hors dépôt) et
le skill ré-appliqué de zéro par un agent sans contexte, quelques heures après la
clôture des dix premiers points. Il en a rendu **25**. Aucun ne figurait ici.

Les numéros repartent à 11 : ils ne se réutilisent pas.

⚠️ Marqués **[vérifié]** : je les ai reproduits moi-même dans le dépôt plutôt que
de les croire. Six sur six l'étaient. Les autres viennent de son rapport et
restent à confirmer.

### Ce que le harnais promet et ne tient pas

**12. [vérifié] `make argus-anchors` ne prouve que les racines.** Le skill en fait
LA preuve de l'instrumentation, mais `ArgusScreen.anchor` est **singulier** : sur
ce projet, 55 ancres de commande n'avaient aucun endroit où être déclarées, donc
aucune n'était vérifiée. C'est dans cet angle mort qu'un défaut s'est logé chez
lui — une ancre posée sur un nœud inerte, le nœud tapable restant sans libellé,
garde au vert. Il a fallu une sonde écrite à la main pour le voir.

**13. `argus.mobile.yaml` n'est pas « le SEUL fichier à éditer ».** §3c le dit puis
nomme `harness.dart` dans la phrase suivante, et sept flows portent des
`TODO(argus)` en `ARGUS:OWNED`.

**14. Le format du rapport d'instrumentation n'a pas de case pour les racines.**
Le bloc de §2b compte des « widgets interactifs » ; l'essentiel de la production,
ce sont les racines d'état, qui n'en sont pas. Il a ajouté une ligne entre
crochets — soit exactement les deux formats que ce bloc devait empêcher.

**15. Aucun critère pour « instrumenté ».** §2b fait chercher `identifier:` **et**
`semanticLabel:`. Un `semanticLabel:` traduit s'annonce bien mais n'est pas une
ancre. Compté d'une façon : 0/24. De l'autre : 5/24 et un rapport flatteur.

### Cas que le skill ne couvre pas

**16. Le composant qui construit DÉJÀ son propre nœud `Semantics`.** « Pose l'ancre
sur le nœud qui porte le rôle » est inapplicable dans un design system, et le
résultat **dépend du widget** — mesuré par lui : autour d'un `InkWell` les nœuds
fusionnent (un nœud, `id` + `label` + `tap`) ; autour d'un `IconButton` ils ne
fusionnent pas (l'identifié est inerte, le tapable est anonyme). ⚠️ Et `tooltip:`
ne corrige pas : il remplit le champ `tooltip`, pas `label`. C'est le cas le plus
fréquent sur un projet mature, et la table du point 4 ne le couvre pas.

**17. Écrans impossibles à monter seuls.** Contenu de `showModalBottomSheet` porté
par un widget privé : §2 veut une racine par état, §3f-bis veut prouver chaque
racine à l'étage 1 — incompatibles.

**18. Écrans à animation perpétuelle.** `pumpArgus` finit par `pumpAndSettle`, qui
expire sur un point pulsé. Ces écrans ne peuvent pas entrer dans `argusScreens`,
et l'échec ressemble à un test lent. (Même mécanisme que le point 9, côté étage 1.)

**19. Déclarer un `ArgusScreen` SANS ancre.** Rien ne le prévoit, `anchor` est
nullable — et c'est l'entrée qui a le plus rapporté chez lui : la coquille
(barre + onglets) a seule trouvé un débordement à taille de texte **nominale**.
Contrepartie : `argusScreens` et `screens[]` cessent de se correspondre.

**20. Que faire des défauts PRÉEXISTANTS que les gardes révèlent ?** §2 exige
`Z = 0` avant d'installer ; rien ne dit quoi faire des 43 échecs que l'étage 1
lève sur une app existante. Corriger (dérive de périmètre) ? Mettre en
quarantaine ? Installer rouge — ce que §3h valide implicitement sans le dire.

**21. Nommer une ancre dont la clé stable EST la valeur affichée** (`QuickChips`
sur `[10,20,30…]`). Fini et connu ⇒ dériver du modèle ; dynamique ⇒ rang. Ici les
deux règles se rejoignent sur le même nombre.

**22. Un seuil de démarrage face à un plancher assumé.** L'app impose 2 s de splash
de marque : le défaut de 2000 ms est rouge par construction. Relever le seuil pour
verdir serait le contraire d'un garde — mais le skill ne dit pas quoi faire.

**23. Combien d'états déclarer, et lesquels en visuel.** « Une racine par état »
n'a pas de règle d'arrêt : 13 états × visuel ≈ 9 min de CI. Et il n'existe pas de
« déclaré mais pas encore atteignable », si bien que `screensConfigured`
**surestime** ce qui est réellement exercé.

**24. Un message d'instrumentation pour un défaut de SCÉNARIO.** Sa session de test
durait 10 s et se terminait avant les étapes d'abandon ; Maestro rapportait
« `confirm_sheet_root` n'est pas visible ». Même famille que le point 7, jamais
signalée pour la durée métier.

### Outillage

**25. [vérifié] `make argus-visual` ne fait pas de régression visuelle** — il lance
`--tags=visual` avec `ARGUS_SCREEN_ID` vide, donc la branche de skip. Seul
`argus-run` complet boucle sur les écrans.

**26. [vérifié] `make argus` n'atteint jamais `argus-report`** : `argus-run` sort en
2 sur un finding, et make s'arrête.

**27. [vérifié] `argus-doctor` sonde le `flutter` du PATH**, pas celui du projet —
le Makefile dérive pourtant `FLUTTER` de `.fvmrc`. Il a vu 3.32.0 là où le projet
construit en 3.41.9.

**28. [vérifié] §3g prescrit `flutter build apk --debug` sans `fvm`**, alors que §2a
l'impose dès qu'un `.fvmrc` existe. La commande échoue sur ce projet.

**29. `make argus-a11y` mesure ce qui traîne à l'écran**, sans pouvoir désigner
l'écran. Lancé après une suite, il a mesuré le **splash** et rendu « rien à
mesurer » — honnête et vide. Piège sur toute app à splash.

**30. `make argus-report` agrège les JSON présents, quel que soit leur âge.** Après
sa preuve par corruption de baseline, le HTML décrivait un état qui n'existait
plus. Rien ne dit que le rapport est un instantané de fichiers périmés.

**31. `model`/`os` avec `autoStart: false`** sont purement documentaires, mais le
rapport les imprime en `declared` face au modèle mesuré — une comparaison sans
objet. Le schéma ne permet pas de dire « inconnu ».

**32. Le bloc `i18n` présume une app monétaire** (`currencySample`, TODO XOF), sans
objet pour une app qui n'affiche aucun montant.

**33. Fusion du `.gitignore`** : prescrite sans règle d'emplacement ni de
déduplication.

**34. `allowSecretsIn` et les fichiers gitignorés** : les y lister est redondant,
le skill ne tranche pas.

**35. `expectedPermissions` se juge sur le manifeste FUSIONNÉ**, que `sec.mjs` ne
peut pas lire sans `aapt2` — un réglage à poser avant de pouvoir le mesurer.

### Et le dialogue de cadrage (§1) n'a pas eu lieu

Le skill ouvre sur un dialogue « OBLIGATOIRE ». La mission ayant pré-tranché le
mode, il a décidé seul de `ENV`, des plateformes, du device et des seuils — sans
que rien ne lui dise que c'était à lui de le faire, ni que ces choix engageaient
les garde-fous de sécurité.

## Ce qui reste

**Les dix premiers points sont clos. Vingt-cinq nouveaux les remplacent**, rendus
par un second agent vierge sur un terrain remis à neuf. C'est le résultat le plus
utile de la journée : un skill qu'on venait de déclarer sans dette en portait
vingt-cinq, dont une qui rendait fausse une doc écrite le matin même.

Priorité claire : le **11** d'abord. Tant qu'il tient, le skill demande de soigner
un réglage qui ne fait rien, et le dit avec des chiffres mesurés — ce qui le rend
d'autant plus crédible.
