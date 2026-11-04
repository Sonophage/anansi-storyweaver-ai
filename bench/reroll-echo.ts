// Reroll echo (#139): how often a reroll repeats what the writer already rejected.
//
// Seth gave two reasons he rerolls: a take repeats something said earlier in the scene, or the new
// take repeats the one he just rejected. He stops a take when he sees the second happen. This
// measures both, from the library's own history, with no model call:
//
//   REJECTED  the share of a take's five-word narration phrases that are in the take it replaced
//             and NOT in the scene before it. A phrase both takes lifted from the scene is a scene
//             echo, not a repeat of the rejected take, and is counted once, below.
//   SCENE     the share of a take's phrases already in the scene's earlier passages.
//   CONTROL   REJECTED again, against a take from a DIFFERENT slot of the same tale: what two
//             unrelated takes share by chance, so the REJECTED number has something to be read against.
//
//   node --experimental-strip-types bench/reroll-echo.ts check     # the detector, no database
//   node --experimental-strip-types bench/reroll-echo.ts           # the report, live library read-only
//   node --experimental-strip-types bench/reroll-echo.ts show [n]  # n flagged and n unflagged pairs, to read
//
// What it can see: takes the writer let finish (every variant of a slot that still exists), and, from
// 2026-11-04, takes the writer stopped (`stopped_takes`). Deleted takes and deleted scenes are gone.
// ponytail: "the take it replaced" is the slot's previous variant. A writer who swipes back to an older
// take and rerolls THAT one is paired with the wrong take. Stopped takes carry the real one. Store the
// replaced id on every generation if the two kinds of pair disagree.
import { DatabaseSync } from 'node:sqlite';
import { grams, echo, rerollEcho } from './echo.ts';
import { input } from '../test/fixture.ts';

export type Passage = { id: string; story_id: string; chapter_id: string; branch_id: string; slot_key: number;
  variant_index: number; selected: number; author: string; body: string; is_break: number; owner: string; model: string | null };
export type Stopped = { generation_id: string; story_id: string; replaced: string | null; body: string; owner: string; model: string | null };
export type Pair = { kind: 'finished' | 'stopped'; story: string; owner: string; model: string | null; slot: string;
  takeId: string; take: string; replacedId: string; replaced: string; scene: string[];
  control: string | null; controlSlot: string | null };

/** Every reroll as a pair: each finished take against the slot's take before it, and each stopped
 *  take against the take it was rerolling. The scene is the chosen, non-empty passages before the
 *  slot in the same chapter and branch. Pure: rows in, pairs out. */
const written = (rows: Passage[]) => rows.filter((r) => !r.is_break && String(r.body ?? '').trim());
/** The scene before a take: the chosen passages before its slot, in its chapter and branch. */
const sceneOf = (live: Passage[], r: Passage) => live
  .filter((x) => x.selected && x.chapter_id === r.chapter_id && x.branch_id === r.branch_id && x.slot_key < r.slot_key)
  .sort((a, b) => a.slot_key - b.slot_key).map((x) => x.body);

