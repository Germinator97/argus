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

**Ouvert le 22/08/2026. Condition de reprise : après la stabilisation
d'`argus-mobile` sur un projet de terrain.** Tant que le skill bouge à chaque
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
grep -rn 'argus/references\|\.\./\.\./argus' skills/argus-mobile/   # les références
wc -l skills/argus/references/report-format.md skills/argus/references/methodology.md
du -sh skills/argus skills/argus-mobile
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

**2. `clearState` ne purge pas tout — À VÉRIFIER SUR DEVICE avant de coder quoi
que ce soit.** Le skill connaît déjà un cas : la confirmation système du premier
deep link iOS est permanente pour le simulateur, et le flow la gère (« le pire
profil de flake »). L'hypothèse à éprouver est qu'il en existe un second :
`pm clear` ne détruirait pas les clés de l'**Android KeyStore** liées à l'app,
qui ne partiraient qu'à la désinstallation — une app éprouvant du chiffrement,
de la biométrie ou un jeton scellé hériterait alors d'une clé du run précédent.

⚠️ **Ce dernier point est une hypothèse, pas une mesure.** Il vient d'une lecture,
pas d'un run sur appareil. Le reproduire avant de prescrire : poser une clé,
`pm clear`, relire. Si elle survit, le chantier existe ; sinon il se ferme, et
c'est un bon résultat.

### Le garde-fou qui contraint le remède

Une option `freshInstall` ne peut **jamais** être active par défaut :
désinstaller sur un téléphone réel détruit les données de son propriétaire —
exactement ce que les garde-fous §5 interdisent. Elle devrait être gouvernée par
`ENV`, comme `clearState` l'est déjà.

```sh
# re-mesurer avant de rouvrir — relevé du 22/08/2026
grep -rn 'adb .*install\|uninstall\|pm clear' skills/argus-mobile/
grep -rn 'clearState' skills/argus-mobile/assets/scaffold-mobile/.maestro/
```
