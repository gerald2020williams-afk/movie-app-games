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
    const views = { home: HomeView, movies: MoviesView, games: GamesView, search: SearchView, profiles: ProfilesView };
    mount(views[name]());
  }

  // ----- shared bits -----
  function shelvesFor(level) {
    // New movies first, then rows made for this age group, then the rest.
    const rank = (s) => (s.featured ? 0 : s.level === level ? 1 : 2);
    return SHELVES.filter((s) => s.level <= level).sort((a, b) => rank(a) - rank(b));
  }

  function cardHtml(item, shelf) {
    return `<button class="f card" data-id="${escapeHtml(item.id)}">
      <span class="thumb" style="background-image:url('${Catalog.image(item.id)}')"></span>
      <span class="t">${escapeHtml(item.title)}</span>
      <span class="y">${escapeHtml(item.year || "")}</span>
    </button>`;
  }

  function skeletonRow() {
    return Array.from({ length: 6 }, () => `<div class="card skeleton"><span class="thumb"></span></div>`).join("");
  }

  // Renders a shelf row and wires its cards. Returns a promise of the items.
  function fillShelf(section, shelf) {
    const row = section.querySelector(".row");
    row.innerHTML = skeletonRow();
    return Catalog.shelf(shelf).then((items) => {
      if (!section.isConnected) return items;
      if (!items.length) { section.remove(); return items; }
      row.innerHTML = items.map((it) => cardHtml(it, shelf)).join("");
      row.querySelectorAll(".card").forEach((btn, i) => btn.addEventListener("click", () => go(DetailView(items[i], shelf))));
      return items;
    }).catch(() => {
      if (section.isConnected) row.innerHTML = `<div class="empty">Couldn't reach the movie library. Check your internet connection.</div>`;
      return [];
    });
  }

  function shelfSection(shelf) {
    return `<section class="shelf" data-shelf="${shelf.id}"><h2>${shelf.title}</h2><div class="row"></div></section>`;
  }

  function railHtml() {
    return `<aside class="rail">
      <h3>Games &amp; Trivia</h3>
      <div class="hint">Pick one to start</div>
      <div class="picks">
        ${GAMES.map((g) => `<button class="f pick" data-game="${g.id}"><span class="ico" style="background:${g.bg}">${g.icon}</span><span><b>${g.name}</b><small>${g.sub}</small></span></button>`).join("")}
      </div>
    </aside>`;
  }

  function startGame(id) {
    const g = GAMES.find((x) => x.id === id);
    if (!g) return;
    go(g.type === "trivia" ? TriviaView(g, api) : SpaceDodgeView(g, api));
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
            ${shelves.map(shelfSection).join("")}
          </div>
          ${railHtml()}
        </section>`;
        el.querySelectorAll(".pick").forEach((b) => b.addEventListener("click", () => startGame(b.dataset.game)));
        SpatialNav.focus(el.querySelector("#hero-play"));

        let heroItems = [], heroShelf = shelves[0], heroAt = 0;
        const showHero = () => {
          const it = heroItems[heroAt];
          if (!it) return;
          el.querySelector("#hero-bg").style.backgroundImage = `url('${Catalog.image(it.id)}')`;
          el.querySelector("#hero-art").style.backgroundImage = `url('${Catalog.image(it.id)}')`;
          el.querySelector("#hero-title").textContent = it.title;
          el.querySelector("#hero-meta").innerHTML = escapeHtml([heroShelf.title, it.year, it.runtime].filter(Boolean).join(" · "));
          el.querySelector("#hero-desc").textContent = it.description || "A free classic from the Internet Archive.";
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
        el.querySelector("#hero-play").addEventListener("click", () => heroItems[heroAt] && go(PlayerView(heroItems[heroAt])));
        el.querySelector("#hero-info").addEventListener("click", () => heroItems[heroAt] && go(DetailView(heroItems[heroAt], heroShelf)));

        let heroSet = false;
        const loads = shelves.map((shelf) => fillShelf(el.querySelector(`[data-shelf="${shelf.id}"]`), shelf));
        // Feature the first row (newest movies) that has anything in it.
        (async () => {
          for (let i = 0; i < loads.length; i++) {
            const items = await loads[i];
            if (!items.length || !el.isConnected) continue;
            heroSet = true;
            heroShelf = shelves[i];
            heroItems = items.filter((x) => x.description).slice(0, 4);
            if (!heroItems.length) heroItems = items.slice(0, 4);
            showHero();
            rotate = setInterval(() => { heroAt = (heroAt + 1) % heroItems.length; showHero(); }, previewsOn() ? 25000 : 9000);
            return;
          }
        })();
        Promise.allSettled(loads).then(() => {
          if (!heroSet && el.isConnected) {
            el.querySelector("#hero-title").textContent = "Can't load movies right now";
            el.querySelector("#hero-desc").textContent = "Check your internet connection. Games and trivia still work.";
          }
        });
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
          ${shelves.map(shelfSection).join("")}</section>`;
        let focused = false;
        shelves.forEach((s) => fillShelf(el.querySelector(`[data-shelf="${s.id}"]`), s).then(() => {
          if (!focused && el.querySelector(".card.f")) { focused = true; SpatialNav.focus(el.querySelector(".card.f")); }
        }));
      },
    };
  }

  function GamesView() {
    return {
      tab: "games",
      render(el) {
        el.innerHTML = `<section class="page"><h1>Games &amp; Trivia</h1><p class="sub">Pick one to start. Trivia answers use the A, B, X and Y buttons.</p>
          <div class="grid-games">${GAMES.map((g) => `<button class="f game-card" data-game="${g.id}" style="background:${g.bg}"><b>${g.name}</b><small>${g.sub}</small></button>`).join("")}</div></section>`;
        el.querySelectorAll(".game-card").forEach((b) => b.addEventListener("click", () => startGame(b.dataset.game)));
        SpatialNav.focus(el.querySelector(".game-card"));
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
        const shelf = { level: profile.level };
        input.addEventListener("input", () => {
          clearTimeout(timer);
          const term = input.value.trim();
          if (term.length < 2) { results.innerHTML = ""; return; }
          timer = setTimeout(() => {
            results.innerHTML = `<div class="empty">Searching…</div>`;
            Catalog.find(term, profile.level).then((items) => {
              if (!items.length) { results.innerHTML = `<div class="empty">No movies found for “${escapeHtml(term)}”.</div>`; return; }
              results.innerHTML = items.map((it) => cardHtml(it, shelf)).join("");
              results.querySelectorAll(".card").forEach((b, i) => b.addEventListener("click", () => go(DetailView(items[i], shelf))));
            }).catch(() => { results.innerHTML = `<div class="empty">Couldn't reach the movie library.</div>`; });
          }, 450);
        });
        input.focus();
      },
      destroy() { clearTimeout(timer); },
    };
  }

  function DetailView(item, shelf) {
    return {
      tab: current ? current.tab : "home",
      render(el) {
        el.innerHTML = `<section class="detail">
          <span class="thumb" style="background-image:url('${Catalog.image(item.id)}')"></span>
          <div>
            <h1>${escapeHtml(item.title)}</h1>
            <div class="meta">${escapeHtml([item.year, item.runtime].filter(Boolean).join(" · "))}</div>
            <p>${escapeHtml(item.description || "A free classic from the Internet Archive.")}</p>
            <div class="btns"><button class="f btn gold" id="play">▶ Play</button><button class="f btn" id="back">Back</button></div>
          </div></section>`;
        el.querySelector("#play").addEventListener("click", () => go(PlayerView(item)));
        el.querySelector("#back").addEventListener("click", back);
        SpatialNav.focus(el.querySelector("#play"));
      },
    };
  }

  function PlayerView(item) {
    return {
      tab: current ? current.tab : "home",
      render(el) {
        el.innerHTML = `<section class="player">
          <div class="player-bar"><button class="f btn" id="back">← Back</button><h1>${escapeHtml(item.title)}</h1>
            <button class="f btn" id="full">⛶ Full screen</button></div>
          <div class="screen-wrap" id="wrap">
            <video class="f" id="video" controls playsinline preload="auto" poster="${Catalog.image(item.id)}"></video>
            <div class="loading" id="loading">Loading movie…</div>
          </div>
        </section>`;
        const video = el.querySelector("#video");
        const wrap = el.querySelector("#wrap");
        el.querySelector("#back").addEventListener("click", back);
        el.querySelector("#full").addEventListener("click", () => fullscreen(video));
        SpatialNav.focus(video);

        // Play the movie file directly so one press of Play is enough.
        Catalog.videoFile(item.id).then((src) => {
          if (!video.isConnected) return;
          video.src = src;
          el.querySelector("#loading").hidden = true;
          video.play().catch(() => toast("Press OK or tap the movie to start"));
        }).catch(() => {
          // Fall back to the Internet Archive's own player.
          if (!wrap.isConnected) return;
          wrap.innerHTML = `<iframe src="${Catalog.embed(item.id)}" title="${escapeHtml(item.title)}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
        });
      },
      onAction(action) {
        const video = view.querySelector("#video");
        if (!video || document.activeElement !== video) return false;
        if (action === "ok" || action === "a") { video.paused ? video.play() : video.pause(); return true; }
        if (action === "left") { video.currentTime = Math.max(0, video.currentTime - 10); toast("Back 10 seconds"); return true; }
        if (action === "right") { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); toast("Forward 10 seconds"); return true; }
        if (action === "y") { fullscreen(video); return true; }
        return false;
      },
      destroy() {
        const video = view.querySelector("#video");
        if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
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
  openTab(profile ? "home" : "profiles");
  return api;
})();
