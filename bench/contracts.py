#!/usr/bin/env python3
"""Client payload keys against the keys each route actually reads.

Found a real bug: app.js sent `decision: 'accept'` to POST /api/proposal, which branches on
`accept`, so Accept silently rejected the proposal.

NOT a test, and deliberately not wired into test/all.ts: it flagged three false positives for
every real one. Routes that delegate to a helper (`generate()` reads c.body.storyId, not the
route body) or spread the body wholesale (`db.createStory(c.owner, c.body)`) are opaque to it.
A check that cries wolf three times in four gets ignored, which is worse than no check.

Run it by hand after touching routes or api.js, and triage every hit.
    python3 bench/contracts.py
"""
import re, pathlib, sys

root = pathlib.Path(__file__).resolve().parent.parent
app = (root / 'web/app.js').read_text()
api = (root / 'web/api.js').read_text()
routes = (root / 'src/routes.ts').read_text()

meth = {m.group(1): (m.group(4), m.group(3).strip())
        for m in re.finditer(r"^\s{2}(\w+):\s*\(([^)]*)\)\s*=>\s*j\(([^,]+),\s*'(\w+)'", api, re.M)}

END = re.compile(r"\n  ['\"](?:GET|POST|PUT|DELETE) ")
reads = {}
for m in re.finditer(r"['\"](GET|POST|PUT|DELETE) (/api/[\w-]+)['\"]\s*:", routes):
    nxt = END.search(routes, m.end())
    seg = routes[m.end(): nxt.start() if nxt else m.end() + 1500]
    reads[f"{m.group(1)} {m.group(2)}"] = set(re.findall(r'c\.body\.(\w+)', seg))

hits = 0
for call in re.finditer(r"api\.(\w+)\(\s*(\{[\s\S]{0,300}?\})\s*\)", app):
    name, obj = call.group(1), call.group(2)
    if name not in meth:
        continue
    verb, path = meth[name]
    if verb == 'GET' or '...' in obj:
        continue
    keys = set(re.findall(r'(?:[{,]\s*)(\w+)\s*[:,}]', obj))
    p = re.sub(r"[`'\"]", "", path).split('$')[0].rstrip('?')
    r = reads.get(f"{verb} {p}")
    if r is None:
        continue
    unread = sorted(k for k in keys if k not in r)
    if unread:
        hits += 1
        print(f"  api.{name} -> {p}\n    sends {sorted(keys)}\n    route reads {sorted(r)}\n"
              f"    NEVER READ: {unread}")

print(f"\n  {hits} to triage. Expect false positives from helpers and spread bodies.")
sys.exit(0)
