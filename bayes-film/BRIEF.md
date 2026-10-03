# 《先别急》 — production brief (for every agent)

A ~5.6-minute vertical (1080×1920, 30 fps) **kinetic-typography + data film** made from a finished article about
Bayesian thinking. No narration. Only on-screen text, graphics, and an original score.

## The one rule

**文字只是形，视频需要传「神」。** Text is the body; the film must carry the spirit. Do not illustrate sentences.
Make the viewer *feel* the idea: their gut number is a hot, shimmering thing that freezes and shatters; the base rate
is 1000 real beads, 100 of them gold; evidence is a stamp that sends a shockwave through the beads and visibly sieves
them; a likelihood ratio is a tug-of-war whose rope actually moves; P(D) cancelling is two glowing terms colliding and
annihilating; the gap between 25% and 27% becomes a canyon you fall into. Every number on screen is *counted from
the beads you can see* (the counts are true: see KIT.PROJ).

The bar: **the viewer should think "I didn't know a video could do that."** Thousands to hundreds of thousands of
particles, exact sync to the music, honest live computation, camera moves through 3D point clouds, type that behaves
like the idea it states. Restraint matters as much as spectacle: one strong idea per shot, clean black space, no
clutter, no UI boxes, no clip-art.

## Story spine (the article, condensed)

Your gut says 五成. The base rate says 一成 (100 of 1000). To go from 一成 to 五成 you'd need evidence 9× more
common among successes — rare. Slow down: list competing worlds (成功 / 失败 / 不死不活), knowing the real one may not
be on your list. Use odds, not pie slices: new odds = old odds × likelihood ratio (P(D) cancels). Strong founder:
50 of 100 successes vs 90 of 900 failures → ×5 → 5:9 → 36%. Product not launched: 20 of 50 vs 54 of 90 → ×⅔ →
10:27 → 27%. Noise ("团队很努力") is ×1. A probability is not a decision: with +300万/−100万 the threshold is 25%
(27% → 投); for someone who feels a loss double, it's 40% (→ 不投). Both are right. Near a threshold, look for one
more discriminating fact. AI computes fast; humans define the question and own the decision. 它对抗的不是无知，
而是过早的确定。先别急。

## Storyboard (script/film.json is the source of truth for text and timing)

Timing is cut to the score: **80 BPM, 1 beat = 0.75 s, every step is a whole number of beats.** Step `t` values are
in build/timeline.json; inside a template, `api.steps` gives each step with `lt` (local start, s) and `dur` (s).

