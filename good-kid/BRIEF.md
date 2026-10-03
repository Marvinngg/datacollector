# 《打分的人走了》 — production brief (for every agent)

A ~6.9-minute vertical (1080×1920, 30 fps) kinetic-typography film made from the essay in `docs/article.md`
(《你没有变差，只是打分的人走了》 — read it in full first). No narration: on-screen text, graphics and an
original score only.

## The rule

**文字只是形，视频需要传「神」。** Don't illustrate sentences — make the viewer *feel* them. The essay's spirit:
a "good kid" whose light was always a lamp held by someone else (teachers, rankings, certificates). When the scorers
leave, the light goes — not because you got worse. Envy is not for the motorbike but for *freedom that needs no
approval*. Everyone pays; there is no examiner. Your real cost is **试错权** — you never fell, so every choice looks
like a cliff; the people who jump simply know there's ground below. Stand up off the answer sheet, look at it, try
something nobody grades, and each try takes back a little of your own light.

## The look: one world, restraint, then wonder

We made a loud, spectacular film before (bayes-film/). This one must feel **premium and intimate**: closer to a
documentary / editorial piece — *one consistent world*, thin line art, low saturation, slow confident pacing,
glow only where the eye should go — and still contain moments people didn't know a video could do. Precision
and quiet scale impress more than flashes. Avoid: shaking camera, white flash frames, slamming text, busy
backgrounds, many colours at once. Allowed rarely and meaningfully: one hard cut to darkness, one fall, one stamp.

The world's recurring elements (all in `web/kit.js` — use them so the film is one world):
- **你** — the protagonist is the glyph 你 as a particle body (`KIT.you`). `lit` = borrowed light from other
  people's lamps (cold white), `own` = its own light (warm amber), `gray` = a grey life. The film's arc is literally
  `lit` → 0, then `own` growing from 0 to 1 by the end.
- **Other people's lamps** — cold white spotlights from above (`KIT.spot`). The scorers: 老师 / 排名 / 奖状 as
  small glyphs holding them.
- **The answer sheet** (`KIT.sheet`) — a life of correct bubbles; it turns grey; at the end you stand up off it.
- **The red pen** (`KIT.pen`) — the scorer's hand: ✓, circles, "100", strikes. Red appears ONLY as the scorer.
- **The voice** (`KIT.caption`) — the film's sentences: serif, centred, one or two lines, always at the same place
  (lower third, y≈1460; or mid-frame for the biggest statements), revealed calmly. This consistency is a large part
  of the "premium" feel. Personal / intimate lines may use `family: F.hand` (LXGW WenKai).
- Palette (`KIT.C` / light `KIT.L`): night background; warm = yours; lamp = theirs; red = the scorer; gray = the
  grey life; free = their wind and fire (orange); gold = honours.

## Script, timing, structure

`script/film.json` is the source of truth for every on-screen string (`V.lines`) and the cut. The score runs at
**72 BPM (1 beat = 0.8333 s); every step is a whole number of beats.** build/timeline.json has absolute times; a
template gets `api.steps` with `lt`/`dur`/`show`.

