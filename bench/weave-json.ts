// Weave-json: do Talk and Invent still return valid JSON when the book weaves?
//
// F23 is why this exists. Talk once shipped with thinking on, and 3 of its first 5 real calls came
// back `model returned unparseable JSON`: the plan ate the cap and the object was cut off before it
// closed. Weaving puts Talk and Invent back on that path with more room (WEAVE_ROOM, per role), and F23's
// own last line is that any such use "needs a raised budget and a measurement, not an argument".
// This is the measurement. If either role fails it, that role comes off WEAVING_ROLES in
// src/routes.ts before release, and F23 gets a follow-up.
//
//   node --experimental-strip-types bench/weave-json.ts check   # the tally, against a fake router
//   node --experimental-strip-types bench/weave-json.ts [runs]  # the real model, runs per role (5)
//
// RUN THE REAL ONE ONLY WHEN NOBODY IS WRITING. It sends weaving calls to the local router on
// :8080 (or ANANSI_LLAMA), about a minute each by F60's numbers, and two of them in flight with a
// writer is the oversubscribed slot CLAUDE.md warns about.
//
// THE REAL PATH, NOT A COPY OF IT. Each call goes through the `POST /api/talk` and `POST /api/invent`
// routes, so the prompt, the cap, the weaving flag and the retry are the ones the app sends. The
// book is seeded from test/fixture.ts into a scratch database of this file's own, never the live
// library: ANANSI_DB is overwritten before db.ts is imported, whatever it was set to.
//
// WHAT COUNTS AS A PASS. A call passes when the route gave the writer a usable answer AND its first
// try parsed AND it made a plan. Each of the three is its own failure, and the check below proves
// the tally tells them apart:
//   - an error, or an answer with nothing in it: the writer got nothing (F5's empty reply arrives
//     as a VALID `{}`, so "it parsed" alone would call that a pass);
//   - retried: the first object did not parse, and the answer that landed was written weaving off
//     by `structuredRetry`. The writer got an answer, but weaving did not survive the call;
//   - no plan: the model never wove, and a JSON check of a call that did not weave proves nothing.

import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';
import { input } from '../test/fixture.ts';

const CHECK = process.argv[2] === 'check';
const RUNS = CHECK ? 1 : Math.max(1, Number(process.argv[2]) || 5);
const DB = `/tmp/anansi-weave-json-${process.pid}.db`;
const wipe = () => { for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} } };
wipe();
process.env.ANANSI_DB = DB;

/** One call's outcome, read off what the route returned and the generation row it wrote. */
export type Outcome = { role: string; answered: boolean; retried: boolean; wove: boolean; plan: number;
                        error?: string; seconds: number };
export const verdict = (o: Outcome) =>
  !o.answered ? 'no answer' : !o.wove ? 'did not weave' : o.retried ? 'retried' : o.plan <= 0 ? 'no plan' : 'pass';

// ---- the fake router, for `check` only. It answers by the case it is told to play.
type Case = 'valid' | 'cut' | 'empty' | 'unwoven';
let play: Case = 'valid';
let seen: { weaving: unknown; maxTokens: number }[] = [];
if (CHECK) {
  const srv = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const b = JSON.parse(raw || '{}');
      const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });
      seen.push({ weaving: b.chat_template_kwargs?.enable_thinking, maxTokens: b.max_tokens });
      const props = b.response_format?.json_schema?.schema?.properties ?? {};
      const answer = JSON.stringify(props.reply ? { reply: 'Aldis owes Marek eleven crowns.', entries: [] }
        : { title: 'Marek Vale', body: '[Marek Vale: moneylender, courteous]', keys: ['Marek'] });
      const woven = b.chat_template_kwargs?.enable_thinking === true;
      // `cut` truncates only the woven first try; the retry, weaving off, answers whole.
      const content = play === 'empty' ? null : play === 'cut' && woven ? answer.slice(0, 15) : answer;
      send({ choices: [{ message: { content, reasoning_content: play === 'unwoven' || !woven ? '' : 'p'.repeat(4200) } }],
             usage: { prompt_tokens: 400, completion_tokens: 900 } });
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  srv.unref();
  process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;
}

// Imported AFTER the database and the host are set: both are read once, at module load.
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { slotFirstRead, model } = await import('../src/llama.ts');

const me = db.owner('weave-json');
const s = db.createStory(me, { title: input.story.title, genre: input.story.genre, premise: input.story.premise,
  setting: input.story.setting, pov: input.story.pov, writingStyle: input.story.writingStyle });
db.updateStory(s.id, { weaving: true });
for (const e of input.entries)
  db.upsertEntry(s.id, me, { title: e.id.replace(/^e-/, ''), body: e.body, entryType: e.entryType,
    activation: e.activation, keys: e.keys });
for (const p of input.passages) db.addPassage({ ...s, storyId: s.id, body: p.body });

