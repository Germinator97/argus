# Chantiers différés

Ce fichier n'est pas le [backlog terrain](backlog-terrain.md) : les entrées de
celui-là viennent d'un projet réel sur lequel le skill a été exercé. Ici vivent
les chantiers qui **ne viennent pas du terrain** — une question posée, une
relecture, un cas qu'on a mesuré sans l'avoir rencontré. Structure du plugin ou
comportement du skill, peu importe : ce qui les réunit est d'avoir été mesurés,
tranchés pour l'instant, et de rouvrir à une condition écrite.

Chaque entrée porte : ce qu'on a mesuré, ce qu'on a décidé **pour l'instant**, la
condition qui rouvre le dossier, et la **commande qui re-mesure** — un relevé
recopié se périme, un relevé recompté non.

---

## A. Installer `argus-mobile` sans le skill web

**Ouvert le 22/08/2026. RENVERSÉ puis clos le même jour.**

⚠️ **La décision de ne pas scinder reposait sur une mesure fausse.** Elle disait
« 248 lignes qui divergeraient » — le compte des fichiers entiers, alors que
`methodology-mobile.md` a ses propres §1 à §9 sur 506 lignes et n'empruntait que
le §3. L'emprunt réel valait **76 lignes**, dont :

- le **§3 du web, 25 lignes**, alors que le mobile a le sien — **31 lignes**,
  plus complet que celui qu'il citait ;
- le **contrat de sortie, 51 lignes**, portant **neuf mentions de vocabulaire
  web** (`baseUrl`, `browsers`, `viewport`, `selector`, le reporter Playwright),
  au point que le mobile publiait une **table de traduction** : `url` → `screen`
  + `step`, `browser` → `platform` + `osVersion`.

La dépendance coûtait donc au lecteur **un document de plus, écrit pour un autre
médium, plus une table pour le transposer** — davantage que la duplication
qu'elle évitait. Le socle vit désormais dans `report-format-mobile.md`, en
mobile, et la table a disparu faute d'avoir quelque chose à traduire.

**`skills/argus-mobile/` se copie seul.** Prouvé en le copiant dans un dossier
temporaire : zéro chemin sortant — et l'instrument a été éprouvé contre un chemin
injecté, un grep cassé rendant zéro exactement comme un résultat propre. Un garde
total et négatif le tient : aucun chemin sortant, où que ce soit.

### Décidé le 22/08/2026 : TROIS plugins, à mettre en place après le run 4

```
plugins/
  argus-web/     .claude-plugin/plugin.json + skills/argus/
  argus-mobile/  .claude-plugin/plugin.json + skills/argus-mobile/
  argus/         .claude-plugin/plugin.json — RIEN QUE des dependencies
```

```json
{ "name": "argus", "version": "1.1.0",
  "dependencies": ["argus-web", "argus-mobile"] }
```

La doc le prévoit explicitement : « Besides the required `name`, a plugin
manifest can consist of only a `dependencies` array. Installing it pulls in every
dependency, which makes it a way to package a curated plugin set behind one
install. » **Zéro duplication** — c'est ce qui rend cette voie supérieure à la
copie synchronisée qu'on envisageait.

**La contrainte qui commande tout** : `/plugin install argus@alexwilfriedo` doit
continuer à donner exactement ce qu'il donne aujourd'hui, y compris pour une
installation neuve — des devs s'en servent. Elle est tenue : le nom `argus` ne
bouge pas, donc rien à migrer, pas même un `renames`.

⚠️ **L'autonomie d'installation et l'autonomie de contenu sont deux choses**, et
la seconde conditionne la première. Seul `argus` porte des `dependencies` : les
deux autres n'en déclarent aucune, donc installer l'un ne tire jamais l'autre.
Mais sans le travail d'autonomie fait plus haut, `argus-mobile` installé seul
aurait eu des renvois vers `../../argus/references/` que rien n'aurait résolus —
une commande qui **installe** et un skill qui **ne marche pas**, le pire des deux
puisque rien ne lève.

⚠️ **Dépendances en chaîne nue**, pas de contraintes de version : elles
exigeraient des tags `argus-web--v1.1.0` à maintenir, inutile tant que les trois
avancent ensemble.

