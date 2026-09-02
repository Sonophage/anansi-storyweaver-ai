# Council 10 — three reviewers on why waiting for prose feels slow, 2026-09-02

Convened at Seth's ask — *"so other than this theres nothing else we can do? can you summon a
council and double check?"* — after a morning spent on latency. Three independent reviewers, none
of whom saw the others' reports:

- **the server seat** — the router, the model, the box; everything outside this repo
- **the request-path seat** — press to prose inside the app, prompt assembly excluded
- **the adversary** — one job, to break the work done that morning

**Two of the three seats were checked against their own evidence before anything here was believed,
and both had a claim that did not survive.** That is recorded in each finding rather than quietly
dropped. Where a number below is marked *verified*, I re-derived it; where it is marked *on report*,
it is the seat's own measurement and I did not.

---

## What was already true and is now closed

Five items came back "nothing left here", and they are worth as much as the open ones because they
stop the next session re-opening them.

**C10-1 · `cache_prompt` is on.** *Verified.* `src/llama.ts` never sets it and `grep` over the tree
finds it only in `bench/` files setting it to `false` on purpose. The router journal shows
`prompt eval time = 337.70 ms / 4 tokens` on an 899-token context for a request the app made — a
prefix hit on a call that never asked for one. Do not add the flag; it could only make things worse.

**C10-2 · No faster model exists on this box.** *On report, consistent with my own query.* Median
decode over `generations`: Qwen3.6 **57.4 tok/s**, Ornith 43.9, GLM-4.7-Flash 39.0, Muse 14.6,
Harbinger 8.2, Gemma-4 5.8, Artemis 5.7. Qwen3.6 is 30% clear of the next thing measured.

**C10-3 · Speculative decoding, any form.** Closed on F49's mechanism rather than a new run: ~3B
active parameters means a token is already cheap, so speculation overhead has nothing to hide
behind. A separate draft model also costs VRAM on a box the presets file records being OOM-killed.

**C10-4 · `--cache-ram` is at its 8192 MiB default and must stay there.** *On report.* It is
evicting — 100 evictions on the Qwen port, mean 273 MiB. But the box has 31 GiB of host RAM against
96 GiB carved to VRAM and **22 GiB already in swap**, with both sleeping model processes paged out.
A bigger host-RAM prompt cache here buys swap-ins from NVMe, not cache hits.

**C10-5 · The `/tokenize` gate before every generation.** *Verified against the new timing marks.*
11.9 ms p50 against a p50 model latency of ~10.7 s — 0.1%. And it is not guarding what its comment
claims: measured over 200 stored manifests the estimator runs **low**, p50 1.039 and p90 1.249
exact/estimate, because `render`'s tag lines and newlines are charged by the tokenizer and not by
`buildContext`. Since oversubscribing the unified cache kills *both* in-flight requests, 12 ms to
make that impossible is the right trade. Keep it.

---

## Open, ranked by what a writer would feel

### C10-6 · The browser threw away every streamed token — CLOSED SAME DAY

*Verified, then fixed in `192213a`.* Both `api.generateLive` call sites passed `() => {}` as
`onDelta`. Every delta was parsed, dispatched and dropped; the NDJSON transport, `serve.ts`'s
backpressure note and `X-Accel-Buffering: no` all fed a no-op, and the veil held for the whole
generation.

**The seat called this a defect and it was not.** `PLAN-07-VEIL.md` decided the full-screen ritual on
2026-08-28 in Seth's own words, and the empty `onDelta` is the *fix* for its bug 1 — an earlier
version held the veil back until the first token and never raised it if the model errored first,
which is the cold-start blank page the veil exists to cover.

What had moved is the wait. The ritual was drawn against COUNCIL-04 #3's p50 of **5.7 s**. Measured
on Qwen3.6 prose, n=144:

| p50 | p75 | p90 | p99 | max |
|---|---|---|---|---|
| 10.7 s | 14.4 s | 18.6 s | 38.3 s | 46.8 s |

