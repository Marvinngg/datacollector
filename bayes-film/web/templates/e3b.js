/* e3b: the evidence. One continuous picture across three beats (b11 → b12 → b13, 52.5 s).
 * b11 evidence1 — the 1000 beads; a card 「创始人背景优秀」 stamps down, a shockwave runs through the field; a sieve ring
 *                 keeps 50 gold + 90 steel lit (counted live), the rest sink to dust and settle as sediment; the
 *                 survivors stream into two piles (rows of ten: 5 rows vs 9 rows); "50 : 90 = 5 : 9", ×5; the gold
 *                 team on the rope grows 1 → 5 figures, the knot slides, the odometer rolls 10% → 36%.
 * b12 evidence2 — 「产品还没上线」 stamps onto the piles; 20 of 50 and 54 of 90 stay lit, the rest fall away, the piles
 *                 re-pack; "20 : 54 = 10 : 27", ×⅔: the gold team loses 1⅔ figures, 36% → 27%. The gut's imagined gold
 *                 beads appear as an ember ghost at the 50–60% level, high above the real pile.
 * b13 noise     — 「团队很努力」 drops… and nothing moves (×1). Then the whole calculation assembles as one luminous line,
 *                 its last term made of the 74 beads that are left.
 * draw() is a pure function of absolute time: every beat of the chain calls the same scene(t). */
