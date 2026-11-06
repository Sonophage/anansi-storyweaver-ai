// #167 · DOES TIDY TAKE OUT WHAT BELONGS TO ANOTHER TALE, AND ONLY THAT? Tidy now reads the tale a thread
// is in and names, per part, what it left out as another tale's. This runs the Tidy before it (arm A, a
// checkout of the commit this branch started from) and after it (arm B, this checkout) on Kia's two
// Elden Ring tales, at once, on Ornith:
//   FROM ELSEWHERE: eight threads as The Lands Between has them, copied into The Shadow Lands in place of
//     that tale's own (the app's own thread copy: pockets and first text travel, the timeline does not).
//     The Lands Between has 8 scenes and The Shadow Lands 2, so these carry events the tale has not had.
//   ITS OWN: six of The Shadow Lands' own threads, which should lose nothing.
// Seth's labelled read decides; the report gives the counts behind it.
//
//   node --experimental-strip-types bench/tidy-foreign.ts check          # the sheet's grouping, no model
//   node --experimental-strip-types bench/tidy-foreign.ts run <base-checkout>
//   node --experimental-strip-types bench/tidy-foreign.ts report
//
// NEVER THE LIVE LIBRARY: a copy (bench/scene.ts), where both tales are handed to the desk writer,
// because a scratch server on loopback is always him. Each arm then answers on its own copy of that.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { copyAt, serveAt } from './scene.ts';

const MODEL = 'Ornith-1.0-RPNTH-35B';
const OUT = process.env.BENCH_OUT ?? '/tmp/anansi-tidy-foreign';
const SOURCE = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
export const ELSEWHERE = ['Talia', 'Morgott', 'Melina', 'Ranni', 'Godrick', 'Master Hewg', 'Sir Gideon Ofnir', 'Fia'];
export const OWN = ['Leda', 'Messmer the Impaler', 'Tanith', 'Miquella', 'Malenia', 'Mohg'];
const FROM = 'The Lands Between', INTO = 'The Shadow Lands';

/** The takes in the order the sheet reads them: from elsewhere first, then its own, each thread's A then B. */
export function sheetOrder<T extends { title: string; arm: string }>(rows: T[]) {
  const at = (t: string) => { const i = ELSEWHERE.indexOf(t); return i >= 0 ? i : ELSEWHERE.length + OWN.indexOf(t); };
  return [...rows].sort((a, b) => at(a.title) - at(b.title) || a.arm.localeCompare(b.arm));
}

const [mode, arg] = import.meta.main ? process.argv.slice(2) : ['imported'];

if (mode === 'check') {
  const assert = (await import('node:assert')).default;
  const got = sheetOrder([{ title: 'Leda', arm: 'B' }, { title: 'Talia', arm: 'B' }, { title: 'Leda', arm: 'A' }, { title: 'Talia', arm: 'A' }, { title: 'Morgott', arm: 'A' }])
    .map((r) => `${r.title}-${r.arm}`);
  assert.deepStrictEqual(got, ['Talia-A', 'Talia-B', 'Morgott-A', 'Leda-A', 'Leda-B'], 'TIDY-FOREIGN-ORDER: from elsewhere first, then its own, A before B');
  assert.ok(!ELSEWHERE.some((t) => OWN.includes(t)), 'TIDY-FOREIGN-SETS: no thread is in both sets');
  console.log('  ok  tidy-foreign: the sheet reads from elsewhere first, then the tale\'s own, A before B');
  process.exit(0);
}

// THE SWAP, in a child with ANANSI_DB on the prepared copy, so it goes through the app's own copy.
if (mode === 'swap') {
  const db = await import('../src/db.ts');
  const d = new DatabaseSync(process.env.ANANSI_DB!, { readOnly: true });
  const me = (d.prepare("SELECT id FROM users WHERE login = 'sonophage'").get() as any).id;
  const tale = (t: string) => (d.prepare('SELECT id FROM stories WHERE title = ? AND owner_id = ?').get(t, me) as any).id;
  const from = tale(FROM), into = tale(INTO);
  const thread = (s: string, t: string) => (d.prepare("SELECT id FROM entries WHERE story_id = ? AND title = ? AND entry_type = 'character'").get(s, t) as any)?.id;
  for (const t of ELSEWHERE) {
    const was = thread(into, t);
    if (was) db.delEntry(into, was);
    if (!db.copyEntry(from, into, me, thread(from, t))) { console.error(`swap: ${t} did not copy`); process.exit(1); }
  }
  console.log(`  swapped ${ELSEWHERE.length} threads into ${INTO}`);
  process.exit(0);
}