123 of 144 runs exceed the 5.7 s the ritual was designed for. Seth's stated reason was *"while it
formulates"*, and formulating stops at the first token. He chose to keep the veil and stream inside
it; that shipped, verified in a browser rather than reasoned.

### C10-7 · Cold start is 28–41 s, not F49's 7.3 s — OPEN

*Verified.* F49 calls cold start "the one latency number left worth attacking" and quotes
7,320 ms / 7,771 ms. **That is prefill on a resident model. It excludes the reload.** The router
journal has four real sleep→wake cycles, and the reload alone is:

```
17:34:26 → 17:35:01   35 s
18:43:11 → 18:43:39   28 s
22:19:44 → 22:20:16   32 s
23:58:48 → 23:59:29   41 s     ← re-derived from journalctl
```

So the true first-passage-after-a-break wait is **28–41 s of reload plus ~4 s of cold prefill**, and
it lands on exactly the press where a writer is least patient. Four wakes in a writing day.

`sleep-idle-seconds = 900` is set in `[*]` at `/data/models/presets.ini:125` and inherited by every
model. It is the right value for a box sharing three models and the wrong one for a person who
writes in bursts.

**Why this is not a one-line fix.** `/data/models/presets.ini:128-142` records the kernel OOM-killing
this unit on 2026-08-27, cause `--models-max 3` with two 42.9 GiB models resident at ctx 131072.
Keeping Qwen awake longer makes that more likely, not less. The same comment names the safe move —
cut `ctx-size` on the two 131072 stanzas first, *"the KV, not the weights, is what kills it"*.
Needs a router restart to test, so it waits for a gap in the writing.

Related, and cheap: `src/llama.ts:72-75` probes `/props` with a 30 s timeout, and with
`--models-autoload` that probe *wakes* a sleeping model and then times out on the reload it caused.
Three of the four reloads above exceed 30 s.

### C10-8 · Chapter close prefills the same narration four times — OPEN

*On report, inputs verified.* `src/routes.ts` runs summary / memory / facts / finished as four
sequential blocking calls, up to seven with `structuredRetry`. Three of them build the
byte-identical narration string, then send it behind three different system prompts — and the chat
template puts system first, so the three prompts diverge at token ~1 and share nothing.

Chapter 3 of *The Anagram* is 43,336 chars ≈ 10,319 tokens. At ~800 tok/s that is ~13 s of prefill
paid four times, of which **~26–39 s is pure duplication**.

**The fix is not concurrency** — F13 says firing four at once oversubscribes the unified cache and
both writers get HTTP 500. It is one shared system prompt with the four instructions as the user-
message tail, so `system + narration` is the common prefix. That is reordering, not widening, which
is what `retire`'s own `ponytail:` marker refuses.

**C10-8b, separately:** all four passes call `chat` with no `model` option, so they run on the
process default and ignore both the story's pin and the writer's `users.default_model`. Every other
model call in the file passes `modelFor(...)`. One word each. And none of the four reaches
`db.logGeneration`, so chapter close is invisible in `generations` and this section had to be
estimated rather than measured.

### C10-9 · The slot LCP lottery, and a regression that is mostly an artefact — OPEN, DOWNGRADED

The seat reported warm prefill regressing **6×** — 322 ms to 1,954 ms median — and blamed the slot
selection heuristic, citing 17.7% of 1,443 slot selections scoring below 0.8 similarity and a
recurring 4,053-token / 5.5 s reprocess.

**I checked it and the headline does not hold.** The fast era is `write-nt-qwen36-h`, and **224 of
its 267 runs are against stories that no longer exist** — bench fixtures, repeated identical prompts,
median `prompt_n` of **4 tokens**. That is a benchmark, not writing. Split by whether the book
survives:

