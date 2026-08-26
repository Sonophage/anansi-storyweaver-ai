# What is open — after round five, 2026-08-26

**Round five passed clean.** A to D walked and green, sections 1 to 12 walked and green, `bugs.md`
came back empty. So there is nothing to walk in this file at the moment: the walk items are gone and
what is left is the standing record of what is open.

The next round's sections arrive with the next build. The list that decides what that build is is
**Queued from round four** below, and most of it is waiting on answers rather than on work.

One thing a clean pass did NOT clear, because the walk never asked for it: **the three features
round four reported as missing and which exist end to end.** Nothing in round five sent you looking
for them, so a green pass says nothing about whether they are findable now. That is a walk item for
the next round, not a fix.

```
https://hestia.tempel-discus.ts.net:5174        the only URL that works
systemctl --user status anansi                  it starts itself, and on boot
node --experimental-strip-types test/all.ts     171 checks, nine suites, no model
test/ui/run.sh                                  364 checks, twelve scenarios, no model
```

---

## Still open

**COUNCIL-04 is closed** — all eight findings and all seven of its smaller items. Nothing from the
original review is outstanding. What is left is of three kinds.

### Queued from round four, not built

Everything you wrote in round four's `bugs.md` that is still owed. Do not re-report these.

- **Anansi has a voice but no personality.** I would rather draft two or three distinct ones and
  have you pick than guess at it.
- **Invented content is too thin** — character, wardrobe, thread, story-from-scratch. Your framing
  is the spec: a jumping-off point the model can write from without quoting it.
- **Spark fills premise and voice of the weave too lightly** at story creation.
- **Chapter information should be autofilled by the model and accepted by you**, on every new
  chapter and not only the first.
- **The setup wizard**: setting, point of view, who you are, spice and the model-never-writes
  character all becoming guided steps, with character creation on that same screen instead of three.
  A redesign of the creation flow, so it wants agreeing before it is built.
- **The ⋯ menu should open centred over the content**, and a double tap or double click should
  activate a paragraph. Plus a reading mode that swallows clicks — a toggle or automatic is your call.
- ~~**Threads linked to other threads**~~ — **shelved by Seth, 2026-08-26.** Not deferred: he chose
  the character memory over it. Entries exported to or imported from another story is still owed.
- **Web search through the pi browser tool** rather than another API. I do not know what that tool
  is; if it answers over HTTP with JSON this may be config rather than code, because `ANANSI_SEARCH`
  is already just a URL template with `{q}` in it.
- **"Some touch events do nothing."** Not reproduced. The ⋯ actions are *not* hover-gated — there is
  an explicit fix and a comment about it in `app.html` — so this is something else, and it needs one
  example: which control, which device.

### Built since round five, owed a walk

- **The character memory.** Closing a chapter now proposes, for each character that chapter changed,
  their whole description rewritten as it now stands — in force from the NEXT chapter, so revising
  the closed one still sees them as they were in it. Proposals, not writes: nothing is canon until
  accepted, and the card says which chapter it comes into force in. `POST /api/remember` re-runs it
  on a chapter that closed while the router was down.
- **Reading mode**, as a button: the composer goes, the prose stops taking taps, the draft survives.
- **The on-screen keyboard** shortens the page instead of covering the composer, and the phone's dock
  and bar now pay for the safe-area insets that `viewport-fit=cover` has been spending.
- **F34's drift threshold is measured but NOT fixed** — a tap that moves 24px still does nothing, on
  the shelf and everywhere else. That fix needs agreeing because its guard, done wrong, makes Delete
  run twice.

### Already built, and round four could not find it

Three of round four's asks exist end to end and were reported as missing. That makes discoverability
the finding, not the features — and round five's clean pass does not clear it, because nothing in
that walk sent you looking for them. **Owed a walk next round**, worded as "find X" rather than
"check X works":

- **A card's history, and revert.** `GET /api/history`, `db.entryHistory`, `revertField`, and
  `app.js` already calls it for entries.
- **Two tiers of recovery.** `passage_revisions` and `entry_revisions`, each revertable.
- **Canon over time** — updating a lore card from a chapter onward. `entry_states`, `POST /api/state`,
  and the state in force is resolved at assembly so chapter 3 cannot leak what chapter 7 established.

### Waiting on you, not on me

- **This walk.** Twelve sections and `bugs.md` is empty. Everything below the line has been built
  and measured; none of it has been used by the person it is for.
- **§2, the passage length.** Shorter twice over — `max_tokens` 900 → 450, and F29 took the
  paragraph count out of Continue's prompt, which halved it again on the bench fixture. The samples
  read as complete beats, but whether that is the book you want is a taste question no benchmark
  answers.
