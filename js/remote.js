// Phone as a remote: the TV shows a code; a phone opens the app with that code and gets a remote control.
// Devices connect directly (WebRTC) using the free PeerJS service to find each other.

const Remote = (() => {
  const PEER_LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js",
    "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
  ];
  const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
  const PREFIX = "mvapp-remote-";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  async function loadPeer() {
    if (window.Peer) return;
    for (const src of PEER_LIBS) { try { await loadScript(src); if (window.Peer) return; } catch (_) {} }
    throw new Error("Couldn't load the remote connection library");
  }

  // ----- TV side -----
  let host = null; // { peer, code, conns }
  async function startHost({ onAction, onText, onChange }) {
    if (host) return host;
    await loadPeer();
    for (let tries = 0; tries < 4; tries++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      try {
        const peer = await new Promise((resolve, reject) => {
          const p = new Peer(PREFIX + code);
          p.on("open", () => resolve(p));
          p.on("error", (e) => reject(e));
        });
        host = { peer, code, conns: new Set() };
        peer.on("connection", (conn) => {
          conn.on("open", () => { host.conns.add(conn); onChange && onChange(host.conns.size); });
          conn.on("data", (msg) => {
            if (!msg || typeof msg !== "object") return;
            if (msg.t === "a" && typeof msg.a === "string") onAction(msg.a);
            if (msg.t === "text" && typeof msg.v === "string") onText(msg.v.slice(0, 80));
          });
          conn.on("close", () => { host.conns.delete(conn); onChange && onChange(host.conns.size); });
        });
        peer.on("disconnected", () => { try { peer.reconnect(); } catch (_) {} });
        return host;
      } catch (e) {
        if (!(e && e.type === "unavailable-id")) throw e;
      }
    }
    throw new Error("Couldn't create a remote code");
  }

  // ----- Phone side -----
  async function join(code, { onOpen, onClose }) {
    await loadPeer();
    const peer = new Peer();
    await new Promise((resolve, reject) => { peer.on("open", resolve); peer.on("error", reject); });
    const conn = peer.connect(PREFIX + code, { reliable: true });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 12000);
      conn.on("open", () => { clearTimeout(timer); resolve(); });
      conn.on("error", (e) => { clearTimeout(timer); reject(e); });
      peer.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    onOpen && onOpen();
    conn.on("close", () => onClose && onClose());
    return {
      send(action) { conn.send({ t: "a", a: action }); },
      text(value) { conn.send({ t: "text", v: value }); },
      close() { conn.close(); peer.destroy(); },
    };
  }

  // QR code as an SVG string (empty if the QR library can't load).
  async function qrSvg(text) {
    try {
      if (!window.qrcode) await loadScript(QR_LIB);
      const qr = qrcode(0, "M");
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } catch (_) { return ""; }
  }

  function linkFor(code) { return `${location.origin}${location.pathname}?remote=${code}`; }

  return { startHost, join, qrSvg, linkFor, loadPeer, get host() { return host; } };
})();
