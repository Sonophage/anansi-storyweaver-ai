// Cross-story isolation. Two owners, one story each; every route that names a story is
// hit with the OTHER owner's story id and must refuse.
//
// This exists because the audit found no ownership check on any route at all — the gate
// and the scoped writes were added together, and this is what stops a new route quietly
// arriving without either.
process.env.ANANSI_DB = '/tmp/anansi-scope.db';
import assert from 'node:assert';
import { unlinkSync } from 'node:fs';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync('/tmp/anansi-scope.db' + f); } catch {} }
const db = await import('../src/db.ts');
const { routes, OPEN_ROUTES, storyIdOf } = await import('../src/routes.ts');

const alice = db.owner('alice'), bob = db.owner('bob');
const aStory = db.createStory(alice, { title: "Alice's book" });
const bStory = db.createStory(bob, { title: "Bob's book" });
const aPassage = db.addPassage({ ...aStory, storyId: aStory.id, body: 'Alice wrote this.' });
const aEntry = db.upsertEntry(aStory.id, alice, { title: 'Secret', body: '[a spoiler]' });

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };

// 1. Every route is either open or gated. A new route with neither is a leak.
const gated = Object.keys(routes).filter((k) => !OPEN_ROUTES.has(k));
ok(`${gated.length} routes are gated, ${OPEN_ROUTES.size} deliberately open`);

// 2. The gate can find the story id in every shape a route uses.
for (const [body, query, want] of [
  [{ storyId: 'S' }, '', 'S'],
  [{ id: 'S' }, '', 'S'],
  [{}, 'story=S', 'S'],
  [{}, '', null],
] as const) {
  assert.strictEqual(storyIdOf(body, new URLSearchParams(query)), want);
}
ok('the gate finds the story id in every shape the routes use');

// 3. Ownership itself.
assert.ok(db.ownsStory(aStory.id, alice));
assert.ok(!db.ownsStory(aStory.id, bob), "bob must not own alice's story");
ok('ownsStory refuses a story you do not own');

// 4. Defence in depth: even past the gate, a foreign id must do nothing.
db.editPassage(bStory.id, aPassage, 'BOB WAS HERE');
assert.strictEqual((db.passagesOf(aStory.id)[0] as any).body, 'Alice wrote this.',
  "bob's story id must not let him edit alice's passage");
ok('a foreign story id cannot edit a passage');

db.delPassage(bStory.id, aPassage);
assert.strictEqual(db.passagesOf(aStory.id).length, 1, "alice's passage survived");
ok('a foreign story id cannot delete a passage');

db.delEntry(bStory.id, aEntry);
assert.strictEqual(db.entriesOf(aStory.id).length, 1, "alice's entry survived");
ok('a foreign story id cannot delete an entry');

db.upsertEntry(bStory.id, bob, { id: aEntry, title: 'HIJACKED', body: 'x' });
assert.strictEqual((db.entriesOf(aStory.id)[0] as any).title, 'Secret',
  "alice's entry was rewritten through bob's story");
assert.strictEqual(db.entriesOf(bStory.id).length, 1, 'and a copy landed in bob\'s own ledger instead');
ok('an upsert with a foreign entry id does not rewrite it');

assert.strictEqual(db.upsertState(bStory.id, aEntry, { fromChapter: 2, body: 'x' }), null);
ok('a state cannot be hung off another story\'s entry');

db.setPin(bStory.id, bStory.chapterId, aEntry, 'force_in');
assert.strictEqual(db.pinsOf(bStory.id).length, 0, 'the composite FK refused it');
ok('a pin cannot point at another story\'s entry');

db.addVariant(bStory.id, aPassage, 'a variant on someone else\'s prose');
assert.strictEqual(db.passagesOf(aStory.id).length, 1);
ok('a variant cannot be added to another story\'s passage');

db.editPassage(aStory.id, aPassage, 'Alice revised this.');
const hist = db.passageHistory(bStory.id, aPassage);
assert.strictEqual(hist.length, 0, "bob must not read alice's revision history");
assert.strictEqual(db.passageHistory(aStory.id, aPassage).length, 1, 'alice still can');
ok('revision history is not readable through a foreign story');

db.delStory(aStory.id, bob);
assert.ok(db.getStory(aStory.id), "bob must not delete alice's story");
ok('a story cannot be deleted by someone who does not own it');

