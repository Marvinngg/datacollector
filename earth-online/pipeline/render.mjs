// Render driver.
//   node pipeline/render.mjs still 12.5 30 44.2 [--out build/stills]   -> PNG stills at given seconds
//   node pipeline/render.mjs sheet s3_money [--n 12]                    -> contact sheet of one scene
//   node pipeline/render.mjs cues                                       -> build/cues.json (sound cues from scenes)
//   node pipeline/render.mjs video [--from 0 --to end --workers 4]      -> build/video.mp4 (silent)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
  for (const f of fs.readdirSync(path.join(ROOT, 'web/scenes'))) s += fs.readFileSync(path.join(ROOT, 'web/scenes', f), 'utf8');
  s += '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .,:;!?%/+-=_()[]<>#@&*¥$✓✔·…—「」';
  return [...new Set([...s])].filter(c => c.charCodeAt(0) > 31).join('');
}

async function openPage(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
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

const grab = (page, t, type = 'image/png', q = 0.95) => page.evaluate(([t, type, q]) => { renderFrame(t); return document.getElementById('c').toDataURL(type, q); }, [t, type, q]);
const b64 = d => Buffer.from(d.split(',')[1], 'base64');

async function main() {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--font-render-hinting=none'] });
  const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/timeline.json'), 'utf8'));
  try {
    if (mode === 'still') {
      const out = path.join(ROOT, opt('out', 'build/stills')); fs.mkdirSync(out, { recursive: true });
      const page = await openPage(browser, base);
      for (const ts of positional) {
        const f = path.join(out, `t${(+ts).toFixed(2).padStart(7, '0')}.png`);
        fs.writeFileSync(f, b64(await grab(page, +ts))); console.log(f);
      }
    } else if (mode === 'sheet') {
      // contact sheet: n evenly spaced frames of a scene, tiled 4 across at 480x270
      const sc = TL.scenes.find(s => s.id === positional[0]); const n = +opt('n', 12);
      const out = path.join(ROOT, opt('out', 'build/stills')); fs.mkdirSync(out, { recursive: true });
      const page = await openPage(browser, base);
      const times = Array.from({ length: n }, (_, i) => sc.start + (sc.end - sc.start) * (i + 0.5) / n);
      const shots = []; for (const t of times) shots.push(await grab(page, t, 'image/jpeg', 0.85));
      const png = await page.evaluate(async ([shots, times]) => {
        const cols = 4, w = 480, h = 270, rows = Math.ceil(shots.length / cols);
        const c = document.createElement('canvas'); c.width = cols * w; c.height = rows * (h + 28);
        const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < shots.length; i++) {
          const im = new Image(); im.src = shots[i]; await im.decode();
          const x = (i % cols) * w, y = Math.floor(i / cols) * (h + 28);
          g.drawImage(im, x, y + 28, w, h); g.fillStyle = '#fff'; g.font = '20px monospace'; g.fillText(`t=${times[i].toFixed(2)}s`, x + 8, y + 21);
        }
        return c.toDataURL('image/png');
      }, [shots, times]);
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
      const out = path.join(ROOT, opt('out', 'build/video.mp4'));
      await new Promise(r => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' }).on('close', r));
      console.log(`${out} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
    } else {
      console.log('modes: still | sheet | cues | video');
    }
  } finally { await browser.close(); srv.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
