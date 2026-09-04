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
| N'importe quel émulateur | les deux vides | Argus prend le premier — jamais un physique |

`avd` est prioritaire sur `udid`. Le rapport écrit ensuite l'identité qu'il a
**mesurée** (`avd`, `model`, `os` lus sur l'appareil) à côté de celle qui était
`declared` — les comparer est alors une lecture, plus une enquête.

⚠️ **ET CE QUE LA CI EN FAIT, parce que ce nom-là n'existe pas chez elle.** Un
AVD est local à ta machine : le runner de CI n'a pas le tien, et l'action qui
provisionne l'émulateur (`reactivecircus/android-emulator-runner`) en CRÉE un
sous son propre nom. Tant que le workflow ne le lui disait pas, `resolveByAvd`
cherchait `Medium_Phone_API_36` là où l'action avait posé `test` : la
configuration prescrite juste au-dessus était donc exactement celle qui faisait
échouer le job, et rien ne reliait les deux vocabulaires.

Le workflow livré passe désormais `avd-name` à l'action, **dérivé de cette même
clé** (`config.mjs --print-platforms` et `ciEmulator` sont la seule source) : ce
que tu déclares ici est le nom que la CI crée. Rien à recopier de part et
d'autre, et rien à changer entre local et CI.

Si tu écris ton propre workflow, c'est la ligne à ne pas oublier — `model` et
`os` s'y dérivent naturellement parce qu'ils ont l'air de décrire un appareil,
`avd` non, et c'est pourtant lui que le runner compare.

⚠️ **Cela vaut pour TOUS les scripts, et ce n'était pas le cas.** `run.mjs` tenait
seul cette règle ; `perf.mjs`, `a11y.mjs` et le calcul d'ABI de
`--print-build-cmd` appelaient une résolution qui prenait le premier émulateur
d'`adb devices` sans jamais lire `devices[].avd`. Avec deux émulateurs branchés —
le cas courant d'une machine de développement — ils mesuraient donc l'appareil
d'à côté. Corrigé au dix-septième run, qui l'a découvert **par chance** : l'app
n'était pas installée sur l'autre AVD, sinon les chiffres seraient sortis faux
sans un mot.

Depuis, un AVD déclaré mais **non démarré** est un refus qui nomme ce qu'il
cherchait et ce qu'il a trouvé — jamais un repli silencieux sur un autre
appareil.

⚠️ **Conséquence sur la locale, et elle n'est écrite nulle part ailleurs :**
⚠️ **UN ÉMULATEUR DÉJÀ DÉMARRÉ EST UN ÉMULATEUR PARTAGÉ, ET IL PEUT ÊTRE PLEIN.**
`adb install` rend alors `INSTALL_FAILED_INSUFFICIENT_STORAGE: Failed to override
installation location` — un message qui accuse l'installation qu'on vient de
lancer, alors que la cause est ce qui l'occupait déjà. Vécu : `/data` à 92 % à
cause d'applications **sans rapport avec le run**.

Ce qu'on devine seul — désinstaller les autres apps — est justement ce qu'un
garde-fou de permission bloque, à raison : elles ne t'appartiennent pas. Deux
sorties qui, elles, restent dans ton périmètre :

- **construire en `release` plutôt qu'en `debug`** : le binaire de recette est
  couramment deux à trois fois plus petit (mesuré : 127,8 Mo → 47,8 Mo), et
  `argus-perf` mesure de toute façon la release ;
- **désinstaller TON application** avant de réinstaller, ce qui rend l'espace de
  ta propre installation précédente.

Et si tu désinstalles quoi que ce soit d'autre, **dis-le dans le compte rendu** :
un run l'a fait pour se débloquer, l'a documenté, et c'est ce qui a permis à la
personne concernée de la remettre.

`locale.deviceLocale` ne s'applique qu'au DÉMARRAGE du device, donc

⚠️ **Et si l'AVD est DÉJÀ dans la bonne locale ?** Laisse la clé renseignée : elle
documente l'intention, et le runner ne dit plus rien quand l'appareil correspond
— il n'avertit que lorsque l'écart est réel ou la locale illisible. La vider
ferait perdre l'information sans rien gagner.
uniquement via `autoStart`. En lançant ton AVD toi-même — la disposition
recommandée juste en dessous — ce réglage existe, se lit, et n'a **aucun
effet**. Règle la locale sur l'émulateur avant le run. Le runner le dit
désormais plutôt que de laisser croire.

⚠️ **Et une image « Google Play » refuse la locale, quoi que tu fasses.** Deux
familles d'images système, et une seule est réglable :

| image de l'AVD | `adb root` | `persist.sys.locale` |
|---|---|---|
| *Google APIs* (ou AOSP) | accepté | modifiable |
| *Google Play* | **refusé** | **immuable** |

Sur une image Play, la tentative rend `adbd cannot run as root in production
builds`, puis `Failed to set property 'persist.sys.locale' to 'fr-FR'`. La clé
`locale.deviceLocale` reste alors purement déclarative : l'app force sa propre
langue si elle en a une, mais **les chaînes Material restent dans la langue du
système**, et une référence visuelle née là porte cette langue.

C'est une raison **distincte** de celle ci-dessous : `autoStart` n'y changerait
rien. Devant une locale qui ne prend pas, regarde l'image AVANT de chercher plus
loin (`avdmanager list avd` nomme l'image de chaque AVD) — et si tu veux une
locale figée, crée un AVD sur une image *Google APIs*.

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
