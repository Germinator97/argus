#!/usr/bin/env bash
# Sonde du 589 — joue `tools/replis-probe.dart` dans un projet Flutter où le
# scaffold Argus Mobile est installé : un texte replié par conception est écarté
# du garde de troncature et dit, un texte tronqué hors déclaration le reste.
#
# Usage : bash tools/replis-probe.sh <projet>   (FLUTTER=<binaire> pour un autre SDK)
#
# ⚠️ ELLE AJOUTE UN FICHIER AU PROJET (test/) : un projet JETABLE.
set -euo pipefail

projet="${1:?usage : replis-probe.sh <projet flutter jetable, scaffold installé>}"
flutter="${FLUTTER:-flutter}"
ici="$(cd "$(dirname "$0")" && pwd)"

# Refuser de conclure plutôt que mesurer le mauvais sujet.
[ -f "$projet/test/argus/argus_harness.dart" ] \
  || { echo "✖ le scaffold n'est pas installé dans $projet : rien à mesurer" >&2; exit 2; }

cd "$projet"
cp "$ici/replis-probe.dart" test/argus_replis_probe_test.dart

sortie="$(mktemp)"
trap 'rm -f "$sortie"' EXIT
if ! "$flutter" test test/argus_replis_probe_test.dart --reporter expanded > "$sortie" 2>&1; then
  cat "$sortie"
  echo "✖ la sonde des replis échoue : un texte replié par conception n'est pas écarté et dit" >&2
  exit 1
fi
grep -E '^CAS ' "$sortie" || true
echo "✔ un texte replié par conception est écarté du garde de troncature, et dit"
