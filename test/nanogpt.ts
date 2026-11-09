// NanoGPT, the second remote provider (docs/adr/0015): its ids, its key file, its catalogue, a
// passage written on it, and the refusals it answers with.
//
// Driven against a FAKE NanoGPT and a FAKE local router, with Featherless pointed at a port that
// refuses at once. Real NanoGPT is never called. Every shape the fake answers with was seen on the
// real API on 2026-11-09: the subscription catalogue's fields, the 429 `api_key_usd_limit` for a
// model outside a subscription-only key, and the 404 on /tokenize.
//
//   node --experimental-strip-types test/nanogpt.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DB = '/tmp/anansi-nanogpt.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

// A key that is easy to find in anything it must not be in.
const KEY = 'sk-nano-TEST-4b1d-do-not-echo';
const KEYS = mkdtempSync(join(tmpdir(), 'anansi-nanogpt-keys-'));
const KEY_FILE = join(KEYS, 'one.key');
writeFileSync(KEY_FILE, KEY + '\r\n');   // as a pasted one did. Node's fetch strips a trailing CR from a header too, so this proves no trim.
process.env.ANANSI_NANOGPT_KEY_FILE = KEY_FILE;
// Featherless is off: no key, and a port that refuses. A NanoGPT model must write without it.
process.env.ANANSI_FEATHERLESS_KEY_FILE = '/nonexistent/featherless.key';
process.env.ANANSI_FEATHERLESS_URL = 'http://127.0.0.1:9/v1';
process.env.ANANSI_HF_URL = 'http://127.0.0.1:9';
process.env.ANANSI_FEATHERLESS_BACKOFF_MS = '10,10,10';

const WRITER = 'qwen/qwen3.8-27b-novelist';
const THINKS = 'Gemma-4-31B-MeroMero-v2:thinking';     // no org, and a colon of its own
const SMALL = 'tiny/eight-k-model';
const OUTSIDE = 'openai/gpt-6.1-sol';                  // not in the subscription

/** The fake catalogue, in NanoGPT's own field names (`?detailed=true`, read 2026-11-09). */
const CATALOGUE = [
  { id: WRITER, name: 'Qwen3.8 27B Novelist', description: 'A 27B model tuned for long fiction.',
    context_length: 131072, capabilities: { reasoning: true }, pricing: { prompt: 0.1, completion: 0.4 } },
  { id: THINKS, name: 'MeroMero v2 (thinking)', description: 'Plans before it writes.',
    context_length: 65536, capabilities: { reasoning: true } },
  { id: SMALL, name: 'Tiny', description: 'Too small for a book.', context_length: 8192, capabilities: {} },
];

const hits: { path: string; auth?: string; agent?: string; body: any }[] = [];
const script: ('429' | 'usd' | 'down')[] = [];
const fake = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    hits.push({ path: req.url ?? '', auth: req.headers.authorization, agent: req.headers['user-agent'], body });
    const json = (status: number, o: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/api/subscription/v1/models?detailed=true') return json(200, { object: 'list', data: CATALOGUE });
    if (req.url === '/api/subscription/v1/tokenize') return json(404, { error: { message: 'not found' } });
    if (req.url !== '/api/subscription/v1/chat/completions') return json(404, { error: { message: 'no route' } });
    // AS THE REAL ONE REFUSES IT (2026-11-09), word for word but the model: a subscription-only key
    // asking for a model the subscription does not cover.
    if (body.model === OUTSIDE || script[0] === 'usd') {
      if (script[0] === 'usd') script.shift();
      return json(429, { error: { billing_restriction: 'subscription_only', message: 'This API key is set '
        + `to subscription-only billing and cannot spend from your balance (requested model: ${body.model}). key ${KEY}`,
        type: 'rate_limit_error', param: null, code: 'api_key_usd_limit', reason: 'key_budget' } });
    }
    const how = script.shift();
    if (how === 'down') return req.socket.destroy();
    if (how === '429') return json(429, { error: { message: `rate limited, key ${KEY}`, type: 'rate_limit_error' } });
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const f = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      f({ choices: [{ delta: { role: 'assistant' } }] });
      f({ choices: [{ delta: { content: 'Nano wrote this.' }, finish_reason: 'stop' }] });
      f({ choices: [], usage: { prompt_tokens: 300, completion_tokens: 4 } });
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    const plans = body.model === THINKS;
    json(200, { choices: [{ message: { content: plans ? 'Ok' : 'Ok.', ...(plans ? { reasoning: 'Let me think.' } : {}) },
      finish_reason: 'stop' }], usage: { prompt_tokens: 15, completion_tokens: 2, cost: 0 } });
  });
});
await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
process.env.ANANSI_NANOGPT_URL = `http://127.0.0.1:${(fake.address() as any).port}/api/subscription/v1`;

