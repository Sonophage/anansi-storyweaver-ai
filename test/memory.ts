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
// Names Vel: the hem reviews only threads the narration names (#73).
const NARRATED = 'Vel felt the wrist give under the weight and did not cry out.';

let asked: any = null;
/** What the fake returns. A name that matches nobody is how the "never invent" check is driven. */
let answer: any[] = [{ name: 'Vel', stands: AFTER, label: 'arm broken, trust gone',
  line: 'the wrist give under the weight', always: '', pockets: [] }];
/** And what the EXTRACT role returns. One fake, two roles: `remember` reads `characters` and
 *  `extract` reads `entries`, so returning both keys serves whichever one asked. */
let found: any[] = [{ title: 'The Wrist Strap', body: 'Leather, cut from a saddle girth.',
                      type: 'item', keys: ['strap'] }];
/** And what the RETIRE role returns. Third key on the same blob, for the same reason: one fake
 *  server, and whichever role asked reads the key it wants. `card` is an enum in the real schema,
 *  built from the candidates the route offers — so a name that is not among them is how the gate
 *  is driven from the far side. */
let finished: any[] = [];
/** And what the STYLE role returns. Fourth key on the same blob, same reason: one fake server, and
 *  whichever role asked reads the key it wants. #18 §2. */
let styled = 'Short chapters, weather in every scene, nobody explains themselves.';
/** And a chapter summary, which is plain prose and not the blob. Null leaves every call on the blob,
 *  which is what every block before the summary one relies on. #45. */
let summed: string | null = null;
/** How many times the fake was asked anything but /tokenize. #46 asserts a refusal happens BEFORE
 *  any model call, and only a count can see a call whose answer was thrown away. */
let calls = 0;
/** And what TIDY returns (#73): its three top-level keys ride on the same blob. */
let tidied: any = {};
/** And what REDO returns (#74): one section written again. */
let redone = '';

/** #89. A fake that HOLDS its answer while `gate` is pending: how a test proves the hem answers
 *  before its passes do, and that a second hem waits for the first. `inflight` counts asks being
 *  held at once. `failIf` answers 500 to an ask whose system prompt it matches: one pass failing. */
let gate: Promise<void> | null = null;
let inflight = 0, mostInflight = 0;
let failIf: ((system: string) => boolean) | null = null;
/** Every ask, in order. A hem runs five passes after its answer, so the last ask is no longer the
 *  one a test means: `askOf` finds the latest ask made with one role's prompt. */
const asks: any[] = [];
const askOf = (prompt: string) => asks.findLast((a) => a.system.startsWith(prompt.slice(0, 80)));

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', async () => {
    const b = JSON.parse(raw || '{}');
    const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o)); };
    if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });
    calls++;
    asked = { system: b.messages?.[0]?.content ?? '', user: b.messages?.[1]?.content ?? '' };
    asks.push(asked);
    // Only an ask is held: the client's health probe must still answer, or it reports the model down.
    if (b.messages) { inflight++; mostInflight = Math.max(mostInflight, inflight);
      if (gate) await gate;
      inflight--; }
    if (failIf?.(asked.system)) { res.writeHead(500); return res.end('{"error":"held down"}'); }
    if (summed !== null) return send({ choices: [{ message: { content: summed } }],
      usage: { prompt_tokens: 200, completion_tokens: 60 } });
    send({ choices: [{ message: { content: JSON.stringify({ ...tidied, body: redone, threads: answer, entries: found,
                                                            finished, style: styled }) } }],
           usage: { prompt_tokens: 200, completion_tokens: 60 } });
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

const db = await import('../src/db.ts');
const { routes, hemSettled } = await import('../src/routes.ts');
const { resolveBody } = await import('../src/context.ts');
const prompts = await import('../src/prompts.ts');

const me = db.owner('rememberer');
const story = db.createStory(me, { title: 'Sutera', premise: 'A city on a dead god.' });
const vel = db.upsertEntry(story.id, me, { title: 'Vel', body: BEFORE, entryType: 'character' });
db.upsertEntry(story.id, me, { title: 'The Long Stair', body: 'A stair with no landing.', entryType: 'lore' });
db.addPassage({ ...story, storyId: story.id, body: `${NARRATED} "${SPOKEN}," she said.` });

const chapterId = (db.chapters(story.id)[0] as any).id;

const ctx = (body: any) => ({ body, query: new URLSearchParams(), owner: me,
  slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: { max_tokens: 400 }, setGen: () => {},
  defaultModel: null, setDefaultModel: () => {}, admin: true }) as any;

