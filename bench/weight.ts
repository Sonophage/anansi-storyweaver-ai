// Weight: what canon costs now that a card has rooms, measured against the ceiling it has to fit in.
//
// PLAN-08 Phase 3's second debt, and the plan states it as a warning rather than a number: "one
// entry is one block plus N addons, and N is unbounded because plural slots accumulate. COUNCIL-04
// #7 was 46 entries firing at once; this is the same failure with a finer grain." `CANON_CAP_FRAC`
// is 45% of the budget and whether that is enough is a measurement, not an opinion.
//
//   node --experimental-strip-types bench/weight.ts check   # the detector, no db, no model
//   node --experimental-strip-types bench/weight.ts         # the report, against a COPY of the db
//
// THE THIRD BENCH, and the reason it is not folded into `bench/fires.ts`: that file's whole promise
// is that it opens the database read-only, and this one has to go through `src/story.ts` to get an
// honest number — which imports `src/db.ts`, which opens the file WRITABLE and runs `migrate()` at
// module load. So this copies the database to /tmp first and points `ANANSI_DB` at the copy. Seth's
// book is never opened by this tool. The copy is also why the numbers are a snapshot: a generation
// running in another process will not be in them.
//
// WHY THE REAL PATH AND NOT A HAND-MAPPED ONE. `bench/ledger-audit.ts` maps five columns itself and
// carries a ponytail marker saying it will not notice a sixth. That is affordable when the question
// is "does this key match this prose". It is not affordable here: the answer depends on the body in
// force at a chapter, the coat, every open room, the SYSTEM reserve and the story's own context cap,
// which is six things that would each have to be re-derived and could each be re-derived wrongly in
// the direction that makes the cap look safe. So this calls `view()` and `assemble()` — the same two
// functions the running server calls — and the only thing it invents is the projection below.
//
// WHAT IS MEASURED AND WHAT IS MODELLED, because they must not be read as one number:
//
// - MEASURED: what canon weighs at every position of every book in the library, as it stands today,
//   with the rooms that actually exist, and how often the 45% ceiling drops a card.
// - MODELLED: the same walk with k synthetic rooms added to every card that reached the prompt. A
//   room's body is stood in for by the MEDIAN ENTRY BODY of that book — a room is a paragraph about
//   a card in the same voice as the card, so the card's own body is the closest thing the library
//   has to a measurement of one. It is still a stand-in and it is labelled as one everywhere.
//
// THE DENOMINATOR IS THE POINT (F10). "Canon fits" is meaningless if no book has any rooms yet, so
// the report says how many rooms are in play before it says anything else. A comfortable number on
// an empty feature is not evidence about a full one.

import { CANON_CAP_FRAC } from '../src/blocks.ts';

// ---- the check. Nothing below the report line runs until this is green. ----
//
// It asserts BOTH DIRECTIONS on the two things the report claims to see: that rooms make canon
// heavier, and that the ceiling drops a card when canon outgrows it — and that it does NOT drop one
// when canon fits. A detector that cannot report "the cap bit" reports perfection forever (F17).

if (process.argv[2] === 'check') {
  const { strict: assert } = await import('node:assert');
  const { buildContext } = await import('../src/context.ts');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };
  const count = (s: string) => Math.ceil(s.length / 4);

  const card = (id: string, rooms: number) => ({
    id, title: id, body: `[${id}: ${'x'.repeat(200)}]`, entryType: 'character',
    activation: 'always_on', keys: [], lastEditor: 'human',
    addons: Array.from({ length: rooms }, (_, i) => ({
      id: `${id}-a${i}`, slot: 'interiority', name: `room ${i}`, body: 'y'.repeat(200),
      keys: [], active: true })),
  });
  const at = (rooms: number, budget: number) => buildContext({
    story: { title: 'T', genre: 'g', premise: 'p', setting: 's', pov: 'third', writingStyle: '', spice: 2 },
    chapters: [{ id: 'c1', index: 1, title: 'one' }],
    passages: [{ id: 'p1', ordinal: 1, body: 'The rain did not stop.' }],
    entries: [card('a', rooms), card('b', rooms), card('c', rooms)] as any,
    mode: 'continue', currentChapter: { id: 'c1', index: 1, title: 'one' }, budget,
  } as any, count);
  const canon = (m: any) => (m.byKind['CANON-ALWAYS'] ?? 0) + (m.byKind['CANON-TRIGGERED'] ?? 0);
  const dropped = (m: any) => m.blocks.filter((b: any) => /canon 45% ceiling/.test(b.reason)).length;

  console.log('\n  weight check — the detector, before anything it says is believed\n');

  // 1. Rooms cost tokens. If this cannot see the difference, every number below is a constant.
  ok('a card with rooms weighs more than the same card without',
     canon(at(3, 40000)) > canon(at(0, 40000)));
  ok('  and each room adds to it, so the growth is per room and not a flat surcharge',
     canon(at(5, 40000)) > canon(at(3, 40000)));

  // 2. The ceiling. Both directions, because "the cap never bit" is exactly the reading a broken
  //    detector produces, and it is the reading that would let this ship.
  ok('the ceiling drops a card when canon outgrows it', dropped(at(5, 400)) > 0);
  ok('  and drops nothing when canon fits inside it', dropped(at(5, 40000)) === 0);

  // 3. The arithmetic the report prints, stated once here so a change to CANON_CAP_FRAC cannot
  //    leave the report describing a ceiling the engine no longer uses.
  ok('the ceiling the report names is the one the engine evicts against',
     Math.floor(400 * CANON_CAP_FRAC) === Math.floor(400 * 0.45));

  console.log(`\n  ${n} checks passed — the detector answers both ways\n`);
  process.exit(0);
}

