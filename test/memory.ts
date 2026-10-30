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
/** And what the where-the-tale-stands pass returns (#125). Empty, so every hem before its own block
 *  chalks nothing for the tale. */
let taleSays = '';
/** And what the where-each-string-stands pass returns (#127): by number. Empty, so no hem moves a string. */
let stringsSay: any[] = [];

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
                                                            finished, style: styled, tale: taleSays, strings: stringsSay }) } }],
           usage: { prompt_tokens: 200, completion_tokens: 60 } });
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

const db = await import('../src/db.ts');
const { routes, hemSettled, tidyPockets } = await import('../src/routes.ts');
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
  ok('a new thread from the scene arrives fully fleshed');
}

// ---- #73 · TIDY THIS THREAD ----
{
  const t = db.createStory(me, { title: 'Tidy', premise: 'p' }) as any;
  const h = db.upsertEntry(t.id, me, { title: 'Halsey', entryType: 'character',
    body: '[Halsey: singer; from Jersey; wears black lace; invited Seth to the gallery]' });
  db.upsertAddon(t.id, h, { slot: 'facts', name: 'facts', body: '[Halsey: 26; a secretary]' });
  const speech = db.upsertAddon(t.id, h, { slot: 'voice', name: 'Speech', body: '[thick Jersey accent even in text]' })!;
  db.setAddonActive(t.id, speech, true);   // on: Tidy sees, and replaces, only the pockets that are on
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
  assert.strictEqual(rooms.find((a) => a.slot === 'facts')?.body, 'a singer from Jersey',
    'TIDY-ALWAYS: sewn in, the tidy rewrites Always true, because the writer asked for it');
  assert.match((db.entriesOf(t.id) as any[]).find((e) => e.id === h).body, /invited Seth/, 'TIDY-STANDS: and where she stands');
  const voices = rooms.filter((a) => a.slot === 'voice');
  assert.deepStrictEqual(voices.map((a) => a.id), [speech], 'TIDY-REPLACES: the descriptive voice is replaced, not doubled');
  assert.match(voices[0].body, /never names it/, '  by the instruction');
  assert.ok(rooms.some((a) => a.slot === 'outfit' && a.name === 'Black lace'), '  and a new pocket lands under its own name');
  ok('Tidy this thread chalks one card that sorts it into its three parts, replacing old pockets');
}

// #114 · NO PROMPT THAT WRITES WHERE A THREAD STANDS ASKS FOR A BRACKET. TIDY asked for "one bracket"
// and the trial tidy kept `[Seth: 30s; …]`; the code frames it for the model now (context.ts).
{
  for (const [name, text] of Object.entries({ TIDY: prompts.TIDY, MEMORY: prompts.MEMORY, REDO: prompts.REDO, EXTRACT: prompts.EXTRACT })) {
    assert.doesNotMatch(text, /one bracket/i, `STANDS-ASK-${name}: it no longer asks for where it stands in one bracket`);
    const line = text.split('\n').findIndex((l) => /^\s*(stands|where it stands)\s/.test(l) || /^And stands/.test(l));
    assert.ok(line >= 0, `  ${name} has a line asking for where it stands`);
    assert.match(text.split('\n').slice(line, line + 4).join(' '), /plain description/,
      `STANDS-PLAIN-${name}: and asks for it as a plain description`);
  }
  ok('the prompts ask for where a thread stands as a plain description, never a bracket');
}

// #114 · TIDY MERGES POCKETS OF ONE KIND THAT OVERLAP INTO ONE, AND IT REPLACES BOTH. The trial left two
// relationships pockets about Ashley as two. A merge names every pocket it replaces; sewn in, the first
// is rewritten and the rest are gone. A third pocket of the same kind, rewritten on its own, still lands.
{
  const t = db.createStory(me, { title: 'Merge', premise: 'p' }) as any;
  const seth = db.upsertEntry(t.id, me, { title: 'Seth', entryType: 'character', body: '30s' })!;
  const ash = db.upsertAddon(t.id, seth, { slot: 'relationships', name: 'Ashley', body: 'drawn to Ashley' })!;
  const stranger = db.upsertAddon(t.id, seth, { slot: 'relationships', name: 'The stranger', body: 'a stranger to Ashley, and patient with her' })!;
  const marcus = db.upsertAddon(t.id, seth, { slot: 'relationships', name: 'Marcus', body: 'dislikes Marcus' })!;
  for (const id of [ash, stranger, marcus]) db.setAddonActive(t.id, id, true);
  assert.match(prompts.TIDY, /merge/i, 'MERGE-ASK: the prompt asks for overlapping pockets of one kind to be merged');
  assert.strictEqual((prompts.TIDY_SCHEMA as any).properties.pockets.items.properties.replaces.type, 'array',
    'MERGE-SCHEMA: and a pocket can name more than one it replaces');
  tidied = { always: '', stands: '', kept: '', pockets: [
    { slot: 'relationships', name: 'Ashley', body: 'A stranger to Ashley, drawn to her and patient.', replaces: ['Ashley', 'The stranger'] },
    { slot: 'relationships', name: 'Marcus', body: 'Wary of Marcus, and does not hide it.', replaces: ['Marcus'] }] };
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: seth }));
  tidied = {};
  const chalked = (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === seth && p.field === 'relationships');
  assert.strictEqual(chalked.length, 2, `MERGE-CHALKS: the merge and the rewrite are both chalked (${chalked.length})`);
  const shown = (viewNow(t.id).proposals as any[]).find((p) => p.target === ash);
  assert.deepStrictEqual(shown?.merges, [stranger], 'MERGE-SHOWN: the card is told which other pocket the merge replaces');
  for (const p of chalked) await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: true }));
  const rel = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === seth && a.slot === 'relationships');
  assert.deepStrictEqual(rel.map((a) => a.id).sort(), [ash, marcus].sort(), `MERGE-REPLACES-BOTH: sewn in, the two about Ashley are one (${rel.map((a) => a.name).join(', ')})`);
  assert.match(rel.find((a) => a.id === ash).body, /drawn to her and patient/, '  holding the merged text');
  assert.match(rel.find((a) => a.id === marcus).body, /Wary of Marcus/, '  and the other pocket of the kind is rewritten on its own');
  assert.ok(!rel.some((a) => a.id === stranger), '  and the second is gone');
  // #114 · AND IT IS NOT LOST: its text is in the thread's history, named, and putting it back makes the
  // pocket again with its kind, name and text, switched off.
  const gone = (db.entryHistory(t.id, seth) as any[]).find((r) => r.field === `pocket:${stranger}`);
  assert.strictEqual(gone?.previous_value, 'a stranger to Ashley, and patient with her', 'MERGE-KEPT: the merged-away pocket\'s text is in the history');
  assert.match(gone?.label ?? '', /The stranger/, '  under its name');
  assert.ok(db.revertEntryField(t.id, seth, gone.id), 'MERGE-RESTORE: and the revert takes it');
  const back = (db.addonsOf(t.id) as any[]).find((a) => a.entry_id === seth && a.name === 'The stranger');
  assert.deepStrictEqual(back && [back.slot, back.body, back.active], ['relationships', 'a stranger to Ashley, and patient with her', 0],
    'MERGE-RESTORED: the pocket is back with its kind, name and text, switched off');

  // A name that is not one of this thread's pockets of that kind merges nothing away.
  const other = db.upsertEntry(t.id, me, { title: 'Ashley', entryType: 'character', body: '28' })!;
  const hers = db.upsertAddon(t.id, other, { slot: 'relationships', name: 'Seth', body: 'wary of Seth' })!;
  db.setAddonActive(t.id, hers, true);
  tidied = { always: '', stands: '', kept: '', pockets: [
    { slot: 'relationships', name: 'Seth', body: 'Wary of Seth.', replaces: ['Seth', 'Marcus', 'Nobody'] }] };
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: other }));
  tidied = {};
  for (const p of (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === other))
    await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: true }));
  assert.ok((db.addonsOf(t.id) as any[]).some((a) => a.id === marcus), 'MERGE-OWN-ONLY: a pocket of another thread is never merged away');
  assert.ok((db.addonsOf(t.id) as any[]).some((a) => a.id === hers && /Wary of Seth/.test(a.body)), '  while its own is rewritten');
  ok('Tidy merges overlapping pockets of one kind into one, replacing both');
}

// #114 · TIDY RESOLVES A CONTRADICTION BETWEEN ALWAYS TRUE AND WHERE IT STANDS, AND SAYS WHICH IT KEPT.
// The trial: Always true said 34 and a web developer, where it stands said 30s, and nothing changed.
// The fake stands in for the model's answer, so this proves what the route does with it: the part that
// changed is chalked, the one that only lost its wrapper is not, and the card carries which was kept.
{
  assert.match(prompts.TIDY, /Always true and where it stands/i, 'KEPT-ASK: the prompt names the two parts that can disagree');
  assert.match(prompts.TIDY, /\bkept\b/, '  and asks which it kept');
  assert.ok((prompts.TIDY_SCHEMA as any).required.includes('kept'), 'KEPT-SCHEMA: the answer carries which it kept');
  const t = db.createStory(me, { title: 'Contradiction', premise: 'p' }) as any;
  const seth = db.upsertEntry(t.id, me, { title: 'Seth', entryType: 'character', body: '30s; a stranger Ashley meets on the street' })!;
  db.upsertAddon(t.id, seth, { slot: 'facts', name: 'facts', body: '34; a web developer' });
  const kept = 'Kept 34 from Always true over "30s" in where it stands: it is the more specific.';
  tidied = { always: '[Seth: 34; a web developer]', stands: 'A stranger Ashley meets on the street.', kept, pockets: [] };
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: seth }));
  tidied = {};
  const chalked = (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === seth);
  assert.ok(!chalked.some((p) => p.field === 'facts'), 'KEPT-SAME-ALWAYS: an Always true that differs only by its wrapper is not a change');
  assert.ok(chalked.some((p) => !p.field && /stranger Ashley/.test(p.body) && !/30s/.test(p.body)), 'KEPT-STANDS: where it stands, without the losing side, is chalked');
  const card = (viewNow(t.id).proposals as any[]).filter((p) => p.entryId === seth);
  assert.ok(card.some((p) => p.line === kept), `KEPT-SAID: the card says which it kept (${card.map((p) => p.line).join(' | ')})`);
  for (const p of chalked) await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: true }));

  // The other way round: where it stands is the later one, so Always true changes, and sewn in, it does.
  tidied = { always: '35; a web developer', stands: '', kept: 'Kept 35 from where it stands: it is the later.', pockets: [] };
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: seth }));
  tidied = {};
  const always = (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === seth && p.field === 'facts');
  assert.strictEqual(always.length, 1, 'KEPT-ALWAYS: an Always true that differs is chalked');
  await routes['POST /api/proposal'](ctx({ storyId: t.id, id: always[0].id, accept: true }));
  assert.strictEqual((db.addonsOf(t.id) as any[]).find((a) => a.entry_id === seth && a.slot === 'facts')?.body, '35; a web developer',
    'KEPT-APPLIED: sewn in, Always true is changed');
  ok('Tidy resolves Always true against where it stands, chalks the change, and says which it kept');
}

