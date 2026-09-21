#!/usr/bin/env bash
# Argus Mobile — copie idempotente du scaffold Maestro dans un projet Flutter.
#
# Usage: bash install-mobile.sh [TARGET_DIR] [OPTION]
#
#   (défaut)   installe ce qui manque, ne touche à RIEN d'existant.
#   --check    ne écrit rien ; signale les fichiers de CADRE en retard sur le
#              plugin, et sort en 1 s'il y en a. À câbler en CI.
#   --update   met à jour les fichiers de CADRE, sans jamais toucher aux
#              fichiers que tu édites.
#   --uninstall
#              retire les fichiers de CADRE que ce plugin a posés et qui
#              portent encore sa signature. Ce qui est à toi reste, et la
#              commande énumère ce qu'elle garde.
#
# Et deux gestes qui ne concernent pas un projet mais la machine :
#
#   --global   installe la commande `argus-mobile` une fois pour toutes
#              (~/.argus-mobile, plus un lien dans ~/.local/bin). Le scaffold,
#              lui, continue d'être posé projet par projet : un runner de CI
#              n'a aucune installation globale, donc un projet dont le moteur
#              vivrait ailleurs n'aurait plus rien à appeler en intégration.
#   --uninstall-global
#              retire cette installation et le lien — et seulement eux : un
#              `argus-mobile` qui n'est pas le nôtre reste où il est.
#
# Les dossiers se changent par ARGUS_MOBILE_HOME et ARGUS_MOBILE_BIN.
# Un drapeau inconnu arrête la commande : rien n'est touché.
#
# LA FRONTIÈRE EST DÉRIVÉE DE LA SOURCE, pas d'une liste tenue à la main —
# chaque fichier du scaffold se déclare, dans ses 20 premières lignes :
#   « ARGUS:OWNED »  → il T'APPARTIENT (config, ancres, parcours métier) :
#                      jamais écrasé, jamais comparé.
#   « ARGUS:PURGE »  → s'AJOUTE à OWNED, et ne change rien à --update : à toi
#                      tant qu'Argus est là, RETIRÉ quand il part. Pour ce qui
#                      ne décrit pas ton application mais ce que nos gardes ont
#                      relevé sur elle — un relevé figé ne survit pas au harnais
#                      qui l'a produit, et la désinstallation le dit déjà : elle
#                      promet de garder « la config, les ancres, les parcours,
#                      les références visuelles et les rapports », pas la dette.
#   « ARGUS:MERGE »  → à FUSIONNER dans un homonyme du projet (.gitignore,
#                      snippet npm) : jamais écrasé, jamais comparé.
#   « ARGUS:CADRE »  → au PLUGIN (scripts, suites de test, CI) : comparable et
#                      remplaçable par --update.
#   sinon            → traité comme du cadre, reconnu par la première ligne qui
#                      se nomme — le repli des copies posées avant le marqueur.
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

