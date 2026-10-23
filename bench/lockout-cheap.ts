// Lockout-cheap: does a cheaper step keep most of weaving's lockout gain? (#68)
//
// F60 measured weaving (thinking on, a plan of about 3,300 tokens, about 60 s a passage locally)
// cutting acting for the locked character from 34% to 4% of generations, counted with the pronoun.
// The plans showed the mechanism: 29 of 50 restated the lockout before writing. This asks whether
// the restatement alone, at a fraction of the cost, buys the same thing. Four arms:
//
//   off      weaving off: what ships for a book that does not weave.
//   weave    weaving on, at the app's own cap (the prose cap plus WEAVE_ROOM's room for prose).
//   rule     weaving off, and one line at the very end of the prompt that restates the lockout.
//   ask      weaving off, two calls: a tiny one (60 tokens) asking whose actions it must not write,
//            and its answer fed back as a line of the directive for the prose call.
//
//   node --experimental-strip-types bench/lockout-cheap.ts check          # detectors and arms, no network
//   node --experimental-strip-types bench/lockout-cheap.ts [rounds]       # the local model, rounds (50)
//   node --experimental-strip-types bench/lockout-cheap.ts report <dir>   # re-score a run from its prose
//
// RUN THE REAL ONE ONLY WHEN NOBODY IS WRITING. It keeps both slots of the local router on :8080
// (or ANANSI_LLAMA) busy for the whole run, and a writer's passage on top of that is the
// oversubscribed slot CLAUDE.md warns about.
//
// THE REAL PROMPT, AND NEVER THE LIVE LIBRARY. "Into the Blue" is read from a SCRATCH COPY of the
// live library taken with `VACUUM INTO` over a read-only connection, the same way
// bench/repetition.ts does it; the copy is deleted on every exit. Every call goes through
// `POST /api/generate`, non-streaming, so the prompt, the lockout line, the budget, the cap and the
// weaving switch are the app's own. The non-streaming path writes no passage, so the book is the
// same for every call. Nothing in the app changes for any arm:
//   weave  is the book's own weaving switch, set in the copy;
//   rule   is the writer's own wording for Direct (the prompts editor's override, `db.setPrompt`),
//          set in the copy to whatever Direct says for this writer now plus one line. MODE is the
//          last block in ORDER, so the line is the last line of the prompt;
//   ask    is two ordinary Direct calls: the question is the first call's directive, at a 60-token
//          cap, and the answer is a line of the second call's directive.
// The switch and the override are per book and per writer, not per call, so each call sets both
// for its arm immediately before it starts. `generate` reads them before its first `await`, so two
// calls in flight cannot see each other's. That is an ordering fact about routes.ts, so it is not
// trusted: every call is checked against what it actually sent (`verify`), and the run stops on the
// first call that sent the wrong arm.
//
// ARMS INTERLEAVED AND TWO AT A TIME. Round by round, every arm once, in an order that rotates each
// round, through two workers, one per slot of the router; no call waits in the router's queue, so
// its latency is its own. The four arms of a round share one seed. Only arms of one run are
// comparable with each other (F55): nothing here carries F60's numbers forward.
//
// TWO COUNTS OF A LEAK, and the pronoun one is the one this is about. `bench/lockout-book.ts`'s
// `score` counts by NAME only (its floor rule) and F60 found it saw 2 of 17 leaks. The pronoun
// count is F60's rule unchanged: "he" or the name, then one of lockout-book's verb forms, over
// narration with dialogue stripped. It is only valid where the locked character is the only man in
// the scene, which in this book's scene he is (Halsey is "she"); `check` proves it breaks in a book
// where he is not, and the real run prints the flagged sentences so that can be read, not assumed.

