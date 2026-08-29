// The character memory: what a chapter did to the people in it, as proposals.
//
// Driven against a FAKE llama-server, because what is under test is what the model is SHOWN and what
// is done with what it says — neither of which the real model can be asked for reliably.
//
//   node --experimental-strip-types test/memory.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-memory.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

const BEFORE = 'Vel is the Murmur. Grey eyes, a voice that carries. She trusts Aldis without asking why.';
const AFTER  = 'Vel is the Murmur. Grey eyes, a voice that carries. Her left arm is broken at the wrist, '
             + 'strapped and useless. She no longer trusts Aldis.';
const SPOKEN = 'I never trusted him';       // said aloud, and therefore not canon
const NARRATED = 'The wrist gave under the weight and she did not cry out.';

let asked: any = null;
/** What the fake returns. A name that matches nobody is how the "never invent" check is driven. */
let answer: any[] = [{ name: 'Vel', body: AFTER, label: 'arm broken, trust gone' }];
/** And what the EXTRACT role returns. One fake, two roles: `remember` reads `characters` and
 *  `extract` reads `entries`, so returning both keys serves whichever one asked. */
let found: any[] = [{ title: 'The Wrist Strap', body: 'Leather, cut from a saddle girth.',
                      type: 'item', keys: ['strap'] }];
/** And what the RETIRE role returns. Third key on the same blob, for the same reason: one fake
 *  server, and whichever role asked reads the key it wants. `card` is an enum in the real schema,
 *  built from the candidates the route offers — so a name that is not among them is how the gate
 *  is driven from the far side. */
let finished: any[] = [];

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o)); };
    if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });
    asked = { system: b.messages?.[0]?.content ?? '', user: b.messages?.[1]?.content ?? '' };
    send({ choices: [{ message: { content: JSON.stringify({ characters: answer, entries: found,
                                                            finished }) } }],
           usage: { prompt_tokens: 200, completion_tokens: 60 } });
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { resolveBody } = await import('../src/context.ts');

const me = db.owner('rememberer');
const story = db.createStory(me, { title: 'Sutera', premise: 'A city on a dead god.' });
const vel = db.upsertEntry(story.id, me, { title: 'Vel', body: BEFORE, entryType: 'character' });
db.upsertEntry(story.id, me, { title: 'The Long Stair', body: 'A stair with no landing.', entryType: 'lore' });
db.addPassage({ ...story, storyId: story.id, body: `${NARRATED} "${SPOKEN}," she said.` });

const chapterId = (db.chapters(story.id)[0] as any).id;

const ctx = (body: any) => ({ body, query: new URLSearchParams(), owner: me,
  slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: { max_tokens: 400 }, setGen: () => {},
  defaultModel: null, setDefaultModel: () => {}, admin: true }) as any;

let n = 0;
// Message only — assertions run inline above. db.ts, engine.ts and stream.ts take a callback and
// call it; passing one to THIS `ok` would print a green check for a body that never ran. Refused
// rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

// ---- 1. the model is shown the narration and never the dialogue ----
{
  const r = await routes['POST /api/remember'](ctx({ storyId: story.id, chapterId }));
  assert.ok(!r.error, r.error);
  assert.ok(asked, 'the model was called');
  assert.ok(asked.user.includes(NARRATED), 'the narration reaches the prompt');
  assert.ok(!asked.user.includes(SPOKEN),
    'and the spoken line does not — dialogue may lie, and only the narrator commits the story');
  // The description in force is seeded so the answer can be a restatement rather than a guess.
  assert.ok(asked.user.includes(BEFORE), "the character's current description is seeded into the ask");
  // A place cannot acquire a broken arm.
  assert.ok(!asked.user.includes('A stair with no landing'), 'lore entries are not offered for memory');
  ok('the memory pass reads narration only, and is seeded with the description in force');
}

// ---- 1b. extraction reads narration only too, and closing a chapter fires it ----
//
// Two paths read the same prose for the same kind of fact, and until 2026-08-27 they disagreed:
// `remember` stripped dialogue and `extract` read `p.body` raw, so a character's lie was offered
// to the ledger as canon by one and refused by the other. That mattered less behind a button;
// this now runs on every chapter close.
{
  asked = null;
  const r: any = await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId }));
  assert.ok(!r.error, r.error);
  assert.ok(asked, 'the model was called');
  assert.ok(asked.user.includes(NARRATED), 'the narration reaches the extractor');
  assert.ok(!asked.user.includes(SPOKEN),
    'and the spoken line does not — EXTRACT\'s own prompt says a character being wrong is not a '
    + 'fact, and this used to hand it the lie');
  ok('extraction reads narration only, the way the memory pass always has');
}

