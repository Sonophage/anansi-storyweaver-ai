// Weaving (#49): a book whose writer turns it on lets the model plan, unseen, before it writes. What
// is under test is what reaches the model and what comes back: which calls are sent weaving on, the
// reply cap they are given, the budget the Context panel shows against the one the call uses, and
// the plan's length on the generation row.
//
// Driven against a FAKE llama-server, because every one of these is a number on the wire. What the
// real model does with weaving on is F60: about 3,300 planning tokens a passage, the largest 4,552,
// and a passage that never arrives when the cap cannot hold the plan (F5).
//
//   node --experimental-strip-types test/weave.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-weave.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

/** What the fake was asked, in order: which kind of call, whether it was told to weave, its cap,
 *  and the user message, so a warm can be compared with the prompt a preview shows. */
let calls: { kind: string; weaving: unknown; maxTokens: number; user: string }[] = [];
/** The plan the fake hands back with a passage, and the token count it reports for it, if any. */
let plan = '';
let planTokens: number | undefined;
/** Set to cut the next structured answer off mid-object, the way a plan that ate the cap does. */
let cutNext = false;

const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o)); };
    // Short, so the exact count never refuses; the budget is what this file reads, not the count.
    if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });
    // A structured call is named by its schema: Talk's has a reply, Invent's a title. Anything else
    // with a grammar is background work, extraction among it.
    const props = b.response_format?.json_schema?.schema?.properties ?? {};
    const kind = b.response_format ? (props.reply ? 'talk' : props.title ? 'invent' : 'background')
      : b.max_tokens === 1 ? 'warm' : 'prose';
    calls.push({ kind, weaving: b.chat_template_kwargs?.enable_thinking, maxTokens: b.max_tokens,
      user: String(b.messages?.[1]?.content ?? '') });
    if (kind === 'background') return send({ choices: [{ message: { content: JSON.stringify({ entries: [] }) } }],
      usage: { prompt_tokens: 200, completion_tokens: 5 } });
    const cut = cutNext && (kind === 'talk' || kind === 'invent');
    if (cut) cutNext = false;
    if (kind === 'talk' || kind === 'invent') return send({ choices: [{ message: {
        content: JSON.stringify(kind === 'talk' ? { reply: 'It is about a debt.', entries: [] }
          : { title: 'The Rust Choir', body: '[The Rust Choir: a congregation]', keys: ['choir'] })
          .slice(0, cut ? 12 : undefined),
        reasoning_content: plan } }],
      usage: { prompt_tokens: 200, completion_tokens: 40,
               ...(planTokens == null ? {} : { completion_tokens_details: { reasoning_tokens: planTokens } }) } });
    send({ choices: [{ message: { content: 'She walks into the light.', reasoning_content: plan },
                       finish_reason: 'stop' }],
      usage: { prompt_tokens: 200, completion_tokens: 40,
               ...(planTokens == null ? {} : { completion_tokens_details: { reasoning_tokens: planTokens } }) } });
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

// Imported AFTER the host is set: llama.ts reads it once, at module load.
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { DatabaseSync } = await import('node:sqlite');
const { SYSTEM } = await import('../src/render.ts');

const me = db.owner('weaver');
const book = (title: string) => {
  const s = db.createStory(me, { title, premise: 'A city on a dead god.' });
  db.upsertEntry(s.id, me, { title: 'The Murmur', body: 'Vel is the Murmur.', activation: 'always_on' });
  db.addPassage({ ...s, storyId: s.id, body: 'The lower tiers still pulse.' });
  return s;
};
const woven = book('Woven'), plain = book('Plain');

// The shipped sampler's cap, as serve.ts ships it: 900 when the writer has set no length.
const ctx = (body: any, perSlot = 50048) => ({ body, query: new URLSearchParams(), owner: me,
  slot: { global: perSlot * 2, slots: 2, perSlot },
  gen: { temperature: 0.85, top_p: 0.95, target_words: 0, max_tokens: 900 }, setGen: () => {} }) as any;
