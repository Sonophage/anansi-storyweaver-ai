// The block order. Named, never numbered — COUNCIL-02 found three incompatible
// numberings across SPEC 7.3 and PROMPTS 2. There is one order and it has no integers.
//
// Blocks are PER ENTRY; `kind` is an attribute, not the block. COUNCIL-03 S(backend):
// the trim ladder produces partial entries, which need a per-entry block to live in.
// If canon renders as one concatenated block, P6 re-granularizes the renderer.

export type Kind =
  | 'SPINE' | 'VOICE' | 'STYLE' | 'CANON-ALWAYS' | 'CANON-TRIGGERED' | 'STRING'
  | 'EARLIER' | 'PROSE' | 'DIRECTIVE' | 'TAIL' | 'MODE';

// LORE and RECALL were declared here, ordered, tagged and ranked for eviction, and nothing ever
// added a block of either kind — lore entries render as CANON-* by their activation. They were the
// reserved seats for PLAN-02 P5's memory collect-versus-inject, which needs vector recall, which
// needs pgvector, which needs the Postgres port. Add them back with the code that fills them; the
// eviction sort below ranks by CANON_KINDS index, so re-inserting them changes nothing else.
// VOICE sits high, next to SPINE, and deliberately far from TAIL: it is the only block holding
// prose that is NOT this story, and a long sample next to the sentence being continued is a
// sample the model continues instead.
// STRING sits with canon rather than near the end, and only SUMMONED strings ever get here. A
// string is a promise the story has made and not paid — the letter unopened in chapter 6 — and it
// is writer-facing by default precisely because a model told about an unresolved promise tends to
// resolve it, which is the writer's move. Summoning one is the writer saying "this is in play now".
// STYLE sits under VOICE and is not part of it — #18. VOICE is the universal register, this is
// the book's genre flavour, and folding them would put them in competition for VOICE's 500 tokens.
// That is COUNCIL-04 #5 exactly: the writing sample was a `keep: false` part of DIRECTIVE under a
// cap it shared with point of view and the register, so the app's own hint guaranteed it was cut
// first. It is not DIRECTIVE either — every part of that block is `keep: true`, so it cannot trim
// and can only refuse.
export const ORDER: Kind[] = [
  'SPINE', 'VOICE', 'STYLE', 'CANON-ALWAYS', 'CANON-TRIGGERED', 'STRING',
  'EARLIER', 'PROSE', 'DIRECTIVE', 'TAIL', 'MODE',
];
// CANON-REPEAT lived here between DIRECTIVE and TAIL from F15 until F20 measured it at 850
// generations per arm and found nothing: -0.02 points on contradictions, +0.24 on the silver
// rate, and a hint of the exposition cost it was placed to avoid. Deleted rather than left
// switched off — a 145-token block on every call needs a reason, and it has none.

// Anchors are never trimmed and are capped at write time (SPEC 7.3).
// VOICE was a `keep: false` part of DIRECTIVE under a 250-token cap shared with point of view,
// the chapter's ending and the register — so the app's own hint ("paste a few hundred words")
// guaranteed the sample was cut, and cut first. COUNCIL-04 #5. 500 tokens holds ~370 words.
// SPINE went 400 -> 1000 on 2026-08-30. Not a preference: at 400 it was AMPUTATING a live book on
// every call. `The Geometry of Absence` assembles a spine of ~716 tokens — a 1,481-character premise
// and a 1,032-character setting — and the block reported `anchor shortened to 400 tokens`, cutting
// its setting off mid-sentence at "floor-to-ceiling glass…". 1000 holds the whole of it, and no
// other book in the library is within 400 of the new ceiling.
//
// The cap is a fraction of a 45,700-token budget either way. What it was really doing was deciding
// which half of a book's own description survived, which is not a thing a number should decide
// quietly.
export const CAPS: Partial<Record<Kind, number>> = { SPINE: 1000, DIRECTIVE: 250, VOICE: 500, STYLE: 200 };

// EARLIER is the one block that grows monotonically with book length.
// PLAN-02 put it outside the 45% canon cap, which left the only unbounded block
// with no ceiling (COUNCIL-03 K5). It gets its own.
export const EARLIER_CEILING_FRAC = 0.25;

// Recent prose gets a ceiling too, so pulling an old chapter back trades against the recent
// window instead of overflowing. SPEC §7.3 gives layer 6 a 75% ceiling and a 30% floor; TAIL
// is never evicted, because it is the sentence the model has to continue from.
export const PROSE_CEILING_FRAC = 0.6;

// Canon proper. EARLIER is deliberately NOT in this set; it has its own ceiling above.
export const CANON_KINDS: Kind[] = ['CANON-ALWAYS', 'CANON-TRIGGERED'];
export const CANON_CAP_FRAC = 0.45;

export interface Block {
  kind: Kind;
  id: string;          // entry id, chapter id, passage id, or a literal name
  text: string;
  tokens: number;
  state: 'included' | 'omitted';   // 'partial' arrives with the trim ladder at P6
  reason: string;
  firedBy?: string[];
}
