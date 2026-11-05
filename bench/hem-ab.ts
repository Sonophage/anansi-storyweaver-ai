// #143 · THREE ARMS OF THE WHOLE HEM, READ BLIND. Seth's read of five Ornith hems (2026-11-05) marked four
// cards a prompt would have to fix: where it stands named "the unspoken ultimatum" and never said what it
// was (twice), the tale's where it stands spent itself on the room and the view, and a relationships
// pocket said "they tease him back" without saying who. Each arm is a checkout differing only in its
// prompts; the three hem the same scene of the same tale at the same time, on one model:
//
//   A  the prompts as they are
//   B  the rules where each card is written: STANDS_FORM says what was asked, POCKET_FORM's relationships
//      names the other person, TALE_STANDS keeps to the people
//   C  the first two as lines of CARD_CONTRACT instead, and the same TALE_STANDS line as B
//
// Each hem is the hem screen's own two presses, as bench/hem-five.ts makes them. The sheet shows only the
// cards those rules are about (every where it stands, every relationships pocket), each tale's three arms
// under letters shuffled per tale; the key is a separate file.
//
//   node --experimental-strip-types bench/hem-ab.ts run <A-checkout> <B-checkout> <C-checkout>
//   node --experimental-strip-types bench/hem-ab.ts sheet
//
// NEVER THE LIVE LIBRARY: the source is opened read-only and copied once per arm with VACUUM INTO. In the
// copies only, the tales are handed to the desk writer, pinned to the bench model, and their proposals
// cleared. No Featherless. Nothing sets a seed: only the arms of one run compare (the F55 rule).
import { DatabaseSync } from 'node:sqlite';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const MODEL = process.env.BENCH_MODEL ?? 'Ornith-1.0-RPNTH-35B';
const SOURCE = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
const OUT = process.env.BENCH_OUT ?? '/tmp/anansi-hem-ab';
const PORTS = { A: 5301, B: 5302, C: 5303 } as const;
type Arm = keyof typeof PORTS;
const ARMS = Object.keys(PORTS) as Arm[];
const TALES = (process.env.BENCH_TALES ?? "ENCORE|The Shadow’s Debt|The Tin Orchard|The Lands Between|The Shadow Lands").split('|');

/** The cards these arms are about: where a thread or the tale stands, and a relationships pocket, on its
 *  own or inside a new card. Everything else is the same rules in all three arms. */
export function aboutCards(c: any): { title: string; what: string; body: string }[] {
  const out: { title: string; what: string; body: string }[] = [];
  if (c.entry_type === 'state') out.push({ title: c.title, what: 'where it stands', body: c.body });
  if (c.field === 'relationships' && c.entry_type !== 'state') out.push({ title: c.title, what: 'relationships', body: c.body });
  let rooms: any = null; try { rooms = JSON.parse(c.rooms || 'null'); } catch {}
  if (c.kind === 'new' && rooms) {
    if (rooms.relationships?.body) out.push({ title: c.title, what: 'relationships (new card)', body: rooms.relationships.body });
    if (rooms.stands?.body) out.push({ title: c.title, what: 'where it stands (new card)', body: rooms.stands.body });
  }
  return out;
}

const [, , mode, ...dirs] = process.argv;

// ---- check: the card filter, no model and no server.
if (mode === 'check') {
  const assert = (await import('node:assert')).default;
  assert.deepStrictEqual(aboutCards({ entry_type: 'state', title: 'Halsey', body: 'b' }).map((x) => x.what), ['where it stands'], 'HEM-AB-STATE');
  assert.deepStrictEqual(aboutCards({ kind: 'changed', field: 'relationships', title: 'Seth', body: 'b' }).map((x) => x.what), ['relationships'], 'HEM-AB-REL');
  assert.deepStrictEqual(aboutCards({ kind: 'new', field: 'facts', title: 'N', body: 'b',
    rooms: JSON.stringify({ relationships: { body: 'r' }, stands: { body: 's' }, voice: { body: 'v' } }) }).map((x) => x.what),
    ['relationships (new card)', 'where it stands (new card)'], 'HEM-AB-NEW');
  assert.deepStrictEqual(aboutCards({ kind: 'changed', field: 'voice', title: 'Seth', body: 'b' }), [], 'HEM-AB-OTHER: a voice pocket is not read');
  console.log('  ok  hem-ab: the sheet reads where it stands and relationships, nothing else');
  process.exit(0);
}