// Closing a chapter reads it for facts with nothing pressed. The ledger is the only tier that
// survives compaction, so leaving it on a button leaves the memory optional — the same argument
// the summary already won. Twelve always-on entries in the real database is what the button
// produced over a book.
{
  const before = db.proposalsOf(story.id).length;
  found = [{ title: 'The Dead God', body: 'The city is built on its back.', type: 'lore', keys: ['god'] }];
  const r: any = await routes['POST /api/chapter/end'](ctx({ storyId: story.id }));
  assert.ok(!r.error, r.error);
  const after = db.proposalsOf(story.id);
  assert.ok(after.length > before,
    `closing a chapter must read it for facts: ${before} proposals before, ${after.length} after`);
  assert.ok(after.some((p: any) => p.title === 'The Dead God'),
    'and what it found must be in the queue');
  // HANDED BACK, not merely done. The end-chapter ritual reports this rather than making its own
  // extract call — without the answer on the response it would call again, and every chapter
  // close would cost two model calls to say one thing.
  assert.ok(r.extracted, 'the close must return what it found, or the surface asks a second time');
  assert.strictEqual(r.extracted.added, 1, 'with the count the ritual prints');
  // Proposals, never writes. The whole reason this is safe to fire on its own.
  assert.ok(!db.entriesOf(story.id).some((e: any) => e.title === 'The Dead God'),
    'nothing may become canon without being accepted');
  ok('closing a chapter reads it for facts, as proposals, with nothing pressed');
}

// And the way out, on the same terms as summarise and remember: a flag, not a special case.
{
  const ch2 = (db.chapters(story.id).at(-1) as any).id;
  db.addPassage({ ...story, storyId: story.id, chapterId: ch2,
    body: 'A second chapter, with a fact in it.' });
  found = [{ title: 'Never Proposed', body: 'Because extraction was switched off.', type: 'lore', keys: ['never'] }];
  await routes['POST /api/chapter/end'](ctx({ storyId: story.id, extract: false }));
  assert.ok(!db.proposalsOf(story.id).some((p: any) => p.title === 'Never Proposed'),
    'extract: false must switch it off, the way summarise: false and remember: false do');
  ok('and extract: false opts out of it');
}

// ---- 2. it proposes rather than writing ----
let proposal: any;
{
  const open = db.proposalsOf(story.id);
  proposal = open.find((p: any) => p.entry_type === 'state');
  assert.ok(proposal, 'a state proposal exists');
  assert.strictEqual(proposal.entry_id, vel, "and it is attached to Vel's entry");
  assert.strictEqual(proposal.body, AFTER, 'carrying the whole rewritten description');
  assert.deepStrictEqual(JSON.parse(proposal.keys), ['2'],
    'in force from the NEXT chapter: the change happened during chapter 1');
  assert.match(proposal.delta, /arm broken/, 'and the four-word label rides in delta, for the timeline');
  assert.strictEqual(db.statesForStory(story.id).size, 0, 'nothing is written to canon until accepted');
  ok('a chapter proposes a state per changed character, in force from the next chapter');
}

// ---- 3. accepting writes a state, not an entry ----
{
  const before = db.entriesOf(story.id).length;
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: proposal.id, accept: true }));
  assert.strictEqual(db.entriesOf(story.id).length, before, 'accepting a state adds no entry');
  const states = db.statesForStory(story.id).get(vel) ?? [];
  assert.strictEqual(states.length, 1, 'it adds exactly one state');
  assert.strictEqual(states[0].from_chapter, 2, 'anchored to the chapter it comes into force in');
  assert.strictEqual(states[0].body, AFTER, 'with the full description');
  assert.strictEqual(states[0].before_mode, 'hide',
    'hidden before it opens — a memory must not leak forward into the chapters before it');
  ok('accepting a state writes a state and leaves the entry alone');
}

