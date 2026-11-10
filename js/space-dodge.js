// Space Dodge: steer the ship left and right, dodge rocks, collect gold stars.

function SpaceDodgeView(game, app) {
  let canvas, ctx, raf = 0, last = 0, root;
  let state;

  function reset() {
    state = { x: 0.5, rocks: [], stars: [], score: 0, speed: 0.28, spawn: 0, starSpawn: 1.5, over: false, paused: false, t: 0 };
  }

  function render(el) {
    root = el;
    root.innerHTML = `
      <section class="arcade">
        <div class="arcade-top"><b>Space Dodge</b><span>Score <strong id="sd-score">0</strong> · Best ${Number(localStorage.getItem("best:space-dodge") || 0)}</span></div>
        <canvas id="sd" aria-label="Space Dodge game"></canvas>
        <div class="help">Move with the stick, D-pad or arrow keys · Menu to pause · B to quit</div>
      </section>`;
    canvas = root.querySelector("#sd");
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", onPointer);
    canvas.addEventListener("pointermove", (e) => { if (e.buttons) onPointer(e); });
    reset();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function onPointer(e) {
    const r = canvas.getBoundingClientRect();
    if (state.over) { reset(); return; }
    state.x = Math.min(0.97, Math.max(0.03, (e.clientX - r.left) / r.width));
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, r.width * dpr);
    canvas.height = Math.max(1, r.height * dpr);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.over && !state.paused) update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function update(dt) {
    const s = state;
    s.t += dt;
    s.speed = 0.28 + s.t * 0.012;
    if (Input.isHeld("left")) s.x -= 0.75 * dt;
    if (Input.isHeld("right")) s.x += 0.75 * dt;
    s.x = Math.min(0.97, Math.max(0.03, s.x));

    s.spawn -= dt;
    if (s.spawn <= 0) {
      s.rocks.push({ x: Math.random(), y: -0.05, r: 0.025 + Math.random() * 0.035, spin: Math.random() * 6 });
      s.spawn = Math.max(0.22, 0.75 - s.t * 0.01);
    }
    s.starSpawn -= dt;
    if (s.starSpawn <= 0) { s.stars.push({ x: 0.05 + Math.random() * 0.9, y: -0.05 }); s.starSpawn = 1.2 + Math.random() * 1.2; }

    const aspect = canvas.width / canvas.height;
    const shipY = 0.88;
    for (const r of s.rocks) { r.y += s.speed * dt; r.spin += dt; }
    for (const st of s.stars) st.y += s.speed * 0.8 * dt;
    s.rocks = s.rocks.filter((r) => r.y < 1.1);
    s.stars = s.stars.filter((st) => {
      const hit = Math.hypot((st.x - s.x) * aspect, st.y - shipY) < 0.06;
      if (hit) { s.score += 50; app.toast("+50"); }
      return st.y < 1.1 && !hit;
    });
    for (const r of s.rocks) {
      if (Math.hypot((r.x - s.x) * aspect, r.y - shipY) < r.r + 0.03) { gameOver(); break; }
    }
    s.score += dt * 10;
    root.querySelector("#sd-score").textContent = Math.floor(s.score);
  }

  function gameOver() {
    state.over = true;
    const score = Math.floor(state.score);
    const best = Number(localStorage.getItem("best:space-dodge") || 0);
    if (score > best) try { localStorage.setItem("best:space-dodge", String(score)); } catch (_) {}
  }

  function draw() {
    const w = canvas.width, h = canvas.height, s = state;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, w, h);
    // drifting background stars
    ctx.fillStyle = "rgba(246,239,224,.5)";
    for (let i = 0; i < 70; i++) {
      const x = (i * 97.3) % w;
      const y = ((i * 53.7) + s.t * 40 * (1 + (i % 3))) % h;
      ctx.fillRect(x, y, 2, 2);
    }
    // gold stars to collect
    for (const st of s.stars) drawStar(st.x * w, st.y * h, h * 0.025);
    // rocks
    for (const r of s.rocks) {
      ctx.save();
      ctx.translate(r.x * w, r.y * h);
      ctx.rotate(r.spin);
      ctx.fillStyle = "#4a4239";
      ctx.strokeStyle = "#6b6052";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const rad = r.r * h;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, rr = rad * (0.8 + ((k * 37) % 5) / 20);
        k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // ship
    const sx = s.x * w, sy = 0.88 * h, sz = h * 0.045;
    ctx.fillStyle = "#d4a64a";
    ctx.beginPath();
    ctx.moveTo(sx, sy - sz); ctx.lineTo(sx + sz * 0.8, sy + sz * 0.8); ctx.lineTo(sx, sy + sz * 0.4); ctx.lineTo(sx - sz * 0.8, sy + sz * 0.8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(240,207,122,.7)";
    ctx.fillRect(sx - sz * 0.15, sy + sz * 0.5, sz * 0.3, sz * (0.4 + Math.random() * 0.4));

    if (s.over || s.paused) {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#f6efe0";
      ctx.textAlign = "center";
      ctx.font = `800 ${h * 0.09}px "Bricolage Grotesque", sans-serif`;
      ctx.fillText(s.over ? "Game over" : "Paused", w / 2, h * 0.45);
      ctx.font = `600 ${h * 0.035}px Figtree, sans-serif`;
      ctx.fillStyle = "#d4a64a";
      ctx.fillText(s.over ? `Score ${Math.floor(s.score)} · Press A to play again` : "Press Menu to keep playing", w / 2, h * 0.55);
    }
  }

  function drawStar(x, y, r) {
    ctx.fillStyle = "#f0cf7a";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  function onAction(action) {
    if (["left", "right", "up", "down"].includes(action)) return true; // steering, not menu movement
    if ((action === "ok" || action === "a") && state.over) { reset(); return true; }
    if (action === "a" || action === "ok") return true;
    if (action === "menu" && !state.over) { state.paused = !state.paused; return true; }
    return false; // "back" / B falls through and leaves the game
  }

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  }

  return { tab: "games", render, onAction, destroy };
}
