// Persistence checks. Runs against a scratch database, never the real one.
// ESM imports hoist, so the env var must be set before db.ts is *loaded*, not merely
// before the import statement appears. A static import here would have opened the real
// database and run destructive tests against the actual book.
process.env.ANANSI_DB = '/tmp/anansi-test.db';
import assert from 'node:assert';
import { unlinkSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync('/tmp/anansi-test.db' + f); } catch {} }
const db = await import('../src/db.ts');
// A second handle on the same file, for writing a row the way an old one was written: past the floor.
const { DatabaseSync: RawDb } = await import('node:sqlite');
// The screen's copy of the wake-word parser, run against keysOf below.
const webModel: any = await import('../web/model.js');
const slots = await import('../src/slots.ts');
const prompts = await import('../src/prompts.ts');

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

ok('the schema literal contains no backtick', () => {
  // Twice now a backtick inside a SQL comment has terminated the template literal holding
  // the schema, which fails as a TypeScript syntax error a long way from the cause.
  const src = readFileSync(new URL('../src/db.ts', import.meta.url), 'utf8');
  // The schema is the db.exec literal containing CREATE TABLE — not simply the first one,
  // which is a one-line DROP and is what an earlier version of this check matched.
  const lit = [...src.matchAll(/db\.exec\(`([\s\S]*?)`\);/g)]
    .map((m) => m[1]).find((t) => t.includes('CREATE TABLE'));
  assert.ok(lit, 'the schema literal should be findable');
  assert.strictEqual(lit!.includes('`'), false,
    'a backtick in the schema ends the template literal early');
  // And SQL comments are `--`. A `//` in here parses as TypeScript and fails as SQL.
  assert.strictEqual(/^\s*\/\//m.test(lit!), false,
    'the schema uses SQL comments, not JavaScript ones');
});
const o = db.owner('test');
const s = db.createStory(o, { title: 'T', premise: 'p' });
const p1 = db.addPassage({ ...s, storyId: s.id, body: 'one' });

ok('a story is created with a primary branch and an open chapter', () => {
  assert.ok(s.branchId && s.chapterId);
  assert.strictEqual(db.chapters(s.id).length, 1);
});
ok('variants share an ordinal and only one is selected', () => {
  db.addVariant(s.id, p1, 'two'); db.addVariant(s.id, p1, 'three');
  // Asserted through the grouped query production actually uses, not a per-passage helper.
  const slots = db.variantsBySlot(s.id);
  const takes = [...slots.values()][0];
  assert.strictEqual(takes.length, 3);
  assert.strictEqual(takes.filter((x) => x.selected).length, 1);
  assert.strictEqual(slots.size, 1, 'three takes, one slot');
});
ok('every press the page draws an accent for is a mode the column will store', () => {
  // WHY THIS MATTERS: `passages.mode` is what the reading column turns into an `m-*` class, and
  // that class is the coloured rule down the margin telling the writer which press wrote the
  // passage. A press missing from the whitelist stores null and comes back unmarked — which is
  // exactly what happened to Continue, the most common press in any book, for a day.
  // MATCHED ON THE DECLARATION, not on the selector in front of it. This read `.block.m-X {` until
  // 2026-09-02, when the accent had to reach the two buttons under the last passage as well and the
  // selector became `:is(.block, .carry).m-X` — so the check went red on a rule that had only moved.
  // What identifies an accent rule is that it SETS `--m`; the selector is free to change again.
  const drawn = [...readFileSync(new URL('../app.html', import.meta.url), 'utf8')
    .matchAll(/\.m-(\w+)\s*\{\s*--m:/g)].map((m) => m[1]);
  assert.ok(drawn.length >= 5, 'the accent rules should be findable in app.html');
  const sm = db.createStory(o, { title: 'M', premise: 'p' });
  for (const mode of drawn) {
    const id = db.addPassage({ ...sm, storyId: sm.id, body: mode, mode });
    const row = db.passagesOfChapter(sm.chapterId).find((x: any) => x.id === id) as any;
    assert.strictEqual(row.mode, mode,
      `app.html draws an accent for ${mode}, so the column has to keep it`);
  }
  // And the whitelist is still a whitelist: it is what stops the client naming a CSS class.
  const junk = db.addPassage({ ...sm, storyId: sm.id, body: 'junk', mode: 'sudo' });
  const row = db.passagesOfChapter(sm.chapterId).find((x: any) => x.id === junk) as any;
  assert.strictEqual(row.mode, null, 'an unknown mode is stored as null, never kept');
  db.delStory(sm.id);   // off the shelf again: 'deleting a story cascades' counts what is on it
});
ok('every edit is kept and revert restores without losing the current text', () => {
  db.editPassage(s.id, p1, 'edited');
  const h = db.passageHistory(s.id, p1);
  assert.ok(h.length >= 1);
  db.revertPassage(s.id, p1, h[0].id);
  assert.ok(db.passageHistory(s.id, p1).length > h.length, 'the reverted-from text is itself kept');
});
ok('a summary goes stale only when the SELECTED prose changes', () => {
  const ch = db.chapters(s.id)[0] as any;
  db.setSummary(ch.id, 'sum', 1, db.proseHash(db.passagesOfChapter(ch.id).map((x: any) => x.body)), 'model');
  assert.strictEqual(db.summaryStale(db.chapters(s.id)[0]), false);

  // Editing a discarded variant must NOT invalidate the summary — it covers the selected
  // prose, and p1 is no longer selected after the variants test above.
  db.editPassage(s.id, p1, 'a discarded take, edited');
  assert.strictEqual(db.summaryStale(db.chapters(s.id)[0]), false,
    'a variant nobody chose cannot make a summary stale');

  // Editing what the reader actually sees must.
  const live = db.passagesOfChapter(ch.id)[0] as any;
  db.editPassage(s.id, live.id, 'the selected prose, changed');
  assert.strictEqual(db.summaryStale(db.chapters(s.id)[0]), true);
});
// WHY BOTH DIRECTIONS ARE ASSERTED HERE: the filter this checks makes the staling rule quieter,
// and a rule that has been made quiet enough is indistinguishable from one that never fires. The
// second half is the detector fed something it was not written for — a fact that really did leave
// the book — and it has to still go stale, or the guard has simply turned the feature off.
//
// The live failure, 2026-09-18: one card was rewritten from a bracketed state list into prose,
// which dropped three OTHER characters' names out of it. All three still had cards of their own.
// Four of the book's five summaries were nulled by that one save and left the prompt.
ok('a name that is still a card does not stale a summary, a fact that has left the book does', () => {
  const sc = db.createStory(o, { title: 'Cards', premise: 'p' });
  db.addPassage({ ...sc, storyId: sc.id, body: 'Talia kissed Morgott and drank the Ironjar.' });
  const ch = db.chapters(sc.id)[0] as any;
  const fresh = () => db.setSummary(ch.id, 'Talia meets Morgott and is dosed with Ironjar.', 1,
    db.proseHash(db.passagesOfChapter(ch.id).map((x: any) => x.body)), 'model');
  const stale = () => db.summaryStale(db.chapters(sc.id)[0]);

  db.upsertEntry(sc.id, o, { id: 'e-morgott', title: 'Morgott', body: '[Morgott: the Fell Omen]', keys: ['morgott'] });
  db.upsertEntry(sc.id, o, { id: 'e-talia', title: 'Talia',
    body: '[Talia: kissed Morgott; dosed with the Ironjar aromatic]', keys: ['talia'] });

  fresh();
  assert.strictEqual(stale(), false, 'the summary starts fresh against its own prose');
  // Morgott leaves Talia's card. He is still a card, so nothing the summary says has stopped
  // being true and it must stay in the prompt.
  db.upsertEntry(sc.id, o, { id: 'e-talia', title: 'Talia',
    body: '[Talia: a Tarnished; dosed with the Ironjar aromatic]', keys: ['talia'] });
  assert.strictEqual(stale(), false,
    'a name that moved off one card but still has a card of its own has not left the book');

  // Ironjar is on no card at all. It leaves, and the summary is now the only thing that knows
  // the word — which is the failure this function exists for.
  db.upsertEntry(sc.id, o, { id: 'e-talia', title: 'Talia',
    body: '[Talia: a Tarnished]', keys: ['talia'] });
  assert.strictEqual(stale(), true, 'a fact on no other card has left the book, and stales');

  // And the rename, the sharpest case: the summary now names somebody the ledger has never heard
  // of. The old title is gone from the card list by the time the check reads it, so it stales.
  //
  // THE BYSTANDER IS WHAT MAKES THIS CHECK ABOUT TITLES. A card that merely MENTIONS Morgott is
  // exactly what a rename leaves behind, so widening the haystack from titles to whole cards
  // would read the leftover as proof the name survived and let the rename through — which is the
  // one case this function was built for. Without this card the two rules are indistinguishable
  // and the check passes under both.
  db.upsertEntry(sc.id, o, { id: 'e-enia', title: 'Enia',
    body: '[Enia: a Finger Reader; fears Morgott]', keys: ['enia'] });
  fresh();
  assert.strictEqual(stale(), false);
  db.upsertEntry(sc.id, o, { id: 'e-morgott', title: 'Margit', body: '[Margit: the Fell Omen]', keys: ['margit'] });
  assert.strictEqual(stale(), true, 'renaming the card the summary names stales it');

  db.delStory(sc.id);   // off the shelf again: 'deleting a story cascades' counts what is on it
});
ok('ending a chapter closes the old one and opens the next', () => {
  const r = db.endChapter(s.id, s.branchId, 'Two');
  assert.strictEqual(r.idx, 2);
  assert.strictEqual((db.chapters(s.id)[0] as any).status, 'closed');
});
ok('entries upsert by row existence, not by whether an id was passed', () => {
  db.upsertEntry(s.id, o, { id: 'e-fixed', title: 'A', body: '[A]', keys: ['a'] });
  db.upsertEntry(s.id, o, { id: 'e-fixed', title: 'A2', body: '[A]', keys: ['a'] });
  assert.strictEqual(db.entriesOf(s.id).length, 1);
  assert.strictEqual((db.entriesOf(s.id)[0] as any).title, 'A2');
});
// ---- THE WAKE-WORD CHIPS AND THE DATABASE READ A TYPED LIST THE SAME WAY (2026-10-25).
// `keysFrom` in web/model.js is what the Alter screen's chips show; `keysOf` here is what the save
// stores. Two parsers that must agree is this repo's most expensive bug, so they run side by side on
// every edge case found for them, and a difference names the case.
ok('the wake-word chips and keysOf agree on every edge case', () => {
  const cases: unknown[] = [
    'key, coat', ' key ,coat ', 'key,,coat,', '"key", \'coat\'', '\u201cthe key\u201d', 'Key, key, KEY',
    'a, ab, ' + 'x'.repeat(32) + ', ' + 'y'.repeat(33), 'the silver key, Silver Key', '...key!!',
    'Marek Vale, marek vale', '', ',,,', '  ', 'caf\u00e9, na\u00efve', 'one two, three', ['key', ' coat ', 'Key'],
    ['', null, 'ok'], 'k1, k2, k3, k4, k5, k6, k7, k8, k9, k10, k11', '12, 1984', '-dash-, _under_', undefined, null,
  ];
  for (const c of cases)
    assert.deepStrictEqual(webModel.keysFrom(c), db.keysOf(c),
      `the wake-word chips and db.keysOf disagree on ${JSON.stringify(c)}`);
});
// ---- AN ACTIVATION IS ONE OF TWO WORDS, refused otherwise (2026-10-25). The column is TEXT with
// no CHECK, so for its whole life it stored whatever it was handed: this file wrote 'keyed' twice,
// and the engine read that as on a word, the screen as neither. The floor is `upsertEntry`, the
// one function every write of a thread crosses, so the copy and the importers are asserted
// THROUGH it here rather than given guards of their own.
ok('an activation that is not always_on or triggered is refused, by every path that writes one', () => {
  const s3 = db.createStory(o, { title: 'Activations', premise: 'p' }) as any;
  const s4 = db.createStory(o, { title: 'Elsewhere', premise: 'p' }) as any;
  const count = (sid: string) => db.entriesOf(sid).length;
  assert.strictEqual(db.upsertEntry(s3.id, o, { title: 'Keyed', body: '[Keyed]', activation: 'keyed', keys: ['k'] }), null,
    'a word that is not one of the two is refused');
  assert.strictEqual(count(s3.id), 0, 'and nothing is written');
  for (const ok2 of ['always_on', 'triggered', undefined, null])
    assert.ok(db.upsertEntry(s3.id, o, { title: `T ${ok2}`, body: '[T]', activation: ok2, keys: ['t'] }),
      `${ok2} is written (left out means the default)`);
  // An update that names a bad word leaves the row as it was.
  const id = db.upsertEntry(s3.id, o, { title: 'Kept', body: '[Kept]', activation: 'triggered', keys: ['kept'] })!;
  assert.strictEqual(db.upsertEntry(s3.id, o, { id, title: 'Kept', body: '[Kept]', activation: 'off' }), null);
  assert.strictEqual((db.entriesOf(s3.id) as any[]).find((e) => e.id === id).activation, 'triggered',
    'and a refused update changes nothing');
  // The copy crosses the same floor: a row that holds a bad word (written past the floor, as old
  // rows were) is refused on its way into another tale rather than carried there.
  const raw = new RawDb(db.FILE);
  raw.prepare("UPDATE entries SET activation = 'sometimes' WHERE id = ?").run(id);
  raw.close();
  assert.strictEqual(db.copyEntry(s3.id, s4.id, o, id), null, 'a copy of a bad row is refused');
  assert.strictEqual(count(s4.id), 0, 'and lands nothing in the other tale');
  db.delStory(s3.id); db.delStory(s4.id);
});
// ---- DELETING A CHAPTER, AND DELETING EVERYTHING BELOW A PASSAGE. Seth, 2026-08-30: "we also
// need a delete chapter and a way to delete anything after a specific answer", "deletion is
// deletion", "delete after deletes all prose below."
//
// Both lean on the cascade, and a cascade is a RUNTIME setting: `ON DELETE CASCADE` in a schema
// with `PRAGMA foreign_keys` off is a comment. So the prose going is asserted, not assumed.
ok('deleting a chapter takes its prose with it, and leaves the numbers where they are', () => {
  const s2 = db.createStory(o, { title: 'Cut', premise: 'p' }) as any;
  const base = { storyId: s2.id, branchId: s2.branchId };
  db.addPassage({ ...base, chapterId: s2.chapterId, body: 'chapter one' });
  const two = db.endChapter(s2.id, s2.branchId, 'Two') as any;
  db.addPassage({ ...base, chapterId: two.opened, body: 'chapter two' });
  const three = db.endChapter(s2.id, s2.branchId, 'Three') as any;
  db.addPassage({ ...base, chapterId: three.opened, body: 'chapter three' });
  assert.deepStrictEqual(db.chapters(s2.id).map((c: any) => c.idx), [1, 2, 3]);

  assert.strictEqual(db.delChapter(s2.id, two.opened).deleted, 1);
  assert.strictEqual(db.passagesOf(s2.id).filter((x: any) => x.chapter_id === two.opened).length, 0,
    'the chapter went and its prose stayed — PRAGMA foreign_keys is off');
  assert.strictEqual(db.passagesOf(s2.id).length, 2,
    'and it took prose that was not its own');

  // THE NUMBERS ARE NOT CLOSED UP, and this is the assertion that says so on purpose rather than
  // by omission. `entry_states.from_chapter`, `addons.from_chapter` and `retired_at_chapter` all
  // anchor to a chapter INDEX: closing the gap would move a fact that opens at chapter 3 onto a
  // chapter 3 that is a different chapter, silently, in every book with a timeline in it.
  assert.deepStrictEqual(db.chapters(s2.id).map((c: any) => c.idx), [1, 3],
    'the hole is the honest result; renumbering would move every timeline in the book');

  /* A BOOK KEEPS SOMEWHERE TO WRITE, and this used to be asserted as "keeps A chapter" — which is
   * how the real defect got through. The guard counted chapters on the branch, so deleting the only
   * OPEN one was allowed as long as a closed one remained: `view` then reported that closed chapter
   * as current and there was nowhere to write, with nothing on screen saying why.
   *
   * FOUND IN THE LIVE LIBRARY on 2026-09-01 and not by this test, which asserted the wrong rule:
   * "The Transaction of Silence", chapter one closed with 22 passages and no chapter two at all.
   * Seth had ended chapter one and deleted the empty chapter the close opened for him. */
  // ONE PRESS, NOT A CLEAN-UP (Seth, 2026-10-27: "we also need a simpler way of deleting scenes so
  // I don't have to ask you for the cleanup"). Deleting the only OPEN scene while another remains
  // used to be refused, and he had to ask for scene 1 to be reopened by hand. Now the latest scene
  // left is reopened in the same step, so the tale still has somewhere to write.
  const openOne = db.delChapter(s2.id, three.opened);
  assert.strictEqual(openOne.deleted, 1, 'the only open scene goes when another remains');
  assert.strictEqual(openOne.reopened, 1, 'and says which scene it opened again');
  assert.deepStrictEqual(db.chapters(s2.id).map((c: any) => [c.idx, c.status]), [[1, 'open']],
    'the latest scene left is open, so there is somewhere to write');
  // The last scene of all still cannot go: there would be no scene to write in.
  const last = db.delChapter(s2.id, db.chapters(s2.id)[0].id);
  assert.strictEqual(last.deleted, 0);
  assert.match(String(last.error), /only scene/);
  assert.strictEqual(db.chapters(s2.id).length, 1);
  db.delStory(s2.id);   // the shelf-counting checks below read every story this owner has
});

/* THE REPAIR FOR THE BOOKS THAT WERE ALREADY STRANDED, which the guard above cannot help.
 *
 * `migrate()` runs once at module load, so this state has to be built and the repair asked for
 * separately — which is why it is a named export rather than an inline block. It was inline first,
 * and that hid a second bug: it reached for `uid` and `now`, both declared BELOW the `migrate()`
 * call, so it threw "Cannot access 'uid' before initialization" the first time it ran. No suite could
 * see it, because a test database has no stranded book for the loop to run over — it fired against
 * the live library. The repair carries its own id and clock now.
 */
ok('a book whose last chapter is closed with none open gets one, and only that book', () => {
  const s3 = db.createStory(o, { title: 'Stranded', premise: 'p' }) as any;
  db.addPassage({ storyId: s3.id, branchId: s3.branchId, chapterId: s3.chapterId, body: 'one' });
  const two = db.endChapter(s3.id, s3.branchId) as any;
  // The state `delChapter` used to allow and now refuses, so it is built through a seam rather than
  // through a door — honest about what this repairs: a row that exists in a library, not a path still
  // open. Closing the newest chapter reaches the same invariant break without deleting anything.
  db.rawCloseChapter(s3.id, two.opened);
  assert.deepStrictEqual(db.chapters(s3.id).map((c: any) => [c.idx, c.status]),
    [[1, 'closed'], [2, 'closed']], 'the fixture really is a book with nowhere to write');

  // A HEALTHY BOOK BESIDE IT, so "repaired everything" fails as loudly as "repaired nothing".
  const well = db.createStory(o, { title: 'Fine', premise: 'p' }) as any;
  const before = db.chapters(well.id).length;

  const done = db.repairStrandedChapters();
  assert.ok(done.some((d: any) => d.storyId === s3.id), 'it says which book it opened one for');
  assert.deepStrictEqual(db.chapters(s3.id).map((c: any) => [c.idx, c.status]),
    [[1, 'closed'], [2, 'closed'], [3, 'open']],
    'numbered after the last, which is what endChapter would have left');
  assert.strictEqual(db.chapters(well.id).length, before, 'and a book that was fine is untouched');

  /* A NEWEST CHAPTER THAT IS CLOSED WHILE AN EARLIER ONE IS OPEN IS NOT STRANDED, and this is what
   * the `NOT EXISTS` clause is for. Deleting that clause passes every other check here, because a
   * book repaired above has an OPEN newest chapter and never reaches it — so the clause read as
   * redundant. It is not: closing chapter two while chapter one is still open leaves somewhere to
   * write, and a repair that opened a third would be inventing a chapter nobody asked for. */
  const odd = db.createStory(o, { title: 'Out of order', premise: 'p' }) as any;
  const oddTwo = db.endChapter(odd.id, odd.branchId) as any;
  db.rawCloseChapter(odd.id, oddTwo.opened);
  db.rawOpenChapter(odd.id, odd.chapterId);
  assert.deepStrictEqual(db.chapters(odd.id).map((c: any) => [c.idx, c.status]),
    [[1, 'open'], [2, 'closed']], 'the fixture is a book whose newest chapter is closed');
  assert.deepStrictEqual(db.repairStrandedChapters(), [],
    'a book with an open chapter is left alone, whichever one it is');
  assert.strictEqual(db.chapters(odd.id).length, 2, 'and gains nothing');
  db.delStory(odd.id);

  // IDEMPOTENT, because it runs on every boot. A second pass must find nothing.
  assert.deepStrictEqual(db.repairStrandedChapters(), [], 'a second run repairs nothing');
  assert.strictEqual(db.chapters(s3.id).length, 3, 'and adds no second one');
  db.delStory(s3.id); db.delStory(well.id);
});

ok('delete-after takes every passage below, every take of each, and only the summaries it cut', () => {
  const s3 = db.createStory(o, { title: 'Trim', premise: 'p' }) as any;
  const base = { storyId: s3.id, branchId: s3.branchId };
  db.addPassage({ ...base, chapterId: s3.chapterId, body: 'chapter one, untouched' });
  const c2 = db.endChapter(s3.id, s3.branchId, 'Two') as any;
  const keep = db.addPassage({ ...base, chapterId: c2.opened, body: 'the passage pointed at' });
  const below = db.addPassage({ ...base, chapterId: c2.opened, body: 'below it' });
  db.addVariant(s3.id, below, 'below it, rerolled');
  const c3 = db.endChapter(s3.id, s3.branchId, 'Three') as any;
  db.addPassage({ ...base, chapterId: c3.opened, body: 'a whole chapter below' });
  // A fourth, open and holding prose, so chapter three is a CLOSED chapter the cut empties. The
  // open chapter is never taken (see the test below), so without this one the claim about emptied
  // chapters would have nothing it is allowed to remove.
  const c4 = db.endChapter(s3.id, s3.branchId, 'Four') as any;
  db.addPassage({ ...base, chapterId: c4.opened, body: 'the chapter being written' });
  const ch = (id: string) => db.chapters(s3.id).find((c: any) => c.id === id) as any;
  const c1id = db.chapters(s3.id)[0].id;
  for (const id of [c1id, c2.opened, c3.opened]) db.setSummary(id, 'a summary', 1, 'h', 'model');

  // FOUR ROWS AND NOT THREE. A rerolled passage below the cut is two rows at one ordinal; leaving
  // the unselected ones leaves prose in the database that no screen can reach and that `delSlot`
  // could later promote back into the book.
  const cut = db.delAfter(s3.id, keep);
  assert.strictEqual(cut.deleted, 4, 'every take below the cut, not only the selected one');
  // AND THE CHAPTER IT EMPTIED. Chapter three held one passage and that passage was below the cut,
  // so what is left of it is a heading with no prose under it. Chapter two is NOT counted: the cut
  // lands in it and everything at or above the passage pointed at stays, so it is never empty.
  assert.strictEqual(cut.emptied, 1, 'the chapter left holding nothing goes with the prose');
  assert.deepStrictEqual(db.chapters(s3.id).map((c: any) => c.idx), [1, 2, 4],
    'and only that one — the cut chapter, everything before it, and the open chapter stay');
  // EVERY TAKE, counted through `variantsBySlot` and not `passagesOf`. The latter reads the book
  // — one row per slot — so an implementation that deleted only the selected take would leave the
  // rerolled one in the database and this would still say 2. Falsified: adding `AND selected = 1`
  // to the DELETE has to redden the line that makes the claim, not one three lines further down.
  const takes = [...db.variantsBySlot(s3.id).values()].reduce((a: number, v: any) => a + v.length, 0);
  assert.strictEqual(takes, 2, 'what was at or above the cut stays, and nothing else survives');

  // A chapter summary rides in every prompt. One describing prose that no longer exists is the
  // engine telling the model about a scene the book does not contain.
  assert.strictEqual(ch(c2.opened).summary, null, 'the chapter it cut into loses its summary');
  assert.strictEqual(ch(c2.opened).summary_author, null, 'and who wrote it (#43)');
  assert.strictEqual(ch(c3.opened), undefined, 'the emptied chapter is gone, summary and all');
  // The negative case, which is what stops this passing against an implementation that simply
  // clears every summary in the book.
  assert.strictEqual(ch(c1id).summary, 'a summary',
    'a chapter that lost nothing keeps what it had');

  assert.strictEqual(db.delAfter(s3.id, keep).deleted, 0, 'nothing below it the second time');
  db.delStory(s3.id);
});

// FOUND IN THE LIVE LIBRARY on 2026-10-17, twice in one book: "The Lands Between", chapters five
// and six. The writer closed a chapter, then pressed delete-after on its last passage. That cut
// the break the close had written, which left the chapter the close opened empty, and delete-after
// took it as an emptied chapter. The book was left with every chapter closed and nowhere to write,
// the state `delChapter` already refuses to make. The open chapter stays, empty.
ok('delete-after never takes the open chapter, so a book keeps somewhere to write', () => {
  const b = db.createStory(o, { title: 'Undo the close', premise: 'p' }) as any;
  const base = { storyId: b.id, branchId: b.branchId };
  const last = db.addPassage({ ...base, chapterId: b.chapterId, body: 'the last passage' });
  db.addPassage({ ...base, chapterId: b.chapterId, body: '', author: 'human', isBreak: true });
  db.endChapter(b.id, b.branchId);
  const cut = db.delAfter(b.id, last);
  assert.strictEqual(cut.deleted, 1, 'the break below the cut goes');
  assert.strictEqual(cut.emptied, 0, 'and the open chapter is not counted as emptied');
  assert.deepStrictEqual(db.chapters(b.id).map((c: any) => [c.idx, c.status]),
    [[1, 'closed'], [2, 'open']], 'the chapter the close opened survives');
  db.delStory(b.id);
});

ok('deleting a story cascades', () => {
  db.delStory(s.id);
  assert.strictEqual(db.listStories(o).length, 0);
  assert.strictEqual(db.passagesOf(s.id).length, 0);
});
// The boot banner read `library 7 stories` on a box holding nine, because it counted
// `listStories(owner(DESK))` — one writer's shelf — and labelled it the library. It looked like
// rows going missing and was written into a handoff as a discrepancy before anyone read the line.
//
// So the check is the invariant the banner needs and not the SQL: the per-writer counts must SUM
// to the whole table, and each one must equal what that writer's own shelf returns. A count that
// agrees with the shelf but not with the table is the original bug; one that agrees with the table
// but not with a shelf would put a number on screen that no page can reproduce.
ok('the per-writer counts sum to the library, and each matches that writer\'s shelf', () => {
  const other = db.owner('kia-test');
  db.createStory(o, { title: 'Mine 1' });
  db.createStory(o, { title: 'Mine 2' });
  db.createStory(other, { title: 'Theirs' });

  const shelves = db.storiesPerOwner();
  const total = shelves.reduce((t, w) => t + w.n, 0);
  const rows = db.allStoriesForExport().length;
  assert.strictEqual(total, rows,
    `the banner would say ${total} on a library of ${rows}. It counts one shelf and calls it the box.`);

  assert.ok(shelves.length >= 2, 'both writers must appear, or a whole shelf is invisible');
  for (const w of shelves) {
    assert.strictEqual(w.n, db.listStories(db.owner(w.login)).length,
      `${w.login} is counted as ${w.n} but their shelf renders ${db.listStories(db.owner(w.login)).length}`);
  }
  // And a writer with no books is not a row: an empty name in a banner reads as a bug.
  db.owner('ghost-test');
  assert.ok(!db.storiesPerOwner().some((w) => w.login === 'ghost-test'),
    'a writer with no books must not appear');
});

ok('backup writes a readable snapshot', () => {
  const b = db.backup('/tmp/anansi-test-backups', 3);
  assert.ok(b.bytes > 0);
});

// The bug this is written from, 2026-08-30. The prune filtered on `.endsWith('.db')`, so every
// database in the directory was a candidate — including the snapshot somebody took by hand before
// a risky change, which is the one file nobody can regenerate. And names sort: `pre-*` sorts above
// `anansi-*`, so twelve hand-made files filled all twelve keep-slots and the snapshot the call had
// just written was the thirteenth. It deleted its own output, then stat'd it, and the server
// printed `backup failed: ENOENT` on every boot for twelve boots while real backups were eaten.
//
// Both halves are asserted separately because they fail separately: a hand-made file must survive,
// AND the new snapshot must survive being outnumbered by them.
ok('backup prunes only what it wrote, and never its own new file', () => {
  const mk = (dir: string, names: string[]) => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const n of names) writeFileSync(join(dir, `${n}.db`), 'not really a database');
  };

  // A · FOREIGN NAMES THAT SORT ABOVE `anansi-`. This is the live failure: twelve hand-made
  // `pre-restart-*.db` files filled all twelve keep-slots, so the snapshot the call had just
  // written was the thirteenth and was deleted before its own statSync ran.
  const a = '/tmp/anansi-test-prune-a';
  mk(a, ['pre-restart-1', 'pre-restart-2', 'pre-craft-backfill']);
  let b: ReturnType<typeof db.backup> | undefined, threw: any;
  try { b = db.backup(a, 3); } catch (e) { threw = e; }
  assert.ok(!threw,
    `backup threw instead of returning (${threw?.code ?? threw?.message}). It pruned the snapshot `
    + 'it had just written and then stat-ed it. This is the boot-time "backup failed: ENOENT".');
  assert.ok(existsSync(b!.file), `the snapshot is gone: ${b!.file}`);

  // B · FOREIGN NAMES THAT SORT BELOW IT. The worse half, because nothing fails: the call returns
  // cleanly, the boot log says `backup 8412 KB, keeping 12`, and a snapshot somebody took by hand
  // before a risky change is quietly gone. Separated from A because under the old filter A threw
  // before this could ever be asserted.
  const c = '/tmp/anansi-test-prune-b';
  mk(c, ['aaa-taken-by-hand']);
  db.backup(c, 1);
  assert.ok(existsSync(join(c, 'aaa-taken-by-hand.db')),
    'backup pruned a file it did not write, and reported success. A hand-made snapshot is the one '
    + 'file that cannot be regenerated, and this function is not allowed to touch it.');

  // And it still prunes its OWN, or "keeping 12" is a lie in the other direction. Staged by
  // writing the old snapshots rather than by calling backup in a loop: the name is a millisecond
  // timestamp and VACUUM INTO refuses an existing target, so four calls in one tick throw on a
  // collision. That is a real edge and it is not this check's subject.
  for (const t of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'])
    writeFileSync(join(a, `anansi-${t}T00-00-00-000Z.db`), 'older snapshot');
  db.backup(a, 3);
  const mine = readdirSync(a).filter((f) => f.startsWith('anansi-'));
  assert.ok(mine.length <= 3, `keep=3 should leave at most 3 of its own, left ${mine.length}`);
  assert.ok(existsSync(join(a, 'pre-craft-backfill.db')), 'and pruning its own still spares theirs');
  for (const d of [a, c]) rmSync(d, { recursive: true, force: true });
});

// --- regressions for the bugs found in the 2026-08-23 review ---
const story = await import('../src/story.ts');
const render = await import('../src/render.ts');

ok('the reserve scales with the budget and with the reply length', () => {
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  // The 6% margin follows the budget in use, not the slot: a story capped at 4,000 used to
  // lose 1,501 to a margin sized for 25,024.
  const small = story.budgetFor({ maxContext: 4000 }, slot);
  const full = story.budgetFor({ maxContext: null }, slot);
  assert.ok(full > small && full < 25024);
  // 60% OF THE ROOM SYSTEM LEAVES, not 60% of the cap. This read `4000 * 0.6` until COUNCIL-06
  // ship 5, when it went red for the wrong reason: SYSTEM grew from 430 tokens to 551 and a
  // 4,000-token story dropped to 2,309. That is not the margin bug this check was written for —
  // it is a fixed cost that does not scale and is not supposed to. Conflating the two made this
  // an undocumented ceiling on SYSTEM's length that would have been discovered by deleting a
  // rule to make a test pass.
  const sys = story.estimate(render.SYSTEM);
  assert.ok(small > (4000 - sys) * 0.6, `a 4000-token story kept only ${small} of ${4000 - sys}`);
  // The bug itself, stated as the number it produced: a margin sized for the slot took 1,501
  // tokens off a 4,000-token story. Anything near that is the bug back.
  assert.ok(small > 4000 - 900 - 1501 - sys + 400,
    `the margin is being sized for the slot again: ${small}`);

  // And the output reserve follows max_tokens, because the guard only counts the prompt.
  // A longer reply with a constant reserve ran prompt+output past the slot, green.
  const short = story.budgetFor({ maxContext: null }, slot, 600);
  const long = story.budgetFor({ maxContext: null }, slot, 2000);
  assert.strictEqual(short - long, 1400, 'every extra reply token costs a prompt token');
});

/* WHAT THE BOOT-TIME FALLBACK WAS WORTH, in the only units that matter (2026-09-11).
 *
 * `serve.ts` read the per-slot context once before it listened and kept `perSlot: 8192` when that
 * threw — which it does whenever the router has the model asleep. The fallback then stood for the
 * life of the process: one boot ran 33 hours on it, and a writer was refused mid-book with "over
 * budget by 1015 tokens; the server would drop SPINE" on a book that had nothing wrong with it.
 *
 * The retry that fixes it is `slotNow`, checked in `test/engine.ts`. THIS is the half that says why
 * anybody should care, and it is here rather than there because `budgetFor` lives in `story.ts`,
 * which imports `db.ts` — a suite with no ANANSI_DB set that imports it reaches for the live
 * library (db.ts refuses it that now; the check is at the end of this file).
 *
 * Both numbers are written out rather than derived, so a change to the formula has to come and
 * change them by hand and see what it is doing to a book. */
ok('the slot the router reports is worth seven times the floor assumed without it', () => {
  const floor = { global: 0, slots: 1, perSlot: 8192 };
  const real = { global: 100096, slots: 2, perSlot: 50048 };
  assert.strictEqual(story.budgetFor({ maxContext: null }, floor, 900), 6245,
    'the assumed floor leaves 6,245 tokens — the number that refused a healthy book for 33 hours');
  assert.strictEqual(story.budgetFor({ maxContext: null }, real, 900), 45590,
    "and the router's own answer leaves 45,590");
});

// The ceiling stopped being the setting on 2026-08-30, because it was a guillotine: 41 of 181
// prose runs at the old 450 default ended exactly ON it, mid-word. What the writer sets is a
// target; this is the only place it becomes a ceiling.
ok('the ceiling is derived from the target, and never sits under what the model actually writes', () => {
  // Off is the default and has to stay well clear: 0 hits in 212 logged runs at 900.
  assert.strictEqual(story.capFor(0), 900, '"let him decide" must not reintroduce a low ceiling');
  // The floor holds for small targets — a 200-word target does not license a 560-token ceiling,
  // because the model's observed maximum was 845 whatever it was asked for.
  assert.strictEqual(story.capFor(200), 900, 'a small target must not lower the ceiling');
  // Above the floor it tracks the target at 2x, which sits above the observed spread.
  assert.strictEqual(story.capFor(400), 1120);
  // And it is clamped at the slider's own end, 2,000 words since 2026-10-24: the ceiling comes out of
  // the book's budget, so a longer one leaves less room for the book and never oversubscribes.
  assert.strictEqual(story.capFor(1000), 2800, 'a 1,000-word target is no longer clamped');
  assert.strictEqual(story.capFor(2000), 5600);
  assert.strictEqual(story.capFor(5000), 5600, 'the outer clamp still holds');
  // The property that matters more than any single number: the ceiling is never below the floor
  // and never above the clamp, for every target the slider can produce.
  for (let w = 0; w <= story.MAX_TARGET_WORDS; w += 10) {
    const cap = story.capFor(w);
    assert.ok(cap >= 900 && cap <= 5600, `capFor(${w}) = ${cap} escaped the bounds`);
    // Headroom, stated as the thing the bug was: the ceiling must leave room ABOVE the target it
    // was derived from, or it is a guillotine again wearing a different number.
    assert.ok(cap > w * 1.4, `capFor(${w}) leaves no room above its own target`);
  }
});

