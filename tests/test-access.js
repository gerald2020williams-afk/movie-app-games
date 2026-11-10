// Subtitles, text size, high contrast and screen-reader labels.
const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');
const out = path.join(__dirname, 'screenshots'); require('fs').mkdirSync(out, { recursive: true });
const clip = require('fs').readFileSync(path.join(__dirname, 'clip.webm'));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.route('https://**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' }));
  await ctx.route('https://archive.org/advancedsearch.php**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ response: { docs: [{ identifier: 'subbed', title: 'Subbed Movie', year: 1950, description: 'Has subtitles.' }, { identifier: 'nosub', title: 'Quiet Movie', year: 1951, description: 'No subtitles.' }] } }) }));
  await ctx.route('https://archive.org/metadata/**', (r) => {
    const id = r.request().url().split('/metadata/')[1].split('/')[0];
    const files = [{ name: `${id}.mp4`, format: 'h.264', length: '95.5' }];
    if (id === 'subbed') files.push({ name: 'subbed.en.srt', format: 'SubRip' });
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: files }) });
  });
  await ctx.route('https://archive.org/download/**', (r) => {
    if (r.request().url().endsWith('.srt')) return r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: '1\n00:00:00,000 --> 00:00:02,500\nHello from the subtitles\n\n2\n00:00:02,600 --> 00:00:05,000\nSecond line\n' });
    r.fulfill({ status: 200, contentType: 'video/webm', body: clip });
  });
  await ctx.addInitScript(() => localStorage.setItem('profile', 'kids'));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(APP); await p.locator('.card[data-id="subbed"]').first().waitFor();
  console.log('card label for screen readers:', await p.getAttribute('.card[data-id="subbed"]', 'aria-label'));
  console.log('active tab marked:', await p.getAttribute('.tab.on', 'aria-current'));
  await p.click('.card[data-id="subbed"]'); await p.click('#play'); await p.waitForTimeout(1500);
  console.log('CC button shown:', await p.isVisible('#cc'));
  await p.click('#cc'); await p.waitForTimeout(300);
  console.log('subtitles showing:', await p.evaluate(() => { const t = document.querySelector('#video').textTracks[0]; return t && t.mode; }), '| cues:', await p.evaluate(() => { const t = document.querySelector('#video').textTracks[0]; return t && t.cues ? t.cues.length : 0; }));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.card[data-id="nosub"]'); await p.click('#play'); await p.waitForTimeout(1200);
  console.log('CC hidden when no subtitles:', !(await p.isVisible('#cc')));
  await p.click('[data-go="profiles"]'); await p.click('#settings-btn');
  const before = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await p.click('[data-set="text"][data-v="xl"]'); await p.click('[data-set="contrast"][data-v="on"]');
  const after = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  console.log('text size grew:', before, '→', after, '| high contrast on:', await p.evaluate(() => document.documentElement.classList.contains('contrast')));
  await p.screenshot({ path: out + '/a-settings.png' });
  await p.click('[data-go="home"]'); await p.waitForTimeout(800);
  await p.screenshot({ path: out + '/a-home-large.png' });
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  console.log('phone overflow with extra large text:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  console.log('errors:', errors);
  await b.close();
})();
