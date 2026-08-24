# P0 — measured, 2026-08-22

> **STATUS: LIVE AND AUTHORITATIVE.** Measured off the actual machine and model. Where this
> disagrees with SPEC or any plan, this is right and they are stale. Nothing here sets a seed, so
> no single run reproduces; only A/B arms run simultaneously are controlled.


Every number here was taken off the machine. Nothing is inherited. Reproduce with the scripts
named against each finding.

Hardware/software as found: `llama-server` build **b10485-1511ce3bc3**, running as a **multi-model
router** with 8 models. Working model: **`write-nt-qwen36-h`** —
`Qwen3.6-35B-A3B-uncensored-heretic-Native-MTP-Preserved-APEX-I-Balanced.gguf`,
`--ctx-size 100000 --parallel 4 --flash-attn on -ngl 99 --jinja --sleep-idle-seconds 900`.

---

## F1 — The inherited latency figures were wrong, in the project's favour

`bench/measure.py`

| | inherited (COUNCIL-01 L3 → SPEC 10.3 → PLAN-01/02 §9) | measured |
|---|---|---|
| bulk prefill | ~400-470 tok/s implied | **~890-906 tok/s**, flat from 3k to 24k |
| prefill @ 32k | 68 s | **35 s** |
| prefill @ 100k | 7.8 min @ 188k | **110 s** |
| decode | not stated | **~64 tok/s** |

COUNCIL-02's local-AI seat was right that the number was unsourced and wrong, and wrong about the
direction — it guessed 3-6x optimistic; it is ~2x pessimistic. **`max_context_tokens = 32000` was
justified by a latency ceiling that does not exist.** The real constraint is F2.

## F2 — The real per-slot context is 25,024, and `/props` does not report it

`src/llama.ts:slotContext`

`GET /props?model=X` returns `total_slots: 4` and `default_generation_settings.n_ctx: 100096`.
That is the **global** value; top-level `n_ctx` is absent. Per-slot is `100096 / 4 = 25024`.

**PLAN-02 §5.1 is wrong as written.** "Read per-slot `n_ctx` from `/props` and make it
authoritative" budgets 4x the real ceiling. The app must divide. And `max_context_tokens = 32000`
**already exceeds the slot** on the current configuration — the live instance of the misconfiguration
every council warned about.

## F3 — The server refuses overflow. It does not silently truncate.

`bench/overflow.py` → `overflow.log`

A 48,130-token prompt returns `HTTP 500 {"message":"Context size has been exceeded."}`. The canary at
the head was never dropped, because nothing was dropped.

**This overturns COUNCIL-02's C1, a five-seat convergence.** The stated danger — "context-shift drops
from the head, so the one promise breaks silently while the app reports success" — is **false on this
build**. Keep the app-side guard: a clean refusal beats burning 28 s of prefill on a doomed call. But
its severity was overstated by every seat, including the pen. `--no-context-shift` is unnecessary here.

## F4 — Raw `/completion` is the wrong transport for this model

`bench/transports.ts`

PLAN-02 §3 locked native `/completion` for prose on the anti-refusal argument. Measured against a
reasoning model served with `--jinja`:

| transport | reasoning | usable prose |
|---|---|---|
| raw `/completion` | inline `<think>` — strippable | continues the document instead of answering; echoes the instruction back |
| `/apply-template` → `/completion` | plain prose, *"Here's a thinking process:"* — **no tag to strip** | worse |
| `/v1/chat/completions` | **split into `reasoning_content`** | clean |

The anti-refusal argument still holds; it is simply outweighed. **Only the chat endpoint has the
server parse reasoning into a separate field**, which is the difference between strippable and not.
Cost: no raw-buffer control, so DIRECTIVE-at-depth is bounded by the chat template. Revisit if a
non-reasoning model is chosen.

## F5 — Chain-of-thought must be disabled, and only one mechanism works

`bench/nothink.ts`

| variant | wall | reasoning | prose |
|---|---|---|---|
| baseline `max_tokens: 900` | 15.0 s | 3,514 chars | **0** |
| **`chat_template_kwargs: {enable_thinking: false}`** | **5.9 s** | 0 | **1,292 chars** |
| `reasoning_budget: 0` | 14.6 s | 3,487 | 0 |
| `/no_think` suffix | 16.2 s | 3,499 | 0 |

