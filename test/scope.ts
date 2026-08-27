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

// Deleting a character takes its wardrobe with it, or outfits outlive the person wearing them.
{
  const tmp = db.upsertEntry(aStory.id, alice, { title: 'Temporary', body: '[here briefly]' });
  db.upsertOutfit(aStory.id, tmp, { name: 'Coat', body: 'oiled canvas' });
  assert.strictEqual(db.outfitsOf(aStory.id).length, 1);
  db.delEntry(aStory.id, tmp);
  assert.strictEqual(db.outfitsOf(aStory.id).length, 0, 'the wardrobe goes with the character');
}

assert.strictEqual(db.upsertOutfit(bStory.id, aEntry, { name: 'Hijack', body: 'x' }), null);
assert.strictEqual(db.wearOutfit(bStory.id, aEntry, 'o-anything'), null);
assert.strictEqual(db.outfitsOf(aStory.id).length, 0, "alice's character has no outfits from bob");
ok('an outfit cannot be hung off another story\'s entry, nor worn through one');

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

// Copying a card into another book. TWO stories are named on one request and the gate resolves
// exactly one of them, so one of the pair always arrives unchecked by it — which is why copyEntry
// checks both itself. Both directions are asserted separately: a check on the destination alone
// lets bob pull alice's canon INTO his book, a check on the source alone lets him push his into
// hers, and either one on its own passes a test that only tries the other.
{
  const aCard = db.upsertEntry(aStory.id, alice, { title: 'The Rust Choir', body: '[a congregation]',
    entryType: 'lore', activation: 'triggered', keys: ['choir', 'rust'] });
  // A state on it. Chapter 7 of one book is not chapter 7 of another, so this must NOT travel.
  db.upsertState(aStory.id, aCard, { fromChapter: 7, body: '[the choir is scattered]' });

  // Bob needs a card that really is in his own book. Aiming his own story id at ALICE'S card only
  // ever proves the composite scope: the row is not there to find, so a copyEntry with no
  // destination check at all still returns null and the destination assertion passes having tested
  // nothing. Each of the two ownership checks needs a case only it can refuse.
  const bCard = db.upsertEntry(bStory.id, bob, { title: "Bob's own", body: '[his alone]' });
  const aOther = db.createStory(alice, { title: "Alice's second book" });

  const bBefore = db.entriesOf(bStory.id).length;
  const aBefore = db.entriesOf(aStory.id).length;
  assert.strictEqual(db.copyEntry(aStory.id, bStory.id, bob, aCard), null,
    "bob pulled alice's card into his own book — the SOURCE is the half the gate never checks");
  assert.strictEqual(db.entriesOf(bStory.id).length, bBefore, 'and nothing landed in his ledger');
  assert.strictEqual(db.copyEntry(bStory.id, aStory.id, bob, bCard), null,
    "bob pushed his OWN card into alice's book — the destination is checked separately, and the "
    + 'composite scope cannot catch this one because the card really is in the source book');
  assert.strictEqual(db.entriesOf(aStory.id).length, aBefore, 'and nothing landed in hers');
  assert.strictEqual(db.copyEntry(bStory.id, aOther.id, alice, bCard), null,
    'alice must not read out of a book she does not own, even into one she does');
  assert.strictEqual(db.entriesOf(aOther.id).length, 0, 'and nothing landed in her second book');
  ok('a card cannot be copied out of, or into, another writer\'s book');

  // The composite scope, which is the other half. Both books here are ALICE'S, so ownership passes
  // and the only thing standing between an entry id and the wrong book is (id, story_id).
  assert.strictEqual(db.copyEntry(aOther.id, aStory.id, alice, aCard), null,
    'an entry id from another story resolved through a source book the caller does own');
  assert.strictEqual(db.entriesOf(aStory.id).length, aBefore, 'and nothing was duplicated');
  ok('an entry id only resolves through the story it actually lives in');

  // And it works, which is the half a security test forgets. The keys travel; the timeline does not.
  const made = db.copyEntry(aStory.id, aOther.id, alice, aCard);
  assert.ok(made && made !== aCard, 'the copy is a new card, not the same row in two books');
  const there = db.entriesOf(aOther.id).find((x: any) => x.id === made) as any;
  assert.strictEqual(there.title, 'The Rust Choir');
  assert.strictEqual(there.entry_type, 'lore');
  assert.strictEqual(there.activation, 'triggered');
  assert.deepStrictEqual(JSON.parse(there.keys), ['choir', 'rust'],
    'the keys travel — a triggered card without them never reaches the model again and looks fine');
  assert.strictEqual(db.statesForStory(aOther.id).size, 0,
    'the timeline must NOT travel: a state is anchored to a chapter number, and chapter 7 there is '
    + 'not chapter 7 here, so copying it puts a fact in force at an unrelated scene');
  assert.strictEqual(db.statesForStory(aStory.id).get(aCard)?.length, 1,
    'and the original keeps its own');
  assert.strictEqual(db.entriesOf(aStory.id).length, aBefore, 'the book it came from is unchanged');
  ok('a copied card carries its keys into the other book, and leaves the timeline behind');
}

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
  // `exportStory` carries no list of tables: it deletes every other story and lets ON DELETE
  // CASCADE do the rest. So the check that matters is not about any one table — it is that NO
  // table carrying a story_id has another story's rows left in it. A table added later without a
  // cascade fails here instead of shipping every writer's work. Verified by adding exactly such a
  // table: the failure names it.
  //
  // (Asserting one table by name is worth little. The first version of this named `outfits` and
  // could not be made to fail, because outfits also cascade through entries — the story_id
  // foreign key was never the thing holding it.)
  const carriers = (out.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[])
    .map((t: any) => t.name)
    .filter((t: string) => (out.prepare(`PRAGMA table_info(${t})`).all() as any[])
      .some((c: any) => c.name === 'story_id'));
  assert.ok(carriers.length >= 5, `expected several story-scoped tables, found ${carriers}`);
  const leaked = carriers.filter((t: string) =>
    (out.prepare(`SELECT COUNT(*) c FROM ${t} WHERE story_id != ?`).get(aStory.id) as any).c > 0);
  assert.deepStrictEqual(leaked, [],
    `these tables shipped another story's rows in alice's export: ${leaked}`);
  console.log(`      (${carriers.length} story-scoped tables checked)`);
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

