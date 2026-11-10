const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<canvas width="320" height="240"></canvas>');
  const b64 = await p.evaluate(async () => {
    const c = document.querySelector('canvas'), x = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' });
    const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start(); let t = 0;
    await new Promise((res) => { const id = setInterval(() => { x.fillStyle = `hsl(${t * 10},70%,50%)`; x.fillRect(0, 0, 320, 240); if (++t > 75) { clearInterval(id); res(); } }, 40); });
    rec.stop(); await new Promise((r) => (rec.onstop = r));
    const buf = await new Blob(chunks).arrayBuffer();
    let s = ''; new Uint8Array(buf).forEach((v) => (s += String.fromCharCode(v))); return btoa(s);
  });
  fs.writeFileSync(require('path').join(__dirname, 'clip.webm'), Buffer.from(b64, 'base64'));
  console.log('bytes', fs.statSync(require('path').join(__dirname, 'clip.webm')).size);
  await b.close();
})();