// Through the story save, the way the Storyteller's switch reaches it.
const story = await routes['POST /api/story'](ctx({ id: woven.id, story: { weaving: true } })) as any;
assert.strictEqual(story.story.weaving, true, 'the story save turns weaving on');
const write = async (id: string, perSlot?: number) => {
  calls = [];
  return routes['POST /api/generate'](ctx({ storyId: id, mode: 'direct', directive: 'She walks into the light.' },
    perSlot)) as any;
};

let n = 0;
// Message only — assertions run inline above. Passing a callback to THIS `ok` would print a green
// check for a body that never ran. Refused rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

// ---- 1. A WEAVING BOOK'S PASSAGE WEAVES, WITH THE ROOM TO. 900 + 5,000: the shipped prose cap and
// the fixed allowance above F60's largest plan, 4,552. Without the raise the plan eats the 900 and
// the passage never arrives (F5).
{
  const r = await write(woven.id);
  assert.ok(!r.error, r.error);
  const prose = calls.filter((x) => x.kind === 'prose');
  assert.strictEqual(prose.length, 1, `one passage call: ${JSON.stringify(calls)}`);
  assert.strictEqual(prose[0].weaving, true, 'a passage in a weaving book is sent weaving on');
  assert.strictEqual(prose[0].maxTokens, 5900, 'with its cap raised by 5,000');

  await write(plain.id);
  const off = calls.filter((x) => x.kind === 'prose');
  assert.strictEqual(off[0].weaving, false, 'a passage in a book that does not weave is sent weaving off');
  assert.strictEqual(off[0].maxTokens, 900, 'with the cap the writer set and nothing added');
  ok('a passage in a weaving book weaves with its cap raised by 5,000, and one in any other book does not');
}

// ---- 2. THE BACKGROUND NEVER WEAVES, in the same weaving book. Extraction is structured, and F23
// measured a structured call that planned first returning unparseable JSON on 3 calls in 5.
{
  db.addPassage({ ...woven, storyId: woven.id, body: 'She walks into the light.' });
  calls = [];
  await routes['POST /api/extract'](ctx({ storyId: woven.id, chapterId: (db.chapters(woven.id)[0] as any).id }));
  const bg = calls.filter((x) => x.kind === 'background');
  assert.ok(bg.length >= 1, `the extraction reached the model: ${JSON.stringify(calls)}`);
  for (const x of bg) {
    assert.strictEqual(x.weaving, false, 'a background call in a weaving book is sent weaving off');
    assert.ok(x.maxTokens < 5000, `and with its own cap, nothing added (${x.maxTokens})`);
  }
  ok('extraction in a weaving book is sent weaving off, with its own cap');
}

// ---- 3. THE BUDGET THE PANEL SHOWS IS THE BUDGET THE CALL USES. The raised cap is reserved in the
// context budget, so a weaving book's prompt has 5,000 fewer tokens of room — and the Storyteller's
// meter (the view), the Context panel (POST /api/manifest) and the generation must all say so.
{
  const budgetOf = async (id: string) => {
    const shown: any = (routes['GET /api/story'] as any)({ ...ctx({}), query: new URLSearchParams(`story=${id}`) });
    const preview: any = await routes['POST /api/manifest'](ctx({ storyId: id, mode: 'direct',
      directive: 'She walks into the light.' }));
    const call = await write(id);
    return { shown: shown.budget, preview: preview.manifest.totals.budget, call: call.manifest.totals.budget };
  };
  const w = await budgetOf(woven.id), p = await budgetOf(plain.id);
  assert.strictEqual(w.preview, w.call, `the preview's budget is the weaving call's: ${JSON.stringify(w)}`);
  assert.strictEqual(w.shown, w.call, "and so is the view's");
  assert.strictEqual(p.preview, p.call, `and in a book that does not weave: ${JSON.stringify(p)}`);
  assert.strictEqual(p.call - w.call, 5000, 'the weaving book has 5,000 fewer tokens of room');
  ok("the view's budget, the preview's and the call's agree, and weaving reserves its 5,000 in them");
}