// #114 · WITH AN OVER TIME ENTRY IN FORCE, TIDY'S "WHERE IT STANDS" REWRITES THAT ENTRY. It wrote the
// thread's own text, which an entry in force hides, so the change never reached the scene being written,
// and the text from scene 1 was rewritten with what is true later. The entry keeps its label.
{
  const t = db.createStory(me, { title: 'In force', premise: 'p' }) as any;
  const seth = db.upsertEntry(t.id, me, { title: 'Seth', entryType: 'character', body: 'a stranger on the street' })!;
  const st = db.upsertState(t.id, seth, { fromChapter: 1, body: 'has met Ashley; 30s', label: 'met Ashley', beforeMode: 'hide' });
  tidied = { always: '', stands: 'Has met Ashley at the diner.', kept: '', pockets: [] };
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: seth }));
  tidied = {};
  const chalked = (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === seth);
  assert.strictEqual(chalked.length, 1, `  one row chalked (${chalked.length})`);
  await routes['POST /api/proposal'](ctx({ storyId: t.id, id: chalked[0].id, accept: true }));
  const states = db.statesForStory(t.id).get(seth) ?? [];
  assert.deepStrictEqual(states.map((s: any) => [s.id, s.body, s.label]), [[st, 'Has met Ashley at the diner.', 'met Ashley']],
    `STANDS-IN-FORCE: sewn in, the entry in force is rewritten and keeps its label (${JSON.stringify(states)})`);
  assert.strictEqual((db.entriesOf(t.id) as any[]).find((e) => e.id === seth).body, 'a stranger on the street',
    'STANDS-BASE-KEPT: and the thread\'s own text, from scene 1, is left as it was');
  ok('Tidy rewrites the Over time entry in force, not the text it stands in for');
}

// #114 · THE LOCK POCKET IS NEVER SENT TO TIDY AND NEVER REPLACED BY IT. A trial tidy rewrote the
// Hands-off thread's "his lines are the writer's" into a description of how he speaks, with the lock
// sentence buried in it. Two shapes: the Hands-off thread's voice pocket, whatever it holds, and any
// voice pocket holding the lock's own text.
{
  const t = db.createStory(me, { title: 'Lock', premise: 'p' }) as any;
  db.updateStory(t.id, { persona: 'Ashley', lockedCharacter: 'Seth', lockoutOn: true });
  const seth = db.upsertEntry(t.id, me, { title: 'Seth', entryType: 'character', body: '30s; calm' })!;
  const lock = db.upsertAddon(t.id, seth, { slot: 'voice', name: 'Their lines are yours', body: prompts.YOURS_VOICE('Seth') })!;
  db.setAddonActive(t.id, db.upsertAddon(t.id, seth, { slot: 'appearance', name: 'Ring', body: 'a silver ring' })!, true);
  tidied = { always: '', stands: '', pockets: [
    { slot: 'voice', name: 'How he speaks', body: 'Calm, unhurried lines.', replaces: 'Their lines are yours' },
    { slot: 'voice', name: 'Fresh', body: 'Low and slow.', replaces: '' },
    { slot: 'appearance', name: 'Ring', body: 'A silver ring he turns when he waits.', replaces: 'Ring' }] };
  asks.length = 0;
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: seth }));
  const sent = askOf(prompts.TIDY)?.user ?? '';
  assert.ok(sent.includes('silver ring'), `LOCK-ASK: the tidy was asked (${sent.slice(0, 80)})`);
  assert.ok(!sent.includes("lines are the writer's") && !sent.includes('Their lines are yours'),
    `LOCK-UNSENT: the lock pocket is not sent to Tidy (${sent})`);
  const chalked = (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === seth);
  assert.ok(!chalked.some((p) => p.field === 'voice'), `LOCK-UNREPLACED: no voice pocket is chalked for the Hands-off thread (${chalked.map((p) => p.field).join(',')})`);
  assert.ok(chalked.some((p) => p.field === 'appearance'), '  while its other pockets are');
  for (const p of chalked) await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: true }));
  const voices = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === seth && a.slot === 'voice');
  assert.deepStrictEqual(voices.map((a) => [a.id, a.body]), [[lock, prompts.YOURS_VOICE('Seth')]], 'LOCK-KEPT: sewn in, the lock pocket is as it was');

  // Hands off switched off: the thread is no longer held, but a voice pocket holding the lock's text
  // is still the lock, and still not Tidy's.
  db.updateStory(t.id, { lockoutOn: false });
  tidied = { always: '', stands: '', pockets: [{ slot: 'voice', name: 'How he speaks', body: 'Calm.', replaces: 'Their lines are yours' }] };
  asks.length = 0;
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: seth }));
  tidied = {};
  assert.ok(!(askOf(prompts.TIDY)?.user ?? '').includes("lines are the writer's"), 'LOCK-TEXT: a voice pocket holding the lock text is not sent either');
  assert.ok(!(db.proposalsOf(t.id) as any[]).some((p) => p.entry_id === seth && p.field === 'voice'), '  nor replaced');
  ok('Tidy never sends or replaces the lock pocket');
}

// ---- MERGE TWO THREADS (Seth, 2026-10-29). Anansi drafts the one thread two make, in one call;
// nothing is written until the writer approves it, and then `db.mergeThreads` writes it.
{
  const t = db.createStory(me, { title: 'Bedlam', premise: 'p' }) as any;
  db.updateStory(t.id, { persona: 'Ashley', lockedCharacter: 'Seth', lockoutOn: true });
  const lisa = db.upsertEntry(t.id, me, { title: 'Lisa', entryType: 'character', body: 'Runs the door.' })!;
  const pub = db.upsertEntry(t.id, me, { title: "Halsey's publicist", entryType: 'character', body: 'Books the shows.' })!;
  const seth = db.upsertEntry(t.id, me, { title: 'Seth', entryType: 'character', body: 'Quiet.' })!;
  db.upsertAddon(t.id, lisa, { slot: 'facts', name: 'facts', body: 'A woman in her thirties.' });
  db.upsertAddon(t.id, pub, { slot: 'facts', name: 'facts', body: 'Sharp, 34.' });
  const on = (e: string, slot: string, name: string, body: string) => {
    const id = db.upsertAddon(t.id, e, { slot, name, body })!; db.setAddonActive(t.id, id, true); return id;
  };
  const lisaVoice = on(lisa, 'voice', 'Clipped', 'Short lines.');
  const pubVoice = on(pub, 'voice', 'Sales', 'Talks in pitches.');
  const pubOff = db.upsertAddon(t.id, pub, { slot: 'relationships', name: 'Old flame', body: 'Once dated Marek.' })!;
  const lock = db.upsertAddon(t.id, seth, { slot: 'voice', name: 'Their lines are yours', body: prompts.YOURS_VOICE('Seth') })!;
  db.setAddonActive(t.id, lock, true);
  const sethLook = on(seth, 'appearance', 'Ring', 'A silver ring.');
  const before = JSON.stringify([db.entriesOf(t.id), db.addonsOf(t.id)]);

  tidied = { always: '[Lisa: a woman of 34; she books Halsey\'s shows]', stands: 'Lisa: runs the door and books the shows.',
    kept: 'Kept 34 over in her thirties: it is the more specific.',
    pockets: [{ slot: 'voice', name: 'Clipped pitch', body: 'Short lines that sell.', replaces: ['1', '2'] }] };
  asks.length = 0;
  const r: any = await routes['POST /api/merge/draft'](ctx({ storyId: t.id, keepId: lisa, goneId: pub }));
  tidied = {};
  assert.ok(!r.error, r.error);
  const sent = askOf(prompts.MERGE)?.user ?? '';
  for (const bit of ['Lisa', "Halsey's publicist", 'A woman in her thirties.', 'Sharp, 34.', 'Runs the door.', 'Books the shows.',
    'Short lines.', 'Talks in pitches.'])
    assert.ok(sent.includes(bit), `MERGE-ASK: both threads are sent whole (${bit} missing from ${sent})`);
  assert.ok(!sent.includes('Once dated Marek'), '  but not a pocket switched off, which is the writer\'s choice and moves across as it is');
  assert.strictEqual(r.always.now, "a woman of 34; she books Halsey's shows", 'MERGE-PLAIN: Always true comes back a plain description');
  assert.strictEqual(r.always.was, 'A woman in her thirties.', "MERGE-WAS: against the kept thread's own text");
  assert.strictEqual(r.stands.now, 'runs the door and books the shows.', '  and so does where it stands');
  assert.strictEqual(r.stands.was, 'Runs the door.', "  against where the kept thread stands now");
  assert.match(r.kept, /34/, 'MERGE-KEPT: what disagreed and which was kept rides along');
  assert.deepStrictEqual(r.pockets.map((p: any) => [p.slot, p.body, p.target, p.merges, p.was]),
    [['voice', 'Short lines that sell.', lisaVoice, [pubVoice], 'Short lines.']],
    'MERGE-POCKETS: one pocket per kind, standing in for both, shown against the kept pocket');
  assert.strictEqual(JSON.stringify([db.entriesOf(t.id), db.addonsOf(t.id)]), before, 'MERGE-DRAFT-WRITES-NOTHING: a draft writes nothing');

  // THE LOCK: a thread the writer plays or holds Hands off keeps its voice out of the draft both ways.
  const pub2 = db.upsertEntry(t.id, me, { title: 'The quiet man', entryType: 'character', body: 'Says little.' })!;
  const quiet = on(pub2, 'voice', 'Mumbles', 'He mumbles.');
  tidied = { always: 'Quiet.', stands: 'Quiet.', kept: '', pockets: [
    { slot: 'voice', name: 'How he speaks', body: 'Calm.', replaces: ['1', '3'] },
    { slot: 'appearance', name: 'Ring', body: 'A silver ring he turns.', replaces: ['2'] }] };
  asks.length = 0;
  const l: any = await routes['POST /api/merge/draft'](ctx({ storyId: t.id, keepId: seth, goneId: pub2 }));
  tidied = {};
  const lockSent = askOf(prompts.MERGE)?.user ?? '';
  assert.ok(!lockSent.includes("lines are the writer's") && !lockSent.includes('He mumbles'), `MERGE-LOCK-UNSENT: no voice is sent when one holds the lock (${lockSent})`);
  assert.ok(!l.pockets.some((p: any) => p.slot === 'voice'), 'MERGE-LOCK-UNDRAFTED: and none comes back');
  assert.deepStrictEqual(l.pockets.map((p: any) => p.target), [sethLook], '  while the other pockets do');
  // And the write refuses one anyway, from a client that sends it.
  const w: any = await routes['POST /api/merge'](ctx({ storyId: t.id, keepId: seth, goneId: pub2, always: 'Quiet.', stands: 'Quiet.',
    pockets: [{ slot: 'voice', name: 'Rewritten', body: 'Calm.', target: lock, merges: [quiet] }] }));
  assert.ok(!w.error, w.error);
  const sethVoices = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === seth && a.slot === 'voice');
  assert.deepStrictEqual(sethVoices.map((a) => [a.id, a.body, a.active]).sort(),
    [[lock, prompts.YOURS_VOICE('Seth'), 1], [quiet, 'He mumbles.', 0]].sort(),
    'MERGE-LOCK-KEPT: the lock pocket is as it was, and the other voice moves across switched off');

  // REFUSED BEFORE ANY CALL: the tale's own thread.
  const tale = db.taleThread(t.id)!;
  const was = calls;
  const no: any = await routes['POST /api/merge/draft'](ctx({ storyId: t.id, keepId: lisa, goneId: tale }));
  assert.match(String(no.error), /tale's own thread/, "MERGE-TALE-ROUTE: the tale's own thread is refused");
  assert.strictEqual(calls, was, '  before the model is asked anything');
  ok('Merge drafts the one thread two make, writes nothing until approved, and keeps the lock pocket out');
}

