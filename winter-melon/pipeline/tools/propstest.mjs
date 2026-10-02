// The 冬瓜干 props on one image: slices fresh → dried, the 竹匾, the bag at several sizes (for tuning the drawing).
//   node pipeline/tools/propstest.mjs [out.png]
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2] || path.join(ROOT, 'build/propstest.png');
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(0);
await new Promise(r => srv.on('listening', r));
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
pg.on('pageerror', e => console.log('[pageerror]', e.message));
await pg.goto(`http://127.0.0.1:${srv.address().port}/web/index.html`);
await pg.evaluate(async () => { await E.ready; await document.fonts.ready; });
const data = await pg.evaluate(() => {
  const { ctx, W, H } = K; const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#a9b9c6'); g.addColorStop(1, '#efd9b5'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  [0, 0.3, 0.6, 0.85, 1].forEach((d, i) => { S.slice(130 + i * 200, 200, 180, { dry: d, seed: 3 + i, rot: 0.2 }); S.slice(130 + i * 200, 380, 180, { dry: d, seed: 8 + i, rot: -0.3, flip: true }); });
  S.tray(300, 760, 260, 200);
  for (let i = 0; i < 9; i++) { ctx.save(); ctx.translate(200 + (i % 3) * 100, 680 + Math.floor(i / 3) * 80); ctx.scale(1, 0.82); S.slice(0, 0, 90, { dry: 1, seed: i, rot: (i - 4) * 0.3 }); ctx.restore(); }
  S.bag(780, 820, 360, {});
  S.bag(200, 1450, 300, { rot: -0.1 }); S.bag(520, 1450, 180, {}); S.bag(720, 1450, 110, {}); S.bag(860, 1450, 76, { label: false });
  S.melon(700, 1800, 360, { tod: 'day', carve: S.MARK });
  return document.getElementById('c').toDataURL('image/png');
});
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64')); console.log(out);
await b.close(); srv.close();
