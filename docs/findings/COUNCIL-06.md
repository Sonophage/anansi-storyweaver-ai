# Council 06 — the default prose prompt, 2026-08-30

Commissioned as: *"get a council of writers, users and ai prompt engineers and present them with
this proposal to change the defaults on the app to make it better and stronger and how its
formatted."*

Five seats: a novelist, a prompt engineer, a working writer-user, measurement, and the engine. Each
was given the **exact current `SYSTEM`, `DEFAULT_VOICE` and the five mode prompts read out of
source**, not a description of them, plus this project's own measured findings. Every claim below
that could be checked against the code was checked before it entered this document.

---

## 0 · Four items in the proposal describe things that are not in the app

Checked before the council sat, because a council briefed on a remembered prompt argues about
nothing:

| Proposal says | Reality |
|---|---|
| "the 14 flat craft bullets" | **19** — 7 under `Rules:`, 12 under `Craft:` |
| REMOVE object inventory lists, *"Track: the phone, the package, the card"* | **No such line exists** anywhere |
| REMOVE prose examples from the voice block, *`Good:` / `Bad:`* | **`DEFAULT_VOICE` has no examples at all.** And `context.ts:614` already wraps the voice sample *"never continue it, quote it, or take facts from it"* |
| REPLACE the canon intro line | **Already in `SYSTEM` near-verbatim.** Only *"If uncertain about a canon fact, write around it rather than inventing"* is new |

So three of the twelve checklist rows are no-ops and one is 90% already shipped.

---

## 1 · The finding that decides most of this: F28 already ran this experiment

**F28**, two arms, 25 generations each, run simultaneously against one router:

| | control | lockout on | Fisher |
|---|---|---|---|
| **acted** — him as subject of a physical verb, in narration | 76% | **25%** | **p = 0.0005** |
| **spoke** — dialogue attributed to him | 20% | **0%** | p = 0.050 |
| **told** — narrator stating what he feels, knows or decides | 24% | 16.7% | **p = 0.73** |

An interiority instruction placed in `DIRECTIVE`, `keep: true`, adjacent to the generation point —
which is precisely the shape three seats recommended for the firewall — **has already been measured
and did nothing.** The same block, the same position, the same phrasing discipline.

The firewall is not identical: F28 measured the **protagonist's** interiority, the firewall targets
**non-POV** characters, and nobody has measured that base rate. But the burden has moved. It is now
on anyone proposing it to show headroom exists first.

---

## 2 · What the council refused, and why

**The tiered MANDATORY / STRONG PREFERENCE / NICE TO HAVE hierarchy — refused, 4 seats.**

The novelist's objection is the one that settles it: look at which lines fall into NICE TO HAVE.
*"One strong image and let it stand."* *"Vary the rhythm. A poetic line earns its place by what
sits still on either side of it."* Those are the only rules in the prompt that produce a **sentence**;
everything in MANDATORY produces **compliance**. The tiering formally tells the model the craft is
optional and the format is not.

The prompt engineer adds the mechanism: with `enable_thinking: false` there is no step at which the
model ranks constraints. The labels are not a resolver, they are more tokens — and attention is a
soft budget, so 25 new lines do not add 25 rules, they devalue the 19 that are there. Every new
`SYSTEM` line is charged against *"A jaw does not clench in this book."*

Measurement adds: it changes ~19 bullets at once, so **no per-item credit is attributable by
construction.**

**The perception filter as a default — refused, 5 seats.** Elias, Mara and The Super are not in this
library; they are another book's cast. `DEFAULT_VOICE` is *copied into every new book*, so this
would ship three strangers' sensory profiles into every story anyone starts. The general rule
already exists — *"Describe only what the viewpoint character can sense."* The specific version is
per-character content and the app already has the field for it: the `interiority` room on the card
(`src/slots.ts:33`). Measurement calls it **unfalsifiable as written** — word-class counts would
measure lexical echo, which is F36's parroting, not perception.

