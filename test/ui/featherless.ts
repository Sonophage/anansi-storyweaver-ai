// A fake Featherless for the browser scenarios that need remote models. test/ui/run.sh starts it
// for any scenario whose first line is `// needs: fake-featherless`, points the test server at it,
// and gives that server a key file in the scenario's own scratch folder. Real Featherless is never
// called from this harness: it costs plan units, and its catalogue changes under the assertions.
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

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const json = (status: number, o: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/v1/models') return json(200, { data: CATALOGUE });
    if (req.url === '/v1/tokenize') return json(200, { count: 100 });
    if (req.url !== '/v1/chat/completions') return json(404, { error: { message: 'no route' } });
    const body = raw ? JSON.parse(raw) : {};
    if (!body.stream) return json(200, { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 1 } });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'The fake wrote this.' },
      finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
srv.listen(0, '127.0.0.1', () => writeFileSync(portFile, String((srv.address() as any).port)));
