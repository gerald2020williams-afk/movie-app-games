// Live Channels: free movies playing back to back on a schedule, like Pluto TV.
// The schedule is worked out from the clock, so there's no server: every device that tunes in
// at the same moment lands on the same movie at the same spot.

const LIVE_EPOCH = Date.UTC(2026, 0, 1);

// Same shuffle every time for the same seed (channel + week), so schedules are stable.
function seededShuffle(list, seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const channelCache = new Map();
async function channelLineup(ch) {
  const key = ch.id + "|" + profile.id;
  if (channelCache.has(key)) return channelCache.get(key);
  const lists = await Promise.all(ch.shelves.map((id) => SHELVES.find((s) => s.id === id)).filter(Boolean)
    .map((s) => Catalog.shelf(s).then((items) => items.map((it) => ({ ...it, shelf: s.id }))).catch(() => [])));
  const seen = new Set();
  const items = allowed(lists.flat()).filter((it) => (seen.has(it.id) ? false : seen.add(it.id)))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const week = Math.floor((Date.now() - LIVE_EPOCH) / (7 * 864e5));
  const lineup = seededShuffle(items, ch.id + ":" + week).map((it) => {
    const known = Catalog.minutes(it.runtime);
    return { ...it, mins: known && known > 1 ? known : ch.minutes };
  });
  channelCache.set(key, lineup);
  return lineup;
}

// What's on right now: the movie, how far in, and what's next.
function nowPlaying(lineup, at = Date.now()) {
  const total = lineup.reduce((s, x) => s + x.mins, 0);
  if (!total) return null;
  let t = ((at - LIVE_EPOCH) / 60000) % total;
  for (let i = 0; i < lineup.length; i++) {
    if (t < lineup[i].mins) return { item: lineup[i], offset: t * 60, left: lineup[i].mins - t, next: lineup[(i + 1) % lineup.length], index: i };
    t -= lineup[i].mins;
  }
  return null;
}

function channelsFor(level) {
  const holiday = Theme.featuredShelf();
  return CHANNELS.filter((c) => c.level <= level && (c.id !== "ch-holiday" || holiday === "holiday"));
}

function LiveView() {
  let clock = 0;
  return {
    tab: "live",
    render(el) {
      const chans = channelsFor(profile.level);
      el.innerHTML = `<section class="page">
        <h1>Live Channels</h1>
        <p class="sub">Free movies playing now, back to back. Tune in any time.</p>
        <div class="channels">${chans.map((c) => `
          <button class="f channel" data-ch="${c.id}">
            <span class="ch-name"><span class="live-dot">LIVE</span>${escapeHtml(c.name)}</span>
            <span class="ch-now" data-now>Loading…</span>
            <span class="ch-bar"><i data-bar></i></span>
            <span class="ch-next" data-next></span>
          </button>`).join("")}</div>
      </section>`;
      const update = () => chans.forEach(async (c) => {
        const card = el.querySelector(`[data-ch="${c.id}"]`);
        const lineup = await channelLineup(c);
        const now = nowPlaying(lineup);
        if (!card.isConnected) return;
        if (!now) { card.remove(); return; }
        card.querySelector("[data-now]").textContent = `Now: ${now.item.title}`;
        card.querySelector("[data-bar]").style.width = `${Math.round((1 - now.left / now.item.mins) * 100)}%`;
        card.querySelector("[data-next]").textContent = `${Math.max(1, Math.round(now.left))} min left · Next: ${now.next.title}`;
      });
      update();
      clock = setInterval(update, 30000);
      el.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => go(LivePlayerView(b.dataset.ch))));
      SpatialNav.focus(el.querySelector("[data-ch]"));
    },
    destroy() { clearInterval(clock); },
  };
}

// Plays a channel. Up/Down (or Channel +/−) on the remote switches channels.
function LivePlayerView(channelId) {
  let video = null, wakeLock = null, onNow = null, ticker = 0, extrasOff = null;
  const ch = CHANNELS.find((c) => c.id === channelId);
  const awake = async (on) => {
    try {
      if (on && !wakeLock && "wakeLock" in navigator) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (_) { wakeLock = null; }
  };
  return {
    tab: "live",
    render(el) {
      el.innerHTML = `<section class="player">
        <div class="player-bar"><button class="f btn" id="back">← Back</button>
          <h1><span class="live-dot">LIVE</span> ${escapeHtml(ch.name)} <small id="live-title"></small></h1>
          <button class="f btn" id="full">⛶ Full screen</button></div>
        <div class="screen-wrap" id="wrap">
          <video class="f" id="video" controls playsinline preload="auto"></video>
          <div class="loading" id="loading">Tuning in…</div>
          <div class="live-next" id="live-next"></div>
        </div>
      </section>`;
      video = el.querySelector("#video");
      el.querySelector("#back").addEventListener("click", back);
      el.querySelector("#full").addEventListener("click", () => fullscreen(video));
      extrasOff = mobileVideoExtras(el, video);
      SpatialNav.focus(video);
      const tune = async () => {
        const lineup = await channelLineup(ch);
        const now = nowPlaying(lineup);
        if (!video.isConnected) return;
        if (!now) { el.querySelector("#loading").textContent = "Nothing on this channel right now."; return; }
        onNow = now;
        el.querySelector("#live-title").textContent = `· ${now.item.title}`;
        el.querySelector("#live-next").textContent = `Next: ${now.next.title}`;
        try {
          const info = await Catalog.info(now.item.id);
          if (!video.isConnected) return;
          if (!info.src) { Catalog.markBroken(now.item.id); channelCache.clear(); return tune(); }
          const saver = Settings.get("saver") === "on" || (Settings.onCellData() && Settings.get("cellData") !== "full");
          video.src = (saver && info.small) || info.src;
          video.poster = info.image || Catalog.image(now.item.id);
          video.addEventListener("loadedmetadata", () => {
            // Join at the scheduled spot (if the file is shorter than expected, start near its end).
            video.currentTime = Math.min(now.offset, Math.max(0, (video.duration || now.offset) - 5));
          }, { once: true });
          Library.logPlay(profile.id, now.item);
          video.play().catch(() => toast("Press OK or tap the movie to start"));
        } catch (_) {
          el.querySelector("#loading").textContent = "Couldn't tune in. Check your internet connection.";
        }
      };
      video.addEventListener("playing", () => { el.querySelector("#loading").hidden = true; awake(true); });
      video.addEventListener("pause", () => awake(false));
      video.addEventListener("ended", () => tune());
      let last = 0;
      video.addEventListener("timeupdate", () => {
        const t = Date.now();
        if (!video.paused && onNow && last && t - last < 2000) Library.addWatchTime(profile.id, onNow.item.id, (t - last) / 1000);
        last = t;
      });
      tune();
      // Keep the "Next" line fresh.
      ticker = setInterval(() => { if (onNow) el.querySelector("#live-next").textContent = `Next: ${onNow.next.title}`; }, 60000);
    },
    onAction(action) {
      if (!video || document.activeElement !== video) return false;
      if (action === "up" || action === "down") {
        const list = channelsFor(profile.level);
        const i = list.findIndex((c) => c.id === channelId);
        const nextCh = list[(i + (action === "up" ? -1 : 1) + list.length) % list.length];
        replace(LivePlayerView(nextCh.id));
        toast(nextCh.name);
        return true;
      }
      if (action === "ok" || action === "a") { video.paused ? video.play() : video.pause(); return true; }
      if (action === "y") { fullscreen(video); return true; }
      return false;
    },
    destroy() {
      if (extrasOff) extrasOff();
      clearInterval(ticker);
      awake(false);
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
  };
}
