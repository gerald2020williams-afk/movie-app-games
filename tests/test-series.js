// Series: built from the real catalog in the repository (served locally, no Internet Archive calls).
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const out = path.join(__dirname, "screenshots"); fs.mkdirSync(out, { recursive: true });
const clip = fs.readFileSync(path.join(__dirname, "clip.webm"));
(async () => {
  if (!fs.existsSync(path.join(ROOT, "catalog.json"))) { console.log("series test skipped: no catalog.json yet"); console.log("errors: []"); return; }
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".webm": "video/webm" }[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.route("https://**", (r) => r.fulfill({ status: 404, body: "" }));
  // Video files: answer from a local stand-in (media requests aren't always caught by page routing).
  await ctx.route("**/*.mp4", (r) => r.fulfill({ status: 200, contentType: "video/webm", body: clip }));
  await ctx.addInitScript(() => {
    // Point movie files at the stand-in clip served by this test's own server.
    const orig = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    Object.defineProperty(HTMLMediaElement.prototype, "src", { set(v) { orig.set.call(this, /archive\.org\/download\//.test(v) ? "/tests/clip.webm" : v); }, get() { return orig.get.call(this); } });
  });
  await ctx.addInitScript(() => localStorage.setItem("profile", "kids"));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await p.locator("#series-row .series-card").first().waitFor({ timeout: 20000 });
  console.log("series on Home:", await p.$$eval("#series-row .series-card", (c) => c.map((x) => x.querySelector(".t").textContent + " (" + (x.querySelector(".ep-count") || {}).textContent + ")")));
  await p.locator("#series-row").scrollIntoViewIfNeeded();
  await p.screenshot({ path: out + "/series-row.png" });
  await p.click('[data-series="s-popeye"]');
  await p.locator(".episode").first().waitFor();
  console.log("Popeye episodes:", await p.$$eval(".episode", (e) => e.length), "| first three:", await p.$$eval(".episode .t", (t) => t.slice(0, 3).map((x) => x.textContent)));
  console.log("main button:", await p.textContent("#play-next"));
  await p.screenshot({ path: out + "/series-page.png" });
  await p.click(".episode:nth-child(2)"); await p.waitForTimeout(1200);
  console.log("player:", await p.evaluate(() => { const v = document.querySelector("#video"); const f = document.querySelector("#wrap iframe"); return v ? "video " + v.getAttribute("src") + " err=" + (v.error && v.error.code) : f ? "fallback player " + f.src : document.querySelector("#view").innerText.slice(0, 200); }));
  await p.evaluate(() => document.querySelector("#video").dispatchEvent(new Event("ended"))); await p.waitForTimeout(600);
  console.log("after episode 2 ends:", await p.textContent("#upnext small"), "→", await p.textContent("#upnext b"));
  await p.click("#next-cancel"); await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  console.log("button now:", await p.textContent("#play-next"));
  // movie page links back to the series
  await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  await p.click('[data-shelf="popeye"] .card'); await p.waitForTimeout(1200);
  console.log("movie page:", await p.textContent(".mp-copy .tag"), "|", await p.$$eval(".mp-copy .btn", (b) => b.map((x) => x.textContent).filter((t) => /episodes/.test(t))));
  console.log("errors:", errors);
  await b.close(); server.close();
})();
