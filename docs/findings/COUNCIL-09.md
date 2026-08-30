# Council 09 — the whole app — 2026-08-30

Commissioned as: *"now do the same council for the whole app."*

Same five seats as Council 08 and the same rule: an interaction designer, a visual and typographic
eye, an accessibility seat, a working writer-user, and the developer who has to keep it. **The
seats were worn, not spawned.** Council 07 argued that for one screen on the grounds that five
agents would re-read the same 400 lines; over seventeen panels the arithmetic changes and the
conclusion does not, because Seth asked for *the same council*.

What did change is the method. One screen can be read; **7,046 lines of `web/app.js` and 1,251 of
`app.html` cannot be read carefully enough to be argued about**, and a council that skims and then
speaks confidently is worse than no council. So the findings below start from **counts run over the
source**, and every count that survived was then read line by line. One did not survive being read,
and it is in §5 rather than deleted — the detector was wrong in the direction that flatters, which
is the failure `.claude/CLAUDE.md` names first.

Line numbers are from `ebff9f5`.

---

## 0 · What was counted, and what the numbers were

| scan | denominator | flagged | survived reading |
|---|---|---|---|
| API calls whose error is never read | 113 | 17 | **3** (§5) |
| handlers that write, with no in-flight state | 40 | 36 | **4 confirmed model calls** (§1) |
| buttons with no accessible name | 212 | 4 | **4** (§3) |
| distinct `z-index` values | — | 15 | **on record already** (§4) |

The gap between *flagged* and *survived* in row 1 is the point of the table, not a footnote to it.

---

## 1 · Four buttons in a row fire a model call, and none of them can be pressed once

`web/app.js:6255-6281`, the four re-run buttons at the foot of the chapter's own screen:

```js
if (d.summarize) { toast('Summarising…'); const r = await api.summarize(…);
if (d.extract)   { toast('Reading the chapter…'); const r = await api.extract(…);
if (d.refinished){ toast('Looking for finished threads…'); const r = await api.finished(…);
if (d.remember)  { toast('Reading it for what it did to the people in it…'); const r = await api.remember(…);
```

A toast, and nothing else. **No `disabled`, no `working()`, no busy flag.** The button looks
exactly as pressable during the call as before it, and a model pass takes seconds.

Three things make this the council's first finding rather than a nit:

1. **The panel exists for the case where a pass came back blank.** Its own hint says so — *"If a
   line above came back blank, this is the way back."* So the writer arriving at these four buttons
   is, by construction, the writer most likely to press one twice.
2. **The router does not queue.** `.claude/CLAUDE.md`, measured: two concurrent writers fit, and
   *"oversubscribing the shared cache does not queue — both requests die with HTTP 500."* Three
   presses is not three waits; it is two dead requests and a toast that says nothing about why.
3. **The pattern is already in this file, three times.** `data-scanstory` carries `S.scanning ?
   'disabled'`, `data-memo` carries `S.memoing === p.id ? 'disabled'`, and `data-invent`
   (`web/app.js:5240`) sets `t.disabled = true` and swaps the label to *"Writing…"*. Every one of
   them is a model call, and every one of them is guarded.

This is the deletion finding again with a different verb: **the idiom exists and is not shared**,
so having it depends on whoever wrote the handler remembering. The developer seat notes the fix is
the same shape as `armed()` shipped this morning — one helper, and a handler opts in by naming
itself — and that shipping a fourth private copy of the disable-and-swap dance would be the wrong
answer to a finding about there being three.

**On the other 32.** They are local database writes and the window is milliseconds; the council did
not read all of them and does not claim they are safe, only that they are not this. The spark
wizard's four (`spark`, `spreroll`, `spreview`, `acceptSpark`) do reach the model and were **not**
read — they are named here so the next sitting starts with them rather than with a rescan.

---

## 2 · One save says "Saved." without looking

`web/app.js:6199-6202`, saving the next chapter's setup:

```js
if (r.error) return toast(r.error);
const ct = document.querySelector('[data-chapter-title]'), cn = document.querySelector('[data-chapter-note]');
if (ct) await api.saveChapter(S.storyId, V.currentChapter.id, { title: ct.value, authorsNote: cn?.value ?? '' });
V = await api.story(S.storyId); paint(); toast('Saved.'); refreshManifest(); return;
```

