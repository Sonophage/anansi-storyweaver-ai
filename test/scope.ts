// Cross-story isolation. Two owners, one story each; every route that names a story is
// hit with the OTHER owner's story id and must refuse.
//
// This exists because the audit found no ownership check on any route at all — the gate
// and the scoped writes were added together, and this is what stops a new route quietly
// arriving without either.
process.env.ANANSI_DB = '/tmp/anansi-scope.db';
import assert from 'node:assert';
import { unlinkSync, readFileSync } from 'node:fs';
// Raw http, because `fetch` decodes gzip transparently and hides the header while doing it. The
// static check at the bottom of this file has to see what actually crossed the wire.
import { get as httpGet } from 'node:http';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync('/tmp/anansi-scope.db' + f); } catch {} }
const db = await import('../src/db.ts');
const { routes, OPEN_ROUTES, storyIdOf, isPrivateHost } = await import('../src/routes.ts');

const alice = db.owner('alice'), bob = db.owner('bob');
/** A ctx for the blocks that need one before the per-block helpers appear further down. */
const ctxI = (owner: string, body: any = {}, query = '') => ({ body,
  query: new URLSearchParams(query), owner,
  slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
  defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
const aStory = db.createStory(alice, { title: "Alice's book" });
const bStory = db.createStory(bob, { title: "Bob's book" });
const aPassage = db.addPassage({ ...aStory, storyId: aStory.id, body: 'Alice wrote this.' });
const aEntry = db.upsertEntry(aStory.id, alice, { title: 'Secret', body: '[a spoiler]' });

let n = 0;
// Message only — assertions run inline above. db.ts, engine.ts and stream.ts take a callback and
// call it; passing one to THIS `ok` would print a green check for a body that never ran. Refused
// rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

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

// 2b. THE SHARED BOX. Two writers on two models is the point; a third dies with HTTP 500 rather
// than queueing, because oversubscribing the shared cache does not queue — both requests die, and
// the writer who loses is whoever was already mid-generation. So it is refused at the switch, where
// it can still be a sentence.
{
  const { tooManyModels } = await import('../src/routes.ts');
  assert.strictEqual(tooManyModels([], 'a'), false, 'the first model is always fine');
  assert.strictEqual(tooManyModels(['a'], 'b'), false, 'and a second — that is the whole point');
  assert.strictEqual(tooManyModels(['a', 'b'], 'c'), true, 'a third is refused');
  // SWITCHING ONTO SOMEBODY ELSE'S MODEL LOADS NOTHING, so it can never be refused. Counting
  // writers instead of distinct ids would have got this backwards and blocked the safe move.
  assert.strictEqual(tooManyModels(['a', 'b'], 'a'), false,
    'joining a model already loaded is always allowed');
  assert.strictEqual(tooManyModels(['a', 'a', 'a'], 'b'), false,
    'three writers on one model is one model');
  // An unset default is an empty string in the map; it is not a model.
  assert.strictEqual(tooManyModels(['a', ''], 'b'), false, 'a writer with no model is not one');
}
ok('a third distinct model is refused at the switch, and joining a loaded one never is');

// 3. Ownership itself.
assert.ok(db.ownsStory(aStory.id, alice));
assert.ok(!db.ownsStory(aStory.id, bob), "bob must not own alice's story");
ok('ownsStory refuses a story you do not own');

/* ---- A BOOK WITH TWO WRITERS. Seth, 2026-09-03: "a shared book or books would be great. and i can
 * call her into a book if need be."
 *
 * THIS IS THE ONE TABLE THAT CAN OPEN A DOOR. `ownsStory` is the single ownership question in the
 * app and every route is behind it, so a row in `story_writers` is the only thing in the schema
 * that makes a book answer for somebody who does not own it. Asked in every direction that matters:
 * the guest gets in, a stranger still does not, the guest cannot delete, and taking the guest back
 * out shuts the door again. A check that only proved the first would be a check that cannot fail
 * on the mistake that costs something. */
{
  const carol = db.owner('carol');
  // ITS OWN BOOK, not the fixture's. The first version shared `aStory` and wrote a thread into it,
  // and a check further down — "alice's entry survived" — went red on a row it had never seen. A
  // block that leaves state behind fails the next one for a reason that has nothing to do with it.
  const shared = db.createStory(alice, { title: 'Written together' });
  db.addWriter(shared.id, bob);

  assert.ok(db.ownsStory(shared.id, bob), 'a writer called into a book can reach it');
  assert.ok(db.ownsStory(shared.id, alice), "and the owner still can");
  assert.ok(!db.ownsStory(shared.id, carol), 'a third writer still cannot — sharing is not opening');

  // IT IS ON THE GUEST'S SHELF, which is the half a gate check cannot see: a book you may write in
  // and cannot find is a book you do not have.
  assert.ok(db.listStories(bob).some((r: any) => r.id === shared.id),
    "a shared book is on the guest's shelf");
  assert.ok(db.listStories(alice).some((r: any) => r.id === shared.id),
    "and has not left the owner's");
  assert.ok(!db.listStories(carol).some((r: any) => r.id === shared.id),
    'and is on nobody else\'s');

  // AND ITS THREADS COME WITH IT. `entriesOf` is scoped to the story rather than the writer, so
  // this needed no change at all — asserted because "no change" is exactly the claim that is worth
  // being wrong about, and the cross-book ledger DID need one.
  db.upsertEntry(shared.id, alice, { title: 'A shared thread', body: '[it is here]' });
  assert.ok(db.ledgerOf(bob).some((e: any) => e.title === 'A shared thread'),
    "a shared book's threads reach the guest's cross-book ledger");
  assert.ok(!db.ledgerOf(carol).some((e: any) => e.title === 'A shared thread'),
    'and not a stranger\'s');

  // DELETING IS NOT SHARED. Being called in to write is not being handed the power to remove
  // somebody's book, and `deleteStory` is deliberately still owner-only.
  db.delStory(shared.id, bob);
  assert.ok(db.ownsStory(shared.id, alice), 'a guest cannot delete the book they were called into');

  // AND THE DOOR SHUTS AGAIN.
  db.dropWriter(shared.id, bob);
  assert.ok(!db.ownsStory(shared.id, bob), 'taking a writer back out shuts the door');
  assert.ok(!db.listStories(bob).some((r: any) => r.id === shared.id),
    'and takes the book off their shelf');

  const who = db.writersOf(shared.id);
  assert.deepStrictEqual(who.map((w: any) => w.login), ['alice'], 'and the book names its writers');
  db.addWriter(shared.id, bob);
  assert.deepStrictEqual(db.writersOf(shared.id).map((w: any) => w.login), ['alice', 'bob'],
    'owner first, then who was called in');
  db.dropWriter(shared.id, bob);
  ok('a book can be shared with a second writer, and unshared, and the gate follows both ways');

  /* ---- WHOSE MOVE IT IS. Seth, 2026-09-03: "no it doesnt block writing just says whose move it
   * is", and on calling the model when stuck — "it stays with me".
   *
   * SO ONLY CO-OP HANDS OVER. Speak, Act and Narrate also land a human passage through the same
   * route and then go on to ask the model; the move is still yours until you have written your
   * part. A check that only proved co-op passes the turn would pass just as well on a rule that
   * passed it for every human passage, which is the mistake worth catching. */
  db.addWriter(shared.id, bob);
  assert.strictEqual((db.getStory(shared.id) as any).turn ?? null, null,
    'a book starts owing nobody a move');

  db.handOver(shared.id, alice);
  assert.strictEqual((db.getStory(shared.id) as any).turn, bob, 'writing in co-op passes the move');
  db.handOver(shared.id, bob);
  assert.strictEqual((db.getStory(shared.id) as any).turn, alice, 'and back again');

  // A BOOK WRITTEN ALONE NEVER GROWS A TURN, so nothing about writing by yourself changes.
  const alone = db.createStory(alice, { title: 'On my own' });
  db.handOver(alone.id, alice);
  assert.strictEqual((db.getStory(alone.id) as any).turn ?? null, null,
    'a book with one writer owes no move to anybody');

  // AND A TURN CANNOT BE OWED TO SOMEBODY WHO HAS LEFT. Dropping the writer while the move was
  // theirs would otherwise leave the book waiting for ever on a person who cannot reach it.
  db.handOver(shared.id, alice);
  db.dropWriter(shared.id, bob);
  assert.strictEqual((db.getStory(shared.id) as any).turn ?? null, null,
    'taking a writer out clears a move that was owed to them');
  /* ---- AND ONLY CO-OP HANDS OVER, asked through the ROUTE. The rule lives in `POST /api/write`,
   * so the checks above — which call `handOver` directly — could not see it: making the route pass
   * the turn on every human passage left every one of them green. Speak, Act and Narrate land a
   * human passage through this same route and then go on to ask the model, and the move is still
   * yours until you have written your part in co-op. */
  db.addWriter(shared.id, bob);
  const write = (mode: string) => {
    const ctx: any = { body: { storyId: shared.id, body: `a line in ${mode}`, mode },
      query: new URLSearchParams(), owner: alice, slot: { global: 8192, slots: 1, perSlot: 8192 },
      gen: {}, setGen: () => {}, defaultModel: null, setDefaultModel: () => {}, admin: false };
    (routes['POST /api/write'] as any)(ctx);
    return (db.getStory(shared.id) as any).turn ?? null;
  };
  for (const mode of ['speak', 'act', 'narrate', 'direct']) {
    assert.strictEqual(write(mode), null,
      `${mode} lands a human passage and keeps the move — the model is still to answer it`);
  }
  assert.strictEqual(write('coop'), bob, 'and co-op is the one that hands it over');
  db.dropWriter(shared.id, bob);
  ok('the move passes on a co-op turn, never in a book written alone, and never to somebody gone');

  /* ---- WHO MAY HAND OUT THE KEYS. `ownsStory` is NOT the check for this: it answers "may this
   * person write here", which a co-writer passes — and handing out the keys is not one of the
   * things being handed a key lets you do. Neither is evicting the person who invited you.
   *
   * AND A LOGIN IS RESOLVED THROUGH THE ALLOWLIST, never taken from the body. `c.mates()` is the
   * only thing that turns a name into an account, so a body naming an account reaches nothing and
   * a login the server would refuse at the front door cannot be let in through a book. */
  {
    const mates = [{ login: 'bob', id: bob }];
    const ctx = (owner: string, body: any) => ({ body, query: new URLSearchParams(), owner,
      slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
      defaultModel: null, setDefaultModel: () => {}, admin: false, mates: () => mates }) as any;
    const share = (owner: string, body: any) => (routes['POST /api/writers'] as any)(ctx(owner, body));

    const asOwner = share(alice, { storyId: shared.id, login: 'bob' });
    assert.ok(!asOwner.error, `the owner can call somebody in: ${asOwner.error ?? ''}`);
    assert.ok(db.ownsStory(shared.id, bob), 'and it takes effect');

    assert.match(share(bob, { storyId: shared.id, login: 'bob' }).error ?? '', /only the owner/,
      'a co-writer cannot hand out the keys they were given');
    assert.match(share(carol, { storyId: shared.id, login: 'bob' }).error ?? '', /only the owner/,
      'and a stranger cannot');
    assert.ok(db.ownsStory(shared.id, bob), 'and neither refusal changed anything');

    // A NAME THE SERVER DOES NOT KNOW. This is what stops a book being shared with somebody the
    // front door would refuse — and an ACCOUNT id in the body is exactly such a name.
    assert.match(share(alice, { storyId: shared.id, login: 'nobody' }).error ?? '', /no such writer/,
      'a login that is not on the allowlist is refused');
    assert.match(share(alice, { storyId: shared.id, login: carol }).error ?? '', /no such writer/,
      'and an account id in the body reaches nothing — the body names a person, not an account');

    // TAKING THEM OUT IS THE OWNER'S TOO, and it must not be how a guest removes the owner.
    assert.match(share(bob, { storyId: shared.id, login: 'bob', remove: true }).error ?? '',
      /only the owner/, 'a co-writer cannot take themselves — or anybody — out');
    assert.ok(!share(alice, { storyId: shared.id, login: 'bob', remove: true }).error,
      'the owner can');
    assert.ok(!db.ownsStory(shared.id, bob), 'and it takes effect');
  }
  ok('only the owner of a book can call somebody into it, and only by a login the server knows');

  /* ---- THE LIVE CHANNEL. Seth, 2026-09-03: what the other writer does "needs to be instant."
   *
   * ASSERTED AT THE BUS, which is where the rule lives that a route could get wrong: a change
   * announces itself and carries WHO made it, so `serve.ts` can drop a writer's own press before
   * it is sent. `touch()` is the one place a book is marked as moved and has twenty-five callers,
   * so hanging the channel there is what makes this cover a passage, a thread, a chapter and a turn
   * without a list of routes to keep in step — and that breadth is the thing worth proving.
   *
   * WHAT IS NOT COVERED HERE: the `c.by === OWNER` drop and the ownership check in serve.ts, which
   * need two identities on one process and loopback only ever resolves to one. The own-press half
   * was verified by hand against a throwaway server — an SSE reader saw zero events from its own
   * write — and is written down rather than claimed. */
  {
    const live = await import('../src/live.ts');
    const seen: any[] = [];
    const off = live.onChange((c) => seen.push(c));
    try {
      live.asWriter(bob);
      const p = db.addPassage({ storyId: shared.id, branchId: db.activeBranchOf(shared.id),
        chapterId: db.chapters(shared.id)[0].id, body: 'a line from the other writer', author: 'human' });
      assert.ok(p, 'the passage landed');
      assert.ok(seen.some((c) => c.storyId === shared.id && c.by === bob),
        'writing a passage announces the book, and says who wrote it');

      // A TURN IS A CHANGE TOO — it is the whole of what the other writer is waiting on, and it
      // goes through the same `touch`. A channel that carried prose and not the move would be
      // instant for half of what Seth asked for.
      seen.length = 0;
      live.asWriter(alice);
      db.handOver(shared.id, alice);
      assert.ok(seen.some((c) => c.storyId === shared.id && c.by === alice),
        'and so does handing the move over');

      // NOBODY, when no request is in flight. `by` is module state and serve.ts clears it after
      // every handler — without that, the nightly export would be attributed to whoever pressed
      // something last and suppressed for exactly the writer most likely to be watching.
      seen.length = 0;
      live.asWriter(null);
      db.handOver(shared.id, bob);
      assert.ok(seen.some((c) => c.storyId === shared.id && c.by === null),
        'a change with no request behind it belongs to nobody, so everybody hears it');
    } finally { off(); live.asWriter(null); }

    // AND A DROPPED LISTENER STOPS BEING TOLD. One held after its response is dead writes to a
    // closed socket for the life of the process.
    const after = seen.length;
    db.handOver(shared.id, alice);
    assert.strictEqual(seen.length, after, 'unsubscribing is what stops the writes');
  }
  /* ---- AND WHO IS TOLD. The one rule on the live path that can be wrong invisibly: a reader who
   * hears about a book they cannot open is a leak, and a reader who hears their own press gets a
   * second repaint that can only be staler than the one they already had.
   *
   * A FUNCTION, so it can be asked. The first version was a pair of `if`s inside the SSE handler,
   * where the only way to test it was to hold a live socket and two identities on one process —
   * and loopback resolves to exactly one, so it could not have been tested at all. */
  {
    const live = await import('../src/live.ts');
    const change = (by: string | null) => ({ storyId: shared.id, by, at: Date.now() });
    assert.strictEqual(live.shouldTell(change(bob), alice, true), true,
      "the other writer's change reaches you");
    assert.strictEqual(live.shouldTell(change(alice), alice, true), false,
      'your own press does not — your page already has it');
    assert.strictEqual(live.shouldTell(change(bob), carol, false), false,
      'and a book you cannot open never reaches you at all');
    assert.strictEqual(live.shouldTell(change(null), alice, true), true,
      'a change with nobody behind it reaches everybody who can see the book');
    // BOTH REASONS, INDEPENDENTLY. `canSee && by !== me` passes for the wrong reason if either half
    // is dropped, so the case that is false for BOTH is not enough on its own.
    assert.strictEqual(live.shouldTell(change(alice), alice, false), false,
      'and neither half alone lets something through');
  }
  ok('a change announces the book it happened in, says who made it, and stops when nobody listens');
}

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

// A cross-tenant retirement is not a coherence bug, it is a silent deletion of somebody else's
// character: the card stays on their Threads screen and quietly stops reaching the model.
assert.strictEqual(db.setRetired(bStory.id, aEntry, 3), false);
assert.strictEqual((db.entriesOf(aStory.id)[0] as any).retired_at_chapter ?? null, null,
  "alice's entry was retired through bob's story");
ok('a card cannot be finished through another story\'s id');

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
  // AND ITS ROOMS, since 2026-08-29. A card is named fields now, so a copy carrying only the spine
  // arrived without her appearance, her voice, her relationships or her wardrobe — most of what a
  // card IS — and looked complete doing it, because a card with no rooms is indistinguishable from
  // a card whose rooms did not travel.
  {
    const roomy = db.upsertEntry(aStory.id, alice, { title: 'Wrenn', body: '[Wrenn: a fence]',
      entryType: 'character', keys: ['Wrenn'] });
    const fear = db.upsertAddon(aStory.id, roomy, { slot: 'interiority', name: 'her fear',
      body: 'will not cross the bridge at night', keys: ['bridge'] });
    const coat = db.upsertAddon(aStory.id, roomy, { slot: 'outfit', name: 'the grey coat',
      body: 'wool, shiny cuffs', keys: [] });
    db.setAddonActive(aStory.id, coat!, true);
    void fear;
    const twin = db.copyEntry(aStory.id, aOther.id, alice, roomy)!;
    const rooms = db.addonsOf(aOther.id).filter((a: any) => a.entry_id === twin);
    assert.deepStrictEqual(rooms.map((a: any) => a.slot).sort(), ['interiority', 'outfit'],
      'the rooms travel with the card, the wardrobe among them');
    assert.deepStrictEqual(JSON.parse(rooms.find((a: any) => a.slot === 'interiority').keys), ['bridge'],
      "and a room's own trigger words come with it, or it arrives unable to fire");
    assert.strictEqual(rooms.find((a: any) => a.slot === 'outfit').active, 1,
      'and a coat she was wearing is still on — upsertAddon inserts unworn, so this is thrown after');
    assert.strictEqual(db.addonsOf(aStory.id).filter((a: any) => a.entry_id === roomy).length, 2,
      'the book it came from keeps its own');
  }
  ok('a copied card carries its keys and its rooms, and leaves the timeline behind');

  // THE WHOLE SHELF, AND THE CONNECTIONS BETWEEN WHAT TRAVELS. This exists for the day a book is
  // deleted: the prose is the book and goes with it, the ledger is work that outlives the story it
  // was written for, and `entries.story_id` cascades so one press took all of it.
  {
    const home = db.createStory(alice, { title: 'Leaving' }).id;
    const dest = db.createStory(alice, { title: 'Arriving' }).id;
    const her = db.upsertEntry(home, alice, { title: 'Halsey', body: '[Halsey]', keys: ['Halsey'] });
    const coat = db.upsertEntry(home, alice, { title: 'the grey coat', body: '[a coat]',
      entryType: 'item', keys: ['coat'] });
    db.linkEntries(home, her, coat, { confidence: 0.6 });
    const moved = db.copyLedger(home, dest, alice)!;
    assert.strictEqual(moved.cards, 2);
    assert.strictEqual(moved.edges, 1, 'the connection between two cards that both travelled');
    const edge = db.edgesOf(dest)[0] as any;
    const nameOf = (id: string) => db.entriesOf(dest).find((x: any) => x.id === id)?.title;
    // DIRECTED, and the direction is the one thing about that table that cannot be recovered
    // later. A copy that reversed it would be silent and permanent.
    assert.strictEqual(nameOf(edge.parent_id), 'Halsey');
    assert.strictEqual(nameOf(edge.child_id), 'the grey coat');
    assert.strictEqual(edge.confidence, 0.6, 'and what the pull is worth comes with it');
    // A cross-owner move is refused, or a delete could launder a book into somebody else's shelf.
    assert.strictEqual(db.copyLedger(home, bStory.id, alice), null);
    assert.strictEqual(db.copyLedger(home, home, alice), null, 'and a book cannot copy into itself');
  }
  ok('a whole ledger can outlive its book, with the connections between what travelled');

  // A BOOK CAN FOLLOW ANOTHER BOOK'S THREADS — a world bible, and the books set in it. One column,
  // no new ownership scope, because a world here IS a book that happens to hold cards.
  {
    const world = db.createStory(alice, { title: 'The Ash Cycle' }).id;
    const book = db.createStory(alice, { title: 'The Anagram of Ash' }).id;
    db.upsertEntry(world, alice, { title: 'the Ambersand', body: '[a house that lends at ruin]',
      entryType: 'lore', keys: ['Ambersand'] });
    db.upsertEntry(book, alice, { title: 'Halsey', body: '[Halsey]', keys: ['Halsey'] });
    db.updateStory(book, { loreFrom: world });

    assert.deepStrictEqual(db.entriesFor(book).map((e: any) => e.title).sort(),
      ['Halsey', 'the Ambersand'], "the world's threads reach the book that follows it");
    // AND `entriesOf` IS UNTOUCHED, which is the load-bearing half: DELETE, copy and export all
    // read it and all mean "cards this book owns". A follower must not be able to delete, export
    // or duplicate its world's cards, and a followed card looks exactly like an owned one.
    assert.deepStrictEqual(db.entriesOf(book).map((e: any) => e.title), ['Halsey'],
      'and the follower does not OWN them');
    assert.strictEqual(db.entriesFor(world).length, 1, 'following does not run backwards');

    // The follower's own card wins a title collision: the book you are writing in is allowed to
    // disagree with the bible, and losing that silently would be the worst kind of surprise.
    db.upsertEntry(book, alice, { title: 'the Ambersand', body: '[burned, in this one]',
      entryType: 'lore', keys: ['Ambersand'] });
    const both = db.entriesFor(book).filter((e: any) => e.title === 'the Ambersand');
    assert.strictEqual(both.length, 1, 'one card, not two');
    assert.match(both[0].body, /burned/, "and it is the follower's own");

    // ONE HOP, NEVER A CHAIN, and a pair is the only cycle one hop can make.
    assert.strictEqual(db.updateStory(book, { loreFrom: book }) ?? null, null);
    assert.strictEqual((db.getStory(book) as any).lore_from, world, 'a book cannot follow itself');
    db.updateStory(world, { loreFrom: book });
    assert.strictEqual((db.getStory(world) as any).lore_from, null,
      'and cannot follow the book that follows it');

    // Cross-owner never, even though the column is set on a story the owner controls: a source can
    // change hands, and a card crossing owners through a read path is a leak.
    db.updateStory(book, { loreFrom: bStory.id });
    assert.deepStrictEqual(db.entriesFor(book).map((e: any) => e.title).sort(),
      ['Halsey', 'the Ambersand'], "another owner's book lends nothing");

    db.updateStory(book, { loreFrom: world });
    assert.deepStrictEqual(db.followersOf(world).map((x: any) => x.title), ['The Anagram of Ash'],
      'and the world knows who would lose threads if it went');

    /* ISSUE #36 · THE PER-CARD DOORS ARE SCOPED THE SAME WAY THE READ PATH IS.
     *
     * Three new operations reach ACROSS books by design — take a followed card over, hand it back,
     * take it out of this book — and one of them WRITES to the other book. So each has to check the
     * owner of the source as well as the destination, which the dispatcher's gate cannot do: it
     * resolves one `storyId` and this is the second book.
     *
     * The write-through in `upsertEntry` is the sharpest of the four. It turns a save against a
     * foreign id into a save in the book that id lives in, and without the owner check that is a
     * writer editing somebody else's canon by pointing at it. */
    {
      const foreign = db.entriesOf(bStory.id)[0] as any;
      assert.ok(foreign, "bob's book really has a card to aim at");

      // Alice's book follows HER world, so bob's card is not one it follows. Every door refuses it.
      assert.strictEqual(db.unlinkEntry(book, alice, foreign.id), null,
        'a card from a book this one does not follow cannot be taken over');
      assert.strictEqual(db.dropFollowed(book, alice, foreign.id), null,
        'nor removed, which would write a tombstone claiming a stranger\'s card');

      /* AND THE WRITE-THROUGH DOES NOT CROSS OWNERS.
       *
       * THIS HAS TO BE SET UP AGAINST BOB'S BOOK OR IT PROVES NOTHING, and the first version of it
       * did not: while `book` follows Alice's own world, the redirect never fires for a card of
       * bob's at all — the lookup is scoped to the followed book — so deleting the owner check left
       * every assertion green. Falsified on 2026-09-01 and rewritten.
       *
       * The state below is the one the check exists for and the one `entriesFor` already refuses on
       * the read side: `lore_from` naming a book somebody else owns. The column is set on a story
       * the owner controls, but a source can change hands and an import can write it, and a WRITE
       * crossing owners through here is a writer editing another writer's canon by pointing at it. */
      db.updateStory(book, { loreFrom: bStory.id });
      const was = foreign.body;
      db.upsertEntry(book, alice, { id: foreign.id, title: foreign.title, body: 'ALICE WAS HERE',
        entryType: foreign.entry_type, activation: 'always_on' });
      assert.strictEqual((db.entriesOf(bStory.id).find((e: any) => e.id === foreign.id) as any).body,
        was, "a save aimed through a followed book somebody else owns must not reach their card");
      // It fell through to minting a card in her own book, which is the safe answer — not silence.
      assert.ok(db.entriesOf(book).some((e: any) => e.body === 'ALICE WAS HERE'),
        'and the write lands in her own book instead of vanishing');
      db.delEntry(book, (db.entriesOf(book).find((e: any) => e.body === 'ALICE WAS HERE') as any).id);
      // Taking one of bob's cards over through that column is refused for the same reason.
      assert.strictEqual(db.unlinkEntry(book, alice, foreign.id), null,
        "a card in a followed book somebody else owns cannot be taken over either");
      assert.strictEqual(db.dropFollowed(book, alice, foreign.id), null, 'nor tombstoned');
      db.updateStory(book, { loreFrom: world });

      // The same three, aimed the right way, from the wrong writer. `bob` owns neither book here.
      const hers = db.entriesOf(world)[0] as any;
      assert.strictEqual(db.unlinkEntry(book, bob, hers.id), null,
        'and none of the three can be driven by a writer who owns neither book');
      assert.strictEqual(db.dropFollowed(book, bob, hers.id), null);
      const took = db.unlinkEntry(book, alice, hers.id)!;
      assert.ok(took, 'she can take her own world\'s card over');
      assert.strictEqual(db.relinkEntry(book, bob, took, 'mine'), null,
        'and bob cannot hand her copy back, which would write into her world book');
      assert.match((db.entriesOf(world).find((e: any) => e.id === hers.id) as any).body,
        /a house that lends at ruin/, 'her world card is untouched');
      db.relinkEntry(book, alice, took, 'theirs');

      /* AND HANDING A COPY BACK CANNOT WRITE INTO A BOOK SOMEBODY ELSE OWNS.
       *
       * `keep: 'mine'` writes this book's wording UP onto the origin, so it is the one operation
       * here that edits another book on purpose. `ownsStory(storyId, o)` refuses a writer who does
       * not own the follower — which is what caught the first version of this — but that is not the
       * check being tested. The one being tested is on the SOURCE, and reaching it needs a copy
       * whose origin now lives in someone else's book.
       *
       * `unlinkEntry` will not make that state, so it is built here directly, which is precisely
       * what "the source changed hands" or an import writing `lore_from` looks like from the inside.
       * Falsified on 2026-09-01: without this the check reads as covered and is not. */
      const mine2 = db.unlinkEntry(book, alice, hers.id)!;
      assert.ok(mine2, 'a copy of her own world card, to point somewhere else');
      const bobCard = db.entriesOf(bStory.id)[0] as any;
      const bobWas = bobCard.body;
      db.rawSetOrigin(book, mine2, bobCard.id);
      db.updateStory(book, { loreFrom: bStory.id });
      db.upsertEntry(book, alice, { id: mine2, title: 'Rewritten', body: 'ALICE WROTE THIS',
        entryType: 'lore', activation: 'always_on' });
      assert.strictEqual(db.relinkEntry(book, alice, mine2, 'mine'), null,
        'handing a copy back into a book she does not own must be refused outright');
      assert.strictEqual((db.entriesOf(bStory.id).find((e: any) => e.id === bobCard.id) as any).body,
        bobWas, "and his card must be byte-for-byte what it was");
      db.updateStory(book, { loreFrom: world });
      db.rawSetOrigin(book, mine2, null);
      db.delEntry(book, mine2);
    }
    ok('the per-card follow doors check the owner of BOTH books, including the write-through (#36)');
  }
  ok('a book can follow another book\'s threads, one hop, same owner, its own cards winning');

  // A COPY IS NOT A LINK, and the two doors sit next to each other on the same panel, so the
  // difference is asserted rather than left to the wording.
  {
    const from = db.createStory(alice, { title: 'The Ash Cycle' }).id;
    db.upsertEntry(from, alice, { title: 'the Ambersand', body: '[a house]', entryType: 'lore' });
    const ctxFor = (body: any) => ({ body, query: new URLSearchParams(), owner: alice,
      slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
      defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
    const r: any = routes['POST /api/threads/copy'](ctxFor({ storyId: from, into: 'new' }));
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.cards, 1);
    assert.notStrictEqual(r.into, from, 'a new book, not this one');
    assert.match((db.getStory(r.into) as any).title, /Ash Cycle/,
      'named after the book it came from, so it is findable on the shelf');
    // BOTH BOOKS KEEP THEIR OWN. This is the half that separates it from following: edit one and
    // the other does not move.
    db.upsertEntry(r.into, alice, { id: db.entriesOf(r.into)[0].id, title: 'the Ambersand',
      body: '[burned to the ground]', entryType: 'lore', activation: 'always_on', keys: [],
      lastEditor: 'human' });
    assert.match((db.entriesOf(from)[0] as any).body, /a house/,
      'the book it was copied FROM is untouched — a copy, not a link');
    assert.strictEqual((db.getStory(r.into) as any).lore_from ?? null, null,
      'and the new book follows nothing: it owns what it was given');
  }
  ok('threads can start a new book, and that is a copy rather than a link');

  /* AND THE THIRD DOOR ON THAT PANEL: the whole book again, prose and all. Seth, 2026-09-11.
   *
   * Asserted HERE, beside the other two, because all three mint a book from an existing one and the
   * differences between them are the entire point — copy the cast, follow the cast, or take the
   * book. The one that matters at this seam is `lore_from`: a copy of a book set in a world is a
   * book set in that world, where "start a new book from these threads" deliberately follows
   * nothing. Two lines apart in `Keep`, opposite answers, so neither is left to the wording. */
  {
    const world = db.createWorld(alice, { title: 'The Ninefold' }).id;
    db.upsertEntry(world, alice, { title: 'the Warden', body: '[never left]', entryType: 'lore' });
    const book = db.storyFollowing(alice, world, 'A Writ')!.id;
    db.addPassage({ storyId: book, branchId: db.activeBranchOf(book), chapterId: db.chapters(book)[0].id,
      body: 'The writ came at first light.', author: 'human' });
    const ctxFor = (body: any, owner: string) => ({ body, query: new URLSearchParams(), owner,
      slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
      defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;

    const r: any = routes['POST /api/story/duplicate'](ctxFor({ storyId: book, title: 'A Writ, again' }, alice));
    assert.ok(!r.error, r.error);
    assert.notStrictEqual(r.id, book, 'a second book, not this one');
    assert.strictEqual(r.passages, 1, 'and the prose came with it — that is the whole difference');
    assert.strictEqual((db.getStory(r.id) as any).lore_from, world,
      'a copy of a book set in a world is set in that world — unlike the threads copy above');
    assert.ok((r.stories ?? []).some((x: any) => x.id === r.id),
      'the shelf comes back holding it, so the client need not ask again');

    // THE GATE, in the direction that matters. `duplicateStory` asks for itself as well as being
    // behind the dispatcher: the handler is reachable from a harness with no request around it.
    const stolen: any = routes['POST /api/story/duplicate'](ctxFor({ storyId: book, title: 'Mine' }, bob));
    assert.ok(stolen.error, "bob must not be able to copy alice's book");
    assert.strictEqual(db.listStories(bob).length,
      db.listStories(bob).filter((x: any) => x.title !== 'Mine').length,
      'and nothing of hers landed on his shelf');
  }
  ok('the whole book copies, keeps the world it is set in, and refuses another writer');

  // AND A FOLLOWED BOOK CANNOT BE DELETED OUT FROM UNDER ITS FOLLOWERS. Built without a check
  // first, which the falsification caught: stubbing the guard left every assertion green.
  {
    const world = db.createStory(alice, { title: 'The Ash Cycle' }).id;
    const book = db.createStory(alice, { title: 'The Anagram of Ash' }).id;
    db.upsertEntry(world, alice, { title: 'the Ambersand', body: '[a house]', entryType: 'lore' });
    db.updateStory(book, { loreFrom: world });
    const ctxFor = (body: any) => ({ body, query: new URLSearchParams(), owner: alice,
      slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
      defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
    const no: any = routes['DELETE /api/stories'](ctxFor({ id: world }));
    assert.match(no.error ?? '', /The Anagram of Ash/,
      'the refusal NAMES who needs it, or the writer cannot act on it');
    assert.ok(db.getStory(world), 'and the book is still there');
    // The way through is the one the message describes, and then it goes.
    db.updateStory(book, { loreFrom: null });
    const yes: any = routes['DELETE /api/stories'](ctxFor({ id: world }));
    assert.ok(yes.ok && !db.getStory(world), 'unfollow it and the book can go');
  }
  ok('a book other books follow is refused by name, and goes once nothing needs it');

  // #22's BLOCKER. The page that spans the shelf could not draw a room or switch one on, because
  // this route had never sent one — cards have had rooms since Phase 2 and it sent the spine.
  {
    const ctxFor = (body: any = {}) => ({ body, query: new URLSearchParams(), owner: alice,
      slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
      defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
    const bk = db.createStory(alice, { title: 'Ledger payload' }).id;
    const who = db.upsertEntry(bk, alice, { title: 'Wrenn', body: '[Wrenn]', keys: ['Wrenn'] });
    const coat = db.upsertAddon(bk, who, { slot: 'outfit', name: 'the grey coat',
      body: 'wool, shiny cuffs', keys: [] });
    db.setAddonActive(bk, coat!, true);
    db.upsertAddon(bk, who, { slot: 'interiority', name: 'her fear', body: 'the bridge', keys: ['bridge'] });
    db.setRetired(bk, who, 9);

    const r: any = routes['GET /api/ledger'](ctxFor());
    const card = r.entries.find((e: any) => e.id === who);
    assert.deepStrictEqual(card.addons.map((a: any) => a.slot).sort(), ['interiority', 'outfit'],
      'every room reaches the page that spans the shelf');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(card.addons.find((a: any) => a.slot === 'interiority').keys)),
      ['bridge'], "and a room's own trigger words with it, or it arrives unable to fire");
    assert.strictEqual(card.outfits.length, 1);
    assert.strictEqual(card.outfits[0].active, true, 'the wardrobe reads off the same rows');
    // A finished thread must not read as live HERE above anywhere else: this is the one page where
    // a card is seen out of the context of the book that retired it.
    assert.strictEqual(card.retiredAtChapter, 9, 'and a finished thread says so');
    assert.ok(r.slots && r.slots.character, 'the slot list rides along, from src/slots.ts');
    // Another owner's rooms are not in it. The route is owner-scoped in SQL and this is the half
    // that would leak if the new query forgot the join.
    assert.ok(!r.entries.some((e: any) => e.story === bStory.id), "and nobody else's book is in it");
  }
  ok('the cross-shelf ledger carries rooms, the wardrobe, and what is finished');
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

  /* AND THE OTHER DIRECTION, which is where it was broken (2026-09-01).
   *
   * Everything above exports ALICE's book, and that direction always worked. `exportStory` deletes
   * every user but the owner, and `prompt_overrides.owner_id REFERENCES users(id)` has NO cascade —
   * so deleting a writer who kept an override raises FOREIGN KEY constraint failed and loses the
   * whole export. Exporting alice's book deletes bob, who has no overrides: fine. Exporting BOB's
   * book deletes alice, who does.
   *
   * That asymmetry is the only reason it survived. Found on the live library rather than here: the
   * desk saved an override at 2026-08-31 21:09 and from that moment four books of nine stopped
   * exporting off-disk, both of the second writer's among them, with one line at boot naming the
   * first failure. Hers are exactly the ones the desk cannot notice missing.
   */
  // Straight through db: this block runs long before the route helpers are defined, and the row is
  // the whole point rather than the path that writes it.
  db.setPrompt(alice, 'voice', 'Alice keeps an override.');
  const bOut = db.exportStory(bStory.id, bob, '/tmp/anansi-export-test');
  assert.ok(bOut?.file, "bob's book must export while alice keeps a prompt override");
  const bDb = new DatabaseSync(bOut.file);
  try {
    const users = (bDb.prepare('SELECT id FROM users').all() as any[]).map((u: any) => u.id);
    assert.deepStrictEqual(users, [bob], "only bob rides in bob's export");
    const foreign = (bDb.prepare('SELECT owner_id FROM prompt_overrides').all() as any[])
      .filter((r: any) => r.owner_id !== bob);
    assert.deepStrictEqual(foreign, [], "and none of alice's overrides travel in it");
  } finally { bDb.close(); }
  unlinkSync(bOut.file);
  // PUT IT BACK. The prompts block further down asserts that a writer starts with no voice of their
  // own, and this file shares one database top to bottom — leaving the row behind reddens an
  // assertion four hundred lines away about something else entirely. A blank deletes it (db.ts:1328).
  db.setPrompt(alice, 'voice', '');
  ok("a second writer's book exports while the desk keeps prompt overrides");
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

// The look — theme, font, prose size, UI scale — is per writer AND per book, and `POST /api/look`
// is on the open list because setting your own default names no story. Open means the dispatcher's
// gate never runs, including on the requests that DO name one, so both halves are asserted here:
// the writer default cannot be read across, and one writer cannot restyle another's book.
{
  const lookCtx = (owner: string, body: any = {}) => ({ body, query: new URLSearchParams(), owner,
    slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
    defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
  db.setLook(alice, { theme: 'parchment', font: 'garamond' });
  assert.deepStrictEqual(db.lookOf(bob), null, "bob must not inherit alice's default look");
  db.setLook(bob, { theme: 'obsidian' });
  assert.strictEqual(db.lookOf(alice).theme, 'parchment', "and bob's must not overwrite alice's");
  assert.strictEqual(db.lookOf(bob).theme, 'obsidian');

  // The scoped write. Falsified by dropping `AND owner_id = ?` from setStoryLook, which turns the
  // next assertion red — without it alice restyles bob's book through an ungated route.
  db.setStoryLook(bStory.id, bob, { theme: 'ink' });
  db.setStoryLook(bStory.id, alice, { theme: 'ALICE WAS HERE' });
  assert.strictEqual(JSON.parse((db.getStory(bStory.id) as any).look).theme, 'ink',
    "alice restyled bob's book: setStoryLook wrote without checking who owns it");

  // And the route above the query, which is where the 404 comes from. It must not confirm the
  // book exists, either — "not yours" and "no such story" are the same answer to a stranger.
  await assert.rejects(async () => routes['POST /api/look'](
    lookCtx(alice, { storyId: bStory.id, look: { theme: 'ALICE WAS HERE' } })), /no such story/,
    'the open look route let alice name a story that is not hers');

  // The whitelist. These four values are written onto <html> as `data-ui-*` attributes, and
  // test/web.ts asserts those never collide with an action name — so an unfiltered object here
  // would let a client put any attribute it liked on the root element, including one that reads
  // as a click action. Keys AND values, because a key check alone lets `theme: 'a b"c'` through.
  const r: any = await routes['POST /api/look'](lookCtx(alice, { look: {
    theme: 'ink', rail: 'open', 'data-nav': 'x', font: 'a b"c', size: 'm',
    scale: '110', __proto__: { polluted: true },
  } }));
  assert.deepStrictEqual(Object.keys(r.look).sort(), ['scale', 'size', 'theme'],
    `only the four known keys may survive, and only with sane values — got ${JSON.stringify(r.look)}`);
  assert.strictEqual(r.look.font, undefined, 'a value with a quote and a space in it is refused whole');
  assert.strictEqual((db.lookOf(alice) as any).rail, undefined, 'and nothing else reaches the column');

  // Null is a value, not a delete: it is how a book goes back to following your default.
  db.setStoryLook(bStory.id, bob, null);
  assert.strictEqual((db.getStory(bStory.id) as any).look, null,
    'clearing a book\'s look must leave it following the writer default');
  ok('the look is per writer and per book, and neither crosses to another writer');
}

// ONE MODEL PER WRITER, on a box that two writers share. Switching your default releases the one
// you were on — Seth's ask, because the router holds three and sleeps them only at 900 seconds, so
// trying three models leaves three resident. Every clause of the guard is a way to take a model out
// from under somebody, so every clause gets its own case.
{
  const { releasable } = await import('../src/llama.ts');
  const base = { active: 'new-model', bootDefault: 'boot-model', otherDefaults: [] as string[],
                 storiesOnIt: 0, busy: 0 };

  assert.strictEqual(releasable('old-model', base).ok, true,
    'a model nobody else is using is released, or this feature does nothing at all');

  assert.strictEqual(releasable('boot-model', base).ok, false,
    'the boot default is every writer\'s fallback — releasing it makes the next call somebody '
    + 'else makes pay a cold load');
  assert.strictEqual(releasable('old-model', { ...base, otherDefaults: ['old-model'] }).ok, false,
    'and a model the OTHER writer is set to must survive your switch');
  assert.strictEqual(releasable('old-model', { ...base, storiesOnIt: 1 }).ok, false,
    'so must one a book names — modelFor puts the story ahead of the writer default');
  assert.strictEqual(releasable('old-model', { ...base, busy: 1 }).ok, false,
    'and one with a generation in flight, which is the clause that reaches somebody\'s prose');
  assert.strictEqual(releasable('same', { ...base, active: 'same' }).ok, false,
    'switching to the model you are already on releases nothing');
  assert.strictEqual(releasable('', base).ok, false, 'and a writer with no previous model has nothing to release');

  // The verdict carries WHY, because "kept" with no reason reads as the feature being broken.
  assert.match(releasable('old-model', { ...base, otherDefaults: ['old-model'] }).why, /another writer/);
  ok('releasing a model on switch stops at the boot default, the other writer, a pinned book, and a call in flight');
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

  /* FIVE KEYS, AND `regenerate` IS NOT ONE. It was from 2026-09-01 to 2026-09-18 — a wording of
   * its own for a re-roll — and it named the passage a re-roll's prompt leaves out, so the model
   * rewrote the passage before it. A re-roll re-runs the mode the passage was written with now.
   *
   * THREE LISTS MUST AGREE and this is the seam: the route's allow-list decides what the editor
   * may save, `defaultModePrompts` decides what it shows, and `web/app.js` decides what it draws.
   * A key any one of them keeps alone is either a box that silently never saves, or a row the
   * engine will never read. Both directions asserted, or this only watches one. */
  {
    const saved: any = routes['POST /api/prompts'](ctxI(alice, { key: 'narrate', text: 'MY NARRATE' }));
    assert.ok(!saved?.error, `the five must still save: ${saved?.error}`);
    assert.deepStrictEqual(Object.keys(saved.defaults).sort(),
      ['act', 'continue', 'direct', 'narrate', 'speak'],
      'the editor is shown exactly the five the route will accept');
    const gone: any = routes['POST /api/prompts'](
      ctxI(alice, { key: 'regenerate', text: 'MY OWN RE-ROLL WORDING' }));
    assert.ok(gone?.error, 'a re-roll wording is refused: there is nothing for it to override');
    assert.strictEqual(db.promptsOf(alice).regenerate, undefined);
    // A KEY THAT IS NOT ON THE LIST IS STILL REFUSED. Removing one must not loosen the door.
    const junk: any = routes['POST /api/prompts'](ctxI(alice, { key: 'narrte', text: 'typo' }));
    assert.ok(junk?.error, 'a key nobody defined is refused rather than stored');
    assert.strictEqual(db.promptsOf(alice).narrte, undefined);
    db.setPrompt(alice, 'narrate', '   ');
  }
  ok('the editor saves exactly the five modes the engine renders, and a stray key still does not');
}

// #18 §3. THE STYLE LIBRARY IS THE SAME TABLE WITH A NAMESPACED KEY, which means it inherits the
// scoping proved above rather than needing its own — and that inheritance is the whole reason a
// second table was not built. Asserted here anyway: "it reuses the safe thing" is a claim about
// code, and the check is what makes it a fact.
{
  db.setPrompt(alice, 'voice:Noir', 'Wet streets. Nobody explains themselves.');
  db.setPrompt(bob, 'voice:Noir', "BOB'S NOIR");
  assert.strictEqual(db.promptsOf(alice)['voice:Noir'], 'Wet streets. Nobody explains themselves.',
    'two writers can hold the same NAME without touching each other — the key is (owner, key)');
  assert.strictEqual(db.promptsOf(bob)['voice:Noir'], "BOB'S NOIR");
  // A saved voice must not become a mode override. `assemble` looks these up BY MODE NAME, so a
  // key that is not one is invisible to it — the same argument that let the bare `voice` key ride
  // in this table, and the reason the route hands the library back separately from `yours`.
  const { routes } = await import('../src/routes.ts');
  const seen: any = await routes['GET /api/prompts']({ owner: alice, body: {},
    query: new URLSearchParams() } as any);
  assert.deepStrictEqual(Object.keys(seen.yours), [],
    'a saved voice is not a mode, and must not arrive in the map the mode editor draws from');
  assert.deepStrictEqual(seen.library.voice, [{ name: 'Noir',
    text: 'Wet streets. Nobody explains themselves.' }], 'it arrives as the library instead');
  assert.deepStrictEqual(seen.library.style, [], 'and the two shelves are kept apart');

  // Blank deletes a saved one, the same way it resets a mode: there is no third state where a
  // saved voice exists holding nothing.
  db.setPrompt(alice, 'voice:Noir', '');
  assert.strictEqual(db.promptsOf(alice)['voice:Noir'], undefined, 'blank forgets it');
  assert.strictEqual(db.promptsOf(bob)['voice:Noir'], "BOB'S NOIR", "and leaves bob's alone");
  ok('the style library is the prompt table namespaced, so it inherits its scoping and its reset');
}

// A NAME IS PARSED ON THE FIRST COLON, so a name containing one would stop round-tripping —
// `voice:noir:2` splits two ways. Refused at the route, because the column cannot know that.
{
  const { routes } = await import('../src/routes.ts');
  const post = (key: string, text: string) => routes['POST /api/prompts'](
    { owner: alice, body: { key, text }, query: new URLSearchParams() } as any) as any;
  assert.match((await post('voice:', 'x')).error, /needs a name/, 'an empty name is refused');
  assert.match((await post('style:a:b', 'x')).error, /colon/, 'and so is one carrying a colon');
  assert.match((await post('voice:' + 'x'.repeat(61), 'x')).error, /too long/);
  assert.match((await post('nonsense', 'x')).error, /no mode called/,
    'while a key that is neither a mode nor a shelf is still refused as it always was');
  assert.strictEqual(db.promptsOf(alice)['style:a:b'], undefined, 'and nothing was written');
  ok('a library name is validated where the colon means something, not at the column');
}

// ---- the DISPATCHER refuses, not just the database ----
//
// Everything above proves the db-level defence: a foreign id does nothing even past the gate.
// None of it proves the gate itself, which is the thing standing between 30-odd routes and
// someone else's book — and an audit once found zero ownership checks on 27 routes, which is
// what the gate exists to stop coming back.
//
// AN ACT IS EDITED IN PLACE (#44): text and title, through `POST /api/arc`. Asserted on what the
// writer and the model see — the view the route answers with, and the prompt the Context panel
// reads — and never on the row. The gate in serve.ts refuses another writer's STORY id; this block
// covers the half the gate cannot see, an act id from another book under the caller's own story id.
// The real-server block below sends the same route with alice's story id, as bob.
{
  const ctx = (owner: string, body: any = {}) => ({ body, query: new URLSearchParams(), owner,
    slot: { global: 40_000, slots: 1, perSlot: 40_000 }, gen: { max_tokens: 900 }, setGen: () => {},
    defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
  // Chapter four is current and empty, so chapters one and two are behind the whole-prose window
  // and an act over them is what EARLIER sends.
  const book = db.createStory(alice, { title: 'Alice, in acts' });
  for (let i = 0; i < 3; i++) db.endChapter(book.id, book.branchId);
  const act = db.addArc(book.id, { branchId: book.branchId, fromChapter: 1, toChapter: 2,
    title: 'Short to Water', summary: 'Aldis borrows against the key and learns the vault floods.' });
  const actIn = (v: any) => (v.arcs ?? []).find((a: any) => a.id === act);
  const promptOf = async () => (await routes['POST /api/manifest'](
    ctx(alice, { storyId: book.id, mode: 'continue' })) as any).prompt as string;

  const saved: any = routes['POST /api/arc'](ctx(alice, { storyId: book.id, id: act,
    title: 'The debt', summary: 'Aldis pawns the key to Marek. The vault is under the waterline.' }));
  assert.ok(!saved.error, `saving an act answers with the book, not ${saved.error}`);
  assert.strictEqual(actIn(saved)?.summary, 'Aldis pawns the key to Marek. The vault is under the waterline.',
    'the act reads back with the text the writer typed');
  assert.strictEqual(actIn(saved)?.title, 'The debt', 'and the title the writer typed');
  const sent = await promptOf();
  assert.match(sent, /Ch1-2 The debt: Aldis pawns the key to Marek/,
    'the edited act is what the writing prompt sends');
  assert.doesNotMatch(sent, /borrows against the key/, 'and the old text is not also sent');

  // EMPTY IS REFUSED, and points at the one way to remove an act. Whitespace is empty too: a
  // blank act would reach the model as a heading with nothing under it.
  const blank: any = routes['POST /api/arc'](ctx(alice, { storyId: book.id, id: act,
    title: 'Gone', summary: '  \n ' }));
  assert.match(blank.error ?? '', /remove/i, 'an empty act is refused, and the refusal points to Remove');
  // The view the route serves, read without the route: `GET /api/story` also prewarms the live
  // model, and nothing in this file may reach the router.
  const after: any = (await import('../src/story.ts')).view(book.id);
  assert.strictEqual(actIn(after)?.summary, 'Aldis pawns the key to Marek. The vault is under the waterline.',
    'and the refused save changed nothing');
  assert.strictEqual(actIn(after)?.title, 'The debt', 'not even the title that rode with it');

  // ANOTHER WRITER'S ACT, under his own story id. The gate passes this — the story IS his — so the
  // route is the whole defence.
  const hijack: any = routes['POST /api/arc'](ctx(bob, { storyId: bStory.id, id: act,
    title: 'BOB', summary: 'BOB WAS HERE' }));
  assert.ok(hijack.error, "bob cannot edit alice's act by naming his own book");
  assert.doesNotMatch(await promptOf(), /BOB WAS HERE/, "and alice's prompt does not carry his words");
  ok('an act is edited in place, an empty one is refused, and only in its own book');
}

// AN ACT SAYS WHEN IT IS OUT OF DATE (#47). Asserted on the view the routes answer with and on the
// prompt, never on the row. `summarise()` ends in `db.setSummary` with the prose fingerprint, so
// `resum` below is a re-run without the model call in front of it.
{
  const ctx = (owner: string, body: any = {}) => ({ body, query: new URLSearchParams(), owner,
    slot: { global: 40_000, slots: 1, perSlot: 40_000 }, gen: { max_tokens: 900 }, setGen: () => {},
    defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
  const { view } = await import('../src/story.ts');
  const book = db.createStory(alice, { title: 'Alice, out of date' });
  const ch1 = book.chapterId;
  db.addPassage({ storyId: book.id, branchId: book.branchId, chapterId: ch1, body: 'Aldis took the key.' });
  const ch2 = db.endChapter(book.id, book.branchId, 'The Water').opened;
  db.addPassage({ storyId: book.id, branchId: book.branchId, chapterId: ch2, body: 'The vault flooded.' });
  db.endChapter(book.id, book.branchId);
  db.endChapter(book.id, book.branchId);
  const resum = (chId: string, text: string) => {
    const ps = db.passagesOfChapter(chId);
    db.setSummary(chId, text, ps.at(-1).ordinal, db.proseHash(ps.map((p: any) => p.body)));
  };
  resum(ch1, 'Aldis takes the key from Marek.');
  resum(ch2, 'The vault floods.');
  const act = db.addArc(book.id, { branchId: book.branchId, fromChapter: 1, toChapter: 2,
    title: 'Key to Water', summary: 'Aldis takes the key and the vault floods.' });
  const actIn = (v: any) => (v.arcs ?? []).find((a: any) => a.id === act);

  assert.strictEqual(actIn(view(book.id)).outOfDate, null, 'a fresh act is not out of date');

  resum(ch2, 'The vault holds, for now.');
  const changed = actIn(view(book.id)).outOfDate;
  assert.strictEqual(changed?.chapter, 2, 're-summarising a chapter under the act puts it out of date');
  assert.strictEqual(changed?.title, 'The Water', 'and the act names that chapter');
  const sent = (await routes['POST /api/manifest'](ctx(alice, { storyId: book.id, mode: 'continue' })) as any).prompt;
  assert.match(sent, /Aldis takes the key and the vault floods/, 'an out-of-date act still reaches the model');

  // THE WAITING LIST carries it, and a dismissal is "not for this": keyed on the act and what its
  // chapters say now, so the next change brings it back.
  const waitingFor = (v: any) => (v.waiting.acts ?? []).find((a: any) => a.id === act);
  const listed = waitingFor(view(book.id));
  assert.strictEqual(listed?.chapter, 2, 'an out-of-date act is on the waiting list, naming the chapter');
  const quiet: any = routes['POST /api/dismiss'](ctx(alice, { storyId: book.id, kind: 'act', ref: listed.ref }));
  assert.ok(!waitingFor(quiet), 'waving it away takes it off the waiting list');
  resum(ch2, 'The vault holds, and then it does not.');
  assert.ok(waitingFor(view(book.id)), 'and the next change to that chapter brings it back');

  const saved: any = routes['POST /api/arc'](ctx(alice, { storyId: book.id, id: act,
    title: 'Key to Water', summary: 'Aldis takes the key. The vault holds, for now.' }));
  assert.strictEqual(actIn(saved).outOfDate, null, 'saving the act by hand clears out of date');
  assert.ok(!waitingFor(saved), 'and takes it off the waiting list');

  // THE OTHER CAUSE: the chapter's prose moves under its summary, so it is stale. A hand save of the
  // act does not clear this one -- the act can be vouched for, the chapter under it cannot.
  db.addPassage({ storyId: book.id, branchId: book.branchId, chapterId: ch1, body: 'He gave it back.' });
  const stale = actIn(view(book.id)).outOfDate;
  assert.deepStrictEqual([stale?.chapter, stale?.why], [1, 'stale'], 'a stale chapter under the act puts it out of date');
  ok('an act is out of date when a chapter under it changed, still reaches the model, and a hand save clears it');
}

// A real server, because the gate is four lines inside serve.ts's request handler and testing a
// copy of it would prove a copy. Spawned as a child on a spare port against this database, as
// the OTHER writer.
/** BOOT A REAL SERVER, AND SAY SO IF IT DID NOT.
 *
 *  This file spawned throwaway servers with `stdio: 'ignore'` and a wait loop that gave up after
 *  ~10s without a word, so a child that died at boot arrived as a bare `TypeError: fetch failed /
 *  ECONNREFUSED 127.0.0.1:5187` forty lines into the run. It cost time twice on 2026-09-01, and
 *  the second time was worse than the first, because a scope failure is the one failure in this
 *  project you are told to distrust — `.claude/CLAUDE.md` says a stray server on one of these
 *  ports reads exactly like the ownership gate being broken. A harness that cannot tell you which
 *  it is fails the project's own fail-loud rule inside the file that enforces it.
 *
 *  BOTH CAUSES ARE THE SAME SHAPE and neither was visible: back-to-back runs leave the previous
 *  child holding the port, the new one dies with `EADDRINUSE`, and nothing is listening. Now the
 *  child's own stderr comes back with the refusal.
 *
 *  It waits for the port and then asserts it, rather than proceeding on hope. */
const { spawn } = await import('node:child_process');

/** IS ANYTHING ALREADY ON THIS PORT — asked BEFORE spawning, which is the only place it can be
 *  answered without a race.
 *
 *  `.claude/CLAUDE.md` documents this failure and even names the symptom: *"a real one answers 200
 *  where the fixture expects 403, which reads exactly like the gate being broken."* That is what it
 *  does. Reproduced deliberately on 2026-09-01 by squatting 5188: the suite reported `200 !== 403`
 *  from the allowlist block and said nothing about the port.
 *
 *  CHECKING THE CHILD AFTERWARDS CANNOT WORK, and that was the first attempt. A squatter answers
 *  the health check in under a millisecond, so the loop succeeds before the child has finished
 *  starting Node — `srv.exitCode` is still null, the `EADDRINUSE` has not happened yet, and every
 *  assertion below then runs against the stranger. Asking first has no timing in it at all. */
async function assertPortFree(port: number) {
  const { connect } = await import('node:net');
  const taken = await new Promise<boolean>((done) => {
    const c = connect({ port, host: '127.0.0.1' });
    const end = (v: boolean) => { c.destroy(); done(v); };
    c.setTimeout(600, () => end(false));
    c.on('connect', () => end(true));
    c.on('error', () => end(false));
  });
  assert.ok(!taken, `something is already listening on 127.0.0.1:${port}, so this suite cannot boot `
    + `its own server there and nothing below would test the gate. A real server answers 200 where `
    + `these fixtures expect 403, which reads exactly like the ownership gate being broken — see `
    + `.claude/CLAUDE.md. Find it with \`ss -ltnp | grep ${port}\` and stop it. This suite owns `
    + `5187, 5188, 5189, 5190, 5194, 5195 and 5196 while it runs.`);
}

async function bootServer(port: number, env: Record<string, string>) {
  await assertPortFree(port);
  const srv = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, ANANSI_PORT: String(port), ANANSI_DB: '/tmp/anansi-scope.db',
           ANANSI_USER: 'bob', ANANSI_LLAMA_UNIT: 'anansi-test-nonexistent.service', ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let cry = '';
  srv.stderr?.on('data', (d) => { cry += d; });
  const url = `http://127.0.0.1:${port}`;
  /* 40 SECONDS, NOT 10, AND THE EXTRA THIRTY ARE A DIAGNOSIS RATHER THAN A CUSHION.
   *
   * This read `i < 40` with a 250 ms sleep — ten seconds — and produced an intermittent
   * "no server came up on 5187" five times between 2026-09-02 and 2026-09-06. It was written down
   * three times as an unexplained flake and it reads exactly like the ownership gate failing, which
   * is the most expensive way for a check to be wrong in this repo.
   *
   * What settles it: the branch above this one tests `srv.exitCode !== null` FIRST and never fired.
   * The child was alive every time. It had not crashed, it had not hit EADDRINUSE, its stderr was
   * empty — it was still starting. And every one of the five happened under CPU load: after another
   * suite in a sequential loop, and finally inside `test/all.ts` itself on the run that added the
   * sixteen bench checks and took it to twenty-eight parallel node processes. Never once alone.
   *
   * Boot is not free: node parses ~200 KB of TypeScript with no build step, and `serve.ts` makes an
   * HTTP call to the router for the slot size before it listens. Ten seconds is comfortable on an
   * idle box and is not a bound on a busy one.
   *
   * THIS COSTS NOTHING WHEN THE SERVER IS HEALTHY. The loop exits on the first successful fetch, so
   * a normal boot still returns in about a second; the only thing that got longer is how patient a
   * genuine failure is before it reports, and 40 s of patience is cheaper than one more morning
   * spent looking at an ownership gate that was never broken. */
  let up = false;
  for (let i = 0; i < 160; i++) {
    try { await fetch(url + '/', { signal: AbortSignal.timeout(500) }); up = true; break; }
    catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  // TWO WAYS TO FAIL, and the second is the one that actually happened. Nothing answering is the
  // obvious case. The other is that the port answers and OUR SERVER IS NOT WHAT ANSWERED — a
  // leftover child from a back-to-back run, or a scratch server on one of these ports. The health
  // check cannot tell those apart, because a squatter replies too; the child's exit code can, and
  // an `EADDRINUSE` death is exactly what it reports. Every assertion below would otherwise run
  // against a stranger's server and read as the ownership gate being broken.
  const why = `Check the port first — \`ss -ltn | grep ${port}\` — and remember .claude/CLAUDE.md: `
    + `a stray server on one of these ports reads exactly like the gate failing. The child said:\n`
    + `${cry.trim() || '(nothing)'}`;
  // A late death — the port was free, the child started and then failed anyway. This cannot catch
  // a squatter (see `assertPortFree` for why), and it is not trying to.
  if (srv.exitCode !== null) {
    assert.fail(`the server for port ${port} died at boot (exit ${srv.exitCode}), so nothing below `
      + `tests the gate. ${why}`);
  }
  if (!up) {
    srv.kill();
    assert.fail(`no server came up on ${port} in 40s, so nothing below tests the gate. ${why}`);
  }
  return { srv, url };
}

{
  const PORT = 5187;
  const { srv, url } = await bootServer(PORT, {});
  const post = (path: string, body: unknown) => fetch(url + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
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

    // An act save, #44's route, aimed at alice's book. Her act is created here rather than found,
    // so the refusal below is a refusal of a real act and not of an id that never existed.
    const herAct = db.addArc(aStory.id, { branchId: aStory.branchId, fromChapter: 1, toChapter: 1,
      title: 'Hers', summary: 'What alice wrote down.' });
    const actSave = await post('/api/arc', { storyId: aStory.id, id: herAct, summary: 'BOB WAS HERE' });
    assert.strictEqual(actSave.status, 404, "an act save must refuse another writer's story id");
    assert.strictEqual(db.arcsOf(aStory.id).find((a: any) => a.id === herAct)?.summary,
      'What alice wrote down.', 'and her act is unchanged');
    db.delArc(aStory.id, herAct);

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
  const boot = (port: number, allow: string) => bootServer(port, { ANANSI_ALLOW: allow });

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

  // AND A FORWARDED HEADER FAILS CLOSED. Loopback is the desk, and the day anything fronts this —
  // Caddy on 443 for a port-free name — every request arrives from 127.0.0.1 and the second writer
  // resolves to Seth: her library replaced by his, admin true, the allowlist never consulted, and
  // nothing logged. It is the identity layer going blind, and nothing looks broken. Nothing on a
  // tailnet sends these headers, so this is inert today and is the whole difference on the day it
  // is not. The control is the SAME server answering 200 without the header.
  const front = await boot(5190, 'someone@example.test=bob');
  try {
    assert.strictEqual((await fetch(front.url + '/api/stories')).status, 200,
      'the desk is let in on its own machine — the control for the three below');
    for (const h of ['X-Forwarded-For', 'X-Real-IP', 'Forwarded']) {
      assert.strictEqual((await fetch(front.url + '/api/stories', { headers: { [h]: '10.0.0.9' } })).status,
        403, `${h} on a loopback request must fail closed, not resolve to the desk`);
    }
  } finally { front.srv.kill(); }

  ok('a proxy header on a loopback request fails closed rather than handing over the desk');
}

// Who may stop the router, and whose model a switch lands on. Both are the same lesson: the gate
// answers "is this your story", and neither of these questions is that one.
{
  const boot = async (port: number, admin: string) => {
    const { srv, url } = await bootServer(port, { ANANSI_ADMIN: admin });
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

// ---- A NEW CARD'S DESCRIPTION LANDS IN `facts`, NOT IN THE BODY (issue #39, 2026-09-01).
//
// Seth: "On story creation facts should be filled in [not] info since info is what anansi uses to
// update the character. Facts are basically ever green."
//
// The chapter-end pass REWRITES the body and has never been able to touch a room, so a cast written
// into the body at creation is a cast whose description chapter one overwrites — the exact defect
// `facts` was added for. Driven through the real route, because the move happens there and not in db.
{
  // Its own ctx: the helper above lives inside the previous block and builds no query, and
  // GET /api/story needs one.
  const ctx = (owner: string, body: any = {}, query = '') => ({ body,
    query: new URLSearchParams(query), owner,
    slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
    defaultModel: null, setDefaultModel: () => {}, admin: false }) as any;
  const cast = [
    { title: 'Aldis Fen', entryType: 'character', activation: 'always_on', keys: [], lastEditor: 'human',
      body: '[Aldis Fen: 34, ex-Watch sergeant, owes Marek eleven crowns]' },
    // ALREADY CARRIES ITS OWN facts — a book forged elsewhere may have written one on purpose, and
    // the body must not silently replace it.
    { title: 'Marek Vale', entryType: 'character', activation: 'always_on', keys: [], lastEditor: 'human',
      body: '[Marek Vale: a moneylender]',
      rooms: { facts: { body: '[Marek Vale: patient, never raises her voice]' } } },
  ];
  const book: any = routes['POST /api/stories'](ctx(alice, { title: 'Facts At Birth', entries: cast }));
  const v: any = routes['GET /api/story'](ctx(alice, {}, `story=${book.id}`));

  const aldis = v.entries.find((e: any) => e.title === 'Aldis Fen');
  assert.ok(aldis, 'the cast was written');
  assert.strictEqual(String(aldis.body ?? '').trim(), '',
    'Info is left EMPTY, so the first chapter-end update has nothing to overwrite');
  const factsOf = (e: any) => (e.addons ?? []).filter((a: any) => a.slot === 'facts')
    .map((a: any) => String(a.body ?? '').trim());
  assert.deepStrictEqual(factsOf(aldis), ['[Aldis Fen: 34, ex-Watch sergeant, owes Marek eleven crowns]'],
    'and the description is in facts, which no pass rewrites');

  // The one that brought its own keeps it, and its body is NOT moved on top of it.
  const marek = v.entries.find((e: any) => e.title === 'Marek Vale');
  assert.deepStrictEqual(factsOf(marek), ['[Marek Vale: patient, never raises her voice]'],
    'an explicit rooms.facts wins over the body — a paste does not lose what it carried');
  assert.strictEqual(String(marek.body ?? '').trim(), '[Marek Vale: a moneylender]',
    'and that entry keeps its body, because nothing was moved out of it');

  ok('a new cast lands in facts, Info stays empty, and an explicit facts is not overwritten (#39)');
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
  // The Direct template's opening line, which Seth reworded on 2026-09-01 — "Re write what happens
  // based on this:" — because this one string is also every re-roll of a directed passage, which is
  // exactly what this assertion is about. Matched loosely on the directive plus the words around it
  // rather than on the whole sentence: the point here is that the instruction reaches the template
  // that carries it, not what that template's first line says this week.
  assert.match(m1.prompt, /based on this: have him lose his nerve/,
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

  /* THE WHOLE PROMPT, NOT JUST THE DIRECTIVE — and this is the assertion the 2026-09-18 bug needed.
   *
   * A re-roll of passage N is assembled from the passages BEFORE N, so the take being replaced is
   * not in the prompt. From 2026-09-01 the instruction that rode with it was a wording of its own,
   * "Write this passage again" — naming a passage that had just been cut out. The model answered
   * the only way it could: it rewrote N-1, the last passage it could see. In a book where the
   * writer narrates and the model answers, Regenerate handed her back her own paragraph.
   *
   * So the rule is now a thing that can be checked rather than a wording that has to be judged:
   * THE PROMPT A RE-ROLL SENDS IS THE PROMPT THAT WROTE THE PASSAGE. Build both and compare them.
   * The composer is deliberately showing a DIFFERENT mode here — that is what used to leak in. */
  const asked = db.addPassage({ storyId: aStory.id, branchId: aStory.branchId,
    chapterId: aStory.chapterId, body: 'The hall is cold.', author: 'human', mode: 'narrate' })!;
  const first: any = await routes['POST /api/manifest'](ctx(alice,
    { storyId: aStory.id, mode: 'narrate' }));
  const answer = db.addPassage({ storyId: aStory.id, branchId: aStory.branchId,
    chapterId: aStory.chapterId, body: 'She does not answer.', author: 'model', mode: 'narrate' })!;
  const again: any = await routes['POST /api/manifest'](ctx(alice,
    { storyId: aStory.id, regenerateOf: answer, mode: 'continue' }));
  assert.strictEqual(again.prompt, first.prompt,
    'a re-roll must send the prompt that wrote the passage, to the byte');
  assert.doesNotMatch(again.prompt, /Carry the scene forward/,
    "the composer's mode must not leak into a re-roll — the passage decides");
  assert.doesNotMatch(again.prompt, /She does not answer/,
    'and the take being replaced stays out of it, or the re-roll is written against itself');

  /* THE FAILURE ITSELF, stated as its own assertion so it cannot come back quietly: no instruction
   * may point at the passage being re-rolled, because that passage is the one thing the prompt
   * does not have. "The passage above" and "the last passage" are fine — those are in it. */
  assert.doesNotMatch(again.prompt, /this passage again/i,
    'no instruction may name the passage a re-roll leaves out');

  /* A SPOKEN PASSAGE KEEPS ITS SPEAKER, and the request here does not send one — it comes off the
   * row, with the mode and the directive, because those are the three `addVariant` copies onto a
   * take. A re-roll of dialogue that forgets who is talking writes the wrong mouth. */
  const said = db.addPassage({ storyId: aStory.id, branchId: aStory.branchId,
    chapterId: aStory.chapterId, body: '"Not tonight."', author: 'model', mode: 'speak',
    speaker: 'Halsey' })!;
  const m5: any = await routes['POST /api/manifest'](ctx(alice,
    { storyId: aStory.id, regenerateOf: said, mode: 'continue' }));
  assert.match(m5.prompt, /Halsey/, 'it still says who is talking, with no speaker in the request');

  /* AND THE PANEL SHOWS WHAT WILL BE SENT. `POST /api/manifest` builds the prompt the Context panel
   * draws and `generate` builds the one that goes out; the rule lived in `generate` alone at first,
   * so the panel previewed a prompt the writer would not get. One helper answers both now — this is
   * the assertion that caught it, and it is why the speaker above had to be read here too. */
  assert.match(again.manifest.blocks.find((b: any) => b.kind === 'MODE')?.reason ?? '', /mode:narrate/,
    'and the manifest names the instruction it used, so the panel can say so');

  db.delSlot(aStory.id, steered);
  db.delSlot(aStory.id, asked);
  db.delSlot(aStory.id, answer);
  db.delSlot(aStory.id, said);
  ok('a reroll re-runs the instruction that made the passage, and only that passage');
}

// ---- THE DEMO SWITCH RESOLVES TO ONE ACCOUNT AND CANNOT BE AIMED (2026-08-31) ----
//
// Seth: "can we do the demo account as a switch in my menu both accounts should be able to reach
// it." It is the only thing in this app that serves a request as somebody other than the writer who
// made it, so it is the only thing that has to be proved incapable of being pointed anywhere else.
//
// The gate lives in serve.ts and the two-owner section above exercises it over HTTP. What is
// decidable HERE is the contract: the route carries a boolean and nothing else, so there is no
// account name on the wire to aim.
{
  const demo = db.owner('demo');
  const dStory = db.createStory(demo, { title: "The demo's book" });

  let asked: boolean | null = null;
  const dctx = (body: any) => ({ body, query: new URLSearchParams(), owner: alice, admin: false,
    demo: false, setDemo: (on: boolean) => { asked = on; },
    slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {} }) as any;
  routes['POST /api/demo'](dctx({ on: true, account: 'bob', owner: bob, login: 'bob' }));
  assert.strictEqual(asked, true, 'the switch is set from `on` alone');
  // AND NOTHING ELSE IN THE BODY REACHED ANYTHING. If a later edit reads an account off the
  // request, this is the assertion that has to be deleted to let it through.
  assert.match(String(routes['POST /api/demo']), /setDemo\(!!c\.body\.on\)/,
    'the handler reads `on` and no other field');

  // Being the demo account is still being ONE account, gated like everybody else.
  assert.ok(!db.ownsStory(aStory.id, demo), "the demo account does not own Alice's book");
  assert.ok(!db.ownsStory(dStory.id, alice), "and Alice does not own the demo's");
  assert.ok(db.ownsStory(dStory.id, demo), 'the demo account owns its own');

  // It is a library, not a role. serve.ts computes `admin` from the REAL identity, and that is
  // asserted at the source because it cannot be reached from here.
  const serve = readFileSync(new URL('../serve.ts', import.meta.url), 'utf8');
  assert.match(serve, /admin: REAL === db\.owner\(ADMIN\)/,
    'admin is decided by the real writer, never by the account being looked at');
  assert.doesNotMatch(serve, /admin: OWNER === db\.owner\(ADMIN\)/, 'and not by the borrowed one');
/* A THREAD'S PICTURE IS SCOPED TO ITS BOOK (2026-09-01). Seth: "lets add an optional image field."
 *
 * The gate already refuses another writer's storyId, so what is left to prove is the half INSIDE a
 * book you do own: a thread id from a DIFFERENT book must not be given a picture through this one,
 * and must not be readable through it either. `entry_images` is keyed (entry_id, story_id) for
 * exactly that, the same composite chapter_pins and entry_states use to close SPEC 7.1's leak.
 */
{
  const mine = db.upsertEntry(aStory.id, alice, { title: 'Alice thread', body: '[hers]' })!;
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');

  const okSet: any = routes['POST /api/entry/image'](ctxI(alice, { storyId: aStory.id, id: mine, dataUrl: jpeg }));
  assert.ok(okSet?.entryImages?.[mine], 'a thread in your own book takes a picture');

  // BOB'S THREAD, THROUGH ALICE'S BOOK. The gate lets this through — alice owns the storyId she
  // named — so the refusal has to come from the scope on the write.
  const bEntry = db.upsertEntry(bStory.id, bob, { title: 'Bob thread', body: '[his]' })!;
  assert.throws(() => routes['POST /api/entry/image'](ctxI(alice,
    { storyId: aStory.id, id: bEntry, dataUrl: jpeg })), /not in this book/,
    "a thread from another book cannot be given a picture through one you own");
  assert.strictEqual(db.entryImageAt(bStory.id, bEntry), null, 'and nothing was written for it');

  // NOR READ. Asking for alice's picture with bob's story id must 404 rather than serve the bytes.
  assert.throws(() => routes['GET /api/entry/image'](
    ctxI(alice, {}, `story=${bStory.id}&entry=${mine}`)), /no picture/,
    "a picture is not reachable through another book's id");
  ok("a thread's picture belongs to its own book, on the write and on the read");

  /* AND THE CROSS-STORY THREADS PAGE CARRIES IT, from its own data. Seth, 2026-09-01: "in all thread
   * views i should be able to see it in the top."
   *
   * That page spans the shelf, so it cannot read `V.entryImages` — one book's view — and
   * `GET /api/ledger` has to hand a stamp per row. Keyed by BOTH ids, because `entry_images` is: a
   * followed thread has a picture in the book it lives in and the same id in the follower does not.
   *
   * ASSERTED THROUGH THE ROUTE. The client half is checked in `test/app.ts` against a fixture that
   * supplies `imageAt` directly — so deleting the mapping HERE left that green, which is what a
   * falsification pass found. This is the assertion that goes red for it.
   *
   * And owner-scoped, like the rest of this file: bob's page must not name alice's picture. */
  {
    const page: any = routes['GET /api/ledger'](ctxI(alice, {}, ''));
    const row = page.entries.find((x: any) => x.id === mine);
    assert.ok(row, "alice's thread is on her own cross-story page");
    assert.strictEqual(row.imageAt, db.entryImageAt(aStory.id, mine),
      'and carries the stamp the picture was set at, so the page can build the URL');
    const bare = page.entries.find((x: any) => x.id !== mine && !x.imageAt);
    assert.ok(bare, 'a thread with no picture carries no stamp rather than a zero');

    const his: any = routes['GET /api/ledger'](ctxI(bob, {}, ''));
    assert.ok(!his.entries.some((x: any) => x.id === mine),
      "and another writer's page does not list her thread at all, let alone its picture");
    ok('the cross-story Threads page carries each picture stamp, and only the writer\'s own');
  }
}

/* ACCEPTING A PULLED CARD WRITES ITS ROOMS, AND THEY REACH THE MODEL (2026-09-02).
 *
 * A card pulled off the web arrives with its rooms on the proposal — see `proposals.rooms` — and
 * they are written in the press that accepts the card, because a room needs an entry to belong to.
 *
 * THIS TEST EXISTS BECAUSE THE FEATURE SHIPPED BROKEN. The rooms were stored and I checked that;
 * the accept path referenced a variable that was never declared, and the route's own catch turned
 * the crash into `{"error":"made is not defined"}` — AFTER `upsertEntry` had already created the
 * entry. So a pulled card arrived with no rooms, its proposal stayed open, and it read to the
 * writer as "the rooms are not pulled" rather than as a fault. Seth found it in the app.
 *
 * NO MODEL AND NO SEARCH. The proposal is written straight into the database with the shape the
 * pull produces, which is the whole point: the half that broke is deterministic, and testing it
 * needed neither of the two things that made it look expensive to test.
 */
{
  const st = db.createStory(alice, { title: 'A book to pull into' }) as any;
  const chapter = (db.chapters(st.id)[0] as any).id;
  db.addProposal(st.id, { chapterId: chapter, kind: 'new', entryType: 'character',
    title: 'Ferrus Manus', body: '[Ferrus Manus: Primarch of the Iron Hands]', keys: ['Medusa'],
    source: ['https://warhammer40k.fandom.com/wiki/Ferrus_Manus'],
    rooms: { appearance: 'Hands of living metal to the elbow',
             history: 'Raised on Medusa, later known as the Headless' } });
  const pp: any = db.proposalsOf(st.id).find((x: any) => x.title === 'Ferrus Manus');
  assert.ok(pp, 'the proposal is there to accept');
  assert.ok(pp.rooms, 'and it carries its rooms');

  const r = await routes['POST /api/proposal'](ctxI(alice, { storyId: st.id, id: pp.id, accept: true }));
  /* WHAT A RED LOOKS LIKE HERE: this route is synchronous, so the bug it was written for makes the
   * SUITE DIE — "ReferenceError: made is not defined" at the route's own line — rather than failing
   * an assertion. Verified by reverting the declaration on 2026-09-02. In the running server that
   * same throw becomes `{"error":"made is not defined"}`, because serve.ts catches it, which is
   * exactly how the fault stayed quiet: an error string reads like a route that declined.
   * The assertion below is for the other shape — a route that returns an error rather than throws. */
  assert.ok(!(r as any)?.error, `accepting must not error: ${(r as any)?.error}`);

  const card: any = db.entriesOf(st.id).find((e: any) => e.title === 'Ferrus Manus');
  assert.ok(card, 'accepting writes the card');
  const rooms = (db.addonsOf(st.id) as any[]).filter((a) => a.entry_id === card.id);
  assert.deepStrictEqual(rooms.map((a) => a.slot).sort(), ['appearance', 'history'],
    'and both rooms it arrived with, and only those');
  assert.match(rooms.find((a) => a.slot === 'appearance').body, /living metal/,
    'with the text the pull found');
  // AND SWITCHED ON. A room with no trigger words that nobody pinned reaches no prompt at all —
  // the room-proposal branch beside this one says so in as many words. A pulled room has no keys,
  // so without this it would sit on the card looking filled in and be invisible to every call.
  assert.deepStrictEqual(rooms.map((a) => !!a.active), [true, true],
    'and both are on, or the card looks filled in and reaches the model with none of it');
  assert.strictEqual((db.proposal(st.id, pp.id) as any).status, 'accepted',
    'and the proposal is closed, which a mid-accept throw would have left open');
  db.delStory(st.id);
  ok('accepting a pulled card writes its rooms, switched on, and closes the proposal');
}

/* THE IMAGE PROXY REFUSES WHAT IT MUST (2026-09-01). Seth asked for image search on covers and
 * threads; an arbitrary image on the web sends no CORS header, so the browser cannot read its bytes
 * and the SERVER has to fetch it. That is an SSRF shape: the client names a URL and this process
 * fetches it, which reaches what a browser cannot — loopback, the cloud metadata address, a printer.
 *
 * Both writers here are trusted and the guard is still tested, because "the only clients are trusted"
 * is a sentence that stops being true quietly.
 *
 * THE LITERAL-ADDRESS CEILING IS REAL and stated at `isPrivateHost`: a NAME that resolves to
 * 127.0.0.1 passes this. Closing it needs DNS before the fetch and still races. What is asserted is
 * that the whole easy class is shut.
 */
{
  const priv = ['127.0.0.1', 'localhost', '10.0.0.5', '172.16.3.4', '192.168.1.1',
                '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', 'nas.local',
                '0.0.0.0', '224.0.0.1'];
  const open = ['example.com', '8.8.8.8', '172.32.0.1', 'images.squarespace-cdn.com', '1.1.1.1'];
  const wrongPriv = priv.filter((h) => !isPrivateHost(h));
  const wrongOpen = open.filter((h) => isPrivateHost(h));
  assert.deepStrictEqual(wrongPriv, [], `these must be refused as not on the web: ${wrongPriv}`);
  assert.deepStrictEqual(wrongOpen, [], `these are ordinary hosts and must be allowed: ${wrongOpen}`);
  ok(`the image proxy refuses ${priv.length} private address shapes and allows ${open.length} real ones`);
}

  ok('the demo switch reaches exactly one account, grants nothing, and cannot be aimed');
}

/* A MISSING STATIC FILE MUST NOT KILL THE PROCESS (2026-09-02).
 *
 * `serve.ts` matched /^\/(web\/)?[\w.-]+\.(js|css|svg|webmanifest)$/, wrote a 200, and read the
 * file afterwards — so a path that matched the pattern and was not on disk threw ENOENT with the
 * headers already gone. The catch then tried to send a 500 over them, which throws INSIDE the catch,
 * which nothing catches: the process exited. `/app.js` did it, when the file is at `/web/app.js`.
 *
 * SO IT IS AN UNAUTHENTICATED DENIAL OF SERVICE, not a cosmetic 500: one GET from anything that can
 * reach the port — a crawler, a link preview, a bookmark from before a file moved — took the app
 * down for both writers, and only systemd's Restart=on-failure brought it back. Found by a curl for
 * the wrong path seconds after a restart; the journal has it as ERR_HTTP_HEADERS_SENT.
 *
 * ASSERTED AS "AND THEN IT ANSWERED AGAIN", which is the only form that catches this. A check that
 * read the status of the bad request alone would pass against the broken server too: the socket
 * closes with the 200 header already written, and `fetch` reports that as a network error rather
 * than as a status — so the shape of the bug is invisible until you ask the server a SECOND
 * question and find nobody there.
 */
{
  const PORT = 5196;
  const { srv, url } = await bootServer(PORT, {});
  try {
    const bad = ['/app.js', '/nope.css', '/web/missing.js', '/gone.webmanifest'];
    const codes: string[] = [];
    for (const path of bad) {
      try { codes.push(String((await fetch(url + path)).status)); }
      catch (e: any) { codes.push(`threw: ${e?.cause?.code ?? e?.message}`); }
    }
    assert.deepStrictEqual(codes, ['404', '404', '404', '404'],
      `a static path with no file behind it answers 404: got ${codes.join(', ')}`);
    // THE POINT OF THE WHOLE BLOCK. Still serving, after four of them.
    const alive = await fetch(url + '/api/stories');
    assert.strictEqual(alive.status, 200,
      'and the server is still up afterwards — a missing file must not end the process');
    assert.strictEqual(srv.exitCode, null, 'the child has not exited');
    // And a file that IS there still comes back, so the fix did not shut the door on everything.
    const real = await fetch(url + '/web/app.js');
    assert.strictEqual(real.status, 200, 'a real static file still answers 200');
    assert.match(real.headers.get('cache-control') ?? '', /no-cache/,
      'and keeps its no-cache header, which is what makes an edit live without a restart');
    ok('a missing static file is a 404, not the end of the process');

    /* AND IT IS COMPRESSED, both ways round. `fetch` decodes gzip transparently and can hide the
     * header while doing it, so this asks over raw http and reads the bytes off the socket — the
     * only way to see what actually crossed the wire.
     *
     * BOTH DIRECTIONS, because a one-sided check here is the failure this repo keeps finding: a
     * server that gzipped unconditionally would pass "the gzip arm is smaller" and be broken for
     * any client that did not ask. So the identity arm asserts the bytes are the file's own length
     * AND that no Content-Encoding rides on it.
     *
     * Falsified three ways before it was believed: returning `res.end(body)` from the gzip branch
     * turns the first assertion red, dropping the accept-encoding guard turns the identity pair
     * red, and dropping Vary turns the last one red. */
    const raw = (enc: string | null) => new Promise<{ h: any; n: number }>((done, fail) => {
      const req = httpGet(`${url}/web/app.js`,
        { headers: enc ? { 'accept-encoding': enc } : {} }, (r: any) => {
          let n = 0; r.on('data', (c: any) => { n += c.length; });
          r.on('end', () => done({ h: r.headers, n }));
        });
      req.on('error', fail);
    });
    const onDisk = readFileSync(new URL('../web/app.js', import.meta.url)).length;
    const zip = await raw('gzip');
    assert.strictEqual(zip.h['content-encoding'], 'gzip', 'app.js is gzipped for a client that asks');
    assert.ok(zip.n < onDisk / 2,
      `and the compressed body is under half the file: ${zip.n} against ${onDisk} on disk`);
    const plain = await raw('identity');
    assert.strictEqual(plain.h['content-encoding'], undefined,
      'a client that did not ask for gzip is not sent gzip');
    assert.strictEqual(plain.n, onDisk, 'it gets the file whole');
    assert.strictEqual(zip.h.vary, 'Accept-Encoding',
      'and Vary rides on both, or a cache hands the wrong body to the wrong client');
    assert.strictEqual(plain.h.vary, 'Accept-Encoding', 'on the identity answer too');
    ok(`app.js crosses the wire gzipped — ${zip.n} bytes against ${onDisk}`);
  } finally { srv.kill(); }
}

console.log(`\n${n} checks passed`);
