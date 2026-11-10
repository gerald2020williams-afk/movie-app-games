// Trivia game: 10 questions, answer with controller A / B / X / Y (or 1–4 on a keyboard, or tap).

const KEYS = [["A", "#2fa84f"], ["B", "#d6453d"], ["X", "#2f6fd6"], ["Y", "#e0a020"]];
const ROUND_SECONDS = 15;
const QUESTIONS_PER_GAME = 10;

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function TriviaView(game, app) {
  const questions = shuffle(TRIVIA[game.bank]).slice(0, QUESTIONS_PER_GAME).map((q) => {
    // Shuffle answer order so the right answer isn't always in the same spot.
    const order = shuffle([0, 1, 2, 3]);
    return { q: q.q, a: order.map((i) => q.a[i]), c: order.indexOf(q.c) };
  });
  let index = 0, score = 0, correct = 0, locked = false, deadline = 0, raf = 0, nextTimer = 0;
  let root;

  function render(el) {
    root = el;
    showQuestion();
  }

  function showQuestion() {
    const item = questions[index];
    locked = false;
    root.innerHTML = `
      <section class="trivia">
        <div class="t-top"><b>${game.name}</b><span>Question ${index + 1} of ${questions.length}</span></div>
        <div class="timer"><i id="bar"></i></div>
        <p class="t-q">${escapeHtml(item.q)}</p>
        <div>
          <div class="answers">
            ${item.a.map((ans, i) => `
              <button class="f ans" data-i="${i}"><span class="key" style="background:${KEYS[i][1]}">${KEYS[i][0]}</span>${escapeHtml(ans)}</button>`).join("")}
          </div>
          <div class="t-foot"><span>Score <b id="score">${score}</b></span><span>Press A, B, X or Y to answer · Menu to quit</span></div>
        </div>
      </section>`;
    root.querySelectorAll(".ans").forEach((b) => b.addEventListener("click", () => answer(+b.dataset.i)));
    SpatialNav.focus(root.querySelector(".ans"));
    deadline = performance.now() + ROUND_SECONDS * 1000;
    cancelAnimationFrame(raf);
    tick();
  }

  function tick() {
    const left = Math.max(0, deadline - performance.now());
    const bar = root.querySelector("#bar");
    if (bar) bar.style.transform = `scaleX(${left / (ROUND_SECONDS * 1000)})`;
    if (left <= 0) { answer(-1); return; }
    raf = requestAnimationFrame(tick);
  }

  function answer(i) {
    if (locked) return;
    locked = true;
    cancelAnimationFrame(raf);
    const item = questions[index];
    const buttons = root.querySelectorAll(".ans");
    buttons[item.c].classList.add("right");
    if (i === item.c) {
      const secondsLeft = Math.max(0, (deadline - performance.now()) / 1000);
      score += 100 + Math.round(secondsLeft * 10);
      correct++;
      app.toast("Correct!");
    } else {
      if (i >= 0) buttons[i].classList.add("wrong");
      app.toast(i < 0 ? "Time's up!" : `The answer was ${item.a[item.c]}`);
    }
    root.querySelector("#score").textContent = score;
    nextTimer = setTimeout(() => {
      index++;
      if (index < questions.length) showQuestion(); else finish();
    }, 1600);
  }

  function finish() {
    const best = Number(localStorage.getItem("best:" + game.id) || 0);
    const isBest = score > best;
    if (isBest) try { localStorage.setItem("best:" + game.id, String(score)); } catch (_) {}
    root.innerHTML = `
      <section class="done">
        <h1>${game.name}</h1>
        <div class="big">${score}</div>
        <p>${correct} of ${questions.length} right${isBest ? " · New best score!" : best ? ` · Best: ${best}` : ""}</p>
        <div class="btns">
          <button class="f btn gold" id="again">Play again</button>
          <button class="f btn" id="exit">Back to games</button>
        </div>
      </section>`;
    root.querySelector("#again").onclick = () => app.replace(TriviaView(game, app));
    root.querySelector("#exit").onclick = () => app.back();
    SpatialNav.focus(root.querySelector("#again"));
    locked = true;
  }

  function onAction(action) {
    const map = { a: 0, b: 1, x: 2, y: 3 };
    if (action in map && !locked && root.querySelector(".ans")) { answer(map[action]); return true; }
    if (action === "menu") { app.back(); return true; }
    return false;
  }

  function destroy() { cancelAnimationFrame(raf); clearTimeout(nextTimer); }

  return { tab: "games", render, onAction, destroy };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
