// Ledger audit: which entries survive a flip to `triggered`, and which would go dark?
//
// PLAN-06 §2e — twelve entries, twelve `always_on`, zero `triggered`, so `fires()` has never run
// on real data. §2e's patch (honour an explicit activation, but let an empty key list override a
// `triggered` answer) cannot be applied until somebody can say WHICH entries would still reach the
// model afterwards. `src/db.ts:960` names the class this is looking for: *"a triggered entry with
// no trigger words never reaches the model again and looks fine on the screen."* Silent, and
// invisible from the surface. Nothing may be flipped before this runs.
//
//   node --experimental-strip-types bench/ledger-audit.ts check   # the matcher, no db, no model
//   node --experimental-strip-types bench/ledger-audit.ts         # the audit, read-only db
//
// What this measures and what it does not:
//
// - `fires` and `fold` come from `src/context.ts` — exported, not copied. The POV comparison is
//   the two lines at `src/context.ts:394-395` verbatim. A second copy of the matcher in bench/ is
//   how two classifiers drift apart, and this one exists to decide a schema change.
// - Production scans a window of the LAST EIGHT passages joined, plus the directive
//   (`src/context.ts:389`), and `sticky_for` holds an entry live for passages after that.
//   This counts firings PER PASSAGE, so the per-passage count is a FLOOR on the windows an entry
//   would be live in, never a ceiling. The `now` column re-runs the real eight-passage window on
//   the newest selected passages, which is the closest this can get to "would it reach the model
//   on the next call" — without the directive, which does not exist until somebody types one.
// - Only SELECTED passages on the ACTIVE branch, which is what `src/db.ts:524` feeds the engine.
//   Unselected takes were written and passed over; they are not the book.
// - Prose is scored raw, not through `narrationOnly`. This is deliberate and it is the same call
//   `src/context.ts:389` makes: the real matcher scans passage bodies whole, dialogue included, so
//   a probe that stripped quotes would report an entry dark that production would fire. The
//   narration-only rule governs checks that decide what is TRUE about the story. This one only
//   asks what the shipped matcher would do.
// - "safe to trigger" means the keys hit prose that already exists. It says nothing about prose
//   not yet written — a character who has not walked on stage yet reads as dark here and is not.
import { DatabaseSync } from 'node:sqlite';
import { fires, fold } from '../src/context.ts';
import type { Entry } from '../src/context.ts';

/** Rows to the engine's Entry.
 *
 *  ponytail: `src/story.ts:10` `toEntry` is the mapping this should call, and it is module-private
 *  there. It cannot be reached without importing `src/story.ts`, which imports `src/db.ts`, which
 *  opens the database WRITABLE and runs `migrate()` at module load (`src/db.ts:20-23`) — an ALTER
 *  TABLE on Seth's live book from a tool whose whole claim is that it only reads. So this maps the
 *  five columns `fires()` actually reads and nothing else. Ceiling: it will not notice a new
 *  column that changes matching. Upgrade path: export `toEntry` from `story.ts` and have it take
 *  rows rather than reach for a connection, or move it to `db.ts` beside `keysOf` when §2f lands.
 */
const toEntry = (r: any): Entry => ({
  id: r.id, title: r.title, body: r.body ?? '', entryType: r.entry_type,
  activation: r.activation, keys: JSON.parse(r.keys || '[]'), lastEditor: r.last_editor,
  stickyFor: r.sticky_for ?? undefined,
  properNouns: r.proper_nouns == null ? undefined : !!r.proper_nouns,
});

/** Tokenise and fold the way `fires` does, so "The Captain" and "the captains" compare equal.
 *  Used only to answer "are these keys just the title again", which is F27's question. */
