// Sync between the family's devices: profiles, parent PIN, My List, Continue Watching, likes,
// watch history, hidden movies and the app look. Linked devices sync whenever two of them are open
// at the same time, connecting directly (WebRTC) with the free PeerJS service. Nothing is stored on a server.

const Sync = (() => {
  const PREFIX = "mvapp-dev-";
  const PAIR = "mvapp-pair-";
  const SYNCED = (k) => ["profiles", "parentPin", "look", "hidden-movies"].includes(k) || /^(watch|mylist|likes|log|safety):/.test(k);
  let applying = false;
  let peer = null;
  const conns = new Map(); // deviceId -> conn
  const listeners = new Set();
  let lastSync = 0;

  // ----- this device -----
  const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  function deviceId() {
    let id = localStorage.getItem("device-id");
    if (!id) { id = rand(16); localStorage.setItem("device-id", id); }
    return id;
  }
  function deviceName() {
    const ua = navigator.userAgent;
    if (Settings.isTV) return "TV";
    if (/iPad|Tablet/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "Tablet";
    if (/iPhone|Android.*Mobile/i.test(ua)) return "Phone";
    return "Computer";
  }
  function linked() { try { return JSON.parse(localStorage.getItem("linked-devices")) || []; } catch (_) { return []; } }
  function saveLinked(list) { rawSet("linked-devices", JSON.stringify(list)); }

  // ----- remember when each synced value last changed -----
  const metaKey = "sync-meta";
  function meta() { try { return JSON.parse(localStorage.getItem(metaKey)) || {}; } catch (_) { return {}; } }
  const rawSet = Storage.prototype.setItem.bind(localStorage);
  const rawRemove = Storage.prototype.removeItem.bind(localStorage);
  function touch(key, at = Date.now()) { const m = meta(); m[key] = at; rawSet(metaKey, JSON.stringify(m)); return at; }

  // Watch every save the app makes; synced keys are stamped and sent to linked devices.
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (key, value) {
    origSet.call(this, key, value);
    if (this === localStorage && SYNCED(key) && !applying) broadcast({ t: "set", key, v: String(value), at: touch(key) });
  };
  Storage.prototype.removeItem = function (key) {
    origRemove.call(this, key);
    if (this === localStorage && SYNCED(key) && !applying) broadcast({ t: "set", key, v: null, at: touch(key) });
  };

  function snapshot() {
    const m = meta(), items = {};
    Object.keys(localStorage).filter(SYNCED).forEach((k) => { items[k] = { v: localStorage.getItem(k), at: m[k] || 0 }; });
    Object.keys(m).filter((k) => SYNCED(k) && !(k in items)).forEach((k) => { items[k] = { v: null, at: m[k] }; });
    return items;
  }

  // Newer change wins. Watch history is combined from both devices instead.
  function applyRemote(key, value, at) {
    if (!SYNCED(key)) return false;
    const m = meta();
    if (key.startsWith("log:") && value) {
      let mine = [], theirs = [];
      try { mine = JSON.parse(localStorage.getItem(key)) || []; theirs = JSON.parse(value) || []; } catch (_) {}
      const merged = [...mine, ...theirs].filter((x, i, all) => all.findIndex((y) => y.id === x.id && Math.abs(y.at - x.at) < 60000) === i)
        .sort((a, b) => b.at - a.at).slice(0, 300);
      applying = true; rawSet(key, JSON.stringify(merged)); applying = false;
      touch(key, Math.max(at, m[key] || 0));
      return true;
    }
    if ((m[key] || 0) >= at) return false;
    applying = true;
    if (value == null) rawRemove(key); else rawSet(key, value);
    applying = false;
    touch(key, at);
    return true;
  }

  function receive(msg) {
    if (!msg || typeof msg !== "object") return;
    let changed = false;
    if (msg.t === "state" && msg.items && typeof msg.items === "object") {
      for (const [k, x] of Object.entries(msg.items)) if (x && typeof x.at === "number") changed = applyRemote(k, x.v, x.at) || changed;
    }
    if (msg.t === "set" && typeof msg.key === "string" && typeof msg.at === "number") changed = applyRemote(msg.key, msg.v, msg.at);
    lastSync = Date.now();
    if (changed) notify("changed");
    else notify("status");
  }

  function broadcast(msg) { conns.forEach((c) => { try { c.send(msg); } catch (_) {} }); }
  function notify(kind) { listeners.forEach((fn) => { try { fn(kind); } catch (_) {} }); }

  function attach(conn, otherId, otherName) {
    conns.set(otherId, conn);
    const list = linked();
    const i = list.findIndex((d) => d.id === otherId);
    const entry = { id: otherId, name: otherName || (list[i] && list[i].name) || "Device", seen: Date.now() };
    if (i >= 0) list[i] = entry; else list.push(entry);
    saveLinked(list);
    conn.on("data", receive);
    conn.on("close", () => { conns.delete(otherId); notify("status"); });
    conn.send({ t: "state", items: snapshot() });
    notify("status");
  }

  // ----- connecting -----
  async function start() {
    if (peer || !linked().length) return;
    await Remote.loadPeer();
    peer = await new Promise((resolve, reject) => {
      const p = new Peer(PREFIX + deviceId());
      p.on("open", () => resolve(p));
      p.on("error", reject);
    }).catch(() => null);
    if (!peer) return;
    peer.on("connection", (conn) => {
      const otherId = (conn.peer || "").replace(PREFIX, "");
      // Only devices this one was linked with may sync.
      if (!linked().some((d) => d.id === otherId)) { conn.close(); return; }
      conn.on("open", () => attach(conn, otherId, (conn.metadata || {}).name));
    });
    peer.on("disconnected", () => { try { peer.reconnect(); } catch (_) {} });
    connectAll();
    setInterval(() => connectAll(0), 60000);
  }

  function connectAll(retries = 3) {
    if (!peer) return;
    linked().forEach((d) => {
      if (conns.has(d.id)) return;
      const conn = peer.connect(PREFIX + d.id, { reliable: true, metadata: { name: deviceName() } });
      conn.on("open", () => attach(conn, d.id, d.name));
      // The other device may still be starting up: try again a few times, a few seconds apart.
      conn.on("error", () => { if (retries > 0) setTimeout(() => connectAll(retries - 1), 3000); });
    });
  }

  // Pairing: one device shows a 6-digit code, the other types it in.
  async function showCode(onLinked) {
    await Remote.loadPeer();
    for (let tries = 0; tries < 4; tries++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      try {
        const p = await new Promise((resolve, reject) => { const x = new Peer(PAIR + code); x.on("open", () => resolve(x)); x.on("error", reject); });
        p.on("connection", (conn) => {
          conn.on("data", async (msg) => {
            if (!msg || msg.t !== "pair" || typeof msg.id !== "string") return;
            // Save the link before answering, so the other device's first sync isn't turned away.
            const list = linked().filter((d) => d.id !== msg.id);
            list.push({ id: msg.id, name: String(msg.name || "Device").slice(0, 20), seen: Date.now() });
            saveLinked(list);
            conn.send({ t: "pair-ok", id: deviceId(), name: deviceName() });
            setTimeout(() => p.destroy(), 1500);
            if (peer) connectAll(); else await start();
            onLinked && onLinked(msg.name);
          });
        });
        return { code, cancel: () => p.destroy() };
      } catch (e) { if (!(e && e.type === "unavailable-id")) throw e; }
    }
    throw new Error("no code");
  }

  async function enterCode(code) {
    await Remote.loadPeer();
    const p = await new Promise((resolve, reject) => { const x = new Peer(); x.on("open", () => resolve(x)); x.on("error", reject); });
    const conn = p.connect(PAIR + code, { reliable: true });
    const other = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 12000);
      conn.on("open", () => conn.send({ t: "pair", id: deviceId(), name: deviceName() }));
      conn.on("data", (msg) => { if (msg && msg.t === "pair-ok") { clearTimeout(timer); resolve(msg); } });
      conn.on("error", (e) => { clearTimeout(timer); reject(e); });
      p.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    const list = linked().filter((d) => d.id !== other.id);
    list.push({ id: other.id, name: String(other.name || "Device").slice(0, 20), seen: Date.now() });
    saveLinked(list);
    p.destroy();
    if (peer) connectAll(); else await start();
    return other.name;
  }

  function unlinkAll() { saveLinked([]); conns.forEach((c) => c.close()); conns.clear(); if (peer) { peer.destroy(); peer = null; } notify("status"); }

  return {
    start, showCode, enterCode, unlinkAll, deviceName,
    linked, connectedCount: () => conns.size, lastSync: () => lastSync,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
