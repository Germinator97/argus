#!/usr/bin/env bash
# Sonde du 593 — joue `tools/locale-probe.dart` dans un projet Flutter où le
# scaffold Argus Mobile est installé : une locale que les délégués du montage ne
# prennent pas en charge est refusée avec sa raison, et ce refus suit ce que
# Flutter signale, cas par cas.
#
# Usage : bash tools/locale-probe.sh <projet>   (FLUTTER=<binaire> pour un autre SDK)
#
# ⚠️ ELLE AJOUTE UN FICHIER AU PROJET (test/) : un projet JETABLE.
set -euo pipefail

projet="${1:?usage : locale-probe.sh <projet flutter jetable, scaffold installé>}"
flutter="${FLUTTER:-flutter}"
ici="$(cd "$(dirname "$0")" && pwd)"

# Refuser de conclure plutôt que mesurer le mauvais sujet.
[ -f "$projet/test/argus/argus_harness.dart" ] \
  || { echo "✖ le scaffold n'est pas installé dans $projet : rien à mesurer" >&2; exit 2; }

cd "$projet"
cp "$ici/locale-probe.dart" test/argus_locale_probe_test.dart

sortie="$(mktemp)"
trap 'rm -f "$sortie"' EXIT
if ! "$flutter" test test/argus_locale_probe_test.dart --reporter expanded > "$sortie" 2>&1; then
  cat "$sortie"
  echo "✖ la sonde de la locale échoue : une locale sans délégué n'est pas refusée comme Flutter la signale" >&2
  exit 1
fi
grep -E '^CAS ' "$sortie" || true
echo "✔ une locale sans délégué est refusée avec sa raison, et le refus suit Flutter"
