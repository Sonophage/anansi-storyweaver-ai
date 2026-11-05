// #142 · THE CARD CONTRACT, MEASURED BY READING. Three arms on one model at the same time, each a
// scratch server on its own copy of the library, differing only in their prompts:
//
//   A  main's prompts, as they were before the contract
//   B  the contract as first written (CARD_CONTRACT at 2339124, with the two rules below; F71 deleted them,
//      so today's contract is what C was)
//   C  the contract without its two rules new to most doors (a person's want and what is in its way;
//      what is still open about a plot thread), the control for those two
//
// Each arm runs the hem's new-threads pass (`/api/extract`) and people pass (`/api/remember`) on the same
// closed scenes, and Invent on the same tales. The cards come out as one sheet, each scene's arms under
// shuffled letters, for the writer to read blind; the key is a separate file.
//
//   node --experimental-strip-types bench/cards-ab.ts run <A-checkout> <B-checkout> <C-checkout>
//
// NEVER THE LIVE LIBRARY: the source is opened read-only and copied with VACUUM INTO; the passes write
// to the copies. In the copies only, the bench's tales are handed to the desk writer (the scratch
// servers run as `sonophage`) and pinned to the bench model, and their old proposals are cleared so a
// card is never refused as already proposed. No Featherless: the key file is pointed at nothing.
//
// Nothing sets a seed. Only the arms of ONE run are comparable (the F55 rule); a re-run is a new run.
import { DatabaseSync } from 'node:sqlite';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const MODEL = process.env.BENCH_MODEL ?? 'Ornith-1.0-RPNTH-35B';
const SOURCE = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
const OUT = process.env.BENCH_OUT ?? '/tmp/anansi-cards-ab';
const PORTS = { A: 5301, B: 5302, C: 5303 } as const;
type Arm = keyof typeof PORTS;
const ARMS = Object.keys(PORTS) as Arm[];

// The scenes: closed scenes with prose, across four tales, so one tale's habits are not the result.
// By tale title and scene number; the last closed scenes where a number is not given.
const SCENES: { tale: string; idx?: number[]; last?: number }[] = [
  { tale: 'ENCORE', idx: [2, 5, 7, 9] },
  { tale: 'The Lands Between', last: 2 },
  { tale: 'The Shadow Lands', last: 1 },
  { tale: 'EXPORT', last: 1 },
];
// Invent, a whole card, one per tale and kind.
const INVENTS: { tale: string; kind: string }[] = [
  { tale: 'ENCORE', kind: 'character' }, { tale: 'The Lands Between', kind: 'place' },
  { tale: 'The Shadow Lands', kind: 'character' },
];

const [, , mode, ...dirs] = process.argv;

