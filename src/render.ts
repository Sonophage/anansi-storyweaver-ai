// The prompt is rendered ONLY from manifest.blocks. There is no template string
// anywhere. That is what stops PROMPTS' placement becoming a second source of
// ordering truth that the budget engine would later have to reconcile.

import type { Manifest, Entry } from './context.ts';
import type { Kind } from './blocks.ts';

// Delimiters are tags, not Markdown headers: `#` collides with Markdown prose storage
// and invites the model to continue the document with "## Chapter 13".
// COUNCIL-06 · MODE IS FENCED, and PROSE, DIRECTIVE and TAIL are still not. The council accepted
// one line here and the reason is boundary marking, not XML: this covered 7 of the 11 kinds, so
// the prompt ended with the sentence the model has to continue and then, one newline later and in
// the same visual register, an order — novel, novel, novel, "Carry the scene forward by one small
// beat." Every other block in the stack already says where it stops.
//
// The other three stay bare on purpose. TAIL is the prose being continued from and PROSE is the
// document; a fence around either puts the continuation surface inside a marked-up region, which
// is a change to what the model is imitating, not a boundary. DIRECTIVE sits between them and its
// parts already arrive in [square brackets], which is its own marking.
//
// NOTHING IS CLAIMED FOR THIS. F29 has the mode checklist at 10/10 — there is no headroom to
// demonstrate and no measurement is owed.
const TAG: Partial<Record<Kind, string>> = {
  SPINE: 'story', VOICE: 'voice', STYLE: 'style', 'CANON-ALWAYS': 'canon', 'CANON-TRIGGERED': 'canon',
  STRING: 'unpaid', EARLIER: 'earlier', MODE: 'mode',
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
/** COUNCIL-06 ship 5 · THE CRAFT IS NOT IN HERE ANY MORE, and that is the point of the ship.
 *
 *  Twelve craft bullets lived here until 2026-08-30 and are now in `DEFAULT_VOICE`, merged with
 *  the craft block Seth sent. His reason, and it is the better one: *"it's default for a reason so
 *  it can be overridden."* A rule in SYSTEM is a rule no writer can delete — they clear the line
 *  out of the voice field, it keeps arriving from here, and the field stops meaning anything. A
 *  rule in the voice is theirs. 430 tokens to 235.
 *
 *  So the division is: SYSTEM is the contract, the voice is the craft. Output format, canon
 *  arbitration, object permanence and the frame stay here, because a writer who replaces their
 *  voice wholesale must not thereby switch off "output prose only" or "the canon wins". Everything
 *  about how the prose READS is theirs to change.
 *
 *  That division is checked in `test/db.ts`, both ways, and so is the five-word overlap between
 *  the two blocks — a rule said in both places is the un-deletable case wearing a disguise.
 *
 *  This was shipped the other way round first, in 8951779, on the argument that SYSTEM reaches all
 *  nine books and `DEFAULT_VOICE` only reaches new ones. That was true and it was answered by hand
 *  rather than by architecture: the seven books with their own voice were backfilled, the two with
 *  an empty one take the house voice at runtime.
 *
 *  NOTHING HERE IS MEASURED. The honest claim is that the prompt says what the writer wanted it to
 *  say and that he can now change it — not that the prose reads better. */
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
- If uncertain about a canon fact, write around it rather than inventing one.
- New characters are strangers unless the canon says otherwise.
- Maintain object permanence. Objects do not teleport. Reintroduce through action, not inventory.
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
