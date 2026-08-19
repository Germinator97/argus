# Argus Mobile — choisir sa matrice de devices

> À lire avant de remplir `devices:` dans `argus.mobile.yaml`. Une matrice mal
> choisie coûte des heures de CI sans trouver un défaut de plus.

## Le tiercé minimal

Trois devices trouvent presque tous les défauts qu'en trouveraient dix :

| Rôle | Ce qu'il attrape | Exemple |
|---|---|---|
| **Android bas de gamme, API ancienne** | lenteurs réelles, mort de processus, API manquantes, petits écrans | `pixel_6` · `android-30` · 360×640 dp |
| **Android récent** | comportements API 33+ : permissions notifications, thème dynamique, gestes | `pixel_7` · `android-34` |
| **iPhone récent** | safe areas, encoche, Dynamic Island, différences de rendu | `iPhone-16` · `iOS-18-2` |

`maestro list-devices` liste les modèles et versions d'OS acceptés localement ;
`maestro list-cloud-devices` ceux du Cloud. Les valeurs se passent **verbatim**.

## Ce qui compte vraiment

**La densité et la hauteur utile, pas le modèle.** Deux téléphones de marques
différentes avec la même densité rendent la même chose. Ce qui change un verdict :

- la **hauteur utile** — 640 dp contre 915 dp décide si le bouton de validation
  passe sous le pli ;
- la **densité** — elle convertit les pixels en dp, donc elle décide si une cible
  tactile passe le seuil de 48 dp ;
- l'**API level** — le comportement des permissions a changé plusieurs fois ;
- les **marges système** — barre d'état + barre de gestes valent ~48 dp, souvent
  l'ordre de grandeur du débordement qu'on cherche.

Ajouter un quatrième téléphone de la même famille que le deuxième ne trouve rien.
Ajouter une **tablette** ou un **pliant**, si tu les supportes, en trouve.

## Émulateur ou appareil réel

L'émulateur suffit pour la très grande majorité du harness. Ce qu'il **ne peut
pas** tester, et qu'aucun vert sur émulateur ne couvre :

- la **performance réelle** — un émulateur tourne sur ton CPU de bureau ;
- la **batterie** et les réveils ;
- la **caméra** et les capteurs physiques ;
- la **biométrie** réelle (l'émulateur simule, l'OS d'un vrai téléphone décide) ;
- le **réseau mobile** réel — latence, perte de paquets, bascule 4G/Wi-Fi ;
- le **rendu GPU** exact d'un fondeur donné.

⚠️ **Un appareil réel n'est jamais choisi automatiquement.** Le runner ne
sélectionne que des émulateurs et simulateurs. Viser un téléphone demande son
`udid` ET `physical: true` — deux gestes délibérés, parce qu'Argus installe un
binaire et efface les données de l'app (`clearState`). Ne branche jamais un
téléphone personnel portant de vraies données.

## Créer les devices

```bash
# Maestro les crée dans une configuration compatible avec son Cloud.
maestro start-device --platform android --device-model pixel_6 --device-os android-33 --device-locale fr_FR
maestro start-device --platform ios --device-model iPhone-16 --device-os iOS-18-2 --device-locale fr_FR

# La locale se fige ICI : `maestro test` n'a pas de --device-locale, et aucun
# flow ne peut la changer.

adb devices                          # udid Android
xcrun simctl list devices booted     # udid iOS
```

## Matrice type, prête à copier

```yaml
devices:
  - id: android-lowend
    platform: android
    udid: ''
    model: pixel_6
    os: android-30
    autoStart: true
    role: primary        # porte les baselines visuelles et les mesures perf
  - id: android-recent
    platform: android
    udid: ''
    model: pixel_7
    os: android-34
    autoStart: true
  # - id: ios-recent
  #   platform: ios
  #   udid: ''
  #   model: iPhone-16
  #   os: iOS-18-2
  #   autoStart: true
```

⚠️ **Les baselines visuelles sont rangées par device** (`.maestro/_baselines/<id>/`).
Changer le `model` ou l'`os` d'une entrée invalide ses références : régénère-les
dans la même configuration que la CI, jamais en CI.

## Exécuter sur plusieurs devices

```bash
maestro test --shard-split 3 .maestro   # répartit la suite sur 3 devices bootés
maestro test --shard-all 3 .maestro     # la même suite partout — débusque le flake
maestro --device "emulator-5554,emulator-5556" test --shard-split 2 .maestro
```

Les devices doivent être **déjà démarrés** : en demander plus qu'il n'y en a est
une erreur, pas une dégradation.
