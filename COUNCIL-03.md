# Council #3 — PLAN-02, 2026-08-22

*Convened against `PLAN-02.md`. Same eight seats as Council #2, run in parallel, none able to see
another. All eight returned. Each carried three charges: mark its own prior findings FIXED /
COSMETIC / MOVED / IGNORED against the schema and phases rather than the adoption table; attack what
is new; and rule on §1.2's six rejections — three of which were aimed at the seat judging them. I
held the pen. Every claim about PLAN-02's text was re-checked by grep before being recorded.*

---

## THE CONVERGED VERDICT

**PLAN-02 fixed the mechanisms and did not ship the fixes.**

Council #2's verdict was that PLAN-01 fixed the infrastructure and lost the product. This one is
narrower and more uncomfortable: the corrections are real, the reasoning improved, the arithmetic
now survives checking — and the same failure recurs one level down. The column landed and the screen
did not. The rule was written in §6 and `PROMPTS.md` was never touched. The finding was adopted in
§1.1 and §9 says something else.

Five seats found the adoption table contradicting its own body:

| §1.1 claims | §9 or §8 actually says |
|---|---|
| search → P2 | **P4** |
| Adventure → P5 | **P7** in §9, **"unscheduled"** in §8 — three answers, one mode |
| RLS and unique indexes → §8.4 | §8 has **zero subsections** |
| "§6 is now a single per-phase table. There is one list." | Scope is split between §8 and §9 |
| Council #2 findings, cited by content | `grep -ci` on COUNCIL-02.md returns **0** for "diction", "adults clause", "numbering", "system message", "unbound", "0.88" |

That last row is a process defect, not a document defect. PLAN-02 was written from the raw seat
reports; COUNCIL-02.md, the record, was compressed. Reviewers can only check the plan against the
file, so part of the adoption table is unverifiable. **The pen is lossy and the pen is mine.**

And §9 P2 writes "**The four modes**" over a list of three.

---

## THE CONVERGENCES

### K1 — Columns without surfaces *(5 seats: UI, novelist, primary user, second tenant, backend)*

The UI seat's redone inventory: **24 surfaces, 6 in no phase** — chapter properties, story
settings/edit, cancel, canon violation flags, the refusal surface, and a revision viewer for
`canon_entry_revs` and `passage_revisions`.

The last one is structural: **§7.4's entire safety argument is "you can revert," and no phase builds
the thing you revert in.**

Four author-facing columns sit on the P1 schema with no screen in any phase: `authors_note`,
`direction`, `strip_patterns`, `system_block_override`. Two of them carry the plan's headline fixes.
The UI seat's ONE THING is that this is the **third consecutive council** at which `authors_note` is
injected into every prose call from a field nothing renders.

The sharpest form, from the UI seat: **`stories.direction` is the new `priority`** — a P1 column no
screen writes and nothing reads for two phases, which is the exact test §2 used to delete `priority`
from the form, failed one section later.

### K2 — PROMPTS rev 2 is specified and unscheduled *(4 seats)*

§6 describes nine changes to `PROMPTS.md`. `PROMPTS.md` is still rev 1. No phase in §9 writes it. And
**P0 — whose exit criterion is "the prompt design survived contact" — is scheduled to test the
artifact §6.5 has already declared defective**: registers 4/5 still carry their diction clauses, the
adults clause is still only on 5, the arbitration rule is uninverted, there is no NEW SCENE block,
the substitutions are still unbound, and PROMPTS §1 still says "sent as the system message" for a
transport §6.2 says has none.

The chatbot seat's ruling on its own findings: *"Does 'described' count? Not for P0. For P1+ it does;
for the one phase whose deliverable is the prompt, it does not."*

### K3 — The Tailscale identity decision is self-defeating *(3 seats, independently)*

*second tenant, delivery, backend*

§3 locks `tailscale serve`. §4 mandates `whois` on the peer IP **and** a loopback bind. Serve
terminates TLS in tailscaled and opens a new connection to 127.0.0.1, so the peer the app observes is
loopback and `whois` has nothing to resolve.

Worse, the two are alternatives, not a stack. **The loopback bind alone closes the header-forgery
hole** that §4 cites as its reason for rejecting identity headers. So PLAN-02 rejected the mechanism
that works, on a threat its own mitigation deletes, adopted one its transport breaks, and paid three
consequences for it: the app leaves Docker, a second auth path exists, and two deployment topologies
must be maintained.

