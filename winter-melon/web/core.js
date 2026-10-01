/* Drawing kit shared by every template: palette P, fonts F, easing, deterministic noise, text & panels.
 * Copied from earth-online/web/engine.js so this project stands alone. */
(function () {
  const canvas0 = document.getElementById("c"), W = canvas0.width, H = canvas0.height;   // size comes from index.html (vertical 1080x1920 here)
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  // ---------- palette & fonts ----------
  const P = {
    bg: '#0a0d13',        // ink night
    bg2: '#10151e',
    ink: '#e9e4d8',       // warm paper white (main text)
    dim: '#8a909b',       // secondary text
    faint: '#4a505b',     // disabled / grey-out
    line: '#2a313d',      // hairlines, grid
    gold: '#d8b25c',      // player 甲 / emphasis
    ember: '#ff9a55',     // the spark (fascination)
    warm: '#f2c98a',      // other players' warmth
    teal: '#6fd6c8',      // player 乙
    red: '#e0766a',       // loss / defect / danger
    blue: '#7fa7e0',      // neutral option
    ok: '#8fd18a',        // ✓
  };
  const F = {
    mono: '"JetBrains Mono", "Noto Sans SC", monospace',   // HUD, numbers, logs
    sans: '"Noto Sans SC", sans-serif',                    // UI Chinese
    serif: '"Noto Serif SC", serif',                        // titles
    hand: '"LXGW WenKai", "Noto Sans SC", serif',          // subtitles, intimate text
  };

  // ---------- math / easing ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => clamp((t - a) / (b - a));           // 0..1 progress of t across [a,b]
  const ease = {
    linear: k => k,
    inOut: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
    out: k => 1 - Math.pow(1 - k, 3),
    in: k => k * k * k,
    outExpo: k => k === 1 ? 1 : 1 - Math.pow(2, -10 * k),
    outBack: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
    sine: k => -(Math.cos(Math.PI * k) - 1) / 2,
  };
  // fade in over [a, a+fi], hold, fade out over [b-fo, b]
  const window_ = (t, a, b, fi = .4, fo = .4) => Math.min(ease.out(prog(t, a, a + fi)), 1 - ease.in(prog(t, b - fo, b)));

  // deterministic random
  function rng(seed) { let s = seed >>> 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, oct = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= .5; } return s; }

  // ---------- drawing helpers ----------
  function font(size, family = F.sans, weight = 400) { return `${weight} ${size}px ${family}`; }
  /** text(str, x, y, opts) — opts: size, family, weight, color, alpha, align, baseline, spacing(px), glow(px), glowColor */
  function text(str, x, y, o = {}) {
    const c = o.ctx || ctx;
    c.save();
    c.font = font(o.size || 32, o.family || F.sans, o.weight || 400);
    c.fillStyle = o.color || P.ink;
    c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
    c.textAlign = o.align || 'left';
    c.textBaseline = o.baseline || 'alphabetic';
    if (o.glow) { c.shadowColor = o.glowColor || c.fillStyle; c.shadowBlur = o.glow; }
    if (o.spacing) { c.letterSpacing = o.spacing + 'px'; }
    c.fillText(str, x, y);
    c.restore();
  }
  function measure(str, o = {}) {
    ctx.save(); ctx.font = font(o.size || 32, o.family || F.sans, o.weight || 400);
    if (o.spacing) ctx.letterSpacing = o.spacing + 'px';
    const w = ctx.measureText(str).width; ctx.restore(); return w;
  }
  /** typewriter: characters of str visible at local time lt when typing starts at t0 with cps chars/sec */
  function typed(str, lt, t0, cps = 18) { const n = Math.floor(clamp((lt - t0) * cps, 0, str.length)); return Array.from(str).slice(0, n).join(''); }
  function typedDone(str, t0, cps = 18) { return t0 + Array.from(str).length / cps; }
  const caretOn = (lt, rate = 1.1) => (lt * rate) % 1 < .55;
  function rrect(x, y, w, h, r, c = ctx) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  /** panel(x,y,w,h,opts) — the HUD box used everywhere. opts: r, fill, stroke, alpha, lineWidth */
  function panel(x, y, w, h, o = {}) {
    const c = o.ctx || ctx;
    c.save(); c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
    rrect(x, y, w, h, o.r == null ? 10 : o.r, c);
    c.fillStyle = o.fill || 'rgba(16,21,30,0.82)'; c.fill();
    c.lineWidth = o.lineWidth || 1.5; c.strokeStyle = o.stroke || 'rgba(233,228,216,0.18)'; c.stroke();
    c.restore();
  }
  function dot(x, y, r, color, o = {}) {
    const c = o.ctx || ctx;
    c.save(); c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
    if (o.glow) { c.shadowColor = color; c.shadowBlur = o.glow; }
    c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function ring(x, y, r, color, o = {}) {
    const c = o.ctx || ctx;
    c.save(); c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
    c.strokeStyle = color; c.lineWidth = o.lineWidth || 2; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.restore();
  }


  window.K = { W, H, ctx, canvas, P, F, clamp, lerp, prog, ease, window: window_, rng, vnoise, fbm, hash2,
               font, text, measure, typed, typedDone, caretOn, rrect, panel, dot, ring };
})();
