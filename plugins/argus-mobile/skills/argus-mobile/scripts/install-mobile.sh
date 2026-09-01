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
# chaque fichier du scaffold se déclare, dans ses 20 premières lignes :
#   « ARGUS:OWNED »  → il T'APPARTIENT (config, ancres, parcours métier) :
#                      jamais écrasé, jamais comparé.
#   « ARGUS:MERGE »  → à FUSIONNER dans un homonyme du projet (.gitignore,
#                      snippet npm) : jamais écrasé, jamais comparé.
#   sinon            → du CADRE (scripts, suites de test, CI) : comparable et
#                      remplaçable par --update.
# Une liste de noms écrite à la main aurait vieilli au premier fichier ajouté.
#
# ⚠️ Les marqueurs sont RÉSERVÉS et bornés à l'en-tête, pour qu'un fichier
# puisse en PARLER sans être classé par ce qu'il dit. Les repérer par des mots
# courants a coûté deux fichiers mal classés en silence : le scanner MASVS
# parlait du « manifeste fusionné », et la doc du harness citait le marqueur de
# propriété en l'expliquant. Ni l'un ni l'autre n'était plus mis à jour.
#
# ⚠️ Un fichier de CADRE n'est comparé que si la copie locale porte la
# signature d'Argus : un homonyme du projet — Makefile, typiquement — n'est ni
# écrasé par --update, ni compté « en retard » par --check.
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
      # Dérivé : tout l'en-tête, jusqu'à la première ligne de code. Une plage
      # de lignes figée se serait tue dès qu'on ajoute un paragraphe au-dessus.
      sed -n '2,/^[^#]/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'
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

# ── Fusion idempotente d'un bloc dans un fichier de l'hôte ──────────────────
# Le bloc est délimité et signé : on ne relit et ne remplace que lui. Sans ces
# bornes, il n'y a pas de fusion possible — seulement un ajout, qui se répète à
# chaque exécution.
BLOC_DEBUT='# ── Argus Mobile ── début du bloc géré (ne pas éditer à la main) ──'
BLOC_FIN='# ── Argus Mobile ── fin du bloc géré ──'

merge_gitignore() {
  src="$1"; dest="$2"
  # Le corps : la source sans son en-tête de marqueurs, qui ne concerne que
  # l'installeur et n'aurait aucun sens dans le fichier de l'hôte.
  corps="$(sed '1,2d' "$src")"
  nouveau="$(printf '%s\n%s\n%s\n' "$BLOC_DEBUT" "$corps" "$BLOC_FIN")"

  if grep -qF "$BLOC_DEBUT" "$dest"; then
    ancien="$(awk -v d="$BLOC_DEBUT" -v f="$BLOC_FIN" 'index($0,d){p=1} p{print} index($0,f){p=0}' "$dest")"
    if [ "$ancien" = "$nouveau" ]; then
      return 1
    fi
    # Remplacement en place : on écrit dans un temporaire puis on renomme, parce
    # qu'un script d'édition qui échoue à mi-chemin est plus dangereux qu'un
    # script qui ne tourne pas.
    tmp="$(mktemp)"
    awk -v d="$BLOC_DEBUT" -v f="$BLOC_FIN" 'index($0,d){p=1;next} index($0,f){p=0;next} !p{print}' "$dest" > "$tmp"
    printf '%s\n' "$nouveau" >> "$tmp"
    mv "$tmp" "$dest"
    echo "  🔁 bloc .gitignore mis à jour (le reste du fichier est intact)"
    return 0
  fi

  printf '\n%s\n' "$nouveau" >> "$dest"
  echo "  ➕ bloc .gitignore ajouté à la fin (le reste du fichier est intact)"
  return 0
}

