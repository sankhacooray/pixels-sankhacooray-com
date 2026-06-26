# pixels-sankhacooray-com

A tiny static playground for the **Pexels** photo & video API — search by
query / orientation / size / etc. and see results on screen. Live at
[pixels.sankhacooray.com](https://pixels.sankhacooray.com).

This is a **thin public client**. It holds no secrets: it calls a Google Apps
Script web app ([`pixels-sankhacooray-appscript`](https://github.com/sankhacooray/pixels-sankhacooray-appscript),
private) which proxies Pexels and keeps the API key in Script Properties.

```text
browser ──> Apps Script /exec (adds key) ──> api.pexels.com
```

## Files

- `index.html` — shell UI: sign-in gate, tab strip, built-in **Search** view.
- `config.js` — the deployed Apps Script `/exec` URL (`window.PIXELS_API_BASE`). Not a secret.
- `engine.js` — **the data engine.** `PixelsEngine.search()` → normalized items.
- `host.js` — connector registry + shared services (`Pixels.register`, `batchSearch`, `download`, tab strip).
- `connectors/` — pluggable add-ons (each registers a tab). `puzzle-builder.js` = batch-query → square-crop → zip.
- `processors/` — shared post-processors. `square-smart.js` = smartcrop saliency crop to a square.
- `vendor/` — `jszip` (zip download) and `smartcrop` (saliency crop).
- `CNAME` — custom domain for GitHub Pages.

## Connector architecture

The platform is split so features plug in without touching the base:

```text
connectors (puzzle-builder, …)   ← Pixels.register({ id, title, mount(host, panel) })
        │ use host services
host.js (registry · tabs · batchSearch · download · processors)
        │
engine.js  PixelsEngine.search()  ← the data engine (talks to the proxy)
```

A connector is just a JS object with `mount(host, panel)`. Inside `mount` it gets
`host.engine`, `host.batchSearch(queries, opts, onProgress)`, `host.processors`,
and `host.download(items, { mode })`. Add one: drop a file in `connectors/` and add
one `<script>` tag — no base changes. Post-processors (e.g. crop) live in `processors/`
and register into `Pixels.processors`.

## Run locally

```bash
python3 -m http.server 4490
# open http://localhost:4490
```

…or in VS Code: Run & Debug → **"Serve Pixels (Chrome)"** (F5). It calls the
live Apps Script endpoint, so it works the same locally as in production.

## Notes

- Pexels license requires showing credit ("Photos/Videos provided by Pexels").
- Free tier: 200 requests/hour, 20,000/month. The Apps Script proxy caches each
  query for 1 hour to stretch that.