import { createServer } from 'node:http';
import { appendFileSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { input } from '../test/fixture.ts';
import { score, FORMS } from './lockout-book.ts';
import { strip } from './interiority-verdict.ts';
import { fisher } from './stats.ts';

const MODE_ARG = process.argv[2];
const CHECK = MODE_ARG === 'check';
const REPORT = MODE_ARG === 'report';
const ROUNDS = CHECK ? 2 : Math.max(1, Number(MODE_ARG) || 50);
const LIVE = `${process.env.HOME}/Documents/repositories/sonophage/anansi/anansi.db`;
const BOOK = 'Into the Blue';
const WHO = 'Seth';
// F60's directive. It moves the scene and says nothing about what he does: a directive naming him
// would BE the writer writing him.
const DIRECTIVE = "Halsey's voice breaks and the room goes quiet.";
/** The restatement, built from the lockout line's own phrases ("belongs to the writer", "what
 *  happens to"), with the name where a pronoun would guess his gender. `check` and the real run both
 *  assert those phrases are in the lockout line the app actually sends. */
const RULE = `Before you write: ${WHO} belongs to the writer — write what happens to ${WHO}, never what ${WHO} does.`;
const LOCKOUT_PHRASES = [`${WHO} belongs to the writer`, `what happens to ${WHO}`];
/** The first call of `ask`. It names no character, so the answer is the model reading its own
 *  prompt, not repeating ours. */
const QUESTION = 'Do not write the passage yet. Answer in one sentence that begins "I must not write": '
  + 'whose actions must you not write?';
const ASK_CAP = 60;
const ARMS = ['off', 'weave', 'rule', 'ask'] as const;
type Arm = (typeof ARMS)[number];

/* ---------- the pronoun-counted detector ---------- */

const NAME = WHO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** F60's rule, exactly: `\b(he|<name>)\s+<verb form>\b`, no adverb allowed between. */
const PRONOUN_ACTED = new RegExp(`\\b(?:he|${NAME})\\s+(?:${FORMS.join('|')})\\b`, 'i');
export const pronounActs = (prose: string) =>
  strip(prose).match(new RegExp(PRONOUN_ACTED.source, 'gi')) ?? [];
/** One passage, both counts. `about` is the informative denominator (F10): a passage with neither
 *  "he" nor the name in its narration could not have leaked by either count. */
export const leak = (prose: string) => {
  const s = score(prose);
  const narr = strip(prose);
  return { pron: PRONOUN_ACTED.test(narr), name: s.acted,
           about: new RegExp(`\\b(?:he|${NAME})\\b`, 'i').test(narr), words: s.words };
};

/* ---------- the scratch copy (bench/repetition.ts's, same three lines) ---------- */

const DB = `/tmp/anansi-lockout-cheap-${process.pid}.db`;
const wipe = (f: string) => { for (const x of ['', '-wal', '-shm']) { try { unlinkSync(f + x); } catch {} } };
// THE COPY GOES ON EVERY EXIT: it holds a writer's book. An interrupt is turned into an exit so the
// handler runs for it too.
process.on('exit', () => wipe(DB));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(130));
const scratchCopy = (from: string, to: string) => {
  wipe(to);
  const src = new DatabaseSync(from, { readOnly: true });
  try { src.prepare('VACUUM INTO ?').run(to); } finally { src.close(); }
};

/* ---------- the report, shared by the real run and `report` ---------- */

