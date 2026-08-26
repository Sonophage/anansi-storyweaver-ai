// The prompt is rendered ONLY from manifest.blocks. There is no template string
// anywhere. That is what stops PROMPTS' placement becoming a second source of
// ordering truth that the budget engine would later have to reconcile.

import type { Manifest, Entry } from './context.ts';
import type { Kind } from './blocks.ts';

// Delimiters are tags, not Markdown headers: `#` collides with Markdown prose storage
// and invites the model to continue the document with "## Chapter 13".
const TAG: Partial<Record<Kind, string>> = {
  SPINE: 'story', VOICE: 'voice', 'CANON-ALWAYS': 'canon', 'CANON-TRIGGERED': 'canon',
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
- Match the established voice. Do not escalate register on your own.
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
