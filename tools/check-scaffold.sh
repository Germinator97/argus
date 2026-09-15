#!/usr/bin/env bash
# Contrôle du scaffold Argus Mobile — la classification que l'installeur va lire.
#
# `install-mobile.sh` décide du sort de chaque fichier d'après ce que sa source
# déclare en en-tête. Une déclaration oubliée ne casse rien de visible : le
# fichier change simplement de catégorie, et on ne l'apprend que le jour où un
# `--update` écrase le travail de quelqu'un, ou bien ne descend jamais.
#
# Ce script relève la classification effective et la compare, PAR ÉGALITÉ, au
# relevé ci-dessous. Ajouter un fichier, en retirer un, ou déplacer un marqueur
# fait donc échouer le contrôle : c'est voulu — un humain tranche, puis met le
# relevé à jour dans le même commit.
set -euo pipefail

# ⚠️ La racine est SURCHARGEABLE, et ce n'est pas du confort de test. Le garde
# local (`tools/run-guards.test.mjs`) exerce ce script sur un export de HEAD,
# jamais sur l'arbre de travail : lancé sur l'arbre, il rougirait sous CHAQUE
# mutation du harnais qui touche un fichier du scaffold — et comme le harnais
# crédite le PREMIER test rouge, « le garde tombe » deviendrait vrai pour des
# mutations sans rapport, y compris au-dessus de gardes vacants. L'instrument,
# lui, reste lu depuis l'arbre : c'est ce qui le laisse mutable.
ROOT="${ARGUS_SCAFFOLD_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SCAFFOLD="$ROOT/plugins/argus-mobile/skills/argus-mobile/assets/scaffold-mobile"
HEADER=20   # même borne que l'installeur

# ⚠️ REFUSER DE CONCLURE plutôt que mesurer le mauvais sujet. Sans ce garde, une
# racine qui ne porte pas le scaffold fait échouer le `cd` ci-dessous SANS
# arrêter le script : `find .` relève alors le répertoire COURANT — `.git/`
# compris — et le diff accuse une classification qui n'a jamais été lue. Le
# verdict a l'air d'un sujet fautif alors que rien n'a pu être mesuré.
if [ ! -d "$SCAFFOLD" ]; then
  echo "✖ scaffold introuvable sous « $ROOT » — rien n'a pu être contrôlé." >&2
  echo "   (ARGUS_SCAFFOLD_ROOT pointe-t-il une racine de dépôt complète ?)" >&2
  exit 2
fi

# ── Le relevé attendu. Une ligne par fichier : « catégorie<TAB>chemin ». ──────
EXPECTED=$(cat <<'EOF'
cadre	.github/workflows/argus-mobile.yml
merge	.gitignore
cadre	.maestro/_subflows/disable-animations.yaml
owned	.maestro/_subflows/dismiss-system-alerts.yaml
owned	.maestro/_subflows/goto.yaml
cadre	.maestro/_subflows/launch-clean.yaml
owned	.maestro/_subflows/login.yaml
owned	.maestro/_subflows/mask-dynamic.yaml
owned	.maestro/a11y.yaml
cadre	.maestro/config.yaml
owned	.maestro/i18n.yaml
owned	.maestro/journey-critical.yaml
owned	.maestro/lifecycle.yaml
owned	.maestro/resilience.yaml
cadre	.maestro/smoke.yaml
cadre	.maestro/visual.yaml
cadre	ARGUS-MOBILE.md
cadre	Makefile
owned	argus.mobile.yaml
merge	package.snippet.json
cadre	scripts/argus/a11y.mjs
cadre	scripts/argus/argus-mobile.mjs
cadre	scripts/argus/config.mjs
cadre	scripts/argus/perf.mjs
cadre	scripts/argus/report.mjs
cadre	scripts/argus/run.mjs
cadre	scripts/argus/sca.mjs
cadre	scripts/argus/sec.mjs
cadre	test/argus/a11y_test.dart
cadre	test/argus/anchors_test.dart
cadre	test/argus/argus_harness.dart
cadre	test/argus/argus_types.dart
owned	test/argus/harness.dart
owned	test/argus/known_issues.dart
cadre	test/argus/layout_test.dart
EOF
)

