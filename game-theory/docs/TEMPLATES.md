# 模板目录（写脚本时查这里，不用读模板源码）

每个模板的完整可用写法，都能在正片脚本里找到：`python3 pipeline/tools/show.py type <模板名>` 会打印所有用到它的段落，照着抄参数就行。
时长规则如下：
- **文字屏**：按阅读时间自动计算。
- **画面屏**：每个 step 写 `dur`（秒）；没有 steps 的画面屏写 `hold`（秒）。
- 画面屏**不能带 `lines`**。写了会报错，因为那就是字幕。

## 文字屏（句子写在 `lines` 里，一句一屏）

| 模板 | 用途 | 参数 | 例子 |
|---|---|---|---|
| `line` | 普通的一句一屏 | `highlight: [词]`，可选，用强调色标出；某句写成 `{"text":..,"pause":true}` 会多停几秒 | e1b6 |
| `remember` | 每集的金句，停得更久 | 无，文字取第一句 | e1b9 |
| `question` | 选择题，依次显示题目、停顿"想一想"、揭晓 | `q`、`options:[3 个]`、`answer:序号`、`note`（可选，揭晓时的小字）；不写 lines | e2q1 |

章节卡和每集结尾的过渡屏（`breath`）会根据 `chapters[].num/title/next` 自动生成，不用写。

## 画面屏（通用，换任何内容都能用）

| 模板 | 用途 | 参数 | steps（show 的取值） | 例子 |
|---|---|---|---|---|
| `compare` | 左右对比 | `left/right: {title, items:[...]}` | `left`、`right` | e1b2 |
| `list` | 3–5 个要点，依次点亮 | `title`、`items:[{title, en?, desc}]` | 序号 `0,1,2…`，或 `all`（配 `stagger`） | e1b7 |
| `cards` | 要点、案例，在景深环上轮流点亮 | `title`、`items:[{title, desc}]` | `all` 或序号数组 `[0,1]`，配 `stagger` 秒 | e2b8 |
| `statement` | 一个核心概念，字从四周聚过来 | `text`、`label`（小字英文）、`highlight` | 无，用 `hold` | e3b2 |
| `timeline` | 时间线，镜头沿线横移 | `items:[{year, name, desc}]` | 序号数组 `[0]`、`[1]`… | e7b1 |
| `lens` | "同一件事，不同眼镜" | `x`（中心物）、`lenses:[...]`、`pick` | 无，用 `hold` | e1b1 |
| `knowledge_tree` | 全片知识树（结尾高潮） | `root`、`branches:[{name, leaves:[...]}]` | 无，用 `hold` | e7b4 |
| `endcard` | 片尾 | `title`、`lines:[署名等]` | 无，用 `hold` | e7b5 |

## 画面屏（博弈论专用：图示和模拟）

| 模板 | 画什么 | 例子 |
|---|---|---|
| `matrix` | 2×2 收益矩阵。steps：`frame`、`cells`、`compare-col`（可带 `label`）、`dominant`、`equilibrium`、`optimum` | e2b3、e2b5、e2b6（ref 链） |
| `tree` | 博弈树与逆推：`grow`、`backward` | e2b2 |
| `sim_prisoners` | 100 对囚徒同时选择：`choose`、`tally` | e2b4 |
| `crossroad` | 无红绿灯路口的两个均衡 | e2b7 |
| `nyc` | 纽约碰头（聚焦点） | e3b1 |
| `sim_rps` | 石头剪刀布：`phase: habit / mixed` | e3b5、e3b6 |
| `dough` | 1928 最小最大值定理 / 1950 纳什均衡（揉面不动点） | e3b7、e3b7k |
| `sim_levels` | 你想一层、他想一层（`phase: mirror / levels`） | e1b3、e1b4 |
| `chicken` | 懦夫博弈、扔方向盘 | e4b2 |
| `adverse` | 逆向选择 | e4b5 |
| `insurance` | 保险菜单（筛选） | e4b7 |
| `shops` | 景区小饭馆 vs 连锁店（重复博弈） | e5b1 |
| `rounds` | 100 轮倒推 vs 1% 好人 | e5b3、e5b3k |
| `sim_tournament` | 6 种策略循环赛，以牙还牙夺冠 | e5b4 |
| `tournament` | 以牙还牙与宽容 | e5b5 |
| `sim_auction` | 3G 牌照拍卖 | e6b2 |

**ref 链**：`"visual": {"type": "matrix", "ref": "e2b3", "steps": [...]}` 表示接着 e2b3 的那张图继续往下演，中间可以插文字屏。

## 需要新图示时

现有模板都不合适时，才写新模板：在 `web/templates/` 下新建一个文件，并在 `web/index.html` 里引用它。写之前先读 `BRIEF_V3.md`（画面标准），再读 `web/look.js`（视觉工具），挑一个最接近的现有模板作参考，例如 `v3.js` 里的 `matrix`。
