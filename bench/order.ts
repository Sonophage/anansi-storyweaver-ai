/** What a different block ORDER would have cost the KV cache, replayed over prompts already sent.
 *
 *  THE A/B THAT DOES NOT NEED THE MODEL. `bench/ab.ts` answers "which reads better" and needs two
 *  servers, one router and hours of generations — it cannot run while somebody is writing, because
 *  it takes both slots and because the thing under test here IS the cache the writer is sharing.
 *  This answers the other half, "which reprocesses fewer tokens", from data the writer produces by
 *  writing normally. Zero model calls, zero slots, no interference.
 *
 *  It is exact rather than an estimate. llama-server reuses the KV cache for a common PREFIX and
 *  nothing else, so the saving between two consecutive prompts is the length of their common
 *  prefix. `manifest.blocks` carries every block's `kind` and its rendered `text`, and `render` is
 *  pure — so the prompt that WOULD have been sent under a different order is recoverable exactly,
 *  the same trick `bench/drift.ts` uses to rebuild a prompt for its character count.
 *
 *  WHAT IT DOES NOT MEASURE: whether the prose is any good. Block order is a prompt-QUALITY
 *  decision that F15 and F20 each paid 850 generations per arm to settle, and F50 declined to
 *  re-cut it for a cache on exactly that ground. A win here is permission to run `bench/ab.ts`,
 *  not permission to ship.
 *
 *  THE REPORT IS NOT READ-ONLY, whatever an earlier version of this line said. It imports
 *  `src/db.ts`, which opens the live file READ-WRITE, sets WAL and runs `migrate()` at module load.
 *  No model call and no slot, so it does not disturb a generation — but it is a second writer on
 *  the book, so do not describe it as harmless. `check` touches no database at all.
 *
 *    node --experimental-strip-types bench/order.ts check     # the detector, no db, no model
 *    node --experimental-strip-types bench/order.ts [title]   # the report, opens the live db rw
 */
import { render } from '../src/render.ts';
import { ORDER } from '../src/blocks.ts';
import type { Kind } from '../src/blocks.ts';

/*  The arms. Each is a permutation of the shipped ORDER and nothing else — no block is added,
 *  dropped or rewritten, so the model reads the same words in a different sequence and the token
 *  count is unchanged. That is what makes this a fair comparison rather than two different prompts.
 *
 *  `directive-first` — DIRECTIVE currently sits at 8, between PROSE (7) and TAIL (9), so an append
 *  lands in the middle of the prompt rather than at its end.
 *  `canon-late` — CANON-* currently sit at 4 and 5, so accepting a thread inserts ahead of every
 *  block behind it. Moved to just after the prose they do not need to precede.
 *  `both` — the two together, which is not the sum of them: fixing one exposes the other. */
/*  FROZEN LITERALS, BOTH SIDES. `now: ORDER` was a live alias, so the moment `directive-first`
 *  shipped into `src/blocks.ts` the two arms became the same array and case 2's `b < a` was false
 *  by construction — the check that justified the change went red on the tree that carried it, and
 *  nothing ran it to notice. An arm named for what ships cannot be a fixture. `shipped` is kept as
 *  a live read so the report still says where the code actually is. */
const ARMS: Record<string, Kind[]> = {
  'directive-last': ['SPINE', 'VOICE', 'STYLE', 'CANON-ALWAYS', 'CANON-TRIGGERED', 'STRING',
    'EARLIER', 'PROSE', 'DIRECTIVE', 'TAIL', 'MODE'],
  'directive-first': ['SPINE', 'VOICE', 'STYLE', 'CANON-ALWAYS', 'CANON-TRIGGERED', 'STRING',
    'EARLIER', 'DIRECTIVE', 'PROSE', 'TAIL', 'MODE'],
  'canon-late': ['SPINE', 'VOICE', 'STYLE', 'STRING', 'EARLIER', 'PROSE',
    'CANON-ALWAYS', 'CANON-TRIGGERED', 'DIRECTIVE', 'TAIL', 'MODE'],
  both: ['SPINE', 'VOICE', 'STYLE', 'STRING', 'EARLIER', 'DIRECTIVE', 'PROSE',
    'CANON-ALWAYS', 'CANON-TRIGGERED', 'TAIL', 'MODE'],
  shipped: ORDER,
};

