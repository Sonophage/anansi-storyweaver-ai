# Council 05 — the code read first, the docs read second, 2026-08-28

Commissioned as: *"scan what we have, learn it, and compare it against the docs — do not trust the
documentation."* So this pass was made in that order. Nothing below was taken from a document and
then confirmed; every claim was read out of the source or measured, and the document was consulted
afterwards to see whether it agreed. Where a doc is cited it is cited as a **subject**, not a source.

**The shape of what exists**, counted rather than remembered:

```
source            12,291 lines   web/app.js 4,630 · db.ts 1,555 · routes.ts 1,472 · app.html 888
                                 context.ts 700 · prompts.ts 689 · llama.ts 422 · import.ts 421
                                 model.js 364 · serve.ts 332 · story.ts 225 · api.js 167
                                 report.ts 149 · help.js 85 · render.ts 85 · blocks.ts 61 · run.ts 46
tests + bench     11,798 lines   244 unit checks in eleven suites, 488 browser checks in twelve
                                 scenarios, plus model (39) and ritual (24) which need a router
docs               7,784 lines
schema                21 tables  routes: 66 · ponytail markers: 24 · dependencies: 0 · build step: none
```

Tests and bench are 96% of the size of the thing they test. That ratio is the finding behind most of
what follows: this project's instruments are as large as its product, and the defects that survive
are the ones sitting in the gaps *between* instruments rather than under any of them.

---

## Seat 1 · The surface — a block the app does not recognise, on every call

`web/model.js` holds two maps that must both cover `src/blocks.ts`'s ten `Kind`s. **`BLOCK_ORIGIN`
covered all ten. `BLOCK_COLOR` covered nine.** `VOICE` was not in it. *(Fixed on the day this was
written — the finding is kept in the tense it was found in, and what fixing it turned up is in the
closing note.)*

`web/app.js:1238` and `:1276` both read it as `BLOCK_COLOR[k] ?? 'var(--ink-ghost)'`. So the VOICE
segment of the context meter, and its dot in the legend beside it, are painted in the colour that
means *this is a kind I have no entry for*.

This is not rare and it is not small. `bench/utilisation.ts`, run today: **VOICE is present in 61 of
61 scored generations at 8.4% of the prompt.** Every call, on every story with a voice sample, draws
an eleventh of its meter in the unknown-kind grey.

**FIXED the same day, and the guard generalised — see the closing note.**

**And the check that would have caught it was two lines from where it belongs.** `test/app.ts:623`
walks `ORDER` and asserts `BLOCK_ORIGIN[kind]` exists, with the reason written beside it — *"the row
would say ${kind}"*. Nothing does the same for `BLOCK_COLOR`. One map is guarded, its neighbour is
not, and they are declared twelve lines apart in the same file.

## Seat 2 · The backend — the schema in the code is not the schema on the disk

`src/db.ts` declares 21 tables. Seth's `anansi.db` has 21 tables. They are not the same 21 columns.

Built a database from the current source and diffed it against the live one:

```
passages : live carries a dead column  token_counts
stories  : live carries a dead column  system_block_override
```

Both were cut from the source by the ponytail audit of 2026-08-23. **SQLite does not drop columns,
and nothing ever migrated them out**, so they are still in the file being written to now — and
`db.exportStory` copies a story into a standalone database, which means every export carries them
forward into a new file that the current schema would never have created.

`BUILD-STATE.md:294` says they *"were removed from the schema"*. That is true of the code and false
of the database in use, which is the most dangerous shape a true sentence can have here.

Nothing else diverged: no table in one and not the other, no column missing from the live file, and
no exported function in `db.ts` without a caller.

## Seat 3 · Security — the gate holds, and this seat has nothing

Reported as a verified negative because a silent seat reads as an unexamined one.

`OPEN_ROUTES` names fourteen routes the ownership gate does not run on. Eight of them touch a story
id somewhere in their handler, which is what an audit should flag and then go and read. Read:

