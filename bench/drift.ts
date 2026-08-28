// Drift: what the meter says a prompt costs, against what the server charged for it.
//
// SPEC §7.5 asks for this in one line — *"compare `manifest.totals.used` against
// `generations.prompt_tokens` on every call and surface the drift. Both numbers are already
// recorded."* Implemented as written, it is a detector that reports perfection, and this file
// exists because of that sentence rather than in spite of it.
//
// WHY THE OBVIOUS IMPLEMENTATION MEASURES NOTHING. `src/routes.ts:258` does
// `manifest.totals.used = exact` — it overwrites the estimate with the `/tokenize` count BEFORE
// `logGeneration` stores the manifest. So a stored `totals.used` is not the estimate; it is the
// truth, already. On the first row in Seth's library: `totals.used` 5,133 against
// `prompt_tokens` 5,148, a 0.3% gap, on a call whose blocks actually summed to 7,824. Reading
// the field SPEC names reports a 1.52x estimator error as 0.3%.
//
// The estimate survives in `manifest.blocks`. `src/context.ts:664` is
// `blocks.filter(b => b.state === 'included').reduce((n, b) => n + b.tokens, 0)` — that IS
// `totals.used` before the overwrite, and it is what this file sums. The check below plants a
// manifest with an overwritten `totals.used` beside inflated blocks precisely so that anyone who
// "simplifies" this back to the field gets a red instead of a clean bill of health.
//
//   node --experimental-strip-types bench/drift.ts check   # the detector, no db, no model
//   node --experimental-strip-types bench/drift.ts         # the report, read-only db
//
// What this measures and what it does not:
//
// - `render` comes from `src/render.ts` — imported, not copied. It takes only types, so it can be
//   reached without waking `src/db.ts`. The prompt is rebuilt from the stored blocks and measured
//   in characters, so the headline number — CHARACTERS PER TOKEN — depends on no estimator at all.
//   It is ground truth, and 2a's constant is a consequence of it rather than an input to it.
// - The current constant is READ OUT OF `src/story.ts` rather than pasted here. When 2a lands and
//   the divisor changes, this report follows it; if the line changes shape, `check` goes red
//   rather than the report going quietly wrong against a number nobody updated.
// - SYSTEM is prepended by `render` and is NOT a block (`src/render.ts:59`), which is PLAN-06 §2d.
//   The rebuild therefore uses TODAY'S SYSTEM against a row generated whenever it was generated.
//   SYSTEM is 21% of the median prompt in Seth's library as measured — not the 8% guessed when
//   this was written — so a rewrite of a few lines moves a row's ratio by a fraction of a per
//   cent, and a rewrite of SYSTEM itself invalidates old rows. The report says how old they are
//   so a reader can judge it. This is the one place the rebuild is not exact.
// - `prompt_tokens` is what the SERVER charged, which includes the chat template's own wrapping;
//   `count(prompt)` at `src/routes.ts:257` measures the prompt alone. The gap between them is a
//   handful of tokens and is reported rather than hidden, because it is a constant offset that
//   would otherwise be read as estimator error.
// - Only rows holding BOTH a manifest and a `prompt_tokens` can answer. `logGeneration` nulls all
//   but the newest 200 manifests (`src/db.ts:1514`), and `talk` and `invent` calls store a
//   manifest with no token count at all. The denominator is reported everywhere. F10 is what
//   happens when it is not.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { render } from '../src/render.ts';
import type { Manifest } from '../src/context.ts';

/** The estimate, as it stood before the overwrite. `src/context.ts:664`, restated — this is the
 *  one line of the engine this file reproduces, because the value it produced is not stored. */
export const blockSum = (m: Manifest): number =>
  m.blocks.filter((b) => b.state === 'included').reduce((n, b) => n + b.tokens, 0);

/** The divisor in force, read from source. `src/story.ts:129` is the only definition, and 2a is
 *  going to change it. A pasted copy here would report the old constant's error forever. */