// The local router, so background work after a passage never reaches the real one on this machine.
const local: { path: string; body: any }[] = [];
const localSrv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    local.push({ path: req.url ?? '', body: raw ? JSON.parse(raw) : null });
    const json = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/v1/models') return json({ data: [{ id: 'Qwen3.6-WNTH-35B-A3B-NN', status: { value: 'loaded' } }] });
    if (req.url === '/tokenize') return json({ tokens: Array.from({ length: 200 }, (_, i) => i) });
    json({ choices: [{ message: { content: JSON.stringify({ characters: [], entries: [] }) } }],
           usage: { prompt_tokens: 200, completion_tokens: 10 } });
  });
});
await new Promise<void>((r) => localSrv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(localSrv.address() as any).port}`;

const printed: string[] = [];
for (const k of ['log', 'error', 'warn'] as const) {
  const real = console[k].bind(console);
  console[k] = (...a: any[]) => { printed.push(a.map(String).join(' ')); real(...a); };
}

const llama = await import('../src/llama.ts');
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };
const chats = () => hits.filter((h) => h.path === '/api/subscription/v1/chat/completions');
const leaked = (...out: unknown[]) => [...out.map((o) => JSON.stringify(o ?? null)), ...printed].join('\n').includes(KEY);

const me = db.owner('nano-writer');
const story = db.createStory(me, { title: 'Glass Harbour', premise: 'A port that remembers ships.' });
db.addPassage({ ...story, storyId: story.id, body: 'The tide came in backwards.' });
const ctx = (owner: string, body: any = {}, query = '') => {
  const c: any = { body, query: new URLSearchParams(query), owner,
    slot: { global: 100096, slots: 2, perSlot: 50048 }, gen: { max_tokens: 400, dry_multiplier: 0,
      xtc_probability: 0, target_words: 0, temperature: 0.85, min_p: 0.05 }, setGen: () => {},
    defaultModel: db.defaultModelOf(owner),
    setDefaultModel: (id: string) => { db.setDefaultModel(owner, id); c.defaultModel = id; },
    otherDefaults: () => db.otherDefaultModels(owner), admin: false };
  return c;
};

// ---- 1. one parser for where a model runs ----
{
  const { sourceOf, isRemote, remoteName, PROVIDERS } = llama as any;
  assert.strictEqual(sourceOf('Qwen3.6-WNTH-35B-A3B-NN'), 'local', 'SOURCE-LOCAL: no prefix is local');
  assert.strictEqual(sourceOf(`featherless:${WRITER}`), 'featherless');
  assert.strictEqual(sourceOf(`nanogpt:${WRITER}`), 'nanogpt', 'SOURCE-NANO: the nanogpt prefix');
  assert.strictEqual(sourceOf(null), 'local');
  assert.ok(isRemote(`nanogpt:${WRITER}`) && isRemote(`featherless:${WRITER}`) && !isRemote(WRITER),
    'REMOTE-BOTH: either prefix is remote, a bare id is not');
  assert.strictEqual(remoteName(`nanogpt:${THINKS}`), THINKS, 'NAME-COLON: only the prefix is cut, not a colon in the id');
  assert.deepStrictEqual(Object.keys(PROVIDERS).sort(), ['featherless', 'nanogpt']);
  // The browser's parser holds the same prefixes.
  const web = await import('../web/model.js');
  for (const [p, v] of Object.entries(PROVIDERS as Record<string, { prefix: string }>))
    assert.strictEqual(web.whereRuns(`${v.prefix}x/y`).source, p, `WEB-SOURCE: the browser reads ${p} as ${p}`);
  assert.strictEqual(web.whereRuns('Qwen3.6-WNTH-35B-A3B-NN').source, 'local');
  assert.match(web.whereRuns(`nanogpt:${WRITER}`).words, /NanoGPT/, 'WEB-WORDS: the row says NanoGPT');
  assert.strictEqual(web.modelName(`nanogpt:${THINKS}`).name.includes('nanogpt'), false, 'the prefix is not in the name');
  ok('one parser for where a model runs, on the server and in the browser, and they agree');
}

// ---- 2. one key file per writer and provider ----
{
  const was = process.env.ANANSI_NANOGPT_KEY_FILE;
  delete process.env.ANANSI_NANOGPT_KEY_FILE;
  process.env.ANANSI_FEATHERLESS_KEY_DIR = KEYS;
  assert.strictEqual(llama.keyPathFor('seth', 'nanogpt'), join(KEYS, 'nanogpt-seth.key'), 'KEY-PATH: nanogpt-<login>.key');
  assert.strictEqual(llama.keyPathFor('seth'), join(KEYS, 'featherless-seth.key'), 'Featherless keeps its name');
  assert.strictEqual(llama.asPayer('seth', () => llama.remoteReady('nanogpt')), false, 'no file, not ready');
  writeFileSync(join(KEYS, 'nanogpt-seth.key'), KEY);
  assert.strictEqual(llama.asPayer('seth', () => llama.remoteReady('nanogpt')), true, 'KEY-OWN: his file, ready');
  assert.strictEqual(llama.asPayer('kia', () => llama.remoteReady('nanogpt')), false, 'KEY-NOT-HERS: another writer is not');
  assert.strictEqual(llama.asPayer('seth', () => llama.remoteReady('featherless')), false,
    'KEY-APART: a NanoGPT key makes no Featherless ready');
  process.env.ANANSI_NANOGPT_KEY_FILE = was;
  delete process.env.ANANSI_FEATHERLESS_KEY_DIR;
  ok('one key file per writer and provider, and one provider\'s key is not another\'s');
}

// ---- 3. the catalogue, searched by provider ----
{
  hits.length = 0;
  const r = await routes['GET /api/catalogue'](ctx(me, {}, 'source=nanogpt&uncensored=0'));
  assert.ok(!r.error, r.error);
  const ids = r.models.map((m: any) => m.id);
  assert.ok(ids.includes(`nanogpt:${WRITER}`), 'CAT-PREFIX: rows carry the nanogpt prefix');
  assert.ok(ids.includes(`nanogpt:${THINKS}`));
  assert.ok(!ids.includes(`nanogpt:${SMALL}`), 'CAT-FLOOR: under 16k tokens is not offered');
  assert.strictEqual(r.models.find((m: any) => m.id === `nanogpt:${THINKS}`).weaving, 'always weaves',
    'a :thinking id is guessed to always weave');
  assert.ok(hits.every((h) => h.path === '/api/subscription/v1/models?detailed=true'), 'only the catalogue was read');
  const tagged = await routes['GET /api/catalogue'](ctx(me, {}, 'source=nanogpt&uncensored=0&tag=roleplay'));
  assert.ok(tagged.models.length > 0 && !('tagIndex' in tagged), 'CAT-NOTAGS: a tag is ignored on NanoGPT, not sent to the hub');
  assert.strictEqual(hits[0]?.auth, undefined, 'CAT-NOKEY: the public catalogue is read without the key');
  assert.strictEqual(hits[0]?.agent, 'Anansi', 'it names itself');
  ok('the NanoGPT catalogue is searched on its own, with the floor, and without the key');
}

// ---- 4. a NanoGPT model is shortlisted after a probe on NanoGPT ----
const ID = `nanogpt:${WRITER}`;
{
  hits.length = 0;
  const added = await routes['POST /api/shortlist'](ctx(me, { model: ID }));
  assert.ok(!added.error, added.error);
  const row = added.models.find((m: any) => m.id === ID);
  assert.ok(row, 'ADD: it is on the shortlist');
  assert.strictEqual(row.context, 131072, 'its context is the catalogue\'s');
  assert.strictEqual(row.cost, null, 'ADD-NOCOST: NanoGPT has no plan units');
  const probe = chats().at(-1)!;
  assert.strictEqual(probe.auth, `Bearer ${KEY}`, 'PROBE-KEY: the probe carries the NanoGPT key');
  assert.strictEqual(probe.body.model, WRITER, 'NanoGPT is sent its own id');
  const nope = await routes['POST /api/shortlist'](ctx(me, { model: `nanogpt:${SMALL}` }));
  assert.ok(nope.error, 'a model under the floor is refused');
  const unknown = await routes['POST /api/shortlist'](ctx(me, { model: 'nanogpt:nobody/not-listed' }));
  assert.match(String(unknown.error), /NanoGPT/, 'ADD-UNLISTED: the refusal names NanoGPT');
  const thinks = await routes['POST /api/shortlist'](ctx(me, { model: `nanogpt:${THINKS}` }));
  assert.strictEqual(thinks.models.find((m: any) => m.id === `nanogpt:${THINKS}`).weaving, 'always weaves',
    'the probe found the plan');
  ok('a NanoGPT model is shortlisted after a probe on NanoGPT, with the NanoGPT key');
}

// ---- 5. it writes a passage, uncapped, and the row keeps its id ----
{
  const s = await routes['POST /api/story'](ctx(me, { id: story.id, story: { model: ID } }));
  assert.ok(!s.error && !s.toast, s.error ?? s.toast);
  hits.length = 0;
  const r = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.prose, 'Ok.', 'GEN: the passage came from NanoGPT');
  const call = chats().at(-1)!;
  assert.strictEqual(call.body.model, WRITER, 'NanoGPT is sent its own id');
  assert.strictEqual('max_tokens' in call.body, false, 'GEN-NOCAP: no token cap, as on Featherless');
  assert.strictEqual('dry_multiplier' in call.body, false, 'only documented fields go');
  assert.ok(!hits.some((h) => /tokenize/.test(h.path)), 'GEN-NOTOKENIZE: NanoGPT has none, so none is asked');
  const gen = db.recentGenerations(story.id, 1)[0] as any;
  assert.strictEqual(gen.model, ID, 'the generation row stores the prefixed id unchanged');
  ok('a NanoGPT model writes a passage, uncapped, without a tokenize, and the row keeps its id');
}

// ---- 6. counting a prompt on NanoGPT is an estimate that errs high ----
{
  hits.length = 0;
  const text = 'The tide came in backwards and the harbour lamps went out one by one. '.repeat(40);
  const c = await llama.count(text, ID);
  assert.strictEqual(hits.length, 0, 'COUNT-LOCAL: no call is made to count');
  assert.ok(c >= Math.ceil(text.length / 4), `COUNT-HIGH: ${c} is not below a token per four characters`);
  ok('a prompt on NanoGPT is counted here, high, with no call');
}

// ---- 7. outside the subscription is said plainly and never retried ----
{
  hits.length = 0;
  script.push('usd');
  const r = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.ok(r.error, 'USD: it fails');
  assert.strictEqual(chats().length, 1, 'USD-ONCE: a billing refusal is not retried');
  assert.match(r.error, /subscription/i, 'USD-WORDS: it says the subscription does not cover it');
  assert.doesNotMatch(r.error, /busy|in use/i, 'and does not call it busy');
  assert.ok(!leaked(r), 'the key is in nothing shown or printed');
  ok('a model outside the subscription is refused once, in plain words, never as busy');
}

// ---- 8. a rate limit is retried, then named as NanoGPT's ----
{
  hits.length = 0;
  script.push('429', '429', '429', '429');
  const r = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.ok(r.error, 'it fails after the retries');
  assert.strictEqual(chats().length, 4, 'RATE-RETRY: three retries, as on Featherless');
  assert.match(r.error, /NanoGPT/, 'RATE-NAMED: the words name NanoGPT');
  assert.doesNotMatch(r.error, /Featherless|plan/i, 'and never Featherless or its plan');
  assert.ok(!leaked(r), 'the key is in nothing shown or printed');
  script.length = 0;
  script.push('down');
  const d = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.match(String(d.error), /cannot reach NanoGPT/, 'DOWN-NAMED: unreachable names NanoGPT');
  ok('a rate limit is retried, then said as NanoGPT\'s, and so is being offline');
}

// ---- 9. the model list says where each runs; Find a model knows which keys are in ----
{
  const r = await routes['GET /api/models'](ctx(me));
  const row = r.models.find((m: any) => m.id === ID);
  assert.strictEqual(row?.provider, 'nanogpt', 'LIST-PROVIDER: a NanoGPT row says so');
  assert.strictEqual(row?.ready, true, 'it is ready with only a NanoGPT key');
  assert.strictEqual(r.models.find((m: any) => m.source === 'local')?.provider, 'local', 'a local row says local');
  assert.deepStrictEqual(r.remotes, { featherless: false, nanogpt: true }, 'LIST-REMOTES: which providers have a key');
  assert.strictEqual(r.remote, true, 'any key opens Add a model');
  const card = await routes['GET /api/catalogue/card'](ctx(me, {}, `model=${encodeURIComponent(ID)}`));
  assert.strictEqual(card.about, 'A 27B model tuned for long fiction.', 'CARD: NanoGPT\'s own description');
  const me2 = await routes['GET /api/me'](ctx(me));
  assert.strictEqual(me2.nanogpt?.ready, true, 'ME: the account says the NanoGPT key is in');
  assert.ok(!JSON.stringify(me2).includes(KEY), 'and never shows it');
  ok('every model row names its provider, and the account and Add a model know which keys are in');
}

console.log(`\n${n} checks green`);
fake.close(); localSrv.close();
rmSync(KEYS, { recursive: true, force: true });