Resolution costs ninety minutes: a hello-world behind `serve` printing `remoteAddress` and every
header, hit from the second tenant's device. It belongs in P0, beside the benchmark, because it gates
55-85 hours. *(Serve's exact proxy behaviour is unverified against the installed build; the
contradiction holds under either answer.)*

### K4 — §7.1's chapter-thirty claim is correct and rests on numbers not in the document *(3 seats, three independent calculations)*

All three ran the arithmetic and all three reached the same shape of answer.

- **chatbot:** holds at N≤3 chapters of tail and ≤150-word summaries. Neither N nor `max_words`
  appears anywhere in PLAN-02.
- **local AI:** ~17,700 tokens for prose at chapter 30, about 3.3 chapters whole — if summaries stay
  ≤250 tokens, the ledger stays ≤3-4K, and N≈3.
- **backend:** ~19K, about 3.5 chapters, **at 32K per slot.** At 16K per slot — which is what §5.1's
  own `--parallel 2` produces — the same sum leaves **~4.7K, less than one whole chapter.**

So the plan's central claim silently requires `-c 64000`, which is the configuration §5.1 flags as
~10GB of KV, and neither section cites the other. **§11 Q1 is answered: the claim is a function of a
hardware number P0 has not measured.**

### K5 — And the mechanism that carries EARLIER past thirty was deleted in the same plan *(2 seats)*

*local AI, backend*

SPEC §5 and §8.3 carry `parent_summary_id` — an act-level tier above the chapter row, for exactly
this. §8's `chapters` row drops it. Confirmed: two hits in SPEC, zero in PLAN-02.

EARLIER grows linearly forever, and §6.1 places it **outside** the 45% cap — so the one block with
unbounded growth is the one block with no ceiling. At chapter 50, SPEC §1's actual promise, summaries
alone are ~13-15K and prose falls under two chapters.

The local AI seat's framing: *"making summaries load-bearing while deleting the second summary tier
is the ordering error of rejection 1, committed one level up."* The plan's own argument, turned on
it.

### K6 — Rejection 3 is overturned *(7 of 8 seats)*

The seats audited it and it does not survive:

- **The citation does not exist.** §1.2.3 attributes "35-55h" to the delivery seat's re-estimate.
  `grep "35-55" COUNCIL-02.md` returns nothing. The number was real in the raw report and absent from
  the record the rejection cites.
- **"Deleted three" undercounts.** The council deleted `reserved_tokens`, `canon_entry_state`,
  `priority` from the form, `reprompt`, the bell, and the third pane — at least five, which is what
  made it look purely additive.
- **The eleven deletions in §2 are mostly not new.** Two are PLAN-01's verbatim (spice routing; the
  "unscheduled" row), four are unbuilt schema worth zero hours, the rest are UI trims worth perhaps
  5-10h. Net new deletions: about three.
- **The remedy did not happen.** §10 raises the total **165-260h → 205-314h** and P1 **20-35h →
  40-60h**. Three of the six rejections *add* P1 columns.
- **The stated remedy is refuted on its own page.** "P1's scope is set by an exit criterion rather
  than by accumulating everything eight seats wanted" — §9 P1 is a nineteen-item list.

The delivery seat's ruling: *"the diagnosis is the best paragraph in the document and the remedy did
not happen."* The backend seat's is shorter: **convenient.**

The second tenant adds what the rejection never wrote down: **the scope discipline was paid for by
deleting the second user from the first two phases.** §9 P1's criterion says "**One** person"; §9 P2's
says "**Seth**."

### K7 — P1 is too big, and the exit criterion was not used as a filter *(4 seats)*

The delivery seat's bottom-up on §9's own list: **55-85h, not 40-60** — before §5's slot save/restore,
and with **zero hours anywhere in the plan for tests, CI, or error and empty states** (confirmed: both
phrases return zero hits).

Its diagnosis: *"the exit-criterion structure is a heading, not a filter."* P1's criterion genuinely
forces spark, story create, streaming and `pg_dump`. It does not force RLS, the second database, the
allowlist, the status strip, DRY and XTC, or the service worker — ~15h that arrived because eight
seats asked. P7 has no criterion at all; P3 carries the character wizard and P4 carries search,
neither related to its criterion.

