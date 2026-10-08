/* Generic scene templates for book-studio films: title, chapter, line, quote, question, list, contrast, number, end.
 * Every template draws a pure function of the local time lt; the runtime (film.js) cross-fades scenes and owns the
 * particle pass (PX.begin/flush). Text is laid out by TXT.fit: automatic line breaks (CJK by character with kinsoku
 * rules, Latin by word, balanced lines, breaks preferred after punctuation and outside the key), the largest font
 * size that fits the box, never outside the phone-safe area (x 80..1000, y 260..1700).
 * Text is drawn as particles that gather into the glyphs (several entrances: scatter, wide, point, below, line,
 * write), with a crisp layer fading in for legibility; the `key` substring glows in the mood colour.
 * Entrances / layouts vary by V.occ (the scene's occurrence of its type) + V.seed, so a film doesn't repeat itself. */
(function () {
  const { W, H, F, clamp, lerp, prog, ease } = K;
  const TAU = Math.PI * 2;
  const R = (i, k) => PX.rand(i, k);
  const SERIF = F.serif, SANS = F.sans, MONO = F.mono;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(h) });
  const css = c => `rgb(${c.map(v => Math.round(clamp(v) * 255)).join(',')})`;
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const variant = (V, n) => ((V.occ || 0) + (V.seed || 0)) % n;

  // ================================================================ text measuring & fitting
  const mc = mk(8, 8).getContext('2d'), WC = new Map();
  function cw(ch, fam, wt) {                      // advance width of one character at 100 px
    const key = fam + wt + ch; let w = WC.get(key);
    if (w == null) { mc.font = `${wt} 100px ${fam}`; w = mc.measureText(ch).width / 100; WC.set(key, w); }
    return w;
  }
  const NOSTART = new Set([...'，。、：；？！）」』”’》〉…—·%,.!?;:)]}']);
  const NOEND = new Set([...'（「『“‘《〈([{']);
  const BRK = new Set([...'，。、：；？！,.;:!?…—']);
  const STRIP = new Set([...'，。、；：,.;:']);        // dropped at the end of a displayed line
  const LAT = /[A-Za-z0-9]/;
  function tokenize(chars) {
    let toks = [], i = 0;
    while (i < chars.length) {
      const c = chars[i];
      if (LAT.test(c)) {
        let j = i + 1;
        while (j < chars.length && (LAT.test(chars[j]) || (/['’\-.,%]/.test(chars[j]) && LAT.test(chars[j + 1] || '')))) j++;
        if (chars[j] === '%') j++;
        toks.push({ i0: i, i1: j }); i = j;
      } else if (c === ' ' || c === '　') { if (toks.length) toks[toks.length - 1].i1 = i + 1; i++; }
      else { toks.push({ i0: i, i1: i + 1 }); i++; }
    }
    const out = [];
    for (const t of toks) {
      const p = out[out.length - 1];
      if (p && (NOSTART.has(chars[t.i0]) || NOEND.has(chars[p.i1 - 1]))) p.i1 = t.i1; else out.push({ ...t });
    }
    return out;
  }
  /** fit(str, o) -> layout. o: maxW, maxH, max (font px), min, lh (line height, x size), fam, wt, sp (letter spacing,
   *  x size), maxLines, key (substring), keepPunct. The layout: {size, lh, n, w, h, lines: [{chars: [{c, i, x, w, key}],
   *  w, str}]}, x relative to the line start; line j's baseline is at 0.88 size + j lh size below the block top. */
  const LC = new Map();
  function fit(str, o = {}) {
    const fam = o.fam || SERIF, wt = o.wt || 500, sp = o.sp == null ? 0.04 : o.sp, lh = o.lh || 1.45;
    const maxW = o.maxW || 860, maxH = o.maxH || 900, maxL = o.maxLines || 5, key = o.key || '';
    const ck = JSON.stringify([str, fam, wt, sp, lh, maxW, maxH, maxL, o.max, o.min, key, o.keepPunct]);
    let L = LC.get(ck); if (L) return L;
    let s = String(str).trim(); if (!o.keepPunct) s = s.replace(/[。．.]$/, '');
    const chars = [...s], toks = tokenize(chars);
    const keyMask = new Uint8Array(chars.length);
    if (key) { const kc = [...key]; for (let i = 0; i + kc.length <= chars.length; i++) if (kc.every((c, j) => chars[i + j] === c)) kc.forEach((_, j) => keyMask[i + j] = 1); }
    const unit = chars.map(c => cw(c, fam, wt));
    // display line from token a..b (exclusive): strip trailing spaces and soft punctuation
    const lineChars = (a, b, last) => {
      let i0 = toks[a].i0, i1 = toks[b - 1].i1;
      while (i1 > i0 && (chars[i1 - 1] === ' ' || chars[i1 - 1] === '　' || (!o.keepPunct && STRIP.has(chars[i1 - 1]) && (!last || chars[i1 - 1] !== '。' || true)))) i1--;
      return [i0, i1];
    };
    const widthOf = (i0, i1, size) => { let w = 0; for (let i = i0; i < i1; i++) w += (unit[i] + sp) * size; return Math.max(0, w - sp * size); };
    const m = toks.length;
    function solve(size, n) {               // best n-line break (DP); null if impossible
      const total = widthOf(0, chars.length, size), target = total / n;
      const cost = (a, b, last) => {
        const [i0, i1] = lineChars(a, b, last), w = widthOf(i0, i1, size);
        if (w > maxW) return Infinity;
        let c = ((w - target) / target) ** 2 * (last ? 0.6 : 1);
        if (!last && BRK.has(chars[toks[b - 1].i1 - 1] === ' ' ? chars[toks[b - 1].i1 - 2] : chars[toks[b - 1].i1 - 1])) c -= 0.32;
        if (!last && b < m && keyMask[toks[b - 1].i1 - 1] && keyMask[toks[b].i0]) c += 0.4;      // don't split the key
        if (last && b - a === 1 && n > 1) c += 0.6;                                          // no orphan
        return c;
      };
      const f = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity)), bk = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
      f[0][0] = 0;
      for (let l = 1; l <= n; l++) for (let b = l; b <= m; b++) for (let a = l - 1; a < b; a++) {
        if (f[l - 1][a] === Infinity) continue;
        const v = f[l - 1][a] + cost(a, b, l === n && b === m);
        if (v < f[l][b]) { f[l][b] = v; bk[l][b] = a; }
      }
      if (f[n][m] === Infinity) return null;
      const cuts = []; let b = m; for (let l = n; l > 0; l--) { const a = bk[l][b]; cuts.unshift([a, b]); b = a; }
      return cuts;
    }
    const greedy = (size) => {
      let n = 1, a = 0;
      for (let b = 1; b <= m; b++) {
        const [i0, i1] = lineChars(a, b), w = widthOf(i0, i1, size);
        if (w > maxW) { if (b - 1 === a) return 99; n++; a = b - 1; }
      }
      return n;
    };
    const maxS = Math.round((o.max || 80) / 2) * 2, minS = Math.max(16, Math.round((o.min || 36) / 2) * 2);
    let res = null;
    // 1) clause lines: when every clause (split after strong punctuation) fits on its own line at a generous size,
    //    one clause per line reads best ("你没有变差，/是给你打分的人走了")
    const clauses = []; { let a = 0; for (let b = 1; b <= m; b++) if (b === m || BRK.has(chars[toks[b - 1].i1 - 1] === ' ' ? chars[toks[b - 1].i1 - 2] : chars[toks[b - 1].i1 - 1])) { clauses.push([a, b]); a = b; } }
    if (clauses.length > 1 && clauses.length <= maxL) {
      const floor = Math.max(minS, Math.round(maxS * 0.72 / 2) * 2);
      for (let size = maxS; size >= floor; size -= 2) {
        const ok = clauses.every(([a, b], j) => { const [i0, i1] = lineChars(a, b, j === clauses.length - 1); return widthOf(i0, i1, size) <= maxW; });
        if (ok && (clauses.length - 1) * lh * size + size <= maxH) { res = { size, cuts: clauses }; break; }
      }
    }
    for (let size = maxS; !res && size >= 16; size -= 2) {
      let n = greedy(size); if (n >= 99) continue;
      const room = l => (l - 1) * lh * size + size <= maxH;
      if (size >= minS && (n > maxL || !room(n))) continue;
      if (!room(n) && size > 16) continue;
      let cuts = solve(size, n);
      // one more line is allowed if it lets every line end on punctuation and still fits
      if (cuts && n + 1 <= maxL && room(n + 1) && size >= minS) {
        const c2 = solve(size, n + 1);
        const ends = cs => cs.slice(0, -1).every(([, b]) => BRK.has(chars[toks[b - 1].i1 - 1]));
        if (c2 && !ends(cuts) && ends(c2) && n === 1 && chars.length > 12) cuts = c2;
      }
      if (cuts) { res = { size, cuts }; break; }
    }
    if (!res) res = { size: 16, cuts: [[0, m]] };
    const size = res.size, lines = res.cuts.map(([a, b], j) => {
      const [i0, i1] = lineChars(a, b, j === res.cuts.length - 1), cs = []; let x = 0;
      for (let i = i0; i < i1; i++) { const w = unit[i] * size; cs.push({ c: chars[i], i, x, w, key: keyMask[i] }); x += w + sp * size; }
      return { chars: cs, w: Math.max(0, x - sp * size), str: cs.map(c => c.c).join('') };
    });
    L = { size, lh, sp, fam, wt, n: lines.length, lines, w: Math.max(...lines.map(l => l.w)), h: (lines.length - 1) * lh * size + size,
          nch: lines.reduce((a, l) => a + l.chars.length, 0), hasKey: keyMask.some(x => x) };
    let g = 0; for (const l of lines) for (const c of l.chars) c.g = g++;   // reading order index
    LC.set(ck, L); return L;
  }
  const baseY = (L, j) => 0.88 * L.size + j * L.lh * L.size;
  const lineX = (L, j, x, align) => align === 'left' ? x : align === 'right' ? x - L.lines[j].w : x - L.lines[j].w / 2;

  // ================================================================ particle clouds of a layout
  const CC = new Map();
  function cloud(L, seed = 3) {
    const ck = L; let c = CC.get(ck); if (c) return c;
    const xs = [], ys = [], ln = [], gi = [], ky = [];
    L.lines.forEach((l, j) => {
      if (!l.str.trim()) return;
      const p = PX.text(l.str, { size: L.size, family: L.fam, weight: L.wt, x: 0, y: 0, align: 'left', spacing: L.sp * L.size,
                                 step: Math.max(1.25, L.size / 38), seed: seed + j });
      const bounds = l.chars.map(ch => ch.x + ch.w + L.sp * L.size * 0.5);
      for (let i = 0; i < p.n; i++) {
        let k = 0; while (k < bounds.length - 1 && p.X[i] > bounds[k]) k++;
        xs.push(p.X[i]); ys.push(p.Y[i] + baseY(L, j)); ln.push(j); gi.push(l.chars[k].g); ky.push(l.chars[k].key);
      }
    });
    c = { n: xs.length, X: Float32Array.from(xs), Y: Float32Array.from(ys), ln: Uint8Array.from(ln), g: Uint16Array.from(gi), key: Uint8Array.from(ky) };
    CC.set(ck, c); return c;
  }
  const BUF = new Map();
  function buf(n, tag) { const k = n * 8 + tag; let b = BUF.get(k); if (!b) BUF.set(k, b = { X: new Float32Array(n), Y: new Float32Array(n), A: new Float32Array(n), C: new Float32Array(n * 3) }); return b; }

  /* text(L, o): draw a laid-out block.
     o: x (anchor x: centre / left / right edge by align), y (block top), align ('center'),
        k (gather 0..1), mode ('scatter' | 'wide' | 'point' | 'below' | 'line' | 'write'), from ([x, y] for point/line),
        out (dissolve 0..1), t (seconds), mood (MOOD entry), keyK (0..1 key glow), dim (0..1, default 1),
        a (particle intensity, 0.42), crisp (crisp layer max alpha, 0.92), seed, tag, colour (override [r,g,b]),
        keyColour, swirl (px), shown (number of chars visible for 'write' when driven by time) */
  function text(L, o) {
    const k = clamp(o.k == null ? 1 : o.k), out = clamp(o.out || 0); if (k <= 0 || out >= 1) return;
    const cl = cloud(L, o.seed || 3), n = cl.n, b = buf(n, o.tag || 0), mode = o.mode || 'scatter', t = o.t || 0, size = L.size;
    const align = o.align || 'center', x0 = o.x == null ? W / 2 : o.x, y0 = o.y, dim = o.dim == null ? 1 : o.dim;
    const tc = o.colour || o.mood.textL, kc = o.keyColour || o.mood.keyL, keyK = o.keyK || 0;
    const lx = L.lines.map((_, j) => lineX(L, j, x0, align));
    const nch = Math.max(1, L.nch), S = mode === 'write' ? 0.8 : mode === 'wide' ? 0.55 : 0.45, sw = o.swirl == null ? size * 0.5 : o.swirl;
    const fr = o.from || [W / 2, y0 + L.h / 2], sd = (o.seed || 3) * 3;
    for (let i = 0; i < n; i++) {
      const r1 = R(i, sd + 1), r2 = R(i, sd + 2), r3 = R(i, sd + 3), an = r1 * TAU;
      const d = mode === 'write' ? (cl.g[i] / nch) * 0.86 + r2 * 0.14 : r2;
      const kk = ease.inOut(clamp((k - d * S) / (1 - S)));
      const fx = lx[cl.ln[i]] + cl.X[i], fy = y0 + cl.Y[i];
      let sx, sy;
      if (mode === 'wide') { sx = 40 + r3 * (W - 80); sy = 120 + R(i, sd + 4) * (H - 240); }
      else if (mode === 'point') { sx = fr[0] + Math.cos(an) * size * 0.35 * r3; sy = fr[1] + Math.sin(an) * size * 0.35 * r3; }
      else if (mode === 'below') { sx = fx + (r3 - 0.5) * size * 0.8; sy = fy + size * (0.8 + 2.6 * R(i, sd + 4)); }
      else if (mode === 'line') { sx = fx + (r3 - 0.5) * size * 0.5; sy = fr[1] + (R(i, sd + 4) - 0.5) * 6; }
      else if (mode === 'write') { sx = fx + (r3 - 0.5) * size * 0.6; sy = fy + size * (0.2 + 0.6 * R(i, sd + 4)); }
      else { const rr = size * (1.3 + 4.2 * r3); sx = fx + Math.cos(an) * rr; sy = fy + Math.sin(an) * rr; }
      const swi = Math.sin(kk * Math.PI) * sw * (R(i, sd + 5) - 0.5);
      const wob = Math.sin(t * (0.7 + r1) + i) * 0.55;
      let px = lerp(sx, fx, kk) + swi + wob, py = lerp(sy, fy, kk) - swi * 0.4 + wob * 0.6;
      const ko = out > 0 ? ease.in(clamp(out * 1.6 - r3 * 0.6)) : 0;
      if (ko > 0) { px += Math.cos(an) * ko * size * 0.9; py -= ko * size * (0.6 + 1.8 * r2); }
      b.X[i] = px; b.Y[i] = py;
      const kf = cl.key[i] ? keyK : 0;
      b.A[i] = (0.75 + 0.25 * kk) * (1 - ko) * dim * (1 + 0.7 * kf) * Math.min(1, k * 4);
      const c = kf ? mix(tc, kc, kf) : tc;
      b.C[i * 3] = c[0]; b.C[i * 3 + 1] = c[1]; b.C[i * 3 + 2] = c[2];
    }
    PX.points(b.X, b.Y, n, null, { a: (o.a == null ? 0.42 : o.a) * 1.25, A: b.A, C: b.C, glow: 0.4 });
    // crisp layer
    const crisp = (o.crisp == null ? 0.92 : o.crisp) * dim * (1 - ease.in(clamp(out * 1.4)));
    if (crisp <= 0.003) return;
    const ctx = K.ctx; ctx.save(); ctx.font = `${L.wt} ${size}px ${L.fam}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const ga = ctx.globalAlpha, tcs = css(tc);
    L.lines.forEach((l, j) => {
      const by = y0 + baseY(L, j);
      for (const ch of l.chars) {
        if (ch.c === ' ') continue;
        const p = mode === 'write' ? clamp((k - (ch.g / nch) * 0.69 - 0.12) / 0.16) : clamp((k - 0.62) / 0.38);
        const a = ease.inOut(p) * crisp; if (a <= 0.003) continue;
        const kf = ch.key ? keyK : 0;
        ctx.globalAlpha = ga * a;
        if (kf > 0.01) { ctx.shadowColor = css(kc); ctx.shadowBlur = size * 0.32 * kf; ctx.fillStyle = css(mix(tc, kc, kf)); }
        else { ctx.shadowBlur = 0; ctx.fillStyle = tcs; }
        ctx.fillText(ch.c, lx[j] + ch.x, by);
      }
    });
    ctx.restore();
  }
  /** the key's underline: a hairline under the key characters of each line, drawn with progress k */
  function keyLine(L, o, k) {
    if (k <= 0 || !L.hasKey) return;
    const ctx = K.ctx, align = o.align || 'center';
    ctx.save(); ctx.strokeStyle = o.mood.line; ctx.lineWidth = Math.max(1.5, L.size / 40); ctx.lineCap = 'round';
    L.lines.forEach((l, j) => {
      const ks = l.chars.filter(c => c.key); if (!ks.length) return;
      const xa = lineX(L, j, o.x, align) + ks[0].x, xb = lineX(L, j, o.x, align) + ks[ks.length - 1].x + ks[ks.length - 1].w;
      const y = o.y + baseY(L, j) + L.size * 0.24;
      ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(lerp(xa, xb, ease.inOut(k)), y); ctx.stroke();
    });
    ctx.restore();
  }

  // ================================================================ light & line art
  function orb(x, y, r, css3, a) {                      // a soft additive light (gradient, cheap)
    if (a <= 0.003) return;
    const ctx = K.ctx; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${css3},0.55)`); g.addColorStop(0.35, `rgba(${css3},0.16)`); g.addColorStop(1, `rgba(${css3},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore();
  }
  function cone(x, top, y, w, css3, a) {                // somebody else's lamp: a soft cone from above onto y
    if (a <= 0.003) return;
    const ctx = K.ctx, tw = w * 0.14; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a;
    const g = ctx.createLinearGradient(0, top, 0, y);
    g.addColorStop(0, `rgba(${css3},0.13)`); g.addColorStop(0.75, `rgba(${css3},0.05)`); g.addColorStop(1, `rgba(${css3},0.0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - tw, top); ctx.lineTo(x + tw, top); ctx.lineTo(x + w, y); ctx.lineTo(x - w, y); ctx.closePath(); ctx.fill();
    const s = ctx.createRadialGradient(x, top, 0, x, top, 60); s.addColorStop(0, `rgba(${css3},0.5)`); s.addColorStop(1, `rgba(${css3},0)`);
    ctx.fillStyle = s; ctx.fillRect(x - 60, top - 60, 120, 120);
    ctx.restore();
  }
  function hair(x0, y0, x1, y1, k, col, lw = 1.2, a = 1) {
    if (k <= 0 || a <= 0) return; const ctx = K.ctx;
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(lerp(x0, x1, k), lerp(y0, y1, k)); ctx.stroke(); ctx.restore();
  }
  function hairC(x, y, len, k, col, lw = 1.2, a = 1) { hair(x, y, x - len / 2, y, k, col, lw, a); hair(x, y, x + len / 2, y, k, col, lw, a); }
  function arc(x, y, r, a0, k, col, lw = 1.2, a = 1) {
    if (k <= 0 || a <= 0) return; const ctx = K.ctx;
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + TAU * clamp(k)); ctx.stroke(); ctx.restore();
  }
  const SPK = { X: new Float32Array(64), Y: new Float32Array(64), A: new Float32Array(64) };
  function spark(x, y, col, a, t, seed = 0, n = 10, spread = 6) {   // a tiny living point of light
    if (a <= 0.003) return;
    for (let i = 0; i < n; i++) { const an = R(i, 70 + seed) * TAU, r = spread * R(i, 71 + seed) * (0.6 + 0.4 * Math.sin(t * 3 + i));
      SPK.X[i] = x + Math.cos(an) * r; SPK.Y[i] = y + Math.sin(an) * r; SPK.A[i] = 0.5 + 0.5 * R(i, 72 + seed); }
    PX.points(SPK.X, SPK.Y, n, col, { a: 0.5 * a, A: SPK.A, glow: 1.2, size: 2 });
  }
  // a field of motes slowly drawn toward (cx, cy): the light gathering around a sentence
  const MO = { X: new Float32Array(900), Y: new Float32Array(900), A: new Float32Array(900) };
  function inflow(cx, cy, rx, ry, n, col, a, t, seed = 0) {
    if (a <= 0.003) return; n = Math.min(900, n);
    for (let i = 0; i < n; i++) {
      const ph = (R(i, 80 + seed) + t * (0.05 + 0.05 * R(i, 81 + seed))) % 1, an = R(i, 82 + seed) * TAU + ph * 0.8;
      const rr = 1.1 - ph;                                           // from the rim inward, then reborn at the rim
      MO.X[i] = cx + Math.cos(an) * rx * rr; MO.Y[i] = cy + Math.sin(an) * ry * rr;
      MO.A[i] = Math.sin(Math.PI * ph) * (0.3 + 0.7 * R(i, 83 + seed));
    }
    PX.points(MO.X, MO.Y, n, col, { a: 0.22 * a, A: MO.A, glow: 0.6 });
  }
  // a small cloud disc of particles (a weight, a light, a seed)
  const DS = { X: new Float32Array(700), Y: new Float32Array(700), A: new Float32Array(700) };
  function blob(x, y, r, n, col, a, k, t, seed = 0) {
    if (a <= 0.003 || k <= 0) return; n = Math.min(700, n);
    for (let i = 0; i < n; i++) {
      const rr = r * Math.sqrt(R(i, 90 + seed)), an = R(i, 91 + seed) * TAU + t * 0.2 * (R(i, 92 + seed) - 0.5);
      const kk = ease.out(clamp(k * 1.5 - R(i, 93 + seed) * 0.5)), far = (1 - kk) * r * 4;
      DS.X[i] = x + Math.cos(an) * (rr + far); DS.Y[i] = y + Math.sin(an) * (rr + far) * 0.9;
      DS.A[i] = kk * (1 - 0.6 * rr / r);
    }
    PX.points(DS.X, DS.Y, n, col, { a: 0.45 * a, A: DS.A, glow: 0.8 });
  }

  // common envelope: gather over [g0, g1], dissolve over the last `od` s (the runtime cross-fade covers the rest)
  const gatherK = (lt, g0, g1) => clamp((lt - g0) / Math.max(0.1, g1 - g0));
  const outK = (lt, dur, od = 0.9) => clamp((lt - (dur - od * 0.55)) / od);

  // ================================================================ title
  T.register('title', {
    draw(ctx, V, lt, api) {
      const M = api.mood, dur = api.dur, v = variant(V, 2), formed = api.mark('formed') || 2.5;
      const L = fit(V.title, { max: 128, min: 56, maxW: 860, maxH: 560, maxLines: 3, lh: 1.32, wt: 600, sp: 0.08 });
      const SL = V.sub ? fit(V.sub, { fam: SANS, wt: 300, max: 40, min: 26, maxW: 820, maxH: 150, maxLines: 2, sp: 0.22, lh: 1.6 }) : null;
      const gap = SL ? 96 : 0, total = L.h + (SL ? gap + SL.h : 0), y = clamp(880 - total / 2, 300, 1650 - total);
      const out = outK(lt, dur, 1.1);
      if (V.mood === 'cold') cone(W / 2, 0, y + L.h + 40, 420, M.css, 0.9 * ease.out(prog(lt, 0, 2.5)));
      else orb(W / 2, y + L.h / 2, 560, M.css, (V.mood === 'warm' ? 0.7 : 0.35) * ease.out(prog(lt, 0.5, formed + 1)));
      text(L, { x: W / 2, y, k: gatherK(lt, 0.15, formed), mode: v ? 'wide' : 'scatter', out, t: lt, mood: M, a: 0.46, seed: 11, tag: 1, swirl: 160 });
      if (SL) {
        const sk = ease.out(prog(lt, api.mark('sub') || formed + 0.5, (api.mark('sub') || formed + 0.5) + 1.4));
        hairC(W / 2, y + L.h + gap / 2 - 4, 120, ease.inOut(prog(lt, formed - 0.2, formed + 1.2)), M.line, 1.2, 0.8 * (1 - out));
        text(SL, { x: W / 2, y: y + L.h + gap, k: sk, mode: 'write', out, t: lt, mood: M, dim: 0.78, a: 0.3, crisp: 0.85, seed: 12, tag: 2 });
      }
    },
  });

  // ================================================================ chapter
  T.register('chapter', {
    draw(ctx, V, lt, api) {
      const M = api.mood, dur = api.dur, v = variant(V, 2), formed = api.mark('formed') || 1.6, out = outK(lt, dur);
      const n = String(V.n || ''), short = [...n].length <= 2;
      if (v === 0) {                   // centred: numeral in a ring, a hairline, the title
        const L = V.title ? fit(V.title, { max: 92, min: 48, maxW: 820, maxH: 380, maxLines: 3, lh: 1.32, wt: 600, sp: 0.1 }) : null;
        const ry = 780, r = 56, ty = 930;
        if (n) {
          if (short) arc(W / 2, ry, r, -Math.PI / 2, ease.inOut(prog(lt, 0.1, 1.5)), M.line, 1.3, 1 - out);
          const NL = fit(n, { max: short ? 54 : 44, min: 24, maxW: short ? 90 : 760, maxH: 80, maxLines: 1, wt: 400, sp: short ? 0 : 0.2 });
          text(NL, { x: W / 2, y: ry - NL.h / 2 - NL.size * 0.06, k: gatherK(lt, 0.2, 1.3), mode: 'point', from: [W / 2, ry], out, t: lt, mood: M, a: 0.4, seed: 21, tag: 3, dim: 0.9 });
        }
        hairC(W / 2, 860, 280, ease.inOut(prog(lt, 0.6, 1.8)), M.line, 1.1, 0.7 * (1 - out));
        if (L) text(L, { x: W / 2, y: ty, k: gatherK(lt, 0.45, formed + 0.4), mode: 'scatter', out, t: lt, mood: M, a: 0.44, seed: 22, tag: 4 });
      } else {                         // left: a vertical hairline, the numeral above the title
        const L = V.title ? fit(V.title, { max: 88, min: 46, maxW: 760, maxH: 420, maxLines: 3, lh: 1.32, wt: 600, sp: 0.08 }) : null;
        const x = 196, ty = 920, h = (L ? L.h : 0) + 170;
        hair(150, 760, 150, 760 + h, ease.inOut(prog(lt, 0.1, 1.6)), M.line, 1.3, 1 - out);
        if (n) {
          const NL = fit(short ? n : n, { max: 42, min: 24, maxW: 760, maxH: 60, maxLines: 1, wt: 400, sp: 0.3, fam: short ? SERIF : SANS });
          text(NL, { x, y: 790, align: 'left', k: gatherK(lt, 0.3, 1.3), mode: 'write', out, t: lt, mood: M, a: 0.35, seed: 23, tag: 3, dim: 0.75 });
          hair(x, 870, x + 80, 870, ease.inOut(prog(lt, 0.8, 1.7)), M.line, 1.1, 0.8 * (1 - out));
        }
        if (L) text(L, { x, y: ty, align: 'left', k: gatherK(lt, 0.5, formed + 0.4), mode: 'below', out, t: lt, mood: M, a: 0.44, seed: 24, tag: 4 });
      }
    },
  });

  // ================================================================ line: the sentence is the frame
  const LINE_LAYOUTS = [
    { align: 'center', cy: 900, mode: 'scatter', maxW: 860 },
    { align: 'left', x: 140, cy: 820, mode: 'write', maxW: 800, rule: true },
    { align: 'center', cy: 1010, mode: 'line', maxW: 860, floor: true },
    { align: 'center', cy: 840, mode: 'point', maxW: 860, seedLight: true },
  ];
  T.register('line', {
    draw(ctx, V, lt, api) {
      const M = api.mood, dur = api.dur, P = LINE_LAYOUTS[variant(V, LINE_LAYOUTS.length)];
      const formed = api.mark('formed') || 1.6, out = outK(lt, dur);
      const L = fit(V.text, { max: 80, min: 40, maxW: P.maxW, maxH: 700, maxLines: 5, lh: 1.5, wt: 500, sp: 0.06, key: V.key });
      const y = clamp(P.cy - L.h / 2 - lt * 2.2, 300, 1640 - L.h), x = P.align === 'left' ? P.x : W / 2;
      const cx = P.align === 'left' ? P.x + L.w / 2 : W / 2;
      const keyK = V.key ? ease.inOut(prog(lt, api.mark('key') || formed + 0.5, (api.mark('key') || formed + 0.5) + 1.0)) : 0;
      // mood light
      const lk = ease.out(prog(lt, 0, formed + 0.8)) * (1 - out * 0.5);
      if (V.mood === 'cold' && P === LINE_LAYOUTS[0]) cone(cx, 0, y + L.h + 60, Math.max(260, L.w * 0.62), M.css, 0.75 * lk);
      else if (V.mood === 'cold') orb(cx, y - 260, 620, M.css, 0.22 * lk);
      else if (V.mood === 'warm') orb(cx, y + L.h * 0.55, Math.max(380, L.w * 0.75), M.css, 0.5 * lk + 0.25 * keyK);
      let from = null, k = gatherK(lt, 0.1, formed);
      if (P.rule) hair(104, y - 10, 104, y + L.h + 14, ease.inOut(prog(lt, 0, 0.9)), M.line, 1.3, 0.85 * (1 - out));
      if (P.floor) {                   // a hairline of light first; the sentence condenses up out of it
        const fy = y + L.h + 46; from = [W / 2, fy];
        hairC(W / 2, fy, Math.min(860, L.w + 120), ease.inOut(prog(lt, 0, 0.8)), M.line, 1.2, 0.7 * (1 - out));
        k = gatherK(lt, 0.45, formed);
      }
      if (P.seedLight) {               // a point of light below opens; the words flow out of it
        const sy = Math.min(1560, y + L.h + 230); from = [W / 2, sy];
        const sa = ease.out(prog(lt, 0, 0.6)) * (1 - 0.65 * ease.inOut(prog(lt, formed, formed + 1.2))) * (1 - out);
        spark(W / 2, sy, M.keyL, sa, lt, 3, 14, 7); orb(W / 2, sy, 160, M.css, 0.5 * sa);
        k = gatherK(lt, 0.35, formed);
      }
      text(L, { x, y, align: P.align, k, mode: P.mode, from, out, t: lt, mood: M, keyK, seed: 30 + (V.occ % 5), tag: 5 });
      keyLine(L, { x, y, align: P.align, mood: M }, keyK * (1 - out));
    },
  });

  // ================================================================ quote: larger, slower, light grows around it
  T.register('quote', {
    draw(ctx, V, lt, api) {
      const M = api.mood, dur = api.dur, v = variant(V, 2), formed = api.mark('formed') || 2.5, out = outK(lt, dur, 1.1);
      const L = fit(V.text, { max: 100, min: 46, maxW: v ? 800 : 840, maxH: 760, maxLines: 5, lh: 1.46, wt: 600, sp: 0.06, key: V.key });
      const align = v ? 'left' : 'center', x = v ? 150 : W / 2, cx = v ? 150 + L.w / 2 : W / 2;
      const y = clamp(900 - L.h / 2 - lt * 1.5, 320, 1600 - L.h), cy = y + L.h / 2;
      const km = api.mark('key') || formed + 0.8;
      const keyK = V.key ? ease.inOut(prog(lt, km, km + 1.4)) : 0;
      const grow = ease.inOut(prog(lt, 0.2, dur));
      // the light grows: a widening glow, motes drawn in toward the sentence
      orb(cx, cy, 380 + 420 * grow, M.css, (0.25 + 0.55 * grow) * (V.mood === 'neutral' ? 0.6 : 1) * (1 - out * 0.6));
      inflow(cx, cy, 520 + 60 * grow, 420 + 120 * grow, 520, M.keyL, ease.out(prog(lt, 0.8, 3)) * (1 - out), lt, V.seed % 7);
      if (V.mood === 'cold') cone(cx, 0, y - 30, Math.max(300, L.w * 0.6), M.css, 0.5 * ease.out(prog(lt, 0, 2)));
      // quotation rules
      const rk = ease.inOut(prog(lt, formed - 0.4, formed + 1.2));
      if (v) {
        ctx.save(); ctx.globalAlpha *= 0.16 * ease.out(prog(lt, 0.2, 2)) * (1 - out); ctx.font = `600 300px ${SERIF}`; ctx.fillStyle = M.text;
        ctx.fillText('“', 96, y + 150); ctx.restore();
        hair(150, y + L.h + 70, 150 + Math.min(260, L.w), y + L.h + 70, rk, M.line, 1.2, 0.8 * (1 - out));
      } else {
        hairC(W / 2, y - 64, 160, rk, M.line, 1.2, 0.7 * (1 - out));
        hairC(W / 2, y + L.h + 64, 160, rk, M.line, 1.2, 0.7 * (1 - out));
      }
      const breathe = 0.92 + 0.08 * Math.sin(lt * 1.6);
      text(L, { x, y, align, k: gatherK(lt, 0.15, formed), mode: v ? 'below' : 'scatter', out, t: lt, mood: M, keyK: keyK * breathe, a: 0.46, seed: 40 + (V.occ % 5), tag: 6, swirl: L.size });
      keyLine(L, { x, y, align, mood: M }, keyK * (1 - out) * 0.8);
    },
  });

  // ================================================================ question: darkness, one sentence stays lit
  T.register('question', {
    draw(ctx, V, lt, api) {
      const M = api.mood, dur = api.dur, v = variant(V, 2), formed = api.mark('formed') || 2, lit = api.mark('lit') || formed + 0.8, out = outK(lt, dur, 1.0);
      const L = fit(V.text, { max: 76, min: 40, maxW: 840, maxH: 640, maxLines: 5, lh: 1.55, wt: 500, sp: 0.06, keepPunct: false });
      const y = clamp(920 - L.h / 2, 320, 1600 - L.h), cy = y + L.h / 2;
      // the dark: the room light goes out around the sentence
      const dark = ease.inOut(prog(lt, 0, 2.2));
      ctx.save(); ctx.globalAlpha *= 0.6 * dark; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
      const lk = ease.inOut(prog(lt, lit - 0.4, lit + 1.4));
      if (v === 0) cone(W / 2, 0, cy + L.h / 2 + 80, Math.max(280, L.w * 0.6), M.css, 1.1 * lk * (1 - out * 0.5));
      else {                           // a slit of light across the sentence
        const hh = (L.h + 140) * lk;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.55 * lk * (1 - out * 0.5);
        const g = ctx.createLinearGradient(0, cy - hh / 2, 0, cy + hh / 2);
        g.addColorStop(0, `rgba(${M.css},0)`); g.addColorStop(0.5, `rgba(${M.css},0.07)`); g.addColorStop(1, `rgba(${M.css},0)`);
        ctx.fillStyle = g; ctx.fillRect(60, cy - hh / 2, W - 120, hh); ctx.restore();
        hairC(W / 2, cy - hh / 2, 700 * lk, 1, M.line, 1, 0.35 * lk); hairC(W / 2, cy + hh / 2, 700 * lk, 1, M.line, 1, 0.35 * lk);
      }
      const dim = 0.5 + 0.5 * lk;
      text(L, { x: W / 2, y, k: gatherK(lt, 0.3, formed), mode: 'write', out, t: lt, mood: M, dim, a: 0.4, seed: 50, tag: 7 });
      // the question mark keeps a small light
      const last = L.lines[L.n - 1], qc = last.chars[last.chars.length - 1];
      if (qc && /[？?]/.test(qc.c)) {
        const qx = lineX(L, L.n - 1, W / 2, 'center') + qc.x + qc.w / 2, qy = y + baseY(L, L.n - 1) - L.size * 0.35;
        orb(qx, qy, L.size * 1.6, M.css, 0.6 * lk * (1 - out));
      }
    },
  });

  // ================================================================ list: items written one by one
  T.register('list', {
    draw(ctx, V, lt, api) {
      const M = api.mood, dur = api.dur, v = variant(V, 3), out = outK(lt, dur);
      const items = V.items, n = items.length, at = (api.marks.items || []).slice();
      while (at.length < n) at.push((at[at.length - 1] || 1) + 1.6);
      // one font size for every item: the largest that fits all of them and the column
      const head = V.head ? fit(V.head, { fam: SANS, wt: 400, max: 36, min: 24, maxW: 820, maxH: 110, maxLines: 2, sp: 0.24, lh: 1.5 }) : null;
      const markW = 64, maxW = 820 - markW;
      let size = 66, Ls;
      for (; size >= 30; size -= 2) {
        Ls = items.map(s => fit(s, { max: size, min: size, maxW, maxH: size * 2.5, maxLines: 2, lh: 1.32, wt: 500, sp: 0.05 }));
        const gapI = size * 0.95, tot = Ls.reduce((a, L) => a + L.h, 0) + gapI * (n - 1) + (head ? head.h + 110 : 0);
        if (Ls.every(L => L.size === size) && tot <= 1180) break;
      }
      const gapI = size * 0.95, blockW = markW + Math.max(...Ls.map(L => L.w), head ? head.w - markW : 0);
      const tot = Ls.reduce((a, L) => a + L.h, 0) + gapI * (n - 1) + (head ? head.h + 110 : 0);
      const x0 = Math.max(110, Math.round(W / 2 - blockW / 2)), y0 = clamp(900 - tot / 2, 320, 1640 - tot);
      let y = y0;
      if (head) {
        const hk = gatherK(lt, (api.mark('head') || 0.4) - 0.1, (api.mark('head') || 0.4) + 1.0);
        text(head, { x: x0, y, align: 'left', k: hk, mode: 'write', out, t: lt, mood: M, dim: 0.62, a: 0.28, crisp: 0.9, seed: 60, tag: 8 });
        hair(x0, y + head.h + 40, x0 + Math.min(blockW, 520), y + head.h + 40, ease.inOut(prog(lt, 0.6, 1.8)), M.line, 1.1, 0.6 * (1 - out));
        y += head.h + 110;
      }
      const lastAt = at[n - 1];
      Ls.forEach((L, i) => {
        const t0 = at[i], wd = 0.5 + Math.min(1.6, L.nch * 0.07);
        const k = gatherK(lt, t0 + 0.15, t0 + 0.15 + wd);
        // written items stay; the newest is brightest, the rest settle a little
        const settle = i < n - 1 ? 1 - 0.28 * ease.inOut(prog(lt, at[i + 1], at[i + 1] + 0.8)) * (1 - ease.inOut(prog(lt, lastAt + 1.2, lastAt + 2.4))) : 1;
        const my = y + L.size * 0.5, mx = x0 + 18, mk_ = ease.inOut(prog(lt, t0 - 0.05, t0 + 0.6));
        if (v === 0) { arc(mx, my, 9, -Math.PI / 2, mk_, M.line, 1.4, 1 - out); spark(mx, my, M.keyL, (1 - out) * mk_ * (0.35 + 0.65 * Math.exp(-Math.max(0, lt - t0) * 1.2)), lt, i, 10, 4); }
        else if (v === 1) {
          ctx.save(); ctx.globalAlpha *= mk_ * (1 - out) * 0.7; ctx.font = `400 ${Math.round(size * 0.42)}px ${MONO}`; ctx.fillStyle = M.text; ctx.textBaseline = 'alphabetic';
          ctx.fillText(String(i + 1).padStart(2, '0'), x0, y + baseY(L, 0) - L.size * 0.08); ctx.restore();
        } else { hair(x0, my, x0 + 30, my, mk_, M.line, 1.4, 1 - out); spark(x0 + 30, my, M.keyL, (1 - out) * mk_ * Math.exp(-Math.max(0, lt - t0 - 0.4) * 1.5), lt, i, 8, 3); }
        if (V.mood === 'warm') orb(mx, my, 70, M.css, 0.5 * mk_ * (1 - out));
        text(L, { x: x0 + markW, y, align: 'left', k, mode: 'write', out, t: lt, mood: M, dim: settle, a: 0.42, seed: 61 + i, tag: 9 + i });
        y += L.h + gapI;
      });
    },
  });

  // ================================================================ contrast: two sides, cold vs warm, a balance
  T.register('contrast', {
    draw(ctx, V, lt, api) {
      const dur = api.dur, out = outK(lt, dur), MC = api.MOOD.cold, MW = api.MOOD.warm;
      const tl = api.mark('left') || 0.8, tr = api.mark('right') || 3, tb = api.mark('balance') || 5;
      // beam angle: tips to the left, swings to the right, settles level (damped, closed form)
      const step = (t0, d) => { const u = lt - t0; return u <= 0 ? 0 : d * (1 - Math.exp(-u * 2.0) * Math.cos(u * 4.2)); };
      const th = (step(tl, -7) + step(tr, 11) + step(tb, -4)) * Math.PI / 180;
      const fitSide = (s, w) => ({
        lab: s.label ? fit(s.label, { max: 74, min: 36, maxW: w, maxH: 150, maxLines: 2, wt: 600, sp: 0.1, lh: 1.3 }) : null,
        txt: s.text ? fit(s.text, { max: 54, min: 32, maxW: w, maxH: 230, maxLines: 4, wt: 400, sp: 0.04, lh: 1.5 }) : null,
      });
      let A = fitSide(V.left, 380), B = fitSide(V.right, 380);
      const tooBig = s => (s.txt && (s.txt.size < 36 || s.txt.n > 3)) || (s.lab && s.lab.size < 40);
      const side = (S, x, y, align, M, t0, seed) => {
        let yy = y;
        const k1 = gatherK(lt, t0, t0 + 1.0), k2 = gatherK(lt, t0 + 0.5, t0 + 1.4 + (S.txt ? S.txt.nch * 0.05 : 0));
        if (S.lab) { text(S.lab, { x, y: yy, align, k: k1, mode: 'scatter', out, t: lt, mood: M, a: 0.44, seed, tag: 20 + seed % 4, colour: M.keyL }); yy += S.lab.h + 34; }
        if (S.txt) text(S.txt, { x, y: yy, align, k: k2, mode: 'write', out, t: lt, mood: M, a: 0.36, seed: seed + 1, tag: 24 + seed % 4, dim: 0.9 });
        return yy + (S.txt ? S.txt.h : 0);
      };
      const hgt = S => (S.lab ? S.lab.h + 34 : 0) + (S.txt ? S.txt.h : 0);
      const lineC = 'rgba(236,231,220,0.42)', draw = ease.inOut(prog(lt, 0, 1.2)) * (1 - out);
      if (!tooBig(A) && !tooBig(B)) {
        // side by side under a balance scale
        const px = W / 2, py = 700, Lb = 270;
        const ex = s => px + s * Lb * Math.cos(th), ey = s => py + s * Lb * Math.sin(th);
        hair(px, py + 26, px, 1520, draw, lineC, 1.2);
        hair(px - 70, 1520, px + 70, 1520, draw, lineC, 1.2);
        ctx.save(); ctx.globalAlpha *= draw; ctx.strokeStyle = lineC; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 16, py + 26); ctx.lineTo(px + 16, py + 26); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex(-1), ey(-1)); ctx.lineTo(ex(1), ey(1)); ctx.stroke(); ctx.restore();
        for (const s of [-1, 1]) {
          const M = s < 0 ? MC : MW, x = ex(s), y = ey(s), py2 = y + 150, t0 = s < 0 ? tl : tr;
          hair(x, y, x - 100, py2, draw, lineC, 1); hair(x, y, x + 100, py2, draw, lineC, 1);
          ctx.save(); ctx.globalAlpha *= draw; ctx.strokeStyle = lineC; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, py2, 110, 14, 0, 0, Math.PI); ctx.stroke(); ctx.restore();
          blob(x, py2 - 16, 26, 380, M.keyL, 1 - out, ease.out(prog(lt, t0, t0 + 1.4)), lt, s < 0 ? 1 : 2);
          orb(x, py2 - 16, 150, M.css, 0.45 * ease.out(prog(lt, t0, t0 + 1.5)) * (1 - out));
          side(s < 0 ? A : B, x, py2 + 70, 'center', M, t0, s < 0 ? 70 : 80);
        }
      } else {
        // stacked: the cold side above, a tilting beam, the warm side below
        A = fitSide(V.left, 820); B = fitSide(V.right, 820);
        const ha = hgt(A), hb = hgt(B), mid = 960;
        side(A, W / 2, clamp(mid - 110 - ha, 300, 900), 'center', MC, tl, 70);
        side(B, W / 2, Math.min(1640 - hb, mid + 110), 'center', MW, tr, 80);
        ctx.save(); ctx.globalAlpha *= draw; ctx.translate(W / 2, mid); ctx.rotate(th * 0.6); ctx.strokeStyle = lineC; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-380, 0); ctx.lineTo(380, 0); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.globalAlpha *= draw; ctx.strokeStyle = lineC; ctx.beginPath(); ctx.moveTo(W / 2, mid); ctx.lineTo(W / 2 - 16, mid + 26); ctx.lineTo(W / 2 + 16, mid + 26); ctx.closePath(); ctx.stroke(); ctx.restore();
        blob(W / 2 - 380 * Math.cos(th * 0.6), mid - 380 * Math.sin(th * 0.6) - 14, 16, 220, MC.keyL, 1 - out, ease.out(prog(lt, tl, tl + 1.4)), lt, 1);
        blob(W / 2 + 380 * Math.cos(th * 0.6), mid + 380 * Math.sin(th * 0.6) - 14, 16, 220, MW.keyL, 1 - out, ease.out(prog(lt, tr, tr + 1.4)), lt, 2);
      }
    },
  });

  // ================================================================ number: it counts, then its meaning
  function parseNum(s) {
    const m = /^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(s);
    if (!m) return null;
    const raw = m[2], dec = (raw.split('.')[1] || '').length, val = parseFloat(raw.replace(/,/g, ''));
    return { pre: m[1], val, dec, commas: raw.includes(','), suf: m[3] };
  }
  function fmt(v, p) {
    let s = v.toFixed(p.dec);
    if (p.commas) { const [a, b] = s.split('.'); s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : ''); }
    return s;
  }
  T.register('number', {
    draw(ctx, V, lt, api) {
      const M = api.mood, dur = api.dur, out = outK(lt, dur), v = variant(V, 2);
      const c0 = api.mark('count') || 0.5, c1 = api.mark('land') || 3, tt = api.mark('text') || c1 + 0.5;
      const p = parseNum(V.value), cy = 800;
      // the number: fixed digit slots so counting doesn't jitter
      const fam = SERIF, wt = 400;
      const final = p ? p.pre + fmt(p.val, p) + p.suf : V.value;
      const dw = Math.max(...[...'0123456789'].map(d => cw(d, fam, wt)));
      const unitW = s => [...s].reduce((a, c) => a + (/\d/.test(c) ? dw : cw(c, fam, wt)), 0);
      const affix = s => [...s].reduce((a, c) => a + cw(c, fam, wt), 0) * 0.5;
      const numU = p ? unitW(fmt(p.val, p)) + affix(p.pre) + affix(p.suf) : unitW(V.value);
      const size = Math.min(300, Math.floor(760 / Math.max(0.5, numU)));
      let e = ease.out(prog(lt, c0, c1)), shown;
      if (p) {
        const from = p.val === 0 ? 9 : 0, cur = lerp(from, p.val, p.val === 0 ? ease.inOut(prog(lt, c0, c1)) : e);
        shown = fmt(p.dec ? cur : (p.val === 0 ? Math.ceil(cur - 1e-6) : Math.floor(cur + 1e-6)), p);
      } else shown = V.value;
      const land = ease.out(prog(lt, c1 - 0.05, c1 + 1.2));
      const vis = ease.out(prog(lt, c0 - 0.4, c0 + 0.3)) * (1 - ease.in(clamp(out * 1.3)));
      const R0 = Math.max(200, size * numU / 2 + 70);
      // ring: sweeps with the count, then holds
      arc(W / 2, cy, R0, -Math.PI / 2, ease.inOut(prog(lt, c0, c1)), M.line, 1.4, (v ? 0.5 : 0.85) * vis);
      if (v) arc(W / 2, cy, R0 + 18, -Math.PI / 2, ease.inOut(prog(lt, c0 + 0.3, c1 + 0.3)), M.line, 1, 0.35 * vis);
      orb(W / 2, cy, R0 * 1.5, M.css, (0.25 + 0.5 * land) * vis * (1 - land * 0.4 + 0.4 * Math.exp(-Math.max(0, lt - c1) * 1.2)));
      if (p) {
        const whole = p.pre + shown + p.suf;
        const pw = affix(p.pre) * size, sw = affix(p.suf) * size, nw = unitW(shown) * size;
        let x = W / 2 - (pw + nw + sw) / 2;
        const by = cy + size * 0.36;
        ctx.save(); ctx.globalAlpha *= vis; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
        ctx.fillStyle = css(mix(M.textL, M.keyL, land)); ctx.shadowColor = M.key; ctx.shadowBlur = 30 * land;
        ctx.font = `${wt} ${size * 0.5}px ${fam}`; ctx.textAlign = 'left';
        if (p.pre) { ctx.fillText(p.pre, x, by); x += pw; }
        ctx.font = `${wt} ${size}px ${fam}`; ctx.textAlign = 'center';
        for (const c of shown) { const w = (/\d/.test(c) ? dw : cw(c, fam, wt)) * size; ctx.fillText(c, x + w / 2, by); x += w; }
        ctx.font = `${wt} ${size * 0.5}px ${fam}`; ctx.textAlign = 'left';
        if (p.suf) ctx.fillText(p.suf, x + size * 0.04, by);
        ctx.restore();
        void whole;
      } else {
        const NL = fit(final, { max: 200, min: 60, maxW: 760, maxH: 300, maxLines: 1, wt: 600 });
        text(NL, { x: W / 2, y: cy - NL.h / 2, k: gatherK(lt, c0, c1), mode: 'scatter', out, t: lt, mood: M, keyK: land, keyColour: M.keyL, seed: 90, tag: 30 });
      }
      // landing: a ring of light expands once
      const rx = prog(lt, c1, c1 + 1.6);
      if (rx > 0 && rx < 1) arc(W / 2, cy, R0 + 160 * ease.out(rx), 0, 1, M.line, 1.2, (1 - rx) * 0.7 * vis);
      if (V.text) {
        const L = fit(V.text, { max: 58, min: 34, maxW: 820, maxH: 300, maxLines: 4, wt: 500, sp: 0.06, lh: 1.5 });
        const ty = Math.min(1640 - L.h, cy + R0 + 110);
        text(L, { x: W / 2, y: ty, k: gatherK(lt, tt, tt + 0.6 + L.nch * 0.06), mode: v ? 'write' : 'below', out, t: lt, mood: M, seed: 91, tag: 31 });
      }
    },
  });

  // ================================================================ end: the final card
  T.register('end', {
    draw(ctx, V, lt, api) {
      const M = api.mood, dur = api.dur, formed = api.mark('formed') || 2.8;
      const L = fit(V.text, { max: 116, min: 52, maxW: 860, maxH: 520, maxLines: 3, lh: 1.3, wt: 600, sp: 0.06 });
      const SL = V.sub ? fit(V.sub, { max: 50, min: 30, maxW: 820, maxH: 200, maxLines: 2, wt: 400, sp: 0.14, lh: 1.5 }) : null;
      const total = L.h + (SL ? 90 + SL.h : 0), y = clamp(840 - total / 2, 320, 1400 - total);
      const sy = Math.min(1560, y + total + 260);                       // your own light, below the words
      const breathe = 0.85 + 0.15 * Math.sin(lt * 1.3);
      const seedA = ease.out(prog(lt, 0, 1.2)), fade = 1 - ease.inOut(prog(lt, dur - 2.6, dur));
      orb(W / 2, sy, 260 * breathe, M.css, 0.9 * seedA * fade);
      spark(W / 2, sy, M.keyL, seedA * fade, lt, 9, 24, 10);
      orb(W / 2, y + L.h / 2, 640, M.css, 0.45 * ease.inOut(prog(lt, formed - 0.5, formed + 3)) * fade);
      inflow(W / 2, y + total / 2, 560, 520, 360, M.keyL, 0.6 * ease.out(prog(lt, formed, formed + 2)) * fade, lt, 5);
      text(L, { x: W / 2, y, k: gatherK(lt, 0.4, formed), mode: 'point', from: [W / 2, sy], out: 0, t: lt, mood: M, keyK: 0, a: 0.5, seed: 100, tag: 40, dim: fade, swirl: 220 });
      if (SL) {
        const s0 = api.mark('sub') || formed + 0.8;
        hairC(W / 2, y + L.h + 46, 140, ease.inOut(prog(lt, formed, formed + 1.4)), M.line, 1.2, 0.8 * fade);
        text(SL, { x: W / 2, y: y + L.h + 90, k: gatherK(lt, s0, s0 + 0.8 + SL.nch * 0.07), mode: 'write', out: 0, t: lt, mood: M, a: 0.34, seed: 101, tag: 41, dim: 0.85 * fade });
      }
    },
  });

  window.TXT = { fit, text, cloud, keyLine, orb, cone, hair, arc, spark };
})();