With thinking on, the model spent the whole budget reasoning and returned **nothing** on 3 of 4 runs.
Only the template kwarg works; the other two fail silently. **2.5x faster and the difference between
prose and no prose.** `rp-nt-ornith-h` produced 3,395 chars of reasoning and zero prose even at 900
tokens — unsuitable as configured.

## F6 — Keyword activation must scan the directive, not just prior prose

`src/context.ts`

Found live on the first end-to-end run. The writer's directive was *"Aldis reaches into his coat."*
The `Silver Key` entry keys on `key` and `coat`. **It did not fire** — the scan window was the last 8
passages and none contained either word. The model then invented the key as *"warm"* and *"iron"*,
against canon that says cold brass.

The instruction is the strongest available signal of what is about to be on the page. Scanning only
backwards misses it. Fixed; the entry now fires on `coat` and the contradiction disappears.

## F7 — The one promise works

`run.ts` — 8/8 checks, 7.7 s, 624-token prompt.

Four canon entries reached the prose **as story, not exposition**: *"The brass was cold, colder than
the rain"* (entry: brass, not silver; cold to the touch), *"found the scar on his knee. He limped"*,
*"eleven crowns"*, and *"the law said the debt survived. It passed to whoever shared his name"*.
Nothing was restated verbatim. POV and register held.

## F8 — Two checker failures, both instructive

1. **A check that cannot fail is worse than no check.** Six of seven end-to-end checks reported `ok`
   against **zero** output. Gated on non-empty prose first.
2. **In-fiction false positives are real and immediate.** `\b(iron|steel)\b` flagged *"the shadow of
   the Iron Bridge"* — a place name. Scoping the match to the sentence containing the key fixed it.
   This is the dominant false-positive class COUNCIL-02 predicted for the `check` role (SPEC 8.4),
   met on day one in a five-line version of it.

---

## What this changes

| Document | Change |
|---|---|
| PLAN-02 §3 | Prose transport is `/v1/chat/completions`, not raw `/completion` (F4), with `enable_thinking: false` (F5). |
| PLAN-02 §5.1 | `/props` reports global `n_ctx`; divide by `total_slots` (F2). |
| PLAN-02 §5.1 | Drop `--no-context-shift` (F3). |
| PLAN-02 §6.4 | Keep the guard, downgrade its rationale from "prevents silent corruption" to "fails fast" (F3). |
| PLAN-02 §7.2 | `max_context_tokens` must be ≤ 25,024, not 32,000 — and the binding reason is slots, not latency (F1, F2). |
| PLAN-02 §7.2 | Scan window includes the directive (F6). |
| SPEC §10.3 | Delete the 68 s / 7.8 min figures (F1). |
| COUNCIL-02 C1 | Overturned by measurement (F3). |

## Still unmeasured

- Two-tenant contention on 4 slots. One writer measured; concurrent behaviour is not.
- KV footprint against VRAM — `nvidia-smi` not read.
- The identity topology (`tailscale serve` + `whois`, COUNCIL-03 K3). Needs a second device.
- Whether `enable_thinking: false` costs prose quality. It should be A/B'd over more than one sample.
- Chapter-12 and chapter-40 assemblies. The corpus was not built; F7 used a chapter-3 fixture.

---

## F9 — Canon compliance is ~90%, and the failure is the title fighting the ledger

`bench/compliance.ts` — 10 generations, same fixture, same directive.

**9 of 10 passages contradicted nothing.** The one failure called the object *"the silver key"*,
against a canon entry that says **brass, not silver**.

That is not a random slip. `The Silver Key` is the story's **title**, and the title sits in SPINE at
the top of every single call. So the prompt states the wrong fact once per call in a position of
high attention, and the correcting fact sits in a triggered entry that only fires when a keyword
appears. The spine and the ledger can disagree, and the spine wins by repetition.

Three consequences:

1. A ~10% violation rate on a **four-entry** ledger is the floor, not the ceiling — this is the
   easiest possible case.
2. SPEC §8.4's post-generation checker has something real to catch. The councils argued over whether
   0.88/0.55 precision transfers; this says the base rate is high enough to be worth checking.
3. The measurement is cheap and repeatable, so it can be a regression: change a prompt, re-run,
   compare. That makes SPEC §15 gap 1 — "roughly fifteen tuned constants are guesses" — falsifiable
   for the first time.

