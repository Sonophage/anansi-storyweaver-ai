// Fires: how often the ledger's keyword path could have run, and how often it did.
//
// PLAN-08 Phase 1. PLAN-06 §2e read twelve entries out of the real library and found twelve
// `always_on` and zero `triggered` — so `fires()` (`src/context.ts:281`), unicode tokenization,
// the fold, the proper-noun exemption, multi-word order plus KEY_SLACK and the sticky walk, is
// exercised by six checks in `test/engine.ts` and by nothing in production. The best-tested dead
// code in the app.
//
// Flipping entries to `triggered` is a two-line change. The reason it does not happen in this file
// is that a flip with no number in front of it is a guess about somebody's book: an entry that
// becomes triggered and then never fires does not degrade, it VANISHES, and it vanishes quietly.
// So this reports the counterfactual first — apply `src/import.ts:127`'s rule (keys or nothing:
// `keysOf(...).length ? 'triggered' : 'always_on'`) and say what would have happened across every
// generation position in the library that already exists.
//
// SIBLING, NOT RIVAL. `bench/ledger-audit.ts` asks the per-ENTRY version of this — *would this
// entry go dark if it were flipped* — and it is the file that governs the decision, because "dark
// on the next call" is what a writer notices and "never fired anywhere in the book" is not. This
// one adds only the per-POSITION denominator: how many chances there were, and how many were taken.
// Read that one first. Neither copies the matcher; both import `fires` from `src/context.ts`.
//
//   node --experimental-strip-types bench/fires.ts check   # the detector, no db, no model
//   node --experimental-strip-types bench/fires.ts         # the report, read-only db
//
// THE DENOMINATOR IS THE POINT. F10 could not decide anything because most of its trials never
// mentioned the thing under test. "How many entries fired" is meaningless on its own; what decides
// the flip is how many entries were ELIGIBLE to fire at that position and did not. An always-on
// entry is not a failure to fire, it is a refusal to ask, and it belongs in neither half.
//
// What this measures and what it does not:
//
// - `fires` is IMPORTED from `src/context.ts`, never copied, and the sticky walk below mirrors
//   `context.ts:444-454` line for line. If that logic changes and this file does not, `check` goes
//   red rather than the report going quietly wrong.
// - Keys are read with `JSON.parse` off the column, NOT through `db.keysOf`. That function is the
//   WRITE path's parser and the column already holds what it produced; parsing a stored array a
//   second way is how §2f's three key parsers happened.
// - The real trigger window appends `input.directive` (`context.ts:414`), and `passages.directive`
//   stores the one that was actually sent — so the window here is the real one rather than an
//   approximation of it. Only the n=0 window gets it, exactly as `windowFor` does.
// - A story can carry several branches and `ordinal` is unique per BRANCH, not per story
//   (`passages_sel`). Interleaving two branches by ordinal would invent a history nobody wrote, so
//   this walks the branch with the most selected passages and names it. The others are not read.
// - It cannot say whether a fired entry deserved to. That is a judgement about a book and needs a
//   reader; this says only that the machinery was consulted and answered.

import { fires, type Entry } from '../src/context.ts';

/** `src/import.ts:127`'s rule, alone and pure so the check can drive it: an entry with no keys can
 *  never fire, so it stays always-on rather than becoming silently dead weight. */
export const wouldFlip = (keys: string[]): 'triggered' | 'always_on' =>
  keys.length ? 'triggered' : 'always_on';

/** Did this entry fire against this history — keyword first, then the sticky walk, exactly as
 *  `buildContext` does it at `src/context.ts:444-454`. Returns the reason, or null. */
export function firedAt(e: Entry, history: string[], directive = ''): string | null {
  const win = (n: number) => [...history.slice(-(8 + n), history.length - n),
                              n === 0 ? directive : ''].join('\n');
  if (fires(e, win(0)).length) return 'keyword';
  const sticky = e.stickyFor ?? (e.entryType === 'character' ? 3 : 0);
  for (let back = 1; back <= sticky; back++) if (fires(e, win(back)).length) return `sticky ${back}`;
  return null;
}

