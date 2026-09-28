"""v3 copy pass: script/v2.json -> script/v3.json.
Rules for on-screen text in the v3 look (the text is the content, there is no narration):
  - one idea per screen, ideally <= 16 characters, never more than ~20;
  - no "label: explanation" colon pattern; a long sentence becomes 2-3 screens that read as one breath;
  - no unexplained jargon or acronyms; facts, numbers and cases stay (nothing is dropped).
Each edit gives the new lines ("…|P" marks a pause line), the new `at` for every step (same order), and
optional item / field changes. Beats not listed keep their v2 text.
usage: python3 pipeline/tools/v3_copy.py"""
import copy, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S = json.load(open(f'{ROOT}/script/v2.json'))

E = {
  'e1b2': dict(lines=['贝叶斯、控制论，研究你和一个系统。', '博弈论，研究你和另一个人。'],
               right_items=['你在算他', '他也在算你']),
  'e1b3': dict(lines=['你看他怎么选，他也在看你。']),
  'e1b5': dict(lines=['计谋，假设对方比你笨。', '博弈论，假设对方和你一样聪明。|P'],
               right_items=['信息对称', '没有人是傻子']),
  'e1b6': dict(lines=['所以，先别急着出招。', '先看清，这是一个什么局。']),
  'e1b7': dict(lines=['看局，看四样。', '先看玩家：几个人在局里。', '再看策略：各自能出哪些招。', '高手，会压缩对方的选择。',
                      '再看收益：每一招值多少。', '理性，就是自私地把账算清。', '最后看信息：谁知道什么。', '告诉对方什么，本身也是一招。'],
               at=[1, 2, 4, 6]),
  'e1b8': dict(items={1: {'desc': '不求奇招，只做朴素的计算'}, 2: {'desc': '利益越大，越要冷静'}, 3: {'desc': '跳出局外，看见整盘棋'}}),
  'e2b1': dict(lines=['出招，有两种。', '轮流出，或者同时出。']),
  'e2b2': dict(lines=['轮流出，像下棋。', '每一步的走法，画成一棵树。', '先推到最后一步，再倒回来选。', '向前展望，向后推理。|P'], at=[1, 2]),
  'e2b3': dict(lines=['同时出，谁也看不见谁。', '两个人，被分开审讯。', '都沉默，各判 1 年。', '都招供，各判 5 年。',
                      '一招一默：招的放走，沉默的判 10 年。'], at=[0, 2]),
  'e2b5': dict(lines=['站在甲这边看。', '乙沉默，招供更好。', '乙招供，还是招供更好。', '不管对方怎么选，招供都更好。',
                      '这叫优势策略。', '乙，也这么想。'], at=[1, 2, 4, 5], nodelay=True),
  'e2b6': dict(lines=['都招供之后，谁也不想单独改。', '这叫纳什均衡。', '可是，都沉默才更好。', '均衡 ≠ 最优。|P'], at=[1, 2]),
  'e2b7': dict(lines=['没有红绿灯的路口。', '你冲我让，或者我冲你让。', '两种，都是均衡。', '到底谁冲？数学回答不了。'], at=[0, 2, 3]),
  'e2b8': dict(lines=['生活里的同时出招。'],
               items={1: {'title': '4S 店比价', 'desc': '车型已定，五家半小时内报最低价'},
                      2: {'title': '串标', 'desc': '利益大、人少，才值得私下协调'}}),
  'e3b1': dict(lines=['1960 年，谢林做过这个实验。', '大多数人，选了同一个地方。', '中午十二点，中央车站的大钟下。'], at=[0, 1]),
  'e3b2': dict(lines=['均衡不止一个时，', '人们会落到最显眼的那一个。|P']),
  'e3b3': dict(items={1: {'title': 'Type-C', 'desc': '一旦成为默认，就把所有人吸过去'},
                      2: {'title': '数字', 'desc': '随便选一个，很多人选 7'},
                      3: {'title': '位置', 'desc': '白纸上点一个点，多在正中心'},
                      4: {'title': '颜色', 'desc': '随便选一个，多数人选红色'}}),
  'e3b4': dict(lines=['理性算不出唯一答案时，文化和共同经验接手。|P']),
  'e3b5': dict(lines=['被看穿的习惯，一定会被针对。', '点球，也一样。']),
  'e3b6': dict(lines=['最好的办法，是随机。', '每样，各出三分之一。', '这叫混合策略。|P']),
  'e3b7': dict(lines=['1928 年，冯·诺依曼证明：', '两人零和博弈，允许随机，就一定有稳定解。', '1950 年，纳什更进一步：',
                      '每个有限博弈，都至少有一个均衡。', '揉一团面，总有一个点不动。', '那个点，就是纳什均衡。|P'], at=[0, 2]),
  'e4b0': dict(lines=['结果，取决于对方。', '那能不能反过来，改变对方的选择？|P']),
  'e4b1': dict(lines=['威胁，是让他别走某条路。', '承诺，是让他走某条路。', '两者，都得可信。|P'], at=[0, 1],
               left_items=['核威慑，会自动反击']),
  'e4b2': dict(lines=['把方向盘，扔出窗外。', '你没得选了，对方就只能躲。', '这叫压缩对方的选择。|P']),
  'e4b3': dict(lines=['同样的道理，到处都是。'],
               items={0: {'desc': '往前顶一点，对方只能倒车'}, 1: {'desc': '“我就是不讲理”'},
                      2: {'title': '撒泼的客户', 'desc': '“冷静下来，什么都好谈”'}, 3: {'desc': '层层加码，最后要有人给台阶'}}),
  'e4b4': dict(lines=['信息，常常是不对称的。', '面试时，人人都说自己很强。', '投保的人，比保险公司更懂自己的身体。']),
  'e4b5': dict(lines=['保险公司，定一个中间价。', '健康的人觉得贵，走了。', '常生病的人觉得划算，都来了。',
                      '最后，只剩高风险的客户。', '这叫逆向选择：劣币驱逐良币。|P'], at=[0, 0, 1]),
  'e4b6': dict(lines=['破解一：信号。', '让知道底细的一方，主动亮牌。', '好信号，对不同的人成本不同。', '人人都能轻松拿到，信号就失效了。'],
               at=[1, 3], items={0: {'desc': '证明的不是学到什么，而是你不差'}, 2: {'title': '可口可乐广告', 'desc': '“我年年砸得起钱”'},
                                  3: {'title': '被卷透的考试', 'desc': '人人高分，就筛不出人了'}}),
  'e4b7': dict(lines=['破解二：筛选。', '设计一份菜单，让对方自己选。', '老司机选便宜的，马路杀手选全赔的。', '你什么都没问，他们自己就分开了。|P'],
               at=[1, 2]),
  'e5b1': dict(lines=['囚徒困境，能破吗？', '景区的小饭馆，又贵又难吃。', '因为你这辈子，可能只来一次。',
                      '景区里的连锁快餐，和外面一样。', '因为它和所有人，玩的是重复博弈。'], at=[1, 3]),
  'e5b3': dict(lines=['倒推：最后一轮背叛，倒数第二轮也背叛……', '一路推到第一轮，从头背叛到尾。', '可是 1982 年，四位经济学家发现：',
                      '只要对方有 1% 可能是个好人，', '合作，就能维持大多数轮次。', '所以搬进新小区，先和邻居打个招呼。'], at=[0, 2]),
  'e5b5': dict(lines=['现实里，会有误会。', '所以，要多宽容一次。', '国家之间的热线，就是给误会一个出口。'], at=[0, 1]),
  'e6b1': dict(lines=['学博弈论，有两层。', '第一层，在局里找最好的一招。', '第二层，改变这个局。|P']),
  'e6b2': dict(lines=['2000 年，英国拍卖 3G 牌照。', '多发一张，给新玩家留出位置。', '竞标者，增加到 13 家。', '价格冲到约 225 亿英镑。'],
               at=[0, 2]),
  'e6b3': dict(lines=['多发一张牌照，是在改玩家。', '扔掉方向盘，是在改策略。', '满减、软件分版本、头等舱，是在改收益。', '国家间的热线，是在改信息。']),
  'e6b5': dict(lines=['后来，博弈论继续往前走。', '把真实的人和演化，也放进了局里。']),
  'e7b1': dict(lines=['回头看，四个里程碑。', '零和博弈，有解。', '所有博弈，都有均衡。', '理性之外，文化接手。', '不确定之中，也能合作。'],
               steps=[{'at': 1, 'show': [0]}, {'at': 2, 'show': [1]}, {'at': 3, 'show': [2]}, {'at': 4, 'show': [3]}],
               items={3: {'name': '四位经济学家'}}),
  'e7b2': dict(lines=['戴上这副眼镜，你不再先问：他是什么人。', '而是问：他在什么局里。|P', '好人在坏局里，也会做坏事。|P']),
  'e7b3': dict(lines=['博弈论，不是教你算计别人。', '而是让你看见这个局。', '然后，改变它。|P']),
}

