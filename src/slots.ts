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
// of them: `interiority` does that work.

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
    { name: 'appearance',    exclusive: true  },
    { name: 'outfit',        exclusive: true  },
    { name: 'interiority',   exclusive: false },
    { name: 'relationships', exclusive: false },
    { name: 'voice',         exclusive: true  },
  ],
  lore: [
    { name: 'appearance',    exclusive: true  },
    { name: 'atmosphere',    exclusive: false },
    { name: 'who_is_here',   exclusive: false },
    { name: 'history',       exclusive: false },
  ],
  item: [
    { name: 'appearance',    exclusive: true  },
    { name: 'provenance',    exclusive: false },
    { name: 'what_it_does',  exclusive: false },
  ],
  rule: [
    { name: 'scope',         exclusive: false },
    { name: 'consequences',  exclusive: false },
  ],
};

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
