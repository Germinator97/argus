# Un prompt de départ pour Argus Mobile

Si tu discutes avec ton agent, tu n'as besoin de rien : le skill pose lui-même
les questions de cadrage (§1) à partir d'un simple « audite mon app Flutter ».

Ce fichier sert au **cas inverse** — quand tu écris une consigne d'avance pour un
agent qui va travailler seul : tâche de fond, agent délégué, session non
interactive, CI. Le dialogue de cadrage n'aura alors pas lieu, et le skill le dit
lui-même : **c'est là qu'il manque le plus**. Ce que tu ne fixes pas, l'agent le
fixera — en silence, `ENV` compris, qui commande les garde-fous de sécurité.

Copie le bloc ci-dessous, remplace les `<…>`, supprime ce qui ne s'applique pas.

---

## Avant de lancer — où l'agent trouvera le skill

**Si tu as le plugin**, il n'y a rien à faire : ton agent invoque `/argus-mobile`.
Pour l'installer, une fois par machine, dans Claude Code :

```
/plugin marketplace add https://github.com/Alexwilfriedo/argus-cc
/plugin install argus@alexwilfriedo
```

⚠️ `/plugin` est une commande de l'interface : **c'est toi qui la tapes**, un
agent ne peut pas l'exécuter à ta place.

**Si tu n'as pas le plugin** — ou si l'agent tourne ailleurs que dans ta session,
en CI par exemple —, le bloc ci-dessous porte un repli : il lui fait cloner le
dépôt et lire le skill directement. Un skill est un document, pas un programme :
il fonctionne aussi bien lu depuis un clone que chargé par le plugin.

Garde les deux branches dans ton prompt même si tu sais laquelle s'applique. Ça
ne coûte rien, et ça rend le prompt transmissible à quelqu'un dont tu ne connais
pas l'installation.

---

## Le prompt

```text
Mission : instrumenter ce projet Flutter avec le skill `argus-mobile`, de bout
en bout.

LE SKILL — deux cas, prends celui qui s'applique
- Si `/argus-mobile` est disponible dans ta session : invoque-le.
- Sinon, récupère-le et lis-le directement :
      git clone --depth 1 https://github.com/Alexwilfriedo/argus-cc <dossier>/argus-cc
  puis lis `<dossier>/argus-cc/plugins/argus-mobile/skills/argus-mobile/SKILL.md` en entier. Le
  scaffold à poser est dans `assets/scaffold-mobile/`, l'installeur est
  `scripts/install-mobile.sh`.

Dans les deux cas : lis aussi tout ce que le SKILL.md référence (`references/`,
`assets/`, `scripts/`) et applique-le comme il le demande — n'improvise pas une
méthode à toi.

Si tu n'as réussi ni l'un ni l'autre, ARRÊTE-TOI et dis-le-moi. Sans le skill, ce
que tu produirais ressemblerait à du travail de QA sans en être, et je n'aurais
aucun moyen de m'en apercevoir en lisant ton compte rendu.

LE PROJET
<chemin absolu du projet, ou : le dépôt courant>
Branche <ma-branche>, arbre de travail propre.
<une phrase sur ce qu'est l'app, si ce n'est pas évident depuis le repo>

CADRAGE — ce que je tranche, pour que tu ne le tranches pas en silence
  MODE      : REGRESS            # REGRESS installer la garde | EXPLORE auditer | DEMO filmer
  ENV       : local              # local | staging | prod — commande les garde-fous
  PLATFORMS : android            # android | ios | les deux
  DEVICE    : émulateur <NOM_AVD>, celui-là et aucun autre
  APP       : <com.exemple.app>  # ou : déduis-le du repo, et DEMANDE-le-moi
                                 #      s'il ne se déduit pas — n'en invente pas
  ARTEFACT  : non               # non | oui — publier la page de rapport, ou pas.
                                 #   Le défaut du skill est « non » et il est SÛR :
                                 #   deux runs s'y sont arrêtés en disant que ce
                                 #   n'était pas à eux d'en décider. Ils avaient
                                 #   raison — mais tant que tu ne tranches pas, le
                                 #   livrable n'existe jamais.
  BUDGET    : <N> min sur device # ce qui n'y tient pas est ÉCHANTILLONNÉ et DIT,
                                 #   jamais coupé en silence. Si tu dois couper,
                                 #   garde les parcours critiques et laisse le
                                 #   long-tail à l'étage 1, qui le mesure sans
                                 #   device — puis écris ce que tu as laissé.
  Tout le reste : les défauts du skill me vont.

AUTORISATIONS ET LIMITES
- Tu es explicitement autorisé à écrire dans ce projet : modifier le code de
  `lib/` pour y poser les ancres sémantiques dont Maestro a besoin, poser le
  scaffold, créer et éditer des fichiers. C'est le but de la mission — ne
  t'arrête pas pour demander la permission d'écrire.
- Tu ne commites rien et tu ne crées aucune branche. Tout reste dans l'arbre de
  travail pour que je relise.
- Un seul émulateur à la fois, celui nommé ci-dessus. N'en lance jamais deux en
  parallèle.
- Ce projet utilise <FVM | le SDK Flutter système> : emploie la bonne commande.
- <les comptes de test, s'il en faut : identifiants dans $QA_USER et $QA_PASS —
  ne les écris nulle part>

Avant de lancer quoi que ce soit sur un device, prouve l'instrumentation sans
device (`make argus-anchors`) et donne-moi le relevé.

Va aussi loin que le skill le prévoit. Si une étape est impossible — outil
absent, device indisponible, build qui casse —, note-le avec le message exact et
poursuis les autres plutôt que de t'arrêter.

COMPTE RENDU ATTENDU
1. Ce que tu as fait, étape par étape, et ce que tu as MESURÉ : les chiffres
   bruts rendus par les commandes que tu as passées, avec la commande. Jamais
   d'estimation ni d'arrondi.
2. Ce qui a échoué, avec le message d'erreur exact, et ce que tu en conclus.
3. Ce que tu as dû trancher toi-même faute d'instruction : la décision,
   l'alternative écartée, et ce qui aurait levé l'ambiguïté.
4. La dette que les gardes révèlent et que tu as inscrite dans
   `known_issues.dart`, plus ce que `coverage.notConfigured` liste.
```