copied=0
skipped=0
merged=0
outdated=0
updated=0
foreign=0
foreign_list=''
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

  # Fichier que TU édites : la source se déclare ARGUS:OWNED en en-tête.
  if head -20 "$src" | grep -qF 'ARGUS:OWNED'; then
    [ "$MODE" = "install" ] && echo "  ⏭️  à toi, conservé : $rel" || true
    skipped=$((skipped + 1))
    continue
  fi

  # Fichier à FUSIONNER dans un homonyme du projet (.gitignore, snippet npm) :
  # il ne remplace rien et ne se compare à rien.
  #
  # Le .gitignore fait exception, et pour une raison précise : « fusionne-le à la
  # main » était prescrit sans dire OÙ ni comment ne pas dupliquer, si bien que
  # chaque réinstallation ajoutait les mêmes lignes une fois de plus — ou, plus
  # souvent, personne ne le faisait et les rapports partaient dans le dépôt.
  # On l'écrit donc, mais dans un BLOC DÉLIMITÉ qui porte notre signature : ce
  # bloc est le seul endroit qu'on relit et qu'on remplace, le reste du fichier
  # n'est jamais touché.
  if head -20 "$src" | grep -qF 'ARGUS:MERGE'; then
    if [ "$(basename "$rel")" = ".gitignore" ] && [ "$MODE" != "check" ]; then
      merge_gitignore "$src" "$dest" && merged=$((merged + 1)) || true
    else
      [ "$MODE" = "install" ] && echo "  ⏭️  à fusionner à la main : $rel" || true
    fi
    skipped=$((skipped + 1))
    continue
  fi

  # Fichier de CADRE — mais est-ce bien NOTRE copie ? Un projet peut avoir son
  # propre fichier au même nom (Makefile). L'écraser sous prétexte qu'il diffère
  # du nôtre détruirait son travail, et le compter « en retard » ferait rougir
  # sa CI pour un fichier qui ne nous appartient pas.
  # La signature est dérivée de la source : sa première ligne qui se nomme. Une
  # source sans signature ne permet pas de trancher — on garde alors l'ancien
  # comportement plutôt que d'inventer un verdict.
  signature="$(grep -m1 -i 'argus' "$src" || true)"
  if [ -n "$signature" ] && ! grep -qF "$signature" "$dest"; then
    echo "  ⏭️  présent chez toi, pas d'origine Argus : $rel"
    foreign=$((foreign + 1))
    foreign_list="$foreign_list $rel"
    continue
  fi

  # Notre copie, donc comparable et remplaçable.
  if cmp -s "$src" "$dest"; then
    skipped=$((skipped + 1))
    continue
  fi
  case "$MODE" in
    update) cp "$src" "$dest"; echo "  ⬆️  mis à jour : $rel"; updated=$((updated + 1)) ;;
    *)      echo "  ⚠️  en retard sur le plugin : $rel"; outdated=$((outdated + 1)) ;;
  esac
done < <(find "$SCAFFOLD_DIR" -type f)

# ── Harnais d'étage 1 d'avant la séparation ─────────────────────────────────
# `test/argus/harness.dart` t'appartient, donc il n'est jamais remplacé. Tant
# qu'il portait AUSSI les types (`class ArgusScreen`), les suites que --update
# livre entrent en collision avec lui : le même nom défini deux fois, plus rien
# ne compile. Le dire ICI, avant que ça arrive, plutôt que de laisser lire une
# erreur d'analyse qui ne nomme pas sa cause.
LEGACY_HARNESS="$TARGET/test/argus/harness.dart"
legacy=0
if [ -f "$LEGACY_HARNESS" ] && grep -q '^class ArgusScreen' "$LEGACY_HARNESS"; then
  legacy=1
  echo
  echo "  ⚠️  test/argus/harness.dart date d'avant la séparation : il définit encore"
  echo "      « class ArgusScreen », que argus_types.dart porte désormais."
  echo "      Les suites ne compileront pas tant que les deux coexistent."
  echo "      Migration, en trois gestes qui ne perdent rien :"
  echo "        1. garde de ton harness.dart les blocs TODO(argus) que tu as remplis"
  echo "           (argusScreens, argusFonts, argusFontFamily, argusTheme…) ;"
  echo "        2. remplace le reste par le nouveau harness.dart du scaffold ;"
  echo "        3. remets tes valeurs dedans. Rien d'autre n'a changé de nom."
fi