// A passage the ceiling cut is trimmed back to its last finished sentence. Only ever called on
// `finish_reason: 'length'` — the caller enforces that, because trimming a take the model ended
// itself would delete prose on purpose.
ok('a truncated passage is trimmed to its last finished sentence, and never to nothing', () => {
  assert.strictEqual(story.trimToSentence('He left. She stayed. Then the'), 'He left. She stayed.');
  // The voice guide asks for trailing lines by name — "Thoughts trail; sentences stop mid-breath"
  // — so a dash or an ellipsis IS a finished line here. Eating them would be the same defect as
  // the guillotine, one clause smaller.
  //
  // BOTH FIXTURES CARRY AN EARLIER FULL STOP ON PURPOSE. Written as 'She almost said it —' these
  // passed whether or not the dash was in the boundary class: with it gone there was no boundary
  // at all, the no-match fallback returned the string whole, and the check reported the dash
  // "kept" while testing nothing. With a preceding sentence, dropping the dash walks the trim
  // back to it and eats the clause, which is the defect stated.
  assert.strictEqual(story.trimToSentence('He left. She almost said it —'),
    'He left. She almost said it —');
  assert.strictEqual(story.trimToSentence('He left. He waited…'), 'He left. He waited…');
  // Closing punctuation rides along, or every line of dialogue loses its quote mark.
  assert.strictEqual(story.trimToSentence('"Then go," she said. "I will not st'),
    '"Then go," she said.');
  // THE ONE THAT MATTERS MOST. A passage with no boundary anywhere comes back whole: turning a
  // truncated take into an EMPTY one is strictly worse than the bug being fixed.
  assert.strictEqual(story.trimToSentence('the rain had not yet'), 'the rain had not yet');
  // Already finished is left alone rather than walked back to the previous sentence.
  assert.strictEqual(story.trimToSentence('He left. She stayed.'), 'He left. She stayed.');
});

// PLAN-06 2a. The check this replaces divided a fixture by 2.74 and compared it to an estimate
// that divided by 2.8 — it asserted the constant against ITSELF, could not fail while those two
// numbers agreed, and reported the estimator "within 15%" for as long as it was 59% out against
// 147 real calls. A comment saying "measured against /tokenize" is not a measurement.
ok('the estimator errs high against measured tokens, and against the lowest model, not the median', () => {
  // Ground truth off the generation log, 2026-08-28, via bench/drift.ts: row g-d8a77e3c is a
  // prompt of 18,107 characters that the server charged 4,067 tokens for — 4.45 chars/token on
  // Qwen3.6-WNTH-35B-A3B-NN. estimate() reads only `.length`, so the fixture's job is its size.
  const CHARS = 18_107, CHARGED = 4_067;
  const est = story.estimate('x'.repeat(CHARS));
  assert.ok(est >= CHARGED,
    `estimate ${est} is UNDER the ${CHARGED} tokens the server actually charged for this many `
    + 'characters. Low is the dangerous direction: buildContext lets the prompt through and '
    + 'fits() refuses it afterwards, which the writer sees as an error instead of as a trim.');

  // The rule the constant is chosen by, asserted rather than described. bench/drift.ts measured
  // 4.28 chars/token on rp-t-glm47flash-h over 45 calls — the LOWEST of any model with ten or
  // more. A divisor above that estimates low for whoever is writing on that model, which is the
  // whole reason this is not simply set to the 4.45 median of the model in front of us.
  const divisor = CHARS / est;
  assert.ok(divisor <= 4.28,
    `the divisor in force is ${divisor.toFixed(2)}, above the lowest chars/token measured across `
    + 'models (4.28, rp-t-glm47flash-h, n=45). Pick the lowest and round down, never the median '
    + 'and never the model you happen to be using — two writers may be on two tokenizers.');
  assert.ok(divisor >= 3.5,
    `the divisor in force is ${divisor.toFixed(2)}, which re-creates the over-estimate 2a was: `
    + 'at 2.8 every ceiling evicted 59% earlier than the slot required.');
});

// PLAN-06 2d. SYSTEM is prepended by render() and is not a block, so buildContext never saw it
// and the ceilings were cut from room that was already spent. Worth saying what this did NOT fix:
// the 6% margin was quietly large enough to absorb SYSTEM, so nothing was overflowing. What was
// wrong was the number — `totals.budget` told the writer they had ~445 tokens they did not, and
// the 45%/25%/60% ceilings were fractions of that wrong number.
ok('SYSTEM is spent before the budget is offered, because it is on the wire either way', () => {
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const cap = 25024, reply = 900;
  const b = story.budgetFor({ maxContext: null }, slot, reply);
  const ifSystemWereFree = cap - Math.max(600, reply) - Math.floor(cap * 0.06);
  assert.strictEqual(ifSystemWereFree - b, story.estimate(render.SYSTEM),
    'the budget must be short by exactly SYSTEM. Without the deduction the engine believes it '
    + 'has room that render() has already spent, and every ceiling is a fraction of a number '
    + 'that was never true.');
  // 150, not 300. COUNCIL-06 ship 5 moved the craft rules out of SYSTEM and into DEFAULT_VOICE,
  // where the writer can edit them, and SYSTEM went 430 -> 235. The number this guards against is
  // ZERO — a SYSTEM that has moved somewhere else entirely, leaving the deduction deducting
  // nothing — so it must sit below where SYSTEM actually is and not act as a floor on its length.
  assert.ok(story.estimate(render.SYSTEM) > 150,
    'SYSTEM costs real tokens — if this ever reads near zero, SYSTEM has moved and the deduction '
    + 'is deducting nothing');

  // SYSTEM IS SENT TO THE MODEL. Every line in it is an instruction, so a note ABOUT the prompt
  // written inside the prompt is an instruction too — and on 2026-08-30 one nearly went in: an
  // explanation of why a bullet had been deleted, complete with a finding number and a percentage,
  // pasted between two rules. It would have reached the model on every call for the life of the
  // app. Notes about the prompt belong in a code comment above the constant, where they are read
  // by people and not by the writing model.
  for (const tell of [/COUNCIL-\d/, /\bF\d\d\b/, /P0-FINDINGS/, /\.ts:\d/, /was here\. Removed/]) {
    assert.doesNotMatch(render.SYSTEM, tell,
      `SYSTEM carries what reads as a note about itself (${tell}). It is sent to the model — put `
      + 'the note in a code comment above the constant instead.');
  }
});

// COUNCIL-06 ship 5 merged Seth's craft block into `DEFAULT_VOICE`, and nine of its lines restated
// a bullet that already existed. The merge took one version of each. This is the check that says
// nobody re-adds the other one later, in either of the two places a standing rule can live.
ok('no rule is said twice, in one block or across SYSTEM and the house voice', () => {
  const lines = (t: string) => t.split('\n').filter((l) => l.trim().startsWith('- '));
  const sys = lines(render.SYSTEM), voice = lines(prompts.DEFAULT_VOICE);
  assert.ok(sys.length >= 8, `SYSTEM should still be a real list, got ${sys.length}`);
  assert.ok(voice.length >= 12, `the house voice carries the craft now, got ${voice.length}`);

  for (const [where, ls] of [['SYSTEM', sys], ['DEFAULT_VOICE', voice]] as const) {
    const seen = new Map<string, string>();
    for (const b of ls) {
      const key = b.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
      assert.ok(!seen.has(key), `two ${where} bullets say the same thing:\n  ${seen.get(key)}\n  ${b}`);
      seen.set(key, b);
    }
  }

  // AND ACROSS THE TWO BLOCKS, which is the whole architecture of ship 5. SYSTEM is fixed and the
  // voice is the writer's to edit, so a rule in both is a rule they cannot turn off: they delete
  // it from the voice, it keeps arriving from SYSTEM, and the field stops meaning anything. That
  // is why the craft moved OUT of SYSTEM rather than being copied into the voice.
  //
  // Five-word windows rather than whole lines: two of the craft block's lines were already in
  // DEFAULT_VOICE as prose — "anchor every scene in sensation, texture and distance" and "let the
  // story unfold through ritual, risk and desire" — the same instruction with different wording
  // either side, which an equality check would not see.
  //
  // ITS CEILING, so nobody reads a pass as proof there is no duplication: five words is a floor on
  // what counts, and a rule restated in four words or in synonyms goes through. Dropping to four
  // produced false positives on ordinary phrasing, so this catches copy-paste and near-copy-paste
  // and nothing subtler. ponytail: lexical, not semantic; a real one needs the model and is not
  // worth a call per test run.
  const words = (t: string) => t.toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(Boolean);
  const w = words(prompts.DEFAULT_VOICE);
  const grams = new Set<string>();
  for (let k = 0; k + 5 <= w.length; k++) grams.add(w.slice(k, k + 5).join(' '));
  for (const b of sys) {
    const bw = words(b);
    for (let k = 0; k + 5 <= bw.length; k++) {
      const g = bw.slice(k, k + 5).join(' ');
      assert.ok(!grams.has(g),
        `SYSTEM and DEFAULT_VOICE both say "${g}". One has to give it up — the voice, if the `
        + `writer should be able to switch it off; SYSTEM, if they should not.\n  ${b}`);
    }
  }
});

// THE ARCHITECTURE, stated as a check rather than as a comment: craft is the writer's and the
// output contract is not. A craft rule that drifts back into SYSTEM is not overridable by anyone,
// which is the thing ship 5 exists to undo.
ok('SYSTEM keeps the contract and the house voice keeps the craft', () => {
  const craft = [/jaw does not clench/i, /one strong image/i, /vary the rhythm/i,
                 /what the point of view allows/i, /never with a wink/i, /no cliche/i,
                 // Added 2026-08-30 when it moved out of SYSTEM. It is in this list rather than
                 // only in the struck row because this is the list that says WHY it is in the
                 // voice: craft is the writer's, and a rule they cannot delete is not a default.
                 /plainly functional exchange/i];
  for (const rx of craft) {
    assert.doesNotMatch(render.SYSTEM, rx,
      `a craft rule is back in SYSTEM (${rx}), where the writer cannot delete it. It belongs in `
      + 'DEFAULT_VOICE, which is a default precisely so it can be overridden.');
    assert.match(prompts.DEFAULT_VOICE, rx, `and the house voice has lost one: ${rx}`);
  }
  // The other half of the same rule: the contract must NOT be in the voice, where a writer who
  // replaces it wholesale would silently switch off "output prose only" and canon arbitration.
  // COUNCIL-06 §3's other free item, shipped in the same commit as the <mode> fence: "If uncertain
  // about a canon fact, write around it rather than inventing one." It is contract, not craft —
  // it settles what to do when the canon does not answer, which is the same question as "the canon
  // wins" and belongs on the same side of the line. A writer replacing their voice must not
  // thereby give the model permission to invent. Nothing is claimed for it; it is one free line.
  // LITOTES AND CONTRACTIONS ARE IN SYSTEM, on Seth's call, 2026-08-30. They were put in the voice
  // first on the reasoning above — craft is the writer's — and he overruled it: "i want it in
  // system". He is right about the shape. Both are PROHIBITIONS AND PERMISSIONS ON THE OUTPUT, not
  // descriptions of how a book should sound: "no double-negation emphasis" is the same kind of
  // sentence as "never break the frame", where "vary the rhythm" is not. And a book with its own
  // voice replaces the voice; the point of these two is that no book gets to opt out.
  //
  // The cost is stated rather than hidden: a writer cannot delete them, which is the exact thing
  // the loop above exists to prevent for craft. That is the trade he chose.
  // The gap rule was worded "write around it rather than inventing one" until 2026-09-01, when Seth
  // rewrote SYSTEM: "preserve continuity with what is explicitly stated and do not invent
  // contradictions. Leave the gap rather than fill it with speculation." Same contract, more of it —
  // it now also forbids inventing a CONTRADICTION, not only inventing into silence. The regex
  // follows the wording because what is guarded is the clause, not the sentence it was first
  // written in; delete the clause and this still goes red.
  for (const rx of [/Output prose only/i, /the canon wins/i, /Never break the frame/i,
                    /Leave the gap rather than fill it/i, /do not\s+invent contradictions/i,
                    /No litotes/i, /No double-negation emphasis/i, /Contractions are correct/i,
                    // The FORMS, added 2026-08-30 at Seth's ask and guarded separately from the
                    // rule. F37 is the reason there is a difference worth guarding: the same rule
                    // as an adjective bought 10.7% and the version naming the forms holds at ~98%,
                    // so a rewrite that keeps the sentence and drops the examples is a rewrite that
                    // keeps the appearance of the finding and throws the finding away.
                    // ALL THREE, not one of them. Checking only "not unkind" meant the other two
                    // could go and this stayed green — found by deleting them on 2026-09-01. If the
                    // forms are the finding, then each form is part of it.
                    /not unkind/i, /no small thing/i, /hardly a surprise/i]) {
    assert.match(render.SYSTEM, rx, `SYSTEM has lost part of the contract: ${rx}`);
    assert.doesNotMatch(prompts.DEFAULT_VOICE, rx,
      `the output contract is in the voice (${rx}), where replacing the voice turns it off`);
  }
});

// Each of these was in the craft block Seth sent and each was left out with a reason, so leaving
// them out is a decision and not an oversight. Anyone may overrule any line here — but by deleting
// its row and reading why first, rather than by pasting the line back and never seeing this.
ok('the lines the council struck stay struck, and say why', () => {
  const struck: [RegExp, string][] = [
    [/begin in action or sensation/i,
     'a SCENE-OPENING rule that fired on every mid-scene beat, which is what Anansi mostly writes. '
     + 'It also contradicts the narrate mode prompt, which says to pick up mid-thought.'],
    [/gestures invoke/i,
     'three fragments with no form in them, restating the suggest-rather-than-explain bullet'],
    [/mirrors internal state/i,
     'pathetic fallacy as a standing instruction: the weather agreeing with the mood on every page'],
    [/combat is emotionally charged/i,
     'genre furniture in a default that has to serve a domestic two-hander as well as a war'],
    [/advance information or deepen subtext/i,
     'bans the flat domestic exchange, which is a register this library actually writes in. '
     + 'SETH RULED ON THIS ONE, 2026-08-30, and the gap it left was real: every dialogue rule in '
     + 'DEFAULT_VOICE is about rhythm and none of them said a line should be doing work. A '
     + 'PERMISSION-SHAPED version now ships in DEFAULT_VOICE — "A line moves information or '
     + 'deepens what is not said. A plainly functional exchange is legitimate; do not inflate one '
     + 'into significance." It spent one commit in SYSTEM and Seth moved it: a rule about how the '
     + 'prose reads is the writer\'s to delete. So this row no longer means "no rule of this kind '
     + 'ships". It means THE BAN does not ship, because the ban is the part that was wrong'],
    [/last three passages/i,
     'the model cannot delimit three passages in the prompt it is given, and the sentence after '
     + 'it — "Wait." — addresses a person'],
  ];
  for (const [rx, why] of struck) {
    for (const [where, text] of [['SYSTEM', render.SYSTEM], ['DEFAULT_VOICE', prompts.DEFAULT_VOICE]] as const) {
      assert.doesNotMatch(text, rx, `struck by COUNCIL-06 ship 5 and back in ${where}: ${why}`);
    }
  }

  // THE OTHER HALF OF THE ROW ABOVE. It now says a permission-shaped dialogue rule ships in
  // SYSTEM, and a reason that describes something no longer true is the exact failure the #26
  // audit caught — a false claim in a record the next session reads instead of checking. So the
  // claim is asserted, not merely written: if the bullet is deleted, this reason must be rewritten
  // in the same commit.
  // MATCH AGAINST WHITESPACE-COLLAPSED TEXT, not against the raw constant. These bullets wrap in
  // a template literal and the wrap point MOVES when the wording is edited — this assertion went
  // red twice on a line break rather than on the thing it checks, once when the bullet was written
  // and once when it moved from SYSTEM to the voice and the wrap landed a word later. A check that
  // fails on reformatting trains people to edit the check.
  const flat = (t: string) => t.replace(/\s+/g, ' ');
  assert.match(flat(prompts.DEFAULT_VOICE), /A plainly functional exchange is legitimate/,
    'the struck row for the dialogue ban says a permission-shaped version ships in DEFAULT_VOICE. '
    + 'It does not. Fix the bullet or fix the row — a reason that lies is worse than no row.');
  assert.doesNotMatch(render.SYSTEM, /plainly functional exchange/,
    'the dialogue rule is back in SYSTEM, where a writer cannot delete it. It was there for one '
    + 'commit on 2026-08-30 and Seth moved it out.');
  for (const where of [render.SYSTEM, prompts.DEFAULT_VOICE])
    assert.doesNotMatch(where, /every line|each line must|must carry/i,
      'the dialogue rule has drifted back into a ban. The flat domestic exchange is a register '
      + 'this library writes in, which is why the original line was struck.');
});

// #11 · Anansi's speaking voice went into TALK on 2026-08-30, and Seth's rule about it was
// "she only uses it in chat, not in the threads or cards or anything else". This is that rule.
//
// TALK is the only role whose output the writer reads and nothing stores. Every other role
// produces a card body, a summary, a beat or a story field, and every one of those is re-sent to
// the WRITING model on later calls — so a persona in them is not a style choice, it is
// contamination. F36 measured what finished English in a prompt does: it is lifted verbatim into
// the prose. Her register would reach the book through the ledger, and no check reads the ledger
// for it.
ok('the persona is in the chat prompt and in no other', () => {
  const marks: [RegExp, string][] = [
    [/civilisations rise and fall/i, 'the scholar framing'],
    [/you do not boast/i,            'the trickster undercurrent'],
    [/elevated and precise/i,        'the diction rule'],
    [/leaning, gesturing/i,          'the no-body constraint'],
    [/phonetic dialect/i,            'the no-dialect constraint'],
    [/exclamatory enthusiasm/i,      'the contained-interest constraint'],
  ];
  for (const [rx, what] of marks) {
    assert.match(prompts.TALK_VOICE, rx, `TALK_VOICE has lost ${what} (${rx})`);
  }
  // Every other prompt in the file, found by asking the module rather than by keeping a list --
  // a list is the thing that goes stale the day somebody adds a role.
  //
  // COUNCIL-07 · TALK_CONTRACT IS DELIBERATELY NOT EXCLUDED HERE, and that is the point of the
  // split rather than an oversight. The contract ships whatever the writer puts in the voice box,
  // so a register that leaked into it would be one no writer could delete -- the same argument
  // `render.ts` makes about SYSTEM. Leaving it in `others` is what proves the division holds.
  const others = Object.entries(prompts)
    .filter(([k, v]) => typeof v === 'string' && k !== 'TALK_VOICE' && k !== 'DEFAULT_VOICE');
  assert.ok(others.length > 8, `expected the other roles to be found, got ${others.length}`);
  assert.ok(others.some(([k]) => k === 'TALK_CONTRACT'),
    'TALK_CONTRACT must be among the prompts checked for a register. If it has been excluded, the '
    + 'split has stopped meaning anything: the contract is the half a writer cannot edit.');
  for (const [name, text] of others as [string, string][]) {
    for (const [rx, what] of marks) {
      assert.doesNotMatch(text, rx,
        `${name} carries ${what}. Only TALK_VOICE may: everything ${name} returns is stored and `
        + 're-sent to the writing model, so a register there reaches the book through the ledger.');
    }
  }
});

// COUNCIL-07 · THE CONTRACT IS THE APP'S AND THE VOICE IS THE WRITER'S, checked both ways, the way
// `render.ts`'s SYSTEM/DEFAULT_VOICE division already is. Seth asked for Anansi's register to be
// his to edit; the half of that prompt which keeps her honest on a route that files proposals into
// the ledger had to stay where he cannot delete it by rewriting her diction.
ok('what keeps Anansi honest is in the contract, not in the box the writer can empty', () => {
  const contract: [RegExp, string][] = [
    [/do not fill the gap with invention/i, 'the ban on inventing what the story does not say'],
    [/Cite what you are drawing on/i,       'the citation rule'],
    [/Offer nothing you were not asked for/i, 'the ban on handing back a queue of work'],
    [/as a figure of speech/i,              'the ban on the words that are entries on the screen'],
    [/leave the field EMPTY/i,              'the rule that an unasked-for directive is not offered'],
  ];
  for (const [rx, what] of contract) {
    assert.match(prompts.TALK_CONTRACT, rx, `TALK_CONTRACT has lost ${what} (${rx})`);
    assert.doesNotMatch(prompts.TALK_VOICE, rx,
      `${what} is in TALK_VOICE, which is the box the writer replaces -- rewriting her diction `
      + 'would switch it off. It belongs in TALK_CONTRACT, which ships whatever the box says.');
  }
});

// The web is Anansi's natural image and this app has taken the words. Thread and String are
// entries on the writer's screen while they are reading her answer, so the metaphor reads as her
// filing something rather than as a figure of speech. The contract carries both a list of images
// to use and a list to avoid, and the two lists contradicting each other is a real way for this to
// rot: "weave" was on the SAY list until 2026-08-30 and is on the AVOID list now.
//
// BOTH LISTS ARE IN TALK_CONTRACT, which is where the split of 2026-08-30 put them and not where
// diction would suggest. "Say knot, snag, loose end" reads like register, but it is the other half
// of a ban that exists because Thread and String are things on the writer's screen. Separated, the
// ban outlives the word it was offering as a replacement, and this check cannot see either list.
ok('the images Anansi is told to use are not also the ones she is told to avoid', () => {
  // ONE regex over both lists, not two. Written as two it passed while reading the wrong list:
  // /Say ([^.]+)\./ matched "Say perhaps, indeed, consider..." nine lines earlier, so the check
  // compared the diction list against the ban list, found no overlap, and went green with the
  // real lists never examined. It only showed up because the falsification did NOT go red.
  const m = prompts.TALK_CONTRACT.match(/Say ([^.]+)\.\s+Do NOT use ([^—]+?) as a figure of speech/);
  assert.ok(m, 'the say-list and the avoid-list must sit in one paragraph and be findable');
  const [, say, ban] = m!;
  const wordsOf = (t: string) => t.toLowerCase().match(/[a-z]+/g)!.filter((w) => w !== 'or' && w !== 'and');
  const banned = new Set(wordsOf(ban!));
  for (const w of wordsOf(say!)) {
    assert.ok(!banned.has(w),
      `TALK_CONTRACT tells her to say "${w}" and also not to use it. One of the two lists is wrong.`);
  }
});

ok('regenerating a passage does not show the model the passages after it', () => {
  const s2 = db.createStory(o, { title: 'W' });
  // Distinctive bodies, not ordinary words. These were 'first'/'second'/'third'/'fourth', and the
  // day the default point of view became "second person, present tense" the prompt legitimately
  // contained the word `second` and this test failed for a reason that had nothing to do with it.
  // A substring assertion on a common word is a fixture waiting to lie either way round.
  const bodies = ['PASSAGE-ALPHA', 'PASSAGE-BRAVO', 'PASSAGE-CHARLIE', 'PASSAGE-DELTA'];
  const ids = bodies.map((b) => db.addPassage({ ...s2, storyId: s2.id, body: b }));
  const v = story.view(s2.id)!;
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const target = v.passages.find((p: any) => p.body === 'PASSAGE-BRAVO')!;
  const whole = story.assemble(v, slot, 'direct', 'go');
  const upTo  = story.assemble(v, slot, 'direct', 'go', target.ordinal);
  assert.ok(whole.prompt.includes('PASSAGE-DELTA'), 'a normal call sees the whole document');
  assert.ok(!upTo.prompt.includes('PASSAGE-DELTA'), 'a regenerate must not see the future');
  assert.ok(!upTo.prompt.includes('PASSAGE-BRAVO'), 'nor the passage it is replacing');
  assert.ok(upTo.prompt.includes('PASSAGE-ALPHA'), 'but must see what came before');
  db.delStory(s2.id);
});

ok('variants survive the grouped query', () => {
  const s3 = db.createStory(o, { title: 'G' });
  const a = db.addPassage({ ...s3, storyId: s3.id, body: 'take one' });
  db.addVariant(s3.id, a, 'take two');
  db.addPassage({ ...s3, storyId: s3.id, body: 'a later passage' });
  const v = story.view(s3.id)!;
  const first = v.passages.find((p: any) => p.body === 'take two')!;
  assert.strictEqual(first.variants.length, 2, 'both takes are grouped onto the slot');
  assert.strictEqual(v.passages.find((p: any) => p.body === 'a later passage')!.variants.length, 1);
  db.delStory(s3.id);
});

ok('a book is never written with no voice at all', () => {
  // COUNCIL-06 ship 3. `context.ts` gates the whole VOICE block on the story's own `writingStyle`
  // being non-empty, and two books in the live library had it blank — both created by the IMPORTER,
  // which never ran the backfill that `POST /api/stories` does. They were sending no voice at all
  // and were carried entirely by SYSTEM.
  //
  // DELIBERATELY THROUGH `db.createStory` AND NOT THROUGH THE ROUTE. The route's backfill was never
  // the hole; the other two callers were. A check that went through `POST /api/stories` would pass
  // on the strength of the one path that was already correct, which is the shape of a check that
  // cannot fail for the reason it exists.
  const bare = db.createStory(o, { title: 'No Voice' });
  assert.strictEqual(String(db.getStory(bare.id)!.writing_style ?? '').trim(), '',
    'the fixture must actually have an empty voice, or this is testing nothing');

  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const m = story.assemble(story.view(bare.id)!, slot, 'continue', undefined, undefined, 900);
  const voice = m.manifest.blocks.find((b: any) => b.kind === 'VOICE');
  assert.ok(voice, 'a book with no voice of its own still gets one');
  // A distinctive phrase of the shipped voice, so this cannot pass on an empty block that merely
  // exists. If DEFAULT_VOICE is ever rewritten, change the phrase — do not delete the assertion.
  assert.match(m.prompt, /Sunless Sea/,
    'and it is the house voice, not an empty block wearing the name');
});

ok('firing decides what the model is TOLD — and since COUNCIL-04 #7, only that', () => {
  // It used to decide what got VERIFIED as well, by the contradiction check deleted on 2026-10-28.
  // What is asserted here is the half that remains: the MANIFEST carries only what fired.
  const s6 = db.createStory(o, { title: 'C' });
  db.addPassage({ ...s6, storyId: s6.id, body: 'He kept his hand on the coat all the way down.' });
  db.upsertEntry(s6.id, o, { title: 'the key', body: '[the key: brass]',
    activation: 'triggered', keys: ['coat'] });
  db.upsertEntry(s6.id, o, { title: 'the compact', body: '[the compact: signed in Ghelvane]',
    activation: 'triggered', keys: ['zither'] });
  const v = story.view(s6.id)!;
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const { manifest } = story.assemble(v, slot, 'direct');
  const reached = manifest.blocks
    .filter((b) => b.kind.startsWith('CANON') && b.state === 'included').map((b) => b.id);
  assert.strictEqual(reached.length, 1, 'one of the two entries fired');
  const fired = v.entries.find((e) => e.id === reached[0])!;
  assert.strictEqual(fired.title, 'the key');
  db.delStory(s6.id);
});

ok('deleting the selected take promotes a sibling instead of hiding the slot', () => {
  const s9 = db.createStory(o, { title: 'Takes' });
  const base = db.addPassage({ ...s9, storyId: s9.id, body: 'take one' });
  db.addVariant(s9.id, base, 'take two');
  const three = db.addVariant(s9.id, base, 'take three');   // addVariant selects the new one
  // The selected take is what the book is. Deleting it used to leave the slot with nothing
  // selected, and every read filters on selected = 1 — so 'take one' and 'take two' stayed in
  // the database and vanished from the story, with no screen able to reach them.
  db.delPassage(s9.id, three);
  const takes = [...db.variantsBySlot(s9.id).values()][0];
  assert.strictEqual(takes.length, 2, 'the siblings are still there');
  assert.strictEqual(takes.filter((x) => x.selected).length, 1, 'and one of them is now the book');
  assert.strictEqual(db.passagesOfChapter(s9.chapterId).length, 1,
    'so the chapter still has its passage — this is the assertion that went to zero');
  assert.strictEqual((db.passagesOfChapter(s9.chapterId)[0] as any).body, 'take two',
    'the newest survivor, not the oldest');
  // The last take of a slot has nothing to promote, and the passage goes for good.
  const only = db.passagesOfChapter(s9.chapterId)[0] as any;
  db.delPassage(s9.id, only.id);
  db.delPassage(s9.id, base);
  assert.strictEqual(db.passagesOfChapter(s9.chapterId).length, 0, 'deleting every take empties it');
  db.delStory(s9.id);
});

ok('ending a chapter is both writes or neither', () => {
  const s10 = db.createStory(o, { title: 'Ends' });
  db.addPassage({ ...s10, storyId: s10.id, body: 'one' });
  const before = db.chapters(s10.id);
  assert.strictEqual(before.length, 1);
  assert.strictEqual(before[0].status, 'open');

  // Make the INSERT fail by taking the id it is about to use. There is no other way in from
  // outside, and a rollback that is only reasoned about is a rollback nobody has seen.
  const clash = db.endChapter(s10.id, s10.branchId!, 'Two');
  assert.strictEqual(db.chapters(s10.id).length, 2, 'the normal path opens the next chapter');
  assert.strictEqual(db.chapters(s10.id).find((c: any) => c.id === clash.closed).status, 'closed',
    'and closes the one before it');

  // Now the failure. A branch id that does not exist trips the foreign key on the insert, after
  // the update to the current chapter has already run.
  const open = db.chapters(s10.id).find((c: any) => c.status === 'open');
  assert.throws(() => db.endChapter(s10.id, 'b-does-not-exist-at-all', 'Three'),
    'a bad branch must throw rather than half-finish');
  const after = db.chapters(s10.id);
  assert.strictEqual(after.length, 2, 'no chapter was opened');
  assert.strictEqual(after.find((c: any) => c.id === open.id).status, 'open',
    'and the one that was open is STILL open — without the transaction it was closed with no '
    + 'successor, which is a story you cannot write into and nothing on screen saying why');
  db.delStory(s10.id);
});

/* #127 · ADR 0011. A STRING IS A POCKET OF THE TALE'S THREAD, of kind promise or question. On means in
 * play and sent; off means set aside. Tied off and Let go switch it off and mark it; switching it on
 * again reopens it. Through `upsertString` and `setAddonActive`, the doors every caller uses. */
ok("a string is a pocket of the tale's thread: on is in play, and tied off or let go is off and marked", () => {
  const s11 = db.createStory(o, { title: 'Owed', premise: 'A letter came.' });
  const id = db.upsertString(s11.id, { title: 'The letter', body: 'Unopened', fromChapter: 6, owedBy: 20 });
  assert.ok(id);
  const tale = db.taleThreadOf(s11.id);
  assert.ok(tale, "STRING-TALE: the first string makes the tale's thread");
  assert.strictEqual(db.entriesOf(s11.id).length, 0, '  which is not a thread of the cast');
  const row = () => { const a = (db.addonsOf(s11.id) as any[]).find((x) => x.id === id);
    return a && [a.entry_id, a.slot, a.name, a.body, a.active, a.from_chapter, a.owed_by, a.status]; };
  assert.deepStrictEqual(row(), [tale.id, 'promise', 'The letter', 'Unopened', 0, 6, 20, null],
    "STRING-POCKET: it is a promise pocket on the tale's thread, off, set up in scene 6, owed by 20, not marked");
  const x = db.stringsOf(s11.id)[0];
  assert.deepStrictEqual([x.id, x.title, x.status, x.summoned, x.kind], [id, 'The letter', 'open', 0, 'promise'],
    '  and read back as a string, open and out of play');

  const sent = () => story.assemble(story.view(s11.id)!, { global: 100096, slots: 4, perSlot: 25024 }, 'direct')
    .manifest.blocks.some((b) => b.kind === 'STRING');
  assert.strictEqual(sent(), false, 'STRING-OFF: off, it is not sent');
  db.setAddonActive(s11.id, id, true);
  assert.strictEqual((story.view(s11.id) as any).strings[0].summoned, true, "STRING-ON: the pocket's own switch puts it in play");
  assert.strictEqual(sent(), true, '  and on, it is sent');

  const seen = (story.view(s11.id) as any).strings[0];
  db.upsertString(s11.id, { ...seen, summoned: true, status: 'paid' });
  assert.deepStrictEqual(row()!.slice(4), [0, 6, 20, 'paid'], 'STRING-TIED: tied off switches it off and marks it');
  assert.strictEqual(sent(), false, '  so it is not sent');
  assert.strictEqual((story.view(s11.id) as any).strings[0].status, 'paid', '  and the view says so');
  db.setAddonActive(s11.id, id, true);
  assert.deepStrictEqual(row()!.slice(4), [1, 6, 20, null], 'STRING-REOPEN: switched on again, it is open again');
  db.upsertString(s11.id, { ...seen, status: 'dropped' });
  assert.deepStrictEqual(row()!.slice(4), [0, 6, 20, 'dropped'], 'STRING-LET-GO: let go is off and marked too');

  db.delAddon(s11.id, id);
  assert.strictEqual(db.stringsOf(s11.id).length, 0);
  db.delStory(s11.id);
});

/* #127 · ONLY THE TALE'S THREAD HOLDS STRINGS. The kinds are in `slots.SLOTS` under `tale`, and the tale
 * is not a kind of thread a writer makes. */
ok("only the tale's thread holds a promise or a question, and the tale is not a kind a writer makes", () => {
  const s = db.createStory(o, { title: 'Floor' });
  const who = db.upsertEntry(s.id, o, { title: 'Ines', body: 'b', entryType: 'character' })!;
  assert.strictEqual(db.upsertAddon(s.id, who, { slot: 'promise', name: 'x', body: 'y' }), null,
    'STRING-FLOOR: a character cannot hold a promise');
  assert.strictEqual(db.upsertAddon(s.id, who, { slot: 'question', name: 'x', body: 'y' }), null, '  nor a question');
  assert.deepStrictEqual(slots.slotsFor('tale').map((x: any) => x.name), ['facts', 'promise', 'question'],
    "STRING-SLOTS: the tale's thread holds its Always true, promises and questions");
  assert.ok(!(slots.KINDS as string[]).includes('tale'), '  and the tale is not a kind of thread to make');
  db.delStory(s.id);
});

/* #124 · A STRING HAS A KIND: a promise (the writer's own, or chalked), pressed toward payment, or an
 * open question (New tale's), kept open. A string with no kind given is a promise, and saving one
 * without its kind (the panel's save sends the fields it shows) keeps the kind it had. */
ok('a string is a promise unless it is made an open question, and a save keeps its kind', () => {
  const s = db.createStory(o, { title: 'Kinds' });
  const p = db.upsertString(s.id, { title: 'The letter' });
  const qid = db.upsertString(s.id, { title: 'Who sent it', kind: 'question' });
  const odd = db.upsertString(s.id, { title: 'Odd', kind: 'riddle' });
  const kind = (id: string) => db.stringsOf(s.id).find((x: any) => x.id === id).kind;
  assert.strictEqual(kind(p), 'promise', 'STRING-KIND: a string with no kind is a promise');
  assert.strictEqual(kind(qid), 'question', 'STRING-KIND: an open question is one');
  assert.strictEqual(kind(odd), 'promise', 'STRING-KIND: an unknown kind is a promise');
  db.upsertString(s.id, { id: qid, title: 'Who sent it', summoned: true });
  assert.strictEqual(kind(qid), 'question', 'STRING-KIND-KEPT: a save that sends no kind keeps it');
  assert.strictEqual((story.view(s.id) as any).strings.find((x: any) => x.id === qid).kind, 'question',
    'STRING-KIND-VIEW: the view carries the kind');
  const sent = story.assemble(story.view(s.id)!, { global: 100096, slots: 4, perSlot: 25024 }, 'direct')
    .manifest.blocks.find((b) => b.kind === 'STRING')!.text;
  assert.match(sent, /Open questions[^\n]*never answer it\.\n- Who sent it$/m,
    "STRING-KIND-PROMPT: on, an open question reaches the prompt under its kind's wording");
  db.delStory(s.id);
});

