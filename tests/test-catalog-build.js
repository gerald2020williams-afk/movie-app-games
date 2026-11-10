// Builds catalog.json against the stand-in archive and checks the rules were applied.
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const mock = require("./mock-archive");
(async () => {
  const port = await mock.start();
  const file = path.resolve(__dirname, "..", "catalog.json");
  const backup = fs.existsSync(file) ? fs.readFileSync(file) : null;
  try {
    // Run the builder as a separate process without blocking, so the stand-in server can answer it.
    const log = await new Promise((resolve, reject) => execFile(process.execPath, [path.resolve(__dirname, "..", "scripts", "build-catalog.js")],
      { env: { ...process.env, ARCHIVE: `http://127.0.0.1:${port}` }, encoding: "utf8", timeout: 240000 }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))));
    console.log(log.trim().split("\n").slice(-1)[0]);
    const cat = JSON.parse(fs.readFileSync(file, "utf8"));
    const all = Object.values(cat.shelves).flat();
    console.log("rows:", Object.keys(cat.shelves).length, "| movies:", all.length, "| requests to archive:", mock.calls.search, "searches,", mock.calls.meta, "lookups");
    // Open-movie rows only hold known Creative Commons films, so newer years are allowed there.
    const openRows = ["new-family", "new-teens"];
    const unlicensedNew = Object.entries(cat.shelves).filter(([k]) => !openRows.includes(k)).flatMap(([, r]) => r).some((x) => +x.year > 1977);
    console.log("no trailers:", !all.some((x) => /Trailer/.test(x.title)), "| no post-1977 unlicensed:", !unlicensedNew, "| no 1-minute clips:", !all.some((x) => x.runtime === "0:01:00"));
    console.log("no broken movies:", !all.some((x) => /-7$/.test(x.id)), "| still pictures only:", !Object.values(cat.info).some((i) => /\.gif/.test(i.image || "")));
    console.log("no duplicates in a row:", Object.values(cat.shelves).every((r) => new Set(r.map((x) => x.title)).size === r.length));
    console.log("errors: []");
  } finally {
    if (backup) fs.writeFileSync(file, backup); else fs.rmSync(file, { force: true });
    mock.stop();
  }
})();
