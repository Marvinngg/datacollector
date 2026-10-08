"""book.json -> one timeline per film part (<build>/partN/timeline.json) + <build>/parts.json.

Every scene lasts a whole, even number of beats of the score (72 BPM, 1 beat = 0.8333 s), long enough to read it:
    seconds = entrance + reading load / reading speed + hold        (reading speed ~ 4.5 汉字/s, slower for quotes)
The moments inside a scene that the picture and the score share (the text has gathered, the key lights up, list item
k is written, the count lands ...) are also placed on beats and written to the scene as `marks` (local seconds), so
the templates draw them and the score hits them without any other channel.

usage: python3 pipeline/timeline.py <book.json> <build_dir>
"""
import hashlib, json, math, os, re, sys

BPM = 72
BT = 60.0 / BPM
FPS = 30
CPS = 4.5            # reading speed, 汉字 per second
MAX_SCENE = 24.0     # no single scene longer than this (seconds)
TAIL = 1.2           # after the last scene of a part: the picture fades to black, the score rings out

CJK = re.compile(r'[㐀-鿿豈-﫿]')
LATIN_WORD = re.compile(r'[A-Za-z0-9]+(?:[\'’.,%-][A-Za-z0-9]+)*%?')


def units(s):
    """reading load in '汉字': CJK chars count 1, a Latin word or number counts 1.6, punctuation 0"""
    s = str(s or '')
    return len(CJK.findall(s)) + 1.6 * len(LATIN_WORD.findall(s))


def beats(sec, even=True):
    n = max(2, math.ceil(sec / BT - 0.15))
    if even and n % 2: n += 1
    return n


def snap(t, lo=0.0):
    """a local time on the beat grid (never before lo)"""
    return max(lo, round(t / BT) * BT)


def h32(s):
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)


def text_of(sc):
    out = []
    for k in ('title', 'sub', 'text', 'head', 'value', 'n'):
        if sc.get(k): out.append(str(sc[k]))
    for it in sc.get('items') or []: out.append(str(it))
    for side in ('left', 'right'):
        if isinstance(sc.get(side), dict): out += [str(sc[side].get('label', '')), str(sc[side].get('text', ''))]
    return out


def normalise(sc):
    """make a scene safe: known type, mood, required fields as strings; returns None to drop it"""
    sc = dict(sc)
    t = sc.get('type')
    mood = sc.get('mood') if sc.get('mood') in ('cold', 'warm', 'neutral') else 'neutral'
    sc['mood'] = mood
    s = lambda k: str(sc.get(k) or '').strip()
    if t == 'title':
        if not s('title'): return None
    elif t == 'chapter':
        if not s('title') and not s('n'): return None
        sc['n'] = s('n'); sc['title'] = s('title')
    elif t in ('line', 'quote', 'question'):
        if not s('text'): return None
    elif t == 'list':
        items = [str(x).strip() for x in (sc.get('items') or []) if str(x).strip()][:8]
        if not items: return None
        sc['items'] = items; sc['head'] = s('head')
    elif t == 'contrast':
        for side in ('left', 'right'):
            v = sc.get(side) if isinstance(sc.get(side), dict) else {'label': '', 'text': str(sc.get(side) or '')}
            sc[side] = {'label': str(v.get('label') or '').strip(), 'text': str(v.get('text') or '').strip()}
        if not (sc['left']['text'] or sc['left']['label']) or not (sc['right']['text'] or sc['right']['label']): return None
    elif t == 'number':
        if not s('value'): return None
        sc['value'] = s('value'); sc['text'] = s('text')
    elif t == 'end':
        if not s('text'): return None
    else:                                             # unknown type: show its text as a line, if it has any
        txt = s('text') or s('title')
        if not txt: return None
        sc = {'type': 'line', 'mood': mood, 'text': txt}
    if sc.get('key') is not None:
        k = str(sc['key']).strip()
        if not k or k not in str(sc.get('text', '')): sc.pop('key')
        else: sc['key'] = k
    return sc


def plan(sc):
    """-> (seconds needed, marks in local seconds before snapping)"""
    t = sc['type']
    if t == 'title':
        n = units(sc['title']); ns = units(sc.get('sub'))
        formed = 2.6
        sub = formed + 0.4 + n / CPS * 0.5
        return max(7.0, sub + 1.2 + ns / CPS + 2.2), {'formed': formed, 'sub': sub if ns else None}
    if t == 'chapter':
        n = units(sc['title'])
        return max(4.8, 1.9 + n / CPS + 1.8), {'formed': 1.6}
    if t == 'line':
        n = units(sc['text'])
        formed = 1.3 + min(1.2, n * 0.04)
        sec = formed + n / CPS + 1.4
        return max(5.0, sec), {'formed': formed, 'key': formed + 0.6 if sc.get('key') else None}
    if t == 'quote':
        n = units(sc['text'])
        formed = 2.2 + min(1.4, n * 0.05)
        sec = formed + n / (CPS * 0.85) + 2.4
        return max(7.5, sec), {'formed': formed, 'key': formed + 0.8 if sc.get('key') else formed + 0.8}
    if t == 'question':
        n = units(sc['text'])
        formed = 1.7 + min(1.6, n * 0.06)
        sec = formed + n / (CPS * 0.9) + 2.4
        return max(6.5, sec), {'formed': formed, 'lit': formed + 0.8}
    if t == 'list':
        head = units(sc.get('head'))
        t0 = 0.9 + (0.9 + head / CPS * 0.6 if head else 0.0)
        items, tt = [], t0
        for it in sc['items']:
            items.append(tt); tt += max(2 * BT, 0.8 + units(it) / CPS)
        return max(5.5, tt + 1.4), {'head': 0.5 if head else None, 'items': items}
    if t == 'contrast':
        L, R = sc['left'], sc['right']
        nl, nr = units(L['label']) + units(L['text']), units(R['label']) + units(R['text'])
        left = 0.8; right = left + 1.0 + nl / CPS; bal = right + 0.8 + nr / CPS
        return max(7.0, bal + 1.8), {'left': left, 'right': right, 'balance': bal}
    if t == 'number':
        n = units(sc.get('text'))
        c0, c1 = 0.6, 3.0
        txt = c1 + 0.5
        return max(6.0, txt + 0.6 + n / CPS + 1.4), {'count': c0, 'land': c1, 'text': txt if n else None}
    if t == 'end':
        n = units(sc['text']); ns = units(sc.get('sub'))
        formed = 2.8
        sub = formed + 0.6 + n / CPS * 0.5
        return max(9.0, sub + ns / CPS + 4.0), {'formed': formed, 'sub': sub if ns else None, 'resolve': formed}
    return 5.0, {}