| era | population | n | prompt_ms p50 | prompt_n p50 |
|---|---|---|---|---|
| `write-nt-qwen36-h` | deleted / bench | 224 | **321** | 4 |
| `write-nt-qwen36-h` | surviving book | 43 | **1,531** | 731 |
| `Qwen3.6-...` | deleted / bench | 54 | 2,071 | 985 |
| `Qwen3.6-...` | surviving book | 90 | **2,977** | 1,738 |

Like for like the move is **1,531 → 2,977 ms**, about 2×, and even that is confounded by the book
having grown. The slot-selection evidence stands on its own and the `parallel` 2→4 idea is still
worth testing; the 6× is not the reason to do it.

**The more valuable thing underneath.** F24's 349 ms and F49's 320–332 ms warm-prefill figures come
from that same bench-sweep population. **Real writing has never been better than ~1.5 s of prefill.**
The number this project has quoted for a warm call describes repeated identical prompts, not work.

### C10-10 · `ubatch-size` is at the default and the presets file already measured the win — OPEN

*On report.* Live prefill is 735–793 tok/s against F1's 890–906. No live stanza sets `-ub`, so it is
at 512. `/data/models/presets.ini:327-329` records *"ubatch-size 2048 raises prefill to 146-148
tok/s, about 19%, for 1.5 GiB more VRAM. Kept."* VRAM is 96 GiB with ~26 in use. Measured on a
different architecture, so it needs one `bench/decode.ts` run to confirm the transfer — the cheapest
item on the list.

### C10-11 · Prewarm loses its mutex on exactly the open that needs it — OPEN

*On report.* `warming` is shared by `warmModel` and `prewarm`, and both bail on it. The morning
sequence: open the app → `GET /api/stories` → `warmModel` takes the mutex against a sleeping 26 GiB
model → pick a book → `GET /api/story` → `prewarm` sees `warming` and returns *before* setting
`warmedAt` → nothing retries, because there is no polling anywhere in the client → the first press
pays the full cold cost. The scenario prewarm was written for is the one it sits out.

**And a correction the seat supplied, which retires a worry I had raised myself:** the writer's typed
steer does **not** live in the `DIRECTIVE` block. It renders into `MODE`, the last block —
`src/context.ts:1275` says so in words. So prewarm's `mode:'continue', directive:undefined` shares
every block but MODE (75 tokens) with the real prompt, and moving `DIRECTIVE` ahead of `PROSE`
changed nothing for it. The seat also validated its own detector before believing the zero: of 317
non-trivial trigger keys, 260 matched in the prose window and **0** matched only in the directive,
with 57 unmatched as a named blind spot.

### C10-12 · Uncompressed JSON, and the client discarding its own stream — OPEN, LOW

*On report.* `serve.ts` has one JSON writer and no `Content-Encoding`. Measured: *The Anagram*'s view
is **231,987 bytes**, 68,845 gzipped at level 6, costing 2.48 ms. `web/app.js` is 646,580 bytes
served raw. On loopback this saves nothing; over Tailscale to a phone, at 2–3 `/api/story` fetches
per passage, it is ~700 KB against ~200 KB. Do not compress the NDJSON stream — it needs a
`Z_SYNC_FLUSH` per line or the deltas buffer inside zlib.

`refreshManifest` is confirmed at 41 call sites with no debounce and no in-flight guard, and the fix
is one trailing debounce at the shared function rather than 41 edits. It is **milliseconds** and off
the critical path; the real reason to do it is that a mode switch mid-generation fires a `/tokenize`
at a busy router.

---

## The adversary's seat: what was wrong with the morning's work

All of these are about work committed on 2026-09-02 and all are **confirmed**.

**C10-13 · The check that justified the reorder was red on the tree that shipped it.** *Verified,
fixed in `2c99a97`.* `bench/order.ts` had `now: ORDER`, a live alias. The moment `directive-first`
landed in `src/blocks.ts` the two arms became the same array and the assertion was false by
construction. F56 cites that check as its validation. Nothing caught it because `bench/order.ts
check` was in no suite — and **sixteen files under `bench/` have a `check` mode of which one now
runs anywhere.** Both sides are frozen literals now, and `test/all.ts` takes arguments in a suite
entry.