**Method note.** Every check runs against **narration only**; quoted spans are stripped first. Three
earlier versions of these checks were wrong about that and produced false positives: `the Iron
Bridge` read as the key being iron, a proposal whose *trigger keywords* named another character read
as being that character, and `"I have until dusk," Aldis said.` read as a first-person POV break.
In fiction, a character may lie, be wrong, or speak in first person; none of it is the narrator
contradicting canon. That is the dominant false-positive class COUNCIL-02 predicted for the `check`
role, met three times before the checker itself exists.

## F10 — A prompt fix for F9 was measured, failed, and was reverted

The obvious response to F9 was one clause in the system block: *"The title is a title. It may be
figurative, ironic, or plainly wrong about the thing it names. Canon outranks it."*

Measured with `bench/compliance.ts`, twenty generations before and after, same fixture, same
directive:

| | clean | "called the key silver" |
|---|---|---|
| before | 16/20 (80%) | 1× |
| after | 15/20 (75%) | **3×** |

**No improvement, and the specific failure the clause targeted got more frequent.** At n=20 the
difference in the overall rate is not significant; the tripling of the targeted failure is not proof
either, but there is certainly no evidence the clause helped. Reverted.

The likely mechanism is the one COUNCIL-02's chatbot seat named without measuring it: *"Seven of
eight system_block rules are prohibitions, which primes what they forbid."* Naming the title in an
instruction about the title makes the title more salient, not less.

Two things worth keeping from this:

1. **This is what the harness is for.** Without it, a plausible one-line prompt fix would have
   shipped as a fix, and the thing it was supposed to improve would have quietly got worse. SPEC §15
   gap 1 called roughly fifteen tuned constants "guesses that happen to be written down"; they can
   now be argued about with numbers.
2. **The remedy for F9 is probably not a prompt clause at all.** A fact stated once per call in a
   high-attention position will sometimes beat a fact that fires on a keyword, and no amount of
   instruction reliably fixes that. Catching it after the fact — SPEC §8.4's violation checker — is
   the mechanism that matches the shape of the problem. The base rate measured here (~10-20% on a
   four-entry ledger) is high enough to justify it.

## F11 — The canon checker measures F1 0.89, and the false positives were fixed in code, not prompt

`bench/checker.ts` — twelve labelled passages against the fixture's five canon facts.

| | |
|---|---|
| **Recall** | **80%** — 4 of 5 planted contradictions caught, all at confidence 1.0 with exact quotes |
| **Precision** | **100%** — 0 false alarms on 7 clean passages |
| **F1** | **0.89** |

SPEC §8.4 borrowed 0.88 precision / 0.55 recall from published staged-judge work, and COUNCIL-02's
chatbot seat was right to say the figure would not transfer — it is a frontier-model number on short
premise–hypothesis pairs. It does not transfer. It is beaten, on this task, by a local 35B, because
this task is easier: the canon facts are short bracketed attribute lists, not arbitrary premises.

**The clean set is the part that matters.** It includes the four cases that make fiction hard for an
entailment checker, and all four pass:

- a character *lying* about canon
- a character being simply *wrong*
- *figurative* language ("the debt was a stone in his shoe")
- *hope* stated as possibility, not fact

**Two fixes got it there, and neither was a prompt change.**

1. **A dialogue filter in code.** The prompt says plainly that lying and figurative speech are not
   contradictions. The model flagged a lie anyway — its own stated reason acknowledged the character
   was lying and it flagged it regardless. Dropping any flag whose quote falls inside a quoted span
   took the lie case from 1 flag to 0. Only narration commits the story to a fact, and that is now
   enforced deterministically rather than requested.
2. **One retry.** The first real check call returned unparseable JSON. A grammar constrains the token
   stream but does not guarantee termination, so running into `max_tokens` mid-object truncates —
   a *mechanical* failure, and the exact case a retry fixes. The retry had been removed on the
   argument that retries only address semantic failure. COUNCIL-03's local-AI seat made precisely
   this objection and was right.

**The miss** was a numeric contradiction — "two crowns" against canon's eleven. Numbers are a known
weak spot and worth a targeted rule later.

Together with F10 this is the pattern: **prompt instructions did not fix either problem; code did.**

## F12 — Dropping the title changed nothing, and F9 no longer reproduces

`bench/compliance.ts`, thirty generations per arm, same fixture, same directive, minutes
apart on identical code with one variable.

