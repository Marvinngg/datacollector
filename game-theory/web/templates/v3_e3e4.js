/* v3: e3e4 — sim_rps, dough, chicken, adverse, insurance in the v3 language
 * (glyph particles as material, light for emphasis, depth of field; no boxes, no icons, no tables).
 * The maths, step semantics and cues follow the earlier implementations (sims1.js, games1.js, games2.js).
 * Timing is anchored to api.steps first, then to api.beat.lines.length / api.dur — never to a fixed sentence index.
 *
 *   sim_rps    {phase:'habit'|'mixed', habit?:15, mixed?:30, watch?:3, window?:4, names?:['石','剪','布'], seed?, first?,
 *               you?, them?, habitNote?, oppNote?, seenLabel?, blindLabel?, switchLabel?, rateLabel?}
 *              a duel of two big glyphs in the middle; every throw of yours then drifts down into one of three glyph
 *              clouds (石 / 剪 / 布) — the population the opponent reads. A teal line of sight shows what he reads.
 *              habit ends on the big red win rate; mixed opens on exactly that frame, the habit cloud recedes into depth,
 *              three even clouds form, and it ends on the big ember win rate (~50%) with 1/3 under each cloud.
 *   dough      {steps:[{show:'minimax', year, name} {show:'knead', year, name}], floor?, ceiling?, mixedLabel?, meetLabel?,
 *               grain?:'面', kneadWord?:'揉'}   the dough is a cloud of 面 glyphs; one of them never moves and lights up.
 *   chicken    {steps:[{show:'approach'} {show:'throw'} {show:'swerve'}], a?, b?, crash?, dodge?, wheelLabel?}
 *              night road: two 车 glyphs with headlight beams, a red glow between them grows as the gap closes.
 *   adverse    {steps:[{show:'crowd'} {show:'price'} {show:'leave'} ({show:'come'})], n?:60, badShare?, rounds?:3, prices?,
 *               insurer?, blind?, goodSay?, badSay?}   a crowd of 人 glyphs; healthy ones dissolve into the dark in batches.
 *   insurance  {plans:[{name, price, terms}×2], types?, pattern?, n?:36, steps:[{show:'plans'} {show:'sort'}]}
 */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng } = K;
  const INK = '#efe9dc', DIM = 'rgba(239,233,220,0.45)', GOLD = '#e9c47a', TEAL = '#7fd8cb', EMBER = '#ff9f5a', OK = '#9fe0a0', RED = '#e0705f';
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers
  // L.glyph / L.light set ctx.globalAlpha absolutely, so the runtime's beat envelope has to be multiplied in by hand.
  let ENV = 1;
  const begin = () => { ENV = ctx.globalAlpha; };
  const G = (ch, x, y, s, c, a = 1, o) => L.glyph(ch, x, y, s, c, a * ENV, o);
  const SF = (str, x, y, o = {}) => L.serif(str, x, y, { ...o, alpha: (o.alpha == null ? 1 : o.alpha) * ENV });
  const LI = (x, y, r, c, a = 1) => L.light(x, y, r, c, a * ENV);
  const HUD = (items, a = 1) => { ctx.globalAlpha = 1; L.hud(items, { alpha: a * ENV }); };
  const FIELD = (t, o) => L.field(t, { ...o, alpha: o.alpha * ENV });
  const ep = (t, a, d = 0.6, e = ease.out) => (isFinite(a) ? e(prog(t, a, a + d)) : (a < 0 ? 1 : 0));
  const fio = (t, a, b, d = 0.5) => (isFinite(b) ? Math.min(ep(t, a, d), 1 - ease.in(prog(t, b - d, b))) : ep(t, a, d));
  const bump = (t, a, d) => { const k = prog(t, a, a + d); return k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0; };
  const ev = v => Math.max(2, Math.round(v / 2) * 2);            // even glyph sizes (sprite cache friendly)
  function rgba(hex, a) {
    if (hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  /** a 1–2px line of light; mode 'mid' fades at both ends, 'out' is bright at the start, 'in' bright at the end */
  function ray(x1, y1, x2, y2, hex, a, w = 1.5, mode = 'mid') {
    if (a <= 0.003) return;
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    if (mode === 'mid') { g.addColorStop(0, rgba(hex, 0)); g.addColorStop(0.5, rgba(hex, 1)); g.addColorStop(1, rgba(hex, 0)); }
    else if (mode === 'out') { g.addColorStop(0, rgba(hex, 1)); g.addColorStop(1, rgba(hex, 0)); }
    else if (mode === 'in') { g.addColorStop(0, rgba(hex, 0)); g.addColorStop(1, rgba(hex, 1)); }
    else { g.addColorStop(0, rgba(hex, 0)); g.addColorStop(0.2, rgba(hex, 1)); g.addColorStop(0.8, rgba(hex, 1)); g.addColorStop(1, rgba(hex, 0)); }
    ctx.save(); ctx.globalAlpha = a * ENV; ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  const stepT = (api, name, fb) => { const s = api.steps.find(x => x.show === name); return s ? s.lt : fb; };
  const lastLineStart = api => { const n = api.beat.lines.length; const l = n ? api.line(n - 1) : null; return l ? l.start : null; };

  // ================================================================ sim_rps
  // 0 石 rock, 1 剪 scissors, 2 布 paper. a beats b ⇔ (b - a + 3) % 3 === 1; counter(x) = (x + 2) % 3
  const res = (a, b) => (a === b ? 0 : (b - a + 3) % 3 === 1 ? 1 : -1);
  const counter = x => (x + 2) % 3;
  const scaleT = (api, ref) => clamp(api.dur / ref, 0.75, 1.6);
  const RD = { yx: 700, ox: 1220, y: 360, size: 132 };      // the duel
  const CL = { xs: [560, 960, 1360], y: 690 };               // your throws, one cloud per kind
  const RPC = new Map();
  function rpsModel(V) {
    const Hn = V.habit || 15, Mn = V.mixed || 30, Wt = V.watch == null ? 3 : V.watch, WIN = V.window || 4, key = JSON.stringify([Hn, Mn, Wt, WIN, V.seed, V.first]);
    if (RPC.has(key)) return RPC.get(key);
    const rounds = [];
    // habit: you always throw rock; the opponent plays some opening throws, then counters your most frequent throw
    const first = V.first || [1, 2, 0];
    for (let i = 0; i < Hn; i++) { const opp = i < Wt ? first[i % first.length] : counter(0); rounds.push({ you: 0, opp, r: res(0, opp), ph: 0 }); }
    // mixed: a shuffled balanced sequence (exactly 1/3 each by the end); the opponent keeps countering your most
    // frequent throw of the last WIN rounds. Pick the first seed whose running win rate settles near 50% (deterministic).
    let best = null;
    for (let s = (V.seed || 1); s < (V.seed || 1) + 600 && !best; s++) {
      const r = rng(s * 7919 + 13), seq = [];
      for (let i = 0; i < Mn; i++) seq.push(i % 3);
      for (let i = seq.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [seq[i], seq[j]] = [seq[j], seq[i]]; }
      const out = []; let sc = 0, ok = true;
      for (let i = 0; i < Mn; i++) {
        const cnt = [0, 0, 0]; for (let j = Math.max(0, i - WIN); j < i; j++) cnt[seq[j]]++;
        const mxv = Math.max(...cnt), lead = [0, 1, 2].filter(k => cnt[k] === mxv);
        const guess = lead[Math.floor(r() * lead.length)], opp = counter(guess);
        const rr = res(seq[i], opp); sc += rr > 0 ? 1 : rr === 0 ? 0.5 : 0;
        const rate = sc / (i + 1);
        if (i === 0 && rr !== 0) ok = false;
        if (i >= 1 && Math.abs(rate - 0.5) > 0.26) ok = false;
        if (i >= 6 && Math.abs(rate - 0.5) > 0.15) ok = false;
        if (i >= 18 && Math.abs(rate - 0.5) > 0.07) ok = false;
        out.push({ you: seq[i], opp, r: rr, ph: 1 });
      }
      if (ok && Math.abs(sc / Mn - 0.5) <= 0.02) best = out;
      if (s === (V.seed || 1) + 599 && !best) best = out;
    }
    rounds.push(...best);
    const stat = [];
    let sc = 0, n = 0, cnt = [0, 0, 0], ph = 0;
    rounds.forEach(R => {
      if (R.ph !== ph) { ph = R.ph; sc = 0; n = 0; cnt = [0, 0, 0]; }
      sc += R.r > 0 ? 1 : R.r === 0 ? 0.5 : 0; n++; cnt[R.you]++;
      stat.push({ rate: sc / n, dist: cnt.map(c => c / n) });
    });
    // where each of your throws settles in its cloud: the throw itself plus a few satellite grains, so that the
    // cloud's mass is proportional to how often you threw it (golden spiral per phase and kind, with depth)
    const rk = {}, rr = rng(4242), SAT = 4;
    const slot = (R, q) => {
      const ang = q * 2.39996 + R.you * 1.1 + R.ph * 0.7, rad = 21 * Math.sqrt(q + 0.6);
      return { x: CL.xs[R.you] + Math.cos(ang) * rad * 1.1 + (rr() - 0.5) * 12, y: CL.y + Math.sin(ang) * rad * 0.72 + (rr() - 0.5) * 10, depth: rr(), ph: rr() * TAU };
    };
    const cloud = rounds.map(R => {
      const k = `${R.ph}|${R.you}`, j = rk[k] = (rk[k] == null ? 0 : rk[k] + 1);
      const main = slot(R, j * (SAT + 1)); main.depth = 0.55 + 0.45 * main.depth;
      const sats = []; for (let s = 1; s <= SAT; s++) sats.push(slot(R, j * (SAT + 1) + s));
      return { ...main, sats };
    });
    const m = { H: Hn, M: Mn, W: Wt, rounds, stat, cloud };
    RPC.set(key, m); return m;
  }
  /** local time at which each round lands in this beat (habit rounds are long done in the mixed beat) */
  function rpsTimes(V, api, m) {
    if (V.phase === 'mixed') {
      const t0 = 1.8, sp = clamp((0.8 * api.dur - t0) / m.M, 0.2, 0.42);
      return { ts: m.rounds.map((R, i) => (R.ph === 0 ? -100 + i * 0.01 : t0 + (i - m.H) * sp)), sw: 0.6, end: t0 + m.M * sp };
    }
    const k = scaleT(api, 6.15), w0 = 0.6 * k, wsp = 0.62 * k, t1 = w0 + m.W * wsp + 0.1;
    const sp = clamp((0.84 * api.dur - t1) / Math.max(1, m.H - m.W - 1), 0.14, 0.45);
    return { ts: m.rounds.map((R, i) => (R.ph === 1 ? 1e9 : i < m.W ? w0 + i * wsp : t1 + (i - m.W) * sp)), sw: 1e9, seen: t1 - 0.15, end: t1 + (m.H - m.W - 1) * sp };
  }
  T.register('sim_rps', {
    draw(ctx, V, lt, api) {
      begin();
      const m = rpsModel(V), { ts, sw, seen, end } = rpsTimes(V, api, m), mixed = V.phase === 'mixed';
      const names = V.names || ['石', '剪', '布'], N = m.rounds.length, gt = api.beat.start + lt;
      const aIn = mixed ? 1 : ep(lt, 0, 0.8);
      let last = -1; for (let i = 0; i < N; i++) if (lt >= ts[i]) last = i;
      // conclusion overlays: habit ends on its win rate, mixed opens on it and lets it go at the switch
      const dkD = Math.max(0.3, Math.min(1.0, api.dur - end - 0.45));
      const dk = mixed ? 1 - ep(lt, sw, 0.9, ease.inOut) : ep(lt, end + 0.3, dkD, ease.inOut);
      const settled = mixed ? ep(lt, end + 0.2, 1.0, ease.inOut) : 0;
      const recede = mixed ? ep(lt, sw, 1.6, ease.inOut) : 0;      // the habit cloud steps back into depth

      FIELD(gt, { n: 80, chars: names.join(''), seed: 31, alpha: 0.07, color: '#b9c4cf' });

      // ---- the clouds of your throws
      const cloudA = aIn * (1 - 0.72 * dk) * (1 - 0.2 * ep(lt, end + 0.5, 1.0));
      const recedeP = (R, x, y, size, a, blur) => {
        if (R.ph !== 0 || recede <= 0) return [x, y, size, a, blur];
        const cx = CL.xs[R.you];
        return [lerp(x, cx + (x - cx) * 0.6, recede), lerp(y, CL.y - 70 + (y - CL.y) * 0.55, recede), size * lerp(1, 0.6, recede), a * lerp(1, 0.18, recede), Math.round(lerp(blur, 4, recede))];
      };
      for (let i = 0; i <= last; i++) {
        const R = m.rounds[i], c = m.cloud[i];
        const f = ep(lt, ts[i] + 0.12, 0.75, ease.inOut);
        if (f <= 0) continue;
        const hot = R.ph === 1 ? settled : 0;
        // satellites bloom where the throw lands
        const sp = ep(lt, ts[i] + 0.7, 0.9);
        if (sp > 0) for (const q of c.sats) {
          const [x, y, size, a, blur] = recedeP(R, q.x, q.y + Math.sin(gt * 0.5 + q.ph) * 3, 24 + 14 * q.depth, (0.22 + 0.32 * q.depth) * sp, Math.round(lerp(4, q.depth < 0.5 ? 2 : 1, sp)));
          G(names[R.you], x, y, ev(size), GOLD, a * cloudA, { blur });
        }
        let x = c.x, y = c.y + Math.sin(gt * 0.5 + c.ph) * 3;
        let size = 40 + 18 * c.depth, a = (0.55 + 0.45 * c.depth), blur = c.depth < 0.65 ? 1 : 0;
        if (f < 1) {                      // in flight from the duel down to its cloud, on a gentle arc
          x = lerp(RD.yx, x, f); y = lerp(RD.y + 30, y, f) + Math.sin(Math.PI * f) * 20;
          size = lerp(RD.size * 0.6, size, f); a *= Math.min(1, f * 3);
        }
        [x, y, size, a, blur] = recedeP(R, x, y, size, a, blur);
        G(names[R.you], x, y, ev(size), GOLD, a * cloudA, { blur, glow: hot > 0.5 ? 6 : 0 });
      }
      // ---- the opponent's line of sight: the cloud it bets on (it counters the throw it expects)
      const guessOf = i => (m.rounds[i].opp + 1) % 3;
      let gaze = 0;
      if (!mixed) gaze = seen != null ? ep(lt, seen, 0.8) : 0;
      else gaze = 1 - 0.5 * settled;
      if (gaze > 0 && last >= 0) {
        const i = last, prevG = i > 0 ? guessOf(i - 1) : guessOf(i), k = ep(lt, ts[i], 0.35, ease.inOut);
        const tx = lerp(CL.xs[prevG], CL.xs[guessOf(i)], k);
        const ga = gaze * aIn * (1 - 0.6 * dk);
        ray(RD.ox - 40, RD.y + 70, tx + 40, CL.y - 70, TEAL, 0.45 * ga, 1.5, 'out');
        LI(tx, CL.y, 190, 'rgba(127,216,203,0.10)', ga);
      }

      // ---- the duel
      const duelA = aIn * (1 - 0.94 * dk) * (1 - 0.94 * settled);
      for (let i = Math.max(0, last - 1); i <= last; i++) {
        const R = m.rounds[i];
        const aI = ep(lt, ts[i], 0.35), aO = i < last ? 1 - ep(lt, ts[last], 0.3) : 1, a = aI * aO * duelA;
        if (a <= 0.003) continue;
        const bl = Math.round((1 - aI) * 6), sz = ev(RD.size * (0.9 + 0.1 * aI));
        const youA = R.r < 0 ? 0.5 : 1, oppA = R.r > 0 ? 0.5 : 1;
        const col = R.r > 0 ? 'rgba(159,224,160,0.30)' : R.r < 0 ? 'rgba(224,112,95,0.30)' : 'rgba(239,233,220,0.12)';
        LI(960, RD.y, 230, col, a);
        G(names[R.you], RD.yx, RD.y, sz, GOLD, a * youA, { blur: bl, glow: R.r > 0 ? 14 : 8 });
        G(names[R.opp], RD.ox, RD.y, sz, TEAL, a * oppA, { blur: bl, glow: R.r < 0 ? 14 : 8 });
        const word = R.r > 0 ? '赢' : R.r < 0 ? '输' : '平', wc = R.r > 0 ? OK : R.r < 0 ? RED : DIM;
        G(word, 960, RD.y, 44, wc, a * 0.9, { blur: bl, glow: R.r ? 8 : 0 });
      }
      // who is who, and what each one does
      const lab = aIn * (1 - 0.92 * dk) * (1 - 0.88 * settled);
      SF(V.you || '你', RD.yx, RD.y - 146, { size: 34, color: GOLD, glow: 4, alpha: 0.85 * lab });
      SF(V.them || '对手', RD.ox, RD.y - 146, { size: 34, color: TEAL, glow: 4, alpha: 0.85 * lab });
      const note = (str, x, a, color) => { if (a > 0.003) SF(str, x, RD.y - 98, { size: 30, color, glow: 0, alpha: a * lab, reveal: a }); };
      const swA = mixed ? ep(lt, sw, 0.8) : 0;
      note(V.habitNote || `总出「${names[0]}」`, RD.yx, (mixed ? 1 - swA : ep(lt, 0.4, 0.9)), DIM);
      note(V.switchLabel || '改成随机', RD.yx, swA, OK);
      const seenA = mixed ? 1 : seen != null ? ep(lt, seen, 0.8) : 0;
      const blindA = mixed ? ep(lt, ts[m.H] + 1.0, 0.8) : 0;
      note(V.oppNote || `先看 ${m.W} 局`, RD.ox, mixed ? 0 : ep(lt, 0.6, 0.9) * (1 - seenA), DIM);
      note(V.seenLabel || `看穿了 · 专出「${names[counter(0)]}」`, RD.ox, seenA * (1 - blindA), TEAL);
      note(V.blindLabel || '怎么针对都没用', RD.ox, blindA, 'rgba(127,216,203,0.8)');

      // ---- HUD
      const curPh = mixed && lt >= ts[m.H] ? 1 : 0;
      const showR = last >= 0 && (curPh === 0 || m.rounds[last].ph === 1);
      const rate = showR ? m.stat[last].rate : null;
      let dist = last >= 0 ? m.stat[last].dist : [0, 0, 0];
      if (mixed && last < m.H) dist = m.stat[m.H - 1].dist;
      const rcol = rate == null ? INK : curPh === 0 ? (rate < 0.35 ? RED : INK) : (Math.abs(rate - 0.5) < 0.08 ? OK : INK);
      HUD([{ label: '局数', value: last + 1 }, { label: V.rateLabel || '你的胜率', value: rate == null ? '—' : `${Math.round(rate * 100)}%`, color: rcol },
        ...names.map((nm, k) => ({ label: nm, value: `${Math.round(dist[k] * 100)}%`, color: GOLD }))], aIn);

      // ---- conclusion: the big win rate
      if (dk > 0.003) {
        const r = m.stat[m.H - 1].rate;
        SF(`${Math.round(r * 100)}%`, 960, 380, { size: 200, color: RED, glow: 26, alpha: dk, reveal: mixed ? 1 : dk, spacing: 4 });
        SF(V.rateLabel || '你的胜率', 960, 515, { size: 38, color: 'rgba(239,233,220,0.7)', glow: 0, alpha: dk, reveal: mixed ? 1 : dk, spacing: 10 });
      }
      if (settled > 0.003) {
        const r = m.stat[N - 1].rate;
        LI(960, 380, 320, 'rgba(255,159,90,0.10)', settled);
        SF(`${Math.round(r * 100)}%`, 960, 380, { size: 200, color: EMBER, glow: 26, alpha: settled, reveal: settled, spacing: 4 });
        SF(V.rateLabel || '你的胜率', 960, 515, { size: 38, color: 'rgba(239,233,220,0.7)', glow: 0, alpha: settled, reveal: settled, spacing: 10 });
        CL.xs.forEach((x, k) => SF('1/3', x, 866, { size: 46, family: F.mono, color: OK, glow: 12, alpha: ep(lt, end + 0.5 + k * 0.25, 0.9), reveal: ep(lt, end + 0.5 + k * 0.25, 0.9) }));
      }
    },
    cues(V, api) {
      const m = rpsModel(V), { ts, sw, seen, end } = rpsTimes(V, api, m), out = [];
      if (V.phase === 'mixed') {
        out.push({ t: sw, type: 'swish' });
        out.push({ t: ts[m.H], type: 'count', dur: +(end - ts[m.H]).toFixed(2) });
        out.push({ t: end + 0.25, type: 'chime' });
      } else {
        for (let i = 0; i < m.W; i++) out.push({ t: ts[i], type: 'click' });
        out.push({ t: seen, type: 'thud' });
        out.push({ t: ts[m.W], type: 'count', dur: +(end - ts[m.W]).toFixed(2) });
      }
      return out.filter(c => c.t >= 0);
    },
  });

  // ================================================================ dough
  const DC = { x: 1270, y: 520, r: 215 }, FIX = { x: 1225, y: 552 };
  function presses(px, py, tau) {
    let dx = 0, dy = 0;
    for (let k = 0; k < 3; k++) {
      const ang = 0.55 * tau * (k % 2 ? -1 : 1) + k * 2.1, cx = DC.x + Math.cos(ang) * 140, cy = DC.y + Math.sin(ang) * 120;
      const g = Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / (2 * 85 * 85)), dir = ang + Math.PI / 2 + 0.6 * Math.sin(tau * 0.8 + k);
      const A = 66 * (0.6 + 0.4 * Math.sin(1.3 * tau + k * 1.7));
      dx += A * g * Math.cos(dir); dy += A * g * Math.sin(dir);
    }
    return [dx, dy];
  }
  function doughMap(px, py, tau, amp) {
    // a smooth, tear-free deformation that always keeps FIX in place
    const [ux, uy] = presses(px, py, tau), [fx, fy] = presses(FIX.x, FIX.y, tau);
    px += amp * (ux - fx); py += amp * (uy - fy);
    let qx = px - FIX.x, qy = py - FIX.y;
    const r2 = qx * qx + qy * qy;
    const tw = amp * (0.95 * Math.sin(0.85 * tau)) * Math.exp(-r2 / (2 * 150 * 150));
    let c = Math.cos(tw), s = Math.sin(tw); [qx, qy] = [c * qx - s * qy, s * qx + c * qy];
    const ph = 0.35 * tau, st = 1 + amp * 0.16 * Math.sin(0.7 * tau + 1.2);
    c = Math.cos(ph); s = Math.sin(ph);
    let ax = c * qx + s * qy, ay = -s * qx + c * qy; ax *= st; ay /= st;
    qx = c * ax - s * ay; qy = s * ax + c * ay;
    const fk = amp * 0.0011 * Math.sin(1.05 * tau + 2.0), fd = 0.5 * tau + 0.7;
    const rr = qx * qx + qy * qy; qx += fk * rr * Math.cos(fd) * 0.5; qy += fk * rr * Math.sin(fd) * 0.5;
    return [FIX.x + qx, FIX.y + qy];
  }
  // silent: the kneading belongs to the sentence that says "揉…" (searched from the knead step on); else the next one
  function doughTimes(s, api, V) {
    const lines = api.beat.lines, word = V.kneadWord || '揉';
    let j = -1;
    if (s.owner === api.beat.id) for (let k = s.at || 0; k < lines.length; k++) if ((lines[k].text || '').includes(word)) { j = k; break; }
    if (j < 0 && s.owner === api.beat.id && s.at != null && s.at + 1 < lines.length) j = s.at + 1;
    const L2 = j >= 0 ? api.line(j) : null;
    const show = L2 ? Math.max(s.lt + 0.5, L2.start - 0.6) : s.lt + 0.5, go = show + 0.8, fix = go + 2.6;
    return { show, appear: Math.min(show, s.lt + 1.2), go, fix, nash: fix + 2.0, stop: fix + 1.4 };
  }
  const KNEAD_SPEED = 0.6, KNEAD_DECEL = 1.8;
  function kneadTau(lt, T_) {
    const t = Math.max(0, lt - T_.go), s1 = Math.max(0, T_.stop - T_.go);
    const e = t < s1 ? t : t < s1 + KNEAD_DECEL ? s1 + (t - s1) - (t - s1) ** 2 / (2 * KNEAD_DECEL) : s1 + KNEAD_DECEL / 2;
    return e * KNEAD_SPEED;
  }
  let DOUGH = null;
  function doughGrains() {
    if (DOUGH) return DOUGH;
    const r = rng(1950), grains = [], dust = [], n = 120;
    for (let k = 0; k < n; k++) {
      const rr = DC.r * 0.9 * Math.sqrt((k + 0.5) / n), th = k * 2.39996;
      const px = DC.x + Math.cos(th) * rr + (r() - 0.5) * 16, py = DC.y + Math.sin(th) * rr * 0.92 + (r() - 0.5) * 16;
      if (Math.hypot(px - FIX.x, py - FIX.y) < 30) continue;
      grains.push({ px, py, depth: r(), gold: r() < 0.2, ph: r() * TAU });
    }
    for (let k = 0; k < 220; k++) {          // flour: tiny dots of light between the grains
      const rr = DC.r * Math.sqrt(r()), th = r() * TAU;
      dust.push({ px: DC.x + Math.cos(th) * rr, py: DC.y + Math.sin(th) * rr * 0.92, depth: r() });
    }
    return (DOUGH = { grains, dust });
  }
  T.register('dough', {
    draw(ctx, V, lt, api) {
      begin();
      const S = api.steps, sM = S.find(s => s.show === 'minimax') || null, sK = S.find(s => s.show === 'knead') || null;
      const tM = sM ? sM.lt : 1e9, tK = sK ? sK.lt : 1e9, gt = api.beat.start + lt;
      const T_ = sK ? doughTimes(sK, api, V) : null;
      const fa = T_ ? ep(lt, T_.fix, 1.0) : 0;
      FIELD(gt, { n: 70, chars: '衡解定稳', seed: 28, alpha: 0.06, color: '#b9c4cf' });
      // ---- headline: year in light, the name under it (cross-fades between the two steps)
      const kx = ep(lt, tK, 1.0, ease.inOut);
      const headline = (s, a, dy) => {
        if (a <= 0.003) return;
        const hx = 470;
        SF(String(s.year || ''), hx, 380 + dy, { size: 150, color: INK, glow: 14, alpha: a * (1 - 0.45 * fa), reveal: a, spacing: 8 });
        const nm = String(s.name || '').split(/\s+·\s+/);
        SF(nm[0] || '', hx, 510 + dy, { size: 52, color: GOLD, glow: 10, alpha: a * (1 - 0.45 * fa), reveal: a });
        if (nm.length > 1) SF(nm.slice(1).join(' · '), hx, 584 + dy, { size: 40, color: 'rgba(239,233,220,0.78)', glow: 0, alpha: a * (1 - 0.45 * fa), reveal: a });
      };
      if (sM) headline(sM, ep(lt, tM, 1.0) * (1 - kx), -kx * 40);
      if (sK) headline(sK, kx, (1 - kx) * 40);
      // ---- minimax: the row player's floor rises, the column player's ceiling falls; with mixing they meet
      if (sM) {
        const d = (sK ? sK.lt : api.dur) - tM;
        const t1 = tM + 0.14 * d, t2 = tM + 0.44 * d, t3 = tM + 0.58 * d, t4 = tM + 0.74 * d;
        const fade = ep(lt, t1 - 0.4, 0.8) * (1 - ep(lt, tK, 1.0, ease.inOut));
        if (fade > 0.003) {
          const ax = 1150, yTop = 200, yBot = 810, ym = 505, gap = 70, x0 = 1180, x1 = 1680, bx = 1430;
          ray(ax, yBot + 30, ax, yTop - 30, INK, 0.35 * fade, 1.2, 'band');
          const g = ease.inOut(prog(lt, t1, t1 + 1.6)), cl = ease.inOut(prog(lt, t3, t3 + 1.1));
          const gy = lerp(yBot - 20, lerp(ym + gap, ym + 3, cl), g), ty = lerp(yTop + 30, lerp(ym - gap, ym - 3, cl), ease.inOut(prog(lt, t1 + 0.3, t1 + 1.9)));
          const met = ep(lt, t4, 0.9);
          // the two bounds: lines of light, each with its glow on the side it comes from
          const ga = ep(lt, t1 - 0.2, 0.6) * fade * (1 - met), ta = ep(lt, t1 + 0.1, 0.6) * fade * (1 - met);
          LI(bx, gy + 70, 260, 'rgba(233,196,122,0.10)', ga); ray(x0, gy, x1, gy, GOLD, 0.95 * ga, 2, 'band');
          LI(bx, ty - 70, 260, 'rgba(127,216,203,0.10)', ta); ray(x0, ty, x1, ty, TEAL, 0.95 * ta, 2, 'band');
          // each bound spills a soft band of light towards the side it comes from
          const pool = (y, dir, hex, a) => {        // a soft oval of light on the side the bound comes from
            if (a <= 0.003) return;
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * ENV;
            ctx.translate(bx, y + dir * 46); ctx.scale(1, 0.32);
            const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 280);
            g2.addColorStop(0, rgba(hex, 0.16)); g2.addColorStop(1, rgba(hex, 0));
            ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, 280, 0, TAU); ctx.fill(); ctx.restore();
          };
          pool(gy, 1, GOLD, ga); pool(ty, -1, TEAL, ta);
          const la = 1 - ep(lt, t3 + 0.3, 0.8);
          SF(V.floor || '最坏里挑最好', ax - 36, gy + 12, { size: 36, color: GOLD, glow: 6, align: 'right', alpha: ep(lt, t1 + 0.4, 0.8) * fade * la, reveal: ep(lt, t1 + 0.4, 0.9) });
          SF('max · min', ax - 36, gy + 56, { size: 26, family: F.mono, color: 'rgba(233,196,122,0.7)', glow: 0, align: 'right', alpha: ep(lt, t1 + 0.6, 0.8) * fade * la });
          SF(V.ceiling || '最好里挑最坏', ax - 36, ty + 12, { size: 36, color: TEAL, glow: 6, align: 'right', alpha: ep(lt, t1 + 0.7, 0.8) * fade * la, reveal: ep(lt, t1 + 0.7, 0.9) });
          SF('min · max', ax - 36, ty - 36, { size: 26, family: F.mono, color: 'rgba(127,216,203,0.7)', glow: 0, align: 'right', alpha: ep(lt, t1 + 0.9, 0.8) * fade * la });
          // the gap, and the permission that closes it
          const gpa = ep(lt, t2, 0.8) * (1 - ep(lt, t3 + 0.4, 0.6)) * fade;
          SF(V.mixedLabel || '允许混合策略', bx, ym + 12, { size: 34, color: INK, glow: 4, alpha: gpa, reveal: ep(lt, t2, 1.0) });
          // they meet: one ember line, one point of light
          if (met > 0) {
            ray(x0 - 60, ym, lerp(x0, x1 + 60, met), ym, EMBER, 0.95 * fade, 2, 'band');
            LI(bx, ym, 170, 'rgba(255,159,90,0.30)', met * fade);
            G('·', bx, ym, 44, EMBER, met * fade, { glow: 10 });
            SF(V.meetLabel || '相等 → 稳定解', ax - 36, ym + 14, { size: 40, color: EMBER, glow: 12, align: 'right', alpha: met * fade, reveal: met });
          }
        }
      }
      // ---- knead: a lump of 面 grains; every grain moves except one
      if (T_) {
        const da = ep(lt, T_.appear, 1.2) * (1 - 0.0 * fa);
        if (da > 0.003) {
          const amp = 0.7 * ease.inOut(prog(lt, T_.go, T_.go + 1.6)), tau = kneadTau(lt, T_), tauPrev = kneadTau(lt - 0.35, T_);
          const { grains, dust } = doughGrains(), ch = V.grain || '面';
          const still = ep(lt, T_.stop, 1.4), others = 1 - 0.5 * fa;
          LI(DC.x, DC.y, 380, 'rgba(233,196,122,0.10)', da);
          // motion trails, one path
          if (amp > 0) {
            ctx.save(); ctx.globalAlpha = 0.2 * da * ENV * (1 - still) * others; ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.beginPath();
            for (const q of grains) { const [x, y] = doughMap(q.px, q.py, tau, amp), [x0, y0] = doughMap(q.px, q.py, tauPrev, amp); ctx.moveTo(x0, y0); ctx.lineTo(x, y); }
            ctx.stroke(); ctx.restore();
          }
          for (const q of dust) {
            const [x, y] = doughMap(q.px, q.py, tau, amp);
            G('·', x, y, 18, q.depth > 0.7 ? GOLD : INK, da * (0.2 + 0.35 * q.depth) * others);
          }
          for (const q of grains) {
            const [x, y] = doughMap(q.px, q.py, tau, amp);
            G(ch, x, y, ev(20 + q.depth * 14), q.gold ? GOLD : INK, da * (0.32 + 0.5 * q.depth) * others);
          }
          // the fixed point
          const breathe = fa > 0 ? 0.85 + 0.15 * Math.sin((lt - T_.fix) * 1.6) : 1;
          LI(FIX.x, FIX.y, 130, 'rgba(255,159,90,0.34)', fa * da * breathe);
          const pu = prog(lt, T_.fix, T_.fix + 2.2);
          if (pu > 0 && pu < 1) LI(FIX.x, FIX.y, 60 + 260 * ease.out(pu), 'rgba(255,159,90,0.16)', (1 - pu) * da);
          G(ch, FIX.x, FIX.y, fa > 0 ? 44 : 30, fa > 0 ? EMBER : INK, da * (0.8 + 0.2 * fa), { glow: fa > 0 ? 14 : 0 });
        }
      }
    },
    cues(V, api) {
      const out = [];
      const sK = api.steps.find(s => s.show === 'knead');
      for (const s of api.steps) {
        if (s.owner !== api.beat.id) continue;
        if (s.show === 'minimax') {
          const d = (sK ? sK.lt : api.dur) - s.lt;
          out.push({ t: s.lt, type: 'tick' }, { t: s.lt + 0.14 * d, type: 'whoosh', dur: 1.8 }, { t: s.lt + 0.74 * d, type: 'pop' });
        }
        if (s.show === 'knead') { const T_ = doughTimes(s, api, V); out.push({ t: s.lt, type: 'tick' }, { t: T_.show, type: 'swish' }, { t: T_.fix, type: 'pop' }); if (api.silent !== true) out.push({ t: T_.nash, type: 'chime' }); }
      }
      return out;
    },
  });

  // ================================================================ chicken
  function chickenTiming(V, api) {
    const tT = stepT(api, 'throw', api.dur * 0.45), tS = stepT(api, 'swerve', api.dur * 0.72);
    const lift = tT, fly = lift + 1.0, land = fly + 1.5, dodge = tS + 1.2;
    return { silent: true, tA: 0, tT, tLift: lift, tFly: fly, tLand: land, tS, tDodge: dodge, tConc: Infinity, dLat: 2.2, dRun: 3.2, lift: 0.8 };
  }
  function beam(x, y, ang, len, spread, a) {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * ENV;
    ctx.translate(x, y); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'rgba(255,238,205,0.34)'); g.addColorStop(0.35, 'rgba(255,230,190,0.12)'); g.addColorStop(1, 'rgba(255,230,190,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(len, -len * spread); ctx.lineTo(len, len * spread); ctx.lineTo(0, 10); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function wheel(x, y, r, rot, a) {
    if (a <= 0.003) return;
    LI(x, y, r * 3, 'rgba(233,196,122,0.22)', a);
    ctx.save(); ctx.globalAlpha = a * ENV; ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(2, r * 0.14); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    for (const an of [0, Math.PI, Math.PI / 2]) { ctx.beginPath(); ctx.moveTo(Math.cos(an) * r * 0.28, Math.sin(an) * r * 0.28); ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  T.register('chicken', {
    timing: chickenTiming,
    draw(ctx, V, lt, api) {
      begin();
      const cx = 960, roadY = 540, RH = 110, CAR = 150;
      const tm = chickenTiming(V, api), { tA, tLift, tFly, tLand, tS, tDodge, dLat, dRun } = tm;
      const tEnd = tDodge + dRun, gt = api.beat.start + lt;
      // ---- kinematics (as before; afterwards the two cars keep rolling apart slowly instead of freezing)
      const D = t => 1350 - 110 * clamp(t, 0, tEnd) - 1000 * ease.inOut(prog(t, tDodge, tEnd)) - 36 * Math.max(0, t - tEnd);
      const posG = t => ({ x: cx - D(t) / 2, y: roadY });
      const posT = t => {
        const k = prog(t, tDodge, tDodge + dLat);
        return { x: cx + D(t) / 2, y: roadY - 205 * ease.inOut(k), a: Math.PI + 0.55 * Math.sin(Math.PI * k) * (k < 1 ? 1 : 0) };
      };
      const speed = (f, t) => { const a = f(t - 0.05), b = f(t + 0.05); return Math.hypot(b.x - a.x, b.y - a.y) / 0.1; };
      FIELD(gt, { n: 70, chars: '撞躲', seed: 44, alpha: 0.06, color: '#c9a79c' });

      // ---- camera: a slow push-in while the gap closes
      const sc = 1 + 0.045 * ease.inOut(prog(lt, tA, tDodge));
      ctx.save(); ctx.translate(cx, roadY); ctx.scale(sc, sc); ctx.translate(-cx, -roadY);
      // ---- road: two edge lines of light, a centre line of studs
      const rp = ep(lt, tA, 1.2);
      ray(60, roadY - RH, 1860, roadY - RH, INK, 0.2 * rp, 1.2, 'band');
      ray(60, roadY + RH, 1860, roadY + RH, INK, 0.2 * rp, 1.2, 'band');
      for (let x = 100; x < 1840; x += 64) G('·', x, roadY, 22, INK, 0.3 * rp * (1 - Math.abs(x - cx) / 1100));
      const d0 = D(lt), g = posG(lt), tp = posT(lt);
      // ---- danger: a red glow in the gap, stronger as it closes, gone once one of them gives way
      const danger = Math.pow(clamp(1 - d0 / 1350), 1.4) * (1 - ep(lt, tDodge + 0.4, 1.4, ease.inOut)) * (0.85 + 0.15 * Math.sin(lt * 5));
      LI((g.x + tp.x) / 2, roadY, 300, 'rgba(224,112,95,0.34)', danger);
      LI((g.x + tp.x) / 2, roadY, 90, 'rgba(255,150,120,0.35)', danger * danger);

      // ---- 乙's two options, once 甲 can no longer steer
      const gS = posG(tS), tSp = posT(tS);
      const optA = ep(lt, tS + 0.3, 0.9);
      if (optA > 0) {
        const crashA = optA * (1 - ep(lt, tDodge + 0.6, 1.0));   // gone once 乙 has committed to the swerve
        const xa = tSp.x - CAR / 2 - 14, xb = gS.x + CAR / 2 + 40, xx = (tSp.x - CAR / 2 + gS.x + CAR / 2) / 2 + 30;
        ray(xa, roadY, xb, roadY, RED, 0.8 * crashA, 2, 'band');
        LI(xx, roadY, 70, 'rgba(224,112,95,0.45)', crashA);
        SF(V.crash || '直行：撞', xx, roadY + 66, { size: 32, color: RED, glow: 6, alpha: crashA, reveal: optA });
        const dodgeA = optA * lerp(1, 0.6, ep(lt, tEnd, 1.2));
        for (let k = 1; k <= 26; k++) {
          const u = k / 26, p = posT(tDodge + dRun * u), q = prog(lt, tDodge + dRun * u - 0.4, tDodge + dRun * u);
          G('·', p.x - CAR / 2 - 14, p.y, 26, OK, dodgeA * (0.9 - 0.5 * q) * (0.4 + 0.6 * (1 - u * 0.5)), { glow: 4 });
        }
        const pm = posT(tDodge + dRun * 0.55);
        const lblA = dodgeA * (1 - ep(lt, tDodge + dRun * 0.35, 0.6)) + 0.0;
        SF(V.dodge || '转向：躲', pm.x - CAR / 2 - 14, pm.y - 96, { size: 32, color: OK, glow: 6, alpha: lblA, reveal: optA });
      }
      // ---- 甲's locked path: a line of ember light straight ahead
      const lockA = ep(lt, tLand - 0.1, 0.8);
      if (lockA > 0) {
        const x0 = g.x + CAR / 2 + 10, len = 260 * ease.out(prog(lt, tLand - 0.1, tLand + 0.8));
        ray(x0, roadY, x0 + Math.max(20, len), roadY, EMBER, 0.9 * lockA, 2.5, 'out');
      }
      // ---- the cars: 车 glyphs in their headlights
      const drive = 1 - prog(lt, tEnd - 0.5, tEnd + 1.5) * 0.7;
      const carDraw = (p, ang, color, name, seed) => {
        const fx = p.x + Math.cos(ang) * CAR * 0.42, fy = p.y + Math.sin(ang) * CAR * 0.42;
        beam(fx, fy, ang, 520, 0.2, 1);
        LI(fx, fy, 34, 'rgba(255,244,222,0.9)', 1);
        const bx = p.x - Math.cos(ang) * CAR * 0.42, by = p.y - Math.sin(ang) * CAR * 0.42;
        LI(bx, by, 26, 'rgba(224,112,95,0.75)', 1);
        // speed streaks behind, bright at the car
        const v = clamp(speed(seed ? posT : posG, lt) / 60) * drive;
        for (let k = 0; k < 5; k++) {
          const off = (k - 2) * 15, len = (90 + 60 * ((k * 7 + seed * 3) % 5) / 4) * Math.max(0.5, v);
          const sx = bx - Math.cos(ang) * 8 - Math.sin(ang) * off, sy = by - Math.sin(ang) * 8 + Math.cos(ang) * off;
          ray(sx, sy, sx - Math.cos(ang) * len, sy - Math.sin(ang) * len, color, 0.4 * Math.max(0.35, v), 1.3, 'out');
        }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang - (seed ? Math.PI : 0));
        G(V.carGlyph || '车', 0, 0, 104, color, 1, { glow: 12 });
        ctx.restore();
        SF(name, p.x, p.y + 88 + (seed ? 40 * Math.abs(Math.sin(ang)) : 0), { size: 34, color, glow: 6, alpha: 0.9 });
      };
      carDraw(g, 0, GOLD, V.a || '甲', 0);
      carDraw(tp, tp.a, TEAL, V.b || '乙', 1);

      // ---- the steering wheel, out of the window
      if (lt >= tLift) {
        const kL = ease.out(prog(lt, tLift, tLift + tm.lift));
        let x, y, r, rot = 0, a = 1;
        const gF = posG(tFly);
        const p0 = { x: gF.x + 12, y: roadY - 14 - 78 };
        const p2 = { x: Math.max(230, gF.x - 250), y: roadY + RH + 95 }, p1 = { x: gF.x - 40, y: roadY - 300 };
        const bez = k => ({ x: (1 - k) * (1 - k) * p0.x + 2 * k * (1 - k) * p1.x + k * k * p2.x, y: (1 - k) * (1 - k) * p0.y + 2 * k * (1 - k) * p1.y + k * k * p2.y });
        if (lt < tFly) {
          const gp = posG(lt);
          x = gp.x + 12; y = roadY - 14 - 78 * kL; r = lerp(10, 26, kL); rot = 0.4 * kL;
          LI(x, y, 90, 'rgba(255,159,90,0.35)', (1 - prog(lt, tLift + 0.2, tLift + 1.2)) * kL);
        } else {
          const kf = prog(lt, tFly, tLand), k = ease.sine(kf);
          const p = bez(k); x = p.x; y = p.y; r = lerp(26, 18, k); rot = 0.4 + 3.2 * TAU * ease.out(kf);
          a = lerp(1, 0.7, prog(lt, tLand, tLand + 1));
          const ta = 1 - prog(lt, tLand + 0.3, tLand + 2.0);
          if (ta > 0) for (let j = 0; j < 22; j++) {
            const u = k * j / 22, q = bez(u);
            G('·', q.x, q.y, 24, EMBER, ta * 0.75 * (0.3 + 0.7 * j / 22), { glow: 4 });
          }
        }
        wheel(x, y, r, rot, a);
        SF(V.wheelLabel || '方向盘', p2.x, p2.y + 62, { size: 28, color: DIM, glow: 0, alpha: ep(lt, tLand + 0.1, 0.8), reveal: ep(lt, tLand + 0.1, 0.9) });
      }
      ctx.restore();

      // ---- HUD: the gap, and what each driver can still do
      const gap = d0 > 0 ? `${Math.round(d0 / 10)} 米` : '错开';
      HUD([{ label: '两车相距', value: gap, color: d0 > 0 && d0 < 700 ? RED : INK, glow: d0 > 0 && d0 < 450 },
        { label: `${V.a || '甲'} 能选`, value: lt < tFly ? '直行 · 转向' : '只能直行', color: GOLD },
        { label: `${V.b || '乙'} 能选`, value: lt < tS + 0.3 ? '直行 · 转向' : '只能转向', color: TEAL }], ep(lt, tA, 0.8));
    },
    cues(V, api) {
      const t = chickenTiming(V, api), out = [];
      const cue = (tt, type, extra) => { if (tt != null && isFinite(tt)) out.push({ t: tt, type, ...(extra || {}) }); };
      cue(t.tLift, 'pop'); cue(t.tFly, 'swish');
      cue(t.tS + 0.1, 'tick'); cue(t.tDodge, 'whoosh', { dur: t.dRun }); cue(t.tConc, 'chime');
      return out;
    },
  });

  // ================================================================ adverse selection
  const INS = { x: 1530, y: 480 };
  const ADV = new Map();
  function crowd(V) {
    const n = V.n || 60, key = JSON.stringify([n, V.seed, V.badShare]);
    if (ADV.has(key)) return ADV.get(key);
    const r = rng(V.seed || 11);
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const bad = new Set(idx.slice(0, Math.round(n * (V.badShare == null ? 0.5 : V.badShare))));
    // an organic crowd: best-of-k samples in a soft ellipse (keeps a minimum spacing without a grid)
    const ppl = [], ex = 620, ey = 540, rx = 410, ry = 250;
    for (let i = 0; i < n; i++) {
      let best = null, bd = -1;
      for (let k = 0; k < 24; k++) {
        const a = r() * TAU, u = Math.sqrt(r()), x = ex + Math.cos(a) * rx * u, y = ey + Math.sin(a) * ry * u;
        let d = 1e9; for (const q of ppl) d = Math.min(d, Math.hypot((q.x - x) * 0.8, q.y - y));
        if (d > bd) { bd = d; best = [x, y]; }
      }
      ppl.push({ i, x: best[0], y: best[1], bad: bad.has(i), depth: r(), ph: r() * TAU });
    }
    const good = ppl.filter(p => !p.bad).sort((a, b) => a.x - b.x), badL = ppl.filter(p => p.bad).sort((a, b) => b.x - a.x);
    good.forEach((p, k) => { p.rank = k; });
    badL.forEach((p, k) => {
      p.rank = k; const ang = k * 2.39996 + 1.0, rad = 30 * Math.sqrt(k + 0.8);
      p.tx = 1190 + Math.cos(ang) * rad * 1.05 - 20; p.ty = 500 + Math.sin(ang) * rad * 0.85;
    });
    const m = { ppl, good, bad: badL }; ADV.set(key, m); return m;
  }
  function adverseTiming(V, api) {
    const tC = stepT(api, 'crowd', 0.3), tP = stepT(api, 'price', api.dur * 0.4), sL = api.steps.find(s => s.show === 'leave');
    const tL = sL ? sL.lt : api.dur * 0.7;
    const nb = V.rounds || 3, go0 = tL + 0.4;
    // the sick move in with the sentence after the one that sends the healthy away (or an explicit 'come' step)
    const sC = api.steps.find(s => s.show === 'come' || s.show === 'gather');
    let L2 = sC ? sC.lt : null;
    if (L2 == null && sL && sL.owner === api.beat.id && sL.at != null && api.line(sL.at + 1)) L2 = api.line(sL.at + 1).start;
    if (L2 == null) L2 = Math.max(go0 + 5, api.dur * 0.5);
    const gap = Math.max(1.6, (L2 - 1.9 - go0) / Math.max(1, nb - 1));
    const tGoB = b => go0 + b * gap;
    return { silent: true, nb, tGoB, tUp: j => tGoB(j - 1) + 2.0, L2, tC, tQ: tC + 0.8, tTag: tP, tCheap: tL + 2.4, tGather: L2 + 0.4, tL: L2, tConc: Infinity };
  }
  T.register('adverse', {
    timing: adverseTiming,
    draw(ctx, V, lt, api) {
      begin();
      const tm = adverseTiming(V, api), C = crowd(V), gt = api.beat.start + lt;
      FIELD(gt, { n: 70, chars: '保险人', seed: 51, alpha: 0.06, color: '#c9b0a0' });
      // the camera drifts right once the healthy are gone, to what is left at the insurer's door
      const pan = -300 * ease.inOut(prog(lt, tm.tGather + 0.5, tm.tGather + 6.5));
      ctx.save(); ctx.translate(pan, 0);
      // ---- the insurer: one big glyph in warm light
      const ia = ep(lt, tm.tC + 0.3, 1.2);
      const gatherP = ease.inOut(prog(lt, tm.tGather, tm.tGather + 3.4 + C.bad.length * 0.06));
      LI(INS.x, INS.y, 300, 'rgba(255,159,90,0.10)', ia);
      SF(V.insurerGlyph || '保', INS.x, INS.y, { size: 170, color: INK, glow: 16, alpha: ia, reveal: ia });
      SF(V.insurer || '保险公司', INS.x, INS.y + 138, { size: 38, color: 'rgba(239,233,220,0.85)', glow: 0, alpha: ia, reveal: ia, spacing: 6 });
      const qa = fio(lt, tm.tQ, tm.tL + 0.2, 0.6);
      SF(V.blind || '看不出谁健康', INS.x, INS.y + 192, { size: 30, color: DIM, glow: 0, alpha: qa, reveal: qa });
      // ---- the price, rising round after round
      const labs = V.prices || [V.price || '中间价', '价格 ↑', '价格 ↑↑', '价格 ↑↑↑'];
      let lev = 0; for (let j = 1; j <= tm.nb && j < labs.length; j++) if (lt >= tm.tUp(j)) lev = j;
      const tagA = ep(lt, tm.tTag, 0.9);
      const f = lev > 0 ? ease.inOut(prog(lt, tm.tUp(lev), tm.tUp(lev) + 0.8)) : 1;
      const pop = lev > 0 ? bump(lt, tm.tUp(lev), 1.2) : bump(lt, tm.tTag, 1.2);
      LI(INS.x, INS.y - 180, 150, 'rgba(255,159,90,0.22)', tagA * (0.6 + 0.4 * pop));
      if (lev > 0 && f < 1) SF(labs[lev - 1], INS.x, INS.y - 180 - 20 * f, { size: 48, color: EMBER, glow: 10, alpha: tagA * (1 - f) });
      SF(labs[lev], INS.x, INS.y - 180 + (1 - f) * 16, { size: 48, color: EMBER, glow: 12 + 10 * pop, alpha: tagA * f, reveal: lev ? f : tagA });

      // ---- the crowd of 人
      const ch = V.glyph || '人';
      let goodLeft = 0;
      const says = [];
      for (const p of C.ppl) {
        const a0 = ep(lt, tm.tC + 0.25 + p.i * 0.02, 0.9);
        let x = p.x, y = p.y + Math.sin(gt * 0.6 + p.ph) * 2.5, a = a0, blur = p.depth < 0.3 ? 2 : 0;
        let size = 40 + p.depth * 20;
        if (!p.bad) {
          const b = Math.floor(p.rank * tm.nb / C.good.length), t0 = tm.tGoB(b) + (p.rank % 5) * 0.15;
          const k = ease.inOut(prog(lt, t0, t0 + 2.6));
          x = lerp(p.x, p.x - 420, k); y += 6 * k;
          a *= 1 - ease.inOut(prog(lt, t0 + 0.6, t0 + 2.6)); blur = Math.round(lerp(blur, 6, k)); size *= lerp(1, 0.8, k);
          if (k < 0.5) goodLeft++;
          if (p.rank % 10 === 3) says.push({ s: V.goodSay || '太贵', x, y: y - 50, a: a * fio(lt, tm.tGoB(b) - 0.8, tm.tGoB(b) + 1.3, 0.4), c: OK });
        } else {
          const t0 = tm.tGather + p.rank * 0.08, k = ease.inOut(prog(lt, t0, t0 + 3.4));
          x = lerp(p.x, p.tx, k); y = lerp(y, p.ty, k);
          size = lerp(size, 44 + p.depth * 16, k);
          if (p.rank % 10 === 1) says.push({ s: V.badSay || '划算', x, y: y - 50, a: a * fio(lt, tm.tCheap + (p.rank % 4) * 0.2, tm.tGather + 0.4, 0.4), c: RED });
        }
        G(ch, x, y, ev(size), p.bad ? RED : OK, a * (0.62 + 0.38 * p.depth), { blur, glow: 6 });
      }
      for (const s of says) if (s.a > 0.01) SF(s.s, s.x, s.y, { size: 28, color: s.c, glow: 4, alpha: s.a, reveal: s.a });
      // what is left gathers in a red light at the insurer's door
      LI(1190, 500, 360, 'rgba(224,112,95,0.14)', gatherP);
      LI(INS.x, INS.y, 220, 'rgba(224,112,95,0.12)', gatherP);
      ctx.restore();
      HUD([{ label: '价格', value: labs[lev], color: EMBER }, { label: V.goodLabel || '健康', value: goodLeft, color: OK },
        { label: V.badLabel || '高风险', value: C.bad.length, color: RED, glow: gatherP > 0.8 }], ep(lt, tm.tC, 0.8));
    },
    cues(V, api) {
      const t = adverseTiming(V, api), out = [];
      const cue = (tt, type, extra) => { if (tt != null && isFinite(tt)) out.push({ t: tt, type, ...(extra || {}) }); };
      cue(t.tC + 0.3, 'tick'); cue(t.tTag, 'pop');
      for (let b = 0; b < t.nb; b++) { cue(t.tGoB(b), 'whoosh', { dur: 2.6 }); cue(t.tUp(b + 1), 'pop'); }
      cue(t.tGather, 'whoosh', { dur: 3.4 });
      return out;
    },
  });

  // ================================================================ insurance (screening)
  function insuranceTiming(V, api) {
    const Pl = stepT(api, 'plans', api.dur * 0.28), So = stepT(api, 'sort', api.dur * 0.64);
    const tA = Pl + 0.4, ll = lastLineStart(api);
    const L2 = ll != null && ll > So + 1 ? ll : So + 4.5;
    return { silent: true, tMenu: Infinity, tA, tB: tA + 1.6, tS: So, tGoA: So + 0.5, tSb: So + 2.6, walk: 2.4, stag: 0.2, tDone: L2 + 0.3, tConc: Infinity };
  }
  const INSC = new Map();
  function drivers(V, types) {
    const pat = V.pattern || [0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1], n = V.n || pat.length * 3, key = JSON.stringify([pat, n]);
    if (INSC.has(key)) return INSC.get(key);
    const r = rng(2000), rank = [0, 0], out = [];
    for (let i = 0; i < n; i++) {
      const ty = pat[i % pat.length], typ = types[ty] || types[0], pj = typ.plan != null ? typ.plan : ty;
      out.push({ i, ty, pj, r: rank[pj]++, x: lerp(430, 1490, (i + 0.5) / n) + (r() - 0.5) * 40, y: 770 + (r() - 0.5) * 90, depth: r(), ph: r() * TAU });
    }
    const m = { list: out, cnt: rank.slice() }; INSC.set(key, m); return m;
  }
  T.register('insurance', {
    timing: insuranceTiming,
    draw(ctx, V, lt, api) {
      begin();
      const tm = insuranceTiming(V, api), gt = api.beat.start + lt;
      const plans = V.plans || [{ name: '方案 A', price: '2000 元/年', terms: '出事先自付 2 万' }, { name: '方案 B', price: '5000 元/年', terms: '出事全赔' }];
      const types = V.types || [{ label: '老司机', color: OK, plan: 0 }, { label: '马路杀手', color: RED, plan: 1 }];
      const D = drivers(V, types), xs = [600, 1320], cy = 575;
      const tGo = [tm.tGoA, tm.tSb], stag = tm.stag * 12 / Math.max(12, D.list.length);
      FIELD(gt, { n: 70, chars: '选险车', seed: 63, alpha: 0.05, color: '#c9b0a0' });
      // ---- the menu: two offers, split by a thin vertical light (it extends down between the groups at the end)
      const sep = ep(lt, tm.tA, 1.2), sepDown = ep(lt, tm.tDone, 1.6, ease.inOut);
      ray(960, 170, 960, lerp(430, 860, sepDown), INK, 0.3 * sep, 1.2, 'band');
      const arrived = [0, 0];
      for (const d of D.list) { const t0 = tGo[d.pj] + d.r * stag; if (lt >= t0 + tm.walk * 0.6) arrived[d.pj]++; }
      for (let j = 0; j < plans.length && j < 2; j++) {
        const pl = plans[j], x = xs[j], a = ep(lt, [tm.tA, tm.tB][j], 1.0);
        const typ = types.find(t => t.plan === j), hl = typ ? ep(lt, Math.max(tGo[j] + tm.walk * 0.8, tm.tDone), 0.9) : 0;
        const col = typ ? typ.color : INK;
        LI(x, 300, 300, 'rgba(233,196,122,0.07)', a);
        if (hl > 0) { LI(x, 300, 320, rgba(col, 0.16), hl); LI(x, cy, 260, rgba(col, 0.12), hl); }
        SF(pl.name, x, 212, { size: 30, color: 'rgba(239,233,220,0.6)', glow: 0, alpha: a, reveal: a, spacing: 8 });
        SF(pl.price, x, 300, { size: 76, color: INK, glow: 12 + 8 * hl, alpha: a, reveal: a });
        SF(pl.terms, x, 378, { size: 36, color: 'rgba(239,233,220,0.7)', glow: 0, alpha: a, reveal: ep(lt, [tm.tA, tm.tB][j] + 0.4, 1.0) });
      }
      // ---- the drivers: a mixed crowd that sorts itself
      const ch = V.glyph || '人';
      for (const d of D.list) {
        const typ = types[d.ty] || types[0];
        const ang = d.r * 2.39996 + d.pj, rad = 26 * Math.sqrt(d.r + 0.6);
        const tx = xs[d.pj] + Math.cos(ang) * rad * 1.35, ty = cy + Math.sin(ang) * rad * 0.8;
        const t0 = tGo[d.pj] + d.r * stag, k = ease.inOut(prog(lt, t0, t0 + tm.walk));
        const x = lerp(d.x, tx, k), y = lerp(d.y, ty, k) + Math.sin(gt * 0.6 + d.ph) * 2.5 - Math.sin(Math.PI * k) * 30;
        const a = ep(lt, 0.5 + d.i * 0.03, 0.9);
        G(ch, x, y, ev(38 + 22 * d.depth), typ.color, a * (0.6 + 0.4 * d.depth), { blur: d.depth < 0.25 ? 2 : 0, glow: 6 });
      }
      for (let j = 0; j < 2; j++) {
        const typ = types.find(t => t.plan === j); if (!typ) continue;
        const a = ep(lt, Math.max(tGo[j] + tm.walk * 0.9, tm.tDone), 0.9);
        SF(typ.label, xs[j], 762, { size: 36, color: typ.color, glow: 8, alpha: a, reveal: a, spacing: 6 });
      }
      HUD([{ label: plans[0].name, value: arrived[0], color: (types.find(t => t.plan === 0) || {}).color || INK },
        { label: plans[1] ? plans[1].name : '', value: arrived[1], color: (types.find(t => t.plan === 1) || {}).color || INK }], ep(lt, tm.tS, 0.8));
    },
    cues(V, api) {
      const t = insuranceTiming(V, api), out = [];
      const cue = (tt, type, extra) => { if (tt != null && isFinite(tt)) out.push({ t: tt, type, ...(extra || {}) }); };
      cue(t.tMenu, 'tick'); cue(t.tA, 'pop'); cue(t.tB, 'pop');
      cue(t.tGoA, 'whoosh', { dur: t.walk + 1 }); cue(t.tSb, 'whoosh', { dur: t.walk + 1 }); cue(t.tConc, 'chime');
      cue(t.tDone, 'chime');
      return out;
    },
  });
})();