// ---- 4. THE WARM SENDS THE PREFIX THE PASSAGE WILL SEND. Opening a book warms its prompt in the
// background, and a warm budgeted without the weaving room keeps prose the real call drops — which
// warms a prefix nothing is going to ask for. A small slot and a long book, so the 5,000 decides
// what stays.
{
  const long = db.createStory(me, { title: 'Long', premise: 'A city on a dead god.' });
  for (let i = 1; i <= 30; i++)
    db.addPassage({ ...long, storyId: long.id,
      body: `Passage ${i}. ` + 'The lower tiers pulse under the rain, and the Murmur keeps her counsel. '.repeat(4) });
  // 9,300 since 2026-11-06: the shipped mode wording grew by about 150 tokens (Seth's became the
  // default) and 9,000 overflowed. Still small enough that the 5,000 decides what stays (asserted below).
  const SLOT = 9300;
  const preview = async () => ((await routes['POST /api/manifest'](ctx({ storyId: long.id, mode: 'continue' },
    SLOT))) as any).prompt as string;
  const off = await preview();
  await routes['POST /api/story'](ctx({ id: long.id, story: { weaving: true } }));
  const on = await preview();
  // The precondition, so the comparison below can fail: at this size weaving has to change the prompt.
  assert.notStrictEqual(on, off, 'in this book the weaving room changes which prose reaches the prompt');

  calls = [];
  (routes['GET /api/story'] as any)({ ...ctx({}, SLOT), query: new URLSearchParams(`story=${long.id}`) });
  for (let i = 0; i < 100 && !calls.some((x) => x.kind === 'warm'); i++) await new Promise((r) => setTimeout(r, 20));
  const warm = calls.find((x) => x.kind === 'warm');
  assert.ok(warm, `opening the book warmed it: ${JSON.stringify(calls.map((x) => x.kind))}`);
  assert.strictEqual(warm!.weaving, false, 'a warm never weaves — it asks for one token');
  assert.strictEqual(warm!.user, on.slice(SYSTEM.length), 'and it warms the prompt the weaving passage will send');
  ok('opening a weaving book warms the prompt its passage will send, weaving room and all');
}

// ---- 5. THE PLAN'S LENGTH IS KEPT, AND THE PLAN IS NOT. The admin tunes the 5,000 from these
// numbers, so they have to be on the row; the plan is never shown, so it must not be stored either.
{
  const raw = new DatabaseSync(DB, { readOnly: true });
  const paramsOf = (genId: string) =>
    JSON.parse((raw.prepare('SELECT params FROM generations WHERE id = ?').get(genId) as any).params);
  const rowOf = (genId: string) => JSON.stringify(raw.prepare('SELECT * FROM generations WHERE id = ?').get(genId));
  const PLAN = 'THE-PLAN-ITSELF Seth belongs to the writer; stop where he would act. ';

  // The server's own count, when it gives one: llama.cpp and OpenAI-shaped APIs put it here.
  plan = PLAN.repeat(10); planTokens = 3300;
  const counted = await write(woven.id);
  assert.strictEqual(paramsOf(counted.genId).plan, 3300, "the server's count of the plan is kept");
  assert.strictEqual(paramsOf(counted.genId).weaving, true, 'and the row says the call wove');
  assert.strictEqual(paramsOf(counted.genId).max_tokens, 5900, 'with the cap it was sent with');
  assert.ok(!rowOf(counted.genId).includes('THE-PLAN-ITSELF'), 'and nothing of the plan is stored');

  // No count from the server: the length of the plan, by the same estimate the budget uses
  // (4.2 characters a token). 420 characters is 100 tokens.
  plan = 'x'.repeat(420); planTokens = undefined;
  const estimated = await write(woven.id);
  assert.strictEqual(paramsOf(estimated.genId).plan, 100, 'without a count, the plan is measured from its length');

  // A book that does not weave has no plan to record, and its row says nothing about one.
  plan = ''; planTokens = undefined;
  const none = await write(plain.id);
  assert.ok(!('plan' in paramsOf(none.genId)), 'a call that did not weave records no plan length');
  assert.strictEqual(paramsOf(none.genId).max_tokens, 900, 'and its own cap');
  raw.close();
  ok("a weaving passage's plan length lands on its generation row, and the plan does not");
}