export function pairsOf(rows: Passage[], stopped: Stopped[]): Pair[] {
  const live = written(rows);
  const slots = Map.groupBy(live, (r) => `${r.chapter_id}:${r.branch_id}:${r.slot_key}`);
  const label = (r: Passage) => `${r.chapter_id}:${r.slot_key}`;
  const out: Omit<Pair, 'control' | 'controlSlot'>[] = [];
  const seen = new Set<string>();
  const push = (p: Omit<Pair, 'control' | 'controlSlot'>) => {
    const k = p.take + '\u0000' + p.replaced;
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  };
  for (const takes of slots.values()) {
    const ts = takes.filter((t) => t.author === 'model').sort((a, b) => a.variant_index - b.variant_index);
    for (let i = 1; i < ts.length; i++)
      push({ kind: 'finished', story: ts[i].story_id, owner: ts[i].owner, model: ts[i].model, slot: label(ts[i]),
        takeId: ts[i].id, take: ts[i].body, replacedId: ts[i - 1].id, replaced: ts[i - 1].body, scene: sceneOf(live, ts[i]) });
  }
  const byId = new Map(live.map((r) => [r.id, r]));
  for (const s of stopped) {
    const r = s.replaced ? byId.get(s.replaced) : undefined;
    if (!r) continue;
    push({ kind: 'stopped', story: s.story_id, owner: s.owner, model: s.model, slot: label(r),
      takeId: s.generation_id, take: s.body, replacedId: r.id, replaced: r.body, scene: sceneOf(live, r) });
  }
  // THE CONTROL: the replaced take of the next pair in the same tale, from ANOTHER SCENE. A
  // neighbouring slot is not unrelated: the next passage carries the last one's moment on.
  const sceneKey = (slot: string) => slot.split(':')[0];
  return out.map((p, i) => {
    const same = out.filter((q) => q.story === p.story && sceneKey(q.slot) !== sceneKey(p.slot));
    const after = same.find((q) => out.indexOf(q) > i) ?? same[0];
    return { ...p, control: after?.replaced ?? null, controlSlot: after?.slot ?? null };
  });
}

/** SCENE for every model take, rerolled or not: what a take copies from the scene before it. */
export function sceneEchoes(rows: Passage[]) {
  const live = written(rows);
  return live.filter((r) => r.author === 'model').map((r) => {
    const scene = sceneOf(live, r);
    return { owner: r.owner, model: r.model, share: echo(r.body, scene).echoShare, phrases: grams(r.body).length };
  });
}