const sceneOf = (v: any, id: string) => (v.chapters ?? []).find((c: any) => c.id === id) ?? {};
// The story view as every route builds it, without GET /api/story: opening a book prewarms the model,
// and a warm is an ask this fake would count.
const { view } = await import('../src/story.ts');
const viewNow = (id: string) => view(id) as any;

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
  // #73. Every kind the narration NAMES is offered, and only those: the Long Stair is not named.
  assert.ok(!asked.user.includes('A stair with no landing'), 'a thread the narration does not name is not offered');
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
  const closing = (db.chapters(story.id).at(-1) as any).id;
  const r: any = await routes['POST /api/chapter/end'](ctx({ storyId: story.id }));
  assert.ok(!r.error, r.error);
  await hemSettled(story.id);
  const after = db.proposalsOf(story.id);
  assert.ok(after.length > before,
    `closing a chapter must read it for facts: ${before} proposals before, ${after.length} after`);
  assert.ok(after.some((p: any) => p.title === 'The Dead God'),
    'and what it found must be in the queue');
  // REPORTED, not merely done (#32): the hem's record says the facts pass ran (#89).
  const hem = (await viewNow(story.id)).chapters.find((c: any) => c.id === closing)?.hem;
  assert.strictEqual(hem?.passes?.facts, null, `the hem reports the facts pass ran (${hem?.passes?.facts})`);
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
  await hemSettled(story.id);
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
  answer = [{ name: 'Someone Who Does Not Exist', stands: 'x', label: 'y', line: '', always: '', pockets: [] }];
  const r = await routes['POST /api/remember'](ctx({ storyId: story.id, chapterId }));
  assert.strictEqual(r.remembered, 0,
    'a name matching no character is ignored — extraction adds people, memory only updates them');

  // Re-proposing after acceptance is deliberate — the dedupe index covers OPEN proposals only,
  // because once a subject had been accepted it could otherwise never be proposed again.
  // Named as the ask lists it, kind in brackets: the real model answers "Vel (character)", and a
  // match on the name as written once made a whole scene's review chalk nothing.
  answer = [{ name: 'Vel (character)', stands: AFTER, label: 'arm broken, trust gone', line: '', always: '', pockets: [] }];
  const again = await routes['POST /api/remember'](ctx({ storyId: story.id, chapterId }));
  assert.strictEqual(again.remembered, 1, 'an accepted subject can be proposed again later, named with its kind');

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
  // FACTS: THE ROOM THAT EXISTS BECAUSE THE BODY GETS OVERWRITTEN. Seth, 2026-08-29: "the current
  // body gets rewritten at chapter end. theres no place to keep the characters main facts that
  // doesnt get overwritten." `resolveBody` REPLACES the body with the newest state, and its own
  // comment has warned since it was written that a short state silently drops everything it does
  // not repeat. Rooms were always immune; there was just no room MEANT for the permanent half.
  found = [{ title: 'Vel', body: 'Thirty-four. Born on the Long Stair. Grey eyes.',
             type: 'character', keys: [], activation: 'triggered', field: 'facts' }];
  const ch: any = db.chapters(story.id).at(-1);
  await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId: ch.id }));
  // Vel's: new threads are chalked with `facts` too since #73 (their text is their Always true).
  const prop = db.proposalsOf(story.id).find((p: any) => p.field === 'facts' && p.entry_id === vel);
  assert.ok(prop, 'a permanent fact aims at the facts room');
  assert.strictEqual(prop.target, null, 'and there is nothing there yet to replace');
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: prop.id, accept: true }));
  // #73 · AN EMPTY ALWAYS TRUE IS ANANSI'S TO FILL, ONCE. Vel has none, so the accepted change is
  // her Always true. (#77's lock, for a thread whose Always true is written, is in test/scope.ts.)
  assert.ok(db.addonsOf(story.id).some((a: any) => a.slot === 'facts' && a.entry_id === vel && /Grey eyes/.test(a.body)),
    'FILL-EMPTY: accepting a chalked Always true for a thread with none writes it');
  // The writer writes her Always true by hand, which the lock does not touch; the blocks below use it.
  db.setAddonActive(story.id, db.upsertAddon(story.id, vel, { slot: 'facts', name: 'facts',
    body: 'Thirty-four. Born on the Long Stair. Grey eyes.' })!, true);
  const facts = db.addonsOf(story.id).find((a: any) => a.slot === 'facts' && a.entry_id === vel) as any;
  assert.match(facts.body, /Grey eyes/);

  // THE WHOLE POINT, ASSERTED: a chapter-end state rewrites the body and the facts survive it.
  // Checked against a SYNTHETIC entry rather than by writing a state into the fixture — this suite
  // shares one story across every block, and a state written here changed what the retirement test
  // three blocks down was seeded with. The pure function is what is under test anyway.
  const { resolveBody: rb } = await import('../src/context.ts');
  const e: any = { ...db.entriesOf(story.id).find((x: any) => x.id === vel), states: [{ fromChapter: 2, body: 'She is dead.' }] };
  assert.strictEqual(rb(e as any, 2), 'She is dead.', 'the body is replaced, as it always was');
  assert.match(facts.body, /Born on the Long Stair/,
    'and what is true about her is in a room the rewrite cannot reach');
  ok('facts survive the chapter-end rewrite that replaces the body');
}

{
  // A ROOM THAT EXISTS IS AN OFFER, NOT AN OVERWRITE — and an identical one is not even an offer.
  // A relationships room, written by hand first: these were Always true until #77, and Always true of a
  // thread that exists is not a place a chalked change can land (the lock, above).
  const ch: any = db.chapters(story.id).at(-1);
  db.setAddonActive(story.id, db.upsertAddon(story.id, vel, { slot: 'relationships', name: 'Aldis',
    body: 'Trusts Aldis without asking why.' })!, true);
  found = [{ title: 'Vel', body: 'Trusts Aldis without asking why.',
             type: 'character', keys: [], activation: 'triggered', field: 'relationships' }];
  const before = db.proposalsOf(story.id).length;
  await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId: ch.id }));
  assert.strictEqual(db.proposalsOf(story.id).length, before,
    'the same room said again is queue noise, and is not proposed at all');

  found = [{ title: 'Vel', body: 'Trusts Aldis, and is frightened of what that costs.',
             type: 'character', keys: [], activation: 'triggered', field: 'relationships' }];
  await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId: ch.id }));
  const upd = db.proposalsOf(story.id).find((p: any) => p.field === 'relationships' && /frightened/.test(p.body));
  assert.ok(upd, 'a DIFFERENT one is proposed');
  const existing = db.addonsOf(story.id).find((a: any) => a.slot === 'relationships' && a.entry_id === vel) as any;
  assert.strictEqual(upd.target, existing.id, 'carrying the room it would stand in for');

  // Accepting WITHOUT replace adds beside it; the writer chose "another", not "instead of".
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: upd.id, accept: true }));
  assert.strictEqual(db.addonsOf(story.id).filter((a: any) => a.slot === 'relationships' && a.entry_id === vel).length,
    2, 'accept adds a second room beside the first');
  ok('a room that already exists is offered rather than overwritten, and an identical one is not offered');
}