// Entity resolution. Exercised directly because model output is not reproducible.
const { classify } = await import('../src/routes.ts');
if (classify) {
  const F = (who: string) => JSON.stringify({ title: who, body: who, keys: who });
  const ledger = [
    { id: 'e1', title: 'Aldis Fen', body: '[Aldis Fen: sergeant]', last_editor: 'human',
      field_editors: F('human'), keys: '[]' },
    { id: 'e2', title: 'Marek Vale', body: '[Marek Vale: lender]', last_editor: 'model',
      field_editors: F('model'), keys: '[]' },
    { id: 'e3', title: 'the Silver Key', body: '[key: brass]', last_editor: 'human',
      field_editors: F('human'), keys: '["key"]' },
    // Renamed by hand, body still the model's: the body is not yours to defend yet.
    { id: 'e4', title: 'Old Tom', body: '[Old Tom: boatman]', last_editor: 'human',
      field_editors: JSON.stringify({ title: 'human', body: 'model', keys: 'model' }), keys: '[]' },
  ];
  const kind = (t: string, body = 'x', keys: string[] = []) =>
    classify(ledger, { title: t, body, keys })?.kind ?? 'none';
  ok('a shortened name resolves to the existing entry', () =>
    assert.strictEqual(kind('Aldis'), 'conflict'));
  ok('a model-written entry proposes as changed, not conflict', () =>
    assert.strictEqual(kind('Marek'), 'changed'));
  ok('a genuinely new subject is new', () =>
    assert.strictEqual(kind('The Bell'), 'new'));
  ok('a keyword naming another character does not resolve to them', () =>
    assert.strictEqual(kind('The Bell', 'x', ['bell', 'Aldis', 'Marek']), 'new'));
  ok('an identical body proposes nothing', () =>
    assert.strictEqual(kind('Aldis Fen', '[Aldis Fen: sergeant]'), 'none'));
  ok('articles do not defeat matching', () =>
    assert.strictEqual(kind('Silver Key'), 'conflict'));
  ok('a conflict means the BODY was yours, not just the title', () =>
    assert.strictEqual(kind('Old Tom'), 'changed',
      'renaming an entry must not freeze a body you never wrote'));
}


ok('forking copies the path so far and leaves the parent alone', () => {
  const s7 = db.createStory(o, { title: 'Fork' });
  const ids = ['one', 'two', 'three'].map((b) =>
    db.addPassage({ ...s7, storyId: s7.id, body: b, mode: b === 'one' ? 'continue' : 'direct' }));
  db.addVariant(s7.id, ids[1], 'two, differently');   // a discarded take on the parent
  const at = 2;

  const b2 = db.forkBranch(s7.id, s7.branchId, at, 'the other way')!;
  assert.ok(b2, 'fork returned a branch');
  db.setActiveBranch(s7.id, b2);

  const onFork = db.passagesOf(s7.id).map((p: any) => p.body);
  assert.deepStrictEqual(onFork, ['one', 'two, differently'],
    'the fork carries the SELECTED prose up to the fork point, and nothing after it');
  // AND THE PRESS THAT WROTE EACH ONE. A copied passage is the same passage, so it keeps the
  // coloured rule down its margin — the fork's INSERT had every other column and not this one,
  // which left a branched timeline reading as though nothing on it had been pressed.
  assert.deepStrictEqual(db.passagesOf(s7.id).map((p: any) => p.mode), ['continue', 'direct'],
    'the fork carries each passage mode, including one inherited by a re-rolled take');

  // Write on the fork, then check the parent is untouched — the whole reason for copy-on-write.
  db.addPassage({ storyId: s7.id, branchId: b2, chapterId: db.chapters(s7.id)[0].id, body: 'a different three' });
  assert.strictEqual(db.passagesOf(s7.id).length, 3);

  db.setActiveBranch(s7.id, s7.branchId);
  assert.deepStrictEqual(db.passagesOf(s7.id).map((p: any) => p.body),
    ['one', 'two, differently', 'three'], 'the parent still has its own three passages');
  db.delStory(s7.id);
});

// DELETING A BRANCH (Seth, 2026-10-26: "there's no way for me to delete branches"). Everything on
// it goes; the branch you are on, the other path and the canon stay.
ok('deleting a branch takes its prose and leaves the rest of the tale', () => {
  const s8 = db.createStory(o, { title: 'Prune' });
  ['one', 'two', 'three'].forEach((b) => db.addPassage({ ...s8, storyId: s8.id, body: b }));
  const fork = db.forkBranch(s8.id, s8.branchId, 2, 'the other way')!;
  db.setActiveBranch(s8.id, fork);
  const forkCh = db.chapters(s8.id)[0].id;
  db.addPassage({ storyId: s8.id, branchId: fork, chapterId: forkCh, body: 'a different three' });
  db.upsertEntry(s8.id, o, { title: 'Aldis', body: '[Aldis: owes money]', entryType: 'character',
    activation: 'always_on', keys: [] });
  const count = (sql: string, ...a: any[]) => { const r = new RawDb('/tmp/anansi-test.db', { readOnly: true });
    try { return (r.prepare(sql).get(...a) as any).n; } finally { r.close(); } };

  // THE ONE YOU ARE ON IS REFUSED, and says what to do instead.
  const refused = db.delBranch(s8.id, fork);
  assert.match(String(refused.error), /branch you are on/, 'the branch you are on cannot go');
  assert.strictEqual(count('SELECT COUNT(*) n FROM branches WHERE id = ?', fork), 1, 'and it is still there');

  db.setActiveBranch(s8.id, s8.branchId);
  const r = db.delBranch(s8.id, fork);
  assert.strictEqual(r.deleted, 1, r.error);
  assert.strictEqual(count('SELECT COUNT(*) n FROM branches WHERE id = ?', fork), 0, 'the branch is gone');
  assert.strictEqual(count('SELECT COUNT(*) n FROM chapters WHERE branch_id = ?', fork), 0, 'its scenes are gone');
  assert.strictEqual(count('SELECT COUNT(*) n FROM passages WHERE branch_id = ?', fork), 0, 'and every passage on it');
  assert.deepStrictEqual(db.passagesOf(s8.id).map((p: any) => p.body), ['one', 'two', 'three'],
    'the branch you are on keeps all of its prose');
  assert.ok(db.entriesOf(s8.id).some((e: any) => e.title === 'Aldis'), 'and the canon is the tale\'s, so it stays');

  // THE MAIN BRANCH CAN GO TOO, from another one, and the one you are on becomes main.
  const second = db.forkBranch(s8.id, s8.branchId, 3, 'second')!;
  db.setActiveBranch(s8.id, second);
  assert.strictEqual(db.delBranch(s8.id, s8.branchId).deleted, 1);
  assert.strictEqual(count('SELECT is_primary n FROM branches WHERE id = ?', second), 1, 'the one you are on is main now');
  assert.deepStrictEqual(db.passagesOf(s8.id).map((p: any) => p.body), ['one', 'two', 'three'], 'and still reads');
  db.delStory(s8.id);
});

// A snapshot must include writes still sitting in the -wal. `cp` of the main file does not, and
// silently: it cost an A/B run where one arm was seeded and the other cp-ed from it, so that arm
// generated with no prose in context and the manifests differed by a whole block. Measured
// directly — cp saw none of the new rows, snapshot saw them all.
const { execSync } = await import('node:child_process');
const { DatabaseSync } = await import('node:sqlite');
const marker = `WAL-INVARIANT-${Date.now()}`;
// Its own story: the tests above this one delete theirs, so `s` no longer exists by here.
const walStory = db.createStory(o, { title: 'WAL' });
db.upsertEntry(walStory.id, o, { title: marker, body: '[in the wal]', entryType: 'lore',
  activation: 'triggered', keys: ['walinvariant'] });
for (const f of ['/tmp/anansi-wal-snapshot.db', '/tmp/anansi-wal-cp.db']) {
  try { unlinkSync(f); } catch { /* first run */ }
}
db.snapshot('/tmp/anansi-wal-snapshot.db');
execSync('cp /tmp/anansi-test.db /tmp/anansi-wal-cp.db');
const seenIn = (f: string) => {
  const q = new DatabaseSync(f, { readOnly: true });
  const c = (q.prepare('SELECT COUNT(*) c FROM entries WHERE title = ?').get(marker) as any).c;
  q.close(); return c;
};
ok('snapshot() carries a write still in the -wal, which cp does not', () => {
  assert.strictEqual(seenIn('/tmp/anansi-wal-snapshot.db'), 1,
    'snapshot() must capture a WAL-resident write — that is the whole reason it exists');
  // cp is not asserted at 0: a checkpoint may have landed between. The point is that snapshot()
  // never depends on one having landed.
});

// updateStory is PARTIAL. The client has always sent only the fields on screen — `savestory`
// collects the [data-story] elements that are rendered — and a full-row UPDATE bound undefined to
// every column the panel did not show. That made the Trajectory panel's Save, whose only field is
// `direction`, answer 500. Splitting Story and Chapter into separate panels would have spread it.
ok('a partial story save keeps every field it did not mention', () => {
  const o = db.owner('partial-save');
  const st = db.createStory(o, { title: 'Kept', genre: 'noir', premise: 'A test.',
    setting: 'Vantic', pov: 'third limited', persona: 'Aldis', writingStyle: 'clipped', spice: 3 });
  // One field, as the Trajectory panel's Save sent `direction` alone (that column is gone now).
  db.updateStory(st.id, { premise: 'A changed test.' });
  const a = db.getStory(st.id);
  assert.strictEqual(a.premise, 'A changed test.', 'the field sent must land');
  for (const [col, want] of [['title', 'Kept'], ['genre', 'noir'], ['setting', 'Vantic'],
                             ['persona', 'Aldis'], ['writing_style', 'clipped']] as const) {
    assert.strictEqual(a[col], want, `${col} must survive a save that did not mention it`);
  }
  assert.strictEqual(a.spice, 3, 'spice must survive too');
  // An explicit null is not the same as an absent key, or nothing could ever be cleared.
  db.updateStory(st.id, { maxContext: 700 });
  assert.strictEqual(db.getStory(st.id).max_context, 700);
  db.updateStory(st.id, { maxContext: null });
  assert.strictEqual(db.getStory(st.id).max_context, null, 'an explicit null must still clear');
  assert.strictEqual(db.getStory(st.id).title, 'Kept', 'and clearing one field keeps the others');
});

// Regenerating away from a take is a judgement about it, not just a replacement. Recorded and
// shown; deliberately NOT sent to the model — see the note on rejectTake (F44).
ok('a rejected take is marked, kept, and still steppable', () => {
  const o = db.owner('rejects');
  const st = db.createStory(o, { title: 'Takes' });
  const p1 = db.addPassage({ ...st, storyId: st.id, body: 'The first take.' });
  db.addVariant(st.id, p1, 'The second take.');
  db.rejectTake(st.id, p1);
  const takes = db.passageTakes(st.id, p1);
  assert.strictEqual(takes.length, 2, 'both takes stay in the slot');
  const first = takes.find((t: any) => t.id === p1);
  assert.strictEqual(first.rejected, 1, 'the one regenerated away from is marked');
  assert.strictEqual(first.selected, 0, 'and is not the one in the story');
  assert.strictEqual(takes.find((t: any) => t.id !== p1).rejected, 0, 'the new one is not marked');
  // Rejecting must not delete: SPEC 9 keeps every take, and "passed over" is a label, not a bin.
  assert.strictEqual(first.body, 'The first take.', 'and its text is untouched');
  // Another story's id cannot reach it.
  const other = db.createStory(db.owner('someone'), { title: 'Not yours' });
  db.rejectTake(other.id, takes[1].id);
  assert.strictEqual(db.passageTakes(st.id, p1).find((t: any) => t.id !== p1).rejected, 0,
    'a foreign story id must not mark another story\'s take');
});

// Every number on the dashboard was already in the database. This asserts they COUNT the right
// rows — words over selected passages only, so takes you did not choose are not credited as
// writing you did, and breaks are not counted as prose.
// THE WRITER'S DAY, NOT GREENWICH'S. The usability check of 2026-10-24 found "Best day" naming
// tomorrow: rows were grouped by UTC date, so an evening's writing west of Greenwich landed on the
// next day. The page sends its offset (getTimezoneOffset: minutes, positive west of UTC).
ok("writer stats group days by the writer's own clock", () => {
  const o = db.owner('stats-tz');
  const st = db.createStory(o, { title: 'Late' });
  const p = db.addPassage({ ...st, storyId: st.id, body: 'written late at night', author: 'human' });
  // 02:00 UTC on the 2nd is 21:00 on the 1st at UTC-5.
  db.db.prepare('UPDATE passages SET created_at = ? WHERE id = ?').run(Date.UTC(2026, 0, 2, 2, 0), p);
  assert.deepStrictEqual(db.writerStats(o, 300).days.map((d: any) => d.d), ['2026-01-01'],
    'five hours west, it was the evening of the 1st');
  assert.deepStrictEqual(db.writerStats(o).days.map((d: any) => d.d), ['2026-01-02'],
    'with no offset given, the day is UTC as before');
  assert.deepStrictEqual(db.writerStats(o, -600).days.map((d: any) => d.d), ['2026-01-02'],
    'ten hours east, still the 2nd (12:00)');
});

ok('writer stats count the right rows', () => {
  const o = db.owner('stats-writer');
  const st = db.createStory(o, { title: 'Counted' });
  db.addPassage({ ...st, storyId: st.id, body: 'one two three four five', author: 'model' });
  db.addPassage({ ...st, storyId: st.id, body: 'six seven', author: 'human' });
  db.addPassage({ ...st, storyId: st.id, body: 'SCENE', author: 'human', isBreak: true });
  const p = db.addPassage({ ...st, storyId: st.id, body: 'eight nine ten', author: 'model' });
  db.addVariant(st.id, p, 'seven words that were chosen instead here');   // 7 words
  db.upsertEntry(st.id, o, { title: 'Someone', body: '[a person]' });
  const t = db.writerStats(o);
  assert.strictEqual(t.stories, 1);
  assert.strictEqual(t.entries, 1);
  // addVariant selects the NEW take, so 'eight nine ten' is the one that lost.
  assert.strictEqual(t.passages, 3, 'two prose plus the winning take; the break is excluded');
  assert.strictEqual(t.yours, 1, 'the break is not counted as yours');
  assert.strictEqual(t.anansi, 2);
  assert.strictEqual(t.unchosen, 1, 'the take that lost is kept and counted separately');
  // 5 + 2 + 7 = 14. The losing take's three words must NOT be in here, or the dashboard credits
  // you with writing you threw away.
  assert.strictEqual(t.words, 14, `words over selected non-break passages only, got ${t.words}`);
  assert.ok(Array.isArray(t.days), 'and a per-day series to draw');
  // WORDS PER DAY AS WELL AS PASSAGES. A day holding one 900-word passage and a day holding six
  // one-liners are the same bar without this, which is a chart that answers the wrong question.
  // Everything above was written just now, so it is all one day and the words must agree with the
  // total — a per-day sum that disagrees with the headline is two numbers for one fact.
  assert.strictEqual(t.days.reduce((a: number, d: any) => a + Number(d.w ?? 0), 0), 14,
    'the per-day series carries words, and they add up to the same 14');

  // THE LEDGER BY KIND, from the database rather than guessed at from the total. Two kinds, so the
  // ordering is exercised: a single-kind fixture cannot see a GROUP BY that returns them jumbled.
  db.upsertEntry(st.id, o, { title: 'The Bridge', body: '[a place]', entryType: 'lore' });
  db.upsertEntry(st.id, o, { title: 'The Span', body: '[a place]', entryType: 'lore' });
  const k = db.writerStats(o).kinds;
  assert.deepStrictEqual(k.map((r: any) => [r.k, r.n]), [['lore', 2], ['character', 1]],
    'kinds come back counted and commonest first');
  assert.strictEqual(k.reduce((a: number, r: any) => a + r.n, 0), db.writerStats(o).entries,
    'and they add up to the ledger total — the same LIVE filter, or the page contradicts itself');

  /* HOW LONG A CALL TAKES, IN THE MIDDLE. Total time over calls is dragged by one cold reload;
   * this project quotes medians for that reason. Five rows go in and only three can count: a call
   * that FAILED has no duration worth having, and one with no latency logged has none at all.
   * The 100-second failure is the trap — include it and the middle moves to 9s. */
  for (const [ms, err] of [[1000, null], [5000, null], [9000, null],
                           [100000, 'llama-server is not running'], [null, null]] as const) {
    db.logGeneration({ storyId: st.id, role: 'prose', latencyMs: ms, error: err });
  }
  assert.strictEqual(db.writerStats(o).medianSeconds, 5,
    'the middle of the three calls that finished, not the mean and not the failures');

  /* ---- THE SEED RIDES BACK OUT ON THE TAKE. Nothing set one until 2026-09-03, so no generation
   * was reproducible: a passage you liked could be re-rolled but never got back.
   *
   * Read off the generation the passage was TIED to, which is the half that can silently not
   * happen — `logGeneration` writes the row before the take exists and `tieGeneration` joins them
   * afterwards, so a seed that never reaches the take looks exactly like a take with no seed. Both
   * cases are asserted here: the tied one carries it, the untied one is null rather than 0. */
  {
    const st2 = db.createStory(o, { title: 'Seeded' });
    const p1 = db.addPassage({ ...st2, storyId: st2.id, body: 'a first take', author: 'model' });
    const g1 = db.logGeneration({ storyId: st2.id, role: 'prose', params: { seed: 4242, temperature: 0.85 } });
    db.tieGeneration(String(g1), String(p1));
    const typed = db.addPassage({ ...st2, storyId: st2.id, body: 'a line I wrote', author: 'human' });
    const takes: any[] = db.passageTakes(st2.id, p1);
    assert.strictEqual(takes.find((t) => t.id === p1)?.seed, 4242,
      'a take carries the seed of the generation it was tied to');
    assert.strictEqual(db.passageTakes(st2.id, typed).find((t: any) => t.id === typed)?.seed, null,
      'and a passage the writer typed has none — null, not zero, which is a real seed');
  }

  // Another writer's work is not yours.
  assert.strictEqual(db.writerStats(db.owner('stats-nobody')).words, 0);
  assert.deepStrictEqual(db.writerStats(db.owner('stats-nobody')).kinds, [],
    'and neither are their threads');
  // NULL, NOT ZERO. "No call has ever finished" and "calls finish instantly" are different facts,
  // and a zero here would be the second one printed on the page.
  assert.strictEqual(db.writerStats(db.owner('stats-nobody')).medianSeconds, null,
    'a writer with no finished calls has no middle, which is not the same as a fast one');
});

// Outfits. PLAN-04 04 chose named-and-switchable over a single "right now" line, and chose a
// partial unique index over application code — so the "one at a time" rule is asserted against
// the DATABASE, which is the thing that actually enforces it.
ok('exactly one outfit is worn at a time, enforced in SQL', () => {
  const o = db.owner('wardrobe');
  const st = db.createStory(o, { title: 'Wardrobe' });
  const e = db.upsertEntry(st.id, o, { title: 'Ilva Marren', body: '[Ilva Marren: 34, envoy]' });
  const plate = db.upsertOutfit(st.id, e, { name: 'Plate', body: 'the plate she took from the hall' });
  const court = db.upsertOutfit(st.id, e, { name: 'Court dress', body: 'grey silk, no house colours' });
  const worn = () => db.outfitsOf(st.id).filter((x: any) => x.active);
  assert.strictEqual(worn().length, 0, 'nothing is worn until something is put on');
  db.wearOutfit(st.id, e, plate);
  assert.deepStrictEqual(worn().map((x: any) => x.name), ['Plate']);
  db.wearOutfit(st.id, e, court);
  assert.deepStrictEqual(worn().map((x: any) => x.name), ['Court dress'],
    'switching takes the other one off — the unique index forbids two');
  assert.strictEqual(worn().length, 1);
  db.wearOutfit(st.id, e, null);
  assert.strictEqual(worn().length, 0, 'and null takes everything off');
  // A second character's outfit is not affected by the first's.
  const e2 = db.upsertEntry(st.id, o, { title: 'Marek', body: '[Marek: a moneylender]' });
  const coat = db.upsertOutfit(st.id, e2, { name: 'Coat', body: 'oiled canvas' });
  db.wearOutfit(st.id, e, plate);
  db.wearOutfit(st.id, e2, coat);
  assert.strictEqual(worn().length, 2, 'one each is two — the index is per character, not per story');
});

ok('an outfit cannot be hung off another story\'s character', () => {
  const mine = db.owner('wardrobe-mine'), theirs = db.owner('wardrobe-theirs');
  const a = db.createStory(mine, { title: 'Mine' });
  const b = db.createStory(theirs, { title: 'Theirs' });
  const e = db.upsertEntry(a.id, mine, { title: 'Someone', body: '[a person]' });
  assert.strictEqual(db.upsertOutfit(b.id, e, { name: 'X', body: 'y' }), null,
    'the composite lookup is the ownership check');
  assert.strictEqual(db.wearOutfit(b.id, e, 'o-nope'), null);
  assert.strictEqual(db.outfitsOf(a.id).length, 0);
});

// The whole point: it reaches the MODEL as a second bracket, and stops when taken off. This
// used to assert against entryText(), which is one layer above where the outfit is now applied —
// so it could not see the defect COUNCIL-04's debugger found: with a chapter-state in force,
// resolveBody() replaced the body wholesale and the outfit went with it. The panel still said
// "worn" and the character wrote naked. Assert on the block that actually reaches the prompt.
ok('the worn outfit rides with the entry into the prompt, state or no state', async () => {
  const o = db.owner('wardrobe-prompt');
  const st = db.createStory(o, { title: 'Worn' });
  const e = db.upsertEntry(st.id, o, { title: 'Ilva Marren', body: '[Ilva Marren: 34, envoy]' });
  const plate = db.upsertOutfit(st.id, e, { name: 'Plate', body: 'the plate she took from the hall.' });
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const blockFor = (id: string) => {
    const { manifest } = story.assemble(story.view(st.id)!, slot, 'continue');
    return manifest.blocks.find((b: any) => b.id === id)!.text;
  };

  assert.strictEqual(blockFor(e), '[Ilva Marren: 34, envoy]', 'nothing worn, nothing added');
  db.wearOutfit(st.id, e, plate);
  assert.match(blockFor(e), /^\[Ilva Marren: 34, envoy\]\n\[Ilva Marren wears: the plate/,
    'worn, it is a second bracket under the body — not an edit to it');

  // The defect, as a test. A state in force rewrites the body; the outfit must outlive it.
  db.addPassage({ ...st, storyId: st.id, body: 'The hall was cold.' });
  db.upsertState(st.id, e, { fromChapter: 1, body: '[Ilva Marren: sworn to the Bell]' });
  const held = blockFor(e);
  assert.match(held, /sworn to the Bell/, 'the state is in force');
  assert.match(held, /\[Ilva Marren wears: the plate/,
    `a state must not silently undress her — got ${JSON.stringify(held)}`);

  // The wearer is the entry's OWN title, not its first word. Taking the first word turned
  // "The Murmur" and "The Rust Choir" — both real entries from an imported AI Dungeon story —
  // into "[The wears: ...]". The title is what the body already uses, so the two lines agree.
  const murmur = db.upsertEntry(st.id, o, { title: 'The Murmur', body: '[The Murmur: still and sharp]' });
  const coat = db.upsertOutfit(st.id, murmur, { name: 'Coat', body: 'a loose coat, lavender.' });
  db.wearOutfit(st.id, murmur, coat);
  const line = blockFor(murmur).split('\n')[1];
  assert.strictEqual(line, '[The Murmur wears: a loose coat, lavender.]',
    `a name beginning with an article must survive intact, got ${line}`);
  db.wearOutfit(st.id, e, null);
  assert.doesNotMatch(blockFor(e), /wears:/, 'taken off, it is gone again');
});

// Writing into an earlier chapter must land at the end of THAT chapter, not the end of the book.
// Ordinals are per branch and were taken from MAX(ordinal) over the whole branch, so a line
// written into chapter one was ordered after every later chapter — and then `drawDoc`, which
// groups by chapter, showed it inside chapter one while the model, which reads by ordinal, got it
// after chapter two. The document and the prompt disagreed about the order of the book.
ok('a passage written into an earlier chapter lands in that chapter, in order', async () => {
  const o = db.owner('ordinals');
  const st = db.createStory(o, { title: 'Order' });
  const { view } = await import('../src/story.ts');
  db.addPassage({ ...st, storyId: st.id, body: 'one A' });
  db.addPassage({ ...st, storyId: st.id, body: 'one B' });
  const ch1 = db.chapters(st.id)[0];
  const two = db.endChapter(st.id, st.branchId);
  db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: two.opened, body: 'two A' });
  db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: two.opened, body: 'two B' });
  const order = () => db.passagesOf(st.id).map((p: any) => p.body);
  assert.deepStrictEqual(order(), ['one A', 'one B', 'two A', 'two B'], 'the normal append still appends');

  const v = view(st.id, ch1.id)!;
  assert.strictEqual(v.currentChapter.index, 1, 'focusing an earlier chapter makes it the one you write into');
  db.addPassage({ storyId: st.id, branchId: v.branchId!, chapterId: v.currentChapter.id, body: 'one C' });
  assert.deepStrictEqual(order(), ['one A', 'one B', 'one C', 'two A', 'two B'],
    'it goes at the end of chapter one, and chapter two shifts up');

  // The two orders must agree, which is the whole point: the reader and the model see one book.
  const byChapter = db.chapters(st.id).flatMap((c: any) =>
    db.passagesOf(st.id).filter((p: any) => p.chapter_id === c.id).map((p: any) => p.body));
  assert.deepStrictEqual(byChapter, order(),
    'grouping by chapter and ordering by ordinal must produce the same book');

  // Ordinals stay unique and gapless, or the partial unique index would have refused the shift.
  const ords = db.passagesOf(st.id).map((p: any) => p.ordinal);
  assert.deepStrictEqual(ords, [1, 2, 3, 4, 5], `ordinals must stay dense, got ${ords}`);

  // And into an empty chapter in the middle: it takes the position the chapter occupies.
  const three = db.endChapter(st.id, st.branchId);
  db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: three.opened, body: 'three A' });
  const v1 = view(st.id, two.opened)!;
  db.addPassage({ storyId: st.id, branchId: v1.branchId!, chapterId: two.opened, body: 'two C' });
  assert.deepStrictEqual(order(), ['one A', 'one B', 'one C', 'two A', 'two B', 'two C', 'three A'],
    'a later write into chapter two still sits before chapter three');
});

// A story may name its own model. The router runs --models-max 3 --models-autoload, so this is a
// real choice rather than a wish: F22 measured the three writing presets at 86,349 MiB of 98,304
// at full context, and Seth's own service comment sizes them at 79,466 at 32k.
ok('a story can name its own model, and a partial save does not lose it', async () => {
  const { modelFor } = await import('../src/llama.ts');
  const o = db.owner('per-story-model');
  const a = db.createStory(o, { title: 'Default' });
  const b = db.createStory(o, { title: 'Its own' });
  const dflt = modelFor(db.getStory(a.id));
  assert.ok(dflt.length, 'a story naming none gets the process default');
  db.updateStory(b.id, { model: 'rp-nt-ornith-h' });
  assert.strictEqual(modelFor(db.getStory(b.id)), 'rp-nt-ornith-h', 'and one naming a model gets it');
  assert.strictEqual(modelFor(db.getStory(a.id)), dflt, 'without moving the other story');
  // updateStory is partial, so renaming must not quietly drop the model — the same fault that
  // made the Trajectory panel's Save answer 500.
  db.updateStory(b.id, { title: 'Renamed only' });
  assert.strictEqual(db.getStory(b.id).model, 'rp-nt-ornith-h', 'a save that does not mention it keeps it');
  db.updateStory(b.id, { model: null });
  assert.strictEqual(modelFor(db.getStory(b.id)), dflt, 'and clearing it goes back to the default');
});

// The chapter you are READING is the chapter you write into — asserted through the ROUTE, not
// just the db, because that is where it was broken. /api/write took viewOf(storyId) with no
// chapter, so it always resolved to chapters.at(-1): paging back to chapter one and typing put
// the passage at the end of the last chapter, off-screen, generated against the wrong context.
//
// It needs BOTH halves. The route has to pass the chapter, and addPassage has to place it at the
// end of THAT chapter rather than the end of the book. Either alone leaves it wrong.
ok('a write lands in the chapter you are reading, in the right place', async () => {
  const { routes } = await import('../src/routes.ts');
  const o = db.owner('which-chapter');
  const st = db.createStory(o, { title: 'Where' });
  db.addPassage({ ...st, storyId: st.id, body: 'one A' });
  const ch1 = db.chapters(st.id)[0];
  const two = db.endChapter(st.id, st.branchId);
  db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: two.opened, body: 'two A' });
  const ctx = (body: any) => ({ body: { storyId: st.id, ...body }, owner: o,
    query: new URLSearchParams(), slot: { perSlot: 50048 }, gen: {} }) as any;

  await routes['POST /api/write'](ctx({ body: 'into chapter one', chapterId: ch1.id }));
  await routes['POST /api/write'](ctx({ body: 'at the end' }));

  const rows = db.passagesOf(st.id).map((p: any) => {
    const c = db.chapters(st.id).find((x: any) => x.id === p.chapter_id);
    return `${c.idx}:${p.body}`;
  });
  assert.deepStrictEqual(rows, ['1:one A', '1:into chapter one', '2:two A', '2:at the end'],
    'naming a chapter writes into it, in order; naming none still appends at the end');
  // And the two orders agree, which is the property that matters: the reader and the model see
  // one book.
  assert.deepStrictEqual(db.passagesOf(st.id).map((p: any) => p.ordinal), [1, 2, 3, 4]);
});

ok('genre arrives comma-separated however it was punctuated, and a two-word tag survives', () => {
  const { tidyGenre } = db;
  assert.strictEqual(tidyGenre('noir, gothic, horror'), 'noir, gothic, horror', 'already tidy is left alone');
  assert.strictEqual(tidyGenre('noir / gothic and horror'), 'noir, gothic, horror',
    'slashes and a standalone "and" are separators too');
  assert.strictEqual(tidyGenre('  noir ;  GOTHIC ,noir '), 'noir, GOTHIC',
    'trimmed, and deduped case-insensitively on the first spelling');
  // The one that matters: a space is NOT a separator, or every two-word genre becomes two.
  assert.strictEqual(tidyGenre('dark fantasy, slow burn'), 'dark fantasy, slow burn',
    'a space inside a tag is part of the tag');
  assert.strictEqual(tidyGenre(null), '', 'nothing in, nothing out');

  // Applied on the way IN, not left to whoever reads the row. Read back through listStories
  // rather than trusting the return of createStory, which could be tidy while the row is not.
  const o = db.owner('genre-test');
  const made = db.createStory(o, { title: 'G', genre: 'noir / gothic and noir' });
  const row = db.listStories(o).find((r: any) => r.id === made.id) as any;
  assert.strictEqual(row.genre, 'noir, gothic', 'createStory stores the tidied form');
  db.updateStory(made.id, { genre: 'horror;dark fantasy' });
  const after = db.listStories(o).find((r: any) => r.id === made.id) as any;
  assert.strictEqual(after.genre, 'horror, dark fantasy', 'and so does every save after it');
});

ok('a story\'s persona and locked character follow a rename, and clear on a delete', () => {
  const me = db.owner('persona-test');
  const st = db.createStory(me, { title: 'The Reference' });
  const her = db.upsertEntry(st.id, me, { title: 'Ilva Marren', body: 'A courier.', entryType: 'character' });
  const him = db.upsertEntry(st.id, me, { title: 'Kade Ashford', body: 'A creditor.', entryType: 'character' });
  db.updateStory(st.id, { persona: 'Ilva Marren', lockedCharacter: 'Kade Ashford' });
  const read = () => db.listStories(me).find((r: any) => r.id === st.id) as any;
  assert.strictEqual(read().persona, 'Ilva Marren', 'the fixture is set up');

  // Renaming someone ELSE must not touch either reference — the update is scoped to the old title.
  db.upsertEntry(st.id, me, { id: him, title: 'Kade Ferrin', body: 'A creditor.', entryType: 'character' });
  assert.strictEqual(read().persona, 'Ilva Marren', "renaming another character leaves the persona alone");
  assert.strictEqual(read().locked_character, 'Kade Ferrin', 'and the locked character follows its own rename');

  // The one that was broken: the byline read "You · " and the lockout locked nobody.
  db.upsertEntry(st.id, me, { id: her, title: 'Ilva Kest', body: 'A courier.', entryType: 'character' });
  assert.strictEqual(read().persona, 'Ilva Kest', 'the persona follows the rename');

  // Another story naming the same title must not be dragged along.
  const other = db.createStory(me, { title: 'Elsewhere' });
  db.upsertEntry(other.id, me, { title: 'Ilva Kest', body: 'Someone else entirely.', entryType: 'character' });
  db.updateStory(other.id, { persona: 'Ilva Kest' });
  db.upsertEntry(st.id, me, { id: her, title: 'Ilva Vane', body: 'A courier.', entryType: 'character' });
  const otherRead = () => db.listStories(me).find((r: any) => r.id === other.id) as any;
  assert.strictEqual(otherRead().persona, 'Ilva Kest', "a rename in one story cannot reach another story's persona");

  // And a deleted character leaves an empty reference rather than a name nothing can explain.
  db.delEntry(st.id, her);
  assert.strictEqual(read().persona, null, 'deleting the character clears the persona');
  assert.strictEqual(read().locked_character, 'Kade Ferrin', 'and leaves the other reference standing');
});

ok('auto-open is on by default, survives a partial save, and can be turned off', () => {
  const me = db.owner('autoopen-test');
  const st = db.createStory(me, { title: 'The Opening' });
  const read = () => story.view(st.id)!.story as any;
  assert.strictEqual(read().autoOpen, true, 'a new story asks the model for its first passage');

  // The failure this is really guarding: updateStory writes every column, so a save of some OTHER
  // field must not carry a falsy default through and switch this off behind the writer.
  db.updateStory(st.id, { title: 'The Opening, renamed' });
  assert.strictEqual(read().autoOpen, true, 'saving an unrelated field leaves it alone');

  db.updateStory(st.id, { autoOpen: false });
  assert.strictEqual(read().autoOpen, false, 'and it can be turned off');
  db.updateStory(st.id, { premise: 'Something else entirely.' });
  assert.strictEqual(read().autoOpen, false, 'off survives an unrelated save too');

  db.updateStory(st.id, { autoOpen: true });
  assert.strictEqual(read().autoOpen, true, 'and back on again');
});

