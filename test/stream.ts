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
// `chat()` talks to whatever ANANSI_LLAMA named WHEN src/llama.ts was first imported — the host
// is read once, at module scope. So the fake has to be listening before the import, which is why
// this one import is dynamic and the server below is started at the top of the file rather than
// inside the check that uses it.
const stopFake = await (async () => {
  const state = { closedEarly: false, finished: false, deltas: 0, unload: null as any,
    // Scripted JSON answers for the non-streaming path, shifted one per call, and a count of how
    // many were asked for. `structuredRetry`'s whole job is deciding whether to ask twice.
    json: [] as string[], jsonCalls: 0 };
  const s = createServer((_req, res) => {
    // The release path. Recorded rather than merely answered, because the URL and the body shape
    // were read off a live router by probing, not out of documentation — so the thing worth
    // pinning is that we still send exactly what that probe found.
    // The model list, so the ORDER it comes back in can be asserted. Deliberately shuffled here:
    // the router answers in its own order and the point is that neither it nor the fake decides
    // what the picker shows.
    if (_req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return void res.end(JSON.stringify({ data: [
        { id: 'Wayfarer-2-RPNT-12B', status: { value: 'unloaded' } },
        { id: 'Qwen3.6-WNTH-35B-A3B-NN', status: { value: 'loaded' } },
        { id: 'Harbinger-RPNTH-24B', status: { value: 'unloaded' } },
        { id: 'Artemis-1.1-RPNTH-31B-NN', status: { value: 'sleeping' } },
        { id: 'Gemma-4-WNTH-31B-NN', status: { value: 'unloaded' } },
      ] }));
    }
    if (_req.url === '/models/unload') {
      let raw = '';
      _req.on('data', (d) => { raw += d; });
      return void _req.on('end', () => {
        const body = JSON.parse(raw || '{}');
        state.unload = { method: _req.method, body };
        // A router that refuses, on demand — the real one answers 400 "model is not found" for an
        // id it does not serve, and that path has to come back as a value rather than a throw.
        if (body.model === 'REFUSE-ME') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: { message: 'model is not found' } }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    }
    // The non-streaming path, only when a script has been loaded. Everything else still streams,
    // so no existing check changes.
    if (state.json.length) {
      state.jsonCalls++;
      const content = state.json.shift()!;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return void res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let i = 0;
    const t = setInterval(() => {
      if (i++ >= 40) {
        clearInterval(t);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        state.finished = true;
        return res.end();
      }
      state.deltas++;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'word ' } }] })}\n\n`);
    }, 15);
    // The socket going before the body finished IS the abort arriving at the model's end. This
    // is the only assertion that can tell "the page stopped listening" from "the box stopped
    // generating", and those are the two things the Stop button has to do in that order.
    res.on('close', () => { clearInterval(t); if (!state.finished) state.closedEarly = true; });
  });
  const url = await new Promise<string>((done) =>
    s.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(s.address() as any).port}`)));
  return { url, state, close: () => s.close() };
})();
process.env.ANANSI_LLAMA = stopFake.url;
const { readSSE, reach, chat, unload, models, structuredRetry } = await import('../src/llama.ts');

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

await ok('only `data:` lines are prose', async () => {
  // The JSON payload on the `event:` line is contrived — llama-server does not send one. It is
  // what makes this assertion able to fail: without it, a broken `data:` guard is invisible,
  // because every other non-data line is unparseable anyway and skipped for the wrong reason.
  const url = await serve([
    ': ping\n\n',
    `event: ${JSON.stringify({ choices: [{ delta: { content: 'NOT PROSE' } }] })}\n\n`,
    delta('One.'), '\n', 'data: [DONE]\n\n',
  ]);
  const seen: string[] = [];
  const r = await readSSE(await fetch(url, { method: 'POST' }), (d) => seen.push(d));
  assert.deepStrictEqual(seen, ['One.'], 'a comment and a non-data frame contribute nothing');
  assert.strictEqual(r.prose, 'One.');
});

// ---- what the writer is told when the model is not there ----
//
// `--sleep-idle-seconds 900` means a writer coming back after lunch is the MOST likely caller to
// hit a failure, and Node's own message for it is the string `fetch failed`, which went all the
// way to a toast in the composer. F24 recorded it; these two say what replaced it.

