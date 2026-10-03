/* 一 打分的人走了 (e1): the reunion, the scorers, the title.
 * b04 reunion — a round reunion table seen from directly above, fine line art. 你 sits early at the near seat. 他
 *               arrives last at the far seat; every guest's soft light turns to him; his three stories rise from him
 *               like warm smoke; the table laughs in light. Your honours hover unseen behind you and fade. An empty
 *               speech bubble waits above 你; nobody asks; it dissolves.
 * b05 scorer  — a quiet classroom, frontal, line art. Each effort gets a red mark and a cold spotlight clicks on:
 *               你 becomes beautifully lit, #1 on the ranking. Then the camera pulls back: every beam is HELD — at the
 *               top of each stands a holder (老师 / 排名 / 奖状) with a lamp.
 * b06 leave   — (continues b05) the holders turn and walk away; the borrowed light slides off 你 and each lamp goes
 *               out; marks fade, the ranking empties. 你 is exactly as it was, only unlit. Darkness, then the title.
 *               The last lamp, far up, is still being carried away; at the very end it goes out too.
 * Every frame is closed-form in time. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const { C, beat } = KIT;
  const TAU = Math.PI * 2;
  const B = beat.BEAT;
  const at = (api, n) => KIT.at(api, n);
  const smooth = k => k * k * (3 - 2 * k);
  const ink = a => `rgba(236,231,220,${a})`;
  const WARM = KIT.L.warm, LAMP = KIT.L.lamp;

  /* PX blurs the glow only inside the bounding box of what was drawn; two invisible corner points make it the whole
     frame so no stale halo edges ever show. */
  const CX = new Float32Array([2, W - 3]), CY = new Float32Array([2, H - 3]);
  const fullFrame = () => PX.points(CX, CY, 2, [0, 0, 0], { a: 0.001, glow: 1 });

  // a caption that reveals at t0 and leaves before t1
  function cap(lines, lt, t0, t1, o = {}) {
    const ls = Array.isArray(lines) ? lines : [lines], n = ls.reduce((a, l) => a + [...l].length, 0);
    const k = prog(lt, t0 + 0.12, t0 + 0.12 + Math.min(2.4, 0.7 + n * 0.075));
    if (k <= 0) return;
    const out = t1 == null ? 0 : prog(lt, t1 - 0.6, t1 - 0.08);
    if (out >= 1) return;
    KIT.caption(ls, k, { ...o, out });
  }
  function veil(a) { if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  function softLight(x, y, r, rgbStr, a) {
    if (a <= 0.002) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= Math.min(1, a);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgbStr},1)`); g.addColorStop(0.35, `rgba(${rgbStr},0.35)`); g.addColorStop(1, `rgba(${rgbStr},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  // a glyph's particle cloud centred on (0, 0) (cached by PX)
  const cloud = (ch, size, step, seed = 3) => PX.text(ch, { size, family: F.serif, weight: 600, x: 0, y: size * 0.38, step, seed });
  function drawCloud(cl, x, y, col, a, o = {}) {
    const n = cl.n, out = PX.buf(n, o.tag || 300), t = o.t || 0, sh = o.shimmer == null ? 1.2 : o.shimmer, sc = o.scale || 1;
    for (let i = 0; i < n; i++) {
      const r1 = PX.rand(i, 41), r2 = PX.rand(i, 42);
      out.X[i] = x + cl.X[i] * sc + Math.sin(t * (1 + r1) + r2 * 30) * sh;
      out.Y[i] = y + cl.Y[i] * sc + Math.cos(t * (0.8 + r2) + r1 * 30) * sh;
    }
    PX.points(out.X, out.Y, n, col, { a, glow: o.glow == null ? 0.5 : o.glow });
  }

  // ================================================================================================ b04 reunion
  const TC = { x: 540, y: 900 }, RT = 282, RS = 392, NSEAT = 10;
  const seatA = j => Math.PI / 2 + j * TAU / NSEAT;                 // j = 0: 你 (near, bottom); j = 5: 他 (far, top)
  const seat = j => ({ x: TC.x + Math.cos(seatA(j)) * RS, y: TC.y + Math.sin(seatA(j)) * RS });
  const HIM = 5, GUESTS = [1, 2, 3, 4, 6, 7, 8, 9];
  const YOU4 = { x: 540, y: TC.y + RS + 10, size: 76 };
  const STORY_Y = [TC.y - 62, TC.y + 14, TC.y + 90];            // over the table, between everyone
  // where each guest looks before he arrives (chatting: a neighbour or the dishes)
  const IDLE = { 1: 2, 2: 1, 3: -1, 4: 6, 6: 4, 7: 8, 8: 7, 9: -1 };

  function tableArt(lt, kDraw, glowA) {
    ctx.save(); ctx.lineCap = 'round';
    // the table rim draws on from the near side, both ways round
    const kk = ease.inOut(kDraw);
    ctx.strokeStyle = ink(0.30); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(TC.x, TC.y, RT, Math.PI / 2 - Math.PI * kk, Math.PI / 2 + Math.PI * kk); ctx.stroke();
    ctx.strokeStyle = ink(0.12); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(TC.x, TC.y, RT - 9, Math.PI / 2 - Math.PI * kk, Math.PI / 2 + Math.PI * kk); ctx.stroke();
    // the turntable and the dishes
    const kd = ease.out(prog(kDraw, 0.35, 1));
    if (kd > 0) {
      ctx.globalAlpha *= kd;
      ctx.strokeStyle = ink(0.16); ctx.beginPath(); ctx.arc(TC.x, TC.y, 132, 0, TAU); ctx.stroke();
      const dishes = [[0, 0, 34], [74, -12, 25], [-60, -46, 27], [-32, 62, 23], [48, 60, 21], [12, -76, 22]];
      for (const [dx, dy, r] of dishes) {
        ctx.strokeStyle = ink(0.2); ctx.beginPath(); ctx.arc(TC.x + dx, TC.y + dy, r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = ink(0.09); ctx.beginPath(); ctx.arc(TC.x + dx, TC.y + dy, r * 0.62, 0, TAU); ctx.stroke();
      }
      // place settings: bowl, cup, chopsticks (also at the empty far seat, waiting for him)
      for (let j = 0; j < NSEAT; j++) {
        const a = seatA(j), ca = Math.cos(a), sa = Math.sin(a);
        const bx = TC.x + ca * (RT - 46), by = TC.y + sa * (RT - 46);
        ctx.strokeStyle = ink(0.2); ctx.beginPath(); ctx.arc(bx, by, 14, 0, TAU); ctx.stroke();
        ctx.strokeStyle = ink(0.1); ctx.beginPath(); ctx.arc(bx, by, 8, 0, TAU); ctx.stroke();
        const a2 = a + 0.16, cx = TC.x + Math.cos(a2) * (RT - 36), cy = TC.y + Math.sin(a2) * (RT - 36);
        ctx.strokeStyle = ink(0.18); ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.stroke();
        const a3 = a - 0.15, px = -Math.sin(a3), py = Math.cos(a3);
        ctx.strokeStyle = ink(0.26); ctx.lineWidth = 1.1;
        for (const o of [-2.6, 2.6]) {
          const r0 = RT - 76, r1 = RT - 16;
          ctx.beginPath(); ctx.moveTo(TC.x + Math.cos(a3) * r0 + px * o * 0.6, TC.y + Math.sin(a3) * r0 + py * o * 0.6);
          ctx.lineTo(TC.x + Math.cos(a3) * r1 + px * o, TC.y + Math.sin(a3) * r1 + py * o); ctx.stroke();
        }
        ctx.lineWidth = 1;
      }
    }
    ctx.restore();
  }
  // a soft wedge of attention from a head toward an angle
  function gaze(x, y, ang, len, half, a, col = '255,214,160') {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= Math.min(1, a);
    const g = ctx.createRadialGradient(x, y, 8, x, y, len);
    g.addColorStop(0, `rgba(${col},0.5)`); g.addColorStop(0.5, `rgba(${col},0.16)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, ang - half, ang + half); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // the empty speech bubble as fine particles along its outline (so it can dissolve), ordered from the tail round
  let BUB = null;
  function bubble() {
    if (BUB) return BUB;
    const cx = 540, cy = 1172, w = 212, h = 86, r = 42, xs = [], ys = [], step = 1.6;
    const pts = [];
    const line = (x0, y0, x1, y1) => { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / step); for (let i = 0; i < n; i++) pts.push([lerp(x0, x1, i / n), lerp(y0, y1, i / n)]); };
    const arc = (ax, ay, a0, a1) => { const n = Math.ceil(Math.abs(a1 - a0) * r / step); for (let i = 0; i < n; i++) { const a = lerp(a0, a1, i / n); pts.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]); } };
    const L0 = cx - w / 2, R0 = cx + w / 2, T0 = cy - h / 2, B0 = cy + h / 2;
    const tx = cx - 4;                                               // tail on the bottom edge, pointing down at 你
    line(tx + 14, B0, R0 - r, B0); arc(R0 - r, B0 - r, Math.PI / 2, 0); line(R0, B0 - r, R0, T0 + r); arc(R0 - r, T0 + r, 0, -Math.PI / 2);
    line(R0 - r, T0, L0 + r, T0); arc(L0 + r, T0 + r, -Math.PI / 2, -Math.PI); line(L0, T0 + r, L0, B0 - r); arc(L0 + r, B0 - r, Math.PI, Math.PI / 2);
    line(L0 + r, B0, tx - 10, B0); line(tx - 10, B0, tx - 2, B0 + 26); line(tx - 2, B0 + 26, tx + 14, B0);
    // start the draw from the tail
    const n = pts.length, s0 = pts.length - Math.ceil(16 / step) - Math.ceil(28 / step) * 2;
    const ord = pts.slice(s0).concat(pts.slice(0, s0));
    BUB = { X: Float32Array.from(ord, p => p[0]), Y: Float32Array.from(ord, p => p[1]), n };
    return BUB;
  }

  T.register('reunion', {
    draw(ctx, V, lt, api) {
      const Ln = V.lines;
      const tT = at(api, 'table'), tA = at(api, 'arrive'), tS = at(api, 'stories'), tW = at(api, 'wait'), tN = at(api, 'none'), end = api.dur;
      const t = lt;
      // --- his path: in from the top, down to the far seat
      const sHim = seat(HIM), walk = ease.out(prog(lt, tA + 0.1, tA + 2.6));
      const hx = sHim.x + Math.sin(lt * 5.2) * 3 * (1 - walk), hy = lerp(-90, sHim.y, walk);
      const himIn = lt >= tA;
      // attention: how much of the table's light is on him (0..1); stories make it glow more
      const att = ease.inOut(prog(lt, tA + 0.8, tA + 3.2));
      const laughT = [1.2, 2.9, 4.3, 5.7].map(d => tS + d);
      let laugh = 0; for (const lT of laughT) if (lt >= lT) laugh += Math.exp(-(lt - lT) * 1.8) * (1 - Math.exp(-(lt - lT) * 14));
      const storyOn = ease.inOut(prog(lt, tS, tS + 1.6));

      // --- table glow (warm, gathered toward him)
      softLight(TC.x, TC.y - 90, 360, '255,196,128', 0.05 + 0.06 * att + 0.06 * storyOn + 0.07 * laugh);
      if (himIn) softLight(hx, hy, 170, '255,200,140', (0.10 + 0.2 * att + 0.12 * laugh) * clamp(walk * 2));

      // --- line art
      tableArt(lt, prog(lt, tT + 0.1, tT + 2.4), 0);
      // the empty far chair (a small arc) until he sits
      const chairA = 1 - ease.out(prog(lt, tA + 2.0, tA + 2.8));
      if (chairA > 0) {
        ctx.save(); ctx.globalAlpha *= chairA * ease.out(prog(lt, tT + 1.2, tT + 2.4)); ctx.strokeStyle = ink(0.22); ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(sHim.x, sHim.y + 6, 30, -Math.PI + 0.5, -0.5); ctx.stroke(); ctx.restore();
      }
      // laughter: faint rings of light travelling out from him across the table
      for (const lT of laughT) {
        const k = prog(lt, lT, lT + 2.2); if (k <= 0 || k >= 1) continue;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= (1 - k) ** 2 * 0.2;
        ctx.strokeStyle = 'rgb(255,205,150)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(sHim.x, sHim.y, 40 + ease.out(k) * 380, 0, TAU); ctx.stroke(); ctx.restore();
      }

      // --- guests: shoulders (line), head (particles), gaze (soft wedge)
      GUESTS.forEach((j, gi) => {
        const s = seat(j), a = seatA(j), gd = Math.min(j, NSEAT - j) - 1, app = ease.out(prog(lt, tT + 0.4 + gd * 0.3, tT + 1.3 + gd * 0.3));
        if (app <= 0) return;
        ctx.save(); ctx.globalAlpha *= app; ctx.strokeStyle = ink(0.2); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, 34, 17, a + Math.PI / 2, 0, TAU); ctx.stroke(); ctx.restore();
        // where they look: idle → him (each turns at its own moment, a wave from the nearest)
        const idle = IDLE[j] < 0 ? Math.atan2(TC.y - s.y, TC.x - s.x) : Math.atan2(seat(IDLE[j]).y - s.y, seat(IDLE[j]).x - s.x);
        const sway = Math.sin(t * 0.7 + j * 1.7) * 0.18;
        const dHim = Math.hypot(sHim.x - s.x, sHim.y - s.y);
        const turn = ease.inOut(prog(lt, tA + 0.9 + (dHim / 700) * 1.2, tA + 1.9 + (dHim / 700) * 1.2));
        const toHim = Math.atan2(hy - s.y, hx - s.x);
        let d = toHim - (idle + sway); while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        const ang = idle + sway * (1 - turn) + d * turn;
        const ga = app * (0.10 + 0.10 * turn + 0.06 * storyOn + 0.08 * laugh);
        gaze(s.x, s.y, ang, 96 + 40 * turn, 0.36 - 0.1 * turn, ga);
      });

      PX.begin(); fullFrame();
      // heads
      const disc = PX.disc(80, 0, 0, 15), hb = PX.buf(80 * GUESTS.length, 310);
      let m = 0;
      GUESTS.forEach((j, gi) => {
        const s = seat(j), gd = Math.min(j, NSEAT - j) - 1, app = ease.out(prog(lt, tT + 0.4 + gd * 0.3, tT + 1.3 + gd * 0.3));
        for (let i = 0; i < 80; i++, m++) { hb.X[m] = s.x + disc.X[i] + Math.sin(t * 1.3 + i) * 0.4; hb.Y[m] = s.y + disc.Y[i]; hb.A[m] = app * (0.8 + 0.2 * PX.rand(i, 5)); }
      });
      PX.points(hb.X, hb.Y, m, [0.93, 0.88, 0.8], { a: 0.30 + 0.12 * laugh + 0.05 * storyOn, A: hb.A, glow: 0.35 });
      // 你: early, at the near seat, waiting (dim; nobody's light is on you)
      const dimmer = 1 - 0.25 * ease.inOut(prog(lt, tN, tN + 2.5));
      KIT.you(YOU4.x, YOU4.y, YOU4.size, { lit: 0.2, a: 0.95 * dimmer, t: lt, breathe: 0.35, tag: 4 });
      // 他: a warm glyph, brightening with everyone's attention
      if (himIn) drawCloud(cloud(Ln.him, 72, 1.5, 9), hx, hy, WARM, (0.12 + 0.07 * att + 0.04 * laugh) * clamp(walk * 3), { t: lt, tag: 320, glow: 0.45 });
      // his stories: warm smoke that rises from him toward us (growing as it rises) and settles over the table
      Ln.stories.forEach((str, i) => {
        const t0 = tS + 0.1 + i * 1.7; if (lt < t0) return;
        const S = PX.text(str, { size: 42, family: F.serif, weight: 400, x: 540, y: STORY_Y[i], step: 1.3, seed: 11 + i });
        const n = S.n, out = PX.buf(n, 330 + i), k = (lt - t0) / 1.5, cy = STORY_Y[i] - 16;
        const dis = prog(lt, tW - 0.3, tW + 2.0), drift = (lt - t0) * 2.2;
        const settled = smooth(prog(k, 0.85, 1.25));
        for (let p = 0; p < n; p++) {
          const r1 = PX.rand(p, 51 + i), r2 = PX.rand(p, 61 + i), r3 = PX.rand(p, 71 + i);
          const kk = smooth(clamp(k * 1.6 - r1 * 0.6)), sc = lerp(0.3, 1, kk);
          const sx = sHim.x + (r2 - 0.5) * 36, sy = sHim.y + 10 + (r3 - 0.5) * 30;
          const tx = 540 + (S.X[p] - 540) * sc, ty = cy + (S.Y[p] - cy) * sc;
          const curl = Math.sin(kk * Math.PI) * (30 + 46 * r3) * Math.sin(r2 * 9 + kk * 3);
          let x = lerp(sx, tx, kk) + curl, y = lerp(sy, ty, kk) - drift;
          let A = 1 - 0.8 * settled;
          // dissolve: the words come apart again and lift away like smoke leaving
          if (dis > 0) { const dd = ease.in(clamp(dis * 1.4 - r1 * 0.4)); x += Math.sin(r2 * 20 + lt * 0.7) * 50 * dd; y -= (50 + 130 * r3) * dd; A = (A + 0.8 * clamp(dis * 4)) * (1 - dd); }
          out.X[p] = x; out.Y[p] = y; out.A[p] = A;
        }
        PX.points(out.X, out.Y, n, WARM, { a: 0.2, A: out.A, glow: 0.6 });
      });
      // the empty speech bubble above 你: drawn on, waiting; then it comes apart
      const bk = ease.inOut(prog(lt, tW + 1.3, tW + 2.6));
      if (bk > 0) {
        const bb = bubble(), n = bb.n, out = PX.buf(n, 340), dz = prog(lt, tN + 0.5, tN + 3.4);
        const shown = Math.floor(n * bk);
        let q = 0;
        for (let p = 0; p < shown; p++) {
          const r1 = PX.rand(p, 81), r2 = PX.rand(p, 82);
          const dd = ease.out(clamp(dz * 1.6 - r1 * 0.6)), an = r2 * TAU;
          out.X[q] = bb.X[p] + Math.cos(an) * 46 * dd + Math.sin(lt * 0.8 + p) * 0.3;
          out.Y[q] = bb.Y[p] + Math.sin(an) * 30 * dd - 40 * dd * r1;
          out.A[q] = (1 - dd) * (0.85 + 0.15 * Math.sin(lt * 2 + p * 0.05)); q++;
        }
        const breath = 0.85 + 0.15 * Math.sin((lt - tW) * 2.2);
        PX.points(out.X, out.Y, q, [0.92, 0.9, 0.86], { a: 0.75 * breath, A: out.A, glow: 0.3 });
      }
      PX.flush({ exposure: 1.4, glow: 1 });

      // stories as crisp warm type once the smoke has settled
      Ln.stories.forEach((str, i) => {
        const t0 = tS + 0.1 + i * 1.7, k = prog(lt, t0 + 1.05, t0 + 1.7);
        if (k <= 0) return;
        const out = prog(lt, tW - 0.3, tW + 0.5), drift = (lt - t0) * 2.2;
        L.serif(str, 540, STORY_Y[i] - 16 - drift, { size: 42, color: C.warm, glow: 6, alpha: 0.92 * (1 - out) * k, reveal: 1, spacing: 0 });
      });
      // your honours: gold, faint, behind you; nobody looks; they fade
      const hon = Ln.honors, hA = [Math.PI / 2 + 0.5, Math.PI / 2, Math.PI / 2 - 0.5];
      hon.forEach((h, i) => {
        const a = ease.out(prog(lt, tT + 0.8 + i * 0.25, tT + 2.2 + i * 0.25)) * (1 - ease.inOut(prog(lt, tA + 1.5 + i * 1.6, tW - 1.2 + i * 0.4)));
        if (a <= 0) return;
        const r = 505 + (i === 1 ? 6 : 0), x = TC.x + Math.cos(hA[i]) * r, y = TC.y + Math.sin(hA[i]) * r + Math.sin(t * 0.6 + i * 2) * 4;
        L.serif(h, x, y, { size: 30, color: C.gold, glow: 6, alpha: 0.42 * a, spacing: 5 });
      });

      // the voice
      cap(Ln.wait, lt, tW + 0.2, tN);
      cap(Ln.none, lt, tN + 0.3, end + 1);
    },
    cues(V, api) {
      const t = n => at(api, n);
      return [
        { t: t('table'), type: 'title' },
        { t: t('stories') + 0.1, type: 'glow' }, { t: t('stories') + 1.8, type: 'glow' }, { t: t('stories') + 3.5, type: 'glow' },
        { t: t('none'), type: 'hush' },
      ];
    },
  });

  // ================================================================================================ b05 + b06: school
  // one continuous picture in "world" coordinates; a camera pulls back at 'held' to reveal who holds the lamps
  const YOU = { x: 540, y: 1010, size: 230 };
  const FLOOR = 1300, HOR = 700;
  const TARGET = { x: 540, y: 1296 };                                // where all beams land (the floor at your desk)
  // holders (left to right) and their lamps; which item each one scores
  const HOLD = [
    { name: 1, x: 150, y: -250, dir: -1 },     // 排名  (leaves left)
    { name: 0, x: 540, y: -330, dir: 0 },      // 老师  (recedes far up, carrying the last lamp)
    { name: 2, x: 930, y: -250, dir: 1 },      // 奖状  (leaves right, first)
  ];
  // papers: item index, world position, rotation; which holder scored it
  const PAPERS = [
    { i: 0, x: 196, y: 600, rot: -0.06, h: 1 },   // 作业 ✓    — 老师
    { i: 1, x: 392, y: 468, rot: 0.04, h: 0 },    // 考试 100  — 排名
    { i: 2, x: 688, y: 468, rot: -0.035, h: 2 },  // 竞赛 ○    — 奖状
    { i: 3, x: 884, y: 600, rot: 0.05, h: 0 },    // 排名 #1   — 排名
  ];
  const ON_ORDER = [1, 0, 2];                                        // beam that clicks on with mark 0, 1, 2

  // all the step times of the chain, in chain time (seconds since b05 began)
  function chainT(api) {
    const s = api.steps, o = s[0].lt, g = (name, nth = 0) => { const f = s.filter(x => x.show === name); return f[nth] ? f[nth].lt - o : 1e9; };
    return {
      o, school: g('school'), marks: g('marks'), seen: g('seen'), held: g('held'),
      go: g('go'), none: g('none'), title: g('title'), lamp: g('lamp'), held2: g('held', 1), end: api.chainEnd - o,
    };
  }
  const markT = (S, m) => S.marks + 0.25 + m * 2 * B;               // each red mark, 2 beats apart

  // the state of each holder/lamp at chain time ct
  function holderState(S, ct) {
    const leaveT = [S.go + 2.0, S.go + 4.0, S.go + 0.25];          // turn times: 奖状 first, then 排名, then 老师
    return HOLD.map((h, hi) => {
      const onT = markT(S, ON_ORDER.indexOf(hi)) + 0.7;
      let on = ease.out(prog(ct, onT, onT + 0.18));
      on *= 1 + 0.16 * ease.inOut(prog(ct, markT(S, 3) + 0.7, markT(S, 3) + 1.6));      // the #1 brightens them all
      const t0 = leaveT[hi], turn = ease.inOut(prog(ct, t0, t0 + 0.7));
      let dx = 0, dy = 0, sc = 1, bob = 0, beam = 1, lampOn = 1;
      if (h.dir) {                                                   // walk out of frame sideways, then the lamp goes out
        const w = prog(ct, t0 + 0.55, t0 + 3.4);
        dx = h.dir * 1050 * Math.pow(w, 1.35);
        bob = -Math.abs(Math.sin(w * Math.PI * 5)) * 10 * clamp(w * 8);
        lampOn = 1 - prog(ct, t0 + 2.0, t0 + 2.08);
      } else {                                                       // recede: up and far away, still lit
        const w = Math.max(0, ct - (t0 + 0.6));
        sc = 0.24 + 0.76 * Math.exp(-w / 2.6);
        dy = -(1 - sc) * 300 - w * 5; dx = w * 7;
        bob = -Math.abs(Math.sin(w * 2.6)) * 6 * sc;
        beam = 1 - ease.inOut(prog(ct, t0 + 0.8, t0 + 3.6));
        lampOn = 1 - prog(ct, S.end - 0.75, S.end - 0.67);          // the last lamp goes out at the very end
      }
      return { h, hi, on, turn, dx, dy: dy + bob, sc, beam, lampOn, t0 };
    });
  }
  // a cone of cold light from a lamp to a pool
  function beam(lx, ly, px, py, w, a) {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= Math.min(1.2, a);
    const g = ctx.createLinearGradient(lx, ly, px, py);
    g.addColorStop(0, 'rgba(223,232,255,0.22)'); g.addColorStop(0.18, 'rgba(223,232,255,0.11)'); g.addColorStop(0.7, 'rgba(223,232,255,0.06)'); g.addColorStop(0.93, 'rgba(223,232,255,0.05)'); g.addColorStop(1, 'rgba(223,232,255,0.0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(lx - 10, ly); ctx.lineTo(lx + 10, ly); ctx.lineTo(px + w, py); ctx.lineTo(px - w, py); ctx.closePath(); ctx.fill();
    const p = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 1.35); p.addColorStop(0, 'rgba(223,232,255,0.22)'); p.addColorStop(0.5, 'rgba(223,232,255,0.08)'); p.addColorStop(1, 'rgba(223,232,255,0)');
    ctx.fillStyle = p; ctx.translate(px, py - 6); ctx.scale(1, 0.22); ctx.beginPath(); ctx.arc(0, 0, w * 1.35, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // a school desk, frontal, line art; s = perspective scale
  function desk(x, fy, s, a) {
    if (a <= 0.003) return;
    const w = 250 * s, top = fy - 196 * s, front = fy - 182 * s, pan = fy - 128 * s;
    ctx.save(); ctx.strokeStyle = ink(a); ctx.lineWidth = Math.max(0.8, 1.4 * s); ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.46, top); ctx.lineTo(x + w * 0.46, top); ctx.lineTo(x + w / 2, front); ctx.lineTo(x - w / 2, front); ctx.closePath();
    ctx.moveTo(x - w / 2, front); ctx.lineTo(x - w / 2, pan); ctx.lineTo(x + w / 2, pan); ctx.lineTo(x + w / 2, front);
    ctx.moveTo(x - w * 0.44, pan); ctx.lineTo(x - w * 0.44, fy); ctx.moveTo(x + w * 0.44, pan); ctx.lineTo(x + w * 0.44, fy);
    ctx.stroke(); ctx.restore();
  }
  function classroom(k, light, ct) {
    // floor perspective lines (very faint), then desks: your row and the rows behind
    ctx.save(); ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      const x1 = 540 + i * 380, kk = ease.out(clamp(k * 1.6 - Math.abs(i) * 0.08));
      if (kk <= 0) continue;
      const g = ctx.createLinearGradient(0, FLOOR - 20, 0, 2400); g.addColorStop(0, ink(0)); g.addColorStop(0.25, ink(0.06 + 0.04 * light)); g.addColorStop(1, ink(0.03));
      const f0 = (FLOOR - HOR) / (2600 - HOR);
      ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(lerp(540, x1 * 1.0 + (x1 - 540) * 0.0, f0), FLOOR); ctx.lineTo(lerp(540, x1, Math.max(f0, kk)), lerp(HOR, 2600, Math.max(f0, kk))); ctx.stroke();
    }
    ctx.restore();
    const rows = [3.0, 2.1, 1.45, 1];
    rows.forEach((d, ri) => {
      const s = 1 / d, fy = HOR + (FLOOR - HOR) * s;
      for (const X of [-1, 0, 1]) {
        if (X === 0 && d > 1) continue;
        const x = 540 + X * 345 * s;
        const kk = ease.out(clamp(k * 2.2 - ri * 0.25 - (X === 0 ? 0 : 0.15)));
        const near = X === 0 && d === 1;
        const a = kk * (near ? 0.26 + 0.24 * light : (0.08 + 0.06 * light) * (0.5 + 0.5 * s));
        desk(x, fy, s, a);
      }
    });
  }
  // one paper: an effort of yours, with its label and a few written lines
  function paper(P, label, a, o) {
    if (a <= 0.003) return;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.rot); ctx.globalAlpha *= a;
    const w = 172, h = 214;
    ctx.fillStyle = 'rgba(236,231,220,0.025)'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = ink(0.30); ctx.lineWidth = 1.3; ctx.strokeRect(-w / 2, -h / 2, w, h);
    text(label, -w / 2 + 20, -h / 2 + 44, { size: 28, family: F.serif, weight: 600, color: C.ink, alpha: 0.82, spacing: 4 });
    ctx.strokeStyle = ink(0.12); ctx.lineWidth = 1;
    if (P.i === 3) {                                                 // the ranking: 1 你 / 2 / 3 / 4
      const empty = o.empty || 0;
      for (let r = 0; r < 4; r++) {
        const y = -h / 2 + 92 + r * 34;
        text(String(r + 1), -w / 2 + 22, y + 9, { size: 22, family: F.mono, color: r === 0 && o.you > 0 ? C.gold : C.dim, alpha: (r === 0 ? 1 : 0.7) * (1 - empty * (r ? 0.4 : 0)) });
        if (r === 0 && o.you > 0) text('你', -w / 2 + 58, y + 10, { size: 26, family: F.serif, weight: 600, color: C.gold, alpha: o.you * (1 - empty) });
        ctx.beginPath(); ctx.moveTo(-w / 2 + (r === 0 && o.you > 0 ? 96 : 52), y + 4); ctx.lineTo(w / 2 - 22, y + 4); ctx.globalAlpha *= 1; ctx.stroke();
      }
    } else if (P.i === 2) {                                          // a small medal
      ctx.strokeStyle = ink(0.24); ctx.beginPath(); ctx.arc(0, 26, 24, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, 4); ctx.lineTo(-20, -30); ctx.moveTo(12, 4); ctx.lineTo(20, -30); ctx.stroke();
      ctx.strokeStyle = ink(0.12); ctx.beginPath(); ctx.arc(0, 26, 15, 0, TAU); ctx.stroke();
    } else {
      for (let r = 0; r < 5; r++) { const y = -h / 2 + 80 + r * 26, len = [118, 126, 96, 120, 70][r]; ctx.beginPath(); ctx.moveTo(-w / 2 + 20, y); ctx.lineTo(-w / 2 + 20 + len, y); ctx.stroke(); }
    }
    ctx.restore();
  }
  function paperMark(P, k, fade) {
    if (k <= 0 || fade >= 1) return;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.rot); ctx.globalAlpha *= 1 - fade;
    if (P.i === 0) KIT.pen('check', 26, 34, 92, k, { seed: 3 });
    else if (P.i === 1) KIT.pen('score', 8, 60, 70, k, { text: '100', seed: 4 });
    else if (P.i === 2) KIT.pen('circle', 0, 24, 104, k, { seed: 6 });
    else KIT.pen('circle', -40, -14, 112, k, { seed: 7, width: 3 });
    ctx.restore();
  }
  // a holder: the name as a standing vertical glyph column, a pole, and the lamp below it
  function holder(name, lx, ly, sc, turn, lampOn, a, ct) {
    if (a <= 0.003) return;
    const sx = Math.abs(Math.cos(turn * Math.PI)) * sc, back = turn > 0.5;
    ctx.save(); ctx.globalAlpha *= a;
    // lamp shade + bulb
    ctx.save(); ctx.translate(lx, ly); ctx.scale(sc, sc);
    ctx.strokeStyle = 'rgba(223,232,255,0.55)'; ctx.lineWidth = 1.6;
    ctx.fillStyle = 'rgba(10,12,18,0.9)';
    ctx.beginPath(); ctx.moveTo(-13, -34); ctx.lineTo(13, -34); ctx.lineTo(36, 0); ctx.lineTo(-36, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -70); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI); ctx.stroke();               // the pole up to the hand
    ctx.restore();
    // the holder
    ctx.save(); ctx.translate(lx, ly - 70 * sc); ctx.scale(sx, sc);
    const chars = [...name];
    chars.forEach((ch, i) => text(ch, 0, -20 - (chars.length - 1 - i) * 92, { size: 84, family: F.serif, weight: 600, color: back ? '#9aa6bb' : '#d6deee', align: 'center', alpha: back ? 0.55 : 0.85 }));
    ctx.restore();
    ctx.restore();
  }

  function drawSchool(V, ct, S, api) {
    const lines5 = linesOf('scorer'), lines6 = linesOf('leave');
    const HS = holderState(S, ct);
    // camera: pulls back at 'held' (and creeps in a touch during the title)
    const zk = ease.inOut(prog(ct, S.held + 0.2, S.held + 3.6));
    const z = lerp(1, 0.55, zk) + 0.035 * ease.inOut(prog(ct, S.title, S.end));
    const Ys = lerp(YOU.y, 1196, zk);
    // how much light is in the room, and on you
    let light = 0, lit = 0.06;
    for (const s of HS) {
      const pdx = s.dx, cover = Math.exp(-((pdx / 260) ** 2)) * s.beam;
      light += s.on * s.lampOn * (0.5 + 0.5 * cover) / 3; lit += s.on * s.lampOn * cover * 0.32;
    }
    lit = clamp(lit);
    // darkness deepens as the lamps go
    const dark = ease.inOut(prog(ct, S.go, S.go + 6.2));
    veil(0.25 + 0.35 * dark);

    ctx.save(); ctx.translate(540, Ys); ctx.scale(z, z); ctx.translate(-YOU.x, -YOU.y);
    // beams first (behind the line art), then the room
    for (const s of HS) {
      if (s.on <= 0) continue;
      const lx = s.h.x + s.dx, ly = s.h.y + s.dy;
      const px = TARGET.x + s.dx, py = s.h.dir ? TARGET.y + s.dy * 0.2 : lerp(ly, TARGET.y + s.dy, s.sc);
      beam(lx, ly + 2, px, py, 210 * (s.h.dir ? 1 : s.sc), s.on * s.lampOn * s.beam);
      // the bulb glows (seen once the camera pulls back)
      softLight(lx, ly, 70 * Math.max(0.75, s.sc), '223,232,255', 0.5 * s.on * s.lampOn);
    }
    ctx.save(); ctx.globalAlpha *= 1 - 0.5 * ease.inOut(prog(ct, S.go + 4, S.title + 1));
    classroom(prog(ct, S.school + 0.05, S.school + 2.6), light, ct);
    ctx.restore();
    // papers and their marks
    PAPERS.forEach((P, pi) => {
      const tm = markT(S, pi), app = ease.out(prog(ct, tm - 0.7, tm - 0.1));
      const hs = HS[P.h], leaveK = ease.inOut(prog(ct, hs.t0 + 0.6, hs.t0 + 2.2));
      const pa = app * (1 - 0.55 * dark) * (1 - ease.inOut(prog(ct, S.go + 5.5, S.title + 0.5)));
      const youK = P.i === 3 ? ease.out(prog(ct, tm + 0.35, tm + 0.9)) : 0;
      paper(P, lines5.items[P.i], pa, { you: youK, empty: P.i === 3 ? leaveK : 0 });
      paperMark(P, prog(ct, tm, tm + 0.7), leaveK);
    });
    // holders and lamps (offstage above the frame until the camera pulls back)
    for (const s of HS) {
      const lx = s.h.x + s.dx, ly = s.h.y + s.dy;
      holder(lines5.holders[s.h.name], lx, ly, s.sc, s.turn, s.lampOn, clamp(s.on * 1.5) * (s.h.dir ? 1 : 1), ct);
    }

    ctx.restore();
    // particles are splatted in screen space: map them through the camera by hand
    const cx = x => 540 + (x - YOU.x) * z, cy = y => Ys + (y - YOU.y) * z;
    PX.begin(); fullFrame();
    // dust in the beams
    for (const s of HS) {
      const a = s.on * s.lampOn * s.beam; if (a <= 0.01) continue;
      const lx = s.h.x + s.dx, ly = s.h.y + s.dy, px = TARGET.x + s.dx, py = s.h.dir ? TARGET.y : lerp(ly, TARGET.y + s.dy, s.sc);
      const n = 260, out = PX.buf(n, 360 + s.hi);
      for (let i = 0; i < n; i++) {
        const v = (PX.rand(i, 91 + s.hi) + ct * 0.012 * (0.4 + PX.rand(i, 92))) % 1, u = PX.rand(i, 93 + s.hi) * 2 - 1;
        const half = lerp(10, 210, v) * 0.85;
        out.X[i] = cx(lerp(lx, px, v) + u * half + Math.sin(ct * 0.6 + i) * 3); out.Y[i] = cy(lerp(ly, py, v)); out.A[i] = 0.25 + 0.75 * PX.rand(i, 94);
      }
      PX.points(out.X, out.Y, n, LAMP, { a: 0.42 * a, A: out.A, glow: 0.2 });
      // the bulb itself
      PX.dot(cx(lx), cy(ly + 2), LAMP, 1.6 * s.on * s.lampOn, 1);
    }
    // the far lamp after it stops lighting you: a small point, still burning, carried away
    // 你: exactly the same shape, same place; only the borrowed light changes
    KIT.you(cx(YOU.x), cy(YOU.y), YOU.size, { lit, a: 1, t: ct, breathe: 0.35, tag: 5, scale: z });
    PX.flush({ exposure: 1.4, glow: 1 });

    return { lines5, lines6, lit, dark };
  }
  const linesOf = type => { const b = T.TL.beats.find(b => b.visual.type === type); return b ? b.visual.lines : {}; };

  function captionsSchool(ct, S) {
    const l5 = linesOf('scorer'), l6 = linesOf('leave');
    cap(l5.school, ct, S.school + 0.3, S.marks + 0.2);
    cap(l5.seen, ct, S.seen + 0.1, S.held + 1.6);
    cap(l6.none, ct, S.none + 0.1, S.title - 0.2);
    // the title: mid-frame, larger, slow
    const tk = prog(ct, S.title + 0.35, S.title + 2.7), tout = prog(ct, S.lamp - 0.2, S.lamp + 0.9);
    if (tk > 0 && tout < 1) KIT.caption(l6.title, tk, { at: 'mid', y: 880, size: 70, gap: 112, out: tout, hi: ['打分的人走了'], hiColor: '#e3b2aa', color: '#e6e0d4', glow: 4 });
    cap(l6.lamp, ct, S.lamp + 0.5, S.held2);
    cap(l6.held, ct, S.held2 + 0.2, S.end + 1);
  }

  function schoolCues(api) {
    const S = chainT(api), out = [];
    const c = (t, type, o = {}) => out.push({ t: t + S.o, type, ...o });
    for (let m = 0; m < 4; m++) {
      c(markT(S, m), 'pen', { i: m });
      if (m < 3) c(markT(S, m) + 0.7, 'click', { i: m });
      else c(markT(S, m) + 0.7, 'glow');
    }
    c(S.held + 0.2, 'swell', { dur: 3.4 });
    c(S.go + 0.25 + 2.0, 'off'); c(S.go + 2.0 + 2.0, 'off');
    c(S.title - 0.45, 'hush'); c(S.title, 'title');
    c(S.lamp, 'swell', { dur: 8 });
    c(S.end - 0.75, 'off', { soft: true });
    return out;
  }

  T.register('scorer', {
    draw(ctx, V, lt, api) {
      const S = chainT(api), ct = lt - S.o;
      drawSchool(V, ct, S, api);
      captionsSchool(ct, S);
    },
    cues(V, api) { return schoolCues(api); },
  });
  T.register('leave', {
    draw(ctx, V, lt, api) {
      const S = chainT(api), ct = lt - S.o;
      drawSchool(V, ct, S, api);
      captionsSchool(ct, S);
    },
    cues(V, api) { return schoolCues(api); },
  });
})();
