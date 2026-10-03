/* 竞争世界 (e2): the beads become worlds; the world you did not list.
 * b07 worlds  — open on the 1000 beads (end of b06). "先别下结论" lands like a raised hand: a ripple stops the grid.
 *               On 'form' every bead lifts off the plane, flies toward the camera and lands on one of three 3D particle
 *               spheres (成功 gold from the 100 gold beads, 失败 steel from 600, 不死不活 violet from 300): each bead
 *               splashes into its own patch of the sphere, so the beads are visibly the spheres' material. A real
 *               perspective camera (eye / look-at / focal length / lens shift / depth of field) arcs around them.
 *               'flow': braided streams of light carry confidence between the worlds; spheres dim as light leaves and
 *               brighten as it arrives.
 * b08 missing — (continues b07) the light keeps circulating inside the list. 'reveal': the camera pulls far back and,
 *               out of the dark, a fourth sphere — fifteen times larger, cold, unlabelled — condenses beside the three
 *               tiny worlds; focus racks to it and its names 被收购 / 转型 resolve as glyph-particles on its surface.
 * One pure function of chain time ct (seconds since b07 began) draws both beats, so the join is seamless. */
(function () {
  const { W, H, F, clamp, lerp, prog, ease, fbm } = K;
  const { C, PROJ, gridPos, beat } = KIT;
  const TAU = Math.PI * 2;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const win = (t, a, b, fi, fo) => Math.min(ss(a, a + fi, t), 1 - ss(b - fo, b, t));
  const fract = x => x - Math.floor(x);

  // ---------------------------------------------------------------- the scene (world units; 1 unit = 100 px on the bead plane)
  const FOC = 1000, D0 = 10;                       // focal length (px) and the opening camera distance
  const FLY = 2.6, SPREAD = 1.6;                   // bead flight time, spread of departure times within a world (s)
  const WD = [                                      // the three listed worlds
    { col: PX.COL.gold, grid: PX.COL.gold, css: '#ffd58a', N: 22000, R: 1.0, c: [0.0, 2.4, 0.15], tilt: 0.38, spin: 0.21, wave: 3.25, a: 0.30, seed: 21, lab: -1 },
    { col: [0.52, 0.61, 0.76], grid: PX.COL.steel, css: '#aebcd4', N: 36000, R: 1.45, c: [-2.05, -1.5, -0.35], tilt: -0.3, spin: -0.16, wave: 3.85, a: 0.26, seed: 22, lab: 1 },
    { col: PX.COL.violet, grid: PX.COL.steel, css: '#b9a8ff', N: 28000, R: 1.2, c: [2.05, -1.35, 0.45], tilt: 0.55, spin: 0.19, wave: 4.45, a: 0.29, seed: 23, lab: 1 },
  ];
  const BEADS_OF = [PROJ.succ, PROJ.fail.slice(0, 600), PROJ.fail.slice(600)];

  // a stable table of points in the unit disc (depth-of-field scatter)
  const DOFN = 1 << 16, DOFX = new Float32Array(DOFN), DOFY = new Float32Array(DOFN);
  for (let i = 0; i < DOFN; i++) { const r = Math.sqrt(PX.rand(i, 91)), a = PX.rand(i, 92) * TAU; DOFX[i] = Math.cos(a) * r; DOFY[i] = Math.sin(a) * r; }
  const noise3 = (x, y, z) => (fbm(x, y, 3) + fbm(y + 5.2, z + 1.3, 3) + fbm(z + 9.1, x + 3.7, 3)) / 3;

  // ---------------------------------------------------------------- build the material (once)
  let S = null;
  function build() {
    if (S) return S;
    const NT = WD.reduce((s, w) => s + w.N, 0);
    const UX = new Float32Array(NT), UY = new Float32Array(NT), UZ = new Float32Array(NT), TX = new Float32Array(NT);
    const BID = new Uint16Array(NT), OX = new Float32Array(NT), OY = new Float32Array(NT), AG = new Float32Array(NT);
    const delay = new Float32Array(1000), BVX = new Float32Array(1000), BVY = new Float32Array(1000), BVZ = new Float32Array(1000);
    const GXw = new Float32Array(1000), GYw = new Float32Array(1000), GSX = new Float32Array(1000), GSY = new Float32Array(1000);
    for (let b = 0; b < 1000; b++) { const [x, y] = gridPos(b); GSX[b] = x; GSY[b] = y; GXw[b] = (x - W / 2) / 100; GYw[b] = (H / 2 - y) / 100; }
    const off = [], landEnd = [], landStart = [], ga = Math.PI * (3 - Math.sqrt(5));
    let o = 0;
    WD.forEach((w, wi) => {
      const beads = BEADS_OF[wi].slice().sort((a, b) => a - b), nb = beads.length;   // row-major: top of the grid first
      // landing points: a Fibonacci sphere, top to bottom, so the top of the grid lands on the top of the sphere
      const LX = new Float32Array(nb), LY = new Float32Array(nb), LZ = new Float32Array(nb);
      for (let k = 0; k < nb; k++) { const y = 1 - 2 * (k + 0.5) / nb, r = Math.sqrt(1 - y * y), a = k * ga; LX[k] = Math.cos(a) * r; LY[k] = y; LZ[k] = Math.sin(a) * r; }
      const sp = PX.sphere(w.N, w.seed, true), own = new Int32Array(w.N), cnt = new Int32Array(nb);
      for (let j = 0; j < w.N; j++) {             // each sphere point belongs to the nearest landing point (Voronoi patch)
        const x = sp.X[j], y = sp.Y[j], z = sp.Z[j]; let best = -9, bk = 0;
        for (let k = 0; k < nb; k++) { const d = x * LX[k] + y * LY[k] + z * LZ[k]; if (d > best) { best = d; bk = k; } }
        own[j] = bk; cnt[bk]++;
      }
      const seen = new Int32Array(nb);
      for (let j = 0; j < w.N; j++) {
        const g = o + j, k = own[j], b = beads[k], m = cnt[k], q = seen[k]++;
        let x = sp.X[j], y = sp.Y[j], z = sp.Z[j];
        const n = noise3(x * 1.8 + wi * 3, y * 1.8, z * 1.8);
        TX[g] = clamp(0.15 + 3.2 * (n - 0.32), 0.12, 2.0);
        if (j % 9 === 0) { const s = Math.cbrt(PX.rand(g, 5)) * 0.93; x *= s; y *= s; z *= s; }   // a little inner volume
        else if (j % 13 === 1) { const s = 1.06 + 0.45 * PX.rand(g, 6) ** 2; x *= s; y *= s; z *= s; TX[g] = 0.35 * (1.6 - s); }   // a thin atmosphere
        UX[g] = x; UY[g] = y; UZ[g] = z;
        // where the particle sits inside its bead (same sunflower look as KIT.beads), and the bead's brightness share
        const rr = Math.sqrt((q + 0.5) / m), an = q * ga + b * 1.7;
        OX[g] = Math.cos(an) * rr * 9; OY[g] = Math.sin(an) * rr * 9;
        AG[g] = 1.1 * 48 / m * (1 - 0.55 * rr * rr);
        BID[g] = b;
      }
      // bead departures: a wave out from the centre of the grid, roughened by the bead's own random rank
      let lmax = 0, lmin = 1e9;
      for (const b of beads) {
        const dx = GSX[b] - W / 2, dy = GSY[b] - 960, dn = Math.min(1, Math.hypot(dx, dy) / 760);
        delay[b] = w.wave + SPREAD * (0.55 * PROJ.rank[b] + 0.45 * dn);
        lmax = Math.max(lmax, delay[b] + FLY); lmin = Math.min(lmin, delay[b] + FLY * 0.7);
        // mid-flight bulge: toward the camera (+z) and a little sideways — beads rush at you, then away into a world
        const sa = PX.rand(b, 61) * TAU;
        BVZ[b] = 0.9 + 1.6 * PX.rand(b, 62); BVX[b] = Math.cos(sa) * 0.7; BVY[b] = Math.sin(sa) * 0.5 + 0.35;
      }
      off.push(o); landEnd.push(lmax); landStart.push(lmin); o += w.N;
    });
    const BUF = { X: new Float32Array(NT), Y: new Float32Array(NT), A: new Float32Array(NT), C: new Float32Array(NT * 3) };
    return (S = { NT, UX, UY, UZ, TX, BID, OX, OY, AG, delay, BVX, BVY, BVZ, GXw, GYw, GSX, GSY, off, landEnd, landStart, BUF });
  }

  // ---------------------------------------------------------------- camera
  // A real pinhole camera: eye orbiting a look-at target, focal length FOC, lens shift (cx, cy), focus distance zf
  // with circle of confusion kc * |z - zf| / z (px). At ct < 3 it is exactly the bead plane's 2D layout.
  const DS = 8.4, DP = 40, ZOOM = 1.3, T_FORM0 = 3.1, T_FORM1 = 8.6, T_PULL0 = 22.6, T_PULL1 = 29.6;
  function camAt(ct, withFocus = true) {
    const kF = ease.inOut(prog(ct, T_FORM0, T_FORM1)), kR = ease.inOut(prog(ct, T_PULL0, T_PULL1));
    const yaw = 0.42 * kF - 0.62 * ease.inOut(prog(ct, 7.5, 33));
    const pitch = 0.17 * kF + 0.05 * Math.sin((ct - 9) * 0.32) * ss(8, 11, ct) * (1 - kR) + 0.06 * kR;
    const dist = lerp(D0, DS, kF) + kR * (DP * (1 + ZOOM) - DS) + 1.5 * ss(T_PULL1, 39, ct);
    const tx = 0, ty = 0.25 * kF, tz = 0;
    const cp = Math.cos(pitch), ex = tx + dist * Math.sin(yaw) * cp, ey = ty + dist * Math.sin(pitch), ez = tz + dist * Math.cos(yaw) * cp;
    let fx = tx - ex, fy = ty - ey, fz = tz - ez; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, ry = 0, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;      // right = fwd × up(0,1,0)
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;           // up = right × fwd
    const cam = { ex, ey, ez, fx, fy, fz, rx, ry, rz, ux, uy, uz, f: FOC * (1 + ZOOM * kR + ZOOM * 0.04 * ss(T_PULL1, 39, ct)), cx: lerp(W / 2, 330, kR), cy: lerp(H / 2, 560, kR), dist, zf: dist, kc: 0, kR };
    if (withFocus) {
      cam.kc = 6 * ss(T_FORM0, 5, ct) + 16 * ss(6, 9.5, ct) + 18 * kR;
      const g = giant(), zG = (g.G[0] - ex) * fx + (g.G[1] - ey) * fy + (g.G[2] - ez) * fz;
      cam.zf = lerp(dist, zG - g.R * 0.75, ease.inOut(prog(ct, 26.4, 29.0)));     // rack focus to the giant's face
    }
    return cam;
  }
  const proj1 = (cam, x, y, z) => {
    const dx = x - cam.ex, dy = y - cam.ey, dz = z - cam.ez, zc = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    return { x: cam.cx + cam.f * (dx * cam.rx + dy * cam.ry + dz * cam.rz) / zc, y: cam.cy - cam.f * (dx * cam.ux + dy * cam.uy + dz * cam.uz) / zc, z: zc };
  };
  /** project n world points (WXa, WYa, WZa) with intensities A0 into out {X, Y, A}.
   *  Intensity: energy kept per screen area ((D0/z)^2) × depth cue (zf/z)^dexp (near = brighter) / defocus. */
  function project(n, WXa, WYa, WZa, A0, cam, out, dexp, salt, kcMul = 1) {
    const { ex, ey, ez, fx, fy, fz, rx, ry, rz, ux, uy, uz, f, cx, cy, zf } = cam, kc = cam.kc * kcMul, D2 = (D0 * f / FOC) ** 2;
    const OXa = out.X, OYa = out.Y, OAa = out.A;
    for (let i = 0; i < n; i++) {
      const a0 = A0[i]; if (a0 <= 0.0004) { OAa[i] = 0; continue; }
      const dx = WXa[i] - ex, dy = WYa[i] - ey, dz = WZa[i] - ez, zc = dx * fx + dy * fy + dz * fz;
      if (zc < 0.6) { OAa[i] = 0; continue; }
      const iz = 1 / zc;
      let X = cx + f * (dx * rx + dy * ry + dz * rz) * iz, Y = cy - f * (dx * ux + dy * uy + dz * uz) * iz;
      let rel = zf * iz; rel = dexp === 3 ? rel * rel * rel : dexp === 2 ? rel * rel : dexp === 1 ? rel : 1;
      if (rel > 3) rel = 3; else if (rel < 0.18) rel = 0.18;
      let a = a0 * D2 * iz * iz * rel;
      if (kc > 0) {
        const coc = kc * (zc > zf ? zc - zf : zf - zc) * iz, q = (i * 7 + salt) & (DOFN - 1);
        X += coc * DOFX[q]; Y += coc * DOFY[q]; a /= 1 + coc * 0.035;
      }
      OXa[i] = X; OYa[i] = Y; OAa[i] = a;
    }
  }

  // ---------------------------------------------------------------- confidence streams
  const PAIRS = [[1, 0], [0, 2], [2, 1]];          // 失败→成功, 成功→不死不活, 不死不活→失败
  const SWIN = [                                     // emission windows per stream [t0, t1, strength] (chain time)
    [[13.8, 16.1, 1], [18.6, 22.2, 0.85], [24.0, 40, 0.6]],
    [[15.0, 17.5, 1], [19.2, 22.8, 0.85], [24.6, 40, 0.6]],
    [[16.1, 18.4, 1], [19.8, 23.4, 0.85], [25.2, 40, 0.6]],
  ];
  const TRAVEL = 1.5, SM = 5200;
  const emit = (s, t) => { let e = 0; for (const [a, b, k] of SWIN[s]) if (t > a && t < b) e += k * win(t, a, b, 0.5, 0.5); return e; };
  const SB = { X: new Float32Array(SM * 3), Y: new Float32Array(SM * 3), Z: new Float32Array(SM * 3), A: new Float32Array(SM * 3), C: new Float32Array(SM * 9),
    O: { X: new Float32Array(SM * 3), Y: new Float32Array(SM * 3), A: new Float32Array(SM * 3) } };

  const centre = (wi, ct) => {
    const w = WD[wi], d = 0.17 * ss(8, 11, ct);
    return [w.c[0] + d * Math.sin(0.37 * ct + wi * 2.1), w.c[1] + d * 0.8 * Math.sin(0.29 * ct + wi * 1.3), w.c[2] + d * Math.sin(0.21 * ct + wi * 0.7)];
  };

  // ---------------------------------------------------------------- the unlisted world
  const GN = 110000;
  let GI = null;
  function giant() {
    if (GI) return GI;
    const cam = camAt(31, false), zG = cam.dist + 50 * (1 + ZOOM), Xs = 640, Ys = 1040;
    const xc = (Xs - cam.cx) * zG / cam.f, yc = (cam.cy - Ys) * zG / cam.f;
    const G = [cam.ex + cam.fx * zG + cam.rx * xc + cam.ux * yc, cam.ey + cam.fy * zG + cam.ry * xc + cam.uy * yc, cam.ez + cam.fz * zG + cam.rz * xc + cam.uz * yc];
    const Rpx = 340, R = Rpx * zG / cam.f;
    const sp = PX.sphere(GN, 77, true), X = new Float32Array(GN), Y = new Float32Array(GN), Z = new Float32Array(GN), TXg = new Float32Array(GN), TA = new Float32Array(GN);
    for (let i = 0; i < GN; i++) {
      let x = sp.X[i], y = sp.Y[i], z = sp.Z[i];
      TXg[i] = clamp(0.2 + 2.8 * (noise3(x * 1.3 + 4, y * 1.3, z * 1.3) - 0.33), 0.1, 2.0);
      if (i % 7 === 0) { const s = Math.cbrt(PX.rand(i, 13)) * 0.96; x *= s; y *= s; z *= s; }
      X[i] = x; Y[i] = y; Z[i] = z;
      TA[i] = 23.4 + 3.4 * Math.pow(PX.rand(i, 14), 0.8);                    // when this grain comes out of the dark
    }
    // the names, as glyph particles lying on the sphere's face: each glyph point is where the ct-31 camera's ray
    // through the intended screen spot hits the sphere (local frame = that camera's right / up / back)
    const e1 = [cam.rx, cam.ry, cam.rz], e2 = [cam.ux, cam.uy, cam.uz], e3 = [-cam.fx, -cam.fy, -cam.fz];
    const hit = (sx, sy) => {
      const px = (sx - cam.cx) / cam.f, py = (cam.cy - sy) / cam.f;
      let dx = cam.fx + cam.rx * px + cam.ux * py, dy = cam.fy + cam.ry * px + cam.uy * py, dz = cam.fz + cam.rz * px + cam.uz * py;
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      const ox = cam.ex - G[0], oy = cam.ey - G[1], oz = cam.ez - G[2], b = dx * ox + dy * oy + dz * oz, c = ox * ox + oy * oy + oz * oz - R * R;
      const t = -b - Math.sqrt(Math.max(0, b * b - c)), qx = ox + dx * t, qy = oy + dy * t, qz = oz + dz * t;
      return [(qx * e1[0] + qy * e1[1] + qz * e1[2]) / R, (qx * e2[0] + qy * e2[1] + qz * e2[2]) / R, (qx * e3[0] + qy * e3[1] + qz * e3[2]) / R];
    };
    const words = [];
    const lines = (beatLines('b08').unlisted || []);
    lines.forEach((str, li) => {
      const t = PX.text(str, { size: 128, family: F.serif, weight: 600, x: 0, y: 0, step: 1.5, seed: 40 + li, spacing: 20 });
      const oy = li === 0 ? -85 : 85, n = t.n, U = new Float32Array(n), V = new Float32Array(n), Wl = new Float32Array(n), S0 = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const [u, v, w2] = hit(Xs + t.X[i], Ys + t.Y[i] + 128 * 0.36 + oy);
        U[i] = u * 1.004; V[i] = v * 1.004; Wl[i] = w2 * 1.004;
        // where the grain starts: a scattered spot on the sphere nearby
        let sx = u + (PX.rand(i, 70 + li) - 0.5) * 0.6, sy = v + (PX.rand(i, 72 + li) - 0.5) * 0.6, sz = w2 + PX.rand(i, 74) * 0.2;
        const l = Math.hypot(sx, sy, sz); S0[i * 3] = sx / l; S0[i * 3 + 1] = sy / l; S0[i * 3 + 2] = sz / l;
      }
      words.push({ n, U, V, W: Wl, S0 });
    });
    return (GI = { G, R, Rpx, X, Y, Z, TX: TXg, TA, e1, e2, e3, words,
      B: { X: new Float32Array(GN), Y: new Float32Array(GN), Z: new Float32Array(GN), A: new Float32Array(GN), O: { X: new Float32Array(GN), Y: new Float32Array(GN), A: new Float32Array(GN) } } });
  }

  // ---------------------------------------------------------------- dust: a deep, faint field that gives the camera parallax
  const DN = 4200;
  let DU = null;
  function dust() {
    if (DU) return DU;
    const X = new Float32Array(DN), Y = new Float32Array(DN), Z = new Float32Array(DN), A = new Float32Array(DN);
    for (let i = 0; i < DN; i++) {
      const u = PX.rand(i, 201) * 2 - 1, a = PX.rand(i, 202) * TAU, r = 8 + 85 * Math.pow(PX.rand(i, 203), 0.6), s = Math.sqrt(1 - u * u);
      X[i] = Math.cos(a) * s * r; Y[i] = u * r * 0.8; Z[i] = Math.sin(a) * s * r - 15; A[i] = 0.25 + 0.75 * PX.rand(i, 204);
    }
    return (DU = { X, Y, Z, A, B: new Float32Array(DN), O: { X: new Float32Array(DN), Y: new Float32Array(DN), A: new Float32Array(DN) } });
  }

  const linesCache = {};
  function beatLines(id) {
    if (linesCache[id]) return linesCache[id];
    const b = T.TL && T.TL.beats.find(b => b.id === id);
    return (linesCache[id] = b ? b.visual.lines : {});
  }

  // ---------------------------------------------------------------- one frame of the chain
  const WXb = new Float32Array(120000), WYb = new Float32Array(120000), WZb = new Float32Array(120000), A0b = new Float32Array(120000);
  function drawWorlds(ctx, ct, tAbs) {
    const s = build(), cam = camAt(ct), L7 = beatLines('b07'), L8 = beatLines('b08');
    const pul = beat.pulse(tAbs, 5), endDim = 1 - 0.45 * ss(36.0, 39, ct);
    const kB = new Float32Array(1000);
    for (let b = 0; b < 1000; b++) kB[b] = clamp((ct - s.delay[b]) / FLY);

    // the hush: "先别下结论" lands, a ripple runs out from it and the grid around the words dims
    const tStop = 0.25, mText = ss(0.1, 0.5, ct) * (1 - ss(3.0, 3.9, ct));
    const PXw = new Float32Array(1000), PYw = new Float32Array(1000), MB = new Float32Array(1000);
    for (let b = 0; b < 1000; b++) {
      const dx = s.GSX[b] - W / 2, dy = s.GSY[b] - 950, d = Math.hypot(dx, dy) + 1e-3, ta = tStop + d / 1500;
      const rip = ct > ta ? 11 * Math.exp(-(ct - ta) * 3.5) * Math.sin((ct - ta) * 16) : 0;
      PXw[b] = s.GXw[b] + rip * dx / d / 100; PYw[b] = s.GYw[b] - rip * dy / d / 100;
      const e = (dx / 420) ** 2 + ((s.GSY[b] - 985) / 165) ** 2;
      MB[b] = 1 - 0.82 * mText * (1 - ss(0.55, 1.25, e));
    }

    // brightness of each world: dims while it sends light, brightens when light arrives
    const bright = [1, 1, 1];
    for (let si = 0; si < 3; si++) { const [a, b] = PAIRS[si]; bright[a] -= 0.38 * emit(si, ct); bright[b] += 0.55 * emit(si, ct - TRAVEL); }

    PX.begin();
    // dust
    const kD = ss(3.4, 7, ct) * endDim;
    if (kD > 0) {
      const d = dust();
      for (let i = 0; i < DN; i++) d.B[i] = d.A[i] * 0.5 * kD;
      // stars are points: no energy normalisation; brightness falls off gently with distance
      project(DN, d.X, d.Y, d.Z, d.B, { ...cam, zf: cam.dist, kc: 0 }, d.O, 0, 3);
      for (let i = 0; i < DN; i++) { if (d.O.A[i] > 0) { const zc = (d.X[i] - cam.ex) * cam.fx + (d.Y[i] - cam.ey) * cam.fy + (d.Z[i] - cam.ez) * cam.fz; d.O.A[i] = d.B[i] * clamp(14 / zc, 0.08, 1.4); } }
      PX.points(d.O.X, d.O.Y, DN, [0.75, 0.78, 0.95], { a: 1, A: d.O.A, glow: 0.2 });
    }

    // the three worlds
    const B = s.BUF;
    for (let wi = 0; wi < 3; wi++) {
      const w = WD[wi], o = s.off[wi], n = w.N, c = centre(wi, ct);
      const R = w.R * (1 + 0.012 * Math.sin(ct * 1.1 + wi * 2) + 0.012 * pul * ss(8, 9, ct));
      const th = w.spin * ct, cT = Math.cos(th), sT = Math.sin(th), cX = Math.cos(w.tilt), sX = Math.sin(w.tilt);
      const forming = ct < s.landEnd[wi], br = w.a * Math.max(0.35, bright[wi]) * endDim;
      const useC = forming && w.grid !== w.col;
      for (let j = 0; j < n; j++) {
        const g = o + j, ux = s.UX[g], uy = s.UY[g], uz = s.UZ[g];
        const x1 = ux * cT + uz * sT, z1 = -ux * sT + uz * cT;
        let x = c[0] + R * x1, y = c[1] + R * (uy * cX - z1 * sX), z = c[2] + R * (uy * sX + z1 * cX);
        let a = br * s.TX[g], mix = 1;
        if (forming) {
          const b = s.BID[g], k = kB[b];
          if (k < 1) {
            const px = PXw[b] + s.OX[g] * 0.01, py = PYw[b] - s.OY[g] * 0.01;
            const e = ease.inOut(k), sn = Math.sin(Math.PI * k);
            x = px + (x - px) * e + s.BVX[b] * sn; y = py + (y - py) * e + s.BVY[b] * sn; z = z * e + s.BVZ[b] * sn;
            mix = ss(0.12, 0.9, k);
            a = lerp(s.AG[g] * MB[b], a, mix);
          }
        }
        WXb[j] = x; WYb[j] = y; WZb[j] = z; A0b[j] = a;
        if (useC) { const q = j * 3; B.C[q] = lerp(w.grid[0], w.col[0], mix); B.C[q + 1] = lerp(w.grid[1], w.col[1], mix); B.C[q + 2] = lerp(w.grid[2], w.col[2], mix); }
      }
      project(n, WXb, WYb, WZb, A0b, cam, B, 3, o);
      PX.points(B.X, B.Y, n, w.col, { a: 1, A: B.A, C: useC ? B.C : null, glow: 0.45 });
    }

    // confidence streams: braided ribbons of light along curved 3D paths; a particle exists only if it left the source
    // while the stream was open, so each stream has a visible head and tail
    let ns = 0;
    const cen = [centre(0, ct), centre(1, ct), centre(2, ct)], gc = [(cen[0][0] + cen[1][0] + cen[2][0]) / 3, (cen[0][1] + cen[1][1] + cen[2][1]) / 3, (cen[0][2] + cen[1][2] + cen[2][2]) / 3];
    for (let si = 0; si < 3; si++) {
      if (emit(si, ct) <= 0 && emit(si, ct - TRAVEL) <= 0 && emit(si, ct - TRAVEL / 2) <= 0) continue;
      const [ia, ib] = PAIRS[si], A = cen[ia], Bc = cen[ib], Ra = WD[ia].R, Rb = WD[ib].R;
      let dx = Bc[0] - A[0], dy = Bc[1] - A[1], dz = Bc[2] - A[2]; const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      const P0 = [A[0] + dx * Ra * 0.85, A[1] + dy * Ra * 0.85, A[2] + dz * Ra * 0.85], P2 = [Bc[0] - dx * Rb * 0.85, Bc[1] - dy * Rb * 0.85, Bc[2] - dz * Rb * 0.85];
      // bow the path outward from the triangle and toward the viewer
      let mx = (P0[0] + P2[0]) / 2, my = (P0[1] + P2[1]) / 2, mz = (P0[2] + P2[2]) / 2;
      let ox = mx - gc[0], oy = my - gc[1], oz = mz - gc[2]; const ol = Math.hypot(ox, oy, oz) || 1;
      const P1 = [mx + ox / ol * 0.9, my + oy / ol * 0.9, mz + oz / ol * 0.9 + 1.1];
      // a frame across the path
      let n1x = dy * 0 - dz * 1, n1y = dz * 0 - dx * 0, n1z = dx * 1 - dy * 0; const nl = Math.hypot(n1x, n1y, n1z) || 1; n1x /= nl; n1y /= nl; n1z /= nl;
      const n2x = dy * n1z - dz * n1y, n2y = dz * n1x - dx * n1z, n2z = dx * n1y - dy * n1x;
      const ca = WD[ia].col, cb = WD[ib].col;
      for (let i = 0; i < SM; i++) {
        const u = fract(PX.rand(i, 40 + si * 3) + ct / TRAVEL), te = ct - u * TRAVEL, e = emit(si, te);
        if (e <= 0.01) continue;
        const v = 1 - u, bx = v * v * P0[0] + 2 * u * v * P1[0] + u * u * P2[0], by = v * v * P0[1] + 2 * u * v * P1[1] + u * u * P2[1], bz = v * v * P0[2] + 2 * u * v * P1[2] + u * u * P2[2];
        const fil = i % 6, r1 = PX.rand(i, 41 + si * 3), r2 = PX.rand(i, 42 + si * 3), r3 = PX.rand(i, 43 + si * 3);
        const env = Math.pow(Math.sin(Math.PI * u), 0.7);
        let cs, sn;
        if (fil === 0) {                                   // loose sparks around the braid
          const rr = (0.04 + 0.3 * env) * Math.sqrt(r1), an = r2 * TAU + u * 4;
          cs = Math.cos(an) * rr; sn = Math.sin(an) * rr;
        } else {                                           // five tight strands twisting around each other
          const rr = 0.025 + 0.13 * env, an = fil * TAU / 5 + u * 10 - ct * 2.2;
          cs = Math.cos(an) * rr + (r1 - 0.5) * 0.03; sn = Math.sin(an) * rr + (r3 - 0.5) * 0.03;
        }
        SB.X[ns] = bx + cs * n1x + sn * n2x; SB.Y[ns] = by + cs * n1y + sn * n2y; SB.Z[ns] = bz + cs * n1z + sn * n2z;
        SB.A[ns] = e * (fil === 0 ? 0.7 : 1) * ss(0, 0.06, u) * (1 - ss(0.88, 1, u)) * endDim * (0.5 + r2);
        const q = ns * 3, uu = ss(0.1, 0.9, u);
        SB.C[q] = lerp(ca[0], cb[0], uu) * 0.85 + 0.15; SB.C[q + 1] = lerp(ca[1], cb[1], uu) * 0.85 + 0.15; SB.C[q + 2] = lerp(ca[2], cb[2], uu) * 0.85 + 0.15;
        ns++;
      }
    }
    if (ns) { project(ns, SB.X, SB.Y, SB.Z, SB.A, cam, SB.O, 2, 11); PX.points(SB.O.X, SB.O.Y, ns, null, { a: 0.2, A: SB.O.A, C: SB.C, glow: 0.6 }); }

    // the unlisted world
    if (ct > 23.3) {
      const g = giant(), GB = g.B, kCold = ss(27.6, 30.6, ct);
      const th = 0.022 * (ct - 31), cT = Math.cos(th), sT = Math.sin(th), [e1, e2, e3] = [g.e1, g.e2, g.e3];
      const gA = (22 + 18 * kCold) * endDim;
      for (let i = 0; i < GN; i++) {
        const k = ss(g.TA[i], g.TA[i] + 2.4, ct);
        if (k <= 0) { GB.A[i] = 0; continue; }
        const sc = g.R * (1 + (1 - k) * 0.55 * PX.rand(i, 15));
        const lx = g.X[i] * cT + g.Z[i] * sT, ly = g.Y[i], lz = -g.X[i] * sT + g.Z[i] * cT;
        GB.X[i] = g.G[0] + sc * (lx * e1[0] + ly * e2[0] + lz * e3[0]);
        GB.Y[i] = g.G[1] + sc * (lx * e1[1] + ly * e2[1] + lz * e3[1]);
        GB.Z[i] = g.G[2] + sc * (lx * e1[2] + ly * e2[2] + lz * e3[2]);
        GB.A[i] = gA * k * k * g.TX[i];
      }
      project(GN, GB.X, GB.Y, GB.Z, GB.A, cam, GB.O, 2, 29, 0.6);
      const cold = [0.55, 0.66, 0.86], warm = [0.80, 0.74, 1.0];
      PX.points(GB.O.X, GB.O.Y, GN, [lerp(cold[0], warm[0], kCold), lerp(cold[1], warm[1], kCold), lerp(cold[2], warm[2], kCold)], { a: 1, A: GB.O.A, glow: 0.5 });
      // its names condense out of its own surface
      g.words.forEach((wd, li) => {
        const t0 = 27.0 + li * 0.9; if (ct < t0) return;
        let m = 0;
        for (let i = 0; i < wd.n; i++) {
          const k = ease.inOut(ss(t0 + PX.rand(i, 80 + li) * 0.9, t0 + PX.rand(i, 80 + li) * 0.9 + 1.4, ct)); if (k <= 0) continue;
          let u = lerp(wd.S0[i * 3], wd.U[i], k), v = lerp(wd.S0[i * 3 + 1], wd.V[i], k), w2 = lerp(wd.S0[i * 3 + 2], wd.W[i], k);
          const lx = u * cT + w2 * sT, lz = -u * sT + w2 * cT;
          GB.X[m] = g.G[0] + g.R * (lx * e1[0] + v * e2[0] + lz * e3[0]);
          GB.Y[m] = g.G[1] + g.R * (lx * e1[1] + v * e2[1] + lz * e3[1]);
          GB.Z[m] = g.G[2] + g.R * (lx * e1[2] + v * e2[2] + lz * e3[2]);
          GB.A[m] = k * endDim * (0.8 + 0.4 * PX.rand(i, 85)); m++;
        }
        project(m, GB.X, GB.Y, GB.Z, GB.A, cam, GB.O, 0, 47, 0);
        PX.points(GB.O.X, GB.O.Y, m, [0.93, 0.89, 1.0], { a: 55, A: GB.O.A, glow: 0.45 });
      });
    }
    PX.flush({ exposure: 1.5, glow: 0.95 });

    // ---- type
    const kR = cam.kR;
    // world names float beside their spheres and track them in 3D
    (L7.names || []).forEach((nm, wi) => {
      const w = WD[wi], c = centre(wi, ct), le = s.landEnd[wi];
      const al = ss(le - 0.9, le + 0.2, ct) * (1 - 0.35 * kR) * (1 - 0.6 * ss(36.5, 39, ct));
      if (al <= 0) return;
      const dir = w.lab, off = w.R * 1.05 + 0.32;
      const p = proj1(cam, c[0] + cam.ux * off * -dir, c[1] + cam.uy * off * -dir, c[2] + cam.uz * off * -dir);
      const size = Math.round(clamp(42 * 8.6 * cam.f / FOC / p.z, 24, 42));
      L.serif(nm, p.x, p.y + (dir > 0 ? size * 0.25 : -size * 0.1), { size, weight: 600, color: w.css, glow: 10, alpha: al, reveal: prog(ct, le - 0.9, le + 0.5), spacing: size * 0.12 });
    });
    // b07
    KIT.type(L7.stop, W / 2, 960, { size: 86, family: F.serif, weight: 600, mode: 'punch', k: prog(ct, 0.15, 0.6), color: C.ink, out: prog(ct, 3.0, 3.7) });
    const ly = lerp(1072, 380, ease.inOut(prog(ct, 3.25, 4.7)));
    L.serif(L7.list, W / 2, ly, { size: 58, weight: 600, color: C.ink, glow: 8, reveal: prog(ct, 1.55, 2.6), alpha: 1 - ss(12.9, 13.6, ct), spacing: 5 });
    L.serif(L7.flow, W / 2, 380, { size: 58, weight: 600, color: C.ink, glow: 8, reveal: prog(ct, 13.8, 15.0), alpha: (ct > 13.8 ? 1 : 0) * (1 - ss(17.4, 18.0, ct)), spacing: 5, highlight: ['信心'], hiColor: C.gold });
    // b08
    if (ct >= 18) {
      L.serif(L8.claim, W / 2, 380, { size: 56, weight: 600, color: C.ink, glow: 8, reveal: prog(ct, 18.2, 19.6), alpha: 1 - ss(23.0, 23.8, ct), spacing: 3, highlight: ['列出的世界'], hiColor: '#d9d2ff' });
      L.serif(L8.real, W / 2, 1560, { size: 56, weight: 600, color: C.ink, glow: 8, reveal: prog(ct, 30.0, 31.6), alpha: 1 - 0.3 * ss(34.5, 35.5, ct), spacing: 3 });
      L.serif(L8.humble, W / 2, 1660, { size: 56, weight: 600, color: C.ink, glow: 8, reveal: prog(ct, 34.5, 36.2), spacing: 3, highlight: ['「我可能漏了什么」'], hiColor: '#d4c8ff' });
    }
  }

  const chainT = (lt, api) => lt - api.chainStart;
  T.register('worlds', {
    draw(ctx, V, lt, api) { drawWorlds(ctx, chainT(lt, api), api.beat.start + lt); },
    cues(V, api) {
      const s = build(), out = [];
      out.push({ t: 0.2, type: 'hush' }, { t: 1.55, type: 'chip' });
      WD.forEach((w, wi) => {
        out.push({ t: w.wave, type: 'whoosh', dur: SPREAD + FLY * 0.6, world: wi });
        out.push({ t: s.landStart[wi], type: 'ticks', dur: s.landEnd[wi] - s.landStart[wi], n: 16 + wi * 4, p0: 0.75 - wi * 0.2, p1: 0.55 - wi * 0.2 });
      });
      out.push({ t: s.landEnd[2], type: 'resolve' });
      SWIN.forEach((ws, si) => ws.forEach(([a, b]) => { if (a < 18) out.push({ t: a, type: 'stream', dur: Math.min(b, 18) - a + TRAVEL, stream: si }); }));
      return out;
    },
  });
  T.register('missing', {
    draw(ctx, V, lt, api) { drawWorlds(ctx, chainT(lt, api), api.beat.start + lt); },
    cues(V, api) {
      const c0 = -api.chainStart, out = [];   // chain time -> local time: ct - c0
      SWIN.forEach((ws, si) => ws.forEach(([a, b]) => { if (a >= 18 && a < 30) out.push({ t: a - c0, type: 'stream', dur: Math.min(b, 39) - a, stream: si }); }));
      out.push({ t: T_PULL0 - c0, type: 'whoosh', dur: 2.5 }, { t: T_PULL0 - c0, type: 'swell', dur: 7.5 });
      out.push({ t: 27.0 - c0, type: 'gather', dur: 2.3 }, { t: 27.9 - c0, type: 'chip' });
      out.push({ t: 30.0 - c0, type: 'hush' }, { t: 34.5 - c0, type: 'resolve' });
      return out;
    },
  });
})();
