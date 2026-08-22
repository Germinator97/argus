# Argus Mobile — couche démo (MODE=DEMO uniquement)

> À lire seulement quand l'utilisateur veut une **capture vidéo**. Cette couche
> se pose PAR-DESSUS l'audit EXPLORE (`methodology-mobile.md`) : on illustre
> l'audit réel, on ne le remplace pas. Le rythme ne s'applique QU'ICI ; en
> EXPLORE et en REGRESS, on va à la vitesse machine.

## Ce qui change par rapport au web

Le pendant web pose son rythme **dans le script** : `highlight`, `mousemove`,
`sleep`. Rien de tout ça n'existe ici.

⚠️ **Maestro n'a AUCUNE commande de pause.** C'est délibéré : « no more manual
sleep() calls », la tolérance et l'attente sont intégrées. Il n'y a ni `sleep`,
ni `wait`, ni `delay`. Et il n'y a pas de curseur à déplacer ni d'élément à
surligner : on pilote un doigt, pas une souris.

**Le rythme se règle donc sur le DEVICE, avant le run — pas dans le flow.**
C'est plus honnête et plus stable : aucun `sleep` codé en dur ne traîne ensuite
dans une suite de non-régression.

## Préparer le device (Android)

```bash
D=emulator-5554

# 1. Rendre les gestes VISIBLES — l'équivalent mobile du highlight.
adb -s $D shell settings put system show_touches 1
adb -s $D shell settings put system pointer_location 1   # + coordonnées, plus technique

# 2. RALENTIR, au lieu de couper. L'inverse exact du réglage de déterminisme :
#    en REGRESS on met 0, en DEMO on monte pour que l'œil suive.
for s in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb -s $D shell settings put global $s 3
done
```

Et **remettre l'état de test après la démo** — sinon la suite de non-régression
suivante devient flaky sans qu'on comprenne pourquoi :

```bash
adb -s $D shell settings put system show_touches 0
adb -s $D shell settings put system pointer_location 0
for s in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb -s $D shell settings put global $s 0
done
```

## Enregistrer

Deux voies, à choisir selon ce qu'on veut montrer.

**Depuis le flow** — la vidéo atterrit dans le bundle d'artefacts du flow
(`<sortie>/<session>/<flow>/startRecording/`), donc à côté de ses captures et de
ses journaux :

```yaml
- startRecording:
    path: demo/parcours-critique
    label: Capture du parcours P0
- runFlow: _subflows/launch-clean.yaml
# … le parcours …
- stopRecording
```

⚠️ `stopRecording` **n'échoue pas** s'il n'y a rien à arrêter : ne compte pas
dessus pour détecter qu'un enregistrement conditionnel n'a pas démarré.

**Depuis l'extérieur** — meilleure qualité, indépendant de Maestro, et le seul
moyen de capturer aussi le lancement de l'app :

```bash
# Android — 180 s max par fichier, c'est une limite d'adb.
adb -s $D shell screenrecord --bit-rate 8000000 /sdcard/demo.mp4 &
# … lancer la suite …
adb -s $D shell pkill -SIGINT screenrecord
adb -s $D pull /sdcard/demo.mp4 argus-mobile-report/demo.mp4

# iOS
xcrun simctl io <udid> recordVideo --codec=h264 argus-mobile-report/demo.mp4
# Ctrl-C pour arrêter proprement.
```

## Découper en chapitres

Maestro n'a pas de marqueur de chapitre. Le découpage se fait par **flow** : un
flow = un chapitre = un fichier vidéo, tous nommés dans le rapport.

```bash
maestro --device=$D test .maestro/smoke.yaml
maestro --device=$D test .maestro/journey-critical.yaml
maestro --device=$D test .maestro/resilience.yaml
```

Trame proposée, à adapter à l'app :

1. **Lancement** — écran d'accueil, premier rendu, temps de démarrage mesuré à côté.
2. **Parcours critique** — le tunnel métier, étape par étape, avec ses assertions.
3. **Permissions refusées** — l'app reste utilisable ; c'est le chapitre qui
   surprend le plus, parce que personne ne le joue à la main.
4. **Hors ligne** — mode avion, message attendu, retour en ligne.
5. **Cycle de vie** — arrière-plan, mort du processus, restauration.
6. **Grande police** — l'écran à 200 % de taille de texte, côte à côte avec 100 %.
7. **Rapport** — ouverture du HTML, findings classés par sévérité.

## Garde-fous en DEMO

Ils ne se relâchent pas parce qu'on filme. Aucun mouvement d'argent, aucun OTP
réel, aucun compte de production. Et **une vidéo se publie** : relis-la avant de
la partager, un solde, un numéro de téléphone ou un jeton affiché à l'écran y
reste lisible image par image.