if [ "$MODE" != "check" ]; then
  # Dossiers d'artefacts et de références visuelles.
  mkdir -p "$TARGET/argus-mobile-report" "$TARGET/.maestro/_baselines"
fi

echo
case "$MODE" in
  check)
    [ "$foreign" -gt 0 ] && echo "  ⚠️  pas d'origine Argus, donc laissé(s) intact(s) :$foreign_list" || true
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
# ⚠️ `xcrun` MANQUAIT à cette liste alors que `config.mjs` le vérifie, lui : un
# projet iOS voyait donc « ✔ adb » et rien sur l'outil dont il dépend vraiment.
for tool in node flutter maestro adb xcrun osv-scanner; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "  ✔ $tool"
  else
    echo "  ○ $tool absent"
  fi
done
if [ "$foreign" -gt 0 ]; then
  echo "⚠️  Ces fichiers existaient déjà chez toi et ne viennent pas d'Argus :"
  echo "  $foreign_list"
  echo "   Ils sont intacts — et le harness n'en profite donc pas. Recopie ce"
  echo "   dont tu as besoin depuis le scaffold."
  echo
fi

# ── Ce qui est À TOI, dérivé plutôt qu'annoncé ──────────────────────────────
# « argus.mobile.yaml est le SEUL fichier à éditer » était faux, et le dire deux
# lignes avant de nommer harness.dart n'aidait personne. La liste se dérive des
# marqueurs, donc elle ne peut pas vieillir.
# ⚠️ LE SCAFFOLD **ET** LA CIBLE. Cette liste n'itérait que le scaffold, donc un
# fichier que TU crées — des doubles de test, un helper — n'y apparaissait jamais,
# quel que soit son marqueur. Le SKILL promettait pourtant l'inverse (« déclare-le
# ARGUS:OWNED, sinon il n'apparaît pas dans cette liste ») : une promesse écrite
# dans la doc que le code ne tenait pas, et que rien ne mesurait. Vécu sur un
# projet réel — `argus_fakes.dart` portait le marqueur et restait invisible.
#
# La CIBLE est parcourue d'abord : quand les deux portent le même chemin relatif,
# c'est la copie posée chez l'hôte qui fait foi, puisque c'est elle qu'on ouvrira.
OWNED_LIST="$(mktemp)"
trap 'rm -f "$OWNED_LIST"' EXIT
for d in "$TARGET/test/argus" "$TARGET/.maestro"; do
  [ -d "$d" ] || continue
  find "$d" -type f -print0 | while IFS= read -r -d '' f; do
    printf '%s\t%s\n' "${f#"$TARGET"/}" "$f"
  done >> "$OWNED_LIST"
done
find "$SCAFFOLD_DIR" -type f -print0 | while IFS= read -r -d '' f; do
  printf '%s\t%s\n' "${f#"$SCAFFOLD_DIR"/}" "$f"
done >> "$OWNED_LIST"

