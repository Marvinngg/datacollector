"""Print just what you need from a script or the timeline, instead of reading whole JSON files (saves AI tokens).
  python3 pipeline/tools/show.py outline               # chapters -> beats: id, type, first words, duration
  python3 pipeline/tools/show.py e2b3                  # one beat: its JSON in the script + its times in build/timeline.json
  python3 pipeline/tools/show.py type matrix           # every beat that uses a template (ids + params), to copy a working example
  add  --script script/xxx.json  to read another script (default: script/v4.json)"""
import json, os, signal, sys
signal.signal(signal.SIGPIPE, signal.SIG_DFL)   # quiet when piped into head

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[1:]
script = f'{ROOT}/script/v4.json'
if '--script' in args:
    i = args.index('--script'); script = os.path.join(ROOT, args[i + 1]); del args[i:i + 2]
S = json.load(open(script))
tlp = f'{ROOT}/build/timeline.json'
TL = json.load(open(tlp)) if os.path.exists(tlp) else {'beats': []}
tb = {b['id']: b for b in TL['beats']}
beats = [(c, b) for c in S['chapters'] for b in c['beats']]

def first(b):
    v = b['visual']
    if b.get('lines'): l = b['lines'][0]; return (l if isinstance(l, str) else l['text'])[:24]
    return (v.get('q') or v.get('text') or v.get('title') or '')[:24]

if not args or args[0] == 'outline':
    for c in S['chapters']:
        print(f"{c['id']} {c['num']} {c['title']}")
        for b in c['beats']:
            t = tb.get(b['id']); d = f"{t['end'] - t['start']:5.1f}s" if t else '     '
            print(f"   {b['id']:<9} {b['visual']['type']:<15} {d}  {first(b)}")
    if TL.get('duration'): print(f"total {TL['duration'] / 60:.1f} min")
elif args[0] == 'type':
    for c, b in beats:
        if b['visual']['type'] == args[1]:
            print(b['id'], json.dumps(b['visual'], ensure_ascii=False)[:400])
else:
    hit = [b for c, b in beats if b['id'] == args[0]]
    if not hit: sys.exit(f'no beat {args[0]} in {os.path.relpath(script, ROOT)}')
    print(json.dumps(hit[0], ensure_ascii=False, indent=1))
    t = tb.get(args[0])
    if t: print(f"timeline: {t['start']:.2f}s -> {t['end']:.2f}s; steps at", [s.get('t') for s in t['visual'].get('steps', [])])
