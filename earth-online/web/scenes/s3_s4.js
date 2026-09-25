/* 地球 Online — 第三幕 s3_money「挣钱」 / 第四幕 s4_others「别人的任务」
 * Hand-off clocks (so both cuts are pixel-continuous):
 *   s2 → s3 (s0_s2.js convention, τ = s3-local time):
 *     World.draw(cam0, {fog: .85, reveal: [homeReveal()], t: τ}); World.player(.., {t: τ + 50}); questBox('', {caret, lt: τ + 100/1.1})
 *   s4 → s5 (s5_s6.js convention, T = absolute time):
 *     World.draw(cam0, {fog: .85, reveal: [homeReveal()], t: T});
 *     World.marker(cam0, spots.money, {color: P.gold, label: '挣钱', drop: 1}); World.player(.., {t: T}); questBox('挣钱')
 *   The fog clock and the pulse clock are re-phased from the first convention to the second during the big
 *   s4 zoom-out, where the camera move hides it (see clocks4).
 * Every time below is derived from E.lineLocal(...) or the scene duration. */
(function () {
  const { P, F, World, ease, prog, clamp, lerp, text, measure, panel, dot, ring } = E;
  const W = E.W, H = E.H, ctx = E.ctx;
  const home = World.home, cam0 = World.cam0, money = World.spots.money, spark = World.spots.spark;
  const FOG0 = 0.85;
  const L = id => E.lineLocal(id);

  // ---------- small helpers ----------
  const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (h, a) => { const c = hexRGB(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  // 0→1→0 bump of length d starting at a
  const bump = (t, a, d) => { const k = (t - a) / d; return k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k); };
  const logLerp = (a, b, k) => Math.exp(lerp(Math.log(a), Math.log(b), k));
  const fmt = n => { const s = Math.floor(n).toString(); return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

  // soft glow sprites (radial gradient, cached once) — used instead of shadowBlur for many lights
  const sprites = {};
  function glow(hex, a = 0.55) {
    const key = hex + a;
    if (sprites[key]) return sprites[key];
    const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, rgba(hex, a)); gr.addColorStop(0.35, rgba(hex, a * 0.35)); gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return (sprites[key] = c);
  }
  function drawGlow(hex, x, y, r, alpha) {
    if (alpha <= 0.003 || r < 1) return;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.drawImage(glow(hex), x - r, y - r, r * 2, r * 2); ctx.restore();
  }

  // standard map (the only place the map + fog + home reveal are drawn)
  function baseMap(cam, fogT, o = {}) {
    World.draw(cam, { fog: o.fog == null ? FOG0 : o.fog, t: fogT, reveal: [World.homeReveal()].concat(o.reveal || []) });
  }
  const MARK = { color: P.gold, label: '挣钱' };        // must match s5_s6.js mapState()
  const PULSE_T = 50, CARET_T = 100 / 1.1;             // s0_s2.js hand-off offsets

  // ================================================================
  // s3_money
  // ================================================================
  // the path from me to the 挣钱 marker: gentle quadratic curve, arc-length LUT (static)
  const PATH = (() => {
    const p0 = { x: home.x, y: home.y }, p2 = { x: money.x, y: money.y };
    const dx = p2.x - p0.x, dy = p2.y - p0.y, len = Math.hypot(dx, dy);
    const c = { x: (p0.x + p2.x) / 2 + (dy / len) * 0.2 * len, y: (p0.y + p2.y) / 2 - (dx / len) * 0.2 * len };
    const N = 240, pts = [], acc = [0];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
      pts.push({ x: a * p0.x + b * c.x + d * p2.x, y: a * p0.y + b * c.y + d * p2.y });
      if (i) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = acc[N];
    const at = s => { // world point at arc length s
      s = clamp(s, 0, total); let lo = 0, hi = N;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] < s) lo = m; else hi = m; }
      const k = (s - acc[lo]) / Math.max(1e-6, acc[hi] - acc[lo]);
      return { x: lerp(pts[lo].x, pts[hi].x, k), y: lerp(pts[lo].y, pts[hi].y, k) };
    };
    return { total, at };
  })();
  const PATH_S0 = 46 / cam0.zoom, PATH_S1 = PATH.total - 10 / cam0.zoom; // start past my halo, stop at the pin base

  // notifications: vivid (real life) then numb (repetition)
  const VIVID = [
    { type: 'money', title: '工资已到账', detail: '+ 8,000.00', amt: 8000, date: '2016.07' },
    { type: 'ok', title: '季度目标', check: true, detail: 'Q3 完成率 103%', date: '2016.09' },
    { type: 'work', pre: '23:47', title: '方案第 6 版', detail: '「这真的是最后一版」', date: '2016.11' },
    { type: 'money', title: '报销已通过', detail: '+ 326.00 · 打车 × 14', amt: 326, date: '2016.12' },
    { type: 'money', title: '工资已到账', detail: '+ 8,000.00', amt: 8000, date: '2017.01' },
    { type: 'money', title: '年终奖已到账', detail: '+ 24,000.00', amt: 24000, date: '2017.02' },
    { type: 'ok', title: '绩效 B+', detail: '「还有提升空间」', date: '2017.06' },
    { type: 'work', pre: '01:12', title: '方案第 7 版', detail: '方案_最终版_改3.pptx', date: '2017.09' },
  ];
  const NUMB = [
    { type: 'work', pre: '00:58', title: '方案第 8 版', detail: '方案_最终版_不改了.pptx' },
    { type: 'money', title: '工资已到账', detail: '+ 9,500.00', amt: 9500 },
    { type: 'ok', title: '季度目标', check: true, detail: 'Q2 完成率 100%' },
    { type: 'money', title: '工资已到账', detail: '+ 11,000.00', amt: 11000 },
    { type: 'money', title: '工资已到账', detail: '+ 12,500.00', amt: 12500 },
    { type: 'money', title: '工资已到账', detail: '+ 13,000.00', amt: 13000 },
    { type: 'money', title: '工资已到账', detail: '+ 13,000.00', amt: 13000 },
    { type: 'money', title: '工资已到账', detail: '+ 13,000.00', amt: 13000 },
  ];

  function tim3(sc) {
    const dur = sc.end - sc.start;
    const l7 = L('L07'), l8 = L('L08'), l9 = L('L09'), l10 = L('L10');
    const k1 = l7.start + l7.dur * 0.5, k2 = k1 + 0.22, enter = k2 + 0.55;
    const drop0 = enter + 0.18, dropDur = 0.85, land = drop0 + dropDur * 0.37;
    const path0 = land + 0.2, path1 = path0 + 1.1;
    const bal0 = path0 + 0.1;
    const p0 = Math.max(l8.start, path0 + 0.3);                // first ping
    const tKey = l10.start + l10.dur * 0.3;                     // "到账的提示音响了" — the ping nobody looks up for
    const K = 11, beat = (tKey - p0) / K;
    const D = clamp(Math.round((l9.start - p0) / beat), 3, K - 2); // numbness begins
    const lastT = Math.min(l10.end + 0.25, dur - 1.35);
    const pings = [];
    for (let i = 0; ; i++) {
      const t = p0 + i * beat; if (t > lastT && i > K) break; if (i > 40) break;
      let it;
      if (i < D) it = VIVID[i % VIVID.length];
      else if (i === K) it = NUMB[3];
      else it = NUMB[Math.min(NUMB.length - 1, i - D)];
      pings.push({ i, t, it, dull: i >= D, key: i === K });
    }
    const nd = pings.filter(p => p.dull).length;
    pings.forEach(p => {
      p.d = p.dull ? (p.i - D + 1) / nd : 0;                              // 0 vivid … 1 most numb
      p.v = p.dull ? +lerp(1, 0.2, nd > 1 ? (p.i - D) / (nd - 1) : 1).toFixed(2) : 1;
      p.react = p.i < D ? 1 : p.i < K ? lerp(0.75, 0.3, (p.i - D) / Math.max(1, K - 1 - D)) : 0;
      if (!p.it.date) p.date = String(2018 + (p.i - D)) + '.0' + (3 + ((p.i * 5) % 7));
      else p.date = p.it.date;
    });
    const numb0 = l9.start - 0.5, numb1 = l10.end;
    const out0 = dur - 1.25, out1 = dur - 0.2;
    return { dur, k1, k2, enter, drop0, dropDur, land, path0, path1, bal0, pings, beat, D, K, numb0, numb1, out0, out1 };
  }

  // balance: steady trickle + eased jumps on every 到账
  function balance(lt, tm) {
    if (lt < tm.bal0) return 0;
    let v = (lt - tm.bal0) * 37.5;
    for (const p of tm.pings) if (p.it.amt && lt > p.t) v += p.it.amt * ease.out(prog(lt, p.t, p.t + 0.9));
    return v;
  }

  // odometer-style rolling number, right-aligned
  function odometer(v, rate, xr, yb, size, color, alpha) {
    if (alpha <= 0.003) return;
    ctx.save();
    ctx.globalAlpha *= alpha; ctx.font = E.font(size, F.mono, 400); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const cw = ctx.measureText('0').width, lh = size * 1.18;
    const intLen = Math.max(1, Math.floor(v).toString().length);
    const slots = [{ k: 0 }, { k: 1 }, { s: '.' }];
    for (let i = 0; i < intLen; i++) { if (i && i % 3 === 0) slots.push({ s: ',' }); slots.push({ k: i + 2 }); }
    slots.push({ s: '¥', gap: 10 });
    let x = xr;
    ctx.beginPath(); ctx.rect(xr - cw * (slots.length + 1) - 20, yb - size * 0.92, cw * (slots.length + 1) + 30, size * 1.12); ctx.clip();
    for (const sl of slots) {
      x -= cw + (sl.gap || 0);
      const cx = x + cw / 2;
      if (sl.s) { ctx.fillText(sl.s, cx, yb); continue; }
      const val = v * 100 / Math.pow(10, sl.k), base = Math.floor(val), f = val - base;
      let roll = clamp((f - 0.9) * 10);
      if (rate * 100 / Math.pow(10, sl.k) > 6) roll = 0;        // fast digits just count
      roll = ease.inOut(roll);
      const d0 = base % 10, d1 = (d0 + 1) % 10;
      if (roll < 0.999) ctx.fillText(String(d0), cx, yb - roll * lh);
      if (roll > 0.001) ctx.fillText(String(d1), cx, yb + (1 - roll) * lh);
    }
    ctx.restore();
  }

  // icon badges for notification cards
  function badge(type, cx, cy, r, a, d) {
    const col = type === 'money' ? P.gold : type === 'ok' ? P.ok : P.dim;
    const pass = (c, al) => {
      if (al <= 0.003) return;
      ring(cx, cy, r, c, { alpha: al * 0.55, lineWidth: 1.4 });
      ctx.save(); ctx.globalAlpha *= al;
      if (type === 'money') text('¥', cx, cy + r * 0.42, { size: r * 1.2, family: F.mono, color: c, align: 'center' });
      else if (type === 'ok') {
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.2, r * 0.13); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(cx - r * 0.42, cy + r * 0.02); ctx.lineTo(cx - r * 0.1, cy + r * 0.34); ctx.lineTo(cx + r * 0.45, cy - r * 0.3); ctx.stroke();
      } else {
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, r * 0.1);
        const w = r * 0.82, h = r * 1.02;
        ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r * 0.12); ctx.stroke();
        ctx.beginPath(); for (let k = 0; k < 3; k++) { const yy = cy - h * 0.2 + k * h * 0.2; ctx.moveTo(cx - w * 0.28, yy); ctx.lineTo(cx + w * (k === 2 ? 0.05 : 0.28), yy); } ctx.stroke();
      }
      ctx.restore();
    };
    pass(col, a * (1 - d));
    pass(P.faint, a * d);
  }

  const NX = W - 80, NBOT = 880, NW = 392;   // stack grows upward from just above the subtitle band
  function cardH(p) { return (p.d > 0.5 ? 64 : 92) * cardS(p); }
  function cardS(p) { return lerp(1, 0.56, p.d); }

  function notifCard(p, xr, y, alpha) {
    if (alpha <= 0.003) return;
    const s = cardS(p), w = NW * s, h = cardH(p), x = xr - w, d = p.d, it = p.it;
    const detA = 1 - smooth(0.18, 0.45, d);          // details drop out as it goes numb
    panel(x, y, w, h, { alpha: alpha * lerp(1, 0.75, d), r: 14 * s, stroke: rgba(P.ink, lerp(0.16, 0.08, d)) });
    const ink = lerp(1, 0.38, d);
    const ty = detA > 0.02 ? y + 38 * s : y + h / 2 + 8 * s;
    badge(it.type, x + 34 * s, detA > 0.02 ? y + 46 * s : y + h / 2, 16 * s, alpha * lerp(1, 0.7, d), d);
    let tx = x + 64 * s;
    if (it.pre) {
      text(it.pre, tx, ty, { size: 20 * s, family: F.mono, color: P.dim, alpha: alpha * ink });
      tx += measure(it.pre, { size: 20 * s, family: F.mono }) + 12 * s;
    }
    text(it.title, tx, ty, { size: 24 * s, family: F.sans, weight: 500, color: P.ink, alpha: alpha * ink });
    if (it.check) {
      const cx = tx + measure(it.title, { size: 24 * s, family: F.sans, weight: 500 }) + 10 * s;
      text('✓', cx, ty, { size: 24 * s, family: F.sans, weight: 700, color: d > 0.3 ? P.faint : P.ok, alpha: alpha * ink });
    }
    text(p.date, xr - 20 * s, y + 34 * s, { size: 15 * s, family: F.mono, color: P.faint, align: 'right', alpha: alpha * lerp(1, 0.7, d), spacing: 1 });
    if (detA > 0.02 && it.detail) {
      const mono = it.type === 'money' || /\.pptx|%/.test(it.detail);
      text(it.detail, x + 64 * s, y + 70 * s, {
        size: (mono ? 19 : 18) * s, family: mono ? F.mono : F.sans,
        color: it.type === 'money' ? P.gold : P.dim, alpha: alpha * detA * lerp(0.95, 0.6, d),
      });
    }
  }

  function drawS3(lt, sc, T) {
    const tm = tim3(sc), cam = cam0;
    const numb = ease.inOut(prog(lt, tm.numb0, tm.numb1));
    const out = 1 - ease.inOut(prog(lt, tm.out0, tm.out1));        // all s3-only UI fades by the end
    const pathDraw = ease.inOut(prog(lt, tm.path0, tm.path1));
    const pathA = pathDraw * lerp(1, 0.35, numb) * out;

    // fog lit along the path (fades back as it goes numb; gone at the end)
    const reveal = [];
    if (pathA > 0.004) for (let k = 1; k <= 6; k++) {
      const u = k / 6, pt = PATH.at(lerp(PATH_S0, PATH.total, u));
      const lit = clamp((pathDraw - u * 0.8) * 4);
      reveal.push({ x: pt.x, y: pt.y, r: k === 6 ? 330 : 240, a: 0.5 * lit * lerp(1, 0.35, numb) * out });
    }
    baseMap(cam, lt, { reveal });

    // dotted path
    if (pathA > 0.004) {
      const sEnd = lerp(PATH_S0, PATH_S1, pathDraw);
      ctx.save();
      ctx.setLineDash([0.1, 11]); ctx.lineCap = 'round'; ctx.lineWidth = 3;
      const pathStroke = (col, al) => {
        if (al <= 0.003) return;
        ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.beginPath();
        for (let s = PATH_S0; s <= sEnd; s += 6) { const q = World.toScreen(cam, PATH.at(s).x, PATH.at(s).y); s === PATH_S0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); }
        ctx.stroke();
      };
      pathStroke(P.gold, 0.75 * pathA * (1 - numb));
      pathStroke(P.faint, 0.9 * pathA * numb + 0.0);
      ctx.restore();
      // motes grinding along the path at constant speed
      const speed = 85 / cam.zoom, gap = 70 / cam.zoom, span = PATH_S1 - PATH_S0;
      const motesA = pathA * smooth(tm.path1 - 0.4, tm.path1 + 0.3, lt);
      if (motesA > 0.004) for (let m = 0; m < 12; m++) {
        const s = ((lt * speed + m * gap) % (gap * 12));
        if (s > span) continue;
        const q = World.toScreen(cam, PATH.at(PATH_S0 + s).x, PATH.at(PATH_S0 + s).y);
        const edge = smooth(0, 0.08, s / span) * (1 - smooth(0.9, 1, s / span));
        drawGlow(P.gold, q.x, q.y, 11, motesA * edge * 0.9 * (1 - numb));
        dot(q.x, q.y, 2.6, P.gold, { alpha: motesA * edge * (1 - numb) });
        dot(q.x, q.y, 2.2, P.faint, { alpha: motesA * edge * numb * 1.2 });
      }
    }

    // the gold marker
    if (lt >= tm.drop0) World.marker(cam, money.x, money.y, { ...MARK, drop: prog(lt, tm.drop0, tm.drop0 + tm.dropDur) });

    // me — every 到账 used to make me look up (a tiny hop + gold ring). Not anymore.
    let hop = 0;
    for (const p of tm.pings) {
      if (lt < p.t || lt > p.t + 1.2 || p.react <= 0) continue;
      hop += 7 * p.react * bump(lt, p.t + 0.04, 0.38);
      const k = prog(lt, p.t, p.t + 0.95), s = World.toScreen(cam, home.x, home.y);
      ring(s.x, s.y, 12 + ease.out(k) * 44, P.gold, { alpha: 0.75 * p.react * (1 - k), lineWidth: 1.6 });
      drawGlow(P.gold, s.x, s.y, 46, 0.55 * p.react * (1 - ease.out(k)));
    }
    World.player(cam, home.x, home.y - hop / cam.zoom, { t: lt + PULSE_T });

    // quest box: caret types 挣钱, enter
    let content = '', caret = true, clt = lt + CARET_T;
    if (lt >= tm.k1) content = '挣'; if (lt >= tm.k2) content = '挣钱';
    if (lt >= tm.k1 - 0.35 && lt < tm.enter) clt = 0;               // caret holds solid while typing
    if (lt >= tm.enter) caret = false;
    E.questBox(content, { caret, lt: clt });
    const flash = lt >= tm.enter ? 1 - ease.out(prog(lt, tm.enter, tm.enter + 1.6)) : 0;
    if (flash > 0.003) text('挣钱', 80 + 28, 72 + 80, { size: 34, family: F.sans, weight: 500, color: P.gold, alpha: flash });
    if (flash > 0.003) { // enter: a thin gold rule sweeps under the field
      const k = ease.outExpo(prog(lt, tm.enter, tm.enter + 0.6));
      ctx.save(); ctx.globalAlpha = flash * 0.8; ctx.fillStyle = P.gold; ctx.fillRect(80 + 28, 72 + 92, 464 * k, 1.5); ctx.restore();
    }

    // balance HUD (top-right, mirrors the quest box)
    const balA = ease.out(prog(lt, tm.bal0, tm.bal0 + 0.6)) * out;
    if (balA > 0.003) {
      const bx = W - 80 - 392, by = 72, bw = 392, bh = 104;
      const dy = (1 - balA) * -8;
      panel(bx, by + dy, bw, bh, { alpha: balA, r: 12 });
      text('余额', bx + 28, by + dy + 38, { size: 20, family: F.sans, weight: 500, color: P.dim, alpha: balA, spacing: 4 });
      // CNY tag, briefly replaced by the latest "+ amount"
      let flashAmt = 0, amtStr = '';
      for (const p of tm.pings) if (p.it.amt && !p.dull && lt >= p.t && lt < p.t + 1.6) { flashAmt = window_(lt, p.t, p.t + 1.6, 0.25, 0.5); amtStr = '+' + fmt(p.it.amt) + '.00'; }
      text('CNY', bx + bw - 28, by + dy + 38, { size: 16, family: F.mono, color: P.faint, align: 'right', spacing: 3, alpha: balA * (1 - flashAmt) });
      if (flashAmt > 0.003) text(amtStr, bx + bw - 28, by + dy + 38 - (1 - flashAmt) * 6, { size: 18, family: F.mono, color: P.gold, align: 'right', alpha: balA * flashAmt });
      const v = balance(lt, tm), rate = (balance(lt + 1 / 30, tm) - v) * 30;
      odometer(v, rate, bx + bw - 28, by + dy + 86, 40, P.gold, balA * (1 - numb * 0.85));
      odometer(v, rate, bx + bw - 28, by + dy + 86, 40, P.faint, balA * numb);
    }

    // notification stream
    for (let n = 0; n < tm.pings.length; n++) {
      const p = tm.pings[n]; if (lt < p.t) break;
      // pushed up by every newer card
      let y = NBOT - cardH(p);
      for (let m = n + 1; m < tm.pings.length; m++) {
        const q = tm.pings[m]; if (lt < q.t) break;
        const k = q.dull ? ease.inOut(prog(lt, q.t, q.t + 0.22)) : ease.outExpo(prog(lt, q.t, q.t + 0.5));
        y -= k * (cardH(q) + lerp(14, 8, q.d));
      }
      const ink = p.dull ? prog(lt, p.t, p.t + 0.18) : ease.out(prog(lt, p.t, p.t + 0.35));
      const slide = p.dull ? (1 - ease.inOut(prog(lt, p.t, p.t + 0.2))) * 36 : (1 - ease.outExpo(prog(lt, p.t, p.t + 0.6))) * 90;
      const depth = 1 - smooth(505, 400, y);          // dissolve before reaching the marker
      notifCard(p, NX + slide, y, ink * depth * out);
    }
  }
  const window_ = E.window;

  function cuesS3(sc) {
    const tm = tim3(sc), c = [];
    c.push({ t: tm.k1, type: 'key' }, { t: tm.k2, type: 'key' }, { t: tm.enter, type: 'enter' }, { t: tm.land, type: 'drop' });
    for (const p of tm.pings) c.push(p.dull ? { t: p.t, type: 'ping_dull', v: p.v } : { t: p.t, type: 'ping' });
    return c;
  }

  E.register('s3_money', { draw(ctx_, lt, sc, T) { drawS3(lt, sc, T); }, cues: cuesS3 });

  // ================================================================
  // s4_others
  // ================================================================
  const ZH = 0.112, ZH2 = 0.1;                    // hold zoom (slow drift from ZH to ZH2)
  const ZMID = (ZH + ZH2) / 2;
  // three featured players: placed so that at the hold zoom they sit where their cards read well
  const atScreen = (sx, sy) => ({ x: home.x + (sx - W / 2) / ZMID, y: home.y + (sy - H / 2) / ZMID });
  const FEAT = [
    { ...atScreen(372, 560), name: '楼下面馆老板', task: '把汤熬好', note: '备注：每天只卖到下午两点', side: 1 },
    { ...atScreen(1330, 318), name: '前同事 · 在大理', task: '今天什么都不做', side: 1 },
    { ...atScreen(1150, 800), name: '我妈', task: '阳台那盆茉莉，今年得开花', side: 1 },
  ];

  // hundreds of other players, clustered like towns, each on its own slow route (static data)
  const PLAYERS = (() => {
    const r = E.rng(20240517), out = [];
    const towns = [];
    for (let i = 0; i < 22; i++) {
      let x, y, ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) {
        x = lerp(-6500, 12500, r()); y = lerp(-3400, 9400, r());
        ok = Math.hypot(x - home.x, y - home.y) > 2200;
      }
      towns.push({ x, y, s: lerp(500, 1300, r()), n: Math.floor(lerp(8, 26, r())) });
    }
    const gauss = () => { const u = Math.max(1e-6, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const add = (x, y) => {
      if (Math.hypot(x - home.x, y - home.y) < 1300) return;
      if (FEAT.some(f => Math.hypot(x - f.x, y - f.y) < 900)) return;
      const route = r() < 0.42;
      const p = { x, y, route, size: lerp(1.5, 2.7, r() * r()), br: lerp(0.45, 1, r()), ph: r() * Math.PI * 2 };
      if (route) {
        const ang = r() * Math.PI * 2, len = lerp(500, 1400, r());
        p.bx = x + Math.cos(ang) * len; p.by = y + Math.sin(ang) * len;
        const bend = lerp(-0.35, 0.35, r());
        p.cx = (x + p.bx) / 2 - Math.sin(ang) * len * bend; p.cy = (y + p.by) / 2 + Math.cos(ang) * len * bend;
        p.w = (2 * Math.PI) / lerp(18, 34, r());
        p.mark = r() < 0.55; p.gold = r() < 0.12;
      } else {
        p.ax = lerp(140, 420, r()); p.ay = lerp(140, 420, r());
        p.w1 = lerp(0.05, 0.13, r()) * (r() < 0.5 ? -1 : 1); p.w2 = lerp(0.05, 0.13, r());
      }
      out.push(p);
    };
    for (const tw of towns) for (let k = 0; k < tw.n; k++) add(tw.x + gauss() * tw.s, tw.y + gauss() * tw.s * 0.8);
    for (let k = 0; k < 140; k++) add(lerp(-7000, 13000, r()), lerp(-3800, 9800, r()));
    return out;
  })();

  function playerPos(p, lt) {
    if (p.route) {
      const u = 0.5 - 0.5 * Math.cos(p.w * lt + p.ph), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
      return { x: a * p.x + b * p.cx + d * p.bx, y: a * p.y + b * p.cy + d * p.by };
    }
    return { x: p.x + Math.sin(p.w1 * lt * 2.2 + p.ph) * p.ax, y: p.y + Math.sin(p.w2 * lt * 2.2 + p.ph * 1.7) * p.ay };
  }

  function tim4(sc) {
    const dur = sc.end - sc.start;
    const l11 = L('L11'), l12 = L('L12'), l13 = L('L13'), l14 = L('L14'), l15 = L('L15'), l16 = L('L16');
    const zs = clamp(l11.start - 1.2, 1.2, 2.2);                   // ~2 s of stillness first
    const ze = Math.max(zs + 2.6, l11.end - 0.1);
    const c3 = Math.max(ze + 2.2, l12.start + l12.dur * 0.82 - 1.45); // 茉莉 lands with "一盆花"
    const c1 = ze + 0.1, c2 = (c1 + c3) / 2;
    const happy = l13.start + 0.35;
    const zb0 = Math.max(l13.end + 0.3, happy + 1.8), zb1 = zb0 + 2.5;
    const sparkT = Math.max(zb1 + 0.1, l14.start + l14.dur * 0.3);
    const clockIn = sparkT + 0.55;
    const alarm = Math.max(l16.start + l16.dur * 0.42, clockIn + 2);
    const ticks = []; for (let t = clockIn + 1.15; t < alarm - 0.5; t += 1.1) ticks.push(t);
    const fizzle = alarm + 0.12, emberEnd = Math.min(alarm + 2.1, dur - 0.6);
    const clockOut0 = Math.min(l16.end + 0.1, dur - 1.1), clockOut1 = dur - 0.3;
    return { dur, zs, ze, c: [c1, c2, c3], happy, zb0, zb1, sparkT, clockIn, ticks, alarm, fizzle, emberEnd, clockOut0, clockOut1, l15 };
  }

  // s4 starts on s3's clocks (fog t = s3-local, pulse t = s3-local + 50) and must end on absolute T (s5).
  // Both are advanced by a constant during the zoom-out: fog by s3.start (its drift has no visible period),
  // the pulse only by the phase difference mod its 1.25 s period.
  function clocks4(lt, tm, sc) {
    const s3 = E.scene('s3_money'), s3dur = s3.end - s3.start;
    const k = ease.inOut(prog(lt, tm.zs, tm.ze));
    const dP = (((s3.start - PULSE_T) % 1.25) + 1.25) % 1.25;
    return { fogT: s3dur + lt + k * s3.start, pulseT: s3dur + PULSE_T + lt + k * dP + (k >= 1 ? (s3.start - PULSE_T - dP) : 0) };
  }

  function zoomAt(lt, tm) {
    if (lt <= tm.zs) return cam0.zoom;
    if (lt < tm.ze) return logLerp(cam0.zoom, ZH, ease.inOut(prog(lt, tm.zs, tm.ze)));
    if (lt < tm.zb0) return logLerp(ZH, ZH2, ease.sine(prog(lt, tm.ze, tm.zb0)));
    if (lt < tm.zb1) return logLerp(ZH2, cam0.zoom, ease.inOut(prog(lt, tm.zb0, tm.zb1)));
    return cam0.zoom;
  }

  // mirrored copies of the map so the far-out view is contours all the way to the edge of the frame
  function mirrorTiles(cam) {
    const map = World._map; if (!map) return;
    const S = World.size, hw = W / 2 / cam.zoom, hh = H / 2 / cam.zoom;
    const x0 = cam.x - hw, x1 = cam.x + hw, y0 = cam.y - hh, y1 = cam.y + hh;
    if (x0 >= 0 && y0 >= 0 && x1 <= S && y1 <= S) return;
    const sz = S * cam.zoom;
    ctx.save(); ctx.imageSmoothingQuality = 'high';
    for (let j = Math.floor(y0 / S); j <= Math.floor(y1 / S); j++) for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) {
      if (i === 0 && j === 0) continue;
      const p = World.toScreen(cam, i * S, j * S), fx = i & 1, fy = j & 1;
      ctx.save(); ctx.translate(p.x + (fx ? sz : 0), p.y + (fy ? sz : 0)); ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
      ctx.drawImage(map, 0, 0, sz, sz); ctx.restore();
    }
    ctx.restore();
  }

  function infoCard(f, s, lt, t0, fade) {
    const dA = ease.out(prog(lt, t0, t0 + 0.3));
    if (dA <= 0 || fade <= 0.003) return;
    const nameO = { size: 20, family: F.sans, weight: 500, spacing: 1 };
    const labO = { size: 15, family: F.sans, weight: 500, spacing: 4 };
    const taskO = { size: 32, family: F.hand };
    const noteO = { size: 18, family: F.sans };
    const pad = 24;
    const w = Math.ceil(Math.max(measure(f.name, nameO) + 18, measure(f.task, taskO), f.note ? measure(f.note, noteO) : 0, 180) + pad * 2);
    const h = f.note ? 162 : 128;
    // leader: from the player up-right to the card's lower-left corner
    const ax = s.x + 7, ay = s.y - 7, bx = s.x + 30, by = s.y - 30;
    ctx.save(); ctx.globalAlpha = fade * 0.55; ctx.strokeStyle = P.warm; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lerp(ax, bx, dA), lerp(ay, by, dA)); ctx.stroke(); ctx.restore();
    const ca = ease.out(prog(lt, t0 + 0.18, t0 + 0.7)) * fade;
    if (ca <= 0.003) return;
    const x = bx, y = by - h + (1 - ease.out(prog(lt, t0 + 0.18, t0 + 0.8))) * 12;
    panel(x, y, w, h, { alpha: ca, r: 12, fill: rgba(P.bg2, 0.93), stroke: rgba(P.warm, 0.26) });
    // name
    const tName = t0 + 0.35, cpsName = 16;
    const nm = E.typed(f.name, lt, tName, cpsName);
    dot(x + pad + 3, y + 30, 3.2, P.warm, { alpha: ca });
    text(nm, x + pad + 16, y + 37, { ...nameO, color: P.warm, alpha: ca });
    // label + task (hand-written)
    const tLab = E.typedDone(f.name, tName, cpsName) + 0.15, tTask = tLab + 0.25, cpsTask = 11;
    text('当前任务', x + pad, y + 70, { ...labO, color: P.dim, alpha: ca * ease.out(prog(lt, tLab, tLab + 0.3)) });
    const tk = E.typed(f.task, lt, tTask, cpsTask);
    text(tk, x + pad, y + 110, { ...taskO, color: P.ink, alpha: ca });
    if (f.note) {
      const tNote = E.typedDone(f.task, tTask, cpsTask) + 0.3;
      text(E.typed(f.note, lt, tNote, 15), x + pad, y + 145, { ...noteO, color: P.dim, alpha: ca });
    }
  }
  function cardKeys(f, t0) {
    const out = [], tName = t0 + 0.35;
    const push = (str, a, cps) => { const n = Array.from(str).length; for (let i = 1; i <= n; i++) out.push(a + i / cps); };
    push(f.name, tName, 16);
    const tTask = E.typedDone(f.name, tName, 16) + 0.4; push(f.task, tTask, 11);
    if (f.note) push(f.note, E.typedDone(f.task, tTask, 11) + 0.3, 15);
    return out;
  }

  function drawS4(lt, sc, T) {
    const tm = tim4(sc);
    const zoom = zoomAt(lt, tm), cam = { x: home.x, y: home.y, zoom };
    const u = clamp(Math.log(cam0.zoom / zoom) / Math.log(cam0.zoom / ZH));   // 0 at my map … 1 fully out
    const fog = lerp(FOG0, 0.36, ease.sine(u));

    // cards (and warm pockets around their players)
    const cardFade = 1 - ease.inOut(prog(lt, tm.zb0 - 0.55, tm.zb0 + 0.15));
    const reveal = [];
    FEAT.forEach((f, i) => { const k = ease.out(prog(lt, tm.c[i], tm.c[i] + 1.2)) * cardFade * u; if (k > 0.004) reveal.push({ x: f.x, y: f.y, r: 900, a: 0.55 * k }); });

    // spark: flickers up in the fog after we come back
    const sparkOn = ease.outBack(prog(lt, tm.sparkT, tm.sparkT + 0.5));
    const sparkLive = lt < tm.fizzle ? 1 : 1 - ease.in(prog(lt, tm.fizzle, tm.fizzle + 0.35));
    const grow = 1 + 0.25 * smooth(tm.clockIn, tm.alarm, lt);
    const flick = 0.82 + 0.18 * E.vnoise(lt * 7.3, 3.1) + 0.06 * Math.sin(lt * 23);
    const sI = clamp(sparkOn) * sparkLive * flick;
    if (sI > 0.004) reveal.push({ x: spark.x, y: spark.y, r: 250 * grow, a: 0.42 * sI });

    if (u > 0) mirrorTiles(cam);
    const ck = clocks4(lt, tm, sc);
    baseMap(cam, ck.fogT, { fog, reveal });

    // depth: the far world sinks into the dark
    if (u > 0.004) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 1150);
      g.addColorStop(0, rgba(P.bg, 0)); g.addColorStop(1, rgba(P.bg, 0.6 * u));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // ---- other players ----
    const pa = smooth(0.12, 0.8, u);
    const wave = (sx, sy) => { const d = Math.hypot(sx - W / 2, sy - H / 2); return bump(lt, tm.happy + d / 700, 1.1); };
    if (pa > 0.004) {
      const pts = [];
      for (const p of PLAYERS) {
        const q = playerPos(p, lt), s = World.toScreen(cam, q.x, q.y);
        if (s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H + 60) { pts.push(null); continue; }
        const d = Math.hypot(s.x - W / 2, s.y - H / 2);
        pts.push({ s, a: pa * p.br * (1 - 0.55 * smooth(350, 1150, d)), p });
      }
      // their routes + markers (one batched stroke)
      ctx.save(); ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
      ctx.strokeStyle = rgba(P.warm, 0.13 * pa); ctx.beginPath();
      for (const p of PLAYERS) if (p.route) {
        const a = World.toScreen(cam, p.x, p.y), c = World.toScreen(cam, p.cx, p.cy), b = World.toScreen(cam, p.bx, p.by);
        if (Math.max(a.x, b.x) < -40 || Math.min(a.x, b.x) > W + 40 || Math.max(a.y, b.y) < -40 || Math.min(a.y, b.y) > H + 40) continue;
        ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      // wanderers: short fading trail
      ctx.strokeStyle = rgba(P.warm, 0.16 * pa); ctx.beginPath();
      for (const p of PLAYERS) if (!p.route) {
        for (let k = 0; k <= 5; k++) { const q = playerPos(p, lt - 4 + k * 0.8), s = World.toScreen(cam, q.x, q.y); k ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }
      }
      ctx.stroke();
      // little diamond markers at the end of some routes
      const ms = lerp(3.2, 5, u);
      for (const gold of [false, true]) {
        ctx.fillStyle = rgba(gold ? P.gold : P.warm, 0.55 * pa); ctx.beginPath();
        for (const p of PLAYERS) if (p.route && p.mark && p.gold === gold) {
          const b = World.toScreen(cam, p.bx, p.by); if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) continue;
          ctx.moveTo(b.x, b.y - ms * 2); ctx.lineTo(b.x + ms, b.y - ms); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x - ms, b.y - ms); ctx.closePath();
        }
        ctx.fill();
      }
      ctx.restore();
      // lights
      for (const e of pts) if (e) {
        const wv = wave(e.s.x, e.s.y);
        drawGlow(P.warm, e.s.x, e.s.y, (9 + e.p.size * 3) * (1 + 0.5 * wv), e.a * (0.55 + 0.45 * wv));
      }
      ctx.save(); ctx.fillStyle = P.warm;
      for (const e of pts) if (e) {
        ctx.globalAlpha = Math.min(1, e.a * 1.1);
        ctx.beginPath(); ctx.arc(e.s.x, e.s.y, e.p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ---- the three featured players and their cards ----
    FEAT.forEach((f, i) => {
      const t0 = tm.c[i];
      const q = { x: f.x + Math.sin(lt * 0.21 + i * 2) * 90, y: f.y + Math.cos(lt * 0.17 + i) * 60 };
      const s0 = World.toScreen(cam, q.x, q.y);
      const a = pa;
      if (a <= 0.004) return;
      const hop = 7 * bump(lt, t0 + 0.55, 0.42) + 5 * bump(lt, tm.happy + 0.25 + i * 0.22, 0.4);
      const warmth = ease.out(prog(lt, t0 + 0.4, t0 + 1.4)) * cardFade;
      const s = { x: s0.x, y: s0.y - hop };
      drawGlow(P.warm, s.x, s.y, 20 + 16 * warmth + 10 * wave(s0.x, s0.y), a * (0.7 + 0.3 * warmth));
      dot(s.x, s.y, 3.4, P.warm, { alpha: a });
      if (warmth > 0.01) ring(s0.x, s0.y, 9 + 3 * Math.sin(lt * 2 + i), P.warm, { alpha: 0.35 * warmth * a, lineWidth: 1 });
      infoCard(f, s0, lt, t0, cardFade * a);
    });

    // ---- me, my marker, my quest ----
    World.marker(cam, money.x, money.y, { ...MARK, drop: 1, size: lerp(1, 0.55, u) });
    World.player(cam, home.x, home.y, { t: ck.pulseT });

    // spark: a very small ember in the fog
    const ss = World.toScreen(cam, spark.x, spark.y);
    if (lt >= tm.sparkT && lt < tm.emberEnd + 0.1) {
      const k0 = prog(lt, tm.sparkT, tm.sparkT + 1.1);
      if (k0 < 1) ring(ss.x, ss.y, 6 + ease.out(k0) * 46, P.ember, { alpha: 0.55 * (1 - k0), lineWidth: 1.2 });
      if (sI > 0.004) {
        drawGlow(P.ember, ss.x, ss.y, 48 * grow * (0.9 + 0.1 * flick), 0.8 * sI);
        // while it lasts, a few embers drift up from it — slow, like something you could watch for hours
        for (let n = 0; n < 4; n++) {
          const per = 2.6, ph = ((lt - tm.sparkT) / per + n / 4) % 1, x0 = (E.hash2(n, 5) - 0.5) * 10;
          const mx = ss.x + x0 + Math.sin(ph * 5 + n) * 4 * ph, my = ss.y - 6 - ph * 46;
          dot(mx, my, 1.3 * (1 - ph * 0.6), P.ember, { alpha: sI * Math.sin(Math.PI * ph) * 0.7 * smooth(tm.sparkT + 0.3, tm.sparkT + 1.2, lt) });
        }
        drawGlow(P.ember, ss.x, ss.y, 12 * grow, sI);
        dot(ss.x, ss.y, 2.6 * grow * clamp(sparkOn), P.ink, { alpha: 0.9 * sI });
      }
      // fizzle: a few specks drop away, a coal glows and goes out
      if (lt >= tm.fizzle) {
        const k = prog(lt, tm.fizzle, tm.fizzle + 1.0), rr = E.rng(77);
        for (let n = 0; n < 5; n++) {
          const ang = -Math.PI / 2 + (rr() - 0.5) * 2.4, sp = lerp(14, 34, rr());
          const x = ss.x + Math.cos(ang) * sp * ease.out(k), y = ss.y + Math.sin(ang) * sp * ease.out(k) + 26 * k * k;
          dot(x, y, 1.3, P.ember, { alpha: (1 - k) * 0.8 });
        }
        const coal = 1 - smooth(tm.fizzle + 0.2, tm.emberEnd, lt);
        const breathe = 0.7 + 0.3 * Math.sin(lt * 5.1);
        drawGlow(P.ember, ss.x, ss.y + 2, 9, 0.5 * coal * breathe * smooth(tm.fizzle, tm.fizzle + 0.25, lt));
        dot(ss.x, ss.y + 2, 1.4, P.ember, { alpha: 0.75 * coal * breathe * smooth(tm.fizzle, tm.fizzle + 0.25, lt) });
      }
    }

    E.questBox('挣钱', { alpha: lerp(1, 0.6, smooth(0, 1, u)) });

    // clock HUD: 01:40 … minute by minute … 08:00
    const ca = ease.out(prog(lt, tm.clockIn, tm.clockIn + 0.6)) * (1 - ease.inOut(prog(lt, tm.clockOut0, tm.clockOut1)));
    if (ca > 0.003) {
      let m = 100; for (const t of tm.ticks) if (lt >= t) m++;
      const alarmed = lt >= tm.alarm;
      const str = alarmed ? '08:00' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
      const shake = alarmed ? Math.sin((lt - tm.alarm) * 70) * 7 * Math.pow(1 - prog(lt, tm.alarm, tm.alarm + 0.6), 2) : 0;
      ctx.save(); ctx.translate(shake, 0);
      E.clockHUD(str, { alpha: ca, label: alarmed ? '闹钟' : '本地时间' });
      if (!alarmed) dot(W - 80 - 28, 72 + 32, 3, P.ember, { alpha: ca * sI * 0.9 });
      ctx.restore();
    }
  }

  function cuesS4(sc) {
    const tm = tim4(sc), c = [];
    c.push({ t: tm.zs, type: 'whoosh', dur: +(tm.ze - tm.zs).toFixed(2) });
    FEAT.forEach((f, i) => { c.push({ t: tm.c[i] + 0.18, type: 'card' }); for (const k of cardKeys(f, tm.c[i])) c.push({ t: +k.toFixed(3), type: 'key' }); });
    c.push({ t: tm.zb0, type: 'whoosh', dur: +(tm.zb1 - tm.zb0).toFixed(2) });
    c.push({ t: tm.sparkT, type: 'spark' });
    for (const t of tm.ticks) c.push({ t, type: 'tick' });
    c.push({ t: tm.alarm, type: 'alarm' }, { t: tm.fizzle, type: 'fizzle' });
    return c;
  }

  E.register('s4_others', { draw(ctx_, lt, sc, T) { drawS4(lt, sc, T); }, cues: cuesS4 });
})();
