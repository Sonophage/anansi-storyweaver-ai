# Anansi — Prompt Text

**Revision 2, 2026-08-23. Transcribed from the code, not from intent.** Revision 1 described a
transport this design does not use and a system block with a rule that no longer exists. Where this
file and `src/render.ts` / `src/context.ts` disagree, the code is right and this file is the bug.

`{{...}}` are substitutions.

---

## 1. The system block

`src/render.ts`, `export const SYSTEM`. Sent first, static per story, so it is the cache prefix.

```
You are a prose engine for a novel. You write the next passage and nothing else.

Rules:
- Output prose only. No preamble, no commentary, no headings, no meta-text.
- Continue from what came before. Never summarize it.
- Never resolve a scene the writer has not asked you to resolve.
- Facts in the canon section are true. Write as though the reader already knows
  them; never restate them as exposition.
- Where the prose and the canon disagree, the canon wins and you write to it. If a fact has
  changed, the writer will change the canon.
```

**Two changes from revision 1, both deliberate.**

The arbitration rule used to read *"canon marked `[pinned]` always wins… canon not marked
`[pinned]` yields to the prose"*. Every entry carried the tag, because `last_editor` defaulted to
human for spark characters, accepted proposals and hand edits alike — so that clause described a
branch which never fired while muddying the one that did. See F12 and F15.

**There is no POV line here.** Point of view moved to the DIRECTIVE block, which sits near the
generation point rather than at the top of a 9,000-token prompt.

---

## 2. Block order

`src/blocks.ts`, `export const ORDER`. Named, never numbered — three incompatible numberings once
existed across two documents.

```
SPINE  VOICE  STYLE  CANON-ALWAYS  CANON-TRIGGERED  STRING  EARLIER  PROSE  DIRECTIVE  TAIL  MODE
```

Corrected 2026-08-29 (#18 §4) against `src/blocks.ts`. What was written here missed **VOICE**,
**STYLE** and **STRING**, and still listed **CANON-REPEAT**, which F20 measured at 850 tokens for
no gain and which came out then. Caps live in the same file: `SPINE 1000 · VOICE 500 · STYLE 200 ·
DIRECTIVE 250`; every other block is uncapped and trimmed by the budget instead.

Delimiters are **tags, not Markdown headers**: `#` collides with Markdown prose storage and invites
the model to continue the document with "## Chapter 13". `src/render.ts` maps kinds to tags and is
the only place ordering becomes text.

| kind | tag |
|---|---|
| SPINE | `<story>` |
| CANON-ALWAYS, CANON-TRIGGERED, CANON-REPEAT | `<canon>` |
| EARLIER | `<earlier>` |
| VOICE | `<voice>` |
| STYLE | `<style>` |
| STRING | `<unpaid>` |
| PROSE, DIRECTIVE, TAIL, MODE | untagged |

`LORE` and `RECALL` were removed 2026-08-23: declared, ordered, tagged, and never populated. They
return with the vector recall that would fill them.

`CANON-REPEAT` was the F15 experiment arm — the canon that fired, restated below the directive.
**Deleted after F20**, which ran it at 850 generations per arm and measured no effect: −0.02 points
on contradictions, +0.24 on the silver rate, and a hint of the exposition cost it was placed to
avoid. F15's apparent halving at n=300 was noise.

---

## 3. SPINE

```
{{title}} — {{genre}}
{{premise}}
Setting: {{setting}}
Where this is going: {{direction}}
```

**`direction` reaches every prose call, and that is correct.** PLAN-02 §3 and §8 say it "never
reaches a prose call" and steers only `summary` and `extract`. COUNCIL-03 overruled that — a
destination is not a claim about *now*, so §7.1's argument against permanent bodies holding
temporal facts does not reach it. Confirmed by Seth, 2026-08-23. The plan is the stale document.

Title and `premise` and `direction` are `keep: true`; **`Setting:` is the part that shortens** when
SPINE exceeds its **1000**-token cap. Anchors are shortened, never deleted.

**The cap went 400 → 1000 on 2026-08-30, and it was not a preference.** At 400 it was cutting a live
book on every call: `The Geometry of Absence` assembles ~716 tokens of spine and reported `anchor
shortened to 400 tokens`, losing its setting mid-sentence. At 1000 the whole spine fits and no other
book is within 400 of the ceiling.

**COUNCIL-06 swapped those two flags on 2026-08-30, and the reason is worth keeping.** The premise
was the flex part and the setting was never trimmed, which is backwards on the evidence: across the
live library the premise is the shorter of the two and it is the only text in SPINE that names who
the book is about, while `Setting:` runs to a thousand characters of atmosphere naming nobody. The
setting is recoverable — a place has lore entries and CANON blocks of its own — and the premise
exists in exactly one place. Nothing in the library is over the cap today, so this changed no
prompt that is sent now; it changed which part survives the day one is.

---

## 4. DIRECTIVE

Sits `tailTokens` above the end — above the last few paragraphs of prose, never last. A block
adjacent to the mode instruction gets written *about* rather than obeyed.

```
[Writing: {{pov}}]
[{{the POV instruction — see below, it depends on the grammar}}]
[This chapter must end with: {{authors_note}}]
[{{register line}}]
{{the take the writer turned down, if there is one — nothing in the app sets this; F44}}
```

**The second line branches on the person, since COUNCIL-06.** F28 measured the lockout — *"{name}
belongs to the writer: never write their dialogue, action, gesture or thought…"* — at **acted 76% →
25% (p = 0.0005)** and **spoke 20% → 0%**. It was measured in **third person** and was being sent in
first and second person as well, where it says the opposite of the line above it: rendered live,
`[Writing: first person, present tense]` followed by `[Elias belongs to the writer: never write
their … thought]`, followed by a page of Elias thinking in the first person. **Five of the nine
books in the live library were in that state.**

So third person keeps F28's text **byte for byte**, and first or second person gets the rule that
actually applies to that grammar instead:

```
[{{teller}} is telling this story. The narration is {{teller}}'s: write only what {{teller}} senses,
 remembers or decides. Every other character is written from outside — what they say, do and leave
 behind. Never state what anyone but {{teller}} thinks, feels or intends; where {{teller}} can only
 guess, write the guess as a guess.]
```

`{{teller}}` is `locked_character`, falling back to `persona`. Before this, **`persona` produced no
prompt text at all** — it only force-fired that character's own card into canon (`context.ts`'s
`isPov`) — so a book that named who the writer plays and set no lock said nothing about POV at all.
With neither set, neither line is sent: inventing a narrator is worse than saying nothing.

