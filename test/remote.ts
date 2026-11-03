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
import { DatabaseSync } from 'node:sqlite';

const DB = '/tmp/anansi-remote.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;
/** The room a call was PLANNED with, from its generation row: since 2026-10-27 it is no longer sent
 *  to a remote model, so the body cannot show it. */
const plannedRoom = (sid: string, role = 'prose') => {
  const d = new DatabaseSync(DB, { readOnly: true });
  try {
    const r = d.prepare('SELECT params FROM generations WHERE story_id = ? AND role = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
      .get(sid, role) as any;
    return Number(JSON.parse(String(r?.params ?? '{}')).max_tokens);
  } finally { d.close(); }
};

// A key that is easy to find in anything it must not be in.
const KEY = 'fl-TEST-KEY-7f3a9c-do-not-echo';
const KEY_FILE = '/tmp/anansi-remote.key';
writeFileSync(KEY_FILE, KEY + '\n');
process.env.ANANSI_FEATHERLESS_KEY_FILE = KEY_FILE;
// The retry schedule, shrunk. The real one waits about twenty seconds in all, and a suite that
// waited that long on every 429 case would be a suite nobody runs.
process.env.ANANSI_FEATHERLESS_BACKOFF_MS = '10,10,10';

const REMOTE = 'llmfan46/Qwen3.6-35B-A3B-uncensored-heretic';
/** What the fake says to a plain-lines ask (the hem's, on a remote model). */
let shapedSays = '';
const SMALL = 'someone/Tiny-Ctx-heretic';
const NOT_LISTED = 'nobody/Not-In-The-Catalogue';
// Takes the whole plan. Every writer may add it since 2026-10-25; uncensored, so the default search
// shows it.
const BIG = 'mlabonne/Llama-3.3-70B-Instruct-abliterated';
// Guessed "can switch" from its class, and plans anyway when asked not to: the probe's case.
const STUBBORN = 'liar/Gemma-4-31B-UNCENSORED';
// Guessed "doesn't weave" from its class, and plans inline.
const PLANS_INLINE = 'TheDrummer/Mistral-Small-Uncensored-24B';
// Guessed "not tried yet": no family in the table. Obeys the probe, so it is stored as not weaving.
const UNTRIED = 'odd/Step-3.5-Flash-heretic';
// Its class holds Kimi-K2-Instruct, which does not weave; the name says this one always does.
const THINKING = 'moonshotai/Kimi-K2-Thinking';
// Its chat template refuses the weaving switch: Featherless answers 400 to any body that carries
// `chat_template_kwargs`, and a normal completion without it (seen live 2026-10-22, both ways).
const NO_SWITCH = 'vprilepskii/Harbinger-24B-biprojected-norm-preserving-abliterated';

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
  // A family the guess table has never met (a real class from the live catalogue), and a Thinking
  // id whose class also holds a model that does not weave.
  { id: UNTRIED, model_class: 'step-3.5-199b', context_length: 32768, concurrency_cost: 1 },
  { id: THINKING, model_class: 'kimi-k2', context_length: 32768, concurrency_cost: 1 },
  // Class, context and cost as the live catalogue gives them (read 2026-10-22).
  { id: NO_SWITCH, model_class: 'mistral-24b', context_length: 32768, concurrency_cost: 2 },
  // The floor, from both sides: exactly 16k is shown, a hair under it is not, and so is a row that
  // does not say.
  { id: 'edge/Exactly-16k-heretic', model_class: 'llama3-8b', context_length: 16384, concurrency_cost: 1 },
  { id: 'edge/Under-16k-heretic', model_class: 'llama3-8b', context_length: 16000, concurrency_cost: 1 },
  { id: 'edge/No-Context-heretic', model_class: 'llama3-8b', concurrency_cost: 1 },
];

/** What reached the fake Featherless, newest last. */
const fl: { path: string; auth: string | undefined; body: any }[] = [];
/** How the next chat calls should go, shifted one per call. Empty means "answer normally". */
const script: ('429' | 'capacity' | 'unavailable' | 'midstream' | 'cold' | 'refuse' | 'down'
  | 'overcap' | 'atcap' | 'streamcap' | 'capafter')[] = [];
/** The last long stream the fake wrote: how many content chunks went out, how many it meant to
 *  send, and whether the connection closed before it had finished. */
const long = { sent: 0, meant: 0, closedEarly: false };
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
    // AS THE REAL ONE DOES, measured 2026-10-22: Featherless answers the catalogue with a 404 to
    // Node's own `fetch` User-Agent ("node") and a 200 to anything that names itself.
    if (req.url === '/v1/models' && /^node$/i.test(String(req.headers['user-agent'] ?? '')))
      return json(404, { error: { message: 'not found' } });
    if (req.url === '/v1/models') return json(200, { data: CATALOGUE });
    if (req.url === '/v1/tokenize') return json(200, { count: 321 });
    if (req.url !== '/v1/chat/completions') return json(404, { error: { message: 'no route' } });
    // AS THE REAL ONE ANSWERS THIS MODEL, word for word (2026-10-22): the field at all, even empty
    // or under another key, is a 400. Before the script, because nothing else is looked at first.
    if (body.model === NO_SWITCH && 'chat_template_kwargs' in body)
      return json(400, { error: { message: 'The request was rejected as invalid. Please check your '
        + 'request parameters.', type: 'invalid_request_error', code: 'bad_request', param: null } });
    const how = script.shift();
    // Unreachable: the connection drops with no answer at all, which is what fetch sees when the
    // machine is offline or Featherless is down.
    if (how === 'down') return req.socket.destroy();
    if (how === '429') return json(429, { error: { message: `concurrency limit, key ${KEY}` } });
    // AT CAPACITY, AS THE REAL ONE SAYS IT (seen live 2026-10-22 on two models): a 503 whose body
    // names the model and carries the code. Any other 503 has no such code.
    if (how === 'capacity') return json(503, { error: { message: `${body.model} is temporarily at `
      + 'capacity. Please try again shortly.', type: 'server_error', code: 'capacity_exhausted' } });
    if (how === 'unavailable') return json(503, { error: { message: `service unavailable, key ${KEY}`,
      type: 'server_error' } });
    if (how === 'refuse') return json(400, { error: { message: `bad request for key ${KEY}` } });
    const answer = () => {
      // Two models plan when told not to, each the way a provider can show it: in the reasoning
      // field, and inline in the prose. The field is `reasoning`, as the real Featherless names it
      // (checked 2026-10-22); llama-server's `reasoning_content` is covered in test/stream.ts.
      // THE HEM'S ASK IN PLAIN LINES (src/shaped.ts): it says so in its system message.
      const plainAsk = String(body.messages?.[0]?.content ?? '').includes('ANSWER IN PLAIN TEXT, NOT JSON');
      const message = plainAsk ? { content: shapedSays }
        : body.model === STUBBORN
        ? { content: 'ok', reasoning: 'The user wants a short answer.' }
        : body.model === PLANS_INLINE ? { content: '<think>A short answer, then.</think>ok' }
        : { content: 'The remote wrote this.' };
      // #64 · PAST THE CAP WITH NO STREAM, as one did (1,213 of 900, F62). The same words as the
      // streamed overrun, in one answer, with the usage that says how far over it went. A call asking
      // for JSON gets JSON that PARSES, so a check that only reads the parse cannot see the overrun.
      // WEAVING, PAST THE CAP: the plan counts against it, as it does on the server (F5), and comes
      // back in `reasoning`, beside the prose. Half the cap is plan, the whole cap is prose.
      // Since 2026-10-27 nothing remote carries a cap, so the sizes are fixed: OVER is past the
      // passage guard the tests set (3 x 100 words), AT is exactly on it.
      if (!body.stream && how === 'overcapplan') {
        const cap = 1000;
        const words = Array.from({ length: cap }, (_, k) => (k % 7 === 6 ? 'end.' : 'word')).join(' ');
        return json(200, { choices: [{ message: { content: words, reasoning: Array(cap / 2).fill('plan').join(' ') },
          finish_reason: 'length' }], usage: { prompt_tokens: 321, completion_tokens: cap * 1.5 } });
      }
      if (!body.stream && (how === 'overcap' || how === 'atcap')) {
        const n = how === 'overcap' ? 1000 : 300;
        const words = Array.from({ length: n }, (_, k) => (k % 7 === 6 ? 'end.' : 'word')).join(' ');
        return json(200, { choices: [{ message: { content: body.response_format
          ? JSON.stringify({ note: words }) : words }, finish_reason: how === 'overcap' ? 'length' : 'stop' }],
          usage: { prompt_tokens: 321, completion_tokens: n } });
      }
      // ✦'s own one-field schema gets three ideas, so a test can tell an answer that came back whole.
      if (!body.stream && body.response_format?.json_schema?.schema?.properties?.ideas)
        return json(200, { choices: [{ message: { content: JSON.stringify({ ideas: { speak: '"One."', act: 'Two.', direct: 'Three.', narrate: 'Four.' } }) },
          finish_reason: 'stop' }], usage: { prompt_tokens: 321, completion_tokens: 12 } });
      if (!body.stream) return json(200, { choices: [{ message, finish_reason: 'stop' }],
        usage: { prompt_tokens: 321, completion_tokens: 5 } });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const f = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      // AT CAPACITY INSIDE THE STREAM, AS THE REAL ONE SAID IT (Kia, 2026-10-22 20:23 and 20:24): a
      // 200, the stream opened, then an `error` object carrying only the message. `streamcap` says it
      // before any content, `capafter` after the first words of the passage.
      if (how === 'streamcap' || how === 'capafter') {
        if (how === 'capafter') f({ choices: [{ delta: { content: 'The remote ' } }] });
        f({ error: { message: `${body.model} is temporarily at capacity. Please try again shortly.` } });
        return res.end();
      }
      // PAST THE CAP, AS THE REAL ONE DID (2026-10-22): Anubis-70B sent 900 as max_tokens and got
      // 1,423 tokens back, then `finish_reason: "length"`. One word per chunk, a sentence every
      // seventh, written a few at a time so a reader that stops early can be told from one that
      // read it all. `atcap` stops on its own at exactly the cap, the case that must be left alone.
      if (how === 'overcap' || how === 'atcap') {
        Object.assign(long, { sent: 0, meant: how === 'overcap' ? 1000 : 300, closedEarly: false });
        let done = false;
        res.on('close', () => { if (!done) long.closedEarly = true; });
        const next = () => {
          if (res.destroyed) return;
          for (let k = 0; k < 25 && long.sent < long.meant; k++, long.sent++)
            f({ choices: [{ delta: { content: long.sent % 7 === 6 ? 'end. ' : 'word ' } }] });
          if (long.sent < long.meant) return void setTimeout(next, 1);
          f({ choices: [{ delta: {}, finish_reason: how === 'overcap' ? 'length' : 'stop' }] });
          f({ choices: [], usage: { prompt_tokens: 321, completion_tokens: long.sent } });
          res.write('data: [DONE]\n\n');
          done = true;
          res.end();
        };
        return next();
      }
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

/* A FAKE HUGGING FACE, for the tags, the base model and the model card. Real Hugging Face is never
 * called: its cards change under the assertions. Each case is a card shape seen in the wild. */
const HEAVY_CARD = `---
license: apache-2.0
base_model: Qwen/Qwen3.6-35B-A3B
tags:
- heretic
---
<style>
.banner { color: gold; font-size: 2em; }

.banner img { width: 100%; }
</style>
<!-- a comment the author left
for themselves -->
<div align="center" style="background: linear-gradient(#000, #333); padding: 12px;">
<img src="https://example.com/banner.png" alt="banner">

<h1 style="color:gold">QWEN HERETIC</h1>
</div>

# Qwen3.6 35B Heretic

[![License](https://img.shields.io/badge/license-apache-blue)](https://example.com/license) [![Discord](https://img.shields.io/badge/discord-join-7289da)](https://discord.gg/x)

> [!NOTE]
> Quantized versions are linked below.

| Quant | Size |
|---|---|
| Q4 | 20 GB |

This is an **abliterated** finetune of [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) for long-form fiction &amp; <b>roleplay</b>. It keeps the base model's prose and drops its refusals.

A second paragraph that must not appear.
`;
/** Every block is banner, heading, list or code: there is no paragraph to show. The style block at
 *  the end is never closed, so only the check that markup survived can keep its CSS off the row. */
const NO_PARAGRAPH_CARD = `<div align="center"><img src="https://example.com/x.png"></div>

<p align="center"><a href="https://ko-fi.com/x"><img src="https://example.com/kofi.png"></a></p>

## Gemma 4 31B Uncensored

- roleplay
- creative writing

\`\`\`python
print("this is code and not a description of anything at all here")
\`\`\`

<div style="display: flex; gap: 8px;">
<span style="color: red; font-weight: bold;">NEW</span>
</div>

<style>
body { background: #000; color: #fff; font-family: serif; margin: 0 auto; }
`;
const HUB_MODELS: Record<string, any> = {
  [REMOTE]: { id: REMOTE, tags: ['transformers', 'safetensors', 'qwen3_5_moe', 'text-generation',
    'heretic', 'license:apache-2.0', 'base_model:Qwen/Qwen3.6-35B-A3B', 'region:us', 'en'],
    cardData: { tags: ['heretic', 'uncensored', 'roleplay', 'creative-writing'],
      base_model: 'Qwen/Qwen3.6-35B-A3B' } },
  // No author tags: the hub's own tags are shown, with the machine ones dropped.
  [STUBBORN]: { id: STUBBORN, tags: ['gemma4', 'text-generation', 'abliterated', 'roleplay',
    'conversational', 'endpoints_compatible', 'region:us', 'license:gemma'],
    cardData: { base_model: ['google/gemma-4-31b-it'] } },
};
const CARDS: Record<string, string> = { [REMOTE]: HEAVY_CARD, [STUBBORN]: NO_PARAGRAPH_CARD };
/** What reached the fake hub, newest last, with any Authorization it carried. */
const hubHits: { path: string; auth: string | undefined }[] = [];
const hubSrv = createServer((req, res) => {
  const path = decodeURIComponent(req.url ?? '');
  hubHits.push({ path, auth: req.headers.authorization });
  const api = /^\/api\/models\/(.+)$/.exec(path)?.[1];
  const card = /^\/(.+)\/raw\/main\/README\.md$/.exec(path)?.[1];
  // A renamed repo answers with a redirect to its new name on the same host — and one that tries
  // to send the server somewhere else is the case the fixed host exists for.
  if (api === 'huihui/gpt-oss-20b-abliterated') {
    res.writeHead(307, { Location: `/api/models/${PLANS_INLINE}` }); return res.end(); }
  if (api === 'edge/Exactly-16k-heretic') {
    res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' }); return res.end(); }
  if (api && HUB_MODELS[api]) {
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(HUB_MODELS[api])); }
  if (api === PLANS_INLINE) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ id: PLANS_INLINE, tags: ['mistral', 'adventure'] })); }
  if (card && CARDS[card]) { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(CARDS[card]); }
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"Repository not found"}');
});
await new Promise<void>((r) => hubSrv.listen(0, '127.0.0.1', r));
process.env.ANANSI_HF_URL = `http://127.0.0.1:${(hubSrv.address() as any).port}`;

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
  assert.ok(!('repetition_penalty' in body),
    'NO-PENALTY: no repetition penalty is sent while REMOTE_REPETITION_PENALTY is off (#62)');
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
  // NOT THE LOCAL SHARE (Seth, 2026-10-29): each writer has their own Featherless plan, so a smaller
  // local slot does not shrink a remote passage.
  const small = await routes['POST /api/generate'](at(16000));
  assert.strictEqual(small.manifest.totals.budget, local32,
    'REMOTE-OWN: and still against the model\'s own 32,768 when the local share is smaller');
  void local16;
  const preview = await routes['POST /api/manifest'](at(50048));
  assert.strictEqual(preview.manifest.totals.budget, local32,
    'the Context panel previews the same budget the generation uses');
  assert.strictEqual(preview.exact, 321, 'and counts with Featherless too');
  ok('a remote call counts with Featherless and is budgeted against the model\'s own context');
}

