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

  const PRESETS = {
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

      // Preset chips
      const presetRow = el("div", "pb-presets");
      presetRow.appendChild(el("span", "pb-presets-label", "Presets:"));
      Object.keys(PRESETS).forEach(function (name) {
        const chip = el("button", "pb-chip", name);
        chip.type = "button";
        chip.addEventListener("click", function () {
          const existing = ta.value.trim() ? ta.value.trim().split("\n") : [];
          const merged = existing.concat(PRESETS[name]);
          // dedupe, keep order
          const seen = {}; const out = [];
          merged.forEach(function (q) { q = q.trim(); if (q && !seen[q]) { seen[q] = 1; out.push(q); } });
          ta.value = out.join("\n");
          updateQueryCount();
        });
        presetRow.appendChild(chip);
      });
      const clearQ = el("button", "pb-chip pb-chip-clear", "clear");
      clearQ.type = "button";
      clearQ.addEventListener("click", function () { ta.value = ""; updateQueryCount(); });
      presetRow.appendChild(clearQ);
      card.appendChild(presetRow);

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
      const selCount = el("span", "pb-selcount", "");
      const selAll = el("button", "pb-tbtn", "Select all");
      const selNone = el("button", "pb-tbtn", "Clear");
      const dlOrig = el("button", "btn pb-tbtn-primary", "Download originals");
      const dlCrop = el("button", "btn pb-tbtn-primary", "Download 2048² crops");
      [selAll, selNone].forEach(function (b) { b.type = "button"; });
      [dlOrig, dlCrop].forEach(function (b) { b.type = "button"; });
      toolbar.append(selCount, selAll, selNone, dlOrig, dlCrop);
      panel.appendChild(toolbar);

      /* ----- results grid ----- */
      const gridEl = el("div", "pb-grid");
      panel.appendChild(gridEl);

      function refreshSelCount() {
        selCount.textContent = selected.size + " of " + items.length + " selected";
        dlOrig.disabled = dlCrop.disabled = selected.size === 0;
      }

      function makeCard(it) {
        const k = keyOf(it);
        const c = el("div", "pb-result");
        c.dataset.key = k;

        const imgWrap = el("div", "pb-imgwrap");
        const img = el("img");
        img.loading = "lazy"; img.src = it.preview; img.alt = it.alt || "";
        imgWrap.appendChild(img);

        const cb = el("input", "pb-check"); cb.type = "checkbox";
        cb.checked = selected.has(k);
        cb.addEventListener("change", function () {
          if (cb.checked) selected.add(k); else selected.delete(k);
          c.classList.toggle("sel", cb.checked);
          refreshSelCount();
        });
        c.classList.toggle("sel", cb.checked);

        const qchip = el("span", "pb-qchip", it.query);
        const qual = el("span", "chip", quality(it.width, it.height));

        // original <-> cropped preview toggle
        const CROP_LABEL = '<i class="fa-solid fa-crop-simple"></i> crop';
        const ORIG_LABEL = '<i class="fa-solid fa-arrow-rotate-left"></i> original';
        const cropBtn = el("button", "pb-cropbtn");
        cropBtn.type = "button";
        cropBtn.innerHTML = CROP_LABEL;
        let cropped = false, croppedUrl = null;
        cropBtn.addEventListener("click", async function () {
          if (cropped) { img.src = it.preview; cropBtn.innerHTML = CROP_LABEL; cropped = false; return; }
          cropBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; cropBtn.disabled = true;
          try {
            if (!croppedUrl) {
              const r = await Pixels.processors["square-smart"](it, { size: 1024 });
              croppedUrl = r.dataUrl;
            }
            img.src = croppedUrl; cropBtn.innerHTML = ORIG_LABEL; cropped = true;
          } catch (e) {
            cropBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> failed';
          } finally { cropBtn.disabled = false; }
        });

        // click image toggles selection too (but let the checkbox / crop
        // button handle their own clicks, else we'd double-toggle)
        imgWrap.addEventListener("click", function (e) {
          if (e.target === cropBtn || e.target === cb) return;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event("change"));
        });

        imgWrap.append(cb, qual, qchip, cropBtn);
        c.appendChild(imgWrap);
        return c;
      }

      function renderGrid() {
        gridEl.innerHTML = "";
        items.forEach(function (it) { gridEl.appendChild(makeCard(it)); });
        toolbar.style.display = items.length ? "flex" : "none";
        refreshSelCount();
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
        items.forEach(function (it) { selected.add(keyOf(it)); });
        gridEl.querySelectorAll(".pb-check").forEach(function (cb) { cb.checked = true; });
        gridEl.querySelectorAll(".pb-result").forEach(function (c) { c.classList.add("sel"); });
        refreshSelCount();
      });
      selNone.addEventListener("click", function () {
        selected.clear();
        gridEl.querySelectorAll(".pb-check").forEach(function (cb) { cb.checked = false; });
        gridEl.querySelectorAll(".pb-result").forEach(function (c) { c.classList.remove("sel"); });
        refreshSelCount();
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
    }
  });
})();