const CHECK = process.argv[2] === 'check';
if (CHECK) {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };
  console.log('\n  reroll-echo check — the detector and the pairing, before anything they say is believed\n');

  const A = 'The lamp guttered and went out, and Mara counted the steps down to the cellar in the dark.';
  const B = 'Rain hammered the shutters while the ferryman argued with a goat about the price of crossing.';
  ok('COPY: a take that copies the rejected one whole is all repeat (1)', rerollEcho(A, A, []).rejected === 1);
  ok('FRESH: an unrelated take repeats nothing (0)', rerollEcho(B, A, []).rejected === 0);
  ok('OPENING: a take that starts with the rejected take\'s first words is seen; one that starts elsewhere is not',
     rerollEcho(A + ' ' + B, A, []).sameOpening && !rerollEcho(B + ' ' + A, A, []).sameOpening);

  // A phrase both takes lifted from the scene is a scene echo, not a repeat of the rejected take.
  const SCENE = 'Mara counted the steps down to the cellar before the lamp failed.';
  const T1 = 'Again Mara counted the steps down to the cellar, and this time a hand found hers.';
  const R1 = 'Mara counted the steps down to the cellar while somebody behind her laughed softly.';
  const lifted = rerollEcho(T1, R1, [SCENE]);
  ok('SCENE-NOT-REJECTED: phrases both takes took from the scene are not a repeat of the rejected take',
     lifted.rejected === 0 && lifted.sceneShare > 0);
  // The same two takes with no scene: the shared run is now the rejected take's own. "mara counted the
  // steps down to the cellar" is eight words, so four five-word phrases of T1's twelve (sixteen words), by hand.
  const own = rerollEcho(T1, R1, []);
  ok('REJECTED-COUNT: the same run with no scene is four repeated phrases of twelve (0.333)',
     own.repeated === 4 && own.phrases === 12 && own.rejected === 0.333);
  ok('DIALOGUE: a line of dialogue repeated word for word is not counted',
     rerollEcho('"Count the steps down to the cellar," she said.', '"Count the steps down to the cellar," he said.', []).rejected === 0);

  // THE PAIRING, on rows shaped as the report reads them.
  const row = (id: string, slot: number, v: number, o: Partial<Passage> = {}): Passage => ({ id, story_id: 's1',
    chapter_id: 'c1', branch_id: 'b1', slot_key: slot, variant_index: v, selected: 0, author: 'model',
    body: `take ${id} body`, is_break: 0, owner: 'seth', model: 'm1', ...o });
  const rows = [
    row('a0', 1, 0, { selected: 1, author: 'human', body: 'the writer opens' }),
    row('b0', 2, 0), row('b1', 2, 1), row('b2', 2, 2, { selected: 1 }),   // three takes: two pairs
    row('c0', 3, 0, { selected: 1 }),                                        // one take: no pair
    row('d0', 4, 0), row('d1', 4, 1, { selected: 1 }),                       // after slot 2: not its scene
    row('x0', 1, 0, { chapter_id: 'c2', selected: 1, body: 'another scene' }),
    row('y0', 1, 0, { branch_id: 'b2', selected: 1, body: 'another branch' }),
    row('e0', 1, 0, { chapter_id: 'c3', body: 'a take in scene three' }), row('e1', 1, 1, { chapter_id: 'c3', selected: 1 }),
    // A copy of the tale (a fork, a re-import): the same takes under other ids.
    row('z0', 2, 0, { story_id: 's2', chapter_id: 'c9', body: 'take b0 body' }),
    row('z1', 2, 1, { story_id: 's2', chapter_id: 'c9', body: 'take b1 body' }),
  ];
  const stops: Stopped[] = [{ generation_id: 'g9', story_id: 's1', replaced: 'd1', body: 'stopped words', owner: 'seth', model: 'm2' }];
  const ps = pairsOf(rows, stops);
  const fin = ps.filter((p) => p.kind === 'finished');
  ok('PAIRS: a slot of three takes is two pairs, each take against the one before it; one take is none',
     fin.filter((p) => p.slot === 'c1:2').map((p) => p.takeId + '<' + p.replacedId).join() === 'b1<b0,b2<b1');
  ok('SCENE-BEFORE: the scene is the chosen passages before the slot, in this chapter and branch only',
     fin.find((p) => p.takeId === 'b1')!.scene.join('|') === 'the writer opens');
  ok('SCENE-GROWS: a later slot sees every chosen passage before it',
     fin.find((p) => p.takeId === 'd1')!.scene.join('|') === 'the writer opens|take b2 body|take c0 body');
  const st = ps.find((p) => p.kind === 'stopped');
  ok('STOPPED: a stopped take pairs with the take it was rerolling, with its own model and the scene of that slot',
     !!st && st.take === 'stopped words' && st.replacedId === 'd1' && st.model === 'm2' && st.scene.length === 3);
  ok('CONTROL: a pair\'s control is a replaced take from another scene of the same tale, never its own',
     ps.filter((p) => p.story === 's1').every((p) => p.control != null && p.controlSlot!.split(':')[0] !== p.slot.split(':')[0]));
  ok('DEDUPE: a copied tale\'s rerolls are counted once', ps.filter((p) => p.take === 'take b1 body').length === 1);

  // SCENE OVER EVERY TAKE, not only rerolls: a first take that copies the scene is scored too.
  const echoes = sceneEchoes([...rows, row('f0', 9, 0, { body: 'the writer opens' })]);
  ok('SCENE-ALL: every model take is scored against its scene, the first take of a slot included',
     echoes.length === rows.filter((r) => r.author === 'model').length + 1 && echoes.at(-1)!.share === 0);
  const W = 'Mara counted the steps down to the cellar before the lamp failed.';
  ok('SCENE-ALL-COPY: a first take that copies the scene is all echo (1)',
     sceneEchoes([row('w0', 1, 0, { selected: 1, author: 'human', body: W }), row('w1', 2, 0, { body: W })])[0].share === 1);

  // OUTSIDE ITS HOME: the fixture book was not written for this. Its passages are distinct prose, so
  // read as rerolls of each other they repeat nothing, and read as their own scene they echo nothing.
  const fx = input.passages.map((p) => p.body);
  ok('FIXTURE: the fixture book\'s passages, read as rerolls of each other, repeat nothing',
     fx.every((t, i) => fx.every((r, j) => i === j || rerollEcho(t, r, []).rejected === 0)));
  ok('FIXTURE-SCENE: and read against the passages before them, echo nothing',
     fx.every((t, i) => rerollEcho(t, '', fx.slice(0, i)).sceneShare === 0));

  console.log(`\n  ${n} checks, all green`);
  process.exit(0);
}

