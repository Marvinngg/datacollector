"""v4: no subtitles. script/v3.json -> script/v4.json.
In v3 every picture beat carried its sentences as a caption strip at the bottom of the frame: that is a subtitle.
v4 separates the two kinds of screen completely:
  - text beats (`line`, `remember`, `question`, ...) carry all the sentences, one sentence a screen, full frame;
  - picture beats have NO `lines`. They play on their own clock (`steps[].dur`, or `hold`), and anything the
    viewer must read inside the picture is an in-scene label (step `label`, item `desc`, HUD numbers).
A picture's sentences become a text screen before it (the set-up: what to watch for) and/or after it
(the conclusion). A picture whose explanation has two halves is split into a ref chain with text between.
gen_timeline.py refuses any picture beat that still has `lines`, so a subtitle cannot come back by accident.
usage: python3 pipeline/tools/v4_nosubs.py"""
import copy, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S = json.load(open(f'{ROOT}/script/v3.json'))
TEXT = {'line', 'remember', 'question', 'breath', 'endcard', 'title', 'knowledge_tree'}

# B = text screens before, A = text screens after ("…|P" = pause line), D = seconds per step (in order),
# H = hold for a picture without steps, items = {i: fields}, labels = {step i: label}, stagger = card/list stagger,
# split = [[step indices, D, B, A], ...] (the first part keeps the id; later parts ref it)
E = {
  'e1b1': dict(B=['每一门学科，都是一副眼镜。'], H=10),
  'e1b2': dict(B=['贝叶斯、控制论，研究你和一个系统。', '博弈论，研究你和另一个人。'], D=[3.5, 5.5]),
  'e1b3': dict(B=['你看他怎么选，他也在看你。'], H=9),
  'e1b4': dict(H=8),                      # the picture itself says 3 = 3
  'e1b5': dict(B=['计谋，假设对方比你笨。', '博弈论，假设对方和你一样聪明。|P'], D=[3.5, 5.5]),
  'e1b7': dict(B=['看局，看四样。'], D=[5, 6, 6, 8],
               items={0: {'desc': '几个人在局里'}, 1: {'desc': '能出哪些招 · 高手会压缩对方的选择'},
                      2: {'desc': '每一招值多少 · 理性，就是自私地算清账'}, 3: {'desc': '谁知道什么 · 告诉对方什么，也是一招'}}),
  'e1b8': dict(B=['好的玩家，有四种心态。'], D=[15], stagger=3.0),
  'e2b2': dict(B=['轮流出，像下棋。'], D=[5, 8], A=['向前展望，向后推理。|P']),
  'e2b3': dict(B=['同时出，谁也看不见谁。', '两个人被分开审讯，各自选：沉默，还是招供。'], D=[2.5, 8.5]),
  'e2b4': dict(B=['100 对囚徒，同时做选择。'], D=[9.5, 7]),    # the tally (91 pairs) is the conclusion
  'e2b5': dict(B=['站在甲这边看。'], D=[4.5, 4.5, 4, 4.5],
               labels={0: '乙沉默：招供更好', 1: '乙招供：还是招供更好'},
               A=['不管对方怎么选，招供都更好。', '这叫优势策略。']),
  'e2b6': dict(B=['两人都招供之后，谁也不想单独改。'], D=[5, 5.5], A=['均衡 ≠ 最优。|P']),
  'e2b7': dict(B=['没有红绿灯的路口。'], D=[4, 8, 5], A=['到底谁冲？数学回答不了。']),
  'e2b8': dict(B=['生活里的同时出招。'], D=[11.5], stagger=3.0),
  'e3b1': dict(B=['1960 年，谢林做过这个实验。'], D=[3.5, 9]),
  'e3b2': dict(B=['均衡不止一个时，', '人们会落到最显眼的那一个。'], H=8),
  'e3b3': dict(B=['聚焦点，无处不在。'], D=[7.5, 11], stagger=3.0),
  'e3b5': dict(B=['被看穿的习惯，一定会被针对。'], H=9, A=['点球，也一样。']),
  'e3b6': dict(B=['最好的办法，是随机。'], H=14, A=['这叫混合策略。|P']),
  'e3b7': dict(split=[[[0], [7], ['1928 年，冯·诺依曼证明：', '两人零和博弈，允许随机，就一定有稳定解。'], []],
                      [[1], [11], ['1950 年，纳什更进一步：', '每个有限博弈，都至少有一个均衡。'],
                       ['揉一团面，总有一个点不动。', '那个点，就是纳什均衡。|P']]]),
  'e4b1': dict(B=['威胁，是让他别走某条路。', '承诺，是让他走某条路。'], D=[4, 5.5], A=['两者，都得可信。|P']),
  'e4b2': dict(D=[0.3, 5, 6.5], A=['你没得选了，对方就只能躲。', '这叫压缩对方的选择。|P']),
  'e4b3': dict(B=['同样的道理，到处都是。'], D=[14.5], stagger=3.0),
  'e4b5': dict(D=[1.5, 3, 10], A=['健康的人走了，常生病的人都来了。', '这叫逆向选择：劣币驱逐良币。|P']),
  'e4b6': dict(B=['破解一：信号。', '让知道底细的一方，主动亮牌。'], D=[10.5, 5], stagger=3.0,
               A=['好信号的关键：对不同的人，成本不同。']),
  'e4b7': dict(B=['破解二：筛选。', '设计一份菜单，让对方自己选。'], D=[4, 9], A=['你什么都没问，他们自己就分开了。|P']),
  'e5b1': dict(B=['囚徒困境，能破吗？'], D=[7, 9.5], A=['连锁店不敢坑你：它在和所有人重复博弈。']),
  'e5b3': dict(split=[[[0], [11], [], ['一路倒推到第一轮：从头背叛到尾。']],
                      [[1], [9.5], ['可是 1982 年，四位经济学家发现：', '只要有 1% 的可能遇到好人，'],
                       ['合作，就能维持大多数轮次。', '所以搬进新小区，先和邻居打个招呼。']]]),
  'e5b4': dict(B=['几种策略同场比赛 200 轮。', '单场输赢不重要，看总分。'], D=[13.5, 8]),
  'e5b5': dict(B=['现实里，会有误会。'], D=[5.5, 8], A=['所以，要多宽容一次。', '国家之间的热线，就是给误会一个出口。']),
  'e6b1': dict(B=['学博弈论，有两层。'], D=[4, 5.5], A=['第二层：改变这个局。|P']),
  'e6b2': dict(B=['2000 年，英国拍卖 3G 牌照。'], D=[7, 10]),
  'e6b3': dict(D=[4.5, 4.5, 4.5, 7],
               items={0: {'desc': '多发一张牌照'}, 1: {'desc': '扔掉方向盘'}, 2: {'desc': '满减、软件分版本、头等舱'}, 3: {'desc': '国家间的热线'}}),
  'e6b5': dict(B=['后来，博弈论继续往前走：', '把真实的人和演化，也放进了局里。'], H=10),
  'e7b1': dict(B=['回头看，四个里程碑。'], D=[5, 5, 5, 6],
               items={0: {'desc': '零和博弈，有解'}, 1: {'desc': '所有博弈，都有均衡'},
                      2: {'desc': '理性之外，文化接手'}, 3: {'desc': '不确定之中，也能合作'}}),
}

