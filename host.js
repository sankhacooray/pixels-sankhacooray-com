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
    tabStrip.setAttribute("role", "tablist");
    tabStrip.setAttribute("aria-label", "Views");
    const appbar = $(".appbar");
    const brand = appbar.querySelector(".brand");
    appbar.insertBefore(tabStrip, brand ? brand.nextSibling : appbar.firstChild);
  }

  function addTabButton(view) {
    const wrap = document.createElement("div");
    wrap.className = "tab-wrap";
    const b = document.createElement("button");
    b.className = "tab";
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", "false");
    if (view.icon) {            // view.icon is a Font Awesome class string
      const i = document.createElement("i");
      i.className = view.icon;
      i.setAttribute("aria-hidden", "true");
      b.appendChild(i);
    }
    const label = document.createElement("span");
    label.textContent = view.title;
    b.appendChild(label);
    const badge = document.createElement("span");   // live count (Pixels.setBadge)
    badge.className = "tab-badge";
    badge.hidden = true;
    b.appendChild(badge);
    view._badge = badge;
    b.addEventListener("click", function () { activate(view.id); });
    view._btn = b;
    view._wrap = wrap;
    wrap.appendChild(b);
    tabStrip.appendChild(wrap);
  }

  /**
   * Attach a refresh button to a view's tab, runnable only while that view is
   * the active one. Connectors call Pixels.setRefresh(id, fn) during mount.
   */
  function setRefresh(id, fn) {
    const v = views.find(function (x) { return x.id === id; });
    if (!v) return;
    v.refresh = fn;
    if (!v._refreshBtn) {
      v._wrap.classList.add("has-refresh");
      const r = document.createElement("button");
      r.className = "tab-refresh";
      r.type = "button";
      r.title = "Refresh " + v.title;
      r.setAttribute("aria-label", "Refresh " + v.title);
      r.innerHTML = '<i class="fa-solid fa-rotate"></i>';
      r.addEventListener("click", function (e) {
        e.stopPropagation();
        if (activeView !== v || !v.refresh || r.classList.contains("spinning")) return;
        // spin while a returned promise is pending; always stops (success or failure)
        let ret;
        try { ret = v.refresh(); } catch (err) { ret = null; }
        if (ret && typeof ret.then === "function") {
          r.classList.add("spinning");
          const stop = function () { r.classList.remove("spinning"); };
          ret.then(stop, stop);
        }
      });
      v._refreshBtn = r;
      v._wrap.appendChild(r);
    }
    updateRefreshStates();
  }
  function updateRefreshStates() {
    views.forEach(function (v) { if (v._refreshBtn) v._refreshBtn.disabled = (v !== activeView); });
  }

  function activate(id) {
    const v = views.find(function (x) { return x.id === id; });
    if (!v || v === activeView) return;
    if (activeView) activeView.deactivate();
    activeView = v;
    v.activate();
    views.forEach(function (x) {
      x._btn.classList.toggle("active", x === v);
      x._btn.setAttribute("aria-selected", x === v ? "true" : "false");
      x._wrap.classList.toggle("active", x === v);
    });
    updateRefreshStates();
    try { localStorage.setItem("pixels-tab", v.id); } catch (e) {}
    if (v._btn.scrollIntoView && tabStrip.scrollWidth > tabStrip.clientWidth) {
      v._btn.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  /** Small count badge on a tab (n = 0 hides it). tone: "accent" | "danger". */
  function setBadge(id, n, tone) {
    const v = views.find(function (x) { return x.id === id; });
    if (!v || !v._badge) return;
    v._badge.hidden = !n;
    v._badge.textContent = n ? String(n) : "";
    v._badge.classList.toggle("danger", tone === "danger");
  }

  /* ←/→ switch tabs, unless typing, or an overlay (viewer, dialog) is open. */
  function onTabKey(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector(".pb-viewer[style*='flex'], .pb-block[style*='flex'], .pb-dialog-wrap[style*='flex']")) return;
    if (document.documentElement.classList.contains("landing")) return;
    const i = views.indexOf(activeView);
    if (i < 0) return;
    const next = views[(i + (e.key === "ArrowRight" ? 1 : -1) + views.length) % views.length];
    e.preventDefault();
    activate(next.id);
    if (t && t.closest && t.closest(".tabs")) next._btn.focus();
  }

  /* ---------- views ---------- */

  // The built-in Search view = the existing DOM (appbar controls + results).
  function registerBuiltinSearch() {
    const controls = $("#search-controls");
    const panel = $("#view-search");
    const view = {
      id: "search", title: "Pixels Library", icon: "fa-solid fa-magnifying-glass",
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
    let start = "search";            // reopen the last tab used in this browser
    try {
      const saved = localStorage.getItem("pixels-tab");
      if (saved && views.some(function (x) { return x.id === saved; })) start = saved;
    } catch (e) {}
    views.forEach(function (x) { if (x.id !== start) x.deactivate(); });   // only the start view shows
    activate(start);
    document.addEventListener("keydown", onTabKey);
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

  /**
   * Load the query groups from the linked Sheet, once and cached. The app bar
   * (for the sheet link) and the Puzzle Builder both call this; pass
   * force = true (Refresh button) to re-fetch the latest hand-edits.
   */
  let groupsCache = null;
  async function loadGroups(force) {
    if (groupsCache && !force) return groupsCache;
    groupsCache = await PixelsEngine.sheet();
    return groupsCache;
  }

  /* ---------- Drive: save / list / load / delete saved sets ---------- */

  /**
   * Save selected items as a new Drive set: crop each to a square, upload it,
   * and return { folderId, name, files:[{fileId,url,query,name}] }.
   *   onProgress({ index, total, phase:'crop'|'upload', query })
   */
  async function saveSet(name, items, opts) {
    opts = opts || {};
    const size = opts.size || 2048;
    // One id per save so a retried newSet reuses the same folder (no dupes).
    const batchId = "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const created = await PixelsEngine.post({ action: "newSet", name: name, batchId: batchId });
    const files = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (opts.onProgress) opts.onProgress({ index: i, total: items.length, phase: "crop", query: it.query });
      const cropped = await Pixels.processors["square-smart"](it, { size: size });
      const base64 = cropped.dataUrl.split(",")[1];
      const filename = safeName(it.query) + "-" + it.id + ".jpg";
      if (opts.onProgress) opts.onProgress({ index: i, total: items.length, phase: "upload", query: it.query });
      const up = await PixelsEngine.post({
        action: "saveImage", folderId: created.folderId, filename: filename, dataBase64: base64
      });
      files.push({ fileId: up.fileId, url: up.url, query: it.query, name: filename });
    }
    return { folderId: created.folderId, name: created.name, files: files };
  }

  function loadSets() { return PixelsEngine.sets(); }
  function loadSet(id) { return PixelsEngine.set(id); }
  function deleteFiles(fileIds) { return PixelsEngine.post({ action: "deleteFiles", fileIds: fileIds }); }

  /* ---------- the host object handed to every connector ---------- */

  const host = {
    engine: window.PixelsEngine,
    processors: Pixels.processors,
    batchSearch: batchSearch,
    download: download,
    loadGroups: loadGroups,
    saveSet: saveSet,
    loadSets: loadSets,
    loadSet: loadSet,
    deleteFiles: deleteFiles,
    triggerDownload: triggerDownload,
    safeName: safeName
  };

  Pixels.register = register;
  Pixels.init = init;
  Pixels.activate = activate;
  Pixels.setRefresh = setRefresh;
  Pixels.setBadge = setBadge;
  Pixels.host = host;
})();