// THE WRITE, from the reviewed draft as the writer edited it.
{
  const t = db.createStory(me, { title: 'Bedlam, merged', premise: 'p' }) as any;
  const lisa = db.upsertEntry(t.id, me, { title: 'Lisa', entryType: 'character', body: 'Runs the door.' })!;
  const pub = db.upsertEntry(t.id, me, { title: "Halsey's publicist", entryType: 'character', body: 'Books the shows.' })!;
  const r: any = await routes['POST /api/merge'](ctx({ storyId: t.id, keepId: lisa, goneId: pub,
    always: 'A woman of 34, edited by the writer.', stands: 'Runs the door and books the shows.', pockets: [] }));
  assert.ok(!r.error, r.error);
  assert.ok(Array.isArray(r.entries) && !r.entries.some((e: any) => e.id === pub), 'MERGE-ROUTE: the answer is the tale, without the other thread');
  assert.strictEqual((db.addonsOf(t.id) as any[]).find((a) => a.entry_id === lisa && a.slot === 'facts')?.body,
    'A woman of 34, edited by the writer.', "MERGE-ROUTE-EDITED: what the writer typed is what is written");
  const no: any = await routes['POST /api/merge'](ctx({ storyId: t.id, keepId: lisa, goneId: pub, always: 'x', stands: 'y', pockets: [] }));
  assert.ok(no.error, 'MERGE-ROUTE-TWICE: a thread already merged away cannot be merged again');
  ok('Merge writes the reviewed draft and answers with the tale');
}

// TIDY'S ANSWER IS THE THREAD'S WHOLE POCKET SET, kind by kind. The trial on Seth's thread
// (2026-10-28, the real model): a new pocket for each kind, but `replaces` named for one only, and
// sewn in, the old ones stayed beside the new. Now an answered pocket stands in for the pocket it
// names, then for the next one of its kind in order, and any old pocket of a kind it answered that
// is still left over is merged away, into the history. A kind it does not answer is left alone.
{
  const t = db.createStory(me, { title: 'Whole set', premise: 'p' }) as any;
  db.updateStory(t.id, { persona: 'Ashley', lockedCharacter: 'Seth', lockoutOn: true });
  const seth = db.upsertEntry(t.id, me, { title: 'Seth', entryType: 'character', body: '30s' })!;
  // All on, as they were in use: a pocket that is switched off is not Tidy's (the next block).
  const add = (slot: string, name: string, body: string) => {
    const id = db.upsertAddon(t.id, seth, { slot, name, body })!;
    db.setAddonActive(t.id, id, true);
    return id;
  };
  const lock = add('voice', 'Their lines are yours', prompts.YOURS_VOICE('Seth'));
  const look = add('appearance', 'Look', 'tall, dark coat');
  const clothes = add('outfit', 'Street clothes', 'jeans and a jacket');
  const lonely = add('interiority', 'Lonely', 'lonely, and hides it');
  const ashley = add('relationships', 'Ashley', 'drawn to Ashley');
  const drawn = add('relationships', 'Drawn to Ashley', 'patient with Ashley');
  const before = new Map((db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === seth).map((a) => [a.id, a.body]));
  const answer = [
    { slot: 'appearance', name: 'Streetlight details', body: 'Under the streetlight his coat looks black.', replaces: [] },
    { slot: 'interiority', name: 'Externalized loneliness', body: 'His loneliness shows in what he does, never in what he thinks.', replaces: [] },
    { slot: 'outfit', name: 'Walk attire', body: 'Jeans and a jacket for the walk.', replaces: [] },
    { slot: 'relationships', name: 'Ashley interaction', body: 'Drawn to Ashley and patient with her.', replaces: ['drawn to ashley '] },
    { slot: 'voice', name: 'How he talks', body: 'Short, dry lines.', replaces: [] }];

  // The deciding function, alone: which old pocket each answered pocket stands in for, and which go.
  const old = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === seth);
  const plan = tidyPockets(old, answer, ['appearance', 'interiority', 'outfit', 'relationships', 'voice'], true);
  assert.deepStrictEqual(plan.map((p: any) => [p.slot, p.target, p.merges]),
    [['appearance', look, []], ['interiority', lonely, []], ['outfit', clothes, []], ['relationships', drawn, [ashley]]],
    `WHOLE-PLAN: each answered pocket stands in for one old pocket of its kind, named first, then in order (${JSON.stringify(plan)})`);
  assert.deepStrictEqual(tidyPockets(old, [], ['relationships'], true), [], 'WHOLE-EMPTY: no pockets answered, nothing replaced');

  tidied = { always: '', stands: '', kept: '', pockets: answer };
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: seth }));
  tidied = {};
  for (const p of (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === seth))
    await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: true }));
  const now = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === seth && a.slot !== 'facts');
  const byKind = (slot: string) => now.filter((a) => a.slot === slot).map((a) => a.name);
  assert.deepStrictEqual(['appearance', 'interiority', 'outfit', 'relationships'].map(byKind),
    [['Streetlight details'], ['Externalized loneliness'], ['Walk attire'], ['Ashley interaction']],
    `WHOLE-SET: sewn in, one pocket per kind, the answer's (${now.map((a) => `${a.slot}:${a.name}`).join(', ')})`);
  assert.deepStrictEqual(now.filter((a) => a.slot === 'voice').map((a) => [a.id, a.body]), [[lock, prompts.YOURS_VOICE('Seth')]],
    'WHOLE-LOCK: the lock pocket is untouched');
  const hist = db.entryHistory(t.id, seth) as any[];
  for (const id of [look, clothes, lonely, ashley, drawn])
    assert.ok(hist.some((r) => r.field === `pocket:${id}` && r.previous_value === before.get(id)),
      `WHOLE-HISTORY: the old text of ${id} ("${before.get(id)}") is in the history`);

  // A tidy that answers no pockets changes none.
  const kept = JSON.stringify((db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === seth));
  tidied = { always: '', stands: 'Walking Ashley home.', kept: '', pockets: [] };
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: seth }));
  tidied = {};
  for (const p of (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === seth))
    await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: true }));
  assert.strictEqual(JSON.stringify((db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === seth)), kept,
    'WHOLE-NONE: a tidy with no pockets changes no pockets');
  ok("Tidy's pockets replace the thread's pockets kind by kind, and the old texts are kept");
}

// A SWITCHED-OFF POCKET IS NOT TIDY'S. The trial on Marcus (2026-10-28, the real model): each kind had
// one pocket on and one off, Tidy was sent both, rewrote the voice in use with the unused one's text,
// and switched the outfit he does not wear back on. Off is the writer's choice: never sent, never
// replaced, never merged away, and still off after the tidy is sewn in.
{
  const t = db.createStory(me, { title: 'Marcus', premise: 'p' }) as any;
  const marcus = db.upsertEntry(t.id, me, { title: 'Marcus', entryType: 'character', body: '40s' })!;
  const add = (slot: string, name: string, body: string, on: boolean) => {
    const id = db.upsertAddon(t.id, marcus, { slot, name, body })!;
    if (on) db.setAddonActive(t.id, id, true);
    return id;
  };
  const clipped = add('voice', 'Clipped', "Write his lines as the writer's: clipped, demanding, always returning to her name.", true);
  add('voice', 'Patient', 'complete sentences, patient, never raises his voice', false);
  const suit = add('outfit', 'Suit', 'a charcoal suit', true);
  add('outfit', 'Gym clothes', 'grey sweats and trainers', false);
  const scar = add('appearance', 'Scar', 'a scar through his left eyebrow', true);
  add('appearance', 'Young', 'clean-shaven, at twenty', false);
  const rival = add('relationships', 'Rival', 'resents his brother', true);
  const off = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === marcus && !a.active && a.slot !== 'facts');
  tidied = { always: '', stands: '', kept: '', pockets: [
    { slot: 'voice', name: 'Patient', body: 'Complete sentences, patient; he never raises his voice.', replaces: ['Patient'] },
    { slot: 'outfit', name: 'Gym clothes', body: 'Grey sweats and trainers.', replaces: ['Gym clothes'] },
    { slot: 'appearance', name: 'Scarred brow', body: 'A scar runs through his left eyebrow.', replaces: [] }] };
  asks.length = 0;
  await routes['POST /api/tidy'](ctx({ storyId: t.id, entryId: marcus }));
  tidied = {};
  const sent = askOf(prompts.TIDY)?.user ?? '';
  assert.ok(sent.includes('charcoal suit'), `OFF-ASK: the tidy was asked, with the pockets that are on (${sent.slice(0, 80)})`);
  for (const a of off) assert.ok(!sent.includes(a.body), `OFF-UNSENT: the switched-off ${a.slot} "${a.name}" is not sent to Tidy`);
  for (const p of (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === marcus))
    await routes['POST /api/proposal'](ctx({ storyId: t.id, id: p.id, accept: true }));
  const now = (db.addonsOf(t.id) as any[]).filter((a) => a.entry_id === marcus && a.slot !== 'facts');
  for (const a of off) assert.deepStrictEqual(now.find((x) => x.id === a.id) && [now.find((x) => x.id === a.id).body, now.find((x) => x.id === a.id).active],
    [a.body, 0], `OFF-KEPT: the switched-off ${a.slot} "${a.name}" is as it was, and still off`);
  const on = (slot: string) => now.filter((a) => a.slot === slot && a.active).map((a) => [a.id, a.body]);
  assert.deepStrictEqual(on('voice'), [[clipped, 'Complete sentences, patient; he never raises his voice.']],
    'OFF-ON-REPLACED: the answer stands in for the voice that is on');
  assert.deepStrictEqual(on('outfit'), [[suit, 'Grey sweats and trainers.']], '  and the outfit he wears stays the one worn');
  assert.deepStrictEqual(on('appearance'), [[scar, 'A scar runs through his left eyebrow.']], '  and the appearance that is on');
  assert.deepStrictEqual(on('relationships'), [[rival, 'resents his brother']], 'OFF-UNASKED: a kind the answer does not name is left alone');
  ok('Tidy is sent, and replaces, only the pockets that are switched on');
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
  finished = [{ card: 'Oren', quote: 'Oren cut the bell down from the ferry post' }]; tidied = { ...NEXT };
  let release!: () => void;
  gate = new Promise<void>((r) => { release = r; });
  const r: any = await Promise.race([routes['POST /api/chapter/end'](ctx({ storyId: t.id })),
    new Promise((r) => setTimeout(() => r('held'), 3000))]);
  assert.notStrictEqual(r, 'held', 'HEM-AT-ONCE: the hem answers while the model is still holding its first ask');
  assert.notStrictEqual(r.currentChapter?.id, ch0.id, '  with the next scene open');
  assert.strictEqual(sceneOf(r, ch0.id).hem?.state, 'running', 'HEM-RUNNING: the view shows the hem running');
  // WHICH PASS, AND SINCE WHEN (2026-10-27): a slow remote model looked like nothing happening.
  const cur = sceneOf(await viewNow(t.id), ch0.id).hem?.current;
  assert.strictEqual(cur?.pass, 'summary', 'HEM-CURRENT: the view says which pass is running');
  assert.ok(cur?.since > 0, '  and since when');
  release(); gate = null;
  await hemSettled(t.id);
  tidied = {}; finished = [];
  const hem = sceneOf(await viewNow(t.id), ch0.id).hem;
  assert.strictEqual(hem?.state, 'done', 'HEM-DONE: and done once the passes settle');
  assert.deepStrictEqual(Object.keys(hem.passes).sort(), ['facts', 'finished', 'memory', 'next', 'summary', 'tale'],
    `  with a report on every pass (${Object.keys(hem.passes)})`);
  assert.deepStrictEqual(hem.suggestion, NEXT, 'HEM-NEXT: and the next-scene suggestion');
  assert.strictEqual(hem.outOfDate, false, '  and nothing has changed since');
  ok('hem answers at once, and the view shows it running, then done with its report and suggestion');
  const chalked = db.proposalsOf(t.id) as any[];
  assert.ok(chalked.some((p) => p.entry_type === 'state') && chalked.some((p) => p.title === 'The Ferry Bell')
    && chalked.some((p) => p.entry_type === 'retire'),
    `the hem chalked a thread change, a new thread and a retirement (${chalked.map((p) => `${p.entry_type}:${p.title}`)})`);
  assert.deepStrictEqual([...new Set(chalked.map((p) => p.grp))], [`scene:${ch0.id}`],
    'HEM-SCENE-GROUP: everything one hem chalks shares the scene group');
  ok('  and everything it chalked is one scene group');
  // DISMISSED FOR GOOD, until the next hem (2026-10-27).
  const set = routes['POST /api/dismiss'](ctx({ storyId: t.id, kind: 'hem', ref: `${ch0.id}:${hem.startedAt}` }));
  assert.strictEqual(sceneOf(set, ch0.id).hem?.dismissed, true, 'HEM-DISMISSED: a dismissed hem says so in the view');
  ok('  and it can be dismissed, by the existing set-aside route');
  assert.strictEqual(sceneOf(await viewNow(t.id), ch0.id).hem?.current, null, '  and a finished hem has no current pass');
}


