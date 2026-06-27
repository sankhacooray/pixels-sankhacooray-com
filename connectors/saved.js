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
    title: "Saved",
    icon: "fa-solid fa-bookmark",
    mount: function (host, panel) {
      const bar = el("div", "pb-card-panel");
      const head = el("div", "pb-presets");
      head.appendChild(el("span", "pb-presets-label", "Previous searches (saved to Drive):"));
      const refreshBtn = el("button", "pb-chip pb-chip-refresh");
      refreshBtn.type = "button";
      refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> refresh';
      head.appendChild(refreshBtn);
      bar.appendChild(head);
      const status = el("p", "pb-hint", "");
      bar.appendChild(status);
      panel.appendChild(bar);

      const list = el("div", "saved-list");
      panel.appendChild(list);

      async function load() {
        status.textContent = "Loading…";
        list.innerHTML = "";
        refreshBtn.disabled = true;
        try {
          const sets = await host.loadSets();
          if (!sets.length) {
            status.textContent = "No saved sets yet. Build a search, select photos, and Save to Drive.";
            return;
          }
          status.textContent = sets.length + " saved set" + (sets.length === 1 ? "" : "s") + ".";
          sets.forEach(function (s) {
            const card = el("div", "saved-card");
            const name = el("div", "saved-name", s.name);
            const meta = el("div", "saved-meta", s.created ? new Date(s.created).toLocaleString() : "");
            const open = el("button", "btn", "Open");
            open.type = "button";
            open.addEventListener("click", function () {
              if (Pixels.activate) Pixels.activate("puzzle-builder");   // ensure it's mounted
              if (window.PixelsPuzzle) {
                window.PixelsPuzzle.loadDriveSet({ id: s.id, name: s.name });
              }
            });
            card.append(name, meta, open);
            list.appendChild(card);
          });
        } catch (err) {
          if (err.code === "unauthorized") { if (window.pixelsReauth) window.pixelsReauth(); return; }
          status.textContent = "Could not load saved sets: " + err.message;
        } finally {
          refreshBtn.disabled = false;
        }
      }

      refreshBtn.addEventListener("click", load);
      load();
    }
  });
})();
