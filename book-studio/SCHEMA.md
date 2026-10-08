# 一本书工坊 · book.json

One submitted piece of content becomes one **book**: text, cards, a podcast and a film. The worker (a Claude
Code session, see `WORKER.md`) reads the source and writes `book.json`; every pipeline reads only this file.

```jsonc
{
  "id": "dafen",                       // [a-z0-9-], also the artifact's library doc id
  "title": "打分的人走了",
  "subtitle": "你没有变差，只是打分的人走了",   // one line
  "palette": "night",                  // reserved

  "article": {                         // the text form: a clean, publishable rewrite (keeps the author's voice)
    "lede": "导语，一段",
    "sections": [ { "h": "一、深夜，你又刷到了他们", "ps": ["段落，可用 **加粗** 标重点", "..."] } ],
    "end": "结尾一句（可空）"
  },

  "cards": [                           // 4–8 quote cards
    { "n": "01 / 深夜", "q": "整句", "em": "q 里要高亮的一段（原样子串）", "tone": "cold|warm" }
  ],

  "podcast": {                         // two hosts, conversational, 3–6 min of speech; synthetic built-in voices only
    "title": "节目标题",
    "hosts": { "A": "主持", "B": "嘉宾" },   // roles, not real people
    "lines": [ { "who": "A", "text": "一句口语。数字写成汉字更稳。" } ]
  },

  "film": {                            // no narration: on-screen text + graphics + score. 2–5 min.
    "parts": [                         // each part becomes one episode (≤ ~2.5 min, ≤ 19 MiB)
      { "title": "第一集 · 深夜", "scenes": [ SCENE, ... ] }
    ]
  }
}
```

## Film scenes

Every scene: `{ "type": ..., "mood": "cold|warm|neutral" (default neutral), ...fields }`. The engine times each
scene from its reading load; keep sentences ≤ 28 汉字 (split longer ones into two `line` scenes).

| type | fields | picture |
|---|---|---|
| `title` | `title`, `sub?` | opening: the title gathers out of particles |
| `chapter` | `n` ("一"), `title` | chapter card |
| `line` | `text`, `key?` (substring) | the sentence is the frame; `key` glows in the mood colour |
| `quote` | `text`, `key?` | a climax sentence: larger, slower, light grows around it |
| `question` | `text` | darkness, one sentence stays lit |
| `list` | `head?`, `items` (2–6 short strings) | items written one by one |
| `contrast` | `left: {label, text}`, `right: {label, text}` | two sides, cold vs warm, a balance |
| `number` | `value` (string, e.g. "18"/"1%"), `text` | a number counts up, then its meaning |
| `end` | `text`, `sub?` | final card |

Moods: `cold` = other people's lamp (pale blue-white), `warm` = your own light (amber), `neutral` = ink.
A film should travel from cold to warm (or whatever the content's own arc is) — the moods are the arc.
