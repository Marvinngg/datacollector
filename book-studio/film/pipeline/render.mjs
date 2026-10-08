// Render driver (headless Chromium via Playwright; the page is web/index.html with a part's timeline).
//   node pipeline/render.mjs film  --build <dir> [--workers 4] [--fresh]
//        every part in <dir>/parts.json -> <dir>/partN/video.mp4 (silent, 1080x1920 intermediate).
//        Frames are rendered per scene segment by a pool of workers across ALL parts and cached by content
//        (<dir>/cache/*.mp4): a re-run re-renders only scenes whose text, timing, neighbours or code changed.
//   node pipeline/render.mjs still --tl <timeline.json> --out <dir> <seconds...>    -> PNG stills
//   node pipeline/render.mjs perf  --tl <timeline.json> [--n 40]                    -> ms per frame
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };
// /web/* and /node_modules/* from the film folder; /b/* from the build folder (timelines)
function serve(buildDir) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const base = u.startsWith('/b/') ? buildDir : ROOT, rel = u.startsWith('/b/') ? u.slice(2) : u;
      const p = path.join(base, rel);
      if (!p.startsWith(base) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

// every character that may be drawn, so the web-font subsets are loaded before capture
function allChars(tlFile) {
  let s = fs.readFileSync(tlFile, 'utf8') + fs.readFileSync(path.join(ROOT, 'web/scenes.js'), 'utf8');
  s += '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .,:;!?%/+-=_()[]<>#@&*¥$·…—「」“”，。？！、';
  return [...new Set([...s])].filter(c => c.charCodeAt(0) > 31).join('');
}

async function openPage(browser, base, tlUrl, tlFile) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(`${base}/web/index.html?tl=${encodeURIComponent(tlUrl)}`);
  await page.evaluate(async (chars) => {
    await E.ready;
    const faces = ['300 40px "Noto Sans SC"', '400 40px "Noto Sans SC"', '500 40px "Noto Sans SC"',
      '400 40px "Noto Serif SC"', '500 40px "Noto Serif SC"', '600 40px "Noto Serif SC"', '400 40px "JetBrains Mono"'];
    for (const f of faces) await document.fonts.load(f, chars);
    await document.fonts.ready;
  }, allChars(tlFile));
  return page;
}
const grab = (page, t, type = 'image/png', q = 0.95) => page.evaluate(([t, type, q]) => { renderFrame(t); return document.getElementById('c').toDataURL(type, q); }, [t, type, q]);
const b64 = d => Buffer.from(d.split(',')[1], 'base64');
const ff = (argv) => new Promise((res, rej) => spawn('ffmpeg', argv, { stdio: 'inherit' }).on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res()));

