/* sims1.js — v2 (silent mode) simulations, part 1. Every frame is a pure function of lt; the simulations are
 * precomputed once per parameter set (deterministic K.rng) and then read by "time → round".
 *
 *   sim_levels     {phase:'mirror'|'levels', levels?:3, you?:'你', them?:'他'}
 *                  mirror: two glowing players (你 gold, 他 teal), dashed arrows flowing both ways, and above each a
 *                  chain of thought bubbles nested one inside the next (他 → 你 → 他 …), identical on both sides.
 *                  levels: concentric "thinking" rings grow around both players in lock-step, numbered 1..levels,
 *                  with a big layer counter under each and "=" between.
 *   sim_prisoners  {pairs?:100, counts?:[bothSilent, oneEach, bothConfess], labels?:['默','招'], seed?,
 *                   outcomes?:['都沉默','一招一默','都招供'], steps:[{show:'choose'} {show:'tally'}]}
 *                  grid of pairs (甲 gold left, 乙 teal right) that flip from dots to 默/招 in a slow wave while live
 *                  counters roll; tally lights every "both confess" cell in ember and blows its counter up.
 *   sim_rps        {phase:'habit'|'mixed', habit?:15, mixed?:39, watch?:3, names?:['石','剪','布'], seed?}
 *                  repeated rock-paper-scissors against an opponent who counters your most frequent throw.
 *                  Round tiles (you on top, opponent below, border = result), a big win-rate readout, the win-rate
 *                  curve (draw = half) and your throw distribution (what the opponent reads).
 *                  habit: you always throw 石, the opponent sees through it after `watch` rounds, curve falls (red).
 *                  mixed: opens on habit's final state, you switch to uniform random, curve settles at ~50% (ok),
 *                  distribution ends at 1/3 · 1/3 · 1/3.
 */