export function divisorInForce(src: string): number | null {
  const m = src.match(/Math\.ceil\(\s*t\.length\s*\/\s*([\d.]+)\s*\)/);
  return m ? Number(m[1]) : null;
}

/** Median, not mean. One overflowing prompt should not choose the constant for every other call.
 *  Even n returns the lower of the two middles rather than their average: every input here is a
 *  real measured row, and the lower middle is one of them. */
export const median = (xs: number[]): number =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : NaN;

/** SYSTEM's length, taken from the renderer rather than from the constant: `render` on an empty
 *  manifest is SYSTEM and the newline it always appends, and nothing else. That an EMPTY manifest
 *  still renders a non-empty prompt while `blockSum` of it is zero is PLAN-06 §2d, stated as an
 *  identity rather than as a claim. */
export const SYSTEM_CHARS = render({ blocks: [], byKind: {}, overflowed: false,
  totals: { budget: 0, used: 0, unallocated: 0 } } as Manifest).length;

export interface Reading {
  chars: number;        // the rebuilt prompt, SYSTEM and the renderer's own tags included
  sum: number;          // the estimate the meter drew, blocks only (PLAN-06 2a AND 2d together)
  exact: number;        // generations.prompt_tokens — what the server charged
  stored: number;       // manifest.totals.used as stored, i.e. after routes.ts:258 overwrote it
  cpt: number;          // MEASURED characters per token. No estimator involved.
  meter: number;        // sum / exact. What the context bar was off by, both defects at once.
  canonShare: number;   // fraction of the block estimate that is CANON-*, for SPEC §7.3
}

/** One row's arithmetic, pure, so the check below can drive it with manifests it built itself. */
export function read(m: Manifest, exact: number): Reading {
  const chars = render(m).length;
  const sum = blockSum(m);
  const canon = m.blocks.filter((b) => b.state === 'included' && b.kind.startsWith('CANON'))
    .reduce((n, b) => n + b.tokens, 0);
  return {
    chars, sum, exact,
    stored: m.totals?.used ?? NaN,
    cpt: chars / exact, meter: sum / exact,
    canonShare: sum ? canon / sum : 0,
  };
}

// ---- the check. Nothing below the report line runs until this is green. ----

