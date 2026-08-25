// The model corrects its own contradictions before the passage is delivered.
//
// Driven against a FAKE llama-server, because what is under test is the ORDER of three calls and
// what the third one is told — never something the real model can be asked for reliably. The fake
// answers by shape: a request carrying a json_schema is the check, a request whose system prompt is
// MEND is the repair, anything else is the prose.
//
//   node --experimental-strip-types test/mend.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-mend.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

const CANON = 'Vel is the Murmur. She has never been anyone else.';
const BROKEN = 'She was no longer the Murmur, and the city knew it.';
const FIXED  = 'She was the Murmur still, and the city knew it.';

/** What the fake was asked, in order, so a test can assert the third call's contents. */
let calls: any[] = [];
let reply = { prose: BROKEN, mend: FIXED, found: 1, inDialogue: false };

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o)); };
    // The budget check. A short count so nothing overflows; the real number is not what this
    // file is about.
    if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });

    const system = b.messages?.[0]?.content ?? '';
    const user = b.messages?.[1]?.content ?? '';
    const kind = b.response_format ? 'check' : /contradicts canon/.test(system) ? 'mend' : 'prose';
    calls.push({ kind, system, user });
    const content =
      kind === 'check' ? JSON.stringify({ contradictions: Array.from({ length: reply.found },
          () => ({ canon: 1, quote: reply.inDialogue ? `"${BROKEN}"` : BROKEN,
                   why: 'She cannot both be and not be the Murmur.', confidence: 0.9 })) })
      : kind === 'mend' ? reply.mend
      : reply.inDialogue ? `Vel spoke. "${BROKEN}"` : reply.prose;
    send({ choices: [{ message: { content } }], usage: { prompt_tokens: 200, completion_tokens: 40 } });
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

// Imported AFTER the host is set: llama.ts reads it once, at module load.
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');

const me = db.owner('mender');
const story = db.createStory(me, { title: 'Sutera', premise: 'A city on a dead god.', pov: 'second' });
db.upsertEntry(story.id, me, { title: 'The Murmur', body: CANON, activation: 'always_on' });
db.addPassage({ ...story, storyId: story.id, body: 'The lower tiers still pulse.' });

const ctx = (body: any) => ({ body, query: new URLSearchParams(), owner: me,
  slot: { global: 8192, slots: 1, perSlot: 8192 },
  gen: { max_tokens: 400, temperature: 0.85 }, setGen: () => {} }) as any;
const write = async () => {
  calls = [];
  return routes['POST /api/generate'](ctx({ storyId: story.id, mode: 'direct',
    directive: 'She walks into the light.' }));
};

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };

// ---- 1. the contradiction never reaches the page
{
  const r = await write();
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.prose, FIXED, 'the corrected passage is what the route returns');
  assert.strictEqual(r.mended, 1, 'and it says how many it fixed');
  assert.deepStrictEqual(calls.map((c) => c.kind), ['prose', 'check', 'mend'],
    'prose, then the check, then the repair — in that order and only once each');
  ok('a passage that contradicts canon is corrected before it is delivered');

  // The repair is useless if it is not told what it broke. This is the assertion that would have
  // caught a `mend` that sent the passage alone and hoped.
  const mend = calls.find((c) => c.kind === 'mend')!;
  assert.match(mend.user, /Vel is the Murmur/, 'the repair is given the canon fact');
  assert.match(mend.user, /You wrote: "She was no longer the Murmur/, 'and its own offending words');
  assert.match(mend.user, /PASSAGE:/, 'and the whole passage to correct');
  ok('  and the model is told which fact it broke, and where');
}

// ---- 2. a clean passage costs one call and comes back untouched
{
  reply = { prose: 'The rain had not stopped.', mend: 'NEVER', found: 0, inDialogue: false };
  const r = await write();
  assert.strictEqual(r.prose, 'The rain had not stopped.');
  assert.strictEqual(r.mended, 0);
  assert.deepStrictEqual(calls.map((c) => c.kind), ['prose', 'check'],
    'nothing to fix must not send a repair call — that is a rewrite of good prose');
  ok('a clean passage is not rewritten, and the repair call is not made');
}

// ---- 3. a repair that answers with something else leaves the prose alone
{
  reply = { prose: BROKEN, mend: 'Sorry — I cannot do that.', found: 1, inDialogue: false };
  const r = await write();
  assert.strictEqual(r.prose, BROKEN, 'the writer keeps the passage the model actually wrote');
  assert.strictEqual(r.mended, 0, 'and nothing claims to have been mended');
  assert.strictEqual(r.unfixed, 1, 'the contradiction is reported as still standing');
  ok('a refusal or a summary instead of a repair does not replace the passage');
}

// ---- 4. dialogue is not narration, here as everywhere else
{
  reply = { prose: BROKEN, mend: FIXED, found: 1, inDialogue: true };
  const r = await write();
  assert.match(r.prose, /Vel spoke/, 'a contradiction inside quotes is a character being wrong');
  assert.strictEqual(r.mended, 0);
  assert.ok(!calls.some((c) => c.kind === 'mend'), 'so no repair is attempted');
  ok('a contradiction spoken by a character is left alone');
}

srv.close();
console.log(`\n${n} checks passed`);
