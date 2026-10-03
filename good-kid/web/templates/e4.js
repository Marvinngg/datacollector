/* e4 账单不同 — bills / trap / exchange.
 * b12 bills    — three small warm lives at the top (机车 / 哑铃 / 小店的遮阳棚) each print a long thermal receipt that
 *                unrolls downward, swaying like paper in a draught; the lines type out as the paper passes the head;
 *                the total never arrives (合计 · 未知). "他们也在付账，只是账单不同。"
 * b13 trap     — a quiet leaderboard (他 / 她 / 他 / 你). Their bars shrink as their bills are deducted; 你 glides to
 *                #1, the scorer's red ✓ lands, a cold lamp switches on above you. FREEZE: time stops (dust hangs in the
 *                beam). Then the board's lines give themselves away: bars split into bubbles, the frame stretches —
 *                it was the answer sheet all along. A fine grey line strikes the ranking through, slowly.
 * b14 exchange — a jeweller's balance: 稳定 on one pan, 自由 on the other. The beam never settles. The words trade pans.
 *                The camera pulls back: the balance stands on an examiner's desk; the desk lamp flickers out; behind
 *                the desk, an empty chair. "根本就没有阅卷人。"
 * Every frame is a pure function of lt. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const { C, beat } = KIT;
  const TAU = Math.PI * 2;
  const at = (api, n) => KIT.at(api, n);
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });
  const smooth = k => k * k * (3 - 2 * k);
  const INK = a => `rgba(236,231,220,${a})`;
  const FREE = a => `rgba(255,154,92,${a})`;
  const LAMP = a => `rgba(223,232,255,${a})`;
  /* PX blurs the glow only inside the bounding box of what was drawn: two invisible corner points make it the frame */
  const CXF = new Float32Array([2, W - 3]), CYF = new Float32Array([2, H - 3]);
  const fullFrame = () => PX.points(CXF, CYF, 2, [0, 0, 0], { a: 0.001, glow: 1 });
  // smooth staircase: x advances in N little steps (a thermal printer's line feed); derivative 0 at every step
  const stair = (u, N) => { const x = u * N; return (x - Math.sin(TAU * x) / TAU) / N; };

  // ================================================================ b12 bills
  const RW = 236, RX = [230, 540, 850], SLOT_Y = 422, ICON_Y = 318;
  const RL = [700, 640, 760];                       // receipt lengths
  const R_T0 = [0.5, 0.82, 1.14], R_D = [5.7, 5.2, 6.1];  // print start (after 'print') and duration
  const PAD = 6;                                    // texture padding (x)
  let PAYK = 0;                                     // how far the sentence has risen out of the totals (dims 未知)
  const TEX = [];                                   // static paper textures (paper, grain, edges, rules, ghost rows, barcode)
  function wrap(str) {
    const i = str.indexOf('，');
    if (i > 0 && i < str.length - 1) return [str.slice(0, i + 1), str.slice(i + 1)];
    const ch = [...str]; if (ch.length <= 7) return [str];
    const m = Math.ceil(ch.length * 2 / 3); return [ch.slice(0, m).join(''), ch.slice(m).join('')];
  }
  function receiptLines(V, i) {
    const L = RL[i], [title, item] = V.lines.bills[i], it = wrap(item);
    const out = [{ y: 66, str: title, size: 31, fam: F.sans, wt: 500, align: 'center', col: INK(0.92), sp: 6 }];
    it.forEach((s, k) => out.push({ y: 136 + k * 36, str: s, size: 23, fam: F.mono, wt: 400, align: 'left', col: INK(0.8) }));
    out.push({ y: L - 112, str: '合计', size: 24, fam: F.mono, wt: 400, align: 'left', col: INK(0.8) });
    out.push({ y: L - 112, str: '未知', size: 24, fam: F.mono, wt: 400, align: 'right', col: INK(0.5 * (1 - 0.7 * PAYK)), late: 0.5 });
    return out;
  }
  function paperTex(i) {
    if (TEX[i]) return TEX[i];
    const L = RL[i], cw = RW + PAD * 2, c = mk(cw, L + 4), g = c.getContext('2d'), r = rng(101 + i * 17);
    g.translate(PAD, 0);
    // paper: a faint warm sheet, a touch brighter near the head
    const pg = g.createLinearGradient(0, 0, 0, L); pg.addColorStop(0, 'rgba(232,226,212,0.085)'); pg.addColorStop(1, 'rgba(232,226,212,0.045)');
    g.fillStyle = pg; g.fillRect(0, 0, RW, L);
    const lg = g.createLinearGradient(0, 0, 0, 360); lg.addColorStop(0, 'rgba(255,214,170,0.07)'); lg.addColorStop(1, 'rgba(255,214,170,0)');
    g.fillStyle = lg; g.fillRect(0, 0, RW, 360);
    // grain: specks and a few fibres
    for (let k = 0; k < 1700; k++) { g.fillStyle = `rgba(236,231,220,${0.02 + r() * 0.06})`; g.fillRect(r() * RW, r() * L, 1, 1); }
    for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(236,231,220,${0.015 + r() * 0.02})`; g.lineWidth = 0.6; const y = r() * L, x = r() * RW; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + r() * 30, y + (r() - 0.5) * 3); g.stroke(); }
    // edges
    g.fillStyle = INK(0.34); g.fillRect(0, 0, 1, L); g.fillRect(RW - 1, 0, 1, L);
    const dash = y => { g.strokeStyle = INK(0.3); g.lineWidth = 1; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(16, y + 0.5); g.lineTo(RW - 16, y + 0.5); g.stroke(); g.setLineDash([]); };
    dash(92); dash(214); dash(L - 152);
    // ghost rows: lines printed too faint to read (the rest of the bill)
    for (let y = 246; y < L - 176; y += 30) {
      const a = 0.07 + r() * 0.09, w1 = 50 + r() * 100, w2 = 18 + r() * 34;
      g.fillStyle = INK(a); g.beginPath(); g.roundRect(20, y, w1, 6, 3); g.fill();
      if (r() < 0.8) { g.beginPath(); g.roundRect(RW - 20 - w2, y, w2, 6, 3); g.fill(); }
    }
    // barcode
    let x = 30; const br = rng(55 + i);
    g.fillStyle = INK(0.42);
    while (x < RW - 30) { const w = 1 + Math.floor(br() * 3.2); if (br() < 0.62) g.fillRect(x, L - 84, w, 36); x += w + 1 + Math.floor(br() * 2.5); }
    return (TEX[i] = { c, cw });
  }
  const WORK = [];
  // the leading edge position (px of paper out of the head) at local time lt
  function printed(i, lt, tP) {
    const u = prog(lt, tP + R_T0[i], tP + R_T0[i] + R_D[i]);
    return RL[i] * stair(u, Math.round(RL[i] / 26));
  }
  // where a point of the hanging strip is: s = distance down the paper; returns sway dx, twist (width factor)
  function sway(i, s, t, L) {
    const f = s / 700, ph = i * 2.1;
    const dx = (7 + 3 * i) * Math.pow(f, 1.6) * Math.sin(t * 0.85 + ph - s * 0.0042) + 2.5 * f * Math.sin(t * 1.9 + ph * 1.7 - s * 0.011);
    const tw = 1 - 0.13 * f * f * (0.5 + 0.5 * Math.sin(t * 0.62 + ph * 1.3 - s * 0.006));
    return [dx, tw];
  }
  function drawReceipt(V, i, lt, tP, a) {
    const L = RL[i], vis = printed(i, lt, tP); if (vis < 1) return;
    const tex = paperTex(i), cw = tex.cw;
    const wk = WORK[i] || (WORK[i] = mk(cw, L + 4)), g = wk.getContext('2d');
    g.clearRect(0, 0, cw, L + 4); g.drawImage(tex.c, 0, 0);
    g.save(); g.translate(PAD, 0);
    for (const ln of receiptLines(V, i)) {
      // the head prints a line as the paper passes it; characters arrive a moment apart (typing)
      const k = clamp((vis - ln.y - 6) / 46 - (ln.late || 0)), n = [...ln.str].length, m = Math.floor(k * n + 0.001);
      if (m <= 0) continue;
      const s = [...ln.str].slice(0, m).join('');
      const x = ln.align === 'center' ? RW / 2 : ln.align === 'right' ? RW - 20 : 20;
      if (ln.align === 'center') {  // keep the final position while typing
        const full = measure(ln.str, { size: ln.size, family: ln.fam, weight: ln.wt, spacing: ln.sp || 0 });
        text(s, RW / 2 - full / 2, ln.y, { ctx: g, size: ln.size, family: ln.fam, weight: ln.wt, color: ln.col, spacing: ln.sp || 0 });
      } else if (ln.align === 'right') {
        const full = measure(ln.str, { size: ln.size, family: ln.fam, weight: ln.wt });
        text(s, x - full, ln.y, { ctx: g, size: ln.size, family: ln.fam, weight: ln.wt, color: ln.col });
      } else text(s, x, ln.y, { ctx: g, size: ln.size, family: ln.fam, weight: ln.wt, color: ln.col });
    }
    g.restore();
    // slice the strip onto the frame: each 4 px band hangs at its own sway and twist; the last few cm curl toward us
    const t = lt, cx = RX[i], SL = 4;
    const done = prog(lt, tP + R_T0[i] + R_D[i] - 0.2, tP + R_T0[i] + R_D[i] + 1.2);
    const CL = Math.min(vis, lerp(46, 30, done)), RC = CL * 2 / Math.PI, s0 = vis - CL;
    const yOf = s => s <= s0 ? s : s0 + RC * Math.sin((s - s0) / RC);
    const shadeOf = s => s <= s0 ? 1 : 0.62 + 0.38 * Math.cos((s - s0) / RC);
    ctx.save(); const a0 = ctx.globalAlpha * a;
    for (let s = 0; s < vis; s += SL) {
      const h = Math.min(SL, vis - s), [dx, tw] = sway(i, s + h / 2, t, L);
      const w = cw * tw, y0 = yOf(s), y1 = yOf(s + h);
      ctx.globalAlpha = a0 * (1 - (1 - tw) * 2.2) * shadeOf(s + h / 2);
      ctx.drawImage(wk, 0, s, cw, h, cx + dx - w / 2, SLOT_Y + y0, w, s <= s0 - SL ? h : Math.max(0.3, y1 - y0 + 0.25));
    }
    // the leading edge: a torn zigzag on the curled lip, with a faint highlight where the paper turns
    const [dx, tw] = sway(i, vis, t, L), w = RW * tw, x0 = cx + dx - w / 2, y0 = SLOT_Y + yOf(vis), n = 16, tw_ = w / n;
    ctx.globalAlpha = a0 * (1 - (1 - tw) * 2.2);
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let k = 0; k < n; k++) { ctx.lineTo(x0 + tw_ * (k + 0.5), y0 + 4); ctx.lineTo(x0 + tw_ * (k + 1), y0); }
    ctx.closePath(); ctx.fillStyle = 'rgba(232,226,212,0.05)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x0, y0 - 1);
    for (let k = 0; k < n; k++) { ctx.lineTo(x0 + tw_ * (k + 0.5), y0 + 4); ctx.lineTo(x0 + tw_ * (k + 1), y0 - 1); }
    ctx.strokeStyle = INK(0.3); ctx.lineWidth = 1; ctx.stroke();
    if (CL > 8) {
      const sh = s0 + RC * 0.9, [dxh, twh] = sway(i, sh, t, L), wh = RW * twh, yh = SLOT_Y + yOf(sh);
      const hg = ctx.createLinearGradient(cx + dxh - wh / 2, 0, cx + dxh + wh / 2, 0);
      hg.addColorStop(0, INK(0)); hg.addColorStop(0.5, INK(0.22)); hg.addColorStop(1, INK(0));
      ctx.strokeStyle = hg; ctx.beginPath(); ctx.moveTo(cx + dxh - wh / 2, yh); ctx.lineTo(cx + dxh + wh / 2, yh); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- the three lives as tiny warm line icons (they move a little: wheels turn, a weight lifts, an awning flutters)
  function stroke2(path, col, lw, a) {   // a soft halo stroke under a crisp one (cheap glow)
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha *= a * 0.16; ctx.strokeStyle = col; ctx.lineWidth = lw * 3.4; path(); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = lw; path(); ctx.stroke();
    ctx.restore();
  }
  function iconBike(x, y, t, a) {
    const col = C.free, r = 14, wl = [x - 29, y + 10], wr = [x + 29, y + 10], sp = -t * 5.5;
    stroke2(() => {
      ctx.beginPath();
      ctx.moveTo(wl[0] + r, wl[1]); ctx.arc(wl[0], wl[1], r, 0, TAU);
      ctx.moveTo(wr[0] + r, wr[1]); ctx.arc(wr[0], wr[1], r, 0, TAU);
      // frame: swingarm, engine cradle, seat, tank, fork, bars
      ctx.moveTo(wl[0], wl[1]); ctx.lineTo(x - 4, y + 8); ctx.lineTo(x + 6, y - 6);
      ctx.moveTo(x - 30, y - 6); ctx.lineTo(x - 8, y - 8); ctx.lineTo(x + 8, y - 12); ctx.lineTo(x + 15, y - 8);
      ctx.moveTo(x - 12, y - 7); ctx.lineTo(x - 4, y + 8);
      ctx.moveTo(wr[0], wr[1]); ctx.lineTo(x + 17, y - 18); ctx.lineTo(x + 10, y - 21);
    }, col, 2.2, a);
    // spokes turning
    ctx.save(); ctx.globalAlpha *= a * 0.7; ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.beginPath();
    for (const w of [wl, wr]) for (let k = 0; k < 3; k++) { const an = sp + k * Math.PI / 3; ctx.moveTo(w[0] - Math.cos(an) * (r - 3), w[1] - Math.sin(an) * (r - 3)); ctx.lineTo(w[0] + Math.cos(an) * (r - 3), w[1] + Math.sin(an) * (r - 3)); }
    ctx.stroke();
    // wind behind it
    for (let k = 0; k < 3; k++) {
      const u = ((t * 0.9 + k * 0.37) % 1), xx = x - 52 - u * 34, yy = y - 12 + k * 9;
      ctx.globalAlpha = a * 0.55 * Math.sin(u * Math.PI) * (ctx.globalAlpha > 0 ? 1 : 0);
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 12 - k * 3, yy); ctx.stroke();
    }
    ctx.restore();
  }
  function iconBell(x, y, t, a) {
    const col = C.free, lift = -5 * (0.5 - 0.5 * Math.cos(t * 1.9)), yy = y + 4 + lift, tilt = 0.05 * Math.sin(t * 1.9 + 0.6);
    ctx.save(); ctx.translate(x, yy); ctx.rotate(tilt);
    stroke2(() => {
      ctx.beginPath();
      ctx.moveTo(-22, 0); ctx.lineTo(22, 0);
      for (const s of [-1, 1]) {
        ctx.roundRect(s * 22 - (s > 0 ? 0 : 9), -15, 9, 30, 2);
        ctx.roundRect(s * 31 - (s > 0 ? 0 : 7), -10, 7, 20, 2);
      }
    }, col, 2.1, a);
    ctx.restore();
    // the floor it is lifted from
    ctx.save(); ctx.globalAlpha *= a * 0.35; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 34, y + 30); ctx.lineTo(x + 34, y + 30); ctx.stroke(); ctx.restore();
  }
  function iconShop(x, y, t, a) {
    const col = C.free, top = y - 22, bot = y - 2, n = 5, wB = 80, wT = 64;
    stroke2(() => {
      ctx.beginPath();
      ctx.moveTo(x - wT / 2, top); ctx.lineTo(x + wT / 2, top);
      ctx.moveTo(x - wT / 2, top); ctx.lineTo(x - wB / 2, bot);
      ctx.moveTo(x + wT / 2, top); ctx.lineTo(x + wB / 2, bot);
      for (let k = 1; k < n; k++) { ctx.moveTo(x - wT / 2 + wT * k / n, top); ctx.lineTo(x - wB / 2 + wB * k / n, bot); }
      // scalloped hem, fluttering
      ctx.moveTo(x - wB / 2, bot);
      for (let k = 0; k < n; k++) {
        const x0 = x - wB / 2 + wB * k / n, x1 = x0 + wB / n, d = 7 + 1.6 * Math.sin(t * 2.4 - k * 0.9);
        ctx.quadraticCurveTo((x0 + x1) / 2, bot + d * 1.6, x1, bot);
      }
      // the shop below: posts and a door
      ctx.moveTo(x - 34, bot + 6); ctx.lineTo(x - 34, y + 30); ctx.moveTo(x + 34, bot + 6); ctx.lineTo(x + 34, y + 30);
      ctx.moveTo(x - 9, y + 30); ctx.lineTo(x - 9, y + 12); ctx.lineTo(x + 9, y + 12); ctx.lineTo(x + 9, y + 30);
    }, col, 2.0, a);
  }
  const ICONS = [iconBike, iconBell, iconShop];

  T.register('bills', {
    draw(ctx, V, lt, api) {
      const tP = at(api, 'print'), tPay = at(api, 'pay');
      const t = lt + api.beat.start;
      // icons: a soft warm light each, then the line art
      for (let i = 0; i < 3; i++) {
        const ia = ease.out(prog(lt, tP, tP + 0.9 + i * 0.15));
        L.light(RX[i], ICON_Y, 120, 'rgba(255,160,95,0.11)', ia);
        ICONS[i](RX[i], ICON_Y, t, ia * 0.95);
        // the printer's mouth
        const sk = ease.inOut(prog(lt, tP + 0.15, tP + 0.9)), half = (RW / 2 + 14) * sk;
        ctx.save(); ctx.globalAlpha *= ia;
        ctx.strokeStyle = INK(0.45); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(RX[i] - half, SLOT_Y - 3); ctx.lineTo(RX[i] + half, SLOT_Y - 3); ctx.stroke();
        ctx.strokeStyle = INK(0.14); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(RX[i] - half + 6, SLOT_Y - 9); ctx.lineTo(RX[i] + half - 6, SLOT_Y - 9); ctx.stroke();
        ctx.restore();
      }
      const k1 = prog(lt, tPay + 0.1, tPay + 2.1), k2 = prog(lt, tPay + 0.8, tPay + 2.8);
      PAYK = smooth(Math.max(k1, k2) * 1.4 > 1 ? 1 : Math.max(k1, k2) * 1.4);
      for (let i = 0; i < 3; i++) drawReceipt(V, i, lt, tP, 1);
      // the sentence rises out of the bills: particles leave the unknown totals (未知) and gather under the strips,
      // the first clause hung from the left strip's edge, the second from the right one's
      const [s1, s2] = splitAt(V.lines.pay, '，');
      PX.begin(); fullFrame();
      const ya = SLOT_Y + RL[2] + 120, yb = ya + 92;
      // the ink lifts off the lower part of all three strips (around 合计 · 未知)
      const src = [0, 1, 2].map(i => [RX[i] - RW / 2 + 12, SLOT_Y + RL[i] - 150, RW - 24, 110]);
      gatherText(s1, RX[0] - RW / 2, ya, { align: 'left', size: 56, k: k1, src, t, tag: 1, seed: 5 });
      gatherText(s2, RX[2] + RW / 2, yb, { align: 'right', size: 56, k: k2, src, t, tag: 2, seed: 7 });
      PX.flush({ exposure: 1.4, glow: 0.8 });
    },
    cues(V, api) {
      const tP = at(api, 'print'), out = [];
      for (let i = 0; i < 3; i++) {
        out.push({ t: tP + R_T0[i], type: 'print', dur: R_D[i], i });
        // the title and the line item type out as the paper passes the head
        const tt = y => { for (let s = 0; s < R_D[i]; s += 0.02) if (printed(i, tP + R_T0[i] + s, tP) > y + 6) return tP + R_T0[i] + s; return tP + R_T0[i]; };
        out.push({ t: +tt(66).toFixed(3), type: 'type', dur: 0.5, i });
        out.push({ t: +tt(136).toFixed(3), type: 'type', dur: 0.9, i });
      }
      out.push({ t: at(api, 'pay'), type: 'hush' });
      out.push({ t: at(api, 'pay') + 0.1, type: 'swell', dur: 2.7 });
      return out;
    },
  });

  /* a line that gathers out of other things: its particles start inside the source rectangles src [[x, y, w, h], …]
     (each particle picks one), drift up in a soft arc and settle into the glyphs; a crisp line fades in at the end */
  function gatherText(str, x, y, o) {
    const size = o.size || 56, k = o.k, seed = o.seed || 3; if (k <= 0) return;
    const cl = PX.text(str, { size, family: o.family || F.serif, weight: o.weight || 500, x, y, align: o.align || 'center', spacing: o.spacing == null ? 4 : o.spacing, step: Math.max(1.3, size / 34), seed });
    const n = cl.n, b = PX.buf(n, 1300 + (o.tag || 0)), t = o.t || 0, src = o.src;
    for (let i = 0; i < n; i++) {
      const r = src[Math.floor(PX.rand(i, seed + 1) * src.length)];
      const sx = r[0] + PX.rand(i, seed + 2) * r[2], sy = r[1] + PX.rand(i, seed + 3) * r[3];
      const d = PX.rand(i, seed + 4) * 0.55, kk = ease.inOut(clamp((k - d) / 0.45));
      const arc = Math.sin(kk * Math.PI) * (40 + 60 * PX.rand(i, seed + 5));
      const w = Math.sin(t * (0.7 + PX.rand(i, seed + 6)) + i) * 0.6;
      b.X[i] = lerp(sx, cl.X[i], kk) + w + Math.sin(kk * Math.PI) * (PX.rand(i, seed + 7) - 0.5) * 30;
      b.Y[i] = lerp(sy, cl.Y[i], kk) - arc * 0.4 + w * 0.6;
      b.A[i] = clamp((k - d) * 6) * (0.3 + 0.7 * kk);
    }
    PX.points(b.X, b.Y, n, o.color || KIT.L.ink, { a: o.a == null ? 0.55 : o.a, A: b.A, glow: 0.3 });
    const ck = clamp((k - 0.85) / 0.15) * (o.crisp == null ? 0.85 : o.crisp);
    if (ck > 0) text(str, x, y, { size, family: o.family || F.serif, weight: o.weight || 500, align: o.align || 'center', spacing: o.spacing == null ? 4 : o.spacing, color: o.css || C.ink, alpha: ck });
  }
  function splitAt(str, ch) { const i = str.indexOf(ch); return i > 0 && i < str.length - 1 ? [str.slice(0, i + 1), str.slice(i + 1)] : [str, '']; }

  // ================================================================ b13 trap
  const BX = 170, BY = 440, BW = 740;
  const LB_ROW0 = 604, LB_PITCH = 118;                 // leaderboard rows
  const SROWS = 12, SH = 860, SRH = (SH - 100) / SROWS, SHY = BY + 70;   // KIT.sheet geometry (copied)
  const sRowY = i => SHY + 20 + SRH * (i + 0.5);
  const SBX0 = BX + 120, SBW = (BW - 170) / 4, sBubX = c => SBX0 + SBW * (c + 0.5);
  const BAR0 = sBubX(0) - 22, BAR1 = sBubX(3) + 22;   // the score bar spans exactly the four bubbles
  const NAME_X = 286, CHECK_X = BX + BW - 40;
  const NAMES = ['他', '她', '他'];
  const S0 = [0.93, 0.85, 0.79], S1 = [0.6, 0.52, 0.45], SY = 0.7;   // their scores before / after the bills; yours
  const ansSheet = i => Math.floor(PX.rand(i, 77) * 4);

  function trapTimes(api) {
    const tR = at(api, 'relief'), tC = at(api, 'climb'), tB = at(api, 'back'), tK = at(api, 'rank');
    return { tR, tC, tB, tK, tMorph: tB + 0.75, dMorph: 2.0, tCheck: tC + 2.5, g0: tC + 0.2, g1: tC + 2.3 };
  }
  T.register('trap', {
    draw(ctx, V, lt, api) {
      const T_ = trapTimes(api), { tR, tC, tB, tK, tMorph, dMorph, tCheck, g0, g1 } = T_;
      const frozen = lt >= tB, tau = frozen ? tB : lt;           // the motion clock stops at 'back'
      const tabs = tau + api.beat.start;
      const mk_ = smooth(prog(lt, tMorph, tMorph + dMorph));        // the board turns into the sheet
      const fz = ease.out(prog(lt, tB, tB + 0.25));
      // --- leaderboard state (from the frozen clock)
      const p = 3 - 3 * ease.inOut(prog(tau, g0, g1));   // your slot, 3 -> 0
      const youY = lerp(LB_ROW0 + p * LB_PITCH, sRowY(0), mk_);
      const sc = NAMES.map((_, r) => lerp(S0[r], S1[r], smooth(prog(tau, tR + 1.0 + r * 0.45, tR + 3.4 + r * 0.45))));
      const slotOf = r => r + smooth(clamp((r + 1) - p));       // others slide down one place as you pass them
      const rowY = r => lerp(LB_ROW0 + slotOf(r) * LB_PITCH, sRowY(r + 1), mk_);
      const boardA = ease.out(prog(lt, tR, tR + 0.9));
      // --- frame & header (board -> sheet)
      const lineA = lerp(0.3, 0.16, mk_), bottom = lerp(LB_ROW0 + 3.5 * LB_PITCH + 52, BY + SH, mk_);
      const sheetIn = smooth(prog(lt, tMorph + dMorph - 0.3, tMorph + dMorph + 0.2));   // hand over to KIT.sheet
      ctx.save(); ctx.globalAlpha *= boardA;
      const own = 1 - sheetIn;
      ctx.save(); ctx.globalAlpha *= own;
      ctx.strokeStyle = INK(lineA); ctx.lineWidth = 1.2;
      const dk = ease.inOut(prog(lt, tR, tR + 1.2));
      ctx.strokeRect(BX, BY, BW, (bottom - BY) * dk);
      ctx.beginPath(); ctx.moveTo(BX, SHY); ctx.lineTo(BX + BW * dk, SHY); ctx.stroke();
      // header label (the sheet's own header is printed below, once the board has given itself away)
      text('排名', BX + 24, BY + 46, { size: 26, family: F.sans, weight: 500, color: C.dim, spacing: 4, alpha: 1 - smooth(prog(lt, tB + 0.5, tB + 0.9)) });
      // row separators (only the leaderboard has them)
      ctx.strokeStyle = INK(0.08 * (1 - mk_));
      for (let s = 1; s < 4; s++) { const y = LB_ROW0 + (s - 0.5) * LB_PITCH; ctx.beginPath(); ctx.moveTo(BX + 20, y); ctx.lineTo(BX + BW - 20, y); ctx.stroke(); }
      // "…" (the rest of the ranking)
      text('…', NAME_X, LB_ROW0 + 3.5 * LB_PITCH + 22, { size: 34, family: F.serif, color: C.faint, align: 'center', alpha: (1 - mk_) * ease.out(prog(lt, tR + 0.8, tR + 1.6)) });
      // rows: number, name, bar -> bubbles
      const drawRow = (slotY, rank, score, name, isYou, ra, sheetRow) => {
        // rank number (stays with the slot: 01 02 03 04 -> the sheet's question numbers)
        ctx.save(); ctx.globalAlpha *= ra;
        // bar -> four bubbles
        const ry = Math.min(13, SRH * 0.32);
        const bk = smooth(prog(mk_, 0.1, 0.85));
        if (bk < 1) {   // the bar outline + score fill
          ctx.save(); ctx.globalAlpha *= 1 - smooth(prog(bk, 0, 0.25));
          ctx.strokeStyle = INK(isYou ? 0.42 : 0.3); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.roundRect(BAR0, slotY - 8, BAR1 - BAR0, 16, 8); ctx.stroke();
          ctx.fillStyle = isYou ? LAMP(0.5 + 0.3 * litK) : INK(0.34);
          ctx.beginPath(); ctx.roundRect(BAR0 + 3, slotY - 5, (BAR1 - BAR0 - 6) * score, 10, 5); ctx.fill();
          ctx.restore();
        }
        if (bk > 0) {
          ctx.save(); ctx.globalAlpha *= smooth(prog(bk, 0, 0.3)); ctx.strokeStyle = INK(lerp(0.3, 0.16, bk)); ctx.lineWidth = 1.2;
          const seg = (BAR1 - BAR0) / 4;
          for (let c = 0; c < 4; c++) {
            const x0 = BAR0 + seg * (c + 0.5), x1 = sBubX(c), cx = lerp(x0, x1, bk);
            const rx = lerp(seg / 2, 22, bk), rr = lerp(8, ry, bk);
            ctx.beginPath(); ctx.ellipse(cx, slotY, rx, rr, 0, 0, TAU); ctx.stroke();
            text('ABCD'[c], cx, slotY + 7, { size: 18, family: F.mono, color: C.faint, align: 'center', alpha: smooth(prog(bk, 0.6, 1)) });
          }
          ctx.restore();
        }
        ctx.restore();
      };
      const litK = smooth(prog(tau, tCheck + 0.1, tCheck + 0.9));
      // rank numbers belong to slots, not to people
      for (let s = 0; s < 4; s++) {
        const y = lerp(LB_ROW0 + s * LB_PITCH, sRowY(s), mk_);
        const sz = lerp(30, 24, mk_);
        text(String(s + 1).padStart(2, '0'), BX + 30, y + lerp(11, 9, mk_), { size: sz, family: F.mono, color: s === 0 && !frozen ? INK(0.5 + 0.3 * litK) : C.faint, alpha: ease.out(prog(lt, tR + 0.3 + s * 0.1, tR + 0.9 + s * 0.1)) });
      }
      for (let r = 0; r < 3; r++) {
        const y = rowY(r), ra = ease.out(prog(lt, tR + 0.4 + r * 0.12, tR + 1.0 + r * 0.12));
        // while you pass, the passed row dims a little (you slide over it)
        const pass = Math.sin(Math.PI * clamp((r + 1) - p)) * (p < r + 1 && p > r ? 1 : 0);
        drawRow(y, r, sc[r], NAMES[r], false, ra * (1 - 0.7 * pass));
        text(NAMES[r], NAME_X, y + 19, { size: 54, family: F.serif, weight: 600, color: INK(0.62), align: 'center', alpha: ra * (1 - 0.7 * pass) * (1 - smooth(prog(mk_, 0, 0.5))) });
      }
      drawRow(youY, 3, SY, '你', true, ease.out(prog(lt, tR + 0.76, tR + 1.4)));
      ctx.restore();
      // the rest of the answer sheet unrolls below the old board, then KIT.sheet takes over for good
      if (mk_ > 0) {
        ctx.save(); ctx.globalAlpha *= own;
        const top = Math.max(sRowY(3) + SRH / 2, rowY(2) + lerp(70, SRH / 2, mk_));
        ctx.beginPath(); ctx.rect(BX - 4, top, BW + 8, Math.max(0, bottom - top - 2)); ctx.clip();
        KIT.sheet(BX, BY, BW, SH, { rows: SROWS, k: 1, color: C.line });
        ctx.restore();
      }
      if (sheetIn > 0) {
        ctx.save(); ctx.globalAlpha *= sheetIn;
        const f = prog(lt, tMorph + dMorph + 0.1, tMorph + dMorph + 2.6);
        KIT.sheet(BX, BY, BW, SH, { rows: SROWS, k: 1, fill: f, marks: f, color: C.line });
        ctx.restore();
      }
      ctx.restore();
      // --- the scorer's red ✓ beside you, and the cold lamp that switches on above you
      const ckK = prog(tau, tCheck, tCheck + 0.45);
      const ckSize = lerp(40, 26, mk_), ckFade = 1 - smooth(prog(lt, tMorph + dMorph + 0.3, tMorph + dMorph + 0.6));
      if (ckK > 0 && ckFade > 0) { ctx.save(); ctx.globalAlpha *= ckFade; KIT.pen('check', CHECK_X, youY, ckSize, ease.out(ckK), { seed: 13, gray: 0.15 * fz }); ctx.restore(); }
      // lamp
      const lampK = smooth(prog(tau, tCheck + 0.15, tCheck + 0.9)) * (1 - smooth(prog(lt, tK + 1.2, tK + 3.4)) * 0.85);
      PX.begin(); fullFrame();
      if (lampK > 0) KIT.spot(NAME_X, youY + 34, { k: lampK * 0.85, w: 96, h: 470, px: true, t: tabs, dust: 1, tag: 3 });
      // you
      const youA = ease.out(prog(lt, tR + 0.76, tR + 1.4));
      const swell = 1 + 0.08 * smooth(prog(tau, tCheck + 0.3, tB + 0.9));   // you swell a little with it... and stop mid-swell
      KIT.you(NAME_X, youY, lerp(70 * swell, 58, mk_), { lit: 0.3 + 0.7 * lampK, gray: 0.3 * fz, t: tabs, breathe: 0.45, a: youA * 1.7, tag: 1 });
      PX.flush({ exposure: 1.45, glow: 0.9 });
      // --- the held frame: a quiet dimming, nothing else moves
      if (fz > 0) { ctx.save(); ctx.globalAlpha *= 0.12 * fz * (1 - smooth(prog(lt, tB + 0.6, tB + 1.6))); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      // --- the sheet's header, printed: the board was the answer sheet all along
      const hk = prog(lt, tB + 1.0, tB + 2.4), hDim = 1 - 0.45 * smooth(prog(lt, tK, tK + 1.2));
      if (hk > 0) {
        const chars = [...V.lines.back], n = chars.length, o = { size: 38, family: F.sans, weight: 500 };
        let x = BX + 26;
        chars.forEach((ch, i) => {
          const a = smooth(clamp(hk * (n + 2) - i));
          if (a > 0) text(ch, x, BY + 51, { ...o, color: C.ink, alpha: a * 0.92 * hDim });
          x += measure(ch, o) + 3;
        });
        text('答题卡', BX + BW - 24, BY + 46, { size: 22, family: F.sans, weight: 500, color: C.dim, align: 'right', spacing: 4, alpha: smooth(prog(hk, 0.6, 1)) * 0.8 });
      }
      // --- the smug margin note: your own hand, scribbled under the board while the others' bars shrink
      const nk = prog(lt, tR + 0.7, tR + 3.7), nOut = smooth(prog(lt, tB + 0.45, tB + 1.1));
      if (nk > 0 && nOut < 1) handNote(splitRelief(V.lines.relief), 214, 1196, nk, { size: 50, gap: 80, indent: 70, rot: -0.04, alpha: 1 - nOut, gray: fz, under: '更稳', uk: prog(lt, tR + 3.5, tR + 4.1) });
      // --- rank: a fine grey line strikes the ranking through, slowly, and writes the sentence as it goes
      const sk = ease.inOut(prog(lt, tK + 0.3, tK + 3.3));
      if (sk > 0) {
        const x0 = BX - 40, y0 = 1160, x1 = BX + BW + 40, y1 = 744, N = 80;
        const P = u => { const bow = Math.sin(u * Math.PI) * 14; return [lerp(x0, x1, u) - bow * 0.45, lerp(y0, y1, u) - bow]; };
        // the words ride just above the line, each one written as the line's tip passes it
        const ang = Math.atan2(y1 - y0, x1 - x0), str = [...V.lines.rank], o = { size: 44, family: F.serif, weight: 500 };
        const ws = str.map(ch => measure(ch, o) + 4), tw = ws.reduce((a, b) => a + b, 0), len = Math.hypot(x1 - x0, y1 - y0);
        let acc = (len - tw) / 2;
        ctx.save(); ctx.lineJoin = 'round';
        str.forEach((ch, i) => {
          const u = (acc + ws[i] / 2) / len, a = smooth(clamp((sk - u) / 0.05));
          acc += ws[i];
          if (a <= 0) return;
          const [px, py] = P(u);
          ctx.save(); ctx.translate(px + Math.sin(ang) * 20, py - Math.cos(ang) * 20); ctx.rotate(ang);
          ctx.globalAlpha *= a; ctx.font = `500 44px ${F.serif}`; ctx.textAlign = 'center';
          ctx.strokeStyle = C.bg; ctx.lineWidth = 9; ctx.strokeText(ch, 0, (1 - a) * 6);
          ctx.fillStyle = 'rgba(204,208,216,0.95)'; ctx.fillText(ch, 0, (1 - a) * 6);
          ctx.restore();
        });
        ctx.strokeStyle = C.gray; ctx.globalAlpha *= 0.9; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let k = 1; k <= N * sk; k++) { const [px, py] = P(k / N); ctx.lineTo(px, py); }
        ctx.stroke(); ctx.restore();
      }
    },
    cues(V, api) {
      const T_ = trapTimes(api), out = [];
      // passing each row on the way up
      for (let r = 2; r >= 0; r--) {
        // p crosses r + 0.5 (half way past the row)
        const target = 3 - (r + 0.5);   // 3*ease = target
        for (let s = 0; s < 3; s += 0.01) { if (3 * ease.inOut(prog(T_.tC + s, T_.g0, T_.g1)) >= target) { out.push({ t: +(T_.tC + s).toFixed(3), type: 'tick', r }); break; } }
      }
      out.push({ t: T_.tCheck, type: 'pen' });
      out.push({ t: T_.tCheck + 0.15, type: 'click' });
      out.push({ t: T_.tB, type: 'freeze' });
      out.push({ t: T_.tMorph + T_.dMorph + 0.1, type: 'ticks', dur: 2.5, n: 12, p0: 0.2, p1: 0.2 });
      out.push({ t: T_.tR + 0.7, type: 'pen', soft: true, dur: 3.0 });
      out.push({ t: T_.tB + 1.0, type: 'type', dur: 1.4 });
      out.push({ t: T_.tK + 0.3, type: 'hush' });
      return out;
    },
  });
  // your handwriting: characters arrive one by one, each a little off its line, a little turned
  function handNote(lines, x, y, k, o) {
    const size = o.size, N = lines.reduce((a, l) => a + [...l].length, 0), r = rng(31);
    const cw = [255, 214, 165], gw = [168, 170, 176], col = cw.map((v, i) => Math.round(lerp(v, gw[i], o.gray || 0)));
    const css = a => `rgba(${col},${a})`, fo = { size, family: F.hand };
    ctx.save(); ctx.globalAlpha *= o.alpha; ctx.translate(x, y); ctx.rotate(o.rot);
    let idx = 0, ux = null;
    lines.forEach((l, li) => {
      let cx = li * o.indent; const yy = li * o.gap;
      const chars = [...l], ui = o.under ? l.indexOf(o.under) : -1;
      chars.forEach((ch, ci) => {
        const w = measure(ch, fo), jy = (r() - 0.5) * 5, jr = (r() - 0.5) * 0.07, p = clamp(k * (N + 3) - idx);
        if (ci === ui) ux = [cx, yy];
        if (ci === ui + [...o.under].length - 1 && ux) ux.push(cx + w);
        if (p > 0) {
          const e = ease.out(p);
          ctx.save(); ctx.translate(cx + w / 2, yy + jy); ctx.rotate(jr); ctx.scale(lerp(0.9, 1, e), lerp(0.9, 1, e));
          text(ch, 0, 0, { size, family: F.hand, color: css(0.9), align: 'center', alpha: e });
          ctx.restore();
        }
        cx += w + 1; idx++;
      });
    });
    // a quick, pleased underline under 更稳
    if (ux && ux.length === 3 && o.uk > 0) {
      const [a0, yy, a1] = ux, u = ease.out(o.uk);
      ctx.strokeStyle = css(0.75); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a0 - 4, yy + 14);
      ctx.quadraticCurveTo((a0 + a1) / 2, yy + 20, lerp(a0 - 4, a1 + 12, u), yy + 12 - 4 * u); ctx.stroke();
    }
    ctx.restore();
  }
  function splitRelief(s) {
    const i = s.lastIndexOf('，');
    return i > 0 ? [s.slice(0, i + 1), s.slice(i + 1)] : [s];
  }

  // ================================================================ b14 exchange
  // the balance in its own units (origin: the centre of the plinth's foot; y up is negative)
  const PIV = -560, ARM = 300, HANG = 280;
  const PER = beat.BEAT * 8, AMP = 0.15;
  // the world (the final, pulled-back layout) — the balance stands on the desk at (SX, SY) at scale SZ
  const SX = 458, SYD = 1024, SZ = 0.42;
  const CAM0 = { x: 540, y: 1310, z: 1.12 }, CAM1 = { x: 540, y: 940, z: 1.1, fx: 540, fy: 1000 };   // screen anchor + scale: start (the balance), end (the desk)
  const DESK = { yb: 1000, yf: 1042, xb0: 140, xb1: 940, xf0: 100, xf1: 980, face: 26, apron: 44, floor: 1404 };
  function theta(lt, t0) {
    const amp = AMP * smooth(prog(lt, t0 + 0.6, t0 + 3.2));
    return amp * Math.sin(TAU * (lt - t0) / PER);
  }
  // draw the balance with the current transform; z = its scale on screen (for line widths)
  function drawBalance(th, z, o) {
    const lw = (w) => w / Math.pow(z, 0.82);
    const a = o.a == null ? 1 : o.a, dk = o.dk == null ? 1 : o.dk, light = o.light == null ? 1 : o.light;
    const ink = al => INK(al * (0.55 + 0.45 * light));
    ctx.save(); ctx.globalAlpha *= a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // plinth
    ctx.strokeStyle = ink(0.62); ctx.lineWidth = lw(1.4);
    const pk = ease.out(prog(dk, 0, 0.35));
    // a low engraved base: a front face and a bevelled top
    ctx.beginPath(); ctx.rect(-230 * pk, -62, 460 * pk, 62); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-230 * pk, -62); ctx.lineTo(-214 * pk, -76); ctx.lineTo(214 * pk, -76); ctx.lineTo(230 * pk, -62); ctx.stroke();
    ctx.strokeStyle = ink(0.22); ctx.lineWidth = lw(0.9); ctx.beginPath(); ctx.rect(-220 * pk, -54, 440 * pk, 46); ctx.stroke();
    ctx.strokeStyle = ink(0.62); ctx.lineWidth = lw(1.4);
    if (o.eng && o.eng.p) engrave([o.eng.p], [0], -21, 30, o.eng.g2, o.eng.a, light, lw);
    // pillar
    const ph = ease.inOut(prog(dk, 0.15, 0.6)), ptop = lerp(-76, PIV + 14, ph);
    ctx.beginPath(); ctx.moveTo(-6, -76); ctx.lineTo(-6, ptop); ctx.moveTo(6, -76); ctx.lineTo(6, ptop); ctx.stroke();
    if (ph > 0.98) {
      ctx.strokeRect(-13, PIV + 14, 26, 10);                     // capital
      ctx.strokeRect(-11, -372, 22, 12);                        // collar holding the dial
      // fulcrum (knife edge)
      ctx.beginPath(); ctx.moveTo(-11, PIV + 14); ctx.lineTo(0, PIV); ctx.lineTo(11, PIV + 14); ctx.stroke();
      // finial
      ctx.beginPath(); ctx.arc(0, PIV - 22, 7, 0, TAU); ctx.moveTo(0, PIV - 15); ctx.lineTo(0, PIV - 5); ctx.stroke();
    }
    // dial: an arc of graduations below the pivot
    const dka = ease.out(prog(dk, 0.45, 0.8));
    if (dka > 0) {
      ctx.save(); ctx.globalAlpha *= dka; ctx.strokeStyle = ink(0.5); ctx.lineWidth = lw(1);
      const R = 196;
      ctx.beginPath(); ctx.arc(0, PIV, R, Math.PI / 2 - 0.36, Math.PI / 2 + 0.36); ctx.stroke();
      ctx.beginPath();
      for (let k = -12; k <= 12; k++) {
        const an = Math.PI / 2 + k * 0.03, l = k === 0 ? 16 : k % 4 === 0 ? 11 : 6;
        ctx.moveTo(Math.cos(an) * R, PIV + Math.sin(an) * R); ctx.lineTo(Math.cos(an) * (R + l), PIV + Math.sin(an) * (R + l));
      }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -372); ctx.lineTo(Math.cos(Math.PI / 2 + 0.2) * R, PIV + Math.sin(Math.PI / 2 + 0.2) * R);
      ctx.moveTo(10, -372); ctx.lineTo(Math.cos(Math.PI / 2 - 0.2) * R, PIV + Math.sin(Math.PI / 2 - 0.2) * R); ctx.stroke();
      ctx.restore();
    }
    // beam (+ pointer), rotating about the pivot
    const bk = ease.inOut(prog(dk, 0.5, 0.9));
    const cs = Math.cos(th), sn = Math.sin(th);
    const R2 = (x, y) => [x * cs - y * sn, PIV + x * sn + y * cs];
    if (bk > 0) {
      ctx.save(); ctx.translate(0, PIV); ctx.rotate(th);
      const L = ARM * bk;
      ctx.strokeStyle = ink(0.85); ctx.lineWidth = lw(1.4);
      // the beam: a slender plate, wide enough to carry an engraving on each arm
      const hb = 21, he = 4, ti = Math.min(L, 276);
      ctx.beginPath(); ctx.moveTo(-L, -he); ctx.lineTo(-ti, -hb + 4); ctx.lineTo(-26, -hb); ctx.lineTo(0, -hb - 6); ctx.lineTo(26, -hb); ctx.lineTo(ti, -hb + 4); ctx.lineTo(L, -he);
      ctx.lineTo(L, he); ctx.lineTo(ti, hb - 4); ctx.lineTo(26, hb); ctx.lineTo(0, hb + 6); ctx.lineTo(-26, hb); ctx.lineTo(-ti, hb - 4); ctx.lineTo(-L, he); ctx.closePath();
      ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = ink(0.4); ctx.lineWidth = lw(0.9); ctx.beginPath();
      for (let x = 30; x < L - 10; x += 30) { ctx.moveTo(x, -hb - 1); ctx.lineTo(x, -hb - 5); ctx.moveTo(-x, -hb - 1); ctx.lineTo(-x, -hb - 5); }
      ctx.stroke();
      if (o.eng && o.eng.l && bk > 0.98) engrave([o.eng.l, o.eng.r], [-150, 152], 10, 29, o.eng.g1, o.eng.a, light, lw);
      if (bk > 0.98) { ctx.strokeStyle = ink(0.8); ctx.lineWidth = lw(1.2); ctx.beginPath(); ctx.arc(-ARM, 0, 5, 0, TAU); ctx.moveTo(ARM + 5, 0); ctx.arc(ARM, 0, 5, 0, TAU); ctx.stroke(); }
      // pointer
      const pl = 206 * bk;
      ctx.strokeStyle = ink(0.9); ctx.lineWidth = lw(1.3);
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, pl); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pl + 4); ctx.lineTo(-3, pl - 8); ctx.lineTo(3, pl - 8); ctx.closePath(); ctx.fillStyle = ink(0.9); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // pans (they hang plumb from the beam's ends)
    const hk = ease.out(prog(dk, 0.75, 1));
    const ends = [R2(-ARM, 0), R2(ARM, 0)];
    if (hk > 0) {
      ctx.save(); ctx.globalAlpha *= hk;
      for (const [ex, ey] of ends) {
        const py = ey + HANG;
        ctx.strokeStyle = ink(0.45); ctx.lineWidth = lw(0.9);
        ctx.setLineDash([3, 2.2]);
        ctx.beginPath(); ctx.moveTo(ex, ey + 5); ctx.lineTo(ex - 92, py); ctx.moveTo(ex, ey + 5); ctx.lineTo(ex + 92, py); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = ink(0.22); ctx.beginPath(); ctx.moveTo(ex, ey + 5); ctx.lineTo(ex, py - 8); ctx.stroke();
        // bowl: a shallow dish seen a little from above
        ctx.strokeStyle = ink(0.8); ctx.lineWidth = lw(1.3);
        ctx.beginPath(); ctx.ellipse(ex, py, 98, 9, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex - 98, py); ctx.quadraticCurveTo(ex, py + 46, ex + 98, py); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    return ends;
  }
  /* engraved letters: light catches them one by one (a glint runs along), then they stay as fine incised text.
     strs: pieces drawn centred at xs (local units) on baseline y; g: reveal 0..1 over all the pieces */
  function engrave(strs, xs, y, size, g, a, light, lw) {
    if (g <= 0 || a <= 0) return;
    const N = strs.reduce((s, x) => s + [...x].length, 0), fo = { size, family: F.serif, weight: 500 };
    let idx = 0;
    strs.forEach((str, j) => {
      const chars = [...str], ws = chars.map(ch => measure(ch, fo) + 3), tw = ws.reduce((p, q) => p + q, 0) - 3;
      let x = xs[j] - tw / 2;
      chars.forEach((ch, i) => {
        const e = smooth(clamp(g * (N + 3) - idx)), glint = Math.sin(Math.PI * e);
        if (e > 0) {
          text(ch, x, y + 1.2, { ...fo, color: 'rgba(0,0,0,0.6)', alpha: a * e });
          text(ch, x, y, { ...fo, color: INK(0.8 * (0.6 + 0.4 * light)), alpha: a * e });
          if (glint > 0.02) text(ch, x, y, { ...fo, color: LAMP(1), alpha: a * glint * 0.9 });
        }
        x += ws[i]; idx++;
      });
    });
  }
  const PAIR_COL = ['rgba(214,224,245,', 'rgba(255,190,140,'];   // 稳定: a cool white; 自由: a warm one
  function wordAt(str, x, y, z, col, a) {
    text(str, x, y, { size: 66, family: F.serif, weight: 600, color: col + '0.95)', align: 'center', alpha: a, spacing: 4 });
  }
  // examiner's desk, lamp, chair, pen — in world coordinates
  // the examiner's chair, behind the desk, pulled out a little and left a touch askew. Seen whole: its back above the
  // desk, its empty seat and its legs through the gap under the desk top.
  function drawChair(a, light) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const k = 0.6 + 0.4 * light;
    const cx = 732, w = 200, top = 620, seatB = 1150, seatF = 1184, sk = 10;   // sk: the chair is turned a little
    const xl = cx - w / 2, xr = cx + w / 2;
    ctx.strokeStyle = INK(0.5 * k); ctx.lineWidth = 1.5;
    ctx.beginPath();
    // back posts, continuing as the back legs
    ctx.moveTo(xl, 1366); ctx.lineTo(xl + 3, top + 26); ctx.quadraticCurveTo(cx, top - 12, xr - 3, top + 22 - sk * 0.4); ctx.lineTo(xr, 1360);
    ctx.moveTo(xl + 9, top + 52); ctx.quadraticCurveTo(cx, top + 22, xr - 9, top + 48 - sk * 0.4);
    ctx.moveTo(xl + 4, 868); ctx.lineTo(xr - 4, 864);
    ctx.stroke();
    ctx.lineWidth = 1.1; ctx.strokeStyle = INK(0.34 * k); ctx.beginPath();
    for (let j = -2; j <= 2; j++) { const x = cx + j * 32; ctx.moveTo(x, top + 44 - Math.abs(j) * 3); ctx.lineTo(x, 866); }
    ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK(0.5 * k);
    ctx.beginPath(); ctx.arc(xl + 3, top + 18, 5, 0, TAU); ctx.moveTo(xr + 2, top + 14); ctx.arc(xr - 3, top + 14, 5, 0, TAU); ctx.stroke();
    // the empty seat (seen a little from above) and the front legs
    ctx.beginPath();
    ctx.moveTo(xl - 2, seatB); ctx.lineTo(xr + 2, seatB - 3); ctx.lineTo(xr + 18 + sk, seatF - 2); ctx.lineTo(xl - 16 + sk, seatF); ctx.closePath();
    ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xl - 16 + sk, seatF); ctx.lineTo(xl - 16 + sk, seatF + 9); ctx.lineTo(xr + 18 + sk, seatF + 7); ctx.lineTo(xr + 18 + sk, seatF - 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xl - 10 + sk, seatF + 9); ctx.lineTo(xl - 12 + sk, 1392); ctx.moveTo(xr + 12 + sk, seatF + 7); ctx.lineTo(xr + 14 + sk, 1390);
    ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = INK(0.28 * k); ctx.beginPath();
    ctx.moveTo(xl - 11 + sk, 1310); ctx.lineTo(xr + 13 + sk, 1308); ctx.moveTo(xl, 1296); ctx.lineTo(xr, 1292);
    ctx.stroke();
    ctx.restore();
  }
  function drawDesk(a, light) {
    if (a <= 0) return;
    const D = DESK, k = 0.55 + 0.45 * light;
    ctx.save(); ctx.globalAlpha *= a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // back legs (further away: thinner, fainter)
    ctx.strokeStyle = INK(0.3 * k); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(D.xb0 + 22, D.yb + 40); ctx.lineTo(D.xb0 + 22, D.floor - 30); ctx.moveTo(D.xb1 - 22, D.yb + 40); ctx.lineTo(D.xb1 - 22, D.floor - 30); ctx.stroke();
    // top + apron occlude what is behind them
    ctx.fillStyle = C.bg;
    ctx.beginPath(); ctx.moveTo(D.xb0, D.yb); ctx.lineTo(D.xb1, D.yb); ctx.lineTo(D.xf1, D.yf); ctx.lineTo(D.xf1, D.yf + D.face); ctx.lineTo(D.xf0, D.yf + D.face); ctx.lineTo(D.xf0, D.yf); ctx.closePath(); ctx.fill();
    ctx.fillRect(D.xf0 + 14, D.yf + D.face, D.xf1 - D.xf0 - 28, D.apron);
    ctx.strokeStyle = INK(0.62 * k); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(D.xb0, D.yb); ctx.lineTo(D.xb1, D.yb); ctx.lineTo(D.xf1, D.yf); ctx.lineTo(D.xf0, D.yf); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(D.xf0, D.yf); ctx.lineTo(D.xf0, D.yf + D.face); ctx.lineTo(D.xf1, D.yf + D.face); ctx.lineTo(D.xf1, D.yf); ctx.stroke();
    // apron and front legs
    ctx.strokeStyle = INK(0.46 * k); ctx.lineWidth = 1.3;
    const ay = D.yf + D.face + D.apron;
    ctx.beginPath();
    ctx.moveTo(D.xf0 + 14, D.yf + D.face); ctx.lineTo(D.xf0 + 14, D.floor); ctx.moveTo(D.xf0 + 34, ay); ctx.lineTo(D.xf0 + 34, D.floor);
    ctx.moveTo(D.xf1 - 14, D.yf + D.face); ctx.lineTo(D.xf1 - 14, D.floor); ctx.moveTo(D.xf1 - 34, ay); ctx.lineTo(D.xf1 - 34, D.floor);
    ctx.moveTo(D.xf0 + 34, ay); ctx.lineTo(D.xf1 - 34, ay);
    ctx.moveTo(D.xf0 + 14, D.floor); ctx.lineTo(D.xf0 + 34, D.floor); ctx.moveTo(D.xf1 - 34, D.floor); ctx.lineTo(D.xf1 - 14, D.floor);
    ctx.stroke();
    // a drawer
    ctx.strokeStyle = INK(0.24 * k); ctx.beginPath(); ctx.rect(D.xf1 - 300, D.yf + D.face + 7, 200, D.apron - 14); ctx.moveTo(D.xf1 - 216, D.yf + D.face + D.apron / 2); ctx.lineTo(D.xf1 - 184, D.yf + D.face + D.apron / 2); ctx.stroke();
    // floor
    const fg = ctx.createLinearGradient(0, 0, W, 0); fg.addColorStop(0, INK(0)); fg.addColorStop(0.5, INK(0.16)); fg.addColorStop(1, INK(0));
    ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(30, D.floor); ctx.lineTo(W - 30, D.floor); ctx.stroke();
    ctx.restore();
  }
  // the desk lamp: base, two arms, a cone shade aimed at the balance
  const LAMPG = { bx: 178, by: 1018, ex: 152, ey: 828, hx: 244, hy: 750, ang: -0.95 };
  function drawLamp(a, on) {
    if (a <= 0) return;
    const G = LAMPG;
    ctx.save(); ctx.globalAlpha *= a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK(0.55); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(G.bx, G.by, 44, 9, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(G.bx, G.by - 6); ctx.lineTo(G.ex, G.ey); ctx.lineTo(G.hx, G.hy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(G.bx + 8, G.by - 6); ctx.lineTo(G.ex + 8, G.ey + 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(G.ex, G.ey, 5, 0, TAU); ctx.stroke();
    // shade
    ctx.translate(G.hx, G.hy); ctx.rotate(G.ang);
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(6, -8); ctx.lineTo(30, 62); ctx.lineTo(-30, 62); ctx.closePath();
    ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 62, 30, 7, 0, 0, TAU); ctx.stroke();
    // bulb (glows while on)
    if (on > 0) { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, 56, 0, 0, 56, 26); g.addColorStop(0, LAMP(0.75 * on)); g.addColorStop(1, LAMP(0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 56, 26, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function lampCone(on) {   // no hard cone: a soft breath of cold light under the shade, and a pool on the desk
    if (on <= 0) return;
    const G = LAMPG, ca = -Math.sin(G.ang), sa = Math.cos(G.ang);        // the shade's axis
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [d, r, al] of [[150, 260, 0.075], [300, 380, 0.045]]) {
      const x = G.hx + ca * d, y = G.hy + sa * d, g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, LAMP(al * on)); g.addColorStop(1, LAMP(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    const px = SX + 10, py = DESK.yb + 22, pg = ctx.createRadialGradient(px, py, 0, px, py, 240);
    pg.addColorStop(0, LAMP(0.13 * on)); pg.addColorStop(1, LAMP(0));
    ctx.fillStyle = pg; ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.18); ctx.beginPath(); ctx.arc(0, 0, 240, 0, TAU); ctx.fill(); ctx.restore();
    ctx.restore();
  }
  function drawPen(a) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(292, 1040); ctx.rotate(-0.1);
    // the red pen, capped, put down
    ctx.strokeStyle = 'rgba(229,72,77,0.8)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.roundRect(-56, -14, 96, 8, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, -14); ctx.lineTo(54, -10); ctx.lineTo(40, -6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-34, -14); ctx.lineTo(-34, -6); ctx.moveTo(-50, -15); ctx.lineTo(-22, -15); ctx.stroke();
    ctx.restore();
  }

  // the examiner's nameplate, standing at the front of the desk, in front of the empty chair
  const PLATE = { x0: 572, x1: 978, yt: 970, yb: 1034, base: 1016, size: 38, sp: 3 };
  const PLATE_C = (PLATE.x0 + PLATE.x1) / 2;
  function drawPlate(a, light) {
    if (a <= 0) return;
    const P_ = PLATE;
    ctx.save(); ctx.globalAlpha *= a; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(P_.x0, P_.yb); ctx.lineTo(P_.x0 + 6, P_.yt); ctx.lineTo(P_.x1 - 6, P_.yt); ctx.lineTo(P_.x1, P_.yb); ctx.closePath();
    ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = INK(0.55 * (0.6 + 0.4 * light)); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(P_.x0 + 6, P_.yt); ctx.lineTo(P_.x0 + 14, P_.yt - 8); ctx.lineTo(P_.x1 - 14, P_.yt - 8); ctx.lineTo(P_.x1 - 6, P_.yt); ctx.stroke();
    ctx.restore();
  }
  function exTimes(api) {
    const tS = at(api, 'scale'), tT = at(api, 'trade'), tE = at(api, 'empty');
    return { tS, tT, tE, tSwap: tT + 0.7, dSwap: 2.2, dPull: 3.2, tOff: tE + 4 * beat.BEAT, tCap: tE + 4 * beat.BEAT + 0.6 };
  }
  T.register('exchange', {
    draw(ctx, V, lt, api) {
      const X = exTimes(api), { tS, tT, tE, tSwap, dSwap, dPull, tOff, tCap } = X;
      const t = lt + api.beat.start;
      // camera: zoomed into the balance (it fills the frame), then pulling back to the desk
      const pk = ease.inOut(prog(lt, tE, tE + dPull));
      const Z0 = CAM0.z / SZ, zc = Math.exp(lerp(Math.log(Z0), Math.log(CAM1.z), pk));
      const fx = lerp(SX, CAM1.fx, pk), fy = lerp(SYD, CAM1.fy, pk), ax = lerp(CAM0.x, CAM1.x, pk), ay = lerp(CAM0.y, CAM1.y, pk);
      // lamp state: on, then it flickers out
      const fl = lt < tOff - 0.5 ? 1 : lt >= tOff ? 0 : (() => { const u = (lt - (tOff - 0.5)) / 0.5; return (1 - u) * (0.55 + 0.45 * Math.sign(Math.sin(u * 37 + 1.3))) ; })();
      const after = lt >= tOff ? Math.exp(-(lt - tOff) * 3.2) * 0.35 : 0;     // the filament's afterglow
      const on = clamp(fl);
      const reveal = smooth(prog(lt, tE + 0.2, tE + dPull));
      ctx.save();
      ctx.translate(ax, ay); ctx.scale(zc, zc); ctx.translate(-fx, -fy);
      // world: chair (in the dark), lamp light, desk, lamp, pen
      drawChair(lerp(0, 0.75, smooth(prog(lt, tE + 1.0, tE + dPull + 0.6))) * (0.6 + 0.4 * on), on);
      lampCone(on * lerp(0.6, 1, reveal) * ease.out(prog(lt, tS, tS + 1.5)));
      drawDesk(lerp(0.0, 1, reveal), on);
      drawLamp(smooth(prog(lt, tE + 0.4, tE + dPull)), Math.max(on, after));
      drawPen(smooth(prog(lt, tE + 1.2, tE + dPull + 0.4)) * (0.65 + 0.35 * on));
      // the nameplate: it says 阅卷人 — the examiner. When the lamp dies, the words that were missing condense out of the
      // empty chair in front of it, and the name slides over to make room: 根本就没有阅卷人。
      const plA = smooth(prog(lt, tE + 1.0, tE + dPull + 0.2));
      drawPlate(plA, on);
      const S_ = V.lines.empty, nm = '阅卷人', iN = S_.indexOf(nm);
      const PF = { size: PLATE.size, family: F.serif, weight: 500 };
      const wOf = str => [...str].reduce((q, ch) => q + measure(ch, PF) + PLATE.sp, 0);
      const pre = iN >= 0 ? S_.slice(0, iN) : S_, post = iN >= 0 ? S_.slice(iN + nm.length) : '';
      const x0s = PLATE_C - (wOf(S_) - PLATE.sp) / 2, slide = ease.inOut(prog(lt, tOff + 0.5, tOff + 1.7));
      if (iN >= 0 && plA > 0) {
        const xn = lerp(PLATE_C - (wOf(nm) - PLATE.sp) / 2, x0s + wOf(pre), slide);
        text(nm, xn, PLATE.base, { ...PF, color: C.ink, spacing: PLATE.sp, alpha: plA * lerp(0.62 + 0.3 * on, 0.85, slide) });
      }
      // the balance
      ctx.save(); ctx.translate(SX, SYD); ctx.scale(SZ, SZ);
      const th = theta(lt, tS), zs = zc * SZ, dk = prog(lt, tS + 0.05, tS + 1.6);
      const light = lerp(1, 0.75, 1 - on);
      const [e1, e2] = splitAt(V.lines.trade[0], '是').map((x, i, arr) => x), engA = 1 - 0.75 * pk;
      const ends = drawBalance(th, zs, { dk, light, eng: { l: e1, r: e2, p: V.lines.trade[1], g1: prog(lt, tT + 0.15, tT + 1.9), g2: prog(lt, tT + 1.7, tT + 3.5), a: engA } });
      // the words: in their pans, then they trade pans (arcs crossing above the pillar)
      const wa = ease.out(prog(lt, tS + 1.5, tS + 2.6));
      const sw = ease.inOut(prog(lt, tSwap, tSwap + dSwap));
      V.lines.pair.forEach((w, i) => {
        const [x0, y0] = ends[i], [x1, y1] = ends[1 - i];
        const lift = Math.sin(sw * Math.PI) * (i === 0 ? 330 : 190);
        const x = lerp(x0, x1, sw), y = lerp(y0, y1, sw) + HANG - 8 - lift;
        wordAt(w, x, y, zs, PAIR_COL[i], wa * (0.8 + 0.2 * light));
      });
      // the pans' front lip over the words (they sit in the dish)
      ctx.save(); ctx.globalAlpha *= ease.out(prog(dk, 0.75, 1)); ctx.strokeStyle = INK(0.8 * (0.55 + 0.45 * light)); ctx.lineWidth = 1.3 / Math.pow(zs, 0.82);
      for (const [ex, ey] of ends) { ctx.beginPath(); ctx.ellipse(ex, ey + HANG, 98, 9, 0, 0.05, Math.PI - 0.05); ctx.stroke(); }
      ctx.restore();
      ctx.restore();
      ctx.restore();
      // dust drifting in the lamp's light (it goes when the light goes)
      const dA = on * ease.out(prog(lt, tS, tS + 2));
      if (dA > 0) {
        const n = 140, out = PX.buf(n, 41), G = LAMPG, ca = -Math.sin(G.ang), sa = Math.cos(G.ang);
        for (let i = 0; i < n; i++) {
          const d = 70 + PX.rand(i, 1) * 360, sp = (PX.rand(i, 2) - 0.5) * (40 + d * 0.75);
          const fall = ((PX.rand(i, 3) * 120 + t * (2.5 + 4 * PX.rand(i, 4))) % 120) - 60;
          const wx = G.hx + ca * d - sa * sp + Math.sin(t * 0.3 + i) * 6, wy = G.hy + sa * d + ca * sp + fall;
          out.X[i] = (wx - fx) * zc + ax; out.Y[i] = (wy - fy) * zc + ay;
          out.A[i] = (0.25 + 0.75 * PX.rand(i, 5)) * Math.max(0, 1 - d / 430) * Math.max(0, 1 - Math.abs(sp) / (30 + d * 0.4));
        }
        PX.begin(); fullFrame(); PX.points(out.X, out.Y, n, KIT.L.lamp, { a: 0.55 * dA, A: out.A, glow: 0.3, size: zc > 1.6 ? 2 : 1 }); PX.flush({ exposure: 1.4, glow: 0.7 });
      }
      // the missing words gather out of the empty chair (its back and its seat) into the nameplate
      const gk = prog(lt, tOff + 0.6, tOff + 2.7);
      if (gk > 0) {
        const S2 = (wx, wy) => [(wx - fx) * zc + ax, (wy - fy) * zc + ay];
        const r2 = (x, y, w, h) => { const [a1, b1] = S2(x, y); return [a1, b1, w * zc, h * zc]; };
        const src = [r2(650, 640, 170, 220), r2(640, 1150, 200, 34)];
        const [sx, sy] = S2(x0s, PLATE.base);
        PX.begin(); fullFrame();
        gatherText(pre, sx, sy, { align: 'left', size: PLATE.size * zc, spacing: PLATE.sp * zc, k: gk, src, t, tag: 3, seed: 9 });
        if (post) { const [qx] = S2(x0s + wOf(pre) + wOf(nm), 0); gatherText(post, qx, sy, { align: 'left', size: PLATE.size * zc, spacing: PLATE.sp * zc, k: clamp(gk * 1.2 - 0.2), src, t, tag: 4, seed: 11 }); }
        PX.flush({ exposure: 1.4, glow: 0.8 });
      }
    },
    cues(V, api) {
      const X = exTimes(api), out = [];
      // the pointer passes the zero mark every half swing (on the beat)
      for (let k = 1; X.tS + k * PER / 2 < api.dur; k++) out.push({ t: +(X.tS + k * PER / 2).toFixed(3), type: 'tick', k });
      out.push({ t: X.tSwap, type: 'whoosh', dur: X.dSwap });
      out.push({ t: X.tE, type: 'hush' });
      out.push({ t: X.tOff, type: 'off' });
      out.push({ t: X.tT + 0.15, type: 'glow' });
      out.push({ t: X.tOff + 0.6, type: 'swell', dur: 2.1 });
      out.push({ t: X.tOff + 3.0, type: 'resolve' });
      return out;
    },
  });
})();
