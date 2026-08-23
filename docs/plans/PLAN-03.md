# Plan 03 — re-ordered against measurement

> **STATUS: LIVE.** The re-ordering still stands, but its own count is stale: F9's rate is 4.0%, not
> the 10-20% cited below (F15), and the two candidates it retires were later reopened and then
> measured. Read `BUILD-STATE.md` §5 for the current order.


PLAN-01 and PLAN-02 were written before anything ran. `P0-FINDINGS.md` now holds seventeen measurements
off the actual machine and model. This document does one thing: **move the remaining work to where
the evidence puts it.** Every move cites a finding. Nothing else in PLAN-02 changes.

Read `BUILD-STATE.md` for what exists today.

---

## What the measurements changed

| Assumption | Measured | Consequence |
|---|---|---|
| Local prose is slow — 68s at 32K, 7.8 min at 188K | **890 tok/s. 35s at 32K, 110s at 100K** (F1) | Latency is not the constraint. Context can be generous. |
| `/props` reports the usable context | It reports the **global** value; real per-slot is 25,024 (F2) | `max_context_tokens` must be ≤ 25,024, and the app divides. |
| Overflow silently truncates from the head, destroying the spine | The server **refuses**, loudly (F3) | **COUNCIL-02's C1 — five seats — is off the table.** |
| Prose should run on raw `/completion` | Only the chat endpoint separates reasoning (F4) | Settled. |
| Thinking is a tuning knob | With it on, the model returned **no prose at all** on 3 runs of 4 (F5) | Settled: off. |
| Canon in the prompt means canon in the prose | **10-20% of passages contradict canon on a four-entry ledger** (F9) | The one promise leaks at a measurable rate. |
| A prompt clause can fix that | Measured: no improvement, targeted failure **tripled** (F10) | Instructions cannot reach it. |

---

## The re-ordering

### Moved up

**1. The canon violation checker — SPEC §8.4. Was P5/P6+; now next after spark.**

F9 measured the base rate. F10 proved the cheap alternative does not work. Three further reasons it
should have been early all along, one of which COUNCIL-03's chatbot seat already made:

- It needs the list of entries that reached the prompt. Under the current concatenation rule that is
  *all of them*, trivially available — so gating it behind the budget engine was backwards.
- The infrastructure exists: `generations` stores the manifest on every call, `structured()` gives
  constrained JSON, and the `check` prompt is written.
- `bench/compliance.ts` is already a crude version of it. The difference between that and the real
  thing is a model call instead of five regexes.

Ship it as a **flag, never a rewrite** (SPEC §8.4), scoped to narration — the three false-positive
classes in F9's method note are the ones to expect.

**2. Chapter pins — force_in / force_out. Was P4; now with the checker.**

**Correction, written after building it.** The first version of this said a pin is the writer's
override for F9. It is not, and the claim was wrong on its own evidence: in the failing runs the
Silver Key entry *did* fire. The fact was already in the prompt and lost anyway, so forcing it in
changes nothing about F9.

What pins are actually for, and why they still move up: a fact that matters in a scene where nobody
says its keyword (`force_in`), and a reveal that must stay sealed while the fact still exists in the
ledger (`force_out`). Both are real, both are cheap, and `force_out` is the only mechanism in the
design that can *remove* a fact for one chapter without deleting it.

### Moved down

**3. The budget engine — floors, ceilings, reservation, the trim ladder, eviction. Was P6; now
after the second tenant.**

Three independent measurements each remove a reason for urgency:

- **F1**: latency headroom is large, so a bigger context is affordable.
- **F3**: overflow fails loudly rather than corrupting the prompt, so the catastrophic case that
  justified the priority does not exist on this build.
- Summaries landed at P2 and bound the context without it.

PLAN-02 §7.2's trigger stands and is still the right condition. It has simply not fired.

**4. Activation depth — secondary keys, `key_logic`, proximity, exclusion, regex. Stays deferred,
and F9 is now a reason rather than an excuse.**

The Silver Key entry **did fire** in the failing runs. The fact was in the prompt and lost anyway.
So sophistication in *what fires* does not address the measured failure; only checking the output
does. Tavo's trigger-words-and-content at 100k installs still holds.

### Unchanged

**5. Spark stays next.** SPEC §8.1's empty-story problem is real and nothing measured touches it.

**6. Postgres, RLS, Tailscale identity, the allowlist.** Still gated on the second writer actually
arriving. `node:sqlite` holds until then and the schema is the target shape.

---

## Order from here

1. **Spark** — a new story starts populated.
2. **The violation checker** (§8.4) + **chapter pins**. The one promise, measured and then defended.
3. **The second tenant**: identity, allowlist, Postgres, RLS.
4. **The budget engine**, when PLAN-02 §7.2's trigger fires.
5. Vector recall, universes, forking — unscheduled, as before.

---

## What this does not resolve

F9 is a *measured, unfixed* defect in the one promise. The checker catches it after the fact; it
does not stop it. Two candidates neither measured nor built:

- **Position.** The conflicting fact sits in the title, in SPINE, at the top of every call. Nobody
  has measured what happens if canon sits closer to the generation point than the spine does.
- **Repetition.** An always-on entry restated near the tail may beat a title stated once at the top.
  Costs tokens, and PLAN-02 §6.1's block order was chosen for cache stability, which repetition
  would spoil.

Both are one-line changes with a harness that can now decide them. Neither should be adopted on
argument, which is what F10 is a record of.
