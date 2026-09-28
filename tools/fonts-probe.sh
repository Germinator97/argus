#!/usr/bin/env bash
# Sonde du 574 — joue `tools/fonts-probe.dart` dans un projet Flutter où le
# scaffold Argus Mobile est installé, puis sa contre-épreuve : un TTF que le
# harnais ne sait pas nommer doit faire ÉCHOUER le chargement, en le disant.
#
# Usage : bash tools/fonts-probe.sh <projet>      (FLUTTER=<binaire> pour un autre SDK)
#
# ⚠️ ELLE MODIFIE LE PROJET (pubspec, assets, test/) : un projet JETABLE, celui
# que le job `harness` de la CI monte, ou un `flutter create -e` à la main.
#
# 📌 Les polices viennent du SDK lui-même — les Roboto que `flutter` télécharge
# avec ses polices Material. Ce dépôt n'embarque aucun fichier de police.
set -euo pipefail

projet="${1:?usage : fonts-probe.sh <projet flutter jetable, scaffold installé>}"
flutter="${FLUTTER:-flutter}"
ici="$(cd "$(dirname "$0")" && pwd)"
sdk="$(cd "$(dirname "$(command -v "$flutter")")/.." && pwd)"
polices="$sdk/bin/cache/artifacts/material_fonts"

# Refuser de conclure plutôt que mesurer le mauvais sujet.
[ -f "$polices/Roboto-Bold.ttf" ] \
  || { echo "✖ polices Material absentes du SDK ($polices) : rien à mesurer" >&2; exit 2; }
[ -f "$projet/test/argus/argus_harness.dart" ] \
  || { echo "✖ le scaffold n'est pas installé dans $projet : rien à mesurer" >&2; exit 2; }
grep -q '^  uses-material-design: true$' "$projet/pubspec.yaml" \
  || { echo "✖ pubspec inattendu (pas de « uses-material-design: true ») : montage à revoir" >&2; exit 2; }

cd "$projet"
mkdir -p assets/fonts/sonde assets/sonde-gf
# Une famille déclarée par le pubspec, donc listée par FontManifest.json…
cp "$polices/Roboto-Regular.ttf" assets/fonts/sonde/SondeMaison-Regular.ttf
# … et deux TTF en ASSETS, nommés à la façon de google_fonts.
cp "$polices/Roboto-Bold.ttf" assets/sonde-gf/Roboto-Bold.ttf
cp "$polices/Roboto-MediumItalic.ttf" assets/sonde-gf/Roboto-MediumItalic.ttf
awk '{ print }
  $0 == "  uses-material-design: true" {
    print "  assets:"
    print "    - assets/sonde-gf/"
    print "  fonts:"
    print "    - family: SondeMaison"
    print "      fonts:"
    print "        - asset: assets/fonts/sonde/SondeMaison-Regular.ttf"
  }' pubspec.yaml > pubspec.yaml.sonde && mv pubspec.yaml.sonde pubspec.yaml
cp "$ici/fonts-probe.dart" test/argus_fonts_probe_test.dart
"$flutter" pub get > /dev/null

sortie="$(mktemp)"
trap 'rm -f "$sortie"' EXIT

# 1. Dérivées, chargées, RENDUES.
if ! "$flutter" test test/argus_fonts_probe_test.dart --reporter expanded > "$sortie" 2>&1; then
  cat "$sortie"
  echo "✖ la sonde des polices échoue : le cadre ne dérive pas, ou ne charge pas, ce que le bundle porte" >&2
  exit 1
fi
grep -E '^(DERIVEES|LARGEUR) ' "$sortie" || true

# 2. La contre-épreuve : un nom que la table de google_fonts ne connaît pas.
cp "$polices/Roboto-Regular.ttf" assets/sonde-gf/Roboto-VariableFont_wght.ttf
if "$flutter" test test/argus_fonts_probe_test.dart > "$sortie" 2>&1; then
  echo "✖ un TTF au nom inconnu est passé : la dérivation devine au lieu de lever" >&2
  exit 1
fi
grep -q 'ne sait pas nommer' "$sortie" \
  || { cat "$sortie"; echo "✖ l'échec ne dit pas pourquoi : il accuserait autre chose que le nom" >&2; exit 1; }
rm assets/sonde-gf/Roboto-VariableFont_wght.ttf

echo "✔ polices dérivées du bundle, chargées et rendues ; un nom inconnu lève en le disant"
