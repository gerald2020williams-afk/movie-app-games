// Per-profile library: My List, thumbs up/down, and the watch history parents can see.

const Library = (() => {
  function read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (_) { return fallback; }
  }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  const slim = (item) => ({ id: item.id, title: item.title, year: item.year || "", description: (item.description || "").slice(0, 400), runtime: item.runtime || "", shelf: item.shelf || "" });

  return {
    // ----- My List -----
    myList(pid) { return read("mylist:" + pid, []); },
    inMyList(pid, id) { return this.myList(pid).some((x) => x.id === id); },
    toggleMyList(pid, item) {
      const list = this.myList(pid);
      const has = list.some((x) => x.id === item.id);
      write("mylist:" + pid, has ? list.filter((x) => x.id !== item.id) : [{ ...slim(item), at: Date.now() }, ...list].slice(0, 100));
      return !has;
    },

    // ----- Thumbs up / down -----
    rating(pid, id) { return (read("likes:" + pid, {})[id] || {}).v || 0; },
    rate(pid, item, value) {
      const all = read("likes:" + pid, {});
      if (!value || (all[item.id] && all[item.id].v === value)) delete all[item.id];
      else all[item.id] = { v: value, shelf: item.shelf || "", at: Date.now() };
      write("likes:" + pid, all);
      return all[item.id] ? all[item.id].v : 0;
    },
    disliked(pid) { const all = read("likes:" + pid, {}); return new Set(Object.keys(all).filter((k) => all[k].v < 0)); },
    // How much this profile likes each row: thumbs up add, thumbs down subtract.
    shelfScores(pid) {
      const scores = {};
      Object.values(read("likes:" + pid, {})).forEach((r) => { if (r.shelf) scores[r.shelf] = (scores[r.shelf] || 0) + r.v; });
      return scores;
    },

    // ----- Watch history (for parents) -----
    history(pid) { return read("log:" + pid, []); },
    logPlay(pid, item) {
      const log = this.history(pid);
      const recent = log.find((x) => x.id === item.id && Date.now() - x.at < 6 * 3600 * 1000);
      if (recent) { recent.at = Date.now(); write("log:" + pid, [recent, ...log.filter((x) => x !== recent)]); return; }
      write("log:" + pid, [{ id: item.id, title: item.title, at: Date.now(), secs: 0 }, ...log].slice(0, 300));
    },
    addWatchTime(pid, id, secs) {
      const log = this.history(pid);
      const entry = log.find((x) => x.id === id);
      if (!entry) return;
      entry.secs = Math.round((entry.secs || 0) + secs);
      write("log:" + pid, log);
    },
    clearHistory(pid) { write("log:" + pid, []); },

    // ----- Movies a parent hid (for every profile on this device) -----
    hidden() { return read("hidden-movies", []); },
    isHidden(id) { return this.hidden().some((x) => x.id === id); },
    hide(item) { write("hidden-movies", [{ id: item.id, title: item.title, at: Date.now() }, ...this.hidden().filter((x) => x.id !== item.id)]); },
    unhide(id) { write("hidden-movies", this.hidden().filter((x) => x.id !== id)); },
  };
})();

// Kid safety: some very old cartoons and films contain racist stereotypes or wartime propaganda.
// Profiles with the safety filter on (all but Adults, by default) never see titles that match these.
const Safety = (() => {
  const TITLES = [
    "coal black", "jungle jitters", "tin pan alley cats", "uncle tom", "clean pastures", "angel puss",
    "goldilocks and the jivin", "sunday go to meetin", "hittin' the trail for hallelujah", "all this and rabbit stew",
    "tokio jokio", "nips the nips", "japoteurs", "commando duck", "you're a sap", "scrub me mama", "the ducktators",
    "der fuehrer", "education for death", "little black sambo", "inki", "mighty hunters", "jasper", "censored eleven",
    "bugs bunny nips", "herr meets hare", "plane daffy", "the isle of pingo pongo", "little lion hunter",
  ];
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const TITLE_RE = new RegExp("\\b(" + TITLES.map(esc).join("|") + ")\\b", "i");
  const WORDS = /\b(japs?|nips|sambo|darkies?|darky|pickaninn\w*|mammy|injuns?|redskins?|blackface|minstrel|coons?|propaganda|racist|racism|stereotyp\w*)\b/i;
  return {
    filterOn(profile) {
      if (!profile) return true;
      return profile.safety !== undefined ? !!profile.safety : profile.level < 3;
    },
    isUnsafe(item) {
      return TITLE_RE.test(item.title || "") || WORDS.test(item.title || "") || WORDS.test(item.description || "");
    },
  };
})();
