// Core: shared state, navigation between screens, and the movie rows used by many screens.

const view = document.getElementById("view");
const stack = []; // [{ v: view object, focus: index of focused item }]
let current = null;
let profile = Profiles.current();
// A locked profile (Teens/Adults) always asks for the parent PIN again when the app opens.
if (profile && profile.locked && Profiles.hasPin()) profile = null;

// ----- helpers -----
function setProfile(p) {
  profile = p;
  Profiles.setCurrent(p ? p.id : null);
  updateWho();
}
function updateWho() {
  document.getElementById("who-name").textContent = profile ? profile.name : "Pick a profile";
  const av = document.getElementById("who-avatar");
  av.outerHTML = profile ? Profiles.avatar(profile, "avatar").replace('class="avatar"', 'class="avatar" id="who-avatar"') : `<span class="avatar" id="who-avatar">?</span>`;
}
let toastTimer = 0;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1400);
}
// Remember what was focused so Back returns to the same spot.
function focusKey() {
  const el = document.activeElement;
  if (!el || !view.contains(el)) return null;
  if (el.id) return "#" + CSS.escape(el.id);
  if (el.dataset.game) return `[data-game="${CSS.escape(el.dataset.game)}"]`;
  if (el.dataset.id) return `.card[data-id="${CSS.escape(el.dataset.id)}"]`;
  return null;
}

// ----- navigation -----
function mount(v, focusSel = null) {
  if (current && current.destroy) current.destroy();
  current = v;
  document.getElementById("toast").classList.remove("show");
  document.querySelectorAll(".tab").forEach((t) => { const on = t.dataset.go === v.tab; t.classList.toggle("on", on); if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
  // Stop watching posters from the screen we're leaving (prevents a slow memory build-up).
  if (upgrader) upgrader.disconnect();
  // Each screen gets its own fresh box. Late answers for a screen that's gone (pictures,
  // movie details) then land in a detached box harmlessly instead of breaking the new screen.
  view.innerHTML = "";
  view.scrollTop = 0;
  const root = document.createElement("div");
  root.className = "view-root";
  view.appendChild(root);
  v.render(root);
  if (focusSel) {
    // Movie rows fill in a moment later, so try again shortly after.
    const restore = () => { const el = view.querySelector(focusSel); if (el && current === v) SpatialNav.focus(el); return !!el; };
    if (!restore()) setTimeout(restore, 60);
  }
}
function go(v) {
  if (current) stack.push({ v: current, focus: focusKey() });
  mount(v);
}
function replace(v) { mount(v); }
function back() {
  const prev = stack.pop();
  if (prev) mount(prev.v, prev.focus);
  else if (current && current.tab !== "home") openTab("home");
}
function openTab(name) {
  if (!profile && name !== "profiles") name = "profiles";
  stack.length = 0;
  const views = { home: HomeView, movies: MoviesView, search: SearchView, profiles: ProfilesView };
  mount(views[name]());
}

// ----- shared bits -----
function shelvesFor(level) {
  // New movies (and the holiday row during holidays) first, then rows this profile likes,
  // then rows made for this age group, then the rest.
  const scores = profile ? Library.shelfScores(profile.id) : {};
  const holiday = Theme.featuredShelf();
  const top = (s) => (s.featured || s.id === holiday ? 0 : s.collection ? 1 : 2);
  const own = (s) => (s.level === level ? 0 : 1);
  return SHELVES.filter((s) => s.level <= level).map((s, i) => ({ s, i }))
    .sort((a, b) => top(a.s) - top(b.s) || (scores[b.s.id] || 0) - (scores[a.s.id] || 0) || own(a.s) - own(b.s) || a.i - b.i)
    .map((x) => x.s);
}

function cardHtml(item, progress, rank) {
  const pct = progress ? Math.min(100, Math.round((progress.pos / progress.dur) * 100)) : 0;
  const label = [rank ? `Number ${rank}` : "", item.title, item.year, progress ? `${formatTime(progress.dur - progress.pos)} left` : ""].filter(Boolean).join(", ");
  return `<button class="f card${rank ? " ranked" : ""}" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(label)}">${rank ? `<span class="rank" aria-hidden="true">${rank}</span>` : ""}
    <span class="thumb" style="background-image:url('${Catalog.image(item.id)}')">${pct ? `<span class="progress"><i style="width:${pct}%"></i></span>` : ""}</span>
    <span class="t">${escapeHtml(item.title)}</span>
    <span class="y">${progress ? `${formatTime(progress.dur - progress.pos)} left` : escapeHtml(item.year || "")}</span>
  </button>`;
}

function skeletonRow() {
  return Array.from({ length: 6 }, () => `<div class="card skeleton"><span class="thumb"></span></div>`).join("");
}

// As cards scroll into view: swap in a sharper picture, and hide movies that can't play.
const upgrader = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    upgrader.unobserve(e.target);
    const card = e.target;
    Catalog.info(card.dataset.id, { wanted: () => card.isConnected }).then((info) => {
      if (!card.isConnected) return;
      if (info.broken) return hideCard(card);
      if (info.image) sharpen(card.querySelector(".thumb"), info.image);
    }).catch(() => {});
  }
}, { rootMargin: "200px 400px" }) : null;

