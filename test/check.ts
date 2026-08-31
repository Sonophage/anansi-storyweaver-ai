// The contradiction check: what it is shown, what it stores, and that it is NOT on the way to the
// page. This file was test/mend.ts until 2026-08-31, when the blocking repair in `generate` was
// removed — F30 measured it at a flat 1,456 ms on every take, firing 0 repairs in 6, and it ran on
// every variant, which SPEC §8.4 says not to do. `POST /api/accept` runs this detector detached on
// the take the writer kept and files a flag. The repair is gone: it cannot rewrite prose the writer
// is already reading.
//
// Driven against a FAKE llama-server, because what is under test is WHICH calls are made and what
// they are told — never something the real model can be asked for reliably. The fake answers by
// shape: a request carrying a json_schema is the check, anything else is the prose.
//
//   node --experimental-strip-types test/check.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-check.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

const CANON = 'Vel is the Murmur. She has never been anyone else.';
const BROKEN = 'She was no longer the Murmur, and the city knew it.';

/** What the fake was asked, in order, so a test can assert which calls were made at all. */
let calls: any[] = [];
let reply: any = { prose: BROKEN, found: 1, inDialogue: false, canon: 1 };

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
    const kind = b.response_format ? 'check' : 'prose';
    calls.push({ kind, system, user, maxTokens: b.max_tokens });
    const content =
      kind === 'check' ? JSON.stringify({ contradictions: Array.from({ length: reply.found },
          () => ({ canon: reply.canon ?? 1, quote: reply.inDialogue ? `"${BROKEN}"` : BROKEN,
                   why: 'She cannot both be and not be the Murmur.', confidence: 0.9 })) })
      : reply.inDialogue ? `Vel spoke. "${BROKEN}"` : reply.prose;
    send({ choices: [{ message: { content } }], usage: { prompt_tokens: 200, completion_tokens: 40 } });
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

// Imported AFTER the host is set: llama.ts reads it once, at module load.
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');

const me = db.owner('checker');
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
const runCheck = (passageId: string) =>
  routes['POST /api/check'](ctx({ storyId: story.id, passageId }));

let n = 0;
// Message only — assertions run inline above. Passing a callback to THIS `ok` would print a green
// check for a body that never ran. Refused rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

// ---- 1. GENERATION MAKES ONE MODEL CALL. This is the regression guard for the whole change: a
// blocking check here cost F30's 1,456 ms on every take and this is the assertion that goes red if
// one comes back. Falsified by re-adding an `await` on the detector — the count goes to 2.
{
  reply = { prose: BROKEN, found: 1, inDialogue: false, canon: 1 };
  const r: any = await write();
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.prose, BROKEN,
    'the prose the model wrote is the prose the route returns, uncorrected');
  const kinds = calls.map((c) => c.kind);
  assert.deepStrictEqual(kinds, ['prose'],
    `generating must make exactly one model call and it made ${kinds.length}: ${kinds.join(', ')}`);
  assert.strictEqual((r as any).found, undefined,
    'and it reports no contradiction count, because it did not look');
  ok('generating a passage makes one model call and never waits on a check');
}

// ---- 2. dialogue is not narration, here as everywhere else
{
  const spoken = db.addPassage({ ...story, storyId: story.id, body: `Vel spoke. "${BROKEN}"` })!;
  reply = { ...reply, found: 1, inDialogue: true };
  await runCheck(spoken);
  assert.deepStrictEqual(db.violationsOf(story.id).filter((v: any) => v.passage_id === spoken), [],
    'a contradiction inside quotes is a character being wrong, and is not flagged');
  ok('a contradiction spoken by a character is left alone');
}