// ---- THE NEXT SCENE, STEERED AND ASKED AGAIN AWAY FROM THE LAST (2026-10-27) ----
// Seth: "I'd need a way to enter direction for the ai and a way to re roll away from what it's
// suggesting". The writer's direction goes in last; the last suggestion goes in as one not to repeat.
{
  const t = db.createStory(me, { title: 'Steered', premise: 'A ferry town.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: 'The ferry left without him.' });
  tidied = { ...NEXT };
  const r: any = await routes['POST /api/chapter/propose'](ctx({ storyId: t.id, chapterId: ch0.id,
    steer: 'He swims after it.', avoid: { title: 'The Ferry at Dusk', note: 'Oren crosses back.', opens: 'The river was low.' } }));
  assert.ok(!r.error, r.error);
  const user = String(asked?.user ?? '');
  assert.match(user, /NOT THIS AGAIN[\s\S]*The Ferry at Dusk[\s\S]*Oren crosses back\./, 'STEER-AWAY: the last suggestion is sent as one not to repeat');
  assert.match(user, /THE WRITER WANTS THIS CHAPTER TO: He swims after it\./, 'STEER-WANT: and the writer\'s direction is sent');
  assert.ok(user.indexOf('NOT THIS AGAIN') < user.indexOf('THE WRITER WANTS'), '  with the direction last, closest to the ask');
  tidied = {};
}
ok('the next scene can be asked again with a direction, away from the last suggestion');

// ---- THE HEM ASKS FOR THE NEXT SCENE, AND DOES NOT GUESS IT FIRST (Seth, 2026-10-30) ----
// "we start hemming and it asks how the next scene should start. While that's filled out the ai does
// the rest ... So it wouldn't run that check first." The close runs every pass but the next scene;
// the writer's direction asks for it, and what comes back goes into the scene itself, where the
// writing prompt reads it ("it's not passed to the scene").
{
  const t = db.createStory(me, { title: 'Asked first', premise: 'A ferry town.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: 'The ferry left without him.' });
  tidied = { ...NEXT }; asks.length = 0;
  const r: any = await routes['POST /api/chapter/end'](ctx({ storyId: t.id, next: false }));
  await hemSettled(t.id);
  const opened = r.opened;
  let hem = sceneOf(await viewNow(t.id), ch0.id).hem;
  assert.ok(!('next' in (hem?.passes ?? {})), `HEM-ASKS: the close does not suggest the next scene itself (${Object.keys(hem?.passes ?? {})})`);
  assert.ok(!asks.some((a) => a.system.startsWith(prompts.CHAPTER.slice(0, 80))), '  and never asks the model for it');
  assert.strictEqual(hem.suggestion, null, '  so there is no suggestion yet');

  const v: any = routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id, pass: 'next',
    steer: 'He swims after the ferry and loses the bell.' }));
  assert.ok(!v.error, v.error);
  await hemSettled(t.id);
  const user = String(askOf(prompts.CHAPTER)?.user ?? '');
  assert.match(user, /THE WRITER WANTS THIS CHAPTER TO: He swims after the ferry and loses the bell\./,
    'HEM-STEER: the writer\'s direction reaches the next-scene ask');
  hem = sceneOf(await viewNow(t.id), ch0.id).hem;
  assert.strictEqual(hem.passes.next, null, '  and the pass ran');
  const next = (db.chapters(t.id) as any[]).find((c) => c.id === opened);
  assert.strictEqual(next.opens_with, NEXT.opens, `HEM-INTO-SCENE: how it opens is the scene's own now (${next.opens_with})`);
  assert.strictEqual(next.authors_note, NEXT.note, '  and where it heads');
  assert.strictEqual(next.title, NEXT.title, '  and its name, over the placeholder');

  // ASKED AGAIN WITH A NEW DIRECTION, what Anansi wrote is replaced; what the writer typed is not.
  db.updateChapter(t.id, opened, { opensWith: 'Written by hand.' });
  tidied = { title: 'The Far Bank', note: 'He reaches the far bank with nothing in his hands at all.', opens: 'Cold water.' };
  routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id, pass: 'next', steer: 'He gives up.' }));
  await hemSettled(t.id);
  const again = (db.chapters(t.id) as any[]).find((c) => c.id === opened);
  assert.strictEqual(again.title, 'The Far Bank', 'HEM-AGAIN-REPLACES: a new direction replaces what Anansi wrote');
  assert.strictEqual(again.authors_note, tidied.note, '  in every box it wrote');
  assert.strictEqual(again.opens_with, 'Written by hand.', 'HEM-AGAIN-KEEPS: and keeps what the writer typed');
  // A scene the writer has started is left alone: its heading is theirs to set.
  db.updateChapter(t.id, opened, { authorsNote: '' });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: opened, body: 'He stood on the jetty.' });
  routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id, pass: 'next', steer: 'Anything.' }));
  await hemSettled(t.id);
  assert.strictEqual((db.chapters(t.id) as any[]).find((c) => c.id === opened).authors_note, '',
    'HEM-STARTED-ALONE: a scene already being written is not set behind the writer');
  tidied = {};
}
ok('a hem asks for the next scene rather than guessing it, and the answer goes into the scene');

// ---- NEW THREADS, SIX AT MOST PER HEM (2026-10-27) ----
// One hem of Seth's chalked 8 characters, 6 places and 2 items. The rest are held, named on the card,
// and "Chalk these too" puts them in without asking the model again.
{
  const t = db.createStory(me, { title: 'Crowded hem', premise: 'A market.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id,
    body: 'Nine stalls stood in the square, each with its own keeper.' });
  answer = []; finished = []; tidied = {};
  found = Array.from({ length: 9 }, (_, k) => ({ title: `Keeper ${k + 1}`, body: `Keeps stall ${k + 1}.`, type: 'character', keys: [`keeper${k + 1}`] }));
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id }));
  await hemSettled(t.id);
  const fresh = () => (db.proposalsOf(t.id) as any[]).filter((p) => p.grp === `scene:${ch0.id}` && p.status === 'open' && !p.entry_id);
  assert.strictEqual(fresh().length, 6, `NEW-CAP: six new threads are chalked, not nine (${fresh().length})`);
  const held = sceneOf(await viewNow(t.id), ch0.id).hem?.extra;
  assert.deepStrictEqual(held, ['Keeper 7', 'Keeper 8', 'Keeper 9'], '  and the rest are named on the card');
  const v = routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id, extra: true }));
  assert.ok(!v.error, v.error);
  assert.strictEqual(fresh().length, 9, 'NEW-EXTRA: Chalk these too puts the held ones in');
  assert.deepStrictEqual(sceneOf(await viewNow(t.id), ch0.id).hem?.extra ?? [], [], '  and none are held after');
  found = [];
}
ok('a hem chalks six new threads at most, and the rest wait by name until asked for');

// A PASS THAT FAILS IS NAMED, and the others still run: the model refuses the new-thread ask only.
{
  const t = db.createStory(me, { title: 'One pass down', premise: 'A ferry town.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.upsertEntry(t.id, me, { title: 'Oren', body: '[Oren: the ferryman]', entryType: 'character', keys: ['Oren'] });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id,
    body: 'Oren cut the bell down from the ferry post and carried it home.' });
  answer = [{ name: 'Oren', stands: '[Oren: the ferryman, who has taken the ferry bell home]', label: 'took the bell',
    line: 'Oren cut the bell down from the ferry post', always: '', pockets: [] }];
  found = [{ title: 'The Ferry Bell', body: 'Bronze, green with river damp.', type: 'item', keys: ['bell'] }];
  tidied = { ...NEXT };
  failIf = (system) => system.startsWith(prompts.EXTRACT.slice(0, 80));
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id }));
  await hemSettled(t.id);
  failIf = null; tidied = {};
  const hem = sceneOf(await viewNow(t.id), ch0.id).hem;
  assert.strictEqual(hem?.state, 'done', 'the hem still finishes');
  assert.ok(typeof hem.passes.facts === 'string' && hem.passes.facts.length > 0,
    `HEM-FAILED-NAMED: the failed pass is named with a reason (${hem.passes.facts})`);
  assert.strictEqual(hem.passes.memory, null, 'HEM-OTHERS-RUN: the thread changes still ran');
  assert.strictEqual(hem.passes.next, null, '  and the next-scene suggestion');
  assert.deepStrictEqual(hem.suggestion, NEXT, '  which arrived');
  assert.ok((db.proposalsOf(t.id) as any[]).some((p) => p.entry_type === 'state'), '  and the thread change was chalked');
  assert.ok(!(db.proposalsOf(t.id) as any[]).some((p) => p.title === 'The Ferry Bell'), '  and the failed pass chalked nothing');
  ok('a pass that fails is named in the hem report, and the others still run');
}


