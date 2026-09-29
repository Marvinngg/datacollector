# 交接文档：转写稿 → 学习视频（博弈论这套流水线）

给接手的 AI 看。先读完本文，再按「阅读顺序」去读仓库里的文件。**不要克隆整个仓库去通读**：仓库很大，大部分是成片视频。

## 仓库地址

| 项目 | 地址 |
|---|---|
| 仓库（公开） | https://github.com/Marvinngg/datacollector |
| 分支 | `claude/vm-environment-new-branch-av6bg5` |
| 项目目录 | `game-theory/` |
| 网页浏览 | https://github.com/Marvinngg/datacollector/tree/claude/vm-environment-new-branch-av6bg5/game-theory |
| 成片示例（v4，19:47，1080p） | https://github.com/Marvinngg/datacollector/blob/claude/vm-environment-new-branch-av6bg5/game-theory/release/game-theory-v4.mp4 |

原始文件的前缀（直接取纯文本，最省 token）：
```
https://raw.githubusercontent.com/Marvinngg/datacollector/claude/vm-environment-new-branch-av6bg5/game-theory/
```

## 阅读顺序（只读这几个，合计约 1 万字符）

1. **入口：规则、步骤、哪些不用读**
   https://raw.githubusercontent.com/Marvinngg/datacollector/claude/vm-environment-new-branch-av6bg5/game-theory/AGENTS.md
2. **模板目录：有哪些画面、参数怎么写**
   https://raw.githubusercontent.com/Marvinngg/datacollector/claude/vm-environment-new-branch-av6bg5/game-theory/docs/TEMPLATES.md
3. **最小完整脚本：新片照这个格式写**
   https://raw.githubusercontent.com/Marvinngg/datacollector/claude/vm-environment-new-branch-av6bg5/game-theory/script/example.json
4. （可选）分工和流程图
   https://raw.githubusercontent.com/Marvinngg/datacollector/claude/vm-environment-new-branch-av6bg5/game-theory/docs/WORKFLOW.md

以下内容**不要读**，都是旧版本、内部实现或大文件：
- `script/v4.json` 全文：要查某一段，用 `show.py`，见下文
- `script/script.json`、`v2.json`、`v3.json`
- `web/templates/*.js` 的源码：只有写新模板时才读
- `pipeline/gen_vo.py`、`fix_vo.py`
- `release/`、`build/`

## 这套东西是什么

- **输入**：一场分享的转写稿，格式不限。
- **输出**：一部无旁白、无字幕的学习视频。文字屏（一句一屏）和画面屏（模拟、图示）交替出现，中间穿插选择题和停顿，配乐自动生成。
- **分工**：
  - **AI 只写一个 JSON 脚本**：总结，列大纲（先和用户对齐），再写每一屏文字、出题、给每段选模板并填参数。
  - **其余全部由程序完成**：`bash pipeline/make.sh` 会检查、排时间轴、作曲混音、逐帧渲染、合成 MP4。
  - **没有任何图片是 AI 生成的**。画面由模板程序实时绘制。
- **硬规则**：
  - 不能有字幕：画面屏不许带句子，写了程序会报错。
  - 一屏只说一件事，通常不超过 16 个字。
  - 不用"术语：解释"式的要点，不写引用出处。
  - 节奏慢，看着不累。

## 在本地跑（需要执行代码时）

只拉代码，不下载成片视频：
```bash
git clone --filter=blob:none --no-checkout -b claude/vm-environment-new-branch-av6bg5 https://github.com/Marvinngg/datacollector.git
cd datacollector
git sparse-checkout set --no-cone '/game-theory/' '!/game-theory/release/'
git checkout
cd game-theory
bash setup.sh                      # 一次性：Python 3.10+、Node 18+、无头 Chromium、ffmpeg
```

常用命令（都在 `game-theory/` 下运行）：
```bash
python3 pipeline/tools/show.py outline           # 正片大纲，每段一行
python3 pipeline/tools/show.py type cards        # 某个模板在正片里的所有写法（直接抄）
python3 pipeline/gen_timeline.py --script script/<片名>.json          # 检查脚本 + 排时间轴
node pipeline/render.mjs sheet e1 --n 12 --out build/check            # 一集的缩略图网格（看样）
SCRIPT=script/<片名>.json RELEASE_NAME=<片名> bash pipeline/make.sh   # 出片 → release/<片名>.mp4
```
耗时参考：在 4 核、无 GPU 的机器上，20 分钟的片子，画面渲染约 50 分钟，配乐约 8 分钟。

## 可以直接发给模型的开场白

> 请先读这份交接文档，再按「阅读顺序」读 AGENTS.md、TEMPLATES.md、example.json，不要读其他文件。
> 然后读我给你的转写稿：先给我总结和章节大纲（每章要学会什么、用什么案例、在哪里出选择题），等我确认后，再按 example.json 的格式写 `script/<片名>.json`。

## 当前状态和已知情况

- 成片 v1–v4 都在 `release/`，最新的是 v4（无旁白、无字幕）。
- 安装和出片只在一台云端 Linux 容器里验证过，**还没在全新电脑上从头跑过**。第一次运行 `setup.sh` 如果报错，按报错补依赖即可。
- 每集的色调和配乐调性按章节 id（`e1`–`e7`）取，超过 7 集会复用默认值。
