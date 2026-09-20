# ARGUS:CADRE — au plugin : `install-mobile.sh --update` remplace ce fichier.
# Argus Mobile — raccourcis.
#
# Un projet Flutter n'a ni package.json ni npm : ce Makefile joue le rôle des
# scripts npm du harness web. Si ton projet a par ailleurs un package.json,
# package.snippet.json contient les mêmes cibles au format npm.
#
# Node >= 18 est le seul prérequis des scripts. Maestro, adb, osv-scanner sont
# optionnels : leur absence donne une dimension SAUTÉE et mentionnée, jamais un
# faux vert.

# Un projet qui épingle son SDK par FVM ne se construit PAS avec le `flutter` du
# PATH : la contrainte du pubspec rejette la version globale, et toutes les
# cibles ci-dessous échouent. On dérive donc la commande du projet lui-même
# plutôt que de demander à chacun d'éditer ce fichier.
FLUTTER := $(shell [ -f .fvmrc ] || [ -d .fvm ] && echo "fvm flutter" || echo flutter)

# ⚠️ UN SEUL SITE CONNAÎT LE CHEMIN DU MOTEUR, et c'est celui-ci. Le chemin était
# écrit dix-neuf fois dans ce fichier : autant de copies d'une même décision, que
# rien ne fait rougir quand elle change. Le lanceur, lui, CHERCHE le moteur — dans
# le projet, ou là où une installation globale l'a posé — donc ces recettes ne
# changent plus jamais, quel que soit l'endroit où il vit.
ARGUS := node scripts/argus/argus-mobile.mjs

.PHONY: argus-help argus argus-lint argus-guards argus-debts argus-run argus-smoke argus-visual \
        argus-baselines argus-perf argus-a11y argus-sec argus-sca argus-report \
        argus-anchors argus-reach \
        argus-doctor argus-build

# ⚠️ `make` APLATIT LE CODE DE SORTIE. Le contrat d'Argus distingue 0 (vert),
# 1 (major) et 2 (blocker/critical) — GNU make, lui, sort en **2** dès qu'une
# recette échoue, quelle qu'en soit la cause. Mesuré : `run.mjs --tags=smoke`
# rend 1, `make argus-smoke` rend 2 pour le même run. Qui a besoin du code exact
# appelle le script directement, comme le fait la CI ; ces cibles sont des
# raccourcis pour la main humaine, pas une interface de gating.

argus-help: ## Liste les cibles
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

argus-doctor: ## Config résolue + outillage détecté
	@echo "flutter : $(FLUTTER)"
	@$(ARGUS) config