echo "Les fichiers qui t'appartiennent (jamais écrasés, jamais mis à jour) :"
while IFS= read -r src; do
  head -20 "$src" | grep -qF 'ARGUS:OWNED' || continue
  rel="${src#"$SCAFFOLD_DIR"/}"; rel="${rel#"$TARGET"/}"
  # ⚠️ Le deux-points est ce qui sépare une DIRECTIVE d'une MENTION. Sans lui,
  # ce compteur additionnait la ligne de `argus.mobile.yaml` qui EXPLIQUE le
  # mécanisme : ce fichier rapportait « 1 TODO à traiter » pour l'éternité, même
  # entièrement rempli. C'est le défaut que l'en-tête de ce script décrit pour
  # ARGUS:OWNED — un fichier doit pouvoir PARLER d'un marqueur sans être compté
  # par ce qu'il en dit — et dont la protection n'avait pas été étendue ici.
  # ⚠️ `grep -c` IMPRIME « 0 » **ET** SORT EN 1 quand il ne compte rien. Le
  # `|| echo 0` en ajoutait donc un second, `restant` valait « 0\n0 », et le test
  # numérique de la ligne suivante levait « integer expression expected » — une
  # fois par fichier OWNED sans TODO, neuf fois sur un projet réel. Le compte
  # restait juste, seule la sortie devenait illisible, et rien n'échouait : c'est
  # ce qui lui a permis de traverser six runs en aveugle.
  #
  # `|| true` garde ce que grep a imprimé ; le `:-0` couvre le seul cas où il
  # n'imprime rien (fichier absent, exit 2).
  # ⚠️ ON NE COMPTE PAS LES LIGNES DE DOCUMENTATION. Un dartdoc `///` qui commence
  # par le marqueur EXPLIQUE quoi mettre dans le champ d'en dessous : rempli, il
  # reste — c'est de la doc — et le fichier rapportait « 5 TODO à traiter » pour
  # l'éternité. Le marqueur appartient à la ligne qu'on ÉDITE, jamais à celle qui
  # la décrit ; c'est le même principe que pour ARGUS:OWNED, un fichier doit
  # pouvoir PARLER d'un marqueur sans être compté par ce qu'il en dit.
  #
  # Deuxième défaut de ce compteur en deux runs (cf. le `|| echo 0` plus haut) :
  # il compte quelque chose de simple, et se trompe sur ce que « quelque chose »
  # veut dire.
  # ⚠️ On EXCLUT les lignes de dartdoc, pas tous les commentaires : le marqueur
  # est légitime en fin de ligne de code (`final x = []; // TODO(argus): …`), et
  # un premier motif `^[^/]*TODO` avait fait tomber le compte à zéro sur un
  # fichier qui en portait quatre. Deux instruments successifs pour un compteur
  # de quatre lignes.
  # ⚠️ UN TODO SANS OBJET DOIT POUVOIR SE FERMER. Deux flows livrés n'ont rien à
  # recevoir sur certains projets (pas d'authentification, rien qui flotte au-
  # dessus des écrans), et l'inventaire continuait d'imprimer « 1 TODO(argus) à
  # traiter » pour eux — indéfiniment, sans moyen d'écrire que c'est traité. Le
  # seul inventaire que la personne suivante lira affichait donc du travail
  # inachevé qui était achevé. `TODO(argus): SANS OBJET — <raison>` le ferme.
  restant="$(grep -v '^[[:space:]]*///' "$TARGET/$rel" 2>/dev/null | grep 'TODO(argus):' | grep -cv 'TODO(argus): *SANS OBJET' || true)"
  restant="${restant:-0}"
  if [ "$restant" -gt 0 ]; then
    echo "  ✏️  $rel   ($restant TODO(argus) à traiter)"
  else
    echo "  ✔  $rel"
  fi
# ⚠️ `-t$'\\t'` et non `-t"\\t"` : le second passe un antislash suivi d'un « t »,
# pas une tabulation — la déduplication se faisait alors sur le mauvais champ et
# la liste tombait de dix entrées à deux, sans une erreur.
done < <(sort -u -t$'\t' -k1,1 "$OWNED_LIST" | sort | cut -f2-)
echo

echo "Prochaines étapes :"
echo "  1. Édite argus.mobile.yaml (identifiants d'app, devices, écrans, seuils)."
echo "  2. Instrumente l'app : Semantics(identifier: 'home_root', child: …) sur"
echo "     chaque écran clé. ⚠️ Les Key Flutter ne sont PAS visibles par Maestro."
echo "  3. Installe Maestro si besoin :"
echo "       curl -fsSL \"https://get.maestro.mobile.dev\" | bash    # Java 17+ requis"
echo "  4. Vérifie la configuration :   node scripts/argus/config.mjs"
echo "  5. Construis le binaire :       make argus-build   # fvm si .fvmrc"
echo "  6. Étage 1, sans device :       make argus-guards"
echo "  7. Étage 2, sur device :        make argus-run"
echo "  8. Références visuelles :       make argus-baselines   # 1re fois"
echo "  9. Rapport HTML :               make argus-report"
echo
if [ "$legacy" -eq 1 ]; then
  echo "  ⚠️  AVANT TOUT : migre test/argus/harness.dart (voir plus haut)."
fi
echo "  Le .gitignore a reçu un bloc délimité et signé — relis-le, il est à toi."
