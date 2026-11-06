// #160 · DOES THE SCENE REACT TO THE WRITER'S ACT? Seth's standard for Act (2026-11-06): "The character
// selected acts and the people in the scene react to that action." In the #149 read he marked 4 of 10 Act
// takes on the scene 10 point Would fix, and three of them open on Halsey not answering "the question",
// when nobody had asked her one. The Act wording says the other character "answers" the act; arm B says
// "reacts to" it instead, and nothing else changes.
//
//   node --experimental-strip-types bench/act-react.ts check            # the detector, no model
//   node --experimental-strip-types bench/act-react.ts run [takes per arm, default 30]
//   node --experimental-strip-types bench/act-react.ts report
//
// THE DETECTOR: the take's first sentence of narration shares a word with the act (the actor's name and
// little words left out, light stemming; a word of four letters or more that ends another counts, so
// "card" is the act's "keycard", a case the first version missed on the A/B's own takes). On the 19 #149 takes Seth marked it agrees 17 times; both misses
// are scene 4 takes he marked Fine that open on "the plate", which the act calls "the last slice of pie".
// ponytail: words, not meaning. Ceiling: a reaction that names the act's thing by another word reads as
// no reaction (it errs strict, the same in both arms). Trigger: a take Seth marks Fine that the detector
// counts as missed, on a point where that is more than one in ten.
//
// NEVER THE LIVE LIBRARY: each arm answers on its own copy (VACUUM INTO), cut back to the scene 10 point
// the way bench/modes-read.ts does it, with the arm's Act wording written into the copy's own saved
// wording. Both arms run at the same time, on one router, and each arm's wording is checked in
// POST /api/manifest before anything is generated.
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fisher } from './stats.ts';

const LITTLE = new Set(['the', 'and', 'not', 'does', 'did', 'with', 'his', 'her', 'him', 'she', 'they', 'them', 'their',
  'its', 'from', 'into', 'onto', 'for', 'are', 'was', 'were', 'has', 'have', 'had', 'who', 'that', 'this', 'when', 'than',
  'then', 'any', 'all', 'one', 'off', 'out', 'but', 'over', 'under', 'upon', 'there', 'what', 'which', 'while', 'without']);

