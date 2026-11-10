// Runs every test. Movies, pictures and the Internet Archive are replaced with stand-ins,
// so the tests work offline. Needs Node and Playwright with Chromium.
//   node tests/run-all.js
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const here = __dirname;
const run = (file) => execFileSync(process.execPath, [path.join(here, file)], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

if (!fs.existsSync(path.join(here, "clip.webm"))) run("make-clip.js");
let failed = 0;
for (const t of ["test-profiles.js", "test-polish.js", "test-cast.js", "test-batch.js", "test-batch2.js", "test-access.js", "test-live.js"]) {
  process.stdout.write(`\n== ${t}\n`);
  try {
    const out = run(t);
    process.stdout.write(out);
    const errs = /errors: \[(.*)\]\s*$/s.exec(out);
    if (!errs || errs[1].trim()) { failed++; console.log(`!! ${t}: page errors`); }
  } catch (e) {
    failed++;
    console.log(e.stdout || "", `!! ${t} crashed`);
  }
}
console.log(failed ? `\n${failed} test file(s) failed` : "\nAll tests passed");
process.exit(failed ? 1 : 0);