⚠️ **Le nom du marketplace reste `alexwilfriedo`.** Il a été envisagé de le
renommer, puis écarté : `renames` ne couvre **que les plugins**, il n'existe
aucune migration pour le nom d'un marketplace, et le renommer casserait la
commande pour toute installation neuve — exactement ce que la contrainte
interdit. Un nom de marketplace n'est pas une signature, c'est une clé
d'installation : la seule qualité qu'on lui demande est de ne pas bouger. Ce qui
relève de l'identité se met dans `owner`, qui n'apparaît dans aucune commande.

### Ce qu'il faudra prouver après le déplacement

**49 occurrences dans 8 fichiers** citent `skills/argus-mobile` : les trois
outils, la CI, le README, les deux `PROMPTS`, ce registre. Deux vérifications qui
ne se déduisent pas de « la suite est verte » :

- **`install-mobile.sh` pose toujours le scaffold** depuis sa nouvelle place — le
  banc le dit en cinq secondes ;
- **le garde d'autonomie SUIT le déplacement.** Il cherche `skills/argus-mobile`
  en dur : pointé sur un dossier disparu, il passe au vert sans rien mesurer. À
  vérifier par mutation, pas par la couleur de la suite.

<sub>Ce qui suit est le dossier tel qu'il avait été instruit, avec sa mesure
fausse. Le garder montre comment un chiffre plausible fait trancher à l'envers.</sub>

**Re-mesuré plutôt que relu**, avec la commande de ce document : *4 références,
248 lignes, 200 Ko* — identiques au relevé. Le tronc commun n'a pas grossi, donc
le critère de réouverture n'est pas atteint et **« ne pas scinder » tient**.

⚠️ Ce n'est plus à re-mesurer à la main : le tronc est **figé par égalité** dans
`tools/run-guards.test.mjs`. Une référence ajoutée fait rougir la suite (il a
grossi, rouvrir ce dossier) ; une référence retirée aussi (le mobile devient
autonome, la scission redevient possible). Les deux sont des nouvelles, et le
message du garde renvoie ici.

<sub>Ce qui suit reste le dossier tel qu'il a été instruit.</sub> Tant que le skill bouge à chaque
run en aveugle, déplacer ce qu'il référence ajouterait une variable à une mesure
en cours.

### La question

`/plugin install argus@alexwilfriedo` installe le dépôt entier, donc les deux
skills. Un utilisateur qui ne fait que du Flutter ne peut pas prendre le mobile
seul.

### Ce qui a été mesuré

Ce n'est pas qu'une question d'emballage : **`argus-mobile` n'est pas autonome.**
Quatre références pointent vers le skill web, dont trois fonctionnelles.

| Fichier | Ce qu'il va chercher |
|---|---|
| `references/methodology-mobile.md:9` | la méthodologie de base |
| `references/methodology-mobile.md:106` | les garde-fous transverses (`methodology.md` §3) |
| `references/report-format-mobile.md:3` | le contrat de sortie de base |
| `SKILL.md:730` | la mention de ce renvoi |

Copier `skills/argus-mobile/` seul casse ces chemins — et **silencieusement** :
l'agent lit « le format de base est `../../argus/references/report-format.md` »,
ne le trouve pas, et invente un format de rapport.

Le surcoût d'installer les deux est **du disque, pas du contexte** : 200 Ko dont
160 de scaffold Playwright jamais lu, et ~115 mots de description permanente. Le
corps du skill web (1 222 mots) n'entre en contexte qu'à l'invocation, donc
`/argus` reste inerte pour qui ne parle que de mobile.

```sh
# re-mesurer avant de rouvrir — ces chiffres datent du 22/08/2026
grep -rn 'argus/references\|\.\./\.\./argus' plugins/argus-mobile/skills/argus-mobile/   # les références
wc -l plugins/argus-web/skills/argus/references/report-format.md plugins/argus-web/skills/argus/references/methodology.md
du -sh plugins/argus-web plugins/argus-mobile/skills/argus-mobile
```

### Les deux voies, et pourquoi la seconde dépend de la première

**a. Rendre `argus-mobile` autonome** — rapatrier les ~248 lignes empruntées.
Coût : deux copies du contrat de sortie et de la méthodologie transverse, qui
divergeront. C'est précisément ce que la structure actuelle évite, et le
`SKILL.md` le dit en toutes lettres : « il référence au lieu de le recopier ».

