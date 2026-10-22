// Remote models: a writer's shortlist, and a passage written by Featherless.
//
// Driven against TWO fakes, because both halves of the rule are under test: a FAKE Featherless,
// which records every request that reaches it (the key, the model, the sampler), and a FAKE local
// router, which proves the background work still goes to this machine. Real Featherless is never
// called — it costs plan units, and a 429 or a mid-stream failure cannot be asked for nicely.
//
//   node --experimental-strip-types test/remote.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync, writeFileSync } from 'node:fs';

const DB = '/tmp/anansi-remote.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

// A key that is easy to find in anything it must not be in.
const KEY = 'fl-TEST-KEY-7f3a9c-do-not-echo';
const KEY_FILE = '/tmp/anansi-remote.key';
writeFileSync(KEY_FILE, KEY + '\n');
process.env.ANANSI_FEATHERLESS_KEY_FILE = KEY_FILE;
// The retry schedule, shrunk. The real one waits about twenty seconds in all, and a suite that
// waited that long on every 429 case would be a suite nobody runs.
process.env.ANANSI_FEATHERLESS_BACKOFF_MS = '10,10,10';

const REMOTE = 'llmfan46/Qwen3.6-35B-A3B-uncensored-heretic';
const SMALL = 'someone/Tiny-Ctx-heretic';
const NOT_LISTED = 'nobody/Not-In-The-Catalogue';

/** What reached the fake Featherless, newest last. */
const fl: { path: string; auth: string | undefined; body: any }[] = [];
/** How the next chat calls should go, shifted one per call. Empty means "answer normally". */
const script: ('429' | 'midstream' | 'cold' | 'refuse')[] = [];

const flSrv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    fl.push({ path: req.url ?? '', auth: req.headers.authorization, body });
    const json = (status: number, o: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/v1/models') return json(200, { data: [
      { id: REMOTE, model_class: 'qwen3-35b-a3b', context_length: 32768 },
      { id: SMALL, model_class: 'llama3-8b', context_length: 4096 },
    ] });
    if (req.url === '/v1/tokenize') return json(200, { count: 321 });
    if (req.url !== '/v1/chat/completions') return json(404, { error: { message: 'no route' } });
    const how = script.shift();
    if (how === '429') return json(429, { error: { message: `concurrency limit, key ${KEY}` } });
    if (how === 'refuse') return json(400, { error: { message: `bad request for key ${KEY}` } });
    const answer = () => {
      if (!body.stream) return json(200, { choices: [{ message: { content: 'The remote wrote this.' },
        finish_reason: 'stop' }], usage: { prompt_tokens: 321, completion_tokens: 5 } });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const f = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      f({ choices: [{ delta: { content: 'The remote ' } }] });
      if (how === 'midstream') {
        f({ error: { message: `upstream died, key ${KEY}` } });
        return res.end();
      }
      f({ choices: [{ delta: { content: 'streamed this.' }, finish_reason: 'stop' }] });
      f({ choices: [], usage: { prompt_tokens: 321, completion_tokens: 4 } });
      res.write('data: [DONE]\n\n');
      res.end();
    };
    // A model Featherless is loading answers late, not never.
    if (how === 'cold') setTimeout(answer, 1500); else answer();
  });
});
await new Promise<void>((r) => flSrv.listen(0, '127.0.0.1', r));
process.env.ANANSI_FEATHERLESS_URL = `http://127.0.0.1:${(flSrv.address() as any).port}/v1`;

/** What reached the fake LOCAL router. */
const local: { path: string; body: any }[] = [];
const localSrv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    local.push({ path: req.url ?? '', body });
    const json = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o)); };
    if (req.url === '/v1/models') return json({ data: [
      { id: 'Qwen3.6-WNTH-35B-A3B-NN', status: { value: 'loaded' } } ] });
    if (req.url === '/tokenize') return json({ tokens: Array.from({ length: 200 }, (_, i) => i) });
    if (req.url === '/models/unload') return json({});
    json({ choices: [{ message: { content: JSON.stringify({ characters: [], entries: [] }) } }],
           usage: { prompt_tokens: 200, completion_tokens: 10 } });
  });
});
await new Promise<void>((r) => localSrv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(localSrv.address() as any).port}`;

// Everything the process prints, so "the key never appears in a log line" is a check and not a hope.
const printed: string[] = [];
for (const k of ['log', 'error', 'warn'] as const) {
  const real = console[k].bind(console);
  console[k] = (...a: any[]) => { printed.push(a.map(String).join(' ')); real(...a); };
}

const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');

const me = db.owner('remote-writer');
const story = db.createStory(me, { title: 'Far Shore', premise: 'A lighthouse nobody keeps.' });
db.addPassage({ ...story, storyId: story.id, body: 'The lamp turned on its own.' });

const ctx = (owner: string, body: any = {}, query = '') => {
  const c: any = { body, query: new URLSearchParams(query), owner,
    slot: { global: 100096, slots: 2, perSlot: 50048 }, gen: { max_tokens: 400, dry_multiplier: 0,
      xtc_probability: 0, target_words: 0, temperature: 0.85, min_p: 0.05 }, setGen: () => {},
    defaultModel: db.defaultModelOf(owner),
    setDefaultModel: (id: string) => { db.setDefaultModel(owner, id); c.defaultModel = id; },
    otherDefaults: () => db.otherDefaultModels(owner), admin: false };
  return c;
};

let n = 0;
// Message only — assertions run inline above, as in test/memory.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() takes a message only ("${m}")`);
  n++; console.log(`  ok  ${m}`);
};
const chats = () => fl.filter((r) => r.path === '/v1/chat/completions');