/** Every chat that went anywhere since `mark`: Featherless's, and the local router's. */
const since = (mark: { fl: number; local: number }) => ({
  fl: fl.slice(mark.fl).filter((r) => r.path === '/v1/chat/completions'),
  local: local.slice(mark.local).filter((r) => r.path === '/v1/chat/completions'),
});
const mark = () => ({ fl: fl.length, local: local.length });

// ---- 3b. the library's hero asks for a scene's threads without a count (2026-11-02) ----
// The hero draws the threads sent in the last-worked scene, as the bar under a tale's header does.
// It asks on every library load, so it must not spend a Featherless call on a count it never shows:
// Featherless refuses a second call at once. The control call proves this check can see the count.
{
  const book = db.createStory(me, { title: 'Lamp Book' });
  const keeper = db.upsertEntry(book.id, me, { title: 'Lampkeeper', body: 'Keeps the lamp.', entryType: 'character' });
  db.addPassage({ ...book, storyId: book.id, body: 'The Lampkeeper climbed the stair.' });
  const chapterId = (db.chapters(book.id)[0] as any).id;
  const tokenized = (from: number) => fl.slice(from).filter((x) => x.path === '/v1/tokenize').length;
  let from = fl.length;
  await routes['POST /api/manifest'](ctx(me, { storyId: book.id, chapterId }));
  assert.strictEqual(tokenized(from), 1, 'CONTROL: a plain manifest asks Featherless to count');
  from = fl.length;
  const r: any = await routes['POST /api/manifest'](ctx(me, { storyId: book.id, chapterId, count: false }));
  assert.strictEqual(tokenized(from), 0, 'count:false asks nobody to count');
  assert.strictEqual(r.exact, null, 'and says it has no count');
  assert.ok(r.manifest.blocks.some((b: any) => b.id === keeper && b.state === 'included'
    && (b.kind === 'CANON-ALWAYS' || b.kind === 'CANON-TRIGGERED')), 'the named thread is sent in that scene');
  assert.strictEqual(r.kinds?.[keeper], 'character', 'and its kind rides with the manifest');
  ok('the hero can ask for a scene\'s threads and their kinds without a Featherless count');
}

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

// ---- 4b. Stop during the 429 back-off ends the call at once, not when the wait runs out ----
//
// The schedule above is shrunk to 10 ms, so a wait that ignored Stop would still look prompt. A
// second copy of the adapter is loaded with a real-sized wait: the back-off is read once, when the
// module is first imported, and a query string makes a separate module.
{
  const was = process.env.ANANSI_FEATHERLESS_BACKOFF_MS;
  process.env.ANANSI_FEATHERLESS_BACKOFF_MS = '5000,5000,5000';
  const slow = await import('../src/llama.ts?slow-backoff');
  process.env.ANANSI_FEATHERLESS_BACKOFF_MS = was;
  const m = mark();
  script.push('429', '429', '429', '429');
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 150);
  const t0 = Date.now();
  const e: any = await slow.chat('s', 'b', { model: ID }, () => {}, stop.signal).then(() => null, (x) => x);
  const took = Date.now() - t0;
  script.length = 0;
  assert.ok(e, 'the call does not succeed');
  assert.ok(took < 2000, `STOP-BACKOFF: Stop ends the back-off at once (took ${took} ms of a 5,000 ms wait)`);
  assert.strictEqual(e.name, 'AbortError', 'STOP-BACKOFF: it ends as a stop, which is all a caller checks');
  assert.strictEqual(since(m).fl.length, 1, 'and no retry is sent after Stop');
  ok('Stop during the 429 back-off ends the call at once, with no retry after it');

  // The ceiling firing in the same wait is not the writer pressing Stop, and must not read as one.
  script.push('429', '429', '429', '429');
  const t1 = Date.now();
  const late: any = await slow.chat('s', 'b', { model: ID }, () => {}, undefined, 150).then(() => null, (x) => x);
  script.length = 0;
  assert.ok(Date.now() - t1 < 2000, 'TIMEOUT-BACKOFF: the ceiling ends the back-off at once');
  assert.notStrictEqual(late?.name, 'AbortError', 'TIMEOUT-BACKOFF: a ceiling is not reported as a stop');
  assert.match(String(late?.message), /did not answer in time/, 'TIMEOUT-BACKOFF: it says Featherless ran out of time');
  ok('the ceiling firing during the back-off says Featherless did not answer in time');
}

// ---- 4c. at capacity is retried like a 429, then reported as busy; it never falls back ----
{
  let m = mark();
  script.push('capacity', 'capacity', 'capacity');
  const r = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.ok(!r.error, `CAPACITY-RETRY: three at-capacity answers, then the passage (${r.error})`);
  assert.strictEqual(since(m).fl.length, 4, 'CAPACITY-RETRY: retried on the 429 schedule');

  m = mark();
  script.push('capacity', 'capacity', 'capacity', 'capacity');
  const busy = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.strictEqual(busy.error, 'Featherless is busy, try again', 'CAPACITY-BUSY: reported as busy, plainly');
  const tried = since(m);
  assert.strictEqual(tried.fl.length, 4, 'one call and three retries, no more');
  assert.ok(tried.fl.every((x) => x.body.model === REMOTE), 'every attempt was the chosen model');
  assert.strictEqual(tried.local.length, 0, 'NO FALLBACK: nothing went to the local router instead');

  m = mark();
  script.push('unavailable');
  const other = await routes['POST /api/generate'](ctx(me, { storyId: story.id, mode: 'continue' }));
  assert.match(String(other.error), /^Featherless answered 503: service unavailable/,
    'OTHER-503: a 503 that is not at capacity keeps its own message');
  assert.ok(String(other.error).includes('[key]'), 'with the key cut out of it');
  assert.strictEqual(since(m).fl.length, 1, 'OTHER-503: and is not retried');
  assert.strictEqual(since(m).local.length, 0, 'and nothing fell back to the local router');

  // Stop during the at-capacity wait, on the real-sized schedule (see 4b for why a second copy).
  const was = process.env.ANANSI_FEATHERLESS_BACKOFF_MS;
  process.env.ANANSI_FEATHERLESS_BACKOFF_MS = '5000,5000,5000';
  const slow = await import('../src/llama.ts?slow-capacity');
  process.env.ANANSI_FEATHERLESS_BACKOFF_MS = was;
  m = mark();
  script.push('capacity', 'capacity', 'capacity', 'capacity');
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 150);
  const t0 = Date.now();
  const e: any = await slow.chat('s', 'b', { model: ID }, () => {}, stop.signal).then(() => null, (x) => x);
  const took = Date.now() - t0;
  script.length = 0;
  assert.ok(took < 2000, `STOP-CAPACITY: Stop ends the at-capacity wait at once (took ${took} ms)`);
  assert.strictEqual(e?.name, 'AbortError', 'STOP-CAPACITY: it ends as a stop');
  assert.strictEqual(since(m).fl.length, 1, 'and no retry is sent after Stop');
  ok('at capacity is retried like a 429, reported as busy, stoppable, and never falls back');
}

// ---- 4d. at capacity INSIDE the stream, before any content, is retried like the 503 (#64) ----
{
  let m = mark();
  script.push('streamcap', 'streamcap', 'streamcap');
  const r = await streamed({ storyId: story.id, mode: 'continue' });
  assert.ok(!r.last.error, `STREAMCAP-RETRY: three in-stream capacity errors, then the passage (${r.last.error})`);
  assert.strictEqual(since(m).fl.length, 4, 'STREAMCAP-RETRY: retried on the 429 schedule');
  assert.deepStrictEqual(r.deltas, ['The remote ', 'streamed this.'], 'and the passage arrives once, whole');

  m = mark();
  script.push('streamcap', 'streamcap', 'streamcap', 'streamcap');
  const busy = await streamed({ storyId: story.id, mode: 'continue' });
  assert.strictEqual(busy.last.error, 'Featherless is busy, try again', 'STREAMCAP-BUSY: reported as busy, plainly');
  assert.strictEqual(since(m).fl.length, 4, 'one call and three retries, no more');
  assert.strictEqual(since(m).local.length, 0, 'NO FALLBACK: nothing went to the local router instead');

  // ONE SCHEDULE, whichever way Featherless says it: a 503 and an in-stream error share the tries.
  m = mark();
  script.push('capacity', 'streamcap', 'capacity', 'streamcap');
  const mixed = await streamed({ storyId: story.id, mode: 'continue' });
  assert.strictEqual(mixed.last.error, 'Featherless is busy, try again',
    'SHARED-SCHEDULE: two 503s and two in-stream errors are four tries, then busy');
  assert.strictEqual(since(m).fl.length, 4, 'SHARED-SCHEDULE: and no fifth call');

  // After content it is a failure, as any mid-stream failure is: no silent restart of a half passage.
  m = mark();
  const before = db.passagesOfChapter((db.chapters(story.id)[0] as any).id).length;
  script.push('capafter');
  const late = await streamed({ storyId: story.id, mode: 'continue' });
  assert.match(String(late.last.error), /^Featherless stopped mid-passage: .*at capacity/,
    'CAPAFTER-FAILS: capacity after the first words fails the passage, as today');
  assert.strictEqual(since(m).fl.length, 1, 'CAPAFTER-FAILS: and is not retried');
  assert.strictEqual(db.passagesOfChapter((db.chapters(story.id)[0] as any).id).length, before,
    'and no half-written passage lands in the book');

  // Stop during the wait after an in-stream capacity error, on the real-sized schedule (see 4b).
  const was = process.env.ANANSI_FEATHERLESS_BACKOFF_MS;
  process.env.ANANSI_FEATHERLESS_BACKOFF_MS = '5000,5000,5000';
  const slow = await import('../src/llama.ts?slow-streamcap');
  process.env.ANANSI_FEATHERLESS_BACKOFF_MS = was;
  m = mark();
  script.push('streamcap', 'streamcap', 'streamcap', 'streamcap');
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 150);
  const t0 = Date.now();
  const e: any = await slow.chat('s', 'b', { model: ID }, () => {}, stop.signal).then(() => null, (x) => x);
  const took = Date.now() - t0;
  script.length = 0;
  assert.ok(took < 2000, `STOP-STREAMCAP: Stop ends the wait at once (took ${took} ms)`);
  assert.strictEqual(e?.name, 'AbortError', 'STOP-STREAMCAP: it ends as a stop');
  assert.strictEqual(since(m).fl.length, 1, 'and no retry is sent after Stop');
  ok('at capacity inside the stream is retried before content, fails after it, and Stop ends it at once');
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

