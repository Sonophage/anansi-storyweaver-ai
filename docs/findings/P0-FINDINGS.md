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

---

## F21 — Interiority in canon comes back out as narration about half the time. But the model already narrates interiority anyway.

PLAN-04 put a character's inner state behind a measurement rather than building it, on the
suspicion that the model would not *use* it but *repeat* it. Measured, and the suspicion was
right — with a second result that matters more.

**120 generations per arm, both arms live at once** against two stories identical except for one
line on the protagonist's canon entry:

```
[Inside: He is certain the key is a forgery, and has never dared test it.]
```

Same directive, same everything else. Two things counted, on **narration only** — a character
*saying* "I'm certain it's a forgery" is the scene working, not a leak.

| | arm A, control | arm B, interiority |
|---|---|---|
| runs / errors | 120 / 0 | 120 / 0 |
| mentions him (the denominator) | 120 | 120 |
| mean narration | 1,135 chars | 1,144 chars |
| **the inner fact appears in narration** | **0/120 — 0%** [0–3] | **57/120 — 47.5%** [39–56] |
| **narrator states ANY inner state of his** | 99/120 — 82.5% [75–88] | 103/120 — 85.8% [78–91] |

**1. The fact leaks, at 47.5% [39–56].** Written into canon as a fact about who he is, it is
returned as the narrator asserting it: *"He was certain the key was a forgery."* Told, not shown,
in the narrator's voice. Arm A leaked **0 of 120**, which is the detector confirming in the live
setting what its 10 synthetic cases assert — it does not fire on prose that was never told the
fact.

**2. And it changes nothing about how much interiority the narration carries.** 82.5% against
85.8%, **+3.3 points, z = +0.71** — noise. The model already narrates the protagonist's inner
state in **more than four generations in five** with *no interiority in canon at all*.

The second number is the larger finding, and it was not what the measurement was aimed at.
Told-not-shown is a property of this model and these prompts, not something the feature would
introduce. Anyone building interiority to "add depth" would be adding a fact to a prompt that is
already producing interior narration 82.5% of the time.

**What this settles for PLAN-04.** Interiority as *plain canon* is the wrong shape: canon is for
facts the prose must not contradict, and this one gets restated instead of honoured. Either give
it its own block with an instruction that distinguishes knowing from saying, or do not build it.
It should not be one more line in the entry body.

**What it opens.** 82.5% is a big target and nothing has aimed at it. Whether an instruction
against telling actually moves it is the natural next measurement — and F20 is the warning
attached to that hope: 850 runs per arm to prove that a plausible prompt change did *nothing*.

Detector: `bench/interiority-verdict.ts`, 10 cases asserting both directions, including the same
words spoken rather than narrated. It caught two of its own gaps before the run — an auxiliary
("had known") and the fact arriving in different words ("did not dare test" for "never dared test").
Harness: `bench/interiority.ts`, run against a snapshot so the live library was untouched.

---

## F22 — Two models resident is not tight. Per-story models are not VRAM-blocked.

Seth asked whether two harnesses could each have their own model. I answered "tight but not
obviously impossible" from memory of the capacity table in `presets.ini`, which was **wrong and too
pessimistic**. Measured from GGUF headers with `probe/fits.sh` — no load, no VRAM, ~50 ms each —
at each preset's full 100,000-token context:

| preset | weights | KV | compute | total |
|---|---|---|---|---|
| `write-nt-qwen36-h` (loaded) | 23,753 | 2,211 | 522 | **26,486 MiB · 25.9 GiB** |
| `agentic-t-tcap27-h` | 15,088 | 6,870 | 505 | **22,463 MiB · 21.9 GiB** |
| `agentic-t-qwen38-h` | 28,158 | 6,870 | 505 | **35,533 MiB · 34.7 GiB** |
| `rp-nt-ornith-h` | 34,667 | 2,211 | 522 | **37,400 MiB · 36.5 GiB** |

Against 98,304 MiB, with ~1,174 MiB idle baseline:

- **any two fit.** The worst pair — Ornith + Qwen3.8 — is 72,933 MiB, leaving ~24 GiB spare.
- the current writer plus any other is 48,949–63,886 MiB. Comfortable.
- **three fit** in several combinations: qwen36 + tcap27 + qwen38 is 84,482 MiB.
- all four do not: 121,849 MiB.

**Why the earlier answer was wrong.** The capacity table lists `glm-steam` at 62,844 MiB of weights
and `qwen-next` at 65,409, and "two 35B-class models" anchored on those. The writer actually in use
is a 35B-**A3B** — a mixture of experts with 3B active — and its weights are 23,753 MiB. The
parameter count in the name says almost nothing about what it occupies.

**So per-story models are not blocked by the hardware.** They are blocked by `MODEL` being a single
module-level global in `src/llama.ts`. Every request already names its model, and the router runs a
separate `llama-server` process per preset.

**The caveat.** This is header arithmetic, not two models measured resident together.
`presets.ini` records `llama-fit-params` checked against this box's own measured table on
2026-08-01 with a worst error of 1.4%, so the numbers are trustworthy — but the untested question
is not capacity, it is whether the router evicts on its own policy before VRAM pressure. That is a
five-minute check with two models deliberately loaded, and it was not run because it would have
disturbed a box that was in use.

**An allowlist landed with this** (`ANANSI_MODELS`, `src/llama.ts`): the router serves eight
presets and most have no business writing fiction. It is an env var rather than a setting, because
which models an app may use is an operator's decision about the box — `test/web.ts` asserts no
route can write it.

---

## F23 — Thinking and structured output do not compose. F5 applies to JSON, not just prose.

Anansi's chat role shipped with `enable_thinking: true`, on the argument that F5's finding —
thinking returns no prose — was about **prose**, and that analysis is what thinking is for. The
argument was written into `PLAN-05-TALK.md` and the commit message as the reason the feature was
worth building now.

**It was wrong, and the first five real calls said so.** From `generations`:

| latency | result |
|---|---|
| 25.4s | `model returned unparseable JSON` |
| 22.2s | `model returned unparseable JSON` |
| 13.0s | ok |
| 23.6s | `model returned unparseable JSON` |
| 16.1s | ok |

**3 of 5 failed.** The mechanism is F5's exactly: reasoning eats the token budget, the JSON object
is truncated before it closes, and `JSON.parse` fails. A grammar constrains the *shape* of the
output; it does not stop the model spending its budget before reaching it.

Thinking off, with `structuredRetry`: **6 of 6 succeeded**, and the replies are grounded — one
answered *"The canon does not say"*, which is what the role asks for when the story is silent.

Six clean runs bounds the failure rate under about 40%, not at zero — but against 3-in-5 the
direction is not in doubt.

**What this generalises to.** F5 is not a fact about prose. It is a fact about **this model's
budget under thinking**, and it applies to every role with a token cap — which is all of them.
Any future use of `enable_thinking: true` needs a raised budget and a measurement, not an argument.

**Found by a first-time-user review, not by the tests.** The suite was green: the failures were
logged to `generations` with an error and the client showed a toast that nobody was watching. What
surfaced it was someone reading the Storyteller panel and asking what *"talk · failed — 22.2s"*
meant.

---

## F24 — the blank page was mostly prefill, and prefill is nearly free once the cache is warm

COUNCIL-04 #3 measured **p50 5.7s, p90 8.2s, max 79s** of nothing happening per passage, and both
user reviewers named it. Streaming was built for it. Measured against the real model, on his own
358-passage story, over the streaming route:

| call | time to first token | total | deltas |
|---|---|---|---|
| cold (first call after the model loaded) | **7,771 ms** | 14.4s | 354 |
| next call, same story | **363 ms** | 6.1s | 309 |
| the one after that | **349 ms** | 4.2s | 205 |

**Two separate numbers were hiding inside one average.** The wait is prompt processing, and
llama-server reuses the KV prefix — so the first passage of a session pays ~7.8s before a word
appears and every passage after it pays about a third of a second. The council's p50 of 5.7s was
computed over `generations` rows without separating those, which is why it looked like a flat cost.

What streaming changes, honestly stated:

- **Warm — the normal case while you are writing:** 5.7s of blank page becomes ~0.35s. This is the
  whole win and it is a large one.
- **Cold — the first passage after a load or a 15-minute sleep:** still ~7.8s before the first
  word. Streaming does not touch prefill. The working bar is what covers that window, and it
  already names which action you pressed.

Nothing here was reproducible in the F-series sense — no seed, one story, three consecutive calls.
It bounds the warm case at "well under a second", not at 349 ms.

**A related observation, since fixed:** with llama-server unreachable the error that reached the
writer was `fetch failed` — Node's own string, straight through to a toast. The model sleeps after
15 minutes (`--sleep-idle-seconds 900`), so that was the message a returning writer was *most*
likely to see, and it said nothing. `reach()` in `src/llama.ts` now wraps the four llama-server
calls and separates the two cases that were one:

- **refused** — *"cannot reach llama-server at HOST. It is not running, or it is still starting.
  Preferences → Restart it."*
- **timed out** — *"did not answer in time. A model that was asleep can take a minute to load."*

They are separated because they need opposite responses. Telling someone to restart a server that
is busy loading a 26 GiB model is how a 60-second wait becomes a five-minute one.

---

## F25 — Anansi's cut-off answers were the grammar, not the token budget. They fail differently and only one of them is visible.

Seth: *"it also cut itself off before when i asked it what the story was about before finishing it
it shouldnt do that."*

Two bounds could have done it and they are not the same bug. `maxLength` on a JSON-schema string
compiles into the GBNF grammar, which closes the string at exactly N characters — mid-word — and
the object it belongs to is still **valid**, so a truncated answer arrives looking like a finished
one. Running out of `max_tokens` truncates the *object*, which does not parse, and
`structuredRetry` gets a second go. Measured on the real model, `write-nt-qwen36-h`, one long
question about a story:

| schema | max_tokens | parsed | reply | ends on a full stop | latency |
|---|---|---|---|---|---|
| as shipped, `maxLength: 1400` | 1600 | yes | **1,400 chars** | **no** — `"…that is"` | 7.1s |
| no `maxLength` | 1600 | yes | 3,696 chars | yes | 16.0s |
| no `maxLength` | 400 | **no** | — | — | 7.4s |

Exactly 1,400. The cap was the cut, and the model wanted **2.6× the room it was given** for that
question. The third row is the other failure wearing its own face: unparseable JSON, which the
retry exists for.

The cap on `reply` is gone. The other caps in `TALK_SCHEMA` stay — a directive is one instruction
and an entry body is one fact, and F18 is what an unbounded string does to a field like that. The
reply is the one field where the length **is** the content, and `max_tokens` is its bound, because
that bound fails loudly.

**Two adjacent defects found while measuring this, both fixed:**

- The talk route assembled its prompt reserving `900` tokens of output and then asked for `1600`.
  The prompt was budgeted for a smaller answer than the one requested, so on a long story the slot
  could be oversubscribed — and oversubscribing this shared cache does not queue, it returns HTTP
  500 to both writers. One constant now, reserved and spent.
- `structuredRetry` retried at a flat `max_tokens: 2000`. The failure it retries is an object that
  ran out of room, so a caller already asking for more than 2,000 was retried with **less** and
  could only fail harder. It now doubles what was asked, with 2,000 as the floor.

**End to end**, the same question through `POST /api/talk` on a copy of his own *Sutera Remembers*
(358 passages, a 4,463-token prompt): **2,576 characters, ending on a full stop, 14.7s.** Under the
cap that answer would have stopped at 1,400.

One thing that run showed which is NOT about truncation: the reply ended *"End with a gesture from
Vel that signals they are being watched by something in the dark"* — a directive, written into the
answer, while the `directive` field came back empty. That belongs with the personality work, not
here.

`test/talk.ts` holds all three against a fake llama-server, and each was falsified by putting the
old value back. Not reproducible in the F-series sense: one model, one question, one run per row.
It establishes the mechanism, not a rate.

---

## F26 — A voice for Anansi. Two of the three things it was doing wrong stopped; the third is variable, and the first detector I wrote could not see it.

Seth: *"we need a specific personality set for anansi so that its not just raw ai. it should sound
like anansi, direct but with a bit of flair."*

Four probes through `POST /api/talk` on a copy of *Sutera Remembers*, one model, sequential — so
this is behaviour, not a rate. The arms are not simultaneous and nothing is seeded.

| probe | before | after |
|---|---|---|
| "the long answer" | 3,215 ch, no directive | 3,205 ch, no directive |
| "what colour are Vel's eyes" | 121 ch, **1 unasked proposal** | 43 ch, cited, none |
| "set up a scene" | 1,105 ch, directive in the field | 473 ch, directive in the field |
| "who is Vel, in one line" | 133 ch, **1 unasked proposal** | 138 ch, none |

**Two over-corrections, caught by re-probing rather than by reading the prompt.** Adding *"a
directive goes in the directive field and nowhere else"* made it fill that field on **all four**
probes, including "who is Vel" — an unwanted directive opens a card the writer has to dismiss. And
*"one line if one line does it"* plus *"a short answer is a good answer"* produced a **six-character
reply**: `Green.` Uncited, from nowhere, which is the one thing the panel exists not to do. Both
needed the opposite instruction written next to them — *only when asked, otherwise leave it empty*,
and *short is not uncited*, and *long when they ask for long*.

**What is not fixed:**

- **Instructions still leak into the reply.** The setup probe, after the change: bleed, in the
  reply, alongside a correctly-filled directive field.
- **Unasked proposals are variable, not gone.** Two runs of the same "long answer" probe: **4
  proposals, then 0.** The four-of-four zero in the table above is one sample of each probe, and it
  is not evidence the behaviour stopped.

**The detector was wrong first.** The bleed regex I started with matched a list of openers — `end
with`, `have her`, `write a scene`. It reported **no bleed** on a reply ending *"let Vel's dialogue
cut between the surreal imagery and the raw intimacy of their history"*, which is an instruction
wearing a different verb. Widened to cover `let X`, `show X …ing`, `focus on`, `lean into`, `resist
the urge`, `don't let`, and the setup probe went red immediately. **The first version of this
finding would have said the bleed was fixed.** It still cannot see an instruction phrased as an
observation, which is the next way it will hide.

