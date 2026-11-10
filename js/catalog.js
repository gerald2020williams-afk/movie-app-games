// Movie catalog from the Internet Archive (archive.org): free, legal, public domain films.

const Catalog = (() => {
  const API = "https://archive.org/advancedsearch.php";
  const FIELDS = ["identifier", "title", "year", "description", "runtime", "creator", "licenseurl", "downloads", "week", "subject"];
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

  // Fetch JSON with a time limit. When the Internet Archive is busy (429 or 5xx) or slow,
  // wait and try again a couple of times, backing off each time, instead of hanging.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fetchJson(src, { timeout = 10000, retries = 2 } = {}) {
    for (let attempt = 0; ; attempt++) {
      const ctrl = "AbortController" in window ? new AbortController() : null;
      const timer = setTimeout(() => ctrl && ctrl.abort(), timeout);
      try {
        const res = await fetch(src, ctrl ? { signal: ctrl.signal } : {});
        clearTimeout(timer);
        if (res.ok) return await res.json();
        const busy = res.status === 429 || res.status >= 500;
        if (!busy || attempt >= retries) throw Object.assign(new Error("HTTP " + res.status), { status: res.status });
        const wait = Number(res.headers.get("Retry-After")) * 1000 || (1000 * 2 ** attempt + Math.random() * 500);
        await sleep(Math.min(wait, 8000));
      } catch (e) {
        clearTimeout(timer);
        // A request that timed out once is likely to time out again: try only once more.
        const timedOut = e.name === "AbortError";
        if (timedOut) e.timedOut = true;
        if (e.status || attempt >= retries || (timedOut && attempt >= 1)) throw e;
        await sleep(1000 * 2 ** attempt + Math.random() * 500);
      }
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
      data = await fetchJson(src);
    } catch (e) {
      // Busy or not answering: don't pile on. Blocked fetch (some TV browsers): try the older JSONP way.
      if (e.status || e.timedOut) throw e;
      data = await jsonp(src);
    }
    return (data.response && data.response.docs || [])
      .filter((d) => d.identifier && d.title)
      .map((d) => ({
        id: d.identifier,
        title: cleanTitle(first(d.title), d.year),
        year: d.year ? String(first(d.year)).slice(0, 4) : "",
        runtime: d.runtime ? String(first(d.runtime)) : "",
        description: cleanText(Array.isArray(d.description) ? d.description.join(" ") : d.description || "").slice(0, 600),
        creator: d.creator ? String(first(d.creator)).slice(0, 80) : "",
        license: d.licenseurl ? String(first(d.licenseurl)) : "",
        subjects: (Array.isArray(d.subject) ? d.subject.join("; ") : String(d.subject || "")).slice(0, 240),
        popular: Number(first(d.week)) || 0,
        downloads: Number(first(d.downloads)) || 0,
      }));
  }
  const first = (v) => (Array.isArray(v) ? v[0] : v);

  // Tidy upload titles: stray quotes, the year repeated in the title, extra spaces.
  function cleanTitle(raw, year) {
    let t = String(raw || "").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
    const y = year ? String(first(year)).slice(0, 4) : "";
    if (y) t = t.replace(new RegExp(`\\s*[\\(\\[]${y}[\\)\\]]`, "g"), "").trim();
    // Labels about the upload, not the film: "(complete & clearer)", "[HD]", "(1080p)", "(restored)".
    t = t.replace(/\s*[\(\[][^\)\]]*\b(complete|clearer|restored|remastered|hd|1080p|720p|480p|4k|full movie|colori[sz]ed|widescreen|dvd|vhs)\b[^\)\]]*[\)\]]/gi, "").trim();
    // 'Charlie Chaplin's " The Pawnshop' -> 'Charlie Chaplin's The Pawnshop'; drop unmatched quotes
    if ((t.match(/"/g) || []).length % 2 === 1) t = t.replace(/"/g, "");
    t = t.replace(/"\s+/g, '"').replace(/\s+"/g, ' "').replace(/^"(.*)"$/, "$1").replace(/\s+/g, " ").trim();
    return t || String(raw || "");
  }

  const inflight = new Map();
  function search(q, rows = 24, opts = {}) {
    const key = "ia:" + q + "|" + rows + "|" + (opts.sort || "downloads desc") + "|" + (opts.page || 1);
    if (memo.has(key)) return Promise.resolve(memo.get(key));
    // Two parts of the screen asking for the same list share one request.
    if (inflight.has(key)) return inflight.get(key);
    const p = searchNow(q, rows, opts).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  async function searchNow(q, rows = 24, { sort = "downloads desc", page = 1, ttl = SEARCH_TTL } = {}) {
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
  // Still pictures only. Movies often include an animated GIF preview; it flashes, so it's never used.
  const IMAGE_FORMATS = ["JPEG", "PNG"];
  const infoMemo = new Map();
  let infoCache = null;
  function infoStore() {
    if (!infoCache) {
      // Older saved details could point at animated pictures; start fresh once.
      try { localStorage.removeItem("ia-info"); localStorage.removeItem("ia-info2"); localStorage.removeItem("ia-info3"); } catch (_) {}
      infoCache = load("ia-info4") || {};
    }
    return infoCache;
  }
  function saveInfoStore() {
    const entries = Object.entries(infoCache);
    if (entries.length > 800) infoCache = Object.fromEntries(entries.slice(-600));
    store("ia-info4", infoCache, INFO_TTL);
  }
  function isBroken(id) { const i = infoStore()[id]; return !!(i && i.broken); }

  // Run at most 4 detail lookups at once so rows don't flood the network.
  let active = 0;
  const queue = [];
  // `wanted` lets a screen drop its queued lookups once it's gone (no wasted requests or memory).
  function limited(fn, wanted) {
    return new Promise((resolve, reject) => {
      const next = () => { active--; if (queue.length) queue.shift()(); };
      const run = () => {
        if (wanted && !wanted()) { reject(Object.assign(new Error("not needed"), { cancelled: true })); if (queue.length) queue.shift()(); return; }
        active++;
        fn().then(resolve, reject).finally(next);
      };
      active < 4 ? run() : queue.push(run);
    });
  }

  function info(id, { wanted } = {}) {
    if (infoMemo.has(id)) return infoMemo.get(id);
    if (shared && shared.info && shared.info[id] && !isBroken(id)) { const p = Promise.resolve(shared.info[id]); infoMemo.set(id, p); return p; }
    const cached = infoStore()[id];
    if (cached) { const p = Promise.resolve(cached); infoMemo.set(id, p); return p; }
    const p = limited(async () => {
      const data = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(id)}/files`, { timeout: 10000, retries: 1 });
      const files = data.result || data.files || [];
      const link = (name) => `https://archive.org/download/${encodeURIComponent(id)}/${name.split("/").map(encodeURIComponent).join("/")}`;

      const videos = files.filter((f) => FORMAT_RANK.includes(f.format) && /\.(mp4|m4v|ogv|webm)$/i.test(f.name))
        .sort((a, b) => FORMAT_RANK.indexOf(a.format) - FORMAT_RANK.indexOf(b.format));
      // Prefer an MP4 (plays everywhere, including iPhones and TVs).
      const video = videos.find((f) => /\.(mp4|m4v)$/i.test(f.name)) || videos[0];
      // Smaller file for data saver (phones on cell data, slow connections).
      const small = files.find((f) => f.format === "512Kb MPEG4") || files.filter((f) => /\.mp4$/i.test(f.name) && f.size).sort((a, b) => a.size - b.size)[0];

      const images = files.filter((f) => IMAGE_FORMATS.includes(f.format) && /\.(jpe?g|png)$/i.test(f.name) && !/\.thumbs\/|__ia_thumb|_thumb\.|spectrogram|waveform|_spec\.|\.spec\./i.test(f.name))
        .sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
      // Subtitle files (.srt or .vtt), with a language guessed from the file name.
      const LANGS = { en: "English", eng: "English", english: "English", es: "Spanish", spa: "Spanish", spanish: "Spanish", fr: "French", fre: "French", french: "French", de: "German", ger: "German", german: "German", it: "Italian", pt: "Portuguese" };
      const subs = files.filter((f) => /\.(srt|vtt)$/i.test(f.name)).slice(0, 6).map((f) => {
        const word = (f.name.toLowerCase().match(/[._\-\s](en|eng|english|es|spa|spanish|fr|fre|french|de|ger|german|it|pt)[._\-\s]/) || [])[1];
        return { url: link(f.name), label: LANGS[word] || "Subtitles", lang: word ? word.slice(0, 2) : "" };
      });
      const length = video && Number(video.length) ? Math.round(Number(video.length)) : 0;
      const result = video
        ? { src: link(video.name), small: small && small.name !== video.name ? link(small.name) : "", image: images[0] ? link(images[0].name) : "", subs, length }
        : { broken: true };
      infoStore()[id] = result;
      saveInfoStore();
      return result;
    }, wanted);
    infoMemo.set(id, p);
    p.catch(() => infoMemo.delete(id)); // network trouble: try again next time
    return p;
  }

  // ----- Shared catalog: rows, Top 10 and movie details built once a day by a GitHub job -----
  // (scripts/build-catalog.js). Everyone loads this one file from the app's own site, which is
  // much faster than asking the Internet Archive, and keeps the Archive's load tiny as viewers grow.
  let shared = null;
  const CATALOG_MAX_AGE = 4 * 864e5; // older than 4 days: ignore it and ask the Archive directly
  const catalogReady = fetch("catalog.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => { if (c && c.built && Date.now() - Date.parse(c.built) < CATALOG_MAX_AGE) shared = c; })
    .catch(() => {});

  // ----- Blocklist: movies taken down (copyright requests, problems). Edit blocklist.json on GitHub. -----
  let blocked = { ids: new Set(), titles: [] };
  const blocklistReady = fetch("blocklist.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((b) => { blocked = { ids: new Set(b.ids || []), titles: (b.titles || []).map((t) => String(t).toLowerCase()) }; })
    .catch(() => {});
  const isBlocked = (it) => blocked.ids.has(it.id) || blocked.titles.some((t) => it.title.toLowerCase().includes(t));

  // Length like "1:23:45", "00:07:23", "95 min", "7 minutes", "1h 30m" → minutes (or null if unknown).
  function minutes(runtime) {
    const r = String(runtime || "").trim().toLowerCase();
    if (!r) return null;
    let m = /^(\d+):(\d{1,2}):(\d{1,2})/.exec(r);
    if (m) return +m[1] * 60 + +m[2] + +m[3] / 60;
    m = /^(\d+):(\d{1,2})$/.exec(r);
    if (m) return +m[1] + +m[2] / 60;
    m = /(\d+)\s*h/.exec(r); const h = m ? +m[1] : 0;
    m = /(\d+)\s*m/.exec(r); const mm = m ? +m[1] : 0;
    if (h || mm) return h * 60 + mm;
    m = /^(\d+(\.\d+)?)$/.exec(r);
    return m ? +m[1] : null;
  }
  const isAdult = (it) => ADULT_CONTENT.test(`${it.title} ${it.description || ""} ${it.subjects || ""}`);
  const isOpenLicense = (url) => /creativecommons\.org|publicdomain/i.test(url || "");

  // Copyright and quality rules every list goes through.
  function passesRules(it, shelf = {}) {
    if (isBroken(it.id) || isBlocked(it)) return false;
    if (JUNK_TITLE.test(it.title)) return false;
    // Rows for younger profiles never include adult content.
    if (shelf.level !== undefined && shelf.level < 3 && isAdult(it)) return false;
    // Copyright: newer films need an open license, unless the row is a known open-movie row.
    const year = Number(it.year) || 0;
    if (!shelf.licensed && year > COPYRIGHT_CUTOFF_YEAR && !isOpenLicense(it.license) && !PUBLIC_DOMAIN_EXCEPTIONS.test(it.title)) return false;
    if (shelf.level !== undefined && shelf.level <= 1 && !shelf.licensed && year > KIDS_LATEST_YEAR && !isOpenLicense(it.license)) return false;
    const mins = minutes(it.runtime);
    if (mins !== null && mins < Math.max(MIN_MINUTES, shelf.minMinutes || 0)) return false;
    return true;
  }

  // Many uploads of the same film exist; keep the most popular copy of each title.
  function dedupe(items) {
    const seen = new Set();
    return items.filter((it) => {
      // "Big Buck Bunny - FULL HD 60 FPS" and "Big Buck Bunny 1280x720 Stereo" are the same film.
      const key = it.title.toLowerCase()
        .replace(/\(.*?\)|\[.*?\]/g, " ")
        .replace(/\b(\d{3,4}x\d{3,4}|\d{3,4}p|\d+\s*fps|full\s*hd|uhd|4k|hd|sd|stereo|mono|surround|complete|clearer|restored|remastered|colorized|colourized|version|edition|uncut|widescreen|dvd|vhs|bluray|blu-ray|mp4|avi|mpeg|x264|x265|h264|h265|hevc|blender|animated|animation|short|film|movie|full|official|open)\b/g, " ")
        .replace(/\s[-–|]\s.*$/, " ")
        .replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 5).join(" ");
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
    async videoFile(id, { saver = false } = {}) { const i = await info(id); if (!i.src) throw new Error("no video file"); return (saver && i.small) || i.src; },
    // A row: only trusted collections, copyright and quality rules, no duplicate copies.
    async shelf(shelf) {
      await Promise.all([blocklistReady, catalogReady]);
      const items = shared && shared.shelves && shared.shelves[shelf.id] ? shared.shelves[shelf.id] : await search(shelf.q, 50);
      // General rows skip movies that already have their own collection row (e.g. Popeye),
      // so the same cartoons don't fill several rows.
      let inCollections = new Set();
      if (!shelf.collection && !shelf.featured && shared && shared.shelves) {
        SHELVES.filter((s) => s.collection && s.level <= shelf.level).forEach((s) => (shared.shelves[s.id] || []).forEach((x) => inCollections.add(x.id)));
      }
      const kept = dedupe(items.filter((it) => passesRules(it, shelf)));
      const varied = kept.filter((it) => !inCollections.has(it.id));
      return (varied.length >= 8 ? varied : kept).slice(0, 24);
    },
    passesRules, minutes, isAdult, isOpenLicense, blocklistReady, catalogReady, cleanTitle, dedupe,
    usingSharedCatalog: () => !!shared,
    // Search titles within the shelves the profile is allowed to see.
    // Most-watched movies this week among the rows this profile can see.
    // Top 10: the most-watched movies this week among the rows this profile can see.
    async top(level) {
      await Promise.all([blocklistReady, catalogReady]);
      if (shared && shared.top && shared.top[level] && shared.top[level].length) return dedupe(shared.top[level].filter((it) => passesRules(it))).slice(0, 10);
      const rows = await Promise.all(SHELVES.filter((s) => s.level <= level).map((s) => this.shelf(s).catch(() => [])));
      const seen = new Set();
      const all = rows.flat().filter((it) => (seen.has(it.id) ? false : seen.add(it.id)));
      all.sort((a, b) => (b.popular || 0) - (a.popular || 0) || (b.downloads || 0) - (a.downloads || 0));
      return dedupe(all).slice(0, 10);
    },
    // Browse page: category, decade, color, and sort order.
    browse({ level, shelfId = "", decade = "", color = "", sort = "downloads desc", page = 1 }) {
      const shelves = SHELVES.filter((s) => s.level <= level && (!shelfId || s.id === shelfId));
      let q = `(${shelves.map((s) => `(${s.q})`).join(" OR ")})`;
      if (decade) q += ` AND year:[${decade} TO ${Number(decade) + 9}]`;
      if (color === "color") q += ` AND color:(color OR colour)`;
      if (color === "bw") q += ` AND color:("b&w" OR bw OR "black and white" OR "black & white")`;
      return search(q, 36, { sort, page }).then((items) => dedupe(items.filter((it) => passesRules(it))));
    },
    find(term, level) {
      const allowed = SHELVES.filter((s) => s.level <= level).map((s) => `(${s.q})`).join(" OR ");
      const safe = term.replace(/[^\w\s'-]/g, " ").trim();
      if (!safe) return Promise.resolve([]);
      return search(`title:(${safe}) AND (${allowed})`, 36).then((items) => dedupe(items.filter((it) => passesRules(it))));
    },
    image(id) { return `https://archive.org/services/img/${encodeURIComponent(id)}`; },
    // The picture to show for a movie: the site's own sharp poster, a gold title card when the
    // movie has no real picture, or (not in the daily catalog yet) the Archive's preview to upgrade later.
    art(id) {
      const i = shared && shared.info && shared.info[id];
      if (i && i.poster) return { url: i.poster };
      if (i && i.image) return { url: i.image };
      if (i && i.src) return { card: true };
      return { url: this.image(id), upgrade: true };
    },
    embed(id) { return `https://archive.org/embed/${encodeURIComponent(id)}?autoplay=1`; },
  };
})();
