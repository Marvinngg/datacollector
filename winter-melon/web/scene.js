/* Scene kit for 《李叔的冬瓜》: a warm, back-lit picture-book look, drawn entirely in code.
 * - landscape layers (sky, sun, hills, trees, fog, field) cached per scene, parallax by camera
 * - 冬瓜 with frost bloom, a carved 「李」 that grew into a scar, cracks
 * - people as rim-lit silhouettes with a simple skeleton (pose: bend, arms, walk), no faces
 * - spoken lines placed beside the speaker (plain type, no boxes, no subtitle strip)
 * Everything is a pure function of time; static layers are cached offscreen. Canvas is 1080 x 1920 (vertical). */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, fbm, vnoise } = K;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });
  const cache = new Map();
  const cached = (key, w, h, draw) => { let c = cache.get(key); if (!c) { c = mk(w, h); draw(c.getContext('2d'), c); cache.set(key, c); } return c; };
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- soft (blurred) drawing without a live ctx.filter
  // A ctx.filter blur on the 1080x1920 frame costs ~40 ms per draw call, whatever the shape's size (the filter layer is the
  // whole canvas). So blurred things are drawn either from cached, pre-blurred sprites (shapes that don't change) or
  // rendered at reduced resolution, blurred there and scaled back up (shapes that change every frame).
  // Like ctx.filter, the blur radii given to these helpers are in device pixels (the transform does not scale them).
  const ctmScale = (g = ctx) => { const m = g.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; };
  const qn = (v, s) => Math.max(s, Math.round(v / s) * s);          // quantize (cache keys stay finite)
  /** soft(key, box, b, draw): what draw(g) draws, blurred by b device px, from a cached sprite drawn in the current transform.
   *  box = [x, y, w, h] bounds the unblurred shape in local coordinates; draw(g) draws it in those same coordinates.
   *  key must name everything draw depends on. Each draw call inside is blurred on its own, exactly like ctx.filter. */
  function soft(key, box, b, draw, g0 = ctx) {
    const bl = qn(b / ctmScale(g0), 0.25), r = bl >= 8 ? 2 : 1, pad = Math.ceil(bl * 3) + 2;
    const x = Math.floor(box[0]) - pad, y = Math.floor(box[1]) - pad;
    const w = Math.ceil((Math.ceil(box[2]) + 2 * pad + 1) / r) * r, h = Math.ceil((Math.ceil(box[3]) + 2 * pad + 1) / r) * r;
    const c = cached(`soft|${key}|${x}|${y}|${w}|${h}|${bl}`, w / r, h / r, g => { g.scale(1 / r, 1 / r); g.translate(-x, -y); g.filter = `blur(${bl / r}px)`; draw(g); });
    g0.drawImage(c, x, y, w, h);
  }
  /** a blurred filled ellipse (axis-aligned in the current transform); radii quantized to 2 px, the sprite scaled to fit */
  function softEllipse(cx, cy, rx, ry, b, fill) {
    const qx = qn(rx, 2), qy = qn(ry, 2);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(rx / qx, ry / qy);
    soft(`ell|${qx}|${qy}|${fill}`, [-qx, -qy, 2 * qx, 2 * qy], b, g => { g.fillStyle = fill; g.beginPath(); g.ellipse(0, 0, qx, qy, 0, 0, TAU); g.fill(); });
    ctx.restore();
  }
  /** a blurred filled rectangle; size quantized to 2 px, the sprite scaled to fit */
  function softRect(x, y, w, h, b, fill) {
    const qw = qn(w, 2), qh = qn(h, 2);
    ctx.save(); ctx.translate(x, y); ctx.scale(w / qw, h / qh);
    soft(`rect|${qw}|${qh}|${fill}`, [0, 0, qw, qh], b, g => { g.fillStyle = fill; g.fillRect(0, 0, qw, qh); });
    ctx.restore();
  }
  /** blurred(b, fn, box): for shapes that change every frame. fn(g) draws on g (same transform as ctx, same alpha and
   *  composite op) at 1/4 (or 1/2) resolution; that is blurred there and laid back over the frame at full size, with
   *  ctx's composite op and clip. box = [x, y, w, h] in local coordinates bounds the shape (default: the whole frame). */
  const SCR = {};
  function blurred(b, fn, box) {
    if (b <= 0) { fn(ctx); return; }
    const d = b >= 8 ? 4 : b >= 2 ? 2 : 1, M = ctx.getTransform(), m = Math.ceil(b * 3) + d;
    let X0 = -m, Y0 = -m, X1 = W + m, Y1 = H + m;
    if (box) {
      const [bx, by, bw, bh] = box, xs = [], ys = [];
      for (const [px, py] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) { xs.push(M.a * px + M.c * py + M.e); ys.push(M.b * px + M.d * py + M.f); }
      X0 = Math.max(X0, Math.min(...xs) - m); X1 = Math.min(X1, Math.max(...xs) + m); Y0 = Math.max(Y0, Math.min(...ys) - m); Y1 = Math.min(Y1, Math.max(...ys) + m);
    }
    X0 = Math.floor(X0 / d) * d; Y0 = Math.floor(Y0 / d) * d;
    const w = Math.ceil((X1 - X0) / d), h = Math.ceil((Y1 - Y0) / d); if (w <= 0 || h <= 0) return;
    let s = SCR[d]; if (!s) { const cw = Math.ceil(W / d) + 2 * Math.ceil(m / d) + 64, ch = Math.ceil(H / d) + 2 * Math.ceil(m / d) + 64; s = SCR[d] = [mk(cw, ch), mk(cw, ch)]; }
    const [A, B] = s;
    if (w > A.width || h > A.height) { s[0] = mk(Math.max(w, A.width), Math.max(h, A.height)); s[1] = mk(s[0].width, s[0].height); return blurred(b, fn, box); }
    const ga = A.getContext('2d'), gb = B.getContext('2d');
    ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, w, h); ga.filter = 'none';
    ga.globalAlpha = ctx.globalAlpha; ga.globalCompositeOperation = ctx.globalCompositeOperation === 'lighter' ? 'lighter' : 'source-over';
    ga.setTransform(M.a / d, M.b / d, M.c / d, M.d / d, (M.e - X0) / d, (M.f - Y0) / d);
    ga.save(); fn(ga); ga.restore();
    gb.setTransform(1, 0, 0, 1, 0, 0); gb.globalCompositeOperation = 'copy'; gb.filter = `blur(${b / d}px)`;
    gb.drawImage(A, 0, 0, w, h, 0, 0, w, h); gb.filter = 'none'; gb.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(B, 0, 0, w, h, X0, Y0, w * d, h * d); ctx.restore();
  }

  // ---------------------------------------------------------------- palettes (time of day)
  const TOD = {
    dawn:  { sky: ['#56677f', '#a9a3a5', '#e9c9a6'], sun: '#fff1d6', sunGlow: 'rgba(255,224,180,0.55)', far: '#8e97a2', mid: '#6c7684', near: '#3e4652',
             ground: '#2d342f', fig: '#1b1e23', rim: '#ffe2b8', fog: 'rgba(225,222,215,', melon: '#2f4634', text: '#fff6e8' },
    day:   { sky: ['#7fa6c6', '#c9d8dc', '#f2e6cc'], sun: '#fffbe9', sunGlow: 'rgba(255,240,205,0.5)', far: '#a3b1b5', mid: '#7f9488', near: '#4d5f48',
             ground: '#56653f', fig: '#29261f', rim: '#fff3d6', fog: 'rgba(240,240,232,', melon: '#3a5a3c', text: '#fffaf0' },
    dusk:  { sky: ['#33304f', '#b0697a', '#f3a965'], sun: '#ffd08a', sunGlow: 'rgba(255,170,100,0.6)', far: '#7a5f78', mid: '#55435c', near: '#2e2534',
             ground: '#2a2028', fig: '#170f15', rim: '#ffb46a', fog: 'rgba(240,190,160,', melon: '#2c3a30', text: '#fff1e2' },
    night: { sky: ['#070d1a', '#13213a', '#22344f'], sun: '#f4f1e2', sunGlow: 'rgba(200,215,240,0.25)', far: '#1d2a3d', mid: '#152031', near: '#0c1422',
             ground: '#0c121b', fig: '#04070c', rim: '#9db7dc', fog: 'rgba(120,140,170,', melon: '#132018', text: '#f1f4fb' },
  };

  // ---------------------------------------------------------------- camera
  // a slow push / drift; returns the parallax offset for layers (depth 0 = far, 1 = near)
  let CAM = { x: 0, y: 0, z: 1 };
  function camera(lt, o = {}) {
    const k = ease.inOut(clamp(lt / (o.dur || 12)));
    CAM = { x: lerp(o.x0 || 0, o.x1 || 0, k), y: lerp(o.y0 || 0, o.y1 || 0, k), z: lerp(o.z0 || 1, o.z1 || 1, k) };
    return CAM;
  }
  function layer(depth, fn) {          // draw fn inside the camera transform for a given depth
    ctx.save();
    const z = 1 + (CAM.z - 1) * depth;
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2 - CAM.x * depth, -H / 2 - CAM.y * depth);
    fn(); ctx.restore();
  }

  // ---------------------------------------------------------------- sky, sun, stars
  function sky(tod, o = {}) {
    const p = TOD[tod], hz = o.horizon || 1150;
    const g = ctx.createLinearGradient(0, 0, 0, hz + 120);
    g.addColorStop(0, p.sky[0]); g.addColorStop(0.62, p.sky[1]); g.addColorStop(1, p.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(-200, -200, W + 400, H + 400);
    if (tod === 'night') stars(o.t || 0);
  }
  function stars(t) {
    const A0 = ctx.globalAlpha;   // inherit the beat fade
    const c = cached('stars', W, 1200, g => {
      const r = rng(7);
      for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * 1100, s = r() < 0.08 ? 2.2 : 1.1; g.globalAlpha = 0.25 + r() * 0.6; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); }
    });
    ctx.globalAlpha = A0 * 0.85 + 0.15 * Math.sin(t * 0.7); ctx.drawImage(c, 0, 0); ctx.globalAlpha = A0 * 1;
  }
  function sun(x, y, r, tod, a = 1) {
    const A0 = ctx.globalAlpha;   // inherit the beat fade
    const p = TOD[tod];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    let g = ctx.createRadialGradient(x, y, 0, x, y, r * 9);
    g.addColorStop(0, p.sunGlow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = A0 * a; ctx.fillStyle = g; ctx.fillRect(x - r * 9, y - r * 9, r * 18, r * 18);
    ctx.restore();
    ctx.save(); ctx.globalAlpha = A0 * a; ctx.fillStyle = p.sun; ctx.shadowColor = p.sun; ctx.shadowBlur = r * 0.8;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  }

  // ---------------------------------------------------------------- hills, trees, bamboo
  function ridge(seed, x, base, amp, freq) { return base - amp * (fbm(x * freq + seed * 13.1, seed * 7.7, 4) - 0.35) * 1.6; }
  function hills(tod, seed, o = {}) {
    const p = TOD[tod], hz = o.horizon || 1150;
    const key = `hills|${tod}|${seed}|${hz}`;
    const c = cached(key, W + 400, H, g => {
      const lay = [
        { base: hz - 230, amp: 260, freq: 0.0022, col: p.far, trees: 0 },
        { base: hz - 110, amp: 170, freq: 0.0034, col: p.mid, trees: 0.35 },
        { base: hz - 10, amp: 90, freq: 0.006, col: p.near, trees: 0.8 },
      ];
      lay.forEach((L, li) => {
        g.fillStyle = L.col; g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W + 400; x += 8) g.lineTo(x, ridge(seed + li, x, L.base, L.amp, L.freq));
        g.lineTo(W + 400, H); g.closePath(); g.fill();
        if (L.trees) {   // round tree crowns and bamboo clumps along the ridge
          const r = rng(seed * 31 + li);
          for (let x = 0; x < W + 400; x += 26 + r() * 50) {
            if (r() > L.trees) continue;
            const y = ridge(seed + li, x, L.base, L.amp, L.freq) + 6, s = (li === 2 ? 34 : 18) * (0.6 + r() * 0.8);
            if (r() < 0.35) bambooTo(g, x, y, s * 2.6, L.col, r);
            else { g.beginPath(); for (let k = 0; k < 5; k++) g.arc(x + (r() - 0.5) * s * 1.4, y - s * (0.6 + r() * 0.8), s * (0.55 + r() * 0.4), 0, TAU); g.fill(); }
          }
        }
        // atmospheric haze above each layer
        const hg = g.createLinearGradient(0, L.base - L.amp, 0, L.base + 140);
        hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(1, p.fog + (0.10 - li * 0.03) + ')');
        g.fillStyle = hg; g.fillRect(0, L.base - L.amp, W + 400, 300);
      });
    });
    ctx.drawImage(c, -200, 0);
  }
  function bambooTo(g, x, y, h, col, r) {
    g.strokeStyle = col; g.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const a = (r() - 0.5) * 0.5, hx = x + (r() - 0.5) * 18;
      g.lineWidth = 2 + r() * 2; g.beginPath(); g.moveTo(hx, y); g.quadraticCurveTo(hx + Math.sin(a) * h * 0.5, y - h * 0.6, hx + Math.sin(a) * h, y - h * (0.85 + r() * 0.2)); g.stroke();
      g.fillStyle = col; for (let j = 0; j < 5; j++) { const t = 0.5 + j * 0.1; g.beginPath(); g.ellipse(hx + Math.sin(a) * h * t + (r() - 0.5) * 30, y - h * t, 16, 4, a + (r() - 0.5), 0, TAU); g.fill(); }
    }
  }

  // ---------------------------------------------------------------- fog
  const fogTex = () => cached('fog', 1024, 256, g => {
    const r = rng(3); g.filter = 'blur(28px)';
    for (let i = 0; i < 40; i++) { g.globalAlpha = 0.25 + r() * 0.35; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(r() * 1024, 128 + (r() - 0.5) * 90, 80 + r() * 160, 24 + r() * 30, 0, 0, TAU); g.fill(); }
  });
  function fog(tod, t, y, a = 0.5, speed = 8, scale = 1) {
    const A0 = ctx.globalAlpha;   // inherit the beat fade
    const tex = fogTex(), p = TOD[tod];
    ctx.save(); ctx.globalAlpha = A0 * a;
    const w = 1024 * scale * 1.6, h = 256 * scale * 1.6, off = ((t * speed) % w + w) % w;
    // tint: draw then colour with source-atop on a temp layer
    const c = cached(`fogt|${tod}`, 1024, 256, g => { g.drawImage(tex, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = p.fog + '1)'; g.fillRect(0, 0, 1024, 256); });
    for (let x = -off - w; x < W + w; x += w) ctx.drawImage(c, x, y - h / 2, w, h);
    ctx.restore();
  }

  // ---------------------------------------------------------------- ground & field
  function ground(tod, hz = 1150, o = {}) {
    const p = TOD[tod];
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, shade(p.ground, 0.15)); g.addColorStop(1, shade(p.ground, -0.25));
    ctx.fillStyle = g; ctx.fillRect(-300, hz, W + 600, H - hz + 300);
  }
  // rows of melon vines converging to a vanishing point; melons scattered on the rows
  function field(tod, seed, o = {}) {
    const p = TOD[tod], hz = o.horizon || 1150, vx = o.vx || W * 0.5;
    const key = `field|${tod}|${seed}|${hz}|${vx}`;
    const c = cached(key, W + 600, H, g => {
      const r = rng(seed), rows = 13;
      for (let i = 0; i < rows; i++) {
        const u = (i + 0.5) / rows, xb = -300 + u * (W + 600) * 1.6 - (W + 600) * 0.3;
        for (let s = 0; s < 1; s += 0.012) {     // leaves from the horizon to the bottom
          const e = s * s, x = lerp(vx + 300, xb + 300, e), y = lerp(hz + 4, H + 60, e), sz = 4 + e * 60;
          if (r() < 0.75) {
            g.fillStyle = shade(p.near, (r() - 0.5) * 0.25 + e * 0.15);
            g.beginPath(); g.ellipse(x + (r() - 0.5) * sz * 2, y + (r() - 0.5) * sz * 0.4, sz * (0.8 + r() * 0.6), sz * (0.35 + r() * 0.25), r() * 3, 0, TAU); g.fill();
          }
        }
      }
    });
    ctx.drawImage(c, -300, 0);
  }
  /** positions of melons lying on the field (for scenes that place them): [{x, y, s}] in perspective */
  function fieldSpots(seed, n, o = {}) {
    const hz = o.horizon || 1150, r = rng(seed * 5 + 1), out = [];
    for (let i = 0; i < n; i++) { const e = 0.15 + r() * 0.85, x = lerp(W * 0.5, -200 + r() * (W + 400), Math.pow(e, 0.8)); out.push({ x, y: lerp(hz + 10, H - 120, e * e), s: 30 + e * e * 230, rot: (r() - 0.5) * 0.5 }); }
    return out.sort((a, b) => a.y - b.y);
  }

  // ---------------------------------------------------------------- 冬瓜
  const frostTex = () => cached('frost', 256, 256, g => {
    const r = rng(11);
    for (let i = 0; i < 2600; i++) { g.globalAlpha = 0.05 + r() * 0.2; g.fillStyle = '#f4f7ee'; g.beginPath(); g.arc(r() * 256, r() * 256, 0.6 + r() * 1.6, 0, TAU); g.fill(); }
  });
  /** melon(x, y, len, o): o = {rot, tod, carve:'李', carveA, crack:0..1, lit:0..1 (front light), dark (silhouette mix), small} */
  function melon(x, y, len, o = {}) {
    const A0 = ctx.globalAlpha;   // inherit the beat fade
    const p = TOD[o.tod || 'day'], gr = len * (o.girth || 0.46), rot = o.rot || 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    // contact shadow
    ctx.save(); ctx.globalAlpha = A0 * 0.4 * (o.shadow == null ? 1 : o.shadow);
    softEllipse(len * 0.02, gr * 0.46, len * 0.5, gr * 0.14, Math.max(2, Math.round(len * 0.04)), '#000'); ctx.restore();
    // body: a long rounded barrel (superellipse), a little fuller at the blossom end
    const body = (g = ctx, L = len, G = gr) => {
      g.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = i / 64 * TAU, c = Math.cos(a), s = Math.sin(a);
        const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.62) * L / 2, ey = Math.sign(s) * Math.pow(Math.abs(s), 0.8) * G / 2 * (1 + 0.05 * c);
        i ? g.lineTo(ex, ey) : g.moveTo(ex, ey);
      }
      g.closePath();
    };
    const base = o.color || p.melon, lit = o.lit == null ? 0.6 : o.lit;
    // cylindrical shading: light across the top, core shadow below, bounce at the bottom edge
    let g = ctx.createLinearGradient(0, -gr / 2, 0, gr / 2);
    g.addColorStop(0, shade(base, 0.12 * lit)); g.addColorStop(0.22, shade(base, 0.3 * lit)); g.addColorStop(0.5, base);
    g.addColorStop(0.82, shade(base, -0.5)); g.addColorStop(1, shade(base, -0.3));
    body(); ctx.fillStyle = g; ctx.fill();
    ctx.save(); body(); ctx.clip();
    // ends darker (form turning away)
    const eg = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
    eg.addColorStop(0, 'rgba(0,0,0,0.35)'); eg.addColorStop(0.18, 'rgba(0,0,0,0)'); eg.addColorStop(0.82, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = eg; ctx.fillRect(-len / 2, -gr / 2, len, gr);
    // pale speckles typical of 冬瓜 skin
    const r = rng(Math.round(len) + 3);
    ctx.fillStyle = shade(base, 0.35); ctx.globalAlpha = A0 * 0.18;
    for (let i = 0; i < 70; i++) { ctx.beginPath(); ctx.ellipse((r() - 0.5) * len * 0.95, (r() - 0.5) * gr * 0.9, len * 0.012 * (0.5 + r()), gr * 0.012 * (0.5 + r()), r() * 3, 0, TAU); ctx.fill(); }
    // frost bloom: the white powder, dusty and uneven, mostly on the upper half
    const ft = frostTex(), fs = Math.max(90, len * 0.32);
    ctx.globalAlpha = A0 * 0.5 * (o.frost == null ? 1 : o.frost);
    for (let fx = -len / 2; fx < len / 2; fx += fs) for (let fy = -gr / 2; fy < gr * 0.15; fy += fs) ctx.drawImage(ft, fx, fy, fs, fs);
    const bloomG = ctx.createLinearGradient(0, -gr / 2, 0, gr / 2);
    bloomG.addColorStop(0, 'rgba(226,232,222,0.28)'); bloomG.addColorStop(0.4, 'rgba(226,232,222,0.10)'); bloomG.addColorStop(0.7, 'rgba(226,232,222,0)');
    ctx.globalAlpha = A0 * 1; ctx.fillStyle = bloomG; ctx.fillRect(-len / 2, -gr / 2, len, gr);
    // the carved 「李」: cut when the melon was small, it grew into a pale, uneven scar
    if (o.carve && (o.carveA == null || o.carveA > 0)) {
      const a = o.carveA == null ? 1 : o.carveA, cs = gr * 0.36;
      ctx.save(); ctx.translate(-len * 0.04, -gr * 0.06); ctx.scale(1.25, 0.9); ctx.rotate(-0.06);
      ctx.font = `400 ${cs}px ${F.hand}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = A0 * a * 0.6; ctx.fillStyle = 'rgba(15,24,15,0.8)'; ctx.fillText(o.carve, cs * 0.025, cs * 0.04);
      ctx.globalAlpha = A0 * a; ctx.fillStyle = '#b8ab84'; ctx.fillText(o.carve, 0, 0);
      ctx.globalAlpha = A0 * a * 0.5; ctx.fillStyle = '#efe7c8'; ctx.fillText(o.carve, -cs * 0.012, -cs * 0.02);
      // grown-over: blur the scar into the skin a little, speckles across it
      ctx.globalAlpha = A0 * a * 0.35;
      const cb = Math.max(1, Math.round(cs * 0.02)), cq = qn(cs, 1), cf = `400 ${cq}px ${F.hand}`;
      if (document.fonts.check(cf, o.carve)) {    // pre-blurred glyph, scaled from the quantized size
        ctx.scale(cs / cq, cs / cq);
        soft(`carve|${o.carve}|${cq}`, [-cq, -cq, 2 * cq, 2 * cq], cb, g => { g.font = cf; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#9b9070'; g.fillText(o.carve, 0, 0); });
      } else { ctx.filter = `blur(${cb}px)`; ctx.fillStyle = '#9b9070'; ctx.fillText(o.carve, 0, 0); ctx.filter = 'none'; }
      ctx.restore();
    }
    // a crack
    if (o.crack) {
      ctx.globalAlpha = A0 * clamp(o.crack); ctx.lineJoin = 'round';
      const r2 = rng(5); const pts = [[len * 0.06, -gr * 0.42]];
      for (let k = 0; k < 7; k++) { const [px, py] = pts[pts.length - 1]; pts.push([px + (r2() - 0.4) * len * 0.05, py + gr * 0.1]); }
      const path = () => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(...q) : ctx.moveTo(...q)); };
      ctx.strokeStyle = 'rgba(10,14,10,0.85)'; ctx.lineWidth = Math.max(2, gr * 0.035); path(); ctx.stroke();
      ctx.strokeStyle = '#d8d0ae'; ctx.lineWidth = Math.max(1, gr * 0.01); ctx.translate(-gr * 0.012, 0); path(); ctx.stroke();
    }
    ctx.restore();   // end of the body clip
    // stem stub at the near end
    ctx.fillStyle = '#5b5135'; ctx.beginPath(); ctx.ellipse(len / 2 - len * 0.005, -gr * 0.04, len * 0.016, gr * 0.05, 0, 0, TAU); ctx.fill();
    // silhouette mix (for back-lit wide shots)
    if (o.dark) { ctx.globalAlpha = A0 * o.dark; body(); ctx.fillStyle = p.fig; ctx.fill(); ctx.globalAlpha = A0 * 1; }
    // back-lit rim: a thin bright line along the top edge only
    if (o.rim) {     // pre-blurred rim (clipped to the body), from a sprite at the quantized size, scaled to fit exactly
      const lq = qn(len, 2), gq = qn(gr, 2);
      ctx.save(); ctx.globalAlpha = A0 * o.rim * 0.7; ctx.scale(len / lq, gr / gq);
      soft(`mrim|${lq}|${gq}|${p.rim}`, [-lq / 2 - 2, -gq / 2 - 2, lq + 4, gq + 4], Math.max(1, Math.round(gr * 0.02)), g => {
        body(g, lq, gq); g.clip(); g.strokeStyle = p.rim; g.lineWidth = Math.max(2, gq * 0.05); g.translate(0, gq * 0.035); body(g, lq, gq); g.stroke();
      });
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- buildings & props (silhouettes with warm windows)
  function house(x, y, w, tod, o = {}) {           // 白墙黑瓦: (x, y) = bottom-left
    const p = TOD[tod], h = w * 0.62, roof = w * 0.28;
    ctx.save();
    ctx.fillStyle = o.wall || shade(p.near, 0.25); ctx.fillRect(x, y - h, w, h);
    ctx.fillStyle = o.roof || shade(p.fig, 0.05); ctx.beginPath();
    ctx.moveTo(x - w * 0.08, y - h); ctx.quadraticCurveTo(x + w * 0.1, y - h - roof * 0.3, x + w * 0.22, y - h - roof);
    ctx.lineTo(x + w * 0.78, y - h - roof); ctx.quadraticCurveTo(x + w * 0.9, y - h - roof * 0.3, x + w * 1.08, y - h); ctx.closePath(); ctx.fill();
    if (o.window != null) {
      const wa = o.window, wx = x + w * 0.62, wy = y - h * 0.62, ww = w * 0.16, wh = w * 0.16;
      ctx.fillStyle = `rgba(255,201,119,${0.95 * wa})`; ctx.fillRect(wx, wy, ww, wh);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, w * 0.6);
      g.addColorStop(0, `rgba(255,190,110,${0.35 * wa})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(wx - w, wy - w, w * 2, w * 2); ctx.restore();
      ctx.fillStyle = shade(p.fig, 0.1); ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh); ctx.fillRect(wx, wy + wh / 2 - 1, ww, 2);
    }
    if (o.door) { ctx.fillStyle = shade(p.fig, 0.02); ctx.fillRect(x + w * 0.2, y - h * 0.55, w * 0.18, h * 0.55); }
    ctx.restore();
  }
  /** a 三轮车 seen from the side; (x, y) = ground under the rear wheel; load = number of melons in the bed */
  function tricycle(x, y, s, tod, o = {}) {
    const p = TOD[tod], c = o.color || p.fig, f = o.facing || 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(f * s, s);
    ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const wheel = (wx, r) => { ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(wx, -r, r, 0, TAU); ctx.stroke(); ctx.lineWidth = 3; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + (o.spin || 0); ctx.beginPath(); ctx.moveTo(wx, -r); ctx.lineTo(wx + Math.cos(a) * r, -r + Math.sin(a) * r); ctx.stroke(); } };
    wheel(0, 46); wheel(330, 42);
    // cargo bed
    ctx.fillRect(-90, -150, 230, 18); ctx.fillRect(-90, -205, 10, 70); ctx.fillRect(130, -205, 10, 70); ctx.fillRect(-90, -205, 230, 8);
    // frame, seat, handlebar
    ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(140, -140); ctx.lineTo(250, -120); ctx.lineTo(330, -42); ctx.moveTo(250, -120); ctx.lineTo(300, -210); ctx.lineTo(330, -215); ctx.stroke();
    ctx.fillRect(200, -165, 60, 14);
    // load: melons piled in the bed (drawn by caller with melon(); here only the silhouette pile)
    const n = o.load || 0, r = rng(9);
    for (let i = 0; i < n; i++) { const row = Math.floor(i / 4), col = i % 4; ctx.save(); ctx.translate(-60 + col * 52 + (row % 2) * 24, -168 - row * 30); ctx.rotate((r() - 0.5) * 0.4); ctx.beginPath(); ctx.ellipse(0, 0, 34, 18, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    if (o.rim) { ctx.globalAlpha = o.rim; ctx.strokeStyle = p.rim; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-90, -206); ctx.lineTo(140, -206); ctx.moveTo(250, -122); ctx.lineTo(300, -212); ctx.stroke(); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- people: rim-lit silhouettes
  /* person(who, x, y, h, o): (x, y) = point between the feet; h = standing height in px.
     o: facing (1 → right, -1 → left), bend 0..1 (torso forward), head (tilt rad), armF/armB = [shoulder, elbow] angles
        (radians from straight down, positive = forward), walk (phase, rad; undefined = standing), crouch 0..1, sit 0..1,
        hold: fn(ctx, handX, handY) to draw what the front hand holds, tod, light: [lx, ly] direction to the light */
  const BUILD = {   // profile proportions (fractions of standing height): chest / waist / seat depth
    qin:  { chest: 0.15, waist: 0.13, hip: 0.14, leg: 0.47, k: 0.95, hat: 'cap', bendBase: 0.26, headBase: -0.32, kneeBase: 0.12, hunch: true, hem: 0.07 },
    xiao: { chest: 0.14, waist: 0.105, hip: 0.14, leg: 0.5, k: 0.9, hair: 'ponytail', bust: true, hem: 0.035 },
    wang: { chest: 0.19, waist: 0.19, hip: 0.2, leg: 0.45, k: 1.08, hair: 'scarf', apron: true, bust: true, hem: 0.06 },
    lin:  { chest: 0.135, waist: 0.1, hip: 0.135, leg: 0.5, k: 0.88, hair: 'bob', bust: true, hem: 0.05 },
    kid:  { chest: 0.16, waist: 0.16, hip: 0.16, leg: 0.42, k: 1.1, hair: 'kid', headK: 1.35, hem: 0.04 },
  };
  function personMask(who, h, o) {
    const B = BUILD[who], S = Math.ceil(h * 1.9), c = mk(S, S), g = c.getContext('2d');
    const f = o.facing || 1, ox = S / 2, oy = S - h * 0.06;
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    // tapered limb: circles at both joints joined by their outer tangents
    const seg = (a, b, ra, rb) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      g.beginPath(); g.moveTo(a[0] + nx * ra, a[1] + ny * ra); g.lineTo(b[0] + nx * rb, b[1] + ny * rb);
      g.lineTo(b[0] - nx * rb, b[1] - ny * rb); g.lineTo(a[0] - nx * ra, a[1] - ny * ra); g.closePath(); g.fill();
      g.beginPath(); g.arc(a[0], a[1], ra, 0, TAU); g.fill(); g.beginPath(); g.arc(b[0], b[1], rb, 0, TAU); g.fill();
    };
    const at = (p, ang, len) => [p[0] + Math.sin(ang) * len * f, p[1] + Math.cos(ang) * len];   // ang from straight down, + = forward
    const K_ = B.k || 1;
    const legL = h * B.leg, crouch = o.crouch || 0, sit = o.sit || 0;
    const hip = [ox, oy - legL * (1 - 0.32 * crouch) + (sit ? h * 0.2 * sit : 0)];
    const bend = (B.bendBase || 0) + (o.bend || 0);
    const torL = h * 0.30, sh = [hip[0] + Math.sin(bend) * torL * f, hip[1] - Math.cos(bend) * torL];
    // ---- legs (trousers): thigh → knee → ankle, then a shoe
    const leg = (ph, back) => {
      const walking = o.walk != null, sw = walking ? Math.sin(ph) * 0.45 : (back ? -0.07 : 0.09);
      const lift = walking ? Math.max(0, Math.sin(ph + Math.PI / 2)) * 0.55 : 0;
      const kb = walking || sit ? 0 : (B.kneeBase || 0);
      const thighA = sw + kb + sit * 1.5 + crouch * 1.25, shinA = sw - kb * 1.2 - lift * 0.6 - crouch * 1.0 + (sit ? 0.05 : 0);
      const kn = at(hip, thighA, legL * 0.5), an = at(kn, shinA, legL * 0.47);
      seg(hip, kn, h * 0.05 * K_, h * 0.039 * K_); seg(kn, an, h * 0.038 * K_, h * 0.032 * K_);
      g.beginPath(); g.ellipse(an[0] + h * 0.026 * f, an[1] + h * 0.012, h * 0.04, h * 0.017, 0, 0, TAU); g.fill();
    };
    const ph = o.walk || 0; leg(ph + Math.PI, true); leg(ph, false);
    const sw = h * B.chest / 2;
    // ---- torso, seen in profile (x = forward): chest, waist, seat, jacket hem; smooth curve through the outline
    g.save(); g.translate(hip[0], hip[1]); g.rotate(bend * f); if (f < 0) g.scale(-1, 1);
    const d = h * B.chest, wd = h * B.waist, hd = h * B.hip, hem = h * (B.hem || 0.05), T_ = torL;
    const pts = [
      [d * 0.32, -T_ * 1.02], [d * 0.55, -T_ * 0.8], [d * (B.bust ? 0.62 : 0.52), -T_ * 0.62], [wd * 0.5, -T_ * 0.32], [hd * 0.5, 0], [hd * 0.56, hem],
      [-hd * 0.6, hem], [-hd * 0.55, -T_ * 0.05], [-wd * 0.48, -T_ * 0.4], [-d * (B.hunch ? 0.62 : 0.48), -T_ * 0.78], [-d * 0.36, -T_ * 1.0],
    ];
    g.beginPath(); g.moveTo(...pts[0]);
    for (let i = 0; i < pts.length; i++) {             // Catmull-Rom → Bézier, closed
      const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
      g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    g.closePath(); g.fill();
    g.restore();
    // ---- arms: upper arm, forearm, hand
    const arm = (ang, back) => {
      const [s0, e0] = ang;
      const so = [sh[0] - Math.sin(bend) * h * 0.035 * f * 0, sh[1] + h * 0.035];
      const el = at(so, s0 + bend * 0.3, h * 0.165), wr = at(el, s0 + e0 + bend * 0.3, h * 0.145);
      seg(so, el, h * 0.037 * K_, h * 0.031 * K_); seg(el, wr, h * 0.03 * K_, h * 0.024 * K_);
      const hd = at(wr, s0 + e0 + bend * 0.3, h * 0.03);
      g.beginPath(); g.ellipse(hd[0], hd[1], h * 0.024, h * 0.03, s0 + e0, 0, TAU); g.fill();
      return hd;
    };
    const hb = arm(o.armB || [o.walk == null ? 0.02 : -Math.sin(ph) * 0.38, 0.12], true);
    const hf = arm(o.armF || [o.walk == null ? 0.06 : Math.sin(ph) * 0.38, 0.18], false);
    // ---- neck & head (profile: back of the skull, brow, nose, chin)
    const hr = h * 0.066 * (B.headK || 1), tilt = (o.head || 0) + (B.headBase || 0) + bend * 0.75;
    const neckTop = at(sh, Math.PI - tilt, h * 0.02), hc = at(neckTop, Math.PI - tilt, hr * 0.9);
    seg(sh, neckTop, h * 0.03, h * 0.026);
    g.save(); g.translate(hc[0], hc[1]); g.rotate(tilt * f); if (f < 0) g.scale(-1, 1);
    g.beginPath(); g.ellipse(-hr * 0.06, -hr * 0.02, hr * 0.92, hr * 1.04, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(hr * 0.72, -hr * 0.25); g.quadraticCurveTo(hr * 1.08, hr * 0.05, hr * 0.92, hr * 0.2); g.lineTo(hr * 0.78, hr * 0.32);
    g.quadraticCurveTo(hr * 0.86, hr * 0.62, hr * 0.5, hr * 0.92); g.lineTo(hr * 0.1, hr * 0.9); g.closePath(); g.fill();   // nose, mouth, chin
    // hair and hats
    if (B.hat === 'cap') {
      g.beginPath(); g.ellipse(-hr * 0.12, -hr * 0.62, hr * 1.02, hr * 0.5, -0.08, Math.PI * 0.95, TAU + 0.1); g.fill();
      g.beginPath(); g.ellipse(hr * 0.72, -hr * 0.6, hr * 0.62, hr * 0.13, 0.12, 0, TAU); g.fill();
    } else if (B.hair === 'ponytail') {
      g.beginPath(); g.ellipse(-hr * 0.15, -hr * 0.22, hr * 1.0, hr * 0.92, 0, Math.PI * 0.82, TAU + 0.05); g.fill();
      const sway = Math.sin((o.t || 0) * 2.1) * 0.15;
      g.lineWidth = hr * 0.38; g.beginPath(); g.moveTo(-hr * 0.85, -hr * 0.45);
      g.quadraticCurveTo(-hr * 1.75, -hr * (0.1 - sway), -hr * 1.55, hr * (1.05 + sway)); g.stroke();
    } else if (B.hair === 'scarf') {
      g.beginPath(); g.ellipse(-hr * 0.12, -hr * 0.15, hr * 1.14, hr * 1.06, 0, Math.PI * 0.75, TAU + 0.2); g.fill();
      g.beginPath(); g.moveTo(-hr * 0.8, hr * 0.55); g.lineTo(-hr * 1.55, hr * 1.25); g.lineTo(-hr * 0.95, hr * 1.2); g.closePath(); g.fill();
    } else if (B.hair === 'bob') {
      g.beginPath(); g.ellipse(-hr * 0.2, hr * 0.0, hr * 1.12, hr * 1.12, 0, Math.PI * 0.72, TAU + 0.1); g.fill();
      g.fillRect(-hr * 1.3, -hr * 0.1, hr * 0.95, hr * 1.15);
    } else if (B.hair === 'kid') {
      g.beginPath(); g.ellipse(-hr * 0.1, -hr * 0.3, hr * 1.04, hr * 0.82, 0, Math.PI * 0.85, TAU + 0.1); g.fill();
    }
    g.restore();
    return { c, ox, oy, hand: hf, handB: hb, head: hc, hr, S };
  }
  function person(who, x, y, h, o = {}) {
    const ctx = o.g || K.ctx;   // o.g: draw into another context (same transform conventions), e.g. for a blurred cast shadow
    const p = TOD[o.tod || 'dusk'], A0 = ctx.globalAlpha;   // inherit the beat's fade (and any alpha set by the caller)
    const m = personMask(who, h, o);
    const dx = x - m.ox, dy = y - m.oy, L = o.light || [1, -0.4], ln = Math.hypot(...L), lx = L[0] / ln, ly = L[1] / ln;
    const tint = (col) => { const c = mk(m.S, m.S), g = c.getContext('2d'); g.drawImage(m.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, m.S, m.S); return c; };
    const rim = tint(o.rimColor || p.rim), body = tint(o.color || p.fig);
    // halo (light wrapping round the figure), rim, body
    if ((o.halo == null ? 0.08 : o.halo) > 0) {   // blurred at 1/4 resolution and scaled back up (the pose changes every frame)
      ctx.save(); ctx.globalAlpha = A0 * (o.halo == null ? 0.08 : o.halo) * (o.alpha == null ? 1 : o.alpha); ctx.globalCompositeOperation = 'lighter';
      const hx = dx + lx * h * 0.01, hy = dy + ly * h * 0.01;
      if (ctx === K.ctx) blurred(Math.round(h * 0.03), g => g.drawImage(rim, hx, hy), [hx, hy, m.S, m.S]);
      else { ctx.filter = `blur(${Math.round(h * 0.03)}px)`; ctx.drawImage(rim, hx, hy); }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = A0 * (o.alpha == null ? 1 : o.alpha);
    ctx.drawImage(rim, dx + lx * Math.max(1.5, h * 0.004), dy + ly * Math.max(1.5, h * 0.004));
    ctx.drawImage(body, dx, dy);
    ctx.restore();
    if (o.hold) o.hold(m.hand[0] + dx, m.hand[1] + dy, m);
    return { hand: [m.hand[0] + dx, m.hand[1] + dy], handB: [m.handB[0] + dx, m.handB[1] + dy], head: [m.head[0] + dx, m.head[1] + dy], hr: m.hr };
  }

  // ---------------------------------------------------------------- spoken lines
  /* the active "say" step of a scene is drawn beside its speaker: anchors = { who: [x, y] } (usually above the head).
     Plain type, soft shadow, no box. Long lines wrap (about 11 characters per row on the vertical frame). */
  function say(api, lt, anchors, o = {}) {
    for (const s of api.steps) {
      if (!s.say || !anchors[s.say]) continue;
      const a0 = s.lt, a1 = s.lt + (s.dur || 2.5);
      const k = Math.min(ease.out(prog(lt, a0, a0 + 0.35)), 1 - ease.in(prog(lt, a1 - 0.35, a1)));
      if (k <= 0) continue;
      const [x, y] = anchors[s.say], size = o.size || 52, max = o.wrap || 10;
      const chars = [...s.text], rows = [];
      for (let i = 0; i < chars.length; i += max) rows.push(chars.slice(i, i + max).join(''));
      // prefer breaking at punctuation
      if (chars.length > max) { const j = chars.findIndex((c, i) => i >= max / 2 && '，。？！'.includes(c)); if (j > 0 && j < chars.length - 1) { rows.length = 0; rows.push(chars.slice(0, j + 1).join(''), chars.slice(j + 1).join('')); } }
      ctx.save(); ctx.font = `500 ${size}px ${F.sans}`; ctx.textBaseline = 'middle';
      const wmax = Math.max(...rows.map(r => ctx.measureText(r).width));
      const cx = clamp(x, 60 + wmax / 2, W - 60 - wmax / 2), ry = y - (rows.length - 1) * size * 0.65 - k * 6;
      ctx.textAlign = 'center'; ctx.globalAlpha = ctx.globalAlpha * k;
      if (o.backing) {      // on a bright background: a soft dark haze behind the words (no box)
        ctx.save(); softEllipse(cx, ry + (rows.length - 1) * size * 0.65, wmax * 0.62 + 30, size * (0.75 + rows.length * 0.55), 26, 'rgba(20,14,8,0.55)'); ctx.restore();
      }
      ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 14;
      ctx.fillStyle = o.color || '#fff6e6';
      rows.forEach((r, i) => ctx.fillText(r, cx, ry + i * size * 1.3));
      ctx.restore();
    }
  }
  /** is a step with show === name active / its progress */
  const stepAt = (api, name) => api.steps.find(s => s.show === name);
  const P_ = (api, lt, name, d = 1) => { const s = stepAt(api, name); return s ? ease.inOut(prog(lt, s.lt, s.lt + d)) : 0; };

  // ---------------------------------------------------------------- particles
  function motes(t, o = {}) {        // dust in the light / fireflies at night / steam
    const n = o.n || 40, r = rng(o.seed || 2), col = o.color || 'rgba(255,230,190,', x0 = o.x || 0, y0 = o.y || 0, w = o.w || W, hgt = o.h || H;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const bx = r(), by = r(), sp = 0.3 + r(), ph = r() * TAU, sz = 1.5 + r() * (o.size || 3);
      const x = x0 + ((bx * w + Math.sin(t * 0.3 * sp + ph) * 30 + t * (o.vx || 4) * sp) % w + w) % w;
      const y = y0 + ((by * hgt - t * (o.vy || 6) * sp) % hgt + hgt) % hgt;
      const a = (o.alpha || 0.5) * (0.5 + 0.5 * Math.sin(t * (o.blink || 0.9) * sp + ph));
      ctx.fillStyle = col + a + ')'; ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function steam(x, y, t, a = 0.5, w = 60) {
    const A0 = ctx.globalAlpha;   // inherit the beat fade
    ctx.save(); ctx.globalCompositeOperation = 'lighter';   // additive, so blurring the sum (at 1/4 resolution) = the sum of the blurs
    blurred(10, g => {
      for (let i = 0; i < 7; i++) {
        const k = ((t * 0.18 + i / 7) % 1), yy = y - k * 260, xx = x + Math.sin(t * 0.8 + i * 1.7 + k * 4) * w * (0.3 + k);
        g.globalAlpha = A0 * a * Math.sin(k * Math.PI) * 0.6; g.fillStyle = '#fff3e4'; g.beginPath(); g.ellipse(xx, yy, 26 + k * 50, 18 + k * 30, 0, 0, TAU); g.fill();
      }
    }, [x - w * 1.3 - 80, y - 260 - 50, w * 2.6 + 160, 260 + 70]);
    ctx.restore();
  }
  function light(x, y, r, color, a = 1) {
    const A0 = ctx.globalAlpha;   // inherit the beat fade
    if (a <= 0) return; ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = A0 * a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  function vignette(a = 0.55) {
    const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  /** handwriting: draw str revealing stroke by stroke (char by char) in LXGW WenKai, slightly uneven */
  function hand(str, x, y, size, k, o = {}) {
    const chars = [...str], n = chars.length, r = rng(o.seed || 4);
    ctx.save(); ctx.font = `400 ${size}px ${F.hand}`; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = o.color || '#2a2620';
    let cx = x;
    chars.forEach((ch, i) => {
      const a = clamp(k * n - i), dy = (r() - 0.5) * size * 0.12, rot = (r() - 0.5) * 0.08, w = ctx.measureText(ch).width;
      if (a > 0) { ctx.save(); ctx.globalAlpha = a * (o.alpha || 1); ctx.translate(cx + w / 2, y + dy); ctx.rotate(rot); ctx.fillText(ch, -w / 2, 0); ctx.restore(); }
      cx += w * (0.96 + r() * 0.08);
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- colour util
  function shade(hex, k) {   // k > 0 lighter, < 0 darker
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  const SURNAME = '李';   // everyone in 李家畈村 is a 李
  const MARK = '李';      // carved on his melons; in 李家畈村 only 李德厚 has the habit of carving, so 「李」 still means his melons
  const VILLAGE = '李家畈村';
  window.S = { SURNAME, MARK, VILLAGE, TOD, camera, layer, sky, sun, stars, hills, fog, ground, field, fieldSpots, melon, house, tricycle, person, say, stepAt, P: P_, motes, steam, light, vignette, hand, shade, cached, mk, soft, softEllipse, softRect, blurred };
})();