function sharpen(el, src) {
  const img = new Image();
  img.onload = () => { el.style.backgroundImage = `url('${src}')`; el.classList.add("sharp"); };
  img.src = src;
}

function hideCard(card) {
  const row = card.parentElement;
  const wasFocused = document.activeElement === card;
  if (wasFocused) SpatialNav.move("right") || SpatialNav.move("left");
  card.remove();
  if (row && !row.querySelector(".card")) { const s = row.closest(".shelf"); if (s) s.remove(); }
}

function watchCards(container) {
  if (!upgrader) return;
  container.querySelectorAll(".card[data-id]").forEach((c) => upgrader.observe(c));
}

// Wire a list of movie cards: choosing one opens its page (or resumes, for Continue Watching).
function wireCards(container, items, { resume = false } = {}) {
  container.querySelectorAll(".card[data-id]").forEach((btn) => btn.addEventListener("click", () => {
    const item = items.find((x) => x.id === btn.dataset.id);
    if (!item) return;
    const list = items.filter((x) => !Catalog.isBroken(x.id));
    if (resume) go(PlayerView(item, list, { resume: true }));
    else go(DetailView(item, list));
  }));
  watchCards(container);
}

// What this profile may see: no broken, hidden (by a parent), thumbs-down,
// or (with the safety filter on) stereotype/propaganda movies.
function allowed(items) {
  const disliked = Library.disliked(profile.id);
  const hidden = new Set(Library.hidden().map((x) => x.id));
  const safe = Safety.filterOn(profile);
  return items.filter((it) => !Catalog.isBroken(it.id) && !hidden.has(it.id) && !disliked.has(it.id) && !(safe && Safety.isUnsafe(it)));
}

// Renders a shelf row and wires its cards. Returns a promise of the items.
function fillShelf(section, shelf) {
  const row = section.querySelector(".row");
  row.innerHTML = skeletonRow();
  return Catalog.shelf(shelf).then((items) => {
    if (!section.isConnected) return items;
    items.forEach((it) => { if (!it.shelf) it.shelf = shelf.id; });
    items = allowed(items);
    if (!items.length) { section.remove(); return items; }
    row.innerHTML = items.map((it) => cardHtml(it)).join("");
    wireCards(row, items);
    return items;
  }).catch(() => {
    if (section.isConnected) row.innerHTML = `<div class="empty">Couldn't reach the movie library. <button class="f btn small" data-retry>Try again</button></div>`;
    const retry = row.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", () => fillShelf(section, shelf));
    return [];
  });
}

function shelfSection(shelf) {
  return `<section class="shelf" data-shelf="${shelf.id}"><h2>${shelf.title}</h2><div class="row"></div></section>`;
}

function continueSection() {
  const items = allowed(History.list(profile.id));
  if (!items.length) return "";
  return `<section class="shelf" id="continue"><h2>Continue Watching</h2><div class="row">${items.map((x) => cardHtml(x, x)).join("")}</div></section>`;
}

function myListSection() {
  const items = allowed(Library.myList(profile.id));
  if (!items.length) return "";
  return `<section class="shelf" id="mylist"><h2>My List</h2><div class="row">${items.map((x) => cardHtml(x)).join("")}</div></section>`;
}

function fillTop10(section) {
  const row = section.querySelector(".row");
  row.innerHTML = skeletonRow();
  return Catalog.top(profile.level).then((items) => {
    if (!section.isConnected) return;
    items = allowed(items);
    if (items.length < 3) { section.remove(); return; }
    row.innerHTML = items.map((it, i) => cardHtml(it, null, i + 1)).join("");
    wireCards(row, items);
  }).catch(() => section.remove());
}

// ----- install as an app -----
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; document.querySelectorAll("[data-install]").forEach((b) => (b.hidden = false)); });
window.addEventListener("appinstalled", () => { installPrompt = null; toast("Installed. Open it from your home screen or apps."); });
const isInstalled = () => matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || navigator.standalone === true;
const isAppleTouch = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function installButton() {
  if (isInstalled()) return "";
  return `<button class="f btn" data-install ${installPrompt || isAppleTouch() ? "" : "hidden"}>Install app</button>`;
}
function wireInstall(el) {
  el.querySelectorAll("[data-install]").forEach((b) => b.addEventListener("click", async () => {
    if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; b.hidden = true; return; }
    if (isAppleTouch()) toast("Tap the Share button, then “Add to Home Screen”");
  }));
}
