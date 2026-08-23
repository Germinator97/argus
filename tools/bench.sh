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
# ⚠️ LA SORTIE DE L'INSTALLEUR EST LUE, PAS JETÉE. Elle partait vers /dev/null,
# et comme aucune de ses erreurs n'est fatale — le script continue, la CI reste
# verte —, un défaut y a vécu six runs en aveugle : un test numérique qui levait
# « integer expression expected » neuf fois par installation.
#
# Le critère est TOTAL et NÉGATIF : zéro ligne de la forme « <script>: line N: »,
# quelle qu'elle soit. Chercher les formulations déjà vues laisserait passer
# toutes celles qu'on n'a pas imaginées.
bash "$S/../../scripts/install-mobile.sh" "$A" > /tmp/bench-install.txt 2>&1

# ⚠️ ARMER LE CAS, sinon le contrôle ci-dessous ne mesure RIEN. Sur un scaffold
# fraîchement posé, tous les fichiers OWNED portent encore leurs TODO, donc le
# compteur de l'installeur ne passe jamais par zéro — l'état qui déclenche le
# défaut est celui d'un projet RÉELLEMENT instrumenté, où ils sont remplis.
# Mesuré : le banc restait vert sur le défaut réintroduit, et le contrôle avait
# l'air de marcher. On vide donc les TODO d'un fichier OWNED, et on relance
# l'installeur comme on le relance sur un projet en cours.
perl -0777 -pi -e 's/TODO\(argus\):/TODO-rempli:/g' "$A/.maestro/a11y.yaml"
bash "$S/../../scripts/install-mobile.sh" "$A" >> /tmp/bench-install.txt 2>&1

if grep -qE 'install-mobile\.sh: line [0-9]+:' /tmp/bench-install.txt; then
  echo "✖ l'installeur a émis une erreur shell :"
  grep -E 'install-mobile\.sh: line [0-9]+:' /tmp/bench-install.txt | head -3 | sed 's/^/    /'
  exit 1
fi

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

# ── 5. LES SCRIPTS DE MESURE, DÉROULÉS POUR DE VRAI ─────────────────────────
#
# ⚠️ Rien ici ne les exécutait, et `node --check` ne prouve QUE la syntaxe. Un
# retrait de code a ainsi emporté deux fonctions (`measureMemory`,
# `deviceContext`) sans qu'aucune mesure ne bronche : banc vert, gardes verts,
# `--check` vert — et la dimension performance morte à l'installation chez le
# projet suivant, qui l'a découverte en `ReferenceError` à l'exécution.
#
# Un faux `adb` suffit à dérouler le chemin nominal. Lancer le script SANS
# device ne prouve rien : il sort avant d'atteindre le corps de la mesure —
# c'est exactement le contrôle que j'avais fait, et il était vert.
FAKE="$(mktemp -d)"
cat > "$FAKE/adb" <<'FAKEADB'
#!/usr/bin/env bash
case "$*" in
  *"devices"*)          printf 'List of devices attached\nemulator-5554\tdevice\n' ;;
  *"emu avd name"*)     printf 'bench_avd\nOK\n' ;;
  *"resolve-activity"*) printf 'com.exemple.app/.MainActivity\n' ;;
  *"am start"*)         printf 'Status: ok\nTotalTime: 900\nWaitTime: 950\n' ;;
  *"meminfo"*)          printf '  TOTAL PSS:   192000  TOTAL RSS:  300000\n' ;;
  *"ro.build.version.release"*) printf '16\n' ;;
  *"ro.build.version.sdk"*)     printf '36\n' ;;
  *"ro.product.model"*)         printf 'bench_device\n' ;;
  *"getprop"*)          printf 'x\n' ;;
  *"dumpsys package"*)  printf '  [status=speed-profile]\n' ;;
  *)                    printf '\n' ;;
esac
exit 0
FAKEADB
chmod +x "$FAKE/adb"
sed -i.bak 's/^appId:.*/appId: com.exemple.app/; s/^  androidPackage:.*/  androidPackage: com.exemple.app/' "$A/argus.mobile.yaml"
# ⚠️ CHEMIN RELATIF, et sortie EXIGÉE. Les deux pour la même raison : lancé par
# un chemin absolu qui traverse un lien symbolique (sur macOS, $TMPDIR en est
# un), le garde d'entrée de ces scripts ne reconnaît pas son propre fichier et
# `main()` n'est JAMAIS appelé — sortie vide, exit 0. Ma première version de
# cette étape faisait exactement ça : elle lançait un script qui ne s'exécutait
# pas et rapportait « déroulé ». Elle est donc restée verte sur le défaut
# qu'elle venait d'être écrite pour attraper.
for s in perf a11y; do
  out=$(cd "$A" && PATH="$FAKE:$PATH" node "scripts/argus/$s.mjs" --samples=1 2>&1)
  if [ -z "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
    echo "  ✖ scripts/$s.mjs n'a RIEN produit — le montage ne mesure pas, ne lis pas ce vert."
    code=1
  elif printf '%s' "$out" | grep -qE 'ReferenceError|is not a function|is not defined'; then
    echo "  ✖ scripts/$s.mjs — référence morte sur le chemin nominal :"
    printf '%s' "$out" | grep -E 'ReferenceError|is not a function|is not defined' | head -2 | sed 's/^/      /'
    code=1
  else
    echo "  $s.mjs déroulé  exit 0"
  fi
done
mv -f "$A/argus.mobile.yaml.bak" "$A/argus.mobile.yaml"
rm -rf "$FAKE"

[ $code -eq 0 ] && echo "✔ banc vert" || echo "✖ banc rouge"
exit $code
