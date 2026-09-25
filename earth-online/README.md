# 地球 Online：代码生成的动态文字短片

一部约 2 分钟的动态文字短片（kinetic typography）：画面、配音、配乐、音效全部由本目录里的代码离线生成，没有用视频生成模型，也没有剪辑软件。同一套流水线改台词、改场景就能做新片。

- 成片：`release/earth-online-v*.mp4`
- 剧本：`script/v4.md`
- 调研笔记：`research/notes.md`
- 制作规则（写新场景前必读）：`BRIEF.md`
- 用 Claude Code 多 Agent 做一部新片的方法：`docs/PLAYBOOK.md`

## 快速开始

需要 Python 3.10+、Node.js 18+、curl，以及约 2GB 磁盘（模型约 400MB，渲染中间文件约 1GB）。Linux 和 macOS 都可以。

```bash
cd earth-online
bash setup.sh                                     # 一次性：Python/Node 依赖、无头 Chromium、ffmpeg、模型
bash pipeline/make.sh                             # 从零生成整部片子 → release/earth-online.mp4
RELEASE_NAME=my-cut bash pipeline/make.sh         # 指定输出文件名 → release/my-cut.mp4
SKIP_VO=1 bash pipeline/make.sh                   # 只改了画面/音乐时，复用现有配音和时间轴
```

在 4 核、无 GPU 的机器上，完整生成一次约 8 分钟：配音约 1 分钟，音频约 1 分钟，逐帧渲染约 5 分钟，压缩约 1 分钟。

## 流水线

```
pipeline/lines.json ──gen_vo.py──▶ build/vo/Lxx.wav + build/timeline.json   (真实配音时长决定时间轴)
                                              │
web/engine.js + web/scenes/*.js ──render.mjs cues──▶ build/cues.json         (场景声明的音效点)
                                              │
pipeline/audio/music.py  ──▶ build/audio/music.wav   (按时间轴和 cue 作曲)
pipeline/audio/sfx.py    ──▶ build/audio/sfx.wav     (按 cue 合成音效)
pipeline/audio/mix.py    ──▶ build/audio/mix.wav     (配音+配乐+音效，侧链压低，-16 LUFS)
                                              │
web/* ──render.mjs video（无头 Chromium 逐帧，多进程）──▶ build/video.mp4
                                              │
make.sh 合成 ─▶ out/earth-online.mp4（高码率母版） + release/<name>.mp4（约 30MB 分享版）
```

核心设计：**时间轴由配音生成**。改一句台词或换一个声音，所有画面动画、配乐段落、音效会自动跟着新时长走，因为场景代码里没有写死绝对秒数。

## 目录

| 路径 | 作用 |
|---|---|
| `pipeline/lines.json` | 台词、每幕的前后留白（lead/tail）、句间停顿（pre）、声音选择。`text` 是字幕，`say` 可选，只影响发音 |
| `pipeline/gen_vo.py` | 离线 TTS（sherpa-onnx）生成每句配音，并写出 `build/timeline.json` |
| `pipeline/check_vo.py` | 用 ASR 把配音转回文字、按拼音比对，找出读错的字 |
| `web/engine.js` | 渲染引擎：每帧是时间 t 的纯函数；调色板、字体、缓动、文字、面板、共用地图、字幕、胶片颗粒 |
| `web/scenes/*.js` | 各幕画面，Canvas 2D 绘制 |
| `pipeline/render.mjs` | 渲染驱动：静帧、联系表、音效 cue 导出、整片视频 |
| `pipeline/audio/` | 配乐、音效、混音（`build_audio.sh` 是入口） |
| `pipeline/make.sh` | 一键总装 |
| `pipeline/fetch_models.sh` | 从 GitHub Releases 下载模型（Hugging Face 不可用时也能跑） |
| `models/`、`build/`、`out/`、`.bin/` | 模型和中间产物，已被 git 忽略 |
| `release/` | 分享用的成片和配音试听样本，纳入 git |

## 预览与调试（不用每次渲染整片）

```bash
node pipeline/render.mjs still 12.5 30 44.2        # 指定秒数的静帧 → build/stills/
node pipeline/render.mjs sheet s3_money --n 16     # 某一幕的联系表（缩略图网格）
node pipeline/render.mjs video --from 40 --to 60   # 只渲染一段 → build/video.mp4
python3 pipeline/check_vo.py                       # 配音读音检查（需先 WITH_ASR=1 bash pipeline/fetch_models.sh）
PLOTS=1 SKIP_CUES=1 bash pipeline/audio/build_audio.sh   # 只重做音频，并输出波形/频谱自检图
```

也可以用本地静态服务器打开 `web/index.html`，在浏览器控制台里调用 `renderFrame(秒数)` 实时查看任意一帧。

## 常见改动

- **改台词**：编辑 `pipeline/lines.json`，然后跑 `bash pipeline/make.sh`。某个字读错了，就给那句加一个 `"say"`（同音字替换或加逗号），字幕仍显示 `text`。改完跑 `check_vo.py` 验证。
- **换声音**：修改 `lines.json` 里的 `voice_sid`（引擎说明见 `gen_vo.py` 文件头），再跑 `make.sh`。
- **调节奏**：全局语速用 `speed`，单句用 `"speed"`；留白用 `lead`、`tail`、`pre`。时间轴会自动重算。
- **改画面文字**（比如日志条目、通知内容、人物卡片）：直接改对应 `web/scenes/*.js` 里的字符串，然后 `SKIP_VO=1 bash pipeline/make.sh`。
- **写新的一幕**：先读 `BRIEF.md`。用 `E.register('场景id', {draw, cues, pad})` 注册，时间一律相对 `E.lineLocal('Lxx')` 或场景时长来算，禁止用 `Math.random` 或 `Date`（帧会并行、乱序渲染）。
- **改配乐**：`pipeline/audio/music.py` 按场景 id 分段作曲，和弦、乐器、速度都在各段函数里。

## 常见问题

- **浏览器找不到**：运行 `npx playwright install chromium`。如果项目锁定的 Playwright 版本和已装的浏览器不一致，删掉 `node_modules` 后重新执行 `npm install`。
- **中文字体显示成方块**：字体来自 npm 包（思源黑体、思源宋体、霞鹜文楷、JetBrains Mono），渲染前会按全片用到的字预加载。新加字后不需要额外处理；如果仍是方块，检查 `node_modules/@fontsource` 是否存在。
- **模型下载失败**：`fetch_models.sh` 只依赖 github.com。公司网络限制 GitHub Releases 时，可以在能访问的机器上下载好，把 `models/` 目录整个拷过来。
- **ffmpeg 缺 libx264**：`setup.sh` 会自动改用 `imageio-ffmpeg` 自带的静态 ffmpeg，放在 `.bin/`。

## 素材与许可

| 素材 | 来源 | 许可 |
|---|---|---|
| 字体 | 思源黑体 / 思源宋体（Noto Sans SC / Noto Serif SC）、霞鹜文楷、JetBrains Mono | SIL OFL 1.1 |
| 配音模型 | Kokoro-82M v1.1-zh（经 sherpa-onnx） | Apache-2.0 |
| 读音检查 | SenseVoice（经 sherpa-onnx） | 见模型目录内 LICENSE |
| 乐器音色 | GeneralUser GS v2.0.3 | 允许用于个人和商业音乐制作 |
| 其他 | 音效、鼓、合成器、混响均为代码合成 | 无第三方素材 |

片中人物（面馆老板、前同事、妈妈）和日期都是虚构的叙事素材。
