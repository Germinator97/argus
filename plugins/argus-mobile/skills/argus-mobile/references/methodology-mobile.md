# Argus Mobile — Méthodologie QA/QE (référence complète)

> Lis ce document pour tout audit réel et pour décider quoi tester, comment
> tester à grande échelle, et comment classer un défaut. SKILL.md est
> l'orchestrateur ; ceci est le cerveau.
>
> Ce qui est **identique au web** n'est pas recopié : sévérité des findings,
> codes de sortie, forme du rapport. Ce qui est écrit ici est ce que le mobile
> fait AUTREMENT — et ça commence dès la couche d'accessibilité.
>
> Ce document se suffit à lui-même. Il renvoyait auparavant à la méthodologie
> du skill web pour la philosophie de preuve et les garde-fous transverses,
> alors qu'il porte déjà les siens (§3, plus complet que celui qu'il citait) :
> le renvoi coûtait une lecture de plus sans rien apporter.

## Sommaire
1. RUN CONFIG mobile
2. Modes opératoires (EXPLORE / DEMO / REGRESS)
3. Garde-fous de sécurité (env-aware)
4. Stratégie de passage à l'échelle
5. Boucle d'exécution
6. Dimensions de test
7. Outillage + arborescence du scaffold
8. Sévérité & gating CI
9. Déterminisme & anti-flake

═══════════════════════════════════════════════════════════════════════════════
## 1. RUN CONFIG mobile (à remplir avant de lancer — défauts entre [])
═══════════════════════════════════════════════════════════════════════════════
```
APP          : { pubspec: <name>, androidPackage: <com.exemple.app>,
                 iosBundleId: <com.exemple.app>, flavor: <dev|staging|prod> }
BUILD        : { android: build/app/outputs/flutter-apk/app-debug.apk,
                 ios: build/ios/iphonesimulator/Runner.app,
                 buildCmd: flutter build apk --debug }
PLATFORMS    : [ android ]                      # + ios si Mac/Xcode disponible
DEVICES      : voir device-matrix.md            # émulateur | simulateur | réel
ENV          : prod | staging | local           # pilote les garde-fous (§3)
MODE         : EXPLORE | DEMO | REGRESS         # voir §2
AUTH         : { secrets_from_env: [QA_USER, QA_PASS], anchors: {…} }
LOCALE       : { deviceLocale: fr_FR }
BUDGET       : { max_minutes: [25], max_flows: [40] }
THRESHOLDS   : { coldStartMs: 2000, warmStartMs: 1000, jankFramesPct: 1,
                 memoryMb: 250, binarySizeMb: 60,
                 visualMatchPercentage: 99, minTouchTargetDp: 48 }
GATE         : { fail_on: [blocker, critical, major],
                 fail_on_visual_diff: true, fail_on_empty_run: true }
ARTIFACTS    : argus-mobile-report/
BASELINES    : .maestro/_baselines/<device-id>/
```
Champs requis : APP.<identifiant de la plateforme visée>, PLATFORMS, MODE.
Tout le reste se déduit du repo. Ce bloc est matérialisé par `argus.mobile.yaml`.

⚠️ **`visualMatchPercentage` est une inversion par rapport au web.** Côté
Playwright on tolère un **ratio de différence** (0.01). Côté Maestro,
`thresholdPercentage` est un **pourcentage de correspondance requis**, défaut 95.
« 1 % de diff toléré » s'écrit **99**. Y mettre 0.01 accepterait n'importe quelle
image — et le harness le refuse explicitement au chargement.

═══════════════════════════════════════════════════════════════════════════════
## 2. Modes opératoires
═══════════════════════════════════════════════════════════════════════════════
**EXPLORE** — Audit exhaustif d'une app installée. Découvre les écrans, couvre
toutes les dimensions (§6), produit findings + métriques + rapport. Boucle la plus
courte pour un agent : Maestro MCP (`inspect_screen` → `run` en YAML inline →
corriger), sans recompilation.

**DEMO** — Logique EXPLORE, surcouchée d'une mise en scène et d'un enregistrement :
voir `demo-mode-mobile.md`. La démo illustre l'audit, elle ne le remplace pas.

**REGRESS** — Mode CI. `maestro test` headless, déterministe, plus les gardes
`flutter_test` sans device.
1. Étage 1 d'abord : il coûte des secondes et tombe pour des raisons qu'aucun
   émulateur n'améliorera.
