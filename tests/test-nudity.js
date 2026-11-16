// Nudity films: hidden from Little Kids, Kids and Teens; shown to Adults with a clear "Nudity" label.
const { chromium } = require("playwright");
const path = require("path");
const APP = "file://" + path.resolve(__dirname, "..", "index.html");
const out = path.join(__dirname, "screenshots"); require("fs").mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const open = async (profile) => {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
    await ctx.route("https://**", (r) => r.fulfill({ status: 404, body: "" }));
    await ctx.route("https://archive.org/advancedsearch.php**", (r) => {
      const q = new URL(r.request().url()).searchParams.get("q");
      let docs = Array.from({ length: 6 }, (_, i) => ({ identifier: `film${q.length % 97}-${i}`, title: `Classic Film ${i + 1}`, year: 1940 + i, runtime: "1:20:00", description: "A family film." }));
      if (q.includes("Wild Gals")) docs = [
        { identifier: "WildGals", title: "Wild Gals of the Naked West", year: 1962, runtime: "1:05:00", description: "A Russ Meyer western comedy.", subject: ["nudie cutie", "western"] },
        { identifier: "Goldilocks", title: "Goldilocks and the Three Bares", year: 1963, runtime: "1:09:00", description: "A nudist camp musical." },
        { identifier: "NotAdult", title: "The Naked Spur Trailer Clip", year: 1953, runtime: "0:02:00", description: "clip" },
      ];
      r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ response: { docs } }) });
    });
    await ctx.route("https://archive.org/metadata/**", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ result: [{ name: "a.mp4", format: "h.264" }] }) }));
    await ctx.addInitScript((p) => localStorage.setItem("profile", p), profile);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(APP); await p.waitForTimeout(2500);
    return { ctx, p };
  };
  for (const prof of ["little", "kids"]) {
    const { ctx, p } = await open(prof);
    console.log(`${prof}: sees nudity films anywhere:`, await p.evaluate(() => /Wild Gals|Three Bares/.test(document.body.innerText)), "| adults row shown:", !!(await p.$('[data-shelf="adults-nudity"]')));
    await p.click('[data-go="search"]'); await p.fill("#q", "Wild Gals"); await p.waitForTimeout(1500);
    console.log(`${prof}: search shows it as a movie:`, await p.evaluate(() => [...document.querySelectorAll("#results .card")].some((c) => /Wild Gals|Three Bares/.test(c.innerText))), "| message:", await p.evaluate(() => document.querySelector("#results").innerText.slice(0, 60)));
    await ctx.close();
  }
  // Adults (no PIN set in this test)
  const { ctx, p } = await open("adults");
  const row = await p.$('[data-shelf="adults-nudity"]');
  console.log("adults: row title:", row && (await row.$eval("h2", (h) => h.textContent)));
  console.log("adults: cards:", row && (await row.$$eval(".card", (c) => c.map((x) => x.querySelector(".t").textContent))));
  console.log("adults: Nudity badges on posters:", row && (await row.$$eval(".nudity-badge", (b) => b.length)));
  await row.scrollIntoViewIfNeeded(); await p.screenshot({ path: out + "/nudity-row.png" });
  await p.click('[data-shelf="adults-nudity"] .card'); await p.waitForTimeout(600);
  console.log("adults: movie page title:", await p.textContent(".mp-copy h1"), "| warning:", await p.textContent(".content-warning"));
  await p.screenshot({ path: out + "/nudity-page.png" });
  console.log("errors:", errors);
  await b.close();
})();
