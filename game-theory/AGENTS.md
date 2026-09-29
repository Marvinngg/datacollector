# AGENTS.md：给接手的 AI 的入口（先读这一个文件）

这个目录把一场分享（转写稿）做成一部**学习视频**：没有旁白，没有字幕，文字屏和画面屏交替出现，配有问答题和配乐。成片示例是 `release/game-theory-v4.mp4`。
**你只需要写一个 JSON 脚本**，其余步骤全部由程序完成（`bash pipeline/make.sh`）。画面是程序实时画的，不需要、也不能用 AI 生成图片。

## 省 token：只读这些
1. 本文件。
2. `docs/TEMPLATES.md`：有哪些画面模板、各自的参数。
3. `script/example.json`：最小的完整脚本，约 40 行，照它的格式写。
4. 要参考正片的某一段时，**不要打开 `script/v4.json` 全文**（1000 多行），用：
   - `python3 pipeline/tools/show.py outline`：全片大纲，每段一行。
   - `python3 pipeline/tools/show.py e2b5`：只看一段。
   - `python3 pipeline/tools/show.py type cards`：看某个模板的所有用法。

**不要读**（旧版本或内部实现，与写新片无关）：
- `script/script.json`、`v2.json`、`v3.json`
- `pipeline/gen_vo.py`、`fix_vo.py`、`voice.sh`（v1 配音）
- `pipeline/tools/v3_copy.py`、`v4_nosubs.py`（改写记录）
- `web/templates/basic*.js`、`games*.js`、`sims*.js`（旧画面，已被 `v3*.js` 覆盖）
- `release/`、`build/`、`models/`（大文件）

只有要写新模板时，才读 `BRIEF_V3.md` 和 `web/look.js`。

## 做一部新片的步骤
1. **读转写稿，写总结和大纲**（章节 → 每章要学会什么、用什么案例），**先和用户对齐，再写脚本**。
2. **写 `script/<片名>.json`**，格式见 `script/example.json`：
   - 顶层写 `"mode": "silent"`、`"subtitles": false`、`pace`（照抄示例）、`chapters`。
   - 章节 `id` 用 `e1`、`e2`……：每集的色调和配乐调性按这个 id 取，超过 `e7` 的章节会复用默认值。
   - 每一段要么是**文字屏**（`line`、`remember`：句子写在 `lines`；`question`：选择题），要么是**画面屏**（其他模板：不带句子，每个 step 写 `dur` 秒，或整段写 `hold` 秒）。
   - 画面里只写 2–12 个字的短标签；完整的句子放在画面前后的文字屏里。
3. **检查**：`python3 pipeline/gen_timeline.py --script script/<片名>.json`。
   - 有字幕（画面屏带了句子）会报错。
   - 某一段短于 2 秒会给警告，通常是忘了写 `hold`。
4. **看样**：用 `node pipeline/render.mjs sheet e1 --n 12 --out build/check` 出一张缩略图网格，一张图看完一集，比逐张看静帧省得多。只有发现问题时，才用 `still <秒>` 看单帧。
5. **出片**：`SCRIPT=script/<片名>.json RELEASE_NAME=<片名> bash pipeline/make.sh`，得到 `release/<片名>.mp4`。只出一段试片时加 `FROM=秒 TO=秒`。

## 写文字的规则（用户明确要求过）
- 一屏只说一件事，通常不超过 16 个字，最多约 20 个字；长句拆成两三屏。
- 不用"术语：解释"式的要点，不留没解释的缩写，不写引用出处。
- 目的是**让人轻松学会**：逻辑清楚，案例清楚，不遗漏。要设计问答题，让观众先凭直觉选，停几秒，再看揭晓；三个选项的正确答案位置要打乱。
- 节奏要慢，看着不累；关键句加 `"pause": true`。
- **不能有字幕**，也不能有旁白。

## 环境
- 一次性安装：`bash setup.sh`（需要 Python 3.10+、Node 18+；会装无头 Chromium 和 ffmpeg）。默认不下载配音模型，因为 v4 用不到；只有 v1 配音才需要，那时用 `WITH_VOICE=1 bash setup.sh`，约 1.3GB。配乐用的音色库会在第一次生成配乐时自动下载。
- 在 4 核、无 GPU 的机器上，20 分钟的片子，画面渲染约 50 分钟，配乐约 8 分钟。

## 目录速览
```
script/        脚本（v4.json 是正片，example.json 是模板）
docs/          TEMPLATES.md 模板目录 · WORKFLOW.md 分工与流程图
pipeline/      make.sh 一键出片 · gen_timeline.py 时间轴+检查 · render.mjs 渲染 · audio/ 配乐混音 · tools/show.py 查询
web/           film.js 运行时 · look.js 视觉工具 · templates/v3*.js 当前画面模板
BRIEF_V3.md    画面标准（写新模板时才读）
release/       成片（大文件，不要读）
```
