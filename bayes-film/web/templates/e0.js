/* 序 (e0): the pitch, the gut number, the title.
 * b01 pitch  — a sales pitch in kinetic type, cut to the beat: the ask, the money, three glowing tags, the question
 * b02 gut    — the gut answer: a huge number made of ~60k particles races up to 50%, pushes to 60% ("甚至更高"), freezes
 * b03 title  — the number shatters in slow motion; the particles drift and gather, slowly, into 「先别急」 */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const { C, type, beat } = KIT;
  const TAU = Math.PI * 2;
  const at = (api, n) => KIT.at(api, n);

  // ================================================================ b01 pitch
  T.register('pitch', {
    draw(ctx, V, lt, api) {
      const L_ = V.lines, B = beat.BEAT;
      const tAsk = at(api, 'ask'), tMoney = at(api, 'money'), tT = [at(api, 'tag1'), at(api, 'tag2'), at(api, 'tag3')], tQ1 = at(api, 'q1'), tQ2 = at(api, 'q2');
      const pul = beat.pulse(lt + api.beat.start, 7);
      // everything slowly pushes in (a salesman leaning closer)
      const z = 1 + 0.06 * ease.inOut(clamp(lt / api.dur));
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
      // 1. the ask: typed fast, like a message arriving
      const askOut = prog(lt, tQ1 - 0.2, tQ1 + 0.3);
      type(L_.ask, W / 2, 560, { size: 54, family: F.sans, weight: 500, mode: 'type', k: prog(lt, tAsk + 0.1, tAsk + 1.3), t: lt, out: askOut, color: C.ink });
      // 2. the money: punches in, heavy, gold, with a shock ring
      const mk = prog(lt, tMoney, tMoney + 0.5);
      if (mk > 0) {
        const mo = prog(lt, tQ1 - 0.2, tQ1 + 0.3);
        type(L_.money, W / 2, 830, { size: 210, family: F.serif, weight: 900, mode: 'punch', k: mk, color: C.gold, out: mo });
        const rk = prog(lt, tMoney, tMoney + 0.9);
        if (rk > 0 && rk < 1) { ctx.save(); ctx.globalAlpha *= (1 - rk) * 0.6 * (1 - mo); ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(W / 2, 760, 200 + rk * 420, 80 + rk * 170, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
      }
      // 3. three tags: glowing chips that fly in from alternate sides and stack, each on its beat
      L_.tags.forEach((tag, i) => {
        const k = prog(lt, tT[i], tT[i] + 0.45); if (k <= 0) return;
        const out = prog(lt, tQ1 - 0.2, tQ1 + 0.4);
        const side = i % 2 ? 1 : -1, e = ease.outExpo(k);
        const x = W / 2 + side * (1 - e) * 700, y = 1020 + i * 120;
        const w = measure(tag, { size: 52, family: F.sans, weight: 700 }) + 70;
        ctx.save(); ctx.globalAlpha *= (1 - ease.in(out)) * clamp(k * 2);
        ctx.translate(x, y - out * 60); ctx.rotate(side * (1 - e) * 0.2);
        const glowA = 0.25 + 0.35 * Math.exp(-(lt - tT[i]) * 3);
        ctx.shadowColor = C.ember; ctx.shadowBlur = 40 * glowA;
        ctx.fillStyle = `rgba(255,154,85,${0.12 + glowA * 0.25})`; ctx.strokeStyle = C.ember; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(-w / 2, -50, w, 84, 42); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
        text(tag, 0, 8, { size: 52, family: F.sans, weight: 700, color: '#fff3e6', align: 'center' });
        ctx.restore();
      });
      ctx.restore();
      // 4. the question: everything above clears; a hush; then the question in serif
      type(L_.q1, W / 2, 860, { size: 66, family: F.serif, weight: 400, mode: 'rise', k: prog(lt, tQ1, tQ1 + 0.9), color: C.dim, out: prog(lt, api.dur - 0.25, api.dur) });
      type(L_.q2, W / 2, 980, { size: 76, family: F.serif, weight: 600, mode: 'rise', k: prog(lt, tQ2, tQ2 + 1.2), color: C.ink, out: prog(lt, api.dur - 0.25, api.dur) });
      // a faint beat-synced glint at the frame edges while the pitch is on (the salesman's rhythm)
      if (lt < tQ1) { ctx.save(); ctx.globalAlpha *= pul * 0.08; ctx.fillStyle = C.ember; ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 6, W, 6); ctx.restore(); }
    },
    cues(V, api) {
      const out = [];
      const t = n => api.steps.find(s => s.show === n).lt;
      out.push({ t: t('ask') + 0.1, type: 'type', dur: 1.2 });
      out.push({ t: t('money'), type: 'punch' });
      ['tag1', 'tag2', 'tag3'].forEach((n, i) => out.push({ t: t(n), type: 'chip', i }));
      out.push({ t: t('q1'), type: 'hush' });
      return out;
    },
  });

  // ================================================================ b02 gut
  // a giant number, each digit a cloud of particles. Rises 0 → 50 (heartbeat), holds, pushes 50 → 60 ("甚至更高"),
  // then FREEZES: particles stop dead, colour drains, a hairline crack runs through it.
  const DIG = {};
  function digitCloud(ch) {   // particles of one glyph, centred at 0,0 (cached)
    if (DIG[ch]) return DIG[ch];
    const s = PX.text(ch, { size: 440, family: F.serif, weight: 900, x: 0, y: 160, step: 2.2, seed: ch.charCodeAt(0) });
    return (DIG[ch] = s);
  }
  // number value -> list of glyph clouds with x offsets
  function numberLayout(v) {
    const str = String(Math.round(v)) + '%';
    const widths = [...str].map(c => c === '%' ? 300 : 245);
    const tw = widths.reduce((a, b) => a + b, 0);
    let x = W / 2 - tw / 2; const out = [];
    [...str].forEach((c, i) => { out.push({ ch: c, x: x + widths[i] / 2 }); x += widths[i]; });
    return out;
  }
  const gutValue = (api, lt) => {
    const tR = at(api, 'rise'), tH = at(api, 'hold'), tM = at(api, 'more'), dR = KIT.stepDur(api, 'rise'), dM = KIT.stepDur(api, 'more');
    if (lt < tH) return 50 * ease.inOut(clamp((lt - tR) / dR)) ** 0.8;
    if (lt < tM) return 50;
    return lerp(50, 60, ease.out(clamp((lt - tM) / (dM * 0.6))));
  };
  function drawNumber(v, lt, o = {}) {
    // o.freeze: 0..1 (motion stops, colour drains);  o.jitter: amplitude of the live shimmer
    const lay = numberLayout(v), fz = o.freeze || 0, heat = o.heat == null ? 1 : o.heat;
    const col = [lerp(PX.COL.ember[0], 0.85, fz), lerp(PX.COL.ember[1], 0.85, fz), lerp(PX.COL.ember[2], 0.9, fz)];
    const shimmer = (o.jitter == null ? 2.2 : o.jitter) * (1 - fz);
    for (const g of lay) {
      const s = digitCloud(g.ch), out = PX.buf(s.n, 3 + g.x | 0);
      const tq = fz > 0 ? (o.tFreeze || lt) : lt;               // frozen particles keep their last position
      for (let i = 0; i < s.n; i++) {
        const r1 = PX.rand(i, 3), r2 = PX.rand(i, 4);
        out.X[i] = g.x + s.X[i] + Math.sin(tq * (3 + r1 * 4) + r2 * 40) * shimmer * (0.5 + r1);
        out.Y[i] = H / 2 - 60 + s.Y[i] + Math.cos(tq * (2 + r2 * 4) + r1 * 40) * shimmer * (0.5 + r2);
      }
      PX.points(out.X, out.Y, s.n, col, { a: 0.42 * heat, glow: 0.55 });
    }
  }
  T.register('gut', {
    draw(ctx, V, lt, api) {
      const tR = at(api, 'rise'), tM = at(api, 'more'), tF = at(api, 'freeze');
      const frozen = lt >= tF, fz = frozen ? ease.out(prog(lt, tF, tF + 0.35)) : 0;
      const v = frozen ? gutValue(api, tF - 0.001) : gutValue(api, lt);
      // heartbeat: the number swells on each beat while rising
      const pul = frozen ? 0 : beat.pulse(lt + api.beat.start, 9);
      const sc = 1 + pul * 0.035 + (lt >= tM && !frozen ? 0.05 * ease.out(prog(lt, tM, tM + 0.6)) : 0);
      ctx.save(); ctx.translate(W / 2, H / 2 - 60); ctx.scale(sc, sc); ctx.translate(-W / 2, -(H / 2 - 60));
      PX.begin();
      drawNumber(v, lt, { freeze: fz, tFreeze: tF, jitter: 1.5 + pul * 4 });
      PX.flush({ exposure: 1.5, glow: 1.2 - fz * 0.8 });
      ctx.restore();
      // "甚至更高" pushes up from below the number
      type(V.lines.more, W / 2, 1420, { size: 70, family: F.serif, weight: 600, mode: 'punch', k: prog(lt, tM + 0.15, tM + 0.6), color: C.ember, alpha: 1 - fz * 0.7 });
      // freeze: hairline crack across the number + everything desaturates
      if (frozen) {
        const ck = ease.out(prog(lt, tF, tF + 0.25));
        ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.globalAlpha *= 0.9; ctx.shadowColor = '#fff'; ctx.shadowBlur = 12;
        const r = rng(9); ctx.beginPath(); let x = -40, y = H / 2 - 260; ctx.moveTo(x, y);
        while (x < W + 40) { x += 40 + r() * 60; y += (r() - 0.45) * 70; if (x / (W + 40) > ck) break; ctx.lineTo(x, y); }
        ctx.stroke(); ctx.restore();
        if (lt - tF < 0.12) { ctx.save(); ctx.globalAlpha *= (1 - (lt - tF) / 0.12) * 0.5; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      }
    },
    cues(V, api) {
      const t = n => api.steps.find(s => s.show === n);
      const out = [{ t: t('rise').lt, type: 'riser', dur: t('rise').dur }];
      for (let k = 0; k < t('rise').beats + 2; k++) out.push({ t: t('rise').lt + k * beat.BEAT, type: 'heartbeat', k });
      out.push({ t: t('more').lt + 0.15, type: 'punch' });
      out.push({ t: t('freeze').lt, type: 'freeze' });
      return out;
    },
  });

  // ================================================================ b03 title
  // The frozen number shatters: particles fly outward in slow motion (time almost stops), turn from ember to warm white,
  // then gather — slowly, unhurried — into 先别急. The subtitle fades in under it.
  T.register('title', {
    draw(ctx, V, lt, api) {
      const tS = at(api, 'shatter'), tFo = at(api, 'form'), tSub = at(api, 'sub'), dS = KIT.stepDur(api, 'shatter'), dF = KIT.stepDur(api, 'form');
      // sources: the frozen "60%" clouds, concatenated
      const src = shatterSource();
      const title = PX.fit(PX.text(V.lines.title, { size: 300, family: F.serif, weight: 600, x: W / 2, y: 980, step: 2.6, spacing: 30, seed: 5 }), src.n);
      const n = src.n, out = PX.buf(n, 21);
      // slow-motion explosion: distance grows like log(time): fast at first, then almost still
      const ts = clamp((lt - tS) / dS), boom = Math.log(1 + 30 * ts) / Math.log(31);
      const kf = clamp((lt - tFo) / dF);
      for (let i = 0; i < n; i++) {
        const an = PX.rand(i, 7) * TAU, sp = 40 + Math.pow(PX.rand(i, 8), 2) * 520, dz = PX.rand(i, 9);
        const ex = src.X[i] + Math.cos(an) * sp * boom, ey = src.Y[i] + Math.sin(an) * sp * boom * 1.1 + boom * boom * 60 * dz;
        // gather: each particle leaves its drift at its own time, glides home (very smooth)
        const d = PX.rand(i, 10) * 0.55, kk = ease.inOut(clamp((kf - d) / 0.45));
        const drift = Math.sin(lt * 0.6 + PX.rand(i, 11) * 30) * 6 * (1 - kk);
        out.X[i] = lerp(ex, title.X[i], kk) + drift; out.Y[i] = lerp(ey, title.Y[i], kk) + drift * 0.6;
        out.A[i] = 0.75 + 0.25 * kk;
      }
      const warm = clamp(ts * 1.5);
      const col = [lerp(1, 0.98, warm), lerp(0.6, 0.93, warm), lerp(0.33, 0.83, warm)];
      PX.begin(); PX.points(out.X, out.Y, n, col, { a: 0.42, A: out.A, glow: 0.35 }); PX.flush({ exposure: 1.5, glow: 0.8 });
      L.serif(V.lines.sub, W / 2, 1180, { size: 44, family: F.serif, weight: 400, color: C.dim, reveal: prog(lt, tSub, tSub + 2.0), glow: 0, spacing: 12 });
    },
    cues(V, api) {
      const t = n => api.steps.find(s => s.show === n).lt;
      return [{ t: t('shatter'), type: 'shatter' }, { t: t('form'), type: 'gather', dur: KIT.stepDur(api, 'form') }, { t: t('sub'), type: 'title' }];
    },
  });
  let SRC = null;
  function shatterSource() {
    if (SRC) return SRC;
    const lay = numberLayout(60), xs = [], ys = [];
    for (const g of lay) { const s = digitCloud(g.ch); for (let i = 0; i < s.n; i++) { xs.push(g.x + s.X[i]); ys.push(H / 2 - 60 + s.Y[i]); } }
    return (SRC = PX.shuffle({ X: Float32Array.from(xs), Y: Float32Array.from(ys), n: xs.length }, 3));
  }
})();
