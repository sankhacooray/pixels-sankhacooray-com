/**
 * Puzzle Builder connector.
 *
 * Batch-runs many search queries through the data engine, merges + dedupes the
 * results into one selectable grid, can preview a saliency square-crop per
 * image, and zips the selection (originals or 2048² crops) for download.
 *
 * Built for seeding image sets — e.g. 100 clock-puzzle faces — from a handful
 * of category queries.
 *
 * Presets only contain Pexels-license-safe terms. Real movie/cartoon IP and
 * famous artworks are NOT on Pexels (use Wikimedia Commons / a licensed source
 * for those) — the Pop-culture preset is deliberately generic.
 */
(function () {
  if (!window.Pixels || !Pixels.register) return;

  // Preset groups normally come from the linked Google Sheet (one tab per
  // group). These built-in lists are only a fallback for when no sheet is
  // linked yet or the fetch fails.
  const FALLBACK_PRESETS = {
    "Scenery (SE Asia)": [
      "bali temple", "bali rice terrace", "tegalalang", "borobudur", "mount bromo",
      "thailand temple", "wat arun", "chiang mai lantern festival", "phi phi island",
      "kuala lumpur skyline", "petronas towers", "langkawi beach", "batu caves",
      "tropical rice terrace", "paddy field sunrise", "jungle waterfall"
    ],
    "Art & History": [
      "greek sculpture", "marble statue", "ancient ruins", "roman colosseum",
      "egyptian temple", "museum sculpture", "ancient pottery", "stone carving",
      "renaissance painting", "fresco"
    ],
    "Pop-culture (generic)": [
      "vintage cinema", "retro tv set", "film reel", "comic book pop art",
      "neon arcade", "vinyl records", "retro pop art dots", "movie theater seats"
    ]
  };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function quality(w, h) {
    const q = Math.min(w || 0, h || 0);
    if (q >= 2160) return "4K";
    if (q >= 1440) return "2K";
    if (q >= 1080) return "FHD";
    if (q >= 720) return "HD";
    return "SD";
  }

  Pixels.register({
    id: "puzzle-builder",
    title: "Puzzle Builder",
    icon: "fa-solid fa-puzzle-piece",
    mount: function (host, panel) {
      let items = [];                 // merged results
      const selected = new Set();     // keys (type:id) currently selected

      const keyOf = function (it) { return it.type + ":" + it.id; };

      /* ----- controls card ----- */
      const card = el("div", "pb-card-panel");

      // Preset groups (one chip per Google Sheet tab; falls back to built-ins).
      const presetRow = el("div", "pb-presets");
      const presetLabel = el("span", "pb-presets-label", "Groups:");
      const presetChips = el("span", "pb-chips");          // populated by renderChips()
      const refreshBtn = el("button", "pb-chip pb-chip-refresh");
      refreshBtn.type = "button";
      refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> refresh';
      refreshBtn.title = "Reload groups from the Google Sheet";
      const clearQ = el("button", "pb-chip pb-chip-clear", "clear");
      clearQ.type = "button";
      clearQ.addEventListener("click", function () { ta.value = ""; updateQueryCount(); });
      presetRow.append(presetLabel, presetChips, refreshBtn, clearQ);
      card.appendChild(presetRow);

      // Append a group's items to the textarea (dedupe, keep order).
      function applyGroup(groupItems) {
        const existing = ta.value.trim() ? ta.value.trim().split("\n") : [];
        const seen = {}; const out = [];
        existing.concat(groupItems).forEach(function (q) {
          q = String(q).trim();
          if (q && !seen[q]) { seen[q] = 1; out.push(q); }
        });
        ta.value = out.join("\n");
        updateQueryCount();
      }

      // (Re)build the chip row from an array of { name, items }.
      function renderChips(groups) {
        presetChips.innerHTML = "";
        groups.forEach(function (g) {
          const chip = el("button", "pb-chip", g.name + " (" + g.items.length + ")");
          chip.type = "button";
          chip.addEventListener("click", function () { applyGroup(g.items); });
          presetChips.appendChild(chip);
        });
      }

      // Load groups from the linked Sheet (host caches; force re-fetches).
      function fallbackGroups() {
        return Object.keys(FALLBACK_PRESETS).map(function (name) {
          return { name: name, items: FALLBACK_PRESETS[name] };
        });
      }
      async function loadPresets(force) {
        refreshBtn.disabled = true;
        presetLabel.textContent = "Groups: loading…";
        try {
          const d = await host.loadGroups(force);
          if (d && d.configured && d.groups.length) {
            renderChips(d.groups);
            presetLabel.textContent = "Groups:";
          } else {
            renderChips(fallbackGroups());
            presetLabel.textContent = d && !d.configured ? "Groups (built-in — no sheet linked):" : "Groups (built-in):";
          }
        } catch (err) {
          if (err.code === "unauthorized") { if (window.pixelsReauth) window.pixelsReauth(); return; }
          renderChips(fallbackGroups());
          presetLabel.textContent = "Groups (built-in — sheet unreachable):";
        } finally {
          refreshBtn.disabled = false;
        }
      }
      refreshBtn.addEventListener("click", function () { loadPresets(true); });

      // Query textarea
      const ta = el("textarea", "pb-textarea");
      ta.placeholder = "One search query per line…\nbali temple\nwat arun\ngreek sculpture";
      ta.rows = 6;
      card.appendChild(ta);

      // Options row
      const opts = el("div", "pb-controls");

      const perField = el("label", "pb-field");
      perField.appendChild(el("span", null, "Per query"));
      const perInput = el("input"); perInput.type = "number"; perInput.min = "1"; perInput.max = "80"; perInput.value = "10";
      perField.appendChild(perInput);
      opts.appendChild(perField);

      const orientField = el("label", "pb-field");
      orientField.appendChild(el("span", null, "Orientation"));
      const orientSel = el("select");
      ["square", "landscape", "portrait", ""].forEach(function (o) {
        const op = el("option", null, o || "any"); op.value = o; orientSel.appendChild(op);
      });
      orientField.appendChild(orientSel);
      opts.appendChild(orientField);

      const sizeField = el("label", "pb-field");
      sizeField.appendChild(el("span", null, "Crop size"));
      const sizeSel = el("select");
      [["2048", "2048²"], ["1024", "1024²"], ["4096", "4096²"]].forEach(function (pair) {
        const op = el("option", null, pair[1]); op.value = pair[0]; sizeSel.appendChild(op);
      });
      sizeField.appendChild(sizeSel);
      opts.appendChild(sizeField);

      const buildBtn = el("button", "btn", "Build");
      buildBtn.type = "button";
      opts.appendChild(buildBtn);
      card.appendChild(opts);

      const queryCount = el("p", "pb-hint", "");
      card.appendChild(queryCount);
      panel.appendChild(card);

      function updateQueryCount() {
        const n = ta.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).length;
        queryCount.textContent = n ? (n + " quer" + (n === 1 ? "y" : "ies") + " · ~" + (n * (parseInt(perInput.value, 10) || 0)) + " images max") : "";
      }
      ta.addEventListener("input", updateQueryCount);
      perInput.addEventListener("input", updateQueryCount);

      /* ----- progress / status ----- */
      const progress = el("p", "pb-progress", "");
      panel.appendChild(progress);

      /* ----- results toolbar ----- */
      const toolbar = el("div", "pb-toolbar");
      toolbar.style.display = "none";
      const source = el("span", "pb-source");      // where the list is served from
      source.innerHTML = '<i class="fa-solid fa-cloud"></i> Pixels Cloud';
      const selCount = el("span", "pb-selcount", "");
      const selAll = el("button", "pb-tbtn", "Select all");
      const selNone = el("button", "pb-tbtn", "Clear");
      const dlOrig = el("button", "btn pb-tbtn-primary", "Download originals");
      const dlCrop = el("button", "btn pb-tbtn-primary", "Download 2048² crops");
      const saveBtn = el("button", "btn pb-tbtn-primary pb-save");
      saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save to Drive';
      [selAll, selNone].forEach(function (b) { b.type = "button"; });
      [dlOrig, dlCrop, saveBtn].forEach(function (b) { b.type = "button"; });
      toolbar.append(source, selCount, selAll, selNone, dlOrig, dlCrop, saveBtn);
      panel.appendChild(toolbar);

      /* ----- results grid ----- */
      const gridEl = el("div", "pb-grid");
      panel.appendChild(gridEl);

      function refreshSelCount() {
        selCount.textContent = selected.size + " of " + items.length + " selected";
        dlOrig.disabled = dlCrop.disabled = saveBtn.disabled = selected.size === 0;
        if (viewerOpen) updateViewerBadge();
      }

      /* ----- selection (single source of truth: the `selected` Set) ----- */
      function selBtnHtml(on) {
        return on
          ? '<i class="fa-solid fa-check"></i> selected'
          : '<i class="fa-regular fa-square-plus"></i> select';
      }
      function cardByKey(key) {
        return gridEl.querySelector('.pb-result[data-key="' +
          (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
      }
      function setSelected(key, on) {
        if (on) selected.add(key); else selected.delete(key);
        const cardEl = cardByKey(key);
        if (cardEl) {
          cardEl.classList.toggle("sel", on);
          const b = cardEl.querySelector(".pb-selbtn");
          if (b) { b.classList.toggle("on", on); b.innerHTML = selBtnHtml(on); }
        }
        refreshSelCount();
      }
      function toggleSelected(key) { setSelected(key, !selected.has(key)); }

      function makeCard(it, idx) {
        const k = keyOf(it);
        const c = el("div", "pb-result");
        c.dataset.key = k;

        const imgWrap = el("div", "pb-imgwrap");
        const img = el("img");
        img.loading = "lazy"; img.src = it.preview; img.alt = it.alt || "";
        imgWrap.appendChild(img);

        // per-photo select button (green when selected; outlines the card green)
        const selBtn = el("button", "pb-selbtn");
        selBtn.type = "button";
        selBtn.innerHTML = selBtnHtml(selected.has(k));
        selBtn.classList.toggle("on", selected.has(k));
        selBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleSelected(k); });
        c.classList.toggle("sel", selected.has(k));

        const qchip = el("span", "pb-qchip", it.query);
        const qual = el("span", "chip", quality(it.width, it.height));

        // original <-> cropped preview toggle
        const CROP_LABEL = '<i class="fa-solid fa-crop-simple"></i> crop';
        const ORIG_LABEL = '<i class="fa-solid fa-arrow-rotate-left"></i> original';
        const cropBtn = el("button", "pb-cropbtn");
        cropBtn.type = "button";
        cropBtn.innerHTML = CROP_LABEL;
        let cropped = false, croppedUrl = null;
        cropBtn.addEventListener("click", async function (e) {
          e.stopPropagation();
          if (cropped) { img.src = it.preview; cropBtn.innerHTML = CROP_LABEL; cropped = false; return; }
          cropBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; cropBtn.disabled = true;
          try {
            if (!croppedUrl) {
              const r = await Pixels.processors["square-smart"](it, { size: 1024 });
              croppedUrl = r.dataUrl;
            }
            img.src = croppedUrl; cropBtn.innerHTML = ORIG_LABEL; cropped = true;
          } catch (e2) {
            cropBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> failed';
          } finally { cropBtn.disabled = false; }
        });

        // clicking the photo opens the large viewer (selection is the button / space bar)
        imgWrap.addEventListener("click", function () { openViewer(idx); });

        imgWrap.append(selBtn, qual, qchip, cropBtn);
        c.appendChild(imgWrap);
        return c;
      }

      function renderGrid() {
        if (viewerOpen) closeViewer();
        gridEl.innerHTML = "";
        items.forEach(function (it, idx) { gridEl.appendChild(makeCard(it, idx)); });
        toolbar.style.display = items.length ? "flex" : "none";
        refreshSelCount();
      }

      /* ----- photo viewer (large view; space = select, arrows = navigate) ----- */
      let viewerEl = null, viewerImg = null, viewerPos = null, viewerCount = null, viewerSel = null;
      let viewerOpen = false, curIndex = 0;

      function buildViewer() {
        viewerEl = el("div", "pb-viewer");

        const bar = el("div", "pb-viewer-bar");
        viewerPos = el("span", "pb-viewer-pos");
        viewerCount = el("span", "pb-viewer-count");
        const spacer = el("span"); spacer.style.flex = "1";
        const hint = el("span", "pb-viewer-hint", "Space = select · ← → navigate · Esc = exit");
        const exitBtn = el("button", "pb-viewer-exit");
        exitBtn.type = "button";
        exitBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Exit';
        exitBtn.addEventListener("click", closeViewer);
        bar.append(viewerPos, viewerCount, spacer, hint, exitBtn);

        const stage = el("div", "pb-viewer-stage");
        const prev = el("button", "pb-viewer-nav");
        prev.type = "button"; prev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        prev.addEventListener("click", function () { viewerNav(-1); });
        const next = el("button", "pb-viewer-nav");
        next.type = "button"; next.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        next.addEventListener("click", function () { viewerNav(1); });

        const wrap = el("div", "pb-viewer-imgwrap");
        viewerImg = el("img", "pb-viewer-img");
        viewerSel = el("button", "pb-viewer-sel");
        viewerSel.type = "button";
        viewerSel.addEventListener("click", function () { toggleSelected(keyOf(items[curIndex])); });
        wrap.append(viewerImg, viewerSel);
        stage.append(prev, wrap, next);

        viewerEl.append(bar, stage);
        viewerEl.addEventListener("click", function (e) { if (e.target === viewerEl) closeViewer(); });
        document.body.appendChild(viewerEl);
      }

      function openViewer(index) {
        if (!items.length) return;
        if (!viewerEl) buildViewer();
        curIndex = index; viewerOpen = true;
        viewerEl.style.display = "flex";
        document.addEventListener("keydown", viewerKey);
        renderViewer();
      }
      function renderViewer() {
        const it = items[curIndex];
        viewerImg.src = it.full || it.preview;
        viewerImg.alt = it.alt || "";
        viewerPos.textContent = (curIndex + 1) + " / " + items.length;
        updateViewerBadge();
      }
      function updateViewerBadge() {
        if (!viewerSel) return;
        const on = selected.has(keyOf(items[curIndex]));
        viewerSel.classList.toggle("on", on);
        viewerSel.innerHTML = on
          ? '<i class="fa-solid fa-circle-check"></i> Selected'
          : '<i class="fa-regular fa-circle"></i> Select';
        viewerCount.textContent = "Selected: " + selected.size;
      }
      function viewerNav(delta) {
        curIndex = (curIndex + delta + items.length) % items.length;
        renderViewer();
      }
      function closeViewer() {
        viewerOpen = false;
        if (viewerEl) viewerEl.style.display = "none";
        document.removeEventListener("keydown", viewerKey);
      }
      function viewerKey(e) {
        if (e.key === "ArrowRight") { e.preventDefault(); viewerNav(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); viewerNav(-1); }
        else if (e.key === " " || e.code === "Space") { e.preventDefault(); toggleSelected(keyOf(items[curIndex])); }
        else if (e.key === "Escape") { e.preventDefault(); closeViewer(); }
      }

      /* ----- build ----- */
      buildBtn.addEventListener("click", async function () {
        const queries = ta.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        if (!queries.length) { progress.textContent = "Add at least one query."; return; }
        buildBtn.disabled = true;
        items = []; selected.clear(); gridEl.innerHTML = ""; toolbar.style.display = "none";
        progress.classList.remove("error");
        try {
          items = await host.batchSearch(queries, {
            type: "photos",
            perPage: parseInt(perInput.value, 10) || 10,
            orientation: orientSel.value
          }, function (p) {
            if (p.phase === "start") {
              progress.textContent = "Searching " + (p.index + 1) + "/" + p.total + ": “" + p.query + "”…";
            } else if (p.phase === "done") {
              progress.textContent = (p.index + 1) + "/" + p.total + " done · " + p.accumulated + " unique images so far";
            } else if (p.phase === "error") {
              progress.textContent = "“" + p.query + "” failed: " + p.error;
            }
          });
          progress.textContent = "Done · " + items.length + " unique images from " + queries.length + " queries.";
          renderGrid();
        } catch (err) {
          progress.textContent = err.code === "unauthorized" ? "Session expired — sign in again." : ("Error: " + err.message);
          progress.classList.add("error");
        } finally {
          buildBtn.disabled = false;
        }
      });

      /* ----- selection + download ----- */
      selAll.addEventListener("click", function () {
        items.forEach(function (it) { setSelected(keyOf(it), true); });
      });
      selNone.addEventListener("click", function () {
        items.forEach(function (it) { setSelected(keyOf(it), false); });
      });

      function selectedItems() {
        return items.filter(function (it) { return selected.has(keyOf(it)); });
      }

      async function runDownload(mode, btn) {
        const chosen = selectedItems();
        if (!chosen.length) return;
        const label = btn.textContent;
        btn.disabled = true;
        try {
          await host.download(chosen, {
            mode: mode,
            size: parseInt(sizeSel.value, 10) || 2048,
            name: "puzzle-" + mode,
            onProgress: function (p) { btn.textContent = "Zipping " + (p.index + 1) + "/" + p.total + "…"; }
          });
          btn.textContent = label;
        } catch (err) {
          progress.textContent = "Download failed: " + err.message;
          progress.classList.add("error");
          btn.textContent = label;
        } finally {
          btn.disabled = false;
        }
      }
      dlOrig.addEventListener("click", function () { runDownload("original", dlOrig); });
      dlCrop.addEventListener("click", function () { runDownload("cropped", dlCrop); });

      /* ----- save selected to a Drive set ----- */
      function pad2(n) { return (n < 10 ? "0" : "") + n; }
      function defaultSetName() {
        const d = new Date();
        const stamp = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
          " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
        const first = selectedItems()[0];
        return (first ? first.query : "set") + " " + stamp;
      }
      let blockEl = null, blockText = null;
      function block(on, text) {
        if (!blockEl) {
          blockEl = el("div", "pb-block");
          const box = el("div", "pb-block-box");
          const spin = el("i", "fa-solid fa-spinner fa-spin"); spin.style.fontSize = "28px";
          blockText = el("div", "pb-block-text", "");
          box.append(spin, blockText);
          blockEl.appendChild(box);
          document.body.appendChild(blockEl);
        }
        if (text != null) blockText.textContent = text;
        blockEl.style.display = on ? "flex" : "none";
      }
      saveBtn.addEventListener("click", async function () {
        const chosen = selectedItems();
        if (!chosen.length) return;
        const name = window.prompt("Name this saved set:", defaultSetName());
        if (name === null) return;                     // cancelled
        const setName = name.trim() || defaultSetName();
        if (viewerOpen) closeViewer();
        block(true, "Saving 0/" + chosen.length + "…");
        progress.classList.remove("error");
        try {
          const result = await host.saveSet(setName, chosen, {
            size: parseInt(sizeSel.value, 10) || 2048,
            onProgress: function (p) {
              const verb = p.phase === "crop" ? "Cropping" : "Uploading";
              block(true, verb + " " + (p.index + 1) + "/" + p.total + " — “" + p.query + "”");
            }
          });
          progress.textContent = "Saved " + result.files.length + " images to “" + result.name + "”. ";
          const a = el("a", null, "Open in Drive ↗");
          a.href = "https://drive.google.com/drive/folders/" + result.folderId;
          a.target = "_blank"; a.rel = "noopener";
          progress.appendChild(a);
          progress.appendChild(document.createTextNode(" · find it later in the Saved tab."));
        } catch (err) {
          if (err.code === "unauthorized") { if (window.pixelsReauth) window.pixelsReauth(); }
          else { progress.textContent = "Save failed: " + err.message; progress.classList.add("error"); }
        } finally {
          block(false);
        }
      });

      /* ----- initial load: pull groups from the Sheet ----- */
      loadPresets();
    }
  });
})();