argus-build: ## Construit le binaire que la config déclare, ciblé sur l'ABI du device
# ⚠️ LA MESURE N'EST PLUS FAITE ICI, et c'est le point 214. `wc -c` rend 0 sur un
# répertoire et `shasum` y échoue — or un `.app` iOS EST un répertoire, si bien
# que cette garde annonçait « 0 → 0 octets » à chaque build iOS. Elle ne se
# taisait pas : elle affirmait, et un chiffre qui n'a rien mesuré se lit comme un
# chiffre qui a mesuré. `--measure-binary` traite les deux formes, un garde
# l'exerce, et le Makefile l'INTERROGE au lieu de recopier sa propre version.
	@CMD="$$($(ARGUS) config --print-build-cmd)"; \
	APK="$$($(ARGUS) config --print-binary)"; \
	M="$$($(ARGUS) config --measure-binary)"; \
	BKIND=$$(printf '%s' "$$M" | cut -f1); BEFORE=$$(printf '%s' "$$M" | cut -f2); \
	BEFOREH=$$(printf '%s' "$$M" | cut -f3); \
	echo "→ $$CMD"; \
	FRESHBEFORE="$$($(ARGUS) sec --print-freshness 2>/dev/null || echo inconnu)"; \
	START=$$(date +%s); eval "$$CMD"; RC=$$?; ELAPSED=$$(( $$(date +%s) - START )); \
	M="$$($(ARGUS) config --measure-binary)"; \
	AKIND=$$(printf '%s' "$$M" | cut -f1); AFTER=$$(printf '%s' "$$M" | cut -f2); \
	AFTERH=$$(printf '%s' "$$M" | cut -f3); \
	echo "  paquet   $$APK"; \
	if [ "$$RC" -ne 0 ]; then \
	  echo "  ✖ LE BUILD A ÉCHOUÉ (exit $$RC) après $${ELAPSED}s — son erreur est au-dessus."; \
	  echo "      Rien à corriger dans la config : c'est le build qu'il faut lire."; \
	  exit $$RC; \
	fi; \
	if [ -z "$$AKIND" ] || [ -z "$$BKIND" ]; then \
	  echo "  ✖ LA MESURE DU PAQUET A ÉCHOUÉ — \`config.mjs --measure-binary\` n'a rien rendu."; \
	  echo "      Sans elle, la garde de fraîcheur comparerait deux empreintes VIDES et les"; \
	  echo "      trouverait égales : elle annoncerait « PAQUET INTACT » sans avoir mesuré."; \
	  echo "      C'est le défaut du point 214, revenu par le chemin d'erreur."; \
	  exit 1; \
	fi; \
	if [ "$$AKIND" = absent ]; then \
	  echo "  ✖ BUILD RÉUSSI, MAIS AUCUN PAQUET ici après $${ELAPSED}s — il a écrit ailleurs."; \
	  echo "      Vérifie que build.android / build.ios désigne ce que la commande produit."; \
	  exit 1; \
	fi; \
	echo "  $$BEFORE → $$AFTER octets en $${ELAPSED}s"; \
	if [ "$$BKIND" = absent ]; then \
	  echo "  ✔ paquet créé — rien à cet emplacement avant le build."; \
	elif [ "$$BEFOREH" = "$$AFTERH" ]; then \
	  if [ "$$FRESHBEFORE" = perime ]; then \
	    echo "  ✖ PAQUET PÉRIMÉ — même empreinte, alors que lib/ a changé DEPUIS."; \
	    echo "      Le build n'a rien recompilé : tu piloterais le binaire d'AVANT tes"; \
	    echo "      ancres, et les flows échoueraient sur des ancres pourtant justes."; \
	    echo "      ⇒ \`$(FLUTTER) clean\` puis relance. Ce n'est pas optionnel."; \
	    exit 1; \
	  else \
	    echo "  ⚠️  PAQUET INTACT — le paquet n'a pas été réécrit (même empreinte),"; \
	    echo "      et lib/ n'avait pas changé AVANT ce build : c'est normal."; \
	    echo "      ⚠️ L'empreinte ne prouve pas le CONTENU. Un build peut réussir sans"; \
	    echo "      recompiler le kernel — Gradle tient sa tâche pour à jour — et rendre"; \
	    echo "      en quelques secondes ce qui en prend des dizaines. Devant un doute,"; \
	    echo "      compte un MARQUEUR de ton changement dans le binaire."; \
	    echo "      Si tu viens de toucher la COMMANDE (ciblage d'ABI, flavor, flags),"; \
	    echo "      rien n'a été re-packagé non plus : \`$(FLUTTER) clean\` puis relance."; \
	  fi; \
	else \
	  echo "  ✔ paquet réécrit (empreinte différente) — deux tailles égales ne veulent pas"; \
	  echo "    dire deux paquets identiques, c'est l'empreinte qui tranche."; \
	fi


