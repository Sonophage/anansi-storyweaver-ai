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

/** How long a weaving call plans before its first word. F60 measured a median 60 s; a scenario
 *  needs only enough to see two counts and press Stop. */
const WEAVE_MS = 4500;

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
    // ✦ (#71) asks for an idea per mode under a schema, and gets four the scenario can tell apart.
    if (!body.stream && body.response_format?.json_schema?.schema?.properties?.ideas)
      return json({ choices: [{ message: { content: JSON.stringify({ ideas: {
        speak: '"The first fake idea: the door opens on its own."',
        act: 'The second fake idea: someone is already inside.',
        direct: 'The third fake idea: the key will not turn back.',
        narrate: 'The fourth fake idea: the rain comes in after them.' } }) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 30 } });
    // #100 · TALK WHILE A TALE IS SET UP, told apart by its own operation list (only the draft can
    // remove a thread). Answered by the writer's words: "darker" asks for a change to the premise;
    // anything else is a question, answered with one thread offered.
    const ops = body.response_format?.json_schema?.schema?.properties?.changes?.items?.properties?.op?.enum ?? [];
    if (!body.stream && ops.includes('thread.remove')) {
      // The writer's words are the last paragraph of the ask; earlier turns ride above them.
      const said = String(body.messages?.at(-1)?.content ?? '').split('\n\n').at(-1) ?? '';
      const answer = /darker/i.test(said)
        ? { reply: 'The premise is darker now.',
            changes: [{ op: 'tale.set', field: 'premise', text: 'The fake router made this premise darker.' }] }
        : { reply: 'The fake router answers: the harbour needs a keeper.',
            entries: [{ title: 'The Harbour Keeper', type: 'character', body: 'Keeps the harbour lamps lit.' }] };
      return json({ choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 30 } });
    }
    // #159 · TALK IN A TALE, told apart by an operation only a tale has. "a slow voice" asks for Marek's
    // voice, and the answer also offers a thread nobody asked for: one done card and one chalked card.
    if (!body.stream && ops.includes('hem.start')) {
      const said = String(body.messages?.at(-1)?.content ?? '').split('\n\n').at(-1) ?? '';
      const answer = /slow voice/i.test(said)
        ? { reply: 'Marek speaks slowly now.', changes: [{ op: 'thread.set', thread: 'Marek Vale', room: 'voice', text: 'Slow, and every word counted.' }],
            entries: [{ title: 'The Lamplighter', type: 'character', body: 'Lights the quay lamps at dusk.', keys: ['Lamplighter'], field: 'none' }] }
        : { reply: 'The fake router answers: Marek lent the money.' };
      return json({ choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 30 } });
    }
    if (!body.stream) return json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 1 } });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const prose = () => {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'The fake router wrote this.' },
        finish_reason: 'stop' }] })}\n\n`);
      res.end('data: [DONE]\n\n');
    };
    // #55. A WEAVING CALL PLANS FIRST, so this one does: a plan in pieces for WEAVE_MS, the way the
    // real router streams one, then the prose. Long enough for a scenario to watch the count run and
    // to press Stop in the middle of it. A stopped call closes the socket, and the plan stops with it.
    if (body.chat_template_kwargs?.enable_thinking !== true) return prose();
    const started = Date.now();
    const plan = setInterval(() => {
      if (Date.now() - started >= WEAVE_MS) { clearInterval(plan); return prose(); }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'The plan, unseen. ' } }] })}\n\n`);
    }, 250);
    res.on('close', () => clearInterval(plan));
  });
});
srv.listen(0, '127.0.0.1', () => writeFileSync(portFile, String((srv.address() as any).port)));
