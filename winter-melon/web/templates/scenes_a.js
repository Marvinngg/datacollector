/* Scenes, part A (look-dev): open, qin_field, scale (the 冬瓜干 on the 杆秤). */
(function () {
  const { W, H, ctx, F, clamp, lerp, prog, ease, rng } = K;
  const TAU = Math.PI * 2;
  const win = (lt, s, d = 0.5) => s ? Math.min(ease.out(prog(lt, s.lt, s.lt + d)), 1) : 0;

  // a silhouette hand + forearm reaching in from (x0, y0) to the palm at (x, y)
  function handShape(x0, y0, x, y, size, col, rim, o = {}) {
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = size * 0.55; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
    const a = Math.atan2(y - y0, x - x0);
    ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(size * 0.25, 0, size * 0.42, size * 0.34, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = size * 0.13;
    const curl = o.curl || 0;
    for (let k = 0; k < 4; k++) { const fy = (k - 1.5) * size * 0.16; ctx.beginPath(); ctx.moveTo(size * 0.5, fy); ctx.quadraticCurveTo(size * (0.85 - curl * 0.3), fy * 1.1, size * (1.0 - curl * 0.55), fy * 1.15 + curl * size * 0.25); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(size * 0.2, -size * 0.3); ctx.lineTo(size * 0.55, -size * 0.55); ctx.stroke();   // thumb
    if (rim) { ctx.globalAlpha = 0.8; ctx.strokeStyle = rim; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(size * 0.25, 0, size * 0.42, size * 0.34, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke(); }
    ctx.restore();
  }
  K.handShape = handShape;

  // ================================================================ s01 open
  // dawn, fog over the melon field; a hand knocks on a big melon twice; the carved 「李」 catches the light; title
  T.register('open', {
    draw(ctx, V, lt, api) {
      const tod = 'dawn', hz = 1080;
      const kn = S.stepAt(api, 'knock'), cv = S.stepAt(api, 'carve'), ti = S.stepAt(api, 'title');
      S.camera(lt, { dur: api.dur, z0: 1.0, z1: 1.12, y0: 0, y1: 60 });
      S.layer(0.05, () => { S.sky(tod, { horizon: hz }); S.sun(760, lerp(1010, 930, ease.out(clamp(lt / api.dur))), 46, tod, 0.9); });
      S.layer(0.2, () => S.hills(tod, 3, { horizon: hz }));
      S.layer(0.3, () => S.fog(tod, lt, hz - 40, 0.55, 10, 1.2));
      S.layer(0.6, () => { S.ground(tod, hz); S.field(tod, 5, { horizon: hz, vx: 600 }); });
      S.layer(0.6, () => { for (const m of S.fieldSpots(8, 9, { horizon: hz })) if (m.s < 150) S.melon(m.x, m.y, m.s, { tod, rot: m.rot, dark: 0.55, rim: 0.6, lit: 0.3 }); });
      S.layer(0.7, () => S.fog(tod, lt * 1.3 + 200, hz + 170, 0.4, 16, 1.6));
      // the hero melon: low in frame, close to the lens
      const k1 = kn ? kn.lt + 0.7 : 99, k2 = k1 + 0.75;
      const shake = (t0) => { const d = lt - t0; return d > 0 && d < 0.5 ? Math.sin(d * 55) * 3 * (1 - d / 0.5) : 0; };
      const sx = shake(k1) + shake(k2);
      const carveA = 0.35 + 0.65 * (cv ? ease.inOut(prog(lt, cv.lt, cv.lt + 1.8)) : 0);
      S.layer(1.0, () => {
        S.melon(540 + sx, 1520, 900, { tod, rot: -0.05, carve: S.MARK, carveA, lit: 0.6, rim: 0.5 });
        // morning light sweeping across the scar
        if (cv) { const k = prog(lt, cv.lt, cv.lt + 2.4); S.light(lerp(260, 820, ease.inOut(k)), 1460, 260, 'rgba(255,226,180,0.35)', Math.sin(k * Math.PI)); }
        // the knock: each tap sends a soft ring of light across the skin
        for (const t0 of [k1, k2]) { const d = lt - t0; if (d > 0 && d < 0.9) S.light(700, 1440, 120 + d * 320, 'rgba(255,236,205,0.22)', 1 - d / 0.9); }
      });
      S.motes(lt, { n: 30, seed: 4, y: 700, h: 900, alpha: 0.35, vy: 3 });
      S.vignette(0.45);
      if (ti) {
        const k = prog(lt, ti.lt, ti.lt + 1.6);
        L.serif(V.title || '李叔的冬瓜', W / 2, 560, { size: 104, color: '#fff7ea', glow: 14, reveal: k, spacing: 16 });
      }
    },
    cues(V, api) {
      const kn = api.steps.find(s => s.show === 'knock'), out = [];
      if (kn) out.push({ t: kn.lt + 0.7, type: 'knock' }, { t: kn.lt + 1.45, type: 'knock' });
      const ti = api.steps.find(s => s.show === 'title'); if (ti) out.push({ t: ti.lt, type: 'title' });
      return out;
    },
  });

  // ================================================================ s05 qin_field
  // late morning, back-lit from the left. 李 bends over his melons and does not look up; 晓禾 stops at the field edge.
  T.register('qin_field', {
    draw(ctx, V, lt, api) {
      const tod = 'day', hz = 1020, p = S.TOD[tod];
      const ar = S.stepAt(api, 'arrive'), lv = S.stepAt(api, 'leave');
      S.camera(lt, { dur: api.dur, z0: 1.0, z1: 1.06, x0: 0, x1: 30 });
      S.layer(0.05, () => { S.sky(tod, { horizon: hz }); S.sun(170, 760, 52, tod, 0.95); });
      S.layer(0.2, () => S.hills(tod, 11, { horizon: hz }));
      S.layer(0.3, () => S.fog(tod, lt, hz - 30, 0.25, 6, 1.1));
      S.layer(0.6, () => { S.ground(tod, hz); S.field(tod, 13, { horizon: hz, vx: 380 }); });
      // his shed at the right edge
      S.layer(0.6, () => S.house(860, hz + 60, 330, tod, { door: true, wall: S.shade(p.mid, 0.25) }));
      const spots = S.fieldSpots(21, 12, { horizon: hz });
      S.layer(0.8, () => { for (const m of spots) if (m.y < 1500) S.melon(m.x, m.y, m.s * 0.9, { tod, rot: m.rot, dark: 0.45, rim: 0.7, lit: 0.35 }); });
      // 李: bent over, patting a melon; on "leave" he straightens and walks to the shed
      const lvK = lv ? prog(lt, lv.lt, lv.lt + lv.dur) : 0;
      const qx = lerp(700, 1000, ease.inOut(clamp((lvK - 0.25) / 0.75))), stand = ease.inOut(clamp(lvK / 0.3));
      const pat = Math.max(0, Math.sin(lt * 2.2)) * 0.25 * (1 - stand);
      S.layer(0.85, () => S.melon(qx - 150 * (1 - stand), 1385, 190, { tod, rot: 0.1, dark: 0.3, rim: 0.6, lit: 0.45 }));
            let qinHead;
      S.layer(0.85, () => {
        const r = S.person('qin', qx, 1380, 470, {
          tod, facing: lvK > 0.25 ? 1 : -1, light: [-1, -0.3],
          bend: lerp(0.95, 0.12, stand), head: lerp(0.35, 0, stand),
          armF: [lerp(0.55 + pat, 0.1, stand), lerp(0.5, 0.2, stand)], armB: [lerp(0.3, 0.05, stand), 0.3],
          walk: lvK > 0.3 ? lt * 5.5 : undefined, crouch: lerp(0.18, 0, stand),
        });
        qinHead = r.head;
      });
      // 晓禾 walks in from the left, stops near the tricycle
      const arK = ar ? ease.out(prog(lt, ar.lt, ar.lt + 2.6)) : 1;
      const xx = lerp(-140, 230, arK);
      let xiaoHead;
      S.layer(1.0, () => {
        S.tricycle(-330, 1700, 1.0, tod, { load: 9, facing: 1, rim: 0.5 });
        const r = S.person('xiao', xx, 1700, 640, { tod, facing: 1, light: [-1, -0.3], walk: arK < 1 ? lt * 6.2 : undefined, t: lt,
          armF: [0.15, 0.35], armB: [0.05, 0.2] });
        xiaoHead = r.head;
      });
      S.motes(lt, { n: 26, seed: 9, x: 0, y: 600, w: 700, h: 900, alpha: 0.3, vy: 2, vx: 3 });
      S.vignette(0.4);
      S.say(api, lt, { xiao: [xiaoHead[0] + 60, xiaoHead[1] - 150], qin: [qinHead[0], qinHead[1] - 130] });
    },
    cues(V, api) { return api.steps.filter(s => s.say).map(s => ({ t: s.lt, type: 'say' })); },
  });

  // ================================================================ s10 scale (杆秤)
  // close-up: a bag of 冬瓜干 on the hook; the weight slides along the beam until it levels; the weight (V.weight) appears.
  T.register('scale', {
    draw(ctx, V, lt, api) {
      const tod = 'day';
      const hg = S.stepAt(api, 'hang'), sl = S.stepAt(api, 'slide'), rd = S.stepAt(api, 'read');
      // inside the shed: a bright doorway behind, out of focus; plank wall on the right
      const bg = S.cached('scale_bg2', W, H, g => {
        g.fillStyle = '#2a2119'; g.fillRect(0, 0, W, H);
        g.filter = 'blur(30px)';
        const d = g.createLinearGradient(0, 200, 0, 1700); d.addColorStop(0, '#f7e7c6'); d.addColorStop(0.7, '#e7cf9f'); d.addColorStop(1, '#b89a6a');
        g.fillStyle = d; g.fillRect(60, 200, 620, 1500);
        g.fillStyle = '#7b8a5c'; g.fillRect(60, 1320, 620, 380);
        g.fillStyle = '#3b2f22'; for (let i = 0; i < 8; i++) g.fillRect(760 + i * 44, -40, 26, H + 80);
        g.filter = 'none';
        const v = g.createRadialGradient(W * 0.4, H * 0.45, 260, W / 2, H / 2, 1250); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
      });
      S.camera(lt, { dur: api.dur, z0: 1.03, z1: 1.1, y0: 0, y1: -30 });
      S.layer(0.2, () => ctx.drawImage(bg, 0, 0));
      S.motes(lt, { n: 36, seed: 6, x: 60, y: 200, w: 640, h: 1400, alpha: 0.4, vy: 4, size: 2.5 });
      const px = 440, py = 560, hookX = 330;
      const slK = sl ? ease.inOut(prog(lt, sl.lt, sl.lt + sl.dur)) : 0;
      const wx = lerp(560, 905, slK);
      const settle = sl ? prog(lt, sl.lt + sl.dur * 0.8, sl.lt + sl.dur + 1.4) : 0;
      const tilt = lerp(-0.16, 0, slK) + (settle > 0 && settle < 1 ? Math.sin(settle * 13) * 0.03 * (1 - settle) : 0) + Math.sin(lt * 1.3) * 0.003;
      const hangK = hg ? ease.out(prog(lt, hg.lt, hg.lt + 1.6)) : 1;
      const Y = x => py + Math.tan(tilt) * (x - px);          // beam height at x
      S.layer(1.0, () => {
        // lifting cord up out of frame (the hand that holds it is above the picture)
        ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px, py - 8); ctx.lineTo(px + 4, -60); ctx.stroke();
        // the beam: dark wood, brass 秤星
        ctx.save(); ctx.translate(px, py); ctx.rotate(tilt);
        const g = ctx.createLinearGradient(0, -12, 0, 12); g.addColorStop(0, '#9a7a4e'); g.addColorStop(0.5, '#5e432a'); g.addColorStop(1, '#2c1f13');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-160, -12); ctx.lineTo(600, -7); ctx.lineTo(600, 7); ctx.lineTo(-160, 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7a5a36'; ctx.fillRect(-14, -16, 28, 32);                       // the collar where the cord ties on
        for (let i = 0; i < 44; i++) { const x = 70 + i * 12; const big = i % 5 === 0; ctx.fillStyle = big ? '#f5dca4' : 'rgba(245,220,164,0.55)'; ctx.beginPath(); ctx.arc(x, -1, big ? 3 : 1.7, 0, TAU); ctx.fill(); }
        ctx.restore();
        // the weight (秤砣) on its string
        const wy = Y(wx);
        ctx.strokeStyle = '#2a2016'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx, wy + 6); ctx.lineTo(wx, wy + 110); ctx.stroke();
        const sg = ctx.createLinearGradient(wx - 46, 0, wx + 46, 0); sg.addColorStop(0, '#2b2d2f'); sg.addColorStop(0.35, '#8a8c8c'); sg.addColorStop(1, '#1d1f20');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(wx - 18, wy + 108); ctx.lineTo(wx + 18, wy + 108); ctx.lineTo(wx + 46, wy + 190); ctx.quadraticCurveTo(wx, wy + 210, wx - 46, wy + 190); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2b2d2f'; ctx.beginPath(); ctx.arc(wx, wy + 104, 10, 0, TAU); ctx.fill();
        // hook and the bag
        const hy = Y(hookX), sway = Math.sin(lt * 1.05) * 0.025 * (1 - settle * 0.7) + Math.sin(lt * 4.2) * 0.09 * (1 - hangK);   // swings a little once hung
        ctx.save(); ctx.translate(hookX, hy); ctx.rotate(sway);
        ctx.strokeStyle = '#2a2016'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, 46); ctx.arc(-14, 46, 14, 0, Math.PI * 0.9); ctx.stroke();
        // the bag of 冬瓜干 hangs on the hook by its hang hole
        const bw = 360, bh = bw * 1.42, by = 58 + bh / 2 - bh * 0.038;
        S.bag(0, by, bw, { shadow: 0 });
        ctx.strokeStyle = '#2a2016'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-8, 56, 10, Math.PI * 0.1, Math.PI * 0.95); ctx.stroke();
        ctx.restore();
      });
      if (rd) { const k = prog(lt, rd.lt, rd.lt + 1.4); L.serif(V.weight || '三十二斤', 860, 860, { size: 60, color: '#fff3dc', glow: 10, reveal: k }); }
      S.vignette(0.3);
      S.say(api, lt, { xiao: [330, 1300], qin: [750, 1430] }, { backing: true });
    },
    cues(V, api) {
      const out = api.steps.filter(s => s.say).map(s => ({ t: s.lt, type: 'say' }));
      const sl = api.steps.find(s => s.show === 'slide'); if (sl) out.push({ t: sl.lt, type: 'slide', dur: sl.dur });
      return out;
    },
  });
})();