| beat | type | what happens (the spirit) |
|---|---|---|
| e0 序 b01 | pitch | sales pitch in punchy kinetic type on the beat: the ask, "100 万", three glowing chips, the question. (done) |
| b02 | gut | the gut answer as a giant particle number racing 0→50%, pushing to 60% "甚至更高", then FREEZE + crack. (done) |
| b03 | title | the number shatters in slow motion, drifts, gathers slowly into 「先别急」 + subtitle. (done) |
| e1 一成 b04 | thousand | "先看一个事实". The title's particles rain down and condense into 1000 beads (KIT.gridPos). "1000 个同类项目" + a live counter. |
| b05 | baserate | a scanline sweeps the grid; 100 beads ignite gold, 900 cool to steel (counter: 成功 100). "十个里，大约只有一个能成". The gold beads gather into a compact block at the top (4 rows); a ghost line at the 500th bead marks "你的直觉在这里" vs "现实在这里": the gap is physical. |
| b06 | nine | "要从一成走到五成": an imaginary light membrane descends through the field and keeps 90 of the 100 gold but only 90 of the 900 steel → 90:90, 50%. Label ×9. Then "这样的信息，非常少见" — the membrane cracks and evaporates (it doesn't exist). |
| e2 竞争世界 b07 | worlds | "先别下结论 / 先摆出几个世界": the beads lift into three rotating 3D particle spheres (成功 gold, 失败 steel, 不死不活 violet); camera orbits; "信心，在世界之间流动": streams of light between spheres. |
| b08 | missing | "你只能在列出的世界里分配信心". Camera pulls back: from the dark, a fourth sphere, far bigger, unlabelled until it resolves into 被收购 / 转型 — the three look tiny. "真实世界，可能不在你的列表里", "保持「我可能漏了什么」的警觉". |
| e3 一次乘法 b09 | pie_vs_odds | a pie chart that jitters and re-slices awkwardly ("切蛋糕…", "总和必须是 100%"), then morphs into a tug-of-war: 1 gold figure vs 9 steel figures on a rope; "1 : 9", "只看两边的相对大小". |
| b10 | equation | 新赔率 = 旧赔率 × 似然比 assembles; the LR definition; then the full fractions appear with P(D) in both denominators; the two P(D) slide together and annihilate in a flash ("P(D) 约掉了"); "只剩一次乘法". |
| b11 | evidence1 | back to the 1000 beads. A card 「创始人背景优秀」 STAMPS down; shockwave; 50 gold + 90 steel stay lit, the rest sink to dust. Survivors stream into two piles 50 vs 90 (counted live). "50 : 90 = 5 : 9", "×5"; the rope shifts 1:9 → 5:9; odometer 10% → 36%. "一条很有分量的好消息，也只推到三成多". |
| b12 | evidence2 | card 「产品还没上线」 stamps; of the piles 20 and 54 remain; "20 : 54 = 10 : 27", "×⅔"; odometer 36% → 27%. A dashed ghost line labelled "你的直觉" stays up at 50–60%: the gap. Small footnote "默认两条信息互不相关". |
| b13 | noise | card 「团队很努力」 drops… and nothing moves (×1). "成功和失败里都常见的信息，乘上去等于没乘". Recap chain "1:9  ×5  ×⅔  =  10:27". |
| e4 概率不是决定 b14 | threshold | "算出概率，还不等于做出决定". A lever/balance: +300万 vs −100万 weights; the fulcrum lands at 25% on a 0–100% axis; the 27% dot sits just past the line → 投. |
| b15 | other | "换一个人：他手头紧": the −100万 weight swells (feels like 200万); fulcrum slides to 40%; the same 27% dot is now short → 不投. Split view of both. "同一个概率，相反的决定", "两个人都没有错". |
| b16 | gap | an endless zoom into the 2 points between 25% and 27% — the sliver becomes a canyon; "27% 离门槛只差两个点", "最该做的，不是马上拍板", "而是再找一条有区分度的信息". |
| e5 人与 AI b17 | ai | an eruption of computation: worlds, evidence, ratios, probabilities stream in cyan monospace particles, faster than reading; the four jobs flash; "AI 做得快，覆盖面也广". |
| b18 | human | everything FREEZES and dims; one blinking caret; a human types "要解决什么？"; "定义问题，是人的事"; two keys 做 / 不做; "相信什么、做不做，由承担后果的人来决定"; the rope from e3, now driven at machine speed and precision: "AI 可以把拔河的每一步算得很准"; "但哪两支队伍站上场，输了谁付钱，得由人来定". |
| e6 尾声 b19 | recall | the 60% gut number flashes back (same look as b02), then time slows; it dissolves into beads that form the four steps one by one. |
| b20 | end | "它对抗的不是无知" / "而是过早的确定" / final 「先别急」 — particles settling to complete stillness; fade to black. |

## Tech

- Folder: `bayes-film/`. Page `web/index.html` loads `core.js` (K: W, H, ctx, F fonts, clamp/lerp/prog/ease/rng/fbm,
  text, measure), `look.js` (L: serif blur-reveal text, glyph sprites, light), `px.js` (PX particle renderer),
  `kit.js` (KIT: colours, the 1000 projects, beads, kinetic type, odometer, beat helpers), `film.js` (runtime), then
  `web/templates/e0.js … e6.js`. **Read px.js, kit.js and templates/e0.js before writing anything** — e0.js is the
  reference for style, quality and code shape.
- A template: `T.register('type', { draw(ctx, V, lt, api) {...}, cues(V, api) { return [...] } })` (use single
  quotes in `T.register('…'` — the render cache looks for that string). `V` = the beat's visual from the script
  (`V.lines` holds the exact text), `lt` = seconds since the beat started, `api.dur` = beat length, `api.steps` =
  steps with `lt`/`dur`/`show`, `api.beat.start` = absolute start. Helpers: `KIT.at(api,'name')`,
  `KIT.stepDur(api,'name')`, `KIT.stepK(api, lt, 'name', d)`.
- **`draw` must be a pure function of `lt`**: frames are rendered out of order by several workers. No state carried
  between frames (caches of static shapes are fine). Simulations must be closed-form in time.
- Chains: a beat with `"ref"` continues the previous beat's picture without a fade (b04→b05→b06, b07→b08,
  b11→b12→b13, b14→b15). Your first frame must match where the previous beat's last frame left off, and your last
  frame must hand over to the next. Beats without ref cross-fade (0.45 s) unless `fadeIn/fadeOut: 0` (hard cut).
