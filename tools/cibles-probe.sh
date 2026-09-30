#!/usr/bin/env bash
# Sonde du 591 — joue `tools/cibles-probe.dart` dans un projet Flutter où le
# scaffold Argus Mobile est installé : une cible tactile collée au bord d'une
# zone qui défile est mesurée, et seule une cible qu'un défilement coupe est
# dispensée — là où la guideline de Flutter, elle, reste aveugle.
#
# Usage : bash tools/cibles-probe.sh <projet>   (FLUTTER=<binaire> pour un autre SDK)
#
# ⚠️ ELLE AJOUTE UN FICHIER AU PROJET (test/) : un projet JETABLE.
set -euo pipefail

projet="${1:?usage : cibles-probe.sh <projet flutter jetable, scaffold installé>}"
flutter="${FLUTTER:-flutter}"
ici="$(cd "$(dirname "$0")" && pwd)"

# Refuser de conclure plutôt que mesurer le mauvais sujet.
[ -f "$projet/test/argus/argus_harness.dart" ] \
  || { echo "✖ le scaffold n'est pas installé dans $projet : rien à mesurer" >&2; exit 2; }

cd "$projet"
cp "$ici/cibles-probe.dart" test/argus_cibles_probe_test.dart

sortie="$(mktemp)"
trap 'rm -f "$sortie"' EXIT
if ! "$flutter" test test/argus_cibles_probe_test.dart --reporter expanded > "$sortie" 2>&1; then
  cat "$sortie"
  echo "✖ la sonde des cibles échoue : une cible collée au bord d'une zone qui défile n'est pas mesurée comme il faut" >&2
  exit 1
fi
grep -E '^CAS ' "$sortie" || true
echo "✔ une cible collée au bord d'une zone qui défile est mesurée ; seule une cible coupée est dispensée"
