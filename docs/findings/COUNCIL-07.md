# Council 07 — the end-of-chapter ritual, 2026-08-30

Commissioned as: *"the end chapter ritual is wonky its not fluid. i ended a chapter and it
basically fed me the info for the current chapter i was on instead of helping me set the new one
up and it alot of info and boxes that might not even to exist there. this should be a simple
process."*

Five seats: three writers, one developer, one dungeon master. **The seats were worn, not spawned —
one reader who had read the source, arguing it five ways.** Five agents would each have had to
re-read the same 250 lines of `web/app.js`; that is the cost without the independence, since they
would have read one file and reached one conclusion. Said here so nobody reads "council" as five
opinions independently arrived at.

Everything below was read out of source before it was argued. Line numbers are from `web/app.js`
at HEAD unless named otherwise.

---

## 0 · What the ritual actually is, counted

Pressing **End this chapter** runs one route (`src/routes.ts:1485`) doing four passes: close,
summarise, remember, extract, retire. Then `web/app.js:6062-6069`:

```
V = await api.story(S.storyId);
S.ritualOf = closing.id;          // the chapter that just CLOSED
S.ritual = null; working(null);
syncHash(); paint(); refreshManifest();
```

`S.panel` is still `'ritual'`. So the paint lands on `ritualPanel()` (1277), which renders **five
report sections about the chapter you just left**, each with a re-run button, plus every proposal
card inline. The next chapter appears once, as the last item, as a ghost button:

```
'<button class="btn ghost" data-panel="setup">Set up the next chapter</button>'   // :1350
```

The writer's complaint is not a misreading of the screen. It is an accurate description of it.

---

## Seat 1 · The writer mid-book — "I pressed the door, not the exit"

I finished a chapter. The verb I pressed was *end*. What I got was an audit.

Five headings, five status dots, four re-run buttons, and a stack of cards each with an accept, a
replace and a reject. All of it about prose I have already written and already know. The one thing
I wanted — what is the next chapter, who is in it — is a grey button under all of it.

Order matters more than content here. Everything on that screen is defensible on its own. The
sequence is what is wrong: **it debriefs before it dispatches.**

## Seat 2 · The writer who came back on Thursday — "which chapter is this?"

Two panels sit next to each other in the same tray and they are about two different chapters, and
neither says so:

- `ritualPanel` reports on `S.ritualOf` — chapter 7, the closed one (`:1288`).
- `setupPanel` edits `V.currentChapter` — chapter 8, the open one (`:2811`).

Their titles are `Ending the chapter` and `The next chapter` (`:238-239`). Correct, and not enough:
both screens open with a chapter name in the same style at the same place, and one of them is
history. I have accepted a proposal onto the wrong chapter in my head twice.

## Seat 3 · The writer on their second chapter — "half these boxes have never had anything in them"

*Remembered what it did to the people in it* — nothing.
*Read for facts — 0.* *What this chapter finished* — nothing.

Three empty sections, three "or the pass has not run" sentences, three buttons inviting me to
re-run a thing that already ran. On a young book that is the whole screen: a checklist of absences.

The screen's own docstring defends this — *"three states per step, never two"* — and the seat
agrees with the principle. Ran-and-found-nothing must not read as failed. But a step that found
nothing does not need a heading, a dot, a sentence, a button, and 18px of margin. It needs a line.

## Seat 4 · The developer — three things in the code, not in the taste

**(a) The proposal cards on this screen are a second copy of a panel built to be the only one.**
`PANELS.waiting` (`:1458`) exists and reads `V.waiting`, computed in `src/story.ts:93`. Its
docstring — currently stranded one function too high, sitting on `ritual()` at `:1356` — says why
it was built:

> *"Each part of it was already on the surface somewhere — proposals under Chapter, promises under
> Strings, flags beside the passage they are about, the horizon on a bar — which is exactly the
> problem: four panels to find out whether anything wanted you."*

The ritual screen makes it five. It renders `of('state')`, `facts` and `of('retire')` as full cards
in place — the same proposals `waiting()` already collects. That is the answer to *"boxes that
might not even need to exist there."* They exist elsewhere already, on purpose.

**(b) `openingPassage`'s guard asks about the book when it means the chapter.** `:6069` fires it
after every close. `:4536`:

```
if ((V.passages ?? []).some((p) => !p.isBreak)) return;   // "Only into a chapter with no prose"
```

`db.passagesOf` (`src/db.ts:746`) returns **every passage in the story on this branch**, not the
current chapter's. So on any book past its first passage this returns early and the auto-opening
never happens after a close. `ritualPanel` asks the same question correctly forty lines up —
`p.chapterId === V.currentChapter.id && !p.isBreak` (`:1287`).

*Was source-read only when this was written. **Verified in the browser the same day** — the fix
and three new assertions in `test/ui/ritual.js`, one of which watches a passage land in the new
chapter. See the closing note.*

**(c) Even if (b) is fixed, the ordering is backwards.** Auto-open writes the first passage of
chapter 8 *before* the writer has been shown the setup panel. `setupPanel`'s own comment says the
beat *"rides near the generation point on every call"* and that Anansi fills the fields *"once."*
So the first passage of the new chapter would be the one passage written without the line that
steers every other passage in it. Landing on setup first makes (b) and (c) one fix.

## Seat 5 · The dungeon master — "you do not hand out XP at the door of the next dungeon"

At a table the end of a session has two halves and they are never one conversation.

