#!/usr/bin/env bash
# Argus Mobile — copie idempotente du scaffold Maestro dans un projet Flutter.
# N'écrase JAMAIS un fichier existant (sécurité). Usage: bash install-mobile.sh [TARGET_DIR]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCAFFOLD_DIR="$SKILL_DIR/assets/scaffold-mobile"
TARGET="${1:-$(pwd)}"

if [ ! -d "$SCAFFOLD_DIR" ]; then
  echo "❌ Scaffold introuvable: $SCAFFOLD_DIR" >&2
  exit 1
fi
TARGET="$(cd "$TARGET" && pwd)"

echo "📦 Argus Mobile — installation du scaffold Maestro"
echo "   source : $SCAFFOLD_DIR"
echo "   cible  : $TARGET"
echo

# Un pubspec.yaml absent ne bloque pas : le harness peut être posé avant que le
# projet existe. Mais le signaler évite de le copier dans le mauvais dossier.
if [ ! -f "$TARGET/pubspec.yaml" ]; then
  echo "  ⚠️  aucun pubspec.yaml ici — es-tu bien à la racine du projet Flutter ?"
  echo
fi

copied=0
skipped=0
while IFS= read -r src; do
  rel="${src#"$SCAFFOLD_DIR"/}"
  dest="$TARGET/$rel"
  if [ -e "$dest" ]; then
    echo "  ⏭️  existe déjà, conservé : $rel"
    skipped=$((skipped + 1))
  else
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    echo "  ✅ copié : $rel"
    copied=$((copied + 1))
  fi
done < <(find "$SCAFFOLD_DIR" -type f)

# Dossiers d'artefacts et de références visuelles.
mkdir -p "$TARGET/argus-mobile-report" "$TARGET/.maestro/_baselines"

echo
echo "Résumé : $copied copié(s), $skipped conservé(s)."
echo

# Outillage : on informe, on ne bloque pas. Un outil absent donne une dimension
# sautée et mentionnée dans le rapport, jamais un faux vert.
echo "Outillage détecté :"
for tool in node flutter maestro adb osv-scanner; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "  ✔ $tool"
  else
    echo "  ○ $tool absent"
  fi
done
echo

echo "Prochaines étapes :"
echo "  1. Édite argus.mobile.yaml (identifiants d'app, devices, écrans, seuils)."
echo "  2. Instrumente l'app : Semantics(identifier: 'home_root', child: …) sur"
echo "     chaque écran clé. ⚠️ Les Key Flutter ne sont PAS visibles par Maestro."
echo "  3. Installe Maestro si besoin :"
echo "       curl -fsSL \"https://get.maestro.mobile.dev\" | bash    # Java 17+ requis"
echo "  4. Vérifie la configuration :   node scripts/argus-mobile-config.mjs"
echo "  5. Construis le binaire :       flutter build apk --debug"
echo "  6. Étage 1, sans device :       make argus-guards"
echo "  7. Étage 2, sur device :        make argus-run"
echo "  8. Références visuelles :       make argus-baselines   # 1re fois"
echo "  9. Rapport HTML :               make argus-report"
echo
echo "  Fusionne aussi le .gitignore fourni dans celui du projet."