// ---- 5b. a passage LANDS at the slider: stopped there, and the model writes its own ending (2026-11-02) ----
// Seth: "is there no other way to do it so that it knows that only the response needs to be that
// long", and then "build option 2". A model cannot count words as it writes (F65: both wordings ran
// over), so the app counts: at the slider the stream is stopped, and one short call asks the model to
// finish the moment in a sentence or two. The passage ends near the slider and reads as finished,
// not cut. INSIDE THE SLIDER, NOT PAST IT (Seth, 2026-11-02: "i hate that the ai is still going over"):
// at 80% of it the passage finishes the sentence it is in, leaving at least 15 words, and the ending
// gets the words that are left. The slider is 100 here: landing starts at 80 and must stop by 85; the
// fake ends a sentence every seventh word, so the passage lands at word 84 ("end.") and the ending may
// use 16. With the slider off, the runaway guard (4,000 words) stands.
const guarded = (body: any, words = 100) => { const c: any = ctx(me, body); c.gen = { ...c.gen, target_words: words }; return c; };
const chatsSince = (m: { fl: number }) => fl.slice(m.fl).filter((r) => r.path === '/v1/chat/completions');
{
  let m = mark();
  script.push('overcap');
  const out: any[] = [];
  const h = await routes['POST /api/generate'](guarded({ storyId: story.id, mode: 'continue', stream: true }));
  const last = await h.__stream((o: unknown) => out.push(o));
  assert.ok(!last.error, last.error);
  const calls = chatsSince(m);
  assert.strictEqual(calls.length, 2, 'LAND: stopped at the slider, and one more call asked for its ending');
  assert.ok(!('max_tokens' in calls[0].body), 'UNCAPPED: the passage itself carries no cap to Featherless');
  for (let i = 0; i < 100 && !long.closedEarly; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(long.closedEarly, 'LAND-ABORT: the passage request was closed before Featherless finished');
  const ask = calls[1].body;
  assert.strictEqual(ask.messages.at(-2)?.role, 'assistant', 'LAND-ASK: the passage so far is the model\'s own turn');
  assert.strictEqual(ask.messages.at(-2).content.split(/\s+/).length, 84, '  and it stopped inside the slider, at the sentence after 80');
  assert.ok(/end\.$/.test(ask.messages.at(-2).content), '  ending on the sentence\'s own stop');
  assert.match(ask.messages.at(-1)?.content ?? '', /Finish the moment you are in, in no more than 16 words/, '  then the ask, with the words that are left');
  assert.match(ask.messages.at(-1)?.content ?? '', /Do not repeat or rephrase anything already written/, '  which forbids an echo');
  assert.ok(ask.max_tokens > 0 && ask.max_tokens <= 160, `LAND-CAP: the ending carries a small cap (${ask.max_tokens})`);
  assert.strictEqual(ask.chat_template_kwargs?.enable_thinking, false, '  and no plan');
  assert.ok(!('land_words' in ask) && !('cap_words' in ask) && !('land_slack' in calls[0].body), 'LAND-PRIVATE: the app\'s own counts are never sent');
  assert.ok(/end\. The remote streamed this\.$/.test(last.prose), `LAND-JOIN: the ending follows the passage (${last.prose.slice(-40)})`);
  assert.strictEqual(last.prose.split(/\s+/).length, 88, 'LAND-LENGTH: 84 and the ending\'s 4');
  assert.ok(last.prose.split(/\s+/).length <= 100, 'LAND-INSIDE: the whole passage is inside the slider');
  assert.strictEqual(out.map((o) => o.d).filter(Boolean).join('').trim(), last.prose,
    'LAND-STREAM: the page saw every word of it arrive, the ending too');
  assert.strictEqual(last.cut, false, 'LAND-NOTCUT: a landed passage is not flagged as cut');
  assert.ok(last.passageId, 'and it lands in the book');

  // Well under the slider (300 words at 400; landing would start at 320): whole, untouched, one call.
  m = mark();
  script.push('atcap');
  const at: any[] = [];
  const h2 = await routes['POST /api/generate'](guarded({ storyId: story.id, mode: 'continue', stream: true }, 400));
  const l2 = await h2.__stream((o: unknown) => at.push(o));
  assert.strictEqual(at.map((o) => o.d).filter(Boolean).length, 300, 'UNDER: every word of a passage on the slider arrived');
  assert.strictEqual(chatsSince(m).length, 1, 'UNDER: and no ending was asked for');
  assert.strictEqual(l2.cut, false, 'UNDER: and it is not recorded as cut');

  // THE ENDING RUNS AWAY TOO: held to the words that were left (16), trimmed to its last sentence, so
  // the whole passage still ends inside the slider.
  script.push('overcap', 'overcap');
  const wild: any[] = [];
  const hw = await routes['POST /api/generate'](guarded({ storyId: story.id, mode: 'continue', stream: true }));
  const lw = await hw.__stream((o: unknown) => wild.push(o));
  const ww = lw.prose.split(/\s+/).length;
  assert.ok(ww <= 100, `LAND-ENDING-HELD: a runaway ending is held to the words left (${ww} of 100)`);
  assert.ok(/end\.$/.test(lw.prose), '  and ends on a sentence');
  assert.strictEqual(lw.cut, false, '  and the passage is not flagged as cut');
  assert.strictEqual(wild.map((o) => o.d).filter(Boolean).join('').trim(), lw.prose,
    'LAND-ENDING-PAGE: the page never showed ending words the passage then lost');

  // THE ENDING FAILS: the passage is kept, trimmed to its last sentence and flagged, as a cut one was.
  script.push('overcap', 'refuse');
  const failed: any[] = [];
  const h3 = await routes['POST /api/generate'](guarded({ storyId: story.id, mode: 'continue', stream: true }));
  const l3 = await h3.__stream((o: unknown) => failed.push(o));
  assert.ok(!l3.error, `LAND-FAIL: a failed ending does not fail the passage (${l3.error})`);
  assert.ok(/end\.$/.test(l3.prose), '  it is trimmed back to the last whole sentence');
  assert.strictEqual(l3.cut, true, '  and flagged as cut');

  // With the slider off the runaway guard is 4,000 words, so the same 1,000-word run is whole.
  m = mark();
  script.push('overcap');
  const free = await streamed({ storyId: story.id, mode: 'continue' });
  assert.strictEqual(free.deltas.length, 1000, 'GUARD-OFF: with the slider off, 1,000 words all arrive');
  assert.strictEqual(chatsSince(m).length, 1, '  with no ending asked for');

  const plain = await streamed({ storyId: story.id, mode: 'continue' });
  assert.strictEqual(plain.last.prose, 'The remote streamed this.', 'a short take is whole');
  ok('a passage lands inside the slider: stopped near it, its ending written by the model in the words left; under it, or with it off, untouched');
}

// ---- 5c. the same landing on a passage that arrives whole, and JSON is never capped ----
{
  let m = mark();
  script.push('overcap');
  const r = await routes['POST /api/generate'](guarded({ storyId: story.id, mode: 'continue' }));
  assert.ok(!r.error, r.error);
  assert.ok(!('max_tokens' in chatsSince(m)[0].body), 'UNCAPPED: no token cap is sent');
  assert.strictEqual(chatsSince(m).length, 2, 'WAITED-LAND: one more call asked for the ending');
  assert.ok(/end\. The remote wrote this\.$/.test(r.prose), `WAITED-JOIN: the ending follows the sentence after 80 (${r.prose.slice(-40)})`);
  assert.strictEqual(r.prose.split(/\s+/).length, 88, 'WAITED-LENGTH: 84 and the ending');
  assert.strictEqual(r.cut, false, 'WAITED-NOTCUT: not flagged as cut');

  // THE PLAN DOES NOT COUNT: the slider is on the prose a writer reads.
  script.push('overcapplan');
  const pl = await routes['POST /api/generate'](guarded({ storyId: story.id, mode: 'continue' }));
  assert.strictEqual(pl.prose.split(/\s+/).length, 88, `WAITED-PLAN: the slider counts prose only (${pl.prose.split(/\s+/).length})`);

  m = mark();
  script.push('atcap');
  const at = await routes['POST /api/generate'](guarded({ storyId: story.id, mode: 'continue' }, 300));
  assert.strictEqual(at.prose.split(/\s+/).length, 300, 'WAITED-UNDER: an answer that came whole and fits the slider is whole');
  assert.strictEqual(at.cut, false, 'WAITED-UNDER: and not cut');
  assert.strictEqual(chatsSince(m).length, 1, 'WAITED-UNDER: and no ending was asked for');

  // JSON CARRIES A CAP ON FEATHERLESS, TWICE THE ONE IT ASKS FOR (2026-10-29). A hem's "where the tale
  // stands" ran on to Featherless's own 4,096 tokens twice, about six and a half minutes, and was
  // still cut. Twice the local cap leaves a real answer room and cuts a runaway early; the cut is
  // asked again, as before.
  const { structuredRetry } = await import('../src/llama.ts');
  const NOTE = { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] };
  m = mark();
  script.push('overcap', 'atcap');
  const s1 = await structuredRetry('s', 'b', NOTE, { model: ID, max_tokens: 50 });
  const tried = since(m).fl;
  assert.deepStrictEqual(tried.map((t: any) => t.body.max_tokens), [100, 100],
    'STRUCT-CAPPED: a structured call to Featherless carries twice its cap, and the retry the same, cooler');
  assert.strictEqual(tried.length, 2, 'STRUCT-CUT: an answer Featherless itself cut is asked again');
  assert.strictEqual(s1.data?.note?.split(' ').length, 300, 'and the whole one is used');

  // Local calls are untouched: the router keeps its own cap.
  m = mark();
  const LOCAL = 'Qwen3.6-WNTH-35B-A3B-NN';
  const loc = await structuredRetry('s', 'b', NOTE, { model: LOCAL, max_tokens: 5 });
  assert.ok(loc.data, 'LOCAL-UNCHANGED: a local structured answer is still taken');
  assert.strictEqual(since(m).local.length, 1, 'LOCAL-UNCHANGED: and not asked again');
  assert.strictEqual(since(m).local.at(-1).body.max_tokens, 5, 'LOCAL-CAPPED: and a local call keeps its cap');
  ok('a passage that arrives whole lands the same way; JSON is capped at twice its local cap; local keeps its cap');
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

// ---- 10. background work follows the writer's model (ADR 0002) ----
{
  assert.strictEqual(db.defaultModelOf(me), ID, 'the writer is on the remote model');
  const chapterId = (db.chapters(story.id)[0] as any).id;
  // A card the narration names, so memory, the one-card scan and retiring each have work to do and
  // none of them returns before its call. Without it this block could pass on calls never made.
  const keeper = db.upsertEntry(story.id, me, { title: 'Keeper', body: 'The keeper of the lamp.',
    entryType: 'character' });
  db.addPassage({ ...story, storyId: story.id, body: 'The keeper climbed the stair and lit the lamp.' });
  const passes: [string, string, any][] = [
    ['chapter summary', 'POST /api/summarize', { storyId: story.id, chapterId, replace: true }],
    ['memory', 'POST /api/remember', { storyId: story.id, chapterId }],
    ['extraction', 'POST /api/extract', { storyId: story.id, chapterId }],
    ['the one-card scan', 'POST /api/scanstory', { storyId: story.id, entryId: keeper }],
    ['retiring', 'POST /api/finished', { storyId: story.id, chapterId }],
    ['the book spark', 'POST /api/spark', { idea: 'A lighthouse that keeps itself.' }],
  ];
  // A warm (max_tokens 1) that an earlier section's GET /api/story sent detached can land inside
  // a window here. It writes nothing, so it is not counted as a pass going local.
  const work = (xs: any[]) => xs.filter((x) => x.body.max_tokens !== 1);
  for (const [name, route, body] of passes) {
    const m = mark();
    await routes[route](ctx(me, body));
    const went = { fl: since(m).fl, local: work(since(m).local) };
    assert.ok(went.fl.length >= 1, `BACKGROUND-REMOTE: ${name} reaches Featherless (${went.fl.length} calls)`);
    assert.ok(went.fl.every((x) => x.body.model === REMOTE), `BACKGROUND-REMOTE: ${name} under the writer's model`);
    assert.strictEqual(went.local.length, 0, `BACKGROUND-REMOTE: ${name} does not touch the local router`);
  }

  // A MODEL THAT ALWAYS WEAVES keeps its writer's background work local: a 280-token summary is
  // room for a plan and nothing else.
  const weaver = db.owner('always-weaver');
  const ALWAYS = `featherless:${STUBBORN}`;
  db.addToShortlist(weaver, ALWAYS, 32768, 'always weaves', 2);
  db.setDefaultModel(weaver, ALWAYS);
  const wbook = db.createStory(weaver, { title: 'Plans First' });
  db.addPassage({ ...wbook, storyId: wbook.id, body: 'A plan, then the prose.' });
  const w = mark();
  await routes['POST /api/summarize'](ctx(weaver, { storyId: wbook.id,
    chapterId: (db.chapters(wbook.id)[0] as any).id }));
  assert.strictEqual(since(w).fl.length, 0, 'ALWAYS-WEAVES-LOCAL: its summary stays off Featherless');
  assert.strictEqual(work(since(w).local).length, 1, 'ALWAYS-WEAVES-LOCAL: and goes to the local router');

  // EVERY MODEL CALL IN routes.ts NAMES ITS MODEL. A background call added later with no model would
  // quietly go local; this is the line that notices.
  const routesSrc = (await import('node:fs')).readFileSync(new URL('../src/routes.ts', import.meta.url), 'utf8');
  // `structured` too since ✦ (#71), the one route that calls it without the retry.
  const calls = [...routesSrc.matchAll(/await (?:chat|structuredRetry|structured)\(([A-Z_]+)[\s\S]*?\);/g)];
  const unnamed = calls.filter((x) => !/\bmodel:/.test(x[0])).map((x) => x[1]).sort();
  assert.deepStrictEqual(unnamed, [], 'NAMED: every call passes its model');
  assert.ok(calls.length >= 20, `NAMED: and the scan saw the calls (${calls.length})`);

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

  // ✦ (#71) is the writer's own ask too, so it follows the writer's model the same way, and the
  // remote call carries the weaving switch off.
  const i = mark();
  await routes['POST /api/idea'](ctx(me, { storyId: story.id }));
  const ideaed = since(i).fl;
  assert.ok(ideaed.length === 1 && ideaed[0].body.model === REMOTE,
    `IDEA-REMOTE: ✦ goes to the remote model the writer chose, once (${ideaed.length} calls)`);
  assert.strictEqual(since(i).local.length, 0, 'IDEA-REMOTE: and not to the local router');
  assert.strictEqual(ideaed[0].body.response_format?.json_schema?.strict, true, 'IDEA-REMOTE: with its schema, strict');

  // A REMOTE ✦ CUT AT ITS LENGTH IS ASKED ONCE MORE. On the live library 10 of 21 remote `idea`
  // rows failed, most of them cut (2026-10-29). A remote call carries no cap, so the retry asks for
  // no more room than the first; it is the cooler second try `structuredRetry` gives every caller.
  const cutOnce = mark();
  script.push('overcap');
  const again: any = await routes['POST /api/idea'](ctx(me, { storyId: story.id }));
  const tries = since(cutOnce).fl;
  assert.strictEqual(tries.length, 2, `IDEA-REMOTE-RETRY: a cut remote answer is asked again, once (${tries.length} calls)`);
  assert.ok(!again.error, `IDEA-REMOTE-RETRY: and the second answer is used (${again.error})`);
  assert.deepStrictEqual(again.ideas.map((x: any) => x.text), ['"One."', 'Two.', 'Three.', 'Four.'], 'IDEA-REMOTE-RETRY: the four ideas come back');
  assert.ok(Number(tries[1].body.temperature) < Number(tries[0].body.temperature),
    'IDEA-REMOTE-RETRY: the second try is cooler than the first');
  assert.deepStrictEqual(tries.map((t: any) => t.body.max_tokens), [1200, 1200],
    'IDEA-REMOTE-RETRY: capped at twice the local 600, the retry the same, like every remote JSON answer');

  // The one door. Every writer-facing call resolves its model through `writerModel`, which is the
  // only place the shortlist is asked; a second `modelFor(` would be a call that can skip it.
  const src = (await import('node:fs')).readFileSync(new URL('../src/routes.ts', import.meta.url), 'utf8');
  assert.strictEqual(src.match(/\bmodelFor\(/g)?.length, 1, 'routes.ts calls modelFor in one place');
  ok('background work follows the writer, and calls resolve through one helper');
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
  const find = async (query = '') => {
    const c = ctx(me, {}, query);
    const r = await routes['GET /api/catalogue'](c);
    assert.ok(!r.error, r.error);
    return r;
  };
  const ids = (r: any) => r.models.map((m: any) => m.id.replace('featherless:', ''));

  const all = await find();
  // NO UNIT GATE. Seth, 2026-10-25: every writer may use a model that takes the whole plan.
  assert.ok(ids(all).includes(BIG), 'UNITS: a writer who is not the admin is shown a 4-unit model');
  assert.ok(ids(await find('q=llama&uncensored=0')).includes(BIG), 'and finds it by name');
  assert.ok(all.models.every((m: any) => m.id.startsWith('featherless:')),
    'every row carries the prefixed id the shortlist takes');
  assert.deepStrictEqual(ids(all), [
    PLANS_INLINE, 'edge/Exactly-16k-heretic', BIG, NO_SWITCH,
    STUBBORN, REMOTE, 'huihui/gpt-oss-20b-abliterated', UNTRIED],
    'uncensored only and under 16k gone, the ones that never weave first and the untried last');
  const row = all.models.find((m: any) => m.id === ID);
  assert.deepStrictEqual([row.cost, row.context, row.weaving], [2, 32768, 'can switch'],
    'a row says its unit cost, its context and its weaving guess');
  assert.strictEqual(all.models.find((m: any) => m.id.includes('gpt-oss')).weaving, 'always weaves');
  assert.strictEqual(all.models[0].weaving, "doesn't weave");
  assert.strictEqual(all.models.at(-1).weaving, 'not tried yet', 'an unknown family is a guess that says so');

  const stock = await find('uncensored=0');
  assert.ok(ids(stock).includes('google/Gemma-4-26B-it'), 'turning uncensored-only off shows a stock model');
  assert.ok(!ids(stock).some((i: string) => /16k|No-Context|Tiny/.test(i) && !i.includes('Exactly')),
    'and the floor still holds with the filter off');

  assert.deepStrictEqual(ids(await find('q=gemma')), [STUBBORN], 'free text, case-insensitive, on the name');
  assert.deepStrictEqual(ids(await find('q=gemma&uncensored=0')), ['google/Gemma-4-26B-it', STUBBORN],
    'free text and the uncensored switch combine');
  assert.deepStrictEqual(ids(await find('size=24b')), [PLANS_INLINE, NO_SWITCH],
    'the size class filter');
  assert.deepStrictEqual(ids(await find(`weaving=${encodeURIComponent('can switch')}`)), [STUBBORN, REMOTE],
    'the weaving filter');
  assert.deepStrictEqual(ids(await find(`weaving=${encodeURIComponent('can switch')}&size=31b`)), [STUBBORN],
    'and weaving with size');
  assert.deepStrictEqual(ids(await find('q=nothing-like-this')), [], 'a search that matches nothing is empty');
  assert.deepStrictEqual(ids(await find(`weaving=${encodeURIComponent('not tried yet')}`)), [UNTRIED],
    'the weaving filter takes the untried guess too');
  assert.deepStrictEqual(all.weavings, ["doesn't weave", 'can switch', 'always weaves', 'not tried yet'],
    'the weaving words the filter offers are the ones the rows use, in sort order');
  assert.ok(all.sizes.includes('35b') && all.sizes.includes('24b'),
    'the size choices come from the catalogue itself');
  // UNITS. Seth, 2026-10-25: "a filter for how many units it takes". Exact: a 1-unit model is one
  // both writers can run at once on the shared plan, which is the question being asked.
  const costOf = (r: any, id: string) => r.models.find((m: any) => m.id.replace('featherless:', '') === id)?.cost;
  const two = await find('cost=2');
  assert.ok(ids(two).length > 0 && ids(two).every((id: string) => costOf(all, id) === 2),
    `the units filter keeps only models of that cost (${ids(two).length})`);
  assert.ok(ids(all).some((id: string) => costOf(all, id) !== 2), 'and the unfiltered search had others');
  assert.ok(Array.isArray(all.costs) && all.costs.includes(2) && all.costs.includes(4),
    `the unit choices come from what this writer can be shown, the whole plan included (${JSON.stringify(all.costs)})`);
  assert.deepStrictEqual(ids(await find('cost=4')), [BIG], 'and a filter for 4 units finds the 4-unit model');

  // A DAY'S CACHE. Every search above was served without a fresh read; a day later, one is made.
  const { catalogue, CATALOGUE_TTL_MS } = await import('../src/catalogue.ts');
  const reads = catReads.length;
  await catalogue(Date.now() + CATALOGUE_TTL_MS - 60_000);
  assert.strictEqual(catReads.length, reads, 'within the day the catalogue is not read again');
  await catalogue(Date.now() + CATALOGUE_TTL_MS + 60_000);
  assert.strictEqual(catReads.length, reads + 1, 'a day on, it is');
  assert.strictEqual(catReads.length, 2, 'and the searches above never read it themselves');
  ok('the search filters, combines, sorts non-weaving first, holds the 16k floor, and shows every unit cost');
}

// ---- 12a. the tag index: a tag search over every model the search could show ----
// Seth, 2026-10-25: "add the server tag index". The first answer reads what it has and starts
// reading the rest; asked again, it has them all.
{
  const find = async (query: string) => {
    const r = await routes['GET /api/catalogue'](ctx(me, {}, query));
    assert.ok(!r.error, r.error);
    return r;
  };
  const ids = (r: any) => r.models.map((m: any) => m.id.replace('featherless:', ''));
  const first = await find('tag=roleplay');
  assert.ok(first.tagIndex && first.tagIndex.of > 0, `TAG-INDEX: the answer says how far it has read (${JSON.stringify(first.tagIndex)})`);
  assert.ok(!('unread' in first), 'TAG-INDEX: and the list of what is still to read stays on the server');
  let r = first;
  for (let i = 0; i < 60 && r.tagIndex.read < r.tagIndex.of; i++) { await new Promise((ok) => setTimeout(ok, 50)); r = await find('tag=roleplay'); }
  assert.strictEqual(r.tagIndex.read, r.tagIndex.of, `TAG-INDEX: asked again, every candidate's tags are read (${JSON.stringify(r.tagIndex)})`);
  assert.deepStrictEqual(ids(r).sort(), [STUBBORN, REMOTE].sort(),
    'TAG-INDEX: the models carrying the tag, and only them');
  assert.deepStrictEqual(ids(await find('tag=role')).sort(), [STUBBORN, REMOTE].sort(), 'TAG-INDEX: part of a tag matches');
  const adv = ids(await find('tag=adventure'));
  assert.ok(adv.includes(PLANS_INLINE) && !adv.includes(REMOTE), `TAG-INDEX: another tag, other models (${JSON.stringify(adv)})`);
  assert.ok(!('tagIndex' in await find('')), 'TAG-INDEX: a search with no tag says nothing about the index');
  ok('a tag search reads every candidate\'s tags in the background and then answers over all of them');
}

// ---- 12b. the weaving guess for the big families, from the classes Featherless really sends ----
{
  // Every class string here is copied from the live catalogue (read 2026-10-22), with a real id
  // that carries it, so the table is tested against what it will meet and not against names made
  // up to fit it. One class can hold two behaviours (Kimi K2 holds Instruct and Thinking; GLM 4's
  // 0414 class holds GLM-4 and the Z1 reasoner), and the id is what tells them apart.
  const { search } = await import('../src/catalogue.ts');
  const FAMILIES: [string, string | null, string][] = [
    ['moonshotai/Kimi-K2-Instruct-0905', 'kimi-k2', "doesn't weave"],
    ['moonshotai/Kimi-K2-Thinking', 'kimi-k2', 'always weaves'],
    // K2.6 was sent `enable_thinking: false` live on 2026-10-22 and wrote with no plan.
    ['moonshotai/Kimi-K2.5', 'kimi-k25', 'can switch'],
    ['moonshotai/Kimi-K2.6', 'kimi-k25', 'can switch'],
    ['deepseek-ai/DeepSeek-V4-Flash', 'deepseek4-284b', 'can switch'],
    ['deepseek-ai/DeepSeek-V4-Pro', 'deepseek4-1.6t', 'can switch'],
    ['deepseek-ai/DeepSeek-V4.1-Flash', 'deepseek4-763b', 'can switch'],
    ['MiniMaxAI/MiniMax-M2', 'minimax-m2', 'always weaves'],
    ['MiniMaxAI/MiniMax-M2.1', 'minimax-m21', 'always weaves'],
    ['MiniMaxAI/MiniMax-M2.5', 'minimax-m25', 'always weaves'],
    ['MiniMaxAI/MiniMax-M2.7', 'minimax-m2-228b7', 'always weaves'],
    ['zai-org/GLM-4.6', 'glm46-357b', 'can switch'],
    ['zai-org/GLM-4.7', 'glm47-357b', 'can switch'],
    ['zai-org/GLM-4.7-Flash', 'glm47-flash', 'can switch'],
    ['zai-org/GLM-4-9B-0414', 'glm4-9b', "doesn't weave"],
    ['unsloth/GLM-Z1-32B-0414', 'glm4-32b', 'always weaves'],
    ['mistralai/Mistral-Small-24B-Instruct-2501', 'mistral-24b', "doesn't weave"],
    ['mistralai/Mistral-Small-3.2-24B-Instruct-2506', 'mistral-24b-2503', "doesn't weave"],
    // Magistral's plan is asked for in a system prompt Anansi writes and never includes, so the
    // card cannot say which it does here; only trying it can. Not "doesn't weave", as its class
    // alone would say.
    ['mistralai/Magistral-Small-2509', 'mistral-24b-2503', 'not tried yet'],
    ['mistralai/Magistral-Small-2506', 'mistral-24b', 'not tried yet'],
    ['meta-llama/Llama-3.3-70B-Instruct', 'llama33-70b', "doesn't weave"],
    ['meta-llama/Meta-Llama-3.1-70B-Instruct', 'llama31-70b', "doesn't weave"],
    ['meta-llama/Llama-3.2-3B-Instruct', 'llama32-3b', "doesn't weave"],
    ['NousResearch/Meta-Llama-3-70B-Instruct', 'llama3-70b', "doesn't weave"],
    // A Llama 3 tune of a reasoner plans like the reasoner, whatever its class.
    ['deepseek-ai/DeepSeek-R1-Distill-Llama-8B', 'llama31-8b', 'always weaves'],
    // An id that says it does NOT think is not read as one that does.
    ['jan-hq/Qwen3-4B-no-think', 'qwen3-4b', 'can switch'],
    // The families nobody has looked at yet: a guess, and one that says so.
    ['moonshotai/Kimi-K3', 'kimi3-2780b', 'not tried yet'],
    ['MiniMaxAI/MiniMax-M3', 'minimax-m3', 'not tried yet'],
    ['stepfun-ai/Step-3.5-Flash', 'step-3.5-199b', 'not tried yet'],
    ['nobody/No-Class-At-All', null, 'not tried yet'],
  ];
  const rows = FAMILIES.map(([id, modelClass]) => ({ id, modelClass, context: 32768, cost: 1 }));
  const found = search(rows, { uncensored: false }, '');
  // Every unit cost is shown, and an unknown one too: the floor is the only refusal.
  const priced = (cost: number | null) => search([{ id: BIG, modelClass: 'llama33-70b', context: 32768, cost }],
    { uncensored: false }, '').models.map((m) => m.id);
  for (const cost of [1, 2, 3, 4, null])
    assert.deepStrictEqual(priced(cost), [BIG], `UNITS: the row is shown at ${cost ?? 'an unknown'} units`);
  const got = new Map(found.models.map((m) => [m.id, m.weaving]));
  for (const [id, modelClass, want] of FAMILIES)
    assert.strictEqual(got.get(id), want, `${id} (${modelClass}) is guessed "${want}"`);
  ok('the big families are guessed from their real classes, and the Thinking ids from their names');

  // THE UNKNOWN IS ITS OWN LABEL: offered by the filter, last in the sort, and never mistaken for
  // a model known not to weave.
  assert.deepStrictEqual(found.weavings, ["doesn't weave", 'can switch', 'always weaves', 'not tried yet'],
    'the filter offers the untried guess as a label of its own, last');
  assert.deepStrictEqual(found.models.slice(-6).map((m) => m.weaving), Array(6).fill('not tried yet'),
    'and the untried come after every model whose weaving is known');
  const untried = search(rows, { uncensored: false, weaving: 'not tried yet' }, '');
  assert.deepStrictEqual(untried.models.map((m) => m.id).sort(),
    FAMILIES.filter(([, , w]) => w === 'not tried yet').map(([id]) => id).sort(),
    'the weaving filter picks out exactly the untried');
  const never = search(rows, { uncensored: false, weaving: "doesn't weave" }, '');
  assert.ok(!never.models.some((m) => /Kimi-K3|MiniMax-M3|Step-3|No-Class|Magistral/.test(m.id)),
    "and none of them is filed under doesn't weave");
  ok('a family nobody has tried is labelled not tried yet, filtered and sorted as its own label');
}

// ---- 13. adding: one weaving-off probe, and the label and unit cost stored with the entry ----
{
  const writer = db.owner('prober');
  const add = async (id: string) => {
    const c = ctx(writer, { model: `featherless:${id}` });
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
  await add(UNTRIED);
  assert.strictEqual(entry(UNTRIED).weaving, "doesn't weave",
    'an untried family that obeyed the probe is stored as what it did, never as not tried yet');
  await add(THINKING);
  assert.strictEqual(entry(THINKING).weaving, 'always weaves',
    'a Thinking model that showed no plan keeps the guess its name gives, not its class');
  // A model at capacity when it is added waits its turn, as a passage does, rather than failing.
  script.push('capacity');
  const full = await add('google/Gemma-4-26B-it');
  assert.ok(!full.r.error, `ADD-CAPACITY: adding a model at capacity retries before failing (${full.r.error})`);
  assert.strictEqual(full.probes.length, 2, 'ADD-CAPACITY: one at-capacity answer, then the probe that worked');
  assert.ok(entry('google/Gemma-4-26B-it'), 'and it is stored');
  const listed = await routes['GET /api/shortlist'](ctx(writer));
  assert.ok(listed.models.every((m: any) => m.weaving && m.cost),
    'the shortlist route hands back the label and the cost with each entry');

  // THE FLOOR, ON ADD. Refused before the probe, so a refusal spends none of the plan.
  const under = await add('edge/Under-16k-heretic');
  assert.match(String(under.r.error), /at least 16,384/, 'a model under the floor is refused by name too');
  const blind = await add('edge/No-Context-heretic');
  assert.match(String(blind.r.error), /unknown number of tokens/,
    'NO-CONTEXT: a model whose entry does not say what it holds is refused');
  assert.strictEqual(blind.probes.length, 0, 'and no call is spent finding that out');
  const big = await add(BIG);
  assert.ok(!big.r.error, `UNITS: a writer who is not the admin can add a 4-unit model (${big.r.error})`);
  assert.strictEqual(entry(BIG).cost, 4, 'and its cost is recorded');
  ok('adding probes once with weaving off, stores the label and the cost, and holds the floor');
}

// ---- 14. tags for the result rows: one batched call, cached, and never the unit gate's hole ----
{
  const SMALL_ID = `featherless:${SMALL}`, STUB_ID = `featherless:${STUBBORN}`;
  const tagsOf = async (models: string[]) => {
    const c = ctx(me, { models });
    return routes['POST /api/catalogue/tags'](c);
  };
  hubHits.length = 0;
  const r = await tagsOf([ID, STUB_ID, SMALL_ID, 'featherless:nobody/Not-In-The-Catalogue', 'not-remote']);
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.tags[ID], ['heretic', 'uncensored', 'roleplay', 'creative-writing'],
    "the author's own card tags are the ones shown, in their order");
  assert.deepStrictEqual(r.tags[STUB_ID], ['gemma4', 'abliterated', 'roleplay'],
    "with none, the hub's tags, without the machine ones (license:, region:, text-generation...)");
  assert.ok(!(SMALL_ID in r.tags), 'GATE: no tags for a model the search does not show (under the floor)');
  assert.ok(!hubHits.some((h) => h.path.includes(SMALL)), 'and the hub is not even asked about it');
  assert.ok(!hubHits.some((h) => h.path.includes('Not-In-The-Catalogue')),
    'nor about a model the catalogue does not list: the server is not a proxy to any repo');
  assert.ok(hubHits.every((h) => h.auth === undefined), 'the Featherless key never goes to Hugging Face');
  const asked = hubHits.length;
  const again = await tagsOf([ID, STUB_ID]);
  assert.deepStrictEqual(again.tags[ID], r.tags[ID]);
  assert.strictEqual(hubHits.length, asked, 'tags already read are served from the cache');

  // ONE HOP ON THE SAME HOST: a renamed repo is followed; a redirect off the host is not.
  const moved = await tagsOf(['featherless:huihui/gpt-oss-20b-abliterated', 'featherless:edge/Exactly-16k-heretic']);
  assert.deepStrictEqual(moved.tags['featherless:huihui/gpt-oss-20b-abliterated'], ['mistral', 'adventure'],
    'a redirect to the same host is followed once');
  assert.ok(!hubHits.some((h) => h.path.includes('meta-data')), 'a redirect off the host is never followed');
  assert.deepStrictEqual(moved.tags['featherless:edge/Exactly-16k-heretic'] ?? [], [],
    'and that model simply has no tags');
  ok('result tags come in one batched call, cached, from the fixed host only, inside the gate');
}

// ---- 15. expand: the base model and the card's first real paragraph, banners stripped ----
{
  const card = async (model: string) => {
    const c = ctx(me, {}, `model=${encodeURIComponent(model)}`);
    return routes['GET /api/catalogue/card'](c);
  };
  hubHits.length = 0;
  const heavy = await card(ID);
  assert.ok(!heavy.error, heavy.error);
  assert.strictEqual(heavy.about, 'This is an abliterated finetune of Qwen3.6-35B-A3B for long-form '
    + "fiction & roleplay. It keeps the base model's prose and drops its refusals.",
    'STRIP: the first real paragraph, as plain text, past the style block, the banner, the badges, '
    + 'the callout and the table');
  assert.deepStrictEqual(heavy.base, ['Qwen/Qwen3.6-35B-A3B'], 'the base model, from the card data');
  assert.deepStrictEqual(heavy.tags, ['heretic', 'uncensored', 'roleplay', 'creative-writing']);
  assert.ok(hubHits.some((h) => h.path === `/${REMOTE}/raw/main/README.md`), 'the card was read from the hub');

  const bare = await card(`featherless:${STUBBORN}`);
  assert.ok(!bare.error, bare.error);
  assert.strictEqual(bare.about, null, 'a card with no paragraph has no description');
  assert.deepStrictEqual(bare.base, ['google/gemma-4-31b-it'], 'but still its base model');
  assert.deepStrictEqual(bare.tags, ['gemma4', 'abliterated', 'roleplay'], 'and its tags');
  assert.ok(!/[<>{}]|style|img|```/.test([heavy, bare].flatMap((x) => [x.about ?? '', ...x.tags, ...x.base]).join(' ')),
    'never raw markup, either card');

  const none = await card('featherless:edge/Exactly-16k-heretic');
  assert.ok(!none.error, none.error);
  assert.deepStrictEqual([none.about, none.base, none.tags], [null, [], []],
    'a model the hub knows nothing about answers empty, not an error');

  const asked = hubHits.length;
  await card(ID);
  assert.strictEqual(hubHits.length, asked, 'an expanded card is served from the cache the second time');

  assert.ok((await card(`featherless:${SMALL}`)).error,
    'GATE: a writer cannot read the card of a model the search hides (under the floor)');
  assert.ok((await card('featherless:nobody/Not-In-The-Catalogue')).error,
    'a model the catalogue does not list is refused');
  assert.ok((await card('featherless:../../etc/passwd')).error, 'and so is a path that is not a repo');
  ok('expand gives the base model and the first paragraph as text, and only base and tags when there is none');
}

// ---- 16. a take a remote model wrote says so, and only those lose the reseed ----
{
  const book = db.createStory(me, { title: 'Two Hands' });
  db.addPassage({ ...book, storyId: book.id, body: 'The tide came in.' });
  const takeOf = async (passageId: string) =>
    (await routes['GET /api/history'](ctx(me, {}, `story=${book.id}&passage=${passageId}`))).takes;
  assert.strictEqual(db.defaultModelOf(me), ID, 'the writer starts this case on the remote model');
  // Written and kept the way the composer does it without a stream: generate, then accept with the
  // generation's id, which ties the take to the call that made it.
  const write = async () => {
    const g = await routes['POST /api/generate'](ctx(me, { storyId: book.id, mode: 'continue' }));
    assert.ok(!g.error, g.error);
    const v = await routes['POST /api/accept'](ctx(me, { storyId: book.id, body: g.prose,
      mode: 'continue', genId: g.genId }));
    return v.passages.at(-1).id;
  };
  const far = await write();
  await routes['POST /api/model'](ctx(me, { model: 'Qwen3.6-WNTH-35B-A3B-NN' }));
  const near = await write();
  const [ft] = await takeOf(far), [nt] = await takeOf(near);
  // The seed is there on both, so the flag — not a missing seed — is what hides the button.
  assert.ok(ft.seed != null && nt.seed != null, 'both takes carry the seed that made them');
  assert.strictEqual(ft.remote, true, 'RESEED: a take Featherless wrote is marked remote');
  assert.strictEqual(nt.remote, false, 'RESEED: a take the local router wrote is not');
  await routes['POST /api/model'](ctx(me, { model: ID }));
  ok('a take says whether a remote model wrote it, beside the seed');
}

// ---- 17. Featherless unreachable: the passage fails plainly and no pin or default moves ----
{
  const book = db.createStory(me, { title: 'Dark Water' });
  db.addPassage({ ...book, storyId: book.id, body: 'No light on the water.' });
  await routes['POST /api/story'](ctx(me, { id: book.id, story: { model: ID } }));
  assert.strictEqual(db.getStory(book.id).model, ID, 'the book is pinned to the remote model');
  const before = db.passagesOfChapter((db.chapters(book.id)[0] as any).id).length;

  let m = mark();
  script.push('down');
  const r = await routes['POST /api/generate'](ctx(me, { storyId: book.id, mode: 'continue' }));
  assert.match(String(r.error), /^cannot reach Featherless/, 'UNREACHABLE: the passage fails, plainly');
  assert.strictEqual(since(m).fl.length, 1, 'one attempt: an unreachable server is not a 429');
  assert.strictEqual(since(m).local.length, 0, 'NO FALLBACK: nothing went to the local router');

  m = mark();
  script.push('down');
  const h = await routes['POST /api/generate'](ctx(me, { storyId: book.id, mode: 'continue', stream: true }));
  const last = await h.__stream(() => {});
  assert.match(String(last.error), /^cannot reach Featherless/, 'and the streamed passage says the same');
  assert.strictEqual(since(m).local.length, 0, 'with no fallback either');
  assert.strictEqual(db.passagesOfChapter((db.chapters(book.id)[0] as any).id).length, before,
    'nothing landed in the book');
  assert.strictEqual(db.getStory(book.id).model, ID, 'UNREACHABLE: the pin is unchanged');
  assert.strictEqual(db.defaultModelOf(me), ID, 'UNREACHABLE: and so is the writer default');
  ok('Featherless unreachable fails the passage plainly and changes no pin or default');
}

// ---- 18. removing a model a writer is using sends those books back to the local default ----
{
  const writer = db.owner('remover'), neighbour = db.owner('remover-neighbour');
  const LOCAL0 = 'Qwen3.6-WNTH-35B-A3B-NN';
  for (const w of [writer, neighbour]) {
    const a = await routes['POST /api/shortlist'](ctx(w, { model: ID }));
    assert.ok(!a.error, a.error);
  }
  await routes['POST /api/model'](ctx(writer, { model: ID }));
  const pin = async (w: string, title: string) => {
    const s = db.createStory(w, { title });
    await routes['POST /api/story'](ctx(w, { id: s.id, story: { model: ID } }));
    assert.strictEqual(db.getStory(s.id).model, ID, `"${title}" is pinned to the remote model`);
    return s;
  };
  const north = await pin(writer, 'North Light'), south = await pin(writer, 'South Light');
  const plain = db.createStory(writer, { title: 'Unpinned' });
  const theirs = await pin(neighbour, 'Next Door');

  const r = await routes['POST /api/shortlist/remove'](ctx(writer, { model: ID }));
  assert.deepStrictEqual(r.models, [], 'the model is off the shortlist');
  assert.ok(r.toast, 'FALLBACK: the remove says what moved');
  assert.match(r.toast, /your model/i, 'FALLBACK: the toast names the writer\'s own model');
  assert.ok(r.toast.includes('North Light') && r.toast.includes('South Light'),
    'FALLBACK: and each book that was pinned to it');
  assert.ok(!r.toast.includes('Unpinned') && !r.toast.includes('Next Door'),
    'and no book that was not, nor anyone else\'s');
  assert.match(r.toast, /local/, 'and says where they went');

  // CLEARED, NOT LEFT DANGLING: the screen shows the pin it stores, so a pin left pointing at a
  // model the writer no longer has would claim a model that is not writing.
  assert.strictEqual(db.getStory(north.id).model, null, 'the pin is cleared');
  assert.strictEqual(db.getStory(south.id).model, null);
  assert.notStrictEqual(db.defaultModelOf(writer), ID, 'and so is the default');
  const v = await routes['GET /api/story'](ctx(writer, {}, `story=${north.id}`));
  assert.strictEqual(v.model, LOCAL0, 'the book is written by the local default now');
  const listed = await routes['GET /api/models'](ctx(writer));
  assert.strictEqual(listed.active, LOCAL0, 'and the strip says so');

  assert.strictEqual(db.getStory(theirs.id).model, ID, 'OWNER: the neighbour\'s pin is untouched');
  assert.strictEqual(db.shortlistOf(neighbour).length, 1, 'and so is their shortlist');

  const again = await routes['POST /api/shortlist/remove'](ctx(neighbour, { model: `featherless:${SMALL}` }));
  assert.ok(!again.toast, 'removing a model nothing used says nothing more');
  ok('removing a model in use clears the writer\'s own pins and default, and the toast names them');
}

// ---- 18b. remove takes only a remote id: a local one clears no pin and no default ----
{
  const writer = db.owner('local-remover');
  const LOCAL0 = 'Qwen3.6-WNTH-35B-A3B-NN';
  await routes['POST /api/model'](ctx(writer, { model: LOCAL0 }));
  assert.strictEqual(db.defaultModelOf(writer), LOCAL0, 'the detector: the default is the local model');
  const s = db.createStory(writer, { title: 'Local Light' });
  await routes['POST /api/story'](ctx(writer, { id: s.id, story: { model: LOCAL0 } }));
  assert.strictEqual(db.getStory(s.id).model, LOCAL0, 'the detector: the book is pinned to it');

  const r = await routes['POST /api/shortlist/remove'](ctx(writer, { model: LOCAL0 }));
  assert.ok(r.error, 'LOCAL-REMOVE: a local id is refused');
  assert.ok(!r.toast, 'and nothing is said to have moved');
  assert.strictEqual(db.getStory(s.id).model, LOCAL0, 'LOCAL-REMOVE: the local pin is untouched');
  assert.strictEqual(db.defaultModelOf(writer), LOCAL0, 'LOCAL-REMOVE: and so is the default');
  ok('remove refuses a local id, and clears no pin and no default');
}

// ---- 19. no key: the shortlist shows, unpickable, and every pin and default writes locally ----
{
  const writer = db.owner('keyless');
  const LOCAL0 = 'Qwen3.6-WNTH-35B-A3B-NN';
  const a = await routes['POST /api/shortlist'](ctx(writer, { model: ID }));
  assert.ok(!a.error, a.error);
  await routes['POST /api/model'](ctx(writer, { model: ID }));
  const book = db.createStory(writer, { title: 'Keyless' });
  db.addPassage({ ...book, storyId: book.id, body: 'The keeper lost the key.' });
  await routes['POST /api/story'](ctx(writer, { id: book.id, story: { model: ID } }));

  // The detector first: with the key in place the same reads must say remote, or the checks below
  // could pass on a list that never marked anything.
  const keyed = await routes['GET /api/models'](ctx(writer));
  assert.strictEqual(keyed.remote, true, 'with a key, the list says remote models are set up');
  assert.strictEqual(keyed.models.find((m: any) => m.id === ID).ready, true, 'and the row is pickable');
  assert.strictEqual(keyed.active, ID, 'and the strip names the remote default');

  // The key is read on every call, so taking the file away is the server with no key configured.
  unlinkSync(KEY_FILE);
  try {
    const r = await routes['GET /api/models'](ctx(writer));
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.remote, false, 'NO KEY: the list says remote models are not set up');
    assert.ok(!JSON.stringify(r).includes(KEY_FILE), 'and says nothing about where the key would be');
    const row = r.models.find((m: any) => m.id === ID);
    assert.ok(row, 'NO KEY: the shortlisted model is still listed, so the list does not look wiped');
    assert.strictEqual(row.ready, false, 'NO KEY: and marked as not pickable');
    assert.strictEqual(r.active, LOCAL0, 'NO KEY: the strip names the model that really writes');

    const v = await routes['GET /api/story'](ctx(writer, {}, `story=${book.id}`));
    assert.strictEqual(v.model, LOCAL0, 'NO KEY: a pinned book is written by the local default');
    assert.strictEqual(v.defaultModel, LOCAL0, 'and its "Default" names the local one too');
    assert.strictEqual(v.story.model, ID, 'the pin itself is kept, for when the key comes back');

    const m = mark();
    const g = await routes['POST /api/generate'](ctx(writer, { storyId: book.id, mode: 'continue' }));
    assert.ok(!g.error, g.error);
    assert.strictEqual(since(m).fl.length, 0, 'NO KEY: nothing goes to Featherless');
    assert.ok(since(m).local.every((x) => x.body.model === LOCAL0) && since(m).local.length >= 1,
      'the passage is written locally, by the local default');

    const pick = await routes['POST /api/model'](ctx(writer, { model: ID }));
    assert.match(String(pick.error), /isn't set up/, 'NO KEY: the shortlisted model cannot be picked');
    const sl = await routes['GET /api/shortlist'](ctx(writer));
    assert.deepStrictEqual([sl.ready, sl.models.length], [false, 1], 'and the shortlist route agrees');
  } finally { writeFileSync(KEY_FILE, KEY + '\n'); }
  ok('no key: the shortlist is listed but not pickable, and pins and defaults write locally');
}

// ---- 20. a guest in a book its owner pinned to a remote model sees the model that writes it ----
//
// The guest's own model list is their local models and THEIR shortlist, so the owner's remote pin
// is not on it. Without the book saying what its pin is, the guest's picker read it as "the router
// no longer offers this" and their shelf marked the book "model missing" while it wrote remotely.
{
  const owner = db.owner('pin-owner'), guest = db.owner('pin-guest');
  const a = await routes['POST /api/shortlist'](ctx(owner, { model: ID }));
  assert.ok(!a.error, a.error);
  const book = db.createStory(owner, { title: 'Shared Light' });
  db.addPassage({ ...book, storyId: book.id, body: 'Two writers, one lamp.' });
  await routes['POST /api/story'](ctx(owner, { id: book.id, story: { model: ID } }));
  db.addWriter(book.id, guest);
  const plain = db.createStory(owner, { title: 'Shared Dark' });
  db.addWriter(plain.id, guest);
  assert.strictEqual(db.shortlistOf(guest).length, 0, 'the detector: the guest shortlisted nothing');

  const v = await routes['GET /api/story'](ctx(guest, {}, `story=${book.id}`));
  assert.strictEqual(v.model, ID, 'the book writes remotely for the guest too');
  assert.strictEqual(v.pin?.id, ID, 'GUEST-PIN: the open book names its remote pin as a model row');
  assert.deepStrictEqual([v.pin.source, v.pin.ready], ['remote', true], 'GUEST-PIN: remote, and ready');
  assert.strictEqual(v.pin.perSlot, 32768, 'with the room the owner\'s entry gives it');
  assert.strictEqual(v.pin.cost, 2, 'GUEST-PIN: and the unit cost the owner\'s shortlist holds for it');

  const shelf = await routes['GET /api/stories'](ctx(guest));
  const row = shelf.stories.find((s: any) => s.id === book.id);
  assert.strictEqual(row?.pin?.id, ID, 'GUEST-PIN: the shelf row carries the same pin row');
  assert.strictEqual(shelf.stories.find((s: any) => s.id === plain.id)?.pin, null,
    'and a book with no remote pin carries none');

  unlinkSync(KEY_FILE);
  try {
    const off = await routes['GET /api/story'](ctx(guest, {}, `story=${book.id}`));
    assert.strictEqual(off.pin?.ready, false, 'GUEST-PIN: with no key the pin row says not ready');
    assert.notStrictEqual(off.model, ID, 'which is the truth: the book writes locally then');
  } finally { writeFileSync(KEY_FILE, KEY + '\n'); }
  ok('a guest in a remote-pinned book is told the pin, its source and whether it is ready');
}

// ---- 21. an ordinary action on a book hands back the same model, pin and room as opening it ----
//
// About forty routes answer with the book's view, and the browser takes that answer as the book.
// When those answers lacked the resolved model, the remote pin and the budget, saving a look or
// waving a warning away put the writer default back on the strip, emptied the Storyteller's "using",
// and left a guest's picker calling the owner's remote pin a model nobody offers.
{
  const owner = db.owner('view-owner'), guest = db.owner('view-guest');
  const a = await routes['POST /api/shortlist'](ctx(owner, { model: ID }));
  assert.ok(!a.error, a.error);
  const book = db.createStory(owner, { title: 'Same Light' });
  db.addPassage({ ...book, storyId: book.id, body: 'The lamp kept its own counsel.' });
  await routes['POST /api/story'](ctx(owner, { id: book.id, story: { model: ID } }));
  db.addWriter(book.id, guest);
  const keys = (v: any) => ({ model: v.model, defaultModel: v.defaultModel, pin: v.pin, budget: v.budget });
  for (const [who, w] of [['owner', owner], ['guest', guest]] as const) {
    const opened = keys(await routes['GET /api/story'](ctx(w, {}, `story=${book.id}`)));
    assert.strictEqual(opened.model, ID, `the detector: the book writes remotely for the ${who}`);
    assert.strictEqual(opened.pin?.id, ID, `the detector: and the ${who} is told its pin`);
    const look = await routes['POST /api/look'](ctx(w, { storyId: book.id, look: { theme: 'ink' } }));
    assert.deepStrictEqual(keys(look), opened,
      `BARE-VIEW: after a look save the ${who} is handed the same model, pin and room`);
    const dismissed = await routes['POST /api/dismiss'](ctx(w, { storyId: book.id, kind: 'stale', ref: 'x' }));
    assert.deepStrictEqual(keys(dismissed), opened,
      `BARE-VIEW: and after waving a warning away, too (${who})`);
  }
  ok('an ordinary action hands back the book with the model, pin and room that opening it gives');
}

// ---- 22. a model that always weaves gets weaving's room with the book's switch off (#58) ----
//
// The label is the one the shortlist recorded when the model was added: STUBBORN planned when the
// probe told it not to. A model like that plans whatever it is sent, so a passage capped at the
// writer's 400 would be all plan and no prose (F5). It gets the 5,000 on every call that weaves.
{
  const w = db.owner('always-writer');
  const ALWAYS = `featherless:${STUBBORN}`;
  for (const id of [ALWAYS, ID]) {
    const a = await routes['POST /api/shortlist'](ctx(w, { model: id }));
    assert.ok(!a.error, a.error);
  }
  const label = (id: string) => (db.shortlistOf(w) as any[]).find((x) => x.id === id)?.weaving;
  assert.strictEqual(label(ALWAYS), 'always weaves', 'the detector: the probe recorded it as always weaving');
  assert.strictEqual(label(ID), 'can switch', 'the detector: and the other model as one that can switch');
  const book = db.createStory(w, { title: 'Always' });
  db.addPassage({ ...book, storyId: book.id, body: 'The lamp turned on its own.' });
  const pin = async (model: string) =>
    routes['POST /api/story'](ctx(w, { id: book.id, story: { model } }));

  await pin(ALWAYS);
  const v = await routes['GET /api/story'](ctx(w, {}, `story=${book.id}`));
  assert.strictEqual(v.story.weaving, false, 'the detector: the book\'s own switch is off');
  assert.strictEqual(v.weaves, true, 'ALWAYS-WEAVES: the view says the book weaves, so the writer sees Weaving');
  fl.length = 0;
  const g = await routes['POST /api/generate'](ctx(w, { storyId: book.id, mode: 'continue' }));
  assert.ok(!g.error, g.error);
  // Since 2026-10-27 the room is not SENT to a remote model (no cap goes there); it is still the
  // room the call is planned with, and the generation row records it (`plannedRoom`).
  assert.ok(!('max_tokens' in chats().at(-1)!.body), 'UNCAPPED: the room is not sent to Featherless');
  assert.strictEqual(plannedRoom(book.id), 5400,
    'ALWAYS-WEAVES: a passage is planned with the writer\'s 400 plus 5,000 with the switch off');
  fl.length = 0;
  await routes['POST /api/talk'](ctx(w, { storyId: book.id, said: 'What is this story about?' }));
  // TALK IS CAPPED ON FEATHERLESS since 2026-10-29: Forgotten-Transgression-24B ran a Talk answer on
  // to Featherless's own 4,096-token limit inside its JSON (226 s, cut), and the writer read that as
  // Talk not answering. The cap is the room Talk is planned with, so a runaway is cut and retried.
  assert.strictEqual(chats()[0]?.body?.max_tokens, 7400, 'TALK-CAPPED: Talk sends Featherless the room it is planned with');
  assert.strictEqual(plannedRoom(book.id, 'talk'), 7400, 'ALWAYS-WEAVES: and Talk is planned with 2,400 plus 5,000');
  const bg = await routes['POST /api/manifest'](ctx(w, { storyId: book.id, mode: 'continue' }));
  assert.strictEqual(bg.manifest.totals.budget, v.budget, 'the Context panel reserves the room the view does');

  // The control: the same book on a model that can switch, with the switch off, is not raised.
  await pin(ID);
  const plain = await routes['GET /api/story'](ctx(w, {}, `story=${book.id}`));
  assert.strictEqual(plain.weaves, false, 'a model that can switch, with the switch off, does not weave');
  fl.length = 0;
  await routes['POST /api/generate'](ctx(w, { storyId: book.id, mode: 'continue' }));
  assert.strictEqual(plannedRoom(book.id), 400, 'and its passage is planned with the writer\'s 400');
  ok('a model that always weaves gets the raised cap with the switch off, in the view, a passage and Talk');
}

// ---- 22b. a model that holds more than the slot gets twice weaving's room (2026-10-24) ----
//
// Kimi K2.5 holds 262,144 tokens and its budget is still the 50,048 slot, so the extra room does
// not crowd out the book. A 32k model in the same book keeps the 5,000.
{
  const w = db.owner('roomy-writer');
  const HUGE = 'featherless:someone/Kimi-Like-262k';
  db.addToShortlist(w, HUGE, 262144, 'can switch', 4, true);
  assert.ok(!(await routes['POST /api/shortlist'](ctx(w, { model: ID }))).error);
  const book = db.createStory(w, { title: 'Roomy' });
  db.addPassage({ ...book, storyId: book.id, body: 'The tide went out and stayed out.' });
  const set = (story: any) => routes['POST /api/story'](ctx(w, { id: book.id, story }));
  const sent = async () => {
    fl.length = 0;
    const g = await routes['POST /api/generate'](ctx(w, { storyId: book.id, mode: 'continue' }));
    assert.ok(!g.error, g.error);
    return plannedRoom(book.id);
  };
  await set({ model: HUGE, weaving: true });
  assert.strictEqual(await sent(), 10400, 'ROOMY: a weaving passage on a 262k model gets 400 plus 10,000');
  await set({ model: ID });
  assert.strictEqual(await sent(), 5400, 'the control: the same book on a 32k model gets 400 plus 5,000');
  await set({ model: HUGE, weaving: false });
  assert.strictEqual(await sent(), 400, 'and with weaving off the big model gets no room at all');
  ok('a model that holds more than the slot gets twice the weaving room, and a 32k one does not');
}

// ---- 23. on a 32k model, weaving's room refuses where the local slot would not (#58) ----
//
// About 16,700 tokens of prose. The prose ceiling is 60% of the budget: about 24,800 on the local
// 50,048 slot with weaving's room, about 17,900 on a 32,768 model without it, and about 15,000 on
// a 32,768 model with it. So only the last drops passages, and the message says the model's own
// limit is why.
{
  const w = db.owner('small-limit-writer');
  const ALWAYS = `featherless:${STUBBORN}`;
  for (const id of [ALWAYS, ID]) {
    const a = await routes['POST /api/shortlist'](ctx(w, { model: id }));
    assert.ok(!a.error, a.error);
  }
  const book = db.createStory(w, { title: 'Long Shore' });
  for (let i = 0; i < 20; i++)
    db.addPassage({ ...book, storyId: book.id,
      body: `Passage ${i}. ` + 'The lamp kept turning over the water, and nobody came to tend it. '.repeat(52) });
  const set = (story: any) => routes['POST /api/story'](ctx(w, { id: book.id, story }));
  const preview = async (perSlot = 50048) => {
    const c = ctx(w, { storyId: book.id, mode: 'continue' });
    c.slot = { ...c.slot, perSlot };
    return routes['POST /api/manifest'](c);
  };

  await set({ weaving: true });
  const local = await preview();
  assert.ok(!local.manifest.overflowed, 'the detector: the book fits the local slot');
  assert.strictEqual(local.weaveFit, null, 'REMOTE-LIMIT: a local model on the 50,048 slot weaves this book whole');

  await set({ model: ID });
  const remoteOff = await set({ weaving: false });
  assert.strictEqual(remoteOff.model, ID, 'the detector: the book writes on the 32k model');
  assert.strictEqual((await preview()).weaveFit, null, 'the detector: without weaving it fits the 32k model whole');

  await set({ weaving: true });
  const remote = await preview();
  assert.ok(remote.weaveFit && !remote.weaveFit.overflows,
    `REMOTE-LIMIT: weaving on the 32k model would drop part of the book (${JSON.stringify(remote.weaveFit)})`);
  assert.ok(remote.weaveFit.drops.some((d: any) => d.kind === 'PROSE'), 'and what drops is the oldest prose');
  assert.match(remote.weaveFit.message, /32,768 tokens/, 'REMOTE-LIMIT: the message gives the model\'s own limit');
  assert.match(remote.weaveFit.message, /this tale's model/i, 'REMOTE-LIMIT: and says it is the model\'s, not the book\'s');
  fl.length = 0;
  const g = await routes['POST /api/generate'](ctx(w, { storyId: book.id, mode: 'continue' }));
  assert.strictEqual(g.error, remote.weaveFit.message, 'the press is refused with the same words');
  assert.strictEqual(chats().length, 0, 'and nothing reaches Featherless');

  // The same slot, locally: refused for the book's length, and the message does not blame a model.
  db.setDefaultModel(w, 'Qwen3.6-WNTH-35B-A3B-NN');
  await set({ model: null });
  const tight = await preview(32768);
  assert.ok(tight.weaveFit, 'the detector: a local slot of 32,768 refuses this book too');
  assert.doesNotMatch(tight.weaveFit.message, /this tale's model/i,
    'REMOTE-LIMIT: a local refusal does not name a model\'s limit, because the slot is the writer\'s');

  // A model that always weaves, with the switch off, is refused the same way.
  await set({ model: ALWAYS, weaving: false });
  const always = await preview();
  assert.ok(always.weaveFit, 'ALWAYS-WEAVES: the fit check applies with the switch off');
  assert.match(always.weaveFit.message, /32,768 tokens/, 'and names the model\'s limit');
  // Turning weaving off cannot help a model that always weaves, so it is never offered.
  assert.strictEqual(always.weaveFit.alwaysWeaves, true, 'ALWAYS-WEAVES: the refusal says the model always weaves');
  assert.doesNotMatch(always.weaveFit.message, /turn Plans first off/i, 'ALWAYS-WEAVES: and never offers to turn weaving off');
  assert.match(always.weaveFit.message, /use another model for this tale, or write anyway/i,
    'ALWAYS-WEAVES: it offers another model, or writing anyway');
  assert.strictEqual(remote.weaveFit.alwaysWeaves, false, 'the control: a book weaving by its switch is not marked so');
  ok('a 32k model refuses weaving where the local slot would not, and the refusal names the model\'s limit');
}

// ---- 24. a model whose template refuses the weaving switch is added, and writes without it (#61) ----
//
// The fake answers NO_SWITCH as the real Featherless does: a 400 for any body that carries
// `chat_template_kwargs`. The add learns that once and stores it with the entry; every call after
// reads the stored fact and leaves the field off, so nothing is tried and refused on a passage.
{
  const w = db.owner('no-switch-writer');
  const HARB = `featherless:${NO_SWITCH}`;
  const entry = (id: string) => (db.shortlistOf(w) as any[]).find((x) => x.id === id);
  let m = mark();
  const added = await routes['POST /api/shortlist'](ctx(w, { model: HARB }));
  assert.ok(!added.error, `NO-SWITCH: a model whose template refuses the switch is still added (${added.error})`);
  const probes = since(m).fl;
  assert.ok('chat_template_kwargs' in probes[0].body, 'the detector: the first probe carries the switch');
  assert.ok(probes.length >= 2 && !('chat_template_kwargs' in probes[1].body),
    'NO-SWITCH: refused, the probe asks once more with no switch at all');
  assert.strictEqual(db.takesSwitch(HARB), false, 'NO-SWITCH: the model is recorded as taking no switch');
  assert.strictEqual(entry(HARB).weaving, "doesn't weave", 'and that it does not weave');
  const other = await routes['POST /api/shortlist'](ctx(w, { model: ID }));
  assert.ok(!other.error, other.error);
  assert.strictEqual(db.takesSwitch(ID), true, 'the control: a model that answered with the switch takes it');

  const book = db.createStory(w, { title: 'No Switch' });
  db.addPassage({ ...book, storyId: book.id, body: 'The lamp turned on its own.' });
  const set = (story: any) => routes['POST /api/story'](ctx(w, { id: book.id, story }));
  await set({ model: ID, weaving: true });
  // Moving a weaving book to a model that cannot take the switch turns the book's weaving off, and
  // says so, so no setting is left on that nothing reads and the panel no longer shows.
  const moved = await set({ model: HARB });
  assert.strictEqual(moved.story.weaving, false, 'MOVE-CLEARS: the book\'s weaving is turned off');
  assert.strictEqual(db.getStory(book.id)?.weaving, 0, 'MOVE-CLEARS: and stored off');
  assert.match(String(moved.toast), /Plans first is off/i, `MOVE-CLEARS: and the writer is told: ${moved.toast}`);
  assert.doesNotMatch(String(moved.toast), /think|reason|spin|weav/i, 'in the writer\'s words');
  const stay = await set({ model: HARB });
  assert.strictEqual(stay.toast, undefined, 'MOVE-CLEARS: a save that clears nothing says nothing');
  const v = await routes['GET /api/story'](ctx(w, {}, `story=${book.id}`));
  assert.strictEqual(v.model, HARB, 'the detector: the book is written by the refusing model');
  assert.match(String(v.weaveNote), /can't be asked to plan first/, 'NO-SWITCH: the view says this book\'s model cannot be asked to weave');
  assert.strictEqual(v.weaves, false, 'NO-SWITCH: so a book switched to it does not weave');

  // Writing: a streamed passage, a waited-for one, and Talk. Each is one call, without the field.
  m = mark();
  const h = await routes['POST /api/generate'](ctx(w, { storyId: book.id, mode: 'continue', stream: true }));
  const last = await h.__stream(() => {});
  assert.ok(!last.error, `NO-SWITCH: a streamed passage writes (${last.error})`);
  const g = await routes['POST /api/generate'](ctx(w, { storyId: book.id, mode: 'continue' }));
  assert.ok(!g.error, `NO-SWITCH: a waited-for passage writes (${g.error})`);
  const calls = since(m).fl;
  assert.strictEqual(calls.length, 2, 'NO-SWITCH: one call a passage, nothing tried and refused first');
  assert.ok(calls.every((r) => !('chat_template_kwargs' in r.body)), 'NO-SWITCH: neither carries the field');
  assert.ok(calls.every((r) => !('max_tokens' in r.body)), 'and neither carries a cap');
  // Talk is a structured call, and this fake answers it with prose, so it is refused as unparseable
  // after its one retry. What matters here is that Featherless never answered it with a 400.
  m = mark();
  const talk = await routes['POST /api/talk'](ctx(w, { storyId: book.id, said: 'What is this story about?' }));
  assert.doesNotMatch(String(talk.error ?? ''), /400/, 'NO-SWITCH: Talk is not refused for the field');
  assert.ok(since(m).fl.length && since(m).fl.every((r) => !('chat_template_kwargs' in r.body)),
    'NO-SWITCH: and Talk is sent without it too, its retry included');

  // The control: the model that takes the switch is still sent it.
  m = mark();
  await set({ model: ID, weaving: true });
  await routes['POST /api/generate'](ctx(w, { storyId: book.id, mode: 'continue' }));
  assert.strictEqual(since(m).fl[0].body.chat_template_kwargs?.enable_thinking, true,
    'the control: a model that takes the switch is sent it, and this book weaves on it');

  // Turning weaving on for a book whose model cannot take it is refused, in the writer's words.
  await set({ weaving: false });
  await set({ model: HARB });
  await assert.rejects(set({ weaving: true }), (e: any) => e.code === 400
    && /can't be asked to plan first/.test(e.message) && !/think|reason|spin|weav/i.test(e.message),
    'NO-SWITCH: weaving cannot be turned on for a book whose model cannot take the switch');
  assert.strictEqual(db.getStory(book.id)?.weaving, 0, 'and the switch stays off');
  await assert.rejects(routes['POST /api/story'](ctx(w, { id: book.id, story: { model: HARB, weaving: true } })),
    /can't be asked to plan first/, 'nor in the same save that picks the model');
  ok('a model whose template refuses the switch is added, writes without the field, and cannot weave');
}

// ---- 24b. one reader for "does this model take the switch", and the latest add wins ----
//
// The Featherless adapter decides whether the field is sent from `db.takesSwitch`, which is not by
// owner: a fact about how Featherless serves the model. The view must read the same fact, or a book
// is told it weaves while its model is never sent the switch. And the fact is the latest add's: a
// model re-added after someone else added it is described by that re-add.
{
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const X = 'featherless:someone/Latest-Wins-24B';
  const a = db.owner('latest-a'), b = db.owner('latest-b');
  db.addToShortlist(a, X, 32768, "doesn't weave", 1, false); await tick();
  db.addToShortlist(b, X, 32768, 'can switch', 1, true); await tick();
  db.addToShortlist(a, X, 32768, "doesn't weave", 1, false);
  assert.strictEqual(db.takesSwitch(X), false, 'LATEST-WINS: a re-add is the latest fact about the model');

  // The book's owner holds the model as taking the switch; a later add found it does not. The call
  // path sends no switch, so the view must not say this book weaves.
  const Y = 'featherless:someone/One-Reader-24B';
  db.addToShortlist(a, Y, 32768, 'can switch', 1, true); await tick();
  db.addToShortlist(b, Y, 32768, "doesn't weave", 1, false);
  const book = db.createStory(a, { title: 'One Reader' });
  db.updateStory(book.id, { model: Y, weaving: true });
  const v = await routes['GET /api/story'](ctx(a, {}, `story=${book.id}`));
  assert.strictEqual(v.model, Y, 'the detector: the book is written by the model');
  assert.strictEqual(db.takesSwitch(Y), false, 'the detector: the call path sends it no switch');
  assert.strictEqual(v.weaves, false, 'ONE-READER: so the book does not weave, by the same fact the call reads');
  assert.match(String(v.weaveNote), /can't be asked to plan first/, 'ONE-READER: and the Storyteller says it cannot');

  // A model that refuses the switch AND always plans: it weaves, the count shows, and the Storyteller
  // says it always weaves rather than that it cannot.
  const Z = 'featherless:someone/Always-No-Switch-24B';
  db.addToShortlist(a, Z, 32768, 'always weaves', 1, false);
  const forced = db.createStory(a, { title: 'Always' });
  db.updateStory(forced.id, { model: Z });
  const fv = await routes['GET /api/story'](ctx(a, {}, `story=${forced.id}`));
  assert.strictEqual(fv.weaves, true, 'ALWAYS-NO-SWITCH: a model that always plans weaves');
  assert.strictEqual(fv.weaveNote, 'This model always plans first.', 'ALWAYS-NO-SWITCH: and the Storyteller says so');
  // Moving a weaving book onto it: the book still weaves, so nothing says weaving went off, and the
  // switch is left as the writer set it for the next model.
  const W = 'featherless:someone/Takes-Switch-24B';
  db.addToShortlist(a, W, 32768, 'can switch', 1, true);
  const moving = db.createStory(a, { title: 'Moving' });
  db.updateStory(moving.id, { model: W, weaving: true });
  const mv = await routes['POST /api/story'](ctx(a, { id: moving.id, story: { model: Z } }));
  assert.strictEqual(mv.weaves, true, 'the detector: the moved book weaves on its new model');
  assert.strictEqual(mv.toast, undefined, `ALWAYS-MOVE: no toast says weaving went off for a book that still weaves (${mv.toast})`);
  assert.strictEqual(mv.story.weaving, true, 'ALWAYS-MOVE: and the book\'s switch is left as it was');

  // The label is read the way the switch is: one fact about the model, the latest add's. The book's
  // owner added it as one that can switch; a later add found it always weaves, so the book weaves.
  const L = 'featherless:someone/Label-Latest-24B';
  db.addToShortlist(a, L, 32768, 'can switch', 1, true); await tick();
  db.addToShortlist(b, L, 32768, 'always weaves', 1, true);
  const labelled = db.createStory(a, { title: 'Label' });
  db.updateStory(labelled.id, { model: L });
  const lv = await routes['GET /api/story'](ctx(a, {}, `story=${labelled.id}`));
  assert.strictEqual(lv.model, L, 'the detector: the book is written by the model');
  assert.strictEqual(lv.weaves, true, 'LABEL-LATEST: the latest add says the model always weaves, so the book weaves');
  assert.strictEqual(lv.weaveNote, 'This model always plans first.', 'LABEL-LATEST: and the Storyteller says so');
  // And back: the latest add is the owner's own again, so the model can switch and this book's
  // switch, off, decides.
  await tick(); db.addToShortlist(a, L, 32768, 'can switch', 1, true);
  const back = await routes['GET /api/story'](ctx(a, {}, `story=${labelled.id}`));
  assert.strictEqual(back.weaves, false, 'LABEL-LATEST: a re-add that says it can switch is the fact again');
  ok('one reader says whether a model takes the switch and whether it always weaves, the latest add wins for both, and a move onto one that always weaves says nothing of weaving off');
}

// ---- 25. a 400 on add for any other reason is learnt as nothing, and on a call is never retried ----
{
  const w = db.owner('flaky-adder');
  const GEMMA = 'featherless:google/Gemma-4-26B-it';
  let m = mark();
  script.push('refuse');
  const added = await routes['POST /api/shortlist'](ctx(w, { model: GEMMA }));
  assert.ok(!added.error, added.error);
  assert.strictEqual(db.takesSwitch(GEMMA), true,
    'ONE-400: a refusal the switch did not cause does not record the model as refusing it');
  assert.ok(since(m).fl.length <= 3, 'and finding that out costs at most three tiny calls');

  m = mark();
  script.push('refuse', 'refuse', 'refuse');
  const no = await routes['POST /api/shortlist'](ctx(w, { model: `featherless:${REMOTE}` }));
  assert.match(String(no.error), /^Featherless answered 400/, 'ONE-400: a model that refuses every probe is not added');
  assert.ok(!(db.shortlistOf(w) as any[]).some((x) => x.id === `featherless:${REMOTE}`), 'and is not stored');
  script.length = 0;
  ok('a 400 the switch did not cause is reported as before, and never stored as a refusal of it');
}

// THE HEM ON A REMOTE MODEL ASKS IN PLAIN LINES, NOT JSON (Seth, 2026-10-30: "Let's use text during the
// hem and in the background we add it to the db after"), and reads them back into the schema's object.
{
  const { shaped } = await import('../src/shaped.ts');
  const { MEMORY, MEMORY_SCHEMA } = await import('../src/prompts.ts');
  shapedSays = '[threads]\nname: Vel\nstands: She waits.\nlabel: waits\nline: She waited.\nalways:\noverflow:';
  const m = mark();
  const r: any = await shaped(MEMORY, 'The scene.', MEMORY_SCHEMA, { model: ID, max_tokens: 4000 });
  const sent = since(m).fl;
  assert.strictEqual(sent.length, 1, `SHAPED-ONE: one call, no retry (${sent.length})`);
  assert.ok(!sent[0].body.response_format, 'SHAPED-TEXT: and it asks for no JSON');
  assert.strictEqual(sent[0].body.max_tokens, 4000, "SHAPED-CAP: at the caller's cap, not doubled");
  assert.deepStrictEqual(r.data?.threads?.[0], { name: 'Vel', stands: 'She waits.', label: 'waits', line: 'She waited.', always: '', pockets: [] },
    'SHAPED-READ: the lines come back as the object the JSON would have been');
  shapedSays = '';
  ok("the hem's structured ask goes to a remote model as plain lines, once, and reads back as its object");
}

// THE MODEL PICKED ON A TALE IS THE WRITER'S MODEL FROM THEN ON (Seth, 2026-11-03: "the default should
// be the last model chosen on the last tale opened"). A new tale, or one with no model of its own,
// starts with it. Another writer's model does not move.
{
  const LOCAL0 = 'Qwen3.6-WNTH-35B-A3B-NN', LOCAL1 = 'Gemma-4-WNTH-31B-NN';
  const w = db.owner('last-pick'), them = db.owner('last-pick-other');
  await routes['POST /api/model'](ctx(w, { model: LOCAL0 }));
  await routes['POST /api/model'](ctx(them, { model: LOCAL0 }));
  const a = db.createStory(w, { title: 'First tale' });
  await routes['POST /api/story'](ctx(w, { id: a.id, story: { model: LOCAL1 } }));
  assert.strictEqual(db.getStory(a.id).model, LOCAL1, 'the tale is pinned to the model picked');
  assert.strictEqual(db.defaultModelOf(w), LOCAL1, 'LAST-PICK-USUAL: and the pick is the writer\'s model now');
  const b: any = await routes['POST /api/stories'](ctx(w, { title: 'Second tale' }));
  const bid = b.id ?? b.story?.id ?? b.storyId;
  const v = await routes['GET /api/story'](ctx(w, {}, `story=${bid}`));
  assert.strictEqual(v.model, LOCAL1, 'LAST-PICK-NEW: a new tale starts with the model last picked');
  assert.strictEqual(db.defaultModelOf(them), LOCAL0, "LAST-PICK-OTHER: another writer's model does not move");
  ok('the model picked on a tale is the writer\'s model, so a new tale starts with it');
}

console.log(`\n${n} checks green`);
flSrv.close(); localSrv.close(); hubSrv.close();