{
  // And REPLACE puts it in place of the one that is there, rather than beside it.
  const ch: any = db.chapters(story.id).at(-1);
  const mine = db.addonsOf(story.id).filter((a: any) => a.slot === 'relationships' && a.entry_id === vel);
  for (const a of mine.slice(1)) db.delAddon(story.id, a.id);
  found = [{ title: 'Vel', body: 'Slow now to trust Aldis.', type: 'character',
             keys: [], activation: 'triggered', field: 'relationships' }];
  await routes['POST /api/extract'](ctx({ storyId: story.id, chapterId: ch.id }));
  const rep = db.proposalsOf(story.id).find((p: any) => p.field === 'relationships' && /Slow now/.test(p.body));
  assert.ok(rep?.target, 'it knows which room it would stand in for');
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: rep.id, accept: true, replace: true }));
  const after = db.addonsOf(story.id).filter((a: any) => a.slot === 'relationships' && a.entry_id === vel);
  assert.strictEqual(after.length, 1, 'replace leaves one room, not two');
  assert.match(after[0].body, /Slow now/, 'and it is the new one');
  ok('  and replace stands in for it rather than beside it');
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
  // #73. A NEW THREAD'S TEXT IS WHO OR WHAT IT IS: its Always true, not a room it named.
  assert.strictEqual(fresh.field, 'facts', 'so the room it named was dropped, and its text is its Always true');
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: fresh.id, accept: true }));
  const bell: any = db.entriesOf(story.id).find((e: any) => e.title === 'The Ninth Bell');
  assert.strictEqual(bell?.body, '', 'NEW-ALWAYS: accepting it writes no Info');
  assert.match((db.addonsOf(story.id) as any[]).find((a) => a.entry_id === bell?.id && a.slot === 'facts')?.body ?? '',
    /rung for the drowned/, 'NEW-ALWAYS: and its text is its Always true');
  ok('  and a brand-new thread carries no room: its text is its Always true');
}

// ---- 5. what a chapter FINISHED — PLAN-08 Phase 4 ----
//
// The one decision in the app that changes what the model is told for the REST OF THE BOOK, and it
// does it to a card that goes on looking alive on the Threads screen. So the whole path is driven
// here: what the model is shown, what is done with what it says, and what accepting writes.
let retProposal: any;
{
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
  await hemSettled(story.id);

  // The next-scene suggestion runs after `retire` (#89), so its ask is found by its prompt.
  asked = askOf(prompts.RETIRE);
  assert.ok(asked.user.includes('Vel went down on the stair'), 'the narration reaches the scan');
  assert.ok(!asked.user.includes('She is fine'),
    'and the porter does not — a character SAYS she is fine, and dialogue does not commit the story');
  assert.ok(asked.user.includes(BEFORE) || asked.user.includes(AFTER),
    'the description in force is seeded, so the judgement is about the card the book actually has');

  assert.strictEqual(db.proposalsOf(story.id).filter((p: any) => p.entry_type === 'retire').length, 1,
    'the close proposes the one retirement the scene supports');

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
  ok('closing a chapter proposes what it finished, seeded with the description in force');
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
  await routes['POST /api/chapter/end'](ctx({ storyId: story.id }));
  await hemSettled(story.id);
  // The model named a card that was never on its list. In production the enum makes that
  // impossible; the route checks anyway, because the constraint is the router's to honour and
  // this is the one answer that decides what the model stops being told.
  assert.strictEqual(db.proposalsOf(story.id).filter((p: any) => p.entry_type === 'retire').length,
    before, 'a card this chapter never names must not be retirable through it');
  ok('a card the closing chapter never names is never offered to the scan, and cannot be smuggled in');
}

{
  const ch3: any = db.chapters(story.id).at(-1);
  db.addPassage({ ...story, storyId: story.id, chapterId: ch3.id,
    body: 'The Long Stair went on being a stair with no landing.' });
  finished = [{ card: 'The Long Stair', quote: 'The Long Stair went on being a stair with no landing' }];
  const before = db.proposalsOf(story.id).filter((p: any) => p.entry_type === 'retire').length;
  await routes['POST /api/chapter/end'](ctx({ storyId: story.id, retire: false }));
  await hemSettled(story.id);
  assert.strictEqual(db.proposalsOf(story.id).filter((p: any) => p.entry_type === 'retire').length,
    before, 'retire: false must switch it off, the way summarise/remember/extract: false do');
  ok('and retire: false opts out of it');
}

// #18/PLAN-08. The memory pass rewrote the WHOLE description every time, which is the overwrite
// this plan exists to stop — and the reason `facts` had to be invented, because a state REPLACES
// the body and everything the rewrite did not repeat was dropped from that chapter on.
{
  const ch: any = db.chapters(story.id).at(-1);
  db.addPassage({ ...story, storyId: story.id, chapterId: ch.id,
    body: 'Vel would not look at the bridge, and would not say why.' });
  // #73. A pocket change, as an instruction, and no change to where she stands. Vel was retired by
  // the retirement checks above, and a retired thread is not reviewed at hem, so she comes back first.
  db.setRetired(story.id, vel, null, ch.index);
  answer = [{ name: 'Vel', stands: '', label: 'afraid of the bridge', line: 'would not look at the bridge', always: '',
              pockets: [{ slot: 'interiority', name: 'The bridge', body: 'She will not cross the bridge at night; she finds a reason.' }] }];
  found = [];
  const before = db.statesForStory(story.id).get(vel)?.length ?? 0;
  await routes['POST /api/remember'](ctx({ storyId: story.id, chapterId: ch.id }));
  const prop = db.proposalsOf(story.id).find((p: any) => p.field === 'interiority');
  assert.ok(prop, 'a change that belongs in one room is proposed as that room');
  assert.strictEqual(prop.entry_type, 'character', 'not as a state — a state replaces the body');
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: prop.id, accept: true }));
  const room = db.addonsOf(story.id).find((a: any) => a.slot === 'interiority' && a.entry_id === vel) as any;
  assert.match(room.body, /will not cross the bridge/);
  assert.strictEqual(db.statesForStory(story.id).get(vel)?.length ?? 0, before,
    'and the timeline is untouched — nothing replaced her description');
  ok('the memory pass lands a change in one room and leaves the rest of the card alone');
}

{
  // AND `none` STILL WRITES A STATE. That path is the one the pass was built for — a death, a
  // transformation, a person the chapter genuinely replaced — and it is kept, not migrated away.
  const ch: any = db.chapters(story.id).at(-1);
  answer = [{ name: 'Vel', stands: 'Vel is dead at the foot of the stair.', label: 'dead',
              line: '', always: '', pockets: [] }];
  const before = db.statesForStory(story.id).get(vel)?.length ?? 0;
  await routes['POST /api/remember'](ctx({ storyId: story.id, chapterId: ch.id }));
  const st = db.proposalsOf(story.id).find((p: any) => p.entry_type === 'state' && /dead/.test(p.body));
  assert.ok(st, 'a change to who she now IS is still a state');
  await routes['POST /api/proposal'](ctx({ storyId: story.id, id: st.id, accept: true }));
  assert.strictEqual(db.statesForStory(story.id).get(vel)!.length, before + 1,
    'and accepting it writes one');
  ok('  and a change to the whole of her is still a state, which is what that path is for');
}