Both residuals are the same shape: the prompt forbids it and the model sometimes does it anyway.
Neither is a candidate for more prompt: a proposal costs one dismissal in a queue that nothing
reaches canon through, and that is the accept-first design working as designed. A code-side gate on
proposals from a talk turn is a product decision, not a defect fix.

---

## F27 — "Have Anansi write one" took three passes to stop being useless, and pass one reproduced F25 inside a day.

Seth: *"outfits, locations, new threads, should leverate the ai so it can create one itself, off of
one button or the user can direct it and then it creates one based off of that."*

Four probes on a copy of *Sutera Remembers*, through `POST /api/invent`, after each revision of the
prompt and schema. One model, sequential, ~7s a call.

**Pass 1 — it wrote well and filed nothing usable.**

| probe | what came back |
|---|---|
| outfit, steered "she is in mourning" | 400 characters of paragraph, cut at `stitched with the same Old Script that binds *W` |
| character, its own invention | 600 characters, cut at `vials of glass filled with the echo of a *` |
| lore, steered | good entry, `keys: ["The Synod of the Hollow", "ascetic", "white bone masks", "upper tiers/Celestial towers"]` |
| character | `keys: ["name", "attribute", "relation"]` |

**The maxLength caps I had just written F25 about, reintroduced in the schema of a new route on the
same day.** 400 and 600, both hit exactly, both cut mid-word, both still valid JSON — so both would
have entered the ledger as half a sentence. Nothing was prose-shaped either: every body came back as
flowing description rather than the bracket form the ledger holds and the context window renders.

**Pass 2 — the caps gone and the bracket form asked for, and it broke the two-field case.** The
outfit's `name` filled with the first sixty characters of its own body (`"The Murmur, attribute:
widow's weeds of black oilcloth and t"`), the outfit's body described *the character* rather than the
clothes, and a steered lore entry took the steer verbatim as its title: `"a rival congregation in the
upper tiers"`. One format instruction cannot serve a two-field outfit and a three-field ledger entry.

**Pass 3 — a format block per kind, and the steer demoted to a brief.**

    outfit  "Mourning grey"  [wearing: charcoal wool coat, heavy with ash, slit at the hem
                              for movement, no lace, no softness]
    lore    "The Pale Liturgy"  [Name: The Pale Liturgy, attribute: rival high-tier congregation,
                                 relation: rivals to the Rust Choir …]   keys: Pale Liturgy,
                                 Celestial towers, high-tier, Rust Choir

The outfit body says only what is worn, because it is appended to her entry while the outfit is on
and repeating who she is costs those tokens twice. The steer is *"what they want, not what to call
it"* — which is what stopped the title being a parrot of the brief.

**Still wrong, small:** `keys` sometimes includes the title again, which the prompt tells it not to.

**What the route does not do, and this is the point of it:** nothing it returns is saved. The outfit
arrives in the Wardrobe fields with Add still unpressed; a thread goes to the proposals queue through
the same `classify()` the chat and the extractor use — the unsteered character probe returned **The
Wax**, which the ledger already has, and came back `proposed 0, duplicate`. Twelve entries before the
four calls and twelve after. `test/talk.ts` holds that: saving the outfit, or writing the entry
instead of proposing it, each turn an assertion red.

---

## F28 — The lockout takes the protagonist's dialogue to zero and cuts his action by two thirds. It does nothing measurable to his interiority, which was the part F21 was about.

Seth: *"the ai shouldnt write dialogue or action or inner thoughts for the main protagonist."*
Three things. It fixes two of them.

Two arms, 25 generations each, Direct mode, **run simultaneously** against the one router — the
only controlled comparison this project has, since nothing sets a seed. Two stories identical
except that arm B names `Aldis Fen` in the new story setting. Every rate below is **a floor**: the
counters are anchored on his NAME, never on a pronoun, so they undercount — equally in both arms,
which is what keeps the comparison sound.

| | control | lockout on | two-sided Fisher |
|---|---|---|---|
| **acted** — him as the subject of a physical verb, in narration | 19/25 = **76%** | 6/24 = **25%** | **p = 0.0005** |
| **spoke** — dialogue attributed to him | 5/25 = **20%** | 0/24 = **0%** | p = 0.050 |
| **told** — the narrator stating what he feels, knows or decides | 6/25 = 24% | 4/24 = 16.7% | p = 0.73 |
| any of the three | 19/25 = 76% | 9/24 = 37.5% | — |

Denominator is runs that NAME him in narration: 25/25 and 24/25. Median length went **up**, 849 to
952 characters — the lockout does not make it write less, it makes it write the room.

**Zero is not an absence.** 0 of 24 bounds his dialogue rate under about 12%; it does not mean the
model will never write him a line.

**Interiority is untouched, and that is the honest headline.** p = 0.73 is nothing. The line names
it explicitly — *"never state what they feel, know or decide"* — and the model went on doing it at
the same rate. F21's finding stands: it narrates the protagonist's inner state because that is what
third-limited prose IS, and one instruction in DIRECTIVE does not move it. **Do not read the 24%
here against F21's 82.5%** — different fixture, different scene, and F21 counted pronouns.

**Continue mode does not break.** The obvious worry was a mode whose whole job is to carry the
passage on, told to stop where its protagonist would act. 8 runs per arm: 8/8 produced prose in
both, median 564 characters with the lockout against 639 without, no stalls and no empty returns.
n=8 answers "does it break" — no — and nothing else.

**The detector was wrong twice, and the second time survived a fixture built to fix the first.**

1. Anchored on `(he|aldis|fen)`, against a fixture where the caller was *Marek's man*. Arm B's
   first samples read *"He wore a heavy wool duster… He stopped under the awning… He reached into
   his breast pocket"* — every one of them the caller, every one scored as the protagonist acting.
2. So the fixture was rebuilt with one man in it: Marek and the collector Sabel both written as
   women in canon. **The model re-genders them.** Sabel came back as *"the hem of his coat… He
   stopped inches from the awning's edge"*, and the second man was back in the scene.

A regex does not resolve a referent and no fixture stops the model inventing one, so the counters
now match his name only. That is why every number here is a floor. Fifteen synthetic cases assert
both directions, including the one that documents the undercount itself: `He reached into his coat`
must score **false**, so nobody reads a rate here as a rate.

`bench/lockout.ts report` **re-scores from the stored prose**, never from the verdict written at
generation time. Both detector fixes landed after their runs; a report that trusted the stored
verdict would have gone on printing the wrong numbers from the right prose with nothing to show for
it. The two arms above were re-scored, not re-run.

---

## F29 — The mode prompts, re-cut. The checklist was being filled 10 times out of 10, and taking the paragraph count out of Continue halved the passage.

COUNCIL-04: *"Two of the five mode prompts produce slop. Speak's 'speech, action, the room' is a
checklist and a checklist gets filled — reply, gesture, weather. Direct and Continue carry length
targets, which is F18's defect pointed at prose."* Seth's own list added the spice levels to the
same sitting.

Two arms of 20 alternating Speak and Continue, **two servers — one running the old prompts, one the
new — against the one router at the same time.** Same fixture, same database contents, `max_tokens`
450 on both.

| | old prompts | new prompts |
|---|---|---|
| Speak — **all three slots present** | **10/10 = 100%** | **5/10 = 50%** (Fisher p = 0.0325) |
| Speak — paragraphs, median | 7 | 5 |
| Speak — characters, median [range] | 852 [539–1306] | 788 [563–1571] |
| Continue — characters, median [range] | 685 [519–915] | **291** [172–657] |
| Continue — paragraphs, median | 2 | 2 |

**Ten out of ten.** The review said the shape gets filled; it was being filled every single time.
Halving that is the single clearest result in this file, and it cost one sentence: *"any one of
those is a whole answer and the scene is owed no other."*

**The paragraph count was doing more work than anyone thought.** Continue's median passage fell to
**43% of its old length** when *"the next 1-2 paragraphs"* came out, with the floor dropping from
519 characters to 172 — the model was padding to the number, and without it a beat is as long as
the beat. Read three of them before deciding whether that is good: they come back as complete
beats in the fixture's declared voice, not as truncation.

**Two things this does NOT establish.** The fixture's own `writingStyle` says *"clipped and wet.
Short sentences"*, so the absolute lengths are that story's, not a general figure. And whether a
291-character passage is what Seth wants is a taste question a benchmark cannot answer — the
finding is that the number in the prompt was setting the length, not that the new length is right.

**A third defect, found while fixing the two named ones.** `act` said *"the consequence, the
reaction, the world answering"* — the same three slots in different words. COUNCIL-04 named Speak
only. Both are gone, and `test/engine.ts` now forbids either coming back, along with any paragraph,
sentence or word count in any of the five.

### The five levels, re-planned

Not measurable the way the modes are — nothing in this harness scores whether a register was
honoured, and a rubric that tried would score the judge. What changed and why:

Every level now says the same three things in the same order — what may be on the page, **where the
camera stops**, and how it is written. The old lines said them in adjectives, and an adjective is a
thing the model reinterprets on every call: *"written with restraint"* reads as *write around it*,
and *"suggestion and aftermath over anatomy"* is a craft note being asked to do a boundary's job. A
level is a boundary. The craft belongs to the voice sample, which since the VOICE block has been
reaching the model verbatim.

The ladder is now literally where the camera stops — **at the kiss, at the door, in the room, on the
act, nowhere** — and each level is the one before it plus a step, so moving a story up a level gets
what it had and more rather than a different register.

---

## F30 — What the contradiction repair costs: 1.5 seconds on every generation, and it did not fire once in six.

Owed since the repair shipped. The route logs the prose call's latency; the request also pays for
the canon check, and for the repair when the check fires. The difference is the cost.

| wall | prose call | overhead | repaired |
|---|---|---|---|
| 3,830 ms | 2,347 ms | 1,483 ms | no |
| 2,805 | 1,349 | 1,456 | no |
| 2,861 | 1,407 | 1,454 | no |
| 2,468 | 1,052 | 1,416 | no |
| 4,571 | 3,043 | 1,528 | no |
| 2,874 | 1,424 | 1,450 | no |

**Median 1,456 ms, and remarkably flat** — 1,416 to 1,528 across prose calls that ranged from 1.0s
to 3.0s. That is the shape of a fixed cost: a short prompt, a small structured answer, and a warm
cache.

**0 of 6 fired a repair**, which bounds the repair rate on this fixture under about 40% and says
nothing more — six is six. The repair itself is a full extra generation when it happens and was not
observed here.

Whether 1.5s on every passage is worth a contradiction caught before it reaches the page is Seth's
call, not a benchmark's. It is roughly a third of a warm generation.

**An aside worth writing down:** the mode A/B ran at about 90 seconds a row, and the first
explanation reached for was this repair. It was not — two servers contending for a two-slot router
was. The number above is what it actually costs, measured with the router otherwise idle.

---

## F31 — Chapter 120 does not forget its beginning. It forgets 65 chapters in scattered runs, which is worse, and COUNCIL-04 had it wrong.

COUNCIL-04 #9 said a 120-chapter book needs 20,952 tokens of chapter summaries against an 11,536
ceiling, and that they **"drop oldest-first"**. The first half is right. The second is not, and the
difference matters.

Measured on the engine directly — summaries are text and the ceiling is a fraction of the budget,
so this needs no model and is now an assertion rather than a bench run. 120 chapters, 220-token
summaries, a 46,146-token budget:

| | summaries sent | dropped | EARLIER tokens |
|---|---|---|---|
| as it stands | 52 | **65** | 11,440 |
| first 100 chapters as five acts | 22 blocks | **0** | 4,083 |

**What survives is not the recent half and not the oldest half. It is scattered:**

    kept:  6, 7, 8, 9,  52, 53, 54, 55,  …  96, 97, 98, 99
    gone:  1, 2, 3, 4, 5,  10, 11, 12,  …  114, 115, 116, 117

Runs of four, with holes between them, and **the newest is not kept either** — 117 is gone. That is
COUNCIL-04 #8 showing through: eviction follows insertion order rather than age. A book missing its
beginning has a beginning it has forgotten. A book missing chapters 10 to 51 **contradicts itself in
the middle and cannot say why**, and the writer has no way to see which of its own chapters the
model can no longer read.

The fix already existed and had **no caller in the UI**: `POST /api/rollup` collapses a run of
chapters into one act, and the engine already prefers acts over the summaries they cover. It is
reachable now — Chapter → Acts — and the button computes its own range from the oldest run that is
summarised, not stale, and not already inside an act, so the writer is not asked a question about
their own token budget.

Five acts over a hundred chapters take **4,083 tokens against 11,440**, and nothing drops.

**FIXED the same day — see F32.** The scattering was a string compare on chapter ids. What a long
book forgets is now its distant past, in one unbroken run, whether or not it has been rolled up.

---

## F32 — The eviction order was creation order in one place and alphabetical order in the other. Both are now the thing they should always have been.

COUNCIL-04 #8, and the mechanism turned out to be two different bugs wearing one finding.

**EARLIER sorted chapter ids as strings.** `"c10"` sorts before `"c2"`, so a 120-chapter book
dropped its summaries in the order `c1, c10, c100, c101 … c11, c110 … c2`. That is why F31 measured
the survivors as **6-9, then 52-55, then 96-99** — runs of four with holes between them, and the
newest summary dropped as well. Nobody chose that; it fell out of a `localeCompare` on an id that
happens to end in a number.

    before   kept 6-9, 52-55, … 96-99      52 summaries, scattered, newest dropped
    after    kept 66-117                   52 summaries, one unbroken run, newest first

Same count, because the ceiling has not moved. Completely different book: the model now has an
unbroken memory of the last fifty-two chapters instead of four-chapter islands with forty-chapter
holes it cannot see or report.

**Canon evicted in creation order,** because rows come back by `rowid` and the sort returned 0
within a kind. Creation order is *inversely* correlated with importance in any story that was
sparked — the protagonist is written first — so when the 45% cap bit, it took the protagonist and
kept yesterday's walk-on.

Every triggered canon block already records how it earned its place, so that is now what ranks it,
weakest first:

    sticky 3 back  <  sticky 1 back  <  keyword  <  point of view  <  pinned in  <  always-on

A sticky hold is the weakest and gets weaker the further back it reaches: three passages ago is a
person who has left the room. Pinned is strongest because the writer said so in as many words.

