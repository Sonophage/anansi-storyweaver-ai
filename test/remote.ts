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
// Takes the whole plan: admin only. Uncensored, so the default search would show it to anyone.
const BIG = 'mlabonne/Llama-3.3-70B-Instruct-abliterated';
// Guessed "can switch" from its class, and plans anyway when asked not to: the probe's case.
const STUBBORN = 'liar/Gemma-4-31B-UNCENSORED';
// Guessed "doesn't weave" from its class, and plans inline.
const PLANS_INLINE = 'TheDrummer/Mistral-Small-Uncensored-24B';

/** The fake catalogue, in Featherless's own field names. One row per case the search must handle. */
const CATALOGUE = [
  { id: REMOTE, model_class: 'qwen3_5moe-35b', context_length: 32768, concurrency_cost: 2 },
  { id: SMALL, model_class: 'llama3-8b', context_length: 4096, concurrency_cost: 1 },
  { id: BIG, model_class: 'llama33-70b', context_length: 32768, concurrency_cost: 4 },
  { id: 'huihui/gpt-oss-20b-abliterated', model_class: 'gpt-oss-20b', context_length: 32768,
    concurrency_cost: 1 },
  { id: PLANS_INLINE, model_class: 'mistral-24b', context_length: 32768,
    concurrency_cost: 1 },
  { id: STUBBORN, model_class: 'gemma4-31b', context_length: 32768, concurrency_cost: 2 },
  { id: 'google/Gemma-4-26B-it', model_class: 'gemma4-26b', context_length: 32768, concurrency_cost: 2 },
  // The floor, from both sides: exactly 16k is shown, a hair under it is not, and so is a row that
  // does not say.
  { id: 'edge/Exactly-16k-heretic', model_class: 'llama3-8b', context_length: 16384, concurrency_cost: 1 },
  { id: 'edge/Under-16k-heretic', model_class: 'llama3-8b', context_length: 16000, concurrency_cost: 1 },
  { id: 'edge/No-Context-heretic', model_class: 'llama3-8b', concurrency_cost: 1 },
];

/** What reached the fake Featherless, newest last. */
const fl: { path: string; auth: string | undefined; body: any }[] = [];
/** How the next chat calls should go, shifted one per call. Empty means "answer normally". */
const script: ('429' | 'midstream' | 'cold' | 'refuse')[] = [];
/** Every catalogue read, by the Authorization header it carried. Kept apart from `fl`, which blocks
 *  clear as they go. */
const catReads: (string | undefined)[] = [];

const flSrv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    fl.push({ path: req.url ?? '', auth: req.headers.authorization, body });
    const json = (status: number, o: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/v1/models') catReads.push(req.headers.authorization);
    if (req.url === '/v1/models') return json(200, { data: CATALOGUE });
    if (req.url === '/v1/tokenize') return json(200, { count: 321 });
    if (req.url !== '/v1/chat/completions') return json(404, { error: { message: 'no route' } });
    const how = script.shift();
    if (how === '429') return json(429, { error: { message: `concurrency limit, key ${KEY}` } });
    if (how === 'refuse') return json(400, { error: { message: `bad request for key ${KEY}` } });
    const answer = () => {
      // Two models plan when told not to, each the way a provider can show it: in the reasoning
      // field, and inline in the prose.
      const message = body.model === STUBBORN
        ? { content: 'ok', reasoning_content: 'The user wants a short answer.' }
        : body.model === PLANS_INLINE ? { content: '<think>A short answer, then.</think>ok' }
        : { content: 'The remote wrote this.' };
      if (!body.stream) return json(200, { choices: [{ message, finish_reason: 'stop' }],
        usage: { prompt_tokens: 321, completion_tokens: 5 } });
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
      { id: 'Qwen3.6-WNTH-35B-A3B-NN', status: { value: 'loaded' } },
      { id: 'Gemma-4-WNTH-31B-NN', status: { value: 'unloaded' } } ] });
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

