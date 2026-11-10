const { chromium } = require('playwright');
const APP = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const out = require('path').join(__dirname, 'screenshots'); require('fs').mkdirSync(out, { recursive: true });
const clip = require('fs').readFileSync(require('path').join(__dirname, 'clip.webm'));
const fakeSdk = `
(function(){
  const ctx = { session: null, setOptions(){}, addEventListener(){}, getCastState(){ return 'CONNECTED'; },
    getCurrentSession(){ return this.session; },
    async requestSession(){ this.session = { getCastDevice: () => ({ friendlyName: 'Living Room TV' }), loadMedia: async (r) => { window.__loaded = r; } }; },
    endCurrentSession(){ this.session = null; window.__rp.isConnected = false; window.__rc.fire('IS_CONNECTED_CHANGED'); } };
  class RemotePlayer { constructor(){ Object.assign(this, { currentTime: 0, duration: 100, isPaused: false, isConnected: true, playerState: 'PLAYING' }); window.__rp = this; } }
  class RemotePlayerController { constructor(p){ this.p = p; this.l = {}; window.__rc = this; }
    addEventListener(t, f){ (this.l[t] = this.l[t] || []).push(f); } removeEventListener(t, f){ this.l[t] = (this.l[t] || []).filter((x) => x !== f); }
    playOrPause(){ this.p.isPaused = !this.p.isPaused; this.fire('IS_PAUSED_CHANGED'); } seek(){ this.fire('CURRENT_TIME_CHANGED'); }
    fire(t){ (this.l[t] || []).slice().forEach((f) => f()); } }
  window.cast = { framework: { CastContext: { getInstance: () => ctx }, CastContextEventType: { CAST_STATE_CHANGED: 's' },
    CastState: { NO_DEVICES_AVAILABLE: 'NO_DEVICES_AVAILABLE' }, RemotePlayer, RemotePlayerController,
    RemotePlayerEventType: { CURRENT_TIME_CHANGED: 'CURRENT_TIME_CHANGED', IS_PAUSED_CHANGED: 'IS_PAUSED_CHANGED', PLAYER_STATE_CHANGED: 'PLAYER_STATE_CHANGED', IS_CONNECTED_CHANGED: 'IS_CONNECTED_CHANGED' } } };
  window.chrome = window.chrome || {};
  chrome.cast = { media: { DEFAULT_MEDIA_RECEIVER_APP_ID: 'CC1AD845', MediaInfo: function(src, type){ this.contentId = src; this.contentType = type; },
    MovieMediaMetadata: function(){}, LoadRequest: function(i){ this.media = i; } }, AutoJoinPolicy: { ORIGIN_SCOPED: 'o' }, Image: function(u){ this.url = u; } };
  setTimeout(() => window.__onGCastApiAvailable(true), 50);
})();`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('https://www.gstatic.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: fakeSdk }));
  await p.route('https://archive.org/advancedsearch.php**', (r) => {
    const docs = Array.from({ length: 4 }, (_, i) => ({ identifier: `M${i}`, title: `Movie ${i + 1}`, year: 1950, description: 'A film.' }));
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ response: { docs } }) });
  });
  await p.route('https://archive.org/services/img/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="135"><rect width="180" height="135" fill="#345"/></svg>' }));
  await p.route('https://archive.org/metadata/**', (r) => {
    const id = r.request().url().split('/metadata/')[1].split('/')[0];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ result: [{ name: `${id}.mp4`, format: 'h.264' }] }) });
  });
  await p.route('https://archive.org/download/**', (r) => r.fulfill({ status: 200, contentType: 'video/webm', body: clip }));
  await p.addInitScript(() => localStorage.setItem('profile', 'kids'));
  await p.goto(APP + '');
  await p.waitForTimeout(1500);
  await p.click('#hero-play'); await p.waitForTimeout(1200);
  console.log('cast button visible:', await p.isVisible('#cast'), await p.textContent('#cast'));
  await p.click('#cast'); await p.waitForTimeout(500);
  console.log('loaded on TV:', await p.evaluate(() => window.__loaded && [window.__loaded.media.contentId, window.__loaded.currentTime]));
  console.log('casting screen:', await p.isVisible('#casting'), await p.textContent('#casting b'), '| video hidden:', await p.$eval('#video', (v) => v.hidden));
  await p.evaluate(() => { window.__rp.currentTime = 42; window.__rc.fire('CURRENT_TIME_CHANGED'); });
  console.log('time shown:', await p.textContent('#cast-time'));
  await p.click('#cast-pp'); await p.waitForTimeout(100);
  console.log('after pause button:', await p.textContent('#cast-pp'));
  await p.screenshot({ path: out + '/cast-1.png' });
  // finish on TV -> Up next
  await p.evaluate(() => { window.__rp.currentTime = 98; window.__rc.fire('CURRENT_TIME_CHANGED'); window.__rp.playerState = 'IDLE'; window.__rc.fire('PLAYER_STATE_CHANGED'); });
  await p.waitForTimeout(300);
  console.log('up next while casting:', await p.isVisible('#upnext'), await p.textContent('#upnext b'));
  await p.click('#next-now'); await p.waitForTimeout(1200);
  console.log('next movie sent to TV:', await p.evaluate(() => window.__loaded.media.contentId), '| casting screen:', await p.isVisible('#casting'));
  // stop casting
  await p.evaluate(() => { window.__rp.currentTime = 30; window.__rc.fire('CURRENT_TIME_CHANGED'); });
  await p.click('#cast-stop'); await p.waitForTimeout(300);
  console.log('after stop: casting screen', await p.isVisible('#casting'), '| video visible', await p.isVisible('#video'), '| button', await p.textContent('#cast'));
  console.log('errors:', errors);
  await b.close();
})();
