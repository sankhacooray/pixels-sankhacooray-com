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

- `index.html` — the UI (Photos + Videos tabs, query forms, results grid).
- `config.js` — the deployed Apps Script `/exec` URL (`window.PIXELS_API_BASE`). Not a secret.
- `CNAME` — custom domain for GitHub Pages.

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