// #55. Weaving is the book's own switch, off unless the writer turns it on for that book: a weaving
// passage measured 60 s against 7 s (F60), so a book that wove without being asked would be a book
// that went eight times slower overnight.
ok('weaving is off by default, turns on through the story save, survives a partial one, and copies', () => {
  const me = db.owner('weave-test');
  const st = db.createStory(me, { title: 'The Loom' });
  const read = (id = st.id) => story.view(id)!.story as any;
  assert.strictEqual(read().weaving, false, 'a new book does not weave');

  db.updateStory(st.id, { weaving: true });
  assert.strictEqual(read().weaving, true, 'the story save turns it on');
  // Beside the lockout in one UPDATE, so a value bound one slot early would move one onto the other.
  assert.strictEqual(read().lockoutOn, true, 'and turning it on leaves the lockout where it was');
  db.updateStory(st.id, { title: 'The Loom, renamed' });
  assert.strictEqual(read().weaving, true, 'a save of another field leaves it on');
  db.updateStory(st.id, { lockoutOn: false });
  assert.strictEqual(read().weaving, true, 'and so does the switch beside it');

  const copy = db.duplicateStory(me, st.id, 'The Loom, again')!;
  assert.strictEqual(read(copy.id).weaving, true, 'a copy of a weaving book weaves');

  db.updateStory(st.id, { weaving: false });
  assert.strictEqual(read().weaving, false, 'and off is a value too');
});

// The cover. The reason it is a side table and not a column is that listStories selects s.* — so
// the assertion that matters is not "it came back", it is "the shelf listing does not carry the
// bytes". Falsified by selecting sc.jpeg into that listing rather than sc.set_at: the shelf then
// carries the cover, and "the moment it was set" is the assertion that goes red first.
ok('a cover round-trips, and the shelf is told when it was set and never the bytes', () => {
  const me = db.owner('cover-owner');
  const st = db.createStory(me, { title: 'A book with a face' });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(40_000, 7)]);

  assert.strictEqual(db.coverAt(st.id), null, 'a new story has no cover');
  assert.strictEqual(db.getCover(st.id), null, 'and no bytes to hand out');
  const row0: any = db.listStories(me).find((r: any) => r.id === st.id);
  assert.ok(!row0.cover, 'and the shelf says so');

  db.setCover(st.id, jpeg);
  assert.strictEqual(Buffer.from(db.getCover(st.id)!).length, jpeg.length, 'the bytes come back whole');
  assert.strictEqual(Buffer.compare(Buffer.from(db.getCover(st.id)!), jpeg), 0, 'and unchanged');

  const row: any = db.listStories(me).find((r: any) => r.id === st.id);
  assert.ok(typeof row.cover === 'number' && row.cover > 0,
    'the shelf gets the moment it was set, which is what the immutable URL is keyed on');
  // The whole point of the side table: 40KB of JPEG must not be sitting in the shelf listing.
  assert.ok(JSON.stringify(row).length < 4_000,
    `the shelf row is ${JSON.stringify(row).length} bytes — the cover is in it`);

  // Replacing bumps the version, so the URL the shelf builds is a different URL.
  const first = db.coverAt(st.id)!;
  db.setCover(st.id, Buffer.concat([jpeg, Buffer.from([0xff, 0xd9])]));
  assert.strictEqual(db.listStories(me).filter((r: any) => r.id === st.id).length, 1,
    'a replaced cover is one row, not two');
  assert.ok(db.coverAt(st.id)! >= first, 'and its version does not go backwards');

  db.delCover(st.id);
  assert.strictEqual(db.coverAt(st.id), null, 'removing it leaves no cover');
  assert.strictEqual(db.getCover(st.id), null, 'and no bytes');

  // The story is what owns it. Deleting the book must not leave a cover behind in the database
  // the backup then carries forever.
  db.setCover(st.id, jpeg);
  db.delStory(st.id, me);
  assert.strictEqual(db.coverAt(st.id), null, 'deleting the story takes its cover with it');
});

// The cover, used again at the head of every chapter. One image, one switch — Seth: "the chapter
// image would only pull from the hero so story and chapter share the same image."
ok('a book can ask for its cover at the head of every chapter, and it is off until it does', () => {
  const me = db.owner('hero-owner');
  const st = db.createStory(me, { title: 'A book with a plate' });
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 0,
    'off by default — a picture at the head of each chapter is a choice about how a book reads, '
    + 'and turning it on for an existing book would be making that choice for somebody');

  db.updateStory(st.id, { chapterHero: true });
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 1, 'and it turns on');
  // A partial save must not switch it off, the way it must not switch off a chapter's pull-back.
  db.updateStory(st.id, { title: 'Renamed' });
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 1,
    'renaming the book leaves it alone');
  assert.strictEqual((db.getStory(st.id) as any).title, 'Renamed', 'and the rename lands');

  db.updateStory(st.id, { chapterHero: false });
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 0, 'and off again is a value too');

  // The sticky heading rides the same partial-save helper, and the pair is asserted TOGETHER: two
  // booleans written in one UPDATE are two chances to bind the wrong one to the wrong column, and
  // a swap would leave both individually plausible.
  db.updateStory(st.id, { chapterSticky: true });
  assert.strictEqual((db.getStory(st.id) as any).chapter_sticky, 1, 'the sticky heading turns on');
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 0,
    'and turning it on does not turn the cover-as-plate on with it');
  db.updateStory(st.id, { chapterHero: true });
  assert.strictEqual((db.getStory(st.id) as any).chapter_sticky, 1, 'nor the other way round');
  db.updateStory(st.id, { title: 'Renamed twice' });
  assert.strictEqual((db.getStory(st.id) as any).chapter_sticky, 1, 'and a rename leaves both alone');
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 1);
});

// WHICH WORLD A BOOK BELONGS TO (2026-09-02), and the reason it is tested here rather than trusted:
// `updateStory` is one long positional UPDATE, and the note inside it records a value written two
// slots early — every column after it shifted, and the symptom was an unrelated field refusing to
// save. Two new columns at the end of that list is exactly that hazard again.
ok('a book remembers the world it belongs to, and a partial save leaves it alone', () => {
  const me = db.owner('world-owner');
  const st = db.createStory(me, { title: 'A book in someone else\'s world' });

  db.updateStory(st.id, { world: 'Warhammer 40,000',
    worldNote: 'The Imperium has been falling for ten thousand years and calls it order.' });
  const saved: any = db.getStory(st.id);
  assert.strictEqual(saved.world, 'Warhammer 40,000', 'the world is kept');
  assert.match(saved.world_note, /ten thousand years/, 'and what is true in it');

  // AND THE COLUMNS AROUND IT DID NOT MOVE. This is the check that catches an off-by-one in that
  // positional UPDATE: a shifted value lands the world in the next column along and nothing
  // complains, so the fields either side are asserted rather than assumed.
  assert.strictEqual(saved.title, 'A book in someone else\'s world', 'the title is untouched');
  assert.strictEqual(saved.lore_from, null, 'and lore_from, which sits beside it in the UPDATE');

  // A partial save leaves both alone — the rule the whole function is built on.
  db.updateStory(st.id, { title: 'Renamed' });
  const after: any = db.getStory(st.id);
  assert.strictEqual(after.world, 'Warhammer 40,000', 'renaming the book keeps its world');
  assert.match(after.world_note, /ten thousand years/, 'and the note with it');

  // And the view hands them over under the names the panel binds to, or the fields render empty
  // over columns that hold something.
  const v: any = db.getStory(st.id);
  assert.ok('world' in v && 'world_note' in v, 'both columns exist on the row');
  db.delStory(st.id);
});

// A partial chapter save must not switch off what it did not mention. `updateStory` has worked
// this way since it was written; this did not, and it clobbered the one column that decides
// whether a chapter's prose is pulled back into the prompt.
ok('renaming a chapter leaves its pull-back alone', () => {
  const me = db.owner('chapter-owner');
  const st = db.createStory(me, { title: 'A book with a chapter' });
  const ch = (db.chapters(st.id)[0] as any).id;

  db.updateChapter(st.id, ch, { title: 'One', authorsNote: 'End it in the rain.', keepWhole: true });
  assert.strictEqual((db.chapters(st.id)[0] as any).keep_whole, 1, 'the chapter is pulled back');

  // What every caller actually sends: a title and a note, and nothing about the window.
  db.updateChapter(st.id, ch, { title: 'One, renamed', authorsNote: 'End it in the rain.' });
  const after: any = db.chapters(st.id)[0];
  assert.strictEqual(after.title, 'One, renamed', 'the rename lands');
  assert.strictEqual(after.keep_whole, 1,
    'and the pull-back survives it — a partial save must not switch off what it did not mention');

  // And false is a value, not an omission: the writer must be able to let a chapter go again.
  db.updateChapter(st.id, ch, { keepWhole: false });
  assert.strictEqual((db.chapters(st.id)[0] as any).keep_whole, 0, 'releasing it works');
  assert.strictEqual((db.chapters(st.id)[0] as any).title, 'One, renamed',
    'and releasing it does not wipe the title either');

  // THE SECOND HALF OF THE BRIEF, 2026-09-02. The chapter's brief is two boxes now — how it starts
  // and where it ends — and they are two columns because they reach the model differently. Which
  // makes this the third column a partial save could clobber, and the reason this test exists.
  db.updateChapter(st.id, ch, { opensWith: 'She is already inside when he arrives.' });
  const withOpen: any = db.chapters(st.id)[0];
  assert.strictEqual(withOpen.opens_with, 'She is already inside when he arrives.',
    'how the chapter starts is kept');
  assert.strictEqual(withOpen.authors_note, 'End it in the rain.',
    'and saving one half must not blank the other');
  assert.strictEqual(withOpen.title, 'One, renamed', 'nor the title');
  // And the view hands it to the surface under the name the panel binds to, or the box renders
  // empty over a column that has something in it.
  db.updateChapter(st.id, ch, { title: 'One, renamed again' });
  assert.strictEqual((db.chapters(st.id)[0] as any).opens_with,
    'She is already inside when he arrives.',
    'a rename leaves the opening alone, the way it leaves the pull-back alone');
});

// WHERE A PROPOSAL CAME FROM (2026-09-02). Everything this app proposed until now came out of the
// book itself, so provenance had nowhere to live and needed none. A card pulled off the web is the
// first proposal whose evidence is outside the ledger, and Seth's "the ai needs to stay in cannon"
// is only checkable if the pages it read are on the row beside what it wrote.
ok('a proposal can carry the pages it came from, and only http(s) ones', () => {
  const me = db.owner('prov-owner');
  const st = db.createStory(me, { title: 'A book with a pulled card' });
  const ch = (db.chapters(st.id)[0] as any).id;

  db.addProposal(st.id, { chapterId: ch, kind: 'new', entryType: 'character',
    title: 'Paul Atreides', body: '[Paul Atreides: heir to House Atreides]', keys: [],
    source: ['https://dune.fandom.com/wiki/Paul_Atreides', 'https://en.wikipedia.org/wiki/Paul_Atreides'] });
  const pulled: any = db.proposalsOf(st.id).find((x: any) => x.title === 'Paul Atreides');
  assert.ok(pulled, 'the proposal is there');
  assert.deepStrictEqual(String(pulled.source).split('\n'),
    ['https://dune.fandom.com/wiki/Paul_Atreides', 'https://en.wikipedia.org/wiki/Paul_Atreides'],
    'both URLs are kept, in order, one per line');

  // A PROPOSAL OUT OF THE BOOK CARRIES NOTHING, which is every other proposal in the app: null
  // rather than an empty string, so "came from outside" is a question the column can answer.
  db.addProposal(st.id, { chapterId: ch, kind: 'new', entryType: 'lore',
    title: 'The Vantic Rain', body: '[The Vantic Rain: it has not stopped]', keys: [] });
  const own: any = db.proposalsOf(st.id).find((x: any) => x.title === 'The Vantic Rain');
  assert.strictEqual(own.source, null, 'a proposal the model made from the book has no source');

  // NOT A PLACE FOR ANYTHING ELSE. The surface shows these as links, so a `javascript:` or `file:`
  // URL in here would be offered to a writer to press — the same rule `httpish` enforces on an
  // image row, applied where a stranger's text reaches a column.
  db.addProposal(st.id, { chapterId: ch, kind: 'new', entryType: 'item',
    title: 'A knife', body: '[A knife: sharp]', keys: [],
    source: ['javascript:alert(1)', 'file:///etc/passwd', 'https://example.com/knife'] });
  const filtered: any = db.proposalsOf(st.id).find((x: any) => x.title === 'A knife');
  assert.deepStrictEqual(String(filtered.source).split('\n'), ['https://example.com/knife'],
    'only http(s) survives — the other two are not addresses this app hands to anybody');
  db.delStory(st.id);
});

// The look: three layers, and the one that matters is that a book's look never becomes yours by
// being opened. That was the shape of the bug the split exists to prevent — the surface cached
// whatever was on screen, so reading a book with a green theme made green your default.
ok('a book\'s look layers over the writer\'s, and null is how it goes back to following', () => {
  const me = db.owner('look-owner');
  const st = db.createStory(me, { title: 'A book with a look' });

  assert.strictEqual(db.lookOf(me), null, 'a new writer has no default of their own');
  assert.strictEqual((db.getStory(st.id) as any).look, null, 'and a new book follows it');

  db.setLook(me, { theme: 'parchment', font: 'garamond', size: 'l', scale: '110' });
  assert.strictEqual(db.lookOf(me).theme, 'parchment', 'the default round-trips');
  assert.strictEqual((db.getStory(st.id) as any).look, null,
    'and setting it must not write anything onto a book');

  db.setStoryLook(st.id, me, { theme: 'ink', font: 'garamond', size: 'l', scale: '110' });
  assert.strictEqual(JSON.parse((db.getStory(st.id) as any).look).theme, 'ink', 'the book has its own');
  assert.strictEqual(db.lookOf(me).theme, 'parchment',
    'and giving a book one must not change the writer default — the whole point of the split');

  // Null is a value here, not an absence: it is the way back, and it is what every book written
  // before the column existed already holds.
  db.setStoryLook(st.id, me, null);
  assert.strictEqual((db.getStory(st.id) as any).look, null, 'null puts it back to following');
  assert.strictEqual(db.lookOf(me).theme, 'parchment', 'with the default still there to follow');

  // The look is per book, so it must leave with the book.
  db.setStoryLook(st.id, me, { theme: 'ink' });
  db.delStory(st.id, me);
  assert.strictEqual(db.getStory(st.id), undefined, 'the story is gone');
  assert.strictEqual(db.lookOf(me).theme, 'parchment', 'and the writer default outlives it');
});

// Takes: what a reroll inherits, and what deleting one actually deletes. Both of these were the
// same complaint from Seth — deleting a rerolled passage looked like it did nothing, because it
// removed the take on screen and promoted the next one.
ok('a take inherits the instruction, and a slot can be deleted whole', () => {
  const me = db.owner('take-owner');
  const st = db.createStory(me, { title: 'Four takes' });
  const first = db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: st.chapterId,
    body: 'He knocks once.', author: 'model', directive: 'have him lose his nerve' })!;

  const rowOf = (id: string) => db.passagesOf(st.id).find((p: any) => p.id === id)
    ?? { directive: db.passageDirective(st.id, id) };
  assert.strictEqual(db.passageDirective(st.id, first), 'have him lose his nerve',
    'the instruction is on the passage it produced');

  // A second take is another answer to the SAME question, so it carries the same instruction. It
  // used to be absent from addVariant's INSERT entirely, which meant a reroll of a directed
  // passage produced an undirected row and a second reroll had nothing to inherit.
  const second = db.addVariant(st.id, first, 'He knocks, and waits too long.')!;
  assert.strictEqual(db.passageDirective(st.id, second), 'have him lose his nerve',
    'and a take inherits it');
  const third = db.addVariant(st.id, second, 'He does not knock at all.')!;
  assert.strictEqual(db.passageDirective(st.id, third), 'have him lose his nerve',
    'and so does a take of a take, which is what a second reroll is');

  // One take at a time promotes a survivor, which is right: a slot always has one.
  assert.strictEqual(db.passagesOf(st.id).length, 1, 'the book shows one of the three');
  db.delPassage(st.id, third);
  assert.strictEqual(db.passagesOf(st.id).length, 1,
    'deleting the selected take leaves the slot filled — this is the behaviour that looked broken');

  // Which is exactly why the other intent has to be sayable.
  const gone = db.delSlot(st.id, second);
  assert.strictEqual(gone, 2, 'delSlot reports how many takes it took with it');
  assert.strictEqual(db.passagesOf(st.id).length, 0, 'and the passage is out of the book');
  assert.strictEqual(db.passageDirective(st.id, first), null, 'with no take of it left behind');

  // Scoped like every other read: a passage id is not a story id.
  const other = db.createStory(db.owner('take-stranger'), { title: 'Not yours' });
  const theirs = db.addPassage({ storyId: other.id, branchId: other.branchId,
    chapterId: other.chapterId, body: 'Theirs.', author: 'model', directive: 'a secret steer' })!;
  assert.strictEqual(db.passageDirective(st.id, theirs), null,
    'a foreign passage id yields no instruction');
  assert.strictEqual(db.delSlot(st.id, theirs), 0, 'and no foreign slot can be deleted through it');
  assert.strictEqual(db.passagesOf(other.id).length, 1, 'theirs is untouched');
});

// PLAN-06 §2f. Three parsers existed and the AUTHORITATIVE one — the write path every route
// reaches — did `Array.isArray(e.keys) ? … : []`, so a comma-separated string was discarded
// whole rather than split. A model or an API client posting `"coat, iron bridge"` lost both keys
// and the entry looked perfect on screen: right title, right body, and it can never fire again.
//
// This was unassertable before it was unasserted: `grep -rn "keys" test/` showed EVERY fixture in
// this repo hands `keys` in as a pre-built array, which is the one shape the old code got right.
// Same trap as the tag-splitting fix whose fixture had no comma in it (.claude/CLAUDE.md).
// Falsified: restoring the old line turns the first assertion red at ['coat','iron bridge'] vs [].
ok('a comma-separated keys string is split on the write path, not discarded', () => {
  const own = db.owner('keysmith');
  const st = db.createStory(own, { title: 'Keys' });

  const keysIn = (id: string) =>
    JSON.parse((db.entriesOf(st.id).find((x: any) => x.id === id) as any).keys || '[]');

  const e = db.upsertEntry(st.id, own, { title: 'Wanderer', body: '[a coat]',
    activation: 'triggered', keys: 'coat, iron bridge' as any });
  assert.deepStrictEqual(keysIn(e), ['coat', 'iron bridge'],
    'a string of keys reaches the database as keys. Dropped, the entry is triggered with nothing '
    + 'that can trigger it — invisible to the model and indistinguishable from working.');

  // The bound is SPEC §7.1 and it runs on the same path. A one-character key fires on every
  // passage forever; a 33-character one is prose, not a key. Both are dropped, and the keys
  // beside them survive — a bad key must not take a good one with it.
  const b = db.upsertEntry(st.id, own, { title: 'Bounded', body: '[b]', activation: 'triggered',
    keys: `a, ${'x'.repeat(33)}, ${'y'.repeat(32)}, bridge` as any });
  assert.deepStrictEqual(keysIn(b), ['y'.repeat(32), 'bridge'], 'out-of-range keys go, in-range keys stay, 32 is inclusive');

  // NO CAP on the app path since 2026-08-29. SPEC §7.1's ten was a number nobody measured, and
  // after the normalisation below the widest card in a real 219-card export holds ten — so the
  // cap only ever cut duplicates. It survives as a PARAMETER for untrusted callers.
  const many = Array.from({ length: 14 }, (_, i) => `key${i}`);
  const c = db.upsertEntry(st.id, own, { title: 'Many', body: '[c]', keys: many });
  assert.strictEqual(keysIn(c).length, 14, 'every distinct key the writer gives is kept');
  assert.strictEqual(db.keysOf(many.join(','), 8).length, 8,
    'and the cap is still a parameter — import passes one, because that file is a stranger\'s. '
    + 'That import still PASSES it is asserted in test/import.ts against a real card.');

  // NORMALISATION. `fires` tokenises the key as well as the window, so `High`, `(High`, `High.`
  // and `"High` are four spellings of ONE trigger that all match identically. AI Dungeon writes
  // them by hand because its matcher is exact-string; ours is not. Measured on a real export:
  // 154 such duplicates across 644 keys, every one of them firing redundantly and inflating the
  // panel's count to a number no one could act on.
  assert.deepStrictEqual(db.keysOf('High, (High, High., "High, [High, High)'), ['High'],
    'punctuation variants of one word collapse to one key');
  assert.deepStrictEqual(db.keysOf('Erebus, erebus, EREBUS'), ['Erebus'],
    'the dedupe is case-insensitive and keeps the first spelling the writer used');

  // AND INTERIOR PUNCTUATION SURVIVES, which is the half that matters. The space is what makes
  // `High Gothic` a two-part key, and `fires` walks the parts as an ordered run — that is the
  // whole reason it does not fire on "high above". Strip inside and the fix becomes the bug.
  assert.deepStrictEqual(db.keysOf('High Gothic, (High Gothic)'), ['High Gothic'],
    'a multi-word key keeps its space, and its bracketed twin still dedupes against it');
  assert.deepStrictEqual(db.keysOf("Aldi's cart"), ["Aldi's cart"],
    'an interior apostrophe is part of the word, not edge punctuation');
});


// PLAN-06 2e, the half `bench/ledger-audit.ts` supports. `db.ts:881` names the class in its own
// words — "a triggered entry with no trigger words never reaches the model again and looks fine on
// the screen" — and the rule that prevents it lived in import.ts alone, on one of SIX paths into
// upsertEntry. The other five are the wizard, POST /api/entry, accept, the other importer, and
// copy-to-another-book. PLAN-06 asked for it at "the three proposal sites"; there is one floor.
ok('a triggered entry with no keys cannot land dark, unless the caller says it means it', () => {
  const own = db.owner('darkness');
  const st = db.createStory(own, { title: 'Dark' });
  const act = (id: string) =>
    (db.entriesOf(st.id).find((x: any) => x.id === id) as any).activation;

  // The defect. Nothing on any surface would show this entry as broken: right title, right body,
  // the word "Triggered" on its chip, and it can never fire.
  const dark = db.upsertEntry(st.id, own, { title: 'Unfireable', body: '[a fact]',
    activation: 'triggered', keys: [] });
  assert.strictEqual(act(dark), 'always_on',
    'a triggered entry with no keys is one that never reaches the model again. Always-on costs '
    + 'tokens; dark costs the fact itself, and says nothing.');

  // The opt-out, which is the whole reason this is a flag and not a silent correction. app.js
  // makes an entry from a highlighted passage and wants it dark: an always-on entry made from a
  // highlight would cost tokens on every call before anyone had finished writing it.
  const onPurpose = db.upsertEntry(st.id, own, { title: 'Not yet', body: '[a highlight]',
    activation: 'triggered', keys: [], allowNoKeys: true });
  assert.strictEqual(act(onPurpose), 'triggered',
    'allowNoKeys is how "not switched on yet" is said out loud. Without it the two meanings of '
    + 'triggered-with-no-keys share one state and the guard cannot tell them apart.');

  // And it is a per-call permission, not a column. If it ever reaches the schema it becomes a
  // thing to keep in sync on every read path.
  assert.ok(!('allowNoKeys' in (db.entriesOf(st.id).find((x: any) => x.id === onPurpose) as any)),
    'allowNoKeys must not be stored — it describes one call, not the entry');

  // A row already in that state is left alone. bench/ledger-audit.ts on the live library found 1
  // of 7 judgeable entries would go dark on a flip and 2 more were dark on the live window, so
  // migrating what is already there is not supported. Editing an unrelated field must not do it
  // by the back door either.
  db.upsertEntry(st.id, own, { id: onPurpose, title: 'Not yet, renamed', body: '[a highlight]',
    activation: 'triggered', keys: [] });
  assert.strictEqual(act(onPurpose), 'triggered',
    'a rename must not switch an entry on. The guard stops NEW darkness; it does not migrate old '
    + 'rows, because the probe says that flip loses facts.');

  // The guard must not reach an entry that CAN fire, which is the whole population it is for.
  const fine = db.upsertEntry(st.id, own, { title: 'Fireable', body: '[a fact]',
    activation: 'triggered', keys: ['iron bridge'] });
  assert.strictEqual(act(fine), 'triggered',
    'an entry with keys is left exactly as asked — a guard that flipped these would quietly make '
    + 'every triggered entry always-on and put the whole ledger in every prompt');
});

// ---- PLAN-08 Phase 2: addons, the class an outfit already was --------------------------------

ok('the exclusivity index and src/slots.ts name the same slots', () => {
  // A partial index cannot call into TypeScript, so the slot list is written twice: once as a SQL
  // literal and once in `src/slots.ts`. That is exactly the drift `slots.ts` exists to stop, so it
  // is asserted rather than trusted — add an exclusive slot to the module and forget the index and
  // the database silently stops enforcing it, with nothing on any screen to say so.
  const idx = (db.db.prepare(
    "SELECT sql FROM sqlite_master WHERE name = 'addons_one_active'").get() as any)?.sql ?? '';
  const inIndex = [...idx.matchAll(/'([a-z_]+)'/g)].map((m: any) => m[1]).sort();
  assert.deepStrictEqual(inIndex, [...slots.EXCLUSIVE_SLOTS].sort(),
    'the index and the module disagree about which slots hold one at a time');
});

ok('the extraction schema and src/slots.ts name the same slots', () => {
  // The third place the slot list is written, and the same argument as the index above: a
  // constrained decode has to state its enum as a literal, and a schema that interpolated the
  // module would change shape between calls, which makes it unreadable next to a log of them. So
  // it is written out and asserted — add a slot to the module and forget this and the model can
  // never propose into it, silently, with the feature looking built.
  const inSchema = [...(prompts.EXTRACT_SCHEMA as any).properties.entries.items.properties.field.enum]
    .filter((x: string) => x !== 'none').sort();
  assert.deepStrictEqual(inSchema, [...slots.ALL_SLOTS].sort(),
    'the extraction schema and the module disagree about which rooms exist');
  // #77. THE OTHER TWO ENUMS, guarded the same way: they were hand-trimmed when four pockets folded
  // into Always true and Over time, and only this one was checked. Talk names every room, as
  // extraction does; the memory pass names a character's, minus the wardrobe it does not write.
  const enumOf = (sch: any, path: string[]) => [...path.reduce((o, k) => o[k], sch).enum].filter((x: string) => x !== 'none').sort();
  assert.deepStrictEqual(enumOf(prompts.TALK_SCHEMA, ['properties', 'entries', 'items', 'properties', 'field']),
    [...slots.ALL_SLOTS].sort(), 'the Talk schema and the module disagree about which rooms exist');
  // #73: the hem pass names pockets of every kind, never Always true.
  assert.deepStrictEqual(enumOf(prompts.MEMORY_SCHEMA, ['properties', 'threads', 'items', 'properties', 'pockets', 'items', 'properties', 'slot']),
    slots.ALL_SLOTS.filter((n: string) => n !== 'facts').sort(),
    'the memory schema and the pockets disagree');
  // #80. The browser's copy of the kinds is the module's, in the same order.
  assert.deepStrictEqual([...webModel.KINDS], [...slots.KINDS], 'web/model.js KINDS and slots.KINDS disagree');
  assert.deepStrictEqual(slots.FOLDED.filter((n: string) => slots.ALL_SLOTS.includes(n)), [],
    'a folded pocket is a pocket again, and a paste would fold it away silently');
});

{
  const sa = db.createStory(o, { title: 'Addons' });
  const who = db.upsertEntry(sa.id, o, { title: 'Wrenn', body: '[Wrenn: a fence]', keys: ['Wrenn'] });
  const mk = (slot: string, name: string, extra: any = {}) =>
    db.upsertAddon(sa.id, who, { slot, name, body: `[${name}]`, ...extra });

  ok('an exclusive slot holds one at a time, and the database is what says so', () => {
    const a = mk('appearance', 'before the fire')!;
    const b = mk('appearance', 'after the fire')!;
    db.setAddonActive(sa.id, a, true);
    db.setAddonActive(sa.id, b, true);
    const on = db.addonsOf(sa.id).filter((r: any) => r.slot === 'appearance' && r.active);
    assert.deepStrictEqual(on.map((r: any) => r.id), [b],
      'switching the second appearance on must take the first off — two appearances is not a state '
      + 'a card can be in, and leaving it to the screen means the next screen forgets');
    // FALSIFIED 2026-08-28 by disabling the clear in `setAddonActive`: this does not go red with a
    // wrong count, it dies with SQLITE constraint 2067 from `addons_one_active`. That is the proof
    // the comment on the index claims — the database is the enforcer and the transaction only
    // makes it usable, clearing the sibling instead of handing the writer a constraint error.
  });

  ok('  but a plural slot holds several at once, which is the whole point of the shape', () => {
    // Seth: "several can be triggered on at a time for specific ones." A card does not have one
    // relationship. If this passed by holding one, addons would be fields with extra steps.
    const r1 = mk('relationships', 'owes the Ambersand')!;
    const r2 = mk('relationships', 'raised by Halloran')!;
    db.setAddonActive(sa.id, r1, true);
    db.setAddonActive(sa.id, r2, true);
    const on = db.addonsOf(sa.id).filter((r: any) => r.slot === 'relationships' && r.active);
    assert.strictEqual(on.length, 2, 'both relationships should stay on');
  });

  ok('  and switching one off leaves its siblings alone', () => {
    const on = db.addonsOf(sa.id).filter((r: any) => r.slot === 'relationships' && r.active);
    db.setAddonActive(sa.id, on[0].id, false);
    const still = db.addonsOf(sa.id).filter((r: any) => r.slot === 'relationships' && r.active);
    assert.strictEqual(still.length, 1, 'turning one relationship off must not turn the other off');
  });

  ok('from_chapter survives, because it is what makes an arc survive', () => {
    // `outfits` has no from_chapter and addons are otherwise its shape, so this is the one field
    // most likely to be dropped by someone matching the older table. An exclusive slot plus a
    // chapter is a timeline: loyal at 2, not at 9, with the turn still readable between them.
    const id = mk('interiority', 'after the docks', { fromChapter: 9 })!;
    const row = db.addonsOf(sa.id).find((r: any) => r.id === id);
    assert.strictEqual(row.from_chapter, 9);
  });

  ok('an unknown slot is refused rather than stored', () => {
    assert.strictEqual(db.upsertAddon(sa.id, who, { slot: 'motivations', name: 'x', body: 'y' }), null,
      'free-text slots are how one book ends up with Motivation and motivations');
  });

  ok('an addon cannot be hung on another story\'s card', () => {
    const other = db.createStory(o, { title: 'Elsewhere' });
    assert.strictEqual(db.upsertAddon(other.id, who, { slot: 'voice', name: 'x', body: 'y' }), null,
      'the ownership gate is per row, not per route');
  });

  ok('a story-level addon needs no entry at all, which is where a string will live', () => {
    const id = db.upsertAddon(sa.id, null, { slot: 'atmosphere', name: 'the debt', body: '[owed]' });
    assert.ok(id, 'entry_id is nullable on purpose');
  });
}

// ---- PLAN-08 Phase 2: connections, retirement, and a proposal that can aim -------------------

{
  const se = db.createStory(o, { title: 'Edges' });
  const her  = db.upsertEntry(se.id, o, { title: 'Wrenn', body: '[Wrenn]', keys: ['Wrenn'] });
  const coat = db.upsertEntry(se.id, o, { title: 'the coat', body: '[a coat]',
    entryType: 'item', keys: ['coat'] });

  ok('a connection is DIRECTED, which is the whole design decision', () => {
    // Her coat should arrive when she does. She must NOT arrive because somebody said "coat".
    // Storing the pair without a direction rebuilds COUNCIL-04 #7's crowded scene by the back
    // door, and the direction cannot be recovered once a book has two hundred edges. So this
    // asserts the ABSENCE of the reverse, which is the half a presence check cannot see.
    assert.ok(db.linkEntries(se.id, her, coat), 'parent to child should link');
    const e = db.edgesOf(se.id);
    assert.strictEqual(e.length, 1);
    assert.strictEqual(e[0].parent_id, her);
    assert.strictEqual(e[0].child_id, coat);
    assert.strictEqual(e.some((x: any) => x.parent_id === coat), false,
      'the reverse edge must not exist merely because the pair is connected');
  });

  ok('  and the same connection cannot be made twice', () => {
    // Pressing connect twice would make the child arrive twice and count twice against the cap,
    // which is a bug nobody would think to look for.
    assert.strictEqual(db.linkEntries(se.id, her, coat), null);
    assert.strictEqual(db.edgesOf(se.id).length, 1);
  });

  ok('  but the reverse direction is a different edge and is allowed', () => {
    // Two people who know each other is a real shape. Refusing it would confuse "directed" with
    // "one connection per pair", which are not the same rule.
    assert.ok(db.linkEntries(se.id, coat, her));
    assert.strictEqual(db.edgesOf(se.id).length, 2);
    db.unlinkEntries(se.id, db.edgesOf(se.id).find((x: any) => x.parent_id === coat).id);
  });

  ok('  a card cannot pull itself in', () =>
    assert.strictEqual(db.linkEntries(se.id, her, her), null));

  ok('  and neither end may be another story\'s card', () => {
    const far = db.createStory(o, { title: 'Far' });
    const theirs = db.upsertEntry(far.id, o, { title: 'Nobody', body: '[x]' });
    assert.strictEqual(db.linkEntries(se.id, her, theirs), null, 'child from another book');
    assert.strictEqual(db.linkEntries(se.id, theirs, her), null, 'parent from another book');
  });

  ok('confidence defaults to a full pull and can be turned down', () => {
    // Stored, not yet spent: Phase 3 reads it in the eviction order, which is the only place an
    // inherited pull being worth less than a direct hit can mean anything.
    assert.strictEqual(db.edgesOf(se.id)[0].confidence, 1);
    const soft = db.linkEntries(se.id, coat, her, { confidence: 0.4, keys: ['wool'] })!;
    const row = db.edgesOf(se.id).find((x: any) => x.id === soft);
    assert.strictEqual(row.confidence, 0.4);
    assert.deepStrictEqual(JSON.parse(row.keys), ['wool'], 'an edge carries its own trigger words');
  });

  // The column had a reader from Phase 2 and no writer at all, so this used to reach for raw SQL.
  // It goes through `setRetired` now, which is what the surface and the accept path both call.
  const retiredAt = (id: string) => (db.db.prepare(
    'SELECT retired_at_chapter FROM entries WHERE id = ?').get(id) as any).retired_at_chapter;

  ok('an entry can be retired at a chapter, and brought back', () => {
    // A dead character, a burned building, a rule that stopped applying. Without this the ledger's
    // precision decays as the book grows, which is exactly when it is needed most.
    assert.strictEqual(db.setRetired(se.id, coat, 12), true);
    assert.strictEqual(retiredAt(coat), 12);
    // THE WAY BACK, in the same function and shipped the same day. `setPin`'s contract: null lifts
    // it. Without this the first wrong press is permanent and the writer's only undo is SQL.
    assert.strictEqual(db.setRetired(se.id, coat, null), true);
    assert.strictEqual(retiredAt(coat), null);
  });

  ok('  and an ordinary entry save does not disturb the threshold', () => {
    // The reason retirement is not a field on `upsertEntry`: that function writes `last_editor`,
    // which arbitration keys on, and it defaults every absent field across six callers — accept,
    // the wizard, both importers, copy. A retirement riding in there would be cleared by an
    // unrelated save, or a card would be marked human-edited by being brought back.
    db.setRetired(se.id, coat, 12);
    const e = db.entriesOf(se.id).find((x: any) => x.id === coat) as any;
    db.upsertEntry(se.id, o, { id: coat, title: e.title, body: 'a different coat entirely',
      entryType: e.entry_type, activation: e.activation, keys: [], lastEditor: 'model' });
    assert.strictEqual(retiredAt(coat), 12, 'the threshold survived a save that never mentioned it');
    db.setRetired(se.id, coat, null);
  });

  ok('saving a room does not silently clear its chapter anchors', () => {
    // The addon editor sends name, body and keys and nothing else, and these two were written as
    // `?? null` unconditionally — so every save of a room cleared both, which made the room editor
    // a de-facto un-retire button nobody knew was one and quietly undid the arc `from_chapter`
    // exists for. Found while building the entry-level retirement, from the other side.
    const ad = db.upsertAddon(se.id, her, { slot: 'interiority', name: 'her fear',
      body: 'will not cross the bridge', keys: [], fromChapter: 3, retiredAtChapter: 9 });
    db.upsertAddon(se.id, her, { id: ad, slot: 'interiority', name: 'her fear',
      body: 'will not cross the bridge at night', keys: [] });
    const row: any = db.addonsOf(se.id).find((x: any) => x.id === ad);
    assert.strictEqual(row.from_chapter, 3, 'the chapter it became true survived the save');
    assert.strictEqual(row.retired_at_chapter, 9, 'and so did the chapter it stops at');
    // An explicit null still clears, or there would be no way to undo one from the surface.
    db.upsertAddon(se.id, her, { id: ad, slot: 'interiority', name: 'her fear',
      body: 'x', keys: [], retiredAtChapter: null });
    assert.strictEqual((db.addonsOf(se.id).find((x: any) => x.id === ad) as any).retired_at_chapter,
      null, 'an explicit null lifts it, the way setPin and setRetired do');
  });

  ok('two proposals collide only when accepting them would write to the same place', () => {
    // "DUPLICATE" USED TO MEAN SAME CARD. At chapter end several passes each have something to say
    // about one person — her description, a new fact, one of her rooms, that she is finished — and
    // the queue called three of them duplicates of the first and dropped them on a `false` nobody
    // reads. Measured 2026-08-28: `remember`'s state landed and `extract`'s rewrite of the same
    // character was binned, on every close where both spoke. Two rooms of one card did it to each
    // other too, which the rooms feature had inherited on the day it was built.
    const s2 = db.createStory(o, { title: 'Collide' });
    const who = db.upsertEntry(s2.id, o, { title: 'Halsey', body: '[Halsey]', entryType: 'character' });
    const add = (p: any) => db.addProposal(s2.id,
      { title: 'Halsey', entry_id: who, body: 'x', entryType: 'character', kind: 'changed', ...p });

    // FOUR DIFFERENT PLACES, all of them allowed at once.
    assert.strictEqual(add({ kind: 'memory', entryType: 'state', keys: ['2'] }), true, 'her description');
    assert.strictEqual(add({}), true, 'a new fact about her — this is the one that was being lost');
    assert.strictEqual(add({ field: 'voice' }), true, 'her voice');
    assert.strictEqual(add({ field: 'relationships' }), true, 'and a relationship, separately');
    assert.strictEqual(add({ kind: 'retire', entryType: 'retire', keys: ['4'] }), true, 'and finished');
    assert.strictEqual(db.proposalsOf(s2.id).length, 5);

    // AND THE HALF THAT MATTERS MORE: the same place twice is still one offer, or re-running any
    // pass floods the queue — which is what the dedupe was built for in the first place.
    assert.strictEqual(add({}), false, 'the body again');
    assert.strictEqual(add({ kind: 'new' }), false,
      'and `new` is `changed` wearing another label — both write the body, so they must still collide');
    assert.strictEqual(add({ field: 'voice' }), false, 'the same room again');
    assert.strictEqual(add({ kind: 'retire', entryType: 'retire', keys: ['9'] }), false, 'finished again');
    assert.strictEqual(db.proposalsOf(s2.id).length, 5, 'nothing was added by the four refusals');
  });

  ok('  and the dedupe asks the same question the accept path does', () => {
    // One definition, two callers. If these drift, the dedupe is deciding about a write that does
    // not happen — the failure would be invisible in both directions.
    assert.strictEqual(db.proposalTarget({ entry_type: 'state' }), 'state');
    assert.strictEqual(db.proposalTarget({ entry_type: 'retire' }), 'retire');
    assert.strictEqual(db.proposalTarget({ entry_type: 'string' }), 'string');
    assert.strictEqual(db.proposalTarget({ entry_type: 'character', field: 'voice', entry_id: 'e1' }), 'room:voice');
    assert.strictEqual(db.proposalTarget({ entry_type: 'character' }), 'body');
    // A field with no card to hang it on is not a room — it is the body, which is what the accept
    // path does with it too.
    assert.strictEqual(db.proposalTarget({ entry_type: 'character', field: 'voice' }), 'body');
  });

  ok('a proposal can aim at a slot, and an invented one is refused at the column', () => {
    db.addProposal(se.id, { title: 'her fear', body: '[afraid of the water]', entryType: 'character',
      kind: 'new', field: 'interiority', activation: 'triggered', keys: ['water'] });
    db.addProposal(se.id, { title: 'her hope', body: '[wants out]', entryType: 'character',
      kind: 'new', field: 'Motivation', keys: ['out'] });
    const ps = db.proposalsOf(se.id);
    assert.strictEqual(ps.find((x: any) => x.title === 'her fear').field, 'interiority');
    assert.strictEqual(ps.find((x: any) => x.title === 'her fear').activation, 'triggered');
    assert.strictEqual(ps.find((x: any) => x.title === 'her hope').field, null,
      'a slot name the module does not know must not reach the column — that is how one book ends '
      + 'up with Motivation and motivations');
  });
}