// ---- THE SHEET, from a run's results.json: each scene's three arms under letters shuffled per scene,
// and the key in its own file. `sheet` takes no model and no server.
//   node --experimental-strip-types bench/cards-ab.ts sheet
if (mode === 'sheet') {
  const { readFileSync } = await import('node:fs');
  const res = JSON.parse(readFileSync(join(OUT, 'results.json'), 'utf8'));
  const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
  const groups: { name: string; key: (c: any) => boolean }[] = [
    ...res.scenes.map((s: any) => ({ name: `${s.tale}, scene ${s.idx}`, key: (c: any) => c.chapter_id === s.chapterId })),
    { name: 'Invent: a whole new card, one per tale', key: (c: any) => !res.scenes.some((s: any) => s.chapterId === c.chapter_id) },
  ];
  let seed = 142; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const key: Record<string, Record<string, string>> = {};
  const card = (c: any) => {
    const rooms = (() => { try { return Object.entries(JSON.parse(c.rooms || '{}')); } catch { return []; } })() as [string, any][];
    const what = c.entry_type === 'state' ? 'where it stands' : c.kind === 'new' ? `new ${c.entry_type}` : c.field ? `pocket: ${c.field}` : c.kind;
    return `<div class="card"><div class="t">${esc(c.title)} <span>${esc(what)}</span></div><p>${esc(c.body)}</p>${
      rooms.map(([k, r]) => `<p class="room"><b>${esc(k)}</b> ${esc(r?.body ?? r)}</p>`).join('')}</div>`;
  };
  const sections = groups.map((g, gi) => {
    const order = [...ARMS].sort(() => rnd() - 0.5), letters = ['X', 'Y', 'Z'];
    key[g.name] = Object.fromEntries(order.map((arm, i) => [letters[i], arm]));
    const cols = order.map((arm, i) => {
      const cs = res.cards[arm].filter(g.key);
      return `<div class="col"><h3>${letters[i]} <small>${cs.length} card${cs.length === 1 ? '' : 's'}</small></h3>${cs.map(card).join('') || '<p class="none">nothing chalked</p>'}</div>`;
    }).join('');
    const pick = ['X', 'Y', 'Z', 'same'].map((l) => `<label for="g${gi}${l}"><input type="radio" id="g${gi}${l}" name="g${gi}" value="${l}">${l === 'same' ? 'no difference' : l}</label>`).join('');
    return `<section><h2>${esc(g.name)}</h2><div class="pick">Best: ${pick}</div><div class="cols">${cols}</div></section>`;
  }).join('');
  writeFileSync(join(OUT, 'key.json'), JSON.stringify(key, null, 2));
  // Written as a page body (no doctype or html tags), so the same file opens locally and publishes as a
  // private page to read on a phone. Picks are remembered in this browser only; Copy hands them back.
  writeFileSync(join(OUT, 'sheet.html'), `<title>Card bench read</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* One reading column of cards per arm, side by side on a desk, stacked on a phone. */
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
.t{font:600 15px var(--sans)}.card p{margin:6px 0}.room{font-size:15px}.room b{color:var(--dim);font:400 13px var(--sans)}
.none{color:var(--dim)}
button{font:600 16px var(--sans);padding:10px 16px;margin:24px 0 10px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--bg)}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
pre{white-space:pre-wrap;background:var(--card);padding:10px;border:1px solid var(--line);font:14px/1.5 var(--sans);min-height:2em}
</style>
<h1>Which column would you keep?</h1>
<p class="lede">Each section is one scene, hemmed three times on the same model with three different sets of instructions. The letters are shuffled in every section. Pick the column whose cards you would rather have in your tale, or "no difference". Then press Copy my picks and paste them to Mina.</p>
${sections}
<button id="copy" type="button">Copy my picks</button>
<pre id="out" aria-live="polite"></pre>
<script>
const KEY = 'cards-ab-picks';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saved = read();
for (const el of document.querySelectorAll('input[type=radio]')) {
  if (saved[el.name] === el.value) el.checked = true;
  el.addEventListener('change', () => { const s = read(); s[el.name] = el.value; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} });
}
document.getElementById('copy').addEventListener('click', () => {
  const text = [...document.querySelectorAll('section')].map((s) => s.querySelector('h2').textContent + ': '
    + (s.querySelector('input:checked')?.value ?? '-')).join('\\n');
  const out = document.getElementById('out'); out.textContent = text;
  const pick = () => { const r = document.createRange(); r.selectNodeContents(out); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
  (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => { document.getElementById('copy').textContent = 'Copied'; }, pick);
});
</script>`);
  console.log(`  ${join(OUT, 'sheet.html')}\n  key in ${join(OUT, 'key.json')} (not for the reader)`);
  process.exit(0);
}

if (mode !== 'run' || dirs.length !== 3) {
  console.error('usage: node --experimental-strip-types bench/cards-ab.ts run <A-checkout> <B-checkout> <C-checkout>');
  process.exit(2);
}
const checkout: Record<Arm, string> = { A: dirs[0], B: dirs[1], C: dirs[2] };

// ---- the copies
mkdirSync(OUT, { recursive: true });
const src = new DatabaseSync(SOURCE, { readOnly: true });
const seth = (src.prepare("SELECT id FROM users WHERE login = 'sonophage'").get() as any).id;
const taleId = (t: string) => (src.prepare('SELECT id FROM stories WHERE title = ?').get(t) as any)?.id as string;
const scenes: { tale: string; storyId: string; chapterId: string; idx: number }[] = [];
for (const s of SCENES) {
  const id = taleId(s.tale);
  if (!id) throw new Error(`no tale called ${s.tale}`);
  const closed = src.prepare(`SELECT c.id, c.idx FROM chapters c WHERE c.story_id = ? AND c.status = 'closed'
    AND EXISTS (SELECT 1 FROM passages p WHERE p.chapter_id = c.id AND p.is_break = 0) ORDER BY c.idx`).all(id) as any[];
  const pick = s.idx ? closed.filter((c) => s.idx!.includes(c.idx)) : closed.slice(-(s.last ?? 1));
  for (const c of pick) scenes.push({ tale: s.tale, storyId: id, chapterId: c.id, idx: c.idx });
}
const tales = [...new Set([...scenes.map((s) => s.storyId), ...INVENTS.map((i) => taleId(i.tale))])];
for (const arm of ARMS) {
  const f = join(OUT, `${arm}.db`);
  for (const x of ['', '-wal', '-shm']) rmSync(f + x, { force: true });
  src.exec(`VACUUM INTO '${f}'`);
  const d = new DatabaseSync(f);
  const marks = tales.map(() => '?').join(',');
  d.prepare(`UPDATE stories SET owner_id = ?, model = ? WHERE id IN (${marks})`).run(seth, MODEL, ...tales);
  d.prepare(`DELETE FROM proposals WHERE story_id IN (${marks})`).run(...tales);
  d.close();
}
console.log(`  ${scenes.length} scenes in ${new Set(scenes.map((s) => s.tale)).size} tales, ${INVENTS.length} invents, three copies in ${OUT}`);

