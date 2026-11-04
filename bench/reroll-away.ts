// Reroll away (#140): does a reroll move away from the take it replaces?
//
// F66 read the library's history and found a reroll starting with the rejected take's first five
// narration words in 16% of pairs (25% on Ornith), and copying 10% or more of it word for word in
// 4%. This asks for rerolls instead of reading old ones, so arms can be compared: each arm is a
// scratch server, every arm rerolls the same passages through the app's own route
// (`POST /api/generate` with `regenerateOf`, non-streaming, so nothing is written to the book), and
// every take is scored against the passage it replaces with the measures F66 used (bench/echo.ts).
//
//   node --experimental-strip-types bench/reroll-away.ts check
//   node --experimental-strip-types bench/reroll-away.ts run <out.jsonl> <rerolls per passage> <arm> [<arm>]
//   node --experimental-strip-types bench/reroll-away.ts report <out.jsonl> [<out.jsonl> ...]
//
// An arm is `name@port[+note][+away]`: `+note` fills What didn't work on every reroll (NOTE below),
// `+away` says the server runs with ANANSI_REROLL_AWAY=1. Both are checked through
// `POST /api/manifest` before anything is generated, and the run stops if an arm is not what it says.
// Two arms run AT THE SAME TIME, one generation each per step, so drift lands on both alike (F55).
//
// Run it against SCRATCH copies only: it pins the tale's model on the server it talks to.
//   ANANSI_DB=<copy> ANANSI_PORT=5301 ANANSI_MODEL=Ornith-1.0-RPNTH-35B node --experimental-strip-types serve.ts
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { grams, rerollEcho } from './echo.ts';
import { fisher } from './stats.ts';

/** The passages rerolled: chosen takes Ornith wrote, in two of Seth's tales, so the take each reroll
 *  is scored against came from the model and sampler that write the reroll. THE MURMUR IN THE MARROW:
 *  every take after the chapter's first, all Direct, whose directives are written as prose. ENCORE:
 *  the Continue and Speak passages of chapter c-f3a075e6 that Seth rerolled on Ornith and that came
 *  back opening alike ("She doesn't turn around, just tilts her", three times), and two that did not. */
const TALES = [
  { sid: 's-82316b27', chapter: 'c-875f4e8f', ids: null as string[] | null },
  { sid: 's-7bb337a1', chapter: 'c-f3a075e6',
    ids: ['p-48a10acf', 'p-2f2d1315', 'p-e714aa39', 'p-ad66d166', 'p-6596e5c4', 'p-3afb0e08', 'p-3dbbdde8', 'p-42533cc8'] },
];
const MODEL = 'Ornith-1.0-RPNTH-35B';
/** What a writer types under Reweave when the take came back the same. It names no content: the
 *  model is not shown the take (docs/adr/0012), so a note that quoted it would be the take sent again. */
const NOTE = 'It came back the same as last time. Open it differently and take the moment another way.';
/** F66's line for a word-for-word repeat: unrelated takes from another scene reach it in under 1% of pairs. */
const FLAG = 0.1;

export type Arm = { name: string; base: string; note: boolean; away: boolean };
export const armOf = (spec: string): Arm => {
  const m = /^(\w+)@(\d+)((?:\+(?:note|away))*)$/.exec(spec);
  if (!m) throw new Error(`an arm is name@port[+note][+away], not ${spec}`);
  return { name: m[1], base: `http://127.0.0.1:${m[2]}`, note: m[3].includes('+note'), away: m[3].includes('+away') };
};

/** One take's scores against the take it replaces. `openInDirective`: its first five narration words
 *  are also in the passage's own directive, so two takes can share an opening by both copying the
 *  writer's synopsis, which is a different cause from copying each other. `rejectedOwn` is REJECTED
 *  with the directive's phrases left out as well as the scene's: what the take shares with the
 *  replaced one that neither could have taken from the prompt. */
export function score(take: string, replaced: string, scene: string[], directive: string) {
  const e = rerollEcho(take, replaced, scene);
  const first = grams(take)[0];
  return { rejected: e.rejected, rejectedOwn: rerollEcho(take, replaced, [...scene, directive]).rejected,
           sameOpening: e.sameOpening, phrases: e.phrases, sceneShare: e.sceneShare,
           openInDirective: !!first && new Set(grams(directive)).has(first) };
}

type Row = { arm: string; slot: string; i: number; error?: string; rejected?: number; rejectedOwn?: number; sameOpening?: boolean;
  openInDirective?: boolean; prose?: string; phrases?: number; sceneShare?: number; away?: any; s?: number; words?: number; opening?: string };

/** The table: per arm, takes scored, SAME OPENING, REJECTED >= FLAG, the opening from the directive,
 *  and how many takes the server asked for again. A take under 20 phrases is left out, as in F66. */
