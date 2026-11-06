// #149 · A FIRST READ OF ACT AND NARRATE, AGAINST DIRECT. Their prompts changed (Seth's own wording,
// 2026-11-03) and they have hardly been used since. Two points in ENCORE, one intent each, written three
// ways and approved by Seth (2026-11-05): an action for Act, the opening of a passage for Narrate, a
// synopsis for Direct. Ten takes of each on Ornith. Seth reads them blind: one sheet per scene, the takes
// shuffled, the mode hidden; the key is a separate file.
//
//   node --experimental-strip-types bench/modes-read.ts run [takes, default 10] [bed|diner]
//   node --experimental-strip-types bench/modes-read.ts sheet
//   node --experimental-strip-types bench/modes-read.ts check     # the shuffle and the key, no model
//
// NEVER THE LIVE LIBRARY: each scene-and-mode pair gets its own copy (VACUUM INTO), because Act and
// Narrate write the writer's line into the tale before asking, and those lines must not meet. The scene 4
// copy is cut back to that point: later scenes and passages deleted, so scene 4 is the current one.
// ponytail: threads made after scene 4 stay in its copy. Ceiling: a later character can reach the scene 4
// prompt by keyword. Trigger: a take naming someone the tale had not met by scene 4.
// The calls do not stream, so the route saves nothing and each take answers the same point fresh.
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODEL = 'Ornith-1.0-RPNTH-35B';
const OUT = process.env.BENCH_OUT ?? '/tmp/anansi-modes-read';
const SOURCE = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
const PORT = 5301;

export const SCENES = [
  { key: 'bed', title: 'Scene 10, The Single Bed', chapter: 10, after: 200,
    move: 'Seth does not argue: he gives her the exit and lets her choose.',
    act: 'Seth sets the keycard on the nightstand, sits on the edge of the bed, and leaves the door unlocked behind her.',
    narrate: 'Seth doesn\'t answer. He sets the keycard on the nightstand, within her reach, and sits on the edge of the narrow bed. The door behind her stays unlocked.',
    direct: 'Seth doesn\'t argue. He puts the keycard on the nightstand where she can reach it and sits on the edge of the bed, leaving the door unlocked so the choice is hers. Halsey has to decide whether to take the card and go.' },
  { key: 'diner', title: 'Scene 4, The Diner\'s Truth', chapter: 4, after: 73,
    move: 'Seth lets her slip with her real name pass, and gives her the last of the pie.',
    act: 'Seth slides the last slice of pie across the table to her without a word.',
    narrate: 'Seth doesn\'t make anything of it. He slides the plate with the last slice of pie across the table to her and waits, as if her name were the most ordinary thing in the world.',
    direct: 'Seth lets the slip pass without comment. He slides the last slice of pie across the table to her and waits. Halsey decides what to do with the fact that he now knows her real name.' },
] as const;
export const MODES = ['act', 'narrate', 'direct'] as const;