Also dropped: **maintenance.** Zero hits in PLAN-02, where PLAN-01 carried it and SPEC §14 books
6-12h/month. The +30% adder covers discovered work inside a phase, not a monthly levy.

### K8 — Restoring `consumeStream()` deleted the only cancel that existed *(3 seats)*

*primary user, second tenant, UI*

`grep -i cancel` returns one hit, describing what a closed tab used to do. Under §4's new rule the
server generates for the full duration regardless of the tab — so a wrong Full Auto now occupies
shared hardware to completion, on a two-tenant machine, with no stop button in any phase. Council
#2's C4 named four things; PLAN-02 books two.

---

## THE SINGLE-SEAT FINDINGS THAT MATTER MOST

### S1 — The arbitration rule inversion breaks the one promise *(chatbot)*

§6.5 inverted `system_block`'s "the canon wins for fact" to "where prose has changed a canon fact, the
prose wins." That fixes the dead-character resurrection and breaks the product: **at chapter 30 a
model hallucination in the prose tail outranks a fact Seth pinned by hand**, and the pinned fact is
proposed for demotion. That is precisely what the-idea.md's *"pin it once and it's still canon at
chapter 50"* exists to prevent, written into the system prompt as policy.

The correct rule is conditional on provenance, using a column §8 added at P1 in the same plan:
**prose wins over model-written canon and proposes a progression; hand-edited canon wins over prose
and the conflict is flagged, never silently resolved.** One clause, one existing column, one
already-specified `check` flag.

### S2 — `UNIQUE (branch_id, ordinal)` breaks regenerate *(backend)*

Verified against SPEC §6.1: regenerate writes a new variant into the same slot; a slot has one
`ordinal`; variants differ by `variant_index`. A **full** unique on `(branch_id, ordinal)` therefore
fails on the second variant — and "regenerate keeping every version" is §9 P2's headline feature.

Correct form: **`UNIQUE (branch_id, ordinal) WHERE selected`.** Later this is a constraint
drop-and-replace against live prose.

And the constraint is inert anyway until `branches` exists: with `branch_id` NULL, Postgres treats
NULLs as distinct, so **both P1 unique indexes silently enforce nothing** and the two-tabs-racing bug
they were added against is live through all of P1. §8's own P2 row argues for P1 — *"spark already
creates a primary branch, so this cannot lag P1's writes"* — and then schedules P2. **`branches` goes
to P1.**

### S3 — RLS as specified is inert *(backend)*

Three defects, all cheap now: **a table owner bypasses RLS unless `FORCE ROW LEVEL SECURITY` is set**,
so with one `DATABASE_URL` every policy is a no-op; `SET LOCAL` is transaction-scoped, so with
Drizzle's pool every read must sit inside `db.transaction()` — per-handler discipline again, which is
the thing §8 claims RLS removes (it fails closed rather than open, which is the real win, but
"impossible to forget" is false); and three tables have no `owner_id`, including **`generations`,
whose `context_manifest` holds the entire assembled prompt — the other tenant's whole book — as the
least-protected row in the database.**

### S4 — Three of the four llama.cpp features are the server's job *(local AI)*

- **`--no-context-shift`** makes llama-server refuse an over-length prompt, turning §6.4's guard from
  an app-side convention into an invariant no code path can bypass.
- **`/completion` accepts `json_schema` directly**, which deletes §3's structured-transport row, all
  of §5.2, and the counting asymmetry it exists to patch. One stream parser instead of two.
- **Token-array prompts** delete the exact-counting question entirely.
- **Slot save/restore** is 6-12h of invisible state management — a slot-to-story map, save-on-idle,
  invalidate-on-ledger-edit, two-user contention — writing 3.75-7.5GB per save, possibly obviated by
  P0's own measurement. **Cut from P1.** These two are the answer to §11 Q3.

Also: **`cache_prompt` is never named**, and §5.1, §5.3 and §7.2's trigger all depend on it. And the
KV figure PLAN-02 quotes is the seat's own Council #2 number, **which it now corrects**: ~15GB for a
GQA-8 34B, **~80GB for an MHA Command-R 35B**. `n_kv_heads` determines KV size, not parameter count,
and §11 Q8 has not chosen a model.

### S5 — The rejection's own argument condemns `premise` *(novelist)*

§1.2 r2 rejects a story-level destination as "a spoiler at chapter 3 and stale at chapter 40." §6.1
puts **`premise`** — a story-level statement about the whole book — at the top of every call, forever,
unversioned. If the rule condemns one, it condemns the other, and premise is not being cut.