/** Does the take's opening react to the act? See the header for the rule and its ceiling. */
export function reacts(act: string, speaker: string, take: string): boolean {
  const stem = (w: string) => w.length > 4 ? w.replace(/(ing|ed|es|e|s)$/, '') : w.length === 4 ? w.replace(/s$/, '') : w;
  const name = new Set(speaker.toLowerCase().split(/\s+/));
  const words = (t: string) => (t.toLowerCase().replace(/['’]s\b/g, '').match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((w) => w.length > 2 && !LITTLE.has(w) && !name.has(w)).map(stem);
  // Narration only: quoted spans go first, then the first sentence of what is left.
  const told = take.replace(/["“][^"”]*["”]/g, ' ').trim();
  const first = told.match(/^[^.!?]*[.!?]?/)?.[0] ?? '';
  // A word that ends another, four letters or more, is the same thing: "card" is the act's "keycard".
  const did = words(act), same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.endsWith(b) || b.endsWith(a)));
  return words(first).some((w) => did.some((d) => same(w, d)));
}

// Imported for its detector, it runs nothing (the lockout-book pattern).
const [mode, arg] = import.meta.main ? process.argv.slice(2) : ['imported'];

if (mode === 'check') {
  const assert = (await import('node:assert')).default;
  const BED = 'Seth sets the keycard on the nightstand, sits on the edge of the bed, and leaves the door unlocked behind her.';
  const DINER = 'Seth slides the last slice of pie across the table to her without a word.';
  // Seth's own marks, #149 (2026-11-06): the first sentence of each take, as Ornith wrote it.
  const fine = [
    [BED, 'Halsey watches the keycard slide across the wood, a small metallic click marking the boundary. She doesn\'t move.'],
    [BED, 'Halsey watches the keycard settle against the wood, the plastic clicking soft against the grain.'],
    [BED, 'Halsey watches his hand leave the keycard. The plastic clicks against the wood.'],
    [DINER, 'Halsey watches the plate slide across the Formica, the ceramic scraping softly against the worn surface.'],
    [DINER, 'Halsey stares at the plate sliding toward her, the dark blue filling catching the neon light.'],
    [DINER, 'Halsey stares at the plate as it slides into her lap, the fork suddenly feeling heavy in her hand.'],
  ];
  const fix = [
    [BED, 'Halsey doesn\'t move right away. She lets the silence stretch, lets the hum of the air conditioner fill the space.'],
    [BED, 'Halsey doesn’t answer the question. She walks to the window and pulls the curtain shut. Then she looks at him where he sits on the edge of the bed.'],
    [BED, 'Halsey lets the question hang, then crosses the room. She doesn\'t go to the window or the painting. She goes to the bed.'],
  ];
  for (const [a, t] of fine) assert.ok(reacts(a, 'Seth', t), `ACT-REACT-FINE: a take Seth marked Fine reads as a reaction: ${t.slice(0, 50)}`);
  for (const [a, t] of fix) assert.ok(!reacts(a, 'Seth', t), `ACT-REACT-FIX: a take Seth marked Would fix reads as no reaction: ${t.slice(0, 50)}`);
  // Outside the home fixture: the actor's own name is no reaction, a line of dialogue is not narration,
  // and present or past tense, plural or not, the same thing named is the same word.
  assert.ok(!reacts(BED, 'Seth', 'Seth waits. The room is quiet.'), 'ACT-REACT-NAME: the actor\'s name alone is no reaction');
  assert.ok(!reacts(BED, 'Seth', '"Is that the keycard?" Halsey turns away.'), 'ACT-REACT-QUOTE: a quoted word is not narration');
  assert.ok(reacts('Mara slammed the doors shut.', 'Mara', 'Joss flinched as the door slammed.'), 'ACT-REACT-STEM: doors and door, slammed and slammed');
  assert.ok(reacts(DINER, 'Seth', 'She stops the slice with two fingers before it reaches the edge.'), 'ACT-REACT-PLAIN: the act\'s thing named');
  // From the #160 A/B, a take the #149 fixture never had: "card" is the act's "keycard".
  assert.ok(reacts(BED, 'Seth', 'Halsey watches the card slide across the wood. The plastic clicks.'), 'ACT-REACT-PART: a word that ends another names the same thing');
  assert.ok(!reacts('Seth sets down the teacup.', 'Seth', 'She takes a cup from the shelf.'), 'ACT-REACT-SHORT: a short tail (cup in teacup) is not enough');
  assert.ok(!reacts(DINER, 'Seth', ''), 'ACT-REACT-EMPTY: an empty take reacts to nothing');
  console.log('  ok  act-react: the detector agrees with Seth\'s marks and reads narration only');
  process.exit(0);
}

const MODEL = 'Ornith-1.0-RPNTH-35B';
const OUT = process.env.BENCH_OUT ?? '/tmp/anansi-act-react';
const SOURCE = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
const POINT = { chapter: 10, after: 200, speaker: 'Seth',
  act: 'Seth sets the keycard on the nightstand, sits on the edge of the bed, and leaves the door unlocked behind her.' };
// THE ONE CHANGE: Seth's saved Act wording says "answers"; arm B says "reacts to". Both strings must be in it.
const WAS = 'Write how another character in the scene answers it with an action of their own. They may speak as they do it, but their answer is something they do.';
const NOW = 'Write how another character in the scene reacts to it with an action of their own. They may speak as they do it, but their reaction is something they do.';
const ARMS = [{ key: 'A', port: 5301, from: WAS, to: WAS }, { key: 'B', port: 5302, from: WAS, to: NOW }];

if (mode === 'run') {
  const n = Number(arg ?? 30);
  mkdirSync(OUT, { recursive: true });
  rmSync(join(OUT, 'takes.jsonl'), { force: true });
  await Promise.all(ARMS.map(async (arm) => {
    const file = join(OUT, `arm-${arm.key}.db`);
    for (const x of ['', '-wal', '-shm']) rmSync(file + x, { force: true });
    const src = new DatabaseSync(SOURCE, { readOnly: true }); src.exec(`VACUUM INTO '${file}'`); src.close();
    const d = new DatabaseSync(file);
    d.exec('PRAGMA foreign_keys = ON');
    const st = d.prepare("SELECT s.id, s.owner_id FROM stories s JOIN users u ON u.id = s.owner_id WHERE s.title = 'ENCORE' AND u.login = 'sonophage'").get() as any;
    d.prepare('UPDATE stories SET model = ? WHERE id = ?').run(MODEL, st.id);
    const ch = d.prepare('SELECT id FROM chapters WHERE story_id = ? AND idx = ?').get(st.id, POINT.chapter) as any;
    d.prepare('DELETE FROM passages WHERE story_id = ? AND (chapter_id IN (SELECT id FROM chapters WHERE story_id = ? AND idx > ?) OR (chapter_id = ? AND ordinal > ?))')
      .run(st.id, st.id, POINT.chapter, ch.id, POINT.after);
    d.prepare('DELETE FROM chapters WHERE story_id = ? AND idx > ?').run(st.id, POINT.chapter);
    d.prepare("UPDATE chapters SET status = 'open' WHERE id = ?").run(ch.id);
    const saved = d.prepare("SELECT text FROM prompt_overrides WHERE owner_id = ? AND key = 'act'").get(st.owner_id) as any;
    if (!saved?.text?.includes(arm.from)) { console.error(`arm ${arm.key}: Seth's saved Act wording no longer has the line this bench changes`); process.exit(1); }
    d.prepare("UPDATE prompt_overrides SET text = ? WHERE owner_id = ? AND key = 'act'").run(saved.text.replace(arm.from, arm.to), st.owner_id);
    d.close();
    const kid = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], { cwd: new URL('..', import.meta.url).pathname,
      stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ANANSI_PORT: String(arm.port), ANANSI_DB: file, ANANSI_MODEL: MODEL,
        ANANSI_FEATHERLESS_KEY_FILE: '/nonexistent/featherless.key', ANANSI_ALLOW: '' } });
    kid.stderr!.on('data', (b) => appendFileSync(join(OUT, `serve-${arm.key}.log`), b));
    const j = (u: string, b?: unknown) => fetch(`http://127.0.0.1:${arm.port}${u}`, b
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any, (e) => ({ error: String(e) }));
    let up = false;
    for (let i = 0; i < 90 && !up; i++) { up = await fetch(`http://127.0.0.1:${arm.port}/`).then((r) => r.ok, () => false); if (!up) await new Promise((r) => setTimeout(r, 1000)); }
    if (!up) { console.error(`arm ${arm.key}: no server; see ${OUT}/serve-${arm.key}.log`); kid.kill(); process.exit(1); }
    const v = await j(`/api/story?story=${st.id}`);
    if (v.story?.model !== MODEL || v.currentChapter?.index !== POINT.chapter) { console.error(`arm ${arm.key}: on ${v.story?.model}, scene ${v.currentChapter?.index}`); kid.kill(); process.exit(1); }
    await j('/api/write', { storyId: st.id, body: POINT.act, speaker: POINT.speaker, mode: 'act' });
    const body = { storyId: st.id, mode: 'act', speaker: POINT.speaker };
    const prompt = String((await j('/api/manifest', body)).prompt ?? '');
    if (!prompt.includes(arm.to) || !prompt.includes(POINT.act)) { console.error(`arm ${arm.key}: the arm's wording or the act is not in the prompt`); kid.kill(); process.exit(1); }
    // ONE AT A TIME PER ARM: two on the router, the load of the #149 run, so the other slots stay free
    // for the live library. Nothing streams, so nothing is saved.
    for (let k = 0; k < n; k++) {
      const r = await j('/api/generate', body);
      appendFileSync(join(OUT, 'takes.jsonl'), JSON.stringify({ arm: arm.key, i: k, prose: r.prose ?? null, error: r.error ?? null }) + '\n');
    }
    kid.kill();
    console.log(`  arm ${arm.key}: ${n} takes`);
  }));
  process.exit(0);
}

if (mode === 'report') {
  const rows = readFileSync(join(OUT, 'takes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const tally = ARMS.map((arm) => {
    const got = rows.filter((r) => r.arm === arm.key && r.prose);
    const yes = got.filter((r) => reacts(POINT.act, POINT.speaker, r.prose)).length;
    const question = got.filter((r) => /question/i.test(r.prose.split(/(?<=[.!?])\s/)[0] ?? '')).length;
    return { arm: arm.key, n: got.length, errors: rows.filter((r) => r.arm === arm.key && !r.prose).length, yes, question };
  });
  for (const t of tally) console.log(`  arm ${t.arm}: reacts ${t.yes} of ${t.n} (${t.errors} errors); first sentence names "the question" ${t.question}`);
  const [a, b] = tally;
  console.log(`  Fisher two-tailed p = ${fisher(a.yes, a.n - a.yes, b.yes, b.n - b.yes).toFixed(4)}`);
  process.exit(0);
}

if (mode !== 'imported') { console.error('usage: bench/act-react.ts check | run [n] | report'); process.exit(2); }
