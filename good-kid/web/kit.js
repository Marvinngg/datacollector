/* KIT — the shared look and the shared world of 《打分的人走了》.
 *   BG(TL, t)        background: a deep night, one soft light per chapter (window.BG; film.js calls it)
 *   KIT.C            colours (CSS);  KIT.L light colours ([r,g,b] 0..1 for PX)
 *   KIT.you          the protagonist: the glyph 你 as a particle body, lit from outside or from within
 *   KIT.spot         a spotlight cone from above (somebody else's lamp)
 *   KIT.sheet        the answer sheet (答题卡): a fine line-art grid of bubbles, filled or not, grey or not
 *   KIT.pen          the scorer's red pen: ✓ / circle / underline / cross / "100", drawn stroke by stroke
 *   KIT.caption      the film's voice: one or two serif lines at a fixed place, revealed calmly
 *   KIT.type, KIT.odo  kinetic type and an odometer (from the previous film)
 *   KIT.beat         the cut follows the score: 72 BPM, 1 beat = 0.8333 s
 * Every function is a pure function of its arguments and multiplies into ctx.globalAlpha (the beat's fade). */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- colours
  const C = {
    bg: '#06080d', ink: '#ece7dc', dim: 'rgba(236,231,220,0.56)', faint: 'rgba(236,231,220,0.22)', line: 'rgba(236,231,220,0.16)',
    warm: '#ffc985',       // your own light (amber, small, alive)
    lamp: '#dfe8ff',       // other people's lamps (cold white-blue)
    red: '#e5484d',        // the scorer's red pen
    gray: '#8a8f98',       // the grey answer sheet of a life done right
    screen: '#9fc2ff',     // phone light at 1 a.m.
    free: '#ff9a5c',       // their freedom: wind, fire, motion (warm orange)
    gold: '#f2c46d',       // honours, rank #1, 奖状
    cyan: '#6fe0d2',       // (machine colour, rarely used)
  };
  const rgb = hex => { const v = parseInt(hex.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
  const LC = Object.fromEntries(Object.entries(C).filter(([, v]) => v[0] === '#').map(([k, v]) => [k, rgb(v)]));

  // ---------------------------------------------------------------- background
  const GRADE = {
    e0: { light: [80, 120, 200], a: 0.08, x: 0.5, y: 0.40 },     // 1 a.m., phone light
    e1: { light: [220, 225, 255], a: 0.06, x: 0.5, y: 0.20 },    // school lamps from above
    e2: { light: [255, 190, 120], a: 0.06, x: 0.5, y: 0.45 },    // praise as warmth
    e3: { light: [255, 140, 80], a: 0.06, x: 0.5, y: 0.40 },     // their freedom
    e4: { light: [180, 190, 210], a: 0.05, x: 0.5, y: 0.35 },    // bills, receipts, no examiner
    e5: { light: [90, 110, 150], a: 0.06, x: 0.5, y: 0.70 },     // the drop
    e6: { light: [255, 200, 140], a: 0.08, x: 0.5, y: 0.55 },    // your own lamp
  };
  const bgCache = new Map();
  function bgLight(g) {
    const key = g.light.join(',') + g.a + g.x + g.y; let c = bgCache.get(key); if (c) return c;
    c = mk(W / 4, H / 4); const x = c.getContext('2d');
    const r = x.createRadialGradient(c.width * g.x, c.height * g.y, 0, c.width * g.x, c.height * g.y, c.height * 0.75);
    r.addColorStop(0, `rgba(${g.light},${g.a})`); r.addColorStop(0.5, `rgba(${g.light},${g.a * 0.35})`); r.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = r; x.fillRect(0, 0, c.width, c.height); bgCache.set(key, c); return c;
  }
  function BG(TL, t) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const chs = TL.chapters, i = Math.max(0, chs.findIndex(c => t >= c.start && t < c.end));
    const cur = GRADE[chs[i] && chs[i].id] || GRADE.e0, prev = i > 0 ? (GRADE[chs[i - 1].id] || cur) : cur;
    const k = i > 0 ? ease.inOut(prog(t, chs[i].start, chs[i].start + 2)) : 1;
    ctx.save(); ctx.imageSmoothingEnabled = true;
    if (k < 1) { ctx.globalAlpha = 1 - k; ctx.drawImage(bgLight(prev), 0, 0, W, H); }
    ctx.globalAlpha = k; ctx.drawImage(bgLight(cur), 0, 0, W, H); ctx.restore();
  }
  window.BG = BG;

  // ---------------------------------------------------------------- kinetic type
  /** one line of text with an entrance. o:
   *    size, family (F.serif), weight (600), color, alpha, align ('center'), spacing
   *    k      entrance progress 0..1 (drive it with prog(lt, start, start + d))
   *    mode   'rise'  (default) chars rise and sharpen in sequence
   *           'blur'  L.serif blur-to-sharp
   *           'punch' whole line slams in from 1.35x scale with a flash
   *           'scramble' chars decode from random glyphs (machine-like)
   *           'type'  typewriter with a caret
   *    out    exit progress 0..1 (fades and drifts up)
   *    glow   glow px (default 0)
   *  returns the line width */
  const SCR = '0123456789%×÷=:ABCDEFGHJKLMNPRSTUVWXYZ赔率概率世界证据似然先验后验';
  function type(str, x, y, o = {}) {
    const size = o.size || 64, fam = o.family || F.serif, wt = o.weight || 600, col = o.color || C.ink, align = o.align || 'center';
    const k = o.k == null ? 1 : o.k, out = o.out || 0, mode = o.mode || 'rise', sp = o.spacing == null ? size * 0.04 : o.spacing;
    const a0 = (o.alpha == null ? 1 : o.alpha) * (1 - ease.in(out)); if (a0 <= 0.002 || k <= 0) return 0;
    const fo = { size, family: fam, weight: wt, color: col, spacing: sp, glow: o.glow || 0, glowColor: o.glowColor };
    const chars = [...str], ws = chars.map(ch => measure(ch, fo) + sp), tw = ws.reduce((a, b) => a + b, 0) - sp;
    let cx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    const dy = -ease.in(out) * size * 0.4;
    if (mode === 'blur') { L.serif(str, x, y + dy, { size, family: fam, weight: wt, color: col, alpha: a0, reveal: k, align, spacing: sp, glow: o.glow || 0 }); return tw; }
    if (mode === 'punch') {
      const s = lerp(1.35, 1, ease.outExpo(k)), a = a0 * clamp(k * 3);
      ctx.save(); ctx.translate(align === 'center' ? x : cx + tw / 2, y + dy); ctx.scale(s, s);
      text(str, 0, 0, { ...fo, align: 'center', alpha: a });
      if (k < 0.35) text(str, 0, 0, { ...fo, align: 'center', color: '#fff', alpha: a * (1 - k / 0.35) * 0.8, glow: 30, glowColor: col });
      ctx.restore(); return tw;
    }
    const n = chars.length;
    chars.forEach((ch, i) => {
      const w = ws[i];
      if (mode === 'type') {
        if (k * n >= i + 1) text(ch, cx, y + dy, { ...fo, alpha: a0 });
      } else if (mode === 'scramble') {
        const p = clamp(k * (n + 4) - i, 0, 4) / 4;
        if (p > 0) {
          const settled = p >= 1, f = Math.floor((o.t || 0) * 24 + i * 7);
          const g = settled ? ch : SCR[(f * 31 + i * 17) % SCR.length];
          text(g, cx + (settled ? 0 : 0), y + dy, { ...fo, color: settled ? col : (o.scrambleColor || C.cyan), alpha: a0 * (settled ? 1 : 0.4 + 0.6 * p), family: settled ? fam : F.mono });
        }
      } else {                                              // rise
        const p = clamp(k * (n + 5) - i, 0, 5) / 5, e = ease.out(p);
        if (p > 0) text(ch, cx, y + dy + (1 - e) * size * 0.35, { ...fo, alpha: a0 * e });
      }
      cx += w;
    });
    if (mode === 'type' && k < 1.2 && o.caret !== false) {
      const shown = ws.slice(0, Math.min(n, Math.floor(k * n))).reduce((a, b) => a + b, 0);
      const x0 = (align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x) + shown;
      if (Math.floor((o.t || 0) * 2.4) % 2 === 0 || k < 1) { ctx.save(); ctx.globalAlpha *= a0; ctx.fillStyle = col; ctx.fillRect(x0 + 4, y + dy - size * 0.82, Math.max(3, size * 0.06), size * 0.95); ctx.restore(); }
    }
    return tw;
  }

  /** odometer: draws value (a number) as rolling digit columns. o: size, family (F.mono), weight, color, decimals (0),
   *  suffix ('%'), align ('center'), alpha, glow. Fractional parts make the last digit roll smoothly between values. */
  function odo(value, x, y, o = {}) {
    const size = o.size || 120, fam = o.family || F.mono, wt = o.weight || 700, col = o.color || C.ink, dec = o.decimals || 0;
    const a0 = o.alpha == null ? 1 : o.alpha; if (a0 <= 0) return;
    const v = Math.max(0, value), whole = Math.floor(v * Math.pow(10, dec)), frac = v * Math.pow(10, dec) - whole;
    const digits = String(whole).padStart(dec + 1, '0').split('');
    const fo = { size, family: fam, weight: wt, color: col, glow: o.glow || 0, glowColor: o.glowColor };
    const dw = measure('0', fo), suf = o.suffix == null ? '%' : o.suffix, sw = suf ? measure(suf, { ...fo, size: size * 0.6 }) + size * 0.08 : 0;
    const dotw = dec ? dw * 0.5 : 0, tw = digits.length * dw + dotw + sw;
    let cx = (o.align || 'center') === 'center' ? x - tw / 2 : o.align === 'right' ? x - tw : x;
    ctx.save(); ctx.globalAlpha *= a0;
    ctx.beginPath(); ctx.rect(cx - 10, y - size * 0.95, tw + 20, size * 1.15); ctx.clip();
    for (let i = 0; i < digits.length; i++) {
      if (dec && i === digits.length - dec) { text('.', cx + dotw * 0.1, y, { ...fo }); cx += dotw; }
      const d = +digits[i];
      // a column rolls only when every column to its right is about to wrap (all 9s), like a real counter
      let roll = 0; const rest = digits.slice(i + 1);
      if (rest.every(c => c === '9')) roll = ease.inOut(frac);
      if (i === digits.length - 1) roll = ease.inOut(frac);
      const yo = roll * size * 1.1;
      text(String(d), cx, y - yo, fo);
      text(String((d + 1) % 10), cx, y - yo + size * 1.1, fo);
      cx += dw;
    }
    ctx.restore();
    if (suf) text(suf, cx + size * 0.06, y, { ...fo, size: size * 0.6, alpha: a0 });
  }

  // ---------------------------------------------------------------- the protagonist: 你
  /* you(x, y, size, o): the glyph 你 (Noto Serif SC 600) as a body of particles, centred at (x, y), glyph height ≈ size.
     o: lit     0..1 light falling on you from outside (cold lamp white): this is the borrowed light
        own     0..1 light from within (warm amber): the light that is yours
        gray    0..1 drains colour (a grey life)
        a       overall intensity (default 1)
        breathe 0..1 a slow living shimmer (default 0.4)
        drift   px of dissolve (particles wander away; 0 = solid)
        rot     radians, scale (default 1), t (seconds, for shimmer)
     Draw between PX.begin() and PX.flush(). Returns the cloud (local coords) if you want to morph it. */
  function youCloud(size) {
    const s = q(size, 20);
    return PX.text('你', { size: s, family: F.serif, weight: 600, x: 0, y: s * 0.38, step: Math.max(1.4, s / 120), seed: 17 });
  }
  const q = (v, s) => Math.max(s, Math.round(v / s) * s);
  function you(x, y, size, o = {}) {
    const cl = youCloud(size), n = cl.n, sc = (o.scale || 1) * size / q(size, 20), out = PX.buf(n, 900 + (o.tag || 0));
    const t = o.t || 0, br = o.breathe == null ? 0.4 : o.breathe, dr = o.drift || 0, rot = o.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const r1 = PX.rand(i, 21), r2 = PX.rand(i, 22);
      let px = cl.X[i] * sc, py = cl.Y[i] * sc;
      px += Math.sin(t * (1.1 + r1) + r2 * 30) * br * 1.6 + Math.cos(r1 * 40) * dr * (0.3 + r2);
      py += Math.cos(t * (0.9 + r2) + r1 * 30) * br * 1.6 + Math.sin(r2 * 40) * dr * (0.3 + r1) - dr * 0.3 * r1;
      out.X[i] = x + px * cs - py * sn; out.Y[i] = y + px * sn + py * cs;
    }
    const lit = o.lit || 0, own = o.own || 0, gray = o.gray || 0, a = o.a == null ? 1 : o.a;
    const base = [0.62, 0.64, 0.68];                                  // unlit: a dim grey figure
    const col = [0, 1, 2].map(k => {
      let v = base[k] * 0.55 * (1 - 0.7 * own) + LC.lamp[k] * lit * 0.9 + LC.warm[k] * own * 1.25;
      const lum = 0.3 * base[0] + 0.59 * base[1] + 0.11 * base[2];
      return lerp(v, lum * (0.55 + lit * 0.9 + own), gray);
    });
    PX.points(out.X, out.Y, n, col, { a: 0.34 * a * (0.55 + 0.6 * lit + 0.7 * own), glow: 0.25 + 0.4 * own });
    return out;
  }

  // ---------------------------------------------------------------- somebody else's lamp
  /* spot(x, y, o): a spotlight from above whose pool lands at (x, y). o: k 0..1 (on), w (pool half-width, 160),
     h (cone height, 900), color (CSS rgb triplet string, default lamp white), dust (0..1), t (for the dust).
     Soft cone + floor pool, drawn with gradients (cheap); dust motes as PX points if PX is open (o.px=true). */
  function spot(x, y, o = {}) {
    const k = o.k == null ? 1 : o.k; if (k <= 0) return;
    const w = o.w || 160, h = o.h || 900, col = o.color || '223,232,255', top = y - h, tw = w * 0.18;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= k;
    const g = ctx.createLinearGradient(0, top, 0, y);
    g.addColorStop(0, `rgba(${col},0.16)`); g.addColorStop(0.7, `rgba(${col},0.07)`); g.addColorStop(1, `rgba(${col},0.10)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - tw, top); ctx.lineTo(x + tw, top); ctx.lineTo(x + w, y); ctx.lineTo(x - w, y); ctx.closePath(); ctx.fill();
    const p = ctx.createRadialGradient(x, y, 0, x, y, w * 1.15); p.addColorStop(0, `rgba(${col},0.22)`); p.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = p; ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.22); ctx.beginPath(); ctx.arc(0, 0, w * 1.15, 0, TAU); ctx.fill(); ctx.restore();
    ctx.restore();
    if (o.px && (o.dust == null || o.dust > 0)) {                      // dust in the beam
      const n = 220, out = PX.buf(n, 950 + (o.tag || 0)), t = o.t || 0;
      for (let i = 0; i < n; i++) {
        const v = (PX.rand(i, 31) + t * 0.02 * (0.4 + PX.rand(i, 32))) % 1, yy = top + v * h, half = lerp(tw, w, v);
        out.X[i] = x + (PX.rand(i, 33) * 2 - 1) * half * 0.9 + Math.sin(t * 0.7 + i) * 4; out.Y[i] = yy; out.A[i] = 0.3 + 0.7 * PX.rand(i, 34);
      }
      PX.points(out.X, out.Y, n, (o.dustColor || LC.lamp), { a: 0.5 * k * (o.dust == null ? 1 : o.dust), A: out.A, glow: 0.2 });
    }
  }

  // ---------------------------------------------------------------- the answer sheet
  /* sheet(x, y, w, h, o): an answer sheet (答题卡) seen flat, top-left (x, y). Fine line art: a header rule, rows of
     numbered questions with four bubbles A B C D. o: rows (20), fill 0..1 (how many rows answered, in order),
     answer(i) -> 0..3 (which bubble; default a seeded "correct" one), gray 0..1, k 0..1 (draw-on progress),
     color (line colour), ink (filled bubble colour), title (small header text), marks (show red ✓ per filled row: 0..1) */
  function sheet(x, y, w, h, o = {}) {
    const rows = o.rows || 20, k = o.k == null ? 1 : o.k, fill = o.fill || 0, gray = o.gray || 0;
    const line = o.color || C.line, ink = o.ink || C.ink, r = rng(77);
    const ans = o.answer || (i => Math.floor(PX.rand(i, 77) * 4));
    ctx.save(); ctx.globalAlpha *= k;
    ctx.strokeStyle = line; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w * Math.min(1, k * 1.5), h);
    const hy = y + 70; ctx.beginPath(); ctx.moveTo(x, hy); ctx.lineTo(x + w * k, hy); ctx.stroke();
    if (o.title) text(o.title, x + 24, y + 46, { size: 26, family: F.sans, weight: 500, color: C.dim, spacing: 4 });
    const rh = (h - 100) / rows, bx0 = x + 120, bw = (w - 170) / 4;
    for (let i = 0; i < rows; i++) {
      const yy = hy + 20 + rh * (i + 0.5), rk = clamp(k * rows * 1.2 - i);
      if (rk <= 0) continue;
      ctx.globalAlpha = rk * (o.alpha == null ? 1 : o.alpha) * ctx.globalAlpha;
      text(String(i + 1).padStart(2, '0'), x + 30, yy + 9, { size: 24, family: F.mono, color: C.faint });
      const filled = fill * rows - i, fa = clamp(filled);
      for (let c = 0; c < 4; c++) {
        const cx = bx0 + bw * (c + 0.5);
        ctx.beginPath(); ctx.ellipse(cx, yy, 22, Math.min(13, rh * 0.32), 0, 0, TAU); ctx.strokeStyle = line; ctx.stroke();
        text('ABCD'[c], cx, yy + 7, { size: 18, family: F.mono, color: C.faint, align: 'center', alpha: 1 - fa * (c === ans(i) ? 1 : 0) });
        if (c === ans(i) && fa > 0) {
          const col = gray > 0 ? mixHex(ink, C.gray, gray) : ink;
          ctx.save(); ctx.globalAlpha *= fa; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, yy, 21 * fa, Math.min(12, rh * 0.3) * fa, 0, 0, TAU); ctx.fill(); ctx.restore();
        }
      }
      if (o.marks && fa > 0) pen('check', x + w - 40, yy, 26, clamp((o.marks * rows - i) * 1.0) * fa, { gray });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function mixHex(a, b, k) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(255 * lerp(v, B[i], k))).join(',')})`; }

  // ---------------------------------------------------------------- the scorer's red pen
  /* pen(kind, x, y, size, k, o): a hand-drawn red mark revealed stroke by stroke (k 0..1).
     kind: 'check' ✓ | 'cross' ✗ | 'circle' | 'underline' (size = length) | 'score' (o.text, e.g. '100' — written
     with a slanted hand and underlined twice) | 'strike' (line through, size = length).
     o: color (C.red), width (px, default size/9), gray 0..1, seed. Slight wobble so it never looks typeset. */
  function pen(kind, x, y, size, k, o = {}) {
    if (k <= 0) return;
    const col = o.gray ? mixHex(o.color || C.red, C.gray, o.gray) : (o.color || C.red), lw = o.width || Math.max(2.5, size / 9), r = rng(o.seed || 5);
    const wob = () => (r() - 0.5) * size * 0.06;
    let pts;
    if (kind === 'check') pts = [[-0.45, 0.0], [-0.12, 0.38], [0.55, -0.5]];
    else if (kind === 'cross') pts = [[-0.4, -0.4], [0.4, 0.4], null, [0.42, -0.42], [-0.38, 0.4]];
    else if (kind === 'underline' || kind === 'strike') pts = [[-0.5, 0], [-0.1, 0.03], [0.5, -0.02]];
    else if (kind === 'circle') { pts = []; for (let i = 0; i <= 28; i++) { const a = -1.9 + i / 28 * TAU * 1.08; pts.push([Math.cos(a) * 0.55 * (1 + (i > 26 ? 0.06 : 0)), Math.sin(a) * 0.42]); } }
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = lw;
    if (kind === 'score') {
      const s = o.text || '100';
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12);
      ctx.beginPath(); ctx.rect(-size * 2, -size * 1.2, size * 4 * clamp(k * 1.6), size * 2); ctx.clip();
      text(s, 0, 0, { size, family: F.hand, color: col, align: 'center' }); ctx.restore();
      const u = clamp(k * 1.6 - 0.6);
      if (u > 0) { pen('underline', x, y + size * 0.25, size * 1.6 * u, 1, { color: col, width: lw * 0.7, seed: 8 }); pen('underline', x + 6, y + size * 0.38, size * 1.4 * clamp(u * 1.4 - 0.4), 1, { color: col, width: lw * 0.6, seed: 9 }); }
      ctx.restore(); return;
    }
    // total length, then draw up to k of it
    const segs = []; let L = 0, prev = null;
    for (const p of pts) { if (!p) { prev = null; continue; } const P = [x + p[0] * size + wob(), y + p[1] * size + wob()]; if (prev) { const d = Math.hypot(P[0] - prev[0], P[1] - prev[1]); segs.push([prev, P, d]); L += d; } prev = P; }
    let left = L * k; ctx.beginPath();
    for (const [a, b, d] of segs) {
      if (left <= 0) break; const f = Math.min(1, left / d); ctx.moveTo(a[0], a[1]); ctx.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f)); left -= d;
    }
    ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- the voice of the film
  /* caption(lines, k, o): the film's sentences. One or two lines (array), serif 54 px, centred, at a fixed place
     (default the lower third, first line baseline y = 1460; o.y overrides; o.at = 'mid' puts it at y 960).
     k: reveal 0..1 (chars rise and sharpen in order, calm); o.out: exit 0..1; o.hi: substrings to colour (o.hiColor);
     o.size, o.color, o.family (F.serif; F.hand for intimate lines), o.gap (line spacing, default 1.55 x size). */
  function caption(lines, k, o = {}) {
    if (k <= 0) return; lines = Array.isArray(lines) ? lines : [lines];
    const size = o.size || 54, gap = o.gap || size * 1.55, y0 = o.y || (o.at === 'mid' ? 960 - (lines.length - 1) * gap / 2 : 1460);
    const total = lines.reduce((a, l) => a + [...l].length, 0); let done = 0;
    lines.forEach((l, i) => {
      const n = [...l].length, kk = clamp((k * (total + 4) - done) / (n + 4));
      done += n;
      if (kk <= 0) return;
      if (o.hi && o.hi.length) {
        L.serif(l, o.x || W / 2, y0 + i * gap, { size, family: o.family || F.serif, weight: o.weight || 400, color: o.color || C.ink, reveal: kk,
          alpha: (o.alpha == null ? 1 : o.alpha) * (1 - ease.in(o.out || 0)), glow: o.glow == null ? 4 : o.glow, highlight: o.hi, hiColor: o.hiColor || C.warm, spacing: o.spacing });
      } else {
        type(l, o.x || W / 2, y0 + i * gap, { size, family: o.family || F.serif, weight: o.weight || 400, color: o.color || C.ink, k: kk, out: o.out || 0,
          alpha: o.alpha, mode: 'rise', spacing: o.spacing });
      }
    });
  }

  // ---------------------------------------------------------------- beat helpers
  const BPM = 72, BEAT = 60 / BPM;
  const beat = { BPM, BEAT, pulse: (t, decay = 6) => Math.exp(-((t % BEAT + BEAT) % BEAT) * decay) };
  const at = (api, name) => { const s = api.steps.find(s => s.show === name); return s ? s.lt : 1e9; };
  const stepK = (api, lt, name, d = 0.6, e = ease.out) => { const s = api.steps.find(s => s.show === name); return s ? e(prog(lt, s.lt, s.lt + (d === 'dur' ? s.dur : d))) : 0; };
  const stepDur = (api, name) => { const s = api.steps.find(s => s.show === name); return s ? s.dur : 0; };

  window.KIT = { C, L: LC, rgb, GRADE, type, odo, you, spot, sheet, pen, caption, beat, at, stepK, stepDur };
})();
