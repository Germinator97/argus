# Gabarits courts, un par intention

Quatre blocs à copier tels quels, pour les demandes courantes. Ils supposent que
tu es là pour répondre si l'agent demande quelque chose.

Pour **déléguer** à un agent qui travaillera seul — tâche de fond, session non
interactive, CI —, prends plutôt le prompt de mission complet de
[`PROMPTS.md`](PROMPTS.md) : il ferme les décisions que personne ne sera là pour
trancher.

**Les règles de cadrage valent pour les quatre gabarits** — `ENV`, le device
nommé, l'autorisation d'écrire dans `lib/`, l'identifiant d'app, les secrets par
l'environnement. Elles sont expliquées une fois pour toutes dans `PROMPTS.md`,
section « Les cinq lignes qu'on ne supprime pas ». Ne les supprime pas d'ici.

**Le plugin s'installe une fois par machine**, dans Claude Code — `/plugin` est
une commande de l'interface, un agent ne peut pas l'exécuter à ta place :

```
/plugin marketplace add https://github.com/Alexwilfriedo/argus-cc
/plugin install argus@alexwilfriedo
```

Chaque bloc ci-dessous porte quand même le repli par clone, pour rester copiable
tel quel vers quelqu'un dont tu ne connais pas l'installation.

**Convention** : `<à remplacer>` · `[valeur par défaut si tu ne dis rien]`.

---

## 1 — Installer la garde de non-régression (REGRESS)

Le cas le plus courant : brancher une garde permanente sur un projet.

```text
/argus-mobile
# absent de ta session ? clone https://github.com/Alexwilfriedo/argus-cc
# et lis skills/argus-mobile/SKILL.md — sans le skill, arrête-toi plutôt
# que d'improviser une méthode à toi.

Installe le harness de non-régression sur ce projet Flutter.

MODE      : REGRESS
ENV       : local
PLATFORMS : android
DEVICE    : émulateur <NOM_AVD>, celui-là et aucun autre
APP       : <com.exemple.app>   # ou : déduis-le du repo, et demande-le-moi
                                #      s'il ne se déduit pas

Tu es autorisé à modifier `lib/` pour y poser les ancres sémantiques : elles
sont permanentes, c'est le but. Tu ne commites rien.

Prouve l'instrumentation sans device (`make argus-anchors`) avant tout le reste,
et donne-moi le relevé.
```

---

## 2 — Auditer sans rien laisser (EXPLORE)

Pour mesurer l'existant sur une app déjà installée.

```text
/argus-mobile
# absent de ta session ? clone https://github.com/Alexwilfriedo/argus-cc
# et lis skills/argus-mobile/SKILL.md — sans le skill, arrête-toi plutôt
# que d'improviser une méthode à toi.

Audite cette application Flutter et rends-moi un rapport.

MODE     : EXPLORE
ENV      : staging              # jamais `prod` sans y avoir réfléchi
DEVICE   : émulateur <NOM_AVD>
AUTH     : identifiants dans $QA_USER et $QA_PASS — ne les écris nulle part
BUDGET   : [25] minutes ; si tu dois couper, garde <ce qui compte>
PRIORITÉ : <inscription, paiement, accessibilité, démarrage à froid…>

Si l'app manque d'ancres sémantiques, pose-en pour la durée de l'audit puis
retire-les, et rends-moi le patch avec le finding qui explique pourquoi les
appliquer. Exige que `lib/` soit propre avant de commencer, et PROUVE le retrait
plutôt que de l'annoncer.

Ne laisse rien : rends le projet dans l'état où tu l'as trouvé.
```

---

## 3 — Filmer une démo (DEMO)

Même audit, avec la mise en scène. À réserver à ce qui sera montré.

```text
/argus-mobile
# absent de ta session ? clone https://github.com/Alexwilfriedo/argus-cc
# et lis skills/argus-mobile/SKILL.md — sans le skill, arrête-toi plutôt
# que d'improviser une méthode à toi.

Produis une démo vidéo commentée de cette application.

MODE     : DEMO
ENV      : staging
DEVICE   : émulateur <NOM_AVD>
PUBLIC   : <client | équipe | revue de sprint>
DURÉE    : <cible en minutes>
SCÉNARIO : <les parcours à montrer, dans l'ordre>

Les données affichées seront vues par d'autres : comptes de test uniquement, et
masque tout ce qui ressemble à une donnée réelle.
```

---

## 4 — Mettre à niveau un harness déjà posé

```text
/argus-mobile
# absent de ta session ? clone https://github.com/Alexwilfriedo/argus-cc
# et lis skills/argus-mobile/SKILL.md — sans le skill, arrête-toi plutôt
# que d'improviser une méthode à toi.

Ce projet porte déjà un harness Argus. Vérifie s'il est en retard sur le plugin,
mets le cadre à niveau sans toucher à ce que j'ai édité, puis dis-moi ce qui a
changé et ce qu'il me reste à remplir.

ENV    : local
DEVICE : émulateur <NOM_AVD>
```

---

## Après le run

Le rapport arrive dans `argus-mobile-report/`. Deux choses valent d'être lues
avant le reste :

- **`coverage.notConfigured`** — les écrans qu'aucune ancre ne déclare. Ils ne
  cassent rien : ils sont simplement absents du rapport, et personne ne sait que
  la ligne devait y être.
- **`known_issues.dart`** — la dette assumée. Elle est assertée par **égalité** :
  le jour où un défaut inscrit est corrigé, le test rougit. C'est voulu.

Et ne lis pas les chiffres d'un compte rendu d'agent comme des mesures : repasse
la commande.
