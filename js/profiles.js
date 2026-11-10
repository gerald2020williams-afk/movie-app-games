// Family profiles and the parent PIN, saved on this device.

const Profiles = (() => {
  const KEY = "profiles";
  const CURRENT = "profile";
  const PIN = "parentPin";

  function read(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function write(key, value) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (_) {} }

  function all() {
    try {
      const saved = JSON.parse(read(KEY));
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (_) {}
    return DEFAULT_PROFILES.map((p) => ({ ...p }));
  }
  function saveAll(list) { write(KEY, JSON.stringify(list)); }

  function get(id) { return all().find((p) => p.id === id) || null; }

  function save(profile) {
    const list = all();
    const i = list.findIndex((p) => p.id === profile.id);
    if (i >= 0) list[i] = profile; else list.push(profile);
    saveAll(list);
  }

  function remove(id) {
    saveAll(all().filter((p) => p.id !== id));
    if (read(CURRENT) === id) write(CURRENT, null);
  }

  function newId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Extra details used by the screens.
  function describe(p) {
    const group = AGE_GROUPS[p.level] || AGE_GROUPS[0];
    return { ...p, group: group.name, ages: group.ages, letter: (p.name.trim()[0] || "?").toUpperCase() };
  }

  // ----- current profile -----
  function current() { const p = get(read(CURRENT)); return p ? describe(p) : null; }
  function setCurrent(id) { write(CURRENT, id); }

  // ----- parent PIN (stored as a hash, never as the digits) -----
  async function hash(pin) {
    const text = "movies-and-games:" + pin;
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    let h = 0;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
    return "s" + h;
  }
  return {
    all: () => all().map(describe),
    get: (id) => { const p = get(id); return p ? describe(p) : null; },
    save, remove, newId, current, setCurrent,
    hasPin: () => !!read(PIN),
    async setPin(pin) { write(PIN, await hash(pin)); },
    async checkPin(pin) { return read(PIN) === (await hash(pin)); },
    clearPin() { write(PIN, null); },
    avatar(p, cls = "pic") {
      const style = p.photo ? `background-image:url('${p.photo}');background-size:cover;background-position:center` : `background:${p.color}`;
      return `<span class="${cls}" style="${style}">${p.photo ? "" : escapeHtml(p.letter)}</span>`;
    },
  };
})();

// Shrink a chosen photo so it fits in the device's storage.
function photoToDataUrl(file, size = 240) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}
