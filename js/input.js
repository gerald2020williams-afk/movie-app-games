// Unified input: keyboard, TV remote (arrow keys + Enter + Back), and game controllers.
// Emits actions: up, down, left, right, ok, back, a, b, x, y, menu.
// Also tracks which directions are held, for arcade games.

const Input = (() => {
  const listeners = [];
  const held = new Set();
  let padConnected = false;

  function emit(action, ev) {
    for (let i = listeners.length - 1; i >= 0; i--) {
      if (listeners[i](action, ev) === true) return true;
    }
    return false;
  }

  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    Enter: "ok", " ": "ok",
    Escape: "back", Backspace: "back", BrowserBack: "back", GoBack: "back",
    "1": "a", "2": "b", "3": "x", "4": "y",
    m: "menu", M: "menu", ContextMenu: "menu",
    "5": "digit", "6": "digit", "7": "digit", "8": "digit", "9": "digit", "0": "digit",
  };

  window.addEventListener("keydown", (e) => {
    const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    let action = KEYMAP[e.key];
    // Some TV remotes report Back as keyCode 10009 (Samsung) or 461 (LG).
    if (e.keyCode === 10009 || e.keyCode === 461) action = "back";
    if (!action) return;
    if (typing && !["up", "down", "back"].includes(action)) return;
    if (typing && action === "back" && e.key === "Backspace") return;
    if (["up", "down", "left", "right"].includes(action)) held.add(action);
    if (emit(action, e)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    const action = KEYMAP[e.key];
    if (action) held.delete(action);
  });

  // ----- Game controllers (standard mapping) -----
  const BUTTONS = { 0: "a", 1: "b", 2: "x", 3: "y", 8: "back", 9: "menu", 12: "up", 13: "down", 14: "left", 15: "right" };
  const prev = {};
  const repeatAt = {};
  const padHeld = new Set();

  function poll(t) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const nowHeld = new Set();
    let any = false;
    for (const p of pads) {
      if (!p) continue;
      any = true;
      p.buttons.forEach((btn, i) => {
        const name = BUTTONS[i];
        if (!name) return;
        if (btn.pressed) nowHeld.add(name);
      });
      const [ax, ay] = p.axes;
      if (ax < -0.5) nowHeld.add("left");
      if (ax > 0.5) nowHeld.add("right");
      if (ay < -0.5) nowHeld.add("up");
      if (ay > 0.5) nowHeld.add("down");
    }
    if (any !== padConnected) {
      padConnected = any;
      document.dispatchEvent(new CustomEvent("padchange", { detail: any }));
    }
    for (const name of nowHeld) {
      const dir = ["up", "down", "left", "right"].includes(name);
      if (!prev[name]) {
        emitPad(name);
        repeatAt[name] = t + 420;
      } else if (dir && t >= repeatAt[name]) {
        emitPad(name);
        repeatAt[name] = t + 140;
      }
    }
    for (const name of Object.keys(prev)) if (!nowHeld.has(name)) delete prev[name];
    for (const name of nowHeld) prev[name] = true;
    padHeld.clear();
    for (const n of nowHeld) padHeld.add(n);
    requestAnimationFrame(poll);
  }

  // Controller A works as "OK" and B as "Back" unless a screen (like trivia) uses them as answers.
  function emitPad(name) {
    document.body.classList.remove("mouse");
    if (emit(name)) return;
    if (name === "a") emit("ok");
    else if (name === "b") emit("back");
  }

  requestAnimationFrame(poll);

  return {
    on(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    isHeld(dir) { return held.has(dir) || padHeld.has(dir); },
    get padConnected() { return padConnected; },
  };
})();

// ----- Spatial navigation: move focus to the nearest focusable item in a direction -----
const SpatialNav = {
  focusables() {
    return [...document.querySelectorAll(".f")].filter((el) => {
      if (el.disabled) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    });
  },
  move(dir) {
    const items = this.focusables();
    const cur = document.activeElement && document.activeElement.classList.contains("f") ? document.activeElement : null;
    if (!cur) { items[0] && this.focus(items[0]); return true; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      let main, side;
      if (dir === "right") { if (b.left < a.right - 4) continue; main = b.left - a.right; side = Math.abs(by - ay); }
      if (dir === "left") { if (b.right > a.left + 4) continue; main = a.left - b.right; side = Math.abs(by - ay); }
      if (dir === "down") { if (b.top < a.bottom - 4) continue; main = b.top - a.bottom; side = Math.abs(bx - ax); }
      if (dir === "up") { if (b.bottom > a.top + 4) continue; main = a.top - b.bottom; side = Math.abs(bx - ax); }
      // Strongly prefer items that line up with the current one (same row for left/right, same column for up/down).
      const horizontal = dir === "left" || dir === "right";
      const overlaps = horizontal ? (b.top < a.bottom && b.bottom > a.top) : (b.left < a.right && b.right > a.left);
      const score = Math.max(0, main) + side * 2.2 + (overlaps ? 0 : 5000);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) this.focus(best);
    return true;
  },
  focus(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  },
};

// Show the gold focus ring for controller/remote use, not for mouse clicks.
document.addEventListener("mousedown", () => document.body.classList.add("mouse"));
document.addEventListener("keydown", () => document.body.classList.remove("mouse"));