# ── Installation GLOBALE : la commande une fois, le cadre par projet ────────
# Ce qui vit ici est le PLUGIN — le scaffold source, l'installeur, le lanceur —
# jamais les données d'un projet. La maison reproduit exactement la structure du
# skill (`assets/scaffold-mobile`, `scripts/`), ce qui n'est pas cosmétique :
# l'installeur copié y retrouve son scaffold par le même chemin relatif, donc il
# n'a pas une ligne à changer selon l'endroit d'où il tourne.
#
# ⚠️ Le moteur reste COPIÉ dans chaque projet, et c'est une décision, pas un
# oubli : un runner de CI n'a aucune installation globale, donc un projet dont
# le moteur vivrait ici n'aurait plus rien à appeler en intégration. Le projet et
# sa CI exécutent ainsi le même moteur, à la même version.
install_global() {
  local home="${ARGUS_MOBILE_HOME:-$HOME/.argus-mobile}"
  local bindir="${ARGUS_MOBILE_BIN:-$HOME/.local/bin}"
  local lien="$bindir/argus-mobile"
  local lanceur="$SCAFFOLD_DIR/scripts/argus/argus-mobile.mjs"

  [ -f "$lanceur" ] || { echo "❌ Lanceur introuvable : $lanceur" >&2; exit 1; }

  # ⚠️ On ne remplace QUE notre propre copie. Un `argus-mobile` déjà présent qui
  # ne porte pas la signature appartient à quelqu'un d'autre : l'écraser
  # détruirait son travail, et c'est le genre de geste qu'on ne rattrape pas.
  if [ -e "$lien" ] && ! head -3 "$lien" 2>/dev/null | grep -qF 'ARGUS:CADRE'; then
    echo "❌ $lien existe déjà et ne porte pas la signature d'Argus." >&2
    echo "   Rien n'a été touché. Déplace-le, ou désigne un autre dossier par" >&2
    echo "   ARGUS_MOBILE_BIN." >&2
    exit 1
  fi
  if [ -d "$home" ] && [ ! -e "$home/bin/argus-mobile" ] \
     && [ -n "$(command ls -A "$home" 2>/dev/null)" ]; then
    echo "❌ $home existe, n'est pas vide, et ne porte aucune installation Argus." >&2
    echo "   Rien n'a été touché. Désigne un autre dossier par ARGUS_MOBILE_HOME." >&2
    exit 1
  fi

  mkdir -p "$home/assets" "$home/scripts" "$home/bin" "$bindir"
  rm -rf "$home/assets/scaffold-mobile"
  cp -R "$SCAFFOLD_DIR" "$home/assets/scaffold-mobile"
  cp "${BASH_SOURCE[0]}" "$home/scripts/install-mobile.sh"
  cp "$lanceur" "$home/bin/argus-mobile"
  chmod +x "$home/bin/argus-mobile" "$home/scripts/install-mobile.sh"
  ln -sf "$home/bin/argus-mobile" "$lien"

  echo "✅ Argus Mobile est installé globalement."
  echo "   maison   : $home"
  echo "   commande : $lien"
  case ":$PATH:" in
    *":$bindir:"*) echo "   PATH     : $bindir y figure déjà." ;;
    *) echo "   ⚠️  $bindir n'est PAS dans ton PATH : la commande ne sera pas trouvée."
       echo "       Ajoute cette ligne à ton shell, puis rouvre-le :"
       echo "         export PATH=\"$bindir:\$PATH\"" ;;
  esac
  echo
  echo "   Dans un projet où le scaffold est posé :"
  echo "     argus-mobile --help        ce que le moteur du projet expose"
  echo "     argus-mobile run --tags=smoke"
  echo
  echo "   Le scaffold, lui, se pose toujours par :"
  echo "     bash $home/scripts/install-mobile.sh <projet>"
}

# ── Désinstallation GLOBALE : la maison et la commande ──────────────────────
# Même règle, même raison : on ne retire que ce qu'on reconnaît. Un
# `argus-mobile` qui n'est pas le nôtre reste où il est.
uninstall_global() {
  local home="${ARGUS_MOBILE_HOME:-$HOME/.argus-mobile}"
  local bindir="${ARGUS_MOBILE_BIN:-$HOME/.local/bin}"
  local lien="$bindir/argus-mobile"
  local fait=0

  if [ -e "$lien" ]; then
    if head -3 "$lien" 2>/dev/null | grep -qF 'ARGUS:CADRE'; then
      rm -f "$lien"; echo "  🗑️  retiré : $lien"; fait=1
    else
      echo "  ⏭️  gardé, pas d'origine Argus : $lien"
    fi
  fi
  if [ -d "$home" ]; then
    if [ -e "$home/bin/argus-mobile" ]; then
      rm -rf "$home"; echo "  🗑️  retiré : $home"; fait=1
    else
      echo "  ⏭️  gardé, aucune installation Argus dedans : $home"
    fi
  fi
  [ "$fait" -eq 1 ] || echo "  Rien à retirer : aucune installation globale trouvée."
  echo
  echo "  Les projets déjà installés ne sont pas touchés : leur cadre leur"
  echo "  appartient, et il continue de tourner sans la commande globale."
}
MODE="install"
TARGET=""
GLOBAL=0
UNGLOBAL=0
for arg in "$@"; do
  case "$arg" in
    --check)  MODE="check" ;;
    --update) MODE="update" ;;
    --global) GLOBAL=1 ;;
    --uninstall) MODE="uninstall" ;;
    --uninstall-global) UNGLOBAL=1 ;;
    -h|--help)
      # Dérivé : tout l'en-tête, jusqu'à la première ligne de code. Une plage
      # de lignes figée se serait tue dès qu'on ajoute un paragraphe au-dessus.
      sed -n '2,/^[^#]/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0 ;;
    -*) echo "❌ option inconnue : $arg" >&2
        echo "   Connues : --check, --update, --uninstall, --global,
             --uninstall-global, --help." >&2
        echo "   Rien n'a été touché." >&2
        exit 2 ;;
    *) TARGET="$arg" ;;
  esac
