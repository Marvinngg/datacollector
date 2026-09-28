/* Script-driven film runtime.
 * build/timeline.json (from pipeline/gen_vo.py) lists chapters and beats; every beat names a visual template.
 * Templates register with T.register(type, {draw(ctx, V, lt, api), cues(V, api)}) and draw one full-screen visual.
 * The runtime handles: beat cross-fades, continuous visuals across "ref" chains, chapter cards, the chapter
 * progress bar, subtitles, background and film post. renderFrame(t) is a pure function of t. */
(function () {
  const { W, H, ctx, P, F, clamp, lerp, prog, ease, text, measure, rng, fbm } = K;
  const T = { templates: {}, register(type, def) { this.templates[type] = def; } };
  const LAYOUT = { top: 150, bottom: 880, left: 140, right: W - 140, cx: W / 2, cy: 515 }; // content safe area
  const FADE = 0.45;
  let TL = null, CHAINS = {};

  // ---------- step helpers handed to templates ----------
  // A chain = consecutive beats sharing one visual (beat B has visual.ref = A). Steps of the whole chain are
  // visible to every beat in it, so later beats see earlier steps as already completed (negative local times).
  function makeApi(beat) {
    const chain = CHAINS[beat.visual.ref || beat.id];
    const t0 = beat.start;
    const steps = chain.steps.map(s => ({ ...s, lt: s.t - t0 }));
    const api = {
      beat, dur: beat.end - beat.start, layout: LAYOUT, steps,
      chainStart: chain.start - t0,                 // local time the chain's first beat began (<= 0)
      chainEnd: chain.end - t0,
      line(k) { const l = beat.lines[k]; return l ? { start: l.start - t0, end: l.start + l.dur - t0, dur: l.dur } : null; },
      // progress 0..1 of step i over `d` seconds (0 before it fires)
      stepP(i, lt, d = 0.6, e = ease.out) { const s = steps[i]; return s ? e(prog(lt, s.lt, s.lt + d)) : 0; },
      find(pred) { return steps.findIndex(pred); },
      // all steps matching pred with their progress
      active(lt, pred, d = 0.6) { return steps.map((s, i) => ({ s, i, p: api.stepP(i, lt, d) })).filter(x => pred(x.s) && x.p > 0); },
    };
    return api;
  }

  // ---------- background ----------
  let bgTex = null;
  function background(t) {
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    if (!bgTex) {  // soft dotted grid, cached
      bgTex = document.createElement('canvas'); bgTex.width = W; bgTex.height = H;
      const g = bgTex.getContext('2d');
      for (let y = 30; y < H; y += 48) for (let x = 30; x < W; x += 48) {
        const a = 0.05 + 0.05 * fbm(x / 400, y / 400, 3);
        g.fillStyle = `rgba(233,228,216,${a})`; g.beginPath(); g.arc(x, y, 1.2, 0, Math.PI * 2); g.fill();
      }
    }
    ctx.drawImage(bgTex, 0, 0);
    // slow drifting light
    const x = W * (0.5 + 0.18 * Math.sin(t * 0.05)), y = H * (0.45 + 0.1 * Math.cos(t * 0.04));
    const g = ctx.createRadialGradient(x, y, 0, x, y, H * 0.9);
    g.addColorStop(0, 'rgba(60,78,105,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ---------- chapter progress bar (top) ----------
  function progressBar(t) {
    const chs = TL.chapters.filter(c => c.num && c.num !== '00');
    const x0 = 140, x1 = W - 140, y = 70, gap = 10;
    const cur = TL.chapters.find(c => t >= c.start && t < c.end);
    const a = cur && cur.num !== '00' ? clamp((t - cur.start) / 0.8) : 0;
    if (a <= 0) return;
    const total = chs.reduce((s, c) => s + (c.end - c.start), 0);
    let x = x0; const span = x1 - x0 - gap * (chs.length - 1);
    ctx.save(); ctx.globalAlpha = a;
    for (const c of chs) {
      const w = span * (c.end - c.start) / total, isCur = c === cur, done = t >= c.end;
      ctx.fillStyle = 'rgba(233,228,216,0.12)'; ctx.fillRect(x, y, w, 3);
      const f = done ? 1 : isCur ? clamp((t - c.start) / (c.end - c.start)) : 0;
      ctx.fillStyle = isCur ? P.ink : 'rgba(233,228,216,0.45)'; ctx.fillRect(x, y, w * f, 3);
      if (isCur) {
        text(`${c.num}  ${c.title}`, x, y - 16, { size: 22, family: F.sans, weight: 500, color: P.ink, alpha: 0.9 });
        if (c.part) text(c.part, x1, y - 16, { size: 20, family: F.sans, weight: 500, color: P.dim, align: 'right', spacing: 6 });
      }
      x += w + gap;
    }
    ctx.restore();
  }

  // ---------- chapter card ----------
  function chapterCard(c, t) {
    const [a, b] = c.card, lt = t - a, d = b - a;
    const al = Math.min(ease.out(prog(lt, 0, 0.5)), 1 - ease.in(prog(lt, d - 0.5, d)));
    ctx.save(); ctx.globalAlpha = al;
    const rise = (1 - ease.out(prog(lt, 0, 0.9))) * 24;
    text(c.num, W / 2, 440 + rise, { size: 30, family: F.mono, color: P.dim, align: 'center', spacing: 8 });
    const lw = 60 + 360 * ease.inOut(prog(lt, 0.15, 1.1));
    ctx.fillStyle = 'rgba(233,228,216,0.35)'; ctx.fillRect(W / 2 - lw / 2, 470 + rise, lw, 1.5);
    text(c.title, W / 2, 560 + rise, { size: 76, family: F.serif, weight: 600, color: P.ink, align: 'center', spacing: 4 });
    if (c.part) text(c.part, W / 2, 630 + rise, { size: 26, family: F.sans, weight: 500, color: P.gold, align: 'center', spacing: 10, alpha: 0.85 });
    ctx.restore();
  }

  // ---------- subtitles ----------
  function subtitles(t) {
    const ls = TL.lines;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], next = ls[i + 1];
      const nextIn = next ? next.start - 0.12 : Infinity;
      const end = Math.min(l.start + l.dur + 0.3, nextIn);
      const a = Math.min(ease.out(prog(t, l.start - 0.1, l.start + 0.15)), 1 - ease.in(prog(t, end - 0.12, end)));
      if (a <= 0) continue;
      const str = l.text.replace(/[。]$/, '');
      ctx.save(); ctx.globalAlpha = a;
      // wrap long lines into two rows at a punctuation mark near the middle
      let rows = [str];
      if (measure(str, { size: 40, family: F.hand, spacing: 1 }) > 1500) {
        const mid = str.length / 2; let cut = -1, best = 1e9;
        for (let k = 0; k < str.length; k++) if ('，；：、。？'.includes(str[k]) && Math.abs(k - mid) < best) { best = Math.abs(k - mid); cut = k + 1; }
        if (cut < 0) cut = Math.round(mid);
        rows = [str.slice(0, cut), str.slice(cut)];
      }
      const g = ctx.createLinearGradient(0, H - 190, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = g; ctx.fillRect(0, H - 190, W, 190);
      rows.forEach((r, k) => text(r, W / 2, H - 70 - (rows.length - 1 - k) * 54, { size: 40, family: F.hand, color: P.ink, align: 'center', spacing: 1 }));
      ctx.restore();
    }
  }

  // ---------- post: vignette + grain ----------
  let grain = null;
  function post(t) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (!grain) {
      grain = document.createElement('canvas'); grain.width = grain.height = 256;
      const g = grain.getContext('2d'), img = g.createImageData(256, 256), r = rng(7);
      for (let i = 0; i < img.data.length; i += 4) { const n = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = n; img.data[i + 3] = 12; }
      g.putImageData(img, 0, 0);
    }
    const f = Math.floor(t * 30), rr = rng(f * 13 + 1), ox = -Math.floor(rr() * 256), oy = -Math.floor(rr() * 256);
    ctx.save(); ctx.globalCompositeOperation = 'overlay';
    for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx.drawImage(grain, x, y);
    ctx.restore();
  }

  function missing(type) {
    text(`[template “${type}” not written yet]`, W / 2, H / 2, { size: 32, family: F.mono, color: P.dim, align: 'center' });
  }

  // draw one beat with its cross-fade envelope
  function drawBeat(beat, t) {
    const lt = t - beat.start, api = makeApi(beat), V = beat.visual;
    const chain = CHAINS[V.ref || beat.id];
    // fade only at the chain's outer edges; inside a chain the visual continues without a flash
    const fin = beat.start <= chain.start + 1e-6 ? ease.out(prog(t, beat.start, beat.start + FADE)) : 1;
    const fout = beat.end >= chain.end - 1e-6 ? 1 - ease.in(prog(t, beat.end - FADE, beat.end)) : 1;
    const a = Math.min(fin, fout); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    const def = T.templates[V.type];
    try { def ? def.draw(ctx, V, lt, api) : missing(V.type); }
    catch (e) { console.error(beat.id, e); text(`[${beat.id} ${V.type}] ${e.message}`, 60, 200, { size: 24, color: '#f55', family: F.mono }); }
    ctx.restore();
  }

  function renderFrame(t) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    background(t);
    for (const c of TL.chapters) if (c.card && t >= c.card[0] && t < c.card[1]) chapterCard(c, t);
    for (const b of TL.beats) if (t >= b.start && t < b.end) drawBeat(b, t);
    progressBar(t);
    subtitles(t);
    post(t);
    ctx.restore();
  }

  function allCues() {
    const out = [];
    for (const b of TL.beats) {
      const def = T.templates[b.visual.type];
      const api = makeApi(b);
      // chain members share steps: only the beat that owns a step emits its cue
      if (def && def.cues) for (const c of def.cues(b.visual, api)) if (c.t >= 0 && c.t < api.dur) out.push({ ...c, t: +(b.start + c.t).toFixed(3), beat: b.id });
    }
    for (const c of TL.chapters) if (c.card) out.push({ t: c.card[0], type: 'chapter', chapter: c.id });
    for (const b of TL.beats) { const ch = CHAINS[b.visual.ref || b.id]; if (b.start <= ch.start + 1e-6) out.push({ t: b.start, type: 'beat', beat: b.id }); }
    return out.sort((a, b) => a.t - b.t);
  }

  T.ready = (async () => {
    TL = await (await fetch('/build/timeline.json', { cache: 'no-store' })).json();
    for (const b of TL.beats) {
      const key = b.visual.ref || b.id;
      const ch = CHAINS[key] || (CHAINS[key] = { start: b.start, end: b.end, steps: [] });
      ch.end = Math.max(ch.end, b.end);
      for (const s of b.visual.steps || []) ch.steps.push({ ...s, owner: b.id });
    }
    for (const ch of Object.values(CHAINS)) ch.steps.sort((a, b) => a.t - b.t);
    T.TL = TL;
  })();
  window.T = T; window.E = { ready: T.ready };
  window.renderFrame = renderFrame; window.allCues = allCues;
})();
