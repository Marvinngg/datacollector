import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = '/home/user/datacollector/winter-melon';
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(0);
await new Promise(r => srv.on('listening', r));
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(`http://127.0.0.1:${srv.address().port}/web/index.html`);
await pg.evaluate(async () => { await E.ready; });
const res = await pg.evaluate(() => {
  const out = []; const t0 = performance.now(); let n = 0;
  const orig = console.error; const bad = []; console.error = (...a) => { bad.push(a.join(' ')); };
  for (let t = 160.0; t < 212.8; t += 0.2) { renderFrame(t); n++; }
  console.error = orig;
  const cues = allCues().filter(c => ['s12', 's13', 's14', 's15'].includes(c.beat) && c.type !== 'beat');
  return { bad: bad.slice(0, 5), ms: (performance.now() - t0) / n, cues };
});
console.log('errors', errs.slice(0, 5), res.bad, 'ms/frame', res.ms.toFixed(1));
for (const c of res.cues) console.log(c.beat, c.t, c.type, c.dur || '');
await b.close(); srv.close();
