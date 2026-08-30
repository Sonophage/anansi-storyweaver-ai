// The addon slots. Named, never numbered, one list — the same rule `src/blocks.ts` holds for the
// block order, and for the same reason: three incompatible numberings of the blocks once existed
// across two docs, and free-text slot names would let the model write `Motivation` into one card
// and `motivations` into the next in the same book.
//
// `entries.field_editors` (`src/db.ts:215`) already keys per-field provenance by name, so these
// names ARE those keys. Two lists would drift.
//
// PLAN-08 Phase 2. Seth, 2026-08-28: "all these additions outside of the body should be the same
// class as outfits are, i.e. addons, and several can be triggered on at a time for specific ones."
// A card does not have one relationship; it has three, and each wants its own trigger words. A
// field held as one blob can only arrive whole.
//
// `motivations` is deliberately absent. Seth named four slots for a character and it was not one
// of them: `interiority` does that work — and on 2026-08-29 he confirmed it does in practice, so
// this is a settled decision rather than a deferral. #13 carries the exchange.

export type EntryKind = 'character' | 'lore' | 'item' | 'rule';

/** EXCLUSIVE means one at a time, the way an outfit already is — you have one appearance, one
 *  voice, one outfit on. The rest accumulate: three relationships are three rows, each firing on
 *  its own words.
 *
 *  Exclusivity lives in the DATABASE and not on the screen. `outfits_one_active` is a partial
 *  unique index and `wearOutfit` is a transaction; both generalise by adding `slot`. A screen that
 *  merely declines to offer a second one is not a rule, it is a habit. */
export const SLOTS: Record<EntryKind, { name: string; exclusive: boolean }[]> = {
  character: [
    { name: 'facts',         exclusive: true  },
    { name: 'role',          exclusive: true  },
    { name: 'appearance',    exclusive: true  },
    { name: 'outfit',        exclusive: true  },
    { name: 'interiority',   exclusive: false },
    { name: 'relationships', exclusive: false },
    { name: 'voice',         exclusive: true  },
    { name: 'history',       exclusive: false },
  ],
  lore: [
    { name: 'facts',         exclusive: true  },
    { name: 'appearance',    exclusive: true  },
    { name: 'atmosphere',    exclusive: false },
    { name: 'who_is_here',   exclusive: false },
    { name: 'history',       exclusive: false },
  ],
  item: [
    { name: 'facts',         exclusive: true  },
    { name: 'appearance',    exclusive: true  },
    { name: 'provenance',    exclusive: false },
    { name: 'what_it_does',  exclusive: false },
  ],
  rule: [
    { name: 'facts',         exclusive: true  },
    { name: 'scope',         exclusive: false },
    { name: 'consequences',  exclusive: false },
  ],
};

/** WHAT `facts` IS FOR, because it is the one slot whose reason is a defect rather than a subject.
 *
 *  Seth, 2026-08-29: *"the current body gets rewritten at chapter end. theres no place to keep the
 *  characters main facts that doesnt get overwritten."* He is right, and `resolveBody`'s own comment
 *  has said so since it was written: a state REPLACES the base body, and a state that says only
 *  "her arm is broken" silently drops her eye colour, her role and her voice from that chapter
 *  onward — and it reads as the model forgetting rather than as a state being too short.
 *
 *  Rooms were already immune to that: `resolveBody` replaces the body and `rooms()` adds addons on
 *  top of whatever it resolved to, so no chapter-end pass has ever been able to touch one. What was
 *  missing was a room MEANT for the permanent half, so the facts stop being written into the one
 *  place that gets overwritten.
 *
 *  Exclusive on every kind: a card has one set of things that are true about it. `role` is the same
 *  shape and is a character's function in the story — protagonist, employer, handler — which 9% of
 *  the live library writes into the first clause of the body today. `history` reaches characters
 *  now as well as places: 10% of character bodies carry backstory, and only places had a room. */

/** Every slot name in the app, deduplicated. The partial unique index that enforces exclusivity
 *  has to name its slots as a literal list, so `test/db.ts` asserts the index and this agree —
 *  two places holding one truth is the drift this module exists to stop. */
export const ALL_SLOTS = [...new Set(Object.values(SLOTS).flatMap((s) => s.map((x) => x.name)))].sort();

/** The slots that hold one at a time, in the order the index states them. */
export const EXCLUSIVE_SLOTS = [...new Set(Object.values(SLOTS)
  .flatMap((s) => s.filter((x) => x.exclusive).map((x) => x.name)))].sort();

export const slotsFor = (kind: string) => SLOTS[kind as EntryKind] ?? [];
export const isExclusive = (kind: string, slot: string) =>
  !!slotsFor(kind).find((s) => s.name === slot)?.exclusive;