// OUT OF DATE: editing, rewording or deleting a passage of a hemmed scene marks its hem out of date.
// Derived on read from the scene's prose, so the three ways in are driven through the routes and db.
{
  const t = db.createStory(me, { title: 'Changed after', premise: 'A ferry town.' }) as any;
  const off = { summarise: false, remember: false, extract: false, retire: false };
  const hemOne = async (body: string) => {
    const ch = (db.chapters(t.id).at(-1) as any);
    const p = db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch.id, body }) as any;
    await routes['POST /api/chapter/end'](ctx({ storyId: t.id, ...off }));
    await hemSettled(t.id);
    assert.strictEqual(sceneOf(await viewNow(t.id), ch.id).hem?.outOfDate, false, `  "${body}" is in date once hemmed`);
    return { ch: ch.id, p: typeof p === 'string' ? p : p.id };
  };
  const stale = async (ch: string) => sceneOf(await viewNow(t.id), ch).hem?.outOfDate;
  const edited = await hemOne('The river rose in the night.');
  await routes['POST /api/passage'](ctx({ storyId: t.id, id: edited.p, body: 'The river fell in the night.' }));
  assert.strictEqual(await stale(edited.ch), true, 'HEM-STALE-EDIT: an edit marks the hem out of date');
  const reworded = await hemOne('The bell was green with damp.');
  db.addVariant(t.id, reworded.p, 'The bell was black with soot.');
  assert.strictEqual(await stale(reworded.ch), true, 'HEM-STALE-REWORD: a reworded passage marks it out of date');
  const deleted = await hemOne('Nobody crossed after dark.');
  await routes['DELETE /api/passage'](ctx({ storyId: t.id, id: deleted.p }));
  assert.strictEqual(await stale(deleted.ch), true, 'HEM-STALE-DELETE: a deleted passage marks it out of date');
  ok('editing, rewording or deleting a passage of a hemmed scene marks its hem out of date');
}


// TWO HEMS ON ONE TALE RUN ONE AFTER THE OTHER: two slots and no queue (F13). The fake holds the
// first hem's ask; if the second ran beside it, two asks would be held at once.
{
  const t = db.createStory(me, { title: 'Two hems', premise: 'A ferry town.' }) as any;
  const off = { summarise: false, remember: false, extract: false, retire: false };
  const first = (db.chapters(t.id)[0] as any).id;
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: first, body: 'The first crossing.' });
  let release!: () => void;
  gate = new Promise<void>((r) => { release = r; });
  mostInflight = 0;
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id, ...off }));
  const second = (db.chapters(t.id).at(-1) as any).id;
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: second, body: 'The second crossing.' });
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id, ...off }));
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(inflight, 1, `HEM-ONE-AT-A-TIME: one ask is held, not ${inflight}`);
  assert.strictEqual(sceneOf(await viewNow(t.id), second).hem?.state, 'running', '  and the second hem shows as running while it waits');
  release(); gate = null;
  await hemSettled(t.id);
  assert.strictEqual(mostInflight, 1, `HEM-ONE-AT-A-TIME: the hems never asked at once (${mostInflight})`);
  const v = await viewNow(t.id);
  assert.ok([first, second].every((id) => sceneOf(v, id).hem?.state === 'done'), '  and both finish');
  ok('a second hem on the same tale waits for the first');
}


// A CHAPTER ROLL-UP STILL READS THE SCENE SUMMARIES a background hem writes.
{
  const t = db.createStory(me, { title: 'Rolled up', premise: 'A ferry town.' }) as any;
  const only = { remember: false, extract: false, retire: false };
  for (const [body, sum] of [['Oren crossed at dawn.', 'Oren crosses at dawn.'], ['Oren crossed at dusk.', 'Oren crosses back at dusk.']]) {
    const ch = (db.chapters(t.id).at(-1) as any).id;
    db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch, body });
    summed = sum;
    await routes['POST /api/chapter/end'](ctx({ storyId: t.id, ...only }));
    await hemSettled(t.id);
  }
  summed = 'Oren crosses and comes back.';
  const r: any = await routes['POST /api/rollup'](ctx({ storyId: t.id, from: 1, to: 2 }));
  summed = null;
  assert.ok(!r.error, r.error);
  assert.ok(asked.user.includes('Oren crosses at dawn.') && asked.user.includes('Oren crosses back at dusk.'),
    'HEM-ROLLUP: the roll-up is sent both summaries the hems wrote');
  ok('a chapter roll-up reads the scene summaries a background hem wrote');
}


// ---- #90 · HEM CHALKS LESS: acted on, only news, six at most, outside only, World people ----
//
// The thread-change pass chalked a card for every thread the scene named, and asked for pockets
// where nothing changed. These drive what it is told and what code keeps of its answer.
{
  const t = db.createStory(me, { title: 'Chalks less', premise: 'p', persona: 'Seth', lockedCharacter: 'Halloran' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  for (const title of ['Seth', 'Halloran', 'Ilse'])
    db.upsertEntry(t.id, me, { title, body: `[${title}: on the quay]`, entryType: 'character', keys: [title] });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id,
    body: 'Seth pushed Halloran off the quay. Ilse watched from the boat.' });
  answer = [];
  asked = null;
  await routes['POST /api/remember'](ctx({ storyId: t.id, chapterId: ch0.id }));
  assert.match(prompts.MEMORY, /acting or being acted on/i, 'CHALK-ACTING: the prompt says a thread must act or be acted on');
  assert.match(prompts.MEMORY, /mention is not a\s+change/i, '  and that a mention is not a change');
  assert.doesNotMatch(prompts.MEMORY, /FLESH IT OUT/, 'CHALK-NO-FLESH: the prompt no longer asks for pockets where nothing changed');
  assert.match(prompts.MEMORY, /never an\s+outcome/i, 'CHALK-POCKET-FORM: pockets are instructions, never outcomes');
  assert.match(prompts.MEMORY, /six/i, 'CHALK-CAP: the prompt carries the cap of six');
  assert.match(asked.user, /OUTSIDE ONLY: Seth, Halloran/, 'CHALK-OUTSIDE-NAMED: the ask names the played and Hands off characters');
  assert.match(prompts.MEMORY, /OUTSIDE ONLY/, '  and the prompt says what that means');
  assert.ok(asked.user.includes('Where it stands now: on the quay'), 'CHALK-IN-FORCE: each thread arrives with the entry in force, stored plain (#114)');
  ok('the hem prompt carries the acting rule, the in-force entries, the outside-only rule and the cap of six');
}
// ONE NAME ONCE: the character the writer plays may also be the Hands off one.
{
  const t = db.createStory(me, { title: 'Played and held', premise: 'p', persona: 'Seth', lockedCharacter: 'seth' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.upsertEntry(t.id, me, { title: 'Seth', body: '[Seth: on the quay]', entryType: 'character', keys: ['Seth'] });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: 'Seth stepped off the quay.' });
  answer = []; asked = null;
  await routes['POST /api/remember'](ctx({ storyId: t.id, chapterId: ch0.id }));
  assert.match(asked.user, /OUTSIDE ONLY: Seth$/m, `CHALK-OUTSIDE-ONCE: a name both played and Hands off is named once (${asked.user.split('\n').at(-1)})`);
  ok('the outside-only line names a character once, even when played and Hands off');
}


// #93 · THE POCKETS A THREAD HAS ARRIVE WITH THEIR TEXT. The prompt says never repeat what the thread
// already says, and the ask showed a pocket's name only, so the model could not see what it said.
// Wrapped the old way, the wrapper comes off, as it does in every prompt; a long one is cut, marked.
{
  const t = db.createStory(me, { title: 'Pocket text', premise: 'p' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  const ilse = db.upsertEntry(t.id, me, { title: 'Ilse', body: 'poles the ferry at Sallow', entryType: 'character', keys: ['Ilse'] })!;
  db.upsertAddon(t.id, ilse, { slot: 'voice', name: 'Few words', body: 'Write her lines short; one word where three would do.' });
  const worn = db.upsertAddon(t.id, ilse, { slot: 'appearance', name: 'Weathered', body: 'tar on her hands, a split lip' })!;
  // Wrapped the way a pocket was stored before the floor took wrappers off (#110): past the floor.
  { const { DatabaseSync } = await import('node:sqlite'); const raw = new DatabaseSync(DB);
    raw.prepare('UPDATE addons SET body = ? WHERE id = ?').run('[Ilse: tar on her hands, a split lip]', worn); raw.close(); }
  db.upsertAddon(t.id, ilse, { slot: 'relationships', name: 'Debts', body: 'owes ' + 'the ferry guild '.repeat(80) + 'END' });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: 'Ilse poled the ferry across and tied it off.' });
  answer = []; asked = null;
  await routes['POST /api/remember'](ctx({ storyId: t.id, chapterId: ch0.id }));
  const u = String(asked?.user ?? '');
  assert.match(u, /voice \(Few words\): Write her lines short; one word where three would do\./,
    'POCKET-TEXT: a pocket the thread has arrives with its text');
  assert.match(u, /appearance \(Weathered\): tar on her hands, a split lip/, 'POCKET-TEXT: with the old wrapper off');
  assert.doesNotMatch(u, /\[Ilse: tar/, '  and not wrapped twice');
  const long = u.split('\n').find((l) => l.includes('relationships (Debts)')) ?? '';
  assert.ok(long && !long.includes('END') && long.endsWith('…'), `POCKET-TEXT-BOUND: a long pocket is cut, and says so (${long.length} chars)`);
  db.delStory(t.id);
  ok("the thread-change ask shows each pocket's text, unwrapped and bounded");
}

// A change equal to the entry in force, or a pocket that says what the thread already says, is not
// news, and is not chalked. Case and punctuation do not make it news either.
{
  const t = db.createStory(me, { title: 'Only news', premise: 'p' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  const ilse = db.upsertEntry(t.id, me, { title: 'Ilse', body: '[Ilse: poles the ferry at Sallow]', entryType: 'character', keys: ['Ilse'] });
  db.setAddonActive(t.id, db.upsertAddon(t.id, ilse, { slot: 'voice', name: 'Few words',
    body: 'Write her lines short; one word where three would do.' })!, true);
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: 'Ilse poled the ferry across and tied it off.' });
  answer = [{ name: 'Ilse', stands: 'Ilse: Poles the ferry at Sallow.', label: 'crossed', line: 'Ilse poled the ferry across',
    always: '', pockets: [{ slot: 'voice', name: 'Short', body: 'Write her lines short; one word where three would do.' }] }];
  await routes['POST /api/remember'](ctx({ storyId: t.id, chapterId: ch0.id }));
  answer = [];
  const mine = (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_id === ilse);
  assert.ok(!mine.some((p) => p.entry_type === 'state'), 'CHALK-SAME-STANDS: a change equal to the entry in force is not chalked');
  assert.ok(!mine.some((p) => p.field === 'voice'), 'CHALK-SAME-POCKET: a pocket that repeats the thread is not chalked');
  ok('a change equal to the entry in force, or a repeated pocket, is not chalked');
}


// SIX AT MOST. The model returns seven changed threads and names an eighth as overflow: the first
// six are chalked, and the hem record keeps the seventh and eighth names for the card.
{
  const t = db.createStory(me, { title: 'Six at most', premise: 'p' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  const names = ['Ada', 'Bram', 'Cora', 'Dov', 'Esk', 'Fen', 'Gil', 'Hob'];
  const ids = names.map((title) => db.upsertEntry(t.id, me, { title, body: `[${title}: on the quay]`, entryType: 'character', keys: [title] }));
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: `${names.join(', ')} were all pushed off the quay.` });
  answer = names.slice(0, 7).map((name) => ({ name, stands: `[${name}: soaked, and out of the water]`, label: 'pushed in',
    line: 'pushed off the quay', always: '', pockets: [] }));
  tidied = { overflow: ['Hob', 'Nobody Here'] };
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id, summarise: false, extract: false, retire: false }));
  await hemSettled(t.id);
  answer = []; tidied = {};
  const chalked = new Set((db.proposalsOf(t.id) as any[]).filter((p) => p.entry_type === 'state').map((p) => p.entry_id));
  assert.deepStrictEqual([...chalked].sort(), ids.slice(0, 6).sort(), `CHALK-SIX: six threads are chalked (${chalked.size})`);
  const hem = sceneOf(await viewNow(t.id), ch0.id).hem;
  assert.deepStrictEqual(hem?.overflow, ['Gil', 'Hob'],
    `CHALK-OVERFLOW: the seventh and the model's overflow name are kept on the hem, and a name the scene has not is not (${hem?.overflow})`);
  ok('a hem chalks six threads at most and keeps the rest as overflow names');
}

