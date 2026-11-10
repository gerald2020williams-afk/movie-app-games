// Cast to TV: Chromecast (Chrome on Android, Windows, Mac, ChromeOS) and AirPlay (iPhone, iPad, Mac Safari).

const Cast = (() => {
  const SDK = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
  let ready = false, requested = false;
  const changeListeners = new Set();

  const isChrome = /Chrome|CriOS/.test(navigator.userAgent) && !/Edg\/|OPR\//.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function notify() { changeListeners.forEach((fn) => { try { fn(); } catch (_) {} }); }

  // Load Google's Cast library only in browsers that can use it.
  function load() {
    if (requested || !isChrome || isIOS) return;
    requested = true;
    window.__onGCastApiAvailable = (ok) => {
      if (!ok || !window.cast || !cast.framework) return;
      const ctx = cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      ctx.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, notify);
      ready = true;
      notify();
    };
    const s = document.createElement("script");
    s.src = SDK;
    s.async = true;
    s.onerror = () => {};
    document.head.appendChild(s);
  }

  function context() { return ready ? cast.framework.CastContext.getInstance() : null; }

  return {
    load,
    onChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); },
    // Is there a Chromecast on the network?
    chromecastAvailable() {
      const ctx = context();
      return !!ctx && ctx.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
    },
    session() { const ctx = context(); return ctx ? ctx.getCurrentSession() : null; },
    deviceName() { const s = this.session(); return s ? s.getCastDevice().friendlyName : "your TV"; },
    async connect() {
      const ctx = context();
      if (!ctx) throw new Error("cast not ready");
      if (!ctx.getCurrentSession()) await ctx.requestSession();
      return ctx.getCurrentSession();
    },
    // Send a movie to the Chromecast, starting at `startAt` seconds.
    async play({ src, title, image, startAt = 0 }) {
      const session = await this.connect();
      const info = new chrome.cast.media.MediaInfo(src, /\.webm$/i.test(src) ? "video/webm" : "video/mp4");
      info.metadata = new chrome.cast.media.MovieMediaMetadata();
      info.metadata.title = title;
      if (image) info.metadata.images = [new chrome.cast.Image(image)];
      const req = new chrome.cast.media.LoadRequest(info);
      req.currentTime = startAt;
      req.autoplay = true;
      await session.loadMedia(req);
    },
    stop() { const ctx = context(); if (ctx) ctx.endCurrentSession(true); },
    // Live controls and status for the movie playing on the TV.
    remote() {
      if (!ready) return null;
      const player = new cast.framework.RemotePlayer();
      const controller = new cast.framework.RemotePlayerController(player);
      const E = cast.framework.RemotePlayerEventType;
      return {
        player,
        on(type, fn) { controller.addEventListener(E[type], fn); return () => controller.removeEventListener(E[type], fn); },
        playPause() { controller.playOrPause(); },
        seekBy(sec) { player.currentTime = Math.max(0, Math.min(player.duration || 0, player.currentTime + sec)); controller.seek(); },
      };
    },
    // AirPlay (Safari): the system picker sends the video to an Apple TV or AirPlay TV.
    airplaySupported(video) { return typeof video.webkitShowPlaybackTargetPicker === "function"; },
    watchAirplay(video, fn) {
      if (!window.WebKitPlaybackTargetAvailabilityEvent) return;
      video.addEventListener("webkitplaybacktargetavailabilitychanged", (e) => fn(e.availability === "available"));
    },
    // Other browsers with the Remote Playback API (for example Chrome on Android without Google's library).
    watchRemotePlayback(video, fn) {
      if (!video.remote || !video.remote.watchAvailability) return;
      video.remote.watchAvailability((available) => fn(available)).catch(() => {});
    },
  };
})();