// ---- 6. TALK AND INVENT WEAVE IN A WEAVING BOOK, EACH WITH ITS ROLE'S ROOM. Their own caps, 2,400
// and 2,000, plus 5,000 for Talk and 7,000 for Invent: bench/weave-json.ts measured Invent's plans
// at a median of 4,372 tokens and a largest of 5,613 on 2026-10-22, two of five over 5,000. In any
// other book they are sent weaving off with their own caps, as before.
/** The room each role is given on top of its own cap, from the spec and the measurement above. */
const ROOM = { talk: 5000, invent: 7000 } as const;
const talk = async (id: string, perSlot?: number, extra: any = {}) => {
  calls = [];
  return routes['POST /api/talk'](ctx({ storyId: id, said: 'What is this story about?', ...extra }, perSlot)) as any;
};
const invent = async (id: string, perSlot?: number, extra: any = {}) => {
  calls = [];
  return routes['POST /api/invent'](ctx({ storyId: id, kind: 'lore', ...extra }, perSlot)) as any;
};
{
  for (const [name, go, kind, cap] of [['Talk', talk, 'talk', 2400], ['Invent', invent, 'invent', 2000]] as const) {
    const r = await go(woven.id);
    assert.ok(!r.error, `${name}: ${r.error}`);
    const on = calls.filter((x) => x.kind === kind);
    assert.strictEqual(on.length, 1, `${name} reached the model once: ${JSON.stringify(calls)}`);
    assert.strictEqual(on[0].weaving, true, `${name} in a weaving book is sent weaving on`);
    assert.strictEqual(on[0].maxTokens, cap + ROOM[kind], `${name} gets its own cap raised by its role's room`);

    const p = await go(plain.id);
    assert.ok(!p.error, `${name}: ${p.error}`);
    const off = calls.filter((x) => x.kind === kind);
    assert.strictEqual(off[0].weaving, false, `${name} in a book that does not weave is sent weaving off`);
    assert.strictEqual(off[0].maxTokens, cap, `${name} keeps its own cap in a book that does not weave`);
  }
  ok('Talk and Invent weave in a weaving book with their caps raised by 5,000 and 7,000, and in any other book do not');

  // "Remember this" is structured, writer-facing and shaped like an invention, and it is not on the
  // role list: it must stay weaving off in the same book, or F23 comes back through the side door.
  const passageId = db.addPassage({ ...woven, storyId: woven.id, body: 'The stair gave under her weight.' })!;
  calls = [];
  const m: any = await routes['POST /api/memo'](ctx({ storyId: woven.id, passageId }));
  assert.ok(!m.error, m.error);
  assert.strictEqual(calls.length, 1, `remember reached the model once: ${JSON.stringify(calls)}`);
  assert.strictEqual(calls[0].weaving, false, '"Remember this" in a weaving book is sent weaving off');
  ok('"Remember this" in a weaving book is sent weaving off');
}