done
if [ "$GLOBAL" -eq 1 ]; then
  [ "$MODE" = "install" ] || {
    echo "❌ --global ne se combine pas avec --$MODE : l'un pose la commande, l'autre" >&2
    echo "   agit sur un projet. Rien n'a été touché." >&2
    exit 2; }
  install_global
  exit 0
fi
if [ "$UNGLOBAL" -eq 1 ]; then
  echo "🗑️  Désinstallation globale d'Argus Mobile"
  echo
  uninstall_global
  exit 0
fi
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

# ── Le suffixe qui MÉMORISE ce qu'aucun retrait ne peut déduire ─────────────
# L'insertion écrit `\n` DEVANT le bloc. Quand le fichier de l'hôte finit déjà
# par un saut de ligne, ce `\n` crée une ligne vide, que le retrait reprend.
# Quand il n'en a pas, le MÊME `\n` termine sa dernière ligne : il ne crée
# aucune ligne vide, donc le retrait n'a rien à reprendre et le fichier garde un
# octet de plus. Mesuré sur un vrai projet : 1 662 → 1 663, et `git diff` le
# disait en toutes lettres — `\ No newline at end of file`.
#
# ⚠️ L'information « l'hôte en avait-il un ? » N'EXISTE PLUS une fois le bloc
# inséré : aucun retrait, si soigneux soit-il, ne peut la déduire. Donc
# l'insertion l'INSCRIT, sur la seule ligne qui nous appartienne — notre borne
# de fin. Le marqueur est RÉSERVÉ (jamais un mot de la langue) et il vit en
# SUFFIXE : les deux seules lectures de cette borne cherchent une sous-chaîne
# (`index()` en awk, `grep -qF`), donc elles le traversent sans le voir.
BLOC_FIN_SANS_SAUT=' ARGUS:NO-EOL'

# ── Les dossiers que cette installation crée SANS y livrer de fichier ───────
# Ils naissent vides et se remplissent à l'exécution. Une seule déclaration,
# lue par le `mkdir -p` qui les pose ET par le `rmdir` qui les reprend : écrite
# deux fois, elle divergerait à la première retouche — et l'oubli serait muet,
# un dossier vide n'étant suivi par aucun git.
DOSSIERS_CREES=(argus-mobile-report .maestro/_baselines)

