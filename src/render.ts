// The prompt is rendered ONLY from manifest.blocks. There is no template string
// anywhere. That is what stops PROMPTS' placement becoming a second source of
// ordering truth that the budget engine would later have to reconcile.

import type { Manifest, Entry } from './context.ts';
import type { Kind } from './blocks.ts';

// Delimiters are tags, not Markdown headers: `#` collides with Markdown prose storage
// and invites the model to continue the document with "## Chapter 13".
const TAG: Partial<Record<Kind, string>> = {
  SPINE: 'story', VOICE: 'voice', STYLE: 'style', 'CANON-ALWAYS': 'canon', 'CANON-TRIGGERED': 'canon',
  STRING: 'unpaid', EARLIER: 'earlier',
};

/** THE SYSTEM MESSAGE, and it really is one. #18 §4: this used to say `/completion` has no system
 *  role and that PROMPTS §1 was written for a transport the design does not use. Both halves went
 *  stale — `src/llama.ts` posts to `/v1/chat/completions` with a real `{ role: 'system' }` on every
 *  path, so PROMPTS §1 describes what happens and this note described what used to.
 *
 *  The arbitration rule keys on provenance. PLAN-02 inverted it globally to "the prose
 *  wins", which lets a chapter-30 hallucination outrank a hand-pinned fact — the exact
 *  thing "pin it once and it's still canon at chapter 50" exists to prevent. */
/** COUNCIL-06 ship 2 · "Match the established voice. Do not escalate register on your own." was a
 *  bullet here until 2026-08-30. Removed on F37's evidence rather than on taste: its control arm
 *  measured 98.0% against 98.0%, and the finding's own conclusion is that the model *was never
 *  overriding the voice field; it was following it exactly*. The line guarded a failure that does
 *  not occur.
 *
 *  It is the only deletion COUNCIL-06 made with a number behind it. Every other bullet below has
 *  never been measured, and most predate every finding in P0-FINDINGS — which is worth knowing
 *  before anyone deletes a second one on the strength of reading it. */
/** COUNCIL-06 ship 5 · Seth's craft block, merged rather than appended, 2026-08-30. 18 bullets to
 *  23, 430 tokens to 551, and grouped under four headings — the grouping is topical and NOT the
 *  MANDATORY / STRONG PREFERENCE / NICE TO HAVE tiering the council refused 4-1. The objection
 *  that settled that: the only two rules in here that produce a *sentence* rather than compliance
 *  ("One strong image and let it stand", "Vary the rhythm") both land in the bottom tier, so the
 *  labels would formally tell the model the craft is optional and the format is not. With
 *  `enable_thinking: false` there is no step at which the model ranks constraints anyway.
 *
 *  Nine of the block's 25 lines restated a bullet already here, several with drift — "Suggest
 *  rather than explain" against "Suggest rather than state", and so on. The merge took ONE version
 *  of each, never a third phrasing blending both, so a later regression is attributable to a line
 *  somebody actually wrote. `test/db.ts` fails if the other version comes back.
 *
 *  Two more were already in `DEFAULT_VOICE` — anchoring the scene in sensation, and unfolding
 *  through ritual, risk and desire — and stayed there. A rule in both places is a rule the writer
 *  cannot switch off: they delete it from the voice, it keeps arriving from here, and the field
 *  stops meaning anything. That is the second half of the same check.
 *
 *  Six were left out, each with a reason, pinned in `test/db.ts`. One of them was already shipping
 *  and is now gone: "Begin in action or sensation, never in exposition." It is a SCENE-OPENING
 *  rule and Anansi's unit is a mid-scene beat, so it fired on every call — and it contradicts the
 *  narrate mode prompt, which tells the model to pick up mid-thought. Two standing instructions
 *  pointing opposite ways.
 *
 *  NOTHING HERE IS MEASURED. This changes ~10 lines at once, so no per-item credit is attributable
 *  by construction, and the honest claim after it is that the prompt says what the writer wanted it
 *  to say — not that the prose reads better. */
export const SYSTEM = `You are a prose engine for a novel. You write the next passage and nothing else.

Rules:
- Output prose only. No preamble, no commentary, no headings, no meta-text.
- Continue from the last sentence. Never summarize, recap, or rewind.
- If the input ends mid-sentence, continue seamlessly. Pick up mid-thought.
- Never resolve a scene the writer has not asked you to resolve.
- Facts in the canon section are true. Write as though the reader already knows
  them; never restate them as exposition.
- Where the prose and the canon disagree, the canon wins and you write to it. If a fact has
  changed, the writer will change the canon.
- Canon is what is TRUE, never how to say it. Do not reuse its wording. A ledger body is a note to
  you, not a line of the book, and a phrase carried out of it whole is the one thing that makes the
  prose read as assembled. Its facts, your sentences.
- Maintain object permanence. Objects do not teleport. Reintroduce through action, not inventory.

Craft:
- Describe only what the viewpoint character can sense.
- Show interior state through speech, posture, breath, or action. Never name the emotion.
- Posture, breath and tone over facial cues. A jaw does not clench in this book.
- Suggest rather than explain. Silence and implication carry equal weight to the sentence.
- Let lore arrive through action, dialogue and consequence. Never explain the world; the reader is
  already in it.
- New characters are strangers unless the canon says otherwise.
- Failure, pain, death, and consequence are allowed. Do not protect anyone the scene does not protect.
- Treat intimacy, violence and dread with gravity — never with a wink, never with a flinch.
- Never break the frame. No meta-commentary on the story, the writing, or the reader.

Sentence and image:
- One strong image and let it stand. Stacking them costs both.
- Precise, sensory language. No cliche, and no phrase you have written before in this passage.
- Vary the rhythm. A poetic line earns its place by what sits still on either side of it.
- Balance motion and pause. Tension lives in breath, hesitation, and the space between gestures.

Dialogue:
- Sparse and functional. Dialogue breaks on ambient noise or on the gaps between speakers.
- Let speakers go unfinished. Thoughts trail; sentences stop mid-breath.
`;

// F9 is retired, not fixed by design: dropping the title was measured at n=30 per arm and made
// no difference, and the failure it described did not occur once in sixty generations (F12). The
// likely cause was an arbitration clause that keyed on a [pinned] tag every entry carried. If
// canon drift returns, bench/compliance.ts is the harness and that clause is the first suspect.
export function render(m: Manifest): string {
  const parts: string[] = [SYSTEM];
  let open: string | null = null;
  for (const b of m.blocks) {
    if (b.state !== 'included') continue;
    const tag = TAG[b.kind] ?? null;
    if (open !== tag) {
      if (open) parts.push(`</${open}>`);
      if (tag) parts.push(`<${tag}>`);
      open = tag;
    }
    parts.push(b.text);
  }
  if (open) parts.push(`</${open}>`);
  return parts.join('\n') + '\n';
}

/** The body as it reaches the prompt. Provenance is not marked any more: `last_editor`
 *  defaulted to human for spark characters, accepted proposals and hand edits alike, so
 *  every entry carried [pinned] and the tag distinguished nothing. Provenance still decides
 *  which extraction proposals are conflicts — that is where it does real work. */
export function entryText(e: Entry): string {
  // The worn outfit is NOT appended here. It used to be, and that put it before `resolveBody`,
  // which returns the state's body wholesale when one is in force — so a character with both a
  // wardrobe and an "over time" state wrote naked from the chapter the state opened, silently,
  // while the Threads panel still said "worn". It is applied in context.ts after resolution now.
  return e.body;
}
