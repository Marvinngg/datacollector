/* games1.js — game-theory diagram templates (part 1). Every frame is a pure function of lt.
 *
 *   matrix     {rowPlayer, colPlayer, rows[], cols[], cells[r][c]=[row result, col result], better?,
 *               steps:[{show:'frame'} {show:'cells', stagger} {show:'compare-col', col, pick} {show:'compare-row', row, pick}
 *                      {show:'dominant', player:'row'|'col', index, label} {show:'equilibrium', cell, label?}
 *                      {show:'optimum', cell, label, neqDelay?}]}
 *              big payoff table. In every cell the row player's result sits lower-left (gold), the column player's
 *              upper-right (teal). Best responses get circled in the player's colour; equilibrium = ember frame,
 *              optimum = ok frame, and "≠" between their side labels. Works across a ref chain.
 *   tree       {root, children:[{label, children:[{label, value}]}], steps:[{show:'grow'} {show:'backward', best}]}
 *              horizontal game tree; backward induction (opponent minimises, root maximises), captions
 *              V.forward/V.backward (defaults 向前展望 / 向后推理).
 *   crossroad  {matrix:{rows, cols, cells, rowPlayer?, colPlayer?}, question?, eqLabel?,
 *               steps:[{show:'cars'} {show:'equilibria', cells:[[r,c]..]} {show:'question'}]}
 *   nyc        {pins[], answer, time, caption?, steps:[{show:'scatter'} {show:'converge'}]}
 *   rps        {names?:[石头,剪刀,布], title?, sub?, note?, steps:[{show:'habit'} {show:'mixed'}]}
 *   dough      {steps:[{show:'minimax', year, name, note?} {show:'knead', year, name, note?}], fixedLabel?, eqLabel?}
 */