if (process.argv[2] === 'check') {
  let bad = 0;
  const red = (why: string) => { bad++; console.log(`  RED  ${why}`); };

  // A block whose text is `n` characters long and which claims `tokens` tokens. The two are
  // independent on purpose: that independence is the whole defect under measurement.
  const B = (tokens: number, chars: number, kind = 'PROSE-RECENT', state = 'included') =>
    ({ kind, id: 'b', text: 'x'.repeat(chars), tokens, state, reason: '' } as any);
  const M = (blocks: any[], used?: number): Manifest => ({
    blocks, byKind: {}, overflowed: false,
    totals: { budget: 46146, used: used ?? blockSum({ blocks } as any), unallocated: 0 },
  } as any);

  console.log('\n  drift check — the detector, before anything it says is believed\n');

  // 1. THE TRAP. This is the case the whole file is shaped around. `totals.used` carries the
  //    EXACT figure, the way routes.ts:258 leaves it, while the blocks sum 50% high. A report
  //    that reads the field SPEC §7.5 names says 1.00 and calls the estimator perfect.
  const trap = read(M([B(3000, 8400), B(1500, 4200)], 3000), 3000);
  if (Math.abs(trap.meter - 1.5) > 1e-9)
    red(`the overwritten-totals trap: meter read ${trap.meter.toFixed(3)}, wanted 1.500.\n`
      + '       This is the only case that separates summing blocks from reading totals.used. If\n'
      + '       it goes green at 1.000 the report is measuring routes.ts against itself.');
  if (Math.abs(trap.stored - trap.exact) > 1e-9)
    red('the trap fixture no longer models the overwrite — totals.used must equal prompt_tokens '
      + 'in it, or it is not testing what routes.ts:258 does');

  // 2. The guard on 1: a detector that always cries drift is as useless as one that never does.
  const calm = read(M([B(1000, 2800), B(1000, 2800)]), 2000);
  if (Math.abs(calm.meter - 1) > 1e-9)
    red(`a manifest whose blocks are exactly right reported ${calm.meter.toFixed(3)} drift`);

  // 3. Omitted blocks are not on the wire. Counting them inflates every reading, and `render`
  //    already skips them — so the sum and the characters have to agree about that or the
  //    characters-per-token headline is wrong in a way nothing else here would show.
  const dropped = read(M([B(1000, 2800), B(9999, 99999, 'CANON-TRIGGERED', 'omitted')]), 1000);
  if (dropped.sum !== 1000)
    red(`an omitted block was counted in the estimate: sum ${dropped.sum}, wanted 1000`);
  if (dropped.chars >= 99999)
    red(`an omitted block reached the rebuilt prompt: ${dropped.chars} chars, and the omitted `
      + 'block alone is 99999. render() skips omitted blocks and this rebuild must too, or the '
      + 'characters-per-token headline counts text that was never sent.');

  // 4. SYSTEM is in the characters and not in the blocks. That gap IS PLAN-06 2d, so it has to
  //    survive as a number rather than being netted away.
  const empty = read(M([]), 1);
  if (empty.sum !== 0 || empty.chars !== SYSTEM_CHARS || SYSTEM_CHARS < 100)
    red(`PLAN-06 2d is not being measured: an EMPTY manifest renders ${empty.chars} characters of `
      + `prompt and estimates ${empty.sum} tokens of it. Those must be ${SYSTEM_CHARS} and 0 — the `
      + 'gap between them IS 2d. If they ever agree, SYSTEM has become a block and this report '
      + 'should stop claiming to measure it separately.');

  // 5. The median holds against an outlier, which is why it is here rather than a mean.
  if (median([1, 1, 1, 1, 100]) !== 1) red(`median moved with an outlier: ${median([1, 1, 1, 1, 100])}`);
  if (median([2, 1]) !== 1) red('median of an even set must be a real row, the lower middle');
  if (!Number.isNaN(median([]))) red('an empty set has no median and must not return a number');

  // 6. The constant is read from source, and the read is asserted both ways — a regex that
  //    silently stops matching would leave the report quoting `null` as the constant in force.
  const storySrc = readFileSync(new URL('../src/story.ts', import.meta.url), 'utf8');
  const d = divisorInForce(storySrc);
  if (d === null)
    red('the estimator line in src/story.ts no longer matches `Math.ceil(t.length / N)`. The '
      + 'report cannot say which constant is in force. Fix the regex, do not paste the number.');
  else if (!(d > 0)) red(`read a nonsense divisor out of src/story.ts: ${d}`);
  if (divisorInForce('export const estimate = (t: string) => t.length;') !== null)
    red('divisorInForce matched a line that is not the estimator — it would report a constant '
      + 'that is not in force');

  // 7. canonShare, both directions. It is what answers SPEC §7.3's warning that one constant is
  //    wrong high on prose and low on bracket-dense canon, and a share that is always zero would
  //    quietly turn that half of the report into two identical numbers.
  const mixed = read(M([B(300, 840, 'CANON-TRIGGERED'), B(700, 1960)]), 1000);
  if (Math.abs(mixed.canonShare - 0.3) > 1e-9)
    red(`canonShare read ${mixed.canonShare.toFixed(3)}, wanted 0.300`);
  if (read(M([B(1000, 2800)]), 1000).canonShare !== 0)
    red('canonShare fired on a prompt with no canon in it');

  console.log(bad ? `\n  ${bad} RED — do not believe a result from this\n`
                  : '\n  13 cases, all green\n');
  process.exit(bad ? 1 : 0);
}