// ---- 1. a shortlisted remote model writes a passage, with the key, under its own id ----
{
  const id = `featherless:${REMOTE}`;
  const added = await routes['POST /api/shortlist'](ctx(me, { model: id }));
  assert.ok(!added.error, added.error);
  const listed = await routes['GET /api/shortlist'](ctx(me));
  assert.deepStrictEqual(listed.models.map((m: any) => m.id), [id], 'the model is on the shortlist');

  const set = await routes['POST /api/model'](ctx(me, { model: id }));
  assert.ok(!set.error, set.error);
  assert.strictEqual(db.defaultModelOf(me), id, 'the writer default stores the prefixed id unchanged');

  fl.length = 0;
  const r = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.prose, 'The remote wrote this.', 'the passage came from Featherless');
  const call = chats().at(-1)!;
  assert.ok(call, 'the chat reached the fake Featherless');
  assert.strictEqual(call.auth, `Bearer ${KEY}`, 'the server-side key rides on the request');
  assert.strictEqual(call.body.model, REMOTE, 'Featherless is sent its own id, without the prefix');
  const row = db.recentGenerations(story.id, 1)[0] as any;
  assert.strictEqual(row.model, id, 'the generation row stores the prefixed id unchanged');
  ok('a shortlisted remote model writes a passage, with the key, and the row keeps its id');
}

const ID = `featherless:${REMOTE}`;
/** Everything a writer or a log could ever be shown, in one string, for the key checks. */
const leaked = (...out: unknown[]) => [...out.map((o) => JSON.stringify(o ?? null)), ...printed,
  JSON.stringify(db.recentGenerations(story.id, 200))].join('\n').includes(KEY);
/** Drive the streaming generation the way serve.ts does: the handler returns `{__stream}` and the
 *  last thing it sends is what the non-streaming route would have returned. */
const streamed = async (body: any) => {
  const out: any[] = [];
  const h = await routes['POST /api/generate'](ctx(me, { ...body, stream: true }));
  const last = await h.__stream((o: unknown) => out.push(o));
  return { deltas: out.map((o) => o.d).filter(Boolean), last };
};

// ---- 2. it streams like a local one, and only documented sampler keys reach Featherless ----
{
  fl.length = 0;
  const { deltas, last } = await streamed({ storyId: story.id, mode: 'continue' });
  assert.ok(!last.error, last.error);
  assert.deepStrictEqual(deltas, ['The remote ', 'streamed this.'], 'the deltas arrive as they land');
  assert.strictEqual(last.prose, 'The remote streamed this.');
  assert.ok(last.passageId, 'and the streamed passage lands in the book');
  const body = chats().at(-1)!.body;
  assert.strictEqual(body.stream, true);
  for (const k of ['dry_multiplier', 'xtc_probability', 'target_words', 'thinking'])
    assert.ok(!(k in body), `${k} is llama.cpp's or the app's own, and is not sent to Featherless`);
  assert.strictEqual(body.temperature, 0.85, 'the documented sampler keys still go');
  assert.strictEqual(body.min_p, 0.05);
  assert.ok(Number.isInteger(body.seed), 'and so does the seed');
  ok('a remote passage streams, and only documented sampler keys are sent');
}

