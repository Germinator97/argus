# Argus Mobile — raccourcis.
#
# Un projet Flutter n'a ni package.json ni npm : ce Makefile joue le rôle des
# scripts npm du harness web. Si ton projet a par ailleurs un package.json,
# package.snippet.json contient les mêmes cibles au format npm.
#
# Node >= 18 est le seul prérequis des scripts. Maestro, adb, osv-scanner sont
# optionnels : leur absence donne une dimension SAUTÉE et mentionnée, jamais un
# faux vert.

.PHONY: argus-help argus argus-lint argus-guards argus-run argus-smoke argus-visual \
        argus-baselines argus-perf argus-a11y argus-sec argus-sca argus-report \
        argus-doctor argus-build

argus-help: ## Liste les cibles
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

argus-doctor: ## Config résolue + outillage détecté
	@node scripts/argus/config.mjs

argus-build: ## Construit l'APK debug
	@flutter build apk --debug

argus-lint: ## Syntaxe des flows Maestro, sans device
	@set -e; for f in .maestro/*.yaml .maestro/_subflows/*.yaml; do \
		[ "$$(basename $$f)" = config.yaml ] && continue; \
		maestro check-syntax "$$f"; \
	done
	@echo "✔ tous les flows parsent"

argus-guards: ## Étage 1 — gardes a11y et disposition, sans device
	@flutter test test/argus

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

argus: argus-lint argus-guards argus-run argus-perf argus-a11y argus-sec argus-sca argus-report ## Tout, dans l'ordre
