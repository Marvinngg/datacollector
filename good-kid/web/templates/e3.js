/* 三 你羡慕的 (e3)
 * b10 honest  — the motorbike from the feed, larger, alone, parked by the sea: fine line art drawn on stroke by stroke,
 *               warm wind drifting past it. "如果明天真给你一辆机车，你会骑吗？" — "大概不会。" — the wind takes the bike
 *               apart from the front, piece by piece, its lines loosening into warm motes that drift downwind and hang.
 *               "那你到底在羡慕什么？" over the hanging warmth.
 * b11 freedom — the hanging warmth (the bike's motes, the wind, sparks rising from an unseen campfire) condenses into
 *               「不在乎」, a word that burns quietly like a flame. Its three objects appear beneath and are struck through
 *               calmly (a fine ink stroke; each strike feeds the flame). A red 「批准」 seal descends slowly above the word
 *               and never lands. Then the whole flame lifts: thousands of motes stream upward, part around the seal,
 *               write 「不需要被批准的自由」 above it, and fly on out of the frame. The seal sways in their wake and is
 *               left hanging in an empty frame. "你真正缺的，从来不是一辆机车。"
 * One material runs through both beats: the bike's motes + the wind are functions of absolute time, so b10's last
 * frame and b11's first frame are the same picture. Every frame is closed-form in time. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng } = K;
  const { C, beat } = KIT;
  const TAU = Math.PI * 2;
  const smooth = k => k * k * (3 - 2 * k);
  const at = (api, n) => KIT.at(api, n);
  const R = (i, k) => PX.rand(i, k);
  const FREE = KIT.L.free, WARM = KIT.L.warm, INK = [0.93, 0.9, 0.84];
  const CXF = new Float32Array([2, W - 3]), CYF = new Float32Array([2, H - 3]);
  const fullFrame = () => PX.points(CXF, CYF, 2, [0, 0, 0], { a: 0.001, glow: 1 });
  /* motion blur: each particle is splatted as a short tapered streak from where it was dt ago to where it is now,
     light conserved (a still particle is one point; a fast one a dim line). One PX.points call. */
  const SBN = 1 << 19, SB = { X: new Float32Array(SBN), Y: new Float32Array(SBN), A: new Float32Array(SBN), C: new Float32Array(SBN * 3) };
  function streaks(n, X0, Y0, X1, Y1, A, CC, o) {
    let k = 0;
    for (let j = 0; j < n && k < SBN - 16; j++) {
      const a = A[j]; if (a <= 0.003) continue;
      const dx = X0[j] - X1[j], dy = Y0[j] - Y1[j], d = Math.abs(dx) + Math.abs(dy);
      const m = d < 1.6 ? 1 : Math.min(16, Math.ceil(d / 1.7)), nrm = m === 1 ? 1 : 1 / (m * 0.7);
      const cr = CC ? CC[j * 3] : 0, cg = CC ? CC[j * 3 + 1] : 0, cb = CC ? CC[j * 3 + 2] : 0;
      for (let q = 0; q < m; q++) {
        const f = m === 1 ? 0 : q / (m - 1);
        SB.X[k] = X0[j] - dx * f; SB.Y[k] = Y0[j] - dy * f; SB.A[k] = a * nrm * (1 - 0.6 * f);
        if (CC) { SB.C[k * 3] = cr; SB.C[k * 3 + 1] = cg; SB.C[k * 3 + 2] = cb; }
        k++;
      }
    }
    PX.points(SB.X, SB.Y, k, o.col || null, { ...o, A: SB.A, C: CC ? SB.C : undefined });
  }

  // a calm caption: reveal after t0, leave before t1
  function cap(lines, lt, t0, t1, o = {}) {
    const n = [lines].flat().join('').length, d = o.delay == null ? 0.3 : o.delay;
    const k = prog(lt, t0 + d, t0 + d + Math.min(2.0, 0.5 + n * 0.075));
    if (k <= 0) return;
    KIT.caption(lines, k, { ...o, out: t1 == null ? 0 : prog(lt, t1 - 0.55, t1) });
  }

  // ================================================================ the motorbike (line art)
  /* Local coordinates: facing right, ground at y = 0, wheel centres at x = ±310. Placed on screen by BIKE. */
  const BIKE = { x: 548, y: 1130, s: 0.93 };
  const ZOOM = { cx: 540, cy: 880, z1: 1.045 };                 // the slow push-in during 'bike' + 'q'
  const STY = { m: [1.9, 0.9], d: [1.25, 0.55], f: [1.0, 0.32] };  // main / detail / faint: [width, alpha]

  function arc(cx, cy, r, a0 = 0, a1 = TAU, ry = r, rot = 0) {
    const n = Math.max(10, Math.ceil(Math.abs(a1 - a0) * Math.max(r, ry) / 3)), o = [], cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n), x = Math.cos(a) * r, y = Math.sin(a) * ry; o.push([cx + x * cr - y * sr, cy + x * sr + y * cr]); }
    return o;
  }
  function spline(p, closed = false) {                          // Catmull-Rom through the points
    const o = [], n = p.length, g = i => closed ? p[(i + n) % n] : p[clamp(i, 0, n - 1)];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), m = 14;
      for (let k = 0; k < m; k++) {
        const t = k / m, t2 = t * t, t3 = t2 * t;
        o.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    o.push(closed ? p[0] : p[n - 1]); return o;
  }
  const seg = (x0, y0, x1, y1) => [[x0, y0], [x1, y1]];
  function resample(pts, step) {                                // even spacing along the polyline
    const o = [pts[0]]; let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 1e-6) continue;
      let s = step - carry;
      while (s <= d) { o.push([lerp(a[0], b[0], s / d), lerp(a[1], b[1], s / d)]); s += step; }
      carry = d - (s - step);
    }
    const last = pts[pts.length - 1], l = o[o.length - 1]; if (Math.hypot(last[0] - l[0], last[1] - l[1]) > step * 0.3) o.push(last);
    return o;
  }

  let BK = null;
  function bike() {
    if (BK) return BK;
    const S = [];
    const add = (pts, st = 'm') => S.push({ raw: pts, st });
    const RW = [-310, -150], FW = [310, -150];
    // wheels
    for (const [wx, wy] of [RW, FW]) {
      add(arc(wx, wy, 150, -Math.PI / 2, TAU - Math.PI / 2));
      add(arc(wx, wy, 129, -Math.PI / 2, TAU - Math.PI / 2), 'd');
      add(arc(wx, wy, 119, -Math.PI / 2, TAU - Math.PI / 2), 'f');
      add(arc(wx, wy, 19), 'd');
      for (let k = 0; k < 18; k++) {                              // tangential wire spokes
        const a = k / 18 * TAU, s = k % 2 ? 1 : -1;
        add(seg(wx + Math.cos(a) * 17, wy + Math.sin(a) * 17, wx + Math.cos(a + s * 0.42) * 118, wy + Math.sin(a + s * 0.42) * 118), 'f');
      }
    }
    add(arc(FW[0], FW[1], 62), 'd');                               // front disc
    add(arc(FW[0], FW[1], 62, -2.5, -1.4, 72), 'd');               // caliper
    add(arc(RW[0], RW[1], 52), 'f');                               // rear sprocket
    add(seg(RW[0] + 4, RW[1] - 52, -75, -213), 'f');               // chain
    add(seg(RW[0] + 4, RW[1] + 52, -75, -177), 'f');
    // fenders
    add(arc(FW[0], FW[1], 166, -2.75, -0.62));
    add(arc(RW[0], RW[1], 166, -2.9, -1.95), 'd');
    // fork (two stanchions, fatter lower legs, the clamp)
    const head = [214, -468], ax = FW, dx = head[0] - ax[0], dy = head[1] - ax[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    for (const s of [-1, 1]) add(seg(ax[0] + nx * 10 * s + ux * 120, ax[1] + ny * 10 * s + uy * 120, head[0] + nx * 10 * s, head[1] + ny * 10 * s));
    for (const s of [-1, 1]) add(seg(ax[0] + nx * 14 * s + ux * 6, ax[1] + ny * 14 * s + uy * 6, ax[0] + nx * 14 * s + ux * 126, ax[1] + ny * 14 * s + uy * 126));
    add(seg(head[0] - nx * 24 - ux * 34, head[1] - ny * 24 - uy * 34, head[0] + nx * 24 - ux * 34, head[1] + ny * 24 - uy * 34), 'd');
    // headlight: a round bucket, its rim and lens; a small bracket to the fork
    add(arc(266, -448, 40));
    add(arc(301, -448, 9, -Math.PI / 2, Math.PI / 2, 38), 'd');
    add(arc(266, -448, 29, -1.1, 1.1), 'f');
    add(seg(226, -440, 238, -444), 'd');
    // handlebar (a gentle bend back), grip, lever; a small round mirror
    add(spline([[212, -478], [204, -506], [176, -524], [124, -534]]));
    add(seg(124, -534, 86, -537));
    add(seg(124, -528, 88, -530), 'd');
    add(spline([[184, -520], [156, -515], [128, -512]]), 'f');
    add(spline([[178, -522], [182, -556], [188, -578]]), 'd');
    add(arc(191, -592, 15, 0, TAU, 12, 0.15), 'd');
    // fuel tank (teardrop) with a badge, knee recess and a highlight
    add(spline([[-40, -452], [-10, -490], [58, -512], [140, -506], [196, -478], [204, -460], [186, -436], [104, -424], [14, -426], [-40, -452]]));
    add(arc(96, -467, 26, 0, TAU, 11, -0.06), 'f');
    add(spline([[-14, -472], [56, -496], [150, -492]]), 'f');
    add(spline([[2, -436], [20, -455], [56, -458]]), 'f');
    add(arc(210, -470, 8), 'f');                                     // filler cap / steering head nut
    // seat with a cafe-racer hump, tail light
    add(spline([[-42, -454], [-120, -449], [-230, -447], [-300, -452], [-332, -470], [-360, -462], [-374, -436]]));
    add(spline([[-374, -436], [-300, -424], [-160, -425], [-42, -430]]), 'd');
    add(arc(-383, -433, 7), 'd');
    // a helmet resting on the seat (waiting for a rider)
    add(spline([[-252, -452], [-256, -498], [-228, -542], [-178, -556], [-134, -532], [-118, -490], [-122, -452]]));
    add(seg(-252, -452, -122, -452), 'd');
    add(spline([[-160, -462], [-160, -496], [-146, -522], [-126, -526]]), 'd');   // visor opening
    add(spline([[-238, -515], [-206, -537], [-172, -541]]), 'f');
    // frame: steering head -> down tube -> cradle -> seat post; subframe; swingarm; shock
    add(spline([[200, -436], [162, -344], [128, -260], [104, -190], [70, -152], [-50, -146], [-118, -160], [-138, -230], [-148, -330], [-158, -430]]));
    add(seg(-148, -330, -330, -432), 'd');
    add(seg(-138, -246, -310, -162));
    add(seg(-138, -222, -310, -140));
    add(arc(-138, -234, 12), 'd');
    add(seg(-270, -176, -296, -432), 'd');
    { const z = []; for (let k = 0; k <= 26; k++) { const t = k / 26, x = lerp(-274, -292, t), y = lerp(-212, -396, t); z.push([x + (k % 2 ? 10 : -10), y]); } add(z, 'f'); }
    // engine: a compact crankcase, side cover, a forward-tilted finned cylinder, head, carburettor
    add(spline([[-108, -190], [-114, -246], [-78, -280], [8, -286], [70, -270], [92, -226], [70, -184], [-24, -170], [-108, -190]], true));
    add(arc(-40, -228, 34), 'd');
    add(arc(-40, -228, 22), 'f');
    const cyl = [[-44, -286], [62, -280], [96, -378], [-20, -386]];
    add(seg(cyl[0][0], cyl[0][1], cyl[3][0], cyl[3][1]));
    add(seg(cyl[1][0], cyl[1][1], cyl[2][0], cyl[2][1]));
    for (let k = 0; k < 7; k++) {
      const t = (k + 0.7) / 7.6, xl = lerp(cyl[0][0], cyl[3][0], t) - 16, xr = lerp(cyl[1][0], cyl[2][0], t) + 16, yl = lerp(cyl[0][1], cyl[3][1], t), yr = lerp(cyl[1][1], cyl[2][1], t);
      add(seg(xl, yl, xr, yr), k % 2 ? 'f' : 'd');
    }
    add(spline([[-24, -388], [-14, -410], [84, -404], [102, -382]]));
    add(spline([[-40, -334], [-76, -332], [-90, -350], [-78, -368], [-36, -366]]), 'd');
    // exhaust: header from the head, down in front of the crankcase, under it into a long peashooter
    add(spline([[96, -350], [128, -318], [126, -232], [100, -160], [20, -134], [-110, -138], [-176, -164]]));
    add(spline([[-176, -180], [-300, -197], [-414, -214]]));
    add(spline([[-176, -150], [-300, -164], [-414, -180]]));
    add(arc(-414, -197, 6, 0, TAU, 17), 'd');
    // footpeg, kickstand
    add(seg(-112, -168, -150, -172));
    add(spline([[-62, -148], [-80, -70], [-96, -6]]), 'd');
    add(seg(-108, -4, -82, -4), 'd');
    // ---- resample, pieces, particles
    const PIECE = 9;                                                 // px of line per loosening piece
    let total = 0;
    const strokes = S.map((s, si) => {
      const p = resample(s.raw, 1);
      const X = new Float32Array(p.length), Y = new Float32Array(p.length); p.forEach((q, i) => { X[i] = q[0]; Y[i] = q[1]; });
      total += p.length;
      return { X, Y, n: p.length, st: s.st, si, seq: si / S.length };
    });
    // pieces and their particles (2 per px of line, jittered across the line's width)
    const pc = [], pxl = [], pyl = [], ppc = [];
    for (const s of strokes) {
      s.p0 = pc.length;
      for (let a = 0; a < s.n - 1; a += PIECE) {
        const b = Math.min(s.n - 1, a + PIECE), id = pc.length;
        let mx = 0, my = 0; for (let k = a; k <= b; k++) { mx += s.X[k]; my += s.Y[k]; } mx /= (b - a + 1); my /= (b - a + 1);
        pc.push({ s, a, b, mx, my });
        for (let k = a; k < b; k += s.st === 'f' ? 2 : 1) {
          const j = pxl.length, f = R(j, 3);
          const tx = s.X[k + 1] - s.X[k], ty = s.Y[k + 1] - s.Y[k], jj = (R(j, 4) - 0.5) * (s.st === 'm' ? 1.6 : 1.0);
          pxl.push(lerp(s.X[k], s.X[k + 1], f) - ty * jj); pyl.push(lerp(s.Y[k], s.Y[k + 1], f) + tx * jj); ppc.push(id);
        }
      }
      s.p1 = pc.length;
    }
    // release order: the wind comes from the front (right) — the front lets go first
    let x0 = 1e9, x1 = -1e9; for (const p of pc) { x0 = Math.min(x0, p.mx); x1 = Math.max(x1, p.mx); }
    pc.forEach((p, i) => { p.ord = clamp(0.82 * (x1 - p.mx) / (x1 - x0) + 0.18 * R(i, 5)); });
    const n = pxl.length, m = { strokes, pieces: pc, n, LX: Float32Array.from(pxl), LY: Float32Array.from(pyl), PC: Int32Array.from(ppc) };
    // each mote's drift (downwind = left, lifting a little) and its hanging place
    m.DX = new Float32Array(n); m.DY = new Float32Array(n); m.TD = new Float32Array(n); m.HX = new Float32Array(n); m.HY = new Float32Array(n);
    m.SX = new Float32Array(n); m.SY = new Float32Array(n);
    const Z = ZOOM.z1;
    for (let j = 0; j < n; j++) {
      const sx = BIKE.x + m.LX[j] * BIKE.s, sy = BIKE.y + m.LY[j] * BIKE.s;
      m.SX[j] = ZOOM.cx + (sx - ZOOM.cx) * Z; m.SY[j] = ZOOM.cy + (sy - ZOOM.cy) * Z;   // screen place at the end of the push-in
      const pi = m.PC[j], rp = R(pi, 6), rq = R(j, 7);
      m.DX[j] = -(18 + 120 * Math.pow(rp, 1.6)) * (0.75 + 0.5 * rq) - 16 * R(j, 8);
      m.DY[j] = -(4 + 46 * R(pi, 9)) * (0.6 + 0.8 * R(j, 10)) + (R(j, 11) - 0.5) * 54;
      m.TD[j] = 2.2 + 1.3 * R(j, 12);                                 // seconds to come to rest
      m.HX[j] = m.SX[j] + m.DX[j]; m.HY[j] = m.SY[j] + m.DY[j];
    }
    m.total = total;
    BK = m; return m;
  }
  // gentle hovering of a hanging mote (absolute time, so b10 and b11 agree)
  const hovX = (j, T) => Math.sin(T * (0.35 + 0.3 * R(j, 13)) + R(j, 14) * 40) * (5 + 9 * R(j, 15)) - 4 * Math.sin(T * 0.13 + R(j, 16) * 6);
  const hovY = (j, T) => Math.cos(T * (0.28 + 0.3 * R(j, 17)) + R(j, 18) * 40) * (4 + 7 * R(j, 19)) - 3 * Math.sin(T * 0.11 + R(j, 20) * 6);
  const twinkle = (j, T) => 0.7 + 0.3 * Math.sin(T * (1.1 + R(j, 21) * 1.7) + R(j, 22) * 30);
  // a hanging mote's light: most are faint, a few are embers
  const hangA = (j, T) => (0.45 + 2.2 * Math.pow(R(j, 27), 4)) * twinkle(j, T);

  // ================================================================ the wind (warm motes drifting right -> left)
  const NW = 760, DIE = 0.6;                                        // DIE: share of the bike's motes that burn out
  function windPos(i, T, o) {
    const sp = 110 + 230 * R(i, 31) * R(i, 38), span = W + 500;
    const x = (((R(i, 32) * span - sp * T) % span) + span) % span - 250;
    const g = (R(i, 33) + R(i, 34) + R(i, 35) - 1.5) * 1.15;
    const y = 900 + g * 330 + 26 * Math.sin(x * 0.005 + R(i, 36) * 6 + T * 0.45) + 10 * Math.sin(x * 0.017 + T * 0.9 + i);
    o[0] = x; o[1] = y;
    const edge = clamp(Math.min(x + 60, W + 60 - x) / 260);
    return edge * (0.35 + 0.65 * R(i, 37)) * (0.75 + 0.25 * Math.sin(T * 2 + i));
  }

  // ================================================================ b10 honest
  const DT = 0.035, TW = [0.42, 0.3, 0.18, 0.1];                     // motion-blur trail: 4 samples, weights sum to 1
  let WB = null;
  const wbuf = () => WB || (WB = { X: new Float32Array(NW), Y: new Float32Array(NW), A: new Float32Array(NW) });
  // the wind: each mote a short warm streak (canvas, additive) with a bright head (PX; call inside begin/flush)
  function drawWind(T, a) {
    if (a <= 0.003) return;
    const b = wbuf(), o = [0, 0], T1 = [], T2 = [];
    for (let i = 0; i < NW; i++) {
      b.A[i] = windPos(i, T, o); b.X[i] = o[0]; b.Y[i] = o[1];
      const tl = 0.06 + 0.07 * R(i, 39);
      windPos(i, T - tl * 0.5, o); T1.push(o[0], o[1]); windPos(i, T - tl, o); T2.push(o[0], o[1]);
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = C.free; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    const a0 = ctx.globalAlpha;
    for (let bk = 0; bk < 4; bk++) {
      ctx.globalAlpha = a0 * a * (0.1 + bk * 0.09); ctx.beginPath();
      for (let i = 0; i < NW; i++) {
        if (Math.min(3, Math.floor(b.A[i] * 4)) !== bk || b.X[i] < -20 || b.X[i] > W + 20) continue;
        ctx.moveTo(b.X[i], b.Y[i]); ctx.quadraticCurveTo(T1[i * 2], T1[i * 2 + 1], T2[i * 2], T2[i * 2 + 1]);
      }
      ctx.stroke();
    }
    ctx.restore();
    PX.points(b.X, b.Y, NW, FREE, { a: a * 0.32, A: b.A, glow: 0.4 });
  }

  function scenery(lt, a) {
    if (a <= 0.002) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.lineCap = 'round';
    const hz = 505, draw = (x0, y0, x1, y1, al, w = 1) => { ctx.globalAlpha = a * al; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
    const g = ctx.createLinearGradient(40, 0, W - 40, 0);
    g.addColorStop(0, 'rgba(236,231,220,0)'); g.addColorStop(0.18, 'rgba(236,231,220,1)'); g.addColorStop(0.82, 'rgba(236,231,220,1)'); g.addColorStop(1, 'rgba(236,231,220,0)');
    ctx.strokeStyle = g;
    const k = ease.inOut(prog(lt, 0, 1.6));
    draw(W / 2 - 520 * k, hz, W / 2 + 520 * k, hz, 0.3, 1.1);             // the horizon
    draw(W / 2 - 520 * k, BIKE.y, W / 2 + 520 * k, BIKE.y, 0.42, 1.3);     // the road under the wheels
    draw(W / 2 - 520 * k, BIKE.y + 92, W / 2 + 520 * k, BIKE.y + 92, 0.13, 1);
    // lane dashes
    for (let i = -4; i <= 4; i++) { const x = W / 2 + i * 130 + 30; draw(x - 34 * k, BIKE.y + 46, x + 34 * k, BIKE.y + 46, 0.12 * (1 - Math.abs(i) / 5), 1.2); }
    // the sea: a few short swells, closer together toward the horizon
    for (let r = 0; r < 9; r++) {
      const y = hz + 18 + Math.pow(r / 8, 1.7) * 330, cnt = 3 + (r % 3);
      for (let c = 0; c < cnt; c++) {
        const u = (c + 0.5 + 0.35 * Math.sin(r * 3.1 + c * 1.7)) / cnt, x = 110 + u * (W - 220) + Math.sin(lt * 0.25 + r + c) * 6, l = (14 + r * 5) * k;
        draw(x - l, y, x + l, y, 0.1 + 0.04 * Math.sin(lt * 0.6 + r * 1.3 + c), 1);
      }
    }
    // a low sun on the horizon (thin warm ring, half set), its path on the water
    ctx.strokeStyle = C.free; ctx.globalAlpha = a * 0.5 * k;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(806, hz + 12, 54, 0, TAU); ctx.stroke(); ctx.restore();
    for (let r = 0; r < 5; r++) { const y = hz + 14 + r * 15, l = (34 - r * 5) * k; ctx.globalAlpha = a * 0.3 * (1 - r / 6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(806 - l, y); ctx.lineTo(806 + l, y); ctx.stroke(); }
    ctx.restore();
  }

  // canvas strokes of the bike; draw-on (k per stroke) or loosening (per piece) — in screen space through ctx transform
  function bikeStrokes(m, lt, z, mode, tRel) {
    ctx.save();
    ctx.translate(ZOOM.cx, ZOOM.cy); ctx.scale(z, z); ctx.translate(-ZOOM.cx, -ZOOM.cy);
    ctx.translate(BIKE.x, BIKE.y); ctx.scale(BIKE.s, BIKE.s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const sc = z * BIKE.s, a0 = ctx.globalAlpha;
    if (mode === 'draw') {
      for (const st of ['f', 'd', 'm']) {
        const [w, al] = STY[st]; ctx.lineWidth = w / sc; ctx.strokeStyle = C.ink; ctx.globalAlpha = a0 * al; ctx.beginPath();
        for (const s of m.strokes) {
          if (s.st !== st) continue;
          const t0 = 0.12 + s.seq * 2.1, k = ease.inOut(prog(lt, t0, t0 + 0.55 + s.n / 1600));
          if (k <= 0) continue;
          const nn = Math.max(1, Math.floor(k * (s.n - 1)));
          ctx.moveTo(s.X[0], s.Y[0]); for (let i = 1; i <= nn; i += 2) ctx.lineTo(s.X[i], s.Y[i]); ctx.lineTo(s.X[nn], s.Y[nn]);
        }
        ctx.stroke();
      }
    } else {
      // pieces: intact before release - 0.35 s; fading over the 0.35 s before release (4 alpha buckets)
      for (const st of ['f', 'd', 'm']) {
        const [w, al] = STY[st]; ctx.lineWidth = w / sc; ctx.strokeStyle = C.ink;
        for (let bkt = 0; bkt < 5; bkt++) {
          ctx.globalAlpha = a0 * al * (bkt === 0 ? 1 : 1 - bkt / 5); ctx.beginPath(); let any = false;
          for (const s of m.strokes) {
            if (s.st !== st) continue;
            for (let p = s.p0; p < s.p1; p++) {
              const P = m.pieces[p], tr = tRel(P.ord), f = prog(lt, tr - 0.35, tr);
              if (f >= 1) continue;
              const b = f <= 0 ? 0 : 1 + Math.min(3, Math.floor(f * 4));
              if (b !== bkt) continue;
              any = true; ctx.moveTo(s.X[P.a], s.Y[P.a]); for (let i = P.a + 2; i < P.b; i += 2) ctx.lineTo(s.X[i], s.Y[i]); ctx.lineTo(s.X[P.b], s.Y[P.b]);
            }
          }
          if (any) ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // the bike's motes in b10: appear as their piece loosens, drift downwind, come to rest, hang
  let MB = null;
  const mk2 = n => ({ X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n), C: new Float32Array(n * 3) });
  function moteBuf(n) { return MB || (MB = [mk2(n), mk2(n)]); }
  function motesAt(m, lt, T, tRel, s, out) {
    const n = m.n, { X, Y, A } = out;
    for (let j = 0; j < n; j++) {
      const tr = tRel(m.pieces[m.PC[j]].ord), t = lt - s, f = prog(t, tr - 0.35, tr - 0.05);
      if (f <= 0) { A[j] = 0; continue; }
      const u = clamp((t - tr) / m.TD[j]), e = 1 - Math.pow(1 - u, 2.4);          // decelerates to rest exactly at u = 1
      const lift = Math.sin(Math.PI * u) * (12 + 30 * R(j, 23));
      const hv = smooth(u);
      X[j] = m.SX[j] + m.DX[j] * e + hovX(j, T - s) * hv;
      Y[j] = m.SY[j] + m.DY[j] * e - lift + hovY(j, T - s) * hv;
      const flash = u > 0 ? Math.exp(-u * 4) * 0.35 : 0, live = R(j, 26) < DIE ? 1 - smooth(u) : 1;
      A[j] = f * live * (lerp(1, hangA(j, T - s), smooth(clamp(u * 1.6))) + flash);
    }
  }

  window.__e3 = () => { const m = bike(); return { n: m.n, total: m.total, pieces: m.pieces.length }; };
  T.register('honest', {
    draw(ctx, V, lt, api) {
      const T0 = api.beat.start, T = T0 + lt, tQ = at(api, 'q'), tNo = at(api, 'no'), tWhat = at(api, 'what'), dur = api.dur;
      if (lt > dur - 0.5) ctx.globalAlpha = 1;            // b10 -> b11 is one continuous picture (see the header)
      const m = bike();
      const z = lerp(1, ZOOM.z1, ease.inOut(prog(lt, 0, tNo)));
      const r0 = tNo + 0.55, r1 = tWhat + 0.35;
      const tRel = ord => r0 + ord * (r1 - r0);
      // scenery fades as the bike comes apart
      scenery(lt, 1 - smooth(prog(lt, tNo + 0.4, tWhat + 0.6)));
      if (lt < tNo) bikeStrokes(m, lt, z, 'draw');
      else if (lt < r1 + 0.1) bikeStrokes(m, lt, z, 'loose', tRel);
      // light: wind + loosened motes
      PX.begin(); fullFrame();
      drawWind(T, ease.inOut(prog(lt, 0, 1.4)));
      if (lt > r0 - 0.4) {
        const [b, b1] = moteBuf(m.n), n = m.n;
        motesAt(m, lt, T, tRel, 0, b); motesAt(m, lt, T, tRel, 0.045, b1);
        // colour: ink-white while still a line, warming to the wind's orange as it drifts
        for (let j = 0; j < n; j++) {
          const u = clamp((lt - tRel(m.pieces[m.PC[j]].ord)) / 1.2), w = smooth(u) * (0.75 + 0.25 * R(j, 24));
          b.C[j * 3] = lerp(INK[0], FREE[0], w); b.C[j * 3 + 1] = lerp(INK[1], lerp(FREE[1], WARM[1], R(j, 25) * 0.6), w); b.C[j * 3 + 2] = lerp(INK[2], FREE[2], w);
        }
        streaks(n, b.X, b.Y, b1.X, b1.Y, b.A, b.C, { a: 0.55, glow: 0.25 });
      }
      PX.flush({ exposure: 1.5, glow: 0.9 });
      // the voice
      cap(splitQ(V.lines.q), lt, tQ, tNo);
      cap(V.lines.no, lt, tNo, tWhat, { family: F.hand, size: 58 });
      cap(V.lines.what, lt, tWhat, dur - 0.15);
    },
    cues(V, api) {
      const t = n => at(api, n);
      return [
        { t: 0, type: 'whoosh', dur: 3.2 },
        { t: t('no') + 0.55, type: 'whoosh', dur: 3.6 },
        { t: t('what'), type: 'hush' },
      ];
    },
  });
  // split a sentence after its first comma, for two calm lines
  function splitQ(s) { const i = s.indexOf('，'); return i > 0 && i < s.length - 1 ? [s.slice(0, i + 1), s.slice(i + 1)] : [s]; }

  // ================================================================ b11 freedom
  const NS = 2600;                                                   // sparks from an unseen campfire below
  const WORD = { size: 250, y: 1112, cx: 540, top: 892, bot: 1142 };
  const STAMP = { x: 540, y: 680, w: 290, h: 158 };
  const PHR = { size: 84, y: 452 };
  let M11 = null;
  function mat11(V, T0) {
    if (M11) return M11;
    const b = bike(), NA = b.n, N = NA + NW + NS, m = { NA, N };
    // sources at b11's start (rest positions; wind and sparks move on in time)
    const sx = new Float32Array(N), sy = new Float32Array(N), o = [0, 0];
    for (let j = 0; j < NA; j++) { sx[j] = b.HX[j]; sy[j] = b.HY[j]; }
    for (let i = 0; i < NW; i++) { windPos(i, T0 + 1.2, o); sx[NA + i] = o[0]; sy[NA + i] = o[1]; }
    for (let i = 0; i < NS; i++) { sx[NA + NW + i] = 540 + (R(i, 41) + R(i, 76) - 1) * 640; sy[NA + NW + i] = 1900; }
    // the word, and the phrase
    const wc = PX.fit(PX.text(V.lines.word, { size: WORD.size, family: F.serif, weight: 600, x: WORD.cx, y: WORD.y, step: 1.3, spacing: 18, seed: 31 }), N);
    const pc = PX.fit(PX.text(V.lines.free, { size: PHR.size, family: F.serif, weight: 600, x: W / 2, y: PHR.y, step: 0.95, spacing: 6, seed: 32 }), N);
    // pair by x (with a little noise): sources -> word -> phrase move mostly straight, never crossing wildly
    const sortIdx = (n, key) => { const idx = Array.from({ length: n }, (_, i) => i), k = Float64Array.from(idx, key); idx.sort((a, c) => k[a] - k[c]); return idx; };
    const si = sortIdx(N, j => sx[j] + (R(j, 42) - 0.5) * 220);
    const wi = sortIdx(N, i => wc.X[i] + (R(i, 43) - 0.5) * 60);
    const pi = sortIdx(N, i => pc.X[i] + (R(i, 44) - 0.5) * 50);
    m.WX = new Float32Array(N); m.WY = new Float32Array(N); m.PXa = new Float32Array(N); m.PYa = new Float32Array(N);
    for (let k = 0; k < N; k++) { const j = si[k]; m.WX[j] = wc.X[wi[k]]; m.WY[j] = wc.Y[wi[k]]; }
    const wo = sortIdx(N, j => m.WX[j] + (R(j, 45) - 0.5) * 50);
    for (let k = 0; k < N; k++) { const j = wo[k]; m.PXa[j] = pc.X[pi[k]]; m.PYa[j] = pc.Y[pi[k]]; }
    // per particle colour (flame: golden core, orange tips) and spark membership
    m.CC = new Float32Array(N * 3);
    for (let j = 0; j < N; j++) {
      const up = clamp((WORD.bot - m.WY[j]) / (WORD.bot - WORD.top)), h = clamp(0.25 + 0.75 * R(j, 46) * (1 - up * 0.8));
      m.CC[j * 3] = 1; m.CC[j * 3 + 1] = lerp(0.5, 0.82, h); m.CC[j * 3 + 2] = lerp(0.26, 0.55, h);
    }
    m.B = { X: new Float32Array(N), Y: new Float32Array(N), A: new Float32Array(N) }; m.B1 = { X: new Float32Array(N), Y: new Float32Array(N) };
    M11 = m; return m;
  }
  // free flight of each source before it is gathered (T absolute, lt local)
  function srcPos(m, j, T, lt, o) {
    const NA = m.NA;
    if (j < NA) { const b = bike(); o[0] = b.HX[j] + hovX(j, T); o[1] = b.HY[j] + hovY(j, T); return R(j, 26) < DIE ? 0 : hangA(j, T) * 1.1; }
    if (j < NA + NW) { windPos(j - NA, T, o); return 0; }        // (their light is drawn as streaks until gathered)
    const i = j - NA - NW, sp = 300 + 240 * R(i, 47), t = lt - 0.25 * R(i, 48);
    const y = 1960 + R(i, 50) * 900 - sp * t, rise = clamp((1990 - y) / 800);
    o[0] = 540 + (R(i, 41) + R(i, 76) - 1) * (110 + 640 * rise) + Math.sin(t * (1.5 + R(i, 49)) + i) * 24 * rise;
    o[1] = y;
    return 2.6 * (0.5 + 0.5 * Math.sin(t * 7 + i * 3.1)) ** 2 + 0.7;
  }
  // the burning word: glyph point + flame motion; sparks occasionally leave the tips
  function flame(m, j, t, o, flare) {
    const gx = m.WX[j], gy = m.WY[j], up = clamp((WORD.bot - gy) / (WORD.bot - WORD.top));
    const fl = 0.5 + 0.5 * Math.sin(t * (2.2 + 2.6 * R(j, 51)) + R(j, 52) * 40);
    const br = 1 + 0.014 * Math.sin(t * TAU / (beat.BEAT * 4));     // a slow breath (one per bar)
    let x = WORD.cx + (gx - WORD.cx) * br + Math.sin(t * 1.7 + gy * 0.03 + R(j, 53) * 6) * (0.6 + 1.8 * up);
    let y = 1017 + (gy - 1017) * br - fl * fl * (1.2 + 6 * up * up);
    let a = 0.72 + 0.28 * Math.sin(t * 3.1 - gy * 0.035 + R(j, 54) * 2.0);
    if (R(j, 55) < 0.05 + 0.04 * up) {                              // a spark: rises off the word and fades, then returns
      const P = 1.6 + 2.4 * R(j, 56), c = ((t / P + R(j, 57)) % 1 + 1) % 1;
      if (c < 0.42) { const u = c / 0.42; y -= Math.pow(u, 1.3) * (50 + 170 * R(j, 58)) * (0.4 + up); x += Math.sin(u * 5 + R(j, 59) * 9) * 14 * u; a *= 1 - u; }
      else a *= smooth(prog(c, 0.42, 0.62));
    }
    o[0] = x; o[1] = y; return a * (1 + flare);
  }
  function stampY(lt, tS) { const k = prog(lt, tS, tS + 3.6); return lerp(-170, STAMP.y, 1 - Math.pow(1 - k, 2.6)) + Math.sin((lt - tS) * TAU / (beat.BEAT * 4)) * 5 * smooth(prog(lt, tS + 2.6, tS + 4.2)); }
  // the seal: drawn once into a canvas, slightly uneven ink like a real chop
  let SEAL = null;
  function seal(txt) {
    if (SEAL) return SEAL;
    const w = STAMP.w, h = STAMP.h, pad = 24, c = Object.assign(document.createElement('canvas'), { width: w + pad * 2, height: h + pad * 2 }), g = c.getContext('2d');
    g.translate(pad, pad); g.strokeStyle = C.red; g.fillStyle = C.red;
    g.lineWidth = 7; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 10); g.stroke();
    g.lineWidth = 1.8; g.beginPath(); g.roundRect(16, 16, w - 32, h - 32, 5); g.stroke();
    g.font = `900 98px ${F.serif}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (g.letterSpacing !== undefined) g.letterSpacing = '16px';
    g.fillText(txt, w / 2 + 8, h / 2 + 6);
    // ink wear: knock out specks
    g.globalCompositeOperation = 'destination-out'; const r = rng(91);
    for (let i = 0; i < 520; i++) { g.globalAlpha = 0.25 + r() * 0.6; g.beginPath(); g.arc(r() * w, r() * h, 0.6 + r() * r() * 3.2, 0, TAU); g.fill(); }
    g.globalAlpha = 0.18; for (let i = 0; i < 9; i++) { g.beginPath(); const y = r() * h; g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 30); g.lineWidth = 0.6 + r() * 1.5; g.stroke(); }
    SEAL = { c, pad }; return SEAL;
  }

  // where material particle j is at local time t in b11 (writes o, returns its light)
  function pos11(m, j, t, T, flare, sy, tF, o) {
    // 1. gather into the word
    // each mote leaves its drift at its own moment and flies in quickly: the word fills in grain by grain
    let d, tr = 0.85 + 0.55 * R(j, 61);
    if (j < m.NA) d = 0.25 + 2.9 * Math.pow(R(j, 60), 0.85);
    else if (j < m.NA + NW) d = 0.2 + 1.8 * R(j, 60);
    else { const i = j - m.NA - NW; d = (1960 + R(i, 50) * 900 - (1250 + 150 * R(i, 74))) / (330 + 260 * R(i, 47)) + 0.25 * R(i, 48); tr = 0.7 + 0.4 * R(j, 61); }
    const eg = ease.inOut(clamp((t - d) / tr));
    let x, y, a;
    if (eg < 1) {
      const a0 = srcPos(m, j, T, t, o), fx = o[0], fy = o[1];
      const af = flame(m, j, t, o, flare), wx = o[0], wy = o[1];
      const sw = Math.sin(Math.PI * eg) * (40 + 140 * R(j, 62)) * (R(j, 63) < 0.5 ? -1 : 1);
      const ddx = wx - fx, ddy = wy - fy, dl = Math.hypot(ddx, ddy) + 1e-3;
      x = lerp(fx, wx, eg) - ddy / dl * sw; y = lerp(fy, wy, eg) + ddx / dl * sw;
      a = lerp(a0, af, smooth(eg)) * (1 + Math.sin(Math.PI * eg) * 0.5);
    } else { a = flame(m, j, t, o, flare); x = o[0]; y = o[1]; }
    // 2. release: up past the seal, into the phrase, then out of the frame
    if (t > tF) {
      const px = m.PXa[j], py = m.PYa[j];
      const ord = clamp((WORD.bot - m.WY[j]) / (WORD.bot - WORD.top) * 0.35 + R(j, 64) * 0.65);
      const t1 = tF + 0.1 + ord * 1.1, t2 = t1 + 1.25 + 0.45 * R(j, 65);
      const u = clamp((t - t1) / (t2 - t1));
      if (u > 0) {
        const e = ease.inOut(u), v = 1 - e;
        // a cubic path that rises from below, bowing out to one side
        const side = (m.WX[j] - 540) / 400 + (R(j, 66) - 0.5) * 0.9;
        const c1x = x + side * 120, c1y = y - 260 - 120 * R(j, 67), c2x = px + side * 160, c2y = py + 280;
        let bx = v * v * v * x + 3 * v * v * e * c1x + 3 * v * e * e * c2x + e * e * e * px;
        const by = v * v * v * y + 3 * v * v * e * c1y + 3 * v * e * e * c2y + e * e * e * py;
        // part around the seal (it is in the way; they do not mind)
        const rx = bx - STAMP.x, g = Math.exp(-Math.pow((by - sy) / 120, 2)) * Math.sin(Math.PI * u);
        const clear = 175 + 150 * R(j, 75);                            // each passes at its own distance: no rim
        bx += (rx >= 0 ? 1 : -1) * Math.max(0, clear - Math.abs(rx)) * g;
        x = bx; y = by; a = lerp(a, 0.95, smooth(u)) * (1 + 0.5 * Math.sin(Math.PI * u));
      }
      // 3. hold (breathing), then fly on: upward and outward, the left wing left, the right wing right
      if (u >= 1) {
        x += Math.sin(t * 1.3 + R(j, 68) * 30) * 1.2; y += Math.cos(t * 1.1 + R(j, 69) * 30) * 1.2;
        const t3 = tF + 3.55 + 0.55 * Math.abs(px - 540) / 420 + 0.5 * R(j, 70), ue = clamp((t - t3) / (1.8 + 0.6 * R(j, 71)));
        if (ue > 0) {
          const th = -Math.PI / 2 + (px - 540) / 540 * 1.0 + (R(j, 72) - 0.5) * 0.7, dist = 1500 * Math.pow(ue, 1.9);
          const curl = Math.sin(ue * 3 + R(j, 73) * 6) * 50 * ue;
          x += Math.cos(th) * dist - Math.sin(th) * curl; y += Math.sin(th) * dist + Math.cos(th) * curl;
          a *= 1 - 0.5 * ue;
        }
      }
    }
    o[0] = x; o[1] = y; return a;
  }

  T.register('freedom', {
    draw(ctx, V, lt, api) {
      const T0 = api.beat.start, T = T0 + lt, dur = api.dur;
      const tI = at(api, 'items'), tS = at(api, 'stamp'), tF = at(api, 'free'), tN = at(api, 'need');
      if (lt < 0.5) ctx.globalAlpha = 1;                    // continuous from b10 (see the header)
      const m = mat11(V, T0), N = m.N, B = m.B, o = [0, 0];
      // strikes feed the flame
      const strikeT = [0, 1, 2].map(i => tI + 2.3 + i * 1.25);
      let flare = 0; for (const s of strikeT) if (lt > s + 0.35) flare += 0.35 * Math.exp(-(lt - s - 0.35) * 1.6);
      // ---- particles
      PX.begin(); fullFrame();
      drawWind(T, 1 - smooth(prog(lt, 0.3, 2.4)));
      const B1 = m.B1, sy0 = stampY(lt, tS), sy1 = stampY(lt - 0.045, tS);
      for (let j = 0; j < N; j++) {
        B.A[j] = pos11(m, j, lt, T, flare, sy0, tF, o); B.X[j] = o[0]; B.Y[j] = o[1];
        pos11(m, j, lt - 0.045, T - 0.045, flare, sy1, tF, o); B1.X[j] = o[0]; B1.Y[j] = o[1];
      }
      streaks(N, B.X, B.Y, B1.X, B1.Y, B.A, m.CC, { a: 0.4, glow: 0.38 });
      // the wind fades out as it is gathered (its motes are part of the material above)
      PX.flush({ exposure: 1.6, glow: 0.9 });

      // ---- the three objects, struck through calmly
      const iy = [1262, 1342, 1422], outI = smooth(prog(lt, tF, tF + 0.9));
      V.lines.items.forEach((str, i) => {
        const k = prog(lt, tI + 0.15 + i * 0.45, tI + 1.1 + i * 0.45); if (k <= 0) return;
        const sk = ease.inOut(prog(lt, strikeT[i], strikeT[i] + 0.6));
        const al = (1 - 0.55 * smooth(prog(lt, strikeT[i] + 0.2, strikeT[i] + 1.0))) * (1 - outI);
        KIT.type(str, W / 2, iy[i] - outI * 30, { size: 42, family: F.serif, weight: 400, color: C.ink, k, alpha: 0.82 * al, mode: 'rise' });
        if (sk > 0) {
          const w = K.measure(str, { size: 42, family: F.serif, spacing: 42 * 0.04 }) + 36;
          ctx.save(); ctx.globalAlpha *= (1 - outI) * 0.85;
          KIT.pen('strike', W / 2 - w / 2 + w * sk / 2, iy[i] - 14 - outI * 30, w * sk, 1, { color: C.ink, width: 1.8, seed: 11 + i });
          ctx.restore();
        }
      });
      // ---- the seal: descends slowly, hovers, never lands; sways in the wake of the release
      if (lt > tS) {
        const sl = seal(V.lines.stamp), y = stampY(lt, tS);
        const wake = lt > tF + 0.6 ? Math.sin((lt - tF - 0.6) * 2.4) * Math.exp(-(lt - tF - 0.6) * 0.55) * 0.05 * smooth(prog(lt, tF + 0.6, tF + 1.2)) : 0;
        const rot = -0.045 + wake + Math.sin((lt - tS) * 0.9) * 0.006;
        ctx.save(); ctx.globalAlpha *= smooth(prog(lt, tS, tS + 1.2)) * 0.92;
        L.light(STAMP.x, y, 230, 'rgba(229,72,77,0.10)', 1);
        ctx.translate(STAMP.x, y); ctx.rotate(rot);
        ctx.drawImage(sl.c, -STAMP.w / 2 - sl.pad, -STAMP.h / 2 - sl.pad);
        ctx.restore();
      }
      cap(splitQ(V.lines.need), lt, tN, dur - 0.1);
    },
    cues(V, api) {
      const t = n => at(api, n), tI = t('items');
      return [
        { t: 0.2, type: 'whoosh', dur: 2.6 },
        { t: 2.7, type: 'glow' },
        ...[0, 1, 2].map(i => ({ t: tI + 2.3 + i * 1.25, type: 'tick' })),
        { t: t('stamp'), type: 'hush' },
        { t: t('free'), type: 'swell', dur: 2.2 },
        { t: t('free') + 0.6, type: 'whoosh', dur: 3.6 },
        { t: t('need'), type: 'resolve' },
      ];
    },
  });
})();
