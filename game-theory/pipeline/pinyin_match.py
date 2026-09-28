"""Pinyin comparison for TTS QA: tone-insensitive, polyphone-aware (any reading of a character counts),
Arabic numbers read the Chinese way (years digit by digit, other numbers as quantities), Latin letters kept."""
import re
from pypinyin import pinyin, Style

CN = '零一二三四五六七八九'
def _qty(n):
    if n == 0: return '零'
    units = ['', '十', '百', '千', '万']; s = ''; digits = str(n)
    for i, d in enumerate(digits):
        p = len(digits) - 1 - i
        if d != '0': s += CN[int(d)] + units[p] if p < len(units) else CN[int(d)]
        elif s and not s.endswith('零') and p > 0: s += '零'
    s = s.rstrip('零')
    return s[1:] if s.startswith('一十') else s

def normalize(text):
    text = re.sub(r'(\d{4})年', lambda m: ''.join(CN[int(c)] for c in m.group(1)) + '年', text)
    text = re.sub(r'\d+', lambda m: _qty(int(m.group(0))), text)
    return re.sub(r'[^一-鿿A-Za-z]', '', text).lower()

LETTER = {'r': {'er'}, 'm': {'n'}, 'n': {'m'}}   # letter names ASR often renders as characters / confuses

def readings(text):
    out = []
    for ch in normalize(text):
        if ch.isascii(): out.append({ch} | LETTER.get(ch, set()))
        else: out.append({p for p in pinyin(ch, style=Style.NORMAL, heteronym=True)[0]})
    return out

def distance(ref, hyp):
    """edit distance where two characters match if they share any reading"""
    a, b = readings(ref), readings(hyp)
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (0 if a[i - 1] & b[j - 1] else 1))
    return d[len(b)]
