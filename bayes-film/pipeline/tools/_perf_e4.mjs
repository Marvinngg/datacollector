// Time renderFrame per scene (ms per frame, median of a few frames) -> where rendering time goes.
//   node pipeline/tools/perf.mjs
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/timeline.json'), 'utf8'));
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(0);
await new Promise(r => srv.on('listening', r));
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: TL.width, height: TL.height } });
await pg.goto(`http://127.0.0.1:${srv.address().port}/web/index.html`);
await pg.evaluate(async () => { await E.ready; await document.fonts.ready; });
if (process.argv.includes('--noblur')) await pg.evaluate(() => {   // experiment: how much of the frame is live blur?
  const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'filter');
  Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { get() { return d.get.call(this); }, set(v) { d.set.call(this, String(v).includes('blur') ? 'none' : v); } });
});
const TS=[212,215.3,216.3,218,221,224.5,228.5,232,235.8,241,245.5,247.5,249.5,250.5,251.3,252,253,256];
const rr = await pg.evaluate((ts)=>{renderFrame(ts[0]);return ts.map(t=>{const a=[];for(let k=0;k<3;k++){const s=performance.now();renderFrame(t);a.push(performance.now()-s);}a.sort((x,y)=>x-y);return t+":"+a[1].toFixed(0);});},TS);console.log(rr.join("  "));process.exit(0);
const rows = [];
const only = process.argv.slice(2).filter(a => !a.startsWith("--"));
for (const be of TL.beats.filter(b => !only.length || only.includes(b.id))) {
  const ts = [0.25, 0.5, 0.75].map(k => be.start + (be.end - be.start) * k);
  const r = await pg.evaluate((ts) => {
    renderFrame(ts[0]);                       // warm caches
    const out = { draw: [], grab: [] };
    for (const t of ts) { let a = performance.now(); renderFrame(t); out.draw.push(performance.now() - a); a = performance.now(); document.getElementById('c').toDataURL('image/jpeg', 0.96); out.grab.push(performance.now() - a); }
    const med = v => v.sort((x, y) => x - y)[1]; return { draw: med(out.draw), grab: med(out.grab) };
  }, ts);
  rows.push({ id: be.id, type: be.visual.type, dur: be.end - be.start, ...r });
}
let tot = 0;
for (const r of rows) { const sec = r.dur * TL.fps * (r.draw + r.grab) / 1000; tot += sec; console.log(`${r.id} ${r.type.padEnd(11)} draw ${r.draw.toFixed(0).padStart(4)} ms + jpeg ${r.grab.toFixed(0).padStart(3)} ms  -> ${sec.toFixed(0).padStart(4)} s of 1-core render time`); }
console.log(`total ≈ ${tot.toFixed(0)} s single-core`);
await b.close(); srv.close();