argus-lint: ## Syntaxe des flows Maestro, sans device
	@set -e; for f in .maestro/*.yaml .maestro/_subflows/*.yaml; do \
		[ "$$(basename $$f)" = config.yaml ] && continue; \
		maestro check-syntax "$$f"; \
	done
	@echo "✔ tous les flows parsent"
	@# ⚠️ Et le GRAPHE, que `check-syntax` ne résout pas : un sous-flow qui
	@# s'appelle lui-même passe fichier par fichier, puis Maestro rejette le
	@# workspace entier au démarrage — sans étape fautive à nommer.
	@$(ARGUS) config --check-flows

argus-anchors: ## Les ancres sémantiques arrivent-elles dans l'arbre ? (sans device)
# Deux moitiés, et la seconde manquait (point 219) : le test prouve
# DÉCLARÉ → PRÉSENT, ce contrôle-ci prouve POSÉ → DÉCLARÉ. Une ancre posée que
# rien ne déclare est une ABSENCE — elle ne rougit nulle part.
# ⚠️ LES DEUX MOITIÉS TOURNENT, MÊME SI LA PREMIÈRE ÉCHOUE (point 234). Chaînées
# par `make`, le croisement bloquait le test — et sur un projet fraîchement
# instrumenté c'est justement lui qui échoue le plus, tant qu'`allowUndeclared`
# n'est pas rempli. Le test Dart, celui qui trouve les ancres absorbées et
# les ancres sous le pli, ne tournait alors JAMAIS : il a fallu deux passes à un
# run pour découvrir sept ancres sous le pli qu'il aurait nommées du premier coup.
# Un garde qui en empêche un autre de s'exécuter coûte plus qu'il ne rapporte.
# ⚠️ ET LA DERNIÈRE LIGNE DISAIT L'INVERSE DU VERDICT (422-427, point 423). Les
# deux moitiés gardent le pire code de sortie — c'est juste — mais le croisement
# tourne AVANT la suite : un croisement rouge suivi d'une suite verte affiche
# « All tests passed! » en DERNIER et sort en 2. Un run l'a lu comme un vert.
# On ne réordonne pas (la seconde moitié doit tourner même si la première
# échoue) : on RÉSUME après les deux, en nommant celle qui a échoué.
	@croise=0; suite=0; \
	$(ARGUS) config --check-anchors || croise=$$?; \
	$(FLUTTER) test test/argus/anchors_test.dart || suite=$$?; \
	if [ $$croise -ne 0 ] || [ $$suite -ne 0 ]; then \
	  echo ""; \
	  echo "  ✖ argus-anchors ÉCHOUE — ce que la dernière ligne ci-dessus ne dit pas :"; \
	  if [ $$croise -ne 0 ]; then \
	    echo "      · POSÉ → DÉCLARÉ (exit $$croise) : une ancre est posée dans lib/ sans être"; \
	    echo "        déclarée. Elle n'est vérifiée nulle part — c'est une ABSENCE, pas un échec."; \
	  fi; \
	  if [ $$suite -ne 0 ]; then \
	    echo "      · DÉCLARÉ → PRÉSENT (exit $$suite) : une ancre déclarée n'arrive pas dans"; \
	    echo "        l'arbre sémantique — absorbée, inerte, ou sous le pli."; \
	  fi; \
	  exit 1; \
	fi

argus-reach: ## Quels écrans ancrés aucun `goto` ne dessert ? (sans device)
	@$(ARGUS) config --check-reachability

argus-guards: ## Étage 1 — gardes a11y et disposition, sans device
# ⚠️ `--file-reporter` EN PLUS de la sortie lisible, pas à sa place : le rapport
# ne voyait RIEN de cet étage. Il agrège cinq JSON de dimension et aucun résultat
# de `flutter test`, si bien qu'un projet dont 117 gardes rouges décrivent des
# défauts réels publiait `gate: pass` sur deux findings info (391). Le producteur
# est `flutter test` lui-même — inutile de livrer un script pour ça.
# ⚠️ Et le dossier est DEMANDÉ à la config, jamais recopié : il est configurable,
# donc l'écrire en dur ferait écrire la recette là où le rapport ne lit pas, et
# la dimension se rapporterait « jamais lancée » au sortir d'un run vert.
	@$(FLUTTER) test --file-reporter json:"$$($(ARGUS) config --print-artifacts-dir)/stage1.jsonl" test/argus

# ⚠️ QUATRE LANCEMENTS POUR UNE PREMIÈRE INSTALLATION, et deux étaient du
# recopiage. Un run l'a mesuré : obtenir les échecs, les lister, capturer la
# sortie, vérifier le vert. Les messages donnent déjà la ligne EXACTE à inscrire
# — c'est ce qui a permis d'en poser 48 sans en réécrire une seule de mémoire —
# mais rien ne les agrégeait.
#
# Le motif est celui qu'`argus_harness.dart` ÉMET (`      'clé',`), pas une
# supposition sur le format de `flutter test` : le garde du dépôt croise les
# deux, pour qu'ils ne puissent pas diverger.
argus-debts: ## Le bloc known_issues prêt à coller, dérivé des échecs de l'étage 1
# 🔴 538 — LE FILTRE EXIGE LE CONTEXTE, PAS SEULEMENT LA FORME. Il cherchait
# toute ligne quotée suivie d'une virgule. Or le matcher Dart formate sa liste
# `Actual:` exactement ainsi, une chaîne par ligne : un échec de troncature y
# déverse donc le CONTENU de l'application, et `--write` l'inscrivait comme
# dette. Mesuré sur un run réel : 4 clés dérivées, dont 2 qui étaient des
# libellés d'écran (« Agence CGRAE Plateau »).
# Le harnais précède chaque clé de l'invitation à l'inscrire, qui nomme le
# fichier de dette — c'est ce voisinage qu'on exige, et non un motif plus dur :
# la forme ne distingue pas une clé d'un libellé, la POSITION si.
# ⚠️ Ce que ça coûtait n'était pas l'erreur mais sa suite : le garde des clés
# orphelines les attrapait sans nommer `argus-debts-forget`, donc on ouvrait
# known_issues.dart à la main — le geste que ce Makefile interdit vingt lignes
# plus bas, et qui a détruit trois fichiers.
# ⚠️ LE REPLI ÉTAIT UNE BRANCHE MORTE. Le `|| echo` portait sur le DERNIER
# élément du pipeline — un `sed`, qui rend 0 même sur une entrée vide — donc le
# message ne s'affichait jamais. Une suite verte et une suite qui n'a pas tourné
# rendaient le même silence total, c'est-à-dire exactement les deux cas que cette
# phrase existe pour séparer. On capture, puis on décide.
	@dettes="$$($(FLUTTER) test test/argus 2>&1 \
	  | sed -e 's/\x1b\[[0-9;]*m//g' \
	  | awk '/known_issues\.dart/ { f = 4; next } \
	         f > 0 { f--; if ($$0 ~ /^ +\047[^\047]+\047,$$/) { print; f = 0 } }' \
	  | sed -e 's/^ *//' \
	  | sort -u \
	  | sed -e 's/^/  /')"; \
	if [ -n "$$dettes" ]; then printf '%s\n' "$$dettes"; \
	else echo "  (aucune dette à inscrire — la suite est verte, ou elle n'a pas tourné)"; fi

