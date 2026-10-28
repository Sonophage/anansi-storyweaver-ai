// The contradiction check: what it is shown, what it stores, and that it is NOT on the way to the
// page. This file was test/mend.ts until 2026-08-31, when the blocking repair in `generate` was
// removed — F30 measured it at a flat 1,456 ms on every take, firing 0 repairs in 6, and it ran on
// every variant, which SPEC §8.4 says not to do. The detector runs detached on the take that lands
// (from `POST /api/accept` or the streamed `generate`, #69) and files a flag. The repair is gone: it
// cannot rewrite prose the writer is already reading.
//
// Driven against a FAKE llama-server, because what is under test is WHICH calls are made and what
// they are told — never something the real model can be asked for reliably. The fake answers by
// shape: a request carrying a json_schema is the check, anything else is the prose.
//
//   node --experimental-strip-types test/check.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-check.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;
// The landed-passage check is off by default since 2026-10-27; this suite tests it, so it turns it on.
process.env.ANANSI_CANON_CHECK = '1';

const CANON = 'Vel is the Murmur. She has never been anyone else.';
const BROKEN = 'She was no longer the Murmur, and the city knew it.';

/** What the fake was asked, in order, so a test can assert which calls were made at all. */
let calls: any[] = [];
let reply: any = { prose: BROKEN, found: 1, inDialogue: false, canon: 1 };
// THE SECOND LOOK NEEDS THE DETECTOR TO ANSWER DIFFERENTLY THE SECOND TIME, which one global
// `found` cannot express. When this is set, each check call shifts one answer off it: `[1, 0]` is
// a repair that worked, `[1, 1]` one that did not, `[1, 2]` one that made it worse. Null means
// every check answers `reply.found`, which is what every test before the repair ones relies on.
let foundSeq: (number | 'junk')[] | null = null;
let holdCheck: Promise<void> | null = null;

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o)); };
    // The budget check. A short count so nothing overflows; the real number is not what this
    // file is about.
    if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });

    const system = b.messages?.[0]?.content ?? '';
    const user = b.messages?.[1]?.content ?? '';
    const kind = b.response_format ? 'check' : 'prose';
    calls.push({ kind, system, user, maxTokens: b.max_tokens, model: b.model });
    // A held check answers only once the test lets it, so a test can see what the writer has
    // before the check is done. Null answers at once, which every test before section 6 relies on.
    if (kind === 'check' && holdCheck) { const gate = holdCheck; return void gate.then(() => answer()); }
    answer();
    function answer() {
    // Shifted BEFORE the content is built, so a sequence that runs out falls back rather than
    // silently repeating the last answer.
    const seq = kind === 'check' && foundSeq?.length ? foundSeq.shift()! : null;
    // An unparseable answer is the OTHER way `contradictionsIn` fails: it returns `{found: [], error}`,
    // which is the same shape a clean passage makes. `unchecked` is what must come out of it.
    if (seq === 'junk') return send({ choices: [{ message: { content: 'not json at all' } }],
      usage: { prompt_tokens: 200, completion_tokens: 5 } });
    const content =
      kind === 'check' ? JSON.stringify({ contradictions: Array.from({ length: seq ?? reply.found },
          () => ({ canon: reply.canon ?? 1, quote: reply.inDialogue ? `"${BROKEN}"` : BROKEN,
                   why: 'She cannot both be and not be the Murmur.', confidence: 0.9 })) })
      : reply.inDialogue ? `Vel spoke. "${BROKEN}"` : reply.prose;
    // The streamed generation asks with `stream: true` and reads server-sent events.
    if (b.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 200, completion_tokens: 40 } })}\n\n`);
      return res.end('data: [DONE]\n\n');
    }
    send({ choices: [{ message: { content } }], usage: { prompt_tokens: 200, completion_tokens: 40 } });
    }
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

// Imported AFTER the host is set: llama.ts reads it once, at module load.
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');

const me = db.owner('checker');
const story = db.createStory(me, { title: 'Sutera', premise: 'A city on a dead god.', pov: 'second' });
db.upsertEntry(story.id, me, { title: 'The Murmur', body: CANON, activation: 'always_on' });
db.addPassage({ ...story, storyId: story.id, body: 'The lower tiers still pulse.' });

const ctx = (body: any) => ({ body, query: new URLSearchParams(), owner: me,
  slot: { global: 8192, slots: 1, perSlot: 8192 },
  gen: { max_tokens: 400, temperature: 0.85 }, setGen: () => {} }) as any;
const write = async () => {
  calls = [];
  return routes['POST /api/generate'](ctx({ storyId: story.id, mode: 'direct',
    directive: 'She walks into the light.' }));
};
const runCheck = (passageId: string) =>
  routes['POST /api/check'](ctx({ storyId: story.id, passageId }));

let n = 0;
// Message only — assertions run inline above. Passing a callback to THIS `ok` would print a green
// check for a body that never ran. Refused rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

// ---- 1. GENERATION MAKES ONE MODEL CALL. This is the regression guard for the whole change: a
// blocking check here cost F30's 1,456 ms on every take and this is the assertion that goes red if
// one comes back. Falsified by re-adding an `await` on the detector — the count goes to 2.
{
  reply = { prose: BROKEN, found: 1, inDialogue: false, canon: 1 };
  const r: any = await write();
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.prose, BROKEN,
    'the prose the model wrote is the prose the route returns, uncorrected');
  const kinds = calls.map((c) => c.kind);
  assert.deepStrictEqual(kinds, ['prose'],
    `generating must make exactly one model call and it made ${kinds.length}: ${kinds.join(', ')}`);
  assert.strictEqual((r as any).found, undefined,
    'and it reports no contradiction count, because it did not look');
  ok('generating a passage makes one model call and never waits on a check');
}

// ---- 2. dialogue is not narration, here as everywhere else
{
  const spoken = db.addPassage({ ...story, storyId: story.id, body: `Vel spoke. "${BROKEN}"` })!;
  reply = { ...reply, found: 1, inDialogue: true };
  await runCheck(spoken);
  assert.deepStrictEqual(db.violationsOf(story.id).filter((v: any) => v.passage_id === spoken), [],
    'a contradiction inside quotes is a character being wrong, and is not flagged');
  ok('a contradiction spoken by a character is left alone');
}

// ---- 3. the check judges the whole ledger, not only what fired
// Firing used to decide both, so a character who did not fire could be contradicted freely and
// nothing caught it (COUNCIL-04 #7).
{
  // A second entry that CANNOT fire: triggered, on a word that appears nowhere.
  const hidden = db.upsertEntry(story.id, me, { title: 'The Bell', activation: 'triggered',
    keys: ['nobodyeversaysthis'], body: 'The bell has not rung in eleven years.' });
  reply = { ...reply, found: 1, inDialogue: false };
  const probeId = db.addPassage({ ...story, storyId: story.id, body: BROKEN })!;
  calls = [];
  const r: any = await runCheck(probeId);
  assert.ok(!r.error, r.error);
  const canonSent = calls.find((c) => c.kind === 'check')!.user;
  assert.match(canonSent, /has not rung in eleven years/,
    'the check is given the entry that never fired — that is the whole finding');
  assert.match(canonSent, /Vel is the Murmur/, 'and the one that did');
  assert.ok(hidden, 'the fixture really added a second entry');
  ok('the check judges the passage against the whole ledger, not only what fired');

  // The check has to carry `reached` onto the flag it stores, or both faults land on the page as
  // the same red line. Dropping that one field passed every other assertion in this file, which is
  // why this one exists. Its own passage, and its body IS the offending line: the check refuses a
  // quote it cannot find in the text.
  const passageId = db.addPassage({ ...story, storyId: story.id, body: BROKEN })!;

  // Point the contradiction at the entry that never fired. It is last in the ledger, so it is the
  // last fact — the check numbers them in order.
  const nFacts = db.entriesOf(story.id).length;
  reply = { ...reply, canon: nFacts };
  await runCheck(passageId);
  const unseen: any = db.violationsOf(story.id).find((v: any) => v.passage_id === passageId);
  assert.strictEqual(unseen.entry_id, hidden, 'the flag names the entry that never fired');
  assert.strictEqual(unseen.reached, 0,
    'and records that the model was never shown it — the fix is a keyword, not a rewrite');

  // And the other side: a contradiction against canon that DID reach the prompt.
  reply = { ...reply, canon: 1 };
  await runCheck(passageId);
  const seen: any = db.violationsOf(story.id).find((v: any) => v.passage_id === passageId);
  assert.strictEqual(seen.reached, 1, 'canon it was shown and contradicted anyway');
  ok('  and the flag it stores records which of the two faults it is');
}

// ---- 4. OPENING A BOOK WARMS ITS PROMPT, and does it once.
// The cold prefill is ~7.3s against ~0.33s warm and the router sleeps the model at 900s, so this
// is the largest wait a writer meets. It has to be one call, detached, and it must not repeat on
// every repaint — a client that paints twice would otherwise warm twice.
{
  calls = [];
  const open = () => routes['GET /api/story']({ body: {}, query: new URLSearchParams(`story=${story.id}`),
    owner: me, slot: { global: 8192, slots: 1, perSlot: 8192 },
    gen: { max_tokens: 400, temperature: 0.85 }, setGen: () => {} } as any);

  open();
  await new Promise((r) => setTimeout(r, 300));
  const warm = calls.filter((c) => c.kind === 'prose');
  assert.strictEqual(warm.length, 1, `opening a book warms it once, and it made ${warm.length} calls`);
  assert.strictEqual(warm[0].maxTokens, 1,
    'and asks for one token — this is a prefill, not a generation');
  assert.match(warm[0].user, /Vel is the Murmur/,
    'and it sends the real prompt, or it warms a prefix nothing will reuse');
  ok('opening a book warms its prompt once, with nothing to generate');

  calls = [];
  open(); open();
  // 300ms, not 60. At 60 this assertion passed with the throttle DISABLED — the warm call
  // had been started and simply had not reached the fake yet, so an empty `calls` proved
  // nothing. Long enough that a call which is going to happen has happened.
  await new Promise((r) => setTimeout(r, 300));
  assert.deepStrictEqual(calls, [],
    'and re-opening inside the throttle warms nothing — a repainting client must not warm in a loop');
  ok('  and a second open inside the window costs no call at all');
}

// ---- 5. OPENING THE APP WAKES THE WRITER'S OWN MODEL (2026-08-31). Seth: "also need a last model
// selected per user so that warms up when they come to the app." The router sleeps a model at 900
// seconds, so the first thing a writer does in the morning otherwise waits on a 26 GiB load.
//
// GET /api/stories is the app's first call. The warm is detached and throttled per writer, and it
// shares one in-flight flag with the story prewarm above — so this waits for that one to finish
// before it starts, or it would measure the guard rather than the feature.
{
  await new Promise((r) => setTimeout(r, 2000));
  calls = [];
  const shelf = () => routes['GET /api/stories'](ctx({}));
  shelf();
  await new Promise((r) => setTimeout(r, 1500));
  const warm = calls.filter((c) => c.kind === 'prose');
  assert.strictEqual(warm.length, 1, `opening the app wakes the model once, and it made ${warm.length} calls; all kinds seen: ${JSON.stringify(calls.map((c) => c.kind))}`);
  assert.strictEqual(warm[0].maxTokens, 1, 'and asks for one token — this is a wake, not a generation');
  ok('opening the app wakes the writer\'s model, once and detached');

  calls = [];
  shelf(); shelf();
  await new Promise((r) => setTimeout(r, 300));
  assert.deepStrictEqual(calls, [],
    'and a shelf that repaints inside the window wakes nothing — the throttle is per writer');
  ok('  and a repaint inside the window costs no call at all');
}

// ---- 5 · THE REPAIR, AS A PRESS ON THE FLAG. Issue #9, option 2 of three, chosen by Seth on
// 2026-09-01. The blocking repair came off the critical path on 2026-08-31 and stays off — test 1
// above is the guard for that — so this is the same machinery reached by a button instead.
//
// WHAT THE LIVE LIBRARY SAID about the repair before it was removed, from the 12 recorded runs:
// 21 contradictions found, 7 mended, 14 surviving their own repair, 3 of 12 passages coming out
// clean, and 2 of 12 recording `mended: -1` — the second look finding MORE than the first. Every
// one of those outcomes is a case below, because every one of them is a different sentence to say
// to the writer, and saying the wrong one is the whole of #9.
{
  const FIXED = 'She was the Murmur still, and the city knew it.';
  // A "REPAIR" THAT LEFT THE BROKEN LINE IN, which is what 14 of the 21 contradictions in the live
  // library look like. It has to be the fixture rather than just a different `found`, because
  // `contradictionsIn` refuses a quote it cannot find in the text (`text.includes(quote…)`) — so a
  // second look at prose the offending sentence has LEFT reports zero however the fake answers.
  // That filter is why the first version of this test could not express "still wrong": it passed
  // for the wrong reason.
  const STILL = `${BROKEN} The city knew it and said nothing about it either way.`;
  const repair = (passageId: string) =>
    routes['POST /api/repair'](ctx({ storyId: story.id, passageId })) as any;
  const flagsOn = (id: string) => db.violationsOf(story.id).filter((v: any) => v.passage_id === id);
  // A fresh passage per case: the repair adds a VARIANT, so reusing one would stack takes and make
  // the ordinal assertions read someone else's row.
  const broken = () => db.addPassage({ ...story, storyId: story.id, body: BROKEN })!;

  // THE SECOND LOOK EXISTS AT ALL. `mended: found.length` was the original defect — a claim the
  // repair worked, asserted from the fact that one was attempted. Three calls in this order or the
  // number is a guess.
  foundSeq = [1, 0];
  reply = { ...reply, prose: FIXED, found: 1, inDialogue: false, canon: 1 };
  let p = broken();
  calls = [];
  let r = await repair(p);
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(calls.map((c) => c.kind), ['check', 'prose', 'check'],
    'the repair must look, fix, and LOOK AGAIN — without the third call `mended` is a claim');
  // `\s+` because the prompt wraps between "are" and "wrong".
  assert.match(calls[1].system, /Change ONLY the sentences that are\s+wrong/,
    'and the fix is asked for as a correction, not as a rewrite');
  assert.match(calls[1].user, /Canon: /, 'with the canon it broke');
  assert.match(calls[1].user, new RegExp(BROKEN.slice(0, 20)), 'and the words that broke it');
  ok('the repair looks, corrects, and looks again');

  // A REPAIR THAT WORKED. The prose lands as a new TAKE, so the original is one press away.
  assert.strictEqual(r.found, 1);
  assert.strictEqual(r.mended, 1);
  assert.strictEqual(r.unfixed, 0);
  assert.ok(r.passageId && r.passageId !== p, 'the repair is a new take, not an overwrite');
  // `passagesOf` returns the SELECTED take per slot, so the two are counted through the slot map
  // the take switcher itself reads. This is the assertion that says nothing was overwritten.
  const slotOf = (id: string) => [...db.variantsBySlot(story.id).values()]
    .find((takes: any[]) => takes.some((x: any) => x.id === id)) ?? [];
  const takes = slotOf(r.passageId);
  assert.strictEqual(takes.length, 2, `the slot should hold two takes and holds ${takes.length}`);
  assert.ok(takes.some((x: any) => x.id === p && !x.selected),
    'the take before the repair is still there, unselected — one press away in History');
  assert.ok(takes.some((x: any) => x.id === r.passageId && x.selected),
    'and the correction is the one on screen');
  assert.strictEqual(db.passagesOf(story.id).find((x: any) => x.id === r.passageId)?.body, FIXED);
  assert.deepStrictEqual(flagsOn(r.passageId), [], 'nothing is flagged on the corrected take');
  ok('  a repair that worked lands as a take, and the one before it survives');

  // A REPAIR THAT DID NOT. This is the case that used to look identical to a clean run, and it is
  // 14 of the 21 contradictions in the live library.
  foundSeq = [1, 1];
  reply = { ...reply, prose: STILL };
  p = broken();
  r = await repair(p);
  assert.strictEqual(r.mended, 0, 'nothing was mended and it must not claim otherwise');
  assert.strictEqual(r.unfixed, 1);
  assert.strictEqual(flagsOn(r.passageId).length, 1,
    'and what survived is on the board, against the take that is now on screen');
  ok('  a repair that survived its own repair says so, and re-flags the new take');

  // A REPAIR THAT MADE IT WORSE. `mended` is `found - left`, so this is NEGATIVE — and it must
  // stay negative. Two of the twelve rows in the live library are exactly this, and clamping it to
  // zero would turn "the repair introduced a contradiction" into "the repair did nothing".
  foundSeq = [1, 2];
  reply = { ...reply, prose: STILL };
  p = broken();
  r = await repair(p);
  assert.strictEqual(r.mended, -1,
    'a second look finding more than the first is the repair breaking something, and the number '
    + 'has to be able to say so');
  assert.strictEqual(r.unfixed, 2);
  assert.strictEqual(flagsOn(r.passageId).length, 2);
  ok('  a repair that made it worse records a negative count rather than a zero');

  // THE LENGTH FLOOR. The guard against a repair that rewrites instead of correcting: it catches
  // the empty answer, the refusal and the one-line summary. Nothing is written and it says why.
  foundSeq = [1];
  reply = { ...reply, prose: 'She changed.' };
  p = broken();
  const before = db.passagesOf(story.id).length;
  r = await repair(p);
  assert.ok(r.refused, 'a repair shorter than 60% of the passage is a rewrite and must be refused');
  assert.match(String(r.error), /rewrite rather than a correction/);
  assert.strictEqual(r.mended, 0);
  assert.strictEqual(db.passagesOf(story.id).length, before,
    'and a refused repair writes NOTHING — not a variant, not a flag');
  ok('  a repair that came back as a rewrite is refused and nothing is written');

  // THE DETECTOR'S OTHER FAILURE. `contradictionsIn` RETURNS `{found: [], error}` on an answer it
  // cannot parse, which is the same shape a clean passage makes. Reading that as "nothing left"
  // would tell the writer the contradiction is gone on the strength of a reply nobody could read.
  // FOUR answers, and each one is a lesson. The `runCheck` below is itself a check call and shifts
  // one off — getting that wrong sent the junk to the repair's FIRST look, which is a different
  // branch that refuses outright and never reaches `unchecked`. And `structuredRetry` gives an
  // unparseable answer a SECOND GO, so one junk reply is not a failed detector: both attempts have
  // to fail before `contradictionsIn` returns its error shape. The sequence IS the fixture.
  foundSeq = [1, 1, 'junk', 'junk'];
  reply = { ...reply, prose: STILL };
  p = broken();
  await runCheck(p);                       // put a flag on it first, so "left standing" means something
  const stood = flagsOn(p).length;
  assert.strictEqual(stood, 1, 'the fixture really flagged the passage before the repair');
  r = await repair(p);
  assert.ok(r.unchecked, 'a detector that could not answer says nothing either way');
  assert.strictEqual(r.mended, 0, 'and 0 mended, never `found`, because nothing was confirmed');
  assert.strictEqual(r.unfixed, 1, 'the ones it went in with are still assumed to be there');
  // THE BOARD MUST NOT GO QUIET. `db.violationsOf` lists flags on the SELECTED take only, so a
  // repair that lands a new take and files nothing against it leaves the writer looking at no red
  // line at all — which reads as fixed. That is the exact silence #9 is about, and this route had
  // it until this assertion was written. The flags it went in with come forward instead.
  assert.strictEqual(flagsOn(r.passageId).length, stood,
    'the contradictions it went in with must be carried onto the take now on screen — an empty '
    + 'board says "fixed" on no evidence at all');
  assert.strictEqual((db as any).violationsOf(story.id)
    .filter((v: any) => v.passage_id === p).length, 0,
    'and they are not double-counted against the take nobody is looking at');
  ok('  a checker that cannot read its own answer claims nothing and leaves the board loud');

  // WRITTEN DOWN AND READABLE. For four days the counts were returned to a browser that ignored
  // them and stored nowhere, so nobody could say how often the repair fires or how often it works
  // — while eighteen contradictions reached the flags table. Asserted through the route a writer's
  // screen actually reads, not through a helper written for this test: a record nothing reads is
  // the same defect wearing a different hat.
  {
    const runs: any = routes['GET /api/activity']({ body: {},
      query: new URLSearchParams(`story=${story.id}`), owner: me,
      slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {} } as any);
    const mended = runs.runs.filter((x: any) => x.role === 'repair' && x.mend);
    assert.ok(mended.length >= 4,
      `every repair above should have left a record and ${mended.length} did`);
    assert.strictEqual(runs.runs.filter((x: any) => x.role === 'repair').length, mended.length,
      'a repair with no record is a repair nobody can account for');

    // THE INFORMATIVE DENOMINATOR — F10's rule. A repair is only ever asked for on a passage that
    // is already flagged, so the rate that means anything is over those, never over every call.
    const rep = runs.repairs;
    assert.ok(rep, 'the summary exists once anything has been repaired');
    assert.strictEqual(rep.asked, mended.length, 'and counts only the takes that were repaired');
    assert.ok(rep.clean >= 1, 'the one that worked is counted');
    assert.strictEqual(rep.worse, 1,
      'the repair that made it worse is counted AS worse — a summary that folded it into "did '
      + 'nothing" would hide the one outcome that argues against doing this automatically');
    assert.strictEqual(rep.refused, 1, 'and the rewrite that was refused is its own outcome');
    assert.strictEqual(rep.unchecked, 1, 'as is the answer nobody could read');
    // A clean generation records NOTHING, not a zero: those are different facts and reading one as
    // the other is exactly what hid this for four days.
    assert.ok(runs.runs.some((x: any) => x.role === 'prose' && !x.mend),
      'an ordinary generation carries no mend record at all');
    ok('  and what it did is readable where a writer can see it, over the right denominator');
  }

  foundSeq = null;
}

// ---- 6 · A STREAMED PASSAGE IS CHECKED WHERE IT LANDS (#69). Since the streamed `generate`
// persists the passage itself, the client never calls `POST /api/accept` on that path, and accept
// was the only place the check ran: the live library held 0 flags over 627 generations. The streamed
// path and accept now go through one call, on the take that lands, detached.
{
  const { model } = await import('../src/llama.ts');
  const streamed = async (body: any) => {
    const h: any = await routes['POST /api/generate'](ctx({ storyId: story.id, mode: 'direct',
      directive: 'She walks into the light.', ...body, stream: true }));
    return h.__stream(() => {});
  };
  const flagsOn = (id: string) => db.violationsOf(story.id).filter((v: any) => v.passage_id === id);
  const settle = () => new Promise((r) => setTimeout(r, 300));

  // DETACHED. The check is held unanswered, and the passage must still come back and be in the
  // book: a writer is never kept waiting on a flag.
  let release!: () => void;
  holdCheck = new Promise<void>((r) => { release = r; });
  reply = { prose: BROKEN, found: 1, inDialogue: false, canon: 1 };
  calls = [];
  // Raced against a clock, so a check that blocks the passage fails here by name instead of
  // hanging the suite on a gate nothing will open.
  const r: any = await Promise.race([streamed({}),
    new Promise((res) => setTimeout(() => res({ held: true }), 5000))]);
  assert.ok(!r.held, 'the passage must come back while the check is still unanswered');
  assert.ok(!r.error, r.error);
  assert.ok(r.passageId, 'the streamed passage lands in the book');
  assert.deepStrictEqual(flagsOn(r.passageId), [], 'and it is back before the check has answered');
  release(); holdCheck = null;
  await settle();
  const checks = calls.filter((x) => x.kind === 'check');
  assert.strictEqual(checks.length, 1, `the landed take is checked once, and was checked ${checks.length} times`);
  assert.strictEqual(flagsOn(r.passageId).length, 1,
    'a streamed passage that contradicts canon gets a flag, the same as an accepted one');
  ok('a streamed passage that contradicts canon is flagged, without waiting for the check');

  // THE CANON CHECK STAYS LOCAL (ADR 0002): it passes no model, so it asks the default.
  assert.strictEqual(checks[0].model, model(), 'the check asks the local default model');
  ok('  and the check asks the local default model, which the rest of the background work no longer does');

  // A RE-ROLL checks the take it lands, once, and leaves the passed-over take alone.
  const REROLL = `${BROKEN} The lamps went out one by one.`;
  reply = { ...reply, prose: REROLL };
  calls = [];
  const again: any = await streamed({ regenerateOf: r.passageId });
  assert.ok(!again.error, again.error);
  assert.ok(again.passageId && again.passageId !== r.passageId, 'the re-roll lands as a new take');
  await settle();
  const rechecks = calls.filter((x) => x.kind === 'check');
  assert.strictEqual(rechecks.length, 1, `a re-roll makes one check, and made ${rechecks.length}`);
  assert.match(rechecks[0].user, /lamps went out one by one/, 'and it checks the new take');
  assert.strictEqual(flagsOn(again.passageId).length, 1, 'which carries its own flag');
  ok('  a re-roll checks the new take once, and not the take it passed over');
}

// ---- 7 · THE MODEL'S ANSWER TO A SPOKEN LINE IS NOT THAT CHARACTER'S LINE (2026-10-27). Speak sends
// the writer's character as `speaker` so the prompt can say whose line it answers, and the streamed
// path stored it on the model's passage too: in Seth's tale six of Anansi's replies were filed as
// Seth's own speech, drawn as a bubble with his name on it, in the UI's sans and not the book's font.
{
  const h: any = await routes['POST /api/generate'](ctx({ storyId: story.id, mode: 'speak',
    speaker: 'Vel', stream: true }));
  const r: any = await h.__stream(() => {});
  assert.ok(!r.error && r.passageId, r.error ?? 'a passage landed');
  const row: any = db.passagesOf(story.id).find((p: any) => p.id === r.passageId);
  assert.strictEqual(row.author, 'model', 'the reply is the model\'s');
  assert.strictEqual(row.speaker, null, 'and it carries no speaker: it answers Vel, it is not Vel speaking');
  ok('  a reply to a spoken line is not filed as the speaker\'s line');
}

// ---- 8 · OFF BY DEFAULT (2026-10-27). With ANANSI_CANON_CHECK unset, a landed passage asks for no check.
{
  await new Promise((r) => setTimeout(r, 400));   // the checks the sections above started, settled first
  delete process.env.ANANSI_CANON_CHECK;
  calls = [];
  reply = { prose: BROKEN, found: 1, inDialogue: false, canon: 1 };
  const h: any = await routes['POST /api/generate'](ctx({ storyId: story.id, mode: 'direct',
    directive: 'She walks into the light.', stream: true }));
  const r: any = await h.__stream(() => {});
  assert.ok(r.passageId, 'a passage still lands');
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(calls.filter((x) => x.kind === 'check').length, 0, 'CHECK-OFF: and no contradiction check is asked for');
  process.env.ANANSI_CANON_CHECK = '1';
  ok('  the landed-passage check is off unless ANANSI_CANON_CHECK=1');
}

console.log(`\n${n} checks passed`);
srv.close();
