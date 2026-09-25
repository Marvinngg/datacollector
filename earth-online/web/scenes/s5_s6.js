/* s5_team + s6_loop — 地球 Online, the last two acts.
 *
 * s5_team  standard map → map dims, a chat input rises, "我" types 帮我把一个想法做出来 ↵
 *          the input becomes one teal window → 2 → 4 → 8 → 10 (a 5×2 grid, the film's real crew)
 *          every window streams its own work log; on L19 everything runs flat out;
 *          just before L20 all ten logs halt at once and ten carets wait.
 * s6_loop  the ten windows fold into one task panel → the render bar fills to 87% →
 *          a thumbnail opens inside it that is this very canvas, drawn into itself (true Droste
 *          recursion, several levels deep) → 100% ✓ → back on the map: 02:13, an ember that stays lit →
 *          the quest log one last time (side quest 已触发) → a new ember marker + dashed path →
 *          「游戏进行中」 → pure black.
 *
 * Pure function of time: no cross-frame state. All times derive from E.lineLocal(...) and scene lengths. */
(function () {
  const { P, F, World, ease, prog, clamp, lerp } = E;
  const W = E.W, H = E.H, ctx = E.ctx;
  const cam = World.cam0;
  const HOME = World.home, SP = World.spots;

  // ---------------------------------------------------------------- shared small helpers
  const mix = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });
  const fx = (n, d = 2) => n.toFixed(d);
  const pad2 = n => String(n).padStart(2, '0');
  const S5 = () => E.scene('s5_team');
  const S6 = () => E.scene('s6_loop');

  /** the standard map state (identical to the s3/s4 hand-off): cam0, fog .85, home reveal, gold 挣钱 marker, player.
   *  T is absolute time so fog drift / player pulse stay continuous across scene cuts. */
  function mapState(T, o = {}) {
    const reveal = [World.homeReveal()].concat(o.reveal || []);
    World.draw(cam, { fog: 0.85, reveal, t: T });
    World.marker(cam, SP.money.x, SP.money.y, { color: P.gold, label: '挣钱', drop: 1 });
    World.player(cam, HOME.x, HOME.y, { t: T });
  }
  function veil(a, color = P.bg) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // ---------------------------------------------------------------- timeline data used inside the logs
  // (the logs quote the real production: real line durations, real frame counts, real scene ranges)
  function tlFacts() {
    const TL = E.TL;
    return {
      dur: TL.duration, frames: Math.round(TL.duration * TL.fps), nScenes: TL.scenes.length, nLines: TL.lines.length,
      line: id => TL.lines.find(l => l.id === id) || { dur: 2.5, start: 0 },
      scene: id => TL.scenes.find(s => s.id === id) || { start: 0, end: 1 },
    };
  }

  // ---------------------------------------------------------------- the crew (10 real agents)
  // Each role: title, detail, rate (log lines per work-second), base lines, filler(j) for everything after.
  const QUOTES = ['这游戏没有存档', '新手村待了十八年', '隐藏任务要自己找', '别人的攻略不一定适合你', '体力条每天自动回满', '主线任务：活着', '出生点决定难度'];
  const SITES = ['zhihu.com', 'douban.com', 'tieba.baidu.com', 'bilibili.com', 'weibo.com', 'jianshu.com'];
  const h = (a, b) => E.hash2(a * 7 + 3, b * 13 + 1);
  const pick = (j, k, arr) => arr[Math.floor(h(j, k) * arr.length) % arr.length];
  function renderLine(j, ids, k) {
    const f = tlFacts(), sc = f.scene(ids[j % ids.length]);
    const t = sc.start + (sc.end - sc.start) * h(j, k);
    return `render t=${fx(t)}s  frame ${Math.round(t * 30)}`;
  }
  function makeRoles() {
    const f = tlFacts();
    const L = id => fx(f.line(id).dur);
    return [
      { title: '总导演', detail: '统筹与剪辑', rate: 2.0, lines: [
        '› 帮我把一个想法做出来', '收到。先把想法读三遍', `拆成 ${f.nScenes} 幕 · ${f.nLines} 句旁白`, '分派  调研 ×3', '分派  配音 ×1',
        '分派  画面 ×3', '分派  配乐 ×1 · 审片 ×1', '写入  BRIEF.md  交接规则', `timeline  ${fx(f.dur, 1)}s  ✓`,
        '检查  s2→s3 交接  Δ 0px', '检查  s4→s5 交接  Δ 0px', '剪辑  s4 尾部 -0.4s', `合成  ${f.frames} 帧  30fps`],
        filler: j => { const sc = 's' + Math.floor(h(j, 21) * 7), id = 'L' + pad2(1 + Math.floor(h(j, 22) * 24));
          return pick(j, 23, [`合并  ${sc} 第 ${2 + Math.floor(h(j, 24) * 6)} 版`, `复核  ${id} 字幕时长`, `退回  ${sc} → 画面`, `审片  ${sc} → 通过`,
            `ffmpeg concat  seg${Math.floor(h(j, 25) * 4)}`, `对齐  ${id} 起点 ${fx(f.line(id).start)}s`, `检查  ${sc} 首帧 Δ 0px`, `mix  VO + 配乐  -14 LUFS`]); } },
      { title: '调研', detail: '地球 Online 的中文叙事', rate: 2.9, lines: [
        'WebSearch  地球online 差评体', 'WebSearch  地球online 新手教程', 'fetch  zhihu.com/question/… 403', 'fetch  douban.com/group/… 200',
        '摘录：「不看攻略，这个游戏…」', '摘录：「出生点决定难度」', 'fetch  tieba.baidu.com/p/… 200', '归类  自嘲 / 系统提示 / 存档',
        '统计  427 条 → 去重 186', '高频  主线 · 支线 · 存档', '写入  notes/earth_online.md'],
        filler: j => j % 3 === 2 ? `摘录：「${QUOTES[j % QUOTES.length]}」` : `fetch  ${SITES[(j * 5) % SITES.length]}/… ${h(j, 2) < 0.2 ? 403 : 200}` },
      { title: '调研', detail: '经典作品怎么讲人生', rate: 2.5, lines: [
        'WebSearch  Parisian Love 2010', 'fetch  youtube.com/watch?v=… 200', '拆解  52s · 只有一个搜索框', 'WebSearch  Up 开场 Married Life',
        '笔记  4 分钟 · 零对白', 'WebSearch  Kurzgesagt 叙事节奏', 'WebSearch  Saul Bass 片头设计', '摘录：「用物件代替台词」',
        '对照  7 部作品 × 5 种手法', '写入  notes/classics.md'],
        filler: j => [`WebSearch  ${['一镜到底 人生', '蒙太奇 时间流逝', '片尾 回环 结构', '界面叙事 案例'][j % 4]}`, `fetch  vimeo.com/… 200`, `笔记  第 ${j % 9 + 2} 条手法`][j % 3] },
      { title: '调研', detail: '克制的叙事方法', rate: 2.3, lines: [
        "WebSearch  show don't tell 范例", 'WebSearch  海明威 冰山理论', '规则 1  不说“着迷”这个词', '规则 2  用时间戳代替形容词',
        '规则 3  旁白不重复屏幕文字', '检查  v3 旁白  删去 41 字', '摘录：「让观众自己得出结论」', 'fetch  一篇讲留白的文章 … 200', '写入  notes/restraint.md'],
        filler: j => [`检查  L${pad2(1 + (j * 5) % 24)}  形容词 ${j % 3}`, `WebSearch  留白 ${['动画', '短片', '广告', '小说'][j % 4]}`, `删去  ${1 + j % 6} 字`][j % 3] },
      { title: '配音', detail: '选角与发音质检', rate: 2.1, lines: [
        'kokoro  试听 sid 0–102  ×16', 'kokoro sid=60  F0=117Hz', '选定  sid=60 · 男声 · 放松', `gen L01  ${L('L01')}s  ✓`,
        'ASR 校验 CER 2.1%', 'gen L12  “一锅汤” 重音 ✗', 'gen L12  重新生成  ✓', 'ASR 校验 CER 0.0%', '语速  3.6 字/秒',
        `gen L24  ${L('L24')}s  ✓`, '写入  build/timeline.json'],
        filler: j => { const id = 'L' + pad2(1 + (j * 7) % 24); return j % 2 ? `ASR 校验 CER ${fx(h(j, 5) * 2.4, 1)}%` : `gen ${id}  ${L(id)}s  ✓`; } },
      { title: '画面', detail: '新手村与空任务栏', rate: 2.7, lines: [
        'typed("高考 倒计时 100 天")', '日志网格  等宽 22px', renderLine(0, ['s1_school'], 1), 'World.draw(fog=0.85)', 'questBox("", caret)',
        renderLine(1, ['s2_empty'], 1), 'sheet s1_school  n=16'],
        filler: j => j % 4 === 3 ? `sheet ${['s0_boot', 's1_school', 's2_empty'][j % 3]}  n=16` : renderLine(j, ['s0_boot', 's1_school', 's2_empty'], 11) },
      { title: '画面', detail: '挣钱与别人的任务', rate: 2.8, lines: [
        'World.marker(drop=0.62)', renderLine(0, ['s3_money'], 2), '通知  第 9 条  alpha 0.35', '卡片  楼下面馆老板', 'clockHUD("01:40")',
        'fizzle  08:00', renderLine(1, ['s4_others'], 2)],
        filler: j => j % 4 === 3 ? `sheet ${['s3_money', 's4_others'][j % 2]}  n=16` : renderLine(j, ['s3_money', 's4_others'], 12) },
      { title: '画面', detail: 'AI 队伍与回环', rate: 2.6, lines: [
        'grid 5×2  gap 20px', 'split 1→2→4→8→10', 'drawImage(E.canvas, …)', '递归  depth 5 · scale 0.2', renderLine(0, ['s6_loop'], 3),
        'clockHUD("02:13")', 'sheet s6_loop  n=20'],
        filler: j => j % 4 === 3 ? `sheet ${['s5_team', 's6_loop'][j % 2]}  n=16` : renderLine(j, ['s5_team', 's6_loop'], 13) },
      { title: '配乐与音效', detail: '', rate: 2.2, lines: [
        'tempo 72 bpm · F 大调', 'chord Fmaj7 → Em7', 'pad  lowpass 1.2kHz', 'cue  key ×10 · enter', 'cue  window ×5', 'duck VO -9dB',
        'chord Dm9 → Cmaj7', 'sidechain  attack 30ms', 'bounce  music.wav'],
        filler: j => { const types = ['ping', 'ping_dull', 'whoosh', 'drop', 'check', 'tick', 'spark']; return j % 3 === 2 ? `chord ${['Am7', 'Fmaj7', 'Gsus4', 'Cmaj9'][j % 4]} → ${['Em7', 'Dm9', 'G', 'Fmaj7'][(j + 1) % 4]}` : `cue  ${types[j % types.length]}  t=${fx(h(j, 9) * f.dur)}s`; } },
      { title: '审片', detail: '', rate: 1.8, lines: [
        'sheet s0_boot  ✓', 'sheet s1_school  ✓', 'sheet s2_empty  ✓', 'sheet s3_money  ✓', 's4 卡片太挤 → 退回画面', 'sheet s4_others  ✓',
        '字幕安全区 170px  ✓', '单帧耗时 max 41ms  ✓'],
        filler: j => j % 3 === 2 ? `对齐  L${pad2(1 + (j * 3) % 24)} ↔ 画面  ✓` : `still t=${fx(h(j, 4) * f.dur)}s  ✓` },
    ];
  }
  let ROLES = null;
  const roles = () => ROLES || (ROLES = makeRoles());   // static content, cached once (not per-frame state)

  // ---------------------------------------------------------------- grid geometry
  const GM = { x0: 64, x1: W - 64, y0: 112, y1: 900, gap: 20 };
  function cell(cols, rows, c, r) {
    const w = (GM.x1 - GM.x0 - GM.gap * (cols - 1)) / cols, hh = (GM.y1 - GM.y0 - GM.gap * (rows - 1)) / rows;
    return { x: GM.x0 + c * (w + GM.gap), y: GM.y0 + r * (hh + GM.gap), w, h: hh };
  }
  const DIALOG = { x: W / 2 - 440, y: 776, w: 880, h: 84 };
  const SOLO = { x: W / 2 - 480, y: 176, w: 960, h: 560 };
  // window ids spawn in cell-division order; slot = final reading position in the 5×2 grid
  // stage 1: w0 | stage 2: w0 w1 | stage 4: + w2 w3 (below) | stage 8: + w4..w7 (right of each) | stage 10: + w8 w9
  const PARENT = [-1, 0, 0, 1, 0, 1, 2, 3, 5, 7];
  const BORN = [1, 2, 3, 3, 4, 4, 4, 4, 5, 5];           // stage index at which each window is born
  const LAYOUT = [
    null,
    [SOLO],
    [cell(2, 1, 0, 0), cell(2, 1, 1, 0)],
    [cell(2, 2, 0, 0), cell(2, 2, 1, 0), cell(2, 2, 0, 1), cell(2, 2, 1, 1)],
    [cell(4, 2, 0, 0), cell(4, 2, 2, 0), cell(4, 2, 0, 1), cell(4, 2, 2, 1), cell(4, 2, 1, 0), cell(4, 2, 3, 0), cell(4, 2, 1, 1), cell(4, 2, 3, 1)],
    [cell(5, 2, 0, 0), cell(5, 2, 2, 0), cell(5, 2, 0, 1), cell(5, 2, 2, 1), cell(5, 2, 1, 0), cell(5, 2, 3, 0), cell(5, 2, 1, 1), cell(5, 2, 3, 1), cell(5, 2, 4, 0), cell(5, 2, 4, 1)],
  ];
  const SLOT = [0, 2, 5, 7, 1, 3, 6, 8, 4, 9];            // window id → final slot (= role index)
  const NALIVE = [0, 1, 2, 4, 8, 10];
  function rectAt(w, s) {
    if (s === 0) return w === 0 ? DIALOG : null;
    if (BORN[w] > s) return rectAt(PARENT[w], s);
    return LAYOUT[s][w];
  }

  // ---------------------------------------------------------------- s5 timing (all relative to lines / scene length)
  const PROMPT = '帮我把一个想法做出来';
  function T5() {
    const sc = S5(), D = sc.end - sc.start;
    const L17 = E.lineLocal('L17'), L18 = E.lineLocal('L18'), L19 = E.lineLocal('L19'), L20 = E.lineLocal('L20');
    const dimIn = [0.15, 0.95];
    const riseIn = [Math.min(0.3, L17.start * 0.12), Math.min(0.3, L17.start * 0.12) + 0.55];
    // typing: human rhythm, finishes just before L17 so the window is born on "后来"
    const chars = Array.from(PROMPT);
    const iv = chars.map((_, i) => 0.105 + 0.06 * E.hash2(i + 3, 17) + (i === 2 || i === 5 ? 0.09 : 0));
    const total = iv.reduce((a, b) => a + b, 0);
    const type0 = Math.max(riseIn[1] + 0.05, L17.start - total - 0.28);
    const keys = []; let acc = type0; for (const d of iv) { acc += d; keys.push(acc); }
    const enter = keys[keys.length - 1] + 0.26;
    const A = enter + 0.08, B = Math.max(A + 3.2, L18.end - 0.45);
    const stages = [-1e9, A, lerp(A, B, 0.3), lerp(A, B, 0.58), lerp(A, B, 0.8), B];   // 0: dialog, 1..5: 1,2,4,8,10 windows
    const stop = L20.start - 0.32;
    const busy0 = L19.start - 0.1, busy1 = L19.start + 0.7;
    return { D, L17, L18, L19, L20, dimIn, riseIn, type0, keys, enter, stages, stop, busy0, busy1 };
  }
  // global work clock: ∫ speed dt, speed piecewise linear (0 before the first window, 1 normal, 2.7 flat out, 0 after stop)
  function workAt(t, tm) {
    const pts = [[tm.stages[1], 0], [tm.stages[1] + 0.01, 1], [tm.busy0, 1], [tm.busy1, 2.7], [tm.stop - 0.06, 2.7], [tm.stop, 0]];
    if (t <= pts[0][0]) return 0;
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, va] = pts[i], [b, vb] = pts[i + 1];
      if (t <= a) break;
      const e = Math.min(t, b), ve = va + (vb - va) * (e - a) / (b - a || 1);
      s += (va + ve) / 2 * (e - a);
    }
    return s;
  }
  function stageOf(t, tm) { let k = 0; for (let s = 1; s < tm.stages.length; s++) if (t >= tm.stages[s]) k = s; return k; }
  const SPLIT = 0.62;
  function winRect(w, t, tm) {
    const k = stageOf(t, tm);
    if (k === 0) return rectAt(w, 0);
    const e = ease.inOut(prog(t, tm.stages[k], tm.stages[k] + (k === 1 ? 0.7 : SPLIT)));
    const b = rectAt(w, k);
    let a;
    if (BORN[w] === k && k > 1) {
      // newborn: a zero-width sliver on the parent's far edge, so it grows out of the parent as the parent
      // makes room — the two never overlap, like a divider sliding open
      const P0 = rectAt(PARENT[w], k - 1), dx = (b.x + b.w / 2) - (P0.x + P0.w / 2), dy = (b.y + b.h / 2) - (P0.y + P0.h / 2);
      a = Math.abs(dx) > Math.abs(dy) ? { x: P0.x + P0.w, y: P0.y, w: 0, h: P0.h } : { x: P0.x, y: P0.y + P0.h, w: P0.w, h: 0 };
    } else a = rectAt(w, k - 1);
    return mix(a, b, e);
  }

  // ---------------------------------------------------------------- drawing: one agent window
  const TB = 46, PADX = 18, FS = 15, LH = 23, RAD = 10;
  const monoF = `400 ${FS}px ${F.mono}`;
  function drawLogLine(str, x, y, color, a) {
    ctx.globalAlpha = a;
    ctx.font = monoF;
    const sp = str.indexOf('  ');
    let xx = x;
    if (sp > 0 && /^[A-Za-z›]/.test(str)) {
      const head = str.slice(0, sp);
      ctx.fillStyle = P.teal; ctx.globalAlpha = a * 0.9; ctx.fillText(head, xx, y);
      xx += ctx.measureText(head).width; str = str.slice(sp); ctx.globalAlpha = a;
    }
    if (str.endsWith('✓')) {
      const body = str.slice(0, -1);
      ctx.fillStyle = color; ctx.fillText(body, xx, y);
      ctx.fillStyle = P.ok; ctx.fillText('✓', xx + ctx.measureText(body).width, y);
    } else { ctx.fillStyle = color; ctx.fillText(str, xx, y); }
  }
  /** o: alpha, fillA, contentA, flash, work (lines), stopA (0..1 prompt slide-in), T (abs, caret), idle (0..1) */
  function drawWindow(role, idx, r, o) {
    if (o.alpha <= 0.002 || r.w < 4 || r.h < 4) return;
    const { x, y, w, h: hh } = r;
    ctx.save();
    ctx.globalAlpha = o.alpha * o.fillA;
    E.rrect(x, y, w, hh, o.rad == null ? RAD : o.rad);
    ctx.fillStyle = P.bg2; ctx.fill();
    ctx.save(); ctx.clip();
    if (o.tint) { ctx.globalAlpha = o.alpha * 0.14 * o.tint; ctx.fillStyle = P.teal; ctx.fill(); }
    const ca = o.alpha * o.contentA;
    if (ca > 0.002) {
      // title bar
      ctx.globalAlpha = ca * 0.06; ctx.fillStyle = P.teal; ctx.fillRect(x, y, w, TB);
      ctx.globalAlpha = ca; ctx.fillStyle = P.line; ctx.fillRect(x, y + TB - 1, w, 1);
      // progress hairline under the title bar
      const pr = ((o.work / 11) + E.hash2(idx, 41)) % 1;
      ctx.globalAlpha = ca * lerp(0.85, 0.35, o.idle); ctx.fillStyle = P.teal; ctx.fillRect(x, y + TB - 2, w * pr, 2);
      // status dot: filled + breathing while running, hollow ring while waiting
      const pulse = 0.55 + 0.45 * Math.sin(o.T * 5.2 + idx * 1.3);
      if (o.idle < 1) { ctx.save(); ctx.globalAlpha = ca * (1 - o.idle) * pulse; ctx.shadowColor = P.teal; ctx.shadowBlur = 10; ctx.fillStyle = P.teal; ctx.beginPath(); ctx.arc(x + 22, y + TB / 2, 4.5, 0, 7); ctx.fill(); ctx.restore(); }
      if (o.idle > 0) { ctx.globalAlpha = ca * o.idle * 0.9; ctx.strokeStyle = P.teal; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 22, y + TB / 2, 4.2, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = ca; ctx.font = `500 16px ${F.sans}`; ctx.fillStyle = P.ink; ctx.textBaseline = 'alphabetic';
      ctx.fillText(role.title, x + 38, y + 29);
      if (role.detail) {
        const tw = ctx.measureText(role.title).width;
        ctx.font = `400 16px ${F.sans}`; ctx.fillStyle = P.dim; ctx.fillText(' · ' + role.detail, x + 38 + tw, y + 29);
      }
      ctx.font = `400 13px ${F.mono}`; ctx.fillStyle = P.faint; ctx.textAlign = 'right';
      ctx.fillText(pad2(idx + 1), x + w - 16, y + 29); ctx.textAlign = 'left';
      // body: newest line at the bottom, older lines scroll up and fade near the top
      const top = y + TB, yb = y + hh - 20;
      const n = Math.floor(o.work) + 1, f = o.work - Math.floor(o.work);
      const s = o.stopA > 0 ? 1 : ease.out(clamp(f / 0.34));
      const lift = ease.out(clamp(o.stopA)) * LH;
      const maxRows = Math.ceil((hh - TB) / LH) + 1;
      for (let row = 0; row < Math.min(n, maxRows); row++) {
        const j = n - 1 - row;
        const ly = yb - row * LH + (1 - s) * LH - lift;
        const fadeTop = clamp((ly - top - LH * 0.6) / (LH * 1.6));
        if (fadeTop <= 0) continue;
        let str = j < role.lines.length ? role.lines[j] : role.filler(j - role.lines.length);
        let a = ca * fadeTop;
        if (row === 0 && o.stopA <= 0) { const ch = Array.from(str); str = ch.slice(0, Math.ceil(ch.length * clamp(f / 0.3 + 0.02))).join(''); a *= clamp(s * 1.4); }
        const newest = row === 0;
        drawLogLine(str, x + PADX, ly, newest ? P.ink : P.dim, a * (newest ? 1 : lerp(0.95, 0.75, o.idle)));
      }
      // waiting prompt: › and a block caret, blinking in unison across all windows
      if (o.stopA > 0) {
        const py = yb + (1 - ease.out(clamp(o.stopA))) * LH;
        ctx.globalAlpha = ca * clamp(o.stopA * 1.5); ctx.font = `700 ${FS}px ${F.mono}`; ctx.fillStyle = P.teal;
        ctx.fillText('›', x + PADX, py);
        if (E.caretOn(o.T, 1.05)) { ctx.fillRect(x + PADX + 16, py - 14, 9, 18); }
      }
    }
    ctx.restore();
    // border (after the clip so the full stroke shows); a teal flash when a window is born
    ctx.globalAlpha = o.alpha;
    ctx.lineWidth = 1.5; ctx.strokeStyle = P.teal;
    ctx.globalAlpha = o.alpha * clamp(lerp(0.34, 0.2, o.idle) + 0.6 * o.flash) * (1 - (o.tint || 0));
    E.rrect(x, y, w, hh, o.rad == null ? RAD : o.rad); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- s5 frame model (shared by s6 for the hand-off)
  function gridState(t, tm) {
    const k = stageOf(t, tm), R = roles(), g = workAt(t, tm), out = [];
    const stopA = t >= tm.stop ? prog(t, tm.stop, tm.stop + 0.22) + 1e-6 : 0;
    const idle = ease.out(prog(t, tm.stop, tm.stop + 0.3));
    for (let w = 0; w < 10; w++) {
      if (BORN[w] > k) continue;
      const b = tm.stages[BORN[w]];
      const born = prog(t, b, b + SPLIT);
      const work = Math.max(0, (g - workAt(b, tm)) * R[SLOT[w]].rate * (1 + 0.12 * (BORN[w] - 1)));
      out.push({ w, role: R[SLOT[w]], idx: SLOT[w], rect: winRect(w, t, tm), fillA: w === 0 ? 1 : clamp(born * 2.2), contentA: w === 0 ? prog(t, b + 0.25, b + 0.6) : prog(t, b + 0.18, b + SPLIT), flash: 1 - ease.out(prog(t, b, b + 0.9)), work, stopA, idle });
    }
    const steps = out.reduce((s, o) => s + Math.floor(o.work), 0);
    return { k, wins: out, steps, n: NALIVE[k], idle };
  }
  function drawHeader(gs, a, T) {
    if (a <= 0) return;
    const y = 84, idle = gs.idle;
    E.text('AI 队伍', GM.x0, y, { size: 19, weight: 500, color: P.ink, alpha: a, spacing: 3 });
    const x2 = GM.x0 + E.measure('AI 队伍', { size: 19, weight: 500, spacing: 3 }) + 26;
    const pulse = 0.6 + 0.4 * Math.sin(T * 5.2);
    if (idle < 1) E.dot(x2, y - 7, 4.5, P.teal, { alpha: a * (1 - idle) * pulse, glow: 10 });
    if (idle > 0) E.ring(x2, y - 7, 4.2, P.teal, { alpha: a * idle, lineWidth: 1.5 });
    E.text(`${gs.n} 个 Agent 并行中`, x2 + 16, y, { size: 19, color: P.dim, alpha: a * (1 - idle) });
    E.text(`${gs.n} 个 Agent · 等待指令`, x2 + 16, y, { size: 19, color: P.teal, alpha: a * idle });
    E.text(`已执行 ${gs.steps.toLocaleString('en-US')} 步`, GM.x1, y, { size: 16, family: F.mono, color: P.dim, alpha: a, align: 'right' });
    ctx.save(); ctx.globalAlpha = a * 0.7; ctx.fillStyle = P.line; ctx.fillRect(GM.x0, y + 12, GM.x1 - GM.x0, 1); ctx.restore();
  }
  function drawGrid(t, tm, T, o = {}) {
    const gs = gridState(t, tm);
    for (const s of gs.wins) {
      drawWindow(s.role, s.idx, o.rectOf ? o.rectOf(s) : s.rect, {
        alpha: o.alphaOf ? o.alphaOf(s) : 1, fillA: s.fillA, contentA: s.contentA * (o.contentOf ? o.contentOf(s) : 1),
        flash: s.flash, work: s.work, stopA: s.stopA, idle: s.idle, T, tint: o.tintOf ? o.tintOf(s) : 0,
        rad: o.radOf ? o.radOf(s) : s.w === 0 && gs.k === 1 ? lerp(20, RAD, prog(t, tm.stages[1], tm.stages[1] + 0.5)) : RAD,
      });
    }
    return gs;
  }

  // ---------------------------------------------------------------- the chat input
  function drawDialog(lt, tm, T) {
    const rise = ease.out(prog(lt, tm.riseIn[0], tm.riseIn[1]));
    const sent = prog(lt, tm.enter, tm.enter + 0.35);
    const a = rise * (lt < tm.stages[1] ? 1 : 0);
    const ta = rise * (1 - ease.out(sent));
    if (a <= 0 && ta <= 0) return;
    const r = DIALOG, y = r.y + (1 - rise) * 36;
    ctx.save();
    if (a <= 0) { E.text(Array.from(PROMPT).join(''), r.x + 36, y + r.h / 2 + 11 - ease.out(sent) * 14, { size: 29, color: P.ink, alpha: ta }); ctx.restore(); return; }
    ctx.globalAlpha = a;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    E.rrect(r.x, y, r.w, r.h, 20); ctx.fillStyle = P.bg2; ctx.fill(); ctx.restore();
    E.rrect(r.x, y, r.w, r.h, 20); ctx.lineWidth = 1.5; ctx.strokeStyle = P.ink; ctx.globalAlpha = a * lerp(0.2, 0.5, sent); ctx.stroke();
    ctx.globalAlpha = a;
    const n = tm.keys.filter(k => lt >= k).length;
    const str = Array.from(PROMPT).slice(0, n).join('');
    const cy = y + r.h / 2 + 11;
    if (n === 0) E.text('给 AI 队伍发一条消息', r.x + 36, cy, { size: 29, color: P.faint, alpha: a });
    const tl = 1 - ease.out(sent);
    E.text(str, r.x + 36, cy - (1 - tl) * 14, { size: 29, weight: 400, color: P.ink, alpha: a * tl });
    if (lt < tm.enter && E.caretOn(lt - tm.type0 + 10, 1.2)) {
      const cw = str ? E.measure(str, { size: 29 }) + 4 : 0;
      ctx.fillStyle = P.ink; ctx.fillRect(r.x + 36 + cw, y + r.h / 2 - 17, 2.5, 34);
    }
    // send button: faint until there is text, teal while there is, a small press on enter
    const bx = r.x + r.w - 44, by = y + r.h / 2;
    const press = 1 - 0.12 * Math.sin(Math.PI * prog(lt, tm.enter - 0.02, tm.enter + 0.16));
    ctx.globalAlpha = a * (n ? 1 : 0.28);
    ctx.fillStyle = n ? P.teal : P.dim; ctx.beginPath(); ctx.arc(bx, by, 22 * press, 0, 7); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by + 9 * press); ctx.lineTo(bx, by - 9 * press); ctx.moveTo(bx - 7 * press, by - 2 * press); ctx.lineTo(bx, by - 9 * press); ctx.lineTo(bx + 7 * press, by - 2 * press); ctx.stroke();
    ctx.restore();
  }

  // ================================================================ s5_team
  E.register('s5_team', {
    draw(c, lt, sc, T) {
      const tm = T5();
      // 1. the standard map, dimming under the incoming UI (static backdrop once the full grid covers it)
      const dim = 0.55 * ease.inOut(prog(lt, tm.dimIn[0], tm.dimIn[1])) + 0.3 * ease.inOut(prog(lt, tm.stages[2], tm.stages[4]));
      if (lt >= tm.stages[5] + SPLIT) blit(backdrop('map'));
      else { mapState(T); veil(dim); }
      E.questBox('挣钱', { alpha: (1 - 0.55 * ease.inOut(prog(lt, tm.dimIn[0], tm.dimIn[1]))) * (1 - ease.inOut(prog(lt, tm.stages[1] - 0.1, tm.stages[1] + 0.4))) });
      // 2. the chat input, then the team
      drawDialog(lt, tm, T);
      if (lt >= tm.stages[1]) {
        const gs = drawGrid(lt, tm, T);
        drawHeader(gs, ease.out(prog(lt, tm.stages[1] + 0.45, tm.stages[1] + 1.0)), T);
      }
    },
    cues(sc) {
      const tm = T5(), out = [];
      tm.keys.forEach(k => out.push({ t: k, type: 'key' }));
      out.push({ t: tm.enter, type: 'enter' });
      for (let s = 1; s <= 5; s++) out.push({ t: tm.stages[s], type: 'window', n: NALIVE[s] });
      return out;
    },
  });

  // ================================================================ s6_loop
  const TASK = '任务：把这些零零碎碎的想法，做成一部短片';
  const CELLS = 20;
  function T6() {
    const sc = S6(), D = sc.end - sc.start;
    const L21 = E.lineLocal('L21'), L22 = E.lineLocal('L22'), L23 = E.lineLocal('L23'), L24 = E.lineLocal('L24');
    const c0 = clamp(L21.start - 1.15, 0.25, 10), c1 = c0 + 1.3;
    const type0 = Math.max(c1 - 0.2, L21.start + 0.15), cps = 13;
    const bar0 = L22.start + 0.15, bar87 = Math.max(bar0 + 1.5, L22.end - 0.1);
    const th0 = L23.start - 0.45, th1 = th0 + 0.75;
    // the dive: one full Droste level (zoom ×5 about the recursion's fixed point) lands on an identical frame
    const dive0 = Math.max(th1 + 0.15, L23.start + 0.4), dive1 = dive0 + 2.4;
    const f0 = dive0 + 0.3, f1 = dive1 + 0.3;
    const out0 = Math.max(f1 + 0.6, L24.start - 1.25), out1 = out0 + 1.0;
    const clock = Math.max(out0 + 0.5, L24.start - 0.45);
    const ember0 = clock - 0.1, ember1 = ember0 + 1.4;
    const black = D - 0.3, cardOut = black - 0.9, card0 = cardOut - 3.6, mapOut0 = card0 - 0.5;
    const log0 = L24.end + 0.35, span = Math.max(2.5, mapOut0 - log0);
    const logL1 = log0 + 0.25, logL2 = log0 + 0.75, trig = log0 + Math.min(1.7, span * 0.3), logOut = log0 + span * 0.5;
    const drop0 = logOut + 0.25, dropD = 0.75, path0 = drop0 + 0.5, path1 = path0 + 1.1;
    return { D, L21, L22, L23, L24, c0, c1, type0, cps, bar0, bar87, th0, th1, dive0, dive1, f0, f1, out0, out1, clock, ember0, ember1, black, cardOut, card0, mapOut0, log0, logL1, logL2, trig, logOut, drop0, dropD, path0, path1 };
  }
  // task panel geometry; k = thumbnail reveal (0: narrow, 1: with thumbnail)
  const THW = 384, THH = 216, PPAD = 40, COLW = 668;
  function panelGeom(k) {
    const narrowW = COLW + PPAD * 2, wideW = narrowW + THW + 36;
    const w = lerp(narrowW, wideW, k), hh = lerp(232, THH + PPAD * 2 - 8, k);
    const x = W / 2 - w / 2, y = 452 - hh / 2;
    return { x, y, w, h: hh, cx: x + PPAD + lerp(0, THW + 36, k), th: { x: x + PPAD, y: y + hh / 2 - THH / 2, w: THW, h: THH } };
  }
  const BAR = { lblW: 92, gap: 5, pctW: 84, h: 30 };
  function barCell(g, i) {
    const cw = (COLW - BAR.lblW - BAR.pctW - BAR.gap * (CELLS - 1)) / CELLS;
    return { x: g.cx + BAR.lblW + i * (cw + BAR.gap), y: g.y + g.h / 2 - 108 + 152, w: cw, h: BAR.h };
  }
  function progressAt(lt, tm) {
    if (lt < tm.bar0) return 0;
    if (lt < tm.f0) {
      // a render bar that moves in believable steps rather than a smooth tween
      const k = prog(lt, tm.bar0, tm.bar87), steps = 23;
      const q = Math.floor(k * steps), fr = k * steps - q;
      const kk = (q + ease.out(clamp(fr * 2.2))) / steps;
      return 0.87 * ease.out(kk) + (lt > tm.bar87 ? 0.004 * prog(lt, tm.bar87, tm.f0) : 0);
    }
    return lerp(0.874, 1, ease.inOut(prog(lt, tm.f0, tm.f1)));
  }
  function drawTaskPanel(lt, tm, a, T, noShadow) {
    if (a <= 0) return null;
    const k = ease.inOut(prog(lt, tm.th0, tm.th1));
    const g = panelGeom(k);
    if (!noShadow) panelShadow(g, a);
    ctx.save(); ctx.globalAlpha = a;
    E.rrect(g.x, g.y, g.w, g.h, 14); ctx.fillStyle = P.bg2; ctx.fill();
    E.rrect(g.x, g.y, g.w, g.h, 14); ctx.lineWidth = 1.5; ctx.strokeStyle = P.teal; ctx.globalAlpha = a * 0.4; ctx.stroke();
    ctx.globalAlpha = a;
    if (k > 0) {
      const r = g.th, fa = a * ease.out(prog(lt, tm.th0 + 0.25, tm.th1));
      ctx.globalAlpha = fa; ctx.fillStyle = P.bg; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = fa * 0.6; ctx.strokeStyle = P.teal; ctx.lineWidth = 1.5; ctx.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
      ctx.globalAlpha = a;
    }
    const p = progressAt(lt, tm), done = lt >= tm.f1;
    const doneK = ease.out(prog(lt, tm.f1, tm.f1 + 0.5));
    const cx = g.cx, top = g.y + g.h / 2 - 108;
    // meta row
    E.text('TASK 001', cx, top + 30, { size: 14, family: F.mono, color: P.teal, alpha: a * 0.9, spacing: 3 });
    E.text('10 AGENTS', cx + COLW, top + 30, { size: 14, family: F.mono, color: P.faint, alpha: a, spacing: 3, align: 'right' });
    // task line, typed as it is dispatched
    const typed = E.typed(TASK, lt, tm.type0, tm.cps);
    E.text(typed, cx, top + 92, { size: 32, weight: 500, color: P.ink, alpha: a });
    if (lt < E.typedDone(TASK, tm.type0, tm.cps) + 0.6 && lt > tm.type0 - 0.3 && E.caretOn(lt, 1.2)) {
      const cw = typed ? E.measure(typed, { size: 32, weight: 500 }) + 5 : 0;
      ctx.fillStyle = P.ink; ctx.fillRect(cx + cw, top + 60, 3, 40);
    }
    // bar row: label · 20 cells · percent
    const barA = a * ease.out(prog(lt, tm.bar0 - 0.35, tm.bar0 + 0.15));
    const by = top + 152, cw = barCell(g, 0).w;
    E.text('渲染中', cx, by + 23, { size: 22, color: P.dim, alpha: barA * (1 - doneK) });
    E.text('已完成', cx, by + 23, { size: 22, color: P.ok, alpha: barA * doneK });
    for (let i = 0; i < CELLS; i++) {
      const fill = clamp(p * CELLS - i);
      const x = barCell(g, i).x;
      // track cells appear as the agent that owns them lands (two cells per agent)
      const own = Math.floor(i / 2), landed = prog(lt, tm.c0 + own * 0.045 + 0.7, tm.c0 + own * 0.045 + 0.8);
      ctx.globalAlpha = a * 0.14 * landed; ctx.fillStyle = P.teal; ctx.fillRect(x, by, cw, 30);
      if (fill > 0) { ctx.globalAlpha = barA * (0.35 + 0.65 * fill); ctx.fillStyle = done ? lerpCol(doneK) : P.teal; ctx.fillRect(x, by, cw, 30); }
    }
    ctx.globalAlpha = 1;
    E.text(`${Math.floor(p * 100 + 1e-6)}%`, cx + COLW, by + 26, { size: 28, family: F.mono, color: doneK > 0.5 ? P.ok : P.ink, alpha: barA, align: 'right' });
    ctx.restore();
    return { g, k, p };
  }
  const lerpCol = k => k > 0.5 ? P.ok : P.teal;

  /** the Droste thumbnail. The finished canvas is snapshotted once; level k of the recursion is that
   *  snapshot scaled by s^k about the fixed point fp of the recursion, drawn outermost-first so each
   *  level lands inside the previous one's slot. Real recursion of the real frame, every frame.
   *  src: the region of the snapshot that holds one whole level (full screen normally, level 1 during the dive). */
  let SNAP = null;
  function droste(th, a, o = {}) {
    if (a <= 0 || th.w < 8) return;
    const s = th.w / W, fp = fixedPoint(th);
    const src = o.src || { x: 0, y: 0, w: W, h: H };
    const snap = SNAP || (SNAP = Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const sc = snap.getContext('2d');
    sc.globalCompositeOperation = 'copy'; sc.drawImage(E.canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = a;
    let k = s;
    for (let d = 0; d < 7; d++, k *= s) {
      const dst = { x: fp.x + (src.x - fp.x) * k, y: fp.y + (src.y - fp.y) * k, w: src.w * k, h: src.h * k };
      if (dst.w < 1.5) break;
      ctx.drawImage(snap, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);
    }
    ctx.restore();
  }
  // fixed point of p ↦ th.xy + s·p (the map that places the frame inside its own thumbnail)
  function fixedPoint(th) { const s = th.w / W; return { x: th.x / (1 - s), y: th.y / (1 - s) }; }

  /** Static backdrops (static resources, rendered once on the main canvas then kept):
   *  'map'  = the standard map with fog frozen at Tfix under the 0.85 veil — used whenever the team / the panel
   *           covers the map (the fog there is ~5% visible, so freezing it is imperceptible, and it saves the
   *           engine's ~60ms map draw). Tfix = the moment the panel leaves, so un-freezing there is seamless.
   *  'dive' = the same plus the panel's shadow (a 50px blur magnified ×5 would otherwise cost ~25ms). */
  const BDS = {};
  function fixT() { return S6().start + T6().out0; }
  function backdrop(kind) {
    const key = kind + fixT();
    if (BDS[kind] && BDS[kind].key === key) return BDS[kind].cv;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    mapState(fixT()); veil(0.85);
    if (kind === 'dive') panelShadow(panelGeom(1), 1);
    ctx.restore();
    const cv = (BDS[kind] && BDS[kind].cv) || Object.assign(document.createElement('canvas'), { width: W, height: H });
    const b = cv.getContext('2d'); b.globalCompositeOperation = 'copy'; b.drawImage(E.canvas, 0, 0);
    BDS[kind] = { cv, key }; return cv;
  }
  function blit(cv) { ctx.save(); ctx.imageSmoothingQuality = 'low'; ctx.drawImage(cv, 0, 0); ctx.restore(); }
  function panelShadow(g, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 14;
    E.rrect(g.x, g.y, g.w, g.h, 14); ctx.fillStyle = P.bg2; ctx.fill(); ctx.restore();
  }
  function drawSpark(T, a) {
    if (a <= 0) return;
    const s = World.toScreen(cam, SP.spark.x, SP.spark.y);
    const br = 0.93 + 0.07 * Math.sin(T * 1.6);      // steady; breathes, never flickers
    ctx.save(); ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 90);
    g.addColorStop(0, 'rgba(255,154,85,0.30)'); g.addColorStop(0.4, 'rgba(255,154,85,0.08)'); g.addColorStop(1, 'rgba(255,154,85,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 90, 0, 7); ctx.fill();
    ctx.restore();
    E.dot(s.x, s.y, 12, P.ember, { alpha: a * 0.18 * br });
    E.dot(s.x, s.y, 5.5, P.ember, { alpha: a * br, glow: 22 });
  }
  function drawLog(lt, tm, a) {
    if (a <= 0) return;
    const w = 860, hh = 250, x = W / 2 - w / 2, y = 488 - hh / 2;
    E.panel(x, y, w, hh, { alpha: a * 0.92, r: 14 });
    E.text('任务日志', x + 44, y + 54, { size: 20, weight: 500, color: P.dim, alpha: a, spacing: 4 });
    E.text('QUEST LOG', x + w - 44, y + 54, { size: 16, family: F.mono, color: P.faint, alpha: a, align: 'right', spacing: 3 });
    ctx.save(); ctx.globalAlpha = a * 0.8; ctx.fillStyle = P.line; ctx.fillRect(x + 44, y + 76, w - 88, 1); ctx.restore();
    const row = (ty, t0, tag, tagC, name, nameC, status, statusC) => {
      const k = ease.out(prog(lt, t0, t0 + 0.5)); if (k <= 0) return;
      const yy = ty + (1 - k) * 10;
      E.text(tag, x + 44, yy, { size: 24, family: F.mono, color: tagC, alpha: a * k });
      E.text(name, x + 150, yy, { size: 30, weight: 500, color: nameC, alpha: a * k });
      if (status) E.text(status, x + w - 44, yy, { size: 26, color: statusC, alpha: a * k, align: 'right' });
    };
    row(y + 138, tm.logL1, '[主线]', P.gold, '挣钱', P.ink, '进行中', P.dim);
    // side quest: 未触发 → 已触发 with a small unlock
    const u = prog(lt, tm.trig, tm.trig + 0.6), ue = ease.out(u);
    row(y + 206, tm.logL2, '[支线]', P.ember, '一件让我忘了看时间的事', u > 0 ? P.ink : P.dim, null);
    const k2 = ease.out(prog(lt, tm.logL2, tm.logL2 + 0.5));
    if (k2 > 0) {
      const sx = x + w - 44, sy = y + 206;
      E.text('未触发', sx, sy, { size: 26, color: P.faint, alpha: a * k2 * (1 - clamp(u * 3)), align: 'right' });
      if (u > 0) {
        const sw = E.measure('已触发', { size: 26 });
        const pop = 1 + 0.18 * (1 - ease.outBack(clamp(u * 1.6)));
        ctx.save(); ctx.translate(sx - sw / 2, sy - 9); ctx.scale(pop, pop);
        E.text('已触发', sw / 2, 9, { size: 26, weight: 500, color: P.ember, alpha: a * clamp(u * 3), align: 'right', glow: 14 * (1 - ue) + 4 });
        ctx.restore();
        E.ring(sx - sw / 2, sy - 9, 18 + ue * 70, P.ember, { alpha: a * (1 - ue) * 0.7, lineWidth: 1.5 });
        // the name warms up as it unlocks
        E.text('一件让我忘了看时间的事', x + 150, sy, { size: 30, weight: 500, color: P.ember, alpha: a * ue * 0.85 });
      }
    }
  }

  /** one complete s6 frame in "film" coordinates (whatever transform is current). Returns the task panel state. */
  function drawF(lt, tm, T, o = {}) {
      const t5 = T5(), s5len = S5().end - S5().start;
      const collapse = prog(lt, tm.c0, tm.c1);
      const mapOut = ease.inOut(prog(lt, tm.mapOut0, tm.card0));
      // ---- map layer
      const spark = ease.inOut(prog(lt, tm.ember0, tm.ember1));
      const frozen = o.backdrop || ((lt < tm.c0 || lt >= tm.c1) && lt < tm.out0 && backdrop('map'));
      if (frozen) blit(frozen);
      else if (mapOut < 1) {
        mapState(T, { reveal: spark > 0 ? [{ x: SP.spark.x, y: SP.spark.y, r: 210 * spark, a: 0.55 }] : [] });
        drawSpark(T, spark);
        // new ember marker + dashed path from the player
        const dk = prog(lt, tm.drop0, tm.drop0 + tm.dropD);
        const pk = ease.inOut(prog(lt, tm.path0, tm.path1));
        if (pk > 0) {
          const a = World.toScreen(cam, HOME.x, HOME.y), b = World.toScreen(cam, SP.newMark.x, SP.newMark.y);
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
          const s0 = 26, s1 = L - 14;
          ctx.save(); ctx.globalAlpha = 0.75; ctx.strokeStyle = P.ember; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.setLineDash([2, 12]); ctx.lineDashOffset = -T * 14;
          ctx.beginPath(); ctx.moveTo(a.x + ux * s0, a.y + uy * s0); ctx.lineTo(a.x + ux * lerp(s0, s1, pk), a.y + uy * lerp(s0, s1, pk)); ctx.stroke();
          ctx.restore();
        }
        if (dk > 0) World.marker(cam, SP.newMark.x, SP.newMark.y, { color: P.ember, drop: dk, size: 0.85 });
        // veil: full dark while the team/panel owns the screen, light for 02:13, medium under the log
        const d5 = 0.85;
        const vIn = ease.inOut(prog(lt, tm.out0, tm.out1));
        const vLog = ease.inOut(prog(lt, tm.log0 - 0.2, tm.log0 + 0.5)) * (1 - ease.inOut(prog(lt, tm.logOut, tm.logOut + 0.6)));
        veil(lerp(d5, 0.08, vIn) + 0.4 * vLog);
        // HUD
        const hud = vIn * (1 - 0.6 * vLog);
        E.questBox('挣钱', { alpha: hud });
        const ck = ease.out(prog(lt, tm.clock, tm.clock + 0.35));
        E.clockHUD('02:13', { alpha: ck * (1 - 0.6 * vLog) });
        veil(mapOut);
      } else veil(1);
      // ---- task panel (+ Droste slot); the team folds into its track, so the panel is drawn first
      const pa = ease.out(prog(lt, tm.c0 + 0.4, tm.c0 + 1.0)) * (1 - ease.inOut(prog(lt, tm.out0, tm.out0 + 0.8)));
      const tp = drawTaskPanel(lt, tm, pa, T, !!o.backdrop);
      // ---- the team: each window flattens and glides into its own two cells of the progress track,
      //      left to right in reading order — ten agents become one bar
      if (collapse < 1) {
        const g0 = panelGeom(0);
        const ek = s => prog(lt, tm.c0 + s.idx * 0.045, tm.c0 + s.idx * 0.045 + 0.8);
        drawGrid(s5len, t5, T, {
          rectOf: s => {
            const k = ek(s), a0 = s.rect, q0 = barCell(g0, s.idx * 2), q1 = barCell(g0, s.idx * 2 + 1);
            const b = { x: q0.x, y: q0.y, w: q1.x + q1.w - q0.x, h: q0.h };
            const e = ease.inOut(k), eh = ease.out(clamp(k * 1.5));
            const cy = lerp(a0.y + a0.h / 2, b.y + b.h / 2, e), hh = lerp(a0.h, b.h, eh);
            return { x: lerp(a0.x, b.x, e), y: cy - hh / 2, w: lerp(a0.w, b.w, e), h: hh };
          },
          contentOf: s => 1 - prog(ek(s), 0, 0.22),
          tintOf: s => ease.inOut(prog(ek(s), 0.5, 1)),
          radOf: s => lerp(RAD, 1, ease.out(prog(ek(s), 0.2, 0.8))),
          alphaOf: s => 1 - prog(ek(s), 0.92, 1),
        });
        const gs = gridState(s5len, t5);
        drawHeader(gs, 1 - ease.out(prog(lt, tm.c0, tm.c0 + 0.4)), T);
      }
      // ---- quest log, last time
      const la = ease.out(prog(lt, tm.log0, tm.log0 + 0.5)) * (1 - ease.inOut(prog(lt, tm.logOut, tm.logOut + 0.6)));
      drawLog(lt, tm, la);
      // ---- final card
      const ca = ease.inOut(prog(lt, tm.card0, tm.card0 + 0.9)) * (1 - ease.inOut(prog(lt, tm.cardOut, tm.black)));
      if (ca > 0) E.text('游戏进行中', W / 2, H / 2 + 8, { size: 64, family: F.serif, weight: 600, color: P.ink, alpha: ca, align: 'center', spacing: 14 });
      if (lt >= tm.cardOut) veil(ease.inOut(prog(lt, tm.cardOut, tm.black)), '#000');
      if (tp) tp.a = pa * ease.out(prog(lt, tm.th0 + 0.25, tm.th1));
      return tp;
  }

  E.register('s6_loop', {
    draw(c, lt, sc, T) {
      const tm = T6();
      const dv = prog(lt, tm.dive0, tm.dive1);
      if (dv > 0 && dv < 1) {
        // Droste dive: zoom z = 1 → 1/s about the recursion's fixed point. Levels 0 and 1 are drawn as vectors
        // (sharp while magnified), deeper levels come from the snapshot. At z = 1/s level 1 fills the screen at
        // scale 1 — exactly the frame we started from — so returning to z = 1 afterwards is invisible.
        const th = panelGeom(1).th, s = th.w / W, fp = fixedPoint(th), bd = backdrop('dive');
        const z = Math.exp(-Math.log(s) * ease.inOut(dv));
        ctx.save(); ctx.setTransform(z, 0, 0, z, fp.x * (1 - z), fp.y * (1 - z)); drawF(lt, tm, T, { backdrop: bd }); ctx.restore();
        const R = { x: fp.x + (th.x - fp.x) * z, y: fp.y + (th.y - fp.y) * z, w: th.w * z, h: th.h * z };
        ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
        ctx.setTransform(s * z, 0, 0, s * z, R.x, R.y);
        drawF(lt, tm, T, { backdrop: bd }); ctx.restore();
        droste(th, 1, { src: R });
      } else {
        const tp = drawF(lt, tm, T);
        // the recursion, last: everything above is already on the canvas
        if (tp && tp.k > 0) droste(tp.g.th, tp.a);
      }
    },
    cues(sc) {
      const tm = T6();
      return [
        { t: tm.c0, type: 'whoosh', dur: tm.c1 - tm.c0 },
        { t: tm.f1, type: 'check' },
        { t: tm.clock, type: 'tick' },
        { t: tm.trig, type: 'spark' },
        { t: tm.drop0 + tm.dropD * 0.6, type: 'drop' },
        { t: tm.card0, type: 'final' },
      ];
    },
  });
})();
