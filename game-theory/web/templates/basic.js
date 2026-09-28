/* basic.js — generic, parameter-driven templates for talk / book-club explainer films.
 * Nothing here is specific to one film: every word on screen comes from beat.visual (V) or from the narration.
 *
 *   remember   {text, sub?, label?='记住', highlight?[]}                       quiet "remember this" card (cue chime)
 *   cards      {title?, items:[{title,desc}], layout?:'row'|'grid', steps?:[{show}|{note}]}   case cards (cue tick)
 *   statement  {text, highlight?[], label?, steps?:[{note}|{final}], finalMode?:'append'|'replace'}
 *   compare    {left:{title,items,color?}, right:{...}, join?:'vs'|'arrow'|'none', steps:[{show:'left'|'right'}|{note}]}
 *   list       {title?, layout:'grid'|'column', items:[{title,en?,desc?,footnote?}], steps:[{show:i|'all'|[i..], stagger?}]}
 *   timeline   {title?, items:[{year,name,desc}], steps:[{show:[..], stagger?}]}
 *   title      {title, subtitle?, kicker?, steps:[{show:'subtitle'}]}
 *   lens       {x, lenses:[..], pick, views?:[..]}     "every discipline is a pair of glasses"
 *   endcard    {title, lines[]}                          credits, fades to black in the last second
 *
 * Shared conventions
 *   - Text containing " · " is split into stacked lines where space is narrow (grid cells, timeline).
 *   - A title "A · B" in compare becomes kicker A over title B.
 *   - Items without explicit show-steps are timed by anchoring their title to the narration text
 *     (the item appears roughly when the voice says it); unmatched items are spread evenly.
 *   - Every frame is a pure function of lt; layout/measurement caches are keyed by content only. */
