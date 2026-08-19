#!/usr/bin/env bash
# Argus Mobile — copie idempotente du scaffold Maestro dans un projet Flutter.
#
# Usage: bash install-mobile.sh [TARGET_DIR] [--check|--update]
#
#   (défaut)   installe ce qui manque, ne touche à RIEN d'existant.
#   --check    ne écrit rien ; signale les fichiers de CADRE en retard sur le
#              plugin, et sort en 1 s'il y en a. À câbler en CI.
#   --update   met à jour les fichiers de CADRE, sans jamais toucher aux
#              fichiers que tu édites.
#
# LA FRONTIÈRE EST DÉRIVÉE DE LA SOURCE, pas d'une liste tenue à la main —
# chaque fichier du scaffold dit lui-même à quelle catégorie il appartient :
#   « TODO(argus) »  → il T'APPARTIENT (config, ancres, parcours métier) :
#                      jamais écrasé, jamais comparé.
#   « fusionn… »     → à FUSIONNER dans un homonyme du projet (.gitignore,
#                      snippet npm) : jamais écrasé, jamais comparé.
#   sinon            → du CADRE (scripts, suites de test, CI) : comparable et
#                      remplaçable par --update.
# Une liste de noms écrite à la main aurait vieilli au premier fichier ajouté.
#
# ⚠️ Sans --update, une amélioration du plugin NE REDESCEND PAS dans un projet
# déjà installé : la copie locale reste à la version du jour de l'installation,
# sans que rien ne le signale.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCAFFOLD_DIR="$SKILL_DIR/assets/scaffold-mobile"
MODE="install"
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --check)  MODE="check" ;;
    --update) MODE="update" ;;
    -h|--help)
      sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) TARGET="$arg" ;;
  esac
done
TARGET="${TARGET:-$(pwd)}"

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
outdated=0
updated=0
while IFS= read -r src; do
  rel="${src#"$SCAFFOLD_DIR"/}"
  dest="$TARGET/$rel"

  if [ ! -e "$dest" ]; then
    if [ "$MODE" = "check" ]; then
      echo "  ○ absent : $rel"
      outdated=$((outdated + 1))
    else
      mkdir -p "$(dirname "$dest")"
      cp "$src" "$dest"
      echo "  ✅ copié : $rel"
      copied=$((copied + 1))
    fi
    continue
  fi

  # Fichier que TU édites : il porte un TODO(argus) dans la source du plugin.
  if grep -q 'TODO(argus)' "$src"; then
    [ "$MODE" = "install" ] && echo "  ⏭️  à toi, conservé : $rel" || true
    skipped=$((skipped + 1))
    continue
  fi

  # Fichier à FUSIONNER dans un homonyme du projet (.gitignore, snippet npm) :
  # il ne remplace rien et ne se compare à rien. Reconnu à ce que la source le
  # dit d'elle-même, plutôt qu'à une liste de noms qui vieillirait.
  if grep -qi 'fusionn' "$src"; then
    [ "$MODE" = "install" ] && echo "  ⏭️  à fusionner à la main : $rel" || true
    skipped=$((skipped + 1))
    continue
  fi

  # Fichier de cadre : comparable, donc remplaçable.
  if cmp -s "$src" "$dest"; then
    skipped=$((skipped + 1))
    continue
  fi
  case "$MODE" in
    update) cp "$src" "$dest"; echo "  ⬆️  mis à jour : $rel"; updated=$((updated + 1)) ;;
    *)      echo "  ⚠️  en retard sur le plugin : $rel"; outdated=$((outdated + 1)) ;;
  esac
done < <(find "$SCAFFOLD_DIR" -type f)

if [ "$MODE" != "check" ]; then
  # Dossiers d'artefacts et de références visuelles.
  mkdir -p "$TARGET/argus-mobile-report" "$TARGET/.maestro/_baselines"
fi

echo
case "$MODE" in
  check)
    if [ "$outdated" -gt 0 ]; then
      echo "✖ $outdated fichier(s) de cadre en retard ou absent(s). Rejoue avec --update."
      exit 1
    fi
    echo "✔ tout le cadre est à jour ($skipped fichier(s) conformes ou à toi)."
    exit 0 ;;
  update)
    echo "Résumé : $copied copié(s), $updated mis à jour, $skipped conservé(s)."
    [ "$updated" -gt 0 ] && echo "  Relis le diff : ces fichiers ne portent pas tes réglages, mais ta CI les exécute." || true
    ;;
  *)
    echo "Résumé : $copied copié(s), $skipped conservé(s)."
    [ "$outdated" -gt 0 ] && echo "  ⚠️  $outdated fichier(s) de cadre en retard sur le plugin — voir --update." || true
    ;;
esac
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
echo "  4. Vérifie la configuration :   node scripts/argus/config.mjs"
echo "  5. Construis le binaire :       flutter build apk --debug"
echo "  6. Étage 1, sans device :       make argus-guards"
echo "  7. Étage 2, sur device :        make argus-run"
echo "  8. Références visuelles :       make argus-baselines   # 1re fois"
echo "  9. Rapport HTML :               make argus-report"
echo
echo "  Fusionne aussi le .gitignore fourni dans celui du projet."
