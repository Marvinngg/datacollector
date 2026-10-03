/* 尾声 (e6): the same material, made calm.
 * b19 recall — the gut number of the prologue ("60%", ember, 21k particles) flashes back hot and pulsing on the beat;
 *              then time slows: the shimmer decelerates to rest, the ember cools to warm white, the number granulates
 *              into 1000 beads (the 1000 projects) which settle like sediment into a calm field. The four steps are
 *              then written, one by one, by beads leaving the field: each line slower and calmer than the last.
 *              The field is used up exactly when the fourth line lands (1000 beads -> 4 lines).
 * b20 end    — the four lines condense into two: 「它对抗的不是无知」 forms softly; 「而是过早的确定」 snaps into a
 *              rigid lattice with an ember contour (premature certainty, the gut's colour). Then the lattice unlocks,
 *              everything gathers exactly as in the prologue into 「先别急」, all motion decays to zero, the glow
 *              breathes once, and the frame holds.
 * One material runs through both beats: M = 1000 beads x 48 particles. Every frame is closed-form in time. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const { C, beat } = KIT;
  const TAU = Math.PI * 2;
  const at = (api, n) => KIT.at(api, n);
  const NB = 1000, KB = 48, M = NB * KB;
  const WARM = [0.98, 0.93, 0.83];                         // the prologue title's warm white (b03 at rest)
  const EMB = PX.COL.ember;
  const smooth = k => k * k * (3 - 2 * k);
  /* PX blurs the glow only inside the bounding box of what was drawn and reads a few stale rows outside it (a faint
     box / streak at the top edge). Two invisible points in opposite corners make the box the whole frame. */
  const CX = new Float32Array([2, W - 3]), CY = new Float32Array([2, H - 3]);
  const fullFrame = () => PX.points(CX, CY, 2, [0, 0, 0], { a: 0.001, glow: 1 });

  // ---------------------------------------------------------------- the prologue's number (copied from e0.js)
  const DIG = {};
  function digitCloud(ch) {
    if (DIG[ch]) return DIG[ch];
    const s = PX.text(ch, { size: 440, family: F.serif, weight: 900, x: 0, y: 160, step: 2.2, seed: ch.charCodeAt(0) });
    return (DIG[ch] = s);
  }
  function numberLayout(v) {
    const str = String(Math.round(v)) + '%';
    const widths = [...str].map(c => c === '%' ? 300 : 245);
    const tw = widths.reduce((a, b) => a + b, 0);
    let x = W / 2 - tw / 2; const out = [];
    [...str].forEach((c, i) => { out.push({ ch: c, x: x + widths[i] / 2 }); x += widths[i]; });
    return out;
  }
  const NUM_Y = H / 2 - 60;

  // one bead's grain (same sunflower as KIT.beads: the first 48 of 64)
  const SLOT = (() => { const m = 64, X = new Float32Array(KB), Y = new Float32Array(KB), A = new Float32Array(KB), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < KB; i++) { const rr = Math.sqrt((i + 0.5) / m), an = i * ga; X[i] = Math.cos(an) * rr; Y[i] = Math.sin(an) * rr; A[i] = 1 - 0.55 * rr * rr; }
    return { X, Y, A }; })();

  // ---------------------------------------------------------------- the material (built once)
  /* For every material particle j (bead b = j / 48, grain slot q = j % 48):
       NX,NY,R1,R2  its source particle in the "60%" (+ that particle's shimmer randoms, as in e0's drawNumber)
       BX,BY        (per bead) centre of the bead inside the number (the number granulates in place)
       FX,FY        (per bead) its place in the calm field
       line         (per bead) which step line it writes; LX,LY its glyph point; LD its departure delay 0..1
       EX,EY        b20: its point in l1 (lines 1+2) or l2 (lines 3+4);  TX,TY: its point in 先别急 */
  let MAT = null;
  const LINE_Y = [620, 800, 980, 1160], LINE_SIZE = 56;
  const L1 = { y: 800, size: 66 }, L2 = { y: 965, size: 78 };
  const TITLE = { size: 300, family: null, weight: 600, x: W / 2, y: 980, step: 2.6, spacing: 30, seed: 5 };
  function sortIdx(n, key) { const idx = Array.from({ length: n }, (_, i) => i); const k = Float64Array.from(idx, key); idx.sort((a, b) => k[a] - k[b]); return idx; }

  function material() {
    if (MAT) return MAT;
    const m = {};
    // 1. sources: the frozen 60% (exact positions and shimmer randoms of e0's drawNumber)
    const sx = [], sy = [], r1 = [], r2 = [];
    for (const g of numberLayout(60)) { const s = digitCloud(g.ch); for (let i = 0; i < s.n; i++) { sx.push(g.x + s.X[i]); sy.push(NUM_Y + s.Y[i]); r1.push(PX.rand(i, 3)); r2.push(PX.rand(i, 4)); } }
    const S = sx.length; m.S = S;
    // 2. granulate: serpentine order in 10 px bands -> 1000 contiguous chunks of ~21 sources = 1000 compact beads
    const ymin = Math.min(...sy), band = 10;
    const ord = sortIdx(S, i => { const bd = Math.floor((sy[i] - ymin) / band); return bd * 1e5 + (bd % 2 ? 2000 - sx[i] : sx[i]); });
    m.NX = new Float32Array(M); m.NY = new Float32Array(M); m.R1 = new Float32Array(M); m.R2 = new Float32Array(M);
    m.BX = new Float32Array(NB); m.BY = new Float32Array(NB);
    for (let b = 0; b < NB; b++) {
      const a = Math.floor(b * S / NB), z = Math.floor((b + 1) * S / NB), len = z - a;
      let cx = 0, cy = 0; for (let k = a; k < z; k++) { cx += sx[ord[k]]; cy += sy[ord[k]]; }
      m.BX[b] = cx / len; m.BY[b] = cy / len;
      for (let q = 0; q < KB; q++) { const i = ord[a + (q % len)], j = b * KB + q; m.NX[j] = sx[i]; m.NY[j] = sy[i]; m.R1[j] = r1[i]; m.R2[j] = r2[i]; }
    }
    // 3. the calm field: a wide, shallow pool of beads (sunflower-even, soft-edged ellipse below the text);
    //    beads keep their left-right order, so they settle almost straight down
    const FCX = W / 2, FCY = 1530, FRX = 440, FRY = 160, ga = Math.PI * (3 - Math.sqrt(5));
    m.FX = new Float32Array(NB); m.FY = new Float32Array(NB); m.FE = new Float32Array(NB);
    const sxF = new Float32Array(NB), syF = new Float32Array(NB), seF = new Float32Array(NB);
    for (let i = 0; i < NB; i++) { const rr = Math.sqrt((i + 0.5) / NB), an = i * ga; sxF[i] = FCX + Math.cos(an) * rr * FRX + (PX.rand(i, 39) - 0.5) * 14; syF[i] = FCY + Math.sin(an) * rr * FRY + (PX.rand(i, 40) - 0.5) * 9; seF[i] = 0.4 + 0.6 * smooth(clamp((1 - rr) / 0.35)); }
    const slots = sortIdx(NB, i => sxF[i]), byX = sortIdx(NB, b => m.BX[b]), G = 20;
    for (let c = 0; c < NB / G; c++) {
      const bs = byX.slice(c * G, (c + 1) * G).sort((a, b) => m.BY[a] - m.BY[b]);
      const ss = slots.slice(c * G, (c + 1) * G).sort((a, b) => syF[a] - syF[b]);
      bs.forEach((b, r) => { const s = ss[r]; m.FX[b] = sxF[s]; m.FY[b] = syF[s]; m.FE[b] = seF[s]; });
    }
    MAT = m; return m;
  }
  // the lines need V (their strings): built once on first use
  let LINES = null;
  function lines(V) {
    if (LINES) return LINES;
    const m = material(), strs = V.lines.steps, nch = strs.map(s => [...s].length), tot = nch.reduce((a, b) => a + b, 0);
    // beads per line ~ characters (even density); which beads: a random quarter of the field each time (it thins evenly)
    const perm = sortIdx(NB, b => PX.rand(b, 51));
    const cnt = []; let acc = 0; nch.forEach((c, i) => { const z = i === nch.length - 1 ? NB : Math.round((acc + c) / tot * NB); cnt.push(z - Math.round(acc / tot * NB)); acc += c; });
    m.line = new Int8Array(NB); m.LX = new Float32Array(M); m.LY = new Float32Array(M); m.LD = new Float32Array(NB);
    let p = 0;
    const L = strs.map((str, li) => {
      const beads = perm.slice(p, p + cnt[li]); p += cnt[li];
      beads.sort((a, b) => m.FX[a] - m.FX[b]);                                  // left of the field -> left of the line
      const cloud = PX.fit(PX.text(str, { size: LINE_SIZE, family: F.serif, weight: 600, x: W / 2, y: LINE_Y[li], step: 1.15, spacing: 3, seed: 21 + li }), beads.length * KB);
      const gi = sortIdx(cloud.n, i => cloud.X[i] * 1000 + cloud.Y[i]);
      const x0 = Math.min(...cloud.X), x1 = Math.max(...cloud.X);
      beads.forEach((b, r) => {
        m.line[b] = li;
        for (let q = 0; q < KB; q++) { const g = gi[r * KB + q], j = b * KB + q; m.LX[j] = cloud.X[g]; m.LY[j] = cloud.Y[g]; }
        // the line is written left to right, calmly: delay follows x, with a little randomness
        const gx = m.LX[b * KB], xr = (gx - x0) / Math.max(1, x1 - x0);
        m.LD[b] = clamp(0.78 * xr + 0.22 * PX.rand(b, 52));
      });
      return { str, beads, y: LINE_Y[li], w: x1 - x0 };
    });
    LINES = L; return L;
  }
  // b20 targets
  let ENDT = null;
  function endTargets(V19, V20) {
    if (ENDT) return ENDT;
    const m = material(); lines(V19);
    m.grp = new Int8Array(M); m.EX = new Float32Array(M); m.EY = new Float32Array(M); m.TX = new Float32Array(M); m.TY = new Float32Array(M);
    // l1 <- lines 1+2, l2 <- lines 3+4; contraction keeps the left-right order
    [[0, 1, V20.lines.l1, L1, 61], [2, 3, V20.lines.l2, L2, 62]].forEach(([a, b, str, o, seed], gi) => {
      const js = []; for (let j = 0; j < M; j++) { const li = m.line[(j / KB) | 0]; if (li === a || li === b) js.push(j); }
      const cloud = PX.fit(PX.text(str, { size: o.size, family: F.serif, weight: 600, x: W / 2, y: o.y, step: gi ? 1.3 : 1.2, spacing: o.size * 0.06, seed }), js.length);
      const ci = sortIdx(cloud.n, i => cloud.X[i] + PX.rand(i, 63) * 6);
      const ji = js.slice().sort((p, q) => (m.LX[p] + PX.rand(p, 64) * 6) - (m.LX[q] + PX.rand(q, 64) * 6));
      ji.forEach((j, k) => {
        m.grp[j] = gi; let x = cloud.X[ci[k]], y = cloud.Y[ci[k]];
        if (gi) { x = Math.round(x / 3.2) * 3.2; y = Math.round(y / 3.2) * 3.2; }    // l2 sits on a rigid lattice
        m.EX[j] = x; m.EY[j] = y;
      });
    });
    // 先别急: exactly the prologue's title cloud; particles keep their left-right order as they grow into it
    const t = PX.text(V20.lines.final, { ...TITLE, family: F.serif });
    const tf = PX.fit(t, M), ti = sortIdx(M, i => tf.X[i] + PX.rand(i, 65) * 40);
    const ji = sortIdx(M, j => m.EX[j] + PX.rand(j, 66) * 160);
    ji.forEach((j, k) => { m.TX[j] = tf.X[ti[k]]; m.TY[j] = tf.Y[ti[k]]; });
    ENDT = m; return m;
  }

  // ---------------------------------------------------------------- b19 timing (local seconds)
  function T19(api) {
    const tS = at(api, 'slow'), ts = ['s1', 's2', 's3', 's4'].map(n => at(api, n));
    return {
      tS, ts, dur: api.dur,
      // the deceleration: shimmer time runs normally, then eases to a stop (velocity -> 0)
      tau: lt => lt < tS ? lt : tS + 0.9 * (1 - Math.exp(-(lt - tS) / 0.9)),
      cool: lt => smooth(prog(lt, tS + 0.2, tS + 2.2)),
      grain: (b, lt) => ease.inOut(prog(lt, tS + 0.9 + PX.rand(b, 43) * 0.7, tS + 2.0 + PX.rand(b, 43) * 0.7)),
      settle: (b, lt) => prog(lt, tS + 2.0 + PX.rand(b, 44) * 1.1, tS + 3.8 + PX.rand(b, 44) * 1.1),
      // each line is written more slowly than the one before
      spread: [1.0, 1.1, 1.15, 1.4], travel: [1.35, 1.5, 1.6, 2.1],
    };
  }
  // where bead-grain particle j is in b19 (number -> bead in the number -> field -> its line). Returns via out arrays.
  function frame19(api, lt, V, O) {
    lines(V); const m = material(), tm = T19(api), tabs = api.beat.start + lt;
    const tau = tm.tau(lt), pulOn = lt < tm.tS ? 1 : Math.exp(-(lt - tm.tS) * 1.8);
    const pul = beat.pulse(tabs, 9) * pulOn;
    // shimmer amplitude: hot and beat-driven, then calming
    const shim = lerp(1.5 + pul * 4, 0.35, smooth(prog(lt, tm.tS, tm.tS + 1.6)));
    // the heartbeat scale (b02: 1.05 after "甚至更高") relaxes to 1
    const sc = lerp(1.05 + pul * 0.035, 1, smooth(prog(lt, tm.tS, tm.tS + 1.4)));
    const aNum = 0.42 * m.S / M;                                        // same light as the prologue's number
    const field = 0.5, lineA = 0.2;
    const tEq = tm.ts[3] + 3.0;                                          // after the 4th line: all lines level up
    const dimK = [1, 2, 3].map(i => smooth(prog(lt, tm.ts[i], tm.ts[i] + 1.2)));
    const eqK = smooth(prog(lt, tEq, tEq + 1.2));
    const breath = Math.sin(tabs * 0.9);
    for (let b = 0; b < NB; b++) {
      const kg = tm.grain(b, lt), ks = tm.settle(b, lt), li = m.line[b], tl = tm.ts[li];
      const t0 = tl + 0.1 + m.LD[b] * tm.spread[li], tr = tm.travel[li];
      // line brightness: full while newest, dimmer once the next starts, levelled at the end
      const dim = li < 3 ? 1 - 0.55 * dimK[li] : 1;
      const lvl = lerp(dim, 0.78, eqK);
      // field position (settling like sediment: slow fall with a little sway)
      const se = ease.inOut(ks), sway = Math.sin(ks * Math.PI) * (PX.rand(b, 45) - 0.5) * 36;
      const bx = lerp(m.BX[b], m.FX[b], se) + sway, by = lerp(m.BY[b], m.FY[b], se);
      const rB = lerp(3.3, 6.2, se);
      // a slow travelling swell of light through the field (calm, never still until it is gone)
      const fa = field * m.FE[b] * (0.85 + 0.15 * Math.sin(m.FX[b] * 0.012 - tabs * 1.1 + m.FY[b] * 0.004)) * lerp(1, 0.8, se);
      for (let q = 0; q < KB; q++) {
        const j = b * KB + q;
        // 1. the number (with the prologue's shimmer, its time slowing down)
        const r1 = m.R1[j], r2 = m.R2[j];
        let x = W / 2 + (m.NX[j] + Math.sin(tau * (3 + r1 * 4) + r2 * 40) * shim * (0.5 + r1) - W / 2) * sc;
        let y = NUM_Y + (m.NY[j] + Math.cos(tau * (2 + r2 * 4) + r1 * 40) * shim * (0.5 + r2) - NUM_Y) * sc;
        let a = aNum;
        // 2. -> grain of a bead (in the number, then in the field)
        if (kg > 0) {
          const gx = bx + SLOT.X[q] * rB, gy = by + SLOT.Y[q] * rB;
          x = lerp(x, gx, kg); y = lerp(y, gy, kg); a = lerp(aNum, fa * SLOT.A[q], kg);
        }
        // 3. -> its glyph point in the line (each grain leaves its bead a moment apart: the bead unravels)
        const kl = clamp((lt - t0 - PX.rand(j, 46) * 0.18) / tr);
        if (kl > 0) {
          const e = ease.inOut(kl), an = PX.rand(j, 47) * TAU, sw = Math.sin(kl * Math.PI) * (14 + PX.rand(j, 48) * 26);
          const sh = 0.45 * Math.sin(tabs * 1.3 + PX.rand(j, 49) * 40) * e;
          x = lerp(x, m.LX[j], e) + Math.cos(an) * sw + sh; y = lerp(y, m.LY[j], ease.out(kl) * 0.5 + e * 0.5) + Math.sin(an) * sw * 0.4;
          a = (1 + 1.3 * Math.sin(kl * Math.PI)) * lerp(a, lineA * lvl * (1 + 0.6 * (1 - eqK) * Math.exp(-Math.max(0, lt - t0 - tr) * 2.5)), smooth(kl));
        }
        O.X[j] = x; O.Y[j] = y; O.A[j] = a;
      }
    }
    return { pul, sc, cool: tm.cool(lt), breath };
  }

  T.register('recall', {
    draw(ctx, V, lt, api) {
      const tm = T19(api), tS = tm.tS, tabs = api.beat.start + lt;
      // hard cut in (a memory flashes back) and a seamless hand-over to b20 (no dip to black)
      if (lt < 0.5 || lt > api.dur - 0.5) ctx.globalAlpha = 1;
      const O = PX.buf(M, 61), f = frame19(api, lt, V, O);
      // the flash: the number arrives white-hot and flickers like a memory for a few frames
      const fl = lt < 0.5 ? 0.55 + 0.45 * (Math.floor(lt * 30) % 3 === 1 ? 0.35 : 1) : 1;
      const heat = Math.exp(-lt * 5);
      const col = [lerp(lerp(EMB[0], 1, heat * 0.6), WARM[0], f.cool), lerp(lerp(EMB[1], 0.92, heat * 0.6), WARM[1], f.cool), lerp(lerp(EMB[2], 0.8, heat * 0.6), WARM[2], f.cool)];
      PX.begin();
      ctx.save(); ctx.globalAlpha *= fl;
      PX.points(O.X, O.Y, M, col, { a: 1, A: O.A, glow: lerp(0.55, 0.4, f.cool) });
      ctx.restore();
      fullFrame();
      PX.flush({ exposure: 1.5, glow: lerp(1.2 + heat * 0.8 + f.pul * 0.3, 0.75, f.cool) });
      // the pitch's rhythm: beat-synced ember glints at the frame edges (b01), fading as time slows
      const gl = f.pul * 0.1 * (1 - f.cool);
      if (gl > 0.002) { ctx.save(); ctx.globalAlpha *= gl; ctx.fillStyle = C.ember; ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 6, W, 6); ctx.restore(); }
      if (lt < 0.14) { ctx.save(); ctx.globalAlpha *= (1 - lt / 0.14) * 0.28; ctx.fillStyle = '#ffb27a'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      // step numerals: small, quiet, above each line as it lands
      lines(V).forEach((L, i) => {
        const t0 = tm.ts[i] + 0.1 + tm.spread[i] * 0.5 + tm.travel[i] * 0.6;
        const k = ease.out(prog(lt, t0, t0 + 1.0)); if (k <= 0) return;
        const dim = i < 3 ? 1 - 0.55 * smooth(prog(lt, tm.ts[i + 1], tm.ts[i + 1] + 1.2)) : 1;
        const lvl = lerp(dim, 0.78, smooth(prog(lt, tm.ts[3] + 3.0, tm.ts[3] + 4.2)));
        text(String(i + 1), W / 2, L.y - 74 + (1 - k) * 8, { size: 24, family: F.mono, weight: 400, color: C.gold, align: 'center', alpha: k * 0.55 * lvl });
      });
    },
    cues(V, api) {
      const s = n => api.steps.find(x => x.show === n), tm = T19(api), out = [];
      out.push({ t: 0, type: 'riser', dur: s('flash').dur });
      for (let k = 0; k < s('flash').beats; k++) out.push({ t: s('flash').lt + k * beat.BEAT, type: 'heartbeat', k });
      out.push({ t: s('slow').lt, type: 'hush' });
      out.push({ t: s('slow').lt + 0.9, type: 'gather', dur: 3.6 });
      ['s1', 's2', 's3', 's4'].forEach((n, i) => {
        const t0 = s(n).lt + 0.1, d = tm.spread[i] + tm.travel[i];
        out.push({ t: t0, type: 'ticks', dur: d, n: 6 + i * 2, p0: 0.25 + i * 0.05, p1: 0.55 + i * 0.05 });
        out.push({ t: t0 + d, type: 'title', i });
      });
      return out;
    },
  });

  // ---------------------------------------------------------------- b20 end
  function T20(api) { return { t1: at(api, 'l1'), t2: at(api, 'l2'), tF: at(api, 'final'), dur: api.dur }; }
  // the lines' state at the end of b19 (the shared frame across the cut)
  function lineRest(j, tabs) { return 0.45 * Math.sin(tabs * 1.3 + PX.rand(j, 49) * 40); }

  T.register('end', {
    draw(ctx, V, lt, api) {
      if (lt < 0.5) ctx.globalAlpha = 1;                                // continues b19's last frame (no dip)
      const V19 = { lines: { steps: findSteps(api) } };
      const m = endTargets(V19, V), tm = T20(api), tabs = api.beat.start + lt;
      const t1 = tm.t1, t2 = tm.t2, tF = tm.tF;
      const O1 = PX.buf(M, 62), O2 = PX.buf(M, 63);
      // stillness: every shimmer decays to exactly zero once the title has formed
      const still = 1 - smooth(prog(lt, tF + 3.4, tF + 5.6));
      const kF = clamp((lt - tF - 1.6) / 3.2);                          // the prologue's gather (b03 form)
      const loose = prog(lt, tF + 0.2, tF + 2.6);                       // l2 unlocks, lines loosen first
      const lockK = 1 - smooth(prog(lt, tF + 0.1, tF + 1.2));
      let n1 = 0, n2 = 0;
      for (let j = 0; j < M; j++) {
        const g = m.grp[j], rest = lineRest(j, tabs);
        let x = m.LX[j] + rest, y = m.LY[j], a = 0.2 * 0.78;
        const r7 = PX.rand(j, 71), r8 = PX.rand(j, 72), an = PX.rand(j, 73) * TAU;
        if (g === 0) {
          // l1: lines 1+2 contract softly into one line, written left to right
          const d = 0.25 + (m.EX[j] - 200) / 680 * 1.3 + r7 * 0.5, k = ease.inOut(clamp((lt - t1 - d) / 1.9));
          const sw = Math.sin(k * Math.PI) * (10 + r8 * 22);
          x = lerp(x, m.EX[j], k) + Math.cos(an) * sw; y = lerp(y, m.EY[j], k) + Math.sin(an) * sw * 0.5;
          x += 0.4 * Math.sin(tabs * 1.1 + r7 * 40) * k * still;
          a = lerp(a, 0.24, k);
        } else {
          // l2's material: lines 3+4 come apart into a soft, sparse dust that hangs below l1 (unformed) ...
          const km = smooth(prog(lt, t1 + 0.1 + r7 * 0.9, t1 + 2.9 + r7 * 0.9));
          // (sparse: one grain in eight catches the light, like dust in a sunbeam; the cloud's edge is ragged)
          const aa = PX.rand(j, 75) * TAU, ra = Math.pow(PX.rand(j, 74), 0.7) * (0.75 + 0.25 * Math.sin(aa * 3 + 1) * Math.cos(aa * 5 + 2));
          const dx = W / 2 + Math.cos(aa) * ra * 430 + Math.sin(tabs * 0.31 + r8 * 30) * 16, dy = 1015 + Math.sin(aa) * ra * 130 + Math.cos(tabs * 0.27 + r7 * 30) * 12;
          const spark = PX.rand(j, 76) < 0.125 ? 0.3 * (0.6 + 0.4 * Math.sin(tabs * (0.8 + r8) + r7 * 50)) : 0.006;
          x = lerp(x, dx, km); y = lerp(y, dy, km); a = lerp(a, spark, smooth(prog(lt, t1 + 0.05 + r7 * 0.3, t1 + 0.9 + r7 * 0.3)));
          // ... then SNAP into place: fast, hard, locked on a lattice (no shimmer at all)
          const ks = clamp((lt - t2 - 0.15 - r8 * 0.22) / 0.42), e = ease.outExpo(ks);
          x = lerp(x, m.EX[j], e); y = lerp(y, m.EY[j], e);
          a = lerp(a, 0.2, ks > 0 ? Math.min(1, ks * 3) : 0);
        }
        // final: everything loosens, then gathers into 先别急 exactly like the prologue's title
        if (lt >= tF) {
          // the lines dissolve into an out-of-focus 先别急, which then comes into focus grain by grain (b03's gather)
          const kd = smooth(clamp((loose - PX.rand(j, 12) * 0.35) / 0.65));
          const br0 = 30 + 60 * PX.rand(j, 8), bx = Math.cos(an) * br0, by = Math.sin(an) * br0 * 0.8;
          const drift = Math.sin(lt * 0.6 + PX.rand(j, 11) * 30) * 6;
          const dd = PX.rand(j, 10) * 0.55, kk = ease.inOut(clamp((kF - dd) / 0.45));
          x = lerp(x, m.TX[j] + bx, kd); y = lerp(y, m.TY[j] + by, kd);
          x = lerp(x, m.TX[j], kk) + drift * (1 - kk) * kd; y = lerp(y, m.TY[j], kk) + drift * 0.6 * (1 - kk) * kd;
          a = lerp(a, 0.42 * 20888 / M, kk);
        }
        if (g === 0 || lt >= tF + 1.2) { O1.X[n1] = x; O1.Y[n1] = y; O1.A[n1] = a; n1++; }
        else { O2.X[n2] = x; O2.Y[n2] = y; O2.A[n2] = a; n2++; }
      }
      // breath: the glow swells once, then holds
      const br = Math.sin(Math.PI * smooth(prog(lt, tF + 5.0, tF + 7.6)));
      PX.begin();
      PX.points(O1.X, O1.Y, n1, WARM, { a: 1, A: O1.A, glow: 0.35 });
      // l2: whiter, crisper (less halo) while locked; it warms back as it melts
      const hard = lt < tF + 1.2 ? Math.max(smooth(prog(lt, t2, t2 + 0.5)), 0) * lockK : 0;
      PX.points(O2.X, O2.Y, n2, [lerp(WARM[0], 1, hard), lerp(WARM[1], 0.97, hard), lerp(WARM[2], 0.93, hard)], { a: 1, A: O2.A, glow: lerp(0.35, 0.12, hard) });
      fullFrame();
      PX.flush({ exposure: 1.5 + br * 0.25, glow: 0.8 + br * 0.55 });
      // the ember contour of premature certainty: snaps on with the lattice, burns, and melts away at 'final'
      // b19's step numerals, carried across the cut, fade as the lines condense
      const nk = 1 - smooth(prog(lt, 0, 1.0));
      if (nk > 0) LINE_Y.forEach((y, i) => text(String(i + 1), W / 2, y - 74, { size: 24, family: F.mono, weight: 400, color: C.gold, align: 'center', alpha: nk * 0.55 * 0.78 }));
      const ck = prog(lt, t2 + 0.35, t2 + 0.55);
      if (ck > 0 && lockK > 0) {
        const flash = Math.exp(-Math.max(0, lt - t2 - 0.5) * 4);
        contour(V.lines.l2, L2, (0.55 + 0.45 * flash) * ck * lockK, 1.2 + flash * 1.5);
      }
    },
    cues(V, api) {
      const s = n => api.steps.find(x => x.show === n);
      return [
        { t: s('l1').lt + 0.25, type: 'gather', dur: 3.2 },
        { t: s('l2').lt + 0.15, type: 'whoosh', dur: 0.4 },
        { t: s('l2').lt + 0.55, type: 'click' },
        { t: s('final').lt, type: 'resolve' },
        { t: s('final').lt + 0.6, type: 'gather', dur: 4.2 },
        { t: s('final').lt + 5.0, type: 'swell', dur: 2.6 },
      ];
    },
  });
  // b20 needs b19's strings (the four steps) to rebuild the shared material
  function findSteps(api) {
    const TL = T.TL, b = TL && TL.beats.find(x => x.visual.type === 'recall');
    return b ? b.visual.lines.steps : ['', '', '', ''];
  }
  // a hard, thin contour around a line (same layout as PX.text: chars + spacing, centred, baseline y)
  function contour(str, o, alpha, lw) {
    const sp = o.size * 0.06;
    ctx.save(); ctx.font = `600 ${o.size}px ${F.serif}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const chars = [...str], ws = chars.map(ch => ctx.measureText(ch).width + sp), tw = ws.reduce((a, b) => a + b, 0) - sp;
    ctx.globalAlpha *= alpha; ctx.strokeStyle = C.ember; ctx.lineWidth = lw; ctx.lineJoin = 'miter';
    ctx.shadowColor = C.ember; ctx.shadowBlur = 8;
    let x = W / 2 - tw / 2; chars.forEach((c, i) => { ctx.strokeText(c, x, o.y); x += ws[i]; });
    ctx.restore();
  }
})();