| | overall clean | of those that named the key |
|---|---|---|
| title in the prompt | 29/30 (97%) | **26/27 (96%)** |
| title removed from SPINE | 28/30 (93%) | **27/29 (93%)** |

Difference on the targeted arm: **−3.2 points, 95% CI [−15, +8]**. Indistinguishable. The title
went back in and the experiment switch was deleted.

**The more useful result is what neither arm produced.** F9's actual failure — the narration
calling the object *silver* against canon saying brass — occurred **zero times in sixty
generations**. F9 measured it at 1 in 10; F10 at 3 in 20. It does not reproduce today.

**What changed, and the honest limits on saying so.** Between F10 and this run the system block's
arbitration rule was rewritten twice. It had said *"canon marked [pinned] always wins… canon not
marked [pinned] yields to the prose"* — and since `last_editor` defaulted to human for spark
characters, accepted proposals and hand edits alike, **every entry carried [pinned]**, so that
clause described a branch that never fired while muddying the one that did. It now reads: *the
canon wins and you write to it.* That is the most likely cause and it is not proven: several other
things moved in the same window, including how prose is windowed, which changes the context
entirely.

Three caveats that matter more than the numbers:

1. **The harness improved between F9/F10 and here.** Those runs scored every generation, most of
   which never mention the key, so a title-vs-canon failure was diluted by trials that could not
   have shown one. Part of the gap is instrumentation, not the model.
2. **Nothing sets a seed.** llama.cpp randomises per request, so F9, F10 and F12 are each
   unreproducible. Only the A/B within F12 is controlled, because both arms ran minutes apart on
   the same code.
3. **n=30 per arm decides very little.** It can rule out a large effect and nothing smaller.

**What this retires.** PLAN-03's two untested F9 candidates — moving canon below the spine, and
restating always-on canon near the tail — are no longer worth running against a failure that does
not occur. The `ponytail:` marker in `render.ts` comes out. If the failure returns, the harness is
here and the first thing to check is the arbitration rule.

## F13 — parallel = 2 doubled the slot, and the unified cache fails hard when oversubscribed

Router restarted 2026-08-22 23:41 to apply `parallel = 2` in the `[write-nt-qwen36-h]` stanza.
It took: `n_slots = 2`, `n_ctx_slot = 100096`, `kv_unified = true`. `/props` reports 100,096
across 2 slots, so `slotContext()` computes **50,048 per slot, up from 25,024**.

**The pool is shared, not split.** A single 71,423-token prompt generated normally — one request
really can draw the whole 100,096, so `global / slots` is not the machine's limit. It is a budget.

**Oversubscribing it is not graceful.** Two concurrent 71k requests:

```
request A: HTTP 500 {"message":"Context size has been exceeded."}  after 150s
request B: HTTP 500 {"message":"Context size has been exceeded."}  after 150s
```

Both. The arriving request does not queue behind the running one, it takes it down. Two and a half
minutes of work lost on each side. Two tenants over Tailscale is the entire deployment, so this is
the case the budget exists to prevent.

**The safe path was then measured at the real worst case** — both slots at `budgetFor`'s full
output with `ignore_eos` forcing the replies to run the whole 900 tokens, rather than the 23 the
model stops at naturally:

| | prompt | generated | total |
|---|---|---|---|
| request A | 46,288 | 900 | 47,188 |
| request B | 46,288 | 900 | 47,188 |
| | | **combined** | **94,376 / 100,096** |

Both returned 200 in 52s. **Margin: 5,720 tokens, 5.7%.**

Two honest limits on that:

1. **The first version of this test was too weak and passed anyway.** It ran 41,918-token prompts
   and the model stopped generating at 23 tokens, so it exercised ~84k, not 94k, while appearing
   to confirm the worst case. Any re-run must force generation, or it proves less than it looks.
2. **Wall time is not stable.** The same shape of work measured 111s, 110s and 52s across three
   runs. Nothing here isolates prompt processing from scheduling, so no throughput claim is made.

**The margin is the open edge.** 5.7% holds today because `budgetFor` reserves `max(600,
max_tokens)` plus 6%. Raising `max_tokens` past ~900, or adding a third concurrent caller, eats it
— and the failure on the far side is total rather than degraded. The rationale is recorded at the
`perSlot` return in `src/llama.ts` so the division is not "optimized" away later.

