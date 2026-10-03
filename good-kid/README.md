# 打分的人走了

A vertical (1080×1920) kinetic-typography and particle film made from the essay 《你没有变差，只是打分的人走了》
(`docs/article.md`). No narration: on-screen text, graphics and an original score, all generated in code.
Same engine as `../bayes-film`; this film's world (the glyph 你, other people's lamps, the answer sheet, the red pen)
lives in `web/kit.js`, one template file per chapter in `web/templates/`.

- `bash pipeline/make.sh` — timeline → cues → score → frames (cached per scene) → `release/dafen.mp4` and the
  collection `release/ep1..ep4.mp4`
- `BRIEF.md` — the production brief