/** Stable, so within one kind the blocks keep the insertion order the stored manifest already has
 *  — that is `entries ORDER BY rowid`, and re-sorting must not disturb it or the arms would differ
 *  by more than the permutation under test. */
const reorder = (m: any, order: Kind[]) => ({ ...m,
  blocks: [...m.blocks].sort((a: any, b: any) => order.indexOf(a.kind) - order.indexOf(b.kind)) });

/** Characters, because that is what is on the wire and it depends on no estimator. The real cache
 *  works in TOKENS, so the true reuse is at most one token shorter than this — a boundary can fall
 *  inside the last shared character run. One token against the thousands below. */
function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/** Chars per token, measured rather than assumed — F18, `bench/drift.ts`, 4.45 for Qwen3.6 over
 *  n=91. Only used to put the character counts into the unit the prefill is billed in. */
const CPT = 4.45;
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

interface Row { arm: string; reprocessed: number[]; total: number[] }

function score(manifests: any[], order: Kind[]): Row['reprocessed'] extends never ? never : Row {
  const prompts = manifests.map((m) => render(reorder(m, order)));
  const reprocessed: number[] = [];
  const total: number[] = [];
  for (let i = 1; i < prompts.length; i++) {
    const keep = commonPrefix(prompts[i - 1], prompts[i]);
    reprocessed.push(prompts[i].length - keep);
    total.push(prompts[i].length);
  }
  return { arm: '', reprocessed, total };
}

