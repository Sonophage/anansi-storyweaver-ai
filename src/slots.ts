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

export type EntryKind = 'character' | 'place' | 'lore' | 'item' | 'tale';

/** EXCLUSIVE means one at a time, the way an outfit already is — you have one appearance, one
 *  voice, one outfit on. The rest accumulate: three relationships are three rows, each firing on
 *  its own words.
 *
 *  Exclusivity lives in the DATABASE and not on the screen. `addons_one_active` is a partial
 *  unique index on (entry_id, slot) and `wearOutfit` is a transaction. A screen that
 *  merely declines to offer a second one is not a rule, it is a habit. */
export const SLOTS: Record<EntryKind, { name: string; exclusive: boolean }[]> = {
  character: [
    { name: 'facts',         exclusive: true  },
    { name: 'appearance',    exclusive: true  },
    { name: 'outfit',        exclusive: true  },
    { name: 'interiority',   exclusive: false },
    { name: 'relationships', exclusive: false },
    { name: 'voice',         exclusive: true  },
  ],
  // #80. A place is its own kind, sorted out of Lore by the writer (never by guessing: "the Watch"
  // is not a place). The pockets are a place's half of what Lore had.
  place: [
    { name: 'facts',         exclusive: true  },
    { name: 'appearance',    exclusive: true  },
    { name: 'atmosphere',    exclusive: false },
    { name: 'who_is_here',   exclusive: false },
  ],
  lore: [
    { name: 'facts',         exclusive: true  },
    { name: 'appearance',    exclusive: true  },
    { name: 'atmosphere',    exclusive: false },
    { name: 'who_is_here',   exclusive: false },
  ],
  item: [
    { name: 'facts',         exclusive: true  },
    { name: 'appearance',    exclusive: true  },
    { name: 'what_it_does',  exclusive: false },
  ],
  // `rule` was a kind until 2026-10-29: a rule is a pocket of the tale's own thread now (ADR 0005,
  // `db.rulesToPockets`), and its `consequences` went into the rule's text.
  // #127 · ADR 0011. THE TALE'S OWN THREAD (#125), one per tale, made by the code and never by the
  // writer, so it is not in `KINDS`. Its Always true is the setting; its strings are its pockets: a
  // promise (set up to pay off) or an open question (kept open). On is in play and sent.
  tale: [
    { name: 'facts',         exclusive: true  },
    { name: 'promise',       exclusive: false },
    { name: 'question',      exclusive: false },
  ],
};

/** #77 · THE POCKETS THAT ARE POCKETS NO MORE (ADR 0005, the 2026-10-26 grill). Role, provenance and
 *  scope are what a thread IS, so they join Always true. History is what has happened to it, so it
 *  joins Over time: the thread's own text, where it stands from scene 1. Each is appended under its
 *  label. A list because the update and a pasted or pulled card both fold them, and must agree. */
export const FOLDED = ['history', 'provenance', 'role', 'scope'];
/** Of those, the one that goes to Over time rather than Always true. */
export const TO_OVER_TIME = ['history'];
/** One folded pocket as a line of Always true: `[Role: the one Aldis owes]`. The writer's own name
 *  for it wins over the slot's, unless it only repeats the slot or the thread's title. */
export const foldLine = (slot: string, name: string, body: string, title: string) => {
  const raw = String(body ?? '').trim();
  const inner = raw.startsWith('[') && raw.indexOf(']') === raw.length - 1 ? raw.slice(1, -1).trim() : raw;
  const own = String(name ?? '').trim();
  const label = own && own.toLowerCase() !== slot && own.toLowerCase() !== String(title).trim().toLowerCase()
    ? own : slot[0].toUpperCase() + slot.slice(1);
  return `[${label}: ${inner}]`;
};

/** #110 · THE NAMES A STORED DESCRIPTION MAY CARRY IN FRONT, the old card format's label: the thread's
 *  name, the pocket's own name and its kind, and the outfit's and Always true's old words. One list,
 *  for the floor that stores a description (`db.upsertAddon`, the update) and the prompt that frames
 *  one (`context.ts`), so the two take off the same names. */
export const wrapperNames = (slot: string, title: string, label = ''): string[] => [title, label, slot,
  slot.replace(/_/g, ' '), ...(slot === 'outfit' ? ['wearing', 'wears'] : []),
  ...(slot === 'facts' ? ['always true'] : [])];

