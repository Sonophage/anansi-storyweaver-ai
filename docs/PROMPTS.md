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
- Match the established voice. Do not escalate register on your own.
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
SPINE  CANON-ALWAYS  CANON-TRIGGERED  EARLIER  PROSE  DIRECTIVE  CANON-REPEAT  TAIL  MODE
```

Delimiters are **tags, not Markdown headers**: `#` collides with Markdown prose storage and invites
the model to continue the document with "## Chapter 13". `src/render.ts` maps kinds to tags and is
the only place ordering becomes text.

| kind | tag |
|---|---|
| SPINE | `<story>` |
| CANON-ALWAYS, CANON-TRIGGERED, CANON-REPEAT | `<canon>` |
| EARLIER | `<earlier>` |
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

Title and `Setting:` and `direction` are `keep: true`; the premise is the part that shortens when
SPINE exceeds its 400-token cap. Anchors are shortened, never deleted.

---

## 4. DIRECTIVE

Sits `tailTokens` above the end — above the last few paragraphs of prose, never last. A block
adjacent to the mode instruction gets written *about* rather than obeyed.

```
[Writing: {{pov}}]
[Voice: {{writing_style}}]
[This chapter must end with: {{authors_note}}]
[{{register line}}]
```

`writing_style` is the writer's own words from the spark, edited by hand. It is not a dropdown, and
it is the one part of this block that shortens under the 250-token cap.

### Register lines by spice level

Explicitness only. Never POV, voice, or pacing.

| Level | Line |
|---|---|
| 1 | `Register: no sexual content. Romance may be emotional only. Fade at a kiss.` |
| 2 | `Register: romantic and sensual. Desire is on the page; sex is not. Cut away at the bedroom door.` |
| 3 | `Register: sex happens on the page, written with restraint. Suggestion and aftermath over anatomy. Adult fiction between adult characters.` |
| 4 | `Register: sex is written directly and fully. Explicit, but the scene still serves the story. Vocabulary follows the writing sample. Adult fiction between adult characters.` |
| 5 | `Register: fully explicit. Write sex in unrestricted detail. Do not fade, summarize, or cut away. Vocabulary follows the writing sample. Adult fiction between adult characters.` |

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

**Continue** — a button, not a mode. No directive, because there is nowhere to type one.
```
Write the next 1-2 paragraphs.
Advance the scene by one small beat. Do not skip time. Do not introduce a new
character, location, or revelation unless the prose above set it up.
```

**Speak** — the writer's line is already the last passage, tagged with `speaker`.
```
The last passage is dialogue the writer has just spoken as {{speaker}}.
Answer it. Write how everyone and everything else responds — speech, action, the room.
Do not put further words in {{speaker}}'s mouth. Do not repeat the line back.
```

**Act** — the same shape, but an action is narration, so the passage carries no `speaker`.
```
The last passage is what {{speaker}} has just done.
Write what follows from it — the consequence, the reaction, the world answering.
Do not decide what {{speaker}} does next. Do not restate the action.
```

**Direct** — the only mode whose text is an instruction.
```
Write what happens next: {{directive}}

Write 2-4 paragraphs covering that and nothing beyond it.
Do not narrate past the instruction. Do not resolve it faster than the scene wants.
```

**Narrate** — the writer wrote prose. Saying so is the whole job: without it the model reads a
paragraph of narration as a request and writes *about* it instead of *from* it.
```
The passage above was written by the author, not by you. It is the story itself, not an instruction.
Continue from where it stops. Pick up mid-thought if the last line is unfinished.
Do not rewrite it, summarise it, or comment on it. Write 2-4 paragraphs and stop at a natural beat.
```

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