// ---- 3. the check judges the whole ledger, not only what fired
// Firing used to decide both, so a character who did not fire could be contradicted freely and
// nothing caught it (COUNCIL-04 #7).
{
  // A second entry that CANNOT fire: triggered, on a word that appears nowhere.
  const hidden = db.upsertEntry(story.id, me, { title: 'The Bell', activation: 'triggered',
    keys: ['nobodyeversaysthis'], body: 'The bell has not rung in eleven years.' });
  reply = { ...reply, found: 1, inDialogue: false };
  const probeId = db.addPassage({ ...story, storyId: story.id, body: BROKEN })!;
  calls = [];
  const r: any = await runCheck(probeId);
  assert.ok(!r.error, r.error);
  const canonSent = calls.find((c) => c.kind === 'check')!.user;
  assert.match(canonSent, /has not rung in eleven years/,
    'the check is given the entry that never fired — that is the whole finding');
  assert.match(canonSent, /Vel is the Murmur/, 'and the one that did');
  assert.ok(hidden, 'the fixture really added a second entry');
  ok('the check judges the passage against the whole ledger, not only what fired');

  // The check has to carry `reached` onto the flag it stores, or both faults land on the page as
  // the same red line. Dropping that one field passed every other assertion in this file, which is
  // why this one exists. Its own passage, and its body IS the offending line: the check refuses a
  // quote it cannot find in the text.
  const passageId = db.addPassage({ ...story, storyId: story.id, body: BROKEN })!;

  // Point the contradiction at the entry that never fired. It is last in the ledger, so it is the
  // last fact — the check numbers them in order.
  const nFacts = db.entriesOf(story.id).length;
  reply = { ...reply, canon: nFacts };
  await runCheck(passageId);
  const unseen: any = db.violationsOf(story.id).find((v: any) => v.passage_id === passageId);
  assert.strictEqual(unseen.entry_id, hidden, 'the flag names the entry that never fired');
  assert.strictEqual(unseen.reached, 0,
    'and records that the model was never shown it — the fix is a keyword, not a rewrite');

  // And the other side: a contradiction against canon that DID reach the prompt.
  reply = { ...reply, canon: 1 };
  await runCheck(passageId);
  const seen: any = db.violationsOf(story.id).find((v: any) => v.passage_id === passageId);
  assert.strictEqual(seen.reached, 1, 'canon it was shown and contradicted anyway');
  ok('  and the flag it stores records which of the two faults it is');
}

// ---- 4. OPENING A BOOK WARMS ITS PROMPT, and does it once.
// The cold prefill is ~7.3s against ~0.33s warm and the router sleeps the model at 900s, so this
// is the largest wait a writer meets. It has to be one call, detached, and it must not repeat on
// every repaint — a client that paints twice would otherwise warm twice.
{
  calls = [];
  const open = () => routes['GET /api/story']({ body: {}, query: new URLSearchParams(`story=${story.id}`),
    owner: me, slot: { global: 8192, slots: 1, perSlot: 8192 },
    gen: { max_tokens: 400, temperature: 0.85 }, setGen: () => {} } as any);

  open();
  await new Promise((r) => setTimeout(r, 300));
  const warm = calls.filter((c) => c.kind === 'prose');
  assert.strictEqual(warm.length, 1, `opening a book warms it once, and it made ${warm.length} calls`);
  assert.strictEqual(warm[0].maxTokens, 1,
    'and asks for one token — this is a prefill, not a generation');
  assert.match(warm[0].user, /Vel is the Murmur/,
    'and it sends the real prompt, or it warms a prefix nothing will reuse');
  ok('opening a book warms its prompt once, with nothing to generate');

  calls = [];
  open(); open();
  // 300ms, not 60. At 60 this assertion passed with the throttle DISABLED — the warm call
  // had been started and simply had not reached the fake yet, so an empty `calls` proved
  // nothing. Long enough that a call which is going to happen has happened.
  await new Promise((r) => setTimeout(r, 300));
  assert.deepStrictEqual(calls, [],
    'and re-opening inside the throttle warms nothing — a repainting client must not warm in a loop');
  ok('  and a second open inside the window costs no call at all');
}

console.log(`\n${n} checks passed`);
srv.close();