/* ---------- the report ---------- */

const LIVE = process.env.ANANSI_DB ?? `${process.env.HOME}/Documents/repositories/sonophage/anansi/anansi.db`;
const d = new DatabaseSync(LIVE, { readOnly: true });
const rows = d.prepare(`
  SELECT p.id, p.story_id, p.chapter_id, p.branch_id, p.slot_key, p.variant_index, p.selected, p.author,
         p.body, p.is_break, u.login AS owner,
         (SELECT g.model FROM generations g WHERE g.passage_id = p.id ORDER BY g.created_at DESC LIMIT 1) AS model
    FROM passages p JOIN stories s ON s.id = p.story_id JOIN users u ON u.id = s.owner_id
   WHERE u.login != 'demo'`).all() as Passage[];
const hasStops = !!d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stopped_takes'").get();
const stops = hasStops ? d.prepare(`
  SELECT t.generation_id, t.story_id, t.replaced, t.body, u.login AS owner, g.model
    FROM stopped_takes t JOIN generations g ON g.id = t.generation_id
    JOIN stories s ON s.id = t.story_id JOIN users u ON u.id = s.owner_id WHERE u.login != 'demo'`).all() as Stopped[] : [];
d.close();

/** A take with fewer phrases than this is left out: one shared phrase in eight reads as 12%. */
const MIN_PHRASES = 20;
/** The line for a repeat, set against CONTROL: unrelated takes from another scene reach it in under 1%
 *  of pairs, so a take over it is copying the one it replaced, not sharing stock phrases by chance. */
const FLAG = 0.1;
const scored = pairsOf(rows, stops).map((p) => ({ ...p, ...rerollEcho(p.take, p.replaced, p.scene),
  chance: p.control == null ? null : rerollEcho(p.take, p.control, p.scene).rejected }));
const pairs = scored.filter((p) => p.phrases >= MIN_PHRASES);

if (process.argv[2] === 'show') {
  // Pairs to read by eye: the detector checked against takes it was not written for.
  const k = Math.max(1, Number(process.argv[3]) || 10);
  const words = (t: string, n = 60) => t.replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' ');
  const print = (p: typeof pairs[number]) => console.log(`\n  ${p.kind} ${p.owner} ${p.slot}  rejected ${p.rejected}  scene ${p.sceneShare}`
    + `\n    TAKE      ${words(p.take)}\n    REPLACED  ${words(p.replaced)}\n    SHARED    ${p.shared.slice(0, 8).join(' | ')}`);
  const flagged = pairs.filter((p) => p.rejected >= FLAG).sort((a, b) => b.rejected - a.rejected);
  const clean = pairs.filter((p) => p.rejected < FLAG);
  console.log(`\n  FLAGGED (REJECTED >= ${FLAG}): the ${k} highest of ${flagged.length}`);
  flagged.slice(0, k).forEach(print);
  console.log(`\n  FLAGGED, THE ${k} NEAREST THE LINE`);
  flagged.slice(-k).forEach(print);
  console.log(`\n  UNFLAGGED: ${k} of ${clean.length}, evenly spaced`);
  for (let i = 0; i < k && clean.length; i++) print(clean[Math.floor(i * clean.length / k)]);
  process.exit(0);
}