// ---- 7. the router's controls are never called for a remote id ----
{
  const LOCAL = 'Gemma-4-WNTH-31B-NN';   // not the boot default, so it can be released
  let m = mark();
  // Remote -> local -> remote. Each switch away from a model asks whether to release it.
  for (const to of [LOCAL, ID]) {
    const r = await routes['POST /api/model'](ctx(me, { model: to }));
    assert.ok(!r.error, r.error);
  }
  const unloads = local.slice(m.local).filter((x) => x.path === '/models/unload');
  assert.ok(unloads.every((x) => x.body.model === LOCAL),
    'only the local model was ever released; a remote id never reaches unload');
  assert.ok(unloads.length === 1, 'and the local one was, so this check can see an unload at all');
  const { unload } = await import('../src/llama.ts');
  assert.strictEqual((await unload(ID)).ok, false, 'unload refuses a remote id whoever calls it');

  // Opening the app and opening the book each warm the writer's model. Not on Featherless.
  m = mark();
  await routes['GET /api/stories'](ctx(me));
  await routes['GET /api/story'](ctx(me, {}, `story=${story.id}`));
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(since(m).fl.length, 0, 'no warm call is spent on Featherless');
  const { tooManyModels } = await import('../src/routes.ts');
  assert.strictEqual(tooManyModels(['a', 'b'], ID), false, 'a remote model loads nothing here');
  assert.strictEqual(tooManyModels(['a', ID], 'b'), false, 'and another writer on one is not a load');
  ok('unload, warming and the loaded-model count never touch a remote id');
}

// ---- 8. the menu: local models as before, then this writer's shortlist, each with its source ----
{
  const other = db.owner('other-writer');
  const r = await routes['GET /api/models'](ctx(me));
  assert.deepStrictEqual(r.models.map((m: any) => [m.id, m.source]),
    [['Gemma-4-WNTH-31B-NN', 'local'], ['Qwen3.6-WNTH-35B-A3B-NN', 'local'], [ID, 'remote']], 'local first, then the shortlist');
  assert.strictEqual(r.models[2].perSlot, 32768, 'a remote row says the room it really has');
  const theirs = await routes['GET /api/models'](ctx(other));
  assert.deepStrictEqual(theirs.models.map((m: any) => m.id), ['Gemma-4-WNTH-31B-NN', 'Qwen3.6-WNTH-35B-A3B-NN'],
    'and no one else sees it');
  ok('the models route lists local models, then the writer\'s own shortlist, with sources');
}

// ---- 9. a remote default or pin must be on the owning writer's shortlist ----
{
  const other = db.owner('pin-other');
  const theirs = db.createStory(other, { title: 'Not Mine' });
  const set = await routes['POST /api/model'](ctx(other, { model: ID }));
  assert.match(String(set.error), /not on the shortlist/, 'a default off your shortlist is refused');
  assert.notStrictEqual(db.defaultModelOf(other), ID, 'and not stored');
  await assert.rejects(routes['POST /api/story'](ctx(other, { id: theirs.id, story: { model: ID } })),
    /not on the shortlist/, 'a pin off the owner\'s shortlist is refused');
  await assert.rejects(routes['POST /api/story'](ctx(me, { id: story.id,
    story: { model: `featherless:${NOT_LISTED}` } })), /not on the shortlist/,
    'and so is a remote id nobody shortlisted');

  const pinned = db.createStory(me, { title: 'Pinned' });
  await routes['POST /api/story'](ctx(me, { id: pinned.id, story: { model: ID } }));
  assert.strictEqual(db.getStory(pinned.id).model, ID, 'a shortlisted pin is stored unchanged');

  // A remote id written past the routes — an old row, or a model since removed — is not trusted:
  // it falls back to the local default rather than reaching Featherless.
  db.setDefaultModel(other, ID);
  db.updateStory(theirs.id, { model: ID });
  const v = await routes['GET /api/story'](ctx(other, {}, `story=${theirs.id}`));
  assert.strictEqual(v.model, 'Qwen3.6-WNTH-35B-A3B-NN', 'off the shortlist, the local default writes');
  ok('a remote default or pin stands only on the owning writer\'s shortlist');
}

