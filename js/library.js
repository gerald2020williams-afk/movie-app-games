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
  };
})();