// THE <think> STRIP, WHICH #26 NEARLY TOOK WITH IT. `clean` had two halves — the writer's own
// regexes and this — and ripping strip-from-output meant deleting one and keeping the other. The
// whole suite passed either way, because nothing anywhere asserted the surviving half; deleting it
// too would have shipped green and put reasoning tags in the prose the first time
// `enable_thinking: false` was missed on a reasoning model. Falsified by removing the replace: red.
{
  const { clean } = await import('../src/story.ts');
  ok('clean() strips <think>, every block of it, and leaves prose alone', () => {
    assert.equal(clean('<think>weighing it up</think>She did not answer.'), 'She did not answer.',
      'reasoning scaffolding never reaches the page');
    assert.equal(clean('Before.<think>a</think>Between.<think>b</think>After.'),
      'Before.Between.After.', 'every block, not just the first');
    assert.equal(clean('  She waited.  '), 'She waited.', 'prose with no scaffolding is only trimmed');
  });
}

// #14. THE PRESS THAT WROTE IT, stored and handed back. It could not be derived from what was
// already in the row: Speak leaves a speaker and Direct leaves a directive, but Act and Narrate
// both write a bare human passage — 1,871 of the live library's 1,990 rows are that shape, which
// is why the column exists rather than a CASE expression over the old ones.
ok('a passage remembers which press wrote it, and a reroll is the same press', () => {
  const s9 = db.createStory(o, { title: 'Mode' });
  const spoke = db.addPassage({ ...s9, storyId: s9.id, body: 'I will not', mode: 'speak' });
  const acted = db.addPassage({ ...s9, storyId: s9.id, body: 'She turned away', mode: 'act' });
  // A value the app does not know must not name a CSS class on the page, so it is stored as null
  // rather than kept. This is the check that stops the column becoming client-controlled.
  const junk = db.addPassage({ ...s9, storyId: s9.id, body: 'from nowhere', mode: 'sudo' });
  // Nothing before 2026-08-29 has one, and the page draws those without an accent.
  const old = db.addPassage({ ...s9, storyId: s9.id, body: 'before all this' });
  db.addVariant(s9.id, acted, 'She turned away, slowly');

  const v = story.view(s9.id)!;
  const at = (b: string) => v.passages.find((p: any) => p.body === b);
  assert.strictEqual(at('I will not')!.mode, 'speak', 'the mode round-trips to the page');
  assert.strictEqual(at('from nowhere')!.mode, undefined, 'an unknown mode is refused at the column');
  assert.strictEqual(at('before all this')!.mode, undefined, 'a passage written without one has none');
  assert.strictEqual(at('She turned away, slowly')!.mode, 'act',
    'a reroll is another answer to the same press, so the take keeps its accent');
  assert.ok(spoke && junk, 'all four rows were written');
  db.delStory(s9.id);
});

// #25. The router's preset file, read rather than guessed at. Both hazards are real and both are
// in the live file: a `[*]` stanza that carries the defaults most models rely on, and dropped
// models kept in place behind `;` with the A/B that dropped them written above.
const { parsePresets } = await import('../src/presets.ts');
ok('presets: defaults are merged, commented-out stanzas are not models', () => {
  const P = parsePresets([
    '[*]', 'ctx-size = 32768', 'parallel = 4', '',
    '; DROPPED 2026-08-06: lost the A/B. Re-add with:',
    '; [qwen36-heretic-q8]',
    '; ctx-size = 100000',
    '',
    '[Alpha]', 'model = /x.gguf', 'ctx-size = 100000', 'parallel = 2', '',
    '[Beta]', 'model = /y.gguf',
  ].join('\n'));
  const by = Object.fromEntries(P.map((x: any) => [x.id, x]));
  assert.deepStrictEqual(Object.keys(by).sort(), ['Alpha', 'Beta'],
    'a commented-out stanza is a comment, and [*] is not a model');
  // The anchoring is the load-bearing half: unanchor the stanza pattern and `; [qwen36-heretic-q8]`
  // becomes a model the router does not serve, which 400s the moment a writer picks it.
  assert.ok(!P.some((x: any) => /qwen36-heretic-q8/.test(x.id)),
    'a model kept in the file behind a semicolon is not offered');
  // "context window divided by half" — ctx-size is divided ACROSS slots, which is the constraint
  // the whole build is sized against.
  assert.strictEqual(by.Alpha.perSlot, 50000, 'a model that overrides both gets its own per-slot');
  assert.strictEqual(by.Beta.parallel, 4, 'a model that overrides neither inherits from [*]');
  assert.strictEqual(by.Beta.perSlot, 8192, 'and its per-slot follows from the inherited pair');
  assert.strictEqual(by.Alpha.ctxSize, 100000);
});

// Speed is MEASURED, because presets.ini has no speed field and a hand-written one goes stale
// silently. From the server's own timings, not from wall clock — see the note on modelSpeeds.
ok('speed comes from the server timings, and a bad row cannot poison it', () => {
  const s1 = db.createStory(o, { title: 'Speedy' });
  const put = (model: string, timings: string | null) =>
    db.db.prepare(`INSERT INTO generations (id, story_id, model, role, prompt_tokens,
      completion_tokens, timings, latency_ms, error, created_at) VALUES (?,?,?,'write',10,10,?,?,?,?)`)
      .run('g-' + Math.random().toString(16).slice(2), s1.id, model, timings, 1000, null, Date.now());
  put('M', JSON.stringify({ predicted_per_second: 10 }));
  put('M', JSON.stringify({ predicted_per_second: 300 }));
  put('M', JSON.stringify({ predicted_per_second: 20 }));
  put('M', 'not json at all');
  put('M', JSON.stringify({ predicted_per_second: 0 }));
  const got = db.modelSpeeds()['M'];
  // 10, 20, 300: the median is 20 and the mean is 110. The first version of this used 10/20/30,
  // where the two are the same number — the median could be swapped for a mean and the check
  // stayed green, which is the shape of an assertion that cannot fail.
  assert.strictEqual(got.tps, 20, 'the MEDIAN, so one outlying call cannot drag it');
  assert.strictEqual(got.runs, 3, 'and unparseable and zero rows are not counted as runs');
  db.delStory(s1.id);
});

// ---- THE WRITER'S MODEL SURVIVES A RESTART (2026-08-31). It lived in a Map in serve.ts, so every
// restart put both writers back on the process default without saying so — and since the same day
// it also decides which model is woken when they open the app, which is not a decision that should
// evaporate on a reboot.
ok("the writer's own model is kept on their row, and the others can be read back", () => {
  const a = db.owner('modelkeeper');
  const b = db.owner('secondwriter');
  assert.strictEqual(db.defaultModelOf(a), null,
    'a writer who has never chosen has no model of their own — null, so the caller falls back');
  db.setDefaultModel(a, 'Artemis-1.1-RPNTH-31B-NN');
  assert.strictEqual(db.defaultModelOf(a), 'Artemis-1.1-RPNTH-31B-NN', 'and a choice is kept');

  // THE OTHER WRITERS, read from the table and not from who happens to have made a request since
  // this process started. That was the bug in the Map: a writer who had not visited since the last
  // restart looked like a writer with no model, and the release policy would take it out from
  // under them.
  db.setDefaultModel(b, 'GLM-4.7-Flash-RPTH-30B');
  assert.deepStrictEqual(db.otherDefaultModels(a), ['GLM-4.7-Flash-RPTH-30B'],
    "one writer's view of the others names the second writer's model");
  assert.ok(!db.otherDefaultModels(a).includes('Artemis-1.1-RPNTH-31B-NN'), 'and never their own');
});

// ---- A WORLD BOOK IS A STORY YOU NEVER WRITE PROSE IN (2026-08-31). Seth: "a way to create a
// world book. one that is just the cards in that book ... and an easy way to create a story from
// that lore book." Nothing new was needed underneath: entries are story-scoped, `lore_from` already
// lets one book read another's cards, and `entriesFor` already merges them.
ok('a book started from a world book reads its cards, and can still disagree with it', () => {
  const me = db.owner('worldwright');
  const them = db.owner('someone-else');
  const world = db.createWorld(me, { title: 'The Tessellate', premise: 'A city of nine rings.' });
  db.upsertEntry(world.id, me, { title: 'The Warden', body: 'She has never left the ninth ring.' });
  db.upsertEntry(world.id, me, { title: 'Ring Law', body: 'Nobody descends without a writ.' });

  const book = db.storyFollowing(me, world.id, 'A Writ for the Ninth');
  assert.ok(book, 'the book is made');
  // FOLLOWS, does not copy. A copy is a fork the moment either side is edited, and a bible exists
  // so that several books set in it say the same thing about the same character.
  assert.strictEqual(db.entriesOf(book!.id).length, 0, 'it holds no cards of its own');
  const seen = db.entriesFor(book!.id).map((e: any) => e.title).sort();
  assert.deepStrictEqual(seen, ['Ring Law', 'The Warden'],
    'and both of the world\'s cards reach its prompt');

  // The follower's own card wins a title collision — the book is allowed to say something
  // different from the bible, which is the whole reason this is a merge and not a copy.
  db.upsertEntry(book!.id, me, { title: 'The Warden', body: 'She left the ninth ring in the spring.' });
  const warden = db.entriesFor(book!.id).filter((e: any) => e.title === 'The Warden');
  assert.strictEqual(warden.length, 1, 'one Warden, not two');
  assert.match(warden[0].body, /left the ninth ring in the spring/,
    "and it is the book's own, not the world's");

  // REFUSALS, both of them. A world that is not yours, and a story that is not a world.
  assert.strictEqual(db.storyFollowing(them, world.id, 'Not Yours'), null,
    'another writer cannot start a book from your threads');
  // ANY book you own, since 2026-08-31 — not only a world book. Seth asked for this beside every
  // book on the Threads page, and `entriesFor` never cared which kind the source was.
  const sequel = db.storyFollowing(me, book!.id, 'The Second Writ');
  assert.ok(sequel, 'an ordinary book can be followed too');
  // AND FOLLOWING DOES NOT CHAIN, which is worth pinning because it could surprise: the sequel
  // follows a book that follows a world, and it reads only the book's OWN cards. `entriesFor` goes
  // one level and no further. Whether it should chase the chain is a decision nobody has made; this
  // asserts what it actually does so a change to it is a deliberate one.
  assert.deepStrictEqual(db.entriesFor(sequel!.id).map((e: any) => e.title).sort(), ['The Warden'],
    'a book that follows a book that follows a world reads only the middle one — no chain');
  assert.match(db.entriesFor(sequel!.id)[0].body, /left the ninth ring in the spring/,
    "and it is that book's own version of the card, not the world's");
});

// ---- ISSUE #36 · A FOLLOWED CARD, PER CARD.
//
// `stories.lore_from` is one column and therefore one answer for a whole ledger. Seth's ask was per
// card: "I should be able to delete it from the copied story without runing it for the current story
// I.e. Unlinking it. I should aslo have an option to update the card bi drectionally or only one
// way." And his design for it, 2026-09-01: "on unlink it would just make a copy of the card in that
// state but keep the original id in case it gets reconnected and then resynced ... that also means
// that if a book is deleted. it can ask the question to merge those cards to the original."
//
// THREE STATES ON ONE COLUMN, and what makes it small is that "in sync always" is not maintained —
// it is the ABSENCE of a copy. There is one card, read through, so it cannot drift. The obvious
// build is two copies kept equal by fanning every write out, which needs a direction, a
// last-write-wins rule, and the same fan-out again for the rooms.
ok('a followed card can be taken over, handed back, or taken out of one book alone (#36)', () => {
  const me = db.owner('per-card');
  const world = db.createWorld(me, { title: 'The Ninefold', premise: 'Nine rings.' });
  const warden = db.upsertEntry(world.id, me, { title: 'The Warden',
    body: 'She has never left the ninth ring.', activation: 'always_on' })!;
  db.upsertAddon(world.id, warden, { slot: 'voice', name: 'How she sounds', body: 'Flat.', keys: [] });
  const law = db.upsertEntry(world.id, me, { title: 'Ring Law', body: 'Nobody descends.',
    activation: 'always_on' })!;
  const book = db.storyFollowing(me, world.id, 'A Writ')!;
  const titles = (id: string) => db.entriesFor(id).map((e: any) => e.title).sort();
  assert.deepStrictEqual(titles(book.id), ['Ring Law', 'The Warden'], 'both reach it to begin with');

  // ---- BIDIRECTIONAL, by there being one card. Editing a followed card from the follower used to
  // MINT A DUPLICATE: `upsertEntry` is scoped by story, so the id did not resolve and the INSERT at
  // the foot of it ran. That is why the card face was read-only. It writes to where the card lives
  // now, and this is the assertion that says so.
  db.upsertEntry(book.id, me, { id: warden, title: 'The Warden',
    body: 'She has never left the ninth ring, and says so often.', activation: 'always_on' });
  assert.strictEqual(db.entriesOf(book.id).length, 0,
    'editing a followed card from the follower must not leave a card in the follower — that is the '
    + 'duplicate the old read-only face existed to avoid');
  assert.match((db.entriesOf(world.id).find((e: any) => e.id === warden) as any).body,
    /and says so often/, 'the edit landed on the card where it lives');
  assert.deepStrictEqual(titles(book.id), ['Ring Law', 'The Warden'], 'and there is still one Warden');

  // ---- TAKE IT OVER. A copy here, as it stands, remembering where it came from.
  const mine = db.unlinkEntry(book.id, me, warden)!;
  assert.ok(mine, 'the card is copied into this book');
  assert.strictEqual((db.entriesOf(book.id).find((e: any) => e.id === mine) as any).origin_id, warden,
    'carrying the id of the card it came from — the whole mechanism');
  // ONE Warden, not two. `entriesFor` must stop reading the origin through, or the writer sees the
  // copy they are editing and the world's original beside it, same name, drifting.
  assert.deepStrictEqual(titles(book.id), ['Ring Law', 'The Warden'],
    'the read-through must stop for a card this book has taken over');
  const room = db.addonsOf(book.id).filter((a: any) => a.entry_id === mine);
  assert.strictEqual(room.length, 1, 'the rooms came with it');
  assert.strictEqual(room[0].slot, 'voice');
  // Taking the same one over twice is refused: two rows claiming one card is two rows the
  // read-through cannot choose between.
  assert.strictEqual(db.unlinkEntry(book.id, me, warden), null, 'and it cannot be taken twice');

  // IT IS AN ORDINARY CARD NOW, which is the point of doing it this way: every existing path works
  // on it with no new code. Editing it stays here and does NOT reach the world.
  db.upsertEntry(book.id, me, { id: mine, title: 'The Warden', body: 'She left in the spring.',
    activation: 'always_on' });
  assert.match((db.entriesOf(world.id).find((e: any) => e.id === warden) as any).body,
    /and says so often/, 'the world card is untouched — this is the one-way half of the ask');
  assert.match((db.entriesFor(book.id).find((e: any) => e.title === 'The Warden') as any).body,
    /left in the spring/, 'and the book reads its own');

  // ---- SEND IT HOME AND FOLLOW AGAIN. The copy goes, the world gets this wording, and every book
  // following that world sees it.
  const sent = db.relinkEntry(book.id, me, mine, 'mine')!;
  assert.ok(sent?.pushed, 'the version here was pushed up');
  assert.strictEqual(sent.origin, warden, 'and it says which card it went onto');
  assert.strictEqual(db.entriesOf(book.id).length, 0, 'the copy is gone');
  assert.match((db.entriesOf(world.id).find((e: any) => e.id === warden) as any).body,
    /left in the spring/, "the world card carries the follower's wording now");
  assert.deepStrictEqual(titles(book.id), ['Ring Law', 'The Warden'],
    'and the book is reading the shared card again');
  assert.strictEqual(db.addonsOf(book.id).length, 0, 'with no orphan rooms left behind');

  // ---- OR DROP THE COPY AND KEEP THE WORLD'S. The other direction, and it must not write upward.
  const again = db.unlinkEntry(book.id, me, warden)!;
  db.upsertEntry(book.id, me, { id: again, title: 'The Warden', body: 'A local invention.',
    activation: 'always_on' });
  db.relinkEntry(book.id, me, again, 'theirs');
  assert.match((db.entriesOf(world.id).find((e: any) => e.id === warden) as any).body,
    /left in the spring/, "keeping theirs must not push the follower's wording up");
  assert.match((db.entriesFor(book.id).find((e: any) => e.title === 'The Warden') as any).body,
    /left in the spring/, 'and the book reads the world again');

  // ---- TAKE IT OUT OF THIS BOOK ALONE. #36's original sentence. A tombstone, because there is
  // nothing here to delete: the card belongs to the other book.
  const stone = db.dropFollowed(book.id, me, law)!;
  assert.ok(stone, 'the removal is recorded');
  assert.deepStrictEqual(titles(book.id), ['The Warden'], 'and Ring Law stops reaching this book');
  assert.strictEqual(db.entriesOf(world.id).length, 2, 'while the world still has both cards');
  // A TOMBSTONE IS NOT A CARD. `entriesOf` is what DELETE, export, copy and the ownership checks
  // read, and every one of them means cards — a tombstone appearing there would export an empty
  // card, offer it for copying, and draw it on the ledger screen.
  assert.strictEqual(db.entriesOf(book.id).length, 0, 'and it is not a card of this book');
  assert.deepStrictEqual(db.droppedFollowed(book.id).map((x: any) => x.title), ['Ring Law'],
    'but it is listed by name, or removing a card is a one-way door with no undo on any screen');
  // Reversible, through the same door as handing a copy back — it is the same row being removed.
  db.relinkEntry(book.id, me, stone, 'theirs');
  assert.deepStrictEqual(titles(book.id), ['Ring Law', 'The Warden'], 'bringing it back works');

  // ---- DELETING THE COPY LEAVES A TOMBSTONE, or the delete undoes itself. This is the trap: the
  // row came from the other book, so removing it hands the card straight back to the read-through
  // and it reappears with the writer's edits gone and the world's wording back.
  const third = db.unlinkEntry(book.id, me, law)!;
  db.delEntry(book.id, third);
  assert.deepStrictEqual(titles(book.id), ['The Warden'],
    'deleting a taken-over card must not let the read-through put it straight back');
  assert.deepStrictEqual(db.droppedFollowed(book.id).map((x: any) => x.title), ['Ring Law'],
    'it became a tombstone, and can be brought back');
  db.relinkEntry(book.id, me, db.droppedFollowed(book.id)[0].id, 'theirs');

  // ---- A TOMBSTONE IS NOT A CARD, IN EVERY READER THAT MEANS CARDS.
  //
  // It keeps its TITLE so the screen can offer it back by name, and nothing else. FOUR readers were
  // missed on the first pass and found by grepping `FROM entries` rather than by any check: the
  // cross-story Threads page listed it as an empty card, the shelf counted it in a book's thread
  // total, a persona check (since deleted, #84) counted its name as still in the cast, and SEARCH returned it as a title hit
  // with no body. `LIVE` is one fragment so the fifth reader inherits the rule; this asserts all of
  // them, because a shared fragment nobody applies is the same bug with a nicer comment.
  {
    const stoneTitle = 'The Deep Cistern';
    const cistern = db.upsertEntry(world.id, me, { title: stoneTitle, body: 'It floods.',
      activation: 'always_on' })!;
    assert.ok(db.entriesFor(book.id).some((e: any) => e.title === stoneTitle),
      'the fixture card reaches the book first');
    db.dropFollowed(book.id, me, cistern);

    assert.ok(!db.entriesOf(book.id).some((e: any) => e.title === stoneTitle),
      'entriesOf — what DELETE, copy, export and the ownership checks read');
    assert.ok(!db.entriesFor(book.id).some((e: any) => e.title === stoneTitle),
      'entriesFor — what the prompt and the screen read');
    assert.ok(!db.ledgerOf(me).some((e: any) => e.story === book.id && e.title === stoneTitle),
      'ledgerOf — the cross-story Threads page, which listed it as an empty card');
    const shelf = db.listStories(me).find((x: any) => x.id === book.id) as any;
    assert.strictEqual(shelf.entries, db.entriesOf(book.id).length,
      "listStories — the shelf's per-book thread count must agree with the cards there are");
    assert.ok(!db.search(me, stoneTitle, book.id).some((r: any) => r.kind === 'Entry'),
      'search — a tombstone kept its title, so it came back as a hit with no body');

    // AND IT IS STILL OFFERABLE BY NAME, which is the one place it must appear.
    assert.ok(db.droppedFollowed(book.id).some((x: any) => x.title === stoneTitle),
      'the removed list is the one reader that wants it');
    db.relinkEntry(book.id, me, db.droppedFollowed(book.id)
      .find((x: any) => x.title === stoneTitle)!.id, 'theirs');
    assert.ok(db.entriesFor(book.id).some((e: any) => e.title === stoneTitle), 'and it comes back');
    db.dropFollowed(book.id, me, cistern);
    db.relinkEntry(book.id, me, db.droppedFollowed(book.id)[0].id, 'theirs');
  }

  // ---- A CARD BORN HERE IS DELETED OUTRIGHT, as it always was. No origin, no tombstone.
  const local = db.upsertEntry(book.id, me, { title: 'The Writ Clerk', body: 'He stamps things.',
    activation: 'always_on' })!;
  db.delEntry(book.id, local);
  assert.strictEqual(db.droppedFollowed(book.id).length, 0, 'a card of its own leaves no tombstone');
  assert.ok(!titles(book.id).includes('The Writ Clerk'), 'and it is simply gone');
});

// ---- ISSUE #36 · SENDING A BOOK'S THREADS HOME WHEN IT IS DELETED.
//
// Seth: "if a book is deleted. it can ask the question to merge those cards to the original and if
// we want to add any newly created cards to the lore book." The rescue picker already offered every
// book on the shelf; what it could not do is land a taken-over card back ON the card it came from.
ok('threads sent home land on the card they came from, and new ones arrive as new (#36)', () => {
  const me = db.owner('homeward');
  const world = db.createWorld(me, { title: 'The Ninefold Again', premise: 'Nine rings.' });
  const warden = db.upsertEntry(world.id, me, { title: 'The Warden', body: 'Never left.',
    activation: 'always_on' })!;
  const book = db.storyFollowing(me, world.id, 'A Second Writ')!;

  const mine = db.unlinkEntry(book.id, me, warden)!;
  db.upsertEntry(book.id, me, { id: mine, title: 'The Warden', body: 'Left in the spring.',
    activation: 'always_on' });
  db.upsertEntry(book.id, me, { title: 'The Ninth Gate', body: 'It has one hinge.',
    activation: 'always_on' });

  const moved = db.copyLedger(book.id, world.id, me)!;
  assert.strictEqual(moved.cards, 2, 'both threads travel');
  // ONE Warden in the world, not two. Copying a taken-over card blind would put a second one beside
  // the first with one name and two bodies, and the follower's edits in the copy nothing reads.
  const wardens = db.entriesOf(world.id).filter((e: any) => e.title === 'The Warden');
  assert.strictEqual(wardens.length, 1, `one Warden in the world and there are ${wardens.length}`);
  assert.match(wardens[0].body, /Left in the spring/, "carrying the follower's wording");
  assert.strictEqual(wardens[0].id, warden, 'on the same row, so every other follower sees it');
  // And a card written in the follower is genuinely new to the world.
  assert.ok(db.entriesOf(world.id).some((e: any) => e.title === 'The Ninth Gate'),
    'a thread born in the book arrives in the world as a new card');
  assert.strictEqual(db.entriesOf(world.id).length, 2, 'two cards, not three');
});


// ---- THE WHOLE BOOK AGAIN. Seth, 2026-09-11: "copies threads independent of the original."
//
// WHAT IS ACTUALLY BEING ASSERTED, and why a branch test would not do: `entries` and `strings` are
// keyed by story and have no branch column, so every branch of a book reads ONE ledger. Two ledgers
// that do not reach each other is the thing only a second book can give, and section 3 is it.
//
// SECTION 2 IS THE GUARD ON THE HAND-WRITTEN COLUMN LISTS. `duplicateStory` names its columns, and
// this repo's most-repeated bug is a hand-written list that silently stops being complete —
// `createStory` dropped a field the form sent three separate times, each with a comment saying so.
// So the copy is compared to the source ROW BY ROW with only the remapped ids removed: a column
// added to `passages` and forgotten in the copy fails here without anybody updating this test.
//
// It has one hole and it is worth naming rather than hiding: `sticky_for` and `proper_nouns` have
// no writer anywhere in the app, so a copy that dropped them would land on the same schema default
// the source has and the comparison would pass. They are driven off their defaults through `raw`
// below for exactly that reason — a check that has only ever seen the default value has not been
// tested against the case it exists for.
const raw = new DatabaseSync('/tmp/anansi-test.db');
ok('a book copies whole, and the copy shares nothing with the original', () => {
  const me = db.owner('twice');
  const src: any = db.createStory(me, { title: 'The Salt Road', genre: 'fantasy',
    premise: 'A courier walks east.', setting: 'The pans', pov: 'third past',
    writingStyle: 'Dry.', spice: 1, maxContext: 12_000 });

  // Prose: two chapters, a re-roll behind one passage, an accent and a directive on another.
  const p1 = db.addPassage({ storyId: src.id, branchId: src.branchId, chapterId: src.chapterId,
    body: 'She left before the wells opened.', author: 'human' })!;
  db.addVariant(src.id, p1, 'She left while the wells were still shut.');
  db.addPassage({ storyId: src.id, branchId: src.branchId, chapterId: src.chapterId,
    body: '"Then go," he said.', author: 'model', speaker: 'Renn', mode: 'speak',
    directive: 'let him relent' });
  const ended = db.endChapter(src.id, src.branchId, 'The Pans');
  db.addPassage({ storyId: src.id, branchId: src.branchId, chapterId: ended.opened,
    body: 'The salt took the light badly.', author: 'model' });

  // #43. A summary the writer wrote, so the copies below have an author to carry. Without one the
  // column-by-column comparison in section 2 compares null with null and proves nothing about it.
  assert.deepStrictEqual(db.writeSummary(src.id, src.chapterId, 'She leaves at dawn.'), {});
  // A second path, which must arrive as a second path rather than being flattened into one.
  const other = db.forkBranch(src.id, src.branchId, 1, 'she stayed')!;
  assert.strictEqual((raw.prepare('SELECT summary_author AS a FROM chapters WHERE branch_id = ? AND idx = 1')
    .get(other) as any)?.a, 'human', 'a branch keeps which summaries are yours');

  // The ledger: two cards, a room, a connection, a pin, a state, a retirement, a string, an arc.
  const courier = db.upsertEntry(src.id, me, { title: 'Ferran', body: 'Carries what cannot wait.',
    activation: 'triggered', keys: ['Ferran'] })!;
  const road = db.upsertEntry(src.id, me, { title: 'The Salt Road', body: 'Nine days of white.',
    activation: 'always_on' })!;
  // The two columns nothing in the app writes — see the header. Driven here so the comparison
  // below is looking at values, not at two copies of the same default.
  raw.prepare('UPDATE entries SET sticky_for = 7, proper_nouns = 0 WHERE id = ?').run(courier);
  db.upsertAddon(src.id, courier, { slot: 'facts', name: 'His hands', body: 'Cracked to the bone.',
    keys: ['hands'] });
  // And a room hanging off no card at all, which `copyEntry` walks past — it goes by entry_id.
  db.upsertAddon(src.id, null, { slot: 'facts', name: 'The pans', body: 'White to the horizon.',
    keys: ['pans'] });
  db.linkEntries(src.id, road, courier, { confidence: 0.8, keys: ['Ferran'] });
  db.setPin(src.id, src.chapterId, courier, 'force_in');
  db.upsertState(src.id, courier, { fromChapter: 2, body: 'He is walking with a limp.',
    beforeMode: 'hint', label: 'after the crossing' });
  db.setRetired(src.id, road, 2);
  db.upsertString(src.id, { title: 'The sealed letter', body: 'He has not opened it.',
    fromChapter: 1, owedBy: 9, status: 'paid' });
  db.addArc(src.id, { branchId: src.branchId, fromChapter: 1, toChapter: 1, title: 'Leaving',
    summary: 'She goes.' });
  db.setActiveBranch(src.id, other);

  const copy = db.duplicateStory(me, src.id, 'The Salt Road (again)')!;
  assert.ok(copy && copy.id !== src.id, 'a copy is a second book');

  // ---- 1. It came across whole.
  assert.strictEqual(copy.cards, 2, 'both threads travel');
  assert.strictEqual(copy.branches, 2, 'and both paths, not only the one being written');
  assert.strictEqual(copy.edges, 1, 'with the connection between the threads');
  const count = (sql: string, id: string) => (raw.prepare(sql).get(id) as any).n;
  for (const [what, sql] of [
    ['passage', 'SELECT COUNT(*) AS n FROM passages WHERE story_id = ?'],
    ['chapter', 'SELECT COUNT(*) AS n FROM chapters WHERE story_id = ?'],
    ['branch', 'SELECT COUNT(*) AS n FROM branches WHERE story_id = ?'],
    ['thread', 'SELECT COUNT(*) AS n FROM entries WHERE story_id = ?'],
    ['room', 'SELECT COUNT(*) AS n FROM addons WHERE story_id = ?'],
    ['pin', 'SELECT COUNT(*) AS n FROM chapter_pins WHERE story_id = ?'],
    ['arc', 'SELECT COUNT(*) AS n FROM arcs WHERE story_id = ?'],
    // #127 · A string is a pocket of the tale's thread, so it is a room and a thread here.
    ['connection', 'SELECT COUNT(*) AS n FROM entry_edges WHERE story_id = ?'],
    ['state', `SELECT COUNT(*) AS n FROM entry_states s JOIN entries e ON e.id = s.entry_id
                 WHERE e.story_id = ?`],
  ] as [string, string][])
    assert.strictEqual(count(sql, copy.id), count(sql, src.id),
      `the copy should hold as many ${what} rows as the book it came from`);

  // Where the writer was standing travels: the copy opens on the path the original was on, not on
  // main. `listStories` and every read resolve `active_branch` first, so a null here is a copy that
  // silently opens somewhere else.
  const activeName = (id: string) => (raw.prepare(
    'SELECT b.name FROM stories s JOIN branches b ON b.id = s.active_branch WHERE s.id = ?')
    .get(id) as any)?.name;
  assert.strictEqual(activeName(copy.id), 'she stayed',
    'the copy opens on the path the original was being written on');
  // And the fork points at the copy's own trunk rather than back across the two books.
  const parents = raw.prepare(`SELECT COUNT(*) AS n FROM branches c JOIN branches p ON p.id = c.parent_id
                               WHERE c.story_id = ? AND p.story_id != c.story_id`).get(copy.id) as any;
  assert.strictEqual(parents.n, 0, 'no branch in the copy is forked from a branch of the original');

  // ---- 2. EVERY COLUMN, not only the ones somebody thought to name. Ids are stripped because they
  // are the only thing meant to differ; anything else that differs is a column the copy dropped.
  const strip = (r: any, drop: string[]) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k)));
  const same = (what: string, sql: string, drop: string[], order: string) => {
    const rows = (id: string) => (raw.prepare(`${sql} ORDER BY ${order}`).all(id) as any[])
      .map((r) => strip(r, drop));
    assert.deepStrictEqual(rows(copy.id), rows(src.id),
      `every ${what} column should survive the copy — if this fails, a column was added to the ` +
      'table and not to duplicateStory');
  };
  // ORDERED BY CONTENT, NOT BY ID. The fork copied chapter one and passage one onto the second
  // path, so each of those exists twice per book with the same `idx`/`ordinal` — and SQLite is free
  // to return tied rows in either order, which made this fail against a copy that was correct.
  // Every column that distinguishes the twins is in the ORDER BY.
  same('passage', 'SELECT * FROM passages WHERE story_id = ?',
    ['id', 'chapter_id', 'story_id', 'branch_id'],
    'ordinal, variant_index, selected, created_at, body');
  same('chapter', 'SELECT * FROM chapters WHERE story_id = ?',
    ['id', 'story_id', 'branch_id'], 'idx, status, created_at, title');
  same('branch', 'SELECT * FROM branches WHERE story_id = ?',
    ['id', 'story_id', 'parent_id'], 'name');
  same('arc', 'SELECT * FROM arcs WHERE story_id = ?', ['id', 'story_id', 'branch_id'], 'from_chapter');
  // `created_at` is out for the same reason it is out of the thread comparison below: a copied room
  // is WRITTEN, by `upsertAddon`, and it stamps the moment it wrote. Both halves of the room copy
  // agree about that — the story-level loop in `duplicateStory` says so — and this is what noticed
  // when they did not.
  same('room', 'SELECT * FROM addons WHERE story_id = ?',
    ['id', 'story_id', 'entry_id', 'created_at'], 'name');
  // `created_at`/`updated_at` on a thread are stamped by `upsertEntry` as it writes, so those two
  // legitimately differ. Every other column is the card itself.
  same('thread', 'SELECT * FROM entries WHERE story_id = ?',
    ['id', 'story_id', 'created_at', 'updated_at'], 'title');
  same('state', `SELECT s.* FROM entry_states s JOIN entries e ON e.id = s.entry_id
                   WHERE e.story_id = ?`, ['id', 'entry_id'], 'from_chapter');

  // The two whose ids ARE the row, so they are named rather than compared.
  const pin = raw.prepare(`SELECT p.mode, e.title FROM chapter_pins p JOIN entries e ON e.id = p.entry_id
                             WHERE p.story_id = ?`).get(copy.id) as any;
  assert.deepStrictEqual({ mode: pin?.mode, title: pin?.title },
    { mode: 'force_in', title: 'Ferran' }, 'a pin lands on the copied chapter and the copied card');
  const edge = raw.prepare(`SELECT pa.title AS parent, ch.title AS child FROM entry_edges g
                              JOIN entries pa ON pa.id = g.parent_id
                              JOIN entries ch ON ch.id = g.child_id WHERE g.story_id = ?`)
    .get(copy.id) as any;
  assert.deepStrictEqual({ p: edge?.parent, c: edge?.child },
    { p: 'The Salt Road', c: 'Ferran' }, 'and a connection joins the copies, not the originals');

  // ---- 3. AND NOTHING JOINS THEM. This is the ask, and it is the thing a branch cannot give.
  const ferran = (story: string) => (db.entriesOf(story) as any[]).find((e) => e.title === 'Ferran');
  db.upsertEntry(copy.id, me, { id: ferran(copy.id).id, title: 'Ferran',
    body: 'Carries nothing any more.', activation: 'triggered', keys: ['Ferran'] });
  assert.match(ferran(src.id).body, /cannot wait/,
    'editing a thread in the copy must not reach the original — on a branch it would have');
  assert.match(ferran(copy.id).body, /nothing any more/, 'and the edit landed where it was made');

  db.upsertEntry(src.id, me, { title: 'The Weighmaster', body: 'Counts twice.',
    activation: 'always_on' });
  assert.strictEqual(db.entriesOf(copy.id).length, 2,
    'a thread added to the original does not appear in the copy');
  assert.strictEqual(db.entriesOf(src.id).length, 3, 'and the original has it');

  const bodies = (story: string) => (raw.prepare(
    'SELECT body FROM passages WHERE story_id = ? AND selected = 1 ORDER BY ordinal')
    .all(story) as any[]).map((r) => r.body);
  const before = bodies(src.id);
  const head = raw.prepare('SELECT id FROM passages WHERE story_id = ? ORDER BY ordinal LIMIT 1')
    .get(copy.id) as any;
  db.delPassage(copy.id, head.id);
  assert.deepStrictEqual(bodies(src.id), before,
    'and deleting prose in the copy leaves the original untouched');
});

