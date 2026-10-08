/* Look v3: the visual language of the film (after the reference 《进化论》 film).
 * - Material: thousands of Chinese glyphs as particles (cached sprites, optional blur for depth of field)
 * - Light: glow on key glyphs, full-frame bloom, soft light sources
 * - Colour: one grade per episode (background light + tint)
 * - Type: serif display text with a blur-to-sharp reveal; a small mono HUD line for live numbers
 * No panels, no cards, no rounded boxes: if something needs a frame, it is an object in the scene.
 * All functions are deterministic (pure in t) and multiply into the current ctx.globalAlpha (the beat fade). */
(function () {
  const { W, H, ctx, canvas, P, F, clamp, lerp, prog, ease, rng, fbm, vnoise } = K;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });

  // ---------- episode grades ----------
  // base: background colour; light: colour of the soft key light; tint: overlay colour for the whole frame
  const GRADES = {
    e1: { base: '#0a0d16', light: 'rgba(120,140,200,0.20)', lx: 0.30, ly: 0.35, accent: '#e8c77a' },
    e2: { base: '#06110f', light: 'rgba(70,150,120,0.20)', lx: 0.65, ly: 0.30, accent: '#e8c77a' },
    e3: { base: '#060b16', light: 'rgba(80,120,190,0.22)', lx: 0.50, ly: 0.25, accent: '#f0c060' },
    e4: { base: '#120808', light: 'rgba(170,70,50,0.18)', lx: 0.35, ly: 0.30, accent: '#ff9a55' },
    e5: { base: '#110c06', light: 'rgba(200,140,70,0.20)', lx: 0.60, ly: 0.35, accent: '#f2c98a' },
    e6: { base: '#0c0914', light: 'rgba(140,110,200,0.20)', lx: 0.45, ly: 0.30, accent: '#e8c77a' },
    e7: { base: '#0c0a08', light: 'rgba(210,170,110,0.18)', lx: 0.50, ly: 0.60, accent: '#f2c98a' },
  };
  const DEFAULT_GRADE = GRADES.e1;
  function gradeAt(TL, t) {
    const c = TL.chapters.find(c => t >= c.start && t < c.end) || TL.chapters[TL.chapters.length - 1];
    const i = TL.chapters.indexOf(c), g = GRADES[c.id] || DEFAULT_GRADE;
    // cross-fade the grade over the first 1.5 s of an episode
    const prev = i > 0 ? (GRADES[TL.chapters[i - 1].id] || DEFAULT_GRADE) : g;
    return { g, prev, k: ease.inOut(prog(t, c.start, c.start + 1.5)) };
  }
  function background(TL, t) {
    const { g, prev, k } = gradeAt(TL, t);
    const paint = (gr, a) => {
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = gr.base; ctx.fillRect(0, 0, W, H);
      const x = W * (gr.lx + 0.04 * Math.sin(t * 0.05)), y = H * (gr.ly + 0.03 * Math.cos(t * 0.04));
      const rg = ctx.createRadialGradient(x, y, 0, x, y, H * 1.1);
      rg.addColorStop(0, gr.light); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    };
    paint(prev, 1 - k); paint(g, k);
    return g;
  }
  function accent(TL, t) { return gradeAt(TL, t).g.accent; }

  // ---------- glyph sprites ----------
  const sprites = new Map();
  const q = (v, s) => Math.max(s, Math.round(v / s) * s);
  /** sprite for one glyph: size in px, blur in px (depth of field), glow in px (halo) */
  function sprite(ch, size, color, o = {}) {
    size = q(size, 2); const blur = o.blur ? q(o.blur, 1) : 0, glow = o.glow ? q(o.glow, 2) : 0;
    const fam = o.family || F.serif, wt = o.weight || 400;
    const key = `${ch}|${size}|${color}|${fam}|${wt}|${blur}|${glow}`;
    let s = sprites.get(key);
    if (s) return s;
    const pad = Math.ceil(blur * 2.5 + glow * 2 + size * 0.2);
    const cw = size * 1.25 + pad * 2, c = mk(cw, cw), g = c.getContext('2d');
    g.font = `${wt} ${size}px ${fam}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const cx = cw / 2, cy = cw / 2 + size * 0.04;
    if (glow) { g.filter = `blur(${glow}px)`; g.fillStyle = color; g.globalAlpha = 0.9; g.fillText(ch, cx, cy); g.globalAlpha = 1; }
    g.filter = blur ? `blur(${blur}px)` : 'none'; g.fillStyle = color; g.fillText(ch, cx, cy);
    s = { c, w: cw, h: cw }; sprites.set(key, s);
    return s;
  }
  /** draw a glyph centred at x,y */
  function glyph(ch, x, y, size, color, alpha = 1, o = {}) {
    if (alpha <= 0.003) return;
    const s = sprite(ch, size, color, o);
    const sc = o.scale || 1;
    const a0 = ctx.globalAlpha;                 // inherit the beat's fade
    ctx.globalAlpha = a0 * alpha;
    ctx.drawImage(s.c, x - s.w * sc / 2, y - s.h * sc / 2, s.w * sc, s.h * sc);
    ctx.globalAlpha = a0;
  }

  // ---------- serif display text with blur-to-sharp reveal ----------
  /** reveal: 0..1 progress; chars appear left→right, each sharpening from blur 10 → 0 */
  function serif(str, x, y, o = {}) {
    const size = o.size || 56, color = o.color || '#efe9dc', fam = o.family || F.serif, wt = o.weight || 400;
    const align = o.align || 'center', alpha = o.alpha == null ? 1 : o.alpha, glowPx = o.glow == null ? 10 : o.glow;
    const reveal = o.reveal == null ? 1 : o.reveal, sp = o.spacing == null ? size * 0.06 : o.spacing;
    ctx.save(); ctx.font = `${wt} ${size}px ${fam}`;
    const chars = [...str], ws = chars.map(ch => ctx.measureText(ch).width + sp);
    const total = ws.reduce((a, b) => a + b, 0) - sp;
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.restore();
    const hi = o.highlight || [], hiColor = o.hiColor || '#f0c070';
    const hiMask = new Array(chars.length).fill(false);
    for (const h of hi) { let i = str.indexOf(h); while (i >= 0) { for (let k = 0; k < [...h].length; k++) hiMask[i + k] = true; i = str.indexOf(h, i + 1); } }
    chars.forEach((ch, i) => {
      const p = clamp(reveal * (chars.length + 3) - i, 0, 3) / 3;      // per-char 0..1
      if (p <= 0) { cx += ws[i]; return; }
      const e = ease.out(p), blur = (1 - e) * 10;
      const col = hiMask[i] && o.hiOn !== false ? hiColor : color;
      const glowAmt = hiMask[i] ? glowPx * 1.6 : glowPx;
      glyph(ch, cx + ws[i] / 2 - sp / 2, y, size, col, alpha * e, { family: fam, weight: wt, blur: blur > 0.6 ? blur : 0, glow: glowAmt });
      cx += ws[i];
    });
    return total;
  }
  function measureSerif(str, size, o = {}) {
    ctx.save(); ctx.font = `${o.weight || 400} ${size}px ${o.family || F.serif}`;
    const sp = o.spacing == null ? size * 0.06 : o.spacing;
    const w = [...str].reduce((a, ch) => a + ctx.measureText(ch).width + sp, 0) - sp; ctx.restore(); return w;
  }

  // ---------- HUD: one mono line of live numbers (top-left), like "第 99 代 · 本代个体 228 · 累计失败 8,187" ----------
  function hud(items, o = {}) {
    let x = o.x == null ? 96 : o.x; const y = o.y == null ? 86 : o.y, a = o.alpha == null ? 1 : o.alpha;
    items.forEach((it, i) => {
      if (i) { K.text('·', x + 12, y, { size: 28, family: F.mono, color: 'rgba(233,228,216,0.35)', alpha: a }); x += 40; }
      K.text(it.label, x, y, { size: 27, family: F.sans, color: 'rgba(233,228,216,0.6)', alpha: a });
      x += K.measure(it.label, { size: 27, family: F.sans }) + 12;
      K.text(String(it.value), x, y, { size: 32, family: F.mono, color: it.color || '#efe9dc', alpha: a, glow: it.glow ? 12 : 0 });
      x += K.measure(String(it.value), { size: 32, family: F.mono }) + 10;
    });
  }

  // ---------- ambient glyph field: a slow, deep layer of faint characters (texture + depth) ----------
  function field(t, o = {}) {
    const n = o.n || 160, chars = o.chars || '局', seed = o.seed || 1, r = rng(seed);
    const pts = []; for (let i = 0; i < n; i++) pts.push([r(), r(), r(), r()]);
    const a0 = o.alpha == null ? 0.25 : o.alpha, col = o.color || '#9fb4c8';
    for (let i = 0; i < n; i++) {
      const [u, v, d, c] = pts[i];
      const depth = 0.35 + d * 0.65;                         // 0.35 far … 1 near
      const x = ((u * W + t * 6 * depth + fbm(u * 3, v * 3 + t * 0.02) * 60) % (W + 80)) - 40;
      const y = v * H + Math.sin(t * 0.2 * depth + u * 9) * 10;
      const size = 14 + depth * 26, blur = (1 - depth) * 5;
      const ch = chars[Math.floor(c * chars.length) % chars.length];
      glyph(ch, x, y, size, col, a0 * depth * (0.6 + 0.4 * Math.sin(t * 0.5 + i)), { blur });
    }
  }

  // ---------- soft light point (bokeh / spark) ----------
  function light(x, y, r, color, alpha = 1) {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha *= alpha; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  // ---------- full-frame bloom ----------
  let b1 = null, b2 = null;
  function bloom(strength = 0.5) {
    const w = W / 4, h = H / 4;
    b1 = b1 || mk(w, h); b2 = b2 || mk(w, h);
    const g1 = b1.getContext('2d'), g2 = b2.getContext('2d');
    g1.globalCompositeOperation = 'copy'; g1.filter = 'brightness(0.9) contrast(2.2)'; g1.drawImage(canvas, 0, 0, w, h);
    g2.globalCompositeOperation = 'copy'; g2.filter = 'blur(6px)'; g2.drawImage(b1, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = strength; ctx.drawImage(b2, 0, 0, W, H); ctx.restore();
  }

  window.L = { GRADES, background, accent, gradeAt, sprite, glyph, serif, measureSerif, hud, field, light, bloom };
})();
