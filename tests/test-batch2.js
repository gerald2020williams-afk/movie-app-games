const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const clip = require('fs').readFileSync(require('path').join(__dirname, 'clip.webm'));
const out = require('path').join(__dirname, 'screenshots'); require('fs').mkdirSync(out, { recursive: true });
// A tiny pretend PeerJS network: peers in different pages find each other by id through the test.
const fakePeer = `
(function(){
  class Emitter { constructor(){ this.h = {}; } on(e, f){ (this.h[e] = this.h[e] || []).push(f); } emit(e, ...a){ (this.h[e] || []).forEach((f) => f(...a)); } }
  window.__conns = {};
  class Conn extends Emitter { constructor(cid, peerId, metadata){ super(); this.cid = cid; this.peer = peerId; this.metadata = metadata; window.__conns[cid] = this; }
    send(d){ window.__net({ k: 'data', cid: this.cid, d: JSON.parse(JSON.stringify(d)) }); } close(){ window.__net({ k: 'close', cid: this.cid }); } }
  window.__Conn = Conn; window.__peers = {};
  window.Peer = class extends Emitter {
    constructor(id){ super(); this.id = id || 'anon' + Math.random().toString(36).slice(2, 8); window.__peers[this.id] = this;
      window.__net({ k: 'register', id: this.id }).then((ok) => ok ? this.emit('open', this.id) : this.emit('error', { type: 'unavailable-id' })); }
    connect(target, opts = {}){ const cid = Math.random().toString(36).slice(2); const c = new Conn(cid, target, opts.metadata);
      window.__net({ k: 'connect', cid, from: this.id, to: target, metadata: opts.metadata }).then((ok) => { if (ok) setTimeout(() => c.emit('open'), 20); else c.emit('error', { type: 'peer-unavailable' }); }); return c; }
    reconnect(){} destroy(){ window.__net({ k: 'unregister', id: this.id }); }
  };
})();`;
(async () => {
  const b = await chromium.launch();
  const mkCtx = async () => {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/peerjs/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: fakePeer }));
    await ctx.route('https://www.gstatic.com/**', (r) => r.fulfill({ status: 404, body: '' }));
    await ctx.route('https://archive.org/advancedsearch.php**', (r) => {
      const q = new URL(r.request().url()).searchParams.get('q');
      let docs = Array.from({ length: 5 }, (_, i) => ({ identifier: `C${i}`, title: `Cartoon ${i + 1}`, year: 1940 + i, description: 'A cartoon.' }));
      if (q.includes('classic_cartoons')) docs.push({ identifier: 'bad1', title: 'Jungle Jitters', year: 1938, description: 'Old cartoon.' });
      if (q.includes('Big Buck')) docs = [{ identifier: 'bbb', title: 'Big Buck Bunny', year: 2008, description: 'A rabbit.', creator: 'Blender Foundation', licenseurl: 'http://creativecommons.org/licenses/by/3.0/' }];
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ response: { docs } }) });
    });
    await ctx.route('https://archive.org/services/img/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="135"><rect width="180" height="135" fill="#345"/></svg>' }));
    await ctx.route('https://archive.org/metadata/**', (r) => {
      const id = r.request().url().split('/metadata/')[1].split('/')[0];
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: [{ name: `${id}.mp4`, format: 'h.264' }, { name: `${id}_512kb.mp4`, format: '512Kb MPEG4' }] }) });
    });
    await ctx.route('https://archive.org/download/**', (r) => r.fulfill({ status: 200, contentType: 'video/webm', body: clip }));
    return ctx;
  };
  // pretend network shared by both devices
  const registry = {}; // peerId -> page
  const conns = {}; // cid -> { a: page(from), b: page(to), fromId, toId }
  const errors = [];
  const wire = async (ctx) => ctx.exposeBinding('__net', async ({ page }, m) => {
    if (m.k === 'register') { if (registry[m.id]) return false; registry[m.id] = page; return true; }
    if (m.k === 'unregister') { delete registry[m.id]; return true; }
    if (m.k === 'connect') {
      const target = registry[m.to]; if (!target) return false;
      conns[m.cid] = { from: page, to: target };
      await target.evaluate((m) => { const c = new window.__Conn(m.cid, m.from, m.metadata); window.__peers[m.to].emit('connection', c); setTimeout(() => c.emit('open'), 10); }, m);
      return true;
    }
    if (m.k === 'data') { const c = conns[m.cid]; if (!c) return; const other = page === c.from ? c.to : c.from; await other.evaluate((m) => window.__conns[m.cid] && window.__conns[m.cid].emit('data', m.d), m).catch(() => {}); }
    if (m.k === 'close') { const c = conns[m.cid]; if (!c) return; const other = page === c.from ? c.to : c.from; await other.evaluate((m) => window.__conns[m.cid] && window.__conns[m.cid].emit('close'), m).catch(() => {}); }
  });

  // ---------- Device A (TV) ----------
  const ctxA = await mkCtx(); await wire(ctxA);
  await ctxA.addInitScript(() => { if (!localStorage.getItem('profile')) localStorage.setItem('profile', 'kids'); });
  const A = await ctxA.newPage(); A.on('pageerror', (e) => errors.push('A: ' + e.message));
  await A.goto(APP + ''); await A.waitForTimeout(2000);
  console.log('16 kids see Jungle Jitters:', !!(await A.$('.card[data-id="bad1"]')));
  // credits on movie page
  await A.click('.card[data-id="bbb"]'); await A.waitForTimeout(500);
  console.log('17 credit line:', (await A.textContent('.credit')).trim());
  // hide a movie (no PIN yet)
  await A.keyboard.press('Escape'); await A.waitForTimeout(500);
  await A.click('[data-shelf="cartoons"] .card[data-id="C2"]'); await A.waitForTimeout(400);
  await A.click('#hide'); await A.waitForTimeout(800);
  console.log('16 C2 hidden after Hide:', !(await A.$('[data-shelf="cartoons"] .card[data-id="C2"]')));
  // media session on play
  await A.click('#hero-play'); await A.waitForTimeout(1200);
  console.log('12 lock-screen title:', await A.evaluate(() => navigator.mediaSession.metadata && navigator.mediaSession.metadata.title));
  await A.keyboard.press('Escape'); await A.waitForTimeout(300);
  // about page
  await A.click('[data-go="profiles"]'); await A.click('#about-btn'); await A.waitForTimeout(300);
  console.log('17 about credits listed:', await A.$$eval('.credits li', (l) => l.length));
  await A.screenshot({ path: out + '/c-about.png', fullPage: true });
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  // settings
  await A.click('#settings-btn'); await A.waitForTimeout(200);
  await A.click('[data-set="speed"][data-v="on"]');
  console.log('5 speed mode class:', await A.evaluate(() => document.documentElement.classList.contains('lite')));
  await A.screenshot({ path: out + '/c-settings.png' });
  await A.click('[data-set="speed"][data-v="auto"]');
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  // adult: safety off shows Jungle Jitters
  await A.evaluate(() => localStorage.setItem('profile', 'adults'));
  // sync: show code on A
  await A.click('#manage'); await A.waitForTimeout(200);
  await A.click('#sync-btn'); await A.waitForTimeout(200);
  await A.click('#show-code'); await A.waitForTimeout(600);
  const code = (await A.textContent('#pair-area .big-code')).replace(/\D/g, '');
  console.log('15 sync code:', code);

  // ---------- Device B (phone, separate storage) ----------
  const ctxB = await mkCtx(); await wire(ctxB);
  await ctxB.addInitScript(() => { if (!localStorage.getItem('profile')) localStorage.setItem('profile', 'little'); });
  const B = await ctxB.newPage(); B.on('pageerror', (e) => errors.push('B: ' + e.message));
  await B.setViewportSize({ width: 390, height: 844 });
  await B.goto(APP + ''); await B.waitForTimeout(1200);
  console.log('B profiles before:', await B.evaluate(() => Profiles.all().map((p) => p.name).join(', ')));
  await B.evaluate(() => { const p = Profiles.get('kids'); p.name = 'Maya'; Profiles.save(p); Library.toggleMyList('kids', { id: 'C1', title: 'Cartoon 2' }); });
  await B.evaluate(() => App);
  await B.click('[data-go="profiles"]').catch(() => {});
  await B.goto(APP + ''); await B.waitForTimeout(800);
  await B.click('[data-go="profiles"]'); await B.click('#manage'); await B.waitForTimeout(200);
  await B.click('#sync-btn'); await B.waitForTimeout(200);
  await B.click('#enter-code'); await B.fill('#pair-code', code); await B.click('#pair-form button');
  await B.waitForTimeout(6000);
  console.log('15 B linked devices:', await B.evaluate(() => Sync.linked().map((d) => d.name)), '| A linked:', await A.evaluate(() => Sync.linked().map((d) => d.name)));
  console.log('15 A sees Maya + My List from B:', await A.evaluate(() => [Profiles.get('kids').name, Library.myList('kids').map((x) => x.title)]));
  console.log('15 B sees hidden movie from A:', await B.evaluate(() => Library.hidden().map((x) => x.title)));
  // live change after linking
  await A.evaluate(() => Library.toggleMyList('kids', { id: 'C4', title: 'Cartoon 5' }));
  await A.waitForTimeout(800);
  console.log('15 live: B My List now:', await B.evaluate(() => Library.myList('kids').map((x) => x.title)));
  await B.screenshot({ path: out + '/c-sync-phone.png' });

  // ---------- Cell data question (#11) ----------
  const ctxC = await mkCtx();
  await ctxC.addInitScript(() => { localStorage.setItem('profile', 'kids'); Object.defineProperty(navigator, 'connection', { value: { type: 'cellular', effectiveType: '4g', saveData: false }, configurable: true }); });
  const C = await ctxC.newPage(); C.on('pageerror', (e) => errors.push('C: ' + e.message));
  await C.setViewportSize({ width: 390, height: 844 });
  await C.goto(APP + ''); await C.waitForTimeout(1500);
  await C.click('#hero-play'); await C.waitForTimeout(800);
  console.log('11 cell data question shown:', await C.isVisible('#data-ask'));
  await C.screenshot({ path: out + '/c-cell.png' });
  await C.click('[data-q="saver"]'); await C.waitForTimeout(500);
  console.log('11 data saver file used:', await C.$eval('#video', (v) => v.getAttribute('src')));
  console.log('errors:', errors);
  await b.close();
})();