2. Étage 2 : suite Maestro sur la matrice de devices.
3. Compare aux baselines (visuel + findings connus).
4. Émet JSON + JUnit + exit code (§8). Aucun `sleep` arbitraire.

Toute trouvaille EXPLORE stable DOIT être codifiée ici — c'est ainsi que la
couverture s'accumule.

═══════════════════════════════════════════════════════════════════════════════
## 3. Garde-fous de sécurité (NON NÉGOCIABLE — adaptés à ENV)
═══════════════════════════════════════════════════════════════════════════════
RÈGLE D'OR : par défaut READ-ONLY. Toute action sortante ou irréversible exige
ENV=staging avec données jetables, ou une confirmation explicite.

| | prod | staging | local |
|---|---|---|---|
| Navigation, lecture, captures, mesures | ✅ | ✅ | ✅ |
| Connexion avec un compte de test | ⚠️ dédié | ✅ | ✅ |
| Écriture (création, édition) | ❌ | ✅ données `qa_` | ✅ |
| Mouvement d'argent | ❌ **JAMAIS** | ❌ **JAMAIS** sans accord écrit | sandbox seulement |
| Achat in-app | ❌ | sandbox StoreKit / Play Billing | sandbox |
| SMS / OTP réel vers un tiers | ❌ | ❌ | ❌ |
| Push vers de vrais utilisateurs | ❌ | ❌ | ❌ |
| `clearState` | ⚠️ efface les données de l'app sur CE device | ✅ | ✅ |
| Analyse de binaire | tes builds uniquement | idem | idem |

**Spécifiquement mobile :**
- **Appareil réel** : jamais un device personnel. L'auto-détection du runner ne
  choisit que des émulateurs et simulateurs ; viser un téléphone demande son udid
  ET `physical: true`. Deux gestes délibérés, parce qu'installer un binaire et
  effacer des données sur le téléphone de quelqu'un ne se rattrape pas.
- **Secrets** : environnement uniquement. Passés par `-e`, donc **visibles dans
  `ps`**. `label:` les masque en console et dans les rapports, **pas dans les
  journaux de debug bruts** — `--debug-output` ne se publie jamais en artefact ouvert.
- **Captures** : une baseline d'un écran authentifié contient des données réelles
  et se retrouve versionnée. Utilise un compte de test aux données inventées.

Ces garde-fous sont les mêmes que côté web, à ceci près que le mobile en
ajoute trois — appareil réel, secrets passés par `-e`, baselines authentifiées.

═══════════════════════════════════════════════════════════════════════════════
## 4. Stratégie de passage à l'échelle
═══════════════════════════════════════════════════════════════════════════════
On ne teste pas « tous les écrans ». On teste intelligemment sous BUDGET.

1. **Découverte par l'arbre de navigation**, pas par le crawl. Une app mobile n'a
   pas de sitemap : lis les routes déclarées (`GoRouter`, `Navigator` nommé,
   `onGenerateRoute`), les `intent-filter` de `AndroidManifest.xml` et les
   `CFBundleURLSchemes` d'`Info.plist`. Construis un **manifeste d'écrans** :
   identifiant, route, profondeur, atteignable par deep link ?
2. **Dédup par template d'écran.** Dix écrans de détail produit = un gabarit.
   Teste 1–3 instances représentatives + les cas limites : liste vide, texte très
   long, montant à cinq chiffres, image manquante, état hors ligne.
3. **Priorisation** : P0 parcours critiques (lancement, connexion, tunnel métier)
   → P1 écrans à fort trafic → P2 long-tail échantillonné.
4. **Matrice de devices échantillonnée, pas exhaustive.** Voir `device-matrix.md`.
   Le tiercé minimal couvre plus de défauts que dix modèles voisins.
5. **Budget explicite.** Si le temps plafonne avant couverture complète, **loggue
   ce qui a été échantillonné ET ce qui a été ignoré**. Jamais de troncature
   silencieuse : `coverage.notConfigured` du rapport existe pour ça.
6. **REGRESS diff-aware** : ré-audite à fond les écrans touchés par le diff,
   smoke-test le reste.

═══════════════════════════════════════════════════════════════════════════════
## 5. Boucle d'exécution
═══════════════════════════════════════════════════════════════════════════════
SETUP → BUILD → INSTALL → DISCOVER → PLAN → pour chaque cible : EXÉCUTER (§6) →
CAPTURER PREUVE → TRIER (§8) → VÉRIFIER (re-run anti-flake) → REPORTER → [CI] GATER.