// ---- 7. A WEAVING TALK OR INVENTION RECORDS ITS PLAN'S LENGTH, the number its room is tuned
// from, and not the plan. The same rule as a passage: the server's count, else the length.
{
  const raw = new DatabaseSync(DB, { readOnly: true });
  const last = (role: string) => raw.prepare('SELECT * FROM generations WHERE role = ? ORDER BY rowid DESC LIMIT 1')
    .get(role) as any;
  for (const [name, go, role, cap, room] of [['Talk', talk, 'talk', 2400, ROOM.talk],
                                              ['Invent', invent, 'invent:lore', 2000, ROOM.invent]] as const) {
    plan = 'THE-PLAN-ITSELF '.repeat(20); planTokens = 3300;
    assert.ok(!(await go(woven.id)).error);
    const row = last(role), params = JSON.parse(row.params ?? '{}');
    assert.strictEqual(params.plan, 3300, `${name}: the server's count of the plan is kept`);
    assert.strictEqual(params.weaving, true, `${name}: the row says the call wove`);
    assert.strictEqual(params.max_tokens, cap + room, `${name}: with the cap it was sent with`);
    assert.ok(!JSON.stringify(row).includes('THE-PLAN-ITSELF'), `${name}: nothing of the plan is stored`);

    plan = 'x'.repeat(420); planTokens = undefined;
    assert.ok(!(await go(woven.id)).error);
    assert.strictEqual(JSON.parse(last(role).params ?? '{}').plan, 100,
      `${name}: without a count, the plan is measured from its length`);

    plan = ''; planTokens = undefined;
    assert.ok(!(await go(plain.id)).error);
    assert.ok(!('plan' in JSON.parse(last(role).params ?? '{}')), `${name}: a call that did not weave records no plan`);
  }
  raw.close();
  ok("a weaving Talk's and invention's plan length lands on the generation row, and the plan does not");
}

// ---- 8. A WEAVING CALL'S RETRY STAYS INSIDE THE ROOM ITS PROMPT WAS BUDGETED FOR. The retry exists
// for an object that ran out of room, and it doubles the cap for every other call. Doubled here,
// Talk's 7,400 becomes 14,800 against a prompt that reserved 7,400: the slot is oversubscribed, and
// this server answers that with a 500 to both writers on it. So the retry keeps the reserved cap and
// is sent weaving off, which hands the whole of it to the answer. The row says the call wove (the
// plan was made, and its length is the number its room is tuned from) and that it was retried.
{
  const raw = new DatabaseSync(DB, { readOnly: true });
  const last = (role: string) => JSON.parse((raw.prepare(
    'SELECT params FROM generations WHERE role = ? ORDER BY rowid DESC LIMIT 1').get(role) as any).params ?? '{}');
  for (const [name, go, kind, role, cap] of [['Talk', talk, 'talk', 'talk', 2400],
                                             ['Invent', invent, 'invent', 'invent:lore', 2000]] as const) {
    plan = 'x'.repeat(4200); planTokens = undefined; cutNext = true;
    const r = await go(woven.id);
    assert.ok(!r.error, `${name}: the retry answered: ${r.error}`);
    const sent = calls.filter((x) => x.kind === kind);
    assert.strictEqual(sent.length, 2, `${name}: a cut-off answer is retried once: ${JSON.stringify(sent)}`);
    assert.strictEqual(sent[0].weaving, true, `${name}: the first try wove`);
    assert.strictEqual(sent[1].maxTokens, cap + ROOM[kind], `${name}: the retry keeps the cap the prompt reserved, `
      + `not double it (${sent[1].maxTokens})`);
    assert.strictEqual(sent[1].weaving, false, `${name}: and is sent weaving off, so the answer has all of it`);
    const params = last(role);
    assert.strictEqual(params.weaving, true, `${name}: the row says the call wove`);
    assert.strictEqual(params.retried, true, `${name}: and that it was retried`);
    assert.strictEqual(params.plan, 1000, `${name}: with the length of the plan that was made`);
  }
  // In a book that does not weave the retry is what it always was: double, at least 2,000.
  cutNext = true;
  await talk(plain.id);
  const sent = calls.filter((x) => x.kind === 'talk');
  assert.deepStrictEqual(sent.map((x) => x.maxTokens), [2400, 4800], 'a Talk that does not weave still doubles');
  plan = '';
  raw.close();
  ok("a weaving call's retry keeps the cap its prompt reserved and goes weaving off, and says so on the row");
}

