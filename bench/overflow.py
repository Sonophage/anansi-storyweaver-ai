#!/usr/bin/env python3
"""P0 measurement 2 — what does llama-server do when the prompt exceeds the slot?

Decides whether SPEC 7.5's named failure (silent left-truncation removing the spine facts)
is live on this build, and whether --no-context-shift is required.
"""
import json, urllib.request, urllib.error, sys
H = "http://127.0.0.1:8080"; M = "write-nt-qwen36-h"

def post(p, b, t=900):
    r = urllib.request.Request(H+p, data=json.dumps(b).encode(),
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=t) as x: return json.load(x)
    except urllib.error.HTTPError as e:
        return {"_http": e.code, "_body": e.read().decode()[:400]}

props = json.load(urllib.request.urlopen(H + "/props?model=" + M, timeout=30))
total = props.get("total_slots")
glob = props.get("default_generation_settings", {}).get("n_ctx")
per_slot = glob // total if (glob and total) else None
print(f"global n_ctx={glob}  total_slots={total}  => per-slot={per_slot}")

# A canary at the very top. If the server truncates from the head it disappears.
CANARY = "CANARY-ALPHA-7731: the Silver Key is brass, not silver.\n\n"
SEED = ("The rain had not stopped for three days and the gutters ran black with it. "
        "Marek would want an answer before the bell, and there was no answer to give. ")
body = "".join(f"[{i}] " + SEED for i in range(1200))
prompt = CANARY + body + "\n\nQuestion: repeat the canary code at the top of this document exactly.\nAnswer:"
n = len(post("/tokenize", {"model": M, "content": prompt})["tokens"])
print(f"probe prompt = {n} tokens vs per-slot {per_slot} -> over by {n - (per_slot or 0)}")

d = post("/completion", {"model": M, "prompt": prompt, "n_predict": 24,
                         "temperature": 0.1, "cache_prompt": False, "stream": False})
if "_http" in d:
    print(f"RESULT: REFUSED  http={d['_http']}  {d['_body'][:200]}")
    print("  -> server enforces the ceiling. App guard is belt-and-braces.")
else:
    print(f"RESULT: ACCEPTED  truncated={d.get('truncated')}  evaluated={d.get('tokens_evaluated')}")
    out = d.get("content", "")
    print(f"  echo: {out[:120]!r}")
    if "7731" in out:
        print("  -> canary SURVIVED: no head truncation at this size.")
    else:
        print("  -> canary LOST: silent left-truncation is LIVE. --no-context-shift required.")
