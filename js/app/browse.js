// Home, Movies (browse), Search and the movie page.

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
              <span class="tag">${escapeHtml(Theme.greeting() ? `${Theme.greeting()}, ${profile.name}` : `Picks for ${profile.name}`)}</span>
              <h1 id="hero-title">Loading movies…</h1>
              <span class="meta" id="hero-meta"></span>
              <p id="hero-desc"></p>
              <div class="btns"><button class="f btn gold" id="hero-play">▶ Play</button><button class="f btn" id="hero-info">More info</button></div>
            </div>
            <div class="dots" id="hero-dots"></div>
          </div>
          ${continueSection()}
          ${myListSection()}
          <section class="shelf top10" id="top10"><h2>Top 10 This Week</h2><div class="row"></div></section>
          ${shelves.map(shelfSection).join("")}
        </div>
      </section>`;
      const cont = el.querySelector("#continue");
      if (cont) wireCards(cont, allowed(History.list(profile.id)), { resume: true });
      const mine = el.querySelector("#mylist");
      if (mine) wireCards(mine, allowed(Library.myList(profile.id)));
      fillTop10(el.querySelector("#top10"));
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
      };

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
          // The featured movie stays put; tap a dot to see another pick.
          el.querySelector("#hero-dots").addEventListener("click", (e) => {
            const dots = [...el.querySelectorAll("#hero-dots i")];
            const i = dots.indexOf(e.target);
            if (i >= 0) { heroAt = i; showHero(); }
          });
          return;
        }
        if (!heroSet && el.isConnected) {
          el.querySelector("#hero-title").textContent = "Can't load movies right now";
          el.querySelector("#hero-desc").textContent = "Check your internet connection, then press Try again on a row below.";
        }
      })();
    },
    destroy() { clearInterval(rotate); },
  };
}

// Movies tab: browse by category, decade, color and sort order.
function MoviesView() {
  const state = { shelfId: "", decade: "", color: "", sort: "downloads desc", page: 1 };
  let items = [];
  return {
    tab: "movies",
    render(el) {
      const shelves = shelvesFor(profile.level);
      const decades = ["1920", "1930", "1940", "1950", "1960", "1970", "1980", "1990", "2000", "2010", "2020"];
      const chips = (key, options) => options.map(([v, label]) => `<button class="f chip-btn${state[key] === v ? " on" : ""}" data-key="${key}" data-v="${v}">${label}</button>`).join("");
      el.innerHTML = `<section class="page">
        <h1>Movies</h1>
        <div class="filters">
          <div class="filter"><span>Category</span><div class="chips scroll">${chips("shelfId", [["", "All"], ...shelves.map((x) => [x.id, x.title])])}</div></div>
          <div class="filter"><span>Decade</span><div class="chips scroll">${chips("decade", [["", "Any"], ...decades.map((d) => [d, d + "s"])])}</div></div>
          <div class="filter"><span>Picture</span><div class="chips">${chips("color", [["", "Any"], ["color", "Color"], ["bw", "Black & White"]])}</div></div>
          <div class="filter"><span>Sort</span><div class="chips">${chips("sort", [["downloads desc", "Most popular"], ["year desc", "Newest"], ["year asc", "Oldest"], ["titleSorter asc", "A to Z"]])}</div></div>
        </div>
        <div class="results" id="results"></div>
        <div class="btns center"><button class="f btn" id="more" hidden>Load more</button></div>
      </section>`;
      const results = el.querySelector("#results");
      const more = el.querySelector("#more");
      const run = (append = false) => {
        if (!append) { state.page = 1; items = []; results.innerHTML = skeletonRow(); }
        more.hidden = true;
        Catalog.browse({ level: profile.level, ...state }).then((found) => {
          if (!results.isConnected) return;
          found = allowed(found).filter((x) => !items.some((y) => y.id === x.id));
          found.forEach((x) => { if (!x.shelf) x.shelf = state.shelfId; });
          items = items.concat(found);
          if (!items.length) { results.innerHTML = `<div class="empty">No movies match these choices. Try another decade or category.</div>`; return; }
          if (!append) results.innerHTML = "";
          const tmp = document.createElement("div");
          tmp.innerHTML = found.map((x) => cardHtml(x)).join("");
          const added = [...tmp.children];
          added.forEach((c) => results.appendChild(c));
          const wrapper = { querySelectorAll: () => added };
          wireCards(wrapper, items);
          more.hidden = found.length < 30;
        }).catch(() => { results.innerHTML = `<div class="empty">Couldn't reach the movie library. <button class="f btn small" id="retry">Try again</button></div>`; const r = results.querySelector("#retry"); if (r) r.onclick = () => run(); });
      };
      el.querySelectorAll("[data-key]").forEach((btn) => btn.addEventListener("click", () => {
        state[btn.dataset.key] = btn.dataset.v;
        el.querySelectorAll(`[data-key="${btn.dataset.key}"]`).forEach((x) => x.classList.toggle("on", x === btn));
        run();
      }));
      more.addEventListener("click", () => { state.page++; run(true); });
      run();
      SpatialNav.focus(el.querySelector('[data-key="shelfId"]'));
    },
  };
}

