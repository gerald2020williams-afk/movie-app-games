// The movie player: data saver, casting, lock-screen controls, Up next, Continue Watching.

let sessionAnswer = null; // answer to "You're on cell data" for this visit

// Plays a movie. `list` is the row it came from, used for "Up next".
function PlayerView(item, list = [], { resume = true } = {}) {
  let saveTimer = 0, countdown = 0, video = null, info = null;
  let casting = false, remote = null, remoteOffs = [], castOff = null, lastRemote = { pos: 0, dur: 0 };
  let airplayAvailable = false, remotePlaybackAvailable = false;
  const saveProgress = () => { if (video && video.currentTime) History.save(profile.id, item, video.currentTime, video.duration); };
  const nextItem = () => {
    const i = list.findIndex((x) => x.id === item.id);
    for (let k = i + 1; k < list.length; k++) if (!Catalog.isBroken(list[k].id)) return list[k];
    return null;
  };
  // Lock screen, headphones, car and keyboard media keys.
  function setupMediaSession(video, info) {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({ title: item.title, artist: item.creator || "Free movie", album: item.year ? String(item.year) : "",
        artwork: [{ src: info.image || Catalog.image(item.id), sizes: "512x512" }] });
      const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch (_) {} };
      set("play", () => video.play());
      set("pause", () => video.pause());
      set("seekbackward", (d) => { video.currentTime = Math.max(0, video.currentTime - (d.seekOffset || 10)); });
      set("seekforward", (d) => { video.currentTime = Math.min(video.duration || 0, video.currentTime + (d.seekOffset || 10)); });
      set("seekto", (d) => { if (d.fastSeek && "fastSeek" in video) video.fastSeek(d.seekTime); else video.currentTime = d.seekTime; });
      const next = nextItem();
      set("nexttrack", next ? () => replace(PlayerView(next, list, { resume: true })) : null);
      let last = 0;
      video.addEventListener("timeupdate", () => {
        if (Date.now() - last < 4000 || !video.duration || !isFinite(video.duration)) return;
        last = Date.now();
        try { ms.setPositionState({ duration: video.duration, playbackRate: video.playbackRate, position: Math.min(video.currentTime, video.duration) }); } catch (_) {}
      });
      video.addEventListener("play", () => { ms.playbackState = "playing"; });
      video.addEventListener("pause", () => { ms.playbackState = "paused"; });
    } catch (_) {}
  }
  // Keep the screen (TV, tablet, phone) from dimming or sleeping while a movie plays.
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && "wakeLock" in navigator && document.visibilityState === "visible") {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (_) { wakeLock = null; }
  }
  const onVisible = () => { if (document.visibilityState === "visible" && video && !video.paused) keepAwake(true); };
  function clearMediaSession() {
    if (!("mediaSession" in navigator)) return;
    try { navigator.mediaSession.metadata = null; ["play", "pause", "seekbackward", "seekforward", "seekto", "nexttrack"].forEach((a) => navigator.mediaSession.setActionHandler(a, null)); } catch (_) {}
  }
  function fallback(wrap) {
    // Use the Internet Archive's own player if the file won't play here.
    if (!wrap.isConnected) return;
    wrap.innerHTML = `<iframe src="${Catalog.embed(item.id)}" title="${escapeHtml(item.title)}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  }
  function showUpNext(el, next) {
    const box = el.querySelector("#upnext");
    let left = 10;
    box.innerHTML = `
      <span class="thumb" style="background-image:url('${Catalog.image(next.id)}')"></span>
      <div><small>Up next</small><b>${escapeHtml(next.title)}</b><span id="upnext-count">Starts in ${left} seconds</span>
        <div class="btns"><button class="f btn gold" id="next-now">▶ Play now</button><button class="f btn" id="next-cancel">Cancel</button></div></div>`;
    box.hidden = false;
    Catalog.info(next.id).then((info) => { if (info.image) sharpen(box.querySelector(".thumb"), info.image); }).catch(() => {});
    const playNext = () => { clearInterval(countdown); replace(PlayerView(next, list, { resume: true })); };
    box.querySelector("#next-now").addEventListener("click", playNext);
    box.querySelector("#next-cancel").addEventListener("click", () => { clearInterval(countdown); box.hidden = true; SpatialNav.focus(el.querySelector("#back")); });
    SpatialNav.focus(box.querySelector("#next-now"));
    countdown = setInterval(() => {
      left--;
      const c = box.querySelector("#upnext-count");
      if (c) c.textContent = `Starts in ${left} second${left === 1 ? "" : "s"}`;
      if (left <= 0) playNext();
    }, 1000);
  }
  return {
    tab: current ? current.tab : "home",
    render(el) {
      el.innerHTML = `<section class="player">
        <div class="player-bar"><button class="f btn" id="back">← Back</button><h1>${escapeHtml(item.title)}</h1>
          <button class="f btn" id="cast" hidden>Cast to TV</button>
          <button class="f btn" id="full">⛶ Full screen</button></div>
        <div class="screen-wrap" id="wrap">
          <video class="f" id="video" controls playsinline x-webkit-airplay="allow" preload="auto" poster="${Catalog.image(item.id)}"></video>
          <div class="loading" id="loading">Loading movie…</div>
          <div class="casting" id="casting" hidden></div>
          <div class="data-ask" id="data-ask" hidden></div>
          <div class="upnext" id="upnext" hidden></div>
        </div>
      </section>`;
      video = el.querySelector("#video");
      const wrap = el.querySelector("#wrap");
      el.querySelector("#back").addEventListener("click", back);
      el.querySelector("#full").addEventListener("click", () => fullscreen(video));
      SpatialNav.focus(video);

      const prog = resume ? History.get(profile.id, item.id) : null;

      // ----- Cast to TV -----
      const castBtn = el.querySelector("#cast");
      const castBox = el.querySelector("#casting");
      const updateCastButton = () => {
        const can = Cast.chromecastAvailable() || airplayAvailable || remotePlaybackAvailable;
        castBtn.hidden = !can && !casting;
        castBtn.textContent = casting ? "Stop casting" : "Cast to TV";
        el.querySelector("#full").hidden = casting;
      };
      castOff = Cast.onChange(updateCastButton);
      Cast.watchAirplay(video, (ok) => { airplayAvailable = ok; updateCastButton(); });
      if (!Cast.chromecastAvailable()) Cast.watchRemotePlayback(video, (ok) => { remotePlaybackAvailable = ok; updateCastButton(); });
      updateCastButton();

      const drawCasting = () => {
        const p = remote ? remote.player : null;
        const paused = p ? p.isPaused : false;
        castBox.querySelector("#cast-time").textContent = p && p.duration ? `${formatTime(p.currentTime)} / ${formatTime(p.duration)}` : "Starting…";
        castBox.querySelector("#cast-pp").textContent = paused ? "▶ Play" : "❚❚ Pause";
      };
      const enterCasting = () => {
        casting = true;
        video.pause();
        video.hidden = true;
        el.querySelector("#loading").hidden = true;
        castBox.innerHTML = `
          <small>Playing on</small><b>${escapeHtml(Cast.deviceName())}</b>
          <span class="cast-title">${escapeHtml(item.title)}</span>
          <span id="cast-time">Starting…</span>
          <div class="btns center">
            <button class="f btn" id="cast-back">⟲ 10s</button>
            <button class="f btn gold" id="cast-pp">❚❚ Pause</button>
            <button class="f btn" id="cast-fwd">10s ⟳</button>
            <button class="f btn" id="cast-stop">Stop casting</button>
          </div>`;
        castBox.hidden = false;
        remote = Cast.remote();
        castBox.querySelector("#cast-pp").addEventListener("click", () => remote && remote.playPause());
        castBox.querySelector("#cast-back").addEventListener("click", () => remote && remote.seekBy(-10));
        castBox.querySelector("#cast-fwd").addEventListener("click", () => remote && remote.seekBy(10));
        castBox.querySelector("#cast-stop").addEventListener("click", () => Cast.stop());
        SpatialNav.focus(castBox.querySelector("#cast-pp"));
        let saved = 0;
        if (remote) {
          remoteOffs.push(remote.on("CURRENT_TIME_CHANGED", () => {
            const p = remote.player;
            if (p.duration) {
              if (!lastRemote.logged) Library.logPlay(profile.id, item);
              if (lastRemote.pos && p.currentTime > lastRemote.pos && p.currentTime - lastRemote.pos < 5) Library.addWatchTime(profile.id, item.id, p.currentTime - lastRemote.pos);
              lastRemote = { pos: p.currentTime, dur: p.duration, logged: true };
            }
            drawCasting();
            if (Date.now() - saved > 5000 && p.duration) { saved = Date.now(); History.save(profile.id, item, p.currentTime, p.duration); }
          }));
          remoteOffs.push(remote.on("IS_PAUSED_CHANGED", drawCasting));
          remoteOffs.push(remote.on("PLAYER_STATE_CHANGED", () => {
            // The movie finished on the TV: offer the next one.
            const p = remote.player;
            if (p.playerState === "IDLE" && lastRemote.dur && lastRemote.dur - lastRemote.pos < 5) {
              History.remove(profile.id, item.id);
              const next = nextItem();
              if (next) showUpNext(el, next);
            }
          }));
          remoteOffs.push(remote.on("IS_CONNECTED_CHANGED", () => { if (!remote.player.isConnected) exitCasting(); }));
        }
        updateCastButton();
        toast(`Playing on ${Cast.deviceName()}`);
      };
      const exitCasting = () => {
        if (!casting) return;
        casting = false;
        remoteOffs.forEach((off) => off()); remoteOffs = [];
        castBox.hidden = true;
        video.hidden = false;
        if (lastRemote.pos) { History.save(profile.id, item, lastRemote.pos, lastRemote.dur); video.currentTime = lastRemote.pos; }
        SpatialNav.focus(video);
        updateCastButton();
        toast("Back on this screen");
      };
      const castNow = async (startAt) => {
        try {
          await Cast.play({ src: info.src, title: item.title, image: info.image || Catalog.image(item.id), startAt });
          enterCasting();
        } catch (e) {
          const cancelled = e === "cancel" || (e && e.code === "cancel") || String(e && (e.code || e)).includes("cancel");
          if (!cancelled) toast("Couldn't connect to the TV. Make sure it's on the same Wi-Fi.");
        }
      };
      castBtn.addEventListener("click", () => {
        if (casting) { Cast.stop(); return; }
        if (!info || !info.src) { toast("This movie can't be cast"); return; }
        if (Cast.chromecastAvailable()) castNow(video.currentTime || (prog ? prog.pos : 0));
        else if (airplayAvailable && Cast.airplaySupported(video)) video.webkitShowPlaybackTargetPicker();
        else if (video.remote) video.remote.prompt().catch(() => {});
      });

      // Pick full quality or data saver. On cell data, ask first (once per visit) unless told otherwise.
      const chooseQuality = () => new Promise((resolve) => {
        if (Settings.get("saver") === "on") return resolve(true);
        if (!Settings.onCellData()) return resolve(false);
        const pref = Settings.get("cellData");
        if (pref === "saver") return resolve(true);
        if (pref === "full" || sessionAnswer !== null) return resolve(pref === "full" ? false : sessionAnswer);
        const box = el.querySelector("#data-ask");
        box.innerHTML = `<b>You're on cell data</b><span>A full-quality movie can use about 1 GB an hour. Data saver uses about a quarter of that.</span>
          <div class="btns center"><button class="f btn gold" data-q="saver">Use data saver</button><button class="f btn" data-q="full">Full quality</button><button class="f btn" data-q="always">Always use data saver</button></div>`;
        box.hidden = false;
        el.querySelector("#loading").hidden = true;
        box.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
          if (b.dataset.q === "always") Settings.set("cellData", "saver");
          sessionAnswer = b.dataset.q !== "full";
          box.hidden = true;
          resolve(sessionAnswer);
        }));
        SpatialNav.focus(box.querySelector("[data-q]"));
      });

      Catalog.info(item.id).then(async (found) => {
        info = found;
        if (!video.isConnected) return;
        if (!info.src) { fallback(wrap); return; }
        if (info.image) video.poster = info.image;
        // Already casting (for example the next movie in a row): send this one to the TV too.
        if (Cast.session()) { video.src = info.src; castNow(prog ? prog.pos : 0); return; }
        const saver = await chooseQuality();
        if (!video.isConnected) return;
        video.src = (saver && info.small) || info.src;
        if (saver && info.small) toast("Data saver is on");
        if (prog) {
          video.addEventListener("loadedmetadata", () => { video.currentTime = prog.pos; }, { once: true });
          toast(`Resuming at ${formatTime(prog.pos)}`);
        }
        setupMediaSession(video, info);
        video.play().catch(() => toast("Press OK or tap the movie to start"));
        SpatialNav.focus(video);
      }).catch(() => {
        const l = el.querySelector("#loading");
        if (l) l.innerHTML = `Couldn't load the movie. Check your internet connection. <button class="f btn small" id="retry">Try again</button>`;
        const r = el.querySelector("#retry");
        if (r) { r.addEventListener("click", () => replace(PlayerView(item, list, { resume }))); SpatialNav.focus(r); }
      });

      video.addEventListener("playing", () => { el.querySelector("#loading").hidden = true; });
      video.addEventListener("waiting", () => { const l = el.querySelector("#loading"); l.textContent = "Loading…"; l.hidden = false; });
      video.addEventListener("error", () => {
        if (!video.getAttribute("src")) return;
        // Only a file that can't be played at all is marked broken; network hiccups aren't.
        if (video.error && video.error.code === 4) Catalog.markBroken(item.id);
        History.remove(profile.id, item.id);
        toast("This movie won't play here. Trying another player.");
        fallback(wrap);
      });
      let lastTick = 0, logged = false;
      video.addEventListener("timeupdate", () => {
        if (Date.now() - saveTimer > 5000) { saveTimer = Date.now(); saveProgress(); }
        // Watch history for parents: log the movie and add up minutes actually watched.
        if (!video.paused) {
          if (!logged) { logged = true; Library.logPlay(profile.id, item); }
          const now = Date.now();
          if (lastTick && now - lastTick < 2000) Library.addWatchTime(profile.id, item.id, (now - lastTick) / 1000);
          lastTick = now;
        }
      });
      video.addEventListener("pause", saveProgress);
      video.addEventListener("playing", () => keepAwake(true));
      video.addEventListener("pause", () => keepAwake(false));
      video.addEventListener("ended", () => keepAwake(false));
      document.addEventListener("visibilitychange", onVisible);
      video.addEventListener("ended", () => {
        History.remove(profile.id, item.id);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        const next = nextItem();
        if (next) showUpNext(el, next);
      });
    },
    onAction(action) {
      if (!video || document.activeElement !== video) return false;
      if (action === "ok" || action === "a") { video.paused ? video.play() : video.pause(); return true; }
      if (action === "left") { video.currentTime = Math.max(0, video.currentTime - 10); toast("Back 10 seconds"); return true; }
      if (action === "right") { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); toast("Forward 10 seconds"); return true; }
      if (action === "y") { fullscreen(video); return true; }
      return false;
    },
    destroy() {
      clearInterval(countdown);
      clearMediaSession();
      keepAwake(false);
      document.removeEventListener("visibilitychange", onVisible);
      // A movie on the TV keeps playing after leaving this screen; stop listening to it.
      remoteOffs.forEach((off) => off());
      if (castOff) castOff();
      if (video && !casting) {
        saveProgress();
        video.pause(); video.removeAttribute("src"); video.load();
      }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
  };
}

function fullscreen(video) {
  const req = video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen;
  if (req) Promise.resolve(req.call(video)).catch(() => {});
}
