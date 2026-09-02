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

.PHONY: argus-help argus argus-lint argus-guards argus-run argus-smoke argus-visual \
        argus-baselines argus-perf argus-a11y argus-sec argus-sca argus-report \
        argus-anchors \
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
	@node scripts/argus/config.mjs


argus-build: ## Construit le binaire que la config déclare, ciblé sur l'ABI du device
# ⚠️ LA MESURE N'EST PLUS FAITE ICI, et c'est le point 214. `wc -c` rend 0 sur un
# répertoire et `shasum` y échoue — or un `.app` iOS EST un répertoire, si bien
# que cette garde annonçait « 0 → 0 octets » à chaque build iOS. Elle ne se
# taisait pas : elle affirmait, et un chiffre qui n'a rien mesuré se lit comme un
# chiffre qui a mesuré. `--measure-binary` traite les deux formes, un garde
# l'exerce, et le Makefile l'INTERROGE au lieu de recopier sa propre version.
	@CMD="$$(node scripts/argus/config.mjs --print-build-cmd)"; \
	APK="$$(node scripts/argus/config.mjs --print-binary)"; \
	M="$$(node scripts/argus/config.mjs --measure-binary)"; \
	BKIND=$$(printf '%s' "$$M" | cut -f1); BEFORE=$$(printf '%s' "$$M" | cut -f2); \
	BEFOREH=$$(printf '%s' "$$M" | cut -f3); \
	echo "→ $$CMD"; \
	START=$$(date +%s); eval "$$CMD"; RC=$$?; ELAPSED=$$(( $$(date +%s) - START )); \
	M="$$(node scripts/argus/config.mjs --measure-binary)"; \
	AKIND=$$(printf '%s' "$$M" | cut -f1); AFTER=$$(printf '%s' "$$M" | cut -f2); \
	AFTERH=$$(printf '%s' "$$M" | cut -f3); \
	echo "  paquet   $$APK"; \
	if [ "$$RC" -ne 0 ]; then \
	  echo "  ✖ LE BUILD A ÉCHOUÉ (exit $$RC) après $${ELAPSED}s — son erreur est au-dessus."; \
	  echo "      Rien à corriger dans la config : c'est le build qu'il faut lire."; \
	  exit $$RC; \
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
	  FRESH="$$(node scripts/argus/sec.mjs --print-freshness 2>/dev/null || echo inconnu)"; \
	  if [ "$$FRESH" = perime ]; then \
	    echo "  ✖ PAQUET PÉRIMÉ — même empreinte, alors que lib/ a changé DEPUIS."; \
	    echo "      Le build n'a rien recompilé : tu piloterais le binaire d'AVANT tes"; \
	    echo "      ancres, et les flows échoueraient sur des ancres pourtant justes."; \
	    echo "      ⇒ \`$(FLUTTER) clean\` puis relance. Ce n'est pas optionnel."; \
	    exit 1; \
	  else \
	    echo "  ⚠️  PAQUET INTACT — le paquet n'a pas été réécrit (même empreinte),"; \
	    echo "      et lib/ n'a pas changé depuis : c'est normal."; \
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
	@node scripts/argus/config.mjs --check-flows

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
	@rc=0; \
	node scripts/argus/config.mjs --check-anchors || rc=$$?; \
	$(FLUTTER) test test/argus/anchors_test.dart || rc=$$?; \
	exit $$rc

argus-guards: ## Étage 1 — gardes a11y et disposition, sans device
	@$(FLUTTER) test test/argus

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
	@$(FLUTTER) test test/argus 2>&1 \
	  | sed -e 's/\x1b\[[0-9;]*m//g' \
	  | grep -oE "^ +'[^']+',$$" \
	  | sed -e 's/^ *//' \
	  | sort -u \
	  | sed -e 's/^/  /' \
	  || echo "  (aucune dette à inscrire — la suite est verte, ou elle n'a pas tourné)"

argus-run: ## Étage 2 — suite Maestro sur device
	@node scripts/argus/run.mjs

argus-smoke: ## Étage 2 — smoke seul (le plus rapide)
	@node scripts/argus/run.mjs --tags=smoke

argus-visual: ## Étage 2 — régression visuelle seule
	@node scripts/argus/run.mjs --tags=visual

argus-baselines: ## (Re)génère les références visuelles — voir l'avertissement du README
	@node scripts/argus/run.mjs --update-baselines

argus-perf: ## Démarrage, jank, mémoire, taille du binaire
	@node scripts/argus/perf.mjs

argus-a11y: ## Cibles tactiles et labels, sur l'écran affiché
	@node scripts/argus/a11y.mjs

argus-sec: ## MASVS statique (sources + binaire)
	@node scripts/argus/sec.mjs

argus-sca: ## CVE des dépendances Dart et natives
	@node scripts/argus/sca.mjs

# `ARGS` passe les drapeaux du rapport, `--previous=<page>` en tête : c'est lui
# qui rend les onglets des runs passés. ⚠️ Une variable donnée EN LIGNE DE
# COMMANDE descend dans les sous-make, donc `make argus-run ARGS=…` la fait
# suivre jusqu'ici — c'est ce qui évite d'avoir à relancer le rapport à part.
argus-report: ## Agrège tout en rapport HTML (ARGS=--previous=<page publiée>)
	@node scripts/argus/report.mjs $(ARGS)

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
	for cible in argus-lint argus-guards argus-run argus-perf argus-a11y argus-sec argus-sca; do \
		$(MAKE) --no-print-directory $$cible || { s=$$?; [ $$s -gt $$code ] && code=$$s; }; \
	done; \
	$(MAKE) --no-print-directory argus-report; \
	[ $$code -eq 0 ] || echo "✖ dimensions en échec — le rapport ci-dessus dit lesquelles."; \
	exit $$code
