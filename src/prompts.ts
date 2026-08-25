// Prompt text for the non-prose roles. PROMPTS.md §5 is the source; these are the
// rev-2 wordings the councils asked for.
/** MEASURED (F18): the word count has to read as a CEILING, not a target. "180 words" made the
 *  model pad — a 160-character chapter came back as 1,269 characters of invention — and made it
 *  explain rather than record: "This action confirms his intent to leave permanently." "Under 180
 *  words" plus a ban on interpretation took the mean from 1,155 characters and 5.5 analytical
 *  tells to 181 and 0.5, on the same chapters in one run, and lost no facts. EARLIER carries these
 *  into every later call, so an analytical summary was the most expensive kind of wrong here. */
export const SUMMARY = (maxWords: number) =>
`Summarize this chapter for a story bible. Under ${maxWords} words. Shorter is better; a short
chapter gets a short summary.

Record only what a later chapter must know: what changed, who decided what, what is now
true that was not before, and anything a reader would notice if it were contradicted.

Write what happened, not what it means. Do not interpret, explain, or say what something
indicates, suggests, confirms, establishes or implies. No sentence may begin with "This".
Omit atmosphere and description. Present tense. State facts flat. No hedging.
Output the summary and nothing else.`;

/** JSON schema -> GBNF. llama.cpp constrains the sampler, so malformed output is
 *  impossible rather than retried. Keys are a bounded list; type is an enum of literals
 *  because the converter ignores numeric bounds but honours enums.
 *
 *  Correction, 2026-08-23: `maxLength` on a STRING is honoured — measured, 24 in and exactly
 *  24 out. The note above holds for numeric minimum/maximum, which is where it came from. */
export const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['character', 'lore', 'item', 'rule'] },
          body: { type: 'string' },
          keys: { type: 'array', maxItems: 4, items: { type: 'string' } },
        },
        required: ['title', 'type', 'body', 'keys'],
      },
    },
  },
  required: ['entries'],
} as const;

/** Spark. One structured call from an idea to a skeleton. Nothing is created here — the
 *  writer edits every field before accepting, same discipline as extraction.
 *
 *  SPEC §8.1: a new story starts with a populated ledger, because nobody fills an empty one. */
export const SPARK =
`Turn this idea into a story skeleton.

Return: a title, a premise of two or three sentences, a genre, a setting, a point of view,
a spice level from 1 to 5, one sentence of writing style in the writer's own voice, and
between two and five characters with a name, a role, and a one-line description.

Write the premise as a premise, not a blurb. No marketing language, no rhetorical questions.
Infer the spice level from the idea; use 2 when there is no signal.
The writing style is a description of prose, not a genre label.`;

export const SPARK_SCHEMA = {
  type: 'object',
  properties: {
    title:   { type: 'string' },
    premise: { type: 'string' },
    genre:   { type: 'string' },
    setting: { type: 'string' },
    pov:     { type: 'string' },
    // The GBNF converter ignores numeric minimum/maximum but honours enums, so the range
    // is spelled out as literals rather than stated as bounds it would drop.
    spice:   { type: 'integer', enum: [1, 2, 3, 4, 5] },
    writingStyle: { type: 'string' },
    characters: {
      type: 'array', minItems: 2, maxItems: 5,
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, role: { type: 'string' }, description: { type: 'string' } },
        required: ['name', 'role', 'description'],
      },
    },
  },
  required: ['title', 'premise', 'genre', 'setting', 'pov', 'spice', 'writingStyle', 'characters'],
} as const;

/** The check. Runs on a passage the writer has selected, against the canon entries that
 *  actually reached the prompt for it.
 *
 *  The line about lying and figurative speech is the most important sentence here. The
 *  dominant false-positive class in fiction is in-fiction falsehood: a character who lies,
 *  is mistaken, speaks figuratively, or narrates unreliably is not the book contradicting
 *  itself. Three hand-written versions of this check got that wrong before the model saw it. */
// ponytail: the checker misses numeric contradictions — "two crowns" against canon's eleven, one
// case in twelve (P0-FINDINGS F11). A targeted numeric rule is not worth it against that rate;
// revisit if numbers start mattering in a real book.
export const CHECK =
`Below are facts established as canon. You are given a passage from the same story.

Find statements in the passage that CONTRADICT a canon fact — where both cannot be true at
once. A gap is not a contradiction. An omission is not a contradiction. Something merely
unmentioned is not a contradiction.

A character lying, being wrong, guessing, speaking figuratively, or hoping is NOT a
contradiction. Only the narration commits the story to a fact.

For each real contradiction give the canon id, the exact quote from the passage, one
sentence on why they cannot both hold, and your confidence from 0 to 1.

Report nothing rather than reach. Most passages contradict nothing.`;

