// App shell: profiles, navigation between screens, and the movie screens.

const App = (() => {
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
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.go === v.tab));
    view.innerHTML = "";
    view.scrollTop = 0;
    v.render(view);
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
    // New movies first, then rows made for this age group, then the rest.
    const rank = (s) => (s.featured ? 0 : s.level === level ? 1 : 2);
    return SHELVES.filter((s) => s.level <= level).sort((a, b) => rank(a) - rank(b));
  }

  function cardHtml(item, progress) {
    const pct = progress ? Math.min(100, Math.round((progress.pos / progress.dur) * 100)) : 0;
    return `<button class="f card" data-id="${escapeHtml(item.id)}">
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
      Catalog.info(card.dataset.id).then((info) => {
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

  // Renders a shelf row and wires its cards. Returns a promise of the items.
  function fillShelf(section, shelf) {
    const row = section.querySelector(".row");
    row.innerHTML = skeletonRow();
    return Catalog.shelf(shelf).then((items) => {
      if (!section.isConnected) return items;
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
    const items = History.list(profile.id).filter((x) => !Catalog.isBroken(x.id));
    if (!items.length) return "";
    return `<section class="shelf" id="continue"><h2>Continue Watching</h2><div class="row">${items.map((x) => cardHtml(x, x)).join("")}</div></section>`;
  }

  // ----- screens -----
  function ProfilesView() {
    return {
      tab: "profiles",
      render(el) {
        const list = Profiles.all();
        el.innerHTML = `<section class="profiles">
          <h1>Who's watching?</h1>
          <div class="profile-list">
            ${list.map((p) => `<button class="f profile${profile && profile.id === p.id ? " current" : ""}" data-id="${p.id}">
              ${Profiles.avatar(p)}<b>${escapeHtml(p.name)}</b><small>${p.group}${p.locked && Profiles.hasPin() ? " · Locked" : ""}</small></button>`).join("")}
            ${list.length < MAX_PROFILES ? `<button class="f profile add" id="add-profile"><span class="pic">+</span><b>Add profile</b><small>&nbsp;</small></button>` : ""}
          </div>
          <div class="btns center"><button class="f btn" id="manage">Manage profiles &amp; parent PIN</button></div>
        </section>`;
        el.querySelectorAll(".profile[data-id]").forEach((b) => b.addEventListener("click", () => {
          const p = Profiles.get(b.dataset.id);
          const enter = () => { setProfile(p); openTab("home"); };
          if (!p.locked) return enter();
          if (Profiles.hasPin()) return go(PinView({ mode: "check", title: `Enter the parent PIN for ${p.name}`, onDone: enter }));
          // First locked profile ever chosen: the parent sets up a PIN.
          go(PinView({ mode: "create", title: "Set up a parent PIN", note: `${p.name} is locked so younger kids can't open it. Choose 4 numbers only parents know.`, onDone: enter }));
        }));
        const add = el.querySelector("#add-profile");
        if (add) add.addEventListener("click", () => withParent(() => EditProfileView(null)));
        el.querySelector("#manage").addEventListener("click", () => withParent(() => ParentView()));
        SpatialNav.focus(el.querySelector(".profile.current") || el.querySelector(".profile"));
      },
    };
  }

  // Runs `fn` after the parent PIN is entered (or right away if no PIN is set yet).
  // Opens a parent-only screen, asking for the parent PIN first when one is set.
  function withParent(makeView) {
    if (!Profiles.hasPin()) return go(makeView());
    go(PinView({ mode: "check", title: "Enter the parent PIN", onDone: () => mount(makeView()) }));
  }

  // Number pad that works with a controller, remote, keyboard or touch.
  function PinView({ mode, title, note = "", onDone }) {
    let digits = "", first = null, stage = mode; // stage: "check" | "create" | "confirm"
    let el;
    const prompts = { check: title, create: title, confirm: "Enter the same PIN again" };
    function draw() {
      el.querySelector("#pin-title").textContent = prompts[stage];
      el.querySelector("#pin-dots").innerHTML = [0, 1, 2, 3].map((i) => `<i class="${i < digits.length ? "on" : ""}"></i>`).join("");
    }
    async function complete() {
      if (stage === "check") {
        if (await Profiles.checkPin(digits)) { onDone(); return; }
        digits = ""; draw(); toast("Wrong PIN. Try again.");
      } else if (stage === "create") {
        first = digits; digits = ""; stage = "confirm"; draw();
      } else {
        if (digits === first) { await Profiles.setPin(digits); toast("Parent PIN saved"); stack.pop(); onDone(); return; }
        digits = ""; first = null; stage = "create"; draw(); toast("Those didn't match. Start again.");
      }
    }
    function press(k) {
      if (k === "del") digits = digits.slice(0, -1);
      else if (k === "clear") digits = "";
      else if (digits.length < 4) digits += k;
      draw();
      if (digits.length === 4) setTimeout(complete, 150);
    }
    return {
      tab: "profiles",
      render(root) {
        el = root;
        const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"];
        root.innerHTML = `<section class="pin">
          <h1 id="pin-title"></h1>
          ${note ? `<p class="sub">${escapeHtml(note)}</p>` : ""}
          <div class="pin-dots" id="pin-dots"></div>
          <div class="pad-grid">${keys.map((k) => `<button class="f key-btn" data-k="${k}">${k === "del" ? "⌫" : k === "clear" ? "Clear" : k}</button>`).join("")}</div>
          ${mode === "check" ? `<p class="sub small">Forgot the PIN? Clear this site's data in the browser settings to reset it.</p>` : ""}
        </section>`;
        root.querySelectorAll(".key-btn").forEach((b) => b.addEventListener("click", () => press(b.dataset.k)));
        draw();
        SpatialNav.focus(root.querySelector('[data-k="5"]'));
      },
      onAction(action, ev) {
        // Number keys on a keyboard type digits (they don't mean A/B/X/Y here).
        if (ev && /^[0-9]$/.test(ev.key)) { press(ev.key); return true; }
        if (ev && ev.key === "Backspace") { press("del"); return true; }
        return false;
      },
    };
  }

  function ParentView() {
    return {
      tab: "profiles",
      render(el) {
        const list = Profiles.all();
        el.innerHTML = `<section class="page narrow">
          <h1>Manage profiles</h1>
          <p class="sub">Pick a profile to change its name, picture or age group.</p>
          <div class="manage-list">
            ${list.map((p) => `<button class="f manage-row" data-id="${p.id}">${Profiles.avatar(p)}<span><b>${escapeHtml(p.name)}</b><small>${p.group}${p.locked ? " · Needs parent PIN" : ""}</small></span><span class="go">Edit</span></button>`).join("")}
          </div>
          <div class="btns">
            ${list.length < MAX_PROFILES ? `<button class="f btn gold" id="add">+ Add profile</button>` : ""}
            <button class="f btn" id="pin">${Profiles.hasPin() ? "Change parent PIN" : "Set up parent PIN"}</button>
            ${Profiles.hasPin() ? `<button class="f btn" id="nopin">Turn off parent PIN</button>` : ""}
            <button class="f btn" id="done">Done</button>
          </div>
        </section>`;
        el.querySelectorAll(".manage-row").forEach((b) => b.addEventListener("click", () => go(EditProfileView(Profiles.get(b.dataset.id)))));
        const add = el.querySelector("#add");
        if (add) add.addEventListener("click", () => go(EditProfileView(null)));
        el.querySelector("#pin").addEventListener("click", () => go(PinView({ mode: "create", title: "Choose a new parent PIN", onDone: () => mount(ParentView()) })));
        const nopin = el.querySelector("#nopin");
        if (nopin) nopin.addEventListener("click", () => { Profiles.clearPin(); toast("Parent PIN turned off"); mount(ParentView()); });
        el.querySelector("#done").addEventListener("click", () => openTab("profiles"));
        SpatialNav.focus(el.querySelector(".manage-row"));
      },
    };
  }

  function EditProfileView(existing) {
    const p = existing ? { ...existing } : { id: Profiles.newId(), name: "", level: 1, color: PROFILE_COLORS[Profiles.all().length % PROFILE_COLORS.length], locked: false };
    return {
      tab: "profiles",
      render(el) {
        el.innerHTML = `<section class="page narrow">
          <h1>${existing ? "Edit profile" : "Add profile"}</h1>
          <div class="edit-grid">
            <div class="edit-pic">
              <div id="preview"></div>
              <label class="f btn" tabindex="0" id="photo-btn">Choose photo<input type="file" id="photo" accept="image/*" hidden></label>
              <button class="f btn" id="photo-remove" ${p.photo ? "" : "hidden"}>Remove photo</button>
            </div>
            <div class="edit-fields">
              <label class="field"><span>Name</span><input class="f" id="name" maxlength="20" value="${escapeHtml(p.name)}" placeholder="Name" autocomplete="off"></label>
              <div class="field"><span>Age group</span><div class="chips">${AGE_GROUPS.map((g) => `<button class="f chip-btn${g.level === p.level ? " on" : ""}" data-level="${g.level}">${g.name}</button>`).join("")}</div></div>
              <div class="field"><span>Color</span><div class="chips">${PROFILE_COLORS.map((c) => `<button class="f swatch${c === p.color ? " on" : ""}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join("")}</div></div>
              <div class="field"><span>Parent PIN</span><button class="f chip-btn toggle${p.locked ? " on" : ""}" id="locked">${p.locked ? "Needs parent PIN to open" : "Opens without a PIN"}</button></div>
              <div class="btns">
                <button class="f btn gold" id="save">Save</button>
                <button class="f btn" id="cancel">Cancel</button>
                ${existing && Profiles.all().length > 1 ? `<button class="f btn danger" id="delete">Delete profile</button>` : ""}
              </div>
            </div>
          </div>
        </section>`;
        const preview = () => {
          const d = Profiles.get(p.id) ? { ...Profiles.get(p.id), ...p } : { ...p, letter: (p.name.trim()[0] || "?").toUpperCase() };
          d.letter = (p.name.trim()[0] || "?").toUpperCase();
          el.querySelector("#preview").innerHTML = Profiles.avatar(d, "pic big");
          el.querySelector("#photo-remove").hidden = !p.photo;
        };
        preview();
        const name = el.querySelector("#name");
        name.addEventListener("input", () => { p.name = name.value; preview(); });
        el.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => {
          p.level = +b.dataset.level;
          if (p.level >= 2 && !existing) { p.locked = true; }
          el.querySelectorAll("[data-level]").forEach((x) => x.classList.toggle("on", x === b));
          syncLock();
        }));
        el.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => {
          p.color = b.dataset.color;
          el.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("on", x === b));
          preview();
        }));
        const lockBtn = el.querySelector("#locked");
        function syncLock() {
          lockBtn.classList.toggle("on", !!p.locked);
          lockBtn.textContent = p.locked ? "Needs parent PIN to open" : "Opens without a PIN";
        }
        lockBtn.addEventListener("click", () => { p.locked = !p.locked; syncLock(); });
        const file = el.querySelector("#photo");
        file.addEventListener("change", async () => {
          if (!file.files[0]) return;
          try { p.photo = await photoToDataUrl(file.files[0]); preview(); } catch (_) { toast("That file isn't a picture"); }
        });
        el.querySelector("#photo-remove").addEventListener("click", () => { delete p.photo; preview(); });
        el.querySelector("#save").addEventListener("click", () => {
          p.name = name.value.trim();
          if (!p.name) { toast("Type a name first"); SpatialNav.focus(name); return; }
          try { Profiles.save(p); } catch (_) { toast("Couldn't save. Try a smaller photo."); return; }
          if (profile && profile.id === p.id) setProfile(Profiles.get(p.id));
          toast("Saved");
          back();
        });
        el.querySelector("#cancel").addEventListener("click", back);
        const del = el.querySelector("#delete");
        if (del) {
          let armed = false;
          del.addEventListener("click", () => {
            if (!armed) { armed = true; del.textContent = "Press again to delete"; return; }
            Profiles.remove(p.id);
            if (profile && profile.id === p.id) setProfile(null);
            toast("Profile deleted");
            back();
          });
        }
        SpatialNav.focus(existing ? el.querySelector("#save") : name);
      },
    };
  }

  function HomeView() {
    let rotate = 0, previewTimer = 0, stopPreview = () => {};
    return {
      tab: "home",
      render(el) {
        const shelves = shelvesFor(profile.level);
        el.innerHTML = `<section class="home">
          <div class="watch">
            <div class="hero" id="hero">
              <div class="hero-bg" id="hero-bg"></div><video class="hero-video" id="hero-video" muted playsinline loop preload="none" aria-hidden="true"></video><div class="hero-shade"></div><div class="hero-art" id="hero-art"></div>
              <div class="hero-copy">
                <span class="tag">Picks for ${escapeHtml(profile.name)}</span>
                <h1 id="hero-title">Loading movies…</h1>
                <span class="meta" id="hero-meta"></span>
                <p id="hero-desc"></p>
                <div class="btns"><button class="f btn gold" id="hero-play">▶ Play</button><button class="f btn" id="hero-info">More info</button></div>
              </div>
              <div class="dots" id="hero-dots"></div>
            </div>
            ${continueSection()}
            ${shelves.map(shelfSection).join("")}
          </div>
        </section>`;
        const cont = el.querySelector("#continue");
        if (cont) wireCards(cont, History.list(profile.id), { resume: true });
        SpatialNav.focus(el.querySelector("#hero-play"));

        let heroItems = [], heroShelf = shelves[0], heroAt = 0;
        const showHero = () => {
          const it = heroItems[heroAt];
          if (!it) return;
          const img = Catalog.image(it.id);
          el.querySelector("#hero-bg").style.backgroundImage = `url('${img}')`;
          el.querySelector("#hero-art").style.backgroundImage = `url('${img}')`;
          Catalog.info(it.id).then((info) => {
            if (!info.image || heroItems[heroAt] !== it) return;
            sharpen(el.querySelector("#hero-art"), info.image);
            sharpen(el.querySelector("#hero-bg"), info.image);
          }).catch(() => {});
          const prog = History.get(profile.id, it.id);
          el.querySelector("#hero-play").textContent = prog ? `▶ Resume ${formatTime(prog.pos)}` : "▶ Play";
          el.querySelector("#hero-title").textContent = it.title;
          el.querySelector("#hero-meta").textContent = [heroShelf.title, it.year, it.runtime].filter(Boolean).join(" · ");
          el.querySelector("#hero-desc").textContent = it.description || "A free movie from the Internet Archive.";
          el.querySelector("#hero-dots").innerHTML = heroItems.map((_, i) => `<i class="${i === heroAt ? "on" : ""}"></i>`).join("");
          startPreview(it);
        };

        // A short silent preview plays behind the featured movie after a moment (big screens only).
        const heroVideo = el.querySelector("#hero-video");
        const previewsOn = () => matchMedia("(min-width: 761px)").matches
          && !matchMedia("(prefers-reduced-motion: reduce)").matches
          && !(navigator.connection && navigator.connection.saveData);
        const startPreview = (it) => {
          clearTimeout(previewTimer);
          heroVideo.classList.remove("playing");
          heroVideo.pause();
          if (!previewsOn()) return;
          previewTimer = setTimeout(() => {
            Catalog.videoFile(it.id).then((src) => {
              if (!heroVideo.isConnected || heroItems[heroAt] !== it) return;
              heroVideo.src = src + "#t=45";
              heroVideo.onplaying = () => heroVideo.classList.add("playing");
              heroVideo.play().catch(() => {});
            }).catch(() => {});
          }, 2500);
        };
        stopPreview = () => { clearTimeout(previewTimer); heroVideo.pause(); heroVideo.removeAttribute("src"); heroVideo.load(); };
        el.querySelector("#hero-play").addEventListener("click", () => heroItems[heroAt] && go(PlayerView(heroItems[heroAt], heroItems, { resume: true })));
        el.querySelector("#hero-info").addEventListener("click", () => heroItems[heroAt] && go(DetailView(heroItems[heroAt], heroItems)));

        let heroSet = false;
        const loads = shelves.map((shelf) => fillShelf(el.querySelector(`[data-shelf="${shelf.id}"]`), shelf));
        // Feature playable movies from the first row (newest movies) that has any.
        (async () => {
          for (let i = 0; i < loads.length; i++) {
            const items = await loads[i];
            if (!items.length || !el.isConnected) continue;
            const candidates = items.slice(0, 8);
            const infos = await Promise.all(candidates.map((x) => Catalog.info(x.id).catch(() => ({}))));
            let picks = candidates.filter((x, k) => infos[k].src);
            if (!picks.length) continue;
            const described = picks.filter((x) => x.description);
            picks = (described.length ? described : picks).slice(0, 4);
            if (!el.isConnected) return;
            heroSet = true;
            heroShelf = shelves[i];
            heroItems = picks;
            showHero();
            rotate = setInterval(() => { heroAt = (heroAt + 1) % heroItems.length; showHero(); }, previewsOn() ? 25000 : 9000);
            return;
          }
          if (!heroSet && el.isConnected) {
            el.querySelector("#hero-title").textContent = "Can't load movies right now";
            el.querySelector("#hero-desc").textContent = "Check your internet connection, then press Try again on a row below.";
          }
        })();
      },
      destroy() { clearInterval(rotate); stopPreview(); },
    };
  }

  function MoviesView() {
    return {
      tab: "movies",
      render(el) {
        const shelves = shelvesFor(profile.level);
        el.innerHTML = `<section class="page"><h1>Movies</h1><p class="sub">Free movies and cartoons for ${escapeHtml(profile.name)}.</p>
          ${continueSection()}
          ${shelves.map(shelfSection).join("")}</section>`;
        const cont = el.querySelector("#continue");
        if (cont) wireCards(cont, History.list(profile.id), { resume: true });
        let focused = !!cont;
        if (cont) SpatialNav.focus(cont.querySelector(".card"));
        shelves.forEach((s) => fillShelf(el.querySelector(`[data-shelf="${s.id}"]`), s).then(() => {
          if (!focused && el.querySelector(".card.f")) { focused = true; SpatialNav.focus(el.querySelector(".card.f")); }
        }));
      },
    };
  }

  function SearchView() {
    let timer = 0;
    return {
      tab: "search",
      render(el) {
        el.innerHTML = `<section class="page"><h1>Search</h1>
          <div class="search-box"><input class="f" id="q" type="search" placeholder="Type a movie name" autocomplete="off"></div>
          <div class="results" id="results"></div></section>`;
        const input = el.querySelector("#q");
        const results = el.querySelector("#results");
        input.addEventListener("input", () => {
          clearTimeout(timer);
          const term = input.value.trim();
          if (term.length < 2) { results.innerHTML = ""; return; }
          timer = setTimeout(() => {
            results.innerHTML = `<div class="empty">Searching…</div>`;
            Catalog.find(term, profile.level).then((items) => {
              items = items.filter((x) => !Catalog.isBroken(x.id));
              if (!items.length) { results.innerHTML = `<div class="empty">No movies found for “${escapeHtml(term)}”.</div>`; return; }
              results.innerHTML = items.map((it) => cardHtml(it)).join("");
              wireCards(results, items);
            }).catch(() => { results.innerHTML = `<div class="empty">Couldn't reach the movie library. Check your internet connection.</div>`; });
          }, 450);
        });
        input.focus();
      },
      destroy() { clearTimeout(timer); },
    };
  }

  function DetailView(item, list = []) {
    return {
      tab: current ? current.tab : "home",
      render(el) {
        const prog = History.get(profile.id, item.id);
        el.innerHTML = `<section class="detail">
          <span class="thumb" id="detail-art" style="background-image:url('${Catalog.image(item.id)}')"></span>
          <div>
            <h1>${escapeHtml(item.title)}</h1>
            <div class="meta">${escapeHtml([item.year, item.runtime].filter(Boolean).join(" · "))}</div>
            <p>${escapeHtml(item.description || "A free movie from the Internet Archive.")}</p>
            <div class="btns">
              ${prog ? `<button class="f btn gold" id="resume">▶ Resume ${formatTime(prog.pos)}</button><button class="f btn" id="play">Start over</button>`
                     : `<button class="f btn gold" id="play">▶ Play</button>`}
              <button class="f btn" id="back">Back</button>
            </div>
            <p class="note" id="detail-note" hidden></p>
          </div></section>`;
        const resume = el.querySelector("#resume");
        if (resume) resume.addEventListener("click", () => go(PlayerView(item, list, { resume: true })));
        el.querySelector("#play").addEventListener("click", () => go(PlayerView(item, list, { resume: false })));
        el.querySelector("#back").addEventListener("click", back);
        SpatialNav.focus(resume || el.querySelector("#play"));
        Catalog.info(item.id).then((info) => {
          if (info.image) sharpen(el.querySelector("#detail-art"), info.image);
          if (info.broken) {
            const note = el.querySelector("#detail-note");
            note.hidden = false;
            note.textContent = "This movie can't be played right now. Try another one.";
          }
        }).catch(() => {});
      },
    };
  }

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
              if (p.duration) lastRemote = { pos: p.currentTime, dur: p.duration };
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

        Catalog.info(item.id).then((found) => {
          info = found;
          if (!video.isConnected) return;
          if (!info.src) { fallback(wrap); return; }
          if (info.image) video.poster = info.image;
          video.src = info.src;
          // Already casting (for example the next movie in a row): send this one to the TV too.
          if (Cast.session()) { castNow(prog ? prog.pos : 0); return; }
          if (prog) {
            video.addEventListener("loadedmetadata", () => { video.currentTime = prog.pos; }, { once: true });
            toast(`Resuming at ${formatTime(prog.pos)}`);
          }
          video.play().catch(() => toast("Press OK or tap the movie to start"));
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
        video.addEventListener("timeupdate", () => {
          if (Date.now() - saveTimer > 5000) { saveTimer = Date.now(); saveProgress(); }
        });
        video.addEventListener("pause", saveProgress);
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

  // ----- input routing -----
  Input.on((action, ev) => {
    if (current && current.onAction && current.onAction(action, ev)) return true;
    if (action === "digit") return false;
    if (["up", "down", "left", "right"].includes(action)) {
      const a = document.activeElement;
      if (a && a.tagName === "INPUT" && (action === "left" || action === "right")) return false;
      return SpatialNav.move(action);
    }
    if (action === "ok") {
      const a = document.activeElement;
      if (a && a.classList.contains("f") && a.tagName !== "INPUT") { a.click(); return true; }
      return false;
    }
    if (action === "back") { back(); return true; }
    return false;
  });

  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.go)));

  // Gold focus ring follows the remote/controller, not the mouse.
  document.addEventListener("focusin", (e) => {
    if (e.target.classList && e.target.classList.contains("f")) e.target.classList.toggle("is-focus", !document.body.classList.contains("mouse"));
  });
  document.addEventListener("focusout", (e) => { if (e.target.classList) e.target.classList.remove("is-focus"); });

  document.addEventListener("padchange", (e) => {
    document.getElementById("pad").hidden = !e.detail;
    if (e.detail) toast("Controller connected");
  });

  const api = { go, back, replace, toast };

  updateWho();
  Cast.load();
  openTab(profile ? "home" : "profiles");
  return api;
})();