type Row = { round: number; arm: Arm; seed: number; error?: string; prose?: string; seconds?: number;
  modelSeconds?: number; askSeconds?: number; asked?: string; plan?: number; maxTokens?: number };
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const pc = (k: number, n: number) => `${k}/${n} (${n ? (k / n * 100).toFixed(0) : '-'}%)`;
function report(rows: Row[]) {
  const by = (a: Arm) => rows.filter((r) => r.arm === a && !r.error && r.prose != null);
  const base = by('off').map((r) => leak(r.prose!));
  console.log(`\n  "${BOOK}" · locked ${WHO} · directive ${JSON.stringify(DIRECTIVE)}\n`);
  console.log('  arm     usable  failed  could   acted, pronoun-counted      acted, name-counted   '
    + 'latency median / largest   words median');
  for (const a of ARMS) {
    const ok = by(a), s = ok.map((r) => leak(r.prose!));
    const failed = rows.filter((r) => r.arm === a && r.error).length;
    const k = s.filter((x) => x.pron).length, kn = s.filter((x) => x.name).length;
    const kb = base.filter((x) => x.pron).length;
    const p = a === 'off' ? '' : `  p ${fisher(kb, base.length - kb, k, s.length - k).toFixed(4)} vs off`;
    const secs = ok.map((r) => r.seconds ?? NaN);
    console.log(`  ${a.padEnd(7)} ${String(ok.length).padStart(6)}  ${String(failed).padStart(6)}  `
      + `${String(s.filter((x) => x.about).length).padStart(6)}   ${pc(k, ok.length).padEnd(12)}${p.padEnd(18)}`
      + `${pc(kn, ok.length).padEnd(22)}${`${med(secs)} s / ${Math.max(0, ...secs)} s`.padEnd(27)}`
      + `${med(s.map((x) => x.words))}`);
  }
  const ask = by('ask');
  if (ask.length) console.log(`\n  ask: ${ask.filter((r) => new RegExp(NAME, 'i').test(r.asked ?? '')).length} of `
    + `${ask.length} answers named ${WHO}; median ${med(ask.map((r) => r.askSeconds ?? NaN))} s for the question.`);
  const weave = by('weave');
  if (weave.length) console.log(`  weave: plan median ${med(weave.map((r) => r.plan ?? 0))} tokens, largest `
    + `${Math.max(0, ...weave.map((r) => r.plan ?? 0))}, sent with max_tokens ${weave[0].maxTokens}.`);
  // What the pronoun count actually caught, so its one assumption (he is the locked man) can be
  // read off the run rather than taken on trust.
  console.log('\n  What the pronoun count flagged, up to three an arm:');
  for (const a of ARMS) for (const r of by(a).filter((x) => leak(x.prose!).pron).slice(0, 3)) {
    const hit = pronounActs(r.prose!)[0];
    const at = strip(r.prose!).indexOf(hit);
    console.log(`    ${a.padEnd(6)} …${strip(r.prose!).slice(Math.max(0, at - 60), at + 60).replace(/\s+/g, ' ')}…`);
  }
  console.log('\n  "could" is the informative denominator: passages whose narration has "he" or the name.\n'
    + '  The name count is a floor (lockout-book\'s rule); the pronoun count assumes he is the only man.\n'
    + '  "latency" is the wall clock of the arm, both calls for ask. Read the arms against each other only.\n');
}

if (REPORT) {
  const dir = process.argv[3];
  if (!dir) { console.error('  report <dir>: the directory a real run wrote run.jsonl into'); process.exit(1); }
  report(readFileSync(`${dir}/run.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
  process.exit(0);
}

/* ---------- the fake router, for `check` only ---------- */

/** Every request that reached the fake, newest last. */
const seen: any[] = [];
const userOf = (b: any) => String(b.messages?.find((m: any) => m.role === 'user')?.content ?? '');
/** What the fake writes, by what it was sent: each arm's answer is a different kind of passage, so
 *  the tally below must tell them apart. */
const FAKE = {
  asked: `I must not write ${WHO}'s actions.`,
  off: 'He watches her. The kettle ticks as it cools.',            // a pronoun-only leak
  weave: 'The room goes quiet. Halsey looks at the door.',          // no leak
  rule: `${WHO} stops typing. The rain keeps on.`,                  // a leak by name, so by both counts
  ask: '"He watches you," she says. Halsey turns away.',            // his pronoun only inside dialogue
};
if (CHECK) {
  const srv = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const b = JSON.parse(raw || '{}');
      const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 400 }, (_, i) => i) });
      seen.push(b);
      const u = userOf(b), woven = b.chat_template_kwargs?.enable_thinking === true;
      const content = b.max_tokens <= ASK_CAP ? FAKE.asked : woven ? FAKE.weave
        : u.trimEnd().split('\n').at(-2) === RULE ? FAKE.rule : u.includes(FAKE.asked) ? FAKE.ask : FAKE.off;
      // A little late, so the two workers really do have two calls in flight at once.
      setTimeout(() => send({ choices: [{ message: { content, reasoning_content: woven ? 'p'.repeat(4000) : '' },
        finish_reason: 'stop' }], usage: { prompt_tokens: 400, completion_tokens: 120,
        ...(woven ? { completion_tokens_details: { reasoning_tokens: 1000 } } : {}) } }), 15);
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  srv.unref();
  process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;
  wipe(DB);
} else {
  scratchCopy(LIVE, DB);
}
process.env.ANANSI_DB = DB;