// ASKED FOR BY NAME (#91's route), the threads the writer chose are all reviewed, past six or not,
// and the overflow on the hem keeps only the names that were not asked for.
{
  const t = db.createStory(me, { title: 'Asked past six', premise: 'p' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  const names = ['Ada', 'Bram', 'Cora', 'Dov', 'Esk', 'Fen', 'Gil', 'Hob'];
  const ids = names.map((title) => db.upsertEntry(t.id, me, { title, body: `[${title}: on the quay]`, entryType: 'character', keys: [title] }));
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: `${names.join(', ')} were all pushed off the quay.` });
  answer = names.map((name) => ({ name, stands: `[${name}: soaked, and out of the water]`, label: 'pushed in',
    line: 'pushed off the quay', always: '', pockets: [] }));
  tidied = { overflow: [] };
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id, summarise: false, remember: false, extract: false, retire: false }));
  await hemSettled(t.id);
  db.hemOverflow(t.id, ch0.id, names);
  await routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id, names: names.slice(0, 7) }));
  await hemSettled(t.id);
  answer = []; tidied = {};
  const chalked = new Set((db.proposalsOf(t.id) as any[]).filter((p) => p.entry_type === 'state').map((p) => p.entry_id));
  assert.deepStrictEqual([...chalked].sort(), ids.slice(0, 7).sort(), `CHALK-ASKED-ALL: all seven asked for are chalked (${chalked.size})`);
  assert.deepStrictEqual(sceneOf(await viewNow(t.id), ch0.id).hem?.overflow, ['Hob'],
    'CHALK-ASKED-OVERFLOW: the overflow keeps only the name not asked for');
  ok('threads asked for by name are all reviewed, and leave the overflow');
}


// OUTSIDE ONLY: no interiority pocket for the character the writer plays, nor for the Hands off one
// while the switch is on. With the switch off, the Hands off character is hemmed like anyone else.
for (const lockoutOn of [true, false]) {
  const t = db.createStory(me, { title: 'Outside only', premise: 'p', persona: 'Seth', lockedCharacter: 'Halloran', lockoutOn }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  const id: Record<string, string> = {};
  for (const title of ['Seth', 'Halloran', 'Ilse'])
    id[title] = db.upsertEntry(t.id, me, { title, body: `[${title}: on the quay]`, entryType: 'character', keys: [title] });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: 'Seth pushed Halloran off the quay, and Ilse pulled him out.' });
  const inner = (name: string) => ({ slot: 'interiority', name: 'What he hides', body: `Never let ${name} say he is ashamed; show it in his hands.` });
  answer = ['Seth', 'Halloran', 'Ilse'].map((name) => ({ name, stands: '', label: 'the quay', line: '', always: '',
    pockets: [inner(name), { slot: 'voice', name: 'Wet and short', body: `Write ${name} short of breath and short of words.` }] }));
  asked = null;
  await routes['POST /api/remember'](ctx({ storyId: t.id, chapterId: ch0.id }));
  answer = [];
  const has = (who: string, slot: string) => (db.proposalsOf(t.id) as any[]).some((p) => p.entry_id === id[who] && p.field === slot);
  assert.ok(!has('Seth', 'interiority'), 'CHALK-OUTSIDE-PLAYED: no interiority pocket for the played character');
  assert.ok(has('Seth', 'voice'), '  and his other pockets still land');
  assert.strictEqual(has('Halloran', 'interiority'), !lockoutOn,
    `CHALK-OUTSIDE-HANDS-OFF: no interiority pocket for the Hands off character while the switch is ${lockoutOn ? 'on' : 'off, so it lands'}`);
  assert.strictEqual(/OUTSIDE ONLY: Seth, Halloran/.test(asked.user), lockoutOn, '  and the ask names him only while it is on');
  assert.ok(has('Ilse', 'interiority'), '  and anyone else gets theirs');
}
ok('no interiority pocket for the played or Hands off character');


// A WORLD PERSON IN THE TALE. A person the tale follows from its World is considered too, and its
// change is chalked as a new thread of the same name in the tale, never against the World's thread.
// The tale's own thread of a World name takes its change as any tale thread does (ADR 0006).
{
  const w = db.createStory(me, { title: 'The Lands Between', premise: 'p' }) as any;
  const morgott = db.upsertEntry(w.id, me, { title: 'Morgott', body: '[Morgott: holds the capital alone]', entryType: 'character', keys: ['Morgott'] });
  db.setAddonActive(w.id, db.upsertAddon(w.id, morgott, { slot: 'facts', name: 'facts', body: '[Morgott: the Omen King]' })!, true);
  const worldRennala = db.upsertEntry(w.id, me, { title: 'Rennala', body: '[Rennala: in the academy]', entryType: 'character', keys: ['Rennala'] });
  db.upsertEntry(w.id, me, { title: 'Leyndell', body: '[Leyndell: the capital]', entryType: 'place', keys: ['Leyndell'] });
  const t = db.storyFollowing(me, w.id, 'Kia\'s tale') as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  const rennala = db.upsertEntry(t.id, me, { title: 'Rennala', body: '[Rennala: queen of the moon, in this tale]', entryType: 'character', keys: ['Rennala'] });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id,
    body: 'Morgott knelt in Leyndell and took Rennala\'s hand as his queen.' });
  answer = [
    { name: 'Morgott', stands: '[Morgott: holds the capital, and has taken Rennala as his queen]', label: 'took a queen',
      line: 'Morgott knelt in Leyndell', always: '', pockets: [] },
    { name: 'Rennala', stands: '[Rennala: queen of the moon, and now Morgott\'s queen]', label: 'a queen again',
      line: 'took Rennala\'s hand', always: '', pockets: [] },
    { name: 'Leyndell', stands: '[Leyndell: the capital, where a king knelt]', label: 'a king knelt', line: 'knelt in Leyndell', always: '', pockets: [] },
  ];
  asked = null;
  await routes['POST /api/remember'](ctx({ storyId: t.id, chapterId: ch0.id }));
  answer = [];
  assert.ok(asked.user.includes('Morgott (character)'), 'CHALK-WORLD-ASKED: a World person the scene names is in the ask');
  assert.ok(!asked.user.includes('Leyndell (place)'), '  and a World thread that is not a person is not');
  const mine = db.proposalsOf(t.id) as any[];
  assert.ok(!mine.some((p) => p.entry_id === morgott || p.entry_id === worldRennala), 'CHALK-WORLD-UNTOUCHED: nothing targets a World thread');
  const m = mine.find((p) => p.title === 'Morgott');
  assert.strictEqual(m?.kind, 'new', `CHALK-WORLD-NEW: a World person's change is a new tale-own thread (${m?.kind})`);
  assert.strictEqual(m?.body, 'the Omen King', '  carrying the World thread\'s Always true');
  assert.match(JSON.parse(m?.rooms ?? '{}').stands?.body ?? '', /taken Rennala/, '  with the change as its first Over time entry');
  assert.ok(mine.some((p) => p.entry_id === rennala && p.entry_type === 'state'), 'CHALK-WORLD-TALE-WINS: the tale\'s own thread of a World name takes its change');
  await routes['POST /api/proposal'](ctx({ storyId: t.id, id: m.id, accept: true }));
  const own = (viewNow(t.id).entries as any[]).find((e) => e.title === 'Morgott');
  assert.ok(own && !own.sharedFrom, 'CHALK-WORLD-SEWN: sewn in, the tale has its own Morgott');
  // FROM THE SCENE AFTER, as `remember` anchors any thread's change: the scene it happened in, and
  // every scene before it, still read where he stood.
  assert.match(resolveBody(own, ch0.idx + 1), /taken Rennala/, 'CHALK-WORLD-ANCHORED: the change is in force from the next scene');
  assert.doesNotMatch(resolveBody(own, ch0.idx), /taken Rennala/, 'CHALK-WORLD-ANCHORED: and not in the scene it happened in');
  assert.match(resolveBody(own, ch0.idx), /alone/, '  which reads where the World had him then');
  assert.match((db.entriesOf(w.id) as any[]).find((e) => e.id === morgott).body, /alone/, '  and the World\'s is as it was');
  ok("a World person's change lands as a new thread in the tale, never on the World");
}

// NEVER IN THE WORLD, RETIREMENTS TOO. A World person dying in one tale is not the World's to
// retire: other tales follow the same thread (ADR 0006). The fake answers with the World person,
// so only the candidate list can keep him out.
{
  const w = db.createStory(me, { title: 'The Lands Between, again', premise: 'p' }) as any;
  const godrick = db.upsertEntry(w.id, me, { title: 'Godrick', body: '[Godrick: holds Stormveil]', entryType: 'character', keys: ['Godrick'] });
  const t = db.storyFollowing(me, w.id, 'Kia\'s other tale') as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  const QUOTE = 'Godrick fell from the battlement and did not rise again';
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: `${QUOTE}.` });
  finished = [{ card: 'Godrick', quote: QUOTE }];
  await routes['POST /api/finished'](ctx({ storyId: t.id, chapterId: ch0.id }));
  finished = [];
  const retired = (db.proposalsOf(t.id) as any[]).filter((p) => p.entry_type === 'retire');
  assert.ok(!retired.some((p) => p.entry_id === godrick),
    `RETIRE-NOT-WORLD: no retirement carries a World thread (${retired.map((p) => p.title)})`);
  ok('a World thread is never offered for retirement');
}


