// The block order. Named, never numbered — COUNCIL-02 found three incompatible
// numberings across SPEC 7.3 and PROMPTS 2. There is one order and it has no integers.
//
// Blocks are PER ENTRY; `kind` is an attribute, not the block. COUNCIL-03 S(backend):
// the trim ladder produces partial entries, which need a per-entry block to live in.
// If canon renders as one concatenated block, P6 re-granularizes the renderer.

export type Kind =
  | 'SPINE' | 'VOICE' | 'CANON-ALWAYS' | 'CANON-TRIGGERED'
  | 'EARLIER' | 'PROSE' | 'DIRECTIVE' | 'TAIL' | 'MODE';

// LORE and RECALL were declared here, ordered, tagged and ranked for eviction, and nothing ever
// added a block of either kind — lore entries render as CANON-* by their activation. They were the
// reserved seats for PLAN-02 P5's memory collect-versus-inject, which needs vector recall, which
// needs pgvector, which needs the Postgres port. Add them back with the code that fills them; the
// eviction sort below ranks by CANON_KINDS index, so re-inserting them changes nothing else.
// VOICE sits high, next to SPINE, and deliberately far from TAIL: it is the only block holding
// prose that is NOT this story, and a long sample next to the sentence being continued is a
// sample the model continues instead.
export const ORDER: Kind[] = [
  'SPINE', 'VOICE', 'CANON-ALWAYS', 'CANON-TRIGGERED',
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
export const CAPS: Partial<Record<Kind, number>> = { SPINE: 400, DIRECTIVE: 250, VOICE: 500 };

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
