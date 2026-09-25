# 《地球 Online》制作说明（所有 Agent 必读）

故事与分镜以 `script/v4.md` 为准，务必完整读一遍。本文件只写制作规则。

## 片子是什么

一部约 100 秒的动态文字短片：一个普通人的"任务日志"，从上学到现在。故事靠屏幕上的界面文字推进（参考 Google《Parisian Love》），男声旁白是这个人的心里话，口语、带点自嘲、不煽情。
调性：克制、自然、放松、偶尔幽默，结尾有余味。**不要中二，不要炫技式的花哨特效。**
质感参考：Apple 发布会的动态文字、Kurzgesagt 的干净、Saul Bass 的隐喻式图形。每个动作都要有理由。

## 技术架构

- 画面：`web/engine.js`（引擎和共用组件）加上 `web/scenes/*.js`（各幕）。用 Canvas 2D 绘制，1920×1080，30fps。
- 每一帧是时间 t 的纯函数：`renderFrame(t)`。**禁止**使用 `Math.random`、`Date`、`performance.now`、`requestAnimationFrame`，也禁止任何跨帧状态；随机数一律用 `E.rng(seed)` 或 `E.hash2`。帧可能乱序渲染，也可能多进程并行渲染。
- 时间轴：`build/timeline.json`，由 `pipeline/gen_vo.py` 根据真实配音时长生成，**会变**。
  - 场景里所有时间点都要相对旁白行 `E.lineLocal('L07')` 或场景时长 `sc.end - sc.start` 来算，**不要写死绝对秒数**。
  - 旁白行 id 和文字见 `pipeline/lines.json`。
- 字幕：引擎在底部统一绘制，场景不要自己画旁白字幕。**底部约 170px 留给字幕**，不要放重要内容。
- 性能：单帧绘制控制在 60ms 以内。重的东西（如大纹理）用离屏 canvas 缓存一次，可以缓存在闭包里（缓存静态资源不算跨帧状态）。

## 共用组件（engine.js）

- 调色板 `P`：`bg`、`ink`（主文字）、`dim`、`faint`（灰掉）、`line`、`gold`（挣钱/主线）、`ember`（着迷的火花）、`warm`（别的玩家）、`teal`（AI 队友）、`ok`（✓）。**只用这些颜色**，需要透明度就用 alpha。
- 字体 `F`：
  - `F.mono`：JetBrains Mono，用于日志、数字、HUD 英文。
  - `F.sans`：思源黑体，用于界面中文。
  - `F.serif`：思源宋体，只用于标题。
  - `F.hand`：霞鹜文楷，只用于字幕和极少数亲密文字。
- 常用函数：
  - 数学与缓动：`E.prog(t,a,b)`、`E.ease.*`、`E.window(t,a,b,fi,fo)`
  - 文字：`E.text(str,x,y,{size,family,weight,color,alpha,align,baseline,spacing,glow})`、`E.measure`、`E.typed(str,lt,t0,cps)`、`E.typedDone`、`E.caretOn(lt)`
  - 图形：`E.panel(x,y,w,h,{alpha,r,fill,stroke})`、`E.dot`、`E.ring`
- 地图 `E.World`（全片共用一张地图，保证连续性）：
  - `World.draw(cam,{fog,reveal,alpha,t})`：cam = `{x,y,zoom}`，fog 取 0..1，reveal = `[{x,y,r,a}]`（世界坐标的清晰圆）。
  - `World.player(cam,x,y,{t,alpha,pulse})`、`World.marker(cam,x,y,{color,label,drop,alpha,size})`、`World.toScreen(cam,x,y)`。
  - `World.cam0` 是标准的"我的地图"视角。`World.home` 是玩家位置。
  - `World.spots.money`（挣钱记号）、`World.spots.spark`（火花位置）、`World.spots.newMark`（结尾新记号）。
- HUD：
  - `E.questBox(content,{alpha,caret,lt,color})`：左上"当前任务"框，s2、s3、s4、s6 共用。
  - `E.clockHUD('01:40',{alpha,color})`：右上时钟。

## 场景交接（必须严格遵守，保证无缝衔接）

| 场景 | 负责文件 | 起始状态 | 结束状态 |
|---|---|---|---|
| s0_boot | s0_s2.js | 纯黑 | 任务日志面板出现 |
| s1_school | s0_s2.js | 任务日志 | 日志停在"高考 倒计时 100 天" |
| s2_empty | s0_s2.js | 日志 → 高考 ✓ → 主线任务已完成 → 下一个任务：—— → 网格散开 → 拉远到地图 | **标准地图态**：`World.cam0`，fog≈0.85，reveal=`World.homeReveal()`，玩家点在 home，`questBox('', {caret:true})` |
| s3_money | s3_s4.js | 标准地图态 | 标准地图态，并且：挣钱金色记号已落在 `spots.money`，`questBox('挣钱')`，右侧通知已淡出 |
| s4_others | s3_s4.js | 同上 | 同上（火花已熄灭，时钟 HUD 已淡出） |
| s5_team | s5_s6.js | 同上 → 地图压暗，底部升起对话框 | 满屏 AI 窗口网格 |
| s6_loop | s5_s6.js | AI 窗口网格 | 收束成进度条 → 缩略图 → 02:13 → 最后的任务日志 → "游戏进行中" → 渐黑 |

相邻场景之间允许用 `pad: [before, after]` 做交叠淡入淡出，但要保证两个文件画出来的"标准地图态"像素级一致：同一个 cam，同样的 fog 和 reveal，同一个 questBox。

## 音效 cue

每个场景定义可选的 `cues(sc)`，返回 `[{t, type, ...}]`（t 为场景内秒数）。`node pipeline/render.mjs cues` 会汇总成 `build/cues.json` 交给音效。可用的 type：

`boot`（开机低频）、`key`（单个键击，打字时每个字一个）、`enter`（回车）、`check`（✓ 完成）、`ping`（通知到账，清亮）、`ping_dull`（通知，逐渐麻木的版本，可带 `v` 音量 0..1）、`whoosh`（镜头大幅移动，带 `dur`）、`drop`（记号落地）、`card`（信息卡弹出）、`spark`（火花闪现）、`fizzle`（火花熄灭）、`alarm`（08:00 闹钟）、`window`（AI 窗口打开）、`tick`（时钟跳动）、`final`（结尾字卡）。

## 预览与自检

```
node pipeline/render.mjs still 12.5 30 44.2          # 指定秒数的静帧 → build/stills/*.png（用 Read 工具看图）
node pipeline/render.mjs sheet s3_money --n 16       # 某场景的联系表 → build/stills/sheet_s3_money.png
node pipeline/render.mjs cues                        # 导出音效 cue
```

完成前请至少看两遍联系表和关键帧：检查排版、对齐、可读性、节奏，以及和字幕是否冲突。

## 文件所有权

每个 Agent 只改自己负责的文件，不要改 `engine.js`（需要共用的新能力，写在自己的文件里，或在报告里提出来）。不要读取或修改仓库里 `earth-online/` 以外的任何文件。不要 git commit，由总导演统一提交。