if (mode === 'run') {
  const base = arg;
  if (!base) { console.error('run needs the checkout arm A serves from'); process.exit(2); }
  mkdirSync(OUT, { recursive: true });
  rmSync(join(OUT, 'takes.jsonl'), { force: true });
  const chapters = (() => { const d = new DatabaseSync(SOURCE, { readOnly: true });
    const n = (d.prepare("SELECT max(c.idx) n FROM chapters c JOIN stories s ON s.id = c.story_id JOIN users u ON u.id = s.owner_id WHERE s.title = ? AND u.login = 'kia'").get(INTO) as any).n;
    d.close(); return n; })();
  const point = { chapter: chapters, after: 1e9, title: INTO };
  // THE PREPARED COPY: both tales handed to the desk writer, then the swap through the app.
  const prep = join(OUT, 'prep.db');
  copyAt(SOURCE, prep, { ...point, login: 'kia' }, MODEL, (d) => {
    const me = (d.prepare("SELECT id FROM users WHERE login = 'sonophage'").get() as any).id;
    d.prepare("UPDATE stories SET owner_id = ? WHERE title IN (?, ?) AND owner_id = (SELECT id FROM users WHERE login = 'kia')").run(me, FROM, INTO);
  });
  const sw = spawnSync(process.execPath, ['--experimental-strip-types', new URL(import.meta.url).pathname, 'swap'],
    { env: { ...process.env, ANANSI_DB: prep }, encoding: 'utf8' });
  process.stdout.write(sw.stdout); if (sw.status) { process.stderr.write(sw.stderr); process.exit(1); }
  const arms = [{ key: 'A', port: 5301, cwd: base }, { key: 'B', port: 5302, cwd: new URL('..', import.meta.url).pathname }];
  await Promise.all(arms.map(async (arm) => {
    const file = join(OUT, `arm-${arm.key}.db`);
    const { storyId } = copyAt(prep, file, point, MODEL);
    const { j, kill } = await serveAt(file, arm.port, MODEL, point, storyId, join(OUT, `serve-${arm.key}.log`), arm.cwd);
    const read = () => new DatabaseSync(file, { readOnly: true });
    for (const title of [...ELSEWHERE, ...OWN]) {
      const d0 = read();
      const e = d0.prepare("SELECT id, body FROM entries WHERE story_id = ? AND title = ? AND entry_type = 'character'").get(storyId, title) as any;
      const was = { stands: e.body, pockets: d0.prepare('SELECT slot, name, body FROM addons WHERE entry_id = ?').all(e.id) };
      d0.close();
      const r = await j('/api/tidy', { storyId, entryId: e.id });
      // THE TREATMENT, checked on every answer: only B's Tidy says how many it found from another tale.
      if (!r.error && (arm.key === 'B') !== ('foreign' in r)) { console.error(`arm ${arm.key}: answered as the other arm's Tidy`); kill(); process.exit(1); }
      const d1 = read();
      // THIS TIDY'S CARDS: the newest `tidy:` group on the thread, open (the Workbench's word for waiting).
      const grp = (d1.prepare("SELECT grp FROM proposals WHERE entry_id = ? AND kind = 'tidy' AND status = 'open' ORDER BY created_at DESC LIMIT 1").get(e.id) as any)?.grp;
      const cards = grp ? d1.prepare("SELECT field, pocket, body, line FROM proposals WHERE grp = ? ORDER BY created_at").all(grp) : [];
      d1.close();
      appendFileSync(join(OUT, 'takes.jsonl'), JSON.stringify({ arm: arm.key, title, set: ELSEWHERE.includes(title) ? 'elsewhere' : 'own',
        was, cards, foreign: r.foreign ?? null, error: r.error ?? null }) + '\n');
    }
    kill();
    console.log(`  arm ${arm.key}: ${ELSEWHERE.length + OWN.length} tidies`);
  }));
  process.exit(0);
}

