// Render driver.
//   node pipeline/render.mjs still 12.5 30 44.2 [--out build/stills]   -> PNG stills at given seconds
//   node pipeline/render.mjs sheet c3 [--n 12]                          -> contact sheet of one chapter (or a beat id)
//   node pipeline/render.mjs cues                                       -> build/cues.json (sound cues from scenes)
//   node pipeline/render.mjs video [--from 0 --to end --workers 4]      -> build/video.mp4 (silent)
//   node pipeline/render.mjs film [--workers 4] [--fresh]               -> build/video.mp4, re-rendering only scenes that changed
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
const positional = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !(arr[i - 1] || '').startsWith('--'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

// every character that may be drawn, so web-font subsets are loaded before capture
function allChars() {
  let s = fs.readFileSync(path.join(ROOT, 'build/timeline.json'), 'utf8');
  for (const f of fs.readdirSync(path.join(ROOT, 'web/templates'))) s += fs.readFileSync(path.join(ROOT, 'web/templates', f), 'utf8');
  s += fs.readFileSync(path.join(ROOT, 'web/film.js'), 'utf8');
  s += '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .,:;!?%/+-=_()[]<>#@&*¥$✓✔·…—「」';
  return [...new Set([...s])].filter(c => c.charCodeAt(0) > 31).join('');
}

async function openPage(browser, base) {
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(base + '/web/index.html');
  await page.evaluate(async (chars) => {
    await E.ready;
    const faces = ['300 40px "Noto Sans SC"', '400 40px "Noto Sans SC"', '500 40px "Noto Sans SC"', '700 40px "Noto Sans SC"',
      '400 40px "Noto Serif SC"', '600 40px "Noto Serif SC"', '300 40px "JetBrains Mono"', '400 40px "JetBrains Mono"', '700 40px "JetBrains Mono"',
      '400 40px "LXGW WenKai"'];
    for (const f of faces) await document.fonts.load(f, chars);
    await document.fonts.ready;
  }, allChars());
  return page;
}

let VW = 1080, VH = 1920;
const grab = (page, t, type = 'image/png', q = 0.95) => page.evaluate(([t, type, q]) => { renderFrame(t); return document.getElementById('c').toDataURL(type, q); }, [t, type, q]);
const b64 = d => Buffer.from(d.split(',')[1], 'base64');

async function main() {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--font-render-hinting=none'] });
  const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/timeline.json'), 'utf8'));
  VW = TL.width; VH = TL.height;
  try {
    if (mode === 'still') {
      const out = path.resolve(ROOT, opt('out', 'build/stills')); fs.mkdirSync(out, { recursive: true });
      const page = await openPage(browser, base);
      for (const ts of positional) {
        const f = path.join(out, `t${(+ts).toFixed(2).padStart(7, '0')}.png`);
        fs.writeFileSync(f, b64(await grab(page, +ts))); console.log(f);
      }
    } else if (mode === 'sheet') {
      // contact sheet: n evenly spaced frames of a scene, tiled 4 across at 480x270
      const sc = TL.chapters.find(s => s.id === positional[0]) || TL.beats.find(s => s.id === positional[0]); const n = +opt('n', 12);
      const out = path.resolve(ROOT, opt('out', 'build/stills')); fs.mkdirSync(out, { recursive: true });
      const page = await openPage(browser, base);
      const times = Array.from({ length: n }, (_, i) => sc.start + (sc.end - sc.start) * (i + 0.5) / n);
      const shots = []; for (const t of times) shots.push(await grab(page, t, 'image/jpeg', 0.85));
      const png = await page.evaluate(async ([shots, times, TLW, TLH]) => {
        const vert = TLH > TLW, cols = vert ? 6 : 4, w = vert ? 270 : 480, h = vert ? 480 : 270, rows = Math.ceil(shots.length / cols);
        const c = document.createElement('canvas'); c.width = cols * w; c.height = rows * (h + 28);
        const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < shots.length; i++) {
          const im = new Image(); im.src = shots[i]; await im.decode();
          const x = (i % cols) * w, y = Math.floor(i / cols) * (h + 28);
          g.drawImage(im, x, y + 28, w, h); g.fillStyle = '#fff'; g.font = '20px monospace'; g.fillText(`t=${times[i].toFixed(2)}s`, x + 8, y + 21);
        }
        return c.toDataURL('image/png');
      }, [shots, times, TL.width, TL.height]);
      const f = path.join(out, `sheet_${sc.id}.png`); fs.writeFileSync(f, b64(png)); console.log(f);
    } else if (mode === 'cues') {
      const page = await openPage(browser, base);
      const cues = await page.evaluate(() => allCues());
      fs.writeFileSync(path.join(ROOT, 'build/cues.json'), JSON.stringify(cues, null, 1));
      console.log(`build/cues.json: ${cues.length} cues`);
    } else if (mode === 'video') {
      const fps = TL.fps, from = +opt('from', 0), to = +opt('to', TL.duration), workers = +opt('workers', 4);
      const n0 = Math.round(from * fps), n1 = Math.round(to * fps), per = Math.ceil((n1 - n0) / workers);
      const segDir = path.join(ROOT, 'build/segments'); fs.mkdirSync(segDir, { recursive: true });
      const started = Date.now(); let done = 0;
      const jobs = Array.from({ length: workers }, async (_, w) => {
        const a = n0 + w * per, b = Math.min(n1, a + per); if (a >= b) return null;
        const page = await openPage(browser, base);
        const seg = path.join(segDir, `seg${w}.mp4`);
        const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(fps), seg], { stdio: ['pipe', 'inherit', 'inherit'] });
        for (let f = a; f < b; f++) {
          const buf = b64(await grab(page, f / fps, 'image/jpeg', 0.96));
          if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
          if (++done % 150 === 0) console.log(`${done}/${n1 - n0} frames, ${((Date.now() - started) / 1000).toFixed(0)}s`);
        }
        ff.stdin.end(); await new Promise(r => ff.on('close', r)); await page.close();
        return seg;
      });
      const segs = (await Promise.all(jobs)).filter(Boolean);
      const list = path.join(segDir, 'list.txt'); fs.writeFileSync(list, segs.map(s => `file '${s}'`).join('\n'));
      const out = path.resolve(ROOT, opt('out', 'build/video.mp4'));
      await new Promise(r => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' }).on('close', r));
      console.log(`${out} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
    } else if (mode === 'film') {
      // whole film, cached per scene: a scene is re-rendered only when its own data (times, steps, voices, text),
      // its template file or the shared runtime changed. --fresh ignores the cache.
      const fps = TL.fps, workers = +opt('workers', 4), fresh = args.includes('--fresh');
      const cacheDir = path.join(ROOT, 'build/scene_cache'); fs.mkdirSync(cacheDir, { recursive: true });
      const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
      const shared = ['web/index.html', 'web/core.js', 'web/look.js', 'web/px.js', 'web/film.js', 'web/kit.js'].filter(f => fs.existsSync(path.join(ROOT, f))).map(read).join('\n');
      const tfiles = fs.readdirSync(path.join(ROOT, 'web/templates')).map(f => 'web/templates/' + f);
      const fileOf = type => tfiles.filter(f => read(f).includes(`T.register('${type}'`)).map(read).join('\n');
      const root = b => b.visual.ref || b.id;
      const segs = TL.beats.map((b, i) => {
        const f0 = Math.round(b.start * fps), f1 = i === TL.beats.length - 1 ? Math.round(TL.duration * fps) : Math.round(TL.beats[i + 1].start * fps);
        const chain = TL.beats.filter(x => root(x) === root(b));
        const key = crypto.createHash('md5').update(JSON.stringify([fps, TL.width, TL.height, f0, f1, i === TL.beats.length - 1 ? TL.duration : 0, chain]))
          .update(shared).update(fileOf(b.visual.type)).digest('hex').slice(0, 16);
        return { id: b.id, f0, f1, file: path.join(cacheDir, `${b.id}_${key}.mp4`) };
      });
      const todo = segs.filter(s => fresh || !fs.existsSync(s.file)).sort((a, b) => (b.f1 - b.f0) - (a.f1 - a.f0));
      console.log(`scenes: ${segs.length}, to render: ${todo.length} (${todo.map(s => s.id).join(' ') || 'none'})`);
      const started = Date.now(); let done = 0; const total = todo.reduce((a, s) => a + s.f1 - s.f0, 0);
      const queue = [...todo];
      await Promise.all(Array.from({ length: Math.min(workers, todo.length) }, async () => {
        const page = await openPage(browser, base);
        for (let s; (s = queue.shift());) {
          const tmp = s.file + '.part.mp4';
          const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(fps), tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
          for (let f = s.f0; f < s.f1; f++) {
            const buf = b64(await grab(page, f / fps, 'image/jpeg', 0.96));
            if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
            if (++done % 150 === 0) console.log(`${done}/${total} frames, ${((Date.now() - started) / 1000).toFixed(0)}s`);
          }
          ff.stdin.end(); await new Promise(r => ff.on('close', r)); fs.renameSync(tmp, s.file);
          console.log(`  ${s.id} done`);
        }
        await page.close();
      }));
      const list = path.join(cacheDir, 'list.txt'); fs.writeFileSync(list, segs.map(s => `file '${s.file}'`).join('\n'));
      const out = path.resolve(ROOT, opt('out', 'build/video.mp4'));
      await new Promise(r => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' }).on('close', r));
      // drop cache entries no scene uses any more
      const keep = new Set(segs.map(s => path.basename(s.file)));
      for (const f of fs.readdirSync(cacheDir)) if (f.endsWith('.mp4') && !keep.has(f)) fs.unlinkSync(path.join(cacheDir, f));
      console.log(`${out} (${((Date.now() - started) / 1000).toFixed(0)}s, ${todo.length} scene(s) rendered)`);
    } else {
      console.log('modes: still | sheet | cues | video | film');
    }
  } finally { await browser.close(); srv.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
