// Bundles and shrinks the app: all scripts into dist/app.min.js and the styles into
// dist/styles.min.css. Newer JavaScript is also converted so older smart-TV browsers can run it.
//   npm run build      (run after changing anything in js/ or styles.css)
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// Load order matters: later files use what earlier files define.
const SCRIPTS = [
  "js/data.js", "js/settings.js", "js/input.js", "js/catalog.js", "js/profiles.js", "js/history.js",
  "js/cast.js", "js/library.js", "js/theme.js", "js/remote.js", "js/sync.js",
  "js/app/core.js", "js/app/family.js", "js/app/remote-screens.js", "js/app/browse.js",
  "js/app/player.js", "js/app/live.js", "js/app/start.js",
];
// Old TV browsers: Samsung Tizen 4 / LG webOS 4 era is roughly Chrome 56–63 and Safari 11.
const TARGET = ["chrome61", "safari11", "edge79", "firefox60"];

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
const joined = SCRIPTS.map((f) => `/* ${f} */\n` + fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
const js = esbuild.transformSync(joined, { minify: true, target: TARGET, legalComments: "none" });
fs.writeFileSync(path.join(ROOT, "dist", "app.min.js"), js.code);
const css = esbuild.transformSync(fs.readFileSync(path.join(ROOT, "styles.css"), "utf8"), { loader: "css", minify: true, target: TARGET });
fs.writeFileSync(path.join(ROOT, "dist", "styles.min.css"), css.code);

const kb = (f) => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0) + " KB";
const before = SCRIPTS.reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0) + fs.statSync(path.join(ROOT, "styles.css")).size;
console.log(`dist/app.min.js ${kb("dist/app.min.js")} · dist/styles.min.css ${kb("dist/styles.min.css")} (was ${(before / 1024).toFixed(0)} KB in ${SCRIPTS.length + 1} files)`);
