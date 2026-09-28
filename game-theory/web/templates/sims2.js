/* Simulations (2): mechanisms you can watch happen.
 *   sim_tournament — Axelrod-style round-robin of repeated prisoner's dilemma: play / winner
 *   sim_auction    — adding one licence to a locked auction: open / bid
 * Both simulations are computed for real (deterministic, K.rng) once per parameter set and cached;
 * every frame is a pure function of time that only reads the precomputed rounds.
 * Colours: cooperate = ok, defect = red, player A = gold, player B = teal, emphasis = ember, money = gold. */
(function () {
  const { P, F, text, measure, ease, prog, clamp, lerp } = K;
  const TAU = Math.PI * 2;
  const DARK = '#0a0d13';

  // ---------------------------------------------------------------- shared helpers
  const fin = (lt, a, d = 0.6) => ease.out(prog(lt, a, a + d));
  const fio = (lt, a, b, d = 0.5) => isFinite(b) ? Math.min(fin(lt, a, d), 1 - ease.in(prog(lt, b - d, b))) : fin(lt, a, d);
  function A(ctx, a, fn) { if (a <= 0.001) return; ctx.save(); ctx.globalAlpha *= a; fn(); ctx.restore(); }
  const rise = (a, px = 16) => (1 - a) * px;
  function cue(list, t, type, extra) { if (t != null && isFinite(t)) list.push({ t: +t.toFixed(3), type, ...(extra || {}) }); }
  function step(api, name, fb) { const s = api.steps.find(x => x.show === name); return s ? s.lt : fb; }
  // coloured pieces on one line: [[str, color, opts]], x = left edge (or centre with o.align='center')
  function runs(pieces, x, y, o = {}) {
    const size = o.size || 40, fam = o.family || F.sans, wt = o.weight || 500;
    const spec = p => ({ size: (p[2] && p[2].size) || size, family: (p[2] && p[2].family) || fam, weight: (p[2] && p[2].weight) || wt });
    const ws = pieces.map(p => measure(p[0], spec(p)));
    const tot = ws.reduce((a, b) => a + b, 0);
    let cx = o.align === 'center' ? x - tot / 2 : o.align === 'right' ? x - tot : x;
    pieces.forEach((p, i) => { text(p[0], cx, y, { ...spec(p), color: p[1], baseline: o.baseline, glow: p[2] && p[2].glow }); cx += ws[i]; });
    return tot;
  }
  function rr(ctx, x, y, w, h, r, fill, stroke, lw = 2) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const memo = {};
  function cached(key, make) { return memo[key] || (memo[key] = make()); }

  // ================================================================= sim_tournament
  // Strategies: move(my history, opponent history, rng) -> true = defect.
  const STRATS = {
    tft:     { name: '以牙还牙', move: (m, o) => o.length ? o[o.length - 1] : false },
    alld:    { name: '永远背叛', move: () => true },
    allc:    { name: '永远合作', move: () => false },
    random:  { name: '随机',     move: (m, o, r) => r() < 0.5 },
    grudger: { name: '记仇者',   move: (m, o) => o.includes(true) },          // cooperates until betrayed once, then never again
    stft:    { name: '多疑者',   move: (m, o) => o.length ? o[o.length - 1] : true },   // tit for tat that opens with a defection
    joss:    { name: '偷袭者',   move: (m, o, r) => (o.length ? o[o.length - 1] : false) || r() < 0.1 },
    pavlov:  { name: '赢留输变', move: (m, o) => m.length ? (m[m.length - 1] === o[o.length - 1] ? false : true) : false },
  };
  // payoff to me: both cooperate 3, I defect on a cooperator 5, I am the sucker 0, both defect 1
  const PAY = (me, op) => !me && !op ? 3 : me && !op ? 5 : !me && op ? 0 : 1;

  function tournament(keys, rounds, seed, pairs) {
    return cached(`T|${keys}|${rounds}|${seed}|${JSON.stringify(pairs)}`, () => {
      const n = keys.length, R = rounds;
      const cum = keys.map(() => new Float64Array(R + 1));        // cumulative total of each strategy after r rounds
      const matches = {};
      let k = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {   // every pair plays once, R rounds
        const r = K.rng(seed + 101 * (k++)), a = [], b = [], sa = new Int32Array(R + 1), sb = new Int32Array(R + 1);
        const fa = STRATS[keys[i]].move, fb = STRATS[keys[j]].move;
        for (let t = 0; t < R; t++) {
          const x = fa(a, b, r), y = fb(b, a, r);
          a.push(x); b.push(y);
          sa[t + 1] = sa[t] + PAY(x, y); sb[t + 1] = sb[t] + PAY(y, x);
          cum[i][t + 1] += PAY(x, y); cum[j][t + 1] += PAY(y, x);
        }
        matches[keys[i] + '|' + keys[j]] = { a, b, sa, sb };
        matches[keys[j] + '|' + keys[i]] = { a: b, b: a, sa: sb, sb: sa };
      }
      for (const c of cum) for (let t = 1; t <= R; t++) c[t] += c[t - 1];
      // leaderboard order per round, with a little hysteresis so near-ties do not flicker;
      // the last round is sorted strictly, so the final ranking is exact.
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
      const winner = order[R][0];
      const pm = (pairs || []).map(([x, y]) => ({ x, y, m: matches[x + '|' + y] })).filter(p => p.m);
      // runs of equal moves, so a 200-cell strip is drawn with a handful of rects
      for (const p of pm) {
        const mk = arr => { const out = []; let s0 = 0; for (let t = 1; t <= arr.length; t++) if (t === arr.length || arr[t] !== arr[s0]) { out.push([s0, t, arr[s0]]); s0 = t; } return out; };
        p.runsA = mk(p.m.a); p.runsB = mk(p.m.b);
      }
      return { keys, n, R, cum, order, rankAt, final, winner, max: Math.max(...final), pairs: pm };
    });
  }

  T.register('sim_tournament', {
    timing(V, api) {
      const tP = step(api, 'play', 0.3), tW = step(api, 'winner', api.dur * 0.42);
      const tS = tP + 0.7;                                          // rounds start
      const tE = Math.max(tS + 3.2, Math.min(tS + 14, tW + 0.5));   // round 200 reached
      return { tP, tW, tS, tE, tH: tE + 0.25, tR1: tE + 0.7, tR2: tE + 1.4, tNote: tE + 2.3 };
    },
    sim(V) {
      const keys = V.strategies || ['alld', 'allc', 'grudger', 'tft', 'random', 'stft'];
      const pairs = V.pairs || [['tft', 'alld'], ['tft', 'grudger'], ['alld', 'allc']];
      return tournament(keys, V.rounds || 200, V.seed == null ? 7 : V.seed, pairs);
    },
    draw(ctx, V, lt, api) {
      const tm = this.timing(V, api), S = this.sim(V), R = S.R, n = S.n;
      const nameOf = k => (V.names && V.names[k]) || STRATS[k].name;
      // round as a function of time: slow at first (you can see who grabs the lead), then faster, settling at the end
      const roundAt = t => R * ease.inOut(prog(t, tm.tS, tm.tE));
      const r = roundAt(lt), ri = Math.floor(r), rf = r - ri;
      const score = i => ri >= R ? S.cum[i][R] : lerp(S.cum[i][ri], S.cum[i][ri + 1], rf);
      const winA = fin(lt, tm.tH, 0.7);

      // ---------------- round counter (top left)
      const cA = fin(lt, tm.tP, 0.6);
      A(ctx, cA, () => {
        const y = 318 + rise(cA, 10);
        text(V.roundLabel || '轮次', 160, 196, { size: 28, color: P.dim });
        const big = { size: 112, family: F.mono, weight: 700 }, wBig = measure(String(R), big);
        const shown = Math.min(R, Math.ceil(r - 1e-6));
        text(String(shown), 160 + wBig, y, { ...big, color: P.ink, align: 'right' });
        text('/ ' + R, 160 + wBig + 22, y, { size: 44, family: F.mono, color: P.dim });
        // thin progress line under the counter
        ctx.fillStyle = 'rgba(233,228,216,0.12)'; ctx.fillRect(160, y + 30, 700, 3);
        ctx.fillStyle = P.ember; ctx.globalAlpha *= 0.85; ctx.fillRect(160, y + 30, 700 * r / R, 3);
      });

      // ---------------- sample matches (left) — fade out when the rules come in
      const pA = fin(lt, tm.tP + 0.2, 0.7) * (1 - ease.inOut(prog(lt, tm.tH, tm.tH + 0.7)));
      if (pA > 0) A(ctx, pA, () => {
        const x0 = 160, x1 = 860, cw = (x1 - x0) / R;
        text(V.pairsLabel || '其中几场对局', x0, 408, { size: 26, color: P.dim });
        S.pairs.forEach((p, k) => {
          const y = 470 + k * 118;
          runs([[nameOf(p.x), P.gold, { weight: 700 }], ['  对  ', P.dim, { size: 26 }], [nameOf(p.y), P.teal, { weight: 700 }]], x0, y, { size: 32 });
          const sc = t => (ri >= R ? t[R] : t[ri]);
          const w2 = measure(`${sc(p.m.sb)}`, { size: 32, family: F.mono, weight: 700 });
          text(`${sc(p.m.sb)}`, x1, y, { size: 32, family: F.mono, weight: 700, color: P.teal, align: 'right' });
          text(':', x1 - w2 - 16, y, { size: 32, family: F.mono, color: P.dim, align: 'center' });
          text(`${sc(p.m.sa)}`, x1 - w2 - 32, y, { size: 32, family: F.mono, weight: 700, color: P.gold, align: 'right' });
          const strip = (list, yy) => {
            ctx.fillStyle = 'rgba(233,228,216,0.06)'; ctx.fillRect(x0, yy, x1 - x0, 16);
            for (const [s0, s1, d] of list) {
              if (s0 >= r) break;
              const e = Math.min(s1, r);
              ctx.fillStyle = d ? P.red : P.ok;
              ctx.fillRect(x0 + s0 * cw, yy, (e - s0) * cw + 0.3, 16);
            }
          };
          strip(p.runsA, y + 18);
          strip(p.runsB, y + 40);
          // the front of the sweep glows softly while rounds are being played
          const live = r > 0 && r < R ? 1 : 0;
          if (live) K.dot(x0 + r * cw, y + 37, 5, P.ink, { glow: 14, alpha: 0.8 });
        });
        // legend + payoffs
        const ly = 818;
        ctx.fillStyle = P.ok; ctx.beginPath(); ctx.roundRect(x0, ly - 18, 20, 20, 4); ctx.fill();
        text(V.cLabel || '合作', x0 + 30, ly, { size: 26, color: P.ink });
        ctx.fillStyle = P.red; ctx.beginPath(); ctx.roundRect(x0 + 110, ly - 18, 20, 20, 4); ctx.fill();
        text(V.dLabel || '背叛', x0 + 140, ly, { size: 26, color: P.ink });
        text(V.payoff || '都合作各得 3 · 背叛者 5、被骗 0 · 都背叛各 1', x0 + 236, ly, { size: 24, color: P.dim });
      });

      // ---------------- the rules of the winner (left, after the result)
      const wKey = S.keys[S.winner];
      const r1 = fin(lt, tm.tR1, 0.7), r2 = fin(lt, tm.tR2, 0.7), nA = fin(lt, tm.tNote, 0.8);
      A(ctx, r1, () => runs([['①', P.ember, { family: F.mono, weight: 700 }], ['  ' + (V.rule1 || '第一次合作'), P.ink]], 160, 480 + rise(r1, 12), { size: 54, weight: 500 }));
      A(ctx, r2, () => runs([['②', P.ember, { family: F.mono, weight: 700 }], ['  ' + (V.rule2 || '之后照抄对方'), P.ink]], 160, 590 + rise(r2, 12), { size: 54, weight: 500 }));
      if (V.note !== '' && wKey === 'tft') A(ctx, nA, () => {
        text(V.note || '单场从没赢过谁，总分却是第一', 160, 720 + rise(nA, 10), { size: 34, color: P.dim });
      });

      // ---------------- leaderboard (right)
      const bx = 960, bw = 820, rowH = 92, by = 236;
      const lA = fin(lt, tm.tP, 0.7);
      A(ctx, lA, () => {
        text(V.boardLabel || '总分', bx + bw, 212, { size: 28, color: P.dim, align: 'right' });
        // the board re-sorts at a calm, fixed cadence: every Q seconds it glides (over D seconds) to the
        // (hysteresis) ranking it will have when the glide ends — so it is never visibly out of order.
        // A pure function of time.
        const Q = V.resort || 0.5, D = 0.42;
        const rankAtT = t => S.rankAt[Math.min(R, Math.max(0, Math.floor(roundAt(t))))];
        const kq = Math.floor((lt - tm.tS) / Q), sq = tm.tS + kq * Q;
        const endK = Math.ceil((tm.tE - tm.tS) / Q);
        let pos;
        if (lt < tm.tS) pos = rankAtT(lt).slice();
        else {
          const cur = kq >= endK ? S.rankAt[R] : rankAtT(sq + D), prev = kq >= endK + 1 ? S.rankAt[R] : rankAtT(sq - Q + D);
          const f = ease.inOut(prog(lt, sq, sq + D));
          pos = cur.map((c, i) => lerp(prev[i], c, f));
        }
        // static rank numbers
        for (let q = 0; q < n; q++) {
          const y = by + q * rowH + rowH / 2;
          const isTop = q === 0;
          text(String(q + 1), bx + 26, y + 1, { size: 34, family: F.mono, weight: 700, color: isTop && winA > 0 ? P.ok : P.dim, align: 'center', baseline: 'middle', alpha: isTop ? 1 : lerp(1, 0.6, winA) });
        }
        // rows, drawn back to front so the winner sits on top while moving
        const idx = S.keys.map((_, i) => i).sort((a, b) => pos[b] - pos[a]);
        for (const i of idx) {
          const y = by + pos[i] * rowH;
          const isW = i === S.winner;
          const dimO = isW ? 1 : lerp(1, 0.5, winA);
          A(ctx, dimO, () => {
            const x = bx + 62, w = bw - 62, h = rowH - 14, yy = y + 7;
            rr(ctx, x, yy, w, h, 14, isW && winA > 0 ? mixOk(winA) : '#121821', isW && winA > 0 ? rgba(P.ok, 0.25 + 0.6 * winA) : 'rgba(233,228,216,0.12)', isW ? 2 + winA : 1.5);
            if (isW && winA > 0) { ctx.save(); ctx.shadowColor = P.ok; ctx.shadowBlur = 30 * winA; rr(ctx, x, yy, w, h, 14, null, rgba(P.ok, 0.5 * winA), 2); ctx.restore(); }
            const cy = yy + h / 2 + 1;
            text(nameOf(S.keys[i]), x + 28, cy, { size: 40, weight: isW && winA > 0 ? 700 : 500, color: isW && winA > 0 ? P.ok : P.ink, baseline: 'middle' });
            // score bar
            const s = score(i), bx0 = x + 320, bmax = w - 320 - 150;
            ctx.fillStyle = 'rgba(233,228,216,0.07)'; ctx.fillRect(bx0, cy - 5, bmax, 10);
            const bl = bmax * s / S.max;
            ctx.fillStyle = isW && winA > 0 ? P.ok : 'rgba(233,228,216,0.42)';
            ctx.fillRect(bx0, cy - 5, bl, 10);
            if (r > 0) K.dot(bx0 + bl, cy, 6, isW && winA > 0 ? P.ok : P.ink, { glow: 12, alpha: 0.9 });
            text(String(Math.round(s)), x + w - 24, cy + 2, { size: 44, family: F.mono, weight: 700, color: isW && winA > 0 ? P.ok : P.ink, align: 'right', baseline: 'middle' });
          });
        }
        // champion tag
        A(ctx, winA, () => {
          const y = by + rowH / 2;
          const tag = V.champLabel || '冠军', tw = measure(tag, { size: 26, weight: 700 }) + 30;
          const xL = bx + 62 + 28 + measure(nameOf(wKey), { size: 40, weight: 700 }) + 18;
          rr(ctx, xL, y - 20, tw, 40, 20, rgba(P.ok, 0.16), P.ok, 2);
          text(tag, xL + tw / 2, y + 1, { size: 26, weight: 700, color: P.ok, align: 'center', baseline: 'middle' });
        });
      });
    },
    cues(V, api) {
      const t = this.timing(V, api), out = [];
      cue(out, t.tP, 'tick'); cue(out, t.tS, 'count', { dur: +(t.tE - t.tS).toFixed(2) }); cue(out, t.tE, 'tally');
      cue(out, t.tH, 'pop'); cue(out, t.tR1, 'tick'); cue(out, t.tR2, 'tick');
      return out;
    },
  });

  // ================================================================= sim_auction
  // A clock auction: the price of a licence rises by a fixed percentage each round, from the reserve to the
  // closing price; every bidder has a private valuation and leaves the moment the price passes it; the
  // auction closes when the number still bidding equals the number of licences. The incumbents and one
  // newcomer value a licence above the closing price; the other newcomers' valuations are drawn (K.rng)
  // log-uniformly between reserve and close, so the dropouts are spread across the rounds.
  function auction(nInc, nLic, nBid, rounds, start, final, seed) {
    return cached(`A|${nInc}|${nLic}|${nBid}|${rounds}|${start}|${final}|${seed}`, () => {
      const R = rounds, g = Math.pow(final / start, 1 / R);
      const total = r => start * Math.pow(g, r);                  // sum of all licence prices after r rounds
      const rnd = K.rng(seed);
      const nNew = nBid - nInc, winnersNew = Math.max(0, nLic - nInc);
      const bidders = [];
      for (let i = 0; i < nBid; i++) bidders.push({ inc: i < nInc, idx: i < nInc ? i : i - nInc });
      // the newcomer winners are the last newcomers of the first row (they sit under the extra licences)
      const row1 = Math.min(nNew, nLic), newWinIdx = [];
      for (let k = 0; k < winnersNew; k++) newWinIdx.push(row1 - 1 - k);
      const losers = bidders.filter(b => !b.inc && !newWinIdx.includes(b.idx));
      // valuations (in units of the total price): winners above the close, losers log-uniform in (start, final)
      const us = losers.map(() => 0.06 + 0.9 * rnd()).sort((a, b) => a - b);
      losers.forEach((b, k) => { b.value = start + (final - start) * us[k]; });
      for (const b of bidders) if (b.value == null) b.value = final * (1.05 + 0.3 * rnd());
      // run the clock
      for (const b of bidders) {
        b.out = Infinity;
        for (let r = 1; r <= R; r++) if (total(r) > b.value) { b.out = r; break; }
      }
      // who gets which licence: licences 1..nInc to the incumbents, the extra ones to the newcomer winners
      const owner = [];
      for (let l = 0; l < nLic; l++) owner.push(l < nInc ? bidders.findIndex(b => b.inc && b.idx === l) : bidders.findIndex(b => !b.inc && b.idx === newWinIdx[l - nInc]));
      const roundOf = v => clamp(Math.log(v / start) / Math.log(g), 0, R);   // inverse of total()
      return { R, total, roundOf, bidders, owner, start, final };
    });
  }

  T.register('sim_auction', {
    timing(V, api) {
      const tO = step(api, 'open', 0.3), tB = step(api, 'bid', api.dur * 0.5);
      const nNew = (V.bidders || 13) - (V.incumbents || 4);
      const openD = Math.max(3, tB - tO);
      const tLic = tO, tLock = tO + 1.0;
      const t5 = tO + clamp(openD * 0.3, 1.6, 3.5);                 // the extra licence
      const tN0 = t5 + 0.9;                                          // newcomers walk in, one by one
      const gap = clamp((tB - 0.2 - tN0) / Math.max(1, nNew), 0.3, 0.55), tN1 = tN0 + gap * nNew;
      const tR0 = Math.max(tB + 0.5, tN1 + 0.8);                     // the full count holds a moment first
      const tR1 = Math.max(tR0 + 2.6, Math.min(tR0 + 9, api.dur - 2.3)); // bidding rounds
      const tLand = tR1 + 0.25;
      return { tO, tB, tLic, tLock, t5, tN0, tN1, gap, tR0, tR1, tLand, tFin: tLand + 1.2 };
    },
    draw(ctx, V, lt, api) {
      const tm = this.timing(V, api);
      const nInc = V.incumbents || 4, nLic = V.licenses || 5, nBid = V.bidders || 13, nNew = nBid - nInc;
      const fm = /^(\D*?)\s*([\d.]+)\s*(.*)$/.exec(V.final || '约 225 亿英镑') || ['', '约', '225', '亿英镑'];
      const fPre = fm[1], fNum = +fm[2], fUnit = fm[3] || '';
      const S = auction(nInc, nLic, nBid, V.rounds || 150, V.start || 5, fNum, V.seed == null ? 11 : V.seed);
      const R = S.R;
      // time → round: the total rolls up smoothly in time (the clock itself rises a fixed % per round)
      const valAt = t => lerp(S.start, S.final, ease.sine(prog(t, tm.tR0, tm.tR1)));
      const roundAt = t => S.roundOf(valAt(t));
      const r = roundAt(lt);
      const inName = V.incName || '老', newName = V.newName || '新';

      // ---------------- geometry (left arena)
      const acx = 570, sp = Math.min(165, 800 / Math.max(1, nLic - 1));
      const slotX = l => acx + (l - (nLic - 1) / 2) * sp;
      const licY = 250, incY = 440, rowY = [640, 760], TR = 34;
      const row1 = Math.min(nNew, nLic), row2 = nNew - row1;
      const newPos = k => k < row1 ? { x: slotX(k), y: rowY[0] } : { x: acx + (k - row1 - (row2 - 1) / 2) * sp, y: rowY[1] };
      const posOf = b => b.inc ? { x: slotX(b.idx), y: incY } : newPos(b.idx);
      const tEnter = b => b.inc ? tm.tLic + 0.25 + 0.15 * b.idx : tm.tN0 + tm.gap * b.idx;
      // dropout time of each bidder (time when the price clock passes its valuation)
      const tOut = b => {
        if (!isFinite(b.out)) return Infinity;
        const u = (S.total(b.out) - S.start) / (S.final - S.start), k = Math.acos(1 - 2 * clamp(u)) / Math.PI;   // invert valAt
        return tm.tR0 + (tm.tR1 - tm.tR0) * k;
      };
      const active = S.bidders.filter(b => lt >= tEnter(b) && lt < tOut(b)).length;
      const bidding = lt >= tm.tR0;

      // ---------------- lock lines (4 incumbents, 4 licences: nobody needs to push the price)
      const lockA = fio(lt, tm.tLock, tm.tR0 + 0.2, 0.6);
      A(ctx, lockA, () => {
        for (let l = 0; l < nInc; l++) {
          const x = slotX(l);
          ctx.strokeStyle = rgba(P.teal, 0.55); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x, licY + 48); ctx.lineTo(x, incY - TR - 8); ctx.stroke();
          lock(ctx, x, (licY + 48 + incY - TR - 8) / 2, P.teal);
        }
        const lA = fio(lt, tm.tLock + 0.5, tm.tN0 + 0.2, 0.6);
        A(ctx, lA, () => text(V.lockLabel || '一家一张，谁也不用抢', slotX(0) - 64, incY + 92, { size: 30, color: P.dim }));
      });

      // ---------------- bid particles: each active bidder sends a slow glint toward a licence
      if (bidding && lt < tm.tLand + 0.4) {
        const pa = fin(lt, tm.tR0, 0.5) * (1 - prog(lt, tm.tR1 - 0.2, tm.tLand + 0.3));
        S.bidders.forEach((b, i) => {
          const to = tOut(b); if (lt >= to + 0.6) return;
          const p0 = posOf(b), l = (i * 3 + 1) % nLic, trip = 1.9;
          const ph0 = ((lt - tm.tR0) / trip + (i * 0.37) % 1) % 1;
          const lx = slotX(l), ly = licY + 44;
          const x = lerp(p0.x, lx, ease.inOut(ph0)), y = lerp(p0.y - TR, ly, ease.inOut(ph0));
          const a = pa * Math.sin(Math.PI * ph0) * (lt < to ? 1 : 1 - prog(lt, to, to + 0.6));
          K.dot(x, y, 4, P.gold, { glow: 12, alpha: 0.75 * a });
        });
      }

      // ---------------- licences
      const lic = l => {
        const isNew = l >= nInc;
        const tIn = isNew ? tm.t5 : tm.tLic + 0.12 * l;
        const a = fin(lt, tIn, 0.8); if (a <= 0) return;
        const own = S.owner[l], ob = S.bidders[own];
        const tl = tm.tLand + 0.18 * l, k = ease.inOut(prog(lt, tl, tl + 1.1));
        const p0 = { x: slotX(l), y: licY }, op = posOf(ob), p1 = { x: op.x, y: op.y - TR - 50 };
        const x = lerp(p0.x, p1.x, k), y = lerp(p0.y, p1.y, k) + rise(a, 14), s = lerp(1, 0.72, k);
        const w = 128 * s, h = 88 * s;
        const oc = ob.inc ? P.teal : P.blue;
        A(ctx, a, () => {
          if (isNew) {                                          // the extra licence glows
            const gl = 0.6 + 0.4 * Math.sin(lt * 1.6);
            ctx.save(); ctx.shadowColor = P.ember; ctx.shadowBlur = (26 + 14 * gl) * (1 - 0.6 * k);
            rr(ctx, x - w / 2, y - h / 2, w, h, 14, 'rgba(40,26,16,0.95)', P.ember, 2.5); ctx.restore();
          } else rr(ctx, x - w / 2, y - h / 2, w, h, 14, 'rgba(18,24,34,0.95)', lerp(0, 1, k) > 0.5 ? rgba(oc, 0.8) : 'rgba(233,228,216,0.35)', 2);
          text('3G', x, y - 4 * s, { size: 34 * s, family: F.mono, weight: 700, color: isNew ? P.ember : P.ink, align: 'center', baseline: 'middle' });
          text(String(l + 1), x, y + 28 * s, { size: 24 * s, family: F.mono, color: P.dim, align: 'center', baseline: 'middle' });
        });
        if (isNew) A(ctx, fin(lt, tIn + 0.4, 0.7) * (1 - fin(lt, tm.tR0, 0.5)), () => text(V.newLabel || '给新来者', p0.x, licY + 92, { size: 30, weight: 700, color: P.ember, align: 'center' }));
      };
      A(ctx, 1, () => { for (let l = 0; l < nLic; l++) lic(l); });

      // ---------------- bidders
      S.bidders.forEach((b, i) => {
        const te = tEnter(b), a = fin(lt, te, 0.8); if (a <= 0) return;
        const p = posOf(b), x = p.x - (b.inc ? 0 : 70 * (1 - ease.out(prog(lt, te, te + 0.9)))), y = p.y + (b.inc ? rise(a, 14) : 0);
        const col = b.inc ? P.teal : P.blue;
        const to = tOut(b), gone = isFinite(to) ? ease.inOut(prog(lt, to, to + 0.7)) : 0;
        const own = S.owner.indexOf(i), won = own >= 0 ? fin(lt, tm.tLand + 0.18 * own + 1.0, 0.6) : 0;
        A(ctx, a, () => {
          const c = gone > 0 ? lerpColor(col, '#4a505b', gone) : col;
          ctx.save();
          if (bidding && gone < 1) { ctx.shadowColor = c; ctx.shadowBlur = 18 * (1 - gone); }
          if (won > 0) { ctx.shadowColor = col; ctx.shadowBlur = 26 * won; }
          ctx.beginPath(); ctx.arc(x, y, TR * (1 - 0.12 * gone), 0, TAU);
          ctx.fillStyle = rgba(c.startsWith('#') ? c : '#4a505b', 0.16 * (1 - 0.6 * gone)); ctx.fill();
          ctx.lineWidth = 2.5; ctx.strokeStyle = c; ctx.stroke();
          ctx.restore();
          text((b.inc ? inName : newName) + (b.idx + 1), x, y + 1, { size: 24, weight: 700, color: gone > 0.5 ? P.faint : col, align: 'center', baseline: 'middle' });
          if (won > 0) K.ring(x, y, TR + 8, P.ok, { lineWidth: 2.5, alpha: 0.85 * won });
        });
      });

      // ---------------- right panel: bidders counter → amount counter
      const RX = 1110;
      const cntA = fin(lt, tm.tO + 0.2, 0.7) * (1 - ease.inOut(prog(lt, tm.tR0 - 0.1, tm.tR0 + 0.4)));
      A(ctx, cntA, () => {
        const nNow = nInc + S.bidders.filter(b => !b.inc && lt >= tEnter(b) + 0.3).length;
        text(V.countLabel || '竞标者', RX, 232, { size: 32, color: P.dim });
        const big = { size: 170, family: F.mono, weight: 700 };
        const lastIn = S.bidders.filter(b => !b.inc && lt >= tEnter(b) + 0.3).reduce((m, b) => Math.max(m, tEnter(b) + 0.3), -9);
        const pop = 1 - ease.out(prog(lt, lastIn, lastIn + 0.5));
        const col = nNow > nInc ? P.ink : P.teal;
        ctx.save(); ctx.translate(RX, 400); ctx.scale(1 + 0.04 * pop, 1 + 0.04 * pop);
        text(String(nNow), 0, 0, { ...big, color: col, glow: nNow > nInc ? 16 * pop : 0, glowColor: P.blue });
        ctx.restore();
        const w = measure(String(nNow), big);
        text(V.countUnit || '家', RX + w + 20, 400, { size: 48, weight: 500, color: P.dim });
        // composition line
        const nn = Math.max(0, nNow - nInc);
        runs([[`${inName}运营商 ${Math.min(nNow, nInc)}`, P.teal], ['  +  ', P.dim], [`新来者 ${nn}`, P.blue]], RX, 462, { size: 32, weight: 500 });
      });
      const amtA = fin(lt, tm.tR0 + 0.3, 0.6);
      A(ctx, amtA, () => {
        text(V.amountLabel || '五张牌照总价', RX, 232 + rise(amtA, 8), { size: 32, color: P.dim });
        const v = valAt(lt), done = fin(lt, tm.tR1, 0.6);
        const big = { size: 150, family: F.mono, weight: 700 };
        const preW = fPre ? measure(fPre, { size: 64, weight: 500 }) + 18 : 0;
        if (fPre) text(fPre, RX, 398, { size: 64, weight: 500, color: P.gold, alpha: done });
        const num = lt >= tm.tR1 ? String(fNum) : String(Math.round(v));
        const x0 = RX + preW;                                      // room for the prefix is kept from the start
        text(num, x0, 400 + rise(amtA, 8), { ...big, color: P.gold, glow: 10 + 22 * done * (1 - prog(lt, tm.tR1 + 0.6, tm.tR1 + 2.5)) });
        text(fUnit, x0 + measure(num, big) + 18, 398, { size: 50, weight: 500, color: P.gold });
      });

      // ---------------- right panel: price chart
      const cx0 = RX, cx1 = 1760, cy0 = 590, cy1 = 806;
      const chA = fin(lt, tm.tO + 0.6, 0.8);
      A(ctx, chA, () => {
        const ymax = fNum * 1.1, yOf = v => cy1 - (cy1 - cy0) * v / ymax, xOf = rr_ => cx0 + (cx1 - cx0) * rr_ / R;
        text(V.chartLabel || '价格（亿英镑）', cx0, 540, { size: 26, color: P.dim });
        // bidders still in
        A(ctx, fin(lt, tm.tR0 + 0.2, 0.6), () => {
          const done = lt >= tm.tR1;
          runs(done ? [[`${nLic} 家`, P.ok, { family: F.sans, weight: 700 }], [' 拿到牌照', P.ink]] : [['仍在竞价 ', P.dim], [String(active), P.ink, { family: F.mono, weight: 700, size: 34 }], [' 家', P.dim]], cx1, 540, { size: 28, align: 'right' });
        });
        ctx.fillStyle = 'rgba(233,228,216,0.25)'; ctx.fillRect(cx0, cy1, cx1 - cx0, 2);
        text(V.r0Label || '第 1 轮', cx0, cy1 + 38, { size: 24, color: P.dim });
        text(V.rNLabel || `第 ${R} 轮`, cx1, cy1 + 38, { size: 24, color: P.dim, align: 'right' });
        // the locked market: flat, near the reserve
        const fl = fin(lt, tm.tLock + 0.3, 0.8);
        A(ctx, fl * lerp(1, 0.55, fin(lt, tm.tR0, 0.6)), () => {
          ctx.strokeStyle = P.teal; ctx.lineWidth = 3; ctx.setLineDash([10, 9]);
          const xe = lerp(cx0, cx1, ease.inOut(prog(lt, tm.tLock + 0.3, tm.tLock + 1.6)));
          ctx.beginPath(); ctx.moveTo(cx0, yOf(S.start) - 3); ctx.lineTo(xe, yOf(S.start) - 3); ctx.stroke(); ctx.setLineDash([]);
          A(ctx, fio(lt, tm.tLock + 1.0, tm.tR0 + 0.6, 0.5), () => text(V.flatLabel || '只有老运营商：价格平平', cx0 + 12, yOf(S.start) - 22, { size: 28, color: P.teal }));
        });
        // the rising price
        if (lt >= tm.tR0) {
          const N = 90, pts = [];
          for (let k = 0; k <= N; k++) { const q = r * k / N; pts.push([xOf(q), yOf(S.total(q))]); }
          const g = ctx.createLinearGradient(0, cy0, 0, cy1);
          g.addColorStop(0, 'rgba(216,178,92,0.22)'); g.addColorStop(1, 'rgba(216,178,92,0)');
          ctx.beginPath(); ctx.moveTo(cx0, cy1); for (const [x, y] of pts) ctx.lineTo(x, y); ctx.lineTo(pts[N][0], cy1); ctx.closePath();
          ctx.fillStyle = g; ctx.fill();
          ctx.save(); ctx.shadowColor = P.gold; ctx.shadowBlur = 12;
          ctx.strokeStyle = P.gold; ctx.lineWidth = 4; ctx.lineJoin = 'round';
          ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.restore();
          const [hx, hy] = pts[N];
          K.dot(hx, hy, 8, P.gold, { glow: 22 });
          // dropout ticks on the curve
          for (const b of S.bidders) {
            if (!isFinite(b.out) || b.out > r) continue;
            const x = xOf(b.out), y = yOf(S.total(b.out));
            K.ring(x, y, 6, P.dim, { lineWidth: 2, alpha: 0.9 });
          }
        }
      });
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

  // opaque row fill tinted towards ok (rows must occlude each other while they glide)
  const mixOk = k => `rgb(${Math.round(lerp(18, 28, k))},${Math.round(lerp(24, 42, k))},${Math.round(lerp(33, 34, k))})`;
  function lerpColor(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = s => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, k));
    return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  }
  // small padlock
  function lock(ctx, x, y, color) {
    ctx.save();
    ctx.fillStyle = DARK; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y - 8, 8, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(x - 12, y - 8, 24, 19, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y + 1, 2.8, 0, TAU); ctx.fill();
    ctx.restore();
  }
})();
