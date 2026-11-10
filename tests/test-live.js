// Live Channels: schedule, tuning in at the right spot, channel up/down, same schedule on two devices.
const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');
const out = path.join(__dirname, 'screenshots'); require('fs').mkdirSync(out, { recursive: true });
const clip = require('fs').readFileSync(path.join(__dirname, 'clip.webm'));
(async () => {
  const b = await chromium.launch();
  const mk = async () => {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
    await ctx.route('https://**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' }));
    await ctx.route('https://archive.org/advancedsearch.php**', (r) => {
      const q = new URL(r.request().url()).searchParams.get('q');
      const tag = (q.match(/collection:\(([a-z_]+)/) || [0, 'x'])[1].slice(0, 8);
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ response: { docs: Array.from({ length: 8 }, (_, i) => ({ identifier: `${tag}${i}`, title: `${tag} film ${i + 1}`, year: 1940, runtime: i % 2 ? '0:07:00' : '' })) } }) });
    });
    await ctx.route('https://archive.org/metadata/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: [{ name: 'a.mp4', format: 'h.264' }] }) }));
    await ctx.route('https://archive.org/download/**', (r) => r.fulfill({ status: 200, contentType: 'video/webm', body: clip }));
    await ctx.addInitScript(() => localStorage.setItem('profile', 'kids'));
    const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
    await p.goto(APP); await p.waitForTimeout(800);
    return p;
  };
  const A = await mk(), B = await mk();
  await A.click('[data-go="live"]'); await A.waitForTimeout(1500);
  console.log('channels for Kids:', await A.$$eval('.channel .ch-name', (c) => c.map((x) => x.textContent.replace('LIVE', '').trim())));
  console.log('now / next shown:', await A.textContent('.channel .ch-now'), '|', await A.textContent('.channel .ch-next'));
  await A.screenshot({ path: out + '/live-guide.png' });
  await B.click('[data-go="live"]'); await B.waitForTimeout(1500);
  console.log('two devices see the same thing on:', (await A.textContent('.channel .ch-now')) === (await B.textContent('.channel .ch-now')));
  await A.click('.channel'); await A.waitForTimeout(1500);
  console.log('tuned in:', await A.textContent('.player-bar h1'), '| video src set:', !!(await A.$eval('#video', (v) => v.getAttribute('src'))));
  await A.screenshot({ path: out + '/live-player.png' });
  await A.focus('#video'); await A.keyboard.press('ArrowDown'); await A.waitForTimeout(1200);
  console.log('after channel down:', await A.textContent('.player-bar h1'));
  console.log('watch history logged:', await A.evaluate(() => Library.history('kids').length > 0));
  console.log('errors:', [...A.errors, ...B.errors]);
  await b.close();
})();
