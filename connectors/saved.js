/**
 * Saved connector — "Previous searches".
 *
 * Lists the puzzle sets saved to Drive (one folder per set). Opening a set
 * hands it to the Puzzle Builder, which displays it in drive mode (per-photo
 * delete-flag + global Update). Read-only here; all editing happens there.
 */
(function () {
  if (!window.Pixels || !Pixels.register) return;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  Pixels.register({
    id: "saved",
    title: "My Library",
    icon: "fa-solid fa-bookmark",
    mount: function (host, panel) {
      const bar = el("div", "pb-card-panel");
      const head = el("div", "pb-presets");
      head.appendChild(el("span", "pb-presets-label", "Previous searches (saved to Drive):"));
      bar.appendChild(head);
      const status = el("p", "pb-hint", "");
      bar.appendChild(status);
      panel.appendChild(bar);

      const list = el("div", "saved-list");
      panel.appendChild(list);

      async function load() {
        status.textContent = "Loading…";
        list.innerHTML = "";
        try {
          const sets = await host.loadSets();
          if (!sets.length) {
            status.textContent = "No saved sets yet. Build a search, select photos, and Save to Drive.";
            return;
          }
          status.textContent = sets.length + " saved set" + (sets.length === 1 ? "" : "s") + ".";
          sets.forEach(function (s) {
            const card = el("div", "saved-card");

            // first 4 photos as a thumbnail strip
            const strip = el("div", "saved-thumbs");
            (s.thumbs || []).slice(0, 4).forEach(function (u) {
              const im = el("img");
              im.loading = "lazy"; im.src = u;
              im.addEventListener("error", function () {          // fresh-upload thumbnail lag
                if (im.dataset.retried) return;
                im.dataset.retried = "1";
                setTimeout(function () { im.src = u + (u.indexOf("?") >= 0 ? "&" : "?") + "r=" + Date.now(); }, 1500);
              });
              strip.appendChild(im);
            });
            if ((s.thumbs || []).length) card.appendChild(strip);

            const name = el("div", "saved-name", s.name);
            const metaText = (s.count != null ? s.count + " photo" + (s.count === 1 ? "" : "s") : "") +
              (s.count != null && s.created ? " · " : "") +
              (s.created ? new Date(s.created).toLocaleString() : "");
            const meta = el("div", "saved-meta", metaText);
            card.append(name, meta);

            // whole card opens the set
            card.title = "Open “" + s.name + "”";
            card.addEventListener("click", function () {
              if (Pixels.activate) Pixels.activate("puzzle-builder");   // ensure it's mounted
              if (window.PixelsPuzzle) {
                window.PixelsPuzzle.loadDriveSet({ id: s.id, name: s.name });
              }
            });
            list.appendChild(card);
          });
        } catch (err) {
          if (err.code === "unauthorized") { if (window.pixelsReauth) window.pixelsReauth(); return; }
          status.textContent = "Could not load saved sets: " + err.message;
        }
      }

      // refresh lives on the My Library tab button (active only when selected)
      if (Pixels.setRefresh) Pixels.setRefresh("saved", load);
      load();
    }
  });
})();