## F14 — F12 over-concluded, and two harnesses is what caught it

Six generations on the F12 fixture, same story, same directive, run only to time a harness
change. One of them **called the key silver**. That is F9's failure, reproduced on the exact
experiment F12 used to declare it gone.

**The error is mine and it is a reasoning error, not a measurement one.** F12 observed zero
failures in sixty generations and I wrote *"It does not reproduce today."* Zero in sixty does not
establish zero. It bounds the rate below roughly 5% and says nothing more. The correct sentence
was "the rate is under 5%, which this fixture cannot distinguish from zero."

Everything measured since, under the post-restart config:

| config | generations | failures |
|---|---|---|
| `parallel = 4`, slot 25,024 (F12) | 60 | 0 |
| `parallel = 2`, slot 50,048 | 12 | 1 |

**No causal claim about the restart.** 0/60 and 1/12 are statistically compatible — Fisher exact
p ≈ 0.17 — so this is not evidence that doubling the slot brought the failure back. It is only
evidence that F12's zero was a small-sample zero. The larger budget does change which context
survives eviction, so it remains a live hypothesis; nothing here tests it.

**Reopened:** PLAN-03's two untested F9 candidates, which F12 retired on the strength of a failure
that "does not occur." They should not have been retired on a zero count. The `ponytail:` marker
in `render.ts` stays out — the rationale there still reads correctly — but F9 is an open low-rate
defect again, not a closed one.

**What it would take to actually settle it.** At a ~5-8% base rate, separating "fixed" from
"rare" needs a few hundred generations per arm, not thirty. That is now affordable: see the
harness note below.

### Two harnesses

`bench/compliance.ts` is a serial loop, and `/api/generate` persists nothing — it returns prose
and writes one append-only log row — so two harnesses on one story cannot contaminate each other.
Both talk to a single-threaded Node process, so the log writes serialize with no SQLite contention.

Six generations, one sample each way:

| | wall |
|---|---|
| one harness, serial | 41s |
| two harnesses, 3 each | 26s |

**≈1.6×, not 2×** — two slots share one GPU. One run per arm, and wall time has been unstable all
session, so treat 1.6 as "real but not pinned."

The throughput is the smaller half of the win. Running both A/B arms **simultaneously** removes
F12's remaining confound, which was stated there in as many words: *both arms ran minutes apart.*
Concurrent arms share thermals, cache and machine state exactly.

## F15 — Restating canon near the generation point: right direction, not proven

300 generations per arm, run **simultaneously** on two servers against one router, so both arms
shared thermals, cache and machine state. Arm A is the shipped prompt. Arm B restates every canon
entry that fired, below the directive and above the tail prose.

| | named the key | contradicted canon | called it silver |
|---|---|---|---|
| A — shipped | 282 | 20 (7.1%) | 12 (4.0%) |
| B — canon restated | 289 | 14 (4.8%) | 5 (1.7%) |

| | difference (A − B) | 95% CI | Fisher |
|---|---|---|---|
| contradiction rate | +2.2 points | [−1.6, +6.1] | p = 0.291 |
| silver rate | +2.3 points | [−0.3, +5.0] | p = 0.138 |

**Neither is significant. Do not report this as a fix.**

Three things make it more interesting than a null:

1. **Both metrics move the same way**, and the silver rate more than halves.
2. **The gain is concentrated in the failure it targets.** Broken out: silver 12 → 5, *warm* 4 → 4,
   *restated canon verbatim* 4 → 4, *iron or steel* 0 → 1. A general improvement would have lifted
   everything; this moved one mode and left the rest flat, which is what a real effect on that mode
   looks like.
3. **The predicted side effect did not appear.** The worry was that canon adjacent to the
   generation point would be written as exposition — the *restated canon verbatim* count. It is 4
   in both arms. Placing the repeat below the directive rather than last appears to have been
   enough.

**Why it was underpowered.** n=300 was sized against F14's assumption of a ~5-8% base rate. The
measured control rate is 4.0% on silver. Detecting 4.0% vs 1.7% at 80% power needs roughly **850
per arm**, not 300. That is about 100 minutes unattended with the two-arm harness.

**Cost of arm B if shipped:** ~200 extra prompt tokens on a 9k prompt. Not the reason to hesitate.

