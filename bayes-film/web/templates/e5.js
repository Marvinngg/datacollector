/* 人与 AI (e5): the machine computes, the human decides.
 * b17 ai    — an eruption of computation: tens of thousands of tiny monospace tokens (worlds, evidence, ratios, odds,
 *             probabilities) race upward as particle text, far faster than reading. The four jobs condense out of the
 *             stream one per two beats; the flood turns the frame into a luminous cyan field; "AI 做得快…" is cut
 *             out of the light in black.
 * b18 human — hard stop: the stream freezes mid-flight (motion blur snaps to crisp glyphs) and the colour drains to
 *             grey from the top down. Silence. One warm caret. A human types 要解决什么？, slowly. Two keycaps 做 / 不做.
 *             Then the tug-of-war rope from e3, now driven by the machine: a cyan ruler snaps in, the knot jumps
 *             1:9 → 5:9 → 10:27 with mechanical precision; then the machine light goes out and the two teams and the
 *             ends of the rope are lit warm — the frame resolves to calm.
 * Everything is a pure function of lt (the stream's speed is a closed-form integral via a fixed lookup table). */
(function () {
  const { W, H, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const { C, beat } = KIT;
  const TAU = Math.PI * 2;
  const at = (api, n) => KIT.at(api, n);
  const COL = PX.COL;
  // the render pipeline preloads serif 400/600 only; the rope figures use serif 900 (fonts.ready waits for this)
  try { document.fonts.load('900 120px "Noto Serif SC"', '人'); } catch (e) { /* not in a browser */ }

  // ================================================================ the token stream (shared by b17 and b18)
  const TOKS = [
    // expanded worlds
    '成功', '失败', '不死不活', '被收购', '转型', '破产', '小而美', '被抄袭', '慢慢长大', '关门', '爆款', '停滞',
    // evidence
    '创始人背景优秀', '产品还没上线', '团队很努力', '用户增长', '复购率', '现金流', '竞品进场', '留存 31%', '融资 B 轮', '毛利',
    // likelihood ratios
    '×5', '×⅔', '×1.3', '×0.8', '×1', '×2.4', '×0.5', '×1.1', '×9', '×0.95', '×3', '×0.6', '×5', '×⅔',
    // odds
    '1:9', '5:9', '10:27', '2:7', '3:5', '1:4', '7:20', '9:1', '4:11', '1:1', '1:9', '5:9', '10:27',
    // probabilities
    '36.0%', '27.0%', '10.0%', '50.0%', '41.2%', '18.5%', '63.0%', '25.0%', '40.0%', '12.7%', '88.1%', '3.4%', '35.7%',
    // computation
    'P(D|H)', 'P(D|¬H)', '50/100', '90/900', '20/50', '54/90', 'LR=5', 'P(H|D)', 'Σ=1', 'odds', 'p=0.27', 'n=1000',
  ];
  const TOK_SIZE = 26, TOK_STEP = 1.55;
  // token point clouds, cached here once the fonts are in (PX.text's own cache key calls document.fonts.check: too slow
  // to hit thousands of times a frame)
  const TC = [], TCF = [];
  function tokPrep() {                       // -> this frame's clouds (PX.text is called once per token per frame at most)
    if (TC.length === TOKS.length) return TC;
    const ok = document.fonts.status === 'loaded' && document.fonts.check(`400 ${TOK_SIZE}px ${F.mono}`, TOKS.join(''));
    for (let i = 0; i < TOKS.length; i++) {
      TCF[i] = PX.text(TOKS[i], { size: TOK_SIZE, family: F.mono, weight: 400, x: 0, y: 0, step: TOK_STEP, jitter: 0.5, seed: 3 + i });
      if (ok) TC[i] = TCF[i];
    }
    return TCF;
  }

  // timing of b17 (from the timeline, so b18 can reconstruct b17's last frame exactly)
  let _AT = null;
  function AT() {
    if (_AT) return _AT;
    const r = { burst: 0, flood: 6, fast: 10.5, dur: 13.5 };
    const b = T.TL && T.TL.beats.find(x => x.visual.type === 'ai');
    if (b) {
      const st = (n, d) => { const s = (b.visual.steps || []).find(s => s.show === n); return s ? s.t - b.start : d; };
      r.burst = st('burst', 0); r.flood = st('flood', 6); r.fast = st('fast', 10.5); r.dur = b.end - b.start;
    }
    return (_AT = r);
  }
  // speed multiplier of the stream and its integral S(t) (fixed table => position is closed-form in lt)
  function mult(t) {
    const a = AT();
    return 1 + 0.7 * Math.exp(-Math.max(0, t - a.burst) * 1.4)          // the eruption kicks
      + 1.5 * ease.inOut(prog(t, a.flood, a.flood + 4.5))               // the flood accelerates
      + 0.6 * ease.inOut(prog(t, a.fast, a.dur));
  }
  let ST = null; const SDT = 1 / 120, ST0 = -2;
  function S(t) {
    if (!ST) { const n = Math.ceil(30 / SDT); ST = new Float64Array(n + 1); for (let i = 1; i <= n; i++) ST[i] = ST[i - 1] + mult(ST0 + (i - 0.5) * SDT) * SDT; }
    const f = clamp((t - ST0) / SDT, 0, ST.length - 1.001), i = f | 0;
    return ST[i] + (ST[i + 1] - ST[i]) * (f - i);
  }

  // instances: each one token travelling upward in its lane
  let INST = null;
  const N_BURST = 1500, N_FLOOD = 1900;
  function inst() {
    if (INST) return INST;
    const a = AT(), N = N_BURST + N_FLOOD, r = rng(5151);
    const I = { N, tok: new Uint16Array(N), x0: new Float32Array(N), s: new Float32Array(N), v: new Float32Array(N), tb: new Float32Array(N),
      grp: new Uint8Array(N), ph: new Float32Array(N), ofs: new Float32Array(N), k: new Float32Array(N) };
    for (let i = 0; i < N; i++) {
      I.tok[i] = Math.floor(r() * TOKS.length);
      const d = Math.pow(r(), 1.7);                                    // depth: most tokens are far and small
      I.s[i] = 0.42 + 0.95 * d;
      I.v[i] = (380 + 1700 * d) * (0.8 + 0.4 * r());
      I.x0[i] = -30 + r() * (W + 60);
      if (i < N_BURST) {                                               // the eruption widens from the centre lane outward
        const dx = Math.abs(I.x0[i] - W / 2) / (W / 2);
        I.tb[i] = a.burst + 0.05 + 2.6 * Math.pow(dx, 1.4) + 2.6 * Math.pow(r(), 1.6);
      } else I.tb[i] = a.flood - 0.4 + 4.2 * Math.pow(r(), 0.85);
      I.grp[i] = d < 0.18 ? 0 : (r() < 0.14 ? 2 : 1);                 // 0 far (deep teal), 1 cyan, 2 hot (white-cyan)
      I.ph[i] = r() * TAU; I.ofs[i] = r(); I.k[i] = r();
    }
    return (INST = I);
  }
  // growable point batches (3 colour groups + misc)
  const BUF = [];
  function bufg(g, n) {
    let b = BUF[g];
    if (!b || b.X.length < n) { const m = Math.max(n, b ? b.X.length * 1.5 : 1 << 16) | 0; b = BUF[g] = { X: new Float32Array(m), Y: new Float32Array(m), A: new Float32Array(m), n: 0 }; }
    return b;
  }
  const GCOL = [[0.22, 0.55, 0.70], COL.cyan, [0.80, 1.0, 0.97]];
  const GREY = [0.62, 0.64, 0.66];
  const L_WRAP = H + 260;

  // weather: slow bright "rivers" in the stream that drift upward with it (0.25..1)
  const weather = (x, yw, t) => 0.62 + 0.22 * Math.sin(x * 0.0062 + 1.6 * Math.sin(yw * 0.0021 + t * 0.3)) + 0.16 * Math.sin(yw * 0.0047 - x * 0.0023);

  /** Splat the stream as it is at b17-local time lt. o:
   *   frozen   true: no motion blur, no dust, no flicker (b18)
   *   collect  true: fill BUF[0..2] and return instead of splatting (for the frozen-frame cache)
   *   part     {y, rx, ry, q}: tokens part around an ellipse (for the four jobs)  */
  function stream(lt, o = {}) {
    const CL = tokPrep();
    const a = AT(), I = inst(), Sl = S(lt), m = mult(lt);
    const fl = ease.inOut(prog(lt, a.flood, a.flood + 4.0));
    const fan = 1 - ease.inOut(prog(lt, a.burst + 1.5, a.burst + 5.5));
    const shutter = o.frozen ? 0 : 1 / 100;
    const wk = (o.frozen ? 0 : 1) * (0.25 + 0.75 * fl) * (1 - 0.6 * ease.inOut(prog(lt, a.fast, a.fast + 1.5)));   // weather strength
    const part = o.part;
    // beat flashes: a few random tokens flare on every beat
    const absT = lt + (o.t0 || 0), bi = Math.floor(absT / beat.BEAT), pul = o.frozen ? 0 : beat.pulse(absT, 7);
    // glitch bands (flood only): rows of the stream jump sideways for a frame
    const fr = Math.floor(lt * 30), gr = rng(fr * 977 + 3), gl = o.frozen ? 0 : fl * (0.35 + 0.65 * pul);
    const bands = []; if (gl > 0.05) for (let q = 0; q < 5; q++) if (gr() < gl * 0.7) bands.push([gr() * H, 4 + gr() * 34, (gr() - 0.5) * 160]);
    const B = [bufg(0, 1), bufg(1, 1), bufg(2, 1)];
    for (const b of B) b.n = 0;
    const yScroll = Sl * 900;
    const lum = ease.inOut(prog(lt, a.fast - 1.5, a.fast + 0.6)), gain = o.frozen ? 1 : 1 + 0.8 * fl + 1.0 * lum;
    for (let i = 0; i < I.N; i++) {
      const tb = I.tb[i]; if (lt < tb) continue;
      const v = I.v[i], s = I.s[i];
      const travel = (Sl - S(tb)) * v;
      const y = H + 90 - (travel % L_WRAP);
      if (y < -120 || y > H + 100) continue;
      let x = I.x0[i] + Math.sin(y * 0.0035 + I.ph[i]) * 10 * s;
      if (fan > 0 && i < N_BURST) { const neck = fan * Math.exp(-(H + 90 - y) / 650); x = lerp(x, W / 2 + (x - W / 2) * 0.06, neck); }
      for (const bd of bands) if (Math.abs(y - bd[0]) < bd[1]) x += bd[2];
      let al = 0.5 * (0.45 + 0.55 * s) * gain;
      if (wk > 0) { const w = weather(x, y + yScroll, lt); al *= lerp(1, w * w * 1.7, wk); }
      if (part && part.q > 0) {
        const dx = (x - W / 2) / part.rx, dy = (y - part.y) / part.ry, e2 = dx * dx + dy * dy;
        if (e2 < 1.8) { const k = part.q * ease.inOut((1.8 - e2) / 1.8); x += Math.sign(dx || 1) * k * 160; al *= 1 - 0.8 * k; }
      }
      if (!o.frozen && ((I.k[i] * 977 + bi * 0.618) % 1) < 0.06) al *= 1 + 2.2 * pul;
      const cl = CL[I.tok[i]];
      const dens = Math.min(1, 0.26 + 0.62 * s * s);
      const n = Math.max(6, Math.floor(cl.n * dens));
      const blur = Math.min(v * m * shutter * s, 10 + 22 * s);
      const g = I.grp[i];
      const b = bufg(g, B[g].n + n); B[g] = b;
      const X = b.X, Y = b.Y, A = b.A, sk = (i * 13) & 1023;
      let j0 = b.n;
      for (let j = 0; j < n; j++, j0++) {
        X[j0] = x + cl.X[j] * s;
        Y[j0] = y + cl.Y[j] * s + (PX.rand(j, sk) - 0.5) * blur;
        A[j0] = al;
      }
      b.n = j0;
    }
    if (o.collect) return B;
    for (let g = 0; g < 3; g++) { const b = BUF[g]; if (b && b.n) PX.points(b.X, b.Y, b.n, GCOL[g], { a: 1, A: b.A, glow: 0 }); }
    // the luminous rain: motes too small to be glyphs, each a thin vertical streak of light (flood only)
    const nF = Math.floor(30000 * ease.inOut(prog(lt, a.flood + 0.2, a.flood + 4.0)));
    if (nF > 0) {
      const SEG = 6, b = bufg(4, nF * SEG), X = b.X, Y = b.Y, A = b.A;
      let k = 0;
      for (let j = 0; j < nF; j++) {
        const v = 1100 + 2800 * PX.rand(j, 21), tr = Sl * v + PX.rand(j, 23) * L_WRAP;
        const x = PX.rand(j, 22) * W, y = H + 100 - (tr % L_WRAP), st = Math.min(9, v * m * shutter * 0.22);
        const cx = (x - W / 2) / 430, core = 0.45 + 0.9 * Math.exp(-cx * cx);
        const w = wk > 0 ? lerp(1, weather(x, y + yScroll, lt), wk) : 1;
        const al = (0.12 + 0.2 * PX.rand(j, 25)) * core * w * w * 1.5 * (1 + 2.2 * lum);
        for (let q = 0; q < SEG; q++, k++) { X[k] = x; Y[k] = y + q * st; A[k] = al * (1 - q / SEG); }
      }
      PX.points(X, Y, k, [0.62, 1, 0.95], { a: 1, A, glow: 0.35 });
    }
  }

  // b18: the frozen stream, cached as two images (still cyan / drained grey): it never moves again
  let FROZ = null;
  function frozen() {
    if (FROZ) return FROZ;
    const B = stream(AT().dur - 1e-3, { frozen: true, collect: true });
    const acc = new Float32Array(W * H * 3);
    for (let g = 0; g < 3; g++) {
      const b = B[g], c = GCOL[g];
      for (let i = 0; i < b.n; i++) {
        const x = b.X[i], y = b.Y[i]; if (!(x >= 0 && y >= 0 && x < W - 1 && y < H - 1)) continue;
        const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, a = b.A[i];
        const w = [(1 - fx) * (1 - fy) * a, fx * (1 - fy) * a, (1 - fx) * fy * a, fx * fy * a], ks = [(yi * W + xi) * 3, (yi * W + xi + 1) * 3, ((yi + 1) * W + xi) * 3, ((yi + 1) * W + xi + 1) * 3];
        for (let q = 0; q < 4; q++) { acc[ks[q]] += c[0] * w[q]; acc[ks[q] + 1] += c[1] * w[q]; acc[ks[q] + 2] += c[2] * w[q]; }
      }
    }
    const mkImg = (f) => {
      const cv = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = cv.getContext('2d');
      const img = g.createImageData(W, H), d = img.data;
      for (let p = 0, k = 0; p < W * H; p++, k += 3) { const [r, gg, bb] = f(acc[k], acc[k + 1], acc[k + 2]); d[p * 4] = r; d[p * 4 + 1] = gg; d[p * 4 + 2] = bb; d[p * 4 + 3] = 255; }
      g.putImageData(img, 0, 0); return cv;
    };
    const tm = (v, e) => 255 * (1 - Math.exp(-v * e));
    const cyan = mkImg((r, g, b) => [tm(r, 1.6), tm(g, 1.6), tm(b, 1.6)]);
    const grey = mkImg((r, g, b) => { const l = tm((r + g + b) / 3, 1.5); return [l * 0.92, l * 0.95, l]; });
    const out = { cyan, grey };
    if (TC.length === TOKS.length) FROZ = out;          // only cache once the real glyphs are in
    return out;
  }

  // ================================================================ b17 ai
  T.register('ai', {
    draw(ctx, V, lt, api) {
      const a = AT(), tF = at(api, 'flood'), tFast = at(api, 'fast');
      if (lt > api.dur - 0.6) ctx.globalAlpha = 1;                     // hard cut into b18's freeze (no fade-out)
      const fl = ease.inOut(prog(lt, tF, tF + 4.0));
      // the four jobs: one every two beats during the burst, condensed out of the stream
      const jobs = V.lines.jobs, tJ = k => at(api, 'burst') + beat.BEAT * (1 + 2 * k), JD = beat.BEAT * 2 - 0.1;
      let part = null;
      for (let k = 0; k < jobs.length; k++) {
        const t0 = tJ(k), d = lt - t0; if (d < -0.2 || d > JD + 0.3) continue;
        const q = Math.min(ease.out(prog(d, -0.2, 0.15)), 1 - ease.in(prog(d, JD - 0.25, JD + 0.2)));
        if (q > (part ? part.q : 0)) part = { y: 960, rx: 520, ry: 150, q };
      }
      PX.begin();
      stream(lt, { part, t0: api.beat.start });
      for (let k = 0; k < jobs.length; k++) {
        const t0 = tJ(k), d = lt - t0; if (d < -0.05 || d > JD + 0.4) continue;
        jobWord(jobs[k], d, JD, k);
      }
      const jobHit = Math.max(...jobs.map((_, k) => { const d = lt - tJ(k); return d >= 0 ? Math.exp(-d * 5) : 0; }));
      const pul = beat.pulse(lt + api.beat.start, 6) * fl;
      PX.flush({ exposure: lerp(1.4, 3.0, fl) * (1 + 0.25 * jobHit + 0.15 * pul), glow: lerp(0.8, 1.2, fl), glowR: 5 });
      // 'fast': the line lands as a black cut-out in the light
      const fk = prog(lt, tFast, tFast + 0.45);
      if (fk > 0) {
        const rows = splitAt(V.lines.fast, '，'), size = 96;
        rows.forEach((r, i) => {
          const kk = clamp(fk * 1.3 - i * 0.3), e = ease.outExpo(kk), y = 930 + i * 128;
          if (kk <= 0) return;
          ctx.save(); ctx.translate(W / 2, y); const sc = lerp(1.25, 1, e); ctx.scale(sc, sc);
          text(r, 0, 0, { size, family: F.serif, weight: 900, color: '#021012', align: 'center', alpha: clamp(kk * 3), spacing: 6 });
          if (kk < 0.4) text(r, 0, 0, { size, family: F.serif, weight: 900, color: '#ffffff', align: 'center', alpha: (1 - kk / 0.4) * 0.9, spacing: 6 });
          ctx.restore();
        });
      }
    },
    cues(V, api) {
      const t = n => at(api, n), out = [];
      out.push({ t: t('burst'), type: 'stream', dur: KIT.stepDur(api, 'burst') });
      out.push({ t: t('burst'), type: 'whoosh', dur: 1.2 });
      V.lines.jobs.forEach((_, k) => out.push({ t: t('burst') + beat.BEAT * (1 + 2 * k), type: 'chip', i: k }));
      out.push({ t: t('flood'), type: 'glitch' });
      out.push({ t: t('flood'), type: 'stream', dur: KIT.stepDur(api, 'flood') + KIT.stepDur(api, 'fast') });
      out.push({ t: t('flood'), type: 'riser', dur: KIT.stepDur(api, 'flood') });
      for (let k = 2; k < 6; k += 1) out.push({ t: t('flood') + k * beat.BEAT, type: 'glitch', k });
      out.push({ t: t('fast'), type: 'punch' });
      return out;
    },
  });
  // a job word: condenses upward out of the stream, holds, then is swept away upward
  function jobWord(str, d, JD, k) {
    const s = PX.text(str, { size: 190, family: F.sans, weight: 700, x: W / 2, y: 1030, step: 1.7, spacing: 14, seed: 11 + k });
    const b = bufg(6, s.n), X = b.X, Y = b.Y, A = b.A;
    for (let i = 0; i < s.n; i++) {
      const r1 = PX.rand(i, 51), r2 = PX.rand(i, 52);
      const e = ease.outExpo(clamp((d - r1 * 0.12) / 0.22));
      const ex = Math.max(0, d - (JD - 0.25) - r2 * 0.15), up = ex * ex * (2600 + 3000 * r1);
      X[i] = s.X[i] + Math.sin(r2 * 40) * (1 - e) * 30;
      Y[i] = s.Y[i] + (1 - e) * (260 + r2 * 520) - up;
      A[i] = e * (1 - clamp(ex / 0.35));
    }
    PX.points(X, Y, s.n, [0.86, 1, 0.98], { a: 1.6, A, glow: 0.2 });
  }
  function splitAt(str, p) {
    const i = str.indexOf(p); return i < 0 ? [str] : [str.slice(0, i + 1), str.slice(i + 1)];
  }

  // ================================================================ b18 human
  const WARM = '#f6ead6', WARM2 = '#d9cbb3';
  const KEY_OFS = [0, 0.27, 0.52, 0.93, 1.16, 1.62];   // a person typing: uneven, a pause before the question mark
  T.register('human', {
    draw(ctx, V, lt, api) {
      const A_ = AT();
      const tFz = at(api, 'freeze'), tCur = at(api, 'cursor'), tDec = at(api, 'decide'), tRope = at(api, 'rope'), tWho = at(api, 'who');
      if (lt < 0.6) ctx.globalAlpha = 1;                               // hard cut: the freeze is instantaneous
      // ---- the frozen stream: drains to grey from the top down, then sinks into the dark
      const drainY = lerp(-150, H + 150, ease.inOut(prog(lt, tFz + 0.05, tFz + 1.3)));
      const fieldA = lt < tFz + 1.3 ? lerp(1, 0.75, prog(lt, tFz, tFz + 1.3))
        : lt < tRope ? lerp(0.75, 0.34, ease.out(prog(lt, tFz + 1.3, tDec))) * (1 - 0.35 * prog(lt, tDec, tRope))
        : lerp(0.22, 0, ease.inOut(prog(lt, tRope, tRope + 0.9)));
      const ropeK = ease.inOut(prog(lt, tRope - 0.1, tRope + 0.8));
      if (fieldA > 0.003) {
        const fz = frozen(), c = ctx; c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= fieldA;
        if (drainY < H) { c.save(); c.beginPath(); c.rect(0, Math.max(0, drainY), W, H); c.clip(); c.drawImage(fz.cyan, 0, 0); c.restore(); }
        if (drainY > 0) { c.save(); c.beginPath(); c.rect(0, 0, W, Math.min(H, drainY)); c.clip(); c.drawImage(fz.grey, 0, 0); c.restore(); }
        c.restore();
      }
      // a soft dark well in the middle (space for the human)
      const well = ease.inOut(prog(lt, tFz + 0.6, tFz + 2.2)) * (1 - ropeK);
      if (well > 0) {
        ctx.save(); const g = ctx.createRadialGradient(W / 2, 980, 0, W / 2, 980, 760);
        g.addColorStop(0, 'rgba(4,4,6,0.78)'); g.addColorStop(0.6, 'rgba(4,4,6,0.45)'); g.addColorStop(1, 'rgba(4,4,6,0)');
        ctx.globalAlpha *= well; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      // ---- the human layer: caret, question, keys (all warm white); it lifts as 'decide' arrives, leaves at 'rope'
      const lift = -170 * ease.inOut(prog(lt, tDec, tDec + 0.7));
      const hOut = ease.in(prog(lt, tRope - 0.15, tRope + 0.5));
      if (hOut < 1) {
        ctx.save(); ctx.globalAlpha *= 1 - hOut; ctx.translate(0, lift - hOut * 50);
        humanType(V, lt, tFz, tCur, tDec);
        drawKeys(V, lt, tDec);
        ctx.restore();
      }
      // ---- the rope, driven by the machine
      if (ropeK > 0) drawRope(V, ctx, lt, api, ropeK, tRope, tWho);
    },
    cues(V, api) {
      const t = n => at(api, n), out = [];
      out.push({ t: t('freeze'), type: 'freeze' });
      out.push({ t: t('freeze'), type: 'silence', dur: KIT.stepDur(api, 'freeze') });
      out.push({ t: t('freeze') + 2 * beat.BEAT, type: 'click' });                  // the caret appears
      const t0 = t('cursor') + 0.35;
      KEY_OFS.forEach((o, i) => out.push({ t: t0 + o, type: 'type', dur: 0.09, i }));
      out.push({ t: t('decide'), type: 'click', key: 0 });
      out.push({ t: t('decide') + beat.BEAT / 2, type: 'click', key: 1 });
      out.push({ t: t('rope') + 0.25, type: 'ticks', dur: 0.5, n: 16, p0: 0.35, p1: 0.85 });
      out.push({ t: t('rope') + 2 * beat.BEAT, type: 'click', jump: 1 });
      out.push({ t: t('rope') + 4 * beat.BEAT, type: 'click', jump: 2 });
      out.push({ t: t('who'), type: 'swell', dur: 3 });
      out.push({ t: t('who') + 4 * beat.BEAT, type: 'resolve' });
      return out;
    },
  });

  // the caret and the slowly typed question, then the line under it
  function humanType(V, lt, tFz, tCur, tDec) {
    const q = [...V.lines.q], size = 92, fo = { size, family: F.serif, weight: 600 };
    const ws = q.map(c => measure(c, fo) + 4), y = 880;
    const t0 = tCur + 0.35;
    let shown = 0; for (let i = 0; i < q.length; i++) if (lt >= t0 + KEY_OFS[i]) shown = i + 1;
    const tw = ws.slice(0, shown).reduce((a, b) => a + b, 0);
    let x = W / 2 - tw / 2;                                     // a centred field: the line re-centres as it grows
    for (let i = 0; i < shown; i++) {
      const dt = lt - (t0 + KEY_OFS[i]), f = Math.exp(-dt * 10);
      text(q[i], x + ws[i] / 2, y + f * 4, { ...fo, color: WARM, align: 'center' });
      if (f > 0.02) text(q[i], x + ws[i] / 2, y + f * 4, { ...fo, color: '#ffffff', align: 'center', alpha: f * 0.8 });
      x += ws[i];
    }
    // caret: appears on the second beat of the freeze, blinks while idle, solid while typing
    const tC = tFz + 2 * beat.BEAT;
    if (lt >= tC) {
      const lastKey = shown ? t0 + KEY_OFS[shown - 1] : -1e9, typing = lt - lastKey < 0.45 && shown < q.length + 1;
      const blink = ((lt - tC) % 1.06) < 0.58 ? 1 : 0;
      const ca = (typing ? 1 : blink) * (1 - ease.in(prog(lt, tDec + 0.2, tDec + 0.8)));
      if (ca > 0) {
        const cx = W / 2 + tw / 2 + 8, a0 = K.ctx.globalAlpha;
        K.ctx.globalAlpha = a0 * ca;
        L.light(cx, y - size * 0.35, 90, 'rgba(255,225,180,0.16)', 1);
        K.ctx.fillStyle = WARM; K.ctx.fillRect(cx, y - size * 0.86, 6, size * 1.0);
        K.ctx.globalAlpha = a0;
      }
    }
    // the line under it, once the question is in
    const tOwn = t0 + KEY_OFS[q.length - 1] + 0.45;
    KIT.type(V.lines.own, W / 2, 1010, { size: 58, family: F.serif, weight: 600, mode: 'rise', k: prog(lt, tOwn, tOwn + 1.0), color: WARM2, spacing: 4 });
  }

  // two physical keycaps: 做 / 不做
  function drawKeys(V, lt, tDec) {
    const keys = V.lines.keys, y = 1250, kw = [230, 300], gap = 56, total = kw[0] + kw[1] + gap;
    let x = W / 2 - total / 2;
    keys.forEach((label, i) => {
      const tk = tDec + i * beat.BEAT / 2, k = prog(lt, tk, tk + 0.32);
      if (k > 0) {
        const e = ease.outBack(k), press = Math.exp(-Math.max(0, lt - tk - 0.3) * 14) * (lt > tk + 0.3 ? 1 : 0);
        keycap(x + kw[i] / 2, y - (1 - e) * 60, kw[i], 200, label, clamp(k * 2.5), press);
      }
      x += kw[i] + gap;
    });
    const rows = splitAt(V.lines.decide, '，'), td = tDec + beat.BEAT;
    rows.forEach((r, i) => KIT.type(r, W / 2, 1500 + i * 92, { size: 60, family: F.serif, weight: 600, mode: 'rise', k: prog(lt, td + i * 0.9, td + i * 0.9 + 1.0), color: WARM, spacing: 3 }));
  }
  function keycap(cx, cy, w, h, label, a, press) {
    const c = K.ctx; c.save(); c.globalAlpha *= a;
    const x = cx - w / 2, y = cy - h / 2 + press * 6;
    // warm light pooling under the key
    L.light(cx, cy + h * 0.55, w * 0.75, 'rgba(255,200,140,0.10)', 1);
    // skirt
    let g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#3b352e'); g.addColorStop(1, '#16130f');
    c.fillStyle = g; c.beginPath(); c.roundRect(x, y, w, h, 26); c.fill();
    c.strokeStyle = 'rgba(255,226,190,0.16)'; c.lineWidth = 1.5; c.stroke();
    // top face (dished): inset, lifted
    const ix = x + 16, iy = y + 10 + press * 3, iw = w - 32, ih = h - 42;
    g = c.createLinearGradient(0, iy, 0, iy + ih);
    g.addColorStop(0, '#4a433a'); g.addColorStop(0.5, '#3a342d'); g.addColorStop(1, '#2f2a24');
    c.fillStyle = g; c.beginPath(); c.roundRect(ix, iy, iw, ih, 18); c.fill();
    c.strokeStyle = 'rgba(255,236,210,0.28)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(ix + 18, iy + 1); c.lineTo(ix + iw - 18, iy + 1); c.stroke();
    text(label, cx, iy + ih / 2 + 30, { size: 84, family: F.serif, weight: 600, color: WARM, align: 'center', spacing: 4 });
    c.restore();
  }

  // ---------------------------------------------------------------- the rope (e3's design, now measured by the machine)
  const ROPE = { y: 1000, xL: 228, xR: 852, sag: 16, figY: 1052, figL: 140, figR: 940 };
  const ODDS = [[1, 9], [5, 9], [10, 27]], MULS = ['×5', '×⅔'];
  const knotFrac = ([a, b]) => b / (a + b);                         // the stronger team pulls the knot toward itself
  const ropeY = u => ROPE.y + ROPE.sag * (1 - (2 * u - 1) * (2 * u - 1));
  function drawRope(V, ctx, lt, api, rk, tRope, tWho) {
    const B = beat.BEAT, tJ = [tRope + 2 * B, tRope + 4 * B];
    const span = ROPE.xR - ROPE.xL;
    // knot: snaps between exact positions (fast ease + a tiny mechanical overshoot)
    let idx = 0; for (const t of tJ) if (lt >= t) idx++;
    let kf = knotFrac(ODDS[idx]);
    if (idx > 0) {
      const d = lt - tJ[idx - 1], p0 = knotFrac(ODDS[idx - 1]);
      const e = d < 0.12 ? ease.out(d / 0.12) : 1 + Math.exp(-(d - 0.12) * 18) * Math.sin((d - 0.12) * 60) * 0.03;
      kf = lerp(p0, kf, e);
    }
    const kx = ROPE.xL + kf * span;
    const mach = ease.out(prog(lt, tRope + 0.15, tRope + 0.6)) * (1 - ease.inOut(prog(lt, tWho, tWho + 1.4)));   // machine overlay
    const warm = ease.inOut(prog(lt, tWho + 0.2, tWho + 2.6));                                                    // human light
    // twang after each jump
    const tw = u => { let s = 0; for (const t of tJ) { const d = lt - t; if (d > 0 && d < 1.2) s += 7 * Math.exp(-d * 5) * Math.sin(d * 46) * Math.sin(Math.PI * u); } return s; };
    // warm light on the teams first (canvas, under the particles)
    if (warm > 0) {
      L.light(ROPE.figL, ROPE.figY - 50, 260, 'rgba(255,190,120,0.30)', warm * rk);
      L.light(ROPE.figR, ROPE.figY - 50, 260, 'rgba(255,190,120,0.30)', warm * rk);
    }
    PX.begin();
    // rope: three twisted strands of gold-white light; the twist slides with the knot (rope running through hands)
    const n = 15000, b = bufg(7, n), b2 = bufg(8, n);
    const x0 = ROPE.xL - 50, x1 = ROPE.xR + 50, len = x1 - x0, slide = kx * 0.12;
    let m2 = 0;
    for (let i = 0; i < n; i++) {
      const u = PX.rand(i, 61), st = (i % 3) * 2.094, x = x0 + u * len;
      const ph = x * 0.11 + st - slide, sn = Math.sin(ph);
      const uu = (x - ROPE.xL) / span;
      b.X[i] = x + (PX.rand(i, 62) - 0.5) * 1.2;
      b.Y[i] = ropeY(clamp(uu)) + sn * 3.4 + (PX.rand(i, 63) - 0.5) * 1.6 + tw(clamp(uu));
      b.A[i] = 0.45 + 0.55 * Math.max(0, Math.cos(ph));
      if (warm > 0) {                                           // the ends of the rope, held by people, lit warm
        const end = Math.max(1 - uu / 0.35, (uu - 0.65) / 0.35);
        if (end > 0) { b2.X[m2] = b.X[i]; b2.Y[m2] = b.Y[i]; b2.A[m2] = b.A[i] * end * end * warm; m2++; }
      }
    }
    PX.points(b.X, b.Y, n, [1, 0.93, 0.8], { a: 0.42 * rk, A: b.A, glow: 0.35 });
    if (m2) PX.points(b2.X, b2.Y, m2, [1, 0.72, 0.42], { a: 0.55 * rk, A: b2.A, glow: 0.6 });
    // the knot
    const kd = PX.disc(1400, 0, 0, 15), kb = bufg(9, kd.n), ky = ropeY(kf) + tw(kf);
    for (let i = 0; i < kd.n; i++) { kb.X[i] = kx + kd.X[i]; kb.Y[i] = ky + kd.Y[i]; kb.A[i] = 1 - Math.hypot(kd.X[i], kd.Y[i]) / 17; }
    PX.points(kb.X, kb.Y, kd.n, [1, 0.97, 0.9], { a: 0.75 * rk, A: kb.A, glow: 0.9 });
    // the two teams: 人 as particle clouds, leaning back; gold left, steel right; lit warm by the human at 'who'
    const fig = PX.text('人', { size: 120, family: F.serif, weight: 900, x: 0, y: 0, step: 1.7, seed: 77 });
    [[ROPE.figL, -1, COL.gold], [ROPE.figR, 1, COL.cool]].forEach(([fx, side, col], t) => {
      const fb = bufg(10 + t, fig.n), lean = 0.32;
      // leaning back away from the rope: the top of the glyph is pulled outward
      for (let i = 0; i < fig.n; i++) { fb.X[i] = fx + fig.X[i] - fig.Y[i] * lean * side; fb.Y[i] = ROPE.figY + fig.Y[i]; }
      const c = [lerp(col[0], 1, warm * 0.9), lerp(col[1], 0.8, warm * 0.9), lerp(col[2], 0.55, warm * 0.9)];
      PX.points(fb.X, fb.Y, fig.n, c, { a: (0.36 + 0.3 * warm) * rk * (1 - 0.35 * mach * (1 - warm)), glow: 0.4 + 0.4 * warm });
    });
    // the machine: cyan micro-ticks on the rope, a scan pulse running to the knot after each jump
    if (mach > 0) {
      const nt = 64, tb = bufg(12, nt * 40);
      let m3 = 0;
      for (let k = 0; k <= nt; k++) {
        const u = k / nt, x = ROPE.xL + u * span, on = clamp((lt - tRope - 0.25 - u * 0.45) / 0.05);
        if (on <= 0) continue;
        let sc = 0; for (const t of tJ) { const d = lt - t - Math.abs(u - kf) * 0.35; if (d > 0) sc += Math.exp(-d * 9); }
        const hgt = k % 10 === 0 ? 30 : k % 5 === 0 ? 18 : 9;
        for (let q = 0; q < 24; q++) { tb.X[m3] = x; tb.Y[m3] = ROPE.y + 52 + (q / 23) * hgt; tb.A[m3] = on * (0.5 + 1.6 * sc); m3++; }
      }
      PX.points(tb.X, tb.Y, m3, COL.cyan, { a: 0.55 * mach * rk, A: tb.A, glow: 0.5 });
    }
    PX.flush({ exposure: 1.5, glow: 1.0, glowR: 4 });
    // machine overlay in canvas: hairline from the knot to the ruler, crosshair brackets, readouts
    if (mach > 0) {
      const c = K.ctx, ky2 = ropeY(kf);
      c.save(); c.globalAlpha *= mach * rk;
      c.strokeStyle = C.cyan; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(ROPE.xL, ROPE.y + 52); c.lineTo(ROPE.xR, ROPE.y + 52); c.stroke();
      c.globalAlpha *= 0.85; c.beginPath(); c.moveTo(kx, ky2 + 24); c.lineTo(kx, ROPE.y + 96); c.stroke();
      const s = 26; c.lineWidth = 2;                             // crosshair brackets around the knot
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.moveTo(kx + dx * s, ky2 + dy * (s - 10)); c.lineTo(kx + dx * s, ky2 + dy * s); c.lineTo(kx + dx * (s - 10), ky2 + dy * s); c.stroke(); }
      c.restore();
      const [oa, ob] = ODDS[idx], p = oa / (oa + ob);
      const rA = mach * rk * clamp((lt - tRope - 0.4) / 0.2);
      text(`${oa} : ${ob}`, kx, 880, { size: 54, family: F.mono, weight: 700, color: C.cyan, align: 'center', alpha: rA });
      text(`${(p * 100).toFixed(1)}%`, kx, ROPE.y + 140, { size: 30, family: F.mono, weight: 400, color: C.cyan, align: 'center', alpha: rA * 0.85 });
      // the multiplier flashes as the knot jumps
      tJ.forEach((t, i) => {
        const d = lt - t; if (d < 0 || d > 1.3) return;
        const e = ease.out(clamp(d / 0.25)), fa = (1 - ease.in(clamp((d - 0.5) / 0.8))) * mach * rk;
        text(MULS[i], kx, 790 - e * 30, { size: 64, family: F.mono, weight: 700, color: '#e9fffb', align: 'center', alpha: fa * e, glow: 18, glowColor: C.cyan });
      });
    }
    // after the machine leaves: the knot keeps its place, quietly
    if (warm > 0) {
      const [oa, ob] = ODDS[idx];
      text(`${oa} : ${ob}`, kx, 880, { size: 54, family: F.mono, weight: 700, color: 'rgba(239,233,220,0.5)', align: 'center', alpha: warm * rk * 0.6 });
    }
    // text: the machine's line above, the human's line below
    const ropeOut = ease.inOut(prog(lt, tWho, tWho + 0.8));
    KIT.type(V.lines.rope, W / 2, 620, { size: 58, family: F.serif, weight: 600, mode: 'rise', k: prog(lt, tRope + 0.6, tRope + 1.8), color: C.ink, alpha: rk * (1 - 0.55 * ropeOut), spacing: 3 });
    const rows = splitAt(V.lines.who, '，');
    const whoRows = rows.length > 1 ? [rows[0], rows.slice(1).join('')] : rows;
    whoRows.forEach((r, i) => KIT.type(r, W / 2, 1360 + i * 96, { size: 64, family: F.serif, weight: 600, mode: 'rise', k: prog(lt, tWho + 0.3 + i * 1.3, tWho + 1.5 + i * 1.3), color: WARM, alpha: rk, spacing: 3 }));
  }
})();