**Voice is NOT in this block, and has not been since COUNCIL-04 #5.** It is `VOICE`, its own block
with its own 500-token cap, second in `ORDER`; the book's genre flavour is `STYLE` below it at 200.
The line that stood here — `[Voice: {{writing_style}}]`, described as the one part of DIRECTIVE that
shortens under the 250-token cap — was true of a shape this engine left behind, and #18 §4 is what
caught it still being written down.

Everything in DIRECTIVE is `keep: true` except the rejected take, which is the only part that
shortens. That is why a new block had to be a new block: this one cannot trim, it can only refuse.

### Register lines by spice level

Explicitness only. Never POV, voice, or pacing.

**Re-cut 2026-08-25.** Every level now says the same three things in the same order — what may be
on the page, **where the camera stops**, and how it is written. The old lines said them in
adjectives, and an adjective is a thing the model reinterprets on every call: *"written with
restraint"* was read as *write around it*, and *"suggestion and aftermath over anatomy"* is a craft
note being asked to do a boundary's job. A level is a boundary. The craft belongs to the voice
sample.

The ladder is where the camera stops: **at the kiss, at the door, in the room, on the act, and
nowhere.** Each level is the one before it plus a step, so moving a story up gets what it had and
more rather than a different register.

| Level | Camera stops | Line |
|---|---|---|
| 1 | at the kiss | `Register: no sexual content. Attraction, longing and a kiss may be on the page. The scene ends at the kiss.` |
| 2 | at the door | `Register: desire is on the page and sex is not. Write the wanting, the approach, and what is different afterwards. The camera stops at the door and picks up past it.` |
| 3 | in the room | `Register: sex happens on the page, in the same voice as the rest of the book — what passes between them, what is said, what changes. Bodies are present and not itemised. Adult characters only.` |
| 4 | on the act | `Register: sex is written directly, in plain words, with the acts named as they happen. It is a scene like any other and still has to move the story. Vocabulary follows the writing sample. Adult characters only.` |
| 5 | nowhere | `Register: fully explicit, in unrestricted detail, for as long as the scene runs. Do not fade, summarise, cut away or skip ahead. Vocabulary follows the writing sample. Adult characters only.` |

Levels 4 and 5 constrain model routing per SPEC §10.2, not only the prompt.

---

## 5. MODE

The final block. `src/context.ts`, `const MODE`. **Five modes as of 2026-08-24**, replacing
Co-Write / Direct / Full Auto / New Scene at Seth's direction. Adventure was dropped on
2026-08-23, not deferred.

The set is built around one distinction, and blurring it was the bug that forced the change: in
**Direct** the writer's text is an *instruction* and never reaches the page; in **Speak**, **Act**
and **Narrate** the writer's text *is* the last passage and the model's job is to answer it.
Before this, every mode treated typed text as a directive, so dialogue the writer typed vanished
into the prompt and never appeared in the story.

**Re-cut 2026-08-25**, and two defects came out of all five. **No prompt names a length** — three
of them did, and F18 is what a named length does: the model fills it. The scope words were already
carrying the instruction, and `max_tokens` is the bound, because running into that one fails
visibly. **No prompt offers a list of slots** — Speak said *"speech, action, the room"* and got back
reply, gesture, weather, in that order, every time (COUNCIL-04). Three slots is a shape, and a shape
the model can see is a shape it completes. Act had the same defect in different words, which
COUNCIL-04 did not name.