**The reason to hesitate is F12.** That finding declared a defect gone on the strength of an
underpowered zero. Shipping arm B now on the strength of an underpowered *positive* is the same
error with the sign flipped.

## F16 — There is no cache thrash to fix

Two tenants, three stories each, six stories with deliberately distinct text so no two share a
prefix. ~9,200 tokens per prompt. Two arms: each tenant stays on one story, versus each tenant
cycling all three. Metric is llama.cpp's own `timings.prompt_n` — tokens it actually processed,
which excludes anything served from cache.

| | requests after the first | median tokens processed | of prompt | median prefill |
|---|---|---|---|---|
| sticky | 8 | 4 | 9,224 | 323 ms |
| rotate | 8 | 4 | 9,684 | 326 ms |

**Identical.** Rotating between three stories costs four tokens of reprocessing and three
milliseconds. The hypothesis is dead.

**The mechanism.** `llama-server --cache-ram` defaults to **8192 MiB** of RAM prompt cache. Six
9k-token states fit with room to spare, so nothing evicts anything. The platform already does what
a per-story `--slot-save-path` session would have done, without being asked.

**Retired:** per-story llama sessions. Not deferred — there is nothing to defer to.

**The limit of this result.** It proves no thrash *at this working set*. It does not locate the
ceiling: bytes-per-token of KV was never measured, so the number of stories that fit in 8 GB is
unknown. Two things would change the answer — many more stories in flight, or much longer ones —
and `--cache-ram` is tunable if they ever do. The test also reused identical prompts; real use
appends passages, which extends a prefix rather than replacing it, and prefix reuse is the case
caching is best at.

## F17 — What the model is actually good at, and where the harness runs out

Five capabilities, `bench/quality.ts` and `bench/extraction.ts`, fixtures in
`bench/quality-fixture.ts`. Every check is a regex over **narration with dialogue stripped** —
dialogue may lie, characters may be wrong, only the narrator commits the story.

**Detectors were validated before any result was believed.** 14 synthetic cases for the first four
probes and 8 for the rewritten one, each asserting both that bad prose flags and that good prose
does not. All 22 correct, including the hard negatives — "the stump where his left hand had been"
reads clean, "Corin raised his left hand" flags. A detector that never fires reports perfection,
and this harness has now earned the right to be believed on the checks it can make.

| capability | opportunity | result |
|---|---|---|
| playing a character | 55 spoken lines across 19/20 runs | **0 violations.** Longest line exactly 8 words; canon caps her at 8 |
| evolving facts | 17/20 touched a hand, ring or handedness | **0 violations** — never restored the amputated hand or the lost ring |
| established IP | 13/20 named a weapon | **1 bolter against canon's "lasgun, not a bolter"** — 7.7% of informative runs |
| noticing new things | 10 extractions | **10/10 on all three** new entities, 0.3 other proposals per run |
| enacting a directive | 20/20 | **20/20 by reading, 18/20 by regex** — see below |

**Character voice is the strongest result.** The eight-word cap is a hard numeric constraint and the
model held it 55 times without one overrun, median 3 words. It did not drift toward eloquence when
given room to.

**Progressions work end to end.** The engine resolved the post-injury body — verified in the
prompt — and the model wrote to it in all 17 informative runs. That is `entry_states` earning its
place.

**The one failure mode is the one already known.** A bolter for a lasgun is the same shape as silver
for brass: the setting's own gravity pulling against the ledger. Zero anachronisms — no internet, no
democracy, no coffee shops. It is not ignoring the world, it is being pulled by it.

### Two honest failures of the instrument, not the model

**The knife check measured nothing, twice, and was unsound to begin with.** The first probe told Roan
to sit still, so 1 of 20 generations mentioned the knife. Rewritten to put hands on him, **0 of 20**
did — because covering one beat without escalating is exactly the non-overrun behaviour wanted, and
it structurally prevents the check from firing. Worse: the canon fact was *"keeps a knife in his boot
and has never drawn it"*, which is a history, not a prohibition. Drawing it would not have
contradicted anything. The check was void on its own terms and no amount of rerunning fixes that.

**Regex cannot score enactment.** Two runs were flagged as not enacting the directive. Reading them,
both did — *"Roan didn't fight the grip"* and *"the sudden, jarring elevation"*. They enacted the haul
in words the detector did not list. So enactment is 20/20 by reading and 18/20 by regex, and the
difference is the harness.

