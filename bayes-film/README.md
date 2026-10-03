# 先别急 — 一次乘法里的判断力

A vertical (1080×1920) kinetic-typography and particle film made from the article 《你以为有五成把握，其实只有三成：
用一次乘法看清决策》. No narration: on-screen text, graphics and an original score, all generated in code.

- `script/film.json` — the text and the cut (80 BPM; every step is a whole number of beats)
- `web/` — the renderer: `px.js` (CPU particle engine, 100k+ points per frame), `kit.js` (look, the 1000 projects,
  kinetic type), `templates/e0..e6.js` (one file per chapter)
- `pipeline/audio/score.py` — the score and sound design (GeneralUser GS SoundFont + synthesis), synced to cues
  emitted by the scenes
- `bash pipeline/make.sh` — timeline → cues → score → frames (cached per scene) → `release/xianbieji.mp4` and the
  collection `release/ep1..ep3.mp4`
- `BRIEF.md` — the production brief and storyboard
