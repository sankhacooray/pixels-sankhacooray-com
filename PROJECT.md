# Pixels — project notes

Working notes for **pixels.sankhacooray.com**: what it is, how it's built, how to
run/deploy it, the one-time setup, the gotchas we hit, and what's left. Read this
first when resuming.

> Purpose: originally a Pexels search playground; grown into a small **pluggable
> platform** for assembling image sets — specifically **100 clock-puzzle faces** —
> by batch-searching Pexels, smart-cropping to squares, and saving/retrieving sets
> in Google Drive.

---

## 1. Repos & hosting

| Repo | Visibility | Role |
|---|---|---|
| `pixels-sankhacooray-com` | public, GitHub Pages → `pixels.sankhacooray.com` | thin static client (this repo) |
| `pixels-sankhacooray-appscript` | private, clasp-managed | Apps Script web app: proxies Pexels + reads Sheet + Drive save/retrieve |

- **Frontend deploy** = push to `main` (Pages serves `main` root). No build step.
- **Backend owner** = **bsc2fast@gmail.com**. All clasp commands use **`--user travel`**.
- Both repos currently develop on `main`.

### Key IDs / URLs (all public, no secrets)
- Apps Script **scriptId**: `1blc3mIN-gWKlGzz5SY3eG4X4nolkR5Qgi4A2yvrAO2aNexwsOiOzSVZI`
- Stable **deploymentId** (in `deploy.js`): `AKfycbwA78jdPLLFs1GfN3jcZV6al-NLuTCRucgAOt1LpWR_emqzY_M8nNco6dW702I1YNlL9A`
- **/exec** (`config.js` → `PIXELS_API_BASE`): `https://script.google.com/macros/s/AKfycbwA…/exec`
- **Auth** (`PIXELS_AUTH_URL`, central login service `auth-sankhacooray-com`): `…/AKfycbycqFHit…/exec`, app id `pixels`
- **Google OAuth Client ID** (`GOOGLE_CLIENT_ID`): `493333437594-ec0vo8e856vcrk9gfb139aehdd5nvc0a.apps.googleusercontent.com`
- **Save root folder** (Drive, owned by bsc2fast): `https://drive.google.com/drive/folders/1iC9yIZT34wI-fFJUn79F7HrKAUCGNI3b` (currently named/renamable to "Pixels")

---

## 2. Architecture

Two clean halves, with a connector platform on the client.

```
┌─ Connectors (tabs) ───────────────────────────────────────────┐
│  (built-in) Pixels Library  ·  Puzzle Builder  ·  My Library   │
├─ Host / registry (host.js) ───────────────────────────────────┤
│  Pixels.register({id,title,icon,mount}) · tab strip ·          │
│  setRefresh(id,fn) · shared services: batchSearch, download,   │
│  loadGroups, saveSet, loadSets, loadSet, deleteFiles           │
├─ Data engine (engine.js) ─────────────────────────────────────┤
│  PixelsEngine.search / sheet / sets / set / post               │
│  (normalized items; token handling; talks to the proxy)        │
└─ Apps Script proxy (Code.js) ─────────────────────────────────┘
     Pexels · Google Sheet (query groups) · Drive (saved sets)
```

### Client file map (`pixels-sankhacooray-com`)
- `index.html` — shell: sign-in gate, app bar + tab strip, built-in **Pixels Library** (search) view, all CSS, the photo viewer/save/block overlays live here as styles.
- `landing.css` / `landing.js` — the signed-out landing page (the `#gate` overlay in index.html): hero, how it works, smart-crop demo, viewer keys; sign-in happens in its centred panel (`PixelsLanding.openSignin`). A pre-paint script in `<head>` adds `html.authed` when a live token exists, so signed-in users never see it.
- `config.js` — public endpoint URLs + client id.
- `engine.js` — `window.PixelsEngine`: `search()`, `sheet()`, `sets()`, `set(id)`, `post(payload)`. Normalizes items to `{id,type,query,width,height,preview,full,downloadUrl,alt,credit}`. `post()` retries the Apps-Script redirect bounce.
- `host.js` — `window.Pixels`: `register`, `init`, `activate`, `setRefresh`, `host` (shared services). Owns tab strip + per-tab refresh (active only on selected view).
- `connectors/puzzle-builder.js` — the main workspace. Batch build → grid + photo viewer → select/save (pixels mode) OR flag/delete (drive mode).
- `connectors/saved.js` — **My Library** tab: lists saved Drive sets (skeleton loading, 2×2 thumbs, whole-card click) → opens a set in Puzzle Builder drive mode via `window.PixelsPuzzle.loadDriveSet({id,name})`.
- `processors/square-smart.js` — `Pixels.processors["square-smart"](item,{size})` → saliency square crop (smartcrop.js), center-crop fallback. Default 2048².
- `vendor/jszip.min.js`, `vendor/smartcrop.min.js` — vendored libs.

