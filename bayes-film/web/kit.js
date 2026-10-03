/* KIT — the shared look and the shared "world" of 《先别急》.
 *   BG(TL, t)      background: near-black, one soft light per chapter (set as window.BG; film.js calls it)
 *   KIT.C          colours (CSS strings);  PX.COL has the same colours as light ([r,g,b] 0..1)
 *   KIT.PROJ       the 1000 projects that run through the whole film (who succeeds, who has a strong founder, ...)
 *   KIT.gridPos    where project i sits in the standard 25 x 40 grid
 *   KIT.type       kinetic type: one line of text with an entrance (rise / blur / scramble / punch / write)
 *   KIT.odo        odometer number: digits roll like a mechanical counter
 *   KIT.beat       beat helpers (the film is cut to the score: 80 BPM, 1 beat = 0.75 s)
 * Every function is a pure function of its arguments (and multiplies into ctx.globalAlpha, the beat's fade). */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });

  // ---------------------------------------------------------------- colours
  const C = {
    bg: '#06070a', ink: '#efe9dc', dim: 'rgba(239,233,220,0.55)', faint: 'rgba(239,233,220,0.22)',
    gold: '#ffcf7a',       // 成功 (success), good news, the real number
    ember: '#ff9a55',      // the gut feeling, heat, urgency
    steel: '#5d6b80',      // 失败 (failure), the many
    cool: '#9fb2d0',       // neutral light, the third world
    violet: '#a993ff',     // 不死不活 / the unlisted world
    red: '#ff6a5a',        // loss, danger
    cyan: '#6fe0d2',       // AI, computation
  };

  // ---------------------------------------------------------------- background
  // chapter id -> soft key light (colour, position). The light cross-fades over 2 s at a chapter change.
  const GRADE = {
    e0: { light: [255, 140, 70], a: 0.10, x: 0.5, y: 0.42 },
    e1: { light: [255, 200, 120], a: 0.07, x: 0.5, y: 0.30 },
    e2: { light: [130, 120, 255], a: 0.09, x: 0.5, y: 0.45 },
    e3: { light: [255, 190, 110], a: 0.08, x: 0.5, y: 0.35 },
    e4: { light: [255, 120, 100], a: 0.07, x: 0.5, y: 0.40 },
    e5: { light: [90, 220, 210], a: 0.08, x: 0.5, y: 0.40 },
    e6: { light: [255, 220, 170], a: 0.08, x: 0.5, y: 0.50 },
  };
  const bgCache = new Map();
  function bgLight(g) {
    const key = g.light.join(',') + g.a + g.x + g.y; let c = bgCache.get(key); if (c) return c;
    c = mk(W / 4, H / 4); const x = c.getContext('2d');
    const r = x.createRadialGradient(c.width * g.x, c.height * g.y, 0, c.width * g.x, c.height * g.y, c.height * 0.75);
    r.addColorStop(0, `rgba(${g.light},${g.a})`); r.addColorStop(0.5, `rgba(${g.light},${g.a * 0.35})`); r.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = r; x.fillRect(0, 0, c.width, c.height); bgCache.set(key, c); return c;
  }
  function BG(TL, t) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const chs = TL.chapters, i = Math.max(0, chs.findIndex(c => t >= c.start && t < c.end));
    const cur = GRADE[chs[i] && chs[i].id] || GRADE.e1, prev = i > 0 ? (GRADE[chs[i - 1].id] || cur) : cur;
    const k = i > 0 ? ease.inOut(prog(t, chs[i].start, chs[i].start + 2)) : 1;
    ctx.save(); ctx.imageSmoothingEnabled = true;
    if (k < 1) { ctx.globalAlpha = 1 - k; ctx.drawImage(bgLight(prev), 0, 0, W, H); }
    ctx.globalAlpha = k; ctx.drawImage(bgLight(cur), 0, 0, W, H); ctx.restore();
  }
  window.BG = BG;

  // ---------------------------------------------------------------- the 1000 projects
  /* 1000 projects of the same kind. 100 succeed (一成). Of the 100 successes, 50 have a strong founder;
     of the 900 failures, 90 do. Of the 50 strong-founder successes, 20 have no product online yet; of the 90
     strong-founder failures, 54 don't. These are the article's numbers: 1:9 -> x5 -> 5:9 (36%) -> x2/3 -> 10:27 (27%).
     PROJ.ok[i] 1 = success; PROJ.founder[i] 1 = strong founder; PROJ.unlaunched[i] 1 = no product yet;
     PROJ.lists: indices of each group. Which grid cell is which is scattered (seeded), so the gold is spread out. */
  const PROJ = (() => {
    const n = 1000, r = rng(1001), idx = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const ok = new Uint8Array(n), founder = new Uint8Array(n), unlaunched = new Uint8Array(n);
    const succ = idx.slice(0, 100), fail = idx.slice(100);
    succ.forEach(i => ok[i] = 1);
    succ.slice(0, 50).forEach(i => founder[i] = 1); fail.slice(0, 90).forEach(i => founder[i] = 1);
    succ.slice(0, 20).forEach(i => unlaunched[i] = 1); fail.slice(0, 54).forEach(i => unlaunched[i] = 1);
    return {
      n, ok, founder, unlaunched,
      succ, fail,                                             // 100 / 900
      succF: succ.slice(0, 50), failF: fail.slice(0, 90),     // strong founder: 50 / 90
      succFU: succ.slice(0, 20), failFU: fail.slice(0, 54),   // ... and not launched: 20 / 54
      rank: (() => { const a = new Float32Array(n); idx.forEach((v, k) => a[v] = k / n); return a; })(),   // a stable random order
    };
  })();
  /** standard layout: 25 columns x 40 rows, pitch 34 px, centred; returns [x, y] of project i */
  const GRID = { cols: 25, rows: 40, pitch: 34, x0: W / 2 - 12 * 34, y0: 300 };
  function gridPos(i) { return [GRID.x0 + (i % GRID.cols) * GRID.pitch, GRID.y0 + Math.floor(i / GRID.cols) * GRID.pitch]; }

  // ---------------------------------------------------------------- kinetic type
  /** one line of text with an entrance. o:
   *    size, family (F.serif), weight (600), color, alpha, align ('center'), spacing
   *    k      entrance progress 0..1 (drive it with prog(lt, start, start + d))
   *    mode   'rise'  (default) chars rise and sharpen in sequence
   *           'blur'  L.serif blur-to-sharp
   *           'punch' whole line slams in from 1.35x scale with a flash
   *           'scramble' chars decode from random glyphs (machine-like)
   *           'type'  typewriter with a caret
   *    out    exit progress 0..1 (fades and drifts up)
   *    glow   glow px (default 0)
   *  returns the line width */
  const SCR = '0123456789%×÷=:ABCDEFGHJKLMNPRSTUVWXYZ赔率概率世界证据似然先验后验';
  function type(str, x, y, o = {}) {
    const size = o.size || 64, fam = o.family || F.serif, wt = o.weight || 600, col = o.color || C.ink, align = o.align || 'center';
    const k = o.k == null ? 1 : o.k, out = o.out || 0, mode = o.mode || 'rise', sp = o.spacing == null ? size * 0.04 : o.spacing;
    const a0 = (o.alpha == null ? 1 : o.alpha) * (1 - ease.in(out)); if (a0 <= 0.002 || k <= 0) return 0;
    const fo = { size, family: fam, weight: wt, color: col, spacing: sp, glow: o.glow || 0, glowColor: o.glowColor };
    const chars = [...str], ws = chars.map(ch => measure(ch, fo) + sp), tw = ws.reduce((a, b) => a + b, 0) - sp;
    let cx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    const dy = -ease.in(out) * size * 0.4;
    if (mode === 'blur') { L.serif(str, x, y + dy, { size, family: fam, weight: wt, color: col, alpha: a0, reveal: k, align, spacing: sp, glow: o.glow || 0 }); return tw; }
    if (mode === 'punch') {
      const s = lerp(1.35, 1, ease.outExpo(k)), a = a0 * clamp(k * 3);
      ctx.save(); ctx.translate(align === 'center' ? x : cx + tw / 2, y + dy); ctx.scale(s, s);
      text(str, 0, 0, { ...fo, align: 'center', alpha: a });
      if (k < 0.35) text(str, 0, 0, { ...fo, align: 'center', color: '#fff', alpha: a * (1 - k / 0.35) * 0.8, glow: 30, glowColor: col });
      ctx.restore(); return tw;
    }
    const n = chars.length;
    chars.forEach((ch, i) => {
      const w = ws[i];
      if (mode === 'type') {
        if (k * n >= i + 1) text(ch, cx, y + dy, { ...fo, alpha: a0 });
      } else if (mode === 'scramble') {
        const p = clamp(k * (n + 4) - i, 0, 4) / 4;
        if (p > 0) {
          const settled = p >= 1, f = Math.floor((o.t || 0) * 24 + i * 7);
          const g = settled ? ch : SCR[(f * 31 + i * 17) % SCR.length];
          text(g, cx + (settled ? 0 : 0), y + dy, { ...fo, color: settled ? col : (o.scrambleColor || C.cyan), alpha: a0 * (settled ? 1 : 0.4 + 0.6 * p), family: settled ? fam : F.mono });
        }
      } else {                                              // rise
        const p = clamp(k * (n + 5) - i, 0, 5) / 5, e = ease.out(p);
        if (p > 0) text(ch, cx, y + dy + (1 - e) * size * 0.35, { ...fo, alpha: a0 * e });
      }
      cx += w;
    });
    if (mode === 'type' && k < 1.2 && o.caret !== false) {
      const shown = ws.slice(0, Math.min(n, Math.floor(k * n))).reduce((a, b) => a + b, 0);
      const x0 = (align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x) + shown;
      if (Math.floor((o.t || 0) * 2.4) % 2 === 0 || k < 1) { ctx.save(); ctx.globalAlpha *= a0; ctx.fillStyle = col; ctx.fillRect(x0 + 4, y + dy - size * 0.82, Math.max(3, size * 0.06), size * 0.95); ctx.restore(); }
    }
    return tw;
  }

  /** odometer: draws value (a number) as rolling digit columns. o: size, family (F.mono), weight, color, decimals (0),
   *  suffix ('%'), align ('center'), alpha, glow. Fractional parts make the last digit roll smoothly between values. */
  function odo(value, x, y, o = {}) {
    const size = o.size || 120, fam = o.family || F.mono, wt = o.weight || 700, col = o.color || C.ink, dec = o.decimals || 0;
    const a0 = o.alpha == null ? 1 : o.alpha; if (a0 <= 0) return;
    const v = Math.max(0, value), whole = Math.floor(v * Math.pow(10, dec)), frac = v * Math.pow(10, dec) - whole;
    const digits = String(whole).padStart(dec + 1, '0').split('');
    const fo = { size, family: fam, weight: wt, color: col, glow: o.glow || 0, glowColor: o.glowColor };
    const dw = measure('0', fo), suf = o.suffix == null ? '%' : o.suffix, sw = suf ? measure(suf, { ...fo, size: size * 0.6 }) + size * 0.08 : 0;
    const dotw = dec ? dw * 0.5 : 0, tw = digits.length * dw + dotw + sw;
    let cx = (o.align || 'center') === 'center' ? x - tw / 2 : o.align === 'right' ? x - tw : x;
    ctx.save(); ctx.globalAlpha *= a0;
    ctx.beginPath(); ctx.rect(cx - 10, y - size * 0.95, tw + 20, size * 1.15); ctx.clip();
    for (let i = 0; i < digits.length; i++) {
      if (dec && i === digits.length - dec) { text('.', cx + dotw * 0.1, y, { ...fo }); cx += dotw; }
      const d = +digits[i];
      // a column rolls only when every column to its right is about to wrap (all 9s), like a real counter
      let roll = 0; const rest = digits.slice(i + 1);
      if (rest.every(c => c === '9')) roll = ease.inOut(frac);
      if (i === digits.length - 1) roll = ease.inOut(frac);
      const yo = roll * size * 1.1;
      text(String(d), cx, y - yo, fo);
      text(String((d + 1) % 10), cx, y - yo + size * 1.1, fo);
      cx += dw;
    }
    ctx.restore();
    if (suf) text(suf, cx + size * 0.06, y, { ...fo, size: size * 0.6, alpha: a0 });
  }

  // ---------------------------------------------------------------- beat helpers
  const BPM = 80, BEAT = 60 / BPM;
  /** pulse(lt): 1 on each beat, decaying (for things that breathe with the music); phase from the film start */
  const beat = { BPM, BEAT, pulse: (t, decay = 6) => Math.exp(-((t % BEAT + BEAT) % BEAT) * decay) };

  // a step's start time by name (or -1e9 if absent) and progress over d seconds
  const at = (api, name) => { const s = api.steps.find(s => s.show === name); return s ? s.lt : 1e9; };
  const stepK = (api, lt, name, d = 0.6, e = ease.out) => { const s = api.steps.find(s => s.show === name); return s ? e(prog(lt, s.lt, s.lt + (d === 'dur' ? s.dur : d))) : 0; };
  const stepDur = (api, name) => { const s = api.steps.find(s => s.show === name); return s ? s.dur : 0; };

  // ---------------------------------------------------------------- beads: the look of one project
  /* Each project is a bead: a small sphere of ~k particles (radius r), so the 1000 projects share the film's particle
     material. beads(X, Y, n, o): X, Y bead centres; o: col [r,g,b] or C (per-bead colours, interleaved 3n),
     A (per-bead intensity 0..1), a (overall, default 1.1), r (radius px, default 9), k (particles per bead, default 48),
     glow (default 0.3), spin (rad, rotates the bead's grain). Call between PX.begin() and PX.flush(). */
  const BEAD = (() => { const m = 64, X = new Float32Array(m), Y = new Float32Array(m), A = new Float32Array(m), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < m; i++) { const rr = Math.sqrt((i + 0.5) / m), an = i * ga; X[i] = Math.cos(an) * rr; Y[i] = Math.sin(an) * rr; A[i] = 1 - 0.55 * rr * rr; }
    return { X, Y, A, m }; })();
  let BX = new Float32Array(0), BY = new Float32Array(0), BA = new Float32Array(0), BC = new Float32Array(0);
  function beads(X, Y, n, o = {}) {
    const k = Math.min(BEAD.m, o.k || 48), r = o.r || 9, total = n * k;
    if (BX.length < total) { BX = new Float32Array(total); BY = new Float32Array(total); BA = new Float32Array(total); BC = new Float32Array(total * 3); }
    const A = o.A, Cc = o.C, col = o.col || PX.COL.white, cs = Math.cos(o.spin || 0), sn = Math.sin(o.spin || 0);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const a = A ? A[i] : 1; if (a <= 0.003) continue;
      const x = X[i], y = Y[i], R = (o.R ? o.R[i] : 1) * r;
      for (let q = 0; q < k; q++, j++) {
        const bx = BEAD.X[q], by = BEAD.Y[q];
        BX[j] = x + (bx * cs - by * sn) * R; BY[j] = y + (bx * sn + by * cs) * R; BA[j] = a * BEAD.A[q];
        if (Cc) { BC[j * 3] = Cc[i * 3]; BC[j * 3 + 1] = Cc[i * 3 + 1]; BC[j * 3 + 2] = Cc[i * 3 + 2]; }
      }
    }
    PX.points(BX, BY, j, col, { a: o.a == null ? 1.1 : o.a, A: BA, C: Cc ? BC : null, glow: o.glow == null ? 0.3 : o.glow });
  }

  window.KIT = { C, GRADE, PROJ, GRID, gridPos, type, odo, beat, at, stepK, stepDur, beads };
})();