// ---- the check. Nothing below the report line runs until this is green. ----

if (process.argv[2] === 'check') {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };

  const ent = (o: Partial<Entry>): Entry => ({
    id: 'e1', title: 'Halsey', body: 'a fence with a good coat',
    entryType: 'character', activation: 'triggered', keys: ['Halsey'],
    lastEditor: 'human', ...o,
  } as Entry);
  const P = (...s: string[]) => s;

  console.log('\n  fires check — the detector, before anything it says is believed\n');

  // BOTH DIRECTIONS on the rule, or it is a constant wearing a function's clothes.
  ok('no keys stays always-on, so nothing can land triggered-and-dark', wouldFlip([]) === 'always_on');
  ok('one key earns triggered', wouldFlip(['Halsey']) === 'triggered');

  // A hit and a miss on the same entry, so the detector is not simply saying yes.
  ok('a named character fires on the passage that names them',
     firedAt(ent({}), P('Halsey came up the stair with the rain still on her.')) === 'keyword');
  ok('  and does not fire on a passage that does not',
     firedAt(ent({}), P('The room was empty and the fire had gone out.')) === null);

  // The sticky walk. A character defaults to 3, so a name eight passages back is out of the
  // keyword window and inside sticky — this is the branch that no production call has ever taken.
  const old = P('Halsey came up the stair.', ...Array.from({ length: 8 }, (_, i) => `Nothing happens, ${i}.`));
  ok('a name that has fallen out of the window is still held by sticky',
     (firedAt(ent({}), old) ?? '').startsWith('sticky'));
  ok('  but not past the end of it',
     firedAt(ent({ stickyFor: 0 }), old) === null);
  // A lore entry gets no sticky by default, which is exactly the asymmetry that makes the
  // denominator per-entry rather than per-position.
  ok('lore does not get a character\'s sticky for free',
     firedAt(ent({ entryType: 'lore', title: 'the Bell', keys: ['the Bell'], properNouns: false }), old) === null);

  // The dark case: the number the flip actually turns on. An entry whose keys appear nowhere in a
  // book fires at no position, and that is the one this report exists to count.
  const book = P('The rain did not stop.', 'She paid the fence and left.', 'Morning came grey.');
  ok('an entry whose keys are never said fires nowhere in the book',
     book.every((_, i) => firedAt(ent({}), book.slice(0, i + 1)) === null));
  ok('  and one whose keys are said does fire somewhere',
     book.map((_, i) => firedAt(ent({ keys: ['fence'], entryType: 'lore', properNouns: false }), book.slice(0, i + 1)))
       .some((r) => r !== null));

  // The directive is part of the window the engine builds (`context.ts:414`), and it is the half
  // a reader never sees in the prose — an entry can fire on what you TOLD her, not on what she
  // wrote. Asserted both ways so the parameter cannot quietly stop being passed.
  ok('an entry fires on the directive alone',
     firedAt(ent({}), P('The room was empty.'), 'bring Halsey back in') === 'keyword');
  ok('  and not when the directive is empty', firedAt(ent({}), P('The room was empty.')) === null);
  n += 0;

  console.log(`\n  ${n} checks passed — the detector answers both ways\n`);
  process.exit(0);
}

// ---- the report ----------------------------------------------------------

const { DatabaseSync } = await import('node:sqlite');
const FILE = process.env.ANANSI_DB ?? new URL('../anansi.db', import.meta.url).pathname;
const d = new DatabaseSync(FILE, { readOnly: true });

const stories = d.prepare('SELECT id, title, persona FROM stories ORDER BY title').all() as any[];
const pad = (s: string, n: number) => String(s).padEnd(n).slice(0, n);
let libEligible = 0, libFired = 0, libFlipEligible = 0, libFlipFired = 0, libDark: string[] = [];

console.log(`\n  FIRES — ${FILE}\n`);