**INSTALL n'est pas une formalité.** Maestro n'installe pas l'app : il pilote un
binaire déjà présent. Et `adb install` peut échouer en laissant tourner la
version précédente — on valide alors le comportement d'hier. L'installation doit
être **prouvée** : `Success` dans la sortie ET le paquet dans `pm list packages`
(iOS : `simctl get_app_container` trouve le bundle). Un correctif jugé faux parce
qu'il n'avait jamais été installé coûte une demi-journée.

Un finding mobile n'est valide que s'il porte :
**écran + sélecteur sémantique + device + OS/API + orientation + build/flavor +
expected/actual + preuve (capture, vidéo, logcat, dump de hiérarchie) + steps +
fix suggéré.** Sans ça, ce n'est pas un finding.

═══════════════════════════════════════════════════════════════════════════════
## 6. Dimensions de test (coche chacune)
═══════════════════════════════════════════════════════════════════════════════

### FUNCTIONAL
Parcours critiques bout en bout ; formulaires et validation (messages FR) ;
navigation et **retour système Android** ; deep links ; états vide / chargement /
erreur / succès ; **idempotence** (un double-tap ne doit pas produire deux effets —
c'est le défaut le plus coûteux d'une app financière et le moins testé) ; cycle de
vie ; rotation ; changement de compte.

⚠️ **Le piège n°1 : les `Key` Flutter ne sont PAS exposées** à la couche
d'accessibilité. Maestro vit hors du runtime Flutter et ne peut pas les voir. Un
flow qui cible une Key échoue, toujours. Trois voies, par ordre de robustesse :
1. `Semantics(identifier: 'login_button')` (Flutter ≥ 3.19) → sélecteur `id`.
   **La voie recommandée** : stable, indépendante de la langue, insensible au wording.
2. `semanticLabel:` sur une icône (`Icon(Icons.add, semanticLabel: 'fabAddIcon')`).
3. Le **texte rendu** — exposé automatiquement, mais il change avec la langue et
   au prochain arbitrage produit.

⚠️ **`back` est Android et Web uniquement.** Un flow de retour non gardé passe au
vert sur iOS sans rien tester.

⚠️ **LA RECETTE DE L'ANCRE D'ÉCRAN, VÉRIFIÉE SUR DEVICE.** Une ancre posée sur
la racine d'une page doit être un conteneur INERTE :

```dart
Semantics(
  identifier: 'home_root',
  container: true,          // garantit un nœud propre
  explicitChildNodes: true, // ⚠️ SANS LUI, LE NŒUD ABSORBE SES DESCENDANTS
  child: …,
)
```

Sans `explicitChildNodes`, le nœud avale tout le sous-arbre : dans un cas réel,
`home_root` devenait **cliquable**, son `content-desc` contenait la totalité du
texte de l'écran, et le bouton interne `home_demarrer` **n'avait plus de nœud** —
donc plus d'identifiant ciblable, et TalkBack annonçait la page en un seul bloc.
Le remède est une ligne, mais le défaut ne se voit qu'en lisant l'arbre du
device : `maestro hierarchy --compact`.


### VISUAL
`assertScreenshot` par écran clé × device × orientation × thème ; débordements et
texte tronqué ; safe areas, encoche, barre de gestes ; **grandes polices** ;
masquage des zones non déterministes.

⚠️ **Maestro n'a PAS de masquage de pixels.** L'équivalent de `dynamicSelectors`
du harness web n'existe pas : seul `cropOn` restreint la capture. Trois substituts
réels, du plus fiable au moins fiable :
1. **Figer la donnée** — horloge, solde, jeu de test, via les `arguments` de
   `launchApp` ou un environnement de test dédié ;
2. **Fermer ce qui flotte** — bannières, toasts, tooltips (`optional: true`) ;
3. **Recadrer** sur un conteneur stable (`visualCropOn`).

⚠️ **Ce que `visualCropOn` recadre dépend de l'endroit où la racine a été posée**,
et ça ne se voit pas dans le code d'instrumentation. Une racine d'écran cadre la
surface de son sous-arbre : posée **autour** d'un `SafeArea`, elle prend l'écran
entier ; posée **dedans**, la zone utile. Mesuré sur Flutter 3.32, écran 360×800 dp,
insets 48 dp en haut et 24 dp en bas :

