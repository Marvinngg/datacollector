/* v3: cards, timeline, knowledge_tree, endcard (override the v2 registrations in basic.js / basic2.js).
 * No panels, no boxes: keywords are serif light in a scene with depth.
 * - cards:          the current keyword burns at the centre; the ones already said recede into a far arc (small, dim, soft)
 * - timeline:       a horizontal line of light, the camera tracks along it from milestone to milestone
 * - knowledge_tree: a fan-shaped tree of light grows from the root word; leaves are words at the tips; a pulse of light
 *                   runs from the root through every branch at the end
 * - endcard:        title in serif light over a slow glyph field, then black
 * Every template multiplies its alphas by the beat envelope (ctx.globalAlpha on entry), because L.glyph / L.light
 * set globalAlpha themselves. All timing comes from api.steps, api.beat.lines and api.dur (never sentence indices). */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng } = K;
  const INK = '#efe9dc', GOLD = '#e9c47a', TEAL = '#7fd8cb', EMBER = '#ff9f5a', OK = '#9fe0a0', WARM = '#f2c98a';
  const DESC = 'rgba(239,233,220,0.62)';
  const chars = s => [...String(s == null ? '' : s)];
  const memo = (() => { const m = new Map(); return (k, f) => (m.has(k) ? m.get(k) : (m.set(k, f()), m.get(k))); })();
  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { if (!h.startsWith('#')) return h; const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const evenSize = s => Math.max(2, Math.round(s / 2) * 2);

  // ---------------- serif text with a base blur (depth) on top of the blur-to-sharp reveal ----------------
  function word(str, x, y, o = {}) {
    const size = evenSize(o.size || 56), color = o.color || INK, fam = o.family || F.serif, wt = o.weight || 400;
    const align = o.align || 'center', alpha = o.alpha == null ? 1 : o.alpha, glow = o.glow == null ? 8 : Math.round(o.glow);
    const reveal = o.reveal == null ? 1 : o.reveal, base = Math.round(o.blur || 0), sp = o.spacing == null ? size * 0.06 : o.spacing;
    if (alpha <= 0.003 || reveal <= 0) return;
    const cs = chars(str);
    ctx.save(); ctx.font = `${wt} ${size}px ${fam}`;
    const ws = cs.map(ch => ctx.measureText(ch).width + sp); ctx.restore();
    const total = ws.reduce((a, b) => a + b, 0) - sp;
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    cs.forEach((ch, i) => {
      const p = clamp(reveal * (cs.length + 3) - i, 0, 3) / 3;
      if (p > 0 && ch !== ' ') {
        const e = ease.out(p), rb = Math.round((1 - e) * 8), bl = Math.max(rb, base);
        L.glyph(ch, cx + ws[i] / 2 - sp / 2, y, size, color, alpha * e, { family: fam, weight: wt, blur: bl, glow: base ? 0 : glow });
      }
      cx += ws[i];
    });
  }
  const wordW = (str, size, o = {}) => L.measureSerif(str, evenSize(size), o);
  // a 1–1.5 px line of light that fades out at both ends
  function beam(x0, y0, x1, y1, color, alpha, width = 1.5) {
    if (alpha <= 0.003) return;
    ctx.save(); ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.5, rgba(color, 1)); g.addColorStop(1, rgba(color, 0));
    ctx.strokeStyle = g; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
  }
  // soft additive light from a cached sprite (same look as L.light, no gradient per call)
  const sparkC = new Map();
  function spark(x, y, r, color, alpha = 1) {
    if (alpha <= 0.003 || r <= 0) return;
    let c = sparkC.get(color);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      sparkC.set(color, c);
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(c, x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  // split a long string into rows at punctuation near the middle
  function rowsOf(str, size, maxW, fam) {
    str = String(str || '');
    if (wordW(str, size, { family: fam }) <= maxW) return [str];
    const cs = chars(str), mid = cs.length / 2; let cut = -1, best = 1e9;
    cs.forEach((c, k) => { if ('，；：、。？,'.includes(c) && Math.abs(k + 1 - mid) < best && k < cs.length - 1) { best = Math.abs(k + 1 - mid); cut = k + 1; } });
    if (cut < 0) cut = Math.ceil(mid);
    return [cs.slice(0, cut).join(''), cs.slice(cut).join('')];
  }
  const glyphsOf = s => chars(String(s).replace(/[，。：；、？！“”…·\s\-0-9A-Za-z「」《》]/g, '')).join('') || '局';

  // ---------------- timing helpers (same semantics as basic.js) ----------------
  const narration = api => (api.beat.lines || []).map((l, k) => ({ text: l.text, ...api.line(k) }));
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
    for (let i = 0; i < n; i++) { const a = anchorTime(api, items[i].title || items[i].name || '', last + 0.4); if (a != null && a > last + 0.4) { t[i] = a; last = a; } }
    if (t[0] == null) t[0] = s; else t[0] = Math.max(0.3, Math.min(t[0], s + 0.2));
    for (let i = 1; i < n; i++) {
      if (t[i] != null) continue;
      let j = i; while (j < n && t[j] == null) j++;
      const a = t[i - 1], b = j < n ? t[j] : Math.max(a + 0.9 * (j - i + 1), end);
      for (let k = i; k < j; k++) t[k] = lerp(a, b, (k - i + 1) / (j - i + 1));
    }
    for (let i = 1; i < n; i++) t[i] = Math.max(t[i], t[i - 1] + 0.6);
    return t;
  }
  function showTimes(n, api, defStagger) {
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
  function itemTimes(V, api, key, defStagger) {
    const items = V.items || [], n = items.length;
    return showTimes(n, api, defStagger) || autoTimes(n, api, items.map(it => ({ title: it[key] || it.title || it.name || '' })));
  }
  // for each item: the time the next item (in time order) lights up
  function nextTimes(ts) {
    return ts.map(t => { let b = Infinity; for (const u of ts) if (u > t + 1e-6 && u < b) b = u; return isFinite(t) ? b : Infinity; });
  }
  function notes(api, lt) {
    const ns = api.steps.filter(s => s.note != null), out = [];
    ns.forEach((s, i) => {
      const nx = ns[i + 1], a = Math.min(ease.out(prog(lt, s.lt, s.lt + 0.9)), nx ? 1 - ease.in(prog(lt, nx.lt - 0.4, nx.lt)) : 1);
      if (a > 0) out.push({ text: s.note, a, lt: s.lt });
    });
    return out;
  }
  const noteCues = api => api.steps.filter(s => s.note != null && s.owner === api.beat.id).map(s => ({ t: s.lt, type: 'pop' }));

  // =====================================================================
  // cards — keywords on a slowly turning ring in depth. The one at the front is lit (large, sharp, warm light
  // behind it, desc underneath); the ones already said turn away to the back of the ring (small, dim, soft);
  // the ones still to come wait on the ring as points of light.
  // =====================================================================
  const CD = { titleY: 176, cx: 960, cy: 398, rx: 610, ry: 150, idxY: 468, kwY: 548, beamY: 612, descY: 664, descLH: 54, noteY: 808, kw: 80 };
  function cardsLayout(V) {
    const items = V.items || [];
    return memo('cards|' + JSON.stringify(items), () => {
      const r = rng(items.length * 31 + 7);
      return {
        items: items.map(it => {
          const title = String(it.title || ''), kw = evenSize(Math.min(CD.kw, 80 * 1480 / Math.max(1, wordW(title, 80))));
          return { title, kw, w: wordW(title, kw), desc: rowsOf(it.desc || '', 38, 1400), ph: r() * 6.28 };
        }),
        field: glyphsOf(items.map(it => it.title).join('')),
      };
    });
  }
  // ring position of item i for a continuous focus index f (item f sits at the front)
  function ringPos(i, f, n) {
    const phi = Math.PI / 2 - (i - f) * (Math.PI * 2 / Math.max(n, 2));
    const d = (Math.sin(phi) + 1) / 2;                                   // depth: 1 front … 0 back
    return { x: CD.cx + CD.rx * Math.cos(phi), y: CD.cy + CD.ry * Math.sin(phi), d, phi };
  }
  function cardsFocus(ts, lt) {
    let f = 0;
    const ord = ts.map((t, i) => ({ t, i })).filter(o => isFinite(o.t)).sort((a, b) => a.t - b.t);
    ord.forEach((o, k) => { if (k > 0) f += ease.inOut(prog(lt, o.t - 0.25, o.t + 1.35)); });
    return { f, ord };
  }
  T.register('cards', {
    draw(ctx_, V, lt, api) {
      const ENV = ctx.globalAlpha, Lc = cardsLayout(V), n = Lc.items.length; if (!n) return;
      const ts = itemTimes(V, api, 'title', 0.5), nx = nextTimes(ts);
      const t = api.beat.start + lt, acc = L.accent(T.TL, t);
      const { f, ord } = cardsFocus(ts, lt);
      // ring slot of an item = its rank in lighting order (so show-steps in any order still turn the ring one way)
      const rank = new Array(n).fill(0); let nr = ord.length; ord.forEach((o, k) => { rank[o.i] = k; });
      ts.forEach((x, i) => { if (!isFinite(x)) rank[i] = nr++; });
      const lit = ord.map(o => o.t), tLast = lit.length ? lit[lit.length - 1] : 0;
      const tail = ease.inOut(prog(lt, tLast + 3.5, tLast + 5.5));
      ctx.save(); ctx.globalAlpha = 1;
      const zs = 1 + 0.0025 * lt; ctx.translate(960, 520); ctx.scale(zs, zs); ctx.translate(-960, -520);
      L.field(lt, { n: 110, chars: Lc.field, seed: 17 + n, alpha: 0.095 * ENV, color: '#b9c4cf' });
      // the heading sits with the index just above the lit word: 「heading · 03」
      const hw = V.title ? wordW(V.title, 28, { spacing: 8 }) : 0, iw = wordW('00', 26, { family: F.mono, spacing: 8 }), gapW = V.title ? 56 : 0;
      const hx0 = 960 - (hw + gapW + iw) / 2, ixc = hx0 + hw + gapW + iw / 2;
      if (V.title) {
        word(V.title, hx0, CD.idxY, { size: 28, color: 'rgba(239,233,220,0.58)', glow: 0, spacing: 8, align: 'left', alpha: ENV, reveal: prog(lt, 0.1, 1.3) });
        L.glyph('·', hx0 + hw + gapW / 2, CD.idxY, 28, INK, ENV * 0.4 * prog(lt, 0.8, 1.4));
      }
      // the orbit: a faint ring of points that turns with the keywords
      const ringA = ENV * ease.out(prog(lt, 0.1, 1.6));
      const off = f * Math.PI * 2 / Math.max(n, 2);
      const fi = ord.length ? ord[clamp(Math.round(f), 0, ord.length - 1)].i : 0, frontHalf = Lc.items[fi].w / 2 + 40;
      ctx.save();
      for (let k = 0; k < 150; k++) {
        const phi = k / 150 * Math.PI * 2 + off, d = (Math.sin(phi) + 1) / 2;
        const rx_ = CD.cx + CD.rx * Math.cos(phi), gapK = d > 0.7 ? clamp((Math.abs(rx_ - 960) - frontHalf) / 80) : 1;   // the ring passes behind the lit word, not through it
        ctx.globalAlpha = ringA * (0.05 + 0.20 * d * d) * gapK;
        ctx.fillStyle = INK;
        const s = 1 + 1.2 * d;
        ctx.fillRect(CD.cx + CD.rx * Math.cos(phi) - s / 2, CD.cy + CD.ry * Math.sin(phi) - s / 2, s, s);
      }
      ctx.restore();
      // back to front
      const vis = Lc.items.map((it, i) => ({ it, i, p: ringPos(rank[i], f, n) })).sort((a, b) => a.p.d - b.p.d);
      for (const { it, i, p } of vis) {
        const t0 = ts[i], litP = isFinite(t0) ? ease.out(prog(lt, t0, t0 + 1.1)) : 0;
        const front = Math.pow(clamp((p.d - 0.82) / 0.18), 1.5);           // 1 only near the front of the ring
        const sc = lerp(0.34, 1, p.d * p.d);
        const w = it.w * sc, x = clamp(p.x + Math.sin(lt * 0.25 + it.ph) * 4 * (1 - front), 150 + w / 2, 1770 - w / 2);
        const y = p.y;
        // unlit: a seed of light on the ring
        spark(x, y, 10 + 10 * p.d, 'rgba(239,233,220,0.55)', ENV * ringA * (1 - litP) * (0.3 + 0.6 * p.d));
        if (litP <= 0) continue;
        const on = litP * front;
        if (on > 0) {
          spark(960, CD.kwY, 380 + 120 * litP, rgba(acc, 0.17), ENV * on);
        }
        const rev = prog(lt, t0, t0 + Math.min(1.5, 0.45 + chars(it.title).length * 0.08));
        if (front > 0.5) {
          const sp = Math.sin(Math.PI * clamp(rev * 1.15));
          if (sp > 0.01) spark(960 - it.w / 2 + it.w * clamp(rev * 1.15), CD.kwY, 70, 'rgba(255,214,150,0.55)', ENV * sp);
        }
        const far = 1 - front;
        const al = ENV * (0.25 + 0.75 * litP) * lerp(lerp(0.16, 0.58, p.d) * lerp(1, 1.3, tail), 1, front);
        ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
        word(it.title, 0, 0, { size: it.kw, color: INK, glow: front > 0.5 ? 12 : 0, blur: Math.round(far * (1 - p.d) * 5 + far * 1), alpha: al, reveal: rev });
        ctx.restore();
        const fa = ENV * litP * clamp((front - 0.55) / 0.45);
        if (fa > 0.003) {
          word(String(i + 1).padStart(2, '0'), ixc, CD.idxY, { size: 26, family: F.mono, color: acc, glow: 0, spacing: 8, alpha: fa * 0.9, reveal: prog(lt, t0 + 0.2, t0 + 0.8) });
          const bw = 240 * ease.inOut(prog(lt, t0 + 0.4, t0 + 1.6));
          beam(960 - bw, CD.beamY, 960 + bw, CD.beamY, acc, fa * 0.6, 1.2);
          it.desc.forEach((d, r) => word(d, 960, CD.descY + r * CD.descLH, { size: 38, color: DESC, glow: 0, alpha: fa, reveal: prog(lt, t0 + 0.55 + r * 0.4, t0 + 1.7 + r * 0.4) }));
        }
      }
      for (const nt of notes(api, lt)) {
        spark(960, CD.noteY, 220, rgba(EMBER, 0.12), ENV * nt.a);
        word(nt.text, 960, CD.noteY, { size: 40, color: EMBER, glow: 10, alpha: ENV * nt.a, reveal: prog(lt, nt.lt, nt.lt + 1.2) });
      }
      ctx.restore();
    },
    cues(V, api) {
      const ts = itemTimes(V, api, 'title', 0.5);
      return [...ts.filter(x => isFinite(x)).map(x => ({ t: x, type: 'tick' })), ...noteCues(api)];
    },
  });

  // =====================================================================
  // timeline — a line of light; the camera tracks along it
  // =====================================================================
  const TLN = { y: 506, yearY: 404, nameY: 604, descY: 684, S: 540, track: 0.5 };
  T.register('timeline', {
    draw(ctx_, V, lt, api) {
      const ENV = ctx.globalAlpha, items = V.items || [], n = items.length; if (!n) return;
      const t = api.beat.start + lt, acc = L.accent(T.TL, t);
      const ts = itemTimes(V, api, 'name', 1.5), nx = nextTimes(ts);
      const S = n > 1 ? Math.min(TLN.S, 2400 / (n - 1)) : 0, xs = items.map((_, i) => i * S), mid = (xs[0] + xs[n - 1]) / 2;
      // focus: continuous index -1 (overview) … n-1
      let f = -1; ts.forEach(x => { if (isFinite(x)) f += ease.inOut(prog(lt, x - 0.4, x + 1.4)); });
      f = clamp(f, -1, n - 1);
      const fx = f < 0 ? lerp(mid, lerp(mid, xs[0], TLN.track), f + 1) : lerp(mid, lerp(xs[Math.floor(f)], xs[Math.min(n - 1, Math.floor(f) + 1)], f - Math.floor(f)), TLN.track);
      const sx = wx => 960 + (wx - fx);
      const edge = x => clamp((x - 40) / 280) * clamp((1880 - x) / 280);
      ctx.save(); ctx.globalAlpha = 1;
      L.field(lt, { n: 60, chars: glyphsOf(items.map(it => (it.name || '') + (it.desc || '')).join('')), seed: 41, alpha: 0.06 * ENV, color: '#c8bfa8' });
      if (V.title) word(V.title, 960, 184, { size: 30, color: 'rgba(239,233,220,0.55)', glow: 0, spacing: 10, alpha: ENV, reveal: prog(lt, 0.1, 1.3) });
      // the line itself: draws in from the left, fades at the frame edges
      const ap = ease.inOut(prog(lt, 0.15, 1.9));
      beam(0, TLN.y, 1920 * ap * 2, TLN.y, INK, ENV * 0.30 * ap, 1.2);
      // lit part: from the far left to the head (focus position in world space)
      const headW = f < 0 ? xs[0] + 420 * f : lerp(xs[Math.floor(f)], xs[Math.min(n - 1, Math.floor(f) + 1)], f - Math.floor(f));
      const hx = sx(headW);
      if (f > -1) {
        ctx.save(); ctx.globalAlpha = ENV * 0.8 * clamp(f + 1);
        const g = ctx.createLinearGradient(hx - 900, 0, hx, 0);
        g.addColorStop(0, rgba(acc, 0)); g.addColorStop(1, rgba(acc, 0.9));
        ctx.fillStyle = g; ctx.fillRect(hx - 900, TLN.y - 0.75, 900, 1.5); ctx.restore();
        const moving = ts.some(x => isFinite(x) && lt > x - 0.4 && lt < x + 1.4);
        spark(hx, TLN.y, moving ? 60 : 36, 'rgba(255,214,150,0.7)', ENV * clamp(f + 1) * (moving ? 0.9 : 0.5));
      }
      items.forEach((it, i) => {
        const x = sx(xs[i]), ea = edge(x); if (ea <= 0) return;
        const t0 = ts[i], litP = isFinite(t0) ? ease.out(prog(lt, t0, t0 + 1.0)) : 0;
        const k = isFinite(nx[i]) ? ease.inOut(prog(lt, nx[i] - 0.2, nx[i] + 1.2)) : 0;   // 0 current … 1 past
        const cur = litP * (1 - k);
        // node: a point of light (dim seed before it is reached)
        const na = ENV * ea * ap;
        spark(x, TLN.y, 16, 'rgba(239,233,220,0.5)', na * (1 - litP) * 0.6);
        if (litP > 0) {
          spark(x, TLN.y, lerp(20, 44, cur), rgba(acc, 0.95), na * litP * lerp(0.55, 1, cur));
          spark(x, TLN.y - 40, 330, rgba(acc, 0.12), na * cur);
        }
        // milestones still ahead: their years wait far away, soft and dim
        if (litP < 1) word(String(it.year || ''), x, TLN.yearY + 10, { size: 44, family: F.mono, weight: 300, color: INK, glow: 0, blur: 3, spacing: 6, alpha: ENV * ea * 0.16 * ease.out(prog(lt, 0.8 + i * 0.25, 2.0 + i * 0.25)) * (1 - litP) });
        if (litP <= 0) return;
        const a = ENV * ea * litP * lerp(0.42, 1, 1 - k);
        const bl = Math.round(k * 2);
        const yr = String(it.year || '');
        ctx.save(); ctx.translate(x, TLN.yearY); ctx.scale(lerp(1, 0.66, k), lerp(1, 0.66, k));
        word(yr, 0, 0, { size: 66, family: F.mono, weight: 300, color: cur > 0.5 ? rgba(acc, 1) : INK, glow: k > 0.5 ? 0 : 12, blur: bl, alpha: a, spacing: 6, reveal: prog(lt, t0, t0 + 0.9) });
        ctx.restore();
        ctx.save(); ctx.translate(x, TLN.nameY); ctx.scale(lerp(1, 0.7, k), lerp(1, 0.7, k));
        word(it.name || '', 0, 0, { size: 60, color: INK, glow: k > 0.5 ? 0 : 10, blur: bl, alpha: a, reveal: prog(lt, t0 + 0.25, t0 + 1.3) });
        ctx.restore();
        const da = ENV * ea * litP * lerp(1, 0.0, clamp(k * 1.6));
        if (it.desc && da > 0.003) {
          const parts = String(it.desc).split(/\s+·\s+/);
          parts.forEach((p, r) => word(p, x, TLN.descY + r * 50, { size: 38, color: DESC, glow: 0, alpha: da, reveal: prog(lt, t0 + 0.7 + r * 0.3, t0 + 1.7 + r * 0.3) }));
        }
      });
      ctx.restore();
    },
    cues(V, api) {
      const ts = itemTimes(V, api, 'name', 1.5);
      return ts.filter(x => isFinite(x)).map(x => ({ t: x, type: 'tick' }));
    },
  });

  // =====================================================================
  // knowledge_tree — a fan-shaped tree of light and words
  // =====================================================================
  const KT = { root: [960, 842], fork: [960, 716], ax: 1.42, rB: 238, top: 176, left: 180, right: 1740 };
  const KT_COL = [TEAL, GOLD, WARM, OK, EMBER];
  const KT_NAMED = { gold: GOLD, teal: TEAL, ember: EMBER, ok: OK, warm: WARM, ink: INK, red: '#e0705f' };
  function bez(p0, p1, p2, p3, n = 36) {
    const out = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
    return out;
  }
  const at = (pts, p) => { const f = clamp(p) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), r = f - i; return [lerp(pts[i][0], pts[i + 1][0], r), lerp(pts[i][1], pts[i + 1][1], r)]; };
  function stroke(pts, p, color, alpha, width) {
    if (p <= 0 || alpha <= 0.003) return;
    const m = (pts.length - 1) * clamp(p), mi = Math.floor(m);
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= mi; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (mi < pts.length - 1) { const q = at(pts, p); ctx.lineTo(q[0], q[1]); }
    ctx.stroke(); ctx.restore();
  }
  function ktLayout(V) {
    const bs = V.branches || [];
    return memo('kt|' + JSON.stringify(bs), () => {
      const n = bs.length, F0 = KT.fork, r = rng(97 + n);
      // every leaf gets a place on one fan (left-bottom → top → right-bottom), in branch order, with a small gap
      // between branches; a branch points at the middle of its own leaves, so twigs never cross another branch
      const ph0 = 188 * Math.PI / 180, ph1 = 352 * Math.PI / 180;
      const slots = []; bs.forEach((b, i) => { (b.leaves || []).forEach((_, j) => slots.push({ i, j })); });
      const N = slots.length, G = 0.8, units = Math.max(1, N + G * (n - 1));
      let u = 0; slots.forEach((sl, k) => { if (k && sl.i !== slots[k - 1].i) u += G; sl.ph = lerp(ph0, ph1, (u + 0.5) / units); u += 1; });
      const branches = bs.map((b, i) => {
        const mine = slots.filter(sl => sl.i === i);
        const th = mine.length ? mine.reduce((a, sl) => a + sl.ph, 0) / mine.length : (n > 1 ? lerp(ph0, ph1, i / (n - 1)) : Math.PI * 1.5);
        const B = [F0[0] + Math.cos(th) * KT.rB * KT.ax, F0[1] + Math.sin(th) * KT.rB];
        const col = KT_NAMED[b.color] || KT_COL[i % KT_COL.length];
        const limb = bez(F0, [F0[0] + Math.cos(th) * 40, F0[1] - 60], [lerp(F0[0], B[0], 0.7), lerp(F0[1], B[1], 0.35) - 30], B);
        return { name: String(b.name || ''), th, B, col, limb, leaves: (b.leaves || []).map(String) };
      });
      const leaves = slots.map(sl => {
        const name = String(bs[sl.i].leaves[sl.j]);
        const rr = (sl.j % 2 ? 404 : 506) + (r() - 0.5) * 16;
        return { bi: sl.i, j: sl.j, name, x: KT.fork[0] + Math.cos(sl.ph) * rr * KT.ax, y: KT.fork[1] + Math.sin(sl.ph) * rr, w: wordW(name, 32), h: 46 };
      });
      const bound = l => {
        l.x = clamp(l.x, KT.left + l.w / 2, KT.right - l.w / 2); l.y = clamp(l.y, KT.top, KT.fork[1] - 90);
      };
      leaves.forEach(bound);
      const boxes = () => [...leaves, ...branches.map(b => ({ fixed: true, x: b.B[0], y: b.B[1] - 44, w: wordW(b.name, 44) + 30, h: 60 }))];
      for (let it = 0; it < 120; it++) {
        const all = boxes();
        let moved = false;
        for (let a = 0; a < all.length; a++) for (let c = a + 1; c < all.length; c++) {
          const A = all[a], C = all[c];
          const ox = (A.w + C.w) / 2 + 26 - Math.abs(A.x - C.x), oy = (A.h + C.h) / 2 + 6 - Math.abs(A.y - C.y);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          const vert = oy < ox;           // push along the axis of least overlap
          const d = (vert ? oy : ox) / 2 + 1, sgn = vert ? (A.y < C.y ? -1 : 1) : (A.x < C.x ? -1 : 1);
          const wa = A.fixed ? 0 : C.fixed ? 2 : 1, wc = C.fixed ? 0 : A.fixed ? 2 : 1;
          if (vert) { A.y += sgn * d * wa; C.y -= sgn * d * wc; } else { A.x += sgn * d * wa; C.x -= sgn * d * wc; }
        }
        leaves.forEach(bound);
        if (!moved) break;
      }
      // twigs: from the branch node to just below each leaf word, plus small offshoots with points of light
      leaves.forEach(l => {
        const b = branches[l.bi], B = b.B, T0 = [l.x, l.y + 22];
        const dx = T0[0] - B[0], dy = T0[1] - B[1];
        l.tip = T0;
        l.twig = bez(B, [B[0] + Math.cos(b.th) * 60, B[1] + Math.sin(b.th) * 60], [T0[0] - dx * 0.25, T0[1] - dy * 0.1 + 20], T0, 24);
        l.shoots = [];
        const ns = 2 + Math.floor(r() * 2);
        for (let s = 0; s < ns; s++) {
          const u = 0.35 + r() * 0.5, P = at(l.twig, u), a = Math.atan2(dy, dx) + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len = 30 + r() * 60;
          const E = [P[0] + Math.cos(a) * len, P[1] + Math.sin(a) * len];
          l.shoots.push({ u, pts: bez(P, [lerp(P[0], E[0], 0.4), lerp(P[1], E[1], 0.2)], [lerp(P[0], E[0], 0.8), lerp(P[1], E[1], 0.7)], E, 10) });
        }
      });
      // star dust inside the canopy
      const dust = [];
      for (let i = 0; i < 90; i++) {
        const a = (196 + r() * 148) * Math.PI / 180, rr = 120 + Math.pow(r(), 0.7) * 520;
        dust.push({ x: KT.fork[0] + Math.cos(a) * rr * KT.ax, y: KT.fork[1] + Math.sin(a) * rr, ph: r() * 6.28, s: r() });
      }
      const trunk = bez(KT.root.map((v, k) => k ? v - 34 : v), [960, 790], [962, 750], KT.fork, 16);
      return { branches, leaves, dust, trunk, field: glyphsOf(bs.map(b => b.name + (b.leaves || []).join('')).join('')) };
    });
  }
  function ktTimes(V, api) {
    const bs = V.branches || [], n = bs.length, d = api.dur;
    const b0 = 1.3, bEnd = Math.max(b0 + 0.5, d * 0.42), bs_ = n > 1 ? (bEnd - b0) / (n - 1) : 0;
    const lStep = 0.28;
    const bt = bs.map((_, i) => b0 + i * bs_);
    const lastLeaf = Math.max(...bs.map((b, i) => bt[i] + 1.0 + Math.max(0, (b.leaves || []).length - 1) * lStep + 0.9), 3);
    const pulse = Math.min(d - 3.2, Math.max(lastLeaf + 0.3, d * 0.6));
    return { bt, lStep, pulse, pd: 1.9 };
  }
  T.register('knowledge_tree', {
    draw(ctx_, V, lt, api) {
      const ENV = ctx.globalAlpha, Lk = ktLayout(V), tm = ktTimes(V, api);
      const [rx, ry] = KT.root, [fx, fy] = KT.fork;
      const pulseAt = u => prog(lt, tm.pulse + u * tm.pd - 0.05, tm.pulse + u * tm.pd + 0.35) * (1 - prog(lt, tm.pulse + u * tm.pd + 0.35, tm.pulse + u * tm.pd + 1.4));
      const done = ease.inOut(prog(lt, tm.pulse + 0.4, tm.pulse + tm.pd + 1.2));
      ctx.save(); ctx.globalAlpha = 1;
      const zs = 1 + 0.002 * lt; ctx.translate(960, 560); ctx.scale(zs, zs); ctx.translate(-960, -560);
      L.field(lt, { n: 80, chars: Lk.field, seed: 5, alpha: 0.055 * ENV, color: '#d9c9a8' });
      // warm crown light that grows with the tree
      const grow = ease.out(prog(lt, 0.5, tm.pulse));
      spark(fx, fy - 250, 760, 'rgba(242,201,138,0.07)', ENV * (0.3 + 0.7 * grow) * (1 + 0.6 * done));
      spark(rx, ry - 10, 240, 'rgba(255,159,90,0.16)', ENV * ease.out(prog(lt, 0.2, 1.4)) * (1 + done));
      // star dust
      for (const s of Lk.dust) {
        const a = ENV * grow * (0.25 + 0.2 * Math.sin(lt * 0.6 + s.ph)) * (0.6 + 0.6 * done);
        spark(s.x, s.y, 3 + s.s * 5, 'rgba(255,226,180,0.9)', a * 0.5);
      }
      // trunk
      const tp = ease.inOut(prog(lt, 0.6, 1.5));
      stroke(Lk.trunk, tp, rgba(WARM, 1), ENV * 0.55, 2.4);
      const tpu = pulseAt(0) * 0 + prog(lt, tm.pulse - 0.5, tm.pulse);   // pulse climbs the trunk first
      if (tpu > 0 && tpu < 1) { const q = at(Lk.trunk, ease.inOut(tpu)); spark(q[0], q[1], 40, 'rgba(255,220,160,0.9)', ENV); }
      // branches
      Lk.branches.forEach((b, i) => {
        const t0 = tm.bt[i], lp = ease.inOut(prog(lt, t0, t0 + 1.0));
        stroke(b.limb, lp, rgba(b.col, 1), ENV * (0.42 + 0.2 * done), 1.8);
        if (lp > 0 && lp < 1) { const q = at(b.limb, lp); spark(q[0], q[1], 22, rgba(b.col, 0.9), ENV); }
        const pu = prog(lt, tm.pulse, tm.pulse + tm.pd * 0.35);
        if (pu > 0 && pu < 1) { const q = at(b.limb, ease.inOut(pu)); spark(q[0], q[1], 34, 'rgba(255,230,180,0.9)', ENV); }
      });
      // leaves
      Lk.leaves.forEach(l => {
        const b = Lk.branches[l.bi], t0 = tm.bt[l.bi] + 1.0 + l.j * tm.lStep;
        const gp = ease.inOut(prog(lt, t0, t0 + 0.8));
        if (gp <= 0) return;
        stroke(l.twig, gp, rgba(b.col, 1), ENV * (0.30 + 0.15 * done), 1.2);
        l.shoots.forEach(s => {
          const sp = ease.out(prog(lt, t0 + s.u * 0.8, t0 + s.u * 0.8 + 0.7));
          stroke(s.pts, sp, rgba(b.col, 1), ENV * 0.20, 1);
          if (sp > 0.9) spark(s.pts[s.pts.length - 1][0], s.pts[s.pts.length - 1][1], 5, rgba(b.col, 0.9), ENV * 0.7 * (0.7 + 0.3 * Math.sin(lt * 0.8 + s.u * 9)));
        });
        const pp = prog(lt, tm.pulse + tm.pd * 0.35, tm.pulse + tm.pd);
        if (pp > 0 && pp < 1) { const q = at(l.twig, ease.inOut(pp)); spark(q[0], q[1], 18, 'rgba(255,230,180,0.85)', ENV); }
        const fa = ease.out(prog(lt, t0 + 0.6, t0 + 1.3));
        if (fa <= 0) return;
        const flare = (1 - ease.inOut(prog(lt, t0 + 0.9, t0 + 2.2))) + pulseAt(1) * 1.2;
        spark(l.tip[0], l.tip[1], 8 + 18 * flare, rgba(b.col, 0.95), ENV * fa);
        spark(l.x, l.y, 90, rgba(b.col, 0.07), ENV * fa * (0.4 + done * 0.6 + flare * 0.5));
        word(l.name, l.x, l.y - 6, { size: 32, color: INK, glow: 6 + Math.round(4 * done), alpha: ENV * fa * lerp(0.86, 1, done), reveal: prog(lt, t0 + 0.6, t0 + 1.4) });
      });
      // branch names last: the twigs behind them sink into a soft shadow, so no line runs through a word
      Lk.branches.forEach((b, i) => {
        const t0 = tm.bt[i], na = ease.out(prog(lt, t0 + 0.8, t0 + 1.6));
        if (na <= 0) return;
        const w = wordW(b.name, 44, { spacing: 6 });
        ctx.save(); ctx.globalAlpha = ENV * na * 0.85; ctx.translate(b.B[0], b.B[1] - 42); ctx.scale((w / 2 + 50) / 60, 1);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
        g.addColorStop(0, 'rgba(10,8,6,0.9)'); g.addColorStop(0.6, 'rgba(10,8,6,0.6)'); g.addColorStop(1, 'rgba(10,8,6,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        spark(b.B[0], b.B[1] - 18, 110, rgba(b.col, 0.16), ENV * na * (1 + 0.5 * done));
        spark(b.B[0], b.B[1], 12, rgba(b.col, 1), ENV * na);
        word(b.name, b.B[0], b.B[1] - 42, { size: 44, color: b.col, glow: 12, alpha: ENV * na, spacing: 6, reveal: prog(lt, t0 + 0.8, t0 + 1.7) });
      });
      // root word
      const ra = ease.out(prog(lt, 0.2, 1.2));
      word(V.root || '', rx, ry, { size: 60, color: done > 0.3 ? '#ffe2b8' : INK, glow: 14 + Math.round(8 * done), alpha: ENV * ra, spacing: 16, reveal: prog(lt, 0.2, 1.4) });
      ctx.restore();
    },
    cues(V, api) {
      const tm = ktTimes(V, api);
      return [{ t: 0.2, type: 'tick' }, ...tm.bt.map(x => ({ t: x + 0.8, type: 'tick' })), { t: tm.pulse, type: 'chime' }];
    },
  });

  // =====================================================================
  // endcard — title in light, credits, then black
  // =====================================================================
  T.register('endcard', {
    draw(ctx_, V, lt, api) {
      const ENV = ctx.globalAlpha, t = api.beat.start + lt, acc = L.accent(T.TL, t), lines = V.lines || [];
      let main = String(V.title || ''), sub = V.subtitle || null;
      if (!sub && main.includes('：')) { const i = main.indexOf('：'); sub = main.slice(i + 1); main = main.slice(0, i); }
      const cy = sub ? 452 : 486;
      ctx.save(); ctx.globalAlpha = 1;
      L.field(lt, { n: 90, chars: glyphsOf(main + (sub || '')), seed: 13, alpha: 0.07 * ENV, color: '#d9c9a8' });
      spark(960, cy + 40, 520, 'rgba(242,201,138,0.10)', ENV * ease.out(prog(lt, 0.2, 2.0)));
      // a few embers drifting up very slowly
      const er = rng(29);
      for (let k = 0; k < 26; k++) {
        const x0 = 260 + er() * 1400, sp = 8 + er() * 14, ph = er() * 6.28, y0 = 300 + er() * 700;
        const u = ((lt * sp + y0) % 820) / 820, y = 1000 - u * 820, a = 0.5 * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(lt * 0.9 + ph));
        spark(x0 + Math.sin(lt * 0.3 + ph) * 14, y, 4 + er() * 5, 'rgba(255,190,120,0.9)', ENV * a * ease.out(prog(lt, 0.4, 2.4)));
      }
      word(main, 960, cy, { size: 96, color: '#f4eee2', glow: 16, spacing: 28, alpha: ENV, reveal: prog(lt, 0.3, 1.9) });
      if (sub) word(sub, 960, cy + 104, { size: 42, color: acc, glow: 10, spacing: 14, alpha: ENV, reveal: prog(lt, 1.0, 2.4) });
      const bw = 300 * ease.inOut(prog(lt, 1.6, 3.0)), by = cy + (sub ? 172 : 90);
      beam(960 - bw, by, 960 + bw, by, acc, ENV * 0.7, 1.2);
      lines.forEach((l, k) => word(l, 960, by + 72 + k * 50, { size: 28, color: 'rgba(239,233,220,0.55)', glow: 0, spacing: 3, alpha: ENV, reveal: prog(lt, 2.0 + k * 0.5, 3.2 + k * 0.5) }));
      ctx.restore();
      const b = ease.inOut(prog(lt, api.dur - 1.2, api.dur - 0.05));
      if (b > 0) { ctx.save(); ctx.globalAlpha = b; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    },
    cues() { return [{ t: 0.3, type: 'chime' }]; },
  });
})();