def snap_marks(marks, dur):
    out = {}
    for k, v in marks.items():
        if v is None: continue
        if isinstance(v, list):
            out[k] = [round(min(dur - BT, snap(x, BT)), 4) for x in v]
        else:
            out[k] = round(min(dur - BT, snap(v, BT * 0.5 if k in ('count', 'head', 'left') else BT)), 4)
    # list items must stay in order and at least one beat apart
    if 'items' in out:
        it = out['items']
        for i in range(1, len(it)): it[i] = round(max(it[i], it[i - 1] + 2 * BT), 4)
        if len(it) > 1 and it[-1] > dur - 2 * BT:          # squeezed: spread evenly instead
            a, b = it[0], dur - 2 * BT; n = len(it)
            out['items'] = [round(snap(a + (b - a) * i / max(1, n - 1)), 4) for i in range(n)]
    return out


def fallback_parts(book):
    """a book without a film: title, its cards as lines/quotes, the end"""
    sc = [{'type': 'title', 'title': book.get('title', ''), 'sub': book.get('subtitle', ''), 'mood': 'cold'}]
    for c in book.get('cards') or []:
        sc.append({'type': 'quote' if c.get('em') else 'line', 'text': c.get('q', ''), 'key': c.get('em'),
                   'mood': c.get('tone') if c.get('tone') in ('cold', 'warm') else 'neutral'})
    sc.append({'type': 'end', 'text': book.get('subtitle') or book.get('title', ''), 'mood': 'warm'})
    return [{'title': book.get('title', ''), 'scenes': sc}]


def main():
    src, build = sys.argv[1], sys.argv[2]
    book = json.load(open(src, encoding='utf-8'))
    parts = ((book.get('film') or {}).get('parts')) or fallback_parts(book)
    bid = str(book.get('id') or os.path.basename(os.path.dirname(os.path.abspath(src))))
    seed0 = h32(bid)
    os.makedirs(build, exist_ok=True)
    index, gi, occ = [], 0, {}
    for pi, part in enumerate(parts):
        scenes, t = [], 0.0
        raw = [normalise(s) for s in part.get('scenes') or []]
        raw = [s for s in raw if s]
        if not raw: continue
        for si, sc in enumerate(raw):
            sec, marks = plan(sc)
            sec = min(sec, MAX_SCENE)
            if sc['type'] == 'end' or si == len(raw) - 1: sec += 0.6   # the last scene breathes a little longer
            nb = beats(sec)
            dur = nb * BT
            k = occ.get(sc['type'], 0); occ[sc['type']] = k + 1
            scenes.append({**sc, 'i': si, 'gi': gi, 'occ': k, 'seed': (seed0 + gi * 7919) % 100003,
                           'start': round(t, 4), 'end': round(t + dur, 4), 'beats': nb,
                           'marks': snap_marks(marks, dur)})
            t += dur; gi += 1
        dur = round(t + TAIL, 4)
        moods = [s['mood'] for s in scenes]
        tl = {'fps': FPS, 'width': 1080, 'height': 1920, 'bpm': BPM, 'beat': BT, 'duration': dur,
              'book': {'id': bid, 'title': book.get('title', ''), 'subtitle': book.get('subtitle', '')},
              'part': {'index': pi + 1, 'count': len(parts), 'title': part.get('title') or book.get('title', '')},
              'seed': seed0, 'scenes': scenes}
        d = os.path.join(build, f'part{pi + 1}')
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, 'timeline.json')
        new = json.dumps(tl, ensure_ascii=False, indent=1)
        if not os.path.exists(p) or open(p, encoding='utf-8').read() != new:   # keep mtime when unchanged
            open(p, 'w', encoding='utf-8').write(new)
        index.append({'part': pi + 1, 'title': tl['part']['title'], 'dur': dur, 'scenes': len(scenes), 'dir': d})
        print(f"part{pi + 1}  {tl['part']['title']:<24} {len(scenes):3d} scenes  {dur:7.2f}s  moods {''.join(m[0] for m in moods)}")
        if dur > 165: print(f'  warning: part{pi + 1} lasts {dur:.0f}s (> 2.5 min): the bitrate will be low; consider splitting it')
    json.dump(index, open(os.path.join(build, 'parts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
