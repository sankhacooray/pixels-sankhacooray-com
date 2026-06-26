/**
 * Pixels host — the connector registry + shared services.
 *
 * The base platform is the data engine (engine.js). The host turns it into a
 * pluggable surface: it owns a tab strip, lets connectors register a view, and
 * hands every connector a `host` with shared services so they don't each
 * reinvent batching, cropping, or zipping.
 *
 * A connector is just an object:
 *   Pixels.register({
 *     id: "puzzle-builder",
 *     title: "Puzzle Builder",
 *     icon: "fa-solid fa-puzzle-piece",   // a Font Awesome class string
 *     mount(host, panel) { ...build UI into panel... }
 *   });
 *
 * Connectors call register() at script-load time; the host queues them and
 * wires everything up when Pixels.init() runs (after sign-in).
 */
(function () {
  window.Pixels = window.Pixels || {};
  Pixels.processors = Pixels.processors || {};

  const $ = function (s) { return document.querySelector(s); };
  const pending = [];          // connector configs registered before init()
  const views = [];            // {id, title, icon, _btn, activate(), deactivate()}
  let initialized = false;
  let tabStrip = null;
  let activeView = null;

  /* ---------- tab strip ---------- */

  function buildTabStrip() {
    tabStrip = document.createElement("div");
    tabStrip.className = "tabs";
    tabStrip.id = "tabs";
    const appbar = $(".appbar");
    appbar.insertBefore(tabStrip, appbar.firstChild);
  }

  function addTabButton(view) {
    const b = document.createElement("button");
    b.className = "tab";
    b.type = "button";
    if (view.icon) {            // view.icon is a Font Awesome class string
      const i = document.createElement("i");
      i.className = view.icon;
      b.appendChild(i);
      b.appendChild(document.createTextNode(" "));
    }
    b.appendChild(document.createTextNode(view.title));
    b.addEventListener("click", function () { activate(view.id); });
    view._btn = b;
    tabStrip.appendChild(b);
  }

  function activate(id) {
    const v = views.find(function (x) { return x.id === id; });
    if (!v || v === activeView) return;
    if (activeView) activeView.deactivate();
    activeView = v;
    v.activate();
    views.forEach(function (x) { x._btn.classList.toggle("active", x === v); });
  }

  /* ---------- views ---------- */

  // The built-in Search view = the existing DOM (appbar controls + results).
  function registerBuiltinSearch() {
    const controls = $("#search-controls");
    const panel = $("#view-search");
    const view = {
      id: "search", title: "Search", icon: "fa-solid fa-magnifying-glass",
      activate: function () { if (controls) controls.style.display = ""; if (panel) panel.style.display = ""; },
      deactivate: function () { if (controls) controls.style.display = "none"; if (panel) panel.style.display = "none"; }
    };
    views.push(view);
    addTabButton(view);
  }

  // A connector view = a fresh panel the connector mounts into (lazily).
  function wireConnector(c) {
    const panel = document.createElement("div");
    panel.className = "view";
    panel.id = "view-" + c.id;
    panel.style.display = "none";
    const wrap = $(".wrap");
    const footer = wrap.querySelector(".footer");
    wrap.insertBefore(panel, footer || null);
    let mounted = false;
    const view = {
      id: c.id, title: c.title, icon: c.icon,
      activate: function () {
        if (!mounted) { c.mount(host, panel); mounted = true; }
        const controls = $("#search-controls");
        if (controls) controls.style.display = "none";
        panel.style.display = "";
      },
      deactivate: function () { panel.style.display = "none"; }
    };
    views.push(view);
    addTabButton(view);
  }

  function register(c) {
    if (!initialized) { pending.push(c); return; }
    wireConnector(c);
  }

  function init() {
    if (initialized) return;
    buildTabStrip();
    registerBuiltinSearch();
    pending.splice(0).forEach(wireConnector);
    initialized = true;
    activate("search");
  }

  /* ---------- shared services for connectors ---------- */

  /**
   * Run many queries through the engine, sequentially, deduping by id.
   * Resolves to a flat array of normalized items. Re-gates on auth failure.
   *   onProgress({ index, total, query, phase, count, accumulated, error })
   */
  async function batchSearch(queries, opts, onProgress) {
    opts = opts || {};
    const delay = opts.delay == null ? 250 : opts.delay;
    const seen = new Set();
    const out = [];
    for (let i = 0; i < queries.length; i++) {
      const query = String(queries[i] || "").trim();
      if (!query) continue;
      if (onProgress) onProgress({ index: i, total: queries.length, query: query, phase: "start" });
      try {
        const result = await PixelsEngine.search({
          type: opts.type || "photos",
          query: query,
          orientation: opts.orientation || "",
          size: opts.size || "",
          perPage: opts.perPage || ""
        });
        result.items.forEach(function (it) {
          const key = it.type + ":" + it.id;
          if (seen.has(key)) return;
          seen.add(key);
          out.push(it);
        });
        if (onProgress) onProgress({ index: i, total: queries.length, query: query, phase: "done", count: result.items.length, accumulated: out.length });
      } catch (err) {
        if (err && err.code === "unauthorized") {
          if (window.pixelsReauth) window.pixelsReauth();
          throw err;
        }
        if (onProgress) onProgress({ index: i, total: queries.length, query: query, phase: "error", error: err.message });
      }
      if (i < queries.length - 1 && delay) {
        await new Promise(function (r) { setTimeout(r, delay); });
      }
    }
    return out;
  }

  function safeName(s) {
    return String(s || "item").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "item";
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /**
   * Zip a set of items and save it.
   *   opts.mode    "original" (default) | "cropped"  (cropped uses square-smart)
   *   opts.size    output square size for cropped mode (default 2048)
   *   opts.name    zip base name
   *   opts.onProgress({ index, total, query })
   */
  async function download(items, opts) {
    opts = opts || {};
    if (!window.JSZip) throw new Error("JSZip not loaded.");
    if (!items || !items.length) throw new Error("Nothing selected.");
    const mode = opts.mode || "original";
    const size = opts.size || 2048;
    const zip = new JSZip();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (opts.onProgress) opts.onProgress({ index: i, total: items.length, query: it.query });
      let blob, ext;
      if (mode === "cropped" && it.type === "photo") {
        const r = await Pixels.processors["square-smart"](it, { size: size });
        blob = r.blob; ext = "jpg";
      } else {
        const res = await fetch(it.downloadUrl || it.full);
        blob = await res.blob();
        ext = it.type === "video" ? "mp4" : "jpg";
      }
      zip.file(safeName(it.query) + "-" + it.id + "." + ext, blob);
    }
    const out = await zip.generateAsync({ type: "blob" });
    triggerDownload(out, (opts.name || "pixels") + ".zip");
  }

  /* ---------- the host object handed to every connector ---------- */

  const host = {
    engine: window.PixelsEngine,
    processors: Pixels.processors,
    batchSearch: batchSearch,
    download: download,
    triggerDownload: triggerDownload,
    safeName: safeName
  };

  Pixels.register = register;
  Pixels.init = init;
  Pixels.activate = activate;
  Pixels.host = host;
})();
