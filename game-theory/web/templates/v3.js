/* v3 look-dev templates (override earlier registrations of the same type).
 * Visual rules: no panels / cards / boxes; glyphs are the material; light carries emphasis; motion is slow.
 * Types: line, remember, question, breath, matrix, sim_prisoners */
(function () {
  const { W, H, ctx, P, F, clamp, lerp, prog, ease, rng, fbm } = K;
  const INK = '#efe9dc', DIM = 'rgba(239,233,220,0.45)', GOLD = '#e9c47a', TEAL = '#7fd8cb', EMBER = '#ff9f5a', OK = '#9fe0a0';

  // ambient field made of the characters of a sentence: the text dissolves into its own texture
  function textField(lt, str, seed, alpha = 0.16, color = '#b9c4cf') {
    const chars = [...str.replace(/[，。：；、？！“”…·\s]/g, '')];
    if (!chars.length) return;
    L.field(lt, { n: 120, chars: chars.join(''), seed, alpha, color });
  }
  const currentLine = (api, lt) => { let k = -1; api.beat.lines.forEach((l, i) => { if (api.beat.start + lt >= l.start - 0.05) k = i; }); return k; };

  // ---------------- line: one sentence a screen, serif light ----------------
  T.register('line', {
    draw(ctx, V, lt, api) {
      const lines = api.beat.lines, k = currentLine(api, lt);
      if (k < 0) return;
      const t = api.beat.start + lt, hi = V.highlight || [];
      textField(lt, lines.map(l => l.text).join(''), 11 + api.beat.id.length, 0.12);
      lines.forEach((l, i) => {
        if (i > k || i < k - 1) return;
        const next = lines[i + 1];
        const isCur = i === k;
        const since = t - l.start, into = next ? t - next.start : -1;
        const str = l.text.replace(/[。]$/, '');
        // current sentence centred; the previous one rises and fades as context
        const up = isCur ? 0 : ease.inOut(clamp(into / 1.2));
        const size = lerp(74, 40, up), y = lerp(520, 330, up), a = isCur ? 1 : lerp(1, 0.4, up) * (1 - ease.in(prog(into, 4, 6)));
        const n = [...str].length, rev = clamp(since / Math.min(1.8, 0.5 + n * 0.05));
        let rows = [str];
        if (L.measureSerif(str, size) > 1560) { const c = Math.ceil(n / 2); rows = [str.slice(0, c), str.slice(c)]; }
        rows.forEach((r, j) => L.serif(r, W / 2, y + (j - (rows.length - 1) / 2) * size * 1.35,
          { size, glow: isCur ? 12 : 4, alpha: a, reveal: rev, highlight: hi, hiOn: since > 1.2, hiColor: EMBER }));
        if (isCur && l.pause) {   // a thin line of light settles under a key sentence
          const w = 360 * ease.inOut(prog(since, 1.6, 3.0));
          ctx.save(); const g = ctx.createLinearGradient(W / 2 - w / 2, 0, W / 2 + w / 2, 0);
          g.addColorStop(0, 'rgba(233,196,122,0)'); g.addColorStop(0.5, 'rgba(233,196,122,0.8)'); g.addColorStop(1, 'rgba(233,196,122,0)');
          ctx.fillStyle = g; ctx.fillRect(W / 2 - w / 2, y + size * 0.9 * rows.length, w, 1.5); ctx.restore();
        }
      });
    },
    cues(V, api) { return api.beat.lines.map(l => ({ t: l.start - api.beat.start, type: 'tick' })); },
  });

  // ---------------- remember: the key sentence of an episode ----------------
  T.register('remember', {
    draw(ctx, V, lt, api) {
      const str = (V.text || '').replace(/[。]$/, ''), n = [...str].length;
      textField(lt, str, 5 + n, 0.14, '#d9c9a8');
      const size = n > 22 ? 58 : 70;
      let rows = [str];
      if (L.measureSerif(str, size) > 1500) {
        let cut = str.indexOf('：') + 1 || str.indexOf('，') + 1 || Math.ceil(n / 2);
        rows = [str.slice(0, cut), str.slice(cut)];
      }
      const rev = clamp((lt - 0.3) / Math.min(2.4, 0.6 + n * 0.06));
      rows.forEach((r, j) => L.serif(r, W / 2, 500 + (j - (rows.length - 1) / 2) * size * 1.45, { size, glow: 14, reveal: rev }));
      const w = 420 * ease.inOut(prog(lt, 2.2, 3.6));
      L.light(W / 2, 500 + rows.length * size * 0.8, 160, 'rgba(233,196,122,0.18)', ease.out(prog(lt, 2.2, 3.6)));
      ctx.save(); ctx.fillStyle = 'rgba(233,196,122,0.75)'; ctx.fillRect(W / 2 - w / 2, 500 + rows.length * size * 0.8, w, 1.5); ctx.restore();
    },
    cues() { return [{ t: 0.3, type: 'chime' }]; },
  });

  // ---------------- question: situation → choose → pause → reveal ----------------
  let qIndex = null;
  T.register('question', {
    draw(ctx, V, lt, api) {
      if (!qIndex) { qIndex = {}; let n = 0; for (const b of T.TL.beats) if (b.visual.type === 'question') qIndex[b.id] = ++n; }
      const ph = api.phases || { read: [0, 6], pause: [6, 12], reveal: [12, 15] };
      const [p0, p1] = ph.pause, [r0] = ph.reveal;
      const t = api.beat.start + lt;
      L.field(lt, { n: 70, chars: '？', seed: 3 + qIndex[api.beat.id], alpha: 0.08, color: '#c8d2dc' });
      // label
      L.serif(`问 · ${String(qIndex[api.beat.id]).padStart(2, '0')}`, W / 2, 230, { size: 26, color: L.accent(T.TL, t), glow: 0, spacing: 12, reveal: prog(lt, 0, 0.6) });
      // question: context line (before 。) + the question itself
      const q = V.q, cut = q.indexOf('。');
      const ctxLine = cut > 0 ? q.slice(0, cut) : '', ask = cut > 0 ? q.slice(cut + 1) : q;
      if (ctxLine) L.serif(ctxLine, W / 2, 330, { size: 40, color: DIM, glow: 0, reveal: prog(lt, 0.2, 1.4) });
      L.serif(ask, W / 2, ctxLine ? 420 : 390, { size: 68, glow: 12, reveal: prog(lt, ctxLine ? 1.0 : 0.3, ctxLine ? 2.6 : 2.0) });
      // options: three words of light
      const xs = [W / 2 - 500, W / 2, W / 2 + 500], y = 610;
      const rv = ease.inOut(prog(lt, r0, r0 + 1.2));
      V.options.forEach((o, i) => {
        const tIn = lerp(1.6, p0 - 1.2, (i + 1) / 3.2);
        const a = ease.out(prog(lt, tIn, tIn + 0.9));
        const right = i === V.answer;
        const breathe = lt > p0 && lt < r0 ? 0.88 + 0.12 * Math.sin((lt - p0) * 1.3 + i * 2) : 1;
        const alpha = a * breathe * (right ? 1 : 1 - 0.8 * rv);
        const size = o.length > 6 ? 44 : 52;
        L.serif('ABC'[i], xs[i], y - 70, { size: 24, family: F.mono, color: right && rv > 0 ? OK : 'rgba(239,233,220,0.5)', glow: 0, alpha });
        if (right && rv > 0) L.light(xs[i], y, 260, 'rgba(159,224,160,0.20)', rv);
        L.serif(o, xs[i], y, { size: size * (right ? 1 + 0.06 * rv : 1), color: right && rv > 0.3 ? '#dff5d8' : INK, glow: right ? 10 + 12 * rv : 8, alpha, reveal: prog(lt, tIn, tIn + 0.8) });
        if (!right && rv > 0) { // the wrong ones dissolve: blurred ghost drifting down
          L.serif(o, xs[i], y + rv * 18, { size, color: INK, glow: 0, alpha: 0.12 * (1 - rv) });
        }
      });
      // pause: a line of light closing in from both ends, "想一想"
      const pk = prog(lt, p0, p1);
      const pa = Math.min(ease.out(prog(lt, p0 - 0.2, p0 + 0.6)), 1 - ease.in(prog(lt, r0 - 0.3, r0 + 0.4)));
      if (pa > 0) {
        const half = 520 * (1 - ease.inOut(pk));
        ctx.save(); ctx.globalAlpha = pa;
        const g = ctx.createLinearGradient(W / 2 - 520, 0, W / 2 + 520, 0);
        g.addColorStop(0, 'rgba(233,196,122,0)'); g.addColorStop(0.5, 'rgba(233,196,122,0.9)'); g.addColorStop(1, 'rgba(233,196,122,0)');
        ctx.fillStyle = g; ctx.fillRect(W / 2 - half, 752, half * 2, 2);
        ctx.restore();
        L.light(W / 2 - half, 753, 18, 'rgba(255,220,150,0.9)', pa); L.light(W / 2 + half, 753, 18, 'rgba(255,220,150,0.9)', pa);
        L.serif('想一想', W / 2, 812, { size: 30, color: 'rgba(239,233,220,0.55)', glow: 0, alpha: pa, spacing: 14 });
      }
      if (V.note && rv > 0) L.serif(V.note, xs[V.answer], y + 90, { size: 28, color: 'rgba(223,245,216,0.7)', glow: 0, alpha: rv, reveal: rv });
    },
    cues(V, api) {
      const ph = api.phases || { read: [0, 6], pause: [6, 12], reveal: [12, 15] };
      return [{ t: 0.2, type: 'question' }, { t: ph.pause[0], type: 'countdown', dur: ph.pause[1] - ph.pause[0] }, { t: ph.reveal[0], type: 'reveal' }];
    },
  });

  // ---------------- breath: between episodes ----------------
  T.register('breath', {
    draw(ctx, V, lt, api) {
      const t = api.beat.start + lt;
      L.serif(`${V.num} · ${V.title}`, W / 2, 470, { size: 30, color: 'rgba(239,233,220,0.55)', glow: 0, reveal: prog(lt, 0.2, 1.2), spacing: 8 });
      const w = 300 * ease.inOut(prog(lt, 0.6, 1.8));
      ctx.save(); ctx.fillStyle = L.accent(T.TL, t); ctx.globalAlpha = 0.6; ctx.fillRect(W / 2 - w / 2, 512, w, 1.5); ctx.restore();
      L.serif(`下一集 《${V.next}》`, W / 2, 590, { size: 48, color: L.accent(T.TL, t), glow: 12, reveal: prog(lt, 1.0, 2.2) });
    },
    cues() { return [{ t: 1.0, type: 'tick' }]; },
  });

  // ---------------- matrix: a 2×2 of light, no table ----------------
  // cells[r][c] = [row player's outcome, col player's outcome]; steps: frame, cells, compare-col, dominant, equilibrium, optimum
  T.register('matrix', {
    draw(ctx, V, lt, api) {
      const cx = W / 2 + 60, cy = 480, dx = 260, dy = 170;
      const S = (show, extra = () => true) => api.steps.map((s, i) => ({ s, i })).filter(x => x.s.show === show && extra(x.s));
      const P0 = (x, d = 0.8) => x ? api.stepP(x.i, lt, d, ease.inOut) : 0;
      const frame = S('frame')[0], cells = S('cells')[0];
      const fa = frame ? P0(frame, 1.2) : 1;
      L.field(lt, { n: 90, chars: '招默', seed: 21, alpha: 0.07, color: '#a8c8bc' });
      // hairline cross of light
      ctx.save(); ctx.globalAlpha = 0.28 * fa;
      let g = ctx.createLinearGradient(cx - 480, 0, cx + 480, 0); g.addColorStop(0, 'rgba(239,233,220,0)'); g.addColorStop(0.5, 'rgba(239,233,220,1)'); g.addColorStop(1, 'rgba(239,233,220,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - 480 * fa, cy, 960 * fa, 1.2);
      g = ctx.createLinearGradient(0, cy - 300, 0, cy + 300); g.addColorStop(0, 'rgba(239,233,220,0)'); g.addColorStop(0.5, 'rgba(239,233,220,1)'); g.addColorStop(1, 'rgba(239,233,220,0)');
      ctx.fillStyle = g; ctx.fillRect(cx, cy - 300 * fa, 1.2, 600 * fa); ctx.restore();
      // players and strategies
      L.serif(V.colPlayer, cx, cy - dy - 190, { size: 46, color: TEAL, glow: 10, alpha: fa, reveal: fa });
      L.serif(V.rowPlayer, cx - dx - 400, cy, { size: 46, color: GOLD, glow: 10, alpha: fa, reveal: fa });
      V.cols.forEach((c, j) => L.serif(c, cx + (j ? dx : -dx), cy - dy - 118, { size: 38, color: 'rgba(127,216,203,0.8)', glow: 0, alpha: fa, reveal: fa }));
      V.rows.forEach((r, i) => L.serif(r, cx - dx - 230, cy + (i ? dy : -dy), { size: 38, color: 'rgba(233,196,122,0.8)', glow: 0, alpha: fa, reveal: fa }));
      // perspective: while comparing for the row player, the column player's numbers step back
      const cmp = S('compare-col'), domCol = S('dominant', s => s.player === 'col')[0], eq = S('equilibrium')[0], opt = S('optimum')[0];
      const cmpOn = cmp.length ? P0(cmp[0], 0.8) : 0, cmpOff = domCol ? P0(domCol, 0.8) : 0;
      const tealBack = cmpOn * (1 - cmpOff);
      const optP = opt ? P0(opt, 1.2) : 0;
      const order = [[0, 0], [0, 1], [1, 0], [1, 1]];
      order.forEach(([r, c], n) => {
        const x = cx + (c ? dx : -dx), y = cy + (r ? dy : -dy);
        const ca = cells ? ease.out(prog(lt, cells.lt + n * (cells.stagger || 1.0), cells.lt + n * (cells.stagger || 1.0) + 0.9)) : 1;
        if (ca <= 0) return;
        // which gold numbers were picked in a compare (kept circled)
        const picked = cmp.some(x => x.s.col === c && x.s.pick === r && api.stepP(x.i, lt) > 0.5);
        const inCmpCol = cmp.some(x => x.s.col === c && lt >= x.s.lt && lt < x.s.lt + 4.0);
        const otherCol = cmp.some(x => x.s.col !== c && lt >= x.s.lt && lt < x.s.lt + 4.0);
        const dimAll = optP * ((r === 0 && c === 0) || (eq && r === eq.s.cell[0] && c === eq.s.cell[1]) ? 0 : 0.75);
        const goldA = ca * (otherCol ? 0.3 : 1) * (1 - dimAll);
        const tealA = ca * (1 - 0.7 * tealBack) * (1 - dimAll);
        const [gv, tv] = V.cells[r][c];
        if (picked) L.light(x - 70, y + 34, 90, 'rgba(233,196,122,0.25)', goldA);
        L.serif(gv, x - 70, y + 34, { size: 58, color: GOLD, glow: picked ? 16 : 8, alpha: goldA, reveal: ca });
        L.serif(tv, x + 70, y - 34, { size: 58, color: TEAL, glow: 8, alpha: tealA, reveal: ca });
        if (inCmpCol && !picked && r !== cmp.find(x => x.s.col === c).s.pick) {
          // a streak of light from the worse outcome to the better one
          const k = ease.inOut(prog(lt, cmp.find(x => x.s.col === c).s.lt + 0.6, cmp.find(x => x.s.col === c).s.lt + 1.8));
          const y2 = cy + (cmp.find(x => x.s.col === c).s.pick ? dy : -dy) + 34;
          ctx.save(); ctx.strokeStyle = 'rgba(233,196,122,0.7)'; ctx.lineWidth = 2; ctx.beginPath();
          ctx.moveTo(x - 70, y + 60); ctx.lineTo(x - 70, lerp(y + 60, y2 - 40, k)); ctx.stroke(); ctx.restore();
          L.light(x - 70, lerp(y + 60, y2 - 40, k), 14, 'rgba(255,220,150,0.9)', 1 - k * 0.3);
        }
      });
      // dominant strategies: a band of light along the row / column
      for (const d of S('dominant')) {
        const k = P0(d, 1.0) * (1 - optP * 0.8);
        if (d.s.player === 'row') {
          const y = cy + (d.s.index ? dy : -dy);
          L.light(cx, y, 520, 'rgba(233,196,122,0.10)', k);
          L.serif(d.s.label ? '优势策略' : '', cx + dx + 250, y, { size: 32, color: GOLD, glow: 6, alpha: k, reveal: k });
        } else {
          const x = cx + (d.s.index ? dx : -dx);
          L.light(x, cy, 420, 'rgba(127,216,203,0.10)', k);
          L.serif('优势策略', x, cy + dy + 128, { size: 32, color: TEAL, glow: 6, alpha: k, reveal: k });
        }
      }
      // equilibrium: the cell is locked in warm light; optimum: green light on the cell nobody reaches
      if (eq) {
        const k = P0(eq, 1.4), [r, c] = eq.s.cell, x = cx + (c ? dx : -dx), y = cy + (r ? dy : -dy);
        L.light(x, y, 230, 'rgba(255,159,90,0.28)', k);
        const nOrb = 18;
        for (let i = 0; i < nOrb; i++) {
          const a = i / nOrb * Math.PI * 2 + lt * 0.25, rr = 150 + 6 * Math.sin(lt * 0.8 + i);
          L.glyph('·', x + Math.cos(a) * rr * 1.25, y + Math.sin(a) * rr * 0.85, 30, EMBER, k * 0.8, { glow: 6 });
        }
        if (eq.s.label) L.serif(eq.s.label, x, y + 128, { size: 32, color: EMBER, glow: 10, alpha: k, reveal: k });
      }
      if (opt) {
        const [r, c] = opt.s.cell, x = cx + (c ? dx : -dx), y = cy + (r ? dy : -dy);
        L.light(x, y, 230, 'rgba(159,224,160,0.25)', optP);
        L.serif(opt.s.label || '', x, y + 128, { size: 32, color: OK, glow: 10, alpha: optP, reveal: optP });
      }
    },
    cues(V, api) {
      return api.steps.filter(s => s.owner === api.beat.id).map(s => ({ t: s.lt, type: s.show === 'equilibrium' ? 'pop' : s.show === 'optimum' ? 'chime' : 'tick' }));
    },
  });

  // ---------------- sim_prisoners: 100 pairs choose, row by row ----------------
  let PR = null;
  function prisoners(n = 100, counts = [1, 8, 91]) {
    if (PR) return PR;
    const r = rng(77), kinds = [];
    for (let i = 0; i < counts[0]; i++) kinds.push([0, 0]);
    for (let i = 0; i < counts[1]; i++) kinds.push(r() < 0.5 ? [0, 1] : [1, 0]);
    for (let i = 0; i < counts[2]; i++) kinds.push([1, 1]);
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    const pos = kinds.map((_, i) => {
      const row = Math.floor(i / 10), col = i % 10, d = r();
      return { x: 250 + col * 158 + (r() - 0.5) * 90, y: 200 + row * 66 + (r() - 0.5) * 44, row, ph: r() * 6.28,
               depth: 0.55 + d * 0.45 };
    });
    return (PR = { kinds, pos });
  }
  T.register('sim_prisoners', {
    draw(ctx, V, lt, api) {
      const { kinds, pos } = prisoners(V.pairs || 100, V.counts || [1, 8, 91]);
      const choose = api.steps.find(s => s.show === 'choose'), tally = api.steps.find(s => s.show === 'tally');
      const c0 = choose ? choose.lt : 0.3;
      const t1 = tally ? Math.max(tally.lt, c0 + 9) : c0 + 9;          // tally only after every row has chosen
      const rowT = row => c0 + 0.4 + row * 0.8;
      const tk = ease.inOut(prog(lt, t1, t1 + 1.6));
      let done = 0, both = 0, mixed = 0, allC = 0;
      kinds.forEach((k, i) => {
        const p = pos[i], dr = Math.sin(lt * 0.35 + p.ph) * 3;
        const f = prog(lt, rowT(p.row) + (i % 10) * 0.05, rowT(p.row) + (i % 10) * 0.05 + 0.9);
        const both1 = k[0] === 1 && k[1] === 1;
        if (f > 0.5) { done++; if (both1) allC++; else if (k[0] + k[1] === 1) mixed++; else both++; }
        const dimK = both1 ? 0 : tk * 0.75;
        for (let s = 0; s < 2; s++) {
          const x = p.x + (s ? 22 : -22), y = p.y + dr;
          const sz = 26 + 14 * p.depth, fb = (1 - p.depth) * 4;
          if (f < 1) L.glyph('·', x, y, sz, 'rgba(239,233,220,0.5)', 0.5 * (1 - f));
          if (f > 0) {
            const ch = k[s] ? '招' : '默';
            const col = both1 && tk > 0 ? EMBER : s ? TEAL : GOLD;
            const bl = Math.max((1 - f) * 6, fb);
            L.glyph(ch, x, y, sz, col, ease.out(f) * (1 - dimK) * (0.55 + 0.45 * p.depth), { blur: bl > 0.6 ? bl : 0, glow: both1 && tk > 0 ? 8 : (k[s] ? 0 : 8) });
          }
        }
      });
      L.hud([{ label: '已选择', value: `${done} / ${kinds.length}` }, { label: '都沉默', value: both, color: OK },
             { label: '一招一默', value: mixed }, { label: '都招供', value: allC, color: EMBER, glow: tk > 0 }]);
      if (tk > 0) {
        L.light(W / 2, 470, 420, 'rgba(0,0,0,0.0)', 0);
        ctx.save(); ctx.globalAlpha = tk * 0.55; ctx.fillStyle = '#06110f'; ctx.fillRect(0, 0, W, H); ctx.restore();
        L.serif(String(allC), W / 2, 500, { size: 200, color: EMBER, glow: 26, alpha: tk, reveal: tk, spacing: 4 });
        L.serif('对 都招供', W / 2, 640, { size: 40, color: 'rgba(239,233,220,0.8)', glow: 0, alpha: tk, reveal: tk, spacing: 10 });
      }
    },
    cues(V, api) {
      const c = api.steps.find(s => s.show === 'choose'), c0 = c ? c.lt : 0.3;
      const out = []; for (let r = 0; r < 10; r++) out.push({ t: c0 + 0.4 + r * 0.8, type: 'tick' });
      out.push({ t: Math.max((api.steps.find(s => s.show === 'tally') || {}).lt || 0, c0 + 9), type: 'tally' });
      return out;
    },
  });
})();
