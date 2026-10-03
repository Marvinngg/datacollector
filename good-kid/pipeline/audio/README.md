# Score: 《打分的人走了》

`python3 pipeline/audio/score.py [--plot] [--stems]` reads `build/timeline.json` and `build/cues.json` and writes
`build/audio/mix.wav`: stereo, 48 kHz, −16 LUFS integrated, true peak ≤ −1.3 dBTP, length = timeline duration.
A build takes about 4 minutes on 4 cores.

- `--plot` writes `build/audio/score.png` (envelope + spectrogram).
- `--stems` prints the loudness of the piano, music and fx buses per step.

The report printed at the end shows:

- per-chapter integrated and loudest-3 s loudness, and RMS per beat;
- each silence and its peak (digital zero, or the post-bus ticks only);
- the share of composed onsets on the 16th grid;
- the level after the last step.

`GK_GRID=1` also lists any composed onsets that are off the grid.

`bash pipeline/audio/preview.sh` muxes `build/video.mp4` with the mix into `build/preview.mp4`. With `REBUILD=1` it first
regenerates the cues and the score.

Nothing in the score is written in seconds:

- Beats are found by their visual type (`feed`, `answers`, `darkq`, `reunion`, … `end`) and steps by name.
- Chords are laid on whole beats from each step's start, and every composed onset sits on the 72 BPM grid
  (beat = 0.8333 s). The felt-piano "hand" adds at most ±12 ms of human timing.
- Sync hits land exactly at the cue times. When a template cues the moment, the form uses that time: the phone's
  `off`, the lamp `off`s, the `freeze`, `fall`/`land`, `title`, `stamp`, the last `print`.
  When it doesn't, the form places the hit itself at the step start.

## Material

- **Instruments** (GeneralUser GS):
  - *Felt piano.* A grand at soft velocities on its own bus, low-passed at 2.6 kHz with a −6 dB shelf at 6 kHz, plus a
    synthesised hammer/key "thock" under every note.
  - *Others.* Slow strings, violin, cello, double bass, tremolo strings, pizzicato, warm pad, bowed glass, voice oohs,
    music box, celesta, glockenspiel, vibraphone, harp, steel guitar, tine EP.
- **Synthesised sounds:** room tone with an E-tuned phone hum, thumb swish, electrical click, pen nib, receipt printer
  (stepper whine gated in 16ths), crowd murmur and laughter, wind, a descending Shepard texture, detuned shimmer, warm
  "glow" tones, soft thumps.
- **No drums.** The only pulse instruments are the scoring clock, the rules' metronome, the pendulum and the printer.
- **Reverb:** two convolution spaces, a 2.8 s hall and a 7.5 s "big" space. The reverb is computed per silence-delimited
  segment, so nothing rings into a silence.
- **Key:** E minor, turning to E major at `take`.
- **Theme, "the waiting child":** E4 – B4 – A4 – G4 – **F♯4** (held). It opens on a fifth, steps down and stops on
  the 2nd degree: a question waiting for a score.

## Form