if (mode === 'report') {
  const rows = readFileSync(join(OUT, 'takes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const named = (r: any) => r.cards.filter((c: any) => /From another tale, taken out/.test(c.line ?? '')).length;
  for (const set of ['elsewhere', 'own']) for (const arm of ['A', 'B']) {
    const got = rows.filter((r) => r.set === set && r.arm === arm);
    console.log(`  ${set.padEnd(9)} arm ${arm}: ${got.length} tidies, ${got.filter((r) => r.error).length} errors, ${got.reduce((n, r) => n + r.cards.length, 0)} cards, `
      + `${got.filter((r) => named(r)).length} with a fact named as another tale's (${got.reduce((n, r) => n + (r.foreign ?? 0), 0)} facts)`);
  }
  // THE SHEET: each thread as it was, then A's cards, then B's, labelled.
  const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
  const part = (c: any) => c.field === 'facts' ? 'Always true' : c.pocket ? `${c.pocket} (${c.field})` : 'Where it stands';
  const card = (c: any) => `<div class="card"><div class="part">${esc(part(c))}</div><p>${esc(c.body)}</p>${c.line ? `<p class="line">${esc(c.line)}</p>` : ''}</div>`;
  const byTitle = new Map<string, any[]>();
  for (const r of sheetOrder(rows)) byTitle.set(r.title, [...(byTitle.get(r.title) ?? []), r]);
  const blocks = [...byTitle.entries()].map(([title, rs], k) => {
    const w = rs[0].was, id = `t-${k + 1}`;
    return `<article class="take" id="${id}"><h3>${esc(title)} · ${rs[0].set === 'elsewhere' ? 'from The Lands Between' : 'The Shadow Lands\' own'}</h3>
<details><summary>The thread as it was</summary><p>${esc(w.stands)}</p>${w.pockets.map((p: any) => `<p><b>${esc(p.slot)} ${esc(p.name)}:</b> ${esc(p.body)}</p>`).join('')}</details>
${rs.map((r) => `<div class="arm"><div class="label">${r.arm === 'A' ? 'Tidy today' : 'Tidy that reads the tale'}</div>${r.error ? `<p>${esc(r.error)}</p>` : r.cards.map(card).join('') || '<p class="dim">No cards.</p>'}</div>`).join('')}
<div class="pick" role="group" aria-label="${esc(title)}"><label><input type="radio" name="${id}" value="B better"> New is better</label><label><input type="radio" name="${id}" value="same"> Same</label><label><input type="radio" name="${id}" value="B worse"> New is worse</label></div>
<label class="note" for="${id}-n">What it got right or wrong (optional)</label><textarea id="${id}-n" name="${id}-n" rows="2"></textarea></article>`;
  }).join('');
  writeFileSync(join(OUT, 'sheet.html'), `<title>Tidy reads the tale</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--bg:#f4f1ea;--fg:#24211c;--dim:#6d675c;--card:#fffdf8;--line:#ddd6c8;--accent:#8a4b2a;--serif:'Iowan Old Style',Georgia,serif;--sans:system-ui,-apple-system,'Segoe UI',sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--fg:#ece6da;--dim:#a39b8b;--card:#211e17;--line:#3a352b;--accent:#d9965f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#17150f;--fg:#ece6da;--dim:#a39b8b;--card:#211e17;--line:#3a352b;--accent:#d9965f;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:16px/1.55 var(--serif);max-width:46rem;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:12px 48px}
h1{font:600 22px/1.25 var(--sans);margin:10px 0}
.lede{color:var(--dim)}
.take{border-top:2px solid var(--line);margin-top:26px;padding-top:10px}
h3{font:600 16px var(--sans);color:var(--accent);margin:0 0 6px}
details{font-size:14px;color:var(--dim);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 12px}
summary{font:600 14px var(--sans);cursor:pointer;min-height:32px;display:flex;align-items:center}
.arm{margin-top:10px}
.label{font:600 12px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 12px;margin:6px 0}
.part{font:600 13px var(--sans);color:var(--dim)}
.line{font:14px var(--sans);color:var(--accent)}
.dim{color:var(--dim)}
.pick{display:flex;flex-wrap:wrap;gap:6px 18px;font:15px var(--sans);margin:8px 0}
.pick label{display:flex;align-items:center;gap:6px;min-height:44px}
.note{display:block;font:13px var(--sans);color:var(--dim)}
textarea{width:100%;box-sizing:border-box;font:16px var(--sans);background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:8px}
button{font:600 16px var(--sans);padding:12px 18px;margin:28px 0 10px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--bg)}
pre{white-space:pre-wrap;background:var(--card);padding:10px;border:1px solid var(--line);font:14px/1.5 var(--sans)}
</style>
<h1>Tidy reads the tale</h1>
<p class="lede">Kia's The Shadow Lands, on a copy. The first eight threads are The Lands Between's versions, copied in: they carry events this tale has not had. The last six are The Shadow Lands' own and should lose nothing. Each shows Tidy today, then the new Tidy that reads the tale; the new one's cards name what they took out as another tale's. Mark each, then press Copy my read.</p>
${blocks}
<button id="copy" type="button">Copy my read</button>
<pre id="out" aria-live="polite"></pre>
<script>
const KEY='tidy-foreign-167';const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}};const saved=read();
for(const el of document.querySelectorAll('input[type=radio],textarea')){if(el.type==='radio'){if(saved[el.name]===el.value)el.checked=true}else if(saved[el.name])el.value=saved[el.name];
el.addEventListener(el.type==='radio'?'change':'input',()=>{const s=read();s[el.name]=el.value;try{localStorage.setItem(KEY,JSON.stringify(s))}catch{}})}
document.getElementById('copy').addEventListener('click',()=>{const t=[...document.querySelectorAll('.take')].map(a=>a.querySelector('h3').textContent+': '+(a.querySelector('input:checked')?.value??'-')+((n)=>n?' ('+n+')':'')(a.querySelector('textarea').value.trim())).join('\\n');
document.getElementById('out').textContent=t;navigator.clipboard?.writeText(t).then(()=>{document.getElementById('copy').textContent='Copied'},()=>{})});
</script>`);
  console.log(`  ${join(OUT, 'sheet.html')}`);
  process.exit(0);
}

if (mode !== 'imported') { console.error('usage: bench/tidy-foreign.ts check | run <base-checkout> | report'); process.exit(2); }
