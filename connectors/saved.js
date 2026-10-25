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
        c.setAttribute("aria-hidden", "true");
        const strip = el("div", "saved-thumbs");
        for (let i = 0; i < 4; i++) strip.appendChild(el("div", "sk sk-thumb"));
        c.append(strip, el("div", "sk sk-line"), el("div", "sk sk-line short"));
        return c;
      }
      function message(icon, title, text, danger, action) {
        list.innerHTML = "";
        const box = el("div", "empty");
        const ico = el("div", "empty-ico" + (danger ? " danger" : ""));
        ico.innerHTML = '<i class="' + icon + '"></i>';
        box.append(ico, el("h2", null, title), el("p", null, text));
        if (action) {
          const row = el("div", "empty-actions");
          const b = el("button", "btn-ghost"); b.type = "button";
          b.innerHTML = '<i class="' + action.icon + '"></i>' + action.label;
          b.addEventListener("click", action.run);
          row.appendChild(b); box.appendChild(row);
        }
        list.appendChild(box);
      }
      function fmtDate(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        const sameYear = d.getFullYear() === new Date().getFullYear();
        return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" }) +
          ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      }

      async function load() {
        list.innerHTML = "";
        list.setAttribute("aria-busy", "true");
        for (let i = 0; i < 8; i++) list.appendChild(skeletonCard());   // loading shimmer
        try {
          const sets = await host.loadSets();
          if (!sets.length) {
            message("fa-regular fa-bookmark", "No saved sets yet",
              "Build a set in Puzzle Builder, select the photos you like and save them to Drive. They show up here.",
              false, { icon: "fa-solid fa-puzzle-piece", label: "Open Puzzle Builder", run: function () { Pixels.activate("puzzle-builder"); } });
            return;
          }
          list.innerHTML = "";
          sets.forEach(function (s) {
            const card = el("div", "saved-card");
            card.tabIndex = 0;
            card.setAttribute("role", "button");

            // first 4 photos as a thumbnail mosaic
            const thumbs = (s.thumbs || []).slice(0, 4);
            const strip = el("div", "saved-thumbs n" + thumbs.length);
            if (!thumbs.length) strip.innerHTML = '<i class="fa-regular fa-images"></i>';
            thumbs.forEach(function (u) {
              const im = el("img");
              im.loading = "lazy"; im.src = u;
              im.addEventListener("error", function () {          // fresh-upload thumbnail lag
                if (im.dataset.retried) return;
                im.dataset.retried = "1";
                setTimeout(function () { im.src = u + (u.indexOf("?") >= 0 ? "&" : "?") + "r=" + Date.now(); }, 1500);
              });
              strip.appendChild(im);
            });
            if (s.count != null) {
              strip.appendChild(el("span", "chip saved-count", s.count + " photo" + (s.count === 1 ? "" : "s")));
            }
            card.appendChild(strip);

            const name = el("div", "saved-name", s.name);
            const meta = el("div", "saved-meta", s.created ? fmtDate(s.created) : "");
            card.append(name, meta);

            // whole card opens the set (click, Enter or Space)
            card.title = "Open “" + s.name + "”";
            card.setAttribute("aria-label", "Open " + s.name);
            function open() {
              if (Pixels.activate) Pixels.activate("puzzle-builder");   // ensure it's mounted
              if (window.PixelsPuzzle) {
                window.PixelsPuzzle.loadDriveSet({ id: s.id, name: s.name });
              }
            }
            card.addEventListener("click", open);
            card.addEventListener("keydown", function (e) {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
            });
            list.appendChild(card);
          });
        } catch (err) {
          if (err.code === "unauthorized") { list.innerHTML = ""; if (window.pixelsReauth) window.pixelsReauth(); return; }
          message("fa-solid fa-triangle-exclamation", "Could not load saved sets", err.message, true,
            { icon: "fa-solid fa-rotate", label: "Try again", run: function () { load(); } });
        } finally {
          list.removeAttribute("aria-busy");
        }
      }

      // refresh lives on the My Library tab button (active only when selected)
      if (Pixels.setRefresh) Pixels.setRefresh("saved", function () { return load(); });
      load();
    }
  });
})();
