// #161 · DOES NARRATE PLAY THE WRITER'S NARRATION AGAIN? Seth's standard for Narrate (2026-11-06): "it is
// not rewritten, paraphrased, or anything, anansi only writes what happens right after the end of the
// narration." In the #149 read every one of ten Narrate takes on ENCORE's scene 4 point opened by doing
// the narration's action again ("He just reaches for the plate ... and slides it across the Formica"),
// two of them word for word; none of ten on the scene 10 point did.
//
// THE SUSPECT: where the narration sits. Since 2026-11-02 the Narrate wording quotes it at the end of
// the instruction ({{last}}) and takes it out of the story's prose, so the prose stops BEFORE it. At
// scene 4 the prose then ends on Halsey's confession, whose natural next beat is Seth's reaction, which
// is what the narration says; at scene 10 it ends on Seth's own line. Arm B leaves the narration where
// it was written, as the last passage of the prose, and says so; nothing else changes.
//
//   node --experimental-strip-types bench/narrate-replay.ts check            # the detector, no model
//   node --experimental-strip-types bench/narrate-replay.ts run [takes per arm, default 30]
//   node --experimental-strip-types bench/narrate-replay.ts report
//
// THE DETECTOR: a sentence of the take's first paragraph of narration (quoted spans removed) that has
// the narration's verb and its object, and no one watching, staring or looking in it. Halsey watching
// him sit is a reaction (Seth marked all ten scene 10 takes Fine); Seth sliding the plate again is the
// narration replayed. On the 60 #149 takes it fires on 10 of 10 scene 4 Narrate takes, 0 of 10 scene 10
// Narrate takes, 0 of 20 Act takes, and on 9 of 10 scene 10 Direct takes, which play the synopsis's
// action because that is Direct's job.
// NEVER THE LIVE LIBRARY: each arm a copy cut back to the point (bench/scene.ts), its wording written into
// the copy, both arms at once on one router, each arm's prompt checked.
import { mkdirSync, rmSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fisher } from './stats.ts';
import { copyAt, serveAt } from './scene.ts';

const SEE = /\b(watch\w*|star(e|es|ed|ing)|look\w*|see|sees|seeing|saw|notic\w*|eyes)\b/i;

