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
import re
import pathlib
import subprocess
import sys

# Racine DÉRIVÉE, jamais en dur : `git checkout` résout son pathspec depuis le
# répertoire courant, et un chemin relatif ne restaurerait rien dès que la
# commande est lancée d'ailleurs — en laissant l'arbre muté, sans un mot.
ROOT = pathlib.Path(__file__).resolve().parent.parent
SCAFFOLD = ROOT / "skills/argus-mobile/assets/scaffold-mobile/scripts/argus"
FLOWS = ROOT / "skills/argus-mobile/assets/scaffold-mobile/.maestro"
CIBLES = {
    "run": SCAFFOLD / "run.mjs",
    "config": SCAFFOLD / "config.mjs",
    # Le contrat d'injection a DEUX bouts, et le garde ne vaut que s'il voit
    # bouger les deux : le producteur (run.mjs) et le consommateur (le flow).
    "visual": FLOWS / "visual.yaml",
    "report": SCAFFOLD / "report.mjs",
    "a11y": SCAFFOLD / "a11y.mjs",
}
SUITE = ROOT / "tools/run-guards.test.mjs"
# ⚠️ DÉRIVÉ, jamais figé. Ce nombre sert à distinguer « le garde n'a pas bougé »
# de « aucun test n'a tourné » — deux verdicts opposés que la même sortie vide
# produirait. Écrit à la main, il se périmait au premier test ajouté et TOUTES
# les mutations rendaient alors « HARNAIS », ce qui masquait la mesure entière.
# Il se relève donc sur la suite PROPRE, avant la première mutation : c'est le
# seul moment où le compte est à la fois connu et digne de foi.
NB_TESTS = None

