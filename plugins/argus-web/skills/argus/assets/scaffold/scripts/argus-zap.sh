#!/usr/bin/env bash
#
# argus-zap.sh — Module SECURITY d'Argus : scan DAST "baseline" via OWASP ZAP.
#
# Scan PASSIF et NON DESTRUCTIF (spider + regles passives, aucune attaque active)
# de l'application visee par $ARGUS_BASE_URL.
#
#   - Image officielle 2026 : ghcr.io/zaproxy/zaproxy:stable
#     (owasp/zap2docker-stable est DEPRECIE — ZAP n'est plus un projet OWASP).
#   - Rapports ecrits dans ./argus-report/zap.{html,json,md}
#   - Code de sortie : non-zero UNIQUEMENT sur FAIL (grace a -I), jamais sur WARN.
#   - Auth optionnelle (token Bearer / cookie) injectee via les variables d'env
#     ZAP natives, passees au conteneur avec `docker run -e`.
#
# Usage :
#   ARGUS_BASE_URL=https://staging.mon-app.ci ./scripts/argus-zap.sh
#
# Scan authentifie (le header est ajoute a TOUTES les requetes) :
#   ARGUS_ZAP_AUTH_HEADER_VALUE="Bearer eyJ..." \
#   ARGUS_BASE_URL=https://staging.mon-app.ci ./scripts/argus-zap.sh
#
# Cas particulier : si le token n'est pas attache par les variables d'env
# (certains flux Automation Framework), basculer sur une regle "replacer" :
#   ARGUS_ZAP_EXTRA='-z "-config replacer.full_list(0).description=argus-auth \
#     -config replacer.full_list(0).enabled=true \
#     -config replacer.full_list(0).matchtype=REQ_HEADER \
#     -config replacer.full_list(0).matchstr=Authorization \
#     -config replacer.full_list(0).regex=false \
#     -config replacer.full_list(0).replacement=Bearer eyJ..."'
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (surchargeable par variables d'environnement)
# ---------------------------------------------------------------------------

# Image ZAP officielle. NE PAS utiliser owasp/zap2docker-* (deprecie).
# Variantes : :stable (CI, reproductible), :weekly (regles recentes), :nightly, :bare.
ZAP_IMAGE="${ARGUS_ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}"

# URL cible, protocole inclus. Obligatoire.
TARGET_URL="${ARGUS_BASE_URL:-}"

# Dossier de sortie (monte sur /zap/wrk dans le conteneur).
REPORT_DIR="${ARGUS_REPORT_DIR:-./argus-report}"

# Duree du spider en minutes (-m). 1 par defaut : un baseline doit rester rapide.
SPIDER_MINS="${ARGUS_ZAP_SPIDER_MINS:-1}"

# Duree totale max de ZAP en minutes (-T). 0 = pas de limite imposee.
MAX_MINS="${ARGUS_ZAP_MAX_MINS:-0}"

# Inclure les regles PASSIVES "alpha" (-a). Reste 100% passif / non destructif.
# (-a n'active PAS le scan actif : le baseline est toujours passif.)
INCLUDE_ALPHA="${ARGUS_ZAP_ALPHA:-true}"

# Utiliser l'AJAX spider en plus du spider classique (-j). Utile pour les SPA.
USE_AJAX="${ARGUS_ZAP_AJAX:-false}"

# Fichier de regles TSV optionnel (-c) : pluginId<TAB>ACTION<TAB>(description),
# ACTION dans IGNORE / INFO / WARN / FAIL. Permet d'ajuster le bruit / d'escalader.
RULES_FILE="${ARGUS_ZAP_RULES:-}"

# Options ZAP additionnelles libres (avance, ex : regle replacer via -z).
EXTRA_OPTS="${ARGUS_ZAP_EXTRA:-}"

# --- Auth optionnelle (variables d'env ZAP natives) ------------------------
# Lues par les scripts ZAP AVANT le demarrage de ZAP, donc passees via docker -e.
#   ARGUS_ZAP_AUTH_HEADER_VALUE : valeur complete, ex "Bearer eyJ..." ou "session=abc"
#   ARGUS_ZAP_AUTH_HEADER       : nom du header (defaut cote ZAP : Authorization)
#   ARGUS_ZAP_AUTH_HEADER_SITE  : restreint l'injection aux sites contenant cette chaine
AUTH_HEADER_VALUE="${ARGUS_ZAP_AUTH_HEADER_VALUE:-}"
AUTH_HEADER_NAME="${ARGUS_ZAP_AUTH_HEADER:-}"
AUTH_HEADER_SITE="${ARGUS_ZAP_AUTH_HEADER_SITE:-}"

# ---------------------------------------------------------------------------
# Validation des entrees (fail fast)
# ---------------------------------------------------------------------------
if [[ -z "$TARGET_URL" ]]; then
  echo "[argus-zap] ERREUR : ARGUS_BASE_URL est obligatoire (ex : https://staging.mon-app.ci)" >&2
  exit 2
fi
if [[ ! "$TARGET_URL" =~ ^https?:// ]]; then
  echo "[argus-zap] ERREUR : ARGUS_BASE_URL doit inclure le protocole http(s):// — recu '$TARGET_URL'" >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "[argus-zap] ERREUR : 'docker' introuvable dans le PATH." >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Preparation du dossier de travail / rapports
# ---------------------------------------------------------------------------
mkdir -p "$REPORT_DIR"
# Chemin absolu requis par le montage Docker.
REPORT_DIR_ABS="$(cd "$REPORT_DIR" && pwd)"
# Le conteneur ZAP tourne en uid 1000 (user "zap") : le dossier monte doit etre
# inscriptible par cet uid, sinon l'ecriture des rapports echoue (Linux/CI surtout).
chmod 777 "$REPORT_DIR_ABS"

# ---------------------------------------------------------------------------
# Construction des arguments Docker
# ---------------------------------------------------------------------------
# NB : pas de -t (TTY) — casserait en CI ou il n'y a pas de terminal.
docker_args=( run --rm -v "${REPORT_DIR_ABS}:/zap/wrk/:rw" )

# Cible effective (peut etre reecrite pour atteindre l'hote depuis le conteneur).
ZAP_TARGET="$TARGET_URL"
# Un conteneur ne voit PAS le localhost de l'hote. host-gateway mappe
# host.docker.internal -> hote (Docker 20.10+, Linux & macOS) : on reecrit la cible.
if [[ "$TARGET_URL" =~ ^https?://(localhost|127\.0\.0\.1)([:/]|$) ]]; then
  docker_args+=( --add-host=host.docker.internal:host-gateway )
  ZAP_TARGET="${TARGET_URL/localhost/host.docker.internal}"
  ZAP_TARGET="${ZAP_TARGET/127.0.0.1/host.docker.internal}"
  echo "[argus-zap] Cible locale -> reecrite en $ZAP_TARGET (host.docker.internal)."
fi

# Injection de l'auth UNIQUEMENT si une valeur est fournie.
if [[ -n "$AUTH_HEADER_VALUE" ]]; then
  docker_args+=( -e "ZAP_AUTH_HEADER_VALUE=${AUTH_HEADER_VALUE}" )
  [[ -n "$AUTH_HEADER_NAME" ]] && docker_args+=( -e "ZAP_AUTH_HEADER=${AUTH_HEADER_NAME}" )
  [[ -n "$AUTH_HEADER_SITE" ]] && docker_args+=( -e "ZAP_AUTH_HEADER_SITE=${AUTH_HEADER_SITE}" )
  echo "[argus-zap] Auth activee : header '${AUTH_HEADER_NAME:-Authorization}' injecte sur les requetes."
fi

docker_args+=( "$ZAP_IMAGE" zap-baseline.py )

# ---------------------------------------------------------------------------
# Construction des arguments zap-baseline.py
# ---------------------------------------------------------------------------
zap_args=(
  -t "$ZAP_TARGET"   # cible (protocole inclus ; reecrite si localhost)
  -r zap.html        # rapport HTML     -> argus-report/zap.html
  -J zap.json        # rapport JSON     -> argus-report/zap.json
  -w zap.md          # rapport Markdown -> argus-report/zap.md (lisible en PR)
  -m "$SPIDER_MINS"  # duree du spider
  -I                 # NE PAS echouer sur WARN -> sortie non-zero uniquement sur FAIL
)
[[ "$INCLUDE_ALPHA" == "true" ]] && zap_args+=( -a )       # regles passives alpha
[[ "$USE_AJAX" == "true" ]] && zap_args+=( -j )            # AJAX spider (SPA)
[[ "$MAX_MINS" != "0" ]] && zap_args+=( -T "$MAX_MINS" )    # duree totale max

# Fichier de regles TSV (-c) : copie dans le dossier de travail pour etre lu par ZAP.
if [[ -n "$RULES_FILE" ]]; then
  if [[ ! -f "$RULES_FILE" ]]; then
    echo "[argus-zap] ERREUR : fichier de regles introuvable : $RULES_FILE" >&2
    exit 2
  fi
  cp "$RULES_FILE" "${REPORT_DIR_ABS}/zap-rules.tsv"
  zap_args+=( -c zap-rules.tsv )
fi

# Options libres additionnelles (word-splitting volontaire).
if [[ -n "$EXTRA_OPTS" ]]; then
  # shellcheck disable=SC2206
  zap_args+=( $EXTRA_OPTS )
fi

echo "[argus-zap] Image  : $ZAP_IMAGE"
echo "[argus-zap] Cible  : $ZAP_TARGET"
echo "[argus-zap] Sortie : $REPORT_DIR_ABS/zap.{html,json,md}"

# ---------------------------------------------------------------------------
# Execution (on capture le code retour sans declencher `set -e`)
# ---------------------------------------------------------------------------
set +e
docker "${docker_args[@]}" "${zap_args[@]}"
rc=$?
set -e

# ---------------------------------------------------------------------------
# Mapping des codes de sortie zap-baseline.py :
#   0 = PASS (ou WARN neutralises par -I)
#   1 = au moins un FAIL                         -> bloquant
#   2 = WARN seul (ne devrait pas arriver avec -I) -> force a 0 (contrat Argus)
#   3 = erreur d'execution ZAP (cible injoignable, image KO, ...) -> bloquant
# ---------------------------------------------------------------------------
case "$rc" in
  0) echo "[argus-zap] OK — aucun FAIL. (WARN eventuels listes dans le rapport.)" ;;
  1) echo "[argus-zap] FAIL — au moins une alerte de niveau FAIL. Voir ${REPORT_DIR_ABS}/zap.html" >&2 ;;
  2) echo "[argus-zap] WARN uniquement — non bloquant (contrat Argus : seul FAIL echoue)." ; rc=0 ;;
  3) echo "[argus-zap] ERREUR — ZAP n'a pas pu terminer le scan (cible injoignable ?). Voir les logs." >&2 ;;
  *) echo "[argus-zap] Code de sortie inattendu : $rc" >&2 ;;
esac

exit "$rc"