Both halves are asserted and both were falsified by restoring exactly the defect they fix — the
string compare, and the `return 0`. Neither needed a model: eviction is arithmetic over text.

**One thing this does not do.** It decides what to drop; it does not tell the writer what was
dropped. At chapter 120 fifty-two summaries still go, and the only place that says so is the
Context panel's dimmed rows. A writer who has not opened that panel does not know their book has a
horizon.

---

## F33 — Anansi can tell an unpaid promise from a fact, first try. It cannot tell which chapter made it.

Strings are the last of COUNCIL-04, and the design is Seth's: writer-facing until summoned, and
proposed by Anansi through the same queue as everything else.

The distinction the prompt has to carry is narrow — *"Aldis owns a letter" is a thread, "Aldis has
not opened the letter" is a string* — so it is worth knowing whether the model holds it. One call,
on his own *Sutera Remembers*, asked what the story had set up and not paid off:

| kind | what came back |
|---|---|
| string | **Vel's Expectation** — she asks if you remember what you have forgotten; the memory is never named |
| string | **The Room with No Doors** — the Sliver conjures it, and its significance is unresolved |
| string | **The Dark Throat** — the Wax points into the shadow, you step in, the destination is unknown |
| thread | **The Wax Figure** — a character entry, which is a fact rather than a promise |

Three unpaid setups and one fact, sorted correctly, on the first attempt. Every one is a real
thread of that story left hanging, not an invention — which is the failure the prompt warns against
in as many words: *"an unpaid promise you invented is a plot you are handing the writer, not one you
noticed."*

**What it got wrong: all three said chapter 1, and the story is on chapter 2.** The prompt asks for
the chapter a promise was set up in and the model has the recent passages, but **nothing in what it
was given said which chapter number those passages belonged to.** The summaries above them are
labelled by chapter; the loose prose at the end never was. It was not guessing badly so much as
answering a question it had no material for.

**Fixed by giving it the material, not by defaulting the value.** One line in the ask now names the
chapter the trailing passages belong to. Same question, same story, immediately after:

| | chapter said |
|---|---|
| before | 1, 1, 1 — on a story open at chapter 2 |
| after | **2, 2, 2** |

And the three it found the second time are different from the first three and equally real — the
room with no doors and Vel saying *run*, the Wax figure's identity, and "the draft" Vel says he is
not finished being written into. Two runs, six strings, no invented ones.

The tempting fix was to default the number to the current chapter when the model's looked wrong.
That would have produced right-looking answers for a model that still could not see the chapter, and
been wrong the moment a promise really was set up earlier.

n=1 per arm. This establishes that the distinction is expressible and that the chapter number
follows from being told, not a rate at which either holds.


---

## F34 — "Clicking a story does not open it" on Android is a drift threshold: 14px of finger movement still opens it, 24px does not.

Reported twice as "some touch events do nothing" and once, concretely, as tapping a story on the
shelf doing nothing on Android. Both were unreproducible, for a reason that turned out to be the
harness rather than the app: `bench/drive.ts` had only ever had a mouse. Every scenario ran with
`hover:hover` matching, `matchMedia('(hover:none)')` false, and a tap that was a click with a hover
before it. There was no way to reproduce a touch-only bug, so three reports sat unexplained.

`page.mobile()` now sets a phone viewport AND `Emulation.setTouchEmulationEnabled`, and `page.click`
switches to real `Input.dispatchTouchEvent` pairs once it is on.

Two wrong turns worth recording, because both looked like the app failing:

- `Emulation.setEmitTouchEventsForMouse` hangs `Input.dispatchMouseEvent` — it never returns, and
  every `page.click` in the scenario blocks until the run is killed. Measured on a button that opens
  nothing, so it was not the story-open path. Do not use it; dispatch touch directly.
- The first selector, `[data-open]:not([data-open="new"])`, matched a **rail** item at `x = -132`.
  A closed drawer still has its contents in the DOM, so an unscoped selector on a phone viewport
  clicks off-canvas at negative coordinates. `page.click` now refuses a negative box and says why.

With those out of the way, a clean tap works — the story opens, three blocks, the bar reads its
title. The defect is drift:

| finger movement between touchStart and touchEnd | story opens |
|---|---|
| 0px | yes |
| 6px | yes |
| 14px | yes |
| **24px** | **no** |
| 40px | no |

The threshold sits between 14 and 24 CSS px. The hero card is 354×307, on a page that scrolls, so
the browser is deciding whether the gesture was a tap or the start of a scroll — and above the
threshold it chooses scroll and never fires `click`. On a 3x-DPI phone, 24 CSS px is a few
millimetres of thumb roll, which is ordinary one-handed use on a target that size.

**Not fixed.** The fix is not local to the shelf: every large touch target in the app is reached
through the one delegated `click` handler in `web/app.js`, so the same drift kills the ⋯ actions and
the panel buttons, which is exactly what "menu navigation isn't intuitive, hard on mobile" describes.
The shape of a fix is a `pointerdown`/`pointerup` tap recogniser on that same handler, firing when
movement is inside a band and the gesture was short, with a guard that swallows the native `click`
when the browser does fire one. That guard is the whole risk: get it wrong and destructive actions —
Delete take, Delete this story — run twice. It wants agreeing before it lands, not shipping quietly.

The number is a floor on the defect, not a rate: it says the mechanism exists and where its edge is
on emulated Chrome at 390x844. A real device may cancel earlier.

---

## F35 — A personality for Anansi. Citation went 1-in-4 to 3-in-4, the loose-end habit landed at 3-in-5, and the first version turned the new vocabulary into section headers.

Seth chose the register from three drafts: *the trickster who likes a knot* — "enjoys the writer's
traps, hunts knots, hands back the loose end you dropped."

The diagnosis first, because it was in the prompt and not in the model. `TALK` was a manners
contract: of twelve behavioural bullets, nine were prohibitions. The only character in the whole
prompt was one adjective pair — "Dry, and a little sly" — against nine "don'ts", and the don'ts won.
What was missing was a stance, a habit, and exemplars. Exemplars matter most: a model imitates two
worked examples far more faithfully than it follows an adjective.

Three probe runs on *Sutera Remembers*, n=1 per probe, nothing seeded, sequential. Behaviour, not a
rate — the same caveat F26 puts on its own table. All three scored by the same detector after it was
corrected, so the columns are comparable:

| | cited (where possible) | instructions leaked | loose end | unasked |
|---|---|---|---|---|
| before | 1/4 | 0/5 | 0/5 | 0, then 1 |
| after, first version | 3/4 | **1/5** | 2/5 | 0 |
| after, anti-template | **3/4** | 0/5 | 3/5 | 0 |

**The detector was wrong before the model was.** The first scoring of the "after" run said 2/4 cited,
because `cites` wanted `chapter 4` and the new voice writes *"chapter one"*. Found by reading a reply
the detector had marked uncited which plainly cited its source. Both numbers in the first two rows
were understated until it was fixed, and the fixed version has three more cases asserting the shapes
it had been blind to. The detectors now live in `bench/voice-detect.ts` for the reason `verdict.ts`
does: a classifier with two callers becomes two classifiers.