async function main() {
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--font-render-hinting=none'] });
  let srv;
  try {
    if (mode === 'still' || mode === 'perf') {
      const tlFile = path.resolve(opt('tl')), bdir = path.dirname(path.dirname(tlFile));
      srv = await serve(bdir); const base = `http://127.0.0.1:${srv.address().port}`;
      const page = await openPage(browser, base, '/b/' + path.relative(bdir, tlFile), tlFile);
      if (mode === 'still') {
        const out = path.resolve(opt('out', 'stills')); fs.mkdirSync(out, { recursive: true });
        const times = args.slice(1).filter((a, i) => !a.startsWith('--') && !args.slice(1)[i - 1]?.startsWith('--'));
        for (const ts of times) {
          const f = path.join(out, `t${(+ts).toFixed(2).padStart(7, '0')}.png`);
          fs.writeFileSync(f, b64(await grab(page, +ts))); console.log(f);
        }
      } else {
        const TL = JSON.parse(fs.readFileSync(tlFile, 'utf8')), n = +opt('n', 40);
        await grab(page, 1, 'image/jpeg', 0.9);
        const r = await page.evaluate(([n, D]) => { const ms = []; for (let i = 0; i < n; i++) { const a = performance.now(); renderFrame(D * (i + 0.5) / n); ms.push(performance.now() - a); } ms.sort((a, b) => a - b); return { med: ms[n >> 1], max: ms[n - 1] }; }, [n, TL.duration]);
        const a = Date.now(); for (let i = 0; i < 10; i++) await grab(page, TL.duration * i / 10, 'image/jpeg', 0.96);
        console.log(`draw median ${r.med.toFixed(1)} ms, max ${r.max.toFixed(1)} ms; draw+jpeg+transfer ${((Date.now() - a) / 10).toFixed(0)} ms/frame`);
      }
    } else if (mode === 'film') {
      const bdir = path.resolve(opt('build')), workers = +opt('workers', 4), fresh = args.includes('--fresh');
      srv = await serve(bdir); const base = `http://127.0.0.1:${srv.address().port}`;
      const parts = JSON.parse(fs.readFileSync(path.join(bdir, 'parts.json'), 'utf8'));
      const cacheDir = path.join(bdir, 'cache'); fs.mkdirSync(cacheDir, { recursive: true });
      const code = ['web/index.html', 'web/core.js', 'web/look.js', 'web/px.js', 'web/kit.js', 'web/film.js', 'web/scenes.js', 'pipeline/render.mjs']
        .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
      const jobs = [], partSegs = [];
      for (const P of parts) {
        const tlFile = path.join(bdir, `part${P.part}`, 'timeline.json'), TL = JSON.parse(fs.readFileSync(tlFile, 'utf8')), fps = TL.fps;
        const segs = TL.scenes.map((s, i) => {
          const f0 = i === 0 ? 0 : Math.round(s.start * fps), f1 = i === TL.scenes.length - 1 ? Math.round(TL.duration * fps) : Math.round(TL.scenes[i + 1].start * fps);
          const key = crypto.createHash('md5').update(JSON.stringify([fps, f0, f1, TL.duration, TL.part.title, TL.scenes[0].type,
            TL.scenes[i - 1] || null, s, TL.scenes[i + 1] || null, i === TL.scenes.length - 1])).update(code).digest('hex').slice(0, 16);
          return { part: P.part, tlFile, tlUrl: `/b/part${P.part}/timeline.json`, id: `p${P.part}s${String(i).padStart(2, '0')}`, f0, f1, fps,
                   file: path.join(cacheDir, `p${P.part}s${String(i).padStart(2, '0')}_${key}.mp4`) };
        });
        partSegs.push({ P, segs, out: path.join(bdir, `part${P.part}`, 'video.mp4') });
        jobs.push(...segs.filter(s => fresh || !fs.existsSync(s.file)));
      }
      jobs.sort((a, b) => (b.f1 - b.f0) - (a.f1 - a.f0));      // longest first: the pool finishes together
      const total = jobs.reduce((a, s) => a + s.f1 - s.f0, 0), started = Date.now(); let done = 0;
      console.log(`scene segments: ${partSegs.reduce((a, p) => a + p.segs.length, 0)}, to render: ${jobs.length} (${total} frames)`);
      const queue = [...jobs];
      await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, async () => {
        const pages = new Map();
        for (let s; (s = queue.shift());) {
          let page = pages.get(s.part);
          if (!page) { page = await openPage(browser, base, s.tlUrl, s.tlFile); pages.set(s.part, page); }
          const tmp = s.file + '.part.mp4';
          const enc = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(s.fps), '-i', '-',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(s.fps), tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
          const closed = new Promise(r => enc.on('close', r));
          for (let f = s.f0; f < s.f1; f++) {
            const b = b64(await grab(page, f / s.fps, 'image/jpeg', 0.95));
            if (!enc.stdin.write(b)) await new Promise(r => enc.stdin.once('drain', r));
            if (++done % 300 === 0) { const el = (Date.now() - started) / 1000; console.log(`  ${done}/${total} frames, ${el.toFixed(0)}s, ~${(el / done * (total - done)).toFixed(0)}s left`); }
          }
          enc.stdin.end(); await closed; fs.renameSync(tmp, s.file);
        }
        for (const p of pages.values()) await p.close();
      }));
      for (const { segs, out } of partSegs) {
        const list = out + '.txt'; fs.writeFileSync(list, segs.map(s => `file '${s.file}'`).join('\n'));
        await ff(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
      }
      const keep = new Set(partSegs.flatMap(p => p.segs.map(s => path.basename(s.file))));
      for (const f of fs.readdirSync(cacheDir)) if (!keep.has(f)) fs.unlinkSync(path.join(cacheDir, f));
      console.log(`frames done in ${((Date.now() - started) / 1000).toFixed(0)}s (${jobs.length} segment(s) rendered)`);
    } else {
      console.log('modes: film | still | perf');
    }
  } finally { await browser.close(); if (srv) srv.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