# ── Retirer NOTRE bloc d'un fichier de l'hôte, la ligne vide comprise ───────
# ⚠️ L'insertion pose `\n` DEVANT le bloc ; un retrait qui ne reprend pas cette
# ligne vide laisse le fichier de l'hôte MODIFIÉ — `git status` le montre changé
# après une désinstallation censée ne rien laisser, et c'est le genre de diff
# qu'on committe sans le voir. Mesuré sur un projet jetable : 25 octets avant
# installation, 26 après désinstallation.
# Les deux gestes partagent cette fonction pour qu'ils ne puissent plus diverger :
# la mise à jour réinsère ensuite le bloc avec sa ligne vide, donc le fichier
# reste identique à lui-même quand le bloc n'a pas changé de place.
retirer_bloc_gitignore() {
  local dest="$1" tmp sansSaut=0
  # C'est le BLOC qui dit si l'insertion a dû terminer la dernière ligne de
  # l'hôte : l'insertion l'y a écrit, et plus rien d'autre ne peut le savoir.
  grep -qF "$BLOC_FIN$BLOC_FIN_SANS_SAUT" "$dest" && sansSaut=1
  tmp="$(mktemp)"
  # Une ligne vide n'est imprimée qu'une fois qu'on sait ce qui la suit : si
  # c'est notre borne d'ouverture, elle est à nous et elle part avec le bloc.
  # Et la DERNIÈRE ligne n'est imprimée qu'à la toute fin, parce qu'elle seule
  # peut avoir à sortir sans son saut de ligne : `emettre` retient donc
  # toujours une ligne d'avance.
  awk -v d="$BLOC_DEBUT" -v f="$BLOC_FIN" -v sansSaut="$sansSaut" '
    function emettre(s) { if (aEcrire) printf "%s\n", tampon; tampon = s; aEcrire = 1 }
    index($0,d) { p=1; enAttente=0; next }
    index($0,f) { p=0; next }
    p           { next }
    enAttente   { emettre(""); enAttente=0 }
    $0 == ""    { enAttente=1; next }
                { emettre($0) }
    END         { if (enAttente) emettre("")
                  if (aEcrire) { if (sansSaut == 1) printf "%s", tampon
                                 else               printf "%s\n", tampon } }
  ' "$dest" > "$tmp"
  mv "$tmp" "$dest"
}

# ── Poser le bloc à la fin, en mémorisant ce que l'insertion aura changé ────
# Les deux chemins qui posent le bloc — l'ajout et la mise à jour — passent par
# ici, sans quoi l'un des deux oublierait le marqueur et le retrait rendrait un
# fichier différent selon le geste qui l'a écrit.
ajouter_bloc_gitignore() {
  local dest="$1" bloc="$2" marque=''
  # Un fichier VIDE n'a pas de dernière ligne à terminer : le `\n` y crée une
  # ligne vide comme ailleurs, et le retrait la reprend. Rien à mémoriser.
  # La substitution mange les sauts de ligne finaux : elle rend vide quand le
  # dernier octet en est un, et le dernier caractère sinon.
  if [ -s "$dest" ] && [ -n "$(tail -c 1 "$dest")" ]; then
    marque="$BLOC_FIN_SANS_SAUT"
  fi
  printf '\n%s%s\n' "$bloc" "$marque" >> "$dest"
}

merge_gitignore() {
  src="$1"; dest="$2"
  # Le corps : la source sans son en-tête de marqueurs, qui ne concerne que
  # l'installeur et n'aurait aucun sens dans le fichier de l'hôte.
  corps="$(sed '1,2d' "$src")"
  nouveau="$(printf '%s\n%s\n%s\n' "$BLOC_DEBUT" "$corps" "$BLOC_FIN")"

  if grep -qF "$BLOC_DEBUT" "$dest"; then
    ancien="$(awk -v d="$BLOC_DEBUT" -v f="$BLOC_FIN" 'index($0,d){p=1} p{print} index($0,f){p=0}' "$dest")"
    # Le marqueur ne fait pas partie du bloc COMPARÉ : il décrit le fichier de
    # l'hôte, pas notre contenu. Le laisser dans la comparaison rendrait la
    # mise à jour non idempotente — « bloc mis à jour » à chaque exécution, sur
    # tout projet dont le `.gitignore` n'a pas de saut de ligne final.
    if [ "${ancien%"$BLOC_FIN_SANS_SAUT"}" = "$nouveau" ]; then
      return 1
    fi
    # Remplacement en place : on écrit dans un temporaire puis on renomme, parce
    # qu'un script d'édition qui échoue à mi-chemin est plus dangereux qu'un
    # script qui ne tourne pas.
    retirer_bloc_gitignore "$dest"
    ajouter_bloc_gitignore "$dest" "$nouveau"
    echo "  🔁 bloc .gitignore mis à jour (le reste du fichier est intact)"
    return 0
  fi

  ajouter_bloc_gitignore "$dest" "$nouveau"
  echo "  ➕ bloc .gitignore ajouté à la fin (le reste du fichier est intact)"
  return 0
}