// Export. A story handed to someone else must carry that story and nothing else — the point
// of the feature is that the file is safe to send, so a leak here is the whole bug. Runs last,
// so what gets exported is a database that has been through every mutation above.
{
  const bPassage = db.addPassage({ ...bStory, storyId: bStory.id, body: 'Bob wrote this.' });
  const bEntry = db.upsertEntry(bStory.id, bob, { title: "Bob's secret", body: '[bob spoiler]' });
  const { file } = db.exportStory(aStory.id, alice, '/tmp/anansi-export-test');
  const { DatabaseSync } = await import('node:sqlite');
  const out = new DatabaseSync(file);
  const one = (sql: string, ...a: any[]) => (out.prepare(sql).get(...a) as any);
  assert.strictEqual(one('SELECT COUNT(*) c FROM stories').c, 1, 'export must hold exactly one story');
  assert.strictEqual(one('SELECT id FROM stories').id, aStory.id, "and it must be alice's");
  assert.strictEqual(one('SELECT COUNT(*) c FROM users').c, 1, 'and exactly one user');
  assert.strictEqual(one('SELECT id FROM users').id, alice, 'and it must be alice');
  // The story's own contents survive. An export that isolates by deleting everything is
  // isolated and useless.
  assert.strictEqual(one('SELECT COUNT(*) c FROM passages WHERE id = ?', aPassage).c, 1, "alice's prose must survive");
  assert.strictEqual(one('SELECT COUNT(*) c FROM entries WHERE id = ?', aEntry).c, 1, "alice's canon must survive");
  // Bob is gone, including from the three tables that carry no story_id and would have been
  // exactly what a hand-written list of tables to copy leaked.
  assert.strictEqual(one('SELECT COUNT(*) c FROM passages WHERE id = ?', bPassage).c, 0, "bob's prose must not ship");
  assert.strictEqual(one('SELECT COUNT(*) c FROM entries WHERE id = ?', bEntry).c, 0, "bob's canon must not ship");
  assert.strictEqual(one('SELECT COUNT(*) c FROM entry_revisions').c,
    one('SELECT COUNT(*) c FROM entry_revisions r JOIN entries e ON e.id = r.entry_id').c,
    'no orphaned history rows may survive');
  assert.strictEqual(one('SELECT COUNT(*) c FROM passage_revisions').c,
    one('SELECT COUNT(*) c FROM passage_revisions r JOIN passages x ON x.id = r.passage_id').c,
    'no orphaned prose history may survive');
  out.close();
  assert.throws(() => db.exportStory(bStory.id, alice), /no such story/, "alice must not export bob's story");
  ok('export carries one story, its history, and nobody else');
}

// The OPEN routes bypass the gate, so their only protection is the SQL. Nothing asserted that.
// It matters more now than when they were written: each writer gets their own stories and their
// own lore, so "sandboxed" is the promise, and these three routes are the ones that span stories.
{
  // Give bob prose, a ledger entry and a chapter summary, each containing a word alice will search.
  const bCh = db.chapters(bStory.id)[0];
  db.addPassage({ ...bStory, storyId: bStory.id, body: 'Bob wrote the word peregrine here.' });
  db.upsertEntry(bStory.id, bob, { title: 'Peregrine of Bob', body: '[a peregrine only bob knows]' });
  db.setSummary(bCh.id, 'Bob summarised a peregrine.', 1, 'hash-b');
  // And alice something that must survive being found.
  db.addPassage({ ...aStory, storyId: aStory.id, body: 'Alice also wrote peregrine.' });

  const aHits = db.search(alice, 'peregrine');
  assert.ok(aHits.length > 0, 'alice must find her own prose');
  const leaked = aHits.filter((h: any) => h.story_id === bStory.id);
  assert.deepStrictEqual(leaked, [],
    'search leaked bob\'s rows to alice. It unions prose, entries and summaries, and EVERY branch '
    + 'needs its own owner filter — a missing one on any single branch leaks that kind only.');
  // Each branch separately, because one missing filter would hide behind two good ones.
  const kinds = new Set(db.search(bob, 'peregrine').map((h: any) => h.kind));
  assert.deepStrictEqual([...kinds].sort(), ['Entry', 'Prose', 'Summary'],
    `bob should match all three kinds of his own, got ${[...kinds]}`);
  ok('search spans prose, entries and summaries — and never another writer\'s');

  // Narrowing to one story is a filter ON TOP of the owner filter, never instead of it. Naming
  // someone else's story must return nothing rather than that story's contents.
  assert.deepStrictEqual(db.search(alice, 'peregrine', bStory.id), [],
    "alice narrowed her search to bob's story and got rows back");
  const narrowed = db.search(bob, 'peregrine', bStory.id);
  assert.ok(narrowed.length > 0, 'bob can narrow to his own story');
  assert.ok(narrowed.every((h: any) => h.story_id === bStory.id), 'and gets only that story');
  assert.ok(db.search(bob, 'peregrine').length >= narrowed.length,
    'unnarrowed is the wider set, not a different one');
  ok('narrowing search to one story is a filter on top of the owner check, not instead of it');

  const aLedger = db.ledgerOf(alice);
  assert.ok(aLedger.length > 0, 'alice must see her own ledger');
  assert.deepStrictEqual(aLedger.filter((e: any) => e.story_id === bStory.id), [],
    'the cross-story ledger leaked bob\'s entries to alice');
  assert.ok(db.ledgerOf(bob).some((e: any) => e.title === 'Peregrine of Bob'), 'bob sees his own');
  ok('the cross-story ledger stops at the writer who owns it');

  // Import is open because it names no existing story. The story it makes must be the caller's.
  const imp = await import('../src/import.ts');
  const made = imp.absorb(bob, imp.fromCard({ name: 'Bob\'s import', description: 'his alone' }));
  assert.ok(db.ownsStory(made.storyId, bob));
  assert.ok(!db.ownsStory(made.storyId, alice), 'an import must not land in another writer\'s library');
  ok('an import belongs to whoever called it, and to nobody else');

  // `into` merges into an EXISTING story, so import — the one route on the open list that now
  // names a story — is the only place a cross-writer write could get through. The gate does not
  // run here, so merge's own check is the whole defence and is asserted rather than assumed.
  const prose = imp.fromAiDungeonMarkdown('# Whose\n\nA line of prose.');
  assert.throws(() => imp.merge(alice, made.storyId, prose), /no such story/,
    'alice merged prose into bob\'s story through the open import route');
  assert.strictEqual(db.passagesOf(made.storyId).length, 0, "and nothing landed in bob's story");
  assert.strictEqual(imp.merge(bob, made.storyId, prose).passages, 1, 'bob can merge into his own');
  ok('merging into an existing story stops at the writer who owns it');
}

console.log(`\n${n} checks passed`);
