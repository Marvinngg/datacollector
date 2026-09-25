// 地球 Online — s0_boot / s1_school / s2_empty
// 〇 载入 → 一 新手村（任务日志）→ 二 任务栏空了（网格散开，拉远到标准地图态）
//
// All timing is derived from E.lineLocal('Lxx') and scene durations, never absolute seconds.
// Hand-off contract with s3 (标准地图态): at the last frame of s2 we draw exactly
//   World.draw(World.cam0, {fog: 0.85, reveal: [World.homeReveal()], t: τ})
//   World.player(World.cam0, home.x, home.y, {t: τ + 50})          // +50 = 40 pulse periods, keeps t ≥ 0
//   E.questBox('', {caret: true, lt: τ + 100/1.1})                  // +100 caret periods, keeps lt ≥ 0
// where τ = (s2 local time) − (s2 duration), i.e. τ equals s3's own local time `lt` at the cut.
// So s3 drawing the same three calls with t/lt = its own scene-local time is pixel-continuous.
(function () {
  const { P, F, World, ease, prog, clamp, lerp, hash2 } = E;
  const W = E.W, H = E.H, ctx = E.ctx;

  // ------------------------------------------------------------------ grid
  const X0 = 200, X1 = 1160;               // log table
  const C0 = 1300, C1 = 1720;              // side column (娱乐)
  const OY = 64;                           // vertical placement of the whole log (optical centre above the subtitles)
  const HEAD_Y = 214 + OY;                      // header baseline
  const TOP = 240 + OY;                         // top rule (the loading line lands here)
  const LABEL_Y = 270 + OY;                     // column labels baseline
  const ROW0 = 290 + OY, ROW_H = 100;
  const rowBase = i => ROW0 + i * ROW_H + 60;
  const rowRule = i => ROW0 + (i + 1) * ROW_H;
  const COL = { date: X0, tag: 344, task: 446, score: 1104, check: X1 - 14 };
  const ARCH_Y = i => rowBase(0) - 50 + i * 50;          // half-grid rows of the archive column

  const ROWS = [
    { date: '2008.09.26', task: '背完第三单元单词', score: '+20' },
    { date: '2008.11.14', task: '期中考试 年级前五十', score: '+50' },
    { date: '2009.02.27', task: '高考 倒计时 100 天' },
  ];
  const FUN = [ // floating "娱乐" items: text, float position, size
    { s: '课间打球', x: 1318, y: 336 + OY, size: 24 },
    { s: '被没收的小说', x: 1492, y: 404 + OY, size: 22 },
    { s: '同桌传来的纸条', x: 1346, y: 474 + OY, size: 23 },
    { s: 'MP3 里的周杰伦', x: 1476, y: 548 + OY, size: 22 },
    { s: '小卖部的辣条', x: 1540, y: 296 + OY, size: 21 },
  ];

  // archive slot = rank of the float height, so filing paths never cross
  const ARCH_SLOT = FUN.map(f => FUN.filter(g => g.y < f.y).length);
  const TASK = { size: 34, family: F.sans, weight: 400 };
  const DATE = { size: 17, family: F.mono, weight: 400 };

  // ------------------------------------------------------------------ helpers
  const wcache = new Map();
  function cw(c, font) {
    const k = font + '|' + c; let w = wcache.get(k);
    if (w == null) {
      ctx.save(); ctx.font = font; w = ctx.measureText(c).width; ctx.restore();
      if (document.fonts && document.fonts.status === 'loaded') wcache.set(k, w);
    }
    return w;
  }
  const smooth = k => k * k * (3 - 2 * k);
  // soft blink (≈ same rhythm as E.caretOn, rounded edges)
  const blink = lt => clamp(Math.cos(((lt * 1.1) % 1) * Math.PI * 2) * 3 + 0.6);

  // ---- dispersal field (set per frame by s2; null = everything in place)
  let FX = null; // {dt, cx, cy, maxD}
  const STILL = { dx: 0, dy: 0, rot: 0, a: 1 };
  function disp(seed, gx, gy) {
    if (!FX) return STILL;
    const h1 = hash2(seed, 7), h2 = hash2(seed, 19), h3 = hash2(seed, 41);
    const ox = gx - FX.cx, oy = gy - FX.cy, d = Math.hypot(ox, oy) || 1;
    const near = 1 - clamp(d / FX.maxD);                 // far things leave first, the prompt last
    const delay = near * 1.2 + h1 * 0.45;
    const p = clamp((FX.dt - delay) / 1.6);
    if (p <= 0) return STILL;
    // a slow updraft: mostly rising, opening slightly away from the prompt
    const e = ease.sine(p);
    return {
      dx: (ox / d) * (16 + h2 * 30) * e + (h3 - 0.5) * 12 * e,
      dy: (oy / d) * (8 + h2 * 12) * e - (22 + h3 * 26) * e,
      rot: (h2 - 0.5) * 0.12 * e, a: 1 - ease.out(clamp(p * 1.4)),
    };
  }

  /** draw runs of text glyph-by-glyph (so they can type, align to the grid and disperse).
   *  segs: [{s,size,family,weight,color,spacing,alpha}], o: {n, alpha, seed, align} → width */
  function run(segs, x, y, o = {}) {
    const items = []; let total = 0;
    for (const sg of segs) {
      const f = E.font(sg.size, sg.family || F.sans, sg.weight || 400);
      for (const c of Array.from(sg.s)) { const w = cw(c, f); items.push({ c, f, w, sg }); total += w + (sg.spacing || 0); }
    }
    if (items.length) total -= items[items.length - 1].sg.spacing || 0;
    let cx = o.align === 'right' ? x - total : o.align === 'center' ? x - total / 2 : x;
    const n = o.n == null ? items.length : o.n, base = ctx.globalAlpha, oa = o.alpha == null ? 1 : o.alpha;
    if (oa <= 0) return total;
    ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    let curFont = '';
    items.forEach((it, i) => {
      if (i < n && it.c !== ' ') {
        const mid = it.sg.size * 0.36;
        const d = disp((o.seed || 0) * 131 + i, cx + it.w / 2, y - mid);
        if (d.a > 0.004) {
          if (it.f !== curFont) { ctx.font = curFont = it.f; }
          ctx.fillStyle = it.sg.color || P.ink;
          ctx.globalAlpha = base * oa * (it.sg.alpha == null ? 1 : it.sg.alpha) * d.a;
          if (d !== STILL) {
            ctx.save(); ctx.translate(cx + it.w / 2 + d.dx, y - mid + d.dy); ctx.rotate(d.rot);
            ctx.fillText(it.c, -it.w / 2, mid); ctx.restore();
          } else ctx.fillText(it.c, cx, y);
        }
      }
      cx += it.w + (it.sg.spacing || 0);
    });
    ctx.restore();
    return total;
  }
  const seg = (s, o) => Object.assign({ s }, o);
  const width = (s, o) => { let w = 0; const f = E.font(o.size, o.family || F.sans, o.weight || 400); const a = Array.from(s); a.forEach(c => w += cw(c, f) + (o.spacing || 0)); return w - (a.length ? (o.spacing || 0) : 0); };

  /** 1px horizontal hairline with draw-on progress p; breaks into drifting segments under FX */
  function hline(x0, x1, y, o = {}) {
    const p = o.p == null ? 1 : o.p, xe = x0 + (x1 - x0) * p, lw = o.lw || 1;
    if (xe - x0 < 0.5) return;
    const base = ctx.globalAlpha, a = o.alpha == null ? 1 : o.alpha;
    ctx.save(); ctx.fillStyle = o.color || P.line;
    if (!FX) { ctx.globalAlpha = base * a; ctx.fillRect(x0, Math.round(y) - (lw > 1 ? lw / 2 : 0), xe - x0, lw); }
    else {
      const S = 26;
      for (let sx = x0, k = 0; sx < xe; sx += S, k++) {
        const ex = Math.min(xe, sx + S), d = disp((o.seed || 1) * 977 + k, (sx + ex) / 2, y);
        if (d.a <= 0.004) continue;
        ctx.globalAlpha = base * a * d.a;
        ctx.save(); ctx.translate((sx + ex) / 2 + d.dx, y + d.dy); ctx.rotate(d.rot);
        ctx.fillRect(-(ex - sx) / 2, -lw / 2, ex - sx, lw); ctx.restore();
      }
    }
    ctx.restore();
  }
  function vtick(x, y0, y1, o = {}) {
    const d = disp(o.seed || 3, x, (y0 + y1) / 2); if (d.a <= 0.004) return;
    ctx.save(); ctx.globalAlpha *= (o.alpha == null ? 1 : o.alpha) * d.a; ctx.fillStyle = o.color || P.line;
    ctx.translate(x + d.dx, (y0 + y1) / 2 + d.dy); ctx.rotate(d.rot); ctx.fillRect(-0.5, -(y1 - y0) / 2, 1, y1 - y0); ctx.restore();
  }
  /** ✓ drawn as a stroke (draw-on progress p) */
  function check(cx, cy, s, p, o = {}) {
    if (p <= 0) return;
    const d = disp(o.seed || 5, cx, cy); if (d.a <= 0.004) return;
    const pts = [[-0.48 * s, 0.02 * s], [-0.14 * s, 0.36 * s], [0.52 * s, -0.4 * s]];
    const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
    const L = (l1 + l2) * p;
    ctx.save(); ctx.globalAlpha *= (o.alpha == null ? 1 : o.alpha) * d.a;
    ctx.translate(cx + d.dx, cy + d.dy); ctx.rotate(d.rot);
    ctx.strokeStyle = o.color || P.ok; ctx.lineWidth = o.lw || 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    if (L <= l1) ctx.lineTo(lerp(pts[0][0], pts[1][0], L / l1), lerp(pts[0][1], pts[1][1], L / l1));
    else { ctx.lineTo(pts[1][0], pts[1][1]); const k = (L - l1) / l2; ctx.lineTo(lerp(pts[1][0], pts[2][0], k), lerp(pts[1][1], pts[2][1], k)); }
    ctx.stroke(); ctx.restore();
  }
  /** small hairline label box, e.g. 「娱乐」. x = left edge, y = text baseline */
  const TAG = { size: 14, family: F.sans, weight: 500, spacing: 2 };
  const tagW = () => width('娱乐', TAG) + 16;
  function tag(x, y, o = {}) {
    const w = tagW(), d = disp(o.seed || 9, x + w / 2, y - 5); if (d.a <= 0.004) return;
    const a = (o.alpha == null ? 1 : o.alpha) * d.a, s = o.scale || 1;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.translate(x + w / 2 + d.dx, y - 5 + d.dy); ctx.rotate(d.rot); ctx.scale(s, s);
    ctx.strokeStyle = o.color || P.faint; ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2 + 0.5, -11.5, w - 1, 23);
    ctx.font = E.font(TAG.size, TAG.family, TAG.weight); ctx.letterSpacing = TAG.spacing + 'px';
    ctx.fillStyle = o.color || P.faint; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('娱乐', -w / 2 + 8, 5);
    ctx.restore();
  }
  function caretBar(x, y, w, h, a, glow = 0) {
    if (a <= 0.004) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = P.ink;
    if (glow) { ctx.shadowColor = P.ink; ctx.shadowBlur = glow; }
    E.rrect(x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2); ctx.fill(); ctx.restore();
  }
  // day-of-year (2009, not leap) → 'YYYY.MM.DD'
  function dateOf(doy) {
    const m = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; let i = 0;
    while (i < 11 && doy > m[i]) { doy -= m[i]; i++; }
    return `2009.${String(i + 1).padStart(2, '0')}.${String(doy).padStart(2, '0')}`;
  }
  const GAOKAO_DOY = 31 + 28 + 31 + 30 + 31 + 7;           // 2009.06.07

  // ================================================================== timing (all relative)
  function s1T() {
    const sc = E.scene('s1_school'), D = sc.end - sc.start;
    const L1 = E.lineLocal('L01'), L2 = E.lineLocal('L02'), L3 = E.lineLocal('L03');
    const r0 = Math.max(0.9, L1.start + 0.1), rEnd = L2.end - 0.35, B = (rEnd - r0) / 2;
    const rows = [0, 1, 2].map(i => {
      const land = r0 + B * i, type = land + 0.32, cps = 14;
      const done = E.typedDone(ROWS[i].task, type, cps);
      return { land, type, cps, done, check: done + 0.22 };
    });
    const fun0 = r0 + 0.9, fun1 = rows[2].land + 0.7;
    const fun = FUN.map((_, j) => fun0 + (fun1 - fun0) * j / (FUN.length - 1));
    const stamp0 = L3.start + 0.42 * L3.dur;
    const stamp = FUN.map((_, j) => stamp0 + j * 0.09);
    const arch0 = stamp0 + FUN.length * 0.09 + 0.45;
    return { D, L1, L2, L3, rows, fun, stamp, arch0, ticker0: rows[2].done + 0.4 };
  }
  function s2T() {
    const sc = E.scene('s2_empty'), D = sc.end - sc.start;
    const L4 = E.lineLocal('L04'), L5 = E.lineLocal('L05'), L6 = E.lineLocal('L06');
    const roll0 = 0.15, roll1 = Math.max(0.9, L4.start - 0.9);
    const chk = roll1 + 0.2, ban = chk + 0.5;
    const nextLand = L4.start + 0.05, nextType = nextLand + 0.3, nextCps = 11;
    const disp0 = L4.end + 0.3;
    const pan0 = L4.end + 0.75, pan1 = L5.start + 1.35;
    const morph0 = L5.start + 1.0, morph1 = morph0 + 0.55;
    const pull0 = L5.start + 1.2, pull1 = Math.min(L6.start + 0.8, D - 2.2);
    const qb0 = D - 1.8, qb1 = D - 0.35;
    return { D, L4, L5, L6, roll0, roll1, chk, ban, nextLand, nextType, nextCps, disp0, pan0, pan1, morph0, morph1, pull0, pull1, qb0, qb1 };
  }
  const NEXT = '下一个任务：——';

  // ================================================================== s0 — boot
  const TITLE = { size: 92, family: F.serif, weight: 400 };
  const TITLE_Y = 478, SUB_Y = 552, BAR_Y = 588;
  const SUB = { size: 19, family: F.mono, weight: 400, spacing: 3, color: P.dim };
  function titleLayout() {
    const parts = [['地', 12], ['球', 34], ['O', 3], ['n', 3], ['l', 3], ['i', 3], ['n', 3], ['e', 0]];
    const f = E.font(TITLE.size, TITLE.family, TITLE.weight);
    let x = 0; const g = parts.map(([c, sp]) => { const w = cw(c, f); const o = { c, x, w }; x += w + sp; return o; });
    const tw = x; const left = W / 2 - tw / 2;
    g.forEach(o => o.x += left);
    return { g, left, right: left + tw, tw, f };
  }
  // title glyphs are rasterised once into small canvases; blur is applied only to that small area
  // (ctx.filter on the main canvas would blur a full-frame layer per glyph)
  const GPAD = 40, gimg = new Map();
  let gtmp = null;
  function glyphImg(ch, font, blur, x, y) {
    let im = gimg.get(ch + font);
    if (!im) {
      const w = Math.ceil(cw(ch, font)) + GPAD * 2, h = 92 + GPAD * 2 + 30;
      im = document.createElement('canvas'); im.width = w; im.height = h;
      const g = im.getContext('2d'); g.font = font; g.fillStyle = P.ink; g.textBaseline = 'alphabetic';
      g.fillText(ch, GPAD, GPAD + 92);
      if (document.fonts && document.fonts.status === 'loaded') gimg.set(ch + font, im);
    }
    if (blur > 0.3) {
      if (!gtmp) gtmp = document.createElement('canvas');
      if (gtmp.width < im.width || gtmp.height < im.height) { gtmp.width = Math.max(gtmp.width, im.width); gtmp.height = Math.max(gtmp.height, im.height); }
      const g = gtmp.getContext('2d'); g.clearRect(0, 0, gtmp.width, gtmp.height);
      g.filter = `blur(${blur.toFixed(2)}px)`; g.drawImage(im, 0, 0); g.filter = 'none';
      ctx.drawImage(gtmp, 0, 0, im.width, im.height, x - GPAD, y - GPAD - 92, im.width, im.height);
    } else ctx.drawImage(im, x - GPAD, y - GPAD - 92);
  }
  function s0T(D) {
    // proportions of the ~4 s boot; scales if the scene length changes
    const k = D / 4;
    return { caret0: 0.15 * k, reveal0: 0.9 * k, stagger: 0.08 * k, sub0: 1.95 * k, dots0: 2.27 * k, dotStep: 0.12 * k, bar0: 2.0 * k, bar1: 2.95 * k, out0: 2.98 * k, move0: 3.28 * k, move1: D - 0.08 };
  }
  // loading curve with a couple of natural hesitations
  function loadCurve(k) {
    const K = [[0, 0], [0.22, 0.16], [0.38, 0.21], [0.6, 0.63], [0.74, 0.7], [0.9, 0.97], [1, 1]];
    for (let i = 1; i < K.length; i++) if (k <= K[i][0]) { const q = (k - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return lerp(K[i - 1][1], K[i][1], smooth(q)); }
    return 1;
  }

  E.register('s0_boot', {
    draw(c, lt, sc) {
      const D = sc.end - sc.start, T = s0T(D), L = titleLayout();
      const out = ease.inOut(prog(lt, T.out0, T.out0 + 0.42));
      // --- title: each glyph resolves from blur, left to right
      const n = L.g.length;
      c.save();
      c.globalAlpha = 1 - out;
      c.translate(0, -14 * out);
      L.g.forEach((g, i) => {
        const k = ease.out(prog(lt, T.reveal0 + i * T.stagger, T.reveal0 + i * T.stagger + 0.75));
        if (k <= 0) return;
        c.save(); c.globalAlpha *= k;
        const b = (1 - k) * 9 + out * 5;
        glyphImg(g.c, L.f, b, g.x, TITLE_Y + (1 - k) * 4);
        c.restore();
      });
      // --- subtitle: 载入存档 + six dots, percentage
      const sub = '载入存档', subN = Math.floor(clamp((lt - T.sub0) * 16, 0, 4));
      const sw = run([seg(sub, SUB)], L.left + 2, SUB_Y, { n: subN });
      const dotsN = Math.floor(clamp((lt - T.dots0) / T.dotStep + 1, 0, 6));
      for (let i = 0; i < dotsN; i++) E.dot(L.left + 2 + width(sub, SUB) + 12 + i * 11, SUB_Y - 7, 1.6, P.dim);
      const lp = loadCurve(prog(lt, T.bar0, T.bar1));
      if (lt > T.bar0) run([seg(String(Math.round(lp * 100)).padStart(3, '0') + '%', { size: 14, family: F.mono, color: P.faint, spacing: 2 })], L.right, SUB_Y, { align: 'right', alpha: ease.out(prog(lt, T.bar0, T.bar0 + 0.3)) });
      c.restore();
      // --- the loading line: track, fill, then it travels up and becomes the log's top rule
      const mv = ease.inOut(prog(lt, T.move0, T.move1));
      const bx0 = lerp(L.left, X0, mv), bx1 = lerp(L.right, X1, mv), by = lerp(BAR_Y, TOP, mv);
      const trackA = ease.out(prog(lt, T.bar0 - 0.1, T.bar0 + 0.3));
      if (lt < T.move0 + 0.01) hline(L.left, L.right, BAR_Y, { color: P.line, alpha: trackA });
      if (lt > T.bar0) hline(bx0, bx1, by, { color: P.dim, p: lt < T.move0 ? lp : 1, alpha: 1 });
      // --- caret: blinks on black, rides the title reveal, returns to the subtitle line
            let cx, cy, ch, cwid, ca;
      if (lt < T.sub0 - 0.18) {
        // the caret leads the reveal by ~one glyph, stepping through glyph edges
        const q = clamp((lt - T.reveal0 + 0.06) / T.stagger, 0, n), qi = Math.floor(q), qf = smooth(q - qi);
        const edge = i => i <= 0 ? L.left - 18 : i >= n ? L.right + 16 : L.g[i].x - 6;
        const f = q > 0 && q < n ? 0.5 : q >= n ? 1 : 0;
        cx = lerp(edge(qi), edge(qi + 1), qf); cy = TITLE_Y - 30; ch = 84; cwid = 3;
        ca = (f > 0 && f < 1) ? 1 : blink(lt - T.caret0);
        ca *= ease.out(prog(lt, T.caret0, T.caret0 + 0.12));
      } else {
        const f = ease.inOut(prog(lt, T.sub0 - 0.18, T.sub0));
        const endX = L.left + 2 + (subN ? width(sub.slice(0, subN), SUB) + 8 : 0) + (dotsN > 0 ? 4 + dotsN * 11 : 0);
        cx = lerp(L.right + 16, endX, f); cy = lerp(TITLE_Y - 30, SUB_Y - 7, f); ch = lerp(84, 22, f); cwid = lerp(3, 2, f);
        ca = lt > T.dots0 + 6 * T.dotStep + 0.1 ? blink(lt) : 1;
        ca *= 1 - ease.out(prog(lt, T.out0, T.out0 + 0.3));
      }
      caretBar(cx, cy, cwid, ch, ca);
    },
    cues(sc) {
      const D = sc.end - sc.start, T = s0T(D), out = [{ t: 0, type: 'boot' }];
      for (let i = 0; i < 4; i++) out.push({ t: +(T.sub0 + (i + 1) / 16).toFixed(3), type: 'key' });
      for (let i = 0; i < 6; i++) out.push({ t: +(T.dots0 + i * T.dotStep).toFixed(3), type: 'key' });
      return out;
    },
  });

  // ================================================================== s1 / s2 shared: the quest log
  /** Draw the log as it is at s1-local time lt1; s2 passes overrides in `x2`. */
  function drawLog(lt1, T1, x2) {
    const hdrOut = x2 ? x2.hdrOut : 0;
    const hdrA = ease.out(prog(lt1, 0.05, 0.6)) * (1 - hdrOut), hdrY = HEAD_Y - 16 * hdrOut;
    // top rule — always full (it arrived from s0)
    hline(X0, X1, TOP, { color: P.dim, alpha: 1, seed: 11 });
    // header
    const hw = run([seg('任务日志', { size: 22, family: F.sans, weight: 500, spacing: 7, color: P.ink })], X0, hdrY, { alpha: hdrA, seed: 21 });
    run([seg('QUEST LOG', { size: 12, family: F.mono, spacing: 3, color: P.faint })], X0 + hw + 22, hdrY - 1, { alpha: ease.out(prog(lt1, 0.2, 0.7)) * (1 - hdrOut), seed: 22 });
    // right of header: 新手村 · LV.17 (s2 rolls it to 18)
    const lvA = ease.out(prog(lt1, 0.3, 0.8));
    const lvRoll = x2 ? x2.lv : 0;
    ctx.save();
    ctx.beginPath(); ctx.rect(X1 - 60, HEAD_Y - 24, 64, 32); ctx.clip();
    run([seg('17', { size: 15, family: F.mono, color: P.dim, spacing: 1 })], X1, HEAD_Y - 18 * lvRoll, { align: 'right', alpha: lvA * (1 - lvRoll), seed: 23 });
    if (lvRoll > 0) run([seg('18', { size: 15, family: F.mono, color: P.ink, spacing: 1 })], X1, HEAD_Y + 18 * (1 - lvRoll), { align: 'right', alpha: lvA * lvRoll, seed: 24 });
    ctx.restore();
    const lvw = width('17', { size: 15, family: F.mono, spacing: 1 });
    run([seg('LV.', { size: 15, family: F.mono, color: P.faint, spacing: 1 })], X1 - lvw - 2, HEAD_Y, { align: 'right', alpha: lvA, seed: 25 });
    run([seg('新手村', { size: 16, family: F.sans, color: P.faint, spacing: 4 })], X1 - lvw - 52, HEAD_Y, { align: 'right', alpha: lvA, seed: 26 });
    // column labels + ruler ticks on the top rule
    const labA = ease.out(prog(lt1, 0.35, 0.9));
    const LAB = { size: 11, family: F.mono, spacing: 3, color: P.faint };
    run([seg('DATE', LAB)], COL.date, LABEL_Y, { alpha: labA, seed: 31 });
    run([seg('TYPE', LAB)], COL.tag, LABEL_Y, { alpha: labA, seed: 32 });
    run([seg('QUEST', LAB)], COL.task, LABEL_Y, { alpha: labA, seed: 33 });
    run([seg('STATUS', LAB)], X1, LABEL_Y, { alpha: labA, seed: 34, align: 'right' });
    [COL.date, COL.tag, COL.task, X1].forEach((x, i) => vtick(x === X1 ? X1 - 0.5 : x + 0.5, TOP, TOP + 7 * ease.out(prog(lt1, 0.25 + i * 0.06, 0.55 + i * 0.06)), { color: P.dim, seed: 40 + i }));

    // rows
    ROWS.forEach((R, i) => {
      const rt = T1.rows[i], land = prog(lt1, rt.land, rt.land + 0.26);
      if (land <= 0) return;
      const eo = ease.out(land), y = rowBase(i) - (1 - eo) * 18, a = eo;
      hline(X0, X1, rowRule(i), { color: P.line, p: ease.inOut(prog(lt1, rt.land, rt.land + 0.55)), seed: 100 + i });
      let dateStr = R.date;
      if (i === 2 && x2) dateStr = x2.date;
      run([seg(dateStr, Object.assign({ color: P.dim, spacing: 0.5 }, DATE))], COL.date, y, { alpha: a, seed: 200 + i * 10 });
      run([seg('[', { size: 18, family: F.mono, color: P.gold, alpha: 0.7 }), seg('主线', { size: 18, family: F.sans, weight: 500, color: P.gold, spacing: 2 }), seg(']', { size: 18, family: F.mono, color: P.gold, alpha: 0.7 })], COL.tag, y - 2, { alpha: a, seed: 201 + i * 10 });
      const typedN = Math.floor(clamp((lt1 - rt.type) * rt.cps, 0, Array.from(R.task).length));
      if (i < 2) {
        run([seg(R.task, Object.assign({ color: P.ink }, TASK))], COL.task, y, { n: typedN, alpha: a, seed: 202 + i * 10 });
        const ck = prog(lt1, rt.check, rt.check + 0.22);
        check(COL.check, y - 12, 26, ease.out(ck), { seed: 203 + i * 10 });
        run([seg(R.score, { size: 16, family: F.mono, color: P.dim, spacing: 1 })], COL.score, y - 1, { align: 'right', alpha: ease.out(prog(lt1, rt.check + 0.12, rt.check + 0.45)), seed: 204 + i * 10 });
      } else {
        // 高考 倒计时 100 天 — the number is mono in a fixed 3-cell slot so it can count down in s2
        const NUM = { size: 31, family: F.mono, weight: 400, color: P.ink };
        const tail = x2 ? x2.tailA : 1;
        const days = x2 ? x2.days : 100;
        const numStr = String(days).padStart(3, '0');
        // typing order: 高考 (2) ' ' 倒计时 (3) ' ' 100 (3) ' ' 天 (1) = 11
        const nA = Math.min(typedN, 2), nB = clamp(typedN - 2, 0, 4), nC = clamp(typedN - 6, 0, 3), nD = clamp(typedN - 9, 0, 2);
        let x = COL.task;
        x += run([seg('高考', Object.assign({ color: P.ink }, TASK))], x, y, { n: nA, alpha: a, seed: 230 });
        x += width(' ', TASK);
        const x3 = x;
        x += run([seg(' 倒计时 ', Object.assign({ color: P.ink }, TASK))], x - width(' ', TASK), y, { n: nB, alpha: a * tail, seed: 231 }) - width(' ', TASK);
        const numW = width('000', NUM) + 4;
        // countdown digits: right aligned in slot so the '天' never moves
        const shown = typedN >= 9 ? numStr : '100'.slice(0, nC);
        run([seg(shown, NUM)], typedN >= 9 ? x + numW - 2 : x + 2, y, { alpha: a * tail, seed: 232, align: typedN >= 9 ? 'right' : 'left' });
        x += numW + width(' ', TASK) * 0.6;
        run([seg('天', Object.assign({ color: P.ink }, TASK))], x, y, { n: nD > 1 ? 1 : 0, alpha: a * tail, seed: 233 });
        // the slow ticking detail: hh:mm:ss left on the current day
        const tk = x2 ? x2.tickerA : ease.out(prog(lt1, T1.ticker0, T1.ticker0 + 0.4));
        if (tk > 0) {
          let secs = 7 * 3600 + 42 * 60 + 19 - Math.max(0, Math.floor(lt1 - T1.ticker0));
          if (x2 && x2.spin) secs = Math.floor(hash2(Math.floor(E.t * 30), 17) * 86400);   // days flying by
          const str = [Math.floor(secs / 3600), Math.floor(secs / 60) % 60, secs % 60].map(v => String(v).padStart(2, '0')).join(':');
          run([seg(str, { size: 16, family: F.mono, color: P.dim, spacing: 1 })], X1, y - 1, { align: 'right', alpha: tk * a, seed: 234 });
        }
        if (x2) check(COL.check, y - 12, 26, x2.check, { seed: 235 });
        return x3;
      }
    });

    // side column: entertainment — floating, then tagged, then filed away
    const archA = ease.out(prog(lt1, T1.arch0 - 0.1, T1.arch0 + 0.5));
    if (archA > 0) {
      hline(C0, C1, TOP, { color: P.line, p: ease.inOut(prog(lt1, T1.arch0 - 0.1, T1.arch0 + 0.6)), seed: 12 });
      const aw = run([seg('娱乐', { size: 16, family: F.sans, weight: 500, spacing: 6, color: P.dim })], C0, HEAD_Y, { alpha: archA, seed: 51 });
      run([seg('ARCHIVED', { size: 12, family: F.mono, spacing: 3, color: P.faint })], C0 + aw + 18, HEAD_Y - 1, { alpha: archA, seed: 52 });
      run([seg(String(FUN.length).padStart(2, '0'), { size: 14, family: F.mono, spacing: 1, color: P.faint })], C1, HEAD_Y, { align: 'right', alpha: archA, seed: 53 });
    }
    const FXsave = FX;
    FUN.forEach((it, j) => {
      const ap = prog(lt1, T1.fun[j], T1.fun[j] + 0.9);
      if (ap <= 0) return;
      const ea = ease.out(ap);
      const mv = ease.inOut(prog(lt1, T1.arch0 + j * 0.05, T1.arch0 + j * 0.05 + 0.85));
      // drift (stops as it gets filed)
      const drift = 1 - mv, ph = j * 1.7;
      const fx = it.x + Math.sin(lt1 * 0.55 + ph) * 7 * drift, fy = it.y + Math.cos(lt1 * 0.43 + ph * 1.3) * 5 * drift - (1 - ea) * 10;
      // filed items shrink to 20px: drawn at their float size and scaled, so no fractional font sizes
      const sk = lerp(1, 20 / it.size, mv), FS = { size: it.size, family: F.sans, weight: 400, color: P.dim, spacing: 0.5 };
      const x = lerp(fx, C0, mv), y = lerp(fy, ARCH_Y(ARCH_SLOT[j]), mv);
      const alpha = ea * lerp(0.9, 0.55, ease.out(prog(lt1, T1.stamp[j], T1.stamp[j] + 0.35)));
      ctx.save(); ctx.translate(x, y); ctx.scale(sk, sk);
      if (FX) { const f0 = FX; FX = { dt: f0.dt, maxD: f0.maxD / sk, cx: (f0.cx - x) / sk, cy: (f0.cy - y) / sk }; }
      run([seg(it.s, FS)], 0, 0, { alpha, seed: 300 + j * 10 });
      if (FX) FX = FXsave;
      ctx.restore();
      const st = prog(lt1, T1.stamp[j], T1.stamp[j] + 0.16);
      if (st > 0) {
        const w = width(it.s, FS) * sk;
        const tx = lerp(fx + w + 14, C1 - tagW(), mv);
        tag(tx, y - 1, { alpha: ease.out(st) * lerp(1, 0.9, mv), scale: lerp(1.35, 1, ease.out(st)), seed: 301 + j * 10 });
      }
    });
  }

  // ================================================================== s1 — school
  E.register('s1_school', {
    draw(c, lt, sc) {
      FX = null;
      drawLog(lt, s1T(), null);
    },
    cues(sc) {
      const T = s1T(), out = [];
      T.rows.forEach((r, i) => {
        Array.from(ROWS[i].task).forEach((ch, k) => { if (ch !== ' ') out.push({ t: +(r.type + (k + 1) / r.cps).toFixed(3), type: 'key' }); });
        if (i < 2) out.push({ t: +r.check.toFixed(3), type: 'check' });
      });
      T.stamp.forEach(t => out.push({ t: +t.toFixed(3), type: 'key' }));
      return out.sort((a, b) => a.t - b.t);
    },
  });

  // ================================================================== s2 — empty quest bar
  const ZOOM_IN = 3;
  const QB_CARET_LT = 100 / 1.1, PULSE_T = 50;
  function nextCaretPos() {
    // caret sits right after "下一个任务：——" on row 3
    const w = width(NEXT, Object.assign({}, TASK, { spacing: 0.5 }));
    return { x: COL.task + w + 10, y: rowBase(3) - 12 };
  }
  E.register('s2_empty', {
    draw(c, lt, sc, T) {
      const T1 = s1T(), T2 = s2T();
      const tau = lt - T2.D;                     // == s3 local time at the cut
      const cp = nextCaretPos();
      // --- camera / pull-back
      const pl = ease.inOut(prog(lt, T2.pull0, T2.pull1));
      const done = lt >= T2.pull1;
      const zoom = done ? World.cam0.zoom : Math.exp(lerp(Math.log(ZOOM_IN), Math.log(World.cam0.zoom), pl));
      const cam = done ? World.cam0 : { x: World.cam0.x, y: World.cam0.y, zoom };
      const fog = done ? 0.85 : 0.85 * ease.out(prog(lt, T2.pull0 - 0.3, T2.pull0 + (T2.pull1 - T2.pull0) * 0.7));
      const mapA = done ? 1 : ease.inOut(prog(lt, T2.pull0 + 0.15, T2.pull0 + (T2.pull1 - T2.pull0) * 0.85));
      // the clear patch around me grows (in world units) to exactly homeReveal() as we pull back,
      // so on screen it keeps shrinking: the fog is there from the first moment the map shows
      const rv = done ? World.homeReveal() : World.homeReveal(lerp(170, 520, pl));
      if (mapA > 0) {
        if (mapA < 1) { c.save(); c.globalAlpha = mapA; }
        World.draw(cam, { fog, reveal: [rv], t: tau });
        if (mapA < 1) c.restore();
      }

      // --- the log layer (pans to the caret, pushes in slightly, then shrinks with the pull-back)
      const pn = ease.inOut(prog(lt, T2.pan0, T2.pan1));
      const dispDone = lt > T2.disp0 + 1.2 + 0.45 + 1.6 / 1.4 + 0.05;
      if (!dispDone) {
        const sx = lerp(cp.x, W / 2, pn), sy = lerp(cp.y, H / 2, pn);
        const s = lerp(1, 1.04, pn) * (zoom / ZOOM_IN);
        c.save();
        c.translate(sx, sy); c.scale(s, s); c.translate(-cp.x, -cp.y);
        FX = lt > T2.disp0 ? { dt: lt - T2.disp0, cx: cp.x, cy: cp.y, maxD: 1100 } : null;
        const rollK = ease.inOut(prog(lt, T2.roll0, T2.roll1));
        const days = Math.round(lerp(100, 0, rollK));
        const x2 = {
          days, date: dateOf(GAOKAO_DOY - days),
          tailA: 1 - ease.out(prog(lt, T2.roll1 + 0.02, T2.roll1 + 0.3)),
          tickerA: 1 - ease.out(prog(lt, T2.roll1 - 0.1, T2.roll1 + 0.2)),
          spin: lt > T2.roll0 && lt < T2.roll1,
          check: ease.out(prog(lt, T2.chk, T2.chk + 0.22)),
          lv: ease.inOut(prog(lt, T2.ban + 0.1, T2.ban + 0.45)),
          hdrOut: ease.inOut(prog(lt, T2.ban - 0.05, T2.ban + 0.25)),
        };
        drawLog(T1.D + lt, T1, x2);
        // banner: 主线任务已完成
        const bk = ease.out(prog(lt, T2.ban, T2.ban + 0.4));
        if (bk > 0) {
          run([seg('MAIN QUEST COMPLETE', { size: 12, family: F.mono, spacing: 4, color: P.gold })], X0, HEAD_Y - 58 + (1 - bk) * 12, { alpha: bk, seed: 61 });
          run([seg('主线任务已完成', { size: 40, family: F.sans, weight: 500, spacing: 6, color: P.ink })], X0 - 2, HEAD_Y + 2 + (1 - bk) * 16, { alpha: bk, seed: 62 });
        }
        // row 3: 下一个任务：——
        const nl = prog(lt, T2.nextLand, T2.nextLand + 0.26);
        if (nl > 0) {
          const eo = ease.out(nl), y = rowBase(3) - (1 - eo) * 18;
          hline(X0, X1, rowRule(3), { color: P.line, p: ease.inOut(prog(lt, T2.nextLand, T2.nextLand + 0.55)), seed: 104 });
          run([seg('2009.06.08', Object.assign({ color: P.dim, spacing: 0.5 }, DATE))], COL.date, y, { alpha: eo, seed: 240 });
          run([seg('[', { size: 18, family: F.mono, color: P.faint }), seg('    ', { size: 18, family: F.sans, spacing: 2 }), seg(']', { size: 18, family: F.mono, color: P.faint })], COL.tag, y - 2, { alpha: eo, seed: 241 });
          const n = Math.floor(clamp((lt - T2.nextType) * T2.nextCps, 0, 8));
          run([seg('下一个任务：', Object.assign({}, TASK, { color: P.dim, spacing: 0.5 })), seg('——', Object.assign({}, TASK, { color: P.faint, spacing: 0.5 }))], COL.task, y, { n, alpha: eo, seed: 242 });
        }
        FX = null;
        c.restore();
      }

      // --- the caret: typed after the prompt, carried to centre, becomes the player dot
      const typedEnd = E.typedDone(NEXT, T2.nextType, T2.nextCps);
      if (lt > T2.nextType && lt < T2.morph1 + 0.35) {
        const n = Math.floor(clamp((lt - T2.nextType) * T2.nextCps, 0, 8));
        const sub = Array.from(NEXT).slice(0, n);
        const tw = n ? width(sub.join(''), Object.assign({}, TASK, { spacing: 0.5 })) + 10 : 4;
        const lx = COL.task + tw, ly = rowBase(3) - 12;
        const x = lerp(lx, W / 2, pn), y = lerp(ly, H / 2, pn);
        const mk = ease.inOut(prog(lt, T2.morph0, T2.morph1));
        let a = lt < typedEnd + 0.1 ? 1 : blink(lt - typedEnd);
        a = lerp(a, 1, ease.out(prog(lt, T2.morph0 - 0.35, T2.morph0)));
        a *= 1 - ease.inOut(prog(lt, T2.morph1 - 0.1, T2.morph1 + 0.3));
        caretBar(x, y, lerp(3, 14, mk), lerp(38, 14, mk), a, 16 * mk);
      }
      // --- the player (me), standing where the caret was
      const pa = done ? 1 : ease.inOut(prog(lt, T2.morph1 - 0.15, T2.morph1 + 0.3));
      if (pa > 0) World.player(cam, World.home.x, World.home.y, { t: tau + PULSE_T, alpha: pa, pulse: true });
      // --- quest box: empty, caret waiting
      const qa = lt >= T2.qb1 ? 1 : ease.inOut(prog(lt, T2.qb0, T2.qb1));
      if (qa > 0) E.questBox('', { caret: true, lt: tau + QB_CARET_LT, alpha: qa });
    },
    cues(sc) {
      const T2 = s2T(), out = [];
      out.push({ t: +T2.chk.toFixed(3), type: 'check' });
      out.push({ t: +T2.ban.toFixed(3), type: 'card' });
      Array.from(NEXT).forEach((ch, k) => out.push({ t: +(T2.nextType + (k + 1) / T2.nextCps).toFixed(3), type: 'key' }));
      out.push({ t: +T2.pull0.toFixed(3), type: 'whoosh', dur: +(T2.pull1 - T2.pull0).toFixed(3) });
      return out.sort((a, b) => a.t - b.t);
    },
  });
})();
