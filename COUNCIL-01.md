# Council #1 — the Anansi build spec, 2026-07-29

*Convened at Seth's request against SPEC.md revision 2. Five lenses in parallel, one seat
adversarial. Four returned. Lens 5 (prior-art fidelity) died on an API 529 and is unrun.
Mina held the pen. Findings below are the lenses' own; the converged verdict is mine.*

**Coverage note.** Lens 5's verification half is partly covered anyway: lens 1 and lens 2 each
re-checked the prior art independently and both failed to break it (see ABANDONED). Its
missed-mechanism half is unrun and remains an open gap.

---

## THE CONVERGED VERDICT

**The spec is precise about the container and silent about the contents, and every lens found
the same shape of error: a decision written down with confidence, never traced to the thing it
touches.**

Three lenses that never coordinated found the same architectural contradiction. The spec locks
Vercel as the host and puts the Ollama adapter server-side. A Vercel function cannot reach a
machine on Seth's LAN. So section 12 claim 2 ("no prose leaves the machine") is false on the
spec's own architecture, section 1 ("self-hosted") contradicts section 2 ("Host: Vercel"), and
the M0 line item budgeted at "about two days" is a network-topology problem instead.

The same defect type recurs at every altitude:

- `system_block` appears once, inside the equation that governs every allocation, and is
  defined nowhere. No prompt text exists anywhere in 731 lines.
- `reserved_tokens` is clamped per entry and never in sum, so 30 spark-seeded characters at 200
  reserved tokens each can drive `available` negative on a local 8K model.
- `min_activations` and `max_recursion_steps` were imported from SillyTavern, which documents
  them as mutually exclusive. Both run in one pipeline.
- Forks "copy chapter rows by reference", and `selected` is one boolean on the shared row, so
  regenerating a pre-fork passage in a branch rewrites the parent branch.

The adversarial seat's summary stands: *a very careful description of a container that has
never been filled.*

What survived attack: the prior-art research (attacked directly by two lenses, unbroken), the
layer floors (54%, feasible), the 45% cap, Drizzle over Prisma, pgvector on Neon at this scale,
Auth.js over a shared password, and Adventure's two-call design.

---

## LENS 1 — Feasibility and build order

**Verdict:** the milestone order is directionally right but M1 is packaged wrong, and the
budget arithmetic does not close.

1. **Local inference is architecturally impossible on the locked host.** Three options, each
   changing the M0 route contract: tunnel (prose leaves twice, withdraw claim 2), browser-side
   Ollama (works *because* the engine is pure, but it is a second pipeline and the audit row
   must trust client-reported data), or drop Vercel.
2. **The budget arithmetic has four gaps in one paragraph set.** Are the never-trimmed anchors
   inside or outside `available`? Percentages of `available` or of the remainder? Ceilings sum
   to 135% with no resolution rule. Is a reservation counted against its layer floor or on top
   of it? Also: "constant entries" is never defined in this spec.
3. **M1 is correctly ordered and wrongly sized.** Secondary keys, five logic modes, cooldown,
   delay, inclusion groups, min_activations, per-entry overrides and recursion are all built at
   M1 with no user-reachable way to exercise them until M5. Split into M1a (budget spine, what
   M3 needs) and M1b (activation matcher, immediately before M5).
4. **Passage granularity is never defined** and every engine constant is denominated in
   passages. `slot_index` has no ordering strategy; insert-in-the-middle is the most common
   editor action.
5. **Six schema decisions deferred past the migration that must contain them:**
   `canon_entry_state` has no `branch_id`; embedding dimension is an M0 blocker (**pgvector
   cannot index above 2000 dimensions**; `halfvec` to 4000); no extraction-proposal table; no
   Auth.js adapter tables; no provider-credential storage; no revision-history table.
6. **Streaming durability unaddressed, and §10.3 is stale.** Fluid compute is default-on;
   Hobby is 300s, Pro 800s GA. Duration was never the binding constraint. Client disconnect
   cancels generation without `consumeStream()`; no heartbeat; no resume path.
7. **Four milestones ship nothing usable.** The one promise lands at M5 of 8. The manifest
   inspector §11 calls essential is in no milestone. Also omitted: embedding backfill, token
   recount, a cost price table, branch-aware reads, export, write concurrency on `slot_index`.
