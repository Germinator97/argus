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

## Désigner un device : `avd`, pas `udid`

⚠️ **`emulator-5554` n'est pas une identité, c'est un numéro de port.** Android
les attribue dans l'ordre de démarrage — 5554, 5556, 5558. Le même udid désigne
donc un AVD différent d'une session à l'autre, selon ce qui a démarré en
premier.

Ce piège ne se signale par aucune erreur : le run se déroule normalement, sur
l'application d'à côté. Relevé sur un cas réel — un rapport annonçait
`model: Medium_Phone` alors que le port portait un tout autre AVD, sur lequel
l'app testée n'était même pas installée. Ce que le rapport nommait « modèle »
était **recopié depuis la config**, jamais lu sur l'appareil : rien, dans la
chaîne, ne pouvait voir l'écart.

Deux conséquences, dont la seconde est la plus coûteuse :

- les **baselines visuelles** sont liées au couple device + OS. Générées sur un
  port qui change d'AVD, elles produisent des diffs qu'on met des heures à
  expliquer ;
- un run « vert » peut l'être **sur le mauvais appareil**.

| Ce que tu cibles | Ce que tu déclares | Pourquoi |
|---|---|---|
| Émulateur Android | `avd: Medium_Phone_API_36` | seule identité stable (`emulator -list-avds`) |
| Simulateur iOS | `udid: <UUID>` | l'UUID est attribué à la création, stable à vie |
| Téléphone physique | `udid: <série>` + `physical: true` | deux gestes délibérés, voir ci-dessus |
| N'importe quel émulateur | les deux vides | le runner prend le premier — jamais un physique |

`avd` est prioritaire sur `udid`. Le rapport écrit ensuite l'identité qu'il a
**mesurée** (`avd`, `model`, `os` lus sur l'appareil) à côté de celle qui était
`declared` — les comparer est alors une lecture, plus une enquête.

⚠️ **Conséquence sur la locale, et elle n'est écrite nulle part ailleurs :**
`locale.deviceLocale` ne s'applique qu'au DÉMARRAGE du device, donc
uniquement via `autoStart`. En lançant ton AVD toi-même — la disposition
recommandée juste en dessous — ce réglage existe, se lit, et n'a **aucun
effet**. Règle la locale sur l'émulateur avant le run. Le runner le dit
désormais plutôt que de laisser croire.

⚠️ `avd` et `autoStart: true` ne se combinent pas : `maestro start-device`
**crée son propre AVD** et ne sait pas démarrer le tien. Lance-le toi-même
(`emulator -avd <nom> &`) ; le runner te le dira plutôt que de faire semblant.

⚠️ Et `model` n'est pas comparable : la config porte un nom **Maestro**
(`pixel_6`, consommé par `start-device`), l'appareil rend un nom **produit
Android** (`sdk_gphone64_arm64`). Deux vocabulaires — les confronter ferait
crier au loup à chaque run.

## Créer les devices

```bash
# Maestro les crée dans une configuration compatible avec son Cloud.
maestro start-device --platform android --device-model pixel_6 --device-os android-33 --device-locale fr_FR
maestro start-device --platform ios --device-model iPhone-16 --device-os iOS-18-2 --device-locale fr_FR

# La locale se fige ICI : `maestro test` n'a pas de --device-locale, et aucun
# flow ne peut la changer.

emulator -list-avds                  # noms d'AVD Android — ce qu'il faut déclarer
adb -s emulator-5554 emu avd name    # quel AVD occupe CE port, à l'instant t
xcrun simctl list devices booted     # udid iOS (UUID stable)
```

## Matrice type, prête à copier

```yaml
devices:
  # AVD que tu gères toi-même : identité stable, à démarrer à la main.
  - id: android-lowend
    platform: android
    avd: Pixel_6_API_30   # emulator -list-avds
    autoStart: false
    role: primary        # porte les baselines visuelles et les mesures perf
  # Laissé à Maestro, qui crée son AVD : pas d'identité stable à déclarer, mais
  # le rapport écrira quand même celle qu'il aura mesurée.
  - id: android-recent
    platform: android
    avd: ''
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
