// Line up the characters in several poses on one image (for tuning the figure drawing).
//   node pipeline/tools/figtest.mjs [out.png]
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2] || path.join(ROOT, 'build/figtest.png');
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(0);
await new Promise(r => srv.on('listening', r));
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
pg.on('pageerror', e => console.log('[pageerror]', e.message));
await pg.goto(`http://127.0.0.1:${srv.address().port}/web/index.html`);
await pg.evaluate(async () => { await E.ready; await document.fonts.ready; });
const data = await pg.evaluate(() => {
  const { ctx, W, H } = K; const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#a9b9c6'); g.addColorStop(1, '#efd9b5'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const row = (y, items) => items.forEach(([who, o], i) => S.person(who, 120 + i * 210, y, 420, { tod: 'day', light: [-1, -0.3], ...o }));
  row(620, [['xiao', {}], ['xiao', { facing: -1, armF: [0.45, 1.1] }], ['xiao', { walk: 0.8 }], ['xiao', { walk: 2.4 }], ['wang', {}]]);
  row(1140, [['qin', {}], ['qin', { bend: 0.9, head: 0.3, crouch: 0.2, armF: [0.6, 0.5] }], ['qin', { facing: -1, walk: 1.2 }], ['qin', { sit: 1, armF: [0.5, 0.6] }], ['lin', {}]]);
  row(1660, [['kid', {}], ['lin', { facing: -1, armF: [0.5, 1.2] }], ['wang', { facing: -1, sit: 1 }], ['xiao', { armF: [1.2, 0.3] }], ['qin', { facing: -1, armF: [1.0, 0.6], head: -0.2 }]]);
  return document.getElementById('c').toDataURL('image/png');
});
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64')); console.log(out);
await b.close(); srv.close();
