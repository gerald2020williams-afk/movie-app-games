const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const clip = require('fs').readFileSync(require('path').join(__dirname, 'clip.webm'));
const out = require('path').join(__dirname, 'screenshots'); require('fs').mkdirSync(out, { recursive: true });
const fakePeer = `
(function(){
  class Emitter { constructor(){ this.h = {}; } on(e, f){ (this.h[e] = this.h[e] || []).push(f); } emit(e, ...a){ (this.h[e] || []).forEach((f) => f(...a)); } }
  class Conn extends Emitter { constructor(me, other){ super(); this.me = me; this.other = other; } send(d){ window.__relay({ k: 'data', to: this.other, from: this.me, d }); } close(){} }
  window.__Conn = Conn; window.__hostConns = {};
  window.Peer = class extends Emitter {
    constructor(id){ super(); this.id = id || 'client' + Math.random().toString(36).slice(2, 7); window.__peer = this; setTimeout(() => this.emit('open', this.id), 10); }
    connect(target){ const c = new Conn(this.id, target); window.__relay({ k: 'connect', from: this.id, to: target }); setTimeout(() => c.emit('open'), 60); return c; }
    reconnect(){} destroy(){}
  };
})();`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  const searches = [];
  await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/peerjs/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: fakePeer }));
  await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return \'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/><rect x="2" y="2" width="6" height="6" fill="#fff"/></svg>\'}}}' }));
  await ctx.route('https://www.gstatic.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route('https://archive.org/advancedsearch.php**', (r) => {
    const u = new URL(r.request().url());
    const q = u.searchParams.get('q'), sort = u.searchParams.get('sort[]');
    searches.push({ q, sort });
    const tag = sort === 'week desc' ? 'Top' : q.includes('year:[1950') ? 'Fifties' : q.includes('Big Buck') ? 'New' : q.includes('classic_cartoons') ? 'Toon' : 'Other';
    const n = tag === 'Top' ? 12 : 6;
    const docs = Array.from({ length: n }, (_, i) => ({ identifier: `${tag}${i}`, title: `${tag} Movie ${i + 1}`, year: 1950 + i, description: `About ${tag} ${i + 1}.` }));
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ response: { docs } }) });
  });
  await ctx.route('https://archive.org/services/img/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="135"><rect width="180" height="135" fill="#345"/></svg>' }));
  await ctx.route('https://archive.org/metadata/**', (r) => {
    const id = r.request().url().split('/metadata/')[1].split('/')[0];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: [{ name: `${id}.mp4`, format: 'h.264' }, { name: `${id}_poster.jpg`, format: 'JPEG', size: '9000' }] }) });
  });
  await ctx.route('https://archive.org/download/**', (r) => {
    if (r.request().url().endsWith('.jpg')) return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#7a3"/></svg>' });
    r.fulfill({ status: 200, contentType: 'video/webm', body: clip });
  });
  const pages = {};
  await ctx.exposeBinding('__relay', async ({ page }, m) => {
    const other = page === pages.tv ? pages.phone : pages.tv;
    if (m.k === 'connect') await other.evaluate((m) => { const c = new window.__Conn(m.to, m.from); window.__hostConns[m.from] = c; window.__peer.emit('connection', c); setTimeout(() => c.emit('open'), 10); }, m);
    if (m.k === 'data') await other.evaluate((m) => window.__hostConns[m.from].emit('data', m.d), m);
  });
  await ctx.addInitScript(() => { if (!localStorage.getItem('profile')) localStorage.setItem('profile', 'kids'); });

  const tv = pages.tv = await ctx.newPage();
  const errors = [];
  tv.on('pageerror', (e) => errors.push('tv: ' + e.message));
  await tv.goto(APP + '');
  await tv.waitForTimeout(2500);
  console.log('rows:', await tv.$$eval('.shelf h2', (h) => h.map((x) => x.textContent)).then((x) => x.slice(0, 5)));
  console.log('top10 ranks:', await tv.$$eval('#top10 .rank', (r) => r.map((x) => x.textContent).join(',')), '| sort used:', searches.some((s) => s.sort === 'week desc'));
  await tv.screenshot({ path: out + '/b-1-home.png' });

  // movie page: My List, thumbs, preview
  await tv.click('[data-shelf="new-family"] .card[data-id="New1"]'); await tv.waitForTimeout(600);
  console.log('movie page buttons:', await tv.$$eval('.mp-copy .btn', (b) => b.map((x) => x.textContent.trim() || x.getAttribute('aria-label'))));
  console.log('more like this:', await tv.$$eval('#more-like .card', (c) => c.length));
  await tv.click('#mylist-btn'); await tv.click('#up'); await tv.click('#trailer'); await tv.waitForTimeout(600);
  console.log('preview playing:', await tv.$eval('#mp-preview', (v) => !v.hidden && !!v.getAttribute('src')));
  await tv.screenshot({ path: out + '/b-2-movie.png' });
  // thumbs down another movie → hidden
  await tv.click('#back-fake').catch(() => {});
  await tv.keyboard.press('Escape'); await tv.waitForTimeout(800);
  await tv.click('[data-shelf="new-family"] .card[data-id="New3"]'); await tv.waitForTimeout(400);
  await tv.click('#down'); await tv.keyboard.press('Escape'); await tv.waitForTimeout(1200);
  console.log('My List row:', await tv.$$eval('#mylist .t', (t) => t.map((x) => x.textContent)));
  console.log('New3 hidden after thumbs down:', !(await tv.$('[data-shelf="new-family"] .card[data-id="New3"]')));

  // play to log history
  await tv.click('#hero-play'); await tv.waitForTimeout(2500);
  await tv.keyboard.press('Escape'); await tv.waitForTimeout(400);

  // Browse
  await tv.click('[data-go="movies"]'); await tv.waitForTimeout(800);
  await tv.click('[data-key="decade"][data-v="1950"]'); await tv.waitForTimeout(800);
  await tv.click('[data-key="color"][data-v="bw"]'); await tv.waitForTimeout(800);
  const last = searches[searches.length - 1].q;
  console.log('browse query has decade + b&w:', last.includes('year:[1950 TO 1959]'), last.includes('color:'), '| results:', await tv.$$eval('#results .card', (c) => c.length));
  await tv.screenshot({ path: out + '/b-3-browse.png' });

  // Search mic hidden in headless (no speech API) — just check no errors
  await tv.click('[data-go="search"]'); await tv.waitForTimeout(300);
  console.log('mic button (hidden if no speech support):', await tv.$eval('#mic', (m) => m.hidden));

  // Parent: watch history + look
  await tv.click('[data-go="profiles"]'); await tv.waitForTimeout(300);
  await tv.click('#manage'); await tv.waitForTimeout(300);
  await tv.click('[data-look="christmas"]'); await tv.waitForTimeout(200);
  console.log('look:', await tv.evaluate(() => document.documentElement.dataset.look));
  await tv.screenshot({ path: out + '/b-4-parent.png' });
  await tv.click('#history'); await tv.waitForTimeout(300);
  await tv.click('[data-pid="kids"]'); await tv.waitForTimeout(200);
  console.log('history rows:', await tv.$$eval('.log-row b', (r) => r.map((x) => x.textContent)), await tv.$$eval('.log-row .mins', (r) => r.map((x) => x.textContent)));
  await tv.screenshot({ path: out + '/b-5-history.png' });
  await tv.keyboard.press('Escape'); await tv.waitForTimeout(200);
  await tv.click('[data-look="auto"]');

  // Phone remote
  await tv.click('[data-go="home"]'); await tv.waitForTimeout(1500);
  await tv.click('#remote-btn'); await tv.waitForTimeout(800);
  const code = (await tv.textContent('#code')).replace(/\D/g, '');
  console.log('remote code:', code);
  await tv.screenshot({ path: out + '/b-6-remote-tv.png' });
  const phone = pages.phone = await ctx.newPage();
  phone.on('pageerror', (e) => errors.push('phone: ' + e.message));
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(APP + '?remote=' + code);
  await phone.waitForTimeout(800);
  await phone.screenshot({ path: out + '/b-7-remote-phone.png' });
  console.log('tv status:', await tv.textContent('#remote-status'));
  await tv.click('#done'); await tv.waitForTimeout(400);
  console.log('tv focus before:', await tv.evaluate(() => document.activeElement.id || document.activeElement.textContent.trim().slice(0, 20)));
  await phone.click('[data-a="right"]'); await tv.waitForTimeout(300);
  console.log('tv focus after phone Right:', await tv.evaluate(() => document.activeElement.id || document.activeElement.textContent.trim().slice(0, 20)));
  await phone.fill('#pr-text', 'Toon'); await phone.click('#pr-search button'); await tv.waitForTimeout(1200);
  console.log('tv search box:', await tv.$eval('#q', (q) => q.value), '| results:', await tv.$$eval('#results .card', (c) => c.length));
  // phone layout
  console.log('phone overflow:', await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  // phone movie page
  const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 390, height: 844 });
  p2.on('pageerror', (e) => errors.push('p2: ' + e.message));
  await p2.goto(APP + ''); await p2.waitForTimeout(1500);
  await p2.click('#hero-info'); await p2.waitForTimeout(600);
  console.log('phone movie page overflow:', await p2.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await p2.screenshot({ path: out + '/b-8-phone-movie.png', fullPage: true });
  console.log('errors:', errors);
  await b.close();
})();