8. **`engine_config`/`model_config` are unschematized jsonb** holding every tunable. And
   nothing records which models refuse which spice level, so §10.2's routing constraint is
   unimplementable as written.
9. **§3.5's depth placement presumes a flat completion buffer** the AI SDK `messages` array does
   not give. Implementable, but the prompt shape is never declared. Also defeats prompt caching.
10. **Library check:** `js-tiktoken` real but models OpenAI encodings only, against a non-OpenAI
    prose model. Drizzle does not create the pgvector extension. Ollama provider is community,
    and the implied package is superseded (`ai-sdk-ollama` / `ollama-ai-provider-v2`). Auth.js
    magic link is the **Nodemailer** provider now, needs adapter tables, breaks on edge runtime.
    `stemr` is the clean Snowball option; avoid native bindings.

**THE ONE THING:** make the first milestone after M0 one end-to-end vertical slice — thin engine,
Full Auto only, one passage persisted, manifest visible in a dev inspector.

---

## LENS 2 — The adversarial seat

**Verdict:** not theatre about its research, which checks out line by line, but theatre about
its subject: twenty-four columns of precision around a prompt that does not exist.

1. **The spec never specifies the prompt.** `system_block` used once and never defined.
   "instruction block" and "post-processing" appear once each, unspecified for all four modes.
   No register wording for any spice level. Prose quality is the product and it is a stub.
2. **No test for coherence.** The word appears four times, never as something measured. ~15
   tuned constants are unfalsifiable and will be defended rather than tested.
3. **"Self-hosted" is false**, and claims 1 and 2 rest on it. Prose is on two third-party
   clouds before inference happens.
4. **§3.1 reports a delivered subsystem the spec does not contain.** "Revision history at
   chapter level" is in no table, no milestone, no schema. The tell: the other two items on that
   line carry section pointers and this one does not. Editing a passage body in place has **no
   history at all**, so Anansi has less version safety than the free competitor tier.
5. **Two imported SillyTavern features that ST documents as mutually exclusive**
   (`min_activations` / `max_recursion_steps`) both run in §7.6. Evidence of transcription
   rather than comprehension.
6. **Six of eight taken ST features are inert here.** Recursion off by default;
   `min_activations` off by default; `match_whole_words` has no reachable use case in an
   English-only whole-word matcher; `delay_until` is redundant with chapter pins; `cooldown_for`
   fights `sticky_for`; no inclusion-group example for novel writing exists anywhere. And the
   refusal list's stated reason is confabulated for at least two items.
7. **The one promise does not govern the feature list.** Verified: the four-modes line IS on
   fictionmaker.com; the PWA line and "built for novels, not just adventures" are NOT, and were
   carried into locked decisions and M7 untested against the promise.
8. **The central price comparison is wrong by 2.6x, in the project's favour.** $4.99 is
   Reader+: 30/day, no export, no uncensored mode, 50-pin ledger cap. Writer is $12.99.
   Partly rescues claim 1 — but the one datum the build/buy decision turns on went unchecked.
9. **§12 omits the only comparison that threatens the build.** SillyTavern is free, open source,
   self-hosted, local-capable, and delivers claims 1, 2 and 4 today. The honest counter exists
   thirty lines up (it is a chat frontend, not a chapter document editor) and §12 does not make it.
10. **§6.2 locks a decision §14.5 reopens**, and "gapless per branch" is incompatible with
    fork-by-reference.
11. **Cost never computed.** (Unproven, not wrong.)

**THE ONE THING:** write the prompts before the schema. Literal `system_block`, the directive at
all five spice levels, instruction blocks per mode. Then hand-assemble chapter 1, 12 and 40 and
read what comes back.

---

## LENS 3 — The operator's cost

**Verdict:** the dollars are cheap and the hours are ruinous — $6 to $47 per writer per month
against 270 to 400 solo evening-hours, of which ~45 go to knobs no novelist will turn.

1. **Time: 270–400h, 8–12 months to M7** at ~34h/month. Add 30% discovered work: 10–15 months.
   First version he can actually write in (M0–M3 + minimum M5): 192–260h, **5.5–7.5 months**.
   M1 is 45–70h of pure functions with nothing on screen, landing at weeks 6–15. That is where
   solo projects die.