def line(s):
    return {'text': s[:-2], 'pause': True} if s.endswith('|P') else s

out = copy.deepcopy(S)
seen = set()
for c in out['chapters']:
    for b in c['beats']:
        e = E.get(b['id'])
        if not e: continue
        seen.add(b['id']); v = b['visual']
        if 'lines' in e: b['lines'] = [line(s) for s in e['lines']]
        if 'steps' in e: v['steps'] = e['steps']
        if 'at' in e:
            assert len(e['at']) == len(v['steps']), b['id']
            for st, a in zip(v['steps'], e['at']):
                st['at'] = a
                if e.get('nodelay'): st.pop('delay', None)
        for k, ch in e.get('items', {}).items(): v['items'][k].update(ch)
        if 'left_items' in e: v['left']['items'] = e['left_items']
        if 'right_items' in e: v['right']['items'] = e['right_items']
        n = len(b.get('lines', []))
        for st in v.get('steps', []): assert st.get('at', 0) < max(n, 1), (b['id'], st)
    for b in c['beats']:   # knowledge tree leaves: no unexplained acronyms
        if b['visual']['type'] == 'knowledge_tree':
            b['visual'] = json.loads(json.dumps(b['visual'], ensure_ascii=False).replace('"KMRW"', '"声誉"'))
assert seen == set(E), set(E) - seen
json.dump(out, open(f'{ROOT}/script/v3.json', 'w'), ensure_ascii=False, indent=2)
long = [(b['id'], l if isinstance(l, str) else l['text']) for c in out['chapters'] for b in c['beats'] for l in b.get('lines', [])]
print('script/v3.json written;', len(long), 'screens; longest:', sorted(long, key=lambda x: -len(x[1]))[:4])