// Imported AFTER the database and the host are set: both are read once, at module load.
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { capFor, defaultModePrompts } = await import('../src/story.ts');
const { slotFirstRead, model } = await import('../src/llama.ts');

/** The book and its owner: the fixture with the lockout on Seth in `check`, "Into the Blue" for real. */
const book = (() => {
  if (CHECK) {
    const me = db.owner('lockout-cheap');
    const s = db.createStory(me, { title: input.story.title, genre: input.story.genre, premise: input.story.premise,
      setting: input.story.setting, pov: input.story.pov, writingStyle: input.story.writingStyle });
    for (const p of input.passages) db.addPassage({ ...s, storyId: s.id, body: p.body });
    db.updateStory(s.id, { lockedCharacter: WHO, lockoutOn: true });
    return { id: s.id as string, owner: me as string };
  }
  const r = db.db.prepare('SELECT id, owner_id, locked_character, lockout_on FROM stories WHERE title = ?').get(BOOK) as any;
  if (!r) { console.error(`  no book called "${BOOK}" in the copy`); process.exit(1); }
  if (r.locked_character !== WHO || r.lockout_on === 0) {
    console.error(`  "${BOOK}" is not locked on ${WHO} (locked: ${r.locked_character}, on: ${r.lockout_on}); `
      + 'this run would not measure the lockout'); process.exit(1);
  }
  return { id: r.id as string, owner: r.owner_id as string };
})();
// The local default writes every arm: no pin, so a book pinned to a remote model is not sent there.
// In the copy only.
db.updateStory(book.id, { model: null, weaving: false });
/** Direct as this writer has it now: their own wording if they have one, else the shipped one. */
const OWN_DIRECT = db.promptsOf(book.owner).direct ?? '';
const RULE_DIRECT = `${OWN_DIRECT || defaultModePrompts().direct}\n${RULE}`;

/** The writer's sampler as serve.ts starts it (its GEN). */
const gen = (cap = capFor(0)) => ({ temperature: 0.85, top_p: 0.95, min_p: 0.05, dry_multiplier: 0,
  xtc_probability: 0, target_words: 0, max_tokens: cap });
const slot = CHECK ? { global: 100_096, slots: 2, perSlot: 50_048 } : await slotFirstRead();
const ctx = (directive: string, seed: number, cap?: number) => ({
  body: { storyId: book.id, mode: 'direct', directive, seed }, query: new URLSearchParams(), owner: book.owner,
  slot, gen: gen(cap), setGen: () => {}, setDefaultModel: () => {}, otherDefaults: () => [],
  admin: false, demo: false, setDemo: () => {} }) as any;

/** One Direct call with this arm's book state, set in the same tick the call reads it. */
const call = (arm: Arm, directive: string, seed: number, cap?: number) => {
  db.updateStory(book.id, { weaving: arm === 'weave' });
  db.setPrompt(book.owner, 'direct', arm === 'rule' ? RULE_DIRECT : OWN_DIRECT);
  return routes['POST /api/generate'](ctx(directive, seed, cap)) as Promise<any>;
};

/** What a call really sent, read off its manifest and its generation row, against what its arm
 *  should have sent. A non-empty answer stops the run: the arms would not be the arms. */