Second, and cleaner: SPEC §7.1 forbids *a permanent body carrying a temporal fact* — something
claimed true now that becomes false later. **A destination is not a claim about now.** The plan reused
a valid argument on a category it was not built for.

Third: **steering `summary` and `extract` with a destination the prose never sees is worse than having
none** — the book's memory becomes biased toward an ending the prose is not aiming at. *"Drift with a
flattering mirror."*

And the isolation claim is false anyway: `direction` steers `summary` → summaries are EARLIER →
EARLIER is on every prose call. *(chatbot, independently)*

### S6 — Canon does not reach the prompt until P4 *(primary user)*

Spark writes always-on entries at P1 into a `canon_entries` table that exists at P1, and no phase
renders them until P4. So **P2's exit criterion is satisfied by a tool with no canon engine**, and the
one promise is first observable around month six on §10's own calendar. The fix is a SELECT and a
block §6.1 already defines.

*"I own this hardware to write a novel that stays coherent, not to spend four months confirming that
a local model streams."*

### S7 — "No MODE block when the last line is unfinished" latches *(chatbot)*

Direct's `{{directive}}`, Full Auto's `{{steer}}` and Adventure's options prompt live **only** in
MODE. No MODE also means no length instruction, so generation runs to `n_predict` and truncates
mid-sentence — which is an unfinished last line, so the next call also emits no MODE. Forever. Scope
the rule to Co-Write.

---

## INTERNAL CONTRADICTIONS FOUND IN PLAN-02

Each verified by grep:

| | |
|---|---|
| §5.2: counts are "not additive across joins" | §6.4: "sum block counts" |
| §6.1: DIRECTIVE capped at 250 tokens | §6.5: 300 words (~400 tokens) of prose sample inside it |
| §6.1 fixed DIRECTIVE's unit error (tokens, not paragraphs) | §7.1 measures the tail in **chapters** while the summary trigger is passages-or-words |
| §8: `direction` "never reaches a prose call" | It steers `summary`; summaries are EARLIER; EARLIER is on every call |
| §8: "`owner_id` on **every** row" | `passage_revisions`, `canon_entry_revs`, `generations` have none |
| §1.1: "Global block + per-story override appended (§5)" | §5 contains no such rule; `grep system_block` in §5 returns 0 |
| §9 P1 ships the no-op service worker | §9 P7 ships the manifest — the cheap half that gates install, behind the risky half |
| §1.2 r4: P1 is a real writing surface | §9 P1's criterion is plumbing; §9 P2's is writing |

---

## THE REJECTION SCORECARD

| | Ruling |
|---|---|
| **r1 — summaries to P2** | **Upheld** by every seat that judged it, and credited as a real catch no seat made. Three caveats: it is a reordering sold inside a scope-cutting section; it rests on K4's unmeasured number; and it deleted K5's compaction tier. The local AI seat adds that "no floors, no ceilings" is false as stated — *N chapters kept whole* is a prose floor and *summary max_words* is an EARLIER ceiling. **Two constants instead of an engine** is the defensible claim; say it that way. |
| **r2 — destination at chapter scope** | **Split.** Four seats uphold the placement; the originating seat overturns the reasoning and wins on S5, unanswered. Every seat that upheld it also noted it wins on schema and loses on delivery: `authors_note` becomes the most load-bearing field in the plan with no screen. **Ship both channels.** The backend seat supplies the argument the plan should have used: §6.1's closed block list has no DIRECTION block, so exclusion is enforced *structurally* by §6.3 rather than by discipline. |
| **r3 — nobody costed the total** | **Overturned.** K6. Diagnosis right, citation false, remedy unshipped, cost paid by the second tenant. |
| **r4 — P1 is real** | **Upheld**, including by the seat it was aimed at, which concedes "developer harness" was the wrong word. It holds the substance: P1 is not a writing surface, §9 already agrees, and §1.2 denies it. Correct §1.2, not §9. |
| **r5 — depth is instrumentation** | **Upheld unanimously**, called the best-reasoned rejection in §1.2. Two strengthenings: the competitor for recency in AI Dungeon is a *user turn* and here it is TAIL prose, so the borrowed distance was never commensurable; and depth interacts with total length, so chapter 1 and chapter 40 are separate experiments, not two samples of one. One weakening: P0 as designed cannot resolve 150 from 250 tokens at n=10 — use a per-sample binary (did the beat appear) instead of a violation rate. |
| **r6 — `is_break`, not a `scenes` table** | **Upheld unanimously**, with one overclaim struck: a boolean does not "give revision a unit", it lets you *derive* one by scanning to the neighbouring breaks. One unanswered question decides its UI: **is a break its own row or a flag on the next passage?** Ordinals, the summary trigger, range-delete and NEW SCENE all turn on it. |

