/**
 * Landing page behaviour for the signed-out face of Pixels (#gate).
 * The gate element is its own scroller, so everything here scrolls #gate,
 * not the window. Exposes window.PixelsLanding = { show, hide, openSignin, closeSignin }.
 */
(function () {
  const gate = document.getElementById("gate");
  if (!gate) return;
  const $ = (s) => gate.querySelector(s);
  const bar = $(".lp-bar");
  const main = $(".lp-main");
  const groups = () => [...main.querySelectorAll(".lp-group")];
  const barH = () => (bar ? bar.offsetHeight : 0);
  const visible = () => gate.style.display !== "none" && getComputedStyle(gate).display !== "none";

  new ResizeObserver(() => gate.style.setProperty("--lp-bar-h", barH() + "px")).observe(bar);

  /* ---- Screen-fit: pack groups into screens, share leftover height (rule 1) ---- */
  function layout() {
    if (!visible()) return;
    const gs = groups();
    const avail = gate.clientHeight - barH();
    gs.forEach((g) => { g.style.minHeight = ""; });
    const h = gs.map((g) => g.getBoundingClientRect().height);
    const screens = [];
    let cur = null;
    gs.forEach((g, i) => {
      const solo = g.hasAttribute("data-solo") || (cur && cur.solo);
      if (cur && !solo && cur.sum + h[i] <= avail + 1) { cur.items.push(i); cur.sum += h[i]; }
      else { cur = { items: [i], sum: h[i], solo: g.hasAttribute("data-solo") }; screens.push(cur); }
    });
    // The last screen always fills the view so the footer sits on its bottom edge.
    screens.forEach((sc) => {
      const extra = Math.max(0, avail - sc.sum) / sc.items.length;
      sc.items.forEach((i, k) => {
        gs[i].style.minHeight = h[i] + extra + "px";
        gs[i].classList.toggle("screen", k === 0);
      });
    });
    markCurrent();
  }
  let raf = 0;
  const relayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
  new ResizeObserver(relayout).observe(gate);
  if (document.fonts) document.fonts.ready.then(relayout);
  window.addEventListener("load", relayout);

  /* ---- ↑/↓ page one screen at a time (rule 2) ---- */
  let target = null;
  gate.addEventListener("scrollend", () => { target = null; });
  const stops = () => [...main.querySelectorAll(".screen")].map((s) =>
    Math.round(s.getBoundingClientRect().top - gate.getBoundingClientRect().top + gate.scrollTop - barH()));
  function pageBy(dir) {
    const pos = target != null ? target : gate.scrollTop;
    const step = gate.clientHeight - barH();
    const max = gate.scrollHeight - gate.clientHeight;
    const s = stops();
    let dest;
    if (dir > 0) dest = Math.min(s.find((t) => t > pos + 4) ?? max, pos + step);
    else dest = Math.max(s.filter((t) => t < pos - 4).pop() ?? 0, pos - step);
    dest = Math.min(Math.max(dest, 0), max);
    if (dest === Math.round(pos)) return;
    target = dest;
    gate.scrollTo({ top: dest, behavior: "smooth" });
  }
  document.addEventListener("keydown", (e) => {
    if (!visible()) return;
    if (e.key === "Escape") { closeSignin(); closeGlass(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (signin.classList.contains("open")) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    pageBy(e.key === "ArrowDown" ? 1 : -1);
  });

  /* ---- Current topic in the app bar (rule 22) ---- */
  const links = [...gate.querySelectorAll(".lp-nav a")];
  function markCurrent() {
    const probe = gate.scrollTop + barH() + (gate.clientHeight - barH()) * 0.4;
    const atEnd = gate.scrollTop + gate.clientHeight >= gate.scrollHeight - 2;
    let cur = null;
    links.forEach((a) => {
      const sec = gate.querySelector(a.getAttribute("href"));
      if (!sec) return;
      const top = sec.getBoundingClientRect().top - gate.getBoundingClientRect().top + gate.scrollTop;
      if (top <= probe) cur = a;
    });
    if (atEnd && links.length) cur = links[links.length - 1];
    links.forEach((a) => a.setAttribute("aria-current", a === cur ? "true" : "false"));
  }
  gate.addEventListener("scroll", markCurrent, { passive: true });
  links.forEach((a) => a.addEventListener("click", (e) => {
    const sec = gate.querySelector(a.getAttribute("href"));
    if (!sec) return;
    e.preventDefault();
    const top = sec.getBoundingClientRect().top - gate.getBoundingClientRect().top + gate.scrollTop - barH();
    gate.scrollTo({ top, behavior: "smooth" });
    history.replaceState(null, "", a.getAttribute("href"));
  }));

  /* ---- Theme toggle: icon shows the next theme (rule 23) ---- */
  const themeBtn = $(".lp-theme");
  function labelTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    themeBtn.setAttribute("aria-label", "Switch to " + next + " theme");
    themeBtn.title = "Switch to " + next + " theme";
  }
  themeBtn.addEventListener("click", () => {
    const t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("pixels-theme", t); } catch (e) {}
    labelTheme(); readAccent();
  });
  labelTheme();

  /* ---- Sign-in panel (rule 30) ---- */
  const signin = $(".lp-signin");
  function openSignin(msg) {
    if (msg) document.getElementById("gate-msg").textContent = msg;
    signin.classList.add("open");
    signin.setAttribute("aria-hidden", "false");
  }
  function closeSignin() {
    if (!signin.classList.contains("open")) return;
    signin.classList.remove("open");
    signin.setAttribute("aria-hidden", "true");
  }
  gate.querySelectorAll("[data-signin]").forEach((b) => b.addEventListener("click", () => openSignin()));
  $(".lp-close").addEventListener("click", closeSignin);
  signin.addEventListener("click", (e) => { if (e.target === signin) closeSignin(); });

  /* ---- ⓘ: full-screen frosted note on hover intent (rule 18) ---- */
  const info = $(".lp-info"), glass = $(".lp-glass");
  let hoverTimer = 0;
  function openGlass(touch) {
    glass.classList.add("open"); glass.classList.toggle("touch", !!touch);
    info.classList.add("open");
  }
  function closeGlass() {
    clearTimeout(hoverTimer);
    glass.classList.remove("open", "touch"); info.classList.remove("open");
  }
  info.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => openGlass(false), 400);
  });
  info.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") closeGlass(); });
  info.addEventListener("click", (e) => {
    e.stopPropagation();
    if (glass.classList.contains("open")) closeGlass(); else openGlass(true);
  });
  glass.addEventListener("click", closeGlass);

  /* ---- On-topic particle field: frames, apertures, crop marks (rule 24) ---- */
  const cv = $(".lp-particles"), ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let W = 0, H = 0, dpr = 1, parts = [], accent = "#05a081", animId = 0;
  function readAccent() { accent = getComputedStyle(gate).getPropertyValue("--lp-accent").trim() || accent; if (reduce.matches) draw(); }
  const shapes = [
    (c, s) => { c.strokeRect(-s, -s * .75, s * 2, s * 1.5); c.beginPath(); c.arc(-s * .4, -s * .25, s * .2, 0, 7); c.stroke();
                c.beginPath(); c.moveTo(-s, s * .6); c.lineTo(-s * .2, -s * .05); c.lineTo(s * .3, s * .4); c.lineTo(s, -s * .1); c.stroke(); },
    (c, s) => { c.beginPath(); c.arc(0, 0, s, 0, 7); c.stroke();
                for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.moveTo(Math.cos(a) * s * .35, Math.sin(a) * s * .35);
                  c.lineTo(Math.cos(a + 1.1) * s, Math.sin(a + 1.1) * s); c.stroke(); } },
    (c, s) => { const q = s * .45; c.beginPath();
                c.moveTo(-s, -s + q); c.lineTo(-s, -s); c.lineTo(-s + q, -s);
                c.moveTo(s - q, -s); c.lineTo(s, -s); c.lineTo(s, -s + q);
                c.moveTo(s, s - q); c.lineTo(s, s); c.lineTo(s - q, s);
                c.moveTo(-s + q, s); c.lineTo(-s, s); c.lineTo(-s, s - q); c.stroke(); },
    (c, s) => { c.strokeRect(-s, -s * .6, s * 2, s * 1.35); c.strokeRect(-s * .35, -s * .85, s * .7, s * .25);
                c.beginPath(); c.arc(0, s * .08, s * .42, 0, 7); c.stroke(); },
    (c, s) => { c.strokeRect(-s, -s, s * 2, s * 2); c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.moveTo(0, -s); c.lineTo(0, s); c.stroke(); },
  ];
  function seed() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = gate.clientWidth; H = gate.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const n = Math.round(Math.min(46, Math.max(16, (W * H) / 32000)));
    parts = Array.from({ length: n }, () => {
      const z = Math.random();
      return { x: Math.random() * W, y: Math.random() * H, z, s: 8 + z * 14, r: Math.random() * 6.28,
        vr: (Math.random() - .5) * .004, a: Math.random() * 6.28, sp: .08 + z * .18, k: Math.floor(Math.random() * shapes.length) };
    });
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = accent; ctx.lineWidth = 1.3; ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const p of parts) {
      ctx.save(); ctx.globalAlpha = .05 + p.z * .08; ctx.translate(p.x, p.y); ctx.rotate(p.r);
      shapes[p.k](ctx, p.s); ctx.restore();
    }
  }
  function step() {
    for (const p of parts) {
      p.a += (Math.random() - .5) * .08;
      p.x += Math.cos(p.a) * p.sp; p.y += Math.sin(p.a) * p.sp; p.r += p.vr;
      const m = p.s * 2;
      if (p.x < -m) p.x = W + m; if (p.x > W + m) p.x = -m;
      if (p.y < -m) p.y = H + m; if (p.y > H + m) p.y = -m;
    }
    draw();
    animId = requestAnimationFrame(step);
  }
  function run() {
    cancelAnimationFrame(animId);
    if (!visible() || document.hidden) return;
    if (reduce.matches) draw(); else animId = requestAnimationFrame(step);
  }
  seed(); readAccent(); run();
  new ResizeObserver(() => { seed(); draw(); }).observe(gate);
  document.addEventListener("visibilitychange", run);
  reduce.addEventListener("change", run);

  window.PixelsLanding = {
    show() { document.documentElement.classList.add("landing"); gate.style.display = ""; relayout(); seed(); run(); },
    hide() { closeSignin(); closeGlass(); document.documentElement.classList.remove("landing"); gate.style.display = "none"; cancelAnimationFrame(animId); },
    openSignin, closeSignin,
  };
})();
