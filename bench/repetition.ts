// Repetition: does a light `repetition_penalty` keep a remote passage out of a loop? (#62)
//
// On this machine the DRY sampler keeps prose out of a loop. Featherless is not sent DRY, and
// nothing else stands in for it, so a remote passage has no guard at all. On 2026-10-22
// TheDrummer/Anubis-70B-v1.2 wrote two takes that were nothing but exclamation marks ("The!!!!…",
// 4,977 characters; "Her!!!!…", 1,803). Featherless documents `repetition_penalty`. This measures
// whether a light one helps before the app sends it: `REMOTE_REPETITION_PENALTY` in src/routes.ts
// stays null until this has run, and is then set to the value chosen here, or left null with the
// reason written down.
//
//   node --experimental-strip-types bench/repetition.ts check   # the detector and the tally, no network
//   node --experimental-strip-types bench/repetition.ts [runs]  # real Featherless, runs per arm (3)
//
// RUN THE REAL ONE ONLY WHEN NOBODY IS WRITING. Every call goes to the real Featherless with this
// server's key, one at a time. Anubis-70B costs all four of the plan's units, so a writer on a
// remote model during the run gets "Featherless is busy", and the run gets the same 429s back.
// Two models, three arms, `runs` each: 18 calls at the default, about 6,800 prompt tokens each.
//
// THE REAL PROMPT, AND NEVER THE LIVE LIBRARY. The book is "Into the Blue", read from a SCRATCH COPY
// of the live library taken with `VACUUM INTO` over a read-only connection: the live file is never
// opened for writing and the copy is deleted at the end. Every call goes through `POST /api/generate`
// non-streaming, so the prompt, the budget, the cap and the sampler are the ones the app sends; the
// non-streaming path writes no passage, so the book is the same for every call. The arm is the only
// difference: `repetition_penalty` rides in the writer's sampler, which the route spreads into the
// call, and the Featherless adapter passes it because Featherless documents it.
//
// NON-STREAMING ON PURPOSE. The writer's stream is now stopped at its cap by Anansi (#62), which would
// hide how long the model itself runs. This path is not stopped, so the length below is the model's.
//
// ARMS INTERLEAVED. Round by round, every model and every arm once, so a drift in Featherless over
// the run lands on every arm alike. Only arms of one run are comparable with each other (F55).

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { input } from '../test/fixture.ts';

const CHECK = process.argv[2] === 'check';
const RUNS = CHECK ? 1 : Math.max(1, Number(process.argv[2]) || 3);
const LIVE = `${process.env.HOME}/Documents/repositories/sonophage/anansi/anansi.db`;
const BOOK = 'Into the Blue';
const MODELS = ['TheDrummer/Anubis-70B-v1.2', 'Tetratype/Gemma-4-26B-A4B-it-heretic-antislop'];
/** null is "none": the key is not sent at all, which is what the app sends today. */
const ARMS: (number | null)[] = [null, 1.05, 1.1];
const DB = `/tmp/anansi-repetition-${process.pid}.db`;
const wipe = (f: string) => { for (const x of ['', '-wal', '-shm']) { try { unlinkSync(f + x); } catch {} } };
// THE COPY GOES ON EVERY EXIT, not only the clean ones. The real run's copy holds a writer's book,
// and a red check or a thrown error used to leave it in /tmp: five were found there on 2026-10-22.
process.on('exit', () => wipe(DB));

/* ---------- the detector ---------- */

/** What a runaway looks like, read off one passage. Three measures, because a loop takes three
 *  shapes: one character over and over (the exclamation marks), one word over and over, and one
 *  phrase over and over (a sentence the model cannot get out of). */