// The prompt overrides are per OWNER and on the open list, so nothing else gates them — the
// scoping has to be in the queries themselves.
{
  db.setPrompt(alice, 'speak', "ALICE'S WORDING");
  assert.deepStrictEqual(db.promptsOf(bob), {}, "bob must not see alice's prompt");
  assert.strictEqual(db.promptsOf(alice).speak, "ALICE'S WORDING");
  db.setPrompt(bob, 'speak', "BOB'S WORDING");
  assert.strictEqual(db.promptsOf(alice).speak, "ALICE'S WORDING",
    "bob writing his own must not overwrite alice's — the key is (owner, mode), not mode");
  // Empty is the reset, and it resets only the owner who sent it.
  db.setPrompt(alice, 'speak', '   ');
  assert.deepStrictEqual(db.promptsOf(alice), {}, 'blank deletes rather than storing blank');
  assert.strictEqual(db.promptsOf(bob).speak, "BOB'S WORDING", "and leaves bob's alone");
  ok('prompt overrides are scoped to their owner, and blank is the reset');
}

// ---- the DISPATCHER refuses, not just the database ----
//
// Everything above proves the db-level defence: a foreign id does nothing even past the gate.
// None of it proves the gate itself, which is the thing standing between 30-odd routes and
// someone else's book — and an audit once found zero ownership checks on 27 routes, which is
// what the gate exists to stop coming back.
//
// A real server, because the gate is four lines inside serve.ts's request handler and testing a
// copy of it would prove a copy. Spawned as a child on a spare port against this database, as
// the OTHER writer.
{
  const { spawn } = await import('node:child_process');
  const PORT = 5187;
  const srv = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, ANANSI_PORT: String(PORT), ANANSI_DB: '/tmp/anansi-scope.db',
           ANANSI_USER: 'bob', ANANSI_LLAMA_UNIT: 'anansi-test-nonexistent.service' },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${PORT}`;
  const post = (path: string, body: unknown) => fetch(url + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    for (let i = 0; i < 40; i++) {
      try { await fetch(url + '/', { signal: AbortSignal.timeout(500) }); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    // Alice's story, asked for by the server running as bob. Her prose is read BEFORE rather than
    // written down here: earlier checks in this file edit it, and an expected value copied from
    // the top of the file would be asserting the fixture rather than the gate.
    const hers = db.passagesOf(aStory.id).map((p: any) => p.body).join('|');
    const before = db.passagesOf(aStory.id).length;
    const foreign = await post('/api/write', { storyId: aStory.id, body: 'BOB WAS HERE' });
    assert.strictEqual(foreign.status, 404, "a gated route must refuse another writer's story id");
    assert.strictEqual(db.passagesOf(aStory.id).map((p: any) => p.body).join('|'), hers,
      'and nothing of hers may have changed');
    assert.strictEqual(db.passagesOf(aStory.id).length, before, 'nor may anything be added');

    // TWO stories on one request, which is the shape the gate cannot cover on its own: it resolves
    // `storyId` and nothing else, so `into` is the route's to check. As bob, source his, destination
    // hers — the gate PASSES this one, and what refuses it is the route.
    const bOwn = db.entriesOf(bStory.id)[0] as any;
    const herBefore = db.entriesOf(aStory.id).length;
    const pushed = await post('/api/entry/copy',
      { storyId: bStory.id, into: aStory.id, entryId: bOwn.id });
    assert.strictEqual(pushed.status, 200,
      'the gate lets this through, because the story it names IS his — that is the point of it');
    assert.ok((await pushed.json()).error, 'and the route is what refuses it');
    assert.strictEqual(db.entriesOf(aStory.id).length, herBefore,
      "nothing of bob's landed in alice's book");

    // A gated route naming no story at all: the gate cannot resolve an owner, so it fails closed.
    const nameless = await post('/api/write', { body: 'no story named' });
    assert.strictEqual(nameless.status, 400, 'a gated route naming no story must be refused');

    // And the open list still works, or the gate has closed the front door too.
    const open = await fetch(url + '/api/stories');
    assert.strictEqual(open.status, 200, 'a route on the open list still answers');

    ok('the dispatcher itself fails closed — a real server, as the other writer');
  } finally { srv.kill(); }
}

// The allowlist, which is the other half of the gate: the isolation above proves what an owner may
// touch, and this proves who gets to be one. Two servers, because a check that only ever sees a 403
// cannot tell a working allowlist from a broken server — the second one is the control.
{
  const { spawn } = await import('node:child_process');
  const boot = async (port: number, allow: string) => {
    const srv = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, ANANSI_PORT: String(port), ANANSI_DB: '/tmp/anansi-scope.db',
             ANANSI_USER: 'bob', ANANSI_ALLOW: allow,
             ANANSI_LLAMA_UNIT: 'anansi-test-nonexistent.service' },
      stdio: 'ignore',
    });
    const url = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 40; i++) {
      try { await fetch(url + '/', { signal: AbortSignal.timeout(500) }); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    return { srv, url };
  };

  // Bob is the desk here, and the allowlist names only alice. The desk is checked like anyone
  // else, so bob is refused on his own machine.
  const shut = await boot(5188, 'alice');
  try {
    assert.strictEqual((await fetch(shut.url + '/api/stories')).status, 403,
      'an allowlist that does not name you refuses you, desk or not');
    assert.strictEqual((await fetch(shut.url + '/')).status, 403,
      'and it refuses the app shell too, not only the API');
  } finally { shut.srv.kill(); }

  // The control. Same server, same desk, and the pair form names bob's ACCOUNT on the right of the
  // `=` — so a 200 here is what proves the 403 above came from the allowlist and not from a server
  // that answers nothing.
  const open = await boot(5189, 'someone@example.test=bob');
  try {
    assert.strictEqual((await fetch(open.url + '/api/stories')).status, 200,
      'an allowlist that does name your account lets you in — the 403 above is the gate, not a dead server');
  } finally { open.srv.kill(); }

  ok('the allowlist decides who is a writer, and refuses the desk itself when told to');
}

// Who may stop the router, and whose model a switch lands on. Both are the same lesson: the gate
// answers "is this your story", and neither of these questions is that one.
{
  const { spawn } = await import('node:child_process');
  const boot = async (port: number, admin: string) => {
    const srv = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, ANANSI_PORT: String(port), ANANSI_DB: '/tmp/anansi-scope.db',
             ANANSI_USER: 'bob', ANANSI_ADMIN: admin,
             ANANSI_LLAMA_UNIT: 'anansi-test-nonexistent.service' },
      stdio: 'ignore',
    });
    const url = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 40; i++) {
      try { await fetch(url + '/', { signal: AbortSignal.timeout(500) }); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    const post = (path: string, body: unknown) => fetch(url + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { srv, post };
  };

  // Bob owns the story he names, so the ownership gate lets him through. The admin check is what
  // stops him, and it has to be a different answer from 404 or the two are indistinguishable.
  const notAdmin = await boot(5194, 'alice');
  try {
    const r = await notAdmin.post('/api/router', { storyId: bStory.id, action: 'status' });
    assert.strictEqual(r.status, 403,
      'owning the story you named is not permission to stop a service the other writer shares');
  } finally { notAdmin.srv.kill(); }

  // The control: same request, same story, bob IS the admin. Anything but 403 — the unit does not
  // exist here, so systemctl's own answer comes back and that is fine. Without this the check above
  // cannot tell an admin gate from a route that refuses everyone.
  const isAdmin = await boot(5195, 'bob');
  try {
    const r = await isAdmin.post('/api/router', { storyId: bStory.id, action: 'status' });
    assert.notStrictEqual(r.status, 403, 'the admin is not refused — the 403 above is the admin check');

    // And while a route's own codes are being trusted: this one names 400 for an action off its
    // fixed list, and that arrived as 500 until the dispatcher stopped flattening everything but 404.
    const bad = await isAdmin.post('/api/router', { storyId: bStory.id, action: 'rm -rf' });
    assert.strictEqual(bad.status, 400, "a route's own 400 must not reach the client as a 500");
  } finally { isAdmin.srv.kill(); }

  ok('only the admin may stop the router, and owning a story is not being the admin');
}

// modelFor's precedence, which is what keeps one writer's switch off the other's prose: the story
// wins, then the writer's own fallback, then the process default. Pure and synchronous, so it needs
// no router — and the ordering is the whole of the feature.
{
  const { modelFor, model } = await import('../src/llama.ts');
  const boot = model();
  assert.strictEqual(modelFor({ model: 'story-m' }, 'writer-m'), 'story-m',
    "a story that names its own model outranks the writer's fallback");
  assert.strictEqual(modelFor({ model: null }, 'writer-m'), 'writer-m',
    "a story with none falls back to the writer's, not the process's");
  assert.strictEqual(modelFor({ model: null }, null), boot,
    'and with neither, the boot default');
  assert.strictEqual(modelFor(null, 'writer-m'), 'writer-m',
    'no story at all still honours the writer');
  ok('the model in force is the story\'s, then the writer\'s, then the box\'s');
}

// TLS is configured by a pair, and half a pair must stop the server rather than quietly serving
// plain HTTP. A downgrade that logs nothing is the kind you find out about from someone else.
{
  const { spawn } = await import('node:child_process');
  const exitOf = (env: Record<string, string>) => new Promise<number>((done) => {
    const srv = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, ANANSI_PORT: '5196', ANANSI_DB: '/tmp/anansi-scope.db',
             ANANSI_USER: 'bob', ANANSI_LLAMA_UNIT: 'anansi-test-nonexistent.service', ...env },
      stdio: 'ignore',
    });
    // If it is still up after a second it never refused, which is the failure this asserts.
    const t = setTimeout(() => { srv.kill(); done(0); }, 1500);
    srv.on('exit', (code) => { clearTimeout(t); done(code ?? 0); });
  });

  assert.strictEqual(await exitOf({ ANANSI_CERT: '/nonexistent.crt' }), 2,
    'a cert with no key must stop the server, not fall back to plain HTTP');
  assert.strictEqual(await exitOf({ ANANSI_KEY: '/nonexistent.key' }), 2,
    'and a key with no cert likewise');
  assert.notStrictEqual(await exitOf({ ANANSI_CERT: '/nonexistent.crt', ANANSI_KEY: '/nonexistent.key' }), 0,
    'a configured cert that cannot be read must stop the server too');

  ok('half a TLS pair stops the server instead of serving plain HTTP');
}

// The voice of the weave a new story starts with is a prompt override under a key that is not a
// mode. It rides that machinery precisely so it inherits this scoping — so the scoping is asserted
// here rather than assumed from the mode checks above.
{
  const { routes } = await import('../src/routes.ts');
  const { DEFAULT_VOICE } = await import('../src/prompts.ts');
  const ctx = (owner: string, body: any = {}) => ({ body, query: new URLSearchParams(), owner,
    slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
    defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;

  const a0: any = routes['GET /api/prompts'](ctx(alice));
  assert.strictEqual(a0.voice.mine, null, 'a writer starts with no voice of their own');
  assert.strictEqual(a0.voice.inUse, DEFAULT_VOICE, 'so the shipped one is in use');

  routes['POST /api/prompts'](ctx(alice, { key: 'voice', text: "Alice's own voice." }));
  const a1: any = routes['GET /api/prompts'](ctx(alice));
  const b1: any = routes['GET /api/prompts'](ctx(bob));
  assert.strictEqual(a1.voice.inUse, "Alice's own voice.", 'hers is in use for her');
  assert.strictEqual(b1.voice.inUse, DEFAULT_VOICE, "and bob still gets the shipped one");
  assert.strictEqual(a1.voice.shipped, DEFAULT_VOICE,
    'the shipped one stays available as the backstop after she has replaced it');

  // Blank is the reset, exactly as it is for a mode.
  routes['POST /api/prompts'](ctx(alice, { key: 'voice', text: '   ' }));
  assert.strictEqual((routes['GET /api/prompts'](ctx(alice)) as any).voice.inUse, DEFAULT_VOICE,
    'and blanking it puts the shipped one back');

  // It is not a mode, and must not be accepted as one anywhere a mode is expected.
  const bad: any = routes['POST /api/prompts'](ctx(alice, { key: 'nonsense', text: 'x' }));
  assert.match(String(bad.error ?? ''), /no mode called/, 'a key that is neither a mode nor voice is refused');

  // A new story opens in the writer's voice, not the shipped one.
  routes['POST /api/prompts'](ctx(alice, { key: 'voice', text: "Alice's own voice." }));
  const made: any = routes['POST /api/stories'](ctx(alice, { title: 'Hers' }));
  assert.strictEqual((db.listStories(alice).find((r: any) => r.id === made.id) as any).writing_style,
    "Alice's own voice.", "a new story starts in the writer's own voice");

  ok("the voice of the weave is per writer, resets to the shipped one, and starts a new story");
}

// The cover arrives as a data URL in a JSON body, which means the prefix is a claim the sender
// makes about bytes the server has not looked at. Every refusal below is a thing a browser will
// never send and an ordinary curl can: a PNG called a JPEG, a PNG relabelled, nothing at all, and
// a camera original posted whole. Falsify by deleting the magic-byte line — the relabelled PNG
// case is the one that goes red, and it is the one a Content-Type header cannot catch.
{
  const ctx = (owner: string, body: any = {}, query = '') => ({ body, query: new URLSearchParams(query),
    owner, slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
    defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
  const post = (body: any) => { try { return routes['POST /api/cover'](ctx(alice, body)); }
                                catch (e: any) { return { error: e.message, code: e.code }; } };
  const jpeg = (n2: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(n2, 3)]);
  const url = (b: Buffer, mime = 'image/jpeg') => `data:${mime};base64,${b.toString('base64')}`;

  for (const [label, body] of [
    ['a PNG data URL is refused for what it says it is', { storyId: aStory.id, dataUrl: url(jpeg(10), 'image/png') }],
    ['a PNG wearing a JPEG prefix is refused for what it IS',
     { storyId: aStory.id, dataUrl: url(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])) }],
    ['an empty cover is refused', { storyId: aStory.id, dataUrl: 'data:image/jpeg;base64,' }],
    ['a missing cover is refused', { storyId: aStory.id }],
    ['a cover over the 1MB ceiling is refused', { storyId: aStory.id, dataUrl: url(jpeg(1_200_000)) }],
    ['an SVG is refused, prefix and bytes both', { storyId: aStory.id, dataUrl: url(Buffer.from('<svg onload="x()">'), 'image/svg+xml') }],
  ] as const) {
    const r: any = post(body);
    assert.strictEqual(r.code, 400, `${label}: got ${JSON.stringify(r).slice(0, 90)}`);
    assert.strictEqual(db.coverAt(aStory.id), null, `${label}: and nothing was stored`);
  }

  const good: any = post({ storyId: aStory.id, dataUrl: url(jpeg(2_000)) });
  assert.ok(!good.error, `a real JPEG is accepted: ${good.error ?? ''}`);
  assert.ok(good.cover! > 0, 'and the view it hands back says there is a cover now');
  assert.strictEqual(good.story.title, "Alice's book", 'as the whole story view, like every sibling route');

  // Served inline and cacheable forever, because the URL carries the version. A filename here
  // would make serve.ts send Content-Disposition: attachment, and an <img> would show nothing.
  const got: any = routes['GET /api/cover'](ctx(alice, {}, `story=${aStory.id}`));
  assert.strictEqual(got.__raw.type, 'image/jpeg');
  assert.strictEqual(got.__raw.filename, undefined, 'no filename, so it is inline and not a download');
  assert.match(got.__raw.headers['Cache-Control'], /immutable/);
  assert.strictEqual(Buffer.from(got.__raw.body).length, 2_003, 'and it is the bytes that went in');

  // Bob is stopped by the dispatcher, not by this handler — so what is proved here is the other
  // half: nothing in the handler makes its own decision about who may read a cover.
  assert.ok(!db.ownsStory(aStory.id, bob), "bob does not own alice's book, so the gate answers first");

  routes['DELETE /api/cover'](ctx(alice, { storyId: aStory.id }));
  assert.strictEqual(db.coverAt(aStory.id), null, 'and removing it removes it');
  ok('a cover is validated as bytes and not as a label, and is served inline');
}

// A reroll of a directed passage re-runs the instruction that made it. Asserted on the PROMPT,
// through the same route the Context panel reads, because that is the only place the claim is
// testable without a model: the mode template is what carries a directive, and `direct` is the only
// one that mentions it. Passing mode 'continue' is the point — if the inherit did not force the
// mode, the instruction would reach a template that never says it.
{
  const ctx = (owner: string, body: any = {}) => ({ body, query: new URLSearchParams(), owner,
    slot: { global: 40_000, slots: 1, perSlot: 40_000 }, gen: { max_tokens: 900 }, setGen: () => {},
    defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
  const steered = db.addPassage({ storyId: aStory.id, branchId: aStory.branchId,
    chapterId: aStory.chapterId, body: 'He knocks once.', author: 'model',
    directive: 'have him lose his nerve' })!;

  const m1: any = await routes['POST /api/manifest'](ctx(alice,
    { storyId: aStory.id, regenerateOf: steered, mode: 'continue' }));
  assert.match(m1.prompt, /have him lose his nerve/,
    'rerolling a directed passage sends the instruction that made it');
  assert.match(m1.prompt, /Write what happens next: have him lose his nerve/,
    'and sends it through the one mode template that carries a directive');

  // A directive in the request is the writer typing a new one, and it wins. Mode `direct` with it,
  // because that is the only pair the surface can produce — a directive rides in the MODE block, so
  // mode 'continue' plus a directive would be a request whose instruction has nowhere to go, and
  // asserting on it would be asserting about a shape nothing sends.
  const m2: any = await routes['POST /api/manifest'](ctx(alice,
    { storyId: aStory.id, regenerateOf: steered, mode: 'direct', directive: 'let him go through with it' }));
  assert.match(m2.prompt, /let him go through with it/, 'a new instruction wins');
  assert.doesNotMatch(m2.prompt, /lose his nerve/, 'and the old one is not also sent');

  // Nothing inherited when nothing was regenerated, or every fresh Continue would carry the last
  // steer the story ever had.
  const m3: any = await routes['POST /api/manifest'](ctx(alice, { storyId: aStory.id, mode: 'continue' }));
  assert.doesNotMatch(m3.prompt, /lose his nerve/, 'a fresh call inherits nothing');

  // An undirected passage stays undirected: the mode the writer chose is the mode that runs.
  const plain = db.addPassage({ storyId: aStory.id, branchId: aStory.branchId,
    chapterId: aStory.chapterId, body: 'The hall is cold.', author: 'model' })!;
  const m4: any = await routes['POST /api/manifest'](ctx(alice,
    { storyId: aStory.id, regenerateOf: plain, mode: 'continue' }));
  assert.doesNotMatch(m4.prompt, /Write what happens next/,
    'a passage with no instruction is not forced into Direct');
  assert.match(m4.prompt, /Carry the scene forward/, 'it rerolls in the mode it was asked for');

  db.delSlot(aStory.id, steered);
  db.delSlot(aStory.id, plain);
  ok('a reroll re-runs the instruction that made the passage, and only that passage');
}

console.log(`\n${n} checks passed`);