2. **Maintenance 6–12h/month forever** — 20–35% of capacity before any new code. ~6 forced model
   migrations/year at 2–6h each; 2–4h/month support; Next.js and Auth.js majors.
3. **The knob set costs 37–55h and delivers nothing against the one promise.** 18 author-facing
   fields. Minimum set that delivers coherence: **6** — title, body, `entry_type`, `activation`,
   `keys`, `priority` — plus `sticky_for = 3` invisible on characters. Cooldown actively
   *opposes* long-form coherence.
4. **THE TRAP: the local adapter.** The seam is two days of TypeScript. The unbudgeted work is
   network topology. Then the arithmetic kills it: at 188K prompt, prefill is **7.8 minutes**,
   which 504s against Hobby's 300s ceiling.
5. **One config field swings the bill 7.4x.** No absolute context cap; everything is a
   percentage of `T`. 32K capped → **$6.30/writer/month**. Native 262K window → **$47.23**.
   Five users: $32 vs $236.
6. **98.6% of spend is prose input.** Summarize + extract + embed together are **1.4%** ($0.086
   against $6.30). Nothing to optimize there.
7. **No prompt caching, and three design decisions defeat the prefix.** ~54% of prose spend on
   the table; realistically 30–40% after TTL losses.
8. **Neon Free does not survive year one** — vectors and audit rows break it, not prose.
   `halfvec` + selected-only embedding + a manifest retention policy keeps a year inside 232 MB.
   CU-hours: 5 active users = exactly 100/month, the free cap.
9. **TCO:** Anansi hosted 5 users ≈ **$50/mo**; local ≈ **$10–28/mo**; FictionMaker Reader+ 5
   users = $24.95, Writer tier = $64.95. Labour at €25/h amortises over 22.5 years. Not built to
   save money, and §12 already declines to claim otherwise.
10. **Two verified factual errors.** §10.3 stale — **Hobby covers 300s, Pro not needed, $240/yr
    saved**. §3.1's $4.99 is the wrong tier; novel-length memory is gated at $24.99.
11. **Claim 4 has no mechanism until export ships.** Markdown + JSON dump ≈ **4 hours**. Highest
    value-per-hour item in the spec and on no milestone.
12. **The 45% cap never says how to distribute the shortfall** when all four layers are under
    ceiling. Four plausible policies, different prose, no right answer.

**THE ONE THING:** ship the 6-field entry, keep the other columns, cut their UI, validation, help
text and M1 test matrix. 37–55h recovered. Cheapest dollar fix in the same edit: add
`max_context_tokens` per story, default 32,000.

---

## LENS 4 — Engine soundness

**Verdict:** the arithmetic is unsound three independent ways, and mutable per-chapter state
makes generation non-idempotent under the action writers perform most.

1. **Reservations bypass the 45% cap, the ladder, and the feasibility check.** Clamped per entry,
   never in sum. Case A: 51.8% reserved against a 45% cap, `overflowed = false`, eviction never
   runs. Case B: 30 characters × 200 reserved on an 8K model leaves `available = 49`; at 40,
   negative. Case C: unused reservation never returns to the pool, so prose starves while the
   meter reads healthy. **Fix:** reservation is a floor inside placement, clamp the sum per layer
   and against the cap, release `max(0, reserved − actual)`, assert feasibility before Phase 2.
2. **Ceilings are hard caps with no overflow path — 25–37% of the window is unusable.** Early
   chapters with a thin ledger waste 35% while prose that would fit sits outside. **Fix:**
   ceilings bind only under contention; let layer 6 absorb unclaimed budget.
3. **The never-trimmed anchors sit outside the percentage base, the ladder, and the meter**, with
   no cached token count and no cap. A 900-token premise plus a 400-token author's note is 59% of
   `available` on a 4K model, and nothing can trim it or tell the writer why the call failed.
4. **Regenerate is non-idempotent.** Cooldown state writes on generation, so regenerating slot 20
   sees distance 0 and **suppresses the entry**. Variant 1 obeys canon; variant 2 contradicts it.
   Sticky ratchets +1 slot per click. **Fix:** read state as of slot N−1; upsert keyed by slot.