/** The repair. A contradiction is the model's mistake, so the model is the one told about it —
 *  before the passage reaches the page, not after it is on it as a red line the writer has to
 *  read and act on.
 *
 *  "Change only those sentences" is the whole prompt. Asked to fix a passage, this model rewrites
 *  it: same events, different prose, and the writer loses the paragraph they were watching arrive
 *  for a two-word factual slip. */
export const MEND =
`You wrote the passage below and it contradicts canon. Each contradiction is given as the
canon fact and the words of yours that break it.

Rewrite the passage so those words agree with canon. Change ONLY the sentences that are
wrong. Every other sentence comes back word for word — same events, same order, same
rhythm, same length. Do not improve anything. Do not add or remove a scene.

Output the corrected passage and nothing else: no preamble, no list of what you changed,
no apology.`;

/** The id list is built per call from the entries that actually reached this prompt, so an
 *  id the model invents is not representable. Small integers rather than uuid literals:
 *  an alternation of forty 32-character strings is a large grammar for one choice. */
export const checkSchema = (n: number) => ({
  type: 'object',
  properties: {
    contradictions: {
      type: 'array', maxItems: 6,
      items: {
        type: 'object',
        properties: {
          canon: { type: 'integer', enum: Array.from({ length: Math.max(n, 1) }, (_, i) => i + 1) },
          quote: { type: 'string' },
          // MEASURED 2026-08-23: maxLength on a string IS enforced by the GBNF converter —
          // 24 became exactly 24 characters and an unbounded field returned 1,437. Without it a
          // reasoning model wrote 3,321 characters of "Let's re-read Canon 2…" into one flag
          // (F18). It truncates mid-word, so it is a backstop: the prompt asks for one sentence
          // and this stops the flood when the prompt is ignored.
          why: { type: 'string', maxLength: 240 },
          confidence: { type: 'number' },
        },
        required: ['canon', 'quote', 'why', 'confidence'],
      },
    },
  },
  required: ['contradictions'],
});

/** Roll a run of chapter summaries into one act. The input is already lossy, so this is a
 *  second compaction and the instruction has to fight for what survives it. */
export const ARC = (from: number, to: number, maxWords: number) =>
`Below are the chapter summaries for chapters ${from} to ${to} of a novel, in order.

Write ONE summary of ${maxWords} words covering all of them, for a story bible.

Keep: what changed, who decided what, what is now true that was not before, and anything a
later chapter would contradict if it got it wrong. Keep names.
Drop: atmosphere, description, and anything that only mattered inside one chapter.

Present tense. State facts flat. Output the summary and nothing else.`;

export const EXTRACT =
`Read this chapter and propose entries for the story bible.

Propose only facts that are now permanently true. Skip anything that reads as temporary,
or as one scene's mood. A character lying or being wrong is not a fact.

For each: title, type (character | lore | item | rule), a body in the bracket format
[Name: attribute, attribute, relation], and up to 4 keywords.

Propose nothing rather than pad. Zero proposals is a valid answer.`;

// ---- Anansi: the conversation ----

/** The chat window. Three kinds of output from one call, and NONE of them lands on its own:
 *  the reply is just talk, a thread waits in the proposals queue, and a directive is handed to
 *  the composer unsent. A conversation that could write the book while you think out loud is the
 *  one thing this must never be. */
export const TALK =
`You are Anansi, talking to the writer about their story. You have their canon, their chapter
summaries and the last few passages above.

Answer what they ask. Be specific and short. Cite what you are drawing on — a character's entry,
a chapter summary, a passage — rather than asserting from nowhere. If the story does not say,
say that it does not say; do not fill the gap with invention and present it as theirs.

You may also offer, when the writer's message calls for it and not otherwise:

- THREADS — entries for the story bible. Only facts that are now permanently true. A character
  lying or being wrong is not a fact. Offer none rather than pad.
- A DIRECTIVE — one prompt the writer could give the writing model to produce the next passage.
  Write it as an instruction about what happens, not as prose. It is a suggestion they will edit;
  do not write the scene yourself.

Offer nothing you were not asked for. A question wants an answer, not a queue of work.`;

export const TALK_SCHEMA = {
  type: 'object',
  properties: {
    // Bounded on purpose. maxLength on a string IS enforced by the GBNF converter — measured
    // 2026-08-23, 24 in and exactly 24 out against 1,437 unbounded.
    reply: { type: 'string', maxLength: 1400 },
    directive: { type: 'string', maxLength: 400 },
    entries: {
      type: 'array', maxItems: 4,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 80 },
          type: { type: 'string', enum: ['character', 'lore', 'item', 'rule'] },
          body: { type: 'string', maxLength: 600 },
          keys: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 40 } },
        },
        required: ['title', 'type', 'body', 'keys'],
      },
    },
  },
  required: ['reply'],
} as const;
