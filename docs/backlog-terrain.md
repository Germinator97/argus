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

### 6. Le point de départ des flows est dérivé d'une convention muette
`run.mjs` choisit l'écran de départ par `screens.find(s => s.id === 'home')`,
avec repli sur `screens[0]`. Rien ne documente que l'identifiant `home` a un
sens particulier, et le repli est piégeux : si le premier écran déclaré est un
ÉTAT (liste vide), son ancre n'existe pas dans l'autre état.

⚠️ **Déclassé le 21/08/2026 : ce n'était PAS la cause des échecs du point 7.**
Le défaut de conception reste réel, mais il n'a rien produit sur le terrain — la
convention porte désormais un nom (`startScreen`) et le rapport dit lequel a
servi et par quelle voie (`startup.declaredAsHome`). Ce qui manque encore est un
point de départ *déclaré*, ce qui suppose une clé de config à arbitrer.

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

### 8. Les références visuelles n'ont jamais été générées
La dimension visuelle s'est donc marquée « non exécutée » — correctement, avec
sa raison. Elle reste à éprouver au moins une fois.

⚠️ Ne pas les générer avant d'avoir déclaré le device par `avd` : elles sont
liées au couple device + OS, et un `udid` d'émulateur est un numéro de port qui
change d'AVD entre deux sessions (voir `device-matrix.md`).

⚠️ Et vérifier d'abord de quel côté du `SafeArea` la racine servant de
`visualCropOn` a été posée — sinon la barre d'état entre dans la référence, et la
dimension est rouge à chaque minute qui passe (point 5, clos, mais c'est ici que
sa conséquence se paie).

## Ouvert par la séance du 21/08/2026

### 9. `waitForAnimationToEnd` expire à presque tous les flows
Médiane relevée : **5 222 ms** pour un timeout de 5 000. L'écran n'est donc
quasiment jamais jugé stable, et chaque flow paie ce plein timeout sans que rien
ne le signale. Deux causes possibles, non départagées : une animation perpétuelle
côté app (halo, indicateur), ou un critère de stabilité trop strict pour un
émulateur chargé. À mesurer avant de toucher au timeout — le chiffre ne dit pas
encore laquelle des deux.

### 10. Interpoler une variable dans `timeout:` n'est pas prouvé
Les flows portent `timeout: 20000` en dur, un nombre deviné. Le dériver de
`thresholds.coldStartMs` supposerait que Maestro interpole `${…}` dans un champ
numérique : la doc ne le dit nulle part, et ça n'a pas été éprouvé sur device.
Une injection a été écrite puis **retirée** pour cette raison — livrer une
variable dont on ignore si elle est consommée, c'est livrer une branche morte.

## Comment ce qui reste se regroupe

Trois lots, et ils ne demandent pas la même chose :

- **8, 9 et 10 tiennent dans une seule session sur émulateur** — même montage,
  même démarrage. Les faire séparément paierait trois fois le même coût.
- **6 demande un arbitrage**, pas du travail : ajouter une clé de config est
  visible par tous les projets consommateurs.
- **7 ne demande plus rien** — il est là pour être relu.
