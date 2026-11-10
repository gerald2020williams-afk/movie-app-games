// Stress test: many viewers, a busy movie library, heavy family data, long sessions and a huge catalog.
// Uses stand-ins for the Internet Archive (it never loads the real service).
//   node tests/stress.js            (default 40 viewers)
//   VIEWERS=100 node tests/stress.js
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VIEWERS = Number(process.env.VIEWERS || 40);
const clipPath = path.join(__dirname, "clip.webm");
if (!fs.existsSync(clipPath)) require("child_process").execFileSync(process.execPath, [path.join(__dirname, "make-clip.js")]);
const clip = fs.readFileSync(clipPath);

// ----- our own little web server, like GitHub Pages -----
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const served = { requests: 0, bytes: 0 };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  const body = fs.readFileSync(file);
  served.requests++; served.bytes += body.length;
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(body);
});

// ----- pretend Internet Archive with adjustable trouble -----
function mockArchive(ctx, { latency = 0, failRate = 0, rateLimitRate = 0, hangRate = 0, perRow = 24, down = false } = {}, counts) {
  const trouble = async (route, ok) => {
    if (down) return route.abort();
    if (Math.random() < hangRate) return; // never answers
    if (latency) await new Promise((r) => setTimeout(r, latency * (0.5 + Math.random())));
    if (Math.random() < rateLimitRate) return route.fulfill({ status: 429, headers: { "Retry-After": "1", "access-control-allow-origin": "*" }, body: "" });
    if (Math.random() < failRate) return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, body: "" });
    return ok();
  };
  ctx.route("https://archive.org/advancedsearch.php**", (r) => { counts.search++; return trouble(r, () => {
    const u = new URL(r.request().url());
    const page = Number(u.searchParams.get("page") || 1), q = u.searchParams.get("q");
    const tag = (q.match(/collection:\(([a-z_]+)/) || q.match(/title:\(\\?"?([A-Za-z]+)/) || [0, "x"])[1].slice(0, 6);
    const docs = Array.from({ length: perRow }, (_, i) => ({ identifier: `${tag}-${page}-${i}`, title: `${tag} movie ${page}-${i + 1}`, year: 1930 + (i % 90), description: "A film. ".repeat(20) }));
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ response: { docs } }) });
  }); });
  ctx.route("https://archive.org/metadata/**", (r) => { counts.meta++; return trouble(r, () => {
    const id = r.request().url().split("/metadata/")[1].split("/")[0];
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ result: [{ name: `${id}.mp4`, format: "h.264" }, { name: `${id}_512kb.mp4`, format: "512Kb MPEG4" }, { name: `${id}.jpg`, format: "JPEG", size: "40000" }] }) });
  }); });
  ctx.route("https://archive.org/services/img/**", (r) => { counts.img++; return r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="135"><rect width="180" height="135" fill="#333"/></svg>' }); });
  ctx.route("https://archive.org/download/**", (r) => {
    if (/\.jpg$/.test(r.request().url())) { counts.img++; return r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#555"/></svg>' }); }
    counts.video++; return r.fulfill({ status: 200, contentType: "video/webm", body: clip });
  });
  ctx.route("https://www.gstatic.com/**", (r) => r.abort());
  ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
}

const results = [];
const report = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`); };

async function newViewer(browser, url, trouble = {}, profile = "kids", viewport = { width: 1600, height: 900 }) {
  const counts = { search: 0, meta: 0, img: 0, video: 0 };
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((p) => { if (!localStorage.getItem("profile")) localStorage.setItem("profile", p); }, profile);
  mockArchive(ctx, trouble, counts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, counts, errors, url };
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch();

  // 1. Many viewers at once
  {
    served.requests = 0; served.bytes = 0;
    const t0 = Date.now();
    const viewers = await Promise.all(Array.from({ length: VIEWERS }, () => newViewer(browser, URL_, { latency: 150 })));
    const times = await Promise.all(viewers.map(async (v) => {
      const start = Date.now();
      await v.page.goto(v.url);
      await v.page.waitForSelector(".shelf .card[data-id]", { timeout: 30000 });
      const ready = Date.now() - start;
      // each viewer browses: open a movie, play it, go back
      await v.page.click(".shelf .card[data-id]");
      await v.page.click("#play, #resume");
      await v.page.waitForFunction(() => { const x = document.querySelector("#video"); return x && x.getAttribute("src"); }, null, { timeout: 30000 });
      await v.page.keyboard.press("Escape");
      return ready;
    }));
    times.sort((a, b) => a - b);
    const per = viewers.map((v) => v.counts);
    const avg = (k) => (per.reduce((s, c) => s + c[k], 0) / per.length).toFixed(1);
    const errs = viewers.flatMap((v) => v.errors);
    if (errs.length) console.log("      first errors:", [...new Set(errs)].slice(0, 3));
    report(`${VIEWERS} viewers at the same time`, errs.length === 0 && times[times.length - 1] < 30000,
      `rows on screen: median ${times[Math.floor(times.length / 2)]} ms, slowest ${times[times.length - 1]} ms · page errors: ${errs.length} · total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    report("Requests each viewer makes to the movie library", true,
      `per viewer: ${avg("search")} list searches, ${avg("meta")} movie lookups, ${avg("img")} pictures, ${avg("video")} video starts`);
    report("Load on our own site (app files)", true,
      `${(served.requests / VIEWERS).toFixed(0)} files and ${(served.bytes / VIEWERS / 1024).toFixed(0)} KB per first visit`);
    // repeat visit from one viewer: saved lists should mean almost no new searches
    const v = viewers[0];
    const before = { ...v.counts };
    await v.page.goto(v.url); await v.page.waitForSelector(".shelf .card[data-id]");
    await v.page.waitForTimeout(1500);
    report("Coming back later uses saved lists", v.counts.search - before.search <= 1,
      `new list searches on second visit: ${v.counts.search - before.search} (first visit: ${before.search})`);
    await Promise.all(viewers.map((x) => x.ctx.close()));
  }

  // 2. Busy movie library: slow, sometimes overloaded or rate-limited
  {
    const v = await newViewer(browser, URL_, { latency: 1500, failRate: 0.25, rateLimitRate: 0.15 });
    const start = Date.now();
    await v.page.goto(v.url);
    await v.page.waitForSelector(".shelf .card[data-id]", { timeout: 40000 }).catch(() => {});
    await v.page.waitForTimeout(8000);
    const rows = await v.page.$$eval(".shelf .card[data-id]", (c) => c.length);
    const retryButtons = await v.page.$$eval("[data-retry]", (b) => b.length);
    report("Busy library (slow + 25% overloaded + 15% rate-limited)", rows > 0 && v.errors.length === 0,
      `${rows} movies showed within ${((Date.now() - start) / 1000).toFixed(0)} s · ${retryButtons} rows offered "Try again" · page errors: ${v.errors.length}`);
    await v.ctx.close();
  }

  // 3. Library not answering at all (some requests hang forever)
  {
    const v = await newViewer(browser, URL_, { hangRate: 1 });
    await v.page.goto(v.url);
    await v.page.waitForTimeout(45000);
    const msg = await v.page.textContent("#hero-title").catch(() => "");
    const retry = await v.page.$$eval("[data-retry]", (b) => b.length);
    report("Library hangs (never answers)", v.errors.length === 0 && retry > 0,
      `after 45 s: "${msg}" · ${retry} rows show "Try again" instead of loading forever · page errors: ${v.errors.length}`);
    await v.ctx.close();
  }

  // 4. Library completely down
  {
    const v = await newViewer(browser, URL_, { down: true });
    await v.page.goto(v.url);
    await v.page.waitForTimeout(6000);
    const msg = await v.page.textContent("#hero-title");
    report("Library completely down", v.errors.length === 0 && /Can't load/.test(msg), `screen says: "${msg}" · page errors: ${v.errors.length}`);
    await v.ctx.close();
  }

  // 5. Big family with lots of saved data
  {
    const v = await newViewer(browser, URL_, { latency: 50 });
    await v.page.addInitScript(() => {
      if (localStorage.getItem("seeded")) return;
      const profiles = Array.from({ length: 8 }, (_, i) => ({ id: "p" + i, name: "Person " + (i + 1), level: i % 4, color: "#d4a64a", locked: false }));
      localStorage.setItem("profiles", JSON.stringify(profiles));
      localStorage.setItem("profile", "p1");
      for (const p of profiles) {
        localStorage.setItem("mylist:" + p.id, JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: "classi-1-" + (i % 24), title: "Saved " + i, at: Date.now() - i }))));
        localStorage.setItem("watch:" + p.id, JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ id: "classi-1-" + i, title: "Watching " + i, pos: 300, dur: 3000, at: Date.now() - i }))));
        localStorage.setItem("log:" + p.id, JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ id: "m" + i, title: "Watched " + i, at: Date.now() - i * 3600e3, secs: 1200 }))));
        localStorage.setItem("likes:" + p.id, JSON.stringify(Object.fromEntries(Array.from({ length: 200 }, (_, i) => ["m" + i, { v: i % 3 ? 1 : -1, shelf: "cartoons", at: Date.now() }]))));
      }
      localStorage.setItem("seeded", "1");
    });
    const start = Date.now();
    await v.page.goto(v.url);
    await v.page.waitForSelector("#continue .card", { timeout: 20000 });
    const ms = Date.now() - start;
    const kb = await v.page.evaluate(() => Math.round(Object.keys(localStorage).reduce((s, k) => s + k.length + (localStorage.getItem(k) || "").length, 0) * 2 / 1024));
    report("Big family (8 profiles, 100 saved, 300 history each)", ms < 5000 && v.errors.length === 0, `home ready in ${ms} ms · device storage used ${kb} KB of about 5,000 KB · page errors: ${v.errors.length}`);
    await v.ctx.close();
  }

  // 6. Long session: does memory keep growing? (Waits use locators, which, unlike waitForSelector,
  //    don't keep a hold on page elements and so don't make old screens look leaked.)
  {
    const v = await newViewer(browser, URL_, {});
    await v.page.goto(v.url); await v.page.locator(".shelf .card[data-id]").first().waitFor();
    const cdp = await v.ctx.newCDPSession(v.page);
    await cdp.send("Performance.enable");
    const heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); const m = await cdp.send("Performance.getMetrics"); return m.metrics.find((x) => x.name === "JSHeapUsedSize").value / 1048576; };
    const nodes = async () => (await cdp.send("Performance.getMetrics")).metrics.find((x) => x.name === "Nodes").value;
    const h0 = await heap();
    const n0 = await nodes();
    let n10 = 0;
    for (let i = 0; i < 40; i++) {
      if (i === 10) { await heap(); n10 = await nodes(); }
      await v.page.click(".shelf .card[data-id]");
      await v.page.click("#play, #resume");
      await v.page.waitForFunction(() => { const x = document.querySelector("#video"); return x && x.getAttribute("src"); });
      await v.page.keyboard.press("Escape");
      await v.page.keyboard.press("Escape");
      await v.page.locator(".shelf .card[data-id]").first().waitFor();
    }
    await v.page.waitForTimeout(1000);
    await heap();
    const h1 = await heap();
    const n1 = await nodes();
    const growth = (n1 - n10) / 30; // page elements left behind per movie after warm-up
    if (v.errors.length) console.log("      first errors:", [...new Set(v.errors)].slice(0, 3));
    report("Long session (40 movies opened and closed)", h1 - h0 < 15 && growth < 200 && v.errors.length === 0,
      `memory ${h0.toFixed(1)} MB → ${h1.toFixed(1)} MB · page elements ${n0} at start, ${n10} after 10 movies, ${n1} after 40 (${growth.toFixed(0)} left behind per movie) · page errors: ${v.errors.length}`);
    await v.ctx.close();
  }

  // 7. Huge catalog: Browse with "Load more" pressed many times
  {
    const v = await newViewer(browser, URL_, { perRow: 36 });
    await v.page.goto(v.url.replace("index.html", "index.html")); await v.page.waitForSelector(".tab");
    await v.page.click('[data-go="movies"]');
    await v.page.waitForSelector("#results .card");
    for (let i = 0; i < 15; i++) { await v.page.click("#more"); await v.page.waitForFunction((n) => document.querySelectorAll("#results .card").length > n, (i + 1) * 36 - 1, { timeout: 10000 }).catch(() => {}); }
    const count = await v.page.$$eval("#results .card", (c) => c.length);
    // how quickly does the remote/arrow keys move through it?
    await v.page.focus("#results .card");
    const t = Date.now();
    for (let i = 0; i < 60; i++) await v.page.keyboard.press(i % 10 < 5 ? "ArrowDown" : "ArrowRight");
    const perMove = (Date.now() - t) / 60;
    report("Huge catalog (Browse, Load more x15)", count >= 500 && perMove < 50 && v.errors.length === 0,
      `${count} movies on one page · arrow-key move takes ${perMove.toFixed(1)} ms · page errors: ${v.errors.length}`);
    await v.ctx.close();
  }

  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(failed ? `\n${failed} stress check(s) failed` : "\nAll stress checks passed");
  fs.writeFileSync(path.join(__dirname, "stress-results.json"), JSON.stringify({ viewers: VIEWERS, at: new Date().toISOString(), results }, null, 2));
  process.exit(failed ? 1 : 0);
})();