- `GET /api/ledger`, `GET /api/stats`, `GET /api/search` — owner-scoped in SQL, `c.owner` is the
  only key that reaches the query. The story ids in the *output* are the owner's own.
- `POST /api/stories`, `POST /api/spark` — the id they name is the one they just created.
- `GET /api/prompts`, `POST /api/prompts` — account-wide by design, every read and write takes
  `c.owner`.
- `POST /api/look` — the only one that takes somebody else's id and must refuse it. It asks
  `db.ownsStory` itself and throws a **404, not a 403** — *"which books exist is not a question a
  stranger gets an answer to."* Correct, and correct for the right reason.
- `POST /api/bug` — takes a `storyId` and writes it into a report as a label. It reads nothing with
  it. The one place an unvalidated id crosses into an artifact, and it crosses as a string.

**No hole.** The three `serve.ts` markers are still the standing risk and none of them is about this
gate: `:81` (a reverse proxy would break the loopback rule OPEN), `:208` (no backpressure), `:54`
(whois cached for the process life). They are untouched, they are the oldest open items in the
project, and they are the only ones whose failure mode is a door rather than a number.

## Seat 4 · The archivist — SPEC and the code are two different systems now

`docs/SPEC.md` is 771 lines and names its tables. Almost none of them exist:

| SPEC | the code |
|---|---|
| `canon_entries` | `entries` |
| `canon_entry_progressions` | `entry_states` |
| `canon_entry_state` | nothing — the sticky window is stateless, computed in `context.ts` |
| `chapter_canon_pins` | `chapter_pins` |
| `canon_proposals` | `proposals` |
| `canon_violations` | `violations` |
| `passage_options` | nothing — variants live in `passages` on `variant_index` |
| `universes`, `invites`, `model_capabilities`, `user_provider_config` | do not exist |

And the code holds nine tables SPEC has never heard of: `arcs`, `dismissals`, `outfits`,
`prompt_overrides`, `release_notes`, `story_covers`, `strings`, `writer_look`, `entry_revisions`.

The column-level gaps are the honest ones — `secondary_keys`, `exclusion_keys`, `key_logic`,
`reserved_tokens`, `trim_direction`, `embedding` are all absent, and every one of them is
activation depth or the budget engine, both correctly listed as unbuilt everywhere.

So SPEC is not *wrong*; it is a design document being read as a description. **Its naming has been
superseded and nothing says so at the top of it.** A reader who greps for `canon_entries` finds
nothing and cannot tell whether the feature is missing or the name is.

## Seat 5 · Measurement — three numbers in the docs are wrong, and all three drifted downward

| claim | where | measured |
|---|---|---|
| 15 tables | `BUILD-STATE.md` §1 | **21** |
| 34 engine tests | `BUILD-STATE.md` §1 | **44** |
| 240 checks across eleven suites | `.claude/CLAUDE.md` | **244** |

Every one is a count that was true when written. Not one is off by much. That is the point: these
are the numbers a reader takes on trust precisely *because* they look precise, and none of them is
derived at read time. `bench/drift.ts` reads its constant out of `src/story.ts` rather than carrying
a copy, and `test/web.ts` parses `routes.ts` rather than listing routes. **Every count that is
derived has stayed true; every count that is transcribed has drifted.** That is the whole finding.

## Seat 6 · The strategist — what this repo should stop doing

Four of today's defects are the same defect: **two things that must agree, one of them guarded.**

- `BLOCK_ORIGIN` guarded, `BLOCK_COLOR` not — seat 1.
- The api-method→caller direction guarded, the route→method direction not, until 2026-08-27 —
  which is how `POST /api/remember` shipped with no door.
- `import.ts` derived activation from keys, the other five write paths did not — 2e's guard.
- `test/db.ts` asserted the token estimator against its own constant, so the two agreed by
  construction and the check could not fail.