function SearchView() {
  let timer = 0;
  return {
    tab: "search",
    render(el) {
      el.innerHTML = `<section class="page"><h1>Search</h1>
        <div class="search-box"><input class="f" id="q" type="search" placeholder="Type a movie name" autocomplete="off"><button class="f btn" id="mic" hidden aria-label="Search by voice">🎤 Speak</button></div>
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
            items = allowed(items);
            if (!items.length) { results.innerHTML = `<div class="empty">No movies found for “${escapeHtml(term)}”.</div>`; return; }
            results.innerHTML = items.map((it) => cardHtml(it)).join("");
            wireCards(results, items);
          }).catch(() => { results.innerHTML = `<div class="empty">Couldn't reach the movie library. Check your internet connection.</div>`; });
        }, 450);
      });
      // Voice search (phones, tablets and computers whose browser supports it).
      const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      const mic = el.querySelector("#mic");
      if (Speech) {
        mic.hidden = false;
        mic.addEventListener("click", () => {
          const rec = new Speech();
          rec.lang = navigator.language || "en-US";
          rec.interimResults = false;
          rec.maxAlternatives = 1;
          mic.textContent = "Listening…";
          rec.onresult = (e) => { input.value = e.results[0][0].transcript.replace(/[.?!]$/, ""); input.dispatchEvent(new Event("input")); };
          rec.onerror = (e) => toast(e.error === "not-allowed" ? "Allow the microphone to search by voice" : "Didn't catch that. Try again.");
          rec.onend = () => { mic.textContent = "🎤 Speak"; };
          try { rec.start(); } catch (_) { mic.textContent = "🎤 Speak"; }
        });
      }
      input.focus();
    },
    destroy() { clearTimeout(timer); },
  };
}

// "By Blender Studio · CC BY 4.0 · From the Internet Archive" — credit the makers as their licenses ask.
function licenseName(url) {
  const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/?([\d.]+)?/i.exec(url || "");
  if (!m) return "";
  if (m[1] === "publicdomain") return m[2] === "zero" ? "CC0 (public domain)" : "Public domain";
  return `CC ${m[2].toUpperCase()}${m[3] ? " " + m[3] : ""}`;
}
function creditLine(item) {
  const parts = [];
  if (item.creator) parts.push(`By ${escapeHtml(item.creator)}`);
  const lic = licenseName(item.license);
  if (lic) parts.push(`<a href="${escapeHtml(item.license)}" target="_blank" rel="noopener">${lic}</a>`);
  parts.push(`<a href="https://archive.org/details/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">From the Internet Archive</a>`);
  return parts.join(" · ");
}

const THUMB_UP = `<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true"><path fill="currentColor" d="M2 21h3V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 7.6 6.6C7.2 7 7 7.5 7 8v11a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>`;
const THUMB_DOWN = `<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" style="transform:rotate(180deg)"><path fill="currentColor" d="M2 21h3V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 7.6 6.6C7.2 7 7 7.5 7 8v11a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>`;

