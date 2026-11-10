// Movie catalog from the Internet Archive (archive.org): free, legal, public domain films.

const Catalog = (() => {
  const API = "https://archive.org/advancedsearch.php";
  const FIELDS = ["identifier", "title", "year", "description", "runtime"];
  // Only ask for movies that have a video file the app can play.
  const PLAYABLE = ' AND format:("h.264" OR "h.264 HD" OR "h.264 IA" OR MPEG4 OR "512Kb MPEG4")';
  const SEARCH_TTL = 12 * 60 * 60 * 1000; // movie lists are kept for 12 hours
  const INFO_TTL = 7 * 24 * 60 * 60 * 1000; // video and picture links are kept for 7 days
  const memo = new Map();

  // ----- device storage (fast reopen) -----
  function load(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v && v.t && Date.now() - v.t < v.ttl ? v.d : null;
    } catch (_) { return null; }
  }
  function store(key, data, ttl) {
    const value = JSON.stringify({ t: Date.now(), ttl, d: data });
    try { localStorage.setItem(key, value); }
    catch (_) {
      // Storage full: clear old movie lists and try once more.
      try { Object.keys(localStorage).filter((k) => k.startsWith("ia:")).forEach((k) => localStorage.removeItem(k)); localStorage.setItem(key, value); } catch (_) {}
    }
  }

  function url(q, rows, sort = "downloads desc", page = 1) {
    const p = new URLSearchParams({ q, rows: String(rows), page: String(page), output: "json" });
    FIELDS.forEach((f) => p.append("fl[]", f));
    p.append("sort[]", sort);
    return `${API}?${p}`;
  }

  // JSONP fallback for TV browsers or networks where fetch is blocked by CORS.
  function jsonp(src) {
    return new Promise((resolve, reject) => {
      const cb = "__ia" + Math.random().toString(36).slice(2);
      const s = document.createElement("script");
      const timer = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, 15000);
      function cleanup() { clearTimeout(timer); delete window[cb]; s.remove(); }
      window[cb] = (data) => { cleanup(); resolve(data); };
      s.onerror = () => { cleanup(); reject(new Error("network")); };
      s.src = src + "&callback=" + cb;
      document.head.appendChild(s);
    });
  }

  async function fetchSearch(q, rows, sort, page) {
    const src = url(q, rows, sort, page);
    let data;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch (_) {
      data = await jsonp(src);
    }
    return (data.response && data.response.docs || [])
      .filter((d) => d.identifier && d.title)
      .map((d) => ({
        id: d.identifier,
        title: first(d.title),
        year: d.year ? String(first(d.year)).slice(0, 4) : "",
        runtime: d.runtime ? String(first(d.runtime)) : "",
        description: cleanText(Array.isArray(d.description) ? d.description.join(" ") : d.description || "").slice(0, 600),
      }));
  }
  const first = (v) => (Array.isArray(v) ? v[0] : v);

  async function search(q, rows = 24, { sort = "downloads desc", page = 1, ttl = SEARCH_TTL } = {}) {
    const key = "ia:" + q + "|" + rows + "|" + sort + "|" + page;
    if (memo.has(key)) return memo.get(key);
    const cached = load(key);
    if (cached) { memo.set(key, cached); return cached; }
    let items = await fetchSearch(q + PLAYABLE, rows, sort, page);
    // If the playable filter finds nothing, try without it (broken ones get hidden later).
    if (!items.length && page === 1) items = await fetchSearch(q, rows, sort, page);
    items = items.filter((it) => !isBroken(it.id));
    memo.set(key, items);
    store(key, items, ttl);
    return items;
  }

  function cleanText(html) {
    // DOMParser builds an inert document, so markup in descriptions never runs.
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  // ----- per-movie details: playable video file and the best picture -----
  const FORMAT_RANK = ["h.264 HD", "h.264", "MPEG4", "h.264 IA", "512Kb MPEG4", "Ogg Video", "WebM"];
  const IMAGE_FORMATS = ["JPEG", "PNG", "Animated GIF"];
  const infoMemo = new Map();
  let infoCache = null;
  function infoStore() {
    if (!infoCache) infoCache = load("ia-info") || {};
    return infoCache;
  }
  function saveInfoStore() {
    const entries = Object.entries(infoCache);
    if (entries.length > 800) infoCache = Object.fromEntries(entries.slice(-600));
    store("ia-info", infoCache, INFO_TTL);
  }
  function isBroken(id) { const i = infoStore()[id]; return !!(i && i.broken); }

  // Run at most 4 detail lookups at once so rows don't flood the network.
  let active = 0;
  const queue = [];
  function limited(fn) {
    return new Promise((resolve, reject) => {
      const run = () => { active++; fn().then(resolve, reject).finally(() => { active--; if (queue.length) queue.shift()(); }); };
      active < 4 ? run() : queue.push(run);
    });
  }

  function info(id) {
    if (infoMemo.has(id)) return infoMemo.get(id);
    const cached = infoStore()[id];
    if (cached) { const p = Promise.resolve(cached); infoMemo.set(id, p); return p; }
    const p = limited(async () => {
      const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}/files`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const files = data.result || data.files || [];
      const link = (name) => `https://archive.org/download/${encodeURIComponent(id)}/${name.split("/").map(encodeURIComponent).join("/")}`;

      const videos = files.filter((f) => FORMAT_RANK.includes(f.format) && /\.(mp4|m4v|ogv|webm)$/i.test(f.name))
        .sort((a, b) => FORMAT_RANK.indexOf(a.format) - FORMAT_RANK.indexOf(b.format));
      // Prefer an MP4 (plays everywhere, including iPhones and TVs).
      const video = videos.find((f) => /\.(mp4|m4v)$/i.test(f.name)) || videos[0];

      const images = files.filter((f) => IMAGE_FORMATS.includes(f.format) && !/\.thumbs\/|__ia_thumb|_thumb\./i.test(f.name))
        .sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
      const result = video
        ? { src: link(video.name), image: images[0] ? link(images[0].name) : "" }
        : { broken: true };
      infoStore()[id] = result;
      saveInfoStore();
      return result;
    });
    infoMemo.set(id, p);
    p.catch(() => infoMemo.delete(id)); // network trouble: try again next time
    return p;
  }

  // Many uploads of the same film exist; keep the most popular copy of each title.
  function dedupe(items) {
    const seen = new Set();
    return items.filter((it) => {
      const key = it.title.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 4).join(" ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return {
    search,
    info,
    isBroken,
    markBroken(id) { infoStore()[id] = { broken: true }; infoMemo.delete(id); saveInfoStore(); },
    async videoFile(id) { const i = await info(id); if (!i.src) throw new Error("no video file"); return i.src; },
    shelf(shelf) { return search(shelf.q, shelf.dedupe ? 60 : 24).then((items) => (shelf.dedupe ? dedupe(items).slice(0, 18) : items).filter((it) => !isBroken(it.id))); },
    // Search titles within the shelves the profile is allowed to see.
    // Most-watched movies this week among the rows this profile can see.
    top(level) {
      const allowed = SHELVES.filter((s) => s.level <= level).map((s) => `(${s.q})`).join(" OR ");
      return search(`(${allowed})`, 40, { sort: "week desc", ttl: 6 * 3600 * 1000 })
        .then((items) => dedupe(items).filter((it) => !isBroken(it.id)).slice(0, 10));
    },
    // Browse page: category, decade, color, and sort order.
    browse({ level, shelfId = "", decade = "", color = "", sort = "downloads desc", page = 1 }) {
      const shelves = SHELVES.filter((s) => s.level <= level && (!shelfId || s.id === shelfId));
      let q = `(${shelves.map((s) => `(${s.q})`).join(" OR ")})`;
      if (decade) q += ` AND year:[${decade} TO ${Number(decade) + 9}]`;
      if (color === "color") q += ` AND color:(color OR colour)`;
      if (color === "bw") q += ` AND color:("b&w" OR bw OR "black and white" OR "black & white")`;
      return search(q, 36, { sort, page }).then((items) => items.filter((it) => !isBroken(it.id)));
    },
    find(term, level) {
      const allowed = SHELVES.filter((s) => s.level <= level).map((s) => `(${s.q})`).join(" OR ");
      const safe = term.replace(/[^\w\s'-]/g, " ").trim();
      if (!safe) return Promise.resolve([]);
      return search(`title:(${safe}) AND (${allowed})`, 36);
    },
    image(id) { return `https://archive.org/services/img/${encodeURIComponent(id)}`; },
    embed(id) { return `https://archive.org/embed/${encodeURIComponent(id)}?autoplay=1`; },
  };
})();