| Où est la racine | `rect` du nœud |
|---|---|
| **autour** du `SafeArea` | `0,0` — 1080 × **2400** px *(écran entier)* |
| **dedans** le `SafeArea` | `0,144` — 1080 × **2184** px *(zone utile)* |

216 px d'écart, soit exactement les deux insets. Poser la racine à l'extérieur
fait donc entrer la **barre d'état dans la référence visuelle** — donc l'horloge
du système, qui change à chaque minute. La dimension devient rouge en permanence,
pour une raison qui n'apparaît nulle part dans le diff d'instrumentation : ce
n'est ni un seuil mal réglé ni une régression, c'est un cadrage.

Poser la racine **à l'intérieur** du `SafeArea` quand elle sert de `visualCropOn`.
Et si elle doit rester à l'extérieur pour une autre raison, recadrer sur un
conteneur intérieur plutôt que sur elle.

⚠️ **Changer `visualCropOn` invalide les références déjà produites.** La doc de
Maestro est explicite — « the comparison screenshot must also have been cropped » —
et rien n'échoue proprement quand les deux cadrages divergent : Maestro compare
deux images valides qui ne montrent simplement pas la même chose, et le diff se
lit comme une régression de l'app. Le runner note donc le cadrage à côté des
références (`.maestro/_baselines/.argus-crop`) et avertit quand il a bougé ;
régénère avec `make argus-baselines` plutôt que de chercher ce qui a changé
dans l'écran.

La racine de résolution d'un chemin **relatif** de `assertScreenshot` n'est
documentée nulle part. Le harness n'essaie pas de la deviner : il injecte un
chemin **absolu**, ce qui a été éprouvé sur device — génération de la référence,
comparaison conforme, puis détection d'une référence corrompue.

Ce qu'il ne faut **pas** faire : relâcher `visualMatchPercentage`. Ça masque les
zones dynamiques **et** les vraies régressions, sans distinction.

⚠️ **Et il ne faut pas non plus le monter à 100.** Aucun écran n'est
pixel-parfait d'un run à l'autre. Mesuré sur émulateur, deux écrans capturés puis
recomparés sans qu'une ligne de code ne change : **99,949 %** et **99,870 %** de
correspondance. À 100, la suite est rouge en permanence pour du bruit de rendu ;
c'est le défaut symétrique de relâcher le seuil, et il coûte la même chose — un
rapport qu'on cesse de lire.