| ch | music |
|---|---|
| **e0** feed | **1 a.m.:** room tone, a faint hum tuned to E, single felt-piano notes far apart. A soft pad breathes in with each card (Cmaj7, Am9, Cmaj9), and every swipe is an airy swish. At `stare`, a low cello E. |
| **e0** answers | `facts` gets three plain, correct chords (Em, G, D). In `fill`, a mechanical 8th pulse runs under the template's `ticks`: the scoring clock on a 32nd grid, faintly pitched every quarter. `right` is a neat little cadence (G, D/F♯). In `gray`, the colour leaves one tone at a time: F♯, then D, then G, down to an **open fifth** E–B. |
| **e0** darkq | The open fifth thins out. At the phone's `off` there is a tiny click, then **digital silence** until `q`. At `q` the theme is heard alone, very quiet, its held F♯ kept alive by a breath of a high violin. |
| **e1** reunion | Their warmth comes through a wall: a crowd murmur, a soft tine-EP comp and a pad in C major, all low-passed at 950 Hz. Laughter rolls in with each story glow, and the glows sit behind the wall too. In `wait`, your E4 and B4 sound close and clear, and nobody answers. At `none` it **stops** (the bus is cut in 0.12 s): only the room, then one low E. |
| **e1** scorer | **School, in G major:** the theme made correct and complete on music box + celesta, an orderly piano 8th pulse, pizzicato roots, and the warm chord of being seen. Each red pen is a nib stroke and a small bright bell. |
| **e1** leave | **The layers go out with the lamps:** the template's two `off`s remove the music box, then the pulse. The warm chord fades as the last beam fades. One violin B4 remains, then silence. At `title` comes a deep Em9: low E piano, double bass, cellos, strings, oohs. The theme follows in the piano: the first-half peak. `lamp` is Cmaj7 → Am9 with the theme falling. `held` ends unresolved on B7sus4. |
| **e2** fuel | **Praise:** each praise word (the template's `glow` i/n) is a glockenspiel/bell chime whose bowed-glass tone keeps burning. They stack into G – B – D – E – F♯ – A: the fuel. At `rule` the chord turns to Am9 → F♯m7♭5 → B7sus4. |
| **e2** weightless | `met` stands on a steady low E pedal with plain beat chords. At `gone` **the bass is cut** and high strings float with a slow detuned shimmer; the template's swell stays high, with no cello. `fork` stammers the theme: E … B … A — E B. |
| **e2** rules | **The scoring form:** a dry composed metronome on every beat (no room), dry pizzicato, staccato off-beat piano. The 个性 scribble is a free run of piano notes off the grid. The red **0** is a nib and a muted thud, and the metronome stops there. `end` is tender. |
| **e3** honest | `bike` brings back the feed's warm pad and the sea wind. `q` is an open rising figure. "大概不会" gets a small falling dyad. `what` is the theme's head over Bsus4. |
| **e3** freedom | **Their freedom, heard from outside:** a steel guitar picking open-string voicings in 8ths (Em7, Cadd9, G, D/F♯), wind and strings. At `stamp` the guitar stops and a **Bsus4 tremolo + high F♯ swells and never resolves**. At `free` the swell opens into Gadd9 – D/F♯ – Em7, full strings, oohs and a wind gust. `need` settles back to Cmaj7 → E minor. |
| **e4** bills | **The printer:** overlapping receipt cues become one printer, snapped to the 16th grid and woven into a dry 16th piano/pizzicato ostinato in E minor. `pay` is sober. |
| **e4** trap | **The school pulse returns, smug and neat** (G major, music box). The re-sort ticks climb a celesta scale to #1. At the template's `freeze` there is a **hard stop**: silence until `rank`, with only the scoring clock's tiny ticks inside it. At `rank`, one cold sine B5. |
| **e4** exchange | **A pendulum:** one note per beat, panned with the drawn swing (period 8 beats), Em9 ↔ Cmaj7, harp answering on the other side. The swing's ticks are soft wooden tocks. At `empty` the theme plays and **nobody answers**, over a low E; the examiner's lamp clicks off. |
| **e5** yourbill | Printing over a low E pulse. **试错权** lands, as its print finishes, on a low heavy Cmaj9: C1 piano, double bass, a soft thump. |
| **e5** never | Three soft notes, **B4 → C5 → D♯5**, over Am9, F♯m7♭5 and B7. The leading tone is left unresolved. |
| **e5** fall | `cliff`: a trembling low B with its flat ninth (C), a high F♯ harmonic and wind. At `step` a breath is held. At `fall` **the floor drops out**: a 7–8 s descending Shepard texture, wind and glints falling past. At `land` comes a single low **C1** and a bloom of strings + oohs (Cmaj9), with a tender line on top. In `floor` the theme is harmonised warmer (Cmaj7, Am7, **D**): the waiting F♯ is finally held, as the third of D. |
| **e6** stand | `up` is a slow swell toward the light (C, D, G/B, Cadd9). `kid` brings the theme exactly as at 1 a.m., an octave up: the child who waits. |
| **e6** tries | **The tries:** a light piano pulse (G, C, D, Em) with little imperfect figures, a hand still learning: late, early, uneven. t2 carries the crossed-out character, so it gets a **wrong note (A♯) left in**. t3 falters mid-phrase. Each kindling is a warm glow tone. `fine`: nothing happens, the pulse goes on. |
| **e6** lamp | **E major:** `take` goes Cmaj7 → Dadd9 → **E (add9)**, ♭VI–♭VII–I. The G♯ arrives with a full strings swell and a glow. |
| **e6** end | `years` **sings the theme in E major**: piano + violins (8va) + cellos (8vb) + oohs, over E, Amaj7, Bsus4, B. `try` is "Have a try", the answer: the F♯ no longer waits, it rises G♯, B → **E5**, plagal (A add9 → E). `life` is a long warm Eadd9 with the theme's head on a high celesta. It fades to digital silence at the end of the last step. |

## Cues (`build/cues.json`)

There is a handler for every type in the BRIEF vocabulary. Unknown types (`chapter`, `beat`, …) and missing parameters
are handled safely. The form and the cues share a registry (`seen`), so the same hit is never played twice.

| cue | sound (by context) |
|---|---|
| `type{dur}` | Soft key/pencil taps, never busy. |
| `swipe` | A thumb across glass: a band-passed air swish moving L→R. |
| `tick` | `rules`: a dry box tick. `exchange`: a wooden tock. `trap`: the ranking notching up (celesta). `fuel`/`tries`: a tick + a celesta glint. Elsewhere: a soft tick. |
| `ticks{dur,n,p0,p1}` | The scoring clock: up to n ticks on the 32nd grid, faintly pitched every 4th. Inside a freeze it is unpitched and almost inaudible (post bus). |
| `pen` | A nib stroke + a small bright reward bell (the scorer). Exceptions: in `rules` the r-steps get only the dry nib, and `score` gets the red 0 as a muted thud. In `tries`, your own correction gets no reward. In the bills, a dull tick. |
| `stamp` | In `freedom`: the held, unresolved Bsus4 tone until `free`. In `yourbill`: the heavy chord. Elsewhere: a soft heavy press. |
| `print{dur}` | The receipt printer on the 16th grid. Overlapping prints merge into one longer run. |
| `click` | A tiny electrical click. |
| `off` | `darkq`: the phone's click, then real silence until `q`. `leave`/`scorer`/`exchange`: a lamp's relay + thump (`soft` = quieter). The lamp offs in `go` also remove the school's layers. |
| `hush` | A breath: −4 dB for a beat, back over 2 beats. Just before a `title` it ends exactly on the title. |
| `swell{dur}` | Strings + cello toward the chord at t+dur. In `weightless` high strings only, with no bass. In `stand` it is composed into the form. |
| `whoosh{dur}` | A wind gust moving across. |
| `fall{dur}` | In `fall`: the Shepard descent + wind + falling glints, lasting until the landing. Elsewhere a short sinking shimmer. |
| `land` | In `fall`: the low C1 + strings bloom. Elsewhere a soft footfall. |
| `glow` | A warm amber tone on the current chord. `fuel`: the stacking praise chimes. `reunion`: behind the wall. `darkq`: barely a breath. |
| `title` | `leave`: the deep title chord. `yourbill`: the heavy 试错权 chord. `end`: a high warm light. `darkq`: nothing (the theme is the title). Elsewhere a soft low note + bell. |
| `freeze` | Hard stop to digital zero on music + fx + reverb until the step ends (in `trap`: until `rank`). |
| `resolve` | A soft harp arpeggio of the current chord with a glow on top. |

## Mix

- **Buses:** felt piano, music, the reunion's low-passed "blur", fx (level set per chapter; the last step is barely
  audible), and a post bus that bypasses silences.
- **Section trims by visual type:** the 1 a.m. beats sit 2.5–4 dB lower so the film can open in near silence.
- **Mastering:** a 30 Hz high-pass, then integrated normalisation to −16 LUFS and a 4× oversampled look-ahead limiter
  at −1.3 dBTP.
- **Ending:** the last 2.5 s of the final step fade to digital zero, and the 0.5 s timeline tail is silent.