// ---- the report. Read-only, no model, no writes. ----

const FILE = process.env.ANANSI_DB ?? new URL('../anansi.db', import.meta.url).pathname;
const db = new DatabaseSync(FILE, { readOnly: true });
const q = (sql: string) => db.prepare(sql);

const storySrc = readFileSync(new URL('../src/story.ts', import.meta.url), 'utf8');
const DIVISOR = divisorInForce(storySrc);
if (DIVISOR === null) {
  console.error('\n  src/story.ts no longer matches `Math.ceil(t.length / N)`. Run `check`.\n');
  process.exit(1);
}

const all = q('SELECT COUNT(*) n FROM generations').get() as any;
const rows = q(`SELECT id, role, model, manifest, prompt_tokens, created_at FROM generations
                WHERE manifest IS NOT NULL AND prompt_tokens IS NOT NULL
                ORDER BY created_at`).all() as any[];

console.log(`\n  drift — ${FILE}\n`);
console.log(`  ${rows.length} of ${all.n} logged calls can answer: they hold a manifest AND a`
  + ` token count.\n  The rest cannot — logGeneration keeps the newest 200 manifests and nulls`
  + ` the others, and\n  talk and invent calls store a manifest with no prompt_tokens at all.`);

if (!rows.length) {
  console.log('\n  Nothing to measure. This bounds nothing; it is an empty denominator.\n');
  process.exit(0);
}

const readings = rows.map((r) => {
  const m = JSON.parse(r.manifest) as Manifest;
  return { ...read(m, r.prompt_tokens), role: r.role, at: r.created_at, id: r.id, model: r.model };
});

const cpt = readings.map((r) => r.cpt);
const meter = readings.map((r) => r.meter);
const medCpt = median(cpt);
const medMeter = median(meter);
// The estimator's own error over the WHOLE prompt, SYSTEM included: what 2a would be measuring
// if 2d were already fixed. Separated because the two defects run in opposite directions and a
// single ratio hides that fixing one alone makes the meter worse.
const estAll = readings.map((r) => Math.ceil(r.chars / DIVISOR) / r.exact);
// SYSTEM's real cost, at the characters-per-token this report just measured. Reporting it
// through the divisor under measurement would price 2d with the very constant 2a says is wrong:
// at 2.8 it reads 669 tokens, at the measured rate 424, and 2d's size decides whether it is worth
// landing with 2a or on its own.
const systemTok = readings.map((r) => Math.round(SYSTEM_CHARS / r.cpt));

console.log(`\n  MEASURED, and this number depends on no estimator — but read the per-model`
  + ` split below\n  before using it: this pools every model in the log.`);
console.log(`    ${medCpt.toFixed(2)} characters per token  (median over ${cpt.length} calls,`
  + ` range ${Math.min(...cpt).toFixed(2)}–${Math.max(...cpt).toFixed(2)})`);
console.log(`    the constant in force is ${DIVISOR} (src/story.ts) —`
  + ` ${((medCpt / DIVISOR - 1) * 100).toFixed(0)}% too SMALL, which is exactly how`
  + `\n    an estimate that divides by it comes out ${((medCpt / DIVISOR - 1) * 100).toFixed(0)}%`
  + ` too BIG.\n    ${medCpt.toFixed(2)} is what ${cpt.length} logged calls say. Two constants`
  + ` before this one were guesses carrying a comment\n    that called them measurements — 3.6,`
  + ` then 2.8. If this report and that comment ever disagree,\n    this one counted and the`
  + ` comment did not.\n`);

console.log(`  WHAT THE METER SHOWS, against what the server charged:`);
console.log(`    block sum / exact:  ${medMeter.toFixed(2)}x  (median) — this is the bar today,`
  + ` and it carries\n                        BOTH defects: the estimator runs high, SYSTEM is`
  + ` missing.`);