// ---- 9. THE FIT CHECK. When the weaving room would push part of the book out of a Talk or Invent
// prompt, the call is refused with a message that says so and names the two ways on. `weaveAnyway`
// sends the weaving prompt, where the older prose drops out first; turning weaving off sends the
// book whole. A long book and a small slot, so the role's room is what decides.
{
  const tome = (title: string, weaving: boolean) => {
    const s = db.createStory(me, { title, premise: 'A city on a dead god.' });
    db.upsertEntry(s.id, me, { title: 'The Murmur', body: 'Vel is the Murmur.', activation: 'always_on' });
    for (let i = 1; i <= 30; i++)
      db.addPassage({ ...s, storyId: s.id,
        body: `Passage ${i}. ` + 'The lower tiers pulse under the rain, and the Murmur keeps her counsel. '.repeat(12) });
    if (weaving) db.updateStory(s.id, { weaving: true });
    return s;
  };
  const big = tome('Big, weaving', true), same = tome('Big, plain', false);
  const raw = new DatabaseSync(DB, { readOnly: true });
  const lastManifest = (role: string) => JSON.parse((raw.prepare(
    'SELECT manifest FROM generations WHERE role = ? ORDER BY rowid DESC LIMIT 1').get(role) as any).manifest);
  const omittedProse = (m: any) => m.blocks.filter((b: any) => b.kind === 'PROSE' && b.state === 'omitted').length;

  for (const [name, go, kind, role, slot] of [['Talk', talk, 'talk', 'talk', 9500],
                                              ['Invent', invent, 'invent', 'invent:lore', 11000]] as const) {
    // The precondition, so the refusal below can be wrong: without weaving, this slot holds the book.
    assert.ok(!(await go(same.id, slot)).error, `${name}: the slot holds the book without weaving`);
    assert.strictEqual(omittedProse(lastManifest(role)), 0, `${name}: and nothing of it is left out`);

    const refused = await go(big.id, slot);
    assert.ok(refused.error, `${name}: the weaving room would push part of the book out, so it refuses`);
    assert.strictEqual(calls.filter((x) => x.kind === kind).length, 0, `${name}: and nothing reached the model`);
    assert.match(refused.error, /plan/i, `${name}: the message says Plans first is the reason: ${refused.error}`);
    assert.match(refused.error, new RegExp(`sets aside ${ROOM[kind].toLocaleString('en')} tokens`),
      `${name}: it gives the room its own role sets aside: ${refused.error}`);
    assert.match(refused.error, /turn Plans first off/i, `${name}: it offers turning weaving off`);
    assert.match(refused.error, /anyway/i, `${name}: and going ahead anyway`);
    assert.match(refused.error, /passage/, `${name}: it names what would drop out: ${refused.error}`);
    assert.ok(refused.weaveFit?.drops?.length > 0, `${name}: and lists it: ${JSON.stringify(refused.weaveFit)}`);
    assert.ok(refused.weaveFit.drops.every((d: any) => d.kind && d.id), `${name}: each by kind and id`);

    const anyway = await go(big.id, slot, { weaveAnyway: true });
    assert.ok(!anyway.error, `${name}: anyway goes ahead: ${anyway.error}`);
    const sent = calls.filter((x) => x.kind === kind);
    assert.strictEqual(sent[0]?.weaving, true, `${name}: weaving on`);
    assert.strictEqual(sent[0]?.maxTokens, ({ talk: 2400, invent: 2000 } as any)[kind] + ROOM[kind], `${name}: with its room`);
    const m = lastManifest(role);
    assert.ok(omittedProse(m) > 0, `${name}: and older prose dropped out to make it`);
    // Oldest first: every passage left out comes before every passage kept.
    const prose = m.blocks.filter((b: any) => b.kind === 'PROSE');
    const firstKept = prose.findIndex((b: any) => b.state === 'included');
    assert.ok(firstKept > 0 && prose.slice(firstKept).every((b: any) => b.state === 'included'),
      `${name}: the oldest prose is what dropped`);
  }
  // A slot that holds Talk's own reserve but not the weaving one at all: the weaving prompt
  // overflows where the plain one does not. That is the same refusal, not an overflow error.
  assert.ok(!(await talk(same.id, 7000)).error, 'the 7,000 slot holds Talk without weaving');
  const over = await talk(big.id, 7000);
  assert.match(over.error ?? '', /turn Plans first off/i, `an overflow the weaving room causes is the refusal: ${over.error}`);
  assert.ok(over.weaveFit, 'and says so in its shape');
  assert.doesNotMatch(over.error, /anyway/i, 'and does not offer an anyway that would only overflow');
  // A slot too small for the book even without weaving is the error it always was.
  const tiny = await talk(big.id, 2000);
  assert.ok(tiny.error && !tiny.weaveFit, `a true overflow stays the existing error: ${tiny.error}`);
  raw.close();
  ok('a weaving Talk or invention that would push part of the book out refuses, and anyway drops the oldest prose');
}

