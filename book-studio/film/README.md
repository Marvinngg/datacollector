# book-studio / film

Turns any `book.json` (see `../SCHEMA.md`) into vertical kinetic-typography films, with no human in the loop:
night background, text that gathers out of particles and dissolves, cold lamp light vs warm own light, thin line art,
an original score. The engine (`web/core.js`, `look.js`, `px.js`, `kit.js`) is copied from `good-kid/`; the runtime
(`web/film.js`) and the templates (`web/scenes.js`) are generic.

## Usage

```bash
bash book-studio/film/setup.sh                                   # once per fresh container (idempotent)
bash book-studio/film/make.sh <path/to/book.json> <outdir>       # -> <outdir>/part1.mp4, part2.mp4, ..., parts.json
```

- One file per `film.parts[]` entry: 720x1280 (1080x1920 if the bitrate budget allows), H.264 two-pass + AAC 128k,
  `+faststart`, **each ≤ 19 MiB** (the video bitrate is computed from the duration; a file over the cap is re-encoded
  smaller). Audio −16 LUFS integrated, true peak ≤ −1.3 dBTP after AAC.
- `<outdir>/parts.json` = `[{"file": "part1.mp4", "title": "...", "dur": 112.87}, ...]`.
- Cache: `<outdir>/build/` holds the timelines, one rendered segment per scene, the scores and encode stamps. A re-run
  only redoes what changed (a scene is re-rendered when its own data, a neighbour's, or the web code changed; a score
  when its timeline or the score code changed). `FRESH=1` re-renders every frame, `WORKERS=n` sets the render
  workers (default 4), `KEEP_BUILD=0` deletes the build folder at the end (~0.5 GB for 3–4 min of film).
- No `film` in the book? A film is made from `title`, `cards` and `subtitle`.

Debug helpers: `node pipeline/render.mjs still --tl <build>/part1/timeline.json --out <dir> 3.5 12 40` renders PNG
stills; `node pipeline/render.mjs perf --tl ...` measures ms per frame.

## Scene types (`web/scenes.js`)

All text is laid out by `TXT.fit`: CJK broken by character with kinsoku rules (no punctuation at a line start),
Latin by word; breaks preferred between clauses (after ，。；？ …), then balanced lines, never inside the `key`;
the largest font size that fits the box; soft punctuation at line ends is dropped. Everything stays inside the
phone-safe area x 80–1000, y 260–1700 (checked on a stress book: 28-char lines, English, 6 long items, long numbers).
Entrances/layouts rotate by the scene's occurrence of its type (+ the book's seed), so neighbours never repeat.

| type | picture |
|---|---|
| `title` | the title gathers out of particles scattered over the whole frame (or nearby), the sub is written under a hairline; cold: a lamp cone from above, warm: a glow |
| `chapter` | numeral in a ring drawn on + hairline + title (centred), or a vertical hairline with numeral and title left-aligned |
| `line` | 4 layouts: centred gather (cold: lamp cone) · left-aligned, written character by character beside a rule · condensing up out of a hairline of light · flowing out of a point of light below. `key` glows in the mood colour and is underlined |
| `quote` | larger, slower; a glow widens behind it, motes drift in toward it, quotation hairlines (or a big “); the key breathes |
| `question` | the room goes dark, the sentence is written dim, then a lamp (or a slit of light) lights it; the ？ keeps a small light |
| `list` | head + hairline, then items written one by one (ring / number / dash markers, each kindles a spark), earlier items settle |
| `contrast` | a balance scale: the cold side tips it, the warm side swings it, it settles level; long texts switch to a stacked layout |
| `number` | counts up (0 rolls down from 9) in fixed digit slots, a ring sweeps with the count and pulses on landing, then the meaning |
| `end` | a warm point of light; the words flow out of it, the sub is written, it breathes and fades to black |

Moods: `cold` pale blue-white (other people's lamp), `warm` amber (your own light), `neutral` ink. The background
light, the dust and the score cross-fade between moods over ~2 s at each cut. Scenes cross-fade over 0.9 s; every
`draw` is a pure function of time (frames render out of order in parallel).

## Timing (`pipeline/timeline.py`)

72 BPM, 1 beat = 0.833 s. Each scene lasts a whole, **even** number of beats:
`entrance + reading load / speed + hold`, reading at ≈ 4.5 汉字/s (quotes ×0.85, questions ×0.9; a Latin word counts
1.6), with minimums per type (line 5 s, quote 7.5 s, title 7 s, end 9 s) and a 24 s cap. The moments inside a scene
(text formed, key lights, list item k, the count lands, contrast sides, end resolve) are snapped to beats and written
as `marks`, which both the templates and the score read, so music and picture line up exactly. The dafen book gives
113 s + 101 s.

## Score (`pipeline/audio/score.py`)

Composed from the timeline only, on the beat grid; GeneralUser GS SoundFont (fetched by `setup.sh` from GitHub)
via tinysoundfont, a synthetic hall, felt-piano bus. `cold` = E minor, bowed glass, single piano notes far apart, a low
pedal; `neutral` = rolled piano chords, soft strings, cello; `warm` = E major, warm pad + strings, 8th-note
arpeggio, cello. A riser and swell lead into every `quote` (brighter chords, strings + voices, the theme, a glow at the
key); `question` drops to an open fifth; list items, the count's ticks and landing, the contrast's bell/glow are hit
on their marks; `end` resolves IV–V–I with the theme's last statement and fades to silence. Each scene is then
loudness-shaped toward a mood/type target (quotes highest, questions lowest), and the part is mastered to −16 LUFS
with a 4× oversampled limiter at −1.6 dBTP.

## Render time (4 cores)

For the dafen book (2 parts, 3.6 min of film, 6 400 frames): frames ≈ 11–12 min (≈ 9 frames/s across 4 Chromium
workers; the score renders alongside), encode ≈ 2–3 min, total ≈ 14 min from scratch; a re-run with nothing changed
takes a few seconds, a text change in one scene ≈ 1 min plus the encode of that part.

## Limitations

- Fonts: Noto Serif SC / Noto Sans SC (CJK + Latin). Other scripts (Arabic, Devanagari, …) would fall back to system
  fonts and are not laid out specially (no RTL).
- A part longer than ~2.5 min still fits 19 MiB, but at a lower bitrate (the fine particle dust softens); `timeline.py`
  warns. Very long texts (beyond the schema's 28 汉字) shrink toward the minimum size instead of overflowing.
- The music is generic by design (one key, mood-driven); it does not know the meaning of the words.
- `list` shows up to 8 items, `number` parses the first number in `value` (prefix/suffix kept, e.g. `3.5亿`, `98%`,
  `1,280,000`); a non-numeric value just gathers.
