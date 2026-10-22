// A fake Featherless for the browser scenarios that need remote models. test/ui/run.sh starts it
// for any scenario whose first line is `// needs: fake-featherless`, points the test server at it,
// and gives that server a key file in the scenario's own scratch folder. Real Featherless is never
// called from this harness: it costs plan units, and its catalogue changes under the assertions.
// It plays Hugging Face too, at its root rather than under /v1, for the tags, base models and model
// cards the Find a model rows and the model info panel describe a model with.
//
//   node --experimental-strip-types test/ui/featherless.ts <port-file>
//
// Listens on a port the system picks and writes the number to <port-file> once it is listening.
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';

const portFile = process.argv[2];
if (!portFile) throw new Error('usage: featherless.ts <port-file>');

/** In Featherless's own field names. One row per thing the Find a model scenario looks for. */
const CATALOGUE = [
  { id: 'llmfan46/Qwen3.6-35B-A3B-uncensored-heretic', model_class: 'qwen3_5moe-35b',
    context_length: 32768, concurrency_cost: 2 },
  { id: 'TheDrummer/Mistral-Small-Uncensored-24B', model_class: 'mistral-24b',
    context_length: 32768, concurrency_cost: 1 },
  { id: 'huihui/gpt-oss-20b-abliterated', model_class: 'gpt-oss-20b',
    context_length: 32768, concurrency_cost: 1 },
  { id: 'google/Gemma-4-26B-it', model_class: 'gemma4-26b', context_length: 32768, concurrency_cost: 2 },
  { id: 'someone/Tiny-Ctx-heretic', model_class: 'llama3-8b', context_length: 4096, concurrency_cost: 1 },
];

/** Hugging Face's model API, in its own field names. Every catalogue model has tags, so "tags in
 *  every row" is checkable; Qwen's card is all banner before its paragraph, Mistral's has none. */
const HUB: Record<string, any> = {
  'llmfan46/Qwen3.6-35B-A3B-uncensored-heretic': { tags: ['transformers', 'safetensors', 'region:us'],
    cardData: { tags: ['heretic', 'uncensored', 'roleplay'], base_model: 'Qwen/Qwen3.6-35B-A3B' } },
  'TheDrummer/Mistral-Small-Uncensored-24B': { tags: ['mistral', 'adventure', 'text-generation', 'license:apache-2.0'],
    cardData: { base_model: ['mistralai/Mistral-Small-24B-Instruct-2501'] } },
  'huihui/gpt-oss-20b-abliterated': { tags: ['gpt_oss', 'abliterated'], cardData: {} },
  'google/Gemma-4-26B-it': { tags: ['gemma4', 'conversational'], cardData: { base_model: 'google/gemma-4-26b' } },
};
const CARDS: Record<string, string> = {
  'llmfan46/Qwen3.6-35B-A3B-uncensored-heretic': `---
license: apache-2.0
---
<style>
.banner { background: linear-gradient(#000, #333); }
</style>
<div class="banner" align="center"><img src="https://example.com/banner.png"><h1>QWEN HERETIC</h1></div>

[![Discord](https://img.shields.io/badge/discord-join-7289da)](https://discord.gg/x)

An **abliterated** finetune of [Qwen3.6](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) for long-form fiction &amp; roleplay, with its refusals removed.
`,
  'TheDrummer/Mistral-Small-Uncensored-24B': `<p align="center"><a href="https://ko-fi.com/x"><img src="https://example.com/kofi.png"></a></p>

# Mistral Small Uncensored

- adventure
`,
};

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const json = (status: number, o: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const path = decodeURIComponent(req.url ?? '');
    const api = /^\/api\/models\/(.+)$/.exec(path)?.[1];
    if (api) return HUB[api] ? json(200, { id: api, ...HUB[api] }) : json(404, { error: 'Repository not found' });
    const card = /^\/(.+)\/raw\/main\/README\.md$/.exec(path)?.[1];
    if (card) {
      res.writeHead(CARDS[card] ? 200 : 404, { 'Content-Type': 'text/plain' });
      return res.end(CARDS[card] ?? 'Entry not found');
    }
    // As the real Featherless does: Node's default fetch User-Agent gets a 404 for the catalogue.
    if (req.url === '/v1/models' && /^node$/i.test(String(req.headers['user-agent'] ?? '')))
      return json(404, { error: { message: 'not found' } });
    if (req.url === '/v1/models') return json(200, { data: CATALOGUE });
    if (req.url === '/v1/tokenize') return json(200, { count: 100 });
    if (req.url !== '/v1/chat/completions') return json(404, { error: { message: 'no route' } });
    const body = raw ? JSON.parse(raw) : {};
    // gpt-oss plans whatever it is told, and the real Featherless sends the plan as `reasoning`
    // (checked 2026-10-22), not llama-server's `reasoning_content`. The fake does the same.
    const plan = /gpt-oss/.test(body.model ?? '') ? 'The user wants a short answer.' : '';
    if (!body.stream) return json(200, { choices: [{ message: { content: 'ok', ...(plan && { reasoning: plan }) },
      finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (plan) res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning: plan } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'The fake wrote this.' },
      finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
srv.listen(0, '127.0.0.1', () => writeFileSync(portFile, String((srv.address() as any).port)));