**`<state>` as authoritative — refused, 3 seats.** The engine seat counted what the app can supply:
**one and a half of the six fields.** `stories.pov` is a grammar setting ("second person, present
tense"), not a character. `persona` and `locked_character` are story-level constants. `passages.speaker`
is null on every model-written passage. Location, active objects, time of day and light/sound are
**stored nowhere**. Present-characters is derivable but *wrong* — it would include sticky holds up to
three passages back, whose own comment calls that "a person who has left the room."

A partly-filled state tag under the rule *"the state wins"* promotes a wrong field above the prose.
The writer-user: *"the sentence that would make me turn the feature off."* Measurement adds F36 —
`<state>` is a new **lift surface**: a finished-English line in every prompt is what put a
weather-beaten Martin guitar into the prose, and the contradiction checker cannot see that class.
And it contradicts the proposal's own REMOVE #2.

**Deleting "Never resolve a scene" — refused, 2 seats, on the diagnosis.** The proposal says it makes
the model drag. The novelist and the writer-user independently report the opposite failure: the model
**closes** — a door, a breath, a last line with a cadence, a chapter ending in the middle of a
chapter. Nothing in that line says *keep going*; the stop conditions all live in the mode prompts.
Keep it, and sharpen it from a category to named forms.

**"Never guess the mode from context" / "Do not blend modes" — refused as no-ops.** The app sends the
mode; there is no mode-selection step to instruct, and no detector can fire on "blend".

**Banning `said` at three or more speakers — refused, 2 seats.** *"Said" is invisible; the keyring is
not.* Both writer seats predict a page of jingling keyrings and shifting weight. Kept as a floor
rather than a ban: never two consecutive unattributed lines when three or more are speaking.

---

## 3 · What the council accepted

**The `<mode>` tag — accepted, and for a reason the proposal did not give.** `TAG` in `src/render.ts`
covers 7 of the 11 kinds. **PROSE, DIRECTIVE, TAIL and MODE are untagged.** So the model's last
tokens are novel, novel, novel, then — after one newline, in the same visual register —
*"Carry the scene forward by one small beat."* That is a genuine segmentation failure and it is
worst in `narrate`, which is why `context.ts:888` has to drop MODE entirely there. One line in `TAG`.
Not XML magic: boundary marking, which is the one thing every other block already has.

**The canon-uncertainty clause — accepted.** One line, free, no measurement owed.

**The interiority firewall — accepted in principle, refused as the first ship.** See §1. Measure the
non-POV base rate before writing the rule. If it is already under ~10%, no affordable n resolves a
change and the result is F12's zero-is-not-an-absence.

---

## 4 · The highest-value action, which nobody proposed

**Three of the nine books in the live library do not set `locked_character`.**

F28 measured that switch at **76% → 25% acted** and **20% → 0% spoke**. It is the largest measured
prompt effect in this project, it is already built, already `keep: true` in `DIRECTIVE`, already
F37-shaped — it names the forbidden forms rather than the category:

> `[{name} belongs to the writer: never write their dialogue, action, gesture or thought, and never
> state what they feel, know or decide. Write the world's answer instead — what the others say and
> do, what the room does, what happens to {name}. Stop where {name} would act.]`

The writer-user's single most common rewrite is *"the model writes my character."* On six of nine
books that is already prevented. On three it is not, and no amount of new `SYSTEM` text would fix
it. **This is an onboarding gap wearing a prompt problem's clothes.**

---

## 5 · The order

0. **Set `locked_character` on the three books that lack it.** Zero code. Largest measured effect
   available.
1. **`<mode>` in `TAG`, and the canon-uncertainty clause.** Free text. Ship, claim nothing —
   F29 already has the mode checklist at 10/10, so there is no headroom to demonstrate.
2. **One base-rate run, n = 60, no prompt change**, on a three-character fixture, scoring four
   counters at once: non-POV interior assertions, `said`-tagged share at 3+ speakers, scene-closing
   beats, and object continuity. This measures **headroom, not effect.** Any counter with under ~10
   points of room is dead on arrival.
3. **Only survivors earn an A/B.** Two arms simultaneous (`bench/ab.ts`), n = 100 per arm,
   pre-registered, no peek-and-stop.

---

## 6 · Detector rules, before anyone believes a number

Named by the measurement seat and checked against source:

- **`narrationOnly` strips only `"` and `“”`.** Single-quote and em-dash dialogue survive it, and
  every such line then reads as narration. Either add a case asserting a `'`-quoted book scores
  clean, or scope the fixture and record the ceiling. This is F37's U+2019 trap again.
- **`DEFAULT_VOICE` is second person, present tense.** Every POV detector anchored on `he|she`
  is wrong out of the box for the shipped voice. Anchor on names; every rate is a **floor**; say so.
- **The guess frame must NOT flag.** *"She looked like a woman who had rehearsed this"* is what the
  rule permits. If the detector flags it, the rule is unmeasurable, because its entire permission
  set is the guess.
- **Auxiliaries must flag.** *"The Super had decided hours ago."* F21's detector missed exactly this
  shape until a case caught it.
- **Never compare a new interiority number to F21's 82.5%.** F28 forbids it: different fixture,
  different scene, and F21 counted pronouns.
- **Score crowd attribution raw, not through `narrationOnly`** — the strip eats the quoted span and
  leaves the tag behind.

---

## 7 · Cost, honestly split

**Free, text only:** the `<mode>` tag, the canon clause, sharpening "Never resolve", crowd
attribution as a floor.
**Free of code, costs writer effort:** the perception filter, as a line in a character's
`interiority` room.
**Needs a number in the same diff:** any new `keep: true` part in `DIRECTIVE` requires
`CAPS.DIRECTIVE` to rise from 250 — `context.ts:554` already records a 274-against-250 overrun being
reported as a successful trim, and F28's lockout has already spent ~78 tokens there.
**New machinery, refused for now:** `<state>`, cross-character object permanence, per-passage POV.
A book with two POV characters alternating by scene is **unrepresentable today** — that is a column
and a control, not a wording change.

---

**What nobody is entitled to claim after this**, on the evidence that would exist: that the prose
"reads better"; that the firewall *fixed* anything, rather than *"under X%"*; or any per-item credit
if the tier rewrite ships alongside anything else.
