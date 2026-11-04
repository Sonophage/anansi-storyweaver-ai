// A reroll that opens like the take it replaces is asked again (#140), behind ANANSI_REROLL_AWAY.
//
// F66: one reroll in six starts with the rejected take's first five narration words, and every
// flagged repeat read by eye copied the OPENING and then went elsewhere. A reroll sends the prompt
// that wrote the take, byte for byte (docs/adr/0012), so its opening is drawn from the same
// distribution. What is under test is the wire: how many prose calls a reroll makes, with which
// seeds, which take comes back, and that nothing changes with the switch off.
//
// Driven against a FAKE llama-server that answers from a queue.
//
//   node --experimental-strip-types test/away.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-away.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;
delete process.env.ANANSI_REROLL_AWAY;

/** The prose calls the fake was sent, in order, with their seeds. */
let calls: { seed: number; stream: boolean }[] = [];
/** What the fake answers, one per prose call; the last one repeats when the queue runs dry. */
let answers: string[] = [];

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });
    if (b.response_format) return send({ choices: [{ message: { content: JSON.stringify({ entries: [] }) } }] });
    if (b.max_tokens === 1) return send({ choices: [{ message: { content: '' } }] });
    calls.push({ seed: b.seed, stream: !!b.stream });
    const text = answers.length > 1 ? answers.shift()! : answers[0];
    if (!b.stream) return send({ choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 200, completion_tokens: 40 } });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 200, completion_tokens: 40 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

// Imported AFTER the host is set: llama.ts reads it once, at module load.
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { openingOf } = await import('../src/context.ts');

const me = db.owner('away');
const s = db.createStory(me, { title: 'Away', premise: 'A city on a dead god.' }) as any;
db.addPassage({ ...s, storyId: s.id, body: 'The lower tiers still pulse.' });
const REPLACED = 'The door sighs shut behind them, sealing out the wet breath of the city. Seraphine waits.';
const take = db.addPassage({ ...s, storyId: s.id, body: REPLACED, author: 'model' }) as any;
const takeId = String(take?.id ?? take);
const SAME = 'The door sighs shut behind them, and this time the lamp is lit. She does not wait.';
const OTHER = 'Seraphine crosses to the chair and rests one gloved hand on its back.';

const ctx = (body: any) => ({ body, query: new URLSearchParams(), owner: me,
  slot: { global: 100096, slots: 2, perSlot: 50048 },
  gen: { temperature: 0.85, top_p: 0.95, target_words: 0, max_tokens: 900 }, setGen: () => {} }) as any;
const reroll = async (extra: any = {}) => {
  calls = [];
  return routes['POST /api/generate'](ctx({ storyId: s.id, mode: 'continue', regenerateOf: takeId, ...extra })) as any;
};

let n = 0;
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only: "${m}"`);
  n++; console.log(`  ok  ${m}`);
};

// ---- THE PREDICATE: the first five narration words, as F66 measured them (bench/echo.ts uses it).
{
  assert.strictEqual(openingOf(REPLACED), 'the door sighs shut behind');
  assert.strictEqual(openingOf(REPLACED), openingOf(SAME), 'OPENING-SAME: the two takes open alike');
  assert.notStrictEqual(openingOf(OTHER), openingOf(REPLACED), 'OPENING-OTHER: a take that opens elsewhere does not');
  assert.strictEqual(openingOf('"Sit," she says. The DOOR, sighs shut behind them.'), 'she says the door sighs',
    'OPENING-NARRATION: dialogue is left out, case and punctuation do not count');
  assert.strictEqual(openingOf('Too short here.'), '', 'OPENING-SHORT: under five words there is no opening to match');
  ok('a take\'s opening is its first five narration words');
}

// ---- THE CONTROL: switch off, the reroll is one call whatever it says.
{
  answers = [SAME, OTHER];
  const r = await reroll();
  assert.ok(!r.error, r.error);
  assert.strictEqual(calls.length, 1, `AWAY-OFF: one prose call with the switch off (${calls.length})`);
  assert.strictEqual(r.prose, SAME, 'AWAY-OFF: and its take comes back as it is');
  assert.strictEqual(r.away, undefined, 'AWAY-OFF: and says nothing about asking again');
  const m = await routes['POST /api/manifest'](ctx({ storyId: s.id, mode: 'continue', regenerateOf: takeId, count: false })) as any;
  assert.strictEqual(m.away, false, 'AWAY-MANIFEST-OFF: the manifest says the switch is off');
  ok('with the switch off a reroll is one call, as before');
}

process.env.ANANSI_REROLL_AWAY = '1';
// ---- THE TREATMENT: an answer that opens like the replaced take is asked for again, on a new seed.
{
  const m = await routes['POST /api/manifest'](ctx({ storyId: s.id, mode: 'continue', regenerateOf: takeId, count: false })) as any;
  assert.strictEqual(m.away, true, 'AWAY-MANIFEST-ON: the manifest says the switch is on, so an arm can be checked before it runs');
  const plain = await routes['POST /api/manifest'](ctx({ storyId: s.id, mode: 'continue', count: false })) as any;
  assert.strictEqual(plain.away, undefined, 'AWAY-MANIFEST-FIRST: and says nothing for a first take');

  answers = [SAME, OTHER];
  const r = await reroll();
  assert.strictEqual(calls.length, 2, `AWAY-RETRY: a same opening is asked again (${calls.length} calls)`);
  assert.notStrictEqual(calls[0].seed, calls[1].seed, 'AWAY-SEED: on a new seed');
  assert.strictEqual(r.prose, OTHER, 'AWAY-RETRY: and the take that opens elsewhere comes back');
  assert.deepStrictEqual(r.away, { retried: 1, seeds: [calls[0].seed] }, 'AWAY-SAYS: the answer says it asked again, with the seed it left');

  answers = [OTHER];
  const fresh = await reroll();
  assert.strictEqual(calls.length, 1, 'AWAY-FRESH: an answer that opens elsewhere is not asked again');
  assert.strictEqual(fresh.away, undefined, 'AWAY-FRESH: and says nothing');

  answers = [SAME];
  const stuck = await reroll();
  assert.strictEqual(calls.length, 3, `AWAY-LIMIT: asked again twice at most, three calls in all (${calls.length})`);
  assert.strictEqual(stuck.prose, SAME, 'AWAY-LIMIT: and the last answer comes back rather than an error');
  assert.strictEqual(stuck.away.retried, 2, 'AWAY-LIMIT: saying so');

  answers = [SAME];
  calls = [];
  const first = await routes['POST /api/generate'](ctx({ storyId: s.id, mode: 'continue' })) as any;
  assert.ok(!first.error && calls.length === 1, 'AWAY-FIRST-TAKE: a first take is never asked again: there is nothing it replaces');

  // A STREAM IS NEVER RESTARTED under the writer's eyes: its words are on the page as they arrive.
  answers = [SAME];
  calls = [];
  const h = await routes['POST /api/generate'](ctx({ storyId: s.id, mode: 'continue', regenerateOf: takeId, stream: true })) as any;
  await h.__stream(() => {});
  assert.strictEqual(calls.length, 1, `AWAY-STREAM: a streamed reroll is one call (${calls.length})`);
  assert.ok(calls[0].stream, 'AWAY-STREAM: and it was streamed');
  ok('with the switch on a reroll that opens like the take it replaces is asked again, twice at most, never on a stream');
}
delete process.env.ANANSI_REROLL_AWAY;

console.log(`\n${n} checks passed`);
srv.close();
