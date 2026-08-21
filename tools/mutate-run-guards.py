#!/usr/bin/env python3
"""Réintroduit chaque défaut et vérifie que le garde correspondant tombe.

Trois façons dont un harnais de mutation ment, toutes traitées ici :
  - la mutation ne mute rien (motif absent ou ambigu) → on l'exige unique ;
  - la mutation casse le build, et le rouge n'a rien à voir avec le garde
    → `node --check` avant de lancer la suite ;
  - aucun test ne tourne → on exige le compte attendu dans la sortie.
Et la restauration est prouvée par hash, pas annoncée.
"""
import hashlib
import pathlib
import subprocess
import sys

# Racine DÉRIVÉE, jamais en dur : `git checkout` résout son pathspec depuis le
# répertoire courant, et un chemin relatif ne restaurerait rien dès que la
# commande est lancée d'ailleurs — en laissant l'arbre muté, sans un mot.
ROOT = pathlib.Path(__file__).resolve().parent.parent
CIBLE = ROOT / "skills/argus-mobile/assets/scaffold-mobile/scripts/argus/run.mjs"
REL = str(CIBLE.relative_to(ROOT))
SUITE = ROOT / "tools/run-guards.test.mjs"
NB_TESTS = 15

MUTATIONS = [
    ("l'AVD absent retombe sur un autre émulateur",
     "  const found = listed.find((d) => d.avd === spec.avd);",
     "  const found = listed.find((d) => d.avd === spec.avd) ?? listed.find((d) => !d.physical);"),
    ("le succès ne dit plus qu'il a été mesuré",
     "  if (found) return { status: 'ok', device: { ...found, measured: true } };",
     "  if (found) return { status: 'ok', device: { ...found, measured: false } };"),
    ("avdNameFrom prend la dernière ligne, donc « OK »",
     ".find((l) => l !== '' && l !== 'OK') ?? '';",
     ".filter((l) => l !== '').pop() ?? '';"),
    ("startupSamples retient la DERNIÈRE attente",
     "    const step = (bundle.steps ?? []).find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')\n      && selectorOf(s) === `id=${anchor}`);",
     "    const step = [...(bundle.steps ?? [])].reverse().find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')\n      && selectorOf(s) === `id=${anchor}`);"),
    ("startupSamples ne filtre plus sur l'ancre",
     "      && selectorOf(s) === `id=${anchor}`);",
     "      && selectorOf(s) !== '@@jamais@@');"),
    ("un finding par flow au lieu d'un pour le lot",
     "  if (over.length === 0) return [];",
     "  if (over.length === 0) return [];\n  if (over.length > 1) return over.flatMap((s) => startupFindings([s], device, platform, config));"),
    ("un finding même sous le seuil",
     "  const over = samples.filter((s) => s.ms > budget);",
     "  const over = samples.filter((s) => s.ms >= 0);"),
    ("l'indice s'affiche sur n'importe quel échec",
     "  if (!startupAnchor || selector !== `id=${startupAnchor}`) return '';",
     "  if (false) return '';"),
    ("un émulateur ciblé par son port est refusé",
     "  if (found.physical && spec.physical !== true) {",
     "  if (spec.physical !== true) {"),
    ("un téléphone réel passe sans consentement",
     "  if (found.physical && spec.physical !== true) {",
     "  if (found.physical && spec.physical === true && false) {"),
]


def sh(args, cwd=ROOT):
    return subprocess.run(args, cwd=str(cwd), capture_output=True, text=True)


def digest():
    return hashlib.sha256(CIBLE.read_bytes()).hexdigest()[:12]


def restaure(attendu):
    sh(["git", "checkout", "--", REL])
    obtenu = digest()
    if obtenu != attendu:
        print(f"\n✖ RESTAURATION ÉCHOUÉE ({obtenu} ≠ {attendu}) — arbre laissé muté, on s'arrête.")
        sys.exit(1)


def main():
    if sh(["git", "status", "--porcelain", REL]).stdout.strip():
        print("✖ run.mjs a des modifications non commitées : commite d'abord.")
        print("  (git checkout restaure depuis HEAD — il DÉTRUIRAIT ce travail.)")
        return 1

    propre = digest()
    original = CIBLE.read_text(encoding="utf-8")
    bilan = []

    for nom, avant, apres in MUTATIONS:
        occurrences = original.count(avant)
        if occurrences != 1:
            bilan.append(("HARNAIS", nom, f"motif trouvé {occurrences}× (attendu 1)"))
            continue

        CIBLE.write_text(original.replace(avant, apres, 1), encoding="utf-8")
        if digest() == propre:
            restaure(propre)
            bilan.append(("HARNAIS", nom, "le fichier n'a pas changé"))
            continue

        check = sh(["node", "--check", str(CIBLE)])
        if check.returncode != 0:
            restaure(propre)
            bilan.append(("HARNAIS", nom, "la mutation ne compile pas"))
            continue

        res = sh(["node", "--test", str(SUITE)])
        sortie = res.stdout + res.stderr
        restaure(propre)

        if f"tests {NB_TESTS}" not in sortie:
            bilan.append(("HARNAIS", nom, "la suite n'a pas tourné entièrement"))
        elif res.returncode != 0:
            echecs = [l.strip()[2:] for l in sortie.splitlines() if l.strip().startswith("✖ ")
                      and "subtest" not in l]
            bilan.append(("TOMBE", nom, echecs[0] if echecs else "un garde a rougi"))
        else:
            bilan.append(("VACANT", nom, "aucun garde n'a bougé"))

    print(f"\n{'':2} {'défaut réintroduit':52} verdict")
    print("─" * 96)
    for etat, nom, detail in bilan:
        icone = {"TOMBE": "✔", "VACANT": "✖", "HARNAIS": "⚠"}[etat]
        print(f"{icone}  {nom:52} {etat:8} {detail[:34]}")

    tombes = sum(1 for e, _, _ in bilan if e == "TOMBE")
    print(f"\n{tombes}/{len(MUTATIONS)} défauts détectés · hash restauré : {digest()} (= {propre})")
    return 0 if tombes == len(MUTATIONS) else 1


if __name__ == "__main__":
    sys.exit(main())