// ---- 10. background work stays on the local default whatever the writer picked ----
{
  assert.strictEqual(db.defaultModelOf(me), ID, 'the writer is on the remote model');
  const m = mark();
  const chapterId = (db.chapters(story.id)[0] as any).id;
  await routes['POST /api/remember'](ctx(me, { storyId: story.id, chapterId }));
  await routes['POST /api/extract'](ctx(me, { storyId: story.id, chapterId }));
  const went = since(m);
  assert.strictEqual(went.fl.length, 0, 'memory and extraction never reach Featherless');
  assert.ok(went.local.length >= 2, 'they went to the local router');
  assert.ok(went.local.every((x) => !String(x.body?.model ?? '').startsWith('featherless:')),
    'under a local id');

  // Talk is something the writer asked for, so it follows the writer's model — structured, with the
  // strict schema Featherless enforces.
  const t = mark();
  await routes['POST /api/talk'](ctx(me, { storyId: story.id, said: 'Who keeps the lamp?' }));
  const talked = since(t).fl;
  assert.ok(talked.length >= 1 && talked.every((x) => x.body.model === REMOTE),
    'Talk goes to the remote model the writer chose');
  assert.strictEqual(talked[0].body.response_format?.json_schema?.strict, true,
    'with its schema, strict');
  assert.strictEqual(since(t).local.length, 0, 'and not to the local router');

  // The one door. Every writer-facing call resolves its model through `writerModel`, which is the
  // only place the shortlist is asked; a second `modelFor(` would be a call that can skip it.
  const src = (await import('node:fs')).readFileSync(new URL('../src/routes.ts', import.meta.url), 'utf8');
  assert.strictEqual(src.match(/\bmodelFor\(/g)?.length, 1, 'routes.ts calls modelFor in one place');
  ok('summaries, memory and extraction stay local; writer calls resolve through one helper');
}

// ---- 11. only a real catalogue model, by its prefixed id, goes on a shortlist ----
{
  const other = db.owner('adder');
  const bare = await routes['POST /api/shortlist'](ctx(other, { model: REMOTE }));
  assert.match(String(bare.error), /starts with "featherless:"/, 'an id without its prefix is refused');
  const unknown = await routes['POST /api/shortlist'](ctx(other, { model: `featherless:${NOT_LISTED}` }));
  assert.match(String(unknown.error), /does not list/, 'a model Featherless does not list is refused');
  const added = await routes['POST /api/shortlist'](ctx(other, { model: ID }));
  assert.deepStrictEqual(added.models.map((x: any) => [x.id, x.context]), [[ID, 32768]],
    'a listed one is added, with the context its catalogue entry gives');
  assert.strictEqual(catReads.length, 1,
    'the catalogue was read once, for the first add of the suite, and reused since');
  assert.strictEqual(catReads[0], undefined, 'and it is public, so the key is not sent to read it');
  const gone = await routes['POST /api/shortlist/remove'](ctx(other, { model: ID }));
  assert.deepStrictEqual(gone.models, [], 'remove takes it off');
  ok('a shortlist takes a listed remote id only, and the catalogue is read once and keyless');
}

// ---- 12. the search: uncensored by default, filters that combine, the floor, the sort ----
{
  const find = async (query = '', admin = false) => {
    const c = ctx(me, {}, query); c.admin = admin;
    const r = await routes['GET /api/catalogue'](c);
    assert.ok(!r.error, r.error);
    return r;
  };
  const ids = (r: any) => r.models.map((m: any) => m.id.replace('featherless:', ''));

  const all = await find();
  // THE 4-UNIT GATE. The detector first: the admin's search must see BIG, or "nobody else sees it"
  // could be a model the search lost for some other reason.
  assert.ok(ids(await find('', true)).includes(BIG), 'the admin is shown the model that takes the whole plan');
  assert.ok(!ids(all).includes(BIG), 'GATE: no one else is ever shown a 4-unit model');
  assert.ok(!ids(await find('q=llama&uncensored=0')).includes(BIG), 'GATE: not even by name');
  assert.ok(all.models.every((m: any) => m.id.startsWith('featherless:')),
    'every row carries the prefixed id the shortlist takes');
  assert.deepStrictEqual(ids(all), [
    PLANS_INLINE, 'edge/Exactly-16k-heretic',
    STUBBORN, REMOTE, 'huihui/gpt-oss-20b-abliterated'],
    'uncensored only, under 16k and the 4-unit model gone, and the ones that never weave first');
  const row = all.models.find((m: any) => m.id === ID);
  assert.deepStrictEqual([row.cost, row.context, row.weaving], [2, 32768, 'can switch'],
    'a row says its unit cost, its context and its weaving guess');
  assert.strictEqual(all.models.find((m: any) => m.id.includes('gpt-oss')).weaving, 'always weaves');
  assert.strictEqual(all.models[0].weaving, "doesn't weave");

  const stock = await find('uncensored=0');
  assert.ok(ids(stock).includes('google/Gemma-4-26B-it'), 'turning uncensored-only off shows a stock model');
  assert.ok(!ids(stock).some((i: string) => /16k|No-Context|Tiny/.test(i) && !i.includes('Exactly')),
    'and the floor still holds with the filter off');

  assert.deepStrictEqual(ids(await find('q=gemma')), [STUBBORN], 'free text, case-insensitive, on the name');
  assert.deepStrictEqual(ids(await find('q=gemma&uncensored=0')), ['google/Gemma-4-26B-it', STUBBORN],
    'free text and the uncensored switch combine');
  assert.deepStrictEqual(ids(await find('size=24b')), [PLANS_INLINE],
    'the size class filter');
  assert.deepStrictEqual(ids(await find(`weaving=${encodeURIComponent('can switch')}`)), [STUBBORN, REMOTE],
    'the weaving filter');
  assert.deepStrictEqual(ids(await find(`weaving=${encodeURIComponent('can switch')}&size=31b`)), [STUBBORN],
    'and weaving with size');
  assert.deepStrictEqual(ids(await find('q=nothing-like-this')), [], 'a search that matches nothing is empty');
  assert.ok(all.sizes.includes('35b') && all.sizes.includes('24b'),
    'the size choices come from the catalogue itself');

  ok('the search filters, combines, sorts non-weaving first, holds the 16k floor and the 4-unit gate');
}

// ---- 13. adding: one weaving-off probe, and the label and unit cost stored with the entry ----
{
  const writer = db.owner('prober');
  const add = async (id: string, admin = false) => {
    const c = ctx(writer, { model: `featherless:${id}` }); c.admin = admin;
    const m = mark();
    const r = await routes['POST /api/shortlist'](c);
    return { r, probes: since(m).fl, local: since(m).local };
  };
  const entry = (id: string) =>
    (db.shortlistOf(writer) as any[]).find((x) => x.id === `featherless:${id}`);

  const first = await add(REMOTE);
  assert.ok(!first.r.error, first.r.error);
  assert.strictEqual(first.probes.length, 1, 'adding makes exactly one call');
  const p = first.probes[0].body;
  assert.strictEqual(p.model, REMOTE, 'to the model being added');
  assert.strictEqual(p.chat_template_kwargs?.enable_thinking, false, 'with weaving off');
  assert.ok(p.max_tokens > 0 && p.max_tokens <= 32, 'and a tiny answer');
  assert.strictEqual(first.local.length, 0, 'the probe never goes to the local router');
  assert.deepStrictEqual([entry(REMOTE).weaving, entry(REMOTE).cost], ['can switch', 2],
    'a model that obeyed is stored as its class guess, with its unit cost');

  await add(STUBBORN);
  assert.strictEqual(entry(STUBBORN).weaving, 'always weaves',
    'a model that planned anyway, in the reasoning field, is stored as always weaving');
  await add(PLANS_INLINE);
  assert.strictEqual(entry(PLANS_INLINE).weaving, 'always weaves',
    'and so is one that planned inline, though its class guessed it never would');
  await add('edge/Exactly-16k-heretic');
  assert.strictEqual(entry('edge/Exactly-16k-heretic').weaving, "doesn't weave");
  const listed = await routes['GET /api/shortlist'](ctx(writer));
  assert.ok(listed.models.every((m: any) => m.weaving && m.cost),
    'the shortlist route hands back the label and the cost with each entry');

  // THE GATE, ON ADD. Refused before the probe, so a refusal spends none of the plan.
  const big = await add(BIG);
  assert.match(String(big.r.error), /only the admin/, 'GATE: adding a 4-unit model as a writer is refused');
  assert.strictEqual(big.probes.length, 0, 'and no call is spent finding that out');
  assert.ok(!entry(BIG), 'and it is not stored');
  const under = await add('edge/Under-16k-heretic');
  assert.match(String(under.r.error), /at least 16,384/, 'a model under the floor is refused by name too');
  const admin = await add(BIG, true);
  assert.ok(!admin.r.error, admin.r.error);
  assert.strictEqual(entry(BIG).cost, 4, 'the admin can add it, and its cost is recorded');
  ok('adding probes once with weaving off, stores the label and the cost, and holds the gate');
}

console.log(`\n${n} checks green`);
flSrv.close(); localSrv.close();
