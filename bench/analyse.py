#!/usr/bin/env python3
"""Both experiments, with the arithmetic done rather than eyeballed."""
import json, math, statistics as st

def rows(p):
    out=[]
    for line in open(p):
        try: out.append(json.loads(line))
        except json.JSONDecodeError: pass
    return out

def fisher(a,b,c,d):
    """Two-tailed Fisher exact on [[a,b],[c,d]]."""
    n=a+b+c+d
    def p(x): return (math.comb(a+b,x)*math.comb(c+d,a+c-x))/math.comb(n,a+c)
    lo=max(0,a+c-(c+d)); hi=min(a+b,a+c)
    obs=p(a)
    return sum(p(x) for x in range(lo,hi+1) if p(x)<=obs*(1+1e-9))

def diff_ci(x1,n1,x2,n2):
    p1,p2=x1/n1,x2/n2
    se=math.sqrt(p1*(1-p1)/n1+p2*(1-p2)/n2)
    d=p1-p2
    return d*100,(d-1.96*se)*100,(d+1.96*se)*100

print("=== F14: does restating canon near the generation point help? ===")
res={}
for arm in ('control','repeat'):
    r=[x for x in rows(f'/tmp/anansi-ab/{arm}.jsonl') if 'error' not in x]
    men=[x for x in r if x.get('mentioned')]
    bad=[x for x in men if x.get('bad')]
    silver=[x for x in r if 'called the key silver' in (x.get('bad') or [])]
    res[arm]=dict(n=len(r),men=len(men),bad=len(bad),silver=len(silver))
    print(f"  {arm:8} n={len(r):3}  named the key {len(men):3}  contradicted {len(bad):2}"
          f"  ({len(bad)/len(men)*100:4.1f}%)   silver {len(silver):2} ({len(silver)/len(r)*100:4.1f}%)")

c,rp=res['control'],res['repeat']
d,lo,hi=diff_ci(c['bad'],c['men'],rp['bad'],rp['men'])
p=fisher(c['bad'],c['men']-c['bad'],rp['bad'],rp['men']-rp['bad'])
print(f"\n  contradiction rate, control minus repeat: {d:+.1f} points, 95% CI [{lo:+.1f}, {hi:+.1f}], Fisher p={p:.3f}")
d2,lo2,hi2=diff_ci(c['silver'],c['n'],rp['silver'],rp['n'])
p2=fisher(c['silver'],c['n']-c['silver'],rp['silver'],rp['n']-rp['silver'])
print(f"  silver rate,        control minus repeat: {d2:+.1f} points, 95% CI [{lo2:+.1f}, {hi2:+.1f}], Fisher p={p2:.3f}")

print("\n=== thrash: does switching stories cost a full reprocess? ===")
for arm in ('sticky','rotate'):
    r=[x for x in rows(f'/tmp/anansi-ab/thrash-{arm}.jsonl') if not x.get('error')]
    if not r: print(f"  {arm}: no rows"); continue
    # first request per tenant is a cold miss in both arms; the question is what happens after
    later=[x for x in r if x['i']>0]
    proc=[x['processed'] for x in later if x['processed'] is not None]
    tot=[x['promptTokens'] for x in later if x['promptTokens'] is not None]
    ms=[x['promptMs'] for x in later if x['promptMs'] is not None]
    print(f"  {arm:7} after the first request: {len(later):2} reqs | "
          f"median processed {st.median(proc):7.0f} of {st.median(tot):7.0f} prompt tokens "
          f"({st.median(proc)/st.median(tot)*100:5.1f}%) | median prefill {st.median(ms):7.0f} ms")