const verify = (arm: Arm, r: any, asking = false) => {
  const blocks = (r.manifest?.blocks ?? []).filter((b: any) => b.state === 'included');
  const last = String(blocks.at(-1)?.text ?? '');
  const lockout = String(blocks.find((b: any) => b.kind === 'DIRECTIVE')?.text ?? '');
  const row = db.db.prepare('SELECT params FROM generations WHERE id = ?').get(r.genId) as any;
  const params = JSON.parse(row?.params ?? '{}');
  const bad: string[] = [];
  if (blocks.at(-1)?.kind !== 'MODE') bad.push(`the last block is ${blocks.at(-1)?.kind}, not MODE`);
  if (!LOCKOUT_PHRASES.every((p) => lockout.includes(p))) bad.push('the lockout line is not in the prompt');
  if ((params.weaving === true) !== (arm === 'weave' && !asking)) bad.push(`weaving ${params.weaving === true}`);
  if ((last.trimEnd().split('\n').at(-1) === RULE) !== (arm === 'rule')) bad.push('the rule line is wrong');
  if (asking !== last.includes(QUESTION)) bad.push('the question is wrong');
  return bad.join('; ');
};

/** The first sentence of the answer, so a model that answers and then starts writing is fed back
 *  its answer and not its passage. */
const firstSentence = (s: string) => (s.trim().match(/^[^\n]*?[.!?](?=\s|$)/)?.[0] ?? s.trim().split('\n')[0]).slice(0, 240);

async function once(round: number, arm: Arm, seed: number): Promise<Row> {
  const t0 = Date.now();
  let directive = DIRECTIVE, asked: string | undefined, askSeconds: number | undefined;
  try {
    if (arm === 'ask') {
      const q: any = await call(arm, QUESTION, seed, ASK_CAP);
      if (q.error) return { round, arm, seed, error: `the question: ${q.error}` };
      const wrong = verify(arm, q, true);
      if (wrong) throw Object.assign(new Error(`ask's question sent the wrong arm: ${wrong}`), { fatal: true });
      asked = firstSentence(String(q.prose ?? ''));
      askSeconds = +((Date.now() - t0) / 1000).toFixed(1);
      if (asked) directive = `${DIRECTIVE}\n${asked}`;
    }
    const r: any = await call(arm, directive, seed);
    if (r.error) return { round, arm, seed, asked, error: String(r.error) };
    const wrong = verify(arm, r);
    if (wrong) throw Object.assign(new Error(`${arm} sent the wrong arm: ${wrong}`), { fatal: true });
    const params = JSON.parse((db.db.prepare('SELECT params FROM generations WHERE id = ?').get(r.genId) as any).params);
    return { round, arm, seed, prose: String(r.prose ?? ''), seconds: +((Date.now() - t0) / 1000).toFixed(1),
             modelSeconds: r.seconds, asked, askSeconds, plan: params.plan, maxTokens: params.max_tokens };
  } catch (e: any) {
    if (e?.fatal) throw e;
    return { round, arm, seed, asked, error: `${e?.name ?? 'error'}: ${e?.message ?? e}` };
  }
}

/** Every round, every arm once, starting one arm later each round, one seed a round. */
const schedule = (rounds: number) => {
  const jobs: [number, Arm, number][] = [];
  for (let i = 0; i < rounds; i++) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    for (let k = 0; k < ARMS.length; k++) jobs.push([i + 1, ARMS[(i + k) % ARMS.length], seed]);
  }
  return jobs;
};
/** The schedule, through two workers: one per slot of the router. */
async function runAll(rounds: number, log: (r: Row) => void) {
  const jobs = schedule(rounds);
  const rows: Row[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) { const [i, a, s] = jobs[next++]; const r = await once(i, a, s); rows.push(r); log(r); }
  };
  await Promise.all([worker(), worker()]);
  return rows;
}

