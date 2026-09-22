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
/plugin marketplace add https://github.com/Germinator97/argus
/plugin install argus@alexwilfriedo
```

⚠️ `/plugin` est une commande de l'interface, mais elle a un équivalent en ligne
de commande — `claude plugin marketplace add …` puis `claude plugin install …` —,
donc un agent qui a un shell **sait** l'exécuter. Ne le lui laisse pas faire sans
l'avoir décidé : un plugin s'installe par défaut pour **toutes** tes sessions,
pas pour celle-ci.

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
      git clone --depth 1 https://github.com/Germinator97/argus <dossier>/argus-cc
  puis lis `<dossier>/argus-cc/plugins/argus-mobile/skills/argus-mobile/SKILL.md` en entier. Le
  scaffold à poser est dans `assets/scaffold-mobile/`, l'installeur est
  `scripts/install-mobile.sh`.

⚠️ **Le clone rend le plugin PUBLIÉ, et ce n'est pas forcément celui que tu
testes.** Si tu es en train de faire évoluer le skill sur ta machine et que tes
commits ne sont pas poussés, la branche « sinon » ci-dessus fera lire à l'agent
une version d'avant — et **rien ne le signalera** : le run se déroulera
normalement, l'agent rendra un compte rendu propre, et tu croiras avoir éprouvé
ce que tu venais d'écrire. Mesuré sur ce dépôt le 4 septembre 2026 : 404
commits d'écart. Quand tu mets un skill à l'épreuve, envoie l'agent lire **ton
dépôt de travail**, en lecture seule, et garde le clone pour les cas où la
version publiée est bien celle que tu veux.

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
  ENV       : local              # local | staging | prod — commande les garde-fous.
                                 #   Se dérive de VERS QUOI l'app pointe, pas de là où
                                 #   tu es : une API distante partagée n'est pas `local`,
                                 #   même lancée depuis ton poste.
  PLATFORMS : android            # android | ios | les deux
  DEVICE    : émulateur <NOM_AVD>, celui-là et aucun autre
  FLAVOR    : <dev>              # si le projet en a. À NE PAS omettre : c'est lui
                                 #   qui décide de l'identifiant d'application
                                 #   (`applicationIdSuffix`), donc « déduis-le du
                                 #   repo » n'a plus de réponse unique sans lui.
  APP       : <com.exemple.app>  # ou : déduis-le du repo, et DEMANDE-le-moi
                                 #      s'il ne se déduit pas — n'en invente pas
  ARTEFACT  : non               # non | oui — publier la page de rapport, ou pas.
                                 #   Le défaut du skill est « non » et il est SÛR :
                                 #   deux runs s'y sont arrêtés en disant que ce
                                 #   n'était pas à eux d'en décider. Ils avaient
                                 #   raison — mais tant que tu ne tranches pas, le
                                 #   livrable n'existe jamais.
  EVIDENCE  : oui                # oui | non — les captures d'écran partent-elles
                                 #   avec la page publiée ?
                                 # ⚠️ NE LAISSE PAS L'AGENT TRANCHER : il ne peut
                                 #   pas savoir D'OÙ viennent les données qu'il
                                 #   voit. Un run a mis `evidence: none` en
                                 #   apercevant des noms et des numéros à
                                 #   l'écran — la base était LOCALE et jetable.
                                 #   La page publiée n'avait donc AUCUNE capture,
                                 #   et c'est précisément ce qu'on voulait
                                 #   regarder ; personne ne s'en est aperçu avant
                                 #   d'ouvrir la page.
                                 # Le critère n'est pas « ça a l'air sensible »
                                 #   mais « d'où vient ce que l'appareil
                                 #   affiche » : base de développement locale et
                                 #   jetable → oui ; recette partagée portant des
                                 #   données réelles → non. L'agent voit l'écran,
                                 #   toi seul sais ce qu'il y a derrière.
  BUDGET    : <N> min sur device # ce qui n'y tient pas est ÉCHANTILLONNÉ et DIT,
                                 #   jamais coupé en silence. Si tu dois couper,
                                 #   garde les parcours critiques et laisse le
                                 #   long-tail à l'étage 1, qui le mesure sans
                                 #   device — puis écris ce que tu as laissé.
                                 # ⚠️ LA PREMIÈRE PASSE A UN PLANCHER, et il ne
                                 #   se coupe pas : générer les références puis
                                 #   prouver la comparaison demande TROIS passes
                                 #   device complètes — « environ vingt minutes
                                 #   sur émulateur », dit le SKILL —, plus un
                                 #   `argus-perf` dont le coût suit le démarrage
                                 #   de TON app (8,8 s sur une app qui démarre en
                                 #   1,3 s, plusieurs minutes au-delà de dix).
                                 #   Un budget en dessous ne raccourcit pas la
                                 #   séquence : il force un arbitrage entre le
                                 #   chiffre que tu as écrit et une contre-épreuve
                                 #   obligatoire. Relevé sur un projet réel :
                                 #   43 min pour la première passe entière, dont
                                 #   21 pour les seules références et leur
                                 #   contre-épreuve. Les passages suivants sont
                                 #   un seul `argus-run`.
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
- <si le projet tire ses composants d'un paquet VOISIN — dépendance par chemin,
  dépôt distinct, design system partagé : dis si l'agent a le droit d'y écrire.
  Le skill lui dit quoi faire sans cette permission — poser l'ancre au call-site
  et inscrire la dette — mais il ne peut pas deviner si le paquet est à toi. Deux
  projets réels y ont laissé six et cinq ancres inertes faute de cette ligne.>
- <la TÉLÉMÉTRIE, si l'app en émet — Sentry, Crashlytics, analytics. Une passe
  QA produit des dizaines de sessions et parfois des erreurs PROVOQUÉES (c'est
  le travail de `resilience.yaml`) : sans instruction, elles partent dans le
  projet de monitoring RÉEL et se mélangent aux vrais utilisateurs. Dis ce que
  l'agent doit en faire — la neutraliser (une clé vide au build, un projet
  jetable, un flavor de test) ou la laisser, et laquelle des deux tu assumes.
  Un run a tranché seul, dans le bon sens, sans que rien le lui demande ;
  c'est la fois où personne n'y pensera qui coûte.>

- <les comptes de test, s'il en faut : identifiants dans $QA_USER et $QA_PASS —
  ne les écris nulle part. DIS D'OÙ ILS VIENNENT : un fichier hors dépôt à
  sourcer, un gestionnaire de secrets. Citer deux noms de variables ne suffit
  pas — l'agent ne peut pas les inventer.
  ⚠️ **Et dis COMMENT le sourcer, parce que « sourcer » ne suffit pas** (476) :
  un fichier de lignes `CLE=valeur` nues donne des variables de SHELL, que le
  processus fils ne voit jamais. Le runner le rattrape — il nomme les secrets
  vides et donne le remède — mais seulement une fois la passe device lancée, et
  celle-là est déjà payée : **98 s** sur un projet réel. Écris la forme qui
  marche, pas le verbe :
      set -a && source <ton fichier> && set +a
  Sauf si ton fichier porte déjà des `export` — auquel cas dis-le, pour que
  personne n'aille chercher pourquoi il en manquerait.>

SI L'APPLICATION CONSOMME UNE API — cinq lignes, et aucune ne se déduit du dépôt
- Vers quelle API elle doit pointer, et l'adresse EXACTE que le binaire doit
  porter. ⚠️ `localhost` ne désigne pas la même machine depuis un émulateur :
  Android le voit en `10.0.2.2`, et un appareil physique en Wi-Fi voudra l'IP LAN
  du poste. C'est la valeur vue DU DEVICE qu'il faut donner.
  ⚠️ **LA DOC DE BUILD DU PROJET EN LISTE SOUVENT PLUSIEURS, ET ELLES NE SE
  VALENT PAS.** Une recette partagée et une API lancée sur le poste sont deux
  cibles différentes : la première est lente, elle varie d'un run à l'autre, et
  ses données sont réelles ; la seconde est jetable. Vécu : le bloc « Démarrer »
  d'un README ne montrait que l'adresse distante, l'adresse locale vivait dans
  le fichier que ce README RÉFÉRENCE, et le cadrage a repris la première sans
  ouvrir le second. Cinq flows sur sept sont morts au plafond d'attente sur un
  « service indisponible » qui n'appartenait ni au skill ni à l'application.
  Ouvre le fichier de build que la doc d'accueil désigne, et dis LAQUELLE tu
  veux — le choix commande aussi `ENV` et `EVIDENCE`.
- Les injections de build obligatoires, mot pour mot. Beaucoup d'applications
  refusent de démarrer sans elles — et l'agent obtient alors un binaire qui ne
  s'ouvre pas, ce qu'il attribuera à son instrumentation.
- Ce qu'il n'a PAS le droit de faire au backend : « tu consommes l'API, tu ne
  l'administres pas — ni sa base, ni ses conteneurs ». L'étage 2 tape le vrai
  serveur ; sans cette limite, l'administrer est dans le périmètre.
- Ce que l'authentification COÛTE, si tu le sais : un quota, une limite de débit,
  un code à usage unique réellement envoyé. `clearState` impose une reconnexion
  par flow, et une suite complète peut à elle seule dépasser la limite.
- Ce que le parcours CONSOMME et que le serveur ne rend pas — un compte sans code
  secret encore, un code d'invitation, un stock, une commande unique. Un quota se
  recharge ; ceci, non : le premier run passe et le second échoue, sans que rien
  ne le distingue d'une régression. Dis-le si tu le sais, et dis aussi s'il
  existe un moyen de remettre l'état à zéro — l'agent ne l'inventera pas, il
  n'administre pas ton backend.
- Où lire la documentation DU PROJET. Les flavors et la configuration de build y
  vivent, et le prompt n'envoie lire que le skill.

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
