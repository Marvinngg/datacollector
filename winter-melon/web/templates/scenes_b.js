/* Scenes, part B: yard (s02), notebook (s03), road (s04), night (s06).
 * One southern village at the end of summer: 白墙黑瓦, bamboo, a cement 晒谷场; the sun behind the people (back-lit). */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, fbm } = K;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- local helpers
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => '#' + rgb(a).map((v, i) => Math.round(lerp(v, rgb(b)[i], clamp(k))).toString(16).padStart(2, '0')).join('');
  const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
  const qb = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
  // layer-local point → screen (the camera of S.layer: zoom about the frame centre, offset by CAM * depth)
  const toScreen = (cam, d, x, y) => { const z = 1 + (cam.z - 1) * d; return [W / 2 + z * (x - W / 2 - cam.x * d), H / 2 + z * (y - H / 2 - cam.y * d)]; };
  const sayCues = api => api.steps.filter(s => s.say).map(s => ({ t: s.lt, type: 'say' }));
  // S.person places (x, y) between the feet of a standing figure; sitting / crouching lift the feet off that line.
  // footY gives how far below y the soles actually land, so a seated or squatting figure can be set on the ground.
  const LEG = { xiao: 0.5, wang: 0.45, qin: 0.47, lin: 0.5, kid: 0.42 };
  function footY(who, h, o) {
    const legL = h * LEG[who], c = o.crouch || 0, s = o.sit || 0, hipY = -legL * (1 - 0.32 * c) + (s ? h * 0.2 * s : 0);
    let m = -1e9;
    for (const sw of [-0.07, 0.09]) { const th = sw + s * 1.5 + c * 1.25, sh = sw - c * 1.0 + (s ? 0.05 : 0); m = Math.max(m, hipY + Math.cos(th) * legL * 0.5 + Math.cos(sh) * legL * 0.47); }
    return m + h * 0.029;
  }
  const seatY = (who, h, o) => -h * LEG[who] + h * 0.2 * (o.sit || 0) - footY(who, h, o);   // hip height above the ground (negative = up)
  // S.person sets ctx.globalAlpha from o.alpha (default 1), which drops the beat's fade and any alpha set around the
  // call; this wrapper carries the current alpha through.
  const person = (who, x, y, h, o = {}) => S.person(who, x, y, h, o);   // S.person now inherits ctx.globalAlpha itself
  /* draw a figure into an offscreen canvas instead of the frame (same transform), so it can be masked — used for the
     phone's cold light on the face. S.person draws with ctx.drawImage only (halo off), so that one call is redirected. */
  function personOff(key, who, x, y, h, o) {
    const c = S.cached(key, W, H, () => {}), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H); g.setTransform(ctx.getTransform());
    ctx.drawImage = (...a) => g.drawImage(...a);
    try { S.person(who, x, y, h, { ...o, halo: 0 }); } finally { delete ctx.drawImage; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  /** a clump of bamboo, cached: (w × h) canvas, culms rising from the bottom centre; leaves in drooping sprays */
  function bamboo(seed, w, h, col) {
    return S.cached(`bbo|${seed}|${w}|${h}|${col}`, w, h, g => {
      const r = rng(seed), sc = w / 360, n = 8 + Math.floor(r() * 5);
      g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const bx = w * 0.5 + (r() - 0.5) * w * 0.32, lean = (r() - 0.5) * 0.55 + (bx - w / 2) / w * 0.9, L = h * (0.62 + r() * 0.36);
        const tx = bx + lean * L * 0.55, ty = h - L, cx = bx + lean * L * 0.12, cy = h - L * 0.55;
        g.lineWidth = (3 + r() * 3.5) * sc; g.beginPath(); g.moveTo(bx, h); g.quadraticCurveTo(cx, cy, tx, ty); g.stroke();
        for (let k = 1; k < 9; k++) { const t = k / 9; g.fillRect(qb(bx, cx, tx, t) - g.lineWidth * 0.9, qb(h, cy, ty, t), g.lineWidth * 1.8, 1.6 * sc); }   // nodes
        for (let j = 0; j < 16; j++) {                 // sprays of narrow leaves, hanging from the upper half
          const t = 0.38 + r() * 0.62, px = qb(bx, cx, tx, t), py = qb(h, cy, ty, t), side = r() < 0.5 ? -1 : 1;
          const nl = 3 + Math.floor(r() * 4);
          for (let q = 0; q < nl; q++) {
            const a = side * (0.5 + r() * 1.1) + Math.PI / 2 * 0 , len = (20 + r() * 22) * sc, droop = 0.35 + r() * 0.5;
            const ang = -Math.PI / 2 + a + side * droop;      // from straight up, swung out to the side and drooping
            const lx = px + Math.cos(ang) * len * 0.5, ly = py + Math.sin(ang) * len * 0.5 + q * 3 * sc;
            g.beginPath(); g.ellipse(lx, ly, len * 0.5, len * 0.09, ang, 0, TAU); g.fill();
          }
        }
      }
    });
  }
  function drawBamboo(seed, x, y, w, h, col, t = 0, sway = 0.006) {   // (x, y) = base centre
    const c = bamboo(seed, w, h, col);
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.7 + seed) * sway); ctx.drawImage(c, -w / 2, -h); ctx.restore();
  }

  /** 白墙黑瓦 cottage, long side to camera. (x, y) = bottom-left; h = wall height. o: wall, roof, line (tile ribs),
   *  gable ('mtw' = stepped 马头墙 ends), win (0..1 warm), winDark, door, rim (colour of a back-light line on the roof ridge) */
  function cottage(x, y, w, h, o = {}) {
    const wall = o.wall, roof = o.roof, rh = h * 0.42, ov = w * 0.045;
    ctx.save();
    ctx.fillStyle = wall; ctx.fillRect(x, y - h, w, h);
    // rain streaks under the eaves, darker plinth
    const sg = ctx.createLinearGradient(0, y - h, 0, y - h * 0.35); sg.addColorStop(0, 'rgba(30,32,30,0.28)'); sg.addColorStop(1, 'rgba(30,32,30,0)');
    ctx.fillStyle = sg; ctx.fillRect(x, y - h, w, h * 0.65);
    const r = rng(Math.round(x * 3 + w));
    ctx.fillStyle = 'rgba(30,32,30,0.10)';
    for (let i = 0; i < 6; i++) { const sx = x + r() * w, sw = 4 + r() * 16; ctx.fillRect(sx, y - h, sw, h * (0.3 + r() * 0.5)); }
    ctx.fillStyle = 'rgba(20,20,20,0.22)'; ctx.fillRect(x, y - h * 0.13, w, h * 0.13);
    // windows and door
    if (o.door) { ctx.fillStyle = o.winDark || 'rgba(20,22,24,0.85)'; ctx.fillRect(x + w * o.door - w * 0.07, y - h * 0.68, w * 0.14, h * 0.68); }
    const nw = o.nwin == null ? 2 : o.nwin;
    for (let i = 0; i < nw; i++) {
      const wx = x + w * (0.22 + i * 0.5) - w * 0.05, wy = y - h * 0.72, ww = w * 0.1, wh = h * 0.24;
      ctx.fillStyle = o.win ? `rgba(255,196,118,${o.win})` : (o.winDark || 'rgba(20,22,24,0.8)'); ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 1; k < 4; k++) ctx.fillRect(wx + ww * k / 4 - 1, wy, 2, wh);
    }
    // roof: a band of dark tiles sloping back to the ridge, eave overhang, ridge with upturned ends
    ctx.fillStyle = roof; ctx.beginPath();
    ctx.moveTo(x - ov, y - h + h * 0.04); ctx.lineTo(x + w + ov, y - h + h * 0.04); ctx.lineTo(x + w - ov * 0.4, y - h - rh); ctx.lineTo(x + ov * 0.4, y - h - rh); ctx.closePath(); ctx.fill();
    if (o.line) { ctx.strokeStyle = o.line; ctx.lineWidth = Math.max(1, w * 0.004); ctx.beginPath(); for (let k = 0; k <= w; k += Math.max(6, w * 0.022)) { ctx.moveTo(x - ov + k * (1 + 2 * ov / w), y - h); ctx.lineTo(x + ov * 0.4 + k * (1 - 0.8 * ov / w), y - h - rh); } ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y - h, w, h * 0.05);     // eave shadow on the wall
    ctx.fillStyle = roof; ctx.beginPath();
    ctx.moveTo(x - ov * 0.6, y - h - rh - h * 0.12); ctx.quadraticCurveTo(x + ov, y - h - rh + h * 0.01, x + w * 0.12, y - h - rh - h * 0.02);
    ctx.lineTo(x + w * 0.88, y - h - rh - h * 0.02); ctx.quadraticCurveTo(x + w - ov, y - h - rh + h * 0.01, x + w + ov * 0.6, y - h - rh - h * 0.12);
    ctx.lineTo(x + w + ov * 0.2, y - h - rh + h * 0.05); ctx.lineTo(x - ov * 0.2, y - h - rh + h * 0.05); ctx.closePath(); ctx.fill();
    if (o.rim) { ctx.globalAlpha = 0.7; ctx.strokeStyle = o.rim; ctx.lineWidth = Math.max(1.5, h * 0.012); ctx.beginPath(); ctx.moveTo(x + w * 0.12, y - h - rh - h * 0.02); ctx.lineTo(x + w * 0.88, y - h - rh - h * 0.02); ctx.stroke(); ctx.globalAlpha = 1; }
    // 马头墙: stepped white gable walls with black caps at both ends
    if (o.gable === 'mtw') {
      // each end: three white steps climbing toward the middle, each capped with a strip of black tile that kicks up at its outer end
      const sw = w * 0.085, cap = Math.max(3, h * 0.07);
      for (const side of [-1, 1]) {
        for (let s = 0; s < 3; s++) {
          const x0 = side < 0 ? x - ov * 0.3 + s * sw : x + w + ov * 0.3 - (s + 1) * sw, top = y - h - rh * (0.2 + s * 0.45);
          ctx.fillStyle = wall; ctx.fillRect(x0, top, sw + 1, y - h + h * 0.04 - top);
          ctx.fillStyle = roof; ctx.beginPath();
          const ox = side < 0 ? x0 - sw * 0.12 : x0 + sw * 1.12, ix = side < 0 ? x0 + sw + 1 : x0 - 1;
          ctx.moveTo(ix, top); ctx.lineTo(ox, top); ctx.lineTo(ox - side * sw * 0.05, top - cap * 1.5); ctx.lineTo(ox + side * sw * 0.18, top - cap * 1.9);
          ctx.quadraticCurveTo(ox, top - cap * 1.2, ox + side * sw * 0.12 * 0, top - cap); ctx.lineTo(ix, top - cap); ctx.closePath(); ctx.fill();
          if (o.rim) { ctx.globalAlpha = 0.6; ctx.fillStyle = o.rim; ctx.fillRect(Math.min(ix, ox), top - cap - 1, Math.abs(ix - ox), Math.max(1, h * 0.008)); ctx.globalAlpha = 1; }
        }
      }
    }
    ctx.restore();
  }

  /** an electric pole (concrete) with a cross-arm; returns the three wire points */
  function pole(x, y, h, col, rim) {
    ctx.save(); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - h * 0.016, y); ctx.lineTo(x + h * 0.016, y); ctx.lineTo(x + h * 0.009, y - h); ctx.lineTo(x - h * 0.009, y - h); ctx.closePath(); ctx.fill();
    const ay = y - h * 0.94, aw = h * 0.14;
    ctx.fillRect(x - aw, ay, aw * 2, h * 0.012);
    const pts = [[x - aw * 0.85, ay - h * 0.012], [x + aw * 0.85, ay - h * 0.012], [x, y - h - h * 0.01]];
    for (const [px, py] of pts) ctx.fillRect(px - h * 0.006, py - h * 0.012, h * 0.012, h * 0.022);
    if (rim) { ctx.globalAlpha = 0.6; ctx.fillStyle = rim; ctx.fillRect(x - h * 0.012, y - h, h * 0.004, h * 0.98); ctx.globalAlpha = 1; }
    ctx.restore();
    return pts;
  }
  function wires(a, b, sag, col, lw = 1.6) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw;
    for (let i = 0; i < a.length; i++) { ctx.beginPath(); ctx.moveTo(a[i][0], a[i][1]); ctx.quadraticCurveTo((a[i][0] + b[i][0]) / 2, (a[i][1] + b[i][1]) / 2 + sag * 2, b[i][0], b[i][1]); ctx.stroke(); }
    ctx.restore();
  }

  // the rim-lit silhouette's shadow, cast on the ground away from a low sun behind the figure
  // fn(g) draws the figure on g (the pose changes every frame, so it is blurred at low resolution: S.blurred)
  function castShadow(fn, x, y, sx, sy, a = 0.28, blur = 6) {
    ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, sx, -sy, 0, 0); ctx.globalAlpha *= a;
    S.blurred(blur, fn); ctx.restore();
  }

  // a small wooden stool (小板凳); (x, y) = seat centre top
  function stool(x, y, w, hgt, col, rim) {
    ctx.save(); ctx.fillStyle = col;
    ctx.fillRect(x - w / 2, y, w, hgt * 0.13);
    ctx.save(); ctx.translate(x - w * 0.36, y); ctx.rotate(0.12); ctx.fillRect(-4, 0, 9, hgt); ctx.restore();
    ctx.save(); ctx.translate(x + w * 0.36, y); ctx.rotate(-0.12); ctx.fillRect(-4, 0, 9, hgt); ctx.restore();
    ctx.fillRect(x - w * 0.36, y + hgt * 0.55, w * 0.72, 6);
    if (rim) { ctx.globalAlpha = 0.7; ctx.fillStyle = rim; ctx.fillRect(x - w / 2, y - 1, w, 2); }
    ctx.restore();
  }

  // the heap of melons in the yard (static layout)
  const YARD_PILE = (() => {
    const r = rng(77), out = [];
    const rows = [{ n: 2, cx: 190, y: 1300, len: 132 }, { n: 3, cx: 175, y: 1338, len: 142 }, { n: 4, cx: 165, y: 1385, len: 152 }, { n: 5, cx: 160, y: 1438, len: 165 }];
    rows.forEach(({ n, cx, y, len }) => {
      for (let i = 0; i < n; i++) {
        const endOn = r() < 0.25, L = len * (0.88 + r() * 0.2);
        out.push({ x: cx - (n - 1) * len * 0.43 + i * len * 0.86 + (r() - 0.5) * 34, y: y + (r() - 0.5) * 14, len: endOn ? L * 0.62 : L, girth: endOn ? 0.75 : 0.46, rot: (r() - 0.5) * (endOn ? 0.15 : 0.4) });
      }
    });
    return out;
  })();

  // ================================================================ s02 yard (晒谷场)
  // morning; melons nobody came to buy piled on the cement floor. 王婶 on a low stool sighs; 晓禾 crouches with her notebook.
  T.register('yard', {
    draw(ctx, V, lt, api) {
      const tod = 'day', hz = 1010, p = S.TOD[tod];
      const wr = S.stepAt(api, 'write'), says = api.steps.filter(s => s.say);
      const cam = S.camera(lt, { dur: api.dur, z0: 1.0, z1: 1.08, x0: -10, x1: 30, y0: -20, y1: 30 });
      const sunX = 190, sunY = 770;
      S.layer(0.04, () => { S.sky(tod, { horizon: hz }); S.sun(sunX, sunY, 50, tod, 0.95); });
      S.layer(0.15, () => S.hills(tod, 17, { horizon: hz }));
      S.layer(0.22, () => S.fog(tod, lt, hz - 50, 0.3, 6, 1.1));
      // the village beyond the yard: cottages and bamboo in the haze
      const haze = mix(p.mid, '#b3bfba', 0.45), hazeRoof = mix(p.near, '#5d6a68', 0.4);
      S.layer(0.3, () => {
        drawBamboo(31, 120, hz + 22, 260, 330, mix(p.mid, '#7f938a', 0.3), lt);
        cottage(200, hz + 30, 300, 95, { wall: mix(haze, '#d2d5cb', 0.3), roof: hazeRoof, gable: 'mtw', nwin: 2 });
        cottage(-60, hz + 26, 230, 80, { wall: mix(haze, '#d2d5cb', 0.22), roof: hazeRoof, nwin: 1 });
        drawBamboo(32, 560, hz + 30, 300, 380, mix(p.mid, '#7f938a', 0.2), lt);
        cottage(640, hz + 34, 340, 105, { wall: mix(haze, '#d2d5cb', 0.26), roof: hazeRoof, gable: 'mtw', door: 0.5, nwin: 2 });
      });
      S.layer(0.32, () => S.fog(tod, lt * 0.8 + 300, hz + 20, 0.22, 8, 1.2));
      // the floor: grass verge at the far edge, then the cement 晒谷场 catching the low sun
      S.layer(0.6, () => {
        ctx.fillStyle = mix(p.near, '#6d7a52', 0.3); ctx.fillRect(-300, hz + 20, W + 600, 40);
        const fl = S.cached('yard_floor', W + 600, H - hz, g => {
          const gg = g.createLinearGradient(0, 0, 0, H - hz);
          gg.addColorStop(0, '#d9cfb6'); gg.addColorStop(0.25, '#b9ad91'); gg.addColorStop(1, '#6f6754');
          g.fillStyle = gg; g.fillRect(0, 0, W + 600, H - hz);
          // slab joints in perspective toward a vanishing point beyond the sun
          g.strokeStyle = 'rgba(60,52,40,0.12)'; g.lineWidth = 2;
          const vx = 260 + 300;
          for (let i = -8; i <= 14; i++) { g.beginPath(); g.moveTo(vx + i * 30, 58); g.lineTo(vx + i * 260, H - hz); g.stroke(); }
          for (let j = 0; j < 9; j++) { const e = Math.pow(j / 9, 2.1), y = 58 + e * (H - hz - 58); g.globalAlpha = 0.5 + e * 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W + 600, y); g.stroke(); }
          g.globalAlpha = 1;
          // grit and old stains
          const r = rng(23);
          for (let i = 0; i < 2200; i++) { const y = 50 + Math.pow(r(), 1.3) * (H - hz); g.fillStyle = r() < 0.5 ? 'rgba(40,34,24,0.12)' : 'rgba(255,248,230,0.10)'; g.fillRect(r() * (W + 600), y, 1 + r() * 2.5 * (y / 600), 1 + r() * 1.5); }
          g.filter = 'blur(26px)';
          for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(60,52,38,0.10)'; g.beginPath(); g.ellipse(r() * (W + 600), 120 + r() * (H - hz - 120), 60 + r() * 160, 18 + r() * 40, 0, 0, TAU); g.fill(); }
          g.filter = 'none';
        });
        ctx.drawImage(fl, -300, hz + 52);
        // the low sun glares on the cement just below the verge
        S.light(sunX + 60, hz + 90, 520, 'rgba(255,244,214,0.45)', 0.9);
      });
      // bamboo grove at the right edge of the yard, close enough to sway
      S.layer(0.5, () => { drawBamboo(41, 980, hz + 70, 520, 980, mix(p.near, '#3e4a37', 0.3), lt, 0.01); drawBamboo(42, 1160, hz + 80, 460, 860, mix(p.near, '#36412f', 0.4), lt + 2, 0.012); });
      // a bamboo tray (竹匾) of drying beans, a basket
      S.layer(0.75, () => {
        ctx.save(); ctx.translate(820, 1255); ctx.scale(1, 0.32);
        ctx.fillStyle = '#5a4c33'; ctx.beginPath(); ctx.arc(0, 0, 150, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7a6a48'; ctx.beginPath(); ctx.arc(0, -6, 138, 0, TAU); ctx.fill();
        const r = rng(5); ctx.fillStyle = '#463a28'; for (let i = 0; i < 220; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 128; ctx.beginPath(); ctx.arc(Math.cos(a) * d, -6 + Math.sin(a) * d, 4, 0, TAU); ctx.fill(); }
        ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.6; ctx.strokeStyle = p.rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(820, 1255, 150, 48, 0, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke(); ctx.restore();
      });
      // the heap of melons nobody came for: a loose mound, the back ones higher and smaller, some lying end-on
      const pile = YARD_PILE;
      S.layer(0.85, () => {
        // the heap's long shadow, toward the lens
        ctx.save(); ctx.globalAlpha *= 0.22;
        S.soft('yard_heap_sh', [-60, 1440, 620, 260], 22, g => { g.fillStyle = '#1e1a12'; g.beginPath(); g.moveTo(-60, 1440); g.lineTo(380, 1440); g.lineTo(560, 1640); g.lineTo(60, 1700); g.closePath(); g.fill(); });
        ctx.restore();
        for (const m of pile) S.melon(m.x, m.y, m.len, { tod, rot: m.rot, girth: m.girth, dark: 0.4, rim: 0.85, lit: 0.45 });
        S.melon(600, 1600, 175, { tod, rot: 0.25, dark: 0.36, rim: 0.8, lit: 0.5 });          // one that rolled away
      });
      // 王婶 on her stool beside the heap: a slow breath, and each of her lines begins with a sigh — shoulders sink, head drops
      const wangSays = says.filter(s => s.say === 'wang');
      const sigh = wangSays.reduce((a, s) => a + Math.sin(Math.PI * clamp(prog(lt, s.lt - 0.3, s.lt + 1.7))), 0);
      const low = ease.inOut(prog(lt, wangSays[0] ? wangSays[0].lt : 3, (wangSays[0] ? wangSays[0].lt : 3) + 2.5)) * 0.06;   // she sinks a little and stays down
      const breath = Math.sin(lt * 1.15) * 0.02;
      const wx = 360, wy = 1480, wh = 520;
      const wPose = { tod, facing: 1, light: [-1, -0.25], sit: 1, bend: 0.38 + breath + low + sigh * 0.08, head: 0.25 + low * 2 + sigh * 0.16,
        armF: [0.26, 0.42], armB: [0.16, 0.52] };
      // 晓禾 squats across from her, notebook on her knee; she lifts her head when she speaks; on "write" she bends to the page
      const wrK = wr ? ease.inOut(prog(lt, wr.lt, wr.lt + 0.8)) : 0;
      const pen = wr && lt > wr.lt + 0.6 ? (Math.sin(lt * 14) * 0.035 + Math.sin(lt * 4.3) * 0.03) * (1 - prog(lt, wr.lt + wr.dur - 0.2, wr.lt + wr.dur)) : 0;
      const xSay = says.find(s => s.say === 'xiao'), xTalk = xSay ? Math.sin(Math.PI * clamp(prog(lt, xSay.lt - 0.2, xSay.lt + xSay.dur))) : 0;
      const xx = 850, xy = 1500, xh = 560;
      const xPose = { tod, facing: -1, light: [-1, -0.25], crouch: 1, bend: lerp(0.38 - xTalk * 0.06, 0.58, wrK), head: lerp(0.12 - xTalk * 0.14, 0.48, wrK), t: lt,
        armF: [lerp(0.12, 0.22, wrK) + pen, lerp(0.75, 0.85, wrK)], armB: [lerp(0.05, 0.12, wrK), lerp(0.85, 0.95, wrK)] };
      let wHead, xHead;
      S.layer(0.9, () => {
        const wY = wy - footY('wang', wh, wPose), xY = xy - footY('xiao', xh, xPose);
        castShadow(g => person('wang', 0, 0, wh, { ...wPose, color: '#000', rimColor: '#000', halo: 0, g }), wx, wY, 0.5, 0.3, 0.2, 16);
        castShadow(g => person('xiao', 0, 0, xh, { ...xPose, color: '#000', rimColor: '#000', halo: 0, g }), xx, xY, 0.5, 0.3, 0.2, 16);
        stool(wx - 2, wy + seatY('wang', wh, wPose) + wh * 0.035, 118, -seatY('wang', wh, wPose) - wh * 0.035, mix(p.fig, '#3a2c1c', 0.4), p.rim);
        const rw = person('wang', wx, wY, wh, wPose); wHead = rw.head;
        const rx = person('xiao', xx, xY, xh, xPose); xHead = rx.head;
        // the notebook held on her knee in the far hand, the pen in the near one
        const [bx, by] = rx.handB;
        ctx.save(); ctx.translate(bx - 10, by - 4); ctx.rotate(lerp(-0.35, -0.2, wrK));
        ctx.fillStyle = '#e9dfc4'; ctx.fillRect(-60, -10, 62, 42); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-60, 26, 62, 6);
        ctx.fillStyle = 'rgba(255,248,230,0.8)'; ctx.fillRect(-60, -10, 62, 2);
        ctx.restore();
        const [hx, hy] = rx.hand;
        ctx.save(); ctx.strokeStyle = '#1a1712'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx + 2, hy - 12); ctx.lineTo(hx - 16, hy + 12); ctx.stroke(); ctx.restore();
      });
      S.motes(lt, { n: 30, seed: 12, x: 0, y: 600, w: 760, h: 900, alpha: 0.3, vy: 2.5, vx: 3 });
      S.vignette(0.38);
      const wS = toScreen(cam, 0.9, ...wHead), xS = toScreen(cam, 0.9, ...xHead);
      S.say(api, lt, { wang: [clamp(wS[0] + 40, 350, 650), wS[1] - 140], xiao: [clamp(xS[0] - 40, 350, 650), xS[1] - 140] }, { wrap: 12 });
    },
    cues(V, api) {
      const out = sayCues(api), wr = api.steps.find(s => s.show === 'write');
      if (wr) out.push({ t: +(wr.lt + 0.6).toFixed(2), type: 'write', dur: +(wr.dur - 0.6).toFixed(2) });
      return out;
    },
  });

  // ================================================================ s03 notebook (close-up)
  // the little notebook on her knee; name + count, one household after another, faster and faster.
  const NB = { x: 95, y: 190, w: 930, h: 1560, line: 134, top: 330, margin: 175, col2: 600, size: 84, rot: -0.05, ink: '#0e1631' };
  function rowTimes(n, t0, total) {           // each row quicker than the last; returns [{a, b}] in local seconds
    const w = Array.from({ length: n }, (_, i) => Math.pow(0.76, i)), gapW = 0.18, sum = w.reduce((a, b) => a + b, 0) * (1 + gapW);
    const out = []; let t = t0;
    for (let i = 0; i < n; i++) { const d = w[i] / sum * total; out.push({ a: t, b: t + d }); t += d * (1 + gapW); }
    return out;
  }
  // a writing hand, seen from above: pen from the tip T toward the lower right, index finger along it, thumb on the
  // left, the other fingers curled under, the back of the hand and the forearm leaving the frame
  function writingHand(T, col, o = {}, ctx = K.ctx) {
    const d = [0.5, 0.866], n = [-0.866, 0.5], at = (a, b) => [T[0] + d[0] * a + n[0] * b, T[1] + d[1] * a + n[1] * b], ang = Math.atan2(d[1], d[0]);
    const cap = (p, q, r1, r2) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      ctx.beginPath(); ctx.moveTo(p[0] + nx * r1, p[1] + ny * r1); ctx.lineTo(q[0] + nx * r2, q[1] + ny * r2); ctx.lineTo(q[0] - nx * r2, q[1] - ny * r2); ctx.lineTo(p[0] - nx * r1, p[1] - ny * r1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(p[0], p[1], r1, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(q[0], q[1], r2, 0, TAU); ctx.fill(); };
    ctx.fillStyle = col;
    if (o.pen !== false) cap(at(4, 0), at(330, 0), 4, 8);            // the pen (its far end under the hand)
    cap(at(80, -8), at(200, -22), 15, 22);                          // index finger on top of the pen
    cap(at(118, 30), at(215, 44), 15, 22);                          // thumb, on the near side
    cap(at(150, -46), at(225, -64), 18, 24);                        // curled middle finger
    ctx.beginPath(); ctx.ellipse(...at(285, -20), 125, 98, ang, 0, TAU); ctx.fill();                 // back of the hand
    cap(at(330, -10), at(1600, 60), 92, 135);                        // wrist and forearm, out of frame
  }
  const HAND_BOX = [-20, -20, 920, 1590];       // bounds of writingHand([0, 0]) (pen, fingers, hand, forearm)
  T.register('notebook', {
    draw(ctx, V, lt, api) {
      const rs = S.stepAt(api, 'rows'), rows = V.rows || [];
      const t0 = rs ? rs.lt : 0.5, total = rs ? rs.dur : 7.5, RT = rowTimes(rows.length, t0, total - 0.4);
      // the yard floor below, out of focus; her knee under the book
      const bg = S.cached('nb_bg2', W, H, g => {
        const gg = g.createLinearGradient(0, 0, W, H); gg.addColorStop(0, '#b9a983'); gg.addColorStop(1, '#5d523d');
        g.fillStyle = gg; g.fillRect(0, 0, W, H);
        g.filter = 'blur(40px)'; const r = rng(8);
        for (let i = 0; i < 30; i++) { g.fillStyle = r() < 0.5 ? 'rgba(70,60,40,0.25)' : 'rgba(255,245,220,0.15)'; g.beginPath(); g.ellipse(r() * W, r() * H, 80 + r() * 200, 40 + r() * 90, r() * 3, 0, TAU); g.fill(); }
        g.fillStyle = '#26272b'; g.beginPath(); g.ellipse(520, 1750, 760, 420, -0.08, 0, TAU); g.fill();       // trouser knee
        g.filter = 'none';
      });
      const paper = S.cached('nb_paper2', NB.w, NB.h, g => {
        g.fillStyle = '#e8dec4'; g.fillRect(0, 0, NB.w, NB.h);
        const img = g.getImageData(0, 0, NB.w, NB.h), d = img.data;
        for (let y = 0; y < NB.h; y++) for (let x = 0; x < NB.w; x++) {
          const n = fbm(x / 110, y / 110, 3) * 22 + fbm(x / 2.5, y / 11, 2) * 12 - 18;          // mottling + fibre
          const i = (y * NB.w + x) * 4; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.85;
        }
        g.putImageData(img, 0, 0);
        const r = rng(31); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(120,96,60,${0.05 + r() * 0.08})`; g.fillRect(r() * NB.w, r() * NB.h, 1 + r() * 2, 1 + r() * 2); }   // flecks in cheap paper
        // printed rules (blue) and margin (red)
        g.fillStyle = 'rgba(92,120,165,0.6)'; for (let y = NB.top; y < NB.h - 30; y += NB.line) g.fillRect(0, y, NB.w, 2.4);
        g.fillStyle = 'rgba(190,84,80,0.55)'; g.fillRect(NB.margin - 34, 0, 2.4, NB.h); g.fillRect(NB.margin - 28, 0, 1.2, NB.h);
        // edges a little yellowed, the top darker under the binding
        const eg = g.createLinearGradient(0, 0, NB.w, 0); eg.addColorStop(0, 'rgba(110,80,40,0.18)'); eg.addColorStop(0.05, 'rgba(0,0,0,0)'); eg.addColorStop(0.95, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(110,80,40,0.2)');
        g.fillStyle = eg; g.fillRect(0, 0, NB.w, NB.h);
        const tg = g.createLinearGradient(0, 0, 0, 170); tg.addColorStop(0, 'rgba(80,60,30,0.25)'); tg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = tg; g.fillRect(0, 0, NB.w, 170);
        // the ghost of last page's writing pressed through, and a fold mark
        g.fillStyle = 'rgba(80,60,30,0.08)'; g.fillRect(0, NB.h * 0.72, NB.w, 2);
      });
      const cam = S.camera(lt, { dur: api.dur, z0: 1.0, z1: 1.07, y0: -70, y1: 150, x0: -10, x1: 10 });
      S.layer(0.3, () => ctx.drawImage(bg, -40, -40, W + 80, H + 80));
      // where the pen is: on the stroke being written; lifting and gliding between rows
      ctx.save(); ctx.font = `400 ${NB.size}px ${F.hand}`;
      const adv = str => { const out = [0]; for (const ch of str) out.push(out[out.length - 1] + ctx.measureText(ch).width); return out; };
      ctx.restore();
      const rowY = ri => NB.top + (ri + 1) * NB.line - 28;
      const pos = (ri, u) => {                     // pen point for row ri at progress u (0..1 over name, gap, count)
        const [name, cnt] = rows[ri], A = adv(name), B = adv(String(cnt)), nn = A.length - 1, nc = B.length - 1, tot = nn + 1.2 + nc, q = u * tot;
        const ix = (arr, k) => { const i = Math.min(Math.floor(k), arr.length - 2); return lerp(arr[i], arr[i + 1], k - i); };
        const x = q < nn ? NB.margin + ix(A, q) : q < nn + 1.2 ? lerp(NB.margin + A[nn], NB.col2, (q - nn) / 1.2) : NB.col2 + ix(B, Math.min(q - nn - 1.2, nc - 0.001));
        return [x, rowY(ri) - NB.size * 0.32];
      };
      let pen = null, down = 0;
      S.layer(0.9, () => {
        ctx.save(); ctx.translate(NB.x + NB.w / 2, NB.y + NB.h / 2); ctx.rotate(NB.rot); ctx.translate(-NB.w / 2, -NB.h / 2);
        S.softRect(34, 46, NB.w, NB.h, 26, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = '#bdb092'; ctx.fillRect(7, 9, NB.w, NB.h); ctx.fillStyle = '#d4c8a8'; ctx.fillRect(3, 4, NB.w, NB.h);     // the pages beneath
        ctx.drawImage(paper, 0, 0);
        // spiral binding along the top: punched holes, wire loops coming over the edge
        for (let i = 0; i < 19; i++) {
          const x = 36 + i * 48.5;
          ctx.fillStyle = 'rgba(30,24,16,0.75)'; ctx.beginPath(); ctx.ellipse(x, 52, 8, 7, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#2f3134'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 1, 50); ctx.bezierCurveTo(x - 4, 20, x + 10, -6, x + 14, -14); ctx.stroke();
          ctx.strokeStyle = 'rgba(235,236,240,0.7)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x - 3, 40); ctx.bezierCurveTo(x - 5, 18, x + 6, -2, x + 10, -10); ctx.stroke();
        }
        // the heading, written earlier: 收瓜 and the date
        for (const dx of [0, 1.3]) S.hand(V.header || '收瓜', NB.margin + dx, NB.top - 34, [...(V.header || '收瓜')].length > 3 ? 54 : 76, 1, { color: NB.ink, seed: 2, alpha: 0.9 });
        S.hand('八月廿六', NB.col2 + 20, NB.top - 34, 52, 1, { color: NB.ink, seed: 3, alpha: 0.8 });
        // the rows: ink goes down stroke by stroke; the later ones hurried, leaning more
        rows.forEach(([name, cnt], ri) => {
          const T_ = RT[ri]; if (!T_) return;
          const u = clamp((lt - T_.a) / (T_.b - T_.a)), nn = [...name].length, nc = [...String(cnt)].length, tot = nn + 1.2 + nc, q = u * tot;
          const y = rowY(ri);
          ctx.save(); ctx.translate(NB.margin, y); ctx.transform(1, 0, -0.05 * ri, 1, 0, 0); ctx.rotate(-0.01 * ri); ctx.translate(-NB.margin, -y);
          for (const dx of [0, 1.3]) {          // a ballpoint line has some weight: twice, a hair apart
            S.hand(name, NB.margin + dx, y + dx * 0.4, NB.size, clamp(q / nn), { color: NB.ink, seed: 10 + ri });
            S.hand(String(cnt), NB.col2 + dx, y + dx * 0.4, NB.size, clamp((q - nn - 1.2) / nc), { color: NB.ink, seed: 20 + ri });
          }
          ctx.restore();
          if (lt >= T_.a && lt <= T_.b) { pen = pos(ri, u); down = 1; }
        });
        if (!pen) {      // pen up: before the first row it comes in; between rows it glides to the next line; after, it rests
          const i = RT.findIndex(t => lt < t.a);
          if (i === -1) { const e = pos(rows.length - 1, 1), k = ease.out(prog(lt, RT[RT.length - 1].b, RT[RT.length - 1].b + 0.9)); pen = [e[0] + 30 + k * 50, e[1] + 26 + k * 60]; }
          else if (i === 0) { const s = pos(0, 0), k = 1 - ease.out(prog(lt, Math.max(0, t0 - 0.4), RT[0].a)); pen = [s[0] + 160 * k, s[1] + 220 * k]; }
          else { const a = pos(i - 1, 1), b = pos(i, 0), k = ease.inOut(prog(lt, RT[i - 1].b, RT[i].a)); pen = [lerp(a[0], b[0], k), lerp(a[1], b[1], k) - Math.sin(k * Math.PI) * 30]; }
        }
        const wig = down ? [Math.sin(lt * 29) * 8 + Math.sin(lt * 11) * 6, Math.cos(lt * 23) * 12 + Math.sin(lt * 7) * 5] : [0, 0];
        const T0 = [pen[0] + wig[0], pen[1] + wig[1]];
        // shadow of hand and pen on the paper: light from the upper left; nearer the page when the pen is down
        const lift = down ? 0 : 1;
        // (the hand is rigid: only translated, so both blurred copies come from cached sprites of it)
        ctx.save(); ctx.translate(T0[0] + 26 + lift * 26, T0[1] + 30 + lift * 30);
        S.soft('nb_hand|#2a2116|0.32', HAND_BOX, 12 + lift * 8, g => { g.globalAlpha = 0.32; writingHand([0, 0], '#2a2116', {}, g); }); ctx.restore();
        // the hand itself: a back-lit silhouette with a warm rim on its upper-left edges
        const Tp = [T0[0] - lift * 6, T0[1] - lift * 14];
        ctx.save(); ctx.translate(Tp[0] - 6, Tp[1] - 5);
        S.soft('nb_hand|#f6d9a6|0.9', HAND_BOX, 2, g => { g.globalAlpha = 0.9; writingHand([0, 0], '#f6d9a6', {}, g); }); ctx.restore();
        writingHand(Tp, '#33281f');
        ctx.save(); ctx.fillStyle = '#c3c6cc'; ctx.beginPath(); ctx.moveTo(Tp[0], Tp[1]); ctx.lineTo(Tp[0] + 15, Tp[1] + 16); ctx.lineTo(Tp[0] + 6, Tp[1] + 22); ctx.closePath(); ctx.fill(); ctx.restore();   // metal tip
        ctx.restore();
      });
      // late-morning light through bamboo: soft leaf shadows drifting over the page, a warm key from the upper left
      const leaves = S.cached('nb_leaves', W + 300, H + 300, g => {
        const r = rng(19); g.filter = 'blur(14px)'; g.fillStyle = 'rgba(50,40,20,1)';
        for (let i = 0; i < 70; i++) { const x = r() * (W + 300), y = r() * (H + 300), a = r() * 3; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x + Math.cos(a + k) * 40, y + Math.sin(a + k) * 40, 70, 13, a + k * 0.7, 0, TAU); g.fill(); } }
      });
      ctx.save(); ctx.globalAlpha *= 0.14; ctx.drawImage(leaves, -150 + Math.sin(lt * 0.35) * 30, -150 + Math.cos(lt * 0.3) * 18); ctx.restore();
      S.light(160, 200, 1000, 'rgba(255,230,190,0.2)', 1);
      S.motes(lt, { n: 16, seed: 3, x: 0, y: 200, w: W, h: 1300, alpha: 0.22, vy: 3, size: 2 });
      S.vignette(0.5);
      void cam;
    },
    cues(V, api) {
      const rs = api.steps.find(s => s.show === 'rows'); if (!rs) return [];
      return rowTimes((V.rows || []).length, rs.lt, rs.dur - 0.4).map(r => ({ t: +r.a.toFixed(2), type: 'write', dur: +(r.b - r.a).toFixed(2) }));
    },
  });

  // ================================================================ s04 road (tracking shot)
  // 晓禾 pedals through the village; the camera keeps pace beside her. Walls, bamboo and poles slide past;
  // each time a clump of roadside bamboo sweeps across the lens, more melons are in the bed and the light is later and warmer.
  const ROAD = { y: 1420, speed: 290, wipes: [2.7, 5.3, 7.9], loads: [2, 5, 8, 12], s: 1.62, x: 300, fgDepth: 4.6 };
  const VILLAGE = (() => {          // static layout of the far side of the road (world x, at the house layer's depth)
    const r = rng(404), out = []; let x = -500;
    while (x < 5200) {
      const k = r();
      if (k < 0.55) { const w = 360 + r() * 200; out.push({ type: 'house', x, w, h: 190 + r() * 60, gable: r() < 0.55 ? 'mtw' : null, door: r() < 0.6 ? 0.3 + r() * 0.4 : 0, nwin: r() < 0.5 ? 1 : 2 }); x += w + 50 + r() * 140; }
      else if (k < 0.85) { const w = 340 + r() * 160; out.push({ type: 'bamboo', x: x + w / 2, w, h: 640 + r() * 260, seed: 500 + Math.floor(r() * 1000) }); x += w * 0.6; }
      else { out.push({ type: 'tree', x: x + 150, s: 130 + r() * 50, seed: Math.floor(r() * 1000) }); x += 300; }
    }
    return out;
  })();
  function tree(x, y, s, seed, col, rim) {           // a round-crowned roadside tree (樟树): trunk, clustered crown, rim on top
    const c = S.cached(`tree|${seed}|${Math.round(s)}|${col}`, s * 4, s * 4.4, g => {
      const r = rng(seed), cx = s * 2, base = s * 4.4;
      g.fillStyle = col; g.fillRect(cx - s * 0.08, base - s * 1.7, s * 0.16, s * 1.7);
      g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = s * 0.06;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(cx, base - s * 1.4); g.lineTo(cx + (r() - 0.5) * s * 1.4, base - s * (2.0 + r() * 0.6)); g.stroke(); }
      for (let i = 0; i < 120; i++) { const a = r() * TAU, d = Math.sqrt(r()), px = cx + Math.cos(a) * d * s * 1.4, py = base - s * 2.6 + Math.sin(a) * d * s * 1.0; g.beginPath(); g.arc(px, py, s * (0.12 + r() * 0.16), 0, TAU); g.fill(); }
      g.globalCompositeOperation = 'source-atop';
      const sh = g.createLinearGradient(0, base - s * 3.6, 0, base - s * 1.6); sh.addColorStop(0, 'rgba(255,250,220,0.18)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = sh; g.fillRect(0, 0, s * 4, base);
    });
    ctx.drawImage(c, x - s * 2, y - s * 4.4);
    if (rim) S.light(x - s * 0.5, y - s * 3.4, s * 1.4, rim, 0.12);
  }
  T.register('road', {
    draw(ctx, V, lt, api) {
      const base = S.TOD.day;
      const k = ease.inOut(clamp(lt / api.dur));                       // late morning → early afternoon
      const warm = '#ffcf98';
      const pal = { mid: mix(base.mid, '#8a8a6c', k * 0.6), near: mix(base.near, '#55553a', k * 0.5),
        fig: mix('#221f1a', '#22180f', k), rim: mix(base.rim, '#ffd59a', k), wall: mix('#d6d6cc', '#e4d4b6', k), roof: mix('#3b3f3f', '#3a322c', k) };
      const dist = ROAD.speed * lt;
      const sunX = lerp(260, 140, k), sunY = lerp(520, 700, k);
      // sky, sun, a few high summer clouds
      {
        const g = ctx.createLinearGradient(0, 0, 0, 1350);
        g.addColorStop(0, mix(base.sky[0], '#7f9fbe', k)); g.addColorStop(0.6, mix(base.sky[1], '#e6d3b0', k)); g.addColorStop(1, mix(base.sky[2], '#f6cf98', k));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        S.sun(sunX, sunY, 50, 'day', 0.9);
        const clouds = S.cached('road_clouds', W * 2, 700, gg => {
          const r = rng(61); gg.filter = 'blur(16px)';
          for (let i = 0; i < 8; i++) { const cx = r() * W * 2, cy = 160 + r() * 300, s = 50 + r() * 70; gg.fillStyle = 'rgba(255,252,244,0.5)'; for (let j = 0; j < 7; j++) { gg.beginPath(); gg.ellipse(cx + (r() - 0.5) * s * 3, cy + (r() - 0.5) * s * 0.4, s * (0.6 + r() * 0.6), s * (0.3 + r() * 0.25), 0, 0, TAU); gg.fill(); } }
        });
        const off = (dist * 0.02 + lt * 4) % (W * 2);
        ctx.save(); ctx.globalAlpha *= 0.6; ctx.drawImage(clouds, -off, 0); ctx.drawImage(clouds, W * 2 - off, 0); ctx.restore();
      }
      // far hills (cached day palette; the warm grade at the end ties them in)
      ctx.save(); ctx.translate(-(dist * 0.03) % 180, 0); S.hills('day', 29, { horizon: 1160 }); ctx.restore();
      S.fog('day', lt + dist * 0.01, 1110, 0.35, 0, 1.2);
      // the far side of the road: cottages, bamboo, the odd camphor tree (depth 0.45)
      const d1 = dist * 0.45, by = ROAD.y - 155;
      for (const e of VILLAGE) {
        const sx = e.x - d1;
        if (sx > W + 500 || sx + (e.w || 400) < -500) continue;
        if (e.type === 'house') cottage(sx, by, e.w, e.h, { wall: pal.wall, roof: pal.roof, line: 'rgba(0,0,0,0.22)', gable: e.gable, door: e.door, rim: pal.rim, nwin: e.nwin });
        else if (e.type === 'bamboo') drawBamboo(e.seed, sx, by + 10, e.w, e.h, mix(pal.mid, '#4f6150', 0.5), lt);
        else tree(sx, by + 6, e.s, e.seed, mix(pal.mid, '#4f5f48', 0.5), 'rgba(255,240,200,1)');
      }
      S.fog('day', lt * 0.5 + dist * 0.05, by - 30, 0.18, 0, 1.0);
      // verge between the houses and the road
      { const g = ctx.createLinearGradient(0, by - 10, 0, ROAD.y - 140); g.addColorStop(0, mix(pal.near, '#6b7a4c', 0.3)); g.addColorStop(1, mix(pal.near, '#3f4a30', 0.2)); ctx.fillStyle = g; ctx.fillRect(0, by - 6, W, ROAD.y - 140 - by + 6);
        const r = rng(8); ctx.fillStyle = mix(pal.near, '#2f3a24', 0.3);
        for (let i = 0; i < 90; i++) { const wx = r() * 2600, sx = ((wx - dist * 0.8) % 2600 + 2600) % 2600 - 200, y = ROAD.y - 140 + 2, hh = 10 + r() * 26; ctx.beginPath(); ctx.moveTo(sx - 5, y); ctx.lineTo(sx + (r() - 0.5) * 12, y - hh); ctx.lineTo(sx + 5, y); ctx.fill(); }
      }
      // poles along the road with the wires sagging between them (depth 0.75)
      const d2 = dist * 0.75, gap = 700, pb = ROAD.y - 150, ph = 1060;
      let prev = null;
      for (let i = Math.floor((d2 - 500) / gap); i <= Math.floor((d2 + W + 500) / gap); i++) {
        const sx = i * gap - d2 + 90;
        const pts = pole(sx, pb, ph, mix(pal.near, '#2b2f26', 0.5), pal.rim);
        if (prev) wires(prev, pts, 30, 'rgba(30,32,28,0.7)', 2);
        prev = pts;
      }
      // the road: worn cement, a dusty edge, ruts sliding past (depth 1)
      {
        const g = ctx.createLinearGradient(0, ROAD.y - 140, 0, ROAD.y + 100); g.addColorStop(0, mix('#aaa088', '#bba680', k)); g.addColorStop(1, mix('#7a715d', '#84704f', k));
        ctx.fillStyle = g; ctx.fillRect(0, ROAD.y - 140, W, 240);
        ctx.fillStyle = 'rgba(40,36,26,0.25)'; ctx.fillRect(0, ROAD.y - 142, W, 4);
        const r = rng(3); ctx.fillStyle = 'rgba(50,44,30,0.26)';
        for (let i = 0; i < 70; i++) { const wx = r() * 3000, y = ROAD.y - 130 + r() * 220, sx = ((wx - dist) % 3000 + 3000) % 3000 - 200; ctx.fillRect(sx, y, 6 + r() * 40, 2 + r() * 3); }
        ctx.fillStyle = mix('#3c4a2c', '#40422a', k); ctx.fillRect(0, ROAD.y + 100, W, H - ROAD.y);       // the near verge
      }
      // her shadow and the tricycle, pedalling
      const wipeN = ROAD.wipes.filter(t => lt >= t).length, load = ROAD.loads[wipeN];
      const s = ROAD.s, spin = dist / (46 * s), bob = Math.sin(lt * 9.5) * 1.6, tx = ROAD.x, ty = ROAD.y + 30 + bob * 0.3;
      ctx.save(); ctx.globalAlpha *= 0.28; S.softEllipse(tx + 150 * s, ty + 8, 300 * s, 22, 10, '#1d1810'); ctx.restore();
      S.tricycle(tx, ty, s, 'day', { load, facing: 1, rim: 0.7, spin, color: pal.fig });
      const rh = 300 * s;
      person('xiao', tx + 202 * s, ty - 160 * s + rh * 0.38 + bob, rh, { tod: 'day', facing: 1, light: [-1, -0.35], sit: 0.6, walk: spin * 0.5, bend: 0.32, head: -0.12, t: lt,
        armF: [1.05, 0.3], armB: [1.0, 0.34], color: pal.fig, rimColor: pal.rim });
      // the melons in the bed: real 冬瓜 over the tricycle's pile, catching the rim light
      { const r = rng(9);
        const tw = ROAD.wipes[wipeN - 1], prevLoad = wipeN ? ROAD.loads[wipeN - 1] : load, fade = tw == null ? 1 : clamp((lt - tw + 0.06) / 0.12);
        for (let i = 0; i < load; i++) {
          const row = Math.floor(i / 4), col = i % 4, rot = (r() - 0.5) * 0.4;
          if (i >= prevLoad && fade < 1) { ctx.save(); ctx.globalAlpha *= fade; }
          S.melon(tx + s * (-60 + col * 52 + (row % 2) * 24), ty + s * (-168 - row * 30), 74 * s, { tod: 'day', rot, girth: 0.5, dark: 0.5, rim: 0.9, lit: 0.5, shadow: 0.4 });
          if (i >= prevLoad && fade < 1) ctx.restore();
        }
      }
      // foreground: grass of the near verge; and four times a clump of bamboo right by the lens sweeps across (the wipe)
      {
        const fg = S.cached('road_fg', 2400, 420, g => {
          const r = rng(71); g.fillStyle = '#1c2216';
          for (let i = 0; i < 280; i++) { const x = r() * 2400, h = 60 + r() * 170, lean = (r() - 0.5) * 50; g.beginPath(); g.moveTo(x - 6, 420); g.quadraticCurveTo(x + lean * 0.3, 420 - h * 0.6, x + lean, 420 - h); g.quadraticCurveTo(x + lean * 0.3 + 4, 420 - h * 0.5, x + 6, 420); g.fill(); }
        });
        const fgb = S.cached('road_fg_b3', 2400 + 24, 420 + 24, g => { g.filter = 'blur(3px)'; g.drawImage(fg, 12, 12); });   // pre-blurred, with a margin for the blur
        const off = ((dist * 1.6) % 2400 + 2400) % 2400;
        ctx.drawImage(fgb, -off - 12, H - 380 - 12); ctx.drawImage(fgb, 2400 - off - 12, H - 380 - 12);
        const vf = ROAD.speed * ROAD.fgDepth, bedC = tx + 25 * s;
        ROAD.wipes.forEach((tc, i) => {
          const cx = bedC + (tc - lt) * vf; if (cx < -700 || cx > W + 700) return;
          // built once per wipe; every blurred draw call is clipped to its own bounds (+3 sigma), which keeps the
          // filter's working layer that small instead of the whole 1300 x 1920 canvas (same pixels, ~40x quicker)
          const c = S.cached(`road_wipe|${i}`, 1300, H, g => {
            const r = rng(90 + i); g.lineCap = 'round';
            const op = (x0, y0, x1, y1, b, fn) => { g.save(); g.beginPath(); g.rect(x0 - 3 * b, y0 - 3 * b, x1 - x0 + 6 * b, y1 - y0 + 6 * b); g.clip(); g.filter = `blur(${b}px)`; fn(); g.restore(); };
            for (let j = 0; j < 7; j++) {                                // culms, out of focus, overlapping across the width
              const x = 400 + j * 82 + (r() - 0.5) * 24, wd = 92 + r() * 30, lean = (r() - 0.5) * 50;
              const xa = Math.min(x, x + lean) - wd, xb = Math.max(x, x + lean) + wd;
              op(xa, -40, xb, H + 40, 9, () => { g.strokeStyle = j % 2 ? '#1a1f14' : '#20271a'; g.lineWidth = wd; g.beginPath(); g.moveTo(x, H + 40); g.quadraticCurveTo(x + lean * 0.4, H * 0.5, x + lean, -40); g.stroke(); });
              op(xa - wd * 0.42, -40, xb, H + 40, 9, () => { g.strokeStyle = 'rgba(255,214,150,0.22)'; g.lineWidth = 5; g.beginPath(); g.moveTo(x - wd * 0.42, H + 40); g.quadraticCurveTo(x - wd * 0.42 + lean * 0.4, H * 0.5, x - wd * 0.42 + lean, -40); g.stroke(); });
              for (let q = 1; q < 6; q++) { const rx = x - wd / 2 + lean * (1 - q / 6), ry = H * q / 6; op(rx, ry, rx + wd, ry + 10, 9, () => { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(rx, ry, wd, 10); }); }
            }
            for (let j = 0; j < 46; j++) { const a = r() * TAU, x = 650 + (r() - 0.5) * 700, y = r() < 0.45 ? r() * 520 : 1000 + r() * 800, L = 90 + r() * 90; op(x - L, y - L, x + L, y + L, 16, () => { g.fillStyle = '#161b11'; g.beginPath(); g.ellipse(x, y, L, L * 0.2, a, 0, TAU); g.fill(); }); }
          });
          ctx.drawImage(c, cx - 650, 0);
        });
      }
      // the light grows later: a warm multiply over the whole frame, haze in the sun's direction
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = mix('#ffffff', warm, k * 0.45); ctx.fillRect(0, 0, W, H); ctx.restore();
      S.light(sunX, sunY, 1100, `rgba(255,214,160,${0.10 + 0.12 * k})`, 1);
      S.motes(lt, { n: 22, seed: 14, x: 0, y: 500, w: W, h: 900, alpha: 0.28, vy: 2, vx: -30 });
      S.vignette(0.36);
    },
    cues(V, api) {
      const rd = api.steps.find(s => s.show === 'ride');
      return rd ? [{ t: rd.lt, type: 'ride', dur: rd.dur }] : [];
    },
  });

  // ================================================================ s06 night (门槛)
  // she sits on the threshold of her own house; warm lamp behind her, stars, fireflies over the yard. The phone lights up.
  T.register('night', {
    draw(ctx, V, lt, api) {
      const tod = 'night', p = S.TOD[tod];
      const sit = S.stepAt(api, 'sit'), ph = S.stepAt(api, 'phone');
      const cam = S.camera(lt, { dur: api.dur, z0: 1.0, z1: 1.08, x0: 0, x1: -60, y0: 0, y1: 60 });
      const eave = 690, doorL = 250, doorR = 600, doorT = 760, sill = 1395, ground = 1560;
      S.layer(0.04, () => {
        S.sky(tod, { horizon: 900, t: lt });
        // a faint milky way across the top
        const mw = S.cached('night_mw', W, 900, g => {
          g.filter = 'blur(30px)'; const r = rng(44);
          for (let i = 0; i < 40; i++) { const t = r(), x = lerp(-100, W + 100, t), y = lerp(80, 520, t) + (r() - 0.5) * 120; g.fillStyle = `rgba(190,205,235,${0.05 + r() * 0.07})`; g.beginPath(); g.ellipse(x, y, 90 + r() * 120, 30 + r() * 40, 0.4, 0, TAU); g.fill(); }
          g.filter = 'none'; for (let i = 0; i < 500; i++) { const t = r(), x = lerp(-100, W + 100, t) + (r() - 0.5) * 120, y = lerp(80, 520, t) + (r() - 0.5) * 160; g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.4})`; g.fillRect(x, y, 1.2, 1.2); }
        });
        ctx.drawImage(mw, 0, 0);
      });
      S.layer(0.15, () => S.hills(tod, 17, { horizon: 980 }));
      // bamboo at the right against the stars
      S.layer(0.4, () => { drawBamboo(52, 960, 1000, 520, 900, '#070b12', lt, 0.008); });
      // the house front: a white wall gone blue in the dark, black tiles, the open door full of lamplight
      const inside = S.cached('night_inside', doorR - doorL, sill - doorT, g => {
        const w = doorR - doorL, h = sill - doorT;
        const gg = g.createRadialGradient(w * 0.55, h * 0.05, 10, w * 0.5, h * 0.35, h * 1.0);
        gg.addColorStop(0, '#ffe1a6'); gg.addColorStop(0.35, '#f0ad5e'); gg.addColorStop(1, '#6a3a1c');
        g.fillStyle = gg; g.fillRect(0, 0, w, h);
        g.filter = 'blur(5px)';
        g.fillStyle = 'rgba(70,40,20,0.55)'; g.fillRect(w * 0.12, h * 0.18, w * 0.2, h * 0.26);                 // a calendar on the back wall
        g.fillStyle = 'rgba(200,60,40,0.35)'; g.fillRect(w * 0.14, h * 0.2, w * 0.16, h * 0.05);
        g.fillStyle = 'rgba(60,32,16,0.85)'; g.fillRect(w * 0.45, h * 0.6, w * 0.6, h * 0.05);                   // the table
        g.fillRect(w * 0.5, h * 0.64, 10, h * 0.36); g.fillRect(w * 0.98, h * 0.64, 10, h * 0.36);
        g.fillRect(w * 0.62, h * 0.47, w * 0.08, h * 0.13);                                                     // a thermos
        g.filter = 'none';
        g.fillStyle = 'rgba(60,30,10,0.6)'; g.fillRect(w * 0.54, 0, 2, h * 0.04);                               // the bulb's cord
        g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(w * 0.545, h * 0.05, 9, 0, TAU); g.fill();
      });
      S.layer(0.85, () => {
        const wallTex = S.cached('night_wall', W + 400, ground - eave + 10, g => {
          const w = W + 400, h = ground - eave + 10;
          g.fillStyle = '#1d2638'; g.fillRect(0, 0, w, h);
          const img = g.getImageData(0, 0, w, h), d = img.data;
          for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const n = (fbm(x / 140, y / 140, 3) - 0.5) * 14 + (fbm(x / 6, y / 6, 1) - 0.5) * 5, i = (y * w + x) * 4; d[i] += n; d[i + 1] += n; d[i + 2] += n * 1.1; }
          g.putImageData(img, 0, 0);
          const sg = g.createLinearGradient(0, 0, 0, 260); sg.addColorStop(0, 'rgba(0,0,0,0.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(0, 0, w, 260);   // under the eave
          const r = rng(12); g.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 14; i++) g.fillRect(r() * w, 0, 6 + r() * 22, 120 + r() * 320);                                   // rain streaks
          const bg = g.createLinearGradient(0, h - 140, 0, h); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = bg; g.fillRect(0, h - 140, w, 140);
        });
        ctx.drawImage(wallTex, -200, eave);
        // lamplight spilling onto the wall round the door
        S.light((doorL + doorR) / 2, doorT + 200, 520, 'rgba(255,170,90,0.18)', 1);
        ctx.drawImage(inside, doorL, doorT);
        // door leaves folded back, frame and lintel
        ctx.fillStyle = '#120d0b'; ctx.fillRect(doorL - 34, doorT - 30, 34, sill - doorT + 30); ctx.fillRect(doorR, doorT - 30, 34, sill - doorT + 30); ctx.fillRect(doorL - 34, doorT - 34, doorR - doorL + 68, 34);
        ctx.fillStyle = '#2a1a10'; ctx.fillRect(doorL, doorT, 40, sill - doorT); ctx.fillStyle = 'rgba(255,190,120,0.3)'; ctx.fillRect(doorL + 38, doorT, 2, sill - doorT);
        // a window to the right, dimmer, its lamp further in
        ctx.fillStyle = 'rgba(255,190,110,0.55)'; ctx.fillRect(760, 900, 150, 170); ctx.fillStyle = '#120d0b'; for (let i = 0; i < 5; i++) ctx.fillRect(760 + i * 37, 900, 4, 170); ctx.fillRect(756, 896, 158, 6); ctx.fillRect(756, 1068, 158, 6);
        S.light(835, 985, 260, 'rgba(255,170,90,0.2)', 1);
        // roof eave above, the threshold (门槛) and the stone step
        ctx.fillStyle = '#05070b'; ctx.beginPath(); ctx.moveTo(-200, eave + 30); ctx.lineTo(W + 200, eave + 30); ctx.lineTo(W + 200, eave - 90); ctx.lineTo(-200, eave - 70); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#0c0f16'; for (let x = -200; x < W + 200; x += 26) { ctx.beginPath(); ctx.arc(x, eave + 30, 12, 0, Math.PI); ctx.fill(); }
        ctx.save(); ctx.strokeStyle = 'rgba(157,183,220,0.10)'; ctx.lineWidth = 3;                   // tile ribs catching starlight
        for (let x = -200; x < W + 200; x += 26) { ctx.beginPath(); ctx.moveTo(x + 6, eave + 24); ctx.lineTo(x + 9, eave - 76 - (x + 200) / (W + 400) * 18); ctx.stroke(); }
        ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = p.rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-200, eave - 72); ctx.lineTo(W + 200, eave - 90); ctx.stroke(); ctx.restore();
        ctx.fillStyle = '#2a1a10'; ctx.fillRect(doorL - 34, sill, doorR - doorL + 68, 44);
        ctx.fillStyle = 'rgba(255,190,120,0.4)'; ctx.fillRect(doorL - 34, sill, doorR - doorL + 68, 3);
        ctx.fillStyle = '#262c36'; ctx.fillRect(doorL - 120, sill + 44, doorR - doorL + 240, ground - sill - 44);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (const jx of [doorL + 60, doorL + 250, doorR + 70]) ctx.fillRect(jx, sill + 44, 3, ground - sill - 44);   // joints between the slabs
        { const sg = ctx.createLinearGradient(0, sill + 44, 0, ground); sg.addColorStop(0, 'rgba(255,170,90,0.10)'); sg.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = sg; ctx.fillRect(doorL - 120, sill + 44, doorR - doorL + 240, ground - sill - 44); }
        ctx.fillStyle = 'rgba(255,190,120,0.18)'; ctx.fillRect(doorL - 120, sill + 44, doorR - doorL + 240, 3);
        // the yard in front, and the fan of lamplight laid on it
        const gg = ctx.createLinearGradient(0, ground, 0, H); gg.addColorStop(0, '#141a24'); gg.addColorStop(1, '#070a10');
        ctx.fillStyle = gg; ctx.fillRect(-200, ground, W + 400, H - ground + 200);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        S.soft('night_fan', [doorL - 300, ground, doorR + 420 - doorL + 300, H - ground], 16, g => {
          const lg = g.createLinearGradient(0, ground, 0, H); lg.addColorStop(0, 'rgba(255,170,90,0.32)'); lg.addColorStop(1, 'rgba(255,170,90,0)');
          g.fillStyle = lg; g.beginPath(); g.moveTo(doorL - 110, ground); g.lineTo(doorR + 110, ground); g.lineTo(doorR + 420, H); g.lineTo(doorL - 300, H); g.closePath(); g.fill();
        });
        ctx.restore();
      });
      // her: seated on the threshold in profile, facing the yard. First looking up at the sky; on "phone" the screen
      // lights on her knee, she glances down and lifts it; its cold light falls on her face.
      const look = sit ? ease.inOut(prog(lt, sit.lt + 2.6, sit.lt + 4.2)) : 0;           // from the stars down to the yard
      const on = ph ? ease.out(prog(lt, ph.lt, ph.lt + 0.25)) : 0;
      const lift = ph ? ease.inOut(prog(lt, ph.lt + 0.45, ph.lt + 1.6)) : 0;
      const breath = Math.sin(lt * 1.0) * 0.02;
      const hx = 390, fy = ground + 6, h = 560;
      const pose = { tod, facing: 1, light: [-0.4, -1], sit: 1, t: lt * 0.4,
        bend: lerp(0.08, 0.2, look) + lift * 0.1 + breath, head: lerp(-0.42, 0.05, look) + on * 0.12 * (1 - lift) + lift * 0.32,
        armF: [lerp(0.55, 0.62, on), lerp(0.45, 0.55, on)].map((v, i) => lerp(v, [0.24, 2.25][i], lift)), armB: [0.48, 0.5].map((v, i) => lerp(v, [0.32, 2.0][i], ease.inOut(prog(lift, 0.3, 1)))) };
      const silCol = '#06080d', rimW = '#ffbf78';
      let r, phone;
      S.layer(0.85, () => {
        // her shadow thrown forward across the lamplight
        castShadow(g => person('xiao', 0, 0, h, { ...pose, color: '#000', rimColor: '#000', halo: 0, g }), hx, fy, -0.06, 1.15, 0.32, 22);
        r = person('xiao', hx, fy, h, { ...pose, color: silCol, rimColor: rimW, halo: 0.12 });
        phone = [r.hand[0] + 6, r.hand[1] - 10];
        // the phone: a dark slab in her hand, screen turned to her face; the glow spills round its edge
        ctx.save(); ctx.translate(...phone); ctx.rotate(lerp(-0.2, -1.1, lift));
        ctx.fillStyle = '#0b0d12'; ctx.fillRect(-8, -30, 16, 60);
        if (on > 0) { ctx.globalAlpha *= on; ctx.fillStyle = '#d8e8ff'; ctx.fillRect(-9, -29, 3, 58); }
        ctx.restore();
      });
      // the screen's cold light on the front of her face and on her hands: the silhouette re-drawn in blue-white
      // offscreen, kept only inside a soft radial falloff round the screen, then laid over her
      if (on > 0) {
        const pS = toScreen(cam, 0.85, ...phone), hS = toScreen(cam, 0.85, ...r.head);
        const cx = lerp(pS[0], hS[0], 0.35) + 14, cy = lerp(pS[1], hS[1], 0.35);
        const R = lerp(95, 150, lift);
        let off;
        S.layer(0.85, () => { off = personOff('night_cool', 'xiao', hx, fy, h, { ...pose, color: '#9fbbe6', rimColor: '#dfeaff' }); });
        const g = off.getContext('2d');
        g.globalCompositeOperation = 'destination-in';
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, R); rg.addColorStop(0, 'rgba(0,0,0,0.95)'); rg.addColorStop(0.45, 'rgba(0,0,0,0.45)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.globalAlpha *= on * lerp(0.55, 0.8, lift); ctx.drawImage(off, 0, 0); ctx.restore();
        S.light(pS[0] + 6, pS[1] - 6, 170, 'rgba(160,195,255,0.22)', on);
        S.light(pS[0] + 6, pS[1] - 6, 40, 'rgba(225,238,255,0.5)', on);
      }
      // fireflies over the yard and along the bamboo
      S.motes(lt, { n: 22, seed: 21, x: 560, y: 900, w: 520, h: 800, alpha: 0.6, vy: 5, vx: 3, size: 2.2, blink: 1.6, color: 'rgba(220,255,150,' });
      S.motes(lt, { n: 22, seed: 21, x: 560, y: 900, w: 520, h: 800, alpha: 0.14, vy: 5, vx: 3, size: 10, blink: 1.6, color: 'rgba(200,255,140,' });
      S.motes(lt, { n: 8, seed: 23, x: 0, y: 1150, w: 240, h: 500, alpha: 0.5, vy: 4, vx: 2, size: 2, blink: 1.3, color: 'rgba(220,255,150,' });
      S.motes(lt, { n: 9, seed: 22, x: 0, y: 1500, w: W, h: 400, alpha: 0.45, vy: 3, vx: -4, size: 2, blink: 1.2, color: 'rgba(220,255,150,' });
      S.vignette(0.5);
    },
    cues(V, api) {
      const ph = api.steps.find(s => s.show === 'phone');
      return ph ? [{ t: ph.lt, type: 'phone' }] : [];
    },
  });
})();
