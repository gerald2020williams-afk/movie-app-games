// Start-up: keyboard/remote/controller routing and opening the first screen. Loaded last.

// ----- input routing -----
Input.on((action, ev) => {
  if (current && current.onAction && current.onAction(action, ev)) return true;
  if (action === "digit") return false;
  if (["up", "down", "left", "right"].includes(action)) {
    const a = document.activeElement;
    if (a && a.tagName === "INPUT" && (action === "left" || action === "right")) return false;
    return SpatialNav.move(action);
  }
  if (action === "ok") {
    const a = document.activeElement;
    if (a && a.classList.contains("f") && a.tagName !== "INPUT") { a.click(); return true; }
    return false;
  }
  if (action === "back") { back(); return true; }
  if (action === "home") { if (profile) openTab("home"); return true; }
  return false;
});

document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.go)));

// Gold focus ring follows the remote/controller, not the mouse.
document.addEventListener("focusin", (e) => {
  if (e.target.classList && e.target.classList.contains("f")) e.target.classList.toggle("is-focus", !document.body.classList.contains("mouse"));
});
document.addEventListener("focusout", (e) => { if (e.target.classList) e.target.classList.remove("is-focus"); });

document.addEventListener("padchange", (e) => {
  document.getElementById("pad").hidden = !e.detail;
  if (e.detail) toast("Controller connected");
});

const App = { go, back, replace, toast };

updateWho();
Cast.load();
Sync.start().catch(() => {});
// When another device sends changes, refresh what's on screen (but never interrupt a movie).
Sync.onChange((kind) => {
  if (kind !== "changed") return;
  Theme.apply();
  if (profile) { const p = Profiles.get(profile.id); if (p) { profile = p; updateWho(); } }
  if (current && ["home", "profiles"].includes(current.tab) && !document.querySelector("input:focus") && !stack.length) {
    const name = current.tab === "home" ? "home" : "profiles";
    if (name === "home" ? !!profile : true) openTab(name);
  }
});
// A friendly message instead of a silent failure if something unexpected breaks.
window.addEventListener("error", (e) => { if (e.message && !/Script error/i.test(e.message)) { console.error(e.error || e.message); toast("Something went wrong. If it keeps happening, reload the app."); } });
window.addEventListener("unhandledrejection", (e) => { console.error(e.reason); });
document.getElementById("remote-btn").addEventListener("click", () => go(RemoteHostView()));
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

// Opened from the TV's QR code: this device becomes the remote.
const remoteCode = new URLSearchParams(location.search).get("remote");
if (remoteCode) mount(PhoneRemoteView(remoteCode));
else openTab(profile ? "home" : "profiles");