⚠️ **Une comparaison verte ne prouve PAS que l'écran est déterministe.** Elle
prouve que ce qui bouge pèse moins que le seuil. Sur le même relevé, un écran
portant un `CircularProgressIndicator` **qui tourne sans fin** passe au seuil
recommandé de 99 : l'indicateur ne représente que ~0,13 % des pixels. Le
non-déterminisme est là, il est simplement sous le radar — et il ressortira le
jour où l'élément grossira, où un autre device le rendra autrement, ou où un
second élément animé s'ajoutera. Autrement dit, on ne peut pas **découvrir** les
zones dynamiques en regardant la dimension passer au vert : il faut les
connaître, les déclarer, et poser `visual: false` sur les écrans qui en portent
de structurelles (un chronomètre, un solde qui s'anime, un carrousel).

Le cycle complet a été éprouvé sur device : génération de deux références,
comparaison conforme (0 finding), référence remplacée par un aplat → un finding
`visual`/`major` (« threshold not met, current: 0.0% »), restauration → retour au
vert. Sans cette troisième étape, le « 0 finding » de la deuxième ne prouverait
pas que la comparaison a eu lieu.

⚠️ **Une baseline est liée au couple device + version d'OS.** Générée ailleurs
que sur la configuration de la CI, elle rend la dimension rouge en permanence.
Et `--update-baselines` ne se lance **jamais** en CI : une référence régénérée
accepte la régression qu'elle devait détecter.

⚠️ **Le débordement à grande police ne se voit sur aucune capture prise à 100 %.**
C'est l'étage 1 qui le mesure (`test/argus/layout_test.dart`), sur trois gabarits
× trois échelles.

### A11Y — dimension de premier ordre, pas un bonus
Trois mesures, trois outils, parce qu'aucun ne couvre les trois :

| Mesure | Où | Pourquoi pas ailleurs |
|---|---|---|
| Couverture des ancres sémantiques | `.maestro/a11y.yaml` | seul Maestro voit l'arbre réel du device |
| Cibles tactiles ≥ 48 dp, contrastes, labels | `test/argus/a11y_test.dart` | **inexprimable en Maestro** : `width`/`height` sont des égalités en pixels |
| Cibles tactiles sur le rendu réel | `scripts/argus/a11y.mjs` | croise `uiautomator dump` et `wm density` |

Le **rapport d'instrumentation** de SKILL.md §2 EST une métrique a11y : un widget
que Maestro ne trouve pas est un widget que TalkBack n'annonce pas. Son format est
fixé là-bas, et ce qu'il devient dépend du mode : **un** finding `a11y`/`major` en
EXPLORE/DEMO — jamais un par widget —, un reste-à-faire bloquant avant
l'installation en REGRESS, où l'instrumentation ne repart pas.

⚠️ `MinimumTapTargetGuideline` **ignore les nœuds qui touchent le bord de la vue**
(pour ne pas accuser un élément partiellement sorti de l'écran). Une cible collée
au bord n'est donc pas mesurée, et le garde passe sans l'avoir regardée. Vérifié
dans la source, pas supposé.

À faire à la main, sur les parcours P0 : navigation **TalkBack** (Android) et
**VoiceOver** (iOS). Aucun outil ne remplace l'écoute de ce que le lecteur annonce.

### PERFORMANCE & STABILITÉ
- **Démarrage à froid et à chaud** — Android : `adb shell am start -W` →
  `TotalTime`. iOS : pas d'équivalent en ligne de commande ; ça se mesure avec
  Instruments (App Launch), hors périmètre automatisable — donc rapporté
  `skipped`, jamais vert.
- **Jank** — `adb shell dumpsys gfxinfo <pkg>` après `reset`, lecture de
  `Janky frames`.
- **Mémoire** — `dumpsys meminfo <pkg>` → TOTAL PSS.
- **Taille du binaire** — et `flutter build apk --analyze-size` pour savoir *où*.
- **Crash-free** — `crash-report.txt` / `anr-report.txt` du bundle d'artefacts
  Maestro, collectés par flow.

⚠️ **Un chiffre de performance ne veut rien dire sans l'état où il est pris.**
Le **premier lancement après installation** est plusieurs fois plus lent que le
régime stabilisé — et ce n'est ni la taille de l'APK ni la compilation ART (les
deux se mesurent et se réfutent), c'est l'initialisation applicative de premier
démarrage. C'est un état **réel**, vécu une fois par chaque utilisateur, et
reproduit à chaque séance de recette qui réinstalle. Le harness le mesure à part
plutôt que de le noyer dans une moyenne qui ne décrirait ni l'un ni l'autre.

⚠️ **N'attribue jamais un écart à un mécanisme sans l'avoir isolé.** Le chiffre
est vrai, l'explication est inventée, et on optimise à côté. Fais varier **une**
variable, et vérifie que le mécanisme supposé bouge pendant que le chrono ne
bouge pas.

⚠️ `am start -W` rend DEUX avertissements « Activity not started » qu'il ne faut
pas confondre — vérifié sur device :
- « intent has been delivered to currently running **top-most instance** » :
  l'app était déjà devant, rien n'a été relancé. `TotalTime: 0` s'affiche alors,
  et ce zéro passerait pour un démarrage parfait. Ce n'est pas une mesure.
- « its current task has been **brought to the front** » : c'est LE démarrage à
  chaud. Aucune activité n'étant créée, `am start` ne rend **aucun TotalTime** —
  seul `WaitTime` décrit le retour au premier plan. Rejeter ce cas laisse
  `warmStartMs` à `null` indéfiniment, et la dimension disparaît en silence.
  Le rapport nomme donc la grandeur (`warmStartMetric`) : un WaitTime ne se
  compare pas à un TotalTime.

### SECURITY (OWASP MASVS/MASTG) — détection, jamais exploitation, sur TES builds
- **Statique / binaire** : secrets en dur dans l'APK/IPA ; clés d'API dans
  `AndroidManifest.xml` / `Info.plist` ; `android:debuggable`, `allowBackup`,
  `usesCleartextTraffic` ; permissions excessives **au manifeste fusionné** (les
  dépendances en ajoutent que tes sources ne mentionnent pas, et c'est pourtant
  l'utilisateur qui les accorde) ; absence d'obfuscation (`--obfuscate
  --split-debug-info`) ; présence de `kernel_blob.bin`, qui signe un build debug.
- **Stockage** : `SharedPreferences`/`UserDefaults` en clair, SQLite non chiffrée,
  cache contenant des données sensibles, secrets hors Keychain/Keystore,
  `FLAG_SECURE` pour l'aperçu de l'app switcher.
- **Réseau** : TLS obligatoire, **certificate pinning** présent/absent,
  `networkSecurityConfig`, ATS iOS (`NSAllowsArbitraryLoads`), logs réseau
  verbeux en release.
- **Deep links / IPC** : composants exportés non protégés, deep links non validés,
  schémas d'URL détournables (un schéma personnalisé est revendicable par une
  autre app : ne jamais l'utiliser pour authentifier), WebView
  (`javaScriptEnabled`, `allowFileAccess`, URL non validée).
- **Runtime** : logs sensibles en release (`logcat` grep PII/jetons), root/jailbreak,
  verrouillage biométrique contournable.
- **SCA** : `flutter pub outdated`, CVE via `osv-scanner` sur `pubspec.lock` et les
  lockfiles Gradle, MobSF si disponible.

⚠️ **Le scan de secrets ne porte que sur ce que GIT SUIT.** Un secret présent
sur le disque mais gitignoré n'est pas une fuite — c'est la pratique correcte,
et `android/key.properties` en est l'exemple type. Scanner l'arborescence
entière remonte aussi tout SDK vendu dans le dépôt : mesuré sur un projet réel,
`.fvm/` (une copie complète du SDK Flutter, avec ses fausses clés de test)
produisait **9 findings bloquants, tous faux**, sur 6 127 fichiers parcourus là
où git en suit 288.

⚠️ **`allowSecretsIn` n'est pas une facilité, c'est une nécessité** :
`google-services.json` contient légitimement une clé `AIza` publique. Un rapport
qui crie au loup à chaque run finit par ne plus être lu.

> **Frontière** : tout ceci est automatisable et gatable en CI. Le **pentest
> mobile manuel** — hooking Frida, contournement de pinning, abus de logique
> métier — reste une intervention humaine séparée. Argus défriche le répétable.

### CONDITIONS RÉELLES
Réseau dégradé, **offline** et retour en ligne, mode avion, **permissions
refusées puis accordées** (le parcours le plus souvent cassé parce que le plus
rarement joué à la main), interruptions (appel, notification, changement d'app),
batterie faible, mémoire faible (`killApp` = mort de processus initiée par le
système, ce que fait l'OS sur un appareil d'entrée de gamme), device bas de gamme,
changement d'heure/fuseau, rotation.

⚠️ **`setAirplaneMode` et `toggleAirplaneMode` sont Android uniquement.** La doc
dit qu'ils « passent sans effet » sur iOS : un test de mode avion non gardé passe
au **vert** sur iOS en n'ayant rien testé. C'est un faux vert, pas une limitation
bénigne. Garde-les par `when: platform: Android`.

⚠️ **`travel` n'est PAS l'horloge du device** : c'est un déplacement GPS
(`points` + `speed`). Le sous-titre de sa page de doc dit le contraire de son
corps et de son exemple. L'horloge et le fuseau se figent en `adb shell`.
`setLocation` demande Android API ≥ 31.

### I18N/L10N
`fr-FR`, format **XOF/FCFA**, dates et nombres, clés de traduction manquantes,
débordement dû à la longueur du français.

⚠️ **Et pas depuis un AVD que tu lances toi-même non plus** — voir
`device-matrix.md` : `deviceLocale` ne passe que par `autoStart`, qui est
précisément ce qu'on n'utilise pas avec un `avd` nommé.

⚠️ **La locale ne se change pas depuis un flow.** `--device-locale` n'existe que
sur `maestro start-device` et `maestro cloud`, pas sur `maestro test`, et aucun
endroit d'un flow ne permet de la définir. Elle se fige au démarrage du device.

⚠️ Le séparateur de milliers du français est une **espace insécable étroite**
(U+202F) sur les Flutter récents, pas une espace ordinaire. Un `assertVisible`
écrit avec une espace normale échoue sans qu'on comprenne pourquoi — les
sélecteurs `text` étant des regex, `\s` couvre les deux.

⚠️ **UN SÉLECTEUR `text:` MATCHE LE NŒUD ENTIER, ET SUR FLUTTER UN NŒUD FUSIONNE
CE QU'IL RECOUVRE.** `text: 'Bienvenue'` ne trouve donc son élément que si le
nœud ne contient QUE ce mot — relevé sur un projet réel, `nav_history` rend
« Historique\nHISTORIQUE ». Écris `(?s).*Bienvenue.*` : le `(?s)` est nécessaire,
sans lui `.` ne franchit pas le saut de ligne du texte fusionné.

Les deux sens n'ont pas le même prix, et c'est le second qui coûte :

| Écrit non encadré | Ce qui se passe |
|---|---|
| `assertVisible` | échoue toujours — **bruyant**, on le voit tout de suite |
| `assertNotVisible` | **passe toujours** — muet, et il occupe la place du garde qu'on croyait avoir |
| `tapOn` + `optional: true` | ne tape rien — muet aussi : l'invite reste ouverte et pollue les captures |

⚠️ **L'attribut natif `text` est vide sur toute app Flutter** — une seule vue
native, seule l'horloge système en porte un ; ce que le sélecteur lit est le
libellé d'accessibilité. Ça ne change pas ce qu'on écrit (`text:` est le seul
sélecteur de texte que Maestro 2.8 connaît — `accessibilityText:` est refusé par
`check-syntax`, mesuré), mais ça change **où regarder** quand rien ne matche :
`maestro hierarchy`, et lis le libellé d'accessibilité, pas le texte.

═══════════════════════════════════════════════════════════════════════════════
## 7. Outillage + arborescence du scaffold
═══════════════════════════════════════════════════════════════════════════════

| Dimension | Outil | Étage |
|---|---|---|
| functional, resilience, lifecycle, i18n | Maestro | device |
| visual | Maestro `assertScreenshot` | device |
| a11y (couverture sémantique) | Maestro | device |
| a11y (cibles, contrastes, labels) | `flutter_test` `meetsGuideline` | **sans device** |
| layout à 130 % / 200 % | `flutter_test` | **sans device** |
| a11y (rendu réel) | `uiautomator dump` + `wm density` | device |
| performance | `adb` : `am start -W`, `gfxinfo`, `meminfo` | device |
| security statique | manifeste, `unzip`, `aapt2` | ni l'un ni l'autre |
| SCA | `osv-scanner`, `pub outdated` | ni l'un ni l'autre |
| exploration par un agent | **Maestro MCP** | device |

Arborescence installée dans le projet : voir le `README.md` du scaffold.

**RÈGLE** : tout finding EXPLORE stable et reproductible → codifié en flow Maestro,
ou en garde `flutter_test` si la mesure relève de l'étage 1.

═══════════════════════════════════════════════════════════════════════════════
## 8. Sévérité & gating CI
═══════════════════════════════════════════════════════════════════════════════
Table **identique au skill web** — la cohérence entre les deux est un objectif en soi.

| Sévérité | Définition | Exemple mobile typique | Effet CI |
|----------|-----------|------------------------|----------|
| **blocker**  | app inutilisable / parcours critique cassé / perte de données / secret exposé | crash au lancement · secret extrait du binaire · transfert qui débite deux fois | exit 2 |
| **critical** | fonctionnalité majeure cassée, sans contournement | connexion impossible sur une API level · trafic en clair | exit 2 |
| **major**    | dégradation nette / régression a11y ou perf significative | cible tactile sous 48 dp · démarrage à froid au double du budget · diff visuel | exit 1 |
| **minor**    | cosmétique, cas limite rare | libellé tronqué sur un seul gabarit | warn |
| **info**     | observation / amélioration | dépendance en retard · schéma d'URL déclaré | exit 0 |

GATE (REGRESS) : échec si sévérité ∈ `gate.failOn`, OU nouveau finding absent de
la baseline, OU diff visuel au-delà du seuil.

**Ajout mobile — `fail_on_empty_run`** : une suite où **aucun écran n'a d'ancre
sémantique** sort en **exit 2**, pas en vert. Un scaffold neuf n'exécute aucune
assertion ; le laisser passer produirait le pire résultat possible pour une garde
de non-régression — un vert qui rassure sans rien prouver.

De même, un **outil absent** donne une dimension `sautée` **mentionnée dans le
rapport**, jamais un vert. En CI, `--require-tools` transforme cette absence en
échec, parce qu'une CI où `osv-scanner` n'a pas été installé rendrait vert une
analyse de sécurité qui n'a rien analysé.

═══════════════════════════════════════════════════════════════════════════════
## 9. Déterminisme & anti-flake
═══════════════════════════════════════════════════════════════════════════════
- **Attendre un ÉTAT, jamais un délai.** `extendedWaitUntil` sur l'ancre de
  l'écran suivant, pas un `sleep`. Un délai fixe est soit trop court (flake), soit
  trop long (suite lente) ; il n'est jamais juste.
- **`clearState` avant chaque flow.** Sans lui, un flow hérite de l'onboarding
  déjà passé et de la session du précédent : son résultat dépend de l'ordre
  d'exécution, ce qui est la définition d'une suite non déterministe.
- **Couper les animations — les TROIS échelles.** `window_animation_scale`,
  `transition_animation_scale`, `animator_duration_scale`. En couper deux laisse
  assez de mouvement pour rendre une capture instable. ⚠️ Aucun flow ne peut le
  faire : la sandbox JavaScript de Maestro n'a ni shell ni système de fichiers, et
  `disableAnimations` du `config.yaml` est une option **Maestro Cloud uniquement**.
  C'est le runner qui s'en charge, en `adb`, et qui **relit la valeur** pour le
  prouver.
- **`waitForAnimationToEnd` n'est JAMAIS gratuit, et son `timeout` ne borne pas
  son coût.** Il compare deux captures successives — sur un émulateur une capture
  coûte ~2 s, donc l'appel coûte ~3 s **même sur un écran où rien ne bouge**, et
  le timeout ne coupe qu'*entre* deux captures : réglé à 5 000 ms, il rend 7,3 s
  face à une animation perpétuelle. Mesuré sur Maestro 2.8.0, trois répétitions
  par cas :

  | Écran | `waitForAnimationToEnd` |
  |---|---|
  | statique, rien ne bouge | 3084 · 3303 · 2991 ms |
  | indicateur perpétuel (`CircularProgressIndicator`) | 7330 · 7035 · 7642 ms |
  | *(coût d'une capture seule, pour comparaison)* | 3,0 · 2,0 · 2,1 s |

  Le scaffold l'appelle une dizaine de fois par suite complète — `launch-clean`
  est inclus par sept flows —, soit **une trentaine de secondes de plancher** sur
  une app parfaitement immobile. Deux conséquences : ne l'appelle pas « au cas
  où », et **ne baisse pas son timeout en espérant gagner du temps** — le plancher
  est fait de deux captures, pas du timeout. Ce qui se gagne vraiment est ailleurs :
  une animation perpétuelle à l'écran (halo, indicateur de chargement, pulsation)
  paie le plafond à chaque appel, et c'est elle qu'il faut figer.
- **Figer l'horloge, la locale et le fuseau** au démarrage du device.
- **Émulateur à snapshot connu** ; en CI, image et API level épinglés.
- **Baselines visuelles sur le même device/OS que la CI** — piège identique à
  celui des snapshots Playwright, et il coûte aussi cher.
- **Avant de déclarer un échec : RE-RUN.** Échec constant = bug ; intermittent =
  tag `@flaky` + quarantaine (`excludeTags`).
- **Les tags CLI REMPLACENT ceux du `config.yaml`.** Passer `--exclude-tags visual`
  seul réactive `wip` et `manual` en silence. Le runner ré-émet donc la liste du
  fichier en plus de la sienne.
- **Un échec Maestro sans étape fautive** (device perdu, driver, app absente) ne
  doit pas rendre vert sous prétexte qu'aucun finding n'a été produit.
- **Tout fichier YAML du workspace doit avoir une section de configuration**,
  sous-flows compris. Maestro valide l'ensemble des fichiers au démarrage :
  un seul sans en-tête fait tomber la suite entière sur « Config Section
  Required », avant qu'aucun flow ne tourne. Le glob `flows` de `config.yaml`
  décide de ce qui s'**exécute**, pas de ce qui se **parse**. Vérifié sur
  Maestro 2.8.0 ; aucun contrôle hors ligne ne le voit, seul `maestro
  check-syntax <fichier>` (un fichier à la fois) ou un vrai run le révèle.
