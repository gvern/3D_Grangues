# `web/assets/`

Runtime data fetched by `../app.js`/`../scene.js` (the domain mockup) and `surveys.json`
(the `../surveys/` point-cloud/GLB layer, see `../../docs/INTEGRATION-RELEVES.md`).

## In the repo

- `surveys.json` — the survey manifest (`schemaVersion: 1`, both sources `pending` until
  a real ATIS/Polycam export exists; see `../surveys/manifest.js` for the contract this
  file must satisfy).
- `photos.json` — reference-photo index, restored from an earlier byte-verbatim capture
  of the live deploy (`domaine-grangues-3d.gvern.chatgpt.site/assets/photos.json`, 30
  entries). `index.html`'s "Références" panel currently reads "trente et une
  photographies et le plan" (31 + 1) — one entry ahead of this file, so treat it as a
  reasonable starting point and re-sync it from the live deploy (see below) before
  relying on the exact count or the newest photo.

## Not yet in the repo — sync from the live deploy

Large/binary or proprietary data, kept out of git deliberately:

| File | What it is | Size (approx., per `docs/AUDIT-INTEGRATION-3D.md`) |
|---|---|---|
| `domain.json` | Cadastre parcels, IGN RGE ALTI terrain grid (12,870 samples per the audit), IGN BD TOPO building footprints/vegetation polygons, reprojected into the local frame (`crs: "EPSG:2154"`, `origin: [E, N]`). | — |
| `ortho.jpg` | IGN aerial orthophoto draped on the terrain mesh. | ~2.2 MB |
| `domaine-grangues.glb` | Initial exported model, linked from the "Imaginer" panel's direct-download button. | ~18.6 MB |
| photo JPEGs named in `photos.json` (and the one photo `photos.json` here is still missing — see above) | Reference photographs shown in the "Références" tab. | tens of MB total |

Without `domain.json`/`ortho.jpg`/`photos.json`, `app.js`'s `start()` fails its initial
`fetch()` and the page falls back to the `#error` panel cleanly (see `web/app.js`) —
this is the expected, tested state for a checkout that hasn't synced these yet, not a
bug. `surveys.json` alone is enough for `mountSurveys()` to initialize once the base
scene loads; both its sources are `pending`, so nothing else is fetched until a real
export lands and a `ready` source's `variants[].uri` names it (see
`../../docs/INTEGRATION-RELEVES.md`'s manifest contract — there's no fixed folder
convention for where survey content lives; each source's `uri` says).

Pull the JSON/JPEG assets once you have the deploy open in an authenticated browser tab
(the "Sign in with ChatGPT" gate is a per-session cookie, not something headless `curl`
can authenticate against on its own):

```bash
BASE=https://domaine-grangues-3d.gvern.chatgpt.site
curl -fSL "$BASE/assets/domain.json" -o domain.json
curl -fSL "$BASE/assets/ortho.jpg"   -o ortho.jpg
curl -fSL "$BASE/assets/photos.json" -o photos.json   # re-sync to pick up the 31st photo
python3 - "$BASE" <<'PY'
import json, sys, subprocess
base = sys.argv[1]
photos = json.load(open('photos.json'))
for p in photos:
    subprocess.run(['curl', '-fSL', f'{base}/assets/{p["file"]}', '-o', p['file']], check=True)
PY
```
