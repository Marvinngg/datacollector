/* v3: episodes 5–6 (repeated games, changing the game), rewritten in the v3 look.
 * Overrides: shops, rounds, sim_tournament, tournament, sim_auction.
 * No panels, no cards, no boxes: glyphs are the material, light carries emphasis, motion is slow.
 * Rhythm is anchored on api.steps first, then api.beat.lines.length and api.dur (never on a fixed line index).
 * Simulations (tournament, auction) are the same deterministic computations as sims2.js, cached per parameter set. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease } = K;
  const INK = '#efe9dc', DIM = 'rgba(239,233,220,0.45)', GOLD = '#e9c47a', TEAL = '#7fd8cb', EMBER = '#ff9f5a', OK = '#9fe0a0', RED = '#e0705f';
  const RGB = { ink: '239,233,220', gold: '233,196,122', teal: '127,216,203', ember: '255,159,90', ok: '159,224,160', red: '224,112,95' };
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers
  // The runtime sets ctx.globalAlpha to the beat's fade envelope before draw(); L.glyph / L.light overwrite
  // globalAlpha, so every draw call here multiplies by ENV explicitly.
  let ENV = 1;
  const G = (ch, x, y, size, col, a, o = {}) => L.glyph(ch, x, y, size, col, a * ENV, o);
  const Sf = (str, x, y, o = {}) => L.serif(str, x, y, { ...o, alpha: (o.alpha == null ? 1 : o.alpha) * ENV });
  const Lt = (x, y, r, col, a = 1) => L.light(x, y, r, col, a * ENV);
  const hud = (items, a = 1) => { ctx.globalAlpha = ENV; L.hud(items, { alpha: a }); ctx.globalAlpha = ENV; };
  const fin = (lt, a, d = 0.8) => isFinite(a) ? ease.out(prog(lt, a, a + d)) : 0;
  const fio = (lt, a, b, d = 0.6) => isFinite(b) ? Math.min(fin(lt, a, d), 1 - ease.in(prog(lt, b - d, b))) : fin(lt, a, d);
  const even = v => Math.max(2, Math.round(v / 2) * 2);
  const bl = v => (v < 0.6 ? 0 : Math.round(v));               // integer blur, 0 when negligible
  function cue(list, t, type, extra) { if (t != null && isFinite(t)) list.push({ t: +t.toFixed(3), type, ...(extra || {}) }); }
  const stepT = (api, name, fb) => { const s = api.steps.find(x => x.show === name); return s ? s.lt : fb; };
  const stepS = (api, name) => api.steps.find(x => x.show === name) || null;
  const lineStarts = api => api.beat.lines.map((_, k) => api.line(k).start);
  // a thin line of light, transparent at both ends ('both') or bright at the end ('head')
  function beam(x1, y1, x2, y2, rgb, a, w = 1.5, mode = 'both') {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalAlpha = a * ENV;
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    if (mode === 'head') { g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.7, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},1)`); }
    else { g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`); }
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  // crossfade one glyph between two colours
  function G2(ch, x, y, size, c0, c1, k, a, o = {}) {
    if (k < 1) G(ch, x, y, size, c0, a * (1 - k), o);
    if (k > 0) G(ch, x, y, size, c1, a * k, o);
  }
  const memo = {};
  const cached = (key, make) => memo[key] || (memo[key] = make());

  // ================================================================= shops: one-shot vs repeated game
  // A lone '店' in a tourist spot, visited once; then the camera drifts to a street of identical '店'
  // receding into depth, the same customer walking from one to the next.
  T.register('shops', {
    timing(V, api) {
      const tO = stepT(api, 'oneshot', api.dur * 0.2), tR = stepT(api, 'repeated', api.dur * 0.58), hop = 0.6, tMap = tR + 1.8;
      return { hop, tO, tTags: tO + 0.9, tOnce: tO + 2.0, tOLab: tO + 3.2, tR, tSame: tR + 0.9, tMap, tRLab: tR + 2.0, tFame: tMap + 0.3 + hop * 6 + 0.5 };
    },
    draw(ctx, V, lt, api) {
      ENV = ctx.globalAlpha;
      const tm = this.timing(V, api), O = V.oneshot || {}, R = V.repeated || {};
      L.field(lt, { n: 80, chars: '店', seed: 51, alpha: 0.07 * ENV, color: '#d9c9a8' });
      const pan = ease.inOut(prog(lt, tm.tR, tm.tR + 2.0)), shift = 600 * pan;
      const drift = 6 * Math.sin(lt * 0.12);                      // the whole scene breathes a little
      // ---------------- the lone shop
      const lx = W / 2 - shift + drift, ly = 450;
      const la = fin(lt, tm.tO, 1.4), back = 1 - 0.5 * pan;
      if (la > 0) {
        Lt(lx, ly + 20, 300, 'rgba(224,112,95,0.10)', la * back);
        const visit = fio(lt, tm.tOnce - 0.2, tm.tOnce + 1.6, 0.6);
        Lt(lx, ly, 170, 'rgba(233,196,122,0.22)', visit * back);
        G('店', lx, ly, 160, INK, la * back, { blur: bl(la < 1 ? (1 - la) * 8 : pan * 2), glow: 10 });
        Sf(O.name || '景区小饭馆', lx, 272, { size: 44, glow: 6, alpha: back, reveal: prog(lt, tm.tO + 0.3, tm.tO + 1.6) });
        (O.tags || ['贵', '难吃']).forEach((s, k) => {
          const a = fin(lt, tm.tTags + k * 0.35, 1.0), side = k % 2 ? 1 : -1;
          const x = lx + side * (150 + 30 * [...s].length), y = ly + (k % 2 ? 40 : -30);
          Sf(s, x, y + (1 - a) * 10, { size: 46, color: RED, glow: 8, alpha: a * back, reveal: a });
        });
        // one tourist: walks in, stays a moment, walks away for good
        const pin = ease.inOut(prog(lt, tm.tO + 0.6, tm.tOnce)), pout = ease.in(prog(lt, tm.tOnce + 1.4, tm.tOnce + 3.8));
        const px = lx - 460 + 330 * pin - 520 * pout, pa = fin(lt, tm.tO + 0.6, 0.8) * (1 - pout) * back;
        G('人', px, ly + 70 + Math.sin(lt * 3.2) * (pin < 1 || pout > 0 ? 2 : 0), 64, GOLD, pa, { glow: 8 });
        const oa = fin(lt, tm.tOnce, 1.0);
        Sf(O.visits || '×1', lx, 620, { size: 60, family: F.mono, color: INK, glow: 6, alpha: oa * back, reveal: oa });
        if (O.visitNote) Sf(O.visitNote, lx, 676, { size: 30, color: DIM, glow: 0, alpha: oa * back, reveal: oa });
        const fa = fin(lt, tm.tOLab, 1.0);
        Sf(O.label || '一次性博弈', lx, 730, { size: 44, color: RED, glow: 10, alpha: fa * (1 - 0.35 * pan), reveal: fa });
      }
      // ---------------- the chain: identical shops receding into depth
      const cities = V.cities || [0, 1, 2, 3, 4, 5, 6], n = cities.length;
      const xo = 600 - shift + drift;                             // slides in with the camera
      const sh = j => {
        const d = j / Math.max(1, n - 1), e = Math.pow(d, 0.8);
        return { x: lerp(820, 1700, e) + xo, y: lerp(480, 382, d), size: even(lerp(128, 46, d)), blur: Math.round(d * 3), a: lerp(1, 0.55, d) };
      };
      const kk = (lt - tm.tMap - 0.3) / tm.hop;                   // hops done
      const onT = j => j === 0 ? tm.tMap : tm.tMap + 0.3 + j * tm.hop;
      for (let j = n - 1; j >= 0; j--) {
        const s = sh(j), ca = fin(lt, tm.tR + 0.4 + j * 0.14, 1.2);
        if (ca <= 0) continue;
        const on = ease.out(prog(lt, onT(j), onT(j) + 0.5));
        Lt(s.x, s.y, s.size * 1.7, 'rgba(159,224,160,0.16)', on * ca);
        G2('店', s.x, s.y, s.size, INK, OK, on * 0.85, ca * s.a, { blur: s.blur || bl((1 - ca) * 6), glow: on > 0 ? 8 : 4 });
      }
      const CX = 1250 + xo;
      const na = fin(lt, tm.tR + 0.5, 1.2);
      Sf(R.name || '连锁快餐', CX, 250, { size: 44, glow: 6, alpha: na, reveal: na });
      const da = fin(lt, tm.tSame, 1.0);
      Sf(R.desc || '价格 · 口味 = 外面', CX, 308, { size: 32, color: DIM, glow: 0, alpha: da, reveal: da });
      // the same customer walks from shop to shop
      const ta = fin(lt, tm.tMap - 0.2, 0.6);
      if (ta > 0) {
        const j = clamp(Math.floor(kk), 0, n - 1), f = clamp(kk - j), jn = Math.min(n - 1, j + 1);
        const a = sh(j), b = sh(jn), e = ease.inOut(f);
        const sz = lerp(a.size, b.size, e), x = lerp(a.x, b.x, e) - sz * 0.62, y = lerp(a.y, b.y, e) + sz * 0.3 - Math.sin(Math.PI * f) * 22 * (kk < n - 1 ? 1 : 0);
        G('人', x, y, even(Math.max(28, sz * 0.5)), GOLD, ta, { glow: 8, blur: Math.round(lerp(a.blur, b.blur, e)) });
        // a faint trail of light behind the customer
        for (let q = 1; q <= Math.min(j + (f > 0 ? 1 : 0), n - 1); q++) {
          const p0 = sh(q - 1), p1 = sh(q), k = q <= j ? 1 : e;
          beam(p0.x - p0.size * 0.62, p0.y + p0.size * 0.3, lerp(p0.x - p0.size * 0.62, p1.x - p1.size * 0.62, k), lerp(p0.y + p0.size * 0.3, p1.y + p1.size * 0.3, k), RGB.gold, 0.35 * ta, 1.2);
        }
        const count = clamp(Math.floor(kk) + 1, 1, n), inf = kk >= n - 0.2;
        if (inf) Sf(R.visits || '×∞', CX, 620, { size: 64, family: F.mono, color: EMBER, glow: 14, alpha: ta });
        else Sf('×' + count, CX, 620, { size: 60, family: F.mono, color: INK, glow: 6, alpha: ta });
        if (R.visitNote) Sf(R.visitNote, CX, 676, { size: 30, color: DIM, glow: 0, alpha: ta });
      }
      const ra = fin(lt, tm.tRLab, 1.0), fb = fin(lt, tm.tFame, 1.0);
      Sf(R.label || '重复博弈', CX, 730, { size: 44, color: OK, glow: 10, alpha: ra, reveal: ra });
      const note = (R.note || '要顾及名声').replace(/^\s*→\s*/, '');
      if (fb > 0) Lt(CX, 800, 220, 'rgba(255,159,90,0.10)', fb);
      Sf(note, CX, 800, { size: 38, color: EMBER, glow: 12, alpha: fb, reveal: fb });
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.tO, 'tick'); cue(out, t.tTags, 'pop'); cue(out, t.tOnce, 'pop');
      cue(out, t.tR, 'tick'); cue(out, t.tMap + 0.3, 'count', { dur: t.hop * 6 }); cue(out, t.tFame, 'chime');
      return out;
    },
  });

  // ================================================================= rounds: backward induction vs KMRW
  // n rounds are n filaments of light across the screen. Backward induction turns them red from the last
  // round to the first; KMRW brings a wave of green back from the start, leaving only the last few red.
  T.register('rounds', {
    timing(V, api) {
      const tB = stepT(api, 'backward', 0.3), tK = stepT(api, 'kmrw', api.dur * 0.4);
      const ni = api.steps.findIndex(s => s.note != null && s.show == null);
      const ls = lineStarts(api), last = ls.length ? ls[ls.length - 1] : null;
      // the closing remark: an explicit note step, else the last screen of text if it comes after KMRW
      const tNote = ni >= 0 ? api.steps[ni].lt : last != null && last > tK + 4 ? last : api.dur * 0.78;
      const cs = tB + 4.0, ce = Math.max(cs + 1.8, tK - 1.0);
      return { wave: 2.6, tB, tLast: tB + 1.6, t2nd: tB + 3.0, cs, ce, tMath: ce + 0.2, tK, tOne: tK + 1.8, tWave: tK + 3.5, tNote, note: ni >= 0 ? api.steps[ni].note : null };
    },
    draw(ctx, V, lt, api) {
      ENV = ctx.globalAlpha;
      const tm = this.timing(V, api), n = V.n || 100, keep = V.endgame || Math.max(2, Math.round(n * 0.05));
      const x0 = 200, x1 = 1720, pitch = (x1 - x0) / (n - 1), ry = 400, rh = 110;
      const X = i => x0 + (i - 1) * pitch;                         // i = 1..n
      const tBack = i => {
        const m = n - i + 1;
        if (m === 1) return tm.tLast; if (m === 2) return tm.t2nd;
        return tm.cs + (tm.ce - tm.cs) * Math.pow((m - 3) / Math.max(1, n - 3), 0.5);
      };
      const tFwd = i => i <= n - keep ? tm.tWave + tm.wave * (i - 1) / Math.max(1, n - keep - 1) : Infinity;
      const noteK = fin(lt, tm.tNote, 1.2);
      L.field(lt, { n: 70, chars: '合叛', seed: 63, alpha: 0.06 * ENV, color: '#d9c9a8' });
      // ---------------- filaments
      const grow = prog(lt, tm.tB, tm.tB + 1.6);
      for (let i = 1; i <= n; i++) {
        const ap = ease.out(clamp(grow * 1.4 - (i - 1) / n * 0.4) ** 1);
        if (ap <= 0) continue;
        const fb = prog(lt, tBack(i), tBack(i) + 0.35), ff = prog(lt, tFwd(i), tFwd(i) + 0.45);
        const red = ff > 0 ? 1 - ff : fb;                           // 0 = cooperate (green) … 1 = defect (red)
        const x = X(i), wob = 4 * Math.sin(lt * 0.6 + i * 0.37), h = rh * (0.82 + 0.18 * Math.sin(i * 1.7));
        const a = ap * (i === 1 ? 1 : 1 - 0.55 * noteK);
        const yb = ry + h / 2 + wob, yr = ry + rh / 2 + 10;          // filament, then its faint reflection below
        if (red < 1) { beam(x, ry - h / 2 + wob, x, yb, RGB.ok, a * (1 - red) * 0.9, 2.4); beam(x, yr + h * 0.55, x, yr, RGB.ok, a * (1 - red) * 0.16, 2.4, 'head'); }
        if (red > 0) { beam(x, ry - h / 2 + wob, x, yb, RGB.red, a * red, 2.4); beam(x, yr + h * 0.55, x, yr, RGB.red, a * red * 0.18, 2.4, 'head'); }
        const flash = Math.max(Math.sin(Math.PI * clamp(fb * 1.0)) * (fb < 1 ? 1 : 0), ff > 0 && ff < 1 ? Math.sin(Math.PI * ff) : 0);
        if (flash > 0.02) Lt(x, ry + wob, 26, ff > 0 ? 'rgba(159,224,160,0.9)' : 'rgba(255,150,120,0.9)', flash * 0.6);
      }
      const la = fin(lt, tm.tB + 0.5, 1.0) * (1 - 0.6 * noteK);
      Sf('1', X(1), ry - rh / 2 - 34, { size: 26, family: F.mono, color: DIM, glow: 0, alpha: la });
      Sf(String(n), X(n), ry - rh / 2 - 34, { size: 26, family: F.mono, color: DIM, glow: 0, alpha: la });
      // ---------------- backward-induction front: a red spark and the round it has reached
      const frontA = fio(lt, tm.tLast - 0.1, tm.tK + 0.8, 0.6);
      if (frontA > 0) {
        let m = 0; for (let i = n; i >= 1; i--) if (lt >= tBack(i)) m++;
        m = Math.max(1, m);
        const r = n - m + 1, fx = X(r);
        Lt(fx, ry, 90, 'rgba(224,112,95,0.35)', frontA);
        beam(Math.min(X(n) + 40, fx + 520), ry - rh / 2 - 18, fx, ry - rh / 2 - 18, RGB.red, frontA * 0.8 * (1 - prog(fx, X(n) - 60, X(n))), 1.5, 'head');
        const lab = `第 ${r} 轮`, w = L.measureSerif(lab, 44);
        Sf(lab, clamp(fx, x0 + w / 2, x1 - w / 2), ry + rh / 2 + 118, { size: 44, color: RED, glow: 10, alpha: frontA });
      }
      // ---------------- the mathematical conclusion, then KMRW
      const toK = fin(lt, tm.tK, 1.0);
      const ma = fin(lt, tm.tMath, 1.2) * (1 - toK);
      if (ma > 0) {
        Sf(V.mathHead || '数学倒推', W / 2, 660, { size: 32, color: DIM, glow: 0, alpha: ma, reveal: ma });
        Sf(V.math || `${n} 轮 全背叛`, W / 2, 750, { size: 68, color: RED, glow: 14, alpha: ma, reveal: ma });
      }
      const ka = fin(lt, tm.tK + 0.2, 1.2) * (1 - 0.6 * noteK);
      const kmrw = (V.kmrw || 'KMRW 1982').replace(/\s+(\d{4})$/, ' · $1');
      Sf(kmrw, W / 2, 640, { size: 30, family: F.mono, color: EMBER, glow: 6, alpha: ka, reveal: ka, spacing: 4 });
      const oa = fin(lt, tm.tOne, 1.4) * (1 - 0.6 * noteK);
      if (oa > 0) {
        const pct = V.pct || '1%', post = V.pctPost || '好人';
        const wp = L.measureSerif(pct, 140, { family: F.mono }), wq = L.measureSerif(post, 44), gap = 28, x = W / 2 - (wp + gap + wq) / 2;
        Lt(x + wp / 2, 760, 200, 'rgba(159,224,160,0.16)', oa);
        Sf(pct, x, 760, { size: 140, family: F.mono, color: OK, glow: 18, alpha: oa, reveal: oa, align: 'left', spacing: 0 });
        Sf(post, x + wp + gap, 782, { size: 44, color: INK, glow: 6, alpha: oa, reveal: prog(lt, tm.tOne + 0.4, tm.tOne + 1.6), align: 'left' });
      }
      // ---------------- after the wave: how many rounds cooperate, how many defect
      const brA = fin(lt, tm.tWave + tm.wave + 0.2, 1.0) * (1 - 0.5 * noteK);
      if (brA > 0) {
        const y = ry - rh / 2 - 36, xa = X(1), xb = X(n - keep) + pitch * 0.4, xc = X(n - keep + 1) - pitch * 0.4, xd = X(n);
        beam(xa - 20, y + 12, xb + 20, y + 12, RGB.ok, brA * 0.7, 1.2);
        beam(xc - 20, y + 12, xd + 20, y + 12, RGB.red, brA * 0.7, 1.2);
        Sf(V.mostLabel || `合作 ${n - keep} 轮`, (xa + xb) / 2, y - 26, { size: 40, color: OK, glow: 10, alpha: brA, reveal: brA });
        Sf(V.endLabel || `背叛 ${keep}`, xd, y - 26, { size: 30, color: RED, glow: 6, alpha: brA, reveal: brA, align: 'right' });
      }
      // ---------------- the closing remark: the very first round is where it starts
      if (noteK > 0) {
        Lt(X(1), ry, 150, 'rgba(233,196,122,0.30)', noteK);
        beam(X(1), ry - rh / 2 - 10, X(1), ry + rh / 2 + 10, RGB.gold, noteK, 3);
        Sf(tm.note || V.noteLabel || '第一轮，先合作', X(1) - 10, ry + rh / 2 + 118, { size: 44, color: GOLD, glow: 12, alpha: noteK, reveal: noteK, align: 'left' });
      }
      ctx.globalAlpha = ENV;
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.tB, 'tick'); cue(out, t.tLast, 'pop'); cue(out, t.t2nd, 'pop');
      cue(out, t.cs, 'count', { dur: +(t.ce - t.cs).toFixed(2) }); cue(out, t.tMath, 'thud');
      cue(out, t.tK + 0.2, 'tick'); cue(out, t.tOne, 'pop'); cue(out, t.tWave, 'whoosh', { dur: t.wave }); cue(out, t.tNote, 'chime');
      return out;
    },
  });

  // ================================================================= sim_tournament (real round robin)
  // Strategies: move(my history, opponent history, rng) -> true = defect. Same as sims2.js.
  const STRATS = {
    tft:     { name: '以牙还牙', move: (m, o) => o.length ? o[o.length - 1] : false },
    alld:    { name: '永远背叛', move: () => true },
    allc:    { name: '永远合作', move: () => false },
    random:  { name: '随机',     move: (m, o, r) => r() < 0.5 },
    grudger: { name: '记仇者',   move: (m, o) => o.includes(true) },
    stft:    { name: '多疑者',   move: (m, o) => o.length ? o[o.length - 1] : true },
    joss:    { name: '偷袭者',   move: (m, o, r) => (o.length ? o[o.length - 1] : false) || r() < 0.1 },
    pavlov:  { name: '赢留输变', move: (m, o) => m.length ? (m[m.length - 1] === o[o.length - 1] ? false : true) : false },
  };
  const PAY = (me, op) => !me && !op ? 3 : me && !op ? 5 : !me && op ? 0 : 1;
  function tournament(keys, rounds, seed) {
    return cached(`T|${keys}|${rounds}|${seed}`, () => {
      const n = keys.length, R = rounds;
      const cum = keys.map(() => new Float64Array(R + 1));
      const all = [];                                              // every match: [i, j, moves of i, moves of j]
      let k = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const r = K.rng(seed + 101 * (k++)), a = [], b = [];
        const fa = STRATS[keys[i]].move, fb = STRATS[keys[j]].move;
        for (let t = 0; t < R; t++) {
          const x = fa(a, b, r), y = fb(b, a, r);
          a.push(x); b.push(y);
          cum[i][t + 1] += PAY(x, y); cum[j][t + 1] += PAY(y, x);
        }
        all.push({ i, j, a, b });
      }
      for (const c of cum) for (let t = 1; t <= R; t++) c[t] += c[t - 1];
      // leaderboard order per round with a little hysteresis (last round sorted strictly) — as in sims2.js
      const order = [keys.map((_, i) => i)];
      for (let t = 1; t <= R; t++) {
        const o = order[t - 1].slice(), s = i => cum[i][t];
        if (t === R) o.sort((x, y) => s(y) - s(x));
        else for (let pass = 0; pass < n; pass++) {
          let sw = false;
          for (let q = 0; q < n - 1; q++) {
            const u = o[q], v = o[q + 1];
            if (s(v) > s(u) + Math.max(1, 0.008 * s(u))) { o[q] = v; o[q + 1] = u; sw = true; }
          }
          if (!sw) break;
        }
        order.push(o);
      }
      const rankAt = order.map(o => { const rk = new Array(n); o.forEach((idx, pos) => rk[idx] = pos); return rk; });
      const final = keys.map((_, i) => cum[i][R]);
      // matches won / drawn by each strategy (tit for tat never wins a single one)
      const wins = keys.map(() => 0);
      for (const m of all) { let sa = 0, sb = 0; for (let t = 0; t < R; t++) { sa += PAY(m.a[t], m.b[t]); sb += PAY(m.b[t], m.a[t]); } if (sa > sb) wins[m.i]++; else if (sb > sa) wins[m.j]++; }
      return { keys, n, R, cum, order, rankAt, final, winner: order[R][0], max: Math.max(...final), min: Math.min(...final), all, wins };
    });
  }

  T.register('sim_tournament', {
    timing(V, api) {
      const tP = stepT(api, 'play', 0.3), tW = stepT(api, 'winner', api.dur * 0.42);
      const tS = tP + 0.7;
      const tE = Math.max(tW + 0.5, tS + clamp(api.dur - tS - 7, 3.2, 12));
      return { tP, tW, tS, tE, tH: tE + 0.25, tR1: tE + 0.7, tR2: tE + 1.4, tNote: tE + 2.3 };
    },
    sim(V) {
      const keys = V.strategies || ['alld', 'allc', 'grudger', 'tft', 'random', 'stft'];
      return tournament(keys, V.rounds || 200, V.seed == null ? 7 : V.seed);
    },
    draw(ctx, V, lt, api) {
      ENV = ctx.globalAlpha;
      const tm = this.timing(V, api), S = this.sim(V), R = S.R, n = S.n;
      const nameOf = k => (V.names && V.names[k]) || STRATS[k].name;
      const roundAt = t => R * ease.sine(prog(t, tm.tS, tm.tE));
      const r = roundAt(lt), ri = Math.floor(r), rf = r - ri;
      const score = i => ri >= R ? S.cum[i][R] : lerp(S.cum[i][ri], S.cum[i][ri + 1], rf);
      const winA = ease.inOut(prog(lt, tm.tH, tm.tH + 1.2));           // others dim, the champion lights up
      const big = ease.inOut(prog(lt, tm.tH + 0.9, tm.tH + 2.6));      // the champion comes forward
      const wKey = S.keys[S.winner], BX = 1440;                       // the champion's place, right of the board

      // ---------------- deep layer: every match, round by round, as a rain of glyphs
      const playA = fin(lt, tm.tP, 1.2) * (1 - 0.85 * winA);
      if (playA > 0 && r > 0) {
        const M = S.all.length, cols = 64, colW = 1760 / cols;
        for (let k = 0; k < M; k++) {
          const m = S.all[k], y = 178 + k * (700 / (M - 1)), depth = ((k * 7) % 5) / 4;   // 0 far … 1 near
          const size = even(14 + depth * 10), blur = Math.round(4 - depth * 3), aa = playA * (0.16 + 0.14 * depth);
          for (let c = 0; c < cols; c++) {
            const t = ri - c; if (t < 0) break;
            const x = 1840 - c * colW - rf * colW, fade = 1 - 0.8 * c / cols;
            const d = m.a[t] || m.b[t], both = m.a[t] && m.b[t];
            G(d ? '叛' : '合', x, y, size, both ? RED : d ? EMBER : OK, aa * fade, { blur });
          }
        }
      }

      // ---------------- the board: names in serif, scores as lines of light
      const shiftX = -250 * big, bx = 660 + shiftX, b0 = 720 + shiftX, bw = lerp(900, 520, big), rowH = 96, by = 250;
      const Q = V.resort || 2.0, D = 0.9;
      const rankAtT = t => S.rankAt[Math.min(R, Math.max(0, Math.floor(roundAt(t))))];
      const kq = Math.floor((lt - tm.tS) / Q), sq = tm.tS + kq * Q, endK = Math.ceil((tm.tE - tm.tS) / Q);
      let pos;
      if (lt < tm.tS) pos = rankAtT(lt).slice();
      else {
        const cur = kq >= endK ? S.rankAt[R] : rankAtT(sq + D), prev = kq >= endK + 1 ? S.rankAt[R] : rankAtT(sq - Q + D);
        const f = ease.inOut(prog(lt, sq, sq + D));
        pos = cur.map((c, i) => lerp(prev[i], c, f));
      }
      const barLen = s => bw * s / S.max;
      const boardA = fin(lt, tm.tP, 1.2);
      for (let i = 0; i < n; i++) {
        const y = by + pos[i] * rowH, isW = i === S.winner;
        const ia = fin(lt, tm.tP + 0.15 * pos[i], 1.2);
        const a = boardA * ia * (isW ? 1 - 0.3 * big : 1 - 0.72 * winA);
        if (a <= 0.003) continue;
        const col = isW && winA > 0 ? EMBER : INK;
        if (isW) {
          Sf(nameOf(S.keys[i]), bx, y, { size: 42, color: INK, glow: 6, alpha: a * (1 - winA), align: 'right' });
          Sf(nameOf(S.keys[i]), bx, y, { size: 42, color: EMBER, glow: 14, alpha: a * winA, align: 'right' });
        } else Sf(nameOf(S.keys[i]), bx, y, { size: 42, color: INK, glow: 4, alpha: a, align: 'right' });
        const s = score(i), len = barLen(s);
        if (len > 1) {
          beam(b0, y + 2, b0 + len, y + 2, isW ? RGB.ember : RGB.ink, a * (isW ? 0.25 + 0.75 * winA : 0.55) * (isW ? 1 : 1), isW ? 2 + winA : 1.6, 'head');
          if (isW) beam(b0, y + 2, b0 + len, y + 2, RGB.ink, a * 0.55 * (1 - winA), 1.6, 'head');
          Lt(b0 + len, y + 2, isW ? 30 + 30 * winA : 22, isW && winA > 0 ? 'rgba(255,170,110,0.9)' : 'rgba(239,233,220,0.7)', a * (r > 0 && r < R ? 0.9 : 0.6));
        }
        const num = String(Math.round(s));
        Sf(num, b0 + len + 26, y + 2, { size: 30, family: F.mono, color: isW ? col : INK, glow: isW ? 6 + 8 * winA : 0, alpha: a * (r > 0 ? 1 : 0.4), align: 'left', spacing: 1 });
      }
      // ---------------- HUD
      const leader = S.order[Math.min(R, Math.max(0, Math.round(r)))][0];
      const shown = Math.min(R, Math.ceil(r - 1e-6));
      hud([{ label: '第', value: `${shown} / ${R} 轮` }, { label: '对局', value: `${S.all.length} 场` },
           { label: r >= R ? '冠军' : '领先', value: nameOf(S.keys[leader]), color: r >= R ? EMBER : INK, glow: r >= R }], fin(lt, tm.tP, 1.0));

      // ---------------- the champion: large ember serif, its total, its two rules
      if (big > 0) {
        const name = nameOf(wKey);
        Lt(BX, 420, 460, 'rgba(255,159,90,0.12)', big);
        Sf(name, BX, 300, { size: 100, color: EMBER, glow: 18, reveal: big, spacing: 12 });
        const sa = fin(lt, tm.tH + 2.0, 1.4);
        Sf(String(S.final[S.winner]), BX, 480, { size: 176, family: F.mono, color: EMBER, glow: 24, alpha: sa, reveal: sa, spacing: 4 });
        Sf(V.boardLabel || '总分', BX, 585, { size: 30, color: DIM, glow: 0, alpha: sa, reveal: sa, spacing: 10 });
      }
      const r1 = fin(lt, Math.max(tm.tR1, tm.tH + 2.8), 1.2), r2 = fin(lt, Math.max(tm.tR2, tm.tH + 3.5), 1.2), nA = fin(lt, Math.max(tm.tNote, tm.tH + 4.4), 1.4);
      const rule = (k, str, a, y) => {
        if (a <= 0) return;
        const w = L.measureSerif(str, 42), x = BX - w / 2 + 24;
        Sf(k, x - 34, y - 2, { size: 26, family: F.mono, color: EMBER, glow: 0, alpha: a * 0.8, align: 'right' });
        Sf(str, x, y, { size: 42, glow: 8, alpha: a, reveal: a, align: 'left' });
      };
      rule('01', V.rule1 || '第一次合作', r1, 675);
      rule('02', V.rule2 || '之后照抄对方', r2, 742);
      if (V.note !== '' && wKey === 'tft' && S.wins[S.winner] === 0) Sf(V.note || '单场从没赢过谁，总分却是第一', BX, 822, { size: 30, color: DIM, glow: 0, alpha: nA, reveal: nA });
      ctx.globalAlpha = ENV;
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.tP, 'tick'); cue(out, t.tS, 'count', { dur: +(t.tE - t.tS).toFixed(2) }); cue(out, t.tE, 'tally');
      cue(out, t.tH, 'pop'); cue(out, t.tR1, 'tick'); cue(out, t.tR2, 'tick');
      return out;
    },
  });

  // ================================================================= tournament: tit for tat, then forgive once
  const seq = s => Array.from(s).map(c => c === 'D' || c === 'd' || c === '1');
  T.register('tournament', {
    timing(V, api) {
      const t0 = stepT(api, 'titfortat', 0.3), F0 = stepS(api, 'forgive'), tF = F0 ? F0.lt : api.dur * 0.6;
      const ls = lineStarts(api), last = ls.length ? ls[ls.length - 1] : null;
      // the hotline comes with the last screen of text when that is after the forgiving step
      const tHot = last != null && last > tF + 1 ? last + 0.3 : tF + 2.4;
      return { t0, tF, tMis: Math.min(t0 + 1.2, tF - 0.4), tBetter: tF, tTol: tF + 0.5, tHot, note: F0 && F0.note };
    },
    draw(ctx, V, lt, api) {
      ENV = ctx.globalAlpha;
      const tm = this.timing(V, api);
      const opp = seq(V.opponent || 'CCDCCDDCCC'), n = opp.length;
      const tft = opp.map((_, i) => i === 0 ? false : opp[i - 1]);
      const fgv = opp.map((_, i) => i >= 2 && opp[i - 1] && opp[i - 2]);
      const x0 = 470, x1 = 1700, pitch = (x1 - x0) / (n - 1), yO = 320, yM = 500, gs = 62;
      const X = i => x0 + i * pitch;
      const cL = V.cLabel || '合', dL = V.dLabel || '叛';
      const cch = cL.length === 1 ? cL : '合', dch = dL.length === 1 ? dL : '叛';
      const forgiving = fin(lt, tm.tBetter, 1.0);
      const hotA = fin(lt, tm.tHot, 1.2);
      L.field(lt, { n: 60, chars: cch + dch, seed: 71, alpha: 0.06 * ENV, color: '#d9c9a8' });
      // ---------------- row labels
      const la = fin(lt, tm.t0, 1.0);
      Sf(V.oppLabel || '对手', 300, yO, { size: 42, color: TEAL, glow: 10, alpha: la, reveal: la });
      Sf(V.meLabel || '我', 300, yM, { size: 42, color: GOLD, glow: 10, alpha: la * (1 - forgiving), reveal: la });
      Sf(V.fgLabel || '宽容版', 300, yM, { size: 42, color: OK, glow: 10, alpha: forgiving, reveal: forgiving });
      // round numbers
      const numA = fin(lt, tm.t0 + 0.3, 1.0) * (1 - 0.6 * fin(lt, tm.tMis, 0.6));
      for (let i = 0; i < n; i++) Sf(String(i + 1), X(i), yO - 76, { size: 24, family: F.mono, color: DIM, glow: 0, alpha: numA });
      // ---------------- opponent row
      const oStart = tm.t0 + 0.1;
      for (let i = 0; i < n; i++) {
        const a = fin(lt, oStart + i * 0.06, 1.0), d = opp[i];
        if (a <= 0) continue;
        G(d ? dch : cch, X(i), yO + (1 - a) * 10, gs, d ? RED : OK, a * 0.95, { blur: bl((1 - a) * 6), glow: 8 });
      }
      // ---------------- my row, with the lines of "copy the opponent's last move"
      const changed = []; for (let i = 0; i < n; i++) if (tft[i] !== fgv[i]) changed.push(i);
      const tChange = i => tm.tTol + 0.5 * changed.indexOf(i);
      const tRet = tm.tTol + 0.5 * changed.length + 0.3;
      const tMe = i => tm.t0 + 0.7 + i * 0.06;
      for (let i = 0; i < n; i++) {
        const a = fin(lt, tMe(i), 1.0);
        if (a <= 0) continue;
        if (i > 0) {
          const ap = ease.inOut(prog(lt, tMe(i) - 0.2, tMe(i) + 0.5)), isRet = !!fgv[i], wasD = tft[i];
          const x1a = X(i - 1) + 10, y1a = yO + gs * 0.6, x2a = X(i) - 10, y2a = yM - gs * 0.6;
          const kRed = wasD ? (changed.includes(i) ? 1 - prog(lt, tChange(i), tChange(i) + 0.4) : 1) : 0;
          const aa = ap * lerp(1, isRet ? 1 : 0.45, forgiving);
          beam(x1a, y1a, lerp(x1a, x2a, ap), lerp(y1a, y2a, ap), RGB.ink, aa * 0.35 * (1 - kRed), 1.2);
          beam(x1a, y1a, lerp(x1a, x2a, ap), lerp(y1a, y2a, ap), RGB.red, aa * 0.8 * kRed, 1.5);
          if (isRet && i >= 2) {
            const a2 = fin(lt, tRet, 0.8);
            beam(X(i - 2) + 10, y1a, x2a - 6, y2a, RGB.red, a2 * 0.8, 1.5);
          }
        }
        let d = tft[i], k = 0;
        if (changed.includes(i)) { k = ease.inOut(prog(lt, tChange(i), tChange(i) + 0.6)); }
        const blurK = Math.sin(Math.PI * k);                           // the glyph softens, changes, sharpens
        const o = { blur: bl(Math.max((1 - a) * 6, blurK * 6)), glow: 8 };
        if (k < 1) G(d ? dch : cch, X(i), yM + (1 - a) * 10, gs, d ? RED : OK, a * (1 - k), o);
        if (k > 0) G(fgv[i] ? dch : cch, X(i), yM, gs, fgv[i] ? RED : OK, a * k, o);
      }
      // ---------------- the misunderstanding: one stray defection, lit in ember
      const mis = opp.findIndex((d, i) => d && !opp[i - 1] && !opp[i + 1]);
      if (mis >= 0) {
        const ma = fin(lt, tm.tMis, 1.0) * (1 - 0.4 * hotA);
        Lt(X(mis), yO, 120, 'rgba(255,159,90,0.30)', ma);
        Sf(V.misLabel || '误会', X(mis), yO - 76, { size: 34, color: EMBER, glow: 12, alpha: ma, reveal: ma });
      }
      // forgiven once: green light where tit for tat would have hit back
      changed.forEach(i => {
        const a = fin(lt, tChange(i) + 0.4, 0.9) * (1 - 0.4 * hotA);
        Lt(X(i), yM, 100, 'rgba(159,224,160,0.22)', a);
        Sf(V.tolLabel || '不还手', X(i), yM + 88, { size: 30, color: OK, glow: 6, alpha: a, reveal: a });
      });
      const ret = fgv.findIndex(v => v);
      if (ret >= 0) {
        const a = fin(lt, tRet, 1.0) * (1 - 0.4 * hotA);
        Lt(X(ret), yM, 100, 'rgba(224,112,95,0.20)', a);
        Sf(V.retLabel || '连续两次才还手', X(ret), yM + 138, { size: 30, color: RED, glow: 6, alpha: a, reveal: a });
      }
      // ---------------- the hotline: a direct line of light between the two sides, a pulse running along it
      if ((tm.note || V.hotline) && hotA > 0) {
        const s = tm.note || V.hotline, j = s.indexOf('：'), head = j >= 0 ? s.slice(0, j) : s;
        const hy = 790, xa = W / 2 - 330, xb = W / 2 + 330, e = ease.inOut(prog(lt, tm.tHot, tm.tHot + 1.4));
        G('●', xa, hy, 18, GOLD, hotA, { glow: 10 }); G('●', xb, hy, 18, TEAL, hotA, { glow: 10 });
        beam(xa + 14, hy, lerp(xa + 14, xb - 14, e), hy, RGB.ember, hotA * 0.9, 1.5, 'both');
        beam(xa + 14, hy, lerp(xa + 14, xb - 14, e), hy, RGB.ember, hotA * 0.6, 1.2, 'head');
        for (let q = 0; q < 2; q++) {                                   // a slow signal travelling both ways
          const ph = ((lt - tm.tHot) * 0.35 + q * 0.5) % 1, px = q ? lerp(xb, xa, ph) : lerp(xa, xb, ph);
          Lt(px, hy, 26, 'rgba(255,190,130,0.9)', hotA * e * Math.sin(Math.PI * ph));
        }
        Sf(head, W / 2, hy - 64, { size: 52, color: EMBER, glow: 14, alpha: hotA, reveal: hotA, spacing: 10 });
      }
      ctx.globalAlpha = ENV;
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.t0 + 0.6, 'tick'); cue(out, t.tMis, 'pop'); cue(out, t.tTol, 'click'); cue(out, t.tHot, 'chime');
      return out;
    },
  });

  // ================================================================= sim_auction (clock auction, as sims2.js)
  function auction(nInc, nLic, nBid, rounds, start, final, seed) {
    return cached(`A|${nInc}|${nLic}|${nBid}|${rounds}|${start}|${final}|${seed}`, () => {
      const R = rounds, g = Math.pow(final / start, 1 / R);
      const total = r => start * Math.pow(g, r);
      const rnd = K.rng(seed);
      const nNew = nBid - nInc, winnersNew = Math.max(0, nLic - nInc);
      const bidders = [];
      for (let i = 0; i < nBid; i++) bidders.push({ inc: i < nInc, idx: i < nInc ? i : i - nInc });
      const row1 = Math.min(nNew, nLic), newWinIdx = [];
      for (let k = 0; k < winnersNew; k++) newWinIdx.push(row1 - 1 - k);
      const losers = bidders.filter(b => !b.inc && !newWinIdx.includes(b.idx));
      const us = losers.map(() => 0.06 + 0.9 * rnd()).sort((a, b) => a - b);
      losers.forEach((b, k) => { b.value = start + (final - start) * us[k]; });
      for (const b of bidders) if (b.value == null) b.value = final * (1.05 + 0.3 * rnd());
      for (const b of bidders) {
        b.out = Infinity;
        for (let r = 1; r <= R; r++) if (total(r) > b.value) { b.out = r; break; }
      }
      const owner = [];
      for (let l = 0; l < nLic; l++) owner.push(l < nInc ? bidders.findIndex(b => b.inc && b.idx === l) : bidders.findIndex(b => !b.inc && b.idx === newWinIdx[l - nInc]));
      const roundOf = v => clamp(Math.log(v / start) / Math.log(g), 0, R);
      return { R, total, roundOf, bidders, owner, start, final };
    });
  }

  T.register('sim_auction', {
    timing(V, api) {
      const tO = stepT(api, 'open', 0.3), tB = stepT(api, 'bid', api.dur * 0.5);
      const nNew = (V.bidders || 13) - (V.incumbents || 4);
      const openD = Math.max(3, tB - tO);
      const tLic = tO, tLock = tO + 1.0;
      const t5 = tO + clamp(openD * 0.3, 1.6, 3.5);
      const tN0 = t5 + 0.9;
      const gap = clamp((tB + 0.6 - tN0) / Math.max(1, nNew), 0.3, 0.7), tN1 = tN0 + gap * nNew;
      const tR0 = Math.max(tB + 0.5, tN1 + 0.8);
      const tR1 = Math.max(tR0 + 2.6, Math.min(tR0 + 10, api.dur - 3.2));
      const tLand = tR1 + 0.25;
      return { tO, tB, tLic, tLock, t5, tN0, tN1, gap, tR0, tR1, tLand, tFin: tLand + 1.5 };
    },
    draw(ctx, V, lt, api) {
      ENV = ctx.globalAlpha;
      const tm = this.timing(V, api);
      const nInc = V.incumbents || 4, nLic = V.licenses || 5, nBid = V.bidders || 13, nNew = nBid - nInc;
      const fm = /^(\D*?)\s*([\d.]+)\s*(.*)$/.exec(V.final || '约 225 亿英镑') || ['', '约', '225', '亿英镑'];
      const fPre = fm[1], fNum = +fm[2], fUnit = fm[3] || '';
      const S = auction(nInc, nLic, nBid, V.rounds || 150, V.start || 5, fNum, V.seed == null ? 11 : V.seed);
      const R = S.R;
      const valAt = t => lerp(S.start, S.final, ease.sine(prog(t, tm.tR0, tm.tR1)));
      const r = S.roundOf(valAt(lt));
      const licCh = V.licGlyph || '牌', incCh = (V.incName || '老')[0], newCh = (V.newName || '新')[0];
      L.field(lt, { n: 70, chars: licCh + newCh, seed: 81, alpha: 0.06 * ENV, color: '#c8bfe0' });

      // ---------------- geometry (left arena)
      const acx = 600, sp = Math.min(160, 760 / Math.max(1, nLic - 1));
      const slotX = l => acx + (l - (nLic - 1) / 2) * sp;
      const licY = 250, incY = 440, rowY = [630, 750];
      const row1 = Math.min(nNew, nLic), row2 = nNew - row1;
      const newPos = k => k < row1 ? { x: slotX(k), y: rowY[0] } : { x: acx + (k - row1 - (row2 - 1) / 2) * sp, y: rowY[1] };
      const posOf = b => b.inc ? { x: slotX(b.idx), y: incY } : newPos(b.idx);
      const tEnter = b => b.inc ? tm.tLic + 0.25 + 0.15 * b.idx : tm.tN0 + tm.gap * b.idx;
      const tOut = b => {
        if (!isFinite(b.out)) return Infinity;
        const u = (S.total(b.out) - S.start) / (S.final - S.start), k = Math.acos(1 - 2 * clamp(u)) / Math.PI;
        return tm.tR0 + (tm.tR1 - tm.tR0) * k;
      };
      const active = S.bidders.filter(b => lt >= tEnter(b) && lt < tOut(b)).length;
      const bidding = lt >= tm.tR0;
      const finA = fin(lt, tm.tFin, 1.4);                           // the result: everything else steps back

      // ---------------- the locked market: each incumbent tied to its own licence by a line of light
      const lockA = fio(lt, tm.tLock, tm.tR0 + 0.3, 0.8);
      for (let l = 0; l < nInc; l++) {
        const x = slotX(l), k = ease.inOut(prog(lt, tm.tLock + 0.1 * l, tm.tLock + 0.1 * l + 0.9));
        const top = lerp(incY - 40, licY + 46, k), mid = (licY + incY) / 2;
        beam(x, incY - 40, x, Math.max(top, mid + 24), RGB.teal, lockA * 0.8, 1.5);
        if (top < mid - 24) beam(x, mid - 24, x, top, RGB.teal, lockA * 0.8, 1.5);
        G('锁', x, mid, 32, TEAL, lockA * prog(k, 0.4, 0.7) * 0.9, { glow: 6 });
      }
      const lkA = fio(lt, tm.tLock + 0.6, tm.tN0 + 0.4, 0.8);
      Sf(V.lockLabel || '一家一张，谁也不用抢', (slotX(0) + slotX(nInc - 1)) / 2, incY + 78, { size: 30, color: DIM, glow: 0, alpha: lkA, reveal: lkA });

      // ---------------- bids: slow glints from every active bidder toward a licence
      if (bidding && lt < tm.tLand + 0.4) {
        const pa = fin(lt, tm.tR0, 0.6) * (1 - prog(lt, tm.tR1 - 0.2, tm.tLand + 0.3));
        S.bidders.forEach((b, i) => {
          const to = tOut(b); if (lt >= to + 0.6) return;
          const p0 = posOf(b), l = (i * 3 + 1) % nLic, trip = 1.9;
          const ph0 = ((lt - tm.tR0) / trip + (i * 0.37) % 1) % 1;
          const x = lerp(p0.x, slotX(l), ease.inOut(ph0)), y = lerp(p0.y - 34, licY + 40, ease.inOut(ph0));
          const a = pa * Math.sin(Math.PI * ph0) * (lt < to ? 1 : 1 - prog(lt, to, to + 0.6));
          Lt(x, y, 16, 'rgba(255,215,150,0.95)', 0.8 * a);
        });
      }

      // ---------------- licences
      for (let l = 0; l < nLic; l++) {
        const isNew = l >= nInc, tIn = isNew ? tm.t5 : tm.tLic + 0.12 * l;
        const a = fin(lt, tIn, 1.2); if (a <= 0) continue;
        const ob = S.bidders[S.owner[l]], op = posOf(ob);
        const tl = tm.tLand + 0.12 * l, k = ease.inOut(prog(lt, tl, tl + 1.2));
        const x = lerp(slotX(l), op.x, k), y = lerp(licY, op.y - 74, k) + (1 - a) * 12, size = even(lerp(70, 44, k));
        if (isNew) {
          Lt(x, y, 150 * (1 - 0.4 * k), 'rgba(255,159,90,0.30)', a * (0.8 + 0.2 * Math.sin(lt * 1.4)));
          G(licCh, x, y, size, EMBER, a, { glow: 14, blur: bl((1 - a) * 6) });
        } else G(licCh, x, y, size, INK, a * 0.95, { glow: 8, blur: bl((1 - a) * 6) });
        if (isNew) { const na = fin(lt, tIn + 0.4, 1.0) * (1 - fin(lt, tm.tR0, 0.6)); Sf(V.newLabel || '给新来者', slotX(l), licY + 70, { size: 30, color: EMBER, glow: 8, alpha: na, reveal: na }); }
      }
      const tagA = fin(lt, tm.tLic + 0.3, 1.0) * (1 - fin(lt, tm.tR0, 0.8));
      Sf(V.licLabel || '3G 牌照', slotX(0) - 120, licY, { size: 28, color: DIM, glow: 0, alpha: tagA, reveal: tagA, align: 'right' });

      // ---------------- bidders
      S.bidders.forEach((b, i) => {
        const te = tEnter(b), a = fin(lt, te, 1.0); if (a <= 0) return;
        const p = posOf(b), x = p.x - (b.inc ? 0 : 80 * (1 - ease.out(prog(lt, te, te + 1.1)))), y = p.y + (b.inc ? (1 - a) * 12 : 0);
        const col = b.inc ? TEAL : GOLD;
        const to = tOut(b), gone = isFinite(to) ? ease.inOut(prog(lt, to, to + 0.9)) : 0;
        const own = S.owner.indexOf(i), won = own >= 0 ? fin(lt, tm.tLand + 0.12 * own + 1.0, 0.8) : 0;
        if (bidding && gone < 1) Lt(x, y, 70, b.inc ? 'rgba(127,216,203,0.16)' : 'rgba(233,196,122,0.16)', a * (1 - gone) * (1 - finA));
        if (won > 0) Lt(x, y - 30, 120, 'rgba(159,224,160,0.20)', won);
        const alpha = a * (1 - 0.78 * gone) * (won > 0 ? 1 : 1 - 0.4 * finA);
        G(b.inc ? incCh : newCh, x, y + gone * 10, 52, won > 0.5 ? OK : col, alpha, { glow: gone > 0.5 ? 0 : 8, blur: bl(Math.max((1 - a) * 6, gone * 4)) });
      });

      // ---------------- right: first the count of bidders, then the price
      const RX = 1440;
      const cntA = fin(lt, tm.tO + 0.2, 1.0) * (1 - ease.inOut(prog(lt, tm.tR0 - 0.2, tm.tR0 + 0.6)));
      if (cntA > 0) {
        const nNow = nInc + S.bidders.filter(b => !b.inc && lt >= tEnter(b) + 0.3).length;
        Sf(V.countLabel || '竞标者', RX, 270, { size: 32, color: DIM, glow: 0, alpha: cntA, reveal: cntA, spacing: 8 });
        const more = nNow > nInc;
        if (more) Lt(RX, 430, 220, 'rgba(233,196,122,0.10)', cntA);
        Sf(String(nNow), RX, 430, { size: 180, family: F.mono, color: more ? INK : TEAL, glow: 16, alpha: cntA, spacing: 2 });
        const nn = Math.max(0, nNow - nInc);
        Sf(`${(V.incName || '老')}运营商 ${Math.min(nNow, nInc)}`, RX - 24, 580, { size: 30, color: TEAL, glow: 4, alpha: cntA, align: 'right' });
        Sf(`${(V.newName || '新')}来者 ${nn}`, RX + 24, 580, { size: 30, color: GOLD, glow: 4, alpha: cntA * fin(lt, tm.tN0, 0.8), align: 'left' });
      }
      const amtA = fin(lt, tm.tR0 + 0.3, 1.0);
      if (amtA > 0) {
        const v = valAt(lt), done = fin(lt, tm.tR1, 1.0);
        Sf(V.amountLabel || '五张牌照总价', RX, 270, { size: 32, color: DIM, glow: 0, alpha: amtA, reveal: amtA, spacing: 8 });
        const num = lt >= tm.tR1 ? String(fNum) : String(Math.round(v));
        Lt(RX, 440, 300, 'rgba(255,159,90,0.12)', done);
        Sf(num, RX, 440, { size: 190, family: F.mono, color: GOLD, glow: 16, alpha: amtA * (1 - done), spacing: 2 });
        Sf(num, RX, 440, { size: 190, family: F.mono, color: EMBER, glow: 26, alpha: amtA * done, spacing: 2 });
        const wN = L.measureSerif(num, 190, { family: F.mono, spacing: 2 });
        if (fPre) Sf(fPre, RX - wN / 2 - 22, 470, { size: 48, color: EMBER, glow: 8, alpha: done, align: 'right' });
        Sf(fUnit, RX, 580, { size: 40, color: done > 0 ? EMBER : GOLD, glow: 8, alpha: amtA, spacing: 6 });
        // the price rising: a line of light, dropouts as small dim points along it
        const cx0 = 1160, cx1 = 1740, cy0 = 640, cy1 = 850;
        const xOf = q => cx0 + (cx1 - cx0) * q / R, yOf = val => cy1 - (cy1 - cy0) * (val - S.start) / (S.final - S.start);
        const N = 80; let px = cx0, py = cy1;
        ctx.save(); ctx.globalAlpha = ENV * amtA * (1 - 0.5 * finA); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        for (let k = 1; k <= N; k++) {
          const q = r * k / N, x = xOf(q), y = yOf(S.total(q));
          ctx.strokeStyle = `rgba(${RGB.gold},${(0.15 + 0.85 * k / N).toFixed(2)})`;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); px = x; py = y;
        }
        ctx.restore();
        if (r > 0) Lt(px, py, 30, done > 0 ? 'rgba(255,170,110,0.9)' : 'rgba(255,215,150,0.9)', amtA);
        for (const b of S.bidders) {
          if (!isFinite(b.out) || b.out > r) continue;
          G('·', xOf(b.out), yOf(S.total(b.out)), 30, INK, amtA * 0.5 * (1 - 0.5 * finA));
        }
      }
      // ---------------- HUD
      if (bidding) {
        const shown = Math.min(R, Math.ceil(r - 1e-6));
        hud([{ label: '第', value: `${shown} / ${R} 轮` }, { label: '仍在竞价', value: `${active} 家`, color: lt >= tm.tR1 ? OK : INK },
             { label: '牌照', value: `${nLic} 张` }], fin(lt, tm.tR0, 0.8));
      } else {
        hud([{ label: '牌照', value: `${Math.min(nLic, nInc + (lt >= tm.t5 ? 1 : 0))} 张`, color: lt >= tm.t5 ? EMBER : INK },
             { label: '竞标者', value: `${nInc + S.bidders.filter(b => !b.inc && lt >= tEnter(b) + 0.3).length} 家` }], fin(lt, tm.tO, 0.8));
      }
      const wa = fin(lt, tm.tFin + 0.4, 1.2);
      Sf(`${nLic} 家拿到牌照`, acx, 870, { size: 32, color: OK, glow: 8, alpha: wa, reveal: wa });
      ctx.globalAlpha = ENV;
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.tO, 'tick'); cue(out, t.tLock, 'click'); cue(out, t.t5, 'pop');
      cue(out, t.tN0, 'count', { dur: +(t.tN1 - t.tN0).toFixed(2) });
      cue(out, t.tR0, 'count', { dur: +(t.tR1 - t.tR0).toFixed(2) }); cue(out, t.tR1, 'tally');
      cue(out, t.tLand, 'whoosh', { dur: 1.6 }); cue(out, t.tFin, 'chime');
      return out;
    },
  });
})();