**b. Déclarer deux plugins** dans `.claude-plugin/marketplace.json` — le tableau
`plugins[]` accepte plusieurs entrées avec des `source` distincts. Mais sans (a),
`argus-mobile` livré seul serait cassé.

### Décidé pour l'instant : ne pas scinder

La dépendance est intentionnelle et documentée, le surcoût est négligeable, et le
risque de la scission — deux contrats de sortie qui divergent en silence — pèse
plus lourd que le problème qu'elle résout.

⚠️ Ce qui rouvrirait vraiment le dossier n'est pas le confort d'installation mais
un **tronc commun qui grossit** : si le mobile se met à emprunter au web bien
au-delà de ces 248 lignes, la bonne réponse n'est plus (a) ni (b) mais un
troisième emplacement pour ce que les deux partagent. Le compter avant de
trancher, avec la commande ci-dessus.


---

## B. Repartir d'un device sans trace du run précédent

**Ouvert le 22/08/2026. Condition de reprise : après le run 3 en aveugle** — le
skill est en cours de mesure, le modifier maintenant rendrait ses constats
ambigus.

### La question

Avant d'installer le binaire, le harness s'assure-t-il que l'app n'est pas déjà
là, et la purge-t-il avec ses données ?

### Ce qui est déjà couvert — à ne pas re-chercher

- **La purge ne se fait pas avant les tests, elle se fait avant CHAQUE flow.**
  `_subflows/launch-clean.yaml` est le point d'entrée de tous les flows et porte
  `clearState: true` — `pm clear` sur Android, une **réinstallation** côté iOS.