---

## Les autres intentions

Ce bloc installe la garde de non-régression (`MODE: REGRESS`). Pour auditer sans
rien laisser (`EXPLORE`), filmer une démo (`DEMO`) ou remettre à niveau un
harness déjà posé, les gabarits courts sont dans
[`PROMPTS-by-mode.md`](PROMPTS-by-mode.md) — ils supposent que tu es là pour
répondre. Les règles ci-dessous valent pour tous.

---

## Pourquoi le budget est dans le cadrage

La méthodologie l'exige en toutes lettres — « **Budget explicite.** Si le temps
plafonne avant couverture complète, loggue ce qui a été échantillonné ET ce qui a
été ignoré. Jamais de troncature silencieuse » — et c'est la seule des contraintes
de §4 que l'agent ne peut pas déduire du dépôt.

Sans cette ligne, il coupe quand même : il le doit. Mesuré sur un projet réel,
**quinze états montables réduits à sept** déclarés en étage 2, arbitrage rendu
sans budget et signalé comme tel dans le compte rendu — *« ce qui aurait levé
l'ambiguïté : un budget de minutes-device et "si tu dois couper, garde X" »*. Le
critère de choix, lui, était dans le SKILL et a été appliqué correctement : ce
n'est pas le comment qui manquait, c'est le combien.

## Les cinq lignes qu'on ne supprime pas

Chacune ferme un trou qui ne se voit pas tant qu'il est ouvert.

**1. `ENV`** — il commande les garde-fous, pas le niveau de détail. `local`
autorise les écritures et l'effacement des données de l'app. Si ton app pointe
ailleurs que vers des données jetables, `ENV=local` est une décision, pas un
défaut.

**2. Le device, nommé** — sans nom d'AVD, le runner choisit, et le rapport décrit
un appareil que tu n'as pas visé. Donne le **nom d'AVD** (`emulator -list-avds`),
jamais un `emulator-5554` : celui-là est un numéro de port, attribué dans l'ordre
de démarrage, donc il désigne un autre appareil au prochain run — et tout se
déroule normalement, sur l'app d'à côté. Un téléphone réel exige un
`physical: true` explicite, et jamais un appareil portant de vraies données.

**3. L'autorisation d'écrire dans `lib/`** — Maestro ne voit que ce que l'app
expose à la couche d'accessibilité, donc le skill pose des ancres dans ton code ;
en REGRESS elles restent. Sans autorisation écrite, un agent délégué s'arrête et
attend — ou les pose sans dire qu'il l'a fait.

**4. L'identifiant d'application** — s'il ne se déduit pas du repo, il faut le
demander. Un bundleId inventé produit un run qui ne cible rien, avec des logs
parfaitement normaux.

**5. Les secrets par l'environnement** — un mot de passe écrit dans le prompt vit
ensuite dans le transcript, dans l'historique du shell et dans les journaux du run.

---

## Ce qui rend un prompt inutilisable

- **« Teste mon app »** à un agent non interactif : il choisira `ENV`, le device,
  les seuils et les parcours, et tu ne sauras pas lesquels.
- **Demander l'instrumentation sur un `lib/` déjà modifié** : plus personne ne
  démêle tes lignes des siennes, et le retrait emporte ton travail.
- **Écrire un seuil en prose** — « tolère 1 % de différence visuelle » se traduit
  par `visualMatchPercentage: 99`, jamais `0.01` : Maestro attend un pourcentage
  de **correspondance**, pas un ratio de différence.
- **Fixer un budget de temps sans dire quoi sacrifier** : l'agent coupera où ça
  l'arrange. « Si tu dois couper, garde <X> » vaut mieux qu'un chiffre nu.
- **Demander un compte rendu sans exiger les commandes** : les chiffres d'un
  rapport d'agent ne sont pas des mesures. Repasse la commande.