(function () {
  const { W, H, F, clamp, lerp, prog, ease, rng, measure } = K;
  const { C, PROJ } = KIT;
  const TAU = Math.PI * 2, B = KIT.beat.BEAT, COL = PX.COL;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });
  const GOLD = COL.gold, STEEL = COL.steel, LSTEEL = [0.64, 0.74, 0.9], DUST = [0.40, 0.44, 0.53], EMBER = COL.ember;
  const ROPEC = [1, 0.9, 0.72], KNOT = [1, 0.97, 0.9];
  const CSTEEL = '#a9bcd8', CGOLD = C.gold, CINK = C.ink, CDIM = 'rgba(239,233,220,0.5)';
  try { document.fonts.load(`900 100px ${F.serif}`, '人×0123456789创始人背景优秀产品还没上线团队很努力'); document.fonts.load(`600 100px ${F.serif}`, '0123456789:=×'); } catch (e) { /* fonts load lazily */ }

  // ================================================================ geometry
  const GR = KIT.GRID, PIV = { x: W / 2, y: GR.y0 + (GR.rows - 1) * GR.pitch / 2 }, CAM = 0.8;
  const CARD_XY = [{ x: W / 2, y: PIV.y }, { x: W / 2, y: 1062 }, { x: W / 2, y: 1062 }];
  const PILE = { p: 32, r: 11, base: 1180, gx: 300, sx: 780 };
  const ROPE = { y: 420, x0: 50, x1: 1050, gIn: 300, sIn: 780, fig: 100 };
  const ODDS_Y = 534, ODO_Y = 690, BIG_Y = 872, CNT_Y = 1292, RATIO_Y = 1414, SED = 1856, BR = 11;
  const camXY = (x, y, s) => [PIV.x + (x - PIV.x) * s, PIV.y + (y - PIV.y) * s];
  const slotXY = (gold, s) => [(gold ? PILE.gx : PILE.sx) + ((s % 10) - 4.5) * PILE.p, PILE.base - Math.floor(s / 10) * PILE.p];
  const levelY = rows => PILE.base + PILE.p / 2 - rows * PILE.p;          // top edge of a pile `rows` rows tall

  // ================================================================ the beads
  const N = 1000, GX = new Float32Array(N), GY = new Float32Array(N), D1 = new Float32Array(N);
  for (let i = 0; i < N; i++) { const [x, y] = KIT.gridPos(i); GX[i] = x; GY[i] = y; const [a, b] = camXY(x, y, CAM); D1[i] = Math.hypot(a - CARD_XY[0].x, b - CARD_XY[0].y); }
  const R1MAX = Math.max(...D1) + 10;
  // dust: everyone without the trait. Each settles into the sediment under its own grid column (bottom rows first).
  const DUSTI = [], SX = new Float32Array(N), SY = new Float32Array(N), FT = new Float32Array(N);
  // the sediment is a low dune: x near the bead's own column, height filled uniformly under a soft mound profile
  for (let i = 0; i < N; i++) {
    if (PROJ.founder[i]) continue; DUSTI.push(i);
    const row = Math.floor(i / GR.cols), [x] = camXY(GX[i], GY[i], CAM);
    SX[i] = x + (PX.rand(i, 41) - 0.5) * GR.pitch * CAM * 1.6;
    const m = 1 - Math.pow((SX[i] - W / 2) / 470, 2), h = 26 + 70 * Math.max(0, m);
    SY[i] = SED - Math.pow(PX.rand(i, 42), 1.6) * h;
    FT[i] = (GR.rows - 1 - row) / GR.rows * 1.0 + PX.rand(i, 43) * 0.35;      // fall delay (bottom rows first)
  }
  // the lit 140 in pile order (a stable random order, so the later survivors are scattered through each pile)
  const byRank = a => a.slice().sort((x, y) => PROJ.rank[x] - PROJ.rank[y]);
  const LIT = [];
  byRank(PROJ.succF).forEach((i, s) => LIT.push({ i, gold: 1, s, f: s / 50 }));
  byRank(PROJ.failF).forEach((i, s) => LIT.push({ i, gold: 0, s, f: s / 90 }));
  { const c2 = [0, 0]; for (const L of LIT) { L.surv = PROJ.unlaunched[L.i]; L.s2 = L.surv ? c2[L.gold]++ : -1; L.slot = slotXY(L.gold, L.s); L.slot2 = L.surv ? slotXY(L.gold, L.s2) : L.slot; L.d2 = Math.hypot(L.slot[0] - CARD_XY[1].x, L.slot[1] - CARD_XY[1].y); L.d3 = Math.hypot(L.slot2[0] - CARD_XY[2].x, L.slot2[1] - CARD_XY[2].y);
    L.sed = [L.slot[0] + (PX.rand(L.i, 51) - 0.5) * 60, SED - 104 - PX.rand(L.i, 52) * 8]; }
    if (c2[1] !== PROJ.succFU.length || c2[0] !== PROJ.failFU.length) console.warn('e3b: survivor counts', c2); }
  const NG = PROJ.succF.length, NS = PROJ.failF.length, NGU = PROJ.succFU.length, NSU = PROJ.failFU.length;   // 50 90 20 54

  // ================================================================ schedule (absolute seconds, from the chain's steps)
  let SC = null, SCK = '';
  function sched(api) {
    const t0 = api.beat.start, st = {};
    for (const s of api.steps) { const b = T.TL.beats.find(b => b.id === s.owner); if (b) st[b.visual.type + '.' + s.show] = { t: t0 + s.lt, d: s.dur }; }
    const key = JSON.stringify(st); if (key === SCK) return SC;
    const g = k => (st[k] || { t: 1e9, d: 0 }).t, d = k => (st[k] || { d: 0 }).d;
    const S = { st };
    // b11
    S.open = g('evidence1.stamp'); S.hov1 = S.open + 0.35; S.imp1 = S.open + 2 * B;
    S.pull0 = S.imp1 + 0.55; S.pull1 = g('evidence1.light') + 0.4;
    S.lift1 = g('evidence1.light') + 0.05;
    S.lab = g('evidence1.light') + 0.15;
    S.sv1 = g('evidence1.light') + 0.4; S.sv1d = Math.max(1.5, d('evidence1.light') - 1.6);
    S.str = g('evidence1.stream'); S.st0 = S.str + 0.15; S.stSpan = 1.8; S.stTrav = 1.35;
    S.hud0 = S.str + 2.9; S.hud1 = S.hud0 + 1.3; S.rope0 = S.str + 3.1;
    S.r1 = g('evidence1.ratio'); S.eq1 = S.r1 + B; S.x5 = S.r1 + 2 * B; S.roll1 = S.x5 + 0.3; S.rollD = 1.6;
    S.note = g('evidence1.note');
    // b12
    S.out1 = g('evidence2.stamp'); S.hov2 = S.out1 + 0.4; S.imp2 = S.out1 + 2 * B; S.lift2 = g('evidence2.filter') + 0.05;
    S.sv2 = g('evidence2.filter') + 0.35; S.sv2d = 1.7; S.rp = g('evidence2.filter') + 2.4;
    S.r2 = g('evidence2.ratio'); S.eq2 = S.r2 + B; S.x23 = S.r2 + 2 * B; S.roll2 = S.x23 + 0.3;
    S.gh = g('evidence2.ghost'); S.foot = S.gh + 2 * B;
    // b13
    S.out2 = g('noise.drop'); S.hov3 = S.out2 + 0.45; S.imp3 = S.out2 + 2 * B; S.sv3 = S.imp3 + 0.2; S.sv3d = 1.0;
    S.x1 = g('noise.nothing'); S.slide3 = S.x1 + 1.0;
    S.txt = g('noise.text'); S.ch = g('noise.chain');
    S.end = S.ch + d('noise.chain');
    S.terms = [0, 1, 2, 3, 3.6].map(k => S.ch + k * B);
    SC = S; SCK = key; return S;
  }
  const LN = type => { const b = T.TL.beats.find(b => b.visual.type === type); return b ? b.visual.lines : {}; };

  // ================================================================ text helpers (⅔ is typeset by hand: no web font has it)
  const FR = '⅔';
  function measureT(str, size, fam, wt) {
    const parts = str.split(FR); let w = 0;
    parts.forEach((p, i) => { if (p) w += measure(p, { size, family: fam, weight: wt }); if (i < parts.length - 1) w += size * 0.92; });
    return w;
  }
  // draw str at left x / baseline y on context g with the current fillStyle
  function drawT(g, str, x, y, size, fam, wt) {
    const parts = str.split(FR);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    parts.forEach((p, i) => {
      if (p) { g.font = `${wt} ${size}px ${fam}`; g.fillText(p, x, y); x += measure(p, { size, family: fam, weight: wt }); }
      if (i < parts.length - 1) {
        const s = size; g.font = `${wt} ${s * 0.56}px ${fam}`;
        g.fillText('2', x + s * 0.02, y - s * 0.34);
        g.save(); g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(2, s * 0.055); g.lineCap = 'round';
        g.beginPath(); g.moveTo(x + s * 0.24, y + s * 0.04); g.lineTo(x + s * 0.68, y - s * 0.72); g.stroke(); g.restore();
        g.fillText('3', x + s * 0.52, y + s * 0.04);
        x += s * 0.92;
      }
    });
  }
  /** a row of coloured tokens, centred at x. o: size, family, weight, alpha, k (rise-in 0..1), gap (px between tokens) */
  function rich(tokens, x, y, o = {}) {
    const size = o.size || 64, fam = o.family || F.serif, wt = o.weight || 600, gap = o.gap == null ? size * 0.28 : o.gap;
    const ws = tokens.map(t => measureT(t.s, size, fam, wt)), tw = ws.reduce((a, b) => a + b, 0) + gap * (tokens.length - 1);
    let cx = (o.align === 'left' ? x : o.align === 'right' ? x - tw : x - tw / 2);
    const ctx = K.ctx, a0 = ctx.globalAlpha * (o.alpha == null ? 1 : o.alpha);
    tokens.forEach((t, i) => {
      const k = t.k == null ? (o.k == null ? 1 : o.k) : t.k, e = ease.out(clamp(k));
      if (e > 0.001 && (t.a == null || t.a > 0)) {
        ctx.save(); ctx.globalAlpha = a0 * e * (t.a == null ? 1 : t.a); ctx.fillStyle = t.c || CINK;
        drawT(ctx, t.s, cx, y + (1 - e) * size * 0.32, size, fam, wt); ctx.restore();
      }
      cx += ws[i] + gap;
    });
    return tw;
  }
  // number tokens of a "a : b = c : d" line, gold / steel alternating; operators dim
  function ratioTokens(str) {
    let n = 0; return str.split(/\s+/).filter(Boolean).map(s => /\d/.test(s) ? { s, c: (n++ % 2 === 0) ? CGOLD : CSTEEL } : { s, c: CDIM, op: 1 });
  }

  // ================================================================ particle clouds of text (cached), centred on x = 0, baseline y = 0
  const clouds = new Map();
  function cloud(str, size, o = {}) {
    const fam = o.family || F.serif, wt = o.weight || 900, step = o.step || Math.max(1.5, size / 44);
    const key = [str, size, fam, wt, step, document.fonts.check(`${wt} 40px ${fam}`, str.replace(FR, '2'))].join('|');
    let s = clouds.get(key); if (s) return s;
    const tw = measureT(str, size, fam, wt), cw = Math.ceil(tw + size), ch = Math.ceil(size * 1.6), cv = mk(cw, ch), g = cv.getContext('2d');
    g.fillStyle = '#fff'; drawT(g, str, size * 0.5, size * 1.2, size, fam, wt);
    const d = g.getImageData(0, 0, cw, ch).data, r = rng(str.length * 97 + size), xs = [], ys = [];
    for (let y = 0; y < ch; y += step) for (let x = 0; x < cw; x += step) {
      const jx = x + (r() - 0.5) * step * 0.8, jy = y + (r() - 0.5) * step * 0.8, ix = Math.min(cw - 1, Math.max(0, jx | 0)), iy = Math.min(ch - 1, Math.max(0, jy | 0));
      if (d[(iy * cw + ix) * 4 + 3] > 110) { xs.push(jx - size * 0.5 - tw / 2); ys.push(jy - size * 1.2); }
    }
    s = PX.shuffle({ X: Float32Array.from(xs), Y: Float32Array.from(ys), n: xs.length, w: tw }, str.length + 3);
    let y0 = 1e9, y1 = -1e9; for (let i = 0; i < s.n; i++) { y0 = Math.min(y0, s.Y[i]); y1 = Math.max(y1, s.Y[i]); } s.y0 = y0; s.y1 = y1;
    clouds.set(key, s); return s;
  }
  const FIG = () => cloud('人', ROPE.fig, { weight: 900, step: 2.1 });

  // ================================================================ point buffers
  const bufs = {};
  function pbuf(name, n) { let b = bufs[name]; if (!b || b.X.length < n) bufs[name] = b = { X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n), R: new Float32Array(n), C: new Float32Array(n * 3), n: 0 }; b.n = 0; return b; }
  function push(b, x, y, a, r, c) { const k = b.n++; b.X[k] = x; b.Y[k] = y; b.A[k] = a; b.R[k] = r; b.C[k * 3] = c[0]; b.C[k * 3 + 1] = c[1]; b.C[k * 3 + 2] = c[2]; }
  const mixc = (o, a, b, k) => { o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k; return o; };
  const tc = [0, 0, 0], tc2 = [0, 0, 0];

  // ================================================================ physics, closed-form
  // a shockwave from (cx, cy) at t0, speed v: the bead jolts radially (and hops) as the front passes it
  const J = { x: 0, y: 0, b: 0 };
  function jolt(t, t0, cx, cy, x, y, v, amp) {
    J.x = 0; J.y = 0; J.b = 0;
    const tau = t - t0; if (tau < 0 || tau > 3.5 || amp <= 0) return J;
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) + 1e-3, u = tau - d / v;
    if (u < 0) return J;
    const f = amp / (1 + d / 520), e = Math.exp(-u * 5.5), s = Math.sin(u * 26) * e * f;
    J.x = dx / d * s; J.y = dy / d * s - Math.abs(Math.sin(u * 13)) * e * f * 0.7; J.b = Math.exp(-u * 8);
    return J;
  }
  // camera shake from the impacts
  function shake(t, S) {
    let x = 0, y = 0;
    for (const [t0, a] of [[S.imp1, 16], [S.imp2, 11], [S.imp3, 1.5]]) {
      const u = t - t0; if (u < 0 || u > 1.2) continue;
      const e = Math.exp(-u * 7.5) * a; x += Math.sin(u * 71 + 1.3) * e * 0.6; y += Math.sin(u * 53) * e;
    }
    return [x, y];
  }
  const gravY = (u, g = 2600) => 0.5 * g * u * u;

  // ================================================================ the cards (a heavy slab with a stamped, inked face)
  const cardCache = new Map(); let shadowSpr = null;
  function cardImg(str) {
    let c = cardCache.get(str); if (c) return c;
    const size = 84, fam = F.serif, wt = 900, sp = 10;
    const tw = measure(str, { size, family: fam, weight: wt, spacing: sp }) - sp, w = Math.ceil(tw + 150), h = 200;
    const cv = mk(w, h), g = cv.getContext('2d');
    g.beginPath(); g.roundRect(0, 0, w, h, 16); const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, '#1d2028'); lg.addColorStop(1, '#0d0f14'); g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(255,240,210,0.16)'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = '#efe3c8'; g.lineWidth = 5; g.strokeRect(18, 18, w - 36, h - 36); g.lineWidth = 1.6; g.strokeRect(29, 29, w - 58, h - 58);
    g.fillStyle = '#f6ecd6'; g.font = `${wt} ${size}px ${fam}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = sp + 'px';
    g.fillText(str, w / 2 + sp / 2, h / 2 + 6);
    // ink grain: specks of the slab's colour knocked into the ivory (a rubber stamp never inks evenly)
    const r = rng(str.length * 31 + 5);
    for (let k = 0; k < 2600; k++) { const x = r() * w, y = r() * h, rr = 0.6 + r() * r() * 2.6; g.fillStyle = `rgba(16,18,24,${0.35 + r() * 0.5})`; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); }
    c = { cv, w, h }; cardCache.set(str, c); return c;
  }
  function shadowImg() {
    if (shadowSpr) return shadowSpr;
    const w = 760, h = 300, a = mk(w, h), g = a.getContext('2d');
    g.filter = 'blur(26px)'; g.fillStyle = 'rgba(0,0,0,0.95)'; g.beginPath(); g.roundRect(80, 60, w - 160, h - 120, 20); g.fill();
    return (shadowSpr = { cv: a, w, h });
  }
  /** draw a card at (x, y): s scale, rot, alpha, lift (0 = on the table, 1 = high) */
  function drawCard(str, x, y, s, rot, alpha, lift, sq = 0) {
    if (alpha <= 0.003) return;
    const ctx = K.ctx, im = cardImg(str), sh = shadowImg();
    ctx.save(); ctx.globalAlpha *= alpha;
    // shadow: far and soft when high, tight and dark at contact
    const so = 18 + lift * 110, ss = s * (1 + lift * 0.18) * im.w / (sh.w - 160);
    ctx.save(); ctx.globalAlpha *= lerp(0.85, 0.35, lift);
    ctx.translate(x + so * 0.35, y + so); ctx.rotate(rot); ctx.scale(ss, s * (1 + lift * 0.18) * im.h / (sh.h - 120));
    ctx.drawImage(sh.cv, -sh.w / 2, -sh.h / 2); ctx.restore();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s * (1 + sq * 0.05), s * (1 - sq * 0.08));
    ctx.drawImage(im.cv, -im.w / 2, -im.h / 2);
    ctx.restore();
  }
  // card motion: hover from t hov, slam at imp; returns {s, rot, lift, sq}
  function cardMotion(t, hov, imp, o = {}) {
    const hi = o.hi || 1.55;
    if (t < imp) {
      const fall = prog(t, imp - (o.fall || 0.3), imp);
      const hover = 1 - 0.06 * ease.out(prog(t, hov, imp - 0.3)) + 0.012 * Math.sin((t - hov) * 3.2);
      const s = lerp(hi * hover, 1, ease.in(fall));
      return { s, rot: lerp(-0.045 + 0.01 * Math.sin((t - hov) * 2.1), -0.012, ease.in(fall)), lift: (s - 1) / (hi - 1), sq: 0, a: ease.out(prog(t, hov, hov + 0.35)) };
    }
    const u = t - imp, sq = Math.exp(-u * 9) * Math.cos(u * 34) * (o.soft ? 0.25 : 1);
    return { s: 1, rot: -0.012, lift: 0, sq, a: 1 };
  }

  // ================================================================ the scene
  function scene(t, api) {
    const S = sched(api), ctx = K.ctx;
    const L1 = LN('evidence1'), L2 = LN('evidence2'), L3 = LN('noise');
    const [shx, shy] = shake(t, S);
    const cs = lerp(1, CAM, ease.inOut(prog(t, S.pull0, S.pull1)));       // camera pull-back on the grid
    const chainK = ease.inOut(prog(t, S.ch, S.ch + 1.2));                    // everything dims for the recap
    const dimAll = 1 - 0.55 * chainK;

    PX.begin();

    // ---------------------------------------------------------------- sieve state of the grid (b11)
    const v1 = R1MAX / S.sv1d;
    // ---- dust: the 860 without the trait
    const big = pbuf('big', 1000), dust = pbuf('dust', 1000);
    for (const i of DUSTI) {
      let [x, y] = camXY(GX[i], GY[i], cs);
      const ok = PROJ.ok[i];
      const jl = jolt(t, S.imp1, CARD_XY[0].x, CARD_XY[0].y, x, y, 1500, 22);
      x += jl.x; y += jl.y;
      const tp = S.sv1 + D1[i] / v1, dk = ease.out(prog(t, tp, tp + 0.45));
      const base = ok ? 1.0 : 0.78, col = ok ? GOLD : STEEL;
      if (dk <= 0) { push(big, x + shx, y + shy, (base + jl.b * 0.9) * fadeOpen(t, S), 9 * cs / BR, col); continue; }
      // sinking to dust, then (stream) falling into the sediment
      const sink = 7 * dk, tf = S.str + FT[i], u = Math.max(0, t - tf);
      let dx = x, dy = y + sink;
      if (u > 0) { const fy = gravY(u), ty = SY[i]; const k = clamp(fy / Math.max(1, ty - dy)); dx = lerp(dx, SX[i], ease.inOut(k)); dy = Math.min(ty, dy + fy); }
      const settled = u > 0 && dy >= SY[i] - 0.5;
      const a = lerp(base, 0.16, dk) * (settled ? 0.85 : 1);
      const r = lerp(9 * cs, u > 0 ? 3.6 : 5.4, dk) / BR;
      push(dk < 0.5 ? big : dust, dx + shx, dy + shy, a * (1 - 0.15 * dk * (1 - dk) * 4), r, mixc(tc, col, DUST, dk));
    }

    // ---- the lit 140: grid → stream → pile → filter / repack → chain
    const pile = pbuf('pile', 200), trails = pbuf('trail', 140 * 80);
    let nG = 0, nS = 0;                                               // live counts in the piles
    const v2 = 300 / S.sv2d, v3 = 300 / S.sv3d;
    const chainPull = prog(t, S.terms[4] - 0.2, S.terms[4] + 1.2);       // survivors give their light to "10:27"
    for (const L of LIT) {
      const i = L.i, gold = L.gold;
      const td = S.st0 + L.f * S.stSpan + PX.rand(i, 61) * 0.12, ta = td + S.stTrav;
      const lc = gold ? GOLD : LSTEEL;
      if (t < td) {
        // in the grid: like the others until the sieve ring passes, then it lights up
        let [x, y] = camXY(GX[i], GY[i], cs);
        const jl = jolt(t, S.imp1, CARD_XY[0].x, CARD_XY[0].y, x, y, 1500, 22); x += jl.x; y += jl.y;
        const tp = S.sv1 + D1[i] / v1, lk = ease.out(prog(t, tp, tp + 0.3)), fl = t > tp ? Math.exp(-(t - tp) * 5) : 0;
        const base = gold ? 1.0 : 0.78;
        const a = lerp(base, gold ? 2.1 : 1.5, lk) + fl * 2.2 + jl.b * 0.9;
        mixc(tc, gold ? GOLD : STEEL, lc, lk); if (fl > 0) mixc(tc, tc, [1, 1, 1], fl * 0.6);
        push(big, x + shx, y + shy, a * fadeOpen(t, S), (9 * cs / BR) * (1 + 0.18 * lk + fl * 0.25), tc);
        continue;
      }
      const [g0x, g0y] = camXY(GX[i], GY[i], cs);
      if (t < ta) {
        // flight: lift out of the grid, swing to its side, pour down through a funnel into its slot
        const sd = gold ? -1 : 1, px = gold ? PILE.gx : PILE.sx;
        const P1x = g0x + sd * (30 + PX.rand(i, 62) * 70), P1y = g0y - 170 - PX.rand(i, 63) * 150;
        const P2x = px + (L.slot[0] - px) * 0.15 + sd * 20, P2y = 560 + PX.rand(i, 69) * 50;
        const bz = (u) => { const m = 1 - u; return [m * m * m * g0x + 3 * m * m * u * P1x + 3 * m * u * u * P2x + u * u * u * L.slot[0], m * m * m * g0y + 3 * m * m * u * P1y + 3 * m * u * u * P2y + u * u * u * L.slot[1]]; };
        const uu = (tt) => ease.inOut(clamp((tt - td) / S.stTrav));
        const u = uu(t), [x, y] = bz(u);
        push(pile, x + shx, y + shy, gold ? 2.4 : 1.9, lerp(9 * CAM / BR, 1, u) * 1.05, mixc(tc, lc, [1, 1, 1], 0.35));
        // a comet tail along the path it has flown
        let px0 = x, py0 = y;
        for (let m = 1; m <= 36; m++) {
          const tt = t - m * 0.016; if (tt < td) break;
          const [qx, qy] = bz(uu(tt)), fade = Math.pow(1 - m / 37, 1.6);
          for (let h = 0; h < 2; h++) { const f = h * 0.5; push(trails, lerp(qx, px0, f) + shx + (PX.rand(i * 97 + m * 2 + h, 64) - 0.5) * 2.4, lerp(qy, py0, f) + shy + (PX.rand(i * 97 + m * 2 + h, 65) - 0.5) * 2.4, 0.75 * fade, 1, lc); }
          px0 = qx; py0 = qy;
        }
        continue;
      }
      // in the pile
      let [x, y] = L.slot, a = (gold ? 2.0 : 1.6) + 2.0 * Math.exp(-(t - ta) * 7), r = 1, col = lc;
      const arrived = 1;
      // row pulse at "= 5 : 9": rows light one after another
      const row = Math.floor(L.s / 10), rp = t - (S.eq1 + 0.1 + row * 0.09);
      if (rp > 0 && rp < 1) a += 1.4 * Math.exp(-rp * 6);
      // b12 stamp: the piles jolt
      const j2 = jolt(t, S.imp2, CARD_XY[1].x, CARD_XY[1].y, x, y, 1300, 16); x += j2.x; y += j2.y; a += j2.b * 0.8;
      // b12 filter
      let gone = false;
      const tp2 = S.sv2 + L.d2 / v2;
      if (!L.surv) {
        const dk = ease.out(prog(t, tp2, tp2 + 0.35)), fl = t > tp2 ? Math.exp(-(t - tp2) * 9) : 0;
        if (t > tp2) gone = true;
        a = lerp(a, 0.2, dk) + fl * 1.2; col = mixc(tc, lc, DUST, dk); r = lerp(1, 0.6, dk);
        const tf = S.rp + PX.rand(i, 66) * 0.5, u = Math.max(0, t - tf);
        if (u > 0) { const fy = gravY(u, 2200), ty = L.sed[1]; const k = clamp(fy / Math.max(1, ty - y)); x = lerp(x, L.sed[0], ease.inOut(k)); y = Math.min(ty, y + fy); r = lerp(r, 0.34, k); a = lerp(a, 0.14, k); }
        push(y > PILE.base + 40 ? dust : pile, x + shx, y + shy, a * dimAll, r, col);
      } else {
        const fl = t > tp2 ? Math.exp(-(t - tp2) * 6) : 0; a += fl * 1.6;
        const mk2 = ease.inOut(prog(t, S.rp + 0.35 + PX.rand(i, 67) * 0.3, S.rp + 1.25 + PX.rand(i, 67) * 0.3));
        x = lerp(x, L.slot2[0], mk2); y = lerp(y, L.slot2[1], mk2) - Math.sin(mk2 * Math.PI) * 26;
        // b13: the third card's scan passes — every bead flickers, and stays
        const tp3 = S.sv3 + L.d3 / v3; if (t > tp3) a += 1.3 * Math.exp(-(t - tp3) * 7);
        // b13 "nothing": the beads hold perfectly still
        a *= 1 - chainPull;
        if (a > 0.003) push(pile, x + shx, y + shy, a * (0.6 + 0.4 * dimAll), r, col);
      }
      if (!gone || t < tp2) { if (gold) nG++; else nS++; }
    }
    KIT.beads(dust.X, dust.Y, dust.n, { C: dust.C, A: dust.A, R: dust.R, r: BR, k: 14, a: 1.0, glow: 0.15 });
    KIT.beads(big.X, big.Y, big.n, { C: big.C, A: big.A, R: big.R, r: BR, k: 40, a: 1.0, glow: 0.3 });
    KIT.beads(pile.X, pile.Y, pile.n, { C: pile.C, A: pile.A, R: pile.R, r: BR, k: 64, a: 1.0, glow: 0.4 });
    PX.points(trails.X, trails.Y, trails.n, null, { a: 1, A: trails.A, C: trails.C, glow: 0.6 });

    // ---------------------------------------------------------------- waves, rings, dust puffs
    impactFX(t, S.imp1, CARD_XY[0], cardImg(L1.card || ''), 1500, R1MAX + 200, 1, shx, shy);
    impactFX(t, S.imp2, CARD_XY[1], cardImg(L2.card || ''), 1300, 700, 0.75, shx, shy);
    impactFX(t, S.imp3, CARD_XY[2], cardImg(L3.card || ''), 900, 260, 0.18, shx, shy);
    scanRing(t, S.sv1, v1, CARD_XY[0], R1MAX, 0.5, shx, shy);
    scanRing(t, S.sv2, v2, CARD_XY[1], 330, 0.45, shx, shy);
    scanRing(t, S.sv3, v3, CARD_XY[2], 330, 0.3, shx, shy);

    // ---------------------------------------------------------------- the rope
    const ropeA = ease.inOut(prog(t, S.rope0, S.rope0 + 1.3)) * lerp(1, 0.5, chainK);
    const pp = probAt(t, S);
    if (ropeA > 0.003) rope(t, S, ropeA, pp, shx, shy);

    // ---------------------------------------------------------------- the ghost of the gut (b12)
    const ghA = ease.out(prog(t, S.gh, S.gh + 0.6)) * (1 - ease.inOut(prog(t, S.out2, S.out2 + 0.7)));
    if (ghA > 0.003) ghostBeads(t, S, ghA, shx, shy);

    // ---------------------------------------------------------------- big multipliers: ×5 (b11), ×⅔ (b12)
    bigTimes(t, L1.times || '×5', S.x5, S.out1, S.out1 + 0.7, GOLD, shx, shy);
    bigTimes(t, L2.times || '×⅔', S.x23, S.gh - 0.4, S.gh + 0.3, LSTEEL, shx, shy);

    // ---------------------------------------------------------------- the chain
    if (t > S.ch - 0.1) chainLine(t, S, L3.chain || '', shx, shy);

    PX.flush({ exposure: 1.45, glow: 1.0 });

    // ================================================================ canvas layer
    ctx.save(); ctx.translate(shx, shy);
    hud(t, S, pp, chainK);
    // lit labels with live counts (b11 light)
    const labA = ease.out(prog(t, S.lab, S.lab + 0.5)) * (1 - ease.in(prog(t, S.str + 0.3, S.str + 0.9)));
    if (labA > 0.003) {
      let g = 0, s = 0;
      for (const L of LIT) { const tp = S.sv1 + D1[L.i] / v1; if (t >= tp) { if (L.gold) g++; else s++; } }
      countLine((L1.lit || [])[0] || '', g, W / 2, 1596, CGOLD, labA);
      countLine((L1.lit || [])[1] || '', s, W / 2, 1668, CSTEEL, labA);
    }
    // pile counters
    const cntA = ease.out(prog(t, S.st0 + 0.6, S.st0 + 1.2)) * (1 - ease.inOut(prog(t, S.ch, S.ch + 0.8)));
    if (cntA > 0.003) {
      const pulse3 = t > S.sv3 ? Math.exp(-(t - S.sv3 - 0.5) * 3) * (t < S.sv3 + 0.5 ? (t - S.sv3) / 0.5 : 1) : 0;
      counter(nG, PILE.gx, CNT_Y, CGOLD, cntA, pulse3);
      counter(nS, PILE.sx, CNT_Y, CSTEEL, cntA, pulse3);
    }
    // ratio lines
    ratioLine(t, L1.ratio || '', S.r1, S.eq1, S.out1, 1);
    ratioLine(t, L2.ratio || '', S.r2, S.eq2, S.out2, 1);
    // note (b11)
    if (t > S.note - 0.1 && t < S.out1 + 1) {
      const out = ease.in(prog(t, S.out1, S.out1 + 0.6)), str = L1.note || '', cut = str.indexOf('，');
      const rows = cut > 0 ? [str.slice(0, cut + 1), str.slice(cut + 1)] : [str];
      rows.forEach((r, k) => L.serif(r, W / 2, 1546 + k * 82, { size: 58, weight: 600, color: CINK, glow: 6, alpha: 1 - out, reveal: prog(t, S.note + 0.15 + k * 0.9, S.note + 1.15 + k * 0.9), highlight: ['三成多'], hiColor: CGOLD }));
    }
    // ghost label + footnote (b12)
    if (ghA > 0.003) ghostLines(t, S, ghA, L2.ghost || '');
    const ftA = ease.out(prog(t, S.foot, S.foot + 0.8)) * (1 - ease.inOut(prog(t, S.out2, S.out2 + 0.6)));
    if (ftA > 0.003) L.serif(L2.note || '', W / 2, 1506, { size: 36, weight: 400, color: 'rgba(239,233,220,0.62)', glow: 0, alpha: ftA, reveal: prog(t, S.foot, S.foot + 1.0), spacing: 4 });
    // ×1 (b13): small, plain, a little comic
    timesOne(t, S, L3.times || '×1');
    // the text (b13)
    if (t > S.txt - 0.1 && t < S.ch + 1) {
      const out = ease.in(prog(t, S.ch - 0.1, S.ch + 0.5)), str = L3.text || '', cut = str.indexOf('，');
      const rows = cut > 0 ? [str.slice(0, cut + 1), str.slice(cut + 1)] : [str];
      rows.forEach((r, k) => L.serif(r, W / 2, 1460 + k * 84, { size: 60, weight: 600, color: CINK, glow: 6, alpha: 1 - out, reveal: prog(t, S.txt + 0.1 + k * 1.0, S.txt + 1.2 + k * 1.0), highlight: k ? ['等于没乘'] : [], hiColor: CGOLD }));
    }
    // cards
    { const m = cardMotion(t, S.hov1, S.imp1), lk = prog(t, S.lift1, S.lift1 + 0.55);
      if (t > S.hov1 && lk < 1) drawCard(L1.card || '', CARD_XY[0].x, CARD_XY[0].y - lk * 40, m.s * (1 + 0.08 * ease.out(lk)), m.rot, m.a * (1 - ease.in(lk)), m.lift + lk * 0.4, m.sq); }
    { const m = cardMotion(t, S.hov2, S.imp2), lk = prog(t, S.lift2, S.lift2 + 0.55);
      if (t > S.hov2 && lk < 1) drawCard(L2.card || '', CARD_XY[1].x, CARD_XY[1].y - lk * 40, m.s * (1 + 0.08 * ease.out(lk)), m.rot, m.a * (1 - ease.in(lk)), m.lift + lk * 0.4, m.sq); }
    { const m = cardMotion(t, S.hov3, S.imp3, { hi: 1.4, fall: 0.38, soft: 1 }), sk = prog(t, S.slide3, S.slide3 + 1.1), e = ease.in(sk);
      if (t > S.hov3 && sk < 1) drawCard(L3.card || '', CARD_XY[2].x + e * 760, CARD_XY[2].y - e * 30, m.s, m.rot + e * 0.12, m.a * (1 - ease.in(prog(sk, 0.5, 1))), m.lift + e * 0.25, m.sq); }
    ctx.restore();
    // impact flashes
    for (const [t0, a] of [[S.imp1, 0.22], [S.imp2, 0.16]]) { const u = t - t0; if (u >= 0 && u < 0.3) { ctx.save(); ctx.globalAlpha *= a * Math.exp(-u * 16); ctx.fillStyle = '#fff6e6'; ctx.fillRect(0, 0, W, H); ctx.restore(); } }
  }
  const fadeOpen = (t, S) => 1;

  // ---------------------------------------------------------------- impact: shockwave ring + dust puff off the card's edges
  function impactFX(t, t0, at, im, v, rmax, k, shx, shy) {
    const u = t - t0; if (u < 0 || u > 2.2) return;
    const R = 40 + v * u; if (R > rmax + 120) return;
    const n = 2600, b = pbuf('ring', n), a = 0.9 * k * Math.exp(-u * 2.0) * (1 - clamp((R - rmax) / 120));
    const th = 3 + u * 26;
    for (let q = 0; q < n; q++) {
      const an = (q / n) * TAU + PX.rand(q, 71) * 0.004, rr = R + (PX.rand(q, 72) - 0.5) * th - PX.rand(q, 73) * PX.rand(q, 74) * th * 3;
      b.X[q] = at.x + Math.cos(an) * rr * 1.0 + shx; b.Y[q] = at.y + Math.sin(an) * rr * 0.92 + shy; b.A[q] = 0.5 + PX.rand(q, 75);
    }
    PX.points(b.X, b.Y, n, [1, 0.94, 0.82], { a, A: b.A, glow: 0.7 });
    // puff
    const m = 1400, p = pbuf('puff', m), hw = im.w / 2, hh = im.h / 2;
    for (let q = 0; q < m; q++) {
      const e = PX.rand(q, 81) * 2 * (im.w + im.h); let x, y, nx, ny;
      if (e < im.w) { x = -hw + e; y = -hh; nx = 0; ny = -1; } else if (e < 2 * im.w) { x = -hw + e - im.w; y = hh; nx = 0; ny = 1; }
      else if (e < 2 * im.w + im.h) { x = -hw; y = -hh + e - 2 * im.w; nx = -1; ny = 0; } else { x = hw; y = -hh + e - 2 * im.w - im.h; nx = 1; ny = 0; }
      const sp = (120 + PX.rand(q, 82) * 520) * (0.4 + k * 0.6), sx = nx + (PX.rand(q, 83) - 0.5) * 1.2, sy = ny + (PX.rand(q, 84) - 0.5) * 1.2;
      const d = (1 - Math.exp(-u * 4)) / 4;
      p.X[q] = at.x + x + sx * sp * d + shx; p.Y[q] = at.y + y + sy * sp * d + 40 * u * u + shy; p.A[q] = Math.exp(-u * (2.2 + PX.rand(q, 85) * 2));
    }
    PX.points(p.X, p.Y, m, [1, 0.9, 0.75], { a: 0.5 * k, A: p.A, glow: 0.4 });
  }
  function scanRing(t, t0, v, at, rmax, a0, shx, shy) {
    const u = t - t0; if (u < 0) return; const R = v * u; if (R > rmax + 60) return;
    const n = Math.min(3000, Math.max(300, R * 4) | 0), b = pbuf('scan', n);
    const a = a0 * (1 - clamp((R - rmax) / 60)) * clamp(R / 60);
    for (let q = 0; q < n; q++) { const an = (q / n) * TAU, rr = R - PX.rand(q, 91) * PX.rand(q, 92) * 28; b.X[q] = at.x + Math.cos(an) * rr + shx; b.Y[q] = at.y + Math.sin(an) * rr + shy; b.A[q] = 1 - (R - rr) / 28; }
    PX.points(b.X, b.Y, n, [0.85, 0.92, 1], { a, A: b.A, glow: 0.5 });
  }

  // ---------------------------------------------------------------- probability, odds, the rope
  function probAt(t, S) {
    const k1 = ease.inOut(prog(t, S.roll1, S.roll1 + S.rollD)), k2 = ease.inOut(prog(t, S.roll2, S.roll2 + S.rollD));
    const o = t < S.roll2 ? lerp(1 / 9, 5 / 9, k1) : lerp(5 / 9, 10 / 27, k2);
    const odo = t < S.roll2 ? lerp(10, 36, k1) : lerp(36, 27, k2);
    return { p: o / (1 + o), odo, k1, k2 };
  }
  function rope(t, S, A, pp, shx, shy) {
    const kx = ROPE.gIn + (1 - pp.p) * (ROPE.sIn - ROPE.gIn);
    // tension wave while the knot travels
    const vib = (x) => {
      let v = 0;
      for (const r0 of [S.roll1, S.roll2]) { const u = t - r0; if (u > 0 && u < 3.5) v += 5 * Math.exp(-u * 1.6) * Math.sin(x * 0.035 - u * 18) * Math.sin(Math.min(1, u * 3) * Math.PI / 2); }
      return v;
    };
    const ry = x => ROPE.y + vib(x) + 3 * Math.sin((x - ROPE.x0) / (ROPE.x1 - ROPE.x0) * Math.PI);
    // rope: two twisted strands of gold-white light
    const n = 4200, b = pbuf('rope', n), span = ROPE.x1 - ROPE.x0;
    for (let q = 0; q < n; q++) {
      const strand = q & 1, x = ROPE.x0 + (q >> 1) / (n >> 1) * span + (PX.rand(q, 101) - 0.5) * 1.2;
      const tw = Math.sin(x / 6.5 + strand * Math.PI + t * 0.6) * 2.6;
      b.X[q] = x + shx; b.Y[q] = ry(x) + tw + (PX.rand(q, 102) - 0.5) * 1.4 + shy;
      const edge = Math.min(1, (x - ROPE.x0) / 40, (ROPE.x1 - x) / 40);
      b.A[q] = (0.55 + 0.45 * Math.cos(x / 6.5 + strand * Math.PI + t * 0.6)) * edge;
    }
    PX.points(b.X, b.Y, n, ROPEC, { a: 0.42 * A, A: b.A, glow: 0.35 });
    // centre mark (the even line, 50 %)
    { const m = 160, c = pbuf('mark', m); for (let q = 0; q < m; q++) { c.X[q] = W / 2 + (PX.rand(q, 111) - 0.5) * 2 + shx; c.Y[q] = ROPE.y + 16 + (q / m) * 22 + shy; c.A[q] = 1; } PX.points(c.X, c.Y, m, [0.8, 0.8, 0.85], { a: 0.35 * A, A: c.A, glow: 0.2 }); }
    // knot: a bright bead with a short ribbon
    { const m = 520, c = pbuf('knot', m), ky = ry(kx), sw = Math.sin(t * 2.2) * 2;
      for (let q = 0; q < m; q++) {
        if (q < 360) { const rr = 11 * Math.sqrt(PX.rand(q, 121)), an = PX.rand(q, 122) * TAU; c.X[q] = kx + Math.cos(an) * rr + shx; c.Y[q] = ky + Math.sin(an) * rr + shy; c.A[q] = 1.3 - rr / 14; }
        else { const v = (q - 360) / 160; c.X[q] = kx + (PX.rand(q, 123) - 0.5) * 5 + sw * v + shx; c.Y[q] = ky + 12 + v * 34 + shy; c.A[q] = 0.9 * (1 - v * 0.6); }
      }
      PX.points(c.X, c.Y, m, KNOT, { a: 0.55 * A, A: c.A, glow: 0.45 }); }
    // teams of 人 (particle clouds), leaning back against the pull
    const fig = FIG(), fb = ROPE.y + ROPE.fig * 0.43;                       // figure baseline (rope at hand height)
    const bob = (j, side) => Math.sin(t * Math.PI * 2 / (B * 2) + j * 0.9 + side) * 1.6;
    // a figure that is losing its particles lets them fall; one that is being born gathers them from the ×5
    const drawFig = (fx, j, side, presence, col, born, aMul) => {
      const nn = fig.n, f = pbuf('fig' + side + j, nn), lean = 0.13, back = j % 2, sc = back ? 0.84 : 1, yo = back ? -12 : 0;
      const shown = presence * nn;
      let k = 0;
      for (let q = 0; q < nn; q++) {
        let x = fig.X[q] * sc, y = fig.Y[q] * sc;
        x += -side * lean * (-y);                                           // lean back (top goes outward)
        let X = fx + x, Y = fb + y + yo + bob(j, side), a = back ? 0.55 : 1;
        if (q >= shown) {
          // leaving: only meaningful after ×⅔
          const tl = (S.x23 + 0.25) + PX.rand(q, 131) * 0.5, u = t - tl;
          if (u <= 0 || presence >= 1) continue;
          if (born < 1) continue;
          X += (PX.rand(q, 132) - 0.5) * 60 * u; Y += gravY(u, 500) * 0.6 + 20 * u; a *= Math.max(0, 1 - u * 1.1);
          if (a <= 0) continue;
        } else if (born < 1) {
          // gathering: particles fly up from the ×5 into this figure
          const d = PX.rand(q, 133) * 0.4, kk = ease.inOut(clamp((born - d) / 0.6));
          const sx = W / 2 + (PX.rand(q, 134) - 0.5) * 300, sy = BIG_Y - 80 + (PX.rand(q, 135) - 0.5) * 120;
          X = lerp(sx, X, kk) + Math.sin(kk * Math.PI) * (PX.rand(q, 136) - 0.5) * 120; Y = lerp(sy, Y, kk); a *= kk > 0 ? 0.4 + 0.6 * kk : 0;
          if (a <= 0) continue;
        }
        f.X[k] = X + shx; f.Y[k] = Y + shy; f.A[k] = a; k++;
      }
      PX.points(f.X, f.Y, k, col, { a: 0.5 * A * aMul, A: f.A, glow: 0.35 });
    };
    for (let j = 0; j < 5; j++) {
      const born = j === 0 ? 1 : ease.inOut(prog(t, S.x5 + 0.15 + 0.12 * j, S.x5 + 0.95 + 0.12 * j));
      if (born <= 0) continue;
      const keep = j <= 2 ? 1 : j === 3 ? 1 / 3 : 0, lose = ease.inOut(prog(t, S.x23 + 0.25, S.x23 + 0.6));
      const presence = born < 1 ? 1 : lerp(1, keep, lose);
      drawFig(ROPE.gIn - 14 - j * 25, j, -1, presence, GOLD, born, 1);
    }
    for (let j = 0; j < 9; j++) drawFig(ROPE.sIn + 14 + j * 25, j, 1, 1, LSTEEL, 1, 0.9);
  }

  // ---------------------------------------------------------------- HUD: the odds and the odometer (top, then at the rope)
  function hud(t, S, pp, chainK) {
    const a = ease.out(prog(t, S.open + 0.2, S.open + 0.9)) * lerp(1, 0.55, chainK);
    if (a <= 0.003) return;
    const pk = ease.inOut(prog(t, S.pull0, S.pull1)), mk_ = ease.inOut(prog(t, S.hud0, S.hud1));
    const hy = lerp(266, 354, pk);
    const ox = lerp(410, W / 2, mk_), oy = lerp(hy, ODDS_Y, mk_), os = lerp(56, 46, mk_);
    const dx = lerp(690, W / 2, mk_), dy = lerp(hy, ODO_Y, mk_), ds = lerp(56, 136, mk_);
    // odds: 1 : 9 → 5 : 9 → 10 : 27 (swap half-way through each roll)
    const sets = [['1', '9'], ['5', '9'], ['10', '27']];
    const sw1 = S.roll1 + S.rollD * 0.45, sw2 = S.roll2 + S.rollD * 0.45;
    const draw = (pair, al, k) => rich([{ s: pair[0], c: CGOLD }, { s: ':', c: CDIM }, { s: pair[1], c: CSTEEL }], ox, oy, { size: os, weight: 600, alpha: a * al, k, gap: os * 0.3 });
    const f1 = clamp((t - sw1) / 0.35), f2 = clamp((t - sw2) / 0.35);
    if (f1 < 1) draw(sets[0], 1 - f1, 1); else if (f2 < 1) { draw(sets[1], 1 - f2, f1 < 1 ? f1 : 1); } else draw(sets[2], 1, f2);
    if (f1 > 0 && f1 < 1) draw(sets[1], f1, f1);
    if (f2 > 0 && f2 < 1) draw(sets[2], f2, f2);
    // the odometer
    const roll = (pp.k1 > 0 && pp.k1 < 1) || (pp.k2 > 0 && pp.k2 < 1);
    const col = roll ? '#fff4dc' : '#f3e7cc';
    KIT.odo(pp.odo, dx, dy, { size: ds, color: col, alpha: a, weight: 700 });
  }

  // "成功项目里有 50 个" with the number counting live (number slot right-aligned to its final width: no jitter)
  function countLine(str, n, x, y, col, a) {
    const m = str.match(/^(\D*)(\d+)(\D*)$/); if (!m) { rich([{ s: str }], x, y, { size: 44, alpha: a }); return; }
    const ctx = K.ctx, size = 44, fo = { size, family: F.serif, weight: 600 }, fn = { size: size * 1.08, family: F.mono, weight: 700 };
    const w0 = measure(m[1], fo), wn = measure(m[2], fn), w1 = measure(m[3], fo), tw = w0 + wn + w1 + 20;
    let cx = x - tw / 2;
    K.text(m[1], cx, y, { ...fo, color: CINK, alpha: a }); cx += w0 + 10;
    K.text(String(n), cx + wn, y, { ...fn, color: col, alpha: a, align: 'right' }); cx += wn + 10;
    K.text(m[3], cx, y, { ...fo, color: CINK, alpha: a });
  }
  function counter(n, x, y, col, a, pulse) {
    K.text(String(n), x, y, { size: 84, family: F.mono, weight: 700, color: col, alpha: a, align: 'center' });
    if (pulse > 0.01) K.text(String(n), x, y, { size: 84, family: F.mono, weight: 700, color: '#ffffff', alpha: a * pulse * 0.6, align: 'center' });
  }
  function ratioLine(t, str, t0, teq, tout, a0) {
    if (!str || t < t0 - 0.05 || t > tout + 0.8) return;
    const toks = ratioTokens(str), eqi = toks.findIndex(x => x.s === '=');
    const out = ease.in(prog(t, tout, tout + 0.6));
    toks.forEach((x, i) => { x.k = i < eqi ? prog(t, t0 + i * 0.07, t0 + 0.55 + i * 0.07) : prog(t, teq + (i - eqi) * 0.07, teq + 0.55 + (i - eqi) * 0.07); });
    rich(toks, W / 2, RATIO_Y - out * 20, { size: 74, weight: 600, alpha: a0 * (1 - out), gap: 22 });
  }

  // ---------------------------------------------------------------- ×5 / ×⅔: a punch of particles
  function bigTimes(t, str, t0, tout0, tout1, col, shx, shy) {
    if (t < t0 || t > tout1) return;
    const c = cloud(str, 190, { weight: 900, step: 2.0 }), u = t - t0;
    const k = ease.outExpo(clamp(u / 0.45)), out = ease.inOut(prog(t, tout0, tout1));
    const s = lerp(1.7, 1, k) * (1 - 0.25 * out), fl = Math.exp(-u * 5);
    const n = c.n, b = pbuf('big' + str, n), cx = W / 2, cy = BIG_Y - 70;
    for (let q = 0; q < n; q++) {
      const ox = c.X[q], oy = c.Y[q] + 70;
      const sc = (1 - k) * (PX.rand(q, 141) - 0.5) * 80;
      b.X[q] = cx + ox * s + sc + Math.sin(t * 3 + q) * 0.6 + shx; b.Y[q] = cy + oy * s + sc * 0.6 - out * 50 + shy; b.A[q] = 1;
    }
    PX.points(b.X, b.Y, n, mixc(tc2, col, [1, 1, 1], fl * 0.7), { a: (0.8 + 1.2 * fl) * clamp(u * 6) * (1 - out), A: b.A, glow: 0.6 });
  }
  function timesOne(t, S, str) {
    if (t < S.x1 - 0.05 || t > S.txt + 0.6) return;
    const u = t - S.x1, out = ease.in(prog(t, S.txt - 0.2, S.txt + 0.4));
    const s = 1 + Math.exp(-u * 4.5) * Math.sin(u * 22) * 0.35 * clamp(u * 8), a = clamp(u * 6) * (1 - out);
    const ctx = K.ctx; ctx.save(); ctx.translate(W / 2, BIG_Y - 20); ctx.rotate(Math.exp(-u * 3) * Math.sin(u * 13) * 0.12); ctx.scale(s, 1 / Math.max(0.8, s));
    rich([{ s: str, c: 'rgba(239,233,220,0.85)' }], 0, 0, { size: 76, weight: 600, alpha: a });
    ctx.restore();
  }

  // ---------------------------------------------------------------- the ghost: the gold the gut imagines (50–60 %)
  function ghostBeads(t, S, A, shx, shy) {
    const b = pbuf('ghost', 70 * 22);
    for (let s = NGU; s < 81; s++) {
      const [x, y] = slotXY(1, s), ap = ease.out(prog(t, S.gh + (s - NGU) * 0.016, S.gh + 0.4 + (s - NGU) * 0.016));
      if (ap <= 0) continue;
      const fl = 0.55 + 0.45 * Math.sin(t * (5 + PX.rand(s, 151) * 4) + s * 2.1), lvl = s < NSU ? 1 : 0.6;
      for (let q = 0; q < 22; q++) { const an = q / 22 * TAU + t * 0.4; b.X[b.n] = x + Math.cos(an) * 9.5 + shx; b.Y[b.n] = y + Math.sin(an) * 9.5 + shy; b.A[b.n] = ap * fl * lvl; b.n++; }
    }
    PX.points(b.X, b.Y, b.n, EMBER, { a: 0.42 * A, A: b.A, glow: 0.6 });
  }
  function ghostLines(t, S, A, label) {
    const ctx = K.ctx, y50 = levelY(NSU / 10), y60 = levelY(NSU * 1.5 / 10);
    const k = ease.inOut(prog(t, S.gh + 0.3, S.gh + 1.3));
    ctx.save(); ctx.globalAlpha *= A; ctx.strokeStyle = C.ember; ctx.lineWidth = 2.5; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 18;
    const x0 = PILE.gx - 5 * PILE.p - 6, x1g = PILE.gx + 5 * PILE.p + 6, x1 = PILE.sx + 5 * PILE.p + 6;
    ctx.beginPath(); ctx.moveTo(x0, y60); ctx.lineTo(lerp(x0, x1g, k), y60); ctx.stroke();
    ctx.globalAlpha *= 0.75; ctx.beginPath(); ctx.moveTo(x0, y50); ctx.lineTo(lerp(x0, x1, k), y50); ctx.stroke();
    ctx.restore();
    const la = A * ease.out(prog(t, S.gh + 0.7, S.gh + 1.3));
    K.text('60%', x1g + 14, y60 + 9, { size: 26, family: F.mono, color: C.ember, alpha: la * 0.85 });
    K.text('50%', x1 + 14, y50 + 9, { size: 26, family: F.mono, color: C.ember, alpha: la * 0.6 });
    L.serif(label, PILE.gx, y60 - 34, { size: 44, weight: 600, color: C.ember, glow: 10, alpha: A, reveal: prog(t, S.gh + 0.6, S.gh + 1.4), spacing: 6 });
  }

  // ---------------------------------------------------------------- the chain: "1:9  ×5  ×⅔  =  10:27"
  function chainLine(t, S, str, shx, shy) {
    const terms = str.split(/\s{2,}/).filter(Boolean), size = 92, gap = 46, y = 1110;
    const ws = terms.map(s => measureT(s, size, F.serif, 600)), tw = ws.reduce((a, b) => a + b, 0) + gap * (terms.length - 1);
    let x = W / 2 - tw / 2;
    const out = 1;
    terms.forEach((s, ti) => {
      const c = cloud(s, size, { weight: 600, step: 1.7 }), cx = x + ws[ti] / 2; x += ws[ti] + gap;
      const t0 = S.terms[Math.min(ti, S.terms.length - 1)], last = ti === terms.length - 1, dur = last ? 1.3 : 0.75;
      const k = prog(t, t0, t0 + dur); if (k <= 0) return;
      const col = s.includes('⅔') ? LSTEEL : s.includes('×') ? GOLD : last ? [1, 0.88, 0.62] : s === '=' ? [0.75, 0.75, 0.78] : [0.95, 0.92, 0.86];
      const n = c.n, b = pbuf('ch' + ti, n);
      const surv = LIT.filter(L => L.surv);
      for (let q = 0; q < n; q++) {
        const d = PX.rand(q, 161) * 0.45, kk = ease.inOut(clamp((k - d) / 0.55));
        let sx, sy;
        if (last) { const L = surv[q % surv.length], an = PX.rand(q, 162) * TAU, rr = 9 * Math.sqrt(PX.rand(q, 163)); sx = L.slot2[0] + Math.cos(an) * rr; sy = L.slot2[1] + Math.sin(an) * rr; }
        else if (ti === 0) { sx = W / 2 + (PX.rand(q, 164) - 0.5) * 160; sy = ODDS_Y - 14 + (PX.rand(q, 165) - 0.5) * 40; }
        else { const an = PX.rand(q, 166) * TAU, rr = 60 + PX.rand(q, 167) * 220; sx = cx + Math.cos(an) * rr; sy = y - 40 + Math.sin(an) * rr * 0.6; }
        const sw = Math.sin(kk * Math.PI) * (PX.rand(q, 168) - 0.5) * 70;
        b.X[q] = lerp(sx, cx + c.X[q], kk) + sw + shx; b.Y[q] = lerp(sy, y + c.Y[q], kk) + shy; b.A[q] = kk > 0 ? 0.35 + 0.65 * kk : (last ? 0 : 0);
      }
      const fl = Math.exp(-Math.max(0, t - t0 - dur * 0.8) * 3) * (k >= 0.8 ? 1 : 0);
      // the light sweep along the whole line once it is complete
      const swp = (t - (S.terms[4] + 1.5)) / 1.0, sx0 = W / 2 - tw / 2 + swp * (tw + 200) - 100;
      const sweep = swp > 0 && swp < 1 ? Math.exp(-Math.pow((cx - sx0) / 120, 2)) : 0;
      PX.points(b.X, b.Y, n, mixc(tc2, col, [1, 1, 1], Math.min(1, fl * 0.5 + sweep * 0.6)), { a: (0.5 + fl * 0.4 + sweep * 0.5) * out, A: b.A, glow: 0.55 });
    });
  }

  // ================================================================ cues
  function cueList(S) {
    const c = [];
    // b11
    c.push({ t: S.hov1, type: 'riser', dur: +(S.imp1 - S.hov1).toFixed(2) });
    c.push({ t: S.imp1, type: 'stamp' });
    c.push({ t: S.sv1, type: 'sweep', dur: S.sv1d });
    { const tg = LIT.filter(L => L.gold).map(L => S.sv1 + D1[L.i] / (R1MAX / S.sv1d)).sort((a, b) => a - b), ts = LIT.filter(L => !L.gold).map(L => S.sv1 + D1[L.i] / (R1MAX / S.sv1d)).sort((a, b) => a - b);
      c.push({ t: tg[0], type: 'ticks', dur: +(tg[tg.length - 1] - tg[0]).toFixed(2), n: tg.length, p0: 0.6, p1: 1, group: 'gold' });
      c.push({ t: ts[0], type: 'ticks', dur: +(ts[ts.length - 1] - ts[0]).toFixed(2), n: ts.length, p0: 0.15, p1: 0.45, group: 'steel' }); }
    c.push({ t: S.st0, type: 'stream', dur: +(S.stSpan + S.stTrav).toFixed(2) });
    c.push({ t: S.st0 + S.stTrav, type: 'ticks', dur: S.stSpan, n: NG + NS, p0: 0.3, p1: 0.8, group: 'piles' });
    c.push({ t: S.r1, type: 'chip' }); c.push({ t: S.eq1, type: 'chip' });
    c.push({ t: S.x5, type: 'punch' });
    c.push({ t: S.roll1, type: 'roll', from: 10, to: 36, dur: S.rollD });
    // b12
    c.push({ t: S.hov2, type: 'riser', dur: +(S.imp2 - S.hov2).toFixed(2) });
    c.push({ t: S.imp2, type: 'stamp' });
    c.push({ t: S.sv2, type: 'sweep', dur: S.sv2d });
    c.push({ t: S.sv2 + 0.1, type: 'ticks', dur: S.sv2d - 0.2, n: (NG - NGU) + (NS - NSU), p0: 0.7, p1: 0.2, group: 'drop' });
    c.push({ t: S.rp, type: 'gather', dur: 1.6 });
    c.push({ t: S.r2, type: 'chip' }); c.push({ t: S.eq2, type: 'chip' });
    c.push({ t: S.x23, type: 'punch' });
    c.push({ t: S.roll2, type: 'roll', from: 36, to: 27, dur: S.rollD });
    c.push({ t: S.gh, type: 'heartbeat' }); c.push({ t: S.gh + B, type: 'heartbeat' });
    c.push({ t: S.foot, type: 'click' });
    // b13
    c.push({ t: S.imp3 - 0.38, type: 'whoosh', dur: 0.38 });
    c.push({ t: S.imp3, type: 'chip' });
    c.push({ t: S.sv3, type: 'ticks', dur: S.sv3d, n: NGU + NSU, p0: 0.5, p1: 0.5, group: 'same' });
    c.push({ t: S.x1, type: 'thud' });
    c.push({ t: S.slide3, type: 'whoosh', dur: 1.0 });
    S.terms.forEach((tt, i) => c.push({ t: tt, type: i === 4 ? 'gather' : 'chip', ...(i === 4 ? { dur: 1.3 } : {}) }));
    c.push({ t: S.terms[4] + 1.5, type: 'resolve' });
    return c;
  }

  const def = {
    draw(ctx, V, lt, api) { scene(api.beat.start + lt, api); },
    cues(V, api) {
      const S = sched(api), t0 = api.beat.start;
      return cueList(S).map(c => ({ ...c, t: +(c.t - t0).toFixed(3) })).filter(c => c.t >= 0 && c.t < api.dur);
    },
  };
  T.register('evidence1', def);
  T.register('evidence2', def);
  T.register('noise', def);
})();