5. **`canon_entry_state` keyed by `chapter_id`**, so every sticky and cooldown window resets at
   each chapter boundary — reintroducing flicker at the most conspicuous paragraph in the book.
   No `branch_id`, so forks share activation history.
6. **Fork-by-reference is incoherent.** `chapters.branch_id` is one scalar; `passages` has no
   branch dimension; `selected` is one boolean on a shared row, so **regenerating a pre-fork
   passage in a fork rewrites the parent branch**. **Fix:** copy-on-write on fork.
7. **The six layers are not mutually exclusive** and the assignment function is unspecified.
   Promoting a protagonist from story to universe scope silently drops his ceiling 20%→12% and
   moves him from last-evicted to second-evicted.
8. **Vector recall retrieves deselected variants and cross-branch prose** — it can inject text the
   story does not contain, flagged in the manifest only as `firedBy: ['vector']`.
9. **Multi-word keys with stopwords fire constantly.** "Order of the Silver Key" reduces to
   order AND silver AND key anywhere in ~1,500 words: fires on "ordered a silver locket" plus "the
   key turned". **Fix:** strip stopwords, require a 30-token proximity bound.
10. **Snowball collides on proper nouns.** Winter/wintered, Grace/graceful, Bliss/blissful,
    Darkness/dark/darkly, Aldis/Aldi. And three controls are dead: regex keys break the
    no-substring invariant, `case_sensitive` is unimplementable against a pre-lowercased stem set,
    `match_whole_words` has no effect, `scan_depth_override` is defeated by the token cap.
11. **Timed-effect precedence undefined**, and as ordered sticky overrides cooldown — so
    `cooldown_for` is **dead by default on every character entry**.
12. **The `min_activations` rescan re-admits entries steps 5, 7 and 9 already rejected** —
    including both halves of an inclusion group, and `force_out` pins protecting a reveal.
13. **Recursion runs before group resolution**, orphaning children of evicted parents.
14. **`not_any` has no defined effect on `always_on` entries**, so "always include, except at a
    funeral" silently fails.
15. **Layer 6's head-trim is passage-granular**, breaking both the 30% floor and the depth-3
    anchor. On chapter 1 slot 1 the directive becomes the final block and the model writes *about*
    the POV instead of prose.
16. **Token accounting drifts.** An OpenAI BPE against Anthropic/Llama/Mistral, on
    punctuation-dense bracket bodies, is commonly 10–30% off — and the silent failure truncates
    from the left, removing the spine facts the product promises to preserve.
17. Smaller: the partial unique index cannot be satisfied in the natural write order; renumbering
    `slot_index` corrupts timed-effect state; `chapter_canon_pins` is unconstrained against scope
    and ownership (**cross-user leak**); chapter summaries go stale silently and permanently.

**THE ONE THING:** fix the reservation model before anything else. Cheapest now, most expensive
after M3, and it is the one that silently starves prose.

---

## CHARGES TRIED AND ABANDONED (across all four lenses)

- **The prior-art research is marketing fiction.** Attacked by two lenses independently; both
  failed. FictionMaker's branching, auto-extraction, universe forking, 30-day history and tier
  structure all verified. AI Dungeon's "every 15 actions" and the four always-present components
  verified verbatim. NovelAI's reserve-before-place, the four-rung trim ladder in exactly that
  order, and the three-state viewer verified. Every taken SillyTavern field is real.
- **M1 before M3 is simply wrong.** Failed on dependency: M3 ships generation and the meter, both
  requiring `buildContext`. The defect is packaging, not order.
- **The floors are unsatisfiable.** 54%, feasible. The binding case (45% cap + 8% + 30%) is 83%.
- **The 45% cap is too low.** No evidence against the cited 25–45% range.
- **Drizzle over Prisma is hand-waving.** Verified: real `vector()` and `hnsw()`, first-class raw
  SQL, cold-start argument holds.