### Backend (`pixels-sankhacooray-appscript/src/Code.js`)
- `doGet` routes by `type`: `photos|videos` (Pexels), `sheet` (query groups), `sets` (list saved sets), `set&id=` (one set's images). All gated by `&token=`.
- `doPost` (JSON as text/plain, no CORS preflight) actions: `newSet` (idempotent by `batchId`), `saveImage` (idempotent by filename; sets file link-viewable), `deleteFiles`.
- `setupPuzzleSheet()` — one-time: creates+seeds the query-group Sheet, stores `SHEET_ID`.
- `saveRoot_()` — lazily creates the Drive root ("Pixels"), stored in `SAVE_FOLDER_ID`; **self-heals** if trashed/deleted.
- Uses **advanced services** `Sheets` v4 + `Drive` v3 (NOT `SpreadsheetApp`/`DriveApp`).

---

## 3. Features (what's done)

- **Connector platform** — engine/host/connectors/processors split; add a feature = one file in `connectors/` + one `<script>` tag.
- **Puzzle Builder**
  - Batch queries (textarea, one per line) + **preset group chips** loaded from a Google Sheet (one tab = one group; every non-empty cell = one query; `_`-prefixed tabs skipped). Refresh re-pulls.
  - `batchSearch` runs queries sequentially, dedupes, progress counter; well under Pexels 200/hr (proxy caches each query 1h).
  - Grid with per-photo **smart-crop preview toggle**, quality chip, source query chip.
  - **Photo viewer** (lightbox): ←/→ navigate, **Space = select** (pixels) / flag (drive), **Delete = flag** (drive), badge pinned to image top-right, live count, Exit/Esc/backdrop.
  - **Download** selected as zip (originals or 2048² crops).
  - **Save to Drive**: crops selected → uploads to a per-set folder named `<query> <timestamp>` → flips into drive view.
- **Google Sheet query groups** — `type=sheet`; app-bar **database icon** links to the sheet.
- **Drive save/retrieve**
  - **My Library** tab lists saved sets (count + first 4 thumbnails, skeleton loading).
  - Open a set → **drive mode**: build UI hidden, source shows "My Drive · <set>", a Drive-folder link icon, per-photo **red delete-flag**, global **Update (delete flagged)** with confirm → deletes only flagged, reloads.
- **UI** (Oct 2026 refresh, follows the `ui-ux-style` principles): signed-out **landing page** (`landing.*`); app CSS in `app.css`; floating frosted app bar (brand · tabs · sheet + theme icons); search panel inside the Library view; tab badges via `Pixels.setBadge`; last tab remembered, ←/→ switch tabs; skeleton/empty/error states; in-app name/confirm dialogs (no `prompt`/`confirm`); one-line footer in flow; light theme default.

---

## 4. Deploy

**Frontend:**
Pages lets browsers cache CSS/JS ~10 min, so when you change any local `.css`/`.js`, bump the shared `?v=` stamp on their tags in `index.html` (e.g. `sed -i '' "s/?v=OLD/?v=NEW/g" index.html`) or users get new HTML with stale styles.
```bash
git add -A && git commit -m "…" && git push origin main   # GitHub Pages serves main root
# verify: curl https://pixels.sankhacooray.com/<file> (CDN can lag ~30–60s per file)
```

**Backend (from `pixels-sankhacooray-appscript`):**
```bash
node deploy.js            # clasp push --force --user travel  +  redeploy the FIXED deploymentId
# deploy.js keeps /exec stable. `clasp deploy` ALONE would mint a new URL — don't.
```
Current backend deployment version: **@10**.

---

## 5. One-time / owner setup (Apps Script UI: `npm run open`)
1. **Script Properties**: `PEXELS_API_KEY`, `AUTH_SECRET` (same value as the auth service). `SHEET_ID` / `SAVE_FOLDER_ID` are created automatically.
2. Run **`authorize()`** once (grants `script.external_request`).
3. Run **`setupPuzzleSheet()`** once (creates+seeds the Sheet, grants `drive.file`). Bypass the "Google hasn't verified this app" screen via **Advanced → Go to … (unsafe)** — safe because you're the developer authorizing your own script.
4. First Drive save may prompt to **enable the Drive API** (open the link in the error once), same for Sheets API. `drive.file` = per-file scope (app only touches files it creates).

---

## 6. Gotchas (hard-won)
- **`drive.file` needs advanced services.** `SpreadsheetApp.create`/`DriveApp` hard-require the broad `spreadsheets`/`drive` scopes and throw under `drive.file`. Use the **Sheets v4 / Drive v3 advanced services** (REST) — they honour `drive.file` for app-created files.
- **Apps Script POST redirect bounce.** POST → 302 → googleusercontent echo; under rapid sequential POSTs it intermittently bounces to bare `/exec` (→ `doGet` "Pass type=" error). Fixed by **retry in `engine.post`** + **server idempotency** (`newSet` by `batchId`, `saveImage` by filename) so retries never duplicate.
- **Self-healing root folder.** `SAVE_FOLDER_ID` could point at a folder the user trashed → saves silently land in Trash. `saveRoot_()` now verifies existence/trashed and recreates.
- **Folder rename is safe.** Everything references the folder **ID**, never the name. Renaming "Pixels" by hand won't break anything; only trashing would (and self-heal covers it).
- **Drive thumbnails**: displayed via `drive.google.com/thumbnail?id=…&sz=w…`; fresh uploads can 404 briefly → images retry once after 1.5s.
- **Drive for Desktop**: files are owned by **bsc2fast**, so they only sync to a Drive Desktop signed into bsc2fast; a restart of Drive for Desktop is often needed to index API-created folders.
- **CORS**: proxy GETs work cross-origin; writes POST as `text/plain` to dodge preflight. Pexels CDN sends `ACAO:*` so canvas crops + zip work client-side.
- **Errors** come back HTTP 200 with `{error}` in the body (ContentService can't set status) — client branches on `data.error`, `.code==="unauthorized"` re-gates.

---

## 7. Backend API reference
```
GET  /exec?type=photos&query=…&orientation=&size=&color=&per_page=&page=&token=
GET  /exec?type=videos&query=…&…&token=
GET  /exec?type=sheet&token=                 → { groups:[{name,items}], sheetUrl }
GET  /exec?type=sets&token=                  → { sets:[{id,name,created,count,thumbs[]}] }
GET  /exec?type=set&id=<folderId>&token=     → { images:[{id,name,url}] }
POST /exec  (text/plain JSON body, incl. token)
     {action:"newSet", name, batchId}        → { folderId, name }
     {action:"saveImage", folderId, filename, dataBase64} → { fileId, url }
     {action:"deleteFiles", fileIds:[…]}      → { deleted }
```
Scopes: `script.external_request`, `drive.file`. Advanced services: Sheets v4, Drive v3.
Script Properties: `PEXELS_API_KEY`, `AUTH_SECRET`, `SHEET_ID`, `SHEET_URL`, `SAVE_FOLDER_ID`.

---

## 8. Open items / backlog
- [ ] **Seed fuller query lists** into the Sheet (the broader Scenery/Art/Pop-culture sets we drafted) and optionally a **Wikimedia Commons** group (public-domain art/history — not on Pexels).
- [ ] **"Delete whole set"** action on My Library cards (delete the folder, not just flagged files).
- [ ] Consider **delete → trash instead of permanent** (currently `Drive.Files.remove` is permanent; confirm dialog says so).
- [ ] Watch **Drive thumbnail reliability**; fallback URL `lh3.googleusercontent.com/d/<id>=w2048` is ready if `thumbnail?id=` proves flaky.
- [ ] Pop-culture / real IP images need a licensed source (Pexels only has generic "vibe" terms).
- [ ] Backlog idea: reuse this to auto-pick a scenery hero video for v3 (see network memory).

---

_Last updated: 2026-08. Companion: `README.md` (this repo) and `pixels-sankhacooray-appscript/README.md`._
