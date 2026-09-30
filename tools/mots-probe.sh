#!/usr/bin/env bash
# Sonde du 592 — joue `tools/mots-probe.dart` dans un projet Flutter où le
# scaffold Argus Mobile est installé : un mot coupé entre deux lettres par un
# retour à la ligne est vu ; une coupure à une espace, après un trait d'union ou
# entre deux idéogrammes ne l'est pas.
#
# Usage : bash tools/mots-probe.sh <projet>   (FLUTTER=<binaire> pour un autre SDK)
#
# ⚠️ ELLE AJOUTE UN FICHIER AU PROJET (test/) : un projet JETABLE.
set -euo pipefail

projet="${1:?usage : mots-probe.sh <projet flutter jetable, scaffold installé>}"
flutter="${FLUTTER:-flutter}"
ici="$(cd "$(dirname "$0")" && pwd)"

# Refuser de conclure plutôt que mesurer le mauvais sujet.
[ -f "$projet/test/argus/argus_harness.dart" ] \
  || { echo "✖ le scaffold n'est pas installé dans $projet : rien à mesurer" >&2; exit 2; }

cd "$projet"
cp "$ici/mots-probe.dart" test/argus_mots_probe_test.dart

sortie="$(mktemp)"
trap 'rm -f "$sortie"' EXIT
if ! "$flutter" test test/argus_mots_probe_test.dart --reporter expanded > "$sortie" 2>&1; then
  cat "$sortie"
  echo "✖ la sonde des mots coupés échoue : un mot coupé n'est pas vu, ou une coupure légitime l'est" >&2
  exit 1
fi
grep -E '^CAS ' "$sortie" || true
echo "✔ un mot coupé entre deux lettres est vu ; une coupure légitime ne l'est pas"