MUTATIONS = [
    ("run", "l'AVD absent retombe sur un autre émulateur",
     "  const found = listed.find((d) => d.avd === spec.avd);",
     "  const found = listed.find((d) => d.avd === spec.avd) ?? listed.find((d) => !d.physical);"),
    ("run", "le succès ne dit plus qu'il a été mesuré",
     "  if (found) return { status: 'ok', device: { ...found, measured: true } };",
     "  if (found) return { status: 'ok', device: { ...found, measured: false } };"),
    ("run", "avdNameFrom prend la dernière ligne, donc « OK »",
     ".find((l) => l !== '' && l !== 'OK') ?? '';",
     ".filter((l) => l !== '').pop() ?? '';"),
    ("run", "startupSamples retient la DERNIÈRE attente",
     "    const step = (bundle.steps ?? []).find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')\n      && selectorOf(s) === `id=${anchor}`);",
     "    const step = [...(bundle.steps ?? [])].reverse().find((s) => WAIT_COMMANDS.has(Object.keys(s?.command ?? {})[0] ?? '')\n      && selectorOf(s) === `id=${anchor}`);"),
    ("run", "startupSamples ne filtre plus sur l'ancre",
     "      && selectorOf(s) === `id=${anchor}`);",
     "      && selectorOf(s) !== '@@jamais@@');"),
    ("run", "un finding par flow au lieu d'un pour le lot",
     "  if (over.length === 0) return [];",
     "  if (over.length === 0) return [];\n  if (over.length > 1) return over.flatMap((s) => startupFindings([s], device, platform, config));"),
    ("run", "un finding même sous le seuil",
     "  const over = samples.filter((s) => net(s) > budget);",
     "  const over = samples.filter((s) => net(s) >= 0);"),
    ("run", "le budget d'attente colle au seuil de perf",
     "  return Math.max(20000, (config.thresholds?.coldStartMs ?? 2000) * 5);",
     "  return Math.max(20000, (config.thresholds?.coldStartMs ?? 2000));"),
    ("run", "l'indice s'affiche sur n'importe quel échec",
     "  if (!startupAnchor || selector !== `id=${startupAnchor}`) return '';",
     "  if (false) return '';"),
    ("run", "un émulateur ciblé par son port est refusé",
     "  if (found.physical && spec.physical !== true) {",
     "  if (spec.physical !== true) {"),
    ("config", "deux points de départ ne sont plus refusés",
     "  if (declares.length > 1) {",
     "  if (declares.length > 99) {"),
    ("config", "un start sans ancre passe en silence",
     "    if (typeof s.anchor !== 'string' || s.anchor.trim() === '') {",
     "    if (typeof s.anchor !== 'string' && false) {"),
    ("run", "start: true cesse de gagner",
     "  const declares = screens.filter((/** @type {any} */ s) => s.start === true);",
     "  const declares = screens.filter((/** @type {any} */ s) => s.start === undefined && false);"),
    ("run", "le repli ne se signale plus comme tel",
     "  return { screen: screens[0], origin: 'first' };",
     "  return { screen: screens[0], origin: 'home' };"),
    ("run", "un téléphone réel passe sans consentement",
     "  if (found.physical && spec.physical !== true) {",
     "  if (found.physical && spec.physical === true && false) {"),
    # ── Contrat d'injection ────────────────────────────────────────────────
    ("run", "visualCropOn cesse d'arriver au flow",
     "    ARGUS_VISUAL_CROP: String(config.visualCropOn ?? ''),\n",
     ""),
    ("run", "le runner produit une clé que plus aucun flow ne lit",
     "    ARGUS_VISUAL_MODE: 'assert',",
     "    ARGUS_VISUAL_MODE: 'assert',\n    ARGUS_REGLAGE_INERTE: '',"),
    ("config", "une clé de config renaît sans lecteur",
     "  budget: { maxMinutes: 25, maxFlows: 40 },",
     "  budget: { maxMinutes: 25, maxFlows: 40, parallelDevices: 1 },"),
    ("run", "le budget de durée cesse d'être comparé",
     "  if (maxMinutes > 0 && minutes > maxMinutes) {",
     "  if (maxMinutes > 0 && minutes > maxMinutes * 1000) {"),
    ("run", "le budget de flows cesse d'être comparé",
     "  if (maxFlows > 0 && flows > maxFlows) {",
     "  if (maxFlows > 0 && flows > maxFlows * 1000) {"),
    ("run", "--tags=visual relance la suite principale pour rien",
     "    main: includeTags.some((tag) => tag !== 'visual' && !exclus.has(tag)),",
     "    main: includeTags.some((tag) => !exclus.has(tag)),"),
    ("run", "--tags=smoke rejoue toute la boucle visuelle",
     "    visual: includeTags.includes('visual') && !exclus.has('visual'),",
     "    visual: !exclus.has('visual'),"),
    ("config", "flutterCommand préfixe ce qui n'est pas du flutter",
     "  if (!pinned || !text.startsWith('flutter ')) return text;",
     "  if (!pinned) return text;"),
    ("config", "flutterCommand ne préfixe plus rien",
     "  return `fvm ${text}`;",
     "  return text;"),
    ("config", "le dossier .fvm cesse de compter comme un épinglage",
     "export const usesFvm = () => existsSync(resolve(process.cwd(), '.fvmrc')) || existsSync(resolve(process.cwd(), '.fvm'));",
     "export const usesFvm = () => existsSync(resolve(process.cwd(), '.fvmrc'));"),
    ("run", "l'indice « ancre disparue » s'affiche partout",
     "  if (!seen) return '';",
     "  if (false) return '';"),
    ("run", "un échec antérieur compte comme une présence",
     "    && String(s?.metadata?.status ?? '').toUpperCase() === 'COMPLETED');",
     "    && String(s?.metadata?.status ?? '').toUpperCase() !== '@@jamais@@');"),
    ("run", "le plancher de splash cesse d'être déduit",
     "  const over = samples.filter((s) => net(s) > budget);",
     "  const over = samples.filter((s) => s.ms > budget);"),
    ("run", "le plancher devient un seuil relevé, donc il efface la dérive",
     "  const floor = Math.max(0, Number(config.thresholds?.brandedSplashMs ?? 0));",
     "  const floor = Math.max(0, Number(config.thresholds?.brandedSplashMs ?? 0) * 10);"),
    ("run", "le finding cache le temps brut",
     "        ? `${s.flow} ${Math.round(s.ms)} ms (${Math.round(net(s))} hors splash)`",
     "        ? `${s.flow} ${Math.round(net(s))} ms`"),
    ("report", "un relevé périmé n'est plus signalé",
     "    .filter((/** @type {any} */ p) => (newest.getTime() - p.at.getTime()) / 60000 > budgetMin)",
     "    .filter((/** @type {any} */ p) => (newest.getTime() - p.at.getTime()) / 60000 > budgetMin * 1000)"),
    ("report", "le seuil de péremption cesse de suivre le budget",
     "  const budgetMin = Math.max(1, Number(config?.budget?.maxMinutes ?? 25));",
     "  const budgetMin = 25;"),
    ("a11y", "un splash passe pour un écran du harnais",
     "  if (found.length === 0) {",
     "  if (false) {"),
    ("a11y", "mesurer un autre écran que celui demandé ne se signale plus",
     "  if (requested && requested !== 'écran courant' && !found.some((/** @type {any} */ s) => s.id === requested)) {",
     "  if (false) {"),
    ("visual", "la capture n'est plus recadrée, la comparaison si",
     "                path: ${ARGUS_SCREEN_ID}\n                cropOn:\n"
     "                  id: ${ARGUS_VISUAL_CROP}\n"
     "                label: Nouvelle référence visuelle, recadrée",
     "                path: ${ARGUS_SCREEN_ID}\n"
     "                label: Nouvelle référence visuelle, recadrée"),
]