// ---- #27 · THE WHOLE BOOK, READ FOR ONE THREAD ----
//
// checks.md: "the scan chapter of facts, should also be scan story for facts as an additional
// option and if one of these is selected, its looking only for the mentions of the person,
// location, item, etc."
//
// Its own story, because this pass reads EVERY passage in the book and the fixture needs one long
// enough to overflow the window — 45,000 characters of it would change what every other block in
// this file is reading.
{
  const s2 = db.createStory(me, { title: 'The Ashfall Concordat', premise: 'Six houses.' });
  const ilvaId = db.upsertEntry(s2.id, me, { title: 'Ilva', body: '[Ilva: an envoy]',
    entryType: 'character', keys: [] });          // NO KEYS — she is matched by her own title
  db.upsertEntry(s2.id, me, { title: 'The Long Stair', body: 'A stair with no landing.',
    entryType: 'lore', keys: ['stair'] });

  // Four that name her in narration, one that names her only inside quotation marks, and one that
  // does not name her at all. Each of the four is over a quarter of the 40,000-character budget, so
  // the oldest cannot fit and the pass has to say so.
  const filler = 'The hall was cold and the braziers had gone out. '.repeat(240);   // ~11,000
  db.addPassage({ ...s2, storyId: s2.id, body: `Ilva came up the stair. ${filler}` });
  db.addPassage({ ...s2, storyId: s2.id, body: `Ilva signed nothing that winter. ${filler}` });
  db.addPassage({ ...s2, storyId: s2.id, body: `"Ilva will never sign," the porter said.` });
  db.addPassage({ ...s2, storyId: s2.id, body: `The porter counted the seals alone. ${filler}` });
  db.addPassage({ ...s2, storyId: s2.id, body: `Ilva burned the third draft. ${filler}` });
  db.addPassage({ ...s2, storyId: s2.id, body: `Ilva left before the thaw. ${filler}` });

  asked = null;
  // Three answers: one that belongs to her, one that belongs to another card, and one that is a
  // thread nobody has. Only the first is hers, and the other two are what the filter is for.
  found = [
    { title: 'Ilva', body: '[Ilva: signs nothing, burns her own drafts]', type: 'character',
      keys: ['Ilva'], field: 'facts' },
    { title: 'The Long Stair', body: '[The Long Stair: cold, unlit]', type: 'lore', keys: ['stair'] },
    { title: 'The Porter', body: '[The Porter: counts the seals]', type: 'character', keys: ['porter'] },
  ];
  const r: any = await routes['POST /api/scanstory'](ctx({ storyId: s2.id, entryId: ilvaId }));
  assert.ok(!r.error, r.error);

  // NARRATION ONLY, the rule every pass in this file shares. Her name inside quotation marks is
  // the porter saying it, and this project has a long run of false positives from reading dialogue
  // as narration.
  assert.ok(!asked.user.includes('will never sign'),
    'a passage that names her only inside dialogue is not read');
  // AND ONLY THE PASSAGES THAT NAME HER. The porter's own passage is in the same book and must not
  // be in the ask.
  assert.ok(!asked.user.includes('counted the seals alone'),
    'a passage that never names her is not read either');
  assert.ok(asked.user.includes('Ilva left before the thaw'), 'the most recent mention is read');
  // MATCHED BY HER TITLE, not only by keywords. She has none, and a card with no keywords that
  // could not find itself in its own book would be the common case for a character.
  assert.ok(asked.user.includes('Ilva burned the third draft'), 'and the one before it');

  // THE INFORMATIVE DENOMINATOR. A book is bigger than the window, so what it could SEE rides with
  // what it found — F10 is the finding that could decide nothing because it never said this.
  assert.strictEqual(r.mentioned, 4, 'four passages name her in narration');
  assert.ok(r.read < r.mentioned, `the oldest does not fit the budget (read ${r.read} of ${r.mentioned})`);
  assert.ok(!asked.user.includes('Ilva came up the stair'),
    'and the one dropped is the OLDEST — the settled state of a thread is its late state');

  // THE SUBJECT IS ENFORCED IN CODE, NOT ONLY IN THE PROMPT.
  assert.ok(asked.system.includes('THE SUBJECT: Ilva'), 'the prompt names her on its own line');
  assert.strictEqual(r.added, 1, 'only what lands on her card is proposed');
  assert.strictEqual(r.elsewhere, 2,
    'and what would have landed on another card, or made a new one, is counted rather than written');
  const props = db.proposalsOf(s2.id) as any[];
  assert.deepStrictEqual([...new Set(props.map((x) => x.entry_id))], [ilvaId],
    'nothing reached the queue for any other thread');
  assert.strictEqual(props[0].field, 'facts', 'and the room the model named is carried');
  ok('the story-wide scan reads one thread, in narration, newest first, and says how much it saw');
}

// A card the narrator never commits to has nothing for this pass to find, and says so rather than
// spending a full-window call to discover it.
{
  const s3 = db.createStory(me, { title: 'Sutera II', premise: 'Nothing happens.' });
  const ghostId = db.upsertEntry(s3.id, me, { title: 'Nobody', body: '[Nobody: unwritten]',
    entryType: 'character', keys: [] });
  db.addPassage({ ...s3, storyId: s3.id, body: '"Nobody came," she said.' });
  asked = null;
  const r: any = await routes['POST /api/scanstory'](ctx({ storyId: s3.id, entryId: ghostId }));
  assert.match(r.error, /never names Nobody/, 'it says which card and why');
  assert.strictEqual(r.mentioned, 0);
  assert.strictEqual(asked, null, 'and the model was never called');
  ok('a thread the narration never names costs no call at all');
}