The instrument is not missing in any of these. It exists, it is good, and it covers one side. **The
cheapest work available in this project is not new checks; it is walking the existing ones and
asking what their mirror image would be.**

Second: **the transcribed number should stop existing.** Seat 5's three wrong counts cost more trust
than they ever saved effort. `test/all.ts` prints its own total. `grep -c "ponytail:"` is the ledger.
A doc that wants a number should say the command, not the answer.

---

## What this council would do next, in order

1. ~~**`VOICE` into `BLOCK_COLOR`**~~ — **done**, and the guard is general rather than a second copy
   of the one beside it. See the closing note.
2. **Migrate the two dead columns off the live database**, or write down that they are there and why
   an export carries them. Currently neither.
3. **Put a superseded-naming note at the top of SPEC**, so a reader who greps `canon_entries` learns
   the name changed rather than guessing the feature is gone.
4. **Replace the three transcribed counts with the commands that produce them.**
5. Then `serve.ts:81`, which has now outlived four councils.

## What it would leave alone

The gate. The block order. The purity line in `story.ts`. The ledger, which is 24 markers and was
found accurate the last two times it was audited. And `checklist.md`'s debt paragraph, which names
fifteen of twenty-four — it wants rewriting by hand, and padding the number would make it less true.


---

## Closing note, written after the council acted on itself

Seat 6 said the cheapest work here is walking the checks that exist and asking what their mirror
image would be. So item 1 was not done as "add VOICE and extend the neighbouring assertion". It was
done as **one table in `test/web.ts` naming every vocabulary shared across files**, walked in both
directions — nothing missing, and nothing invented. Adding a value to any of them now names every
map you have not updated.

Five pairs, plus three list-against-list checks: `ORDER` against `BLOCK_COLOR` and `BLOCK_ORIGIN`
(whole), against `TAG` and `CAPS` and `CANON_KINDS` (subset, since those are allowed to cover
fewer); the `Kind` union against `ORDER` itself, because a kind missing from `ORDER` sorts to
`indexOf` **-1** and lands at the head of the prompt, silently, on every call; and the four entry
types across `web/model.js`, `context.ts`'s `Entry` union and `EXTRACT_SCHEMA`'s enum — three lists
of one vocabulary, and the grammar is the one that decides what the model *can* say.

**The guard found two things beyond what it was written for.**

- **`CANON-TRIGGERED` and `STRING` are the same lightness** — 1.00:1, adjacent in the bar,
  separable by hue alone. Grandfathered by name rather than silenced, for a measured reason:
  `utilisation` scored 61 generations and neither kind was sent in any of them, so those two
  segments have never appeared together. That stops being true the moment §2e makes the triggered
  tier fire. The exemption is itself asserted, so fixing the pair without removing the entry goes
  red — an exemption doing nothing is a silenced check waiting for the next colour change.
- **Adjacent in `ORDER` is not adjacent in the bar.** The meter draws only the kinds a call
  contains, so which segments touch depends on what was sent. Found by giving `PROSE` and `TAIL`
  the same hex and watching the adjacency rule stay green, because `DIRECTIVE` sits between them in
  `ORDER` and nothing else looked. Distinctness is now checked separately from adjacency.

**And a rule this council proposed did not survive contact.** The first version asked for 1.2:1 of
luminance between neighbours; three existing pairs failed it. That is a redesign of the palette
wearing a check's clothes, and a check needing three exemptions on its first run is one that gets
silenced. It was cut to a correctness floor — two adjacent segments may not be the *same* lightness
— and the wider question is left here as a design call rather than enforced: **three adjacent pairs
in that meter are separated by hue alone.** Seth's to answer, not a test's.

`VOICE`'s own colour was then picked by lightness rather than hue, because its neighbours in `ORDER`
are `SPINE` and `CANON-ALWAYS` and a hue-only choice would have put a teal beside a green — the one
pair a deuteranope cannot separate.
