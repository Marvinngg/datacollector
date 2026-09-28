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
    // (api.silent is set from the timeline mode once it has loaded)
    const chain = CHAINS[beat.visual.ref || beat.id];
    const t0 = beat.start;
    const steps = chain.steps.map(s => ({ ...s, lt: s.t - t0 }));
    const api = {
      beat, dur: beat.end - beat.start, layout: LAYOUT, steps, phases: beat.visual.phases || null, silent: TL.mode === 'silent',
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
        const label = `${c.num}  ${c.title}`, lw = measure(label, { size: 22, family: F.sans, weight: 500 });
        const pw = c.part ? measure(c.part, { size: 20, family: F.sans, weight: 500, spacing: 6 }) + 48 : 0;
        const lx = Math.min(x, x1 - pw - lw);            // keep the chapter name clear of the part label
        text(label, lx, y - 16, { size: 22, family: F.sans, weight: 500, color: P.ink, alpha: 0.9 });
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

  // ---------- captions (silent mode): the sentence under a visual is the content, not a subtitle ----------
  // One sentence at a time, revealed softly character by character, held until the next one.
  function captions(t) {
    for (const b of TL.beats) {
      if (!b.visual._caption || t < b.start || t >= b.end) continue;
      const beatA = Math.min(b._joinPrev ? 1 : ease.out(prog(t, b.start, b.start + FADE)), b._joinNext ? 1 : 1 - ease.in(prog(t, b.end - FADE, b.end)));
      b.lines.forEach((l, i) => {
        const next = b.lines[i + 1];
        const end = next ? next.start : b.end;
        if (t < l.start || t >= end + 0.4) return;
        const out = next ? 1 - ease.in(prog(t, end - 0.35, end)) : 1;
        const str = l.text.replace(/[。]$/, '');
        const size = 42, o = { size, family: F.sans, weight: 400, spacing: 2 };
        // wrap at a punctuation mark near the middle if too wide
        let rows = [str];
        if (measure(str, o) > 1560) {
          const mid = str.length / 2; let cut = -1, best = 1e9;
          for (let k = 0; k < str.length; k++) if ('，；：、。？'.includes(str[k]) && Math.abs(k - mid) < best) { best = Math.abs(k - mid); cut = k + 1; }
          if (cut < 0) cut = Math.round(mid);
          rows = [str.slice(0, cut), str.slice(cut)];
        }
        const chars = [...rows.join('')].length, reveal = Math.min(1.4, 0.35 + chars * 0.035);
        let shown = 0;
        rows.forEach((r, k) => {
          const y = H - 110 - (rows.length - 1 - k) * 60, w = measure(r, o);
          let x = W / 2 - w / 2;
          for (const ch of r) {
            const a = ease.out(prog(t, l.start + reveal * shown / chars, l.start + reveal * shown / chars + 0.5));
            text(ch, x, y, { ...o, color: P.ink, alpha: a * out * beatA });
            x += measure(ch, o); shown++;
          }
        });
      });
    }
  }

  // ---------- v3 look: episode card and captions in serif light ----------
  function chapterCard3(c, t) {
    const [a, b] = c.card, lt = t - a, d = b - a;
    const al = Math.min(ease.out(prog(lt, 0, 0.8)), 1 - ease.in(prog(lt, d - 0.7, d)));
    if (al <= 0) return;
    const acc = L.accent(TL, t);
    ctx.save();
    L.serif(c.num, W / 2, 452, { size: 30, color: 'rgba(233,228,216,0.6)', glow: 0, alpha: al, reveal: prog(lt, 0.1, 1.0), spacing: 10 });
    L.serif(c.title, W / 2, 548, { size: 92, color: '#f2ecdf', glow: 14, alpha: al, reveal: prog(lt, 0.35, 1.8), spacing: 14 });
    const lw = 280 * ease.inOut(prog(lt, 0.8, 2.0));
    ctx.globalAlpha = al * 0.7; ctx.fillStyle = acc; ctx.fillRect(W / 2 - lw / 2, 624, lw, 1.5);
    ctx.restore();
  }
  function captions3(t) {
    for (const b of TL.beats) {
      if (!b.visual._caption || t < b.start || t >= b.end) continue;
      const beatA = Math.min(b._joinPrev ? 1 : ease.out(prog(t, b.start, b.start + FADE)), b._joinNext ? 1 : 1 - ease.in(prog(t, b.end - FADE, b.end)));
      b.lines.forEach((l, i) => {
        const next = b.lines[i + 1], end = next ? next.start : b.end;
        if (t < l.start || t >= end + 0.4) return;
        const out = next ? 1 - ease.in(prog(t, end - 0.45, end)) : 1;
        const str = l.text.replace(/[。]$/, ''), size = 50;
        let rows = [str];
        if (L.measureSerif(str, size) > 1500) {
          const mid = str.length / 2; let cut = -1, best = 1e9;
          for (let k = 0; k < str.length; k++) if ('，；：、。？'.includes(str[k]) && Math.abs(k - mid) < best) { best = Math.abs(k - mid); cut = k + 1; }
          if (cut < 0) cut = Math.round(mid);
          rows = [str.slice(0, cut), str.slice(cut)];
        }
        const n = [...str].length, dur = Math.min(1.6, 0.5 + n * 0.04);
        let done = 0;
        rows.forEach((r, k) => {
          const y = H - 104 - (rows.length - 1 - k) * 66, rn = [...r].length;
          const rev = clamp((prog(t, l.start, l.start + dur) * n - done) / rn);
          L.serif(r, W / 2, y, { size, color: '#efe9dc', glow: 8, alpha: out * beatA, reveal: rev });
          done += rn;
        });
      });
    }
  }

  function missing(type) {
    text(`[template “${type}” not written yet]`, W / 2, H / 2, { size: 32, family: F.mono, color: P.dim, align: 'center' });
  }

  // draw one beat with its cross-fade envelope
  function drawBeat(beat, t) {
    const lt = t - beat.start, api = makeApi(beat), V = beat.visual;
    const chain = CHAINS[V.ref || beat.id];
    // fade only at the chain's outer edges; inside a chain the visual continues without a flash
    const fin = beat._joinPrev ? 1 : ease.out(prog(t, beat.start, beat.start + FADE));
    const fout = beat._joinNext ? 1 : 1 - ease.in(prog(t, beat.end - FADE, beat.end));
    const a = Math.min(fin, fout); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    const def = T.templates[V.type];
    try { def ? def.draw(ctx, V, lt, api) : missing(V.type); }
    catch (e) { console.error(beat.id, e); text(`[${beat.id} ${V.type}] ${e.message}`, 60, 200, { size: 24, color: '#f55', family: F.mono }); }
    ctx.restore();
  }

  function renderFrame(t) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const V3 = TL.mode === 'silent' && window.L;
    if (V3) L.background(TL, t); else background(t);
    for (const c of TL.chapters) if (c.card && t >= c.card[0] && t < c.card[1]) (V3 ? chapterCard3 : chapterCard)(c, t);
    let ending = false;
    for (const b of TL.beats) if (t >= b.start && t < b.end) { drawBeat(b, t); if (b.visual.type === 'endcard') ending = true; }
    if (!ending && !V3) progressBar(t);
    if (V3) { captions3(t); L.bloom(0.42); } else if (TL.mode === 'silent') captions(t); else subtitles(t);
    post(t);
    const fe = prog(t, TL.duration - 1.2, TL.duration - 0.2);   // the film always ends on pure black
    if (fe > 0) { ctx.globalAlpha = ease.in(fe); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
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
    for (const b of TL.beats) if (!b._joinPrev) out.push({ t: b.start, type: 'beat', beat: b.id, visual: b.visual.type });
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
    TL.beats.forEach((b, i) => {   // neighbours in time that show the same visual continue it without a fade
      const key = x => x && (x.visual.ref || x.id);
      b._joinPrev = i > 0 && key(TL.beats[i - 1]) === key(b);
      b._joinNext = i < TL.beats.length - 1 && key(TL.beats[i + 1]) === key(b);
    });
    T.TL = TL;
  })();
  window.T = T; window.E = { ready: T.ready };
  window.renderFrame = renderFrame; window.allCues = allCues;
})();
