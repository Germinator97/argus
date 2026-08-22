#!/usr/bin/env bash
# Banc d'essai argus-mobile — le projet hôte VIT, le scaffold est REPOSÉ.
#
# Le projet Flutter coûte ~2 min (create + pub get) et ne change jamais : on le
# garde. Le scaffold est gratuit à poser et change à chaque correctif : on le
# refait — sans quoi on mesurerait la version d'avant, `install-mobile.sh`
# n'écrasant JAMAIS un fichier existant. C'est le piège du binaire périmé, et il
# ne dit rien : tout serait vert sur du code qu'on vient de corriger.
#
# Usage : bench.sh [--frais]   (--frais détruit aussi le projet hôte)
set -uo pipefail
# Le SDK : FVM si présent, sinon celui du PATH. ARGUS_FLUTTER force un chemin.
FL="${ARGUS_FLUTTER:-$(command -v flutter || echo "$HOME/fvm/versions/3.41.9/bin/flutter")}"
DART="${ARGUS_DART:-$(dirname "$FL")/dart}"
R="$(cd "$(dirname "$0")/.." && pwd)"
S="$R/plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile"
# Le projet hôte vit hors du dépôt : il ne doit jamais y être commité.
A="${ARGUS_BENCH_DIR:-${TMPDIR:-/tmp}/argus-bench}/accueil"

[ "${1:-}" = "--frais" ] && rm -rf "$A"

# ── 1. le projet hôte, une seule fois ───────────────────────────────────────
if [ ! -f "$A/pubspec.yaml" ]; then
  echo "· projet hôte : création (une seule fois)"
  "$FL" create -e "$A" >/dev/null 2>&1 || { echo "✖ flutter create"; exit 1; }
  (cd "$A" && "$FL" pub add dev:flutter_test --sdk=flutter >/dev/null 2>&1)
else
  echo "· projet hôte : réutilisé"
fi

# ── 2. le scaffold, toujours refait ─────────────────────────────────────────
rm -rf "$A/test/argus" "$A/scripts/argus" "$A/.maestro" "$A/.github/workflows/argus-mobile.yml" \
       "$A/Makefile" "$A/argus.mobile.yaml" "$A/package.snippet.json" "$A/ARGUS-MOBILE.md"
bash "$S/../../scripts/install-mobile.sh" "$A" >/dev/null 2>&1

# ── 3. PROUVER que ce qui est posé vient bien du dépôt d'aujourd'hui ────────
ecart=0
for f in test/argus/a11y_test.dart test/argus/argus_harness.dart test/argus/anchors_test.dart \
         test/argus/layout_test.dart scripts/argus/run.mjs; do
  a=$(shasum "$S/$f" 2>/dev/null | cut -d' ' -f1)
  b=$(shasum "$A/$f" 2>/dev/null | cut -d' ' -f1)
  [ -n "$a" ] && [ "$a" = "$b" ] || { echo "✖ PÉRIMÉ ou absent : $f"; ecart=1; }
done
[ "$ecart" = 0 ] && echo "· scaffold posé = scaffold du dépôt (5 hashes)" || exit 1

# ── 4. les gardes ───────────────────────────────────────────────────────────
cd "$A" || exit 1
code=0
"$DART" format --output=none --set-exit-if-changed test/argus scripts >/dev/null 2>&1
r=$?; echo "  dart format     exit $r"; [ $r -ne 0 ] && code=1
"$FL" analyze test/argus > /tmp/bench-an.txt 2>&1
r=$?; echo "  flutter analyze exit $r"; [ $r -ne 0 ] && { code=1; grep -E '•' /tmp/bench-an.txt | head -4; }
# ⚠️ LES LINTS DU PROJET HÔTE NE SONT PAS LES NÔTRES, ET C'EST LÀ QUE ÇA CASSE.
# `flutter create` pose `flutter_lints`, qui n'active PAS `prefer_single_quotes`
# — donc le scaffold peut violer un lint parfaitement courant sans qu'aucune
# mesure d'ici ne le voie, et faire sortir `flutter analyze` en 1 chez celui qui
# l'active. Vécu : un run l'a signalé, son agent l'a corrigé DANS le terrain, le
# terrain a été effacé, et le défaut est revenu intact — un défaut remonté d'un
# run ne remonte pas tout seul jusqu'ici.
#
# Ces cinq règles sont un choix : les plus répandues hors du paquet par défaut.
# En ajouter est sans risque ; en retirer une demande de dire pourquoi.
cp "$A/analysis_options.yaml" "$A/.analysis_options.argus.bak"
trap 'mv -f "$A/.analysis_options.argus.bak" "$A/analysis_options.yaml" 2>/dev/null' EXIT
cat >> "$A/analysis_options.yaml" <<'LINTS'

linter:
  rules:
    - prefer_single_quotes
    - unnecessary_string_escapes
    - directives_ordering
    - always_declare_return_types
    - prefer_final_locals
LINTS
"$FL" analyze test/argus > /tmp/bench-lint.txt 2>&1
r=$?; echo "  lints courants  exit $r"; [ $r -ne 0 ] && { code=1; grep -E '•' /tmp/bench-lint.txt | head -4; }
mv -f "$A/.analysis_options.argus.bak" "$A/analysis_options.yaml"
trap - EXIT

"$FL" test test/argus > /tmp/bench-te.txt 2>&1
r=$?; echo "  flutter test    exit $r"; [ $r -ne 0 ] && { code=1; grep -E 'Some tests failed|Error' /tmp/bench-te.txt | head -4; }
grep -q 'SKIP — aucun écran déclaré' /tmp/bench-te.txt \
  || { echo "  ✖ les suites ne se déclarent plus non branchées"; code=1; }

[ $code -eq 0 ] && echo "✔ banc vert" || echo "✖ banc rouge"
exit $code
