// Offline support: keep a copy of the app's own files so it opens even with a weak connection.
// Movies, pictures and movie lists come from the Internet Archive and are not stored here.
const CACHE = "movies-app-v4";
const FILES = [
  "./", "index.html", "styles.css", "manifest.webmanifest", "icon.svg",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png",
  "js/data.js", "js/input.js", "js/catalog.js", "js/profiles.js", "js/history.js",
  "js/settings.js", "js/cast.js", "js/library.js", "js/theme.js", "js/remote.js", "js/sync.js",
  "js/app/core.js", "js/app/family.js", "js/app/remote-screens.js", "js/app/browse.js", "js/app/player.js", "js/app/start.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Always try the network first so updates show up right away; use the saved copy when offline.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});