The first call is checked. **The second is not awaited into anything** — its result is discarded —
and `Saved.` is then said unconditionally. The chapter's title and the author's note are exactly
the two fields on that screen a writer types by hand, and a failure there is silent and reported as
a success.

The writer seat is the one that makes this worth ranking: *a toast that lies is worse than no
toast*, because the next time the field is empty you look for the bug somewhere else.

**One line: read the result and let the toast depend on it.**

---

## 3 · Four buttons in the app have no name

Counted over 212: `‹` and `›` (the take pager on a rerolled passage), `✕` (reject a proposal), and
`Aa` (the appearance toggle, which has `aria-pressed` and no label to press).

The accessibility seat wants the count read the right way round: **208 of 212 are labelled**, which
is a good number and is why the four are worth naming rather than buried. `✕` is the one that
matters most — it is a *decision* about a proposal and the only unlabelled control in the app that
throws something away.

---

## 4 · Fifteen stacking values, and the debt is already written down

`z-index` takes 15 distinct values between 0 and 60 across `app.html` and `web/app.js`.
`docs/checklist.md:19` already names this: *"(rail, side panel, scrim, tray sheet) have four
stacking rules and no shared owner. That gets decided once."*

The council's only contribution is to say what it has cost, because a debt marker with no cost is
a debt nobody should pay to clear yet. It has cost **one** reproduced bug, described in the comment
at `app.html:58` — a block becoming a stacking context capped the sheet's z-index inside it. That
is one, in a file that has been through this many times. **Not ranked for shipping.** It stays on
the checklist where it already is.

---

## 5 · The finding the council withdrew, and why it is the most useful thing here

**Claimed: "17 of 113 API calls never read their error."** False, and false in the flattering
direction — it would have made the app look worse and given the council something dramatic to say.

The scan matched `await api.x(` and looked three lines ahead for `.error`. On reading:

- **Eleven were the scanner's own fault.** `V = r.entries ? r : await api.story(…)` is an
  assignment the regex could not see, and a ternary spanning two lines
  (`web/app.js:5394-5395`) puts its `if (r.error)` on the line after the window closed.
- **Two are deliberate and documented at the call site.** `api.manifest` (`4605`) clears on failure
  *on purpose* — the comment explains that showing the last manifest that worked is the same lie
  the guard above it prevents. `api.generateLive` checks `r.error` eight lines down, past a
  `r.aborted` branch.
- **Three are real**, and one of them is §2 above. The other two — `pickVariant` at `5516` and a
  spark `saveStory` at `6489` — fail silently and neither loses writing.

So the honest number is **3 of 113**, one of which matters. `.claude/CLAUDE.md`: *"Validate the
detector before believing the result. A check that never fires reports perfection"* — and its
mirror, which cost this council an hour: a check that fires too easily reports a crisis.

---

## 6 · What the council would ship, in order

| | what | why it is where it is |
|---|---|---|
| 1 | One shared in-flight guard, and the four chapter-end re-runs opt in | Only finding with a measured failure behind it: the router answers 500, not a queue |
| 2 | `saveChapter`'s result decides its own toast | A success message over a silent failure, on hand-typed fields |
| 3 | Names on the four unlabelled buttons, `✕` first | Smallest change here, and the only one that throws something away |
| 4 | Nothing | §4 is on the checklist and has cost one bug; §5 was withdrawn |

Items 1–3 do not touch the engine, the prompt or the schema.

---

## 7 · What this council did not do

Said plainly, because a whole-app review that does not say where it stopped will be read as
complete:

- **It did not read the spark wizard, import, the phone layout, or the model panel** beyond the
  scans. The four spark handlers in §1 are the known gap and are named there.
- **It ran no measurement.** Every number above is a count over source, not a run. Nothing here
  says how any of it behaves under a real model, and per this repo's own rules a count is not a
  finding until it is read — which the four in §1 were, and the thirty-two in §1's last paragraph
  were not.
- **It made no aesthetic judgement.** The visual seat raised `.tag` at 9.5px in all-small-caps —
  the smallest type in the app, carrying the word that says what a proposal is about — and the
  council could not agree whether that is a defect or a house style, so it is recorded here and
  proposed nowhere.
