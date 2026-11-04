// A reroll that opens like the take it replaces is asked again (#140), behind ANANSI_REROLL_AWAY.
//
// F66: one reroll in six starts with the rejected take's first five narration words, and every
// flagged repeat read by eye copied the OPENING and then went elsewhere. A reroll sends the prompt
// that wrote the take, byte for byte (docs/adr/0012), so its opening is drawn from the same
// distribution. What is under test is the wire: how many prose calls a reroll makes, with which
// seeds, which take comes back, and that nothing changes with the switch off.
//
// Driven against a FAKE llama-server that answers from a queue.
//
//   node --experimental-strip-types test/away.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-away.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;
delete process.env.ANANSI_REROLL_AWAY;

/** The prose calls the fake was sent, in order, with their seeds. */
let calls: { seed: number; stream: boolean }[] = [];
/** What the fake answers, one per prose call; the last one repeats when the queue runs dry. */
let answers: string[] = [];

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });
    if (b.response_format) return send({ choices: [{ message: { content: JSON.stringify({ entries: [] }) } }] });
    if (b.max_tokens === 1) return send({ choices: [{ message: { content: '' } }] });
    // The landing's ending: the passage so far comes back as the model's own turn.
    const ending = (b.messages?.length ?? 0) > 2;
    if (!ending) calls.push({ seed: b.seed, stream: !!b.stream });
    const text = ending ? 'And there it ends.' : answers.length > 1 ? answers.shift()! : answers[0];
    if (!b.stream) return send({ choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 200, completion_tokens: 40 } });
    // A word a frame, a few milliseconds apart, as a real stream arrives. STALL sends three words
    // and then nothing, so a Stop can land while the gate is still holding them.
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const stall = text.startsWith('STALL'), split = text.startsWith('SPLIT');
    // SPLIT sends three characters a frame, so a word arrives in pieces, as tokens do.
    const words = split ? text.slice(5).trim().match(/[\s\S]{1,3}/g) ?? []
      : (stall ? text.slice(5).trim() : text).match(/\S+\s*/g) ?? [];
    let i = 0, gone = false;
    res.on('close', () => { gone = true; });
    const next = () => {
      if (gone) return;
      if (stall && i === 3) return;
      if (i < words.length) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: words[i++] } }] })}\n\n`); setTimeout(next, 2); return; }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 200, completion_tokens: 40 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    };
    next();
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

// Imported AFTER the host is set: llama.ts reads it once, at module load.
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { openingOf } = await import('../src/context.ts');
const { DatabaseSync } = await import('node:sqlite');

const me = db.owner('away');
const s = db.createStory(me, { title: 'Away', premise: 'A city on a dead god.' }) as any;
db.addPassage({ ...s, storyId: s.id, body: 'The lower tiers still pulse.' });
const REPLACED = 'The door sighs shut behind them, sealing out the wet breath of the city. Seraphine waits.';
const take = db.addPassage({ ...s, storyId: s.id, body: REPLACED, author: 'model' }) as any;
const takeId = String(take?.id ?? take);
const SAME = 'The door sighs shut behind them, and this time the lamp is lit. She does not wait.';
const OTHER = 'Seraphine crosses to the chair and rests one gloved hand on its back.';

const ctx = (body: any) => ({ body, query: new URLSearchParams(), owner: me,
  slot: { global: 100096, slots: 2, perSlot: 50048 },
  gen: { temperature: 0.85, top_p: 0.95, target_words: 0, max_tokens: 900 }, setGen: () => {} }) as any;
const reroll = async (extra: any = {}) => {
  calls = [];
  return routes['POST /api/generate'](ctx({ storyId: s.id, mode: 'continue', regenerateOf: takeId, ...extra })) as any;
};

let n = 0;
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only: "${m}"`);
  n++; console.log(`  ok  ${m}`);
};

// ---- THE PREDICATE: the first five narration words, as F66 measured them (bench/echo.ts uses it).
{
  assert.strictEqual(openingOf(REPLACED), 'the door sighs shut behind');
  assert.strictEqual(openingOf(REPLACED), openingOf(SAME), 'OPENING-SAME: the two takes open alike');
  assert.notStrictEqual(openingOf(OTHER), openingOf(REPLACED), 'OPENING-OTHER: a take that opens elsewhere does not');
  assert.strictEqual(openingOf('"Sit," she says. The DOOR, sighs shut behind them.'), 'she says the door sighs',
    'OPENING-NARRATION: dialogue is left out, case and punctuation do not count');
  assert.strictEqual(openingOf('Too short here.'), '', 'OPENING-SHORT: under five words there is no opening to match');
  ok('a take\'s opening is its first five narration words');
}