---

## WHAT SURVIVED

- **§10's arithmetic, checked cell by cell by the seat that broke it last time.** And §10 raising the
  total rather than lowering it — *"the most honest paragraph in either plan."*
- **§6.1's block order is cache-optimal by construction**, and PLAN-02 does not know it: everything
  volatile sits below DIRECTIVE, so canon stays in the KV prefix and SPEC §10.4's "freeze layer 1" is
  achieved without the rule. *"The strongest thing in §6."* Claim it.
- **Blocks named and never numbered**, with `<canon>` delimiters over Markdown headers — removes the
  three-numbering defect at exactly the manifest/schema boundary where it would have cost most.
- **Deleting `reserved_tokens` and `canon_entry_state`**, both re-derived independently. Note that the
  first quietly retires Council #1 Lens 4's ONE THING, which §7.3 should say aloud, since SPEC §7.5,
  §7.8's `tokensReserved` and §7.9's meter all still reference it.
- **`generations`, `passage_revisions`, per-block counting and render-from-blocks landing together at
  P1** — the combination that makes P6 additive. One sentence still missing: **blocks are per-entry,
  `layer` is an attribute**, or P6's partial-entry states re-granularize the renderer.
- **§7.2's deferral trigger** — the first in this chain with a condition that can actually fire.
  Unmeasurable as scheduled: `generations` stores one scalar `latency_ms` and llama-server returns
  `timings.prompt_ms` separately. One jsonb column fixes it.
- **`UNIQUE (id, story_id)` at P1** — right constraint, right reason, right phase.
- **The ledger-as-queue, adopted whole with `reprompt` cut.** Two gaps its own author now names: it
  needs "N new / N changed" (auto-written new entries are invisible to a count of modifications), and
  the badge needs a home.
- **`writing_style` taking 300 words of the writer's own prose** — *"the best change in the
  document,"* twice, independently. It is the only voice signal that survives summarization, and
  voice is exactly what a 200-word summary destroys at the boundary.
- **§7.4.3 — character bodies never auto-written**, flagged as Seth's to overrule. The primary user
  declines to overrule it.
- **Raw `/completion` as the anti-refusal mechanism; refusals detected and never auto-selected.**
- **Spark at P1, `priority` off the form, pins at P4, drawers over columns, three panes to two, the
  guard naming the block it would drop, `check` flags and never rewrites.**
- **Postgres on RLS and pgvector, with the SQLite partial-index claim withdrawn.**
- **P2's criterion — a week of real writing, all of it still there** — *"the only line in any of these
  five documents that a solo project can actually fail against."*

---

## WHAT PLAN-03 MUST ANSWER

1. Write `PROMPTS.md` rev 2 **before** P0 runs, and give it a line in P0.
2. Fix the arbitration rule to key on `last_editor` (S1). It is the one promise.
3. `branches` to P1; make the ordinal index partial (S2).
4. `FORCE ROW LEVEL SECURITY`, `owner_id` on the three missing tables, and a policy for
   `generations.context_manifest` (S3).
5. Resolve the identity topology by measurement in P0 (K3). Ninety minutes gates 55-85 hours.
6. Delete the transport split; add `--no-context-shift`; name `cache_prompt`; cut slot save/restore
   from P1 (S4).
7. Restore `parent_summary_id`, put a ceiling on EARLIER, and state `max_words` and N (K4, K5).
8. Schedule the chapter properties screen and the story settings screen (K1).
9. Render always-on canon at P1 (S6).
10. Reconcile §1.1 with §9 line by line — and stop citing a record that does not carry the finding.
11. Cut P1 by the ~15h its own exit criterion does not force, or restate the criterion (K7).
12. A cancel button (K8), and maintenance back in §10.

Council #3's standard for Plan 03 is narrower than its predecessors': **for every adopted finding,
name the phase, the screen and the file.** Three councils have now found the same defect in three
different rooms.
