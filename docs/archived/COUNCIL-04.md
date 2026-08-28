# Council 04 — six reviewers on the built app, 2026-08-24

Six independent reviewers, none of whom had spent the day building it: a first-time user, a
returning power user, a literary novelist, a genre serial writer, an adversarial debugger, and a
senior engineer. Each drove the live app or read the source; none saw the others' reports.

**Already fixed, in the commits following this review** — listed here so the record is complete,
not to be re-done: the composer writing into the wrong chapter, `POST /api/model` being dead, the
worn outfit vanishing under a chapter-state, `assemble` ignoring `maxTokens`, `merge` duplicating
outfits, and F23 (thinking breaks structured output).

Everything below is **open**.

---

## ~~1 · The naming, which four of six raised independently~~ — FIXED

The first-time user could not tell whether these are one thing or five:

| where | what it says |
|---|---|
| workspace nav | **Worlds & lorebooks** |
| story panel | **Threads** |
| story card | **12 in the ledger** |
| composer | **+ Lore** |
| search result | **Add to the lore book** |
| Context rows | **CANON** |

They are one thing, and it is now called **a thread** in all six places. `DECISIONS.md` §6 records
the choice and what it costs: *threads* was the word the serial writer wanted for **plot promises**
(#10 below), so that feature will need a different one.

## 2 · The Context panel drowns at 358 passages

Ninety-six identical rows reading `PROSE / prose 60% ceiling` — no number, no name, not clickable
— under the seven real ones. The panel's own footnote says *"Click a row to reach what put it
there"*, which is false for 96 of 103 rows.

Omitted blocks of the same kind should collapse to one row with a count.

## ~~3 · No streaming~~ — BUILT

`chat()` is a blocking POST; nothing in `src/` or `web/` mentions `stream`. From this machine's own
`generations` table: **p50 5.7s, p90 8.2s, max 79s** of nothing happening per passage. The
first-time user assumed Continue was broken and clicked it again; the power user named it as the
one thing that would send them back to NovelAI or SillyTavern, both of which stream.

The working bar helps and is not the same thing as watching the sentence arrive.

**Built.** `POST /api/generate` takes `stream: true` and answers NDJSON — one `{d}` per fragment,
and a last line identical to what the blocking route returns, so the client's success path did not
change. Not SSE: `EventSource` cannot POST and every generation carries a body. The passage appears
in the document as it is written, dimmed and carrying a caret, and is replaced by the real one when
`accept` returns.

F24 measured what it actually bought, and corrects the p50 above: the wait is **prefill**, and
llama-server reuses the KV prefix. Warm — the normal case while writing — the blank page goes from
5.7s to **~0.35s**. Cold, after a load or the 15-minute sleep, it is still **~7.8s** before the
first word, because streaming does not touch prompt processing. One number was two.

## 4 · Delete orphans every alternate take

`delPassage` is `DELETE FROM passages WHERE id = ?`. There is no `confirm()` anywhere in
`web/app.js`, no undo, and **✕ Delete sits beside ↻ Regenerate**. It does not promote a sibling
variant, and `view()` reads `WHERE selected = 1` — so deleting a regenerated passage leaves every
other take in the database, invisible and unreachable.

Two fixes, both small: promote a sibling on delete, and make it take two presses like Delete story.

## ~~5 · The voice sample is the worst-served field in the app~~ — FIXED

`CAPS.DIRECTIVE = 250` and `[Voice: …]` is the only truncatable part of that block, so a pasted
sample is sliced 10% at a time, cut mid-word, and wrapped in brackets — which reads as a
*description* of style rather than prose to imitate. `context.ts:224` already admits the app's own
hint ("paste a few hundred words") guarantees the cap is exceeded.

**Fixed as `VOICE`, its own block.** 500 tokens of its own rather than the tail of DIRECTIVE's 250
— so "a few hundred words" now fits whole, measured at ~300 words in `test/engine.ts`. Sent
verbatim inside a `<voice>` fence instead of wrapped as `[Voice: …]`, with one instruction line
above it saying it is a specimen and must not be continued or mined for facts. It sits high, beside
SPINE: the only block holding prose that is not this story must not sit next to the sentence being
continued. Over the cap it still shortens — but the sample is now the only thing that can be cut,
and `addAnchor` backs the cut up to a sentence boundary, which also stops SPINE cutting the premise
mid-word.

The spice-4/5 promise *"Vocabulary follows the writing sample"* is true for the first time: the
sample is `keep: false` **within its own block**, not the first casualty of a shared one.

## 6 · Two of the five mode prompts produce slop

The novelist kept **Narrate** and **Act**. *"It is the story itself, not an instruction"* was
called the best line in the file, and Act's *"the world answering"* asks for consequence.

**Speak**: *"Write how everyone and everything else responds — speech, action, the room."* is a
checklist, and a checklist gets filled — reply, gesture, weather. That is the three-beat AI
paragraph, specified.

**Direct** and **Continue** both carry length targets. F18 already measured what a length target
does: a 160-character chapter came back as 1,269 characters, "all invention, because a target has
to be hit". The same defect, pointed at prose instead of summaries.

## 7 · The canon checker only checks entries that fired

`routes.ts:162`. Firing decides both what the model is told **and** what gets verified — one rule
doing two jobs, and they fail together. A character who did not fire can be contradicted freely
and nothing catches it.

The serial writer built a 46-entry ledger: **all 46 fired for an eight-person scene**. The budget
was never the constraint (2,566 of 46,146). The failure is precision — forty character sheets for
eight people on stage.

Their false fires, from a real run: `iron bridge` on *"The bridge was iron, and it was cold"*;
`Kade Ashford` on **Kade** Ferrin plus Lord **Ashford** two passages apart, for a character not in
the scene. `context.ts:132` deferred the proximity bound "until a real ledger false-fires". It
does, at n=46.

## 8 · Eviction order is backwards

`db.ts:298` orders entries by `rowid` and `context.ts:392` evicts within kind in insertion order —
so when the 45% canon cap does bite, the protagonists created by Spark go before yesterday's
walk-on.

## 9 · Chapter 120, and an unreachable feature

Chapter 40 is fine: EARLIER was 6,614 of 11,536 allowed. **Chapter 120 is not** — 20,952 needed,
and 53 chapter summaries drop oldest-first with the manifest rendering them as the bare word
`EARLIER`. The `arcs` tier that fixes this exists as `POST /api/rollup` and has **zero callers in
`web/app.js`**. It is on the DEFERRED list, so the api-caller invariant permits it.

## 10 · Plot threads are not tracked

"Threads" in the nav is the ledger grouped by kind. Nothing registers an open promise — the letter
unopened in chapter 6, the debt owed in 12. The serial writer named this as the single absence
that would stop them using it, and they are right that attribute drift is not what kills a serial.

## 11 · Engineering, smaller

- **`serve.ts` has no node-suite coverage and it holds the gate.** `test/scope.ts` proves the
  db-level defence and never that the dispatcher refuses. ~20 lines in the existing harness.
- **`endChapter` is two writes with no transaction** (`db.ts:573`). If the insert trips
  `chapters_idx` the story has no open chapter and `view` breaks. The file already does
  BEGIN/COMMIT/ROLLBACK five times.
- **`.db` import writes to disk uncapped** while the sibling branch caps at 20MB.
- **In-flight races**: `refreshManifest` and `openStory`'s activity fetch assign to `MANI`/`ACT`
  without rechecking `S.storyId`. Switch books fast and the Context panel describes the previous
  book's prompt. One guard line each.
- **`db.ts:138` is false**: it says `sticky_for` and `proper_nouns` are "stored and ignored";
  `story.ts:18` reads them and `context.ts:183,279` uses them. Only `priority` is still ignored.
  One of ten `ponytail:` markers is a lie, and that ledger is only worth what its accuracy is.
- **The composer still eats drafts** on opening a panel and on paging chapters — instances eight
  and nine of the repaint bug. The guard belongs in `drawDock`, not per-caller.

## What they would leave alone

The engineer explicitly argued **against** splitting `web/app.js` (2,258 lines) or `src/db.ts`
(1,007), and against converting the 80-name action chain to a handler map: with no build step,
splitting means module round trips and `S`/`V` becoming a shared store or an import cycle. Revisit
near ~3,500 lines at the `PANELS`/`WPAGES` seam. The real gap is array-to-branch drift, which is
four lines added to the lint that already exists.

## What the strategist would kill

- **Interiority and threads-between-characters** — F21 answered it; take option A.
- **The per-field reroller** — real work for a case solved by typing a name.
- **Fetch** — permanently, rather than leaving it open. *(Seth has since said Fetch is in, and it
  is built, off by default.)*
- **`priority` and `RECALL`** — a stored-and-ignored column and a reserved block kind that needs
  pgvector, which needs Postgres, which needs abandoning SQLite.
- **P3, the second tenant** — it heads BUILD-STATE §5's "what is next" and multi-user is
  permanently out of scope.

## The thing none of them were asked about

> The 358 passages were **imported**. Chapter 2 of 2. Nothing in the repo evidences the book
> growing inside Anansi — only the app growing around it. If building stays more interesting than
> writing, it ends.
