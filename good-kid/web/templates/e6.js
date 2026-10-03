/* e6 Have a try — the film's arc lands: 你 has lived on borrowed light; now its own light is born.
 * One world, one object: the grey answer sheet is a real plane in 3D (drawn flat into an offscreen canvas once and
 * mapped onto the screen strip by strip — exact for a plane that tilts about a horizontal axis), and 你 is a 3D
 * particle body (the KIT.you cloud and colour formula) standing on it.
 * b18 stand — the sheet fills the frame flat, 你 printed on it like a mark. 'up': the sheet tilts back and becomes a
 *             floor; 你 peels off it and stands, its grey imprint left on the paper like a shadow. 'given': small print
 *             in the header (发卷人：别人). 'kid': among the bubbles near the front, a tiny 你 stands in an empty
 *             bubble, leaning back, looking up — the child that waits for a score.
 * b19 tries + b20 lamp (one chain, one function of chain time): the small tries are written by hand around 你 in
 *             warm ink — one word wobbles, one character is crossed out and rewritten, one line slips — and next
 *             to each line there is only an empty place where a mark would be. Each finished line sends a spark
 *             into 你 and a small warm light kindles there. 'fine': the last try collapses softly onto the paper;
 *             nothing else happens. 'take': the cold lamps of the middle of the film appear faintly above, their
 *             light is drawn down into 你 and turns warm; 你 glows amber and lights the paper around it.
 * b21 end   — the camera eases back; the child walks into 你; "Have a try" forms from warm particles that flow out
 *             of 你's light; 「试试不一样的生活」 beneath; 你 takes one small step forward, off the sheet, onto the
 *             dark ground, which takes its light. Hold, breathing. */