// ---- 4. and the timeline holds: chapter 1 still sees the woman chapter 1 had ----
{
  const e: any = { body: BEFORE, states: [{ fromChapter: 2, body: AFTER, beforeMode: 'hide' }] };
  assert.strictEqual(resolveBody(e, 1), BEFORE,
    'revising the closed chapter still sees her as she was in it');
  assert.strictEqual(resolveBody(e, 2), AFTER, 'and the next chapter sees the memory');
  // The trap the prompt exists to avoid, asserted from the other end: a state REPLACES, so a
  // delta-shaped state would be the whole of what the model sees.
  assert.ok(resolveBody(e, 2).includes('Grey eyes'),
    'a full restatement keeps the durable facts, which is why the prompt demands one');
  ok('the state in force replaces the body, and only from its own chapter onward');
}

// ---- 5. never invents, and never proposes the same subject twice ----
{
  answer = [{ name: 'Someone Who Does Not Exist', body: 'x', label: 'y' }];
  const r = await routes['POST /api/remember'](ctx({ storyId: story.id, chapterId }));
  assert.strictEqual(r.remembered, 0,
    'a name matching no character is ignored — extraction adds people, memory only updates them');

  // Re-proposing after acceptance is deliberate — the dedupe index covers OPEN proposals only,
  // because once a subject had been accepted it could otherwise never be proposed again.
  answer = [{ name: 'Vel', body: AFTER, label: 'arm broken, trust gone' }];
  const again = await routes['POST /api/remember'](ctx({ storyId: story.id, chapterId }));
  assert.strictEqual(again.remembered, 1, 'an accepted subject can be proposed again later');

  // Which is why (entry, chapter) has to be the identity of a state. Accepting the second one must
  // not leave two states at chapter 2 with resolveBody silently preferring whichever sorts last.
  const second = db.proposalsOf(story.id).find((p: any) => p.entry_type === 'state');
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: second.id, accept: true }));
  const states = db.statesForStory(story.id).get(vel) ?? [];
  assert.strictEqual(states.length, 1, 'accepting the same memory twice updates one state, not two');
  ok('memory never invents a character, and accepting the same one twice does not double the state');
}

// ---- 4b. a fact about a card that already exists lands in ONE ROOM of it ----
//
// `proposals.field` was written from Phase 2 and read by nothing, so accepting any change rewrote
// the WHOLE body — the overwrite this plan exists to stop. "She was loyal in chapter 2 and is not
// by chapter 9" is the arc, and a whole-body rewrite is how you lose it.
{
  found = [{ title: 'Vel', body: 'She will not cross the bridge at night, and says so to nobody.',
             type: 'character', keys: ['bridge'], activation: 'triggered', field: 'interiority' }];
  const ch: any = db.chapters(story.id).at(-1);
  db.addPassage({ ...story, storyId: story.id, chapterId: ch.id,
    body: 'Vel stopped at the bridge and would not put a foot on it.' });
  const r: any = await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId: ch.id }));
  assert.ok(!r.error, r.error);
  const prop = db.proposalsOf(story.id).find((p: any) => p.field === 'interiority');
  assert.ok(prop, 'the room the model named survived into the proposal');
  assert.strictEqual(prop.entry_id, vel, 'aimed at the card that already exists');

  const bodyBefore = (db.entriesOf(story.id).find((e: any) => e.id === vel) as any).body;
  const roomsBefore = db.addonsOf(story.id).length;
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: prop.id, accept: true }));

  const room = db.addonsOf(story.id).find((a: any) => a.slot === 'interiority' && a.entry_id === vel) as any;
  assert.ok(room, 'accepting wrote a room');
  assert.strictEqual(db.addonsOf(story.id).length, roomsBefore + 1);
  assert.match(room.body, /will not cross the bridge/);
  // THE REST OF THE CARD IS UNTOUCHED. This is the whole point of the field.
  assert.strictEqual((db.entriesOf(story.id).find((e: any) => e.id === vel) as any).body, bodyBefore,
    'the card body must not be rewritten when the fact belongs in one room of it');
  ok('a fact about an existing card lands in one room, and leaves the rest of the card alone');
}

