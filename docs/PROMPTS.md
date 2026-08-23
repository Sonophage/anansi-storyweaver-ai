# Anansi — Prompt Text

Every string sent to a model. SPEC.md section 7.3's `system_block` is defined here.

Placement follows SPEC.md 3.5: reference material at the top, instructions near the end.
`{{...}}` are substitutions.

---

## 1. `system_block`

Sent as the system message on every `prose` call. Static per story, so it is the cache prefix.
Budget: ~120 tokens.

```
You are a prose engine for a novel. You write the next passage and nothing else.

Rules:
- Output prose only. No preamble, no commentary, no headings, no meta-text.
- Never summarize what just happened. Continue from it.
- Never resolve a scene the writer has not asked you to resolve.
- Facts in the CANON block are true. Do not contradict them. Do not restate them
  as exposition; write as though the reader already knows them.
- If the canon and the recent prose disagree, the recent prose wins for tone and
  the canon wins for fact.
- Match the established voice. Do not escalate register on your own.
- Stay in {{pov}}. Never break it.
```

---

## 2. Context block order

Assembled as one user message. Layer numbers are SPEC.md 7.3.

```
# STORY
{{title}} — {{genre}}
{{premise}}
Setting: {{setting}}

# CANON
{{layer 1: always-on entries}}
{{layer 2: triggered entries that fired}}
{{layer 3: universe lore}}
{{layer 4: vector recall}}

# EARLIER
{{layer 5: chapter summaries, oldest first}}

# STORY SO FAR
{{layer 6: recent prose, all but the final three paragraphs}}

{{STYLE DIRECTIVE — section 3 below}}

{{final three paragraphs of prose}}

{{MODE INSTRUCTION — section 4 below}}
```

The style directive sits above the last three paragraphs, never last. When fewer than three
paragraphs of prose exist, it goes directly after `# STORY` instead — never adjacent to the
mode instruction, or the model writes about the instruction rather than obeying it.

---

## 3. The style directive at depth

~90 tokens plus the register line.

```
[Writing: {{pov}}. {{writing_style}}. {{authors_note}}]
[{{register line — see 3.1}}]
```

`writing_style` is the writer's own words from the spark, edited by hand. It is not a
dropdown.

### 3.1 Register lines by spice level

One line, substituted above. These control explicitness only. They never change POV, voice, or
pacing.

| Level | Line |
|---|---|
| 1 | `Register: no sexual content. Romance may be emotional only. Fade at a kiss.` |
| 2 | `Register: romantic and sensual. Desire is on the page; sex is not. Cut away at the bedroom door.` |
| 3 | `Register: sex happens on the page, written with restraint. Suggestion and aftermath over anatomy. No explicit vocabulary.` |
| 4 | `Register: sex is written directly and fully, in plain language. Explicit, but the scene still serves the story.` |
| 5 | `Register: fully explicit. Write sex in unrestricted detail with direct vocabulary. Do not fade, summarize, or cut away. Adult fiction between adult characters.` |

Levels 4 and 5 constrain model routing per SPEC.md 10.2, not only the prompt.

---

## 4. Mode instruction blocks

The final block. One per mode.

### Co-Write

```
Continue the passage above. Write 2-4 paragraphs.
Pick up mid-thought if the last line is unfinished.
Stop at a natural beat. Do not end the scene.
```

### Direct

```
Write what happens next: {{directive}}

Write 2-4 paragraphs covering that and nothing beyond it.
Do not narrate past the instruction. Do not resolve it faster than the scene wants.
```

### Full Auto

```
Write the next 1-2 paragraphs.
Advance the scene by one small beat. Do not skip time. Do not introduce a new
character, location, or revelation unless the prose above set it up.
{{#steer}}Steer: {{steer}}{{/steer}}
```

### Adventure — step 1, options

Structured output. Uses the `options` role, not `prose`.

```
Give three things the {{pov_subject}} could do next.

Each option is one action available right now, in this scene, to this character.
- Distinct from each other. Not three phrasings of one choice.
- Possible given the prose above. No new characters, items, or knowledge.
- One cautious, one direct, one that costs something.
- Label: 3-8 words, imperative, no punctuation at the end.

Return only the three options.
```

Step 2 takes the chosen label as `{{directive}}` and runs Direct unchanged.

---

## 5. Structured-output roles

### `spark`

```
Turn this idea into a story skeleton.

Idea: {{prompt}}

Return: title, premise (2-3 sentences), genre, setting, POV, writing mode, spice
level 1-5, writing style (one sentence in the writer's voice, not a genre label),
and 2-5 characters with name, role, and one-line description.

Infer spice level from the idea. Default to 2 when there is no signal.
Write the premise as a premise, not a blurb. No marketing language.
```

### `summary`

```
Summarize this chapter for a story bible. {{max_words}} words.

Record only what a later chapter must know: what changed, who decided what, what
is now true that was not before, and anything a reader would notice if it were
contradicted.

Omit atmosphere, description, and anything already in the CANON block above.
Present tense. No hedging. State facts flat.
```

### `extract`

```
Read this chapter and propose entries for the story bible.

Propose only facts that are now permanently true and are NOT already in the
CANON block above. Skip anything that reads as temporary, or as one scene's mood.

For each: title, type (character | lore | item | rule), body in the bracket
format below, up to 4 keywords, and the sentence from the prose that establishes it.

Format: [Name: attribute, attribute, relation]

Propose nothing rather than pad. Zero proposals is a valid answer.
```

Proposals are never auto-accepted. SPEC.md 8.2.

### `check`

Runs after a passage is selected. Input is the manifest's included canon entries.

```
Below are facts established as canon, then a new passage.

Find statements in the passage that contradict a canon fact. A contradiction means
both cannot be true at once. Not a gap, not an omission, not something merely
unmentioned.

For each: the canon entry id, the exact quote from the passage, and one sentence on
why they cannot both hold.

Report nothing rather than reach. Most passages contradict nothing.

CANON:
{{included_entries}}

PASSAGE:
{{passage}}
```

Flags only. Never rewrites. SPEC.md 8.4.

---

## 6. The test this exists for

Council lens 2: hand-assemble three real contexts — chapter 1, chapter 12, chapter 40 — paste
each into a model, and read the output. That is the first actual test of the one promise, and
it runs before M0.

Check for: does canon reach the prose without being restated as exposition; does the register
line hold at 4 and 5; does the model stop where told; does the depth-3 placement beat putting
the directive at the top (run it both ways and compare).

---

skipped: per-model prompt variants, few-shot examples, a template engine. Add when one model
demonstrably needs different text, not before.