const q = (xs: number[], f: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0; };
const pct = (xs: number[], t: number) => {
  if (!xs.length) return '-';
  const k = xs.filter((x) => x >= t).length, r = Math.round(100 * k / xs.length);
  return k && !r ? '<1%' : `${r}%`;
};
const line = (name: string, ps: typeof pairs) => {
  const rj = ps.map((p) => p.rejected), ch = ps.filter((p) => p.chance != null).map((p) => p.chance!), sc = ps.map((p) => p.sceneShare);
  console.log(`  ${name.padEnd(46)} ${String(ps.length).padStart(5)}   `
    + `${q(rj, .5).toFixed(3)} ${q(rj, .9).toFixed(3)} ${pct(rj, .1).padStart(4)} ${pct(rj, .25).padStart(4)}   `
    + `${q(ch, .5).toFixed(3)} ${q(ch, .9).toFixed(3)} ${pct(ch, .1).padStart(4)} ${pct(ch, .25).padStart(4)}   `
    + `${q(sc, .5).toFixed(3)} ${q(sc, .9).toFixed(3)} ${pct(sc, .1).padStart(4)}   `
    + `${pct(ps.map((p) => +p.sameOpening), 1).padStart(4)}`);
};
console.log(`\n  reroll echo — ${LIVE}, read-only. ${rows.length} passages, ${stops.length} stopped takes`
  + `${hasStops ? '' : ' (no stopped_takes table yet)'}. ${scored.length - pairs.length} short takes left out.`
  + `\n  ${pairs.length} pairs from ${new Set(pairs.map((p) => p.story + ' ' + p.slot)).size} rerolled slots.`);
console.log(`\n  ${''.padEnd(46)} ${'pairs'.padStart(5)}   REJECTED (vs the take replaced)   CONTROL (vs another scene)      SCENE              SAME`);
console.log(`  ${''.padEnd(46)} ${''.padStart(5)}   med   p90   >=.1 >=.25   med   p90   >=.1 >=.25   med   p90   >=.1   OPENING`);
const by = (key: (p: typeof pairs[number]) => string, min = 1) => {
  const g = Map.groupBy(pairs, key);
  for (const [k, ps] of [...g].sort((a, b) => b[1].length - a[1].length)) if (ps.length >= min) line(k, ps);
};
line('all', pairs);
console.log();
by((p) => `${p.owner} · ${p.kind}`);
console.log();
by((p) => (p.model ?? '(no generation row)').replace(/^featherless:/, 'fl:').slice(0, 46), 10);
console.log(`\n  A pair is a reroll: a take and the take it replaced. Shares are of the take's five-word narration`
  + `\n  phrases. REJECTED leaves out phrases the scene already had; CONTROL is the same measure against a take`
  + `\n  from another scene of the tale, so it shows what unrelated takes share by chance. SAME OPENING: the`
  + `\n  take starts with the replaced take's first five narration words. Models with 10+ pairs.\n`);

// SCENE OVER EVERY TAKE: the first take of a slot as well as each reroll.
const all = sceneEchoes(rows).filter((t) => t.phrases >= MIN_PHRASES);
const sceneLine = (name: string, ts: typeof all) => {
  const sh = ts.map((t) => t.share);
  console.log(`  ${name.padEnd(46)} ${String(ts.length).padStart(5)}   ${q(sh, .5).toFixed(3)} ${q(sh, .9).toFixed(3)} `
    + `${pct(sh, .1).padStart(4)} ${pct(sh, .25).padStart(4)}`);
};
console.log(`  SCENE, EVERY MODEL TAKE                        takes   med   p90   >=.1 >=.25`);
sceneLine('all', all);
for (const [k, ts] of [...Map.groupBy(all, (t) => t.owner)].sort((a, b) => b[1].length - a[1].length)) sceneLine(k, ts);
for (const [k, ts] of [...Map.groupBy(all, (t) => (t.model ?? '(no generation row)').replace(/^featherless:/, 'fl:').slice(0, 46))]
  .sort((a, b) => b[1].length - a[1].length)) if (ts.length >= 10) sceneLine(k, ts);
console.log();
