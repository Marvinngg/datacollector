# 播客流水线 · book.json → podcast.mp4

Turns the `podcast` section of any `book.json` (see `../SCHEMA.md`) into a finished two-host episode. No human in the loop.

```bash
bash book-studio/podcast/setup.sh                                   # once per fresh container
bash book-studio/podcast/make.sh book-studio/books/dafen/book.json book-studio/books/dafen/out
#  -> out/podcast.mp4   AAC 112 kb/s + 720x720 still cover at 1 fps, +faststart, <= 19 MiB
#  -> out/podcast.json  {"file","dur","lines":[{"t","end","who","text"}], "title","hosts","voices","loudness"}
```

`podcast.json` `lines[0]` is the spoken title over the intro sting; the rest are the book's lines in order, `t`/`end` in
seconds from the start of the file (for a live transcript). Intermediates and the synthesis cache go to
`<outdir>/build/podcast/`. Env: `PODCAST_ASR=0` (skip the per-line ASR check), `PODCAST_COVER=1280x720`,
`PODCAST_VERIFY=0`.

## Voices — built-in synthetic speakers only

Both hosts are built-in speakers of **Kokoro-82M v1.1-zh** (sherpa-onnx, Apache-2.0), chosen by speaker id in
`voices.json`. No voice cloning, no voice prompts, no reference recordings (ZipVoice is deliberately not used).

VOICES_SECTION

## What the pipeline does (`build.py`)

1. **Text** (`lib.normalize`): markdown / quotes / brackets / dashes / ellipses → plain Chinese punctuation;
   numbers → 汉字 (integers with 万/亿, decimals, %, years read digit by digit, 1:30 → 一点三十分, ranges 3-5 → 三到五,
   2个 → 两个, phone numbers digit by digit); ALL-CAPS acronyms spelled out (AI → A I); other English goes to the
   model's English lexicon. Lines over ~48 characters are split at sentence ends, then commas (`lib.split_long`).
2. **Synthesis**: each chunk is synthesised and trimmed; chunks are joined with 0.24 s (after 。！？) / 0.16 s pauses.
   If the SenseVoice ASR model is present every line is transcribed; when the pinyin error rate exceeds 8 % the line is
   re-synthesised slower, then re-punctuated, and the best take is kept.
3. **Levels**: 24 → 48 kHz, 70 Hz high-pass; each voice normalised to its own median (−20 LUFS) with at most ±2 dB
   per-line correction, so both hosts sit at the same level without flattening the delivery.
4. **Pacing** (deterministic per book id + line index): speaker change 0.33–0.55 s; same speaker 0.29–0.39 s;
   continuation after a trailing comma 0.17–0.23 s; +0.22 s after a question; +0.08 s after a long line.
5. **Music** (`music.py`, GeneralUser GS SoundFont via tinysoundfont, original): a ~9 s intro sting in D♭ major,
   66 BPM — warm pad, Rhodes-style electric piano, soft bass, a music-box "lamp" motif — under which host A reads the
   title; and a ~13 s outro that enters quietly under the last line and swells after it. No bed under the dialogue.
   The music is side-chain ducked 15 dB under speech.
6. **Master**: −16 LUFS integrated, look-ahead true-peak limiter; after AAC encoding the result is measured with
   ffmpeg `ebur128` and re-encoded if the true peak exceeds −1 dBTP.
7. **Package**: `cover.py` renders a night-sky cover with an amber lamp and the title in Noto Serif SC (PIL);
   ffmpeg muxes it as a 1 fps H.264 still with AAC audio, `+faststart`.

`verify.py <outdir>` (run by make.sh) checks size, streams, faststart, duration, loudness (ebur128) and timestamps, and
ASR-transcribes six lines cut from the final AAC audio.

## Files

| file | |
|---|---|
| `make.sh` | the one command (build + verify) |
| `setup.sh` | pip deps; Kokoro v1.1, SenseVoice ASR, SoundFont, fonts → `models/` (reused from `earth-online/models/` if present) |
| `build.py` | the pipeline |
| `lib.py` | model lookup, Kokoro wrapper, text normalisation, splitting, pitch tracker, ASR helpers |
| `music.py` | intro / outro stings (`python3 music.py <dir>` renders them alone) |
| `cover.py` | cover frame (`python3 cover.py book.json out.png [720x720\|1280x720]`) |
| `verify.py` | checks on a finished episode |
| `cast.py` | the objective voice audition; results in `cast/report.json`, `cast/stage1.jsonl` |
| `voices.json` | the chosen speakers |

Licences: Kokoro (Apache-2.0), SenseVoice (model licence in its folder), GeneralUser GS (its own permissive licence),
Noto Serif SC (SIL OFL 1.1).
