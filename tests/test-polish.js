const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const clip = require('fs').readFileSync(require('path').join(__dirname, 'clip.webm'));
const out = require('path').join(__dirname, 'screenshots'); require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [], searches = [];
  let metaCalls = 0;
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('https://archive.org/advancedsearch.php**', (r) => {
    const q = new URL(r.request().url()).searchParams.get('q');
    searches.push(q.includes('format:'));
    const tag = q.includes('Big Buck') ? 'New' : q.includes('classic_cartoons') ? 'Toon' : 'Other';
    const docs = Array.from({ length: 6 }, (_, i) => ({ identifier: `${tag}${i}`, title: `${tag} Movie ${i + 1}`, year: 1950 + i, description: `About ${tag} ${i + 1}.` }));
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ response: { docs } }) });
  });
  await p.route('https://archive.org/services/img/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="135"><rect width="180" height="135" fill="#333"/></svg>' }));
  await p.route('https://archive.org/metadata/**', (r) => {
    metaCalls++;
    const id = r.request().url().split('/metadata/')[1].split('/')[0];
    const broken = id.endsWith('2'); // every "...2" movie has no video
    const files = broken ? [{ name: 'readme.txt', format: 'Text' }] : [
      { name: `${id}.mp4`, format: 'h.264' }, { name: `${id}.thumbs/f_0001.jpg`, format: 'Thumbnail' },
      { name: `${id}_poster.jpg`, format: 'JPEG', size: '200000' }, { name: `small.jpg`, format: 'JPEG', size: '1000' }];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: files }) });
  });
  await p.route('https://archive.org/download/**', (r) => {
    const u = r.request().url();
    if (u.endsWith('.jpg')) {
      const colors = ['#c2410c', '#1e3a8a', '#065f46', '#3b0764', '#831843', '#78350f'];
      const n = Number((u.match(/(\d)_poster/) || [0, 0])[1]);
      return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${colors[n]}"/><circle cx="400" cy="300" r="150" fill="rgba(255,255,255,.3)"/></svg>` });
    }
    r.fulfill({ status: 200, contentType: 'video/webm', body: clip });
  });
  await p.addInitScript(() => { localStorage.setItem('profile', 'kids'); });
  await p.goto(APP + '');
  await p.waitForTimeout(2500);
  console.log('tabs:', await p.$$eval('.tab', (t) => t.map((x) => x.textContent)));
  console.log('rail present:', !!(await p.$('.rail')));
  console.log('first search had playable filter:', searches[0]);
  console.log('New row cards:', await p.$$eval('[data-shelf="new-family"] .card .t', (c) => c.map((x) => x.textContent)));
  console.log('hero:', await p.textContent('#hero-title'), '| meta calls:', metaCalls);
  await p.screenshot({ path: out + '/po-1-home.png' });

  // simulate watching New Movie 1 halfway, then reload
  await p.evaluate(() => History.save('kids', { id: 'New0', title: 'New Movie 1', year: '1950', description: 'About New 1.' }, 600, 1500));
  await p.evaluate(() => Object.keys(localStorage).length);
  await p.reload(); await p.waitForTimeout(2000);
  console.log('continue row:', await p.$$eval('#continue .card .t', (c) => c.map((x) => x.textContent)), await p.$$eval('#continue .card .y', (c) => c.map((x) => x.textContent)));
  console.log('hero play label:', await p.textContent('#hero-play'));
  await p.screenshot({ path: out + '/po-2-continue.png' });
  console.log('cached search on reload (no new searches):', searches.length);

  // open detail of New Movie 1 from the New row
  await p.click('[data-shelf="new-family"] .card[data-id="New0"]'); await p.waitForTimeout(500);
  console.log('detail buttons:', await p.$$eval('.detail .btn', (b) => b.map((x) => x.textContent)));
  await p.screenshot({ path: out + '/po-3-detail.png' });
  await p.click('#resume'); await p.waitForTimeout(800);
  await p.waitForTimeout(1500);
  console.log('playing:', await p.$eval('#video', (v) => [!v.paused, v.currentTime.toFixed(1)]));
  console.log('cast button hidden with no TV:', await p.$eval('#cast', (c) => c.hidden));
  console.log('player src:', await p.$eval('#video', (v) => v.getAttribute('src')));
  // simulate end of movie -> Up next
  await p.evaluate(() => document.querySelector('#video').dispatchEvent(new Event('ended')));
  await p.waitForTimeout(1200);
  console.log('up next:', await p.textContent('#upnext b'), '|', await p.textContent('#upnext-count'));
  await p.screenshot({ path: out + '/po-4-upnext.png' });
  await p.waitForTimeout(9500);
  console.log('after countdown, playing:', await p.textContent('.player-bar h1'));
  // continue watching removed after finishing
  console.log('history now:', await p.evaluate(() => History.list('kids').map((x) => x.id)));
  // phone
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('[data-go="home"]'); await p.waitForTimeout(1200);
  console.log('phone overflow:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await p.screenshot({ path: out + '/po-5-phone.png' });
  console.log('errors:', errors);
  await b.close();
})();
