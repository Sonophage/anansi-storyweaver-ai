// Shrink rooms that were written under the wrong length band, without losing a fact.
//
// Seth, 2026-08-30: cards Anansi fills in "read really long. before it was too short." `INVENT`
// was fixed the same day — a room is asked for at 40-80 words now instead of inheriting the
// whole-card band of 120-200. That fix changes NOTHING already written. This is the back-fill.
//
//   node --experimental-strip-types bench/compact.ts                       # REPORT. No model, no writes.
//   node --experimental-strip-types bench/compact.ts --propose             # model reads, writes a review file. No DB writes.
//   node --experimental-strip-types bench/compact.ts --write <review.json> # applies it, after a backup.
//
// THREE MODES, NOT TWO, and the middle one is the reason. The one-off tofacts migration got away
// with dry-run-then-write because its dry run could print exactly what it would do: it was a
// deterministic move. This one puts a MODEL between the before and the after, so a dry run cannot
// show the result without paying for it. Splitting propose from write means the words that will
// land in the ledger are on disk, readable, before anything is overwritten.
//
// AND `addons` HAS NO REVISION TABLE. `entries` has `entry_revisions` and a revert route; a room
// does not. So an in-place rewrite of a room is undoable ONLY from the database snapshot `--write`
// takes before its first write.
//
// EXPORT and Heretics Reign are skipped by name, on Seth's word — they are the two imported books
// and he is not asking for them to be touched.
//
// ponytail: rooms only, not `entries.body` and not chapter summaries. The body is empty across the
// whole library since the tofacts migration ran, and summaries have their own band in
// SUMMARY(maxWords). If either grows a length problem later this is the shape to copy, not to
// extend.