// #18 §2 · THE HOUSE STYLE IS WRITTEN FROM THE GENRE AND THE PREMISE, AND FROM NOTHING ELSE.
//
// STYLE is not VOICE, and this is the pass that has to keep them apart. Voice is the universal
// register in its own 500-token block; this is the 200-token block under it holding what makes one
// book sound like the kind of book it is. A style note that talks about tense or contractions makes
// two instructions argue over one sentence of prose — the COUNCIL-04 #5 failure that split them.
{
  const s4 = db.createStory(me, { title: 'The Salt Ledger', genre: 'noir, harbour',
    premise: 'A clerk who cannot stop counting.',
    writingStyle: 'Write the narration in contractions.' });
  db.addPassage({ ...s4, storyId: s4.id, body: 'The tide came in over the stones.' });
  asked = null;
  const r: any = await routes['POST /api/style'](ctx({ storyId: s4.id }));
  assert.ok(!r.error, r.error);
  assert.ok(asked, 'the model was called');
  assert.ok(asked.user.includes('noir, harbour'), 'the genre is what it writes from');
  assert.ok(asked.user.includes('cannot stop counting'), 'and the premise');
  // NOT THE PROSE. A style note written from the sentences that exist describes the writing there
  // is, and this block is for the kind of book it is meant to be.
  assert.ok(!asked.user.includes('tide came in'), 'never the prose itself');
  // NOT THE VOICE. It is the block this one must not compete with.
  assert.ok(!asked.user.includes('contractions'), "and never the writer's voice");
  assert.match(asked.system, /DO NOT WRITE ABOUT REGISTER/,
    'and the role is told so on its own line, which is the phrasing F37 measured');

  // A book with neither field costs no call: there is nothing to write the style FROM, and saying
  // so beats spending a request to discover it.
  const s5 = db.createStory(me, { title: 'Untitled' });
  asked = null;
  const bare: any = await routes['POST /api/style'](ctx({ storyId: s5.id }));
  assert.match(bare.error, /genre or a premise/, 'it says what is missing');
  assert.strictEqual(asked, null, 'and never asks');
}
ok('the house style is written from the genre and the premise, and never from the voice or the prose');

// ---- Summarise again on an OLDER chapter (#45). The route always took a chapter id; until #45 the
// client only ever sent the current one, so a stale summary behind it had no way back. What the
// writer buys is the prompt: the stale summary is held back, and after the re-run the new one is in.
{
  const book = db.createStory(me, { title: 'Two chapters' });
  const first = book.chapterId;
  db.addPassage({ storyId: book.id, branchId: book.branchId, chapterId: first,
    body: 'Mara crossed the river at night.', author: 'human' });
  const second = db.endChapter(book.id, book.branchId).opened;
  db.addPassage({ storyId: book.id, branchId: book.branchId, chapterId: second,
    body: 'The second chapter has begun.', author: 'human' });
  // Anansi's summary of chapter one, gone stale: written against prose the chapter no longer has.
  db.setSummary(first, 'Mara crossed the river by day.', 1, 'not-this-prose', 'model');
  const promptNow = async () => ((await routes['POST /api/manifest'](ctx(
    { storyId: book.id, mode: 'continue' }))) as any).prompt as string;
  assert.doesNotMatch(await promptNow(), /river by day/, 'the fixture summary is stale and held back');

  summed = 'Mara crosses the river alone, at night.';
  const r: any = await routes['POST /api/summarize'](ctx({ storyId: book.id, chapterId: first }));
  summed = null;
  assert.ok(!r.error, `the re-run is accepted: ${r.error ?? ''}`);
  assert.strictEqual(r.chapterId, first, 'it ran on the chapter it was given, not the current one');
  const one = (r.chapters ?? []).find((c: any) => c.id === first);
  assert.strictEqual(one?.summary, 'Mara crosses the river alone, at night.', 'the older chapter has the new summary');
  assert.strictEqual(one?.summaryStale, false, 'and it is current again');
  assert.match(await promptNow(), /river alone, at night/, 'so it reaches the writing prompt');
  ok('Summarise again on an older chapter makes its stale summary current and sends it');
}

// ---- YOURS IS NOT WRITTEN OVER ON ONE PRESS (#46). The guard is in `summarise`, which the
// Summarise route and the chapter close both pass through, and it refuses before any model call.
{
  const book = db.createStory(me, { title: 'Your summary' });
  const first = book.chapterId;
  db.addPassage({ storyId: book.id, branchId: book.branchId, chapterId: first,
    body: 'Mara crossed the river at night.', author: 'human' });
  const MINE = 'Mara crosses at night, and tells nobody.';
  const saved: any = await routes['POST /api/summary'](ctx({ storyId: book.id, chapterId: first, summary: MINE }));
  assert.ok(!saved.error, `the hand save is accepted: ${saved.error ?? ''}`);
  const chOf = (v: any) => (v.chapters ?? []).find((c: any) => c.id === first) ?? {};

  summed = 'Mara crosses the river alone.';
  const before = calls;
  const refused: any = await routes['POST /api/summarize'](ctx({ storyId: book.id, chapterId: first }));
  assert.ok(refused.error, 'Summarise over yours without replace is refused');
  assert.strictEqual(calls, before, '  before any model call');
  const still = chOf(await routes['GET /api/story']({ ...ctx({}), query: new URLSearchParams({ story: book.id }) }));
  assert.strictEqual(still.summary, MINE, '  and your summary is untouched');
  assert.strictEqual(still.summaryAuthor, 'human', '  and still yours');

  const replaced: any = await routes['POST /api/summarize'](ctx({ storyId: book.id, chapterId: first, replace: true }));
  summed = null;
  assert.ok(!replaced.error, `with replace it re-runs: ${replaced.error ?? ''}`);
  assert.strictEqual(chOf(replaced).summary, 'Mara crosses the river alone.', '  and the new summary lands');
  assert.strictEqual(chOf(replaced).summaryAuthor, 'model', "  and it is Anansi's");
  ok("Summarise refuses over yours before any model call, and replaces it when asked to");
}