def sh(args, cwd=ROOT):
    return subprocess.run(args, cwd=str(cwd), capture_output=True, text=True)


def digest(cible):
    return hashlib.sha256(cible.read_bytes()).hexdigest()[:12]


def restaure(cle, attendu):
    cible = CIBLES[cle]
    sh(["git", "checkout", "--", str(cible.relative_to(ROOT))])
    obtenu = digest(cible)
    if obtenu != attendu:
        print(f"\n✖ RESTAURATION ÉCHOUÉE ({obtenu} ≠ {attendu}) — arbre laissé muté, on s'arrête.")
        sys.exit(1)


def main():
    global NB_TESTS
    base = sh(["node", "--test", str(SUITE)])
    m = re.search(r"tests (\d+)", base.stdout + base.stderr)
    if not m:
        print("✖ impossible de relever le compte de tests sur la suite propre —")
        print("  sans lui, « aucun test n'a tourné » et « le garde est vacant » sont indistinguables.")
        return 1
    NB_TESTS = int(m.group(1))
    if base.returncode != 0:
        print(f"✖ la suite est DÉJÀ rouge ({NB_TESTS} tests) — corrige avant de muter.")
        return 1

    for cle, cible in CIBLES.items():
        if sh(["git", "status", "--porcelain", str(cible.relative_to(ROOT))]).stdout.strip():
            print(f"✖ {cible.name} a des modifications non commitées : commite d'abord.")
            print("  (git checkout restaure depuis HEAD — il DÉTRUIRAIT ce travail.)")
            return 1

    propres = {k: digest(v) for k, v in CIBLES.items()}
    originaux = {k: v.read_text(encoding="utf-8") for k, v in CIBLES.items()}
    bilan = []

    for cle, nom, avant, apres in MUTATIONS:
        cible, propre, original = CIBLES[cle], propres[cle], originaux[cle]
        occurrences = original.count(avant)
        if occurrences != 1:
            bilan.append(("HARNAIS", nom, f"motif trouvé {occurrences}× (attendu 1)"))
            continue

        cible.write_text(original.replace(avant, apres, 1), encoding="utf-8")
        if digest(cible) == propre:
            restaure(cle, propre)
            bilan.append(("HARNAIS", nom, "le fichier n'a pas changé"))
            continue

        # Une mutation qui casse le build fait rougir pour une raison sans
        # rapport avec le garde, et ce rouge-là se lit comme un succès. Les
        # flows Maestro n'ont pas d'équivalent : leur `---` sort du
        # sous-ensemble YAML du harness, donc aucun parseur d'ici ne les lit.
        if cible.suffix == ".mjs":
            check = sh(["node", "--check", str(cible)])
            if check.returncode != 0:
                restaure(cle, propre)
                bilan.append(("HARNAIS", nom, "la mutation ne compile pas"))
                continue

        res = sh(["node", "--test", str(SUITE)])
        sortie = res.stdout + res.stderr
        restaure(cle, propre)

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
    hashs = " ".join(f"{k}={digest(v)}" for k, v in CIBLES.items())
    print(f"\n{tombes}/{len(MUTATIONS)} défauts détectés · hashs restaurés : {hashs}")
    return 0 if tombes == len(MUTATIONS) else 1


if __name__ == "__main__":
    sys.exit(main())