# ── Désinstallation : le SEUL geste qui supprime ────────────────────────────
# Donc le seul qu'on ne rattrape pas. Retirer le scaffold en bloc effacerait le
# harnais rempli, les parcours écrits et la config — des jours de travail qui
# n'ont jamais appartenu au plugin. Ne part d'ici que du CADRE dont la copie
# locale porte encore la signature, et tout ce qui reste est ÉNUMÉRÉ : une
# suppression muette laisse celui qui la lance sans moyen de savoir ce qu'il a
# perdu.
#
# ⚠️ AUCUN REPLI DE PROSE ICI, contrairement à --update. Là-bas, ne pas
# reconnaître une copie ancienne la fige à jamais ; ici, la reconnaître à tort
# la DÉTRUIT. Les deux erreurs n'ont pas le même prix, donc pas le même seuil :
# un fichier gardé de trop se supprime à la main, l'inverse ne se répare pas.
uninstall_project() {
  local target="$1"
  local retires=0 gardes=0
  local liste=''

  [ -d "$target" ] || { echo "❌ Projet introuvable : $target" >&2; exit 1; }

  echo "🗑️  Désinstallation du cadre Argus Mobile dans $target"
  echo
  while IFS= read -r src; do
    local rel dest
    rel="${src#"$SCAFFOLD_DIR"/}"
    dest="$target/$rel"
    [ -e "$dest" ] || continue

    # 552 · PURGE s'ajoute à OWNED et se lit AVANT lui, sinon OWNED gagne et la
    # branche est morte. Le marqueur se cherche dans le GABARIT et non dans la
    # copie : un hôte installé avant ce jour ne l'a pas, et comme `--update`
    # n'écrase jamais un OWNED, il ne l'aurait JAMAIS reçu — le remède n'aurait
    # atteint personne. Mais on n'efface que ce qui porte notre signature, pour
    # la même raison que le cadre : un homonyme du projet reste où il est.
    if head -20 "$src" | grep -qF 'ARGUS:PURGE'; then
      if head -20 "$dest" | grep -qF 'ARGUS:'; then
        rm -f "$dest"
        echo "  🗑️  retiré : $rel (un relevé de dette ne survit pas aux gardes qui l'ont produit)"
        retires=$((retires + 1))
      else
        liste="$liste  ⏭️  pas d'origine Argus   : $rel"$'\n'; gardes=$((gardes + 1))
      fi
      continue
    fi
    if head -20 "$src" | grep -qF 'ARGUS:OWNED'; then
      liste="$liste  ⏭️  à toi, gardé          : $rel"$'\n'; gardes=$((gardes + 1)); continue
    fi
    if head -20 "$src" | grep -qF 'ARGUS:MERGE'; then
      # Le fichier est au projet ; seul NOTRE bloc s'en va.
      if [ "$(basename "$rel")" = ".gitignore" ] && grep -qF "$BLOC_DEBUT" "$dest"; then
        retirer_bloc_gitignore "$dest"
        echo "  🔁 bloc retiré du .gitignore (le reste du fichier est intact)"
        retires=$((retires + 1))
      elif cmp -s "$src" "$dest"; then
        # Un gabarit que le projet n'a jamais touché est resté au plugin : le
        # laisser, c'est laisser derrière soi un fichier qui parle d'un outil
        # désinstallé. Mais dès qu'il DIFFÈRE, il porte une trace de quelqu'un,
        # et il reste — garder de trop se répare à la main, l'inverse non.
        rm -f "$dest"
        echo "  🗑️  retiré : $rel (gabarit jamais modifié)"
        retires=$((retires + 1))
      else
        liste="$liste  ⏭️  à fusionner, gardé    : $rel"$'\n'; gardes=$((gardes + 1))
      fi
      continue
    fi

    if head -20 "$dest" | grep -qF 'ARGUS:CADRE'; then
      rm -f "$dest"
      echo "  🗑️  retiré : $rel"
      retires=$((retires + 1))
    else
      liste="$liste  ⏭️  pas d'origine Argus   : $rel"$'\n'; gardes=$((gardes + 1))
    fi
  done < <(find "$SCAFFOLD_DIR" -type f)

  # Les dossiers devenus vides, et EUX SEULS : rmdir refuse tout le reste, ce
  # qui protège les références visuelles et les rapports déjà produits sans
  # qu'on ait à les nommer.
  #
  # ⚠️ MAIS LA LISTE DES CANDIDATS ÉTAIT ÉCRITE À LA MAIN, et elle a vieilli —
  # exactement ce que le commentaire d'origine disait vouloir éviter. Elle
  # ignorait `.github/workflows`, où l'installeur pose pourtant son workflow :
  # ce dossier restait VIDE après désinstallation, et git ne suivant pas les
  # dossiers vides, le résidu était invisible à `git status`.
  #
  # Elle se dérive donc des DEUX seules façons dont cette installation crée un
  # dossier : les parents des fichiers qu'elle livre, et ceux qu'elle crée
  # elle-même. Du plus profond au moins profond, sans quoi un parent serait
  # visité pendant que son enfant l'occupe encore.
  {
    while IFS= read -r src; do
      local d="$(dirname "${src#"$SCAFFOLD_DIR"/}")"
      while [ "$d" != "." ] && [ -n "$d" ]; do
        printf '%s\n' "$d"
        d="$(dirname "$d")"
      done
    done < <(find "$SCAFFOLD_DIR" -type f)
    printf '%s\n' "${DOSSIERS_CREES[@]}"
  } | sort -u | awk -F/ '{ print NF, $0 }' | sort -rn -k1,1 | cut -d' ' -f2- \
    | while IFS= read -r d; do
        rmdir "$target/$d" 2>/dev/null || true
      done

  echo
  printf '%s' "$liste"
  echo
  echo "  $retires retiré(s) · $gardes gardé(s)"
  echo
  echo "  Ce qui reste t'appartient : la config, les ancres, les parcours, les"
  echo "  références visuelles et les rapports déjà produits. Rien de tout cela"
  echo "  n'a jamais été au plugin."
}


# ⚠️ RELEVÉ AVANT LA BOUCLE, et c'est tout l'intérêt (475). Elle POSE
# `.github/workflows/argus-mobile.yml` : demandé après, « ce projet a-t-il des
# workflows GitHub ? » vaut « oui » à jamais, et le contrôle serait vacant le
# jour de son écriture — le défaut exact du point 431.
# ⚠️ ET LE NÔTRE NE COMPTE PAS (478). Compter tout workflow présent faisait
# taire l'avertissement dès le SECOND passage : celui que la boucle vient de
# poser suffisait à faire croire que le projet en avait. Or `--update` est le cas
# courant, et c'est là que la ligne compte le plus — elle rappelle qu'une garde
# n'existe que sur le disque. Trouvé en instruisant, pas par un run : le premier
# passage marchait, et personne ne relance un installeur pour lire un message.
avait_github_actions=0
if [ -d "$TARGET/.github/workflows" ]; then
  autres=$(find "$TARGET/.github/workflows" -type f ! -name 'argus-mobile.yml' 2>/dev/null | head -1)
  [ -n "$autres" ] && avait_github_actions=1
fi

if [ "$MODE" = "uninstall" ]; then
  uninstall_project "$TARGET"
  exit 0
fi

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
  #
  # ⚠️ LA SIGNATURE ÉTAIT UNE PHRASE DE PROSE, et c'est un mode de panne muet.
  # Elle valait « la première ligne de la source qui contient argus » : reformuler
  # un en-tête la change, si bien que chez tous les hôtes DÉJÀ installés le
  # fichier basculait en « pas d'origine Argus » — plus jamais remplacé par
  # --update, jamais compté en retard par --check, CI verte. La seconde moitié de
  # la règle ci-dessus tombait donc en silence, chez des gens qui ne lancent même
  # pas l'installeur.
  #
  # Le marqueur `ARGUS:CADRE` est RÉSERVÉ et borné à l'en-tête, comme ses deux
  # voisins : il ne bouge pas quand la prose change. La signature de prose reste
  # en REPLI, et il le faut : une copie posée AVANT l'introduction du marqueur ne
  # le porte pas, et la « corriger » en la reniant reproduirait exactement le
  # défaut qu'on ferme.
  marque='ARGUS:CADRE'
  signature="$(grep -m1 -i 'argus' "$src" || true)"
  notre_copie=0
  if head -20 "$src" | grep -qF "$marque"; then
    if head -20 "$dest" | grep -qF "$marque"; then
      notre_copie=1                       # posée depuis le marqueur : stable
    elif [ -n "$signature" ] && grep -qF "$signature" "$dest"; then
      notre_copie=1                       # posée avant : on la reconnaît encore
    fi
  elif [ -z "$signature" ] || grep -qF "$signature" "$dest"; then
    notre_copie=1                         # source sans marqueur : comportement d'avant
  fi
  if [ "$notre_copie" -eq 0 ]; then
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
  # Dossiers d'artefacts et de références visuelles — la MÊME déclaration que
  # celle dont la désinstallation les reprend, pour qu'ajouter un dossier ici ne
  # laisse pas un résidu là-bas.
  for d in "${DOSSIERS_CREES[@]}"; do mkdir -p "$TARGET/$d"; done
fi

echo
# ── Ce qui est À TOI, dérivé plutôt qu'annoncé ──────────────────────────────
# ⚠️ EXTRAIT EN FONCTION POUR QUE `--check` L'IMPRIME LUI AUSSI. Le SKILL promet
# qu'un fichier marqué apparaît « dans la liste que l'installeur imprime en
# sortant, et dans son --check » ; la seconde moitié était fausse, parce que le
# mode check sortait (exit 0/1) plusieurs dizaines de lignes AVANT d'arriver
# ici. Il ne rendait qu'un COMPTE agrégé — « 33 fichier(s) conformes ou à toi »
# — où « conforme » et « à toi » sont deux choses différentes, précisément
# celles que l'on venait vérifier.
#
# ⚠️ J'AVAIS DÉMENTI CE CONSTAT, À TORT : je l'avais mesuré sur un terrain EN
# RETARD, où --check imprime bien une liste — celle des fichiers en retard, pas
# celle des fichiers OWNED dont le SKILL parle. J'ai mesuré autre chose que ce
# que le constat visait, et un run l'a re-signalé.
inventaire_owned() {
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
    # ⚠️ TROIS FAÇONS DE FERMER, PAS UNE — et le manque a été trouvé par les DEUX
  # runs iOS, chacun par un bout différent. `SANS OBJET` couvre « rien à faire
  # ici » ; il ne couvre PAS « c'est fait, et le commentaire vaut d'être gardé »,
  # qui est le cas le plus fréquent quand on remplit un scaffold.
  # Un run a écrit `TODO(argus): TRAITÉ — …`, l'inventaire a continué d'imprimer
  # « 1 à traiter », et il a dû SUPPRIMER le marqueur — c'est-à-dire faire
  # exactement ce que la règle interdit pour l'autre cas. L'autre run a rempli
  # `artifact.title` en gardant sa doc d'origine, et s'est vu compter « 2 à
  # traiter » pour du travail achevé.
  # Le seul inventaire que la personne suivante lira affichait donc faux, dans
  # les deux sens.
  restant="$(grep -v '^[[:space:]]*///' "$TARGET/$rel" 2>/dev/null | grep 'TODO(argus):' | grep -cvE 'TODO\(argus\): *(SANS OBJET|FAIT|TRAITÉ)' || true)"
    restant="${restant:-0}"
    if [ "$restant" -gt 0 ]; then
      echo "  ✏️  $rel   ($restant TODO(argus) à traiter)"
      # ⚠️ Le rappel vit ICI parce que c'est ici qu'on lit le compte. La règle est
      # écrite au §3c du SKILL, à plusieurs centaines de lignes des fichiers
      # concernés — un run a relu ce paragraphe trois fois en fermant 25 TODO.
      todo_rappel=1
    else
      echo "  ✔  $rel"
    fi
  # ⚠️ `-t$'\\t'` et non `-t"\\t"` : le second passe un antislash suivi d'un « t »,
  # pas une tabulation — la déduplication se faisait alors sur le mauvais champ et
  # la liste tombait de dix entrées à deux, sans une erreur.
  done < <(sort -u -t$'\t' -k1,1 "$OWNED_LIST" | sort | cut -f2-)
  if [ "${todo_rappel:-0}" = "1" ]; then
    echo
    echo "  ℹ️  Un TODO(argus) se FERME, il ne se supprime pas — trois façons :"
    echo "        TODO(argus): FAIT — <ce qui a été posé>       c'est rempli"
    echo "        TODO(argus): SANS OBJET — <raison>            rien à faire ici"
    echo "        TODO(argus): TRAITÉ — <décision>              tranché autrement"
    echo "      Supprimer le marqueur fait perdre la décision, et le compte ci-dessus"
    echo "      ne redescendra pas tant qu'aucune de ces trois formes n'est écrite."
  fi
  echo
}

case "$MODE" in
  check)
    [ "$foreign" -gt 0 ] && echo "  ⚠️  pas d'origine Argus, donc laissé(s) intact(s) :$foreign_list" || true
    # ⚠️ LA LISTE AVANT LE VERDICT. Sans elle, --check ne rendait qu'un compte
    # agrégé, et celui qui venait de poser un marqueur ARGUS:OWNED n'avait aucun
    # moyen de vérifier qu'il avait été pris en compte — ce que le SKILL promet.
    inventaire_owned
    if [ "$outdated" -gt 0 ]; then
      echo "✖ $outdated fichier(s) de cadre en retard ou absent(s). Rejoue avec --update."
      exit 1
    fi
    echo "✔ tout le cadre est à jour ($skipped conforme(s) ou à toi — le détail ci-dessus)."
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