// ---- CLOSING A CHAPTER KEEPS YOURS (#46), even stale, and says so. The close never sends
// `replace`, so its summary pass meets the same guard; memory, facts and the finished scan run.
{
  const book = db.createStory(me, { title: 'Closing on yours' });
  const first = book.chapterId;
  db.addPassage({ storyId: book.id, branchId: book.branchId, chapterId: first,
    body: 'Mara crossed the river at night.', author: 'human' });
  // Yours, and stale: written against prose the chapter no longer has.
  const MINE = 'Mara crosses by day. \u2014 mine, with an odd  space.';
  db.setSummary(first, MINE, 1, 'not-this-prose', 'human');
  await routes['POST /api/chapter/end'](ctx({ storyId: book.id }));
  await hemSettled(book.id);
  const one = sceneOf(await viewNow(book.id), first);
  assert.strictEqual(one.summary, MINE, 'closing leaves your summary byte-identical');
  assert.strictEqual(one.summaryAuthor, 'human', '  and still yours');
  assert.strictEqual(one.hem?.keptSummary, true, '  and the hem reports it kept your summary');
  assert.ok(!one.hem?.passes?.summary, `  not as a pass that failed (${one.hem?.passes?.summary})`);
  assert.ok(['memory', 'facts', 'finished'].every((k) => k in (one.hem?.passes ?? {})),
    `  the other passes ran (${Object.keys(one.hem?.passes ?? {}).join(', ')})`);
  ok('closing a chapter keeps your summary, even stale, runs the other passes, and says so');
}

// ---- #73 · HEM REVIEWS EVERY THREAD THE SCENE NAMES, AS ONE CARD EACH ----
{
  const t = db.createStory(me, { title: 'Hem all kinds', premise: 'p' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  const harbour = db.upsertEntry(t.id, me, { title: 'The Harbour', body: '[The Harbour: busy, loud]', entryType: 'place', keys: ['harbour'] });
  const key = db.upsertEntry(t.id, me, { title: 'The Key', body: '[The Key: iron]', entryType: 'item', keys: ['key'] });
  db.upsertEntry(t.id, me, { title: 'Unnamed', body: '[Unnamed: nobody mentions it]', entryType: 'lore', keys: ['nothing'] });
  db.setAddonActive(t.id, db.upsertAddon(t.id, key, { slot: 'facts', name: 'facts', body: '[The Key: opens the vault]' })!, true);
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id,
    body: 'The harbour burned all night. The key was in her coat when the roof came down.' });
  answer = [
    { name: 'The Harbour', stands: '[The Harbour: burned out, black water, nobody works it]', label: 'burned',
      line: 'The harbour burned all night', always: '[The Harbour: the town\'s only deep water]',
      pockets: [{ slot: 'atmosphere', name: 'After the fire', body: 'Write smoke and wet ash first; nobody raises their voice here now.' },
                { slot: 'voice', name: 'x', body: 'A place does not have a voice pocket, so this is refused.' },
                { slot: 'facts', name: 'x', body: 'Always true is never a pocket answer.' }] },
    { name: 'The Key', stands: '', label: '', line: 'a line the scene never had', always: '[The Key: a second Always true]', pockets: [] },
  ];
  asked = null;
  await routes['POST /api/remember'](ctx({ storyId: t.id, chapterId: ch0.id }));
  assert.ok(asked.user.includes('The Harbour (place)') && asked.user.includes('The Key (item)'),
    'HEM-ALL-KINDS: every thread the narration names is offered, whatever its kind');
  assert.ok(!asked.user.includes('nobody mentions it'), 'HEM-NAMED-ONLY: and one it does not name is not');
  const mine = db.proposalsOf(t.id) as any[];
  const of = (id: string) => mine.filter((p) => p.entry_id === id);
  const h = of(harbour);
  assert.ok(h.some((p) => p.entry_type === 'state' && /burned out/.test(p.body)), 'HEM-STANDS: a place gets a whole Over time entry');
  assert.ok(h.some((p) => p.field === 'atmosphere' && p.pocket === 'After the fire'), 'HEM-POCKET: and its pocket, by name');
  assert.ok(!h.some((p) => p.field === 'voice'), 'HEM-KIND: a pocket its kind cannot have is refused');
  assert.ok(h.some((p) => p.field === 'facts'), 'HEM-ALWAYS: its empty Always true is offered');
  assert.strictEqual(new Set(h.map((p) => p.grp)).size, 1, 'HEM-ONE-CARD: everything for one thread shares a group');
  assert.ok(h.every((p) => p.line === 'The harbour burned all night'), 'HEM-LINE: each carries the narration line it came from');
  const k = of(key);
  assert.ok(!k.some((p) => p.field === 'facts'), 'HEM-ALWAYS-ONCE: a thread that has an Always true is not offered another');
  assert.ok(k.every((p) => p.line === null), 'HEM-LINE-QUOTED: a line the narration does not contain is not kept');
  ok('hem reviews every thread the scene names, of every kind, as one card each with its line');
}

// ---- FULLY FLESHED (Seth, 2026-10-26): "it not only has to update the characters but make them fully
// fleshed". A new thread from the scene arrives with its pockets, as instructions, and the hem pass
// is told to start the pockets a named thread does not have yet.
{
  const t = db.createStory(me, { title: 'Fleshed', premise: 'p' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: 'Ilse poled the ferry in silence, her coat buttoned to the throat.' });
  found = [{ title: 'Ilse', type: 'character', keys: ['Ilse'], activation: 'triggered', field: 'none',
    body: '[Ilse: the ferrywoman at Sallow crossing]',
    stands: '[Ilse: has taken the stranger across without asking his name]',
    pockets: [{ slot: 'voice', name: 'How she talks', body: 'Hardly at all; one word where three would do.' },
              { slot: 'outfit', name: 'The ferry coat', body: 'A long oilcloth coat, buttoned to the throat.' },
              { slot: 'atmosphere', name: 'x', body: 'A person has no atmosphere pocket, so this one is dropped.' }] }];
  asked = null;
  await routes['POST /api/extract'](ctx({ storyId: t.id, chapterId: ch0.id }));
  found = [];
  assert.match(asked.system + asked.user, /every pocket its kind can have/i, 'FLESH-ASKED: the finder is asked to fill every pocket the scene supports');
  const p: any = (db.proposalsOf(t.id) as any[]).find((x) => x.title === 'Ilse');
  const rooms = JSON.parse(p?.rooms || '{}');
  assert.deepStrictEqual(Object.keys(rooms).filter((k) => k !== 'stands').sort(), ['outfit', 'voice'], 'FLESH-NEW: a new thread arrives with the pockets its kind can have');
  await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: true }));
  const ilse: any = db.entriesOf(t.id).find((e: any) => e.title === 'Ilse');
  const mine = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === ilse.id);
  assert.deepStrictEqual(mine.map((a) => a.slot).sort(), ['facts', 'outfit', 'voice'], 'FLESH-SEWN: sewn in, it has Always true and both pockets');
  assert.ok(mine.find((a) => a.slot === 'voice')?.active, '  and its pockets are on');
  assert.match(ilse.body, /taken the stranger across/, 'FLESH-STANDS: and where it stands is its first Over time entry');
  assert.ok(!/taken the stranger/.test(mine.find((a) => a.slot === 'facts')?.body ?? ''), '  and not in its Always true');
  assert.match(prompts.MEMORY, /pocket\s+it does not have yet/i, 'FLESH-HEM: the hem pass is told to start the pockets a thread lacks');
  ok('a new thread from the scene arrives fully fleshed, and hem fleshes out what it names');
}