// ---- THE SHEET, from a run: per tale, the three arms under shuffled letters, and a note box.
if (mode === 'sheet') {
  const res = JSON.parse(readFileSync(join(OUT, 'results.json'), 'utf8'));
  const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
  let seed = 143; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const key: Record<string, Record<string, string>> = {};
  const sections = TALES.map((tale, gi) => {
    const order = [...ARMS].sort(() => rnd() - 0.5), letters = ['X', 'Y', 'Z'];
    key[tale] = Object.fromEntries(order.map((arm, i) => [letters[i], arm]));
    const cols = order.map((arm, i) => {
      const cs = (res.cards[arm][tale] ?? []) as any[];
      return `<div class="col"><h3>${letters[i]} <small>${cs.length} card${cs.length === 1 ? '' : 's'}</small></h3>${
        cs.map((c) => `<div class="card"><div class="t">${esc(c.title)} <span>${esc(c.what)}</span></div><p>${esc(c.body)}</p></div>`).join('')
        || '<p class="none">nothing chalked</p>'}</div>`;
    }).join('');
    const pick = ['X', 'Y', 'Z', 'same'].map((l) => `<label for="g${gi}${l}"><input type="radio" id="g${gi}${l}" name="g${gi}" value="${l}">${l === 'same' ? 'no difference' : l}</label>`).join('');
    return `<section><h2>${esc(tale)}</h2><div class="pick">Best: ${pick}</div><div class="cols">${cols}</div>
<label class="note" for="n${gi}">Note (optional)</label><textarea id="n${gi}" name="n${gi}" rows="2"></textarea></section>`;
  }).join('');
  writeFileSync(join(OUT, 'key.json'), JSON.stringify(key, null, 2));
  writeFileSync(join(OUT, 'sheet.html'), `<title>Hem prompt read</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--bg:#f3f1ec;--fg:#23212a;--dim:#6b6676;--card:#fffdf9;--line:#d9d4ca;--accent:#7a4e1f;
  --serif:Georgia,'Iowan Old Style',serif;--sans:system-ui,-apple-system,'Segoe UI',sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17161c;--fg:#e9e5dd;--dim:#9c96a6;--card:#222029;--line:#3a3743;--accent:#d9a46a;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#17161c;--fg:#e9e5dd;--dim:#9c96a6;--card:#222029;--line:#3a3743;--accent:#d9a46a;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:16px/1.55 var(--serif);
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:12px 40px;max-width:1500px}
h1{font:600 21px/1.25 var(--sans);text-wrap:balance;margin:8px 0}
.lede{max-width:65ch;color:var(--dim)}
section{border-top:1px solid var(--line);margin-top:26px;padding-top:14px}
h2{font:600 17px/1.3 var(--sans);margin:0 0 8px}
.pick{display:flex;flex-wrap:wrap;gap:6px 16px;font:15px var(--sans);margin-bottom:10px}
.pick label{display:flex;align-items:center;gap:6px;min-height:40px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px}
.col{min-width:0}.col h3{font:600 16px var(--sans);margin:4px 0;color:var(--accent)}
.col h3 small,.t span{color:var(--dim);font-weight:400;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:8px 0;overflow-wrap:anywhere}
.t{font:600 15px var(--sans)}.card p{margin:6px 0}
.none{color:var(--dim)}
.note{display:block;font:14px var(--sans);color:var(--dim);margin-top:10px}
textarea{width:100%;box-sizing:border-box;font:16px var(--sans);background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:8px}
button{font:600 16px var(--sans);padding:10px 16px;margin:24px 0 10px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--bg)}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
pre{white-space:pre-wrap;background:var(--card);padding:10px;border:1px solid var(--line);font:14px/1.5 var(--sans);min-height:2em}
</style>
<h1>Which column says it best?</h1>
<p class="lede">Each section is one scene, hemmed three times on the same model with three different sets of instructions. Only two kinds of card are shown: where someone (or the tale) stands, and relationships. Look for three things: does it say what was asked or decided, not just a name for it; does a relationship say who does what to whom; is the tale's card about the story, not the room. The letters are shuffled in every section. Pick a column or "no difference", add a note if you like, then press Copy my read and paste it to Mina.</p>
${sections}
<button id="copy" type="button">Copy my read</button>
<pre id="out" aria-live="polite"></pre>
<script>
const KEY = 'hem-ab-read';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saved = read();
for (const el of document.querySelectorAll('input[type=radio], textarea')) {
  if (el.type === 'radio') { if (saved[el.name] === el.value) el.checked = true; }
  else if (saved[el.name]) el.value = saved[el.name];
  el.addEventListener(el.type === 'radio' ? 'change' : 'input', () => { const s = read(); s[el.name] = el.value; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} });
}
document.getElementById('copy').addEventListener('click', () => {
  const text = [...document.querySelectorAll('section')].map((s) => {
    const note = s.querySelector('textarea').value.trim();
    return s.querySelector('h2').textContent + ': ' + (s.querySelector('input:checked')?.value ?? '-') + (note ? ' (' + note + ')' : '');
  }).join('\\n');
  const out = document.getElementById('out'); out.textContent = text;
  const pick = () => { const r = document.createRange(); r.selectNodeContents(out); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
  (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => { document.getElementById('copy').textContent = 'Copied'; }, pick);
});
</script>`);
  console.log(`  ${join(OUT, 'sheet.html')}\n  key in ${join(OUT, 'key.json')} (not for the reader)`);
  process.exit(0);
}

