// Continue Watching: remembers where each profile stopped in each movie.

const History = (() => {
  const MAX = 30;
  const key = (pid) => "watch:" + pid;

  function list(pid) {
    try { const v = JSON.parse(localStorage.getItem(key(pid))); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }
  function write(pid, items) {
    try { localStorage.setItem(key(pid), JSON.stringify(items.slice(0, MAX))); } catch (_) {}
  }

  return {
    // Movies started but not finished, most recent first.
    list,
    get(pid, id) { return list(pid).find((x) => x.id === id) || null; },
    save(pid, item, pos, dur) {
      if (!pid || !dur || !isFinite(dur)) return;
      const rest = list(pid).filter((x) => x.id !== item.id);
      // Finished (or barely started): don't keep it in Continue Watching.
      if (pos > dur * 0.95 || dur - pos < 45) { write(pid, rest); return; }
      if (pos < 20) { write(pid, rest); return; }
      const entry = { id: item.id, title: item.title, year: item.year || "", description: item.description || "", runtime: item.runtime || "", pos, dur, at: Date.now() };
      write(pid, [entry, ...rest]);
    },
    remove(pid, id) { write(pid, list(pid).filter((x) => x.id !== id)); },
  };
})();

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
