/* v3: text screens in the v3 language (no panels, no cards, no bullets).
 * Overrides: lens, compare, list, statement (params and step semantics as in basic.js).
 *
 *   lens       {x, lenses:[..], pick, views?:[..], glyph?, see?}    a loose cloud of glyphs; lenses of light slide past,
 *                                                                  each one brings the same glyphs into its own order
 *   compare    {left:{title,items}, right:{...}, join?:'vs'|'arrow', steps:[{show:'left'|'right'}|{note}]}
 *                                                                  a vertical line of light; the side being read is near,
 *                                                                  the other recedes into depth
 *   list       {title?, items:[{title,en?,desc?}], steps:[{show:i|'all'|[..], stagger?}]}
 *                                                                  keywords on a slow arc, lit one at a time
 *   statement  {text, highlight?[], label?, steps?:[{note}|{final}], finalMode?}
 *                                                                  one phrase at the focal point of drifting glyphs
 *
 * Alphas multiply into ctx.globalAlpha (the runtime's beat fade), as L.glyph / L.light do. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng } = K;
  const INK = '#efe9dc', DIM = 'rgba(239,233,220,0.45)', GOLD = '#e9c47a', TEAL = '#7fd8cb', EMBER = '#ff9f5a';
  const COOL = '#a9b8c8';                 // far, out-of-focus glyphs
  const chars = s => Array.from(String(s || ''));
  const q2 = v => Math.max(2, Math.round(v / 2) * 2);

  // ---------------- type: per-glyph serif with depth blur, scale and highlight cross-fade ----------------
  const wcache = new Map();
  function widths(str, size, fam, wt, sp) {
    const key = str + '|' + size + '|' + fam + '|' + wt + '|' + sp;
    let v = wcache.get(key);
    if (v) return v;
    ctx.save(); ctx.font = `${wt} ${size}px ${fam}`;
    const ws = chars(str).map(c => ctx.measureText(c).width + sp);
    ctx.restore();
    v = { ws, total: ws.reduce((a, b) => a + b, 0) - sp };
    if (!document.fonts || document.fonts.status === 'loaded') wcache.set(key, v);
    return v;
  }
  function measureW(str, o = {}) {
    const size = o.size || 56, sp = o.spacing == null ? size * 0.06 : o.spacing;
    return widths(str, size, o.family || F.serif, o.weight || 400, sp).total * (o.scale || 1);
  }
  function hiMask(str, words) {
    const cs = chars(str), m = cs.map(() => false);
    for (const w of words || []) {
      const wc = chars(w); if (!wc.length) continue;
      for (let i = 0; i + wc.length <= cs.length; i++) if (cs.slice(i, i + wc.length).join('') === w) for (let k = 0; k < wc.length; k++) m[i + k] = true;
    }
    return m;
  }
  /** o: size, scale, color, alpha, reveal, blur (int, depth), glow, family, weight, align, spacing, hi[], hiK, hiColor */
  function word(str, x, y, o = {}) {
    const size = o.size || 56, fam = o.family || F.serif, wt = o.weight || 400, sc = o.scale || 1;
    const sp = o.spacing == null ? size * 0.06 : o.spacing, cs = chars(str);
    const { ws, total } = widths(str, size, fam, wt, sp);
    const tw = total * sc, align = o.align || 'center';
    let cx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    const alpha = o.alpha == null ? 1 : o.alpha, reveal = o.reveal == null ? 1 : o.reveal;
    const glow = o.glow == null ? 8 : o.glow, depth = Math.round(o.blur || 0), color = o.color || INK;
    const mask = o.hi ? hiMask(str, o.hi) : null, hk = o.hiK == null ? 1 : o.hiK;
    if (alpha <= 0.003) return tw;
    cs.forEach((ch, i) => {
      const p = clamp(reveal * (cs.length + 3) - i, 0, 3) / 3;
      const gx = cx + (ws[i] - sp) / 2 * sc;
      cx += ws[i] * sc;
      if (p <= 0 || ch === ' ') return;
      const e = ease.out(p), blur = Math.max(depth, Math.round((1 - e) * 8));
      const go = { family: fam, weight: wt, blur, glow, scale: sc };
      if (mask && mask[i]) {
        if (hk < 1) L.glyph(ch, gx, y, size, color, alpha * e * (1 - hk), go);
        if (hk > 0) L.glyph(ch, gx, y, size, o.hiColor || EMBER, alpha * e * hk, { ...go, glow: glow + 6 });
      } else L.glyph(ch, gx, y, size, color, alpha * e, go);
    });
    return tw;
  }
  /** break a display line at the punctuation nearest the middle when it is too wide */
  function split2(str, maxW, o) {
    if (measureW(str, o) <= maxW) return [str];
    const cs = chars(str), mid = cs.length / 2; let cut = -1, best = 1e9;
    for (let k = 1; k < cs.length - 1; k++) if ('，；：、。？！ '.includes(cs[k]) && Math.abs(k - mid) < best) { best = Math.abs(k - mid); cut = k + 1; }
    if (cut < 0) cut = Math.ceil(mid);
    return [cs.slice(0, cut).join('').trim(), cs.slice(cut).join('').trim()];
  }
  const trimEnd = s => String(s || '').replace(/[。．]$/, '');

  // ---------------- light lines (1–1.5 px, both ends fade to 0) ----------------
  function vLine(x, y0, y1, a, rgb = '239,233,220', w = 1.2) {
    if (a <= 0.003 || y1 <= y0) return;
    ctx.save(); ctx.globalAlpha *= a;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y0, w, y1 - y0); ctx.restore();
  }
  function hLine(x0, x1, y, a, rgb = '239,233,220', w = 1.2) {
    if (a <= 0.003 || x1 <= x0) return;
    ctx.save(); ctx.globalAlpha *= a;
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x0, y - w / 2, x1 - x0, w); ctx.restore();
  }
  function segLine(x0, y0, x1, y1, a, rgb, w = 1.2) {   // a straight light line between two points, ends faded
    if (a <= 0.003) return;
    ctx.save(); ctx.globalAlpha *= a;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
  }
  // slow camera: a push-in of at most ~1 % over the beat, optional drift
  function camera(lt, api, cx, cy, amount = 0.012, dx = 0) {
    const s = 1 + amount * ease.inOut(prog(lt, 0, Math.max(1, api.dur)));
    ctx.translate(cx + dx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  }

  // ---------------- timing helpers (same semantics as basic.js) ----------------
  function narration(api) { return (api.beat.lines || []).map((l, k) => ({ text: l.text, ...api.line(k) })); }
  function wordTime(api, w, after = -Infinity) {
    if (!w) return null; w = String(w).replace(/\s+/g, '');
    for (const l of narration(api)) {
      const tx = l.text.replace(/\s+/g, ''), i = tx.indexOf(w); if (i < 0) continue;
      const t = l.start + (i / Math.max(1, tx.length)) * l.dur; if (t > after) return t;
    }
    return null;
  }
  function anchorTime(api, title, after) {
    const cs = chars(String(title).replace(/[“”「」：:，、\s]/g, ''));
    for (let len = Math.min(cs.length, 6); len >= 2; len--) {
      let best = null;
      for (let i = 0; i + len <= cs.length; i++) { const t = wordTime(api, cs.slice(i, i + len).join(''), after); if (t != null && (best == null || t < best)) best = t; }
      if (best != null) return best;
    }
    return null;
  }
  function autoTimes(n, api, items) {
    const nar = narration(api), s = nar.length ? nar[0].start + 0.15 : 0.4;
    const end = Math.min(nar.length ? nar[nar.length - 1].end - 0.8 : api.dur - 1.5, api.dur - 1.2);
    const t = new Array(n).fill(null); let last = -Infinity;
    for (let i = 0; i < n; i++) { const a = items ? anchorTime(api, items[i].title || '', last + 0.4) : null; if (a != null && a > last + 0.4) { t[i] = a; last = a; } }
    if (t[0] == null) t[0] = s; else t[0] = Math.max(0.3, Math.min(t[0], s + 0.2));
    for (let i = 1; i < n; i++) {
      if (t[i] != null) continue; let j = i; while (j < n && t[j] == null) j++;
      const a = t[i - 1], b = j < n ? t[j] : Math.max(a + 0.9 * (j - i + 1), end);
      for (let k = i; k < j; k++) t[k] = lerp(a, b, (k - i + 1) / (j - i + 1));
    }
    for (let i = 1; i < n; i++) t[i] = Math.max(t[i], t[i - 1] + 0.6);
    return t;
  }
  function showTimes(n, api, defStagger = 0.9) {
    const ss = api.steps.filter(s => s.show != null && s.show !== 'left' && s.show !== 'right' && s.show !== 'subtitle');
    if (!ss.length) return null;
    const t = new Array(n).fill(Infinity);
    ss.forEach(s => {
      const idx = s.show === 'all' ? [...Array(n).keys()] : Array.isArray(s.show) ? s.show : [s.show];
      const st = s.stagger != null ? s.stagger : defStagger;
      idx.forEach((i, k) => { if (i >= 0 && i < n && t[i] === Infinity) t[i] = s.lt + k * st; });
    });
    return t;
  }
  function notes(api, lt, key = 'note') {
    const ns = api.steps.filter(s => s[key] != null), out = [];
    ns.forEach((s, i) => {
      const next = ns[i + 1];
      const a = Math.min(ease.out(prog(lt, s.lt, s.lt + 1.0)), next ? 1 - ease.in(prog(lt, next.lt - 0.5, next.lt)) : 1);
      if (a > 0) out.push({ text: s[key], a });
    });
    return out;
  }
  const noteCues = api => api.steps.filter(s => s.note != null && s.owner === api.beat.id).map(s => ({ t: s.lt, type: 'pop' }));
  function drawNotes(api, lt, y, k = 1) {
    for (const nt of notes(api, lt)) word(trimEnd(nt.text), W / 2, y + (1 - nt.a) * 10, { size: 38, color: INK, alpha: 0.78 * nt.a * k, glow: 4, reveal: nt.a });
  }

  // =====================================================================
  // lens — every discipline is a pair of glasses
  // =====================================================================
  const LR = 222, LGAP = 640, LCX = 960, LCY = 480, PS = 1.2;   // PS: pattern scale
  function lensPlan(V, api) {
    const lenses = V.lenses || [], n = lenses.length;
    let pick = lenses.indexOf(V.pick); if (pick < 0) pick = n - 1;
    const order = lenses.slice(0, pick + 1);
    const t0 = 1.0, settle = Math.max(t0 + 2.2, api.dur - 2.4), first = 1.35, mv = 1.05, k = order.length;
    const dwell = k > 1 ? Math.max(0.35, (settle - t0 - first - (k - 1) * mv) / (k - 1)) : 0;
    const moves = []; let t = t0;
    for (let i = 0; i < k; i++) { const d = i === 0 ? first : mv; moves.push({ a: t, b: t + d }); t += d + dwell; }
    return { order, pick, moves, settle: moves[k - 1].b, u0: -1.8 };
  }
  function lensU(plan, lt) {
    let u = plan.u0;
    plan.moves.forEach((m, i) => { u += (i === 0 ? -plan.u0 : 1) * ease.inOut(prog(lt, m.a, m.b)); });
    return u;
  }
  let LS = null;
  function lensScene() {
    if (LS) return LS;
    const r = rng(41), actors = [], bg = [];
    let guard = 0;
    while (actors.length < 24 && guard++ < 4000) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 175, p = { x: Math.cos(a) * d * 1.1, y: Math.sin(a) * d * 0.95 };
      if (actors.every(o => Math.hypot(o.x - p.x, o.y - p.y) > 50)) actors.push({ ...p, ph: r() * 6.28, d: r() });
    }
    guard = 0;
    while (bg.length < 150 && guard++ < 8000) {
      const x = (r() - 0.5) * 1760, y = (r() - 0.5) * 640;
      if (Math.hypot(x, y) < 285) continue;
      if (y < -230 && Math.abs(x) < 380) continue;                        // keep the label above clear
      if ((x / 900) ** 2 + (y / 330) ** 2 > 1) continue;
      if (bg.some(o => Math.hypot(o.x - x, o.y - y) < 46)) continue;
      bg.push({ x, y, d: r(), ph: r() * 6.28 });
    }
    // targets for 24 actors per view (relative to the lens centre)
    const heights = [1, 2, 3, 5, 6, 4, 2, 1], curve = [];
    heights.forEach((h, c) => { for (let k = 0; k < h; k++) curve.push({ x: (c - 3.5) * 36, y: 92 - k * 32 }); });
    const grid = Array.from({ length: 24 }, (_, i) => ({ x: (i % 6 - 2.5) * 44, y: (Math.floor(i / 6) - 1.5) * 46 }));
    const hex = Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return { x: Math.cos(a) * 124, y: Math.sin(a) * 112 }; });
    const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3], [1, 4], [2, 5]];
    const graph = hex.map(p => ({ ...p, node: true }));
    edges.forEach(([a, b]) => { for (const f of [1 / 3, 2 / 3]) graph.push({ x: lerp(hex[a].x, hex[b].x, f), y: lerp(hex[a].y, hex[b].y, f) }); });
    const sc = a => a.forEach(p => { p.x *= PS; p.y *= PS; });
    sc(curve); sc(grid); sc(graph); sc(hex);
    return (LS = { actors, bg, curve, grid, graph, hex, edges });
  }
  function loopT(i, lt) { const a = i / 24 * Math.PI * 2 + lt * 0.35; return { x: Math.cos(a) * 118 * PS, y: Math.sin(a) * 108 * PS }; }
  const VIEW_ORDER = ['curve', 'loop', 'grid'];

  T.register('lens', {
    draw(ctx_, V, lt, api) {
      const S = lensScene(), plan = lensPlan(V, api), u = lensU(plan, lt);
      const settleP = ease.inOut(prog(lt, plan.settle + 0.1, plan.settle + 1.6));
      const base = V.glyph || chars(V.x || '事').pop() || '事', see = V.see || '人';
      const views = plan.order.map((_, i) => i === plan.pick ? 'graph' : ((V.views && V.views[i]) || VIEW_ORDER[i % VIEW_ORDER.length]));
      ctx.save(); camera(lt, api, LCX, LCY, 0.012);
      // lenses: position, presence, focus (how centred)
      const Ls = plan.order.map((name, i) => {
        const x = LCX + (i - u) * LGAP, dx = Math.abs(x - LCX);
        const la = 1 - ease.inOut(prog(dx, LR * 1.6, LR * 3.6));
        const focus = ease.inOut(clamp(1 - dx / (LR * 1.1)));
        const R = LR * (i === plan.pick ? 1 + 0.08 * settleP : 1);
        return { name, i, x, la, focus, R, view: views[i], pick: i === plan.pick };
      });
      const inLens = (x, y) => { let s = 0; for (const l of Ls) if (l.la > 0) s = Math.max(s, l.la * clamp((l.R - 10 - Math.hypot(x - l.x, y - LCY)) / 36)); return s; };
      const appear = ease.out(prog(lt, 0.1, 1.4));

      // the pick's structure: faint lines of light between people
      const pk = Ls[plan.pick];
      if (pk && pk.focus > 0.3) {
        const k = pk.focus * (0.35 + 0.65 * settleP) * pk.la;
        S.edges.forEach(([a, b], n) => {
          const A = S.hex[a], B = S.hex[b], rgb = n >= 6 ? '239,233,220' : '233,196,122';
          segLine(LCX + A.x, LCY + A.y, LCX + B.x, LCY + B.y, k * (n >= 6 ? 0.22 : 0.4), rgb, 1.2);
        });
      }
      // background glyphs: far, soft; sharpen when a lens passes over them
      S.bg.forEach(p => {
        const x = LCX + p.x + Math.sin(lt * 0.22 + p.ph) * 7, y = LCY + p.y + Math.cos(lt * 0.18 + p.ph) * 5;
        const s = inLens(x, y), sz = q2(18 + p.d * 16), a = (0.1 + 0.2 * p.d) * appear;
        if (s < 1) L.glyph(base, x, y, sz, COOL, a * (1 - s), { blur: 2 + Math.round((1 - p.d) * 4) });
        if (s > 0) L.glyph(base, x, y, sz + 4, INK, (0.35 + 0.35 * p.d) * s * appear, { glow: 0 });
      });
      // lens bodies: a soft disc of light and a thin rim
      Ls.forEach(l => {
        if (l.la <= 0.003) return;
        L.light(l.x, LCY, l.R * 1.05, 'rgba(150,170,215,0.10)', l.la);
        if (l.pick) L.light(l.x, LCY, l.R * 1.5, 'rgba(233,196,122,0.16)', l.la * settleP);
        const a0 = ctx.globalAlpha; ctx.save(); ctx.globalAlpha = a0 * l.la * 0.26; ctx.strokeStyle = l.pick && settleP > 0.5 ? GOLD : INK; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(l.x, LCY, l.R, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = a0 * l.la * 0.55; ctx.lineWidth = 1.5; ctx.strokeStyle = INK;           // specular arc
        ctx.beginPath(); ctx.arc(l.x, LCY, l.R - 14, Math.PI * 1.08, Math.PI * 1.36); ctx.stroke();
        ctx.restore();
        // the discipline's name, under its lens
        const na = l.la * (0.35 + 0.65 * l.focus), ny = LCY + l.R + 74;
        if (l.pick && settleP > 0) {
          word(l.name, l.x, ny, { size: 52, color: INK, alpha: na * (1 - settleP), glow: 8, spacing: 12 });
          word(l.name, l.x, ny, { size: 52, color: GOLD, alpha: na * settleP, glow: 14, spacing: 12 });
        } else word(l.name, l.x, ny, { size: 52, color: INK, alpha: na, glow: 8, spacing: 12 });
      });
      // the thing itself: the same 24 glyphs, loose; a centred lens puts them in its own order
      S.actors.forEach((p, j) => {
        let x = LCX + p.x + Math.sin(lt * 0.3 + p.ph) * 4, y = LCY + p.y + Math.cos(lt * 0.26 + p.ph) * 4;
        let sharp = 0, ch2 = null, col = INK, size2 = 32, glow2 = 0;
        Ls.forEach(l => {
          if (l.focus <= 0) return;
          const tg = l.view === 'curve' ? S.curve[j] : l.view === 'loop' ? loopT(j, lt) : l.view === 'grid' ? S.grid[j] : S.graph[j];
          x = lerp(x, LCX + tg.x, l.focus); y = lerp(y, LCY + tg.y, l.focus);
          sharp = Math.max(sharp, l.focus * l.la);
          if (l.view === 'graph') {
            const node = S.graph[j].node;
            ch2 = node ? see : '·'; col = node ? (j % 2 ? TEAL : GOLD) : (j % 2 ? GOLD : TEAL);
            size2 = node ? 52 : 34; glow2 = node ? 12 : 6;
          } else if (l.view === 'loop') { col = INK; }
          else if (l.view === 'grid') { col = TEAL; }
        });
        const a = appear * (0.55 + 0.35 * p.d);
        const s = Math.max(sharp, inLens(x, y) * 0.8);
        if (s < 1) L.glyph(base, x, y, 32, COOL, a * 0.8 * (1 - s), { blur: 3 });
        if (s > 0) {
          const cf = ch2 ? ease.inOut(prog(s, 0.35, 0.8)) : 0;
          if (cf < 1) L.glyph(base, x, y, 32, col === TEAL || col === INK ? col : INK, a * s * (1 - cf), { glow: 4 });
          if (cf > 0) L.glyph(ch2, x, y, size2, col, s * cf, { glow: glow2 });
        }
      });
      ctx.restore();
      // the event, above: small spaced serif with two short lines of light
      if (V.x) {
        const f = ease.out(prog(lt, 0.3, 1.4)), ty = LCY - LR - 70;
        const tw = word(V.x, LCX, ty, { size: 32, color: DIM, alpha: f, glow: 0, spacing: 12, reveal: f });
        hLine(LCX - tw / 2 - 150, LCX - tw / 2 - 30, ty, f * 0.5);
        hLine(LCX + tw / 2 + 30, LCX + tw / 2 + 150, ty, f * 0.5);
      }
    },
    cues(V, api) {
      const plan = lensPlan(V, api);
      return [...plan.moves.map(m => ({ t: m.a, type: 'whoosh', dur: +(m.b - m.a).toFixed(2) })), { t: plan.settle + 0.1, type: 'pop' }];
    },
  });

  // =====================================================================
  // compare — a vertical line of light; the side being read comes forward
  // =====================================================================
  function splitKicker(t) { const p = String(t || '').split(/\s+·\s+/); return p.length > 1 ? { kicker: p[0], title: p.slice(1).join(' · ') } : { kicker: null, title: p[0] }; }
  function compareTimes(api) {
    const tOf = side => { const s = api.steps.find(s => s.show === side); return s ? s.lt : null; };
    let tl = tOf('left'), tr = tOf('right');
    if (tl == null) tl = 0.3;
    if (tr == null) tr = api.steps.length ? Infinity : Math.max(tl + 1.2, (api.line(1) || { start: 1.6 }).start);
    // "join": a later sentence that belongs to neither side (e.g. "都得可信") brings both sides back together
    const sideAt = api.steps.filter(s => (s.show === 'left' || s.show === 'right') && s.at != null).map(s => s.at);
    const lastAt = sideAt.length ? Math.max(...sideAt) : 1;
    let join = null;
    (api.beat.lines || []).forEach((l, k) => {
      if (join != null || k <= lastAt || api.steps.some(s => s.at === k)) return;
      const t = api.line(k).start; if (t > tr + 0.8) join = t;
    });
    return { left: tl, right: tr, join };
  }
  const CX_OFF = 440, KY = 468;
  let CC = null;
  function compareCloud() {
    if (CC) return CC;
    const r = rng(29), ps = []; let guard = 0;
    while (ps.length < 46 && guard++ < 5000) {
      const x = (r() - 0.5) * 820, y = (r() - 0.5) * 560;
      if ((x / 410) ** 2 + (y / 280) ** 2 > 1) continue;
      if (Math.abs(x) < 290 && y > -150 && y < 150) continue;          // keep the words clear
      if (ps.some(p => Math.hypot(p.x - x, p.y - y) < 52)) continue;
      ps.push({ x, y, d: r(), c: r(), ph: r() * 6.28 });
    }
    return (CC = ps);
  }
  function titleParts(t) { return String(t).split(/\s*↔\s*/); }
  T.register('compare', {
    draw(ctx_, V, lt, api) {
      const tm = compareTimes(api), t = api.beat.start + lt;
      const acc = L.accent(T.TL, t);
      let join = V.join;
      if (!join) join = /第一|之前|过去|before|旧|^1/i.test(String((V.left || {}).title)) ? 'arrow' : 'vs';
      const aL = ease.out(prog(lt, tm.left, tm.left + 1.2)), aR = ease.out(prog(lt, tm.right, tm.right + 1.2));
      const toR = ease.inOut(prog(lt, tm.right, tm.right + 1.4));          // focus moves to the right
      const jn = tm.join != null ? ease.inOut(prog(lt, tm.join, tm.join + 1.6)) : 0;
      const nearL = lerp(lerp(1, 0, toR), 0.8, jn), nearR = lerp(1, 0.8, jn);
      const words = [V.left, V.right].flatMap(c => [(c || {}).title || '', ...((c || {}).items || [])]).join('');
      L.field(lt, { n: 90, chars: chars(words.replace(/[\s·↔“”，、：:]/g, '')).join('') || '局', seed: 7 + api.beat.id.length, alpha: 0.07, color: COOL });
      ctx.save(); camera(lt, api, W / 2, 500, 0.01, lerp(0, -22, toR * (1 - jn)) + lerp(22, 0, aR) * aL);
      // each side stands in a shallow cloud of its own glyphs (texture + depth), fading with its focus
      const cl = compareCloud();
      [[V.left, aL, nearL, -1, 'left'], [V.right, aR, nearR, 1, 'right']].forEach(([c, a, near, sgn, side]) => {
        if (a <= 0 || !c) return;
        const pool = chars(String(c.title || '').replace(/[\s·↔]/g, '')); if (!pool.length) return;
        const x0 = W / 2 + sgn * CX_OFF, col = side === 'left' ? '#8fc9c0' : '#d9bf8c';
        cl.forEach(p => {
          const x = x0 + p.x + Math.sin(lt * 0.2 + p.ph) * 8, y = KY + 70 + p.y + Math.cos(lt * 0.17 + p.ph) * 6;
          if (Math.abs(x - W / 2) < 60) return;
          const al = a * (0.04 + 0.12 * p.d) * (0.35 + 0.65 * near);
          L.glyph(pool[Math.floor(p.c * pool.length) % pool.length], x, y, q2(18 + p.d * 20), col, al, { blur: 2 + Math.round((1 - p.d) * 4) });
        });
      });
      // the centre line of light
      const la = ease.inOut(prog(lt, Math.min(0.1, tm.left - 0.2), Math.min(0.1, tm.left - 0.2) + 1.6));
      const CY = KY + 50, half = 320 * la;
      vLine(W / 2, CY - half, CY + half, (0.35 + 0.25 * jn), '239,233,220', 1.2);
      if (jn > 0) {
        vLine(W / 2, CY - half * 1.05, CY + half * 1.05, jn * 0.7, '255,159,90', 1.5);
        L.light(W / 2, CY, 280, 'rgba(255,159,90,0.16)', jn);
      }
      // "arrow" join: one spark crosses from the first layer to the second, leaving nothing behind
      if (join === 'arrow' && aR > 0) {
        const k = ease.inOut(prog(lt, tm.right - 0.2, tm.right + 1.8)), env = Math.sin(Math.PI * k);
        const sx = lerp(W / 2 - 200, W / 2 + 200, k);
        hLine(sx - 160, sx + 20, KY, 0.55 * env, '233,196,122', 1.2);
        L.light(sx, KY, 18, 'rgba(255,220,150,0.9)', env);
      }
      [['left', V.left || {}, aL, nearL, -1], ['right', V.right || {}, aR, nearR, 1]].forEach(([side, c, a, near, sgn]) => {
        if (a <= 0) return;
        const x = W / 2 + sgn * CX_OFF, kt = splitKicker(c.title);
        const blur = Math.round((1 - near) * 3), sc = lerp(0.9, 1, near), al = a * lerp(0.36, 1, near);
        const tint = side === 'left' ? 'rgba(127,216,203,0.13)' : 'rgba(233,196,122,0.15)';
        L.light(x, KY + 40, 360, tint, a * near * near);
        ctx.save(); ctx.translate(x, KY); ctx.scale(sc, sc); ctx.translate(-x, -KY);
        if (kt.kicker) word(kt.kicker, x, KY - 92, { size: 30, color: side === 'left' ? TEAL : acc, alpha: al * 0.9, glow: 0, spacing: 10, blur, reveal: a });
        // title: "A ↔ B" becomes two words joined by a line of light with a shuttling spark
        const parts = titleParts(kt.title), tsz = chars(kt.title).length > 5 ? 64 : 76;
        if (parts.length === 2) {
          const w0 = measureW(parts[0], { size: tsz }), w1 = measureW(parts[1], { size: tsz }), gap = 150, tot = w0 + gap + w1;
          const x0 = x - tot / 2;
          word(parts[0], x0 + w0 / 2, KY, { size: tsz, alpha: al, glow: 12, blur, reveal: a });
          word(parts[1], x0 + w0 + gap + w1 / 2, KY, { size: tsz, alpha: al, glow: 12, blur, reveal: prog(a, 0.3, 1) });
          // exchange: two hairlines of light, a spark running each way (reads as ⇄, never as the glyph 一)
          const lx0 = x0 + w0 + 18, lx1 = x0 + w0 + gap - 18;
          hLine(lx0 - 8, lx1 + 8, KY - 7, al * 0.7, '239,233,220', 1.2);
          hLine(lx0 - 8, lx1 + 8, KY + 7, al * 0.7, '239,233,220', 1.2);
          const sp = (lt * 0.45 + (side === 'left' ? 0 : 0.5)) % 1, env = Math.sin(Math.PI * sp);
          L.light(lerp(lx0, lx1, sp), KY - 7, 9, 'rgba(255,236,200,0.95)', al * env);
          L.light(lerp(lx1, lx0, sp), KY + 7, 9, 'rgba(255,236,200,0.95)', al * env);
        } else word(kt.title, x, KY, { size: tsz, alpha: al, glow: 12, blur, reveal: a });
        // points, below: no bullets, just lines of quieter serif
        (c.items || []).forEach((it, k) => {
          const fi = ease.out(prog(lt, (side === 'left' ? tm.left : tm.right) + 0.6 + k * 0.45, (side === 'left' ? tm.left : tm.right) + 1.7 + k * 0.45));
          word(String(it), x, KY + 112 + k * 66, { size: 38, color: INK, alpha: al * fi * 0.72, glow: 0, blur, reveal: fi });
        });
        ctx.restore();
      });
      ctx.restore();
      drawNotes(api, lt, 820, 1);
    },
    cues(V, api) {
      const out = [];
      for (const s of api.steps) if (s.owner === api.beat.id && (s.show === 'left' || s.show === 'right')) out.push({ t: s.lt, type: 'tick' });
      if (!api.steps.length) { const tm = compareTimes(api); out.push({ t: tm.left, type: 'tick' }, { t: tm.right, type: 'tick' }); }
      return [...out, ...noteCues(api)];
    },
  });

  // =====================================================================
  // list — keywords on a slow arc, lit one at a time; the past recedes
  // =====================================================================
  function listTimes(V, api) {
    const n = (V.items || []).length;
    return showTimes(n, api, 0.9) || autoTimes(n, api, V.items);
  }
  function emphasis(ts, i, lt) {
    const ti = ts[i]; if (!(lt >= ti)) return 0;
    const later = ts.filter(t => isFinite(t) && t > ti).sort((a, b) => a - b)[0];
    const on = ease.inOut(prog(lt, ti, ti + 1.0));
    const off = later != null ? ease.inOut(prog(lt, later, later + 1.1)) : ease.inOut(prog(lt, ti + 3.4, ti + 4.8));
    return on * (1 - off);
  }
  function listLayout(V) {
    const items = V.items || [], n = items.length;
    const rows = n <= 5 ? 1 : 2, perRow = Math.ceil(n / rows);
    const S = Math.min(420, 1480 / Math.max(1, perRow - 1));
    const longest = Math.max(1, ...items.map(it => measureW(it.title || '', { size: 92 })));
    const fit = Math.min(1, (S * 0.92) / longest);                        // active word must fit its slot
    const hasDesc = items.some(it => it.desc), hasEn = items.some(it => it.en);
    const y0 = rows === 1 ? (hasDesc ? 450 : 470) : 380;
    const pos = items.map((_, i) => {
      const r = Math.floor(i / perRow), c = i % perRow, m = Math.min(perRow, n - r * perRow);
      const u = m > 1 ? (c - (m - 1) / 2) / ((m - 1) / 2) : 0;
      return { x: 960 + (c - (m - 1) / 2) * S, y: y0 + r * 280 - 34 * (1 - u * u) + 34 };
    });
    return { n, S, fit, pos, hasDesc, hasEn };
  }
  T.register('list', {
    draw(ctx_, V, lt, api) {
      const t = api.beat.start + lt, acc = L.accent(T.TL, t);
      const items = V.items || [], ts = listTimes(V, api), Lo = listLayout(V);
      const fin = ts.filter(isFinite), last = fin.length ? Math.max(...fin) : 0;
      const allShown = fin.length === items.length;
      const sum = allShown ? ease.inOut(prog(lt, last + 3.4, last + 4.8)) : 0;   // everything comes back together
      L.field(lt, { n: 80, chars: items.map(it => it.title || '').join('') || '局', seed: 17 + api.beat.id.length, alpha: 0.07, color: COOL });
      // title: a small spaced label, not a header
      if (V.title) {
        const f = ease.out(prog(lt, 0.1, 1.3));
        const tw = word(V.title, 960, 214, { size: 30, color: acc, alpha: f * 0.85, glow: 0, spacing: 14, reveal: f });
        hLine(960 - tw / 2 - 30 - 120 * f, 960 - tw / 2 - 30, 214, f * 0.35);
        hLine(960 + tw / 2 + 30, 960 + tw / 2 + 30 + 120 * f, 214, f * 0.35);
      }
      // camera leans toward whatever is lit
      let lean = 0, wsum = 0;
      items.forEach((_, i) => { const e = emphasis(ts, i, lt); lean += (Lo.pos[i].x - 960) * e; wsum += e; });
      const dx = -0.28 * (wsum > 0 ? lean / Math.max(1, wsum) : 0) * (1 - sum);
      ctx.save(); camera(lt, api, 960, 500, 0.01, dx);
      items.forEach((it, i) => {
        const p = Lo.pos[i], ti = ts[i];
        const e = emphasis(ts, i, lt) * (1 - sum), f = ease.out(prog(lt, ti, ti + 1.2));
        // before its turn: a point of light marks the place (the structure is visible first)
        const ghostIn = ease.out(prog(lt, 0.3 + i * 0.35, 1.5 + i * 0.35)) * (1 - f);
        if (ghostIn > 0) {
          L.light(p.x, p.y, 22, 'rgba(239,233,220,0.5)', ghostIn * 0.7);
          word(String(i + 1).padStart(2, '0'), p.x, p.y - 64, { size: 26, family: F.mono, color: DIM, alpha: ghostIn * 0.6, glow: 0, spacing: 4 });
        }
        if (f <= 0) return;
        const sc = Lo.fit * lerp(lerp(0.56, 0.76, sum), 1, e);
        const past = 1 - e;                                               // shown and not lit → far away
        const blur = Math.round(3 * past * (1 - sum));
        const y = p.y - 30 * past * (1 - sum);
        const al = f * lerp(lerp(0.34, 0.9, sum), 1, e);
        if (e > 0) {
          L.light(p.x, y, 340, 'rgba(255,190,120,0.2)', e);
          // the lit word stands in a shallow cloud of its own glyphs
          const pool = chars(String(it.title || '').replace(/[\s·]/g, ''));
          if (pool.length) compareCloud().forEach(c => {
            const gx = p.x + c.x * 0.8 + Math.sin(lt * 0.2 + c.ph) * 8, gy = y + 40 + c.y * 0.7 + Math.cos(lt * 0.17 + c.ph) * 6;
            L.glyph(pool[Math.floor(c.c * pool.length) % pool.length], gx, gy, q2(18 + c.d * 20), '#d9bf8c', e * (0.05 + 0.13 * c.d), { blur: 2 + Math.round((1 - c.d) * 4) });
          });
        }
        const half = 92 * sc * 0.5;
        word(String(i + 1).padStart(2, '0'), p.x, y - half - 34, { size: 26, family: F.mono, color: e > 0.5 ? acc : DIM, alpha: al * lerp(0.6, 1, e), glow: 0, spacing: 4, blur });
        word(it.title || '', p.x, y, { size: 92, scale: sc, color: INK, alpha: al, glow: 12, blur, reveal: f });
        let yy = y + half + 38;
        if (it.en) { word(String(it.en).toUpperCase(), p.x, yy, { size: 26, family: F.mono, color: DIM, alpha: al * 0.9, glow: 0, spacing: 6, blur }); yy += 50; }
        if (it.desc) {
          const k = Math.max(e, sum);
          const rows = split2(trimEnd(it.desc), Lo.S * (e > sum ? 1.7 : 0.95), { size: 38 });
          const dsz = e > sum ? 38 : 30;
          rows.forEach((r, j) => word(r, p.x, yy + 14 + j * dsz * 1.45, { size: dsz, color: INK, alpha: k * 0.62, glow: 0, reveal: ease.out(prog(lt, ti + 0.5, ti + 1.8)) }));
        }
      });
      ctx.restore();
    },
    cues(V, api) { return listTimes(V, api).filter(x => isFinite(x)).map(x => ({ t: x, type: 'tick' })); },
  });

  // =====================================================================
  // statement — one phrase at the focal point; glyphs drift in toward it
  // =====================================================================
  function stmtTimes(V, api) {
    const l0 = api.line(0), tText = Math.max(0.25, (l0 ? l0.start : 0.45) - 0.1);
    const nC = chars(V.text).length, rd = Math.min(2.4, 0.6 + nC * 0.08), tDone = tText + rd;
    let tHl = null;
    for (const w of V.highlight || []) { const t = wordTime(api, w); if (t != null) tHl = tHl == null ? t : Math.min(tHl, t); }
    if (tHl == null) tHl = tDone + 0.8;
    tHl = Math.max(tHl, tDone - 0.2);
    return { tText, rd, tDone, tHl };
  }
  let ST = null;
  function inflow() {                      // spiral streams: glyphs flow along a few arms toward the centre
    if (ST) return ST;
    const r = rng(93), ps = [], arms = 9;
    for (let k = 0; k < arms; k++) {
      const a0 = k / arms * Math.PI * 2 + (r() - 0.5) * 0.4;
      for (let j = 0; j < 13; j++) ps.push({ a: a0 + (r() - 0.5) * 0.12, ph: (j + r() * 0.6) / 13, d: r(), c: r(), off: (r() - 0.5) * 40 });
    }
    return (ST = ps);
  }
  T.register('statement', {
    draw(ctx_, V, lt, api) {
      const t = api.beat.start + lt, acc = L.accent(T.TL, t);
      const { tText, rd, tHl } = stmtTimes(V, api);
      const str = trimEnd(V.text), n = chars(str).length;
      const size = V.size || (n <= 6 ? 92 : n <= 14 ? 76 : 64);
      const lines = split2(str, 1440, { size });
      const finals = api.steps.filter(s => s.final != null), fs = finals[finals.length - 1], replace = V.finalMode === 'replace';
      const fp = fs ? ease.inOut(prog(lt, fs.lt, fs.lt + 1.4)) : 0;
      const cy = lerp(480, replace ? 480 : 380, fp), hk = ease.inOut(prog(lt, tHl, tHl + 1.2));
      // glyphs of the phrase drift in from depth toward the focal point and dissolve before reaching it
      const pool = chars(str.replace(/[\s，。、：；？！]/g, '')) || ['点'];
      const ain = ease.out(prog(lt, 0, 1.5));
      inflow().forEach(p => {
        const cyc = (p.ph + lt * 0.03) % 1;                          // 0 far out → 1 arrived
        const rr = lerp(1.08, 0.36, cyc), ang = p.a + 0.9 * cyc;       // the arm curls in as it nears the centre
        const x = W / 2 + Math.cos(ang) * 880 * rr + p.off * Math.sin(ang), y = cy + Math.sin(ang) * 400 * rr;
        if (y < 150 || y > 880) return;
        const depth = (0.3 + 0.7 * p.d) * lerp(1, 0.55, cyc);         // smaller and softer as they approach
        const a = Math.pow(Math.sin(Math.PI * cyc), 1.2) * (0.08 + 0.22 * p.d) * ain * (1 - 0.5 * fp);
        L.glyph(pool[Math.floor(p.c * pool.length) % pool.length], x, y, q2(14 + depth * 26), COOL, a, { blur: 1 + Math.round((1 - depth) * 5) });
      });
      L.light(W / 2, cy, 460, 'rgba(255,170,100,0.15)', hk);
      ctx.save(); camera(lt, api, W / 2, cy, 0.014);
      const mainA = replace ? 1 - fp : lerp(1, 0.5, fp), mainS = replace ? 1 : lerp(1, 0.8, fp), mainB = replace ? 0 : Math.round(fp * 2);
      const lh = size * 1.4, top = cy - (lines.length - 1) * lh / 2;
      if (V.label) {
        const f = ease.out(prog(lt, tText - 0.2, tText + 1.0));
        word(String(V.label).toUpperCase(), W / 2, top - size * 0.5 * mainS - 58, { size: 26, family: F.mono, color: acc, alpha: f * mainA * 0.9, glow: 0, spacing: 10, reveal: f });
      }
      let done = 0;
      lines.forEach((l, k) => {
        const rn = chars(l).length, rev = clamp((prog(lt, tText, tText + rd) * n - done) / rn);
        word(l, W / 2, top + k * lh * mainS, { size, scale: mainS, color: INK, alpha: mainA, glow: 14, blur: mainB, reveal: rev, hi: V.highlight, hiK: hk, hiColor: EMBER });
        done += rn;
      });
      // a line of light settles under the phrase once it is read
      const ul = ease.inOut(prog(lt, tHl + 0.3, tHl + 1.8)), uy = top + (lines.length - 1) * lh * mainS + size * 0.78 * mainS;
      hLine(W / 2 - 240 * ul, W / 2 + 240 * ul, uy, ul * 0.7 * mainA, '255,180,110', 1.5);
      ctx.restore();
      drawNotes(api, lt, uy + 90, lerp(1, 0.7, fp));
      if (fs && fp > 0) {
        const fl = split2(trimEnd(fs.final), 1440, { size: 62 }), f = ease.out(prog(lt, fs.lt + 0.3, fs.lt + 1.8));
        const fy = replace ? cy : 560;
        fl.forEach((l, k) => word(l, W / 2, fy + (k - (fl.length - 1) / 2) * 88, { size: 62, color: INK, alpha: f, glow: 12, reveal: f }));
      }
    },
    cues(V, api) {
      const { tHl } = stmtTimes(V, api), out = [];
      if (V.highlight && V.highlight.length) out.push({ t: tHl, type: 'pop' });
      for (const s of api.steps) if (s.owner === api.beat.id) {
        if (s.note != null) out.push({ t: s.lt, type: 'tick' });
        if (s.final != null) out.push({ t: s.lt, type: 'chime' });
      }
      return out;
    },
  });
})();