(function () {
  const { P, F, clamp, lerp, prog, ease, text, measure, panel, dot, ring } = K;
  const ctx = K.ctx;

  // ================= colour helpers (derived from K.P only) =================
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(h, a) { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; }
  function mix(h1, h2, k) {
    const a = hexRGB(h1), b = hexRGB(h2);
    return '#' + a.map((v, i) => Math.round(lerp(v, b[i], clamp(k))).toString(16).padStart(2, '0')).join('');
  }
  const pal = (name, d) => (name && P[name]) || (name && name[0] === '#' ? name : d);

  // ================= typography =================
  const NO_START = '，。、；：！？）」』”’》〉】·…—,.;:!?)%';
  const NO_END = '（「『“‘《〈【(';
  const fontsReady = () => !document.fonts || document.fonts.status === 'loaded';
  const cache = new Map();
  function memo(key, fn) {
    if (cache.has(key)) return cache.get(key);
    const v = fn(); if (fontsReady()) cache.set(key, v); return v;
  }
  const okey = o => [o.size, o.family, o.weight, o.spacing].join(',');
  function tokens(str) { return str.match(/[A-Za-z0-9][A-Za-z0-9\-+.%$_/]*|\s+|./gu) || []; }
  const chars = s => Array.from(s);

  /** greedy CJK-aware wrap: latin words stay whole, no line starts with closing punctuation */
  function wrap(str, maxW, o, _tight) {
    return memo('w|' + str + '|' + maxW + '|' + okey(o), () => {
      const lines = [];
      for (const para of String(str).split('\n')) {
        let cur = '';
        for (const t of tokens(para)) {
          const next = cur + t;
          if (cur.trim() && measure(next.trimEnd(), o) > maxW && !NO_START.includes(t[0]) && !/^\s+$/.test(t)) {
            let carry = '';
            while (cur && NO_END.includes(cur[cur.length - 1])) { carry = cur[cur.length - 1] + carry; cur = cur.slice(0, -1); }
            lines.push(cur.trimEnd()); cur = carry + t;
          } else cur = next;
        }
        lines.push(cur.trim());
      }
      // avoid a 1–2 character orphan on the last line
      if (!_tight && lines.length > 1 && chars(lines[lines.length - 1]).length <= 2) return wrap(str, Math.round(maxW * 0.88), o, true);
      return lines;
    });
  }
  /** display wrap: break at the punctuation nearest the middle so lines are balanced */
  function balance(str, maxW, o) {
    return memo('b|' + str + '|' + maxW + '|' + okey(o), () => {
      if (str.includes('\n')) return str.split('\n');
      const w = measure(str, o); if (w <= maxW) return [str];
      const cs = chars(str); let best = null;
      for (let i = 1; i < cs.length - 1; i++) {
        if (!'，。；：！？、 ·'.includes(cs[i])) continue;
        const a = cs.slice(0, i + 1).join('').trim(), b = cs.slice(i + 1).join('').trim();
        const wa = measure(a, o), wb = measure(b, o);
        if (wa > maxW || wb > maxW) continue;
        const score = Math.abs(wa - wb) + ('。；！？'.includes(cs[i]) ? -300 : cs[i] === '：' ? -120 : cs[i] === ' ' ? 60 : 0);
        if (!best || score < best.score) best = { score, lines: [a, b] };
      }
      if (best) return best.lines;
      const rows = Math.ceil(w / maxW);
      return wrap(str, Math.min(maxW, Math.ceil(w / rows) * 1.08), o);
    });
  }
  /** body wrap that prefers breaking after punctuation (keeps phrases like “骗几次就失灵” whole) */
  function wrapNice(str, maxW, o) {
    return memo('n|' + str + '|' + maxW + '|' + okey(o), () => {
      const greedy = wrap(str, maxW, o);
      if (greedy.length < 2 || str.includes('\n')) return greedy;
      const cs = chars(str); let best = -1;
      for (let i = 1; i < cs.length - 1; i++) {
        if (!('，。；：！？、—」”）'.includes(cs[i]) && !(cs[i] === ' ' && cs[i - 1] === '·'))) continue;
        if (cs[i] === '—' && cs[i + 1] === '—') continue;
        const a = cs.slice(0, i + 1).join('');
        if (measure(a.trim(), o) <= maxW && a.length >= cs.length * 0.3) best = i;
      }
      if (best < 0) return greedy;
      const head = cs.slice(0, best + 1).join('').trim(), rest = wrap(cs.slice(best + 1).join('').trim(), maxW, o);
      return rest.length + 1 <= greedy.length ? [head, ...rest] : greedy;
    });
  }
  const hang = (l, size) => (/^[“「『（]/.test(l) ? size * 0.5 : 0);   // hanging opening punctuation
  const dispTrim = s => s.replace(/[。．]$/, '');

  /** per-character layout of one line (x offsets), cached */
  function charLayout(str, o) {
    return memo('c|' + str + '|' + okey(o), () => {
      const cs = chars(str), xs = []; let acc = '';
      for (const c of cs) { xs.push(measure(acc, o)); acc += c; }
      return { cs, xs, w: measure(str, o) - (o.spacing || 0) };
    });
  }
  function hlMask(str, words) {
    const cs = chars(str), m = cs.map(() => false);
    for (const w of words || []) {
      if (!w) continue; const wc = chars(w);
      for (let i = 0; i + wc.length <= cs.length; i++) if (cs.slice(i, i + wc.length).join('') === w) for (let k = 0; k < wc.length; k++) m[i + k] = true;
    }
    return m;
  }
  /** draw one line char by char. opt: align, mask, hl (colour), hlP, underline, reveal {lt,t0,per,d,blur,rise} */
  function drawLine(str, x, y, o, opt = {}) {
    const L = charLayout(str, o), align = opt.align || 'left';
    const x0 = align === 'center' ? x - L.w / 2 : align === 'right' ? x - L.w : x;
    const r = opt.reveal, base = o.alpha == null ? 1 : o.alpha;
    for (let i = 0; i < L.cs.length; i++) {
      let a = 1;
      if (r) a = ease.out(prog(r.lt, r.t0 + i * r.per, r.t0 + i * r.per + r.d));
      if (a <= 0.001) continue;
      const hl = opt.mask && opt.mask[i];
      const color = hl ? mix(o.color || P.ink, opt.hl || P.ember, opt.hlP == null ? 1 : opt.hlP) : (o.color || P.ink);
      if (r && r.blur && a < 1) { ctx.save(); ctx.filter = `blur(${((1 - a) * r.blur).toFixed(2)}px)`; }
      text(L.cs[i], x0 + L.xs[i], y + (r ? (1 - a) * (r.rise || 0) : 0), { ...o, align: 'left', color, alpha: base * a, spacing: o.spacing });
      if (r && r.blur && a < 1) ctx.restore();
    }
    if (opt.mask && opt.underline && opt.hlP > 0) {   // ember underline sweeping under highlighted runs
      let i = 0;
      while (i < L.cs.length) {
        if (!opt.mask[i]) { i++; continue; }
        let j = i; while (j + 1 < L.cs.length && opt.mask[j + 1]) j++;
        const xa = x0 + L.xs[i], xb = x0 + (j + 1 < L.cs.length ? L.xs[j + 1] - (o.spacing || 0) : L.w);
        ctx.save(); ctx.globalAlpha *= base; ctx.fillStyle = opt.hl || P.ember;
        ctx.fillRect(xa, y + o.size * 0.24, (xb - xa) * ease.inOut(opt.hlP), Math.max(2, o.size / 28)); ctx.restore();
        i = j + 1;
      }
    }
    return L.w;
  }
  /** multi-line text block (already wrapped). returns height */
  function drawLines(lines, x, y, o, lh, extra = {}) { lines.forEach((l, k) => text(l, x, y + k * lh, { ...o, ...extra })); return lines.length * lh; }

  // ================= timing helpers =================
  const fu = (lt, t0, d = 0.6) => { const e = ease.out(prog(lt, t0, t0 + d)); return { a: e, dy: (1 - e) * 22 }; };
  function narration(api) {
    return (api.beat.lines || []).map((l, k) => ({ text: l.text, ...api.line(k) }));
  }
  /** approximate time the voice speaks `word` (linear within its line), or null */
  function wordTime(api, word, after = -Infinity) {
    if (!word) return null;
    const w = String(word).replace(/\s+/g, '');
    for (const l of narration(api)) {
      const tx = l.text.replace(/\s+/g, ''), i = tx.indexOf(w); if (i < 0) continue;
      const t = l.start + (i / Math.max(1, tx.length)) * l.dur;
      if (t > after) return t;
    }
    return null;
  }
  /** anchor a title to the narration: longest common substring (>=2 chars) -> time */
  function anchorTime(api, title, after) {
    const cs = chars(String(title).replace(/[“”「」：:，、\s]/g, ''));
    for (let len = Math.min(cs.length, 6); len >= 2; len--) {
      let best = null;
      for (let i = 0; i + len <= cs.length; i++) {
        const t = wordTime(api, cs.slice(i, i + len).join(''), after);
        if (t != null && (best == null || t < best)) best = t;
      }
      if (best != null) return best;
    }
    return null;
  }
  /** appearance times for n items without show-steps: anchored to narration, gaps interpolated */
  function autoTimes(n, api, items, endLimit) {
    const nar = narration(api);
    const s = nar.length ? nar[0].start + 0.15 : 0.4;
    const end = Math.min(endLimit != null ? endLimit : Infinity, nar.length ? nar[nar.length - 1].end - 0.8 : api.dur - 1.5, api.dur - 1.2);
    const t = new Array(n).fill(null); let last = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = items ? anchorTime(api, items[i].title || items[i].name || '', last + 0.4) : null;
      if (a != null && a > last + 0.4) { t[i] = a; last = a; }
    }
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
  /** show-steps -> per-item reveal times (Infinity = never). null when there are no show-steps */
  function showTimes(n, api, defStagger = 0.35) {
    const ss = api.steps.filter(s => s.show != null && s.show !== 'left' && s.show !== 'right' && s.show !== 'subtitle');
    if (!ss.length) return null;
    const t = new Array(n).fill(Infinity), grp = new Array(n).fill(-1);
    ss.forEach((s, g) => {
      const idx = s.show === 'all' ? [...Array(n).keys()] : Array.isArray(s.show) ? s.show : [s.show];
      const st = s.stagger != null ? s.stagger : defStagger;
      idx.forEach((i, k) => { if (i >= 0 && i < n && t[i] === Infinity) { t[i] = s.lt + k * st; grp[i] = g; } });
    });
    return { t, grp, steps: ss };
  }
  /** latest note step visible at lt (cross-fading), returns [{text, a}] */
  function notes(api, lt, key = 'note') {
    const ns = api.steps.filter(s => s[key] != null);
    const out = [];
    ns.forEach((s, i) => {
      const next = ns[i + 1];
      const a = Math.min(ease.out(prog(lt, s.lt, s.lt + 0.6)), next ? 1 - ease.in(prog(lt, next.lt - 0.35, next.lt)) : 1);
      if (a > 0) out.push({ text: s[key], a, lt: s.lt });
    });
    return out;
  }
  const noteCues = (api, type = 'pop') => api.steps.filter(s => s.note != null && s.owner === api.beat.id).map(s => ({ t: s.lt, type }));

  // ================= shared pieces =================
  const HEAD_Y = 236;
  /** section header: serif title + short gold rule. returns the y where content may begin */
  function header(title, lt, t0 = 0.15, o = {}) {
    if (!title) return o.top || 170;
    const f = fu(lt, t0, 0.7), y = (o.y || HEAD_Y) + f.dy * 0.5;
    text(title, o.x || 960, y, { size: o.size || 54, family: F.serif, weight: 600, color: P.ink, align: o.align || 'center', alpha: f.a, spacing: 3 });
    const rw = 56 * ease.inOut(prog(lt, t0 + 0.25, t0 + 1.0));
    ctx.save(); ctx.globalAlpha *= f.a; ctx.fillStyle = P.gold;
    const rx = (o.align === 'left') ? (o.x || 960) : (o.x || 960) - rw / 2;
    ctx.fillRect(rx, y + 34, rw, 2); ctx.restore();
    return (o.y || HEAD_Y) + 80;
  }
  /** bottom note pill: a single supplementary line */
  function notePill(str, y, a, o = {}) {
    if (a <= 0) return;
    const fo = { size: o.size || 34, family: F.sans, weight: 500 };
    const tw = measure(str, fo), w = tw + 96, h = 66, x = 960 - w / 2, yy = y + (1 - a) * 14;
    ctx.save(); ctx.globalAlpha *= a;
    panel(x, yy - h / 2, w, h, { r: h / 2, fill: 'rgba(16,21,30,0.88)', stroke: rgba(o.color || P.ember, 0.55) });
    dot(x + 36, yy, 5, o.color || P.ember);
    text(str, x + 60, yy + fo.size * 0.36, { ...fo, color: P.ink });
    ctx.restore();
  }
  function autoTerms(str) {  // "术语：解释。术语2：……" -> terms before a full-width colon
    const out = []; const re = /(^|[。；！？\s])([^。；！？：\s]{1,8})：/g; let m;
    while ((m = re.exec(str))) out.push(m[2]);
    return out;
  }

  // =====================================================================
  // remember — 「记住这一句」
  // =====================================================================
  function rememberLayout(V) {
    const size0 = V.size || 78, maxW = 1380;
    let o = { size: size0, family: F.serif, weight: 600, spacing: 2 };
    let lines = balance(String(V.text || ''), maxW, o);
    if (lines.length > 1) { o = { ...o, size: Math.round(size0 * 0.9) }; lines = balance(String(V.text || ''), maxW, o); }
    lines = lines.map(dispTrim);
    const lh = Math.round(o.size * 1.42);
    const textW = Math.max(...lines.map(l => charLayout(l, o).w));
    return { o, lines, lh, textW, nChars: lines.reduce((s, l) => s + chars(l).length, 0) };
  }
  function rememberTiming(V, api) {
    const Lr = rememberLayout(V), l0 = api.line(0), l1 = api.line(1);
    const s = Math.max(0.2, (l0 ? l0.start : 0.45) - 0.2);
    const tText = s + 0.35, per = Math.min(0.07, 1.1 / Math.max(1, Lr.nChars)), tTextEnd = tText + Lr.nChars * per + 0.8;
    let tSub = l1 ? l1.start : l0 ? l0.start + l0.dur * 0.55 : tTextEnd + 0.6;
    tSub = Math.min(Math.max(tSub, tTextEnd - 0.1), api.dur - 1.4);
    return { Lr, s, tText, per, tTextEnd, tSub };
  }
  T.register('remember', {
    draw(ctx_, V, lt, api) {
      const { Lr, s, tText, per, tTextEnd, tSub } = rememberTiming(V, api);
      const cx = 960, hasSub = !!V.sub;
      const blockH = 26 + 78 + Lr.lines.length * Lr.lh + (hasSub ? 40 + 84 : 0);
      const top = 505 - blockH / 2;
      // very slow settle-in: the card breathes toward the viewer
      const zoom = 1 + 0.014 * ease.sine(prog(lt, 0, api.dur));
      ctx.save(); ctx.translate(cx, 515); ctx.scale(zoom, zoom); ctx.translate(-cx, -515);
      // warm focus glow behind the sentence
      const ga = ease.out(prog(lt, s, s + 1.4));
      ctx.save(); ctx.translate(cx, 500); ctx.scale(1.9, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 420);
      g.addColorStop(0, rgba(P.gold, 0.06 * ga)); g.addColorStop(1, rgba(P.gold, 0));
      ctx.fillStyle = g; ctx.fillRect(-440, -440, 880, 880); ctx.restore();
      // label — 记住
      const lab = V.label || '记住', la = fu(lt, s, 0.6);
      const ly = top + 26;
      text(lab, cx, ly, { size: 28, family: F.sans, weight: 500, color: P.gold, align: 'center', spacing: 12, alpha: la.a });
      const hw = 34 * ease.inOut(prog(lt, s + 0.1, s + 0.9)), lw = measure(lab, { size: 28, family: F.sans, weight: 500, spacing: 12 }) / 2 + 22;
      ctx.save(); ctx.globalAlpha *= la.a * 0.7; ctx.fillStyle = P.gold;
      ctx.fillRect(cx - lw - hw, ly - 10, hw, 1.5); ctx.fillRect(cx + lw - 6, ly - 10, hw, 1.5); ctx.restore();
      // the sentence, clearing up character by character
      const words = V.highlight || autoTerms(String(V.text || ''));
      const hlP = ease.inOut(prog(lt, tTextEnd - 0.2, tTextEnd + 0.6));
      let y = top + 26 + 78 + Lr.o.size * 0.8, k0 = 0;
      Lr.lines.forEach(line => {
        drawLine(line, cx, y, { ...Lr.o, color: P.ink }, {
          align: 'center', mask: hlMask(line, words), hl: P.ember, hlP,
          reveal: { lt, t0: tText + k0 * per, per, d: 0.7, blur: 7, rise: 10 },
        });
        k0 += chars(line).length; y += Lr.lh;
      });
      y -= Lr.lh;
      // hairline unfolding from the centre
      const rp = ease.inOut(prog(lt, tText + 0.4, tTextEnd + 0.3));
      const rw = Math.min(Lr.textW * 0.62, 520) * rp;
      if (hasSub || rp > 0) {
        ctx.save(); ctx.fillStyle = rgba(P.gold, 0.75); ctx.fillRect(cx - rw / 2, y + 48, rw, 1.5);
        dot(cx, y + 48.75, 3.2 * ease.out(prog(lt, tTextEnd, tTextEnd + 0.5)), P.gold); ctx.restore();
      }
      if (hasSub) {
        const sf = fu(lt, tSub, 0.8);
        text(V.sub, cx, y + 48 + 76 + sf.dy * 0.6, { size: 38, family: F.sans, weight: 400, color: P.ink, alpha: 0.78 * sf.a, align: 'center', spacing: 2 });
      }
      ctx.restore();
    },
    cues(V, api) { const { tText, tSub } = rememberTiming(V, api); return [{ t: tText, type: 'chime' }, ...(V.sub ? [{ t: tSub, type: 'tick' }] : [])]; },
  });

  // =====================================================================
  // cards — 案例卡
  // =====================================================================
  function cardsLayout(V, hasNote) {
    const items = V.items || [], n = items.length;
    const layout = V.layout || (n === 4 ? 'grid' : n <= 3 ? 'row' : 'grid');
    const cols = layout === 'row' ? n : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    const gap = 32, areaW = 1640;
    const w = Math.min(layout === 'row' ? (n === 1 ? 900 : n === 2 ? 700 : 540) : cols === 2 ? 780 : 520, (areaW - (cols - 1) * gap) / cols);
    const pad = 44, inner = w - pad * 2;
    const tO = { size: 40, family: F.sans, weight: 500 }, dO = { size: 31, family: F.sans, weight: 400 };
    const cells = items.map(it => {
      const tl = balance(it.title || '', inner, tO).slice(0, 2);
      let dl = it.desc ? wrapNice(it.desc, inner, dO) : [];
      if (dl.length > 3) { dl = dl.slice(0, 3); dl[2] = dl[2].replace(/.$/, '…'); }
      return { tl, dl };
    });
    const tLH = 54, dLH = 47;
    const head = layout === 'row' ? 44 : 0;   // row cards carry a tick + index strip on top; grid cards put the index beside the title
    const hOf = c => pad + head + 40 + (c.tl.length - 1) * tLH + (c.dl.length ? 22 + c.dl.length * dLH : 0) + pad + 8;
    const top0 = V.title ? 316 : 190, bottom = hasNote ? 776 : 866;
    const hMax = (bottom - top0 - (rows - 1) * gap) / rows;
    const h = Math.min(hMax, Math.max(layout === 'row' ? 250 : 170, ...cells.map(hOf)));
    const totalH = rows * h + (rows - 1) * gap;
    const top = top0 + Math.max(0, (bottom - top0 - totalH) / 2);
    const rowW = c => c * w + (c - 1) * gap;
    const pos = items.map((_, i) => {
      const r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - r * cols);
      return { x: 960 - rowW(inRow) / 2 + c * (w + gap), y: top + r * (h + gap) };
    });
    return { layout, w, h, pad, cells, pos, tO, dO, tLH, dLH, bottom: top + totalH };
  }
  function cardsTimes(V, api) {
    const n = (V.items || []).length, sh = showTimes(n, api, 0.5);
    if (sh) return sh.t;
    const firstNote = api.steps.find(s => s.note != null);
    return autoTimes(n, api, V.items, firstNote ? firstNote.lt - 0.5 : null);
  }
  T.register('cards', {
    draw(ctx_, V, lt, api) {
      const hasNote = api.steps.some(s => s.note != null);
      const Lc = cardsLayout(V, hasNote), ts = cardsTimes(V, api);
      header(V.title, lt, 0.15);
      (V.items || []).forEach((it, i) => {
        const f = fu(lt, ts[i], 0.7); if (f.a <= 0) return;
        const { x, y } = Lc.pos[i], c = Lc.cells[i], w = Lc.w, h = Lc.h, pad = Lc.pad;
        const fresh = 1 - ease.inOut(prog(lt, ts[i] + 1.2, ts[i] + 2.6));   // brief emphasis after arriving
        ctx.save(); ctx.globalAlpha *= f.a; ctx.translate(0, f.dy);
        panel(x, y, w, h, { r: 14, fill: 'rgba(16,21,30,0.86)', stroke: rgba(mix(P.ink, P.gold, fresh), 0.16 + 0.34 * fresh) });
        // accent tick + index
        const tick = ease.out(prog(lt, ts[i] + 0.2, ts[i] + 0.9));
        let yy;
        if (Lc.layout === 'row') {
          ctx.fillStyle = rgba(P.gold, 0.9); ctx.fillRect(x + pad, y + pad, 28 * tick, 2);
          text(String(i + 1).padStart(2, '0'), x + w - pad, y + pad + 14, { size: 24, family: F.mono, weight: 400, color: P.gold, alpha: 0.85, align: 'right' });
          yy = y + pad + 44 + 38;
        } else {
          yy = y + pad + 38;
          ctx.fillStyle = rgba(P.gold, 0.9); ctx.fillRect(x, yy - 30, 3, 36 * tick);   // gold edge mark beside the title
          text(String(i + 1).padStart(2, '0'), x + w - pad, yy - 4, { size: 24, family: F.mono, weight: 400, color: P.gold, alpha: 0.85, align: 'right' });
        }
        c.tl.forEach(l => { text(l, x + pad, yy, { ...Lc.tO, color: P.ink }); yy += Lc.tLH; });
        yy += 8 - Lc.tLH + Lc.dLH;
        c.dl.forEach(l => { text(l, x + pad - hang(l, Lc.dO.size), yy, { ...Lc.dO, color: P.ink, alpha: 0.74 }); yy += Lc.dLH; });
        ctx.restore();
      });
      for (const nt of notes(api, lt)) notePill(nt.text, Math.min(Lc.bottom + 70, 836), nt.a, { color: P.gold });
    },
    cues(V, api) {
      const ts = cardsTimes(V, api);
      return [...ts.filter(t => isFinite(t)).map(t => ({ t, type: 'tick' })), ...noteCues(api)];
    },
  });

  // =====================================================================
  // statement — 一句核心观点
  // =====================================================================
  function stmtTimes(V, api) {
    const l0 = api.line(0), tText = Math.max(0.25, (l0 ? l0.start : 0.45) - 0.1);
    const nC = chars(String(V.text || '')).length, per = Math.min(0.06, 0.9 / Math.max(1, nC));
    const tDone = tText + nC * per + 0.6;
    let tHl = null;
    for (const w of V.highlight || []) { const t = wordTime(api, w); if (t != null) tHl = tHl == null ? t : Math.min(tHl, t); }
    if (tHl == null) tHl = tDone + 0.8;
    tHl = Math.max(tHl, tDone - 0.2);
    return { tText, per, tDone, tHl };
  }
  T.register('statement', {
    draw(ctx_, V, lt, api) {
      const { tText, per, tDone, tHl } = stmtTimes(V, api);
      const mO = { size: V.size || 80, family: F.serif, weight: 600, spacing: 3 };
      const lines = balance(String(V.text || ''), 1440, mO).map(dispTrim), lh = mO.size * 1.4;
      const finals = api.steps.filter(s => s.final != null), fs = finals[finals.length - 1];
      const replace = V.finalMode === 'replace';
      const fp = fs ? ease.inOut(prog(lt, fs.lt, fs.lt + 1.0)) : 0;
      const fO = { size: 62, family: F.serif, weight: 600, spacing: 2 };
      const flines = fs ? balance(String(fs.final), 1440, fO).map(dispTrim) : [];
      const noteList = notes(api, lt), hasNote = api.steps.some(s => s.note != null);
      // block heights, then centre (interpolating between "before final" and "with final")
      const hLabel = V.label ? 76 : 0, hMain = lines.length * lh, hNote = hasNote ? 108 : 0, hFinal = flines.length * 88 + 90;
      const Ha = hLabel + hMain + hNote, Hb = replace ? hLabel + hFinal - 90 + hNote : Ha + hFinal;
      const top = 515 - lerp(Ha, Hb, fp) / 2;
      const mainA = replace ? 1 - fp : lerp(1, 0.5, fp), mainS = replace ? 1 : lerp(1, 0.78, fp);
      let y = top;
      if (V.label) {
        const f = fu(lt, 0.1, 0.7);
        text(V.label, 960, y + 28, { size: 30, family: F.sans, weight: 500, color: P.gold, align: 'center', spacing: 6, alpha: f.a * mainA });
        y += hLabel;
      }
      // main sentence
      ctx.save();
      const mcy = y + hMain / 2; ctx.translate(960, mcy); ctx.scale(mainS, mainS); ctx.translate(-960, -mcy);
      let k0 = 0;
      lines.forEach((l, k) => {
        drawLine(l, 960, y + k * lh + mO.size * 0.92, { ...mO, color: P.ink, alpha: mainA }, {
          align: 'center', mask: hlMask(l, V.highlight), hl: P.ember, hlP: ease.inOut(prog(lt, tHl, tHl + 0.8)), underline: true,
          reveal: { lt, t0: tText + k0 * per, per, d: 0.6, blur: 5, rise: 12 },
        });
        k0 += chars(l).length;
      });
      ctx.restore();
      y += replace ? 0 : lerp(hMain, hMain * mainS, fp);
      if (replace) y += lerp(hMain, 0, fp);
      // note
      if (hasNote) {
        for (const nt of noteList) {
          const yy = y + 70 + (1 - nt.a) * 12;
          text(nt.text, 960, yy, { size: 38, family: F.sans, weight: 400, color: P.ink, alpha: 0.78 * nt.a * lerp(1, 0.75, fp), align: 'center', spacing: 2 });
        }
        y += hNote;
      }
      // final conclusion
      if (fs && fp > 0) {
        const f = fu(lt, fs.lt + 0.3, 0.9);
        const ry = y + 34, rw = 64 * f.a;
        if (!replace) { ctx.save(); ctx.globalAlpha *= f.a; ctx.fillStyle = P.gold; ctx.fillRect(960 - rw / 2, ry, rw, 2); ctx.restore(); }
        let yy = y + (replace ? 0 : 90) + fO.size * 0.9;
        flines.forEach((l, k) => drawLine(l, 960, yy + k * 88, { ...fO, color: P.ink }, { align: 'center', reveal: { lt, t0: fs.lt + 0.3 + k * 0.4, per: 0.035, d: 0.6, blur: 5, rise: 10 } }));
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

  // =====================================================================
  // compare — 左右对比
  // =====================================================================
  function splitKicker(t) { const p = String(t || '').split(/\s+·\s+/); return p.length > 1 ? { kicker: p[0], title: p.slice(1).join(' · ') } : { kicker: null, title: p[0] }; }
  function compareLayout(V) {
    const pad = 56, gap = 150, iO0 = { size: 36, family: F.sans, weight: 400 };
    const need = Math.max(...['left', 'right'].flatMap(side => {
      const c = V[side] || {}, kt = splitKicker(c.title);
      return [measure(kt.title || '', { size: 54, family: F.serif, weight: 600, spacing: 2 }), ...(c.items || []).map(s => measure(String(s), iO0) + 34)];
    }));
    const W_ = Math.round(clamp(need + pad * 2 + 40, 560, 720)), iO = { size: 36, family: F.sans, weight: 400 }, tO = { size: 54, family: F.serif, weight: 600, spacing: 2 };
    const cols = ['left', 'right'].map((side, k) => {
      const c = V[side] || {}, kt = splitKicker(c.title);
      const items = (c.items || []).map(s => wrapNice(String(s), W_ - pad * 2 - 34, iO));
      const h = pad + (kt.kicker ? 44 : 0) + 58 + 40 + items.reduce((s, l) => s + l.length * 52 + 20, 0) + pad - 20;
      return { side, ...kt, items, h, x: 960 + (k ? gap / 2 : -gap / 2 - W_),
        color: pal(c.color, k ? P.gold : P.blue) };
    });
    const h = Math.max(340, ...cols.map(c => c.h));
    return { cols, W_, h, pad, iO, tO };
  }
  function compareTimes(api) {
    const tOf = side => { const s = api.steps.find(s => s.show === side); return s ? s.lt : null; };
    let tl = tOf('left'), tr = tOf('right');
    if (tl == null) tl = 0.3; if (tr == null) tr = api.steps.length ? Infinity : Math.max(tl + 1.2, (api.line(1) || { start: 1.6 }).start);
    return { left: tl, right: tr };
  }
  T.register('compare', {
    draw(ctx_, V, lt, api) {
      const Lc = compareLayout(V), tm = compareTimes(api);
      const hasNote = api.steps.some(s => s.note != null);
      const top = (hasNote ? 480 : 515) - Lc.h / 2;
      let join = V.join;
      if (!join) join = /第一|之前|过去|before|旧|^1/i.test(String((V.left || {}).title)) ? 'arrow' : 'vs';
      Lc.cols.forEach(c => {
        const t0 = tm[c.side], f = fu(lt, t0, 0.7); if (f.a <= 0) return;
        const x = c.x, dx = (c.side === 'left' ? -1 : 1) * (1 - f.a) * 26;
        ctx.save(); ctx.globalAlpha *= f.a; ctx.translate(dx, 0);
        panel(x, top, Lc.W_, Lc.h, { r: 16, fill: 'rgba(16,21,30,0.86)', stroke: 'rgba(233,228,216,0.14)' });
        ctx.fillStyle = c.color; ctx.fillRect(x + Lc.pad, top, 64 * ease.out(prog(lt, t0 + 0.1, t0 + 0.8)), 3);
        let y = top + Lc.pad;
        if (c.kicker) { text(c.kicker, x + Lc.pad, y + 26, { size: 26, family: F.sans, weight: 500, color: c.color, spacing: 4 }); y += 44; }
        text(c.title, x + Lc.pad, y + 50, { ...Lc.tO, color: P.ink }); y += 58 + 40;
        c.items.forEach((ls, k) => {
          const fi = fu(lt, t0 + 0.35 + k * 0.3, 0.6);
          ctx.save(); ctx.globalAlpha *= fi.a;
          dot(x + Lc.pad + 6, y + 22, 5, c.color);
          ls.forEach((l, j) => text(l, x + Lc.pad + 34, y + 34 + j * 52 + fi.dy * 0.4, { ...Lc.iO, color: P.ink, alpha: 0.9 }));
          ctx.restore();
          y += ls.length * 52 + 20;
        });
        ctx.restore();
      });
      // connector between the columns
      const jp = ease.inOut(prog(lt, tm.right - 0.1, tm.right + 0.7)), jy = top + Lc.h / 2;
      if (jp > 0 && join === 'vs') {
        ring(960, jy, 34, rgba(P.ink, 0.3), { alpha: jp, lineWidth: 1.5 });
        text('vs', 960, jy + 9, { size: 28, family: F.mono, weight: 400, color: P.dim, align: 'center', alpha: jp });
      } else if (jp > 0 && join === 'arrow') {
        const x0 = 960 - 44, x1 = x0 + 88 * jp;
        ctx.save(); ctx.strokeStyle = P.gold; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, jy); ctx.lineTo(x1, jy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1 - 14, jy - 12); ctx.lineTo(x1, jy); ctx.lineTo(x1 - 14, jy + 12); ctx.stroke(); ctx.restore();
      }
      for (const nt of notes(api, lt)) notePill(nt.text, Math.min(top + Lc.h + 86, 836), nt.a);
    },
    cues(V, api) {
      const out = [];
      for (const s of api.steps) if (s.owner === api.beat.id && (s.show === 'left' || s.show === 'right')) out.push({ t: s.lt, type: 'tick' });
      if (!api.steps.length) { const tm = compareTimes(api); out.push({ t: tm.left, type: 'tick' }, { t: tm.right, type: 'tick' }); }
      return [...out, ...noteCues(api)];
    },
  });

  // =====================================================================
  // list — grid (2×2) or column
  // =====================================================================
  function listTimes(V, api) {
    const n = (V.items || []).length, sh = showTimes(n, api, 0.9);
    if (sh) return sh;
    return { t: autoTimes(n, api, V.items), grp: [...Array(n).keys()], steps: [] };
  }
  /** emphasis 0..1 for item i: the most recently revealed single item stays lit until the next reveal */
  function emphasis(ts, i, lt) {
    const ti = ts[i]; if (!(lt >= ti)) return 0;
    const later = ts.filter(t => isFinite(t) && t > ti).sort((a, b) => a - b)[0];
    const on = ease.out(prog(lt, ti, ti + 0.5));
    const off = later != null ? ease.inOut(prog(lt, later, later + 0.6)) : ease.inOut(prog(lt, ti + 3.2, ti + 4.4));
    return on * (1 - off);
  }
  function gridLayout(V) {
    const items = V.items || [], n = items.length, cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    const gap = 32, w = cols === 2 ? 760 : 520, pad = 46;
    const dO = { size: 32, family: F.sans, weight: 400 };
    const cells = items.map(it => ({ dl: String(it.desc || '').split(/\s+·\s+/).flatMap(p => wrapNice(p, w - pad * 2, dO)), fn: it.footnote ? wrap(it.footnote, w - pad * 2, { size: 24, family: F.sans }) : [] }));
    const top0 = V.title ? 316 : 190, maxH = (870 - top0 - (rows - 1) * gap) / rows;
    const h = Math.min(maxH, Math.max(200, ...cells.map(c => pad + 72 + 26 + c.dl.length * 46 + c.fn.length * 34 + pad - 18)));
    const totalH = rows * h + (rows - 1) * gap;
    const top = top0 + Math.max(0, (870 - top0 - totalH) / 2);
    return { cols, w, h, pad, dO, cells, top, gap };
  }
  function columnLayout(V) {
    const items = V.items || [];
    const tO = { size: 42, family: F.sans, weight: 700 }, dO = { size: 33, family: F.sans, weight: 400 }, nO = { size: 24, family: F.sans, weight: 400 };
    const titleW = Math.max(160, ...items.map(it => measure(it.title || '', tO)));
    const idxW = 84, gapT = 56;
    const descMax = Math.min(1060, 1560 - idxW - titleW - gapT);
    const rows = items.map(it => {
      const dl = it.desc ? wrapNice(it.desc, descMax, dO) : [];
      const fn = it.footnote ? wrap((/^注/.test(it.footnote) ? '' : '注：') + it.footnote, descMax, nO) : [];
      const descW = Math.max(0, ...dl.map(l => measure(l, dO)), ...fn.map(l => measure(l, nO)));
      const h = Math.max(62, dl.length * 50 + (fn.length ? 14 + fn.length * 34 : 0)) + 50;
      return { dl, fn, h, descW };
    });
    const blockW = idxW + titleW + gapT + Math.max(...rows.map(r => r.descW), 300);
    const x0 = 960 - blockW / 2;
    const top0 = V.title ? 320 : 190, totalH = rows.reduce((s, r) => s + r.h, 0);
    const top = top0 + Math.max(0, (870 - top0 - totalH) / 2);
    return { tO, dO, nO, titleW, idxW, gapT, rows, x0, blockW, top };
  }
  T.register('list', {
    draw(ctx_, V, lt, api) {
      const items = V.items || [], { t: ts } = listTimes(V, api);
      header(V.title, lt, 0.15);
      if ((V.layout || 'column') === 'grid') {
        const G = gridLayout(V), rowsN = Math.ceil(items.length / G.cols);
        items.forEach((it, i) => {
          const r = Math.floor(i / G.cols), c = i % G.cols, inRow = Math.min(G.cols, items.length - r * G.cols);
          const x = 960 - (inRow * G.w + (inRow - 1) * G.gap) / 2 + c * (G.w + G.gap), y = G.top + r * (G.h + G.gap);
          const f = fu(lt, ts[i], 0.7), em = emphasis(ts, i, lt);
          // empty slot: the structure is visible before its content
          const slotA = ease.out(prog(lt, 0.3 + i * 0.08, 0.9 + i * 0.08)) * (1 - f.a);
          if (slotA > 0) {
            ctx.save(); ctx.globalAlpha *= slotA * 0.9; ctx.setLineDash([6, 8]); ctx.strokeStyle = rgba(P.ink, 0.16); ctx.lineWidth = 1.5;
            K.rrect(x, y, G.w, G.h, 16); ctx.stroke(); ctx.setLineDash([]);
            text(String(i + 1).padStart(2, '0'), x + G.w - G.pad, y + G.pad + 22, { size: 26, family: F.mono, color: P.faint, align: 'right' });
            ctx.restore();
          }
          if (f.a <= 0) return;
          ctx.save(); ctx.globalAlpha *= f.a; ctx.translate(0, f.dy);
          panel(x, y, G.w, G.h, { r: 16, fill: 'rgba(16,21,30,0.86)', stroke: rgba(mix(P.ink, P.gold, em), 0.15 + 0.5 * em), lineWidth: 1.5 + em });
          text(String(i + 1).padStart(2, '0'), x + G.w - G.pad, y + G.pad + 22, { size: 26, family: F.mono, color: mix(P.dim, P.gold, 0.35 + 0.65 * em), align: 'right' });
          ctx.fillStyle = rgba(P.gold, 0.35 + 0.6 * em); ctx.fillRect(x + G.pad, y + G.pad + 12, 28, 2);
          const ty = y + G.pad + 78;
          const tw = measure(it.title || '', { size: 56, family: F.sans, weight: 700 });
          text(it.title || '', x + G.pad, ty, { size: 56, family: F.sans, weight: 700, color: P.ink });
          if (it.en) text(String(it.en).toUpperCase(), x + G.pad + tw + 20, ty, { size: 24, family: F.mono, color: P.dim, spacing: 3 });
          let yy = ty + 26 + 34;
          G.cells[i].dl.forEach((l, k) => { text(l, x + G.pad, yy, { ...G.dO, color: P.ink, alpha: k === 0 ? 0.86 : 0.66 }); yy += 46; });
          G.cells[i].fn.forEach(l => { text(l, x + G.pad, yy, { size: 24, family: F.sans, color: P.dim }); yy += 34; });
          ctx.restore();
        });
      } else {
        const C = columnLayout(V); let y = C.top;
        items.forEach((it, i) => {
          const R = C.rows[i], f = fu(lt, ts[i], 0.7), em = emphasis(ts, i, lt);
          if (f.a > 0) {
            ctx.save(); ctx.globalAlpha *= f.a; ctx.translate((1 - f.a) * 24, 0);
            const by = y + 25;   // row content top
            // gold bar marks the current item
            ctx.fillStyle = rgba(P.gold, 0.9 * em); ctx.fillRect(C.x0 - 30, by + 2, 4, R.h - 54);
            text(String(i + 1).padStart(2, '0'), C.x0, by + 42, { size: 30, family: F.mono, color: mix(P.dim, P.gold, 0.3 + 0.7 * em) });
            text(it.title || '', C.x0 + C.idxW, by + 44, { ...C.tO, color: P.ink });
            const dx = C.x0 + C.idxW + C.titleW + C.gapT;
            let yy = by + 42;
            R.dl.forEach(l => { text(l, dx, yy, { ...C.dO, color: P.ink, alpha: 0.82 }); yy += 50; });
            if (R.fn.length) { yy += 2; R.fn.forEach(l => { text(l, dx, yy, { ...C.nO, color: P.dim }); yy += 34; }); }
            ctx.restore();
          }
          // hairline separator (drawn once the row below exists)
          const sa = i < items.length - 1 ? fu(lt, ts[i + 1], 0.6).a : 0;
          if (sa > 0) { ctx.save(); ctx.globalAlpha *= sa; ctx.fillStyle = P.line; ctx.fillRect(C.x0, y + R.h, C.blockW, 1.5); ctx.restore(); }
          y += R.h;
        });
      }
    },
    cues(V, api) {
      const { t } = listTimes(V, api);
      return t.filter(x => isFinite(x)).map(x => ({ t: x, type: 'tick' }));
    },
  });

  // =====================================================================
  // timeline — 里程碑
  // =====================================================================
  T.register('timeline', {
    draw(ctx_, V, lt, api) {
      const items = V.items || [], n = items.length;
      const sh = showTimes(n, api, 1.5), ts = sh ? sh.t : autoTimes(n, api, items.map(it => ({ title: it.year })));
      const top0 = header(V.title, lt, 0.15);
      const m = n <= 2 ? 560 : n === 3 ? 420 : n === 4 ? 340 : 280, span = 1920 - 2 * m;
      const ay = V.title ? 540 : 490, xa = Math.max(160, m - 170), xb = 1920 - xa;
      const xs = items.map((_, i) => n === 1 ? 960 : m + span * i / (n - 1));
      const colW = Math.min(400, n > 1 ? span / (n - 1) - 44 : 600);
      // base axis draws in
      const ap = ease.inOut(prog(lt, 0.2, 1.6));
      ctx.save(); ctx.fillStyle = rgba(P.ink, 0.16); ctx.fillRect(xa, ay - 1, (xb - xa) * ap, 2);
      if (ap > 0.95) { ctx.strokeStyle = rgba(P.ink, 0.3); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xb - 10, ay - 8); ctx.lineTo(xb, ay); ctx.lineTo(xb - 10, ay + 8); ctx.stroke(); }
      ctx.restore();
      // lit progress: gold line runs to the latest lit node
      let px = xa;
      items.forEach((_, i) => { if (isFinite(ts[i])) { const p = ease.inOut(prog(lt, ts[i] - 0.5, ts[i] + 0.2)); if (p > 0) px = Math.max(px, lerp(i ? xs[i - 1] : xa, xs[i], p)); } });
      if (px > xa) { ctx.save(); ctx.fillStyle = rgba(P.gold, 0.75); ctx.fillRect(xa, ay - 1.5, px - xa, 3); ctx.restore(); }
      const latest = ts.reduce((b, t, i) => (lt >= t && (b < 0 || t >= ts[b]) ? i : b), -1);
      items.forEach((it, i) => {
        const x = xs[i], na = ease.out(prog(lt, 0.4 + i * 0.12, 1.0 + i * 0.12));
        const f = fu(lt, ts[i], 0.8), cur = i === latest ? 1 : 0;
        const curP = cur * ease.out(prog(lt, ts[i], ts[i] + 0.5));
        // node
        ring(x, ay, 9, rgba(P.ink, 0.35), { alpha: na * (1 - f.a), lineWidth: 2 });
        if (f.a > 0) {
          const pulse = ease.out(prog(lt, ts[i], ts[i] + 1.2));
          ring(x, ay, 10 + 26 * pulse, P.gold, { alpha: (1 - pulse) * 0.6, lineWidth: 2 });
          dot(x, ay, 9 * f.a, P.gold, { glow: 14 });
          ctx.save(); ctx.globalAlpha *= f.a;
          text(String(it.year || ''), x, ay - 50 + f.dy * 0.6, { size: 72, family: F.mono, weight: 300, color: mix(P.ink, P.gold, 0.2 + 0.8 * curP), align: 'center' });
          text(it.name || '', x, ay + 76 - f.dy * 0.4, { size: 42, family: F.sans, weight: 500, color: P.ink, align: 'center' });
          const parts = String(it.desc || '').split(/\s+·\s+/);
          let yy = ay + 132;
          parts.forEach((p, k) => wrap(p, colW, { size: 30, family: F.sans }).forEach(l => {
            text(l, x, yy, { size: 30, family: F.sans, weight: 400, color: k === 0 ? P.ink : P.dim, alpha: k === 0 ? 0.88 : 1, align: 'center' }); yy += 44;
          }));
          ctx.restore();
        }
      });
    },
    cues(V, api) {
      const n = (V.items || []).length, sh = showTimes(n, api, 1.5);
      return sh ? sh.t.filter(t => isFinite(t)).map(t => ({ t, type: 'tick' })) : [];
    },
  });

  // =====================================================================
  // title — 片头大标题
  // =====================================================================
  function titleTimes(V, api) {
    const s = api.steps.find(s => s.show === 'subtitle');
    const l1 = api.line(1);
    return { tTitle: 0.3, tSub: s ? s.lt : l1 ? l1.start : 1.8 };
  }
  T.register('title', {
    draw(ctx_, V, lt, api) {
      const { tTitle, tSub } = titleTimes(V, api), cx = 960;
      const tO = { size: V.size || 168, family: F.serif, weight: 600, spacing: 28 };
      const hasSub = !!V.subtitle, cy = hasSub ? 470 : 530;
      if (V.kicker) { const f = fu(lt, 0.1, 0.8); text(V.kicker, cx, cy - 170, { size: 28, family: F.sans, weight: 500, color: P.dim, align: 'center', spacing: 12, alpha: f.a }); }
      const title = String(V.title || '');
      const n = chars(title).length;
      drawLine(title, cx + tO.spacing / 2, cy, { ...tO, color: P.ink }, { align: 'center', reveal: { lt, t0: tTitle, per: 0.22, d: 1.1, blur: 10, rise: 0 } });
      // rule
      const rp = ease.inOut(prog(lt, tTitle + 0.5, tTitle + 0.5 + 1.2)), rw = 420 * rp;
      ctx.save(); ctx.fillStyle = rgba(P.ink, 0.3); ctx.fillRect(cx - rw / 2, cy + 58, rw, 1.5); ctx.restore();
      if (hasSub) {
        const segs = String(V.subtitle).split(/\s*·\s*/), sO = { size: 44, family: F.sans, weight: 400, spacing: 10 };
        const gapW = 84, ws = segs.map(s => measure(s, sO) - sO.spacing), total = ws.reduce((a, b) => a + b, 0) + gapW * (segs.length - 1);
        let x = cx - total / 2; const y = cy + 140;
        const lineDur = (api.line(1) || { dur: 2 }).dur, st = Math.min(0.7, lineDur / Math.max(1, segs.length));
        segs.forEach((s, k) => {
          const f = fu(lt, tSub + k * st, 0.6);
          text(s, x, y + f.dy * 0.5, { ...sO, color: P.ink, alpha: f.a * 0.92 });
          if (k < segs.length - 1) dot(x + ws[k] + gapW / 2, y - 15, 4, P.gold, { alpha: fu(lt, tSub + k * st + 0.3, 0.5).a });
          x += ws[k] + gapW;
        });
      }
    },
    cues(V, api) {
      const { tTitle, tSub } = titleTimes(V, api), out = [{ t: tTitle, type: 'swish' }];
      if (V.subtitle) { const segs = String(V.subtitle).split(/\s*·\s*/), st = Math.min(0.7, (api.line(1) || { dur: 2 }).dur / segs.length); segs.forEach((_, k) => out.push({ t: tSub + k * st, type: 'tick' })); }
      return out;
    },
  });

  // =====================================================================
  // lens — 每门学科是一副眼镜
  // =====================================================================
  const LENS_R = 172, LENS_GAP = 560;
  function lensPlan(V, api) {
    const lenses = V.lenses || [], n = lenses.length;
    let pick = lenses.indexOf(V.pick); if (pick < 0) pick = n - 1;
    const order = lenses.slice(0, pick + 1);        // lenses after the pick are never reached
    const t0 = 1.0, settle = Math.max(t0 + 2.2, api.dur - 2.4), first = 1.35, mv = 1.05;
    const k = order.length;
    const dwell = k > 1 ? Math.max(0.35, (settle - t0 - first - (k - 1) * mv) / (k - 1)) : 0;
    const moves = []; let t = t0;
    for (let i = 0; i < k; i++) { const d = i === 0 ? first : mv; moves.push({ a: t, b: t + d }); t += d + dwell; }
    return { order, pick, moves, settle: moves[k - 1].b, u0: -1.7 };
  }
  function lensU(plan, lt) {
    let u = plan.u0;
    plan.moves.forEach((m, i) => { u += (i === 0 ? -plan.u0 : 1) * ease.inOut(prog(lt, m.a, m.b)); });
    return u;
  }
  function lensDots(seed = 5, N = 6) {
    return memo('lensdots' + seed + N, () => {
      const r = K.rng(seed), pts = [];
      let guard = 0;
      while (pts.length < N && guard++ < 500) {
        const a = r() * Math.PI * 2, d = 40 + r() * 92, p = { x: Math.cos(a) * d * 1.15, y: Math.sin(a) * d * 0.9 };
        if (pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) > 58)) pts.push(p);
      }
      return pts;
    });
  }
  const VIEWS = {
    curve: N => Array.from({ length: N }, (_, i) => { const x = -118 + 236 * i / (N - 1); return { x, y: 58 - 118 * Math.exp(-(x * x) / (2 * 52 * 52)) }; }),
    loop: N => Array.from({ length: N }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / N; return { x: Math.cos(a) * 96, y: Math.sin(a) * 96 }; }),
    grid: N => Array.from({ length: N }, (_, i) => ({ x: (i % 3 - 1) * 84, y: (Math.floor(i / 3) - 0.5) * 84 })),
    graph: N => Array.from({ length: N }, (_, i) => { const a = -Math.PI / 2 + Math.PI / N + i * Math.PI * 2 / N; return { x: Math.cos(a) * 104, y: Math.sin(a) * 96 }; }),
  };
  const VIEW_ORDER = ['curve', 'loop', 'grid'];
  const VIEW_COLOR = { curve: P.blue, loop: P.teal, grid: P.blue, graph: P.gold };
  function viewDeco(kind, m, cx, cy, extra) {  // structural strokes seen through a lens
    if (m <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= m; ctx.lineCap = 'round';
    const col = VIEW_COLOR[kind];
    if (kind === 'curve') {
      ctx.strokeStyle = rgba(col, 0.75); ctx.lineWidth = 2.5; ctx.beginPath();
      for (let x = -150; x <= 150; x += 4) { const y = 58 - 118 * Math.exp(-(x * x) / (2 * 52 * 52)); x === -150 ? ctx.moveTo(cx + x, cy + y) : ctx.lineTo(cx + x, cy + y); }
      ctx.stroke(); ctx.fillStyle = rgba(col, 0.25); ctx.fillRect(cx - 150, cy + 74, 300, 1.5);
    } else if (kind === 'loop') {
      ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 96, -Math.PI / 2 + 0.25, -Math.PI / 2 + Math.PI * 2 - 0.25); ctx.stroke();
      const a = -Math.PI / 2 - 0.25, hx = cx + Math.cos(a) * 96, hy = cy + Math.sin(a) * 96;
      ctx.beginPath(); ctx.moveTo(hx - 12, hy - 9); ctx.lineTo(hx, hy); ctx.lineTo(hx - 12, hy + 10); ctx.stroke();
    } else if (kind === 'grid') {
      ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 84, cy - 90); ctx.lineTo(cx + i * 84, cy + 90); ctx.stroke(); }
      for (const j of [-0.5, 0.5]) { ctx.beginPath(); ctx.moveTo(cx - 130, cy + j * 84); ctx.lineTo(cx + 130, cy + j * 84); ctx.stroke(); }
    } else if (kind === 'graph') {
      const pts = VIEWS.graph(6), ep = extra == null ? 1 : extra;
      const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3], [1, 4], [2, 5]];
      edges.forEach(([a, b], k) => {
        const p = ease.inOut(prog(ep, k / edges.length * 0.6, k / edges.length * 0.6 + 0.4)); if (p <= 0) return;
        const A = pts[a], B = pts[b];
        ctx.strokeStyle = rgba(P.ink, k >= 6 ? 0.22 : 0.42); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx + A.x, cy + A.y); ctx.lineTo(cx + lerp(A.x, B.x, p), cy + lerp(A.y, B.y, p)); ctx.stroke();
      });
    }
    ctx.restore();
  }
  T.register('lens', {
    draw(ctx_, V, lt, api) {
      const plan = lensPlan(V, api), u = lensU(plan, lt);
      const cx = 960, cy = 478, N = 6, raw = lensDots(V.seed || 5, N);
      const views = plan.order.map((_, i) => i === plan.pick ? 'graph' : ((V.views && V.views[i]) || VIEW_ORDER[i % VIEW_ORDER.length]));
      const settleP = ease.inOut(prog(lt, plan.settle + 0.1, plan.settle + 1.2));
      // the thing itself: loose, unstructured dots
      const da = ease.out(prog(lt, 0.15, 0.9));
      raw.forEach((p, j) => dot(cx + p.x, cy + p.y, 6.5, P.dim, { alpha: da * (0.35 + 0.5 * ease.out(prog(lt, 0.15 + j * 0.07, 0.8 + j * 0.07))) }));
      // caption above: the event
      if (V.x) {
        const f = fu(lt, 0.3, 0.8);
        text(V.x, cx, cy - LENS_R - 70, { size: 34, family: F.sans, weight: 400, color: P.ink, alpha: 0.72 * f.a, align: 'center', spacing: 6 });
        const hw = 40 * f.a; ctx.save(); ctx.globalAlpha *= 0.4 * f.a; ctx.fillStyle = P.ink;
        const tw = measure(V.x, { size: 34, family: F.sans, spacing: 6 }) / 2 + 18;
        ctx.fillRect(cx - tw - hw, cy - LENS_R - 82, hw, 1.2); ctx.fillRect(cx + tw, cy - LENS_R - 82, hw, 1.2); ctx.restore();
      }
      // lenses sliding right -> left, one stops at the centre
      plan.order.forEach((name, i) => {
        const isPick = i === plan.pick;
        const lx = cx + (i - u) * LENS_GAP, dx = Math.abs(lx - cx);
        const la = 1 - ease.inOut(prog(dx, LENS_R * 1.4, LENS_R * 3.1));
        if (la <= 0.001) return;
        const R = LENS_R * (isPick ? 1 + 0.1 * settleP : 1);
        const focus = ease.inOut(clamp(1 - dx / (LENS_R * 1.25)));
        const kind = views[i], vp = VIEWS[kind](N);
        ctx.save(); ctx.globalAlpha *= la;
        // glass: hide the loose view, show this discipline's view of the same dots
        ctx.save(); ctx.beginPath(); ctx.arc(lx, cy, R, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = rgba(P.bg, 0.985); ctx.fillRect(lx - R, cy - R, R * 2, R * 2);
        const gg = ctx.createRadialGradient(lx - R * 0.3, cy - R * 0.4, 0, lx, cy, R);
        gg.addColorStop(0, rgba(P.ink, 0.07)); gg.addColorStop(1, rgba(P.ink, 0.015));
        ctx.fillStyle = gg; ctx.fillRect(lx - R, cy - R, R * 2, R * 2);
        viewDeco(kind, focus, cx, cy, isPick ? settleP : 1);
        raw.forEach((p, j) => {
          const q = vp[j], x = cx + lerp(p.x, q.x, focus), y = cy + lerp(p.y, q.y, focus);
          const col = kind === 'graph' ? mix(P.ink, j % 2 ? P.teal : P.gold, settleP * 0.9 + focus * 0.1) : mix(P.dim, VIEW_COLOR[kind], focus);
          dot(x, y, lerp(6.5, kind === 'graph' ? 10 : 7.5, focus), col, { glow: kind === 'graph' ? 12 * settleP : 0 });
        });
        ctx.restore();
        // rim
        const rimC = isPick ? mix(P.ink, P.gold, settleP) : P.ink;
        ring(lx, cy, R, rimC, { lineWidth: 3, alpha: 0.85 });
        ring(lx, cy, R - 9, rimC, { lineWidth: 1, alpha: 0.18 });
        ctx.save(); ctx.strokeStyle = rgba(P.ink, 0.28); ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(lx, cy, R - 20, Math.PI * 1.08, Math.PI * 1.32); ctx.stroke(); ctx.restore();
        // discipline name
        const nameC = isPick ? mix(P.ink, P.gold, settleP) : P.ink;
        text(name, lx, cy + R + 76, { size: isPick ? lerp(40, 46, settleP) : 40, family: F.serif, weight: 600, color: nameC, align: 'center', spacing: 6, alpha: 0.35 + 0.65 * focus });
        ctx.restore();
      });
    },
    cues(V, api) {
      const plan = lensPlan(V, api);
      return [...plan.moves.map(m => ({ t: m.a, type: 'whoosh', dur: +(m.b - m.a).toFixed(2) })), { t: plan.settle + 0.1, type: 'pop' }];
    },
  });

  // =====================================================================
  // endcard — 片尾
  // =====================================================================
  T.register('endcard', {
    draw(ctx_, V, lt, api) {
      const cx = 960, lines = V.lines || [];
      let main = String(V.title || ''), sub = V.subtitle || null;
      if (!sub && main.includes('：')) { const i = main.indexOf('：'); sub = main.slice(i + 1); main = main.slice(0, i); }
      const hT = 96 + (sub ? 64 : 0), hL = 70 + lines.length * 52, top = 530 - (hT + hL) / 2;
      const f = fu(lt, 0.3, 1.0);
      text(main, cx + 8, top + 80 + f.dy * 0.5, { size: 80, family: F.serif, weight: 600, color: P.ink, align: 'center', spacing: 16, alpha: f.a });
      if (sub) { const s = fu(lt, 0.8, 0.9); text(sub, cx + 4, top + 80 + 64, { size: 34, family: F.sans, weight: 400, color: P.gold, align: 'center', spacing: 8, alpha: 0.9 * s.a }); }
      const rp = ease.inOut(prog(lt, 1.0, 2.0)), rw = 80 * rp, ry = top + hT + 30;
      ctx.save(); ctx.fillStyle = rgba(P.ink, 0.3); ctx.fillRect(cx - rw / 2, ry, rw, 1.5); ctx.restore();
      lines.forEach((l, k) => {
        const s = fu(lt, 1.5 + k * 0.4, 0.9);
        text(l, cx, ry + 70 + k * 52 + s.dy * 0.4, { size: 28, family: F.sans, weight: 400, color: P.dim, align: 'center', spacing: 1, alpha: s.a });
      });
      // last second: fade the whole frame to black (independent of the beat's own fade)
      const b = ease.inOut(prog(lt, api.dur - 1.0, api.dur - 0.05));
      if (b > 0) { ctx.save(); ctx.globalAlpha = b; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080); ctx.restore(); }
    },
    cues(V, api) { return [{ t: 0.3, type: 'chime' }]; },
  });
})();
