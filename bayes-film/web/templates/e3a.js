/* 一次乘法 (e3, first half): from pie slices to odds, and the one-line rule.
 * b09 pie_vs_odds — a particle pie that keeps getting re-sliced (every new fact jolts it; the steel wedge lags and the
 *                   sum flickers off 100%), then sweeps to 10/90 and flies apart into THE ROPE: a tug-of-war, 1 gold
 *                   figure vs 9 steel figures, a bright knot whose x is the balance. Both teams double: the knot stays.
 * b10 equation    — 新赔率 = 旧赔率 × 似然比 condenses from light; the likelihood ratio as two bars (×5); the full Bayes
 *                   form as two stacked fractions; the two P(D) slide together and annihilate; the terms regroup into
 *                   旧赔率 × 似然比 and the × stays, huge.
 *
 * THE ROPE (shared by the film; other chapters copy ROPE / drawRope / drawTeam / knotX from here):
 *   a horizontal rope of light across the whole frame (x -40..1120) at y = 1000, sagging 9 px at the centre;
 *   ~12k gold-white particles [1, .9, .72] in two twisted strands (twist 0.11 rad/px, strand radius 2.4 px, front strand
 *   brighter); the rope's material slides with the knot (so a moving knot visibly drags the rope);
 *   the knot: a 1.4k-particle white-hot disc (r 11) + a short ribbon hanging 34 px, swaying; soft light r 90.
 *   knot x = 540 + (steel share - 0.5) * 2 * 180  (1:9 -> 684, 5:9 -> 591, 10:27 -> 638); a faint dashed centre mark at 540.
 *   teams: the glyph 人 (F.serif 900, 110 px, sampled every 1.5 px) as particle clouds; gold [1,.81,.48] on the left
 *   (成功), steel-blue [.5,.58,.72] on the right (失败); feet 52 px below the rope; they lean away from the knot
 *   (0.2 rad) and heave every 2 beats; steel crowd = columns of 3 depth rows (x step 54, back rows +16 px x, -20 px y,
 *   scale -10 %, brightness -28 % per row). */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng } = K;
  const { C, beat } = KIT;
  const TAU = Math.PI * 2;
  const at = (api, n) => KIT.at(api, n);
  const win = K.window;
  try { document.fonts && document.fonts.load('900 110px "Noto Serif SC"', '人'); } catch (e) { /* fonts load lazily */ }

  const GOLD = PX.COL.gold, WHITE = PX.COL.white, STEEL_L = [0.5, 0.58, 0.72], ROPE_C = [1, 0.9, 0.72], HOT = [1, 0.96, 0.88];
  const COOL = '#9fb2d0';
  const sm = k => ease.inOut(clamp(k));

  // ---------------------------------------------------------------- crisp glowing text helpers
  function line(str, x, y, size, o = {}) {
    return L.serif(str, x, y, { size, weight: o.weight || 600, color: o.color || C.ink, alpha: o.alpha == null ? 1 : o.alpha,
      reveal: o.reveal == null ? 1 : o.reveal, glow: o.glow == null ? 6 : o.glow, spacing: o.spacing, highlight: o.highlight, hiColor: o.hiColor, align: o.align });
  }
  // math run: P and D italic, everything else upright serif. Returns width; draws centred at cx (glyph centres at y)
  const MW = new Map();
  function mathChars(str, size) {
    const key = str + '|' + size; let m = MW.get(key); if (m) return m;
    const out = []; let w = 0;
    ctx.save();
    for (const ch of str) {
      const it = ch === 'P' || ch === 'D', cn = ch.charCodeAt(0) > 0x2e80;
      const wt = it ? 'italic 500' : cn ? 600 : 400;
      ctx.font = `${wt} ${size}px ${F.serif}`;
      let cw = ctx.measureText(ch).width; if (ch === '|') cw += size * 0.12; if (ch === '·') cw += size * 0.1;
      if (it) cw += size * 0.04;
      out.push({ ch, wt, x: w + cw / 2, w: cw }); w += cw;
    }
    ctx.restore();
    m = { chars: out, w }; if (document.fonts.status === 'loaded') MW.set(key, m); return m;
  }
  function math(str, cx, y, size, color, alpha = 1, o = {}) {
    const m = mathChars(str, size), sc = o.scale || 1, x0 = cx - m.w * sc / 2;
    for (const c of m.chars) L.glyph(c.ch, x0 + c.x * sc, y, size * sc, color, alpha, { family: F.serif, weight: c.wt, glow: o.glow == null ? 6 : o.glow });
    return m.w * sc;
  }
  const mathW = (str, size) => mathChars(str, size).w;

  // ================================================================ the rope (shared look)
  const ROPE = { y: 1000, sag: 9, x0: -40, x1: 1120, n: 12000, twist: 0.11, rad: 3, nk: 1400, nr: 300, span: 150, cx: 540 };
  const ropeY = (x, t) => ROPE.y + ROPE.sag * (1 - Math.pow((x - 540) / 600, 2)) + 1.2 * Math.sin(x * 0.012 - t * 7) * Math.sin(t * 3.1);
  const knotX = (gold, steel) => ROPE.cx + (steel / (gold + steel) - 0.5) * 2 * ROPE.span;
  /** writes rope + knot particles into out (from index j0); returns next index. shift: how far the rope material has
   *  slid (px); kx: knot x; t: time (s); A gets per-point intensity, Cc colours */
  function ropeInto(out, j0, kx, t, shift, glowK = 1) {
    const L_ = ROPE.x1 - ROPE.x0; let j = j0;
    for (let i = 0; i < ROPE.n; i++, j++) {
      const s = i & 1, u = PX.rand(i, 21), xm = ROPE.x0 + u * L_;                 // material coordinate
      let x = xm + shift; x = ROPE.x0 + ((x - ROPE.x0) % L_ + L_) % L_;
      const ph = xm * ROPE.twist + s * Math.PI, c = Math.cos(ph);
      out.X[j] = x + (PX.rand(i, 22) - 0.5) * 1.2;
      out.Y[j] = ropeY(x, t) + Math.sin(ph) * ROPE.rad + (PX.rand(i, 23) - 0.5) * 1.4;
      out.A[j] = (0.45 + 0.35 * c) * (0.8 + 0.2 * PX.rand(i, 24)) * glowK;
      out.C[j * 3] = ROPE_C[0]; out.C[j * 3 + 1] = ROPE_C[1] - 0.05 * c; out.C[j * 3 + 2] = ROPE_C[2] - 0.1 * c;
    }
    const ky = ropeY(kx, t);
    for (let i = 0; i < ROPE.nk; i++, j++) {
      const rr = 11 * Math.sqrt((i + 0.5) / ROPE.nk), an = i * 2.39996;
      out.X[j] = kx + Math.cos(an) * rr * 1.15; out.Y[j] = ky + Math.sin(an) * rr * 0.9;
      out.A[j] = 0.55 - rr / 30; out.C[j * 3] = HOT[0]; out.C[j * 3 + 1] = HOT[1]; out.C[j * 3 + 2] = HOT[2];
    }
    for (let i = 0; i < ROPE.nr; i++, j++) {                                       // the ribbon tied to the knot
      const v = (i + 0.5) / ROPE.nr, side = (PX.rand(i, 25) - 0.5) * 5 * (0.4 + v);
      out.X[j] = kx + side + Math.sin(t * 2.3 + v * 2.2) * v * 7; out.Y[j] = ky + 6 + v * 34;
      out.A[j] = 0.9 * (1 - v * 0.6); out.C[j * 3] = GOLD[0]; out.C[j * 3 + 1] = GOLD[1]; out.C[j * 3 + 2] = GOLD[2];
    }
    return j;
  }
  const ROPE_TOTAL = ROPE.n + ROPE.nk + ROPE.nr;

  // one figure: the glyph 人 as particles, centred on its feet (0, 0)
  let FIG = null;
  function figCloud() {
    const ok = document.fonts.check('900 110px "Noto Serif SC"', '人');
    if (FIG && FIG.ok === ok) return FIG;
    const s = PX.text('人', { size: 110, family: F.serif, weight: 900, x: 0, y: 0, step: 1.6, seed: 33 });
    FIG = { X: s.X, Y: s.Y, n: s.n, ok };
    return FIG;
  }
  /** slots of a team: side -1 gold (left), +1 steel (right); slot k of the 18-slot steel crowd / 2-slot gold team */
  function slot(side, k) {
    if (side < 0) return { x: k === 0 ? 205 : 128, y: ROPE.y + 52, s: 1, b: k === 0 ? 1.35 : 1.15 };
    const c = Math.floor(k / 3), r = k % 3;
    return { x: 975 - (5 - c) * 46 - r * 12, y: ROPE.y + 52 - r * 30, s: 1 - r * 0.08, b: [0.85, 0.42, 0.24][r], c, r };
  }
  // steel slot order: the first 9 are the three outer columns (right), the next 9 fill in towards the knot
  const STEEL_ORDER = (() => { const o = []; for (const c of [5, 4, 3, 2, 1, 0]) for (let r = 0; r < 3; r++) o.push(c * 3 + r); return o; })();
  /** writes figure points into out; f: {side, slot, lean phase}; returns next index. a: intensity multiplier */
  function figInto(out, j, side, k, t, a = 1) {
    const fc = figCloud(), sl = slot(side, side < 0 ? k : STEEL_ORDER[k]);
    const heave = Math.sin(TAU * (t / (beat.BEAT * 2)) + k * 0.7) ;
    const lean = side * (0.2 + 0.05 * heave), cs = Math.cos(lean), sn = Math.sin(lean);
    const x0 = sl.x + side * 3 * heave, y0 = sl.y, col = side < 0 ? GOLD : STEEL_L, sc = sl.s;
    for (let i = 0; i < fc.n; i++, j++) {
      const px = fc.X[i] * sc, py = fc.Y[i] * sc;
      out.X[j] = x0 + px * cs - py * sn; out.Y[j] = y0 + px * sn + py * cs;
      out.A[j] = sl.b * a; out.C[j * 3] = col[0]; out.C[j * 3 + 1] = col[1]; out.C[j * 3 + 2] = col[2];
    }
    return j;
  }
  // faint motes over the whole frame (depth + keeps the light buffer's region full-frame, so halos never end in a hard edge)
  function dust(t, a = 1) {
    const n = 700, out = PX.buf(n, 99);
    for (let i = 0; i < n; i++) {
      const d = 0.3 + 0.7 * PX.rand(i, 100);
      out.X[i] = ((PX.rand(i, 101) * (W + 40) + t * 5 * d) % (W + 40)) - 20 + Math.sin(t * 0.3 + i) * 6;
      out.Y[i] = 4 + PX.rand(i, 102) * (H - 10) + Math.cos(t * 0.25 + i * 1.7) * 8;
      out.A[i] = d * (0.5 + 0.5 * Math.sin(t * (0.6 + d) + i * 3.1));
    }
    out.X[0] = 3; out.Y[0] = 3; out.X[1] = W - 4; out.Y[1] = H - 4; out.A[0] = out.A[1] = 0.2;
    PX.points(out.X, out.Y, n, [0.9, 0.85, 0.75], { a: 0.09 * a, A: out.A, glow: 0.3 });
  }
  // a big shared scratch buffer {X, Y, A, C}
  let SB = null;
  function scratch(n) {
    if (!SB || SB.X.length < n) SB = { X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n), C: new Float32Array(n * 3) };
    return SB;
  }

  // ================================================================ b09 pie_vs_odds
  const PIE = { cx: 540, cy: 900, R: 270, N: 30000 };
  const JOLTS = [1.5, 2.25, 3.0, 3.75, 4.5, 5.25];                // every beat a new fact lands
  const SPLIT = [0.30, 0.34, 0.27, 0.36, 0.24, 0.33, 0.29];        // gold share after each jolt
  const COMET = [0.15, 0.62, 0.35, 0.88, 0.05, 0.71];              // direction each fact flies in from (turns)
  let PIEC = null;
  function pieCloud() {
    if (PIEC) return PIEC;
    // random (not spiral) points in the unit disc: a grainy, living material instead of a printed chart
    const n = PIE.N, X = new Float32Array(n), Y = new Float32Array(n), f = new Float32Array(n), r = new Float32Array(n), G = new Float32Array(n), q = rng(909);
    for (let i = 0; i < n; i++) {
      const rr = Math.sqrt(q()) * (0.985 + 0.03 * q()), an = q() * TAU;
      X[i] = Math.sin(an) * rr; Y[i] = -Math.cos(an) * rr; f[i] = an / TAU; r[i] = rr; G[i] = 0.55 + 0.65 * q() * q();
    }
    return (PIEC = { X, Y, f, r, G });
  }
  // gold share at local time t (jumps on each jolt with a nervous damped overshoot; at 'tug' it sweeps calmly to 10 %)
  function goldAt(t, tTug) {
    let k = -1; for (let i = 0; i < JOLTS.length; i++) if (t >= JOLTS[i]) k = i;
    let g;
    if (k < 0) g = SPLIT[0];
    else { const a = t - JOLTS[k], p = SPLIT[k], q = SPLIT[k + 1]; g = q + (p - q) * Math.exp(-a * 6.5) * Math.cos(a * 17); }
    if (t > tTug) g = lerp(g, 0.1, sm(prog(t, tTug, tTug + 0.6)));
    return g;
  }
  function splits(lt, tTug) {
    const g = goldAt(lt, tTug), lag = 0.3 * (1 - prog(lt, tTug, tTug + 0.25));
    return { g, s: 1 - goldAt(lt - lag, tTug) };
  }
  /** pie particle positions/colours at lt into out (n = PIE.N) */
  function pieInto(out, lt, api, frozen) {
    const P = pieCloud(), tTug = at(api, 'tug');
    const { g, s } = frozen ? { g: 0.1, s: 0.9 } : splits(lt, tTug);
    const R = PIE.R, ag = TAU * g / 2, as = TAU * (1 - s / 2);
    const gx = Math.sin(ag) * 9, gy = -Math.cos(ag) * 9, sx = Math.sin(as) * 9, sy = -Math.cos(as) * 9;
    // the latest jolt: comet direction, impact point, shake
    let k = -1; if (!frozen) for (let i = 0; i < JOLTS.length; i++) if (lt >= JOLTS[i]) k = i;
    const age = k >= 0 ? lt - JOLTS[k] : 99, dir = k >= 0 ? COMET[k] * TAU : 0;
    const ix = Math.sin(dir) * R, iy = -Math.cos(dir) * R;
    const shake = 10 * Math.exp(-age * 9) * Math.sin(age * 55);
    const ox = PIE.cx - Math.sin(dir) * shake, oy = PIE.cy + Math.cos(dir) * shake;
    const intro = frozen ? 1 : prog(lt, 0, 1.1), front = age * 900, ramp = Math.exp(-age * 3.2);
    const flick = Math.floor(lt * 20);
    for (let i = 0; i < PIE.N; i++) {
      const f = P.f[i], inG = f < g, inS = f > 1 - s;
      let x = P.X[i] * R, y = P.Y[i] * R, a, cr, cg, cb;
      if (inG && inS) {                                        // both wedges claim it: the sum is over 100 %
        const fl = PX.rand(i + flick, 26);
        cr = 1; cg = 0.42 + 0.2 * fl; cb = 0.35; a = 0.8 + 0.6 * fl;
        x += (PX.rand(i + flick, 27) - 0.5) * 6; y += (PX.rand(i + flick, 28) - 0.5) * 6;
      } else if (inG) { cr = GOLD[0]; cg = GOLD[1]; cb = GOLD[2]; a = 1; x += gx; y += gy; }
      else if (inS) { cr = STEEL_L[0]; cg = STEEL_L[1]; cb = STEEL_L[2]; a = 0.8; x += sx; y += sy; }
      else { cr = 0.7; cg = 0.7; cb = 0.75; a = 0.07; }      // nobody claims it: a hole in the 100 %
      // seams: dim close to a cut
      const rr = P.r[i] * R, dg = Math.min(Math.abs(f - g), f, 1 - f), ds = Math.abs(f - (1 - s));
      const seam = Math.min(dg, ds) * TAU * rr; if (seam < 3) a *= 0.25 + 0.25 * seam;
      // ripple from where the fact hit
      if (age < 1.6) {
        const dx = x - ix, dy = y - iy, d = Math.hypot(dx, dy) + 0.001;
        if (d < front) { const w = Math.sin(d / 19 - age * 26) * 7 * ramp * Math.exp(-d / 500); x += dx / d * w; y += dy / d * w; a *= 1 + 0.35 * w / 7; }
      }
      // breathing grain
      x += Math.sin(lt * 2.1 + i) * 0.6; y += Math.cos(lt * 1.7 + i * 1.3) * 0.6;
      if (intro < 1) {                                          // the pie gathers out of a swirl
        const d0 = PX.rand(i, 29) * 0.45, kk = ease.out(clamp((intro - d0) / 0.55)), an = Math.atan2(y, x) + (1 - kk) * 2.2, rad = Math.hypot(x, y) * lerp(2.4, 1, kk) + (1 - kk) * 160;
        x = Math.cos(an) * rad; y = Math.sin(an) * rad; a *= kk;
      }
      out.X[i] = ox + x; out.Y[i] = oy + y; out.A[i] = a * P.G[i];
      out.C[i * 3] = cr; out.C[i * 3 + 1] = cg; out.C[i * 3 + 2] = cb;
    }
    return { g, s, age, k, dir };
  }
  // mapping pie particle -> tug particle (gold pie bits become the gold figure, steel bits the steel crowd, the rest the rope)
  let MAP = null;
  function tugMap() {
    if (MAP && MAP.fig === figCloud()) return MAP;
    const P = pieCloud(), nf = figCloud().n, gold = [], steel = [];
    for (let i = 0; i < PIE.N; i++) (P.f[i] < 0.1 ? gold : steel).push(i);
    const m = new Int32Array(PIE.N).fill(-1);
    // tug buffer layout: [rope ROPE_TOTAL][gold fig nf][steel figs 9*nf]
    const G0 = ROPE_TOTAL, S0 = ROPE_TOTAL + nf;
    let gi = 0, si = 0;
    for (let q = 0; q < nf && gi < gold.length; q++) m[gold[gi++]] = G0 + q;
    for (let q = 0; q < 9 * nf && si < steel.length; q++) m[steel[si++]] = S0 + q;
    const rest = gold.slice(gi).concat(steel.slice(si));
    const restS = PX.shuffle({ X: Float32Array.from(rest), Y: new Float32Array(rest.length), n: rest.length }, 4).X;
    let covered = 0; for (; covered < restS.length && covered < ROPE_TOTAL; covered++) m[restS[covered]] = covered;
    return (MAP = { m, fig: figCloud(), nf, covered, figsOk: gi === nf && si === 9 * nf });
  }

  T.register('pie_vs_odds', {
    draw(ctx, V, lt, api) {
      const L_ = V.lines, tTug = at(api, 'tug'), tRel = at(api, 'rel');
      const fly0 = tTug + 0.6, fly1 = tTug + 1.9;               // particles fly from the pie into the tug-of-war
      const tDbl = tRel + 0.6;                                  // both teams double
      const nf = figCloud().n;
      // --- the tug scene (computed whenever it is visible)
      const dbl = sm(prog(lt, tDbl, tDbl + 1.0));
      const nTug = ROPE_TOTAL + nf * 20;
      const S = scratch(Math.max(PIE.N, nTug) + 10);
      let kx = 540;
      PX.begin(); dust(lt + api.beat.start);
      if (lt < fly0) {
        // ---------------- pie
        const st = pieInto(S, lt, api, false);
        PX.points(S.X, S.Y, PIE.N, null, { a: 0.5, A: S.A, C: S.C, glow: 0.45 });
        // the fact: a comet flying in, landing on the beat
        for (let k = 0; k < JOLTS.length; k++) {
          const tj = JOLTS[k], u = (lt - (tj - 0.32)) / 0.32; if (u < 0 || u > 1) continue;
          const d = COMET[k] * TAU, R0 = 760, R1 = PIE.R;
          const cm = PX.buf(240, 43);
          for (let q = 0; q < 240; q++) {
            const uu = clamp(u - q * 0.0011), rad = lerp(R0, R1, ease.in(uu)), wob = Math.sin(uu * 9 + k) * 30 * (1 - uu), sp = (PX.rand(q, 44) - 0.5) * 3 * (q / 240);
            cm.X[q] = PIE.cx + Math.sin(d) * rad + Math.cos(d) * (wob + sp); cm.Y[q] = PIE.cy - Math.cos(d) * rad + Math.sin(d) * (wob + sp);
            cm.A[q] = Math.pow(1 - q / 240, 1.5) * (q < 6 ? 4 : 1);
          }
          PX.points(cm.X, cm.Y, 240, WHITE, { a: 0.9, A: cm.A, glow: 0.9 });
        }
        PX.flush({ exposure: 1.5, glow: 1.1 });
        if (st.age < 0.5) { const d = st.dir; L.light(PIE.cx + Math.sin(d) * PIE.R, PIE.cy - Math.cos(d) * PIE.R, 160, 'rgba(255,240,220,0.5)', 1 - st.age / 0.5); }
        pieLabels(st, lt, api, L_);
      } else {
        // ---------------- tug-of-war (with the flight from the pie)
        const kFly = prog(lt, fly0, fly1);
        // knot: snaps to the middle when the rope forms, then the nine yank it to 1:9 (damped), tiny tremor after
        const kT = knotX(1, 9), a0 = lt - (fly1 - 0.2);
        kx = a0 < 0 ? 540 : kT + (540 - kT) * Math.exp(-a0 * 2.6) * Math.cos(a0 * 5.2) + Math.sin(lt * 13) * 0.7 * (1 - dbl * 0) ;
        // doubling: a surge of tension (the rope trembles) but the knot comes back to exactly the same place
        const surge = Math.sin(clamp((lt - tDbl) / 1.0) * Math.PI);
        kx += surge * Math.sin(lt * 31) * 3;
        let j = ropeInto(S, 0, kx, lt, (kx - 540) * 1.0, 1 + surge * 0.4);
        j = figInto(S, j, -1, 0, lt);
        for (let k = 0; k < 9; k++) j = figInto(S, j, 1, k, lt);
        const base = j;
        // the new figures of the doubled teams (condense from a dust of light)
        if (lt > tDbl - 0.1) {
          j = figInto(S, j, -1, 1, lt);
          for (let k = 9; k < 18; k++) j = figInto(S, j, 1, k, lt);
          for (let i = base, q = 0; i < j; i++, q++) {
            const d0 = PX.rand(q, 31) * 0.5, kk = ease.out(clamp((dbl - d0) / 0.5)), an = PX.rand(q, 32) * TAU, rad = 260 * (1 - kk) * (0.4 + PX.rand(q, 33));
            const side = S.X[i] < 540 ? -1 : 1;
            S.X[i] += Math.cos(an) * rad + side * (1 - kk) * 220; S.Y[i] += Math.sin(an) * rad * 0.6 - (1 - kk) * 120; S.A[i] *= kk;
          }
        }
        if (kFly < 1) {
          // pie -> tug: every pie particle flies to its place (or scatters into dust)
          const TM = tugMap(), mp = TM.m;
          const src = pieBufFrozen(api);
          const out = PX.buf(PIE.N, 41); if (!out.C) out.C = new Float32Array(PIE.N * 3);
          for (let i = 0; i < PIE.N; i++) {
            const d0 = PX.rand(i, 34) * 0.4, kk = sm((kFly - d0) / 0.6), t_ = mp[i];
            let tx, ty, ta, cr, cg, cb;
            if (t_ >= 0) { tx = S.X[t_]; ty = S.Y[t_]; ta = S.A[t_] * (t_ >= ROPE_TOTAL ? 0.76 : 1); cr = S.C[t_ * 3]; cg = S.C[t_ * 3 + 1]; cb = S.C[t_ * 3 + 2]; }
            else { const an = PX.rand(i, 35) * TAU; tx = src.X[i] + Math.cos(an) * 500; ty = src.Y[i] + Math.sin(an) * 500 + 200; ta = 0; cr = src.C[i * 3]; cg = src.C[i * 3 + 1]; cb = src.C[i * 3 + 2]; }
            const sw = Math.sin(kk * Math.PI) * 70 * (PX.rand(i, 36) - 0.5);
            out.X[i] = lerp(src.X[i], tx, kk) + sw; out.Y[i] = lerp(src.Y[i], ty, kk) - Math.sin(kk * Math.PI) * 60 * PX.rand(i, 37);
            out.A[i] = lerp(src.A[i], ta, kk);
            out.C[i * 3] = lerp(src.C[i * 3], cr, kk); out.C[i * 3 + 1] = lerp(src.C[i * 3 + 1], cg, kk); out.C[i * 3 + 2] = lerp(src.C[i * 3 + 2], cb, kk);
          }
          PX.points(out.X, out.Y, PIE.N, null, { a: 0.5, A: out.A, C: out.C, glow: lerp(0.45, 0.22, kFly) });
          // tug particles that no pie particle feeds fade in as the flight lands
          const fade = sm((kFly - 0.6) / 0.4);
          if (fade > 0 && TM.covered < ROPE_TOTAL) PX.points(S.X, S.Y, ROPE_TOTAL, null, { a: 0.5 * fade, A: S.A, C: S.C, glow: 0.18, from: TM.covered });
          if (fade > 0 && !TM.figsOk) PX.points(S.X, S.Y, j, null, { a: 0.38 * fade, A: S.A, C: S.C, glow: 0.3, from: ROPE_TOTAL });
        } else {
          PX.points(S.X, S.Y, ROPE_TOTAL, null, { a: 0.5, A: S.A, C: S.C, glow: 0.18 });
          PX.points(S.X, S.Y, j, null, { a: 0.38, A: S.A, C: S.C, glow: 0.3, from: ROPE_TOTAL });
        }
        PX.flush({ exposure: 1.5, glow: 1.15 });
        const ky = ropeY(kx, lt), kin = sm(prog(lt, fly1 - 0.4, fly1));
        L.light(kx, ky, 70, 'rgba(255,236,200,0.35)', kin);
        tugLabels(lt, api, L_, kx, kin, dbl);
        // the pie's labels clear as the flight starts
        pieLabels(pieBufFrozen(api).st, lt, api, L_);
      }
    },
    cues(V, api) {
      const tTug = at(api, 'tug'), tRel = at(api, 'rel'), out = [];
      out.push({ t: 0.05, type: 'gather', dur: 1.1 });
      JOLTS.forEach((tj, i) => { out.push({ t: tj, type: 'chip', i }); out.push({ t: tj + 0.08, type: 'ticks', dur: 0.3, n: 4, p0: 0.7, p1: 0.4 }); });
      out.push({ t: tTug, type: 'sweep', dur: 0.6 });
      out.push({ t: tTug + 0.6, type: 'whoosh', dur: 1.3 });
      out.push({ t: tTug + 1.5, type: 'punch' });
      out.push({ t: tRel, type: 'click' });
      out.push({ t: tRel + 0.6, type: 'whoosh', dur: 1.0 });
      out.push({ t: tRel + 1.5, type: 'thud' });
      return out;
    },
  });
  // the pie at the moment it leaves (10 / 90, still), cached
  let PIEF = null;
  function pieBufFrozen(api) {
    if (PIEF) return PIEF;
    const b = { X: new Float32Array(PIE.N), Y: new Float32Array(PIE.N), A: new Float32Array(PIE.N), C: new Float32Array(PIE.N * 3) };
    const st = pieInto(b, 99, api, true); b.st = st;
    return (PIEF = b);
  }

  function pieLabels(st, lt, api, L_) {
    const tTug = at(api, 'tug'), fly0 = tTug + 0.6;
    const out = prog(lt, fly0 - 0.1, fly0 + 0.4); if (out >= 1) return;
    const a = 1 - ease.in(out);
    // the line: 切蛋糕： / 每来一条信息，就重切一遍
    const [h1, h2] = splitAt(L_.pie, '：');
    const aP = a * (1 - prog(lt, tTug - 0.3, tTug + 0.1));
    line(h1, W / 2, 360, 66, { reveal: prog(lt, 0.2, 1.0), alpha: aP, glow: 8 });
    line(h2, W / 2, 450, 52, { reveal: prog(lt, 0.7, 1.9), alpha: aP, color: 'rgba(239,233,220,0.82)', glow: 4 });
    // wedge percentages, outside the pie on each wedge's bisector
    const g = st.g, s = st.s, R = PIE.R + 78;
    const la = a * ease.out(prog(lt, 0.8, 1.3));
    const pg = Math.round(g * 100), ps = Math.round(s * 100);
    const ag = TAU * g / 2, as = TAU * (1 - s / 2);
    const hot = st.age < 0.45 ? 1 - st.age / 0.45 : 0;
    K.text(pg + '%', PIE.cx + Math.sin(ag) * R, PIE.cy - Math.cos(ag) * R + 18, { size: 54, family: F.mono, weight: 700, color: C.gold, align: 'center', alpha: la, glow: 12 + hot * 20 });
    K.text(ps + '%', PIE.cx + Math.sin(as) * R, PIE.cy - Math.cos(as) * R + 18, { size: 54, family: F.mono, weight: 700, color: COOL, align: 'center', alpha: la, glow: 8 });
    // the nervous sum: gold% + steel% = sum%   (red while it is not 100)
    const sum = pg + ps, bad = sum !== 100, y = 1340;
    const jit = bad ? (Math.sin(lt * 90) * 3) : 0;
    const parts = [[pg + '%', C.gold], [' + ', C.dim], [ps + '%', COOL], [' = ', C.dim], [sum + '%', bad ? C.red : C.ink]];
    const fo = { size: 50, family: F.mono, weight: 700 };
    const tw = parts.reduce((w, p) => w + K.measure(p[0], fo), 0);
    let x = W / 2 - tw / 2; const sa = a * ease.out(prog(lt, 1.0, 1.5));
    parts.forEach((p, i) => { K.text(p[0], x + (i === 4 ? jit : 0), y, { ...fo, color: p[1], alpha: sa, glow: i === 4 ? (bad ? 22 : 8) : 0 }); x += K.measure(p[0], fo); });
    line(L_.sum, W / 2, 1440, 50, { reveal: prog(lt, 1.2, 2.2), alpha: a * (bad ? 0.75 + 0.25 * Math.sin(lt * 40) : 1), color: bad ? '#ffb2a8' : 'rgba(239,233,220,0.8)', glow: 4, highlight: ['100%'], hiColor: C.ink });
  }
  const splitAt = (s, p) => { const i = s.indexOf(p); return i < 0 ? [s, ''] : [s.slice(0, i + 1), s.slice(i + 1)]; };

  function tugLabels(lt, api, L_, kx, kin, dbl) {
    const tTug = at(api, 'tug'), tRel = at(api, 'rel'), tDbl = tRel + 0.6;
    // 换成赔率
    line(L_.odds, W / 2, 420, 54, { reveal: prog(lt, tTug + 0.1, tTug + 0.8), color: 'rgba(239,233,220,0.85)', glow: 4 });
    // the big ratio: 1 : 9  -> 2 : 18 when the teams double
    const k = ease.outExpo(prog(lt, tTug + 1.5, tTug + 2.1)); if (k <= 0) return;
    const sz = 190, y = 680, sc = lerp(1.3, 1, k), al = clamp(k * 3);
    const [l0, r0] = L_.tug.split(':').map(s => s.trim());
    const roll = ease.inOut(prog(lt, tDbl + 0.2, tDbl + 0.65));
    const num = (str, x, align, col, a, dy) => {
      const w = L.measureSerif(str, sz, { weight: 600, spacing: 0 }), cx = align === 'r' ? x - w / 2 : x + w / 2;
      L.serif(str, cx, y + dy, { size: sz * sc, weight: 600, color: col, alpha: a * al, glow: 16, spacing: 0 });
    };
    num(l0, 480, 'r', C.gold, clamp(1 - roll * 2), -roll * 90);
    num(r0, 600, 'l', COOL, clamp(1 - roll * 2), -roll * 90);
    if (roll > 0) { const rn = clamp(roll * 2 - 0.6); num(String(+l0 * 2), 480, 'r', C.gold, rn, (1 - roll) * 90); num(String(+r0 * 2), 600, 'l', COOL, rn, (1 - roll) * 90); }
    L.serif(':', W / 2, y - 8, { size: sz * 0.8 * sc, weight: 400, color: C.dim, alpha: al, glow: 0 });
    if (k < 0.3) L.light(W / 2, y, 420, 'rgba(255,220,160,0.35)', 1 - k / 0.3);
    // the centre mark (50 : 50) and, once the teams double, the knot's pin line: it does not move
    ctx.save(); ctx.globalAlpha *= 0.25 * kin; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(540, 930); ctx.lineTo(540, 1110); ctx.stroke(); ctx.restore();
    const pin = ease.out(prog(lt, tRel, tRel + 0.6));
    if (pin > 0) {
      const kT = knotX(1, 9);
      ctx.save(); ctx.globalAlpha *= 0.65 * pin; ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.moveTo(kT, 790 + (1 - pin) * 150); ctx.lineTo(kT, 1180); ctx.stroke(); ctx.restore();
    }
    // 只看两边的相对大小
    line(L_.rel, W / 2, 1330, 62, { reveal: prog(lt, tRel, tRel + 0.9), glow: 8, highlight: ['相对大小'], hiColor: C.gold });
  }

  // ================================================================ b10 equation
  const EQ = { y: 700, size: 68, gap: 24 };
  let RULE = null;
  function ruleLayout(rule) {
    if (RULE && RULE.ok) return RULE;
    const items = [rule[0], '=', rule[1], '×', rule[2]], sz = EQ.size;
    const ws = items.map(s => (s === '=' || s === '×') ? sz * 0.75 : L.measureSerif(s, sz, { weight: 600 }));
    const tw = ws.reduce((a, b) => a + b, 0) + EQ.gap * 4; let x = W / 2 - tw / 2;
    const out = items.map((s, i) => { const c = x + ws[i] / 2; x += ws[i] + EQ.gap; return { s, x: c, w: ws[i] }; });
    out.ok = document.fonts.status === 'loaded'; return (RULE = out);
  }
  function ruleCloud(item, i) {
    return PX.text(item.s, { size: EQ.size, family: F.serif, weight: (item.s === '=' || item.s === '×') ? 400 : 600, x: item.x, y: EQ.y + EQ.size * 0.36, step: 1.25, seed: 50 + i });
  }
  // fraction-stage layout
  const FR = { ny: 850, by: 896, dy: 958, lx: 290, rx: 790, size: 46, labY: 1052 };
  const TERMS = { PDS: 'P(D|成功)', PS: 'P(成功)', PDF: 'P(D|失败)', PF: 'P(失败)', PD: 'P(D)' };

  T.register('equation', {
    draw(ctx, V, lt, api) {
      const L_ = V.lines, tR = at(api, 'rule'), tLR = at(api, 'lr'), tF = at(api, 'fraction'), tC = at(api, 'cancel'), tO = at(api, 'only');
      const B = beat.BEAT, rule = ruleLayout(L_.rule);
      const tHit = tC + B;                                       // the annihilation lands on the beat
      const tRe0 = tC + 2 * B, tRe1 = tRe0 + 0.95;               // terms regroup
      const lands = [tR + 0.75, tR + 1.5, tR + 2.25, tR + 3.0, tR + 3.75];   // each rule item lands on a beat
      // ---------------- the rule: condenses out of light
      const toFr = sm(prog(lt, tF + 0.15, tF + 0.95));           // rule hands over to the fraction
      const ruleGone = sm(prog(lt, tF - 0.05, tF + 0.35));        // its right-hand side leaves first
      PX.begin(); dust(lt + api.beat.start);
      rule.forEach((it, i) => {
        const cl = ruleCloud(it, i), t1 = lands[i], t0 = t1 - 0.9;
        const k = prog(lt, t0, t1); if (k <= 0) return;
        const isLHS = i < 2, gone = isLHS ? 0 : ruleGone;
        const out = PX.buf(cl.n, 60 + i);
        const dyL = isLHS ? lerp(0, 600 - EQ.y, toFr) : 0, dxL = isLHS ? lerp(0, (i === 0 ? 500 : 652) - it.x, toFr) : 0;
        for (let q = 0; q < cl.n; q++) {
          const d0 = PX.rand(q, 61 + i) * 0.45, kk = ease.out(clamp((k - d0) / 0.55));
          const an = PX.rand(q, 62) * TAU, rad = (1 - kk) * (220 + 500 * PX.rand(q, 63));
          let x = cl.X[q] + Math.cos(an + (1 - kk) * 2) * rad, y = cl.Y[q] + Math.sin(an + (1 - kk) * 2) * rad * 0.7;
          x += Math.sin(lt * 2 + q) * 0.5 + dxL; y += dyL;
          if (gone > 0) { y += gone * gone * (120 + 200 * PX.rand(q, 64)); x += (PX.rand(q, 65) - 0.5) * 160 * gone; }
          out.X[q] = x; out.Y[q] = y; out.A[q] = (kk < 1 ? 0.5 + kk : 0.32) * (1 - gone);
        }
        const col = i === 4 ? GOLD : (it.s === '=' || it.s === '×') ? WHITE : [1, 0.93, 0.8];
        const hl = i === 4 ? 1 + 0.6 * win(lt, tLR, tF, 0.4, 0.5) : 1 - 0.4 * win(lt, tLR, tF, 0.4, 0.5);
        PX.points(out.X, out.Y, cl.n, col, { a: 0.42 * hl, A: out.A, glow: 0.6 });
      });
      // ---------------- the likelihood ratio, as two bars of light
      const bar = win(lt, tLR + 1.4, tF + 0.4, 0.3, 0.5);
      const unit = 104, bx = 290, gyB = 1300, syB = 1386;
      if (bar > 0) {
        const gk = sm(prog(lt, tLR + 1.5, tLR + 2.3)), sk = sm(prog(lt, tLR + 1.8, tLR + 2.4));
        barParticles(bx, gyB, unit * 5 * gk, GOLD, bar, 70, 30);
        barParticles(bx, syB, unit * sk, STEEL_L, bar, 71, 30);
        // the steel length laid along the gold bar, five times, on the beat
        for (let m = 0; m < 5; m++) {
          const tm = tLR + 2.25 + m * B * 0.5, mk = prog(lt, tm, tm + 0.3); if (mk <= 0) continue;
          const x0 = bx + m * unit, yy = lerp(syB, gyB - 36, ease.out(mk));
          barParticles(x0, yy, unit - 6, STEEL_L, bar * 0.5 * (1 - 0.5 * ease.out(mk)), 72 + m, 4);
        }
      }
      // ---------------- the two P(D) gather charge (motes orbiting them, brighter as the collision nears)
      if (lt > tF + 0.9 && lt < tHit) {
        const [xl, xr] = pdPos(lt, tC, tHit), ch = prog(lt, tF + 0.9, tF + 1.8) * (0.35 + 0.65 * prog(lt, tF + 2.5, tHit));
        [xl, xr].forEach((x, side) => {
          const n = 2200, out = PX.buf(n, 80 + side);
          for (let q = 0; q < n; q++) {
            const sp = 0.6 + PX.rand(q, 81) * 1.4, an = PX.rand(q, 82) * TAU + lt * sp * (side ? -1 : 1), rr = 50 + 80 * Math.pow(PX.rand(q, 83), 1.5);
            out.X[q] = x + Math.cos(an) * rr * 1.25; out.Y[q] = FR.dy - 14 + Math.sin(an) * rr * 0.55; out.A[q] = 0.3 + 0.7 * PX.rand(q, 84);
          }
          PX.points(out.X, out.Y, n, [1, 0.97, 0.9], { a: 0.32 * ch, A: out.A, glow: 0.6 });
        });
      }
      // ---------------- annihilation: shockwave + sparks
      const ah = lt - tHit;
      if (ah > -0.02 && ah < 1.6) shock(540, FR.dy, ah);
      // ---------------- the huge × (particles) in 'only'
      const big = sm(prog(lt, tO, tO + 0.7));
      if (big > 0) {
        const xc = PX.text('×', { size: 330, family: F.serif, weight: 400, x: 540, y: FR.by + 330 * 0.36, step: 1.6, seed: 77 });
        const out = PX.buf(xc.n, 78), pul = beat.pulse(lt + api.beat.start, 4);
        for (let q = 0; q < xc.n; q++) {
          const kk = ease.out(clamp((big - PX.rand(q, 79) * 0.4) / 0.6));
          const sc = lerp(0.2, 1, kk);
          out.X[q] = 540 + (xc.X[q] - 540) * sc + Math.sin(lt * 3 + q) * 0.8; out.Y[q] = FR.by + (xc.Y[q] - FR.by) * sc + Math.cos(lt * 2.6 + q) * 0.8;
          out.A[q] = kk * (0.8 + 0.3 * pul);
        }
        PX.points(out.X, out.Y, xc.n, [1, 0.88, 0.62], { a: 0.55, A: out.A, glow: 0.9 });
      }
      PX.flush({ exposure: 1.6, glow: 1.2 });
      // crisp rule text on top of its particles
      rule.forEach((it, i) => {
        const k = prog(lt, lands[i] - 0.25, lands[i] + 0.15); if (k <= 0) return;
        const isLHS = i < 2, op = it.s === '=' || it.s === '×';
        const hl = win(lt, tLR, tF, 0.4, 0.5);
        let a = ease.out(k) * (isLHS ? 1 : 1 - ruleGone) * (i === 4 ? 1 : 1 - 0.45 * hl);
        const x = isLHS ? lerp(it.x, i === 0 ? 500 : 652, toFr) : it.x, y = isLHS ? lerp(EQ.y, 600, toFr) : EQ.y;
        const sz = EQ.size * (isLHS ? lerp(1, 0.94, toFr) : 1);
        const col = i === 4 ? C.gold : op ? C.ink : '#fff3df';
        if (isLHS && lt > tO) a *= 1 - 0.55 * big;
        L.serif(it.s, x, y, { size: sz, weight: op ? 400 : 600, color: col, alpha: a, glow: i === 4 ? 10 + 14 * hl : 8 });
        const fl = 1 - prog(lt, lands[i], lands[i] + 0.35);
        if (fl > 0 && fl < 1) L.light(x, y, 160, 'rgba(255,230,190,0.4)', fl);
      });
      // ---------------- lr: the definition, broken at its punctuation
      const lrA = 1 - prog(lt, tF - 0.1, tF + 0.35);
      if (lt > tLR && lrA > 0) {
        const s = L_.lr, i1 = s.indexOf('：') + 1, i2 = s.indexOf('，') + 1;
        const r1 = s.slice(0, i1), r2 = s.slice(i1, i2), r3 = s.slice(i2);
        line(r1, W / 2, 920, 56, { reveal: prog(lt, tLR + 0.05, tLR + 0.5), alpha: lrA, color: C.gold, glow: 10 });
        line(r2, W / 2, 1010, 48, { reveal: prog(lt, tLR + 0.4, tLR + 1.5), alpha: lrA, highlight: ['成功'], hiColor: C.gold, glow: 3 });
        line(r3, W / 2, 1088, 48, { reveal: prog(lt, tLR + 1.2, tLR + 2.0), alpha: lrA, highlight: ['失败'], hiColor: COOL, glow: 3 });
        // bar labels and the ×5
        if (bar > 0) {
          K.text('成功', bx - 26, gyB + 13, { size: 38, family: F.serif, weight: 600, color: C.gold, align: 'right', alpha: bar * 0.9 });
          K.text('失败', bx - 26, syB + 13, { size: 38, family: F.serif, weight: 600, color: COOL, align: 'right', alpha: bar * 0.9 });
          for (let m = 1; m <= 5; m++) {
            const tm = tLR + 2.25 + (m - 1) * B * 0.5, mk = prog(lt, tm + 0.2, tm + 0.4); if (mk <= 0) continue;
            ctx.save(); ctx.globalAlpha *= bar * 0.6 * mk; ctx.fillStyle = C.ink; ctx.fillRect(bx + m * unit - 1, gyB - 34, 2, 52); ctx.restore();
          }
          const xk = ease.outExpo(prog(lt, tLR + 3.75, tLR + 4.1));
          if (xk > 0) K.text('×5', bx + 5 * unit + 34, gyB + 18, { size: 56 * lerp(1.4, 1, xk), family: F.mono, weight: 700, color: C.gold, alpha: bar * clamp(xk * 3), glow: 14 });
        }
      }
      // ---------------- the full form: two stacked fractions
      if (lt > tF) fractions(lt, api, L_, { tF, tC, tHit, tRe0, tRe1, tO, big, rule });
    },
    cues(V, api) {
      const tR = at(api, 'rule'), tLR = at(api, 'lr'), tF = at(api, 'fraction'), tC = at(api, 'cancel'), tO = at(api, 'only'), B = beat.BEAT;
      const out = [{ t: tR + 0.05, type: 'gather', dur: 0.7 }];
      out.push({ t: tR + 0.75, type: 'chip' }, { t: tR + 1.5, type: 'click' }, { t: tR + 2.25, type: 'chip' }, { t: tR + 3.0, type: 'click' }, { t: tR + 3.75, type: 'punch' });
      out.push({ t: tLR + 0.4, type: 'type', dur: 1.6 });
      out.push({ t: tLR + 1.5, type: 'sweep', dur: 0.8 });
      out.push({ t: tLR + 2.25, type: 'ticks', dur: 1.5, n: 5, p0: 0.3, p1: 0.9 });
      out.push({ t: tLR + 3.75, type: 'chip' });
      out.push({ t: tF, type: 'whoosh', dur: 0.8 });
      out.push({ t: tF + 0.75, type: 'click' }, { t: tF + 1.5, type: 'click' }, { t: tF + 2.25, type: 'click' });
      out.push({ t: tF + 3.0, type: 'riser', dur: tC + B - (tF + 3.0) });
      out.push({ t: tC, type: 'whoosh', dur: B });
      out.push({ t: tC + B, type: 'cancel' });
      out.push({ t: tC + 2 * B, type: 'whoosh', dur: 0.95 });
      out.push({ t: tC + 2 * B + 0.95, type: 'click' });
      out.push({ t: tO, type: 'punch' }, { t: tO + 0.2, type: 'swell', dur: 2.4 });
      return out;
    },
  });

  // a bar of light from x0, width w, centred at y
  function barParticles(x0, y, w, col, a, seed, h = 22) {
    if (w <= 1 || a <= 0) return;
    const n = Math.floor(w * h / 3.2), out = PX.buf(Math.max(1, n), seed);
    for (let q = 0; q < n; q++) { out.X[q] = x0 + PX.rand(q, seed) * w; out.Y[q] = y + (PX.rand(q, seed + 1) - 0.5) * h; out.A[q] = 0.7 + 0.3 * PX.rand(q, seed + 2); }
    PX.points(out.X, out.Y, n, col, { a: 0.55 * a, A: out.A, glow: 0.5 });
    PX.points(out.X, out.Y, Math.min(n, Math.floor(w * 1.2)), WHITE, { a: 0.4 * a, glow: 0.2, A: edgeA(out, n, x0 + w) });
  }
  const EA = new Float32Array(4096);
  function edgeA(out, n, xe) { const m = Math.min(n, 4096); for (let q = 0; q < m; q++) EA[q] = Math.exp(-Math.abs(xe - out.X[q]) / 6); return EA; }

  function shock(cx, cy, age) {
    const n = 9000, out = PX.buf(n, 90);
    const R = 40 + 900 * (1 - Math.exp(-age * 3.2)), fade = Math.exp(-age * 2.2);
    for (let q = 0; q < n; q++) {
      const an = PX.rand(q, 91) * TAU;
      let r, a;
      if (q < 6000) { r = R * (0.93 + 0.07 * PX.rand(q, 92)); a = fade * 0.7; }                       // the ring
      else { const sp = 0.2 + Math.pow(PX.rand(q, 93), 2) * 1.1; r = R * sp; a = fade * (1.2 - sp * 0.6); }   // sparks
      out.X[q] = cx + Math.cos(an) * r; out.Y[q] = cy + Math.sin(an) * r * 0.85; out.A[q] = a;
    }
    PX.points(out.X, out.Y, n, [1, 0.95, 0.85], { a: 0.6, A: out.A, glow: 0.7 });
    if (age < 0.35) {      // the white core
      const m = 2500, o2 = PX.buf(m, 94);
      for (let q = 0; q < m; q++) { const an = PX.rand(q, 95) * TAU, r = Math.sqrt(PX.rand(q, 96)) * 60 * (1 + age * 4); o2.X[q] = cx + Math.cos(an) * r; o2.Y[q] = cy + Math.sin(an) * r; o2.A[q] = 1 - age / 0.35; }
      PX.points(o2.X, o2.Y, m, [1, 1, 1], { a: 1.2, A: o2.A, glow: 1 });
    }
  }

  // where the two P(D) are (they slide together on 'cancel' and meet on the beat)
  function pdPos(lt, tC, tHit) {
    const sl = ease.in(prog(lt, tC, tHit)), wPD = mathW(TERMS.PD, FR.size);
    return [lerp(FR.lx, 540 - wPD * 0.3, sl), lerp(FR.rx, 540 + wPD * 0.3, sl)];
  }
  // the two stacked fractions, the collision of the P(D)s, and the regrouping into 旧赔率 × 似然比
  function fractions(lt, api, L_, s) {
    const { tF, tC, tHit, tRe0, tRe1, tO, big, rule } = s;
    const B = beat.BEAT, fs = FR.size;
    const numL = TERMS.PDS + '·' + TERMS.PS, numR = TERMS.PDF + '·' + TERMS.PF;
    const wPDS = mathW(TERMS.PDS, fs), wPS = mathW(TERMS.PS, fs), wDot = mathW('·', fs), wNL = mathW(numL, fs);
    const wPDF = mathW(TERMS.PDF, fs), wPF = mathW(TERMS.PF, fs), wNR = mathW(numR, fs);
    // stage-1 positions (centres) of the parts of each numerator
    const pPDS = FR.lx - wNL / 2 + wPDS / 2, pPS = FR.lx + wNL / 2 - wPS / 2, pDotL = FR.lx - wNL / 2 + wPDS + wDot / 2;
    const pPDF = FR.rx - wNR / 2 + wPDF / 2, pPF = FR.rx + wNR / 2 - wPF / 2, pDotR = FR.rx - wNR / 2 + wPDF + wDot / 2;
    // final positions: P(成功)/P(失败)  ×  P(D|成功)/P(D|失败)
    const LX2 = 300, RX2 = 780;
    const re = sm(prog(lt, tRe0, tRe1)), spread = big;          // regroup; then fractions make room for the huge ×
    const lx2 = LX2 - 40 * spread, rx2 = RX2 + 30 * spread;
    const dimO = 1 - 0.45 * big;
    const appear = (t0, d = 0.5) => ease.out(prog(lt, t0, t0 + d));
    const aNL = appear(tF + 0.45), aDL = appear(tF + 0.75 + 0.2), aNR = appear(tF + 1.5), aDR = appear(tF + 1.7), aDiv = appear(tF + 2.25);
    const rise = (k) => (1 - k) * 24;
    // arcs for the regroup (terms cross over)
    const arc = (x0, y0, x1, y1, k, h) => [lerp(x0, x1, k), lerp(y0, y1, k) - Math.sin(k * Math.PI) * h];
    const gold = C.gold, cool = COOL;
    // --- numerator terms
    let p;
    p = arc(pPDS, FR.ny, rx2, FR.ny, re, 120); math(TERMS.PDS, p[0], p[1] + rise(aNL), fs, gold, aNL * dimO, { glow: 8 });
    p = arc(pPS, FR.ny, lx2, FR.ny, re, 60); math(TERMS.PS, p[0], p[1] + rise(aNL), fs, gold, aNL * dimO, { glow: 8 });
    p = arc(pPDF, FR.ny, rx2, FR.dy, re, -30); math(TERMS.PDF, p[0], p[1] + rise(aNR), fs, cool, aNR * dimO, { glow: 6 });
    p = arc(pPF, FR.ny, lx2, FR.dy, re, -150); math(TERMS.PF, p[0], p[1] + rise(aNR), fs, cool, aNR * dimO, { glow: 6 });
    const dotA = 1 - prog(lt, tRe0, tRe0 + 0.3);
    math('·', pDotL, FR.ny + rise(aNL), fs, C.ink, aNL * dotA);
    math('·', pDotR, FR.ny + rise(aNR), fs, C.ink, aNR * dotA);
    // --- fraction bars: stage 1 under each numerator; after the regroup, under the new fractions
    const barW1L = wNL + 16, barW1R = wNR + 16, barW2L = Math.max(wPS, wPF) + 30, barW2R = Math.max(wPDS, wPDF) + 30;
    const collapse = sm(prog(lt, tHit, tHit + 0.5));             // after the collision the stage-1 bars shrink to the merged form
    const bars = [[FR.lx, barW1L, lx2, barW2L, aDL], [FR.rx, barW1R, rx2, barW2R, aDR]];
    bars.forEach(([x1, w1, x2, w2, a]) => {
      const x = lerp(x1, x2, re), w = lerp(w1, w2, re) * appear(tF + 0.6, 0.6);
      ctx.save(); ctx.globalAlpha *= a * dimO * (1 - 0.35 * collapse * (1 - re)); ctx.fillStyle = '#efe9dc'; ctx.shadowColor = '#ffe2b0'; ctx.shadowBlur = 8;
      ctx.fillRect(x - w / 2, FR.by - 1.5, w, 3); ctx.restore();
    });
    // --- ÷ -> ×
    const opY = FR.by;
    const divA = aDiv * (1 - prog(lt, tRe0 + 0.3, tRe0 + 0.7));
    L.glyph('÷', 540, opY, 64, C.ink, divA, { family: F.serif, weight: 400, glow: 8 });
    const xA = prog(lt, tRe0 + 0.4, tRe0 + 0.9);
    if (xA > 0) L.glyph('×', 540, opY, lerp(64, 250, big), big > 0 ? '#ffe9c4' : C.ink, xA, { family: F.serif, weight: 400, glow: 10 + 20 * big });
    // --- the two P(D): they glow, slide together on 'cancel', annihilate on the beat
    if (lt < tHit) {
      const glowK = 0.5 + 0.5 * prog(lt, tF + 3.0, tC) + 0.3 * beat.pulse(lt + api.beat.start, 5) * prog(lt, tF + 3.0, tC);
      const [xl, xr] = pdPos(lt, tC, tHit);
      [[xl, aDL], [xr, aDR]].forEach(([x, a]) => {
        L.light(x, FR.dy, 110 + 40 * glowK, 'rgba(255,245,230,0.35)', a * glowK);
        math(TERMS.PD, x, FR.dy + rise(a), fs, '#ffffff', a, { glow: 10 + 16 * glowK });
      });
    }
    // the flash
    const fa = lt - tHit;
    if (fa >= 0 && fa < 0.6) {
      L.light(540, FR.dy, 380, 'rgba(255,250,240,0.6)', Math.pow(1 - fa / 0.6, 2));
      if (fa < 0.12) { ctx.save(); ctx.globalAlpha *= (1 - fa / 0.12) * 0.18; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    }
    // --- labels: 旧赔率 under the left fraction, 似然比 under the right (the rule's words come home)
    const lb = sm(prog(lt, tRe1 - 0.1, tRe1 + 0.5));
    if (lb > 0) {
      line(rule[2].s, lx2, FR.labY + (1 - lb) * 20, 44, { alpha: lb * dimO, color: 'rgba(239,233,220,0.85)', glow: 4 });
      line(rule[4].s, rx2, FR.labY + (1 - lb) * 20, 44, { alpha: lb * dimO, color: C.gold, glow: 8 });
    }
    // --- words
    const cA = 1 - prog(lt, tO - 0.35, tO);
    if (lt > tHit) line(L_.cancel, W / 2, 1250, 62, { reveal: prog(lt, tHit + 0.1, tHit + 0.8), alpha: cA, glow: 8 });
    if (lt > tO) line(L_.only, W / 2, 1270, 76, { reveal: prog(lt, tO + 0.25, tO + 1.0), glow: 10, highlight: ['乘法'], hiColor: C.gold });
  }
})();
