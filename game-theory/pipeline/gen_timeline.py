"""Silent-mode timeline: script with on-screen text only (no narration) -> build/timeline.json.
Every "line" is one caption/screen of text; how long it stays is its reading time:
    base + chars / cps   (+ pace.pause if the line is marked {"text": ..., "pause": true})
Question beats get three phases (read → pause with countdown → reveal); every chapter with a "next"
ends with an automatic breath card. The output has the same shape as the narrated timeline
(chapters / beats / lines), so the runtime, templates and audio code work unchanged; "mode": "silent"
tells them there is no voice.
usage: python3 pipeline/gen_timeline.py [--script script/v2.json] [--out build]"""
import argparse, copy, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--script', default=f'{ROOT}/script/v2.json')
ap.add_argument('--out', default=f'{ROOT}/build')
args = ap.parse_args()
S = json.load(open(args.script))
P = {'cps': 3.6, 'base': 1.4, 'pause': 4.5, 'lead': 0.6, 'tail': 1.0, 'card': 3.2,
     'q_pause': 7.0, 'q_reveal': 3.2, 'breath': 4.5, **S.get('pace', {})}
NO_CAPTION = {'line', 'remember', 'question', 'breath', 'endcard', 'title', 'knowledge_tree'}

def chars(t):  # reading load: CJK and letters/digits count, punctuation does not
    return len(re.sub(r'[\s，。、：；？！,.:;?!…—“”「」（）()·≠+\-=]', '', t))

def visual_read(v):
    """seconds needed to read the text a template draws (card/list items, compare panels)"""
    txt = []
    for it in v.get('items', []):
        txt += [it.get('title', ''), it.get('desc', '')] if isinstance(it, dict) else [str(it)]
    for side in ('left', 'right'):
        if side in v: txt += [v[side].get('title', '')] + v[side].get('items', [])
    n = len([x for x in txt if x])
    return sum(chars(x) for x in txt) / P['cps'] + 0.5 * n if n else 0


def read_time(t):
    return P['base'] + chars(t) / P['cps']

t = 0.0
chapters, beats, lines = [], [], []
by_id = {b['id']: b for c in S['chapters'] for b in c['beats']}
for c in S['chapters']:
    c_start = t
    card = [round(t, 3), round(t + P['card'], 3)]; t += P['card']
    cbeats = copy.deepcopy(c['beats'])
    if c.get('next'):
        cbeats.append({'id': f"{c['id']}br", 'lines': [], 'hold': P['breath'],
                       'visual': {'type': 'breath', 'num': c['num'], 'title': c['title'], 'next': c['next']}})
    for b in cbeats:
        vis = copy.deepcopy(b['visual'])
        if 'ref' in vis:
            base = copy.deepcopy(by_id[vis['ref']]['visual']); base.update({k: v for k, v in vis.items() if k != 'ref'})
            base['ref'] = vis['ref']; vis = base
        b_start = t; blines = []
        if vis['type'] == 'question':
            r = P['base'] + chars(vis['q']) / P['cps'] + sum(0.5 + chars(o) / P['cps'] for o in vis['options'])
            vis['phases'] = {'read': [0, round(r, 3)], 'pause': [round(r, 3), round(r + P['q_pause'], 3)],
                             'reveal': [round(r + P['q_pause'], 3), round(r + P['q_pause'] + P['q_reveal'], 3)]}
            t += r + P['q_pause'] + P['q_reveal']
        else:
            t += P['lead'] if b['lines'] else 0
            for k, ln in enumerate(b['lines']):
                ln = ln if isinstance(ln, dict) else {'text': ln}
                d = read_time(ln['text']) + (P['pause'] if ln.get('pause') else 0)
                item = {'id': f"{b['id']}_{k}", 'text': ln['text'], 'start': round(t, 3), 'dur': round(d, 3),
                        'pause': bool(ln.get('pause'))}
                blines.append(item); lines.append(item); t += d
            t += P['tail'] if b['lines'] else 0
            t = max(t, b_start + b.get('hold', 0), b_start + min(20.0, P['lead'] + visual_read(vis) + sum(l['dur'] for l in blines) * 0.35))
        if vis['type'] == 'remember' and 'text' not in vis and blines: vis['text'] = blines[0]['text']
        vis['_caption'] = vis['type'] not in NO_CAPTION and vis.get('caption') is not False
        for st in vis.get('steps', []):
            k = st.get('at', 0)
            st['t'] = round((blines[k]['start'] if k < len(blines) else b_start) + st.get('delay', 0), 3)
        beats.append({'id': b['id'], 'chapter': c['id'], 'start': round(b_start, 3), 'end': round(t, 3),
                      'visual': vis, 'lines': blines})
    chapters.append({'id': c['id'], 'num': c['num'], 'title': c['title'], 'part': '', 'next': c.get('next', ''),
                     'start': round(c_start, 3), 'end': round(t, 3), 'card': card})
    print(f"{c['id']} {c['num']} {c['title']:<10} {c_start:7.1f} -> {t:7.1f}  ({t - c_start:5.1f}s)")

tl = {'mode': 'silent', 'fps': 30, 'width': 1920, 'height': 1080, 'duration': round(t + 0.5, 3), 'sample_rate': 48000,
      'title': S['title'], 'credit': '', 'chapters': chapters, 'beats': beats, 'lines': lines}
os.makedirs(args.out, exist_ok=True)
json.dump(tl, open(f'{args.out}/timeline.json', 'w'), ensure_ascii=False, indent=1)
print(f"total {tl['duration']:.1f}s = {tl['duration'] / 60:.1f} min, {len(lines)} screens, {len(beats)} beats")