| ch | beats | spirit |
|---|---|---|
| e0 深夜 | b01 feed · b02 answers · b03 darkq | 1 a.m., a phone's light in the dark; a thumb swipes three lives (机车 / 健身房 / 露营篝火) drawn as fine line art with warm motion; "你没有点赞，也没有划走"; your life as a perfect answer sheet, every bubble right, then the whole sheet turns grey; the phone goes off; the question stays lit in the dark. |
| e1 打分的人走了 | b04 reunion · b05 scorer · b06 leave (ref b05) | the reunion table: everyone's light turns to 他 and his stories; your honours hover unseen; nobody asks. School: every effort gets a red mark and a spotlight — and the spotlights are *held* by 老师/排名/奖状. Then the holders leave one by one; the lamps go out; 你 is exactly as it was, only unlit. Title moment: 「你没有变差，是给你打分的人走了。」 "它是别人举着的。" |
| e2 好孩子思维 | b07 fuel · b08 weightless · b09 rules | praise words become the fuel that lights 你 (lit rises with each word); "押在了别人的评价上". A line called 标准 under 你: when met, 你 stands on it; when it disappears, 你 floats, weightless. A fork: the lit safe path vs the dark path of possible embarrassment. The three habits as rules on a form; a free scribble called 个性 gets a red 0. |
| e3 你羡慕的 | b10 honest · b11 freedom | the motorbike from the feed, honest question, "大概不会"; the three lives' warmth condenses into 不在乎; its three objects are struck; a 批准 stamp hovers and never lands; "不需要被批准的自由" flies free. |
| e4 账单不同 | b12 bills · b13 trap · b14 exchange | receipts print out of their lives; the trap: a ranking re-sorts and 你 climbs to #1 again ("我的路更稳") — freeze — "你又回到了那张打分表上", "它连安慰你的方式，都是排名"; a balance trading 稳定 ⇄ 自由; the examiner's seat is empty: "根本就没有阅卷人". |
| e5 试错权 | b15 yourbill · b16 never · b17 fall | your bill: not money, not future — the last line prints 试错权; the empty years 18/20/25 (things you never did); the cliff; 你 steps off; a long fall through darkness; a soft landing on ground that lights up just below. "原来摔一跤，人是不会死的。" "…知道底下有地。" |
| e6 Have a try | b18 stand · b19 tries · b20 lamp (ref b19) · b21 end | 你 stands up off the answer sheet (the sheet tilts into perspective below), looks at it: it was handed to you; the small tries appear handwritten, imperfect, unscored; one wobbles and the world doesn't fall; each try kindles a small warm light in 你 — no spotlight above any more; "你已经做了很多年的好孩子了。" "Have a try" "试试不一样的生活。" |

## Tech

- Folder `good-kid/`. Same engine as `bayes-film/` (look at `bayes-film/web/templates/*.js` for craft and code
  patterns, and `bayes-film/BRIEF.md` for engine details). `web/index.html` loads core.js (K), look.js (L),
  px.js (PX — CPU particles, 100k+ per frame), kit.js (KIT — this film's world), film.js, then
  `web/templates/e0.js … e6.js`. **Read px.js and kit.js before writing anything.**
- A template: `T.register('type', { draw(ctx, V, lt, api) {...}, cues(V, api) { return [...] } })` — single quotes
  in `T.register('…'`. `draw` must be a **pure function of `lt`** (frames render out of order); closed-form motion
  only; caching static shapes is fine. `KIT.at(api,'step')`, `KIT.stepDur`, `KIT.stepK` help with steps.
- Chains: `"ref"` beats continue the previous picture with no fade (b05→b06, b19→b20). Other beats cross-fade
  0.45 s unless the script sets `fadeIn/fadeOut: 0`.
- Text: phone-safe area **x 80–1000, y 260–1700**. Use `V.lines` strings exactly (split at punctuation if needed);
  add no other sentences (tiny labels inside a graphic are fine). Allow ≈ 4–5 characters/second reading time.
  Captions via `KIT.caption`. Avoid big `shadowBlur` and live `ctx.filter` (≈40 ms each on the full canvas).
- Particles: `PX.begin()` → `PX.points(...)` / `KIT.you(...)` / `KIT.spot(..., {px:true})` → `PX.flush()`.
  Budget: draw < ~120 ms per frame (`node pipeline/tools/perf.mjs b04`).
- Sound cues: `cues()` returns `[{t: local s, type, ...}]` for the score: `type{dur}` · `swipe` · `tick` ·
  `ticks{dur,n,p0,p1}` · `pen` (a red mark being written) · `stamp` · `print{dur}` (receipt printer) · `click` ·
  `off` (phone off / lamp off) · `hush` · `swell{dur}` · `whoosh{dur}` · `fall{dur}` · `land` · `glow` (a light
  kindles) · `title` · `freeze` · `resolve`.
- Look at your work: `node pipeline/render.mjs still <abs seconds…> --out build/st_<chapter>` and Read the PNGs
  (contact sheets with PIL help). Don't run `render.mjs film/video` or `make.sh`; don't commit.
- Edit **only your own template file**. Never edit kit.js, px.js, film.js, core.js, look.js, index.html, the script
  or the pipeline; if you need a helper, put it in your file. Script/timing change requests go in your report.
- Scratchpad files: use a subfolder named after your chapter (others share the scratchpad).
