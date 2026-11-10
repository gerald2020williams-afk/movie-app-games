// Posters end to end: build a catalog with posters from the stand-in archive, serve the app,
// and check movie cards use the site's posters, with title cards for movies without a picture.
// Needs the "sharp" image tool; skipped (and reported) without it.
const { chromium } = require("playwright");
const { execFile } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const mock = require("./mock-archive");
const ROOT = path.resolve(__dirname, "..");
const out = path.join(__dirname, "screenshots"); fs.mkdirSync(out, { recursive: true });
(async () => {
  try { require.resolve("sharp"); } catch (_) { console.log("posters test skipped: sharp not installed"); console.log("errors: []"); return; }
  const port = await mock.start();
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "posters-"));
  await new Promise((res, rej) => execFile(process.execPath, [path.join(ROOT, "scripts", "build-catalog.js")], { env: { ...process.env, ARCHIVE: `http://127.0.0.1:${port}`, OUTDIR: tmp } }, (e, o) => { if (e) rej(e); else { console.log(o.trim().split("\n").filter((l) => /posters:|catalog.json:/.test(l)).join("\n")); res(); } }));
  // Point the catalog's picture and video links at the stand-in archive too.
  const cat = JSON.parse(fs.readFileSync(path.join(tmp, "catalog.json"), "utf8"));
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const base = url === "/catalog.json" || url.startsWith("/posters/") ? tmp : ROOT;
    const file = path.join(base, url === "/" ? "index.html" : url);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg" }[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type }); res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  let archivePictures = 0;
  await ctx.route("https://**", (r) => { if (/services\/img|\.jpg/.test(r.request().url())) archivePictures++; r.fulfill({ status: 404, body: "" }); });
  await ctx.addInitScript(() => localStorage.setItem("profile", "kids"));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await p.locator(".shelf .card").first().waitFor(); await p.waitForTimeout(1500);
  const counts = await p.evaluate(() => ({
    posters: document.querySelectorAll('.card .thumb[style*="posters/"]').length,
    titlecards: document.querySelectorAll(".card .thumb.titlecard").length,
    archive: document.querySelectorAll('.card .thumb[style*="archive.org"]').length,
  }));
  console.log("cards with site posters:", counts.posters, "| title cards:", counts.titlecards, "| still using Archive previews:", counts.archive);
  console.log("picture requests to the Archive:", archivePictures);
  await p.screenshot({ path: out + "/posters-home.png" });
  const tc = await p.$(".card .thumb.titlecard");
  if (tc) { await tc.click(); await p.waitForTimeout(600); await p.screenshot({ path: out + "/posters-titlecard-page.png" }); console.log("title card movie page:", await p.$eval("#mp-art", (e) => e.classList.contains("titlecard"))); }
  console.log("errors:", errors);
  await b.close(); server.close(); mock.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
})();