if (CHECK) {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };
  console.log('\n  lockout-cheap check — the pronoun count and the four arms, before anything they say is believed\n');

  // The pronoun count, synthetic, both ways.
  const flags: [string, string][] = [
    ['He watches her.', 'the OFF arm\'s leak in F60, verbatim: invisible to the name count'],
    ['He reaches for the cup.', 'F60\'s own validation case'],
    [`${WHO} stops typing.`, 'the line from the book itself, by name'],
    ['Halsey talks; he listens.', 'lower case, mid-sentence'],
    ['He turned to the window.', 'past tense'],
  ];
  for (const [t, why] of flags) ok(`flags: ${why}`, leak(t).pron);
  const quiet: [string, string][] = [
    ['She reaches for the cup.', 'F60\'s own other case: "she" ends in "he"'],
    ['"He watches you," she says.', 'his pronoun inside dialogue is not narration'],
    ['The ache stops when Halsey breathes.', 'a word ending in "he" is not "he"'],
    ['His hand stops.', 'a possessive is not the subject'],
    ['He is tired.', 'a state is not an action'],
    ['Halsey watches him.', 'him as the object'],
  ];
  for (const [t, why] of quiet) ok(`does not flag: ${why}`, !leak(t).pron);
  ok('the name count misses the pronoun leak the pronoun count is for', !leak('He watches her.').name);
  ok('the informative denominator: a passage with neither "he" nor the name could not have leaked',
     !leak('The room goes quiet. Halsey looks at the door.').about && leak('He is tired.').about);

  // Real prose it was not written for. Model prose out of this same book (bench/quote-detect.ts's
  // real failure and bench/ledger-audit.ts's line), she-led and present tense, must stay quiet.
  for (const t of ['She reaches into her pocket, pulls out a weather-beaten Martin guitar, and taps one against the filter.',
                   'She shrugs off the thrifted military jacket.'])
    ok(`real prose from the book, Halsey acting, does not flag: ${t.slice(0, 40)}…`, !leak(t).pron && !leak(t).name);
  // And test/fixture.ts, a book whose man is Aldis: the pronoun count fires on him. That is the
  // count's one assumption failing, on purpose, where it is known to fail. It is valid only in a
  // scene where the locked character is the only "he".
  const fired = input.passages.filter((p) => leak(p.body).pron).map((p) => p.id);
  ok(`the fixture book (he is Aldis, not ${WHO}): the pronoun count fires on p2's "He counted", and only there`,
     fired.join() === 'p2');
  ok('and the name count stays quiet on it, as it should', input.passages.every((p) => !leak(p.body).name));
  ok('the ceiling, stated as a case: in a two-man scene the pronoun count credits the other man to him',
     leak('Marek watches the door. He stops.').pron);

  // The restatement is built from the lockout line the app sends, not from a copy of it.
  const plain: any = await call('off', DIRECTIVE, 1);
  const lockout = String(plain.manifest.blocks.find((b: any) => b.kind === 'DIRECTIVE')?.text ?? '');
  ok('the rule\'s phrases are the lockout line\'s own', LOCKOUT_PHRASES.every((p) => lockout.includes(p)));
  ok('verify() passes a call that sent its own arm', verify('off', plain) === '');
  ok('verify() catches a call that did not send its arm (an off call checked as rule)', verify('rule', plain) !== '');

  // The arms, one at a time, against the fake: what each one sends.
  const sent = async (arm: Arm) => { const from = seen.length; const r = await once(1, arm, 7); return { r, b: seen.slice(from) }; };
  const off = await sent('off'), weave = await sent('weave'), rule = await sent('rule'), ask = await sent('ask');
  const last = (b: any) => userOf(b).trimEnd().split('\n');
  ok('OFF: one call, weaving off, the prose cap (900), and the prompt ends on Direct\'s own wording',
     off.b.length === 1 && off.b[0].chat_template_kwargs.enable_thinking === false && off.b[0].max_tokens === 900
     && !userOf(off.b[0]).includes(RULE) && last(off.b[0]).at(-1) === '</mode>');
  ok('WEAVE: one call, weaving on, at the app\'s own cap (900 + 5,000 room)',
     weave.b.length === 1 && weave.b[0].chat_template_kwargs.enable_thinking === true && weave.b[0].max_tokens === 5900
     && weave.r.plan === 1000);
  ok('RULE: one call, weaving off, 900, and the rule is the last line of the prompt',
     rule.b.length === 1 && rule.b[0].chat_template_kwargs.enable_thinking === false && rule.b[0].max_tokens === 900
     && last(rule.b[0]).at(-2) === RULE && last(rule.b[0]).at(-1) === '</mode>');
  ok('RULE: the line rides on Direct\'s own wording, which is otherwise the same as OFF\'s',
     userOf(rule.b[0]).replace(`\n${RULE}`, '') === userOf(off.b[0]));
  ok(`ASK: a first call, weaving off, capped at ${ASK_CAP}, carrying the question and no rule`,
     ask.b.length === 2 && ask.b[0].max_tokens === ASK_CAP && ask.b[0].chat_template_kwargs.enable_thinking === false
     && userOf(ask.b[0]).includes(QUESTION) && !userOf(ask.b[0]).includes(RULE));
  ok('ASK: then the prose call, weaving off, 900, with the answer as a line of the directive',
     ask.b[1].max_tokens === 900 && ask.b[1].chat_template_kwargs.enable_thinking === false
     && userOf(ask.b[1]).includes(`${DIRECTIVE}\n${FAKE.asked}`) && ask.r.asked === FAKE.asked);
  ok('every arm of one round is sent the same seed', [off, weave, rule].every((x) => x.b[0].seed === 7)
     && ask.b.every((b: any) => b.seed === 7));

  // The whole schedule, two in flight, and the tally from it.
  const rows = await runAll(ROUNDS, () => {});
  ok(`the schedule: ${ROUNDS} rounds × 4 arms, none failed, none sent another arm's state`,
     rows.length === ROUNDS * 4 && rows.every((r) => !r.error));
  const jobs = schedule(2);
  ok('the order rotates (round 1 starts with off, round 2 with weave) and a round shares one seed',
     jobs.map((j) => j[1]).join() === 'off,weave,rule,ask,weave,rule,ask,off'
     && jobs.slice(0, 4).every((j) => j[2] === jobs[0][2]));
  const tally = (a: Arm) => rows.filter((r) => r.arm === a).map((r) => leak(r.prose!));
  ok('the tally: OFF\'s pronoun leak is counted by pronoun and not by name',
     tally('off').every((x) => x.pron && !x.name));
  ok('the tally: RULE\'s leak by name is counted by both', tally('rule').every((x) => x.pron && x.name));
  ok('the tally: WEAVE\'s and ASK\'s clean passages are not leaks', [...tally('weave'), ...tally('ask')].every((x) => !x.pron && !x.name));
  console.log(`\n  ${n} checks, all green`);
  process.exit(0);
}

