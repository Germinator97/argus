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

argus-help: ## Liste les cibles
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

argus-doctor: ## Config résolue + outillage détecté
	@echo "flutter : $(FLUTTER)"
	@node scripts/argus/config.mjs


argus-build: ## Construit l'APK debug
	@$(FLUTTER) build apk --debug

argus-lint: ## Syntaxe des flows Maestro, sans device
	@set -e; for f in .maestro/*.yaml .maestro/_subflows/*.yaml; do \
		[ "$$(basename $$f)" = config.yaml ] && continue; \
		maestro check-syntax "$$f"; \
	done
	@echo "✔ tous les flows parsent"

argus-anchors: ## Les ancres sémantiques arrivent-elles dans l'arbre ? (sans device)
	@$(FLUTTER) test test/argus/anchors_test.dart

argus-guards: ## Étage 1 — gardes a11y et disposition, sans device
	@$(FLUTTER) test test/argus

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

argus-report: ## Agrège tout en rapport HTML
	@node scripts/argus/report.mjs

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
