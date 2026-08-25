// Anansi's answer is not cut off, and the room it is promised is the room it is given.
//
// Driven against a FAKE llama-server, because both bugs are about numbers on the wire rather than
// about anything the real model would say. What the real model DID say is written down in
// P0-FINDINGS F25: the grammar closed the reply at exactly 1,400 characters, mid-word, with the
// JSON still valid — a truncated answer that arrives looking like a finished one.
//
//   node --experimental-strip-types test/talk.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-talk.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

// Longer than the cap that used to be on the field, and it must arrive whole.
const LONG = ('The story is about penance. ').repeat(110).trim();

let calls: any[] = [];
let breakFirst = false;   // answer the first call with a truncated object, as running out of room does
const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    calls.push(b);
    const cut = breakFirst && calls.length === 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: cut
        ? JSON.stringify({ reply: LONG }).slice(0, 900)      // truncated mid-object, unparseable
        : JSON.stringify({ reply: LONG }) } }],
      usage: { prompt_tokens: 400, completion_tokens: 900 } }));
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { TALK_SCHEMA } = await import('../src/prompts.ts');

const me = db.owner('talker');
const story = db.createStory(me, { title: 'Sutera', premise: 'A city on a dead god.' });
db.upsertEntry(story.id, me, { title: 'Vel', body: 'Vel is the Murmur.', activation: 'always_on' });
db.addPassage({ ...story, storyId: story.id, body: 'The lower tiers still pulse.' });

const ask = async (perSlot: number) => {
  calls = [];
  return routes['POST /api/talk']({
    body: { storyId: story.id, said: 'What is this story about? The long answer, please.' },
    query: new URLSearchParams(), owner: me,
    slot: { global: perSlot * 2, slots: 2, perSlot },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {},
  } as any);
};

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };

// ---- 1. the grammar no longer holds a bound on the answer
assert.ok(!('maxLength' in (TALK_SCHEMA.properties.reply as any)),
  'a maxLength on reply closes the string mid-word and the JSON stays valid — the answer arrives '
  + 'truncated and looking finished');
// The fields that ARE short keep their bounds: an unbounded string is where a reasoning model
// writes an essay (F18), and those are the fields where that is a defect rather than the answer.
assert.strictEqual((TALK_SCHEMA.properties.directive as any).maxLength, 400);
assert.strictEqual((TALK_SCHEMA.properties.entries as any).items.properties.body.maxLength, 600);
ok('the reply is unbounded and the fields that are not the answer still are not');

// ---- 2. a long answer arrives whole
const wide = await ask(50_048);
assert.ok(!wide.error, wide.error);
assert.strictEqual(wide.reply.length, LONG.length,
  `the whole answer, not the first ${wide.reply.length} characters of it`);
assert.match(wide.reply, /penance\.$/, 'and it ends where the model stopped, not where a cap did');
ok(`a ${LONG.length}-character answer is not truncated on the way through`);

// ---- 3. the room reserved is the room spent
// It assembled the prompt against 900 tokens of reserved output and then asked for 1,600. The
// prompt was budgeted for a smaller answer than the one requested, so on a long story the slot
// could be oversubscribed — and this server does not queue an overflow, both writers sharing the
// cache get a 500.
const wire = Number(calls[0].max_tokens);
assert.ok(wire > 900, `the call asks for ${wire} tokens, so 900 cannot be what was reserved`);
const P = wide.tokens;
// budgetFor: cap - max(600, reserved) - 6% of cap, and the guard refuses when the prompt exceeds it.
const budget = (cap: number, reserved: number) =>
  Math.max(0, cap - Math.max(600, reserved) - Math.floor(cap * 0.06));
// A slot with room for the prompt plus 900 of reply, but not the prompt plus what is really asked.
// Reserving 900 and spending `wire` looks fine here; reserving `wire` refuses, which is correct.
let cap = 0;
for (let c = P; c < P * 4 + 20_000; c++)
  if (budget(c, wire) < P && P <= budget(c, 900)) { cap = c; break; }
assert.ok(cap, `no slot size separates the two reservations at a ${P}-token prompt`);
const tight = await ask(cap);
assert.ok(tight.error, `a ${cap}-token slot has no room for a ${P}-token prompt plus ${wire} of reply, `
  + 'and must refuse rather than ask for it anyway');
assert.ok(!tight.reply, 'and nothing is said');
ok(`the prompt is budgeted against the ${wire} tokens the call actually asks for`);

// ---- 4. the retry asks for MORE room, never less
// The failure being retried is an object that ran out of room. structuredRetry used a flat 2,000,
// so a caller already asking for more than that was retried with LESS and the retry could only fail
// harder — which is exactly the caller this file is about, now that it asks for 2,400.
breakFirst = true;
const retried = await ask(50_048);
breakFirst = false;
assert.strictEqual(calls.length, 2, 'an unparseable object is retried once');
assert.ok(!retried.error, retried.error);
assert.ok(Number(calls[1].max_tokens) > Number(calls[0].max_tokens),
  `the retry asked for ${calls[1].max_tokens} against the first call's ${calls[0].max_tokens}`);
assert.strictEqual(retried.reply.length, LONG.length, 'and the second answer arrives whole');
ok(`the retry raises the budget (${calls[0].max_tokens} then ${calls[1].max_tokens}), it does not lower it`);

srv.close();
console.log(`\n${n} checks passed`);
