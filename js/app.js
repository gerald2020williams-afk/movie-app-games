// App shell: profiles, navigation between screens, and the movie screens.

const App = (() => {
  const view = document.getElementById("view");
  const stack = []; // [{ v: view object, focus: index of focused item }]
  let current = null;
  let profile = loadProfile();

  // ----- helpers -----
  function loadProfile() {
    try { return PROFILES.find((p) => p.id === localStorage.getItem("profile")) || null; } catch (_) { return null; }
  }
  function setProfile(p) {
    profile = p;
    try { localStorage.setItem("profile", p.id); } catch (_) {}
    updateWho();
  }
  function updateWho() {
    document.getElementById("who-name").textContent = profile ? profile.name : "Pick a profile";
    const av = document.getElementById("who-avatar");
    av.textContent = profile ? profile.letter : "?";
    av.style.background = profile ? profile.color : "";
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
    return SHELVES.filter((s) => s.level <= level)
      .sort((a, b) => (a.level === level ? 0 : 1) - (b.level === level ? 0 : 1));
  }

  function cardHtml(item, shelf) {
    return `<button class="f card" data-id="${escapeHtml(item.id)}">
      <span class="thumb" style="background-image:url('${Catalog.image(item.id)}')"><span class="rating">${AGE_LABELS[shelf.level]}</span></span>
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
    return `<section class="shelf" data-shelf="${shelf.id}"><h2>${shelf.title} <small>${AGE_LABELS[shelf.level]}</small></h2><div class="row"></div></section>`;
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
        el.innerHTML = `<section class="profiles">
          <h1>Who's watching?</h1>
          <div class="profile-list">
            ${PROFILES.map((p) => `<button class="f profile${profile && profile.id === p.id ? " current" : ""}" data-id="${p.id}">
              <span class="pic" style="background:${p.color}">${p.letter}</span><b>${p.name}</b><small>${p.ages}</small></button>`).join("")}
          </div>
        </section>`;
        el.querySelectorAll(".profile").forEach((b) => b.addEventListener("click", () => {
          setProfile(PROFILES.find((p) => p.id === b.dataset.id));
          openTab("home");
        }));
        SpatialNav.focus(el.querySelector(".profile.current") || el.querySelector(".profile"));
      },
    };
  }

  function HomeView() {
    let rotate = 0;
    return {
      tab: "home",
      render(el) {
        const shelves = shelvesFor(profile.level);
        el.innerHTML = `<section class="home">
          <div class="watch">
            <div class="hero" id="hero">
              <div class="hero-bg" id="hero-bg"></div><div class="hero-shade"></div><div class="hero-art" id="hero-art"></div>
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
          el.querySelector("#hero-meta").innerHTML = `<span class="rating">${AGE_LABELS[heroShelf.level]}</span> ${escapeHtml([heroShelf.title, it.year, it.runtime].filter(Boolean).join(" · "))}`;
          el.querySelector("#hero-desc").textContent = it.description || "A free classic from the Internet Archive.";
          el.querySelector("#hero-dots").innerHTML = heroItems.map((_, i) => `<i class="${i === heroAt ? "on" : ""}"></i>`).join("");
        };
        el.querySelector("#hero-play").addEventListener("click", () => heroItems[heroAt] && go(PlayerView(heroItems[heroAt])));
        el.querySelector("#hero-info").addEventListener("click", () => heroItems[heroAt] && go(DetailView(heroItems[heroAt], heroShelf)));

        let heroSet = false;
        shelves.forEach((shelf) => {
          const section = el.querySelector(`[data-shelf="${shelf.id}"]`);
          fillShelf(section, shelf).then((items) => {
            if (heroSet || !items.length) return;
            heroSet = true;
            heroShelf = shelf;
            heroItems = items.filter((i) => i.description).slice(0, 4);
            if (!heroItems.length) heroItems = items.slice(0, 4);
            showHero();
            rotate = setInterval(() => { heroAt = (heroAt + 1) % heroItems.length; showHero(); }, 9000);
          });
        });
        Promise.allSettled(shelves.map((s) => Catalog.shelf(s))).then(() => {
          if (!heroSet && el.isConnected) {
            el.querySelector("#hero-title").textContent = "Can't load movies right now";
            el.querySelector("#hero-desc").textContent = "Check your internet connection. Games and trivia still work.";
          }
        });
      },
      destroy() { clearInterval(rotate); },
    };
  }

  function MoviesView() {
    return {
      tab: "movies",
      render(el) {
        const shelves = shelvesFor(profile.level);
        el.innerHTML = `<section class="page"><h1>Movies</h1><p class="sub">Free classic movies and cartoons for ${escapeHtml(profile.name)} (${escapeHtml(profile.ages)}).</p>
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
            <div class="meta"><span class="rating">${AGE_LABELS[shelf.level]}</span>${escapeHtml([item.year, item.runtime].filter(Boolean).join(" · "))}</div>
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
            <span class="note">Free from the Internet Archive</span></div>
          <iframe src="${Catalog.embed(item.id)}" title="${escapeHtml(item.title)}" allow="autoplay; fullscreen" allowfullscreen></iframe>
        </section>`;
        el.querySelector("#back").addEventListener("click", back);
        SpatialNav.focus(el.querySelector("#back"));
      },
    };
  }

  // ----- input routing -----
  Input.on((action) => {
    if (current && current.onAction && current.onAction(action)) return true;
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
