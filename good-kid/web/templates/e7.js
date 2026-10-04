/* e7 — the climax. After taking back its own light, the tries bloom into real lives: one continuous, rising montage.
 * Four beats with hard cuts (b22 kline · b23 agents · b24 summit · b25 journey) are drawn by ONE pure function of
 * climax time ct (seconds since b22 began), so every cut is invisible and each world morphs into the next:
 *   kline   — on the downbeat the warm 你 of the lamp shrinks onto the head of a racing candlestick chart (line art,
 *             red up / green down only inside the chart, live numbers, a moving price line). 你 rides the price; on
 *             'dip' the market crashes and 你 tumbles with it — 「跌下去过，」 is written at the low; on 'climb' it runs
 *             up through the old high — 「也涨回来过。」 on the dashed line of the old peak.
 *   agents  — the last tall candle becomes a small market stall (its body the counter, its wick the poles), a bulb
 *             lights, 「一个小摊，」 is chalked on the counter. The bulb's light passes into 你 and AI agents spawn from
 *             it in waves (8 roles, then 56, 392, 544: a fractal tree), fine links, packets running along them; the
 *             camera pulls back and the tree winds into a galaxy of light. 「长成一家公司。」 condenses out of the core.
 *             'command': a pulse rings out and the thousand agents fly into the sentence 「一个人，指挥一千个 Agent。」,
 *             their links drawing its strokes like a constellation.
 *   summit  — the agents let go and the camera tilts down: the galaxy's plane becomes the ground, its nodes rise onto
 *             mountain ridge lines (fine contour slices), its dust settles into a sea of clouds. 你 climbs the ridge,
 *             camera rising; on 'peak' the sun breaks the cloud horizon — a slow, huge bloom — and its light writes
 *             「会当凌绝顶，一览众山小。」 across the sky.
 *   journey — 你 dives off the summit through the clouds; the ridge lines flatten into the swells of a golden-hour
 *             sea; 你 rides a line-art motorbike along the seaside road (the feed's vignette, now yours), wind streaming;
 *             the wind itself writes 「风吹在脸上，原来是这种感觉。」. 'free': the speed relaxes into a calm dusk sea,
 *             你 small and glowing.
 * Closed-form motion everywhere; static shapes are cached. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, text, fbm } = K;
  const LC = KIT.L;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const R = (i, k) => PX.rand(i, k);
  const frac = x => x - Math.floor(x);
  const rgbS = (c, a = 1) => `rgba(${c.map(v => Math.round(clamp(v) * 255)).join(',')},${a})`;
  const HAND = [0.94, 0.81, 0.62];                    // warm handwriting ink (yours)
  const GOLD = [1.0, 0.8, 0.5], SUN = [1.0, 0.72, 0.42], NODE = [1.0, 0.93, 0.8];
  const UPC = '#e5574f', DNC = '#3dab84';            // the market's own colours, inside the chart only
  const UPL = [0.9, 0.34, 0.31], DNL = [0.24, 0.67, 0.52];
  const BG0 = '#06080d';

  // ---------------------------------------------------------------- buffers (own keys: no collisions with PX.buf)
  const BUF = new Map();
  function buf(key, n) {
    let b = BUF.get(key);
    if (!b || b.X.length < n) BUF.set(key, b = { X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n), C: new Float32Array(n * 3) });
    return b;
  }

  // ---------------------------------------------------------------- timing (climax time ct = t - start of b22)
  let TM = null;
  function timing() {
    if (TM) return TM;
    const bs = T.TL.beats, by = ty => bs.find(b => b.visual.type === ty);
    const bk = by('kline'), ba = by('agents'), bm = by('summit'), bj = by('journey'), t0 = bk.start;
    const st = (b, n, d) => { const s = (b.visual.steps || []).find(s => s.show === n); return s && s.t != null ? s.t - t0 : d; };
    TM = {
      t0, end: bj.end - t0,
      run: 0, dip: st(bk, 'dip', 5), kclimb: st(bk, 'climb', 6.667),
      found: ba.start - t0, spawn: st(ba, 'spawn', ba.start - t0 + 3.333), command: st(ba, 'command', ba.start - t0 + 8.333),
      sclimb: bm.start - t0, peak: st(bm, 'peak', bm.start - t0 + 3.333),
      ride: bj.start - t0, free: st(bj, 'free', bj.start - t0 + 6.667),
      L: Object.assign({}, bk.visual.lines, ba.visual.lines, bm.visual.lines, bj.visual.lines),
    };
    return TM;
  }

  // ---------------------------------------------------------------- shared drawing
  function halo(x, y, r, a, col = '255,196,128') {
    if (a <= 0.003 || r <= 1) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= Math.min(1, a);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},0.32)`); g.addColorStop(0.35, `rgba(${col},0.12)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  /* 你 — KIT.you's body and colour formula (own light), plus a clip line (points below clipY are hidden: behind the
     counter) and a per-call buffer so the caller can use the positions (wind tearing light off it). */
  function you(x, y, size, o = {}) {
    const s = Math.max(20, Math.round(size / 20) * 20);
    const cl = PX.text('你', { size: s, family: F.serif, weight: 600, x: 0, y: s * 0.38, step: Math.max(1.4, s / 120), seed: 17 });
    const n = cl.n, sc = size / s, b = buf('you' + (o.tag || 0), n);
    const t = o.t || 0, br = o.breathe == null ? 0.4 : o.breathe, rot = o.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot), cy = o.clipY;
    for (let i = 0; i < n; i++) {
      const r1 = R(i, 21), r2 = R(i, 22);
      const px = cl.X[i] * sc + Math.sin(t * (1.1 + r1) + r2 * 30) * br * 1.6, py = cl.Y[i] * sc + Math.cos(t * (0.9 + r2) + r1 * 30) * br * 1.6;
      b.X[i] = x + px * cs - py * sn; b.Y[i] = y + px * sn + py * cs;
      b.A[i] = cy != null && b.Y[i] > cy ? 0 : 1;
    }
    const own = o.own == null ? 1 : o.own, base = [0.62, 0.64, 0.68], stp = Math.max(1.4, s / 120) * sc;
    const a = (o.a == null ? 0.5 : o.a) * 0.25 * stp * stp * 3.06;    // e6 draws its 你 at a/3.06 with a 2 px pitch
    const col = [0, 1, 2].map(k => base[k] * 0.55 * (1 - 0.7 * own) + LC.warm[k] * own * 1.25);
    PX.points(b.X, b.Y, n, col, { a: 0.34 * a * (0.55 + 0.7 * own), A: b.A, glow: 0.25 + 0.4 * own });
    b.n = n; return b;
  }
  /* a line of particle text that gathers (k) and dissolves (out) — cached at the origin and translated, so it can
     live on a moving chart. o: size, family, weight, align, color, a, k, out, from [x,y], spread, t, seed, crisp,
     drift, outVec [dx, dy] (direction the dissolve blows) */
  function ptx(str, x, y, o = {}) {
    const k = o.k == null ? 1 : o.k, out = o.out || 0; if (k <= 0 || out >= 1) return;
    const size = o.size || 64, fam = o.family || F.serif, wt = o.weight || 500, seed = o.seed || 3, al = o.align || 'center', sp = o.spacing || 0;
    const cl = PX.text(str, { size, family: fam, weight: wt, x: 0, y: 0, align: al, spacing: sp, step: o.step || Math.max(1.3, size / 34), seed });
    const n = cl.n, b = buf('ptx' + seed, n), t = o.t || 0, dr = o.drift == null ? 0.5 : o.drift, fr = o.from, spr = o.spread == null ? 0.3 : o.spread, ov = o.outVec;
    for (let i = 0; i < n; i++) {
      const d = R(i, seed + 40) * 0.5, kk = ease.inOut(clamp(k * 1.5 - d)), ko = ease.in(clamp(out * 1.5 - R(i, seed + 41) * 0.5));
      const an = R(i, seed + 42) * TAU, rr = size * (1.5 + 3 * R(i, seed + 43));
      const gx = x + cl.X[i], gy = y + cl.Y[i];
      const sx = fr ? fr[0] + Math.cos(an) * size * spr * R(i, seed + 46) : gx + Math.cos(an) * rr, sy = fr ? fr[1] + Math.sin(an) * size * spr * R(i, seed + 46) : gy + Math.sin(an) * rr;
      const w = Math.sin(t * (0.8 + R(i, seed + 44)) + i) * dr;
      let px = lerp(sx, gx, kk) + w, py = lerp(sy, gy, kk) + w * 0.6;
      if (ko > 0) {
        if (ov) { const m = 0.5 + R(i, seed + 45); px += ov[0] * ko * m + Math.cos(an) * ko * size * 0.3; py += ov[1] * ko * m + Math.sin(an) * ko * size * 0.3; }
        else { px += Math.cos(an) * ko * size * 1.2; py += Math.sin(an) * ko * size * 1.2 - ko * size * 0.8; }
      }
      b.X[i] = px; b.Y[i] = py; b.A[i] = (0.35 + 0.65 * kk) * (1 - ko);
    }
    PX.points(b.X, b.Y, n, o.color || LC.ink, { a: o.a == null ? 0.5 : o.a, A: b.A, glow: o.glow == null ? 0.3 : o.glow });
    if (o.crisp) {
      const ck = clamp((k - 0.85) / 0.15) * (1 - clamp(out * 2.5)) * o.crisp;
      if (ck > 0) text(str, x, y, { size, family: fam, weight: wt, align: al, spacing: sp, color: rgbS(o.color || LC.ink), alpha: ck * 0.9 });
    }
  }
  function polyline(pts, close = false) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close) ctx.closePath(); }
  function resampleN(pts, n) {                               // n points evenly along a polyline
    const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const tot = L[L.length - 1] || 1, o = []; let j = 0;
    for (let q = 0; q < n; q++) {
      const s = tot * q / (n - 1); while (j < pts.length - 2 && L[j + 1] < s) j++;
      const f = (s - L[j]) / Math.max(1e-6, L[j + 1] - L[j]);
      o.push([lerp(pts[j][0], pts[j + 1][0], clamp(f)), lerp(pts[j][1], pts[j + 1][1], clamp(f))]);
    }
    return o;
  }

  // ================================================================ A. the K-line (b22)
  const DT = 0.16, I0 = -70, NCAN = 170, HX = 690, PITCH = 26;
  function monotone(pts) {                                   // monotone cubic through (t, v) keypoints
    const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), dx = [], s = [], m = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; s[i] = (ys[i + 1] - ys[i]) / dx[i]; }
    m[0] = s[0]; m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / s[i - 1] + (dx[i] + 2 * dx[i - 1]) / s[i]);
    return t => {
      if (t <= xs[0]) return ys[0] + m[0] * (t - xs[0]);
      if (t >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (t - xs[n - 1]);
      let i = 0; while (t > xs[i + 1]) i++;
      const h = dx[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
    };
  }
  let MK = null;
  function market(S) {
    if (MK) return MK;
    const d = S.dip, c = S.kclimb, f = S.found;
    const kp = [[-14, 74], [-11, 79], [-8, 85], [-5.5, 88], [-3, 93], [-1.2, 96], [0, 100], [1.2, 106], [2.0, 112], [2.8, 109], [3.8, 117],
      [d - 0.12, 127], [d + 0.3, 116], [d + 0.72, 99.5], [d + 1.02, 104], [c - 0.12, 95.6], [c + 0.6, 107], [c + 1.25, 127.5],
      [c + 2.0, 152], [c + 2.7, 190], [f, 236], [f + 0.8, 290], [f + 2, 360]].map(p => [p[0], Math.log(p[1])]);
    const base = monotone(kp);
    const vol = t => 0.010 - 0.005 * ss(d - 0.2, d + 0.25, t) + 0.004 * ss(c - 0.4, c + 0.4, t);
    const P = t => base(t) + vol(t) * (0.55 * Math.sin(t * 7.3 + 1.1) + 0.35 * Math.sin(t * 12.9 + 2.3) + 0.25 * Math.sin(t * 21.7 + 0.4) + 0.18 * Math.sin(t * 33.1 + 5.0));
    const O = new Float32Array(NCAN), Cl = new Float32Array(NCAN), Hi = new Float32Array(NCAN), Lo = new Float32Array(NCAN), V = new Float32Array(NCAN);
    for (let j = 0; j < NCAN; j++) {
      const t0 = (I0 + j) * DT; let hi = -1e9, lo = 1e9;
      for (let q = 0; q <= 8; q++) { const p = P(t0 + DT * q / 8); if (p > hi) hi = p; if (p < lo) lo = p; }
      O[j] = P(t0); Cl[j] = P(t0 + DT); Hi[j] = hi + 0.006 * R(j, 301) ** 2; Lo[j] = lo - 0.006 * R(j, 302) ** 2;
      V[j] = clamp(Math.abs(Cl[j] - O[j]) * 14 + 0.12 + 0.35 * R(j, 303) ** 2, 0, 1);
    }
    let tLow = d, pLow = 9, tHi = d, pHi = -9;
    for (let t = d; t < c + 0.6; t += 0.005) { const p = P(t); if (p < pLow) { pLow = p; tLow = t; } }
    for (let t = d - 1.2; t < d + 0.1; t += 0.005) { const p = P(t); if (p > pHi) { pHi = p; tHi = t; } }
    let tRec = c + 1.3; for (let t = tLow; t < f + 2; t += 0.005) if (P(t) >= pHi) { tRec = t; break; }
    MK = { P, O, Cl, Hi, Lo, V, tLow, pLow, tHi, pHi, tRec };
    return MK;
  }
  // the chart's camera: time scrolls past "now" at x = HX; the price axis follows the price with a lag (log scale)
  function chartCam(ct, S, M) {
    const f = S.found, tau = ct < f ? ct : f + 0.3 * (1 - Math.exp(-(ct - f) / 0.3));
    let acc = 0, ws = 0; for (let j = 0; j < 14; j++) { const w = Math.exp(-j * 0.2); acc += M.P(tau - j * 0.11) * w; ws += w; }
    const kc = ss(S.kclimb + 0.3, f, ct);
    const Z = lerp(1, 0.62, kc), KL = lerp(1500, 860, kc), YC = lerp(1040, 1230, ss(S.kclimb, f, ct));
    const camL = acc / ws, pxs = PITCH / DT * Z;
    return { tau, Z, KL, YC, camL, pxs, x: t => HX - (tau - t) * pxs, y: l => YC - (l - camL) * KL };
  }
  const fmtP = l => Math.exp(l).toFixed(2);
  const fmtC = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';

  function drawChart(ct, S, Ls) {
    const M = market(S), cam = chartCam(ct, S, M), tau = cam.tau, f = S.found;
    const aCh = 1 - ss(f + 0.05, f + 0.95, ct); if (aCh <= 0.003) return null;
    const sink = 300 * ease.in(prog(ct, f, f + 1.1));
    const sweep = lerp(-60, W + 60, ease.inOut(prog(ct, 0.0, 0.85)));
    const gA = ss(0, 0.6, ct), Z = cam.Z, iNow = Math.floor(tau / DT), iStar = Math.floor(f / DT) - 1;
    const jFrom = Math.max(0, Math.floor((tau - (HX + 40) / cam.pxs) / DT) - I0), jNow = iNow - I0;
    const dipK = ss(S.dip, S.dip + 0.25, ct) * (1 - ss(S.kclimb - 0.2, S.kclimb + 0.6, ct));
    ctx.save(); ctx.globalAlpha *= aCh; ctx.translate(0, sink);
    // ---- grid: price levels (log scale) and time lines; tiny axis numbers
    ctx.lineWidth = 1;
    const lv = []; for (let p = 40; p < 700; p += p < 150 ? 10 : p < 300 ? 20 : 50) { const y = cam.y(Math.log(p)); if (y > 380 && y < 1580) lv.push([p, y]); }
    ctx.globalAlpha = aCh * gA; ctx.strokeStyle = 'rgba(236,231,220,0.075)'; ctx.beginPath();
    for (const [, y] of lv) { ctx.moveTo(60, y); ctx.lineTo(Math.min(sweep, 1000), y); }
    for (let i = Math.ceil((tau - 7) / DT / 10) * 10; i * DT < tau + 3; i += 10) { const x = cam.x(i * DT); if (x > 40 && x < Math.min(sweep, 1000)) { ctx.moveTo(x, 380); ctx.lineTo(x, 1600); } }
    ctx.stroke();
    for (const [p, y] of lv) text(String(p), 1020, y + 7, { size: 19, family: F.mono, color: 'rgba(236,231,220,0.34)', align: 'right' });
    // ---- volume
    ctx.globalAlpha = aCh * gA;
    const VB = 1720;
    for (const [col, up] of [[UPC, true], [DNC, false]]) {
      ctx.fillStyle = col; ctx.globalAlpha = aCh * gA * 0.32; ctx.beginPath();
      for (let j = jFrom; j <= Math.min(jNow, NCAN - 1); j++) {
        if (j === iStar - I0 && ct > f) continue;
        const live = j === jNow, i = j + I0, x = cam.x((i + 0.5) * DT); if (x > sweep) continue;
        const cl = live ? M.P(tau) : M.Cl[j]; if ((cl >= M.O[j]) !== up) continue;
        const h = M.V[j] * 56 * (live ? clamp((tau - i * DT) / DT) : 1);
        ctx.rect(x - 7 * Z, VB - h, 14 * Z, h);
      }
      ctx.fill();
    }
    ctx.globalAlpha = aCh * gA * 0.5; ctx.strokeStyle = 'rgba(236,231,220,0.3)'; ctx.beginPath(); ctx.moveTo(60, VB + 0.5); ctx.lineTo(Math.min(sweep, 1020), VB + 0.5); ctx.stroke();
    // ---- moving averages
    ctx.globalAlpha = aCh;
    for (const [nn, col, lw] of [[5, 'rgba(242,196,109,0.42)', 1.4], [20, 'rgba(236,231,220,0.2)', 1.2]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); let st = false;
      for (let j = Math.max(nn, jFrom); j < Math.min(jNow, NCAN); j++) {
        const x = cam.x((j + I0 + 0.5) * DT); if (x > sweep) break;
        let s = 0; for (let q = 0; q < nn; q++) s += M.Cl[j - q]; const y = cam.y(s / nn);
        st ? ctx.lineTo(x, y) : ctx.moveTo(x, y); st = true;
      }
      ctx.stroke();
    }
    // ---- candles: red up (hollow, faint fill), green down (filled); wicks
    const bw = Math.max(5, 15 * Z);
    const cand = [];
    for (let j = jFrom; j <= Math.min(jNow, NCAN - 1); j++) {
      const i = j + I0, x = cam.x((i + 0.5) * DT); if (x > sweep || x < 20) continue;
      if (j === iStar - I0 && ct > f) continue;             // that one becomes the stall
      let o = M.O[j], c = M.Cl[j], hi = M.Hi[j], lo = M.Lo[j];
      if (j === jNow) {                                       // the live candle
        const t0 = i * DT, q = clamp((tau - t0) / DT); c = M.P(tau); hi = Math.max(o, c); lo = Math.min(o, c);
        for (let s = 1; s <= 6; s++) { const p = M.P(t0 + (tau - t0) * s / 6); hi = Math.max(hi, p); lo = Math.min(lo, p); }
        hi += 0.004 * q; lo -= 0.004 * q;
      }
      cand.push([x, cam.y(o), cam.y(c), cam.y(hi), cam.y(lo), c >= o, j, i]);
    }
    ctx.lineWidth = 1.4;
    for (const up of [true, false]) {
      ctx.strokeStyle = up ? UPC : DNC; ctx.globalAlpha = aCh * 0.95; ctx.beginPath();
      for (const q of cand) { if (q[5] !== up) continue; const top = Math.min(q[1], q[2]), bot = Math.max(q[1], q[2]); ctx.moveTo(q[0], q[3]); ctx.lineTo(q[0], top); ctx.moveTo(q[0], bot); ctx.lineTo(q[0], q[4]); if (up) ctx.rect(q[0] - bw / 2, top, bw, Math.max(1.5, bot - top)); }
      ctx.stroke();
      ctx.fillStyle = up ? 'rgba(229,87,79,0.2)' : DNC; ctx.globalAlpha = aCh * (up ? 1 : 0.88); ctx.beginPath();
      for (const q of cand) { if (q[5] !== up) continue; const top = Math.min(q[1], q[2]), bot = Math.max(q[1], q[2]); ctx.rect(q[0] - bw / 2, top, bw, Math.max(1.5, bot - top)); }
      ctx.fill();
    }
    // tiny live numbers on the big candles
    for (const q of cand) {
      const j = q[6], i = q[7]; if (j === jNow) continue;
      const r = (Math.exp(M.Cl[j] - M.O[j]) - 1) * 100; if (Math.abs(r) < 3.6 || (r > 0 && i % 2)) continue;
      const age = tau - (i + 1) * DT, a = ss(0, 0.15, age) * (1 - ss(1.1, 1.8, age)); if (a <= 0) continue;
      const up = r >= 0;
      const e = ease.out(clamp(age / 0.3));
      text(fmtC(r), q[0] - bw / 2 - 8 - 4 * e, up ? q[3] + 6 : q[4] + 4, { size: 20, family: F.mono, color: up ? UPC : DNC, align: 'right', alpha: a * 0.9 });
    }
    // ---- the price line (warm: yours), running into the head
    const lp = [], t1 = tau, t0 = tau - 9;
    for (let t = t0; t <= t1 + 1e-6; t += 0.03) { const x = cam.x(t); if (x < sweep) lp.push([x, cam.y(M.P(t))]); }
    const xh = cam.x(tau), yh = cam.y(M.P(tau));
    if (lp.length > 2) {
      const g = ctx.createLinearGradient(xh - 760, 0, xh, 0);
      g.addColorStop(0, 'rgba(255,201,133,0)'); g.addColorStop(0.6, 'rgba(255,201,133,0.35)'); g.addColorStop(1, 'rgba(255,214,160,0.95)');
      ctx.globalAlpha = aCh; ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; polyline(lp); ctx.stroke();
    }
    // the last price: dashed line to the axis and a tag
    const chg = (Math.exp(M.P(tau)) / 100 - 1) * 100, upNow = chg >= 0, colNow = upNow ? UPC : DNC;
    if (xh < sweep) {
      ctx.globalAlpha = aCh * 0.55; ctx.setLineDash([4, 6]); ctx.strokeStyle = colNow; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xh + 10, yh); ctx.lineTo(930, yh); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = aCh; ctx.fillStyle = colNow; K.rrect(932, yh - 17, 92, 34, 5); ctx.fill();
      text(fmtP(M.P(tau)), 978, yh + 8, { size: 20, family: F.mono, weight: 700, color: '#0b0d12', align: 'center' });
    }
    // ---- the annotations, in your hand: the low, and the old high crossed again
    const dA = ss(M.tLow + 0.2, M.tLow + 0.5, tau);
    if (dA > 0) {
      const lx = cam.x(M.tLow), ly = cam.y(M.pLow) + 10, rk = ease.inOut(prog(ct, M.tLow + 0.2, M.tLow + 0.75));
      ctx.globalAlpha = aCh * 0.9; ctx.strokeStyle = rgbS(HAND); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(lx, ly + 10, 30, 22, 0, -1.9, -1.9 + TAU * 1.05 * rk); ctx.stroke();
      const lk = ease.out(prog(ct, M.tLow + 0.55, M.tLow + 0.9));
      if (lk > 0) { ctx.beginPath(); ctx.moveTo(lx, ly + 34); ctx.lineTo(lx, ly + 34 + 46 * lk); ctx.stroke(); }
    }
    const pk = ss(M.tHi, M.tHi + 0.3, tau) * ss(S.dip + 0.3, S.dip + 0.8, ct);
    if (pk > 0) {                                           // the old high: a dashed line that waits to be crossed
      const x0 = cam.x(M.tHi), y = cam.y(M.pHi), x1 = Math.min(cam.x(Math.min(tau, M.tRec)) + 30 + 380 * ss(M.tRec, M.tRec + 0.8, tau), xh + 380);
      ctx.globalAlpha = aCh * 0.5 * pk; ctx.strokeStyle = rgbS(HAND); ctx.lineWidth = 1.2; ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(Math.max(x0, x1), y); ctx.stroke(); ctx.setLineDash([]);
      if (tau > M.tRec) { const k = ease.out(prog(tau, M.tRec, M.tRec + 0.4)); ctx.globalAlpha = aCh * k; ctx.beginPath(); ctx.arc(cam.x(M.tRec), y, 5 + 10 * (1 - k), 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
    // ---- light: 你 riding the head; the line's glow; the handwriting
    const lowX = cam.x(M.tLow), lowY = cam.y(M.pLow) + sink;
    return { cam, M, xh, yh: yh + sink, sink, aCh, dipK, lowX, lowY, chg, colNow, tau, iStar };
  }
  function chartLight(ct, S, Ls, ch) {
    const { cam, M, xh, yh, sink, aCh, tau } = ch, f = S.found;
    // glow along the last 1.4 s of the price line
    const n = 160, b = buf('pl', n);
    for (let i = 0; i < n; i++) { const t = tau - 1.4 * i / n; b.X[i] = cam.x(t); b.Y[i] = cam.y(M.P(t)) + sink; b.A[i] = (1 - i / n) ** 1.5; }
    PX.points(b.X, b.Y, n, LC.warm, { a: 0.5 * aCh, A: b.A, glow: 0.8 });
    // 你's light shed behind along the line
    const nt = 420, tb = buf('trail', nt);
    for (let i = 0; i < nt; i++) {
      const age = frac(R(i, 311) + ct * (0.9 + 0.8 * R(i, 312))) * 0.9, t = tau - age;
      tb.X[i] = cam.x(t) - age * 40 * R(i, 313) + (R(i, 314) - 0.5) * 18; tb.Y[i] = cam.y(M.P(t)) + sink - 14 - age * 70 * R(i, 315) + (R(i, 316) - 0.5) * 14;
      tb.A[i] = (1 - age / 0.9) ** 1.4 * (0.4 + R(i, 317));
    }
    PX.points(tb.X, tb.Y, nt, LC.warm, { a: 0.42 * aCh * (ct < f ? 1 : 1 - ss(f, f + 0.4, ct)), A: tb.A, glow: 0.5 });
    // the notes in your hand
    const up = Ls.up, back = Ls.back;
    const outA = prog(ct, f + 0.05, f + 0.8);
    ptx(up, Math.max(240, ch.lowX), Math.min(1600, ch.lowY + 132), { size: 60, family: F.hand, weight: 400, color: HAND, a: 0.42, crisp: 0.95, k: prog(ct, M.tLow + 0.55, M.tLow + 1.35), out: outA, seed: 31, t: ct, from: [ch.lowX, ch.lowY + 40], spread: 0.6 });
    // 也涨回来过。 sits just under the old high, to the right of where the line crossed it (the empty side of the climb)
    const ry = cam.y(M.pHi) + sink, rx = cam.x(M.tRec);
    ptx(back, Math.min(1000 - 6 * 60, rx + 34), ry + 72, { size: 60, family: F.hand, weight: 400, align: 'left', color: HAND, a: 0.42, crisp: 0.95, k: prog(tau, M.tRec + 0.05, M.tRec + 0.85), out: outA, seed: 37, t: ct, from: [rx, ry], spread: 0.5 });
  }
  // the ticker header: 你 · 第一次 and the live numbers (canvas; fades with the chart)
  function ticker(ct, S, Ls, ch) {
    const a = ch.aCh * ss(0.2, 0.9, ct); if (a <= 0.003) return;
    ctx.save(); ctx.globalAlpha *= a;
    const y = 318;
    text(Ls.ticker, 96, y, { size: 46, family: F.serif, weight: 600, color: '#ece7dc' });
    text('你', 96, y, { size: 46, family: F.serif, weight: 600, color: KIT.C.warm });
    const M = ch.M, p = Math.exp(M.P(ch.tau));
    let hi = -1e9, lw = 1e9; for (let t = 0; t <= ch.tau; t += 0.05) { const v = M.P(t); hi = Math.max(hi, v); lw = Math.min(lw, v); }
    text(`开 100.00   高 ${Math.exp(hi).toFixed(2)}   低 ${Math.exp(lw).toFixed(2)}`, 98, y + 44, { size: 20, family: F.mono, color: 'rgba(236,231,220,0.45)' });
    text(p.toFixed(2), 1000, y, { size: 58, family: F.mono, weight: 700, color: ch.colNow, align: 'right' });
    text(fmtC(ch.chg), 1000, y + 44, { size: 26, family: F.mono, weight: 700, color: ch.colNow, align: 'right' });
    // a live dot
    const bl = 0.5 + 0.5 * Math.sin(ct * 6);
    ctx.fillStyle = KIT.C.warm; ctx.globalAlpha = a * (0.4 + 0.6 * bl); ctx.beginPath(); ctx.arc(84, y + 37, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ================================================================ B. the stall, the company, the galaxy (b23)
  const O2 = [540, 1040];                                      // the world origin on screen (top-down camera, D = 10)
  const STALL = {
    counter: [[372, 1100], [708, 1100], [708, 1238], [372, 1238], [372, 1100]],
    frame: [[388, 1100], [388, 812], [692, 812], [692, 1100]],
    base: [[320, 1238], [760, 1238]],
  };
  const MN = 64;
  let STR = null;
  function stallRes() { return STR || (STR = { counter: resampleN(STALL.counter, MN), frame: resampleN(STALL.frame, MN), base: resampleN(STALL.base, MN) }); }
  // the stall at the found moment: the last tall candle's body, wicks morph into counter, poles, ground
  function drawStall(ct, S, ch, sc, a) {
    if (a <= 0.003) return;
    const f = S.found, km = ease.inOut(prog(ct, f + 0.05, f + 0.95)), kd = ease.out(prog(ct, f + 0.7, f + 1.5));
    const st = stallRes();
    let src = null;
    if (ch) {
      const M = ch.M, cam = ch.cam, j = ch.iStar - I0, x = cam.x((ch.iStar + 0.5) * DT), bw = Math.max(5, 15 * cam.Z);
      const yo = cam.y(M.O[j]), yc = cam.y(M.Cl[j]), yh = cam.y(M.Hi[j]), yl = cam.y(M.Lo[j]), top = Math.min(yo, yc), bot = Math.max(yo, yc);
      src = { counter: resampleN([[x - bw / 2, top], [x + bw / 2, top], [x + bw / 2, bot], [x - bw / 2, bot], [x - bw / 2, top]], MN),
        frame: resampleN([[x, top], [x, yh], [x, yh - 0.01], [x, top]], MN), base: resampleN([[x, bot], [x, yl]], MN) };
      SRC_CACHE = src;
    } else src = SRC_CACHE;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.translate(O2[0], O2[1]); ctx.scale(sc, sc); ctx.translate(-O2[0], -O2[1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lw = 1.8 / sc;
    const col = [lerp(0.9, 0.93, km), lerp(0.34, 0.9, km), lerp(0.31, 0.84, km)];
    for (const key of ['counter', 'frame', 'base']) {
      const A = src ? src[key] : st[key], B = st[key], pts = [];
      for (let i = 0; i < MN; i++) { const d = clamp(km * 1.3 - (i / MN) * 0.3); pts.push([lerp(A[i][0], B[i][0], d), lerp(A[i][1], B[i][1], d)]); }
      ctx.strokeStyle = rgbS(col, key === 'base' ? 0.5 : 0.85); ctx.lineWidth = key === 'base' ? lw * 0.8 : lw; polyline(pts); ctx.stroke();
    }
    if (kd > 0) {                                             // details draw on: roof, scallops, lamp, goods, counter edge
      ctx.strokeStyle = 'rgba(236,231,220,0.7)'; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.moveTo(372, 812); ctx.lineTo(lerp(372, 540, kd), lerp(812, 768, kd)); ctx.moveTo(708, 812); ctx.lineTo(lerp(708, 540, kd), lerp(812, 768, kd)); ctx.stroke();
      ctx.beginPath(); for (let s = 0; s < 6; s++) { const x0 = 388 + s * 304 / 6; if (s / 6 > kd) break; ctx.moveTo(x0, 812); ctx.arc(x0 + 304 / 12, 812, 304 / 12, Math.PI, 0, true); } ctx.stroke();
      ctx.globalAlpha = a * kd; ctx.beginPath(); ctx.moveTo(372, 1112); ctx.lineTo(708, 1112); ctx.stroke();
      // lamp: cord, shade
      ctx.beginPath(); ctx.moveTo(540, 812); ctx.lineTo(540, 874); ctx.moveTo(524, 888); ctx.lineTo(530, 874); ctx.lineTo(550, 874); ctx.lineTo(556, 888); ctx.closePath(); ctx.stroke();
      // goods: three jars and a small crate
      ctx.strokeStyle = 'rgba(236,231,220,0.45)'; ctx.lineWidth = lw * 0.7;
      for (const [x, w, h] of [[402, 22, 30], [430, 20, 38], [456, 24, 26]]) { K.rrect(x, 1100 - h, w, h, 5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 3, 1100 - h + 7); ctx.lineTo(x + w - 3, 1100 - h + 7); ctx.stroke(); }
      ctx.strokeRect(632, 1074, 52, 26); ctx.beginPath(); ctx.moveTo(632, 1087); ctx.lineTo(684, 1087); ctx.stroke();
    }
    ctx.restore();
  }
  let SRC_CACHE = null;

  // ---------------------------------------------------------------- the 3D camera (orbit: target, distance, pitch, yaw)
  function mkCam(Tx, Ty, Tz, D, pitch, yaw, cy) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cw = Math.cos(yaw), sw = Math.sin(yaw);
    const fx = sw * cp, fy = sp, fz = cw * cp, rx = cw, ry = 0, rz = -sw;
    const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
    return { ex: Tx - fx * D, ey: Ty - fy * D, ez: Tz - fz * D, fx, fy, fz, rx, ry, rz, ux, uy, uz, F: 1000, cx: 540, cy };
  }
  const PP = { x: 0, y: 0, z: 0 };
  function proj(c, x, y, z, o = PP) {
    const dx = x - c.ex, dy = y - c.ey, dz = z - c.ez, zc = dx * c.fx + dy * c.fy + dz * c.fz;
    const iz = c.F / Math.max(0.05, zc);
    o.x = c.cx + (dx * c.rx + dy * c.ry + dz * c.rz) * iz; o.y = c.cy - (dx * c.ux + dy * c.uy + dz * c.uz) * iz; o.z = zc; return o;
  }

  // ---------------------------------------------------------------- terrain (the summit); defined here: the camera uses it
  const ZP = 5.6, HP = 6.0, CLOUD = 3.4;
  let TER = null;
  function terrain() {
    if (TER) return TER;
    const rr = K.rng(4242), pk = [];
    while (pk.length < 54) {
      const x = (rr() - 0.5) * 120, z = -3 + Math.pow(rr(), 0.75) * 190;
      if (Math.hypot(x, z - ZP) < 7.5) continue;
      const far = clamp(z / 120);
      pk.push([x, z, Math.min(5.4, 3.0 + 2.0 * Math.pow(rr(), 1.2) + 0.8 * far), 2.0 + 3.6 * rr() + 3.5 * far]);
    }
    const h = (x, z) => {
      const ang = Math.atan2(z - ZP, x), rug = 1 + 0.18 * Math.sin(ang * 3 + 0.7) + 0.1 * Math.sin(ang * 7 + 2.1);
      let v = HP * Math.exp(-Math.pow(Math.hypot(x * 1.15, z - ZP) / (2.9 * rug), 1.2));
      for (const p of pk) { const e = Math.hypot(x - p[0], z - p[1]) / p[3]; if (e < 4) { const q = p[2] * Math.exp(-Math.pow(e, 1.35)); if (q > v) v = q; } }
      return v + 0.8 * (fbm(x * 0.33 + 7, z * 0.33 + 3, 3) - 0.45) * Math.min(1, v * 0.35 + 0.15);
    };
    const zs = []; let z = -3.5; while (z < 190) { zs.push(z); z += z < 10 ? 0.4 : (z + 6) * 0.07; }
    const NSL = zs.length, NX = 170, SX = new Float32Array(NSL * NX), SH = new Float32Array(NSL * NX);
    for (let k = 0; k < NSL; k++) {
      const half = 15 + 1.0 * Math.max(0, zs[k]);
      for (let j = 0; j < NX; j++) { const x = -half + 2 * half * j / (NX - 1); SX[k * NX + j] = x; SH[k * NX + j] = h(x, zs[k]); }
    }
    // the ridge path 你 climbs: along x ~ 0 from the foot (z = 0) to the summit
    TER = { h, zs, NSL, NX, SX, SH, pk };
    return TER;
  }
  const ridgeX = z => 0.25 * Math.sin(z * 0.9);
  function youPath(ct, S) {                                   // 你's place in the world (3D) from the galaxy on
    const Tm = terrain(), kr = riseK(ct, S);
    const kz = ease.inOut(prog(ct, S.sclimb + 0.45, S.peak - 0.1));
    let z = ZP * kz;
    // the dive off the summit
    const kd = ease.in(prog(ct, S.ride, S.ride + 1.5));
    const x = ridgeX(z) * (1 - kd);
    let y = Tm.h(x, z) * kr;
    if (kd > 0) { z += 9 * kd; y = lerp(y, CLOUD - 1.2, kd); }
    // a step rhythm while climbing
    const step = kz > 0 && kz < 1 ? 0.06 * Math.abs(Math.sin((ct - S.sclimb) * Math.PI * 2 / 0.8333)) : 0;
    return [x, y + step, z];
  }
  const riseK = (ct, S) => ease.inOut(prog(ct, S.command + 3.75, S.sclimb + 1.2));

  function camAt(ct, S) {
    const sp = S.spawn, cm = S.command, M0 = cm + 3.6, M1 = S.sclimb + 1.1, pk = S.peak, rd = S.ride;
    let D = 10 + 2.5 * ss(sp + 0.6, sp + 1.8, ct) + 3.5 * ss(sp + 1.6, sp + 3.0, ct) + 3.5 * ss(sp + 2.6, sp + 4.6, ct) + 2 * ss(cm - 0.5, cm + 3.8, ct);
    let pitch = -90 * DEG + 22 * DEG * ss(sp + 2.2, cm + 3.0, ct);
    let yaw = 0.25 * ss(sp + 1.5, cm + 3.6, ct);
    let Tx = 0, Ty = 0, Tz = 0, cy = lerp(O2[1], 960, ss(sp + 2.5, cm, ct));
    const km = ease.inOut(prog(ct, M0, M1));
    if (km > 0) {
      const yp = youPath(ct, S);
      const kf = ss(M0 + 0.4, M1 + 0.8, ct);
      Tx = yp[0] * kf; Ty = lerp(0, yp[1] + 0.5, kf); Tz = yp[2] * kf;
      D = lerp(D, 7.5, km); pitch = lerp(pitch, -16 * DEG, km); yaw = lerp(yaw, 0.0, km); cy = lerp(cy, 1180, km);
      // climbing: the camera rises with 你 and levels out to look over the top
      const kc = ss(M1, pk, ct);
      pitch = lerp(pitch, -5 * DEG, kc); D = lerp(D, 7.6, kc); cy = lerp(cy, 1120, kc);
      const kp = ss(pk - 0.6, pk + 6.5, ct);
      pitch = lerp(pitch, -3.5 * DEG, kp); D = lerp(D, 7.0, kp); yaw += 0.06 * ss(pk - 1, rd, ct);
      cy = lerp(cy, 1110, kp);
      // the dive
      const kd = ease.inOut(prog(ct, rd, rd + 1.5));
      if (kd > 0) { pitch = lerp(pitch, -32 * DEG, kd); D = lerp(D, 3.2, kd); }
    }
    return mkCam(Tx, Ty, Tz, D, pitch, yaw, cy);
  }

  // ---------------------------------------------------------------- the company: a tree of a thousand agents
  const NN = 1000, ND = 30000;
  let NET = null;
  function network(S) {
    if (NET) return NET;
    const par = new Int32Array(NN), lvl = new Uint8Array(NN), r0 = new Float32Array(NN), th0 = new Float32Array(NN), wd = new Float32Array(NN), tb = new Float32Array(NN), y0 = new Float32Array(NN);
    let n = 0;
    const add = (p, L, th, w, r) => { par[n] = p; lvl[n] = L; th0[n] = th; wd[n] = w; r0[n] = r; y0[n] = (R(n, 509) - 0.5) * 0.12 * r; return n++; };
    for (let k = 0; k < 8; k++) add(-1, 1, k / 8 * TAU + 0.35, TAU / 8, 1.7);
    for (let p = 0; p < 8; p++) for (let c = 0; c < 7; c++) add(p, 2, th0[p] + ((c + 0.5) / 7 - 0.5) * wd[p] * 0.92 + (R(n, 501) - 0.5) * 0.04, wd[p] / 7, 3.3 + (R(n, 502) - 0.5) * 0.6);
    const e2 = n;
    for (let p = 8; p < e2; p++) for (let c = 0; c < 7; c++) add(p, 3, th0[p] + ((c + 0.5) / 7 - 0.5) * wd[p] * 0.95 + (R(n, 503) - 0.5) * 0.02, wd[p] / 7, 5.2 + (R(n, 504) - 0.5) * 1.1);
    const e3 = n;
    for (let pass = 0; n < NN; pass++) for (let p = e2; p < e3 && n < NN; p++) {
      if (pass > 0 && R(p, 505 + pass) > 0.45) continue;
      add(p, 4, th0[p] + (pass === 0 ? -0.22 : 0.22) * wd[p] + (R(n, 506) - 0.5) * 0.03, wd[p] / 2, 7.2 + (R(n, 507) - 0.5) * 1.8 + pass * 0.45);
    }
    // birth: four waves on the spawn beats
    const sp = S.spawn, BT = 0.8333;
    for (let i = 0; i < NN; i++) {
      const L = lvl[i];
      tb[i] = L === 1 ? sp + 0.05 + (i % 8) * 0.06 : L === 2 ? sp + 2 * BT + R(i, 510) * 0.55 : L === 3 ? sp + 3 * BT + R(i, 511) * 0.8 : sp + 4 * BT + R(i, 512) * 1.0;
    }
    // dust: the galaxy's material, attached to nodes (mostly the outer waves), and a bulge round the core
    const da = new Int32Array(ND), dr = new Float32Array(ND), dth = new Float32Array(ND), dy = new Float32Array(ND), dtb = new Float32Array(ND);
    const g = (i, k) => (R(i, k) + R(i, k + 1) + R(i, k + 2) - 1.5) * 1.15;
    for (let j = 0; j < ND; j++) {
      if (j < 3500) { da[j] = -1; dr[j] = 0.75 + Math.abs(g(j, 520)) * 1.1; dth[j] = R(j, 523) * TAU; dy[j] = g(j, 524) * 0.12; dtb[j] = sp - 0.2 + R(j, 527) * 1.2; continue; }
      if (j < 12000) {                                        // the disc's haze
        const r = 0.8 + 8.5 * Math.pow(R(j, 528), 1.4), th = R(j, 529) * TAU; da[j] = -2;
        dr[j] = r; dth[j] = th; dy[j] = g(j, 535) * 0.08; dtb[j] = sp + 1.2 + (r / 9) * 3.2 + R(j, 538) * 0.6; continue;
      }
      const a = Math.floor(Math.pow(R(j, 528), 0.7) * NN); da[j] = a;          // filaments along the links
      const u = R(j, 530), p = par[a], rp = p < 0 ? 0 : r0[p], tp = p < 0 ? th0[a] : th0[p];
      dr[j] = lerp(rp, r0[a], u) + g(j, 531) * 0.07; dth[j] = lerp(tp, th0[a], u) + g(j, 532) * 0.02; dy[j] = lerp(p < 0 ? 0 : y0[p], y0[a], u) + g(j, 535) * 0.03;
      dtb[j] = tb[a] + 0.1 + u * 0.6 + R(j, 538) * 0.3;
    }
    // ring links: neighbours in the same wave, by angle (a web, not a dandelion)
    const ring = [];
    for (const [a0, a1, keep] of [[0, 8, 1], [8, e2, 0.85], [e2, e3, 0.5], [e3, NN, 0.18]]) {
      const ids = []; for (let i = a0; i < a1; i++) ids.push(i);
      ids.sort((a, b) => ((th0[a] % TAU) + TAU) % TAU - ((th0[b] % TAU) + TAU) % TAU);
      for (let q = 0; q < ids.length; q++) if (R(ids[q], 545) < keep) ring.push(ids[q], ids[(q + 1) % ids.length]);
    }
    // the command sentence: one glyph point per agent (two lines), assigned along the tree's angular order
    NET = { ring: Int32Array.from(ring), par, lvl, r0, th0, tb, y0, da, dr, dth, dy, dtb, e2, e3,
      WX: new Float32Array(NN), WY: new Float32Array(NN), WZ: new Float32Array(NN), K: new Float32Array(NN), SX: new Float32Array(NN), SY: new Float32Array(NN), SZ: new Float32Array(NN) };
    return NET;
  }
  const Omega = r => 0.17 / (1 + r * 0.33);
  // the winding of the arms (radians per log-radius), growing while the company grows
  const windK = (ct, S) => 1.25 * ss(S.spawn + 1.5, S.command + 2.5, ct);
  const spiralTh = (th, r, te, wk) => th + Omega(r) * te + wk * Math.log(Math.max(0.3, r) / 1.7);
  function rotT(ct, S) {                                       // the galaxy's rotation clock: it slows to rest as it becomes land
    const t0 = S.spawn, M0 = S.command + 3.5;
    if (ct < M0) return Math.max(0, ct - t0);
    return M0 - t0 + 1.2 * (1 - Math.exp(-(ct - M0) / 1.2));
  }
  let CMD = null;
  function cmdTargets(lines) {
    if (CMD) return CMD;
    const size = 92, ls = [lines[0], lines[1]], ys = [470, 610];
    let step = 4.5, pts = null;
    for (let it = 0; it < 30; it++) {
      const cs = ls.map((l, i) => PX.text(l, { size, family: F.serif, weight: 600, x: 540, y: ys[i], step, jitter: 0.35, seed: 61 + i }));
      const tot = cs[0].n + cs[1].n;
      if (tot <= NN * 1.06) { pts = cs; break; }
      step *= Math.sqrt(tot / (NN * 1.02));
    }
    const all = [];
    pts.forEach((c, li) => { for (let i = 0; i < c.n; i++) all.push([c.X[i], c.Y[i], li]); });
    all.sort((a, b) => a[2] - b[2] || a[0] - b[0]);
    // agents ordered by angle (a depth-first sweep of the tree) take the points left to right
    const net = NET, order = Array.from({ length: NN }, (_, i) => i).sort((a, b) => {
      const ta = ((net.th0[a] - 0.35) % TAU + TAU) % TAU, tb2 = ((net.th0[b] - 0.35) % TAU + TAU) % TAU; return ta - tb2;
    });
    const step2 = all.length / NN, TX = new Float32Array(NN), TY = new Float32Array(NN);
    order.forEach((ni, q) => { const p = all[Math.min(all.length - 1, Math.floor(q * step2))]; TX[ni] = p[0]; TY[ni] = p[1]; });
    CMD = { TX, TY, lines: ls, ys, size };
    return CMD;
  }

  /* the network and its galaxy, then the land it becomes. Returns screen positions for light. */
  function drawWorld(ct, S, Ls, cam, aNet) {
    const net = network(S), Tm = terrain(), te = rotT(ct, S), sp = S.spawn, cm = S.command;
    const kr = riseK(ct, S), km = ease.inOut(prog(ct, cm + 3.6, S.sclimb + 1.0));
    const { par, lvl, r0, th0, tb, y0, WX, WY, WZ, K: KK, SX, SY, SZ } = net;
    const wk = windK(Math.min(ct, cm + 3.6), S);
    // ---- node world positions (parents first)
    for (let i = 0; i < NN; i++) {
      const r = r0[i], th = spiralTh(th0[i], r, te, wk);
      let x = r * Math.cos(th), z = r * Math.sin(th), y = y0[i];
      if (km > 0) {                                           // onto the land: snap to the nearest ridge slice, at its height
        const zs = Tm.zs; let k = 0; while (k < zs.length - 1 && zs[k + 1] < z) k++;
        const zt = Math.abs(zs[k] - z) < Math.abs((zs[k + 1] || 1e9) - z) ? zs[k] : zs[k + 1];
        const yt = Tm.h(x, zt) * kr, d = ease.inOut(clamp(km * 1.4 - R(i, 541) * 0.4));
        z = lerp(z, zt, d); y = lerp(y, yt, d);
      }
      const k = ease.out(clamp((ct - tb[i]) / 0.75)); KK[i] = ct >= tb[i] ? k : -1;
      const p = par[i], px = p < 0 ? 0 : WX[p], py = p < 0 ? 0 : WY[p], pz = p < 0 ? 0 : WZ[p];
      WX[i] = lerp(px, x, k); WY[i] = lerp(py, y, k); WZ[i] = lerp(pz, z, k);
      proj(cam, WX[i], WY[i], WZ[i]); SX[i] = PP.x; SY[i] = PP.y; SZ[i] = PP.z;
    }
    // ---- the command: the agents fly into the sentence and let go again
    const lines = Ls.command ? splitCmd(Ls.command) : null, cmT = lines ? cmdTargets(lines) : null;
    const t0 = cm + 0.45, tR = cm + 3.55;
    if (cmT && ct > t0 && ct < tR + 1.4) {
      for (let i = 0; i < NN; i++) {
        const d = R(i, 551) * 0.55 + ((cmT.TX[i] - 100) / 880) * 0.25;
        const kin = ease.inOut(clamp((ct - t0 - d) / 0.85)), kout = ease.inOut(clamp((ct - tR - R(i, 552) * 0.5) / 0.85));
        const k = kin * (1 - kout); if (k <= 0) continue;
        const arc = Math.sin(Math.PI * k) * 40 * (R(i, 553) - 0.5);
        SX[i] = lerp(SX[i], cmT.TX[i], k) + arc; SY[i] = lerp(SY[i], cmT.TY[i], k) - Math.sin(Math.PI * k) * 30 * R(i, 554);
      }
    }
    const kText = cmT ? ss(t0 + 0.5, t0 + 1.4, ct) * (1 - ss(tR, tR + 0.7, ct)) : 0;
    const fly = cmT ? ss(t0 - 0.1, t0 + 0.2, ct) * (1 - ss(tR + 0.9, tR + 1.4, ct)) : 0;
    // ---- links (fine lines): fade as the land rises; while they write the sentence, only short ones show
    const linkA = aNet * (1 - ss(cm + 3.6, S.sclimb + 0.6, ct));
    if (linkA > 0.003) {
      ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgb(236,231,220)';
      const bk = [[], [], [], []];
      for (let i = 0; i < NN; i++) {
        if (KK[i] < 0) continue; const p = par[i];
        const ax = p < 0 ? SX0 : SX[p], ay = p < 0 ? SY0 : SY[p];
        let a = (lvl[i] === 1 ? 0.5 : lvl[i] === 2 ? 0.34 : lvl[i] === 3 ? 0.2 : 0.13) * Math.min(1, KK[i] * 1.5);
        if (fly > 0) { const L = Math.hypot(SX[i] - ax, SY[i] - ay); a = lerp(a, 0.5 * clamp(1 - L / 30) * kText, fly); }
        const b = Math.min(3, Math.floor(a / 0.12)); if (a < 0.02) continue;
        bk[b].push(ax, ay, SX[i], SY[i]);
      }
      const rg = net.ring;
      for (let q = 0; q < rg.length; q += 2) {
        const i = rg[q], j = rg[q + 1]; if (KK[i] < 1 || KK[j] < 1) continue;
        const L = lvl[i]; let a = L === 1 ? 0.3 : L === 2 ? 0.2 : L === 3 ? 0.12 : 0.08;
        if (fly > 0) a *= 1 - fly;
        const b = Math.min(3, Math.floor(a / 0.12)); if (a < 0.02) continue;
        const dx = SX[i] - SX[j], dy = SY[i] - SY[j]; if (dx * dx + dy * dy > 160 * 160) continue;
        bk[b].push(SX[i], SY[i], SX[j], SY[j]);
      }
      bk.forEach((L, b) => { if (!L.length) return; ctx.globalAlpha = linkA * (0.07 + b * 0.11); ctx.beginPath(); for (let q = 0; q < L.length; q += 4) { ctx.moveTo(L[q], L[q + 1]); ctx.lineTo(L[q + 2], L[q + 3]); } ctx.stroke(); });
      ctx.restore();
    }
    // the sentence also crisp, faintly, so it reads
    if (kText > 0.01 && cmT) cmT.lines.forEach((l, i) => text(l, 540, cmT.ys[i], { size: cmT.size, family: F.serif, weight: 600, align: 'center', color: '#f6e2c0', alpha: kText * 0.42 * aNet }));
    return { net, kText, cmT, km, kr };
  }
  let SX0 = 540, SY0 = 1040;
  const splitCmd = s => { const i = s.indexOf('，'); return i > 0 ? [s.slice(0, i + 1), s.slice(i + 1)] : [s, '']; };
  // role tags beside the first agents (and tiny ones beside the second wave)
  function roleTags(ct, S, Ls, net, aNet) {
    const roles = Ls.roles || [], cm = S.command;
    const fadeAll = aNet * (1 - ss(cm - 0.6, cm + 0.4, ct));
    if (fadeAll <= 0.01) return;
    for (let i = 0; i < Math.min(net.e2, NN); i++) {
      const L = net.lvl[i], k = net.K[i]; if (k < 0.3) continue;
      const role = roles[L === 1 ? i % 8 : net.par[i] % 8]; if (!role) continue;
      const dx = net.SX[i] - SX0, dy = net.SY[i] - SY0, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
      if (L === 1) {
        const a = fadeAll * ss(0.3, 1, k);
        text(role, net.SX[i] + ux * 34, net.SY[i] + uy * 30 + 9, { size: 26, family: F.sans, weight: 500, color: '#ece7dc', align: ux > 0.3 ? 'left' : ux < -0.3 ? 'right' : 'center', alpha: a * 0.85 });
      } else {
        if (i % 2) continue;
        const a = fadeAll * ss(0.5, 1, k) * (1 - ss(S.spawn + 2.8, S.spawn + 4.0, ct)); if (a <= 0.01) continue;
        text(role, net.SX[i] + ux * 16, net.SY[i] + uy * 14 + 5, { size: 15, family: F.sans, weight: 400, color: '#ece7dc', align: ux > 0.3 ? 'left' : ux < -0.3 ? 'right' : 'center', alpha: a * 0.42 });
      }
    }
  }
  function netLight(ct, S, cam, w, aNet) {
    const net = w.net, { SX, SY, SZ, K: KK, lvl, r0, tb, par } = net, cm = S.command;
    // agents: beads that pulse as they work; the command's ring passes through them
    const nb = buf('nodes', NN);
    const rw = (ct - cm) * 15, ring = ct > cm && ct < cm + 1.6;
    for (let i = 0; i < NN; i++) {
      if (KK[i] < 0) { nb.A[i] = 0; continue; }
      const L = lvl[i], base = L === 1 ? 3.2 : L === 2 ? 2.2 : L === 3 ? 1.5 : 1.2;
      const work = 0.65 + 0.7 * Math.pow(Math.max(0, Math.sin(ct * (2.2 + 2.5 * R(i, 561)) + R(i, 562) * 40)), 6);
      const born = 1 + 2.5 * Math.exp(-(ct - tb[i]) * 4);
      const pulse = ring ? 1 + 2.2 * Math.exp(-(((r0[i] - rw) / 1.2) ** 2)) : 1;
      nb.X[i] = SX[i]; nb.Y[i] = SY[i];
      nb.A[i] = base * work * born * pulse * Math.min(1, KK[i] * 2) * (SZ[i] > 0.1 ? Math.min(2.2, 20 / SZ[i]) : 0) * (1 + 0.8 * w.kText);
    }
    PX.points(nb.X, nb.Y, NN, NODE, { a: 0.42 * aNet * (1 - 0.65 * ss(S.sclimb + 0.4, S.peak, ct)), A: nb.A, glow: 0.7, size: 2 });
    // packets: commands running out along the links
    const pa = aNet * (1 - ss(cm + 3.4, cm + 4.2, ct)); if (pa > 0.01) {
      const pb = buf('pk', NN * 3); let m = 0;
      for (let i = 0; i < NN; i++) {
        if (KK[i] < 1) continue; const p = par[i];
        const ax = p < 0 ? SX0 : SX[p], ay = p < 0 ? SY0 : SY[p];
        const u = frac((ct - tb[i]) * (0.55 + 0.6 * R(i, 571)) + R(i, 572));
        for (let q = 0; q < 3; q++) { const uu = u - q * 0.035; if (uu < 0) break; pb.X[m] = lerp(ax, SX[i], uu); pb.Y[m] = lerp(ay, SY[i], uu); pb.A[m] = (1 - q * 0.35) * (0.6 + 0.6 * R(i, 573)); m++; }
      }
      PX.points(pb.X, pb.Y, m, LC.warm, { a: 0.5 * pa * (1 - 0.6 * w.kText), A: pb.A, glow: 0.5 });
    }
  }

  // ---------------------------------------------------------------- galaxy dust -> sea of clouds
  const NCL = 150000;
  let CLD = null;
  function clouds() {
    if (CLD) return CLD;
    const X = new Float32Array(NCL), Y = new Float32Array(NCL), Z = new Float32Array(NCL), B = new Float32Array(NCL), KS = new Int32Array(NCL);
    const Tm = terrain(), zs = Tm.zs;
    for (let i = 0; i < NCL; i++) {
      const u = R(i, 601), z = 1 / lerp(1 / 2.5, 1 / 200, Math.pow(u, 0.62)), half = 4 + 0.6 * z;      // fills the summit's view
      const x = (R(i, 602) - 0.5) * 2 * half;
      const b = fbm(x * 0.16 + 3, z * 0.16 + 9, 4), b2 = fbm(x * 0.6, z * 0.6, 2);
      X[i] = x; Z[i] = z; Y[i] = CLOUD - 0.2 + 1.3 * (b - 0.5) + 0.3 * (b2 - 0.5) + (R(i, 603) - 0.5) * 0.06;
      B[i] = Math.pow(clamp(0.15 + 2.2 * (b - 0.4)), 1.4) * (0.55 + 0.45 * b2);       // billow tops bright, troughs dark
      let k = 0; while (k < zs.length - 1 && zs[k + 1] <= z) k++; KS[i] = k;            // the ridge slice just in front
    }
    return (CLD = { X, Y, Z, B, KS });
  }

  // ================================================================ C. the land: ridge lines, clouds, the sun (b24)
  const OCN = 216, OCW = W / OCN, galK = [1];
  let OCC = null;
  function drawLand(ct, S, Ls, cam, aL, flat) {
    const Tm = terrain(), { zs, NSL, NX, SX: TX, SH } = Tm, kr = riseK(ct, S);
    const lineA = aL * ss(S.command + 4.3, S.sclimb + 1.0, ct), fillA = lineA > 0.003 && aL > 0.5 ? 1 : 0;
    if (lineA <= 0.003) return null;
    const pk = S.peak, sunK = ss(pk - 0.25, pk + 1.6, ct);
    const occ = OCC || (OCC = new Float32Array((NSL + 1) * OCN)), mn = new Float32Array(OCN).fill(H + 50);
    const floorH = lerp(-99, CLOUD - 0.45, ss(S.sclimb + 0.6, S.sclimb + 1.8, ct));
    const Ys = buf('ridgeY', NSL * NX), Xs = buf('ridgeX', NSL * NX);
    // project every slice (near -> far for the occlusion table)
    for (let k = 0; k < NSL; k++) {
      occ.set(mn, k * OCN);
      const z = zs[k];
      for (let j = 0; j < NX; j++) {
        const q = k * NX + j, h = Math.max(SH[q] * kr, floorH);
        proj(cam, TX[q], h, z);
        let y = PP.y; if (PP.z < 0.15) y = NaN;
        if (flat) y = lerp(y, flat.y(k, PP.x), flat.k);
        Xs.X[q] = clamp(PP.x, -4000, W + 4000); Ys.X[q] = y === y ? clamp(y, -4000, H + 4000) : y;
        if (y === y) { const b = Math.floor(PP.x / OCW); if (b >= 0 && b < OCN && y < mn[b]) mn[b] = y; }
      }
      // fill the gaps between samples for the table (a slice is continuous)
      for (let j = 1; j < NX; j++) {
        const q = k * NX + j, x0 = Xs.X[q - 1], x1 = Xs.X[q], y0 = Ys.X[q - 1], y1 = Ys.X[q];
        if (!(y0 === y0 && y1 === y1)) continue;
        const b0 = Math.max(0, Math.ceil(Math.min(x0, x1) / OCW)), b1 = Math.min(OCN - 1, Math.floor(Math.max(x0, x1) / OCW));
        for (let b = b0; b <= b1; b++) { const y = lerp(y0, y1, clamp(((b + 0.5) * OCW - x0) / ((x1 - x0) || 1))); if (y < mn[b]) mn[b] = y; }
      }
    }
    occ.set(mn, NSL * OCN);
    // draw far -> near: fill below each ridge (it hides what is behind), then its line
    const sunX = SUNX, gr = ctx.createLinearGradient(sunX - 700, 0, sunX + 700, 0);
    const warm = sunK;
    gr.addColorStop(0, 'rgba(236,231,220,1)'); gr.addColorStop(0.5, rgbS([lerp(0.93, 1, warm), lerp(0.9, 0.82, warm), lerp(0.86, 0.6, warm)])); gr.addColorStop(1, 'rgba(236,231,220,1)');
    ctx.save(); ctx.lineJoin = 'round';
    for (let k = NSL - 1; k >= 0; k--) {
      const z = zs[k], dz = clamp(1 - Math.log(1 + Math.max(0, z - 6)) / Math.log(190));
      let first = -1, last = -1;
      for (let j = 0; j < NX; j++) { const y = Ys.X[k * NX + j]; if (y === y) { if (first < 0) first = j; last = j; } }
      if (first < 0 || last - first < 2) continue;
      if (fillA > 0.5) {
        ctx.globalAlpha = 1; ctx.fillStyle = BG0; ctx.beginPath();
        ctx.moveTo(Xs.X[k * NX + first], H + 60);
        for (let j = first; j <= last; j++) ctx.lineTo(Xs.X[k * NX + j], Ys.X[k * NX + j]);
        ctx.lineTo(Xs.X[k * NX + last], H + 60); ctx.closePath(); ctx.fill();
      }
      // the line: strong above the clouds, faint inside them
      const aAbove = lineA * (0.22 + 0.55 * dz), aBelow = aAbove * 0.18 * (1 - 0.8 * ss(S.sclimb, pk, ct));
      ctx.lineWidth = z < 8 ? 1.5 : 1.15; ctx.strokeStyle = gr;
      for (const above of [true, false]) {
        ctx.globalAlpha = above ? aAbove : aBelow; if (ctx.globalAlpha < 0.004) continue;
        ctx.beginPath(); let pen = false;
        for (let j = first; j <= last; j++) {
          const q = k * NX + j, isA = SH[q] * kr >= CLOUD - 0.1 || kr < 0.6 || floorH < 0;
          if (isA === above) { pen ? ctx.lineTo(Xs.X[q], Ys.X[q]) : ctx.moveTo(Xs.X[q], Ys.X[q]); pen = true; } else if (pen) { ctx.lineTo(Xs.X[q], Ys.X[q]); pen = false; }
        }
        ctx.stroke();
      }
    }
    ctx.restore();
    return { occ, NSL };
  }
  let SUNX = 630;
  // the sky at dawn and the sun breaking the cloud horizon (drawn before the land; the land hides its lower half)
  function drawSky(ct, S, cam, aS) {
    if (aS <= 0.003) return null;
    const pk = S.peak, pre = ss(S.sclimb, pk, ct), sunK = ss(pk - 0.15, pk + 0.6, ct), big = ss(pk, pk + 5.5, ct) * (1 - 0.7 * ss(S.ride, S.ride + 1.2, ct));
    proj(cam, 0, CLOUD, 4000); const kd = ease.inOut(prog(ct, S.ride + 0.1, S.ride + 1.3));
    let hy = PP.y, sx = SUNX;
    const u = Math.max(0, ct - pk + 0.05);
    let sy = hy + 66 - 62 * (1 - Math.exp(-u / 0.9)) - 13 * u;
    // the dive: the sun is carried down to where the evening sea will have it (low, right)
    if (kd > 0) { sx = lerp(sx, 800, kd); sy = lerp(sy, HZ + 10, kd); hy = lerp(hy, HZ, kd); }
    ctx.save(); ctx.globalAlpha *= aS; ctx.globalCompositeOperation = 'lighter';
    // a dawn band along the horizon (before the sun: a promise; after: gold)
    const band = 0.10 * pre + 0.28 * sunK + 0.12 * big;
    if (band > 0.003) {
      ctx.save(); ctx.translate(sx, hy); ctx.scale(1, 0.22);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1500);
      g.addColorStop(0, `rgba(255,170,100,${band})`); g.addColorStop(0.4, `rgba(255,140,80,${band * 0.4})`); g.addColorStop(1, 'rgba(255,120,70,0)');
      ctx.fillStyle = g; ctx.fillRect(-1600, -1600, 3200, 3200); ctx.restore();
    }
    if (sunK > 0) {
      // the break: first light runs along the cloud horizon
      const fl = ss(pk - 0.1, pk + 0.25, ct) * (0.55 + 0.45 * Math.exp(-Math.max(0, ct - pk) / 1.6));
      ctx.save(); ctx.translate(sx, hy - 2); ctx.scale(1, 0.035);
      let gf = ctx.createRadialGradient(0, 0, 0, 0, 0, 900);
      gf.addColorStop(0, `rgba(255,236,200,${0.9 * fl})`); gf.addColorStop(0.3, `rgba(255,190,120,${0.35 * fl})`); gf.addColorStop(1, 'rgba(255,160,90,0)');
      ctx.fillStyle = gf; ctx.fillRect(-900, -900, 1800, 1800); ctx.restore();
      // the bloom: a fast first light, then a slow, huge swell
      const r1 = 240 + 260 * big, r2 = 700 + 1100 * big;
      let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r2);
      g.addColorStop(0, `rgba(255,200,140,${0.30 * sunK + 0.15 * big})`); g.addColorStop(0.25, `rgba(255,160,100,${0.10 * sunK + 0.06 * big})`); g.addColorStop(1, 'rgba(255,140,80,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r1);
      g.addColorStop(0, `rgba(255,236,200,${0.55 * sunK})`); g.addColorStop(0.3, `rgba(255,196,128,${0.22 * sunK})`); g.addColorStop(1, 'rgba(255,170,100,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - r1, sy - r1, r1 * 2, r1 * 2);
      // rays: fine lines, slowly turning
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgb(255,214,160)';
      for (let i = 0; i < 46; i++) {
        const an = -Math.PI + (i + 0.5) / 46 * Math.PI + 0.04 * Math.sin(ct * 0.3 + i) + (R(i, 641) - 0.5) * 0.05;
        const len = (900 + 900 * R(i, 642)) * (0.3 + 0.7 * ease.out(prog(ct, pk + 0.1 * R(i, 643), pk + 2.5)));
        ctx.globalAlpha = aS * sunK * (0.02 + 0.05 * R(i, 644)) * (0.7 + 0.3 * Math.sin(ct * 0.8 + i * 1.7));
        ctx.beginPath(); ctx.moveTo(sx + Math.cos(an) * 70, sy + Math.sin(an) * 70); ctx.lineTo(sx + Math.cos(an) * len, sy + Math.sin(an) * len); ctx.stroke();
      }
      // the disc, clipped by the cloud horizon
      ctx.globalAlpha = aS; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hy); ctx.clip();
      g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 64); g.addColorStop(0, 'rgba(255,246,226,0.95)'); g.addColorStop(0.85, 'rgba(255,214,150,0.8)'); g.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 64, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
    return { sx, sy, hy, sunK, big };
  }
  function landLight(ct, S, cam, land, sky, aL, w, flatK) {
    // clouds: the galaxy's dust settles into a sea of clouds, culled behind nearer ridges
    const net = w ? w.net : network(S), cl = clouds(), te = rotT(ct, S), sp = S.spawn, cm = S.command;
    const kC = ss(cm + 3.7, S.sclimb + 1.6, ct), occ = land ? land.occ : null;
    const out = buf('cl', NCL), aDust = aL * (1 - ss(S.sclimb + 1.0, S.sclimb + 2.2, ct));
    const ride = S.ride, kDive = ss(ride, ride + 1.4, ct), wk = windK(Math.min(ct, cm + 3.6), S);
    const sunK = sky ? sky.sunK : 0, sx = sky ? sky.sx : 0, sy = sky ? sky.sy : 0;

    let m = 0;
    const g0 = 0.74, g1 = 0.72, g2 = 0.72;
    for (let i = 0; i < NCL; i++) {
      // where this particle was in the galaxy (only the first ND were dust)
      let x, y, z, A0;
      const cx = cl.X[i] + ct * 0.04, cy = cl.Y[i], cz = cl.Z[i];
      if (i < ND) {
        if (ct < net.dtb[i] && kC <= 0) continue;
        const a = net.da[i], r = net.dr[i], th = spiralTh(net.dth[i], r, te, wk);
        let gx = r * Math.cos(th), gz = r * Math.sin(th), gy = net.dy[i];
        const kb = ease.out(clamp((ct - net.dtb[i]) / 1.2)); gx *= kb; gz *= kb; gy *= kb;
        const d = ease.inOut(clamp(kC * 1.5 - R(i, 611) * 0.5));
        x = lerp(gx, cx, d); y = lerp(gy, cy, d); z = lerp(gz, cz, d); galK[0] = d;
        A0 = lerp((a === -1 ? 0.35 : a === -2 ? 0.28 : 0.42) * clamp(kb * 1.5), cl.B[i], d);
        if (d < 1 && kC < 1) A0 = lerp(A0, A0 * aDust / Math.max(0.01, aL), 1 - d);
      } else {
        const fi = ss(S.sclimb + 0.2 + R(i, 612) * 1.2, S.sclimb + 1.6 + R(i, 612) * 1.2, ct); if (fi <= 0) continue;
        x = cx; y = cy; z = cz; A0 = cl.B[i] * fi; galK[0] = 1;
      }
      if (A0 <= 0.01) continue;
      proj(cam, x, y, z); if (PP.z < 0.2) continue;
      const X = PP.x, Y = PP.y; if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
      if (occ && kC > 0.5 && i < NCL) { const ks = cl.KS[i] + 1, b = Math.floor(X / OCW); if (Y > occ[Math.min(land.NSL, ks) * OCN + b] + 1) continue; }
      const near = clamp(5 / PP.z) * clamp((PP.z - 1.2) / 3);
      out.X[m] = X; out.Y[m] = Y; out.A[m] = A0 * (0.8 + 0.9 * clamp(PP.z / 50) * (0.4 + sunK)) * (0.55 + 0.6 * near) * clamp((PP.z - 1.0) / 3);
      // sunlit near the sun
      const sw = sunK * (0.42 + 0.58 * Math.exp(-(Math.abs(X - sx) * 0.8 + Math.abs(Y - sy) * 1.6) / 600));
      let c0 = lerp(g0, 1.0, sw), c1 = lerp(g1, 0.76, sw), c2 = lerp(g2, 0.5, sw);
      if (galK[0] < 1) { const q = galK[0]; c0 = lerp(1.0, c0, q); c1 = lerp(0.86, c1, q); c2 = lerp(0.68, c2, q); }    // the galaxy's warm dust
      out.C[m * 3] = c0; out.C[m * 3 + 1] = c1; out.C[m * 3 + 2] = c2;
      m++;
    }
    if (m) PX.points(out.X, out.Y, m, null, { a: 0.4 * aL * (1 - 0.6 * kDive) * (1 + 0.5 * sunK), A: out.A, C: out.C, glow: 0.85 });
  }

  // ================================================================ D. the seaside road (b25)
  const HZ = 880, ROAD0 = 1300, ROAD1 = 1500, BIKE = { x: 540, ground: 1452, s: 2.3 };
  function speed(ct, S) {                                     // px/s and distance travelled
    const t0 = S.ride + 0.9, tf = S.free, V0 = 1150, V1 = 46, tau = 1.15;
    const ramp = 0.45;                                          // the first 0.45 s: up to speed
    const s0 = ct <= t0 ? 0 : Math.min(ct - t0, ramp) ** 2 / (2 * ramp) * V0 + Math.max(0, Math.min(ct, tf) - t0 - ramp) * V0;
    if (ct <= tf) return { v: ct < t0 ? 0 : V0 * Math.min(1, (ct - t0) / ramp), s: s0 + 2200 };
    const u = ct - tf, v = V1 + (V0 - V1) * Math.exp(-u / tau);
    return { v, s: s0 + 2200 + V1 * u + (V0 - V1) * tau * (1 - Math.exp(-u / tau)) };
  }
  function seaSeat(ct, S) {
    const { v } = speed(ct, S), zoom = lerp(1, 0.8, ease.inOut(prog(ct, S.free, S.end + 0.2)));
    const bob = Math.sin(ct * 8.3) * 1.2 * clamp(v / 600) + Math.sin(ct * 13.1) * 0.5 * clamp(v / 600);
    const x = BIKE.x - 26 * BIKE.s, y = BIKE.ground - 38 * BIKE.s + bob - 86 * BIKE.s;
    return { x: 540 + (x - 540) * zoom, y: HZ + (y - HZ) * zoom, size: 150 * zoom, rot: 0.13 * clamp(v / 900) };
  }
  function drawSea(ct, S, Ls, aS) {
    if (aS <= 0.003) return null;
    const { v, s } = speed(ct, S), fr = S.free, end = S.end;
    const dusk = ss(fr - 0.3, end, ct), zoom = lerp(1, 0.8, ease.inOut(prog(ct, fr, end + 0.2)));
    ctx.save(); ctx.globalAlpha *= aS;
    // sky light: golden hour, then dusk
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    let g = ctx.createLinearGradient(0, HZ - 820, 0, HZ + 420);
    const gk = 1 - 0.55 * dusk;
    g.addColorStop(0, 'rgba(255,150,90,0)'); g.addColorStop(0.45, `rgba(255,150,90,${0.08 * gk})`); g.addColorStop(0.66, `rgba(255,170,110,${0.2 * gk})`);
    g.addColorStop(0.75, `rgba(255,160,100,${0.08 * gk})`); g.addColorStop(1, 'rgba(255,150,90,0)');
    ctx.fillStyle = g; ctx.fillRect(0, HZ - 820, W, 1240);
    g = ctx.createLinearGradient(0, HZ - 300, 0, HZ + 6);
    g.addColorStop(0, 'rgba(150,120,200,0)'); g.addColorStop(1, `rgba(170,120,190,${0.10 * dusk})`);
    ctx.fillStyle = g; ctx.fillRect(0, HZ - 300, W, 306);
    ctx.restore();
    ctx.translate(540, HZ); ctx.scale(zoom, zoom); ctx.translate(-540, -HZ);
    const X0 = -400, X1 = W + 400;
    ctx.lineCap = 'round';
    const line = (x0, y0, x1, y1, a, w = 1, col = 'rgb(236,231,220)') => { ctx.globalAlpha = aS * a; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    // the sun on the horizon (half set, then setting), its path on the water
    const sunX = 800, sunY = HZ + 10 + 66 * ss(fr, end + 0.3, ct), sunA = 1 - 0.75 * dusk;
    L.light(sunX, HZ, 520, `rgba(255,160,100,${0.2 * sunA})`, 1);
    L.light(sunX, HZ - 10, 170, `rgba(255,214,160,${0.35 * sunA})`, 1);
    ctx.save(); ctx.beginPath(); ctx.rect(X0, 0, X1 - X0, HZ); ctx.clip();
    ctx.globalAlpha = aS * 0.75 * sunA; ctx.strokeStyle = KIT.C.free; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(sunX, sunY, 58, 0, TAU); ctx.stroke();
    ctx.globalAlpha = aS * 0.55 * sunA; ctx.fillStyle = '#ffcf98'; ctx.fill();
    ctx.restore();
    line(X0, HZ, X1, HZ, 0.45, 1.2);
    // a far headland on the left
    ctx.globalAlpha = aS * 0.22; ctx.strokeStyle = '#ece7dc'; ctx.lineWidth = 1.1; ctx.beginPath();
    for (let i = 0; i <= 50; i++) { const u = i / 50, x = -60 + u * 430, y = HZ - Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 1.6) * 74; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    // the sea: rows of swells, slower and closer together toward the horizon (parallax)
    for (let r = 0; r < 16; r++) {
      const v01 = r / 15, y = HZ + 12 + Math.pow(v01, 1.75) * (ROAD0 - HZ + 10), par = 0.03 + 0.42 * v01 * v01, dash = 8 + 40 * v01, per = dash * 3.2;
      const off = (s * par + r * 53) % per; ctx.beginPath();
      for (let x = X0 - off, q = 0; x < X1; x += per, q++) {
        const id = Math.floor((s * par + r * 53) / per) - q; if (R(id & 4095, 650 + r) < 0.42) continue;
        const xx = x + (R(id & 4095, 670 + r) - 0.5) * per * 0.6; ctx.moveTo(xx, y); ctx.lineTo(xx + dash, y);
      }
      ctx.globalAlpha = aS * (0.1 + 0.2 * v01) * (1 - 0.35 * dusk); ctx.strokeStyle = '#ece7dc'; ctx.lineWidth = 1.1; ctx.stroke();
      // the sun's path on the water
      const sw = 10 + v01 * 60; ctx.beginPath();
      for (let q = 0; q < 3; q++) { const xx = sunX + (R(r * 3 + q, 690) - 0.5) * sw * 2 + Math.sin(ct * 1.3 + q + r) * 4, l = 6 + v01 * 22; ctx.moveTo(xx - l / 2, y + 2); ctx.lineTo(xx + l / 2, y + 2); }
      ctx.globalAlpha = aS * (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(ct * 2.3 + r * 1.7))) * (1 - v01 * 0.5) * sunA; ctx.strokeStyle = KIT.C.free; ctx.lineWidth = 1.4; ctx.stroke();
    }
    // guardrail (posts race past), the road
    const RT = ROAD0 + 34;
    line(X0, RT, X1, RT, 0.55, 1.4); line(X0, RT + 12, X1, RT + 12, 0.3, 1);
    ctx.beginPath(); const pp = 120, po = s % pp;
    for (let x = X0 - po; x < X1; x += pp) { ctx.moveTo(x, RT); ctx.lineTo(x, RT + 34); }
    ctx.globalAlpha = aS * 0.42; ctx.lineWidth = 1.3; ctx.stroke();
    line(X0, RT + 34, X1, RT + 34, 0.45, 1.3); line(X0, ROAD1, X1, ROAD1, 0.32, 1.3);
    ctx.beginPath(); const dp = 210, doff = (s * 1.0) % dp;
    for (let x = X0 - doff; x < X1; x += dp) { ctx.moveTo(x, 1436); ctx.lineTo(x + 90, 1436); }
    ctx.globalAlpha = aS * 0.28; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.beginPath(); for (let x = X0 - (s * 1.25) % 170; x < X1; x += 170) { ctx.moveTo(x, 1480); ctx.lineTo(x + 22, 1480); }
    ctx.globalAlpha = aS * 0.15; ctx.lineWidth = 1; ctx.stroke();
    // the bike (line art), 你 riding it
    const bob = Math.sin(ct * 8.3) * 1.2 * clamp(v / 600) + Math.sin(ct * 13.1) * 0.5 * clamp(v / 600);
    const bx = BIKE.x, by = BIKE.ground - 38 * BIKE.s + bob;
    bikeArt(bx, by, BIKE.s, s, aS, v);
    ctx.restore();
    // where 你 sits (screen, after zoom)
    const sxy = (x, y) => [540 + (x - 540) * zoom, HZ + (y - HZ) * zoom];
    const yx = sxy(bx - 26 * BIKE.s, by - 86 * BIKE.s), wheel = sxy(bx, BIKE.ground);
    return { v, s, zoom, you: yx, size: 150 * zoom, wheel, dusk, sxy };
  }
  function bikeArt(ox, oy, sc, dist, a, v) {
    ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const st = (w, al) => { ctx.globalAlpha = a * al; ctx.lineWidth = w / sc; ctx.strokeStyle = '#ece7dc'; ctx.stroke(); };
    const circ = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); };
    const path = p => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); };
    ctx.fillStyle = BG0; ctx.globalAlpha = a;
    circ(-86, 0, 38); ctx.fill(); circ(86, 0, 38); ctx.fill();          // the wheels hide the rail behind them
    ctx.beginPath(); ctx.moveTo(-96, -50); ctx.lineTo(-36, -48); ctx.lineTo(30, -24); ctx.lineTo(18, -2); ctx.lineTo(-86, 0); ctx.closePath(); ctx.fill();
    [[-86, 0], [86, 0]].forEach(([x, y], j) => {
      circ(x, y, 38); st(2.0, 0.95); circ(x, y, 31); st(1.0, 0.5); circ(x, y, 5); st(1.3, 0.8);
      ctx.beginPath(); const rot = dist / (38 * sc) + j;
      for (let s = 0; s < 6; s++) { const an = rot + s * TAU / 6; ctx.moveTo(x + Math.cos(an) * 6, y + Math.sin(an) * 6); ctx.lineTo(x + Math.cos(an + 0.2) * 30, y + Math.sin(an + 0.2) * 30); }
      st(0.9, 0.45 * (1 - 0.6 * clamp(v / 900)));
    });
    path([-86, 0, -24, -14]); st(1.7, 0.9);
    ctx.beginPath(); ctx.moveTo(-128, -16); ctx.quadraticCurveTo(-60, -10, -26, -6); st(1.4, 0.65);
    ctx.beginPath(); ctx.moveTo(-28, -8); ctx.lineTo(-30, -36); ctx.lineTo(10, -42); ctx.lineTo(30, -24); ctx.lineTo(18, -2); ctx.closePath(); st(1.4, 0.75);
    path([-14, -36, -6, -16, 12, -14]); st(1, 0.45);
    ctx.beginPath(); ctx.moveTo(-96, -50); ctx.quadraticCurveTo(-70, -56, -36, -48); st(1.7, 0.95);
    path([-96, -50, -118, -44, -110, -36, -80, -38]); st(1.4, 0.8); path([-80, -38, -86, 0]); st(1.3, 0.6);
    path([86, 0, 52, -78]); st(1.8, 0.95); path([90, -2, 56, -80]); st(1, 0.5);
    path([52, -78, 42, -88, 34, -90]); st(1.8, 0.95);
    ctx.beginPath(); ctx.ellipse(66, -66, 7, 10, -0.4, 0, TAU); st(1.4, 0.8);
    ctx.beginPath(); ctx.moveTo(60, -40); ctx.quadraticCurveTo(76, -48, 108, -36); st(1.3, 0.55);
    ctx.beginPath(); ctx.moveTo(-34, -44); ctx.bezierCurveTo(-10, -68, 26, -68, 44, -52); st(1.7, 0.95); path([-34, -44, 40, -44]); st(1.1, 0.5);
    // the headlight's warm beam
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    const gb = ctx.createLinearGradient(70, 0, 300, 0); gb.addColorStop(0, 'rgba(255,205,150,0.10)'); gb.addColorStop(1, 'rgba(255,205,150,0)');
    ctx.fillStyle = gb; ctx.beginPath(); ctx.moveTo(72, -68); ctx.lineTo(300, -110); ctx.lineTo(300, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // wind streaks (canvas, additive) with bright heads (PX)
  const NWD = 520;
  function wind(ct, S, sea, aW) {
    if (aW <= 0.003) return;
    const { v, s } = sea, b = buf('wind', NWD), T1 = [];
    for (let i = 0; i < NWD; i++) {
      const m = 0.45 + 1.6 * R(i, 701) * R(i, 702), span = W + 500;
      const x = (((R(i, 703) * span - s * m) % span) + span) % span - 250;
      const g = (R(i, 704) + R(i, 705) + R(i, 706) - 1.5);
      const y = (R(i, 707) < 0.55 ? 1180 + g * 260 : 640 + g * 520) + 14 * Math.sin(x * 0.006 + R(i, 708) * 6 + ct * 0.5);
      const len = Math.min(260, 6 + v * m * 0.07);
      b.X[i] = x; b.Y[i] = y; b.A[i] = (0.35 + 0.65 * R(i, 709)) * clamp(Math.min(x + 100, W + 100 - x) / 250);
      T1.push(x + len, y + Math.sin(x * 0.01) * 2);
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = KIT.C.free; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    const a0 = ctx.globalAlpha;
    for (let bk = 0; bk < 4; bk++) {
      ctx.globalAlpha = a0 * aW * (0.06 + bk * 0.06); ctx.beginPath();
      for (let i = 0; i < NWD; i++) { if (Math.min(3, Math.floor(b.A[i] * 4)) !== bk) continue; ctx.moveTo(b.X[i], b.Y[i]); ctx.lineTo(T1[i * 2], T1[i * 2 + 1]); }
      ctx.stroke();
    }
    ctx.restore();
    PX.points(b.X, b.Y, NWD, LC.free, { a: aW * 0.45, A: b.A, glow: 0.4 });
  }
  /* a line written by the wind: its particles blow in from the right, settle into the glyphs, hold, and blow on */
  function windText(str, x, y, o) {
    const size = o.size, ct = o.ct, seed = o.seed;
    const cl = PX.text(str, { size, family: F.serif, weight: 500, x: 0, y: 0, align: o.align, step: Math.max(1.3, size / 36), seed });
    let x0 = 1e9, x1 = -1e9; for (let i = 0; i < cl.n; i++) { x0 = Math.min(x0, cl.X[i]); x1 = Math.max(x1, cl.X[i]); }
    const n = cl.n, b = buf('wt' + seed, n * 2); let m = 0, formed = 0;
    for (let i = 0; i < n; i++) {
      const xn = (cl.X[i] - x0) / (x1 - x0 || 1), gx = x + cl.X[i], gy = y + cl.Y[i];
      const ta = o.tIn + xn * 0.9 + R(i, seed + 2) * 0.45, fl = 1.0, k = (ct - (ta - fl)) / fl;
      if (k <= 0) continue;
      let px, py, a;
      if (k < 1) {
        const e = 1 - Math.pow(1 - k, 3), sx = W + 40 + R(i, seed + 3) * 300, sy = gy + (R(i, seed + 4) - 0.5) * 300;
        px = lerp(sx, gx, e); py = lerp(sy, gy, e) + Math.sin(k * 4 + i) * 16 * (1 - e); a = 0.35 + 0.65 * k;
      } else { px = gx + Math.sin(ct * (0.9 + R(i, seed + 5)) + i) * 0.7; py = gy + Math.cos(ct * (0.8 + R(i, seed + 6)) + i) * 0.7; a = 1; formed++; }
      const tr = o.tOut + (1 - xn) * 0.5 + R(i, seed + 7) * 0.7, kr = ct - tr;
      if (kr > 0) { px -= kr * kr * o.vOut * (0.5 + R(i, seed + 8)) + kr * 40; py -= kr * 30 * (R(i, seed + 9) - 0.2); a *= clamp(1 - kr / 2.4); }
      if (a <= 0.01) continue;
      b.X[m] = px; b.Y[m] = py; b.A[m] = a; m++;
      if (k < 1 && k > 0.05) { b.X[m] = px + 10 * (1 - k); b.Y[m] = py; b.A[m] = a * 0.5; m++; }
    }
    if (m) PX.points(b.X, b.Y, m, o.color, { a: o.a, A: b.A, glow: 0.35 });
    const ck = clamp(formed / n * 1.25 - 0.25) * (1 - ss(o.tOut, o.tOut + 0.6, ct));
    if (ck > 0.01) text(str, x, y, { size, family: F.serif, weight: 500, align: o.align, color: rgbS(o.color), alpha: ck * 0.55 });
  }

  // ================================================================ the montage: one function of ct
  function scene(ct, S) {
    const Ls = S.L, f = S.found, sp = S.spawn, cm = S.command, sc = S.sclimb, pk = S.peak, rd = S.ride, fr = S.free;
    // ---------- A: the chart (b22 .. the first second of b23)
    let ch = null;
    if (ct < f + 1.0) { ch = drawChart(ct, S, Ls); if (ch) ticker(ct, S, Ls, ch); }
    // ---------- 3D world (b23 spawn .. b25 dive)
    const use3D = ct > f - 0.01 && ct < rd + 1.7;
    const cam = use3D ? camAt(ct, S) : null;
    if (cam) { proj(cam, 0, 0, 0); SX0 = PP.x; SY0 = PP.y; }
    // the sky first (the land hides the low sun)
    const aDive = 1 - ss(rd + 0.75, rd + 1.6, ct);
    const sky = cam && ct > sc - 0.5 ? drawSky(ct, S, cam, aDive) : null;
    // the flattening of the ridges into sea swells during the dive
    const flatK = ss(rd + 0.25, rd + 1.35, ct);
    const flat = flatK > 0 ? { k: flatK, y: (k, x) => { const Tm = terrain(), z = Math.max(1, Tm.zs[k]); return HZ + 12 + Math.pow(clamp(1 - Math.log(z) / Math.log(190)), 1.75) * (ROAD0 - HZ + 10); } } : null;
    const land = cam && ct > cm + 3.5 ? drawLand(ct, S, Ls, cam, aDive, flat) : null;
    // stall (screen space, scaled with the camera's pull-back)
    const stA = ct > f - 0.01 ? (1 - ss(sp + 1.2, sp + 2.8, ct)) : 0;
    const stSc = cam ? 10 / Math.max(10, Math.hypot(cam.ex, cam.ey, cam.ez)) : 1;
    if (stA > 0) drawStall(ct, S, ch, stSc, stA);
    // network lines
    const aNet = ct > sp - 0.1 ? 1 : 0;
    const world = cam && aNet && ct < sc + 2.5 ? drawWorld(ct, S, Ls, cam, aNet) : null;
    if (world) roleTags(ct, S, Ls, world.net, aNet);
    // ---------- D: the seaside
    const aSea = ss(rd + 0.7, rd + 1.5, ct);
    const sea = ct > rd + 0.5 ? drawSea(ct, S, Ls, aSea) : null;

    // ================= light
    PX.begin();
    if (ch) chartLight(ct, S, Ls, ch);
    if (cam && ct > sp - 0.3) landLight(ct, S, cam, land, sky, aDive, world, flatK);
    if (world) netLight(ct, S, cam, world, aNet);
    // ---------- 你
    let yx = 0, yy = 0, ysz = 112, yrot = 0, yown = 1, ya = 0.55, clipY = null, haloA = 0.8, haloR = 1;
    if (ct < f) {
      // from the lamp's 你 (b20's last frame) onto the head of the price line
      const k = ease.inOut(prog(ct, 0.0, 0.85));
      const hx = ch ? ch.xh - 6 : HX, hy = ch ? ch.yh : 1040;
      const crash = ss(S.dip, S.dip + 0.12, ct) * Math.exp(-Math.max(0, ct - S.dip) * 1.6);
      yrot = 0.42 * crash * Math.sin((ct - S.dip) * 7) + 0.12 * ss(S.kclimb, S.kclimb + 0.6, ct) * (1 - ss(f - 0.3, f, ct));
      ysz = lerp(300, 112, k); yx = lerp(625, hx, k); yy = lerp(955, hy - 112 * 0.56, k);
      yown = 1 - 0.38 * (ch ? ch.dipK : 0);
      ya = lerp(0.95, 0.5, k); haloR = lerp(1.25, 1, k); haloA = lerp(1.0, 0.85, k) * yown;      // b20's lamp-bright 你, settling
    } else if (ct < sp + 0.3) {
      // down off the candle, behind the counter of the stall
      const k = ease.inOut(prog(ct, f + 0.15, f + 1.15)), M = market(S), cam2 = chartCam(f, S, M);
      const hx = cam2.x(cam2.tau) - 6, hy = cam2.y(M.P(cam2.tau)) - 112 * 0.56;
      ysz = lerp(112, 150, k); yx = lerp(hx, 540, k); yy = lerp(hy, 1030, k) - Math.sin(Math.PI * k) * 60; clipY = k > 0.6 ? 1100 : null;
      const k2 = ease.inOut(prog(ct, sp - 0.4, sp + 0.3)); yy = lerp(yy, SY0, k2); clipY = k2 > 0.3 ? null : clipY;
      haloA = 0.75;
    } else if (!cam) { ya = 0;   // (the sea draws 你 from here on)
    } else {
      // the core of the network; then on the land, climbing; the summit; the dive
      const yp = youPath(ct, S); proj(cam, yp[0], yp[1], yp[2]);
      const kl = ss(cm + 3.6, sc + 1.0, ct);
      const phys = 1.0 * 1000 / Math.max(0.3, PP.z);
      ysz = lerp(Math.max(84, 1.5 * 1000 / Math.max(0.3, Math.hypot(cam.ex, cam.ey, cam.ez))), Math.min(260, phys), kl);
      yx = PP.x; yy = lerp(PP.y, PP.y - ysz * 0.5, kl);
      yrot = 0.1 * ss(sc + 0.4, sc + 0.9, ct) * (1 - ss(pk - 0.4, pk, ct));
      haloA = lerp(0.6, 0.9, kl); haloR = 1 + 0.4 * ss(sp, cm, ct) * (1 - kl);
      if (ct > rd + 0.5) {                                  // the dive lands on the bike: one 你 all the way
        const kk = ease.inOut(prog(ct, rd + 0.5, rd + 1.45)), seat = seaSeat(ct, S);
        yx = lerp(yx, seat.x, kk); yy = lerp(yy, seat.y, kk); ysz = lerp(ysz, seat.size, kk); yrot = lerp(yrot, seat.rot, kk);
      }
    }
    let youB = null;
    const youOn = !(sea && ct >= rd + 1.45);
    if (youOn && ya > 0.01) youB = you(yx, yy, ysz, { t: ct, rot: yrot, own: yown, a: ya, clipY });
    // the stall's bulb
    if (ct > f + 0.9 && ct < sp + 3) {
      const kb = ss(f + 1.0, f + 1.3, ct) * (1 - ss(sp - 0.4, sp + 0.4, ct)), bsc = stSc * stA;
      if (kb > 0) { const bx = O2[0], by = O2[1] + (896 - O2[1]) * stSc; PX.dot(bx, by, LC.warm, 1.6 * kb * bsc, 1); PX.dot(bx, by - 2, [1, 0.95, 0.85], 0.9 * kb * bsc, 1); }
    }
    // ---------- the words
    if (ct > f + 0.9 && ct < sp + 2.5)
      ptx(Ls.stall, 540, 1196, { size: 60, family: F.hand, weight: 400, color: HAND, a: 0.42, crisp: 0.95, k: prog(ct, f + 1.25, f + 2.3), out: prog(ct, sp + 0.9, sp + 2.0), seed: 41, t: ct, from: [540, 896] });
    if (world && ct > sp + 1.5 && ct < cm + 1.2)
      ptx(Ls.company, 540, 1650, { size: 80, weight: 500, color: [1, 0.86, 0.66], a: 0.45, crisp: 0.9, k: prog(ct, sp + 1.9, sp + 3.2), out: prog(ct, cm - 0.1, cm + 0.9), seed: 43, t: ct, from: [SX0, SY0], spread: 0.5, outVec: [0, -260] });
    if (sky && ct > pk) {
      const from = [sky.sx, sky.sy], out = prog(ct, rd, rd + 0.9);
      ptx(Ls.top, 540, 392, { size: 104, weight: 600, color: GOLD, a: 0.5, crisp: 0.9, k: prog(ct, pk + 0.85, pk + 2.6), out, seed: 47, t: ct, from, spread: 0.8, outVec: [0, -320], glow: 0.45 });
      ptx(Ls.small, 540, 540, { size: 104, weight: 600, color: GOLD, a: 0.5, crisp: 0.9, k: prog(ct, pk + 2.3, pk + 4.0), out, seed: 53, t: ct, from, spread: 0.8, outVec: [0, -320], glow: 0.45 });
    }
    // ---------- the journey
    if (sea) {
      wind(ct, S, sea, aSea);
      if (ct >= rd + 1.45) {
      const sz = sea.size, lean = 0.13 * clamp(sea.v / 900);
      const yb = you(sea.you[0], sea.you[1], sz, { t: ct, rot: lean, own: 1, a: 0.55, tag: 1 });
      // light torn off 你 by the wind
      const n = 600, tb = buf('torn', n), vf = clamp(sea.v / 1150);
      for (let i = 0; i < n; i++) {
        const age = frac(ct * (0.7 + 0.9 * R(i, 721)) + R(i, 722)), j = (i * 37) % yb.n;
        tb.X[i] = yb.X[j] - age * (60 + 340 * R(i, 723)) * (0.15 + vf); tb.Y[i] = yb.Y[j] - age * 24 * R(i, 724) + Math.sin(age * 6 + i) * 5 * age;
        tb.A[i] = Math.pow(1 - age, 1.3) * (0.4 + 0.8 * R(i, 725)) * (0.25 + 0.75 * vf);
      }
      PX.points(tb.X, tb.Y, n, LC.warm, { a: 0.4, A: tb.A, glow: 0.5 });
      }
      windText(Ls.wind, 110, 520, { size: 92, align: 'left', ct, seed: 81, tIn: rd + 1.7, tOut: fr + 1.2, vOut: 180, color: [1, 0.86, 0.66], a: 0.5 });
      windText(Ls.feel, 975, 668, { size: 92, align: 'right', ct, seed: 87, tIn: rd + 3.1, tOut: fr + 1.6, vOut: 150, color: [1, 0.86, 0.66], a: 0.5 });
    }
    PX.flush({ exposure: 1.4 });
    // halos after the light (soft, additive)
    if (youOn && ya > 0.01) halo(yx, yy, haloR * ysz * 1.15, haloA * Math.min(1, ya / 0.55));
    if (sea && ct >= rd + 1.45) halo(sea.you[0], sea.you[1], sea.size * 1.2, 0.8 * (1 + 0.25 * sea.dusk));
    if (ct > f + 0.9 && ct < sp + 1) { const kb = ss(f + 1.0, f + 1.4, ct) * (1 - ss(sp - 0.4, sp + 0.4, ct)); halo(O2[0], 896, 200, kb); }
  }

  // ================================================================ registration
  function draw(ctx_, V, lt, api) {
    const S = timing(), ct = lt + api.beat.start - S.t0;
    scene(ct, S);
  }
  const off = (api, S) => api.beat.start - S.t0;
  T.register('kline', {
    draw,
    cues(V, api) {
      const S = timing(), o = off(api, S);
      return [
        { t: 0, type: 'beat' },
        { t: 0.9, type: 'ticks', dur: +(S.dip - 1.1).toFixed(2), n: 18, p0: 0.3, p1: 0.85 },
        { t: S.dip - o, type: 'drop' },
        { t: S.kclimb - o, type: 'beat' },
        { t: S.kclimb - o, type: 'rise', dur: +(S.found - S.kclimb).toFixed(3) },
      ];
    },
  });
  T.register('agents', {
    draw,
    cues(V, api) {
      const S = timing(), o = off(api, S), BT = 0.8333, sp = S.spawn - o, cm = S.command - o;
      return [
        { t: S.found - o, type: 'beat' },
        { t: S.found + 1.0 - o, type: 'glow' },
        { t: sp, type: 'spawn', dur: 0.6, n: 8 },
        { t: sp + 2 * BT, type: 'spawn', dur: 0.6, n: 56 },
        { t: sp + 3 * BT, type: 'spawn', dur: 0.8, n: 392 },
        { t: sp + 4 * BT, type: 'spawn', dur: 1.0, n: 544 },
        { t: sp + 1.9, type: 'swell', dur: 1.3 },
        { t: cm, type: 'pulse' },
        { t: cm + 0.45, type: 'whoosh', dur: 1.2 },
        { t: cm + 2 * BT, type: 'pulse' },
      ];
    },
  });
  T.register('summit', {
    draw,
    cues(V, api) {
      const S = timing(), o = off(api, S);
      return [
        { t: S.sclimb - o, type: 'beat' },
        { t: S.sclimb - o, type: 'rise', dur: +(S.peak - S.sclimb).toFixed(3) },
        { t: S.peak - o, type: 'peak' },
        { t: S.peak + 0.85 - o, type: 'swell', dur: 1.6 },
        { t: S.peak + 2.3 - o, type: 'glow' },
      ];
    },
  });
  T.register('journey', {
    draw,
    cues(V, api) {
      const S = timing(), o = off(api, S), BT = 0.8333;
      return [
        { t: S.ride - o, type: 'whoosh', dur: 1.5 },
        { t: S.ride + 2 * BT - o, type: 'beat' },
        { t: S.ride + 1.2 - o, type: 'wind', dur: +(S.free - S.ride + 0.4).toFixed(2) },
        { t: S.free - o, type: 'swell', dur: 2.5 },
        { t: S.free + 1.6 - o, type: 'resolve' },
      ];
    },
  });
})();
