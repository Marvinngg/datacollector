/* 二 好孩子思维 (e2): the fuel, the weightlessness, the rules.
 * b07 fuel       — the concept is defined like a term (好孩子思维 · pinyin · a hairline); 你 waits below, dim. Praise words
 *                  appear in the dark above like warm embers, drift, fall, and dissolve into 你: with each one 你 is lit a
 *                  little more (borrowed, cold light) and a thin gauge beside it (燃料 · 认可) fills. Under the caption the
 *                  gauge leaks: the fuel burns, the light is only as long as the supply.
 * b08 weightless — a ruled line called 标准 under 你; 你 stands on it, lit. The line is erased from both ends inward and
 *                  crumbles into motes; 你 loses its ground: constant slow spin, constant slow drift, its particles loosening,
 *                  the borrowed light draining, the motes of the world drifting in every direction (no up, no down).
 *                  Then a fork in perspective: a lit, solid, ruled path under somebody's lamp (有把握的事) and a dark, dashed,
 *                  wavering one that dissolves into fog (可能出丑的事). 你 settles at the fork and drifts onto the lit one.
 * b09 rules      — an official evaluation form in fine line art. Three rules arrive as form lines, each ticked in red.
 *                  A free scribble — 个性, warm, boiling like hand-drawn animation — tries to get in; the red pen writes 0;
 *                  the scribble stops boiling, greys and shrinks.
 * Every frame is a closed-form function of lt. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const { C, beat } = KIT;
  const TAU = Math.PI * 2, B = beat.BEAT;
  const at = (api, n) => KIT.at(api, n);
  const smooth = k => k * k * (3 - 2 * k);
  // PX blurs the glow only inside the bounding box of what was drawn: two invisible corner points make it the frame
  const CXF = new Float32Array([2, W - 3]), CYF = new Float32Array([2, H - 3]);
  const fullFrame = () => PX.points(CXF, CYF, 2, [0, 0, 0], { a: 0.001, glow: 1 });
  const rgbS = hex => KIT.rgb(hex);
  const mixRGB = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  const LAMP = KIT.L.lamp, GOLD = [1.0, 0.8, 0.5], INK = rgbS('#ece7dc'), GRAY = rgbS(C.gray);

  // 你's home in this chapter (same place in b07 and b08 so the dip between them reads as one shot)
  const YOU = { x: 540, y: 980, size: 300 };
  // 你's point cloud exactly as KIT.you samples it (size 300: no quantisation, step 2.5, seed 17)
  const youA = lit => 1 + 1.3 * lit;                    // KIT.you reads dim at this size: let the borrowed light show
  const youPts = () => PX.text('你', { size: 300, family: F.serif, weight: 600, x: 0, y: 300 * 0.38, step: 2.5, seed: 17 });

  // ================================================================ b07 fuel
  const WORD_SIZE = 50;
  const WORD_START = [[320, 560], [760, 540], [260, 450], [810, 440], [590, 430], [290, 650]];
  const wordCloud = (w, i) => PX.text(w, { size: WORD_SIZE, family: F.serif, weight: 600, x: 0, y: WORD_SIZE * 0.36, step: 1.05, seed: 40 + i });
  const wordTimes = (api) => { const tP = at(api, 'praise'); return [0, 1, 2, 3, 4, 5].map(i => tP + (i + 2) * B); };   // landings, on the beat

  function gauge(x, y0, y1, fill, a, lt, lands) {
    if (a <= 0) return;
    const h = y1 - y0, hw = 7;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.strokeStyle = 'rgba(236,231,220,0.32)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - hw, y0); ctx.lineTo(x - hw, y1); ctx.lineTo(x + hw, y1); ctx.lineTo(x + hw, y0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - hw - 5, y0); ctx.lineTo(x + hw + 5, y0); ctx.stroke();
    // six graduations, one per word
    for (let i = 1; i <= 6; i++) {
      const yy = y1 - h * i / 6, lit = lands[i - 1];
      ctx.strokeStyle = `rgba(223,232,255,${0.22 + 0.5 * lit})`;
      ctx.beginPath(); ctx.moveTo(x - hw - 4, yy); ctx.lineTo(x - hw - (i % 3 === 0 ? 16 : 10), yy); ctx.stroke();
    }
    // the fuel: cold borrowed light
    if (fill > 0.001) {
      const fy = y1 - h * fill, g = ctx.createLinearGradient(0, fy, 0, y1);
      g.addColorStop(0, 'rgba(232,240,255,0.95)'); g.addColorStop(0.12, 'rgba(223,232,255,0.55)'); g.addColorStop(1, 'rgba(223,232,255,0.30)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - hw + 3, fy, hw * 2 - 6, y1 - fy - 2);
      ctx.fillStyle = 'rgba(240,245,255,0.9)'; ctx.fillRect(x - hw + 2, fy - 1, hw * 2 - 4, 1.6);
      L.light(x, fy, 34, 'rgba(223,232,255,0.16)', 1);
    }
    ctx.restore();
    text('燃料 · 认可', x, y1 + 44, { size: 20, family: F.sans, weight: 400, color: C.dim, align: 'center', spacing: 3, alpha: a });
  }

  T.register('fuel', {
    draw(ctx, V, lt, api) {
      const tN = at(api, 'name'), tP = at(api, 'praise'), tR = at(api, 'rule'), dur = api.dur;
      const words = V.lines.praise, TL_ = wordTimes(api);
      // ---- the term
      const kT = prog(lt, tN + 0.25, tN + 2.3), up = ease.inOut(prog(lt, tP - 1.7, tP + 0.1));
      const ty = lerp(560, 330, up), ts = lerp(1, 0.62, up), ta = lerp(1, 0.62, up);
      ctx.save(); ctx.translate(W / 2, ty); ctx.scale(ts, ts);
      L.serif(V.lines.name, 0, 0, { size: 96, weight: 600, color: '#f2ecdf', glow: 5, reveal: kT, spacing: 22, alpha: ta });
      const lw = 520 * ease.inOut(prog(lt, tN + 0.9, tN + 2.4));
      if (lw > 1) {
        ctx.save(); ctx.globalAlpha *= 0.5 * ta; ctx.fillStyle = C.ink; ctx.fillRect(-lw / 2, 66, lw, 1.2);
        ctx.fillRect(-lw / 2, 60, 1.2, 12); ctx.fillRect(lw / 2 - 1.2, 60, 1.2, 12); ctx.restore();
      }
      text('hǎo háizi sīwéi', 0, 116, { size: 24, family: F.mono, color: C.dim, align: 'center', spacing: 6, alpha: ta * ease.out(prog(lt, tN + 1.6, tN + 2.8)) });
      ctx.restore();

      // ---- fuel level: each landed word adds a sixth; under the caption the fuel burns down a little
      const lands = TL_.map(tl => smooth(prog(lt, tl - 0.05, tl + 0.55)));
      const burn = 1 - 0.38 * smooth(prog(lt, tR + 1.2, dur));
      const fill = lands.reduce((a, b) => a + b, 0) / 6 * burn;
      let flash = 0; for (const tl of TL_) if (lt >= tl) flash += Math.exp(-(lt - tl) * 3.5);
      const lit = 0.04 + 0.86 * fill + 0.22 * flash;

      PX.begin();
      // ---- 你
      const ya = ease.out(prog(lt, tN + 1.4, tN + 3.4));
      KIT.you(YOU.x, YOU.y, YOU.size, { lit, a: (0.35 + 0.65 * ya) * youA(lit), t: lt, breathe: 0.45, scale: 1 + 0.012 * flash });
      // ---- the praise words: embers that appear, hover, fall and dissolve into 你
      const YP = youPts();
      words.forEach((w, wi) => {
        const tl = TL_[wi], t0 = tl - 2.4;
        if (lt < t0 || lt > tl + 0.5) return;
        const cl = wordCloud(w, wi), n = cl.n, out = PX.buf(n, 300 + wi);
        const ap = ease.out(prog(lt, t0, t0 + 0.8));
        const fall = prog(lt, t0 + 1.25, tl);
        const [sx, sy] = WORD_START[wi];
        const hov = (lt - t0) * 12;                          // a slow drift while it hovers
        const cx = lerp(sx + Math.sin(lt * 0.9 + wi) * 6, YOU.x, ease.inOut(fall)), cy = lerp(sy + hov, YOU.y - 30, ease.in(fall));
        const shrink = 1 - 0.25 * ease.in(fall);
        const d = prog(lt, tl - 0.7, tl + 0.45);              // dissolve into the body
        for (let i = 0; i < n; i++) {
          const r1 = PX.rand(i, 61 + wi), r2 = PX.rand(i, 71 + wi);
          const ki = smooth(clamp(d * 1.7 - r1 * 0.7));
          const j = (i * 37 + wi * 911) % YP.n;
          const wx = cx + cl.X[i] * shrink + Math.sin(lt * 2.1 + r2 * 30) * 0.7, wy = cy + cl.Y[i] * shrink + Math.cos(lt * 1.7 + r1 * 30) * 0.7;
          const sw = Math.sin(ki * Math.PI) * 26 * (r2 - 0.5);
          out.X[i] = lerp(wx, YOU.x + YP.X[j], ki) + sw; out.Y[i] = lerp(wy, YOU.y + YP.Y[j], ki) - Math.sin(ki * Math.PI) * 18 * r1;
          out.A[i] = ap * (1 - ki * 0.9) * (0.75 + 0.25 * r2);
        }
        const col = mixRGB(GOLD, LAMP, smooth(d));
        PX.points(out.X, out.Y, n, col, { a: 0.5, A: out.A, glow: 0.45 });
        // a few embers shed while falling
        if (fall > 0 && d < 1) {
          const m = 26, e = PX.buf(m, 320 + wi);
          for (let k = 0; k < m; k++) {
            const lag = 0.04 + PX.rand(k, 81 + wi) * 0.22, f2 = clamp(fall - lag);
            e.X[k] = lerp(sx, YOU.x, ease.inOut(f2)) + (PX.rand(k, 82) - 0.5) * 60; e.Y[k] = lerp(sy + hov, YOU.y - 30, ease.in(f2)) - 8;
            e.A[k] = (1 - lag * 3) * fall * (1 - d) * 0.8;
          }
          PX.points(e.X, e.Y, m, GOLD, { a: 0.6, A: e.A, glow: 0.8 });
        }
      });
      PX.flush({ exposure: 1.45, glow: 1.0 });

      // ---- the gauge beside 你
      gauge(800, 870, 1110, fill, ease.out(prog(lt, tP - 0.3, tP + 0.9)), lt, lands);
      // ---- the caption
      KIT.caption(V.lines.rule, prog(lt, tR + 0.25, tR + 2.6), { hi: ['别人的评价'], hiColor: C.gold });
    },
    cues(V, api) {
      const out = [{ t: at(api, 'name') + 0.25, type: 'title' }];
      wordTimes(api).forEach((t, i) => out.push({ t, type: 'glow', i, n: 6 }));
      out.push({ t: at(api, 'rule'), type: 'hush' });
      return out;
    },
  });

  // ================================================================ b08 weightless
  const LY = 1144, LX0 = 170, LX1 = 910, LHM = (LX1 - LX0) / 2, LCX = (LX0 + LX1) / 2;
  const NL = 740;                                           // motes the line is made of when it crumbles
  const invInOut = e => e < 0.5 ? Math.cbrt(e / 4) : 1 - Math.cbrt(2 * (1 - e)) / 2;
  const ERASE = [0.3, 2.1];                                 // erase window after 'gone'
  // the fork in perspective: ground plane z (depth) -> screen
  const HOR = 560, FK = 640;
  const sy_ = z => HOR + FK / z, sx_ = (X, z) => W / 2 + FK * X / z;
  const ZF = 1.2, SLOPE = 0.62;
  const g_ = z => { const u = Math.max(0, z - ZF); return u * u / (u + 0.5); };
  const PATH = { lit: z => -SLOPE * g_(z), dark: (z, t) => SLOPE * g_(z) + 0.035 * Math.sin(z * 4.2 + t * 1.1) * clamp(z - 1.8) };
  const HW = 0.2;
  const ZV = (() => { let z = ZF; while (SLOPE * g_(z) < HW) z += 0.005; return z; })();   // where the inner edges part
  const ZPOOL = 2.2;
  const YS0 = 0.55;                                         // 你's scale at the near end of the trunk

  // where 你 is while weightless (closed form; also the start of the fork's settle)
  function floatState(lt, tG) {
    const tau = Math.max(0, lt - (tG + 1.75));
    const s = tau < 1.2 ? tau * tau / 2.4 : tau - 0.6;     // eases into constant motion (no ground, nothing stops it)
    return {
      x: YOU.x + 8.5 * s + 4 * Math.sin(s * 0.7), y: YOU.y - 4.5 * s + 3 * Math.sin(s * 0.9 + 1),
      rot: 0.06 * s + 0.012 * s * s + 0.018 * Math.sin(s * 1.3), drift: 2.2 * Math.pow(s, 1.45), scale: 1, tau,   // the tumble slowly gathers
    };
  }
  function edgeStroke(pts, col, a0, w, aOf) {
    for (let i = 1; i < pts.length; i++) {
      const a = a0 * aOf(pts[i][2]); if (a <= 0.004) continue;
      ctx.strokeStyle = css(col, a); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
  }
  function drawFork(lt, tF, kOn, litK) {
    const zMax = lerp(0.9, 14, ease.inOut(kOn)); if (kOn <= 0) return;
    const zs = []; for (let z = 0.86; z <= zMax; z *= 1.03) zs.push(z);
    ctx.save(); ctx.lineCap = 'round';
    const near = z => smooth(clamp((z - 0.86) / 0.2));
    const fadeL = z => clamp(1.25 / Math.pow(z, 0.55)) * clamp((zMax - z) / 0.6 + 0.15) * near(z);
    // ---- lit path: solid, ruled, steady
    const Lc = PATH.lit, outerL = zs.map(z => [sx_(Lc(z) - HW, z), sy_(z), z]), innerL = zs.filter(z => z >= ZV).map(z => [sx_(Lc(z) + HW, z), sy_(z), z]);
    const lc = mixRGB(INK, LAMP, 0.6);
    edgeStroke(outerL, lc, 0.75, 1.6, fadeL); edgeStroke(innerL, lc, 0.75, 1.6, fadeL);
    for (let k = 0, z = 1.12; z < zMax; k++, z = 1.12 + k * 0.32) {          // ties at equal ground spacing
      const xl = sx_(Lc(z) - HW, z), xr = sx_(Lc(z) + HW, z), y = sy_(z);
      const inPool = Math.exp(-Math.pow((z - ZPOOL) / 0.6, 2)) * litK;
      const a = (0.3 + 0.5 * inPool) * fadeL(z) * (z < ZV ? 0.0 : 1);
      if (a > 0.004) { ctx.strokeStyle = css(lc, a); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(xl + 3, y); ctx.lineTo(xr - 3, y); ctx.stroke(); }
    }
    // ---- trunk ties (shared, near)
    for (let z = 1.06; z < Math.min(ZV - 0.1, zMax); z += 0.2) {
      const y = sy_(z), xl = sx_(-HW, z) + 4, xr = sx_(HW, z) - 4;
      ctx.strokeStyle = css(INK, 0.2 * fadeL(z)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xl, y); ctx.lineTo(xr, y); ctx.stroke();
    }
    // ---- dark path: dashed, wavering, thinning into nothing
    const Dc = z => PATH.dark(z, lt);
    const fadeD = z => clamp(1.25 / Math.pow(z, 0.55)) * clamp((4.6 - z) / 2.2) * clamp((zMax - z) / 0.6 + 0.15) * near(z);
    const outerD = zs.map(z => [sx_(Dc(z) + HW, z), sy_(z), z]), innerD = zs.filter(z => z >= ZV).map(z => [sx_(Dc(z) - HW, z), sy_(z), z]);
    const dc = mixRGB(INK, [0.45, 0.5, 0.6], 0.5);
    edgeStroke(outerD.filter(p => p[2] < ZF + 0.35), lc, 0.75, 1.6, z => fadeL(z) * (1 - smooth(clamp((z - ZF) / 0.35))));   // the shared trunk is solid
    ctx.setLineDash([7, 9]); ctx.lineDashOffset = 0;
    edgeStroke(outerD.filter(p => p[2] > ZF && (p[2] < 2.75 || p[2] > 3.25)), dc, 0.5, 1.2, fadeD);
    edgeStroke(innerD.filter(p => p[2] < 2.6 || p[2] > 3.4), dc, 0.5, 1.2, fadeD);
    ctx.setLineDash([]);
    for (let k = 0, z = ZV + 0.1; z < Math.min(zMax, 4.4); k++, z = ZV + 0.1 + k * 0.32) {
      if (PX.rand(k, 91) < 0.4 || (z > 2.6 && z < 3.4)) continue;          // missing ties, a gap
      const xl = sx_(Dc(z) - HW, z), xr = sx_(Dc(z) + HW, z), y = sy_(z), tw = (xr - xl) * (0.3 + 0.5 * PX.rand(k, 92));
      ctx.strokeStyle = css(dc, 0.28 * fadeD(z)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xl + 4, y); ctx.lineTo(xl + 4 + tw, y); ctx.stroke();
    }
    ctx.restore();
  }

  T.register('weightless', {
    draw(ctx, V, lt, api) {
      const tM = at(api, 'met'), tG = at(api, 'gone'), tF = at(api, 'fork'), dur = api.dur;
      const kOn = ease.inOut(prog(lt, tM + 0.15, tM + 1.25));
      const er = ease.inOut(prog(lt, tG + ERASE[0], tG + ERASE[1]));
      const half = LHM * kOn * (1 - er);
      const wk = smooth(prog(lt, tG + 1.2, tG + 3.2)) * (1 - smooth(prog(lt, tF + 0.4, tF + 2.4)));   // weightless-ness
      // ---- 你's state
      let st;
      const fl = floatState(lt, tG);
      const litMet = 0.82 + 0.05 * Math.sin(lt * 1.3);
      const litGone = lerp(litMet, 0.36, smooth(prog(lt, tG + 0.6, tG + 4.4)));
      if (lt < tF) st = { ...fl, lit: lt < tG ? litMet : litGone };
      else {
        const s0 = floatState(tF, tG), k = ease.inOut(prog(lt, tF, tF + 2.1));
        const zy = lerp(1.0, ZPOOL - 0.1, ease.inOut(prog(lt, tF + 3.0, tF + 5.6)));     // 你 drifts up the lit path
        const fx = sx_(zy > 1.0 ? PATH.lit(zy) : 0, zy), fy = sy_(zy), sc = YS0 / Math.pow(zy, 0.6);
        const tx = fx, ty = fy - YOU.size * sc * 0.5 - 10 * sc;
        const bob = Math.sin((lt - tF) * 1.6) * 4 * (1 - k * 0.6);
        st = {
          x: lerp(s0.x, tx, k), y: lerp(s0.y, ty, k) + bob, rot: lerp(s0.rot, 0, k) + 0.02 * Math.sin((lt - tF) * 1.2) * (1 - k),
          drift: lerp(s0.drift, 0, k), scale: lerp(1, sc, k),
          lit: 0.36 + 0.5 * smooth(prog(lt, tF + 4.4, tF + 6.0)),
        };
      }

      // ---- the fork (behind everything)
      const fOn = prog(lt, tF + 0.5, tF + 2.6), litK = ease.out(prog(lt, tF + 1.6, tF + 2.8));
      if (fOn > 0) {
        drawFork(lt, tF, fOn, litK);
        // the labels
        const la = ease.out(prog(lt, tF + 2.0, tF + 3.0));
        const zl = 10, xl = sx_(PATH.lit(zl), zl) + 50, yl = sy_(zl) - 40;
        L.serif(V.lines.safe, xl, yl, { size: 32, color: '#e8ecf5', glow: 6, reveal: la, spacing: 4 });
        const zd = 4.4, xd = sx_(PATH.dark(zd, 0), zd) + 10, yd = sy_(zd) - 50;
        const fl2 = 0.55 + 0.2 * Math.sin(lt * 2.3) * Math.sin(lt * 0.7 + 1);
        L.serif(V.lines.risk, xd, yd, { size: 32, color: 'rgba(170,176,190,1)', glow: 0, reveal: la, alpha: fl2, spacing: 4 });
      }

      // ---- the ruled line 标准
      if (half > 0.5) {
        ctx.save(); ctx.globalAlpha *= 0.85;
        ctx.strokeStyle = 'rgba(223,232,255,0.7)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(LCX - half, LY); ctx.lineTo(LCX + half, LY); ctx.stroke();
        ctx.strokeStyle = 'rgba(223,232,255,0.32)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = LX0; x <= LX1 + 0.1; x += 18.5) {
          if (Math.abs(x - LCX) > half) continue;
          const big = Math.round((x - LX0) / 18.5) % 5 === 0;
          ctx.moveTo(x, LY + 3); ctx.lineTo(x, LY + (big ? 15 : 8));
        }
        ctx.stroke(); ctx.restore();
        // the light 你 casts on the line it stands on
        L.light(LCX, LY, 190, 'rgba(223,232,255,0.10)', kOn * (1 - er));
      }
      // label 标准: sits at the right end; when the erasure reaches it, it floats off, turning
      {
        const la = ease.out(prog(lt, tM + 0.7, tM + 1.6));
        const tr = tG + ERASE[0] + invInOut(0.02) * (ERASE[1] - ERASE[0]);
        const tau = Math.max(0, lt - tr), s = tau < 1 ? tau * tau / 2 : tau - 0.5;
        if (la > 0) {
          ctx.save(); ctx.translate(LX1 - 26 + 9 * s, LY - 26 - 7 * s); ctx.rotate(-0.12 * s);
          text(V.lines.std, 0, 0, { size: 30, family: F.serif, weight: 400, color: '#dfe8ff', align: 'right', spacing: 6, alpha: la * 0.8 * (1 - smooth(prog(tau, 0.5, 4.5))) });
          ctx.restore();
        }
      }

      PX.begin(); fullFrame();          // the motes fill the frame: let their faint halo fill it too (no box edge)
      // ---- the line's crumbs: released where the erasure passes, then they float, every one its own way
      if (lt > tG + ERASE[0]) {
        const out = PX.buf(NL, 410); let m = 0;
        for (let i = 0; i < NL; i++) {
          const x0 = LX0 + (i + 0.5) / NL * (LX1 - LX0), e = 1 - Math.abs(x0 - LCX) / LHM;
          const tr = tG + ERASE[0] + invInOut(clamp(e, 0, 0.999)) * (ERASE[1] - ERASE[0]);
          if (lt < tr) continue;
          const tau = lt - tr, an = PX.rand(i, 11) * TAU, sp = 4 + Math.pow(PX.rand(i, 12), 2) * 40;
          const kick = (1 - Math.exp(-tau * 2)) * 6;
          out.X[m] = x0 + Math.cos(an) * (sp * tau + kick) + (x0 > LCX ? 1 : -1) * kick * 0.6;
          out.Y[m] = LY + Math.sin(an) * (sp * tau + kick) + Math.sin(tau * 0.8 + i) * 1.5;
          out.A[m] = Math.exp(-tau * (0.25 + 0.35 * PX.rand(i, 13))) * (tau < 0.15 ? 1.6 : 1); m++;
        }
        PX.points(out.X, out.Y, m, LAMP, { a: 0.55 * (1 - smooth(prog(lt, tF + 0.5, tF + 2.0))), A: out.A, glow: 0.35 });
      }
      // ---- the motes of the world: no gravity, each on its own straight line, at its own depth
      if (wk > 0) {
        const nm = 380, out = PX.buf(nm, 420);
        for (let i = 0; i < nm; i++) {
          const dpt = 0.3 + 0.7 * PX.rand(i, 21), an = PX.rand(i, 22) * TAU, sp = (4 + 14 * PX.rand(i, 23)) * dpt;
          const x = 60 + PX.rand(i, 24) * 960 + Math.cos(an) * sp * (lt - tG), y = 220 + PX.rand(i, 25) * 1500 + Math.sin(an) * sp * (lt - tG);
          out.X[i] = x; out.Y[i] = y; out.A[i] = dpt * (0.55 + 0.45 * Math.sin(lt * (0.5 + PX.rand(i, 26)) + i));
        }
        PX.points(out.X, out.Y, nm, [0.82, 0.86, 0.95], { a: 1.5 * wk, A: out.A, glow: 0.4, size: 2 });
      }
      // ---- fog where the dark path gives out
      if (fOn > 0) {
        const nf = 160, out = PX.buf(nf, 430), fa = ease.out(prog(lt, tF + 1.4, tF + 3.0));
        for (let i = 0; i < nf; i++) {
          const z = 3.3 + PX.rand(i, 41) * 2.0, X = PATH.dark(z, lt) + (PX.rand(i, 42) - 0.5) * 0.7;
          out.X[i] = sx_(X, z) + Math.sin(lt * 0.4 + i) * 6; out.Y[i] = sy_(z) + (PX.rand(i, 43) - 0.5) * 40 + Math.cos(lt * 0.3 + i) * 4;
          out.A[i] = 0.3 + 0.7 * PX.rand(i, 44);
        }
        PX.points(out.X, out.Y, nf, [0.55, 0.6, 0.72], { a: 0.28 * fa, A: out.A, glow: 0.3 });
      }
      // ---- 你
      // pieces of 你 come loose and keep going, each in its own straight line (nothing pulls them back)
      if (lt > tG + 1.9 && lt < tF + 2) {
        const YP = youPts(), np = Math.floor(YP.n / 6), out = PX.buf(np, 440); let m = 0;
        const fade = 1 - smooth(prog(lt, tF, tF + 1.6));
        for (let q = 0; q < np; q++) {
          const i = q * 6, tr = tG + 1.9 + PX.rand(i, 51) * 4.4; if (lt < tr) continue;
          const s0 = floatState(tr, tG), cs = Math.cos(s0.rot), sn = Math.sin(s0.rot);
          const bx = YP.X[i] * cs - YP.Y[i] * sn, by = YP.X[i] * sn + YP.Y[i] * cs, d = Math.hypot(bx, by) + 1;
          const an = PX.rand(i, 52) * TAU, sp = 6 + 22 * PX.rand(i, 53), tau = lt - tr;
          out.X[m] = s0.x + bx + (bx / d * 0.7 + Math.cos(an) * 0.6) * sp * tau; out.Y[m] = s0.y + by + (by / d * 0.7 + Math.sin(an) * 0.6) * sp * tau;
          out.A[m] = Math.exp(-tau * 0.35) * clamp(tau * 4) * fade; m++;
        }
        PX.points(out.X, out.Y, m, mixRGB([0.62, 0.64, 0.68], LAMP, st.lit), { a: 0.85, A: out.A, glow: 0.3 });
      }
      KIT.you(st.x, st.y, YOU.size, { lit: st.lit, t: lt, rot: st.rot, drift: st.drift, scale: st.scale, breathe: 0.4 + 0.9 * wk, a: youA(st.lit) * Math.pow(st.scale, 1.5) });
      // somebody's lamp over the lit path (cone + its dust)
      if (fOn > 0 && litK > 0) { const zp = ZPOOL; KIT.spot(sx_(PATH.lit(zp), zp), sy_(zp), { k: litK * 0.6, w: 120, h: 580, px: true, t: lt, dust: 0.6, tag: 3 }); }
      PX.flush({ exposure: 1.45, glow: 1.0 });

      // ---- captions
      const out1 = prog(lt, tG - 0.45, tG);
      KIT.caption(V.lines.met, prog(lt, tM + 0.6, tM + 2.6), { out: out1 });
      floatCaption(V.lines.gone, lt, tG + 1.0, tF - 0.45, wk);
      KIT.caption(V.lines.fear, prog(lt, tF + 2.6, tF + 4.6), { size: 42, color: C.dim, y: 1480 });
    },
    cues(V, api) {
      const tM = at(api, 'met'), tG = at(api, 'gone'), tF = at(api, 'fork');
      return [
        { t: tM + 0.15, type: 'tick' },
        { t: tG + ERASE[0], type: 'whoosh', dur: ERASE[1] - ERASE[0] },
        { t: tG + 1.75, type: 'swell', dur: +(tF + 1.5 - (tG + 1.75)).toFixed(3) },
        { t: tF + 4.4, type: 'glow' },
      ];
    },
  });
  // a caption whose characters, once revealed, lose their baseline: each floats and turns a little, on its own
  function floatCaption(str, lt, t0, t1, wk) {
    const k = prog(lt, t0, t0 + 1.8), out = prog(lt, t1, t1 + 0.45);
    if (k <= 0 || out >= 1) return;
    const size = 54, o = { size, family: F.serif, weight: 400 }, sp = size * 0.04;
    const chars = [...str], ws = chars.map(c => measure(c, o) + sp), tw = ws.reduce((a, b) => a + b, 0) - sp;
    let x = W / 2 - tw / 2; const n = chars.length;
    chars.forEach((c, i) => {
      const p = clamp(k * (n + 5) - i, 0, 5) / 5, e = ease.out(p);
      if (p > 0) {
        const f = smooth(prog(lt, t0 + 1.2 + i * 0.05, t0 + 3.8)) * wk;
        const dy = (Math.sin(lt * (0.35 + PX.rand(i, 5) * 0.3) + i * 1.7) * 2.2 + (PX.rand(i, 6) - 0.5) * 4) * f;
        const rot = (Math.sin(lt * (0.3 + PX.rand(i, 7) * 0.2) + i) * 0.015 + (PX.rand(i, 8) - 0.5) * 0.03) * f;
        ctx.save(); ctx.translate(x + ws[i] / 2, 1460 + dy + (1 - e) * size * 0.35); ctx.rotate(rot);
        text(c, -ws[i] / 2 + sp / 2, 0, { ...o, color: C.ink, alpha: e * (1 - ease.in(out)) });
        ctx.restore();
      }
      x += ws[i];
    });
  }

  // ================================================================ b09 rules
  const FM = { x0: 130, x1: 950, y0: 320, hy: 430, fy: 512, row: 190, sx: 800 };
  const rowY = i => FM.fy + i * FM.row;
  const FY1 = rowY(4) + 6;
  const splitRule = s => { const i = s.indexOf('，'); return i < 0 ? [s] : [s.slice(0, i + 1), s.slice(i + 1)]; };
  const WARM = rgbS(C.warm), FREE = rgbS(C.free), GOLDC = rgbS(C.gold), CORAL = [1.0, 0.62, 0.45];

  function hline(x0, x1, y, k, col, w = 1) { if (k <= 0) return; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, k), y); ctx.stroke(); }
  function vline(x, y0, y1, k, col, w = 1) { if (k <= 0) return; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, lerp(y0, y1, k)); ctx.stroke(); }

  function form(lt, api, V, dim) {
    const t1 = at(api, 'r1'), k = ease.inOut(prog(lt, t1, t1 + 1.1)), ka = ease.out(prog(lt, t1 + 0.3, t1 + 1.2));
    const LINE = 'rgba(236,231,220,0.30)', FAINT = 'rgba(236,231,220,0.14)';
    ctx.save(); ctx.globalAlpha *= dim;
    // the sheet: a barely-there paper, a frame, a double rule under the header
    ctx.fillStyle = `rgba(236,231,220,${0.025 * k})`; ctx.fillRect(FM.x0, FM.y0, FM.x1 - FM.x0, (FY1 - FM.y0) * k);
    hline(FM.x0, FM.x1, FM.y0, k, LINE, 1.3); hline(FM.x1, FM.x0, FY1, k, LINE, 1.3);
    vline(FM.x0, FM.y0, FY1, k, LINE, 1.3); vline(FM.x1, FY1, FM.y0, k, LINE, 1.3);
    hline(FM.x0, FM.x1, FM.hy, k, LINE, 1.2); hline(FM.x0, FM.x1, FM.hy + 5, k, FAINT, 1);
    hline(FM.x0, FM.x1, FM.fy, k, FAINT, 1);
    vline(FM.sx, FM.hy + 5, FY1, k, FAINT, 1);
    // header
    text('评 分 表', FM.x0 + 40, FM.y0 + 70, { size: 34, family: F.serif, weight: 600, color: C.ink, alpha: ka * 0.9, spacing: 8 });
    text('好孩子 · 行为规范', FM.x0 + 40, FM.y0 + 100, { size: 18, family: F.sans, color: C.dim, alpha: ka * 0.8, spacing: 4 });
    text('No. 0001', FM.x1 - 36, FM.y0 + 70, { size: 20, family: F.mono, color: C.dim, align: 'right', alpha: ka * 0.7, spacing: 2 });
    text('姓名', FM.x0 + 40, FM.hy + 54, { size: 22, family: F.sans, color: C.dim, alpha: ka });
    hline(FM.x0 + 100, FM.x0 + 330, FM.hy + 60, ka, FAINT, 1);
    text('你', FM.x0 + 130, FM.hy + 54, { size: 36, family: F.hand, color: C.ink, alpha: ka * 0.85 });
    text('得分', (FM.sx + FM.x1) / 2, FM.hy + 54, { size: 22, family: F.sans, color: C.dim, align: 'center', alpha: ka, spacing: 4 });
    ctx.restore();
  }
  function ruleRow(i, str, lt, t0, dim) {
    const y = rowY(i), lines = splitRule(str);
    ctx.save(); ctx.globalAlpha *= dim;
    hline(FM.x0, FM.sx, y + FM.row, ease.inOut(prog(lt, t0, t0 + 0.9)), 'rgba(236,231,220,0.14)', 1);
    text(String(i + 1).padStart(2, '0'), FM.x0 + 40, y + 78, { size: 22, family: F.mono, color: C.faint, alpha: ease.out(prog(lt, t0, t0 + 0.4)) * 2.2 });
    const n = [...str].length, k = prog(lt, t0 + 0.2, t0 + 0.2 + n * 0.075);
    let done = 0;
    lines.forEach((l, j) => {
      const m = [...l].length, kk = clamp((k * n - done) / m); done += m;
      KIT.type(l, FM.x0 + 100, y + 80 + j * 56, { size: 38, family: F.serif, weight: 400, color: C.ink, k: kk, align: 'left', alpha: 0.88, spacing: 1 });
    });
    // the box and the red tick
    const bx = (FM.sx + FM.x1) / 2, by = y + 92, ba = ease.out(prog(lt, t0 + 0.2, t0 + 0.7));
    ctx.strokeStyle = `rgba(236,231,220,${0.4 * ba})`; ctx.lineWidth = 1.3; ctx.strokeRect(bx - 24, by - 24, 48, 48);
    ctx.restore();
    KIT.pen('check', bx + 4, by - 2, 58, ease.inOut(prog(lt, t0 + 1.6, t0 + 1.95)), { seed: 11 + i, width: 5 });
  }

  // the scribble: 个性 written freely, looped around, boiling (each 1/8 s the hand redraws it slightly differently)
  function scribble(cx, cy, s, lt, alive, grey, a) {
    if (a <= 0) return;
    const bf = Math.floor(lt * 8);                                  // the hand redraws it 8 times a second
    const j = k => (PX.rand(bf + 17, k) - 0.5) * 2 * alive;          // this redraw's small differences (0 when it stops living)
    const col = (c, al = 1) => css(mixRGB(c, GRAY, grey), al);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.rotate(-0.06 + j(1) * 0.02);
    ctx.globalAlpha *= a;
    if (grey < 1) L.light(0, 0, 230, `rgba(255,160,90,${0.13 * (1 - grey)})`, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // crayon colouring behind the word: loose zigzags
    ctx.strokeStyle = col(CORAL, 0.2); ctx.lineWidth = 11;
    ctx.beginPath();
    for (let k = 0; k <= 11; k++) {
      const amp = 0.55 + 0.45 * Math.sin(k * 0.9 + 0.6);
      const x = -140 + k * 25 + (k % 2 ? 34 : 0) + j(10 + k) * 5, y = (k % 2 ? -58 : 52) * amp + j(30 + k) * 6;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    // two loops around it, never the same twice
    const loop = (turns, rx, ry, w, c, al, k0) => {
      ctx.strokeStyle = col(c, al); ctx.lineWidth = w; ctx.beginPath();
      const p1 = j(k0) * 1.5, p2 = j(k0 + 1) * 1.5, p3 = j(k0 + 2) * 1.5;
      for (let i = 0; i <= 140; i++) {
        const u = i / 140, an = -2.3 + u * TAU * turns + p3 * 0.05;
        const rad = 1 + 0.06 * Math.sin(u * TAU * 2 + p1) + 0.035 * Math.sin(u * TAU * 5 + p2) + 0.07 * u;
        const x = Math.cos(an) * rx * rad, y = Math.sin(an) * ry * rad + u * 10;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    loop(1.2, 180, 96, 3.4, FREE, 1, 40);
    loop(1.05, 168, 88, 2, GOLDC, 0.8, 50);
    // a little curl where the pen left the paper
    ctx.strokeStyle = col(FREE); ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i <= 36; i++) { const u = i / 36, an = u * TAU * 1.3 + 2.4; const r = 18 * (1 - u * 0.5); const x = 190 + u * 34 + Math.cos(an) * r + j(60) * 2, y = -40 - u * 30 + Math.sin(an) * r + j(61) * 2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    // the word, each character at its own slant, traced twice
    ctx.font = `400 132px ${F.hand}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['个', -56, 8, -0.1], ['性', 58, -4, 0.07]].forEach(([ch, x, y, r], i) => {
      ctx.save(); ctx.translate(x + j(70 + i) * 2.5, y + j(72 + i) * 2.5); ctx.rotate(r + j(74 + i) * 0.04);
      ctx.lineWidth = 2.4; ctx.strokeStyle = col(GOLDC); ctx.strokeText(ch, 5, -3);
      ctx.fillStyle = col(WARM); ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
    // small sparks of a child's drawing
    const SP = [[-215, -82, 1], [208, -100, 0.8], [236, 44, 0.6], [-190, 70, 0.5]];
    ctx.strokeStyle = col(GOLDC); ctx.lineWidth = 2.6;
    SP.forEach(([x, y, k], i) => {
      const r = 14 * k * (1 + 0.2 * j(80 + i)), xx = x + j(90 + i) * 2, yy = y + j(95 + i) * 2;
      ctx.beginPath(); ctx.moveTo(xx - r, yy); ctx.lineTo(xx + r, yy); ctx.moveTo(xx, yy - r); ctx.lineTo(xx, yy + r);
      ctx.moveTo(xx - r * 0.55, yy - r * 0.55); ctx.lineTo(xx + r * 0.55, yy + r * 0.55); ctx.stroke();
    });
    ctx.restore();
  }

  T.register('rules', {
    draw(ctx, V, lt, api) {
      const tr = ['r1', 'r2', 'r3'].map(n => at(api, n)), tS = at(api, 'score'), tE = at(api, 'end');
      const dim = 1 - 0.45 * ease.inOut(prog(lt, tE - 0.2, tE + 1.2));
      form(lt, api, V, dim);
      V.lines.rules.forEach((r, i) => ruleRow(i, r, lt, tr[i], dim));
      // row 4: an empty field (no rule, no instructions), waiting
      {
        const y = rowY(3), ka = ease.out(prog(lt, tr[2] + 0.8, tr[2] + 1.8));
        ctx.save(); ctx.globalAlpha *= dim * ka;
        text('04', FM.x0 + 40, y + 78, { size: 22, family: F.mono, color: C.faint });
        ctx.setLineDash([4, 8]); hline(FM.x0 + 100, FM.sx - 50, y + 130, 1, 'rgba(236,231,220,0.18)', 1); ctx.setLineDash([]);
        ctx.restore();
      }
      // the scribble tries to enter
      const p = prog(lt, tS, tS + 1.7);
      if (p > 0) {
        const grey = smooth(prog(lt, tS + 2.6, tS + 3.9)), alive = 1 - grey;
        const e = ease.inOut(p);
        const y4 = rowY(3) + 95;
        // from below the frame, bouncing up and in, three hops, the last one lands in the row
        const hop = Math.abs(Math.sin(e * Math.PI * 2.5)) * 70 * (1 - e);
        const x = lerp(860, 455, e), y = lerp(1700, y4, e) - hop;
        const s = lerp(0.95, 0.72, ease.inOut(p)) * lerp(1, 0.6, grey) * (1 + 0.04 * Math.sin(lt * 6) * alive * (1 - p));
        scribble(x, y + grey * 6, s, lt, alive, grey, ease.out(prog(lt, tS, tS + 0.3)) * lerp(1, 0.55, grey) * dim);
      }
      // the red pen: 0
      KIT.pen('score', (FM.sx + FM.x1) / 2 - 4, rowY(3) + 116, 70, ease.inOut(prog(lt, tS + 1.9, tS + 2.6)), { text: V.lines.zero, seed: 31, width: 5 });
      // the end
      KIT.caption(V.lines.end, prog(lt, tE + 0.3, tE + 3.6), { size: 42, hi: ['个性'], hiColor: C.warm, y: 1470 });
    },
    cues(V, api) {
      const out = [];
      ['r1', 'r2', 'r3'].forEach(n => { const t = at(api, n); out.push({ t: t + 0.2, type: 'tick' }, { t: t + 1.6, type: 'pen' }); });
      const tS = at(api, 'score');
      out.push({ t: tS, type: 'whoosh', dur: 1.7 }, { t: tS + 1.9, type: 'pen' }, { t: tS + 2.6, type: 'hush' });
      return out;
    },
  });
})();