**C10-14 · The check had no case for the transition the change makes worse.** *Verified, fixed.*
Three cases, none of which changed `DIRECTIVE`, so the file could only ever conclude in favour of
the change. A fourth case now asserts the trade: when `DIRECTIVE` changes and the prose does not,
directive-last reprocesses **342 chars** and directive-first **2,343** — 6.9×. On live data the
adversary found one such transition in *The Transaction of Silence* at **2,158 → 11,996 chars,
+456%**.

**C10-15 · F56's denominator structurally excluded the downside.** *Confirmed.* The finding reports
*The Anagram*, 31 transitions, which has **zero** DIRECTIVE-only transitions — its four DIRECTIVE
changes all coincide with a head reset, so the reorder is free there by accident. *The Transaction of
Silence*, 63 transitions and more than twice the data, is the book that exercises the regression and
is not in the finding. F10's own rule, inverted, inside a file that states it.

**C10-16 · `bench/order.ts` claimed to be read-only and was not.** *Verified, corrected.* It imports
`src/db.ts`, which opens the live file **read-write**, sets WAL and runs `migrate()` at module load.
It was run against the live library while the writer was in it.

**C10-17 · F56 overstates in four places.** All confirmed; corrections applied to the finding:
the detection floor is a 58%-power rejection boundary, so "not by as much as 1.8×" should read
**~2.2× at 80% power**; the finding says the first 60 runs were "discarded" when 60 + 450 = 510 means
they were pooled, across two blocks with no homogeneity check on a fixture F55 has shown drifts;
the conditional rate (8.1% vs 9.2%) is reported as the headline while the unconditional
(**19/510 vs 20/510, p = 1.0000**) is not reported at all; and conditioning on "mentioned the key"
conditions on a post-treatment variable that moved in the direction the finding's own mechanism
predicts.

**C10-18 · The pin was cleared outside the app.** *Confirmed.* Mechanically equivalent to
`updateStory` — no data loss, `model` is read nowhere else. But it bumped `updated_at`, so *The
Anagram* jumped to the top of a shelf ordered by it as though the writer had edited the book; the
old value survives only as prose in a findings file; and the most writer-noticeable change of the day
had no `WHATS-NEW` entry while a 0.3 s change was carefully argued out of one. Entry added in
`192213a`. `.claude/CLAUDE.md` still describes the pin as live and is now stale.

**C10-19 · Latent: a DIRECTIVE clause that names its own position.** *Confirmed, not yet fixed.*
`src/context.ts:1253` reads *"Where {locked} speaks or acts in the passages above…"*. `DIRECTIVE` is
now **above** the prose, so the clause points at nothing. It sits behind `ANANSI_LOCKOUT_CLAUSE`,
off by default — so it is a trap for whoever turns it on for the next arm, and `src/blocks.ts`'s new
comment tells them there is nothing to check.

---

## Doc drift found on the way

- `.claude/CLAUDE.md` says *The Anagram of Ash* pins Artemis. `SELECT id,title,model FROM stories
  WHERE model IS NOT NULL` returns **zero rows**.
- `web/app.js:5998` refers to `frontier()` in `web/model.js`. There is no such function.
- `src/story.ts:250-260` argues the 4.2 chars/token estimate is conservatively high. Measured over
  200 manifests it runs low, p50 1.039 and p90 1.249. The miss is structural — `render`'s tags and
  newlines — so the trigger that comment names for re-choosing the constant can never fire.
- `src/context.ts:143`'s `Input.rejected` is declared and no caller populates it, so the one part of
  `DIRECTIVE` that could vary per call cannot.

## A note on the record

`test/all.ts` reported `scope.ts` failing once during this session. It passed alone at 51 checks and
passed twice immediately after, with every port it binds free. I could not account for it. Written
down because a flake that is not written down is a flake somebody rediscovers.
