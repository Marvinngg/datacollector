/* Game-theory diagrams (2): chapters 5–7.
 *   chicken    — game of chicken: approach / throw (steering wheel out of the window) / swerve
 *   adverse    — adverse selection: crowd / price / leave
 *   insurance  — screening with a menu: plans / sort
 *   shops      — one-shot vs repeated game: oneshot / repeated
 *   rounds     — backward induction vs KMRW: backward / kmrw / note
 *   tournament — tit for tat and its forgiving variant: titfortat / forgive (+note)
 * Every template reads its texts from V first and only falls back to this film's defaults.
 * Timing: each step is anchored to its narration line; inside a line, sub-moments are placed at the
 * position of a phrase in the line text (proportional estimate), with a fallback fraction. */
(function () {
  const { P, F, text, measure, ease, prog, clamp, lerp } = K;
  const TAU = Math.PI * 2;
  const DARK = '#0a0d13';

  // ---------------------------------------------------------------- timing helpers
  // time (beat-local) of a phrase inside narration line k; frac is used when the phrase is not found
  function ph(api, k, needle, frac) {
    const L = api.line(k); if (!L) return null;
    const bl = api.beat.lines[k], s = (bl && bl.text) || '';
    let f = frac;
    if (needle && s) { const j = s.indexOf(needle); if (j >= 0) f = j / s.length; }
    return L.start + L.dur * f;
  }
  // step handle: { t, at(needle, frac, fallbackSeconds), end }
  function S(api, name, fbT) {
    const i = api.steps.findIndex(s => s.show === name);
    const s = i >= 0 ? api.steps[i] : null;
    const t = s ? s.lt : fbT;
    const k = s && s.at != null ? s.at : null;
    const L = k != null && s.owner === api.beat.id ? api.line(k) : null;
    return {
      i, s, t, L,
      end: L ? Math.max(t + 0.5, L.end) : t + 4,
      at(needle, frac, fb) {
        if (L) { const x = ph(api, k, needle, frac); return Math.max(t, x); }
        return t + fb;
      },
    };
  }
  const fin = (lt, a, d = 0.6) => isFinite(a) ? ease.out(prog(lt, a, a + d)) : (a < 0 ? 1 : 0);
  const fio = (lt, a, b, d = 0.5) => isFinite(b) ? Math.min(fin(lt, a, d), 1 - ease.in(prog(lt, b - d, b))) : fin(lt, a, d);
  function A(ctx, a, fn) { if (a <= 0.001) return; ctx.save(); ctx.globalAlpha *= a; fn(); ctx.restore(); }
  const rise = (a, px = 18) => (1 - a) * px;
  function cue(list, t, type, extra) { if (t != null && isFinite(t)) list.push({ t, type, ...(extra || {}) }); }

  // ---------------------------------------------------------------- drawing helpers
  // little person, (x, y) = feet
  function person(ctx, x, y, s, color, a = 1) {
    A(ctx, a, () => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(x - 17 * s, y - 27 * s, 34 * s, 27 * s, [15 * s, 15 * s, 4 * s, 4 * s]); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 41 * s, 11 * s, 0, TAU); ctx.fill();
    });
  }
  function arrow(ctx, x1, y1, x2, y2, color, o = {}) {
    const lw = o.lw || 3, hd = o.head || 14, ang = Math.atan2(y2 - y1, x2 - x1);
    A(ctx, o.alpha == null ? 1 : o.alpha, () => {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(ang) * hd * 0.6, y2 - Math.sin(ang) * hd * 0.6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(ang - 0.42) * hd, y2 - Math.sin(ang - 0.42) * hd);
      ctx.lineTo(x2 - Math.cos(ang + 0.42) * hd, y2 - Math.sin(ang + 0.42) * hd);
      ctx.closePath(); ctx.fill();
    });
  }
  function card(ctx, x, y, w, h, o = {}) {
    A(ctx, o.alpha == null ? 1 : o.alpha, () => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, o.r || 18);
      ctx.fillStyle = o.fill || 'rgba(16,21,30,0.86)'; ctx.fill();
      ctx.lineWidth = o.lw || 2; ctx.strokeStyle = o.stroke || 'rgba(233,228,216,0.18)';
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.stroke(); ctx.setLineDash([]);
    });
  }
  function pill(ctx, str, x, y, color, o = {}) {       // x = left, y = centre
    const size = o.size || 34, w = measure(str, { size, weight: 500 }) + size * 1.1, h = size * 1.55;
    A(ctx, o.alpha == null ? 1 : o.alpha, () => {
      ctx.beginPath(); ctx.roundRect(x, y - h / 2, w, h, h / 2);
      ctx.fillStyle = color; ctx.globalAlpha *= 0.16; ctx.fill(); ctx.globalAlpha /= 0.16;
      ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
      text(str, x + w / 2, y + 1, { size, weight: 500, color, align: 'center', baseline: 'middle' });
    });
    return w;
  }
  // coloured string pieces on one line: [[str, color, opts], ...], centred on x (or aligned by o.align)
  function runs(pieces, x, y, o = {}) {
    const size = o.size || 40, fam = o.family || F.sans, wt = o.weight || 500;
    const ws = pieces.map(p => measure(p[0], { size: (p[2] && p[2].size) || size, family: (p[2] && p[2].family) || fam, weight: wt }));
    const tot = ws.reduce((a, b) => a + b, 0);
    let cx = o.align === 'left' ? x : o.align === 'right' ? x - tot : x - tot / 2;
    pieces.forEach((p, i) => {
      text(p[0], cx, y, { size, family: fam, weight: wt, color: p[1], ...(p[2] || {}), alpha: o.alpha });
      cx += ws[i];
    });
    return tot;
  }
  // square legend chip
  function legend(ctx, items, x, y, o = {}) {        // items [[label,color]], left-aligned
    const size = o.size || 28; let cx = x;
    for (const [lab, col] of items) {
      if (o.person) person(ctx, cx + 12, y + 14, 0.62, col); else { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(cx, y - 11, 22, 22, 5); ctx.fill(); }
      text(lab, cx + 36, y + 1, { size, color: P.ink, baseline: 'middle' });
      cx += 36 + measure(lab, { size }) + 40;
    }
  }
  function titleL(str, lt, t0, o = {}) {
    const a = fin(lt, t0, 0.7);
    text(str, o.x || 160, (o.y || 215) + rise(a, 10), { size: o.size || 50, family: F.serif, weight: 600, color: o.color || P.ink, alpha: a * (o.alpha == null ? 1 : o.alpha) });
  }

  // ================================================================= chicken
  // top-down car; heading +x at angle 0
  const CAR_L = 170, CAR_W = 84;
  function car(ctx, x, y, ang, color, o = {}) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const L = CAR_L, W = CAR_W;
    // wheels
    ctx.fillStyle = '#05070b'; ctx.strokeStyle = 'rgba(233,228,216,0.25)'; ctx.lineWidth = 1.5;
    for (const sx of [-0.3, 0.3]) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.roundRect(sx * L - 18, sy * W / 2 - 8, 36, 16, 4); ctx.fill(); ctx.stroke(); }
    // body
    ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, 22); ctx.fillStyle = color; ctx.fill();
    // cabin glass (windshield front, rear window, roof)
    ctx.fillStyle = 'rgba(10,13,19,0.72)';
    ctx.beginPath(); ctx.moveTo(L * 0.08, -W * 0.36); ctx.lineTo(L * 0.26, -W * 0.3); ctx.lineTo(L * 0.26, W * 0.3); ctx.lineTo(L * 0.08, W * 0.36); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.36, -W * 0.3); ctx.lineTo(-L * 0.26, -W * 0.34); ctx.lineTo(-L * 0.26, W * 0.34); ctx.lineTo(-L * 0.36, W * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.roundRect(-L * 0.24, -W * 0.34, L * 0.3, W * 0.68, 8); ctx.fill();
    // headlights
    ctx.fillStyle = P.warm;
    for (const sy of [-1, 1]) { ctx.beginPath(); ctx.roundRect(L / 2 - 9, sy * W * 0.3 - 6, 7, 12, 3); ctx.fill(); }
    // steering wheel seen through the windshield
    if (o.wheel) steer(ctx, L * 0.13, -W * 0.16, 10, 0, DARK, 1);
    ctx.restore();
  }
  function steer(ctx, x, y, r, rot, color, a = 1) {
    A(ctx, a, () => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, r * 0.24); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.lineWidth = Math.max(1.5, r * 0.16);
      for (let k = 0; k < 3; k++) { const an = -Math.PI / 2 + k * TAU / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); ctx.stroke(); }
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, TAU); ctx.fill();
      ctx.restore();
    });
  }
  function streaks(ctx, x, y, ang, lt, amt, seed) {
    if (amt <= 0.01) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.lineCap = 'round';
    for (let j = 0; j < 4; j++) {
      const off = [-28, -9, 11, 30][j], ph0 = (lt * 2.6 + j * 0.37 + seed) % 1;
      const x0 = -CAR_L / 2 - 16 - ph0 * 170, len = 50 + 40 * ((j * 7 + seed * 10) % 3) / 2;
      ctx.globalAlpha = amt * 0.5 * (1 - ph0);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x0, off); ctx.lineTo(x0 - len, off); ctx.stroke();
    }
    ctx.restore();
  }

  T.register('chicken', {
    timing(V, api) {
      const Ap = S(api, 'approach', 0.3), Th = S(api, 'throw', api.dur * 0.45), Sw = S(api, 'swerve', api.dur * 0.72);
      const tA = Ap.t, tLift = Th.at('拆', 0.42, 1.4), tFly = Th.at('扔', 0.64, 2.3), tLand = tFly + 1.05;
      const tS = Sw.t, tDodge = tS + 0.45, tConc = tS + 1.5;
      if (api.silent) {
        // no narration: the caption appears, then things unfold slowly
        const lift = Th.t, fly = lift + 1.0, land = fly + 1.5, dodge = tS + 1.2;
        return { silent: true, tA: 0, tT: Th.t, tLift: lift, tFly: fly, tLand: land, tS, tDodge: dodge, tConc: Infinity, dLat: 2.2, dRun: 3.2, lift: 0.8 };
      }
      return { tA, tT: Th.t, tLift, tFly, tLand, tS, tDodge, tConc, dLat: 1.3, dRun: 2.0, lift: 0.6 };
    },
    draw(ctx, V, lt, api) {
      const cx = 960, roadY = 520, RH = 110;
      const tm = this.timing(V, api), { tA, tLift, tFly, tLand, tS, tDodge, tConc, dLat, dRun } = tm, sil = !!tm.silent;
      // ---- kinematics (pure functions of time) ----
      const D = t => {
        if (sil) return 1350 - 110 * clamp(t, 0, tDodge + dRun) - 1000 * ease.inOut(prog(t, tDodge, tDodge + dRun));
        let d = lerp(2150, 1060, ease.out(prog(t, tA, tA + 1.8)));
        d -= 270 * prog(t, tA + 1.8, tLand);
        d -= 110 * prog(t, tLand, tDodge);
        d -= 1300 * ease.inOut(prog(t, tDodge, tDodge + 2.0));
        return d;
      };
      const posG = t => ({ x: cx - D(t) / 2, y: roadY });
      const posT = t => {
        const k = prog(t, tDodge, tDodge + dLat);
        return { x: cx + D(t) / 2, y: roadY - 205 * ease.inOut(k), a: Math.PI + 0.55 * Math.sin(Math.PI * k) * (k < 1 ? 1 : 0) };
      };
      const speed = (f, t) => { const a = f(t - 0.05), b = f(t + 0.05); return Math.hypot(b.x - a.x, b.y - a.y) / 0.1; };

      // ---- title ----
      A(ctx, fin(lt, tA, 0.7), () => text(V.title || '胆小鬼博弈', cx, 225, { size: 56, family: F.serif, weight: 600, color: P.ink, align: 'center' }));

      // ---- road ----
      const rp = sil ? 1 : ease.inOut(prog(lt, tA, tA + 0.9));
      if (rp > 0) {
        const half = 1000 * rp;
        ctx.save(); ctx.beginPath(); ctx.rect(cx - half, roadY - RH - 4, half * 2, RH * 2 + 8); ctx.clip();
        ctx.fillStyle = 'rgba(233,228,216,0.035)'; ctx.fillRect(0, roadY - RH, 1920, RH * 2);
        ctx.fillStyle = 'rgba(233,228,216,0.35)'; ctx.fillRect(0, roadY - RH, 1920, 3); ctx.fillRect(0, roadY + RH - 3, 1920, 3);
        ctx.fillStyle = 'rgba(233,228,216,0.16)';
        for (let x = -20; x < 1940; x += 90) ctx.fillRect(x, roadY - 2, 46, 4);
        ctx.restore();
      }

      // ---- teal's options, once gold can no longer steer ----
      const gS = posG(tS), tSp = posT(tS);
      const optA = sil ? fin(lt, tS + 0.3, 0.8) * lerp(1, 0.45, prog(lt, tDodge + dRun - 0.8, tDodge + dRun + 0.4)) : fio(lt, tS + 0.05, tDodge + 1.7, 0.45);
      if (optA > 0) A(ctx, optA, () => {
        // straight on: crash
        ctx.strokeStyle = P.red; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
        ctx.beginPath(); ctx.moveTo(tSp.x - CAR_L / 2 - 14, roadY); ctx.lineTo(gS.x + CAR_L / 2 + 250, roadY); ctx.stroke(); ctx.setLineDash([]);
        const xx = (tSp.x - CAR_L / 2 + gS.x + CAR_L / 2) / 2 + 30, r = 20;
        ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(xx - r, roadY - r); ctx.lineTo(xx + r, roadY + r); ctx.moveTo(xx + r, roadY - r); ctx.lineTo(xx - r, roadY + r); ctx.stroke();
        text(V.crash || '直行：撞', xx, roadY + 66, { size: 32, weight: 500, color: P.red, align: 'center' });
        // swerve: the actual path it will take
        ctx.strokeStyle = P.ok; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
        ctx.beginPath();
        const pS = posT(tDodge), pe = posT(tDodge + dRun);
        ctx.moveTo(pS.x - CAR_L / 2 - 14, pS.y);
        for (let k = 1; k <= 30; k++) { const p = posT(tDodge + dRun * k / 30); ctx.lineTo(p.x - CAR_L / 2 - 14, p.y); }
        ctx.stroke(); ctx.setLineDash([]);
        arrow(ctx, pe.x - CAR_L / 2 + 10, pe.y, pe.x - CAR_L / 2 - 24, pe.y, P.ok, { lw: 3, head: 16 });
        text(V.dodge || '转向：躲', pe.x - CAR_L / 2 - 40, pe.y + 11, { size: 32, weight: 500, color: P.ok, align: 'right' });
      });

      // ---- gold's locked path ----
      const lockA = sil ? fin(lt, tLand - 0.1, 0.6) : fio(lt, tLand - 0.1, tDodge + 1.8, 0.5);
      if (lockA > 0) {
        const g = posG(lt), x0 = g.x + CAR_L / 2 + 14;
        const len = 200 * ease.out(prog(lt, tLand - 0.1, tLand + 0.6));
        arrow(ctx, x0, roadY, x0 + Math.max(20, len), roadY, P.ember, { lw: 5, head: 20, alpha: lockA });
      }

      // ---- cars ----
      const appear = sil ? 1 : fin(lt, tA, 0.2);
      A(ctx, appear, () => {
        const g = posG(lt), t = posT(lt);
        const vg = clamp(speed(posG, lt) / 60), vt = clamp(speed(posT, lt) / 60);
        const drive = 1 - prog(lt, tDodge + dRun - 0.5, tDodge + dRun + 0.2);
        streaks(ctx, g.x, g.y, 0, lt, Math.max(vg, 0.55) * drive, 0.1);
        streaks(ctx, t.x, t.y, t.a, lt, Math.max(vt, 0.55) * drive, 0.6);
        car(ctx, g.x, g.y, 0, P.gold, { wheel: lt < tLift });
        car(ctx, t.x, t.y, t.a, P.teal, { wheel: true });
        // player tags
        text(V.a || '甲', g.x, g.y + 82, { size: 34, weight: 700, color: P.gold, align: 'center' });
        text(V.b || '乙', t.x, t.y + 82 + 50 * Math.abs(Math.sin(t.a)), { size: 34, weight: 700, color: P.teal, align: 'center' });
      });

      // ---- the steering wheel ----
      if (lt >= tLift) {
        const kL = ease.out(prog(lt, tLift, tLift + tm.lift));
        let x, y, r, rot = 0, a = 1;
        const gF = posG(tFly);
        const p0 = { x: gF.x + 12, y: roadY - 14 - 78 };
        const p2 = { x: Math.max(230, gF.x - 250), y: roadY + RH + 95 }, p1 = { x: gF.x - 40, y: roadY - 300 };
        const bez = k => ({ x: (1 - k) * (1 - k) * p0.x + 2 * k * (1 - k) * p1.x + k * k * p2.x, y: (1 - k) * (1 - k) * p0.y + 2 * k * (1 - k) * p1.y + k * k * p2.y });
        if (lt < tFly) {
          const g = posG(lt);
          x = g.x + 12; y = roadY - 14 - 78 * kL; r = lerp(10, 26, kL); rot = 0.4 * kL;
          // brief ember halo when it comes off
          A(ctx, (1 - prog(lt, tLift + 0.2, tLift + 1.2)) * kL, () => K.ring(x, y, r + 14 + 16 * kL, P.ember, { lineWidth: 2.5, alpha: 0.7 }));
        } else {
          const kf = prog(lt, tFly, tLand), k = ease.sine(kf);
          const p = bez(k); x = p.x; y = p.y; r = lerp(26, 16, k); rot = 0.4 + 3.2 * TAU * ease.out(kf);
          const bounce = Math.sin(Math.PI * prog(lt, tLand, tLand + 0.35)) * 12 * (lt > tLand ? 1 : 0);
          y -= bounce; a = lerp(1, 0.75, prog(lt, tLand, tLand + 1));
          // trail
          const ta = 0.55 * (1 - prog(lt, tLand + 0.3, tLand + 1.8));
          if (ta > 0) A(ctx, ta, () => {
            ctx.strokeStyle = P.ember; ctx.lineWidth = 2.5; ctx.setLineDash([8, 10]); ctx.beginPath();
            for (let j = 0; j <= 30; j++) { const q = bez(k * j / 30); if (j === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
            ctx.stroke(); ctx.setLineDash([]);
          });
        }
        steer(ctx, x, y, r, rot, P.gold, a);
        A(ctx, fio(lt, tLand + 0.1, Infinity) * 0.9, () => text(V.wheelLabel || '方向盘', p2.x, p2.y + 58, { size: 28, color: P.dim, align: 'center' }));
      }

      // ---- captions (one at a time); in silent mode the runtime's caption says it ----
      if (sil) return;
      const capY = 800;
      const c1 = fio(lt, tA + 1.4, tLand, 0.5), c2 = fio(lt, tLand + 0.1, tConc, 0.5), c3 = fin(lt, tConc, 0.7);
      A(ctx, c1, () => runs([[V.caption || '谁先转向，谁就是胆小鬼', P.ink]], cx, capY + rise(c1, 10), { size: 46 }));
      A(ctx, c2, () => runs([['甲', P.gold, { weight: 700 }], [V.lock || '扔掉方向盘：只能直行', P.ink]], cx, capY + rise(c2, 10), { size: 46 }));
      A(ctx, c3, () => {
        const s = V.conclusion || '你没得选 → 对方只能躲';
        text(s, cx, capY + rise(c3, 12), { size: 56, family: F.serif, weight: 600, color: P.ember, align: 'center' });
      });
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      if (!t.silent) cue(out, t.tA + 0.1, 'whoosh', { dur: 1.6 });
      cue(out, t.tLift, 'pop'); cue(out, t.tFly, 'swish');
      cue(out, t.tS + 0.1, 'tick'); cue(out, t.tDodge, 'whoosh', { dur: t.dRun }); cue(out, t.tConc, 'chime');
      return out;
    },
  });

  // ================================================================= adverse selection
  function building(ctx, cx, top, w, h, a, qa) {
    A(ctx, a, () => {
      const roofH = 78, base = top + h;
      ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(233,228,216,0.75)'; ctx.fillStyle = 'rgba(16,21,30,0.9)';
      ctx.beginPath(); ctx.moveTo(cx - w / 2 - 22, top + roofH); ctx.lineTo(cx, top); ctx.lineTo(cx + w / 2 + 22, top + roofH); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(cx - w / 2 - 10, top + roofH, w + 20, 18); ctx.fill(); ctx.stroke();
      const n = 4, pw = 22, y0 = top + roofH + 18, y1 = base - 22;
      for (let i = 0; i < n; i++) { const x = cx - w / 2 + 20 + i * (w - 40 - pw) / (n - 1); ctx.beginPath(); ctx.rect(x, y0, pw, y1 - y0); ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.rect(cx - w / 2 - 22, y1, w + 44, 22); ctx.fill(); ctx.stroke();
      if (qa > 0) text('?', cx, top + roofH - 12, { size: 50, family: F.mono, weight: 700, color: P.dim, align: 'center', alpha: qa });
    });
  }
  function priceTag(ctx, x, y, str, a, rot) {
    const w = measure(str, { size: 44, weight: 700 }) + 56, h = 76;
    A(ctx, a, () => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
      ctx.beginPath();
      ctx.moveTo(-w / 2 - 30, 0); ctx.lineTo(-w / 2, -h / 2); ctx.lineTo(w / 2 - 10, -h / 2); ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + 10);
      ctx.lineTo(w / 2, h / 2 - 10); ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - 10, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
      ctx.fillStyle = 'rgba(16,21,30,0.95)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = P.ember; ctx.stroke();
      K.ring(-w / 2 - 6, 0, 7, P.ember, { lineWidth: 2.5 });
      text(str, 8, 2, { size: 44, weight: 700, color: P.ink, align: 'center', baseline: 'middle' });
      ctx.restore();
    });
  }

  function crowdLayout(V) {
    const n = V.n || 24, cols = 6, rows = Math.ceil(n / cols), r = K.rng(V.seed || 11);
    const bad = new Set(); const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    idx.slice(0, Math.round(n * (V.badShare == null ? 0.5 : V.badShare))).forEach(i => bad.add(i));
    const ppl = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols, rw = Math.floor(i / cols);
      ppl.push({ i, x: 250 + c * 124 + (r() - 0.5) * 44, y: 440 + rw * 96 + (r() - 0.5) * 30, bad: bad.has(i) });
    }
    const good = ppl.filter(p => !p.bad).sort((a, b) => a.x - b.x), badL = ppl.filter(p => p.bad).sort((a, b) => b.x - a.x);
    good.forEach((p, k) => { p.rank = k; });
    badL.forEach((p, k) => {
      p.rank = k; const c = k % 3, rw = Math.floor(k / 3);
      p.tx = 1110 + c * 82 + (rw % 2) * 20; p.ty = 445 + rw * 78;
    });
    return { ppl, good, bad: badL, rows };
  }

  T.register('adverse', {
    timing(V, api) {
      const Cr = S(api, 'crowd', 0.3), Pr = S(api, 'price', api.dur * 0.4), Lv = S(api, 'leave', api.dur * 0.7);
      if (api.silent) {
        // round after round: a batch of healthy people leaves, the price goes up again
        const nb = V.rounds || 3, go0 = Lv.t + 0.4;
        const L2 = api.line(2) ? api.line(2).start : Math.max(go0 + 5, api.dur * 0.5);
        const gap = Math.max(1.6, (L2 - 1.9 - go0) / Math.max(1, nb - 1));
        const tGoB = b => go0 + b * gap;
        return {
          silent: true, nb, tGoB, tUp: j => tGoB(j - 1) + 2.0, L2,
          tC: Cr.t, tQ: Cr.t + 0.8, tTag: Pr.t, tCheap: Lv.t + 2.4, tGather: L2 + 0.4, tL: L2, tConc: Infinity,
        };
      }
      return {
        tC: Cr.t, tQ: Cr.at('比保险公司', 0.55, 4), tP: Pr.t, tTag: Pr.at('中间价', 0.2, 1.2),
        tExp: Pr.at('觉得贵', 0.32, 2.2), tGo: Pr.at('走了', 0.45, 3), tCheap: Pr.at('划算', 0.7, 4.5), tCome: Pr.at('都来了', 0.82, 5.5),
        tL: Lv.t, tConc: Lv.at('这叫', 0.5, 2.5),
      };
    },
    draw(ctx, V, lt, api) {
      const tm = this.timing(V, api), L = crowdLayout(V);
      const bx = 1540, btop = 380;
      titleL(V.title || '信息不对称', lt, tm.tC);
      A(ctx, fin(lt, tm.tC + 0.6), () => legend(ctx, [[V.goodLabel || '健康 · 低风险', P.ok], [V.badLabel || '常生病 · 高风险', P.red]], 162, 282, { person: true, size: 30 }));

      // insurer
      const qa = fio(lt, tm.tQ, tm.tL + 0.2, 0.5);
      building(ctx, bx, btop, 260, 262, fin(lt, tm.tC + 0.3, 0.7), qa);
      A(ctx, fin(lt, tm.tC + 0.3, 0.7), () => text(V.insurer || '保险公司', bx, btop + 320, { size: 38, weight: 500, color: P.ink, align: 'center' }));
      A(ctx, qa, () => text(V.blind || '看不出谁健康', bx, btop + 368, { size: 30, color: P.dim, align: 'center' }));
      // price tag sits on the roof
      const tagA = fin(lt, tm.tTag, 0.5);
      const sw = Math.sin((lt - tm.tTag) * 7) * 0.12 * Math.exp(-Math.max(0, lt - tm.tTag) * 2.6);
      A(ctx, tagA, () => { ctx.strokeStyle = 'rgba(233,228,216,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, btop - 4); ctx.lineTo(bx, btop - 32); ctx.stroke(); });
      if (!tm.silent) priceTag(ctx, bx, btop - 70, V.price || '中间价', tagA, sw);
      else {
        const labs = V.prices || [V.price || '中间价', '价格 ↑', '价格 ↑↑', '价格 ↑↑↑'];
        let lev = 0; for (let j = 1; j <= tm.nb && j < labs.length; j++) if (lt >= tm.tUp(j)) lev = j;
        const f = lev > 0 ? ease.inOut(prog(lt, tm.tUp(lev), tm.tUp(lev) + 0.5)) : 1;
        if (lev > 0 && f < 1) priceTag(ctx, bx, btop - 70, labs[lev - 1], tagA * (1 - f), 0);
        const pop = lev > 0 ? 1 + 0.08 * Math.sin(Math.PI * prog(lt, tm.tUp(lev), tm.tUp(lev) + 0.6)) : 1;
        ctx.save(); ctx.translate(bx, btop - 70); ctx.scale(pop, pop); ctx.translate(-bx, -(btop - 70));
        priceTag(ctx, bx, btop - 70, labs[lev], tagA * f, lev === 0 ? sw : 0);
        ctx.restore();
      }

      // people
      const walk = (p, t0, dur, x1, y1) => {
        const k = prog(lt, t0, t0 + dur), e = ease.inOut(k);
        const x = lerp(p.x, x1, e), y = lerp(p.y, y1, e);
        const moving = k > 0 && k < 1 ? 1 : 0;
        return { x, y: y - Math.abs(Math.sin(k * dur * 7)) * 6 * moving, k };
      };
      for (const p of L.ppl) {
        const a0 = fin(lt, tm.tC + 0.25 + p.i * 0.05, 0.5);
        let q = { x: p.x, y: p.y }, a = a0;
        if (tm.silent) {
          if (!p.bad) {
            const b = Math.floor(p.rank * tm.nb / L.good.length), t0 = tm.tGoB(b) + (p.rank % 4) * 0.15;
            q = walk(p, t0, 2.6, p.x - 380, p.y + 6);
            a = a0 * (1 - ease.inOut(prog(lt, t0 + 0.8, t0 + 2.6)));
          } else q = walk(p, tm.tGather + p.rank * 0.25, 3.4, p.tx, p.ty);
        } else if (!p.bad) {
          const t0 = tm.tGo + p.rank * 0.12;
          q = walk(p, t0, 2.4, -80, p.y + 10);
        } else {
          q = walk(p, tm.tCome - 0.45 + p.rank * 0.09, 1.5, p.tx, p.ty);
        }
        person(ctx, q.x, q.y + rise(a0, 10), 1.05, p.bad ? P.red : P.ok, a);
        // speech: a few of each group
        const say = !p.bad ? (p.rank % 3 === 1 ? (V.goodSay || '太贵') : null) : (p.rank % 3 === 0 ? (V.badSay || '划算') : null);
        if (say && tm.silent) {
          const b = Math.floor(p.rank * tm.nb / L.good.length);
          const sa = p.bad ? fio(lt, tm.tCheap + (p.rank % 4) * 0.2, tm.tGather + 0.2, 0.4) : fio(lt, tm.tGoB(b) - 0.8, tm.tGoB(b) + 1.2, 0.4);
          A(ctx, sa * a, () => text(say, q.x, q.y - 64, { size: 28, weight: 500, color: p.bad ? P.red : P.ok, align: 'center' }));
        } else if (say) {
          const ts = p.bad ? tm.tCheap : tm.tExp;
          const sa = fio(lt, ts + (p.rank % 4) * 0.08, p.bad ? tm.tL + 0.3 : tm.tGo + p.rank * 0.12 + 1.4, 0.35);
          A(ctx, sa, () => text(say, q.x, q.y - 64, { size: 28, weight: 500, color: p.bad ? P.red : P.ok, align: 'center' }));
        }
      }

      // result (in silent mode the caption says it)
      if (tm.silent) return;
      const la = fin(lt, tm.tL + 0.3, 0.7);
      A(ctx, la, () => text(V.left || '只剩高风险客户', 560, 600 + rise(la, 10), { size: 46, weight: 500, color: P.red, align: 'center' }));
      const ca = fin(lt, tm.tConc, 0.8);
      A(ctx, ca, () => text(V.conclusion || '逆向选择 · 劣币驱逐良币', 960, 838 + rise(ca, 12), { size: 58, family: F.serif, weight: 600, color: P.ember, align: 'center' }));
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.tC + 0.3, 'tick'); cue(out, t.tTag, 'pop');
      if (t.silent) {
        for (let b = 0; b < t.nb; b++) { cue(out, t.tGoB(b), 'whoosh', { dur: 2.6 }); cue(out, t.tUp(b + 1), 'pop'); }
        cue(out, t.tGather, 'whoosh', { dur: 3.4 });
        return out;
      }
      cue(out, t.tGo, 'whoosh', { dur: 2.6 }); cue(out, t.tCome - 0.4, 'whoosh', { dur: 1.8 }); cue(out, t.tConc, 'chime');
      return out;
    },
  });

  // ================================================================= insurance (screening)
  T.register('insurance', {
    timing(V, api) {
      const Pl = S(api, 'plans', api.dur * 0.28), So = S(api, 'sort', api.dur * 0.64);
      if (api.silent) {
        const tA = Pl.t + 0.4, L2 = api.line(2) ? api.line(2).start : So.t + 4.5;
        return { silent: true, tMenu: Infinity, tA, tB: tA + 1.6, tS: So.t, tGoA: So.t + 0.5, tSb: So.t + 2.6, walk: 2.4, stag: 0.2, tDone: L2 + 0.3, tConc: Infinity };
      }
      return {
        walk: 1.7, stag: 0.13, tDone: -Infinity,
        tMenu: ph(api, 0, '菜单', 0.6) ?? 1, tA: Pl.t + 0.1, tB: Pl.at('或者', 0.6, 3.5),
        tS: So.t, tSb: So.at('马路杀手', 0.24, 1.5), tConc: So.at('你什么', 0.5, 3.2),
      };
    },
    draw(ctx, V, lt, api) {
      const tm = this.timing(V, api);
      const plans = V.plans || [{ name: '方案 A', price: '2000 元/年', terms: '出事先自付 2 万' }, { name: '方案 B', price: '5000 元/年', terms: '出事全赔' }];
      const types = V.types || [{ label: '老司机', color: P.ok, plan: 0 }, { label: '马路杀手', color: P.red, plan: 1 }];
      if (!tm.silent) titleL(V.title || '筛选：设计一份菜单，让对方自己选', lt, 0.2);
      A(ctx, fin(lt, tm.silent ? 0.3 : 0.9), () => legend(ctx, types.map(t => [t.label, t.color]), 162, tm.silent ? 240 : 282, { person: true, size: 30 }));

      const cw = 540, ch = 240, cy = 330, xs = [960 - 30 - cw, 960 + 30];
      const tIn = [tm.tA, tm.tB];
      const pattern = V.pattern || [0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1];
      const n = pattern.length;
      // drivers: first arrive time per plan (for card highlight)
      const tGo = [tm.silent ? tm.tGoA : tm.tS + 0.15, tm.tSb];
      const WALK = tm.walk;
      for (let j = 0; j < plans.length && j < 2; j++) {
        const x = xs[j], pl = plans[j], a = fin(lt, tIn[j], 0.7), ph0 = fio(lt, tm.tMenu, tIn[j] + 0.3, 0.6);
        // placeholder (the empty menu)
        A(ctx, ph0 * (1 - a), () => { card(ctx, x, cy, cw, ch, { dash: [10, 10], fill: 'rgba(16,21,30,0.4)' }); text('?', x + cw / 2, cy + ch / 2 + 22, { size: 64, family: F.mono, color: P.dim, align: 'center' }); });
        const typ = types.find(t => t.plan === j);
        const hl = typ ? fin(lt, Math.max(tGo[j] + WALK * 0.8, tm.tDone), 0.6) : 0;
        A(ctx, a, () => {
          const yy = cy + rise(a, 20);
          card(ctx, x, yy, cw, ch, { stroke: hl > 0 ? typ.color : undefined, lw: 2 + 1.5 * hl });
          if (hl > 0) A(ctx, hl, () => card(ctx, x, yy, cw, ch, { stroke: typ.color, lw: 3.5, fill: 'rgba(0,0,0,0)' }));
          text(pl.name, x + 36, yy + 62, { size: 34, weight: 500, color: P.dim });
          text(pl.price, x + 36, yy + 146, { size: 62, family: F.mono, weight: 700, color: P.ink });
          text(pl.terms, x + 36, yy + 204, { size: 36, weight: 500, color: P.ink });
        });
      }
      // drivers row → their plan
      const tRow = 0.5;
      const rowY = 800, rx0 = 400, rx1 = 1520;
      const rank = [0, 0];
      for (let i = 0; i < n; i++) {
        const ty = pattern[i], typ = types[ty] || types[0], pj = typ.plan != null ? typ.plan : ty;
        const r = rank[pj]++;
        const x0 = lerp(rx0, rx1, i / (n - 1));
        const cnt = pattern.filter(v => v === ty).length;
        const tx = xs[pj] + cw / 2 + (r - (cnt - 1) / 2) * 80, tyY = 690;
        const t0 = tGo[pj] + r * tm.stag, k = prog(lt, t0, t0 + WALK), e = ease.inOut(k);
        const x = lerp(x0, tx, e), y = lerp(rowY, tyY, e) - Math.abs(Math.sin(k * WALK * 7)) * 6 * (k > 0 && k < 1);
        const a = fin(lt, tRow + i * 0.06, 0.5);
        person(ctx, x, y + rise(a, 10), 1.05, typ.color, a);
      }
      // group labels under each cluster
      for (let j = 0; j < 2; j++) {
        const typ = types.find(t => t.plan === j); if (!typ) continue;
        const a = fin(lt, Math.max(tGo[j] + WALK * 0.9, tm.tDone), 0.6);
        A(ctx, a, () => text(typ.label, xs[j] + cw / 2, 752, { size: 32, weight: 500, color: typ.color, align: 'center' }));
      }
      const ca = fin(lt, tm.tConc, 0.8);
      A(ctx, ca, () => text(V.conclusion || '你什么都没问，他们自己就分开了', 960, 848 + rise(ca, 12), { size: 50, family: F.serif, weight: 600, color: P.ember, align: 'center' }));
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.tMenu, 'tick'); cue(out, t.tA, 'pop'); cue(out, t.tB, 'pop');
      cue(out, t.silent ? t.tGoA : t.tS + 0.15, 'whoosh', { dur: t.walk + 1 }); cue(out, t.tSb, 'whoosh', { dur: t.walk + 1 }); cue(out, t.tConc, 'chime');
      if (t.silent) cue(out, t.tDone, 'chime');
      return out;
    },
  });

  // ================================================================= shops (one-shot vs repeated)
  function shopIcon(ctx, x, y, kind, a) {   // (x,y) = bottom-left, ~110x86
    A(ctx, a, () => {
      const w = 110, h = 86;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(233,228,216,0.75)'; ctx.fillStyle = 'rgba(16,21,30,0.9)';
      ctx.beginPath(); ctx.rect(x + 6, y - h + 26, w - 12, h - 26); ctx.fill(); ctx.stroke();
      if (kind === 'small') {
        // striped awning
        const n = 5, sw = w / n;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i % 2 ? 'rgba(233,228,216,0.8)' : P.red;
          ctx.beginPath(); ctx.moveTo(x + i * sw, y - h); ctx.lineTo(x + (i + 1) * sw, y - h); ctx.lineTo(x + (i + 1) * sw, y - h + 26);
          ctx.arc(x + (i + 0.5) * sw, y - h + 26, sw / 2, 0, Math.PI); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'rgba(233,228,216,0.25)'; ctx.fillRect(x + w / 2 - 14, y - 34, 28, 34);
      } else {
        // chain: flat sign band with a round emblem, big window
        ctx.fillStyle = P.ok; ctx.beginPath(); ctx.roundRect(x, y - h, w, 28, 6); ctx.fill();
        K.dot(x + w / 2, y - h + 14, 9, DARK);
        ctx.fillStyle = 'rgba(233,228,216,0.22)'; ctx.fillRect(x + 16, y - 44, 38, 26); ctx.fillRect(x + w - 44, y - 44, 26, 44);
      }
    });
  }
  function mapBlob(ctx, cx, cy, rx, ry, seed, a) {
    A(ctx, a, () => {
      ctx.beginPath();
      for (let k = 0; k <= 64; k++) {
        const an = k / 64 * TAU, n = 0.82 + 0.3 * K.fbm(Math.cos(an) * 1.3 + seed, Math.sin(an) * 1.3 + seed, 3);
        const x = cx + Math.cos(an) * rx * n, y = cy + Math.sin(an) * ry * n;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fillStyle = 'rgba(233,228,216,0.06)'; ctx.fill();
      ctx.strokeStyle = 'rgba(233,228,216,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    });
  }

  T.register('shops', {
    timing(V, api) {
      const O = S(api, 'oneshot', api.dur * 0.2), R = S(api, 'repeated', api.dur * 0.58);
      if (api.silent) {
        const hop = 0.6, tMap = R.t + 1.8;
        return {
          silent: true, hop, tTitle: Infinity, tRep: Infinity,
          tO: O.t, tTags: O.t + 0.9, tOnce: O.t + 2.0, tOLab: O.t + 3.2,
          tR: R.t, tSame: R.t + 0.9, tMap, tRLab: R.t + 2.0, tFame: tMap + 0.3 + hop * 6 + 0.5,
        };
      }
      return {
        hop: 0.42,
        tTitle: 0.2, tRep: ph(api, 0, '靠重复', 0.7) ?? 1.5,
        tO: O.t, tTags: O.at('又贵', 0.23, 1.4), tOnce: O.at('一辈子', 0.55, 3.2), tOLab: O.at('一次性', 0.8, 5),
        tR: R.t, tSame: R.at('价格', 0.25, 1.6), tMap: R.at('价格', 0.25, 1.6) + 1.0, tRLab: R.at('重复博弈', 0.68, 4.6), tFame: R.at('名声', 0.84, 5.6),
      };
    },
    draw(ctx, V, lt, api) {
      const tm = this.timing(V, api);
      const O = V.oneshot || {}, R = V.repeated || {};
      // title
      const ta = fin(lt, tm.tTitle, 0.7), tb = fin(lt, tm.tRep, 0.6);
      if (!tm.silent) A(ctx, ta, () => {
        const t1 = V.title || '囚徒困境怎么破？', t2 = V.answer || '  靠重复';
        const w1 = measure(t1, { size: 52, family: F.serif, weight: 600 }), w2 = measure(t2, { size: 52, family: F.serif, weight: 600 });
        const x = 960 - (w1 + w2 * tb) / 2;
        text(t1, x, 212 + rise(ta, 10), { size: 52, family: F.serif, weight: 600, color: P.ink });
        text(t2, x + w1, 212, { size: 52, family: F.serif, weight: 600, color: P.ember, alpha: tb });
      });
      const cy = tm.silent ? 245 : 268, ch = 540, cw = 760, xl = 960 - 20 - cw, xr = 960 + 20;
      const focusR = fin(lt, tm.tR, 0.8);
      // ---- left: one-shot ----
      const la = fin(lt, tm.tO, 0.7);
      A(ctx, la * (1 - 0.22 * focusR), () => {
        const y = cy + rise(la, 24);
        card(ctx, xl, y, cw, ch);
        shopIcon(ctx, xl + 44, y + 128, 'small', 1);
        text(O.name || '景区小饭馆', xl + 186, y + 104, { size: 48, weight: 700, color: P.ink });
        let px = xl + 44;
        (O.tags || ['贵', '难吃']).forEach((s, k) => { const a = fin(lt, tm.tTags + k * 0.35, 0.5); px += pill(ctx, s, px, y + 196, P.red, { size: 36, alpha: a }) + 18; });
        const oa = fin(lt, tm.tOnce, 0.6);
        A(ctx, oa, () => {
          person(ctx, xl + 110, y + 390, 1.7, P.gold);
          text(O.visits || '×1', xl + 190, y + 385, { size: 110, family: F.mono, weight: 700, color: P.ink });
          if (!tm.silent || O.visitNote) text(O.visitNote || '游客一辈子只来一次', xl + 190, y + 440, { size: 32, color: P.dim });
        });
        const fa = fin(lt, tm.tOLab, 0.6);
        A(ctx, fa, () => { ctx.fillStyle = 'rgba(233,228,216,0.12)'; ctx.fillRect(xl + 44, y + 472, cw - 88, 2); text(O.label || '一次性博弈', xl + 44, y + 522, { size: 42, weight: 700, color: P.red }); });
      });
      // ---- right: repeated ----
      const ra = focusR;
      A(ctx, ra, () => {
        const y = cy + rise(ra, 24);
        card(ctx, xr, y, cw, ch);
        shopIcon(ctx, xr + 44, y + 128, 'chain', 1);
        text(R.name || '连锁快餐店', xr + 186, y + 104, { size: 48, weight: 700, color: P.ink });
        pill(ctx, R.desc || (tm.silent ? '价格 · 口味 = 外面' : '价格、口味和外面一样'), xr + 44, y + 196, P.ok, { size: 36, alpha: fin(lt, tm.tSame, 0.5) });
        // map: the same customer keeps meeting the same chain in city after city
        const ma = fin(lt, tm.tMap, 0.6);
        const mcx = xr + 270, mcy = y + 355, cities = V.cities || [[-170, -30], [-95, 50], [-20, -55], [40, 30], [110, -40], [165, 45], [205, -15]];
        mapBlob(ctx, mcx, mcy, 240, 108, 3.1, ma);
        const hop = tm.hop, n = cities.length;
        const kk = (lt - tm.tMap - 0.3) / hop;           // hops done
        A(ctx, ma, () => {
          ctx.strokeStyle = 'rgba(216,178,92,0.55)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 8]);
          ctx.beginPath();
          for (let j = 0; j < n; j++) {
            const [dx, dy] = cities[j]; const x = mcx + dx, yy = mcy + dy;
            if (j === 0) ctx.moveTo(x, yy);
            else if (kk >= j - 1) { const f = clamp(kk - (j - 1)); const [px0, py0] = cities[j - 1]; ctx.lineTo(lerp(mcx + px0, x, f), lerp(mcy + py0, yy, f)); }
          }
          ctx.stroke(); ctx.setLineDash([]);
          for (let j = 0; j < n; j++) {
            const [dx, dy] = cities[j], on = fin(lt, tm.tMap + 0.3 + (j - 1) * hop + hop, 0.25);
            ctx.fillStyle = 'rgba(233,228,216,0.35)'; ctx.fillRect(mcx + dx - 7, mcy + dy - 7, 14, 14);
            A(ctx, j === 0 ? 1 : on, () => { ctx.fillStyle = P.ok; ctx.fillRect(mcx + dx - 8, mcy + dy - 8, 16, 16); });
          }
          const j = clamp(Math.floor(kk), 0, n - 1), f = clamp(kk - j), jn = Math.min(n - 1, j + 1);
          const px = lerp(cities[j][0], cities[jn][0], ease.inOut(f)) + mcx, py = lerp(cities[j][1], cities[jn][1], ease.inOut(f)) + mcy;
          person(ctx, px, py - 10 - Math.sin(Math.PI * f) * 14 * (kk < n - 1), 0.75, P.gold);
          const count = clamp(Math.floor(kk) + 1, 1, n), inf = kk >= n - 0.2;
          const cstr = inf ? (R.visits || '×∞') : '×' + count;
          text(cstr, xr + 620, y + 380, { size: 96, family: F.mono, weight: 700, color: inf ? P.ember : P.ink, align: 'center' });
          text(R.visitNote || '同一个顾客', xr + 620, y + 434, { size: 28, color: P.dim, align: 'center' });
        });
        const fa = fin(lt, tm.tRLab, 0.6), fb = fin(lt, tm.tFame, 0.6);
        A(ctx, fa, () => {
          ctx.fillStyle = 'rgba(233,228,216,0.12)'; ctx.fillRect(xr + 44, y + 472, cw - 88, 2);
          text(R.label || '重复博弈', xr + 44, y + 522, { size: 42, weight: 700, color: P.ok });
          const lw = measure(R.label || '重复博弈', { size: 42, weight: 700 });
          text(R.note || '→ 要顾及名声', xr + 44 + lw + 24, y + 522, { size: 42, weight: 700, color: P.ember, alpha: fb });
        });
      });
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.tO, 'tick'); cue(out, t.tTags, 'pop'); cue(out, t.tOnce, 'pop');
      cue(out, t.tR, 'tick'); cue(out, t.tMap + 0.3, 'count', { dur: t.hop * 6 }); cue(out, t.tFame, 'chime');
      return out;
    },
  });

  // ================================================================= rounds (backward induction vs KMRW)
  T.register('rounds', {
    timing(V, api) {
      const B = S(api, 'backward', 0.3), Km = S(api, 'kmrw', api.dur * 0.4);
      const ni = api.steps.findIndex(s => s.note != null && s.show == null);
      const tNote = ni >= 0 ? api.steps[ni].lt : api.dur * 0.78;
      const tLast = B.at('最后一轮', 0.32, 2.5), t2nd = B.at('倒数第二', 0.48, 4);
      const cs = t2nd + 1.1, ce = Math.max(cs + 1.6, B.end - 0.7);
      if (api.silent) {
        const c0 = B.t + 4.0, c1 = Math.max(c0 + 1.8, Km.t - 1.0);
        return {
          silent: true, wave: 2.6, tB: B.t, tLast: B.t + 1.6, t2nd: B.t + 3.0, cs: c0, ce: c1, tMath: c1 + 0.2,
          tK: Km.t, tOne: Km.t + 1.8, tWave: Km.t + 3.5, tNote, note: ni >= 0 ? api.steps[ni].note : null,
        };
      }
      return {
        wave: 1.9,
        tB: B.t, tLast, t2nd, cs, ce, tMath: ce + 0.15,
        tK: Km.t, tOne: Km.at('只要', 0.42, 4), tWave: Km.at('合作就能', 0.7, 6.5) - 0.2, tNote, note: ni >= 0 ? api.steps[ni].note : null,
      };
    },
    draw(ctx, V, lt, api) {
      const tm = this.timing(V, api), n = V.n || 100, keep = V.endgame || Math.max(2, Math.round(n * 0.05));
      const x0 = 160, x1 = 1760, pitch = (x1 - x0) / n, cwid = Math.max(3, pitch * 0.72), ry = 350, rh = 92;
      // flip times: backward (red) and KMRW (back to green)
      const tBack = i => {                                  // i = 1..n (round)
        const m = n - i + 1;                                // m-th cell to flip
        if (m === 1) return tm.tLast; if (m === 2) return tm.t2nd;
        return tm.cs + (tm.ce - tm.cs) * Math.pow((m - 3) / Math.max(1, n - 3), 0.5);
      };
      const wave = tm.wave, sil = !!tm.silent;
      const tFwd = i => i <= n - keep ? tm.tWave + wave * (i - 1) / Math.max(1, n - keep - 1) : Infinity;

      titleL(V.title || `重复博弈：${n} 轮`, lt, tm.tB);
      A(ctx, fin(lt, tm.tB + 0.3), () => {
        legend(ctx, [[V.coop || '合作', P.ok], [V.defect || '背叛', P.red]], 1470, 205, { size: 30 });
      });
      // axis labels
      A(ctx, fin(lt, tm.tB + 0.5), () => {
        text(`第 1 轮`, x0, ry - 18, { size: 28, color: P.dim });
        text(`第 ${n} 轮`, x1, ry - 18, { size: 28, color: P.dim, align: 'right' });
      });
      // cells
      const grow = ease.out(prog(lt, tm.tB, tm.tB + 1.3));
      for (let i = 1; i <= n; i++) {
        const x = x0 + (i - 1) * pitch + (pitch - cwid) / 2;
        const ap = clamp(grow * n * 1.15 - (i - 1) * 1.0, 0, 1) ; if (ap <= 0) continue;
        const flipTo = (t, d = 0.28) => prog(lt, t, t + d);
        const fb = flipTo(tBack(i)), ff = flipTo(tFwd(i));
        let col, sc;
        if (ff > 0) { col = ff < 0.5 ? P.red : P.ok; sc = Math.abs(1 - 2 * ff); }
        else { col = fb < 0.5 ? P.ok : P.red; sc = fb > 0 ? Math.abs(1 - 2 * fb) : 1; }
        sc = Math.max(0.08, sc);
        const h = rh * sc * ease.out(ap);
        ctx.globalAlpha = ap; ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(x, ry + (rh - h) / 2, cwid, h, Math.min(3, cwid / 3)); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // backward-induction front
      const frontA = fio(lt, tm.tLast - 0.1, tm.tK + 0.6, 0.4);
      if (frontA > 0) {
        let m = 0; for (let i = n; i >= 1; i--) if (lt >= tBack(i)) m++;
        m = Math.max(1, m);
        const fx = x0 + (n - m) * pitch;
        A(ctx, frontA, () => {
          if (m < n) arrow(ctx, x1, ry + rh + 30, Math.min(x1 - 40, fx), ry + rh + 30, P.red, { lw: 3, head: 16 });
          if (m <= 2) { ctx.strokeStyle = P.red; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(fx - 5, ry - 8, x1 - fx + 10, rh + 16, 6); ctx.stroke(); }
          if (sil) {   // a big round counter instead of a sentence
            const lab = `第 ${n - m + 1} 轮`, o = { size: 44, family: F.mono, weight: 700 }, w = measure(lab, o);
            text(lab, clamp(fx + pitch, x0 + w, x1), ry + rh + 90, { ...o, color: P.red, align: 'right' });
          } else {
            const lab = m === 1 ? (V.lastLabel || '最后一轮：背叛') : m === 2 ? (V.secondLabel || '倒数第二轮：也背叛') : (V.backLabel || '一路倒推');
            const w = measure(lab, { size: 34, weight: 500 });
            text(lab, clamp(fx + pitch, x0 + w, x1), ry + rh + 82, { size: 34, weight: 500, color: P.red, align: 'right' });
          }
        });
      }
      // brackets after KMRW
      const brA = fin(lt, tm.tWave + wave + 0.2, 0.6);
      if (brA > 0) A(ctx, brA, () => {
        const by = ry + rh + 26, xa = x0, xb = x0 + (n - keep) * pitch - 6, xc = xb + 12, xd = x1;
        ctx.lineWidth = 2.5; ctx.strokeStyle = P.ok;
        ctx.beginPath(); ctx.moveTo(xa, by - 10); ctx.lineTo(xa, by); ctx.lineTo(xb, by); ctx.lineTo(xb, by - 10); ctx.stroke();
        ctx.strokeStyle = P.red;
        ctx.beginPath(); ctx.moveTo(xc, by - 10); ctx.lineTo(xc, by); ctx.lineTo(xd, by); ctx.lineTo(xd, by - 10); ctx.stroke();
        text(V.mostLabel || (sil ? `合作 ${n - keep} 轮` : '大多数轮次：合作'), (xa + xb) / 2, by + 50, { size: 34, weight: 500, color: P.ok, align: 'center' });
        text(V.endLabel || (sil ? `背叛 ${keep} 轮` : '最后几轮'), xd, by + 50, { size: 30, weight: 500, color: P.red, align: 'right' });
      });
      // panels
      const py = 566, ph0 = 204;
      const ma = fin(lt, tm.tMath, 0.7), dimL = 1 - 0.45 * fin(lt, tm.tK, 0.8);
      A(ctx, ma * dimL, () => {
        const y = py + rise(ma, 16);
        card(ctx, 160, y, 760, ph0);
        text(V.mathHead || (sil ? '数学倒推' : '数学：倒推'), 200, y + 62, { size: 32, color: P.dim });
        text(V.math || (sil ? `${n} 轮全背叛` : '从第 1 轮就该背叛'), 200, y + 142, { size: 54, family: F.serif, weight: 600, color: P.red });
      });
      const ka = fin(lt, tm.tK + 0.2, 0.7);
      A(ctx, ka, () => {
        const y = py + rise(ka, 16);
        card(ctx, 1000, y, 760, ph0, { stroke: 'rgba(255,154,85,0.45)' });
        text(V.kmrw || 'KMRW 1982', 1040, y + 64, { size: 36, family: F.mono, weight: 700, color: P.ember });
        text(V.kmrwSub || '四位学者', 1040 + measure(V.kmrw || 'KMRW 1982', { size: 36, family: F.mono, weight: 700 }) + 20, y + 62, { size: 28, color: P.dim });
        const oa = fin(lt, tm.tOne, 0.6);
        if (sil) A(ctx, oa, () => runs([[V.pct || '1%', P.ok, { family: F.mono, weight: 700, size: 76 }], ['  ' + (V.pctPost || '好人'), P.ink]], 1040, y + 158, { size: 40, align: 'left' }));
        else A(ctx, oa, () => runs([[V.pctPre || '对方有 ', P.ink], [V.pct || '1%', P.ok, { family: F.mono, weight: 700, size: 52 }], [V.pctPost || ' 可能是好人', P.ink]], 1040, y + 140, { size: 42, align: 'left' }));
        const sa = sil ? 0 : fin(lt, tm.tWave + 0.8, 0.6);
        A(ctx, sa, () => text(V.kmrwResult || '→ 合作能维持大多数轮次', 1040, y + 180, { size: 30, weight: 500, color: P.ok }));
      });
      // note
      if (tm.note) {
        const na = fin(lt, tm.tNote, 0.7);
        A(ctx, na, () => {
          const s = tm.note, w = measure(s, { size: 42, weight: 500 });
          K.dot(960 - w / 2 - 26, 842 - 14 + rise(na, 10), 8, P.ember);
          text(s, 960, 842 + rise(na, 10), { size: 42, weight: 500, color: P.ink, align: 'center' });
        });
      }
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.tB, 'tick'); cue(out, t.tLast, 'pop'); cue(out, t.t2nd, 'pop');
      cue(out, t.cs, 'count', { dur: +(t.ce - t.cs).toFixed(2) }); cue(out, t.tMath, 'thud');
      cue(out, t.tK + 0.2, 'tick'); cue(out, t.tOne, 'pop'); cue(out, t.tWave, 'whoosh', { dur: t.wave }); cue(out, t.tNote, 'chime');
      return out;
    },
  });

  // ================================================================= tournament (tit for tat)
  const seq = s => Array.from(s).map(c => c === 'D' || c === 'd' || c === '1');
  T.register('tournament', {
    timing(V, api) {
      const Tt = S(api, 'titfortat', 0.3), Fg = S(api, 'forgive', api.dur * 0.6);
      if (api.silent) {
        // tit for tat was explained by the previous beat: build it quickly, then spend the time on the mistake
        const L0 = api.line(0) ? api.line(0).start : Tt.t, L1 = api.line(1) ? api.line(1).start : Fg.t + 2;
        return {
          silent: true, t0: Tt.t, tChamp: Tt.t, tR1: Infinity, tR2: Infinity, tName: Infinity,
          tF: Fg.t, tMis: Math.min(L0 + 1.2, Fg.t - 0.4), tBetter: Fg.t, tTol: Fg.t + 0.5, tHot: L1 + 0.3,
          note: Fg.s && Fg.s.note,
        };
      }
      return {
        t0: Tt.t, tChamp: Tt.at('冠军', 0.42, 4.5), tR1: Tt.at('第一次合作', 0.6, 6), tR2: Tt.at('之后照抄', 0.7, 7.5), tName: Tt.at('这叫', 0.88, 10),
        tF: Fg.t, tMis: Fg.at('误会', 0.12, 0.8), tBetter: Fg.at('更好的版本', 0.25, 1.8), tTol: Fg.at('宽容', 0.4, 3), tHot: Fg.at('热线', 0.6, 4.2),
        note: Fg.s && Fg.s.note,
      };
    },
    draw(ctx, V, lt, api) {
      const tm = this.timing(V, api);
      const opp = seq(V.opponent || 'CCDCCDDCCC'), n = opp.length;
      const tft = opp.map((_, i) => i === 0 ? false : opp[i - 1]);
      const fgv = opp.map((_, i) => i >= 2 && opp[i - 1] && opp[i - 2]);
      const x0 = 380, pitch = (1760 - x0) / n, cw = pitch * 0.8, chh = 72, yO = 300, yM = 482;
      const cx = i => x0 + i * pitch + (pitch - cw) / 2;
      const forgiving = fin(lt, tm.tBetter, 0.6);
      // titles
      const sil = !!tm.silent;
      const tA1 = fio(lt, tm.t0, Math.min(tm.tName, tm.tBetter), 0.5), tA2 = tm.tName < tm.tBetter ? fio(lt, tm.tName, tm.tBetter, 0.5) : 0, tA3 = fin(lt, tm.tBetter, 0.6);
      if (sil) {   // keywords only: the caption carries the sentence
        A(ctx, tA1, () => text(V.name || '以牙还牙', 160, 215 + rise(tA1, 10), { size: 50, family: F.serif, weight: 600, color: P.ember }));
        A(ctx, tA3, () => runs([[V.name || '以牙还牙', P.ink], [' · ', P.dim], [V.fgLabel || '宽容版', P.ok]], 160, 215 + rise(tA3, 10), { size: 50, family: F.serif, weight: 600, align: 'left' }));
      } else {
        A(ctx, tA1, () => text(V.title || '程序对战：200 轮囚徒困境', 160, 215 + rise(tA1, 10), { size: 50, family: F.serif, weight: 600, color: P.ink }));
        A(ctx, tA2, () => runs([[V.champ || '冠军策略：', P.ink], [V.name || '以牙还牙', P.ember]], 160, 215 + rise(tA2, 10), { size: 50, family: F.serif, weight: 600, align: 'left' }));
        A(ctx, tA3, () => runs([[V.better || '更好的版本：', P.ink], [V.betterName || '多宽容一次', P.ok]], 160, 215 + rise(tA3, 10), { size: 50, family: F.serif, weight: 600, align: 'left' }));
      }
      // row labels
      A(ctx, fin(lt, tm.t0 + 0.3), () => text(V.oppLabel || '对手', 160, yO + chh / 2 + 1, { size: 38, weight: 700, color: P.teal, baseline: 'middle' }));
      const meA = fin(lt, tm.tChamp, 0.6);
      A(ctx, meA * (1 - forgiving), () => text(V.meLabel || (sil ? '我' : '冠军'), 160, yM + chh / 2 + 1, { size: 38, weight: 700, color: P.gold, baseline: 'middle' }));
      A(ctx, forgiving, () => text(V.fgLabel || '宽容版', 160, yM + chh / 2 + 1, { size: 38, weight: 700, color: P.gold, baseline: 'middle' }));
      // column numbers
      A(ctx, fin(lt, tm.t0 + 0.3) * (1 - 0.7 * fin(lt, tm.tMis, 0.4)), () => {
        for (let i = 0; i < n; i++) text(String(i + 1), cx(i) + cw / 2, yO - 18, { size: 24, family: F.mono, color: P.dim, align: 'center' });
      });
      const cell = (x, y, d, a, sc = 1) => A(ctx, a, () => {
        const h = chh * Math.max(0.06, sc);
        ctx.fillStyle = d ? P.red : P.ok; ctx.beginPath(); ctx.roundRect(x, y + (chh - h) / 2, cw, h, 10); ctx.fill();
        if (sc > 0.5) text(d ? (V.dLabel || '背叛') : (V.cLabel || '合作'), x + cw / 2, y + chh / 2 + 2, { size: 30, weight: 700, color: DARK, align: 'center', baseline: 'middle', alpha: (sc - 0.5) * 2 });
      });
      // opponent row: appears during the first sentence
      const oStart = tm.t0 + (sil ? 0.1 : 0.6), oStep = sil ? 0.05 : Math.min(0.32, Math.max(0.12, (tm.tChamp - oStart - 0.6) / n));
      for (let i = 0; i < n; i++) cell(cx(i), yO + rise(fin(lt, oStart + i * oStep, 0.4), 12), opp[i], fin(lt, oStart + i * oStep, 0.4));
      // my row: rule ① then rule ② (copy with arrows)
      const mStep = Math.min(0.34, Math.max(0.15, (tm.tName + 0.6 - tm.tR2 - 0.3) / (n - 1)));
      const tMe = i => sil ? tm.t0 + 0.7 + i * 0.05 : i === 0 ? tm.tR1 + 0.2 : tm.tR2 + 0.3 + (i - 1) * mStep;
      const changed = []; for (let i = 0; i < n; i++) if (tft[i] !== fgv[i]) changed.push(i);
      const tChange = i => tm.tTol + 0.45 * changed.indexOf(i);
      const tRet = tm.tTol + 0.45 * changed.length + 0.3;
      for (let i = 0; i < n; i++) {
        const a = fin(lt, tMe(i), 0.4);
        if (a <= 0) continue;
        // arrow from the opponent's previous move
        if (i > 0) {
          const ax = cx(i - 1) + cw / 2, bx = cx(i) + cw / 2;
          const ap = ease.out(prog(lt, tMe(i) - 0.15, tMe(i) + 0.2));
          const isRet = !!fgv[i];
          const colA = isRet ? P.red : 'rgba(233,228,216,0.55)';
          const ae = lerp(1, isRet ? 1 : 0.5, forgiving);
          arrow(ctx, ax + 8, yO + chh + 10, lerp(ax + 8, bx - 8, ap), lerp(yO + chh + 10, yM - 10, ap), forgiving > 0 && isRet ? P.red : 'rgba(233,228,216,0.6)', { lw: 2.5, head: 13, alpha: ap * ae });
          if (isRet && i >= 2) {
            const a2 = fin(lt, tRet, 0.5), sx = cx(i - 2) + cw / 2;
            arrow(ctx, sx + 8, yO + chh + 10, bx - 14, yM - 10, P.red, { lw: 2.5, head: 13, alpha: a2 });
          }
        }
        let d = tft[i], sc = 1;
        if (changed.includes(i)) { const f = prog(lt, tChange(i), tChange(i) + 0.3); if (f > 0) { d = f < 0.5 ? tft[i] : fgv[i]; sc = Math.abs(1 - 2 * f); } }
        cell(cx(i), yM + rise(a, 12), d, a, sc);
      }
      // rule ① highlight on the first cell
      A(ctx, fio(lt, tm.tR1 + 0.2, tm.tR2 + 0.4, 0.4), () => { ctx.strokeStyle = P.ember; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(cx(0) - 8, yM - 8, cw + 16, chh + 16, 14); ctx.stroke(); });
      // ---- forgiving annotations ----
      const mis = opp.findIndex((d, i) => d && !opp[i - 1] && !opp[i + 1]);
      if (mis >= 0) {
        const ma = fin(lt, tm.tMis, 0.5);
        A(ctx, ma, () => {
          ctx.strokeStyle = P.ember; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.roundRect(cx(mis) - 8, yO - 8, cw + 16, chh + 16, 14); ctx.stroke();
          text(V.misLabel || '误会', cx(mis) + cw / 2, yO - 20, { size: 32, weight: 700, color: P.ember, align: 'center' });
        });
      }
      for (const i of changed) {
        const a = fin(lt, tChange(i) + 0.3, 0.4);
        A(ctx, a, () => {
          ctx.strokeStyle = P.ok; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(cx(i) - 7, yM - 7, cw + 14, chh + 14, 14); ctx.stroke();
          text(V.tolLabel || '不还手', cx(i) + cw / 2, yM + chh + 46, { size: 30, weight: 500, color: P.ok, align: 'center' });
        });
      }
      const ret = fgv.findIndex(v => v);
      if (ret >= 0) {
        const a = fin(lt, tRet, 0.5);
        A(ctx, a, () => {
          ctx.strokeStyle = P.red; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(cx(ret) - 7, yM - 7, cw + 14, chh + 14, 14); ctx.stroke();
          text(V.retLabel || '连续两次才还手', cx(ret) - 4, yM + chh + 46, { size: 30, weight: 500, color: P.red, align: 'left' });
        });
      }
      // ---- rules (silent: the caption says it) ----
      const rX = 380, r1 = fin(lt, tm.tR1, 0.6), r2 = fin(lt, tm.tR2, 0.6), r3 = fin(lt, tm.tTol + 0.2, 0.6);
      if (!sil) A(ctx, r1, () => runs([['①', P.ember, { family: F.mono }], [' ' + (V.rule1 || '第一次合作'), P.ink]], rX, 690 + rise(r1, 10), { size: 44, align: 'left' }));
      if (!sil) A(ctx, r2, () => runs([['②', P.ember, { family: F.mono }], [' ' + (V.rule2 || '之后照抄对方上一步'), P.ink]], rX, 764 + rise(r2, 10), { size: 44, align: 'left' }));
      if (!sil) A(ctx, r3, () => runs([['③', P.ok, { family: F.mono }], [' ' + (V.rule3 || '多宽容一次：连续背叛两次才还手'), P.ok]], rX, 838 + rise(r3, 10), { size: 40, align: 'left' }));
      // ---- hotline ----
      const ha = fin(lt, tm.tHot, 0.7);
      if (tm.note || V.hotline) A(ctx, ha, () => {
        const s = tm.note || V.hotline, j = s.indexOf('：');
        const head = j >= 0 ? s.slice(0, j) : '', body = j >= 0 ? s.slice(j + 1) : s;
        if (sil) {   // icon + keyword only
          const w = 380, h = 140, x = 960 - w / 2, y = 670 + rise(ha, 14);
          card(ctx, x, y, w, h, { stroke: 'rgba(255,154,85,0.5)' });
          phone(ctx, x + 88, y + h / 2, P.ember);
          text(head || body, x + 176, y + h / 2 + 2, { size: 48, weight: 700, color: P.ember, baseline: 'middle' });
          return;
        }
        const x = 1250, y = 640 + rise(ha, 14), w = 510, h = 170;
        card(ctx, x, y, w, h, { stroke: 'rgba(255,154,85,0.5)' });
        phone(ctx, x + 78, y + h / 2, P.ember);
        if (head) text(head, x + 156, y + 72, { size: 44, weight: 700, color: P.ember });
        text(body, x + 156, y + (head ? 128 : 96), { size: 34, weight: 500, color: P.ink });
      });
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.t0 + 0.6, 'tick');
      if (!t.silent) { cue(out, t.tR1 + 0.2, 'pop'); cue(out, t.tR2 + 0.3, 'count', { dur: 2.4 }); cue(out, t.tName, 'chime'); }
      cue(out, t.tMis, 'pop'); cue(out, t.tTol, 'click'); cue(out, t.tHot, 'chime');
      return out;
    },
  });
  // hotline icon: two players joined by a direct line carrying a signal pulse
  function phone(ctx, x, y, color) {
    const w = 104;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x - w / 2 + 12, y);
    ctx.lineTo(x - 16, y); ctx.lineTo(x - 8, y - 18); ctx.lineTo(x + 2, y + 16); ctx.lineTo(x + 10, y - 8); ctx.lineTo(x + 16, y);
    ctx.lineTo(x + w / 2 - 12, y); ctx.stroke();
    K.dot(x - w / 2, y, 13, P.gold); K.dot(x + w / 2, y, 13, P.teal);
    ctx.restore();
  }
})();
