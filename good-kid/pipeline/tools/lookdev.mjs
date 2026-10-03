// Run a snippet of drawing code on the film page and save the frame (for trying out looks without a template).
//   node pipeline/tools/lookdev.mjs snippet.js [out.png]      (the snippet runs with K, L, PX, KIT, ctx in scope)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const code = fs.readFileSync(process.argv[2], 'utf8'), out = process.argv[3] || path.join(ROOT, 'build/lookdev.png');
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(0);
await new Promise(r => srv.on('listening', r));
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
pg.on('pageerror', e => console.log('[pageerror]', e.message)); pg.on('console', m => console.log('[page]', m.text()));
await pg.goto(`http://127.0.0.1:${srv.address().port}/web/index.html`);
await pg.evaluate(async () => { await E.ready; await document.fonts.ready; });
const data = await pg.evaluate((code) => { const ctx = K.ctx; BG(T.TL, 50); new Function('ctx', code)(ctx); return document.getElementById('c').toDataURL('image/png'); }, code);
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64')); console.log(out);
await b.close(); srv.close();
