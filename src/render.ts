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

/** Sent first in the raw completion buffer. `/completion` has no system role, so this
 *  is simply the opening text — PROMPTS §1's "sent as the system message" was written
 *  for a transport this design does not use.
 *
 *  The arbitration rule keys on provenance. PLAN-02 inverted it globally to "the prose
 *  wins", which lets a chapter-30 hallucination outrank a hand-pinned fact — the exact
 *  thing "pin it once and it's still canon at chapter 50" exists to prevent. */
export const SYSTEM = `You are a prose engine for a novel. You write the next passage and nothing else.

Rules:
- Output prose only. No preamble, no commentary, no headings, no meta-text.
- Continue from what came before. Never summarize it.
- Never resolve a scene the writer has not asked you to resolve.
- Facts in the canon section are true. Write as though the reader already knows
  them; never restate them as exposition.
- Where the prose and the canon disagree, the canon wins and you write to it. If a fact has
  changed, the writer will change the canon.
- Canon is what is TRUE, never how to say it. Do not reuse its wording. A ledger body is a note to
  you, not a line of the book, and a phrase carried out of it whole is the one thing that makes the
  prose read as assembled. Its facts, your sentences.
- Match the established voice. Do not escalate register on your own.

Craft:
- Begin in action or sensation, never in exposition.
- Describe only what the viewpoint character can sense. Show an interior state through speech,
  posture or action, never by naming it.
- Posture, breath and tone over facial cues. A jaw does not clench in this book.
- One strong image and let it stand. Stacking them costs both.
- Vary the rhythm. A poetic line earns its place by what sits still on either side of it.
- Let lore arrive through action, dialogue and consequence. Never explain the world; the reader is
  already in it.
- Suggest rather than state. Silence and implication carry as much as the sentence does.
- New characters are strangers unless the canon says otherwise.
- Failure, pain and consequence are allowed. Do not protect anyone the scene does not protect.
- Precise, sensory language. No cliche, and no phrase you have written before in this passage.
- Treat intimacy, violence and dread with gravity — never with a wink, never with a flinch.
- Never break the frame.
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