if (mode !== 'run' || dirs.length !== 3) {
  console.error('usage: node --experimental-strip-types bench/hem-ab.ts run <A-checkout> <B-checkout> <C-checkout> | sheet | check');
  process.exit(2);
}
const checkout: Record<Arm, string> = { A: dirs[0], B: dirs[1], C: dirs[2] };

// ---- the copies, one per arm
mkdirSync(OUT, { recursive: true });
const src = new DatabaseSync(SOURCE, { readOnly: true });
const file: Record<Arm, string> = {} as any;
let ids: string[] = [];
for (const arm of ARMS) {
  file[arm] = join(OUT, `bench-${arm}.db`);
  for (const x of ['', '-wal', '-shm']) rmSync(file[arm] + x, { force: true });
  src.exec(`VACUUM INTO '${file[arm]}'`);
  const d = new DatabaseSync(file[arm]);
  const seth = (d.prepare("SELECT id FROM users WHERE login = 'sonophage'").get() as any).id;
  ids = TALES.map((t) => { const s = d.prepare('SELECT id FROM stories WHERE title = ?').get(t) as any; if (!s) throw new Error(`no tale ${t}`); return s.id as string; });
  const marks = ids.map(() => '?').join(',');
  d.prepare(`UPDATE stories SET owner_id = ?, model = ? WHERE id IN (${marks})`).run(seth, MODEL, ...ids);
  d.prepare(`DELETE FROM proposals WHERE story_id IN (${marks})`).run(...ids);
  d.close();
}
src.close();

// ---- the servers
const kids: ChildProcess[] = [];
process.on('exit', () => kids.forEach((k) => k.kill()));
for (const arm of ARMS) {
  const kid = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], { cwd: checkout[arm], stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, ANANSI_PORT: String(PORTS[arm]), ANANSI_DB: file[arm], ANANSI_MODEL: MODEL,
      ANANSI_FEATHERLESS_KEY_FILE: '/nonexistent/featherless.key', ANANSI_ALLOW: '' } });
  kid.stderr!.on('data', (b) => writeFileSync(join(OUT, `serve-${arm}.log`), b, { flag: 'a' }));
  kids.push(kid);
}
const url = (arm: Arm, p: string) => `http://127.0.0.1:${PORTS[arm]}${p}`;
const get = (arm: Arm, p: string) => fetch(url(arm, p)).then((r) => r.json() as any);
const post = (arm: Arm, p: string, body: any) => fetch(url(arm, p), { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body) }).then((r) => r.json() as any, (e) => ({ error: String(e) }));
for (const arm of ARMS) {
  let up = false;
  for (let i = 0; i < 90 && !up; i++) { up = await fetch(url(arm, '/')).then((r) => r.ok, () => false); if (!up) await new Promise((r) => setTimeout(r, 1000)); }
  if (!up) { console.error(`arm ${arm} never came up; see ${OUT}/serve-${arm}.log`); process.exit(1); }
  for (const id of ids) { const v = await get(arm, `/api/story?story=${id}`); if (v.story?.model !== MODEL) { console.error(`${arm} ${id} is on ${v.story?.model ?? v.error}`); process.exit(1); } }
}
// EACH ARM'S OWN PROMPTS, CONFIRMED BEFORE A CALL: the checkout's prompts.ts is what its server loaded.
const prompts: Record<Arm, string> = {} as any;
for (const arm of ARMS) prompts[arm] = readFileSync(join(checkout[arm], 'src/prompts.ts'), 'utf8');
if (prompts.A === prompts.B || prompts.A === prompts.C || prompts.B === prompts.C) { console.error('two arms have the same prompts'); process.exit(1); }
console.log(`  three servers up, each on its own copy; ${ids.length} tales pinned to ${MODEL}`);