fail=0
note() { echo "  ✖ $*"; fail=1; }

# ── 1. Classification effective ──────────────────────────────────────────────
ACTUAL=$(
  cd "$SCAFFOLD"
  find . -type f | sed 's|^\./||' | sort | while IFS= read -r f; do
    head="$(head -"$HEADER" "$f")"
    owned=0; merge=0
    printf '%s' "$head" | grep -qF 'ARGUS:OWNED' && owned=1
    printf '%s' "$head" | grep -qF 'ARGUS:MERGE' && merge=1
    if [ "$owned" = 1 ] && [ "$merge" = 1 ]; then cat="LES-DEUX"
    elif [ "$owned" = 1 ]; then cat="owned"
    elif [ "$merge" = 1 ]; then cat="merge"
    else cat="cadre"; fi
    printf '%s\t%s\n' "$cat" "$f"
  done
)

if ! diff <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$ACTUAL") > /tmp/argus-scaffold.diff; then
  echo "✖ la classification a changé (attendu < / relevé >) :"
  sed 's/^/    /' /tmp/argus-scaffold.diff
  echo "    → tranche chaque ligne, puis mets le relevé de ce script à jour."
  fail=1
fi

# ── 2. Un fichier de CADRE sans signature ne peut pas être protégé ───────────
# L'installeur ne compare un fichier de cadre que si la copie locale porte sa
# signature — la première ligne de la source qui se nomme. Sans signature, un
# homonyme du projet serait de nouveau écrasé.
while IFS=$'\t' read -r cat rel; do
  [ "$cat" = cadre ] || continue
  grep -qi 'argus' "$SCAFFOLD/$rel" || note "cadre sans signature « argus » : $rel"
done <<< "$ACTUAL"

# ── 3. Un fichier « à toi » sans rien à remplir est un marqueur posé à tort ──
while IFS=$'\t' read -r cat rel; do
  [ "$cat" = owned ] || continue
  grep -q 'TODO(argus)' "$SCAFFOLD/$rel" || note "déclaré ARGUS:OWNED mais sans TODO(argus) : $rel"
done <<< "$ACTUAL"

# ── 4. Les nombres annoncés dans la doc valent-ils encore ? ──────────────────
# Un compteur écrit à la main s'affiche exactement aussi bien quand il est faux.
# On le dérive donc du contenu — et on exige d'abord que le motif soit TROUVÉ,
# sinon une reformulation rendrait ce contrôle muet sans rien dire.
flows=$(find "$SCAFFOLD/.maestro" -maxdepth 1 -name '*.yaml' ! -name 'config.yaml' | wc -l | tr -d ' ')
subs=$(find "$SCAFFOLD/.maestro/_subflows" -name '*.yaml' | wc -l | tr -d ' ')
claims=$(grep -rnoE '[0-9]+ flows \+ [0-9]+ sous-flows' "$ROOT" --include='*.md' || true)
if [ -z "$claims" ]; then
  note "le motif « N flows + M sous-flows » a disparu de la doc — mets ce contrôle à jour, ou retire-le"
else
  while IFS= read -r hit; do
    said="${hit##*:}"
    where="$(printf '%s' "${hit#"$ROOT"/}" | cut -d: -f1,2)"
    [ "$said" = "$flows flows + $subs sous-flows" ] \
      || note "compteur périmé : « $said » alors qu'il y a $flows flows et $subs sous-flows — $where"
  done <<< "$claims"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "✖ contrôle du scaffold en échec."
  exit 1
fi
echo "✔ scaffold conforme : $(printf '%s\n' "$ACTUAL" | wc -l | tr -d ' ') fichiers, classification inchangée."
