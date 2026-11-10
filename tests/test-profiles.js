const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const out = require('path').join(__dirname, 'screenshots'); require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('https://archive.org/advancedsearch.php**', (r) => {
    const q = new URL(r.request().url()).searchParams.get('q');
    const tag = q.includes('Big Buck') ? 'New' : q.includes('christmas') ? 'Holiday' : q.includes('western') ? 'Western' : 'Classic';
    const docs = Array.from({ length: 6 }, (_, i) => ({ identifier: tag + i, title: `${tag} Movie ${i + 1}`, year: 1950 + i, description: `A ${tag.toLowerCase()} film.` }));
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ response: { docs } }) });
  });
  await p.route('https://archive.org/services/img/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#456"/></svg>' }));
  await p.route('https://archive.org/metadata/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: [{ name: 'movie.mp4', format: 'h.264' }] }) }));
  await p.route('https://archive.org/download/**', (r) => r.fulfill({ status: 404, body: '' }));

  await p.goto(APP + '');
  await p.waitForTimeout(500);
  await p.screenshot({ path: out + '/pf-1-who.png' });
  // pick Teens (3rd) -> create PIN
  await p.click('.profile[data-id="teens"]');
  await p.waitForTimeout(200);
  await p.screenshot({ path: out + '/pf-2-pin.png' });
  for (const k of '1234') await p.keyboard.press(k);
  await p.waitForTimeout(400);
  console.log('confirm title:', await p.textContent('#pin-title'));
  for (const k of '1234') await p.keyboard.press(k);
  await p.waitForTimeout(1200);
  console.log('who after pin:', await p.textContent('#who-name'));
  console.log('rows:', await p.$$eval('.shelf h2', (h) => h.map((x) => x.firstChild.textContent.trim())));
  await p.waitForTimeout(3500);
  console.log('preview src:', await p.$eval('#hero-video', (v) => v.getAttribute('src')));
  await p.screenshot({ path: out + '/pf-3-home.png' });

  // reload: locked profile asks again
  await p.reload(); await p.waitForTimeout(400);
  console.log('after reload view:', await p.textContent('#view h1'));
  // wrong pin on Adults
  await p.click('.profile[data-id="adults"]'); await p.waitForTimeout(200);
  for (const k of '9999') await p.keyboard.press(k);
  await p.waitForTimeout(500);
  console.log('still on pin:', await p.textContent('#pin-title'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // manage -> PIN -> edit Kids
  await p.click('#manage'); await p.waitForTimeout(200);
  for (const k of '1234') await p.keyboard.press(k);
  await p.waitForTimeout(500);
  await p.screenshot({ path: out + '/pf-4-manage.png' });
  await p.click('.manage-row[data-id="kids"]'); await p.waitForTimeout(200);
  await p.fill('#name', 'Maya');
  await p.click('[data-color="#a77bf3"]');
  await p.screenshot({ path: out + '/pf-5-edit.png' });
  await p.click('#save'); await p.waitForTimeout(300);
  console.log('manage rows:', await p.$$eval('.manage-row b', (x) => x.map((e) => e.textContent)));
  await p.click('#add'); await p.waitForTimeout(200);
  await p.fill('#name', 'Dad'); await p.click('[data-level="3"]');
  console.log('new adult locked:', await p.textContent('#locked'));
  await p.click('#save'); await p.waitForTimeout(300);
  await p.click('#done'); await p.waitForTimeout(300);
  console.log('profiles:', await p.$$eval('.profile b', (x) => x.map((e) => e.textContent)));
  await p.screenshot({ path: out + '/pf-6-who.png' });
  await p.click('.profile[data-id="kids"]'); await p.waitForTimeout(800);
  console.log('Maya home, who:', await p.textContent('#who-name'));
  // phone
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('[data-go="profiles"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: out + '/pf-7-phone.png' });
  console.log('phone overflow:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  console.log('errors:', errors);
  await b.close();
})();