import assert from 'node:assert';
import { writeFileSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** EXPORT and Heretics Reign are out again, on Seth's word: "its fine leave those two books alone."
 *
 *  They went in when he said all stories should carry the compressed register, and came out when
 *  the run showed what they are. They are not heavy hand-written cards; they are encyclopedia
 *  entries the importer wrote, holding a median of twelve distinct facts a room and up to
 *  twenty-five. 73 of their rooms compacted cleanly and the rest cannot reach 40-80 words without
 *  dropping canon — which is a property of the cards, not a failure of the prompt. Their canon
 *  sits at ~3,600 tokens each and it is honest.
 *
 *  Leaving them alone is a DECISION, and it is why it is written here rather than in a commit
 *  nobody will find: anyone who removes these two names is re-opening a question that was closed
 *  on evidence. */
const SKIP = new Set(['EXPORT', 'Heretics Reign']);
/** COMPACTION IS FOR EVERY ROOM, AND THE COMPRESSED REGISTER IS THE POINT OF IT.
 *
 *  This was scoped to `facts` for one commit on a misreading of Seth. What he actually said, once
 *  he had read the output: *"keep the telegram version. thats better and useful for the ai. the
 *  rest is fat so all stories should have that."*
 *
 *  So the thing I flagged as a possible regression is the deliverable. A room is REFERENCE, not
 *  writing — `INVENT` says so in its own first line — and the flowing version was paying for
 *  connective prose the model does not read for meaning. F36 is the argument nobody made at the
 *  time: finished English in a prompt is lifted verbatim into the book, and a room that cannot be
 *  read as a sentence cannot be lifted as one. The compressed register is SAFER, not just shorter.
 *
 *  The two imported books are in scope now for the same reason. They were skipped by name while
 *  the question was "his heavy hand-written cards"; every one of their 436 rooms is a `facts` room
 *  the importer wrote, averaging 178 words, and they are where nearly all of the weight is. */
const CEILING = 80;            // the top of the new room band, in words
const FLOOR = 40;              // and its bottom — a rewrite under this has lost something

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** WHAT MUST SURVIVE A REWRITE. `factsLost` is `src/context.ts`, shared with
 *  `db.staleSummariesFor`, which asks the same question of a card edit that this asks of a
 *  rewrite: did the FACTS change, or only the wording? Its stopword list, its ceiling and its
 *  synthetic cases live there and in `test/engine.ts` — this used to carry its own copy of all
 *  three, and the copy is how the greedy-number bug got written twice.
 *
 *  A model asked to shorten prose drops the specific before the ornamental — a number, a name, a
 *  debt — which is exactly what a ledger holds, and nothing reading only the new version could
 *  catch it. So every rewrite is diffed and anything that lost a
 *  fact is left for a person. It FLAGS and never auto-rejects: a false positive that silently
 *  skipped a room is the worse failure. */
const { factsLost: lost } = await import('../src/context.ts');

const db = await import('../src/db.ts');
const DBFILE = process.env.ANANSI_DB || 'anansi.db';

type Row = {
  id: string; storyId: string; entryId: string | null;
  story: string; card: string; slot: string; name: string; keys: string[];
  body: string; n: number; active: boolean;
};

const rows: Row[] = [];
for (const s of db.allStoriesForExport()) {
  if (SKIP.has(s.title)) continue;
  const named = new Map<string, string>(db.entriesOf(s.id).map((e: any) => [e.id, e.title]));
  // `addonsOf` is keyed by STORY, and a room whose card has been deleted still has a row. Counted
  // rather than dropped: a room nothing can reach is its own thing to look at, and skipping it
  // silently would make the totals here disagree with the totals in the database.
  for (const a of db.addonsOf(s.id))
    rows.push({
      id: a.id, storyId: s.id, entryId: a.entry_id ?? null,
      story: s.title, card: named.get(a.entry_id) ?? '(no card)', slot: a.slot,
      name: a.name, keys: JSON.parse(a.keys || '[]'),
      body: a.body, n: words(a.body), active: !!a.active,
    });
}
const over = rows.filter((r) => r.n > CEILING).sort((a, b) => b.n - a.n);
const skipped: Row[] = [];

console.log(`${rows.length} rooms across ${new Set(rows.map((r) => r.story)).size} books, `
  + `${SKIP.size} books skipped by name`);
console.log(`${over.length + skipped.length} over ${CEILING} words, `
  + `${rows.reduce((t, r) => t + r.n, 0)} words total, `
  + `${(over.length + skipped.length ? [...over, ...skipped] : []).reduce((t, r) => t + (r.n - CEILING), 0)} `
  + `of them above the band`);
console.log('');

// ACCUMULATION IS THE OTHER HALF, and shortening rooms does not touch it. The non-exclusive slots
// pile up — `interiority`, `relationships`, `history` take as many rows as you add and EVERY
// active one fires. Halsey carries four active interiority rooms, 2,644 characters between them,
// which is more of that card than any single room being over the band. Reported, never merged:
// merging is a deletion of the writer's own rows and it is his call, not a migration's.
const piles = new Map<string, Row[]>();
for (const r of rows) {
  // A NUL as the separator, written as an ESCAPE and not as a raw byte. It was two literal
  // NUL characters until 2026-09-07, which made this file BINARY to grep -- so the documented
  // debt-ledger command silently SKIPPED it and undercounted by the one marker in this file.
  // Same failure as the marker in test/db.ts the published grep could not see: different
  // cause, same silence, and the ledger is supposed to be the one count that cannot drift.
  const k = `${r.story}\u0000${r.card}\u0000${r.slot}`;
  if (!piles.has(k)) piles.set(k, []);
  piles.get(k)!.push(r);
}
// ACTIVE ROWS, NOT ALL ROWS, and the difference is the whole point of the column. `outfit` is an
// EXCLUSIVE slot: three outfit rows on one card is a wardrobe, exactly one of them fires, and
// counting all three would report a prompt cost that does not exist. The non-exclusive slots are
// where a pile is real — every active one of those is in the prompt at once.
const stacked = [...piles.values()]
  .map((g) => ({ g, live: g.filter((r) => r.active) }))
  .filter((x) => x.live.length > 1)
  .sort((a, b) => b.live.reduce((t, r) => t + r.n, 0) - a.live.reduce((t, r) => t + r.n, 0));
if (stacked.length) {
  console.log(`${stacked.length} slots have MORE THAN ONE ACTIVE room, and every one of them is `
    + 'in the prompt at once. Compaction does NOT merge these:');
  for (const { g, live } of stacked.slice(0, 8))
    console.log(`  ${g[0].story.slice(0, 22).padEnd(22)} ${g[0].card.slice(0, 16).padEnd(16)} `
      + `${g[0].slot} x${live.length} active = ${live.reduce((t, r) => t + r.n, 0)}w`
      + `${g.length > live.length ? ` (+${g.length - live.length} off)` : ''}`);
  console.log('');
}

// `--limit N`, added after a prompt change cost 354 model calls to evaluate. A wording change to
// COMPACT is a change to what lands in the ledger and it has been wrong twice; twenty rooms
// against the same twenty rooms is the cheap way to see it before spending twenty minutes.
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || 0;
const PROPOSE = process.argv.includes('--propose');
const WRITE = process.argv.indexOf('--write');

if (!PROPOSE && WRITE < 0) {
  for (const r of over.slice(0, 40))
    console.log(`  ${String(r.n).padStart(4)}w  ${r.story.slice(0, 22).padEnd(22)} `
      + `${r.card.slice(0, 18).padEnd(18)} ${r.slot}`);
  if (over.length > 40) console.log(`  and ${over.length - 40} more`);
  console.log('\nnothing was changed. --propose to draft rewrites, one model call per room.');
}

/** The compaction prompt lives HERE and not in `src/prompts.ts`, deliberately: no route calls it
 *  and it is meant to stop being true once the library is inside the band. Every prompt in
 *  `prompts.ts` is one a writer can reach from the app.
 *
 *  It is not INVENT. INVENT writes a room from the story; this one is forbidden from adding
 *  anything — the whole risk of the operation is a model quietly improving the canon while it
 *  shortens it, and a room it invented here would be indistinguishable from one Seth wrote. */
/** THE SECOND VERSION OF THIS PROMPT WAS WORSE AND IS REVERTED. Written down because it is the
 *  only measurement anyone has of this prompt, and the next person to read the first version will
 *  see the same escape hatch and reach for the same fix.
 *
 *  Run 1 ended with "If it is already at or under 80 words, return it unchanged" and ELEVEN of 41
 *  rooms came back byte-identical, every one of them over the ceiling. Read as permission, so the
 *  line was deleted and replaced with the room's current length named and "it must come back
 *  shorter" — F37's shape, a number instead of a category.
 *
 *      run 1  22/41 in band with nothing lost, 11 echoed, 1,014 words saved
 *      run 2   9/41 in band with nothing lost, 20 echoed,   345 words saved
 *
 *  Naming the input's length appears to anchor the model to reproducing it. NOT A CONTROLLED
 *  COMPARISON — the two runs were sequential, not simultaneous, and nothing sets a seed, so this
 *  is one sample against one sample on the same 41 rooms. The gap is large enough to act on and
 *  not large enough to explain. `bench/ab.ts` is what would settle it, and it is not worth two
 *  servers for a migration that runs once.
 *
 *  The stopword fix shipped in the same commit and is KEPT: it only touches `lost`, never what the
 *  model returns, so the echo count attributes cleanly to the prompt alone. */
/** WHAT STOPPED THE FULL RUN AT 73 OF 354, measured rather than guessed, so the next person does
 *  not spend twenty more minutes on the wrong lever.
 *
 *  The prompt is not the binding constraint any more. THE BAND IS. On the 20 longest rooms:
 *
 *      16 of 20 failed by coming back OVER 80 words
 *       9 of 20 dropped a fact
 *       2 of 20 came back unchanged
 *
 *  and the reason is in the cards, not the model: a median over-band room in the imported books
 *  holds TWELVE distinct facts and the worst holds TWENTY-FIVE — names, factions, titles, places,
 *  numbers. Twenty-five proper nouns do not go into sixty words, and a model that shortened them
 *  anyway would be dropping canon, which is what the fact check is there to refuse. It refused.
 *
 *  So the honest reading is that 40-80 was set for a hand-written character room and these are a
 *  different animal — the importer wrote encyclopedia entries. Raising the ceiling for them, or
 *  scaling it to the fact count, is a decision about the ledger and belongs to Seth, not to a
 *  migration. The `EVERY PROPER NOUN IS A FACT` line below took the same 20 rooms from 0 clean to
 *  1 — no worse, and it moved the failure from lost-facts toward over-length, which is the safer
 *  side to fail on. n = 20, one sample, and nothing more is claimed for it. */
const compactFor = (_n: number) =>
`You are shortening one room of a character ledger. You are NOT writing a new one.

Keep every fact: every name, number, debt, habit, object and relation. Drop only repetition,
scene-setting, and adjectives doing the work of facts. If the room restates who the character is,
that is the first thing to cut — the ledger says it elsewhere and it is paid for twice.

Bracket form, ${FLOOR} to ${CEILING} words. Add nothing. Invent nothing. Do not rename anything.
The opening label — the name and what they are, "Halsey: the Musician." — is a fact. Keep it.
EVERY PROPER NOUN IS A FACT: every person, place, faction, title and thing with a capital letter
survives, spelled the same way. Drop the sentence around it, never the name.
If it is already at or under ${CEILING} words, return it unchanged.`;

/** WHAT THE FIRST REAL APPLY DID TO THE REGISTER, measured after the fact and written here
 *  because it is the thing to look at before running this again.
 *
 *  23 rooms applied on 2026-08-30. THIRTEEN OF THEM came back in a telegraphic notes register
 *  where the original was prose — "two registers: interview lilt (musical/curated) vs. low/rough
 *  (gravel); candid past comfort; funny about worst;" for a paragraph that had been sentences.
 *  Ten kept ordinary prose.
 *
 *  It is not obviously wrong. `INVENT` itself says "this is reference, not writing", and F36
 *  measured that finished English in a prompt is lifted verbatim into the prose — by which a card
 *  that cannot be read as a sentence is SAFER, not worse. But nobody has measured whether a model
 *  reads a telegraphic card as well as a written one, and half the ledger changing character is a
 *  thing a writer should be told about rather than discover.
 *
 *  Reverting is cheap and does not need the snapshot: the review file keeps `body`, the original,
 *  beside `after`. A row can go back one at a time. */
if (PROPOSE) {
  const { structuredRetry } = await import('../src/llama.ts');
  const out: any[] = [];
  console.log(`proposing ${LIMIT ? Math.min(LIMIT, over.length) : over.length} rewrites, ONE AT A TIME.\n`);
  // STRICTLY SEQUENTIAL, and this is not a style choice. The writing model has two slots and
  // oversubscribing the shared cache does not queue — both requests die with HTTP 500. Seth may
  // be writing while this runs, so one of the two stays free.
  const batch = LIMIT ? over.slice(0, LIMIT) : over;
  for (const [i, r] of batch.entries()) {
    const res = await structuredRetry(compactFor(r.n), r.body,
      { type: 'object', properties: { body: { type: 'string' } }, required: ['body'] },
      { temperature: 0.2, max_tokens: 700 },
      (d: any) => typeof d?.body === 'string' && d.body.trim().length > 0);
    const after = String(res.data?.body ?? '').trim();
    const miss = after ? lost(r.body, after) : ['(no answer)'];
    out.push({ ...r, after, afterWords: after ? words(after) : 0, lost: miss, error: res.error ?? null });
    console.log(`  ${String(i + 1).padStart(3)}/${over.length}  ${r.n}w -> ${after ? words(after) : '-'}w  `
      + `${r.card.slice(0, 16).padEnd(16)} ${r.slot.padEnd(14)}`
      + `${after === r.body.trim() ? '  UNCHANGED' : ''}`
      + `${miss.length ? '  LOST: ' + miss.join(', ') : ''}`);
  }
  const file = `/tmp/anansi-compact-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2));
  const clean = out.filter((r) => !r.lost.length && !r.error
    && r.afterWords >= FLOOR && r.afterWords <= CEILING);
  console.log(`\n${clean.length} of ${out.length} came back in band with nothing lost.`);
  console.log(`READ IT BEFORE YOU APPLY IT: ${file}`);
  console.log(`then: node --experimental-strip-types bench/compact.ts --write ${file}`);
}

if (WRITE >= 0) {
  const file = process.argv[WRITE + 1];
  if (!file) { console.error('--write needs the review file --propose wrote'); process.exit(1); }
  const plan = JSON.parse(readFileSync(file, 'utf8'));
  // A room has no revision table, so this snapshot is the ONLY way back. It is taken before the
  // first write and it is NOT wrapped in a try — a throw here has to stop the migration rather
  // than be logged past.
  //
  // HAND-NAMED, and that is not cosmetic. `backup()` writes `anansi-<stamp>.db`, which is exactly
  // the set the boot prune rolls at keep = 12. On a day with a few restarts the snapshot this
  // migration depends on would be gone by evening. That is what happened to
  // `pre-craft-backfill.db` on 2026-08-30, and since `e919c1e` the prune only touches names it
  // wrote — so a name it did not write survives.
  const snap = join(dirname(DBFILE), 'backups',
    `pre-compact-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  mkdirSync(dirname(snap), { recursive: true });
  db.snapshot(snap);
  console.log(`snapshot ${snap} (${Math.round(statSync(snap).size / 1024)} KB)`);

  // ONLY the rows that came back in band with nothing lost. Anything the detector flagged is left
  // for a person: the point of the review file is that a machine does not get to decide a dropped
  // name was fine. Written through `upsertAddon` rather than raw SQL so the chapter anchors are
  // preserved by the same code the room editor uses — passing neither leaves both alone.
  let n = 0, refused = 0;
  for (const r of plan) {
    if (r.lost?.length || r.error || r.afterWords < FLOOR || r.afterWords > CEILING) continue;
    const ok = db.upsertAddon(r.storyId, r.entryId,
      { id: r.id, slot: r.slot, name: r.name, keys: r.keys, body: r.after });
    if (ok) n++; else refused++;
  }
  console.log(`${n} rooms rewritten; ${plan.length - n - refused} left for you to read`
    + `${refused ? `; ${refused} REFUSED by upsertAddon — read those, they are a scoping failure` : ''}`);
}
