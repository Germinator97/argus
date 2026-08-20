# Ce que le terrain a signalé et qui n'est pas encore traité

Ce fichier n'est pas une liste de souhaits : chaque entrée vient d'un projet
Flutter réel sur lequel le skill a été exercé, et décrit un endroit où il a
laissé décider sans instruction. Les points déjà traités n'y figurent plus —
ils sont dans le skill, avec le commit qui les explique.

Formulé sans jamais nommer les projets d'essai : ce dépôt est public.

## Écrit par un agent qui découvrait le skill

Un agent sans connaissance du projet cible a appliqué l'étape 2 à partir du
skill seul. Il a produit une instrumentation plus complète que celle écrite à la
main auparavant — 49 ancres contre 7, 16 racines d'état contre 7 racines
d'écran — et a rendu 14 points de friction. Neuf sont clos ; voici les cinq qui
restent.

### 1. Une racine d'écran qui est AUSSI une commande
La méthodologie exige une racine « inerte », et n'envisage pas l'écran dont
toute la surface est un contrôle : tap-to-pause, tap-to-dismiss,
pull-to-refresh. Le repli retenu sur le terrain — deux nœuds, une racine inerte
plus un nœud de commande — n'est écrit nulle part.

### 2. Le rapport d'instrumentation n'a pas de format
§2b demande « X widgets, Y instrumentés, Z à instrumenter » avec les
`fichier:ligne`. Le contrat de sortie n'est convoqué qu'en §4, et la
méthodologie affirme que ce rapport « EST une métrique a11y » — ce qui suggère
un finding de dimension `a11y` que §2 ne demande pas. Deux agents rendront deux
formats.

### 3. Le passage de témoin entre l'instrumentation et la configuration
Les ancres posées en §2 sont exactement ce qui doit remplir `screens[]` en §3.
Ni l'une ni l'autre étape ne le dit. Quand les deux sont faites par deux
sessions — le cas dès que le chantier dure —, la liste d'ancres EST l'artefact
de passation et personne n'a demandé de la produire.

### 4. Cohabitation avec les autres producteurs de sémantique
`Tooltip`, `MergeSemantics`, `ExcludeSemantics`, `Hero` contribuent eux aussi à
l'arbre. Poser l'ancre dedans ou dehors change le résultat, et le skill n'en
parle pas.

### 5. La géométrie de la racine, pas seulement son absorption
Le skill traite la racine pour ce qu'elle absorbe. Or ses *bounds* alimentent la
dimension visuelle : posée à l'intérieur ou à l'extérieur du `SafeArea`, elle ne
cadre pas la même surface. Jamais discuté.

## Trouvé en exécutant l'étage 2 sur un device

### 6. Le point de départ des flows est dérivé d'une convention muette
`run.mjs` choisit l'écran de départ par `screens.find(s => s.id === 'home')`,
avec repli sur `screens[0]`. Rien ne documente que l'identifiant `home` a un
sens particulier, et le repli est piégeux : si le premier écran déclaré est un
ÉTAT (liste vide), son ancre n'existe pas dans l'autre état, et tout flow qui
part de là échoue par intermittence. Le point de départ devrait être déclaré
explicitement, et pointer une ancre vraie dans tous les états.

### 7. Diagnostic laissé en suspens
Deux flows sur six ont échoué sur « l'ancre de départ n'est pas visible », alors
qu'un dump de la hiérarchie montrait cette même ancre présente et adressable.
La cause du point 6 est plausible mais N'A PAS été confirmée : rejouer le flow
seul, avec l'état applicatif effacé, reste à faire. Ne pas conclure avant.

### 8. Les références visuelles n'ont jamais été générées
La dimension visuelle s'est donc marquée « non exécutée » — correctement, avec
sa raison. Elle reste à éprouver au moins une fois.
