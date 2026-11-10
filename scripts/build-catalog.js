// Builds catalog.json: every movie row, the Top 10 for each age group, and each movie's
// video, picture and subtitle links, checked once a day by a GitHub job.
// Viewers then load this one file instead of each asking the Internet Archive separately:
// rows appear faster, and the Archive gets a handful of requests a day instead of thousands.
//
//   node scripts/build-catalog.js            (real Internet Archive)
//   ARCHIVE=http://127.0.0.1:9999 node scripts/build-catalog.js   (a stand-in, for tests)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const ARCHIVE = process.env.ARCHIVE || "";

// Run the app's own data.js and catalog.js, so the same rules (copyright, quality,
// kid safety, duplicates) decide what goes in the catalog.
const store = new Map();
const realFetch = globalThis.fetch;
const ctx = {
  console, setTimeout, clearTimeout, URLSearchParams, AbortController, Promise, Date, Math, JSON,
  window: { AbortController },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  DOMParser: class { parseFromString(html) { return { body: { textContent: String(html).replace(/<[^>]*>/g, " ") } }; } },
  document: { createElement: () => ({}), head: { appendChild() {} } },
  fetch: (url, opts) => {
    if (url === "blocklist.json") return Promise.resolve({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, "blocklist.json"), "utf8")) });
    const u = ARCHIVE ? String(url).replace("https://archive.org", ARCHIVE) : url;
    return realFetch(u, { ...opts, headers: { "User-Agent": "free-movies-app-catalog/1.0 (daily build)" } });
  },
};
ctx.window.fetch = ctx.fetch;
vm.createContext(ctx);
const load = (file, expose) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8") + `\n;(${expose})`, ctx, { filename: file });
load("js/data.js", "0");
const { SHELVES, CHANNELS, Catalog } = { ...load("js/catalog.js", "({ SHELVES, CHANNELS, Catalog })") };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const started = Date.now();
  const out = { built: new Date().toISOString(), shelves: {}, top: {}, info: {} };
  // Rows, one at a time with a short pause (polite to the Internet Archive).
  for (const shelf of SHELVES) {
    try {
      const items = await Catalog.shelf(shelf);
      out.shelves[shelf.id] = items.map((it) => ({ ...it, description: (it.description || "").slice(0, 320) }));
      console.log(`row ${shelf.id}: ${items.length}`);
    } catch (e) { console.log(`row ${shelf.id}: failed (${e.message}) — the app will fetch it live`); }
    await sleep(400);
  }
  // Top 10 per age group, ranked by this week's views across that group's rows (no extra requests).
  for (const level of [0, 1, 2, 3]) {
    try { out.top[level] = (await Catalog.top(level)).map((it) => ({ ...it, description: (it.description || "").slice(0, 320) })); console.log(`top 10 for level ${level}: ${out.top[level].length}`); }
    catch (e) { console.log(`top 10 for level ${level}: failed (${e.message})`); }
  }
  // Each movie's video, picture and subtitle files (4 at a time).
  const ids = [...new Set([...Object.values(out.shelves), ...Object.values(out.top)].flat().map((it) => it.id))];
  let done = 0;
  await Promise.all(ids.map((id) => Catalog.info(id).then((info) => { out.info[id] = info; }).catch(() => {}).finally(() => {
    if (++done % 50 === 0) console.log(`movie details: ${done}/${ids.length}`);
  })));
  // Drop movies with no playable video from the rows.
  for (const key of Object.keys(out.shelves)) out.shelves[key] = out.shelves[key].filter((it) => !(out.info[it.id] && out.info[it.id].broken));
  for (const key of Object.keys(out.top)) out.top[key] = out.top[key].filter((it) => !(out.info[it.id] && out.info[it.id].broken));
  const rows = Object.values(out.shelves).filter((r) => r.length).length;
  if (rows < 3) { console.error(`Only ${rows} rows came back — keeping the previous catalog.`); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, "catalog.json"), JSON.stringify(out));
  console.log(`catalog.json: ${rows} rows, ${ids.length} movies, ${(fs.statSync(path.join(ROOT, "catalog.json")).size / 1024).toFixed(0)} KB, ${((Date.now() - started) / 1000).toFixed(0)} s`);
})();