const norm = (s: string) =>
  (String(s ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map(fold).join(' ');

/** Every key is the entry's own title. `[]` is not a title echo, it is no keys — a different
 *  defect with a different verdict, so it is excluded here rather than folded in. */
export const titleEcho = (e: Entry) =>
  e.keys.length > 0 && e.keys.every((k) => norm(k) === norm(e.title));

export type Verdict = 'is POV' | 'no keys' | 'no prose' | 'safe to trigger' | 'would go dark';

/** What happens to this entry the moment it is flipped to `triggered`.
 *
 *  The order mirrors `buildContext`'s own branch order (`src/context.ts:399-419`): a pin, then
 *  POV, then the matcher. Pins are per chapter and are not read here, so POV is first — a POV
 *  entry reaches the model with no keys at all and cannot go dark, whatever its key list says.
 */
export function verdictFor(e: Entry, isPov: boolean, passages: number, firedOn: number): Verdict {
  if (isPov) return 'is POV';
  if (!e.keys.length) return 'no keys';
  if (!passages) return 'no prose';
  return firedOn > 0 ? 'safe to trigger' : 'would go dark';
}

/** Zero firings in n passages is a bound, not an absence — F12 called a 4% defect fixed on
 *  zero-in-sixty. Rule of three: the 95% upper bound on the per-passage rate is 3/n.
 *
 *  Below four passages the rule of three returns a number at or over 100%, which is arithmetically
 *  true and says nothing. It is reported as "too little prose" rather than dressed up as a bound —
 *  four of the five books here hold one selected passage each, so this is the common case, not
 *  the edge. */
const bound = (n: number) =>
  n < 4 ? `${n} selected passage${n === 1 ? '' : 's'} is too little prose to bound a rate`
        : `under ${(300 / n).toFixed(1)}% of passages, not never`;

// ---- the check. Nothing below the live-run line runs until this is green. ----

if (process.argv[2] === 'check') {
  const E = (keys: string[], entryType: Entry['entryType'], title = 'x'): Entry => ({
    id: 'x', title, body: '', entryType, activation: 'triggered', keys, lastEditor: 'human',
  });

  // [label, entry, window, should it fire, why it matters here]
  const CASES: [string, Entry, string, boolean, string][] = [
    ['a key that fires', E(['Halsey'], 'character'),
      'Halsey shrugs off the thrifted military jacket.', true,
      'the ordinary hit. If this is false the audit reports every entry dark and the flip in §2e '
      + 'gets blocked by an instrument that cannot see'],

    ['a key that does not', E(['Halsey'], 'character'),
      'She shrugs off the thrifted military jacket.', false,
      'the same key against prose that never names her. If this fires, every entry reads as safe '
      + 'to trigger and twelve green verdicts mean nothing — the failure this repo shipped twice'],

    ['a multi-word key out of order', E(['iron bridge'], 'lore'),
      'The bridge was iron, and it was cold.', false,
      'COUNCIL-04\'s real failure, quoted at src/context.ts:272-275. Both words are present; the key '
      + 'is not'],

    ['the same multi-word key in order', E(['iron bridge'], 'lore'),
      'They crossed the iron bridge at dawn.', true,
      'the guard on the case above, asserted rather than assumed: without this, a matcher that had '
      + 'simply lost multi-word keys entirely would pass the out-of-order case for the wrong reason'],

    // Order and distance are two separate rules and the out-of-order case only exercises one.
    // Found by breaking KEY_SLACK on purpose and watching the case above stay green: with the
    // distance test replaced by `return true`, "The bridge was iron" still failed to fire, because
    // the ORDER walk caught it. These two cases are what actually watch KEY_SLACK.
    ['a multi-word key in order but a clause apart', E(['iron bridge'], 'lore'),
      'The iron gate stood open, and far beyond the frozen river lay the bridge.', false,
      'COUNCIL-04\'s other failure: "Kade Ashford" firing on Kade Ferrin plus Lord Ashford two '
      + 'passages apart. In order, and not the key. KEY_SLACK is what refuses it'],

    ['a multi-word key with one word between', E(['iron bridge'], 'lore'),
      'They crossed the iron-shod bridge at dawn.', true,
      'the guard on the case above: KEY_SLACK is 2, not 0, and a matcher tightened to adjacency '
      + 'would pass the clause-apart case while losing the hyphenated form the comment names'],

    ['Aldis / Aldi — the longer name does not answer the shorter key', E(['Aldis'], 'character'),
      'Aldi reaches into his coat.', false,
      'a key must not fire on a word that merely resembles it. This is the direction that would '
      + 'inflate the firing count and mark a dark entry safe'],

    ['Aldis / Aldi on the folded path', E(['Aldi'], 'lore'),
      'Aldis reaches into his coat.', false,
      'SPEC §7.4 exempts proper nouns from fold() precisely for this pair; fold() also refuses to '
      + 'strip the -s of "aldis" because of its (ss|us|is) guard, so the folded path holds'],

    ['an entry with no keys', E([], 'character'),
      'Halsey shrugs off the thrifted military jacket.', false,
      'src/import.ts:122 — an entry with no keys can never fire. If this returns a hit the "no '
      + 'keys" verdict below is unreachable'],

    ['empty prose', E(['Halsey'], 'character'), '', false,
      'a detector that cannot report zero reports perfection'],
  ];

  let bad = 0;
  const red = (why: string) => { bad++; console.log(`  RED  ${why}`); };

  console.log('\n  ledger-audit check — the matcher, then the verdict\n');
  for (const [label, e, window, want, why] of CASES) {
    const hit = fires(e, window);
    if ((hit.length > 0) !== want)
      red(`${label}: fired ${JSON.stringify(hit)}, wanted ${want ? 'a hit' : 'nothing'}\n`
        + `       ${why}`);
  }

  // The verdicts themselves, on known entries. The table below is the output somebody reads, and
  // a firing count nobody classifies correctly is still a wrong answer.
  const VERDICTS: [string, Verdict, Verdict][] = [
    ['POV beats everything, including an empty key list',
      verdictFor(E([], 'character', 'Halsey'), true, 20, 0), 'is POV'],
    ['keys that never appear',
      verdictFor(E(['Halsey'], 'character'), false, 20, 0), 'would go dark'],
    ['keys that appear',
      verdictFor(E(['Halsey'], 'character'), false, 20, 3), 'safe to trigger'],
    ['no keys at all',
      verdictFor(E([], 'character'), false, 20, 0), 'no keys'],
    ['a story with no selected prose cannot answer the question either way',
      verdictFor(E(['Halsey'], 'character'), false, 0, 0), 'no prose'],
  ];
  for (const [label, got, want] of VERDICTS)
    if (got !== want) red(`verdict "${label}": got ${got}, wanted ${want}`);

  // The title-echo detector, both directions — F27's claim is that keys repeat the title, and a
  // detector that answers "yes" to everything cannot support it.
  if (!titleEcho(E(['The Captain'], 'character', 'The Captain')))
    red('titleEcho missed a key that is exactly the title');
  if (titleEcho(E(['coat', 'iron bridge'], 'lore', 'Aldis')))
    red('titleEcho fired on keys that are not the title — it would report F27 true everywhere');
  if (titleEcho(E([], 'character', 'You')))
    red('titleEcho fired on an empty key list — "no keys" is a different defect from a title echo');

  if (!bound(60).startsWith('under 5.0')) red(`the zero bound is wrong: 0 in 60 is ${bound(60)}`);
  // The small-n guard, asserted: a "bound" of 300% is not a bound and must not be printed as one.
  if (bound(1).includes('%')) red(`0 in 1 was reported as a percentage bound: ${bound(1)}`);

  // Not a failure, and not red: a defect in `fires` that this audit has to state rather than fix.
  // The proper-noun path matches `key`, `key + "s"` and `key + "'s"` exactly, which re-creates for
  // the plural form the exact collision fold()'s proper-noun exemption exists to prevent. Printed
  // on every run, in both modes, because it biases the audit's firing counts UPWARD and a reader
  // who takes "safe to trigger" at face value should know which way the error runs.
  const collision = fires(E(['Aldi'], 'character'), 'Aldis reaches into his coat.').length > 0;
  console.log(collision
    ? '  NOTE  a short proper-noun key fires on the longer name ("Aldi" hits "Aldis") via the\n'
      + '        key+"s" rule at src/context.ts:291. Firing counts below are biased UP, never down.'
    : '  NOTE  the "Aldi"/"Aldis" plural collision is gone from src/context.ts — this file still\n'
      + '        warns about it on every run. Delete the warning.');

  const n = CASES.length + VERDICTS.length + 5;
  console.log(bad ? `\n  ${bad} RED — do not believe a result from this\n`
                  : `\n  ${n} cases, all green\n`);
  process.exit(bad ? 1 : 0);
}

// ---- the audit. Read-only, no model, no writes. ----

const FILE = process.env.ANANSI_DB ?? new URL('../anansi.db', import.meta.url).pathname;
const db = new DatabaseSync(FILE, { readOnly: true });
const q = (sql: string) => db.prepare(sql);

// src/db.ts:512 activeBranchOf, and src/db.ts:524 passagesOf. Restated rather than imported for
// the reason on toEntry above: src/db.ts opens the file writable at module load.
const activeBranchOf = (storyId: string): string => {
  const st = q('SELECT active_branch FROM stories WHERE id = ?').get(storyId) as any;
  if (st?.active_branch) return st.active_branch;
  const main = q('SELECT id FROM branches WHERE story_id = ? AND is_primary = 1')
    .get(storyId) as any;
  return main?.id ?? '';
};

const stories = q('SELECT id, title, persona FROM stories ORDER BY rowid').all() as any[];
const allEntries = q('SELECT * FROM entries ORDER BY rowid').all() as any[];

type Row = {
  story: string; e: Entry; passages: number; firedOn: number; keysHit: Set<string>;
  first: number | null; last: number | null; now: boolean; isPov: boolean; verdict: Verdict;
};
const rows: Row[] = [];
let totalSelected = 0;

for (const s of stories) {
  const passages = q('SELECT ordinal, body FROM passages'
    + ' WHERE story_id = ? AND branch_id = ? AND selected = 1 ORDER BY ordinal')
    .all(s.id, activeBranchOf(s.id)) as any[];
  totalSelected += passages.length;
  // src/context.ts:389 — the live window is the last eight passages joined. The directive is part
  // of it in production and cannot be reconstructed here, so this is the prose half of it.
  const nowWindow = passages.slice(-8).map((p) => String(p.body ?? '')).join('\n');

  // src/context.ts:394-395, verbatim.
  const persona = (s as any).persona?.trim().toLowerCase();
  const isPov = (e: Entry) => !!persona && e.title.trim().toLowerCase() === persona;

  for (const r of allEntries.filter((r) => r.story_id === s.id)) {
    const e = toEntry(r);
    const keysHit = new Set<string>();
    let firedOn = 0, first: number | null = null, last: number | null = null;
    for (const p of passages) {
      const hit = fires(e, String(p.body ?? ''));
      if (!hit.length) continue;
      firedOn++;
      for (const k of hit) keysHit.add(k);
      if (first === null) first = p.ordinal;
      last = p.ordinal;
    }
    rows.push({
      story: s.title, e, passages: passages.length, firedOn, keysHit, first, last,
      now: fires(e, nowWindow).length > 0, isPov: isPov(e),
      verdict: verdictFor(e, isPov(e), passages.length, firedOn),
    });
  }
}

const tally = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
// The informative denominator: entries the prose could actually answer for. A POV entry does not
// need keys, an entry with none cannot fire by construction, and a story with no selected prose
// has no evidence either way. None of those three are entries that survived the test — they are
// entries that never took it, and folding them into a rate is F10's mistake.
const judgeable = rows.filter((r) => r.verdict === 'safe to trigger' || r.verdict === 'would go dark');
const dark = judgeable.filter((r) => r.verdict === 'would go dark');
const echoes = rows.filter((r) => titleEcho(r.e));
const triggered = rows.filter((r) => r.e.activation === 'triggered');
// Structural, not the verdict tally: an entry with no keys that is also the POV character gets the
// verdict `is POV`, so counting verdicts here would have reported "0 have no keys" while one did.
const keyless = rows.filter((r) => !r.e.keys.length);

console.log(`\n  ledger audit — ${FILE}\n`);
console.log(`  ${rows.length} entries across ${stories.length} stories, against ${totalSelected}`
  + ` selected passages on the active branches.`);
console.log(`  activation as stored: ${rows.length - triggered.length} always_on,`
  + ` ${triggered.length} triggered.`);
console.log(`  ${echoes.length}/${rows.length} have keys that are just the entry's own title`
  + ` (F27); ${keyless.length} have no keys at all`
  + `${keyless.length ? ` (${keyless.map((r) => r.e.title).join(', ')})` : ''}.\n`);

const w = [22, 20, 11, 26, 7, 9, 11, 16];
const head = ['story', 'entry', 'activation', 'keys', 'echo', 'fires on', 'first/last', 'verdict'];
const cut = (s: string, n: number) => (s.length > n - 1 ? s.slice(0, n - 2) + '…' : s);
console.log('  ' + head.map((h, i) => h.padEnd(w[i])).join(''));
for (const r of rows) {
  const cells = [
    cut(r.story, w[0]), cut(r.e.title, w[1]), r.e.activation,
    cut(r.e.keys.length ? r.e.keys.join(', ') : '—', w[3]),
    titleEcho(r.e) ? 'yes' : 'no',
    `${r.firedOn}/${r.passages}`,
    r.first === null ? '—' : `${r.first}/${r.last}`,
    r.verdict + (r.now ? ' ·now' : ''),
  ];
  console.log('  ' + cells.map((c, i) => c.padEnd(w[i])).join(''));
}

console.log(`\n  "·now" means the entry also fires on the live window — the last eight selected`
  + ` passages\n  joined, which is what the next call would scan (minus the directive, which does`
  + ` not\n  exist until somebody types one).\n`);

for (const r of rows) {
  const where = !r.e.keys.length ? 'it has no keys, so nothing was matched'
    : r.first === null ? 'no selected passage of its story names one of its keys'
    : `fired on ${r.firedOn}/${r.passages} selected passages, ordinals ${r.first}–${r.last},`
      + ` on ${[...r.keysHit].map((k) => JSON.stringify(k)).join(', ')}`;
  const rate = r.passages === 0 ? 'the story has no selected prose'
    : !r.e.keys.length ? 'a key list of one word would decide this, and there is none'
    : r.firedOn === 0 ? `0/${r.passages} — ${bound(r.passages)}`
    : `${((100 * r.firedOn) / r.passages).toFixed(0)}% of its story's passages`;
  console.log(`  ${r.e.title} (${r.e.id}, ${r.story}) — ${r.verdict}. ${where}; ${rate}.`
    + (r.isPov ? ' It is the point-of-view character, so it is sent whether or not a key fires.'
      : ''));
}

console.log(`\n  Verdicts: ${tally('safe to trigger')} safe to trigger,`
  + ` ${tally('would go dark')} would go dark, ${tally('no keys')} no keys,`
  + ` ${tally('is POV')} is POV, ${tally('no prose')} no prose.`);
console.log(`  The rate's denominator is ${judgeable.length}, not ${rows.length}: a POV entry needs`
  + ` no keys, an entry\n  with none cannot fire by construction, and a story with no selected`
  + ` prose has no evidence.`);
console.log(judgeable.length
  ? `  ${dark.length}/${judgeable.length} of the entries the prose can answer for would go dark on`
    + ` a flip to triggered.`
  : `  0 entries could be judged, so this run bounds nothing. The verdicts above are the`
    + ` structural ones only.`);

// A verdict off one passage is a verdict off one passage. Both of these weaken "safe to trigger"
// and neither is visible from the count above, which is exactly how a green number gets believed.
const safe = rows.filter((r) => r.verdict === 'safe to trigger');
const thin = safe.filter((r) => r.passages < 4);
const stale = safe.filter((r) => !r.now);
if (thin.length) console.log(`  ${thin.length}/${safe.length} of those "safe" verdicts rest on a`
  + ` story holding fewer than four selected passages\n  (${thin.map((r) => r.e.title).join(', ')}).`
  + ` One passage that happens to name the character is not evidence\n  that the next fifty will.`);
if (stale.length) console.log(`  ${stale.length}/${safe.length} fired only in the past and NOT on`
  + ` the live window (${stale.map((r) => r.e.title).join(', ')}):\n  safe on the record, dark on`
  + ` the next call.`);
console.log(`\n  Read a firing count as a FLOOR: production scans eight passages at once plus the`
  + `\n  directive, and sticky_for holds an entry live afterwards. And "safe to trigger" is about`
  + `\n  prose that exists — a character who has not walked on stage yet reads dark here.\n`);
