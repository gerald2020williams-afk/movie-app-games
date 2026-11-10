// Series: Popeye, Superman, Betty Boop, the Three Stooges, Chaplin and Keaton shorts and more,
// grouped into a show page with numbered episodes, "Continue episode" and next-episode autoplay.

const seriesCache = new Map();

// All episodes of a series this profile may see, oldest first.
async function seriesEpisodes(series) {
  const key = series.id + "|" + profile.id;
  if (seriesCache.has(key)) return seriesCache.get(key);
  const lists = await Promise.all(series.shelves.map((id) => SHELVES.find((s) => s.id === id)).filter((s) => s && s.level <= profile.level)
    .map((s) => Catalog.shelf(s).then((items) => items.map((it) => ({ ...it, shelf: it.shelf || s.id }))).catch(() => [])));
  const seen = new Set();
  const eps = Catalog.dedupe(allowed(lists.flat()).filter((it) => series.match.test(it.title) && (seen.has(it.id) ? false : seen.add(it.id))))
    .sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999) || a.title.localeCompare(b.title))
    .map((it, i) => ({ ...it, episode: i + 1, series: series.id }));
  seriesCache.set(key, eps);
  return eps;
}

// The series a movie belongs to (if it has at least 3 episodes for this profile).
async function seriesFor(item) {
  for (const s of SERIES.filter((x) => x.level <= profile.level && x.match.test(item.title))) {
    if (s.id === "s-keaton" && item.shelf !== "keaton") continue;
    const eps = await seriesEpisodes(s);
    if (eps.length >= 3 && eps.some((e) => e.id === item.id)) return { series: s, episodes: eps };
  }
  return null;
}

// "1936–1957" from the earliest and latest known years.
function yearRange(eps) {
  const ys = eps.map((e) => Number(e.year)).filter(Boolean);
  if (!ys.length) return "";
  const a = Math.min(...ys), b = Math.max(...ys);
  return a === b ? String(a) : `${a}–${b}`;
}

// Which episode to play next: the one in progress, else the one after the last watched.
function nextEpisode(eps) {
  const inProgress = eps.find((e) => History.get(profile.id, e.id));
  if (inProgress) return { ep: inProgress, resume: true };
  const watched = new Set(Library.history(profile.id).map((x) => x.id));
  let last = -1;
  eps.forEach((e, i) => { if (watched.has(e.id)) last = i; });
  return { ep: eps[(last + 1) % eps.length] || eps[0], resume: false, started: last >= 0 };
}

// Home row: one card per series.
function fillSeriesRow(section) {
  const row = section.querySelector(".row");
  row.innerHTML = skeletonRow();
  const list = SERIES.filter((s) => s.level <= profile.level);
  return Promise.all(list.map((s) => seriesEpisodes(s).then((eps) => ({ s, eps })))).then((all) => {
    if (!section.isConnected) return;
    const shows = all.filter((x) => x.eps.length >= 3);
    if (!shows.length) { section.remove(); return; }
    row.innerHTML = shows.map(({ s, eps }) => {
      const cover = eps.find((e) => !Catalog.art(e.id).card) || eps[0];
      return `<button class="f card series-card" data-series="${s.id}" aria-label="${escapeHtml(`${s.name}, ${eps.length} episodes`)}">
        ${thumbHtml({ ...cover, title: s.name }, `<span class="ep-count">${eps.length} episodes</span>`)}
        <span class="t">${escapeHtml(s.name)}</span>
        <span class="y">${yearRange(eps)}</span>
      </button>`;
    }).join("");
    row.querySelectorAll("[data-series]").forEach((b) => b.addEventListener("click", () => go(SeriesView(b.dataset.series))));
  }).catch(() => section.remove());
}

function SeriesView(seriesId) {
  const series = SERIES.find((s) => s.id === seriesId);
  return {
    tab: current ? current.tab : "home",
    render(el) {
      el.innerHTML = `<section class="page"><h1>${escapeHtml(series.name)}</h1><p class="sub">Loading episodes…</p></section>`;
      seriesEpisodes(series).then((eps) => {
        if (!el.isConnected) return;
        const next = nextEpisode(eps);
        const watched = new Set(Library.history(profile.id).map((x) => x.id));
        el.innerHTML = `<section class="page series-page">
          <div class="series-head">
            ${thumbHtml({ ...(eps.find((e) => !Catalog.art(e.id).card) || eps[0]), title: series.name }, "", "series-art")}
            <div>
              <span class="tag">Series</span>
              <h1>${escapeHtml(series.name)}</h1>
              <p class="sub">${eps.length} episodes${yearRange(eps) ? ` · ${yearRange(eps)}` : ""}</p>
              <div class="btns">
                <button class="f btn gold" id="play-next">▶ ${next.resume ? "Continue" : next.started ? "Play" : "Start with"} episode ${next.ep.episode}</button>
                <button class="f btn" id="back">Back</button>
              </div>
              <p class="sub small">${escapeHtml(next.ep.title)}</p>
            </div>
          </div>
          <h2 class="section-title">Episodes</h2>
          <div class="episodes">${eps.map((e) => {
            const prog = History.get(profile.id, e.id);
            const pct = prog ? Math.min(100, Math.round((prog.pos / prog.dur) * 100)) : 0;
            return `<button class="f card episode" data-id="${escapeHtml(e.id)}" aria-label="${escapeHtml(`Episode ${e.episode}, ${e.title}${watched.has(e.id) && !prog ? ", watched" : ""}`)}">
              ${thumbHtml(e, `${pct ? `<span class="progress"><i style="width:${pct}%"></i></span>` : ""}${watched.has(e.id) && !prog ? `<span class="watched">✓ Watched</span>` : ""}`)}
              <span class="t">${e.episode}. ${escapeHtml(e.title)}</span>
              <span class="y">${escapeHtml([e.year, e.runtime].filter(Boolean).join(" · "))}</span>
            </button>`;
          }).join("")}</div>
        </section>`;
        el.querySelector("#play-next").addEventListener("click", () => go(PlayerView(next.ep, eps, { resume: next.resume })));
        el.querySelector("#back").addEventListener("click", back);
        // Choosing an episode plays it; the next episodes follow automatically.
        el.querySelectorAll(".episode").forEach((b) => b.addEventListener("click", () => {
          const ep = eps.find((x) => x.id === b.dataset.id);
          go(PlayerView(ep, eps, { resume: true }));
        }));
        watchCards(el);
        SpatialNav.focus(el.querySelector("#play-next"));
      });
    },
  };
}