// ---- THE CONTROL: switch off, the reroll is one call whatever it says.
{
  answers = [SAME, OTHER];
  const r = await reroll();
  assert.ok(!r.error, r.error);
  assert.strictEqual(calls.length, 1, `AWAY-OFF: one prose call with the switch off (${calls.length})`);
  assert.strictEqual(r.prose, SAME, 'AWAY-OFF: and its take comes back as it is');
  assert.strictEqual(r.away, undefined, 'AWAY-OFF: and says nothing about asking again');
  const m = await routes['POST /api/manifest'](ctx({ storyId: s.id, mode: 'continue', regenerateOf: takeId, count: false })) as any;
  assert.strictEqual(m.away, false, 'AWAY-MANIFEST-OFF: the manifest says the switch is off');
  ok('with the switch off a reroll is one call, as before');
}

process.env.ANANSI_REROLL_AWAY = '1';
// ---- THE TREATMENT: an answer that opens like the replaced take is asked for again, on a new seed.
{
  const m = await routes['POST /api/manifest'](ctx({ storyId: s.id, mode: 'continue', regenerateOf: takeId, count: false })) as any;
  assert.strictEqual(m.away, true, 'AWAY-MANIFEST-ON: the manifest says the switch is on, so an arm can be checked before it runs');
  const plain = await routes['POST /api/manifest'](ctx({ storyId: s.id, mode: 'continue', count: false })) as any;
  assert.strictEqual(plain.away, undefined, 'AWAY-MANIFEST-FIRST: and says nothing for a first take');

  answers = [SAME, OTHER];
  const r = await reroll();
  assert.strictEqual(calls.length, 2, `AWAY-RETRY: a same opening is asked again (${calls.length} calls)`);
  assert.notStrictEqual(calls[0].seed, calls[1].seed, 'AWAY-SEED: on a new seed');
  assert.strictEqual(r.prose, OTHER, 'AWAY-RETRY: and the take that opens elsewhere comes back');
  assert.deepStrictEqual(r.away, { retried: 1, seeds: [calls[0].seed] }, 'AWAY-SAYS: the answer says it asked again, with the seed it left');

  answers = [OTHER];
  const fresh = await reroll();
  assert.strictEqual(calls.length, 1, 'AWAY-FRESH: an answer that opens elsewhere is not asked again');
  assert.strictEqual(fresh.away, undefined, 'AWAY-FRESH: and says nothing');

  answers = [SAME];
  const stuck = await reroll();
  assert.strictEqual(calls.length, 3, `AWAY-LIMIT: asked again twice at most, three calls in all (${calls.length})`);
  assert.strictEqual(stuck.prose, SAME, 'AWAY-LIMIT: and the last answer comes back rather than an error');
  assert.strictEqual(stuck.away.retried, 2, 'AWAY-LIMIT: saying so');

  answers = [SAME];
  calls = [];
  const first = await routes['POST /api/generate'](ctx({ storyId: s.id, mode: 'continue' })) as any;
  assert.ok(!first.error && calls.length === 1, 'AWAY-FIRST-TAKE: a first take is never asked again: there is nothing it replaces');

  ok('with the switch on a reroll that opens like the take it replaces is asked again, twice at most');
}

