// #163 · DOES DIRECT WRITE FROM THE SYNOPSIS OR REWRITE IT? Seth's standard for Direct (2026-11-06): "this
// is a direction or a very basic prompt of what should happen next, anansi takes the direction and writes
// using that as its direction." Seth's Direct wording said "Rewrite it as one full beat of the story", and
// in the #149 read all ten Direct takes on ENCORE's scene 10 point opened with the synopsis's own first
// sentence, "Seth doesn't argue."; Seth marked two of them robotic. Arm B says "Write the next beat of
// the story, taking the synopsis as its direction" instead (Seth chose the line, 2026-11-06); nothing
// else changes, "Everything the synopsis says happens must happen" included.
//
//   node --experimental-strip-types bench/direct-echo.ts check            # the detector, no model
//   node --experimental-strip-types bench/direct-echo.ts run [takes per arm, default 30]
//   node --experimental-strip-types bench/direct-echo.ts report
//
// THE DETECTOR: the take's first two sentences share a run of three or more words, in order, with the
// synopsis's first sentence ("Seth doesn't argue" is three). On the 60 #149 takes it fires on 10 of 10
// scene 10 Direct takes, and on none of the 20 Act and Narrate takes on that point or the 10 scene 4
// Direct takes, which open "Seth doesn't blink" against "Seth lets the slip pass without comment".
// The report also counts the synopsis's events each take has, so a wording that echoes less by doing
// less shows up.
// ponytail: a word run, not meaning. Ceiling: an opening that says the synopsis's first sentence in
// other words reads as no echo. Trigger: a B take Seth reads as robotic that this counts as clean.
//
// NEVER THE LIVE LIBRARY, the same way bench/act-react.ts does it.
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fisher } from './stats.ts';

