# 《博弈论：看局、解局、改局》制作说明（模板作者必读）

## 这部片子是什么
一部约 10 分钟的**学习型**动态图文视频，内容整理自一场读书会分享。观众（片子的主人）想用放松的状态看完，**真正学会**博弈论的主干：逻辑清晰、案例清晰、不遗漏。
所以画面的第一要务是**帮助理解**：结构一眼看懂，关键词突出，动画用来揭示逻辑（先出现什么、后出现什么、谁指向谁），而不是装饰。风格克制、干净、温和，像一位讲得很清楚的老师在白板前慢慢画。

## 自动化架构
- `script/script.json`：全片脚本。每一段（beat）有旁白 `lines` 和画面 `visual`（`type` 就是模板名，其余字段是参数）。
- `pipeline/gen_vo.py` 配音并生成 `build/timeline.json`（每个 beat 的起止、每句旁白的时间、每个 step 的绝对时间 `t`）。
- `web/film.js`：运行时。负责段落淡入淡出、同一张图跨多个 beat 的连续（`ref` 链）、章节卡、顶部进度条、字幕、背景和胶片后期。
- `web/templates/*.js`：**模板**。每个模板只负责画一整屏的内容。

**模板是可复用的零件**：以后换一本书、一场分享，只需要写新的 script.json，模板库直接复用。所以模板要按参数工作，不要把本片的具体文字写死在模板里（本片专用的图示如 chicken、nyc 可以有默认文案，但必须优先读参数）。

## 模板 API
```js
T.register('matrix', {
  draw(ctx, V, lt, api) { ... },   // V = beat.visual（参数），lt = 本 beat 内的秒数
  cues(V, api) { return [{ t: 秒(本 beat 内), type: 'tick' }]; }   // 可选
});
```
`api` 提供：
- `api.dur`：本 beat 时长；`api.line(k)` → `{start, end, dur}`：第 k 句旁白在本 beat 内的时间。
- `api.steps`：`V.steps` 解析后的列表，每个 step 带 `lt`（本 beat 内触发时间，可能为负：来自同一 ref 链前面 beat 的 step，视为已完成）和 `owner`（所属 beat id）。
- `api.stepP(i, lt, d=0.6, easing)`：第 i 个 step 的进度 0..1。
- `api.find(pred)`、`api.active(lt, pred, d)`：查找 step。
- `api.layout`：内容安全区 `{top:150, bottom:880, left:140, right:1780, cx:960, cy:515}`。**顶部 0–130 是进度条，底部 900 以下是字幕，都不能放内容。**
- `api.chainStart` / `api.chainEnd`：ref 链的起止（本 beat 内时间）。

**ref 链**：如 c3b3、c3b4 的 `visual.ref = "c3b2"`，它们继承 c3b2 的参数并共享同一张图。运行时在链内不做淡入淡出，所以模板必须做到：链中后一个 beat 的第一帧与前一个 beat 的最后一帧画面一致（因为前面 beat 的 step 在后面 beat 里都是负时间＝已完成）。

**step 语义**：step 的 `show`/`note`/`label` 等字段由模板自己解释；`at` 是它挂在第几句旁白上，`delay` 是再往后推多少秒。没有 steps 的模板（如 remember）按 `api.dur` 和 `api.line(k)` 自己安排节奏。

## 可用工具（web/core.js 的全局 `K`）
- 调色板 `K.P`：`bg ink dim faint line gold teal red blue ember warm ok`。约定：**玩家甲＝gold，玩家乙＝teal**，损失/背叛＝red，推荐/最优/正确＝ok，强调＝ember。只用这些颜色。
- 字体 `K.F`：`sans`（思源黑体，界面与正文）、`serif`（思源宋体，标题/金句）、`mono`（JetBrains Mono，数字、英文、年份）、`hand`（霞鹜文楷，字幕专用，模板里少用）。
- 函数：`K.text(str,x,y,{size,family,weight,color,alpha,align,baseline,spacing,glow})`、`K.measure`、`K.panel(x,y,w,h,{r,fill,stroke,alpha})`、`K.rrect`、`K.dot`、`K.ring`、`K.ease.*`、`K.prog(t,a,b)`、`K.window(t,a,b,fi,fo)`、`K.rng(seed)`、`K.fbm`、`K.typed(str,lt,t0,cps)`。

## 可读性底线（手机上也要看得清）
- 正文最小 30px，辅助小字最小 24px，关键词/标题 44–80px。
- 每屏信息量克制：一个中心、一个层级。文字对比度要够（主文字 `P.ink`，次要 `P.dim`，不要用 `P.faint` 写需要读的字）。
- 动画缓入缓出，一个元素出现用 0.4–0.8 秒；不要闪烁、不要抖动、不要满屏粒子。

## 硬规则
- 每一帧是时间的纯函数：**禁止** `Math.random`、`Date`、`performance.now`、`requestAnimationFrame`、跨帧状态（缓存静态贴图可以）。
- 所有时间相对 `api.line(k)`、`api.steps`、`api.dur`，不写死绝对秒数（时间轴会随配音重生成）。
- 单帧绘制 < 40ms。
- 只改自己负责的文件；不改 `film.js`、`core.js`（需要的共用能力写在自己文件里，或在报告里提出）；不 git commit；不读取 `game-theory/` 以外的仓库文件。

## 音效 cue 词表
`tick`（元素出现，轻）、`pop`（强调/高亮）、`whoosh`（大移动，带 `dur`）、`chime`（记住卡/结论）、`click`（选择/确认）、`thud`（撞击/失败）、`swish`（抛出/划过）、`count`（数字滚动，带 `dur`）。运行时自动发出 `chapter`（章节卡）和 `beat`（新画面）。

## 预览与自检
```
node pipeline/render.mjs still 130 145.5          # 指定秒数静帧 → build/stills/
node pipeline/render.mjs sheet c3 --n 20          # 一章的联系表；也可以传 beat id，如 sheet c3b2 --n 12
node pipeline/render.mjs cues                     # 导出 cue
```
时间点在 `build/timeline.json` 的 `beats[].start/end` 和 `lines`。用 Read 工具看 PNG，至少迭代 3 轮。
**试片优先**：第 3 章（c3，约 115–205 秒）先做好，总导演会先出这一章的试片给用户看。