const OUTDIR = process.env.ANANSI_OUT ?? `/tmp/anansi-lockout-cheap-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(OUTDIR, { recursive: true });
const OUT = `${OUTDIR}/run.jsonl`;
console.log(`\n  lockout-cheap — "${BOOK}", ${ROUNDS} rounds × ${ARMS.join(' / ')}, model ${model()}, `
  + `${slot.perSlot} tokens a slot, two calls in flight. From a scratch copy of the library.\n  rows -> ${OUT}\n`);
const rows = await runAll(ROUNDS, (r) => {
  appendFileSync(OUT, JSON.stringify(r) + '\n');
  const s = r.prose != null ? leak(r.prose) : null;
  console.log(`  ${String(r.round).padStart(3)} ${r.arm.padEnd(6)} `
    + (r.error ? `FAILED ${r.error.slice(0, 120)}`
      : `${s!.pron ? 'ACTS ' : 'clean'} ${s!.name ? 'by name' : '       '} ${String(s!.words).padStart(4)} words  `
        + `${r.seconds} s${r.arm === 'ask' ? `  asked: ${JSON.stringify(r.asked ?? '').slice(0, 70)}` : ''}`
        + `${r.arm === 'weave' ? `  plan ${r.plan}` : ''}`));
});
report(rows);
process.exit(0);