// ---------- the detector, before the result ----------
//
// Three cases with a known answer. Two assert the check FIRES on a difference the arms should
// expose, and one asserts it does NOT fire when there is nothing to find — a probe that only ever
// says "better" is a probe that would say it about noise. F17's rule, and this file is worth
// nothing without it.
function check() {
  const blk = (kind: Kind, id: string, text: string) => ({ kind, id, text, tokens: Math.ceil(text.length / CPT), state: 'included' });
  const wrap = (blocks: any[]) => ({ blocks, totals: { budget: 0, used: 0, unallocated: 0 }, byKind: {}, overflowed: false });
  let bad = 0;
  const ok = (label: string, good: boolean) => { if (!good) bad++; console.log(`  ${good ? 'ok  ' : 'RED '}${label}`); };

  const spine = blk('SPINE', 'spine', 'S'.repeat(300));
  const canonA = blk('CANON-ALWAYS', 'e-a', 'A'.repeat(400));
  const canonB = blk('CANON-ALWAYS', 'e-b', 'B'.repeat(400));
  const p1 = blk('PROSE', 'p-1', 'P'.repeat(2000));
  const p2 = blk('PROSE', 'p-2', 'Q'.repeat(2000));
  const dir = blk('DIRECTIVE', 'directive', 'D'.repeat(120));
  const tailA = blk('TAIL', 'tail', 'T'.repeat(220));
  const tailB = blk('TAIL', 'tail', 'U'.repeat(220));

  // 1 · THE INSTRUMENT CONTROL. The same manifest twice must reprocess nothing under every arm.
  //     If this is not zero the prefix walk is broken and cases 2 and 3 mean nothing.
  {
    const same = [wrap([spine, canonA, p1, dir, tailA]), wrap([spine, canonA, p1, dir, tailA])];
    const every = Object.entries(ARMS).map(([, o]) => score(same, o).reprocessed[0]);
    ok(`an unchanged prompt reprocesses nothing, on all ${every.length} arms (${every.join(', ')})`,
       every.every((x) => x === 0));
  }

  // 2 · A PURE APPEND. One passage lands, nothing else changes. `now` must pay for DIRECTIVE and
  //     TAIL sitting behind the new prose; `directive-first` must pay for the new prose only.
  {
    const seq = [wrap([spine, canonA, p1, dir, tailA]), wrap([spine, canonA, p1, p2, dir, tailB])];
    const a = score(seq, ARMS['directive-last']).reprocessed[0];
    const b = score(seq, ARMS['directive-first']).reprocessed[0];
    const c = score(seq, ARMS['canon-late']).reprocessed[0];
    console.log(`       append: now ${a} chars, directive-first ${b}, canon-late ${c}`);
    ok('an append costs less with DIRECTIVE ahead of the prose', b < a);
    ok('  and neither arm reports zero — an append does change the prompt', a > 0 && b > 0);
    // THE MEASURED SURPRISE, 2026-09-02, kept here so it cannot be un-learned. F50 proposed moving
    // canon behind the prose to make an accepted thread cheap, and this file's own case 3 confirms
    // it does. It also puts every canon block BEHIND the prose, so an ordinary append — which
    // inserts a prose block — now reprocesses the whole ledger too. Replayed over 31 real
    // transitions on The Anagram that was +221% against the shipped order, because appends
    // outnumber accepts about seven to one. The rare 85% reset was traded for a frequent 25% tax.
    ok('  and canon-late makes an append WORSE, which is why it loses overall', c > a);
  }

  // 3 · THE CASE THE FIRST VERSION OF THIS FILE HAD NO ASSERTION FOR, and the reason it could only
  //     ever conclude that directive-first wins. When the DIRECTIVE block itself changes and the
  //     prose does not, directive-last reprocesses DIRECTIVE + TAIL + MODE; directive-first
  //     reprocesses DIRECTIVE + THE WHOLE PROSE WINDOW behind it. That is the real trade, and it
  //     is 456% on a live transition in The Transaction of Silence, found by Council 10.
  //
  //     DIRECTIVE is NOT the writer's typed steer — that rides in MODE, the last block. This fires
  //     on point of view, the lockout, the chapter's "must end with" note and the spice line.
  {
    const dir2 = blk('DIRECTIVE', 'directive', 'E'.repeat(120));
    const seq = [wrap([spine, canonA, p1, dir, tailA]), wrap([spine, canonA, p1, dir2, tailA])];
    const a = score(seq, ARMS['directive-last']).reprocessed[0];
    const b = score(seq, ARMS['directive-first']).reprocessed[0];
    console.log(`       directive-only change: directive-last ${a} chars, directive-first ${b}`);
    ok('  a directive-only change costs MORE with DIRECTIVE ahead of the prose', b > a);
    ok('  and the gap is at least the prose window it now sits in front of', b - a >= p1.text.length);
  }

  // 4 · A CANON INSERTION. A thread is accepted and sorts ahead of the one already there, which is
  //     what was watched happening live on 2026-09-02. `now` must reprocess the prose behind it;
  //     `canon-late` must not, because the prose is no longer behind it.
  {
    const seq = [wrap([spine, canonB, p1, dir, tailA]), wrap([spine, canonA, canonB, p1, dir, tailA])];
    const a = score(seq, ARMS['directive-last']).reprocessed[0];
    const b = score(seq, ARMS['canon-late']).reprocessed[0];
    console.log(`       canon insert: now ${a} chars, canon-late ${b}`);
    ok('a canon insertion costs less with canon behind the prose', b < a);
    ok('  and `now` reprocesses the prose behind it', a > p1.text.length);
  }

  console.log(bad ? `\n  ${bad} RED` : '\n  all green');
  process.exit(bad ? 1 : 0);
}

if (process.argv[2] === 'check') check();

// ---------- the report ----------
const db = await import('../src/db.ts');
const want = process.argv[2];
const rows = db.db.prepare(
  `SELECT g.manifest, s.title FROM generations g JOIN stories s ON s.id = g.story_id
   WHERE g.manifest IS NOT NULL AND g.role = 'prose' AND g.error IS NULL
     ${want ? 'AND s.title LIKE ?' : ''}
   ORDER BY g.created_at`).all(...(want ? [`%${want}%`] : [])) as any[];

