/* 概率不是决定 (e4): a probability is not a decision.
 * b14 threshold — a beam of light on a fulcrum. A gold ingot (+300万) and a red one (−100万) land on its ends; the
 *                 fulcrum slides until the beam balances, and where it stops on the 0–100% axis IS the threshold
 *                 (loss / (gain + loss) = 25%): found by physics, not stated. The line drops there; the 27% bead
 *                 slides in just past it → 投.
 * b15 other     — (continues b14) for him the red weight swells (a loss feels double), the beam slams over, the
 *                 fulcrum slides to balance at 40%, the line goes with it, the same 27% bead is now short → 不投.
 *                 Then both rigs stacked: 25% 投 / 40% 不投, one gold thread through the same 27%.
 * b16 gap       — an endless log zoom into the 2 points between 25% and 27%: graduations subdivide and stream
 *                 past until the gap is a canyon; we fall into it; one new bead of evidence glints in the dark.
 * The beam is a real (deterministic) rigid-body simulation integrated from the chain's start every frame: pure in t. */
(function () {
  const { W, H, F, clamp, lerp, prog, ease, text, measure } = K;
  const { C, type, beat } = KIT;
  const TAU = Math.PI * 2;
  const COL = PX.COL;
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

  // ---------------------------------------------------------------- scene geometry (base coordinates, full frame)
  const X0 = 190, X1 = 890, LB = X1 - X0;       // the beam / the 0–100% axis
  const PY = 1030, AY = 1150, TY = 1310;          // pivot (top of fulcrum), axis, probability track
  const VY = 1585;                                 // verdict baseline
  const GOLD_S = 200, RED_S = GOLD_S / Math.sqrt(3), FELT_S = GOLD_S * Math.sqrt(2 / 3);   // area ∝ value: 300 / 100 / 200
  const BEAM_T = 4;                                // beam half thickness
  const vx = v => X0 + v / 100 * LB;

  // ---------------------------------------------------------------- scratch buffers (reused every frame; no state)
  let SX = new Float32Array(1 << 16), SY = new Float32Array(1 << 16), SA = new Float32Array(1 << 16);
  function scratch(n) { if (SX.length < n) { SX = new Float32Array(n); SY = new Float32Array(n); SA = new Float32Array(n); } }

  // ---------------------------------------------------------------- particle shapes (cached, normalised)
  const shapeCache = {};
  /** a luminous ingot: points in [-.5,.5]^2 with bright rims and a lit top face */
  function ingot(key, step) {
    if (shapeCache[key]) return shapeCache[key];
    const xs = [], ys = [], as = [];
    const n1 = Math.round(1 / step);
    for (let j = 0; j <= n1; j++) for (let i = 0; i <= n1; i++) {
      const k = j * (n1 + 1) + i;
      const x = (i + (PX.rand(k, 41) - 0.5) * 0.9) * step - 0.5, y = (j + (PX.rand(k, 42) - 0.5) * 0.9) * step - 0.5;
      if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) continue;
      const d = Math.min(0.5 - Math.abs(x), 0.5 - Math.abs(y));           // distance to the rim
      const rim = Math.exp(-d / 0.011), top = Math.exp(-(y + 0.5) / 0.05) * 0.9;
      const body = 0.7 - 0.46 * (y + 0.5) + 0.18 * Math.exp(-((x + y * 0.6 + 0.15) ** 2) / 0.006);   // lit from above + a sheen
      const grain = 0.8 + 0.4 * PX.rand(k, 43);
      xs.push(x); ys.push(y); as.push((body + 1.5 * rim + top) * grain);
    }
    return (shapeCache[key] = { X: Float32Array.from(xs), Y: Float32Array.from(ys), A: Float32Array.from(as), n: xs.length });
  }
  /** the "felt" shell around the red ingot: points whose square radius r = max(|x|,|y|) is in (0, 1] (0 = core edge) */
  function shell() {
    if (shapeCache.shell) return shapeCache.shell;
    const n = 5200, X = new Float32Array(n), Y = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const side = (PX.rand(i, 51) * 4) | 0, u = PX.rand(i, 52) * 2 - 1, r = Math.sqrt(PX.rand(i, 53));
      const [x, y] = side === 0 ? [u, -1] : side === 1 ? [1, u] : side === 2 ? [u, 1] : [-1, u];
      X[i] = x; Y[i] = y; R[i] = r;
    }
    return (shapeCache.shell = { X, Y, R, n });
  }
  /** a beam of light: s along (0..1, slightly beyond), t across (-1..1) */
  function beamShape() {
    if (shapeCache.beam) return shapeCache.beam;
    const n = 5200, S = new Float32Array(n), Tt = new Float32Array(n), A = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      S[i] = -0.035 + 1.07 * (i + PX.rand(i, 61)) / n;
      const t = (PX.rand(i, 62) * 2 - 1); Tt[i] = t * Math.abs(t) ** 0.3;
      A[i] = 0.55 + 0.45 * (1 - Math.abs(Tt[i])) + 0.25 * PX.rand(i, 63);
    }
    return (shapeCache.beam = { S, T: Tt, A, n });
  }
  /** the fulcrum: a filled wedge, u across (-1..1 at the base), v down (0 apex .. 1 base) */
  function wedge() {
    if (shapeCache.wedge) return shapeCache.wedge;
    const xs = [], vs = [], as = [];
    for (let i = 0; i < 3200; i++) {
      const v = Math.sqrt(PX.rand(i, 71)), u = PX.rand(i, 72) * 2 - 1;
      const edge = Math.exp(-(1 - Math.abs(u)) / 0.06) + Math.exp(-(1 - v) / 0.03) * 0.8;
      xs.push(u); vs.push(v); as.push(0.3 + 0.9 * edge);
    }
    return (shapeCache.wedge = { U: Float32Array.from(xs), V: Float32Array.from(vs), A: Float32Array.from(as), n: xs.length });
  }
  const glyphCloud = (ch, size) => PX.text(ch, { size, family: F.serif, weight: 600, x: 0, y: 0, step: size / 105, seed: ch.charCodeAt(0) % 97 + 3 });

  // ---------------------------------------------------------------- the chain's schedule (chain-local seconds)
  // b14 starts the chain (chain time 0 = b14 start). Times come from api.steps so they follow the script.
  function schedule(api) {
    const s = {}; for (const st of api.steps) s[st.show] = st.lt - api.chainStart;
    const L = s.lever, sc = {
      calc: s.calc, lever: L, line: s.line, go: s.go, heavy: s.heavy, slide: s.slide, split: s.split, both: s.both,
      beamIn: L, goldLand: L + 0.75, redLand: L + 1.5, slide1: [L + 2.25, L + 4.75],
      dotIn: [s.go, s.go + 1.1], touLit: s.go + 1.5,
      swell: [s.heavy + 1.5, s.heavy + 3.0], slide2: [s.slide + 0.2, s.slide + 2.7], buLit: s.slide + 3.0,
    };
    sc.key = JSON.stringify(s);
    return sc;
  }
  const Gw = (S, T) => T >= S.goldLand ? 3 : 0;
  const Rw = (S, T) => T >= S.redLand ? 1 + ease.inOut(prog(T, S.swell[0], S.swell[1])) : 0;
  const fulcrum = (S, T) => T < S.slide1[0] ? 0.5 : T < S.slide2[0] ? 0.5 - 0.25 * ease.inOut(prog(T, S.slide1[0], S.slide1[1]))
    : 0.25 + 0.15 * ease.inOut(prog(T, S.slide2[0], S.slide2[1]));
  // where the threshold line sits (it rides on the fulcrum once it has dropped)
  const lineV = (S, T) => fulcrum(S, T) * 100;

  // ---------------------------------------------------------------- rigid-body beam (integrated, cached per schedule)
  // I·θ'' = g·(τ·cosθ − k·sinθ) − c·θ'   τ = R·(1−f) − G·f (positive: right end down);  stops at ±θmax (inelastic)
  const TH_MAX = 0.16, SIM_DT = 1 / 240;
  let SIM = null;
  function sim(S) {
    if (SIM && SIM.key === S.key) return SIM;
    const Tend = S.both + 6, n = Math.ceil(Tend / SIM_DT) + 2, th = new Float32Array(n);
    let a = 0, w = 0, ig = false, ir = false, stopHits = [];
    for (let i = 0; i < n; i++) {
      const T = i * SIM_DT; th[i] = a;
      const f = fulcrum(S, T), G = Gw(S, T), R = Rw(S, T);
      if (!ig && T >= S.goldLand) { ig = true; w -= 1.2; }
      if (!ir && T >= S.redLand) { ir = true; w += 1.0; }
      const I = G * f * f + R * (1 - f) * (1 - f) + 0.4, tau = R * (1 - f) - G * f;
      w += ((9 * (tau * Math.cos(a) - 2.5 * Math.sin(a)) - 3.2 * w) / I) * SIM_DT; a += w * SIM_DT;
      if (a > TH_MAX) { if (w > 0.25) stopHits.push(T); a = TH_MAX; if (w > 0) w = -w * 0.25; }
      if (a < -TH_MAX) { if (w < -0.25) stopHits.push(T); a = -TH_MAX; if (w < 0) w = -w * 0.25; }
    }
    return (SIM = { key: S.key, th, n, stopHits });
  }
  function theta(S, T) {
    const s = sim(S), x = clamp(T / SIM_DT, 0, s.n - 1.001), i = x | 0, k = x - i;
    return s.th[i] * (1 - k) + s.th[i + 1] * k;
  }

  // ---------------------------------------------------------------- one rig: weights + beam + fulcrum + axis + track
  /* st: { f, th, beamK, axisA, gold: {land, k} , red: {land, k, felt}, lineV, lineDrop, lineA, lineLabel, lineLabelA,
           dotV, dotA, readoutA, shakeY, T, flash }
     m:  { ox, oy, sc } — base → screen;  a: overall alpha.  Particles only (call inside PX.begin/flush). */
  function rigGeom(st, m) {
    const c = Math.cos(st.th), s = Math.sin(st.th), f = st.f;
    const px0 = vx(f * 100), py0 = PY + (st.shakeY || 0);
    const P = (u, t) => {                       // beam param u (0..1) + offset t along the beam's normal (up = −)
      const d = (u - f) * LB;
      return [px0 + d * c + t * s, py0 + d * s - t * c];
    };
    const M = (x, y) => [m.ox + x * m.sc, m.oy + y * m.sc];
    return { c, s, P, M, px0, py0 };
  }
  function rigParticles(st, m, a) {
    if (a <= 0.003) return;
    const g = rigGeom(st, m), { c, s, P, M } = g, sc = m.sc;
    const ka = Math.pow(sc, 1.7);            // shrinking the rig packs the same particles tighter: keep the light per pixel
    a *= ka;
    // --- beam (draws out from the pivot, brightens as it levels)
    if (st.beamK > 0) {
      const B = beamShape(); scratch(B.n);
      const lev = st.levelGlow || 0, bk = st.beamK;
      let j = 0;
      for (let i = 0; i < B.n; i++) {
        const u = B.S[i]; if (Math.abs(u - st.f) > bk * 1.1) continue;
        const [x, y] = P(u, B.T[i] * BEAM_T); const [X, Y] = M(x, y);
        SX[j] = X; SY[j] = Y; SA[j] = B.A[i]; j++;
      }
      const col = mix(COL.white, COL.gold, 0.25 + 0.5 * lev);
      PX.points(SX, SY, j, col, { a: a * (0.5 + 0.35 * lev + 0.6 * (st.flash || 0)), A: SA, glow: 0.28 });
    }
    // --- fulcrum wedge (apex under the pivot, base on the axis)
    if (st.axisA > 0) {
      const Wd = wedge(); scratch(Wd.n);
      const ax = g.px0, top = g.py0 + BEAM_T + 1, h = AY - top, hw = 46;
      for (let i = 0; i < Wd.n; i++) { const v = Wd.V[i]; const [X, Y] = M(ax + Wd.U[i] * hw * v, top + v * h); SX[i] = X; SY[i] = Y; SA[i] = Wd.A[i]; }
      PX.points(SX, SY, Wd.n, COL.cool, { a: a * st.axisA * 0.42, A: SA, glow: 0.3 });
    }
    // --- the two weights
    for (const side of ['gold', 'red']) {
      const w = st[side]; if (!w || w.k <= 0) continue;
      const u = side === 'gold' ? 0 : 1, core = side === 'gold' ? GOLD_S : RED_S;
      const felt = side === 'red' ? (w.felt || 0) : 0, outer = lerp(core, FELT_S, felt);
      // falling: drop from above with gravity, land exactly at w.land; squash on impact
      const dt = st.T - w.land, fall = dt < 0 ? -(dt * dt) * 2400 : 0;
      const sq = dt >= 0 ? Math.exp(-dt * 9) * Math.cos(dt * 30) * 0.07 : 0;
      const sx = 1 + sq * 0.6, sy = 1 - sq;
      const [bx, by] = P(u, BEAM_T + 1 + core * sy / 2);          // centre of the core ingot
      const cx = bx, cy = by + fall;
      const sh = ingot(side, side === 'gold' ? 1 / 110 : 1 / 64); scratch(sh.n);
      for (let i = 0; i < sh.n; i++) {
        const lx = sh.X[i] * core * sx, ly = sh.Y[i] * core * sy;
        const [X, Y] = M(cx + lx * c - ly * s, cy + lx * s + ly * c); SX[i] = X; SY[i] = Y; SA[i] = sh.A[i];
      }
      const col = side === 'gold' ? COL.gold : COL.red;
      PX.points(SX, SY, sh.n, col, { a: a * w.k * (side === 'gold' ? 1.0 : 1.1) * (1 + (w.flash || 0)), A: SA, glow: 0.22 });
      // the felt weight: a hot, shimmering shell around the red core (the extra 100万 that is only felt)
      if (felt > 0.01) {
        const Sh = shell(); scratch(Sh.n);
        const half = core / 2, half2 = outer / 2, t = st.T;
        // the shell's centre: it also sits on the beam, so it rises with its size
        const [ox2, oy2] = P(u, BEAM_T + 1 + outer / 2);
        let j = 0;
        for (let i = 0; i < Sh.n; i++) {
          const r = Sh.R[i], rr = lerp(half, half2, r), q = rr / 1;
          const jit = Math.sin(t * (5 + PX.rand(i, 54) * 7) + PX.rand(i, 55) * 30) * 2.2;
          const lx = Sh.X[i] * (q + jit), ly = Sh.Y[i] * (q + jit);
          const [X, Y] = M(ox2 + lx * c - ly * s, oy2 + lx * s + ly * c); SX[j] = X; SY[j] = Y;
          SA[j] = (0.35 + 0.65 * Math.exp(-Math.abs(r - 1) / 0.12)) * (0.6 + 0.4 * Math.sin(t * 3 + PX.rand(i, 56) * 9)); j++;
        }
        PX.points(SX, SY, j, mix(COL.red, COL.ember, 0.35), { a: a * felt * 0.42, A: SA, glow: 0.7 });
      }
      // dust kicked off the beam on landing
      if (dt >= 0 && dt < 1.3) {
        const n = side === 'gold' ? 900 : 500; scratch(n);
        const [lx0, ly0] = P(u, BEAM_T);
        for (let i = 0; i < n; i++) {
          const dir = PX.rand(i, 81) < 0.5 ? -1 : 1, sp = 120 + PX.rand(i, 82) ** 2 * 520, up = 60 + PX.rand(i, 83) * 260;
          const x0 = lx0 + dir * core * 0.5 * (0.7 + 0.3 * PX.rand(i, 84));
          const [X, Y] = M(x0 + dir * sp * dt * 0.9, ly0 - up * dt + 500 * dt * dt);
          SX[i] = X; SY[i] = Y; SA[i] = Math.exp(-dt * (2 + PX.rand(i, 85) * 3));
        }
        PX.points(SX, SY, n, side === 'gold' ? COL.gold : COL.red, { a: a * 0.5, A: SA, glow: 0.4 });
      }
    }
    // --- threshold line: a blade of light dropped through the scene onto the track
    if (st.lineA > 0 && st.lineV != null) {
      const n = 1400; scratch(n);
      const x = vx(st.lineV), y0 = 780 + st.lineDrop, y1 = TY + 40 + st.lineDrop;
      for (let i = 0; i < n; i++) {
        const u = (i + PX.rand(i, 91)) / n, [X, Y] = M(x + (PX.rand(i, 92) - 0.5) * 2.2, lerp(y0, y1, u));
        SX[i] = X; SY[i] = Y; SA[i] = Math.min(1, u * 5) * (0.75 + 0.25 * PX.rand(i, 93));
      }
      PX.points(SX, SY, n, COL.white, { a: a * st.lineA * 0.8, A: SA, glow: 0.5 });
    }
    // --- the 27% bead
    if (st.dotA > 0 && st.dotV != null) {
      const [X, Y] = M(vx(st.dotV), TY);
      bead(X, Y, 15 * Math.max(0.8, sc), COL.gold, a / ka * st.dotA * (1 + 1.5 * (st.dotFlash || 0)));
    }
  }
  /** two near-invisible points that widen PX's working box, so halos are never clipped at its edge */
  const _sx = new Float32Array([W / 2, W / 2]), _sy = new Float32Array([240, 1720]);
  function sentinels() { PX.points(_sx, _sy, 2, COL.white, { a: 0.003, glow: 0 }); }
  /** a luminous bead: a dense disc of light with a hot core */
  function bead(x, y, r, col, a) {
    if (a <= 0.003) return;
    const D = PX.disc(900, 0, 0, 1); scratch(D.n);
    for (let i = 0; i < D.n; i++) { const dx = D.X[i], dy = D.Y[i], rr = dx * dx + dy * dy; SX[i] = x + dx * r; SY[i] = y + dy * r; SA[i] = 0.35 + 0.9 * Math.exp(-rr * 3); }
    PX.points(SX, SY, D.n, col, { a: a * 0.32, A: SA, glow: 0.9 });
  }

  /** canvas overlays of one rig: axis, ticks, track, engraved weight labels, line/dot/readout labels */
  function rigCanvas(ctx, st, m, a, o = {}) {
    if (a <= 0.003) return;
    const g = rigGeom(st, m), { M } = g, sc = m.sc, ts = o.ts || 1;
    ctx.save(); ctx.globalAlpha *= a;
    // axis + ticks
    if (st.axisA > 0) {
      ctx.save(); ctx.globalAlpha *= st.axisA;
      const [ax0, ay] = M(X0, AY), [ax1] = M(X1, AY);
      ctx.strokeStyle = 'rgba(239,233,220,0.42)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.stroke();
      for (let v = 0; v <= 100; v += 5) {
        const [x] = M(vx(v), AY), h = (v % 50 === 0 ? 14 : v % 10 === 0 ? 9 : 4) * sc;
        ctx.globalAlpha = a * st.axisA * (v % 10 === 0 ? 0.6 : 0.3); ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(x, ay + h); ctx.stroke();
      }
      ctx.globalAlpha = a * st.axisA;
      const la = o.axisLabels == null ? 1 : o.axisLabels;
      if (la > 0) {
        text('0', ax0, ay + 44 * sc, { size: 28 * sc, family: F.mono, color: C.dim, align: 'center', alpha: la });
        text('100%', ax1, ay + 44 * sc, { size: 28 * sc, family: F.mono, color: C.dim, align: 'center', alpha: la });
      }
      ctx.restore();
    }
    // probability track
    if (st.trackA > 0) {
      const [tx0, ty] = M(X0, TY), [tx1] = M(X1, TY);
      ctx.save(); ctx.globalAlpha *= st.trackA * 0.5;
      const gr = ctx.createLinearGradient(tx0, 0, tx1, 0);
      gr.addColorStop(0, 'rgba(239,233,220,0)'); gr.addColorStop(0.15, 'rgba(239,233,220,0.35)'); gr.addColorStop(0.85, 'rgba(239,233,220,0.35)'); gr.addColorStop(1, 'rgba(239,233,220,0)');
      ctx.strokeStyle = gr; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(tx0 - 40 * sc, ty); ctx.lineTo(tx1 + 40 * sc, ty); ctx.stroke();
      ctx.restore();
    }
    // engraved labels on the ingots (dark, cut into the light)
    for (const side of ['gold', 'red']) {
      const w = st[side]; if (!w || w.k <= 0.05) continue;
      const u = side === 'gold' ? 0 : 1, core = side === 'gold' ? GOLD_S : RED_S;
      const dt = st.T - w.land, fall = dt < 0 ? -(dt * dt) * 2400 : 0;
      const [bx, by] = g.P(u, BEAM_T + 1 + core / 2), [X, Y] = M(bx, by + fall);
      ctx.save(); ctx.translate(X, Y); ctx.rotate(st.th); ctx.scale(sc, sc);
      const lab = side === 'gold' ? '+300万' : '−100万', size = side === 'gold' ? 44 : 27;
      text(lab, 0, size * 0.36, { size, family: F.mono, weight: 700, color: side === 'gold' ? '#2a1a04' : '#2a0905', align: 'center', alpha: 0.88 * w.k });
      ctx.restore();
    }
    // fulcrum readout (live, while it hunts for balance)
    if (st.readoutA > 0) {
      const [X, Y] = M(g.px0, AY + 48);
      const lev = st.levelGlow || 0;
      text(`${Math.round(st.f * 100)}%`, X, Y, { size: 34 * ts, family: F.mono, weight: 700, color: lev > 0.5 ? C.gold : C.ink, align: 'center', alpha: st.readoutA * (0.6 + 0.4 * lev) });
    }
    // labels on the track: the line's label on the side away from the bead, the bead's label away from the line
    const side = st.dotV != null && st.lineV != null ? (st.lineV < st.dotV ? -1 : 1) : -1;
    const sideK = st.dotV != null && st.lineV != null ? clamp(Math.abs(st.lineV - st.dotV) / 1.2) : 1;
    if (st.lineA > 0 && st.lineV != null && st.lineLabelA > 0) {
      const [X, Y] = M(vx(st.lineV), TY - 22);
      text(st.lineLabel, X + side * 16 * ts, Y + st.lineDrop * sc, { size: 36 * ts, family: F.sans, weight: 500, color: C.ink, align: side < 0 ? 'right' : 'left', alpha: st.lineLabelA * sideK });
    }
    if (st.dotA > 0 && st.dotV != null && st.dotLabelA > 0) {
      const [X, Y] = M(vx(st.dotV), TY - 22);
      text('27%', X - side * 18 * ts, Y, { size: 36 * ts, family: F.mono, weight: 700, color: C.gold, align: side < 0 ? 'left' : 'right', alpha: st.dotLabelA * sideK });
    }
    ctx.restore();
  }

  /** verdict glyphs as particles. chars: [{ch, x (offset from centre, in glyph sizes), col, A}] */
  function verdict(chars, cx, cy, size, a) {
    for (const g of chars) {
      if (g.A <= 0.003) continue;
      const s = glyphCloud(g.ch, 180); scratch(s.n);
      const k = size / 180, ox = cx + g.x * size;
      const jit = g.jit || 0, t = g.t || 0;
      for (let i = 0; i < s.n; i++) {
        let x = s.X[i], y = s.Y[i];
        if (jit) { const r = PX.rand(i, 21); x += Math.sin(t * 2 + r * 40) * jit * r; y += Math.cos(t * 1.7 + r * 50) * jit * r - jit * r * 0.5; }
        SX[i] = ox + x * k; SY[i] = cy + y * k; SA[i] = 1;
      }
      PX.points(SX, SY, s.n, g.col, { a: a * g.A * 0.56 * Math.pow(k, 1.2), glow: 0.45 });
    }
  }

  // ---------------------------------------------------------------- the state of the main rig at chain time T
  function mainState(S, T) {
    const f = fulcrum(S, T), th = theta(S, T);
    const sliding1 = T >= S.slide1[0] - 0.3 && T < S.line + 0.6, sliding2 = T >= S.slide2[0] && T < S.split;
    const lev = clamp(1 - Math.abs(th) / 0.05) * clamp((T - S.slide1[0]) / 2);
    // beam impact flashes
    const fl = (t0) => T >= t0 ? Math.exp(-(T - t0) * 6) : 0;
    const lnd = S.line, lineDropK = prog(T, lnd, lnd + 0.45);
    const st = {
      T, f, th, levelGlow: lev,
      beamK: ease.out(prog(T, S.beamIn, S.beamIn + 0.7)), axisA: ease.out(prog(T, S.beamIn, S.beamIn + 0.9)),
      flash: Math.max(fl(S.goldLand), fl(S.redLand) * 0.6),
      shakeY: (T >= S.goldLand ? Math.exp(-(T - S.goldLand) * 7) * Math.sin((T - S.goldLand) * 55) * 7 : 0) + (T >= S.redLand ? Math.exp(-(T - S.redLand) * 8) * Math.sin((T - S.redLand) * 60) * 3 : 0),
      gold: { land: S.goldLand, k: T >= S.goldLand - 0.5 ? 1 : 0, flash: fl(S.goldLand) },
      red: { land: S.redLand, k: T >= S.redLand - 0.5 ? 1 : 0, felt: ease.inOut(prog(T, S.swell[0], S.swell[1])), flash: fl(S.redLand) * 0.8 },
      readoutA: sliding1 ? Math.min(ease.out(prog(T, S.slide1[0] - 0.3, S.slide1[0])), 1 - ease.in(prog(T, lnd + 0.2, lnd + 0.6))) : 0,
      lineV: T >= lnd ? lineV(S, T) : null, lineA: T >= lnd ? 1 : 0, lineDrop: -(1 - ease.in(lineDropK)) * 900 * (lineDropK < 1 ? 1 : 0),
      lineLabelA: ease.out(prog(T, lnd + 0.4, lnd + 0.9)),
      lineLabel: '', trackA: ease.out(prog(T, lnd + 0.3, lnd + 1.0)),
      dotV: T >= S.dotIn[0] ? lerp(103, 27, ease.outExpo(prog(T, S.dotIn[0], S.dotIn[1]))) : null,
      dotA: ease.out(prog(T, S.dotIn[0], S.dotIn[0] + 0.3)), dotLabelA: ease.out(prog(T, S.dotIn[1] - 0.2, S.dotIn[1] + 0.3)),
      dotFlash: (T >= S.touLit ? Math.exp(-(T - S.touLit) * 5) : 0) + (T >= S.buLit ? Math.exp(-(T - S.buLit) * 5) * 0.5 : 0),
    };
    if (sliding2) st.readoutA = 0;
    return st;
  }
  // the threshold label: exact script strings when at rest, a live readout while the line rides the fulcrum
  function lineLabel(V14, V15, S, T) {
    if (T < S.slide2[0]) return V14.lines.line;
    if (T >= S.slide2[1] - 0.05) return V15 ? V15.lines.line : `门槛 40%`;
    return `门槛 ${Math.round(lineV(S, T))}%`;
  }
  // the verdict of the main rig ("you" in b14, "him" in b15)
  function mainVerdict(S, T) {
    const lit = T >= S.touLit ? 1 + 1.6 * Math.exp(-(T - S.touLit) * 5) : 0;
    const appear = ease.out(prog(T, S.touLit - 0.05, S.touLit + 0.25));
    // in b15: the line crosses the bead early in the slide → 投 goes dark; at buLit, 不 lights and 投 shifts over
    let cross = S.slide2[1];
    for (let k = 0; k <= 60; k++) { const t = lerp(S.slide2[0], S.slide2[1], k / 60); if (lineV(S, t) > 27) { cross = t; break; } }
    const dark = ease.out(prog(T, cross, cross + 0.35));
    const bu = ease.out(prog(T, S.buLit, S.buLit + 0.5)), buFlash = T >= S.buLit ? 1.4 * Math.exp(-(T - S.buLit) * 5) : 0;
    const touCol = mix(COL.gold, COL.cool, bu);
    const touA = appear * (lit * (1 - dark) + lerp(0.14, 1 + buFlash * 0.6, bu) * dark);
    return [
      { ch: '不', x: -0.5 * bu, col: COL.cool, A: bu * (1 + buFlash), jit: (1 - bu) * 60, t: T },
      { ch: '投', x: 0.5 * ease.inOut(prog(T, S.buLit - 0.15, S.buLit + 0.45)), col: touCol, A: touA },
    ];
  }

  // ---------------------------------------------------------------- shared drawing for the b14 → b15 chain
  function drawChain(ctx, V, lt, api, isB15) {
    const S = schedule(api), T = lt - api.chainStart;
    const vis14 = isB15 ? (window.T.TL.beats.find(b => b.id === V.ref) || {}).visual : V, vis15 = isB15 ? V : null;
    const st = mainState(S, T);
    st.lineLabel = lineLabel(vis14, vis15, S, T);
    // split: the main rig ("him", or "you" in b14) moves to the lower row; a copy of "you" fades into the upper row
    const sk = isB15 ? ease.inOut(prog(T, S.split, S.split + 1.3)) : 0;
    const ROW = { sc: 0.7, ox: 0, y1: -150, y2: 400 };
    const mMain = { ox: lerp(0, ROW.ox, sk), oy: lerp(0, ROW.y2, sk), sc: lerp(1, ROW.sc, sk) };
    const yk = isB15 ? ease.out(prog(T, S.split + 0.35, S.split + 1.3)) : 0;
    const mYou = { ox: ROW.ox, oy: ROW.y1 - 50 * (1 - yk), sc: ROW.sc };
    const youSt = Object.assign({}, st, {
      f: 0.25, th: 0, levelGlow: 1, flash: 0, shakeY: 0, readoutA: 0, lineV: 25, lineDrop: 0, lineLabel: vis14.lines.line,
      red: { land: -1, k: 1, felt: 0 }, gold: { land: -1, k: 1 }, dotV: 27, dotFlash: 0,
    });
    const ts = lerp(1, 0.88, sk);

    // ---------- particles
    PX.begin();
    rigParticles(st, mMain, 1);
    if (yk > 0) rigParticles(youSt, mYou, yk);
    // verdicts
    const vMain = mainVerdict(S, T);
    const vc = [lerp(W / 2, 850, sk), lerp(VY, ROW.y2 + 1200 * ROW.sc + 30, sk)], vs = lerp(180, 120, sk);
    verdict(vMain, vc[0], vc[1], vs, 1);
    if (yk > 0) {
      const lit = 1 + 1.2 * Math.exp(-(T - S.split - 0.8) * 4) * (T > S.split + 0.8 ? 1 : 0);
      verdict([{ ch: '投', x: 0, col: COL.gold, A: ease.out(prog(T, S.split + 0.7, S.split + 1.1)) * lit }], 850, ROW.y1 + 1200 * ROW.sc + 30, 120, 1);
    }
    // 'both': one gold thread through the same 27% in both rows
    if (isB15 && T >= S.both) {
      const k = ease.inOut(prog(T, S.both + 0.2, S.both + 1.4)), n = 1600; scratch(n);
      const x = ROW.ox + vx(27) * ROW.sc, y0 = mYou.oy + TY * ROW.sc, y1 = mMain.oy + TY * ROW.sc;
      let j = 0;
      for (let i = 0; i < n; i++) {
        const u = (i + PX.rand(i, 31)) / n; if (u > k) continue;
        SX[j] = x + (PX.rand(i, 32) - 0.5) * 1.6; SY[j] = lerp(y0, y1, u); SA[j] = 0.5 + 0.5 * Math.sin(u * 60 - T * 6) ** 2; j++;
      }
      PX.points(SX, SY, j, COL.gold, { a: 0.55, A: SA, glow: 0.6 });
    }
    sentinels();
    PX.flush({ exposure: 1.5, glow: 1.0 });

    // ---------- canvas overlays
    const axisLab = 1 - sk;
    rigCanvas(ctx, st, mMain, 1, { ts, axisLabels: axisLab });
    if (yk > 0) rigCanvas(ctx, youSt, mYou, yk, { ts: 0.88, axisLabels: 0 });

    // b14 texts
    const L14 = vis14.lines;
    if (!isB15) {
      const out = prog(T, S.lever + 4.5, S.lever + 5.3);
      const rows = L14.calc.split(/(?<=，)/);
      rows.forEach((r, i) => type(r, W / 2, 420 + i * 92, { size: 66, mode: 'rise', k: prog(T, S.calc + 0.15 + i * 0.5, S.calc + 1.3 + i * 0.5), out, color: i ? C.ink : C.dim }));
    }
    // win / lose labels (they leave when the frame splits)
    const labOut = sk > 0 ? prog(T, S.split, S.split + 0.5) : 0;
    const lab = (str, x, align, t0, col) => {
      const k = prog(T, t0, t0 + 0.5), [a, b] = str.split(/(?<=：)/);
      type(a, x, 650, { size: 32, family: F.sans, weight: 400, align, mode: 'rise', k, out: labOut, color: C.dim, spacing: 2 });
      type(b, x, 712, { size: 46, family: F.serif, weight: 600, align, mode: 'rise', k: prog(T, t0 + 0.15, t0 + 0.75), out: labOut, color: col });
    };
    lab(L14.win, 92, 'left', S.goldLand, C.gold);
    lab(L14.lose, 988, 'right', S.redLand, C.red);

    if (isB15) {
      const L15 = V.lines, hOut = prog(T, S.split, S.split + 0.5);
      type(L15.him, W / 2, 400, { size: 64, mode: 'rise', k: prog(T, S.heavy + 0.1, S.heavy + 1.1), out: hOut });
      type(L15.heavy, W / 2, 495, { size: 50, mode: 'rise', k: prog(T, S.swell[0], S.swell[0] + 1.2), out: hOut, color: C.red });
      // split row labels
      const rl = ease.out(prog(T, S.split + 0.9, S.split + 1.5));
      text('你', 850, ROW.y1 + 1200 * ROW.sc + 30 - 150, { size: 36, family: F.sans, color: C.dim, align: 'center', alpha: rl });
      text('他', 850, ROW.y2 + 1200 * ROW.sc + 30 - 150, { size: 36, family: F.sans, color: C.dim, align: 'center', alpha: rl });
      // both / right
      type(L15.both, W / 2, 330, { size: 60, mode: 'rise', k: prog(T, S.both + 0.1, S.both + 1.2) });
      type(L15.right, W / 2, 1570, { size: 66, mode: 'rise', k: prog(T, S.both + 1.5, S.both + 2.6), color: C.gold });
    }
  }

  T.register('threshold', {
    draw(ctx, V, lt, api) { drawChain(ctx, V, lt, api, false); },
    cues(V, api) {
      const S = schedule(api), c = [];
      c.push({ t: S.calc + 0.15, type: 'chip' });
      c.push({ t: S.beamIn, type: 'sweep', dur: 0.7 });
      c.push({ t: S.goldLand, type: 'punch' });
      c.push({ t: S.redLand, type: 'thud' });
      c.push({ t: S.slide1[0], type: 'whoosh', dur: S.slide1[1] - S.slide1[0] });
      c.push({ t: S.slide1[1] + 0.6, type: 'resolve' });
      c.push({ t: S.line + 0.45, type: 'stamp' });
      c.push({ t: S.dotIn[0], type: 'whoosh', dur: 1.0 });
      c.push({ t: S.touLit, type: 'click' });
      return c;
    },
  });
  T.register('other', {
    draw(ctx, V, lt, api) { drawChain(ctx, V, lt, api, true); },
    cues(V, api) {
      const S = schedule(api), off = api.chainStart, c = [];       // chain time → this beat's local time: + chainStart
      const L = t => t + off;
      c.push({ t: L(S.heavy + 0.1), type: 'hush' });
      c.push({ t: L(S.swell[0]), type: 'swell', dur: S.swell[1] - S.swell[0] });
      const hit = sim(S).stopHits.find(t => t > S.swell[0]);
      if (hit) c.push({ t: L(hit), type: 'thud' });
      c.push({ t: L(S.slide2[0]), type: 'whoosh', dur: S.slide2[1] - S.slide2[0] });
      c.push({ t: L(S.buLit), type: 'click' });
      c.push({ t: L(S.split), type: 'whoosh', dur: 1.3 });
      c.push({ t: L(S.split + 0.8), type: 'click' });
      c.push({ t: L(S.both + 0.2), type: 'gather', dur: 1.2 });
      c.push({ t: L(S.both + 1.5), type: 'resolve' });
      return c;
    },
  });

  // ================================================================ b16 gap
  /* The probability axis again, alone. Log zoom into the 2 points between 25% and 27%: graduations subdivide
     (10 → 5 → 1 → 0.5 → 0.1 → 0.05 → 0.01) and stream outward until the gap fills the frame. The threshold line and
     the 27% bead become two walls; we fall between them (wall strata and depth marks stream up); the fall slows to a
     float, and one new bead of light rises into the canyon. Everything is a closed-form function of lt. */
  const ZS0 = 7, ZS1 = 430, AY16 = 1000;
  function gapCam(api, lt) {
    const tZ = KIT.at(api, 'zoom'), zk = ease.inOut(prog(lt, tZ + 0.6, tZ + 5.4));
    const s = ZS0 * Math.pow(ZS1 / ZS0, zk) * (1 + 0.012 * Math.max(0, lt - tZ - 5.4));
    const x26 = lerp(X0 + 26 / 100 * LB, W / 2, zk);
    const tF = tZ + 4.6, tF1 = tZ + 11.0, fk = prog(lt, tF, tF1);
    const fall = 3000 * ease.inOut(fk) + 22 * Math.max(0, lt - tF1);
    const vel = 3000 * (fk > 0 && fk < 1 ? (fk < 0.5 ? 12 * fk * fk : 12 * (1 - fk) * (1 - fk)) : 0) / (tF1 - tF);
    const wk = ease.inOut(prog(lt, tZ + 4.4, tZ + 5.8));
    return { s, x26, zk, fall, vel, wk, tZ, X: v => x26 + (v - 26) * s, axisY: AY16 - fall };
  }
  const LEVELS = [10, 5, 1, 0.5, 0.1, 0.05, 0.01, 0.005, 0.001];
  const isMult = (v, d) => Math.abs(v / d - Math.round(v / d)) < 1e-6;
  function fmtV(v, d) { const dec = d >= 1 ? 0 : d >= 0.1 ? 1 : d >= 0.01 ? 2 : 3; return (+v.toFixed(dec)).toString(); }

  T.register('gap', {
    draw(ctx, V, lt, api) {
      const cam = gapCam(api, lt), { s, X, axisY, wk } = cam;
      const tDo = KIT.at(api, 'do'), tFind = KIT.at(api, 'find');
      const x25 = X(25), x27 = X(27), gap = x27 - x25;
      PX.begin();
      // ---------- zoom dust: log-periodic, so the dive never ends (expands from the focus as the scale grows)
      const logS = Math.log(s / ZS0), zDustA = 1 - prog(lt, cam.tZ + 5.0, cam.tZ + 6.5);
      if (zDustA > 0) {
        const n = 9000; scratch(n);
        const fx = cam.x26, fy = axisY;
        for (let i = 0; i < n; i++) {
          const an = PX.rand(i, 101) * TAU, cyc = (PX.rand(i, 102) + logS * 0.42) % 1, r = 24 * Math.exp(cyc * 3.9);
          SX[i] = fx + Math.cos(an) * r; SY[i] = fy + Math.sin(an) * r * 1.25;
          SA[i] = Math.sin(Math.PI * cyc) ** 2 * (0.3 + 0.7 * PX.rand(i, 103));
        }
        PX.points(SX, SY, n, COL.cool, { a: 0.4 * zDustA * clamp(cam.zk * 5 + 0.15), A: SA, glow: 0.3 });
      }
      // ---------- graduations on the axis (particles), subdividing as the scale grows
      if (axisY > 150) {
        const vmin = 26 - (cam.x26 + 30) / s, vmax = 26 + (W - cam.x26 + 30) / s;
        let j = 0; scratch(60000);
        for (let li = 0; li < LEVELS.length; li++) {
          const d = LEVELS[li], p = d * s; if (p < 3) continue;
          const al = clamp((p - 3) / 30), imp = clamp(Math.log2(p / 6) / 6.5), h = 6 + 330 * imp ** 1.6;
          const k0 = Math.ceil(Math.max(0, vmin) / d), k1 = Math.floor(Math.min(100, vmax) / d);
          for (let k = k0; k <= k1 && j < 59000; k++) {
            const v = k * d; if (li > 0 && isMult(v, LEVELS[li - 1])) continue;
            const x = X(v), m = Math.max(4, Math.round(h / 1.6)), mb = Math.max(3, m >> 2);
            for (let q = 0; q < m && j < 59000; q++) { const u = q / m; SX[j] = x + (PX.rand(j, 111) - 0.5) * 1.2; SY[j] = axisY - 2 - q * 1.6; SA[j] = al * (1 - u) ** 1.5 * (0.6 + 0.4 * imp); j++; }
            for (let q = 0; q < mb && j < 59000; q++) { SX[j] = x + (PX.rand(j, 111) - 0.5) * 1.2; SY[j] = axisY + 3 + q * 1.6; SA[j] = al * 0.45 * (1 - q / mb); j++; }
          }
        }
        PX.points(SX, SY, j, mix(COL.white, COL.cool, 0.3), { a: 0.55, A: SA, glow: 0.3 });
        // the axis itself
        const xa = Math.max(-10, X(0)), xb = Math.min(W + 10, X(100)), n = Math.min(6000, Math.ceil((xb - xa) / 0.8)); scratch(n);
        for (let i = 0; i < n; i++) { SX[i] = lerp(xa, xb, (i + PX.rand(i, 112)) / n); SY[i] = axisY + (PX.rand(i, 113) - 0.5) * 1.4; SA[i] = 1; }
        PX.points(SX, SY, n, COL.white, { a: 0.22, A: SA, glow: 0.2 });
      }
      // ---------- the two walls: the threshold (25%, white) and the bead's column (27%, gold)
      const wallTop = lerp(axisY - 230, -40, wk), wallBot = lerp(axisY + 50, H + 40, wk);
      const wall = (x, side, col, seed, aCore) => {
        // core line
        const n = 3000; scratch(n);
        for (let i = 0; i < n; i++) { SX[i] = x + (PX.rand(i, seed) - 0.5) * lerp(2.2, 5, cam.zk); SY[i] = lerp(wallTop, wallBot, (i + PX.rand(i, seed + 1)) / n); SA[i] = 0.7 + 0.3 * PX.rand(i, seed + 2); }
        PX.points(SX, SY, n, col, { a: aCore, A: SA, glow: 0.45 });
        if (wk <= 0) return;
        // strata: the wall's outer body, streaming up as we fall (with motion streaks)
        const m = 26000, st = clamp(cam.vel * 0.035, 0, 90), reps = st > 4 ? 3 : 1; scratch(m * reps);
        const span = H + 200; let j = 0;
        for (let i = 0; i < m; i++) {
          const dx = -Math.log(1 - PX.rand(i, seed + 3) * 0.995) * 70, par = 0.7 + 0.3 * Math.exp(-dx / 120);
          const yb = PX.rand(i, seed + 4) * span, y = ((yb - cam.fall * par) % span + span) % span - 100;
          const band = 0.55 + 0.45 * Math.sin((yb * 0.045) + Math.floor(dx / 18) * 1.7);
          const A = (0.25 + 0.75 * Math.exp(-dx / 60)) * band * band * (0.4 + 0.6 * PX.rand(i, seed + 5)) / Math.sqrt(reps);
          for (let r = 0; r < reps; r++) { SX[j] = x + side * dx; SY[j] = y + r * st / 2; SA[j] = A; j++; }
        }
        PX.points(SX, SY, j, col, { a: 0.42 * wk, A: SA, glow: 0.4 });
        // depth marks on the inner face (a ruler you fall past)
        const q = 30, step = 64; scratch(q * 40); j = 0;
        const off = ((cam.fall % step) + step) % step;
        for (let k = -1; k < H / step + 2; k++) {
          const y = k * step - off, major = ((k + Math.floor(cam.fall / step)) % 5 + 5) % 5 === 0, len = major ? 26 : 12;
          for (let r = 0; r < q && j < q * 40; r++) { SX[j] = x - side * (3 + r / q * len); SY[j] = y; SA[j] = major ? 1 : 0.55; j++; }
        }
        PX.points(SX, SY, j, col, { a: 0.35 * wk, A: SA, glow: 0.15 });
      };
      wall(x25, -1, COL.white, 121, 0.55);
      wall(x27, 1, COL.gold, 131, 0.55 * wk);
      // the 27% bead on the axis (it becomes the foot of the gold wall)
      if (axisY > -60) bead(x27, axisY, lerp(15, 24, cam.zk), COL.gold, 1.1);
      // ---------- falling dust in the canyon (streaks while fast)
      if (cam.fall > 0) {
        const n = 4500, st = clamp(cam.vel * 0.05, 0, 120), reps = st > 3 ? 6 : 1; scratch(n * reps);
        const span = H + 300; let j = 0;
        for (let i = 0; i < n; i++) {
          const d = 0.3 + 0.7 * PX.rand(i, 141), x = lerp(x25 + 10, x27 - 10, PX.rand(i, 142));
          const y = ((PX.rand(i, 143) * span - cam.fall * d * 1.3) % span + span) % span - 150;
          for (let r = 0; r < reps; r++) { SX[j] = x; SY[j] = y + r * st * d / reps; SA[j] = d * d / Math.sqrt(reps); j++; }
        }
        PX.points(SX, SY, j, COL.cool, { a: 0.7 * wk, A: SA, glow: 0.3 });
      }
      // ---------- the new piece of evidence: one bead rises into the canyon and glints
      const tB = tFind + 1.0, bk = prog(lt, tB, tB + 2.2);
      if (bk > 0) {
        const by = lerp(1260, 905, ease.out(bk)) + Math.sin(lt * 1.3) * 4 * bk, bx = W / 2 + Math.sin(lt * 0.9) * 3;
        const tG = tB + 1.2, g = lt >= tG ? Math.exp(-(lt - tG) * 2.2) : 0, g2 = lt >= tG ? 0.35 + 0.25 * Math.sin((lt - tG) * 2.4) : 0;
        bead(bx, by, 13, COL.white, ease.out(prog(lt, tB, tB + 0.8)) * (1 + 2.5 * g));
        const fl = Math.max(g * 1.0, g2 * 0.45);
        if (fl > 0.01) {                                        // a four-point star flare
          const n = 1600; scratch(n);
          for (let i = 0; i < n; i++) {
            const arm = i & 3, u = Math.pow(PX.rand(i, 151), 2.2) * (arm < 2 ? 190 : 110) * (0.6 + 0.4 * fl);
            const sgn = arm & 1 ? -1 : 1;
            SX[i] = bx + (arm < 2 ? sgn * u : (PX.rand(i, 152) - 0.5) * 1.2); SY[i] = by + (arm < 2 ? (PX.rand(i, 152) - 0.5) * 1.2 : sgn * u); SA[i] = 1 - u / 190;
          }
          PX.points(SX, SY, n, COL.white, { a: 0.5 * fl, A: SA, glow: 0.6 });
        }
      }
      sentinels();
      PX.flush({ exposure: 1.5, glow: 1.0 });

      // ---------- labels
      const lab = (str, x, y, align, col, a, fam = F.sans) => text(str, x, y, { size: 36, family: fam, weight: fam === F.mono ? 700 : 500, color: col, align, alpha: a });
      const ly = Math.max(axisY - 24, 330), outA = 1 - prog(gap, 240, 380), inA = prog(gap, 420, 560);
      if (outA > 0) { lab('门槛 25%', x25 - 16, ly, 'right', C.ink, outA); lab('27%', x27 + 18, ly, 'left', C.gold, outA, F.mono); }
      if (inA > 0) { lab('门槛 25%', x25 + 22, ly, 'left', C.ink, inA); lab('27%', x27 - 22, ly, 'right', C.gold, inA, F.mono); }
      // graduation numbers under the axis
      if (axisY > 150 && axisY < H - 60) {
        const endA = 1 - prog(cam.zk, 0.02, 0.15);
        if (endA > 0) { text('0', X(0), axisY + 46, { size: 28, family: F.mono, color: C.dim, align: 'center', alpha: endA }); text('100%', X(100), axisY + 46, { size: 28, family: F.mono, color: C.dim, align: 'center', alpha: endA }); }
        const vmin = 26 - (cam.x26 + 60) / s, vmax = 26 + (W - cam.x26 + 60) / s;
        for (let li = 0; li < LEVELS.length; li++) {
          const d = LEVELS[li], p = d * s; if (p < 110 || d > 5) continue;
          const al = clamp((p - 110) / 70) * (1 - endA * 0.0);
          for (let k = Math.ceil(vmin / d); k <= Math.floor(vmax / d); k++) {
            const v = k * d; if (li > 0 && isMult(v, LEVELS[li - 1]) && LEVELS[li - 1] * s >= 110 && LEVELS[li - 1] <= 5) continue;
            if (Math.abs(v - 25) < 1e-6 || Math.abs(v - 27) < 1e-6) continue;
            const x = X(v); if (x < 60 || x > W - 60) continue;
            text(fmtV(v, d), x, axisY + 52, { size: 28, family: F.mono, color: C.dim, align: 'center', alpha: al * 0.9 });
          }
        }
      }
      // ---------- words
      type(V.lines.close, W / 2, 440, { size: 60, mode: 'rise', k: prog(lt, cam.tZ + 0.8, cam.tZ + 2.0) });
      type(V.lines.do, W / 2, 1400, { size: 58, mode: 'rise', k: prog(lt, tDo + 0.1, tDo + 1.2), color: C.dim });
      type(V.lines.find, W / 2, 1500, { size: 60, mode: 'rise', k: prog(lt, tFind + 0.1, tFind + 1.4), color: C.ink });
    },
    cues(V, api) {
      const tZ = KIT.at(api, 'zoom'), tDo = KIT.at(api, 'do'), tFind = KIT.at(api, 'find');
      return [
        { t: tZ + 0.6, type: 'riser', dur: 4.8 },
        { t: tZ + 0.8, type: 'chip' },
        { t: tZ + 4.6, type: 'swell', dur: 6.4 },
        { t: tDo + 0.1, type: 'hush' },
        { t: tFind + 1.0, type: 'gather', dur: 1.2 },
        { t: tFind + 2.2, type: 'chip' },
        { t: tFind + 3.4, type: 'resolve' },
      ];
    },
  });
})();
