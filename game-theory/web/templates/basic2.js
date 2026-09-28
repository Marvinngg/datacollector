/* basic2.js — generic templates for silent (no-narration) films: the words on screen are the content.
 * Every word comes from beat.visual (V) or beat.lines; nothing is specific to one film.
 *
 *   question        {q, options[], answer, note?, label?}   read → pause (quiet countdown) → reveal, from api.phases
 *                   cues: question, tick per option, countdown {dur}, reveal
 *   line            {highlight?[]}   big serif screens from beat.lines; the previous sentence shrinks up as context,
 *                   lines marked pause get a gold hairline and then hold perfectly still.   cue: tick per line
 *   breath          {num, title, next}   quiet end-of-episode card: "第 N 集 · 标题"  —  下一集《next》   cue: tick
 *   knowledge_tree  {root, branches:[{name, leaves[]}]}   a tree grows from the root; each branch sprouts a twig
 *                   whose leaves light up one by one like fruit; the whole tree then holds still.   cues: tick, chime
 *
 * Eye-friendly by design: slow eases, large type, at most two things in motion at once, and still frames after
 * key sentences. Every frame is a pure function of lt; layout caches are keyed by content only. */
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

  // ================= typography =================
  const fontsReady = () => !document.fonts || document.fonts.status === 'loaded';
  const cache = new Map();
  function memo(key, fn) {
    if (cache.has(key)) return cache.get(key);
    const v = fn(); if (fontsReady()) cache.set(key, v); return v;
  }
  const okey = o => [o.size, o.family, o.weight, o.spacing].join(',');
  const chars = s => Array.from(String(s));
  const dispTrim = s => String(s).replace(/[。．]$/, '');
  const readChars = s => String(s).replace(/[\s，。、：；？！,.:;?!…—“”「」（）()·≠+\-=]/g, '').length;

  function charLayout(str, o) {
    return memo('c|' + str + '|' + okey(o), () => {
      const cs = chars(str), xs = []; let acc = '';
      for (const c of cs) { xs.push(measure(acc, o)); acc += c; }
      return { cs, xs, w: measure(str, o) - (o.spacing || 0) };
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
        const score = Math.abs(wa - wb) + ('。；！？'.includes(cs[i]) ? -300 : cs[i] === '：' ? -120 : 0);
        if (!best || score < best.score) best = { score, lines: [a, b] };
      }
      if (best) return best.lines;
      const rows = Math.ceil(w / maxW), per = Math.ceil(cs.length / rows), out = [];
      for (let i = 0; i < cs.length; i += per) out.push(cs.slice(i, i + per).join(''));
      return out;
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
  /** draw one line glyph by glyph.
   *  opt: align, color, alpha, mask, hl, hlP, glow (px), glowA, reveal {lt, t0, per, d, blur, rise} */
  function glyphs(str, x, y, o, opt = {}) {
    const L = charLayout(str, o), align = opt.align || 'left';
    // optical centring: a trailing full-width comma/stop leaves half an em of empty box
    const tail = align === 'center' && '，。、；：？！'.includes(L.cs[L.cs.length - 1]) ? o.size * 0.25 : 0;
    const x0 = align === 'center' ? x - L.w / 2 + tail : align === 'right' ? x - L.w : x;
    const r = opt.reveal, base = opt.alpha == null ? 1 : opt.alpha, col0 = opt.color || P.ink;
    ctx.save();
    const g0 = ctx.globalAlpha;
    ctx.font = K.font(o.size, o.family, o.weight); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < L.cs.length; i++) {
      let a = 1;
      if (r) a = ease.out(prog(r.lt, r.t0 + i * r.per, r.t0 + i * r.per + r.d));
      if (a <= 0.002) continue;
      const hl = opt.mask && opt.mask[i];
      const color = hl ? mix(col0, opt.hl || P.ember, opt.hlP == null ? 1 : opt.hlP) : col0;
      ctx.globalAlpha = g0 * base * a;
      ctx.fillStyle = color;
      ctx.filter = r && r.blur && a < 1 ? `blur(${((1 - a) * r.blur).toFixed(2)}px)` : 'none';
      const glow = (opt.glow || 0) * (hl ? 1 + 0.8 * (opt.hlP || 0) : 1);
      if (glow) { ctx.shadowColor = rgba(color, (opt.glowA || 0.3) * (hl ? 1 + (opt.hlP || 0) : 1)); ctx.shadowBlur = glow; }
      else ctx.shadowBlur = 0;
      ctx.fillText(L.cs[i], x0 + L.xs[i], y + (r ? (1 - a) * (r.rise || 0) : 0));
    }
    ctx.restore();
    return L.w;
  }
  const revealEnd = (n, t0, per, d) => t0 + Math.max(0, n - 1) * per + d;
  /** a thin gold hairline unfolding from the centre, with a bead in the middle */
  function hairline(cx, y, w, p, a = 1, color = P.gold) {
    if (p <= 0 || a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = rgba(color, 0.7); ctx.fillRect(cx - w * p / 2, y - 0.75, w * p, 1.5);
    dot(cx, y, 3.2 * ease.out(clamp(p * 1.6 - 0.6)), color);
    ctx.restore();
  }
  function flankLabel(str, cx, y, a, o) {   // small spaced label with short hairlines on both sides
    if (a <= 0) return;
    text(str, cx + (o.spacing || 0) / 2, y, { ...o, align: 'center', alpha: a });
    const hw = 34 * a, lw = measure(str, o) / 2 + 22;
    ctx.save(); ctx.globalAlpha *= a * 0.6; ctx.fillStyle = o.color || P.gold;
    ctx.fillRect(cx - lw - hw, y - o.size * 0.36, hw, 1.5); ctx.fillRect(cx + lw, y - o.size * 0.36, hw, 1.5); ctx.restore();
  }

  // =====================================================================
  // question — 选择题：读题 → 停顿（倒计时）→ 揭晓
  // =====================================================================
  const Q_CARD_W = 486, Q_GAP = 38, Q_OPT = { size: 40, family: F.sans, weight: 500, spacing: 1 };
  function qLayout(V) {
    const q = String(V.q || ''), opts = V.options || [];
    return memo('qL|' + q + '|' + opts.join('|'), () => {
      // "context。question？" -> quieter context line above the question itself
      let ctxLine = null, qLine = dispTrim(q);
      const cs = chars(q), cut = cs.slice(0, -1).lastIndexOf('。');
      if (cut > 0 && cs.length > 12) { ctxLine = cs.slice(0, cut).join(''); qLine = cs.slice(cut + 1).join(''); }
      const qO = { size: 66, family: F.serif, weight: 600, spacing: 3 }, cO = { size: 46, family: F.serif, weight: 600, spacing: 2 };
      let qRows = balance(qLine, 1500, qO);
      const cRows = ctxLine ? balance(ctxLine, 1500, cO) : [];
      const n = opts.length, w = Math.min(Q_CARD_W, (1640 - (n - 1) * Q_GAP) / Math.max(1, n)), inner = w - 60;
      const oRows = opts.map(s => balance(String(s), inner, Q_OPT));
      const maxRows = Math.max(1, ...oRows.map(r => r.length));
      const h = 150 + (maxRows - 1) * 52;
      const qY = ctxLine ? 384 : 372 - (qRows.length - 1) * 46;
      return { ctxLine, cRows, qRows, qO, cO, qY, w, h, oRows, n, top: 478 };
    });
  }
  function qPhases(api) {
    if (api.phases) return api.phases;
    const d = api.dur, rv = Math.max(2.4, d * 0.15), pz = Math.min(6, d * 0.3);
    return { read: [0, d - rv - pz], pause: [d - rv - pz, d - rv], reveal: [d - rv, d] };
  }
  function qTimes(V, api) {
    const ph = qPhases(api), opts = V.options || [];
    const tQ = 0.3, qRead = 1.0 + readChars(V.q || '') / 4.2;
    const a = tQ + clamp(0.55 * qRead + 0.6, 1.6, 4.0), b = Math.max(a, ph.read[1] - 1.6);
    const gaps = opts.slice(0, -1).map(o => Math.max(0.7, 0.8 + readChars(o) / 4.2));
    const sum = gaps.reduce((s, g) => s + g, 0), k = sum > 0 ? Math.min(1, (b - a) / sum) : 1;
    const tOpt = [a]; gaps.forEach(g => tOpt.push(tOpt[tOpt.length - 1] + Math.max(0.6, g * k)));
    return { ph, tQ, tOpt };
  }
  function qIndex(api) {   // "问题 03": position of this question among all question beats of the film
    const TL = window.T && T.TL; if (!TL) return null;
    const qs = TL.beats.filter(b => b.visual.type === 'question');
    const i = qs.findIndex(b => b.id === api.beat.id);
    return i < 0 ? null : i + 1;
  }
  function drawCheck(x, y, s, color, p) {   // hand-drawn tick mark, stroked progressively
    if (p <= 0) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const A = [x - s * 0.5, y], B = [x - s * 0.12, y + s * 0.38], C = [x + s * 0.55, y - s * 0.42];
    const l1 = Math.hypot(B[0] - A[0], B[1] - A[1]), l2 = Math.hypot(C[0] - B[0], C[1] - B[1]), L = (l1 + l2) * p;
    ctx.beginPath(); ctx.moveTo(A[0], A[1]);
    if (L <= l1) ctx.lineTo(lerp(A[0], B[0], L / l1), lerp(A[1], B[1], L / l1));
    else { ctx.lineTo(B[0], B[1]); ctx.lineTo(lerp(B[0], C[0], (L - l1) / l2), lerp(B[1], C[1], (L - l1) / l2)); }
    ctx.stroke(); ctx.restore();
  }
  T.register('question', {
    draw(ctx_, V, lt, api) {
      const Lq = qLayout(V), { ph, tQ, tOpt } = qTimes(V, api), cx = 960;
      const [p0, p1] = ph.pause, r0 = ph.reveal[0];
      const ans = V.answer == null ? -1 : V.answer;
      const rp = ease.inOut(prog(lt, r0, r0 + 0.8));                 // reveal progress
      const breathW = K.window(lt, p0, r0, 1.2, 0.6);                  // options breathe only while we wait

      // soft light behind the question, very slow
      const ga = ease.out(prog(lt, tQ, tQ + 2.0));
      ctx.save(); ctx.translate(cx, Lq.qY - 20); ctx.scale(2.2, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 380);
      g.addColorStop(0, rgba(P.warm, 0.045 * ga)); g.addColorStop(1, rgba(P.warm, 0));
      ctx.fillStyle = g; ctx.fillRect(-400, -400, 800, 800); ctx.restore();

      // kicker — 问题 03
      const idx = qIndex(api);
      const label = V.label || (idx ? `问题 ${String(idx).padStart(2, '0')}` : '问题');
      flankLabel(label, cx, Lq.ctxLine ? 212 : 226, ease.out(prog(lt, 0.1, 0.9)), { size: 26, family: F.sans, weight: 500, color: P.gold, spacing: 5 });

      // question: from blur to clear
      const rv = { lt, t0: tQ, per: 0.035, d: 1.5, blur: 14, rise: 0 };
      if (Lq.ctxLine) {
        Lq.cRows.forEach((r, k) => glyphs(r, cx, Lq.qY - 84 - (Lq.cRows.length - 1 - k) * 62, Lq.cO,
          { align: 'center', color: P.ink, alpha: 0.72, reveal: rv, glow: 10, glowA: 0.18 }));
      }
      const qt0 = Lq.ctxLine ? tQ + 0.45 : tQ;
      Lq.qRows.forEach((r, k) => glyphs(r, cx, Lq.qY + k * 92, Lq.qO,
        { align: 'center', color: P.ink, reveal: { ...rv, t0: qt0 }, glow: 16, glowA: 0.28 }));

      // options
      const n = Lq.n, w = Lq.w, h = Lq.h, rowW = n * w + (n - 1) * Q_GAP, top = Lq.top + (Lq.qRows.length - 1) * 46;
      (V.options || []).forEach((opt, i) => {
        const f = ease.out(prog(lt, tOpt[i], tOpt[i] + 0.9)); if (f <= 0) return;
        const isAns = i === ans;
        const x = cx - rowW / 2 + i * (w + Q_GAP), y = top + (1 - f) * 22, ocx = x + w / 2;
        const br = breathW * Math.sin((lt - p0) * Math.PI * 2 / 5.2 - i * 1.1);
        const s = isAns ? 1 + 0.05 * ease.out(prog(lt, r0, r0 + 0.9)) : 1 + 0.006 * br;
        const dim = isAns ? 0 : rp;
        ctx.save(); ctx.globalAlpha *= f * lerp(1, 0.3, dim);
        ctx.translate(ocx, y + h / 2); ctx.scale(s, s); ctx.translate(-ocx, -(y + h / 2));
        // card
        const strokeA = 0.2 + 0.08 * br * (isAns ? 1 - rp : 1);
        if (isAns && rp > 0) { ctx.save(); ctx.shadowColor = rgba(P.ok, 0.5 * rp); ctx.shadowBlur = 30 * rp; panel(x, y, w, h, { r: 18, fill: 'rgba(16,21,30,0.9)', stroke: rgba(P.ok, 0.9 * rp), lineWidth: 2.5 }); ctx.restore(); }
        else panel(x, y, w, h, { r: 18, fill: 'rgba(16,21,30,0.84)', stroke: rgba(P.ink, strokeA), lineWidth: 1.5 });
        if (isAns && rp > 0) { ctx.save(); ctx.globalAlpha *= 0.08 * rp; K.rrect(x, y, w, h, 18); ctx.fillStyle = P.ok; ctx.fill(); ctx.restore(); }
        // letter badge
        const by = y + 48, letter = String.fromCharCode(65 + i);
        const badgeC = isAns ? mix(P.gold, P.ok, rp) : P.gold;
        if (isAns && rp > 0) dot(ocx, by, 22, badgeC, { alpha: rp });
        ring(ocx, by, 22, badgeC, { lineWidth: 1.5, alpha: 0.75 });
        if (isAns && rp > 0) {
          text(letter, ocx, by + 9.5, { size: 26, family: F.mono, weight: 700, color: badgeC, align: 'center', alpha: 1 - ease.out(prog(lt, r0, r0 + 0.4)) });
          drawCheck(ocx, by, 17, P.bg, ease.inOut(prog(lt, r0 + 0.25, r0 + 0.8)));
        } else text(letter, ocx, by + 9.5, { size: 26, family: F.mono, weight: 400, color: P.gold, align: 'center' });
        // option text
        const rows = Lq.oRows[i], ty = y + 118;
        rows.forEach((r, k) => text(r, ocx + Q_OPT.spacing / 2, ty + k * 52, { ...Q_OPT, color: P.ink, align: 'center', alpha: isAns ? lerp(0.92, 1, rp) : 0.92 }));
        ctx.restore();
        // note beside the answer ("数学上的答案")
        if (isAns && V.note) {
          const na = ease.out(prog(lt, r0 + 0.6, r0 + 1.4));
          if (na > 0) {
            const ny = top + h * 1.025 + 58 + (1 - na) * 10;
            ctx.save(); ctx.globalAlpha *= na * 0.6; ctx.fillStyle = P.ok; ctx.fillRect(ocx - 0.75, top + h * 1.025 + 8, 1.5, 18 * na); ctx.restore();
            text(V.note, ocx + 2, ny, { size: 30, family: F.sans, weight: 500, color: P.ok, align: 'center', spacing: 4, alpha: na });
          }
        }
      });

      // quiet countdown: a thin ring slowly closing, "想一想" at its heart
      const ca = Math.min(ease.out(prog(lt, p0 - 0.2, p0 + 0.9)), 1 - ease.inOut(prog(lt, r0 - 0.1, r0 + 0.5)));
      if (ca > 0) {
        const R = 90, ry = Math.min(top + h + 44 + R, 872 - R);
        const cp = prog(lt, p0 + 0.3, p1 - 0.15);
        ctx.save(); ctx.globalAlpha *= ca;
        ring(cx, ry, R, P.ink, { lineWidth: 2, alpha: 0.13 });
        if (cp > 0) {
          const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * cp;
          ctx.save(); ctx.strokeStyle = rgba(P.gold, 0.85); ctx.lineWidth = 3.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(cx, ry, R, a0, a1); ctx.stroke(); ctx.restore();
          dot(cx + Math.cos(a1) * R, ry + Math.sin(a1) * R, 5.5, P.warm, { glow: 14 });
        }
        text('想一想', cx + 3, ry + 11, { size: 32, family: F.sans, weight: 400, color: P.ink, align: 'center', spacing: 6, alpha: 0.75 });
        ctx.restore();
      }
    },
    cues(V, api) {
      const { ph, tQ, tOpt } = qTimes(V, api);
      return [{ t: tQ, type: 'question' }, ...tOpt.map(t => ({ t, type: 'tick' })),
        { t: ph.pause[0], type: 'countdown', dur: +(ph.pause[1] - ph.pause[0]).toFixed(2) },
        { t: ph.reveal[0], type: 'reveal' }];
    },
  });

  // =====================================================================
  // line — 大字屏：一屏一句；上一句缩小上移作为语境
  // =====================================================================
  const LINE_CY = 520, CTX_S = 0.56, CTX_GAP = 70;
  function lineLayout(str) {
    return memo('lL|' + str, () => {
      let o = { size: 70, family: F.serif, weight: 600, spacing: 3 };
      let rows = balance(dispTrim(str), 1520, o);
      if (rows.length > 2) { o = { ...o, size: 60 }; rows = balance(dispTrim(str), 1560, o); }
      const lh = Math.round(o.size * 1.5), w = Math.max(...rows.map(r => charLayout(r, o).w));
      return { o, rows, lh, h: rows.length * lh, w, n: rows.reduce((s, r) => s + chars(r).length, 0) };
    });
  }
  function linePlan(api) {
    const ls = (api.beat.lines || []).map((l, k) => ({ text: l.text, pause: !!l.pause, ...api.line(k), L: lineLayout(l.text) }));
    ls.forEach((l, k) => {
      const prev = ls[k - 1];
      l.cy = prev ? LINE_CY + (prev.L.h * CTX_S + CTX_GAP) / 2 : LINE_CY;     // centre as the main sentence
      l.t0 = l.start + (prev ? 0.35 : 0.05);
      l.per = Math.min(0.055, 1.1 / Math.max(1, l.L.n));
      l.done = revealEnd(l.L.n, l.t0, l.per, 0.8);
    });
    ls.forEach((l, k) => {
      const nx = ls[k + 1];
      if (nx) l.ctxY = nx.cy - nx.L.h / 2 - CTX_GAP - l.L.h * CTX_S / 2;   // centre once it becomes context
    });
    return ls;
  }
  T.register('line', {
    draw(ctx_, V, lt, api) {
      const ls = linePlan(api), cx = 960, words = V.highlight || [];
      // warm light gathering behind the current sentence (heavier for key sentences), then still
      ls.forEach((l, k) => {
        const n1 = ls[k + 1];
        const a = ease.out(prog(lt, l.t0, l.done + 0.6)) * (n1 ? 1 - ease.inOut(prog(lt, n1.start - 0.3, n1.start + 0.6)) : 1);
        if (a <= 0) return;
        ctx.save(); ctx.translate(cx, l.cy); ctx.scale(2.1, 1);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
        g.addColorStop(0, rgba(P.warm, (l.pause ? 0.07 : 0.045) * a)); g.addColorStop(1, rgba(P.warm, 0));
        ctx.fillStyle = g; ctx.fillRect(-420, -420, 840, 840); ctx.restore();
      });
      ls.forEach((l, k) => {
        const n1 = ls[k + 1], n2 = ls[k + 2];
        const pMove = n1 ? ease.inOut(prog(lt, n1.start - 0.15, n1.start + 0.95)) : 0;
        const pGone = n2 ? ease.inOut(prog(lt, n2.start - 0.4, n2.start + 0.3)) : 0;
        if (lt < l.t0 - 0.05 || pGone >= 1) return;
        const cy = lerp(l.cy, n1 ? l.ctxY : l.cy, pMove) - pGone * 60;
        const s = lerp(1, CTX_S, pMove), alpha = lerp(1, 0.5, pMove) * (1 - pGone);
        const hlP = ease.inOut(prog(lt, l.done - 0.2, l.done + 0.7));
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
        const L = l.L, y0 = cy - L.h / 2 + L.lh * 0.5 + L.o.size * 0.36;
        let k0 = 0;
        L.rows.forEach((r, j) => {
          glyphs(r, cx + L.o.spacing / 2, y0 + j * L.lh, L.o, {
            align: 'center', color: P.ink, alpha, mask: hlMask(r, words), hl: P.ember, hlP,
            glow: 18, glowA: 0.22, reveal: { lt, t0: l.t0 + k0 * l.per, per: l.per, d: 0.8, blur: 9, rise: 10 },
          });
          k0 += chars(r).length;
        });
        // key sentence: a hairline settles under it, then everything holds still
        if (l.pause) hairline(cx, cy + L.h / 2 + 34, Math.min(L.w * 0.5, 380), ease.inOut(prog(lt, l.done - 0.1, l.done + 1.1)), alpha * (1 - pMove));
        ctx.restore();
      });
    },
    cues(V, api) { return linePlan(api).map(l => ({ t: l.t0, type: 'tick' })); },
  });

  // =====================================================================
  // breath — 集间呼吸卡
  // =====================================================================
  T.register('breath', {
    draw(ctx_, V, lt, api) {
      const cx = 960, cy = 520, d = api.dur;
      const t1 = 0.25, t2 = Math.min(1.1, d * 0.3);
      const head = [V.num, V.title].filter(Boolean).join(' · ');
      const hO = { size: 30, family: F.sans, weight: 400, spacing: 3 };
      const f1 = ease.out(prog(lt, t1, t1 + 0.9));
      text(head, cx + 3, cy - 44 + (1 - f1) * 8, { ...hO, color: P.ink, align: 'center', alpha: 0.62 * f1 });
      hairline(cx, cy, 260, ease.inOut(prog(lt, t1 + 0.3, t1 + 1.7)), 0.85);
      if (V.next) {
        const f2 = ease.out(prog(lt, t2, t2 + 1.0));
        const kO = { size: 28, family: F.sans, weight: 400, spacing: 6 }, nO = { size: 46, family: F.serif, weight: 600, spacing: 3 };
        const nx = `《${V.next}》`, kw = measure('下一集', kO), nw = measure(nx, nO), gap = 2, x0 = cx - (kw + gap + nw) / 2;
        const y = cy + 82 + (1 - f2) * 10;
        text('下一集', x0, y - 4, { ...kO, color: P.gold, alpha: 0.72 * f2 });
        text(nx, x0 + kw + gap, y, { ...nO, color: P.gold, alpha: f2, glow: 14 * f2, glowColor: rgba(P.gold, 0.35) });
      }
    },
    cues(V, api) { return [{ t: Math.min(1.1, api.dur * 0.3), type: 'tick' }]; },
  });

  // =====================================================================
  // knowledge_tree — 片尾知识树
  // =====================================================================
  const KT = { rootY: 842, trunkY0: 800, forkY: 704, pillY: 588, pillH: 56, rowGap: 60, leafO: { size: 32, family: F.sans, weight: 400, spacing: 1 } };
  const KT_COLORS = ['gold', 'teal', 'blue', 'ember', 'ok'];
  function ktLayout(V) {
    const bs = V.branches || [];
    return memo('kt|' + JSON.stringify(bs), () => {
      const n = bs.length, S = n > 1 ? Math.min(330, 1480 / (n - 1)) : 0;
      const maxLeaves = Math.max(1, ...bs.map(b => (b.leaves || []).length));
      const rowGap = Math.min(KT.rowGap, (KT.pillY - KT.pillH / 2 - 60 - 190) / Math.max(1, maxLeaves - 1));
      const nameO = { size: 32, family: F.serif, weight: 600, spacing: 3 };
      const branches = bs.map((b, i) => {
        const x = 960 + (i - (n - 1) / 2) * S;
        const leaves = (b.leaves || []).map((name, j) => {
          const w = measure(name, KT.leafO);
          let side = j % 2 === 0 ? 1 : -1;
          if (side > 0 && x + 40 + w > 1790) side = -1;
          if (side < 0 && x - 40 - w < 130) side = 1;
          return { name, side, w, y: KT.pillY - KT.pillH / 2 - 52 - j * rowGap };
        });
        return { name: b.name, x, leaves, pw: measure(b.name, nameO) + 56, col: P[b.color] || P[KT_COLORS[i % KT_COLORS.length]] };
      });
      return { branches, nameO, rowGap };
    });
  }
  function ktTimes(V, api) {
    const n = (V.branches || []).length, d = api.dur;
    const grow = 2.7, a = 1.5, end = Math.max(a + grow + 1, d - 3.4);
    const step = n > 1 ? (end - grow - a) / (n - 1) : 0;
    return { a, step, end, bt: Array.from({ length: n }, (_, i) => a + i * step) };
  }
  function bezPt(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  }
  function strokePartial(pts, p) {   // polyline growing to fraction p of its sample count
    const m = Math.max(1, Math.floor((pts.length - 1) * p)), f = (pts.length - 1) * p - m;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= m && i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (m + 1 < pts.length && f > 0) ctx.lineTo(lerp(pts[m][0], pts[m + 1][0], f), lerp(pts[m][1], pts[m + 1][1], f));
    ctx.stroke();
  }
  T.register('knowledge_tree', {
    draw(ctx_, V, lt, api) {
      const Lk = ktLayout(V), tm = ktTimes(V, api), cx = 960;
      const done = ease.inOut(prog(lt, tm.end - 0.9, tm.end + 0.5));   // final warm bloom, then stillness
      // crown glow
      const ga = ease.out(prog(lt, 0.4, tm.end)) * 0.6 + 0.4 * done;
      ctx.save(); ctx.translate(cx, 430); ctx.scale(2.3, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
      g.addColorStop(0, rgba(P.warm, 0.055 * ga)); g.addColorStop(1, rgba(P.warm, 0));
      ctx.fillStyle = g; ctx.fillRect(-420, -420, 840, 840); ctx.restore();

      // root
      const rf = ease.out(prog(lt, 0.2, 1.2));
      text(V.root || '', cx + 4, KT.rootY + (1 - rf) * 10, { size: 50, family: F.serif, weight: 600, color: mix(P.ink, P.gold, 0.35 + 0.4 * done), align: 'center', spacing: 8, alpha: rf, glow: 16 + 10 * done, glowColor: rgba(P.gold, 0.35) });
      // trunk
      const tp = ease.inOut(prog(lt, 0.7, 1.7));
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(mix(P.ink, P.gold, 0.4), 0.55); ctx.lineWidth = 3.5;
      if (tp > 0) { ctx.beginPath(); ctx.moveTo(cx, KT.trunkY0); ctx.lineTo(cx, lerp(KT.trunkY0, KT.forkY, tp)); ctx.stroke(); }
      ctx.restore();
      if (tp >= 1) dot(cx, KT.forkY, 4, mix(P.ink, P.gold, 0.5), { alpha: 0.8 });

      Lk.branches.forEach((b, i) => {
        const t0 = tm.bt[i];
        // limb: from the fork, sweeping out and turning up into the branch's name
        const P0 = [cx, KT.forkY], P3 = [b.x, KT.pillY + KT.pillH / 2];
        const dx = b.x - cx;
        const P1 = [cx + dx * 0.12, KT.forkY - 34], P2 = [b.x, KT.forkY + 8 - Math.abs(dx) * 0.02];
        const pts = memo('ktl|' + i + '|' + b.x, () => Array.from({ length: 41 }, (_, k) => bezPt(P0, P1, P2, P3, k / 40)));
        const lp = ease.inOut(prog(lt, t0, t0 + 1.0));
        if (lp > 0) {
          ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          const lg = ctx.createLinearGradient(P0[0], P0[1], P3[0], P3[1]);   // trunk colour -> the branch's own colour
          lg.addColorStop(0, rgba(mix(P.ink, P.gold, 0.4), 0.5)); lg.addColorStop(1, rgba(b.col, 0.7));
          ctx.strokeStyle = lg; ctx.lineWidth = 2.6;
          strokePartial(pts, lp); ctx.restore();
          if (lp < 1) { const q = bezPt(P0, P1, P2, P3, lp); dot(q[0], q[1], 3.5, b.col, { glow: 10, alpha: 0.9 }); }
        }
        // branch name
        const pa = ease.out(prog(lt, t0 + 0.8, t0 + 1.4));
        if (pa > 0) {
          const pw = b.pw, ph = KT.pillH;
          ctx.save(); ctx.globalAlpha *= pa;
          panel(b.x - pw / 2, KT.pillY - ph / 2 + (1 - pa) * 6, pw, ph, { r: ph / 2, fill: 'rgba(16,21,30,0.92)', stroke: rgba(b.col, 0.6 + 0.2 * done), lineWidth: 1.8 });
          text(b.name, b.x + Lk.nameO.spacing / 2, KT.pillY + 11 + (1 - pa) * 6, { ...Lk.nameO, color: b.col, align: 'center' });
          ctx.restore();
        }
        // twig rising through the leaves
        const nL = b.leaves.length; if (!nL) return;
        const tw0 = t0 + 1.2, twD = 0.45 + nL * 0.3;
        const yTop = b.leaves[nL - 1].y - 14, yBot = KT.pillY - KT.pillH / 2;
        const twp = ease.inOut(prog(lt, tw0, tw0 + twD)), tipY = lerp(yBot, yTop, twp);
        if (twp > 0) {
          ctx.save(); ctx.strokeStyle = rgba(b.col, 0.55); ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b.x, yBot); ctx.lineTo(b.x, tipY); ctx.stroke(); ctx.restore();
        }
        b.leaves.forEach((lf, j) => {
          const ay = lf.y + 16;                                   // where the leaf's stem leaves the twig
          const tl = tw0 + twD * clamp((yBot - ay) / (yBot - yTop)) * 0.92;
          const f = ease.out(prog(lt, tl, tl + 0.7)); if (f <= 0) return;
          const s = lf.side, dxl = b.x + s * 22 * f, dyl = lf.y + 2;
          ctx.save(); ctx.strokeStyle = rgba(b.col, 0.55 * f); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b.x, ay); ctx.quadraticCurveTo(b.x + s * 4, dyl + 4, dxl, dyl); ctx.stroke(); ctx.restore();
          const glowK = 1 - ease.inOut(prog(lt, tl + 0.4, tl + 1.8));          // each fruit flares once as it ripens
          dot(dxl, dyl, 6 * f, b.col, { glow: 8 + 12 * glowK + 6 * done, alpha: 0.95 });
          text(lf.name, b.x + s * 38, dyl + 12 + (1 - f) * 6, { ...KT.leafO, color: mix(P.ink, b.col, 0.45), align: s > 0 ? 'left' : 'right', alpha: f * (0.9 + 0.1 * done) });
        });
      });
    },
    cues(V, api) {
      const tm = ktTimes(V, api);
      return [{ t: 0.2, type: 'tick' }, ...tm.bt.map(t => ({ t: t + 0.8, type: 'tick' })), { t: tm.end - 0.6, type: 'chime' }];
    },
  });
})();