{
  // CLOTHING IS AN OUTFIT, NOT A DESCRIPTION. PLAN-08 #5, and the reason is F36: the prose quotes
  // the ledger, and a guitar came out of a coat pocket because the entry saying she carries one is
  // in every prompt. A coat baked into a character's body follows her into every scene for the
  // rest of the book, including the ones where she is not wearing it. As an outfit it is a second
  // bracket that says she has it ON, and taking it off is one press rather than a rewrite.
  found = [{ title: 'Vel', body: 'A grey wool coat with the cuffs gone shiny.', type: 'character',
             keys: [], activation: 'triggered', field: 'outfit' }];
  const ch: any = db.chapters(story.id).at(-1);
  db.addPassage({ ...story, storyId: story.id, chapterId: ch.id,
    body: 'Vel came in wearing the grey coat, the cuffs gone shiny with wear.' });
  const bodyBefore = (db.entriesOf(story.id).find((e: any) => e.id === vel) as any).body;
  await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId: ch.id }));
  const prop = db.proposalsOf(story.id).find((p: any) => p.field === 'outfit');
  assert.ok(prop, 'clothing was proposed as an outfit and not as a rewrite of who she is');
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: prop.id, accept: true }));

  const fit = db.outfitsOf(story.id).find((a: any) => a.entry_id === vel) as any;
  assert.ok(fit, 'accepting it put a coat in the wardrobe');
  assert.match(fit.body, /grey wool coat/);
  assert.strictEqual(fit.active, 1, 'and she has it ON — a coat nobody is wearing reaches nothing');
  assert.strictEqual((db.entriesOf(story.id).find((e: any) => e.id === vel) as any).body, bodyBefore,
    'and who she is was not rewritten to say what she had on that day');
  ok('clothing lands in the wardrobe, worn, without touching the description');
}

{
  // A room with no words of its own and nobody pinning it on never reaches the model — the same
  // darkness `src/import.ts:127` refuses for an entry, and worse here, because the room looks
  // filled in on the card while being invisible to every prompt.
  found = [{ title: 'Vel', body: 'A voice that carries and never rises.', type: 'character',
             keys: [], activation: 'triggered', field: 'voice' }];
  const ch: any = db.chapters(story.id).at(-1);
  await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId: ch.id }));
  const prop = db.proposalsOf(story.id).find((p: any) => p.field === 'voice');
  assert.ok(prop, 'the voice room was proposed');
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: prop.id, accept: true }));
  const room = db.addonsOf(story.id).find((a: any) => a.slot === 'voice' && a.entry_id === vel) as any;
  assert.strictEqual(room.active, 1,
    'an accepted room with no trigger words is switched on, or it is filled in and dark');
  ok('  and a room with no words of its own is switched on rather than left dark');
}

{
  // A slot this KIND does not have is refused before it is ever stored. The enum in the schema
  // cannot say "per kind"; `slotsFor` is the same list the screen draws from.
  found = [{ title: 'The Long Stair', body: 'It sounds like a bell.', type: 'lore',
             keys: ['stair'], activation: 'triggered', field: 'voice' }];
  const ch: any = db.chapters(story.id).at(-1);
  await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId: ch.id }));
  const bad = db.proposalsOf(story.id).find((p: any) => p.title === 'The Long Stair' && p.field);
  assert.ok(!bad, 'a place has no voice, and the room must not survive into the proposal');
  ok('  and a room the card\'s kind does not have is refused');
}

{
  // A ROOM NEEDS A CARD TO BE A ROOM OF. A brand-new thread has no rooms yet and its body is the
  // whole of it, so a field on a `new` proposal is dropped — otherwise accepting it would write a
  // room hanging off nothing and the card itself would never be created.
  found = [{ title: 'The Ninth Bell', body: 'It is rung for the drowned.', type: 'lore',
             keys: ['ninth bell'], activation: 'triggered', field: 'history' }];
  const ch: any = db.chapters(story.id).at(-1);
  await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId: ch.id }));
  const fresh = db.proposalsOf(story.id).find((p: any) => p.title === 'The Ninth Bell');
  assert.ok(fresh, 'the new thread was proposed');
  assert.strictEqual(fresh.entry_id, null, 'and it is new — no card to be a room of');
  assert.strictEqual(fresh.field, null, 'so the room it named was dropped');
  ok('  and a brand-new thread carries no room, because its body is the whole of it');
}

