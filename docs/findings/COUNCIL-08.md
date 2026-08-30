# Council 08 — the card, after the clean-up — 2026-08-30

Commissioned as: *"have a council of ui experts lookat hoe the card looks and acts now and tell me
what they say."*

Five seats: an interaction designer, a visual/typographic eye, an accessibility seat, a working
writer-user, and the developer who has to keep it. **The seats were worn, not spawned** — the same
call Council 07 made and for the same reason: five agents would each re-read the same 400 lines of
`web/app.js` and arrive at one conclusion, which is the cost of a council without its independence.
Said plainly so nobody reads "council" as five opinions independently reached.

Line numbers are from `web/app.js` at **d24722f**, the commit this council is about. Every claim
below that could be checked against source was checked before it entered this document; two the
council wanted to make were **withdrawn** when the code said otherwise, and they are recorded in §5
rather than deleted.

---

## 0 · What the card is now, counted

| | before | after |
|---|---|---|
| headings on an empty character's form | 8, six of them over empty boxes | 0 |
| ways to add a room | 9 (a `+` per slot, plus the wardrobe's own form) | 1 |
| Save buttons | 1, at the foot, under a dozen sections | 1, in a sticky bar at the head |
| sections always expanded at the foot | 3 (Over time, Brings in with it, Another book) | 0 |
| fixed-height text boxes | 5 | 0 |

Four seats called this a straight win and said so before anything below. The findings are what is
left, and three of them are new faults introduced by the clean-up itself.

---

## 1 · The finding that outranks the rest: Delete this entry has no confirmation

`web/app.js:5562`:

```js
if (d.delentry) {
  const r = await api.delEntry(S.storyId, S.entryId);
```

One press, the card is gone, and there is no undo anywhere in the app. **This is the single most
destructive button on the screen and it is the only destructive button in this file with no guard.**
The same file already holds two, both written after the same thing went wrong:

- `S.confirmDel` — deleting a passage, guarded *"fired on one press and had no undo"*
- `S.confirmDelete` — deleting a story, guarded with a six-second window and a repaint

The accessibility seat sharpens it: Delete sits at the bottom of the form directly under **Field
history**, which is the button a writer presses when they want to *recover* something. Two presses
apart, opposite outcomes, and only one of them is reversible.

**Not a design question — a missing guard, and the pattern to copy is eleven lines up the same
file.** The developer seat notes the tray's End-this-chapter guard added today is the third instance
of this idiom, which is the point at which it wants extracting; the council does not think that
blocks the fix.

---

## 2 · The Info hint points at a section most cards do not have

`web/app.js:3380`, under the body box:

> "What must survive a rewrite goes in facts, above."

`roomSection` (`3267`) returns an empty string when the slot holds nothing:

```js
const mine = (e.addons ?? []).filter((a) => a.slot === sl.name && …);
if (!mine.length) return '';
```

So on **every card that has no facts room yet — which is every card until somebody writes one** —
the hint points upward at nothing. The writer seat is blunt about what that reads as: not "go and
make one", but "there is a thing here I cannot find".

This is a fault introduced today by two changes that are individually right and were not read
together: Facts moved above Info *because* it survives the rewrite, and empty rooms stopped being
drawn *because* eight of them were noise. Their intersection is a signpost to an empty road.

**Fix, smallest first:** when the card has no facts room, the hint says how to make one rather than
where it is. The seats split on whether the facts slot should be the one exception that draws when
empty — three against, on the grounds that one exception is how the eight came back last time.

---

## 3 · Nothing on screen says an add worked

Pressing **Add** in the tray writes the row, repaints, and toasts. The new room then appears in the
on/off groups **below the fold**, sorted into its slot; the tray stays open on the same pill with
the fields cleared.

So the writer's evidence that anything happened is a toast and two boxes that emptied — and empty
boxes are equally what a rejected write looks like. The interaction seat calls this the weakest
moment in the new flow, because it is the moment the tray was built for.

Three fixes were argued; the council prefers the first:

1. **Close the pill after a successful add and scroll the new room into view.** The room is the
   receipt. Costs one line in the `addoutfit` handler and one `scrollIntoView`.
2. Show the new room inside the tray until the writer moves on. Rejected 4-1: two places drawing
   one row is this repo's most frequently repeated bug.
3. Leave it; the toast is the receipt. Rejected — the toast is where every other outcome also goes,
   including failures.

---

## 4 · What the seats disagreed about, kept as disagreement

**The face's room body is a button that now navigates.** It was `data-goslot` and scrolled a little
way down the page you were on, so a stray press cost nothing. It is `data-editroom` (`3106`) and
leaves the reading view. Two seats want it kept exactly as it is — it is the feature that was asked
for and reading a room and wanting to fix it is one motion. The visual seat wants the press target
narrowed to something smaller than the whole paragraph, and points out that a `<button>` wrapping
prose is also hard to select text out of. **Unresolved. Neither side produced a case where the
current behaviour loses work**, which is why nothing is proposed.

**Two Anansi trays, at opposite ends of the form.** The add tray carries one for the room being
added; `3469` carries "Have Anansi write this card" below the wardrobe, near the foot. The developer
seat says they are different verbs — one adds a room, the other rewrites the whole card, unsaved —
and that they are correctly far apart. The writer seat says it does not know that from looking, and
that the second one is now buried under a section that is only drawn for characters with outfits.
**Unresolved.** Both agree it is worse for a card with no wardrobe, where "Have Anansi write this
card" now floats after the rooms with nothing above it.

**`S.folds` is one map for every card**, not per-card state — open Over time on one card and it is
open on the next. Three seats read that as correct (it is a preference about a section, not about a
card). Two want it per card. Nobody wants it reset on every paint, which is what it does not do.

---

## 5 · Two findings the council withdrew when the code was read

Recorded rather than deleted, because a council that only reports what survived cannot be checked.

**"The sticky bar will not stick — `#sideBody > *` carries `animation: settle … both`, and a
persistent transform on an ancestor breaks `position:sticky` in a descendant."** Read: `@keyframes
settle` (`app.html:158`) ends at `transform:none`, and `none` creates no containing block. The bar
sticks. The concern was real, the mechanism was not present.

**"The tray offers a second `appearance` on a card that already has one, and the database will
refuse it."** Read: `addons_one_active` (`src/db.ts:496`) is a **partial** index —
`WHERE active = 1 AND slot IN (…)`. Exclusivity is about which one is ON, not how many exist. A
second appearance is a legitimate row and the screen's "(one at a time)" is accurate about the
switch. Nothing to fix.

---

## 6 · What the council would ship, in order

| | what | why it is where it is |
|---|---|---|
| 1 | A press-again guard on **Delete this entry** | Only unrecoverable loss on the screen; pattern already in the file |
| 2 | The Info hint stops pointing at a section that is not drawn | Introduced today, costs one conditional |
| 3 | An add closes its pill and scrolls the new room into view | The tray's weakest moment is its own success |
| 4 | Nothing | Everything in §4 is a disagreement, and none of the sides showed work being lost |

Items 1–3 are three small changes and none of them touches the engine, the prompt or the schema.

---

## 7 · Not in scope here, named so it is not lost

Seth, in the same sitting: *"we also need a delete chapter and a way to delete anything after a
specific answer."* Neither exists — there is no `delChapter` in `src/db.ts` and no route for either
(`grep` run 2026-08-30). Both are destructive across prose the writer wrote, and §1 above is the
council's whole opinion on shipping a destructive control without a guard. They want their own
sitting, and the questions that decide the design are what happens to a deleted chapter's summary,
its proposals, and the ledger facts already extracted from prose that is about to stop existing.
