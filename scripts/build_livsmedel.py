"""Bygger src/food/data/livsmedel.json från Livsmedelsverkets livsmedelsdatabas (CC BY 4.0).

Kör: python3 scripts/build_livsmedel.py
Format: {"v": "<datum>", "f": [[nummer, namn, kcal, protein, kolhydrater, fett], ...]} per 100 g.
"""
import json, os, ssl, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel'
ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or os.environ.get('REQUESTS_CA_BUNDLE'))

def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60, context=ctx) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 3:
                raise
    return None

def main():
    items = get(f'{BASE}?offset=0&limit=3000&sprak=1')['livsmedel']
    def one(it):
        nv = get(f"{BASE}/{it['nummer']}/naringsvarden?sprak=1")
        val = {}
        for x in nv:
            k = x.get('euroFIRkod'); u = x.get('enhet')
            if k == 'ENERC' and u == 'kcal': val['kcal'] = x['varde']
            elif k in ('PROT', 'CHO', 'FAT'): val[k] = x['varde']
        r1 = lambda v: round(float(v or 0), 1)
        return [it['nummer'], it['namn'].strip(), round(float(val.get('kcal') or 0)), r1(val.get('PROT')), r1(val.get('CHO')), r1(val.get('FAT'))]
    with ThreadPoolExecutor(8) as ex:
        rows = list(ex.map(one, items))
    rows.sort(key=lambda r: r[1].lower())
    out = os.path.join(os.path.dirname(__file__), '..', 'src', 'food', 'data', 'livsmedel.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    version = max(it.get('version', '') for it in items)[:10]
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'v': version, 'f': rows}, f, ensure_ascii=False, separators=(',', ':'))
    print(len(rows), 'livsmedel ->', out, os.path.getsize(out), 'bytes')

if __name__ == '__main__':
    main()