`test/engine.ts` holds both: no mode may name a paragraph, sentence or word count, and neither of
the two lists may come back.

**Continue** — a button, not a mode. No directive, because there is nowhere to type one.
```
Carry the scene forward by one small beat, and stop.
Do not skip time. Do not introduce a new character, location, or revelation unless the
prose above set it up.
Stop when the beat is done, even if that is three sentences.
```

**Speak** — the writer's line is already the last passage, tagged with `speaker`.
```
The last passage is dialogue the writer has just spoken as {{speaker}}.
Write what it lands on. It may land on one person, or on the room, or on nobody — any one of
those is a whole answer and the scene is owed no other.
Do not put further words in {{speaker}}'s mouth. Do not repeat the line back.
```

**Act** — the same shape, but an action is narration, so the passage carries no `speaker`.
```
The last passage is what {{speaker}} has just done.
Write the one thing that follows from it — what it costs, or what it gets.
Do not decide what {{speaker}} does next. Do not restate the action.
```

**Direct** — the only mode whose text is an instruction.
```
Write what happens next: {{directive}}

Cover that and nothing beyond it. Do not narrate past the instruction, and do not resolve it
faster than the scene wants. The length follows the instruction: a small one is a small
passage.
```

**Narrate** — the writer wrote prose. Saying so is the whole job: without it the model reads a
paragraph of narration as a request and writes *about* it instead of *from* it.
```
The passage above was written by the author, not by you. It is the story itself, not an instruction.
Continue from where it stops. Pick up mid-thought if the last line is unfinished.
Do not rewrite it, summarise it, or comment on it. Stop at a natural beat, however few
sentences that takes.
```

### The writer's own wording

**Built 2026-08-25.** Storyteller → *The five modes, in your words*. An override is a **full
replace**: whatever is in the box becomes the MODE block, with `{{directive}}` and `{{speaker}}`
filled exactly as the shipped prompts fill them. It is per **owner**, not per story — global, with
Default putting the shipped wording back.

Stored in `prompt_overrides(owner_id, key, text)`. Blank is not a state: `db.setPrompt` deletes
rather than storing it, so Default is Save with an empty box and there is one path back. `talk` is
deliberately not editable — it is Anansi's chat rather than a way of writing prose, and a reworded
chat prompt would let it continue the book.

The override reaches `buildContext` through `Input.modePrompts`, never read from a table inside the
engine: `buildContext` is pure below the line in `story.ts` and this is a flag like any other. The
Context panel's manifest is assembled with the same overrides, so *Prompt sent* shows what will
actually be sent, and the block's reason reads `mode:speak · yours`.

**Not built, and it is DECISIONS §3.** There is no composition — an override replaces, it does not
merge — and no validation beyond refusing a blank. A prompt that produces nothing produces nothing.

`{{speaker}}` defaults to the point-of-view character and can be anyone in the cast — the
`speaker` column on a passage has always supported that; until now nothing could set it.

MODE is omitted only for **Narrate** on an unfinished line, and that scoping is deliberate:
Direct's directive and speak/act's "whose line is it" live **only** in MODE, and omitting it also
drops the length instruction, which truncates, which looks unfinished, which omits it again. It
latches. Narrate inherits the exception from Co-Write because it is the mode where the writer
deliberately stops mid-sentence for the model to finish.

An unknown mode falls back to Continue rather than throwing — a stale browser tab still sends the
retired names, and a 500 from an undefined lookup is a worse answer than the neutral mode.

---

## 6. Structured-output roles

`src/prompts.ts`. Sent with a JSON schema, which llama.cpp compiles to GBNF.

`spark` — idea in, story skeleton and 2-5 characters out. Infers spice from the idea, defaults to 2.

`summary` — a chapter for the story bible. Only what a later chapter must know. Present tense.

`extract` — proposes entries. **Only facts not already in canon, and nothing is canon until
accepted.** Proposals carry the sentence that establishes them. Zero proposals is a valid answer.
Measured: 10/10 runs proposed all three new entities in F17's fixture.

`check` — runs after a passage is selected, against the manifest's included entries. Flags
contradictions; never rewrites. Measured F1 0.89 (F11). Known gap: misses numeric contradictions,
one case in twelve.

---

## 7. What is measured about this file

Nothing here is settled by argument. `bench/compliance.ts` and `bench/ab.ts` drive one fixture
through the whole prompt and count contradictions in **narration with dialogue stripped** —
dialogue may lie.

- The title in SPINE: no measurable effect, n=30 per arm (F12).
- Canon restated near the generation point: **no effect**, n=850 per arm (F20). F15's 7.1% → 4.8%
  at n=300 did not replicate; the code is deleted. Prompt wording is not the lever for F9 — that is
  now measured twice, F10 having made it worse.
- Instruction compliance cannot be scored by regex — the right act in unlisted words reads as a
  failure. That needs a judge model (F17).
