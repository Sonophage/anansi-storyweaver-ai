// Streaming prose. Driven against a FAKE llama-server, because the two things worth testing
// here cannot be produced by asking the real model nicely:
//
//   1. a `data:` frame split across two network reads — the classic way a hand-written SSE
//      reader drops a token, and it depends on packet timing, not on the prompt;
//   2. an error arriving mid-stream, after the 200 has already gone out.
//
//   node --experimental-strip-types test/stream.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { readSSE } from '../src/llama.ts';

let n = 0;
const ok = (m: string, f: () => any) => Promise.resolve(f())
  .then(() => { n++; console.log(`  ok  ${m}`); },
        (e) => { console.error(`  RED ${m}\n      ${e?.message ?? e}`); process.exitCode = 1; });

/** Serve one SSE body written exactly as `writes` says, so a frame can be cut anywhere. */
const serve = (writes: string[]) => new Promise<string>((done) => {
  const s = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let i = 0;
    const next = () => {
      if (i >= writes.length) { res.end(); s.close(); return; }
      res.write(writes[i++]);
      // A real socket delivers these separately. Same-tick writes coalesce into one read and
      // the split this test exists to produce would never happen.
      setTimeout(next, 4);
    };
    next();
  }).listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(s.address() as any).port}`));
});

const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
const delta = (content: string) => frame({ choices: [{ delta: { content } }] });

await ok('every delta arrives, in order, and the prose is their concatenation', async () => {
  const url = await serve([
    delta('The rain '), delta('had not '), delta('stopped.'),
    frame({ choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1200, completion_tokens: 9 },
            timings: { predicted_per_second: 31.5 } }),
    'data: [DONE]\n\n',
  ]);
  const seen: string[] = [];
  const r = await readSSE(await fetch(url, { method: 'POST' }), (d) => seen.push(d));
  assert.deepStrictEqual(seen, ['The rain ', 'had not ', 'stopped.'],
    'the writer must see the passage arrive in pieces — that is the whole feature');
  assert.strictEqual(r.prose, 'The rain had not stopped.');
  // Without these the generations table logs nulls and F-series latency work loses its input.
  assert.strictEqual(r.usage.completion_tokens, 9, 'usage rides the final chunk');
  assert.strictEqual(r.timings.predicted_per_second, 31.5, 'so do the timings');
});

await ok('a frame split across two reads is not dropped', async () => {
  const whole = delta('sideways off the water');
  const cut = Math.floor(whole.length / 2);
  const url = await serve([
    delta('The rain came '),
    whole.slice(0, cut),          // half a JSON object, and nothing else in this read
    whole.slice(cut),
    'data: [DONE]\n\n',
  ]);
  const r = await readSSE(await fetch(url, { method: 'POST' }), () => {});
  assert.strictEqual(r.prose, 'The rain came sideways off the water',
    'the half-frame must be held until the rest of it arrives, not parsed and discarded');
});

await ok('a mid-stream error throws instead of returning half a passage', async () => {
  const url = await serve([
    delta('The rain came '),
    frame({ error: { message: 'Context size has been exceeded' } }),
  ]);
  // The 200 is long gone by now, so this cannot be a status code. Returning the prose written
  // so far would hand the writer a truncated passage and call it finished.
  const res = await fetch(url, { method: 'POST' });
  await assert.rejects(() => readSSE(res, () => {}), /Context size has been exceeded/);
});

await ok('a stream that stops early yields what arrived, and the caller sees no final line',
  async () => {
    // The final chunk is what carries usage, timings and finish_reason. The client treats a
    // stream with no final line as an error (`the model stopped before it finished`); this
    // asserts the transport itself does not invent one.
    const url = await serve([delta('The rain came '), delta('sideways.')]);
    const r = await readSSE(await fetch(url, { method: 'POST' }), () => {});
    assert.strictEqual(r.prose, 'The rain came sideways.');
    assert.deepStrictEqual(r.usage, {}, 'no usage was sent, so none is reported');
  });

await ok('a heartbeat comment and a blank line are not mistaken for prose', async () => {
  const url = await serve([': ping\n\n', delta('One.'), '\n', 'data: [DONE]\n\n']);
  const seen: string[] = [];
  const r = await readSSE(await fetch(url, { method: 'POST' }), (d) => seen.push(d));
  assert.deepStrictEqual(seen, ['One.']);
  assert.strictEqual(r.prose, 'One.');
});

console.log(`\n${n} checks passed`);
