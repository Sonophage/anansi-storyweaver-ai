#!/usr/bin/env python3
"""Watch a two-arm run: health, progress, running rates, stall detection."""
import json, os, sys, time, urllib.request

N = int(sys.argv[1]); DIR = sys.argv[2] if len(sys.argv) > 2 else '/tmp/anansi-ab'
ARMS = {'control': 5175, 'repeat': 5176}

def alive(url, timeout=5):
    try:
        urllib.request.urlopen(url, timeout=timeout); return True
    except Exception: return False

def read(arm):
    p = os.path.join(DIR, f'{arm}.jsonl')
    rows = []
    if os.path.exists(p):
        with open(p) as f:
            for line in f:
                try: rows.append(json.loads(line))
                except json.JSONDecodeError: pass   # a torn final line while the writer is mid-append
    return rows

def stat(rows):
    ok = [r for r in rows if 'error' not in r]
    men = [r for r in ok if r.get('mentioned')]
    menbad = [r for r in men if r.get('bad')]
    silver = sum(1 for r in ok if 'called the key silver' in (r.get('bad') or []))
    return dict(n=len(rows), ok=len(ok), err=len(rows)-len(ok), men=len(men),
                menok=len(men)-len(menbad), silver=silver)

last, stalls = {a: -1 for a in ARMS}, {a: 0 for a in ARMS}
while True:
    router = alive('http://127.0.0.1:8080/v1/models')
    line, done = [], True
    for arm, port in ARMS.items():
        s = stat(read(arm))
        if s['n'] < N: done = False
        stalls[arm] = stalls[arm] + 1 if s['n'] == last[arm] else 0
        last[arm] = s['n']
        rate = f"{s['menok']}/{s['men']}" if s['men'] else '-/-'
        flag = f" STALLED x{stalls[arm]}" if stalls[arm] >= 3 else ''
        line.append(f"{arm} {s['n']:>3}/{N} clean-on-key {rate} silver {s['silver']}"
                    + (f" err {s['err']}" if s['err'] else '') + flag)
    up = ''.join('.' if alive(f'http://127.0.0.1:{p}/') else 'X' for p in ARMS.values())
    print(f"[{time.strftime('%H:%M:%S')}] srv {up} router {'.' if router else 'X'} | "
          + ' | '.join(line), flush=True)
    if done:
        print('  both arms complete', flush=True); break
    time.sleep(30)
