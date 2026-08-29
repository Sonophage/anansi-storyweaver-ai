// Reroll: does telling the model what the writer just turned down change what comes back?
//
// `db.rejectTake` has recorded rejections since it was written and never told the model. Its own
// marker says why: *"the obvious next step — putting 'not like this' and the rejected text into the
// prompt — is a prompt change, and this project measures those rather than assuming them."* F20 is
// the precedent it names: 850 generations per arm proving that restating canon did nothing at all,
// and a whole block deleted on the strength of it. F43 is the fresher one — a rule that named its
// thing and spelled out its form and still measured 0/4.
//
//   node --experimental-strip-types bench/reroll.ts check   # the detector, no model, no database
//   node --experimental-strip-types bench/reroll.ts [runs]  # the two arms
//
// NO DATABASE. It builds the prompt out of `test/fixture.ts`'s Input through the real
// `buildContext` and `render`, so both arms are the prompt the app would actually send and differ
// by exactly one bracket. `Input.rejected` exists to be this arm and nothing in the app sets it.
//
// WHAT IS MEASURED, AND WHAT IS NOT. Measured: how much of the rejected take comes back in the
// next one. NOT measured: whether the next one is any GOOD. A reroll that is different and worse
// is a loss this cannot see, and the number below must never be read as quality — it answers only
// the complaint the feature exists for, which is "I pressed it again and got the same paragraph".

import { buildContext } from '../src/context.ts';
import { render } from '../src/render.ts';
import { input } from '../test/fixture.ts';

/** Word-level Jaccard on the two takes: shared words over all words used by either.
 *
 *  Deliberately not embeddings — a dependency, and a similarity score nobody can check by eye.
 *  This one is inspectable: two takes sharing every word score 1, two sharing only the articles
 *  score near 0. The floor of 4 characters drops "the", "and", "a" and the rest of the scaffolding
 *  that any two English paragraphs share, which is what would otherwise put every pair at 0.3 and
 *  make the whole scale useless. */
export function overlap(a: string, b: string): number {
  const words = (t: string) => new Set((t.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
    .filter((w) => w.length >= 4));
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

// The estimator only sizes the budget; it does not change a word of the prompt. story.ts's own is
// 4.2 chars per token and lives behind a db import, so it is restated rather than reached for.
const count = (s: string) => Math.ceil(s.length / 4.2);

const promptFor = (rejected?: string) =>
  render(buildContext({ ...input, ...(rejected ? { rejected } : {}) } as any, count));

// ---- the check. Nothing below the live-run line runs until this is green. ----

if (process.argv[2] === 'check') {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };
  const A = 'He went down the stair and the rain went with him, and the door did not close.';
  const B = 'He went down the stair and the rain went with him, and the door did not close.';
  const C = 'She counted the coins twice by feel and the number did not improve at all.';

  console.log('\n  reroll check — the detector, before anything it says is believed\n');

  // BOTH ENDS OF THE SCALE, or a number in the middle means nothing.
  ok('the same take against itself scores 1', overlap(A, B) === 1);
  ok('two takes with nothing in common score near 0', overlap(A, C) < 0.1);
  ok('  and a take that reuses half its words lands in between',
     overlap(A, 'He went down the stair and did not look back at the door') > 0.15
     && overlap(A, 'He went down the stair and did not look back at the door') < 0.8);
  // The scaffolding floor: without it two unrelated English sentences share `the`, `and`, `a` and
  // score high enough to bury the difference the arms are meant to show.
  ok('short scaffolding words are not evidence of similarity',
     overlap('the and a of it was', 'the and a of it was') === 0);
  ok('an empty take scores 0 rather than dividing by zero', overlap('', A) === 0);

  // THE ARMS DIFFER BY EXACTLY ONE BRACKET, and the control is that everything else is identical.
  const off = promptFor(), on = promptFor('He went down the stair.');
  ok('the arm with a rejected take says so in the prompt', /rejected this attempt/i.test(on));
  ok('  and the control does not', !/rejected this attempt/i.test(off));
  ok('  and they are otherwise the same prompt',
     off.replace(/\s+/g, ' ').length > 200
     && on.replace(/\[The writer rejected[^\]]*\]/i, '').replace(/\s+/g, ' ').trim()
        === off.replace(/\s+/g, ' ').trim());

  console.log(`\n  ${n} checks passed — the scale answers at both ends and the arms differ by one bracket\n`);
  process.exit(0);
}

// ---- the report ---------------------------------------------------------

const { chat } = await import('../src/llama.ts');
const RUNS = Number(process.argv[2] ?? 6);
const SYS_END = (await import('../src/render.ts')).SYSTEM.length;
const take = async (rejected?: string) => {
  const prompt = promptFor(rejected);
  const r = await chat(prompt.slice(0, SYS_END), prompt.slice(SYS_END),
    { temperature: 0.9, max_tokens: 260, chat_template_kwargs: { enable_thinking: false } });
  return String(r.prose ?? '').trim();
};

console.log(`\n  REROLL — ${RUNS} pairs per arm, no database\n`);
const scores: Record<string, number[]> = { 'told what was rejected': [], 'told nothing': [] };
let empty = 0;

for (let i = 0; i < RUNS; i++) {
  // The take the writer turns down. Generated fresh each pair so the arms are not both measured
  // against one lucky or unlucky first attempt.
  const first = await take();
  if (!first) { empty++; continue; }
  for (const [arm, second] of [
    ['told what was rejected', await take(first)],
    ['told nothing', await take()],
  ] as const) {
    if (!second) { empty++; continue; }
    scores[arm]!.push(overlap(first, second));
  }
}

const median = (xs: number[]) => xs.length
  ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0;
const pad = (s: any, n: number) => String(s).padEnd(n).slice(0, n);
for (const [arm, xs] of Object.entries(scores)) {
  const near = xs.filter((x) => x >= 0.35).length;
  console.log(`  ${pad(arm, 24)} median overlap ${median(xs).toFixed(2)}`
    + `   ${near}/${xs.length} rerolls came back close to what was rejected`);
}
if (empty) console.log(`\n  ${empty} generation(s) came back empty and are in neither arm`);
console.log(`\n  LOWER IS THE FEATURE WORKING: it means the reroll went somewhere else. This does NOT`);
console.log(`  say the new take is better — a reroll that is different and worse is a loss this`);
console.log(`  cannot see. It answers the complaint the feature exists for and nothing beyond it.`);
console.log(`\n  If the two arms match, the bracket is tokens on every reroll for nothing and the`);
console.log(`  honest move is to delete it — F20 deleted a whole block on exactly that reading,`);
console.log(`  and F43 deleted a rule that named its thing and still measured zero.\n`);