// ---- 3. the exact count comes from Featherless, and the budget is the smaller limit ----
{
  fl.length = 0;
  const r = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  const tok = fl.find((x) => x.path === '/v1/tokenize');
  assert.ok(tok, 'the budget guard asked Featherless to count');
  assert.strictEqual(tok!.body.model, REMOTE, 'for the remote model');
  assert.strictEqual(typeof tok!.body.text, 'string', 'with {model, text}, the way Featherless takes it');
  assert.strictEqual(r.manifest.totals.used, 321, 'and its {count} is the number the guard used');

  // The same book, budgeted locally against a slot the size of the catalogue's 32,768: that is the
  // budget a remote call must get, because the writer's slot here is 50,048.
  db.setDefaultModel(me, 'Qwen3.6-WNTH-35B-A3B-NN');
  const at = (perSlot: number) => {
    const c = ctx(me, { storyId: story.id, mode: 'continue' });
    c.slot = { ...c.slot, perSlot };
    return c;
  };
  const local32 = (await routes['POST /api/manifest'](at(32768))).manifest.totals.budget;
  const local16 = (await routes['POST /api/manifest'](at(16000))).manifest.totals.budget;
  const local50 = (await routes['POST /api/manifest'](at(50048))).manifest.totals.budget;
  db.setDefaultModel(me, ID);
  // Without this the checks below could pass on a fixture whose budget ignores the slot.
  assert.ok(local16 < local32 && local32 < local50, 'the budget in this fixture moves with the slot');
  assert.strictEqual(r.manifest.totals.budget, local32,
    'a remote passage is budgeted against the model\'s own 32,768, not the 50,048 slot');
  const small = await routes['POST /api/generate'](at(16000));
  assert.strictEqual(small.manifest.totals.budget, local16,
    'and against the slot when the slot is the smaller of the two');
  const preview = await routes['POST /api/manifest'](at(50048));
  assert.strictEqual(preview.manifest.totals.budget, local32,
    'the Context panel previews the same budget the generation uses');
  assert.strictEqual(preview.exact, 321, 'and counts with Featherless too');
  ok('a remote call counts with Featherless and is budgeted against the smaller limit');
}

/** Every chat that went anywhere since `mark`: Featherless's, and the local router's. */
const since = (mark: { fl: number; local: number }) => ({
  fl: fl.slice(mark.fl).filter((r) => r.path === '/v1/chat/completions'),
  local: local.slice(mark.local).filter((r) => r.path === '/v1/chat/completions'),
});
const mark = () => ({ fl: fl.length, local: local.length });

// ---- 4. a 429 is retried, then reported; it never falls back to another model ----
{
  // The detector first: a leak check that cannot see the key reports a clean run forever.
  assert.ok(leaked({ said: `x${KEY}x` }), 'the leak check finds the key when it is there');
  let m = mark();
  script.push('429', '429', '429');
  const r = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.ok(!r.error, r.error);
  assert.strictEqual(since(m).fl.length, 4, 'three 429s, then the fourth attempt wrote the passage');

  m = mark();
  script.push('429', '429', '429', '429');
  const busy = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.strictEqual(busy.error, 'Featherless is busy, try again', 'the composer is told plainly');
  const tried = since(m);
  assert.strictEqual(tried.fl.length, 4, 'one call and three retries, no more');
  assert.ok(tried.fl.every((x) => x.body.model === REMOTE), 'every attempt was the chosen model');
  assert.strictEqual(tried.local.length, 0, 'NO FALLBACK: nothing went to the local router instead');
  assert.ok(!leaked(r, busy), 'the key appears in no response, log line or generation row');
  ok('a 429 is retried three times, then reported, and never falls back');
}

// ---- 5. any other refusal, and a stream that fails mid-passage, report and never fall back ----
{
  let m = mark();
  script.push('refuse');
  const refused = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.match(String(refused.error), /^Featherless answered 400/, 'a refusal says who refused');
  assert.ok(refused.error.includes('[key]'), 'its message is kept, with the key cut out of it');
  assert.strictEqual(since(m).fl.length, 1, 'a 400 is not retried');
  assert.strictEqual(since(m).local.length, 0, 'and nothing fell back to the local router');

  m = mark();
  const before = db.passagesOfChapter((db.chapters(story.id)[0] as any).id).length;
  script.push('midstream');
  const { last } = await streamed({ storyId: story.id, mode: 'continue' });
  assert.match(String(last.error), /^Featherless stopped mid-passage/, 'the passage fails, plainly');
  assert.strictEqual(db.passagesOfChapter((db.chapters(story.id)[0] as any).id).length, before,
    'and no half-written passage lands in the book');
  assert.strictEqual(since(m).local.length, 0, 'NO FALLBACK after a mid-stream failure either');
  assert.ok(!leaked(refused, last), 'the key appears in no response, log line or generation row');
  ok('a refusal or a mid-stream failure is reported with the key cut out, and never falls back');
}

// ---- 6. a cold model is slow, not failed ----
{
  script.push('cold');
  const t0 = Date.now();
  const r = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.ok(!r.error, r.error);
  assert.ok(Date.now() - t0 >= 1400, 'the fake really did hold the first call');
  assert.strictEqual(r.prose, 'The remote wrote this.', 'and the passage still came back');
  ok('a first call to a model Featherless is loading waits rather than fails');
}

console.log(`\n${n} checks green`);
flSrv.close(); localSrv.close();