const settled = async (arm: Arm, storyId: string, chapterId: string, ms = 25 * 60_000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const db = new DatabaseSync(file[arm], { readOnly: true });
    const h = db.prepare('SELECT finished_at, held FROM hems WHERE story_id = ? AND chapter_id = ?').get(storyId, chapterId) as any; db.close();
    if (h?.finished_at && !h.held) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
};
const hem = async (arm: Arm, id: string) => {
  const v0 = await get(arm, `/api/story?story=${id}`);
  const closing = v0.currentChapter?.id, idx = v0.currentChapter?.index, started = Date.now();
  const end = await post(arm, '/api/chapter/end', { storyId: id, next: false, ask: true });
  let error = end.error ?? null;
  if (!error) { await new Promise((r) => setTimeout(r, 2000));
    const ans = await post(arm, '/api/chapter/hem', { storyId: id, chapterId: closing, pass: 'next', asked: true }); error = ans.error ?? null; }
  const done = !error && await settled(arm, id, closing);
  const db = new DatabaseSync(file[arm], { readOnly: true });
  const h = db.prepare('SELECT passes FROM hems WHERE story_id = ? AND chapter_id = ?').get(id, closing) as any;
  const fails = Object.entries(JSON.parse(h?.passes || '{}')).filter(([, v]) => v !== null).length;
  const errs = (db.prepare('SELECT COUNT(*) n FROM generations WHERE story_id = ? AND created_at >= ? AND error IS NOT NULL').get(id, started) as any).n;
  const models = db.prepare('SELECT DISTINCT model FROM generations WHERE story_id = ? AND created_at >= ?').all(id, started).map((m: any) => m.model);
  const all = db.prepare("SELECT title, kind, field, entry_type, body, rooms FROM proposals WHERE story_id = ? AND status = 'open' ORDER BY created_at, rowid").all(id) as any[];
  db.close();
  return { scene: idx, done, error, fails, errs, models, cards: all.flatMap(aboutCards), seconds: Math.round((Date.now() - started) / 1000) };
};

const t0 = Date.now();
const cards: Record<Arm, Record<string, any[]>> = { A: {}, B: {}, C: {} };
const runs: any[] = [];
for (const [i, id] of ids.entries()) {
  // THE THREE AT ONCE, so the arms meet the same router at the same moment (the F55 rule).
  const got = await Promise.all(ARMS.map((arm) => hem(arm, id)));
  ARMS.forEach((arm, j) => { cards[arm][TALES[i]] = got[j].cards; runs.push({ arm, tale: TALES[i], ...got[j], cards: got[j].cards.length }); });
  console.log(`  ${TALES[i]} scene ${got[0].scene}: ` + ARMS.map((arm, j) => { const g = got[j];
    return `${arm} ${g.done ? 'done' : 'NOT DONE'}${g.error ? ` (${g.error})` : ''} ${g.cards.length} cards, ${g.fails} not run, ${g.errs} errors, ${g.models.join('+')}, ${g.seconds}s`; }).join(' · '));
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ model: MODEL, runs, cards, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2));
const bad = runs.filter((r) => !r.done || r.error || r.fails || r.errs || r.models.some((m: string) => m !== MODEL));
console.log(`\n  ${runs.length - bad.length} of ${runs.length} hems clean (finished, every pass run, no call error, only ${MODEL}).`);
console.log('  Next: node --experimental-strip-types bench/hem-ab.ts sheet');
process.exit(0);