/** #109, #110 · A DESCRIPTION WITH THE OLD WRAPPER TAKEN OFF (ADR 0008). Pockets and Always trues were
 *  written as `[Aldis Fen: …]`, `[wearing: …]` or `[short sentences; …]`, and a model asked for that
 *  form sometimes doubled the name (`[Leyndell: Leyndell: …]`). The writer sees and types only the
 *  description, and the code frames it for the model, so the wrapper is taken off where a pocket is
 *  stored and again where it is framed: this one rule, so the two cannot disagree.
 *
 *  A LINE IS UNWRAPPED ONLY WHEN THE BRACKETS ACTUALLY PAIR AS AN OUTER WRAPPER, which is what the
 *  `indexOf` asks: the first `]` has to be the last character. `[a] and [b]` has its first `]` in the
 *  middle, so a greedy `^\[(.*)\]$` would eat it into `a] and [b`, a body corrupted silently. Line by
 *  line, because a folded pocket (`foldLine`) is a second bracketed line under its label.
 *  A LEADING `Name:` goes only when it is one of `names` (`wrapperNames`), and as often as it is
 *  repeated: from inside a wrapper on any line, and with no wrapper on the first line only, where a
 *  model puts the name it was told to put in front. A label the writer chose, like `Role:`, stays;
 *  so does a name further down, where it may be a speaker in a sample line.
 *  Every other line is kept exactly as written, blank lines too. Repeated until nothing changes, so
 *  a second pass over its own answer changes nothing (the update relies on that). */
export const plain = (body: unknown, names: string[]): string => {
  const known = new Set(names.map((n) => String(n ?? '').trim().toLowerCase()).filter(Boolean));
  const strip = (s: string) => {
    for (let c = s.indexOf(':'); c > 0 && known.has(s.slice(0, c).trim().toLowerCase()); c = s.indexOf(':'))
      s = s.slice(c + 1).trim();
    return s;
  };
  const once = (text: string) => {
    const lines = text.split('\n');
    const first = lines.findIndex((l) => l.trim());
    return lines.map((l, i) => {
      const line = l.trim();
      if (line.startsWith('[') && line.indexOf(']') === line.length - 1) return strip(line.slice(1, -1).trim());
      if (i !== first) return l;
      const out = strip(line);
      return out === line ? l : out;
    }).join('\n').trim();
  };
  let text = String(body ?? '').trim();
  for (let i = 0; i < 8; i++) { const next = once(text); if (next === text) break; text = next; }
  return text;
};

/** Genre, normalised to a comma-separated list. Here beside `plain` for the same reason: it is how a
 *  value is STORED, and Talk's change slice (`src/changes.ts`) must check and remember a genre as
 *  `db.updateStory` will store it, or its Undo never matches what is there.
 *
 *  The shelf splits this on commas and draws one pill per tag, so a genre that arrives as
 *  "noir / gothic and horror" became one long pill. Applied on the way IN — on create and on every
 *  save, so an old row is fixed the next time its story is touched — because normalising on the way
 *  out would mean every reader had to remember to do it.
 *
 *  Splits on commas, semicolons, slashes and a standalone "and". NOT on spaces: "dark fantasy" is
 *  one genre, and a space-splitter turns it into two. */
export const tidyGenre = (g?: string | null): string =>
  [...new Map(String(g ?? '').split(/[,;/]|\band\b/i).map((t) => t.trim()).filter(Boolean)
    .map((t) => [t.toLowerCase(), t])).values()].join(', ');

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
 *  Exclusive on every kind: a card has one set of things that are true about it. On screen it is
 *  Always true (#77), and it is not a pocket: `context.alwaysTrue` reads it first and always. */

/** #80 · THE KINDS OF THREAD, in the order the screens list them. The one list: every schema enum,
 *  prompt and screen list of kinds is this, or is checked against it. #127 · Not `tale`: the tale's
 *  thread is made by the code, one per tale, and no writer or model makes one. */
export const KINDS = (Object.keys(SLOTS) as EntryKind[]).filter((k) => k !== 'tale');

/** Every slot name a thread of the writer's can hold, deduplicated. The partial unique index that
 *  enforces exclusivity has to name its slots as a literal list, so `test/db.ts` asserts the index
 *  and this agree — two places holding one truth is the drift this module exists to stop.
 *  #127 · Not the tale's strings (`STRING_SLOTS`): this list is what Talk, the finders and Write one
 *  for me may offer a thread, and a promise on a character is not a thing. */
export const ALL_SLOTS = [...new Set(KINDS.flatMap((k) => SLOTS[k].map((x) => x.name)))].sort();

/** #127 · ADR 0011. THE KINDS OF STRING, which only the tale's thread holds: its pockets in `SLOTS`
 *  less its Always true. `db.upsertAddon` refuses them on any other thread. */
export const STRING_SLOTS = SLOTS.tale.map((x) => x.name).filter((n) => n !== 'facts');

/** The slots that hold one at a time, in the order the index states them. */
export const EXCLUSIVE_SLOTS = [...new Set(Object.values(SLOTS)
  .flatMap((s) => s.filter((x) => x.exclusive).map((x) => x.name)))].sort();

export const slotsFor = (kind: string) => SLOTS[kind as EntryKind] ?? [];
