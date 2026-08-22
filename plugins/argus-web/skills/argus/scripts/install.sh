#!/usr/bin/env bash
# Argus — copie idempotente du scaffold @playwright/test dans un projet cible.
# N'écrase JAMAIS un fichier existant (sécurité). Usage: bash install.sh [TARGET_DIR]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCAFFOLD_DIR="$SKILL_DIR/assets/scaffold"
TARGET="${1:-$(pwd)}"

if [ ! -d "$SCAFFOLD_DIR" ]; then
  echo "❌ Scaffold introuvable: $SCAFFOLD_DIR" >&2
  exit 1
fi
TARGET="$(cd "$TARGET" && pwd)"

echo "📦 Argus — installation du scaffold @playwright/test"
echo "   source : $SCAFFOLD_DIR"
echo "   cible  : $TARGET"
echo

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

# Dossier de storageState (auth) — à gitignorer.
mkdir -p "$TARGET/playwright/.auth"

echo
echo "Résumé : $copied copié(s), $skipped conservé(s)."
echo
echo "Prochaines étapes :"
echo "  1. Édite argus.config.ts (baseURL, breakpoints, browsers, seuils)."
echo "  2. Fusionne package.snippet.json dans package.json (devDeps + scripts), puis : npm install"
echo "  3. npx playwright install --with-deps chromium   # + firefox webkit si besoin"
echo "  4. npm run argus:visual:update   # baselines de régression visuelle (1re fois)"
echo "  5. npm run argus:test            # lance la suite"
echo "  6. npm run argus:report          # rapport HTML Argus"
