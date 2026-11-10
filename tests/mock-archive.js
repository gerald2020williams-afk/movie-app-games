// A stand-in Internet Archive for testing the catalog builder (no real requests).
const http = require("http");
let calls = { search: 0, meta: 0 };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  res.setHeader("Content-Type", "application/json");
  if (u.pathname === "/advancedsearch.php") {
    calls.search++;
    const q = u.searchParams.get("q");
    const tag = ((q.match(/collection:\(([a-z_]+)/) || [0, "x"])[1]).slice(0, 8);
    const docs = Array.from({ length: 30 }, (_, i) => ({
      identifier: `${tag}-${i}`, title: i === 3 ? `${tag} Trailer` : i === 4 ? "Coal Black and de Sebben Dwarfs" : `${tag} film ${i % 20}`,
      year: i === 5 ? 2015 : 1930 + i, runtime: i === 6 ? "0:01:00" : "1:10:00", description: "A film.",
    }));
    return res.end(JSON.stringify({ response: { docs } }));
  }
  if (u.pathname.startsWith("/metadata/")) {
    calls.meta++;
    const id = u.pathname.split("/")[2];
    const broken = id.endsWith("-7");
    return res.end(JSON.stringify({ result: broken ? [] : [{ name: `${id}.mp4`, format: "h.264", length: "4200" }, { name: `${id}.jpg`, format: "JPEG", size: "50000" }, { name: `${id}.gif`, format: "Animated GIF", size: "900000" }] }));
  }
  res.statusCode = 404; res.end("{}");
});
module.exports = { start: () => new Promise((r) => server.listen(0, () => r(server.address().port))), stop: () => server.close(), calls };
if (require.main === module) module.exports.start().then((p) => console.log("mock archive on", p));
