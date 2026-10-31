# pixels.sankhacooray.com

Static client on GitHub Pages from `main` (deploy = `git push`); read PROJECT.md first. When any local `.css`/`.js` changes, bump the shared `?v=` stamp in `index.html`.

## Lighthouse
<!-- lighthouse-optimized: 2026-10-31 -->
- Baseline mobile: performance 61 · accessibility 97 · best-practices 79 · SEO 100.
- Fixed: landing demo photos self-hosted as sized WebP in `assets/landing/` (tiles pre-cropped to 280px squares at their old object-position; stage image srcset). This removes the hot-linked images.pexels.com requests and their third-party `__cf_bm`/`_cfuvid` cookies. Filled-button green darkened to #04846b (`--lp-cta`, `--accent-btn`; 4.65:1 with white), footer text uses `--muted`. Google Fonts and Font Awesome CSS load non-blocking. The hero is pre-sized to its screen-fit height in CSS (desktop CLS was 0.37 from landing.js re-centring it).
- Left: Font Awesome stays (39 icons, some injected by JS; too many to inline) and keeps its own `font-display: block`. Signed-in search results still load from images.pexels.com, which is how the app works. jszip/smartcrop stay sync (the inline app script depends on them). Cache TTLs can't be set on GitHub Pages. Shared scripts, gtag and the GSI client are handled centrally or are third-party.
