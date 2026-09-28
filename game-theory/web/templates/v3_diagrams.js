/* v3: diagrams — sim_levels, tree, crossroad, nyc in the v3 visual language (glyphs, light, depth; no boxes).
 * Overrides the v2 registrations in sims1.js / games1.js. The models (tree backward induction, the nyc crowd) and
 * the step / cue timings are the same as the v2 versions; only the drawing changed.
 *
 *   sim_levels {phase:'mirror'|'levels', levels?, you?, them?}
 *              mirror: 你 (gold) and 他 (teal) face each other; streams of glyphs flow both ways between them and above
 *                      each a regress of thoughts (他 → 你 → 他 …) recedes into depth, both chains meeting in one light.
 *              levels: same two players; rings of glyphs (the imagined other, then the imagined self …) grow around both
 *                      in lock-step; the shared depth is one big numeral between them.
 *   tree       {root, children:[{label, children:[{label, value}]}], steps:[{show:'grow'} {show:'backward', best}]}
 *              nodes are points of light, edges fading hairlines; a light sweeps forward, choices are drawn back
 *              leaf → root, the chosen path is traced by one beam and the rest sinks into depth.
 *   crossroad  {matrix:{rows, cols, cells, rowPlayer?, colPlayer?}, eqLabel?,
 *               steps:[{show:'cars'} {show:'equilibria', cells:[[r,c]..]} {show:'question'}]}
 *              a night crossing built of glyph blocks, two 车 with headlights; each equilibrium plays as a ghost
 *              future through the crossing and lights up in a 2×2 of light; then a ？ over the crossing.
 *   nyc        {pins[], answer, time, city?, steps:[{show:'scatter'} {show:'converge'}]}
 *              Manhattan of glyphs in dark water; 72 人 scattered at landmarks, most drift into the light of the answer;
 *              a clock of points turns to the time, which ends large in ember.
 * Note: every call here multiplies in the beat's fade (FA) explicitly and draws at base alpha 1. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, fbm } = K;
  const INK = '#efe9dc', DIM = 'rgba(239,233,220,0.45)', GOLD = '#e9c47a', TEAL = '#7fd8cb', EMBER = '#ff9f5a', OK = '#9fe0a0', RED = '#e0705f';
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers
  let FA = 1;                                   // the beat's fade envelope, captured at the start of draw()
  const begin = () => { FA = ctx.globalAlpha; };
  const ep = (t, a, d = 0.6, e = ease.out) => e(prog(t, a, a + d));
  const bump = (t, a, d) => { const k = prog(t, a, a + d); return k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0; };
  const hex3 = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = hex3(h); return `rgba(${r},${g},${b},${a})`; };
  const iblur = b => Math.max(0, Math.round(b));
  // L.* now inherit ctx.globalAlpha; these helpers pass absolute alpha (fade already multiplied in), so draw at base alpha 1
  const abs = f => { const g0 = ctx.globalAlpha; ctx.globalAlpha = 1; const r = f(); ctx.globalAlpha = g0; return r; };
  const G = (ch, x, y, s, c, a, o) => abs(() => L.glyph(ch, x, y, s, c, a * FA, o || {}));
  const SR = (str, x, y, o) => abs(() => L.serif(str, x, y, { ...o, alpha: (o.alpha == null ? 1 : o.alpha) * FA }));
  const LI = (x, y, r, c, a) => abs(() => L.light(x, y, r, c, a * FA));
  function hud(items, a = 1) { if (a <= 0.01) return; ctx.save(); ctx.globalAlpha = FA; L.hud(items, { alpha: a }); ctx.restore(); }
  /** a word drawn glyph by glyph with an integer depth blur (L.serif only blurs while revealing) */
  function word(str, x, y, size, color, a, o = {}) {
    if (a <= 0.003) return 0;
    const fam = o.family || F.serif, wt = o.weight || 400, sp = o.spacing == null ? size * 0.06 : o.spacing;
    ctx.save(); ctx.font = `${wt} ${size}px ${fam}`;
    const chars = [...str], ws = chars.map(c => ctx.measureText(c).width + sp); ctx.restore();
    const tot = ws.reduce((s, v) => s + v, 0) - sp;
    let cx = o.align === 'left' ? x : o.align === 'right' ? x - tot : x - tot / 2;
    chars.forEach((c, i) => { G(c, cx + (ws[i] - sp) / 2, y, size, color, a, { family: fam, weight: wt, blur: iblur(o.blur || 0), glow: o.glow || 0 }); cx += ws[i]; });
    return tot;
  }
  /** a hairline of light fading out at both ends (f0/f1 = fraction of the length used by each fade) */
  function beam(x1, y1, x2, y2, hex, a, w = 1.4, f0 = 0.18, f1 = 0.18) {
    if (a <= 0.003 || (x1 === x2 && y1 === y2)) return;
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, rgba(hex, 0)); g.addColorStop(clamp(f0, 0, 0.49), rgba(hex, 1));
    g.addColorStop(1 - clamp(f1, 0, 0.49), rgba(hex, 1)); g.addColorStop(1, rgba(hex, 0));
    ctx.save(); ctx.globalAlpha = clamp(a) * FA; ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  /** a small hard core of light (for points that must read as "a node") */
  function core(x, y, r, hex, a) {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalAlpha = clamp(a) * FA; ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,250,240,1)'); g.addColorStop(0.45, rgba(hex, 0.9)); g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  const qb = (a, c, b, s) => { const u = 1 - s; return [u * u * a[0] + 2 * u * s * c[0] + s * s * b[0], u * u * a[1] + 2 * u * s * c[1] + s * s * b[1]]; };

  // ================================================================ sim_levels
  const LV = { y: 540, xl: 560, xr: 1360, size: 150, vp: [960, 214] };
  const lvSides = V => {
    const you = V.you || '你', them = V.them || '他';
    return [{ s: 1, x: LV.xl, me: you, other: them, cm: GOLD, co: TEAL }, { s: -1, x: LV.xr, me: them, other: you, cm: TEAL, co: GOLD }];
  };
  const scaleT = (api, ref) => clamp(api.dur / ref, 0.75, 1.6);
  function lvPlayers(V, lt, a, glowK = 0) {
    for (const S of lvSides(V)) {
      const br = 1 + 0.04 * Math.sin(lt * 0.9 + (S.s > 0 ? 0 : 1.7));
      LI(S.x, LV.y, 250 * br, rgba(S.cm, 0.16 + 0.1 * glowK), a);
      SR(S.me, S.x, LV.y, { size: LV.size, color: S.cm, glow: 18 + 8 * glowK, alpha: a, reveal: a, spacing: 0 });
    }
  }
  // regress chain: along a curve from above each player into the shared vanishing point
  const CH = [{ s: 0.27, size: 84, blur: 0, a: 0.95 }, { s: 0.52, size: 56, blur: 1, a: 0.8 }, { s: 0.70, size: 40, blur: 2, a: 0.62 },
    { s: 0.815, size: 30, blur: 3, a: 0.46 }, { s: 0.89, size: 24, blur: 3, a: 0.34 }, { s: 0.94, size: 20, blur: 4, a: 0.24 }, { s: 0.97, size: 16, blur: 4, a: 0.16 }];
  const chainPt = (S, s) => { const p = qb([LV.xl + 50, 420], [650, 236], LV.vp, s); return [S.s > 0 ? p[0] : 1920 - p[0], p[1]]; };
  // the two flows between the players
  const FLOWS = [{ a: [668, 508], c: [960, 404], b: [1252, 508] }, { a: [1252, 594], c: [960, 698], b: [668, 594] }];

  // o.rl: the time used for reveals (a large value = the finished picture), o.a: overall alpha, o.bare: no field / players
  function drawMirror(V, lt, api, o = {}) {
    const k = scaleT(api, 5.9), sides = lvSides(V), rl = o.rl == null ? lt : o.rl, A = o.a == null ? 1 : o.a;
    if (A <= 0.003) return;
    if (!o.bare) {
      L.field(lt, { n: 70, chars: (V.you || '你') + (V.them || '他'), seed: 31, alpha: 0.06, color: '#b8c2d8' });
      lvPlayers(V, lt, ep(lt, 0, 0.9));
    }
    // flows: 你 → 他 above (gold), 他 → 你 below (teal); glyph particles ride the curves, faint hairline under them
    FLOWS.forEach((Fl, fi) => {
      const t0 = (fi ? 0.95 : 0.55) * k, grow = ease.inOut(prog(rl, t0, t0 + 1.0 * k));
      if (grow <= 0) return;
      const col = fi ? TEAL : GOLD, ch = fi ? sides[1].me : sides[0].me;
      // hairline (polyline with a gradient along x)
      const g = ctx.createLinearGradient(Fl.a[0], 0, Fl.b[0], 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.2, rgba(col, 0.5)); g.addColorStop(0.8, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0));
      ctx.save(); ctx.globalAlpha = 0.5 * FA * A; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const s = i / 40 * grow, p = qb(Fl.a, Fl.c, Fl.b, s); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke(); ctx.restore();
      const n = 16;
      for (let i = 0; i < n; i++) {
        const s = ((lt - t0) * 0.16 + i / n) % 1; if (s > grow || s < 0) continue;
        const p = qb(Fl.a, Fl.c, Fl.b, s), fade = Math.sin(Math.PI * s);
        const big = i % 4 === 0;
        G(big ? ch : '·', p[0], p[1] + (big ? 0 : 2), big ? 24 : 26, col, (big ? 0.7 : 0.55) * fade * A, { glow: big ? 6 : 0 });
      }
    });
    // regress: 他 → 你 → 他 … shrinking and blurring toward one point of light
    const tL = [1.55, 2.45, 3.25].map(v => v * k), tDeep = 3.9 * k;
    const tOf = i => (i < 3 ? tL[i] : tDeep + (i - 3) * 0.28);
    for (const S of sides) {
      let prev = [S.x + S.s * 48, LV.y - 92];
      CH.forEach((c, i) => {
        const t = tOf(i), a = ep(rl, t, 0.9); const p = chainPt(S, c.s);
        // trail of points from the previous thinker
        const nd = i === 0 ? 3 : i < 3 ? 2 : 1;
        for (let j = 0; j < nd; j++) {
          const f = (j + 1) / (nd + 1), da = ep(rl, t - 0.4 + j * 0.12, 0.5) * A;
          G('·', lerp(prev[0], p[0], f), lerp(prev[1], p[1], f), 24, S.s > 0 ? GOLD : TEAL, da * c.a * 0.7);
        }
        if (a > 0) {
          const ch = i % 2 === 0 ? S.other : S.me, col = i % 2 === 0 ? S.co : S.cm;
          const b = iblur(Math.max(c.blur, (1 - a) * 6));
          if (i < 2) LI(p[0], p[1], c.size * 1.3, rgba(col, 0.14), a * A);
          G(ch, p[0], p[1], c.size, col, a * c.a * A, { blur: b, glow: i < 3 ? 8 : 0 });
        }
        prev = p;
      });
    }
    const va = ep(rl, tDeep + 0.6, 1.2) * A;
    LI(LV.vp[0], LV.vp[1], 90, 'rgba(255,214,160,0.35)', va * (0.85 + 0.15 * Math.sin(lt * 1.2)));
    core(LV.vp[0], LV.vp[1], 7, EMBER, va * 0.8);
  }

  const lvTimes = (V, api) => {
    const n = Math.max(1, V.levels || 3), k = scaleT(api, 4.7), t0 = 0.45 * k, sp = Math.min(1.05 * k, (api.dur * 0.62 - t0) / Math.max(1, n - 1));
    return { n, t0, sp, tk: i => t0 + i * sp };
  };
  function drawLevels(V, lt, api) {
    const { n, tk } = lvTimes(V, api), sides = lvSides(V);
    let cur = 0; for (let i = 0; i < n; i++) if (lt >= tk(i) + 0.25) cur = i + 1;
    const fin = ep(lt, tk(n - 1) + 1.2, 1.4, ease.inOut);            // everything settles, the numeral takes the light
    L.field(lt, { n: 70, chars: (V.you || '你') + (V.them || '他'), seed: 31, alpha: 0.06, color: '#b8c2d8' });
    // it opens on the finished mirror picture, which dissolves as the rings begin
    drawMirror(V, lt, { dur: 5.9 }, { rl: 1e3, a: 1 - ep(lt, 0.15, 1.3, ease.inOut), bare: true });
    // rings of glyphs: ring i shows who that layer imagines (他 → 你 → 他 …)
    const R0 = 132, DR = Math.min(50, 150 / Math.max(1, n - 1));
    for (const S of sides) {
      for (let i = 0; i < n; i++) {
        const t = tk(i); if (lt < t - 0.05) continue;
        const r = R0 + i * DR, ch = i % 2 === 0 ? S.other : S.me, col = i % 2 === 0 ? S.co : S.cm;
        const size = Math.max(16, 26 - i * 3) & ~1, depthB = Math.min(3, i), aBase = Math.max(0.3, 0.85 - i * 0.2) * (1 - 0.35 * fin);
        const N = Math.round(TAU * r / (size * 1.45)), rot = S.s * (i % 2 ? -1 : 1) * lt * 0.035;
        const gap = 0.2;                                              // an opening at the top for the layer number
        const fl = bump(lt, t, 1.0);
        for (let j = 0; j < N; j++) {
          const u = j / N; if (u < gap / TAU * 2 || u > 1 - gap / TAU * 2) continue;
          const ang = -Math.PI / 2 + u * TAU * S.s + rot;
          const aj = ep(lt, t + 0.9 * u, 0.5);
          if (aj <= 0) continue;
          G(ch, S.x + Math.cos(ang) * r, LV.y + Math.sin(ang) * r, size, col, aj * (aBase + 0.25 * fl), { blur: iblur(Math.max(depthB, (1 - aj) * 5)) });
        }
        // layer number in the opening
        word(String(i + 1).padStart(2, '0'), S.x, LV.y - r, 24, 'rgba(239,233,220,0.7)', ep(lt, t + 0.2, 0.6) * (1 - 0.4 * fin), { family: F.mono, spacing: 1 });
        LI(S.x, LV.y, r + 40, rgba(S.cm, 0.08), fl);
      }
    }
    lvPlayers(V, lt, 1, bump(lt, tk(Math.max(0, cur - 1)), 1.0) * (cur > 0 ? 1 : 0));
    // one shared numeral between the two: the depth is the same on both sides
    for (let i = 0; i < n; i++) {
      const t = tk(i) + 0.25, a = ep(lt, t, 0.8) * (i < n - 1 ? 1 - ep(lt, tk(i + 1) + 0.05, 0.4) : 1);
      if (a <= 0) continue;
      const last = i === n - 1;
      if (last) LI(960, LV.y, 240, 'rgba(255,159,90,0.22)', fin);
      SR(String(i + 1), 960, LV.y - 6, { size: last ? 180 : 150, color: last ? (fin > 0.5 ? EMBER : INK) : INK, glow: 14 + 14 * fin, alpha: a, reveal: ep(lt, t, 0.8), spacing: 0 });
    }
    const la = ep(lt, tk(0) + 0.6, 0.8);
    SR('层', 960, LV.y + 122, { size: 36, color: 'rgba(239,233,220,0.6)', glow: 0, alpha: la, reveal: la });
    const eqa = ep(lt, tk(n - 1) + 0.9, 0.9);
    SR(`${V.you || '你'} = ${V.them || '他'}`, 960, LV.y + 186, { size: 30, color: 'rgba(255,159,90,0.85)', glow: 6, alpha: eqa, reveal: eqa, spacing: 10 });
    hud([{ label: `${V.you || '你'} · 层数`, value: cur, color: GOLD }, { label: `${V.them || '他'} · 层数`, value: cur, color: TEAL }], ep(lt, tk(0) + 0.25, 0.6));
  }

  T.register('sim_levels', {
    draw(ctx, V, lt, api) { begin(); (V.phase === 'levels' ? drawLevels : drawMirror)(V, lt, api); },
    cues(V, api) {
      if (V.phase === 'levels') { const { n, tk } = lvTimes(V, api); return Array.from({ length: n }, (_, i) => ({ t: tk(i) + 0.1, type: 'pop' })); }
      const k = scaleT(api, 5.9);
      return [{ t: 0.1, type: 'tick' }, { t: 0.55 * k, type: 'swish' }, { t: 0.95 * k, type: 'swish' },
        ...[1.55, 2.45, 3.25].map(v => ({ t: v * k + 0.1, type: 'tick' }))];
    },
  });

  // ================================================================ tree
  // same model as games1.js: layout, shared "who" labels, backward induction (even depth maximises, odd minimises)
  function treeModel(V) {
    const nodes = [], edges = [];
    const rootIn = { label: V.root, children: V.children || [] };
    const depthOf = n => (n.children && n.children.length ? 1 + Math.max(...n.children.map(depthOf)) : 0);
    const D = Math.max(1, depthOf(rootIn));
    let leafCount = 0; const countLeaves = n => (n.children && n.children.length ? n.children.forEach(countLeaves) : leafCount++); countLeaves(rootIn);
    const xl = 420, xr = 1300, yt = 236, yb = 796;
    let li = 0;
    function build(n, d, parent) {
      const node = { d, parent, kids: [], edge: parent ? n.label : null, value: n.value, raw: n };
      nodes.push(node);
      if (n.children && n.children.length) {
        for (const c of n.children) node.kids.push(build(c, d + 1, node));
        node.y = node.kids.reduce((s, k) => s + k.y, 0) / node.kids.length;
        node.x = xl + d * (xr - xl) / D;
      } else {
        node.leaf = true; node.x = xr; node.y = leafCount > 1 ? lerp(yt, yb, li / (leafCount - 1)) : (yt + yb) / 2; li++;
      }
      if (parent) edges.push({ a: parent, b: node });
      return node;
    }
    const root = build(rootIn, 0, null);
    root.label = V.root;
    for (const n of nodes) {
      if (n === root || n.leaf) continue;
      const parts = n.kids.map(k => String(k.edge || '').split(/\s+/));
      if (parts.every(p => p.length > 1 && p[0] === parts[0][0])) { n.label = n.raw.who || parts[0][0]; n.kids.forEach((k, i) => { k.edge = parts[i].slice(1).join(' '); }); }
      else n.label = n.raw.who || '';
    }
    const num = v => { const x = parseFloat(String(v).replace('−', '-').replace('+', '')); return isNaN(x) ? 0 : x; };
    function solve(n) {
      if (n.leaf) { n.val = num(n.value); n.disp = String(n.value).replace('-', '−'); return n.val; }
      const vs = n.kids.map(solve);
      const max = n.d % 2 === 0; let bi = 0;
      vs.forEach((v, i) => { if (max ? v > vs[bi] : v < vs[bi]) bi = i; });
      if (n === root && V.best != null) bi = V.best;
      n.choice = bi; n.val = vs[bi]; n.disp = n.kids[bi].disp; return n.val;
    }
    solve(root);
    return { nodes, edges, root, D, leaves: nodes.filter(n => n.leaf) };
  }
  const treeColor = n => (n.d % 2 === 0 ? GOLD : TEAL);
  function treeTimes(V, api) {
    const S = api.steps, ig = api.find(s => s.show === 'grow'), ib = api.find(s => s.show === 'backward');
    const tg = ig >= 0 ? S[ig].lt : -1e9, tb = ib >= 0 ? S[ib].lt : 1e9;
    const best = ib >= 0 && S[ib].best != null ? S[ib].best : V.best;
    return { tg, tb, best };
  }
  const TREE_CACHE = new Map();
  function treeGet(V, best) {
    const key = JSON.stringify([V.root, V.children, best]);
    if (!TREE_CACHE.has(key)) TREE_CACHE.set(key, treeModel({ ...V, best }));
    return TREE_CACHE.get(key);
  }

  T.register('tree', {
    draw(ctx, V, lt, api) {
      begin();
      const { tg, tb, best } = treeTimes(V, api);
      const { nodes, edges, root, D, leaves } = treeGet(V, best);
      const appear = n => (n.d === 0 ? tg : tg + 0.35 + (n.d - 1) * 1.0 + 0.55);
      const edgeT = e => tg + 0.35 + (e.b.d - 1) * 1.0;
      const b0 = tb + D * 0.9 + 0.4;
      const levelT = d => b0 + (D - 1 - d) * 1.45;
      const pathEnd = levelT(0) + 1.0;
      const onPath = n => { for (let m = n; m.parent; m = m.parent) if (m.parent.kids[m.parent.choice] !== m) return false; return true; };
      // how far a node has sunk into depth: its branch was not chosen
      const sunk = n => { let s = 0; for (let m = n; m.parent; m = m.parent) { const p = m.parent; if (p.choice != null && p.kids[p.choice] !== m) s = Math.max(s, ep(lt, levelT(p.d) + 0.7, 1.0, ease.inOut)); } return s; };
      const trace = ep(lt, pathEnd, 1.4, ease.inOut);            // the chosen path, root → leaf, drawn by one beam
      const settle = ep(lt, pathEnd + 1.2, 1.2, ease.inOut);

      L.field(lt, { n: 60, chars: '走步棋', seed: 42, alpha: 0.05, color: '#a8c8bc' });
      // slow camera push toward the tree's centre
      const cam = 1 + 0.025 * ease.inOut(prog(lt, 0, Math.max(api.dur, 1)));
      ctx.save(); ctx.translate(880, 515); ctx.scale(cam, cam); ctx.translate(-880, -515);

      // -------- edges
      for (const e of edges) {
        const a = e.a, b = e.b, t = edgeT(e), p = ease.inOut(prog(lt, t, t + 0.7)); if (p <= 0) continue;
        const sk = sunk(b), vis = 1 - 0.78 * sk;
        const x2 = lerp(a.x, b.x, p), y2 = lerp(a.y, b.y, p);
        beam(a.x, a.y, x2, y2, INK, 0.34 * vis, 1.3, 0.1, p < 1 ? 0.35 : 0.1);
        if (p < 1) LI(x2, y2, 30, 'rgba(255,245,225,0.6)', 1 - p * 0.4);
        // forward sweep: a comet runs outward along every edge
        const fs = prog(lt, tb + (b.d - 1) * 0.9, tb + b.d * 0.9);
        if (fs > 0 && fs < 1) {
          const k1 = ease.inOut(fs), k0 = Math.max(0, k1 - 0.3), al = Math.sin(Math.PI * fs);
          beam(lerp(a.x, b.x, k0), lerp(a.y, b.y, k0), lerp(a.x, b.x, k1), lerp(a.y, b.y, k1), INK, 0.9 * al, 2, 0.9, 0.05);
          LI(lerp(a.x, b.x, k1), lerp(a.y, b.y, k1), 26, 'rgba(255,245,225,0.7)', al);
        }
        // choice: a beam in the chooser's colour, drawn back from child to parent
        if (a.choice != null && a.kids[a.choice] === b) {
          const cp = ease.inOut(prog(lt, levelT(a.d), levelT(a.d) + 0.8)), c = treeColor(a);
          if (cp > 0) {
            beam(b.x, b.y, lerp(b.x, a.x, cp), lerp(b.y, a.y, cp), c, 0.85 * vis * (1 - 0.5 * trace), 1.6, 0.05, cp < 1 ? 0.3 : 0.05);
            if (cp < 1) LI(lerp(b.x, a.x, cp), lerp(b.y, a.y, cp), 34, rgba(c, 0.7), 1);
          }
          if (onPath(b) && trace > 0) {
            // the traced path: segment by segment from the root outwards
            const seg = D, k = clamp(trace * seg - (b.d - 1));
            if (k > 0) {
              beam(a.x, a.y, lerp(a.x, b.x, k), lerp(a.y, b.y, k), OK, 0.22, 8, 0.02, k < 1 ? 0.25 : 0.02);
              beam(a.x, a.y, lerp(a.x, b.x, k), lerp(a.y, b.y, k), OK, 0.9, 2, 0.02, k < 1 ? 0.25 : 0.02);
              if (k < 1) LI(lerp(a.x, b.x, k), lerp(a.y, b.y, k), 60, 'rgba(159,224,160,0.6)', 1);
              for (let s = 0.2; s < k; s += 0.2) LI(lerp(a.x, b.x, s), lerp(a.y, b.y, s), 50, 'rgba(159,224,160,0.10)', 1);
            }
          }
        }
        // edge label: the move
        if (b.edge) {
          const la = ep(lt, t + 0.35, 0.8), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const ddx = b.x - a.x, ddy = b.y - a.y, dl = Math.hypot(ddx, ddy) || 1, off = a === root ? 40 : 30;
          const [px, py] = b.y < a.y ? [ddy / dl, -ddx / dl] : [-ddy / dl, ddx / dl];   // above-left for upper edges, below-left for lower
          const okK = a === root && onPath(b) ? ep(lt, pathEnd + 0.4, 0.8) : 0;
          const x = mx + px * off, y = my + py * off;
          const size = a === root ? 44 : 34, col = treeColor(a);
          word(b.edge, x, y, size, col, la * vis * (1 - okK) * (a === root ? 0.95 : 0.75), { blur: iblur(sk * 3), glow: 6 });
          if (okK > 0) word(b.edge, x, y, size, OK, la * okK, { glow: 12 });
        }
      }
      // -------- nodes
      for (const n of nodes) {
        const t = appear(n), k = ep(lt, t - 0.2, 0.9); if (k <= 0) continue;
        const sk = sunk(n), vis = 1 - 0.75 * sk, path = onPath(n) && trace > 0 ? clamp(trace * D - (n.d - 1)) : 0;
        if (n.leaf) {
          const neg = n.val < 0, hot = fsHot(n), okL = path > 0.99 ? ep(lt, pathEnd + 1.2, 0.8) : 0, col = okL > 0.5 ? OK : neg ? RED : INK;
          core(n.x, n.y, 7, path > 0.99 ? OK : '#d9d2c4', k * vis * 0.8);
          const vx = n.x + 92, pk = path > 0.99 ? ep(lt, pathEnd + 1.2, 0.8) : 0;
          if (pk > 0) LI(vx, n.y, 130, 'rgba(159,224,160,0.20)', pk);
          word(n.disp, vx, n.y, 56, col, k * vis * (0.85 + 0.15 * hot), { blur: iblur(Math.max(sk * 4, (1 - k) * 6)), glow: 8 + 10 * hot, family: F.serif });
        } else {
          const c = treeColor(n), r = n.d === 0 ? 16 : 12;
          const pulse = n.choice != null ? bump(lt, levelT(n.d) + 0.6, 1.0) : 0;
          LI(n.x, n.y, (n.d === 0 ? 120 : 90) * (1 + 0.2 * pulse), rgba(c, 0.30 + 0.25 * pulse), k * vis);
          core(n.x, n.y, r, c, k * vis);
          // who moves here
          if (n.label) {
            if (n.d === 0) SR(n.label, n.x - 84, n.y, { size: 64, color: c, glow: 14, alpha: k, reveal: k, spacing: 0 });
            else word(n.label, n.x, n.y - 58, 42, c, k * vis, { blur: iblur(sk * 3), glow: 8 });
          }
        }
      }
      // -------- backed-up values travel from the chosen child to the chooser and stay there
      for (const n of nodes) {
        if (n.leaf || n.choice == null) continue;
        const t = levelT(n.d), k = ease.inOut(prog(lt, t + 0.2, t + 1.1)); if (k <= 0) continue;
        const ch = n.kids[n.choice], from = ch.leaf ? [ch.x + 92, ch.y] : [ch.x, ch.y + 58];
        const to = n.d === 0 ? [n.x, n.y + 70] : [n.x, n.y + 58];
        const x = lerp(from[0], to[0], k), y = lerp(from[1], to[1], k) + Math.sin(Math.PI * k) * 26 * (to[1] > from[1] ? -1 : 1);
        const sk = sunk(n), neg = n.val < 0;
        const isRoot = n.d === 0, fin = isRoot ? ep(lt, pathEnd + 0.6, 1.0) : 0;
        const size = isRoot ? 46 : 38;
        const col = fin > 0.5 ? OK : neg ? RED : INK;
        word(n.disp, x, y, size, col, clamp(k * 3) * (1 - 0.75 * sk) * (k < 1 ? 0.9 : 1), { blur: iblur(Math.max(sk * 3, (1 - k) * 3)), glow: 8 + 8 * fin });
      }
      ctx.restore();

      function fsHot(n) { return bump(lt, tb + (n.d - 1) * 0.9 + 0.7, 0.8); }
      const decided = ep(lt, levelT(0) + 0.8, 0.6);
      hud([{ label: '走法', value: leaves.length }, { label: '回推', value: lt < b0 ? '—' : `${Math.min(D, 1 + Math.floor((lt - b0) / 1.45))}/${D}` },
        { label: `${root.label || ''}选`, value: decided > 0.5 ? `${root.kids[root.choice].edge || ''} · ${root.disp}` : '?', color: decided > 0.5 ? OK : INK, glow: decided > 0.5 }],
        ep(lt, tg + 1.8, 0.8) * (1 - 0.3 * settle));
    },
    cues(V, api) {
      const { tg, tb, best } = treeTimes(V, api), tm = treeGet(V, best), out = [];
      if (tg > -1e8) for (let d = 0; d <= tm.D; d++) out.push({ t: d === 0 ? tg : tg + 0.35 + (d - 1) + 0.55, type: 'tick' });
      if (tb < 1e8) {
        out.push({ t: tb, type: 'whoosh', dur: tm.D * 0.9 });
        const b0 = tb + tm.D * 0.9 + 0.4;
        for (let d = tm.D - 1; d >= 0; d--) out.push({ t: b0 + (tm.D - 1 - d) * 1.45, type: 'click' });
        out.push({ t: b0 + (tm.D - 1) * 1.45 + 1.2, type: 'chime' });
      }
      return out;
    },
  });

  // ================================================================ crossroad
  function parseM(V) {
    const M = V.matrix ? { ...V, ...V.matrix } : V;
    const rows = M.rows || ['A', 'B'], cols = M.cols || ['A', 'B'];
    return { rp: M.rowPlayer || '甲', cp: M.colPlayer || '乙', rows, cols, cells: M.cells || rows.map(() => cols.map(() => ['', ''])) };
  }
  const XR = { cx: 600, cy: 520, rw: 170 };
  let blocks = null;
  function cityBlocks() {
    if (blocks) return blocks;
    const r = rng(907), out = [], { cx, cy, rw } = XR, chars = '楼楼楼厦店';
    const hw = rw / 2, step = 27;
    for (let y = 164; y < 884; y += step) for (let x = 146; x < 1080; x += step) {
      const gx = Math.round((x - cx) / step), gy = Math.round((y - cy) / step);
      const jx = x + (r() - 0.5) * 8, jy = y + (r() - 0.5) * 8;
      const d = r(), c = chars[Math.floor(r() * chars.length)], lit = r() < 0.07, keep = r();
      if (Math.abs(jy - cy) < hw + 30 || Math.abs(jx - cx) < hw + 30) continue;     // the two roads
      if (gx % 7 === 0 || gy % 6 === 0) continue;                                   // side streets between blocks
      if (keep < 0.18) continue;                                                     // gaps: courtyards, dark windows
      const dist = Math.hypot(jx - cx, jy - cy);
      const fade = clamp(1.15 - (dist - 200) / 420) * clamp((jx - 140) / 140) * clamp((1075 - jx) / 180) * clamp((jy - 150) / 70) * clamp((895 - jy) / 70);
      if (fade <= 0.03) continue;
      out.push({ x: jx, y: jy, c, size: 14 + 2 * Math.round(d * 5), blur: d < 0.3 ? 2 : d < 0.6 ? 1 : 0, a: (0.07 + 0.2 * d) * fade, lit, ph: r() * TAU });
    }
    return (blocks = out);
  }
  /** a car: 车 glyph with headlight cone ahead (dir = unit vector of travel) */
  function car(x, y, dir, col, a, o = {}) {
    if (a <= 0.003) return;
    const ang = Math.atan2(dir[1], dir[0]);
    // headlight cone
    ctx.save(); ctx.globalAlpha = a * FA * (o.cone == null ? 1 : o.cone); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x + dir[0] * 40, y + dir[1] * 40); ctx.rotate(ang); ctx.scale(2.0, 0.62);
    const g = ctx.createRadialGradient(46, 0, 0, 46, 0, 64);        // centred ahead: soft at the car, no hard edge
    g.addColorStop(0, 'rgba(255,236,200,0.20)'); g.addColorStop(0.6, 'rgba(255,236,200,0.07)'); g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(46, 0, 64, 0, TAU); ctx.fill(); ctx.restore();
    const nx = -dir[1], ny = dir[0];
    for (const s of [-1, 1]) LI(x - dir[0] * 36 + nx * 16 * s, y - dir[1] * 36 + ny * 16 * s, 12, 'rgba(224,112,95,0.7)', a * 0.5);
    LI(x, y, 70, rgba(col, 0.22), a);
    G('车', x, y, 64, col, a, { glow: 12, blur: o.blur || 0 });
  }
  function xrState(V, api) {
    const S = api.steps;
    const ic = api.find(s => s.show === 'cars'), ie = api.find(s => s.show === 'equilibria'), iq = api.find(s => s.show === 'question');
    return { tc: ic >= 0 ? S[ic].lt : 0, te: ie >= 0 ? S[ie].lt : 1e9, tq: iq >= 0 ? S[iq].lt : 1e9, cells: (ie >= 0 && S[ie].cells) || [] };
  }
  T.register('crossroad', {
    draw(ctx, V, lt, api) {
      begin();
      const M = parseM(V), { tc, te, tq, cells } = xrState(V, api), { cx, cy, rw } = XR;
      const qk = ep(lt, tq, 1.0, ease.inOut);
      // -------- the city at night (the camera starts centred on the crossing and drifts left when the 2×2 arrives)
      const pan = 300 * (1 - ease.inOut(prog(lt, te - 0.3, te + 1.5)));
      ctx.save(); ctx.translate(pan, 0);
      const ra = ep(lt, tc - 0.3, 1.2);
      if (ra > 0) {
        for (const b of cityBlocks()) {
          const tw = b.lit ? 0.75 + 0.25 * Math.sin(lt * 0.4 + b.ph) : 1;
          G(b.c, b.x, b.y, b.size, b.lit ? '#f2c98a' : '#aeb9c6', ra * b.a * tw * (b.lit ? 2.6 : 1), { blur: b.blur });
        }
        const hw = rw / 2;
        // street lamps on the four corners
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const lx = cx + sx * (hw + 22), ly = cy + sy * (hw + 22);
          LI(lx, ly, 150, 'rgba(255,214,160,0.10)', ra); core(lx, ly, 5, '#ffd9a0', ra * 0.8);
        }
        // lane centre: points
        for (let x = 170; x < 1060; x += 30) if (Math.abs(x - cx) > hw + 16) G('·', x, cy + 2, 22, INK, ra * 0.22 * clamp(1 - Math.abs(x - cx) / 520));
        for (let y = 170; y < 880; y += 30) if (Math.abs(y - cy) > hw + 16) G('·', cx, y + 2, 22, INK, ra * 0.22 * clamp(1 - Math.abs(y - cy) / 420));
        // lamps along both roads: pools of warm light mark the streets
        for (let j = 1; j <= 4; j++) for (const sd of [-1, 1]) {
          const d = hw + 22 + j * 118, fade = clamp(1.25 - j * 0.25), side = (j % 2 ? 1 : -1) * (hw + 14);
          const pts = [[cx + sd * d, cy + side], [cx + side, cy + sd * d]];
          for (const [lx, ly] of pts) { if (ly < 170 || ly > 880 || lx < 150 || lx > 1070) continue; LI(lx, ly, 110, 'rgba(255,214,160,0.07)', ra * fade); core(lx, ly, 4, '#ffd9a0', ra * 0.6 * fade); }
        }
        // the empty crossing holds a little light of its own
        LI(cx, cy, 200, 'rgba(160,180,210,0.10)', ra);
      }
      // -------- the two cars glide in and stop at the lines; at the question each nudges forward and holds
      const k = ease.out(prog(lt, tc, tc + 2.2));
      const nudge = t => bump(lt, t, 1.1) * 16;
      const gx = lerp(120, cx - rw / 2 - 20 - 44, k) + nudge(tq + 0.4), gy = cy + rw / 4 + 2;
      const tx = cx + rw / 4 - 2, ty = lerp(920, cy + rw / 2 + 20 + 44, k) - nudge(tq + 1.1);
      const ca = ep(lt, tc - 0.1, 0.9);
      // ghost futures: each equilibrium plays once through the crossing
      cells.forEach(([r, c], i) => {
        const t = te + 1.2 + i * 0.55, gk = prog(lt, t, t + 1.5); if (gk <= 0 || gk >= 1) return;
        const e = ease.inOut(gk), ga = Math.sin(Math.PI * gk) * (1 - 0.6 * qk);
        if (r === 0) { const x = lerp(gx, 1040, e); for (let j = 0; j < 5; j++) LI(x - j * 26, gy, 34 - j * 4, 'rgba(233,196,122,0.35)', ga * (1 - j / 5)); G('车', x, gy, 64, GOLD, ga * 0.5, { blur: 2 }); }
        if (c === 0) { const y = lerp(ty, 170, e); for (let j = 0; j < 5; j++) LI(tx, y + j * 26, 34 - j * 4, 'rgba(127,216,203,0.35)', ga * (1 - j / 5)); G('车', tx, y, 64, TEAL, ga * 0.5, { blur: 2 }); }
      });
      if (lt > tc - 0.1) {
        car(gx, gy, [1, 0], GOLD, ca);
        car(tx, ty, [0, -1], TEAL, ca);
        const la = ep(lt, tc + 1.6, 0.8);
        SR(M.rp, gx - 6, gy + 64, { size: 32, color: GOLD, glow: 6, alpha: la, reveal: la, spacing: 0 });
        SR(M.cp, tx + 70, ty + 8, { size: 32, color: TEAL, glow: 6, alpha: la, reveal: la, spacing: 0 });
      }
      // -------- the question over the crossing
      if (qk > 0) {
        LI(cx, cy, 190, 'rgba(255,159,90,0.22)', qk * (0.9 + 0.1 * Math.sin(lt * 1.1)));
        SR('?', cx, cy - 6, { size: 200, color: EMBER, glow: 22, alpha: qk, reveal: ep(lt, tq, 1.2), spacing: 0 });
      }
      ctx.restore();
      // -------- 2×2 of light: outcomes; the equilibria light up
      const mx = 1500, my = 520, dx = 150, dy = 108;
      const fa = ease.inOut(prog(lt, te + 0.3, te + 1.3)) * (1 - 0.45 * qk);
      if (fa > 0) {
        beam(mx - 330, my, mx + 290, my, INK, 0.26 * fa, 1.2, 0.2, 0.2);
        beam(mx, my - 220, mx, my + 220, INK, 0.26 * fa, 1.2, 0.2, 0.2);
        SR(M.cp, mx, my - dy - 142, { size: 40, color: TEAL, glow: 8, alpha: fa, reveal: fa, spacing: 0 });
        SR(M.rp, mx - dx - 214, my, { size: 40, color: GOLD, glow: 8, alpha: fa, reveal: fa, spacing: 0 });
        M.cols.forEach((c, j) => SR(c, mx + (j ? dx : -dx), my - dy - 78, { size: 34, color: 'rgba(127,216,203,0.8)', glow: 0, alpha: fa, reveal: fa }));
        M.rows.forEach((r, i) => SR(r, mx - dx - 128, my + (i ? dy : -dy), { size: 34, color: 'rgba(233,196,122,0.8)', glow: 0, alpha: fa, reveal: fa }));
        const isEq = (r, c) => cells.some(e => e[0] === r && e[1] === c);
        [[0, 0], [0, 1], [1, 0], [1, 1]].forEach(([r, c], n) => {
          const x = mx + (c ? dx : -dx), y = my + (r ? dy : -dy);
          const cp = ep(lt, te + 0.3 + 0.15 * n, 0.7); if (cp <= 0) return;
          const ei = cells.findIndex(e => e[0] === r && e[1] === c), ek = ei >= 0 ? ep(lt, te + 1.2 + ei * 0.55, 1.0, ease.inOut) : 0;
          const lab = ep(lt, te + 1.2 + cells.length * 0.55, 0.8);
          const dimO = isEq(r, c) ? 1 : 1 - 0.55 * lab;
          const [gv, tv] = (M.cells[r] && M.cells[r][c]) || ['', ''];
          const crash = gv === tv && r === 0 && c === 0;
          if (crash) LI(x, y, 120, 'rgba(224,112,95,0.14)', cp * dimO);
          if (ek > 0) {
            LI(x, y, 160, 'rgba(255,159,90,0.26)', ek * fa);
            for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + lt * 0.25; G('·', x + Math.cos(a) * 112, y + Math.sin(a) * 76, 26, EMBER, ek * 0.75 * fa, { glow: 4 }); }
          }
          SR(String(gv), x - 48, y + 24, { size: 34, color: crash ? RED : GOLD, glow: 6 + 6 * ek, alpha: cp * fa * dimO, reveal: cp });
          SR(String(tv), x + 48, y - 24, { size: 34, color: crash ? RED : TEAL, glow: 6 + 6 * ek, alpha: cp * fa * dimO, reveal: cp });
        });
        const la = ep(lt, te + 1.2 + cells.length * 0.55, 0.8);
        SR(V.eqLabel || `${cells.length === 2 ? '两' : cells.length}个均衡`, mx, my + dy + 122, { size: 38, color: EMBER, glow: 10, alpha: la * fa, reveal: la, spacing: 8 });
      }
    },
    cues(V, api) {
      const S = api.steps, out = [];
      S.forEach(s => {
        if (s.show === 'cars') out.push({ t: s.lt, type: 'whoosh', dur: 2.0 });
        if (s.show === 'equilibria') { out.push({ t: s.lt, type: 'tick' }); (s.cells || []).forEach((_, i) => out.push({ t: s.lt + 1.2 + i * 0.55, type: 'pop' })); }
        if (s.show === 'question') out.push({ t: s.lt, type: 'pop' });
      });
      return out;
    },
  });

  // ================================================================ nyc
  // same geometry and crowd model as games1.js (72 people, rng 41, ~13% stay at their own landmark)
  const NYC = { S: [585, 800], N: [1000, 175], hw: 128 };
  const nycAxis = (() => { const dx = NYC.N[0] - NYC.S[0], dy = NYC.N[1] - NYC.S[1], Lh = Math.hypot(dx, dy); return { d: [dx, dy], e: [-dy / Lh, dx / Lh] }; })();
  const uv = (u, v) => [NYC.S[0] + nycAxis.d[0] * u + nycAxis.e[0] * v * NYC.hw, NYC.S[1] + nycAxis.d[1] * u + nycAxis.e[1] * v * NYC.hw];
  const PIN_UV = { '自由女神像': [-0.14, -1.95], '帝国大厦': [0.35, -0.08], '时代广场': [0.45, -0.45], '中央车站': [0.44, 0.45], '中央公园': [0.68, 0], '华尔街': [0.06, 0.1], '布鲁克林大桥': [0.1, 0.9] };
  const halfW = u => (u < 0.46 ? 0.22 + 0.78 * Math.pow(Math.sin(u / 0.46 * Math.PI / 2), 1.3) : u < 0.76 ? 1 : 1 - 0.45 * Math.pow((u - 0.76) / 0.24, 1.4));
  const NYC_CACHE = new Map();
  function nycModel(V) {
    const key = JSON.stringify([V.pins, V.answer]);
    if (NYC_CACHE.has(key)) return NYC_CACHE.get(key);
    const pins = (V.pins || []).map((name, i, arr) => {
      const q = PIN_UV[name] || [0.1 + 0.8 * i / Math.max(1, arr.length - 1), i % 2 ? 0.5 : -0.5];
      const [x, y] = uv(q[0], q[1]);
      return { name, x, y, u: q[0], v: q[1], left: q[1] < 0, ans: name === V.answer };
    });
    const ansPin = pins.find(p => p.ans) || pins[0];
    const r = rng(41), people = [];
    const N = 72;
    for (let i = 0; i < N; i++) {
      const pi = Math.floor(r() * pins.length), pin = pins[pi];
      const a = (r() < 0.5 ? -1 : 1) * Math.PI / 2 + (r() - 0.5) * 1.4, d = 24 + Math.sqrt(r()) * 40;
      people.push({ x: pin.x + Math.cos(a) * d, y: pin.y + Math.sin(a) * d * 0.9, stay: r() < 0.13 && !pin.ans, delay: r() * 1.6, ph: r() * TAU });
    }
    // the crowd at the answer: a sunflower spiral, spaced for glyphs
    let k = 0;
    for (const p of people) {
      if (p.stay) continue;
      const rr = 14.5 * Math.sqrt(k + 1.5), th = k * 2.39996; k++;
      p.tx = ansPin.x + Math.cos(th) * rr * 0.8 + (K.hash2(k, 3) - 0.5) * 8; p.ty = ansPin.y + Math.sin(th) * rr * 1.08 + (K.hash2(k, 7) - 0.5) * 8;
      p.size = 22 + 2 * Math.round(2 * (1 - Math.sqrt(k / 72)));
    }
    for (const p of people) if (p.stay) p.size = 22;
    // the island as glyph blocks along its street grid
    const rc = rng(1811), city = [];
    for (let u = -0.02; u <= 1.03; u += 0.03) for (let v = -1.05; v <= 1.05; v += 0.19) {
      const hwu = halfW(clamp(u, 0, 1)) * (1 + 0.07 * (fbm(u * 5, v > 0 ? 3.1 : 9.7, 3) - 0.5));
      if (Math.abs(v) > hwu || u < 0 || u > 1.0) continue;
      const [x, y] = uv(u, v), d = rc();
      const park = u > 0.59 && u < 0.77 && Math.abs(v) < 0.34;
      const n = fbm(u * 7, v * 2 + 4, 3);
      city.push({ x: x + (rc() - 0.5) * 4, y: y + (rc() - 0.5) * 4, c: park ? '树' : '楼厦楼街'[Math.floor(rc() * 4)], park,
        size: park ? 18 : 14 + 2 * Math.round(d * 4), blur: d < 0.25 ? 2 : d < 0.55 ? 1 : 0, a: park ? 0.3 : 0.1 + 0.3 * n * (0.5 + d), lit: !park && rc() < 0.08 });
    }
    const m = { pins, ansPin, people, city, clusterR: 14.5 * Math.sqrt(k + 1.5), moving: k };
    NYC_CACHE.set(key, m); return m;
  }
  T.register('nyc', {
    draw(ctx, V, lt, api) {
      begin();
      const S = api.steps, is = api.find(s => s.show === 'scatter'), ic = api.find(s => s.show === 'converge');
      const ts = is >= 0 ? S[is].lt : 0, tc = ic >= 0 ? S[ic].lt : 1e9;
      const { pins, ansPin, people, city, clusterR } = nycModel(V);
      const conv = ep(lt, tc, 0.8, ease.inOut);
      const fin = ep(lt, tc + 4.2, 1.2, ease.inOut);                 // the time takes the light; the city recedes
      L.field(lt, { n: 80, chars: '水', seed: 19, alpha: 0.07, color: '#86a8c8' });
      // slow push toward the answer while the crowd gathers
      const cam = 1 + 0.035 * ease.inOut(prog(lt, tc, tc + 6));
      ctx.save(); ctx.translate(ansPin.x, ansPin.y); ctx.scale(cam, cam); ctx.translate(-ansPin.x, -ansPin.y);
      // -------- the city
      const ma = ep(lt, ts - 0.4, 1.4);
      if (ma > 0) {
        const recede = 1 - 0.45 * conv - 0.2 * fin;
        for (const b of city) {
          const a = ma * b.a * recede * (b.lit ? 2.4 : 1);
          G(b.c, b.x, b.y, b.size, b.park ? OK : b.lit ? '#f2c98a' : '#b4c0cc', a, { blur: b.blur });
        }
        if (V.city !== '') word(V.city || 'NEW YORK', uv(1.02, 0)[0] + 120, uv(1.02, 0)[1] - 10, 24, 'rgba(239,233,220,0.4)', ma * (1 - 0.5 * fin), { family: F.mono, spacing: 8 });
      }
      // -------- landmarks: points of light with their names
      pins.forEach((p, i) => {
        const a = ep(lt, ts + 0.3 + i * 0.25, 0.8); if (a <= 0) return;
        const hi = p.ans ? ep(lt, tc + 2.6, 0.8) : 0, dimO = p.ans ? 1 : 1 - 0.6 * conv - 0.2 * fin;
        if (p.name === '自由女神像') for (let j = 0; j < 12; j++) { const an = j / 12 * TAU; G('·', p.x + Math.cos(an) * 20, p.y + Math.sin(an) * 20, 18, '#b4c0cc', a * 0.35 * dimO); }
        LI(p.x, p.y, 40, 'rgba(255,236,200,0.35)', a * dimO);
        core(p.x, p.y, 6, p.ans && hi > 0 ? EMBER : '#e8dcc6', a * dimO);
        const off = p.ans ? 28 + (clusterR * 0.8 - 6) * hi : 26, lx = p.left ? p.x - off : p.x + off;
        const ly = p.y - (p.ans ? 36 * hi : 0);
        if (!p.ans || hi < 1) word(p.name, lx, p.y, 30, INK, a * dimO * (1 - hi) * 0.85, { align: p.left ? 'right' : 'left', glow: 4 });
        if (hi > 0) word(p.name, lx, ly, 38, EMBER, a * hi, { align: p.left ? 'right' : 'left', glow: 12 });
      });
      // -------- the station's light grows with every arrival
      let arrived = 0;
      const moveK = p => ease.inOut(prog(lt, tc + 0.3 + p.delay, tc + 2.1 + p.delay));
      for (const p of people) if (!p.stay && moveK(p) > 0.9) arrived++;
      const share = arrived / people.length;
      if (share > 0) { LI(ansPin.x, ansPin.y, 90 + 170 * share, 'rgba(255,190,120,0.30)', 0.4 + 0.6 * share); LI(ansPin.x, ansPin.y, 50 + 40 * share, 'rgba(255,220,170,0.35)', share); }
      // -------- people
      for (const p of people) {
        const a = ep(lt, ts + 0.6 + p.delay * 0.8, 0.8); if (a <= 0) continue;
        const dr = 3 * Math.sin(lt * 0.6 + p.ph), dr2 = 3 * Math.cos(lt * 0.5 + p.ph * 1.3);
        let x = p.x + dr, y = p.y + dr2, al = 0.85, col = '#f2c98a', size = 22;
        if (p.stay) { al = 0.85 - 0.5 * conv; col = '#d9c9a8'; }
        else {
          const k = moveK(p), m = Math.sin(Math.PI * k);
          const x1 = lerp(x, p.tx + dr * 0.3, k), y1 = lerp(y, p.ty + dr2 * 0.3, k);
          if (m > 0.05) for (let j = 1; j <= 2; j++) { const kk = Math.max(0, k - j * 0.06); G('人', lerp(x, p.tx, kk), lerp(y, p.ty, kk), 22, col, a * 0.18 * m / j, { blur: 2 }); }
          x = x1; y = y1; size = k > 0.5 ? p.size : 22;
          col = k > 0.9 ? '#ffd9a8' : col;
        }
        G('人', x, y, size, col, a * al, { glow: p.stay ? 0 : 4 });
      }
      ctx.restore();

      // -------- the clock of points and the time
      const ck = ep(lt, tc + 3.0, 1.0), cx = 1430, cy = 380, R = 118;
      if (ck > 0) {
        const ap = [ansPin.x + (clusterR * 0.8 + 40 + L.measureSerif(ansPin.name, 38)) * cam + 24, ansPin.y - 50];
        beam(ap[0], ap[1], cx - R - 24, cy + 40, EMBER, 0.5 * ck, 1.2, 0.25, 0.25);
        for (let i = 0; i < 60; i++) {
          const a = i / 60 * TAU, hr = i % 5 === 0, top = i === 0;
          const rr = hr ? R : R - 2;
          G('·', cx + Math.sin(a) * rr, cy - Math.cos(a) * rr + 2, hr ? 40 : 22, top ? EMBER : INK, ck * (top ? 1 : hr ? 0.9 : 0.45) * ep(lt, tc + 3.0 + i / 60 * 0.8, 0.4), { glow: top ? 8 : 0 });
        }
        const [hh, mm] = String(V.time || '12:00').split(':').map(Number);
        const sw = ease.inOut(prog(lt, tc + 3.0, tc + 4.6));
        const minA = ((mm || 0) / 60 - 1.6 * (1 - sw)) * TAU, hrA = (((hh || 0) % 12) / 12 + (mm || 0) / 720 - 1.6 * (1 - sw) / 12) * TAU;
        beam(cx, cy, cx + Math.sin(hrA) * R * 0.52, cy - Math.cos(hrA) * R * 0.52, INK, ck, 2.2, 0.02, 0.3);
        beam(cx, cy, cx + Math.sin(minA) * R * 0.82, cy - Math.cos(minA) * R * 0.82, EMBER, ck, 1.6, 0.02, 0.25);
        core(cx, cy, 8, EMBER, ck);
        LI(cx, cy - R * 0.6, 80, 'rgba(255,159,90,0.25)', bump(lt, tc + 4.4, 1.6));
      }
      const tt = ep(lt, tc + 4.2, 1.0);
      if (tt > 0) {
        LI(cx, 640, 230, 'rgba(255,159,90,0.16)', tt);
        SR(V.time || '12:00', cx, 640, { size: 150, color: EMBER, glow: 24, alpha: tt, reveal: ep(lt, tc + 4.2, 1.4), spacing: 4, family: F.serif });
      }
      hud([{ label: '谢林', value: '1960' }, { label: '人数', value: people.length }, { label: `到${ansPin.name}`, value: arrived, color: EMBER, glow: arrived > 0 }],
        ep(lt, ts + 0.6, 0.8));
    },
    cues(V, api) {
      const out = [];
      for (const s of api.steps) {
        if (s.show === 'scatter') out.push({ t: s.lt + 0.3, type: 'tick' });
        if (s.show === 'converge') { out.push({ t: s.lt + 0.3, type: 'whoosh', dur: 3.2 }); out.push({ t: s.lt + 3.0, type: 'pop' }); out.push({ t: s.lt + 4.4, type: 'chime' }); }
      }
      return out;
    },
  });
})();