- **The four decisions** in `docs/plans/DECISIONS.md`. §1 interiority's shape and §2 the 82.5% —
  F28 now says a standing instruction in the prompt does not touch interiority at all, so if you
  want that number moved it needs a different lever and which one is yours to pick. §3 prompt
  override composition, which is the one thing not built inside a finished item: an override
  replaces rather than merges and nothing validates it beyond refusing a blank. §4
  character-by-prompt and what reroll re-rolls — your answer in round three was a global lore
  reroll, or one entry, or one box, and none of it is built.

### Measured, known, not fixed

- **Anansi still leaks instructions into a reply** sometimes, and an unasked proposal is variable
  rather than gone — two runs of the same probe gave four and then none (F26). Neither is a
  candidate for more prompt; a code-side gate is a product decision.
- **Invented `keys` sometimes repeat the title**, which the prompt tells it not to (F27).
- **The contradiction repair costs 1.5s on every generation** and there is no switch to turn it off
  (F30).
- **Anansi's chapter numbers** are right now that it is told which chapter it is looking at, but
  that is one run against one story (F33).

### Deliberate debt — thirteen `ponytail:` markers

Three are architecture and are not going anywhere soon: SQLite rather than Postgres (pgvector is
unscheduled), no streaming backpressure, and ceilings-with-a-refusal instead of a budget engine.
The other ten each name a ceiling: three stored-and-ignored entry columns, a LIKE scan that goes
linear at chapter 40, rejected takes recorded but not fed back, the repair's length floor,
prompt-override validation, the remaining key logic (secondary keys, exclusion keys, regex), the
checker's blindness to numeric contradictions, the whois cache holding an IP for the life of the
process, two writers on two different models being unmeasured against VRAM, and the big one below.

**Revisit before putting anything in front of Anansi.** `serve.ts`'s loopback-is-the-desk rule is
what a reverse proxy would break, and it would break it OPEN. Caddy on 443 for port-free names
(`anansi.purfleet.dev`) makes every request arrive from `127.0.0.1`, so the second writer resolves to
the desk: her library replaced by yours, `admin` true, `ANANSI_ALLOW` never consulted, and nothing
logged. The Tailscale grant still passes — it is the identity layer that goes blind. Safe today only
because nothing proxies. The marker in `serve.ts` names three upgrades and which one must not be
landed by halves.

`grep -rn "ponytail:" src web bench *.ts *.html` is the ledger. Full COUNCIL-04 write-up with line
numbers: `docs/findings/COUNCIL-04.md`.

## Four decisions, and F28 moved two of them

`docs/plans/DECISIONS.md`.

1. **Interiority's shape** — my recommendation is still option A, build nothing.
2. **The 82.5%** — F28 now says a standing instruction in the prompt does not touch it. If you want
   that number down it needs a different lever, and which one is your call.
3. **Per-account prompt overrides** — where stored, how they compose, what a bad one does.
4. **Character by prompt**, and what "reroll" re-rolls. Your answer in round three was: a global
   lore entry reroll, or one entry, or one input box. Not built yet.

---

## Measured since round three

`docs/findings/P0-FINDINGS.md`.

- **F25** — Anansi's cut-off answers were the grammar, not the token budget. Exactly 1,400
  characters, mid-word, valid JSON. Two adjacent defects fell out of measuring it.
- **F26** — the voice. Two over-corrections caught only by re-probing. Two residuals not fixed.
- **F27** — the invent button took three passes, and pass one reproduced F25 the same day.
- **F28** — the lockout. Dialogue to zero, action cut by two thirds, interiority untouched.
- **F29** — the mode prompts. The checklist was being filled 10/10; taking the paragraph count out
  of Continue halved the passage.
- **F30** — the contradiction repair costs 1.5s on every generation, flat, and fired 0 times in 6.
- **F31** — chapter 120 does not fit, and Acts fix it: 4,083 tokens against 11,440.
- **F32** — the eviction order was alphabetical in one place and creation order in the other.

Read F28's last section if you read nothing else: **the detector was wrong twice**, and the second
time it survived a fixture built to fix the first, because the model re-genders characters against
canon. Every rate in it is a floor.

---

## Running the tests

```bash
node --experimental-strip-types test/all.ts    # 176 checks, ten suites, no model needed
test/ui/run.sh                                 # 375 checks, thirteen scenarios, headless, no model
test/ui/run.sh "model ritual"                  # the two that wait on real generations
node --experimental-strip-types bench/lockout.ts check    # F28 detectors, no model
node --experimental-strip-types bench/modes.ts check      # F29 detector, no model
```

