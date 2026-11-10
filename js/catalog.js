// Movie catalog from the Internet Archive (archive.org): free, legal, public domain films.

const Catalog = (() => {
  const API = "https://archive.org/advancedsearch.php";
  const FIELDS = ["identifier", "title", "year", "description", "runtime"];
  const memo = new Map();

  function url(q, rows, extra = {}) {
    const p = new URLSearchParams({ q, rows: String(rows), page: "1", output: "json", ...extra });
    FIELDS.forEach((f) => p.append("fl[]", f));
    p.append("sort[]", "downloads desc");
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

  async function search(q, rows = 24) {
    const key = q + "|" + rows;
    if (memo.has(key)) return memo.get(key);
    try {
      const cached = sessionStorage.getItem("ia:" + key);
      if (cached) { const v = JSON.parse(cached); memo.set(key, v); return v; }
    } catch (_) {}
    const src = url(q, rows);
    let data;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch (_) {
      data = await jsonp(src);
    }
    const items = (data.response && data.response.docs || [])
      .filter((d) => d.identifier && d.title)
      .map((d) => ({
        id: d.identifier,
        title: Array.isArray(d.title) ? d.title[0] : d.title,
        year: d.year ? String(d.year).slice(0, 4) : "",
        runtime: d.runtime ? String(Array.isArray(d.runtime) ? d.runtime[0] : d.runtime) : "",
        description: cleanText(Array.isArray(d.description) ? d.description.join(" ") : d.description || ""),
      }));
    memo.set(key, items);
    try { sessionStorage.setItem("ia:" + key, JSON.stringify(items)); } catch (_) {}
    return items;
  }

  function cleanText(html) {
    // DOMParser builds an inert document, so markup in descriptions never runs.
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  // Find a video file we can play directly, so Play starts the movie with one press.
  const FORMAT_RANK = ["h.264 HD", "h.264", "MPEG4", "h.264 IA", "512Kb MPEG4", "Ogg Video", "WebM"];
  async function videoFile(id) {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}/files`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const files = (data.result || data.files || []).filter((f) => FORMAT_RANK.includes(f.format) && /\.(mp4|m4v|ogv|webm)$/i.test(f.name));
    if (!files.length) throw new Error("no video file");
    files.sort((a, b) => FORMAT_RANK.indexOf(a.format) - FORMAT_RANK.indexOf(b.format));
    // Prefer an MP4 (plays everywhere, including iPhones and TVs).
    const best = files.find((f) => /\.(mp4|m4v)$/i.test(f.name)) || files[0];
    return `https://archive.org/download/${encodeURIComponent(id)}/${best.name.split("/").map(encodeURIComponent).join("/")}`;
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
    videoFile,
    shelf(shelf) { return search(shelf.q, shelf.dedupe ? 60 : 24).then((items) => (shelf.dedupe ? dedupe(items).slice(0, 18) : items)); },
    // Search titles within the shelves the profile is allowed to see.
    find(term, level) {
      const allowed = SHELVES.filter((s) => s.level <= level).map((s) => `(${s.q})`).join(" OR ");
      const safe = term.replace(/[^\w\s'-]/g, " ").trim();
      if (!safe) return Promise.resolve([]);
      return search(`title:(${safe}) AND (${allowed})`, 36);
    },
    image(id) { return `https://archive.org/services/img/${encodeURIComponent(id)}`; },
    embed(id) { return `https://archive.org/embed/${encodeURIComponent(id)}?autoplay=1`; },
    page(id) { return `https://archive.org/details/${encodeURIComponent(id)}`; },
  };
})();