// ---- #73 · TIDY THIS THREAD ----
{
  const t = db.createStory(me, { title: 'Tidy', premise: 'p' }) as any;
  const h = db.upsertEntry(t.id, me, { title: 'Halsey', entryType: 'character',
    body: '[Halsey: singer; from Jersey; wears black lace; invited Seth to the gallery]' });
  db.upsertAddon(t.id, h, { slot: 'facts', name: 'facts', body: '[Halsey: 26; a secretary]' });
  const speech = db.upsertAddon(t.id, h, { slot: 'voice', name: 'Speech', body: '[thick Jersey accent even in text]' })!;
  tidied = { always: '[Halsey: a singer from Jersey]', stands: '[Halsey: has invited Seth to the gallery opening]',
    pockets: [{ slot: 'voice', name: 'Speech', body: 'Short, commanding lines. Show the accent only in what she says; the narration never names it.', replaces: 'Speech' },
              { slot: 'outfit', name: 'Black lace', body: 'Black lace under a long coat; the coat stays on in public.', replaces: '' }] };
  const r: any = await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: h }));
  tidied = {};
  assert.ok(!r.error, r.error);
  const mine = (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === h);
  assert.strictEqual(mine.length, 4, `TIDY-CHALKS: Always true, where it stands and two pockets are chalked (${mine.length})`);
  assert.strictEqual(new Set(mine.map((p) => p.grp)).size, 1, '  as one card');
  for (const p of mine) await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: true }));
  const rooms = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === h);
  assert.strictEqual(rooms.find((a) => a.slot === 'facts')?.body, '[Halsey: a singer from Jersey]',
    'TIDY-ALWAYS: sewn in, the tidy rewrites Always true, because the writer asked for it');
  assert.match((db.entriesOf(t.id) as any[]).find((e) => e.id === h).body, /invited Seth/, 'TIDY-STANDS: and where she stands');
  const voices = rooms.filter((a) => a.slot === 'voice');
  assert.deepStrictEqual(voices.map((a) => a.id), [speech], 'TIDY-REPLACES: the descriptive voice is replaced, not doubled');
  assert.match(voices[0].body, /never names it/, '  by the instruction');
  assert.ok(rooms.some((a) => a.slot === 'outfit' && a.name === 'Black lace'), '  and a new pocket lands under its own name');
  ok('Tidy this thread chalks one card that sorts it into its three parts, replacing old pockets');
}

// ---- #74 · ANANSI EDITS ONE SECTION, AND A REJECT CAN BE UNDONE ----
{
  const t = db.createStory(me, { title: 'Redo', premise: 'p' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  const ilse = db.upsertEntry(t.id, me, { title: 'Ilse', body: '[Ilse: a ferrywoman]', entryType: 'character' });
  db.addProposal(t.id, { kind: 'changed', entry_id: ilse, chapterId: ch0.id, title: 'Ilse', entryType: 'character',
    field: 'voice', body: 'She talks a lot.', keys: [], delta: 'voice', grp: 'g1' });
  const p: any = db.proposalsOf(t.id)[0];
  redone = 'Long, wandering lines that stop mid-thought; she never finishes a question.';
  asked = null;
  await routes['POST /api/proposal/redo'](ctx({ storyId: t.id, id: p.id, steer: 'she rambles' }));
  redone = '';
  assert.ok(asked.user.includes('she rambles') && asked.user.includes('a pocket: voice'),
    'REDO-ASKS: the steer and what the section is reach the model');
  assert.strictEqual(db.proposal(t.id, p.id).body, 'Long, wandering lines that stop mid-thought; she never finishes a question.',
    'REDO-CHALKED: the section holds the new text, still waiting');
  assert.strictEqual(db.proposal(t.id, p.id).status, 'open', '  and nothing was sewn in');
  await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: false }));
  assert.strictEqual(db.proposal(t.id, p.id).status, 'rejected');
  await routes['POST /api/proposal/reopen'](ctx({ storyId: t.id, ids: [p.id] }));
  assert.strictEqual(db.proposal(t.id, p.id).status, 'open', 'UNDO-REJECT: a rejected section is back on the Workbench');
  ok('Anansi edits one section on a steer, still chalked, and a reject can be undone');
}

