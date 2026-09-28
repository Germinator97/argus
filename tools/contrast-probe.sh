#!/usr/bin/env bash
# Sonde du 573 — joue `tools/contrast-probe.dart` dans un projet Flutter où le
# scaffold Argus Mobile est installé : six montages dont le verdict de contraste
# est connu d'avance, dont le faux positif des pixels et le fond d'image.
#
# Usage : bash tools/contrast-probe.sh <projet>   (FLUTTER=<binaire> pour un autre SDK)
#
# ⚠️ ELLE AJOUTE DES FICHIERS AU PROJET (test/) : un projet JETABLE.
# 📌 La police fine vient du SDK lui-même (Roboto Thin, avec les polices
# Material que `flutter` télécharge) : ce dépôt n'embarque aucune police.
set -euo pipefail

projet="${1:?usage : contrast-probe.sh <projet flutter jetable, scaffold installé>}"
flutter="${FLUTTER:-flutter}"
ici="$(cd "$(dirname "$0")" && pwd)"
sdk="$(cd "$(dirname "$(command -v "$flutter")")/.." && pwd)"
polices="$sdk/bin/cache/artifacts/material_fonts"

# Refuser de conclure plutôt que mesurer le mauvais sujet.
[ -f "$polices/Roboto-Thin.ttf" ] \
  || { echo "✖ police fine absente du SDK ($polices) : rien à mesurer" >&2; exit 2; }
[ -f "$projet/test/argus/argus_harness.dart" ] \
  || { echo "✖ le scaffold n'est pas installé dans $projet : rien à mesurer" >&2; exit 2; }

cd "$projet"
mkdir -p test/sonde_contraste
cp "$polices/Roboto-Thin.ttf" test/sonde_contraste/Roboto-Thin.ttf
cp "$ici/contrast-probe.dart" test/argus_contrast_probe_test.dart

sortie="$(mktemp)"
trap 'rm -f "$sortie"' EXIT
if ! "$flutter" test test/argus_contrast_probe_test.dart --reporter expanded > "$sortie" 2>&1; then
  cat "$sortie"
  echo "✖ la sonde du contraste échoue : un verdict connu d'avance n'est pas rendu" >&2
  exit 1
fi
grep -E '^CAS ' "$sortie" || true
echo "✔ contraste jugé sur les couleurs résolues ; fond peint mesuré sur pixels, images chargées"
