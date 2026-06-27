/**
 * PixelsEngine — the data engine.
 *
 * The one job here: turn a search request into a normalized list of items by
 * talking to the Apps Script proxy (which holds the Pexels key). No UI, no DOM.
 * Connectors (search box, puzzle builder, …) all go through this.
 *
 *   const { items, total } = await PixelsEngine.search({ type:'photos', query:'bali' });
 *
 * Every item is normalized to a common shape so connectors don't care whether
 * it came back as a photo or a video:
 *   { id, type, query, width, height, preview, full, downloadUrl, alt, credit }
 *     preview     — a mid-size URL good for grid thumbnails
 *     full        — the largest displayable URL (original photo / best mp4)
 *     downloadUrl — what to fetch for "download" / cropping (CORS-clean on Pexels)
 */
(function () {
  const API_BASE = window.PIXELS_API_BASE || "";

  function getToken() {
    try { return sessionStorage.getItem("pixels-token"); } catch (e) { return null; }
  }

  /** Build the proxy querystring from a request object. */
  function toParams(req) {
    const p = new URLSearchParams();
    p.set("type", req.type || "photos");
    p.set("query", (req.query || "").trim());
    if (req.orientation) p.set("orientation", req.orientation);
    if (req.size) p.set("size", req.size);
    if (req.perPage) p.set("per_page", req.perPage);
    if (req.page) p.set("page", req.page);
    if ((req.type || "photos") === "photos" && req.color) p.set("color", req.color);
    return p;
  }

  /** Highest-resolution mp4 (so fullscreen + download get full quality). */
  function bestVideoFile(v) {
    const files = (v.video_files || [])
      .filter((f) => /mp4/i.test(f.file_type || "") || /\.mp4/i.test(f.link || ""))
      .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
    return files[0] || (v.video_files || [])[0] || null;
  }

  function normalizePhoto(p, query) {
    return {
      id: p.id,
      type: "photo",
      query: query,
      width: p.width,
      height: p.height,
      preview: p.src && p.src.large,
      full: p.src && p.src.original,
      downloadUrl: p.src && p.src.original,
      alt: p.alt || "",
      credit: p.photographer || ""
    };
  }

  function normalizeVideo(v, query) {
    const file = bestVideoFile(v);
    return {
      id: v.id,
      type: "video",
      query: query,
      width: file ? file.width : v.width,
      height: file ? file.height : v.height,
      preview: v.image,
      full: file ? file.link : "",
      downloadUrl: file ? file.link : "",
      alt: "",
      credit: (v.user && v.user.name) || ""
    };
  }

  /**
   * Run one search. Resolves to { items, total, raw }.
   * Throws an Error on failure; for an expired/missing token the error carries
   * `.code === "unauthorized"` so callers can re-gate.
   */
  async function search(req) {
    const query = (req.query || "").trim();
    if (!query) throw new Error("A query is required.");

    const params = toParams(req);
    const url = API_BASE + "?" + params.toString() +
      "&token=" + encodeURIComponent(getToken() || "");

    const res = await fetch(url);
    const data = await res.json();

    if (data && (data.error === "unauthorized" || data.code === 401)) {
      const err = new Error("Your session expired — sign in again.");
      err.code = "unauthorized";
      throw err;
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    if (data && data.error) throw new Error(data.error);

    const type = req.type || "photos";
    const rawItems = type === "photos" ? data.photos : data.videos;
    const items = (rawItems || []).map((it) =>
      type === "photos" ? normalizePhoto(it, query) : normalizeVideo(it, query));

    return { items: items, total: data.total_results, raw: data };
  }

  /**
   * Fetch the Puzzle Builder query groups from the linked Google Sheet.
   * Resolves to { groups: [{name, items}], sheetUrl, configured }.
   * `configured` is false when no sheet has been linked server-side yet.
   * Throws with `.code === "unauthorized"` on an expired token.
   */
  async function sheet() {
    const url = API_BASE + "?type=sheet&token=" + encodeURIComponent(getToken() || "");
    const res = await fetch(url);
    const data = await res.json();
    if (data && (data.error === "unauthorized" || data.code === 401)) {
      const err = new Error("Your session expired — sign in again.");
      err.code = "unauthorized";
      throw err;
    }
    if (data && data.error && data.error !== "no-sheet") throw new Error(data.error);
    return {
      groups: (data && data.groups) || [],
      sheetUrl: (data && data.sheetUrl) || null,
      configured: !(data && data.error === "no-sheet")
    };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * POST a write action to the proxy (save / delete). Sent as text/plain so
   * the browser skips the CORS preflight. Returns the parsed JSON; throws with
   * `.code === "unauthorized"` on an expired token, or Error on any `error`.
   *
   * Apps Script answers a POST via a 302 to a googleusercontent "echo" URL;
   * under rapid sequential POSTs that occasionally bounces back to the bare
   * /exec (handled by doGet, whose error says "Pass type="). We retry those
   * transient bounces / network blips — write actions are idempotent server-
   * side (newSet by batchId, saveImage by filename) so retries can't duplicate.
   */
  async function post(payload) {
    const body = JSON.stringify(Object.assign({ token: getToken() || "" }, payload || {}));
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: body
        });
        const data = await res.json();
        if (data && (data.error === "unauthorized" || data.code === 401)) {
          const err = new Error("Your session expired — sign in again.");
          err.code = "unauthorized";
          throw err;
        }
        if (data && data.error) {
          if (/Pass type=/.test(data.error)) {   // redirect bounce → retry
            lastErr = new Error("Upload request bounced (Apps Script redirect).");
            await sleep(400 * (attempt + 1));
            continue;
          }
          throw new Error(data.error);
        }
        return data;
      } catch (err) {
        if (err.code === "unauthorized") throw err;
        lastErr = err;
        await sleep(400 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  /** GET a JSON resource from the proxy (token appended). Throws on error. */
  async function getJson_(qs) {
    const res = await fetch(API_BASE + qs + "&token=" + encodeURIComponent(getToken() || ""));
    const data = await res.json();
    if (data && (data.error === "unauthorized" || data.code === 401)) {
      const err = new Error("Your session expired — sign in again.");
      err.code = "unauthorized";
      throw err;
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  /** List saved Drive sets → [{ id, name, created }]. */
  async function sets() { return (await getJson_("?type=sets")).sets || []; }
  /** Load one saved set's images → [{ id, name, url }]. */
  async function set(id) { return (await getJson_("?type=set&id=" + encodeURIComponent(id))).images || []; }

  window.PixelsEngine = { search: search, sheet: sheet, post: post, sets: sets, set: set };
})();