(function () {
  const { P, F, clamp, lerp, prog, ease, text, measure, rng } = K;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers
  const ep = (t, a, d = 0.6, e = ease.out) => e(prog(t, a, a + d));
  const bump = (t, a, d) => { const k = prog(t, a, a + d); return k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0; };
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  function alpha(ctx, a, fn) { if (a <= 0.002) return; ctx.save(); ctx.globalAlpha *= Math.min(1, a); fn(); ctx.restore(); }
  function fillRR(ctx, x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
  function strokeRR(ctx, x, y, w, h, r, color, lw = 2) { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke(); }
  function bez(a, c, b, n = 36) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return o; }
  /** stroke the first fraction p of a polyline, returns end point + heading */
  function poly(ctx, pts, p) {
    const seg = []; let L = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
    let rem = L * clamp(p); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    let end = pts[0], ang = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = seg[i - 1], a = pts[i - 1], b = pts[i];
      ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (rem >= d) { ctx.lineTo(b[0], b[1]); rem -= d; end = b; }
      else { const k = d ? rem / d : 0; end = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; ctx.lineTo(end[0], end[1]); break; }
    }
    ctx.stroke(); return { x: end[0], y: end[1], ang };
  }
  /** multi-colour text on one baseline: segs [{t, color, weight?}] */
  function rich(segs, x, y, o = {}) {
    let cx = x;
    for (const s of segs) { const oo = { ...o, weight: s.weight || o.weight }; text(s.t, cx, y, { ...oo, color: s.color }); cx += measure(s.t, oo); }
    return cx - x;
  }
  function head(ctx, x, y, ang, s, color) {
    ctx.save(); ctx.setLineDash([]); ctx.fillStyle = color; ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-s, -s * 0.55); ctx.lineTo(-s * 0.7, 0); ctx.lineTo(-s, s * 0.55); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function halo(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, 0.2 * a)); g.addColorStop(0.55, rgba(color, 0.07 * a)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  /** a player: a big glowing character inside a soft breathing halo */
  function player(ctx, ch, x, y, size, color, a, lt, ph = 0) {
    if (a <= 0) return;
    const br = 1 + 0.035 * Math.sin(lt * 1.1 + ph);
    alpha(ctx, a, () => {
      halo(ctx, x, y, size * 1.25 * br, color, 1);
      text(ch, x, y + size * 0.04, { size, family: F.serif, weight: 600, color, align: 'center', baseline: 'middle', glow: 26 });
    });
  }
  const scaleT = (api, ref) => clamp(api.dur / ref, 0.75, 1.6);

  // ================================================================ sim_levels
  // left side coordinates; the right side is the mirror image x → 1920 - x
  const LVM = { px: 560, py: 640, size: 150,
    chain: [{ x: 700, y: 404, r: 92, fs: 84 }, { x: 826, y: 262, r: 52, fs: 44 }, { x: 904, y: 188, r: 28, fs: 24 }] };
  const mx = (x, s) => (s > 0 ? x : 1920 - x);

  function drawMirror(ctx, V, lt, api) {
    const k = scaleT(api, 5.9), you = V.you || '你', them = V.them || '他';
    const aP = ep(lt, 0, 0.7);
    const sides = [{ s: 1, me: you, other: them, cm: P.gold, co: P.teal }, { s: -1, me: them, other: you, cm: P.teal, co: P.gold }];
    // flowing dashed arrows: 你 → 他 above (gold), 他 → 你 below (teal)
    const arrows = [
      { pts: bez([662, 596], [960, 500], [1258, 596]), c: P.gold, t: 0.55 * k },
      { pts: bez([1258, 700], [960, 796], [662, 700]), c: P.teal, t: 0.95 * k },
    ];
    for (const A of arrows) {
      const p = ease.inOut(prog(lt, A.t, A.t + 1.0 * k)); if (p <= 0) continue;
      ctx.save(); ctx.strokeStyle = rgba(A.c, 0.75); ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.setLineDash([14, 13]); ctx.lineDashOffset = -lt * 16;
      const e = poly(ctx, A.pts, p); ctx.restore();
      alpha(ctx, clamp(p * 3), () => head(ctx, e.x, e.y, e.ang, 18, rgba(A.c, 0.9)));
    }
    // players
    for (const S of sides) player(ctx, S.me, mx(LVM.px, S.s), LVM.py, LVM.size, S.cm, aP, lt, S.s > 0 ? 0 : 1.7);
    // nested thought bubbles, both sides in lock-step
    const tL = [1.55, 2.45, 3.25].map(v => v * k);
    for (const S of sides) {
      let from = { x: mx(LVM.px + 52, S.s), y: LVM.py - 92, r: 0 };
      LVM.chain.forEach((B, i) => {
        const a = ep(lt, tL[i], 0.7); if (a <= 0) return;
        const bx = mx(B.x, S.s), by = B.y, ch = i % 2 === 0 ? S.other : S.me, col = i % 2 === 0 ? S.co : S.cm;
        const grow = 0.75 + 0.25 * ease.outBack(prog(lt, tL[i], tL[i] + 0.7));
        // trailing dots from the previous thinker to this bubble
        const dx = bx - from.x, dy = by - from.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
        const sx = from.x + ux * from.r, sy = from.y + uy * from.r, ex = bx - ux * B.r * grow, ey = by - uy * B.r * grow;
        const nd = i === 0 ? 3 : 2;
        for (let j = 0; j < nd; j++) {
          const f = (j + 1) / (nd + 1), da = ep(lt, tL[i] - 0.35 + j * 0.12, 0.4);
          K.dot(lerp(sx, ex, f), lerp(sy, ey, f), Math.max(2.5, B.r * (0.06 + 0.04 * f)), rgba(col, 0.7), { alpha: da });
        }
        const br = 1 + 0.025 * Math.sin(lt * 1.3 + i + (S.s > 0 ? 0 : 1.7));
        alpha(ctx, a, () => {
          ctx.save(); ctx.fillStyle = 'rgba(14,18,26,0.92)'; ctx.beginPath(); ctx.arc(bx, by, B.r * grow * br, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = i === 0 ? 2.5 : 2; ctx.stroke(); ctx.restore();
          halo(ctx, bx, by + B.fs * 0.02, B.r * 0.9, col, 0.8);
          text(ch, bx, by + B.fs * 0.04, { size: B.fs * grow, family: F.serif, weight: 600, color: col, align: 'center', baseline: 'middle', glow: 12 });
        });
        from = { x: bx, y: by, r: B.r };
      });
    }
    // … the regress keeps going: two faint dots meeting in the middle
    const ad = ep(lt, 3.9 * k, 0.8);
    if (ad > 0) for (const s of [1, -1]) for (let j = 0; j < 3; j++) K.dot(mx(934 + j * 9, s), 170 - j * 5, 3 - j * 0.6, P.dim, { alpha: ad * (1 - j * 0.25) });
  }

  const LVL = { px: 560, py: 470, size: 128, r0: 118, dr: 50 };
  function drawLevels(ctx, V, lt, api) {
    const n = Math.max(1, V.levels || 3), you = V.you || '你', them = V.them || '他';
    const k = scaleT(api, 4.7), t0 = 0.45 * k, sp = Math.min(1.05 * k, (api.dur * 0.62 - t0) / Math.max(1, n - 1));
    const tk = i => t0 + i * sp;                          // level i+1 appears
    const aP = ep(lt, 0, 0.6);
    const sides = [{ s: 1, me: you, other: them, cm: P.gold, co: P.teal }, { s: -1, me: them, other: you, cm: P.teal, co: P.gold }];
    let cur = 0; for (let i = 0; i < n; i++) if (lt >= tk(i) + 0.25) cur = i + 1;
    for (const S of sides) {
      const x = mx(LVL.px, S.s), y = LVL.py;
      for (let i = 0; i < n; i++) {
        const p = ep(lt, tk(i), 0.8); if (p <= 0) continue;
        const r = LVL.r0 + i * LVL.dr, rr = r - 18 * (1 - p), fl = bump(lt, tk(i), 0.9);
        alpha(ctx, p, () => {
          ctx.save(); ctx.strokeStyle = rgba(S.cm, 0.62 - i * 0.12 + 0.3 * fl); ctx.lineWidth = 2.5 + 1.5 * fl;
          ctx.setLineDash([10, 9]); ctx.lineDashOffset = S.s * lt * 5;
          ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke(); ctx.restore();
          // the character this layer imagines: 他 → 你 → 他 … on the outer side of the ring
          const oc = i % 2 === 0 ? S.co : S.cm, och = i % 2 === 0 ? S.other : S.me;
          const ox2 = x - S.s * Math.cos(0.52) * rr, oy2 = y + Math.sin(0.52) * rr;
          K.dot(ox2, oy2, 20, P.bg);
          text(och, ox2, oy2 + 1,{ size: 28, family: F.serif, weight: 600, color: oc, align: 'center', baseline: 'middle' });
          // number badge on top
          const bx = x, by = y - rr;
          K.dot(bx, by, 19, P.bg); K.ring(bx, by, 19, rgba(S.cm, 0.8), { lineWidth: 2 });
          text(String(i + 1), bx, by + 1, { size: 24, family: F.mono, weight: 700, color: S.cm, align: 'center', baseline: 'middle' });
        });
      }
      player(ctx, S.me, x, y, LVL.size, S.cm, aP, lt, S.s > 0 ? 0 : 1.7);
      // big layer counter
      alpha(ctx, ep(lt, t0, 0.6), () => {
        const b = cur > 0 ? bump(lt, tk(cur - 1) + 0.25, 0.5) : 0, cy = 812;
        const num = String(cur), nw = measure(num, { size: 96, family: F.mono, weight: 700 });
        ctx.save(); ctx.translate(x, cy); ctx.scale(1 + 0.1 * b, 1 + 0.1 * b);
        text('第', -nw / 2 - 12, 0, { size: 40, weight: 500, color: P.dim, align: 'right' });
        text(num, 0, 0, { size: 96, family: F.mono, weight: 700, color: S.cm, align: 'center', glow: 10 + 14 * b });
        text('层', nw / 2 + 12, 0, { size: 40, weight: 500, color: P.dim, align: 'left' });
        ctx.restore();
      });
    }
    // "=" between the two counters, pulsing each time both sides step up together
    alpha(ctx, ep(lt, t0, 0.6), () => {
      let pulse = 0; for (let i = 0; i < n; i++) pulse = Math.max(pulse, bump(lt, tk(i) + 0.2, 0.8));
      text('=', 960, 780, { size: 88, family: F.mono, weight: 700, color: pulse > 0.02 ? P.ember : P.ink, alpha: 0.7 + 0.3 * pulse, align: 'center', baseline: 'middle', glow: 20 * pulse });
    });
  }

  T.register('sim_levels', {
    draw(ctx, V, lt, api) { (V.phase === 'levels' ? drawLevels : drawMirror)(ctx, V, lt, api); },
    cues(V, api) {
      if (V.phase === 'levels') {
        const n = Math.max(1, V.levels || 3), k = scaleT(api, 4.7), t0 = 0.45 * k, sp = Math.min(1.05 * k, (api.dur * 0.62 - t0) / Math.max(1, n - 1));
        return Array.from({ length: n }, (_, i) => ({ t: t0 + i * sp + 0.1, type: 'pop' }));
      }
      const k = scaleT(api, 5.9);
      return [{ t: 0.1, type: 'tick' }, { t: 0.55 * k, type: 'swish' }, { t: 0.95 * k, type: 'swish' },
        ...[1.55, 2.45, 3.25].map(v => ({ t: v * k + 0.1, type: 'tick' }))];
    },
  });

  // ================================================================ sim_prisoners
  const PRC = new Map();
  function prisonersModel(V) {
    const n = V.pairs || 100, key = JSON.stringify([n, V.counts, V.seed]);
    if (PRC.has(key)) return PRC.get(key);
    let c = V.counts;
    if (!c) { const a = Math.max(1, Math.round(n * 0.01)), b = Math.round(n * 0.08); c = [a, b, n - a - b]; }
    const r = rng(V.seed || 2024), out = [];
    c.forEach((m, o) => { for (let i = 0; i < m; i++) out.push(o); });
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    const cols = n <= 100 ? 10 : Math.ceil(Math.sqrt(n * 1.3)), rows = Math.ceil(out.length / cols);
    const pairs = out.map((o, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const ch = o === 0 ? [0, 0] : o === 2 ? [1, 1] : (r() < 0.5 ? [0, 1] : [1, 0]);   // 0 = silent, 1 = confess
      const d = 0.55 * r() + 0.45 * (col + row) / Math.max(1, cols + rows - 2);
      return { o, ch, row, col, d, ph: r() * TAU };
    });
    const m = { n: out.length, counts: c, pairs, cols, rows };
    PRC.set(key, m); return m;
  }
  function prisonersTimes(V, api) {
    const S = api.steps, ic = api.find(s => s.show === 'choose'), it = api.find(s => s.show === 'tally');
    const tc = ic >= 0 ? S[ic].lt : 0.4;
    const tt = it >= 0 ? S[it].lt : (api.line(1) ? api.line(1).start : api.dur * 0.5);
    const f0 = tc + 0.35, span = Math.max(1.2, Math.min(3.2, tt - 0.35 - f0));
    return { tc, tt, f0, span };
  }
  T.register('sim_prisoners', {
    draw(ctx, V, lt, api) {
      const M = prisonersModel(V), { tc, tt, f0, span } = prisonersTimes(V, api);
      const lab = V.labels || ['默', '招'], names = V.outcomes || ['都沉默', '一招一默', '都招供'];
      // ---- grid of pairs
      const gx = 188, gy = 216, pw = 86, ph = 64, cw = 74, chh = 52;
      const ga = ep(lt, tc - 0.4, 0.7), tp = ep(lt, tt, 0.9, ease.inOut);
      alpha(ctx, ga, () => {
        rich([{ t: '每一格 = 一对囚徒：左 ', color: P.dim }, { t: V.rowPlayer || '甲', color: P.gold, weight: 700 }, { t: '  右 ', color: P.dim }, { t: V.colPlayer || '乙', color: P.teal, weight: 700 }], gx, 178, { size: 26, weight: 500 });
      });
      const counts = [0, 0, 0]; let chosen = 0;
      for (const p of M.pairs) {
        const x = gx + p.col * pw, y = gy + p.row * ph, cx = x + cw / 2, cy = y + chh / 2;
        const tf = f0 + p.d * span, f = ep(lt, tf, 0.55);
        if (f > 0.5) { counts[p.o]++; chosen++; }
        const hit = p.o === 2, dimK = hit ? 1 : 1 - 0.62 * tp;
        alpha(ctx, ga * dimK, () => {
          fillRR(ctx, x, y, cw, chh, 9, hit && tp > 0 ? rgba(P.ember, 0.05 + 0.13 * tp) : 'rgba(233,228,216,0.035)');
          if (hit && tp > 0) strokeRR(ctx, x, y, cw, chh, 9, rgba(P.ember, 0.38 * tp), 1.5);
          for (let s = 0; s < 2; s++) {
            const sx = cx + (s ? 17 : -17), col = s ? P.teal : P.gold;
            if (f < 1) K.dot(sx, cy, 4 + 1.2 * Math.sin(lt * 1.2 + p.ph + s), rgba(col, 0.55), { alpha: 1 - f });
            if (f > 0) {
              const sc = 0.7 + 0.3 * f, silent = p.ch[s] === 0;
              alpha(ctx, f, () => {
                ctx.save(); ctx.translate(sx, cy + 1); ctx.scale(sc, sc);
                text(lab[p.ch[s]], 0, 0, { size: 30, weight: silent ? 700 : 500, color: col, align: 'center', baseline: 'middle', glow: silent ? 12 : 0 });
                ctx.restore();
              });
            }
          }
        });
      }
      // ---- counters
      const rx = 1170, rr = 1760, ca = ep(lt, tc, 0.7);
      const rowsY = [300, 450, 640], big = ease.inOut(prog(lt, tt, tt + 1.1));
      const glyphs = [[0, 0], [1, 0], [1, 1]], barC = [P.ok, P.dim, P.ember];
      alpha(ctx, ca, () => {
        for (let o = 0; o < 3; o++) {
          const y = rowsY[o], isHit = o === 2, a = isHit ? 1 : 1 - 0.45 * big;
          alpha(ctx, a, () => {
            text(lab[glyphs[o][0]], rx, y, { size: 38, weight: 700, color: P.gold });
            text(lab[glyphs[o][1]], rx + 42, y, { size: 38, weight: 700, color: P.teal });
            text(names[o], rx + 110, y, { size: isHit ? lerp(34, 40, big) : 34, weight: isHit ? 700 : 500, color: isHit ? (big > 0.5 ? P.ember : P.ink) : P.ink });
            const fs = isHit ? lerp(76, 150, big) : 76;
            text(String(counts[o]), rr, y + (isHit ? 8 * big : 0), { size: fs, family: F.mono, weight: 700, align: 'right', color: isHit ? P.ember : o === 0 ? P.ok : P.ink, glow: isHit ? 24 * big : 0 });
            // bar
            const by = y + (isHit ? lerp(26, 44, big) : 26), bw = (rr - rx) * counts[o] / M.n;
            fillRR(ctx, rx, by, rr - rx, 8, 4, 'rgba(233,228,216,0.08)');
            if (bw > 0) fillRR(ctx, rx, by, Math.max(8, bw), 8, 4, rgba(barC[o], isHit ? 0.9 : 0.75));
          });
        }
        // progress: how many pairs have chosen
        const fin = ep(lt, tt + 0.6, 0.8);
        text(`已做出选择  ${chosen} / ${M.n}`, rx, 790, { size: 28, family: F.sans, weight: 500, color: P.dim, alpha: 1 - fin });
        alpha(ctx, fin, () => {
          const people = 2 * M.n, conf = M.pairs.reduce((a, p) => a + p.ch[0] + p.ch[1], 0);
          const w1 = rich([{ t: `${people} 人里，`, color: P.dim }], rx, 796, { size: 30, weight: 500 });
          const w2 = rich([{ t: String(conf), color: P.ember }], rx + w1 + 4, 800, { size: 56, family: F.mono, weight: 700 });
          rich([{ t: ` 人选了「${lab[1]}」`, color: P.ink }], rx + w1 + w2 + 8, 796, { size: 30, weight: 500 });
        });
      });
    },
    cues(V, api) {
      const { tc, tt, f0, span } = prisonersTimes(V, api);
      return [{ t: tc, type: 'tick' }, { t: f0, type: 'count', dur: span + 0.5 }, { t: tt + 0.2, type: 'tally' }, { t: tt + 0.9, type: 'pop' }];
    },
  });

  // ================================================================ sim_rps
  // 0 石 rock, 1 剪 scissors, 2 布 paper. a beats b ⇔ (b - a + 3) % 3 === 1; counter(x) = (x + 2) % 3
  const res = (a, b) => (a === b ? 0 : (b - a + 3) % 3 === 1 ? 1 : -1);
  const counter = x => (x + 2) % 3;
  const RPC = new Map();
  function rpsModel(V) {
    const H = V.habit || 15, Mn = V.mixed || 39, W = V.watch == null ? 3 : V.watch, WIN = V.window || 4, key = JSON.stringify([H, Mn, W, WIN, V.seed, V.first]);
    if (RPC.has(key)) return RPC.get(key);
    const rounds = [];
    // habit: you always throw rock; the opponent plays some opening throws, then counters your most frequent throw
    const first = V.first || [1, 2, 0];
    for (let i = 0; i < H; i++) { const opp = i < W ? first[i % first.length] : counter(0); rounds.push({ you: 0, opp, r: res(0, opp), ph: 0 }); }
    // mixed: a shuffled balanced sequence (exactly 1/3 each by the end); the opponent keeps countering your most
    // frequent throw of the last WIN rounds. Pick the first seed whose running win rate settles near 50% (deterministic).
    let best = null;
    for (let s = (V.seed || 1); s < (V.seed || 1) + 600 && !best; s++) {
      const r = rng(s * 7919 + 13), seq = [];
      for (let i = 0; i < Mn; i++) seq.push(i % 3);
      for (let i = seq.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [seq[i], seq[j]] = [seq[j], seq[i]]; }
      const out = []; let sc = 0, ok = true;
      for (let i = 0; i < Mn; i++) {
        const cnt = [0, 0, 0]; for (let j = Math.max(0, i - WIN); j < i; j++) cnt[seq[j]]++;   // your last WIN throws
        const mxv = Math.max(...cnt), lead = [0, 1, 2].filter(k => cnt[k] === mxv);
        const guess = lead[Math.floor(r() * lead.length)], opp = counter(guess);
        const rr = res(seq[i], opp); sc += rr > 0 ? 1 : rr === 0 ? 0.5 : 0;
        const rate = sc / (i + 1);
        if (i === 0 && rr !== 0) ok = false;
        if (i >= 1 && Math.abs(rate - 0.5) > 0.26) ok = false;
        if (i >= 6 && Math.abs(rate - 0.5) > 0.15) ok = false;
        if (i >= 18 && Math.abs(rate - 0.5) > 0.07) ok = false;
        out.push({ you: seq[i], opp, r: rr, ph: 1 });
      }
      if (ok && Math.abs(sc / Mn - 0.5) <= 0.02) best = out;
      if (s === (V.seed || 1) + 599 && !best) best = out;
    }
    rounds.push(...best);
    // running stats per phase: rate after round i, distribution of your throws after round i
    const stat = [];
    let sc = 0, n = 0, cnt = [0, 0, 0], ph = 0;
    rounds.forEach((R, i) => {
      if (R.ph !== ph) { ph = R.ph; sc = 0; n = 0; cnt = [0, 0, 0]; }
      sc += R.r > 0 ? 1 : R.r === 0 ? 0.5 : 0; n++; cnt[R.you]++;
      stat.push({ rate: sc / n, dist: cnt.map(c => c / n) });
    });
    const m = { H, M: Mn, W, rounds, stat };
    RPC.set(key, m); return m;
  }
  /** local time at which each round lands in this beat (habit rounds are long done in the mixed beat) */
  function rpsTimes(V, api, m) {
    if (V.phase === 'mixed') {
      const t0 = 1.3, sp = clamp((0.78 * api.dur - t0) / m.M, 0.12, 0.32);
      return { ts: m.rounds.map((R, i) => (R.ph === 0 ? -100 + i * 0.01 : t0 + (i - m.H) * sp)), sw: 0.55, end: t0 + m.M * sp };
    }
    const k = scaleT(api, 6.15), w0 = 0.6 * k, wsp = 0.62 * k, t1 = w0 + m.W * wsp + 0.1;
    const sp = clamp((0.84 * api.dur - t1) / Math.max(1, m.H - m.W - 1), 0.14, 0.45);
    return { ts: m.rounds.map((R, i) => (R.ph === 1 ? 1e9 : i < m.W ? w0 + i * wsp : t1 + (i - m.W) * sp)), sw: 1e9, seen: t1 - 0.15, end: t1 + (m.H - m.W - 1) * sp };
  }
  // layout
  const RG = { x0: 190, y0: 214, px: 68, py: 82, tw: 58, th: 72, gap: 34, cols: 10 };
  const RC = { x0: 1010, x1: 1760, y0: 392, y1: 612 };
  T.register('sim_rps', {
    draw(ctx, V, lt, api) {
      const m = rpsModel(V), { ts, sw, seen, end } = rpsTimes(V, api, m), mixed = V.phase === 'mixed';
      const names = V.names || ['石', '剪', '布'], N = m.rounds.length;
      const aIn = mixed ? 1 : ep(lt, 0, 0.6);
      const swp = mixed ? ep(lt, sw, 0.8, ease.inOut) : 0;          // switch to random
      // how far the simulation has run: last landed round and its landing progress
      let last = -1; for (let i = 0; i < N; i++) if (lt >= ts[i]) last = i;
      const land = i => ep(lt, ts[i], 0.35);
      const hRow = Math.ceil(m.H / RG.cols);
      const tilePos = i => {
        const ph = m.rounds[i].ph, j = ph ? i - m.H : i, row = Math.floor(j / RG.cols) + (ph ? hRow : 0);
        return [RG.x0 + (j % RG.cols) * RG.px, RG.y0 + row * RG.py + (ph ? RG.gap : 0)];
      };
      // ---- legend
      alpha(ctx, aIn, () => {
        let x = RG.x0; const o = { size: 26, weight: 500 };
        text('上', x, 180, { ...o, color: P.dim }); x += measure('上 ', o);
        text(V.you || '你', x, 180, { ...o, weight: 700, color: P.gold }); x += measure((V.you || '你') + '   ', o);
        text('下', x, 180, { ...o, color: P.dim }); x += measure('下 ', o);
        text(V.them || '对手', x, 180, { ...o, weight: 700, color: P.teal });
      });
      // ---- round tiles
      for (let i = 0; i <= last; i++) {
        const R = m.rounds[i], a = land(i), [x, y] = tilePos(i);
        const dimK = R.ph === 0 ? 1 - 0.55 * swp : 1;
        const rc = R.r > 0 ? P.ok : R.r < 0 ? P.red : null;
        alpha(ctx, a * aIn * dimK, () => {
          fillRR(ctx, x, y + (1 - a) * 10, RG.tw, RG.th, 8, R.r < 0 ? rgba(P.red, 0.1) : R.r > 0 ? rgba(P.ok, 0.1) : 'rgba(233,228,216,0.04)');
          strokeRR(ctx, x, y + (1 - a) * 10, RG.tw, RG.th, 8, rc ? rgba(rc, 0.7) : 'rgba(233,228,216,0.2)', 2);
          text(names[R.you], x + RG.tw / 2, y + 22 + (1 - a) * 10, { size: 28, weight: 700, color: P.gold, align: 'center', baseline: 'middle' });
          text(names[R.opp], x + RG.tw / 2, y + 52 + (1 - a) * 10, { size: 28, weight: 700, color: P.teal, align: 'center', baseline: 'middle' });
        });
      }
      // divider between the habit rows and the random rows
      if (mixed) alpha(ctx, ep(lt, sw + 0.2, 0.7), () => {
        const y = RG.y0 + hRow * RG.py + RG.gap / 2 - 7;
        ctx.save(); ctx.strokeStyle = rgba(P.ok, 0.55); ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(RG.x0 + 150, y); ctx.lineTo(RG.x0 + RG.cols * RG.px - 10, y); ctx.stroke(); ctx.restore();
        text(V.switchLabel || '改成随机', RG.x0, y, { size: 26, weight: 700, color: P.ok, baseline: 'middle' });
      });
      // ---- the two strategies, spelled out under the habit rows (they give way to the random rows)
      const noteA = (mixed ? 1 - ep(lt, sw, 0.6) : ep(lt, 0.5, 0.7)) * aIn;
      alpha(ctx, noteA, () => {
        const y = RG.y0 + hRow * RG.py + 62;
        rich([{ t: `${V.you || '你'}：`, color: P.gold, weight: 700 }, { t: V.habitNote || `总出「${names[0]}」`, color: P.ink, weight: 500 }], RG.x0, y, { size: 40 });
        rich([{ t: `${V.them || '对手'}：`, color: P.teal, weight: 700 }, { t: V.oppNote || `先看 ${m.W} 局，再专出克制你的那一手`, color: P.dim, weight: 500 }], RG.x0, y + 58, { size: 30 });
      });
      if (mixed) alpha(ctx, ep(lt, ts[N - 1] + 0.3, 0.8), () => {
        const y = RG.y0 + (hRow + Math.ceil(m.M / RG.cols)) * RG.py + RG.gap + 56;
        rich([{ t: `${V.you || '你'}：`, color: P.gold, weight: 700 }, { t: V.mixedNote || '每局随机出，谁也猜不到', color: P.ok, weight: 500 }], RG.x0, y, { size: 34 });
      });
      // ---- win-rate readout
      const rateAt = i => m.stat[i].rate;
      const curPh = mixed && lt >= ts[m.H] ? 1 : 0;
      const li = last, showR = li >= 0 && (curPh === 0 || m.rounds[li].ph === 1);
      const rate = showR ? rateAt(li) : null;
      const settled = mixed ? ep(lt, end + 0.2, 0.8) : 0;
      const rcol = rate == null ? P.dim : curPh === 0 ? (rate < 0.35 ? P.red : P.ink) : (Math.abs(rate - 0.5) < 0.08 ? P.ok : P.ink);
      alpha(ctx, aIn, () => {
        text(V.rateLabel || '你的胜率', RC.x0, 206, { size: 30, weight: 500, color: P.dim });
        text('平局记半', RC.x0 + measure(V.rateLabel || '你的胜率', { size: 30, weight: 500 }) + 18, 206, { size: 24, weight: 400, color: P.dim, alpha: 0.8 });
        const numA = mixed ? 1 - bump(lt, sw, 0.9) * 0.8 : 1;
        const bb = last >= 0 ? bump(lt, ts[last], 0.3) : 0;
        text(rate == null ? '—' : `${Math.round(rate * 100)}%`, RC.x0, 330, { size: 112, family: F.mono, weight: 700, color: rcol, alpha: numA, glow: 8 + 10 * bb + 16 * settled });
        const rn = last >= 0 ? (curPh ? last - m.H + 1 : last + 1) : 0;
        text(rn ? `第 ${rn} 局` : '', RC.x1, 330, { size: 40, family: F.sans, weight: 500, color: P.ink, align: 'right', alpha: 0.85 });
      });
      // ---- curve
      alpha(ctx, aIn, () => {
        const X = i => RC.x0 + (i + 0.5) / N * (RC.x1 - RC.x0), Y = v => RC.y1 - v * (RC.y1 - RC.y0);
        ctx.save(); ctx.strokeStyle = 'rgba(233,228,216,0.14)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(RC.x0, RC.y1); ctx.lineTo(RC.x1, RC.y1); ctx.moveTo(RC.x0, RC.y0); ctx.lineTo(RC.x1, RC.y0); ctx.stroke();
        ctx.strokeStyle = 'rgba(233,228,216,0.4)'; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(RC.x0, Y(0.5)); ctx.lineTo(RC.x1, Y(0.5)); ctx.stroke(); ctx.restore();
        [[1, '100%'], [0.5, '50%'], [0, '0%']].forEach(([v, s]) => text(s, RC.x0 - 14, Y(v), { size: 24, family: F.mono, color: P.dim, align: 'right', baseline: 'middle' }));
        if (mixed) alpha(ctx, ep(lt, sw + 0.2, 0.7), () => {
          const xd = (X(m.H - 1) + X(m.H)) / 2;
          ctx.save(); ctx.strokeStyle = rgba(P.ok, 0.5); ctx.lineWidth = 2; ctx.setLineDash([5, 7]);
          ctx.beginPath(); ctx.moveTo(xd, RC.y0 - 8); ctx.lineTo(xd, RC.y1 + 8); ctx.stroke(); ctx.restore();
        });
        // each phase is its own running average
        for (const ph of [0, 1]) {
          const i0 = ph ? m.H : 0, i1 = ph ? N - 1 : m.H - 1;
          if (last < i0) continue;
          const col = ph ? P.ok : P.red, fade = ph === 0 ? 1 - 0.5 * swp : 1;
          const pts = [];
          for (let i = i0; i <= Math.min(last, i1); i++) {
            const a = land(i);
            if (i === i0 || a >= 1) pts.push([X(i), Y(rateAt(i))]);
            else { const pv = rateAt(i - 1); pts.push([lerp(X(i - 1), X(i), a), Y(lerp(pv, rateAt(i), a))]); }
          }
          alpha(ctx, fade * land(i0), () => {
            ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.shadowColor = col; ctx.shadowBlur = 10;
            ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.restore();
            const e = pts[pts.length - 1]; K.dot(e[0], e[1], 7, col, { glow: 16 });
          });
        }
      });
      // ---- your throw distribution: what the opponent reads
      const dy0 = 690, dys = 52;
      alpha(ctx, aIn, () => {
        text(V.readLabel || '对手盯着的：你的出拳比例', RC.x0, dy0, { size: 26, weight: 500, color: P.dim });
        // current distribution (tweened between rounds)
        let dist = [0, 0, 0];
        if (last >= 0) {
          const i = last, cur = m.stat[i].dist, a = land(i);
          const prev = i > 0 && m.rounds[i - 1].ph === m.rounds[i].ph ? m.stat[i - 1].dist : (m.rounds[i].ph ? m.stat[m.H - 1].dist : [0, 0, 0]);
          dist = cur.map((v, k) => lerp(prev[k], v, a));
        }
        if (mixed && last < m.H + 0) dist = m.stat[m.H - 1].dist;
        const bx0 = RC.x0 + 48, bx1 = RC.x1 - 110;
        for (let k = 0; k < 3; k++) {
          const y = dy0 + 50 + k * dys;
          text(names[k], RC.x0, y, { size: 30, weight: 700, color: P.gold, baseline: 'middle' });
          fillRR(ctx, bx0, y - 7, bx1 - bx0, 14, 7, 'rgba(233,228,216,0.08)');
          const w = (bx1 - bx0) * dist[k];
          if (w > 0.5) fillRR(ctx, bx0, y - 7, Math.max(14, w), 14, 7, rgba(P.gold, 0.8));
          const third = settled;
          text(`${Math.round(dist[k] * 100)}%`, RC.x1, y, { size: 30, family: F.mono, weight: 700, color: P.ink, align: 'right', baseline: 'middle', alpha: 1 - third });
          text('1/3', RC.x1, y, { size: 34, family: F.mono, weight: 700, color: P.ok, align: 'right', baseline: 'middle', alpha: third, glow: 10 * third });
        }
        // what the opponent does with it
        if (!mixed) {
          const a = ep(lt, seen, 0.6);
          alpha(ctx, a, () => {
            const w = measure(V.readLabel || '对手盯着的：你的出拳比例', { size: 26, weight: 500 });
            text(V.seenLabel || `→ 看穿了，专出「${names[counter(0)]}」`, RC.x0 + w + 16, dy0, { size: 26, weight: 700, color: P.teal });
          });
        } else {
          const a = ep(lt, ts[m.H] + 1.0, 0.7);
          alpha(ctx, a, () => {
            const w = measure(V.readLabel || '对手盯着的：你的出拳比例', { size: 26, weight: 500 });
            text(V.blindLabel || '→ 怎么针对都没用', RC.x0 + w + 16, dy0, { size: 26, weight: 700, color: P.ok });
          });
        }
      });
    },
    cues(V, api) {
      const m = rpsModel(V), { ts, sw, seen, end } = rpsTimes(V, api, m), out = [];
      if (V.phase === 'mixed') {
        out.push({ t: sw, type: 'swish' });
        out.push({ t: ts[m.H], type: 'count', dur: end - ts[m.H] });
        out.push({ t: end + 0.25, type: 'chime' });
      } else {
        for (let i = 0; i < m.W; i++) out.push({ t: ts[i], type: 'click' });
        out.push({ t: seen, type: 'thud' });
        out.push({ t: ts[m.W], type: 'count', dur: end - ts[m.W] });
      }
      return out.filter(c => c.t >= 0);
    },
  });
})();
