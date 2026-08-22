# Chantiers différés

Ce fichier n'est pas le [backlog terrain](backlog-terrain.md) : les entrées de
celui-là viennent d'un projet réel sur lequel le skill a été exercé. Ici vivent
les chantiers de **structure du plugin**, ceux qu'on a mesurés, tranchés pour
l'instant, et qu'on rouvrira à une condition écrite.

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
