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

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o)); };
    if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });
    asked = { system: b.messages?.[0]?.content ?? '', user: b.messages?.[1]?.content ?? '' };
    send({ choices: [{ message: { content: JSON.stringify({ characters: answer }) } }],
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
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };

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

srv.close();
console.log(`\n${n} checks passed`);