export function repetition(text: string) {
  // The longest run of one character that is not a space. Prose has "..." and "——"; a loop has
  // thousands.
  let charRun = 0, cur = 0, prev = '';
  for (const ch of text) {
    if (/\s/.test(ch)) { cur = 0; prev = ''; continue; }
    cur = ch === prev ? cur + 1 : 1; prev = ch;
    if (cur > charRun) charRun = cur;
  }
  // Words and runs of punctuation, as tokens. "No, no, no." is six tokens and no word repeats
  // back to back; "the the the" repeats.
  const toks = text.toLowerCase().match(/[\p{L}\p{N}'’]+|[^\s\p{L}\p{N}]+/gu) ?? [];
  let wordRun = 0; cur = 0;
  for (let i = 0; i < toks.length; i++) {
    cur = i > 0 && toks[i] === toks[i - 1] ? cur + 1 : 1;
    if (cur > wordRun) wordRun = cur;
  }
  // The share of the text that is its most frequent four-token phrase, counted without overlap.
  // Only a phrase seen three times or more counts: twice is a refrain, and prose has refrains.
  const N = 4, seen = new Map<string, { n: number; last: number }>();
  for (let i = 0; i + N <= toks.length; i++) {
    const k = toks.slice(i, i + N).join(' ');
    const s = seen.get(k) ?? { n: 0, last: -N };
    if (i - s.last >= N) { s.n++; s.last = i; }
    seen.set(k, s);
  }
  const top = Math.max(0, ...[...seen.values()].map((s) => s.n));
  const phraseShare = top >= 3 && toks.length ? +(top * N / toks.length).toFixed(3) : 0;
  return { charRun, wordRun, phraseShare, chars: text.length, words: toks.filter((t) => /\p{L}/u.test(t)).length };
}
/** The thresholds, set against the fixtures in `check` from both sides: each is far above any
 *  prose case there and far below every loop case. */
export const runaway = (m: ReturnType<typeof repetition>) =>
  m.charRun >= 12 || m.wordRun >= 6 || m.phraseShare >= 0.15;

/** The scratch copy. `VACUUM INTO` over a read-only connection: SQLite writes a fresh, consistent
 *  database at `to` and opens nothing for writing at `from`, WAL included. */
export function scratchCopy(from: string, to: string) {
  wipe(to);
  const src = new DatabaseSync(from, { readOnly: true });
  try { src.prepare('VACUUM INTO ?').run(to); } finally { src.close(); }
}

/* ---------- the fake Featherless, for `check` only ---------- */

/** What reached the fake, newest last. */
const seen: any[] = [];
/** The answer the fake gives, by the arm it was sent: the tally below must tell these apart. */
const LOOP_CHARS = 'The' + '!'.repeat(1800);
const LOOP_PHRASE = 'She looked at the door. '.repeat(30);
const CLEAN = 'Rain came down on the canal. Aldis counted the coins twice and found the same short sum.';
if (CHECK) {
  const KEY = '/tmp/anansi-repetition-check.key';
  writeFileSync(KEY, 'fl-check-key\n');
  process.env.ANANSI_FEATHERLESS_KEY_FILE = KEY;
  const srv = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const b = JSON.parse(raw || '{}');
      const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/v1/tokenize') return send({ count: 400 });
      seen.push(b);
      const p = b.repetition_penalty;
      const content = p == null ? LOOP_CHARS : p < 1.08 ? LOOP_PHRASE : CLEAN;
      send({ choices: [{ message: { content }, finish_reason: p == null ? 'length' : 'stop' }],
             usage: { prompt_tokens: 400, completion_tokens: p == null ? 1799 : 300 } });
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  srv.unref();
  process.env.ANANSI_FEATHERLESS_URL = `http://127.0.0.1:${(srv.address() as any).port}/v1`;
  wipe(DB);
} else {
  scratchCopy(LIVE, DB);
}
process.env.ANANSI_DB = DB;

// Imported AFTER the database and the host are set: both are read once, at module load.
const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { capFor } = await import('../src/story.ts');
const { chat } = await import('../src/llama.ts');
const { catalogueEntry } = await import('../src/catalogue.ts');

/** The book and its owner: the fixture in `check`, "Into the Blue" from the copy for real. */
const book = (() => {
  if (CHECK) {
    const me = db.owner('repetition');
    const s = db.createStory(me, { title: input.story.title, genre: input.story.genre, premise: input.story.premise,
      setting: input.story.setting, pov: input.story.pov, writingStyle: input.story.writingStyle });
    for (const p of input.passages) db.addPassage({ ...s, storyId: s.id, body: p.body });
    return { id: s.id, owner: me };
  }
  const r = db.db.prepare('SELECT id, owner_id FROM stories WHERE title = ?').get(BOOK) as any;
  if (!r) { console.error(`  no book called "${BOOK}" in the copy`); wipe(DB); process.exit(1); }
  return { id: r.id as string, owner: r.owner_id as string };
})();
// One model at a time, chosen by the writer default; no pin and no weaving, so the arm is the
// only thing that differs. In the copy only.
db.updateStory(book.id, { model: null, weaving: false });
for (const m of MODELS) {
  const id = `featherless:${m}`;
  if (db.shortlisted(book.owner, id) != null) continue;
  const context = CHECK ? 32768 : (await catalogueEntry(m))?.context ?? 32768;
  db.addToShortlist(book.owner, id, context);
}

/** The writer's sampler as serve.ts starts it (its GEN), plus the arm. */
const gen = (arm: number | null) => ({ temperature: 0.85, top_p: 0.95, min_p: 0.05, dry_multiplier: 0,
  xtc_probability: 0, target_words: 0, max_tokens: capFor(0), ...(arm == null ? {} : { repetition_penalty: arm }) });
const ctx = (model: string, arm: number | null) => ({ body: { storyId: book.id, mode: 'continue' },
  query: new URLSearchParams(), owner: book.owner, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
  gen: gen(arm), setGen: () => {}, defaultModel: `featherless:${model}`, setDefaultModel: () => {},
  otherDefaults: () => [], admin: false, demo: false, setDemo: () => {} }) as any;

type Outcome = { model: string; arm: number | null; error?: string; tokens: number | null; cap: number;
  finishedAtCap: boolean; seconds: number } & ReturnType<typeof repetition>;
const once = async (model: string, arm: number | null): Promise<Outcome> => {
  const t0 = Date.now();
  const r: any = await routes['POST /api/generate'](ctx(model, arm));
  const row = db.db.prepare('SELECT completion_tokens, params FROM generations ORDER BY rowid DESC LIMIT 1').get() as any;
  const cap = Number(JSON.parse(row?.params ?? '{}').max_tokens) || capFor(0);
  return { model, arm, error: r.error, tokens: row?.completion_tokens ?? null, cap, finishedAtCap: !!r.cut,
           seconds: +((Date.now() - t0) / 1000).toFixed(1), ...repetition(String(r.prose ?? '')) };
};
const runAll = async (runs: number, log: (o: Outcome, i: number) => void) => {
  const all: Outcome[] = [];
  for (let i = 1; i <= runs; i++)
    for (const m of MODELS) for (const a of ARMS) { const o = await once(m, a); all.push(o); log(o, i); }
  return all;
};

if (CHECK) {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };
  console.log('\n  repetition check — the detector and the tally, before anything they say is believed\n');

  // Every loop shape is caught, including the two takes that started this.
  const loops: [string, string][] = [
    ['"The!!!!…", 4,977 characters, as Anubis wrote it', 'The' + '!'.repeat(4974)],
    ['"Her!!!!…", 1,803 characters', 'Her' + '!'.repeat(1800)],
    ['one sentence, over and over', LOOP_PHRASE],
    ['one word, over and over', 'He said ' + 'the '.repeat(12) + 'end.'],
    ['a good start that falls into a loop', input.passages[0].body + ' ' + 'and the door, '.repeat(40)],
  ];
  for (const [what, text] of loops) ok(`a loop is caught: ${what}`, runaway(repetition(text)));
  // And prose is left alone: the book fixture, which was not written for this, and prose that
  // repeats on purpose.
  for (const p of input.passages) ok(`fixture prose is not a loop: ${p.body.slice(0, 40)}…`, !runaway(repetition(p.body)));
  ok('the whole fixture book together is not a loop', !runaway(repetition(input.passages.map((p) => p.body).join('\n\n'))));
  const ON_PURPOSE = '"No, no, no." She shook her head. "No." The rain kept on — on and on — and she waited... '
    + 'Ha ha, he said. He was not sorry. He was not sorry at all. Somewhere a bell rang, and rang, and rang again. '
    + '"Again," she said. "Again." Noooo, thought Aldis, not tonight. Not tonight, and not here.';
  ok('prose that repeats on purpose (a refrain, an echo, dashes, a held vowel) is not a loop', !runaway(repetition(ON_PURPOSE)));
  ok('an empty passage is not a loop', !runaway(repetition('')));
  const m = repetition('The' + '!'.repeat(4974));
  ok('the character run is measured, not just flagged (4,974)', m.charRun === 4974);
  // Six tokens a sentence ("she looked at the door ."), so its best four-token phrase covers 30 × 4
  // of 180: two thirds, by hand.
  ok('a sentence looped thirty times is two thirds one phrase (0.667)', repetition(LOOP_PHRASE).phraseShare === 0.667);

  // The scratch copy: the source comes out byte for byte the same, and the copy holds its rows.
  const SRC = `/tmp/anansi-repetition-src-${process.pid}.db`, COPY = `/tmp/anansi-repetition-copy-${process.pid}.db`;
  wipe(SRC);
  const src = new DatabaseSync(SRC);
  src.exec("PRAGMA journal_mode = WAL; CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('kept');");
  // The main file and its WAL, where the row written above still is.
  const hash = () => createHash('sha256').update(readFileSync(SRC)).update(readFileSync(SRC + '-wal')).digest('hex');
  const before = hash();
  scratchCopy(SRC, COPY);
  const copy = new DatabaseSync(COPY);
  ok('the copy holds the rows, WAL included', (copy.prepare('SELECT x FROM t').get() as any)?.x === 'kept');
  copy.exec("INSERT INTO t VALUES ('scratch')"); copy.close();
  ok('the source file is unchanged by the copy, and by writing to the copy', hash() === before);
  ok('and the source still has one row', (src.prepare('SELECT count(*) n FROM t').get() as any).n === 1);
  src.close(); wipe(SRC); wipe(COPY);

  // The arms, through the app's own route, against the fake.
  const out = await runAll(1, () => {});
  ok('every model and every arm made one call', out.length === MODELS.length * ARMS.length && out.every((o) => !o.error));
  ok('each call went to its model, under Featherless\'s own id',
     MODELS.every((mm, i) => seen.slice(i * ARMS.length, (i + 1) * ARMS.length).every((b) => b.model === mm)));
  ok('ARM-NONE: the "none" arm sends no repetition penalty at all',
     seen.filter((_, i) => i % ARMS.length === 0).every((b) => !('repetition_penalty' in b)));
  ok('ARM-VALUE: each other arm sends its own value, through the writer\'s sampler',
     seen.every((b, i) => ARMS[i % ARMS.length] == null || b.repetition_penalty === ARMS[i % ARMS.length]));
  ok('the tally: a character loop and a phrase loop are runaways, clean prose is not',
     out.every((o) => runaway(o) === (o.arm == null || o.arm < 1.08)));
  ok('the length is read off the row, and a take past its cap is seen as one',
     out.every((o) => o.arm != null || (o.tokens === 1799 && o.tokens > o.cap && o.finishedAtCap)));
  console.log(`\n  ${n} checks, all green`);
  wipe(DB);
  process.exit(0);
}

console.log(`\n  repetition — "${BOOK}", ${RUNS} run(s) per arm, arms ${ARMS.map((a) => a ?? 'none').join(' / ')}, `
  + 'one call at a time, from a scratch copy of the library.\n');

// THE CHUNK CHECK, first and once per model. The cap in the writer's stream counts content chunks
// as tokens; this is what says whether Featherless sends one token a chunk. A short prompt, which
// Featherless honoured to the token on 2026-10-22, and a small cap, so the stream ends on its own
// and its `usage` arrives.
for (const m of MODELS) {
  let chunks = 0;
  try {
    const r = await chat('You are a novelist.', 'Write one long paragraph about a harbour at night.',
      { model: `featherless:${m}`, max_tokens: 120 }, () => { chunks++; });
    console.log(`  chunks  ${m.padEnd(50)} ${chunks} content chunks, ${r.usage?.completion_tokens ?? '?'} tokens by usage, `
      + `finish ${r.finish || '?'}`);
  } catch (e: any) { console.log(`  chunks  ${m.padEnd(50)} failed: ${String(e?.message ?? e).slice(0, 120)}`); }
}
console.log('');

const label = (a: number | null) => (a == null ? 'none' : String(a)).padEnd(5);
const all = await runAll(RUNS, (o, i) => console.log(`  ${o.model.split('/')[1].slice(0, 24).padEnd(24)} ${label(o.arm)} ${String(i).padStart(2)}  `
  + `${runaway(o) ? 'RUNAWAY' : 'clean  '}  char ${String(o.charRun).padStart(5)}  word ${String(o.wordRun).padStart(3)}  `
  + `phrase ${o.phraseShare.toFixed(2)}  ${String(o.words).padStart(5)} words  ${String(o.tokens ?? '?').padStart(5)}/${o.cap} tok`
  + `${o.finishedAtCap ? ' (length)' : ''}  ${o.seconds}s${o.error ? `  ${o.error.slice(0, 100)}` : ''}`));

const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
console.log('');
for (const m of MODELS) for (const a of ARMS) {
  const mine = all.filter((o) => o.model === m && o.arm === a && !o.error);
  const failed = all.filter((o) => o.model === m && o.arm === a && o.error).length;
  // Out of how many could have run away: every call that answered (F10).
  console.log(`  ${m.split('/')[1].slice(0, 24).padEnd(24)} ${label(a)}  ${mine.filter(runaway).length} of ${mine.length} runaway`
    + `  ·  ${mine.filter((o) => (o.tokens ?? 0) > o.cap).length} past the cap`
    + `  ·  words median ${med(mine.map((o) => o.words))}  ·  tokens median ${med(mine.map((o) => o.tokens ?? 0))}, `
    + `largest ${Math.max(0, ...mine.map((o) => o.tokens ?? 0))}  ·  longest char run ${Math.max(0, ...mine.map((o) => o.charRun))}`
    + `${failed ? `  ·  ${failed} failed` : ''}`);
}
console.log('\n  A runaway is a run of 12 of one character, 6 of one word, or 15% of the text in one phrase.\n'
  + '  Read the arms against each other only: they ran together, against one book.\n');
wipe(DB);
process.exit(0);