The debrief is short and mostly mine to carry: *you learned the smith is lying, Marek owes you.* I
write it on my sheet. I do not read my notes aloud and ask the players to ratify each line.

The setup is the part that gets said out loud, and it is one sentence: **"next week you go down to
the cistern."** That is what a table needs to leave with, and it is the thing this screen puts last.

What the ritual has that a table would recognise is good: closing *does* ask what threads finished,
and the panel is right that only threads the chapter names are ever offered. Keep that. It is the
one part of the screen that is genuinely a ritual and not a form.

But the ceremony has grown a receipt. The close already happened — it cannot be undone from the
screen showing it. Showing five confirmations of an irreversible act that already succeeded is not
ritual, it is paperwork.

---

## The verdict: one reorder, two demotions, no new machinery

Ranked. Nothing here needs a new panel, a new column, or a new route.

**1. Land on setup, not on the report.** `:6067`, one line — set `S.panel = 'setup'` after the
close. The writer's next action after ending a chapter is starting one; the app already knows what
the next chapter is called, because `nameChapter` fires from `setupPanel`'s render and asks Anansi
for a title and a beat. Today that only happens if the writer scrolls past five report sections and
presses a ghost button. **This single line is most of "not fluid".**

**2. Demote the report to a line the writer can open.** Not delete — the three-state rule is right
and the re-run buttons are the way back when the router was asleep. But it becomes one row at the
top of setup: *"Chapter 7 closed · summarised · 6 waiting"*, pressing it opens the report as it is
today. A step that found nothing collapses to one line with its dot; only a step that FAILED opens
itself and shows its re-run button.

**3. Cut the inline proposal cards; point at Waiting.** The cards duplicate `PANELS.waiting`, which
was built to be the one place proposals live. The report keeps the counts and links.

**4. Fix the `openingPassage` guard, after 1 and 2 land.** Filter by `chapterId`. Doing it before 1
would make it worse, not better: it would auto-write the new chapter's opening while the writer is
still looking at the old chapter's audit, from a chapter with no beat set.

**5. Say which chapter each panel is about.** The two panels are adjacent, are about different
chapters, and look alike. Cheapest honest fix: the closed chapter's name on the report gets past
tense next to it.

**6. Move the stranded docstring at `:1356` onto `waiting()` where it belongs.** Trivia, but it is
the docstring that explains why finding 4(a) is a finding, and it is currently filed under the
screen that violates it.

### What the council did not accept

- **A wizard.** Two seats reached for one. Rejected: the close is already two presses across two
  screens, and a wizard makes the fluid path longer, not shorter. The problem is which screen you
  land on, not that there are too few steps.
- **Deleting the report.** The proposals are real and the router-asleep path is real. This is a
  demotion, not a cut.
- **A full-screen ritual surface.** `docs/checklist.md` reserves that question for its own session,
  and the panel's docstring already refuses it for the stated reason. Nothing here needs it.


---

## Closing note — what shipped, 2026-08-30

All six items. `test/all.ts` 52 checks green before and after; `test/ui/run.sh ritual` **35 ok, 0
red**, up from 24 — the scenario gained five assertions and lost none.

| # | What changed | Where |
|---|---|---|
| 1 | The close sets `S.panel = 'setup'` | `web/app.js`, the `d.endchapter` handler |
| 2 | The report is one row at the top of setup, and five lines behind it | `setupPanel`, `ritualPanel` |
| 3 | The cards are gone; one button to Waiting, re-runs in one row | `ritualPanel` |
| 4 | The auto-open guard filters by `chapterId`, and fires from Save | `openingPassage`, `d.savesetup`, `d.skipsetup` |
| 5 | `· closed` on the backward-looking heading | `ritualPanel` |
| 6 | The docstring is back on `waiting()` | `PANELS` |

**The landing was falsified before it was believed.** Green on a new assertion proves nothing until
the assertion has been watched to go red. `S.panel = 'setup'` was commented out and the scenario
re-run: **exactly two red, both of them the two new assertions, and the other thirty untouched.**
The line was restored and the scenario re-run green. The falsification run had written `2 red` into
`/tmp/anansi-ui-results.json`, which `test/web.ts` reads and refuses — so the green run was repeated
to leave that record honest rather than leaving a red on the board for a test that passes.

**Item 4 reverses a landing decision, and that is worth saying out loud.** `test/web.ts` carried a
comment reading *"the chapter's own screen now hands you on to the next chapter rather than the
close teleporting you there"*, which reads as a considered preference for the report. Reading
`fa9a631`, it was not one: before that commit the ritual had no screen at all, so the close had
nowhere to land but setup, and giving the report a screen moved the landing as a side effect. The
comment has been rewritten to say that. Both are true now — the close assigns the panel *and* the
report keeps a door back.

**A dead assertion was found in the file that documents dead assertions.** `test/ui/ritual.js`
asserted `/data-decide/` against `page.text('#sideBody')`, and `page.text` returns `textContent`
(`bench/drive.ts:240`) — an attribute name could never appear in it. It had never gone red only
because the model had not proposed a retirement on this fixture, so the branch had never run. That
is the fifth instance of this repo's oldest recurring bug, and it was sitting two lines below a
comment warning about it.

**Not done, and deliberately.** Nothing here is committed. `web/app.js` carries another agent's
in-flight work in the same file — the End-this-chapter button on the passage tray, among others —
and there is no way to commit one set of hunks without the other from here. The tree is left for
Seth to read and split.