/** Take ids shuffled for one scene's sheet, by a fixed seed, so the sheet and its key agree on a re-run. */
export function shuffled<T>(xs: T[], seed: number) {
  let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return xs.map((x) => [rnd(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
}

const [, , mode, arg] = process.argv;

if (mode === 'check') {
  const assert = (await import('node:assert')).default;
  const a = shuffled([1, 2, 3, 4, 5, 6, 7, 8], 149), b = shuffled([1, 2, 3, 4, 5, 6, 7, 8], 149);
  assert.deepStrictEqual(a, b, 'MODES-READ-SEED: the same seed shuffles the same way');
  assert.deepStrictEqual([...a].sort(), [1, 2, 3, 4, 5, 6, 7, 8], 'MODES-READ-ALL: nothing is lost or doubled');
  assert.notDeepStrictEqual(a, [1, 2, 3, 4, 5, 6, 7, 8], 'MODES-READ-SHUFFLED: the order is changed');
  console.log('  ok  modes-read: the sheet shuffles every take once, the same way each time');
  process.exit(0);
}

if (mode === 'run') {
  const n = Number(arg ?? 10), only = process.argv[4];
  mkdirSync(OUT, { recursive: true });
  // One scene only (`run 10 diner`) keeps the other scene's takes; a whole run starts the file again.
  if (!only) rmSync(join(OUT, 'takes.jsonl'), { force: true });
  for (const sc of SCENES.filter((x) => !only || x.key === only)) for (const m of MODES) {
    const file = join(OUT, `${sc.key}-${m}.db`);
    for (const x of ['', '-wal', '-shm']) rmSync(file + x, { force: true });
    const src = new DatabaseSync(SOURCE, { readOnly: true }); src.exec(`VACUUM INTO '${file}'`); src.close();
    const d = new DatabaseSync(file);
    d.exec('PRAGMA foreign_keys = ON');
    const st = d.prepare("SELECT s.id FROM stories s JOIN users u ON u.id = s.owner_id WHERE s.title = 'ENCORE' AND u.login = 'sonophage'").get() as any;
    d.prepare('UPDATE stories SET model = ? WHERE id = ?').run(MODEL, st.id);
    // THE POINT: later scenes go, and this scene's passages after the cut.
    const ch = d.prepare('SELECT id FROM chapters WHERE story_id = ? AND idx = ?').get(st.id, sc.chapter) as any;
    d.prepare('DELETE FROM passages WHERE story_id = ? AND (chapter_id IN (SELECT id FROM chapters WHERE story_id = ? AND idx > ?) OR (chapter_id = ? AND ordinal > ?))')
      .run(st.id, st.id, sc.chapter, ch.id, sc.after);
    d.prepare('DELETE FROM chapters WHERE story_id = ? AND idx > ?').run(st.id, sc.chapter);
    // AND OPEN AGAIN: a hemmed scene is closed, and the app opens a fresh one after a closed last scene.
    d.prepare("UPDATE chapters SET status = 'open' WHERE id = ?").run(ch.id);
    d.close();
    const kid = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], { cwd: new URL('..', import.meta.url).pathname,
      stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ANANSI_PORT: String(PORT), ANANSI_DB: file, ANANSI_MODEL: MODEL,
        ANANSI_FEATHERLESS_KEY_FILE: '/nonexistent/featherless.key', ANANSI_ALLOW: '' } });
    kid.stderr!.on('data', (b) => appendFileSync(join(OUT, 'serve.log'), b));
    const j = (u: string, b?: unknown, method = 'POST') => fetch(`http://127.0.0.1:${PORT}${u}`, b
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any, (e) => ({ error: String(e) }));
    let up = false;
    for (let i = 0; i < 90 && !up; i++) { up = await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.ok, () => false); if (!up) await new Promise((r) => setTimeout(r, 1000)); }
    if (!up) { console.error(`no server for ${sc.key} ${m}; see ${OUT}/serve.log`); kid.kill(); process.exit(1); }
    const v = await j(`/api/story?story=${st.id}`, undefined, 'GET');
    if (v.story?.model !== MODEL || v.currentChapter?.index !== sc.chapter) { console.error(`${sc.key} ${m}: on ${v.story?.model}, scene ${v.currentChapter?.index}`); kid.kill(); process.exit(1); }
    // THE WRITER'S MOVE: Act and Narrate write it into the tale, as the page does; Direct sends it.
    if (m === 'act') await j('/api/write', { storyId: st.id, body: sc.act, speaker: 'Seth', mode: 'act' });
    if (m === 'narrate') await j('/api/write', { storyId: st.id, body: sc.narrate, mode: 'narrate' });
    const body = { storyId: st.id, mode: m, ...(m === 'act' ? { speaker: 'Seth' } : {}), ...(m === 'direct' ? { directive: sc.direct } : {}) };
    const man = await j('/api/manifest', body);
    const said = m === 'direct' ? sc.direct : m === 'act' ? sc.act : sc.narrate;
    if (!String(man.prompt ?? '').includes(said)) { console.error(`${sc.key} ${m}: the writer's move is not in the prompt`); kid.kill(); process.exit(1); }
    // TWO AT A TIME: nothing is saved, so the takes do not see each other.
    for (let i = 0; i < n; i += 2) {
      await Promise.all([i, i + 1].filter((k) => k < n).map(async (k) => {
        const r = await j('/api/generate', body);
        appendFileSync(join(OUT, 'takes.jsonl'), JSON.stringify({ scene: sc.key, mode: m, i: k, prose: r.prose ?? null, error: r.error ?? null }) + '\n');
      }));
    }
    kid.kill();
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`  ${sc.key} ${m}: ${n} takes`);
  }
  process.exit(0);
}