function DetailView(item, list = []) {
  let previewEl = null;
  return {
    tab: current ? current.tab : "home",
    render(el) {
      const prog = History.get(profile.id, item.id);
      const shelf = SHELVES.find((x) => x.id === item.shelf);
      const others = allowed(list).filter((x) => x.id !== item.id).slice(0, 18);
      const rating = Library.rating(profile.id, item.id);
      el.innerHTML = `<section class="movie-page">
        <div class="mp-hero">
          <div class="mp-bg" id="mp-bg" style="background-image:url('${Catalog.image(item.id)}')"></div>
          <div class="mp-shade"></div>
          <div class="mp-art" id="mp-art" style="background-image:url('${Catalog.image(item.id)}')"><video id="mp-preview" muted playsinline loop hidden></video></div>
          <div class="mp-copy">
            ${shelf ? `<span class="tag">${escapeHtml(shelf.title)}</span>` : ""}
            <h1>${escapeHtml(item.title)}</h1>
            <div class="meta">${escapeHtml([item.year, item.runtime].filter(Boolean).join(" · "))}${prog ? ` · ${formatTime(prog.dur - prog.pos)} left` : ""}</div>
            <p>${escapeHtml(item.description || "A free movie from the Internet Archive.")}</p>
            <p class="credit">${creditLine(item)}</p>
            <div class="btns">
              ${prog ? `<button class="f btn gold" id="resume">▶ Resume ${formatTime(prog.pos)}</button><button class="f btn" id="play">Start over</button>`
                     : `<button class="f btn gold" id="play">▶ Play</button>`}
              <button class="f btn" id="trailer">Watch preview</button>
              <button class="f btn" id="mylist-btn">${Library.inMyList(profile.id, item.id) ? "✓ In My List" : "+ My List"}</button>
              <button class="f btn icon${rating > 0 ? " on" : ""}" id="up" aria-label="I like this">${THUMB_UP}</button>
              <button class="f btn icon${rating < 0 ? " on" : ""}" id="down" aria-label="Not for me">${THUMB_DOWN}</button>
              <button class="f btn" id="hide">Hide this movie</button>
            </div>
            <p class="note" id="detail-note" hidden></p>
          </div>
        </div>
        ${others.length ? `<section class="shelf" id="more-like"><h2>More Like This</h2><div class="row">${others.map((x) => cardHtml(x)).join("")}</div></section>` : ""}
      </section>`;
      const resume = el.querySelector("#resume");
      if (resume) resume.addEventListener("click", () => go(PlayerView(item, list, { resume: true })));
      el.querySelector("#play").addEventListener("click", () => go(PlayerView(item, list, { resume: false })));
      const myBtn = el.querySelector("#mylist-btn");
      myBtn.addEventListener("click", () => {
        const added = Library.toggleMyList(profile.id, item);
        myBtn.textContent = added ? "✓ In My List" : "+ My List";
        toast(added ? "Added to My List" : "Removed from My List");
      });
      const up = el.querySelector("#up"), down = el.querySelector("#down");
      const rate = (v) => {
        const now = Library.rate(profile.id, item, v);
        up.classList.toggle("on", now > 0); down.classList.toggle("on", now < 0);
        toast(now > 0 ? "Thanks! You'll see more like this." : now < 0 ? "Got it. This movie is hidden for you." : "Rating removed");
      };
      el.querySelector("#hide").addEventListener("click", () => {
        const doHide = () => { Library.hide(item); History.remove(profile.id, item.id); toast("Hidden for every profile on this device"); };
        if (!Profiles.hasPin()) { doHide(); back(); return; }
        go(PinView({ mode: "check", title: "Parent PIN to hide this movie", onDone: () => { doHide(); stack.pop(); back(); } }));
      });
      up.addEventListener("click", () => rate(1));
      down.addEventListener("click", () => rate(-1));
      // A silent preview clip plays in the picture.
      previewEl = el.querySelector("#mp-preview");
      const trailer = el.querySelector("#trailer");
      trailer.addEventListener("click", () => {
        if (!previewEl.hidden) { previewEl.pause(); previewEl.hidden = true; trailer.textContent = "Watch preview"; return; }
        Catalog.videoFile(item.id).then((src) => {
          previewEl.src = src + "#t=60";
          previewEl.hidden = false;
          previewEl.play().catch(() => {});
          trailer.textContent = "Stop preview";
        }).catch(() => toast("No preview for this movie"));
      });
      const more = el.querySelector("#more-like");
      if (more) wireCards(more, others);
      SpatialNav.focus(resume || el.querySelector("#play"));
      Catalog.info(item.id).then((info) => {
        if (info.image) { sharpen(el.querySelector("#mp-art"), info.image); sharpen(el.querySelector("#mp-bg"), info.image); }
        if (info.broken) {
          const note = el.querySelector("#detail-note");
          note.hidden = false;
          note.textContent = "This movie can't be played right now. Try another one.";
        }
      }).catch(() => {});
    },
    destroy() { if (previewEl) { previewEl.pause(); previewEl.removeAttribute("src"); previewEl.load(); } },
  };
}