- **L'installation est prouvée** : `run.mjs` exige `Success` dans la sortie *et*
  la présence du paquet dans `pm list packages`, précisément parce qu'`adb
  install` peut échouer en rendant un statut favorable.

### Ce qui ne l'est pas

Aucune désinstallation préalable : zéro `adb uninstall` dans le skill, aucune
option de configuration. Le runner fait `adb install -r`, qui écrase le code et
**conserve les données**.

⚠️ **Mais ça ne produit pas un test entaché**, et c'est ce qui rend le chantier
non urgent. Si la signature diffère (app du store, autre keystore) ou si le
`versionCode` recule, `install -r` échoue — et le double contrôle interdit de
poursuivre sur la version précédente. Le mode de panne est bruyant, pas silencieux.

### Les deux trous réels, par ordre de certitude

**1. Le message d'échec ne remédie pas.** Il rend `adb install n'a pas dit
« Success » : INSTALL_FAILED_UPDATE_INCOMPATIBLE`, et le lecteur doit deviner
que la réponse est « désinstalle d'abord ». C'est le défaut que le point 7 du
backlog terrain a déjà corrigé ailleurs : un message qui n'a que le symptôme
envoie chercher là où il n'y a rien. Reconnaître `INSTALL_FAILED_UPDATE_INCOMPATIBLE`,
`signatures do not match` et `VERSION_DOWNGRADE` dans la sortie, et nommer le
geste dans la preuve d'échec. Coût faible, gain certain.

**1. ✅ Clos le 22/08/2026.** `installHint` traduit les trois échecs courants en
geste, donne la commande de désinstallation **avec ce qu'elle détruit**, et
n'invente rien sur un code non reconnu. Le cas « plus de place » ne suggère
délibérément aucune désinstallation : elle ne libérerait pas l'espace qui manque.
Trois gardes le figent, dont celui qui exige que toute suggestion de
désinstallation nomme son prix.

**2. `clearState` ne purge pas tout — TOUJOURS OUVERT, et volontairement.** Le skill connaît déjà un cas : la confirmation système du premier
deep link iOS est permanente pour le simulateur, et le flow la gère (« le pire
profil de flake »). L'hypothèse à éprouver est qu'il en existe un second :
`pm clear` ne détruirait pas les clés de l'**Android KeyStore** liées à l'app,
qui ne partiraient qu'à la désinstallation — une app éprouvant du chiffrement,
de la biométrie ou un jeton scellé hériterait alors d'une clé du run précédent.

⚠️ **C'est une hypothèse, pas une mesure**, et elle le reste sciemment. La
mesurer demande une app qui POSE une clé dans le KeyStore : le projet d'accueil
du banc est une app Flutter nue, et lui ajouter du chiffrement pour éprouver ce
point coûterait plus que le point ne vaut. Prescrire sans mesurer serait pire.

**Le protocole, pour quand ce sera gratuit** — un projet de terrain qui utilise
déjà du stockage sécurisé, de la biométrie ou un jeton scellé :

1. lancer l'app, lui faire écrire sa valeur protégée, la relire (elle doit sortir) ;
2. `adb shell pm clear <package>` ;
3. relancer, relire : **la valeur revient-elle, ou la lecture échoue-t-elle ?**
   Si elle échoue par « clé absente », `pm clear` a bien tout emporté et ce
   chantier se ferme. Si elle échoue par « donnée déchiffrable introuvable »
   alors que la clé est là, la clé a survécu et le chantier existe ;
4. `adb uninstall` puis réinstaller, et refaire (3) : c'est la contre-épreuve —
   la désinstallation, elle, doit tout emporter dans les deux cas.

⚠️ Sans l'étape 4, on ne saurait pas distinguer « la clé survit » de « le montage
ne pose pas de clé du tout ». Le premier montage de ce genre, à la passe
précédente, rendait un exit 0 parce que tout se skippait.

**Condition de reprise** : le premier terrain qui embarque du chiffrement — donc
probablement le même que celui du § C, puisqu'une app qui parle à une API est
aussi celle qui garde des jetons.

### Le garde-fou qui contraint le remède

Une option `freshInstall` ne peut **jamais** être active par défaut :
désinstaller sur un téléphone réel détruit les données de son propriétaire —
exactement ce que les garde-fous §5 interdisent. Elle devrait être gouvernée par
`ENV`, comme `clearState` l'est déjà.

```sh
# re-mesurer avant de rouvrir — relevé du 22/08/2026
grep -rn 'adb .*install\|uninstall\|pm clear' plugins/argus-mobile/skills/argus-mobile/
grep -rn 'clearState' plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile/.maestro/
```

---

## C. Un projet qui consomme une API

**Ouvert le 22/08/2026. Condition de reprise : le prochain terrain, qui devra
consommer une API — voir l'angle mort ci-dessous.**

### Pourquoi trois runs en aveugle n'ont rien trouvé ici

Le terrain des trois premiers runs **n'appelle aucun backend**. Tout ce que le
skill prévoit face à une API n'a donc jamais été exercé, et aucun des 35 points
rendus par les deux premiers runs ne porte sur cette dimension.

⚠️ **Ce n'est pas un défaut du skill, c'est une limite de la méthode** : rejouer
en aveugle sur le même terrain trouve ce que la correction a introduit, jamais ce
que le terrain ne contient pas. Deux agents vierges partagent l'angle mort du
projet qu'on leur donne. **La majorité des applications consomment une API** — le
prochain terrain doit donc en consommer une, et ce critère prime sur « un projet
que je n'ai jamais vu ».

### Les deux étages font l'inverse l'un de l'autre

**Étage 1 — l'API n'existe pas.** Le harnais monte chaque écran par une closure
et le projet y injecte ses doubles (`HomeBloc(repository: FakeHomeRepository())`) :
« le harnais ne devine pas tes dépendances ». C'est là que se paie le coût
d'entrée : un écran qui instancie son repository en dur, passe par un singleton
ou appelle HTTP dans `initState` n'est pas montable. Le garde-fou tient — la
suite se marque SKIPPÉE avec la raison, jamais verte.

**Étage 2 — l'API est bien réelle.** Aucun mock, aucun proxy, aucune
interception : Maestro pilote le binaire, qui tape le backend que son build
pointe. C'est `ENV` qui décide de ce qu'on a le droit d'y faire (§3 de la
méthodologie : écriture interdite en `prod`, données `qa_` en `staging`).

### Ce qui est déjà prévu — à ne pas re-chercher

- `resilience.yaml` coupe le réseau, **avec le piège documenté** :
  `setAirplaneMode` est Android seulement et « passe sans effet » sur iOS, donc
  un test non gardé y passerait au vert sans rien tester.
- `mask-dynamic.yaml` donne trois leviers contre les données qui bougent, et
  l'interdit qui va avec : ne pas relâcher `visualMatchPercentage`, qui masquerait
  les vraies régressions en même temps.

### Les quatre trous, par rentabilité décroissante

**1. Le levier n°1 du déterminisme n'est pas câblé.** `launchApp.arguments` —
passer un mode de test à l'app pour figer horloge, solde, jeu de données — est
**mentionné deux fois dans la doc et implémenté nulle part**. C'est la réponse
pratique pour un projet à API, et c'est le moins cher des quatre.

**2. Rien ne contrôle l'état du backend.** `clearState` purge l'app, pas le
serveur : un parcours qui crée une ressource la retrouve au run suivant. La
méthodologie fige l'horloge, la locale, le snapshot d'émulateur — rien sur le
seeding backend.

**3. Les réponses d'erreur du serveur ne sont pas éprouvables** à l'étage 2.
`setAirplaneMode` couvre « pas de réseau », jamais « le serveur répond mal »
(500, 429, timeout, payload malformé) — or c'est là que les apps cassent. Ces
chemins se testent aujourd'hui à l'étage 1, par un double qui rend un échec.

**4. La latence backend entre dans `coldStartMs`.** Seule la durée de splash
imposée par le produit est soustraite. Sur un backend lent ou distant, le seuil
mesure le réseau et le rapport accuse l'app.

**5. L'état de CHARGEMENT est listé comme dimension et prescrit nulle part.**
`methodology-mobile.md` cite « états vide / chargement / erreur » parmi les
dimensions, et §2c dit de poser **une racine par état** — mais tous ses exemples
sont vide/plein. Or l'étage 2 **ne peut pas** capturer un chargement : `visual.yaml`
fait `extendedWaitUntil visible: <ancre>` avant de photographier, donc il attend
par construction que le chargement soit FINI. Il ne se teste qu'à l'étage 1, par
un double qui ne répond jamais.

⚠️ **Et le coût technique est déjà payé** — c'est ce qui rend ce trou peu cher.
`pumpArgus` ne finit plus sur un `pumpAndSettle` nu : il plafonne à cinq secondes
simulées, rattrape le `FlutterError` et note l'écran dans
`argusPerpetualAnimations`. Un écran qui porte un indicateur EST donc montable
depuis le commit `629adcf`, qui l'a débloqué explicitement (« those screens could
not be declared at all »). Le mécanisme existe et fonctionne ; **rien ne dit de
s'en servir pour l'état de chargement.** Le remède est documentaire : un exemple
dans le dartdoc de `harness.dart` et une ligne dans §2c à côté de « une racine
par état ».

⚠️ Vérifier d'abord que l'écran de chargement porte une racine **ancrable** :
souvent ce n'est qu'un indicateur nu, et poser une ancre sur un état transitoire
n'est pas gratuit.

**Pourquoi ce trou appartient à ce chantier** : un état de chargement est un
artefact de l'attente réseau. Sur un projet sans API il n'existe presque pas —
d'où le fait qu'aucun des trois runs en aveugle ne l'ait signalé. Même angle mort
que les quatre autres.

### La voie qui marche aujourd'hui, sans rien changer

Un flavor pointant un backend de staging, `ENV: staging`, un compte de test aux
données inventées, et l'étage 1 qui couvre les écrans par des doubles — les
erreurs serveur s'éprouvant alors à l'étage 1, pas à l'étage 2.

```sh
# re-mesurer avant de rouvrir — relevé du 22/08/2026 : 0 et 2
grep -rn -iE '\bmock|\bstub|proxy|intercept' plugins/argus-mobile/skills/argus-mobile/ | wc -l  # 0 = toujours aucun
grep -rn 'arguments' plugins/argus-mobile/skills/argus-mobile/ | wc -l   # 2 = encore cité, pas câblé
# ⚠️ CONTRE-ÉPREUVE, à lire AVANT le zéro ci-dessus : un grep qui a échoué rend
# « 0 » exactement comme une absence réelle. Ce motif-ci est certainement
# présent ; s'il rend 0 lui aussi, c'est la commande qui est morte, pas le skill
# qui a changé.
grep -rn 'clearState' plugins/argus-mobile/skills/argus-mobile/ | wc -l  # doit être > 0
```