// ---- the report ----------------------------------------------------------

const { copyFileSync, existsSync, rmSync } = await import('node:fs');
const SRC = process.env.ANANSI_DB ?? new URL('../anansi.db', import.meta.url).pathname;
const COPY = '/tmp/anansi-weight.db';
// The WAL holds writes the main file does not, and this database runs in WAL mode with a server
// that may have been killed mid-transaction. Copying the .db alone reports a book as it was at the
// last checkpoint, which for a file last checkpointed hours ago is a different book.
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(COPY + suffix, { force: true });
  if (existsSync(SRC + suffix)) copyFileSync(SRC + suffix, COPY + suffix);
}
process.env.ANANSI_DB = COPY;

const { view, assemble } = await import('../src/story.ts');
const dbm = await import('../src/db.ts');
// Every book in the file, not one owner's. `listStories` takes an owner because the server always
// has one; a measurement of the library does not, and a bench that quietly walked half of it would
// report the heaviest book missing.
const stories = dbm.db.prepare('SELECT id, title FROM stories ORDER BY title').all() as any[];

// Two slots of 50,048 (`.claude/CLAUDE.md`). Overridable, because the ceiling is a fraction of the
// budget and the budget is a fraction of this — a bench that hardcodes a slot silently answers for
// a machine nobody is running.
const SLOT = { global: 100096, slots: 2, perSlot: Number(process.env.ANANSI_SLOT ?? 50048) };
const PROJECT = [1, 3, 5];      // rooms per card, the shape of a character's slot list in slots.ts

const median = (xs: number[]) => xs.length
  ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;
const pad = (s: any, n: number) => String(s).padEnd(n).slice(0, n);

console.log(`\n  WEIGHT — ${SRC}  (walked on a copy at ${COPY})\n`);
console.log(`  canon ceiling is ${(100 * CANON_CAP_FRAC).toFixed(0)}% of each story's budget;`
  + ` slot ${SLOT.perSlot}\n`);

let libRooms = 0, libPositions = 0;
const libPeak: { title: string; pct: number }[] = [];
const libFills: { title: string; fills: number; at: number }[] = [];
const libBit = { real: 0, ...Object.fromEntries(PROJECT.map((k) => [k, 0])) } as Record<string, number>;

