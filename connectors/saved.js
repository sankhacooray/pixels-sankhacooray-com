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
      const list = el("div", "saved-list");
      panel.appendChild(list);

      function skeletonCard() {
        const c = el("div", "saved-card skeleton");
        const strip = el("div", "saved-thumbs");
        for (let i = 0; i < 4; i++) strip.appendChild(el("div", "sk sk-thumb"));
        c.append(strip, el("div", "sk sk-line"), el("div", "sk sk-line short"));
        return c;
      }
      function message(text) {
        list.innerHTML = "";
        list.appendChild(el("p", "saved-empty", text));
      }

      async function load() {
        list.innerHTML = "";
        for (let i = 0; i < 3; i++) list.appendChild(skeletonCard());   // loading shimmer
        try {
          const sets = await host.loadSets();
          if (!sets.length) {
            message("No saved sets yet. Build a search, select photos, and Save to Drive.");
            return;
          }
          list.innerHTML = "";
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
          message("Could not load saved sets: " + err.message);
        }
      }

      // refresh lives on the My Library tab button (active only when selected)
      if (Pixels.setRefresh) Pixels.setRefresh("saved", load);
      load();
    }
  });
})();