(function () {
  const { W, H, F, clamp, lerp, prog, ease } = K;
  const { C } = KIT, LC = KIT.L;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });
  const R = (i, k) => PX.rand(i, k);
  const noDot = s => s.replace(/[。]$/, '');
  const INK = '#efcf9f';                                   // warm handwriting ink (yours; never red)

  // ================================================================ the sheet as a plane in 3D
  // sheet coordinates: u across (0..SW), v down the page (0 = header edge .. SH = near edge), h above the paper
  const SW = 880, SH = 1160, ROWS = 20, PAD = 6, HY = 70, RH = (SH - 100) / ROWS, BX0 = 120, BW = (SW - 170) / 4;
  const rowY = i => HY + 20 + RH * (i + 0.5), colX = c => BX0 + BW * (c + 0.5);
  const ans = i => Math.floor(PX.rand(i, 77) * 4);
  const TITLE = '答题卡 · 人生', GIVER = '发卷人：别人';

  /* a pinhole camera looking down the z axis; the sheet rotates by th about its near edge (th = 0: facing the
     camera, flat on the screen; th -> 90deg: a floor). Equivalent to the camera orbiting down over a table. */
  const FOC = 1000;
  // cu: how far the far end of the page curls up to face the camera (0..1); fade: soften the page's near rows
  const CAM0 = { th: 0, D: 1000, Cy: 380, Yc: 960, cx: 0, cu: 0, fade: 0 };          // flat: the sheet at 1:1, x 100..980, y 180..1340
  const CAM1 = { th: 66 * DEG, D: 1000, Cy: 560, Yc: 760, cx: 90, cu: 0, fade: 0.6 };  // the floor, seen from ~40deg (b18 'up' .. b20)
  const CAM2 = { th: 72 * DEG, D: 1300, Cy: 900, Yc: 880, cx: 150, cu: 0, fade: 0.3 }; // b21: risen and eased back, room above
  const camMix = (a, b, k) => { const o = {}; for (const key in a) o[key] = lerp(a[key], b[key], k); return cam(o); };
  const cam = o => (o.c = Math.cos(o.th), o.s = Math.sin(o.th), o);
  cam(CAM0); cam(CAM1); cam(CAM2);
  const PP = { x: 0, y: 0, s: 1 }, CURL0 = SH - 330;
  // a point of the page (u, v) at height h above it. Beyond CURL0 the page may bend up on a circular arc.
  function P(cm, u, v, h, out = PP) {
    const d = SH - v; let y, z, ca = cm.c, sa = cm.s;
    if (cm.cu > 0.0005 && d > CURL0) {
      const t = d - CURL0, k = cm.cu * (cm.th + 8 * DEG) / (SH - CURL0), a = cm.th - k * t;
      y = CURL0 * cm.c + (cm.s - Math.sin(a)) / k; z = CURL0 * cm.s + (Math.cos(a) - cm.c) / k; ca = Math.cos(a); sa = Math.sin(a);
    } else { y = d * cm.c; z = d * cm.s; }
    y += h * sa; z -= h * ca;
    const iz = FOC / (z + cm.D);
    out.x = W / 2 + (u - SW / 2 - cm.cx) * iz; out.y = cm.Yc - (y - cm.Cy) * iz; out.s = iz; return out;
  }
  const fadeAt = (cm, y) => 1 - cm.fade * 0.85 * ss(1180, 1440, y);

  // ---------------------------------------------------------------- sheet layers (painted once, flat)
  function paintSheet(g, o) {                          // the same drawing as KIT.sheet (fill 1, grey), on any canvas
    g.save(); g.translate(PAD, PAD);
    g.strokeStyle = o.line; g.lineWidth = 1.2; g.strokeRect(0, 0, SW, SH);
    g.beginPath(); g.moveTo(0, HY); g.lineTo(SW, HY); g.stroke();
    K.text(TITLE, 24, 46, { ctx: g, size: 26, family: F.sans, weight: 500, color: o.dim, spacing: 4 });
    for (let i = 0; i < ROWS; i++) {
      const yy = rowY(i);
      K.text(String(i + 1).padStart(2, '0'), 30, yy + 9, { ctx: g, size: 24, family: F.mono, color: o.faint });
      for (let c = 0; c < 4; c++) {
        const cx = colX(c);
        g.beginPath(); g.ellipse(cx, yy, 22, Math.min(13, RH * 0.32), 0, 0, TAU); g.strokeStyle = o.line; g.lineWidth = 1.2; g.stroke();
        if (c === ans(i)) { g.fillStyle = o.fill; g.beginPath(); g.ellipse(cx, yy, 21, Math.min(12, RH * 0.3), 0, 0, TAU); g.fill(); }
        else K.text('ABCD'[c], cx, yy + 7, { ctx: g, size: 18, family: F.mono, color: o.faint, align: 'center' });
      }
    }
    g.restore();
  }
  let LAY = null;
  function layers() {
    const fk = document.fonts.check(`500 26px ${F.sans}`, TITLE);
    if (LAY && LAY.fk === fk) return LAY;
    const cw = SW + PAD * 2, ch = SH + PAD * 2;
    const sheet = mk(cw, ch); paintSheet(sheet.getContext('2d'), { line: C.line, fill: C.gray, faint: C.faint, dim: C.dim });
    const warm = mk(cw, ch); paintSheet(warm.getContext('2d'), { line: 'rgba(255,201,133,0.62)', fill: '#e2b47a', faint: 'rgba(255,201,133,0.55)', dim: 'rgba(255,214,160,0.8)' });
    const head = mk(cw, HY + PAD * 2);
    K.text(GIVER, PAD + SW - 26, PAD + 46, { ctx: head.getContext('2d'), size: 27, family: F.sans, weight: 400, color: 'rgba(236,231,220,0.62)', align: 'right', spacing: 3 });
    // the imprint 你 leaves on the paper (same glyph, same place as the particle body lying there)
    const yc = youCloud(), print = mk(cw, ch), pg = print.getContext('2d');
    pg.font = `600 ${yc.fs}px ${F.serif}`; pg.textAlign = 'center'; pg.fillStyle = 'rgba(138,143,152,0.13)';
    const bl = PAD + PRINT_V - yc.baseYoff + 0.38 * yc.fs;
    pg.fillText('你', PAD + PRINT_U, bl); pg.fillStyle = 'rgba(138,143,152,0.06)'; pg.fillText('你', PAD + PRINT_U + 1.5, bl + 1.5);
    return (LAY = { fk, sheet, warm, head, print });
  }
  /* map rows v0..v1 of a flat layer onto the screen through the camera, in thin strips (each strip is an affine map;
     a plane tilting about a horizontal axis keeps its rows horizontal, so this is the exact projective map up to
     the strip's tiny scale change). g: target context (default the film canvas). */
  function projectLayer(g, cv, v0, v1, alpha, cm, oy = 0, yOff = 0) {
    if (alpha <= 0.002) return;
    g.save(); g.globalAlpha *= alpha; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const q = {}, r = {};
    if (Math.abs(cm.th) < 1e-4) {
      P(cm, -PAD, v0, 0, q); P(cm, -PAD, v1, 0, r);
      g.drawImage(cv, 0, v0 + PAD - oy, cv.width, v1 - v0, q.x, q.y, cv.width * q.s, r.y - q.y);
    } else {
      // strips meet on whole pixel rows (no seams, no double-covered rows)
      const n = Math.max(2, Math.ceil((v1 - v0) / 6)), m = {}, a0 = g.globalAlpha;
      let va = v0, ya = Math.round(P(cm, -PAD, v0, 0, q).y);
      for (let k = 1; k <= n; k++) {
        const vb = v0 + (v1 - v0) * k / n, yb = Math.round(P(cm, -PAD, vb, 0, r).y);
        if (yb <= ya && k < n) continue;
        P(cm, -PAD, (va + vb) / 2, 0, m);
        const x = W / 2 + (-PAD - SW / 2 - cm.cx) * m.s, f = cm.fade > 0 ? fadeAt(cm, m.y + yOff) : 1;
        if (f > 0.01 && yb > ya) { g.globalAlpha = a0 * f; g.drawImage(cv, 0, va + PAD - oy, cv.width, vb - va, x, ya, cv.width * m.s, yb - ya); }
        va = vb; ya = yb;
      }
    }
    g.restore();
  }
  // the whole page (+ header print + imprint)
  function drawSheet(cm, o) {
    const L = layers();
    projectLayer(K.ctx, L.sheet, -PAD, SH + PAD, o.a, cm);
    if (o.head > 0) projectLayer(K.ctx, L.head, -PAD, HY + PAD, o.a * o.head, cm);
    if (o.print > 0) projectLayer(K.ctx, L.print, 200, SH + PAD, o.a * o.print, cm);
  }
  // warm light on the paper around (u, v): the warm-inked page, masked by a soft ellipse on the floor, added as light
  const TMP = mk(W, 900), TG = TMP.getContext('2d');
  function floorLight(cm, u, v, rad, a, paper = 1) {
    if (a <= 0.003) return;
    const ctx = K.ctx, c = P(cm, u, v, 0, {}), top = P(cm, u, v - rad, 0, {}), bot = P(cm, u, v + rad * 0.8, 0, {});
    const rx = rad * c.s, ry = Math.max(4, (bot.y - top.y) / 2), cy = (top.y + bot.y) / 2;
    // a pool of warm light (a gradient ellipse)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a;
    ctx.translate(c.x, cy); ctx.scale(1, ry / rx);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, 'rgba(255,190,120,0.30)'); gr.addColorStop(0.45, 'rgba(255,170,100,0.11)'); gr.addColorStop(1, 'rgba(255,160,90,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
    if (paper <= 0) return;
    // the lines of the paper catch the light
    const y0 = Math.max(0, Math.floor(top.y - 4)), y1 = Math.min(H, Math.ceil(bot.y + 4)), hh = Math.min(TMP.height, y1 - y0);
    if (hh <= 2) return;
    const x0 = Math.max(0, Math.floor(c.x - rx)), x1 = Math.min(W, Math.ceil(c.x + rx));
    TG.save(); TG.setTransform(1, 0, 0, 1, 0, 0); TG.globalCompositeOperation = 'source-over'; TG.globalAlpha = 1;
    TG.clearRect(0, 0, W, hh + 2);
    TG.translate(0, -y0);
    projectLayer(TG, layers().warm, clamp(v - rad - 10, -PAD, SH + PAD), clamp(v + rad * 0.8 + 10, -PAD, SH + PAD), 1, cm, 0, y0);
    TG.globalCompositeOperation = 'destination-in';
    TG.translate(c.x, cy); TG.scale(1, ry / rx);
    const g2 = TG.createRadialGradient(0, 0, 0, 0, 0, rx);
    g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0.45)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    TG.fillStyle = g2; TG.fillRect(-rx, -rx, rx * 2, rx * 2);
    TG.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a * paper;
    ctx.drawImage(TMP, x0, 0, x1 - x0, hh, x0, y0, x1 - x0, hh); ctx.restore();
  }

  // ================================================================ 你 as a 3D particle body
  // 你 lies printed a little left of centre; it stands up beside its imprint (glyph size in world units = px when flat)
  const PSIZE = 420, PRINT_U = 370, PRINT_V = 770, STAND_U = 610, STAND_V = 830;
  let YOU = null;
  function youCloud() {
    const fk = document.fonts.check(`600 40px ${F.serif}`, '你');
    if (YOU && YOU.fk === fk) return YOU;
    const S = 420, c = PX.text('你', { size: S, family: F.serif, weight: 600, x: 0, y: S * 0.38, step: 2.0, seed: 17 }), n = c.n;
    let y0 = 1e9, y1 = -1e9; for (let i = 0; i < n; i++) { if (c.Y[i] < y0) y0 = c.Y[i]; if (c.Y[i] > y1) y1 = c.Y[i]; }
    const sc = PSIZE / S, GX = new Float32Array(n), UP = new Float32Array(n), hgt = (y1 - y0) * sc;
    for (let i = 0; i < n; i++) { GX[i] = (c.X[i] + (R(i, 26) - 0.5) * 1.6) * sc; UP[i] = (y1 - c.Y[i] + (R(i, 27) - 0.5) * 1.6) * sc; }
    // four small lights to kindle, each on a stroke: pick the particle nearest to a target spot
    const tgt = [[-0.30, 0.70], [0.16, 0.80], [0.04, 0.38], [0.30, 0.22]], EM = [];
    for (const [tx, ty] of tgt) {
      let best = 1e9, bi = 0; const X = tx * PSIZE, Y = ty * hgt;
      for (let i = 0; i < n; i++) { const d = (GX[i] - X) ** 2 + (UP[i] - Y) ** 2; if (d < best) { best = d; bi = i; } }
      EM.push([GX[bi], UP[bi]]);
    }
    const EW = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) for (let e = 0; e < 4; e++) { const d2 = (GX[i] - EM[e][0]) ** 2 + (UP[i] - EM[e][1]) ** 2; EW[i * 4 + e] = Math.exp(-d2 / (2 * 26 * 26)); }
    return (YOU = { fk, n, GX, UP, hgt, EM, EW, fs: S * sc, baseYoff: y1 * sc, X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n), Cc: new Float32Array(n * 3) });
  }

  /* draw 你. st: u, v (foot on the page), phi (0 lying on the page .. 90deg upright), yaw, lift (extra height),
     flutter (0..1: particles loosen while it peels off), t, lit, own, gray, a, em[4] (kindled lights 0..1+),
     shim (shimmer amplitude, default 1). Returns screen centre and scale. */
  function drawYou(cm, st) {
    const Y = youCloud(), n = Y.n, OX = Y.X, OY = Y.Y, OA = Y.A, CC = Y.Cc;
    const t = st.t || 0, phi = st.phi, cyaw = Math.cos(st.yaw || 0), syaw = Math.sin(st.yaw || 0), fl = st.flutter || 0;
    const lit = st.lit || 0, own = st.own || 0, gray = st.gray || 0, a = st.a == null ? 1 : st.a, em = st.em || [0, 0, 0, 0];
    const br = 0.4 * (st.shim == null ? 1 : st.shim);
    // KIT.you's colour formula
    const base = [0.62, 0.64, 0.68], lum = 0.3 * base[0] + 0.59 * base[1] + 0.11 * base[2];
    const col = [0, 1, 2].map(k => lerp(base[k] * 0.55 * (1 - 0.7 * own) + LC.lamp[k] * lit * 0.9 + LC.warm[k] * own * 1.25, lum * (0.55 + lit * 0.9 + own), gray));
    const wr = LC.warm, emOn = em[0] + em[1] + em[2] + em[3] > 0.001;
    const q = {}; let s0 = 1;
    if (st.occ > 0) occlude(cm, st, Y, cyaw, syaw);
    for (let i = 0; i < n; i++) {
      const r1 = R(i, 21), r2 = R(i, 22);
      const ph = phi + fl * (r1 - 0.5) * 0.5, up = Y.UP[i], gx = Y.GX[i];
      const u = st.u + gx * cyaw, v = st.v - up * Math.cos(ph) - gx * syaw, h = up * Math.sin(ph) + (st.lift || 0) + fl * r2 * 46 * Math.sin(r1 * 9 + t);
      P(cm, u, v, h, q);
      if (i === 0) s0 = q.s;
      OX[i] = q.x + Math.sin(t * (1.1 + r1) + r2 * 30) * br * 1.6 + fl * Math.cos(r1 * 40) * 9 * q.s;
      OY[i] = q.y + Math.cos(t * (0.9 + r2) + r1 * 30) * br * 1.6;
      let A = 1, cr = col[0], cg = col[1], cb = col[2];
      if (emOn) {
        const w = Y.EW[i * 4] * em[0] + Y.EW[i * 4 + 1] * em[1] + Y.EW[i * 4 + 2] * em[2] + Y.EW[i * 4 + 3] * em[3];
        if (w > 0.002) { const k = Math.min(1.6, w); A += k * 2.4; cr += wr[0] * k * 0.9; cg += wr[1] * k * 0.9; cb += wr[2] * k * 0.9; }
      }
      OA[i] = A; CC[i * 3] = cr; CC[i * 3 + 1] = cg; CC[i * 3 + 2] = cb;
    }
    PX.points(OX, OY, n, null, { a: 0.34 * a * (0.55 + 0.6 * lit + 0.7 * own) / 3.06, A: OA, C: CC, glow: 0.25 + 0.4 * own });
    // the centre of the body on screen (for halos, sparks, flows)
    const ph = phi, mid = Y.hgt * 0.5, c = P(cm, st.u, st.v - mid * Math.cos(ph), mid * Math.sin(ph) + (st.lift || 0), {});
    const foot = P(cm, st.u, st.v, 0, {});
    return { x: c.x, y: c.y, s: c.s, fx: foot.x, fy: foot.y, X: OX, Y: OY, n, emPos: Y.EM.map(([ex, eu]) => P(cm, st.u + ex * cyaw, st.v - eu * Math.cos(ph) - ex * syaw, eu * Math.sin(ph) + (st.lift || 0), {})) };
  }
  /* 你 is a body: it hides the paper behind it. A soft dark silhouette of the glyph, mapped onto the glyph's plane
     (an affine fit: foot, one unit across, one unit up), drawn before its light. */
  let OCC = null;
  function occSprite() {
    const fk = document.fonts.check(`600 40px ${F.serif}`, '你');
    if (OCC && OCC.fk === fk) return OCC;
    const S = 420, c = mk(560, 600), g = c.getContext('2d');
    g.filter = 'blur(5px)'; g.font = `600 ${S}px ${F.serif}`; g.textAlign = 'center'; g.fillStyle = '#05070b';
    g.fillText('你', 280, 300 + S * 0.38); g.filter = 'none';
    return (OCC = { fk, c, ox: 280, oy: 300 });
  }
  function occlude(cm, st, Y, cyaw, syaw) {
    const o = occSprite(), sc = PSIZE / 420, ph = st.phi, lf = st.lift || 0;
    const f = P(cm, st.u, st.v, lf, {}), ex = P(cm, st.u + 100 * cyaw, st.v - 100 * syaw, lf, {});
    const ey = P(cm, st.u, st.v - 100 * Math.cos(ph), 100 * Math.sin(ph) + lf, {});
    const axx = (ex.x - f.x) / 100 * sc, axy = (ex.y - f.y) / 100 * sc, ayx = (ey.x - f.x) / 100 * sc, ayy = (ey.y - f.y) / 100 * sc;
    // sprite pixel (px, py) -> cloud (X = px - ox, Y = py - oy) -> (gx = X sc, up = (y1 - Y) sc)
    const y1 = Y.baseYoff / sc;
    const ctx = K.ctx; ctx.save();
    ctx.globalAlpha *= Math.min(0.96, 0.8 * st.occ);
    ctx.transform(axx, axy, -ayx, -ayy, f.x - o.ox * axx + (y1 + o.oy) * ayx, f.y - o.ox * axy + (y1 + o.oy) * ayy);
    ctx.drawImage(o.c, 0, 0); ctx.restore();
  }
  // a soft warm halo behind 你 (own light)
  function halo(x, y, r, a) {
    if (a <= 0.003) return;
    const ctx = K.ctx; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,196,128,0.32)'); g.addColorStop(0.35, 'rgba(255,170,100,0.12)'); g.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }

  // ---------------------------------------------------------------- the child (a tiny 你 in an empty bubble)
  const KID_ROW = 16, KID_COL = (() => { for (const c of [0, 1, 3, 2]) if (c !== ans(KID_ROW)) return c; return 0; })();
  const KU = colX(KID_COL), KV = rowY(KID_ROW) + 4, KSIZE = 58;
  let KIDC = null;
  function kidCloud() {
    const fk = document.fonts.check(`600 40px ${F.serif}`, '你');
    if (KIDC && KIDC.fk === fk) return KIDC;
    const S = 80, c = PX.text('你', { size: S, family: F.serif, weight: 600, x: 0, y: S * 0.38, step: 1.15, seed: 23 }), n = c.n;
    let y1 = -1e9; for (let i = 0; i < n; i++) if (c.Y[i] > y1) y1 = c.Y[i];
    const sc = KSIZE / S, GX = new Float32Array(n), UP = new Float32Array(n);
    for (let i = 0; i < n; i++) { GX[i] = c.X[i] * sc; UP[i] = (y1 - c.Y[i]) * sc; }
    return (KIDC = { fk, n, GX, UP, X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n) });
  }
  /* kid: k (appear 0..1), phi (lean: > 90deg leans back = looking up), own, t, to (0..1 merge into 你), dest (you's
     screen points to merge into) */
  function drawKid(cm, o) {
    if (o.k <= 0.003) return;
    const Kc = kidCloud(), n = Kc.n, q = {}, t = o.t;
    const col = [0, 1, 2].map(k => lerp(lerp(0.58, 0.6, k / 2) * 0.9, LC.warm[k] * 1.1, o.own || 0));
    const sway = Math.sin(t * 0.7) * 0.04;
    for (let i = 0; i < n; i++) {
      const r1 = R(i, 41), up = Kc.UP[i], ph = o.phi + sway;
      // it condenses out of its bubble: grains rise from the oval
      const ki = ss(r1 * 0.5, 0.5 + r1 * 0.5, o.k);
      P(cm, KU + Kc.GX[i] * (0.4 + 0.6 * ki), KV - up * Math.cos(ph) * ki, up * Math.sin(ph) * ki, q);
      let x = q.x + Math.sin(t * (1.3 + r1) + i) * 0.5, y = q.y + Math.cos(t * (1.1 + r1) + i * 1.7) * 0.5, a = ki;
      if (o.to > 0 && o.dest) {
        const kk = ease.inOut(clamp((o.to - R(i, 42) * 0.35) / 0.65)), d = (i * 7) % o.dest.n;
        const mx = (x + o.dest.X[d]) / 2 + (R(i, 43) - 0.5) * 120, my = Math.min(y, o.dest.Y[d]) - 60 - R(i, 44) * 80;
        const u1 = 1 - kk; x = u1 * u1 * x + 2 * u1 * kk * mx + kk * kk * o.dest.X[d]; y = u1 * u1 * y + 2 * u1 * kk * my + kk * kk * o.dest.Y[d];
        a *= 1 - kk * kk;
      }
      Kc.X[i] = x; Kc.Y[i] = y; Kc.A[i] = a;
    }
    PX.points(Kc.X, Kc.Y, n, col, { a: 0.15 * (o.a == null ? 1 : o.a) * (1 + 1.6 * (o.own || 0)), A: Kc.A, glow: 0.12 + 0.4 * (o.own || 0) });
  }

  // ================================================================ captions (the film's voice, fixed place)
  function cap(lines, ct, t0, t1, o = {}) {
    lines = (Array.isArray(lines) ? lines : [lines]).map(noDot);
    const n = lines.reduce((a, l) => a + [...l].length, 0), d = clamp(n * 0.075, 0.9, 2.0), dl = o.delay == null ? 0.25 : o.delay;
    const k = prog(ct, t0 + dl, t0 + dl + d); if (k <= 0) return;
    const out = t1 == null ? 0 : prog(ct, t1 - 0.55, t1 - 0.05);
    if (out >= 1) return;
    KIT.caption(lines, k, { ...o, out });
  }
  const steps = api => { const m = {}; for (const s of api.steps) m[s.show] = s.lt - api.chainStart; return m; };   // chain time of each step

  // ================================================================ b18 stand
  function standState(ct, S) {
    const tUp = S.up;
    const kT = ease.inOut(prog(ct, tUp + 0.35, tUp + 5.9));              // the page tilts back into a floor
    const cm = camMix(CAM0, CAM1, kT);
    // 'given': the far end of the page lifts its head toward you, showing who handed it out; then lies back down
    cm.cu = ss(S.given + 0.1, S.given + 2.6, ct) * (1 - ss(S.kid + 0.3, S.kid + 3.0, ct));
    // 你 keeps facing the camera while the page falls away (phi = th), then settles perpendicular to the floor
    const kS = ss(tUp + 4.4, tUp + 6.4, ct);
    let phi = lerp(cm.th, 90 * DEG, kS);
    // looking: at the header (given), then down at the child (kid)
    phi -= 7 * DEG * ss(S.given + 0.4, S.given + 2.6, ct) + 5 * DEG * ss(S.kid + 1.2, S.kid + 3.6, ct);
    const yaw = 0.26 * ss(S.kid + 1.2, S.kid + 3.8, ct);
    const fl = Math.sin(Math.PI * prog(ct, tUp + 0.1, tUp + 5.0)) * 0.55;
    const lift = 34 * Math.sin(Math.PI * prog(ct, tUp + 0.6, tUp + 6.2));
    const kRise = ss(tUp + 0.2, tUp + 3.2, ct);
    // it steps off its own mark as it rises: the imprint stays where it lay
    const kM = ease.inOut(prog(ct, tUp + 1.4, tUp + 6.0));
    const u = lerp(PRINT_U, STAND_U, kM), v = lerp(PRINT_V, STAND_V, kM);
    return { cm, phi, yaw, fl, lift, kRise, kT, u, v, occ: ss(tUp + 1.0, tUp + 4.0, ct) };
  }
  T.register('stand', {
    draw(ctx, V, lt, api) {
      const S = steps(api), ct = lt - api.chainStart, st = standState(ct, S);
      const cm = st.cm;
      drawSheet(cm, { a: 1, head: ss(S.given + 0.5, S.given + 2.0, ct), print: st.kRise });
      PX.begin();
      drawKid(cm, { k: ss(S.kid + 0.6, S.kid + 3.2, ct), phi: 104 * DEG, t: lt });
      drawYou(cm, { u: st.u, v: st.v, phi: st.phi, occ: st.occ, yaw: st.yaw, lift: st.lift, flutter: st.fl, t: lt,
        gray: 1, a: 3.0, shim: 1 + st.fl });
      PX.flush({ exposure: 1.4 });
      cap(V.lines.not, ct, S.not, S.up + 0.2);
      cap(['而是从那张打分表上站起来，', '看一眼它。'], ct, S.up + 0.4, S.given);
      cap(V.lines.given, ct, S.given + 0.3, S.kid);
      cap(['那个深夜让你难受的，', '是心里那个始终在等分数的小孩。'], ct, S.kid + 0.3, api.dur + 1);
    },
    cues(V, api) {
      const S = steps(api);
      return [
        { t: S.up + 0.3, type: 'swell', dur: 5.5 },
        { t: S.up + 0.5, type: 'whoosh', dur: 4.5 },
        { t: S.given + 0.5, type: 'tick' },
        { t: S.kid + 0.8, type: 'tick' },
      ];
    },
  });

  // ================================================================ b19 tries + b20 lamp (one chain)
  const TRY = [
    { x: 112, y: 400, align: 'left', rot: -0.03, kind: 'wobble' },
    { x: 948, y: 512, align: 'right', rot: 0.02, kind: 'strike' },
    { x: 124, y: 622, align: 'left', rot: -0.012, kind: 'slip' },
    { x: 940, y: 734, align: 'right', rot: 0.026, kind: 'fall' },
  ];
  const HS = 46, CPS = 0.15;                       // hand size, seconds per character
  let LAYOUT = null;
  function layout(V) {
    if (LAYOUT) return LAYOUT;
    const list = V.lines.list;
    LAYOUT = TRY.map((L, li) => {
      let chars = [...list[li]], strike = -1;
      if (L.kind === 'strike') { const j = chars.indexOf('城'); if (j > 0) { chars = [...chars.slice(0, j), '成', ...chars.slice(j)]; strike = j; } }
      const sizes = chars.map((_, i) => HS * (1 + (R(i + li * 31, 3) - 0.5) * (L.kind === 'fall' ? 0.2 : 0.08)));
      const ws = chars.map((ch, i) => K.measure(ch, { size: sizes[i], family: F.hand }) + 2);
      const tw = ws.reduce((a, b) => a + b, 0);
      let x = L.align === 'left' ? L.x : L.x - tw;
      const cs = chars.map((ch, i) => {
        const n = chars.length, f = i / (n - 1);
        let dy = (R(i + li * 31, 4) - 0.5) * 6, rot = (R(i + li * 31, 5) - 0.5) * 0.08;
        if (L.kind === 'slip') { dy += f * f * 44; rot += f * f * 0.16; }
        const c = { ch, x, y: L.y + dy + (x - L.x) * L.rot, rot: rot + L.rot, size: sizes[i], w: ws[i], i };
        x += ws[i]; return c;
      });
      // timing: a hand writes, with a pause before the slip is struck through
      let t = 0; const tt = cs.map((c, i) => { const t0 = t; t += CPS * (0.8 + 0.5 * R(i + li * 31, 6)); if (i === strike) t += 0.42; return t0; });
      const wob = L.kind === 'wobble' ? chars.indexOf('不') : -1;
      return { ...L, cs, tt, dur: t, strike, wob, end: x };
    });
    return LAYOUT;
  }
  function drawHand(L, ct, t0, alpha, fallK) {
    const ctx = K.ctx;
    const tip = { on: false, x: 0, y: 0 };
    L.cs.forEach((c, i) => {
      const p = clamp((ct - t0 - L.tt[i]) / (CPS * 0.95)); if (p <= 0) return;
      let x = c.x, y = c.y, rot = c.rot, sx = 1, sy = 1, a = alpha;
      if (L.wob >= 0 && (i === L.wob || i === L.wob + 1)) {          // 不会: the hand hesitates over it
        const tw = ct - t0 - L.tt[i];
        rot += Math.sin(tw * 5.2 + i) * 0.09 * (0.35 + 0.65 * Math.exp(-tw * 0.6)); y += Math.sin(tw * 3.7 + i * 2) * 2.2;
      }
      if (fallK) { const f = fallK(c, i); if (f) { x = f.x; y = f.y; rot = f.rot; sx = f.sx; sy = f.sy; a *= f.a; } }
      ctx.save(); ctx.globalAlpha *= a * (0.25 + 0.75 * p);
      ctx.translate(x, y); ctx.scale(sx, sy); ctx.rotate(rot);
      if (p < 1) { ctx.beginPath(); ctx.rect(-4, -c.size * 1.1, (c.w + 8) * p, c.size * 1.5); ctx.clip(); }
      ctx.font = `400 ${c.size}px ${F.hand}`; ctx.fillStyle = INK; ctx.fillText(c.ch, 0, 0);
      ctx.restore();
      if (p > 0 && p < 1) { tip.on = true; tip.x = x + c.w * p; tip.y = y - c.size * 0.35; }
      if (i === L.strike) {                                          // crossed out, in the same warm ink
        const k = clamp((ct - t0 - L.tt[i] - CPS - 0.12) / 0.32); if (k <= 0) return;
        ctx.save(); ctx.globalAlpha *= a * 0.9; ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.translate(x, y - c.size * 0.33); ctx.rotate(rot - 0.06);
        ctx.beginPath(); const x0 = -5, x1 = c.w + 2; ctx.moveTo(x0, 2);
        for (let s = 1; s <= 12 * k; s++) { const f = s / 12; ctx.lineTo(lerp(x0, x1, f), Math.sin(f * 9) * 3 + 2 - f * 3); }
        ctx.stroke(); ctx.restore();
      }
    });
    // where a mark would be: an empty place, nothing written in it
    const ke = ss(t0 + L.dur + 0.35, t0 + L.dur + 1.3, ct);
    if (ke > 0) {
      const last = L.cs[L.cs.length - 1], ex = L.align === 'left' ? last.x + last.w + 30 : L.end + 30, ey = last.y - HS * 0.32;
      ctx.save(); ctx.globalAlpha *= alpha * ke * 0.5; ctx.strokeStyle = 'rgba(236,231,220,0.5)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.ellipse(ex, ey, 17, 11, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    return tip;
  }
  const SPX = new Float32Array(40), SPY = new Float32Array(40), SPA = new Float32Array(40);
  // a warm spark from the end of a written line into one of 你's lights
  function spark(x0, y0, x1, y1, k) {
    if (k <= 0 || k >= 1) return;
    const mx = (x0 + x1) / 2 + (x0 < x1 ? -60 : 60), my = Math.min(y0, y1) - 90;
    let m = 0;
    for (let j = 0; j < 22; j++) {
      const kk = clamp(ease.inOut(k) - j * 0.012); if (kk <= 0) break;
      const u = 1 - kk; SPX[m] = u * u * x0 + 2 * u * kk * mx + kk * kk * x1; SPY[m] = u * u * y0 + 2 * u * kk * my + kk * kk * y1; SPA[m] = (1 - j / 22) ** 2; m++;
    }
    PX.points(SPX, SPY, m, LC.warm, { a: 1.1 * Math.sin(Math.PI * Math.min(1, k * 1.15)) + 0.2, A: SPA, glow: 0.9, size: 2 });
  }
  // the lamps' light drawn down into 你
  const NL = 2400, LX = new Float32Array(NL), LY = new Float32Array(NL), LA = new Float32Array(NL), LCc = new Float32Array(NL * 3);
  const LAMPS = [{ x: 350, y: 1050 }, { x: 610, y: 1085 }, { x: 870, y: 1050 }], LAMP_H = 800;

  function triesState(ct, S, V) {
    const Ls = layout(V), tk = ['t1', 't2', 't3', 't4'].map(n => S[n]);
    const t0 = tk.map(t => t + 0.25), done = Ls.map((L, i) => t0[i] + L.dur), kin = done.map(d => d + 0.8);
    return { Ls, t0, done, kin };
  }
  function drawChain(ctx, V, ct, S, api, lt) {
    const cm = CAM1, tr = triesState(ct, S, V), take = S.take == null ? 1e9 : S.take;
    const yc = youCloud();
    // the lights: each try kindles one; the lamp's light fills the rest
    const em = tr.kin.map(k => { const e = ss(k, k + 0.5, ct); return e * (1 + 0.9 * Math.exp(-Math.max(0, ct - k) * 2.2)) * (0.92 + 0.08 * Math.sin(ct * 1.7 + k)); });
    const ownTry = 0.11 * em.reduce((a, b) => a + Math.min(1, b), 0);
    const kOwn = ss(take + 2.6, take + 6.0, ct);
    const own = lerp(ownTry, 1, kOwn), gray = Math.max(0, 1 - own * 1.9);
    const emK = em.map(e => e * (1 - 0.7 * kOwn));
    // 你 straightens up (end of b18 it was looking down at the child)
    const kUp = ss(S.try + 0.3, S.try + 3.2, ct);
    const phi = lerp(78 * DEG, 90 * DEG, kUp), yaw = lerp(0.26, 0, kUp);
    // ---- the paper floor
    drawSheet(cm, { a: 1, head: 1, print: 1 });
    // warm light on the floor: a little from the first lights, all of it once the light is yours
    const pool = 0.25 * ownTry + ss(take + 3.0, take + 7.0, ct) * 1.0;
    floorLight(cm, STAND_U, STAND_V, 230 + 260 * ss(take + 3.0, take + 7.5, ct), pool, 1);
    // ---- the tries, by hand
    const dimL = lerp(1, 0.42, ss(take + 0.2, take + 2.2, ct));
    let tip = null;
    tr.Ls.forEach((L, li) => {
      let fallK = null;
      if (L.kind === 'fall') {
        const tf = S.fine + 0.25;
        fallK = (c, i) => {
          const d = tf + 0.12 * i + R(i, 61) * 0.35, k = clamp((ct - d) / 1.7); if (k <= 0) return null;
          // it lands on the paper behind and right of 你, lying flat
          const lu = clamp(530 + (c.x + c.w * 0.5 - 540) / 0.85 + (R(i, 62) - 0.5) * 40, 60, 850), lv = 690 + R(i, 63) * 100;   // straight down, onto the paper (behind 你 they vanish behind its body)
          const p = P(cm, lu, lv, 0, {}), e = k * k * (3 - 2 * k), fallE = Math.min(1, k * k * 1.25);
          const bounce = k > 0.8 ? Math.sin((k - 0.8) / 0.2 * Math.PI) * 5 : 0;
          return { x: lerp(c.x, p.x, e) + Math.sin(k * 5 + i) * 10 * (1 - k), y: lerp(c.y, p.y, fallE) - bounce,
            rot: c.rot + (R(i, 64) - 0.5) * 1.3 * e, sx: lerp(1, p.s * 1.15, e), sy: lerp(1, p.s * 1.15 * 0.5, e), a: lerp(1, 0.6, e) };
        };
      }
      const tp = drawHand(L, ct, tr.t0[li], dimL, fallK);
      if (tp.on) tip = tp;
    });
    // ---- the lamps of the middle of the film, faint, for a moment
    const lampK = ss(take + 0.2, take + 1.6, ct) * (1 - ss(take + 2.4, take + 4.6, ct));
    if (lampK > 0.003) LAMPS.forEach((L, i) => KIT.spot(L.x, L.y, { k: lampK * 0.26, w: 120, h: LAMP_H }));
    // ---- light
    PX.begin();
    drawKid(cm, { k: 1, phi: lerp(104 * DEG, 92 * DEG, ss(take + 4, take + 7, ct)), own: 0.55 * ss(take + 4.0, take + 7.0, ct), t: lt + 30 });
    const Y = drawYou(cm, { u: STAND_U, v: STAND_V, occ: 1 + 0.2 * own, phi, yaw, t: lt + 20, gray, own, a: lerp(3.0, 1.5, own), em: emK });
    // sparks from each finished line into its light
    tr.Ls.forEach((L, li) => {
      const k = prog(ct, tr.done[li] + 0.1, tr.kin[li]); if (k <= 0 || k >= 1) return;
      const last = L.cs[L.cs.length - 1], e = Y.emPos[li];
      spark(last.x + last.w * 0.5, last.y - HS * 0.35, e.x, e.y, k);
    });
    if (tip) PX.dot(tip.x, tip.y, LC.warm, 0.5, 0.8);
    // the lamps' light, drawn down into 你 and turning warm
    const kd0 = take + 1.4;
    if (ct > kd0 && ct < take + 7) {
      let m = 0;
      for (let i = 0; i < NL; i++) {
        const L = LAMPS[i % 3], d = kd0 + R(i, 71) * 2.2, k = clamp((ct - d) / 1.5); if (k <= 0 || k >= 1) continue;
        const v = R(i, 72), top = L.y - LAMP_H, y0 = top + v * LAMP_H * 0.8, half = lerp(150 * 0.18, 150, v * 0.8);
        const x0 = L.x + (R(i, 73) * 2 - 1) * half * 0.85, j = (i * 13) % Y.n, x1 = Y.X[j], y1 = Y.Y[j];
        const e = ease.in(k) * 0.6 + ease.inOut(k) * 0.4;
        LX[m] = lerp(x0, x1, e) + Math.sin(k * Math.PI) * (R(i, 74) - 0.5) * 40; LY[m] = lerp(y0, y1, e);
        LA[m] = Math.sin(Math.PI * k) * (0.6 + 0.4 * R(i, 75));
        const w = ss(0.35, 0.95, k);
        LCc[m * 3] = lerp(LC.lamp[0], LC.warm[0], w); LCc[m * 3 + 1] = lerp(LC.lamp[1], LC.warm[1], w); LCc[m * 3 + 2] = lerp(LC.lamp[2], LC.warm[2], w);
        m++;
      }
      PX.points(LX, LY, m, null, { a: 1.0, A: LA, C: LCc, glow: 0.6, size: 2 });
    }
    PX.flush({ exposure: 1.4 });
    halo(Y.x, Y.y, 260 * Y.s / 0.7, own * 0.9 + 0.25 * kOwn * (0.9 + 0.1 * Math.sin(ct * 1.3)));
    // ---- the voice
    cap(V.lines.try, ct, S.try, S.fine + 0.0);
    cap(V.lines.fine, ct, S.fine + 0.9, take);
    if (S.take != null && api.beat.visual.lines.take) cap(api.beat.visual.lines.take, ct, take + 0.3, api.chainEnd - api.chainStart + 1);
  }
  const chainDraw = (ctx, V, lt, api) => { const S = steps(api), ct = lt - api.chainStart; drawChain(ctx, V, ct, S, api, ct); };
  const chainCues = (V, api) => {
    const S = steps(api), out = [], c0 = api.chainStart;
    const sub = (t, o) => out.push({ ...o, t: t + c0 });             // chain time -> this beat's local time
    if (S.t1 != null) {
      const tr = triesState(0, S, V);
      tr.Ls.forEach((L, i) => { sub(tr.t0[i], { type: 'type', dur: +L.dur.toFixed(2) }); sub(tr.kin[i], { type: 'glow' }); if (L.strike >= 0) sub(tr.t0[i] + L.tt[L.strike] + CPS + 0.12, { type: 'pen' }); });
      sub(S.fine + 0.3, { type: 'hush' });
    }
    if (S.take != null) { sub(S.take + 1.4, { type: 'whoosh', dur: 2.8 }); sub(S.take + 3.4, { type: 'swell', dur: 4.5 }); sub(S.take + 5.2, { type: 'glow' }); }
    return out;
  };
  T.register('tries', { draw: chainDraw, cues: chainCues });
  // b20 continues b19's picture: it draws with b19's strings (the list) plus its own caption
  let V19 = null;
  T.register('lamp', {
    draw(ctx, V, lt, api) {
      if (!V19) V19 = T.TL.beats.find(b => b.id === V.ref || b.id === api.beat.visual.ref).visual;
      chainDraw(ctx, V19, lt, api);
    },
    cues(V, api) { if (!V19) V19 = T.TL.beats.find(b => b.id === V.ref).visual; return chainCues(V19, api); },
  });

  // ================================================================ b21 end
  let TXT = null;
  function tryCloud() {
    const fk = document.fonts.check(`400 40px ${F.serif}`, 'Have a try');
    if (TXT && TXT.fk === fk) return TXT;
    const c = PX.text('Have a try', { size: 116, family: F.serif, weight: 400, x: W / 2, y: 716, step: 1.0, jitter: 0.7, seed: 9 });
    // flow order: left to right, a little loose
    const n = c.n, D = new Float32Array(n); let x0 = 1e9, x1 = -1e9;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, c.X[i]); x1 = Math.max(x1, c.X[i]); }
    for (let i = 0; i < n; i++) D[i] = clamp(0.72 * (c.X[i] - x0) / (x1 - x0) + 0.28 * R(i, 81));
    return (TXT = { fk, c, n, D, X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n) });
  }
  T.register('end', {
    draw(ctx, V, lt, api) {
      const S = steps(api), ct = lt, yc = youCloud();
      // the step: forward, off the near edge of the paper, onto the dark ground
      const tS = S.life + 1.9, kStep = ease.inOut(prog(ct, tS, tS + 1.7));
      const kc = ease.inOut(prog(ct, 0.3, 8.0)), cm = camMix(CAM1, CAM2, kc);
      cm.D += 240 * ease.inOut(prog(ct, tS - 0.3, tS + 4.5));          // the camera gives it room as it comes forward
      const v = lerp(STAND_V, SH + 70, kStep), u = lerp(STAND_U, STAND_U - 40, kStep), lift = 22 * Math.sin(Math.PI * kStep);
      const phi = 90 * DEG - 7 * DEG * Math.sin(Math.PI * kStep);
      const breath = 0.5 + 0.5 * Math.sin(ct * 1.25);
      const own = 1 + 0.06 * Math.sin(ct * 1.25 + 0.6);
      const sheetA = lerp(1, 0.55, ss(tS + 0.8, tS + 5, ct));
      drawSheet(cm, { a: sheetA, head: 1, print: 1 });
      // the warm pool travels with 你; off the paper it falls on bare ground
      const offK = ss(tS + 0.9, tS + 1.8, ct);
      floorLight(cm, u, v, 490 + 30 * breath, 1, 1 - 0.5 * offK);
      // ground: a faint warm line where the paper ends and the ground begins, lit only near 你
      PX.begin();
      const kid = ss(1.2, 5.2, ct);
      const Y = drawYou(cm, { u, v, occ: 1.2, phi, lift, t: ct + 40, own, gray: 0, a: 1.5 });
      drawKid(cm, { k: 1, phi: 92 * DEG, own: 0.55, t: ct + 60, to: kid, dest: Y });
      // Have a try: warm particles flowing out of 你's light
      const T0 = S.try + 0.15, tc = tryCloud(), n = tc.n;
      if (ct > T0) {
        for (let i = 0; i < n; i++) {
          const d = T0 + tc.D[i] * 2.3, k = clamp((ct - d) / 1.9);
          if (k <= 0) { tc.A[i] = 0; continue; }
          const j = (i * 7) % Y.n, sx = Y.X[j], sy = Y.Y[j], tx = tc.c.X[i], ty = tc.c.Y[i];
          const e = ease.inOut(k), u = 1 - e;
          const mx = lerp(sx, tx, 0.35) + (R(i, 82) - 0.5) * 260, my = lerp(sy, ty, 0.55) + (R(i, 83) - 0.3) * 120;
          const sh = 0.5 * Math.sin(ct * (1.1 + R(i, 84)) + i) * e;
          tc.X[i] = u * u * sx + 2 * u * e * mx + e * e * tx + sh; tc.Y[i] = u * u * sy + 2 * u * e * my + e * e * ty + 0.5 * Math.cos(ct * (0.9 + R(i, 85)) + i) * e;
          tc.A[i] = (1 + 1.4 * Math.sin(Math.PI * k) ** 2) * (k < 0.08 ? k / 0.08 : 1) * (0.9 + 0.1 * Math.sin(ct * 1.25 + tc.c.X[i] * 0.01));
        }
        PX.points(tc.X, tc.Y, n, LC.warm, { a: 0.34, A: tc.A, glow: 0.22 });
      }
      PX.flush({ exposure: 1.4 });
      halo(Y.x, Y.y, 300 * Y.s / 0.6, 0.9 + 0.12 * breath);
      // the voice
      cap(V.lines.years, ct, S.years + 0.4, S.try - 0.1, { y: 760 });
      cap(V.lines.life, ct, S.life + 0.2, null, { y: 858, size: 50 });
    },
    cues(V, api) {
      const S = steps(api);
      return [{ t: S.try + 0.15, type: 'title' }, { t: S.life + 1.9 + 1.5, type: 'resolve' }, { t: S.try + 0.15, type: 'swell', dur: 3.5 }];
    },
  });
})();
