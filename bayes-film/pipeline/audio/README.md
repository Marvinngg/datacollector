# Score: 《先别急》

`python3 pipeline/audio/score.py [--plot] [--stems]` reads `build/timeline.json` and `build/cues.json` and writes
`build/audio/mix.wav`: stereo, 48 kHz, −16 LUFS integrated, true peak ≤ −1.3 dBTP, length = timeline duration.
A build takes about 3 minutes. `--plot` writes `build/audio/score.png` (envelope + spectrogram). `--stems` prints
music/fx loudness per step. `bash pipeline/audio/preview.sh` muxes `build/video.mp4` with the mix into
`build/preview.mp4`.

The score has no hard-coded seconds. Beats are found by their visual type (`pitch`, `gut`, `title`, `thousand`, …)
and steps by name. Every composed onset sits on the 80 BPM grid (beat = 0.75 s, bar = 3 s), using the BPM from the
timeline. Sync hits land exactly at the cue times.

## Material

- **Key**: D minor, ending in D major (with the 9th).
- **Theme "先别急"**: F5 – E5 – A4, a falling sigh, answered by a climb back to D. It is heard at the title
  (celesta + piano over Dm add9), in e3's cadence (`chain`: F E | D E C♯ | D) and in the ending, in half time.
  Its first note finally becomes **F♯** on the last chord.
- **Ostinati**: a Reich-like piano cell of 6 eighths running against the 4-beat bar (e1, e3); a marimba cell (e3);
  marimba + vibraphone in 3+3+2 (e4); synth 16th arpeggios (e5).
- **Sounds**: GeneralUser GS (piano, celesta, glockenspiel, vibraphone, marimba, harp, pizzicato, slow and tremolo
  strings, cello, contrabass, choir, warm pad, timpani, taiko, side stick, clap) plus synthesised pluck bass and
  arpeggios, kick and heartbeat, hats, shakers, glass grains, bells, a Shepard riser and noise sweeps. Reverb is
  convolution (a 2.6 s hall and a 7 s "big" space).

## Form

| chapter | music |
|---|---|
| e0 b01 pitch | A "sales" groove: muted pluck bass in 8ths opening its filter, ticking 16ths, kick from `money`, staccato strings and pizzicato from `tag1`, a riser. Harmony Dm, B♭, F, C. At `q1` (hush) everything drops to one sustained A. |
| e0 b02 gut | A heartbeat on every beat (8ths in `more`), a tremolo-string semitone cluster climbing every 2 beats, a low pulse, the riser and a Shepard tone. At `freeze` a dead cut: digital silence after a tiny glass crack. |
| e0 b03 title | The shatter is a crystalline burst of about 90 glass grains plus celesta into the 7 s space, then near silence. The gather is a reversed Dm9 swell landing exactly on `sub`. The title is a low piano D, a Dm add9 pad/strings/choir chord and the theme's head. |
| e1 一成 | The plain piano ostinato enters sparse and fills in. Bead ticks come from the cues. `gap` brings a low cello/bass open fifth with a thinned ostinato. In `nine`, the membrane is shimmering high strings over a brightening harmony (B♭maj7♯11, C6, **Dmaj9**: the 50 % illusion). At `rare` it cracks and goes back to plain D minor. |
| e2 竞争世界 | Choir, strings and pad with slow chords. `form` swells. In `orbit`/`flow`, a harp turns slowly in quarter notes with celesta above. The `reveal` has a deep D sub swell and a choir/strings cluster (D E♭ E A B♭). E♭ and B♭ fade out, so at `real` it settles into B♭maj7♯11 (awe). `humble` ends on an unresolved Asus4. |
| e3 一次乘法 | `pie`: marimba with nervous syncopated pizzicato stabs. `tug`: a low rocking bass ostinato. `equation`: piano + marimba + bass + shakers + side stick, with strings rising into `cancel` (reversed cymbal into a bell chime, then 1.5 beats of space). `only` is F major and clear. In `evidence1`/`evidence2` the stamps are taiko + timpani + low boom, then the full pulse (adds a soft kick) and strings under `ratio`; `note`/`ghost` pull back. `noise`: the pulse carries on unchanged under the ×1 thud. `chain` is the theme cadence on piano, strings and celesta, landing on Dm9 with timpani. |
| e4 概率不是决定 | Marimba and vibraphone in 3+3+2 over G, B♭, C, Dm/F, F. `heavy` gets a low swell, `slide` a descending vibraphone line. `split`/`both` set two motifs in counterpoint, in dotted quarters: vibraphone/celesta rises F G A C♯ → D5, cello/piano falls B♭ A G E → D3; both arrive on D, then echo softly. `gap`: a 6 s Shepard riser, then a still Dsus4 and one glint. |
| e5 人与 AI | `ai`: detuned synth 16th arpeggios (a second layer in 3-against-4 from `flood`, 32nds in `fast`), pluck bass, four-on-the-floor kick, clap, hats and glitches growing denser, ending on A (unresolved). At `freeze` a hard cut: true silence, and even the reverb tails die. `cursor`: a barely-there low D under the typing clicks. `decide`: a warm B♭maj9 chord. `rope`: an exact mechanical tick and marimba pulse with no humanising. `who`: a warm string swell. |
| e6 尾声 | `flash`: the e0 heartbeat, pulse and cluster return. From `slow` the music goes half time: piano roots and sustained strings, with the theme on piano + strings phrased to steps s1–s4, l1, l2, and a soft bell on each landing. `final`: D major add9 with F♯5 on top, the longest and quietest tail, reaching digital silence at the end of the step. |

## Cues (`build/cues.json`)

Every type in the BRIEF vocabulary has a handler: type, punch, chip, hush, riser, heartbeat, freeze, shatter,
gather, title, ticks, sweep, stamp, roll, whoosh, swell, cancel, thud, click, glitch, stream, silence, resolve.
Unknown types are ignored. The handlers are pitched to the current chord from the score's harmony map, so hits stay
in key. They share a registry with the form, which avoids double hits. The form places its own key hits (shatter,
gather, title, freeze, cancel, stamp…) only when the template does not cue that type in that step.

- Sync hits sit under the music, at a level set by chapter (e1/e2 0.7–0.75, e3 0.85, e6 0.6, the final step 0.18).
- `ticks`: notes are quantised to the 32nd (or 16th) grid, D minor pentatonic, pitch p0 → p1. A run of 1000 beads
  becomes about 47 soft notes plus a faint glitter bed, never a machine-gun.
- `roll`: 16th arpeggio over the D minor scale, whose pitch follows the number.
- `hush`: the full drop only in the pitch; elsewhere a two-beat dip.
- `title` outside the title beat: a soft bell.
- `stream`: digital blips in e5, soft pentatonic glitter elsewhere, scaled by `level`.
- `freeze` / `silence`: music and fx are gated to digital zero for the step (or `dur`). Nothing placed before the
  gate rings on afterwards: SF2 tails are truncated and the reverb is convolved per segment between gates. Only
  tiny caret/typing clicks (post bus) may sound inside a freeze.