// The gate, asked in the direction that matters. Copying reads a whole book, so it is refused the
// same way every other read of somebody else's book is.
ok('a book that is not yours cannot be copied', () => {
  const mine = db.owner('dup-mine'), theirs = db.owner('dup-theirs');
  const book: any = db.createStory(theirs, { title: 'Not Yours', premise: 'x' });
  assert.strictEqual(db.duplicateStory(mine, book.id, 'Mine Now'), null,
    'another writer\'s book cannot be copied into yours');
  assert.strictEqual(db.duplicateStory(mine, 'no-such-story', 'Nothing'), null,
    'and neither can one that does not exist');
});

// ---- UNCLAIMED PASSAGES, AND WHAT CLAIMS THEM (bugs.md #9, 2026-09-01).
//
// The server persists a generation at completion now, so a passage survives the browser going away.
// That needs a state: without one, every abandoned generation silently becomes part of the book and
// a returning device cannot tell what arrived while it was gone.
//
// Seth's design: "unclaimed and offered, and only claimed after the next message my thought being
// editing, regeneration or branching com into play."
ok('a passage can land unclaimed, survives editing and re-rolling, and the next message claims all of them', () => {
  const o = db.owner('claimer');
  const st: any = db.createStory(o, { title: 'Claims', genre: 'x', premise: 'y', pov: 'third past' });

  // DEFAULT IS CLAIMED, and this is the migration's whole safety property: every passage that
  // existed before the column, and every line the writer types, is claimed by construction.
  const mine = db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: st.chapterId,
    body: 'I wrote this myself.', author: 'human' })!;
  assert.strictEqual(db.unclaimedOf(st.id).length, 0,
    'a passage written with no flag is claimed — a writer typing a line has stood behind it');

  // What the streaming generate writes.
  const away = db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: st.chapterId,
    body: 'This landed while the phone was in a pocket.', author: 'model', claimed: false })!;
  assert.deepStrictEqual(db.unclaimedOf(st.id), [away], 'and one written unclaimed is offered');

  // IT IS A REAL PASSAGE. That is the point of the design rather than an accident of it: editing,
  // re-rolling and branching all have to work on it before the writer decides.
  assert.ok(db.passagesOf(st.id).some((r: any) => r.id === away), 'an unclaimed passage is in the book');
  db.editPassage(st.id, away, 'Edited before it was claimed.');
  assert.strictEqual(db.unclaimedOf(st.id).length, 1, 'editing it does not claim it');
  db.addVariant(st.id, away, 'A second take on it.');
  assert.strictEqual(db.unclaimedOf(st.id).length, 1, 'nor does re-rolling it');

  // THE NEXT MESSAGE CLAIMS IT, and claims everything waiting rather than one at a time.
  db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: st.chapterId,
    body: 'And so did this one.', author: 'model', claimed: false });
  assert.strictEqual(db.unclaimedOf(st.id).length, 2, 'two can be waiting');
  assert.strictEqual(db.claimPassages(st.id), 2, 'and one claim takes both');
  assert.deepStrictEqual(db.unclaimedOf(st.id), [], 'nothing left offered');
  assert.strictEqual(db.claimPassages(st.id), 0, 'claiming twice changes nothing');
  assert.ok(mine, 'the writer\'s own passage was minted');

  // AND IT DOES NOT REACH ANOTHER BOOK.
  const other: any = db.createStory(o, { title: 'Not Mine', genre: 'x', premise: 'y', pov: 'third past' });
  db.addPassage({ storyId: other.id, branchId: other.branchId, chapterId: other.chapterId,
    body: 'Another book.', author: 'model', claimed: false });
  assert.strictEqual(db.claimPassages(st.id), 0, "claiming one story leaves another story's alone");
  assert.strictEqual(db.unclaimedOf(other.id).length, 1, 'which is still offered');
});


// ---- AN OPTIONAL PICTURE ON A THREAD (2026-09-01). Seth: "lets add an optional image field."
//
// A SIDE TABLE, for the reason story_covers is one: entriesOf and entriesFor select e.*, so a BLOB
// on entries would ride in every view, every ledger page and every prompt assembly whether or not
// anything drew it.
//
// AND KEYED (entry_id, story_id), as chapter_pins was until #102. That composite is what
// closes SPEC 7.1's cross-story leak, and a picture reachable through the wrong book would be
// exactly that leak wearing a new column.
ok('a thread can carry an optional picture, scoped to its own book', () => {
  const o = db.owner('picowner');
  const a: any = db.createStory(o, { title: 'Has Pictures', genre: 'x', premise: 'y', pov: 'third past' });
  const b: any = db.createStory(o, { title: 'Has None', genre: 'x', premise: 'y', pov: 'third past' });
  const mine = db.upsertEntry(a.id, o, { title: 'Aldis', body: '[a man]' })!;
  const theirs = db.upsertEntry(b.id, o, { title: 'Sabel', body: '[a collector]' })!;

  // OPTIONAL MEANS ABSENT IS NORMAL, and that is the state most cards are in.
  assert.strictEqual(db.entryImageAt(a.id, mine), null, 'a thread starts with no picture');
  assert.deepStrictEqual(db.entryImagesOf(a.id), {}, 'and the book reports none');

  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  assert.strictEqual(db.setEntryImage(a.id, mine, jpeg), true, 'a picture can be set');
  assert.ok(db.entryImageAt(a.id, mine), 'and read back');
  assert.deepStrictEqual(Object.keys(db.entryImagesOf(a.id)), [mine], 'and listed for the book');
  assert.deepStrictEqual([...(db.entryImageBytes(a.id, mine) ?? [])], [...jpeg], 'byte for byte');

  // THE SCOPE. Asking book B for book A's thread must answer nothing, not the picture.
  assert.strictEqual(db.entryImageAt(b.id, mine), null,
    "another book cannot read this book's picture");
  assert.strictEqual(db.entryImageBytes(b.id, mine), null, 'nor its bytes');
  assert.deepStrictEqual(db.entryImagesOf(b.id), {}, 'nor see it in its own list');

  // AND A THREAD THAT IS NOT IN THIS BOOK IS REFUSED, rather than written and left to the FK.
  assert.strictEqual(db.setEntryImage(a.id, theirs, jpeg), false,
    "a thread from another book cannot be given a picture through this one");
  assert.strictEqual(db.entryImageAt(b.id, theirs), null, 'and nothing was written for it');

  // REPLACING keeps one row, so a card cannot accumulate pictures.
  db.setEntryImage(a.id, mine, new Uint8Array([0xff, 0xd8, 0xff, 9]));
  assert.deepStrictEqual(Object.keys(db.entryImagesOf(a.id)), [mine], 'setting again replaces');
  assert.deepStrictEqual([...(db.entryImageBytes(a.id, mine) ?? [])], [0xff, 0xd8, 0xff, 9], 'with the new bytes');

  // AND IT GOES WITH THE THREAD. The cascade is the whole reason the FK is composite.
  db.delEntryImage(a.id, mine);
  assert.strictEqual(db.entryImageAt(a.id, mine), null, 'removing it removes it');
  db.setEntryImage(a.id, mine, jpeg);
  db.delEntry(a.id, mine);
  assert.strictEqual(db.entryImageAt(a.id, mine), null,
    'and deleting the thread takes its picture with it rather than orphaning a blob');
});


/* FULL-TEXT SEARCH. The 2026-08-23 attempt shipped an FTS table nothing populated, and the first
 * cut of THIS one shipped an emptiness probe that could not detect an empty index — COUNT(*) on an
 * external-content table reads the content table, so it answered 1074 against an index with zero
 * rows in it and the rebuild never fired. Every query returned nothing. Both failures are silent:
 * search that finds nothing looks exactly like a book with nothing in it.
 *
 * So the first check here is not precision, it is that the index EXISTS AND ANSWERS. */
ok('search finds a word that is definitely in the book', () => {
  const o = db.owner('searcher');
  const s = db.createStory(o, { title: 'The Index' });
  db.addPassage({ ...s, storyId: s.id, body: 'The brass key turned in the lock. Rain on the water.' });
  const hits = db.search(o, 'brass');
  assert.ok(hits.length > 0, 'a word in a passage must be findable — an empty index is a silent '
    + 'failure that reads as an empty book');
  assert.strictEqual(hits[0].id, db.passagesOf(s.id)[0].id, 'and it returns that passage');
});

ok('it matches WORDS, not substrings — the whole reason FTS5 replaced the LIKE scan', () => {
  const o = db.owner('sub');
  const s = db.createStory(o, { title: 'Substrings' });
  db.addPassage({ ...s, storyId: s.id, body: 'He started, and his heart was a part of it. Ashe washed the cash.' });
  /* THE CONTRACT IS "NO MID-WORD MATCHES", NOT "NO PARTIAL MATCHES", and the difference is the
   * prefix star the sanitiser puts on the last token. Written down here because the first version
   * of this check asserted ash finds NOTHING, and that contradicted the design in the same commit:
   * ash SHOULD reach Ashe, the way typing bras should reach brass.
   *
   * What LIKE did and this must not: match in the MIDDLE of a word. Measured on the live library
   * before the change — "art" returned 28 hits of which ZERO were the word art (heart, part,
   * started) and "ash" returned 11 of which zero were the word ash (washed, cash). */
  assert.strictEqual(db.search(o, 'art').length, 0,
    'art must NOT match heart, part or started — no word here STARTS with art, and mid-word '
    + 'matching is the defect FTS5 replaced');
  assert.strictEqual(db.search(o, 'cash').length, 1, 'a word that really is there is found');
  assert.strictEqual(db.search(o, 'ash').length, 1,
    'and ash DOES reach Ashe, deliberately: the last token is a prefix so the box works while it '
    + 'is being typed. That is a partial match at the START, never in the middle');
  assert.strictEqual(db.search(o, 'heart').length, 1, 'and a real word is still found');
});

ok('two words are AND, not adjacency — LIKE could not do this at all', () => {
  const o = db.owner('two');
  const s = db.createStory(o, { title: 'Two Words' });
  db.addPassage({ ...s, storyId: s.id, body: 'Rain fell for three days. Much later, the water rose.' });
  assert.strictEqual(db.search(o, 'rain water').length, 1,
    'both words in one passage, a sentence apart — the LIKE scan wanted them adjacent and found 0');
  assert.strictEqual(db.search(o, 'rain zzzabsent').length, 0, 'and AND means AND');
});

/* THE TRIGGERS, WHICH ARE THE PART THAT ROTS. Population was left to application code last time and
 * application code forgets — there are six write paths into entries alone, plus src/import.ts and a
 * hand-run UPDATE at the sqlite3 prompt. These assert the index follows the row whatever moved it,
 * and they are the checks that would go red if somebody dropped a trigger while editing the schema. */
ok('the index follows an INSERT, an UPDATE and a DELETE without anything calling a refresh', () => {
  const o = db.owner('sync');
  const s = db.createStory(o, { title: 'Sync' });
  const pid = db.addPassage({ ...s, storyId: s.id, body: 'The zephyr crossed the courtyard.' });
  assert.strictEqual(db.search(o, 'zephyr').length, 1, 'INSERT reaches the index');

  db.editPassage(s.id, pid, 'The mistral crossed the courtyard.');
  assert.strictEqual(db.search(o, 'zephyr').length, 0, 'UPDATE removes the old word');
  assert.strictEqual(db.search(o, 'mistral').length, 1, 'and adds the new one');

  db.delPassage(s.id, pid);
  assert.strictEqual(db.search(o, 'mistral').length, 0, 'DELETE removes it');
});

ok('a card is found by its title and by its body, and stops being found when deleted', () => {
  const o = db.owner('cards');
  const s = db.createStory(o, { title: 'Cards' });
  db.upsertEntry(s.id, o, { title: 'Halvard Quill', body: 'A notary with a wet cough.',
                            activation: 'always_on', keys: [] });
  assert.strictEqual(db.search(o, 'halvard').length, 1, 'by title');
  assert.strictEqual(db.search(o, 'notary').length, 1, 'by body');
  db.delEntry(s.id, db.entriesOf(s.id)[0].id);
  assert.strictEqual(db.search(o, 'halvard').length, 0, 'and the trigger takes it back out');
});

/* THE QUERY SANITISER. Raw input reaching MATCH is a syntax error where the writer expected results,
 * and FTS5's grammar collides with ordinary prose: OR, NOT, NEAR and * are all operators. */
ok('the search box cannot hand FTS5 something it will refuse', () => {
  const o = db.owner('safe');
  const s = db.createStory(o, { title: 'Safe' });
  db.addPassage({ ...s, storyId: s.id, body: 'The rain and the canal and the key.' });
  for (const nasty of ['rain OR canal', 'rain NEAR canal', '"unclosed', 'key)', '*', 'AND', 'rain*']) {
    assert.doesNotThrow(() => db.search(o, nasty), `"${nasty}" must not throw`);
  }
  assert.strictEqual(db.search(o, '   ').length, 0, 'whitespace finds nothing, never everything');
  assert.strictEqual(db.search(o, '!!!').length, 0, 'punctuation alone finds nothing');
  // The operators are neutralised into words rather than obeyed.
  assert.strictEqual(db.ftsQuery('rain OR canal'), '"rain" "or" "canal"*',
    'OR is a word here, not an operator — obeying it would silently widen the search');
  assert.strictEqual(db.ftsQuery('  '), null, 'nothing searchable returns null, not an empty match');
});

ok('the last word is a prefix so search works while it is being typed', () => {
  const o = db.owner('prefix');
  const s = db.createStory(o, { title: 'Prefix' });
  db.addPassage({ ...s, storyId: s.id, body: 'The brasswork gleamed.' });
  assert.strictEqual(db.search(o, 'brass').length, 1,
    'typing bras/brass finds brasswork — the LIKE scan did this and losing it would read as a regression');
  assert.strictEqual(db.ftsQuery('brass key'), '"brass" "key"*',
    'only the LAST token gets the star; the earlier ones are words the writer finished');
});


/* THE SLICE CREATED A NEW PAIR THAT MUST AGREE, so it gets a guard in the same commit.
 *
 * `searchSQL` and `searchArgs` live in src/search.ts and are written apart from each other: one
 * builds placeholders, the other builds values. A mismatch between them is not an error — SQLite
 * binds what it is given and returns the WRONG ROWS, silently, which is the worst shape of bug this
 * repo has a name for: two things that must agree with only one of them guarded.
 *
 * Counting `?` in the SQL and comparing it to the argument list is the whole check, and it is cheap
 * because both are pure strings. Falsified by dropping the `if (storyId) args.push(storyId)` line,
 * which turns the scoped case red while leaving the unscoped one green. */
const searchSlice = await import('../src/search.ts');
ok('the search SQL and its arguments agree, scoped and unscoped', () => {
  const search = searchSlice;
  // THE REAL PREDICATES, because the placeholder count depends on them and they live in db.ts.
  // The first version of this check passed the literals 'OWNER' and 'LIVE', which carry no `?` at
  // all, and it reported 3 against 9 — the test was wrong and the code was right. A guard on two
  // things agreeing has to be built from the two things.
  const LIVE_E = "(e.sync IS NULL OR e.sync != 'dropped')";
  for (const storyId of [undefined, 's-1']) {
    const sql = search.searchSQL(db.MINE(), LIVE_E, !!storyId);
    const args = search.searchArgs('MATCH', 'owner', storyId);
    const holes = (sql.match(/\?/g) ?? []).length;
    assert.strictEqual(holes, args.length,
      `${storyId ? 'scoped' : 'unscoped'}: SQL has ${holes} placeholders, searchArgs supplies ${args.length}`);
  }
});

