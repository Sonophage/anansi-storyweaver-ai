// Anansi's two routes against a fake llama-server: /api/talk, whose answer must not be cut off and
// whose promised room must be the room it is given, and /api/invent, which must never write.
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
    // Answer by the shape of the schema asked for, the same way test/mend.ts does: an outfit wants
    // a name and a body, a ledger entry wants a title and keys, everything else is a reply.
    const props = b.response_format?.json_schema?.schema?.properties ?? {};
    // Keyed on the QUESTION, not on the schema: TALK_SCHEMA always carries `strings` now, so a
    // schema-shaped check made every answer the short one and broke the truncation assertions.
    const asksForStrings = /set up and not paid/.test(String(b.messages?.[1]?.content ?? ''));
    const answer = asksForStrings ? { reply: 'Two things are owed.',
        strings: [{ title: 'The letter he has not opened', body: 'Sent by his brother', fromChapter: 6 }] }
      : props.keys ? { title: 'The Rust Choir', body: '[The Rust Choir: a congregation]',
                                  keys: ['choir', 'rust'] }
      : props.name ? { name: 'Mourning grey', body: '[wearing: grey, unpinned, no scripture showing]' }
      : { reply: LONG };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: cut
        ? JSON.stringify(answer).slice(0, 900)      // truncated mid-object, unparseable
        : JSON.stringify(answer) } }],
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

// ---- 5. invent hands back a draft and writes nothing to the ledger
const invent = (o: any) => { calls = []; return routes['POST /api/invent']({
  body: { storyId: story.id, ...o }, query: new URLSearchParams(), owner: me,
  slot: { global: 100_096, slots: 2, perSlot: 50_048 },
  gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any); };

const before = db.entriesOf(story.id).length;
const vel = db.entriesOf(story.id).find((e: any) => e.title === 'Vel');

const dressed: any = await invent({ kind: 'outfit', entryId: vel.id, direction: 'she is in mourning' });
assert.ok(!dressed.error, dressed.error);
assert.strictEqual(dressed.outfit.name, 'Mourning grey');
assert.match(dressed.outfit.body, /^\[wearing:/, 'a ledger entry, not prose');
assert.strictEqual(db.outfitsOf(story.id, vel.id).length, 0,
  'the outfit is a draft for the Wardrobe form — pressing Add is still the writer\'s');
// The writer's own line outranks the canon, so it has to actually reach the model.
assert.match(String(calls[0].messages[0].content), /she is in mourning/,
  'the direction is in the prompt, or the button did nothing with what they typed');
ok('an invented outfit comes back as two fields and nothing is worn');

const thread: any = await invent({ kind: 'lore', direction: 'a rival congregation' });
assert.ok(!thread.error, thread.error);
assert.strictEqual(thread.proposed, 1);
assert.strictEqual(thread.title, 'The Rust Choir');
assert.strictEqual(db.entriesOf(story.id).length, before,
  'an invented thread is a PROPOSAL — the ledger is untouched until it is accepted');
assert.ok(db.proposalsOf(story.id).some((p: any) => p.title === 'The Rust Choir'),
  'and it is in the queue with everything else Anansi offers');
ok('an invented thread lands in the proposals queue, not in the ledger');

// ---- 5b. an invented entry is a jumping-off point, and it has the room to be one
// Seth's spec, verbatim: "it doesnt have to be a single sentence, it also doesnt have to be three
// paragraphs. it should be written in a way where the ai can use it to write but not say things
// verbatim, a jumping off point for it." Two halves that regress independently — the prompt can go
// back to asking for forty words, or the ceiling can go back to the room forty words needed — so
// both are asserted, and the ceiling is read off THE WIRE rather than from the constant.
{
  const said = String(calls[0].messages[0].content);
  assert.ok(Number(calls[0].max_tokens) >= 1200,
    `an invented entry is asked for in ${calls[0].max_tokens} tokens, which is the room the old `
    + 'forty-word body needed; a 120-word body that runs out of it truncates the object rather than '
    + 'the string, and the retry costs another whole call');
  assert.match(said, /not one sentence, and not three\s+paragraphs/,
    'the prompt has to name the FLOOR as well as the ceiling — a ceiling on its own is what made '
    + 'the bodies one line');
  assert.match(said, /never say it back word for word/,
    'and it has to say the body is material to write from rather than a line to quote');
  // F27, still open and not to be made worse: the prompt forbids keys that repeat the title.
  assert.match(said, /Not the title again/,
    'the keys instruction that F27 says the model still sometimes ignores must not go missing '
    + 'while the body is being widened');
  ok('an invented entry is asked for as a jumping-off point, in the room one needs');
}

const junk: any = await invent({ kind: 'weapon' });
assert.match(junk.error ?? '', /nothing called/, 'and a kind nobody defined is refused by name');
ok('a kind that does not exist is refused rather than assembled');

// ---- 6. Anansi's strings ride the same queue as everything else it offers
{
  calls = [];
  const said: any = await routes['POST /api/talk']({
    body: { storyId: story.id, said: 'What has this story set up and not paid off?' },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
  assert.ok(!said.error, said.error);
  assert.strictEqual(said.proposed, 1, 'the string is proposed, not written');
  const p = db.proposalsOf(story.id).find((x: any) => x.entry_type === 'string');
  assert.ok(p, 'and it is in the SAME queue as every other offer — a second queue is a second '
    + 'place to forget to look');
  assert.strictEqual(db.stringsOf(story.id).length, 0, 'nothing is a string until it is accepted');

  // Accepting one makes a STRING, not an entry. They are different tables on purpose.
  const before = db.entriesOf(story.id).length;
  await routes['POST /api/proposal']({ body: { storyId: story.id, id: p.id, accept: true },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {} } as any);
  const made = db.stringsOf(story.id);
  assert.strictEqual(made.length, 1, 'accepting it ties the string');
  assert.strictEqual(made[0].title, 'The letter he has not opened');
  assert.strictEqual(made[0].from_chapter, 6, 'carrying the chapter it was set up in');
  assert.strictEqual(made[0].summoned, 0, 'and out of play, like every string');
  assert.strictEqual(db.entriesOf(story.id).length, before, 'and it is not an entry');
  ok("Anansi's strings go to the proposals queue, and accepting one ties a string not an entry");
}

srv.close();
console.log(`\n${n} checks passed`);
