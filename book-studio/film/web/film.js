/* Generic film runtime for book-studio.
 * The page loads one part's timeline (?tl=<url>, default /build/timeline.json): a list of scenes with absolute
 * start/end times (whole beats of the score), a mood and `marks` (local seconds of the moments the score hits).
 * Templates register with T.register(type, { draw(ctx, V, lt, api) }) and draw one scene; `draw` is a pure function
 * of the local time lt (frames render out of order, in parallel workers).
 * The runtime owns: the night background graded by mood, the ambient dust, real cross-fades between scenes (both
 * scenes are drawn across the cut), ONE particle pass per frame (templates only call PX.points / helpers; the
 * runtime calls PX.begin/PX.flush), the part label, vignette + static grain, fade from / to black.
 * renderFrame(t) is a pure function of t. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, text, rng } = K;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });
  const T = { templates: {}, register(type, def) { this.templates[type] = def; } };
  const XF = 0.9;                    // cross-fade length, centred on each cut
  const SAFE = { x0: 80, x1: 1000, y0: 260, y1: 1700 };
  let TL = null;

  // ---------------------------------------------------------------- moods
  const rgb = KIT.rgb;
  const MOOD = {
    cold:    { text: '#cdd6e8', key: '#f2f6ff', line: 'rgba(205,220,255,0.55)', css: '205,220,255',
               bg: { c: [120, 150, 215], a: 0.10, x: 0.5, y: 0.10 }, dust: [0.70, 0.80, 1.0] },
    warm:    { text: '#f0e2cc', key: '#ffc985', line: 'rgba(255,201,133,0.6)', css: '255,196,130',
               bg: { c: [255, 170, 95], a: 0.095, x: 0.5, y: 0.70 }, dust: [1.0, 0.78, 0.50] },
    neutral: { text: '#dcd7cc', key: '#fffaf0', line: 'rgba(236,231,220,0.5)', css: '236,228,214',
               bg: { c: [160, 160, 172], a: 0.05, x: 0.5, y: 0.40 }, dust: [0.85, 0.84, 0.82] },
  };
  for (const m of Object.values(MOOD)) { m.textL = rgb(m.text); m.keyL = rgb(m.key); }

  // ---------------------------------------------------------------- background
  const bgCache = new Map();
  function bgLight(g) {
    const key = g.c.join(',') + g.a + g.x + g.y; let c = bgCache.get(key); if (c) return c;
    c = mk(W / 4, H / 4); const x = c.getContext('2d');
    const r = x.createRadialGradient(c.width * g.x, c.height * g.y, 0, c.width * g.x, c.height * g.y, c.height * 0.8);
    r.addColorStop(0, `rgba(${g.c},${g.a})`); r.addColorStop(0.45, `rgba(${g.c},${g.a * 0.38})`); r.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = r; x.fillRect(0, 0, c.width, c.height); bgCache.set(key, c); return c;
  }
  // weight of each mood at time t (moods cross-fade over 2 s around each cut)
  function moodWeights(t) {
    const w = { cold: 0, warm: 0, neutral: 0 }, sc = TL.scenes;
    for (let i = 0; i < sc.length; i++) {
      const s = sc[i], a = i === 0 ? -1e9 : s.start - 1.0, b = i === sc.length - 1 ? 1e9 : s.end + 1.0;
      if (t < a || t > b) continue;
      const k = Math.min(i === 0 ? 1 : ease.inOut(prog(t, s.start - 1.0, s.start + 1.0)), i === sc.length - 1 ? 1 : 1 - ease.inOut(prog(t, s.end - 1.0, s.end + 1.0)));
      w[s.mood] += k;
    }
    const n = w.cold + w.warm + w.neutral || 1; w.cold /= n; w.warm /= n; w.neutral /= n; return w;
  }
  function background(t, mw) {
    ctx.fillStyle = '#06080d'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.imageSmoothingEnabled = true;
    for (const m of ['neutral', 'cold', 'warm']) if (mw[m] > 0.003) { ctx.globalAlpha = mw[m]; ctx.drawImage(bgLight(MOOD[m].bg), 0, 0, W, H); }
    ctx.restore();
  }
  // ambient dust: a few hundred faint motes drifting up through the dark (one world for every scene)
  const DN = 260, dX = new Float32Array(DN), dY = new Float32Array(DN), dA = new Float32Array(DN);
  function dust(t, mw) {
    for (let i = 0; i < DN; i++) {
      const r1 = PX.rand(i, 501), r2 = PX.rand(i, 502), r3 = PX.rand(i, 503), sp = 6 + 14 * r3;
      dX[i] = 30 + r1 * (W - 60) + Math.sin(t * (0.07 + 0.1 * r2) + i) * 24;
      dY[i] = ((r2 * (H + 200) - t * sp) % (H + 200) + H + 200) % (H + 200) - 100;
      dA[i] = (0.25 + 0.75 * r3) * (0.55 + 0.45 * Math.sin(t * (0.4 + r1) + i * 3.1));
    }
    const col = [0, 1, 2].map(k => mw.cold * MOOD.cold.dust[k] + mw.warm * MOOD.warm.dust[k] + mw.neutral * MOOD.neutral.dust[k]);
    PX.points(dX, dY, DN, col, { a: 0.13, A: dA, glow: 0.5, size: 2 });
  }

  // ---------------------------------------------------------------- post: vignette + a static grain (cheap to encode)
  let grain = null, vign = null;
  function post() {
    if (!vign) {
      vign = mk(W / 4, H / 4); const g = vign.getContext('2d');
      const v = g.createRadialGradient(vign.width / 2, vign.height * 0.48, vign.height * 0.28, vign.width / 2, vign.height / 2, vign.height * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
      g.fillStyle = v; g.fillRect(0, 0, vign.width, vign.height);
    }
    ctx.drawImage(vign, 0, 0, W, H);
    if (!grain) {
      grain = mk(W, H); const g = grain.getContext('2d'), img = g.createImageData(W, H), r = rng(7);
      for (let i = 0; i < img.data.length; i += 4) { const n = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = n; img.data[i + 3] = 7; }
      g.putImageData(img, 0, 0);
    }
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(grain, 0, 0); ctx.restore();
  }

  // ---------------------------------------------------------------- the part label (top, small) for parts that don't open on a title
  function partLabel(t) {
    const s0 = TL.scenes[0]; if (!s0 || s0.type === 'title' || !TL.part.title) return;
    const a = Math.min(ease.out(prog(t, 0.4, 1.6)), 1 - ease.in(prog(t, Math.min(4.5, s0.end - 0.6), Math.min(5.5, s0.end + 0.2))));
    if (a <= 0) return;
    text(TL.part.title, W / 2, 318, { size: 26, family: F.sans, weight: 400, color: 'rgba(236,231,220,0.62)', align: 'center', spacing: 6, alpha: a });
    ctx.save(); ctx.globalAlpha = a * 0.5; ctx.fillStyle = 'rgba(236,231,220,0.5)';
    const w = 90 * ease.inOut(prog(t, 0.6, 2.0)); ctx.fillRect(W / 2 - w / 2, 344, w, 1); ctx.restore();
  }

  function missing(V) { text(`[${V.type}]`, W / 2, H / 2, { size: 30, family: F.mono, color: '#666', align: 'center' }); }

  function makeApi(V) {
    return { dur: V.end - V.start, marks: V.marks || {}, mood: MOOD[V.mood] || MOOD.neutral, MOOD, safe: SAFE, TL,
      mark(name, d = 0) { const m = V.marks && V.marks[name]; return m == null ? null : m + d; } };
  }
  const apis = new WeakMap();

  function renderFrame(t) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const mw = moodWeights(t);
    PX.begin();
    background(t, mw);
    dust(t, mw);
    const sc = TL.scenes;
    for (let i = 0; i < sc.length; i++) {
      const V = sc[i], first = i === 0, last = i === sc.length - 1;
      const a0 = first ? V.start : V.start - XF / 2, b0 = last ? TL.duration : V.end + XF / 2;
      if (t < a0 || t >= b0) continue;
      const fin = first ? 1 : ease.inOut(prog(t, V.start - XF / 2, V.start + XF / 2));
      const fout = last ? 1 : 1 - ease.inOut(prog(t, V.end - XF / 2, V.end + XF / 2));
      const a = Math.min(fin, fout); if (a <= 0.002) continue;
      let api = apis.get(V); if (!api) apis.set(V, api = makeApi(V));
      ctx.save(); ctx.globalAlpha = a;
      const def = T.templates[V.type];
      try { def ? def.draw(ctx, V, t - V.start, api) : missing(V); }
      catch (e) { console.error(V.type, V.i, e); text(`[${V.type} ${V.i}] ${e.message}`, 60, 200, { size: 24, color: '#f55', family: F.mono }); }
      ctx.restore();
    }
    partLabel(t);
    PX.flush({ exposure: 1.5, glowR: 5, glow: 1.0 });
    post();
    const fi = 1 - ease.out(prog(t, 0, 0.8));                         // from black
    const fe = ease.in(prog(t, TL.duration - 1.5, TL.duration - 0.15)); // to black
    const k = Math.max(fi, fe);
    if (k > 0) { ctx.globalAlpha = k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.restore();
  }

  T.ready = (async () => {
    const q = new URLSearchParams(location.search).get('tl') || '/build/timeline.json';
    TL = await (await fetch(q, { cache: 'no-store' })).json();
    T.TL = TL;
  })();
  window.T = T; window.E = { ready: T.ready }; window.MOOD = MOOD;
  window.renderFrame = renderFrame;
})();
