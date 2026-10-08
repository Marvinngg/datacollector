"""book.json (+ uploaded asset ids) -> the artifact's library/<id> document (JSON on stdout or --out).
usage: python3 libdoc.py BOOK_JSON [--film OUT/parts.json --film-assets id1,id2,...]
                                   [--podcast OUT/podcast.json --podcast-asset id] [--status done] [--stage ""]
                                   [--by UID] [--log "一行记录"] [--out FILE]
Only the fields you pass are emitted besides the text forms, so the result can be sent as an `update`."""
import argparse, json, time

ap = argparse.ArgumentParser()
ap.add_argument('book'); ap.add_argument('--film'); ap.add_argument('--film-assets')
ap.add_argument('--podcast'); ap.add_argument('--podcast-asset')
ap.add_argument('--status'); ap.add_argument('--stage'); ap.add_argument('--by'); ap.add_argument('--log')
ap.add_argument('--no-text', action='store_true', help='omit article/cards (e.g. when only adding media)')
ap.add_argument('--at', type=int); ap.add_argument('--out')
a = ap.parse_args()
B = json.load(open(a.book, encoding='utf8'))
now = int(time.time() * 1000)
doc = {'title': B['title'], 'subtitle': B.get('subtitle', '')}
for k in ('meta', 'ask'):
    if B.get(k): doc[k] = B[k]
if not a.no_text:
    doc['article'] = B['article']; doc['cards'] = B.get('cards', [])
if a.at is not None: doc['at'] = a.at
if a.by is not None: doc['by'] = a.by or None
if a.film:
    parts = json.load(open(a.film, encoding='utf8')); ids = a.film_assets.split(',')
    assert len(ids) == len(parts), 'one asset id per part'
    doc['film'] = {'parts': [{'asset': i, 'title': p.get('title', ''), 'dur': round(p.get('dur', 0), 1),
                              **({'w': p['w'], 'h': p['h']} if p.get('w') else {})} for i, p in zip(ids, parts)]}
    if B.get('film', {}).get('note'): doc['film']['note'] = B['film']['note']
if a.podcast:
    P = json.load(open(a.podcast, encoding='utf8'))
    doc['podcast'] = {'asset': a.podcast_asset, 'dur': round(P['dur'], 1), 'title': B['podcast'].get('title', B['title']),
                      'hosts': B['podcast'].get('hosts', {'A': '主持', 'B': '嘉宾'}),
                      'lines': [{'t': round(l['t'], 2), 'who': l['who'], 'text': l['text']} for l in P['lines']]}
if a.status is not None: doc['status'] = a.status
if a.stage is not None: doc['stage'] = a.stage
if a.log: doc['log'] = [{'at': now, 'text': a.log}]
s = json.dumps(doc, ensure_ascii=False)
open(a.out, 'w', encoding='utf8').write(s) if a.out else print(s)
