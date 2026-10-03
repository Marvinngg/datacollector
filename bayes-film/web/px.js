/* PX — a CPU particle renderer for 《先别急》.
 * Hundreds of thousands of points per frame, splatted into float light buffers in plain JS (no GPU: headless
 * software GL is ~5x slower than this), tone-mapped and added onto the 2D canvas.
 *   - core buffer at full resolution: crisp points (bilinear splat)
 *   - glow buffer at 1/4 resolution, box-blurred: the halo / bloom around dense light
 * Everything is a pure function of the arguments: no state survives a frame except caches of sampled shapes.
 *
 * Frame protocol (inside a template's draw):
 *   PX.begin();                                   // clear the light buffers
 *   PX.points(X, Y, n, [r,g,b], {a, glow, A});    // as many batches as you like
 *   PX.flush();                                   // tone-map and add the light onto the canvas (ctx 'lighter')
 * Shapes:
 *   PX.text(str, {size, family, weight, x, y, align, step})  -> {X, Y, n}  points filling the glyphs (cached)
 *   PX.grid / PX.disc / PX.sphere / PX.fit / PX.morph / PX.project  (see each function)
 */
(function () {
  const { W, H, ctx, F, clamp, lerp, ease, rng } = K;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });

  // ---------------------------------------------------------------- light buffers
  const GW = W >> 2, GH = H >> 2;                                    // glow buffer size (quarter)
  const core = new Float32Array(W * H * 3), glow = new Float32Array(GW * GH * 3), tmp = new Float32Array(GW * GH * 3);
  const coreImg = new ImageData(W, H), glowImg = new ImageData(GW, GH);
  const core32 = new Uint32Array(coreImg.data.buffer), glow32 = new Uint32Array(glowImg.data.buffer);
  const coreCv = mk(W, H), coreG = coreCv.getContext('2d'), glowCv = mk(GW, GH), glowG = glowCv.getContext('2d');
  let dirtyCore = false, dirtyGlow = false;
  // bounding box of what was splatted (only that region is converted / blurred)
  let cx0 = W, cy0 = H, cx1 = 0, cy1 = 0;

  function begin() {
    if (dirtyCore) core.fill(0);
    if (dirtyGlow) glow.fill(0);
    dirtyCore = dirtyGlow = false; cx0 = W; cy0 = H; cx1 = 0; cy1 = 0;
  }

  /** splat n points. X, Y: arrays (screen px). col: [r,g,b] in 0..1 (light colour). o:
   *    a     overall intensity (default 0.6)
   *    A     optional per-point intensity array (multiplied with a)
   *    glow  how much of the light also goes into the halo (default 0.5; 0 = crisp only)
   *    size  >1 makes each point a small 2x2-ish blob (default 1)
   *    C     optional per-point colour array (r,g,b interleaved, length 3n) instead of col
   *    from  first index (default 0) */
  function points(X, Y, n, col, o = {}) {
    const a0 = (o.a == null ? 0.6 : o.a) * ctx.globalAlpha, A = o.A, C = o.C, gk = o.glow == null ? 0.5 : o.glow;
    if (a0 <= 0) return;
    const cr = col ? col[0] : 1, cg = col ? col[1] : 1, cb = col ? col[2] : 1, size = o.size || 1, from = o.from || 0;
    dirtyCore = true; if (gk > 0) dirtyGlow = true;
    const ga = a0 * gk * 0.9;                                          // halo light per point (spread over 16 px)
    for (let i = from; i < n; i++) {
      let a = A ? a0 * A[i] : a0; if (a <= 0.0005) continue;
      const x = X[i], y = Y[i];
      if (!(x >= 1 && y >= 1 && x < W - 2 && y < H - 2)) continue;
      let r = cr, g = cg, b = cb; if (C) { r = C[i * 3]; g = C[i * 3 + 1]; b = C[i * 3 + 2]; }
      const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
      if (xi < cx0) cx0 = xi; if (xi > cx1) cx1 = xi; if (yi < cy0) cy0 = yi; if (yi > cy1) cy1 = yi;
      if (size > 1) {                                                  // a soft 3x3 blob
        const s = a / 4;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const w = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1) / 4 * s, k = ((yi + dy) * W + xi + dx) * 3;
          core[k] += r * w; core[k + 1] += g * w; core[k + 2] += b * w;
        }
      } else {
        const w00 = (1 - fx) * (1 - fy) * a, w10 = fx * (1 - fy) * a, w01 = (1 - fx) * fy * a, w11 = fx * fy * a;
        let k = (yi * W + xi) * 3;
        core[k] += r * w00; core[k + 1] += g * w00; core[k + 2] += b * w00;
        core[k + 3] += r * w10; core[k + 4] += g * w10; core[k + 5] += b * w10;
        k += W * 3;
        core[k] += r * w01; core[k + 1] += g * w01; core[k + 2] += b * w01;
        core[k + 3] += r * w11; core[k + 4] += g * w11; core[k + 5] += b * w11;
      }
      if (gk > 0) {
        const gx = x / 4, gy = y / 4, gxi = gx | 0, gyi = gy | 0;
        if (gxi < GW - 1 && gyi < GH - 1) {
          const ga1 = (A ? ga * A[i] : ga), fx2 = gx - gxi, fy2 = gy - gyi;
          const w00 = (1 - fx2) * (1 - fy2) * ga1, w10 = fx2 * (1 - fy2) * ga1, w01 = (1 - fx2) * fy2 * ga1, w11 = fx2 * fy2 * ga1;
          let k = (gyi * GW + gxi) * 3;
          glow[k] += r * w00; glow[k + 1] += g * w00; glow[k + 2] += b * w00;
          glow[k + 3] += r * w10; glow[k + 4] += g * w10; glow[k + 5] += b * w10;
          k += GW * 3;
          glow[k] += r * w01; glow[k + 1] += g * w01; glow[k + 2] += b * w01;
          glow[k + 3] += r * w11; glow[k + 4] += g * w11; glow[k + 5] += b * w11;
        }
      }
    }
  }
  /** one point (slow path; for a handful of sparks) */
  const _x = new Float32Array(1), _y = new Float32Array(1);
  function dot(x, y, col, a = 1, glowK = 0.6) { _x[0] = x; _y[0] = y; points(_x, _y, 1, col, { a, glow: glowK }); }

  // separable box blur on the glow buffer (3 channels), radius r, two passes ≈ gaussian. Reads are clamped to the
  // region [x0..x1] x [y0..y1] (padded by the caller), so stale data outside it from earlier frames never leaks in.
  function blurGlow(r, x0, y0, x1, y1) {
    const w = GW, src = glow, dst = tmp, n = 2 * r + 1;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = y0; y <= y1; y++) {                      // horizontal: src -> dst
        let sr = 0, sg = 0, sb = 0; const row = y * w;
        for (let x = x0 - r; x <= x0 + r; x++) { const k = (row + clampi(x, x0, x1)) * 3; sr += src[k]; sg += src[k + 1]; sb += src[k + 2]; }
        for (let x = x0; x <= x1; x++) {
          const k = (row + x) * 3; dst[k] = sr / n; dst[k + 1] = sg / n; dst[k + 2] = sb / n;
          const ka = (row + clampi(x + r + 1, x0, x1)) * 3, kb = (row + clampi(x - r, x0, x1)) * 3;
          sr += src[ka] - src[kb]; sg += src[ka + 1] - src[kb + 1]; sb += src[ka + 2] - src[kb + 2];
        }
      }
      for (let x = x0; x <= x1; x++) {                      // vertical: dst -> src
        let sr = 0, sg = 0, sb = 0;
        for (let y = y0 - r; y <= y0 + r; y++) { const k = (clampi(y, y0, y1) * w + x) * 3; sr += dst[k]; sg += dst[k + 1]; sb += dst[k + 2]; }
        for (let y = y0; y <= y1; y++) {
          const k = (y * w + x) * 3; src[k] = sr / n; src[k + 1] = sg / n; src[k + 2] = sb / n;
          const ka = (clampi(y + r + 1, y0, y1) * w + x) * 3, kb = (clampi(y - r, y0, y1) * w + x) * 3;
          sr += dst[ka] - dst[kb]; sg += dst[ka + 1] - dst[kb + 1]; sb += dst[ka + 2] - dst[kb + 2];
        }
      }
    }
  }
  const clampi = (v, a, b) => v < a ? a : v > b ? b : v;

  // tone map: 1 - exp(-x * exposure), as a 0..255 lookup over x in [0, 8)
  const LUTN = 4096, LUTMAX = 8, lut = new Uint8ClampedArray(LUTN);
  let lutExp = -1;
  function makeLut(e) { if (e === lutExp) return; lutExp = e; for (let i = 0; i < LUTN; i++) lut[i] = Math.round(255 * (1 - Math.exp(-(i / LUTN * LUTMAX) * e))); }
  const tm = v => lut[v >= LUTMAX ? LUTN - 1 : (v * (LUTN / LUTMAX)) | 0];

  /** add the light onto the canvas. o: exposure (default 1.4), glow (halo strength, default 1), glowR (blur radius in
   *  quarter-res px, default 6), coreA (default 1) */
  function flush(o = {}) {
    makeLut(o.exposure || 1.4);
    if (cx1 < cx0) return;                                   // nothing drawn
    const pad = 2, x0 = Math.max(0, cx0 - pad), y0 = Math.max(0, cy0 - pad), x1 = Math.min(W - 1, cx1 + pad), y1 = Math.min(H - 1, cy1 + pad);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    if (dirtyGlow && (o.glow == null || o.glow > 0)) {
      const r = o.glowR || 4, pg = r * 3 + 3, gx0 = Math.max(0, (x0 >> 2) - pg), gy0 = Math.max(0, (y0 >> 2) - pg), gx1 = Math.min(GW - 1, (x1 >> 2) + pg), gy1 = Math.min(GH - 1, (y1 >> 2) + pg);   // pad past the blur's reach (2r)
      blurGlow(r, gx0, gy0, gx1, gy1);
      const gs = o.glow == null ? 1 : o.glow;
      for (let y = gy0; y <= gy1; y++) for (let x = gx0, k = (y * GW + gx0) * 3, j = y * GW + gx0; x <= gx1; x++, k += 3, j++) {
        glow32[j] = 0xff000000 | (tm(glow[k + 2] * gs) << 16) | (tm(glow[k + 1] * gs) << 8) | tm(glow[k] * gs);
      }
      glowG.putImageData(glowImg, 0, 0, gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 1);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(glowCv, gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 1, gx0 * 4, gy0 * 4, (gx1 - gx0 + 1) * 4, (gy1 - gy0 + 1) * 4);
    }
    if (dirtyCore) {
      const ca = o.coreA == null ? 1 : o.coreA;
      for (let y = y0; y <= y1; y++) for (let x = x0, k = (y * W + x0) * 3, j = y * W + x0; x <= x1; x++, k += 3, j++) {
        const r = core[k], g = core[k + 1], b = core[k + 2];
        core32[j] = (r + g + b) === 0 ? 0xff000000 : 0xff000000 | (tm(b * ca) << 16) | (tm(g * ca) << 8) | tm(r * ca);
      }
      coreG.putImageData(coreImg, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      ctx.drawImage(coreCv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- shapes (all cached; arrays are shared, never mutate them)
  const shapes = new Map();
  /** points filling a text's glyphs. o: size, family (F.serif), weight, x, y (baseline centre by default), align,
   *  step (sampling pitch in px, default size/40), jitter (0..1 of step, default 0.8), seed.
   *  Returns {X, Y, n, w, h} in screen px. The order of points is shuffled (stable), so taking the first k gives an
   *  even subset of the shape. */
  function text(str, o = {}) {
    const size = o.size || 200, fam = o.family || F.serif, wt = o.weight || 600, align = o.align || 'center';
    const step = o.step || Math.max(1.5, size / 40), jit = o.jitter == null ? 0.8 : o.jitter, seed = o.seed || 1;
    const x = o.x == null ? W / 2 : o.x, y = o.y == null ? H / 2 : o.y, sp = o.spacing || 0;
    const key = `T|${str}|${size}|${fam}|${wt}|${align}|${step}|${jit}|${seed}|${x}|${y}|${sp}|${document.fonts.check(`${wt} 40px ${fam}`, str)}`;
    let s = shapes.get(key); if (s) return s;
    const c0 = mk(8, 8).getContext('2d'); c0.font = `${wt} ${size}px ${fam}`;
    const chars = [...str], ws = chars.map(ch => c0.measureText(ch).width + sp), tw = ws.reduce((a, b) => a + b, 0) - sp;
    const cw = Math.ceil(tw + size * 0.4), ch = Math.ceil(size * 1.5), cv = mk(cw, ch), g = cv.getContext('2d');
    g.font = c0.font; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
    let px = size * 0.2; chars.forEach((c, i) => { g.fillText(c, px, size * 1.15); px += ws[i]; });
    const d = g.getImageData(0, 0, cw, ch).data, r = rng(seed * 7919 + str.length);
    const ox = (align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x) - size * 0.2, oy = y - size * 1.15;
    const xs = [], ys = [];
    for (let yy = 0; yy < ch; yy += step) for (let xx = 0; xx < cw; xx += step) {
      const jx = xx + (r() - 0.5) * step * jit, jy = yy + (r() - 0.5) * step * jit;
      const ix = Math.min(cw - 1, Math.max(0, jx | 0)), iy = Math.min(ch - 1, Math.max(0, jy | 0));
      if (d[(iy * cw + ix) * 4 + 3] > 110) { xs.push(ox + jx); ys.push(oy + jy); }
    }
    s = shuffle({ X: Float32Array.from(xs), Y: Float32Array.from(ys), n: xs.length, w: tw, h: size }, seed);
    shapes.set(key, s); return s;
  }
  function shuffle(s, seed) {
    const r = rng(seed * 31 + 7), n = s.n, X = s.X, Y = s.Y, Z = s.Z;
    for (let i = n - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; let t = X[i]; X[i] = X[j]; X[j] = t; t = Y[i]; Y[i] = Y[j]; Y[j] = t; if (Z) { t = Z[i]; Z[i] = Z[j]; Z[j] = t; } }
    return s;
  }
  /** n points on a grid: cols columns, top-left (x0, y0), pitch (dx, dy). Point i is at row floor(i/cols). */
  function grid(n, cols, x0, y0, dx, dy = dx) {
    const key = `G|${n}|${cols}|${x0}|${y0}|${dx}|${dy}`; let s = shapes.get(key); if (s) return s;
    const X = new Float32Array(n), Y = new Float32Array(n);
    for (let i = 0; i < n; i++) { X[i] = x0 + (i % cols) * dx; Y[i] = y0 + Math.floor(i / cols) * dy; }
    s = { X, Y, n }; shapes.set(key, s); return s;
  }
  /** n points uniformly in a disc (sunflower spiral, so any prefix is still even) */
  function disc(n, x, y, r) {
    const key = `D|${n}|${x}|${y}|${r}`; let s = shapes.get(key); if (s) return s;
    const X = new Float32Array(n), Y = new Float32Array(n), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) { const rr = r * Math.sqrt((i + 0.5) / n), a = i * ga; X[i] = x + Math.cos(a) * rr; Y[i] = y + Math.sin(a) * rr; }
    s = { X, Y, n }; shapes.set(key, s); return s;
  }
  /** n points on (shell=true) or in a unit sphere: {X, Y, Z} in -1..1 (project them with PX.project) */
  function sphere(n, seed = 1, shell = true) {
    const key = `S|${n}|${seed}|${shell}`; let s = shapes.get(key); if (s) return s;
    const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), r = rng(seed), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - 2 * (i + 0.5) / n, rad = Math.sqrt(1 - y * y), a = i * ga;
      const k = shell ? 1 + (r() - 0.5) * 0.04 : Math.cbrt(r());
      X[i] = Math.cos(a) * rad * k; Y[i] = y * k; Z[i] = Math.sin(a) * rad * k;
    }
    s = shuffle({ X, Y, Z, n }, seed); shapes.set(key, s); return s;
  }
  /** resample a shape to exactly n points (cycling through it), so two shapes can morph point-to-point */
  function fit(s, n) {
    if (s.n === n) return s;
    const key = s; let m = fitCache.get(key); if (!m) fitCache.set(key, m = new Map());
    let f = m.get(n); if (f) return f;
    const X = new Float32Array(n), Y = new Float32Array(n), Z = s.Z ? new Float32Array(n) : null;
    for (let i = 0; i < n; i++) { const j = i % s.n; X[i] = s.X[j]; Y[i] = s.Y[j]; if (Z) Z[i] = s.Z[j]; }
    f = { X, Y, Z, n }; m.set(n, f); return f;
  }
  const fitCache = new WeakMap();

  // per-particle random numbers (stable): PX.rand(i, k) in 0..1
  const RN = (() => { const r = rng(424242), a = new Float32Array(1 << 18); for (let i = 0; i < a.length; i++) a[i] = r(); return a; })();
  const rand = (i, k = 0) => RN[(i * 7 + k * 131071) & ((1 << 18) - 1)];

  /** morph A -> B at progress k (0..1) into out {X, Y} (allocated per call size, reused).
   *  o: stagger (0..1: how spread the start times are, default 0.5), swirl (px of sideways drift mid-flight, default 60),
   *     seed, ease (default ease.inOut), order: optional Float32Array of per-point delays (0..1) instead of random */
  const outs = new Map();
  function buf(n, tag = 0) { const key = n * 16 + tag; let b = outs.get(key); if (!b) outs.set(key, b = { X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n), n }); return b; }
  function morph(A, B, k, o = {}) {
    const n = Math.min(A.n, B.n), out = buf(n, o.tag || 0), st = o.stagger == null ? 0.5 : o.stagger, sw = o.swirl == null ? 60 : o.swirl;
    const e = o.ease || ease.inOut, seed = o.seed || 0, ord = o.order;
    for (let i = 0; i < n; i++) {
      const d = ord ? ord[i] : rand(i, seed);
      const ki = e(clamp((k * (1 + st) - d * st)));
      const s = Math.sin(ki * Math.PI) * sw, an = rand(i, seed + 1) * 6.283;
      out.X[i] = A.X[i] + (B.X[i] - A.X[i]) * ki + Math.cos(an) * s;
      out.Y[i] = A.Y[i] + (B.Y[i] - A.Y[i]) * ki + Math.sin(an) * s;
      out.A[i] = 1;
    }
    out.n = n; return out;
  }
  /** perspective projection of 3D points (unit-ish coordinates) into out {X, Y, A} with depth-based intensity.
   *  cam: {x, y (screen centre), scale (px per unit), dist (camera distance, default 4), rx, ry (rotation radians),
   *        ox, oy, oz (object offset before rotation)}; returns out (out.A = depth fade 0.25..1) */
  function project(P, cam, tag = 1) {
    const n = P.n, out = buf(n, tag), cy = Math.cos(cam.ry || 0), sy = Math.sin(cam.ry || 0), cx = Math.cos(cam.rx || 0), sx = Math.sin(cam.rx || 0);
    const dist = cam.dist || 4, sc = cam.scale || 300, X0 = cam.x == null ? W / 2 : cam.x, Y0 = cam.y == null ? H / 2 : cam.y;
    const ox = cam.ox || 0, oy = cam.oy || 0, oz = cam.oz || 0, k = cam.k || 1;
    for (let i = 0; i < n; i++) {
      let x = P.X[i] * k + ox, y = P.Y[i] * k + oy, z = P.Z[i] * k + oz;
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;            // yaw
      const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;           // pitch
      const f = dist / (dist + z2);
      out.X[i] = X0 + x1 * sc * f; out.Y[i] = Y0 + y1 * sc * f; out.A[i] = clamp(0.25 + 0.75 * (1 - (z2 + 1.2) / 2.4), 0.15, 1) * f;
    }
    out.n = n; return out;
  }
  /** hex '#rrggbb' -> [r,g,b] 0..1 */
  const rgb = hex => { const v = parseInt(hex.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };

  // the film's colours as light
  const COL = {
    gold: rgb('#ffcf7a'), ember: rgb('#ff9a55'), white: rgb('#f3eee4'), cool: rgb('#7f93b5'), steel: rgb('#5d6b80'),
    red: rgb('#ff6a5a'), cyan: rgb('#6fe0d2'), violet: rgb('#a993ff'),
  };

  window.PX = { begin, points, dot, flush, text, grid, disc, sphere, fit, morph, project, rand, buf, rgb, COL, shuffle };
})();