console.log(`    estimator alone:    ${median(estAll).toFixed(2)}x  (median) — the whole prompt,`
  + ` SYSTEM included,\n                        at ${DIVISOR} chars/token. This is PLAN-06 2a on`
  + ` its own.`);
console.log(`    SYSTEM's share:     ~${median(systemTok)} real tokens, every call, invisible to the`
  + ` manifest.\n                        (${Math.ceil(SYSTEM_CHARS / DIVISOR)} at the divisor in`
  + ` force — priced here at the MEASURED rate, because\n                        costing 2d with`
  + ` the constant 2a condemns is the error this file is about.)\n                        This is`
  + ` PLAN-06 2d, and it is the one that runs the other way.\n`);

console.log(`  THE TWO DEFECTS OPPOSE EACH OTHER. The estimator inflates by`
  + ` ~${(median(estAll) * 100 - 100).toFixed(0)}%; the missing\n  SYSTEM deflates by`
  + ` ~${median(systemTok)} tokens. Fixing 2d alone ADDS to a number already too high.\n`
  + `  They belong in one commit, or 2d lands after this report can show both moves apart.\n`);

// SPEC §7.3: one global constant is wrong in both directions at once — high on prose, low on
// bracket-dense canon. Split by how much canon is in the prompt and let the two halves answer.
// Halves, not a regression: this only has to say whether one constant can be right, not what the
// curve is.
const bySplit = [...readings].sort((a, b) => a.canonShare - b.canonShare);
const half = Math.floor(bySplit.length / 2);
const lean = bySplit.slice(0, half), heavy = bySplit.slice(bySplit.length - half);
if (half >= 2) {
  const lc = median(lean.map((r) => r.cpt)), hc = median(heavy.map((r) => r.cpt));
  console.log(`  SPEC §7.3 — is one constant enough? Split by how much of the prompt is canon:`);
  console.log(`    canon-lean  (${(100 * median(lean.map((r) => r.canonShare))).toFixed(0)}% canon,`
    + ` n=${lean.length}):  ${lc.toFixed(2)} chars/token`);
  console.log(`    canon-heavy (${(100 * median(heavy.map((r) => r.canonShare))).toFixed(0)}% canon,`
    + ` n=${heavy.length}):  ${hc.toFixed(2)} chars/token`);
  console.log(`    ${Math.abs(lc - hc) < 0.15
    ? `The halves agree within 0.15. One constant is defensible on THIS data — and canon is a\n`
      + `    few per cent of every prompt in it, so this has not yet been asked the question §7.3\n`
      + `    is really about.`
    : `The halves differ by ${Math.abs(lc - hc).toFixed(2)} chars/token. One constant is wrong for\n`
      + `    one of them, which is what §7.3 warned.`}\n`);
} else {
  console.log(`  SPEC §7.3's question needs at least four calls to split. There are`
    + ` ${readings.length}.\n`);
}

// FIVE MODELS, FIVE TOKENIZERS, AND THIS IS WHY THE POOLED MEDIAN ABOVE IS NOT THE ANSWER.
// Characters per token is a property of the TOKENIZER. The first version of this report pooled
// every row and split them by date, which showed 5.68 before 2026-08-26 against 4.39 after, and
// the obvious reading — SYSTEM was rewritten on the 26th, so the rebuild is distorting old rows —
// was wrong. The library holds calls against five different presets, and the date split was
// splitting the MODEL MIX. A constant chosen off the pooled number is chosen for a weighted
// average of tokenizers nobody writes with.
const models = [...new Set(readings.map((r) => r.model))]
  .map((name) => {
    const rs = readings.filter((r) => r.model === name);
    return { name, n: rs.length, cpt: median(rs.map((r) => r.cpt)),
      newest: Math.max(...rs.map((r) => Number(r.at))) };
  })
  .sort((a, b) => b.newest - a.newest);
const current = models[0];