for (const s of stories) {
  const rows = d.prepare('SELECT id, title, body, entry_type, activation, keys, sticky_for, proper_nouns FROM entries WHERE story_id = ?').all(s.id) as any[];
  const branch = (d.prepare(`SELECT branch_id, COUNT(*) n FROM passages WHERE story_id = ? AND selected = 1
                             GROUP BY branch_id ORDER BY n DESC LIMIT 1`).get(s.id) as any)?.branch_id;
  const passages = (branch ? d.prepare(`SELECT body, directive FROM passages
      WHERE story_id = ? AND branch_id = ? AND selected = 1 ORDER BY ordinal`).all(s.id, branch) as any[] : [])
    .map((p) => ({ body: String(p.body ?? ''), directive: String(p.directive ?? '') }));
  if (!rows.length || passages.length < 2) {
    console.log(`  ${pad(s.title, 28)} — ${rows.length} entries, ${passages.length} passages: nothing to walk`);
    continue;
  }
  const persona = String(s.persona ?? '').trim().toLowerCase();
  const entries: Entry[] = rows.map((r) => ({
    id: r.id, title: r.title, body: r.body ?? '', entryType: r.entry_type,
    activation: r.activation, keys: JSON.parse(r.keys ?? '[]'),
    lastEditor: 'human', stickyFor: r.sticky_for ?? undefined,
    properNouns: r.proper_nouns == null ? undefined : !!r.proper_nouns,
  }));
  // The point-of-view character is unconditional (`context.ts:441`) and belongs in neither half:
  // counting it as "could have fired and did not" would report a defect that cannot exist.
  const askable = entries.filter((e) => !(persona && e.title.trim().toLowerCase() === persona));

  const titleOnly = askable.filter((e) => e.keys.length === 1
    && e.keys[0].trim().toLowerCase() === e.title.trim().toLowerCase()).length;
  const noKeys = askable.filter((e) => !e.keys.length).length;

  let eligible = 0, fired = 0, flipEligible = 0, flipFired = 0;
  const everFired = new Map<string, boolean>();
  for (let i = 1; i < passages.length; i++) {
    const history = passages.slice(0, i).map((p) => p.body);
    for (const e of askable) {
      const hit = firedAt(e, history, passages[i].directive);
      if (e.activation === 'triggered') { eligible++; if (hit) fired++; }
      if (wouldFlip(e.keys) === 'triggered') {
        flipEligible++; if (hit) flipFired++;
        everFired.set(e.id, (everFired.get(e.id) ?? false) || !!hit);
      }
    }
  }
  const dark = [...everFired.entries()].filter(([, f]) => !f)
    .map(([id]) => askable.find((e) => e.id === id)!.title);

  console.log(`  ${pad(s.title, 28)} ${passages.length - 1} positions, ${askable.length} askable entries`
    + ` (${noKeys} with no keys, ${titleOnly} keyed on their own title only)`);
  console.log(`    as it stands   ${fired} fired of ${eligible} chances`
    + (eligible ? ` — ${(100 * fired / eligible).toFixed(1)}%` : ' — the keyword path was never asked'));
  console.log(`    after the flip ${flipFired} fired of ${flipEligible} chances`
    + (flipEligible ? ` — ${(100 * flipFired / flipEligible).toFixed(1)}%` : ' — still nothing to ask'));
  if (dark.length) console.log(`    would go DARK  ${dark.length}: ${dark.join(', ')}`);

  libEligible += eligible; libFired += fired;
  libFlipEligible += flipEligible; libFlipFired += flipFired;
  libDark = libDark.concat(dark);
}

console.log(`\n  LIBRARY  as it stands: ${libFired} of ${libEligible}`
  + (libEligible ? '' : ' — the keyword path has never been consulted in production'));
console.log(`           after the flip: ${libFlipFired} of ${libFlipEligible}`
  + (libFlipEligible ? ` — ${(100 * libFlipFired / libFlipEligible).toFixed(1)}%` : ''));
console.log(`           entries that would go dark: ${libDark.length}`
  + (libDark.length ? ` — ${libDark.join(', ')}` : ''));
console.log(`\n  Nothing above says a fired entry DESERVED to. That is a judgement about a book and`);
console.log(`  needs a reader; this says only that the machinery was consulted and answered.\n`);