if (mode === 'sheet') {
  const rows = readFileSync(join(OUT, 'takes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.prose);
  const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
  const para = (t: string) => t.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('');
  const key: Record<string, { mode: string; i: number }> = {};
  const src = new DatabaseSync(SOURCE, { readOnly: true });
  const sections = SCENES.map((sc, si) => {
    const st = src.prepare("SELECT s.id FROM stories s JOIN users u ON u.id = s.owner_id WHERE s.title = 'ENCORE' AND u.login = 'sonophage'").get() as any;
    const ch = src.prepare('SELECT id FROM chapters WHERE story_id = ? AND idx = ?').get(st.id, sc.chapter) as any;
    const before = (src.prepare('SELECT body FROM passages WHERE chapter_id = ? AND selected = 1 AND ordinal <= ? ORDER BY ordinal DESC LIMIT 2').all(ch.id, sc.after) as any[]).reverse();
    const takes = shuffled(rows.filter((r) => r.scene === sc.key), 149 + si);
    const cards = takes.map((r, k) => {
      const id = `${sc.key}-${k + 1}`; key[id] = { mode: r.mode, i: r.i };
      return `<article class="take" id="t-${id}"><h3>Take ${k + 1}</h3><div class="prose">${para(r.prose)}</div>
<div class="pick" role="group" aria-label="Take ${k + 1}"><label for="${id}-ok"><input type="radio" id="${id}-ok" name="${id}" value="fine"> Fine</label>
<label for="${id}-fix"><input type="radio" id="${id}-fix" name="${id}" value="would fix"> Would fix</label></div>
<label class="note" for="${id}-n">What is wrong (optional)</label><textarea id="${id}-n" name="${id}-n" rows="2"></textarea></article>`;
    }).join('');
    return `<section><h2>${esc(sc.title)}</h2><div class="where"><div class="label">Where the scene is</div>${before.map((p) => para(p.body)).join('')}
<div class="label">Seth's move</div><p>${esc(sc.move)}</p></div>${cards}</section>`;
  }).join('');
  writeFileSync(join(OUT, 'key.json'), JSON.stringify(key, null, 2));
  writeFileSync(join(OUT, 'sheet.html'), `<title>Act and Narrate read</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* One reading column: the scene so far, then each take as a page of the book, with two marks and a note. */
:root{--bg:#f4f1ea;--fg:#24211c;--dim:#6d675c;--card:#fffdf8;--line:#ddd6c8;--accent:#8a4b2a;--ok:#2f6b3a;--fix:#9a3a22;
  --serif:'Iowan Old Style',Georgia,serif;--sans:system-ui,-apple-system,'Segoe UI',sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece6da;--dim:#a39b8b;--card:#211e17;--line:#3a352b;--accent:#d9965f;--ok:#7fc08a;--fix:#e08a6e;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece6da;--dim:#a39b8b;--card:#211e17;--line:#3a352b;--accent:#d9965f;--ok:#7fc08a;--fix:#e08a6e;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:17px/1.6 var(--serif);max-width:44rem;margin:0 auto;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:12px 48px}
h1{font:600 22px/1.25 var(--sans);text-wrap:balance;margin:10px 0}
.lede{color:var(--dim);font-size:16px}
section{border-top:2px solid var(--line);margin-top:30px;padding-top:12px}
h2{font:600 18px/1.3 var(--sans);margin:0 0 10px}
.where{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 14px;font-size:15px;color:var(--dim)}
.label{font:600 12px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-top:10px}
.take{border-top:1px solid var(--line);padding-top:8px;margin-top:22px}
.take h3{font:600 15px var(--sans);color:var(--accent);margin:0}
.prose p{margin:8px 0}
.pick{display:flex;gap:18px;font:15px var(--sans);margin:8px 0}
.pick label{display:flex;align-items:center;gap:6px;min-height:44px}
.note{display:block;font:13px var(--sans);color:var(--dim)}
textarea{width:100%;box-sizing:border-box;font:16px var(--sans);background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:8px}
button{font:600 16px var(--sans);padding:12px 18px;margin:28px 0 10px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--bg)}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
pre{white-space:pre-wrap;background:var(--card);padding:10px;border:1px solid var(--line);font:14px/1.5 var(--sans);min-height:2em}
.count{font:14px var(--sans);color:var(--dim)}
</style>
<h1>Act, Narrate and Direct, read blind</h1>
<p class="lede">Two points in ENCORE. At each, Seth makes one move, and Anansi wrote what comes next thirty times, ten in each of three ways. The takes are shuffled and you are not told which way wrote which. Mark each one Fine or Would fix, and say what is wrong where you can. Then press Copy my read and paste it to Mina.</p>
${sections}
<p class="count" id="count" aria-live="polite"></p>
<button id="copy" type="button">Copy my read</button>
<pre id="out" aria-live="polite"></pre>
<script>
const KEY = 'modes-read-149';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saved = read();
const count = () => { const all = document.querySelectorAll('.take').length, done = new Set([...document.querySelectorAll('input:checked')].map((x) => x.name)).size;
  document.getElementById('count').textContent = done + ' of ' + all + ' takes marked'; };
for (const el of document.querySelectorAll('input[type=radio], textarea')) {
  if (el.type === 'radio') { if (saved[el.name] === el.value) el.checked = true; } else if (saved[el.name]) el.value = saved[el.name];
  el.addEventListener(el.type === 'radio' ? 'change' : 'input', () => { const s = read(); s[el.name] = el.value; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} count(); });
}
count();
document.getElementById('copy').addEventListener('click', () => {
  const lines = [...document.querySelectorAll('.take')].map((t) => { const id = t.id.slice(2);
    const v = t.querySelector('input:checked')?.value ?? '-', note = t.querySelector('textarea').value.trim();
    return id + ': ' + v + (note ? ' (' + note + ')' : ''); });
  const text = lines.join('\\n');
  const out = document.getElementById('out'); out.textContent = text;
  const pick = () => { const r = document.createRange(); r.selectNodeContents(out); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
  (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => { document.getElementById('copy').textContent = 'Copied'; }, pick);
});
</script>`);
  console.log(`  ${join(OUT, 'sheet.html')}\n  key in ${join(OUT, 'key.json')} (not for the reader)`);
  process.exit(0);
}

console.error('usage: bench/modes-read.ts run [n] | sheet | check');
process.exit(2);
