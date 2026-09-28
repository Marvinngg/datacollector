# 读书会 → 学习视频：脚本驱动的自动生成器

第一部作品：《博弈论：看局、解局、改局》（约 10 分钟），内容整理自李继刚读书会的「博弈论」分享。成片放在 `release/` 目录。

**思路**：把一场分享重写成一份结构化脚本 `script/script.json`，其余步骤全部自动完成：

- 旁白每句配音；
- 用语音识别核对读音，读错的自动修正；
- 按配音的实际时长排出时间轴；
- 按模板自动生成画面；
- 按章节自动作曲、加音效、混音；
- 逐帧渲染，合成 MP4。

## 快速开始

```bash
cd game-theory
bash setup.sh            # 一次性安装：Python/Node 依赖、无头浏览器、ffmpeg、模型（约 1.3GB）
bash pipeline/make.sh    # 从脚本到成片 → release/game-theory.mp4
```

常用变体：

```bash
SKIP_VO=1 bash pipeline/make.sh                         # 只改了画面或配乐时，复用现有配音
FROM=112 TO=202 RELEASE_NAME=c3 bash pipeline/make.sh   # 只渲染一段（比如一章）做试片
bash pipeline/voice.sh                                  # 只重做配音（带自动修音）
node pipeline/render.mjs sheet c3 --n 20                # 第 3 章的缩略图网格，快速检查画面
node pipeline/render.mjs still 150 162.5                # 指定秒数的静帧
```

耗时参考（4 核、无 GPU 的机器）：

| 步骤 | 耗时 |
|---|---|
| 配音（ZipVoice） | 约 15 分钟（首次）；已合成的句子有缓存，改几句只重做那几句 |
| 读音修正 | 约 3 分钟 |
| 音频 | 约 8 分钟 |
| 画面 | 约 8 分钟 |

## 做一部新片：只需要写脚本

1. 拿到分享的转写稿，先写出总结和大纲，和观众对齐"要学会什么"。
2. 写 `script/script.json`：章节 → 段落（beat）→ 每段的旁白 `lines` 和画面 `visual`。`visual.type` 从模板库里选，参数照着现有脚本写。
3. 运行 `bash pipeline/make.sh`。
4. 先渲染一章做试片，确认风格和节奏后，再出全片。

### 脚本格式

```json
{ "id": "c3b2",
  "lines": ["另一种是同时出……", "两个人被分别审讯……"],          // 每句一个配音文件，也是字幕
  "visual": { "type": "matrix", "rows": [...], "cols": [...], "cells": [...],
              "steps": [{ "at": 0, "show": "frame" }, { "at": 1, "show": "cells" }] } }
```

- `steps[].at`：这一步挂在第几句旁白上（从 0 数起），`delay` 表示再往后推几秒。时间轴由配音自动算出，脚本里不写秒数。
- `visual.ref: "c3b2"`：沿用前一段的同一张图，继续往下推进（画面连续，不闪）。
- 读音：数字和年份会自动转成中文读法。个别词可以在 `say` 里写读法替换，例如 `{"纳什": "纳实"}`。读错的句子交给 `fix_vo.py` 自动修；它会从 `script/say_candidates.json` 里挑能读对的写法。只要措辞变了，字幕会自动同步。

### 模板库（web/templates）

| 文件 | 模板 | 适用 |
|---|---|---|
| `basic.js` | `title` `lens` `statement` `compare` `list` `cards` `remember` `timeline` `endcard` | **任何内容都能用**：观点、对比、要点、案例、记住卡、时间线 |
| `games1.js` | `matrix` `tree` `crossroad` `nyc` `rps` `dough` | 博弈论：收益矩阵、博弈树、路口、聚焦点、混合策略、不动点 |
| `games2.js` | `chicken` `adverse` `insurance` `shops` `rounds` `tournament` | 博弈论：胆小鬼、逆向选择、筛选、重复博弈、逆向归纳、以牙还牙 |

新学科如果需要新的图示（比如信息论的编码树），就按 `BRIEF.md` 的模板规范加一个模板文件，然后在 `web/index.html` 里引用。

## 流水线

```
script/script.json
  └─ pipeline/voice.sh ─ gen_vo.py（ZipVoice 配音 + 数字转中文读法 + 缓存）
                        ├ fix_vo.py（ASR 拼音比对 → 重录或换写法 → 同步字幕）
                        └ gen_vo.py（复用修好的配音，生成 build/timeline.json）
  └─ render.mjs cues ─ build/cues.json（画面声明的音效点）
  └─ audio/build_audio.sh ─ music.py（按章节作曲）→ sfx.py → mix.py（旁白压低音乐，-16 LUFS）
  └─ render.mjs video ─ 无头浏览器逐帧渲染（web/film.js 运行时 + 模板），4 进程并行
  └─ ffmpeg ─ release/<name>.mp4
```

## 配音与许可

- **旁白**：ZipVoice（sherpa-onnx，Emilia 语料训练）零样本合成。音色参考 `assets/voice_refs/yunjian.wav`，这段参考音频由 Kokoro v1.0 的 zm_yunjian 合成，是合成声音，不对应任何真人。**Emilia 数据集许可为 CC BY-NC 4.0，仅限非商业使用。** 如需商用，可以把 `script.json` 的 `voice` 换回 `{"engine":"kokoro","model_dir":"kokoro-multi-lang-v1_0","voice_sid":49}`（Apache-2.0），代价是语调偏平。
- **读音检查**：SenseVoice（sherpa-onnx）。
- **配乐**：GeneralUser GS v2.0.3 音色库，许可允许用于个人和商业音乐制作。其余音效和纹理都由代码合成。
- **字体**：思源黑体、思源宋体、霞鹜文楷、JetBrains Mono（均为 SIL OFL）。
- **内容**：整理自李继刚读书会分享。转写稿没有存进仓库。

## 目录

| 路径 | 作用 |
|---|---|
| `script/` | 脚本和读音备选写法 |
| `pipeline/` | 配音、读音修正、渲染驱动、总装脚本、音频 |
| `web/` | `core.js`（绘图工具）、`film.js`（运行时）、`templates/`（画面模板） |
| `assets/voice_refs/` | 音色参考 |
| `release/` | 成片、试片、试听样本 |
| `BRIEF.md` | 模板作者规范 |
| `models/`、`build/`、`node_modules/` | 模型和中间产物，已被 git 忽略 |
