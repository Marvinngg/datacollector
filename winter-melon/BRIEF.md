# 《李叔的冬瓜》画面制作说明（场景作者必读）

一部约 3 分半钟的竖屏剧情短片（1080×1920，发抖音和微信群）。用来推广冬瓜，但要靠故事打动人，不靠硬广。
**风格**：暖光、逆光剪影、绘本感。人物是带轮廓光的剪影（没有五官），关键物件（冬瓜、刻字、杆秤、本子、手机、纸条、汤）用特写细画。基调安静、朴素、温暖，不卖惨，不煽情，不花哨。

## 故事
晓禾是回村的村干部，骑三轮挨家收冬瓜。李叔是 72 岁的倔老汉，不肯卖给"帮扶"，因为一块二一斤比市价八毛高，他觉得那是可怜他。夜里，晓禾翻到城里林姐去年的留言：她点名要皮上刻着"李"字的冬瓜，说炖汤好喝。第二天李叔看到留言，下地挑瓜，裂了的不给人家；过秤时晓禾借林姐的话多付钱，"好瓜就值这个价"，李叔回送一个小冬瓜，还塞了张纸条："放阴凉地方，能放到过年。"城里孩子念出纸条，林姐说明年还买。傍晚，晓禾给李叔看汤的照片，他说"有啥好拍的"，却又把手机拿近看。
**人物和地点**：故事发生在李家畈村，村里人都姓李（`S.VILLAGE`、`S.SURNAME`）。老汉叫李德厚，大家叫他李叔。晓禾全名李晓禾。王婶在账本上记作桂兰婶。林姐是城里的买家。
**核心意象**：冬瓜还小的时候，李叔会在瓜皮上刻一个"厚"字（他名字里的字，`S.MARK`；不刻姓，因为全村都姓李，刻姓分不出是谁家的瓜），字会跟着瓜一起长大，最后变成一道浅疤（`S.melon(..., {carve: S.SURNAME})`）。

## 技术
- 场景就是模板：`T.register('<type>', { draw(ctx, V, lt, api), cues(V, api) })`。V 是脚本里该段的 `visual`，lt 是本段内的秒数。
- 脚本：`script/film.json`。时间轴：`python3 pipeline/gen_timeline.py` 生成 `build/timeline.json`，里面有每段的 start/end 和每个 step 的时间 t。
- `api.steps`：每个 step 带 `lt`（本段内的开始秒数）和 `dur`。对白 step 写作 `{say: 'qin'|'xiao'|'wang'|'lin'|'kid', text}`，其余是 `{show: '名字'}`。用 `S.stepAt(api, 'name')` 找到某个 step。
- **画面工具都在 `web/scene.js`（全局 `S`）**，先通读它，再看 `web/templates/scenes_a.js` 里已经做好的 3 个场景（open、qin_field、scale），照着它们的手法做：
  - 环境：`S.sky / sun / hills / fog / ground / field / fieldSpots / house / tricycle / motes / steam / light / vignette`。
  - 镜头：`S.camera(lt, {dur, z0, z1, x0, x1, y0, y1})` 做缓慢的推拉；`S.layer(depth, fn)` 让不同远近的层有视差。
  - 冬瓜：`S.melon(x, y, len, {tod, rot, carve:S.MARK, carveA, crack, lit, rim, dark})`。
  - 人物：`S.person(who, x, y, h, {tod, facing, light, bend, head, armF, armB, walk, crouch, sit, t})`。返回 `{hand, head}`，用来放手里的东西和对白的位置。姿势可以用 `node pipeline/tools/figtest.mjs` 预览。
  - 对白：`S.say(api, lt, { who: [x, y] })`，台词出现在说话人头顶附近。**不要做底部字幕条，不要做对话框。**
  - 手写：`S.hand(str, x, y, size, k)`，k 是 0..1 的书写进度。
  - 时段：`S.TOD` 里有 dawn、day、dusk、night 四套颜色。
- 竖屏安全区：抖音底部约 380px 和右侧约 140px 会被界面元素遮挡，**对白和重要内容放在 y 280–1500、x 60–940 之内**。
- 每一帧都是时间的纯函数：禁止 Math.random、Date 和跨帧状态（缓存静态贴图可以，用 `S.cached`）。随机数用 `K.rng(seed)`。
- 动作要慢而自然：人走路用 `walk: lt * 5~6`；镜头每秒变化不超过约 1%；一个画面同时只有一处焦点在动。
- 音效 cue（`cues()` 返回 `[{t, type, dur?}]`，t 是本段内的秒数），只用这些类型：`say`（每句对白开始）、`knock`（敲瓜）、`slide`（秤砣滑动）、`write`（写字，带 dur）、`ride`（三轮车行驶，带 dur）、`phone`（手机亮屏或消息）、`paper`（纸条）、`box`（纸箱）、`thud`（瓜落地或放下）、`door`、`spoon`（勺子碰碗）、`title`。环境声（虫鸣、鸟叫、风）由音频程序按场景自动加，不用发 cue。
- 预览：`node pipeline/render.mjs still <秒...> --out build/stills_<你的名字>`。用 Read 看 PNG，**至少迭代 3 轮**。每轮都要问自己：这像一部认真做的绘本动画吗？人物姿势自然吗？对白能看清、位置对吗？
- 只写分配给你的文件 `web/templates/scenes_<x>.js`（已在 `web/index.html` 里引用），不改其他文件，不 git commit。要是需要给 `scene.js` 加通用能力，写在你自己的文件里，并在报告中说明。
