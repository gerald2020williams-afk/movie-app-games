// Looks: the everyday Black & Gold, plus holiday looks that switch on by date (or can be picked).

const Theme = (() => {
  const LOOKS = {
    gold: { name: "Black & Gold" },
    christmas: { name: "Christmas", greeting: "Merry Christmas", shelf: "holiday",
      vars: { "--gold": "#d9b45a", "--gold-light": "#f3d98b", "--bg": "#08100c", "--panel": "#122019", "--panel-2": "#1a2c22", "--line": "#24392d", "--accent-2": "#c8323c" } },
    newyear: { name: "New Year", greeting: "Happy New Year",
      vars: { "--gold": "#e0c068", "--gold-light": "#f6e3a4", "--bg": "#07070c", "--panel": "#14141d", "--panel-2": "#1c1c28", "--line": "#2a2a38", "--accent-2": "#c9ccd6" } },
    valentines: { name: "Valentine's Day", greeting: "Happy Valentine's Day",
      vars: { "--gold": "#e7a3b5", "--gold-light": "#f6cdd8", "--on-gold": "#2a0a14", "--bg": "#0e0709", "--panel": "#1d1014", "--panel-2": "#28161c", "--line": "#3a2128", "--accent-2": "#d6345a" } },
    july4: { name: "Fourth of July", greeting: "Happy Fourth of July",
      vars: { "--gold": "#d9b45a", "--gold-light": "#f3d98b", "--bg": "#070a12", "--panel": "#111827", "--panel-2": "#172036", "--line": "#243049", "--accent-2": "#c8323c" } },
    halloween: { name: "Halloween", greeting: "Happy Halloween", shelf: "holiday",
      vars: { "--gold": "#f08a24", "--gold-light": "#f7b267", "--on-gold": "#1a0d00", "--bg": "#0b0710", "--panel": "#18101f", "--panel-2": "#22172b", "--line": "#33243f", "--accent-2": "#8b5cf6" } },
    thanksgiving: { name: "Thanksgiving", greeting: "Happy Thanksgiving", shelf: "holiday",
      vars: { "--gold": "#d39a4a", "--gold-light": "#ebc283", "--bg": "#0d0906", "--panel": "#1c140d", "--panel-2": "#261b12", "--line": "#3a2a1c", "--accent-2": "#b5532a" } },
  };

  // Which holiday (if any) a date falls in.
  function seasonFor(d = new Date()) {
    const m = d.getMonth() + 1, day = d.getDate(), y = d.getFullYear();
    if (m === 12 && day >= 1 && day <= 26) return "christmas";
    if ((m === 12 && day >= 27) || (m === 1 && day <= 2)) return "newyear";
    if (m === 2 && day >= 7 && day <= 14) return "valentines";
    if (m === 7 && day <= 5) return "july4";
    if (m === 10 && day >= 15) return "halloween";
    if (m === 11) {
      // Thanksgiving: the fourth Thursday of November, shown the week before through that weekend.
      const firstThu = 1 + ((4 - new Date(y, 10, 1).getDay() + 7) % 7);
      const tday = firstThu + 21;
      if (day >= tday - 7 && day <= tday + 3) return "thanksgiving";
    }
    return "gold";
  }

  function setting() { try { return localStorage.getItem("look") || "auto"; } catch (_) { return "auto"; } }
  function current() { const s = setting(); return s === "auto" ? seasonFor() : (LOOKS[s] ? s : "gold"); }

  function apply() {
    const id = current();
    const root = document.documentElement;
    Object.values(LOOKS).forEach((l) => Object.keys(l.vars || {}).forEach((k) => root.style.removeProperty(k)));
    Object.entries(LOOKS[id].vars || {}).forEach(([k, v]) => root.style.setProperty(k, v));
    root.dataset.look = id;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = (LOOKS[id].vars && LOOKS[id].vars["--bg"]) || "#0a0a0a";
  }

  return {
    LOOKS, apply, current, setting, seasonFor,
    set(value) { try { localStorage.setItem("look", value); } catch (_) {} apply(); },
    greeting() { return LOOKS[current()].greeting || ""; },
    featuredShelf() { return LOOKS[current()].shelf || ""; },
  };
})();
Theme.apply();
