# Argus — Couche démo cinématique (MODE=DEMO uniquement)

> À lire seulement quand l'utilisateur veut une **capture vidéo type YouTube**. Cette couche
> se pose PAR-DESSUS l'audit EXPLORE (`references/methodology.md`) : on illustre l'audit réel,
> on ne le remplace pas. Le rythme cinématique (highlight/sleep/mousemove) ne s'applique QU'ICI ;
> en EXPLORE/REGRESS, on va à la vitesse machine.

## Setup
```bash
playwright-cli open <BASE_URL> --browser=chrome --headed
playwright-cli video-start argus-report/<RUN_NAME>/<RUN_NAME>.webm
```

## Règle de navigation (à chaque interaction)
Avant CHAQUE action, pour rendre la vidéo lisible :
1. `playwright-cli highlight <ref> --style="outline: 3px solid #E85D26"`  → sleep 1s
2. `playwright-cli mousemove <x> <y>`                                     → sleep 1s
3. seulement ensuite : `click` / `type` / `scroll`

Entre deux sections :
```bash
playwright-cli video-chapter "<Titre>" --description="…" --duration=3000
```

## Trame de chapitres (adapter à l'app testée)
1. **Homepage — audit visuel & console** → `playwright-cli console` (relève TOUS warnings/erreurs) + screenshot.
2. **Mobile — menu burger** → `resize 390 844` → highlight+mousemove+click sur le menu → screenshot → `console`.
3. **<Section interactive clé>** → filtres / accordéons / animations scroll ; `--raw eval` pour mesurer les états avant/après.
4. **Audit liens** → extraire les hrefs internes → statut HTTP par URL → surligner en rouge toute anomalie.
5. **Images & ressources** → `mousewheel 0 3000` (déclenche le lazy-load) → détecter les images cassées.
6. **Performance & accessibilité** → Core Web Vitals + top violations axe.
7. **Rapport final** → `video-stop` → `close` → ouvrir le rapport HTML.

## Annexe — snippets `--raw eval` prêts à l'emploi
Liens internes uniques :
```js
[...new Set([...document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>h.startsWith('<BASE_URL>')))]
```
Images cassées :
```js
[...document.querySelectorAll('img')].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src)
```
Hiérarchie des titres :
```js
[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h=>h.tagName+': '+h.innerText.trim())
```
TTFB (navigation timing) :
```js
performance.getEntriesByType('navigation')[0].responseStart
```
> Les headers de sécurité se mesurent via la réponse réseau (HAR), pas via le DOM.