(function () {
  const { P, F, clamp, lerp, prog, ease, text, measure, rng } = K;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers
  const win = (t, a, b, fi = 0.4, fo = 0.4) => (b - a < fi + fo ? Math.max(0, Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b))) : K.window(t, a, b, fi, fo));
  const bump = (t, a, d) => { const k = prog(t, a, a + d); return k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0; };
  const ep = (t, a, d = 0.6, e = ease.out) => e(prog(t, a, a + d));
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  function alpha(ctx, a, fn) { if (a <= 0.002) return; ctx.save(); ctx.globalAlpha *= Math.min(1, a); fn(); ctx.restore(); }
  function rrLen(w, h, r) { return 2 * (w + h) - 8 * r + TAU * r; }
  /** stroke a rounded rect, revealed clockwise to fraction p */
  function strokeRR(ctx, x, y, w, h, r, p, color, lw = 3, glow = 0) {
    if (p <= 0) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    const L = rrLen(w, h, r); if (p < 1) ctx.setLineDash([L * p, L + 1]);
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke(); ctx.restore();
  }
  function fillRR(ctx, x, y, w, h, r, color) { ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.restore(); }
  /** stroke the first fraction p of a polyline; returns the end point and heading */
  function poly(ctx, pts, p) {
    const seg = []; let L = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
    let rem = L * clamp(p); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    let end = pts[0], ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
    for (let i = 1; i < pts.length; i++) {
      const d = seg[i - 1], a = pts[i - 1], b = pts[i];
      ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (rem >= d) { ctx.lineTo(b[0], b[1]); rem -= d; end = b; }
      else { const k = d ? rem / d : 0; end = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; ctx.lineTo(end[0], end[1]); break; }
    }
    ctx.stroke(); return { x: end[0], y: end[1], ang };
  }
  function bez(a, c, b, n = 28) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return o; }
  function head(ctx, x, y, ang, s, color) {
    ctx.save(); ctx.fillStyle = color; ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-s, -s * 0.55); ctx.lineTo(-s * 0.7, 0); ctx.lineTo(-s, s * 0.55); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function arrow(ctx, pts, p, color, lw = 3, hs = 16, glow = 0) {
    if (p <= 0) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    const e = poly(ctx, pts, p); head(ctx, e.x, e.y, e.ang, hs, color); ctx.restore();
  }
  function checkMark(ctx, x, y, s, color, p, lw = 5) {
    if (p <= 0) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    poly(ctx, [[x - s * 0.5, y], [x - s * 0.12, y + s * 0.38], [x + s * 0.55, y - s * 0.42]], p); ctx.restore();
  }
  function cross(ctx, x, y, s, color, p, lw = 5) {
    if (p <= 0) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    poly(ctx, [[x - s / 2, y - s / 2], [x + s / 2, y + s / 2]], clamp(p * 2));
    if (p > 0.5) poly(ctx, [[x + s / 2, y - s / 2], [x - s / 2, y + s / 2]], clamp(p * 2 - 1));
    ctx.restore();
  }
  /** multi-colour text on one baseline: segs [{t, color, weight?}] */
  function rich(segs, x, y, o = {}) {
    const ws = segs.map(s => measure(s.t, { ...o, weight: s.weight || o.weight }));
    const tot = ws.reduce((a, b) => a + b, 0);
    let cx = o.align === 'center' ? x - tot / 2 : o.align === 'right' ? x - tot : x;
    segs.forEach((s, i) => { text(s.t, cx, y, { ...o, align: 'left', color: s.color, weight: s.weight || o.weight }); cx += ws[i]; });
    return tot;
  }
  const ownLine = (s, api) => (s && s.owner === api.beat.id && s.at != null ? api.line(s.at) : null);

  // ---------------------------------------------------------------- payoff table (shared by matrix, crossroad)
  function parseM(V) {
    const M = V.matrix ? { ...V, ...V.matrix } : V;
    const rows = M.rows || ['A', 'B'], cols = M.cols || ['A', 'B'];
    return { rp: M.rowPlayer || '甲', cp: M.colPlayer || '乙', rows, cols, cells: M.cells || rows.map(() => cols.map(() => ['', ''])), better: M.better || 'higher' };
  }
  const cX = (G, c) => G.x0 + c * G.cw, cY = (G, r) => G.y0 + r * G.ch;
  const numPos = (G, r, c, w) => w === 0 ? [cX(G, c) + G.cw * 0.3, cY(G, r) + G.ch * 0.68] : [cX(G, c) + G.cw * 0.7, cY(G, r) + G.ch * 0.33];

  /** o: fp (frame 0..1), cellP(r,c), cellA(r,c), numA(r,c,w), numS(r,c,w), rowHi(i), colHi(j) */
  function drawTable(ctx, G, M, o) {
    const nR = M.rows.length, nC = M.cols.length, fp = o.fp;
    const w = nC * G.cw, h = nR * G.ch, cx = G.x0 + w / 2, cy = G.y0 + h / 2;
    // cell backgrounds
    alpha(ctx, ease.out(prog(fp, 0, 0.6)), () => {
      for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) fillRR(ctx, cX(G, c) + 3, cY(G, r) + 3, G.cw - 6, G.ch - 6, 8, rgba('#10151e', 0.72 * o.cellA(r, c) + 0.1));
    });
    // grid lines grow from the centre
    ctx.save(); ctx.strokeStyle = 'rgba(233,228,216,0.34)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i <= nR; i++) { const y = G.y0 + i * G.ch; ctx.beginPath(); ctx.moveTo(cx - w / 2 * fp, y); ctx.lineTo(cx + w / 2 * fp, y); ctx.stroke(); }
    for (let j = 0; j <= nC; j++) { const x = G.x0 + j * G.cw; ctx.beginPath(); ctx.moveTo(x, cy - h / 2 * fp); ctx.lineTo(x, cy + h / 2 * fp); ctx.stroke(); }
    ctx.restore();
    // headers
    const ha = ease.out(prog(fp, 0.35, 1));
    alpha(ctx, ha, () => {
      const rowW = Math.max(...M.rows.map(s => measure(s, { size: G.hs, weight: 500 })));
      for (let j = 0; j < nC; j++) {
        const x = cX(G, j) + G.cw / 2, y = G.y0 - G.hs * 0.62, hi = o.colHi(j);
        text(M.cols[j], x, y, { size: G.hs, weight: 500, color: P.ink, align: 'center', alpha: 1 - hi });
        text(M.cols[j], x, y, { size: G.hs, weight: 700, color: P.teal, align: 'center', alpha: hi });
      }
      for (let i = 0; i < nR; i++) {
        const x = G.x0 - G.hs * 0.55, y = cY(G, i) + G.ch / 2, hi = o.rowHi(i);
        text(M.rows[i], x, y, { size: G.hs, weight: 500, color: P.ink, align: 'right', baseline: 'middle', alpha: 1 - hi });
        text(M.rows[i], x, y, { size: G.hs, weight: 700, color: P.gold, align: 'right', baseline: 'middle', alpha: hi });
      }
      // player brackets + names
      ctx.save(); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      const by = G.y0 - G.hs * 1.85; ctx.strokeStyle = rgba(P.teal, 0.7);
      ctx.beginPath(); ctx.moveTo(G.x0 + 14, by + 10); ctx.lineTo(G.x0 + 14, by); ctx.lineTo(G.x0 + w - 14, by); ctx.lineTo(G.x0 + w - 14, by + 10); ctx.stroke();
      const bx = G.x0 - G.hs * 0.55 - rowW - G.hs * 0.55; ctx.strokeStyle = rgba(P.gold, 0.7);
      ctx.beginPath(); ctx.moveTo(bx + 10, G.y0 + 14); ctx.lineTo(bx, G.y0 + 14); ctx.lineTo(bx, G.y0 + h - 14); ctx.lineTo(bx + 10, G.y0 + h - 14); ctx.stroke();
      ctx.restore();
      text(M.cp, cx, by - G.ps * 0.38, { size: G.ps, weight: 700, color: P.teal, align: 'center' });
      text(M.rp, bx - G.ps * 0.4, cy, { size: G.ps, weight: 700, color: P.gold, align: 'right', baseline: 'middle' });
    });
    // cell contents
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
      const cp = o.cellP(r, c); if (cp <= 0) continue;
      const ca = o.cellA(r, c), x = cX(G, c), y = cY(G, r);
      alpha(ctx, cp * ca, () => {
        ctx.save(); ctx.strokeStyle = 'rgba(233,228,216,0.09)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + 16, y + 16); ctx.lineTo(x + 16 + (G.cw - 32) * cp, y + 16 + (G.ch - 32) * cp); ctx.stroke(); ctx.restore();
        for (let wv = 0; wv < 2; wv++) {
          const [nx, ny] = numPos(G, r, c, wv), s = o.numS(r, c, wv), rise = (1 - cp) * 14;
          alpha(ctx, o.numA(r, c, wv), () => {
            ctx.save(); ctx.translate(nx, ny + rise); ctx.scale(s, s);
            text(String((M.cells[r] && M.cells[r][c] || ['', ''])[wv]), 0, 0, { size: G.fs, weight: 500, color: wv ? P.teal : P.gold, align: 'center', baseline: 'middle' });
            ctx.restore();
          });
        }
      });
    }
    return { w, h, cx, cy };
  }
  function pill(ctx, G, M, r, c, wv, p, color) {
    const [nx, ny] = numPos(G, r, c, wv);
    const tw = measure(String(M.cells[r][c][wv]), { size: G.fs, weight: 500 });
    const pw = tw + G.fs * 0.75, ph = G.fs * 1.3;
    strokeRR(ctx, nx - pw / 2, ny - ph / 2 - 2, pw, ph, ph / 2, p, color, Math.max(2.5, G.fs / 16));
  }

  // ---------------------------------------------------------------- matrix
  const MG = { x0: 490, y0: 318, cw: 400, ch: 222, fs: 56, hs: 42, ps: 52 };

  function matrixState(V, api) {
    const M = parseM(V), S = api.steps, nR = M.rows.length, nC = M.cols.length;
    const iF = api.find(s => s.show === 'frame');
    const iC = api.find(s => s.show === 'cells');
    // cell reveal times: follow the narration line when it is long, else the stagger
    const cellT = M.rows.map(() => M.cols.map(() => (iF >= 0 ? S[iF].lt + 0.8 : -1e9)));
    if (iC >= 0) {
      const s = S[iC], n = nR * nC, st = s.stagger == null ? 0.6 : s.stagger, L = ownLine(s, api);
      const span = L ? L.end - s.lt : 0;
      const fr = (L && span > n * st * 1.6) ? (n === 4 ? [0.14, 0.38, 0.5, 0.76] : Array.from({ length: n }, (_, k) => 0.12 + 0.7 * k / Math.max(1, n - 1))) : null;
      let k = 0;
      for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++, k++) cellT[r][c] = fr ? s.lt + fr[k] * span : s.lt + k * st;
    }
    const pills = {};  // "r,c,w" -> time
    const setPill = (r, c, w, t) => { const key = r + ',' + c + ',' + w; pills[key] = Math.min(pills[key] == null ? 1e9 : pills[key], t); };
    const comps = [], doms = [], eqs = {}, opts = [];
    S.forEach((s, i) => {
      if (s.show === 'compare-col' || s.show === 'compare-row') {
        const nxt = S.find(z => z.lt > s.lt + 1e-3);
        const end = Math.min(nxt ? nxt.lt : 1e9, s.lt + 3.2);
        comps.push({ s, i, end, col: s.show === 'compare-col' });
        if (s.show === 'compare-col') setPill(s.pick, s.col, 0, s.lt + 1.1); else setPill(s.row, s.pick, 1, s.lt + 1.1);
      }
    });
    S.forEach(s => {
      if (s.show === 'dominant') {
        doms.push(s);
        if (s.player === 'col') M.rows.forEach((_, r) => setPill(r, s.index, 1, s.lt + 0.3 * r));
        else M.cols.forEach((_, c) => setPill(s.index, c, 0, s.lt + 0.3 * c));
      }
      if (s.show === 'equilibrium' && s.cell) {
        const key = s.cell.join(',');
        const e = eqs[key] || (eqs[key] = { cell: s.cell, t: s.lt, label: null, lt: null, owner: s.owner });
        if (s.label && e.label == null) { e.label = s.label; e.lt = s.lt; }
      }
      if (s.show === 'optimum' && s.cell) opts.push(s);
    });
    const labelTs = Object.values(eqs).filter(e => e.label).map(e => e.lt).concat(opts.map(o => o.lt));
    const focusT = labelTs.length ? Math.min(...labelTs) : 1e9;
    return { M, S, iF, iC, cellT, pills, comps, doms, eqs: Object.values(eqs), opts, focusT, nR, nC };
  }

  function drawMatrix(ctx, V, lt, api) {
    const st = matrixState(V, api), { M, S, nR, nC } = st, G = MG;
    const fp = st.iF < 0 ? 1 : ease.inOut(prog(lt, S[st.iF].lt, S[st.iF].lt + 1.1));
    const cellA = M.rows.map(() => M.cols.map(() => 1));
    const numA = M.rows.map(() => M.cols.map(() => [1, 1]));
    const numS = M.rows.map(() => M.cols.map(() => [1, 1]));
    const arrows = [];
    // comparisons: focus one column (or row), compare the chooser's two results, circle the better one
    for (const cm of st.comps) {
      const s = cm.s, t0 = s.lt, fw = win(lt, t0, cm.end, 0.4, 0.5), res = prog(lt, t0 + 1.1, t0 + 1.5);
      if (fw <= 0 && lt < t0) continue;
      for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
        const inLine = cm.col ? c === s.col : r === s.row;
        if (!inLine) cellA[r][c] *= 1 - 0.7 * fw;
        else {
          numA[r][c][cm.col ? 1 : 0] *= 1 - 0.62 * fw;
          const mine = cm.col ? r : c;
          if (mine !== s.pick) numA[r][c][cm.col ? 0 : 1] *= 1 - 0.5 * fw * res;
        }
      }
      const pr = s.pick, pc = cm.col ? s.col : s.pick;
      const wv = cm.col ? 0 : 1;
      numS[cm.col ? pr : s.row][cm.col ? s.col : pr][wv] *= 1 + 0.14 * bump(lt, t0 + 1.0, 0.7);
      const ap = ease.inOut(prog(lt, t0 + 0.45, t0 + 1.1));
      const n = cm.col ? nR : nC;
      for (let k = 0; k < n; k++) {
        if (k === s.pick) continue;
        const a = cm.col ? numPos(G, k, s.col, 0) : numPos(G, s.row, k, 1);
        const b = cm.col ? numPos(G, s.pick, s.col, 0) : numPos(G, s.row, s.pick, 1);
        arrows.push({ a, b, p: ap, al: fw, color: cm.col ? P.gold : P.teal, col: cm.col });
      }
      void pc;
    }
    // optimum contrast: dim the cells that are neither equilibrium nor optimum
    for (const o of st.opts) {
      const k = ep(lt, o.lt, 0.8, ease.inOut);
      for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
        const keep = (o.cell[0] === r && o.cell[1] === c) || st.eqs.some(e => e.cell[0] === r && e.cell[1] === c);
        if (!keep) cellA[r][c] *= 1 - 0.62 * k;
      }
    }
    const bandFade = 1 - ease.inOut(prog(lt, st.focusT, st.focusT + 0.8));
    const domP = (player, idx) => Math.max(0, ...st.doms.filter(d => (d.player === 'col') === (player === 'col') && d.index === idx).map(d => ep(lt, d.lt, 0.8, ease.inOut)));

    // dominant bands (fill under the numbers)
    for (const d of st.doms) {
      const p = ep(lt, d.lt, 0.8, ease.inOut) * bandFade; if (p <= 0) continue;
      const col = d.player === 'col', c = col ? P.teal : P.gold;
      const x = col ? cX(G, d.index) - 10 : G.x0 - 10, y = col ? G.y0 - 10 : cY(G, d.index) - 10;
      const w = col ? G.cw + 20 : nC * G.cw + 20, h = col ? nR * G.ch + 20 : G.ch + 20;
      fillRR(ctx, x, y, w, h, 16, rgba(c, 0.07 * p));
    }
    drawTable(ctx, G, M, {
      fp, cellP: (r, c) => ep(lt, st.cellT[r][c], 0.55), cellA: (r, c) => cellA[r][c],
      numA: (r, c, w) => numA[r][c][w], numS: (r, c, w) => numS[r][c][w],
      rowHi: i => domP('row', i), colHi: j => domP('col', j),
    });
    // best-response circles
    for (const key in st.pills) {
      const [r, c, w] = key.split(',').map(Number), t = st.pills[key];
      const p = ease.inOut(prog(lt, t, t + 0.55)); if (p <= 0) continue;
      alpha(ctx, cellA[r][c], () => pill(ctx, G, M, r, c, w, p, w ? P.teal : P.gold));
    }
    // comparison arrows
    for (const a of arrows) {
      if (a.al <= 0 || a.p <= 0) continue;
      const dir = a.col ? Math.sign(a.b[1] - a.a[1]) : Math.sign(a.b[0] - a.a[0]);
      const pts = a.col ? [[a.a[0], a.a[1] + dir * 38], [a.b[0], a.b[1] - dir * 40]] : [[a.a[0] + dir * 70, a.a[1]], [a.b[0] - dir * 72, a.b[1]]];
      alpha(ctx, a.al, () => arrow(ctx, pts, a.p, a.color, 4, 18));
    }
    // dominant band outlines
    for (const d of st.doms) {
      const p = ep(lt, d.lt, 0.9, ease.inOut), f = bandFade; if (p <= 0 || f <= 0) continue;
      const col = d.player === 'col', c = col ? P.teal : P.gold;
      const x = col ? cX(G, d.index) - 10 : G.x0 - 10, y = col ? G.y0 - 10 : cY(G, d.index) - 10;
      const w = col ? G.cw + 20 : nC * G.cw + 20, h = col ? nR * G.ch + 20 : G.ch + 20;
      alpha(ctx, f, () => strokeRR(ctx, x, y, w, h, 16, p, rgba(c, 0.85), 3));
    }
    // equilibrium frames (ember) and optimum frames (ok)
    for (const e of st.eqs) {
      const k = ep(lt, e.t, 0.7); if (k <= 0) continue;
      const [r, c] = e.cell, x = cX(G, c), y = cY(G, r);
      ctx.save(); const s = lerp(1.16, 1, k), mx = x + G.cw / 2, my = y + G.ch / 2;
      ctx.translate(mx, my); ctx.scale(s, s); ctx.translate(-mx, -my);
      alpha(ctx, k, () => { fillRR(ctx, x + 10, y + 10, G.cw - 20, G.ch - 20, 16, rgba(P.ember, 0.07)); strokeRR(ctx, x + 10, y + 10, G.cw - 20, G.ch - 20, 16, 1, P.ember, 5, 16); });
      ctx.restore();
      const pu = prog(lt, e.t + 0.45, e.t + 1.5);
      if (pu > 0 && pu < 1) { const g = 1 + 0.12 * ease.out(pu); alpha(ctx, 0.5 * (1 - pu), () => strokeRR(ctx, mx - (G.cw - 20) * g / 2, my - (G.ch - 20) * g / 2, (G.cw - 20) * g, (G.ch - 20) * g, 16, 1, P.ember, 3)); }
    }
    for (const o of st.opts) {
      const k = ease.inOut(prog(lt, o.lt, o.lt + 0.9)); if (k <= 0) continue;
      const [r, c] = o.cell, x = cX(G, c), y = cY(G, r);
      fillRR(ctx, x + 10, y + 10, G.cw - 20, G.ch - 20, 16, rgba(P.ok, 0.07 * k));
      strokeRR(ctx, x + 10, y + 10, G.cw - 20, G.ch - 20, 16, k, P.ok, 5, 14);
    }

    // ---------------- side column
    const sx = G.x0 + nC * G.cw + 46, rowMid = r => cY(G, r) + G.ch / 2;
    // reasoning log for the comparisons
    const firstDom = st.doms.length ? Math.min(...st.doms.map(d => d.lt)) : 1e9;
    const logA = 1 - ep(lt, firstDom, 0.5, ease.inOut);
    if (st.comps.length && logA > 0) {
      const c0 = st.comps[0];
      alpha(ctx, logA * ep(lt, c0.s.lt, 0.5), () => text(`站在${c0.col ? M.rp : M.cp}的角度`, sx, G.y0 + 62, { size: 32, weight: 500, color: c0.col ? P.gold : P.teal }));
      st.comps.forEach((cm, k) => {
        const s = cm.s, a = logA * ep(lt, s.lt + 1.15, 0.5); if (a <= 0) return;
        const segs = cm.col
          ? [{ t: M.cp + M.cols[s.col], color: P.teal }, { t: '  →  ', color: P.dim }, { t: M.rp + M.rows[s.pick], color: P.gold, weight: 700 }]
          : [{ t: M.rp + M.rows[s.row], color: P.gold }, { t: '  →  ', color: P.dim }, { t: M.cp + M.cols[s.pick], color: P.teal, weight: 700 }];
        alpha(ctx, a, () => rich(segs, sx + (1 - ep(lt, s.lt + 1.15, 0.5)) * 14, G.y0 + 118 + k * 52, { size: 32, weight: 500 }));
      });
    }
    // dominant labels
    const labFade = 1 - ep(lt, st.focusT, 0.6, ease.inOut);
    for (const d of st.doms) {
      const a = ep(lt, d.lt + 0.35, 0.6) * labFade; if (a <= 0 || !d.label) continue;
      const col = d.player === 'col', c = col ? P.teal : P.gold, name = col ? M.cols[d.index] : M.rows[d.index];
      const slide = (1 - ep(lt, d.lt + 0.35, 0.6)) * 14;
      alpha(ctx, a, () => {
        if (col) {
          const x = cX(G, d.index) + G.cw / 2, y = G.y0 + nR * G.ch + 50 - slide;
          text(d.label, x, y, { size: 32, weight: 500, color: c, align: 'center' });
          text(name, x, y + 48, { size: 42, weight: 700, color: c, align: 'center' });
        } else {
          const y = rowMid(d.index);
          text(d.label, sx + slide, y - 10, { size: 32, weight: 500, color: c });
          text(name, sx + slide, y + 42, { size: 46, weight: 700, color: c });
        }
      });
    }
    // equilibrium / optimum labels: title + both results
    const tag = (r, c, label, color, t) => {
      const a = ep(lt, t, 0.6); if (a <= 0) return;
      const y = rowMid(r), sl = (1 - a) * 16, cell = M.cells[r][c];
      alpha(ctx, a, () => {
        text(label, sx + sl, y + 4, { size: 52, family: F.serif, weight: 600, color });
        rich([{ t: String(cell[0]), color: P.gold }, { t: '  ·  ', color: P.dim }, { t: String(cell[1]), color: P.teal }], sx + sl + 2, y + 54, { size: 32, weight: 500 });
      });
    };
    for (const e of st.eqs) if (e.label) tag(e.cell[0], e.cell[1], e.label, P.ember, e.lt + 0.2);
    for (const o of st.opts) if (o.label) tag(o.cell[0], o.cell[1], o.label, P.ok, o.lt + 0.3);
    // "≠" between equilibrium and optimum
    const eqL = st.eqs.find(e => e.label);
    for (const o of st.opts) {
      if (!eqL || eqL.cell[0] === o.cell[0]) continue;
      const t = o.lt + (o.neqDelay == null ? 3.0 : o.neqDelay), a = ep(lt, t, 0.7); if (a <= 0) continue;
      const y = (rowMid(eqL.cell[0]) + rowMid(o.cell[0])) / 2 + 28, s = lerp(1.3, 1, ease.out(prog(lt, t, t + 0.7)));
      alpha(ctx, a, () => { ctx.save(); ctx.translate(sx + 88, y - 22); ctx.scale(s, s); text('≠', 0, 22, { size: 76, family: F.mono, weight: 400, color: P.ink, align: 'center' }); ctx.restore(); });
    }
  }

  T.register('matrix', {
    draw: drawMatrix,
    cues(V, api) {
      const st = matrixState(V, api), out = [], S = api.steps;
      if (st.iF >= 0) out.push({ t: S[st.iF].lt, type: 'tick' });
      if (st.iC >= 0) for (const row of st.cellT) for (const t of row) out.push({ t, type: 'tick' });
      for (const cm of st.comps) out.push({ t: cm.s.lt + 1.1, type: 'click' });
      for (const d of st.doms) out.push({ t: d.lt + 0.2, type: 'pop' });
      for (const e of st.eqs) { out.push({ t: e.t, type: 'pop' }); if (e.label && e.lt > e.t + 0.1) out.push({ t: e.lt + 0.2, type: 'chime' }); }
      for (const o of st.opts) { out.push({ t: o.lt, type: 'pop' }); out.push({ t: o.lt + (o.neqDelay == null ? 3.0 : o.neqDelay), type: 'chime' }); }
      return out;
    },
  });

  // ---------------------------------------------------------------- tree
  function treeModel(V) {
    const nodes = [], edges = [];
    const rootIn = { label: V.root, children: V.children || [] };
    const depthOf = n => (n.children && n.children.length ? 1 + Math.max(...n.children.map(depthOf)) : 0);
    const D = Math.max(1, depthOf(rootIn));
    let leafCount = 0; const countLeaves = n => (n.children && n.children.length ? n.children.forEach(countLeaves) : leafCount++); countLeaves(rootIn);
    const xl = 380, xr = 1300, yt = 232, yb = 800;
    let li = 0;
    function build(n, d, parent) {
      const node = { d, parent, kids: [], edge: parent ? n.label : null, value: n.value, raw: n };
      nodes.push(node);
      if (n.children && n.children.length) {
        for (const c of n.children) node.kids.push(build(c, d + 1, node));
        node.y = node.kids.reduce((s, k) => s + k.y, 0) / node.kids.length;
        node.x = xl + d * (xr - xl) / D;
      } else {
        node.leaf = true; node.x = xr; node.y = leafCount > 1 ? lerp(yt, yb, li / (leafCount - 1)) : (yt + yb) / 2; li++;
      }
      if (parent) edges.push({ a: parent, b: node });
      return node;
    }
    const root = build(rootIn, 0, null);
    root.label = V.root;
    // internal nodes: a shared first word of the children's labels ("他 a", "他 b") becomes the node's name
    for (const n of nodes) {
      if (n === root || n.leaf) continue;
      const parts = n.kids.map(k => String(k.edge || '').split(/\s+/));
      if (parts.every(p => p.length > 1 && p[0] === parts[0][0])) { n.label = n.raw.who || parts[0][0]; n.kids.forEach((k, i) => { k.edge = parts[i].slice(1).join(' '); }); }
      else n.label = n.raw.who || '';
    }
    const num = v => { const x = parseFloat(String(v).replace('−', '-').replace('+', '')); return isNaN(x) ? 0 : x; };
    // backward induction: even depth (root's player) maximises, odd depth minimises
    function solve(n) {
      if (n.leaf) { n.val = num(n.value); n.disp = String(n.value); return n.val; }
      const vs = n.kids.map(solve);
      const max = n.d % 2 === 0; let bi = 0;
      vs.forEach((v, i) => { if (max ? v > vs[bi] : v < vs[bi]) bi = i; });
      if (n === root && V.best != null) bi = V.best;
      n.choice = bi; n.val = vs[bi]; n.disp = n.kids[bi].disp; return n.val;
    }
    solve(root);
    const R = n => (n.d === 0 ? 46 : 36);
    return { nodes, edges, root, D, R };
  }
  const nodeColor = n => (n.d % 2 === 0 ? P.gold : P.teal);
  function treeTimes(V, api) {
    const S = api.steps, ig = api.find(s => s.show === 'grow'), ib = api.find(s => s.show === 'backward');
    const tg = ig >= 0 ? S[ig].lt : -1e9, tb = ib >= 0 ? S[ib].lt : 1e9;
    const best = ib >= 0 && S[ib].best != null ? S[ib].best : V.best;
    return { tg, tb, best };
  }
  const tagDock = (n, R) => [n.x, n.y - R(n) - 34];

  T.register('tree', {
    draw(ctx, V, lt, api) {
      const { tg, tb, best } = treeTimes(V, api);
      const tm = treeModel({ ...V, best }), { nodes, edges, root, D, R } = tm;
      const appear = n => (n.d === 0 ? tg : tg + 0.35 + (n.d - 1) * 1.0 + 0.55);
      const edgeT = e => tg + 0.35 + (e.b.d - 1) * 1.0;
      const b0 = tb + D * 0.9 + 0.4;
      const levelT = d => b0 + (D - 1 - d) * 1.45;       // when nodes at depth d make their choice
      // dim unchosen branches once decided
      const dimOf = n => { let a = 1; for (let m = n; m.parent; m = m.parent) { const p = m.parent; if (p.choice != null && p.kids[p.choice] !== m) a = Math.min(a, 1 - 0.6 * ep(lt, levelT(p.d) + 0.8, 0.6)); } return a; };
      const pathEnd = levelT(0) + 1.0;
      // edges
      for (const e of edges) {
        const t = edgeT(e), p = ease.inOut(prog(lt, t, t + 0.6)); if (p <= 0) continue;
        const a = e.a, b = e.b, bx = b.leaf ? b.x : b.x - R(b), ax = a.x + R(a) * 0.9;
        const ang = Math.atan2(b.y - a.y, bx - ax);
        const x1 = a.x + Math.cos(ang) * R(a), y1 = a.y + Math.sin(ang) * R(a);
        const x2 = b.leaf ? b.x : b.x - Math.cos(ang) * R(b), y2 = b.leaf ? b.y : b.y - Math.sin(ang) * R(b);
        const dim = dimOf(b);
        alpha(ctx, dim, () => {
          ctx.save(); ctx.strokeStyle = 'rgba(233,228,216,0.4)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
          poly(ctx, [[x1, y1], [x2, y2]], p); ctx.restore();
          // forward sweep: a light runs outward along every edge
          const fs = prog(lt, tb + (b.d - 1) * 0.9, tb + b.d * 0.9);
          if (fs > 0 && fs < 1) {
            const k0 = Math.max(0, fs - 0.28), k1 = fs, al = Math.sin(Math.PI * fs);
            ctx.save(); ctx.strokeStyle = rgba(P.ink, 0.85 * al); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.shadowColor = P.ink; ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.moveTo(lerp(x1, x2, k0), lerp(y1, y2, k0)); ctx.lineTo(lerp(x1, x2, k1), lerp(y1, y2, k1)); ctx.stroke(); ctx.restore();
          }
          // chosen edge: drawn back from child to parent in the chooser's colour
          if (a.choice != null && a.kids[a.choice] === b) {
            const cp = ease.inOut(prog(lt, levelT(a.d), levelT(a.d) + 0.6));
            if (cp > 0) { ctx.save(); ctx.strokeStyle = nodeColor(a); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.shadowColor = nodeColor(a); ctx.shadowBlur = 10; poly(ctx, [[x2, y2], [x1, y1]], cp); ctx.restore(); }
            const gp = ep(lt, pathEnd, 0.8, ease.inOut);
            if (gp > 0 && onPath(b)) { ctx.save(); ctx.strokeStyle = rgba(P.ok, 0.28 * gp); ctx.lineWidth = 18; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore(); }
          }
          // edge label
          if (b.edge) {
            const la = ep(lt, t + 0.3, 0.5), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, nx = Math.sin(ang), ny = -Math.cos(ang);
            const isBest = a === root && a.kids[a.choice] === b, okA = isBest ? ep(lt, pathEnd, 0.6) : 0;
            alpha(ctx, la, () => {
              const x = mx + nx * 28, y = my + ny * 28;
              text(b.edge, x, y, { size: a === root ? 40 : 32, weight: 700, color: nodeColor(a), align: 'center', baseline: 'middle', alpha: 1 - okA });
              text(b.edge, x, y, { size: a === root ? 40 : 32, weight: 700, color: P.ok, align: 'center', baseline: 'middle', alpha: okA });
            });
          }
        });
      }
      function onPath(n) { for (let m = n; m.parent; m = m.parent) if (m.parent.kids[m.parent.choice] !== m) return false; return true; }
      // nodes
      for (const n of nodes) {
        const t = appear(n), k = ease.outBack(prog(lt, t, t + 0.5)); if (k <= 0) continue;
        const dim = dimOf(n);
        alpha(ctx, dim * clamp(k), () => {
          if (n.leaf) {
            const bw = 118, bh = 62, x = n.x, y = n.y, neg = n.val < 0;
            ctx.save(); ctx.translate(x + bw / 2, y); ctx.scale(k, k);
            fillRR(ctx, -bw / 2, -bh / 2, bw, bh, 12, 'rgba(16,21,30,0.9)'); strokeRR(ctx, -bw / 2, -bh / 2, bw, bh, 12, 1, 'rgba(233,228,216,0.35)', 2);
            text(n.disp, 0, 2, { size: 40, family: F.mono, weight: 700, color: neg ? P.red : P.ink, align: 'center', baseline: 'middle' });
            ctx.restore();
          } else {
            const c = nodeColor(n), r = R(n);
            ctx.save(); ctx.translate(n.x, n.y); ctx.scale(k, k);
            K.dot(0, 0, r, rgba(c, 0.16)); K.ring(0, 0, r, c, { lineWidth: 3 });
            if (n.label) text(n.label, 0, 2, { size: n.d === 0 ? 40 : 32, weight: 700, color: c, align: 'center', baseline: 'middle' });
            ctx.restore();
          }
        });
      }
      // backed-up values travel from the chosen child to the chooser
      for (const n of nodes) {
        if (n.leaf || n.choice == null) continue;
        const t = levelT(n.d), k = ease.inOut(prog(lt, t + 0.2, t + 1.0)); if (k <= 0) continue;
        const ch = n.kids[n.choice], from = ch.leaf ? [ch.x + 59, ch.y] : tagDock(ch, R), to = tagDock(n, R);
        const x = lerp(from[0], to[0], k), y = lerp(from[1], to[1], k) - Math.sin(Math.PI * k) * 30;
        const c = nodeColor(n), neg = n.val < 0;
        alpha(ctx, dimOf(n) * clamp(k * 3), () => {
          fillRR(ctx, x - 46, y - 24, 92, 48, 24, 'rgba(10,13,19,0.92)'); strokeRR(ctx, x - 46, y - 24, 92, 48, 24, 1, c, 2.5);
          text(n.disp, x, y + 1, { size: 32, family: F.mono, weight: 700, color: neg ? P.red : P.ink, align: 'center', baseline: 'middle' });
        });
      }
      // final check at the root's chosen branch
      const bc = root.kids[root.choice];
      if (bc) {
        const ang = Math.atan2(bc.y - root.y, bc.x - root.x), mx = (root.x + bc.x) / 2 + Math.sin(ang) * 28, my = (root.y + bc.y) / 2 - Math.cos(ang) * 28;
        const w = measure(String(bc.edge || ''), { size: 40, weight: 700 });
        checkMark(ctx, mx + w / 2 + 34, my - 2, 32, P.ok, ease.out(prog(lt, pathEnd + 0.2, pathEnd + 0.7)));
      }
      // captions
      const fw = V.forward || '向前展望', bw = V.backward || '向后推理';
      const ca = ep(lt, tb, 0.6), cb = ep(lt, b0, 0.6);
      alpha(ctx, ca, () => { text(fw, 150, 222, { size: 44, family: F.serif, weight: 600, color: P.ink }); const w = measure(fw, { size: 44, family: F.serif, weight: 600 }); arrow(ctx, [[160 + w, 206], [160 + w + 70 * ca, 206]], 1, P.ink, 3, 14); });
      alpha(ctx, cb, () => { const w = measure(bw, { size: 44, family: F.serif, weight: 600 }); text(bw, 240, 292, { size: 44, family: F.serif, weight: 600, color: P.ember }); arrow(ctx, [[230, 276], [230 - 70 * cb, 276]], 1, P.ember, 3, 14); void w; });
    },
    cues(V, api) {
      const { tg, tb, best } = treeTimes(V, api), tm = treeModel({ ...V, best }), out = [];
      if (tg > -1e8) for (let d = 0; d <= tm.D; d++) out.push({ t: d === 0 ? tg : tg + 0.35 + (d - 1) + 0.55, type: 'tick' });
      if (tb < 1e8) {
        out.push({ t: tb, type: 'whoosh', dur: tm.D * 0.9 });
        const b0 = tb + tm.D * 0.9 + 0.4;
        for (let d = tm.D - 1; d >= 0; d--) out.push({ t: b0 + (tm.D - 1 - d) * 1.45, type: 'click' });
        out.push({ t: b0 + (tm.D - 1) * 1.45 + 1.2, type: 'chime' });
      }
      return out;
    },
  });

  // ---------------------------------------------------------------- crossroad
  const XG = { x0: 1260, y0: 390, cw: 190, ch: 120, fs: 32, hs: 34, ps: 38 };
  function car(ctx, x, y, ang, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    fillRR(ctx, -60, -31, 120, 62, 16, color); ctx.shadowBlur = 0;
    fillRR(ctx, 6, -23, 30, 46, 7, 'rgba(10,13,19,0.55)');   // windscreen (front = +x)
    fillRR(ctx, -44, -22, 22, 44, 6, 'rgba(10,13,19,0.35)');  // rear window
    K.dot(56, -19, 4.5, P.ink); K.dot(56, 19, 4.5, P.ink);
    ctx.restore();
  }
  T.register('crossroad', {
    draw(ctx, V, lt, api) {
      const S = api.steps, M = parseM(V);
      const ic = api.find(s => s.show === 'cars'), ie = api.find(s => s.show === 'equilibria'), iq = api.find(s => s.show === 'question');
      const tc = ic >= 0 ? S[ic].lt : 0, te = ie >= 0 ? S[ie].lt : 1e9, tq = iq >= 0 ? S[iq].lt : 1e9;
      const cx = 600, cy = 515, rw = 170;
      // scene (clipped to the safe area)
      ctx.save(); ctx.beginPath(); ctx.rect(140, 150, 930, 730); ctx.clip();
      const ra = ep(lt, tc - 0.3, 0.8);
      alpha(ctx, ra, () => {
        const gh = ctx.createLinearGradient(140, 0, 1070, 0);
        gh.addColorStop(0, 'rgba(233,228,216,0)'); gh.addColorStop(0.15, 'rgba(233,228,216,0.06)'); gh.addColorStop(0.85, 'rgba(233,228,216,0.06)'); gh.addColorStop(1, 'rgba(233,228,216,0)');
        ctx.fillStyle = gh; ctx.fillRect(140, cy - rw / 2, 930, rw);
        const gv = ctx.createLinearGradient(0, 150, 0, 880);
        gv.addColorStop(0, 'rgba(233,228,216,0)'); gv.addColorStop(0.15, 'rgba(233,228,216,0.06)'); gv.addColorStop(0.85, 'rgba(233,228,216,0.06)'); gv.addColorStop(1, 'rgba(233,228,216,0)');
        ctx.fillStyle = gv; ctx.fillRect(cx - rw / 2, 150, rw, 730);
        ctx.fillStyle = 'rgba(233,228,216,0.035)'; ctx.fillRect(cx - rw / 2, cy - rw / 2, rw, rw);
        // kerbs
        ctx.strokeStyle = 'rgba(233,228,216,0.32)'; ctx.lineWidth = 2.5;
        const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
        seg(170, cy - rw / 2, cx - rw / 2, cy - rw / 2); seg(cx + rw / 2, cy - rw / 2, 1040, cy - rw / 2);
        seg(170, cy + rw / 2, cx - rw / 2, cy + rw / 2); seg(cx + rw / 2, cy + rw / 2, 1040, cy + rw / 2);
        seg(cx - rw / 2, 170, cx - rw / 2, cy - rw / 2); seg(cx + rw / 2, 170, cx + rw / 2, cy - rw / 2);
        seg(cx - rw / 2, cy + rw / 2, cx - rw / 2, 870); seg(cx + rw / 2, cy + rw / 2, cx + rw / 2, 870);
        // centre dashes
        ctx.strokeStyle = 'rgba(233,228,216,0.22)'; ctx.lineWidth = 3; ctx.setLineDash([22, 20]);
        seg(170, cy, cx - rw / 2 - 20, cy); seg(cx + rw / 2 + 20, cy, 1040, cy); seg(cx, 170, cx, cy - rw / 2 - 20); seg(cx, cy + rw / 2 + 20, cx, 870);
        ctx.setLineDash([]);
        // stop lines
        ctx.strokeStyle = 'rgba(233,228,216,0.45)'; ctx.lineWidth = 5;
        seg(cx - rw / 2 - 12, cy + 6, cx - rw / 2 - 12, cy + rw / 2 - 6); seg(cx + 6, cy + rw / 2 + 12, cx + rw / 2 - 6, cy + rw / 2 + 12);
      });
      // cars glide in and stop at the line; at the question they each nudge forward, hesitating
      const k = ease.out(prog(lt, tc, tc + 2.0));
      const nudge = (t) => bump(lt, t, 0.9) * 14;
      const gx = lerp(40, cx - rw / 2 - 20 - 62, k) + nudge(tq + 0.4), gy = cy + rw / 4 + 2;
      const tx = cx + rw / 4 - 2, ty = lerp(1000, cy + rw / 2 + 20 + 62, k) - nudge(tq + 1.1);
      if (lt > tc - 0.1) {
        car(ctx, gx, gy, 0, P.gold); car(ctx, tx, ty, -Math.PI / 2, P.teal);
        const la = ep(lt, tc + 1.4, 0.6);
        alpha(ctx, la, () => {
          text(M.rp, gx, gy + 76, { size: 36, weight: 700, color: P.gold, align: 'center' });
          text(M.cp, tx + 70, ty + 12, { size: 36, weight: 700, color: P.teal, align: 'left', baseline: 'middle' });
        });
      }
      ctx.restore();
      // big question mark over the crossing
      const qa = ep(lt, tq, 0.7);
      alpha(ctx, qa, () => {
        const s = lerp(0.7, 1, ease.outBack(prog(lt, tq, tq + 0.7)));
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
        text('?', 0, 6, { size: 170, family: F.serif, weight: 600, color: P.ember, align: 'center', baseline: 'middle', glow: 24 });
        ctx.restore();
      });
      // small matrix with the two equilibria
      const fa = ease.inOut(prog(lt, te, te + 0.8));
      if (fa > 0) {
        drawTable(ctx, XG, M, {
          fp: fa, cellP: (r, c) => ep(lt, te + 0.3 + 0.15 * (r * 2 + c), 0.45), cellA: () => 1, numA: () => 1, numS: () => 1, rowHi: () => 0, colHi: () => 0,
        });
        const cells = (ie >= 0 && S[ie].cells) || [];
        cells.forEach(([r, c], i) => {
          const t = te + 1.2 + i * 0.55, kk = ep(lt, t, 0.6); if (kk <= 0) return;
          const x = cX(XG, c), y = cY(XG, r);
          fillRR(ctx, x + 6, y + 6, XG.cw - 12, XG.ch - 12, 12, rgba(P.ember, 0.08 * kk));
          strokeRR(ctx, x + 6, y + 6, XG.cw - 12, XG.ch - 12, 12, ease.inOut(kk), P.ember, 4, 12);
        });
        const la = ep(lt, te + 1.2 + cells.length * 0.55, 0.6);
        alpha(ctx, la, () => text(V.eqLabel || `${cells.length === 2 ? '两' : cells.length}个均衡`, XG.x0 + XG.cw, XG.y0 + 2 * XG.ch + 62, { size: 40, family: F.serif, weight: 600, color: P.ember, align: 'center' }));
      }
      alpha(ctx, ep(lt, tq + 0.3, 0.7), () => text(V.question || '到底谁冲？', XG.x0 + XG.cw, XG.y0 + 2 * XG.ch + 160, { size: 60, family: F.serif, weight: 600, color: P.ink, align: 'center' }));
    },
    cues(V, api) {
      const S = api.steps, out = [];
      S.forEach(s => {
        if (s.show === 'cars') out.push({ t: s.lt, type: 'whoosh', dur: 2.0 });
        if (s.show === 'equilibria') { out.push({ t: s.lt, type: 'tick' }); (s.cells || []).forEach((_, i) => out.push({ t: s.lt + 1.2 + i * 0.55, type: 'pop' })); }
        if (s.show === 'question') out.push({ t: s.lt, type: 'pop' });
      });
      return out;
    },
  });

  // ---------------------------------------------------------------- nyc
  const NYC = { S: [585, 800], N: [1000, 175], hw: 128 };
  const nycAxis = (() => { const dx = NYC.N[0] - NYC.S[0], dy = NYC.N[1] - NYC.S[1], L = Math.hypot(dx, dy); return { d: [dx, dy], e: [-dy / L, dx / L], L }; })();
  // east = right of travel when heading north
  const east = nycAxis.e;
  const uv = (u, v) => [NYC.S[0] + nycAxis.d[0] * u + east[0] * v * NYC.hw, NYC.S[1] + nycAxis.d[1] * u + east[1] * v * NYC.hw];
  const PIN_UV = { '自由女神像': [-0.14, -1.95], '帝国大厦': [0.35, -0.08], '时代广场': [0.45, -0.45], '中央车站': [0.44, 0.45], '中央公园': [0.68, 0], '华尔街': [0.06, 0.1], '布鲁克林大桥': [0.1, 0.9] };
  const halfW = u => (u < 0.34 ? 0.28 + 0.72 * Math.sin(u / 0.34 * Math.PI / 2) : u < 0.74 ? 1 : 1 - 0.5 * Math.pow((u - 0.74) / 0.26, 1.4));
  let islandCache = null;
  function island() {
    if (islandCache) return islandCache;
    const pts = [];
    for (let i = 0; i <= 60; i++) { const u = i / 60; pts.push(uv(u, halfW(u) * (1 + 0.07 * (K.fbm(u * 5, 3.1, 3) - 0.5)))); }
    for (let a = 0; a <= 8; a++) { const ang = a / 8 * Math.PI; pts.push(uv(1 + 0.03 * Math.sin(ang), halfW(1) * Math.cos(ang))); }
    for (let i = 60; i >= 0; i--) { const u = i / 60; pts.push(uv(u, -halfW(u) * (1 + 0.07 * (K.fbm(u * 5, 9.7, 3) - 0.5)))); }
    for (let a = 0; a <= 8; a++) { const ang = a / 8 * Math.PI; pts.push(uv(-0.035 * Math.sin(ang), -halfW(0) * Math.cos(ang))); }
    return (islandCache = pts);
  }
  function nycModel(V) {
    const pins = (V.pins || []).map((name, i, arr) => {
      const q = PIN_UV[name] || [0.1 + 0.8 * i / Math.max(1, arr.length - 1), i % 2 ? 0.5 : -0.5];
      const [x, y] = uv(q[0], q[1]);
      return { name, x, y, left: q[1] < 0, ans: name === V.answer };
    });
    const ansPin = pins.find(p => p.ans) || pins[0];
    const r = rng(41), people = [];
    const N = 72;
    for (let i = 0; i < N; i++) {
      const pi = Math.floor(r() * pins.length), pin = pins[pi];
      // scatter on the side away from the pin's label
      const a = (r() < 0.5 ? -1 : 1) * Math.PI / 2 + (r() - 0.5) * 1.4, d = 24 + Math.sqrt(r()) * 40;
      people.push({ x: pin.x + Math.cos(a) * d, y: pin.y + Math.sin(a) * d * 0.9, stay: r() < 0.13 && !pin.ans, delay: r() * 1.6, ph: r() * TAU });
    }
    let k = 0;
    for (const p of people) {
      if (p.stay) continue;
      const rr = 6.4 * Math.sqrt(k + 1.5), th = k * 2.39996; k++;
      p.tx = ansPin.x + Math.cos(th) * rr; p.ty = ansPin.y + Math.sin(th) * rr;
    }
    return { pins, ansPin, people, clusterR: 6.4 * Math.sqrt(k + 1.5) };
  }
  T.register('nyc', {
    draw(ctx, V, lt, api) {
      const S = api.steps, is = api.find(s => s.show === 'scatter'), ic = api.find(s => s.show === 'converge');
      const ts = is >= 0 ? S[is].lt : 0, tc = ic >= 0 ? S[ic].lt : 1e9;
      const { pins, ansPin, people, clusterR } = nycModel(V);
      // map
      const ma = ep(lt, ts - 0.4, 0.9);
      alpha(ctx, ma, () => {
        const pts = island();
        ctx.save(); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
        ctx.fillStyle = 'rgba(233,228,216,0.045)'; ctx.fill();
        ctx.strokeStyle = 'rgba(233,228,216,0.42)'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.clip();
        ctx.strokeStyle = 'rgba(233,228,216,0.07)'; ctx.lineWidth = 1.5;
        for (let u = 0; u <= 1.02; u += 0.028) { const a = uv(u, -1.3), b = uv(u, 1.3); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        for (let v = -1; v <= 1.01; v += 0.25) { const a = uv(0, v), b = uv(1.05, v); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        // central park
        const c = [uv(0.59, -0.34), uv(0.59, 0.34), uv(0.77, 0.34), uv(0.77, -0.34)];
        ctx.beginPath(); c.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
        ctx.fillStyle = rgba(P.ok, 0.08); ctx.fill(); ctx.strokeStyle = rgba(P.ok, 0.25); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
        // liberty island
        const lp = pins.find(p => p.name === '自由女神像');
        if (lp) { K.dot(lp.x, lp.y, 20, 'rgba(233,228,216,0.045)'); K.ring(lp.x, lp.y, 20, 'rgba(233,228,216,0.42)', { lineWidth: 2 }); }
        if (V.city !== '') text(V.city || 'NEW YORK', uv(0.95, 0)[0] + 90, uv(0.95, 0)[1] - 20, { size: 24, family: F.mono, color: P.dim, spacing: 6 });
      });
      const conv = ep(lt, tc, 0.8, ease.inOut);
      // pins
      pins.forEach((p, i) => {
        const a = ep(lt, ts + 0.3 + i * 0.25, 0.5); if (a <= 0) return;
        const hi = p.ans ? ep(lt, tc + 2.6, 0.6) : 0, dimO = p.ans ? 1 : 1 - 0.45 * conv;
        alpha(ctx, a * dimO, () => {
          K.dot(p.x, p.y, 8, p.ans ? (hi > 0.5 ? P.ember : P.ink) : P.ink);
          K.ring(p.x, p.y, 13, 'rgba(233,228,216,0.5)', { lineWidth: 2 });
          const lx = p.left ? p.x - 28 : p.x + 28;
          text(p.name, lx, p.y, { size: 30, weight: p.ans ? 700 : 500, color: P.ink, align: p.left ? 'right' : 'left', baseline: 'middle', alpha: 1 - hi });
          if (hi > 0) text(p.name, lx + (p.left ? 0 : clusterR - 10) * hi, p.y, { size: 34, weight: 700, color: P.ember, align: p.left ? 'right' : 'left', baseline: 'middle', alpha: hi });
        });
      });
      // people
      for (const p of people) {
        const a = ep(lt, ts + 0.6 + p.delay * 0.8, 0.5); if (a <= 0) continue;
        const dr = 3 * Math.sin(lt * 0.6 + p.ph), dr2 = 3 * Math.cos(lt * 0.5 + p.ph * 1.3);
        let x = p.x + dr, y = p.y + dr2, al = 0.9;
        if (p.stay) al = 0.9 - 0.5 * conv;
        else {
          const k = ease.inOut(prog(lt, tc + 0.3 + p.delay, tc + 2.1 + p.delay));
          x = lerp(x, p.tx, k); y = lerp(y, p.ty, k);
        }
        K.dot(x, y, 5.5, P.warm, { alpha: a * al });
      }
      // halo, clock and time
      const ha = ep(lt, tc + 2.6, 0.8);
      alpha(ctx, ha, () => K.ring(ansPin.x, ansPin.y, clusterR + 14, P.ember, { lineWidth: 3 }));
      const ck = ep(lt, tc + 3.0, 0.8), cx = 1420, cy = 400, R = 118;
      alpha(ctx, ck, () => {
        ctx.save(); ctx.strokeStyle = rgba(P.ember, 0.55); ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(ansPin.x + clusterR + 18, ansPin.y - 8); ctx.lineTo(cx - R - 16, cy + 40); ctx.stroke(); ctx.restore();
        K.dot(cx, cy, R, 'rgba(16,21,30,0.9)');
        K.ring(cx, cy, R, P.ink, { lineWidth: 4 }); K.ring(cx, cy, R + 10, rgba(P.ember, 0.5), { lineWidth: 2 });
        ctx.save(); ctx.strokeStyle = P.ink; ctx.lineCap = 'round';
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.lineWidth = i % 3 ? 2.5 : 5; const r0 = i % 3 ? R - 16 : R - 24; ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); ctx.lineTo(cx + Math.sin(a) * (R - 6), cy - Math.cos(a) * (R - 6)); ctx.stroke(); }
        // hands sweep to the target time
        const [hh, mm] = String(V.time || '12:00').split(':').map(Number);
        const sw = ease.inOut(prog(lt, tc + 3.0, tc + 4.6));
        const minA = ((mm || 0) / 60 - 1.6 * (1 - sw)) * TAU, hrA = (((hh || 0) % 12) / 12 + (mm || 0) / 720 - 1.6 * (1 - sw) / 12) * TAU;
        ctx.strokeStyle = P.ink; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(hrA) * R * 0.5, cy - Math.cos(hrA) * R * 0.5); ctx.stroke();
        ctx.strokeStyle = P.ember; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(minA) * R * 0.78, cy - Math.cos(minA) * R * 0.78); ctx.stroke();
        ctx.restore(); K.dot(cx, cy, 8, P.ember);
      });
      const tt = ep(lt, tc + 4.2, 0.7);
      alpha(ctx, tt, () => {
        text(V.time || '12:00', cx, cy + R + 96, { size: 80, family: F.mono, weight: 700, color: P.ink, align: 'center' });
        text(V.caption || `大多数人的答案：${V.answer || ''}`, cx, cy + R + 156, { size: 32, weight: 500, color: P.ember, align: 'center' });
      });
    },
    cues(V, api) {
      const out = [];
      for (const s of api.steps) {
        if (s.show === 'scatter') out.push({ t: s.lt + 0.3, type: 'tick' });
        if (s.show === 'converge') { out.push({ t: s.lt + 0.3, type: 'whoosh', dur: 3.2 }); out.push({ t: s.lt + 3.0, type: 'pop' }); out.push({ t: s.lt + 4.4, type: 'chime' }); }
      }
      return out;
    },
  });

  // ---------------------------------------------------------------- rps
  function rpsIcon(ctx, kind, x, y, s, color, a = 1) {
    alpha(ctx, a, () => {
      ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(3, s * 0.08); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (kind === 0) {         // rock: a rounded stone
        const r = rng(5); ctx.beginPath();
        for (let i = 0; i < 9; i++) { const ang = i / 9 * TAU, rr = s * (0.72 + 0.16 * r()); const px = Math.cos(ang) * rr * 1.08, py = Math.sin(ang) * rr * 0.86; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.closePath(); ctx.globalAlpha *= 0.9; ctx.fill();
        ctx.strokeStyle = 'rgba(10,13,19,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-s * 0.35, -s * 0.2); ctx.lineTo(-s * 0.05, -s * 0.34); ctx.stroke();
      } else if (kind === 2) {  // paper: a sheet with a folded corner
        const w = s * 1.25, h = s * 1.55, f = s * 0.4;
        ctx.fillStyle = rgba(color, 0.16);
        ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2 - f, -h / 2); ctx.lineTo(w / 2, -h / 2 + f); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w / 2 - f, -h / 2); ctx.lineTo(w / 2 - f, -h / 2 + f); ctx.lineTo(w / 2, -h / 2 + f); ctx.stroke();
        ctx.lineWidth = Math.max(2, s * 0.05);
        for (let i = 0; i < 3; i++) { const yy = -h * 0.12 + i * h * 0.2; ctx.beginPath(); ctx.moveTo(-w * 0.3, yy); ctx.lineTo(w * 0.3, yy); ctx.stroke(); }
      } else {                  // scissors: two blades and two rings
        ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.25); ctx.lineTo(s * 0.45, -s * 0.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.25); ctx.lineTo(-s * 0.45, -s * 0.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(-s * 0.42, s * 0.52, s * 0.28, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 0.42, s * 0.52, s * 0.28, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    });
  }
  T.register('rps', {
    draw(ctx, V, lt, api) {
      const S = api.steps, ih = api.find(s => s.show === 'habit'), im = api.find(s => s.show === 'mixed');
      const th = ih >= 0 ? S[ih].lt : 0, tm = im >= 0 ? S[im].lt : 1e9;
      const names = V.names || ['石头', '剪刀', '布'];   // 0 rock, 1 scissors, 2 paper
      const kinds = [0, 1, 2];
      // ---- habit: you always throw rock, the opponent learns and throws paper
      const out = 1 - ep(lt, tm, 0.6, ease.inOut);
      if (out > 0) alpha(ctx, out, () => {
        const opp = V.opponent || [1, 0, 2, 2, 2, 2], n = opp.length, x0 = 520, dx = 200, y1 = 350, y2 = 590, yr = 750;
        const la = ep(lt, th, 0.6);
        alpha(ctx, la, () => {
          text(V.you || '你', 330, y1, { size: 48, weight: 700, color: P.gold, align: 'right', baseline: 'middle' });
          text(V.them || '对手', 330, y2, { size: 48, weight: 700, color: P.teal, align: 'right', baseline: 'middle' });
          text(V.habitLabel || `总出${names[0]}`, 330, y1 + 56, { size: 28, weight: 500, color: P.dim, align: 'right', baseline: 'middle' });
        });
        const res = (a, b) => (a === b ? 0 : (a === 0 && b === 1) || (a === 1 && b === 2) || (a === 2 && b === 0) ? 1 : -1);
        let firstSeen = -1;
        for (let i = 0; i < n; i++) {
          const t = th + 0.5 + i * 0.85, x = x0 + i * dx;
          const a1 = ep(lt, t, 0.4), a2 = ep(lt, t + 0.3, 0.4), a3 = ep(lt, t + 0.55, 0.4);
          if (a1 <= 0) continue;
          const r = res(0, opp[i]);
          if (r < 0 && firstSeen < 0) firstSeen = i;
          rpsIcon(ctx, 0, x, y1 - (1 - a1) * 16, 50, r < 0 && a3 > 0 ? P.gold : P.gold, a1 * (r < 0 ? 1 - 0.45 * a3 : 1));
          rpsIcon(ctx, kinds[opp[i]], x, y2 + (1 - a2) * 16, 50, P.teal, a2);
          alpha(ctx, a2, () => text(names[opp[i]], x, y2 + 76, { size: 26, weight: 500, color: P.dim, align: 'center' }));
          if (r < 0) cross(ctx, x, yr, 36, P.red, a3);
          else if (r > 0) checkMark(ctx, x, yr, 40, P.ok, a3);
          else alpha(ctx, a3, () => { ctx.save(); ctx.strokeStyle = P.dim; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 16, yr); ctx.lineTo(x + 16, yr); ctx.stroke(); ctx.restore(); });
        }
        // "seen through" marker before the first loss
        if (firstSeen > 0) {
          const t = th + 0.5 + firstSeen * 0.85 - 0.15, a = ep(lt, t, 0.5), x = x0 + (firstSeen - 0.5) * dx;
          alpha(ctx, a, () => {
            ctx.save(); ctx.strokeStyle = rgba(P.teal, 0.6); ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
            ctx.beginPath(); ctx.moveTo(x, y1 - 70); ctx.lineTo(x, yr + 40); ctx.stroke(); ctx.restore();
            text(V.seen || '看穿了', x + 14, y1 - 78, { size: 30, weight: 700, color: P.teal });
          });
        }
        const tl = th + 0.5 + n * 0.85 + 0.3;
        alpha(ctx, ep(lt, tl, 0.6), () => text(V.lose || '被针对', x0 + (n - 1) * dx + 110, yr + 12, { size: 44, family: F.serif, weight: 600, color: P.red, baseline: 'middle' }));
      });
      // ---- mixed: the cycle of beats, each option one third
      const inA = ep(lt, tm + 0.3, 0.7);
      if (inA > 0) {
        const cx = 780, cy = 540, R = 270;
        const pos = [[cx, cy - R], [cx + R * 0.866, cy + R * 0.5], [cx - R * 0.866, cy + R * 0.5]];   // rock, scissors, paper
        const col = [P.blue, P.warm, P.teal].map(() => P.ink);
        kinds.forEach((k, i) => {
          const a = ep(lt, tm + 0.3 + i * 0.15, 0.6); const [x, y] = pos[i];
          rpsIcon(ctx, k, x, y, 52, col[i], a);
          const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy);
          alpha(ctx, a, () => text(names[k], cx + dx / L * (R + 96), cy + dy / L * (R + 96) + 10, { size: 32, weight: 500, color: P.ink, align: 'center', baseline: 'middle' }));
        });
        // arrows: A → B means A beats B (rock→scissors→paper→rock)
        for (let i = 0; i < 3; i++) {
          const a = pos[i], b = pos[(i + 1) % 3], p = ease.inOut(prog(lt, tm + 0.9 + i * 0.25, tm + 1.6 + i * 0.25));
          const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
          const s = [a[0] + ux * 92, a[1] + uy * 92], e = [b[0] - ux * 92, b[1] - uy * 92];
          const m = [(s[0] + e[0]) / 2 + uy * 34, (s[1] + e[1]) / 2 - ux * 34];
          arrow(ctx, bez(s, m, e), p, rgba(P.ink, 0.55), 3, 16);
        }
        alpha(ctx, ep(lt, tm + 1.8, 0.6), () => text(V.beatsLegend || '箭头 = 克制', cx, cy + R * 0.5 + 150, { size: 26, weight: 500, color: P.dim, align: 'center' }));
        // equal thirds
        const pr = 88, sw = ease.inOut(prog(lt, tm + 1.8, tm + 2.9));
        if (sw > 0) {
          for (let i = 0; i < 3; i++) {
            const a0 = -Math.PI / 2 + i * TAU / 3, a1 = a0 + TAU / 3 * sw;
            ctx.save(); ctx.fillStyle = rgba(P.gold, [0.55, 0.38, 0.24][i]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, pr, a0, a1); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = P.bg; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
            const am = a0 + TAU / 6;
            alpha(ctx, ep(lt, tm + 2.6, 0.5), () => text('1/3', cx + Math.cos(am) * pr * 0.56, cy + Math.sin(am) * pr * 0.56, { size: 28, family: F.mono, weight: 700, color: P.ink, align: 'center', baseline: 'middle' }));
          }
        }
        const tx = 1300;
        alpha(ctx, ep(lt, tm + 2.6, 0.7), () => text(V.title || '混合策略', tx, 420, { size: 72, family: F.serif, weight: 600, color: P.ok }));
        alpha(ctx, ep(lt, tm + 3.1, 0.7), () => rich([{ t: V.sub || '每样各出 ', color: P.ink }, { t: '1/3', color: P.gold, weight: 700 }], tx, 500, { size: 40, weight: 500 }));
        alpha(ctx, ep(lt, tm + 3.6, 0.7), () => { text(V.note || '对手无从针对', tx, 570, { size: 32, weight: 500, color: P.dim }); rich([{ t: '期望 = ', color: P.dim }, { t: '0', color: P.ink, weight: 700 }], tx, 622, { size: 32, weight: 500, family: F.sans }); });
      }
    },
    cues(V, api) {
      const out = [], opp = V.opponent || [1, 0, 2, 2, 2, 2];
      for (const s of api.steps) {
        if (s.show === 'habit') opp.forEach((o, i) => { const t = s.lt + 0.5 + i * 0.85; out.push({ t, type: 'tick' }); if (o === 2) out.push({ t: t + 0.55, type: 'thud' }); });
        if (s.show === 'mixed') { out.push({ t: s.lt + 0.9, type: 'swish' }); out.push({ t: s.lt + 1.8, type: 'count', dur: 1.1 }); out.push({ t: s.lt + 2.6, type: 'chime' }); }
      }
      return out;
    },
  });

  // ---------------------------------------------------------------- dough
  const DC = { x: 1270, y: 520, r: 215 }, FIX = { x: 1225, y: 552 };
  // "thumb presses": gaussian pushes that wander over the dough
  function presses(px, py, tau) {
    let dx = 0, dy = 0;
    for (let k = 0; k < 3; k++) {
      const ang = 0.55 * tau * (k % 2 ? -1 : 1) + k * 2.1, cx = DC.x + Math.cos(ang) * 120, cy = DC.y + Math.sin(ang) * 105;
      const g = Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / (2 * 85 * 85)), dir = ang + Math.PI / 2 + 0.6 * Math.sin(tau * 0.8 + k);
      const A = 58 * (0.6 + 0.4 * Math.sin(1.3 * tau + k * 1.7));
      dx += A * g * Math.cos(dir); dy += A * g * Math.sin(dir);
    }
    return [dx, dy];
  }
  function doughMap(px, py, tau, amp) {
    // a smooth, tear-free deformation that always keeps FIX in place
    const [ux, uy] = presses(px, py, tau), [fx, fy] = presses(FIX.x, FIX.y, tau);
    px += amp * (ux - fx); py += amp * (uy - fy);
    let qx = px - FIX.x, qy = py - FIX.y;
    const r2 = qx * qx + qy * qy;
    const tw = amp * (0.95 * Math.sin(0.85 * tau)) * Math.exp(-r2 / (2 * 150 * 150));        // twist, strongest near the centre
    let c = Math.cos(tw), s = Math.sin(tw); [qx, qy] = [c * qx - s * qy, s * qx + c * qy];
    const ph = 0.35 * tau, st = 1 + amp * 0.16 * Math.sin(0.7 * tau + 1.2);                // stretch along a turning axis
    c = Math.cos(ph); s = Math.sin(ph);
    let ax = c * qx + s * qy, ay = -s * qx + c * qy; ax *= st; ay /= st;
    qx = c * ax - s * ay; qy = s * ax + c * ay;
    const fk = amp * 0.0011 * Math.sin(1.05 * tau + 2.0), fd = 0.5 * tau + 0.7;              // fold: quadratic, zero at FIX
    const rr = qx * qx + qy * qy; qx += fk * rr * Math.cos(fd) * 0.5; qy += fk * rr * Math.sin(fd) * 0.5;
    return [FIX.x + qx, FIX.y + qy];
  }
  const doughTimes = (s, api) => { const L = ownLine(s, api), d = L ? L.end - s.lt : 11; return { d, show: s.lt + 0.36 * d, go: s.lt + 0.44 * d, fix: s.lt + 0.64 * d, nash: s.lt + 0.86 * d }; };
  T.register('dough', {
    draw(ctx, V, lt, api) {
      const S = api.steps, iM = api.find(s => s.show === 'minimax'), iK = api.find(s => s.show === 'knead');
      const sM = iM >= 0 ? S[iM] : null, sK = iK >= 0 ? S[iK] : null;
      const tM = sM ? sM.lt : 1e9, tK = sK ? sK.lt : 1e9;
      // ---- headline column: year + name (cross-fades between the two steps)
      const headline = (s, a, dy) => alpha(ctx, a, () => {
        text(String(s.year || ''), 190, 380 + dy, { size: 130, family: F.mono, weight: 300, color: P.ink });
        const nm = String(s.name || '').split(/\s+·\s+/);
        text(nm[0] || '', 196, 470 + dy, { size: 50, family: F.serif, weight: 600, color: P.gold });
        if (nm.length > 1) text(nm.slice(1).join(' · '), 196, 540 + dy, { size: 40, family: F.serif, weight: 400, color: P.ink });
        if (s.note) text(s.note, 196, 610 + dy, { size: 30, weight: 400, color: P.dim });
      });
      const kx = ep(lt, tK, 0.8, ease.inOut);
      if (sM) headline(sM, ep(lt, tM, 0.7) * (1 - kx), -kx * 30 + (1 - ep(lt, tM, 0.7)) * 20);
      if (sK) headline(sK, kx, (1 - kx) * 30);
      // ---- minimax diagram: the row player's floor rises, the column player's ceiling falls, they meet
      if (sM) {
        const L = ownLine(sM, api), d = L ? L.end - sM.lt : 7.8;
        const t1 = tM + 0.14 * d, t2 = tM + 0.44 * d, t3 = tM + 0.58 * d, t4 = tM + 0.74 * d;
        const fade = 1 - 0.7 * kx - 0.3 * (sK ? ep(lt, doughTimes(sK, api).show, 0.8) : 0);
        alpha(ctx, ep(lt, t1 - 0.3, 0.6) * fade, () => {
          const ax = 1110, yTop = 210, yBot = 800, ym = 505, gap = 70;
          ctx.save(); ctx.strokeStyle = 'rgba(233,228,216,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, yBot); ctx.lineTo(ax, yTop); ctx.stroke(); ctx.restore();
          head(ctx, ax, yTop - 4, -Math.PI / 2, 14, 'rgba(233,228,216,0.35)');
          text(V.axis || '收益', ax - 16, yTop + 10, { size: 26, weight: 500, color: P.dim, align: 'right' });
          const g = ease.inOut(prog(lt, t1, t1 + 1.6)), cl = ease.inOut(prog(lt, t3, t3 + 1.1));
          const gy = lerp(yBot - 20, lerp(ym + gap, ym + 6, cl), g), ty = lerp(yTop + 30, lerp(ym - gap, ym - 6, cl), ease.inOut(prog(lt, t1 + 0.3, t1 + 1.9)));
          const bx = 1210;
          arrow(ctx, [[bx, yBot - 20], [bx, gy]], g > 0 ? 1 : 0, P.gold, 6, 20, 10);
          if (ty > yTop + 31) arrow(ctx, [[bx, yTop + 30], [bx, ty]], 1, P.teal, 6, 20, 10);
          alpha(ctx, ep(lt, t1 + 0.4, 0.6), () => { text(V.floor || '最坏里挑最好', bx + 44, yBot - 60, { size: 36, weight: 700, color: P.gold }); text('max · min', bx + 46, yBot - 18, { size: 28, family: F.mono, color: P.gold, alpha: 0.8 }); });
          alpha(ctx, ep(lt, t1 + 0.7, 0.6), () => { text(V.ceiling || '最好里挑最坏', bx + 44, yTop + 64, { size: 36, weight: 700, color: P.teal }); text('min · max', bx + 46, yTop + 106, { size: 28, family: F.mono, color: P.teal, alpha: 0.8 }); });
          // the gap closes once mixed strategies are allowed
          const ga = ep(lt, t2, 0.5) * (1 - ep(lt, t3 + 0.6, 0.5));
          alpha(ctx, ga, () => text(V.mixedLabel || '允许混合策略', bx + 44, ym + 12, { size: 34, weight: 500, color: P.ink }));
          const ma = ep(lt, t4, 0.7);
          alpha(ctx, ma, () => {
            ctx.save(); ctx.strokeStyle = rgba(P.ember, 0.8); ctx.lineWidth = 2.5; ctx.setLineDash([10, 10]);
            ctx.beginPath(); ctx.moveTo(ax - 20, ym); ctx.lineTo(lerp(ax, 1720, ma), ym); ctx.stroke(); ctx.restore();
            K.dot(bx, ym, 9, P.ember, { glow: 16 });
            text(V.meetLabel || '相等 → 稳定解', bx + 44, ym - 18, { size: 40, family: F.serif, weight: 600, color: P.ember });
          });
        });
      }
      // ---- knead: every point of the dough moves except one
      if (sK) {
        const T_ = doughTimes(sK, api), da = ep(lt, T_.show, 0.8);
        if (da > 0) {
          const amp = ease.inOut(prog(lt, T_.go, T_.go + 1.4)), tau = Math.max(0, lt - T_.go);
          const m = (x, y, tt) => doughMap(x, y, tt, amp);
          alpha(ctx, da, () => {
            // body
            ctx.save(); ctx.beginPath();
            for (let i = 0; i <= 96; i++) {
              const a = i / 96 * TAU, rr = DC.r * (1 + 0.06 * (K.fbm(Math.cos(a) * 1.5 + 3, Math.sin(a) * 1.5 + 3, 3) - 0.5));
              const [x, y] = m(DC.x + Math.cos(a) * rr, DC.y + Math.sin(a) * rr * 0.92, tau);
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.closePath(); ctx.fillStyle = rgba(P.warm, 0.13); ctx.fill(); ctx.strokeStyle = rgba(P.warm, 0.55); ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
            // points (with a short motion trail)
            const n = 88;
            for (let k = 0; k < n; k++) {
              const rr = DC.r * 0.88 * Math.sqrt((k + 0.5) / n), th = k * 2.39996;
              const px = DC.x + Math.cos(th) * rr, py = DC.y + Math.sin(th) * rr * 0.92;
              if (Math.hypot(px - FIX.x, py - FIX.y) < 26) continue;
              const [x, y] = m(px, py, tau), [x0, y0] = m(px, py, Math.max(0, tau - 0.35));
              if (amp > 0) { ctx.save(); ctx.strokeStyle = rgba(P.ink, 0.25); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke(); ctx.restore(); }
              K.dot(x, y, 5.5, P.ink, { alpha: 0.78 });
            }
            // the fixed point
            const fa = ep(lt, T_.fix, 0.6);
            K.dot(FIX.x, FIX.y, 6 + 4 * fa, fa > 0 ? P.ember : P.ink, { glow: 18 * fa });
            if (fa > 0) {
              K.ring(FIX.x, FIX.y, 20, P.ember, { lineWidth: 3, alpha: fa });
              const pu = prog(lt, T_.fix, T_.fix + 1.4); if (pu < 1) K.ring(FIX.x, FIX.y, 20 + 50 * ease.out(pu), P.ember, { lineWidth: 2, alpha: 0.6 * (1 - pu) });
              alpha(ctx, fa, () => {
                ctx.save(); ctx.strokeStyle = rgba(P.ember, 0.55); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(FIX.x + 22, FIX.y - 16); ctx.lineTo(1540, 290); ctx.lineTo(1580, 290); ctx.stroke(); ctx.restore();
                text(V.fixedLabel || '不动点', 1590, 302, { size: 46, family: F.serif, weight: 600, color: P.ember });
              });
              alpha(ctx, ep(lt, T_.nash, 0.7), () => text(V.eqLabel || '= 纳什均衡', 1590, 360, { size: 40, family: F.serif, weight: 600, color: P.ink }));
            }
          });
        }
      }
    },
    cues(V, api) {
      const out = [];
      for (const s of api.steps) {
        if (s.show === 'minimax') {
          const L = ownLine(s, api), d = L ? L.end - s.lt : 7.8;
          out.push({ t: s.lt, type: 'tick' }, { t: s.lt + 0.14 * d, type: 'whoosh', dur: 1.8 }, { t: s.lt + 0.74 * d, type: 'pop' });
        }
        if (s.show === 'knead') { const T_ = doughTimes(s, api); out.push({ t: s.lt, type: 'tick' }, { t: T_.show, type: 'swish' }, { t: T_.fix, type: 'pop' }, { t: T_.nash, type: 'chime' }); }
      }
      return out;
    },
  });
})();
