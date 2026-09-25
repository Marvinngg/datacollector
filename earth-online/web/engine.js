/* 地球 Online — deterministic canvas engine.
 * Every frame is a pure function of absolute time t (seconds): renderFrame(t).
 * Scenes register with E.register(id, {pad, draw, cues}). Shared look lives in P (palette), F (fonts),
 * the helpers on E (easing, text, panels, noise) and E.World (the one map every scene shares). */
(function () {
  const W = 1920, H = 1080;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  // ---------- palette & fonts ----------
  const P = {
    bg: '#0a0d13',        // ink night
    bg2: '#10151e',
    ink: '#e9e4d8',       // warm paper white (main text)
    dim: '#8a909b',       // secondary text
    faint: '#4a505b',     // disabled / grey-out
    line: '#2a313d',      // hairlines, grid
    gold: '#d8b25c',      // money / main quest
    ember: '#ff9a55',     // the spark (fascination)
    warm: '#f2c98a',      // other players' warmth
    teal: '#6fd6c8',      // AI teammates
    ok: '#8fd18a',        // ✓
  };
  const F = {
    mono: '"JetBrains Mono", "Noto Sans SC", monospace',   // HUD, numbers, logs
    sans: '"Noto Sans SC", sans-serif',                    // UI Chinese
    serif: '"Noto Serif SC", serif',                        // titles
    hand: '"LXGW WenKai", "Noto Sans SC", serif',          // subtitles, intimate text
  };

  // ---------- math / easing ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => clamp((t - a) / (b - a));           // 0..1 progress of t across [a,b]
  const ease = {
    linear: k => k,
    inOut: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
    out: k => 1 - Math.pow(1 - k, 3),
    in: k => k * k * k,
    outExpo: k => k === 1 ? 1 : 1 - Math.pow(2, -10 * k),
    outBack: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
    sine: k => -(Math.cos(Math.PI * k) - 1) / 2,
  };
  // fade in over [a, a+fi], hold, fade out over [b-fo, b]
  const window_ = (t, a, b, fi = .4, fo = .4) => Math.min(ease.out(prog(t, a, a + fi)), 1 - ease.in(prog(t, b - fo, b)));

  // deterministic random
  function rng(seed) { let s = seed >>> 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, oct = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= .5; } return s; }

  // ---------- drawing helpers ----------
  function font(size, family = F.sans, weight = 400) { return `${weight} ${size}px ${family}`; }
  /** text(str, x, y, opts) — opts: size, family, weight, color, alpha, align, baseline, spacing(px), glow(px), glowColor */
  function text(str, x, y, o = {}) {
    const c = o.ctx || ctx;
    c.save();
    c.font = font(o.size || 32, o.family || F.sans, o.weight || 400);
    c.fillStyle = o.color || P.ink;
    c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
    c.textAlign = o.align || 'left';
    c.textBaseline = o.baseline || 'alphabetic';
    if (o.glow) { c.shadowColor = o.glowColor || c.fillStyle; c.shadowBlur = o.glow; }
    if (o.spacing) { c.letterSpacing = o.spacing + 'px'; }
    c.fillText(str, x, y);
    c.restore();
  }
  function measure(str, o = {}) {
    ctx.save(); ctx.font = font(o.size || 32, o.family || F.sans, o.weight || 400);
    if (o.spacing) ctx.letterSpacing = o.spacing + 'px';
    const w = ctx.measureText(str).width; ctx.restore(); return w;
  }
  /** typewriter: characters of str visible at local time lt when typing starts at t0 with cps chars/sec */
  function typed(str, lt, t0, cps = 18) { const n = Math.floor(clamp((lt - t0) * cps, 0, str.length)); return Array.from(str).slice(0, n).join(''); }
  function typedDone(str, t0, cps = 18) { return t0 + Array.from(str).length / cps; }
  const caretOn = (lt, rate = 1.1) => (lt * rate) % 1 < .55;
  function rrect(x, y, w, h, r, c = ctx) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  /** panel(x,y,w,h,opts) — the HUD box used everywhere. opts: r, fill, stroke, alpha, lineWidth */
  function panel(x, y, w, h, o = {}) {
    const c = o.ctx || ctx;
    c.save(); c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
    rrect(x, y, w, h, o.r == null ? 10 : o.r, c);
    c.fillStyle = o.fill || 'rgba(16,21,30,0.82)'; c.fill();
    c.lineWidth = o.lineWidth || 1.5; c.strokeStyle = o.stroke || 'rgba(233,228,216,0.18)'; c.stroke();
    c.restore();
  }
  function dot(x, y, r, color, o = {}) {
    const c = o.ctx || ctx;
    c.save(); c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
    if (o.glow) { c.shadowColor = color; c.shadowBlur = o.glow; }
    c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function ring(x, y, r, color, o = {}) {
    const c = o.ctx || ctx;
    c.save(); c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
    c.strokeStyle = color; c.lineWidth = o.lineWidth || 2; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.restore();
  }

  // ---------- World: the single shared map (topographic contours under fog) ----------
  // World coordinates: 0..WORLD in both axes. The player's home point is WORLD/2, WORLD/2.
  const WORLD = 6000;
  const World = {
    size: WORLD,
    home: { x: WORLD / 2, y: WORLD / 2 },
    _map: null,
    build() {
      const S = 2048, k = S / WORLD; // offscreen map resolution
      const oc = document.createElement('canvas'); oc.width = oc.height = S;
      const c = oc.getContext('2d');
      c.fillStyle = P.bg; c.fillRect(0, 0, S, S);
      // height field
      const N = 256, cell = S / N, hf = new Float32Array((N + 1) * (N + 1));
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) hf[j * (N + 1) + i] = fbm(i / 38 + 11.3, j / 38 + 4.7, 5);
      // marching squares contours
      const levels = []; for (let v = 0.22; v < 0.8; v += 0.028) levels.push(v);
      levels.forEach((lv, li) => {
        c.beginPath();
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const a = hf[j * (N + 1) + i], b = hf[j * (N + 1) + i + 1], d = hf[(j + 1) * (N + 1) + i], e = hf[(j + 1) * (N + 1) + i + 1];
          const idx = (a > lv) | ((b > lv) << 1) | ((e > lv) << 2) | ((d > lv) << 3);
          if (idx === 0 || idx === 15) continue;
          const x = i * cell, y = j * cell;
          const top = [x + cell * (lv - a) / (b - a), y], right = [x + cell, y + cell * (lv - b) / (e - b)];
          const bot = [x + cell * (lv - d) / (e - d), y + cell], left = [x, y + cell * (lv - a) / (d - a)];
          const seg = (p, q) => { c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); };
          switch (idx) {
            case 1: case 14: seg(left, top); break; case 2: case 13: seg(top, right); break;
            case 3: case 12: seg(left, right); break; case 4: case 11: seg(right, bot); break;
            case 5: seg(left, top); seg(right, bot); break; case 10: seg(top, right); seg(left, bot); break;
            case 6: case 9: seg(top, bot); break; case 7: case 8: seg(left, bot); break;
          }
        }
        const major = li % 5 === 0;
        c.strokeStyle = major ? 'rgba(150,170,190,0.46)' : 'rgba(125,145,170,0.22)';
        c.lineWidth = major ? 1.6 : 1; c.stroke();
      });
      // faint lat/long grid
      c.strokeStyle = 'rgba(120,140,165,0.07)'; c.lineWidth = 1;
      for (let g = 0; g <= S; g += S / 24) { c.beginPath(); c.moveTo(g, 0); c.lineTo(g, S); c.moveTo(0, g); c.lineTo(S, g); c.stroke(); }
      this._map = oc; this._k = k;
    },
    /** camera: {x, y, zoom} — world point at screen center, zoom = screen px per world unit */
    toScreen(cam, wx, wy) { return { x: W / 2 + (wx - cam.x) * cam.zoom, y: H / 2 + (wy - cam.y) * cam.zoom }; },
    /** draw the map. opts: alpha, fog (0..1 fog density), reveal: [{x,y,r}] world-space clear circles */
    draw(cam, o = {}) {
      if (!this._map) this.build();
      const k = this._k, sw = W / cam.zoom, sh = H / cam.zoom;
      ctx.save(); ctx.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this._map, (cam.x - sw / 2) * k, (cam.y - sh / 2) * k, sw * k, sh * k, 0, 0, W, H);
      const fog = o.fog == null ? 0 : o.fog;
      if (fog > 0) {
        // fog layer with holes
        const fc = this._fogCanvas || (this._fogCanvas = Object.assign(document.createElement('canvas'), { width: W, height: H }));
        const f = fc.getContext('2d');
        f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, W, H);
        f.fillStyle = `rgba(10,13,19,${0.93 * fog})`; f.fillRect(0, 0, W, H);
        // drifting fog texture
        f.globalAlpha = 0.5 * fog;
        const ft = this._fogTex || (this._fogTex = World._makeFogTex());
        const drift = (o.t || 0) * 6;
        const tile = ft.width;
        const ox = (-(cam.x * cam.zoom * 0.35 + drift) % tile + tile) % tile - tile;
        const oy = (-(cam.y * cam.zoom * 0.35) % tile + tile) % tile - tile;
        for (let yy = oy; yy < H; yy += tile) for (let xx = ox; xx < W; xx += tile) f.drawImage(ft, xx, yy);
        f.globalAlpha = 1;
        f.globalCompositeOperation = 'destination-out';
        (o.reveal || []).forEach(rv => {
          const s = this.toScreen(cam, rv.x, rv.y), r = rv.r * cam.zoom;
          if (r <= 1) return;
          const g = f.createRadialGradient(s.x, s.y, r * 0.15, s.x, s.y, r);
          g.addColorStop(0, `rgba(0,0,0,${rv.a == null ? 1 : rv.a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
          f.fillStyle = g; f.beginPath(); f.arc(s.x, s.y, r, 0, Math.PI * 2); f.fill();
        });
        ctx.drawImage(fc, 0, 0);
      }
      ctx.restore();
    },
    _makeFogTex() {
      const S = 512, oc = document.createElement('canvas'); oc.width = oc.height = S;
      const c = oc.getContext('2d'), img = c.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        // tileable fbm
        const u = x / S, v = y / S, R = 5;
        const n = (fbm(u * R, v * R) * (1 - u) * (1 - v) + fbm((u - 1) * R, v * R) * u * (1 - v) + fbm(u * R, (v - 1) * R) * (1 - u) * v + fbm((u - 1) * R, (v - 1) * R) * u * v);
        const a = clamp((n - 0.35) * 2.2) * 255, i = (y * S + x) * 4;
        img.data[i] = 70; img.data[i + 1] = 82; img.data[i + 2] = 100; img.data[i + 3] = a * 0.55;
      }
      c.putImageData(img, 0, 0); return oc;
    },
    /** the player: a small warm-white dot with a soft halo and optional pulse ring */
    player(cam, wx, wy, o = {}) {
      const s = this.toScreen(cam, wx, wy), a = o.alpha == null ? 1 : o.alpha;
      const pr = ((o.t || 0) * 0.8) % 1;
      if (o.pulse !== false) ring(s.x, s.y, 10 + pr * 38, P.ink, { alpha: a * (1 - pr) * 0.5, lineWidth: 1.5 });
      dot(s.x, s.y, 20, 'rgba(233,228,216,0.10)', { alpha: a });
      dot(s.x, s.y, 7, P.ink, { alpha: a, glow: 16 });
      return s;
    },
    /** a map marker (pin) the player places. opts: color, label, alpha, drop (0..1 drop-in progress), size */
    marker(cam, wx, wy, o = {}) {
      const s = this.toScreen(cam, wx, wy), a = o.alpha == null ? 1 : o.alpha;
      const dk = o.drop == null ? 1 : o.drop, col = o.color || P.gold, sz = o.size || 1;
      const y = s.y - (1 - ease.outBack(dk)) * 60 * sz;
      ctx.save(); ctx.globalAlpha *= a * clamp(dk * 3);
      // ground ripple when landing
      if (dk > 0.6 && dk < 1) ring(s.x, s.y, 6 + (dk - 0.6) / 0.4 * 40 * sz, col, { alpha: 1 - (dk - 0.6) / 0.4, lineWidth: 1.5 });
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 18;
      ctx.beginPath(); // diamond pin
      ctx.moveTo(s.x, y - 26 * sz); ctx.lineTo(s.x + 11 * sz, y - 13 * sz); ctx.lineTo(s.x, y); ctx.lineTo(s.x - 11 * sz, y - 13 * sz); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      dot(s.x, s.y, 3 * sz, col);
      if (o.label) text(o.label, s.x + 20 * sz, y - 8 * sz, { size: 26 * sz, family: F.sans, weight: 500, color: col });
      ctx.restore();
      return s;
    },
  };

  // Shared camera + fixed places, so scenes authored separately hand off seamlessly.
  World.cam0 = { x: World.home.x, y: World.home.y, zoom: 0.55 };           // the standard "my map" view
  World.spots = {
    money: { x: World.home.x + 820, y: World.home.y - 330 },                // the 挣钱 marker (s3 onward)
    spark: { x: World.home.x - 520, y: World.home.y + 240 },                // where the small spark flickers (s4)
    newMark: { x: World.home.x - 700, y: World.home.y - 420 },              // the new marker placed at the very end (s6)
  };
  World.homeReveal = r => ({ x: World.home.x, y: World.home.y, r: r == null ? 520 : r });

  /** questBox(content, opts): the top-left "当前任务" HUD box shared by s2/s3/s4/s6.
   *  opts: alpha, caret (bool: show blinking caret after content), lt (for caret blink), color (content color) */
  function questBox(content, o = {}) {
    const x = 80, y = 72, w = 520, h = 104, a = o.alpha == null ? 1 : o.alpha;
    if (a <= 0) return;
    panel(x, y, w, h, { alpha: a, r: 12 });
    text('当前任务', x + 28, y + 38, { size: 20, family: F.sans, weight: 500, color: P.dim, alpha: a, spacing: 4 });
    text('QUEST', x + w - 28, y + 38, { size: 16, family: F.mono, color: P.faint, alpha: a, align: 'right', spacing: 3 });
    const cs = content || '';
    text(cs, x + 28, y + 80, { size: 34, family: F.sans, weight: 500, color: o.color || P.ink, alpha: a });
    if (o.caret && caretOn(o.lt || 0)) {
      const cw = cs ? measure(cs, { size: 34, family: F.sans, weight: 500 }) + 6 : 0;
      ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = P.ink; ctx.fillRect(x + 28 + cw, y + 52, 3, 36); ctx.restore();
    }
  }
  /** clockHUD(str, opts): small clock at top-right, e.g. '01:40'. opts: alpha, color, label */
  function clockHUD(str, o = {}) {
    const a = o.alpha == null ? 1 : o.alpha; if (a <= 0) return;
    const x = W - 80, y = 72;
    panel(x - 220, y, 220, 104, { alpha: a, r: 12 });
    text(o.label || '本地时间', x - 196, y + 38, { size: 20, family: F.sans, weight: 500, color: P.dim, alpha: a, spacing: 4 });
    text(str, x - 196, y + 84, { size: 44, family: F.mono, weight: 400, color: o.color || P.ink, alpha: a, spacing: 2 });
  }

  // ---------- engine core ----------
  const E = {
    W, H, ctx, canvas, P, F, clamp, lerp, prog, ease, window: window_, rng, vnoise, fbm, hash2,
    font, text, measure, typed, typedDone, caretOn, rrect, panel, dot, ring, World, questBox, clockHUD,
    TL: null, scenes: {}, order: [], subtitles: true,
    register(id, def) { this.scenes[id] = def; },
    scene(id) { return this.TL.scenes.find(s => s.id === id); },
    line(id) { const l = this.TL.lines.find(l => l.id === id); return l && { ...l, end: l.start + l.dur }; },
    /** time of a line relative to its scene start: {start, end} in scene-local seconds */
    lineLocal(id) { const l = this.line(id), s = this.scene(l.scene); return { start: l.start - s.start, end: l.start + l.dur - s.start, dur: l.dur }; },
  };

  // subtitles (global, restrained): hand font, bottom center
  function drawSubtitles(t) {
    if (!E.subtitles) return;
    const ls = E.TL.lines;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], next = ls[i + 1];
      const a0 = next ? Math.max(l.start, next.start - 0.12) : l.start;           // next line's fade-in start
      const end = Math.min(l.start + l.dur + 0.35, next ? a0 : Infinity);        // fade out before it
      const fo = Math.min(0.3, Math.max(0.08, end - (l.start + l.dur)));
      const a = window_(t, l.start - 0.1, end, 0.25, fo);
      if (a <= 0) continue;
      const str = l.text.replace(/[。]$/, '');
      ctx.save(); ctx.globalAlpha = a * 0.92;
      const w = measure(str, { size: 44, family: F.hand, spacing: 2 });
      const g = ctx.createLinearGradient(0, H - 150, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g; ctx.fillRect(W / 2 - w / 2 - 120, H - 150, w + 240, 150);
      text(str, W / 2, H - 70, { size: 44, family: F.hand, color: P.ink, align: 'center', spacing: 2 });
      ctx.restore();
    }
  }

  // film post: vignette + subtle grain
  let grain = null;
  function post(t) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (!grain) {
      grain = document.createElement('canvas'); grain.width = grain.height = 256;
      const g = grain.getContext('2d'), img = g.createImageData(256, 256), r = rng(7);
      for (let i = 0; i < img.data.length; i += 4) { const n = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = n; img.data[i + 3] = 14; }
      g.putImageData(img, 0, 0);
    }
    const f = Math.floor(t * 30), rr = rng(f * 13 + 1), ox = -Math.floor(rr() * 256), oy = -Math.floor(rr() * 256);
    ctx.save(); ctx.globalCompositeOperation = 'overlay';
    for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx.drawImage(grain, x, y);
    ctx.restore();
  }

  function renderFrame(t) {
    E.t = t;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    for (const sc of E.TL.scenes) {
      const def = E.scenes[sc.id]; if (!def) continue;
      const pad = def.pad || [0, 0];
      if (t < sc.start - pad[0] || t >= sc.end + pad[1]) continue;
      ctx.save();
      try { def.draw(ctx, t - sc.start, sc, t); }
      catch (e) { console.error(sc.id, e); text(`[${sc.id}] ${e.message}`, 40, 60, { size: 24, color: '#f55', family: F.mono }); }
      ctx.restore();
    }
    drawSubtitles(t);
    post(t);
    ctx.restore();
  }

  /** all sound cues declared by scenes, absolute seconds: [{t, type, ...}] */
  function allCues() {
    const out = [];
    for (const sc of E.TL.scenes) {
      const def = E.scenes[sc.id];
      if (def && def.cues) for (const c of def.cues(sc)) out.push({ ...c, t: +(c.t + sc.start).toFixed(3), scene: sc.id });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  E.ready = (async () => {
    E.TL = await (await fetch('/build/timeline.json', { cache: 'no-store' })).json();
    World.build();
  })();
  window.E = E; window.P = P; window.F = F;
  window.renderFrame = renderFrame; window.allCues = allCues;
})();
