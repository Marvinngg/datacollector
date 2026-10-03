/* e0 深夜 — the opening. One a.m.; a phone's light in the dark; three lives scrolled past; a perfect grey answer sheet;
 * the phone goes off and the question stays lit.
 *   b01 feed    — pure dark; a click: a thin line-art phone lights the darkness and the 你 below it; 01:00 on the lock
 *                 screen. Three thumb-swipes (a soft light trail, physical momentum) scroll three full-screen "videos",
 *                 each a fine line-art vignette with warm motion: a motorbike on a seaside road (wind), a gym coach
 *                 laughing (dust in window light), a mountain-top campfire (fire and sparks). The scroll stops on the
 *                 fire; the heart icon stays empty; the screen auto-dims; only the fire moves.
 *   b02 answers — hard cut: three quiet facts, each ticked in red; they rise to the top and an answer sheet fills itself,
 *                 every bubble right, red ✓ cascading, a red 100; then all colour drains — even the red.
 *   b03 darkq   — the phone again; "别想了…"; the screen switches off like an old CRT (line, dot); darkness, 你 faint;
 *                 the dot's last light becomes the question.
 * Every frame is a pure function of lt (motion uses absolute time so the fire never jumps between beats).
 * Figures are drawn as editorial silhouettes: unions of tapered capsules, outlined (stroke wide, then fill). */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, text } = K;
  const { C } = KIT;
  const TAU = Math.PI * 2;
  const at = (api, n) => KIT.at(api, n);
  const sm = k => k * k * (3 - 2 * k);
  const frac = x => x - Math.floor(x);
  const R = (i, k) => PX.rand(i, k);

  // ---------------------------------------------------------------- geometry
  const PHN = { x: 283, y: 202, w: 514, h: 954, r: 72 };           // the phone (outline)
  const SCR = { x: 295, y: 214, w: 490, h: 930, r: 60 };           // its screen
  const SCX = SCR.x + SCR.w / 2, SCY = SCR.y + SCR.h / 2, PITCH = SCR.h;
  const HW = 223, HH = 423, CS = SCR.w / (2 * HW);                   // cards are designed in a 446 x 846 space
  const YOU = { x: 540, y: 1284, size: 190 };
  const INK = '#e6ecf6', INKA = a => `rgba(230,236,246,${a})`;
  const FREE = '#ff9a5c';
  const SCRL = KIT.rgb('#cfdcff');                                    // screen light as PX colour
  const COOLW = [0.86, 0.9, 1.0];

  // ---------------------------------------------------------------- transform tracking (so PX points follow ctx groups)
  let TX = { ox: 0, oy: 0, s: 1 };
  function grp(px, py, s, fn) {                                        // scale s about (px, py)
    const prev = TX; ctx.save(); ctx.translate(px, py); ctx.scale(s, s); ctx.translate(-px, -py);
    TX = { ox: prev.ox + px * prev.s * (1 - s), oy: prev.oy + py * prev.s * (1 - s), s: prev.s * s };
    fn(); TX = prev; ctx.restore();
  }

  // ---------------------------------------------------------------- tiny drawing helpers (fine line art)
  function path(pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }
  function curve(pts) {                                               // smooth curve through points (midpoint quadratics)
    const n = pts.length / 2; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    if (n === 2) { ctx.lineTo(pts[2], pts[3]); return; }
    for (let i = 1; i < n - 1; i++) { const x = pts[2 * i], y = pts[2 * i + 1]; ctx.quadraticCurveTo(x, y, (x + pts[2 * i + 2]) / 2, (y + pts[2 * i + 3]) / 2); }
    ctx.lineTo(pts[2 * n - 2], pts[2 * n - 1]);
  }
  // stroke the current path; w is the on-screen width (independent of group scale)
  function st(col, w = 1.6, a = 1) { ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = w / TX.s; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore(); }
  function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  const L2 = (x0, y0, x1, y1, col, w, a) => { path([x0, y0, x1, y1]); st(col, w, a); };
  function glowDisc(x, y, r, rgb, a) {                                // soft additive light (cheap: one gradient)
    if (a <= 0.002) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.45, `rgba(${rgb},${a * 0.4})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore();
  }
  // two-link IK: the joint between a (root) and b (end), lengths l1, l2; side +1/-1 picks the bend
  function ik(a, b, l1, l2, side) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.max(1e-3, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dy)));
    const p = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - p * p));
    const ux = dx / d, uy = dy / d; return [a[0] + ux * p - uy * h * side, a[1] + uy * p + ux * h * side];
  }
  // body parts as Path2D: a tapered capsule a->b (radii r0, r1), a disc, a smooth closed blob
  function cap(a, b, r0, r1) {
    const p = new Path2D(), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, an = Math.atan2(dy, dx);
    p.moveTo(a[0] + nx * r0, a[1] + ny * r0); p.lineTo(b[0] + nx * r1, b[1] + ny * r1);
    p.arc(b[0], b[1], r1, an + Math.PI / 2, an - Math.PI / 2, true);
    p.lineTo(a[0] - nx * r0, a[1] - ny * r0);
    p.arc(a[0], a[1], r0, an - Math.PI / 2, an + Math.PI / 2, true); p.closePath(); return p;
  }
  function disc(c, r) { const p = new Path2D(); p.arc(c[0], c[1], r, 0, TAU); return p; }
  function blob(pts) {
    const p = new Path2D(), n = pts.length / 2, mx = i => (pts[(2 * i) % (2 * n)] + pts[(2 * i + 2) % (2 * n)]) / 2, my = i => (pts[(2 * i + 1) % (2 * n)] + pts[(2 * i + 3) % (2 * n)]) / 2;
    p.moveTo(mx(0), my(0)); for (let i = 1; i <= n; i++) p.quadraticCurveTo(pts[(2 * i) % (2 * n)], pts[(2 * i + 1) % (2 * n)], mx(i), my(i)); p.closePath(); return p;
  }
  // a silhouette: the outline of the union of the parts (stroke at 2x width, then fill over the inside half)
  function fig(parts, fill, col, lw = 1.6) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.lineWidth = 2 * lw / TX.s;
    for (const p of parts) ctx.stroke(p);
    ctx.fillStyle = fill; for (const p of parts) ctx.fill(p);
    ctx.restore();
  }
  const css = c => `rgb(${c.map(v => Math.round(clamp(v) * 255)).join(',')})`;

  // ---------------------------------------------------------------- one particle batch with per-point colour
  const NB = 30000, BX = new Float32Array(NB), BY = new Float32Array(NB), BA = new Float32Array(NB), BC = new Float32Array(NB * 3);
  let bn = 0;
  function bpush(x, y, a, c) { if (bn >= NB || a <= 0.002) return; BX[bn] = x; BY[bn] = y; BA[bn] = a; BC[bn * 3] = c[0]; BC[bn * 3 + 1] = c[1]; BC[bn * 3 + 2] = c[2]; bn++; }
  const bp = (x, y, a, c) => bpush(TX.ox + x * TX.s, TX.oy + y * TX.s, a, c);   // in the current group's coordinates
  function bflush(a = 0.6, glow = 0.5) { if (bn) PX.points(BX, BY, bn, null, { a, A: BA, C: BC, glow }); bn = 0; }
  const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const HOT = [1.0, 0.86, 0.62], FREEL = KIT.rgb(FREE), GOLD = KIT.rgb('#ffd08a'), INKL = KIT.rgb(INK);

  // ---------------------------------------------------------------- the feed: momentum scroll
  // a flick: the finger drags the content a little (accelerating), lets go, and the content glides to rest
  // (exponential decay whose start velocity matches the drag), landing exactly one screen further.
  function mom(u) {
    if (u <= 0) return 0;
    const d = 0.22, a = 0.22, tau = (1 - a) * d / (2 * a);
    if (u < d) return a * (u / d) * (u / d);
    return Math.min(1, a + (1 - a) * (1 - Math.exp(-(u - d) / tau)) / (1 - Math.exp(-3.4 / tau)));
  }
  // the thumb: touch-down just before the step, a fast curved flick upward, lift
  const fingerK = u => { const k = clamp(u / 0.26); return k * k * (1.35 - 0.35 * k); };
  const fingerPos = u => { const k = fingerK(u); return [640 - 80 * Math.sin(k * 1.2), 1060 - 540 * k]; };

  // ---------------------------------------------------------------- screen chrome (design space)
  function heart(x, y, s) { ctx.beginPath(); ctx.moveTo(x, y + 7 * s); ctx.bezierCurveTo(x - 15 * s, y - 3 * s, x - 9 * s, y - 16 * s, x, y - 8 * s); ctx.bezierCurveTo(x + 9 * s, y - 16 * s, x + 15 * s, y - 3 * s, x, y + 7 * s); }
  function rail() {                                                   // like / comment / share — never pressed
    const x = 194;
    heart(x, 2, 1.25); st(INK, 1.6, 0.8);
    ctx.beginPath(); ctx.ellipse(x, 62, 13, 11, 0, 0.35, TAU - 0.15); ctx.lineTo(x - 13, 76); ctx.closePath(); st(INK, 1.5, 0.6);
    curve([x - 11, 132, x - 8, 118, x + 6, 114]); st(INK, 1.5, 0.6); path([x + 1, 108, x + 8, 114, x + 1, 120]); st(INK, 1.5, 0.6);
  }
  function cardChrome(cap, t, t0) {                                   // caption (bottom left) + video progress line + rail
    const g = ctx.createLinearGradient(0, 260, 0, HH); g.addColorStop(0, 'rgba(5,7,12,0)'); g.addColorStop(1, 'rgba(5,7,12,0.55)');
    ctx.fillStyle = g; ctx.fillRect(-HW, 260, 2 * HW, HH - 260);
    text(cap, -HW + 24, 352, { size: 22, family: F.sans, weight: 400, color: INK, alpha: 0.9, spacing: 1 });
    const p = frac(Math.max(0, t - t0) / 9);
    ctx.fillStyle = INKA(0.16); ctx.fillRect(-HW, 398, 2 * HW, 2); ctx.fillStyle = INKA(0.6); ctx.fillRect(-HW, 398, 2 * HW * p, 2);
    rail();
  }
  function statusBar(timeStr, aTime) {                                 // screen space
    const y = SCR.y + 40;
    if (aTime > 0) text(timeStr, SCR.x + 52, y, { size: 21, family: F.sans, weight: 500, color: INK, alpha: 0.85 * aTime });
    ctx.save(); ctx.strokeStyle = INKA(0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(SCR.x + SCR.w - 76, y - 14, 29, 14, 4); ctx.stroke();
    ctx.fillStyle = INKA(0.7); ctx.fillRect(SCR.x + SCR.w - 74, y - 12, 18, 10); ctx.fillRect(SCR.x + SCR.w - 46, y - 10, 2, 6);
    for (let k = 0; k < 4; k++) ctx.fillRect(SCR.x + SCR.w - 112 + k * 6, y - 3 - k * 3, 3.4, 3 + k * 3);
    ctx.fillStyle = '#04060a'; ctx.beginPath(); ctx.roundRect(SCX - 60, SCR.y + 15, 120, 34, 17); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- lock screen (scroll item 0)
  function lockScreen(clock, on) {
    const g = ctx.createRadialGradient(0, -150, 20, 0, -150, 560);
    g.addColorStop(0, 'rgba(56,72,108,0.5)'); g.addColorStop(1, 'rgba(10,16,32,0)');
    ctx.fillStyle = g; ctx.fillRect(-HW, -HH, 2 * HW, 2 * HH);
    const k = ease.out(prog(on, 0.2, 1));
    ctx.save(); ctx.globalAlpha *= k;
    ctx.beginPath(); ctx.roundRect(-10, -300, 20, 15, 3); st(INK, 1.4, 0.75);
    ctx.beginPath(); ctx.arc(0, -300, 6.5, Math.PI, 0); st(INK, 1.4, 0.75);
    text(clock, 0, -160, { size: 124, family: F.sans, weight: 300, color: '#eef2ff', align: 'center', alpha: 0.95, spacing: 2, ctx });
    [-150, 150].forEach((x, j) => {
      circ(x, 322, 27); ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.restore(); st(INK, 1.1, 0.4);
      if (j === 0) { ctx.beginPath(); ctx.roundRect(x - 5, 310, 10, 24, 2); st(INK, 1.3, 0.7); }
      else { ctx.beginPath(); ctx.roundRect(x - 11, 314, 22, 16, 3); st(INK, 1.3, 0.7); circ(x, 322, 4.5); st(INK, 1.2, 0.7); }
    });
    ctx.fillStyle = INKA(0.75); ctx.beginPath(); ctx.roundRect(-60, 398, 120, 5, 2.5); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- card 1: a motorbike on a seaside road (wind)
  const HILL = [-223, -40, -205, -52, -178, -74, -150, -92, -120, -88, -96, -70, -72, -52, -48, -40];
  function card1(t) {
    let g = ctx.createLinearGradient(0, -HH, 0, -40);
    g.addColorStop(0, '#0a1120'); g.addColorStop(0.65, '#171a29'); g.addColorStop(1, '#382b2d');
    ctx.fillStyle = g; ctx.fillRect(-HW, -HH, 2 * HW, HH - 40);
    g = ctx.createLinearGradient(0, -40, 0, 140); g.addColorStop(0, '#1b1822'); g.addColorStop(1, '#0b0f19');
    ctx.fillStyle = g; ctx.fillRect(-HW, -40, 2 * HW, 180);
    ctx.fillStyle = '#090d16'; ctx.fillRect(-HW, 140, 2 * HW, HH - 140);
    // the low sun on the horizon
    glowDisc(95, -40, 200, '255,150,90', 0.16);
    ctx.save(); ctx.beginPath(); ctx.rect(-HW, -HH, 2 * HW, HH - 40); ctx.clip();
    circ(95, -40, 44); ctx.save(); ctx.fillStyle = 'rgba(255,154,92,0.10)'; ctx.fill(); ctx.restore(); st(FREE, 1.8, 0.85);
    ctx.restore();
    curve(HILL); st(INK, 1.3, 0.38);
    L2(-HW, -40, HW, -40, INK, 1.2, 0.55);
    // the sea: wave glints in rows, denser and slower toward the horizon (parallax)
    for (let j = 0; j < 13; j++) {
      const v = j / 12, y = -36 + Math.pow(v, 1.6) * 150, dash = 5 + v * 26, per = dash * 2.7, sp = 5 + v * 46, off = (t * sp + j * 37) % per;
      ctx.beginPath();
      for (let x = -HW - off, q = 0; x < HW; x += per, q++) {
        const id = Math.floor((t * sp + j * 37) / per) - q;
        if (R(id & 4095, 3 + j) < 0.38) continue;
        const xx = x + (R(id & 4095, 40 + j) - 0.5) * per * 0.6;
        ctx.moveTo(xx, y); ctx.lineTo(xx + dash, y);
      }
      st(INK, 1.1, 0.14 + v * 0.22);
      const sw = 6 + v * 34;                                             // the sun's path on the water
      ctx.beginPath(); for (let q = 0; q < 3; q++) { const xx = 95 + (R(j * 3 + q, 9) - 0.5) * sw * 2, l = 4 + v * 14; ctx.moveTo(xx - l / 2, y + 2); ctx.lineTo(xx + l / 2, y + 2); }
      st(FREE, 1.4, (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.3 + j * 1.7))) * (1 - v * 0.5));
    }
    // guardrail (fast parallax), road
    L2(-HW, 126, HW, 126, INK, 1.4, 0.55); L2(-HW, 138, HW, 138, INK, 1.0, 0.3);
    ctx.beginPath(); const pp = 64, po = (t * 330) % pp;
    for (let x = -HW - po + pp; x < HW + pp; x += pp) { ctx.moveTo(x, 126); ctx.lineTo(x, 166); }
    st(INK, 1.3, 0.45);
    L2(-HW, 166, HW, 166, INK, 1.3, 0.45); L2(-HW, 318, HW, 318, INK, 1.3, 0.3);
    ctx.beginPath(); const dp = 92, doff = (t * 420) % dp;
    for (let x = -HW - doff; x < HW; x += dp) { ctx.moveTo(x, 240); ctx.lineTo(x + 40, 240); }
    st(INK, 1.6, 0.28);
    ctx.beginPath(); for (let x = -HW - (t * 520) % 150; x < HW; x += 150) { ctx.moveTo(x, 300); ctx.lineTo(x + 18, 300); } st(INK, 1, 0.16);
    // wind lines behind the rider (under him)
    for (let k = 0; k < 10; k++) {
      const ph = frac(t * (1.3 + R(k, 51) * 0.9) + R(k, 52)), x = 160 - ph * 500, y = 40 + R(k, 53) * 180 + Math.sin(ph * 3 + k) * 4;
      const len = 50 + R(k, 54) * 80, a = Math.sin(Math.PI * ph) * (0.2 + 0.2 * R(k, 55));
      curve([x, y, x + len * 0.5, y - 3, x + len, y + 1]); st(INK, 1.1, a);
    }
    // the rider
    const bob = Math.sin(t * 8.3) * 1.1 + Math.sin(t * 13.1) * 0.5;
    ctx.save(); ctx.translate(-14, 236 + bob);
    const prev = TX; TX = { ox: prev.ox + -14 * prev.s, oy: prev.oy + (236 + bob) * prev.s, s: prev.s };
    grp(0, 0, 1.2, () => bike(t));
    TX = prev; ctx.restore();
  }
  function bike(t) {
    const C1 = INK;
    // wheels: tyre, rim, hub, turning spokes
    [[-86, 0], [86, 0]].forEach(([x, y], j) => {
      circ(x, y, 38); st(C1, 2.0, 0.95); circ(x, y, 31); st(C1, 1.0, 0.5); circ(x, y, 5); st(C1, 1.3, 0.8);
      ctx.beginPath(); const rot = -t * 9 + j;
      for (let s = 0; s < 5; s++) { const a = rot + s * TAU / 5; ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); ctx.lineTo(x + Math.cos(a + 0.18) * 30, y + Math.sin(a + 0.18) * 30); }
      st(C1, 0.9, 0.45);
    });
    path([-86, 0, -24, -14]); st(C1, 1.7, 0.9);                                       // swingarm
    curve([-128, -16, -60, -10, -26, -6]); st(C1, 1.4, 0.65); path([-128, -16, -138, -18]); st(C1, 2.4, 0.65);   // exhaust
    ctx.beginPath(); ctx.moveTo(-28, -8); ctx.lineTo(-30, -36); ctx.lineTo(10, -42); ctx.lineTo(30, -24); ctx.lineTo(18, -2); ctx.closePath(); st(C1, 1.4, 0.75);   // engine
    path([-14, -36, -6, -16, 12, -14]); st(C1, 1, 0.45);
    curve([-96, -50, -70, -55, -36, -48]); st(C1, 1.7, 0.95);                        // seat
    path([-96, -50, -118, -44, -110, -36, -80, -38]); st(C1, 1.4, 0.8); path([-80, -38, -86, 0]); st(C1, 1.3, 0.6);   // tail
    path([86, 0, 52, -78]); st(C1, 1.8, 0.95); path([90, -2, 56, -80]); st(C1, 1, 0.5);   // fork
    path([52, -78, 42, -88, 36, -90]); st(C1, 1.8, 0.95);                          // bars
    ctx.beginPath(); ctx.ellipse(66, -66, 7, 10, -0.4, 0, TAU); st(C1, 1.4, 0.8);    // headlight
    curve([60, -40, 76, -46, 108, -36]); st(C1, 1.3, 0.55);                         // fender
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gb = ctx.createLinearGradient(70, 0, 250, 0);
    gb.addColorStop(0, 'rgba(255,205,150,0.12)'); gb.addColorStop(1, 'rgba(255,205,150,0)'); ctx.fillStyle = gb;
    ctx.beginPath(); ctx.moveTo(72, -68); ctx.lineTo(250, -100); ctx.lineTo(250, -8); ctx.closePath(); ctx.fill(); ctx.restore();
    // rider: one silhouette leaning into the wind; tank in front of his knee
    const hip = [-52, -62], sh = [0, -118], hd = [22, -139], kn = [12, -56], ft = [-4, -18];
    const fill = '#0c0f19', col = '#e3e9f4';
    fig([cap(hip, sh, 13, 15.5), cap([4, -120], [15, -129], 6, 5.5), disc(hd, 14.5), cap(hip, kn, 12.5, 9), cap(kn, ft, 8.5, 6), cap(ft, [13, -14], 5, 4)], fill, col, 1.7);
    curve([-34, -44, -10, -66, 26, -66, 44, -52]); st(C1, 1.7, 0.95); path([-34, -44, 40, -44]); st(C1, 1.1, 0.5);   // tank
    const el = [22, -95], hn = [36, -90];
    fig([cap([2, -116], el, 7, 6), cap(el, hn, 5.5, 4.5)], fill, col, 1.6);
    // hair in the wind: strands from the back of the head streaming back, never still
    for (let s = 0; s < 6; s++) {
      const y0 = hd[1] - 11 + s * 3.4, x0 = hd[0] - 9 - s * 1.2, len = 26 + s * 5 + Math.sin(t * 11 + s) * 4;
      const w1 = Math.sin(t * 17 + s * 1.9) * 3, w2 = Math.sin(t * 23 + s * 2.7) * 4;
      curve([x0, y0, x0 - len * 0.4, y0 - 4 + w1, x0 - len * 0.75, y0 + w2, x0 - len, y0 - 2 + w1]); st(C1, 1.1, 0.75);
    }
    const fl = Math.sin(t * 15) * 3;                                                // jacket hem flapping
    curve([-38, -84, -54, -80 + fl, -66, -78 - fl * 0.6]); st(C1, 1.2, 0.6);
    // warm particles torn off by the wind (hair, jacket) streaming back
    for (let i = 0; i < 170; i++) {
      const ph = frac(t * (0.8 + R(i, 61) * 0.9) + R(i, 62)), x0 = 0 + (R(i, 63) - 0.5) * 40, y0 = -110 + (R(i, 64) - 0.5) * 70;
      const x = x0 - ph * (200 + R(i, 65) * 140), y = y0 - ph * 12 * R(i, 66) + Math.sin(ph * 7 + R(i, 67) * 20) * 5 * ph;
      const a = Math.pow(1 - ph, 1.4) * (0.4 + 0.6 * R(i, 68));
      for (let s = 0; s < 3; s++) bp(x + s * 2.6, y, a * (1 - s * 0.3), mix3(GOLD, FREEL, ph));
    }
  }

  // ---------------------------------------------------------------- card 2: the gym, a coach laughing (warm window light)
  const SKY2 = [-175, -70, -175, -112, -150, -112, -150, -132, -122, -132, -122, -98, -98, -98, -98, -150, -70, -150, -70, -120, -44, -120, -44, -104, -10, -104, -10, -138, 22, -138, 22, -94, 50, -94, 50, -126, 86, -126, 86, -108, 112, -108, 112, -160, 140, -160, 140, -116, 175, -116, 175, -70];
  function card2(t) {
    let g = ctx.createLinearGradient(0, -HH, 0, HH); g.addColorStop(0, '#0d1220'); g.addColorStop(0.6, '#121420'); g.addColorStop(1, '#0a0d16');
    ctx.fillStyle = g; ctx.fillRect(-HW, -HH, 2 * HW, 2 * HH);
    // the window, evening light through it
    g = ctx.createLinearGradient(0, -340, 0, -70); g.addColorStop(0, 'rgba(110,110,150,0.10)'); g.addColorStop(1, 'rgba(255,160,100,0.22)');
    ctx.fillStyle = g; ctx.fillRect(-175, -340, 350, 270);
    path(SKY2); st(INK, 1.1, 0.28);
    ctx.beginPath(); ctx.rect(-175, -340, 350, 270); st(INK, 1.5, 0.55);
    path([-58, -340, -58, -70]); st(INK, 1.2, 0.4); path([58, -340, 58, -70]); st(INK, 1.2, 0.4); path([-175, -205, 175, -205]); st(INK, 1.2, 0.4);
    L2(-185, -64, 185, -64, INK, 1.1, 0.3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';                         // beams to the floor
    g = ctx.createLinearGradient(0, -70, 0, 240); g.addColorStop(0, 'rgba(255,170,110,0.10)'); g.addColorStop(1, 'rgba(255,170,110,0.015)'); ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-175, -70); ctx.lineTo(-58, -70); ctx.lineTo(70, 232); ctx.lineTo(-80, 232); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-58, -70); ctx.lineTo(58, -70); ctx.lineTo(176, 232); ctx.lineTo(70, 232); ctx.closePath(); ctx.globalAlpha *= 0.7; ctx.fill();
    ctx.restore();
    L2(-HW, 232, HW, 232, INK, 1.2, 0.42);
    ctx.beginPath(); for (let x = -260; x <= 260; x += 75) { ctx.moveTo(x * 0.85, 232); ctx.lineTo(x * 1.7, HH); } st(INK, 1, 0.09);
    path([-150, 246, 150, 246, 190, 300, -190, 300, -150, 246]); st(INK, 1.1, 0.22);
    path([-214, -10, -214, 232]); st(INK, 1.2, 0.38); path([-160, 40, -160, 232]); st(INK, 1.2, 0.38);   // rack
    path([-222, 70, -150, 70]); st(INK, 1.2, 0.38); path([-222, 150, -150, 150]); st(INK, 1.2, 0.38);
    [[-198, 61], [-174, 61], [-198, 141], [-174, 141]].forEach(([x, y]) => { circ(x - 6, y, 7); st(INK, 1.1, 0.38); circ(x + 6, y, 7); st(INK, 1.1, 0.38); });
    grp(20, 232, 1.12, () => gymPeople(t));
    // dust in the beams
    for (let i = 0; i < 150; i++) {
      const ph = frac(t * (0.03 + 0.05 * R(i, 71)) + R(i, 72)), y = 228 - ph * 300, bx = -175 + (y + 70) * 0.42;
      const x = bx + R(i, 73) * 230 + Math.sin(t * 0.4 + R(i, 74) * 20) * 9;
      bp(x, y, Math.sin(Math.PI * ph) * (0.25 + 0.6 * R(i, 75)) * 0.75, mix3(GOLD, FREEL, R(i, 76) * 0.6));
    }
  }
  function gymPeople(t) {
    const fill = '#10121d', col = '#e3e9f4', warm = '#f4dcc2';
    // the student squats (a closed-form cycle; two-link legs)
    const sq = 0.5 - 0.5 * Math.cos(t * TAU / 2.7), ank = [-60, 218];
    const hip = [-92 - 24 * sq, 106 + 60 * sq], knee = ik(hip, ank, 64, 62, -1);
    const th = 0.14 + 0.56 * sq, sh = [hip[0] + Math.sin(th) * 74, hip[1] - Math.cos(th) * 74];
    const nk = [sh[0] + Math.sin(th) * 12 + 2, sh[1] - Math.cos(th) * 12 - 2], hd = [sh[0] + Math.sin(th) * 26 + 5, sh[1] - Math.cos(th) * 26 - 5];
    fig([cap(hip, knee, 12.5, 9), cap(knee, ank, 8.5, 6), cap(ank, [ank[0] + 22, ank[1] + 5], 5, 4), cap(hip, sh, 14, 16), cap(sh, nk, 6.5, 6), disc(hd, 13)], fill, col, 1.7);
    const pc = [sh[0] - 4, sh[1] - 4];
    circ(pc[0], pc[1], 34); ctx.save(); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); st(col, 1.8, 0.95);
    circ(pc[0], pc[1], 26); st(col, 1, 0.4); circ(pc[0], pc[1], 4.5); st(col, 1.4, 0.8);
    const el = [sh[0] + 20 + 4 * sq, sh[1] + 18], hn = [pc[0] + 13, pc[1] + 3];
    fig([cap([sh[0] + 2, sh[1] + 2], el, 6.5, 5.5), cap(el, hn, 5, 4)], fill, col, 1.6);
    // the coach: front-facing, laughing, loose; one hand counting the reps, the other on the hip
    const lb = Math.sin(t * 5.1) * 1.2, wave = Math.sin(t * TAU / 2.7) * 0.5 + 0.5, hx = 50 - 4 * wave, hy = 66 - 10 * wave;
    const cx = 118;
    fig([cap([cx - 11, 140], [cx - 15, 182], 11, 8.5), cap([cx - 15, 182], [cx - 17, 222], 8, 6.5), cap([cx - 17, 222], [cx - 29, 226], 5, 4),
         cap([cx + 11, 140], [cx + 15, 182], 11, 8.5), cap([cx + 15, 182], [cx + 17, 222], 8, 6.5), cap([cx + 17, 222], [cx + 29, 226], 5, 4),
         blob([cx - 26, 70, cx, 66, cx + 26, 70, cx + 22, 108, cx + 16, 146, cx, 148, cx - 16, 146, cx - 22, 108]),
         cap([cx, 70], [cx, 54 + lb], 6.5, 6.5), disc([cx, 38 + lb], 18)], fill, warm, 1.7);
    path([cx - 18, 144, cx + 18, 144]); st(warm, 1.1, 0.5);                                // belt line
    fig([cap([cx - 22, 76], [cx - 48, 92], 7, 6), cap([cx - 48, 92], [hx, hy], 5.5, 4.5)], fill, warm, 1.6);
    ctx.beginPath(); for (let f = 0; f < 4; f++) { const a = -2.1 + f * 0.33; ctx.moveTo(hx + Math.cos(a) * 3, hy + Math.sin(a) * 3); ctx.lineTo(hx + Math.cos(a) * 12, hy + Math.sin(a) * 12); } st(warm, 1.2, 0.85);
    fig([cap([cx + 22, 76], [cx + 40, 106], 7, 6), cap([cx + 40, 106], [cx + 20, 130], 5.5, 4.5)], fill, warm, 1.6);
    ctx.save(); ctx.translate(cx, 38 + lb); ctx.rotate(-0.16);
    ctx.beginPath(); ctx.arc(0, -2, 18.5, Math.PI * 1.08, Math.PI * 1.96); st(warm, 3.2, 0.75);   // hair
    ctx.beginPath(); ctx.arc(-6.5, 0, 3.4, Math.PI * 1.1, Math.PI * 1.9); st(warm, 1.4, 0.95);    // eyes closed with laughing
    ctx.beginPath(); ctx.arc(6.5, 0, 3.4, Math.PI * 1.1, Math.PI * 1.9); st(warm, 1.4, 0.95);
    ctx.beginPath(); ctx.arc(0, 4.5, 7.5, Math.PI * 0.12, Math.PI * 0.88); st(warm, 1.6, 0.95);  // the smile
    ctx.restore();
    glowDisc(cx, 40, 130, '255,190,130', 0.08);
  }

  // ---------------------------------------------------------------- card 3: a mountain-top campfire (fire, sparks)
  const RIDGE1 = [-223, -60, -190, -86, -150, -70, -120, -112, -84, -96, -50, -128, -20, -104, 14, -118, 50, -84, 90, -100, 130, -72, 170, -92, 223, -62];
  const RIDGE2 = [-223, 30, -170, 6, -120, 26, -60, -10, -10, 18, 40, 4, 100, 30, 160, 12, 223, 34];
  const FX = 40, FY = 206;
  const flick = t => 0.86 + 0.08 * Math.sin(t * 13.3) + 0.06 * Math.sin(t * 29.1 + 1.3);
  function card3(t) {
    const fl = flick(t);
    let g = ctx.createLinearGradient(0, -HH, 0, HH); g.addColorStop(0, '#060a15'); g.addColorStop(0.55, '#0c1120'); g.addColorStop(1, '#0a0b12');
    ctx.fillStyle = g; ctx.fillRect(-HW, -HH, 2 * HW, 2 * HH);
    for (let i = 0; i < 90; i++) { const x = (R(i, 81) - 0.5) * 2 * HW, y = -HH + 70 + R(i, 82) * 300 + R(i, 83) * R(i, 83) * 120; bp(x, y, 0.15 + 0.75 * Math.pow(R(i, 84), 3), COOLW); }
    ctx.beginPath(); ctx.arc(130, -300, 22, Math.PI * 0.35, Math.PI * 1.65); ctx.arc(140, -304, 19, Math.PI * 1.55, Math.PI * 0.45, true); st(INK, 1.4, 0.7);
    curve(RIDGE1); st(INK, 1.2, 0.26);
    curve(RIDGE2); st(INK, 1.3, 0.4);
    ctx.fillStyle = '#0a0d17'; ctx.beginPath(); ctx.moveTo(-HW, 214); ctx.quadraticCurveTo(0, 190, HW, 218); ctx.lineTo(HW, HH); ctx.lineTo(-HW, HH); ctx.fill();
    path([128, 210, 168, 150, 208, 210]); st(INK, 1.4, 0.5); path([168, 150, 168, 210]); st(INK, 1, 0.28);   // tent
    curve([168, 164, 158, 190, 148, 210]); st('#ffcf9a', 1.2, 0.4 * fl);
    // the fire's light on everything
    glowDisc(FX, FY - 40, 360, '255,140,70', 0.17 * fl);
    ctx.beginPath(); ctx.moveTo(-HW, 214); ctx.quadraticCurveTo(0, 190, HW, 218); st(INK, 1.3, 0.5);
    grp(-40, 214, 1.32, () => campfire(t, fl));
  }
  function campfire(t, fl) {
    const fill = '#0b0e18', col = '#dfe5f0';
    const litC = css(mix3(INKL, KIT.rgb('#ffc58e'), 0.6 * fl)), rim = css(mix3(KIT.rgb('#ffd6a6'), FREEL, 0.25));
    curve([-180, 208, -112, 204, -48, 210]); st(INK, 1.5, 0.65); curve([-180, 220, -112, 218, -48, 222]); st(INK, 1.2, 0.45);   // the log
    ctx.beginPath(); ctx.ellipse(-48, 216, 4, 6, 0, 0, TAU); st(INK, 1.2, 0.55);
    // her (behind), leaning her head on his shoulder; long hair down her back
    const hipG = [-128, 202], shG = [-104, 142], hdG = [-89, 122], knG = [-82, 184], ftG = [-86, 224];
    fig([cap(hipG, shG, 12, 13.5), cap([-96, 132], [-92, 126], 5, 5), disc(hdG, 12.5), cap([-95, 116], [-110, 160], 9, 5), cap(hipG, knG, 11, 8.5), cap(knG, ftG, 7.5, 5.5), cap(ftG, [-73, 227], 4.5, 4)], fill, col, 1.6);
    // him
    const hipM = [-86, 200], shM = [-74, 134], hdM = [-59, 106], knM = [-34, 180], ftM = [-30, 224];
    fig([cap(hipM, shM, 13.5, 15), cap([-71, 126], [-64, 116], 6, 5.5), disc(hdM, 14), cap(hipM, knM, 12, 9), cap(knM, ftM, 8, 6), cap(ftM, [-16, 227], 5, 4)], fill, col, 1.7);
    const elM = [-52, 166];
    fig([cap([-72, 138], elM, 6.5, 5.5), cap(elM, [-38, 178], 5, 4)], fill, col, 1.6);
    fig([cap([-102, 146], [-84, 166], 6, 5), cap([-84, 166], [-62, 160], 4.8, 4)], fill, col, 1.5);   // her arm through his
    // the fire lights their faces and knees (warm rim on the fire side)
    ctx.beginPath(); ctx.arc(hdM[0], hdM[1], 14.8, -1.25, 1.2); st(rim, 2.1, 0.95 * fl);
    ctx.beginPath(); ctx.arc(hdG[0], hdG[1], 13.3, -1.0, 1.0); st(rim, 1.9, 0.8 * fl);
    ctx.beginPath(); ctx.arc(knM[0], knM[1], 9.6, -1.6, 0.4); st(rim, 1.6, 0.7 * fl);
    ctx.beginPath(); ctx.arc(-38, 178, 4.8, -1.5, 1.2); st(rim, 1.4, 0.6 * fl);
    // logs, stones
    path([FX - 30, FY + 12, FX + 30, FY - 2]); st(litC, 2.2, 0.85); path([FX - 28, FY - 2, FX + 32, FY + 12]); st(litC, 2.2, 0.85);
    ctx.beginPath(); for (let s = 0; s < 7; s++) { const a = Math.PI * (0.05 + s * 0.15), x = FX + Math.cos(a) * 42, y = FY + 12 + Math.sin(a) * 8; ctx.moveTo(x + 7, y); ctx.ellipse(x, y, 7, 4.5, 0, 0, TAU); } st(INK, 1.1, 0.5);
    glowDisc(FX, FY - 22, 120, '255,180,110', 0.16 * fl);
    // flame (PX): particles rise and narrow, hot at the root, orange at the tips
    for (let i = 0; i < 1100; i++) {
      const r1 = R(i, 91), r2 = R(i, 92), r3 = R(i, 93), r4 = R(i, 94), r5 = R(i, 95);
      const ph = frac(t * (1.25 + r1 * 1.1) + r2), h = ph * (34 + 58 * r3 * r3), wd = Math.pow(1 - ph, 0.9) * (12 + 13 * r4);
      const x = FX + (r5 - 0.5) * 2 * wd + Math.sin(t * 6.5 + r1 * 20) * 3.5 * ph + Math.sin(t * 2.1) * 2 * ph;
      bp(x, FY + 2 - h, Math.pow(1 - ph, 1.3) * (0.35 + 0.65 * r4) * fl, mix3(HOT, FREEL, Math.min(1, ph * 1.4)));
    }
    for (let i = 0; i < 50; i++) {                                     // sparks, rising and wandering
      const r1 = R(i, 101), r2 = R(i, 102), r3 = R(i, 103), r4 = R(i, 104), r5 = R(i, 105);
      const ph = frac(t * (0.2 + 0.28 * r1) + r2), rise = ph * (160 + 190 * r3);
      const x = FX + (r4 - 0.5) * 24 + Math.sin(ph * 5 + r5 * 10) * (12 + 24 * r3) * ph, y = FY - 20 - rise;
      const a = Math.pow(Math.sin(Math.PI * Math.min(1, ph * 1.15)), 0.7) * (0.5 + 0.5 * Math.sin(t * 9 + i)) * (0.6 + 0.4 * r5);
      for (let s = 0; s < 3; s++) bp(x, y + s * 2, a * (1 - s * 0.32) * 1.6, mix3(GOLD, FREEL, ph));
    }
    for (let i = 0; i < 60; i++) {                                     // embers on the logs
      const x = FX + (R(i, 111) - 0.5) * 54, y = FY + 2 + (R(i, 112) - 0.5) * 12;
      bp(x, y, (0.3 + 0.7 * R(i, 113)) * (0.6 + 0.4 * Math.sin(t * (2 + R(i, 114) * 3) + i)), FREEL);
    }
  }
  const CARDS = [null, card1, card2, card3];

  // ---------------------------------------------------------------- the phone
  function spill(light, youLight) {
    if (light > 0.002) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(SCX, SCY, 60, SCX, SCY, 1000);
      g.addColorStop(0, `rgba(105,145,225,${0.12 * light})`); g.addColorStop(0.35, `rgba(80,115,195,${0.05 * light})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    glowDisc(YOU.x, YOU.y - 80, 330, '120,160,235', 0.07 * (youLight == null ? light : youLight));
  }
  function phoneFrame(a) {
    if (a <= 0.002) return;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.beginPath(); ctx.roundRect(PHN.x, PHN.y, PHN.w, PHN.h, PHN.r); st('#c9d7f2', 1.6, 0.6);
    ctx.beginPath(); ctx.roundRect(PHN.x + 4, PHN.y + 4, PHN.w - 8, PHN.h - 8, PHN.r - 4); st('#c9d7f2', 0.8, 0.16);
    path([PHN.x - 2.5, PHN.y + 180, PHN.x - 2.5, PHN.y + 240]); st('#c9d7f2', 2.2, 0.45);
    path([PHN.x - 2.5, PHN.y + 262, PHN.x - 2.5, PHN.y + 322]); st('#c9d7f2', 2.2, 0.45);
    path([PHN.x + PHN.w + 2.5, PHN.y + 210, PHN.x + PHN.w + 2.5, PHN.y + 305]); st('#c9d7f2', 2.2, 0.45);
    ctx.restore();
  }
  const scrPath = () => { ctx.beginPath(); ctx.roundRect(SCR.x, SCR.y, SCR.w, SCR.h, SCR.r); };
  /* the screen at scroll s. o: light (backlight 0..1, applied as a dark veil so silhouettes stay opaque), s, t (absolute
     seconds for motion), lt + swipes (thumb), clock, caps, cardT0, on (lock-screen reveal), squash (CRT), flash */
  function screen(o) {
    const light = o.light; if (light <= 0.002) return;
    ctx.save(); scrPath(); ctx.clip();
    const sq = o.squash == null ? 1 : Math.max(0.004, o.squash);
    if (sq < 1) { ctx.translate(SCX, SCY); ctx.scale(1, sq); ctx.translate(-SCX, -SCY); }
    const g = ctx.createLinearGradient(0, SCR.y, 0, SCR.y + SCR.h); g.addColorStop(0, '#0f1729'); g.addColorStop(1, '#0a1020');
    ctx.fillStyle = g; ctx.fillRect(SCR.x, SCR.y, SCR.w, SCR.h);
    const s = o.s;
    PX.begin();
    for (let i = 0; i < 4; i++) {
      const dy = (i - s) * PITCH; if (Math.abs(dy) >= PITCH) continue;
      ctx.save(); ctx.translate(SCX, SCY + dy); ctx.scale(CS, CS);
      TX = { ox: SCX, oy: SCY + dy, s: CS };
      if (i === 0) lockScreen(o.clock, o.on);
      else { CARDS[i](o.t); cardChrome(o.caps[i - 1], o.t, o.cardT0 ? o.cardT0[i - 1] : 0); }
      TX = { ox: 0, oy: 0, s: 1 };
      ctx.restore();
    }
    if (o.swipes) for (const t0 of o.swipes) thumb(o.lt - t0);
    if (sq < 1) for (let i = 0; i < bn; i++) BY[i] = SCY + (BY[i] - SCY) * sq;
    bflush(0.6, 0.5);
    statusBar(o.clock, clamp(s));
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(SCR.x, SCR.y + SCR.h / 2 * (1 - sq), SCR.w, SCR.h * sq); ctx.clip();
    PX.flush({ exposure: 1.5, glow: 1 }); ctx.restore();
    if (light < 1) { ctx.fillStyle = `rgba(4,6,10,${1 - light})`; ctx.fillRect(SCR.x, SCR.y, SCR.w, SCR.h); }
    if (o.flash) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(200,220,255,${o.flash})`; ctx.fillRect(SCR.x, SCR.y, SCR.w, SCR.h); }
    ctx.restore();
  }
  function thumb(u) {                                                   // the soft light of a thumb flicking up
    if (u < -0.16 || u > 0.75) return;
    const env = Math.min(ease.out(prog(u, -0.16, -0.04)), 1 - ease.in(prog(u, 0.22, 0.6)));
    if (env <= 0) return;
    const [fx, fy] = fingerPos(Math.max(0, u));
    glowDisc(fx, fy, 70, '200,220,255', 0.16 * env);
    const n = 70;
    for (let k = 0; k < n; k++) {
      const tau = u - k * 0.0045; if (tau < 0) break;
      const [x, y] = fingerPos(tau), w = 1 - k / n;
      for (let j = 0; j < 4; j++) bpush(x + (R(k * 4 + j, 121) - 0.5) * 16 * w, y + (R(k * 4 + j, 122) - 0.5) * 10, w * w * env * 0.5, COOLW);
    }
  }

  // ---------------------------------------------------------------- 你, low in the frame, lit by the screen from above
  function you(t, light, o = {}) {
    PX.begin();
    const cl = KIT.you(YOU.x, YOU.y, YOU.size, { lit: (o.lit == null ? 0.18 : o.lit) * light, a: o.a == null ? 1 : o.a, t, breathe: 0.25 });
    if (light > 0.01) {
      const top = YOU.y - YOU.size * 0.55;
      for (let i = 0; i < cl.n; i++) { const v = clamp((cl.Y[i] - top) / (YOU.size * 1.05)); cl.A[i] = Math.pow(1 - v, 2.2); }
      PX.points(cl.X, cl.Y, cl.n, SCRL, { a: 0.3 * light * (o.a == null ? 1 : o.a), A: cl.A, glow: 0.35 });
    }
    PX.flush({ exposure: 1.4 });
  }

  // ================================================================ b01 feed
  T.register('feed', {
    draw(ctx, V, lt, api) {
      const tS = ['swipe1', 'swipe2', 'swipe3'].map(n => at(api, n)), tSt = at(api, 'stare'), tAbs = api.beat.start + lt;
      const on = ease.out(prog(lt, 0.35, 1.05));
      const dim = 1 - 0.3 * sm(prog(lt, tSt + 1.4, tSt + 5.0));          // the screen auto-dims while you stare
      const light = on * dim;
      const s = tS.reduce((a, t0) => a + mom(lt - t0), 0);
      spill(light);
      you(lt, light, { a: on });
      phoneFrame(on);
      screen({ light, s, t: tAbs, lt, swipes: tS, clock: V.lines.clock, caps: V.lines.cards, on: prog(lt, 0.45, 1.6), cardT0: tS.map(x => x + api.beat.start) });
      KIT.caption(V.lines.stare, prog(lt, tSt + 0.7, tSt + 3.4), { family: F.hand, size: 52 });
    },
    cues(V, api) {
      const t = n => at(api, n);
      return [
        { t: 0.35, type: 'click' },
        ...['swipe1', 'swipe2', 'swipe3'].map(n => ({ t: t(n), type: 'swipe' })),
        { t: t('stare'), type: 'hush' },
      ];
    },
  });

  // ================================================================ b02 answers
  const SH = { x: 170, y: 420, w: 740, h: 930 };
  T.register('answers', {
    draw(ctx, V, lt, api) {
      const tF = at(api, 'facts'), tFi = at(api, 'fill'), tR = at(api, 'right'), tG = at(api, 'gray');
      const gray = sm(prog(lt, tG + 0.3, tG + 2.8));
      const up = ease.inOut(prog(lt, tFi - 0.15, tFi + 1.0));
      const pull = 1 - 0.035 * sm(prog(lt, tG, tG + 4.5));             // after it greys, the paper recedes a little
      ctx.save(); ctx.translate(W / 2, 860); ctx.scale(pull, pull); ctx.translate(-W / 2, -860);
      // three facts, each ticked by the red pen, then they move up into one row above the sheet
      V.lines.facts.forEach((f, i) => {
        const ti = tF + 0.3 + i * 1.25, k = prog(lt, ti, ti + 0.9);
        if (k <= 0) return;
        const xa = 490, ya = 800 + i * 130, xb = 210 + i * 290 + 34, yb = 352;
        const x = lerp(xa, xb, up), y = lerp(ya, yb, up), sc = lerp(1, 0.62, up);
        ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
        KIT.type(f, 0, 0, { size: 56, family: F.serif, weight: 400, align: 'left', color: gray > 0 ? `rgb(${mix3(KIT.rgb(C.ink), KIT.rgb(C.gray), gray * 0.8).map(v => Math.round(v * 255)).join(',')})` : C.ink, k, alpha: lerp(1, 0.8, up), spacing: 4 });
        KIT.pen('check', -52, -20, 46, prog(lt, ti + 0.75, ti + 1.1), { gray, seed: 3 + i, width: 4.4 });
        ctx.restore();
      });
      // the answer sheet fills itself, row by row, every bubble right
      const sk = ease.out(prog(lt, tFi + 0.25, tFi + 1.1));
      const fill = prog(lt, tFi + 1.0, tFi + 4.0);
      KIT.sheet(SH.x, SH.y, SH.w, SH.h, { rows: 20, k: sk, fill, marks: clamp(fill - 0.03), gray, title: '答题卡 · 人生' });
      KIT.pen('score', SH.x + SH.w - 92, SH.y + 50, 42, prog(lt, tFi + 4.2, tFi + 4.9), { text: '100', gray, seed: 11 });
      ctx.restore();
      // the drain: a cold veil over the paper (never over the voice)
      if (gray > 0) { ctx.save(); ctx.globalAlpha *= 0.22 * gray; ctx.fillStyle = '#06080d'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      KIT.caption([V.lines.right], prog(lt, tR + 0.15, tR + 1.5));
      KIT.caption([V.lines.gray], prog(lt, tG + 0.9, tG + 3.1), { y: 1460 + 84 });
    },
    cues(V, api) {
      const t = n => at(api, n), out = [];
      for (let i = 0; i < 3; i++) out.push({ t: t('facts') + 0.3 + i * 1.25 + 0.75, type: 'pen' });
      out.push({ t: t('fill') + 1.0, type: 'ticks', dur: 3.0, n: 20, p0: 0.45, p1: 0.75 });
      out.push({ t: t('fill') + 4.2, type: 'pen' });
      out.push({ t: t('gray'), type: 'hush' });
      return out;
    },
  });

  // b03 shows b01's last card again: its captions and video clock come from b01 in the timeline
  function feedInfo() {
    const b = T.TL && T.TL.beats.find(x => x.visual.type === 'feed'); if (!b) return { caps: ['', '', ''], t0: [0, 0, 0] };
    const st = n => (b.visual.steps.find(s => s.show === n) || { t: 0 }).t;
    return { caps: b.visual.lines.cards, t0: ['swipe1', 'swipe2', 'swipe3'].map(st), clock: b.visual.lines.clock };
  }
  // ================================================================ b03 darkq
  // the question as particles (cached), and where each starts: all of them packed into the screen's last dot
  let QC = null;
  function qCloud(lines) {
    if (QC) return QC;
    const size = 54, gap = size * 1.55, y0 = 960 - gap / 2, sp = size * 0.04;
    const xs = [], ys = [], ord = [];
    lines.forEach((l, li) => {
      const c = PX.text(l, { size, family: F.serif, weight: 400, x: W / 2, y: y0 + li * gap, step: 1.25, spacing: sp, seed: 31 + li });
      let x0 = 1e9, x1 = -1e9; for (let i = 0; i < c.n; i++) { x0 = Math.min(x0, c.X[i]); x1 = Math.max(x1, c.X[i]); }
      for (let i = 0; i < c.n; i++) { xs.push(c.X[i]); ys.push(c.Y[i]); ord.push(li * 0.5 + 0.5 * (c.X[i] - x0) / (x1 - x0)); }
    });
    const n = xs.length, X = Float32Array.from(xs), Y = Float32Array.from(ys), D = Float32Array.from(ord);
    const SX = new Float32Array(n), SY = new Float32Array(n);
    for (let i = 0; i < n; i++) { const r = Math.sqrt(R(i, 131)) * 5, a = R(i, 132) * TAU; SX[i] = SCX + Math.cos(a) * r; SY[i] = SCY + Math.sin(a) * r * 0.8; }
    return (QC = { n, X, Y, D, SX, SY, ox: new Float32Array(n), oy: new Float32Array(n), oa: new Float32Array(n) });
  }
  T.register('darkq', {
    draw(ctx, V, lt, api) {
      const tO = at(api, 'off'), tD = at(api, 'dark'), tQ = at(api, 'q'), tAbs = api.beat.start + lt;
      const tC = tO + 4 * KIT.beat.BEAT, u = lt - tC;                       // the CRT switch-off
      const base = 0.7;                                                     // the dimmed screen from b01's stare
      const squash = u < 0 ? 1 : 1 - ease.in(clamp(u / 0.17));
      const lineK = clamp((u - 0.17) / 0.26);                                // the line shrinking to a dot
      const light = u < 0 ? base : u < 0.17 ? base : 0;
      const frameA = u < 0 ? base / 0.7 : 1 - ease.out(clamp(u / 0.5));
      const youLight = u < 0 ? base : Math.max(0, 1 - ease.out(clamp(u / 0.6))) * base;
      const qk = prog(lt, tQ, tQ + 4.2);
      spill(u < 0.17 ? base : youLight * 0.6, youLight);
      // 你: lit by the screen, then only a faint shape; the question, when it comes, lends it a breath of light
      const youA = lerp(1, 0.42, ease.inOut(clamp(u / 1.4)));
      you(lt, Math.max(youLight, 0.12 * sm(qk)), { a: youA, lit: u < 0 ? 0.18 : 0.5 });
      phoneFrame(frameA);
      const fi = feedInfo();
      if (u < 0.17) screen({ light, s: 3, t: tAbs, lt, clock: fi.clock, caps: fi.caps, cardT0: fi.t0, on: 1, squash, flash: u > 0 ? 0.55 * ease.in(clamp(u / 0.17)) : 0 });
      // the line, the dot, the residue, the question: one set of particles
      const q = qCloud(V.lines.q), n = q.n;
      PX.begin();
      if (u >= 0.12 && u < 0.43) {                                         // the bright line collapsing to a dot
        const wd = lerp(SCR.w * 0.5, 3, ease.in(lineK)), hgt = lerp(2.5, 2, lineK), a = lerp(1, 1.4, lineK);
        const m = 900; const out = PX.buf(m, 61);
        for (let i = 0; i < m; i++) { out.X[i] = SCX + (R(i, 141) * 2 - 1) * wd; out.Y[i] = SCY + (R(i, 142) - 0.5) * hgt * 2; out.A[i] = 1; }
        PX.points(out.X, out.Y, m, [0.85, 0.92, 1], { a: 0.5 * a * (wd > 40 ? 1 : 1.6), A: out.A, glow: 0.7 });
      }
      if (u >= 0.38) {
        // dot brightness: a flare as the line closes, decaying to a faint, breathing residue that never quite dies
        const e = 0.06 + 0.94 * Math.exp(-(u - 0.38) / 0.45), br = 1 + 0.15 * Math.sin(tAbs * 1.7);
        const rad = 1 + 1.8 * ease.out(clamp((u - 0.38) / 3));            // the residue loosens a little
        for (let i = 0; i < n; i++) {
          const kk = ease.inOut(clamp((lt - tQ - q.D[i] * 2.4 - R(i, 133) * 0.35) / 1.35));
          const sx = SCX + (q.SX[i] - SCX) * rad + Math.sin(tAbs * 0.4 + R(i, 134) * 30) * 1.2, sy = SCY + (q.SY[i] - SCY) * rad + Math.cos(tAbs * 0.33 + R(i, 135) * 30) * 1.2;
          const sw = Math.sin(kk * Math.PI) * (30 + 50 * R(i, 136));          // a gentle sideways arc in flight
          q.ox[i] = lerp(sx, q.X[i], kk) + sw * (R(i, 137) - 0.5) * 2 + Math.sin(tAbs * 0.9 + i) * 0.5 * kk;
          q.oy[i] = lerp(sy, q.Y[i], kk) + Math.cos(tAbs * 0.8 + i) * 0.5 * kk;
          q.oa[i] = lerp(e * br * 0.045, 0.5, kk);
        }
        PX.points(q.ox, q.oy, n, [0.84, 0.9, 1], { a: 0.5, A: q.oa, glow: 0.65 });
      }
      PX.flush({ exposure: 1.5, glow: 1.2 });
      // the voice
      const outO = ease.in(prog(lt, tC + 0.25, tC + 1.4));
      KIT.caption([V.lines.off], prog(lt, tO + 0.4, tO + 2.4), { family: F.hand, size: 52, out: outO });
      KIT.caption(V.lines.q, prog(lt, tQ + 1.3, tQ + 4.4), { at: 'mid', color: '#e9eef8' });
    },
    cues(V, api) {
      const t = n => at(api, n), tC = t('off') + 4 * KIT.beat.BEAT;
      return [{ t: tC, type: 'off' }, { t: t('dark'), type: 'hush' }, { t: t('q'), type: 'glow' }, { t: t('q') + 2.6, type: 'title' }];
    },
  });
})();