// ---- #91 · RUN A HEM'S PASSES AGAIN ----
//
// TRY AGAIN ONE PASS: the new-thread pass failed; asked again, only that pass asks the model, its
// line in the report clears, and the other lines are as they were.
{
  const t = db.createStory(me, { title: 'Try again', premise: 'A ferry town.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.upsertEntry(t.id, me, { title: 'Oren', body: '[Oren: the ferryman]', entryType: 'character', keys: ['Oren'] });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id,
    body: 'Oren cut the bell down from the ferry post and carried it home.' });
  answer = [{ name: 'Oren', stands: '[Oren: the ferryman, who has taken the ferry bell home]', label: 'took the bell',
    line: 'Oren cut the bell down from the ferry post', always: '', pockets: [] }];
  found = [{ title: 'The Ferry Bell', body: 'Bronze, green with river damp.', type: 'item', keys: ['bell'] }];
  tidied = { ...NEXT };
  failIf = (system) => system.startsWith(prompts.EXTRACT.slice(0, 80));
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id }));
  await hemSettled(t.id);
  failIf = null;
  const failed = sceneOf(await viewNow(t.id), ch0.id).hem;
  assert.ok(failed?.passes?.facts, '  the facts pass failed first');
  const from = asks.length;
  const r: any = await routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id, pass: 'facts' }));
  assert.ok(!r.error, r.error);
  await hemSettled(t.id);
  tidied = {};
  const again = asks.slice(from);
  assert.ok(again.length > 0 && again.every((a) => a.system.startsWith(prompts.EXTRACT.slice(0, 80))),
    `HEM-RETRY-ONE: only the facts pass asked the model (${again.length} asks)`);
  const hem = sceneOf(await viewNow(t.id), ch0.id).hem;
  assert.strictEqual(hem?.state, 'done', '  and the hem is done again');
  assert.strictEqual(hem.passes.facts, null, `HEM-RETRY-CLEARS: the facts line clears (${hem.passes.facts})`);
  assert.deepStrictEqual(Object.keys(hem.passes).sort(), ['facts', 'finished', 'memory', 'next', 'summary', 'tale'],
    '  and the other lines are still in the report');
  assert.deepStrictEqual(hem.suggestion, NEXT, '  and the suggestion is kept');
  const bell = (db.proposalsOf(t.id) as any[]).find((p) => p.title === 'The Ferry Bell');
  assert.strictEqual(bell?.grp, `scene:${ch0.id}`, '  and what it found is chalked into the scene group');
  ok('try again runs one failed pass, clears its line, and leaves the rest of the report');
}


// HEM AGAIN after an edit: what was sewn in or rejected stays, what was still chalked is replaced,
// and the scene is in date again.
{
  const t = db.createStory(me, { title: 'Hem again', premise: 'A ferry town.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.upsertEntry(t.id, me, { title: 'Oren', body: '[Oren: the ferryman]', entryType: 'character', keys: ['Oren'] });
  const p = db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id,
    body: 'Oren cut the bell down from the ferry post and carried it home.' }) as any;
  answer = [{ name: 'Oren', stands: '[Oren: the ferryman, who has taken the ferry bell home]', label: 'took the bell',
    line: 'Oren cut the bell down from the ferry post', always: '', pockets: [] }];
  found = [{ title: 'The Ferry Bell', body: 'Bronze, green with river damp.', type: 'item', keys: ['bell'] }];
  finished = [{ card: 'Oren', quote: 'Oren cut the bell down from the ferry post' }];
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id }));
  await hemSettled(t.id);
  const first = db.proposalsOf(t.id) as any[];
  const sewn = first.find((x) => x.entry_type === 'state'), rejected = first.find((x) => x.title === 'The Ferry Bell');
  const open = first.find((x) => x.entry_type === 'retire');
  assert.ok(sewn && rejected && open, `  the first hem chalked three rows (${first.map((x) => x.title)})`);
  db.setProposalStatus(t.id, sewn.id, 'accepted');
  db.setProposalStatus(t.id, rejected.id, 'rejected');
  await routes['POST /api/passage'](ctx({ storyId: t.id, id: typeof p === 'string' ? p : p.id,
    body: 'Oren cut the bell down, then the rope, and carried both home.' }));
  assert.strictEqual(sceneOf(await viewNow(t.id), ch0.id).hem?.outOfDate, true, '  the edit put the scene out of date');
  found = [{ title: 'The Ferry Rope', body: 'Hemp, frayed where it met the post.', type: 'item', keys: ['rope'] }];
  finished = [];
  const r: any = await routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id }));
  assert.ok(!r.error, r.error);
  await hemSettled(t.id);
  assert.strictEqual(db.proposal(t.id, sewn.id)?.status, 'accepted', 'HEM-AGAIN-KEEPS: a row sewn in stays');
  assert.strictEqual(db.proposal(t.id, rejected.id)?.status, 'rejected', 'HEM-AGAIN-KEEPS: a row rejected stays');
  assert.strictEqual(db.proposal(t.id, open.id), undefined, 'HEM-AGAIN-DROPS: a row still chalked is dropped');
  const rope = (db.proposalsOf(t.id) as any[]).find((x) => x.title === 'The Ferry Rope');
  assert.strictEqual(rope?.grp, `scene:${ch0.id}`, '  and what the new hem found is chalked in the scene group');
  const hem = sceneOf(await viewNow(t.id), ch0.id).hem;
  assert.strictEqual(hem?.state, 'done', '  and the hem is done');
  assert.strictEqual(hem.outOfDate, false, 'HEM-AGAIN-IN-DATE: the scene is no longer out of date');
  ok('hem again keeps what was sewn in and rejected, replaces what was chalked, and is in date');
}


// THE THREADS PAST THE CAP: asked for by name, only those threads are reviewed and chalked, into the
// same scene group. The fake answers for both threads, so only the ask can keep Oren out.
{
  const t = db.createStory(me, { title: 'Past the cap', premise: 'A ferry town.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.upsertEntry(t.id, me, { title: 'Oren', body: '[Oren: the ferryman]', entryType: 'character', keys: ['Oren'] });
  db.upsertEntry(t.id, me, { title: 'Mara', body: '[Mara: the toll-keeper]', entryType: 'character', keys: ['Mara'] });
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id,
    body: 'Oren cut the bell down while Mara counted the tolls twice.' });
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id, summarise: false, remember: false, extract: false, retire: false }));
  await hemSettled(t.id);
  answer = [
    { name: 'Oren', stands: '[Oren: the ferryman, who took the bell]', label: 'took the bell',
      line: 'Oren cut the bell down', always: '', pockets: [] },
    { name: 'Mara', stands: '[Mara: the toll-keeper, who no longer trusts the count]', label: 'counts twice',
      line: 'Mara counted the tolls twice', always: '', pockets: [] }];
  const from = asks.length;
  const r: any = await routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id, names: ['Mara'] }));
  assert.ok(!r.error, r.error);
  await hemSettled(t.id);
  const again = asks.slice(from);
  assert.ok(again.length > 0 && again.every((a) => a.system.startsWith(prompts.MEMORY.slice(0, 80))),
    `  only the thread-change pass asked (${again.length} asks)`);
  assert.ok(again.at(-1).user.includes('the toll-keeper') && !again.at(-1).user.includes('the ferryman'),
    'HEM-OVERFLOW-ASK: only the named thread is offered to the model');
  const chalked = db.proposalsOf(t.id) as any[];
  assert.deepStrictEqual(chalked.map((x) => x.title), ['Mara'], `HEM-OVERFLOW-ONLY: only Mara is chalked (${chalked.map((x) => x.title)})`);
  assert.strictEqual(chalked[0].grp, `scene:${ch0.id}`, 'HEM-OVERFLOW-GROUP: into the same scene group');
  assert.strictEqual(sceneOf(await viewNow(t.id), ch0.id).hem?.passes?.memory, null, '  and the thread-change line reads as run');
  ok('asking for the threads past the cap chalks only those threads, into the scene group');
}


// THE NEXT SCENE IS SUGGESTED FROM THE SCENE THAT CLOSED. A hem runs it last, and by then the writer
// may be writing the new scene; its prose must not stand in for where the closed scene ended.
{
  const t = db.createStory(me, { title: 'Read the closed scene', premise: 'A ferry town.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: 'Oren tied the ferry up for the winter.' });
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id, summarise: false, remember: false, extract: false, retire: false }));
  await hemSettled(t.id);
  const ch1 = (db.chapters(t.id).at(-1) as any);
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch1.id, body: 'Mara rang the bell in the new scene.' });
  tidied = { ...NEXT };
  await routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id, pass: 'next' }));
  await hemSettled(t.id);
  tidied = {};
  const ask = askOf(prompts.CHAPTER);
  assert.ok(ask.user.includes('Oren tied the ferry up'), 'HEM-NEXT-TAIL: the closed scene\'s prose reaches the ask');
  assert.ok(!ask.user.includes('Mara rang the bell'), 'HEM-NEXT-TAIL: and the new scene\'s prose does not');
  ok('the next scene is suggested from the closed scene\'s prose, not the new scene\'s');
}


// A RUN FINISHES ONLY ITS OWN RECORD. A hem again or a try again pressed while an earlier run on the
// scene is still going waits in the queue; when the earlier run ends, the scene must still show the
// waiting run as running, or the card says done and stops looking.
for (const [label, again] of [['hem again', {}], ['try again', { pass: 'next' }]] as const) {
  const t = db.createStory(me, { title: `Overlap, ${label}`, premise: 'A ferry town.' }) as any;
  const ch0 = (db.chapters(t.id)[0] as any);
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch0.id, body: 'Oren tied the ferry up for the winter.' });
  const held = () => { let release!: () => void; gate = new Promise<void>((r) => { release = r; }); return release; };
  // Held means asked and not yet answered: the ask count has passed `n` and an ask is in flight.
  const waitHeld = async (n: number) => {
    for (let i = 0; i < 150 && !(asks.length > n && inflight > 0); i++) await new Promise((r) => setTimeout(r, 20)); };
  // A full answer, so the suggestion asks once and its retry does not read as the waiting run.
  tidied = { ...NEXT };
  const first = held();
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id, summarise: false, remember: false, extract: false, retire: false }));
  await waitHeld(asks.length - 1);
  await routes['POST /api/chapter/hem'](ctx({ storyId: t.id, chapterId: ch0.id, ...again }));
  const second = held(), from = asks.length;
  first();
  // The waiting run has asked: the earlier run has ended, and its record is written.
  await waitHeld(from);
  assert.ok(asks.length > from, '  the waiting run reached the model');
  assert.strictEqual(sceneOf(await viewNow(t.id), ch0.id).hem?.state, 'running',
    `HEM-OWN-RECORD: after the earlier run ends, the ${label} still shows running`);
  second(); gate = null;
  await hemSettled(t.id);
  tidied = {};
  assert.strictEqual(sceneOf(await viewNow(t.id), ch0.id).hem?.state, 'done', `  and done once the ${label} ends`);
  ok(`a run finishes only its own record: a ${label} waiting behind a hem shows running`);
}