// ---- 10. WHEN WEAVING DOES NOT FIT, FOR A PASSAGE. A long book in a small slot: the 5,000 the plan is given
// would push its oldest prose out of the prompt. The call is refused before anything reaches the
// model, with a message naming what would drop out; the writer can write anyway, which sends the
// weaving assembly with the oldest prose gone, or turn weaving off, which writes normally.
{
  const big = db.createStory(me, { title: 'Big', premise: 'A city on a dead god.' });
  for (let i = 1; i <= 30; i++)
    db.addPassage({ ...big, storyId: big.id,
      body: `Passage ${i}. ` + 'The lower tiers pulse under the rain, and the Murmur keeps her counsel. '.repeat(4) });
  await routes['POST /api/story'](ctx({ id: big.id, story: { weaving: true } }));
  // 9,300 since 2026-11-06: the shipped mode wording grew by about 150 tokens (Seth's became the
  // default) and 9,000 overflowed. Still small enough that the 5,000 decides what stays (asserted below).
  const SLOT = 9300;
  const ask = async (extra: any = {}) => {
    calls = [];
    return routes['POST /api/generate'](ctx({ storyId: big.id, mode: 'continue', ...extra }, SLOT)) as any;
  };

  // Refused: nothing is sent, and the answer says what would drop out, and that writing anyway is open.
  const refused = await ask();
  assert.ok(refused.weaveFit, `a weaving call that would drop prose is refused: ${JSON.stringify(refused).slice(0, 300)}`);
  assert.strictEqual(calls.filter((x) => x.kind === 'prose').length, 0, 'and nothing reaches the model');
  assert.strictEqual(refused.weaveFit.overflows, false, 'it is not an overflow, so writing anyway is on offer');
  const named = refused.weaveFit.drops.map((b: any) => b.id);
  assert.ok(named.length >= 2 && refused.weaveFit.drops.every((b: any) => b.kind === 'PROSE'),
    `here it is prose that drops: ${JSON.stringify(refused.weaveFit)}`);
  assert.match(refused.error, new RegExp(`the ${named.length} oldest passages`), `the refusal names what drops: ${refused.error}`);
  assert.match(refused.error, /Plans first/, 'in the word the writer knows');
  assert.doesNotMatch(refused.error, /think|reason|spin|weav/i, 'and never the words the app does not use');

  // The Context panel says the same before the press: its preview is the weaving assembly, and it
  // carries the refusal the call gives.
  const preview: any = await routes['POST /api/manifest'](ctx({ storyId: big.id, mode: 'continue' }, SLOT));
  assert.deepStrictEqual(preview.weaveFit, refused.weaveFit, 'the preview carries the refusal the call gives');
  assert.strictEqual(preview.manifest.totals.budget, refused.manifest.totals.budget, 'against the same budget');

  // Write anyway: the weaving assembly goes, weaving on with its raised cap, the named prose left out.
  const anyway = await ask({ weaveAnyway: true });
  assert.ok(!anyway.error, anyway.error);
  const sent = calls.filter((x) => x.kind === 'prose');
  assert.strictEqual(sent.length, 1, 'write anyway sends the passage');
  assert.strictEqual(sent[0].weaving, true, 'weaving on');
  assert.strictEqual(sent[0].maxTokens, 5900, 'with the raised cap');
  assert.strictEqual(sent[0].user, preview.prompt.slice(SYSTEM.length), 'and the prompt the preview showed');
  const gone = anyway.manifest.blocks.filter((b: any) => b.kind === 'PROSE' && b.state === 'omitted').map((b: any) => b.id);
  assert.deepStrictEqual(gone, named, 'the passages left out are the ones the refusal named');

  // Turn weaving off: the switch flips, and the same press writes normally.
  const off: any = await routes['POST /api/story'](ctx({ id: big.id, story: { weaving: false } }));
  assert.strictEqual(off.weaves, false, 'the book no longer weaves');
  const plainly = await ask();
  assert.ok(!plainly.error && !plainly.weaveFit, plainly.error);
  const normal = calls.filter((x) => x.kind === 'prose');
  assert.strictEqual(normal[0].weaving, false, 'with weaving off');
  assert.strictEqual(normal[0].maxTokens, 900, 'and the cap the writer set');
  ok('a weaving call that would drop prose is refused, naming it; write anyway sends it, and weaving off writes normally');
}