**The methodological line this draws, which matters more than any number above:**

- **Canon contradiction is lexically checkable.** The wrong word is literally present — silver,
  bolter, left hand. Regex is the right instrument and needs no judge.
- **Instruction compliance is not.** The right act in unlisted words reads as a failure. This needs a
  judge model, and `agentic-t-tcap27-h` is loaded in the router for exactly that.

Paragraph count (PROMPTS §4's 2-4), POV, and scene-resolution overrun were clean 20/20 — those are
lexical or countable and the harness can hold them.

### Not measured, and visible in the samples

The story's style directive reads **"Terse."** and the model returned 1,523 characters of *"an
intimacy of violence"* and *"the metallic tang of iron"*. It obeyed the plot instruction and ignored
the register. Nothing here catches that: it is compliant, on-canon, and off-voice. Style adherence is
a third category, separate from canon contradiction and instruction compliance, and it has no probe.

## F18 — Structured roles overrun their specified length by three to twenty times

Found by looking at the new surface rather than by measuring: two panels were unreadable because
the model's structured output is far longer than the prompt asks for.

| role | asked for | measured on the live database |
|---|---|---|
| `check` → `reason` | one sentence on why two facts cannot both hold | **3,321 characters** — the model's entire chain of reasoning, including "Let's check Canon 1…", written into a single canon flag |
| `summary` | *"{{max_words}} words"*, ~180 | **1,000–1,300 characters** each, and analytical rather than narrative: *"This action confirms his intent to leave permanently or for a significant duration"* |

The summaries are worse than long. `PROMPTS.md` §6 asks for *what a later chapter must know*, and
what came back reads like a critic's notes on the chapter — which is then what EARLIER feeds the
model on every call.

**Two separate defects.** The `reason` field has no length bound in `checkSchema`, so a reasoning
model fills it. The `summary` role's word count is stated in prose inside the prompt and nothing
enforces it; a `maxLength` in the schema would.

**The UI is clamped, and that is not the fix.** Canon flags now show two lines and expand on click;
summaries show five. That keeps the panels usable and hides a real problem, so it is recorded here
rather than left to look solved. The prompt-and-schema fix belongs in `src/prompts.ts`.

### Closed 2026-08-23, both halves measured

**`maxLength` on a string IS enforced by the GBNF converter.** Measured directly: a bound of 24
returned exactly 24 characters, 120 returned exactly 120, and the same prompt unbounded returned
1,437. `src/prompts.ts` carried a note saying the converter "ignores numeric bounds", which is
true of numeric minimum/maximum and was wrong for strings; corrected in place. It truncates
mid-word, so the bound is a backstop and the prompt still has to do the work.

**`check.why` bounded to 240 characters costs the checker nothing.** `bench/checker.ts` rerun on
the same twelve labelled passages: **recall 80%, precision 100%, F1 0.89** — identical to F11. The
single miss is the numeric contradiction already carrying its own marker in `prompts.ts`.

**The summary defect was the word count reading as a target.** Two prompts against the same
chapters in one run, `bench/summary.ts`:

| | mean length | mean words | analytical tells per summary | over the 180-word ask |
|---|---|---|---|---|
| shipped — "180 words" | 1,155 chars | 191 | **5.5** | 3 of 4 |
| candidate — "Under 180 words" + no interpreting | **181 chars** | 35 | **0.5** | 0 of 4 |

**And the mechanism is worse than length.** Chapter two of the fixture is a single passage of 160
characters. The shipped prompt returned **1,269 characters** for it — eight times the input, all
invention, because a target has to be hit. The candidate returned 103 characters and lost nothing:
*"He draws a cold brass key. He descends the steps slowly, favoring his left knee. He does not look
back."* That is the whole chapter.

So the fix is the ceiling, not the ban on interpretation — though both shipped. `max_tokens` for the
role went 400 → 280, because 180 words is about 240 tokens and the rest was room to pad in.

**What this retires.** The UI clamps on canon flags and summaries stay, but they are no longer
covering a live defect. **The clamp was a plaster; this is the fix.**

**Still not measured:** whether a bounded reason changes what the checker *writes* rather than
whether it finds it — a 240-character why may read as clipped where the old one read as an
argument. Nobody has judged the wording, only the score.

## F19 — Two writers are sandboxed, except for the two things that are not

Seth, 2026-08-23: *"each writer will have its own lore own story i.e. itll be sandboxed."* That
settles one open question and exposes two things that do not honour it.

**The sandbox itself holds, and is now asserted.** `test/scope.ts` counted the OPEN routes and
never tested one. An open route bypasses the ownership gate by design, so its only protection is
the SQL — and three of them span stories. Now tested with two owners:

- `search` unions prose, entries and summaries, and **every branch needs its own owner filter**. A
  missing one on any single branch would leak that kind only, hidden behind two good branches. All
  three present; both directions checked.
- `ledgerOf` stops at the writer who owns it.
- `import` creates for whoever called it.

**The advisory lock is retired, not deferred.** SPEC §15.6 and PLAN-02's P3 both want one for
"two tabs generating into one chapter". Two writers can no longer be in one chapter at all. What
survives is one writer on two devices, and that is safe by construction: `node:sqlite` is
synchronous and Node is single-threaded, so one server serialises every write. Measured — two
appends with no await between them, the interleaving two devices produce, took ordinals 7 and 8
with no error and no duplicate. `passages_sel`, a partial unique index on `(branch_id, ordinal)
WHERE selected = 1`, is the backstop if that ever stops being true.

**What does NOT honour the sandbox:**

| | scope | the surface said |
|---|---|---|
| sampler settings (`gen`) | **one object for the whole process** — `serve.ts:24` | *"These belong to this story"* |
| the active model | **process-wide** — `llama.ts` | said so plainly, correctly |

The sampler is the bad one. `POST /api/settings` is gated by story id, so the API *shape* implies
per-story scoping that does not exist, and the panel's copy asserted it. One writer raising
temperature raises it for the other, mid-sentence. Corrected to say so; the copy was mine, and it
contradicted a comment in the route it was calling.

**The real fix is PLAN-02's `engine_config` on the story row**, listed in P1 and never built — the
schema anticipated exactly this. Until then the panel is honest about being shared.

## F20 — Restating canon near the generation point does nothing. F15 was noise.

The confirmation run F15 asked for. **850 generations per arm**, both arms live at once against
identical snapshots, one variable: whether the canon that fired is restated below the directive.

| | named the key | contradicted canon | called it silver |
|---|---|---|---|
| control | 803 | 55 (6.8%) | 31 (3.65%) |
| canon restated | 771 | 53 (6.9%) | 29 (3.41%) |

| | difference | 95% CI | Fisher |
|---|---|---|---|
| contradiction rate | **−0.02 points** | [−2.5, +2.5] | p = 1.000 |
| silver rate | **+0.24 points** | [−1.5, +2.0] | p = 0.896 |

**F15 measured +2.2 and +2.3 at n=300. At the sample size calculated to detect exactly that, the
effect is zero.** Not "smaller than hoped" — the point estimate is nil on one metric and a
quarter-point on the other, either side of nothing.

Stated precisely, because the difference matters: this run does not *exclude* an effect as large as
F15's — +2.2 sits inside [−2.5, +2.5]. It fails to find one, with the best estimate at zero, at the
n that was chosen to find it. F15's apparent effect was sampling noise in a 300-generation arm.

**The predicted side effect does appear.** *Restated canon verbatim* went 1 → 5, Fisher p = 0.218.
Suggestive rather than significant, and F15's n could not have seen it — but it is the exposition
cost I argued for when choosing where to place the block, and it points the way F15 said it did not.

**Retired, and the code deleted.** Arm B cost 145 tokens on every call for no measurable benefit and
a hint of harm. `CANON-REPEAT`, its `Kind`, its place in `ORDER`, its tag, and the `ANANSI_ARM`
switch are all gone. PLAN-03's two F9 candidates are now both closed: F12 killed the title, F20
kills repetition.

**What this leaves F9 as.** A real, unfixed defect at **3.65% of generations** — narration calling
the object silver against canon saying brass. Two prompt-level fixes have now been measured and
both failed: F10 made it worse, F20 did nothing. The working mitigation is the one already
shipped — the canon checker, F1 0.89, which flags it after the fact rather than preventing it.
**Prompt wording is not the lever here, and that is now measured twice rather than assumed.**

**Base rates held across the two runs** — 7.1% and 4.0% at F15, 6.8% and 3.65% here — which says
the fixture growing between them did not move the thing being measured.
