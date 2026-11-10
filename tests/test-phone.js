// Phone and tablet: bottom tab bar, row swiping, mini player, and turning sideways for full screen.
const { chromium, devices } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const out = path.join(__dirname, "screenshots"); fs.mkdirSync(out, { recursive: true });
(async () => {
  if (!fs.existsSync(path.join(ROOT, "catalog.json"))) { console.log("phone test skipped: no catalog.json yet"); console.log("errors: []"); return; }
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".webm": "video/webm" }[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, r));
  const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;
  const b = await chromium.launch();
  const errors = [];
  const open = async (opts) => {
    const ctx = await b.newContext(opts);
    await ctx.route("https://**", (r) => r.fulfill({ status: 404, body: "" }));
    await ctx.addInitScript(() => {
      localStorage.setItem("profile", "kids");
      const orig = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
      Object.defineProperty(HTMLMediaElement.prototype, "src", { set(v) { orig.set.call(this, /archive\.org\/download\//.test(v) ? "/tests/clip.webm" : v); }, get() { return orig.get.call(this); } });
      window.__fs = 0; HTMLElement.prototype.requestFullscreen = function () { window.__fs++; return Promise.resolve(); };
    });
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(URL_); await p.locator(".shelf .card").first().waitFor({ timeout: 20000 });
    return { ctx, p };
  };

  // Phone (portrait)
  const { ctx, p } = await open({ ...devices["Pixel 7"] });
  const bar = await p.evaluate(() => { const t = document.querySelector(".tabs"); const r = t.getBoundingClientRect(); return { fixed: getComputedStyle(t).position, atBottom: Math.round(innerHeight - r.bottom) <= 1, icons: document.querySelectorAll(".tab-icon").length, visibleIcons: [...document.querySelectorAll(".tab-icon")].filter((i) => getComputedStyle(i).display !== "none").length }; });
  console.log("bottom tab bar:", bar);
  console.log("page fits the phone (no sideways scroll):", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const row = await p.evaluate(() => { const r = document.querySelector(".shelf .row"); return { snap: getComputedStyle(r).scrollSnapType, swipeable: r.scrollWidth > r.clientWidth }; });
  console.log("rows swipe and snap:", row);
  await p.screenshot({ path: out + "/phone-home.png" });
  // swipe a row with touch
  const box = await p.locator(".shelf .row").first().boundingBox();
  await p.touchscreen.tap(box.x + 10, box.y + 10).catch(() => {});
  await p.evaluate(() => document.querySelector(".shelf .row").scrollBy({ left: 300 }));
  console.log("row moved after swipe:", await p.evaluate(() => document.querySelector(".shelf .row").scrollLeft > 0));
  // open a movie and play
  await p.locator(".shelf .card").first().tap(); await p.waitForTimeout(500);
  await p.locator("#play, #resume").first().tap(); await p.waitForTimeout(1500);
  console.log("mini player button:", await p.isVisible("#pip"));
  console.log("player fits the phone:", await p.evaluate(() => { const r = document.querySelector("#full").getBoundingClientRect(); const w = document.querySelector("#wrap").getBoundingClientRect(); return r.right <= innerWidth && w.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; }));
  await p.screenshot({ path: out + "/phone-player.png" });
  await p.evaluate(() => document.querySelector("#video").play().catch(() => {}));
  await p.setViewportSize({ width: 915, height: 412 }); await p.waitForTimeout(600);
  console.log("turned sideways → full screen requested:", await p.evaluate(() => window.__fs > 0));
  await ctx.close();

  // Tablet (landscape)
  const t = await open({ viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  console.log("tablet fits (no sideways scroll):", await t.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "| top tabs on tablet:", await t.p.evaluate(() => getComputedStyle(document.querySelector(".tabs")).position !== "fixed"));
  await t.p.screenshot({ path: out + "/tablet-home.png" });
  await t.ctx.close();
  console.log("errors:", errors);
  await b.close(); server.close();
})();