export function tally(rows: Row[]) {
  const ok = rows.filter((r) => !r.error && (r.phrases ?? 0) >= 20);
  return [...Map.groupBy(ok, (r) => r.arm)].map(([arm, rs]) => ({ arm, n: rs.length,
    errors: rows.filter((r) => r.arm === arm && r.error).length,
    short: rows.filter((r) => r.arm === arm && !r.error && (r.phrases ?? 0) < 20).length,
    same: rs.filter((r) => r.sameOpening).length,
    flagged: rs.filter((r) => (r.rejected ?? 0) >= FLAG).length,
    flaggedOwn: rs.filter((r) => (r.rejectedOwn ?? 0) >= FLAG).length,
    fromDirective: rs.filter((r) => r.sameOpening && r.openInDirective).length,
    retried: rs.filter((r) => r.away?.retried).length,
    medianS: rs.map((r) => r.s ?? 0).sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? 0 }));
}

const mode = process.argv[2];
if (mode === 'check') {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };
  console.log('\n  reroll-away check — the arms, the scores and the test, before any model time is spent\n');
  const a = armOf('control@5301'), b = armOf('treat@5302+away+note');
  ok('ARMS: a bare arm is neither; flags are read off the spec', !a.note && !a.away && a.base.endsWith(':5301') && b.note && b.away);
  let threw = false; try { armOf('treat@5302+typo'); } catch { threw = true; }
  ok('ARMS-STRICT: an unknown flag is refused, not ignored', threw);

  const A = 'The door sighs shut, sealing out the wet breath of the city, and the room goes still around them.';
  const B = 'Seraphine crosses to the chair and rests one gloved hand on its back, waiting for him to obey.';
  ok('SCORE-SAME: a take opening with the replaced take\'s words is a same opening', score(A + ' ' + B, A, [], '').sameOpening);
  ok('SCORE-FRESH: a take opening elsewhere is not', !score(B + ' ' + A, A, [], '').sameOpening);
  ok('SCORE-DIRECTIVE: an opening the directive holds is marked as the directive\'s',
     score(A, A, [], 'The door sighs shut, sealing out the wet breath.').openInDirective
     && !score(A, A, [], 'Seraphine waits.').openInDirective);
  ok('SCORE-OWN: a repeat the directive holds is out of REJECTED-OWN and still in REJECTED',
     score(A, A, [], A).rejected === 1 && score(A, A, [], A).rejectedOwn === 0 && score(A, A, [], B).rejectedOwn === 1);

  const rows: Row[] = [
    { arm: 'c', slot: 'x', i: 0, phrases: 40, sameOpening: true, rejected: 0.2, rejectedOwn: 0.05, openInDirective: true, s: 10 },
    { arm: 'c', slot: 'x', i: 1, phrases: 40, sameOpening: false, rejected: 0, s: 20 },
    { arm: 'c', slot: 'x', i: 2, phrases: 10, sameOpening: true, rejected: 1 },
    { arm: 'c', slot: 'x', i: 3, error: 'boom' },
    { arm: 't', slot: 'x', i: 0, phrases: 40, sameOpening: false, rejected: 0.05, away: { retried: true }, s: 30 },
  ];
  const t = tally(rows), c = t.find((r) => r.arm === 'c')!, tt = t.find((r) => r.arm === 't')!;
  ok('TALLY: short takes and errors are out of the denominator and counted beside it',
     c.n === 2 && c.short === 1 && c.errors === 1 && c.same === 1 && c.flagged === 1 && c.flaggedOwn === 0 && c.fromDirective === 1);
  ok('TALLY-RETRIED: a take the server asked for again is counted', tt.retried === 1 && tt.same === 0 && tt.flagged === 0);
  console.log(`\n  ${n} checks, all green`);
  process.exit(0);
}

const j = async (base: string, u: string, b?: unknown) => {
  const r = await fetch(base + u, b === undefined ? undefined
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return r.json() as any;
};

if (mode === 'report') {
  const rows = process.argv.slice(3).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row));
  const t = tally(rows);
  const pc = (k: number, n: number) => `${k}/${n} (${n ? Math.round(100 * k / n) : 0}%)`;
  console.log(`\n  ${'arm'.padEnd(10)} ${'takes'.padStart(5)}  ${'SAME OPENING'.padEnd(14)} ${'REJECTED>=.1'.padEnd(14)} ${'R-OWN>=.1'.padEnd(14)} ${'same, from directive'.padEnd(20)} ${'asked again'.padEnd(12)} med s  errors short`);
  for (const r of t) console.log(`  ${r.arm.padEnd(10)} ${String(r.n).padStart(5)}  ${pc(r.same, r.n).padEnd(14)} ${pc(r.flagged, r.n).padEnd(14)} ${pc(r.flaggedOwn, r.n).padEnd(14)} `
    + `${String(r.fromDirective).padEnd(20)} ${String(r.retried).padEnd(12)} ${String(r.medianS).padStart(5)}  ${r.errors} ${r.short}`);
  const slots = [...new Set(rows.map((r) => r.slot))];
  console.log('\n  by passage: SAME OPENING per arm');
  for (const s of slots) console.log(`  ${s.padEnd(12)} ` + t.map((a) => {
    const rs = rows.filter((r) => r.arm === a.arm && r.slot === s && !r.error && (r.phrases ?? 0) >= 20);
    return `${a.arm} ${rs.filter((r) => r.sameOpening).length}/${rs.length}`;
  }).join('   '));
  if (t.length >= 2) for (const x of t.slice(1)) {
    const c = t[0];
    console.log(`\n  ${c.arm} vs ${x.arm}: SAME OPENING p = ${fisher(c.same, c.n - c.same, x.same, x.n - x.same).toFixed(4)}`
      + `, REJECTED>=.1 p = ${fisher(c.flagged, c.n - c.flagged, x.flagged, x.n - x.flagged).toFixed(4)}`
      + `, R-OWN>=.1 p = ${fisher(c.flaggedOwn, c.n - c.flaggedOwn, x.flaggedOwn, x.n - x.flaggedOwn).toFixed(4)} (Fisher, two-sided)`);
  }
  console.log();
  process.exit(0);
}