await ok('an unreachable llama-server says what to do, not "fetch failed"', async () => {
  // Port 1 is privileged and nothing listens on it: a refused connection, not a timeout.
  await assert.rejects(() => reach('http://127.0.0.1:1/v1/models', {}), (e: any) => {
    assert.doesNotMatch(e.message, /^fetch failed$/, 'the bare Node message must not reach a toast');
    assert.match(e.message, /cannot reach llama-server/);
    assert.match(e.message, /Preferences/, 'and it must name the screen that can fix it');
    return true;
  });
});

await ok('a server that is merely slow is not reported as a missing one', async () => {
  // A model that was asleep takes a minute to load and answers nothing meanwhile. Telling
  // someone to restart a server that is busy loading is how a 60-second wait becomes a
  // five-minute one.
  const hang = createServer(() => { /* accept, never answer */ });
  await new Promise<void>((r) => hang.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(hang.address() as any).port}/`;
  await assert.rejects(() => reach(url, { signal: AbortSignal.timeout(80) }),
    /did not answer in time/);
  hang.close();
});

// ---- Stop: the writer's half, and the model's half ----
//
// Aborting the browser's fetch is the easy half and it is not the feature. The feature is that
// the call to llama-server ends too: two slots, so a writer who stops and starts again is
// otherwise racing their own abandoned generation for the shared cache, and F13's margin was
// measured with two writers, not three.

await ok('Stop ends the call to the model, not only the page', async () => {
  const ac = new AbortController();
  let seen = 0;
  await assert.rejects(
    () => chat('system', 'body', {}, () => { if (++seen === 3) ac.abort(); }, ac.signal),
    (e: any) => {
      assert.ok(e?.name === 'AbortError' || /abort/i.test(String(e?.message)),
        `stopping must abort the call, not fail some other way: ${e?.name} ${e?.message}`);
      return true;
    });
  // The close travels over a socket, so it is not instant. Bounded wait rather than a sleep.
  for (let i = 0; i < 100 && !stopFake.state.closedEarly; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(stopFake.state.closedEarly,
    'llama-server never saw the connection go — the box is still generating into a slot nobody reads');
  assert.ok(!stopFake.state.finished, 'and it must not have been allowed to finish first');
  assert.ok(seen >= 3, 'the writer saw the prose arriving before they stopped it');
});

await ok('a generation nobody stops still runs to the end', async () => {
  // The inverse, and the one that matters more: `AbortSignal.any` composes the writer's stop with
  // the 900-second ceiling, and getting that wrong the other way aborts every generation the
  // moment it starts. A stop signal that is never fired must change nothing.
  stopFake.state.closedEarly = false; stopFake.state.finished = false;
  const never = new AbortController();
  const r = await chat('system', 'body', {}, () => {}, never.signal);
  assert.match(r.prose, /word/, 'the prose must arrive whole');
  assert.ok(stopFake.state.finished, 'and the model must have been left to finish');
  assert.ok(!stopFake.state.closedEarly, 'with nothing cut short');
});
await ok('the fifteen-minute ceiling survives being composed with Stop', async () => {
  // The failure this exists for is `stop ?? AbortSignal.timeout(...)`: it stops on Stop, it looks
  // right, and it silently drops the ceiling from every generation a writer is watching — leaving
  // a hung llama-server to hold the connection open forever with nothing to end it.
  const never = new AbortController();
  await assert.rejects(
    () => chat('system', 'body', {}, () => {}, never.signal, 60),
    (e: any) => {
      assert.match(String(e?.message), /did not answer in time|abort/i,
        `a stop signal must not replace the ceiling: ${e?.name} ${e?.message}`);
      return true;
    });
});

await ok('releasing a model asks the router the way the router actually answers', async () => {
  // MEASURED on build b10566, 2026-08-27: POST /models/unload with {model} exists and answers
  // 400 "model is not found" for an id it does not serve. The comment in llama.ts said the router
  // had no unload endpoint at all, and Preferences said so on screen — both written against an
  // older build. This check is what stops that drifting back.
  const r = await unload('write-nt-qwen36-h');
  assert.strictEqual(r.ok, true, `the release must succeed against a router that answers: ${r.error}`);
  assert.ok(stopFake.state.unload, 'and it must actually call /models/unload — nothing else releases one');
  assert.strictEqual(stopFake.state.unload.method, 'POST', 'as a POST');
  assert.deepStrictEqual(stopFake.state.unload.body, { model: 'write-nt-qwen36-h' },
    'with the model named as `model`, which is the key the router reads');
});

await ok('a router that refuses a release says so, and does not throw', async () => {
  // A model that will not unload is a model that sleeps in 900 seconds instead, which is exactly
  // what happened before any of this existed. Throwing here would fail the model switch the writer
  // actually asked for, over a tidy-up they did not — making the feature worse than not having it.
  const r = await unload('REFUSE-ME');
  assert.strictEqual(r.ok, false, 'a 400 from the router is a refusal, not a success');
  assert.match(String(r.error), /400|not found/, `and it carries what the router said: ${r.error}`);
});

await ok('the models with Seth\'s -NN tag come first, and the rest are alphabetical', async () => {
  const ids = (await models()).map((m) => m.id);
  assert.deepStrictEqual(ids, [
    'Artemis-1.1-RPNTH-31B-NN', 'Gemma-4-WNTH-31B-NN', 'Qwen3.6-WNTH-35B-A3B-NN',
    'Harbinger-RPNTH-24B', 'Wayfarer-2-RPNT-12B',
  ], 'the -NN ones first, then the rest by name — the router answers in neither order');
  // The tag is Seth's, not something this app understands, so it is a sort key and nothing more:
  // if it stops meaning anything the list falls back to alphabetical rather than to arbitrary.
  assert.ok(ids.slice(3).every((id, i, r) => i === 0 || r[i - 1].localeCompare(id) < 0),
    'and what is left is in name order, not in the order the router happened to answer');
});


// A grammar cannot return the wrong SHAPE, which is why structuredRetry only ever retried a parse
// failure. It can still return an EMPTY one: JSON Schema's `required` means the key is present,
// not that it holds anything, so {"title":"...","note":""} satisfies CHAPTER_SCHEMA completely.
// That reached a writer on 2026-08-28 as a named chapter with a blank beat and a toast saying
// Anansi had suggested both — the beat being the half that rides near the generation point on
// every call of that chapter. test/ui/ritual.js caught it only because it asserts a LENGTH.
await ok('a schema-valid but empty answer is asked again, and the second one is taken', async () => {
  stopFake.state.json = [JSON.stringify({ title: 'The Iron Bridge', note: '' }),
                         JSON.stringify({ title: 'The Iron Bridge', note: 'x'.repeat(80) })];
  stopFake.state.jsonCalls = 0;
  const usable = (d: any) => String(d?.note ?? '').trim().length >= 40;
  const r = await structuredRetry('sys', 'body', {}, {}, usable);
  assert.strictEqual(stopFake.state.jsonCalls, 2,
    `asked ${stopFake.state.jsonCalls} time(s). An answer the caller cannot use has to be asked `
    + 'again — parseable is not the same as usable, and only the caller knows the difference.');
  assert.strictEqual(r.data.note.length, 80, 'and the usable answer is the one handed back');
});

await ok('a usable answer is not asked twice, and no predicate keeps the old behaviour', async () => {
  stopFake.state.json = [JSON.stringify({ title: 'Fine', note: 'y'.repeat(80) })];
  stopFake.state.jsonCalls = 0;
  await structuredRetry('sys', 'body', {}, {}, (d: any) => String(d?.note ?? '').length >= 40);
  assert.strictEqual(stopFake.state.jsonCalls, 1, 'a good answer costs one call, not two');

  // The default path is untouched, which is what lets this ship without a retry appearing on
  // every other caller — an empty string is a legitimate answer in most of these schemas and a
  // second call costs about seven seconds.
  stopFake.state.json = [JSON.stringify({ title: 'Fine', note: '' })];
  stopFake.state.jsonCalls = 0;
  const r = await structuredRetry('sys', 'body', {});
  assert.strictEqual(stopFake.state.jsonCalls, 1,
    'with no predicate an empty field is still a valid answer and must not cost a second call');
  assert.strictEqual(r.data.note, '', 'and it comes back as it arrived');
});

await ok('two unusable answers are reported as unusable, not as unparseable', async () => {
  stopFake.state.json = [JSON.stringify({ title: 'A', note: '' }), JSON.stringify({ title: 'A', note: '' })];
  stopFake.state.jsonCalls = 0;
  const r = await structuredRetry('sys', 'body', {}, {}, (d: any) => String(d?.note ?? '').length >= 40);
  assert.strictEqual(stopFake.state.jsonCalls, 2, 'it still only asks twice');
  assert.match(String(r.error ?? ''), /cannot use/,
    'and says which failure it was. "unparseable JSON" would send whoever reads it to the grammar, '
    + 'which parsed perfectly both times.');
  stopFake.state.json = [];
});

stopFake.close();

console.log(`\n${n} checks passed`);