def ln(s):
    return {'text': s[:-2], 'pause': True} if s.endswith('|P') else s

def text_beat(bid, lines):
    return {'id': bid, 'lines': [ln(s) for s in lines], 'visual': {'type': 'line'}}

def picture(b, steps_idx, D, e):
    v = b['visual']
    if steps_idx is not None:
        v['steps'] = [copy.deepcopy(v['steps'][i]) for i in steps_idx]
    for k, st in enumerate(v.get('steps', [])):
        st.pop('at', None); st.pop('delay', None)
        st['dur'] = D[k]
        if k in e.get('labels', {}): st['label'] = e['labels'][k]
        if 'stagger' in e and 'stagger' in st: st['stagger'] = e['stagger']
    assert len(D or []) == len(v.get('steps', [])), (b['id'], D, v.get('steps'))
    b.pop('lines', None); b.pop('hold', None)
    if 'H' in e: b['hold'] = e['H']
    return b

out = copy.deepcopy(S); seen = set()
for c in out['chapters']:
    beats = []
    for b in c['beats']:
        e = E.get(b['id']); v = b['visual']
        if v['type'] in TEXT:
            beats.append(b); continue
        assert e, f"picture beat {b['id']} ({v['type']}) has no v4 spec"
        seen.add(b['id'])
        for k, ch in e.get('items', {}).items(): v['items'][k].update(ch)
        if 'split' in e:
            base = b['visual']
            for n, (idx, D, B, A) in enumerate(e['split']):
                pb = copy.deepcopy(b)
                if n: pb['id'] = f"{b['id']}{'kmnp'[n - 1]}"; pb['visual'] = {'type': base['type'], 'ref': b['id'], 'steps': base['steps']}
                if B: beats.append(text_beat(f"{pb['id']}_a", B))
                beats.append(picture(pb, idx, D, e))
                if A: beats.append(text_beat(f"{pb['id']}_z", A))
            continue
        if e.get('B'): beats.append(text_beat(f"{b['id']}_a", e['B']))
        beats.append(picture(b, None, e.get('D', []), e))
        if e.get('A'): beats.append(text_beat(f"{b['id']}_z", e['A']))
    c['beats'] = beats
assert seen == set(E), set(E) - seen
out['subtitles'] = False
out['pace'].update(lead=0.3, tail=0.5)   # text and pictures now alternate: shorter hand-offs
json.dump(out, open(f'{ROOT}/script/v4.json', 'w'), ensure_ascii=False, indent=2)
n_text = sum(1 for c in out['chapters'] for b in c['beats'] if b['visual']['type'] == 'line')
print(f'script/v4.json written: {sum(len(c["beats"]) for c in out["chapters"])} beats, {n_text} text beats, 0 subtitles')