const toks = (t: string) => t.toLowerCase().replace(/’/g, '\'').match(/[\p{L}\p{N}']+/gu) ?? [];
/** The longest run of words two texts share, in order. */
export function longestRun(a: string, b: string): number {
  const x = toks(a), y = toks(b); let best = 0;
  const row = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diag = 0;
    for (let j = 1; j <= y.length; j++) {
      const up = row[j]; row[j] = x[i - 1] === y[j - 1] ? diag + 1 : 0; best = Math.max(best, row[j]); diag = up;
    }
  }
  return best;
}

/** Does the take open with the synopsis's own first sentence? See the header for the rule. */
export function echoes(take: string, synopsis: string): boolean {
  const sentences = (t: string) => t.trim().split(/(?<=[.!?])\s+/);
  const opening = sentences(take.trim().split(/\n\s*\n/)[0] ?? '').slice(0, 2).join(' ');
  return longestRun(opening, sentences(synopsis)[0] ?? '') >= 3;
}

// Imported for its detector, it runs nothing (the lockout-book pattern).
const [mode, arg] = import.meta.main ? process.argv.slice(2) : ['imported'];

if (mode === 'check') {
  const assert = (await import('node:assert')).default;
  const BED = 'Seth doesn\'t argue. He puts the keycard on the nightstand where she can reach it and sits on the edge of the bed, leaving the door unlocked so the choice is hers. Halsey has to decide whether to take the card and go.';
  const DINER = 'Seth lets the slip pass without comment. He slides the last slice of pie across the table to her and waits. Halsey decides what to do with the fact that he now knows her real name.';
  assert.strictEqual(longestRun('a b c d', 'x b c y'), 2, 'DIRECT-ECHO-RUN: two words in order');
  // #149, scene 10 Direct, as Ornith wrote them (curly and straight apostrophes both).
  assert.ok(echoes('Seth doesn\'t argue. He lets the silence sit between them, heavy and unbroken.', BED), 'DIRECT-ECHO-OPEN: the synopsis\'s first sentence, word for word');
  assert.ok(echoes('Seth doesn’t argue. He turns, walks to the small nightstand beside the single bed.', BED), 'DIRECT-ECHO-CURLY: with a curly apostrophe');
  // Not an echo: scene 4 Direct, and Act and Narrate on scene 10.
  assert.ok(!echoes('Seth doesn\'t blink. He doesn\'t say *Ashley* like it\'s a secret.', DINER), 'DIRECT-ECHO-DINER: an opening of its own');
  assert.ok(!echoes('Halsey watches the keycard slide across the wood. She doesn\'t move.', BED), 'DIRECT-ECHO-REACT: a reaction is no echo');
  // Outside the home fixture: the run has to be in the opening, and from the first sentence.
  assert.ok(!echoes('Halsey stands by the window. The lamp hums.\n\nLater Seth doesn\'t argue with her.', BED), 'DIRECT-ECHO-LATER: only the first two sentences count');
  assert.ok(!echoes('Halsey stands by the window. The lamp hums. Seth doesn\'t argue.', BED), 'DIRECT-ECHO-THIRD: the third sentence is past the opening');
  assert.ok(!echoes('She watches him take the card and go to the door.', BED), 'DIRECT-ECHO-FIRST: a run from a later synopsis sentence is not the opening echo');
  assert.ok(!echoes('', BED), 'DIRECT-ECHO-EMPTY: an empty take echoes nothing');
  console.log('  ok  direct-echo: the detector finds a take opening on the synopsis\'s own words');
  process.exit(0);
}

const MODEL = 'Ornith-1.0-RPNTH-35B';
const OUT = process.env.BENCH_OUT ?? '/tmp/anansi-direct-echo';
const SOURCE = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
const POINT = { chapter: 10, after: 200,
  synopsis: 'Seth doesn\'t argue. He puts the keycard on the nightstand where she can reach it and sits on the edge of the bed, leaving the door unlocked so the choice is hers. Halsey has to decide whether to take the card and go.',
  // The synopsis's events, so a take that echoes less by doing less is seen.
  events: [/\b(key)?card\b[^.!?]*\bnightstand\b|\bnightstand\b[^.!?]*\b(key)?card\b/i, /\b(sits?|sat|sitting)\b|\bedge of the (bed|mattress)\b/i,
    /\bunlocked\b|\bdoor\b[^.!?]*\b(open|lock)/i, /\b(decid\w*|choice|choose|take the card|takes the card)\b/i] };
const WAS = 'Rewrite it as one full beat of the story: prose, in the voice of the scene, played out in the moment rather than summarised.';
const NOW = 'Write the next beat of the story, taking the synopsis as its direction: prose, in the voice of the scene, played out in the moment rather than summarised.';
const ARMS = [{ key: 'A', port: 5301, to: WAS }, { key: 'B', port: 5302, to: NOW }];

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
    const saved = d.prepare("SELECT text FROM prompt_overrides WHERE owner_id = ? AND key = 'direct'").get(st.owner_id) as any;
    if (!saved?.text?.includes(WAS)) { console.error(`arm ${arm.key}: Seth's saved Direct wording no longer has the line this bench changes`); process.exit(1); }
    d.prepare("UPDATE prompt_overrides SET text = ? WHERE owner_id = ? AND key = 'direct'").run(saved.text.replace(WAS, arm.to), st.owner_id);
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
    const body = { storyId: st.id, mode: 'direct', directive: POINT.synopsis };
    const prompt = String((await j('/api/manifest', body)).prompt ?? '');
    if (!prompt.includes(arm.to) || !prompt.includes(POINT.synopsis)) { console.error(`arm ${arm.key}: the arm's line or the synopsis is not in the prompt`); kid.kill(); process.exit(1); }
    // ONE AT A TIME PER ARM: two on the router, so the other slots stay free for the live library.
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
    const echo = got.filter((r) => echoes(r.prose, POINT.synopsis)).length;
    const long = got.filter((r) => longestRun(r.prose, POINT.synopsis) >= 8).length;
    const all = got.filter((r) => POINT.events.every((e) => e.test(r.prose))).length;
    return { arm: arm.key, n: got.length, errors: rows.filter((r) => r.arm === arm.key && !r.prose).length, echo, long, all };
  });
  for (const t of tally) console.log(`  arm ${t.arm}: opens on the synopsis ${t.echo} of ${t.n} (${t.errors} errors); copies 8+ words of it ${t.long}; has all ${POINT.events.length} of its events ${t.all}`);
  const [a, b] = tally;
  console.log(`  Fisher two-tailed p, opens on the synopsis = ${fisher(a.echo, a.n - a.echo, b.echo, b.n - b.echo).toFixed(4)}; all events = ${fisher(a.all, a.n - a.all, b.all, b.n - b.all).toFixed(4)}`);
  process.exit(0);
}

if (mode !== 'imported') { console.error('usage: bench/direct-echo.ts check | run [n] | report'); process.exit(2); }
