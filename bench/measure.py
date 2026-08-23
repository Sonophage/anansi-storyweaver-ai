#!/usr/bin/env python3
"""P0 measurement 1 — prefill/decode curve against the real server and model.

Replaces the inherited 68s / 7.8min figures that travelled COUNCIL-01 -> SPEC 10.3 -> PLAN-01 9
with no hardware, quant or backend named at any hop (COUNCIL-02 S4).

Usage: python3 bench/measure.py [model] [host]
"""
import json, sys, time, urllib.request

HOST = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8080"
MODEL = sys.argv[1] if len(sys.argv) > 1 else "write-nt-qwen36-h"

def post(path, body, timeout=900):
    req = urllib.request.Request(
        HOST + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def ntok(text):
    return len(post("/tokenize", {"model": MODEL, "content": text})["tokens"])

# Varied prose so the tokenizer can't collapse it into a cheap repeat.
SEED = ("The rain had not stopped for three days and the gutters ran black with it. "
        "Aldis Fen counted the coins twice, then a third time, and still came up short. "
        "Marek would want an answer before the bell, and there was no answer to give. "
        "Below the window a cart lost a wheel and someone began to swear in Low Vantic. ")

def build(target):
    out, i = [], 0
    while True:
        out.append(f"[{i}] " + SEED)
        i += 1
        if i % 40 == 0 and ntok("".join(out)) >= target:
            break
        if i > 4000:
            break
    return "".join(out)

def run(target):
    prompt = build(target)
    n = ntok(prompt)
    t0 = time.time()
    d = post("/completion", {"model": MODEL, "prompt": prompt, "n_predict": 32,
                             "temperature": 0.8, "cache_prompt": False, "stream": False})
    wall = time.time() - t0
    t = d.get("timings", {})
    return {
        "asked": target, "prompt_tokens": n,
        "prefill_s": round(t.get("prompt_ms", 0) / 1000, 2),
        "prefill_tok_s": round(t.get("prompt_per_second", 0), 1),
        "decode_tok_s": round(t.get("predicted_per_second", 0), 1),
        "wall_s": round(wall, 2), "truncated": d.get("truncated"),
    }

if __name__ == "__main__":
    print(f"model={MODEL} host={HOST}")
    rows = []
    for target in (2000, 8000, 16000, 24000):
        try:
            r = run(target)
        except Exception as e:
            print(f"  {target}: FAILED {type(e).__name__}: {e}")
            continue
        rows.append(r)
        print(f"  {r['prompt_tokens']:>6} tok | prefill {r['prefill_s']:>6.2f}s "
              f"({r['prefill_tok_s']:>7.1f} tok/s) | decode {r['decode_tok_s']:>5.1f} tok/s "
              f"| truncated={r['truncated']}")
    if rows:
        best = max(r["prefill_tok_s"] for r in rows)
        print(f"\nbulk prefill ~{best:.0f} tok/s")
        for ctx in (25000, 32000, 100000):
            print(f"  full prefill at {ctx:>6} tok = {ctx/best:>6.1f}s")
        json.dump(rows, open("bench/results.json", "w"), indent=2)
        print("\nwrote bench/results.json")