if (rows.length < 3) {
  console.error(`only ${rows.length} stored prose manifests${want ? ` for "${want}"` : ''}`
    + ' — this needs a book that has been written in. Manifests are pruned to the newest 200.');
  process.exit(1);
}

// PER BOOK, and consecutive WITHIN a book. Two books interleaved would score the switch between
// them as a cache miss, which is true of the slot and false of the ordering under test — the
// question here is what one book's own sequence costs itself.
const byBook = new Map<string, any[]>();
for (const r of rows) {
  const at = byBook.get(r.title) ?? [];
  at.push(JSON.parse(r.manifest));
  byBook.set(r.title, at);
}

console.log(`\n  Replaying ${rows.length} stored prompts across ${byBook.size} book(s).`
  + `\n  Characters reprocessed between consecutive prompts — lower is less prefill.\n`);

const verdicts: Record<string, number[]> = {};
for (const [title, ms] of byBook) {
  if (ms.length < 3) continue;
  verdicts[title] = [];
  console.log(`  ${title} — ${ms.length} prompts, ${ms.length - 1} transitions`);
  const base = score(ms, ARMS['directive-last']);
  for (const [arm, order] of Object.entries(ARMS)) {
    const s = score(ms, order);
    const m = med(s.reprocessed);
    verdicts[title].push(m);
    const share = 100 * m / med(s.total);
    // FULL RESETS ARE THE HEADLINE, not the median. A run of cheap appends drags a median down
    // and hides the presses that cost seven seconds each, which is the shape of the complaint.
    const resets = s.reprocessed.filter((x, i) => x > 0.8 * s.total[i]).length;
    const delta = arm === 'directive-last' ? '' : `  ${m <= med(base.reprocessed) ? '−' : '+'}${
      Math.abs(100 * (m - med(base.reprocessed)) / med(base.reprocessed)).toFixed(0)}%`;
    console.log(`    ${arm.padEnd(16)} median ${String(Math.round(m)).padStart(6)} chars`
      + ` (~${String(Math.round(m / CPT)).padStart(5)} tok, ${share.toFixed(0).padStart(3)}% of prompt)`
      + `   ${String(resets).padStart(3)} full resets${delta}`);
  }
  console.log();
}

/*  NO POOLED MEDIAN. Pooling every transition lets the book with the most of them decide the
 *  answer, and the busiest book here is one where no arm differs from any other — so the pooled
 *  line read "−0%" four times and said the orderings do not matter, which is false. That is F10's
 *  rule: report the denominator that could actually have shown the effect.
 *
 *  A book can only be moved by these arms if it HAS the blocks being moved. A writer who never
 *  types a directive has no DIRECTIVE block, and `directive-first` cannot help or hurt them. */
// DIFFER FROM EACH OTHER, not "are nonzero" — the first draft of this line asked whether any arm
// scored above zero, which every book does, and so it reported 4 of 4 books moved when three of
// them score identically on all four arms. A summary that cannot say "no effect" is the detector
// that reports perfection, one rung up.
const moved = Object.entries(verdicts).filter(([, v]) => new Set(v).size > 1);
console.log(`  ${moved.length} of ${Object.keys(verdicts).length} book(s) have a sequence any arm changes.`);
for (const [title, v] of moved) {
  const best = Object.keys(ARMS)[v.indexOf(Math.min(...v))];
  const worst = Object.keys(ARMS)[v.indexOf(Math.max(...v))];
  console.log(`    ${title.padEnd(28)} best: ${best.padEnd(16)} worst: ${worst}`);
}
for (const [title, v] of Object.entries(verdicts)) {
  if (new Set(v).size === 1) console.log(`    ${title.padEnd(28)} no arm changes it`);
}
console.log(`\n  Tokens converted at ${CPT} chars/token (F18, measured for Qwen3.6, n=91).`
  + `\n  This measures the CACHE only. Whether the prose is better is bench/ab.ts, and it needs`
  + `\n  two servers, one router, and nobody writing.\n`);