# Un workflow posé sur un projet qui n'est pas sur GitHub Actions ne s'exécute
# nulle part, et une CI qui ne tourne pas ne se voit pas : c'est une absence,
# donc le plus silencieux des défauts. On ne décide pas à la place du projet —
# on refuse seulement de laisser croire que la garde est en place.
avertir_ci_etrangere() {
  ci_autres=''
  for f in .gitlab-ci.yml bitbucket-pipelines.yml .circleci/config.yml \
           azure-pipelines.yml Jenkinsfile .drone.yml; do
    [ -e "$TARGET/$f" ] && ci_autres="$ci_autres $f"
  done
  [ -z "$ci_autres" ] && return 0
  # Les deux coexistent déjà : c'est un choix du projet, pas un oubli.
  [ "$avait_github_actions" -eq 1 ] && return 0
  echo
  echo "  ⚠️  CE PROJET N'AVAIT AUCUN WORKFLOW GITHUB, et il porte :$ci_autres"
  echo "     .github/workflows/argus-mobile.yml vient d'être posé et ne"
  echo "     s'exécutera NULLE PART. Un job qui ne tourne pas ne se voit pas :"
  echo "     rien ne rougira, et la garde n'existera que sur le disque."
  echo "     Porte ses étapes dans ta CI, ou retire le fichier — il reste la"
  echo "     référence de ce qu'il faut lancer, et dans quel ordre."
  echo
}

inventaire_owned
avertir_ci_etrangere

echo "Prochaines étapes :"
echo "  1. Édite argus.mobile.yaml (identifiants d'app, devices, écrans, seuils)."
echo "  2. Instrumente l'app : Semantics(identifier: 'home_root', child: …) sur"
echo "     chaque écran clé. ⚠️ Les Key Flutter ne sont PAS visibles par Maestro."
echo "  3. Installe Maestro si besoin :"
echo "       curl -fsSL \"https://get.maestro.mobile.dev\" | bash    # Java 17+ requis"
echo "  4. Vérifie la configuration :   node scripts/argus/argus-mobile.mjs config"
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
