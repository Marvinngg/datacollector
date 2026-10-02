/* Scenes, part C: phone (s07), show_phone (s08), pick (s09), dry (s09b), gift (s11).
 * Local helpers (not in scene.js): kf() keyframes, cam() sets the camera directly, toScreen() maps a world point to the
 * screen for dialogue anchors, armIK() aims a hand at a point (mirrors the arm skeleton of S.person), hand() draws a hand
 * over a carried melon, shed() the old man's 瓜棚, phoneProp(), cardboard(), nearLeaves(). */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng } = K;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers
  // piecewise keyframes: keys = [[t, v], ...], v a number or an array; eased between keys
  function kf(t, keys, e = ease.inOut) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i], k = e((t - t0) / (t1 - t0));
      return Array.isArray(a) ? a.map((v, j) => lerp(v, b[j], k)) : lerp(a, b, k);
    }
    return keys[keys.length - 1][1];
  }
  // set the camera to an exact state (S.camera interpolates; with k = 1 it lands on the *1 values)
  const cam = (z, x, y) => S.camera(1, { dur: 1, z0: z, z1: z, x0: x, x1: x, y0: y, y1: y });
  // where a world point drawn in S.layer(depth) ends up on screen
  function toScreen(C, x, y, d = 1) { const z = 1 + (C.z - 1) * d; return [W / 2 + (x - W / 2 - C.x * d) * z, H / 2 + (y - H / 2 - C.y * d) * z]; }
  const keepSafe = ([x, y]) => [clamp(x, 170, 830), clamp(y, 320, 1460)];
  const mixRGB = (a, b, k) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`;

  // arm IK that mirrors S.person's skeleton: the [shoulder, elbow] angles that put the hand at (tx, ty)
  const BLD = { qin: { leg: 0.47, bend: 0.26 }, xiao: { leg: 0.5, bend: 0 } };
  function armIK(who, x, y, h, o, tx, ty) {
    const B = BLD[who], f = o.facing || 1, crouch = o.crouch || 0;
    const hip = [x, y - h * B.leg * (1 - 0.32 * crouch)], bend = B.bend + (o.bend || 0), torL = h * 0.3;
    const so = [hip[0] + Math.sin(bend) * torL * f, hip[1] - Math.cos(bend) * torL + h * 0.035];
    const L1 = h * 0.165, L2 = h * 0.175;
    const fx = (tx - so[0]) * f, dy = ty - so[1];
    const d = clamp(Math.hypot(fx, dy), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
    const ang = Math.atan2(fx, dy), al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const a1 = ang - al, el = [so[0] + Math.sin(a1) * L1 * f, so[1] + Math.cos(a1) * L1];
    const a2 = Math.atan2((tx - el[0]) * f, ty - el[1]);
    return { ang: [a1 - bend * 0.3, a2 - a1], el, so };
  }
  // a hand drawn over the front of a carried melon
  function hand(x, y, h, col, rim, lx) {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, h * 0.026, h * 0.036, 0.3, 0, TAU); ctx.fill();
    if (rim) { ctx.globalAlpha = 0.6; ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, h * 0.026, h * 0.036, 0.3, lx < 0 ? 2.4 : -0.7, lx < 0 ? 4.0 : 0.9); ctx.stroke(); }
    ctx.restore();
  }
  // Catmull-Rom path through points (closed)
  function smoothPath(pts, ctx = K.ctx) {
    ctx.beginPath(); ctx.moveTo(...pts[0]);
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    ctx.closePath();
  }
  const shake = (lt, t0, amp = 3, d = 0.45) => { const k = lt - t0; return k > 0 && k < d ? Math.sin(k * 50) * amp * (1 - k / d) : 0; };

  // a hand-held phone in a wide shot: a small dark slab; its screen side (toward `face`: -1 left, 1 right) glows
  function phoneProp(x, y, s, rot, glow, face) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = '#101216'; ctx.beginPath(); ctx.roundRect(-s * 0.13, -s * 0.5, s * 0.26, s, s * 0.06); ctx.fill();
    ctx.globalAlpha = glow; ctx.fillStyle = '#e4ebf7'; ctx.fillRect(face < 0 ? -s * 0.13 : s * 0.09, -s * 0.44, s * 0.04, s * 0.88);
    ctx.restore();
    S.light(x + face * s * 0.5, y, s * 2.4, 'rgba(210,225,255,0.3)', glow * 0.7);
  }

  // the old man's 瓜棚: uneven plank wall, a thatched roof, a dark doorway with melons stacked inside,
  // a 斗笠 on a nail, a hoe leaning on the wall. (x, y) = bottom-left; hh = wall height; lx = side the light comes from
  function shed(x, y, w, hh, tod, o = {}) {
    const p = S.TOD[tod], r = rng(o.seed || 3), lx = o.lx == null ? -1 : o.lx;
    const wall = o.wall || '#4b4541', straw = o.straw || '#4a3d2d';
    ctx.save();
    ctx.fillStyle = wall; ctx.fillRect(x, y - hh, w, hh);
    for (let px = x; px < x + w;) {           // boards of uneven width and tone
      const bw = 34 + r() * 30;
      ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,240,220'},${0.03 + r() * 0.07})`; ctx.fillRect(px, y - hh, bw, hh);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(px, y - hh, 3, hh);
      if (r() < 0.6) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(px + 8 + r() * (bw - 16), y - hh * (0.15 + r() * 0.7), 3, 5, 0, 0, TAU); ctx.fill(); }
      px += bw;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, y - hh * 0.62, w, 10); ctx.fillRect(x, y - hh * 0.2, w, 10);   // cross battens
    const fg = ctx.createLinearGradient(0, y - hh * 0.3, 0, y); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = fg; ctx.fillRect(x, y - hh * 0.3, w, hh * 0.3);
    // doorway with the melons kept inside
    const dx = x + w * (o.doorX == null ? 0.3 : o.doorX), dw = o.doorW || w * 0.3, dh = o.doorH || hh * 0.82;
    const dg = ctx.createLinearGradient(0, y - dh, 0, y); dg.addColorStop(0, '#090706'); dg.addColorStop(1, '#1c1611');
    ctx.fillStyle = dg; ctx.fillRect(dx, y - dh, dw, dh);
    ctx.save(); ctx.beginPath(); ctx.rect(dx, y - dh, dw, dh); ctx.clip();
    const ml = dw * 0.5;
    [[0.25, 0], [0.75, 0], [0.5, 1]].forEach(([u, row], i) => S.melon(dx + dw * u, y - 26 - ml * 0.42 * row, ml, { tod, rot: (i - 1) * 0.08, dark: 0.7, rim: 0.3, lit: 0.1, shadow: 0.4 }));
    ctx.restore();
    const fr = S.shade(p.fig, 0.12);
    ctx.fillStyle = fr; ctx.fillRect(dx - 14, y - dh - 14, dw + 28, 14); ctx.fillRect(dx - 14, y - dh, 14, dh); ctx.fillRect(dx + dw, y - dh, 14, dh);
    if (o.hat !== false) {      // 斗笠 on a nail
      const hx = x + w * (o.hatX == null ? 0.78 : o.hatX), hy = y - hh * 0.6;
      ctx.fillStyle = '#6a583d'; ctx.beginPath(); ctx.moveTo(hx - 70, hy + 16); ctx.lineTo(hx, hy - 34); ctx.lineTo(hx + 70, hy + 16); ctx.quadraticCurveTo(hx, hy + 34, hx - 70, hy + 16); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(hx, hy - 30); ctx.lineTo(hx + k * 28, hy + 20 + (2 - Math.abs(k)) * 4); ctx.stroke(); }
      ctx.globalAlpha = 0.6; ctx.strokeStyle = p.rim; ctx.lineWidth = 2; ctx.beginPath(); lx < 0 ? (ctx.moveTo(hx - 66, hy + 13), ctx.lineTo(hx, hy - 33)) : (ctx.moveTo(hx + 66, hy + 13), ctx.lineTo(hx, hy - 33)); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#2a2219'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx, hy - 34); ctx.lineTo(hx, hy - 44); ctx.stroke();
    }
    if (o.hoe !== false) {      // a hoe resting blade-down against the wall
      const bx = x + w * (o.hoeX == null ? 0.08 : o.hoeX);
      ctx.strokeStyle = '#2b2219'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx, y - 24); ctx.lineTo(bx + 70, y - hh * 0.68); ctx.stroke();
      ctx.fillStyle = '#24211e'; ctx.beginPath(); ctx.moveTo(bx - 6, y - 34); ctx.lineTo(bx - 52, y - 30); ctx.lineTo(bx - 56, y - 4); ctx.lineTo(bx - 4, y - 8); ctx.closePath(); ctx.fill();
    }
    // thatched roof: ragged eave, straw strokes, the ridge catching the light
    const ey = y - hh, ov = w * 0.07, rh = o.roofH || hh * 0.3;
    ctx.fillStyle = straw; ctx.beginPath(); ctx.moveTo(x - ov * 0.5, ey - rh);
    ctx.lineTo(x + w + ov * 0.5, ey - rh);
    for (let ex = x + w + ov; ex >= x - ov; ex -= 12) ctx.lineTo(ex, ey + 18 + r() * 20);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,180,0.08)'; ctx.lineWidth = 2;
    for (let k = 0; k < 90; k++) { const sx = x - ov + r() * (w + ov * 2), sy = ey - rh + r() * rh; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (r() - 0.5) * 10, sy + 30 + r() * 30); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x, ey, w, 22);
    ctx.globalAlpha = o.rimA == null ? 0.75 : o.rimA; ctx.strokeStyle = p.rim; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - ov * 0.5, ey - rh); ctx.lineTo(x + w + ov * 0.5, ey - rh); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); if (lx < 0) { ctx.moveTo(x + 1, ey + 30); ctx.lineTo(x + 1, y); } else { ctx.moveTo(x + w - 1, ey + 30); ctx.lineTo(x + w - 1, y); } ctx.stroke();
    ctx.restore();
    return { door: [dx, dw, dh] };
  }

  // big, out-of-focus leaves right in front of the lens (also covers the ground when the camera pushes in low)
  const nearLeaves = (tod) => S.cached('c_nearleaves_' + tod, W + 600, 700, g => {
    const p = S.TOD[tod], r = rng(77); g.filter = 'blur(7px)';
    for (let i = 0; i < 70; i++) {
      const x = r() * (W + 600), y = 140 + r() * 560, s = 50 + r() * 70;
      g.fillStyle = S.shade(p.near, -0.25 + r() * 0.2); g.beginPath(); g.ellipse(x, y, s * 1.3, s * 0.6, r() * 3, 0, TAU); g.fill();
    }
  });

  // ================================================================ s07 phone
  // night, a close-up of the phone in 晓禾's hand: fingertips at the edges, fireflies out of focus behind.
  // Two old messages from 林姐 come up; the carved surname in the first one is picked out. On "smile" the
  // camera eases back and the screen's light stays on the silhouette of her face.
  const nightBg = () => S.cached('c_phone_night', W + 200, H + 200, g => {
    const gr = g.createLinearGradient(0, 0, 0, H + 200);
    gr.addColorStop(0, '#050a14'); gr.addColorStop(0.45, '#0c1628'); gr.addColorStop(0.75, '#17243a'); gr.addColorStop(1, '#0a111c');
    g.fillStyle = gr; g.fillRect(0, 0, W + 200, H + 200);
    g.filter = 'blur(26px)';
    const r = rng(17);
    g.fillStyle = '#0a1220'; g.beginPath(); g.moveTo(0, H + 200);
    for (let x = 0; x <= W + 200; x += 20) g.lineTo(x, 1180 - 120 * Math.sin(x * 0.004 + 1) - 50 * Math.sin(x * 0.011));
    g.lineTo(W + 200, H + 200); g.closePath(); g.fill();
    g.fillStyle = '#060b14'; for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(r() * (W + 200), 1330 + r() * 120, 110 + r() * 120, 90 + r() * 60, 0, 0, TAU); g.fill(); }
    g.fillRect(0, 1420, W + 200, H);
    g.filter = 'blur(10px)';
    [[230, 1150, 9], [860, 1110, 7], [905, 1118, 5]].forEach(([x, y, s]) => { g.fillStyle = 'rgba(255,190,110,0.85)'; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); });
    g.filter = 'none';
    const v = g.createRadialGradient(W * 0.6, H * 0.55, 200, W * 0.6, H * 0.55, 1300); v.addColorStop(0, 'rgba(40,60,90,0.18)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v; g.fillRect(0, 0, W + 200, H + 200);
  });
  // out-of-focus fireflies: soft discs that drift and pulse
  function fireflies(lt, o) {
    const r = rng(o.seed || 5);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < o.n; i++) {
      const bx = (o.x || 0) + r() * o.w, by = (o.y || 0) + r() * o.h, sp = 0.4 + r() * 0.8, ph = r() * TAU, rad = o.r0 + r() * (o.r1 - o.r0);
      const x = bx + Math.sin(lt * 0.21 * sp + ph) * 50, y = by + Math.cos(lt * 0.17 * sp + ph * 1.3) * 34 - lt * 3 * sp;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(lt * 1.1 * sp + ph * 2), 2), a = o.alpha * (0.2 + 0.8 * blink);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(226,240,150,${a})`); g.addColorStop(0.6, `rgba(205,232,120,${a * 0.75})`); g.addColorStop(1, 'rgba(180,220,100,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // her face in profile, close to the lens (over-the-shoulder), facing right; local units, head radius ≈ 250
  const FACE = [[-130, 340], [-186, 190], [-246, 0], [-214, -182], [-90, -276], [70, -272], [186, -200], [232, -100], [246, -32],
    [240, 6], [258, 46], [286, 92], [292, 106], [280, 116], [262, 122], [270, 142], [262, 156], [268, 170], [254, 188],
    [262, 220], [242, 254], [184, 280], [134, 302], [118, 380], [112, 480], [100, 640], [-90, 720], [-280, 650]];
  const FACE_BOX = [-300, -300, 620, 1060];     // bounds of the FACE outline (+ stroke and offsets), face coordinates
  function face(x, y, s, rot, glow, lt, src) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    const col = '#04060a';
    ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = 92;          // ponytail
    ctx.beginPath(); ctx.moveTo(-200, -120); ctx.quadraticCurveTo(-370, 40 + Math.sin(lt * 0.8) * 6, -330, 330); ctx.stroke();
    smoothPath(FACE); ctx.fillStyle = col; ctx.fill();
    // the screen as the light source, in face-local coordinates
    const dx = (src[0] - x) / s, dy = (src[1] - y) / s, c = Math.cos(-rot), sn = Math.sin(-rot);
    const lx = dx * c - dy * sn, ly = dx * sn + dy * c, ln = Math.hypot(lx, ly), ux = lx / ln, uy = ly / ln;
    ctx.save(); smoothPath(FACE); ctx.clip();
    // faint moonlight on the crown
    ctx.globalAlpha = 0.3;      // (a fixed shape in face coordinates: a cached, pre-blurred sprite)
    S.soft('face_moon', FACE_BOX, 3, g => { g.strokeStyle = '#7f98c2'; g.lineWidth = 7; g.translate(10, 12); smoothPath(FACE, g); g.stroke(); });
    // screen light: a soft wash on cheek and jaw, a warm-white rim on brow, nose, lips and chin, fading with distance
    ctx.globalAlpha = 1;
    const wash = ctx.createRadialGradient(lx, ly, 0, lx, ly, ln * 1.25);
    wash.addColorStop(0, `rgba(225,226,240,${0.16 * glow})`); wash.addColorStop(0.6, `rgba(225,226,240,${0.08 * glow})`); wash.addColorStop(1, 'rgba(225,226,240,0)');
    ctx.fillStyle = wash; ctx.fillRect(-500, -500, 1100, 1300);
    const rimG = ctx.createRadialGradient(lx, ly, ln * 0.4, lx, ly, ln * 1.35);
    rimG.addColorStop(0, `rgba(246,240,232,${clamp(glow)})`); rimG.addColorStop(1, 'rgba(246,240,232,0)');
    // (the light moves every frame: blurred at reduced resolution, S.blurred)
    ctx.globalAlpha = 0.85; ctx.translate(-ux * 13, -uy * 13);
    S.blurred(7, g => { g.strokeStyle = rimG; g.lineWidth = 22; smoothPath(FACE, g); g.stroke(); }, FACE_BOX);
    ctx.globalAlpha = 0.5; ctx.translate(ux * 9, uy * 9);
    S.blurred(2, g => { g.strokeStyle = rimG; g.lineWidth = 6; smoothPath(FACE, g); g.stroke(); }, FACE_BOX);
    ctx.restore();
    ctx.restore();
  }
  function wrapChars(str, maxW) {
    const rows = []; let row = '';
    for (const ch of str) {
      if (row && ctx.measureText(row + ch).width > maxW && !'，。？！、”）'.includes(ch)) { rows.push(row); row = ''; }
      row += ch;
    }
    if (row) rows.push(row);
    return rows;
  }
  // the chat screen, drawn in screen-local pixels (0..sw, 0..sh); ks = appearance 0..1 per message, hi = emphasis of the surname
  function chat(sw, sh, V, ks, hi) {
    const ink = '#1e1d1c', sub = '#9d978d', bar = '#e8e3da';
    ctx.fillStyle = '#f2eee7'; ctx.fillRect(0, 0, sw, sh);
    ctx.textBaseline = 'middle';
    // status bar: time, punch-hole camera, signal, battery
    ctx.fillStyle = ink; ctx.font = `500 26px ${F.sans}`; ctx.textAlign = 'left'; ctx.fillText('22:47', 48, 42);
    ctx.fillStyle = '#050608'; ctx.beginPath(); ctx.arc(sw / 2, 40, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = ink; for (let i = 0; i < 4; i++) { const bh = 8 + i * 5; ctx.beginPath(); ctx.roundRect(sw - 158 + i * 10, 52 - bh, 6, bh, 1.5); ctx.fill(); }
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(sw - 102, 31, 44, 22, 6); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(sw - 98, 35, 26, 14, 3); ctx.fill(); ctx.fillRect(sw - 56, 38, 4, 8);
    // header: back, contact name, more
    ctx.fillStyle = bar; ctx.fillRect(0, 78, sw, 98);
    ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(56, 109); ctx.lineTo(40, 127); ctx.lineTo(56, 145); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = `500 34px ${F.sans}`; ctx.textAlign = 'center'; ctx.fillText(V.from || '林姐', sw / 2, 128);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(sw - 78 + i * 15, 127, 3.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 176, sw, 2);
    ctx.fillStyle = sub; ctx.font = `400 22px ${F.sans}`; ctx.fillText('9月3日 晚上7:42', sw / 2, 232);
    // her messages (left side): avatar + bubble
    const fs = 38, lh = 56, pad = 24, bx = 122, maxW = sw - bx - 70 - pad * 2;
    let y = 280;
    (V.msgs || []).forEach((m, i) => {
      ctx.font = `400 ${fs}px ${F.sans}`;
      const rows = wrapChars(m, maxW), tw = Math.max(...rows.map(r => ctx.measureText(r).width));
      const bw = tw + pad * 2, bh = rows.length * lh + pad * 2 - (lh - fs) + 6, k = ks[i] || 0;
      if (k > 0) {
        ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 26);
        ctx.fillStyle = '#c69872'; ctx.beginPath(); ctx.roundRect(28, y, 76, 76, 14); ctx.fill();
        ctx.fillStyle = '#fff8ef'; ctx.font = `500 34px ${F.sans}`; ctx.textAlign = 'center'; ctx.fillText([...(V.from || '林')][0], 66, y + 39);
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.06)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.beginPath(); ctx.roundRect(bx, y, bw, bh, 16); ctx.fill();
        ctx.beginPath(); ctx.moveTo(bx + 1, y + 26); ctx.lineTo(bx - 11, y + 36); ctx.lineTo(bx + 1, y + 46); ctx.closePath(); ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.textAlign = 'left';
        rows.forEach((r, j) => {
          let cx = bx + pad; const cy = y + pad + fs / 2 + j * lh + 3;
          for (const ch of r) {
            ctx.font = `400 ${fs}px ${F.sans}`; const cw = ctx.measureText(ch).width;
            if (ch === S.MARK) {      // the carved surname, picked out a little
              ctx.save();
              ctx.fillStyle = `rgba(242,196,128,${0.4 * hi})`; ctx.beginPath(); ctx.roundRect(cx - 3, cy - fs * 0.57, cw + 6, fs * 1.14, 8); ctx.fill();
              ctx.font = `500 ${fs}px ${F.sans}`; ctx.fillStyle = mixRGB([30, 29, 28], [156, 74, 22], hi);
              ctx.fillText(ch, cx, cy); ctx.restore();
            } else { ctx.fillStyle = ink; ctx.fillText(ch, cx, cy); }
            cx += cw;
          }
        });
        ctx.restore();
      }
      y += Math.max(bh, 76) + 34;
    });
    // input bar and the home indicator
    ctx.fillStyle = bar; ctx.fillRect(0, sh - 150, sw, 150);
    ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(0, sh - 150, sw, 2);
    ctx.fillStyle = '#fbfaf7'; ctx.beginPath(); ctx.roundRect(96, sh - 128, sw - 192, 68, 14); ctx.fill();
    ctx.strokeStyle = '#3a3936'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(52, sh - 94, 24, 0, TAU); ctx.stroke();
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(44, sh - 94, 6 + k * 6, -0.7, 0.7); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(sw - 52, sh - 94, 24, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sw - 64, sh - 94); ctx.lineTo(sw - 40, sh - 94); ctx.moveTo(sw - 52, sh - 106); ctx.lineTo(sw - 52, sh - 82); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.roundRect(sw / 2 - 90, sh - 26, 180, 8, 4); ctx.fill();
  }
  // the hand holding the phone (phone-local coordinates, phone centred at 0,0).
  // part 'back': palm and fingers behind the phone, showing round its edges; 'front': fingertips and thumb over the edges
  function grip(PW, PH, part, rimA) {
    const col = '#06080b', rim = '#efe6dc';
    ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (part === 'back') {
      // palm and wrist below and to the right of the phone
      ctx.beginPath(); ctx.moveTo(-PW * 0.42, PH * 0.42); ctx.quadraticCurveTo(-PW * 0.1, PH * 0.62, PW * 0.2, PH * 0.6);
      ctx.quadraticCurveTo(PW * 0.62, PH * 0.56, PW * 0.66, PH * 0.3); ctx.lineTo(PW * 1.0, PH * 0.55); ctx.lineTo(PW * 0.9, PH * 0.9); ctx.lineTo(-PW * 0.1, PH * 0.9); ctx.closePath(); ctx.fill();
      ctx.restore(); return;
    }
    // four fingertips curling round the left edge from behind, close together
    [[0.06, 98, 34], [0.145, 102, 40], [0.232, 96, 36], [0.31, 80, 24]].forEach(([u, wdt, over]) => {
      const y = u * PH, e = -PW / 2, tip = e + over;
      ctx.beginPath(); ctx.moveTo(e - 38, y - wdt * 0.5); ctx.lineTo(tip - wdt * 0.32, y - wdt * 0.47);
      ctx.quadraticCurveTo(tip + wdt * 0.12, y - wdt * 0.36, tip + wdt * 0.1, y + 2); ctx.quadraticCurveTo(tip + wdt * 0.08, y + wdt * 0.42, tip - wdt * 0.36, y + wdt * 0.48);
      ctx.lineTo(e - 38, y + wdt * 0.5); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.globalAlpha = rimA; ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(tip - wdt * 0.3, y - wdt * 0.45); ctx.quadraticCurveTo(tip + wdt * 0.1, y - wdt * 0.34, tip + wdt * 0.08, y + 4); ctx.stroke(); ctx.restore();
    });
    // the edge of the hand bulging round the left side behind the fingertips
    ctx.beginPath(); ctx.ellipse(-PW / 2 - 22, PH * 0.19, 26, PH * 0.17, 0, 0, TAU); ctx.fill();
    // the thumb over the right edge, its tip just on the glass
    ctx.lineWidth = 96; ctx.beginPath(); ctx.moveTo(PW * 0.74, PH * 0.5); ctx.quadraticCurveTo(PW * 0.6, PH * 0.33, PW * 0.45, PH * 0.27); ctx.stroke();
    ctx.lineWidth = 80; ctx.beginPath(); ctx.moveTo(PW * 0.5, PH * 0.29); ctx.lineTo(PW * 0.41, PH * 0.262); ctx.stroke();
    ctx.save(); ctx.globalAlpha = rimA; ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(PW * 0.41, PH * 0.262, 39, -2.9, -1.2); ctx.stroke(); ctx.restore();
    ctx.restore();
  }

  T.register('phone', {
    draw(ctx, V, lt, api) {
      const msgs = api.steps.filter(s => s.show === 'msg'), sm = S.stepAt(api, 'smile');
      const t1 = msgs[0] ? msgs[0].lt : 0.5, t2 = msgs[1] ? msgs[1].lt : 6, ts = sm ? sm.lt : 10;
      const ks = [ease.out(prog(lt, t1 + 0.3, t1 + 0.9)), ease.out(prog(lt, t2 + 0.3, t2 + 0.9))];
      const hi = ease.inOut(prog(lt, t1 + 1.6, t1 + 2.6));
      const smK = ease.inOut(prog(lt, ts - 0.2, api.dur));
      cam(kf(lt, [[0, 1.1], [ts, 1.13], [api.dur, 1.02]]), kf(lt, [[0, 40], [ts, 46], [api.dur, 0]]), kf(lt, [[0, 120], [ts, 128], [api.dur, 10]]));
      // the screen brightens a touch each time a message comes up
      const flash = [t1 + 0.3, t2 + 0.3].reduce((a, t) => a + Math.max(0, 1 - Math.abs(lt - t - 0.15) / 0.6) * 0.25, 0);
      S.layer(0.15, () => ctx.drawImage(nightBg(), -100, -100));
      S.layer(0.25, () => fireflies(lt, { n: 18, seed: 21, x: -60, y: 260, w: W + 120, h: 1400, r0: 16, r1: 44, alpha: 0.3 }));
      S.layer(0.4, () => S.motes(lt, { n: 22, seed: 8, y: 500, h: 1100, alpha: 0.5, vy: 4, vx: 2, size: 2, color: 'rgba(215,240,140,' }));
      // the phone, held a little tilted, moving with her breathing
      const px = 612 + Math.sin(lt * 0.6) * 3, py = 1092 + Math.sin(lt * 0.9) * 3, rot = -0.05 + Math.sin(lt * 0.5) * 0.004;
      const PW = 600, PH = 1230, glow = 0.9 + flash;
      S.layer(1.0, () => {
        S.light(px, py, 950, 'rgba(200,214,240,0.13)', glow);
        ctx.save(); ctx.translate(px, py); ctx.rotate(rot);
        grip(PW, PH, 'back');
        ctx.fillStyle = '#0a0c10'; ctx.beginPath(); ctx.roundRect(-PW / 2, -PH / 2, PW, PH, 80); ctx.fill();
        ctx.strokeStyle = 'rgba(150,172,205,0.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(-PW / 2 + 2, -PH / 2 + 2, PW - 4, PH - 4, 78); ctx.stroke();
        const SW = PW - 30, SH = PH - 30;
        ctx.save(); ctx.translate(-SW / 2, -SH / 2); ctx.beginPath(); ctx.roundRect(0, 0, SW, SH, 66); ctx.clip();
        chat(SW, SH, V, ks, hi);
        ctx.fillStyle = `rgba(255,255,255,${0.06 * flash})`; ctx.fillRect(0, 0, SW, SH);
        const gl = ctx.createLinearGradient(0, 0, SW, SH); gl.addColorStop(0, 'rgba(255,255,255,0.05)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.07)');
        ctx.fillStyle = gl; ctx.fillRect(0, 0, SW, SH);
        ctx.restore();
        grip(PW, PH, 'front', 0.4 * glow);
        ctx.restore();
      });
      // her face near the lens catches the screen light; on "smile" the light stays on it and her head lifts a little
      S.layer(1.25, () => face(70, 160, 0.86, 0.5 - smK * 0.06, 0.5 + 0.3 * flash + 0.4 * smK, lt, [px - 120, py - PH * 0.42]));
      S.vignette(0.55);
    },
    cues(V, api) { return api.steps.filter(s => s.show === 'msg').map(s => ({ t: s.lt + 0.3, type: 'phone' })); },
  });

  // ================================================================ s08 show_phone
  // the next dawn at the 瓜棚 door. 晓禾 walks up and hands him the phone; he holds it out at arm's length (old eyes),
  // head down, and does not move for a long time. Then he gives it back and turns to his field, toward the low sun;
  // the music comes in and the light warms.
  T.register('show_phone', {
    draw(ctx, V, lt, api) {
      const tod = 'dawn', p = S.TOD[tod], hz = 1200;
      const hd = S.stepAt(api, 'hand'), rd = S.stepAt(api, 'read'), tn = S.stepAt(api, 'turn');
      const say = api.steps.filter(s => s.say);
      const tH = hd ? hd.lt : 0.5, tX = say[0] ? say[0].lt : 3.1, tR = rd ? rd.lt : 5.9, tQ = say[1] ? say[1].lt : 9.9, tX2 = say[2] ? say[2].lt : 12.3, tT = tn ? tn.lt : 15.3;
      const warm = ease.inOut(prog(lt, tT + 0.3, tT + 3.2));
      const C = S.camera(lt, { dur: api.dur, z0: 1.0, z1: 1.06, x0: 0, x1: 10, y0: 0, y1: 40 });
      const sunX = 880, sunY = lerp(1150, 1100, ease.out(clamp(lt / api.dur))) - warm * 20;
      S.layer(0.05, () => { S.sky(tod, { horizon: hz }); S.sun(sunX, sunY, 46, tod, lerp(0.8, 1, warm)); });
      S.layer(0.2, () => S.hills(tod, 5, { horizon: hz }));
      S.layer(0.3, () => S.fog(tod, lt, hz - 30, lerp(0.5, 0.32, warm), 8, 1.2));
      S.layer(0.6, () => {
        S.ground(tod, hz);
        // his melon field opens out to the right; packed earth in front of the shed
        ctx.save(); ctx.beginPath(); ctx.moveTo(370, hz); ctx.quadraticCurveTo(640, 1480, 1010, H + 20); ctx.lineTo(W + 300, H); ctx.lineTo(W + 300, hz); ctx.closePath(); ctx.clip();
        S.field('day', 7, { horizon: hz, vx: 760 });
        ctx.fillStyle = 'rgba(46,52,66,0.55)'; ctx.fillRect(300, hz, W, H - hz);
        for (const m of S.fieldSpots(5, 16, { horizon: hz })) if (m.x > 470 + (m.y - hz) * 0.75) S.melon(m.x, m.y, m.s * 0.75, { tod, rot: m.rot, dark: 0.5, rim: 0.6, lit: 0.3 });
        ctx.restore();
        // an earth ridge (田埂) along the edge of the field, a few tufts of grass on it
        ctx.save(); ctx.lineCap = 'round';
        ctx.strokeStyle = '#2a2a28'; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(370, hz); ctx.quadraticCurveTo(640, 1480, 1010, H + 20); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,214,170,0.22)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(384, hz); ctx.quadraticCurveTo(656, 1474, 1030, H + 10); ctx.stroke();
        const rr = rng(8); ctx.strokeStyle = '#2f3430'; ctx.lineWidth = 3;
        for (let k = 0; k < 40; k++) { const u = rr(); const bx = (1 - u) * (1 - u) * 370 + 2 * u * (1 - u) * 640 + u * u * 1010, by = (1 - u) * (1 - u) * hz + 2 * u * (1 - u) * 1480 + u * u * H; const s = 6 + u * 22; for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.moveTo(bx, by - 8); ctx.lineTo(bx + j * s * 0.4, by - 8 - s); ctx.stroke(); } }
        ctx.restore();
        const yg = ctx.createLinearGradient(0, hz, 0, H); yg.addColorStop(0, 'rgba(120,110,100,0)'); yg.addColorStop(1, 'rgba(60,52,46,0.4)');
        ctx.fillStyle = yg; ctx.fillRect(-300, hz, W + 600, H);
      });
      S.layer(0.7, () => S.fog(tod, lt * 1.2 + 300, hz + 120, lerp(0.32, 0.16, warm), 12, 1.5));
      S.layer(0.8, () => shed(-40, 1540, 640, 680, tod, { doorX: 0.62, doorW: 190, doorH: 560, hatX: 0.28, hoeX: 0.12, lx: 1, wall: '#57504a', straw: '#463a2c' }));
      if (warm > 0) { ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.32 * warm; ctx.fillStyle = '#ffae5e'; ctx.fillRect(0, 0, W, H); ctx.restore(); S.light(sunX, sunY, 900, 'rgba(255,190,120,0.16)', warm); }
      // ---- people. He stands at his door facing her (left); she comes in from the left.
      const qh = 650, xh = 615, gy = 1712, xy = 1702;
      const qx = kf(lt, [[0, 610], [tT + 1.7, 610], [api.dur, 760]], ease.linear), qf = lt < tT + 1.4 ? -1 : 1;
      const xx = kf(lt, [[0, -110], [tH + 2.0, 250]], ease.out), xWalk = lt < tH + 2.0;
      const breath = Math.sin(lt * 1.6) * 0.01;
      const hand = [418, 1342];
      const qo = { tod, facing: qf, light: [1, -0.3] };
      qo.head = kf(lt, [[0, 0.08], [tX + 0.5, 0.2], [tX + 2.9, 0.5], [tR + 0.2, 0.52], [tR + 1.6, 0.18], [tR + 2.6, 0.2], [tQ - 0.2, 0.66], [tT, 0.68], [tT + 0.8, 0.22], [tT + 1.6, -0.02], [api.dur, -0.08]]);
      qo.bend = kf(lt, [[0, 0.03], [tR + 0.2, 0.07], [tR + 1.6, -0.06], [tR + 2.6, -0.06], [tQ - 0.2, 0.04], [tT, 0.04], [tT + 0.8, 0.06], [tT + 1.6, 0.03]]) + breath;
      // the phone in his hand: taken, brought close, then out to arm's length; low during her line; given back
      const near = [qx - 70, 1180], far = [qx - 232, 1236], far2 = [qx - 214, 1286];
      let qT = null;
      if (lt > tX + 1.2 && lt < tT + 1.3) qT = kf(lt, [[tX + 1.2, [qx - 40, 1440]], [tX + 2.1, hand], [tX + 2.9, near], [tR + 0.2, near], [tR + 1.6, far], [tR + 2.6, far], [tQ - 0.2, far2], [tT, far2], [tT + 0.8, hand], [tT + 1.3, [qx - 30, 1430]]]);
      qo.armF = qT ? armIK('qin', qx, gy, qh, qo, qT[0], qT[1]).ang : [0.06, 0.2];
      qo.armB = lt < tT + 1.4 ? armIK('qin', qx, gy, qh, qo, qx - qf * qh * 0.075, gy - qh * 0.5).ang : undefined;   // free hand at the small of his back
      if (lt > tT + 1.7) { qo.walk = (lt - tT) * 4.5; qo.armF = undefined; }
      const xo = { tod, facing: 1, light: [1, -0.3], t: lt };
      xo.head = kf(lt, [[0, 0.04], [tR, 0.16], [tX2, 0.06], [tT + 1.6, 0.16]]);
      let xT = null;
      if (lt > tH + 1.3 && lt < tX + 2.7) xT = kf(lt, [[tH + 1.3, [xx + 110, 1480]], [tH + 2.2, hand], [tX + 2.1, hand], [tX + 2.7, [xx + 40, 1470]]]);
      else if (lt > tT - 0.1) xT = kf(lt, [[tT - 0.1, [xx + 40, 1470]], [tT + 0.8, hand], [tT + 1.6, [xx + 66, 1318]]]);
      if (xT) xo.armF = armIK('xiao', xx, xy, xh, xo, xT[0], xT[1]).ang;
      else if (!xWalk) xo.armF = kf(lt, [[tX2, [0.1, 0.3]], [tX2 + 0.6, [0.3, 0.75]], [tX2 + 1.9, [0.3, 0.75]], [tX2 + 2.6, [0.1, 0.3]]]);
      if (xWalk) xo.walk = lt * 6; else xo.armB = [0.0, 0.2];
      const owner = lt < tX + 2.1 ? 'x' : lt < tT + 0.8 ? 'q' : 'x';
      const rimC = mixRGB([255, 226, 184], [255, 196, 128], warm);
      let qr, xr;
      S.layer(1.0, () => {
        xr = S.person('xiao', xx, xy, xh, { ...xo, rimColor: rimC });
        qr = S.person('qin', qx, gy, qh, { ...qo, rimColor: rimC });
        const ph = owner === 'x' ? xr.hand : qr.hand;
        const reading = owner === 'q' && lt > tX + 2.6;
        phoneProp(ph[0], ph[1] - 4, 50, owner === 'q' ? (reading ? 0.42 : 0.2) : -0.2, owner === 'q' ? 1 : 0.6, owner === 'q' ? 1 : (lt < tT ? 1 : -1));
        // the cold light of the screen on his face while he reads
        if (reading && lt < tT + 0.8) S.light(qr.head[0] - 40, qr.head[1] + 40, 130, 'rgba(200,215,255,0.2)', ease.inOut(prog(lt, tX + 2.6, tR + 1)));
      });
      S.motes(lt, { n: 26, seed: 12, x: 380, y: 700, w: 700, h: 900, alpha: lerp(0.25, 0.45, warm), vy: 2, vx: -3 });
      S.vignette(lerp(0.45, 0.35, warm));
      S.say(api, lt, { xiao: keepSafe(toScreen(C, xr.head[0], xr.head[1] - 150)), qin: keepSafe(toScreen(C, qr.head[0], qr.head[1] - 150)) });
    },
    cues(V, api) { return api.steps.filter(s => s.say).map(s => ({ t: s.lt, type: 'say' })); },
  });

  // ================================================================ s09 pick
  // the field. He walks the row, bends to tap a melon and listen (two knocks), nods. He rolls the next one over:
  // a split in the skin; the camera moves in. "这个裂了，别给人家。" He pushes it aside and lifts the good one, the
  // carved surname on its skin, and carries it out.
  T.register('pick', {
    draw(ctx, V, lt, api) {
      const tod = 'day', p = S.TOD[tod], hz = 880;
      const wk = S.stepAt(api, 'walk'), kn = S.stepAt(api, 'knock'), cr = S.stepAt(api, 'crack'), ca = S.stepAt(api, 'carry');
      const sy = api.steps.find(s => s.say);
      const tW = wk ? wk.lt : 0.5, tK = kn ? kn.lt : 4.5, tC = cr ? cr.lt : 7.5, tS = sy ? sy.lt : 9.7, tA = ca ? ca.lt : 12.7;
      const k1 = tK + 0.9, k2 = tK + 1.6;
      const C = cam(kf(lt, [[0, 1.0], [tC, 1.02], [tC + 3.4, 1.17], [tA + 0.8, 1.17], [api.dur, 1.1]]),
        kf(lt, [[0, -20], [tC, -10], [tC + 3.4, 95], [tA + 0.8, 95], [api.dur, 110]]),
        kf(lt, [[0, 0], [tC, 10], [tC + 3.4, 150], [tA + 0.8, 150], [api.dur, 110]]));
      S.layer(0.05, () => { S.sky(tod, { horizon: hz }); S.sun(150, 640, 50, tod, 0.95); });
      S.layer(0.2, () => S.hills(tod, 17, { horizon: hz }));
      S.layer(0.3, () => S.fog(tod, lt, hz - 30, 0.22, 6, 1.1));
      S.layer(0.6, () => { S.ground(tod, hz); S.field(tod, 23, { horizon: hz, vx: 620 }); });
      const spots = S.fieldSpots(31, 14, { horizon: hz });
      S.layer(0.7, () => { for (const m of spots) if (m.y < 1250) S.melon(m.x, m.y, m.s * 0.85, { tod, rot: m.rot, dark: 0.45, rim: 0.7, lit: 0.35 }); });
      // ---- the action
      const qh = 720, gy = 1480;
      const qx = kf(lt, [[0, -160], [tW + 3.8, 360], [tC, 360], [tC + 0.5, 420], [tA + 0.3, 420], [tA + 0.6, 380], [tA + 1.6, 380], [api.dur, 600]], ease.linear);
      const walking = lt < tW + 3.75 || lt > tA + 1.6;
      // A: the good one (carved), in front of his feet; B: the next one along, a little further back; rolled over, pushed aside
      const A0 = [584, 1432], lenA = 250, B0 = [790, 1380], lenB = 236;
      const roll = ease.inOut(prog(lt, tC + 0.2, tC + 1.7));
      const aside = ease.inOut(prog(lt, tA - 0.3, tA + 0.6));
      const Bpos = [lerp(lerp(B0[0], 772, roll), 900, aside), lerp(lerp(B0[1], 1386, roll), 1336, aside)];
      const Brot = lerp(0.5, -0.04, roll) + aside * 0.18;
      const lift = ease.inOut(prog(lt, tA + 0.6, tA + 1.4));
      const bendK = kf(lt, [[tW + 3.4, 0], [tW + 4.3, 1], [tA + 0.7, 1], [tA + 1.5, 0.2]]);
      const o = { tod, facing: 1, light: [-1, -0.3] };
      o.bend = lerp(0.04, 0.82, bendK); o.crouch = lerp(0, 0.58, bendK);
      // head: looks down; a small double nod after the knocks; leans in to look at the split
      const nT = (lt - k2 - 0.5) / 1.1, nod = nT > 0 && nT < 1 ? Math.sin(nT * TAU * 2) * 0.1 * Math.sin(nT * Math.PI) + Math.sin(nT * Math.PI) * 0.06 : 0;
      o.head = lerp(0.05, 0.25, bendK) + nod + kf(lt, [[tC + 1.2, 0], [tC + 2.0, 0.14], [tS + 2.4, 0.14], [tS + 3, 0]]);
      const topA = [A0[0] - 20, A0[1] - lenA * 0.22], hold = [qx + 122, gy - qh * 0.5];
      let tF = null, tB = null;
      if (!walking) {
        if (lt < tC) {
          const tap = (t0) => { const d = lt - t0; return d > -0.32 && d < 0 ? Math.sin((d + 0.32) / 0.32 * Math.PI) * 46 : 0; };
          tF = kf(lt, [[tW + 3.8, [qx + 150, gy - 230]], [tK + 0.3, topA]]); tF = [tF[0], tF[1] - tap(k1) - tap(k2)];
          tB = kf(lt, [[tW + 3.8, [qx + 110, gy - 240]], [tK + 0.3, [A0[0] - 70, A0[1] - 10]]]);
        } else if (lt < tA + 0.6) {
          const onB = [Bpos[0] - 60, Bpos[1] - lenB * 0.2], onB2 = [Bpos[0] - 104, Bpos[1] - 6];
          tF = kf(lt, [[tC, topA], [tC + 0.35, onB]]); tB = kf(lt, [[tC, [A0[0] - 70, A0[1] - 10]], [tC + 0.35, onB2]]);
          if (lt > tC + 0.35) { tF = onB; tB = onB2; }
          if (lt > tA + 0.2) { const k = ease.inOut(prog(lt, tA + 0.2, tA + 0.6)); tF = [lerp(onB[0], A0[0] + 40, k), lerp(onB[1], A0[1] - 30, k)]; tB = [lerp(onB2[0], A0[0] - 90, k), lerp(onB2[1], A0[1] - 6, k)]; }
        } else {
          tF = kf(lt, [[tA + 0.6, [A0[0] + 40, A0[1] - 30]], [tA + 1.4, [hold[0] + 70, hold[1] + 46]]]);
          tB = kf(lt, [[tA + 0.6, [A0[0] - 90, A0[1] - 6]], [tA + 1.4, [hold[0] - 30, hold[1] + 54]]]);
        }
      }
      if (lt > tA + 1.4) { tF = [hold[0] + 70, hold[1] + 46]; tB = [hold[0] - 30, hold[1] + 54]; }
      if (tF) { o.armF = armIK('qin', qx, gy, qh, o, tF[0], tF[1]).ang; o.armB = armIK('qin', qx, gy, qh, o, tB[0], tB[1]).ang; }
      if (walking) o.walk = lt * 5;
      const carried = lift > 0;
      const Apos = carried ? [lerp(A0[0], hold[0], lift), lerp(A0[1], hold[1], lift) + (lt > tA + 1.6 ? Math.abs(Math.sin(lt * 5)) * 4 : 0)] : [A0[0] + shake(lt, k1) + shake(lt, k2), A0[1]];
      let qr;
      S.layer(0.85, () => {
        S.melon(Bpos[0], Bpos[1], lenB, { tod, rot: Brot, crack: roll, lit: 0.5, rim: 0.55, dark: 0.12 });
        if (roll > 0 && aside < 0.6) S.light(Bpos[0] + 12, Bpos[1] - 24, 150, 'rgba(255,236,200,0.2)', Math.sin(roll * Math.PI * 0.5) * (1 - aside / 0.6));
        if (!carried) S.melon(Apos[0], Apos[1], lenA, { tod, rot: 0.04, carve: S.MARK, carveA: 0.85, lit: 0.5, rim: 0.6, dark: 0.1 });
        qr = S.person('qin', qx, gy, qh, o);
        if (carried) {
          S.melon(Apos[0], Apos[1], lenA, { tod, rot: lerp(0.04, -0.05, lift), carve: S.MARK, carveA: 0.85, lit: 0.5, rim: 0.6, dark: 0.1, shadow: lerp(1, 0, lift) });
          hand(qr.hand[0] + 6, qr.hand[1] - 16, qh, p.fig, p.rim, -1);
        }
        for (const t0 of [k1, k2]) { const d = lt - t0; if (d > 0 && d < 0.8) S.light(topA[0] + 20, topA[1] + 30, 60 + d * 200, 'rgba(255,240,210,0.22)', 1 - d / 0.8); }
      });
      S.layer(1.0, () => ctx.drawImage(nearLeaves(tod), -300, 1780));
      S.motes(lt, { n: 28, seed: 19, x: 0, y: 500, w: 800, h: 900, alpha: 0.3, vy: 2, vx: 3 });
      S.vignette(0.42);
      S.say(api, lt, { qin: keepSafe(toScreen(C, qr.head[0] + 30, qr.head[1] - 170, 0.85)) });
    },
    cues(V, api) {
      const out = api.steps.filter(s => s.say).map(s => ({ t: s.lt, type: 'say' }));
      const kn = api.steps.find(s => s.show === 'knock'); if (kn) out.push({ t: kn.lt + 0.9, type: 'knock' }, { t: kn.lt + 1.6, type: 'knock' });
      return out;
    },
  });

  // ================================================================ s11 gift
  // afternoon at the shed. The tricycle bed is stacked with bags of 冬瓜干. He comes out of the doorway with one small
  // bag in his hands: "这包不要钱，给她家孩子。" and lays it in the cardboard box on 晓禾's tricycle.
  function cardboard(x, y, w, h, tod, part) {    // (x, y) = bottom-left of the front face
    const p = S.TOD[tod];
    if (part === 'back') {        // inside of the box and the back flap standing up
      ctx.fillStyle = '#3a2a1b'; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w, y - h); ctx.lineTo(x + w - 18, y - h - 20); ctx.lineTo(x + 18, y - h - 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8c6c47'; ctx.beginPath(); ctx.moveTo(x + 18, y - h - 20); ctx.lineTo(x + w - 18, y - h - 20); ctx.lineTo(x + w - 30, y - h - 78); ctx.lineTo(x + 24, y - h - 72); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.strokeStyle = p.rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 24, y - h - 72); ctx.lineTo(x + w - 30, y - h - 78); ctx.stroke(); ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = '#7d5f3e'; ctx.fillRect(x, y - h, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, y - h, w, 6);
    ctx.fillStyle = 'rgba(214,196,156,0.35)'; ctx.fillRect(x + w * 0.43, y - h, w * 0.14, h);       // tape
    ctx.fillStyle = '#6a5034'; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x - 30, y - h + 46); ctx.lineTo(x - 6, y - h + 52); ctx.lineTo(x + 2, y - h + 6); ctx.closePath(); ctx.fill();   // side flap hanging open
    ctx.globalAlpha = 0.65; ctx.strokeStyle = p.rim; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + w, y - h); ctx.lineTo(x + w, y); ctx.moveTo(x, y - h); ctx.lineTo(x + w, y - h); ctx.stroke(); ctx.globalAlpha = 1;
  }
  T.register('gift', {
    draw(ctx, V, lt, api) {
      const tod = 'day', p = S.TOD[tod], hz = 1120;
      const fe = S.stepAt(api, 'fetch'), bx = S.stepAt(api, 'box'), sy = api.steps.find(s => s.say);
      const tF = fe ? fe.lt : 0.5, tS = sy ? sy.lt : 4.1, tB = bx ? bx.lt : 7.5;
      const C = S.camera(lt, { dur: api.dur, z0: 1.0, z1: 1.06, x0: 0, x1: 20, y0: 0, y1: 30 });
      S.layer(0.05, () => { S.sky(tod, { horizon: hz }); S.sun(930, 930, 50, tod, 0.9); });
      S.layer(0.2, () => S.hills(tod, 29, { horizon: hz }));
      S.layer(0.3, () => S.fog(tod, lt, hz - 30, 0.22, 6, 1.1));
      S.layer(0.6, () => {
        S.ground(tod, hz);
        ctx.save(); ctx.beginPath(); ctx.moveTo(500, hz); ctx.lineTo(W + 300, hz); ctx.lineTo(W + 300, 1400); ctx.closePath(); ctx.clip(); S.field(tod, 41, { horizon: hz, vx: 900 }); ctx.restore();
        const yg = ctx.createLinearGradient(0, hz, 0, H); yg.addColorStop(0, 'rgba(150,130,95,0.2)'); yg.addColorStop(1, 'rgba(84,68,48,0.55)'); ctx.fillStyle = yg; ctx.fillRect(-300, hz, W + 600, H);
      });
      S.layer(0.85, () => shed(-230, 1590, 580, 720, tod, { doorX: 0.5, doorW: 200, doorH: 600, hatX: 0.22, hoe: false, wall: '#6b5b4a', straw: '#5e4d37', lx: 1, rimA: 0.65 }));
      ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.24; ctx.fillStyle = '#ffb870'; ctx.fillRect(0, 0, W, H); ctx.restore();
      // ---- the tricycle, its bed heaped with melons, the box at the back
      const tx = 560, ty = 1730, ts = 1.8;
      const bedL = tx - 90 * ts, bedR = tx + 140 * ts, rail = ty - 205 * ts;
      const boxW = 150, boxH = 112, boxX = bedL + 14, boxY = rail + 36;
      const qh = 650, gy = 1700, xh = 610;
      const qx = kf(lt, [[0, 40], [tF + 0.1, 40], [tF + 2.9, 250], [tB + 0.1, 250], [tB + 0.6, 268]], ease.inOut);
      const walking = lt > tF + 0.1 && lt < tF + 2.8;
      const out = ease.inOut(prog(lt, tF, tF + 1.3));         // stepping out of the dark doorway into the light
      const put = ease.inOut(prog(lt, tB, tB + 1.1)), rise = ease.inOut(prog(lt, tB + 1.3, tB + 2.3));
      const o = { tod, facing: 1, light: [1, -0.3] };
      o.bend = lerp(0.04, 0.24, put) * (1 - rise * 0.8) + Math.sin(lt * 1.5) * 0.008; o.crouch = lerp(0, 0.06, put) * (1 - rise);
      o.head = kf(lt, [[0, 0.32], [tF + 2.9, 0.28], [tS + 0.3, 0.04], [tS + 2.8, 0.1], [tB, 0.34], [tB + 1.2, 0.4], [tB + 2.3, 0.12]]);
      const sl = 96, hold = [qx + 112, gy - qh * 0.53], into = [boxX + boxW / 2 + 4, boxY - boxH + 4];
      const mpos = lt < tB ? [hold[0], hold[1] + (walking ? Math.abs(Math.sin((lt - tF) * 5)) * 3 : 0)] : kf(lt, [[tB, hold], [tB + 0.8, [into[0] - 4, into[1] - 70]], [tB + 1.15, [into[0], into[1] - 6]]]);
      const inBox = lt > tB + 0.85;
      const tgt = lt < tB + 1.2 ? mpos : kf(lt, [[tB + 1.2, [into[0] - 10, into[1] - 30]], [tB + 2.3, [qx + 50, gy - qh * 0.4]]]);
      o.armF = armIK('qin', qx, gy, qh, o, tgt[0] + 34, tgt[1] + 26).ang;
      o.armB = armIK('qin', qx, gy, qh, o, tgt[0] - 20, tgt[1] + 34).ang;
      if (lt > tB + 2.3) { o.armF = [0.08, 0.3]; o.armB = [0.0, 0.2]; }
      if (walking) o.walk = (lt - tF) * 5;
      let qr, xr;
      S.layer(1.0, () => {
        // 晓禾 behind the tricycle, by the handlebars, watching
        xr = S.person('xiao', 880, 1652, xh, { tod, facing: -1, light: [1, -0.3], t: lt, head: kf(lt, [[0, 0.12], [tS + 0.3, 0.04], [tB, 0.24]]), armF: kf(lt, [[tS + 1.4, [0.1, 0.35]], [tS + 2.2, [0.3, 1.5]]]), armB: [0.05, 0.25] });
        // heap of melons in the bed (back rows first)
        const r = rng(41), heap = [];
        for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) heap.push([bedL + 200 + i * 62 + row * 30 + (r() - 0.5) * 10, rail - 18 - row * 58 + (r() - 0.5) * 8, 84 * (0.92 + r() * 0.14), (r() - 0.5) * 0.3]);
        heap.sort((a, b) => a[1] - b[1]);
        cardboard(boxX, boxY, boxW, boxH, tod, 'back');
        if (inBox) S.bag(mpos[0], mpos[1] - 30, sl, { rot: -0.05, shadow: 0, seed: 7 });
        cardboard(boxX, boxY, boxW, boxH, tod, 'front');
        for (const [mx, my, ml, mr] of heap) S.bag(mx, my, ml, { rot: mr, shadow: 0.3, seed: Math.round(mx) % 5 + 1, tint: [p.fig, 0.12] });
        S.tricycle(tx, ty, ts, tod, { facing: 1, rim: 0.6, load: 0 });
        // a plank side-board on the bed
        const bh = ty - 150 * ts + 20 - (rail + 6);
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(bedL, rail + 6, bedR - bedL, bh);
        for (let k = 1; k < 3; k++) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bedL, rail + 6 + bh * k / 3, bedR - bedL, 3); }
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bedL + 30, rail + 6, 8, bh); ctx.fillRect(bedR - 38, rail + 6, 8, bh);
        ctx.globalAlpha = 0.7; ctx.strokeStyle = p.rim; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bedL, rail + 6); ctx.lineTo(bedR, rail + 6); ctx.stroke(); ctx.globalAlpha = 1;
        qr = S.person('qin', qx, gy, qh, { ...o, rimColor: mixRGB([60, 52, 44], [255, 243, 214], out), halo: 0.08 * out });
        if (!inBox) {
          S.bag(mpos[0], mpos[1] - 30, sl, { rot: -0.05, shadow: 0, seed: 7, tint: [p.fig, lerp(0.6, 0, out)] });
          hand(qr.hand[0] + 2, qr.hand[1] - 10, qh, p.fig, p.rim, 1);
        }
      });
      S.motes(lt, { n: 24, seed: 33, x: 300, y: 500, w: 780, h: 1000, alpha: 0.3, vy: 2, vx: -2 });
      S.vignette(0.4);
      S.say(api, lt, { qin: keepSafe(toScreen(C, qr.head[0] + 40, qr.head[1] - 160)) });
    },
    cues(V, api) {
      const out = api.steps.filter(s => s.say).map(s => ({ t: s.lt, type: 'say' }));
      const bx = api.steps.find(s => s.show === 'box'); if (bx) out.push({ t: bx.lt + 1.0, type: 'box' });
      return out;
    },
  });

  // ================================================================ s09b dry (冬瓜 → 冬瓜干)
  // Three shots. A: close-up on the chopping board, the cleaver takes thin slices off a long piece of 冬瓜 (rind on top).
  // B: the yard; he crouches by a 竹匾 on trestles laying the slices out, 晓禾 asks how long, "三个日头。急不得。"
  // C: from above, the tray in the sun: three days go by (the light swings, dims to night, comes back) and the slices
  // shrink, wrinkle and turn the colour of honey.
  const DRY_BG = () => S.cached('dry_bgA', W, H, g => {
    const sk = g.createLinearGradient(0, 0, 0, 1100); sk.addColorStop(0, '#f1e3c4'); sk.addColorStop(0.6, '#d8c39a'); sk.addColorStop(1, '#a88f63');
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    g.filter = 'blur(26px)'; const r = rng(77);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${60 + r() * 40},${90 + r() * 40},${50 + r() * 20},${0.35 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * W, 120 + r() * 600, 60 + r() * 120, 40 + r() * 90, r() * 3, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,248,226,0.6)'; g.beginPath(); g.ellipse(760, 380, 260, 200, 0, 0, TAU); g.fill();
    g.filter = 'none';
    // the table top (board), seen at a slant
    const bd = g.createLinearGradient(0, 960, 0, H); bd.addColorStop(0, '#9c7448'); bd.addColorStop(0.5, '#b88a58'); bd.addColorStop(1, '#6e4c2c');
    g.fillStyle = bd; g.fillRect(0, 960, W, H - 960);
    g.globalAlpha = 0.22; g.strokeStyle = '#4a321c';
    for (let i = 0; i < 46; i++) { const y = 975 + i * 21 + r() * 8; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 14, W * 0.7, y + (r() - 0.5) * 14, W, y + (r() - 0.5) * 10); g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 960, W, 10);
    g.fillStyle = 'rgba(255,240,210,0.25)'; g.fillRect(0, 970, W, 3);
  });
  // the long piece of 冬瓜 lying on the board, from its cut end x0 to x1; base on the board at y
  function melonPiece(x0, x1, y, h) {
    ctx.save();
    const top = x => y - h + Math.sin((x - x0) / (x1 - x0) * Math.PI) * 10;
    const body = () => { ctx.beginPath(); ctx.moveTo(x0, y); for (let x = x0; x <= x1; x += 10) ctx.lineTo(x, top(x)); ctx.quadraticCurveTo(x1 + 40, y - h * 0.5, x1, y); ctx.closePath(); };
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse((x0 + x1) / 2 + 20, y + 8, (x1 - x0) / 2 + 30, 18, 0, 0, TAU); ctx.fill();
    const fg = ctx.createLinearGradient(0, y - h, 0, y); fg.addColorStop(0, '#dfe9cf'); fg.addColorStop(0.35, '#eef2e2'); fg.addColorStop(0.8, '#e5e3c6'); fg.addColorStop(1, '#c8c49c');
    body(); ctx.fillStyle = fg; ctx.fill();
    ctx.save(); body(); ctx.clip();
    // seed side at the bottom: soft yellow fibres
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#e8dca8'; ctx.fillRect(x0, y - h * 0.22, x1 - x0 + 60, h * 0.22);
    ctx.globalAlpha = 0.25; ctx.strokeStyle = '#b9ad78'; ctx.lineWidth = 2; const r = rng(3);
    for (let i = 0; i < 18; i++) { const xx = x0 + r() * (x1 - x0); ctx.beginPath(); ctx.moveTo(xx, y); ctx.quadraticCurveTo(xx + 10, y - h * 0.12, xx + (r() - 0.5) * 30, y - h * 0.24); ctx.stroke(); }
    // rind: pale green layer under the dark skin, frost bloom on top
    ctx.globalAlpha = 1;
    const rind = (off, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (let x = x0 - 10; x <= x1 + 40; x += 10) ctx.lineTo(x, top(Math.min(x, x1)) + off); ctx.stroke(); };
    rind(18, 30, '#bcd59c'); rind(4, 16, '#33573a'); rind(-2, 5, '#9fb6a0');
    // the fresh cut end: lighter, wet
    const cg = ctx.createLinearGradient(x0, 0, x0 + 34, 0); cg.addColorStop(0, '#fbfdf2'); cg.addColorStop(1, 'rgba(251,253,242,0)');
    ctx.fillStyle = cg; ctx.fillRect(x0, y - h - 20, 34, h + 20);
    ctx.restore();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 + 2, y - 4); ctx.lineTo(x0 + 2, top(x0) + 6); ctx.stroke();
    ctx.restore();
  }
  // a Chinese cleaver (菜刀) at 3/4 view: blade edge bottom at (x, y)
  function cleaver(x, y, tod) {
    const p = S.TOD[tod], bw = 74, bh = 250, dx = 64, dy = -44;
    ctx.save();
    const sg = ctx.createLinearGradient(x, 0, x + dx + bw * 0.2, 0); sg.addColorStop(0, '#e9ecec'); sg.addColorStop(0.5, '#9aa2a4'); sg.addColorStop(1, '#4b5153');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + dx, y + dy - bh); ctx.lineTo(x, y - bh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2f3436'; ctx.beginPath(); ctx.moveTo(x, y - bh); ctx.lineTo(x + dx, y + dy - bh); ctx.lineTo(x + dx + 8, y + dy - bh - 4); ctx.lineTo(x + 8, y - bh - 4); ctx.closePath(); ctx.fill();   // spine
    ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.8; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    ctx.globalAlpha = 1;
    // handle out to the right, toward the hand
    ctx.lineCap = 'round'; ctx.strokeStyle = '#5a3b22'; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(x + dx * 0.5, y + dy * 0.5 - bh + 8); ctx.lineTo(x + dx * 0.5 + 170, y + dy * 0.5 - bh - 12); ctx.stroke();
    ctx.strokeStyle = '#8a6440'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x + dx * 0.5 + 10, y + dy * 0.5 - bh - 6); ctx.lineTo(x + dx * 0.5 + 165, y + dy * 0.5 - bh - 24); ctx.stroke();
    ctx.restore();
    return [x + dx * 0.5 + 110, y + dy * 0.5 - bh - 6];
  }
  // a slice lying flat on a surface seen at a slant (fy = vertical foreshortening)
  const flatSlice = (x, y, len, fy, o) => { ctx.save(); ctx.translate(x, y); ctx.scale(1, fy); S.slice(0, 0, len, o); ctx.restore(); };
  // spots on the 竹匾 (unit ellipse), stable order
  const TRAY_SPOTS = (() => { const r = rng(91), out = []; for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) { const u = (i - 2.5) / 3.1 + (r() - 0.5) * 0.08, v = (j - 2) / 2.7 + (r() - 0.5) * 0.08; if (u * u + v * v < 0.86) out.push({ u, v, rot: (r() - 0.5) * 1.4, seed: Math.floor(r() * 12), flip: r() < 0.5 }); } return out; })();
  T.register('dry', {
    draw(ctx, V, lt, api) {
      const tod = 'day', p = S.TOD[tod];
      const sl = S.stepAt(api, 'slice'), la = S.stepAt(api, 'lay'), dy_ = S.stepAt(api, 'days');
      const says = api.steps.filter(s => s.say);
      const tS = sl ? sl.lt : 0, tB = says.length ? says[0].lt : tS + 4.2, tL = la ? la.lt : tB + 5, tD = dy_ ? dy_.lt : tL + 3, dD = dy_ ? dy_.dur : 6.5;
      if (lt < tB) {
        // ---------------------------------------------------------------- A: slicing
        S.camera(lt, { dur: tB, z0: 1.02, z1: 1.09, x0: -10, x1: 20, y0: 0, y1: 40 });
        S.layer(0.4, () => ctx.drawImage(DRY_BG(), 0, 0));
        const chops = [0, 1, 2, 3, 4].map(i => tS + 0.55 + i * 0.7), step = 30, x0 = 360, base = 1160;
        const done = chops.filter(c => lt > c + 0.1).length;
        const cutX = x0 + done * step;
        S.layer(1.0, () => {
          // slices already cut, flat on the board in front of the piece
          const pile = [[230, 1250, -0.3], [300, 1300, 0.25], [190, 1330, 0.1], [270, 1370, -0.15], [350, 1250, 0.4]];
          for (let i = 0; i < 3; i++) flatSlice(pile[i][0], pile[i][1], 230, 0.6, { dry: 0, rot: pile[i][2], seed: i + 3, shadow: 0.6 });
          for (let i = 0; i < 5; i++) {
            const c = chops[i]; if (lt < c + 0.1) continue;
            const k = ease.out(prog(lt, c + 0.1, c + 0.45)), q = [[420, 1330, 0.5], [160, 1420, -0.2], [380, 1410, 0.2], [250, 1460, -0.45], [470, 1450, 0.1]][i];
            const sx = x0 + i * step - 8, sy = base - 90;
            const x = lerp(sx, q[0], k), y = lerp(sy, q[1], k);
            flatSlice(x, y, 230, lerp(0.15, 0.6, k), { dry: 0, rot: lerp(-1.4, q[2], k), seed: i + 6, shadow: k * 0.6 });
          }
          melonPiece(cutX, 1000, base, 190);
          // the cleaver: comes down through the flesh, lifts, moves on one slice's width
          const nxt = chops.find(c => lt < c + 0.25);
          let ky = -230, kx = cutX;
          if (nxt != null) {
            const d = lt - nxt;
            ky = d < -0.22 ? -230 : d < 0 ? lerp(-230, -60, ease.in(prog(d, -0.22, 0))) : d < 0.1 ? lerp(-60, 0, prog(d, 0, 0.1)) : lerp(0, -40, prog(d, 0.1, 0.25));
            kx = x0 + chops.indexOf(nxt) * step;
          }
          const grip = cleaver(kx - 4, base + ky + 4, tod);
          // his forearm in a dark work sleeve from the right edge, the fist around the handle
          ctx.save(); ctx.lineCap = 'round';
          ctx.strokeStyle = '#353c48'; ctx.lineWidth = 120; ctx.beginPath(); ctx.moveTo(W + 140, grip[1] - 210); ctx.lineTo(grip[0] + 170, grip[1] - 40); ctx.stroke();
          ctx.strokeStyle = '#a77a58'; ctx.lineWidth = 78; ctx.beginPath(); ctx.moveTo(grip[0] + 170, grip[1] - 40); ctx.lineTo(grip[0] + 70, grip[1] - 4); ctx.stroke();
          ctx.globalAlpha = 0.5; ctx.strokeStyle = p.rim; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W + 140, grip[1] - 270); ctx.lineTo(grip[0] + 150, grip[1] - 98); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.fillStyle = '#b98b66'; ctx.beginPath(); ctx.ellipse(grip[0] + 20, grip[1] + 4, 62, 48, -0.25, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(80,50,30,0.55)'; ctx.lineWidth = 3;
          for (let i = 0; i < 4; i++) { const fx = grip[0] - 22 + i * 22; ctx.beginPath(); ctx.moveTo(fx, grip[1] + 18 - i * 6); ctx.quadraticCurveTo(fx + 4, grip[1] + 40 - i * 6, fx + 14, grip[1] + 44 - i * 7); ctx.stroke(); }
          ctx.fillStyle = 'rgba(255,236,200,0.35)'; ctx.beginPath(); ctx.ellipse(grip[0] + 8, grip[1] - 22, 34, 12, -0.25, 0, TAU); ctx.fill();
          ctx.restore();
          for (const c of chops) { const d = lt - c - 0.1; if (d > 0 && d < 0.5) S.light(kx + 20, base - 20, 80 + d * 160, 'rgba(255,250,230,0.25)', 1 - d / 0.5); }
        });
        S.motes(lt, { n: 22, seed: 12, x: 300, y: 200, w: 700, h: 700, alpha: 0.35, vy: 3 });
        S.vignette(0.4);
        return;
      }
      if (lt < tD) {
        // ---------------------------------------------------------------- B: laying out in the yard
        const hz = 1060, lb = lt - tB;
        const C = S.camera(lb, { dur: tD - tB, z0: 1.0, z1: 1.05, x0: 0, x1: 20, y0: 0, y1: 20 });
        S.layer(0.05, () => { S.sky(tod, { horizon: hz }); S.sun(900, 470, 48, tod, 0.95); });
        S.layer(0.2, () => S.hills(tod, 13, { horizon: hz }));
        S.layer(0.5, () => { S.ground(tod, hz); S.house(-160, hz + 120, 720, tod, { door: true, wall: '#d8d0bf' }); });
        S.layer(0.6, () => { const yg = ctx.createLinearGradient(0, hz, 0, H); yg.addColorStop(0, 'rgba(160,140,100,0.25)'); yg.addColorStop(1, 'rgba(80,64,44,0.55)'); ctx.fillStyle = yg; ctx.fillRect(-300, hz, W + 600, H); });
        const tx = 500, ty = 1310, rx = 320, ry = 100;
        const nAll = TRAY_SPOTS.length, n0 = 9, nLay = la ? Math.floor(n0 + (nAll - n0) * prog(lt, tL + 0.2, tL + la.dur - 0.2)) : n0;
        const qh = 600, qx = 840, gy = 1540, xh = 700;
        const o = { tod, facing: -1, light: [1, -0.3], bend: 0.5, crouch: 0.55, head: 0.18 };
        // his hands: holding a slice during the talk, then basin → tray, one slice each 0.7 s or so
        const basin = [950, 1470];
        let tgt = [720, 1300], hold = true;
        if (la && lt > tL) {
          const per = la.dur / Math.max(1, nAll - n0), u = ((lt - tL) / per) % 1, idx = Math.min(nAll - 1, nLay);
          const sp = TRAY_SPOTS[idx], dst = [tx + sp.u * rx, ty + sp.v * ry];
          tgt = u < 0.5 ? [lerp(basin[0], dst[0], ease.inOut(u * 2)), lerp(basin[1] - 30, dst[1], ease.inOut(u * 2)) - Math.sin(u * 2 * Math.PI) * 60] : [lerp(dst[0], basin[0], ease.inOut(u * 2 - 1)), lerp(dst[1], basin[1] - 30, ease.inOut(u * 2 - 1))];
          hold = u < 0.5;
        }
        const says1 = says[1] ? says[1].lt : tB + 2;
        o.head = kf(lt, [[tB, 0.3], [says1 - 0.2, 0.3], [says1 + 0.3, 0.05], [tL, 0.05], [tL + 0.5, 0.3]]);
        o.armF = armIK('qin', qx, gy, qh, o, tgt[0], tgt[1]).ang; o.armB = armIK('qin', qx, gy, qh, o, tgt[0] + 60, tgt[1] + 50).ang;
        let qr, xr;
        S.layer(1.0, () => {
          // trestles and the tray
          ctx.fillStyle = '#3a2c1f';
          for (const lx of [tx - 230, tx + 230]) { ctx.fillRect(lx - 70, ty + 10, 12, 230); ctx.fillRect(lx + 58, ty + 10, 12, 230); ctx.fillRect(lx - 70, ty + 60, 140, 10); }
          S.tray(tx, ty, rx, ry, tod);
          for (let i = 0; i < nLay; i++) { const sp = TRAY_SPOTS[i]; flatSlice(tx + sp.u * rx, ty + sp.v * ry, 92, 0.42, { dry: 0, rot: sp.rot, seed: sp.seed, flip: sp.flip, shadow: 0.5 }); }
          // enamel basin of fresh slices beside him
          ctx.fillStyle = '#e9ece8'; ctx.beginPath(); ctx.ellipse(basin[0], basin[1] + 30, 100, 34, 0, 0, Math.PI); ctx.lineTo(basin[0] - 100, basin[1]); ctx.fill();
          ctx.fillStyle = '#f4f6f2'; ctx.beginPath(); ctx.ellipse(basin[0], basin[1], 104, 30, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#2f5d8a'; ctx.lineWidth = 6; ctx.stroke();
          for (let i = 0; i < 5; i++) flatSlice(basin[0] - 60 + i * 28, basin[1] - 4 + (i % 2) * 8, 70, 0.4, { dry: 0, rot: (i - 2) * 0.4, seed: i + 1, shadow: 0 });
          xr = S.person('xiao', 190, gy, xh, { tod, facing: 1, light: [1, -0.3], t: lt, head: kf(lt, [[tB, 0.05], [tL, 0.18]]), armF: [0.15, 0.4], armB: [0.05, 0.25] });
          qr = S.person('qin', qx, gy, qh, o);
          if (hold) { ctx.save(); ctx.translate(qr.hand[0] - 8, qr.hand[1] + 4); ctx.rotate(-0.4); flatSlice(0, 0, 80, 0.6, { dry: 0, seed: 4, shadow: 0 }); ctx.restore(); }
        });
        S.motes(lt, { n: 24, seed: 17, x: 0, y: 400, w: W, h: 900, alpha: 0.3, vy: 2, vx: 2 });
        S.vignette(0.4);
        S.say(api, lt, { xiao: keepSafe(toScreen(C, xr.head[0] + 70, xr.head[1] - 150)), qin: keepSafe(toScreen(C, qr.head[0] - 60, qr.head[1] - 170)) });
        return;
      }
      // ---------------------------------------------------------------- C: three days in the sun, from above
      const lc = lt - tD, u = clamp(lc / dD) * 3, day = Math.min(2, Math.floor(u)), f = u - day;
      const dry = ease.inOut(clamp(lc / (dD * 0.92)));
      const bright = (day === 0 && f < 0.5) || (day === 2 && f > 0.5) ? 1 : clamp(Math.sin(clamp(f) * Math.PI) * 1.7);   // nights only between the days
      S.camera(lc, { dur: dD, z0: 1.0, z1: 1.08, y0: 0, y1: -20 });
      S.layer(0.6, () => {
        ctx.drawImage(S.cached('dry_earth', W, H, g => {
          g.fillStyle = '#8b7556'; g.fillRect(0, 0, W, H); const r = rng(5);
          for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '60,45,30' : '200,180,140'},${0.08 + r() * 0.12})`; g.beginPath(); g.ellipse(r() * W, r() * H, 2 + r() * 10, 1 + r() * 5, r() * 3, 0, TAU); g.fill(); }
        }), 0, 0);
        const tx = 540, ty = 900, rx = 470, ry = 390;
        S.tray(tx, ty, rx, ry, tod);
        for (const sp of TRAY_SPOTS) flatSlice(tx + sp.u * rx * 1.02, ty + sp.v * ry * 1.02, 170, 0.82, { dry, rot: sp.rot, seed: sp.seed, flip: sp.flip, shadow: 0.55 * bright });
      });
      // the shadow of the eave pole sweeps across each day; warm noon light; short blue nights between the days
      ctx.save(); ctx.translate(lerp(-260, W + 260, f), H / 2); ctx.rotate(0.35); ctx.globalAlpha = 0.22 * bright; S.softRect(-40, -H, 80, H * 2, 24, '#1c140c'); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.35 * bright; ctx.fillStyle = '#ffcf80'; ctx.fillRect(0, 0, W, H); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.62 * (1 - bright); ctx.fillStyle = '#121a2e'; ctx.fillRect(0, 0, W, H); ctx.restore();
      S.light(lerp(200, 880, f), 300, 700, 'rgba(255,240,200,0.18)', bright);
      // which day it is, in his hand, small, top left
      const lab = ['第一天', '第二天', '第三天'][day], la_ = Math.min(ease.out(prog(f, 0.05, 0.25)), 1 - ease.in(prog(f, 0.82, 0.98)));
      if (la_ > 0) { S.hand(lab, 102, 404, 58, 1, { color: '#000', alpha: 0.35 * la_, seed: 2 + day }); S.hand(lab, 98, 400, 58, 1, { color: '#fff6e8', alpha: la_, seed: 2 + day }); }
      S.vignette(0.45);
    },
    cues(V, api) {
      const out = api.steps.filter(s => s.say).map(s => ({ t: s.lt, type: 'say' }));
      const sl = api.steps.find(s => s.show === 'slice'); if (sl) for (let i = 0; i < 5; i++) out.push({ t: sl.lt + 0.55 + i * 0.7, type: 'chop' });
      return out;
    },
  });
})();