- **pgvector on Neon will not scale.** Thousands of vectors, not millions. Performance theatre.
- **Auth.js is overkill.** Per-user separation and invites rule out a shared password.
- **Vercel Pro is a forced $240/yr line item.** Hobby covers it. Refuted in Seth's favour.
- **Summarize/extract/embed inflate the bill.** 1.4%.
- **Recursion can loop infinitely.** Three independent bounds.
- **Stemming breaks an entry's self-match.** Symmetric on both sides; self-match survives.
- **Adventure's two calls waste budget.** Independent contexts, options call is cheap.
- **§12's withdrawal buys unearned credit for all four claims.** Only two of four; claim 3 is
  straightforwardly true and claim 4 survives as worded.

---

## LENS 5 — Prior-art fidelity (missed-mechanism half)

*Rerun narrowed after the first attempt died on an API 529. Verification half skipped: lenses 1
and 2 both attacked section 3 and failed to break it.*

**Verdict:** strong on getting canon *into* the prompt, blind on canon that changes over time, on
summary fact-decay, and on checking the output at all.

1. **Canon has no time axis.** Novelcrafter Progressions anchor an addendum to a scene, send it
   only when writing at or after that point, replace or append. The spec's own example
   (`its loss is chapter-7 canon`) shows the author hitting the gap and papering over it in prose.
   **Lens 5's ONE THING.** → SPEC 7.1, ships at M1.
2. **Post-generation canon checking: nobody ships it.** Verified absent across Novelcrafter,
   Sudowrite, NovelAI, AI Dungeon, Squibler, SillyTavern, Kobold. Buildable now for one cheap call
   per selected passage, because `generations.context_manifest` already holds the fact list.
   Published staged LLM-judge ≈0.88 precision / 0.55 recall, several times the human
   error-discovery rate. → SPEC 8.4. Also: ~1/3 of model-written character facts contradict the
   source, so extraction proposals want the same check.
3. **Summaries are doing two jobs.** AI Dungeon runs a deliberately lossy rolling summary
   *alongside* a separate fact store. Facts should route to the proposal queue, not into the
   summary. Two triggers (passages OR words), derived not hardcoded. → SPEC 8.3.
4. **Summary staleness: hash it.** SillyTavern is the only prior art that auto-invalidates, and it
   hashes only the last message. Anansi has a full passage table. Closes revision 2's open
   question 6: do not gate on review, flag. → already in SPEC 5.
5. **Novelcrafter's Codex detection is dumber than this design** — literal name/alias matching,
   no embeddings. But it has four things the spec lacked: a per-entry **exclusion list**, a
   **relations graph** pulled transitively, a **field-level split** where Notes never reach the
   model, and **POV entry auto-inclusion**. → SPEC 7.1 and 7.4; relations deferred to gap 2.
6. **The cache boundary.** Anything ordered after a variable element does not cache. Freeze layer
   1 per chapter and set the breakpoint at its end. → SPEC 10.4.
7. **Lost in the middle.** "Position equals strength" is not a monotonic gradient; attention is
   highest at both ends. Revision 2 put chapter summaries at position 5 of 6, dead centre. One
   reorder. → SPEC 7.3.
8. **Scan depth should derive from budget**, as AI Dungeon does (available ÷ 100, floor 4). → SPEC 7.4.
9. **Vector recall needs a contextual prefix** — chapter title, summary's first sentence, POV —
   cutting retrieval failure by roughly a third. K=3 confirmed as a well-chosen default. → SPEC 7.6.
10. **Source-code details docs omit.** SillyTavern's overflow drops entries whole with no rollback
    on rejection, so one oversized entry poisons the rest of the loop — the spec's reservation
    model avoids this by construction, and M2 should assert it. Its timed-effect state is keyed by
    a hash of the whole entry, so editing any field orphans the state; keying on `entry_id` is
    deliberately better. A regex key bypasses case and whole-word settings entirely. Both Kobolds
    partial-trim, so the trim ladder is the majority behaviour rather than a NovelAI peculiarity.
11. **AI Dungeon's allocation is asymmetric**: unused prose budget does not flow to canon.
    → SPEC 7.3.

**Confirmed absent industry-wide:** post-generation verification against a story bible;
automatic summary invalidation outside SillyTavern; intra-ledger contradiction detection.

**Not folded in:** RAPTOR-style recursive summary trees (overkill at this scale), a Front Memory
slot after the user input, character-based budgeting.
