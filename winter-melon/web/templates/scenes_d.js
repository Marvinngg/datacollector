/* Scenes, part D: note (s12), city (s13), dusk (s14), end (s15).
 * Local helpers (kept here so scene.js stays untouched):
 *  - reach(): 2-link arm IK that mirrors the skeleton in S.person, so a hand can be put on a target point
 *  - opaque(): scene.js helpers (person, melon, light, steam, sun, fog) set ctx.globalAlpha absolutely and so ignore
 *    the beat fade; these scenes draw at full opacity and lay the fade on top as a dark veil instead. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng } = K;
  const TAU = Math.PI * 2;
  const sayCues = api => api.steps.filter(s => s.say).map(s => ({ t: s.lt, type: 'say' }));
  const P01 = (lt, a, b, e = ease.inOut) => e(prog(lt, a, b));

  // draw the scene opaque, then apply the beat's fade as a veil (see header)
  function opaque(fn) {
    const a0 = ctx.globalAlpha; ctx.globalAlpha = 1;
    fn();
    if (a0 < 1) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1 - a0; ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    ctx.globalAlpha = a0;
  }
  function veil(a, col = '#000') { if (a <= 0) return; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = clamp(a); ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore(); }

  // ---- arm IK matching S.person's skeleton: returns [shoulder, elbow] angles that put the hand at (tx, ty)
  const LEG = { qin: 0.47, xiao: 0.5, wang: 0.45, lin: 0.5, kid: 0.42 }, BEND0 = { qin: 0.26 };
  function shoulderOf(who, x, y, h, o = {}) {
    const f = o.facing || 1, legL = h * LEG[who], crouch = o.crouch || 0, sit = o.sit || 0;
    const hip = [x, y - legL * (1 - 0.32 * crouch) + (sit ? h * 0.2 * sit : 0)];
    const bend = (BEND0[who] || 0) + (o.bend || 0), torL = h * 0.3;
    return { so: [hip[0] + Math.sin(bend) * torL * f, hip[1] - Math.cos(bend) * torL + h * 0.035], bend, f };
  }
  function reach(who, x, y, h, o, tx, ty) {
    const { so, bend, f } = shoulderOf(who, x, y, h, o), L1 = h * 0.165, L2 = h * 0.175;
    const dx = (tx - so[0]) * f, dy = ty - so[1], d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 2, (L1 + L2) * 0.995);
    const phi = Math.atan2(dx, dy), al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const A = phi - al, ex = Math.sin(A) * L1, ey = Math.cos(A) * L1, B = Math.atan2(dx - ex, dy - ey);
    return [A - bend * 0.3, B - A];
  }
  K.reach = reach;
  // a point drawn inside S.layer(depth) → screen position (for S.say anchors)
  const camPt = (cam, p, depth = 1) => { const z = 1 + (cam.z - 1) * depth; return [W / 2 + (p[0] - W / 2 - cam.x * depth) * z, H / 2 + (p[1] - H / 2 - cam.y * depth) * z]; };
  // a body turning round (about the vertical axis): squeeze, flip, open out. k 0..1 across the turn
  function turned(x, k, f0, f1, fn) {
    const sx = 1 - 0.5 * Math.sin(Math.PI * clamp(k)), f = k < 0.5 ? f0 : f1;
    ctx.save(); ctx.translate(x, 0); ctx.scale(sx, 1); ctx.translate(-x, 0);
    const r = fn(f); ctx.restore();
    const fx = p => [x + (p[0] - x) * sx, p[1]];
    return { head: fx(r.head), hand: fx(r.hand), handB: fx(r.handB), f };
  }
  const quad = (pts, fill, g = ctx) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } };

  // ---- straw: thin curved stalks
  function strawTo(g, x0, y0, w, h, n, seed, tone) {
    const r = rng(seed); g.lineCap = 'round';
    const cols = tone === 'dark' ? ['#7a5a2c', '#6a4b22', '#8e6a34', '#5a3f1c'] : ['#d9b86a', '#e8cf8c', '#c49a4c', '#f1dea0', '#b88c44'];
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * w, y = y0 + r() * h, a = r() * Math.PI, L = 30 + r() * 120, c = (r() - 0.5) * 34;
      g.strokeStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.5 + r() * 0.5; g.lineWidth = 1.2 + r() * 2.8;
      const dx = Math.cos(a) * L / 2, dy = Math.sin(a) * L / 2;
      g.beginPath(); g.moveTo(x - dx, y - dy); g.quadraticCurveTo(x + c * Math.sin(a), y - c * Math.cos(a), x + dx, y + dy); g.stroke();
    }
    g.globalAlpha = 1;
  }

  // ---- a rough right hand seen from above. Origin = the pencil tip (or the pinch point); local +x runs up the pencil.
  //      The hand lies below the pencil (+y) and the forearm leaves at +0.5 rad to it. a = pencil angle on screen.
  const SKIN = '#2b1e16', SKIN_RIM = '#f3c58c';
  function handTop(x, y, a, o = {}) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const fa = 0.5, fx = Math.cos(fa), fy = Math.sin(fa);
    const shapes = (col, grow = 0) => {
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = 128 + grow; ctx.beginPath(); ctx.moveTo(250, 100); ctx.lineTo(250 + fx * 1000, 100 + fy * 1000); ctx.stroke();      // forearm
      ctx.save(); ctx.translate(205, 58); ctx.rotate(fa * 0.8);
      ctx.beginPath(); ctx.ellipse(0, 0, 104 + grow / 2, 76 + grow / 2, 0, 0, TAU); ctx.fill(); ctx.restore();                          // back of the hand
      const fing = (a0, c, b, w) => { ctx.lineWidth = w + grow; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke(); };
      if (o.pinch) {
        fing([170, -6], [90, -14], [40, -4], 29); fing([150, 46], [80, 40], [44, 10], 30);
        fing([175, 72], [128, 86], [112, 64], 29); fing([198, 102], [160, 118], [146, 96], 26);
      } else {
        fing([190, -14], [118, -16], [66, -5], 29);     // index finger on the pencil
        fing([168, 48], [112, 44], [76, 15], 30);       // thumb
        fing([186, 70], [134, 82], [112, 58], 29);      // middle, curled under
        fing([206, 98], [168, 116], [150, 94], 27);     // ring
        fing([228, 122], [196, 140], [180, 120], 23);   // little
      }
    };
    const lift = o.lift || 0, sx = 24 + lift * 30, sy = 30 + lift * 34;
    const toL = (vx, vy) => [Math.cos(-a) * vx - Math.sin(-a) * vy, Math.sin(-a) * vx + Math.cos(-a) * vy];
    const [lx, ly] = toL(sx, sy);
    ctx.save(); ctx.translate(lx, ly); ctx.globalAlpha = 0.3 - lift * 0.08; ctx.filter = 'blur(14px)'; shapes('#000'); if (o.pencil) { ctx.fillStyle = '#000'; ctx.fillRect(0, -7, 330, 14); } ctx.restore();
    if (o.pencil) pencil(0, 330, o.pencilA);
    const [rx, ry] = toL(-3.2, -3.6);
    ctx.save(); ctx.translate(rx, ry); shapes(SKIN_RIM); ctx.restore();
    shapes(SKIN);
    // the jacket sleeve, rolled to mid-forearm
    ctx.save(); ctx.strokeStyle = '#1c1b20'; ctx.lineCap = 'butt'; ctx.lineWidth = 148; ctx.beginPath(); ctx.moveTo(250 + fx * 230, 100 + fy * 230); ctx.lineTo(250 + fx * 1000, 100 + fy * 1000); ctx.stroke();
    { const cx = 250 + fx * 230, cy = 100 + fy * 230; ctx.strokeStyle = 'rgba(255,220,170,0.22)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + fy * 72, cy - fx * 72); ctx.lineTo(cx - fy * 72, cy + fx * 72); ctx.stroke(); } ctx.restore();
    // weathered skin: knuckle creases, a raised vein, a few lines
    ctx.strokeStyle = 'rgba(130,95,64,0.5)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const [kx, ky] of [[150, -6], [140, 50], [152, 78], [170, 104]]) { ctx.beginPath(); ctx.arc(kx, ky, 9, -1.0, 1.0); ctx.stroke(); ctx.beginPath(); ctx.arc(kx + 6, ky, 5, -0.8, 0.8); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(220, 20); ctx.quadraticCurveTo(262, 40, 300, 80); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(230, 60); ctx.lineTo(262, 70); ctx.moveTo(236, 84); ctx.lineTo(270, 92); ctx.stroke();
    // the pencil rests over the web of the hand
    if (o.pencil) { ctx.save(); ctx.beginPath(); ctx.rect(150, -40, 260, 34); ctx.clip(); pencil(0, 330, o.pencilA); ctx.restore(); }
    ctx.restore();
  }
  function pencil(x0, x1, a = 0) {        // along local +x from the graphite tip
    ctx.save(); ctx.rotate(a);
    const w = 15;
    ctx.fillStyle = '#e4c592'; quad([[x0 + 9, -2.5], [x0 + 36, -w / 2], [x0 + 36, w / 2], [x0 + 9, 2.5]]); ctx.fill();
    ctx.fillStyle = '#3a3836'; quad([[x0, 0], [x0 + 10, -2.8], [x0 + 10, 2.8]]); ctx.fill();
    const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2); g.addColorStop(0, '#f2cf62'); g.addColorStop(0.45, '#d9a933'); g.addColorStop(1, '#8a6417');
    ctx.fillStyle = g; ctx.fillRect(x0 + 36, -w / 2, x1 - x0 - 66, w);
    ctx.fillStyle = '#9fa3a3'; ctx.fillRect(x1 - 30, -w / 2 - 0.5, 14, w + 1);
    ctx.fillStyle = '#c77a6a'; ctx.fillRect(x1 - 16, -w / 2 + 0.5, 16, w - 1);
    ctx.restore();
  }

  // ================================================================ s12 note
  // top-down into the gift box: straw, melons, the small one; a rough hand writes the note in pencil; folded, tucked in, flaps closed
  const BOX = { x0: 150, y0: 250, x1: 930, y1: 960 }, FLR = { x0: 214, y0: 314, x1: 866, y1: 896 };
  const PAPER = { x: 520, y: 1262, r: -0.045, w: 560, h: 340 };
  const NOTE_IN = { x: 806, y: 612, r: 0.42, s: 0.56 };
  const noteTable = () => S.cached('d_note_table', W, H, g => {
    g.fillStyle = '#2c1f15'; g.fillRect(0, 0, W, H);
    const r = rng(41), cols = ['#4a3322', '#43301f', '#503826', '#3f2c1d', '#47321f'];
    for (let x = -60, i = 0; x < W + 60; x += 206, i++) {
      g.fillStyle = cols[i % cols.length]; g.fillRect(x + 3, 0, 200, H);
      g.strokeStyle = 'rgba(22,13,6,0.5)'; g.lineWidth = 1.4;
      for (let k = 0; k < 16; k++) {
        const gx = x + 10 + r() * 185; g.globalAlpha = 0.25 + r() * 0.4; g.beginPath(); g.moveTo(gx, 0);
        for (let y = 0; y <= H; y += 30) g.lineTo(gx + Math.sin(y * 0.003 + k * 1.3 + i) * 7, y);
        g.stroke();
      }
      g.globalAlpha = 1; g.fillStyle = '#140c07'; g.fillRect(x, 0, 3, H);
    }
    const lg = g.createRadialGradient(40, 620, 40, 40, 620, 1500); lg.addColorStop(0, 'rgba(255,205,140,0.42)'); lg.addColorStop(0.6, 'rgba(255,190,120,0.1)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    // box shadow on the table (light from the upper left)
    g.save(); g.filter = 'blur(26px)'; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(BOX.x0 + 30, BOX.y0 + 40, BOX.x1 - BOX.x0 + 20, BOX.y1 - BOX.y0 + 20); g.restore();
  });
  const noteBox = () => S.cached('d_note_box', W, H, g => {
    const R = BOX, Fl = FLR;
    quad([[Fl.x0, Fl.y0], [Fl.x1, Fl.y0], [Fl.x1, Fl.y1], [Fl.x0, Fl.y1]], '#4f3820', g);
    const wall = (pts, c0, c1, gx0, gy0, gx1, gy1) => { const gr = g.createLinearGradient(gx0, gy0, gx1, gy1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); quad(pts, gr, g); };
    wall([[R.x0, R.y0], [R.x1, R.y0], [Fl.x1, Fl.y0], [Fl.x0, Fl.y0]], '#6f5132', '#4e3820', 0, R.y0, 0, Fl.y0);         // far (top) wall, in shade
    wall([[R.x0, R.y0], [Fl.x0, Fl.y0], [Fl.x0, Fl.y1], [R.x0, R.y1]], '#664a2d', '#47331d', R.x0, 0, Fl.x0, 0);        // left wall, in shade
    wall([[R.x1, R.y0], [R.x1, R.y1], [Fl.x1, Fl.y1], [Fl.x1, Fl.y0]], '#c49866', '#9a7244', R.x1, 0, Fl.x1, 0);        // right wall, lit
    wall([[R.x0, R.y1], [Fl.x0, Fl.y1], [Fl.x1, Fl.y1], [R.x1, R.y1]], '#b78d5a', '#8f6a3e', 0, R.y1, 0, Fl.y1);        // near wall, lit
    g.save(); g.beginPath(); g.rect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0); g.clip();
    strawTo(g, Fl.x0 - 40, Fl.y0 - 40, Fl.x1 - Fl.x0 + 80, Fl.y1 - Fl.y0 + 80, 2600, 5, 'dark');
    strawTo(g, Fl.x0 - 30, Fl.y0 - 30, Fl.x1 - Fl.x0 + 60, Fl.y1 - Fl.y0 + 60, 2300, 6, 'light');
    g.restore();
    // the cut edge of the cardboard
    g.strokeStyle = '#e0bb84'; g.lineWidth = 7; g.strokeRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
    g.strokeStyle = 'rgba(70,46,22,0.7)'; g.lineWidth = 2; g.strokeRect(R.x0 + 4, R.y0 + 4, R.x1 - R.x0 - 8, R.y1 - R.y0 - 8);
  });
  const noteStraw2 = () => S.cached('d_note_straw2', W, H, g => strawTo(g, FLR.x0, FLR.y0, FLR.x1 - FLR.x0, FLR.y1 - FLR.y0, 60, 9, 'light'));
  // a box flap hinged on one rim edge; th = 0 closed over the opening, PI/2 upright, > PI/2 leaning out
  function noteFlap(side, th, L) {
    const R = BOX, c = Math.cos(th), s = Math.sin(th), e = 30 * s, d = L * c;
    let pts, k;
    if (side === 'L') { pts = [[R.x0, R.y0], [R.x0 + d, R.y0 - e], [R.x0 + d, R.y1 + e], [R.x0, R.y1]]; k = c < 0 ? -0.32 : -0.04; }
    if (side === 'R') { pts = [[R.x1, R.y0], [R.x1 - d, R.y0 - e], [R.x1 - d, R.y1 + e], [R.x1, R.y1]]; k = c < 0 ? 0.12 : 0.02; }
    if (side === 'T') { pts = [[R.x0, R.y0], [R.x0 - e, R.y0 + d], [R.x1 + e, R.y0 + d], [R.x1, R.y0]]; k = c < 0 ? -0.26 : 0.04; }
    if (side === 'B') { pts = [[R.x0, R.y1], [R.x0 - e, R.y1 - d], [R.x1 + e, R.y1 - d], [R.x1, R.y1]]; k = c < 0 ? 0.08 : -0.02; }
    const turning = 1 - Math.abs(c) * 0.6;           // edge-on → darker
    ctx.save();
    const base = c < 0 ? '#9c7446' : '#b58a55', kk = k - turning * 0.18;
    const h0 = [(pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2], h1 = [(pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2];
    const g = ctx.createLinearGradient(h0[0], h0[1], h1[0] + 0.01, h1[1] + 0.01); g.addColorStop(0, S.shade(base, kk - 0.1)); g.addColorStop(1, S.shade(base, kk + 0.06));
    quad(pts, g); ctx.lineJoin = 'round';
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(60,40,20,0.07)'; ctx.lineWidth = 2;   // flutes of the corrugated board
    const ux = pts[3][0] - pts[0][0], uy = pts[3][1] - pts[0][1], ul = Math.hypot(ux, uy);
    for (let t = 0; t < ul; t += 11) { const px = pts[0][0] + ux * t / ul, py = pts[0][1] + uy * t / ul; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + h1[0] - h0[0], py + h1[1] - h0[1]); ctx.stroke(); }
    ctx.restore();
    quad(pts);
    ctx.strokeStyle = 'rgba(40,26,12,0.55)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#e2c08d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.stroke();   // free edge catches light
    ctx.restore();
  }
  function paperPath(w, h) {
    const r = rng(77); ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + 4);
    for (let x = -w / 2; x <= w / 2; x += 12) ctx.lineTo(x, -h / 2 + r() * 9);            // torn edge
    ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
  }
  function paperFace(w, h, back) {
    paperPath(w, h);
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); g.addColorStop(0, back ? '#e6dbbf' : '#f4ecd6'); g.addColorStop(1, back ? '#cfc2a3' : '#e2d6b8');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); paperPath(w, h); ctx.clip();
    ctx.strokeStyle = back ? 'rgba(90,120,170,0.14)' : 'rgba(90,120,170,0.38)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const y = -h / 2 + 70 + i * 78; ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke(); }
    ctx.strokeStyle = back ? 'rgba(200,80,80,0.12)' : 'rgba(200,80,80,0.32)'; const mx = back ? w / 2 - 66 : -w / 2 + 66;
    ctx.beginPath(); ctx.moveTo(mx, -h / 2); ctx.lineTo(mx, h / 2); ctx.stroke();
    ctx.restore();
  }
  // the three handwritten lines, laid out in paper space one character at a time: an old man's uneven pencil hand
  const NOTE_L = [{ x: -214, y: -30, s: 64, r: -0.03, seed: 12 }, { x: -190, y: 50, s: 62, r: 0.035, seed: 23 }, { x: 14, y: 130, s: 58, r: -0.05, seed: 31 }];
  const NOTE_T = [[0.35, 2.05], [2.4, 4.1], [4.4, 5.1]];   // writing times of each line, from the start of "write"
  const layouts = new Map();
  function noteLayout(V) {
    const lines = V.note || ['', '', ''], key = lines.join('|');
    if (layouts.has(key)) return layouts.get(key);
    const out = lines.map((str, i) => {
      const L = NOTE_L[i], r = rng(L.seed * 7 + 3), chars = [...str], res = [];
      ctx.save(); let x = 0;
      for (const ch of chars) {
        const sz = L.s * (0.9 + r() * 0.2); ctx.font = `400 ${sz}px ${F.hand}`;
        const w = ctx.measureText(ch).width, dash = ch === '—';
        res.push({ ch, x, dy: (r() - 0.5) * L.s * 0.16 + x * Math.sin(L.r), rot: dash ? (r() - 0.5) * 0.06 : (r() - 0.5) * 0.2, s: sz, w, sx: 0.92 + r() * 0.16 });
        x += w * (dash ? 0.86 : 0.88 + r() * 0.16);
      }
      ctx.restore(); return res;
    });
    layouts.set(key, out); return out;
  }
  function noteText(V, wt) {
    noteLayout(V).forEach((chars, i) => {
      const L = NOTE_L[i], k = prog(wt, NOTE_T[i][0], NOTE_T[i][1]), n = chars.length;
      chars.forEach((c, j) => {
        const kj = clamp(k * n - j); if (kj <= 0) return;
        ctx.save(); ctx.translate(L.x + c.x + c.w / 2, L.y + c.dy); ctx.rotate(c.rot); ctx.scale(c.sx, 1);
        S.hand(c.ch, -c.w / 2, 0, c.s, kj, { color: '#1c1a19', seed: L.seed + j });
        ctx.globalAlpha = 0.25; S.hand(c.ch, -c.w / 2 + 1.2, 0.8, c.s, kj, { color: '#4a4744', seed: L.seed + j }); ctx.globalAlpha = 1;
        ctx.restore();
      });
    });
  }
  // where the pencil tip is at writing time wt (paper space)
  function tipAt(V, wt) {
    const lay = noteLayout(V);
    const pos = (i, k) => {
      const L = NOTE_L[i], chars = lay[i], n = chars.length || 1, j = Math.min(n - 1, Math.floor(k * n)), fr = k * n - j, c = chars[j];
      return c ? [L.x + c.x + c.w * (0.15 + 0.7 * fr), L.y + c.dy - c.s * 0.34] : [L.x, L.y];
    };
    for (let i = 0; i < 3; i++) {
      const [a, b] = NOTE_T[i];
      if (wt < a) {
        if (i === 0) return { p: pos(0, 0), on: 0 };
        const [, pb] = NOTE_T[i - 1], k = ease.inOut(prog(wt, pb, a)), p0 = pos(i - 1, 1), p1 = pos(i, 0);
        return { p: [lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k)], on: 0, lift: Math.sin(k * Math.PI) };
      }
      if (wt <= b) return { p: pos(i, prog(wt, a, b)), on: 1 };
    }
    return { p: pos(2, 1), on: 0 };
  }

  T.register('note', {
    draw(ctx, V, lt, api) {
      opaque(() => {
        const st = S.stepAt(api, 'straw'), wr = S.stepAt(api, 'write'), cl = S.stepAt(api, 'close');
        const s0 = st ? st.lt : 0.5, w0 = wr ? wr.lt : 2.5, c0 = cl ? cl.lt : 8.0, wt = lt - w0, ct = lt - c0;
        S.camera(lt, { dur: api.dur, z0: 1.0, z1: 1.05, y0: -10, y1: 50 });
        S.layer(0.9, () => ctx.drawImage(noteTable(), 0, 0));
        S.layer(1.0, () => {
          ctx.drawImage(noteBox(), 0, 0);
          // contents (clipped to the opening)
          ctx.save(); ctx.beginPath(); ctx.rect(BOX.x0 + 4, BOX.y0 + 4, BOX.x1 - BOX.x0 - 8, BOX.y1 - BOX.y0 - 8); ctx.clip();
          S.melon(522, 458, 560, { tod: 'day', rot: 0.07, lit: 0.55, carve: S.MARK, carveA: 0.8 });
          S.melon(400, 748, 440, { tod: 'day', rot: -0.12, lit: 0.5 });
          // the small one is lowered in during "straw"
          const pk = P01(lt, s0 + 0.1, s0 + 1.5, ease.out), sc = lerp(1.22, 1, pk);
          ctx.save(); ctx.translate(772, 792); ctx.scale(sc, sc);
          S.melon(0, 0, 226, { tod: 'day', rot: 0.3, lit: 0.7, carve: S.MARK, shadow: pk, girth: 0.5 });
          ctx.restore();
          ctx.drawImage(noteStraw2(), 0, 0);
          // shade cast by the far and left walls
          let g = ctx.createLinearGradient(0, BOX.y0, 0, BOX.y0 + 180); g.addColorStop(0, 'rgba(20,10,4,0.55)'); g.addColorStop(1, 'rgba(20,10,4,0)'); ctx.fillStyle = g; ctx.fillRect(BOX.x0, BOX.y0, BOX.x1 - BOX.x0, 180);
          g = ctx.createLinearGradient(BOX.x0, 0, BOX.x0 + 170, 0); g.addColorStop(0, 'rgba(20,10,4,0.5)'); g.addColorStop(1, 'rgba(20,10,4,0)'); ctx.fillStyle = g; ctx.fillRect(BOX.x0, BOX.y0, 170, BOX.y1 - BOX.y0);
          // the folded note, once it is tucked in beside the small melon
          if (ct > 1.4) { ctx.save(); ctx.translate(NOTE_IN.x, NOTE_IN.y); ctx.rotate(NOTE_IN.r); ctx.scale(NOTE_IN.s, NOTE_IN.s); folded(); ctx.restore(); }
          ctx.restore();
          // flaps: the short (side) flaps fold in first, then the long ones meet in the middle
          const kS = P01(ct, 1.3, 1.9), kL = P01(ct, 1.8, 2.4);
          noteFlap('L', lerp(2.2, 0, kS), 355); noteFlap('R', lerp(2.2, 0, kS), 355);
          noteFlap('T', lerp(2.05, 0, kL), 355); noteFlap('B', lerp(1.75, 0, kL), 355);
          if (kL > 0.97) {   // closed: the seam, and the edges of the inner flaps pressing up from below
            const my = (BOX.y0 + BOX.y1) / 2;
            ctx.save(); ctx.filter = 'blur(3px)'; ctx.fillStyle = 'rgba(40,24,10,0.55)'; ctx.fillRect(BOX.x0, my - 3, BOX.x1 - BOX.x0, 7); ctx.restore();
            ctx.strokeStyle = 'rgba(40,24,10,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(BOX.x0, my); ctx.lineTo(BOX.x1, my); ctx.stroke();
          }
          // the paper on the table: written, folded twice, then carried into the box
          const f1 = P01(ct, 0.0, 0.42), f2 = P01(ct, 0.42, 0.78), carry = P01(ct, 0.8, 1.4);
          const pw = PAPER.w, ph = PAPER.h;
          if (ct < 0.8) {
            ctx.save(); ctx.translate(PAPER.x, PAPER.y); ctx.rotate(PAPER.r);
            ctx.save(); ctx.filter = 'blur(7px)'; ctx.globalAlpha = 0.45; ctx.translate(8, 12); ctx.fillStyle = '#000';
            if (f1 < 0.5) { paperPath(pw, ph); ctx.fill(); } else ctx.fillRect(f2 < 0.5 ? -pw / 2 : 0, 0, f2 < 0.5 ? pw : pw / 2, ph / 2);
            ctx.restore();
            if (f1 <= 0) { paperFace(pw, ph); noteText(V, wt); }
            else if (f2 <= 0) foldOne(V, wt, f1);
            else foldTwo(f2);
            // pencil left lying on the table after writing
            if (wt > 5.25) { ctx.save(); ctx.translate(PEN_REST[0], PEN_REST[1]); ctx.rotate(0.82); ctx.save(); ctx.filter = 'blur(3px)'; ctx.globalAlpha = 0.5; ctx.fillStyle = '#000'; ctx.fillRect(10, 2, 300, 14); ctx.restore(); pencil(0, 330); ctx.restore(); }
            // the writing hand / folding hand
            if (ct < 0) {
              const tp = tipAt(V, wt), enter = P01(wt, -0.7, 0.3, ease.out), leave = P01(wt, 5.0, 5.3);
              const wig = tp.on ? [Math.sin(lt * 29) * 5 + Math.sin(lt * 11) * 3, Math.cos(lt * 23) * 6] : [0, 0];
              let hx = tp.p[0] + wig[0] + (1 - enter) * 900, hy = tp.p[1] + wig[1] + (1 - enter) * 1000;
              hx = lerp(hx, PEN_REST[0], leave); hy = lerp(hy, PEN_REST[1], leave);
              const toTop = P01(wt, 5.25, 5.5);   // after putting the pencil down, the hand goes to the top edge of the paper
              if (wt > 5.25) { hx = lerp(PEN_REST[0] + 20, 60, toTop); hy = lerp(PEN_REST[1] - 30, -ph / 2 + 10, toTop); }
              handTop(hx, hy, 0.5, { pencil: wt < 5.25, pencilA: tp.on ? Math.sin(lt * 17) * 0.03 : 0, lift: (tp.lift || 0) * 0.5 + (wt > 5.25 ? 0.3 : 0) });
            } else if (ct < 0.8) {
              const hy = f1 < 1 ? -ph / 2 * Math.cos(Math.PI * f1) : ph / 4, hx = f2 > 0 ? -pw / 2 * Math.cos(Math.PI * f2) + 30 : 60;
              handTop(f2 > 0 ? hx : 60, f2 > 0 ? 40 : hy + (f1 >= 1 ? 10 : 0), f2 > 0 ? 0.25 : 0.8, { pinch: true, lift: 0.4 * Math.sin(Math.PI * (f2 > 0 ? f2 : f1)) });
            }
            ctx.restore();
          } else if (ct < 1.75) {
            // carried: from the table into the box, beside the small melon
            const p0 = toScreen(pw / 4, ph / 4);
            const x = lerp(p0[0], NOTE_IN.x, carry), y = lerp(p0[1], NOTE_IN.y, carry) - Math.sin(carry * Math.PI) * 60;
            const r = lerp(PAPER.r, NOTE_IN.r, carry), sc = lerp(1, NOTE_IN.s, carry) * (1 + Math.sin(carry * Math.PI) * 0.12);
            if (ct < 1.4) { ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.scale(sc, sc); folded(); ctx.restore(); }
            const away = P01(ct, 1.4, 1.75);
            handTop(x + 40 + away * 380, y + 10 + away * 260, 0.6, { pinch: true, lift: 0.6 });
          }
        });
        S.light(150, 560, 700, 'rgba(255,214,160,0.16)', 1);
        S.vignette(0.5);
      });
    },
    cues(V, api) {
      const out = [], st = api.steps.find(s => s.show === 'straw'), wr = api.steps.find(s => s.show === 'write'), cl = api.steps.find(s => s.show === 'close');
      if (st) out.push({ t: st.lt + 1.45, type: 'thud' });
      if (wr) NOTE_T.forEach(([a, b]) => out.push({ t: wr.lt + a, type: 'write', dur: +(b - a).toFixed(2) }));
      if (cl) out.push({ t: cl.lt, type: 'paper' }, { t: cl.lt + 1.3, type: 'box' });
      return out;
    },
  });
  const PEN_REST = [262, 70];
  function toScreen(lx, ly) { const c = Math.cos(PAPER.r), s = Math.sin(PAPER.r); return [PAPER.x + lx * c - ly * s, PAPER.y + lx * s + ly * c]; }
  // first fold: the top half comes down over the writing (scale(1, c) mirrors it below the crease once c < 0)
  function foldOne(V, wt, k) {
    const pw = PAPER.w, ph = PAPER.h, c = Math.cos(Math.PI * k);
    ctx.save(); ctx.beginPath(); ctx.rect(-pw, 0, pw * 2, ph); ctx.clip(); paperFace(pw, ph); noteText(V, wt); ctx.restore();
    if (c < 0) { ctx.save(); ctx.filter = 'blur(6px)'; ctx.fillStyle = `rgba(0,0,0,${0.25 * -c})`; ctx.fillRect(-pw / 2 + 6, 4, pw, -c * ph / 2 + 4); ctx.restore(); }
    ctx.save(); ctx.scale(1, Math.abs(c) < 0.02 ? 0.02 : c); ctx.beginPath(); ctx.rect(-pw, -ph, pw * 2, ph); ctx.clip();
    paperFace(pw, ph, c < 0); if (c > 0) noteText(V, wt);
    ctx.fillStyle = `rgba(40,30,15,${0.25 * (1 - Math.abs(c))})`; ctx.fillRect(-pw / 2, -ph / 2 + 8, pw, ph / 2 - 8);
    ctx.restore();
  }
  // second fold: left half over the right; the paper is now pw x ph/2 (its blank back up), centred at (0, ph/4)
  function foldTwo(k) {
    const pw = PAPER.w, ph = PAPER.h, c = Math.cos(Math.PI * k);
    ctx.save(); ctx.translate(0, ph / 4);
    blank(0, -ph / 4, pw / 2, ph / 2);
    if (c > 0) blank(-pw / 2 * c, -ph / 4, pw / 2 * c, ph / 2, 0.04);
    else blank(0, -ph / 4, pw / 2 * -c, ph / 2, -0.06);
    ctx.restore();
  }
  function blank(x, y, w, h, k = 0) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, S.shade('#ece2c8', k)); g.addColorStop(1, S.shade('#d6c9aa', k));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(90,120,170,0.13)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + h * 0.45); ctx.lineTo(x + w, y + h * 0.45); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,60,30,0.25)'; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h);
  }
  function folded() {    // the folded note, centred
    const w = PAPER.w / 2, h = PAPER.h / 2;
    ctx.save(); ctx.filter = 'blur(5px)'; ctx.globalAlpha = 0.45; ctx.fillStyle = '#000'; ctx.fillRect(-w / 2 + 8, -h / 2 + 10, w, h); ctx.restore();
    blank(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + 1); ctx.lineTo(w / 2, -h / 2 + 1); ctx.stroke();
    // a little of the pencil showing through
    ctx.globalAlpha = 0.13; ctx.fillStyle = '#3a3836'; for (let i = 0; i < 5; i++) ctx.fillRect(-w / 2 + 30 + i * 36, -h / 2 + 34, 22, 3); ctx.globalAlpha = 1;
  }

  // ================================================================ s13 city
  // a warm city kitchen at night, towers lit outside. They open the box and the child finds the note; later, the soup.
  const CITY = { tod: 'night', fig: '#3d2b22', rim: '#ffcf98', far: 1268, near: 1600 };
  const WIN = { x0: 96, y0: 330, x1: 560, y1: 1050 };
  const cityRoom = () => S.cached('d_city_room2', W, H, g => {
    let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#34231a'); gr.addColorStop(0.6, '#563a29'); gr.addColorStop(1, '#2a1b13'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    gr = g.createRadialGradient(930, 1090, 30, 930, 1090, 950); gr.addColorStop(0, 'rgba(255,196,120,0.5)'); gr.addColorStop(0.45, 'rgba(230,150,80,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const { x0, y0, x1, y1 } = WIN;
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#0a1226'); gr.addColorStop(0.6, '#1c2848'); gr.addColorStop(1, '#4a3a52'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const r = rng(17);
    for (let i = 0; i < 40; i++) { g.globalAlpha = 0.3 + r() * 0.5; g.fillStyle = '#e8eefc'; g.fillRect(x0 + r() * (x1 - x0), y0 + r() * 220, 1.6, 1.6); }
    g.globalAlpha = 1;
    const towers = (base, hMin, hMax, col, win, seed) => {
      const rr = rng(seed); let x = x0 - 20;
      while (x < x1 + 20) {
        const w = 40 + rr() * 90, h = hMin + rr() * (hMax - hMin), top = base - h;
        g.fillStyle = col; g.fillRect(x, top, w, h + 400);
        if (rr() < 0.3) g.fillRect(x + w * 0.4, top - 30, 3, 30);
        for (let wy = top + 10; wy < y1; wy += win * 2.2) for (let wx = x + 6; wx < x + w - win; wx += win * 1.9) {
          const v = rr(); if (v > 0.42) continue;
          g.fillStyle = v < 0.06 ? 'rgba(200,220,255,0.8)' : v < 0.3 ? `rgba(255,${200 + Math.floor(rr() * 30)},${120 + Math.floor(rr() * 40)},${0.55 + rr() * 0.4})` : 'rgba(255,180,100,0.35)';
          g.fillRect(wx, wy, win, win * 1.2);
        }
        x += w + 4 + rr() * 16;
      }
    };
    towers(y1 - 70, 240, 460, '#18213a', 5, 3);
    towers(y1 + 10, 130, 360, '#0e1527', 8, 8);
    gr = g.createLinearGradient(0, y1 - 180, 0, y1); gr.addColorStop(0, 'rgba(255,170,110,0)'); gr.addColorStop(1, 'rgba(255,170,110,0.16)'); g.fillStyle = gr; g.fillRect(x0, y1 - 180, x1 - x0, 180);
    g.filter = 'blur(30px)'; g.fillStyle = 'rgba(255,200,140,0.1)'; g.beginPath(); g.ellipse(480, 900, 90, 130, 0, 0, TAU); g.fill(); g.filter = 'none';
    g.restore();
    g.strokeStyle = '#24170f'; g.lineWidth = 24; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.lineWidth = 12; g.beginPath(); g.moveTo((x0 + x1) / 2, y0); g.lineTo((x0 + x1) / 2, y1); g.moveTo(x0, y0 + 250); g.lineTo(x1, y0 + 250); g.stroke();
    g.strokeStyle = 'rgba(255,200,140,0.22)'; g.lineWidth = 2; g.strokeRect(x0 + 13, y0 + 13, x1 - x0 - 26, y1 - y0 - 26);
    g.fillStyle = '#5c3d28'; g.fillRect(x0 - 26, y1 + 8, x1 - x0 + 52, 22); g.fillStyle = 'rgba(255,210,150,0.32)'; g.fillRect(x0 - 26, y1 + 8, x1 - x0 + 52, 3);
    for (let i = 0; i < 6; i++) { const cx = 40 + i * 20; gr = g.createLinearGradient(cx - 13, 0, cx + 13, 0); gr.addColorStop(0, '#4e2c21'); gr.addColorStop(0.5, '#8a5038'); gr.addColorStop(1, '#40241b'); g.fillStyle = gr; g.fillRect(cx - 13, 280, 26, 830 + i * 6); }
    // a shelf with jars on the right wall
    g.fillStyle = '#3a2618'; g.fillRect(650, 610, 430, 16); g.fillStyle = 'rgba(255,200,140,0.28)'; g.fillRect(650, 624, 430, 2);
    for (const [jx, jw, jh] of [[690, 64, 84], [764, 52, 112], [830, 74, 66], [906, 46, 98], [970, 62, 78]]) { g.fillStyle = '#2a1a12'; g.beginPath(); g.roundRect(jx - jw / 2, 610 - jh, jw, jh, 10); g.fill(); g.fillStyle = 'rgba(255,200,130,0.24)'; g.fillRect(jx + jw / 2 - 6, 616 - jh, 3, jh - 12); }
  });
  // the table top, seen a little from above: its far edge hides everyone's lower half
  const cityTable = () => S.cached('d_city_table2', W, H, g => {
    const { far, near } = CITY;
    let gr = g.createLinearGradient(0, far, 0, near); gr.addColorStop(0, '#6a4128'); gr.addColorStop(1, '#94603b');
    g.fillStyle = gr; g.fillRect(-10, far, W + 20, near - far);
    const r = rng(29);
    for (let i = 1; i < 9; i++) { const y = far + (near - far) * Math.pow(i / 9, 1.25); g.fillStyle = 'rgba(40,22,10,0.35)'; g.fillRect(-10, y, W + 20, 1.5 + i * 0.2); }
    g.strokeStyle = 'rgba(50,28,12,0.22)'; g.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) { const y = far + r() * (near - far), x = r() * W; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 80, y + (r() - 0.5) * 6, x + 160, y + (r() - 0.5) * 6, x + 240 + r() * 200, y); g.stroke(); }
    gr = g.createRadialGradient(900, 1340, 10, 900, 1340, 640); gr.addColorStop(0, 'rgba(255,216,150,0.5)'); gr.addColorStop(0.5, 'rgba(255,190,120,0.16)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = gr; g.fillRect(0, far, W, near - far);
    g.fillStyle = 'rgba(255,215,160,0.35)'; g.fillRect(-10, far, W + 20, 2);
    gr = g.createLinearGradient(0, near, 0, near + 34); gr.addColorStop(0, '#b47a4c'); gr.addColorStop(0.15, '#6a4228'); gr.addColorStop(1, '#4a2e1b'); g.fillStyle = gr; g.fillRect(-10, near, W + 20, 34);
    gr = g.createLinearGradient(0, near + 34, 0, H); gr.addColorStop(0, '#1e130c'); gr.addColorStop(1, '#0a0604'); g.fillStyle = gr; g.fillRect(-10, near + 34, W + 20, H);
  });
  function lamp() {   // desk lamp at the far right of the table
    const bx = 968, by = 1300;
    ctx.save(); ctx.fillStyle = '#1d130d'; ctx.strokeStyle = '#1d130d'; ctx.lineCap = 'round';
    ctx.save(); ctx.filter = 'blur(8px)'; ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(bx - 20, by + 6, 70, 12, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(bx, by, 52, 12, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 18, by - 150); ctx.lineTo(bx - 26, by - 236); ctx.stroke();
    ctx.translate(bx - 36, by - 246); ctx.rotate(-0.55);
    ctx.beginPath(); ctx.moveTo(-24, -34); ctx.lineTo(24, -34); ctx.lineTo(66, 42); ctx.lineTo(-66, 42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,150,0.5)'; ctx.fillRect(-24, -34, 48, 4);
    ctx.fillStyle = '#ffeccb'; ctx.beginPath(); ctx.ellipse(0, 44, 58, 8, 0, 0, TAU); ctx.fill();
    ctx.restore();
    S.light(bx - 80, by - 190, 170, 'rgba(255,226,170,0.45)', 1);
    S.light(bx - 150, by - 60, 420, 'rgba(255,190,110,0.14)', 1);
  }
  // the gift box on the table, from the front and a little above
  const CB = { cx: 560, by: 1446, w: 330, hh: 186, dep: 34, l: 108, ls: 100 };
  const cbEdges = () => { const yf = CB.by - CB.hh; return { x0: CB.cx - CB.w / 2, x1: CB.cx + CB.w / 2, yf, yb: yf - CB.dep }; };
  function cityBox(open, side) {
    const { cx, by, w, hh, dep, l, ls } = CB, { x0, x1, yf, yb } = cbEdges();
    ctx.save(); ctx.filter = 'blur(12px)'; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(cx - 40, by + 4, w * 0.62, 20, 0, 0, TAU); ctx.fill(); ctx.restore();
    const psiB = lerp(0, 1.95, open), tipB = yb + l * (0.12 * Math.cos(psiB) - Math.sin(psiB));
    const backFlap = () => { quad([[x0, yb], [x1, yb], [x1, tipB], [x0, tipB]], S.shade('#8a6238', -0.12 + 0.1 * Math.sin(psiB))); ctx.strokeStyle = '#d9b07a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0, tipB); ctx.lineTo(x1, tipB); ctx.stroke(); };
    if (open > 0.3) backFlap();
    quad([[x0, yb], [x1, yb], [x1, yf], [x0, yf]], '#24170d');
    if (open > 0.2) { ctx.save(); ctx.beginPath(); ctx.rect(x0 + 4, yb - 40, w - 8, dep + 40); ctx.clip(); strawTufts(x0, yb, w, dep); ctx.restore(); }
    if (open <= 0.3) backFlap();
    const psiS = lerp(0, 2.15, side);
    if (side > 0) for (const [hx, dir] of [[x0, 1], [x1, -1]]) {
      const tx = hx + dir * ls * Math.cos(psiS), dy = -ls * Math.sin(psiS);
      quad([[hx, yf], [hx, yb], [tx, yb + dy], [tx, yf + dy]], S.shade('#a57a47', dir > 0 ? -0.22 : 0.08));
    }
    const fg = ctx.createLinearGradient(x0, 0, x1, 0); fg.addColorStop(0, '#7a5530'); fg.addColorStop(1, '#bb8a52');
    ctx.fillStyle = fg; ctx.fillRect(x0, yf, w, hh);
    ctx.fillStyle = 'rgba(255,225,170,0.45)'; ctx.fillRect(x0, yf, w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x0, yf, 5, hh);
    ctx.save(); ctx.translate(x0 + 196, yf + 92); ctx.rotate(0.03); ctx.fillStyle = '#e2d9c4'; ctx.fillRect(0, 0, 100, 62);
    ctx.fillStyle = 'rgba(60,50,40,0.5)'; for (let i = 0; i < 4; i++) ctx.fillRect(9, 11 + i * 12, i === 0 ? 54 : 80 - i * 9, 4); ctx.restore();
    const tape = 1 - prog(open, 0, 0.15);
    if (tape > 0) { ctx.save(); ctx.globalAlpha = tape * 0.8; ctx.fillStyle = '#d8b67a'; ctx.fillRect(x0, yb + dep / 2 - 8, w, 16); ctx.fillRect(cx - 8, yf, 16, 52); ctx.restore(); }
    const psiF = lerp(0, 3.45, open), tipF = yf - l * (0.12 * Math.cos(psiF) + Math.sin(psiF));
    quad([[x0, yf], [x1, yf], [x1 + 4 * Math.sin(psiF), tipF], [x0 - 4 * Math.sin(psiF), tipF]], S.shade(psiF > 2.6 ? '#c39963' : '#b98b54', psiF > 1.2 && psiF < 2.6 ? 0.08 : 0));
    ctx.strokeStyle = 'rgba(60,38,18,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    if (open <= 0) { ctx.strokeStyle = 'rgba(50,30,14,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, yb + dep / 2); ctx.lineTo(x1, yb + dep / 2); ctx.stroke(); }
  }
  function strawTufts(x0, yb, w, dep) {
    const r = rng(55); ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = x0 + r() * w, y = yb + dep * (0.3 + r() * 0.8), a = -Math.PI / 2 + (r() - 0.5) * 1.6, L = 12 + r() * 30;
      ctx.strokeStyle = ['#c9a45c', '#e3c784', '#9c7a3e'][i % 3]; ctx.lineWidth = 1.5 + r() * 1.5; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function cityNote(x, y, a, k) {   // the note in the child's hands; k 0 folded → 1 opened
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const w = lerp(28, 50, k), h = lerp(38, 64, k);
    ctx.fillStyle = '#f1e5c8'; ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2 + 5); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2 - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(80,70,60,0.28)'; if (k > 0.5) for (let i = 0; i < 3; i++) ctx.fillRect(-w / 2 + 7, -h / 2 + 14 + i * 14, w - 16 - i * 6, 2.5); else ctx.fillRect(-1, -h / 2 + 3, 2, h - 6);
    ctx.restore();
    S.light(x, y, 80, 'rgba(255,230,180,0.22)', 1);
  }
  function soupPot(x, y, t) {   // 砂锅 on the table, lid off; y = where it stands
    const top = y - 132, rw = 112;
    ctx.save(); ctx.filter = 'blur(10px)'; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(x - 26, y + 2, 150, 16, 0, 0, TAU); ctx.fill(); ctx.restore();
    const g = ctx.createLinearGradient(x - rw - 20, 0, x + rw + 20, 0); g.addColorStop(0, '#3e2a1f'); g.addColorStop(0.6, '#7d5d47'); g.addColorStop(1, '#b8916d');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - rw, top); ctx.bezierCurveTo(x - rw - 34, top + 50, x - rw * 0.95, y - 8, x - rw * 0.7, y); ctx.lineTo(x + rw * 0.7, y);
    ctx.bezierCurveTo(x + rw * 0.95, y - 8, x + rw + 34, top + 50, x + rw, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(30,18,10,0.4)'; ctx.fillRect(x - rw - 14, top + 52, rw * 2 + 28, 6);
    ctx.fillStyle = '#3a271c'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * (rw + 22), top + 26, 18, 8, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#5a4030'; ctx.beginPath(); ctx.ellipse(x, top, rw + 2, 19, 0, 0, TAU); ctx.fill();
    const sg = ctx.createRadialGradient(x + 30, top - 2, 6, x, top, rw); sg.addColorStop(0, '#f3e6c8'); sg.addColorStop(1, '#c6b088');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x, top + 2, rw - 10, 14, 0, 0, TAU); ctx.fill();
    const r = rng(21);   // translucent melon chunks, a few bits of scallion
    for (let i = 0; i < 7; i++) { const cx = x + (r() - 0.5) * rw * 1.5, cy = top + 2 + (r() - 0.5) * 12; ctx.fillStyle = `rgba(${172 + r() * 30},${202 + r() * 20},${150 + r() * 20},0.85)`; ctx.beginPath(); ctx.roundRect(cx - 11, cy - 4, 22, 8, 3); ctx.fill(); }
    ctx.fillStyle = '#5f8f3c'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + (r() - 0.5) * rw * 1.4, top + 2 + (r() - 0.5) * 10, 2.6, 0, TAU); ctx.fill(); }
    S.steam(x - 6, top - 8, t, 0.85, 60);
    S.steam(x + 6, top - 170, t + 2.7, 0.4, 90);
    return top;
  }
  function bowl(x, y, s = 1) {   // (x, y) = foot of the bowl
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const g = ctx.createLinearGradient(-60, 0, 60, 0); g.addColorStop(0, '#8e8272'); g.addColorStop(1, '#f2e8d8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-58, -42); ctx.quadraticCurveTo(-54, 0, -22, 2); ctx.lineTo(22, 2); ctx.quadraticCurveTo(54, 0, 58, -42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9cdb8'; ctx.beginPath(); ctx.ellipse(0, -42, 58, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e9dbb6'; ctx.beginPath(); ctx.ellipse(0, -40, 50, 7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(180,210,160,0.9)'; ctx.fillRect(-18, -43, 15, 5); ctx.fillRect(8, -41, 13, 5);
    ctx.strokeStyle = 'rgba(70,90,140,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-54, -28); ctx.quadraticCurveTo(0, -20, 54, -28); ctx.stroke();
    ctx.restore();
  }
  function ladle(tx, ty, a) {    // ladle cup at (tx, ty), handle up toward the hand at angle a
    ctx.save(); ctx.translate(tx, ty);
    ctx.strokeStyle = '#2b2018'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(Math.cos(a) * 150, Math.sin(a) * 150); ctx.stroke();
    ctx.fillStyle = '#3a2c22'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI); ctx.fill();
    ctx.restore();
  }

  T.register('city', {
    draw(ctx, V, lt, api) {
      opaque(() => {
        const op = S.stepAt(api, 'open'), sp = S.stepAt(api, 'soup'), says = api.steps.filter(s => s.say);
        const o0 = op ? op.lt : 0.5, k2 = says[1] ? says[1].lt : 6.3, l1 = says[2] ? says[2].lt : 9.7;
        const s0 = sp ? sp.lt : 12.7, cut = s0 + 0.1;        // a soft dip to dark between the two set-ups (time passes)
        const B = lt >= cut;
        const cam = S.camera(B ? lt - cut : lt, B ? { dur: api.dur - cut, z0: 1.05, z1: 1.02, y0: 10, y1: 0 } : { dur: cut, z0: 1.0, z1: 1.045, y0: 0, y1: 24 });
        S.layer(0.6, () => ctx.drawImage(cityRoom(), 0, 0));
        S.layer(0.6, () => S.light(330, 596, 10, `rgba(255,80,60,${0.5 + 0.4 * Math.sin(lt * 2.4)})`, 1));   // a red light on a tower
        const pf = { tod: CITY.tod, color: CITY.fig, rimColor: CITY.rim, halo: 0.1 };
        let kidHead, linHead;
        S.layer(1.0, () => {
          if (!B) {
            // ---------------- set-up A: the box is opened
            const fOpen = P01(lt, o0 + 0.45, o0 + 1.15), sOpen = P01(lt, o0 + 1.1, o0 + 1.7), peer = P01(lt, o0 + 1.6, o0 + 2.2);
            const { x0, x1, yf, yb } = cbEdges();
            // the child: lifts the far flap, then reaches in for the note, holds it up, opens and reads it
            const kx = 262, ky = 1590, kh = 640, ko = { facing: 1, bend: 0.1 * peer, t: lt };
            const grab = P01(lt, o0 + 2.1, o0 + 2.6), lift = P01(lt, o0 + 2.6, o0 + 3.1), unfold = P01(lt, k2 - 0.5, k2 + 0.1);
            const sh = shoulderOf('kid', kx, ky, kh, ko).so, rest = [sh[0] + 76, CITY.far - 4];
            const flapTip = [x0 + 70, yb - CB.l * Math.sin(lerp(0, 1.95, fOpen)) * 0.9];
            let kt;
            if (lt < o0 + 0.5) { const k = P01(lt, o0, o0 + 0.5); kt = [lerp(rest[0], x0 + 60, k), lerp(rest[1], yb + 10, k)]; }
            else if (lt < o0 + 1.5) kt = [lerp(x0 + 60, flapTip[0], fOpen), lerp(yb + 10, flapTip[1], fOpen)];
            else if (lt < o0 + 2.1) { const k = P01(lt, o0 + 1.5, o0 + 2.0); kt = [lerp(flapTip[0], rest[0] + 20, k), lerp(flapTip[1], rest[1], k)]; }
            else {
              const inBox = [CB.cx - 70, yf + 12], up = [sh[0] + 150, sh[1] - 70], read = [sh[0] + 96, sh[1] - 48];
              const p1 = [lerp(rest[0] + 20, inBox[0], grab), lerp(rest[1], inBox[1], grab)], p2 = [lerp(p1[0], up[0], lift), lerp(p1[1], up[1], lift)];
              kt = [lerp(p2[0], read[0], unfold), lerp(p2[1], read[1], unfold)];
            }
            const kArm = reach('kid', kx, ky, kh, ko, kt[0], kt[1]);
            const kArmB = unfold > 0 ? reach('kid', kx, ky, kh, ko, lerp(rest[0] - 30, kt[0] - 8, unfold), lerp(rest[1], kt[1] + 24, unfold)) : reach('kid', kx, ky, kh, ko, rest[0] - 30, rest[1]);
            const kid = S.person('kid', kx, ky, kh, { ...pf, ...ko, light: [1, 0.05], armF: kArm, armB: kArmB, head: unfold * 0.2 - lift * 0.12 * (1 - unfold) });
            kidHead = kid.head;
            // 林姐: opens the near flap and a side flap; while she speaks she lifts the small melon out
            const lx = 812, lyy = 1735, lh = 940, mk = P01(lt, l1 - 0.1, l1 + 0.9);
            const lo = { facing: -1, bend: 0.16 + 0.1 * peer + 0.12 * Math.sin(Math.PI * clamp(fOpen * 1.4)) };
            const lsh = shoulderOf('lin', lx, lyy, lh, lo).so, lrest = [lsh[0] - 70, CITY.far - 2];
            const nearTip = k => { const psi = lerp(0, 3.45, k); return [CB.cx + 50, yf - CB.l * (0.12 * Math.cos(psi) + Math.sin(psi))]; };
            let lt_;
            if (lt < o0 + 0.45) { const k = P01(lt, o0 - 0.1, o0 + 0.45); lt_ = [lerp(lrest[0], CB.cx + 60, k), lerp(lrest[1], yf - 6, k)]; }
            else if (lt < o0 + 1.15) { const tp = nearTip(Math.min(fOpen, 0.55)); lt_ = [tp[0] + 16, tp[1] - 6]; }
            else if (lt < o0 + 1.8) { const k = P01(lt, o0 + 1.15, o0 + 1.3), tp = nearTip(0.55); lt_ = [lerp(tp[0] + 16, x1 + 10 - 60 * Math.cos(lerp(0, 2.15, sOpen)), k), lerp(tp[1], yf - 90 * Math.sin(lerp(0, 2.15, sOpen)), k)]; }
            else { const k = P01(lt, o0 + 1.8, o0 + 2.4); lt_ = [lerp(x1 + 40, lrest[0], k), lerp(yf - 75, lrest[1], k)]; }
            const hold = [lx - 160, 1090];
            const melonAt = [lerp(CB.cx + 30, hold[0], mk), lerp(yf + 28, hold[1], mk) - Math.sin(mk * Math.PI) * 30];
            if (lt > l1 - 0.5) { const k = P01(lt, l1 - 0.5, l1 - 0.1); lt_ = [lerp(lt_[0], melonAt[0] - 40, k), lerp(lt_[1], melonAt[1] + 30, k)]; }
            if (lt > l1 - 0.1) lt_ = [melonAt[0] - 42, melonAt[1] + 32];
            const lArm = reach('lin', lx, lyy, lh, lo, lt_[0], lt_[1]);
            const lArmB = lt > l1 - 0.1 ? reach('lin', lx, lyy, lh, lo, melonAt[0] + 48, melonAt[1] + 30) : reach('lin', lx, lyy, lh, lo, lrest[0] + 30, lrest[1]);
            const lin = S.person('lin', lx, lyy, lh, { ...pf, ...lo, light: [1, 0.05], armF: lArm, armB: lArmB, head: 0.16 * peer + 0.12 * mk });
            linHead = lin.head;
            ctx.drawImage(cityTable(), 0, 0);
            cityBox(fOpen, sOpen);
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, yf); ctx.clip();
            S.melon(melonAt[0], melonAt[1], 200, { tod: 'day', rot: lerp(-0.05, -0.12, mk), lit: 0.75, rim: 0.6, carve: S.MARK, color: '#46603f', girth: 0.48 });
            ctx.restore();
            if (fOpen > 0.5) S.light(CB.cx + 30, yf - 10, 160, 'rgba(255,220,160,0.16)', P01(lt, o0 + 1.0, o0 + 2.0));
            if (lt > o0 + 2.45) { const nk = kid.hand; cityNote(nk[0] + 8, nk[1] - 18, -0.15 + unfold * 0.1, unfold); }
            lamp();
          } else {
            // ---------------- set-up B: the soup. The small melon keeps cool on the window sill now, the note beside it.
            S.melon(400, WIN.y1 - 34, 180, { tod: 'night', rot: 0.02, lit: 0.35, rim: 0.8, carve: S.MARK, carveA: 0.7, girth: 0.48 });
            ctx.save(); ctx.translate(512, WIN.y1 - 22); ctx.rotate(0.1); ctx.fillStyle = '#d6cab0'; ctx.fillRect(-16, -26, 32, 46); ctx.restore();
            const bt = lt - s0, pot = [535, 1420], potTop = pot[1] - 132, bowlAt = [702, 1238];
            const scoop = u => {               // one scoop: from above her bowl into the pot, and back to pour
              const inPot = [pot[0] + 30, potTop + 10], over = [bowlAt[0] - 6, bowlAt[1] - 58];
              if (u < 0.35) { const k = ease.inOut(u / 0.35); return [lerp(over[0], inPot[0], k), lerp(over[1], inPot[1], k) - Math.sin(k * Math.PI) * 40, 0]; }
              if (u < 0.55) return [inPot[0], inPot[1], 0];
              const k = ease.inOut((u - 0.55) / 0.45); return [lerp(inPot[0], over[0], k), lerp(inPot[1], over[1], k) - Math.sin(k * Math.PI) * 46, k];
            };
            let lc = bt < 1.35 ? scoop(prog(bt, 0.25, 1.35)) : scoop(prog(bt, 1.35, 2.45));
            if (bt < 0.25) lc = [bowlAt[0] - 6, bowlAt[1] - 58, 0];
            const tilt = Math.max(0, lc[2] - 0.75) * 4, la = -1.0 - tilt * 0.3;
            const lx = 840, lyy = 1735, lh = 940, lo = { facing: -1, bend: 0.2 };
            const lArm = reach('lin', lx, lyy, lh, lo, lc[0] + Math.cos(la) * 140, lc[1] + Math.sin(la) * 140);
            const lArmB = reach('lin', lx, lyy, lh, lo, bowlAt[0] + 44, bowlAt[1] - 16);
            const lin = S.person('lin', lx, lyy, lh, { ...pf, ...lo, light: [1, 0.05], armF: lArm, armB: lArmB, head: 0.22 });
            linHead = lin.head;
            const kx = 205, ky = 1515, kh = 640, ko = { facing: 1, sit: 1, bend: 0.06 };
            const kArm = reach('kid', kx, ky, kh, ko, 318, 1300 + Math.sin(lt * 1.6) * 4);
            const kid = S.person('kid', kx, ky, kh, { ...pf, ...ko, light: [1, 0.05], armF: kArm, armB: reach('kid', kx, ky, kh, ko, 290, CITY.far + 4), head: 0.06, t: lt });
            kidHead = kid.head;
            ctx.drawImage(cityTable(), 0, 0);
            bowl(338, 1372, 1.0);
            ctx.strokeStyle = '#ddd5c4'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(kid.hand[0], kid.hand[1]); ctx.lineTo(kid.hand[0] + 30, kid.hand[1] + 30); ctx.stroke();
            soupPot(pot[0], pot[1], lt);
            bowl(lin.handB[0] - 38, lin.handB[1] + 16, 0.9);
            ladle(lc[0], lc[1], la);
            lamp();
          }
        });
        S.vignette(0.5);
        veil(Math.max(0, 1 - Math.abs(lt - cut) / 0.45) * 0.92, '#0d0805');
        const ka = kidHead && camPt(cam, kidHead), la_ = linHead && camPt(cam, linHead);
        S.say(api, lt, { kid: ka ? [ka[0] + 70, ka[1] - 150] : null, lin: la_ ? [Math.min(la_[0] - 50, 690), la_[1] - 150] : null });
      });
    },
    cues(V, api) {
      const out = sayCues(api), op = api.steps.find(s => s.show === 'open'), sp = api.steps.find(s => s.show === 'soup');
      if (op) out.push({ t: op.lt + 0.45, type: 'box' }, { t: op.lt + 2.5, type: 'paper' });
      if (sp) out.push({ t: sp.lt + 1.25, type: 'spoon' }, { t: sp.lt + 2.35, type: 'spoon' });
      return out;
    },
  });

  // ================================================================ s14 dusk
  // the village at sunset. 李叔 on the bench by his door; 晓禾 sits down and shows him the photo of the soup.
  const duskClouds = () => S.cached('d_dusk_clouds', W, 1300, g => {
    const r = rng(19); g.filter = 'blur(16px)';
    for (let i = 0; i < 14; i++) {
      const x = r() * W, y = 420 + r() * 520, w = 160 + r() * 320, h = 14 + r() * 26;
      g.globalAlpha = 0.35 + r() * 0.35; g.fillStyle = r() < 0.5 ? '#e48f72' : '#c76b78';
      g.beginPath(); g.ellipse(x, y, w, h, 0, 0, TAU); g.fill();
      g.globalAlpha *= 0.8; g.fillStyle = '#ffc78e'; g.beginPath(); g.ellipse(x + w * 0.1, y + h * 0.5, w * 0.7, h * 0.4, 0, 0, TAU); g.fill();
    }
  });
  // the yard: packed earth, a few tufts of grass; and a dark clump of leaves close to the lens
  const duskYard = () => S.cached('d_dusk_yard', W, H, g => {
    const p = S.TOD.dusk, r = rng(61);
    g.strokeStyle = S.shade(p.fig, 0.12); g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = 1300 + r() * r() * 420, s = 0.5 + (y - 1300) / 420;
      for (let k = 0; k < 5; k++) { g.lineWidth = 1.5 * s + 0.8; g.beginPath(); g.moveTo(x + k * 3 * s, y); g.quadraticCurveTo(x + k * 3 * s + (k - 2) * 4 * s, y - 10 * s, x + (k - 2) * 9 * s, y - (14 + r() * 14) * s); g.stroke(); }
    }
    g.fillStyle = 'rgba(255,180,110,0.06)'; g.fillRect(0, 1300, W, 4);
  });
  function bench(x0, x1, seatY, footY, tod) {
    const p = S.TOD[tod];
    ctx.save(); ctx.fillStyle = S.shade(p.fig, 0.08);
    for (const lx of [x0 + 40, x1 - 60]) { ctx.fillRect(lx, seatY, 18, footY - seatY); ctx.fillRect(lx + 2, seatY + (footY - seatY) * 0.55, (x1 - x0) * 0 + 16, 6); }
    ctx.fillRect(x0 + 40, seatY + (footY - seatY) * 0.55, x1 - x0 - 80, 8);
    ctx.fillRect(x0, seatY, x1 - x0, 22);
    ctx.fillStyle = p.rim; ctx.globalAlpha = 0.7; ctx.fillRect(x0 + 4, seatY - 1, x1 - x0 - 4, 2.5);
    ctx.restore();
  }
  function phone(x, y, a, glow) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#0c0a0e'; ctx.beginPath(); ctx.roundRect(-13, -24, 26, 48, 4); ctx.fill();
    const g = ctx.createLinearGradient(0, -20, 0, 20); g.addColorStop(0, '#ffe2b4'); g.addColorStop(1, '#f3b77c');
    ctx.globalAlpha = glow; ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-10, -20, 20, 40, 2); ctx.fill();
    ctx.restore();
    S.light(x, y, 120, 'rgba(255,225,190,0.35)', glow);
  }

  T.register('dusk', {
    draw(ctx, V, lt, api) {
      opaque(() => {
        const tod = 'dusk', hz = 1250, p = S.TOD[tod];
        const bn = S.stepAt(api, 'bench'), lk = S.stepAt(api, 'look');
        const says = api.steps.filter(s => s.say), xs = says[0] ? says[0].lt : 3.3, qs = says[1] ? says[1].lt : 6.3;
        const b0 = bn ? bn.lt : 0.5, k0 = lk ? lk.lt : 8.7;
        const cam = S.camera(lt - 5.6, { dur: api.dur - 5.6, z0: 1.1, z1: 1.0, y0: 30, y1: 0 });
        const sunY = lerp(905, 1080, ease.inOut(prog(lt, 0, api.dur + 0.5)));
        S.layer(0.05, () => { S.sky(tod, { horizon: hz }); ctx.drawImage(duskClouds(), 0, 0); S.sun(810, sunY, 44, tod, 1); });
        S.layer(0.2, () => S.hills(tod, 27, { horizon: hz }));
        S.layer(0.3, () => S.fog(tod, lt, hz - 60, 0.22, 6, 1.2));
        S.layer(0.6, () => {
          S.ground(tod, hz);
          S.house(-120, 1330, 600, tod, { window: 1, door: true, wall: '#3f3242' });
          ctx.drawImage(duskYard(), 0, 0);
          for (const [mx, my, ml, mr] of [[430, 1318, 150, 0.05], [560, 1322, 140, -0.08], [495, 1286, 128, 0.1]]) S.melon(mx, my, ml, { tod, rot: mr, dark: 0.55, rim: 0.7, lit: 0.3, carve: S.MARK, carveA: 0.25 });
        });
        S.motes(lt, { n: 22, seed: 14, x: 0, y: 900, w: W, h: 700, alpha: 0.35, vy: 2, color: 'rgba(255,200,140,' });
        let qinHead, xiaoHead;
        S.layer(1.0, () => {
          const seatY = 1428, footY = 1562, qx = 360, xxEnd = 740, hgt = 600;
          // ground shadow
          ctx.save(); ctx.filter = 'blur(14px)'; ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(540, footY + 6, 420, 20, 0, 0, TAU); ctx.fill(); ctx.restore();
          bench(200, 900, seatY, footY, tod);
          // 晓禾: walks in from the right (the sun side), sits, holds out the phone
          const wk = P01(lt, b0 - 0.4, b0 + 1.8, ease.out), sd = P01(lt, b0 + 1.7, b0 + 2.5);
          const xx = lerp(1180, xxEnd, wk);
          // seated figures: put each seat on the bench (the builds differ), and keep the feet on the ground while she sits down
          const qy = seatY + 108, xy = lerp(footY, seatY + 146, sd) - 34 * Math.sin(Math.PI * sd);
          const show = P01(lt, b0 + 2.4, b0 + 3.0), putDown = P01(lt, k0 + 0.1, k0 + 0.7), back = P01(lt, k0 + 0.7, k0 + 1.1);
          const lookAway = P01(lt, k0 + 0.9, k0 + 1.4);
          const xo = { facing: -1, sit: sd, bend: Math.sin(sd * Math.PI) * 0.35 + 0.05 * sd, walk: wk < 1 ? lt * 5.6 : undefined, t: lt };
          const xsh = shoulderOf('xiao', xx, xy, hgt, xo).so;
          const xrest = [xsh[0] - 40, xsh[1] + 170];
          const phoneOut = [xx - 175, 1270], bench_ = [550, seatY - 10];
          let xt = [lerp(xrest[0], phoneOut[0], show), lerp(xrest[1], phoneOut[1], show)];
          if (putDown > 0) xt = [lerp(phoneOut[0], bench_[0], putDown), lerp(phoneOut[1], bench_[1] - 18, putDown)];
          if (back > 0) xt = [lerp(bench_[0], xrest[0] + 20, back), lerp(bench_[1] - 18, xrest[1], back)];
          // 李叔: sitting, looking at the sunset; waves it off, turns away; then turns back and quietly takes the phone
          const wave = P01(lt, qs + 0.05, qs + 1.0, ease.linear), turnA = P01(lt, qs + 0.75, qs + 1.25), turnB = P01(lt, k0 + 1.25, k0 + 1.75);
          const take = P01(lt, k0 + 1.8, k0 + 2.5), bring = P01(lt, k0 + 2.5, k0 + 3.5);
          const qTurn = turnB > 0 ? turnB : turnA, qf0 = turnB > 0 ? -1 : 1, qf1 = turnB > 0 ? 1 : -1;
          const qo = (f) => ({ facing: f, sit: 1, bend: 0.06 + 0.25 * take * (1 - bring) + 0.1 * bring, head: f > 0 ? 0.1 + 0.28 * bring : -0.05, t: lt });
          const phonePos = () => {
            if (putDown <= 0) return show > 0 ? [xt[0] + 4, xt[1] - 14] : null;
            if (take <= 0) return putDown < 1 ? [xt[0] + 4, xt[1] - 14 + 4 * putDown] : [bench_[0], bench_[1] - 6];
            return null;   // in his hand
          };
          let qArm = (f) => {
            const qq = qo(f), sh = shoulderOf('qin', qx, qy, hgt, qq).so;
            if (take > 0) {
              const tgt0 = [bench_[0] - 4, bench_[1] - 6], face = [sh[0] + 92, sh[1] - 28];
              const tg = bring > 0 ? [lerp(tgt0[0], face[0], bring), lerp(tgt0[1], face[1], bring)] : [lerp(sh[0] + 90, tgt0[0], take), lerp(sh[1] + 150, tgt0[1], take)];
              return reach('qin', qx, qy, hgt, qq, tg[0], tg[1]);
            }
            if (wave > 0 && wave < 1 && f > 0) { const w = Math.sin(wave * Math.PI * 4) * 22; return reach('qin', qx, qy, hgt, qq, sh[0] + 120 + w, sh[1] + 30 - 30 * Math.sin(wave * Math.PI)); }
            if (f < 0) return reach('qin', qx, qy, hgt, qq, sh[0] - 70, sh[1] + 95);   // arms folded, turned away
            return reach('qin', qx, qy, hgt, qq, sh[0] + 115 * f, sh[1] + 160);           // hands on the knees
          };
          const q = turned(qx, qTurn, qf0, qf1, f => S.person('qin', qx, qy, hgt, { tod, light: [1, -0.25], ...qo(f), armF: qArm(f), armB: f < 0 ? reach('qin', qx, qy, hgt, qo(f), shoulderOf('qin', qx, qy, hgt, qo(f)).so[0] - 50, shoulderOf('qin', qx, qy, hgt, qo(f)).so[1] + 110) : [0.6, -0.4] }));
          qinHead = q.head;
          const xArm = reach('xiao', xx, xy, hgt, xo, xt[0], xt[1]);
          const x_ = turned(xx, lookAway, -1, 1, f => S.person('xiao', xx, xy, hgt, { tod, light: [1, -0.25], ...xo, facing: f, armF: f < 0 ? xArm : reach('xiao', xx, xy, hgt, { ...xo, facing: 1 }, xx + 110, footY - 170), armB: [0.3, 0.6] }));
          xiaoHead = x_.head;
          const pp = phonePos();
          if (pp) phone(pp[0], pp[1], putDown >= 1 ? 1.45 : -0.2, putDown >= 1 ? 0.15 : lerp(0, 1, show));
          if (take > 0) { const h = q.hand; phone(h[0] + 6, h[1] - 12, lerp(1.45, -0.35, P01(lt, k0 + 2.2, k0 + 2.9)), lerp(0.15, 1, P01(lt, k0 + 2.3, k0 + 2.8))); }
        });
        S.vignette(0.45);
        const xa = xiaoHead && camPt(cam, xiaoHead), qa = qinHead && camPt(cam, qinHead);
        S.say(api, lt, { xiao: xa ? [xa[0] - 20, xa[1] - 150] : null, qin: qa ? [qa[0] + 10, qa[1] - 150] : null });
      });
    },
    cues(V, api) {
      const out = sayCues(api), bn = api.steps.find(s => s.show === 'bench'), lk = api.steps.find(s => s.show === 'look');
      if (bn) out.push({ t: bn.lt + 2.5, type: 'phone' });
      if (lk) out.push({ t: lk.lt + 2.4, type: 'phone' });
      return out;
    },
  });

  // ================================================================ s15 end
  // night falls over the field; one carved melon in a soft pool of light; the closing lines, quietly
  const endBg = () => S.cached('d_end_bg', W, H, g => {
    const hz = 560;
    let gr = g.createLinearGradient(0, 0, 0, hz + 40); gr.addColorStop(0, '#070b17'); gr.addColorStop(0.55, '#141a32'); gr.addColorStop(0.86, '#3a2a40'); gr.addColorStop(1, '#6a4248');
    g.fillStyle = gr; g.fillRect(0, 0, W, hz + 40);
    const r = rng(23);
    for (let i = 0; i < 120; i++) { const y = r() * hz * 0.75; g.globalAlpha = (0.2 + r() * 0.6) * (1 - y / hz); g.fillStyle = '#eef0ff'; g.beginPath(); g.arc(r() * W, y, r() < 0.1 ? 1.8 : 1, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    // far ridge and the near field
    g.fillStyle = '#161526'; g.beginPath(); g.moveTo(0, hz);
    for (let x = 0; x <= W; x += 10) g.lineTo(x, hz - 30 - 40 * K.fbm(x * 0.004, 3.3, 3));
    g.lineTo(W, hz + 40); g.lineTo(0, hz + 40); g.closePath(); g.fill();
    gr = g.createLinearGradient(0, hz - 10, 0, H); gr.addColorStop(0, '#16131c'); gr.addColorStop(0.3, '#0e0c12'); gr.addColorStop(1, '#060508');
    g.fillStyle = gr; g.fillRect(0, hz - 6, W, H);
    // distant windows
    for (const [x, y] of [[170, hz - 22], [196, hz - 20], [830, hz - 30]]) { g.fillStyle = 'rgba(255,196,120,0.9)'; g.fillRect(x, y, 5, 5); g.filter = 'blur(6px)'; g.fillStyle = 'rgba(255,170,90,0.5)'; g.beginPath(); g.arc(x + 2, y + 2, 10, 0, TAU); g.fill(); g.filter = 'none'; }
    // the dark field: soft patches of leaves fading toward the ridge
    g.filter = 'blur(10px)';
    for (let i = 0; i < 34; i++) { const y = hz + 20 + Math.pow(r(), 1.6) * 900, sc = 0.3 + (y - hz) / 700; g.fillStyle = `rgba(${20 + r() * 6},${23 + r() * 6},${24 + r() * 5},${0.25 + r() * 0.25})`; g.beginPath(); g.ellipse(r() * W, y, 80 * sc, 26 * sc, 0, 0, TAU); g.fill(); }
    g.filter = 'none';
  });
  // melon leaves (big, round, a little ruffled), behind (0) and in front of (1) the melon
  const endLeaves = (front) => S.cached('d_end_leaves' + front, W, H, g => {
    const r = rng(front ? 37 : 31), n = front ? 4 : 16;
    for (let i = 0; i < n; i++) {
      let x, y, s;
      if (front) { const side = i % 2 ? 1 : -1; x = 540 + side * (200 + r() * 140); y = 868 + r() * 40; s = 46 + r() * 30; }
      else { const a = Math.PI + r() * Math.PI, d = 280 + r() * 240; x = 540 + Math.cos(a) * d * 1.1; y = 760 + Math.sin(a) * d * 0.32 + r() * 120; s = 60 + r() * 70; }
      g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.9); g.scale(1, 0.5 + r() * 0.15);
      g.fillStyle = front ? '#0d120f' : `rgb(${18 + r() * 8},${26 + r() * 10},${22 + r() * 6})`;
      g.beginPath(); for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU, rr = s * (1 + 0.08 * Math.sin(a * 5 + i)); k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill();
      g.strokeStyle = 'rgba(200,170,190,0.16)'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, s * 1.02, Math.PI * 1.1, Math.PI * 1.75); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5; for (let k = 0; k < 5; k++) { const a = Math.PI * 0.9 + k * 0.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.85); g.stroke(); }
      g.restore();
    }
  });

  T.register('end', {
    draw(ctx, V, lt, api) {
      opaque(() => {
        S.camera(lt, { dur: api.dur, z0: 1.0, z1: 1.04, y0: 0, y1: 10 });
        S.layer(0.5, () => ctx.drawImage(endBg(), 0, 0));
        const lightK = P01(lt, 0, 2.2);
        S.layer(1.0, () => {
          ctx.drawImage(endLeaves(0), 0, 0);
          // soft warm light from a window off frame, left
          ctx.save(); ctx.filter = 'blur(18px)'; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(560, 860, 330, 40, 0, 0, TAU); ctx.fill(); ctx.restore();
          S.melon(540, 742, 600, { tod: 'night', rot: -0.04, color: '#1a2d21', lit: 0.25, rim: 0.45, dark: 0.3, carve: S.MARK, carveA: 0.3 + 0.3 * lightK, frost: 0.35 });
          // the lamp-light falls on the near (left) half of the melon only
          ctx.save(); ctx.beginPath(); ctx.ellipse(540, 742, 292, 126, -0.04, 0, TAU); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
          const wg = ctx.createRadialGradient(360, 680, 10, 360, 690, 420); wg.addColorStop(0, `rgba(255,180,110,${0.16 * lightK})`); wg.addColorStop(1, 'rgba(255,190,120,0)');
          ctx.fillStyle = wg; ctx.fillRect(240, 600, 600, 300); ctx.restore();
          ctx.drawImage(endLeaves(1), 0, 0);
          const sw = prog(lt, 0.6, 3.6);
          S.light(lerp(330, 760, ease.inOut(sw)), 720, 200, 'rgba(255,226,180,0.12)', Math.sin(sw * Math.PI));
        });
        S.motes(lt, { n: 14, seed: 33, x: 80, y: 520, w: 920, h: 520, alpha: 0.5, vy: 3, vx: 2, size: 2.2, blink: 0.7, color: 'rgba(255,214,140,' });
        S.vignette(0.5);
        // closing lines: serif, revealed character by character; the purchase details small and quiet underneath
        const ln = V.lines_end || [], info = V.info || [];
        const r1 = prog(lt, 1.2, 3.6), r2 = prog(lt, 3.4, 4.9), ri = ease.out(prog(lt, 5.1, 6.4));
        if (ln[0]) L.serif(ln[0], 500, 1090, { size: 58, color: '#fbf1e0', glow: 12, reveal: r1, spacing: 4 });
        if (ln[1]) L.serif(ln[1], 500, 1180, { size: 46, color: 'rgba(245,232,212,0.86)', glow: 6, reveal: r2, spacing: 6 });
        if (ri > 0) {
          ctx.save(); ctx.globalAlpha = ri * 0.5; ctx.fillStyle = '#e8d8bc'; ctx.fillRect(500 - 40, 1262, 80, 1.5); ctx.restore();
          info.forEach((s, i) => K.text(s, 500, 1330 + i * 48, { size: 28, family: F.sans, color: '#e9dcc6', alpha: ri * (i ? 0.6 : 0.75), align: 'center', spacing: 2 }));
        }
      });
    },
    cues(V, api) { return [{ t: 1.2, type: 'title' }]; },
  });
})();