// The real slot when the real router answers; the shipped per-slot size against the fake.
const slot = CHECK ? { global: 100_096, slots: 2, perSlot: 50_048 } : await slotFirstRead();
const ctx = (body: any) => ({ body: { storyId: s.id, ...body }, query: new URLSearchParams(), owner: me, slot,
  gen: { temperature: 0.85, top_p: 0.95, target_words: 0, max_tokens: 900 }, setGen: () => {} }) as any;
const lastRow = (role: string) => {
  const row = db.db.prepare('SELECT params, error FROM generations WHERE role = ? ORDER BY rowid DESC LIMIT 1')
    .get(role) as any;
  return { params: JSON.parse(row?.params ?? '{}'), error: row?.error as string | null };
};

const ROLES = [
  { role: 'talk', go: () => routes['POST /api/talk'](ctx({ said: 'What does Aldis owe, and to whom? Answer from the book.' })),
    usable: (r: any) => !r.error && !!String(r.reply ?? '').trim() },
  { role: 'invent:character', go: () => routes['POST /api/invent'](ctx({ kind: 'character',
      direction: 'the man Marek sends to collect' })),
    // A new card goes to the proposals queue and the route answers with no error. "The ledger already
    // says exactly that" is a parsed, whole answer the dedupe turned down, so it counts as one.
    usable: (r: any) => !r.error || /ledger already says/.test(r.error) },
] as const;

const once = async (x: (typeof ROLES)[number]): Promise<Outcome> => {
  const t0 = Date.now();
  const r: any = await x.go();
  const { params, error } = lastRow(x.role);
  return { role: x.role, answered: x.usable(r), retried: !!params.retried, wove: params.weaving === true,
           plan: Number(params.plan) || 0, error: r.error ?? error ?? undefined,
           seconds: +((Date.now() - t0) / 1000).toFixed(1) };
};

if (CHECK) {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };
  console.log('\n  weave-json check — the tally, before anything it says about the real model is believed\n');

  for (const x of ROLES) {
    const cap = x.role === 'talk' ? 7400 : 9000;
    play = 'valid'; seen = [];
    const good = await once(x);
    ok(`${x.role}: the call this harness sends weaves`, seen[0]?.weaving === true);
    ok(`${x.role}:   with its cap raised by its role's room (${seen[0]?.maxTokens})`, seen[0]?.maxTokens === cap);
    ok(`${x.role}: a whole answer with a plan is a pass`, verdict(good) === 'pass');

    play = 'cut';
    const cut = await once(x);
    ok(`${x.role}: a first try cut off mid-object is not a pass, though the retry answered`,
       cut.answered && verdict(cut) === 'retried');

    play = 'empty';
    ok(`${x.role}: an answer with nothing in it is not a pass, though "{}" parses`,
       verdict(await once(x)) === 'no answer');

    play = 'unwoven';
    ok(`${x.role}: a call that made no plan proves nothing, and is not a pass`, verdict(await once(x)) === 'no plan');
  }
  ok('a call in a book that does not weave is not counted as weaving',
     verdict({ role: 'talk', answered: true, retried: false, wove: false, plan: 0, seconds: 0 }) === 'did not weave');
  console.log(`\n  ${n} checks, all green`);
  wipe();
  process.exit(0);
}

console.log(`\n  weave-json — ${RUNS} run(s) per role, weaving on, model ${model()}, `
  + `${slot.perSlot} tokens a slot. One call at a time.\n`);
const all: Outcome[] = [];
for (const x of ROLES)
  for (let i = 1; i <= RUNS; i++) {
    const o = await once(x);
    all.push(o);
    console.log(`  ${x.role.padEnd(17)} ${String(i).padStart(2)}  ${verdict(o).padEnd(13)} ${String(o.seconds).padStart(6)}s`
      + `  plan ${String(o.plan).padStart(5)}${o.error ? `  ${o.error.slice(0, 120)}` : ''}`);
  }
console.log('');
let failed = false;
for (const x of ROLES) {
  const mine = all.filter((o) => o.role === x.role);
  const pass = mine.filter((o) => verdict(o) === 'pass').length;
  const plans = mine.map((o) => o.plan).sort((a, b) => a - b);
  // Out of how many could have failed: every run, since every run is a weaving call (F10).
  console.log(`  ${x.role.padEnd(17)} ${pass} of ${mine.length} pass  ·  plan median ${plans[plans.length >> 1]}, `
    + `largest ${plans.at(-1)}  ·  ${mine.filter((o) => o.retried).length} retried, `
    + `${mine.filter((o) => !o.answered).length} with no answer`);
  if (pass < mine.length) failed = true;
}
console.log(failed ? '\n  FAIL — a role that failed comes off WEAVING_ROLES before release.\n' : '\n  PASS\n');
wipe();
process.exit(failed ? 1 : 0);