**The regression, and what caused it.** The first version leaked an instruction into the reply on
"set up a scene" — 943 characters that had invented a FORM: `Knot:`, `Loose end:`, `Directive:` as
labelled sections, the loose-end section padded to 700 characters of repeated fragments ("The figure
is the threat. The figure is the memory."), and a directive duplicated into the prose as well as the
field. Handed vocabulary, the model built a template out of it. The fix names that directly — one
sentence, in the prose, never a label, no headings — and the leak went to 0/5.

**Two costs that are not fixed.**

Replies are two to three times longer. "who is Vel" 119 -> 514 characters, "what is this story about"
172 -> 679. The prompt still says short by default and F26 was bought making answers shorter; some of
the growth is the loose end itself, which is the feature, and some is not.

The refusal grew a loose end. "who is Ondrel Kesh" — nobody in this book — answered:

> The story does not say.
>
> Nobody has asked why the figure in the fissure knows the taste of her hair.

The refusal is intact and first, and the loose end is real — the figure in the fissure is in the
prose. But the prompt says "The story does not say" is a whole reply. Say it and stop, and this is
not that. Not an invention, which would be the serious failure; a breach of the stop rule, which is
Seth's call rather than mine.

The loose-end rate is reported as n-of-5 on purpose. The register asked for a habit and 5/5 would be
a tic, as wrong as 0/5. 3/5 is inside the band this was aiming at, on one run.

---

## F36 — The prose quotes the ledger. A guitar came out of a coat pocket because the entry saying she carries one is in every prompt, and the contradiction checker cannot see this class at all.

Seth brought a passage and asked whether it was the model's fault or the prompt's. The last sentence:

> She reaches into her pocket, pulls out a weather-beaten Martin guitar, and taps one against the
> filter.

Read it as the model planned it: *she reaches into her pocket, pulls out a ⟨noun⟩, and taps one
against the filter.* That sentence was built for a cigarette — "taps one" needs a pack to take one
from and "the filter" is a cigarette's. The model had the shape right, needed a concrete noun, and
took the nearest one in its context.

The nearest one was canon. Halsey's entry, `always_on`, so it is in EVERY generation:

    [Halsey: The Musician. A biracial, bisexual, bipolar artist hiding behind a constructed name,
     wearing a thrifted military jacket and carrying a weather-beaten Martin guitar.]

Two phrases came out of it whole — "the thrifted military jacket swallowing her frame" and "pulls
out a weather-beaten Martin guitar". Scored by `bench/quote-detect.ts`: **3 shared runs, longest
"weather beaten martin guitar".**

**The prompt, not the model.** Two causes, both fixable where we can reach them:

The body was written as finished English. *"wearing a thrifted military jacket and carrying a
weather-beaten Martin guitar"* is a quotable clause. A fact list is not: rewritten as
`jacket: thrifted military, oversized, brass buttons dulled. guitar: Martin, weather-beaten, kept in
a hard case.` the same passage scores **0 runs** — the phrases are simply no longer there to lift.

And SYSTEM never forbade it. It said canon is true, do not restate it as exposition, canon wins on
conflict — nothing said canon is what is TRUE and never how to say it. `INVENT` had learned exactly
that lesson earlier the same day ("never say it back word for word"), but that governs writing an
entry, not writing prose from one. SYSTEM has the line now.

**The checker is structurally blind to this.** It compares a passage against canon, and canon SAYS
she carries a weather-beaten Martin — so a passage saying she carries one agrees with canon
perfectly. The incoherence is internal: she set the case down two paragraphs earlier, and pockets do
not hold guitars. Nothing in the pipeline looks for internal coherence, and no amount of tuning the
contradiction prompt would find this.

**What is NOT established.** Six generations after both changes came back 0/6, and that is not
evidence the fix worked. Zero in six bounds the rate under about 40% and nothing more — F12 made
exactly this mistake with zero in sixty against a true rate of 4%. The baseline was 0/3 BEFORE the
changes, on a different directive from the one that produced Seth's passage, so there is no
before/after here at all. What is established is the mechanism, from one real passage, and that the
rewrite removes the phrases it lifted.

The detector's own threshold was measured rather than chosen. At 4-grams it reported that passage
clean, because "a thrifted military jacket" arrives as "the thrifted military jacket" and shares only
three words. Three is safe only because of the weight rule — three tokens over three characters —
and the case that proves it was missing from the first version: "hiding behind a" is a three-word run
shared with canon and is plainly not a quote. Removing the weight rule now turns that case red.

## F37 — the narrator contracts when the voice says to, and the voice never said to (2026-08-27)

Seth: "no ai ive used will use contractions in its writing even though its in the instructions for
the voice." Measured with `bench/contractions.ts`, two runs, twenty passages, one story.

| surface   | contracted / opportunities | rate |
|-----------|---------------------------|------|
| narration | 12 / 63                   | 19%  |
| dialogue  | 9 / 10                    | ~90% |

**The denominator is opportunities, not words** (F10): every place one of a closed set of expandable
forms appeared. `'s`, `'d` and `I've` are excluded from *both* halves because their expansions are
ambiguous — a rate built on "the coat's hem" is not a rate.

**The pooled 19% is the wrong summary, and this is the finding.** Per passage the distribution is
not a rate at all, it is bimodal: of twenty passages with an opportunity, **seventeen sit at 0% and
three sit at 60%, 75% and 100%**. The narrator does not contract one time in five. It decides once,
per passage, and then holds that decision all the way down. A pooled rate hides that completely, and
a prompt change tuned against 19% would be tuned against a number that describes nothing.

**The hypothesis was wrong, and the control says so.** The guess was that `render.ts` SYSTEM's
*"Match the established voice. Do not escalate register on your own"* was outranking the story's
voice field — the model reading prose with no contractions in it and matching the evidence over the
instruction. A clause was added making the stated voice authoritative on register, and the rate went
from 23% to 98%. That looked conclusive and was not: **two things had changed at once**, the clause
and the story's style text, which was edited to demand contractions in narration.

The control arm removes the clause and keeps the demand, on a fresh database so existing prose
cannot seed the register either way:

| arm | voice demands it | SYSTEM clause | narration |
|-----|------------------|---------------|-----------|
| baseline   | no  | no  | 9/39 = 23%  |
| control    | yes | no  | 48/49 = 98% |
| treatment  | yes | yes | 50/51 = 98% |

**98.0% against 98.0%. The clause earned nothing and was removed.** The model was never overriding
the voice field; it was following it exactly. The field simply never mentioned contractions —
`DEFAULT_VOICE` does not, so no new story asks for them, and a model writing literary narration
defaults to expanded forms. Say it in the voice and you get it, in one line, on every passage.

The bimodal per-passage pattern disappears with the demand: twelve passages, twelve at ~100%. That
is consistent with the register being decided once per passage from the instruction rather than
sampled per sentence, which is what the baseline's 17-at-zero / 3-at-high split already suggested.

Untested, and worth knowing before anyone re-adds the clause: this fixture is a short story. A long
book whose established prose contradicts a voice field the writer has just CHANGED is the case the
clause was written for, and no arm here tested it. It is a real question; it is not this finding.

**The wording of the voice line is worth about nine times the line itself.** Seth added a rule to
his own book and still got formal narration. His clause is `Use contractions.` — two words at the
front of one 812-character run-on line holding a dozen other instructions, and that same sentence
then writes *"it will not state emotions outright"*, modelling the form it is asking against.

Held everything else still — same fixture, same model, same sixteen passages of un-contracted prose
— and changed only the phrasing:

| what the voice says | narration |
|---------------------|-----------|
| nothing about contractions | 9/39 = 23% |
| `Use contractions.` buried in a long line | 3/28 = **10.7%** |
| its own line, names *narration*, gives the forms | 42/43 = **97.7%** |

The buried version is no better than not asking at all — 3/28 against 9/39 is not a difference these
denominators can resolve, so read it as "bought nothing", not as "made it worse". The explicit
version is a different result entirely, and it holds against a book whose established prose
contradicts it, which is the long-story case this finding previously listed as untested. **That
question is now closed: prose does not outweigh the voice field. Weak phrasing does.**

The line that works, for reference: *"The narration contracts the way speech does: isn't, doesn't,
you're, I'm, won't. Never the stiff expanded forms in narration."* Three properties, none of them
decoration — its own line rather than buried in a list; the word *narration*, because the model
already contracts in dialogue and reads a bare instruction as being about speech; and the actual
forms, because an abstract style word is the weakest kind of instruction there is.

Measured on the live library, read-only: `The Anagram of Ash` runs 44% over its last five model
passages with the weak clause in place — above the 23% baseline, nowhere near 98%. Consistent.

**Detector, validated before the result was believed** (F17): fourteen cases, both directions, in
`bench/contractions.ts check`. The specific trap it guards is a model writing the typographic
apostrophe U+2019 against a detector spelling it `'` — that scores fluent prose at zero and sends
you to rewrite a prompt that was working. The context tokeniser had exactly that bug the same day.
The first run of the probe also scored six real passages as "empty" from a wrong response key; every
skipped trial is printed rather than folded into a denominator, which is the only reason that read
as a bug instead of as "0%, confirmed".

## F38 — the ledger's keyword path is not dead. It fires 107 times in 148 chances, and the flip PLAN-06 §2e asks for would add 75 more chances and darken nothing (2026-08-28)

PLAN-08 Phase 1. Measured with `bench/fires.ts`, read-only over the whole library, no model:
`fires()` imported from `src/context.ts` rather than copied, the sticky walk mirroring
`context.ts:444-454`, and the real trigger window including `passages.directive`.

| story | positions | as it stands | after the flip | would go dark |
|---|---|---|---|---|
| Test | 8 | 22 / 24 — 91.7% | 22 / 24 | 0 |
| The Anagram of Ash | 62 | 85 / 124 — 68.5% | 133 / 186 — 71.5% | 0 |
| The Shadow's Debt | 13 | **0 / 0 — never asked** | 11 / 13 — 84.6% | 0 |
| **library** | 83 | **107 / 148** | **166 / 223 — 74.4%** | **0** |

Three stories have one passage each and cannot be walked.

**§2e's headline is stale and this supersedes it.** On 2026-08-27 it read twelve entries out of
`anansi.db` and found twelve `always_on`, zero `triggered`, and called `fires()` "the best-tested
dead code in the app." That was true of that library on that day. It is not true now — the ACCEPT
path at `routes.ts:1336` lands accepted lore, items and rules `triggered`, and enough have been
accepted since that the keyword path now runs on 148 entry-positions and answers on 107 of them.
The dead-code claim should not be repeated without re-running this.

**The denominator is entry-positions where the entry was ELIGIBLE to fire** — activation
`triggered`, not the point-of-view character, which `context.ts:441` includes unconditionally. An
always-on entry is not a failure to fire; it is a refusal to ask, and it is in neither half. Without
that split the library reads as 100% and decides nothing (F10).

**The number the flip turns on is the last column, and it is zero.** An entry that becomes
`triggered` and then never fires does not degrade, it vanishes silently — so the risk of applying
`src/import.ts:127`'s rule at the three proposal sites is exactly the count of entries that would go
dark across a whole book. On this library, none. `The Shadow's Debt` is the case that argues for it:
one book where the ledger currently never fires at all, and where the flip would put it in front of
the model on 11 of 13 positions.

**CORRECTION, same day — "0 would go dark" answers a weaker question than it sounds like.**
`bench/ledger-audit.ts` already existed and asks the per-ENTRY version of this: it reports **1 of 12
entries the prose can answer for would go dark**, and 2 more (Phone Passcode, Konrad Curze) *"fired
only in the past and NOT on the live window: safe on the record, dark on the next call."* Both
numbers are right and they are not the same question. `fires.ts` asks *did this entry ever fire at
any position in the book* — zero never did. `ledger-audit` asks *would it reach the model on the
next call* — which is what a writer notices. **The stricter number governs**, and it says the flip
is not supported for entries that already exist. It also flags that 4 of its 11 "safe" verdicts rest
on stories holding fewer than four selected passages; one passage that names a character is not
evidence that the next fifty will.

`bench/fires.ts` should have been part of `ledger-audit` and was written without finding it first.
It is kept for the per-position denominator, which the older file does not report, and its header
now says so. Two probes on one decision is how classifiers drift; neither copies the matcher.

**What this does not say.** It cannot say a fired entry deserved to fire — that is a judgement about
a book and needs a reader. The detector ships with 11 synthetic cases asserting both directions: a
name fires and an absent one does not, sticky holds a name that has left the window and stops at the
end of it, lore does not inherit a character's sticky, an entry fires on the directive alone and not
on an empty one, and an entry whose keys are never said fires nowhere. A story can carry several
branches and `ordinal` is unique per branch, so only the branch with the most selected passages is
walked; interleaving two would invent a history nobody wrote.

## F39 — the cap does not bite. Canon peaks at 2% of its 45% ceiling, and the worst crowded scene this project has on record would want 60% of it even with five rooms on every card (2026-08-28)

PLAN-08 Phase 3's second debt. The plan states the risk as a warning and not a number: *"one entry
is one block plus N addons, and N is unbounded because plural slots accumulate. COUNCIL-04 #7 was
46 entries firing at once; this is the same failure with a finer grain."* Measured with
`bench/weight.ts`, which walks every position of every book through `view()` and `assemble()` — the
same two functions the running server calls — against a **copy** of the database, so the live book
is never opened.

| book | positions | cards | as it stands | +5 rooms per card (modelled) | ceiling fills at |
|---|---|---|---|---|---|
| Test | 9 | 4 | 1% median, 1% peak | 5% | ~77 cards |
| The Anagram of Ash | 62 | 6 | 1% median, 2% peak | 6% | ~90 cards |
| The Shadow's Debt | 13 | 2 | 0% | 2% | ~90 cards |
| **library** | **84** | | **0 positions where the ceiling dropped a card** | **0** | |

**The denominator first, because it is the whole reading: NO BOOK HAS A ROOM YET.** Zero addons
outside the `outfit` slot exist across the library, and the outfit copies the migration made are
skipped by `context.ts` on purpose. So the "as it stands" column measures the shape *before* this
feature and is not evidence about it. Only the modelled column says anything about the risk PLAN-08
names, and it is labelled as modelled everywhere it appears.

**What is modelled and what is not.** Measured: what canon weighs at each of 84 real positions, with
the real cards, the real firing, the real budget and the real SYSTEM reserve. Modelled: k synthetic
rooms added to every card that reached the prompt, with a room's body stood in for by that book's
**median card body** (140–179 characters) — a room is a paragraph about a card in the same voice as
the card, so the card's own body is the closest thing the library has to a measurement of one.

**The decision this bought: eviction keeps dropping a whole card and does not learn to trim rooms
first.** The ceiling fills at roughly 77 cards firing at once with five rooms each, in the tightest
book. COUNCIL-04 #7 — 46 entries at once for an eight-person scene, the worst crowded scene on
record — lands at about **60% of that ceiling**. The most any book in the library has fired at one
position is 6. A per-room trim is therefore a mechanism for a pressure nothing has produced, and it
would have to choose between a spine and a room with no evidence about which the model misses more.
Written down as a `ponytail:` marker on `bodyOf` in `src/context.ts` with its trigger:
`bench/weight.ts` reporting the ceiling dropping a card at any position, or `fills` under about 50
cards. The upgrade path, when it fires, is rooms before spines — a card without its rooms still
tells the model who is in the scene, and a dropped card leaves it inventing them.

**The detector answers both ways before any of the above is believed** (F17).
`bench/weight.ts check` asserts that rooms make canon heavier, that each room adds again rather than
a flat surcharge, that the ceiling **does** drop a card when canon outgrows it, and that it drops
nothing when canon fits. A weight probe that cannot report "the cap bit" reports perfection forever.

**A percentage under 100 is not "the cap cannot bite".** It is the cap not biting on the prose that
exists, in a library whose largest ledger is six cards. This bounds the risk at today's sizes; it
does not retire it, and the trigger above is what re-opens it.

## F40 — the finished-thread scan is right about deaths and wrong about a closed building, and the direction clause it was built around measures exactly zero (2026-08-28)

PLAN-08 Phase 4. Measured with `bench/retire.ts`, four hand-written closing chapters, three runs per
case per arm, no database — it drives `retirable`, `RETIRE` and `retireSchema` directly, the same
three the route uses.

| arm | recall | false finishes |
|---|---|---|
| with the direction | 6/6 — **100%** | 3/30 — **10%** |
| without it | 6/6 — **100%** | 3/30 — **10%** |

**Recall is the uninteresting number and it is printed second on purpose.** A scan that finishes
everything scores perfect recall — the smoke alarm that never stops beeping detects every fire.
`bench/retire.ts check` asserts the two graders cannot be satisfied by one answer, and that naming
every card scores full recall *and* full damage.

**All three false finishes are one card, three times out of three, in both arms: `the Vestry`.** The
fixture chapter says it "closed its doors for the last time and the sign came down off the wall",
and the writer's direction says in as many words that it reopens in the last act. `Cazalet` is in
the same chapter, walks out "and did not look back", is named in the same direction line — and the
scan correctly leaves him alone every time. So this is not a scan ignoring the direction wholesale.
**It reads a PLACE the prose calls closed as finished, and a PERSON walking away as offstage**, and
nothing the writer says about where the book is going moves either reading.

**The direction clause measured zero across 30 chances and two placements.** `stories.direction`
reaching `src/prompts.ts` at all is new — until this it existed only in SPINE, on the prose path —
and it is the entire mechanism aimed at "depending on where we're going". It was measured in the
middle of the rules list and again at the head of the prompt as a named veto with the rule restated
in the list. Identical: 3/9 on the case built for it, both times.

**It is NOT being deleted on this evidence, and that is a deliberate departure from F20's precedent.**
F20 deleted CANON-REPEAT on 850 generations per arm. This is 30 chances, which is not a comparable
foundation for removing the only mechanism aimed at the problem. What this does buy is that nobody
may claim the clause works: the number is in the prompt's own comment beside it. To retire the
clause honestly, run this at n≥200 per arm with more than one card of the failing shape.

**The first version of this probe could not see the defect at all**, and that is worth recording.
Its three original cases were unambiguous from the prose alone, so both arms scored 0/21 and the
comparison read as "the clause is decoration" — the same output a working clause would produce. The
fourth case exists because a probe that cannot fail on the thing it was built to measure reports
perfection (F17). The gate is reported first and separately for the same reason: a `retirable` that
admitted nothing would report a flawless false-finish rate having seen no cards.

**What this means for shipping.** The scan PROPOSES; nothing is written without a press; a wrong
press is visible in three places and reversible in one. A 10% false-finish rate concentrated on one
recognisable shape is survivable under those terms and would not be survivable under any kind of
auto-accept. Do not add one. The next move on the model half is a rule about places specifically —
a building being shut is not a building being gone — with this probe re-run before it is believed.

## F41 — a place is never finished, it changes. The buildings failure in F40 is gone; what is left underneath is people who leave with final-sounding prose (2026-08-29)

Seth's call, and it is a design answer rather than a prompt fix: *"locations usually get revisited.
the end of chapter should update that its closed or in ruins or burnt or destroyed."* F40 measured
the scan finishing a building the prose called "closed for the last time", three times of three, in
both arms — while correctly leaving alone a man who walked out of the same room. Both readings are
defensible. The question was wrong.

**Only a person or a law stops being a subject.** `retirable` (`src/context.ts`) now offers only
`character` and `rule`; a place and an object are never candidates, asserted at the gate in
`bench/retire.ts check` rather than hoped for from the model. What happened to them belongs in
`history`, `appearance` or `provenance` — rooms that already exist, that a per-field proposal
already writes into, and that keep the card firing, which is the point: a burned gate is still
walked through and the model needs to know it is a ruin **now**.

| | recall | false finishes | places wrongly finished |
|---|---|---|---|
| F40, before | 6/6 | 3/30 — 10% | **3** |
| with the direction | 5/6 — 83% | 3/15 — 20% | **0** |
| without it | 5/6 — 83% | 4/15 — 27% | **0** |

**THE TWO RATES ARE NOT COMPARABLE AND THE PERCENTAGE IS THE WRONG HEADLINE.** F40's denominator
included nine chances that were places; every one of them is now refused before the model is asked,
so the denominator halved and what remains is entirely people. The number that moved is the last
column. Reading 10% → 20% as a regression is the mistake this table exists to prevent.

**What is left is one shape: a person who leaves with final-sounding prose.** Halloway — *"nobody
found him in the fire, and nobody found him anywhere else either"* — and Cazalet — *"walked out
through the yard and did not look back; whatever he had been to that place was over"*. Both are
alive and both are named in the writer's direction.

**And the direction clause is no longer measuring zero, which is new.** It took Halloway from 3/3
wrong to 0/3. It also took Cazalet from 1/3 to 3/3 — worse — so the net is 4 against 3 and **n=3 per
cell is too thin to decide anything**. It is recorded rather than acted on. To decide the clause,
re-run at n≥8 per arm; the fixture can now see the difference, which it could not before F40's
fourth case existed.

**Not tuned further, deliberately.** Seth: *"build well, debug the logic later."* Buildings were the
ask and buildings are answered. The people case is the next prompt experiment and it has a fixture
waiting for it.

## F42 — asking the model to QUOTE the sentence takes the finished-thread scan to 16/16 recall and zero false finishes, and settles the direction clause as load-bearing (2026-08-29)

F41 left one shape wrong and one question open. Both are answered, and the fix was structural
rather than more prose.

**The two failures the prompt already forbade in words.** Halloway — *"nobody found him in the fire,
and nobody found him anywhere else either"* — and Cazalet — *"walked out through the yard and did
not look back; whatever he had been to that place was over"*. `RETIRE` said *"Uncertain is not
finished. Missing, presumed, last seen, never found"* and *"somebody leaving a place for the last
time is usually not the person ending either"*. Both rules were there. Both were ignored. F37 is why
another prohibition was not the answer: the same rule buried in a list bought nothing.

**So the model produces evidence instead.** `why` — a one-line paraphrase — became `quote`: the
sentence from the narration, word for word, that says the person is dead or the law is void. The
route then checks the sentence is actually in the prose it handed over, normalised on both sides
with a 15-character floor. **That turns a judgement into a lookup, and a lookup is the only part of
this decision code can make for itself.** Quoted dialogue cannot pass at all, because
`narrationOnly` has already removed it — the rule this whole file runs on, arriving for free.

| n=8 per arm, 4 cases, 40 chances | recall | false finishes | Halloway | Cazalet |
|---|---|---|---|---|
| **before** · with the direction | 14/16 — 88% | 7/40 — 18% | 0/8 | **7/8** |
| **before** · without it | 14/16 — 88% | 8/40 — 20% | **8/8** | 0/8 |
| **after** · with the direction | **16/16 — 100%** | **0/40 — under 7.5%, not never** | 0/8 | 0/8 |
| **after** · without it | **16/16 — 100%** | 6/40 — 15% | 4/8 | 2/8 |

**THE DIRECTION CLAUSE IS DECIDED, AND IT STAYS.** F40 measured it at exactly zero and F41 could not
separate it at n=3. At n=8 the mechanism became visible and it was a WASH FOR A REASON: the clause
fixed Halloway completely (8/8 wrong → 0/8) and broke Cazalet almost as completely (0/8 → 7/8),
netting 7 against 8. With evidence required, the harm is gone and only the help remains: **0/40
against 6/40**. Two measurements that averaged to nothing were two large opposite effects, which is
the reading a single rate can never give you.

**Recall went up, not down.** 14/16 to 16/16. Demanding evidence did not make the scan timid — the
two it had been missing were cases where it had proposed something else instead.

**Zero is bounded, not claimed.** 0 in 40 is *under 7.5%*, printed that way by the probe. F12
declared a defect gone on zero-in-sixty when the true rate was 4%.

**What the writer sees improved as a side effect.** The proposal card now carries the sentence out
of their own prose rather than the model's summary of it, which is more use when deciding whether to
accept than a paraphrase was.

**`unevidenced` is returned and counted, not swallowed.** A scan that keeps naming cards it cannot
quote for is a prompt problem, and a count is the only way anyone would know.

## F43 — the contradiction checker is BLIND to numbers, not weak at them: 0 of 4 wrong counts against 4 of 4 of everything else. A targeted rule bought nothing and was deleted (2026-08-29)

Seth was asked whether numbers matter in a real book and said counts do. Measuring it first was the
right order, because the number F11 recorded was not the number.

**F11's "one case in twelve" was one numeric CASE among twelve, missed.** A rate over the wrong
denominator decides nothing (F10). `bench/checker.ts` now carries six numeric cases — three that
contradict and **three that are clean**, because a rule that flags every number scores perfect
recall on this class and is worthless.

| class | caught | false alarms |
|---|---|---|
| numbers | **0 of 4** | 0 on 3 clean |
| everything else | **4 of 4** | 0 on 7 clean |

**It is not a weak spot. It is a blind one**, and it sits beside a part of the checker that is
perfect.

**A targeted rule was written, measured, and deleted.** It named the thing and spelled out the form
— *"NUMBERS ARE FACTS AND A DIFFERENT NUMBER IS A CONTRADICTION… digits and words are the same
number: 4 crowns contradicts eleven crowns"* — with both negatives stated so it could not simply
flag every digit. **0/4 before, 0/4 after.** No movement, and no new false alarms either. Deleted on
F20's precedent: a clause measuring the same as its absence is tokens on every call for nothing.

**It cannot be a wording problem, and this is the observation that settles it.** Canon reaches the
model: the *no limp* case passes, and that fact is in the **same sentence** as the debt — *"limp in
the left knee from a fall he lies about, owes Marek eleven crowns"*. The checker reads that
sentence, catches the limp contradiction, and misses the crowns. It is not failing to be told; it is
failing to compare.

**The next thing to try is structural, and it is Rule 5's shape:** pull the numbers out of canon and
out of the passage in CODE, and ask the model only about pairs that disagree — rather than hoping it
notices while reading for everything else. That is the same move that took the retirement scan to
zero false finishes in F42: stop asking for a judgement and ask for a lookup.

**A hazard fixed on the way.** `bench/checker.ts` took `stories[0]` from whatever server it was
pointed at and **wrote passages into it**, deleting them afterwards — against the desk's live
instance that is somebody's actual novel. It seeds its own book now, which also makes the canon in
its header a fact rather than a hope: a run against a library without a brass key measured nothing
and said nothing about it.

## F44 — telling the model what the writer rejected changes nothing, and the control says why: a reroll already goes somewhere else on its own (2026-08-29)

`db.rejectTake` has recorded which takes the writer turned down since it was written, and has never
told the model. Its marker named the obvious next step — put "not like this" and the rejected text
into the prompt — and refused to take it on faith, citing F20. That was right, and the measurement
says something the question did not anticipate.

Built as an ARM rather than a feature: `Input.rejected` reaches DIRECTIVE as one bracket, nothing in
the app sets it, and `bench/reroll.ts` turns it on for half the runs. Both arms go through the real
`buildContext` and `render`, so they are the prompt the app would send and differ by exactly one
bracket — asserted in the probe's own check, which also pins both ends of the similarity scale.

| arm | median overlap with the rejected take | came back close |
|---|---|---|
| told what was rejected | **0.15** | 1 of 6 |
| told nothing | **0.19** | 0 of 6 |

**The control is the finding.** 0.19 means a reroll already lands somewhere else without being told
anything — the complaint the feature exists for, *"I pressed it again and got the same paragraph"*,
is not what this model does. There was nothing to fix, which is why saying more did not fix it. The
bracket is tokens on every reroll for a difference of 0.04 at n=6.

**What this does NOT say.** Nothing about whether the new take is any GOOD. A reroll that is
different and worse is a loss this cannot see, and the probe says so in its own output. It answers
the divergence complaint and nothing beyond it.

**The arm is kept rather than deleted, and n=6 is the reason.** F20 deleted a block on 850 runs per
arm and F43 deleted a rule on a clean 0/4; six pairs is thinner than either, and throwing away the
apparatus means rebuilding it to ask the same question properly. Nothing sets the field, so it costs
nothing at runtime. The trigger for revisiting is a writer actually reporting repeated rerolls —
then re-run at n≥50 and either wire it up or delete both halves.

**The similarity measure is word-level Jaccard with a four-character floor, and the floor matters.**
Without it, `the`, `and`, `a` and the rest of the scaffolding two English paragraphs always share
put every pair around 0.3 and bury the difference the arms exist to show. Both ends of the scale are
asserted in `check`: identical takes score 1, unrelated ones under 0.1.

## F45 — doing the comparison in code takes the checker from 0 of 12 wrong counts to 5 of 12, with no false alarms. And the bench was reading noise (2026-08-29)

F43 measured the checker blind to numbers and showed a targeted rule buying nothing, because it is
not failing to be TOLD — it reads the sentence carrying the count and compares everything in it
except the count. So the comparison stops being its job.

**`numbersIn` (`src/context.ts`) pulls every number out with the thing it counts**, words and digits
alike, folded so `crowns` pairs with `crown`. `check()` pairs canon's numbers against the passage's,
keeps the pairs that disagree, and asks the model one narrow question per pair — the same move that
took the retirement scan to zero in F42: stop asking for a judgement, ask for a lookup.

| | caught | false alarms |
|---|---|---|
| F43, prose rule | **0 of 12** | 0 of 9 |
| code-driven pairing | **5 of 12 — 42%** | **0 of 9** |

**Three things the code decides, so the model never sees them.** Dialogue never reaches the pairing
(`narrationOnly`), which kills *"Six crowns, maybe seven," the boy said* deterministically rather
than by instruction. A number canon says nothing about pairs with nothing. And the right number
restated is not a disagreement, so there is no question to ask.

**THE BENCH WAS READING NOISE AND THAT IS THE MORE USEFUL HALF OF THIS FINDING.** Every case ran
exactly ONCE. A prompt edit appeared to swing the numeric class 2/4 → 0/4, which is what exposed it:
the model is sampled, so a case is a RATE and not a verdict, and at one sample there is no telling a
change from the weather. `bench/checker.ts` takes a repeat count now and reports flagged-out-of-n
per case. Every number in F43 and in the first half of this finding was one sample per case.

**A prompt change made on that noise measured worse and was reverted.** The trap example in
`NUMBERS` collides with a fixture case — it uses "had two crowns in his coat" as a NON-contradiction
and one fixture case is nearly that sentence — so it looked like an own goal and was rewritten.
Measured properly at n=3: the original scores 5 of 12, the rewrite 3 of 12, consistent in direction
on both cases that fire. The collision is real and the rewrite still lost. Reverted, and the
collision is left standing as the honest state.

**Two cases never fire at all**: *"Two crowns. That was the whole of it"* and *"Three crowns stood
between him and the door"*. Both state a debt obliquely, without the word for owing. The pairing
finds them — code sees 2 against 11 and 3 against 11 — and the model declines both, every time. That
is where the next attempt goes, and it is a narrower question than the one F43 started with.

**Precision is untouched at zero false alarms in nine clean chances**, which is what makes 42% worth
shipping: the failure mode of a numeric checker is crying wolf on every figure in the prose, and
three of the six numeric cases exist to catch exactly that.

## F46 — the memory pass was asking about a blank card, and the prompt clause written to fix the symptom cost 26 points of placement (2026-08-29)

The first real chapter end after the body→facts migration produced three `changed` proposals and all
three came back with `field: "facts"` and a body carrying several rooms at once — `appearance: …
interiority: …`. A fourth character who walked through the lobby and said nothing was proposed as
changed as well. Three for three, in one shape, which is the signature of a cause rather than a
wobble.

**The cause was not the prompt.** `remember()` built its cast list from `resolveBody(e, ch.index)` —
the body alone. Every body in the library moved into a `facts` room that morning, so what the model
actually received was:

```
Halloran:
Wrenn:
Coyle:
```

Twenty-four characters, three names and three colons. Asked what had CHANGED about a person it had
never been shown, the model wrote a description of that person and filed it under the field that
holds permanent things. **That is the correct answer to the question it was asked.** `factsFor` had
been fixed the same morning for exactly this reason and the other three callers were missed —
`remember`, the retirement scan, and what a new thread is told already exists. All four now go
through `cardText`, which is the assembly the prompt builder itself uses.

**Then the prompt was rewritten to fix the symptom, and it was measured before being believed.**
Three arms, interleaved, one fixture with four characters — one changed in one room, one in another,
one in two rooms, and one merely present:

| arm | placed in the right room | landed in `facts` | both rooms of the two-room character | proposed someone unchanged |
|---|---|---|---|---|
| the prompt as it stood, no splitting | 38/44 (86%) | 3/44 (7%) | 7/10 | 1/10 |
| **splitting only** | **36/38 (95%)** | **1/38 (3%)** | 6/10 | 2/10 |
| splitting + reworded prompt | 37/54 (69%) | 9/54 (17%) | 9/10 | 0/10 |

The rewording — "one entry per room", a narrowed `facts`, a sharper merely-present clause — **made
the thing it was written to fix worse**: `facts` dumping went from 3% to 17%. It produced more
proposals (54 against 38) and the extra ones were the bad ones. It bought both-rooms (6→9) and
intruders (2→0), but those counts are 10-run integers and the difference between 1 and 2 intruders
is not a result. The clause was deleted, on the precedent of the register clause in SYSTEM that
measured 98.0 against 98.0.

What shipped is the code half: `roomPieces` splits an answer the model has already labelled into one
proposal per room. Splitting labelled text is a transform, not a judgement — Rule 5 — so the model is
not asked twice.

**The denominator is proposals about a character the chapter changed, never runs.** A pass that
proposes nothing gets no room wrong and would score perfectly. The counts are printed beside every
percentage so a small denominator cannot hide in one, which is F10's rule.

**n=10 on one fixture.** 95% placement is not a claim about every chapter; it is what one four-person
fixture measured against one alternative. `bench/rooms.ts check` validates both graders in both
directions before any of it is believed, and asserts that a run naming every room of every character
is scored as intruding rather than as recall.

## F47 — a room edit was carrying the whole card about one time in six, and neither the fixture nor the writer's own sample said so (2026-08-29)

With F46's fix in, the second live chapter end routed correctly — Halloran to `interiority`, Wrenn to
`appearance`, nothing into `facts`, the merely-present character left alone. Both bodies were the
character's ENTIRE card restated with the change folded in. Accepted with Replace, that writes a
whole description into one room.

**Two samples, both wrong, in opposite directions.** The writer saw 2 of 2 and reported it as always.
`bench/rooms.ts` saw 1 of 25 and would have reported it as absent — and after the fixture's cards
were rewritten to match the shape of real ones (dense bracketed records rather than one-line
descriptions) it saw 0 of 25, which is worse. Measured against the writer's own chapter and cards
over eight runs: **3 of 19 proposals, about one in six.**

The fixture could not reproduce it and the fix could not have been measured on it. What worked was
running the shipped pass against the real story, which is available here in a way it is not for most
projects and should be reached for sooner.

**`withoutEcho` drops any sentence the card already contains, normalised, with a 25-character floor.**
It needs no threshold and no judgement about which kind of answer this is: a sentence already on the
card adds nothing to a room edit whether the answer is a rewrite or not. What remains is what the
chapter added; if nothing remains, the answer said nothing new and is dropped.

**It is NOT applied on the `none` path**, and `test/memory.ts` caught that on the first attempt. A
state IS the whole description rewritten with the change folded in — what it repeats from the card
is the part that is still true — and a state REPLACES the body from that chapter on. Stripping it
there would have left a state holding one sentence and silently dropped everything else about the
character, which is precisely the overwrite this whole phase exists to stop.

| | rewrites, live chapter, 8 runs |
|---|---|
| before | 3/19 (16%) |
| after | **0/21** |

**0 of 21 bounds the rate under roughly 14%. It does not mean never** — F12 declared a defect gone on
zero-in-sixty when the true rate was 4%.

Unresolved and recorded rather than fixed: on that chapter, 6 of 21 proposals still choose `facts`.
Whether those are wrong is not established — this run has no per-proposal ground truth — and the
number is here so the next attempt starts from it rather than from an impression.

---

## F48 — the COUNCIL-06 base rate: three of the four counters are dead on arrival, and the only one with room is the one the council already refused to ban (2026-08-30)

COUNCIL-06 §5 item 2, run as commissioned: **n = 60, one arm, no prompt change**, on a fixture with
three characters in the scene, scoring four counters at once. **This measures HEADROOM, NOT EFFECT.**
Nothing was changed and nothing is compared. No claim is made here that any prose reads better.

Harness `bench/council06.ts` (`check` / `falsify` / `setup` / `run` / `report`), fixture story
`C06 base rate` in a throwaway `/tmp/anansi-council06.db` behind a scratch server on **5240**, the
live library untouched.

| | raw | informative denominator | rate | verdict |
|---|---|---|---|---|
| **1 · non-POV interior asserted by the narrator** | 0 named · 6 with pronouns | 60/60 runs name a non-POV character | **0/60 named — under 5%** · 6/60 = 10.0% [4.7–20.1] with pronouns · **5/52 = 9.6% [4.2–20.6] after audit** | **DEAD ON ARRIVAL** |
| **2 · `said`-tagged share at three or more speakers** | 150 said of 274 tags, over 528 lines | **46/60 runs** have three or more attributed speakers | **54.7% [48.8–60.5] of tags** · 28.4% of lines | **HAS HEADROOM** |
| **2b · two consecutive unattributed lines** (the rule the council actually kept) | 24 | 46/60 | **52.2% [38–66]** | **HAS HEADROOM** |
| **3 · a scene-closing beat the writer did not ask for** | 0 | 60/60 — every run ends somewhere | **0/60 — under 5%** | **DEAD ON ARRIVAL** |
| **4 · object continuity** | 2 | **34/60 runs** name a tracked object in narration | **5.9% [1.6–19.1]** | **DEAD ON ARRIVAL at any affordable n** |

60 usable of 60, zero errors, median narration 1,294 characters, strictly sequential — one request
in flight, the router's second slot left free.

**What it was measured against, for attribution later.** Commit `064ff14`, model
`Qwen3.6-WNTH-35B-A3B-NN`, `enable_thinking: false`. The assembled DIRECT prompt for this fixture is
4,653 bytes, sha256 `0a47f3b809db06ec98c4fc2cdc4e8da82551c4d8a95cbe9646b9dcae9519eb8b` as rendered
by `bench/prompts.ts <id> --full`. `src/render.ts` moved twice on `serial` after this branch was
cut — the `<mode>` tag and two new SYSTEM bullets — and **none of that is in these numbers.**

**Nothing sets a seed. This is one arm, run once, and it is not reproducible.** Only arms run
*simultaneously* are controlled (`bench/ab.ts`), and there is no second arm here.

### The fixture carries no `persona` and no `lockedCharacter`, and that is the measurement

`src/context.ts:902`, shipped in `3cb65c6` as COUNCIL-06 ship 1, **already puts the interiority
firewall in DIRECTIVE** for any first- or second-person book that names a teller:

> `Never state what anyone but {teller} thinks, feels or intends; where {teller} can only guess,
> write the guess as a guess.`

So a fixture with a persona would have measured arm B, not a base rate. The rendered prompt was
checked for that string before the run and it is absent — DIRECTIVE is `[Writing: second person,
present tense]` and the register line, nothing else.

**This is still not a no-rule baseline, and that matters for reading counter 1.** `DEFAULT_VOICE`
already carries *"Show an interior state through speech, posture or action, never by naming it"* —
a general told-not-shown rule that reaches every character. The 9.6% is headroom **on top of a rule
that is already there and appears to be working.**

**No number here is compared to F21's 82.5%.** F28 forbids it and this fixture makes the reason
plain: different scene, different cast, a different grammatical person, and F21 counted pronouns on
the protagonist. The two numbers are not on the same axis.

### Counter 1 · the interiority firewall is dead on arrival, and the shape of the misses says why

The name anchor scored **0 of 60**. That is not "never" — 0 in 60 bounds it under 5% (F12) — and it
is not the model being clean either. Reading the pronoun hits shows what the model actually does:

> *"It is a question, but he already knows the answer."*
> *"…though he knows the ledger is locked away."*
> *"It is louder than he intends."*
> *"…a nervous tic he thinks you haven't noticed."*

**Every one is a pronoun in a subordinate clause.** The model does not write *"Machek knew"*; it
writes *"though he knows"*, hung off an action. A name-anchored detector cannot see that shape at
all, which is why the honest figure is the pronoun one — and in second person the pronoun figure is
safe, because "you" is the viewpoint and `he|she|they|his|her|their` cannot be it. The POV-drift
guard confirms it: **0 of 60 runs lack "you" in narration.**

Six flagged; **five survive the audit**. The sixth is a detector defect, below. **5 of 52 = 9.6%
[4.2–20.6].** Against COUNCIL-06's ~10-point bar that is dead on arrival: an A/B could only ever
push it toward zero, and F12 is the entire lesson about what a zero buys you. **The burden §1 placed
on the firewall is not discharged.**

### Counter 2 · the only counter with room, and it is the one the council refused to ban

`said` is **54.7% of tags [48.8–60.5]**, so roughly 124 of 274 tags are something else — *murmurs*,
*answers*, *begins*, *hisses*, *laughs*. There is a 45-point gap in either direction, which is real
headroom, and both writer seats predicted the failure mode a ban would cause. The interval is
narrower than it should be: 274 tags cluster inside 46 runs and no cluster correction was applied,
so read it as indicative, not exact.

**The rule the council actually kept has more room than the one it refused.** *Never two consecutive
unattributed lines when three or more are speaking* is broken in **24 of 46 runs — 52.2% [38–66]**.
That is the counter to pre-register if anything here earns an A/B.

**The denominator is 46, not 60**, and it is a floor: a speaker is counted only where a speech verb
sits in the same gap, so a crowd whose third voice is never tagged is excluded. **The tag list was
widened deliberately in the direction that hurts the answer** — every utterance verb missing from it
inflates the said-share, and `said` is on the list by construction.

### Counter 3 · dead on arrival, and this counter is the one the audit rescued

**0 of 60 — under 5%.** It first read 3 of 60, and **all three were false**: an unanchored
`\bthe end\b` matched *"to bite the end off"* and *"the end of her sentence"*, and a bare
`\bis gone\b` matched *"the matchbox is gone"*. Both are fixed and both directions are now asserted.
Nothing in the run resolved a scene it was told to carry one beat of. COUNCIL-06 §2 kept *"Never
resolve a scene"* and asked for it to be sharpened from a category to named forms; **there is no
measurable defect here to sharpen it against.**

### Counter 4 · not decidable at any affordable n

**2 of 34 = 5.9% [1.6–19.1]**, and the interval is the finding. Split by object it is worse:

| object | the right answer in canon or on the page | seen in narration | failed |
|---|---|---|---|
| the ledger | locked in the harbourmaster's safe; nobody in the room has a key | 18/60 | **0/18 — under 16.7%** |
| Machek's coat | on the hook by the door, in the writer's own last passage | 9/60 | **2/9 = 22.2% [6.3–54.7]** |
| his lighter | through the grating on the quay; he borrows matches | 15/60 | **0/15 — under 20%** |

The coat is the only sub-counter with a signal and 2 of 9 decides nothing. Both failures are the
same sentence — *"He reaches into his coat…"* while the coat hangs by the door. The fixture would
have to be rebuilt around objects the prose is forced to touch every run before this counter could
carry an A/B, and that is a different piece of work from a wording change.

### The detector, validated before any result was believed (F17)

**52 synthetic cases, both directions**, in `bench/council06.ts check` — 35 must flag, 17 must not.
`bench/council06.ts falsify` then blanks each of the ten detector tables in turn and requires the
cases to go red; **every table is load-bearing**, none is decorative.

COUNCIL-06 §6 named six traps. **Four were guarded and held. Two were hit for real:**

- **Guarded, held.** `narrationOnly`'s single-quote hole — the fixture is scoped to double quotes
  and the guard reports **0 of 60** runs in a grammar the strip cannot see. `DEFAULT_VOICE` being
  second person — anchored on names, and every rate here is stated as a floor. Auxiliaries — cases
  assert that *"Machek had decided hours ago"* and *"Solveig has known since Tuesday"* flag. Crowd
  attribution scored raw — counter 2 never touches the strip.
- **HIT: the guess frame flagged.** Excluding `seems`, `looks` and `appears` from the verb lists was
  not enough. Run #17 came back with *"as if she is reading a line from a script she hates"* and
  `she hates` fired inside the guess — the rule's own permission set, scored as a violation. Any
  `as if` / `as though` / `like a` clause is now cut before the told tests, to the sentence end so an
  assertion beside a guess still counts.
- **HIT, and §6 does not name this one: `narrationOnly` goes out of phase on a truncated passage.**
  A generation that hits the token ceiling stops mid-line, leaving an opening quote with no partner;
  the strip pairs greedily from the left, so **from that quote to the end of the passage every word
  of dialogue is returned as narration**. **8 of 60 runs — 13.3% — end that way.** Run #2 scored a
  non-POV interiority hit on `"He knows we haven't signed the last three entries` — one character
  talking to another. This is a hole in *every* narration-only check in this project, not just this
  harness; here it is counted per run and counter 1 is reported with those runs and without them.

**Every live flag was read, not just counted**, and that is where four of the five detector defects
above came from — three false closings, one false ledger teleport, one false lighter. The synthetic
cases could not have found them; only the prose could. **A detector that passes its own cases is not
yet a detector that is right about the run.**

### What this settles for COUNCIL-06's order

**§5.3's "only survivors earn an A/B" leaves one survivor: crowd attribution.** The pre-registered
counter should be *two consecutive unattributed lines at three or more speakers* (52.2% today), not
the `said` share, and not a ban — which both writer seats refused and which this run gives no reason
to revisit. Counters 1, 3 and 4 do not have ten points of room between them at this n, and spending
100 generations per arm on any of them buys an interval that contains today's number.

**What nobody is entitled to claim from this**: that anything was fixed, that the prose reads better,
or that any of these three counters is *zero*. They are under 5%, under 5% and under 19%.

---

## F49 — MTP self-speculation is 20% SLOWER on this model, and the cold/warm prefill split from F24 reproduces exactly a week later (2026-08-31)

`bench/decode.ts`, 6 trials per arm plus a discarded warmup, one fixture of 25 KB of real prose
from the library (~5,867 prompt tokens), `max_tokens: 400`, temperature 0.85, thinking off, router
otherwise idle. The metric is llama.cpp's own `timings.predicted_per_second`.

**Why this was tried.** The GGUF is `...Native-MTP-Preserved-...` and two other presets in the same
file — `[Qwen3.8-ATH-27B]` and `[Huihui-ThinkingCap-ATH-27B]` — already run `spec-type = draft-mtp`
with `spec-draft-n-max = 5`. The writing model never had those lines, and nothing in docs/, bench/
or src/ had ever mentioned speculation. Decode is where a warm generation's time goes, so it looked
like the one untried knob on the part that costs.

| arm | median decode | range | prefill, warm |
|---|---|---|---|
| `spec-type` absent | **58.2 tok/s** | 57.7–58.5 | 320–332 ms |
| `spec-type = draft-mtp`, `spec-draft-n-max = 5` | **46.5 tok/s** | 42.9–47.8 | 385–397 ms |

**The ranges do not overlap.** Decode is 20% slower and prefill is about 20% slower too.

**The spread is the tell.** Arm A varies by 0.8 tok/s across six trials; arm B by 4.9. That is a
draft accepted on some passages and rejected on others, with the rejected work costing more than
the accepted work saves. The model is a 35B **A3B** mixture-of-experts — roughly 3B active
parameters per token — so a token is already cheap to produce and the speculation overhead has
nothing to hide behind. Speculative decoding pays when decode is memory-bound and expensive per
token; this decode is neither.

**Reverted the same day.** The two lines are out of `[Qwen3.6-WNTH-35B-A3B-NN]`.

**What this does NOT say.** One fixture, one temperature, one `spec-draft-n-max`. It does not show
that MTP is useless on the ATH presets, which are dense 27B models where the arithmetic is
different, and it does not rule out a smaller draft-n helping. It bounds THIS configuration and no
other. It also says nothing about prose quality: speculative decoding is supposed to be
output-identical in distribution, and no output was compared.

**F24 reproduces, a week on, on the nose.** The same run measured cold prefill at 5,867 tokens in
**7,320 ms** and every warm call after it at 4 tokens in **320–332 ms**. F24's 7,771 ms / 349 ms is
still the live picture, so the cold-start cost is current and is the one latency number left worth
attacking. Nothing here touches it — speculation changes decode, and the cold wait is prefill.

---

## F50 — `--cache-reuse` measures exactly zero on the case it exists for, and the flag really was on the command line (2026-08-31)

> **F56 measured the app-side lever this finding names below and it loses.** Moving canon behind
> the prose does make an accept cheap and makes every ordinary append expensive, at +221% over 31
> real transitions. "Noted, not proposed" was the right call. `DIRECTIVE` ahead of `PROSE` was the
> reordering that paid, and shipped.

`bench/reuse.ts`, three calls per arm, `max_tokens: 1`, the same 25 KB of real prose F49 used.
The metric is `timings.prompt_n` on call 2: tokens the server actually had to process.

**The case.** F16 proved appending to a prompt is nearly free. The case it did NOT test is Anansi's
real bad one: accepting a canon proposal INSERTS an entry into a block near the front, so every
block after it — EARLIER, PROSE, TAIL, which is most of the prompt — is reprocessed. The probe
sends a prompt, then the same prompt with one paragraph inserted after the first 1,200 characters.

| call | no flag | `cache-reuse = 256` |
|---|---|---|
| 1 · original prompt, cold | 5,856 tok / 7,405 ms | 5,856 tok / 7,405 ms |
| 2 · **one paragraph inserted mid-prompt** | **5,885 tok / 7,432 ms** | **5,885 tok / 7,381 ms** |
| 3 · the same prompt again | 4 tok / 327 ms | 4 tok / 327 ms |

**Identical.** Not smaller, not larger.

**Call 2 is the finding whether or not the flag works.** A one-paragraph insertion near the front of
the prompt costs a FULL COLD PREFILL — 5,885 tokens, 7.4 seconds — with the first 1,200 characters
byte-identical and roughly 30 tokens changed. Accepting a proposal throws the whole cache away.
Call 3 is the control on the instrument: the same prompt a second time is 4 tokens, so the cache is
working exactly as F16 described, and it is prefix reuse only.

**The detector was validated before the result was believed.** A preset key the router silently
dropped would produce this same table. It did not drop it — `/v1/models` reports the live argv as
`/usr/bin/llama-server --cache-reuse 256 --host ... --flash-attn on --kv-unified ...`. The flag
reached llama-server and llama-server did nothing with it.

**What this does NOT say.** It does not explain why. Reuse-by-shifting has to move KV entries to new
positions, and this server runs `--flash-attn on` with `--kv-unified`; whether either disables it
was not tested, and one chunk size (256) was tried. It bounds THIS configuration.

**Reverted the same day.**

**What is left of the mid-prompt cost.** Nothing at the router level, on this evidence. The lever
that remains is in the app: an insertion into a block near the FRONT invalidates everything behind
it, and `src/blocks.ts` decides that order. CANON-ALWAYS sits fourth of eleven. Moving accepted
canon behind the prose it does not need to precede would make an accept cheap — but block order is
a prompt-quality decision that F15/F20 already measured once, and it must not be re-cut for a cache.
Noted, not proposed.

---

## F51 — writing as your own character doubles the rate the model acts for him IN THE PASSAGES THAT MENTION HIM, and changes nothing over all passages, because it also makes him get mentioned far less (2026-08-31)

`bench/lockout.ts`, arms C and D, 65 generations each, run **simultaneously** against the one
router — the only controlled comparison this project has. Both arms have the lockout ON. They differ
in one thing: arm D's recent prose contains two passages the WRITER wrote in which Aldis Fen speaks
and acts. Arm C's does not.

**Why this was asked.** Seth, 2026-08-31: *"if the user does indeed write as their own character the
ai takes that as a soft permission and begins to start writing actions and speech for that
character."* F28 measured the lockout and could not see this case: its two arms differ by the
lockout itself, and neither carries a line of his in the prose.

Every rate is a FLOOR — the counters are anchored on his name and never on a pronoun, so they
undercount, equally in both arms. Denominator is the informative one (F10): runs that name him in
narration, because a run that never mentions him could not have written him.

| | writer silent (C) | writer speaks as him (D) | two-tailed Fisher |
|---|---|---|---|
| names him in narration at all | **36 / 65 · 55.4%** | **20 / 65 · 30.8%** | **p = 0.008** |
| acted, of those | 8 / 36 · **22.2%** | 10 / 20 · **50.0%** | **p = 0.042** |
| any of told/spoke/acted, of those | 10 / 36 · 27.8% | 12 / 20 · 60.0% | p = 0.024 |
| spoke, of those | 2 / 36 · 5.6% | 2 / 20 · 10.0% | p = 0.611 |
| acted, over ALL 65 | 8 / 65 · 12.3% | 10 / 65 · 15.4% | **p = 0.800** |

**Two effects, pointing opposite ways, and they cancel.** In the passages that mention him, action
for him roughly doubles — 22% to 50%. But he is mentioned in only 31% of arm D's passages against
55% of arm C's, and over the full denominator the rate of the model acting for him does not move at
all: 12.3% against 15.4%, p = 0.80.

**What this does and does not confirm.**

- CONFIRMED, conditionally: with the writer's own lines for him in the window, the model acts for
  him in **half** the passages that mention him. Fifty per cent is a bad number whatever is causing
  it, and it is the number a writer actually meets when he is in the scene.
- NOT CONFIRMED: that writing as him makes the model write him MORE overall. It does not, on 65
  runs an arm. The absolute rate is flat.
- NOT CONFIRMED AT ALL: the speech half of the report. 5.6% against 10.0%, p = 0.61, on two events
  against two. The lockout holds dialogue near zero in both arms; what leaks is action.

**The confound, stated rather than resolved.** Because arm D names him so much less, the runs that
DO name him are a different subset — plausibly the ones where he is central, which would carry more
action for any character. This measurement cannot separate "writing as him licenses acting for him"
from "the passages where he still appears are the ones he was always going to act in". Separating
them needs a fixture where the naming rate is held fixed, which this one does not do.

### The obvious explanation was tested on the stored prose and is wrong

The first thing to suspect was the instrument. Every counter here is anchored on his NAME, and in
arm D the writer has just written him twice by name — so the model has a fresh referent and could
simply be reaching for "he" instead. That would make the naming gap an artifact, the conditional
50% the true number, and the flat over-all rate the illusion. It is the opposite framing of the
table above and it needed no new generations to check: the 130 runs were already on disk.

| per 1,000 words of output | writer silent (C) | writer speaks as him (D) |
|---|---|---|
| his name | 10.5 | **6.3** |
| he / him / his | 52.0 | **28.2** |
| pronoun : name ratio | 4.96 | **4.50** |

**Refuted.** Arm D is not pronoun-heavy, it is him-light: name density and pronoun density BOTH fall
by about half, and the ratio between them barely moves. The model is not referring to him
differently, it is writing about him less. The name-anchored detector is not biased between the
arms, and the denominator difference in the table above is real behaviour.

Which makes the shape of the result coherent rather than merely confusing: with the writer visibly
handling him, the model writes AROUND him — and on the occasions it does bring him in, the lockout
has less grip on it.

**No prompt change on this evidence.** F10, F15, F20, F43 and F44 are all prompt fixes that measured
zero and three were reverted. The conditional 50% is worth attacking. But note what the follow-up
now has to be: "hold the naming rate fixed" would mean forcing him into every passage with the
directive, which measures a different thing from what a writer meets. The better next measurement is
over ALL runs with a continuous metric — how much of the passage is his action, by density — rather
than a binary over a denominator that the treatment itself moves.

---

## F52 — the clause aimed at F51's mechanism moves both numbers a third of the way and neither is distinguishable from noise (2026-08-31)

`bench/lockout.ts D`, 65 generations an arm, two servers against one router, **the same story on
both** — arm D's, the one where the writer has already written the locked character speaking and
acting. The arms differ by one sentence in the lockout line and nothing else, which makes this a
tighter comparison than F51's (that one needed two stories).

**The mechanism F51 named.** `src/context.ts`'s `Passage` interface carries no author. The database
has `passages.author` — `'human'` or `'model'` — and it never reaches `buildContext`. So the
recent-prose block is a flat run of text with no marking of who wrote what: the lockout forbids
writing the locked character, and the prose two hundred tokens later shows recent examples of
exactly that, with no way for the model to know they are the writer's.

**The clause**, added to the existing lockout line and gated on `Input.lockoutClause`:

> Where ${locked} speaks or acts in the passages above, the writer wrote it — that is not permission
> and not a pattern to continue.

Verified through `POST /api/manifest` on both servers before a single generation: absent on one,
present on the other.

| per 1,000 words of narration | no clause | with clause | events | two-tailed |
|---|---|---|---|---|
| his action | **2.54** | **1.69** | 12 vs 9 | **p = 0.388** |
| his name | **6.57** | **3.95** | 31 vs 21 | **p = 0.072** |
| binary, acted, of runs naming him | 52.2% (12/23) | 50.0% (9/18) | | — |

**Nothing here resolves.** Both densities fall by about a third, which is the direction the clause
was aimed at, and neither is distinguishable from noise at 21 and 52 total events. The conditional
binary rate — the number F51 made the case for attacking — does not move at all: 52% against 50%.

**An error worth recording.** The first pass computed the name-mention p from the ROUNDED densities
printed by the report and got 0.047, which reads as significant. Recounted exactly, it is **0.072**.
A number derived from a rounded number is not a measurement, and this one crossed the line that
decides what gets shipped.

**Not shipped.** `ANANSI_LOCKOUT_CLAUSE` defaults off, so the live prompt is unchanged. The arm
stays in the tree because this finding cites it and because the next run needs it.

**What it would take.** Resolving a one-third change in a Poisson rate sitting at ~10 events an arm
needs roughly ten times the events: about 650 generations an arm, an hour or two of router time.
That is the open decision — spend it, or accept that a clause is not obviously the answer and go
after the mechanism itself by putting authorship into the prompt (the F51 option B, which risks F35:
give this model new vocabulary and it turns it into section headers).

## F53 — marking the writer's own passages HALVES the model's action for the locked character, and the mechanism is the subject slot: he stops doing things and stays just as present as something done to (2026-09-01)

`bench/lockout.ts f53`, **650 generations an arm**, two servers against the one router,
**simultaneously**, the **same story on both** — arm D, where the writer has already written the
locked character speaking and acting. 0 errored generations. The arms differ by one server flag,
`ANANSI_PROSE_AUTHOR=1`, and nothing else.

This is F51's **option B** and F52's open decision: F52 attacked the mechanism with a *sentence*
and moved both numbers a third with nothing resolving; this attacks it by marking authorship in the
prose itself. It resolves.

**The treatment.** `src/context.ts` prefixes each of the writer's own passages in the recent-prose
block with `[the writer's own, not yours]`, gated on a lockout being in force. Verified through
`POST /api/manifest` on both servers **before** the run and again **after** it — 4 markers on the
treatment, 0 on the control, both times, so the arms did not drift.

| per 1,000 words of narration | no marker | marked | events | two-tailed |
|---|---|---|---|---|
| **his action, either anchor** | **2.47** | **1.16** | 108 vs 48 | **p = 0.00001** |
| his action, name-anchored | 1.83 | 0.85 | 80 vs 35 | **p = 0.0001** |
| his action, pronoun-anchored | 0.64 | 0.31 | 28 vs 13 | **p = 0.041** |
| **his name** | **4.90** | **2.32** | 214 vs 96 | **p < 0.00001** |
| subject `he` | 2.10 | 1.04 | 92 vs 43 | **p = 0.0001** |
| **SUBJECT SLOT (name + `he`)** | **7.00** | **3.37** | 306 vs 139 | **p < 0.00001** |
| object `him` | 11.00 | 11.48 | 481 vs 474 | p = 0.52 |
| possessive `his` | 20.77 | 20.46 | 908 vs 845 | p = 0.76 |
| he/him/his together | 33.88 | 32.98 | 1481 vs 1362 | p = 0.48 |
| **action per subject-slot mention** | **35.3%** | **34.5%** | 108/306 vs 48/139 | **p = 0.93** |

**THE MECHANISM, AND IT IS NOT WHAT A SINGLE NUMBER WOULD HAVE SAID.** His action halves. But the
rate at which he acts *given that he is the grammatical subject at all* does not move — 35.3%
against 34.5%, p = 0.93. What halves is how often he occupies the subject slot, which is the only
slot an action can live in. Meanwhile he is **just as present**: object `him` and possessive `his`
are both flat, and so is the three-pronoun total.

So the marker does not teach the model different verbs. It moves him out of the agent position and
leaves him in the scene as the thing being looked at, walked toward, rained on. That is what the
lockout line asks for in words — *"It writes the world's answer and stops where they would act"* —
and F53 is the first measurement in this chain showing it actually happening.

**Robust to the anchor, which matters here more than usual.** Naming halves under the treatment, and
every counter in this harness is name-anchored, so a falling action count could have been purely
mechanical — the detector with fewer places to fire. It is not: the **pronoun-anchored** counter
shares no token with his name and still halves (0.64 → 0.31, p = 0.041). The aggregate is reported
as "either anchor" for power and both halves are given so neither has to be taken on trust.

**Speech still does not resolve, and that is now three findings running.** 4/191 → 5/93 of the runs
that name him, p = 0.16. Over all runs it is 4/650 against 5/650. The honest statement is a bound,
not a rate: **under about 6% of the passages that name him, in either arm.** F51 could not resolve
speech, F52 could not, and 650 an arm cannot either, because the events are single digits at any
sample this fixture will produce.

**An instrument fault found and fixed mid-analysis, which changed the one alarming number.** On the
first pass speech read 0/98 → 4/59, p = 0.019 — a defect appearing where the control had none. Before
reporting it, `SPOKE` was checked against the shape that could fake it and **it fired on another
character speaking**:

> `"Eleven crowns," she said to Aldis Fen, who said nothing.` → counted as him speaking

The first pattern allowed 30 free characters between the closing quote and his name, so another
speaker's attribution fitted inside the window. Tightening that gap to punctuation and whitespace
also exposed a **blind spot in the same counter**: inverted attribution, `"Eleven crowns," said
Aldis Fen.`, matched neither of the two original patterns at all — and adding it found **two hits in
the control arm the old detector had missed**. Both fixes together take speech from p = 0.019 to
p = 0.16. The counter now carries 21 validated cases, six of them for this class, in both directions.

**This has a consequence for F51.** Its published speech figures (2/36 and 2/20) were measured with
the blind instrument and are likely understated. Its conclusion — that speech was *"NOT CONFIRMED AT
ALL"* — is unaffected, but a later run must not compare its own speech numbers against F51's without
re-scoring F51's stored prose, because they came from different detectors.

**No leak.** F35's warning is that new vocabulary becomes section headers. The marker appears in
**0 of 1,300** generations' output, in either arm.

**What this does NOT establish.**

- **The fixture marks every passage.** All four of arm D's passages were written through
  `/api/write`, so all four are `author='human'` and all four are marked. A real book is mostly
  model-authored, so the marker would sit on a minority of passages and carry a *contrast* this
  fixture has none of. Whether that makes the effect stronger (a contrast is informative) or weaker
  (less of the window is marked) is not measured here, and it is the first thing a follow-up should
  vary.
- **One story, one directive, one model, one scene shape.** The fixture deliberately holds one man
  in the scene so pronouns resolve; prose with two men in it is outside everything above.
- **Every rate is a floor.** The verb list is curated and an action phrased outside it is invisible.
- **Prose quality was not read.** The treatment arm wrote **5.5% fewer words** (41,285 against
  43,705). That is small and it is not nothing: a lockout that works by suppressing agency could be
  making thinner scenes, and no one has read these 1,300 passages for that.

**SHIPPED 2026-09-01.** `ANANSI_PROSE_AUTHOR` now defaults ON (`!== '0'` in `src/story.ts`), at
Seth's word once the prose had been read rather than only measured: a random sample of the marked
arm is coherent and focused on the world answering, median passage 67 -> 61 words, and it does not
read thin. Violations are **halved, not gone** — one of six sampled passages still had him act — so
this is a rate improvement and not a fix. The off switch is kept because the next measurements need
it: F53 and F54 have never been run together, and F28's interiority conclusion is owed a re-score
against a lockout-off arm.

**Statistics.** Every p-value here comes from `bench/stats.ts`, which takes **counts and exposures,
never rates** — exact Fisher for the 2x2s and an exact conditional-binomial (Poisson) test for the
densities. It exists because of F52's recorded error: a p computed from its own rounded printed
densities read 0.047 where the truth was 0.072. Its self-check reproduces F51's published 0.042 and
0.008 from that finding's own counts.

## F54 — saying the NAME where the lockout said "their" cuts his action by a third, and teaches the model one stereotyped sentence lifted straight out of the instruction (2026-09-01)

`bench/lockout.ts f53` with `ARM_A`/`ARM_B`, **650 generations an arm**, two servers against the one
router, **simultaneously**, the **same story on both** — arm D again, so this sits directly beside
F52 and F53. 0 errored generations. F53's marker is **OFF on both arms**, so this measures the
wording and nothing else.

**Seth's question, 2026-09-01:** *"what if instead of their we put the name in instead."* The line
names the locked character three times and then hands the two clauses that carry the actual
prohibition to a pronoun. The first/second-person branch beside it has always named its teller five
times and used no pronoun at all, so this was the third-person branch catching up.

| | `their` | named | events | two-tailed |
|---|---|---|---|---|
| **his action, either anchor** | **2.80** | **1.93** | 120 vs 86 | **p = 0.008** |
| his action, name-anchored | 2.10 | 1.50 | 90 vs 67 | **p = 0.038** |
| his action, pronoun-anchored | 0.70 | 0.43 | 30 vs 19 | p = 0.115 |
| **SUBJECT SLOT (name + `he`)** | **6.60** | **5.38** | 283 vs 240 | **p = 0.020** |
| subject `he` | 1.87 | 1.17 | 80 vs 52 | **p = 0.009** |
| object `him` | 10.31 | 10.49 | 442 vs 468 | p = 0.82 |
| possessive `his` | 19.43 | 19.77 | 833 vs 882 | p = 0.74 |
| his name | 4.74 | 4.21 | 203 vs 188 | p = 0.27 |
| action per subject-slot mention | 42.4% | 35.8% | 120/283 vs 86/240 | p = 0.24 |
| names him at all, of runs | 180/650 | 171/650 | | p = 0.62 |

**It works, by the same mechanism F53 found and about half as hard.** Action falls roughly a third
(p = 0.008 pooled). The subject slot falls with it while object and possessive stay flat, so this is
the same story F53 told: he is moved out of the agent position and left in the scene as something
happening to. Unlike F53, **naming itself barely moves** (p = 0.27) — so this effect is not the
name-anchored-counter artifact that F53 had to rule out, and the pooled action number is not
inflated by a falling denominator.

**AND IT TEACHES THE MODEL ONE SENTENCE, WHICH IS THE COST.** The narrow interiority counter goes
**1/650 runs to 11/650, p = 0.0065**, and every one of the eleven is the same construction:

> Aldis felt the shift in the air.
> Aldis felt the weight of the silence.
> Aldis felt the damp seep through his coat.

Six of the eleven are near-verbatim repeats of *"felt the shift in the air"*. Zero are `knew`,
`decided`, `feared` or `hoped` — the increase is entirely the verb **`felt`**, which is the verb the
new line puts directly beside his name: *"never state what Aldis Fen **feels**, knows or decides."*
**This is F35's warning arriving exactly as F35 describes it** — give this model new vocabulary and it
does something with it — with the twist that the vocabulary here is the prohibition's own wording.

**A CORRECTION TO THE FIRST READING OF THAT, recorded because it changed the verdict.** The narrow
counter's 1 → 11 reads as an elevenfold regression. Counted **three ways** — his name, bare `he`, and
the possessive body forms (`his mind`, `his chest`) that the narrow counter cannot see — it is
**11 → 18, p = 0.27, not distinguishable from noise**. The `their` arm expresses interiority as *"his
chest tightened"* (9 of its 11); the named arm expresses it as *"Aldis felt…"* (11 of its 18). So the
treatment **relabels** interiority into the named form far more than it adds any, and the honest
statement is: the total did not significantly move, and the *form* did.

That is the same blindness F53 recorded against F28, met from the other side. A name-anchored counter
is not a measure of the defect; it is a measure of the defect *in one grammatical dress*.

**Speech unresolved, four findings running.** 6/180 → 4/171, p = 0.75.

**No leak.** The instruction's own text appears in 0 of 1,300 generations' output.

**What this does NOT establish.**

- **One story, one directive, one model, one scene shape**, as with F51-F53. The fixture holds one
  man so pronouns resolve.
- **Every rate is a floor.** The action verb list is curated; the interiority list is 14 verbs.
- **Prose quality unread.** The named arm wrote 4% MORE words (44,603 against 42,869) — the opposite
  sign from F53's 5.5% fewer, and neither has been read for whether the scenes are better.
- **F53 and F54 have not been measured together.** Both move the subject slot and both are off by
  default; whether they stack, or whether the second buys nothing once the first is on, is the open
  question and needs a third arm.

**Not shipped.** `ANANSI_LOCKOUT_NAMED` defaults off, beside `ANANSI_PROSE_AUTHOR` and
`ANANSI_LOCKOUT_CLAUSE`. Three built, measured, dark flags on one instruction is itself a state worth
naming.

**The obvious next move, and it is cheap.** The harm is an adjacency: `Aldis Fen` next to `feels`. Say
it in noun form — *"never state Aldis Fen's thoughts, knowledge or decisions"* — and the priming
target disappears while the naming stays. That is one more arm on a harness that is already warm, and
it would decide whether F54 ships as written, ships reworded, or does not ship.

## F55 — the noun form buys nothing measurable, and the run accidentally proved that this fixture's BASELINE drifts: the same control arm moved by half between two runs, p = 0.004 (2026-09-01)

`bench/lockout.ts f53` with `ARM_A=their ARM_B=noun`, **650 generations an arm**, simultaneous, same
story (arm D), F53's marker off on both, 0 errored generations. Verified through `POST /api/manifest`
before and after: the treatment says *"never state Aldis Fen's thoughts, knowledge or decisions"*, the
control says *"never state what they feel, know or decide"*, and **neither** contains the name-plus-
mental-verb adjacency F54 identified.

**The wording result: nothing moves.**

| per 1,000 words | `their` | noun | events | two-tailed |
|---|---|---|---|---|
| his action | 1.22 | 1.17 | 40 vs 43 | p = 0.91 |
| SUBJECT SLOT | 5.19 | 5.56 | 170 vs 204 | p = 0.53 |
| his name | 3.39 | 3.52 | 111 vs 129 | p = 0.80 |
| object `him` | 13.02 | 12.24 | 427 vs 449 | p = 0.36 |
| possessive `his` | 20.68 | 22.55 | 678 vs 827 | p = 0.10 |
| told (interiority, narrow) | 1.9% | 5.2% | 2/106 vs 6/116 | p = 0.28 |

**AND THIS IS WHY THAT IS NOT A REFUTATION OF F54.** F55's control arm and F54's control arm are the
SAME ARM — same fixture, same directive, same `their` wording, same model, 650 generations each. They
do not agree:

| the identical control arm | F54's run | F55's run | |
|---|---|---|---|
| words of narration | 42,869 | 32,785 | |
| his action per 1,000 words | **2.10** | **1.22** | **p = 0.004** |
| names him at all | 180/650 | 106/650 | |
| action events to test on | 90 | 40 | |

**The baseline moved by nearly half, and the move is significant.** Nothing was changed between the
runs but the clock: no seed is set anywhere in this project, and the router's state — which model is
resident, which is asleep, what the shared cache holds — is not controlled either.

Two consequences, and the second is the useful one:

- **F55 is UNDERPOWERED, not negative.** It has 83 action events against F54's 157. Asked directly:
  if the noun form had produced F54's exact 31% reduction, F55's arms would have read 40 against 31,
  which is **p = 0.15**. So this run could not have detected the effect it was built to check for. The
  honest statement is *no evidence either way*, and it is not evidence of absence.
- **ABSOLUTE DENSITIES IN F51-F55 ARE NOT COMPARABLE ACROSS FINDINGS.** Only the within-run contrast
  is. This is CLAUDE.md's own rule — *"only A/B arms run simultaneously are controlled"* — arriving
  with a number attached for the first time, and it is a stronger warning than the rule reads: the
  drift is not a rounding difference, it is 72% on the metric these findings are built on.

**What still stands.** F53's halving (p = 0.00001, 156 events) and F54's third (p = 0.008, 206 events)
were both measured WITHIN a run against a simultaneous control, so both survive this. What does not
survive is any sentence comparing F53's numbers to F54's, or either to F55's.

**What this says about shipping.** Nothing new about the noun form, which is the question it was run
for. `ANANSI_LOCKOUT_NOUN` joins the other two flags, off. Three measured-and-dark flags on one
instruction — plus a baseline that moves by half between runs — is the state to fix before adding a
fourth wording.

**The next run should be bigger, not different.** The lesson is not "try another phrasing", it is that
this fixture yields ~40-90 action events per 650 generations and that is too few to separate a third
from noise reliably. Either raise n per arm to the point where the drift is small against the effect,
or change the fixture so the counter fires more often — a scene where the locked character is more
likely to be named would do it, at the cost of comparability with everything above.

## F56 — DIRECTIVE ahead of PROSE halves what the cache reprocesses and does not move canon compliance at 510 generations an arm; F50's other proposal, canon behind the prose, is measured here and is 3.2x WORSE (2026-09-02)

Prompted by a writer's report that five chapters in, waiting for prose felt slow. Two causes, and
the larger one was not in this repo: *The Anagram* pinned `Artemis-1.1-RPNTH-31B-NN`, which over 54
prose runs decodes at **5.7 tok/s against Qwen3.6's 57.5** and waits a median **78.2 s a passage
against 10.0 s**. The pin was cleared. Everything below is the second cause.

**The cache half, measured without the model.** `bench/order.ts` replays stored `manifest.blocks`
through `render` under a different `ORDER` and takes the common prefix of consecutive prompts,
which is exactly what llama-server reuses. No generations, no slots, so it runs while somebody is
writing. 31 real transitions on *The Anagram*:

| arm | median chars reprocessed | ~tokens | full resets |
|---|---|---|---|
| shipped order | 2,640 | 593 | 4 |
| **DIRECTIVE ahead of PROSE** | **1,331** | **299** | 4 |
| canon behind the prose | 8,474 | 1,904 | 3 |
| both | 8,250 | 1,854 | 3 |

`DIRECTIVE` sat at index 8, between `PROSE` and `TAIL`, so a landed passage inserted into the
MIDDLE of the prompt and everything behind it was reprocessed for what was only an append.

**F50's proposal is refuted, and its reasoning was right.** F50 said moving accepted canon behind
the prose "would make an accept cheap" and declined to cut it for a cache. It does make an accept
cheap — `bench/order.ts check` case 3 asserts exactly that. It also puts every canon block BEHIND
the prose, so an ordinary append now reprocesses the whole ledger with it. **Appends outnumber
accepts about seven to one here**, so the rare 85% reset is traded for a frequent 25% tax and the
arm loses by 221%. The right call for a reason nobody had stated. Asserted in the check now.

**The quality half: 1,020 generations, two servers, one router, simultaneous, 0 errors.** Control is
the commit before the change; the trees differ by the `ORDER` line and nothing else. 60 then 450 an
arm, same servers throughout.

| | control | DIRECTIVE-first |
|---|---|---|
| mentioned the key (the informative denominator) | 235/510 · 46.1% | 217/510 · 42.5% |
| violations, of those | **19/235 · 8.1%** | **20/217 · 9.2%** |
| | | **p = 0.7384** |
| median seconds | 3.3 | 3.3 |

Failure modes matched: "called the key silver" 16 vs 19, "called the key warm" 1 vs 1, "restated
canon verbatim" 2 vs 0.

**WHAT THIS n COULD HAVE SEEN, stated because a p of 0.74 is not an absence.** Against the control's
8.1%, a rise to **14.7% (1.82x)** or a fall to **3.2%** would have reached p < 0.05. So the claim is
"this does not change canon compliance by as much as 1.8x", not "this changes nothing". The first
pass at 60 an arm could only have seen a **4.1x** change and was discarded as uninformative rather
than reported as agreement.

**THE ONE THING TO WATCH.** The only mechanism by which this change could plausibly hurt is that the
directive is now further from the generation point, and instruction-following decays with distance.
The mention rate is the proxy and it moved the wrong way: **46.1% to 42.5%, p = 0.2839**, where a
fall to 39.8% would have been significant. Not a result. But the point estimate leans against the
change and this n cannot resolve 3.6 points, so it is written down rather than dismissed.

**F55's baseline drift does not undercut this.** F55 found the same control arm moving by half
between two runs on this fixture, p = 0.004 — a fixture whose baseline is not stable across time.
Both arms here ran SIMULTANEOUSLY against one router, which is the design that controls for it and
the only one this project trusts. A sequential version of this run would be worth nothing.
