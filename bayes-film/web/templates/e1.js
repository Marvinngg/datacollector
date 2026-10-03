/* 一成 (e1): the base rate, made of 1000 beads. One continuous picture over three beats (b05, b06 ref b04).
 * b04 thousand — the title 「先别急」 rises to the top and rains out: every drop lands on a grain of one of the 1000
 *                beads; the grid fills from the bottom like a vessel, a gauge counts the finished beads, "1000 个同类项目".
 * b05 baserate — a scanline sweeps the grid: 100 beads ignite gold, 900 cool to steel (counter counts only what is lit);
 *                the gold floats up into a 4-row block, the steel settles below; the gut's 50% line vs the real 10% line,
 *                and the dark chasm between them.
 * b06 nine     — a light membrane (×9) descends through the field: keeps 90 of 100 gold, 90 of 900 steel; the
 *                survivors stack into two equal piles 90 : 90 → 50%. Then it cracks and evaporates, and every bead goes
 *                home to its honest place in KIT.gridPos (the hand-off state for e2).
 * Everything is a closed-form function of absolute film time t; all counts are counted from the beads on screen. */
(function () {
  const { W, H, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const { C, PROJ, GRID } = KIT;
  const TAU = Math.PI * 2;
  const N = PROJ.n, KB = 48;                                   // beads, grains per bead (= KIT.beads default)
  const PIT = GRID.pitch, GCY = GRID.y0 + (GRID.rows - 1) * PIT / 2;   // grid centre (y) in grid space
  const S0 = 0.8, CY0 = 1095;                                  // the chapter's camera: grid at 80 %, lowered under the text
  const rowY = r => GRID.y0 + r * PIT;
  const COL = PX.COL, WARM = [0.98, 0.93, 0.83];
  const sm = u => u * u * (3 - 2 * u);
  const ROWA = 410, ROWB = 505;                                // the two text rows above the grid

  // the bead's grain pattern (same sunflower as KIT.beads, so grains can land exactly where KIT.beads draws them)
  const BEAD = (() => { const m = 64, X = new Float32Array(m), Y = new Float32Array(m), A = new Float32Array(m), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < m; i++) { const rr = Math.sqrt((i + 0.5) / m), an = i * ga; X[i] = Math.cos(an) * rr; Y[i] = Math.sin(an) * rr; A[i] = 1 - 0.55 * rr * rr; }
    return { X, Y, A }; })();

  // ---------------------------------------------------------------- timing (absolute seconds)
  function times(api) {
    const S = {};
    for (const s of api.steps) S[s.show] = s.t;
    S.end = api.beat.start + api.chainEnd;
    S.F0 = S.fall + 1.5; S.F1 = S.count - 0.1;                 // first / last bead completes (rain)
    S.scan0 = S.sweep + 0.35; S.scan1 = S.one - 0.5;           // scanline top → bottom
    S.mem0 = S.membrane + 0.7; S.mem1 = S.result - 0.75;       // membrane top → bottom
    S.cam0 = S.end - 2.1; S.cam1 = S.end - 0.45;               // camera back to the standard grid
    return S;
  }
  function camera(t, S) { const k = ease.inOut(prog(t, S.cam0, S.cam1)); return { s: lerp(S0, 1, k), cy: lerp(CY0, GCY, k) }; }
  const scx = (x, c) => 540 + (x - 540) * c.s, scy = (y, c) => c.cy + (y - GCY) * c.s;
  const SCAN_Y0 = rowY(-0.5), SCAN_Y1 = rowY(39.5);
  const MEM_Y0 = rowY(-1.0), MEM_Y1 = rowY(40.6);

  function chainLines(api) {
    const key = api.beat.visual.ref || api.beat.id, out = {};
    for (const b of (T.TL ? T.TL.beats : [])) if ((b.visual.ref || b.id) === key) Object.assign(out, b.visual.lines || {});
    return out;
  }

  // ---------------------------------------------------------------- static per-bead data
  let BD = null;
  function beadData(S) {
    const key = [S.scan0, S.scan1, S.gather, S.mem0, S.mem1, S.result, S.rare].join('|');
    if (BD && BD.key === key) return BD;
    const gx = new Float32Array(N), gy = new Float32Array(N), packX = new Float32Array(N), packY = new Float32Array(N), packRow = new Int16Array(N);
    for (let i = 0; i < N; i++) { const p = KIT.gridPos(i); gx[i] = p[0]; gy[i] = p[1]; }
    const col = i => i % GRID.cols, row = i => Math.floor(i / GRID.cols);
    // gather: gold → the first 100 cells (rows 0-3), steel → rows 4-39. Assigned column by column (each bead moves
    // mostly straight up / down: gold floats, steel settles), and inside a column in the original row order.
    function pack(list, r0, nr) {
      const L = [...list].sort((a, b) => col(a) - col(b) || row(a) - row(b));
      for (let c = 0; c < GRID.cols; c++) {
        const chunk = L.slice(c * nr, (c + 1) * nr).sort((a, b) => row(a) - row(b));
        chunk.forEach((i, k) => { packX[i] = GRID.x0 + c * PIT; packY[i] = rowY(r0 + k); packRow[i] = r0 + k; });
      }
    }
    pack(PROJ.succ, 0, 4); pack(PROJ.fail, 4, 36);
    // the membrane keeps 90 of the 100 gold and 90 of the 900 steel (a stable random choice)
    const byRank = l => [...l].sort((a, b) => PROJ.rank[a] - PROJ.rank[b]);
    const surv = new Uint8Array(N), gS = byRank(PROJ.succ).slice(0, 90), sS = byRank(PROJ.fail).slice(0, 90);
    gS.forEach(i => surv[i] = 1); sS.forEach(i => surv[i] = 1);
    // piles: 9 x 10, filled from the bottom row up; survivors lowest in the field go first
    const pileX = new Float32Array(N), pileY = new Float32Array(N), pileT = new Float32Array(N).fill(1e9);
    const PILE = { gx: 330, sx: 750, y: 905, dur: 0.85 };
    [[gS, PILE.gx], [sS, PILE.sx]].forEach(([l, cx]) => {
      [...l].sort((a, b) => packY[b] - packY[a] || packX[a] - packX[b]).forEach((i, k) => {
        const c = k % 9, r = Math.floor(k / 9);
        pileX[i] = cx + (c - 4) * PIT; pileY[i] = PILE.y + (4.5 - r) * PIT;
        pileT[i] = S.result + 0.2 + (k / 89) * 1.5;          // start of its flight
      });
    });
    // per-bead times
    const tp = new Float32Array(N), tm = new Float32Array(N), gS0 = new Float32Array(N), gD = new Float32Array(N), back = new Float32Array(N), sway = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      tp[i] = S.scan0 + (gy[i] - SCAN_Y0) / (SCAN_Y1 - SCAN_Y0) * (S.scan1 - S.scan0);
      tm[i] = S.mem0 + (packY[i] - MEM_Y0) / (MEM_Y1 - MEM_Y0) * (S.mem1 - S.mem0);
      const r = PX.rand(i, 21);
      if (PROJ.ok[i]) { gS0[i] = S.gather + 0.15 + r * 0.6; gD[i] = 1.7; sway[i] = (PX.rand(i, 22) - 0.5) * 36; }
      else { gS0[i] = S.gather + 1.0 + r * 0.55; gD[i] = 1.4; sway[i] = 0; }
      back[i] = S.rare + 1.0 + PX.rand(i, 23) * 0.9;
    }
    // counts over time (sorted event times → exact live counters)
    const goldTp = Float32Array.from(PROJ.succ.map(i => tp[i])).sort();
    const pileArr = l => Float32Array.from(l.map(i => pileT[i] + PILE.dur)).sort();
    BD = { key, gx, gy, packX, packY, packRow, surv, pileX, pileY, pileT, PILE, tp, tm, gS0, gD, back, sway, goldTp,
      gPile: pileArr(gS), sPile: pileArr(sS), gSurvTm: Float32Array.from(gS.map(i => tm[i])).sort(), sSurvTm: Float32Array.from(sS.map(i => tm[i])).sort(),
      X: new Float32Array(N), Y: new Float32Array(N), A: new Float32Array(N), R: new Float32Array(N), Cc: new Float32Array(N * 3) };
    return BD;
  }
  const countLE = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; } return lo; };

  // ---------------------------------------------------------------- the rain (b04)
  // The title cloud of b03 (23k particles over 11k glyph points) becomes 48 000 drops, one per bead grain.
  const TITLE_PIV = { x: 540, y: 865 }, TOP = { s: 0.62, y: 378 }, G = 2600;
  function titleCloud() {
    const t = PX.text('先别急', { size: 300, family: F.serif, weight: 600, x: 540, y: 980, step: 2.6, spacing: 30, seed: 5 });
    const srcN = ['6', '0', '%'].reduce((a, ch) => a + PX.text(ch, { size: 440, family: F.serif, weight: 900, x: 0, y: 160, step: 2.2, seed: ch.charCodeAt(0) }).n, 0);
    return { t, srcN };
  }
  let RAIN = null;
  function rain(S) {
    const { t: title, srcN } = titleCloud();
    const key = S.fall + '|' + S.count;
    if (RAIN && RAIN.title === title && RAIN.key === key) return RAIN;
    const tn = title.n, D = N * KB;
    const camB = { s: S0, cy: CY0 };
    // grains: arrival times. Bead c completes around tcBase (bottom row first, a ragged rising surface)
    const ta = new Float32Array(D), tc = new Float32Array(N).fill(-1e9);
    const FD = S.F1 - S.F0;
    for (let c = 0; c < N; c++) {
      const r = Math.floor(c / GRID.cols), base = S.F0 + FD * ((GRID.rows - 1 - r) + 0.9 * PX.rand(c, 5)) / (GRID.rows - 0.1);
      for (let q = 0; q < KB; q++) { const v = base - 0.42 * PX.rand(c * KB + q, 6); ta[c * KB + q] = v; if (v > tc[c]) tc[c] = v; }
    }
    // pair grains (by arrival) with sources (title points at the top, lowest first), then within short runs by x
    const gOrd = [...Array(D).keys()].sort((a, b) => ta[a] - ta[b]);
    const srcY = p => TOP.y + (title.Y[p] - TITLE_PIV.y) * TOP.s, srcX = p => 540 + (title.X[p] - TITLE_PIV.x) * TOP.s;
    const sKey = new Float32Array(D); for (let d = 0; d < D; d++) sKey[d] = srcY(d % tn) + (PX.rand(d, 7) - 0.5) * 70;
    const sOrd = [...Array(D).keys()].sort((a, b) => sKey[b] - sKey[a]);
    const tgtX = d => { const c = (d / KB) | 0, q = d % KB; return scx(KIT.gridPos(c)[0], camB) + BEAD.X[q] * 9 * S0; };
    const RUN = 900;
    const out = { title, key, D, src: new Int32Array(D), grain: new Int32Array(D) };
    for (let k0 = 0; k0 < D; k0 += RUN) {
      const gs = gOrd.slice(k0, k0 + RUN).sort((a, b) => tgtX(a) - tgtX(b));
      const ss = sOrd.slice(k0, k0 + RUN).sort((a, b) => srcX(a % tn) - srcX(b % tn));
      for (let k = 0; k < gs.length; k++) { out.grain[k0 + k] = gs[k]; out.src[k0 + k] = ss[k] % tn; }
    }
    // per drop: source, target, times, intensities
    const cnt = new Uint8Array(tn), cnt2 = new Uint8Array(tn);
    for (let i = 0; i < srcN; i++) cnt[i % tn]++;
    for (let d = 0; d < D; d++) cnt2[out.src[d]]++;
    const sx = new Float32Array(D), sy = new Float32Array(D), tx = new Float32Array(D), ty = new Float32Array(D), td = new Float32Array(D), tA = new Float32Array(D), fl = new Float32Array(D);
    const aC = new Float32Array(D), aL = new Float32Array(D), bead = new Int32Array(D), ox = new Float32Array(D), oy = new Float32Array(D), bx = new Float32Array(D), by = new Float32Array(D);
    for (let d = 0; d < D; d++) {
      const p = out.src[d], gi = out.grain[d], c = (gi / KB) | 0, q = gi % KB, gp = KIT.gridPos(c);
      sx[d] = srcX(p); sy[d] = srcY(p);
      bx[d] = scx(gp[0], camB); by[d] = scy(gp[1], camB); ox[d] = BEAD.X[q] * 9 * S0; oy[d] = BEAD.Y[q] * 9 * S0;
      tx[d] = bx[d] + ox[d]; ty[d] = by[d] + oy[d];
      tA[d] = ta[gi]; fl[d] = Math.sqrt(2 * Math.max(10, ty[d] - sy[d]) / G); td[d] = tA[d] - fl[d];
      aC[d] = 0.42 * cnt[p] / cnt2[p]; aL[d] = 1.1 * BEAD.A[q]; bead[d] = c;
    }
    Object.assign(out, { sx, sy, tx, ty, td, ta: tA, fl, aC, aL, bead, ox, oy, bx, by, tc, tcSorted: Float32Array.from(tc).sort(),
      firstTc: Math.min(...tc), lastTc: Math.max(...tc),
      CX: new Float32Array(D), CY: new Float32Array(D), CA: new Float32Array(D),
      FX: new Float32Array(D * 3), FY: new Float32Array(D * 3), FA: new Float32Array(D * 3),
      LX: new Float32Array(D), LY: new Float32Array(D), LA: new Float32Array(D) });
    RAIN = out; return out;
  }
  const countPulse = (t, S) => t > S.count + 0.05 ? 1 + 0.5 * Math.exp(-(t - S.count - 0.05) * 5) : 1;

  function drawRain(t, S) {
    const R = rain(S), D = R.D, tit = R.title;
    const k = ease.inOut(prog(t, S.fact + 0.6, S.fall - 0.2)), ts = lerp(1, TOP.s, k), tcy = lerp(TITLE_PIV.y, TOP.y, k);
    const jit = 1.6 * prog(t, S.fall, S.fall + 0.5) * (1 - prog(t, S.count - 0.3, S.count)), gp = countPulse(t, S);
    let nc = 0, nf = 0, nl = 0;
    for (let d = 0; d < D; d++) {
      if (t < R.td[d]) {                                       // still in the cloud
        const p = R.src[d];
        let x = 540 + (tit.X[p] - TITLE_PIV.x) * ts, y = tcy + (tit.Y[p] - TITLE_PIV.y) * ts;
        if (jit > 0) { const r1 = PX.rand(d, 3), r2 = PX.rand(d, 4); x += Math.sin(t * (5 + r1 * 6) + r2 * 40) * jit; y += Math.cos(t * (4 + r2 * 6) + r1 * 40) * jit; }
        R.CX[nc] = x; R.CY[nc] = y; R.CA[nc] = R.aC[d]; nc++;
      } else if (t < R.ta[d]) {                                // falling (free fall, drifting to its column)
        const T0 = R.fl[d];
        for (let s = 0; s < 3; s++) {
          const tau = t - R.td[d] - s * 0.013; if (tau < 0) break;
          const u = sm(clamp(tau / T0));
          R.FX[nf] = R.sx[d] + (R.tx[d] - R.sx[d]) * u; R.FY[nf] = R.sy[d] + 0.5 * G * tau * tau;
          R.FA[nf] = s === 0 ? 0.55 : s === 1 ? 0.28 : 0.13; nf++;
        }
      } else {                                                 // landed: a grain of its bead
        const c = R.bead[d], tcb = R.tc[c];
        let m = 1 + 1.3 * Math.exp(-(t - R.ta[d]) * 12), rp = 1;
        if (t >= tcb) { const e = Math.exp(-(t - tcb) * 7); m *= 1 + 0.9 * e; rp = 1 + 0.35 * e; }
        R.LX[nl] = R.bx[d] + R.ox[d] * rp; R.LY[nl] = R.by[d] + R.oy[d] * rp; R.LA[nl] = R.aL[d] * m * gp; nl++;
      }
    }
    if (nc) PX.points(R.CX, R.CY, nc, WARM, { a: 1, A: R.CA, glow: 0.35 });
    if (nf) PX.points(R.FX, R.FY, nf, WARM, { a: 1, A: R.FA, glow: 0.22 });
    if (nl) PX.points(R.LX, R.LY, nl, COL.white, { a: 1, A: R.LA, glow: 0.3 });
    return countLE(R.tcSorted, t);
  }

  // ---------------------------------------------------------------- the beads (b04 end → b06)
  function beadState(t, S, B) {
    const c = camera(t, S), X = B.X, Y = B.Y, A = B.A, Rr = B.R, Cc = B.Cc;
    const gp = countPulse(t, S);
    const chasm = ease.inOut(prog(t, S.gap, S.gap + 0.8)) * (1 - ease.inOut(prog(t, S.membrane, S.membrane + 0.7)));
    for (let i = 0; i < N; i++) {
      const ok = PROJ.ok[i], sv = B.surv[i];
      let x = B.gx[i], y = B.gy[i], a = gp, R = 1, cr = COL.white[0], cg = COL.white[1], cb = COL.white[2];
      // 1. sweep: gold ignites, the rest cools to steel
      const dp = t - B.tp[i];
      if (dp >= 0) {
        if (ok) { cr = COL.gold[0]; cg = COL.gold[1]; cb = COL.gold[2]; const e = Math.exp(-dp * 5); a *= 1 + 1.7 * e; R *= 1 + 0.55 * Math.exp(-dp * 6); }
        else { const k = ease.out(clamp(dp / 0.6)); cr = lerp(cr, COL.steel[0], k); cg = lerp(cg, COL.steel[1], k); cb = lerp(cb, COL.steel[2], k); }
      }
      // 2. gather: gold floats up into the top block, steel settles
      const kg = ease.inOut(clamp((t - B.gS0[i]) / B.gD[i]));
      if (kg > 0) { x = lerp(x, B.packX[i], kg) + Math.sin(kg * Math.PI) * B.sway[i]; y = lerp(y, B.packY[i], kg); if (ok) a *= 1 + 0.5 * Math.sin(kg * Math.PI); }
      // 3. the chasm: steel between the real line and the gut line goes dark
      if (chasm > 0 && B.packRow[i] >= 4 && B.packRow[i] < 20) a *= 1 - 0.84 * chasm;
      // 4. membrane: survivors flash through, the rejected sink and go out
      const dm = t - B.tm[i];
      let svk = 0;
      if (dm >= 0) {
        if (sv) { svk = ease.out(clamp(dm / 0.3)); a *= 1 + 1.4 * Math.exp(-dm * 4.5); }
        else { const tau = Math.min(dm, 3), my = lerp(MEM_Y0, MEM_Y1, prog(t, S.mem0, S.mem1)); y = Math.max(y, my - 10 - 6 * PX.rand(i, 24)); x += Math.sin(tau * 3 + i) * 3 * tau; a *= (1 + 0.8 * Math.exp(-tau * 8)) * Math.exp(-tau * 1.6); R *= 1 - 0.35 * Math.min(1, tau); }
      }
      // 5. result: survivors stack into two piles
      if (sv) { const kr = ease.inOut(clamp((t - B.pileT[i]) / B.PILE.dur)); if (kr > 0) { x = lerp(x, B.pileX[i], kr); y = lerp(y, B.pileY[i], kr) - Math.sin(kr * Math.PI) * 60; } }
      // 6. rare: everything goes home (the honest grid)
      const kb = ease.inOut(clamp((t - B.back[i]) / 1.4));
      if (kb > 0) {
        if (sv) { x = lerp(x, B.gx[i], kb); y = lerp(y, B.gy[i], kb); svk *= 1 - kb; }
        else if (dm >= 0) { x = B.gx[i]; y = B.gy[i] + 26 * (1 - kb); a = lerp(a, 1, kb); }
      }
      if (dp >= 0) a *= ok ? 1.3 : lerp(1, 0.72, clamp(dp / 0.6));
      if (svk > 0) {                                           // survivors glow: steel brightens towards white
        if (ok) a *= 1 + 0.3 * svk; else { a *= 1 + 0.5 * svk; cr = lerp(cr, 0.86, 0.45 * svk); cg = lerp(cg, 0.9, 0.45 * svk); cb = lerp(cb, 0.98, 0.45 * svk); }
      }
      X[i] = scx(x, c); Y[i] = scy(y, c); A[i] = a; Rr[i] = R;
      Cc[i * 3] = cr; Cc[i * 3 + 1] = cg; Cc[i * 3 + 2] = cb;
    }
    KIT.beads(X, Y, N, { C: Cc, A, R: Rr, r: 9 * c.s });
    return c;
  }

  // sparks around each gold bead when it ignites
  let SPK = null;
  function sparks(t, S, B, c) {
    const M = 14;
    if (!SPK) SPK = { X: new Float32Array(100 * M * 2), Y: new Float32Array(100 * M * 2), A: new Float32Array(100 * M * 2) };
    let n = 0;
    for (const i of PROJ.succ) {
      const dt = t - B.tp[i]; if (dt < 0 || dt > 0.9) continue;
      const x0 = scx(B.gx[i], c), y0 = scy(B.gy[i], c);
      for (let k = 0; k < M; k++) {
        const an = PX.rand(i * M + k, 31) * TAU, sp = 18 + PX.rand(i * M + k, 32) * 46, d = sp * (1 - Math.exp(-dt * 5));
        const a = Math.exp(-dt * 4) * 0.8;
        SPK.X[n] = x0 + Math.cos(an) * d; SPK.Y[n] = y0 + Math.sin(an) * d + dt * dt * 20; SPK.A[n] = a; n++;
        SPK.X[n] = x0 + Math.cos(an) * d * 0.82; SPK.Y[n] = y0 + Math.sin(an) * d * 0.82; SPK.A[n] = a * 0.4; n++;
      }
    }
    if (n) PX.points(SPK.X, SPK.Y, n, COL.gold, { a: 1, A: SPK.A, glow: 0.6 });
  }

  // the scanline: a thin blade of cool light with a faint wake above it
  let SCN = null;
  function scanline(t, S, c) {
    const k = prog(t, S.scan0, S.scan1); if (t < S.scan0 - 0.3 || t > S.scan1 + 0.4) return;
    const a = Math.min(prog(t, S.scan0 - 0.3, S.scan0), 1 - prog(t, S.scan1, S.scan1 + 0.4));
    const y = scy(lerp(SCAN_Y0, SCAN_Y1, k), c), x0 = scx(GRID.x0 - 40, c), x1 = scx(GRID.x0 + 24 * PIT + 40, c);
    const n = 1400, m = 1600;
    if (!SCN) SCN = { X: new Float32Array(n + m), Y: new Float32Array(n + m), A: new Float32Array(n + m) };
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n; SCN.X[i] = lerp(x0, x1, u); SCN.Y[i] = y + (PX.rand(i, 41) - 0.5) * 2.2;
      SCN.A[i] = Math.pow(Math.sin(u * Math.PI), 0.6) * 0.5;
    }
    for (let j = 0; j < m; j++) {
      const u = PX.rand(j, 42), h = Math.pow(PX.rand(j, 43), 2) * 90;
      SCN.X[n + j] = lerp(x0, x1, u); SCN.Y[n + j] = y - h; SCN.A[n + j] = Math.sin(u * Math.PI) * (1 - h / 90) * 0.16;
    }
    PX.points(SCN.X, SCN.Y, n + m, [0.78, 0.86, 1], { a: a, A: SCN.A, glow: 0.7 });
  }

  // the membrane: a sheet of light across the field; on 'rare' it cracks into pieces that evaporate
  let MEM = null;
  function membrane(t, S, c) {
    if (t < S.membrane || t > S.rare + 2.8) return null;
    const n = 2600;
    if (!MEM) MEM = { X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n) };
    const yG = lerp(MEM_Y0, MEM_Y1, prog(t, S.mem0, S.mem1)), y = scy(yG, c);
    const x0 = scx(GRID.x0 - 70, c), x1 = scx(GRID.x0 + 24 * PIT + 70, c);
    const aIn = ease.out(prog(t, S.membrane + 0.1, S.membrane + 0.7));
    const tCr = S.rare + 0.35, cr = t - tCr;                   // crack
    const cuts = [0.17, 0.33, 0.52, 0.64, 0.81];
    for (let i = 0; i < n; i++) {
      const u = PX.rand(i, 51), r2 = PX.rand(i, 52);
      let x = lerp(x0, x1, u), yy = y + Math.sin(u * 23 + t * 3.2) * 3 + Math.sin(u * 61 - t * 5.1) * 1.5 + (r2 - 0.5) * 3.2;
      let a = Math.pow(Math.sin(u * Math.PI), 0.35) * 0.42 * aIn;
      if (cr > 0) {
        let seg = 0; while (seg < cuts.length && u > cuts[seg]) seg++;
        const sc = ((seg === 0 ? 0 : cuts[seg - 1]) + (seg === cuts.length ? 1 : cuts[seg])) / 2;
        const open = ease.out(clamp(cr / 0.5));
        x += (u - 0.5) * 30 * open + (u - sc) * 18 * open; yy += (u - sc) * (PX.rand(seg, 53) - 0.5) * 120 * open + (PX.rand(seg, 54) - 0.3) * 14 * open;
        const te = 0.25 + PX.rand(i, 55) * 1.3, de = cr - te;   // evaporation
        if (de > 0) { yy -= 70 * de + 50 * de * de; x += Math.sin(de * 3 + r2 * 20) * 16 * de; a *= Math.exp(-de * 2.4); }
      }
      MEM.X[i] = x; MEM.Y[i] = yy; MEM.A[i] = a;
    }
    PX.points(MEM.X, MEM.Y, n, [0.9, 0.95, 1], { a: 1, A: MEM.A, glow: 0.8 });
    return { y, x0, x1, aIn, cr };
  }

  // ---------------------------------------------------------------- text helpers
  function say(str, x, y, size, tIn, tOut, t, o = {}) {
    const rd = o.rd || Math.min(1.1, 0.35 + [...str].length * 0.06), rv = prog(t, tIn, tIn + rd);
    if (rv <= 0) return;
    const out = tOut == null ? 0 : ease.in(prog(t, tOut, tOut + (o.od || 0.45))); if (out >= 1) return;
    L.serif(str, x, y - out * 14, { size, family: F.serif, weight: o.weight || 600, color: o.color || C.ink, reveal: rv, alpha: (1 - out) * (o.alpha == null ? 1 : o.alpha),
      glow: o.glow == null ? 6 : o.glow, align: o.align || 'center', spacing: o.spacing, highlight: o.highlight, hiColor: o.hiColor });
  }
  const mono = (s, x, y, size, o = {}) => text(s, x, y, { size, family: F.mono, weight: o.weight || 700, color: o.color || C.ink, align: o.align || 'left', alpha: o.alpha, glow: o.glow || 0, glowColor: o.glowColor });
  const win = (t, a, b, fi = 0.4, fo = 0.4) => Math.min(ease.out(prog(t, a, a + fi)), 1 - ease.in(prog(t, b, b + fo)));
  function hline(x0, x1, y, col, a, o = {}) {
    if (a <= 0) return;
    const ctx = K.ctx; ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = o.w || 2;
    if (o.dash) ctx.setLineDash(o.dash);
    if (o.glow) { ctx.shadowColor = col; ctx.shadowBlur = o.glow; }
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- the one draw (absolute time)
  function drawAll(V, lt, api) {
    const S = times(api), t = api.beat.start + lt, LN = chainLines(api), ctx = K.ctx;
    const B = beadData(S);
    const rainPhase = t < S.count + 1.0;
    PX.begin();
    let done = 0, c = camera(t, S);
    if (rainPhase) done = drawRain(t, S);
    else { c = beadState(t, S, B); sparks(t, S, B, c); }
    scanline(t, S, c);
    const mem = membrane(t, S, c);
    const kx = prog(t, S.fall, S.count);
    // zero-light anchors at the frame corners: the glow blur then covers the whole frame (PX's blur reads a stale
    // scratch row just outside its region otherwise, which shows as faint bars under bright shapes)
    PX.dot(1.5, 1.5, [0, 0, 0], 1, 1); PX.dot(W - 3, H - 3, [0, 0, 0], 1, 1);
    PX.flush({ exposure: lerp(1.5, 1.4, kx), glow: lerp(0.8, 1, kx) });

    // ---- b04 ----
    if (t < S.fall + 1) {                                      // b03's subtitle, released
      const so = ease.in(prog(t, S.fact, S.fact + 0.7));
      if (so < 1) L.serif(LN.sub || '一次乘法里的判断力', 540, 1180 + so * 20, { size: 44, family: F.serif, weight: 400, color: C.dim, reveal: 1, glow: 0, spacing: 12, alpha: 1 - so });
    }
    say(LN.fact, 540, 1010, 76, S.fact + 0.7, S.fall + 0.05, t, { glow: 10 });
    if (t >= S.F0 - 0.4 && t < S.sweep + 0.6) {
      // the gauge rides the rising surface, then flies up to become the "1000" of the line
      const R = rain(S), lvlY = scy(rowY(GRID.rows - 0.5 - done / GRID.cols), { s: S0, cy: CY0 });
      const fk = ease.inOut(prog(t, S.count, S.count + 0.6));
      const m = /^(\d+)\s*(.*)$/.exec(LN.count || '1000 个同类项目') || [0, '1000', ''];
      const numS = 112, labS = 64, fo = { size: numS, family: F.mono, weight: 700 };
      const nw = measure(m[1], fo), lw = L.measureSerif(m[2], labS, { weight: 600 }), x0 = 540 - (nw + 26 + lw) / 2, yL = 440;
      const gx = scx(GRID.x0 + 24 * PIT, { s: S0, cy: CY0 }) + 30;
      const x = lerp(gx, x0, fk), y = lerp(lvlY + 12, yL, fk), size = lerp(36, numS, fk);
      const aOut = 1 - ease.in(prog(t, S.sweep, S.sweep + 0.5));
      const aIn = ease.out(prog(t, R.firstTc - 0.3, R.firstTc));
      if (fk < 1) hline(gx - 26, gx - 8, lvlY, C.ink, aIn * 0.6 * (1 - fk));
      mono(String(countLE(R.tcSorted, t)), x, y, size, { color: fk > 0.5 ? C.ink : C.dim, alpha: aIn * aOut });
      say(m[2], x0 + nw + 26, yL - 26, labS, S.count + 0.35, S.sweep, t, { align: 'left', glow: 8 });
    }

    // ---- b05: the lit counter ----
    if (t >= S.sweep && t < S.membrane + 1) {
      const lit = countLE(B.goldTp, t), a = win(t, S.sweep + 0.2, S.need - 0.1, 0.5, 0.45);
      const labS = 56, numS = 120, lw = L.measureSerif('成功', labS, { weight: 600 }), x0 = 540 - (lw + 22 + measure('100', { size: numS, family: F.mono, weight: 700 })) / 2;
      if (a > 0) {
        L.serif('成功', x0, ROWA - 24, { size: labS, family: F.serif, weight: 600, color: C.gold, align: 'left', alpha: a, glow: 8, reveal: 1 });
        mono(String(lit), x0 + lw + 22, ROWA, numS, { color: C.gold, alpha: a, glow: lit > 0 && t < S.scan1 ? 18 : 0 });
      }
    }
    say(LN.one, 540, ROWB, 58, S.one + 0.1, S.gap - 0.3, t);

    // ---- b05 gap: the gut line, the real line, the chasm ----
    if (t >= S.gap && t < S.membrane + 1) {
      const out = 1 - ease.in(prog(t, S.membrane, S.membrane + 0.6));
      const yR = scy(rowY(3.5), c), yG = scy(rowY(19.5), c), xa = scx(GRID.x0 - 26, c), xb = scx(GRID.x0 + 24 * PIT + 26, c);
      const kE = ease.inOut(prog(t, S.gap + 0.5, S.gap + 1.2)), kR = ease.inOut(prog(t, S.gap + 1.8, S.gap + 2.4));
      const pulse = 0.75 + 0.25 * Math.sin(t * 5);
      hline(xa, lerp(xa, xb, kE), yG, C.ember, out * pulse, { w: 3, dash: [14, 10], glow: 14 });
      hline(xa, lerp(xa, xb, kR), yR, C.gold, out, { w: 3, glow: 16 });
      mono('50%', xb + 12, yG + 11, 32, { color: C.ember, alpha: out * kE });
      mono('10%', xb + 12, yR + 11, 32, { color: C.gold, alpha: out * kR });
      say(LN.gut, 540, yG - 34, 44, S.gap + 0.7, S.membrane, t, { color: C.ember, glow: 10 });
      say(LN.real, 540, yR + 66, 44, S.gap + 2.0, S.membrane, t, { color: C.gold, glow: 10 });
      // the measure of the gap: an arrow from the real line down to the gut line
      const ka = ease.inOut(prog(t, S.gap + 3.1, S.gap + 4.4));
      if (ka > 0) {
        const ya = yR + 96, yb = yG - 92, ye = lerp(ya, yb, ka);
        ctx.save(); ctx.globalAlpha *= out * 0.9; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(540, ya); ctx.lineTo(540, ye); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(530, ya + 12); ctx.lineTo(540, ya); ctx.lineTo(550, ya + 12); ctx.stroke();
        if (ka > 0.97) { ctx.beginPath(); ctx.moveTo(530, yb - 12); ctx.lineTo(540, yb); ctx.lineTo(550, yb - 12); ctx.stroke(); }
        ctx.restore();
      }
    }

    // ---- b06 ----
    say(LN.need, 540, 450, 68, S.need + 0.1, S.membrane + 0.1, t, { highlight: ['五成'], hiColor: C.ember });
    if (LN.info) say(LN.info, 540, 330, 46, S.membrane + 0.3, S.rare - 0.2, t, { color: C.dim, weight: 400, glow: 0 });
    if (LN.ratio) {
      const parts = LN.ratio.split(/(?<=，)/);
      parts.forEach((p, k) => say(p, 540, 412 + k * 70, 52, S.membrane + 1.0 + k * 0.9, S.rare - 0.2, t, { highlight: ['9 倍'], hiColor: C.gold }));
    }
    if (mem && mem.cr < 0.6) {
      const a = mem.aIn * (1 - prog(mem.cr, 0, 0.5));
      mono('×9', mem.x1 + 8, mem.y + 14, 40, { color: '#e8f0ff', alpha: a, glow: 12, glowColor: '#9fc4ff' });
      if (mem.cr > 0 && mem.cr < 0.35) {                       // crack flashes
        const fl = 1 - mem.cr / 0.35;
        [0.17, 0.33, 0.52, 0.64, 0.81].forEach((u, k) => {
          const x = lerp(mem.x0, mem.x1, u), r = rng(k + 3);
          ctx.save(); ctx.globalAlpha *= fl; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowColor = '#bcd6ff'; ctx.shadowBlur = 14;
          ctx.beginPath(); let yy = mem.y - 34; ctx.moveTo(x, yy); while (yy < mem.y + 34) { yy += 9; ctx.lineTo(x + (r() - 0.5) * 14, yy); } ctx.stroke(); ctx.restore();
        });
      }
    }
    if (t >= S.result && t < S.rare + 1.5) {
      const out = 1 - ease.in(prog(t, S.rare + 0.1, S.rare + 0.7)), Pp = B.PILE, cP = c;
      const ng = countLE(B.gPile, t), ns = countLE(B.sPile, t), a = ease.out(prog(t, S.result + 0.2, S.result + 0.6)) * out;
      const yTop = scy(Pp.y - 5 * PIT - 40, cP), xg = scx(Pp.gx, cP), xs = scx(Pp.sx, cP);
      mono(String(ng), xg, yTop, 76, { align: 'center', color: C.gold, alpha: a, glow: 14 });
      mono(String(ns), xs, yTop, 76, { align: 'center', color: '#cfd8e6', alpha: a });
      mono(':', 540, yTop - 6, 76, { align: 'center', color: C.dim, alpha: a * ease.out(prog(t, S.result + 1.0, S.result + 1.5)) });
      const fa = ease.out(prog(t, S.result + 1.9, S.result + 2.4)) * out, yB = scy(Pp.y + 5 * PIT + 20, cP) + 34;
      mono('90 / 100', xg, yB, 34, { align: 'center', color: C.gold, alpha: fa * 0.8, weight: 400 });
      mono('90 / 900', xs, yB, 34, { align: 'center', color: '#aab6c8', alpha: fa * 0.8, weight: 400 });
      const pk = prog(t, S.result + 2.5, S.result + 2.95);
      if (pk > 0) {
        const s = lerp(1.3, 1, ease.outExpo(pk)), yP = yB + 190;
        ctx.save(); ctx.translate(540, yP); ctx.scale(s, s);
        mono('50%', 0, 0, 150, { align: 'center', color: C.ember, alpha: clamp(pk * 3) * out, glow: 24 });
        ctx.restore();
      }
    }
    say(LN.rare, 540, 450, 68, S.rare + 0.15, S.cam0 - 0.15, t, { od: 0.5 });
  }

  // ---------------------------------------------------------------- cues (absolute → local)
  function cuesAll(api) {
    const S = times(api), B = beadData(S), R = rain(S), out = [];
    out.push({ t: S.fact + 0.7, type: 'chip' });
    out.push({ t: S.fall + 0.15, type: 'whoosh', dur: 1.2 });
    out.push({ t: R.firstTc, type: 'ticks', dur: +(R.lastTc - R.firstTc).toFixed(3), n: N, p0: 0.15, p1: 0.85 });
    out.push({ t: S.count, type: 'punch' });
    out.push({ t: S.scan0, type: 'sweep', dur: S.scan1 - S.scan0 });
    out.push({ t: B.goldTp[0], type: 'ticks', dur: +(B.goldTp[99] - B.goldTp[0]).toFixed(3), n: 100, p0: 0.5, p1: 1 });
    out.push({ t: S.one + 0.1, type: 'chip' });
    out.push({ t: S.gather + 0.15, type: 'gather', dur: 2.4 });
    out.push({ t: S.gap, type: 'hush' });
    out.push({ t: S.gap + 0.5, type: 'click' });
    out.push({ t: S.gap + 1.8, type: 'chip' });
    out.push({ t: S.gap + 3.1, type: 'swell', dur: 1.3 });
    out.push({ t: S.need, type: 'riser', dur: S.membrane + 0.7 - S.need });
    out.push({ t: S.mem0, type: 'sweep', dur: S.mem1 - S.mem0 });
    out.push({ t: B.gSurvTm[0], type: 'ticks', dur: +(B.gSurvTm[89] - B.gSurvTm[0]).toFixed(3), n: 90, p0: 0.6, p1: 0.8 });
    out.push({ t: B.sSurvTm[0], type: 'ticks', dur: +(B.sSurvTm[89] - B.sSurvTm[0]).toFixed(3), n: 90, p0: 0.3, p1: 0.5 });
    out.push({ t: S.result + 0.2, type: 'gather', dur: 2.2 });
    out.push({ t: S.result + 2.5, type: 'punch' });
    out.push({ t: S.rare + 0.35, type: 'shatter' });
    out.push({ t: S.rare + 0.6, type: 'whoosh', dur: 1.4 });
    out.push({ t: S.rare + 1.0, type: 'gather', dur: 2.3 });
    out.push({ t: S.end - 0.7, type: 'resolve' });
    return out.map(c => ({ ...c, t: +(c.t - api.beat.start).toFixed(3) }));
  }

  const def = { draw(ctx, V, lt, api) { drawAll(V, lt, api); }, cues(V, api) { return cuesAll(api); } };
  T.register('thousand', def);
  T.register('baserate', def);
  T.register('nine', def);
})();
