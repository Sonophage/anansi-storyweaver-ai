// A fake local router for the browser scenarios that need to know which local models are awake.
// test/ui/run.sh starts it for any scenario whose first line names `fake-router` among its needs,
// and points the test server's ANANSI_LLAMA at it. Without it, those scenarios would read the real
// router on this machine, whose loaded models change with whatever else is running.
//
//   node --experimental-strip-types test/ui/router.ts <port-file>
//
// Listens on a port the system picks and writes the number to <port-file> once it is listening.
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';

const portFile = process.argv[2];
if (!portFile) throw new Error('usage: router.ts <port-file>');

/** One model awake and one asleep, in the router's own field names. The first is the app's
 *  default, so the strip at the foot of the rail starts on an awake local model. */
const MODELS = [
  { id: 'Qwen3.6-WNTH-35B-A3B-NN', status: { value: 'loaded' } },
  { id: 'Wayfarer-2-RPNT-12B', status: { value: 'unloaded' } },
];

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const json = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const path = (req.url ?? '').split('?')[0];
    if (path === '/v1/models') return json({ data: MODELS });
    if (path === '/props') return json({ default_generation_settings: { n_ctx: 100096 }, total_slots: 2 });
    if (path === '/tokenize') return json({ tokens: Array(100).fill(1) });
    if (path === '/models/unload') return json({ success: true });
    if (path === '/slots') return json([]);
    const body = raw ? JSON.parse(raw) : {};
    if (!body.stream) return json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 1 } });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'The fake router wrote this.' },
      finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
srv.listen(0, '127.0.0.1', () => writeFileSync(portFile, String((srv.address() as any).port)));