// ---- 5. what a chapter FINISHED — PLAN-08 Phase 4 ----
//
// The one decision in the app that changes what the model is told for the REST OF THE BOOK, and it
// does it to a card that goes on looking alive on the Threads screen. So the whole path is driven
// here: what the model is shown, what is done with what it says, and what accepting writes.
const WHERE = 'Vel comes back in the last act and the city goes with her.';
let retProposal: any;
{
  db.updateStory(story.id, { direction: WHERE });
  const ch: any = db.chapters(story.id).at(-1);
  db.addPassage({ ...story, storyId: story.id, chapterId: ch.id,
    body: 'Vel went down on the stair and did not get up. "She is fine," the porter said.' });
  // The quote has to BE in the narration now — the route checks it, so the fake has to be honest
  // the way the model has to be. This sentence is in the passage below, word for word.
  finished = [{ card: 'Vel', quote: 'Vel went down on the stair and did not get up' }];
  found = []; answer = [];
  asked = null;
  const r: any = await routes['POST /api/chapter/end'](ctx({ storyId: story.id }));
  assert.ok(!r.error, r.error);

  // `retire` runs LAST of the four, so `asked` is its ask.
  assert.ok(asked.user.includes('Vel went down on the stair'), 'the narration reaches the scan');
  assert.ok(!asked.user.includes('She is fine'),
    'and the porter does not — a character SAYS she is fine, and dialogue does not commit the story');
  assert.ok(asked.user.includes(BEFORE) || asked.user.includes(AFTER),
    'the description in force is seeded, so the judgement is about the card the book actually has');
  // THE DIRECTION, and this is the first time `stories.direction` has ever left the prose path.
  // Without it the scan cannot tell offstage from finished, which is the whole distinction.
  assert.ok(asked.system.includes(WHERE),
    'where the book is going reaches the scan — "depending on where we\'re going" is this field');

  // The denominator rides in the runtime answer, not only in the probe.
  assert.strictEqual(r.retired?.proposed, 1);
  assert.ok((r.retired?.eligible ?? 0) >= 1, 'and it says how many the chapter named');

  retProposal = db.proposalsOf(story.id).find((p: any) => p.entry_type === 'retire');
  assert.ok(retProposal, 'a retirement proposal exists');
  assert.strictEqual(retProposal.entry_id, vel);
  assert.deepStrictEqual(JSON.parse(retProposal.keys), [String(ch.idx + 1)],
    'in force from the NEXT chapter: she dies DURING the one that just closed, and revising it '
    + 'later must still have her in it');
  // PROPOSALS, NEVER WRITES. The reason this is safe to fire on every close.
  const row: any = db.db.prepare('SELECT retired_at_chapter FROM entries WHERE id = ?').get(vel);
  assert.strictEqual(row.retired_at_chapter, null, 'nothing is retired until it is accepted');
  // THE EVIDENCE IS WHAT THE WRITER READS. A verbatim line from their own prose says more about
  // whether to accept than the model's summary of it did.
  assert.match(retProposal.body, /went down on the stair/,
    'the proposal carries the sentence that commits it, out of the writer\'s own prose');
  ok('closing a chapter proposes what it finished, seeded with the description and the direction');
}

{
  // A CARD IT CANNOT QUOTE FOR IS NOT PROPOSED. The model returns a sentence that is nowhere in
  // the chapter; the route checks rather than trusts, which is the only part of this decision code
  // can make for itself. F41 measured two shapes the prompt forbade in words and it did anyway.
  const ch: any = db.chapters(story.id).at(-1);
  db.addPassage({ ...story, storyId: story.id, chapterId: ch.id,
    body: 'Sedge stood in the doorway a long while and then was not there.' });
  const sedge = db.upsertEntry(story.id, me, { title: 'Sedge', body: '[Sedge: a runner]',
    entryType: 'character', keys: ['Sedge'] });
  finished = [{ card: 'Sedge', quote: 'Sedge was buried at the crossroads before dawn' }];
  const r: any = await routes['POST /api/finished'](ctx({ storyId: story.id, chapterId: ch.id }));
  assert.strictEqual(r.proposed, 0, 'nothing was proposed on evidence that is not in the prose');
  assert.strictEqual(r.unevidenced, 1, 'and the refusal is COUNTED, not swallowed');
  assert.ok(!db.proposalsOf(story.id).some((p: any) => p.entry_id === sedge));
  ok('  and a card it cannot quote the prose for is refused, and the refusal is counted');

  // AND A SCRAP IS NOT EVIDENCE. "a" is in every chapter ever written, so without a floor the
  // check passes on anything and reports perfection — the shape this project has shipped twice.
  finished = [{ card: 'Sedge', quote: 'the' }];
  const r2: any = await routes['POST /api/finished'](ctx({ storyId: story.id, chapterId: ch.id }));
  assert.strictEqual(r2.proposed, 0, 'a fragment that happens to appear is not a sentence');
  assert.strictEqual(r2.unevidenced, 1);
}

