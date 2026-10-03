/* 五 试错权 (e5): your bill, the years that never happened, the fall.
 * b15 yourbill — your own receipt prints downward, a long strip of thermal paper (fine line art): the print head is a thin
 *                bar of light at the paper's leading edge, so every line appears scanline by scanline. 钱 …… 不是,
 *                前途 …… 不是 (written in by hand). The printer hesitates; the voice says 「你付出的代价，叫」; then the head
 *                prints 「试错权」 large and slowly, dot by dot, in the scorer's red — the only red this printer ever
 *                printed — and the paper stops on it.
 * b16 never    — your life as a thin horizontal line with a tick per year. The camera glides along it: at 18, 20 and 25
 *                an empty dashed frame hangs from the tick, its never-lived event written inside only as a dashed
 *                outline (a slot that was never filled). Then the camera pulls back: three empty frames on one long,
 *                quiet line. 「你没有摔过。」 The line sits exactly where the next shot's cliff edge will be.
 * b17 fall     — 你 at the edge of a cliff drawn as a contour engraving, facing the void. 你 steps off; the camera falls
 *                with it: depth layers of streaks rush upward, ever faster, 你's particles stream; it does not end.
 *                Then, softly, a warm floor lights up just below; 你 settles onto it; light spreads in a ripple. The
 *                camera pulls back: the floor was only two body-heights under the edge all along, and it is covered
 *                in the faint imprints of everyone who fell before.
 * Every frame is a closed-form function of lt. */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng, text, measure } = K;
  const { C } = KIT;
  const TAU = Math.PI * 2;
  const at = (api, n) => KIT.at(api, n);
  const smooth = k => k * k * (3 - 2 * k);
  const ink = a => `rgba(236,231,220,${a})`;
  const warmS = a => `rgba(255,201,133,${a})`;
  const WARM = KIT.L.warm, LAMP = KIT.L.lamp, RED = KIT.L.red;
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

  const CX = new Float32Array([2, W - 3]), CY = new Float32Array([2, H - 3]);
  const fullFrame = () => PX.points(CX, CY, 2, [0, 0, 0], { a: 0.001, glow: 1 });
  let SX = new Float32Array(1 << 16), SY = new Float32Array(1 << 16), SA = new Float32Array(1 << 16);
  function scratch(n) { if (SX.length < n) { const m = 1 << Math.ceil(Math.log2(n)); SX = new Float32Array(m); SY = new Float32Array(m); SA = new Float32Array(m); } }

  // a caption that reveals at t0 and leaves before t1
  function cap(lines, lt, t0, t1, o = {}) {
    const ls = Array.isArray(lines) ? lines : [lines], n = ls.reduce((a, l) => a + [...l].length, 0);
    const k = prog(lt, t0, t0 + (o.dur || Math.min(2.6, 0.7 + n * 0.08)));
    if (k <= 0) return;
    const out = t1 == null ? 0 : prog(lt, t1 - 0.6, t1 - 0.08);
    if (out >= 1) return;
    KIT.caption(ls, k, { ...o, out });
  }
  function veil(a) { if (a <= 0) return; ctx.save(); ctx.globalAlpha *= Math.min(1, a); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  function softLight(x, y, r, rgbStr, a, sy = 1) {
    if (a <= 0.002 || r <= 1) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= Math.min(1, a);
    ctx.translate(x, y); ctx.scale(1, sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${rgbStr},1)`); g.addColorStop(0.35, `rgba(${rgbStr},0.35)`); g.addColorStop(1, `rgba(${rgbStr},0)`);
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
  }
  /** piecewise feed curve: keys [[t, v], ...]; eased between keys (a printer feeds in short bursts) */
  function keyed(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i], [t0, v0] = keys[i - 1];
      if (t <= t1) return v0 === v1 ? v0 : lerp(v0, v1, ease.inOut(prog(t, t0, t1)));
    }
    return keys[keys.length - 1][1];
  }

  // ================================================================================================ b15 yourbill
  // the receipt is laid out in paper space (x: screen-like, centred on W/2; y: 0 = top of the printing) and drawn
  // scaled by SC with paper y = 0 at screen y OY
  const PX0 = 250, PX1 = 830, PW = PX1 - PX0, SC = 1.2, OY = 272;
  const RCP = { head: 62, sub: 100, rule1: 132, row1: 220, row2: 326, rule2: 384, total: 446, word: 642, rule3: 702, tail: 770 };
  const WORD_SIZE = 150;
  const sx = x => W / 2 + (x - W / 2) * SC, sy = y => OY + y * SC;
  function billTimes(api) {
    const tP = at(api, 'print'), tW = at(api, 'word');
    return {
      tP, tW,
      feed: [[tP + 0.35, 0], [tP + 1.3, 158], [tP + 1.6, 158], [tP + 2.05, 262], [tP + 3.25, 262], [tP + 3.7, 368],
        [tP + 4.85, 368], [tP + 5.6, 488], [tW + 2.0, 488], [tW + 2.35, 520], [tW + 4.1, 712], [tW + 4.55, RCP.tail]],
      write: [tP + 2.2, tP + 3.85], wordA: tW + 2.35, wordB: tW + 4.1, stop: tW + 4.55,
    };
  }
  // dashed hairline across the paper
  function rule(y) { ctx.save(); ctx.strokeStyle = ink(0.32); ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(PX0 + 34, y); ctx.lineTo(PX1 - 34, y); ctx.stroke(); ctx.restore(); }
  function billRow(label, y) {
    text(label, PX0 + 50, y, { size: 44, family: F.serif, weight: 400, color: ink(0.86) });
    const lw = measure(label, { size: 44, family: F.serif, weight: 400 });
    ctx.save(); ctx.fillStyle = ink(0.3);
    for (let x = PX0 + 50 + lw + 24; x < PX1 - 228; x += 13) ctx.fillRect(x, y - 8, 2, 2);   // dotted leader
    ctx.strokeStyle = ink(0.34); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PX1 - 206, y + 10); ctx.lineTo(PX1 - 46, y + 10); ctx.stroke();   // the blank
    ctx.restore();
  }
  T.register('yourbill', {
    draw(ctx, V, lt, api) {
      const S = billTimes(api), Lf = keyed(S.feed, lt), head = sy(Lf);
      const printing = lt < S.stop + 0.3 && lt > S.feed[0][0] - 0.3;
      const onA = ease.out(prog(lt, 0, 0.9));
      ctx.save(); ctx.globalAlpha *= onA;
      ctx.translate(W / 2, OY); ctx.scale(SC, SC); ctx.translate(-W / 2, 0);
      // ---------- the paper: a long strip coming down from above (its upper part fades into the dark)
      const top = -300, fullAt = 40;
      const g = ctx.createLinearGradient(0, top, 0, fullAt);
      g.addColorStop(0, 'rgba(236,231,220,0)'); g.addColorStop(1, 'rgba(236,231,220,0.055)');
      ctx.fillStyle = g; ctx.fillRect(PX0, top, PW, Math.min(Lf, fullAt) - top);
      if (Lf > fullAt) { ctx.fillStyle = 'rgba(236,231,220,0.055)'; ctx.fillRect(PX0, fullAt, PW, Lf - fullAt); }
      const ge = ctx.createLinearGradient(0, top, 0, fullAt);
      ge.addColorStop(0, 'rgba(236,231,220,0)'); ge.addColorStop(1, 'rgba(236,231,220,0.26)');
      ctx.strokeStyle = ge; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PX0, top); ctx.lineTo(PX0, Math.min(Lf, fullAt)); ctx.moveTo(PX1, top); ctx.lineTo(PX1, Math.min(Lf, fullAt)); ctx.stroke();
      if (Lf > fullAt) { ctx.strokeStyle = ink(0.26); ctx.beginPath(); ctx.moveTo(PX0, fullAt); ctx.lineTo(PX0, Lf); ctx.moveTo(PX1, fullAt); ctx.lineTo(PX1, Lf); ctx.stroke(); }
      // torn edge once the paper stops
      const tk = ease.out(prog(lt, S.stop + 0.05, S.stop + 0.6));
      if (tk > 0) {
        const r = rng(15); ctx.strokeStyle = ink(0.3 * tk); ctx.beginPath();
        for (let x = PX0, i = 0; x <= PX1 + 0.1; x += PW / 29, i++) { const y = Lf + (i % 2 ? -6 : 0) + (r() - 0.5) * 2.5; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
      // ---------- printed content (clipped to what the head has passed: it appears scanline by scanline)
      ctx.save(); ctx.beginPath(); ctx.rect(PX0 - 40, -10, PW + 80, Math.max(0, Lf + 10)); ctx.clip();
      text('账　单', W / 2, RCP.head, { size: 36, family: F.sans, weight: 500, color: ink(0.86), align: 'center', spacing: 10 });
      text('付款人 · 你', W / 2, RCP.sub, { size: 21, family: F.mono, color: ink(0.4), align: 'center', spacing: 4 });
      rule(RCP.rule1);
      const rows = V.lines.rows;
      billRow(rows[0][0], RCP.row1); billRow(rows[1][0], RCP.row2);
      rule(RCP.rule2);
      text('合计', PX0 + 50, RCP.total, { size: 25, family: F.sans, weight: 400, color: ink(0.44), spacing: 6 });
      rule(RCP.rule3);
      ctx.restore();
      // the hand-written 不是 (written onto the paper after it was printed)
      [0, 1].forEach(i => {
        const wk = prog(lt, S.write[i], S.write[i] + 0.75);
        if (wk <= 0) return;
        const y = i ? RCP.row2 : RCP.row1, cx = PX1 - 126, tw = measure(rows[i][1], { size: 50, family: F.hand });
        ctx.save(); ctx.beginPath(); ctx.rect(cx - tw / 2 - 10, y - 70, (tw + 20) * ease.inOut(wk), 100); ctx.clip();
        ctx.translate(cx, y - 2); ctx.rotate(-0.045);
        text(rows[i][1], 0, 0, { size: 50, family: F.hand, color: '#efe6d4', align: 'center', alpha: 0.95 });
        ctx.restore();
      });
      ctx.restore();

      // ---------- particles: the red word (dot by dot), the print head
      PX.begin(); fullFrame();
      const word = PX.text(V.lines.word, { size: WORD_SIZE * SC, family: F.serif, weight: 600, x: W / 2, y: sy(RCP.word), step: 1.6, spacing: 14 * SC, seed: 11 });
      if (head > sy(RCP.word) - WORD_SIZE * SC) {
        const n = word.n; scratch(n); let j = 0;
        const settle = lt > S.wordB ? ease.out(prog(lt, S.wordB, S.wordB + 2.5)) : 0;
        for (let i = 0; i < n; i++) {
          const y = word.Y[i]; if (y > head) continue;
          const age = head - y;                                       // px since the head passed (fresh dots are hot)
          SX[j] = word.X[i]; SY[j] = y; SA[j] = (0.85 + 0.3 * PX.rand(i, 3)) * (1 + 1.4 * Math.exp(-age / 12) * (1 - settle)); j++;
        }
        const breathe = lt > S.stop ? 0.05 * Math.sin((lt - S.stop) * 1.6) : 0;
        PX.points(SX, SY, j, RED, { a: onA * 0.52 * (1 + breathe), A: SA, glow: 0.22 });
      }
      if (printing) {
        const redK = lt > S.wordA - 0.2 && lt < S.wordB + 0.2 ? 1 : 0, hk = onA * (1 - prog(lt, S.stop - 0.05, S.stop + 0.3));
        const n = 1000; scratch(n);
        for (let i = 0; i < n; i++) { SX[i] = sx(PX0 + 5) + (PW - 10) * SC * (i + PX.rand(i, 5)) / n; SY[i] = head + (PX.rand(i, 6) - 0.5) * 1.6; SA[i] = 0.6 + 0.4 * PX.rand(i, 7); }
        PX.points(SX, SY, n, mix(LAMP, RED, redK * 0.55), { a: 0.22 * hk, A: SA, glow: 0.5 });
      }
      PX.flush({ exposure: 1.5, glow: 0.9 });

      // ---------- the voice
      cap(V.lines.cost, lt, S.tW + 0.3, null, { dur: 1.7 });
    },
    cues(V, api) {
      const S = billTimes(api);
      return [
        { t: S.feed[0][0], type: 'print', dur: 5.25 },
        { t: S.write[0], type: 'pen' }, { t: S.write[1], type: 'pen' },
        { t: S.tW + 0.1, type: 'hush' },
        { t: S.wordA - 0.35, type: 'print', dur: +(S.stop - S.wordA + 0.35).toFixed(3) },
      ];
    },
  });

  // ================================================================================================ b16 never
  const LINE_Y = 860, YR = 220;                         // world: x = (age - 18) * YR; the line sits where b17's cliff top is
  const wxAge = a => (a - 18) * YR;
  function neverCam(api, lt) {
    const t = ['a18', 'a20', 'a25', 'never'].map(n => at(api, n));
    let age = lerp(16.9, 18, ease.out(prog(lt, t[0] - 0.4, t[0] + 2.6)));
    age = lerp(age, 20, ease.inOut(prog(lt, t[1], t[1] + 1.5)));
    age = lerp(age, 25, ease.inOut(prog(lt, t[2], t[2] + 2.2)));
    const pk = ease.inOut(prog(lt, t[3] + 0.1, t[3] + 2.8));
    const walk = age;
    age = lerp(age, 21.55, pk);
    const s = Math.pow(0.55, pk) * (1 + 0.01 * Math.max(0, lt - t[3] - 2.8));
    return { t, pk, s, walk, cx: wxAge(age), X: wx => W / 2 + (wx - wxAge(age)) * s, Y: wy => LINE_Y + (wy - LINE_Y) * s };
  }
  // partial dashed rectangle (perimeter progress k, starting top-centre, both ways like a pen opening a frame)
  function frameDraw(x, y, w, h, k, dash) {
    if (k <= 0) return;
    const half = (w + 2 * h + w) / 2, L = half * k;
    const pathSide = sgn => {                           // from top-centre going sgn (+1 right, -1 left), length L
      const pts = [[x + w / 2, y], [sgn > 0 ? x + w : x, y], [sgn > 0 ? x + w : x, y + h], [x + w / 2, y + h]];
      let left = L; ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length && left > 0; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), f = Math.min(1, left / d);
        ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)); left -= d;
      }
    };
    ctx.setLineDash(dash); ctx.beginPath(); pathSide(1); pathSide(-1); ctx.stroke(); ctx.setLineDash([]);
  }
  T.register('never', {
    draw(ctx, V, lt, api) {
      const cam = neverCam(api, lt), { s, X, Y, pk } = cam, t = cam.t;
      const ages = V.lines.ages;
      // ---------- the line of a life, a tick per year
      const a0 = 12, a1 = 34, xa = X(wxAge(a0)), xb = X(wxAge(a1));
      ctx.save();
      const gl = ctx.createLinearGradient(Math.max(-200, xa), 0, Math.min(W + 200, xb), 0);
      gl.addColorStop(0, ink(0)); gl.addColorStop(0.18, ink(0.42)); gl.addColorStop(0.82, ink(0.42)); gl.addColorStop(1, ink(0));
      ctx.strokeStyle = gl; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(xa, LINE_Y); ctx.lineTo(xb, LINE_Y); ctx.stroke();
      for (let a = a0 + 1; a < a1; a++) {
        const x = X(wxAge(a)); if (x < -20 || x > W + 20) continue;
        const ix = ages.findIndex(g => +g[0] === a), major = ix >= 0;
        const edge = clamp(Math.min(a - a0, a1 - a) / 4);
        ctx.strokeStyle = ink((major ? 0.6 : 0.3) * edge); ctx.lineWidth = 1.3;
        const h = (major ? 18 : 9) * Math.max(0.75, s);
        ctx.beginPath(); ctx.moveTo(x, LINE_Y - h); ctx.lineTo(x, LINE_Y + h); ctx.stroke();
      }
      ctx.restore();
      // ---------- the empty frames
      ages.forEach(([age, ev], i) => {
        const ti = t[i], k1 = prog(lt, ti + 0.35, ti + 1.6), kt = prog(lt, ti + 1.1, ti + 2.7);
        const tx = X(wxAge(+age)), up = i !== 1, lab = ease.out(prog(lt, ti, ti + 0.6));
        const sz = 54, tw = measure(ev, { size: sz, family: F.serif, weight: 400 }) + sz * 0.06 * [...ev].length;
        const w = Math.max(420, tw + 130) * s, h = 230 * s, gap = 70 * s;
        const fx = lerp(tx, clamp(tx, 80 + w / 2, 1000 - w / 2), pk) - w / 2;
        const fy = up ? LINE_Y - gap - h : LINE_Y + gap;
        // the age, under (or over) its tick
        const ly = up ? LINE_Y + 34 + 28 * Math.max(0.7, s) : LINE_Y - 30 - 6 * s;
        text(age, tx, ly, { size: 34 * Math.max(0.72, s), family: F.mono, color: ink(0.8), align: 'center', alpha: lab });
        if (k1 <= 0) return;
        ctx.save();
        // stem from the tick to the frame
        const sk = ease.out(clamp(k1 * 2.5));
        ctx.strokeStyle = ink(0.34); ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
        const fyEdge = up ? fy + h : fy, sx = clamp(tx, fx + 12, fx + w - 12);
        ctx.beginPath(); ctx.moveTo(tx, up ? LINE_Y - 20 : LINE_Y + 20); ctx.lineTo(lerp(tx, sx, sk), lerp(up ? LINE_Y - 20 : LINE_Y + 20, fyEdge, sk)); ctx.stroke();
        // the frame (an empty slot), drawn on like a pen opening it
        ctx.strokeStyle = ink(0.4); ctx.lineWidth = 1.3;
        frameDraw(fx, fy, w, h, ease.inOut(prog(k1, 0.25, 1)), [9 * Math.max(0.6, s), 7 * Math.max(0.6, s)]);
        // corner marks, like a photo mount
        const ck = prog(k1, 0.7, 1), cm = 16 * s;
        if (ck > 0) {
          ctx.strokeStyle = ink(0.5 * ck); ctx.setLineDash([]);
          for (const [cx, cy, dx, dy] of [[fx, fy, 1, 1], [fx + w, fy, -1, 1], [fx, fy + h, 1, -1], [fx + w, fy + h, -1, -1]]) {
            ctx.beginPath(); ctx.moveTo(cx + dx * 5 * s, cy + dy * (5 * s + cm)); ctx.lineTo(cx + dx * 5 * s, cy + dy * 5 * s); ctx.lineTo(cx + dx * (5 * s + cm), cy + dy * 5 * s); ctx.stroke();
          }
        }
        // the event that never happened: only a dashed outline of its words, faint
        if (kt > 0) {
          const ts = sz * s, cx = fx + w / 2, cy = fy + h / 2 + ts * 0.36;
          ctx.font = `400 ${ts}px ${F.serif}`; ctx.textAlign = 'center'; ctx.letterSpacing = (ts * 0.06) + 'px';
          ctx.beginPath(); const mw = ctx.measureText(ev).width; ctx.rect(cx - mw / 2 - 6, fy, (mw + 12) * ease.inOut(kt), h); ctx.clip();
          ctx.globalAlpha *= 0.62; ctx.strokeStyle = ink(0.75); ctx.lineWidth = Math.max(0.8, 1.1 * s); ctx.setLineDash([2.6 * Math.max(0.6, s), 2.6 * Math.max(0.6, s)]);
          ctx.strokeText(ev, cx, cy);
          ctx.setLineDash([]); ctx.globalAlpha *= 0.18; ctx.fillStyle = ink(1); ctx.fillText(ev, cx, cy);
        }
        ctx.restore();
      });
      // you on the line: a small grey bead that travels with the camera, then on past 25 to today
      const ageNow = lerp(cam.walk, 25.35, ease.inOut(prog(lt, t[3] + 0.6, t[3] + 3.6)));
      const bx = X(wxAge(ageNow)), ba = ease.out(prog(lt, 0.2, 1.2));
      PX.begin(); fullFrame();
      const D = PX.disc(260, 0, 0, 1); scratch(D.n);
      for (let i = 0; i < D.n; i++) { SX[i] = bx + D.X[i] * 7; SY[i] = LINE_Y + D.Y[i] * 7; SA[i] = 0.4 + 0.8 * Math.exp(-(D.X[i] ** 2 + D.Y[i] ** 2) * 3); }
      PX.points(SX, SY, D.n, [0.78, 0.8, 0.84], { a: 0.16 * ba, A: SA, glow: 0.5 });
      PX.flush({ exposure: 1.4, glow: 0.9 });
      cap(V.lines.never, lt, t[3] + 1.0, null, { dur: 1.5 });
    },
    cues(V, api) {
      const t = ['a18', 'a20', 'a25', 'never'].map(n => at(api, n));
      const out = [];
      for (let i = 0; i < 3; i++) { out.push({ t: t[i] + 0.35, type: 'tick' }); out.push({ t: t[i] + 1.1, type: 'type', dur: 1.6 }); }
      out.push({ t: t[3] + 0.1, type: 'hush' });
      return out;
    },
  });

  // ================================================================================================ b17 fall
  // world (identity camera = the opening shot): cliff top at YT, the edge at XE, the floor HC below
  const YT = 860, XE = 600, HC = 300, YF = YT + HC, YOU = 150, XL = XE + 140;   // XL: where 你 comes down
  const FEET = 0.41;                                     // KIT.you: feet ≈ centre + 0.47 x size
  // the silhouette: a plateau rising gently to the left, a worn lip, a jagged face stepping back to the floor
  const FACE = [[XE, YT], [XE + 7, YT + 12], [XE - 3, YT + 30], [XE - 15, YT + 56], [XE - 9, YT + 88], [XE - 24, YT + 124],
    [XE - 33, YT + 160], [XE - 27, YT + 198], [XE - 42, YT + 238], [XE - 47, YT + 272], [XE - 55, YF]];
  function faceX(y) {
    if (y <= FACE[0][1]) return FACE[0][0];
    for (let i = 1; i < FACE.length; i++) if (y <= FACE[i][1]) return lerp(FACE[i - 1][0], FACE[i][0], (y - FACE[i - 1][1]) / (FACE[i][1] - FACE[i - 1][1]));
    return FACE[FACE.length - 1][0];
  }
  const topY = x => YT - 72 * smooth(clamp((XE - 160 - x) / 760)) + Math.sin(x * 0.031) * 1.4 + Math.sin(x * 0.0113 + 1) * 3 * clamp((XE - 160 - x) / 300);
  const vnoise = K.vnoise;
  /* line art is stored as segments in 3 weights (strong / mid / weak), bucketed in horizontal bands so a frame can
     light the rock by height (lit from above at the edge, from below by the floor, or all of it) */
  function bandSet(y0, y1, NB) {
    const bandH = (y1 - y0) / NB, segs = Array.from({ length: NB }, () => [[], [], []]);
    const add = (x1, ya, x2, yb, w) => { const b = clamp(Math.floor(((ya + yb) / 2 - y0) / bandH), 0, NB - 1); segs[b][w].push([x1, ya, x2, yb]); };
    const poly = (pts, w, keep) => { for (let i = 1; i < pts.length; i++) if (!keep || keep(i)) add(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w); };
    const build = () => segs.map((b, i) => ({ y: y0 + (i + 0.5) * bandH, p: b.map(list => { const P = new Path2D(); for (const [x1, ya, x2, yb] of list) { P.moveTo(x1, ya); P.lineTo(x2, yb); } return P; }) }));
    return { add, poly, build };
  }
  // the rock's surface drawing, given a face function fx(y) over [ya, yb] (shared by the true cliff and the dream tile)
  function rockFace(B, fx, ya, yb, r, seed) {
    // contour lines parallel to the face, broken more the deeper into the rock they go
    [9, 20, 34, 52, 78].forEach((d, k) => {
      const pts = []; for (let y = ya + 4 + d * 0.15; y <= yb; y += 6) pts.push([fx(y) - d - 5 * vnoise(y * 0.03, d + seed), y]);
      const thr = 0.3 + k * 0.09;
      B.poly(pts, k < 2 ? 1 : 2, i => vnoise(i * 0.09 + k * 3.1, seed + k) > thr);
    });
    // ledges: short shelves going in from where the face steps back
    for (let y = ya + 26; y < yb - 10; y += 30 + r() * 26) {
      const x = fx(y) - 2, l = 40 + r() * 110, dy = (r() - 0.5) * 6, pts = [];
      for (let u = 0; u <= 1.001; u += 0.1) pts.push([x - l * u, y + dy * u + Math.sin(u * 3 + y) * 1.5]);
      B.poly(pts, 1, i => i < 4 || r() > 0.3);
    }
    // hatching along the face (the rock turns away from the light)
    for (let y = ya + 8; y < yb - 3; y += 5.5) {
      const x = fx(y) - 3, l = 9 + 20 * vnoise(y * 0.05, seed + 9);
      B.add(x, y, x - l * 0.75, y + l * 0.6, 2);
    }
    // cracks
    for (let c = 0; c < 3; c++) {
      let y = ya + 20 + r() * (yb - ya - 80), x = fx(y) - 6; const pts = [[x, y]], len = 40 + r() * 90;
      for (let u = 0; u < len; u += 9) { y += 8 + r() * 4; x -= 2 + r() * 7; pts.push([x, y]); }
      B.poly(pts, 1);
    }
  }
  let CLIFF = null, TILE = null;
  function cliff() {
    if (CLIFF) return CLIFF;
    const r = rng(5150), B = bandSet(YT - 100, YF + 10, 28);
    // silhouette
    const top = []; for (let x = -320; x < XE - 20; x += 18) top.push([x, topY(x) + (r() - 0.5) * 1.6]);
    top.push([XE - 10, YT - 0.5], [XE, YT]);
    B.poly(top, 0);
    const fp = []; for (let y = YT; y <= YF; y += 4) fp.push([faceX(y) + (r() - 0.5) * 2, y]);
    B.poly(fp, 0);
    // the plateau's thickness: lines under the top surface
    [9, 21, 38].forEach((d, k) => {
      const pts = []; for (let x = -320; x < faceX(YT + d) - 8 - d * 0.3; x += 14) pts.push([x, topY(x) + d + 3 * vnoise(x * 0.02, k)]);
      B.poly(pts, k ? 2 : 1, i => vnoise(i * 0.12, 40 + k) > 0.3 + k * 0.08);
    });
    rockFace(B, faceX, YT + 6, YF, r, 3);
    // long strata through the body, fading into the rock
    for (let y = YT + 60; y < YF - 10; y += 34 + r() * 20) {
      const x0 = faceX(y) - 70 - r() * 60, l = 160 + r() * 380, ph = r() * 6, pts = [];
      for (let u = 0; u <= l; u += 16) pts.push([x0 - u, y + Math.sin(u * 0.012 + ph) * 4 - u * 0.02]);
      B.poly(pts, 2, i => vnoise(i * 0.2, y) > 0.35);
    }
    // fallen stones at the foot
    for (let k = 0; k < 8; k++) {
      const x = faceX(YF) + 6 + r() * 70 + (k > 5 ? 60 : 0), w = 6 + r() * 15, h = 4 + r() * 7;
      B.poly([[x - w / 2, YF], [x - w * 0.3, YF - h], [x + w * 0.35, YF - h * 0.8], [x + w / 2, YF]], 1);
    }
    return (CLIFF = B.build());
  }
  // the face of the dream: the same rock, endless (a periodic tile of height TP)
  const TP = 640;
  const tileX = y => XE - 34 + 12 * Math.sin(y * TAU / TP * 2) + 8 * Math.sin(y * TAU / TP * 5 + 1) + 4 * Math.sin(y * TAU / TP * 11);
  function tile() {
    if (TILE) return TILE;
    const r = rng(77), B = bandSet(0, TP, 1);
    const fp = []; for (let y = 0; y <= TP; y += 4) fp.push([tileX(y), y]);
    B.poly(fp, 0);
    rockFace(B, tileX, 0, TP, r, 11);
    return (TILE = B.build()[0]);
  }
  const W8 = [[0.62, 1.5], [0.42, 1.2], [0.24, 1.0]];      // [alpha, width] of the three weights
  /** draw the cliff (world coords) through camera m = {s, ox, oy}; vis(y) -> 0..1 */
  function drawCliff(m, vis, a) {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(m.ox, m.oy); ctx.scale(m.s, m.s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const b of cliff()) {
      const v = vis(b.y); if (v <= 0.004) continue;
      for (let w = 0; w < 3; w++) { ctx.strokeStyle = ink(W8[w][0] * v); ctx.lineWidth = W8[w][1] / m.s; ctx.stroke(b.p[w]); }
    }
    ctx.restore();
  }
  function drawTile(m, y0, dx, a) {
    if (a <= 0.003) return;
    const T_ = tile();
    ctx.save(); ctx.globalAlpha *= a; ctx.lineCap = 'round';
    for (let k = 0; k < 40; k++) {
      const yy = y0 + k * TP, sy0 = m.oy + yy * m.s; if (sy0 > H + 20) break; if (sy0 + TP * m.s < -20) continue;
      ctx.save(); ctx.translate(m.ox + dx, sy0); ctx.scale(m.s, m.s);
      for (let w = 0; w < 3; w++) { ctx.strokeStyle = ink(W8[w][0] * 0.8); ctx.lineWidth = W8[w][1] / m.s; ctx.stroke(T_.p[w]); }
      ctx.restore();
    }
    ctx.restore();
  }
  // imprints of the others on the floor: [x, depth 0..1, size, rotation, brightness, ring]
  let MARKS = null;
  function marks() {
    if (MARKS) return MARKS;
    const r = rng(1717), out = [], x0 = faceX(YF) + 30;
    for (let i = 0; i < 160 && out.length < 64; i++) {
      const g = r() < 0.55, gx = () => { let s = 0; for (let k = 0; k < 3; k++) s += r(); return (s - 1.5) / 0.5; };
      const x = g ? XL + gx() * 170 : x0 + r() * 820, d = g ? clamp(0.35 + gx() * 0.25, 0.05, 1) : 0.05 + r() * 0.95;
      if (x < x0 || Math.abs(x - XL) < 46 && d < 0.5) continue;
      if (out.some(m => Math.abs(m[0] - x) < 34 && Math.abs(m[1] - d) < 0.16)) continue;   // no pile-ups: each one legible
      out.push([x, d, 0.75 + 0.5 * r(), (r() - 0.5) * 1.4, 0.45 + 0.55 * r(), r()]);
    }
    return (MARKS = out);
  }
  const FLOOR_D = 190, FLOOR_SQ = 0.24;                   // world depth of the floor band in front of the cliff, ellipse squash
  function fallTimes(api) {
    const tC = at(api, 'cliff'), tS = at(api, 'step'), tD = at(api, 'drop'), tL = at(api, 'land'), tF = at(api, 'floor');
    return { tC, tS, tD, tL, tF, walk: [tS + 0.25, tS + 1.45], tip: tS + 2.3, stop: tL - 0.22, contact: tL + 0.3 };
  }
  // the subjective fall: distance (screen px) and speed since the tip
  const G0 = 1000, GT = 2.4;
  const fallD = tau => tau <= 0 ? 0 : tau < 1 ? 0.5 * G0 * tau * tau : 0.5 * G0 + G0 * GT * (Math.exp((tau - 1) / GT) - 1);
  const fallV = tau => tau <= 0 ? 0 : tau < 1 ? G0 * tau : G0 * Math.exp((tau - 1) / GT);
  function fallState(S, lt) {
    // D: rush distance, v: rush speed (screen px / s); after the stop it decays fast (soft, not a crash)
    const tau = lt - S.tip, tauS = S.stop - S.tip;
    if (lt < S.stop) return { D: fallD(tau), v: fallV(tau) };
    const vS = fallV(tauS), k = 0.16, d = lt - S.stop;
    return { D: fallD(tauS) + vS * k * (1 - Math.exp(-d / k)), v: vS * Math.exp(-d / k) };
  }
  // camera (world point shown at screen (540, 960), scale s)
  const S_OPEN = 1.36, CAM_FLOOR = { s: 0.8, wx: 668, wy: 1105 }, LAND_AT = { x: 556, y: 930 };
  function camAt(S, lt) {
    const pk = ease.inOut(prog(lt, S.tC, S.tS + 2.2));
    let c = { s: lerp(1.24, S_OPEN, pk), wx: lerp(565, 580, pk), wy: lerp(950, 925, pk) };
    if (lt >= S.tL - 0.6) {                                   // landing shot (world-true), then the pull-back
      const yc = YF - FEET * YOU, s0 = S_OPEN;
      c = { s: s0, wx: XL - (LAND_AT.x - 540) / s0, wy: yc - (LAND_AT.y - 960) / s0 };
      c.s *= 1 + 0.025 * ease.inOut(prog(lt, S.tL, S.tF));
      const fk = ease.inOut(prog(lt, S.tF + 0.2, S.tF + 5.4));
      if (fk > 0) c = { s: c.s * Math.pow(CAM_FLOOR.s / c.s, fk), wx: lerp(c.wx, CAM_FLOOR.wx, fk), wy: lerp(c.wy, CAM_FLOOR.wy, fk) };
    }
    c.ox = W / 2 - c.wx * c.s; c.oy = 960 - c.wy * c.s;
    c.X = x => c.ox + x * c.s; c.Y = y => c.oy + y * c.s;
    return c;
  }
  // 你: where it is on screen, and how it looks
  function youState(S, lt, cam) {
    const st = { size: YOU * cam.s, rot: 0, drift: 0, gray: 0.2, own: 0, stream: 0, breathe: 0.45 };
    if (lt < S.tip) {
      // standing; a few small steps to the very edge; a breath; a slight lean
      const wk = prog(lt, S.walk[0], S.walk[1]);
      const wx = lerp(XE - 72, XE - 26, ease.inOut(wk)), wy = YT - FEET * YOU - Math.abs(Math.sin(wk * Math.PI * 3)) * 5 * (wk > 0 && wk < 1 ? 1 : 0);
      st.rot = 0.05 * ease.inOut(prog(lt, S.walk[1] + 0.2, S.tip));
      st.x = cam.X(wx); st.y = cam.Y(wy);
      return st;
    }
    const tau = lt - S.tip, cT = camAt(S, S.tip);
    st.size = YOU * cT.s * (1 - 0.2 * ease.inOut(clamp((tau - 1) / 6)));      // the dark grows around you
    // the step off: forward and a little up, then gravity; the camera catches 你 and falls with it
    const hop = ease.out(clamp(tau / 0.35)), follow = smooth(clamp(tau / 1.0));
    const x0 = cT.X(XE - 26 + 44 * hop), y0 = cT.Y(YT - FEET * YOU);
    const yRaw = y0 - 14 * Math.sin(Math.PI * clamp(tau / 0.5)) + fallD(tau) * (1 - follow);
    let x = lerp(x0, LAND_AT.x, follow) + Math.sin(tau * 0.7) * 12 * follow;
    let y = lerp(yRaw, y0 + 78, follow) + Math.sin(tau * 1.3) * 6 * follow;
    st.rot = 0.05 + (0.11 * Math.sin(tau * 0.8 + 0.4) + 0.04) * clamp(tau / 2);
    st.gray = 0.15 + 0.2 * clamp(tau / 4);
    st.stream = clamp(fallV(tau) / 9000);
    st.drift = 2 + 9 * st.stream;
    if (lt >= S.stop) {
      // the soft landing: everything slows; 你 settles onto light; the particles come home
      const lk = ease.out(prog(lt, S.stop, S.contact + 0.3)), yc = YF - FEET * YOU;
      x = lerp(x, cam.X(XL), lk); y = lerp(y, cam.Y(yc), lk);
      st.size = YOU * cam.s;
      st.rot *= 1 - ease.inOut(prog(lt, S.stop, S.contact + 0.6));
      const sk = ease.out(prog(lt, S.stop, S.contact + 1.6));
      st.stream *= 1 - lk; st.drift = lerp(st.drift, 0, sk);
      st.gray = lerp(st.gray, 0.05, sk);
      st.own = 0.32 * ease.inOut(prog(lt, S.contact, S.contact + 3.5));
    }
    st.x = x; st.y = y;
    return st;
  }
  // the rush: depth layers moving up (screen space): far dust, thin streaks, and a few big soft ones close by
  const LAYERS = [
    { n: 1300, par: 0.22, a: 0.75, len: 0.03, seed: 31, size: 1 },
    { n: 160, par: 0.7, a: 0.55, len: 0.05, seed: 41, size: 1 },
    { n: 14, par: 2.2, a: 0.32, len: 0.07, seed: 51, size: 2 },
  ];
  function rush(D, v, a, xHole) {
    if (a <= 0.003) return;
    for (const L of LAYERS) {
      const span = H + 1400, len = clamp(v * L.par * L.len, 1, 1300), m = Math.max(1, Math.min(160, Math.round(len / (L.size > 1 ? 4 : 2.5))));
      scratch(L.n * m); let j = 0;
      const nn = Math.round(L.n * (0.45 + 0.55 * clamp(v / 9000)));
      for (let i = 0; i < nn; i++) {
        const x = PX.rand(i, L.seed) * (W + 80) - 40, sp = 0.7 + 0.6 * PX.rand(i, L.seed + 1);
        const y = ((PX.rand(i, L.seed + 2) * span - D * L.par * sp) % span + span) % span - 700;
        if (y > H + 10 || y + len * sp < -10) continue;
        const near = Math.abs(x - xHole) < 110 ? 0.4 : 1, A = (0.3 + 0.7 * PX.rand(i, L.seed + 3) ** 2) * near;
        for (let q = 0; q < m; q++) { SX[j] = x; SY[j] = y + q * len * sp / m; SA[j] = A * (q === 0 ? 1.4 : 1 - q / m * 0.75); j++; }
      }
      PX.points(SX, SY, j, mix(LAMP, [0.55, 0.62, 0.78], 0.45), { a: a * L.a, A: SA, glow: L.size > 1 ? 0.7 : 0.25, size: L.size });
    }
  }
  function vignette(a) {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalAlpha *= Math.min(1, a);
    const g = ctx.createRadialGradient(W / 2, 900, 220, W / 2, 900, 1100);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  T.register('fall', {
    draw(ctx, V, lt, api) {
      const S = fallTimes(api), cam = camAt(S, lt), you = youState(S, lt, cam);
      const tau = lt - S.tip, falling = lt >= S.tip, F_ = falling ? fallState(S, lt) : { D: 0, v: 0 };
      const landShot = lt >= S.tL - 0.6;
      const cT = S.contact, lightK = lt >= S.stop;
      const R = lt > cT ? 1500 * (1 - Math.exp(-(lt - cT) / 2.0)) : 0;                         // light spread (world px)
      const reveal = ease.inOut(prog(lt, S.tF + 0.8, S.tF + 4.8));
      // ---------- darkness deepens during the fall
      const dark = falling && !landShot ? 0.22 * ease.inOut(clamp(tau / 4)) : landShot ? 0.3 * (1 - ease.out(prog(lt, S.tL, S.tL + 2.5))) : 0;
      veil(dark);
      // ---------- the cliff: lit from above (opening), an endless face (fall), the true cliff (landing, reveal)
      if (!landShot) {
        const follow = falling ? smooth(clamp(tau / 1.0)) : 0;
        const m = { s: cam.s, ox: cam.ox, oy: cam.oy - (falling ? F_.D * follow : 0) };
        const fo = falling ? 1 - ease.in(prog(tau, 0.6, 2.4)) : 1;
        drawCliff(m, y => Math.pow(clamp(1 - (y - YT) / 270), 1.5) + 0.04, fo);
        if (falling) {
          const recede = -260 * ease.in(clamp(tau / 3.2));
          drawTile(m, YT + 150, recede * 1, clamp(tau / 0.5) * (1 - ease.in(prog(tau, 1.2, 3.4))) * 0.75);
        }
      } else {
        const m = { s: cam.s, ox: cam.ox, oy: cam.oy };
        const floorLit = y => clamp(1 - (YF - y) / 105) * clamp(R / 200);
        drawCliff(m, y => Math.max(floorLit(y) * 0.85, reveal * (0.62 + 0.3 * clamp((y - YT) / HC))), 1);
      }
      // ---------- the floor: the imprints of everyone who fell before (flattened 你: everyone who fell was someone's 你; lit as the light reaches them)
      if (lightK && R > 0) {
        ctx.save(); ctx.translate(cam.ox, cam.oy); ctx.scale(cam.s, cam.s);
        ctx.font = `600 50px ${F.serif}`; ctx.textAlign = 'center';
        for (const [mx, md, ms, mr, mb, mz] of marks()) {
          const y = YF + 10 + md * FLOOR_D, dist = Math.hypot(mx - XL, (y - YF) / FLOOR_SQ);
          const lit = clamp((R - dist) / 300); if (lit <= 0.01) continue;
          const pk = 0.65 + 0.55 * md, flash = Math.exp(-Math.max(0, R - dist) / 200);
          ctx.save(); ctx.translate(mx, y); ctx.scale(ms * pk, ms * pk * 0.46); ctx.rotate(mr);
          ctx.globalAlpha = lit * mb * (0.11 + 0.16 * flash) * (0.55 + 0.45 * md) * (1 + 0.7 * reveal);
          ctx.fillStyle = warmS(1); ctx.fillText('你', 0, 18);
          if (mz > 0.45) { ctx.strokeStyle = warmS(0.35); ctx.lineWidth = 1.2 / (ms * pk); ctx.beginPath(); ctx.ellipse(0, 0, 50, 50, 0, 0, TAU); ctx.stroke(); }
          ctx.restore();
        }
        ctx.restore();
      }
      PX.begin(); fullFrame();
      if (lightK) {
        const xc = XL, pre = clamp((lt - S.stop) / 0.5);           // the light appears just below before you touch it
        // floor line: warm particles along y = YF, spreading from the contact point
        const n = 5200; scratch(n);
        const span = 2600, x0 = faceX(YF) - 2;
        let j = 0;
        for (let i = 0; i < n; i++) {
          const x = x0 + (i + PX.rand(i, 61)) / n * span, dx = Math.abs(x - xc);
          const lit = Math.max(pre * Math.exp(-dx / 240) * (lt < cT ? 0.55 : 0.35), clamp((R - dx) / 140) * (0.22 + 0.78 * Math.exp(-dx / 480)));
          if (lit <= 0.01) continue;
          SX[j] = cam.X(x); SY[j] = cam.Y(YF) + (PX.rand(i, 62) - 0.5) * 1.6; SA[j] = lit * (0.6 + 0.4 * PX.rand(i, 63)); j++;
        }
        PX.points(SX, SY, j, WARM, { a: 0.55, A: SA, glow: 0.6 });
        // ripples: rings spreading over the floor plane from the contact point
        if (lt > cT) {
          const m = 1100; scratch(m * 3); j = 0;
          [0, 0.55, 1.25].forEach((d, ri) => {
            const tr = lt - cT - d; if (tr <= 0) return;
            const rr = 1150 * (1 - Math.exp(-tr / 1.6)), al = Math.exp(-tr * 0.5) * (1 - rr / 1200) * (ri ? 0.6 : 1);
            if (al <= 0.01) return;
            for (let i = 0; i < m; i++) {
              const an = (i + PX.rand(i, 71 + ri)) / m * TAU, x = xc + Math.cos(an) * rr, y = YF + Math.sin(an) * rr * FLOOR_SQ;
              if (Math.sin(an) < 0 && x < faceX(YF) + 6) continue;          // behind the rock
              if (y > YF + FLOOR_D * 1.3) continue;
              SX[j] = cam.X(x); SY[j] = cam.Y(y); SA[j] = al * (0.6 + 0.4 * PX.rand(i, 74)) * (Math.sin(an) < 0 ? 0.45 : 1); j++;
            }
          });
          PX.points(SX, SY, j, WARM, { a: 0.4, A: SA, glow: 0.5 });
        }
      }
      // ---------- the rush
      if (falling) {
        const ra = clamp(tau / 0.9) * (lt < S.stop ? 1 : 1 - ease.out(prog(lt, S.stop, S.stop + 0.55)));
        rush(F_.D, F_.v, ra, you.x);
      }
      // ---------- the void breathes (opening): sparse cold motes rising from below the edge
      if (!falling || tau < 1.2) {
        const n = 320; scratch(n); const va = ease.out(prog(lt, 0.3, 2.5)) * (falling ? 1 - clamp(tau / 1.2) : 1);
        for (let i = 0; i < n; i++) {
          const x = cam.X(XE + 30 + PX.rand(i, 81) * 700), y0 = PX.rand(i, 82) * 1100;
          const y = YT + 40 + ((y0 - lt * (10 + 18 * PX.rand(i, 83))) % 1100 + 1100) % 1100;
          SX[i] = x + Math.sin(lt * 0.4 + i) * 6; SY[i] = cam.Y(y) - (falling ? F_.D : 0); SA[i] = (0.3 + 0.7 * PX.rand(i, 84)) * clamp((y - YT - 40) / 300) * (1 - clamp((y - YT - 600) / 500));
        }
        PX.points(SX, SY, n, LAMP, { a: 0.22 * va, A: SA, glow: 0.2 });
      }
      // ---------- 你
      const yo = KIT.you(you.x, you.y, you.size, { t: lt, rot: you.rot, gray: you.gray, own: you.own, drift: you.drift, breathe: you.breathe, a: 1.7 });
      if (you.stream > 0.02) {
        // its particles stream upward (the air of the fall)
        const n = yo.n, m = 3, len = 30 + 260 * you.stream; scratch(Math.ceil(n / 2) * m); let j = 0;
        for (let i = 0; i < n; i += 2) {
          if (PX.rand(i, 91) > 0.25 + 0.6 * you.stream) continue;
          for (let q = 1; q <= m; q++) { SX[j] = yo.X[i] + Math.sin(lt * 3 + i) * 2; SY[j] = yo.Y[i] - q / m * len * (0.3 + 0.7 * PX.rand(i, 92)); SA[j] = (1 - q / (m + 1)) * 0.8; j++; }
        }
        PX.points(SX, SY, j, [0.62, 0.66, 0.74], { a: 0.2 * you.stream + 0.04, A: SA, glow: 0.2 });
      }
      PX.flush({ exposure: 1.45, glow: 0.95 });
      if (falling && !landShot) vignette(0.75 * ease.inOut(clamp((tau - 0.5) / 4)));
      else if (landShot) vignette(0.9 * (1 - ease.out(prog(lt, S.stop, S.stop + 1.2))));
      // ---------- soft warm light pool on the floor (canvas, additive)
      if (lightK) {
        const pre = clamp((lt - S.stop) / 0.5);
        softLight(cam.X(XL), cam.Y(YF + 14), Math.max(60, R) * cam.s * 0.9, '255,201,133', 0.12 * Math.max(pre, clamp(R / 300)), 0.24);
        softLight(cam.X(XL), cam.Y(YF), 260 * cam.s, '255,201,133', 0.12 * pre * (1 - 0.5 * reveal), 0.3);
      }
      // ---------- the voice
      cap(V.lines.cliff, lt, S.tC + 0.9, S.tS + 0.7);
      cap(V.lines.alive, lt, S.tL + 1.4, S.tF + 0.7, { family: F.hand, size: 56, dur: 2.2 });
      const fl = V.lines.floor, l2 = fl[1], cut = l2.indexOf('，') + 1;
      cap([fl[0]], lt, S.tF + 1.5, null, { y: 1400, dur: 1.6 });
      cap(cut > 0 ? [l2.slice(0, cut), l2.slice(cut)] : [l2], lt, S.tF + 4.1, null, { y: 1500, dur: 2.6 });
    },
    cues(V, api) {
      const S = fallTimes(api);
      return [
        { t: S.tC + 0.2, type: 'hush' },
        { t: S.tip, type: 'fall', dur: +(S.stop - S.tip).toFixed(3) },
        { t: S.contact, type: 'land' },
        { t: S.contact + 0.15, type: 'glow' },
        { t: S.tF + 0.2, type: 'swell', dur: 5.2 },
        { t: S.tF + 4.1, type: 'resolve' },
      ];
    },
  });
})();