argus-debts-write: ## … et l'ÉCRIT dans known_issues.dart, en ajoutant à l'assumé
# ⚠️ CETTE CIBLE EXISTE PARCE QUE « PRÊT À COLLER » S'ARRÊTE UN PAS TROP TÔT.
# Coller est le seul geste dangereux du fichier : son dartdoc porte la ligne de
# déclaration mot pour mot et PLUS HAUT que la vraie, donc un `indexOf` ou un
# `sed` ancré dessus frappe le commentaire. Trois destructions, dont une par un
# agent qui avait LU l'avertissement et l'a cité en reconstruisant le fichier.
# Un rappel à l'ordre ne tient pas cette marche-là ; un raccourci sûr supprime
# la raison d'en bricoler un.
# 📌 Elle ne relance pas la suite : elle passe par `argus-debts`, seule source de
# la dérivation — deux dérivations seraient deux copies de la même décision.
	@$(MAKE) --no-print-directory argus-debts | $(ARGUS) debts --write

argus-debts-forget: ## RETIRE une dette payée — KEY='<la clé du message d'échec>'
# ⚠️ L'AUTRE MOITIÉ, et elle n'est pas un confort. Le harnais émet DEUX messages
# sur ce fichier — « inscris-le » quand un défaut apparaît, « retire cette ligne »
# quand il est corrigé. Deux gestes, le même fichier, le même piège d'ancrage :
# n'outiller que l'ajout aurait laissé le retrait à la main, donc laissé ouverte
# la forme exacte du défaut qu'on venait de fermer.
	@test -n "$(KEY)" || { echo "  usage : make argus-debts-forget KEY='<clé>'"; exit 2; }
	@$(ARGUS) debts --remove='$(KEY)' --write

argus-run: ## Étage 2 — suite Maestro sur device
	@$(ARGUS) run

argus-smoke: ## Étage 2 — smoke seul (le plus rapide)
	@$(ARGUS) run --tags=smoke

argus-visual: ## Étage 2 — régression visuelle seule
	@$(ARGUS) run --tags=visual

argus-baselines: ## (Re)génère les références visuelles — voir l'avertissement du README
	@$(ARGUS) run --update-baselines

argus-perf: ## Démarrage à froid/à chaud, mémoire, taille du binaire
	@$(ARGUS) perf

argus-a11y: ## Cibles tactiles et labels, sur l'écran affiché
	@$(ARGUS) a11y

argus-sec: ## MASVS statique (sources + binaire)
	@$(ARGUS) sec

argus-sca: ## CVE des dépendances Dart et natives
	@$(ARGUS) sca

# `ARGS` passe les drapeaux du rapport, `--previous=<page>` en tête : c'est lui
# qui rend les onglets des runs passés. ⚠️ Une variable donnée EN LIGNE DE
# COMMANDE descend dans les sous-make, donc `make argus-run ARGS=…` la fait
# suivre jusqu'ici — c'est ce qui évite d'avoir à relancer le rapport à part.
argus-report: ## Agrège tout en rapport HTML (ARGS=--previous=<page publiée>)
	@$(ARGUS) report $(ARGS)

# ⚠️ PAS une liste de prérequis. `argus-run` sort en 1 ou 2 dès qu'un finding
# atteint le seuil du gate — c'est son travail —, et make s'arrête là : le
# rapport, c'est-à-dire la seule chose qui explique POURQUOI ça a échoué, n'était
# jamais produit. Exactement dans le cas où on en a besoin.
#
# On enchaîne donc les dimensions à la main, on retient le pire code, et le
# rapport sort toujours. Le code de sortie reste celui du gate : produire le
# rapport ne doit pas verdir un run rouge.
argus: ## Tout, dans l'ordre — le rapport sort même quand une dimension échoue
	@code=0; \
	for cible in argus-lint argus-reach argus-guards argus-run argus-perf argus-a11y argus-sec argus-sca; do \
		$(MAKE) --no-print-directory $$cible || { s=$$?; [ $$s -gt $$code ] && code=$$s; }; \
	done; \
	$(MAKE) --no-print-directory argus-report; \
	[ $$code -eq 0 ] || echo "✖ dimensions en échec — le rapport ci-dessus dit lesquelles."; \
	exit $$code