// ---- #89 · HEM IN THE BACKGROUND ----
//
// Pressing Hem this scene closes the scene and opens the next at once; the passes run after the
// answer. A fake that holds every ask proves it: if the route waited on a pass, it would wait here.
const NEXT = { title: 'The Ferry at Dusk', note: 'Oren crosses back with the bell, and somebody on the far bank is waiting for it.',
  opens: 'The river was low.' };
{
  const t = db.createStory(me, { title: 'Background hem', premise: 'A ferry town.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.upsertEntry(t.id, me, { title: 'Oren', body: '[Oren: the ferryman]', entryType: 'character', keys: ['Oren'] });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id,
    body: 'Oren cut the bell down from the ferry post and carried it home.' });
  answer = [{ name: 'Oren', stands: '[Oren: the ferryman, who has taken the ferry bell home]', label: 'took the bell',
    line: 'Oren cut the bell down from the ferry post', always: '', pockets: [] }];
  found = [{ title: 'The Ferry Bell', body: 'Bronze, green with river damp.', type: 'item', keys: ['bell'] }];
  finished = []; tidied = { ...NEXT };
  let release!: () => void;
  gate = new Promise<void>((r) => { release = r; });
  const r: any = await Promise.race([routes['POST /api/chapter/end'](ctx({ storyId: t.id })),
    new Promise((r) => setTimeout(() => r('held'), 3000))]);
  assert.notStrictEqual(r, 'held', 'HEM-AT-ONCE: the hem answers while the model is still holding its first ask');
  assert.notStrictEqual(r.currentChapter?.id, ch0.id, '  with the next scene open');
  assert.strictEqual(sceneOf(r, ch0.id).hem?.state, 'running', 'HEM-RUNNING: the view shows the hem running');
  release(); gate = null;
  await hemSettled(t.id);
  tidied = {};
  const hem = sceneOf(await viewNow(t.id), ch0.id).hem;
  assert.strictEqual(hem?.state, 'done', 'HEM-DONE: and done once the passes settle');
  assert.deepStrictEqual(Object.keys(hem.passes).sort(), ['facts', 'finished', 'memory', 'next', 'summary'],
    `  with a report on every pass (${Object.keys(hem.passes)})`);
  assert.deepStrictEqual(hem.suggestion, NEXT, 'HEM-NEXT: and the next-scene suggestion');
  assert.strictEqual(hem.outOfDate, false, '  and nothing has changed since');
  ok('hem answers at once, and the view shows it running, then done with its report and suggestion');
}


srv.close();
// #13. ONE PROPOSAL PER ROOM, and this is the deterministic half of it. Measured on a real chapter
// end on 2026-08-29: all three characters came back with field "facts" and a body holding several
// rooms at once — `appearance: ... interiority: ...` — so a change to how somebody looks was being
// written into the room that is meant to hold what never changes. Three for three.
//
// Splitting text the model has already labelled is a transform, not a judgement, so it is code and
// it is checked here without a model. The model half — whether it labels at all — is bench/rooms.ts.
{
  const { roomPieces } = await import('../src/routes.ts');
  const slots = [{ name: 'appearance' }, { name: 'facts' }, { name: 'history' },
                 { name: 'interiority' }, { name: 'relationships' }, { name: 'role' }, { name: 'voice' }];

  const plain = roomPieces('appearance', 'Her hands are burned now.', slots);
  assert.deepStrictEqual(plain, [{ field: 'appearance', body: 'Her hands are burned now.' }],
    'an answer that was already the right shape is untouched');

  const real = roomPieces('facts', 'appearance: grey under the light.\n\ninteriority: she is silent.', slots);
  assert.deepStrictEqual(real.map((p: any) => p.field), ['appearance', 'interiority'],
    'the exact live failure splits into the two rooms it actually named');
  assert.strictEqual(real[0]!.body, 'grey under the light.', 'and the label is not left in the body');
  assert.ok(!real.some((p: any) => p.field === 'facts'),
    'and nothing is left in facts, which is where all of it was going');

  const head = roomPieces('facts', 'She is sixty-one.\n\nvoice: quieter now.', slots);
  assert.deepStrictEqual(head.map((p: any) => [p.field, p.body]),
    [['facts', 'She is sixty-one.'], ['voice', 'quieter now.']],
    'text before the first label stays with the field the model declared');

  // A whole-description rewrite — field none — still splits if it labelled itself, because that is
  // three room edits rather than one overwrite, which is the direction this whole phase runs in.
  const none = roomPieces(null, 'role: she runs the desk now.', slots);
  assert.deepStrictEqual(none, [{ field: 'role', body: 'she runs the desk now.' }],
    'a labelled whole-rewrite becomes a room edit instead of an overwrite');

  // NOT EVERY COLON IS A ROOM. Prose is full of them and a greedy split would shred a sentence.
  const prose = roomPieces('history', 'He learned one thing: the ledger was never his.', slots);
  assert.strictEqual(prose.length, 1, 'a colon that is not a room name is left alone');
  ok('a change is split into the rooms it names, and prose colons are not rooms');
}

// The same chapter end produced a character whose whole body was the word "none" — the field's
// vocabulary answered into the body. It is dropped rather than written into a room.
{
  // Trimmed first, exactly as the guard does — asserting the raw regex against untrimmed text
  // tests a string the code never sees.
  const drop = (b: string) => /^none[.\s]*$/i.test(b.trim());
  assert.ok(drop('none') && drop('None.') && drop('  none  '),
    'a body that says only none is recognised, however it is spaced');
  assert.ok(!drop('none of the crew will sail with him'),
    'and a body that BEGINS with none is a real change and is kept');
  ok('a body of the single word "none" is not written into a room');
}

// A room edit carries the CHANGE, not the card. Measured against the live library on 2026-08-29:
// about one proposal in six came back as the whole card restated under a room's label, which
// accepted with Replace writes a whole description into one room.
{
  const { withoutEcho } = await import('../src/routes.ts');
  const card = '[Ilse: 44, harbourmaster at Cordray nine years. Black hair cropped short, a scar '
             + 'through one eyebrow from a winch cable. Keeps the tide book in a canvas satchel.]';
  const rewrite = 'Ilse: 44, harbourmaster at Cordray nine years. Black hair cropped short, a scar '
                + 'through one eyebrow from a winch cable. Her hands are burned to the wrist now.';
  assert.strictEqual(withoutEcho(rewrite, card), 'Her hands are burned to the wrist now.',
    'the card is taken back out and the change is what is left');
  const clean = 'Her hands are burned to the wrist and the scarring will not fade.';
  assert.strictEqual(withoutEcho(clean, card), clean, 'a body that was already the change is untouched');
  assert.strictEqual(withoutEcho(card.replace(/[\[\]]/g, ''), card), '',
    'an answer that is only the card says nothing new and comes back empty');
  // THE 25-CHARACTER FLOOR. Without it a short fragment matches somewhere in the card and the
  // strip eats a real change — the same floor, for the same reason, as the quote check.
  assert.strictEqual(withoutEcho('She is gone.', card), 'She is gone.',
    'a short sentence is kept even if its words appear on the card');
  ok('a room edit carries the change and not the card');
}

console.log(`\n${n} checks passed`);