for (const s of stories) {
  const v = view(s.id);
  if (!v || v.passages.length < 2) { console.log(`  ${pad(s.title, 26)} — nothing to walk`); continue; }
  const chapterOf = new Map(v.chapters.map((c: any) => [c.id, c]));
  // Only entry-level rooms count here, and the outfit slot is not one of them: `context.ts` skips
  // it on purpose while the surface still writes the older `outfits` table, so counting the copies
  // the migration made would report rooms in play that the prompt has never seen.
  const rooms = v.entries.reduce((n: number, e: any) =>
    n + (e.addons ?? []).filter((a: any) => a.slot !== 'outfit').length, 0);
  const bodies = v.entries.map((e: any) => String(e.body ?? '').length).filter(Boolean);
  const roomBody = 'x'.repeat(median(bodies));

  const withRooms = (k: number) => v.entries.map((e: any) => ({ ...e, addons: [...(e.addons ?? []),
    ...Array.from({ length: k }, (_, i) => ({ id: `${e.id}-proj${i}`, slot: 'interiority',
      name: `room ${i}`, body: roomBody, keys: [], active: true })) ] }));

  const canonAt = (entries: any[], p: any) => {
    const m = assemble({ ...v, entries, currentChapter: chapterOf.get(p.chapterId) ?? v.currentChapter },
      SLOT, 'continue', undefined, p.ordinal).manifest;
    return {
      // byKind is summed BEFORE eviction (`context.ts`), so this is what canon WANTED, which is the
      // number the ceiling is a ceiling on. What survived is a different question and a smaller one.
      wanted: (m.byKind['CANON-ALWAYS'] ?? 0) + (m.byKind['CANON-TRIGGERED'] ?? 0),
      ceiling: Math.floor(m.totals.budget * CANON_CAP_FRAC),
      bit: m.blocks.filter((b: any) => /canon 45% ceiling/.test(b.reason)).length,
      // How many cards were actually in the prompt at this position. It is what turns a percentage
      // into a decision: 7% of the ceiling means nothing until you know it is 7% for six cards.
      cards: m.blocks.filter((b: any) => /^CANON-/.test(b.kind) && b.state === 'included').length,
    };
  };

  const walk = (entries: any[]) => {
    const pcts: number[] = []; let bit = 0, peak = 0, cardsAtPeak = 0;
    for (const p of v.passages.slice(1)) {
      const r = canonAt(entries, p);
      if (r.ceiling > 0) pcts.push(100 * r.wanted / r.ceiling);
      if (r.ceiling > 0 && 100 * r.wanted / r.ceiling > peak) {
        peak = 100 * r.wanted / r.ceiling; cardsAtPeak = r.cards;
      }
      if (r.bit) bit++;
    }
    // LINEAR, and it is an extrapolation and not a measurement: cards differ in length and a
    // longer ledger fires a different mix. It is the right shape all the same — canon is a sum
    // over cards — and it answers the only question the percentage cannot: how far away is this.
    const fills = peak > 0 ? Math.round(cardsAtPeak * 100 / peak) : 0;
    return { median: median(pcts), peak, bit, n: pcts.length, cardsAtPeak, fills };
  };

  const real = walk(v.entries);
  libRooms += rooms; libPositions += real.n; libBit.real += real.bit;
  libPeak.push({ title: s.title, pct: real.peak });

  console.log(`  ${pad(s.title, 26)} ${real.n} positions, ${v.entries.length} cards,`
    + ` ${rooms} room${rooms === 1 ? '' : 's'} in play`);
  console.log(`    as it stands    canon wants ${real.median.toFixed(0)}% of its ceiling (median),`
    + ` ${real.peak.toFixed(0)}% at the worst position, dropped a card at ${real.bit} of ${real.n}`);
  for (const k of PROJECT) {
    const w = walk(withRooms(k));
    libBit[k] += w.bit;
    if (k === PROJECT.at(-1)) libFills.push({ title: s.title, fills: w.fills, at: w.cardsAtPeak });
    console.log(`    +${k} room${k === 1 ? ' ' : 's'} per card  ${w.median.toFixed(0)}% median,`
      + ` ${w.peak.toFixed(0)}% peak, dropped a card at ${w.bit} of ${w.n}`
      + `   (modelled: room body = this book's median card, ${median(bodies)} chars)`);
  }
  const full = walk(withRooms(PROJECT.at(-1)!));
  console.log(`    the ceiling fills at about ${full.fills} cards firing at once with`
    + ` ${PROJECT.at(-1)} rooms each — ${full.cardsAtPeak} fired at this book's worst position`);
}

console.log(`\n  LIBRARY  ${libPositions} positions walked, ${libRooms} rooms in play across every book`);
if (!libRooms) console.log(`           NO BOOK HAS A ROOM YET. The "as it stands" line above therefore`
  + `\n           measures the shape BEFORE this feature, and only the modelled lines say`
  + `\n           anything about the risk PLAN-08 names. Do not read the first line as a result.`);
console.log(`           the ceiling dropped a card at ${libBit.real} positions as it stands`);
for (const k of PROJECT) console.log(`             ${libBit[k]} positions with +${k} rooms per card (modelled)`);
const tightest = libFills.filter((f) => f.fills > 0).sort((a, b) => a.fills - b.fills)[0];
if (tightest) console.log(`           at ${PROJECT.at(-1)} rooms per card the ceiling fills at about`
  + ` ${tightest.fills} cards firing at once (${tightest.title}, the tightest book);`
  + `\n           the most any book fired at one position was`
  + ` ${Math.max(...libFills.map((f) => f.at))}.`);
// The decision line. COUNCIL-04 #7 is the worst crowded scene this project has on record — 46
// entries firing at once for an eight-person scene — so the question the eviction order actually
// has to answer is what that scene costs once every card has rooms. Stated against the TIGHTEST
// book, so the answer is the worst one the library supports rather than the average one.
if (tightest) console.log(`           a COUNCIL-04 #7 scene — 46 cards at once — with`
  + ` ${PROJECT.at(-1)} rooms each would want about`
  + ` ${Math.round(100 * 46 / tightest.fills)}% of that ceiling.`);
const worst = libPeak.sort((a, b) => b.pct - a.pct)[0];
if (worst) console.log(`           heaviest book: ${worst.title}, canon peaked at ${worst.pct.toFixed(0)}% of its ceiling`);
console.log(`\n  A percentage under 100 is not "the cap cannot bite" — it is the cap not biting on the`);
console.log(`  prose that exists. The modelled lines are what say whether it bites on the prose this`);
console.log(`  feature invites. Nothing here says a card that fired deserved to.\n`);