ok('the search slice never reaches for the database itself', () => {
  const src = readFileSync(new URL('../src/search.ts', import.meta.url), 'utf8');
  // The point of the slice: it owns the KNOWLEDGE and db.ts owns EXECUTION. If this file ever
  // imports db.ts or node:sqlite it has stopped being a slice and started being a second writer
  // on the book, with its own idea of what the ownership gate says.
  assert.ok(!/from '\.\/db\.ts'/.test(src), 'src/search.ts must not import db.ts');
  assert.ok(!/node:sqlite/.test(src), 'src/search.ts must not open a database');
  assert.ok(!/\bMINE\s*\(/.test(src.replace(/`[^`]*`/g, '')),
    'the ownership gate is passed IN as a string; src/search.ts must not define or call it');
});

/* AN ACT IS OUT OF DATE (#47) when a chapter under it has changed since it was written: the
 * chapter's summary no longer reads as it did when the act was built, or the chapter is stale. The
 * check is pure -- the fingerprint the act stored, and the chapters it covers as they are now -- so
 * it is asserted in both directions here, with no database and no route around it. */
ok('an act is out of date when a covered summary changed or a covered chapter is stale, and not otherwise', () => {
  const built = [{ index: 3, summary: 'Aldis borrows from Marek.' },
                 { index: 4, summary: 'The vault floods.' }];
  const print = db.actPrint(built);
  const now = (over: any = {}) => built.map((c) => ({ ...c, summaryStale: false, ...(over[c.index] ?? {}) }));

  assert.strictEqual(db.actOutOfDate(print, now()), null,
    'nothing has changed, so the act is not out of date');
  assert.deepStrictEqual(db.actOutOfDate(print, now({ 4: { summary: 'The vault holds.' } })),
    { chapter: 4, why: 'changed' }, 'a covered summary re-written names that chapter');
  assert.deepStrictEqual(db.actOutOfDate(print, now({ 3: { summaryStale: true } })),
    { chapter: 3, why: 'stale' }, 'a covered chapter gone stale names that chapter');
  assert.deepStrictEqual(db.actOutOfDate(print, now({ 3: { summaryStale: true }, 4: { summary: 'x' } })),
    { chapter: 3, why: 'stale' }, 'with two causes it names the first chapter');
  assert.deepStrictEqual(db.actOutOfDate(print, now({ 3: { summary: null } })),
    { chapter: 3, why: 'changed' }, 'a summary taken away is a change too');
  const redone = now({ 4: { summary: 'The vault holds.' } });
  assert.strictEqual(db.actOutOfDate(db.actPrint(redone), redone), null,
    'a fingerprint taken again from the chapters as they are now clears it');
});

/* A BRANCH CARRIES WHAT EACH ACT WAS BUILT FROM. An act out of date on the trunk is out of date on
 * the fork, naming the same chapter -- a fork that dropped the fingerprint would read every act as
 * current. The whole-book copy is guarded by the every-column comparison above. */
ok('a branch keeps what each act was built from, so out of date works on the fork', () => {
  const me = db.owner('acts');
  const b: any = db.createStory(me, { title: 'Fork of acts', premise: 'p' });
  const at = (chId: string, body: string) =>
    db.addPassage({ storyId: b.id, branchId: b.branchId, chapterId: chId, body })!;
  const sum = (chId: string, text: string) => {
    const ps = db.passagesOfChapter(chId);
    db.setSummary(chId, text, ps.at(-1).ordinal, db.proseHash(ps.map((p: any) => p.body)), 'model');
  };
  at(b.chapterId, 'One.');
  const two = db.endChapter(b.id, b.branchId).opened;
  at(two, 'Two.');
  db.endChapter(b.id, b.branchId);
  const last = db.passagesOfChapter(two).at(-1).ordinal;
  sum(b.chapterId, 'First.'); sum(two, 'Second.');
  db.addArc(b.id, { branchId: b.branchId, fromChapter: 1, toChapter: 2, summary: 'Both.' });
  sum(two, 'Second, again.');
  const outOn = (storyId: string) => {
    const a = db.arcsOf(storyId)[0];
    const chs = db.chapters(storyId).filter((c: any) => c.idx >= a.from_chapter && c.idx <= a.to_chapter)
      .map((c: any) => ({ index: c.idx, summary: c.summary, summaryStale: db.summaryStale(c) }));
    return db.actOutOfDate(a.summaries_hash, chs);
  };
  assert.deepStrictEqual(outOn(b.id), { chapter: 2, why: 'changed' }, 'the act is out of date on the trunk');
  const fork = db.forkBranch(b.id, b.branchId, last, 'the other way')!;
  db.setActiveBranch(b.id, fork);
  assert.deepStrictEqual(outOn(b.id), { chapter: 2, why: 'changed' },
    'and on the fork, naming the same chapter');

  // AN ACT FROM BEFORE #47 has no fingerprint. The migration gives it its chapters as they are now,
  // and only acts that have none: a second run changes nothing. Read on the trunk again, where
  // `two` is.
  db.setActiveBranch(b.id, b.branchId);
  raw.prepare('UPDATE arcs SET summaries_hash = NULL WHERE story_id = ?').run(b.id);
  assert.ok(db.backfillActPrints() >= 2, 'the migration fills the acts that have no fingerprint');
  assert.strictEqual(outOn(b.id), null, 'and takes their chapters as they are at migration time');
  sum(two, 'Second, a third time.');
  assert.deepStrictEqual(outOn(b.id), { chapter: 2, why: 'changed' }, 'from then on the check is live');
  assert.strictEqual(db.backfillActPrints(), 0, 'and a second run writes nothing');
  db.delStory(b.id);
});

/* A TEST THAT FORGETS ANANSI_DB IS REFUSED THE DEFAULT LIBRARY, in db.ts, where every opener passes.
 *
 * Six times a test, a bench or status opened the live library because one call site did not set
 * ANANSI_DB, and each fix guarded that one site. The guard is in the shared opener now. This runs
 * a COPY of src/ under a scratch root, so the default file it could open is that root's, never the
 * real one: a broken guard here opens a scratch file, not a book. */
ok('a test, a bench check or status with no ANANSI_DB is refused the default library', () => {
  const root = mkdtempSync('/tmp/anansi-guard-');
  try {
    cpSync(new URL('../src', import.meta.url).pathname, join(root, 'src'), { recursive: true });
    const probe = `const db = await import('${root}/src/db.ts'); console.log('opened ' + db.FILE);`;
    for (const d of ['test', 'bench']) mkdirSync(join(root, d));
    for (const f of ['test/probe.ts', 'bench/probe.ts', 'status.ts', 'serve.ts']) writeFileSync(join(root, f), probe);
    const env = { ...process.env };
    delete env.ANANSI_DB;
    const run = (file: string, ...args: string[]) => {
      const r = spawnSync(process.execPath, ['--experimental-strip-types', join(root, file), ...args],
        { env, encoding: 'utf8' });
      return { code: r.status, out: r.stdout + r.stderr };
    };
    const live = join(root, 'anansi.db');
    for (const [file, ...args] of [['test/probe.ts'], ['bench/probe.ts', 'check'], ['status.ts']]) {
      const r = run(file, ...args);
      assert.notStrictEqual(r.code, 0, `GUARD-REFUSES: ${file} ${args.join(' ')} opened the default library: ${r.out.slice(0, 200)}`);
      assert.match(r.out, /ANANSI_DB/, `and ${file} is told to set ANANSI_DB`);
      assert.ok(!existsSync(live), `and no default file was made by ${file}`);
    }
    // The live server and a bench report are what the default file is FOR: both still open it.
    for (const [file, ...args] of [['serve.ts'], ['bench/probe.ts', 'report']]) {
      const r = run(file, ...args);
      assert.strictEqual(r.code, 0, `GUARD-ALLOWS: ${file} ${args.join(' ')} was refused: ${r.out.slice(0, 300)}`);
      assert.match(r.out, new RegExp(`opened ${live}`), `and ${file} opened the default file`);
      rmSync(live, { force: true }); rmSync(live + '-wal', { force: true }); rmSync(live + '-shm', { force: true });
    }
    // Set explicitly, a test opens what it names, the default path included.
    env.ANANSI_DB = join(root, 'named.db');
    assert.strictEqual(run('test/probe.ts').code, 0, 'GUARD-NAMED: a test that names its library opens it');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// #76. THE UPDATE REPORT. A migration that rewrites a writer's text backs up first, once, and says per
// tale what it moved; the tale's view carries the lines, so the report is behind the same ownership
// gate as the book. Lines come back newest first, each naming the thread it was about.
const storyMod = await import('../src/story.ts');
ok('the update report: one backup before the first rewrite, and lines per tale, newest first', () => {
  const t = db.createStory(o, { title: 'Report', premise: 'p' });
  const other = db.createStory(o, { title: 'Other', premise: 'p' });
  const e = { id: 'e-report-halsey' };
  db.upsertEntry(t.id, o, { id: e.id, title: 'Halsey', body: 'a singer', entryType: 'character' });
  assert.deepStrictEqual(db.updatesOf(t.id), [], 'REPORT-EMPTY: nothing has moved in a new tale');
  const first = db.beforeRewrite();
  assert.ok(existsSync(first.file), 'REPORT-BACKUP: the backup exists before anything is rewritten');
  assert.strictEqual(db.beforeRewrite().file, first.file, 'REPORT-ONCE: a second rewrite takes no second backup');
  db.noteUpdate(t.id, 'Her Facts moved into Always true.', e.id);
  db.noteUpdate(t.id, 'Nothing else moved.');
  const lines = db.updatesOf(t.id);
  assert.deepStrictEqual(lines.map((l: any) => l.line), ['Nothing else moved.', 'Her Facts moved into Always true.'],
    'REPORT-ORDER: newest first');
  assert.strictEqual(lines[1].entryId, e.id, 'REPORT-THREAD: a line names its thread');
  assert.strictEqual(lines[1].entryTitle, 'Halsey', '  by its title too');
  assert.strictEqual(lines[0].backup, first.file, 'REPORT-NAMES-BACKUP: each line says which backup came before it');
  assert.strictEqual(lines[0].backupAt, first.at, 'REPORT-BACKUP-TIME: and when that backup was taken, not when the line was');
  // KEPT FOR THE WEEK THE PAGE PROMISES. The rotating backups keep twelve and the server takes one
  // every half hour, so a pre-update copy in their name was pruned in about six hours. Twelve more
  // rotating backups must leave it where it is.
  const dir = join(first.file, '..');
  for (let i = 0; i < 13; i++) db.backup(dir, 12);
  assert.ok(existsSync(first.file), 'REPORT-BACKUP-KEPT: the rotating backups do not prune the pre-update copy');
  // AND READING IT WRITES NOTHING: another connection would see data_version move on a commit.
  const raw = new RawDb('/tmp/anansi-test.db');
  const v0 = (raw.prepare('PRAGMA data_version').get() as any).data_version;
  db.updatesOf(t.id); storyMod.view(t.id);
  assert.strictEqual((raw.prepare('PRAGMA data_version').get() as any).data_version, v0,
    'REPORT-READ-ONLY: opening the report changes nothing in the library');
  raw.close();
  assert.deepStrictEqual(db.updatesOf(other.id), [], 'REPORT-PER-TALE: another tale sees none of it');
  rmSync(first.file, { force: true });
});

// #77. ALWAYS TRUE ON UPDATE DAY. The library's threads in the shape they had: a facts pocket switched
// off, role / provenance / scope / history pockets beside it, a thread with no facts at all, a thread
// whose facts and Info are both written. Rows are written past the floor, as an old server wrote them.
ok('update day: every facts text becomes Always true, switched on, with the folded pockets in it', () => {
  const t = db.createStory(o, { title: 'Bedlam', premise: 'p' });
  db.upsertEntry(t.id, o, { id: 'e-halsey', title: 'Halsey', body: '[Halsey: Grammy-nominated singer]', entryType: 'character' });
  db.upsertEntry(t.id, o, { id: 'e-marek', title: 'Marek', body: '', entryType: 'character' });
  db.upsertEntry(t.id, o, { id: 'e-bare', title: 'Bare', body: '[Bare: a clerk]', entryType: 'character' });
  db.upsertEntry(t.id, o, { id: 'e-key', title: 'The key', body: '', entryType: 'item' });
  const raw = new RawDb('/tmp/anansi-test.db');
  const put = (id: string, entry: string, slot: string, name: string, body: string, active: number) =>
    raw.prepare(`INSERT INTO addons (id,story_id,entry_id,slot,name,body,keys,active,created_at)
      VALUES (?,?,?,?,?,?,'[]',?,1)`).run(id, t.id, entry, slot, name, body, active);
  put('a-h-facts', 'e-halsey', 'facts', 'facts', '[Halsey: 26; secretary]', 0);
  put('a-h-voice', 'e-halsey', 'voice', 'Speech', '[clipped]', 1);
  put('a-m-facts', 'e-marek', 'facts', 'facts', '[Marek: moneylender]', 1);
  put('a-m-role', 'e-marek', 'role', 'role', '[the one Aldis owes]', 1);
  put('a-m-hist', 'e-marek', 'history', 'The war', '[lost a hand at Sallow]', 0);
  put('a-k-prov', 'e-key', 'provenance', 'provenance', 'cut from the vault lock', 1);
  // TWO FACTS ON ONE THREAD, both off: a shape the old screens allowed. One Always true comes of it.
  db.upsertEntry(t.id, o, { id: 'e-twice', title: 'Twice', body: '', entryType: 'character' });
  put('a-t-1', 'e-twice', 'facts', 'facts', '[Twice: born in the flood]', 0);
  put('a-t-2', 'e-twice', 'facts', 'facts', '[Twice: left-handed]', 0);
  raw.close();

  db.foldAlwaysTrue();
  const rooms = (e: string) => (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === e);
  const facts = (e: string) => rooms(e).find((a) => a.slot === 'facts');
  assert.strictEqual(facts('e-halsey').active, 1, 'FOLD-ON: a facts pocket that was off is Always true, and on');
  assert.strictEqual(facts('e-halsey').body, '[Halsey: 26; secretary]', '  with its text unchanged');
  assert.ok(rooms('e-halsey').some((a) => a.slot === 'voice'), '  and her other pockets stay pockets');
  assert.strictEqual(facts('e-marek').body, '[Marek: moneylender]\n[Role: the one Aldis owes]',
    'FOLD-POCKETS: role is appended to Always true under its label');
  // HISTORY GOES TO OVER TIME (ADR 0005, Seth in the grill): what has happened to the thread, so it
  // joins the text Over time starts from, not the evergreen half.
  assert.strictEqual((db.entriesOf(t.id) as any[]).find((e) => e.id === 'e-marek').body, '[The war: lost a hand at Sallow]',
    'FOLD-HISTORY: history is appended to where the thread stands (Over time), under its label');
  assert.deepStrictEqual(rooms('e-marek').map((a) => a.slot), ['facts'], '  and neither is a pocket any more');
  assert.strictEqual(facts('e-key')?.body, '[Provenance: cut from the vault lock]',
    'FOLD-NEW: a thread with only a folded pocket gets an Always true made of it');
  assert.strictEqual(facts('e-key')?.active, 1, '  switched on');
  assert.strictEqual(facts('e-bare'), undefined, 'a thread with nothing to fold is given nothing');
  const twice = rooms('e-twice').filter((a) => a.slot === 'facts');
  assert.deepStrictEqual(twice.map((a) => [a.body, a.active]), [['[Twice: born in the flood]\n[Twice: left-handed]', 1]],
    'FOLD-TWO: two Facts on one thread become one Always true, the older first, switched on');

  const lines = db.updatesOf(t.id).map((l: any) => `${l.entryTitle}: ${l.line}`);
  const has = (re: RegExp) => lines.some((l: string) => re.test(l));
  assert.ok(has(/^Halsey: .*was switched off/i), `REPORT-ON: the switched-off one is named (${lines.join(' | ')})`);
  assert.ok(has(/^Halsey: .*agree/i), 'REPORT-BOTH: a thread with Always true and Info both written is asked to check they agree');
  assert.ok(has(/^Marek: Role moved into Always true/), 'REPORT-FOLD: the folded pockets are named on their thread');
  assert.ok(has(/^Marek: History \(The war\) moved into Over time/), 'REPORT-HISTORY: and history says where it went, by its kind as well as its name');
  assert.ok(db.updatesOf(t.id).every((l: any) => l.backup), 'REPORT-BACKUP-FIRST: every line names the backup taken before it');
  assert.ok(has(/^null: One thread has no Always true yet: Bare\./), `REPORT-NONE: threads with no Always true are named, in one line for the tale (${lines.join(' | ')})`);
  assert.ok(has(/^Marek: .*agree/i), '  and Marek, whose Info is his history now, is asked too');

  const before = db.updatesOf(t.id).length;
  db.foldAlwaysTrue();
  assert.strictEqual(facts('e-marek').body, '[Marek: moneylender]\n[Role: the one Aldis owes]',
    'FOLD-ONCE: a second run changes nothing');
  assert.strictEqual(db.updatesOf(t.id).length, before, '  and writes no second report');
});

// #77 · ONE ALWAYS TRUE PER THREAD, AND IT IS ON. Every writer of a thread (the tray, a paste, the
// forge, a pulled card) goes through upsertAddon, so the floor is there: a second one edits the
// first, and none is ever written switched off. Without it the update's "switched off" pass found
// the tray's own new rows on the next boot and reported them as old.
ok('Always true is one row per thread, written switched on, whoever writes it', () => {
  const t = db.createStory(o, { title: 'One true', premise: 'p' });
  db.upsertEntry(t.id, o, { id: 'e-one-true', title: 'Ilse', body: '', entryType: 'character' });
  const a = db.upsertAddon(t.id, 'e-one-true', { slot: 'facts', name: 'facts', body: '[Ilse: a ferrywoman]' });
  const b = db.upsertAddon(t.id, 'e-one-true', { slot: 'facts', name: 'facts', body: '[Ilse: a ferrywoman, forty]' });
  const rows = (db.addonsOf(t.id) as any[]).filter((x) => x.entry_id === 'e-one-true' && x.slot === 'facts');
  assert.strictEqual(rows.length, 1, 'ONE-TRUE: a second Always true edits the first');
  assert.strictEqual(b, a, '  and says it is the same one');
  assert.strictEqual(rows[0].body, 'a ferrywoman, forty', '  with the newer text, stored plain (#110)');
  assert.strictEqual(rows[0].active, 1, 'ONE-TRUE-ON: and it is on, with nobody pressing a switch');
  const lines = db.updatesOf(t.id).length;
  db.foldAlwaysTrue();
  assert.strictEqual(db.updatesOf(t.id).length, lines, '  so a later boot finds nothing to switch on, and reports nothing');
});

// #78 · ONE ANSWER TO "WHERE DOES IT STAND NOW". The screen showed the Over time entry in force by a
// rule of its own beside the one the model is sent by (`context.resolveBody`). The view carries the
// engine's answer instead, for the scene it is opened at, and this holds the two to one.
{
  const { resolveBody } = await import('../src/context.ts');
  const t = db.createStory(o, { title: 'Now', premise: 'p' }) as any;
  db.endChapter(t.id, t.branchId); db.endChapter(t.id, t.branchId);
  db.upsertEntry(t.id, o, { id: 'e-now', title: 'Ada', body: '[Ada: at scene one]', entryType: 'character' });
  db.upsertState(t.id, 'e-now', { fromChapter: 2, body: '[Ada: from scene two]', label: 'two' });
  db.upsertState(t.id, 'e-now', { fromChapter: 5, body: '[Ada: from scene five]', label: 'five' });
  const chs = db.chapters(t.id) as any[];
  for (const [ch, want] of [[chs[0], null], [chs[1], 'two'], [chs[2], 'two']] as const) {
    const v: any = storyMod.view(t.id, ch.id);
    const e = v.entries.find((x: any) => x.id === 'e-now');
    const st = e.states.find((x: any) => x.id === e.nowStateId);
    assert.strictEqual(st?.label ?? null, want, `NOW-AT: at scene ${ch.idx} the entry in force is ${want ?? 'the scene 1 text'}`);
    assert.strictEqual(st ? st.body : e.body, resolveBody(e, v.currentChapter.index),
      `NOW-IS-SENT: and it is the text the model is sent at scene ${ch.idx}`);
  }
  console.log('  ok  the view names the Over time entry in force at its scene, the one the model is sent');
}

// #79 · WEARING AND RETIRING ARE DATED. A press at scene N writes an Over time event from N, and a
// thread written before events existed keeps what it had at every earlier scene: its first dated
// press first records what was already true, from scene 1 (or from the scene it was retired at).
{
  const ctx = await import('../src/context.ts');
  const t = db.createStory(o, { title: 'Dated', premise: 'p' }) as any;
  for (let i = 0; i < 5; i++) db.endChapter(t.id, t.branchId);
  db.upsertEntry(t.id, o, { id: 'e-dated', title: 'Vel', body: '[Vel]', entryType: 'character' });
  const coat = db.upsertAddon(t.id, 'e-dated', { slot: 'outfit', name: 'The grey coat', body: '[grey]' })!;
  const dress = db.upsertAddon(t.id, 'e-dated', { slot: 'outfit', name: 'The red dress', body: '[red]' })!;
  db.setAddonActive(t.id, coat, true);                     // worn the old way: no date
  db.setRetired(t.id, 'e-dated', 3);                       // retired the old way, at scene 3
  const view = () => (storyMod.view(t.id) as any).entries.find((e: any) => e.id === 'e-dated');
  const before = [1, 2, 3, 4, 5, 6].map((at) => [ctx.wornAt(view(), at), ctx.retiredAt(view(), at)]);
  db.setRetired(t.id, 'e-dated', null, 5);                 // brought back at scene 5, dated
  db.setAddonActive(t.id, dress, true, 4);                 // the dress from scene 4, dated
  const e = view();
  assert.deepStrictEqual([1, 2, 3].map((at) => [ctx.wornAt(e, at), ctx.retiredAt(e, at)]), before.slice(0, 3),
    'DATED-KEEPS: scenes before the first dated press read exactly as they did');
  assert.strictEqual(ctx.wornAt(e, 4), dress, 'DATED-WEAR: the dress is worn from scene 4');
  assert.strictEqual(ctx.wornAt(e, 2), coat, '  and the coat before it');
  assert.strictEqual(ctx.retiredAt(e, 4), 3, 'DATED-RETIRE: retired at 3, still retired at 4');
  assert.strictEqual(ctx.retiredAt(e, 6), null, '  and back from 5');
  assert.deepStrictEqual(e.events.map((x: any) => [x.kind, x.fromChapter]),
    [['retire', 3], ['return', 5], ['wear', 1], ['wear', 4]], 'DATED-EVENTS: the view carries every dated event');
  console.log('  ok  wearing and retiring are dated, and what was true before the first date is kept');
}

// #75 · THE TALE'S OWN POCKETS: instructions for the whole tale, hung off no thread. Written by the
// writer on the tale's thread, carried by the view, and sent only while switched on.
{
  const t = db.createStory(o, { title: 'Own pockets', premise: 'A slow book.' }) as any;
  const id = db.upsertAddon(t.id, null, { slot: 'instruction', name: 'Slow burn', body: 'Nobody touches before scene ten.' });
  assert.ok(id, 'TALE-POCKET-WRITE: the tale can hold a pocket of its own');
  db.upsertEntry(t.id, o, { id: 'e-own', title: 'Ada', body: '[Ada]', entryType: 'character' });
  assert.strictEqual(db.upsertAddon(t.id, 'e-own', { slot: 'instruction', name: 'x', body: 'y' }), null,
    'TALE-POCKET-ONLY: and a thread cannot hold one of those');
  const v: any = storyMod.view(t.id);
  assert.deepStrictEqual(v.talePockets.map((a: any) => a.name), ['Slow burn'], 'TALE-POCKET-VIEW: the view carries it');
  const sent = () => (storyMod.assemble(v, { global: 8192, slots: 1, perSlot: 8192 } as any) as any).input?.story?.pockets
    ?? (storyMod.assemble(v, { global: 8192, slots: 1, perSlot: 8192 } as any) as any).story?.pockets;
  assert.deepStrictEqual(sent() ?? [], [], 'TALE-POCKET-OFF: switched off, it is not sent');
  db.setAddonActive(t.id, id!, true);
  const v2: any = storyMod.view(t.id);
  const out = storyMod.assemble(v2, { global: 8192, slots: 1, perSlot: 8192 } as any) as any;
  assert.ok(JSON.stringify(out).includes('Nobody touches before scene ten.'), 'TALE-POCKET-ON: switched on, it is in what is sent');
  console.log("  ok  the tale holds pockets of its own, sent while switched on");
}

// The cover behind the prose, blurred or on the other side (Seth, 2026-10-27).
ok('a tale keeps its cover blur and flip, a partial save leaves them, and a copy carries them', () => {
  const o = db.owner('coverfx');
  const t = db.createStory(o, { title: 'Cover', premise: 'p' });
  const { view } = { view: (id: string) => db.getStory(id) as any };
  assert.strictEqual(view(t.id).cover_blur, 0, 'off on a new tale');
  db.updateStory(t.id, { coverBlur: 8, coverFlip: true });
  assert.deepStrictEqual([view(t.id).cover_blur, view(t.id).cover_flip], [8, 1], 'both save, the blur as an amount');
  db.updateStory(t.id, { title: 'Cover again' });
  assert.deepStrictEqual([view(t.id).cover_blur, view(t.id).cover_flip], [8, 1], 'a save that does not name them leaves them');
  db.updateStory(t.id, { coverBlur: 999 });
  assert.strictEqual(view(t.id).cover_blur, db.MAX_COVER_BLUR, 'and the blur is capped');
  db.updateStory(t.id, { coverBlur: 8 });
  assert.strictEqual(view(t.id).cover_fade, 1, 'the fade is on by default');
  db.updateStory(t.id, { coverFade: false });
  assert.strictEqual(view(t.id).cover_fade, 0, 'and can be turned off');
  db.updateStory(t.id, { title: 'Cover still' });
  assert.strictEqual(view(t.id).cover_fade, 0, 'and a save that does not name it leaves it off');
  const copy = db.duplicateStory(o, t.id, 'Cover copy') as any;
  const cid = copy?.id ?? copy;
  assert.deepStrictEqual([view(cid).cover_blur, view(cid).cover_flip], [8, 1], 'a copy of the tale carries them');
});

// #103 · A NEW TALE NAMING AN IP FOLLOWS THE WORLD ITS WRITER ALREADY HAS BY THAT NAME. The match
// is the title, trimmed and in any case, and only among that writer's own Worlds.
ok('a World is found by its name for its own writer, and never for another', () => {
  const kia = db.owner('kia-103'), seth = db.owner('seth-103');
  const hers = db.createWorld(kia, { title: 'Elden Ring' });
  db.createStory(kia, { title: 'Dune' });   // a tale, not a World: never followed by name
  assert.strictEqual(db.worldNamed(kia, '  elden RING ')?.id, hers.id, 'any case, trimmed');
  assert.strictEqual(db.worldNamed(kia, 'Elden'), null, 'the whole name, not part of it');
  const poke = db.createWorld(kia, { title: 'Pokémon' });
  assert.strictEqual(db.worldNamed(kia, 'POKÉMON')?.id, poke.id, 'any case, past ASCII too');
  assert.strictEqual(db.worldNamed(kia, 'dune'), null, 'a tale of that name is not a World');
  assert.strictEqual(db.worldNamed(kia, '   '), null, 'a blank name finds nothing');
  assert.strictEqual(db.worldNamed(seth, 'Elden Ring'), null, "another writer's World is never found");
  const his = db.createWorld(seth, { title: 'elden ring' });
  assert.strictEqual(db.worldNamed(seth, 'Elden Ring')?.id, his.id, 'and his own is');
  assert.strictEqual(db.worldNamed(kia, 'Elden Ring')?.id, hers.id, 'while hers stays hers');
});

// #103 · THE TALE'S WORLD FIELD AND WHAT IT FOLLOWS ARE ONE ANSWER. The field rides in every call
// beside the genre and narrows a web search, so a tale following one World while its field names
// another would tell the model two different settings.
ok("a tale following a World names it in its World field, and the two never disagree", () => {
  const kia = db.owner('kia-103-pair'), seth = db.owner('seth-103-pair');
  const ring = db.createWorld(kia, { title: 'Elden Ring' });
  const dune = db.createWorld(kia, { title: 'Dune' });
  const tale = db.createStory(kia, { title: 'The Lands Between' });
  const view = () => db.getStory(tale.id) as any;
  db.updateStory(tale.id, { world: 'elden ring', loreFrom: ring.id });
  assert.deepStrictEqual([view().lore_from, view().world], [ring.id, 'Elden Ring'],
    "following a World names it, in the World's own words");
  db.updateStory(tale.id, { world: 'Dark Souls' });
  assert.strictEqual(view().world, 'Elden Ring', 'a save naming another IP does not split the pair');
  db.updateStory(tale.id, { loreFrom: dune.id });
  assert.deepStrictEqual([view().lore_from, view().world], [dune.id, 'Dune'], 'following another World moves both');
  db.updateStory(tale.id, { loreFrom: null });
  assert.deepStrictEqual([view().lore_from, view().world], [null, 'Dune'],
    'following nothing keeps the IP named, and the field is the writer\'s again');
  db.updateStory(tale.id, { world: 'Dark Souls' });
  assert.strictEqual(view().world, 'Dark Souls', 'and it saves');
  // A tale is not a World: following one leaves the field alone.
  const book = db.createStory(kia, { title: 'Another tale' });
  db.updateStory(tale.id, { loreFrom: book.id });
  assert.strictEqual(view().world, 'Dark Souls', 'following a tale that is not a World leaves the field');
  // "Start a book here" on Threads is the other way a tale comes to follow a World.
  const started = db.storyFollowing(kia, ring.id, 'A Second Tarnished')!;
  assert.strictEqual((db.getStory(started.id) as any).world, 'Elden Ring', 'a tale started from a World names it');
  // Another writer's World never names itself in Kia's tale, even where the column can point at it.
  const his = db.createWorld(seth, { title: 'His Secret World' });
  db.updateStory(book.id, { loreFrom: his.id });
  assert.notStrictEqual((db.getStory(book.id) as any).world, 'His Secret World',
    "another writer's World does not put its name in her tale");
});

// #107 · RENAMING A WORLD RENAMES THE WORLD FIELD OF EVERY TALE THAT FOLLOWS IT. Otherwise the pair
// splits the other way round: the tale follows "The Lands Between" while its field still says
// "Elden Ring", and the model is told two settings.
ok('renaming a World renames the World field of the tales that follow it, and no other', () => {
  const kia = db.owner('kia-107-rename');
  const ring = db.createWorld(kia, { title: 'Elden Ring' });
  const one = db.storyFollowing(kia, ring.id, 'The Lands Between')!;
  const two = db.storyFollowing(kia, ring.id, 'A Second Tarnished')!;
  const own = db.createStory(kia, { title: 'Its own' });
  db.updateStory(own.id, { world: 'Elden Ring' });   // names the IP, follows nothing
  db.updateStory(ring.id, { title: 'The Lands Between (World)' });
  const field = (id: string) => (db.getStory(id) as any).world;
  assert.deepStrictEqual([field(one.id), field(two.id)], ['The Lands Between (World)', 'The Lands Between (World)'],
    'RENAME-FOLLOWERS: both tales that follow it name it by its new title');
  assert.strictEqual(field(own.id), 'Elden Ring', 'RENAME-ONLY-FOLLOWERS: a tale that only names the IP keeps its field');
});

// #102. A SCENE PIN CAN HOLD A THREAD OF THE WORLD THE TALE FOLLOWS. The thread stays the World's: it
// is pinned by its own id, it is not copied into the tale, and it reaches the model for that scene.
// Margit's wake word never appears in the scene, so the pin is the only way she can be sent.
const pinnedIn = (t: any) => (storyMod.assemble(storyMod.view(t.id)!, { global: 100096, slots: 4, perSlot: 25024 },
  'direct').manifest.blocks as any[]).filter((b) => b.state === 'included' && b.firedBy?.includes('pinned')).map((b) => b.id);
ok('a pin on a thread of the followed World is kept, stays the World\'s, and is sent for that scene', () => {
  const me = db.owner('pin-world');
  const world = db.createWorld(me, { title: 'The Lands Between', premise: 'A broken ring.' });
  const margit = db.upsertEntry(world.id, me, { title: 'Margit', body: '[Margit: the Fell Omen]',
    activation: 'triggered', keys: ['omen'] })!;
  const tale = db.storyFollowing(me, world.id, 'A Tarnished Road')!;
  db.addPassage({ ...tale, storyId: tale.id, body: 'The bridge was empty in the rain.' });
  assert.deepStrictEqual(pinnedIn(tale), [], 'WORLD-PIN-BASE: nothing is pinned to begin with');

  assert.strictEqual(db.setPin(tale.id, tale.chapterId, margit, 'force_in'), true, 'WORLD-PIN-KEPT: the pin is accepted');
  assert.deepStrictEqual(db.pinsOf(tale.id).map((p: any) => [p.chapter_id, p.entry_id, p.mode]),
    [[tale.chapterId, margit, 'force_in']], 'WORLD-PIN-STORED: the pin names the World thread itself');
  assert.strictEqual(db.entriesOf(tale.id).length, 0, 'WORLD-PIN-NO-COPY: the tale has no copy of her');
  assert.deepStrictEqual(pinnedIn(tale), [margit], 'WORLD-PIN-SENT: she reaches the model for that scene');

  // She keeps following: a fix in the World is what the pinned scene sends.
  db.upsertEntry(world.id, me, { id: margit, title: 'Margit', body: '[Margit: Morgott in disguise]',
    activation: 'triggered', keys: ['omen'] });
  const sent = storyMod.assemble(storyMod.view(tale.id)!, { global: 100096, slots: 4, perSlot: 25024 }, 'direct');
  assert.ok(JSON.stringify(sent).includes('Morgott in disguise'), 'WORLD-PIN-FOLLOWS: the World\'s new text is sent');

  // A copy of the tale follows the same World, so it keeps the pin on the same thread.
  const copy = db.duplicateStory(me, tale.id, 'A Tarnished Road, again') as any;
  assert.deepStrictEqual(db.pinsOf(copy.id).map((p: any) => p.entry_id), [margit],
    'WORLD-PIN-COPIED: a copy of the tale keeps its pin on the World thread');
});

// #102. WHAT A TALE MAY NOT PIN, and what takes a World pin away. The other writer's World is
// followed through a `lore_from` written past the screens, the way an import or a source changing
// hands would leave it: `entriesFor` refuses to read through it, and a pin must refuse the same.
ok('a pin on an unfollowed World or another writer\'s thread is refused, and a World pin goes when it should', () => {
  const me = db.owner('pin-refuse'), them = db.owner('pin-refuse-other');
  const world = db.createWorld(me, { title: 'Limgrave', premise: 'p' });
  const other = db.createWorld(me, { title: 'Caelid', premise: 'p' });
  const theirs = db.createWorld(them, { title: 'Their Limgrave', premise: 'p' });
  const at = (w: any, title: string) => db.upsertEntry(w.id, w === theirs ? them : me,
    { title, body: `[${title}]`, activation: 'triggered', keys: ['nothing-says-this'] })!;
  const margit = at(world, 'Margit'), radahn = at(other, 'Radahn'), godrick = at(theirs, 'Godrick');
  const theirTale = db.createStory(them, { title: 'Their tale', premise: 'p' });
  const theirThread = db.upsertEntry(theirTale.id, them, { title: 'Melina', body: '[Melina]' })!;
  const tale = db.storyFollowing(me, world.id, 'Road')!;
  const pins = () => db.pinsOf(tale.id).map((p: any) => p.entry_id);

  assert.strictEqual(db.setPin(tale.id, tale.chapterId, radahn, 'force_in'), false,
    'PIN-REFUSE-UNFOLLOWED: a thread of a World the tale does not follow is refused');
  assert.strictEqual(db.setPin(tale.id, tale.chapterId, theirThread, 'force_in'), false,
    'PIN-REFUSE-OTHER-TALE: a thread of another writer\'s tale is refused');
  db.updateStory(tale.id, { loreFrom: theirs.id });
  assert.strictEqual((db.getStory(tale.id) as any).lore_from, theirs.id, "the column names their World");
  assert.strictEqual(db.setPin(tale.id, tale.chapterId, godrick, 'force_in'), false,
    'PIN-REFUSE-OTHER-WORLD: another writer\'s World is refused even when the column names it');
  db.updateStory(tale.id, { loreFrom: world.id });
  assert.deepStrictEqual(pins(), [], 'and none of the three left a pin');

  // Unpinning takes it away.
  db.setPin(tale.id, tale.chapterId, margit, 'force_in');
  db.setPin(tale.id, tale.chapterId, margit, null);
  assert.deepStrictEqual(pins(), [], 'PIN-GONE-UNPIN: unpinning removes the World pin');
  // Deleting the scene takes it away. A second scene is opened first: a tale keeps one open scene.
  const two = db.endChapter(tale.id, tale.branchId) as any;
  db.setPin(tale.id, tale.chapterId, margit, 'force_in');
  assert.deepStrictEqual(pins(), [margit], 'the pin is back before the scene goes');
  assert.ok(db.delChapter(tale.id, tale.chapterId).deleted, 'the first scene is deleted');
  assert.deepStrictEqual(pins(), [], 'PIN-GONE-SCENE: deleting the scene removes the World pin');
  // Deleting the thread in the World takes it away.
  db.setPin(tale.id, two.opened, margit, 'force_out');
  assert.deepStrictEqual(pins(), [margit], 'pinned on the second scene');
  db.delEntry(world.id, margit);
  assert.deepStrictEqual(pins(), [], 'PIN-GONE-THREAD: deleting the World thread removes the pin');
});

// #107 · A TALE THAT STOPS FOLLOWING ITS WORLD LOSES ITS WORLD PINS. They name threads the tale no
// longer reads, so they did nothing, and following the World again would bring them back unasked.
ok('a tale that stops following its World loses its World pins and keeps its own', () => {
  const me = db.owner('pin-unfollow');
  const world = db.createWorld(me, { title: 'Stormveil', premise: 'p' });
  const other = db.createWorld(me, { title: 'Liurnia', premise: 'p' });
  const margit = db.upsertEntry(world.id, me, { title: 'Margit', body: '[Margit]', activation: 'triggered', keys: ['omen'] })!;
  const tale = db.storyFollowing(me, world.id, 'Road')!;
  const nepheli = db.upsertEntry(tale.id, me, { title: 'Nepheli', body: '[Nepheli]', activation: 'triggered', keys: ['axe'] })!;
  const pins = () => db.pinsOf(tale.id).map((p: any) => p.entry_id).sort();
  db.setPin(tale.id, tale.chapterId, margit, 'force_in');
  db.setPin(tale.id, tale.chapterId, nepheli, 'force_in');
  db.updateStory(tale.id, { title: 'Road, renamed' });
  assert.deepStrictEqual(pins(), [margit, nepheli].sort(), 'UNFOLLOW-KEEP-SAVE: a save that keeps the World keeps its pins');
  db.updateStory(tale.id, { loreFrom: other.id });
  assert.deepStrictEqual(pins(), [nepheli], 'UNFOLLOW-OTHER: following another World drops the old World\'s pins');
  db.updateStory(tale.id, { loreFrom: world.id });
  db.setPin(tale.id, tale.chapterId, margit, 'force_out');
  db.updateStory(tale.id, { loreFrom: null });
  assert.deepStrictEqual(pins(), [nepheli], 'UNFOLLOW-NONE: following nothing drops the World pins, and the tale\'s own stays');
});

// #107 · A TALE THAT TAKES OVER A WORLD THREAD IT HAS PINNED KEEPS THE PIN, ON ITS OWN THREAD. The
// tale reads its own copy from then on, so a pin left on the World thread's id would send nothing.
ok('taking over a pinned World thread moves the pin to the tale\'s own thread, and it is sent', () => {
  const me = db.owner('pin-takeover');
  const world = db.createWorld(me, { title: 'Leyndell', premise: 'p' });
  const morgott = db.upsertEntry(world.id, me, { title: 'Morgott', body: '[Morgott: the Grace-Given]',
    activation: 'triggered', keys: ['omen king'] })!;
  const tale = db.storyFollowing(me, world.id, 'The Queen')!;
  db.addPassage({ ...tale, storyId: tale.id, body: 'The capital was quiet under the ash.' });
  const two = db.endChapter(tale.id, tale.branchId) as any;
  db.setPin(tale.id, tale.chapterId, morgott, 'force_out');
  db.setPin(tale.id, two.opened, morgott, 'force_in');
  const own = db.unlinkEntry(tale.id, me, morgott)!;
  assert.ok(own && own !== morgott, 'the tale has its own thread for him');
  assert.deepStrictEqual(db.pinsOf(tale.id).map((p: any) => [p.chapter_id, p.entry_id, p.mode])
    .sort((a: any, b: any) => a[2] < b[2] ? -1 : 1),
    [[two.opened, own, 'force_in'], [tale.chapterId, own, 'force_out']],
    'TAKEOVER-MOVED: both pins now name the tale\'s own thread, each on its scene, each as it was');
  db.addPassage({ storyId: tale.id, branchId: tale.branchId, chapterId: two.opened, body: 'Rain on the steps.' });
  assert.deepStrictEqual(pinnedIn(tale), [own], 'TAKEOVER-SENT: his own thread is sent for the pinned scene');
});

// #113 · HANDING A TAKEN-OVER THREAD BACK MOVES ITS PINS BACK TO THE WORLD THREAD. The tale reads the
// World thread again, so the pins follow it instead of going with the deleted copy. Both directions.
ok('handing a taken-over thread back moves its pins back to the World thread, and it is sent', () => {
  const me = db.owner('pin-handback');
  const world = db.createWorld(me, { title: 'Leyndell', premise: 'p' });
  const morgott = db.upsertEntry(world.id, me, { title: 'Morgott', body: '[Morgott: the Grace-Given]',
    activation: 'triggered', keys: ['omen king'] })!;
  const tale = db.storyFollowing(me, world.id, 'The Queen')!;
  db.addPassage({ ...tale, storyId: tale.id, body: 'The capital was quiet under the ash.' });
  const two = db.endChapter(tale.id, tale.branchId) as any;
  const rows = () => db.pinsOf(tale.id).map((p: any) => [p.chapter_id, p.entry_id, p.mode])
    .sort((a: any, b: any) => a[2] < b[2] ? -1 : 1);
  for (const keep of ['theirs', 'mine'] as const) {
    const own = db.unlinkEntry(tale.id, me, morgott)!;
    db.setPin(tale.id, tale.chapterId, own, 'force_out');
    db.setPin(tale.id, two.opened, own, 'force_in');
    assert.ok(db.relinkEntry(tale.id, me, own, keep), `handed back (${keep})`);
    assert.deepStrictEqual(rows(), [[two.opened, morgott, 'force_in'], [tale.chapterId, morgott, 'force_out']],
      `HANDBACK-MOVED: both pins name the World thread again, each on its scene, each as it was (${keep})`);
  }
  db.addPassage({ storyId: tale.id, branchId: tale.branchId, chapterId: two.opened, body: 'Rain on the steps.' });
  assert.deepStrictEqual(pinnedIn(tale), [morgott], 'HANDBACK-SENT: the World thread is sent for the pinned scene');
});

// #113 · DROPPING A FOLLOWED THREAD FROM A TALE REMOVES ITS PIN ON THAT WORLD THREAD. The tale no
// longer reads it, so the pin does nothing, and bringing the thread back would bring the pin unasked.
ok('dropping a followed thread from a tale removes its pins on it, and keeps the others', () => {
  const me = db.owner('pin-drop');
  const world = db.createWorld(me, { title: 'Caelid', premise: 'p' });
  const at = (title: string) => db.upsertEntry(world.id, me, { title, body: `[${title}]`,
    activation: 'triggered', keys: [title.toLowerCase()] })!;
  const radahn = at('Radahn'), millicent = at('Millicent');
  const tale = db.storyFollowing(me, world.id, 'Red Sky')!;
  const other = db.storyFollowing(me, world.id, 'Other Road')!;
  db.setPin(tale.id, tale.chapterId, radahn, 'force_in');
  db.setPin(tale.id, tale.chapterId, millicent, 'force_out');
  db.setPin(other.id, other.chapterId, radahn, 'force_in');
  assert.ok(db.dropFollowed(tale.id, me, radahn), 'dropped');
  assert.deepStrictEqual(db.pinsOf(tale.id).map((p: any) => p.entry_id), [millicent],
    'DROP-UNPINNED: the dropped thread\'s pin is gone, the other World pin stays');
  assert.deepStrictEqual(db.pinsOf(other.id).map((p: any) => p.entry_id), [radahn],
    'DROP-ONE-TALE: another tale\'s pin on the same World thread stays');
  db.relinkEntry(tale.id, me, db.droppedFollowed(tale.id)[0].id, 'theirs');
  assert.deepStrictEqual(db.pinsOf(tale.id).map((p: any) => p.entry_id), [millicent],
    'DROP-NOT-BACK: bringing the thread back does not bring the pin back');
});

// #105 · WORLD PEOPLE IN THE OPENING. The wizard's preview marks them and Create pins them to the
// first scene, force in. They stay the World's threads: nothing is copied, and a fix in the World is
// what the scene sends. Their wake words never appear, so the pin is the only way they are sent, and
// the scene after it does not send them.
const { routes: createRoutes } = await import('../src/routes.ts');
const createTale = (me: string, body: any) => createRoutes['POST /api/stories']({ body: { title: 'New', spark: true,
  entries: [], ...body }, owner: me, query: new URLSearchParams(), slot: { perSlot: 50048 }, gen: {} } as any) as any;
ok('World people marked in the opening are pinned to the first scene, stay the World\'s, and are sent there only', () => {
  const me = db.owner('opening-world');
  const world = db.createWorld(me, { title: 'Stormveil', premise: 'p' });
  const at = (title: string) => db.upsertEntry(world.id, me, { title, body: `[${title}: of Stormveil]`,
    activation: 'triggered', keys: [`${title.toLowerCase()}-never-said`] })!;
  const margit = at('Margit'), godrick = at('Godrick');
  const made = createTale(me, { world: 'Stormveil', loreFrom: world.id, inOpening: ['margit '] });
  assert.ok(made?.id && !made.error, made?.error);
  const tale = { ...made, storyId: made.id };
  assert.deepStrictEqual(db.pinsOf(tale.id).map((p: any) => [p.chapter_id, p.entry_id, p.mode]),
    [[tale.chapterId, margit, 'force_in']], 'OPENING-PIN: she is pinned to the first scene, force in, by her World thread');
  assert.strictEqual(db.entriesOf(tale.id).length, 0, 'OPENING-NO-COPY: the tale has no copy of her');
  db.addPassage({ ...tale, body: 'The gate was shut against the wind.' });
  assert.deepStrictEqual(pinnedIn(tale), [margit], 'OPENING-SENT: she reaches the model for the first scene, and Godrick does not');
  db.upsertEntry(world.id, me, { id: margit, title: 'Margit', body: '[Margit: Morgott in disguise]',
    activation: 'triggered', keys: ['margit-never-said'] });
  assert.ok(JSON.stringify(storyMod.assemble(storyMod.view(tale.id)!, { global: 100096, slots: 4, perSlot: 25024 }, 'direct'))
    .includes('Morgott in disguise'), 'OPENING-FOLLOWS: a fix in the World is what the first scene sends');
  const two = db.endChapter(tale.id, tale.branchId) as any;
  db.addPassage({ storyId: tale.id, branchId: tale.branchId, chapterId: two.opened, body: 'Rain on the steps.' });
  assert.deepStrictEqual(pinnedIn(tale), [], 'OPENING-ONCE: the next scene does not send her by the pin');
  assert.ok(godrick, 'Godrick was written');

  // A name the tale cannot reach is refused, and nothing is made.
  const other = db.createWorld(me, { title: 'Caelid', premise: 'p' });
  db.upsertEntry(other.id, me, { title: 'Radahn', body: '[Radahn]', activation: 'triggered', keys: ['radahn-never-said'] });
  const before = db.listStories(me).length;
  const refused = createTale(me, { world: 'Stormveil', loreFrom: world.id, inOpening: ['Radahn'] });
  assert.match(String(refused?.error), /Radahn/, 'OPENING-REFUSED: a person of a World the tale does not follow fails the Create, named');
  assert.strictEqual(db.listStories(me).length, before, 'OPENING-NOTHING: and nothing is made');
});

// #105 · PLAYING A WORLD PERSON, OR KEEPING ONE HANDS OFF, GIVES THIS TALE ITS OWN THREAD FOR THEM: a
// take-over, so the lock's outside-only pockets are written on the tale's copy and the World's thread
// is not rewritten. The one played keeps their pockets; the one held loses voice and interiority and
// gets the yours pocket. A line about who they are does not make a second thread beside the copy.
ok('playing or holding a World person gives the tale its own thread for them, and the World\'s is unchanged', () => {
  const me = db.owner('play-world');
  const world = db.createWorld(me, { title: 'Leyndell', premise: 'p' });
  const person = (title: string) => {
    const id = db.upsertEntry(world.id, me, { title, body: '', activation: 'triggered', keys: [title] })!;
    for (const [slot, b] of [['facts', `${title} of Leyndell.`], ['voice', `${title} speaks in short commands.`],
        ['interiority', `${title} doubts the Erdtree.`]]) {
      const a = db.upsertAddon(world.id, id, { slot, name: slot, body: `[${b}]` })!;
      db.setAddonActive(world.id, a, true);
    }
    return id;
  };
  const morgott = person('Morgott'), margit = person('Margit');
  const pockets = (story: string, entry: string) => (db.addonsOf(story) as any[]).filter((a) => a.entry_id === entry)
    .map((a) => [a.slot, a.body, a.active]).sort();
  const worldBefore = [pockets(world.id, morgott), pockets(world.id, margit), db.entriesOf(world.id)];
  const made = createTale(me, { world: 'Leyndell', loreFrom: world.id, persona: 'morgott',
    personaAbout: 'The Omen King, in this tale a husband.', lockedCharacter: 'Margit', inOpening: ['Margit'] });
  assert.ok(made?.id && !made.error, made?.error);
  const own = db.entriesOf(made.id) as any[];
  const copy = (origin: string) => own.find((e) => e.origin_id === origin);
  assert.deepStrictEqual(own.map((e) => e.title).sort(), ['Margit', 'Morgott'],
    'PLAY-OWN: the tale has its own thread for each, and no second one from the line about him');
  assert.ok(copy(morgott) && copy(margit), 'PLAY-TAKEOVER: each is a take-over of the World\'s thread');
  assert.deepStrictEqual(pockets(made.id, copy(morgott).id).map((p) => p[0]), ['facts', 'interiority', 'voice'],
    'PLAY-KEEPS: the one played keeps his pockets');
  const held = pockets(made.id, copy(margit).id);
  assert.deepStrictEqual(held.filter((p) => p[0] !== 'facts'), [['voice', prompts.YOURS_VOICE('Margit'), 1]],
    'HOLD-OUTSIDE: the one held has the yours pocket on, and no voice or interiority of her own');
  assert.deepStrictEqual([pockets(world.id, morgott), pockets(world.id, margit), db.entriesOf(world.id)], worldBefore,
    'HOLD-WORLD-UNCHANGED: the World\'s threads and pockets are not rewritten');
  assert.deepStrictEqual(db.pinsOf(made.id).map((p: any) => p.entry_id), [copy(margit).id],
    'HOLD-PIN: in the opening, the pin is on the tale\'s own thread for her');
});

/* #102. A LIBRARY FROM BEFORE IS REBUILT, and its pins come through unchanged. The old library is a
 * copy of this one with chapter_pins put back in the shape it had: the thread keyed (entry_id,
 * story_id), so a pin could only hold the tale's own thread. A server is then started on it the way
 * a boot does, by loading db.ts in a process of its own, twice. Never the live library. */
ok('an old library\'s pins survive the rebuild unchanged, with one backup, and a second boot does nothing', () => {
  const me = db.owner('pin-migrate');
  const t = db.createStory(me, { title: 'Old pins', premise: 'p' });
  const a = db.upsertEntry(t.id, me, { title: 'Ranni', body: '[Ranni]' })!;
  const b = db.upsertEntry(t.id, me, { title: 'Blaidd', body: '[Blaidd]' })!;
  db.setPin(t.id, t.chapterId, a, 'force_in');
  db.setPin(t.id, t.chapterId, b, 'force_out');
  const dir = mkdtempSync('/tmp/anansi-pins-');
  try {
    const file = join(dir, 'old.db');
    db.snapshot(file);
    const old = new RawDb(file);
    old.exec(`ALTER TABLE chapter_pins RENAME TO pins_now;
      CREATE TABLE chapter_pins (
        chapter_id TEXT NOT NULL, entry_id TEXT NOT NULL, story_id TEXT NOT NULL,
        mode TEXT NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (chapter_id, entry_id),
        FOREIGN KEY (chapter_id, story_id) REFERENCES chapters(id, story_id) ON DELETE CASCADE,
        FOREIGN KEY (entry_id, story_id)   REFERENCES entries(id, story_id)  ON DELETE CASCADE);
      -- The pins the old shape could hold: on the tale's own threads. World pins made above cannot be.
      INSERT INTO chapter_pins SELECT chapter_id, entry_id, story_id, mode, created_at FROM pins_now p
        WHERE EXISTS (SELECT 1 FROM entries e WHERE e.id = p.entry_id AND e.story_id = p.story_id);
      DROP TABLE pins_now;`);
    const rows = (c: any) => c.prepare('SELECT * FROM chapter_pins ORDER BY chapter_id, entry_id').all()
      .map((r: any) => ({ ...r }));
    const keys = (c: any) => c.prepare('PRAGMA foreign_key_list(chapter_pins)').all()
      .filter((k: any) => k.table === 'entries').map((k: any) => k.from).sort();
    const before = rows(old);
    assert.ok(before.some((r: any) => r.entry_id === a) && before.some((r: any) => r.entry_id === b),
      'the old library holds both pins');
    assert.deepStrictEqual(keys(old), ['entry_id', 'story_id'], 'and is in the old shape');
    old.close();

    const boot = () => {
      const r = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
        `await import(${JSON.stringify(new URL('../src/db.ts', import.meta.url).href)});`],
        { env: { ...process.env, ANANSI_DB: file }, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, `the boot failed: ${r.stderr}`);
      return r.stdout;
    };
    const backups = () => existsSync(join(dir, 'backups'))
      ? readdirSync(join(dir, 'backups')).filter((f) => f.startsWith('pre-update-')) : [];
    boot();
    const now = new RawDb(file, { readOnly: true });
    assert.deepStrictEqual(keys(now), ['entry_id'], 'PIN-MIGRATE-SHAPE: the thread is keyed by its id alone');
    assert.deepStrictEqual(rows(now), before, 'PIN-MIGRATE-KEPT: every pin is exactly what it was');
    now.close();
    assert.strictEqual(backups().length, 1, 'PIN-MIGRATE-BACKUP: one backup was taken before the rebuild');

    boot();
    assert.strictEqual(backups().length, 1, 'PIN-MIGRATE-ONCE: a second boot takes no backup');
    const again = new RawDb(file, { readOnly: true });
    assert.deepStrictEqual(rows(again), before, 'PIN-MIGRATE-IDEMPOTENT: and changes no pin');
    again.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
  db.delStory(t.id);
});

// #110 · A POCKET AND AN ALWAYS TRUE ARE STORED AS A PLAIN DESCRIPTION (ADR 0008). Every writer of one
// crosses `upsertAddon`, so the floor is there: a leading bracket wrapper comes off, and with it the
// thread's name, the pocket's name or its kind in front, however many times it was repeated. Text
// that is not wrapped stays exactly as written, and so does a label the writer chose.
ok('a pocket or an Always true is stored without the bracket wrapper or the name in front', () => {
  const t = db.createStory(o, { title: 'Plain', premise: 'p' });
  const e = db.upsertEntry(t.id, o, { title: 'Leyndell', body: '', entryType: 'place' })!;
  const body = (id: string | null) => (db.addonsOf(t.id) as any[]).find((a) => a.id === id)?.body;
  const facts = db.upsertAddon(t.id, e, { slot: 'facts', name: 'facts', body: '[Leyndell: Leyndell: the Royal Capital]' });
  assert.strictEqual(body(facts), 'the Royal Capital', 'FLOOR-ALWAYS: the wrapper and the doubled name come off Always true');
  const feel = db.upsertAddon(t.id, e, { slot: 'atmosphere', name: 'Ash', body: '[Ash: golden ash falls on everything]' });
  assert.strictEqual(body(feel), 'golden ash falls on everything', 'FLOOR-POCKET: and off a pocket, by its own name');
  const kind = db.upsertAddon(t.id, e, { slot: 'appearance', name: 'Walls', body: '[appearance: white walls, gold dome]' });
  assert.strictEqual(body(kind), 'white walls, gold dome', 'FLOOR-KIND: and by its kind');
  const bare = db.upsertAddon(t.id, e, { slot: 'who_is_here', name: 'Guards', body: '[knights in gold, never at rest]' });
  assert.strictEqual(body(bare), 'knights in gold, never at rest', 'FLOOR-BARE: a wrapper with no name comes off too');
  const front = db.upsertAddon(t.id, e, { slot: 'facts', name: 'facts', body: 'Leyndell: the Royal Capital, under the Erdtree' });
  assert.strictEqual(body(front), 'the Royal Capital, under the Erdtree', 'FLOOR-FRONT: the name in front comes off with no bracket at all');
  db.upsertAddon(t.id, e, { id: feel, slot: 'atmosphere', name: 'Ash', body: '[Ash: ash, and the smell of it]' });
  assert.strictEqual(body(feel), 'ash, and the smell of it', 'FLOOR-EDIT: an edit crosses the same floor');
  const own = 'Role: the seat of the Golden Order\n\n[a] and [b] stay as they are\nLeyndell: a line further down keeps its name';
  db.upsertAddon(t.id, e, { slot: 'facts', name: 'facts', body: own });
  assert.strictEqual(body(facts), own, 'FLOOR-KEEPS: a label the writer chose, a blank line, brackets that do not wrap the line, and a later line stay as written');
  const tale = db.upsertAddon(t.id, null, { slot: 'instruction', name: 'Tone', body: '[Tone: dry, never cruel]' });
  assert.strictEqual(body(tale), 'dry, never cruel', 'FLOOR-TALE: and off the tale\'s own pockets');
  db.delStory(t.id);
});

// #114 · WHERE IT STANDS IS STORED AS A PLAIN DESCRIPTION TOO (ADR 0008): the thread's own text and
// every Over time entry. The trial tidy kept `[Seth: 30s; a stranger …]` because nothing took it off.
// The same rule as a pocket's floor, with the thread's name as the one name that comes off in front.
ok('where it stands and an Over time entry are stored without the bracket wrapper or the name in front', () => {
  const t = db.createStory(o, { title: 'Plain stands', premise: 'p' });
  const e = db.upsertEntry(t.id, o, { title: 'Seth', entryType: 'character',
    body: '[Seth: 30s; a stranger Ashley meets on the street]' })!;
  const body = () => (db.entriesOf(t.id) as any[]).find((x) => x.id === e).body;
  assert.strictEqual(body(), '30s; a stranger Ashley meets on the street', 'STANDS-FLOOR: a new thread\'s text loses the wrapper and its name');
  db.upsertEntry(t.id, o, { id: e, title: 'Seth', entryType: 'character', body: 'Seth: from Chicago' });
  assert.strictEqual(body(), 'from Chicago', 'STANDS-FLOOR-EDIT: an edit crosses the same floor, a name in front with no bracket too');
  db.appendInfo(t.id, e, '[Seth: has a silver ring]');
  assert.strictEqual(body(), 'from Chicago\nhas a silver ring', 'STANDS-FLOOR-APPEND: and text added to it');
  const own = 'Role: a stranger\n[a] and [b] stay';
  db.upsertEntry(t.id, o, { id: e, title: 'Seth', entryType: 'character', body: own });
  assert.strictEqual(body(), own, 'STANDS-FLOOR-KEEPS: a label the writer chose and brackets that do not wrap stay');
  const st = db.upsertState(t.id, e, { fromChapter: 2, body: '[Seth: Seth: 30s; has met Ashley]', beforeMode: 'hide' });
  const state = () => (db.statesForStory(t.id).get(e) ?? []).find((x: any) => x.id === st)?.body;
  assert.strictEqual(state(), '30s; has met Ashley', 'STATES-FLOOR: an Over time entry is stored plain');
  db.upsertState(t.id, e, { id: st, fromChapter: 2, body: '[left Chicago]', beforeMode: 'hide' });
  assert.strictEqual(state(), 'left Chicago', 'STATES-FLOOR-EDIT: and an edit of one');
  db.delStory(t.id);
});

// #111 · EVERY CHANGE TO A POCKET OR AN ALWAYS TRUE KEEPS THE OLD TEXT, in the thread's own history
// (Alterations), beside its title and its text, and the one revert puts it back. Putting back is
// itself a change, so the text it writes over is kept too.
ok('a pocket\'s or an Always true\'s old text is kept, and revert puts it back', () => {
  const t = db.createStory(o, { title: 'Kept', premise: 'p' });
  const e = db.upsertEntry(t.id, o, { title: 'Marek', body: '', entryType: 'character' })!;
  const body = (id: string) => (db.addonsOf(t.id) as any[]).find((a) => a.id === id)?.body;
  const facts = db.upsertAddon(t.id, e, { slot: 'facts', name: 'facts', body: 'a ferryman, forty' })!;
  const voice = db.upsertAddon(t.id, e, { slot: 'voice', name: 'How he talks', body: 'short, flat' })!;
  assert.strictEqual(db.entryHistory(t.id, e).length, 0, 'POCKET-HIST-NEW: making a pocket replaces no text, so nothing is logged');
  db.upsertAddon(t.id, e, { slot: 'facts', name: 'facts', body: 'a ferryman, fifty' });
  db.upsertAddon(t.id, e, { id: voice, slot: 'voice', name: 'How he talks', body: 'slow, formal' });
  db.upsertAddon(t.id, e, { id: voice, slot: 'voice', name: 'How he talks', body: 'slow, formal' });
  const h = db.entryHistory(t.id, e) as any[];
  assert.strictEqual(h.length, 2, `POCKET-HIST-LOG: one row per change, none for a save that changed nothing (${JSON.stringify(h)})`);
  const was = (v: string) => h.find((r) => r.previous_value === v);
  assert.ok(was('a ferryman, forty'), 'POCKET-HIST-ALWAYS: the old Always true is kept');
  assert.ok(was('short, flat'), 'POCKET-HIST-POCKET: and the old pocket text');
  assert.strictEqual(was('a ferryman, forty').label, 'Always true', 'POCKET-HIST-LABEL: named as the writer knows it');
  assert.strictEqual(was('short, flat').label, 'How he talks', '  and a pocket by its name');
  assert.ok(db.revertEntryField(t.id, e, was('short, flat').id), 'POCKET-REVERT: the revert takes it');
  assert.strictEqual(body(voice), 'short, flat', 'POCKET-REVERT: the old pocket text is back');
  assert.ok(db.revertEntryField(t.id, e, was('a ferryman, forty').id));
  assert.strictEqual(body(facts), 'a ferryman, forty', 'POCKET-REVERT: and the old Always true');
  const after = db.entryHistory(t.id, e) as any[];
  assert.ok(after.some((r) => r.previous_value === 'slow, formal') && after.some((r) => r.previous_value === 'a ferryman, fifty'),
    'POCKET-REVERT-KEPT: the text a revert writes over is kept in turn');
  // #114 · A POCKET SINCE DELETED IS MADE AGAIN from its old text: with its kind and name where the
  // history kept them, switched off, so nothing reaches the model until the writer turns it on.
  db.delAddon(t.id, voice);
  assert.ok(db.revertEntryField(t.id, e, was('short, flat').id), 'POCKET-REVERT-GONE: a deleted pocket is put back');
  const again = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === e && a.slot === 'voice');
  assert.deepStrictEqual(again.map((a) => [a.name, a.body, a.active]), [['How he talks', 'short, flat', 0]],
    '  made again with its kind, name and text, switched off');
  // A row from before the history kept the kind (#111) has only the text: it comes back as a pocket of
  // the thread's kind that holds many, named so the writer can tell what happened.
  const raw = new RawDb('/tmp/anansi-test.db');
  raw.prepare('INSERT INTO entry_revisions (id,entry_id,field,previous_value,replaced_at,replaced_by) VALUES (?,?,?,?,?,?)')
    .run('er-oldgone', e, 'pocket:ad-long-gone', 'owes Aldis', Date.now(), 'human');
  raw.close();
  assert.ok(db.revertEntryField(t.id, e, 'er-oldgone'), 'POCKET-REVERT-OLD: an old row for a deleted pocket is put back too');
  assert.ok((db.addonsOf(t.id) as any[]).some((a) => a.entry_id === e && a.body === 'owes Aldis' && a.active === 0
    && a.slot === 'interiority'), '  as a switched-off pocket of a kind the thread can hold many of');
  db.delStory(t.id);
});

// A REFUSED REVERT LEAVES NO ROW. The field whitelist was checked after the current text was logged,
// so a row naming a column the revert may not write left a junk row in the history each time.
ok('a revert that is refused writes nothing to the history', () => {
  const t = db.createStory(o, { title: 'Junk', premise: 'p' });
  const e = db.upsertEntry(t.id, o, { title: 'Ines', body: 'b', entryType: 'character' })!;
  const raw = new RawDb('/tmp/anansi-test.db');
  raw.prepare('INSERT INTO entry_revisions (id,entry_id,field,previous_value,replaced_at,replaced_by) VALUES (?,?,?,?,?,?)')
    .run('er-forged', e, 'activation', 'triggered', Date.now(), 'human');
  raw.close();
  assert.strictEqual(db.revertEntryField(t.id, e, 'er-forged'), false, 'REVERT-REFUSED: a column off the list is refused');
  assert.strictEqual(db.entryHistory(t.id, e).length, 1, 'REVERT-NO-JUNK: and no row is added for it');
  db.delStory(t.id);
});

// #94 · THE UPDATE DROPS THE KNOTS ONCE. The contradiction check was deleted (Seth, 2026-10-28), so its
// table, the repair record on generations and the per-scene mutes go with it. Built on a copy made
// here, never the live file: the old table and rows written as an old server wrote them, then two
// boots of the real module.
ok('the update drops the knots once, after a backup, says how many on each tale, and keeps other dismissals', () => {
  const me = db.owner('knot-update');
  const t = db.createStory(me, { title: 'Old knots' });
  const quiet = db.createStory(me, { title: 'No knots' });
  const dir = mkdtempSync('/tmp/anansi-knots-');
  try {
    const file = join(dir, 'old.db');
    db.snapshot(file);
    const old = new RawDb(file);
    old.exec(`CREATE TABLE IF NOT EXISTS violations (
      id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      passage_id TEXT NOT NULL, entry_id TEXT, quote TEXT, reason TEXT, confidence REAL,
      reached INTEGER DEFAULT 1, status TEXT DEFAULT 'open', created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS violations_p ON violations(passage_id);
      CREATE INDEX IF NOT EXISTS violations_s ON violations(story_id, status);`);
    if (!(old.prepare('PRAGMA table_info(generations)').all() as any[]).some((c) => c.name === 'mend'))
      old.exec('ALTER TABLE generations ADD COLUMN mend TEXT');
    const knot = old.prepare("INSERT INTO violations (id, story_id, passage_id, created_at) VALUES (?, ?, 'p', 1)");
    knot.run('v-k1', t.id); knot.run('v-k2', t.id);
    old.prepare("INSERT INTO dismissals (story_id, kind, ref, at) VALUES (?, 'mute', 'c:e', 1)").run(t.id);
    old.prepare("INSERT INTO dismissals (story_id, kind, ref, at) VALUES (?, 'stale', 'h', 1)").run(t.id);
    old.close();
    const read = <T,>(fn: (c: any) => T) => { const c = new RawDb(file, { readOnly: true }); try { return fn(c); } finally { c.close(); } };
    const tables = () => read((c) => (c.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'violations%'").all() as any[]).map((x) => x.name));
    const mend = () => read((c) => (c.prepare('PRAGMA table_info(generations)').all() as any[]).some((x) => x.name === 'mend'));
    const kinds = () => read((c) => (c.prepare('SELECT kind FROM dismissals WHERE story_id = ? ORDER BY kind').all(t.id) as any[]).map((x) => x.kind));
    const lines = (id: string) => read((c) => (c.prepare('SELECT line, backup FROM update_lines WHERE story_id = ? ORDER BY rowid').all(id) as any[]).map((x) => ({ ...x })));
    const backups = () => existsSync(join(dir, 'backups'))
      ? readdirSync(join(dir, 'backups')).filter((f) => f.startsWith('pre-update-')) : [];
    const boot = () => {
      const r = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
        `await import(${JSON.stringify(new URL('../src/db.ts', import.meta.url).href)});`],
        { env: { ...process.env, ANANSI_DB: file }, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, `the boot failed: ${r.stderr}`);
    };
    const before = lines(t.id).length;

    boot();
    assert.deepStrictEqual(tables(), [], 'KNOTS-DROPPED: the violations table and its indexes are gone');
    assert.strictEqual(mend(), false, '  and so is the repair record on generations');
    assert.deepStrictEqual(kinds(), ['stale'], 'KNOTS-MUTES: the mutes are gone and other dismissals stay');
    assert.strictEqual(backups().length, 1, 'KNOTS-BACKUP: one backup was taken first');
    const said = lines(t.id).slice(before);
    assert.strictEqual(said.length, 1, `KNOTS-REPORT: one line on the tale that had knots (${said.map((l: any) => l.line).join(' | ')})`);
    assert.match(said[0].line, /\b2 knots\b/, '  naming how many');
    assert.ok(said[0].backup?.includes('pre-update-'), '  and the backup');
    assert.strictEqual(lines(quiet.id).length, 0, '  and none on a tale that had none');

    boot();
    assert.strictEqual(backups().length, 1, 'KNOTS-ONCE: a second boot takes no backup');
    assert.strictEqual(lines(t.id).length, before + 1, '  and writes no second line');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  db.delStory(t.id); db.delStory(quiet.id);
});

// #127 · ADR 0011. THE UPDATE MOVES THE STRINGS TO THE TALE'S THREAD ONCE, then drops their table. Built
// on a copy made here, never the live file: the old table and rows written as an old server wrote
// them, then two boots of the real module. One tale has no thread of its own yet; one already has one.
ok("the update moves each string to its tale's thread once, after a backup, names them, and drops the table", () => {
  const me = db.owner('string-update');
  const t = db.createStory(me, { title: 'Old strings', premise: 'A letter came.', setting: 'A port.' });
  const had = db.createStory(me, { title: 'Has a thread', premise: 'A debt.' });
  const already = db.upsertString(had.id, { title: 'Already a pocket', kind: 'question' });
  const quiet = db.createStory(me, { title: 'No strings' });
  const dir = mkdtempSync('/tmp/anansi-strings-');
  try {
    const file = join(dir, 'old.db');
    db.snapshot(file);
    const old = new RawDb(file);
    old.exec(`CREATE TABLE IF NOT EXISTS strings (
      id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      title TEXT NOT NULL, body TEXT, from_chapter INTEGER, owed_by INTEGER, status TEXT DEFAULT 'open',
      summoned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, kind TEXT DEFAULT 'promise');
      CREATE INDEX IF NOT EXISTS strings_s ON strings(story_id, status);`);
    const row = old.prepare(`INSERT INTO strings (id,story_id,title,body,from_chapter,owed_by,status,summoned,created_at,kind)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    row.run('st-a', t.id, 'The letter', 'He has not opened it.', 2, 9, 'open', 1, 1, 'promise');
    row.run('st-b', t.id, 'Who sent it', '', 1, null, 'paid', 1, 2, 'question');
    row.run('st-c', t.id, 'The ring', null, null, null, 'dropped', 0, 3, null);
    row.run('st-d', had.id, 'The ledger', 'Kept by Vel.', 1, null, 'open', 0, 4, 'promise');
    old.close();
    const read = <T,>(fn: (c: any) => T) => { const c = new RawDb(file, { readOnly: true }); try { return fn(c); } finally { c.close(); } };
    const tables = () => read((c) => (c.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'strings%'").all() as any[]).map((x) => x.name));
    const threads = (id: string) => read((c) => (c.prepare("SELECT id, body FROM entries WHERE story_id = ? AND entry_type = 'tale'").all(id) as any[]).map((x) => ({ ...x })));
    const pockets = (id: string) => read((c) => (c.prepare(`SELECT a.name, a.body, a.slot, a.active, a.from_chapter, a.owed_by, a.status
      FROM addons a JOIN entries e ON e.id = a.entry_id WHERE e.story_id = ? AND e.entry_type = 'tale' AND a.slot != 'facts'
      ORDER BY a.created_at, a.rowid`).all(id) as any[]).map((x) => [x.name, x.body, x.slot, x.active, x.from_chapter, x.owed_by, x.status]));
    const lines = (id: string) => read((c) => (c.prepare('SELECT line, backup, entry_id FROM update_lines WHERE story_id = ? ORDER BY rowid').all(id) as any[]).map((x) => ({ ...x })));
    const backups = () => existsSync(join(dir, 'backups'))
      ? readdirSync(join(dir, 'backups')).filter((f) => f.startsWith('pre-update-')) : [];
    const boot = () => {
      const r = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
        `await import(${JSON.stringify(new URL('../src/db.ts', import.meta.url).href)});`],
        { env: { ...process.env, ANANSI_DB: file }, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, `the boot failed: ${r.stderr}`);
    };
    const before = lines(t.id).length;

    boot();
    assert.deepStrictEqual(tables(), [], 'STRINGS-DROPPED: the strings table and its index are gone');
    const made = threads(t.id);
    assert.strictEqual(made.length, 1, "STRINGS-THREAD: a tale with no thread of its own gets one");
    assert.strictEqual(made[0].body, 'A letter came.', '  made from its premise, as a hem makes it');
    assert.deepStrictEqual(pockets(t.id), [
      ['The letter', 'He has not opened it.', 'promise', 1, 2, 9, null],
      ['Who sent it', '', 'question', 0, 1, null, 'paid'],
      ['The ring', '', 'promise', 0, null, null, 'dropped'],
    ], 'STRINGS-MOVED: each string is a pocket of its kind; in play is on; tied off and let go are off and marked');
    assert.strictEqual(threads(had.id).length, 1, 'STRINGS-ONE-THREAD: a tale that had a thread keeps the one');
    assert.deepStrictEqual(pockets(had.id).map((p) => p[0]), ['Already a pocket', 'The ledger'], '  and gains the string beside its own');
    assert.strictEqual(backups().length, 1, 'STRINGS-BACKUP: one backup was taken first');
    const said = lines(t.id).slice(before);
    assert.strictEqual(said.length, 1, `STRINGS-REPORT: one line on the tale (${said.map((l: any) => l.line).join(' | ')})`);
    assert.match(said[0].line, /The letter.*Who sent it.*The ring/, '  naming each string that moved');
    assert.ok(said[0].backup?.includes('pre-update-'), '  and the backup');
    assert.strictEqual(said[0].entry_id, made[0].id, "  about the tale's thread");
    assert.strictEqual(lines(quiet.id).length, 0, '  and none on a tale that had none');

    boot();
    assert.strictEqual(backups().length, 1, 'STRINGS-ONCE: a second boot takes no backup');
    assert.strictEqual(lines(t.id).length, before + 1, '  and writes no second line');
    assert.strictEqual(pockets(t.id).length, 3, '  and moves nothing twice');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  void already;
  db.delStory(t.id); db.delStory(had.id); db.delStory(quiet.id);
});

// #110 · THE UPDATE TAKES THE WRAPPERS OFF THE LIBRARY ONCE. Built on a copy made here, never the live
// file: rows written past the floor, as an old server wrote them, then two boots of the real module.
ok('the update strips old wrappers once, after a backup, names each, and leaves clean text alone', () => {
  const me = db.owner('plain-update');
  const t = db.createStory(me, { title: 'Old wrappers', premise: 'p' });
  const e = db.upsertEntry(t.id, me, { title: 'Aldis Fen', body: '[Aldis Fen: at the docks]', entryType: 'character' })!;
  const dir = mkdtempSync('/tmp/anansi-plain-');
  try {
    const file = join(dir, 'old.db');
    db.snapshot(file);
    const old = new RawDb(file);
    const put = (id: string, entry: string | null, slot: string, name: string, body: string) =>
      old.prepare(`INSERT INTO addons (id,story_id,entry_id,slot,name,body,keys,active,created_at)
        VALUES (?,?,?,?,?,?,'[]',1,1)`).run(id, t.id, entry, slot, name, body);
    put('a-p-facts', e, 'facts', 'facts', '[Aldis Fen: Aldis Fen: 34, ex-Watch sergeant]');
    put('a-p-voice', e, 'voice', 'How he talks', '[short sentences; never swears]');
    put('a-p-coat', e, 'outfit', 'Coat', '[wearing: black oilcloth]');
    put('a-p-clean', e, 'interiority', 'Debt', 'Never says the number out loud.');
    put('a-p-own', e, 'relationships', 'Marek', '[a] owes [b], and both know it');
    put('a-p-tale', null, 'instruction', 'Tone', '[Tone: dry]');
    old.close();
    const bodies = () => { const c = new RawDb(file, { readOnly: true });
      const r = Object.fromEntries((c.prepare("SELECT id, body FROM addons WHERE id LIKE 'a-p-%'").all() as any[])
        .map((x) => [x.id, x.body]));
      c.close(); return r; };
    const lines = () => { const c = new RawDb(file, { readOnly: true });
      const r = (c.prepare('SELECT entry_id, line, backup FROM update_lines WHERE story_id = ? ORDER BY rowid').all(t.id) as any[])
        .map((x) => ({ ...x }));
      c.close(); return r; };
    const backups = () => existsSync(join(dir, 'backups'))
      ? readdirSync(join(dir, 'backups')).filter((f) => f.startsWith('pre-update-')) : [];
    const boot = () => {
      const r = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
        `await import(${JSON.stringify(new URL('../src/db.ts', import.meta.url).href)});`],
        { env: { ...process.env, ANANSI_DB: file }, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, `the boot failed: ${r.stderr}`);
    };
    const before = lines().length;

    boot();
    assert.deepStrictEqual(bodies(), {
      'a-p-facts': '34, ex-Watch sergeant', 'a-p-voice': 'short sentences; never swears', 'a-p-coat': 'black oilcloth',
      'a-p-clean': 'Never says the number out loud.', 'a-p-own': '[a] owes [b], and both know it', 'a-p-tale': 'dry',
    }, 'PLAIN-UPDATE: every wrapper and name in front is gone, and clean text is untouched');
    assert.strictEqual(backups().length, 1, 'PLAIN-UPDATE-BACKUP: one backup was taken first');
    const said = lines().slice(before);
    assert.strictEqual(said.length, 4, `PLAIN-UPDATE-REPORT: one line for each pocket it changed (${said.map((l: any) => l.line).join(' | ')})`);
    assert.ok(said.every((l: any) => l.backup && l.backup.includes('pre-update-')), '  each naming the backup');
    assert.ok(said.some((l: any) => l.entry_id === e && /Always true/.test(l.line)), '  Always true is named as itself');
    assert.ok(said.some((l: any) => l.entry_id === e && /How he talks/.test(l.line)), '  and a pocket by its name');
    assert.ok(said.some((l: any) => l.entry_id === null && /Tone/.test(l.line)), '  and the tale\'s own pocket, on the tale');

    boot();
    assert.strictEqual(backups().length, 1, 'PLAIN-UPDATE-ONCE: a second boot takes no backup');
    assert.strictEqual(lines().length, before + 4, '  writes no second report');
    assert.strictEqual(bodies()['a-p-facts'], '34, ex-Watch sergeant', '  and changes nothing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  db.delStory(t.id);
});

// #114 · THE UPDATE TAKES THE WRAPPERS OFF WHERE EACH THREAD STANDS, ONCE: its own text and every Over
// time entry. Built on a copy made here, never the live file: rows written past the floor, as an old
// server wrote them, then two boots of the real module. The trial thread's text was `[Seth: 30s; …]`.
ok('the update strips old wrappers off where a thread stands once, after a backup, names each, and leaves clean text alone', () => {
  const me = db.owner('stands-update');
  const t = db.createStory(me, { title: 'Old stands', premise: 'p' });
  const seth = db.upsertEntry(t.id, me, { title: 'Seth', body: 'placeholder', entryType: 'character' })!;
  const ash = db.upsertEntry(t.id, me, { title: 'Ashley', body: 'placeholder', entryType: 'character' })!;
  const dir = mkdtempSync('/tmp/anansi-stands-');
  try {
    const file = join(dir, 'old.db');
    db.snapshot(file);
    const old = new RawDb(file);
    old.prepare('UPDATE entries SET body = ? WHERE id = ?').run('[Seth: 30s; a stranger Ashley meets on the street]', seth);
    old.prepare('UPDATE entries SET body = ? WHERE id = ?').run('A singer; [a] and [b] stay.', ash);
    const put = (id: string, entry: string, from: number, body: string) =>
      old.prepare(`INSERT INTO entry_states (id,entry_id,from_chapter,body,before_mode,label,created_at)
        VALUES (?,?,?,?,'hide',null,1)`).run(id, entry, from, body);
    put('st-p-wrapped', seth, 2, '[Seth: Seth: 30s; has met Ashley]');
    put('st-p-front', seth, 3, 'Seth: 30s; has left Chicago');
    put('st-p-clean', ash, 2, 'Has left Marcus.');
    old.close();
    const read = () => { const c = new RawDb(file, { readOnly: true });
      const r = {
        seth: (c.prepare('SELECT body FROM entries WHERE id = ?').get(seth) as any).body,
        ash: (c.prepare('SELECT body FROM entries WHERE id = ?').get(ash) as any).body,
        ...Object.fromEntries((c.prepare("SELECT id, body FROM entry_states WHERE id LIKE 'st-p-%'").all() as any[])
          .map((x) => [x.id, x.body])) };
      c.close(); return r; };
    const lines = () => { const c = new RawDb(file, { readOnly: true });
      const r = (c.prepare('SELECT entry_id, line, backup FROM update_lines WHERE story_id = ? ORDER BY rowid').all(t.id) as any[])
        .map((x) => ({ ...x }));
      c.close(); return r; };
    const backups = () => existsSync(join(dir, 'backups'))
      ? readdirSync(join(dir, 'backups')).filter((f) => f.startsWith('pre-update-')) : [];
    const boot = () => {
      const r = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
        `await import(${JSON.stringify(new URL('../src/db.ts', import.meta.url).href)});`],
        { env: { ...process.env, ANANSI_DB: file }, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, `the boot failed: ${r.stderr}`);
    };
    const before = lines().length;

    boot();
    assert.deepStrictEqual(read(), {
      seth: '30s; a stranger Ashley meets on the street', ash: 'A singer; [a] and [b] stay.',
      'st-p-wrapped': '30s; has met Ashley', 'st-p-front': '30s; has left Chicago', 'st-p-clean': 'Has left Marcus.',
    }, 'STANDS-UPDATE: every wrapper and name in front is gone from the thread\'s text and its Over time, and clean text is untouched');
    assert.strictEqual(backups().length, 1, 'STANDS-UPDATE-BACKUP: one backup was taken first');
    const said = lines().slice(before);
    assert.strictEqual(said.length, 3, `STANDS-UPDATE-REPORT: one line for each text it changed (${said.map((l: any) => l.line).join(' | ')})`);
    assert.ok(said.every((l: any) => l.entry_id === seth && l.backup && l.backup.includes('pre-update-')), '  each on the thread, naming the backup');

    boot();
    assert.strictEqual(backups().length, 1, 'STANDS-UPDATE-ONCE: a second boot takes no backup');
    assert.strictEqual(lines().length, before + 3, '  writes no second report');
    assert.strictEqual(read().seth, '30s; a stranger Ashley meets on the street', '  and changes nothing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  db.delStory(t.id);
});

// #125 · ADR 0010. THE TALE'S THREAD, made the way New tale makes a thread (#117): Always true is
// what the tale is (the setting), its Over time opens with where it stands as the tale opens (the
// premise), and each hem's entry is an ordinary Over time entry on it. Made when first needed.
ok('the tale has one thread of its own, made from its premise and setting, and not a card', () => {
  const t = db.createStory(o, { title: 'Tale thread', premise: 'Ilse poles the ferry at dusk.', setting: 'A drowned valley.' });
  assert.strictEqual(db.taleThreadOf(t.id), null, 'TALE-LAZY: a tale has none until it is needed');
  const id = db.taleThread(t.id);
  assert.ok(id, 'TALE-MADE: asking for it makes it');
  assert.strictEqual(db.taleThread(t.id), id, 'TALE-ONE: and asking again finds the same one');
  const e = db.taleThreadOf(t.id);
  assert.strictEqual(e.entry_type, 'tale', 'TALE-KIND: of its own kind');
  assert.strictEqual(e.body, 'Ilse poles the ferry at dusk.', 'TALE-BEGAN: its first Over time entry is the premise');
  const facts = (db.addonsOf(t.id) as any[]).find((a) => a.entry_id === id && a.slot === 'facts');
  assert.strictEqual(facts?.body, 'A drowned valley.', 'TALE-ALWAYS: its Always true is the setting');
  assert.ok(!db.entriesOf(t.id).some((x: any) => x.id === id), 'TALE-NOT-A-CARD: it is not among the threads');

  // A premise or setting saved in Tale settings is saved on the thread too, through the same floor,
  // so the old text is kept in its history.
  db.updateStory(t.id, { premise: 'Ilse poles the ferry at dawn.', setting: 'A flooded valley.' });
  assert.strictEqual(db.taleThreadOf(t.id).body, 'Ilse poles the ferry at dawn.', 'TALE-SYNC: the premise follows Tale settings');
  assert.strictEqual((db.addonsOf(t.id) as any[]).find((a) => a.entry_id === id && a.slot === 'facts')?.body,
    'A flooded valley.', 'TALE-SYNC-ALWAYS: and so does the setting');
  assert.ok(db.entryHistory(t.id, id).some((r: any) => r.field === 'body' && r.previous_value === 'Ilse poles the ferry at dusk.'),
    'TALE-HISTORY: the premise it replaced is kept');

  // A copy of the tale keeps where it stands.
  db.upsertState(t.id, id, { fromChapter: 2, body: 'Ilse has lost the ferry.', label: 'the ferry lost' });
  const copy = db.duplicateStory(o, t.id, 'Tale thread, again')!;
  const there = db.taleThreadOf(copy.id);
  assert.ok(there && there.id !== id, 'TALE-COPY: a copied tale has a tale thread of its own');
  assert.deepStrictEqual((db.statesForStory(copy.id).get(there.id) ?? []).map((x: any) => x.body), ['Ilse has lost the ferry.'],
    'TALE-COPY-OVER-TIME: with its Over time');
  db.delStory(copy.id); db.delStory(t.id);
});

console.log(`\n${n} checks passed`);