// ---- THE STREAM GATE: a streamed reroll holds its first words back until it has five narration
// words, and a same opening is asked again before any of them reaches the page.
/** A fresh take to reroll each time: a streamed reroll lands a version, which then stands in the slot. */
const fresh = () => { const t = db.addPassage({ ...s, storyId: s.id, body: REPLACED, author: 'model' }) as any; return String(t?.id ?? t); };
const streamed = async (extra: any = {}, signal?: AbortSignal, onPage?: (d: string) => void) => {
  calls = [];
  const c = ctx({ storyId: s.id, mode: 'continue', regenerateOf: fresh(), stream: true, ...extra });
  if (signal) c.signal = signal;
  const page: string[] = [];
  const h = await routes['POST /api/generate'](c) as any;
  const last = await h.__stream((o: any) => { if (o?.d) { page.push(o.d); onPage?.(o.d); } });
  return { last, page: page.join(''), id: c.body.regenerateOf };
};
const kept = (id: string) => {
  const d = new DatabaseSync(DB, { readOnly: true });
  try { return d.prepare('SELECT body FROM stopped_takes WHERE replaced = ?').all(id) as any[]; } finally { d.close(); }
};
{
  delete process.env.ANANSI_REROLL_AWAY;
  answers = [SAME, OTHER];
  const off = await streamed();
  assert.strictEqual(calls.length, 1, `GATE-OFF: with the switch off a streamed reroll is one call (${calls.length})`);
  assert.strictEqual(off.page, SAME, 'GATE-OFF: and the page sees every word of it');

  process.env.ANANSI_REROLL_AWAY = '1';
  answers = [SAME, OTHER];
  const g = await streamed();
  assert.strictEqual(calls.length, 2, `GATE-RETRY: a same opening on a stream is asked again (${calls.length} calls)`);
  assert.ok(calls.every((x) => x.stream), 'GATE-RETRY: both calls streamed');
  assert.notStrictEqual(calls[0].seed, calls[1].seed, 'GATE-SEED: on a new seed');
  assert.strictEqual(g.page, OTHER, `GATE-PAGE: the page sees only the new take, never the copied opening (${g.page})`);
  assert.strictEqual(g.last.prose, OTHER, 'GATE-PROSE: and the new take is the one that lands');
  assert.deepStrictEqual(g.last.away, { retried: 1, seeds: [calls[0].seed] }, 'GATE-SAYS: the answer says it asked again');
  assert.ok(g.last.passageId && (db.db.prepare('SELECT body FROM passages WHERE id = ?').get(g.last.passageId) as any)?.body === OTHER,
    'GATE-SAVED: the version saved is the new take');

  answers = ['SPLIT ' + SAME, OTHER];
  const split = await streamed();
  assert.strictEqual(split.page, OTHER, `GATE-SPLIT: a fifth word that arrives in pieces is read whole before the gate decides (${split.page})`);

  answers = [OTHER];
  const f = await streamed();
  assert.ok(calls.length === 1 && f.page === OTHER && f.last.away === undefined,
    'GATE-FRESH: a take that opens elsewhere streams whole, on one call');

  answers = [SAME];
  const stuck = await streamed();
  assert.strictEqual(calls.length, 3, `GATE-LIMIT: asked again twice at most (${calls.length})`);
  assert.strictEqual(stuck.page, SAME, 'GATE-LIMIT: and the last take reaches the page once, whole');

  answers = ['Too short here.'];
  const short = await streamed();
  assert.strictEqual(short.page, 'Too short here.', 'GATE-SHORT: a take that ends inside the hold is released to the page');

  // STOP DURING THE HOLD: the call stops, the page saw nothing, so nothing is kept as stopped.
  answers = ['STALL The door sighs shut behind them'];
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 60);
  const st = await streamed({}, ac.signal);
  assert.ok(st.last.aborted, 'GATE-STOP: Stop during the hold stops the reroll');
  assert.ok(calls.length === 1 && st.page === '', `GATE-STOP: on one call, with nothing on the page (${calls.length}, ${st.page})`);
  assert.strictEqual(kept(st.id).length, 0, 'GATE-STOP-KEPT: and nothing is kept, since the page showed nothing');

  // STOP AFTER THE RELEASE: what the page saw is what is kept, held words included.
  const ac2 = new AbortController();
  answers = [OTHER + ' ' + 'word '.repeat(200) + 'STALLED'];
  let n2 = 0;
  const st2 = await streamed({}, ac2.signal, () => { if (++n2 === 3) ac2.abort(); });
  assert.ok(st2.last.aborted, 'GATE-STOP-LATE: stopped after the gate let the take through');
  const k2 = kept(st2.id);
  assert.ok(k2.length === 1 && k2[0].body === st2.page && st2.page.startsWith('Seraphine crosses to the chair'),
    `GATE-STOP-LATE: the kept words are exactly what the page showed (${k2[0]?.body})`);

  // LANDING still works behind the gate: a long take past the slider is stopped and given its ending.
  const withSlider = async () => {
    calls = [];
    const c = ctx({ storyId: s.id, mode: 'continue', regenerateOf: fresh(), stream: true });
    c.gen = { ...c.gen, target_words: 20 };
    const page: string[] = [];
    const h = await routes['POST /api/generate'](c) as any;
    const last = await h.__stream((o: any) => { if (o?.d) page.push(o.d); });
    return { last, page: page.join('') };
  };
  answers = [SAME + ' ' + 'more '.repeat(40), OTHER + ' ' + 'on and on. '.repeat(20)];
  const land = await withSlider();
  assert.ok(!land.page.includes('door sighs'), 'GATE-LAND: the copied opening never reaches the page');
  assert.ok(land.page.startsWith('Seraphine') && land.page.trimEnd().endsWith('And there it ends.'),
    `GATE-LAND: the new take streams and lands with its ending (${land.page})`);
  assert.strictEqual(land.last.prose.replace(/\s+/g, ' '), land.page.replace(/\s+/g, ' ').trim(), 'GATE-LAND: and what landed is what the page showed');
  ok('a streamed reroll holds its opening, asks again on a same one before the page sees it, and Stop and landing still work');
}
delete process.env.ANANSI_REROLL_AWAY;

console.log(`\n${n} checks passed`);
srv.close();