// ---- #125 · WHERE THE TALE STANDS: CHALKED AT EACH HEM, SEWN IN, READ IN THE PREMISE'S PLACE ----
{
  const { assemble } = await import('../src/story.ts');
  const PREMISE = 'Mara keeps the lighthouse alone and wants the supply boat to come.';
  const NOW = 'Mara is out of oil, and the supply boat has turned back.';
  const LATER = 'The lamp is dark. Mara has rowed for the mainland in the dinghy.';
  const t = db.createStory(me, { title: 'The tale stands', premise: PREMISE, setting: 'A rock in the North Sea.' }) as any;
  const ch1 = db.chapters(t.id)[0] as any;
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch1.id,
    body: `Mara burned the last of the oil and watched the boat turn back. "${SPOKEN}," she said.` });
  const spine = (focus?: string) => assemble(view(t.id, focus) as any,
    { global: 8192, slots: 1, perSlot: 8192 }, 'continue').manifest.blocks.find((b: any) => b.kind === 'SPINE')!.text;
  const sew = (id: string) => routes['POST /api/proposal'](ctx({ storyId: t.id, id, accept: true }));

  taleSays = NOW;
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id }));
  await hemSettled(t.id);
  // This tale's ask: another tale's hem may still be running on the same fake.
  const taleAsk = (said: string) => asks.findLast((a) => a.system.startsWith(prompts.TALE_STANDS.slice(0, 80)) && a.user.includes(said));
  const ask = taleAsk(PREMISE);
  assert.ok(ask, 'TALE-ASKED: the hem asks where the tale stands');
  assert.ok(ask.user.includes(PREMISE), '  from where it stood before: the premise, for the first hem');
  assert.ok(ask.user.includes('A rock in the North Sea'), "  with what the tale is: its thread's Always true, the setting");
  // FROM THE SCENE'S SUMMARY, which the hem writes first (Seth, 2026-10-30: it "still takes ages").
  assert.ok(ask.user.includes('THE SCENE, IN SUMMARY') && !ask.user.includes('burned the last of the oil'),
    'TALE-FROM-SUMMARY: reading the summary the hem just wrote, not the whole scene');
  const tale = db.taleThreadOf(t.id);
  assert.ok(tale, "TALE-THREAD: the first hem makes the tale's thread");
  const p = (db.proposalsOf(t.id) as any[]).find((x) => x.entry_id === tale.id);
  assert.ok(p, 'TALE-CHALKED: and chalks where the tale stands on it');
  assert.strictEqual(p.entry_type, 'state', "  as an Over time entry, like any thread's");
  assert.deepStrictEqual(JSON.parse(p.keys), ['2'], '  in force from the next scene');
  assert.strictEqual(p.grp, `scene:${ch1.id}`, "  on the hem's card");
  assert.strictEqual(p.body, NOW, '  saying where it stands');
  assert.match(spine(), /wants the supply boat to come/, 'TALE-NOT-YET: chalked is not sewn in, so the premise is still sent');
  ok("a hem chalks where the tale stands on the tale's thread, onto its card, and nothing is sent until it is sewn in");

  sew(p.id);
  const s2 = spine();
  assert.ok(s2.includes(NOW), 'TALE-SENT: sewn in, the prompt carries where the tale stands');
  assert.ok(!s2.includes(PREMISE), 'TALE-NOT-PREMISE: and not the premise');
  assert.ok(spine(ch1.id).includes(PREMISE), 'TALE-BEFORE: writing the first scene again still reads the premise');
  // TALK READS IT TOO: its prompt is assembled the same way.
  await routes['POST /api/talk'](ctx({ storyId: t.id, said: 'Where are we now?' }));
  const talk = asks.findLast((a) => a.user.includes('Where are we now?'));
  assert.ok(talk?.user.includes(NOW) && !talk.user.includes(PREMISE), 'TALE-TALK: Talk reads where the tale stands, not the premise');
  ok("sewn in, the prompt and Talk read where the tale stands in the premise's place; the scene before it reads the premise");

  // The next hem reads the entry in force and chalks the next one; both are kept.
  const ch2 = db.chapters(t.id).at(-1) as any;
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch2.id, body: 'Mara rowed the dinghy toward the mainland.' });
  taleSays = LATER;
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id }));
  await hemSettled(t.id);
  assert.ok(taleAsk(`WHERE IT STOOD BEFORE THIS SCENE: ${NOW}`), 'TALE-NEXT-ASK: the next hem starts from the entry in force');
  sew((db.proposalsOf(t.id) as any[]).find((x) => x.entry_id === tale.id).id);
  assert.deepStrictEqual((db.statesForStory(t.id).get(tale.id) ?? []).map((x: any) => x.body), [NOW, LATER],
    'TALE-HISTORY: every entry sewn in is kept, in order');
  assert.ok(spine().includes(LATER) && !spine().includes(NOW), 'TALE-LATEST: and the latest in force is the one sent');
  taleSays = '';
  ok('each hem chalks the next entry from the one in force, and every entry is kept');

  // A PARAGRAPH, BOUNDED (Seth, 2026-10-30: "writing where it is now is taking forever"). Remote models
  // ran on inside the one string until the cap cut them, twice with the retry. The schema bounds the
  // string, and what comes back stops at its last whole sentence.
  const schema = prompts.TALE_STANDS_SCHEMA.properties.tale as any;
  assert.ok(Number(schema.maxLength) > 0 && Number(schema.maxLength) <= 1600, `TALE-BOUND: the paragraph is bounded (${schema.maxLength})`);
  const ch3 = db.chapters(t.id).at(-1) as any;
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch3.id, body: 'Mara reached the harbour at dusk.' });
  taleSays = 'Mara is ashore at last. The lamp on the rock is dark and nobody is keeping it, and the mainland har';
  // With no summary to read (the summary pass off), the narration, without its dialogue.
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id, summarise: false }));
  await hemSettled(t.id);
  const cut = (db.proposalsOf(t.id) as any[]).filter((x) => x.entry_id === tale.id && x.status === 'open').at(-1);
  assert.strictEqual(cut?.body, 'Mara is ashore at last.', 'TALE-WHOLE: a paragraph stopped by the bound keeps its last whole sentence');
  assert.ok(taleAsk('reached the harbour at dusk')?.user.includes('THE SCENE:\nMara reached the harbour'),
    'TALE-NO-SUMMARY: with no summary, it reads the narration');
  taleSays = '';
  ok('where the tale stands is one bounded paragraph, ending on a whole sentence');
}

// ---- #127 · ADR 0011. EACH HEM CHALKS WHERE EACH STRING IN PLAY STANDS NOW, AND SEWN IN IT IS KEPT ----
{
  const t = db.createStory(me, { title: 'The strings stand', premise: 'Mara keeps the lighthouse alone.' }) as any;
  const ch1 = db.chapters(t.id)[0] as any;
  db.addPassage({ storyId: t.id, branchId: t.branchId, chapterId: ch1.id,
    body: `Mara poured the last oil into the lamp and saw the boat turn back. "${SPOKEN}," she said.` });
  const OIL = 'The oil will run out before the boat comes.';
  const oil = db.upsertString(t.id, { title: 'The oil', body: OIL, fromChapter: 1, summoned: true })!;
  const why = db.upsertString(t.id, { title: 'Why the boat turned', body: 'Nobody knows why the boat turned back.',
    fromChapter: 1, summoned: true, kind: 'question' })!;
  const off = db.upsertString(t.id, { title: 'The dinghy', body: 'There is a dinghy under the steps.', fromChapter: 1 })!;
  const tied = db.upsertString(t.id, { title: 'The keeper before', body: 'Her father kept it first.', status: 'paid' })!;
  const NOW = 'The last oil is in the lamp; it burns tonight and no more.';
  // By number, in the order asked: the oil changed, the question came back as it was.
  stringsSay = [{ n: 1, now: NOW }, { n: 2, now: 'Nobody knows why the boat turned back.' }];
  await routes['POST /api/chapter/end'](ctx({ storyId: t.id }));
  await hemSettled(t.id);
  stringsSay = [];
  const ask = asks.findLast((a) => a.system.startsWith(prompts.STRINGS_STAND.slice(0, 80)) && a.user.includes('poured the last oil'));
  assert.ok(ask, 'STRINGS-ASKED: the hem asks where the strings in play stand');
  assert.ok(ask.user.includes(OIL) && ask.user.includes('Nobody knows why'), '  sending each one in play');
  assert.ok(!ask.user.includes('dinghy') && !ask.user.includes('Her father'), '  and not one switched off, tied off or let go');
  assert.ok(!ask.user.includes(SPOKEN), '  reading the narration and not the dialogue');
  const tale = db.taleThreadOf(t.id);
  const rows = (db.proposalsOf(t.id) as any[]).filter((x) => x.entry_id === tale.id && x.field);
  assert.deepStrictEqual(rows.map((x) => [x.field, x.target, x.body, x.grp]), [['promise', oil, NOW, `scene:${ch1.id}`]],
    "STRINGS-CHALKED: the one that moved is chalked onto the hem's card, aimed at its pocket; the one that did not is not");
  ok("a hem chalks where each string in play stands now, onto its card, and nothing for one it did not move");

  // The writer makes it an open question before sewing it in (Seth, 2026-10-28): the chalk was a promise's.
  db.upsertAddon(t.id, tale.id, { id: oil, slot: 'question', name: 'The oil', body: OIL });
  await routes['POST /api/proposal'](ctx({ storyId: t.id, id: rows[0].id, accept: true }));
  const after = db.stringsOf(t.id).find((x: any) => x.id === oil);
  assert.deepStrictEqual([after.body, after.summoned, after.status], [NOW, 1, 'open'],
    'STRINGS-SEWN: sewn in, the string reads where it stands now, still on and open');
  assert.strictEqual(after.kind, 'question', 'STRINGS-SEWN-KIND: and keeps the kind the writer gave it since the hem');
  assert.strictEqual(db.stringsOf(t.id).length, 4, '  in place, not beside it');
  const kept = (db.entryHistory(t.id, tale.id) as any[]).find((r) => r.field === `pocket:${oil}`);
  assert.strictEqual(kept?.previous_value, OIL, 'STRINGS-HISTORY: and the old version is kept in the thread\'s history');
  void why; void off; void tied;
  ok('sewn in, a string reads where it stands now, and the old version is kept');
}

srv.close();
// The chapter end measured on 2026-08-29 produced a character whose whole body was the word "none" — the field's
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
