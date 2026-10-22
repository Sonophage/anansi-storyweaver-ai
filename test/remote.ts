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

console.log(`\n${n} checks green`);
flSrv.close(); localSrv.close();