// ---- 11. A TRUE OVERFLOW STAYS THE OVERFLOW ERROR. A slot so small the book does not fit even
// without weaving: that is not weaving's refusal, and writing anyway cannot help.
{
  calls = [];
  const r: any = await routes['POST /api/generate'](ctx({ storyId: woven.id, mode: 'continue' }, 1500));
  assert.ok(r.error, 'a book that does not fit at all is refused');
  assert.ok(!r.weaveFit, `with the overflow error, not the weaving one: ${r.error}`);
  assert.strictEqual(r.error, r.manifest.overflowReason, "which is the engine's own overflow reason");
  assert.strictEqual(calls.filter((x) => x.kind === 'prose').length, 0, 'and nothing reaches the model');
  ok('a book that overflows without weaving gets the overflow error, not the weaving refusal');
}

// ---- 12. AN ACT THAT DROPS OUT IS COUNTED AS THE CHAPTERS IT STANDS FOR. Its range is in its id,
// read by the engine's own parser, so the refusal and the engine cannot read one id two ways.
{
  const { weaveRefusal } = await import('../src/routes.ts');
  const said = weaveRefusal({ entries: [] }, { overflows: false,
    drops: [{ kind: 'EARLIER', id: 'arc-3-11' }, { kind: 'EARLIER', id: 'c-14' }] } as any, 5000, null);
  assert.match(said, /the summaries of 10 earlier scenes/, `ACT-COUNT: an act of chapters 3 to 11 is nine of them, and a chapter one: ${said}`);
  ok('an act left out is counted as the chapters it stands for');

  // A model that always weaves: an overflow offers only another model, since weaving cannot be
  // turned off for it and writing anyway would not fit.
  const over = weaveRefusal({ entries: [] }, { overflows: true, drops: [] } as any, 5000, 32768, true);
  assert.match(over, /Use another model for this tale to write\.$/, `ALWAYS-OVERFLOW: another model is the one way on: ${over}`);
  assert.doesNotMatch(over, /turn weaving off|write anyway/i, 'ALWAYS-OVERFLOW: and nothing else is offered');
  const plainOver = weaveRefusal({ entries: [] }, { overflows: true, drops: [] } as any, 5000, null);
  assert.match(plainOver, /Turn Plans first off for this tale to write\.$/, 'the control: a switched book still offers the switch');
  ok('an overflow on a model that always weaves offers only another model');
}

// ---- THE LENGTH SLIDER'S END. 2,000 words since 2026-10-24, and the ceiling it derives follows it.
{
  const set = async (target_words: number) => {
    const c = ctx({ target_words });
    c.setGen = (g: any) => { c.gen = { ...c.gen, ...g }; };
    return (await routes['POST /api/settings'](c) as any).gen;
  };
  const top = await set(2000);
  assert.strictEqual(top.target_words, 2000, 'LENGTH: a 2,000-word target is kept');
  assert.strictEqual(top.max_tokens, 5600, 'LENGTH: and its ceiling is 5,600 tokens');
  assert.strictEqual((await set(9000)).target_words, 2000, 'LENGTH: past the end it is held at 2,000');
  ok('the length slider reaches 2,000 words, and the ceiling follows it');
}

console.log(`\n${n} checks passed`);
srv.close();