if (mode !== 'run') { console.error('usage: check | run <out.jsonl> <n> <arm> [<arm>] | report <out.jsonl>...'); process.exit(2); }
const OUT = process.argv[3];
const N = Number(process.argv[4]);
const ARMS = process.argv.slice(5).map(armOf);
if (!OUT || !Number.isInteger(N) || !ARMS.length || ARMS.length > 2) throw new Error('run <out.jsonl> <n> <arm> [<arm>]: one or two arms');

// ---- the passages, read from the first arm; every arm is a copy of the same library. The Murmur's
// first passage is left out: it opens the chapter and carries the scene-opening block.
const passages: any[] = [];
for (const t of TALES) {
  const view = await j(ARMS[0].base, `/api/story?story=${t.sid}&chapter=${t.chapter}`);
  const all = (view.passages as any[]).filter((p) => !p.isBreak);
  const mine = t.ids ? all.filter((p) => t.ids!.includes(p.id)) : all.filter((p) => p.author === 'model' && p.ordinal > 1);
  if (t.ids && mine.length !== t.ids.length) throw new Error(`${t.sid}: ${mine.length} of ${t.ids.length} passages are the chosen take`);
  for (const p of mine) passages.push({ ...p, sid: t.sid, chapter: t.chapter,
    scene: all.filter((x) => x.ordinal < p.ordinal).map((x) => x.body) });
}

// ---- pin the model, then verify each arm through the manifest before any generation.
for (const arm of ARMS) {
  for (const t of TALES) {
    const st = await j(arm.base, '/api/story', { id: t.sid, story: { model: MODEL } });
    if (st.error) throw new Error(`pin on ${arm.base}: ${st.error}`);
  }
  for (const p of passages) {
    const m = await j(arm.base, '/api/manifest', { storyId: p.sid, chapterId: p.chapter, regenerateOf: p.id, count: false,
      ...(arm.note ? { whatFailed: NOTE } : {}) });
    const modeText = m.manifest?.blocks?.find((b: any) => b.kind === 'MODE')?.text ?? '';
    const sentNote = modeText.includes(NOTE);
    const v = await j(arm.base, `/api/story?story=${p.sid}&chapter=${p.chapter}`);
    const good = sentNote === arm.note && (m.away === true) === arm.away && v.model === MODEL;
    console.log(`  verify ${arm.name} ${p.id}: note ${sentNote ? 'sent' : 'not sent'}, away ${m.away === true ? 'on' : 'off'}, model ${v.model}  ${good ? 'ok' : 'BAD'}`);
    if (!good) throw new Error(`arm ${arm.name} is not what it says`);
  }
}

writeFileSync(OUT, '');
const words = (s: string) => (String(s ?? '').match(/\S+/g) ?? []).length;
async function one(arm: Arm, p: any, i: number): Promise<Row> {
  const t0 = Date.now();
  try {
    const r = await j(arm.base, '/api/generate', { storyId: p.sid, chapterId: p.chapter, regenerateOf: p.id,
      ...(arm.note ? { whatFailed: NOTE } : {}) });
    if (r.error || !r.prose) return { arm: arm.name, slot: p.id, i, error: String(r.error ?? 'no prose') };
    return { arm: arm.name, slot: p.id, i, ...score(r.prose, p.body, p.scene, String(p.directive ?? '')),
      away: r.away, s: Math.round((Date.now() - t0) / 1000), words: words(r.prose),
      opening: String(r.prose).replace(/\s+/g, ' ').slice(0, 90), prose: r.prose };
  } catch (e: any) { return { arm: arm.name, slot: p.id, i, error: String(e?.message ?? e) }; }
}
// Interleaved, passage by passage, so a stretch of slow router time lands on every passage.
for (let i = 0; i < N; i++) for (const p of passages) {
  const rows = await Promise.all(ARMS.map((a) => one(a, p, i)));
  for (const row of rows) { appendFileSync(OUT, JSON.stringify(row) + '\n'); console.log('  ' + JSON.stringify(row)); }
}
console.log('done ->', OUT);