console.log(`  PER MODEL, because characters per token is a tokenizer's property and this library`
  + ` holds\n  calls against ${models.length}:`);
for (const m of models)
  console.log(`    ${m.cpt.toFixed(2)} chars/token   n=${String(m.n).padStart(3)}   ${m.name}`
    + `${m === current ? '   <- most recent' : ''}`);
console.log(`\n  STEER BY ${current.cpt.toFixed(2)}, not by the ${medCpt.toFixed(2)} above: that is`
  + ` ${current.name},\n  the model most recently written with, over ${current.n} of`
  + ` ${readings.length} calls. The pooled median is a\n  weighted average of`
  + ` ${models.length} tokenizers and is the number this report exists to refuse.`);
console.log(`  At ${current.cpt.toFixed(2)} the divisor in force is`
  + ` ${((current.cpt / DIVISOR - 1) * 100).toFixed(0)}% too small.`);
console.log(`  These are PRESET NAMES, not tokenizers. The router's preset list was rewritten on`
  + `\n  2026-08-27, so one model can appear twice under two names — two rows within 0.02 of each`
  + `\n  other are very likely one tokenizer, and their calls merge. This file cannot know that`
  + `\n  and does not guess; a reader who knows the rename should add the rows up.`);
console.log(`  ${models.filter((m) => m.n >= 10).length < 2
  ? 'Only one model has ten or more calls, so the spread between them is not yet bounded.'
  : `The spread across models with n>=10 is `
    + `${(Math.max(...models.filter((m) => m.n >= 10).map((m) => m.cpt))
       - Math.min(...models.filter((m) => m.n >= 10).map((m) => m.cpt))).toFixed(2)}`
    + ` chars/token — which is what a single\n  global constant has to be wrong by, for somebody,`
    + ` the moment two writers pick different models.`}\n`);

const w = [19, 9, 11, 9, 11, 8, 26];
const head = ['when', 'exact', 'blocksum', 'meter', 'chars/tok', 'canon', 'model'];
console.log('  ' + head.map((h, i) => h.padEnd(w[i])).join(''));
for (const r of readings.slice(-24)) {
  console.log('  ' + [
    new Date(Number(r.at)).toISOString().replace('T', ' ').slice(0, 16),
    String(r.exact), String(r.sum),
    `${r.meter.toFixed(2)}x`, r.cpt.toFixed(2),
    `${(100 * r.canonShare).toFixed(0)}%`, String(r.model),
  ].map((c, i) => c.padEnd(w[i])).join(''));
}
console.log(`\n  (the newest ${Math.min(24, readings.length)} of ${readings.length})`);

// The offset that is not estimator error, stated so nobody reads it as one.
const storedGap = readings.map((r) => r.exact - r.stored).filter((n) => Number.isFinite(n));
console.log(`\n  A stored manifest's totals.used sits a median of ${median(storedGap)} tokens under`
  + ` prompt_tokens,\n  because routes.ts:258 already overwrote it with count(prompt) and the`
  + ` server then charged for\n  the chat template around it. That gap is the template, not the`
  + ` estimator. Reading that field\n  instead of the blocks is how this report would have`
  + ` reported ${median(readings.map((r) => r.stored / r.exact)).toFixed(2)}x and cleared a`
  + `\n  ${medMeter.toFixed(2)}x defect.`);

const day = (ms: any) => new Date(Number(ms)).toISOString().slice(0, 10);
const oldest = day(readings[0].at);
console.log(`\n  Rows run from ${oldest} to ${day(readings[readings.length - 1].at)},`
  + ` and every prompt was rebuilt with\n  TODAY'S SYSTEM (${SYSTEM_CHARS} chars,`
  + ` ~${(100 * SYSTEM_CHARS / median(readings.map((r) => r.chars))).toFixed(0)}% of a prompt). If`
  + ` SYSTEM has been rewritten in that window the\n  older rows carry that much error and no more.\n`);