{
  const before = db.entriesOf(story.id).length;
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: retProposal.id, accept: true }));
  const row: any = db.db.prepare('SELECT retired_at_chapter FROM entries WHERE id = ?').get(vel);
  assert.strictEqual(row.retired_at_chapter, Number(JSON.parse(retProposal.keys)[0]));
  assert.strictEqual(db.entriesOf(story.id).length, before, 'accepting a retirement adds no entry');
  // A THRESHOLD AND NOT A DELETE, which is what makes going back to revise safe.
  const e: any = { ...db.entriesOf(story.id).find((x: any) => x.id === vel), title: 'Vel' };
  assert.ok(e, 'the card is still there — retiring is not deleting');
  ok('accepting a retirement writes the threshold and nothing else');
}

{
  // A MALFORMED KEY MUST RETIRE NOTHING. The state branch beside this one falls back to `|| 1` on
  // a bad key, which is harmless for a state and would retire a card from chapter ONE here — the
  // whole book, silently, off one bad proposal. Nothing rather than something wrong.
  const stair = db.entriesOf(story.id).find((x: any) => x.title === 'The Long Stair') as any;
  db.addProposal(story.id, { title: 'The Long Stair', body: 'malformed', entryType: 'retire',
    entry_id: stair.id, kind: 'retire', keys: ['not a chapter'] });
  const bad = db.proposalsOf(story.id).find((p: any) => p.entry_type === 'retire'
    && p.entry_id === stair.id);
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: bad.id, accept: true }));
  const row: any = db.db.prepare('SELECT retired_at_chapter FROM entries WHERE id = ?').get(stair.id);
  assert.strictEqual(row.retired_at_chapter, null,
    'a retirement with an unreadable chapter must write nothing, not retire from chapter 1');
  ok('a retirement with a malformed chapter writes nothing at all');
}

{
  // The gate, driven through the route: a card the closing chapter never names is never offered,
  // so a model naming it anyway cannot retire it. This is the difference between a scan and a
  // scan that can finish a character it read no line about.
  const ch2: any = db.chapters(story.id).at(-1);
  db.addPassage({ ...story, storyId: story.id, chapterId: ch2.id,
    body: 'The Long Stair was empty and the rain came in sideways.' });
  finished = [{ card: 'Vel', quote: 'invented out of nothing, and not in the prose at all' }];
  const before = db.proposalsOf(story.id).filter((p: any) => p.entry_type === 'retire').length;
  const r: any = await routes['POST /api/chapter/end'](ctx({ storyId: story.id }));
  assert.strictEqual(db.proposalsOf(story.id).filter((p: any) => p.entry_type === 'retire').length,
    before, 'a card this chapter never names must not be retirable through it');
  // The model named a card that was never on its list. In production the enum makes that
  // impossible; the route checks anyway, because the constraint is the router's to honour and
  // this is the one answer that decides what the model stops being told.
  assert.strictEqual(r.retired?.proposed, 0,
    'a name that was never offered must produce nothing, whatever the model returns');
  ok('a card the closing chapter never names is never offered to the scan, and cannot be smuggled in');
}

{
  const ch3: any = db.chapters(story.id).at(-1);
  db.addPassage({ ...story, storyId: story.id, chapterId: ch3.id,
    body: 'The Long Stair went on being a stair with no landing.' });
  finished = [{ card: 'The Long Stair', quote: 'The Long Stair went on being a stair with no landing' }];
  const before = db.proposalsOf(story.id).filter((p: any) => p.entry_type === 'retire').length;
  await routes['POST /api/chapter/end'](ctx({ storyId: story.id, retire: false }));
  assert.strictEqual(db.proposalsOf(story.id).filter((p: any) => p.entry_type === 'retire').length,
    before, 'retire: false must switch it off, the way summarise/remember/extract: false do');
  ok('and retire: false opts out of it');
}

srv.close();
console.log(`\n${n} checks passed`);