- Particles: `PX.begin()` → `PX.points(X, Y, n, colour, {a, A, C, glow})` / `KIT.beads(...)` → `PX.flush({exposure,
  glow})`. Shapes: `PX.text`, `PX.grid`, `PX.disc`, `PX.sphere` (3D) + `PX.project`, `PX.fit`, `PX.morph`, `PX.rand`.
  Budget: keep `draw` under ~120 ms per frame (measure with `node pipeline/tools/perf.mjs b11`). 100k–300k
  particles per frame is affordable; full-canvas `ctx.filter` blur is not (~40 ms each) — avoid live filters and big
  `shadowBlur`.
- Text: Chinese text must stay inside the phone-safe area **x 80–1000, y 260–1700**. Sizes: statements 56–80 px
  serif (F.serif, weight 600), labels 34–44 px, numbers can be huge. Use the strings in `V.lines` exactly (you may
  split a line across rows at punctuation). Add no other sentences; tiny labels/numbers that are part of the graphic
  are fine. Give text time to be read (≈ 4–5 characters per second after it lands).
- Colours: `KIT.C` (CSS) / `PX.COL` (light). gold = success & truth, ember = gut feeling, steel = failure,
  violet = 不死不活 / unlisted world, red = loss, cyan = AI. Black background is drawn for you (KIT BG).
- Sound cues: `cues()` returns `[{t: local seconds, type, ...}]`; the score uses them for sync. Vocabulary:
  `type{dur}` typing · `punch` heavy hit · `chip` light hit · `hush` sudden drop · `riser{dur}` · `heartbeat` ·
  `freeze` (music cuts to silence) · `shatter` · `gather{dur}` · `title` · `ticks{dur,n,p0,p1}` a run of n soft
  ticks (pitch 0..1 from p0 to p1; use it to sonify beads lighting up) · `sweep{dur}` · `stamp` · `roll{from,to,dur}`
  (odometer: pitch follows the number) · `whoosh{dur}` · `swell{dur}` · `cancel` (annihilation) · `thud` (a dull
  nothing) · `click` · `glitch` · `stream{dur}` · `silence{dur}` · `resolve`.
- Check your work by looking at it: `node pipeline/render.mjs still 41.5 44 47 --out build/st_<beat>` (seconds are
  absolute film time; see build/timeline.json for your beats' start/end) and Read the PNGs. Make contact sheets with
  PIL if useful. Do not run `render.mjs film/video` or `pipeline/make.sh`, and do not commit.
- Edit **only your own template file**. Never edit px.js, kit.js, film.js, core.js, look.js, index.html, the script
  or the pipeline; if you need a helper, write it inside your file. If you think the script's text or step lengths
  must change, say so in your report instead of editing it.