/** Does the take open by doing the narration's action again? See the header for the rule. */
export function replays(take: string, verbs: RegExp, objects: RegExp): boolean {
  const opening = take.replace(/["“][^"”]*["”]/g, ' ').trim().split(/\n\s*\n/)[0] ?? '';
  return opening.split(/(?<=[.!?])\s+/).some((s) => verbs.test(s) && objects.test(s) && !SEE.test(s));
}

// Imported for its detector, it runs nothing (the lockout-book pattern).
const [mode, arg] = import.meta.main ? process.argv.slice(2) : ['imported'];

if (mode === 'check') {
  const assert = (await import('node:assert')).default;
  const SLIDE = /\b(slid\w*|push\w*|nudg\w*)\b/i, PIE = /\b(plate|pie|slice)\b/i;
  const SIT = /\b(set|sets|setting|put|puts|plac\w*|sits?|sitting|sat|settl\w*|lower\w*|sinks?)\b/i,
    CARD = /\b(keycard|card|nightstand|bed|mattress)\b/i;
  // #149, scene 4 Narrate: the first paragraph of takes 1 and 3, as Ornith wrote them.
  assert.ok(replays('He doesn\'t blink. Doesn\'t make a show of it. Just reaches for the plate, the ceramic scraping soft against the Formica, and slides the last wedge of blueberry pie toward her.', SLIDE, PIE),
    'NARRATE-REPLAY-DOES: Seth slides the plate again, with no "he" in the sentence');
  assert.ok(replays('He doesn\'t blink. Doesn\'t smile wider. He just pushes the plate across the Formica, the ceramic scraping softly against the surface.', SLIDE, PIE),
    'NARRATE-REPLAY-PUSH: pushing the plate is the same action');
  // #149, scene 10 Narrate, takes 1 and 7, marked Fine: watching the action is reacting to it.
  assert.ok(!replays('Halsey watches him sit. The bed dips under his weight, a small, tangible shift in the room\'s gravity.', SIT, CARD),
    'NARRATE-REPLAY-WATCH: Halsey watching him sit is a reaction');
  assert.ok(!replays('Halsey stares at the keycard. It\'s just plastic, but it feels heavier than the contract.', SIT, CARD),
    'NARRATE-REPLAY-STARE: staring at the card is a reaction');
  // Outside the home fixture: an Act take on scene 4, dialogue, a later paragraph, nothing.
  assert.ok(!replays('Halsey watches the plate slide across the Formica, the ceramic scraping softly against the worn surface.', SLIDE, PIE),
    'NARRATE-REPLAY-ACT: an Act take watching the plate arrive is no replay');
  assert.ok(!replays('"Did you just slide me the last of the pie?" She laughs.', SLIDE, PIE),
    'NARRATE-REPLAY-QUOTE: a quoted word is not narration');
  assert.ok(!replays('She picks up the fork.\n\nLater, he slides the plate back.', SLIDE, PIE),
    'NARRATE-REPLAY-OPENING: only the first paragraph counts');
  assert.ok(!replays('She slides out of the booth. The pie stays where it is.', SLIDE, PIE),
    'NARRATE-REPLAY-SENTENCE: the verb and the object in one sentence');
  assert.ok(!replays('', SLIDE, PIE), 'NARRATE-REPLAY-EMPTY: an empty take replays nothing');
  console.log('  ok  narrate-replay: the detector finds the narration done again, and not a reaction to it');
  process.exit(0);
}

const MODEL = 'Ornith-1.0-RPNTH-35B';
const OUT = process.env.BENCH_OUT ?? '/tmp/anansi-narrate-replay';
const SOURCE = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
const POINT = { chapter: 4, after: 73, verbs: /\b(slid\w*|push\w*|nudg\w*)\b/i, objects: /\b(plate|pie|slice)\b/i,
  narration: 'Seth doesn\'t make anything of it. He slides the plate with the last slice of pie across the table to her and waits, as if her name were the most ordinary thing in the world.' };
// THE ONE CHANGE: where the narration sits. A is Seth's saved Narrate wording, which is also the shipped
// one: the narration quoted at the end of the instruction. B says it is the last passage above and does
// not quote it, so it stays at the end of the story's prose.
const FIRST_A = 'The writer has just written what happens, given at the end. It is the story itself, not an instruction.';
const FIRST_B = 'The writer has just written what happens: the last passage above. It is the story itself, not an instruction.';
const LAST_A = '\n\nWhat the writer just wrote: {{last}}';
const ARMS = [{ key: 'A', port: 5301 }, { key: 'B', port: 5302 }];

if (mode === 'run') {
  const n = Number(arg ?? 30);
  mkdirSync(OUT, { recursive: true });
  rmSync(join(OUT, 'takes.jsonl'), { force: true });
  await Promise.all(ARMS.map(async (arm) => {
    const file = join(OUT, `arm-${arm.key}.db`);
    const { storyId } = copyAt(SOURCE, file, POINT, MODEL, (d, st) => {
      const saved = d.prepare("SELECT text FROM prompt_overrides WHERE owner_id = ? AND key = 'narrate'").get(st.owner_id) as any;
      if (!saved?.text?.includes(FIRST_A) || !saved.text.endsWith(LAST_A)) { console.error(`arm ${arm.key}: Seth's saved Narrate wording no longer has the lines this bench changes`); process.exit(1); }
      const wording = arm.key === 'A' ? saved.text : saved.text.replace(FIRST_A, FIRST_B).slice(0, -LAST_A.length);
      d.prepare("UPDATE prompt_overrides SET text = ? WHERE owner_id = ? AND key = 'narrate'").run(wording, st.owner_id);
    });
    const { j, kill } = await serveAt(file, arm.port, MODEL, POINT, storyId, join(OUT, `serve-${arm.key}.log`));
    await j('/api/write', { storyId, body: POINT.narration, mode: 'narrate' });
    const body = { storyId, mode: 'narrate' };
    const prompt = String((await j('/api/manifest', body)).prompt ?? '');
    // A: the narration once, inside the instruction. B: once, before the instruction opens.
    const at = prompt.indexOf(POINT.narration), fence = prompt.lastIndexOf('<mode>');
    const where = prompt.split(POINT.narration).length === 2 && (arm.key === 'A' ? at > fence : at < fence);
    if (!where || !prompt.includes(arm.key === 'A' ? FIRST_A : FIRST_B)) { console.error(`arm ${arm.key}: the narration is not where this arm puts it`); kill(); process.exit(1); }
    // ONE AT A TIME PER ARM: two on the router, so the other slots stay free for the live library.
    for (let k = 0; k < n; k++) {
      const r = await j('/api/generate', body);
      appendFileSync(join(OUT, 'takes.jsonl'), JSON.stringify({ arm: arm.key, i: k, prose: r.prose ?? null, error: r.error ?? null }) + '\n');
    }
    kill();
    console.log(`  arm ${arm.key}: ${n} takes`);
  }));
  process.exit(0);
}

if (mode === 'report') {
  const rows = readFileSync(join(OUT, 'takes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const tally = ARMS.map((arm) => {
    const got = rows.filter((r) => r.arm === arm.key && r.prose);
    const again = got.filter((r) => replays(r.prose, POINT.verbs, POINT.objects)).length;
    const copied = got.filter((r) => r.prose.includes(POINT.narration.slice(0, 60))).length;
    return { arm: arm.key, n: got.length, errors: rows.filter((r) => r.arm === arm.key && !r.prose).length, again, copied };
  });
  for (const t of tally) console.log(`  arm ${t.arm}: replays the narration ${t.again} of ${t.n} (${t.errors} errors); copies its opening word for word ${t.copied}`);
  const [a, b] = tally;
  console.log(`  Fisher two-tailed p = ${fisher(a.again, a.n - a.again, b.again, b.n - b.again).toFixed(4)}`);
  process.exit(0);
}

if (mode !== 'imported') { console.error('usage: bench/narrate-replay.ts check | run [n] | report'); process.exit(2); }
