// The block order. Named, never numbered — COUNCIL-02 found three incompatible
// numberings across SPEC 7.3 and PROMPTS 2. There is one order and it has no integers.
//
// Blocks are PER ENTRY; `kind` is an attribute, not the block. COUNCIL-03 S(backend):
// the trim ladder produces partial entries, which need a per-entry block to live in.
// If canon renders as one concatenated block, P6 re-granularizes the renderer.

export type Kind =
  | 'SPINE' | 'CANON-ALWAYS' | 'CANON-TRIGGERED' | 'LORE' | 'RECALL'
  | 'EARLIER' | 'PROSE' | 'DIRECTIVE' | 'TAIL' | 'MODE';

export const ORDER: Kind[] = [
  'SPINE', 'CANON-ALWAYS', 'CANON-TRIGGERED', 'LORE', 'RECALL',
  'EARLIER', 'PROSE', 'DIRECTIVE', 'TAIL', 'MODE',
];

// Anchors are never trimmed and are capped at write time (SPEC 7.3).
export const CAPS: Partial<Record<Kind, number>> = { SPINE: 400, DIRECTIVE: 250 };

// EARLIER is the one block that grows monotonically with book length.
// PLAN-02 put it outside the 45% canon cap, which left the only unbounded block
// with no ceiling (COUNCIL-03 K5). It gets its own.
export const EARLIER_CEILING_FRAC = 0.25;

// Canon proper. EARLIER is deliberately NOT in this set; it has its own ceiling above.
export const CANON_KINDS: Kind[] = ['CANON-ALWAYS', 'CANON-TRIGGERED', 'LORE', 'RECALL'];
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
