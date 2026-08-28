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
let reply: any = { prose: BROKEN, mend: FIXED, found: 1, inDialogue: false, canon: 1 };

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
          () => ({ canon: reply.canon ?? 1, quote: reply.inDialogue ? `"${BROKEN}"` : BROKEN,
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
// Message only — assertions run inline above. db.ts, engine.ts and stream.ts take a callback and
// call it; passing one to THIS `ok` would print a green check for a body that never ran. Refused
// rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

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

// ---- 5. the check judges the whole ledger; the repair judges only what the model was told
// Firing used to decide both, so a character who did not fire could be contradicted freely and
// nothing caught it (COUNCIL-04 #7). The two faults are different and want different fixes.
{
  // A second entry that CANNOT fire: triggered, on a word that appears nowhere.
  const hidden = db.upsertEntry(story.id, me, { title: 'The Bell', activation: 'triggered',
    keys: ['nobodyeversaysthis'], body: 'The bell has not rung in eleven years.' });
  const asked: string[] = [];
  reply = { prose: BROKEN, mend: FIXED, found: 1, inDialogue: false };
  calls = [];
  const probeId = db.addPassage({ ...story, storyId: story.id, body: BROKEN })!;
  const r: any = await routes['POST /api/check']({
    body: { storyId: story.id, passageId: probeId },
    query: new URLSearchParams(), owner: me,
    slot: { global: 8192, slots: 1, perSlot: 8192 },
    gen: { max_tokens: 400, temperature: 0.85 }, setGen: () => {} } as any);
  assert.ok(!r.error, r.error);
  const canonSent = calls.find((c) => c.kind === 'check')!.user;
  assert.match(canonSent, /has not rung in eleven years/,
    'the check is given the entry that never fired — that is the whole finding');
  assert.match(canonSent, /Vel is the Murmur/, 'and the one that did');
  assert.ok(hidden, 'the fixture really added a second entry');
  ok('the check judges the passage against the whole ledger, not only what fired');

  // The repair is the other side of the line: it is given only what the model was shown, because
  // asking it to honour canon it never saw is asking it to guess.
  calls = [];
  await write();
  const mendCanon = calls.find((c) => c.kind === 'check')!.user;
  assert.doesNotMatch(mendCanon, /has not rung in eleven years/,
    'the repair path is given only the canon that reached the prompt');
  ok('  and the repair is judged against only what reached the prompt');

  // The wiring between the two: the check has to carry `reached` onto the flag it stores, or both
  // faults land on the page as the same red line. Dropping that one field passed every other
  // assertion in this file, which is why this one exists.
  // Its own passage, and its body IS the offending line: the check refuses a quote it cannot find
  // in the text, and /api/generate never saves anything — accept does.
  const passageId = db.addPassage({ ...story, storyId: story.id, body: BROKEN })!;
  const runCheck = () => routes['POST /api/check']({
    body: { storyId: story.id, passageId }, query: new URLSearchParams(), owner: me,
    slot: { global: 8192, slots: 1, perSlot: 8192 },
    gen: { max_tokens: 400, temperature: 0.85 }, setGen: () => {} } as any);

  // Point the contradiction at the entry that never fired. It is last in the ledger, so it is the
  // last fact — the check numbers them in order.
  const nFacts = db.entriesOf(story.id).length;
  reply = { ...reply, canon: nFacts };
  calls = []; await runCheck();
  const unseen = db.violationsOf(story.id)[0];
  assert.strictEqual(unseen.entry_id, hidden, 'the flag names the entry that never fired');
  assert.strictEqual(unseen.reached, 0,
    'and records that the model was never shown it — the fix is a keyword, not a rewrite');

  // And the other side: a contradiction against canon that DID reach the prompt.
  reply = { ...reply, canon: 1 };
  calls = []; await runCheck();
  const seen = db.violationsOf(story.id)[0];
  assert.strictEqual(seen.reached, 1, 'canon it was shown and contradicted anyway');
  ok('  and the flag it stores records which of the two faults it is');
}

srv.close();
console.log(`\n${n} checks passed`);