// ---- the servers
const kids: ChildProcess[] = [];
const stop = () => { for (const k of kids) k.kill(); };
process.on('exit', stop);
for (const arm of ARMS) {
  const k = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], {
    cwd: checkout[arm], stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, ANANSI_PORT: String(PORTS[arm]), ANANSI_DB: join(OUT, `${arm}.db`), ANANSI_MODEL: MODEL,
      ANANSI_FEATHERLESS_KEY_FILE: '/nonexistent/featherless.key', ANANSI_ALLOW: '' },
  });
  k.stderr!.on('data', (b) => writeFileSync(join(OUT, `${arm}.serve.log`), b, { flag: 'a' }));
  kids.push(k);
}
const url = (arm: Arm, path: string) => `http://127.0.0.1:${PORTS[arm]}${path}`;
for (const arm of ARMS) {
  let up = false;
  for (let i = 0; i < 90 && !up; i++) { up = await fetch(url(arm, '/')).then((r) => r.ok, () => false); if (!up) await new Promise((r) => setTimeout(r, 1000)); }
  if (!up) { console.error(`arm ${arm} never came up; see ${OUT}/${arm}.serve.log`); process.exit(1); }
}
const post = (arm: Arm, path: string, body: any) => fetch(url(arm, path), { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json() as any, (e) => ({ error: String(e) }));

// THE TREATMENT IS VERIFIED BEFORE ANYTHING IS GENERATED: every arm's tales are pinned to the bench model.
for (const arm of ARMS) for (const id of tales) {
  const v: any = await fetch(url(arm, `/api/story?story=${id}`)).then((r) => r.json());
  if (v.story?.model !== MODEL) { console.error(`arm ${arm}: tale ${id} is on ${v.story?.model ?? v.error}, not ${MODEL}`); process.exit(1); }
}
console.log(`  every arm is up, and every tale is on ${MODEL}`);

// ---- the passes, the three arms at once for each scene
const t0 = Date.now();
const errors: string[] = [];
for (const s of scenes) {
  await Promise.all(ARMS.map(async (arm) => {
    for (const path of ['/api/extract', '/api/remember']) {
      const r = await post(arm, path, { storyId: s.storyId, chapterId: s.chapterId });
      if (r?.error) errors.push(`${arm} ${s.tale} sc${s.idx} ${path}: ${r.error}`);
    }
  }));
  console.log(`  ${s.tale} scene ${s.idx} done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const invented: Record<Arm, any[]> = { A: [], B: [], C: [] };
for (const i of INVENTS) {
  await Promise.all(ARMS.map(async (arm) => {
    const r = await post(arm, '/api/invent', { storyId: taleId(i.tale), kind: i.kind });
    if (r?.error) errors.push(`${arm} invent ${i.tale} ${i.kind}: ${r.error}`);
    invented[arm].push({ tale: i.tale, kind: i.kind, title: r?.entry?.title ?? r?.title ?? '', body: r?.entry?.body ?? r?.body ?? '',
      rooms: r?.entry?.rooms ?? r?.rooms ?? null, raw: r?.error ? null : r });
  }));
  console.log(`  invent ${i.tale} ${i.kind} done`);
}
stop();

// ---- what each arm wrote, and on which model
const cards: Record<Arm, any[]> = { A: [], B: [], C: [] };
const models: Record<Arm, Record<string, number>> = { A: {}, B: {}, C: {} };
for (const arm of ARMS) {
  const d = new DatabaseSync(join(OUT, `${arm}.db`), { readOnly: true });
  const marks = tales.map(() => '?').join(',');
  cards[arm] = d.prepare(`SELECT p.chapter_id, p.title, p.kind, p.field, p.entry_type, p.body, p.rooms, p.keys
    FROM proposals p WHERE p.story_id IN (${marks}) ORDER BY p.created_at, p.rowid`).all(...tales) as any[];
  for (const g of d.prepare(`SELECT model, COUNT(*) n FROM generations WHERE created_at >= ? GROUP BY model`).all(t0) as any[])
    models[arm][g.model] = g.n;
  d.close();
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ model: MODEL, scenes, cards, invented, models, errors,
  seconds: Math.round((Date.now() - t0) / 1000) }, null, 2));
console.log(`\n  cards per arm: ${ARMS.map((a) => `${a} ${cards[a].length}`).join(', ')}`);
console.log(`  models logged per arm: ${ARMS.map((a) => `${a} ${JSON.stringify(models[a])}`).join(' | ')}`);
console.log(`  errors: ${errors.length}${errors.length ? '\n    ' + errors.join('\n    ') : ''}`);
console.log(`  ${OUT}/results.json`);
process.exit(0);
