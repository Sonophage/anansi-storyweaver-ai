// Talk replay (#159): walk the whole new Talk on a real model and check every card against the rows.
//
// Spec #150 asked for one replay that does, on Ornith, what a writer does with Talk: Seraphine's card
// (the #144 replay), a rename, a passage edit, a lore removal offer, advice, a model switch and its
// Undo, a hem, and a tale set up from scratch in New tale. After each step it compares what the answer
// SAYS was done (its cards, its chalked offers, its reply) with the rows that CHANGED in the library,
// and reports any claim with no row and any row with no card.
//
//   node --experimental-strip-types bench/talk-replay.ts check
//   node --experimental-strip-types bench/talk-replay.ts run <scratch.db> <port> <out.jsonl>
//   node --experimental-strip-types bench/talk-replay.ts report <out.jsonl>
//
// `check` plants answers and row changes in both directions and needs no model and no library.
// `run` talks to a scratch server over HTTP and reads the same scratch library read-only to see what
// changed. It refuses the live library and the live port, and pins the tale to Ornith first:
//   ANANSI_DB=<copy> ANANSI_PORT=5301 ANANSI_USER=sonophage ANANSI_MODEL=Ornith-1.0-RPNTH-35B \
//     node --experimental-strip-types serve.ts
import { appendFileSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const MODEL = 'Ornith-1.0-RPNTH-35B';
/** The tale walked: Seth's, with Seraphine, Vel, the Choir of Saints and one open scene of prose. */
const TALE = 's-82316b27';

/** What each kind of card writes to. A card is backed when one of its tables changed in its step. */
export const TABLES: Record<string, string[]> = {
  thread: ['entries', 'addons', 'entry_events'], tale: ['stories', 'entries', 'addons'], scene: ['chapters'],
  string: ['addons', 'entries'], rule: ['addons', 'entries'], instruction: ['addons', 'entries'],
  // A hem closes the scene, opens the next, and writes the break between them into the prose.
  passage: ['passages'], model: ['stories'], hem: ['chapters', 'hems', 'passages'], takeover: ['entries', 'addons'],
};
/** A rename writes its new name everywhere it is written. */
const RENAME = ['entries', 'addons', 'passages', 'chapters', 'stories'];
const tablesOf = (op: string) => op === 'thread.rename' ? RENAME : TABLES[op.split('.')[0]] ?? [];

/** Columns that move on every write and say nothing about what was changed. */
const VOLATILE = new Set(['updated_at', 'last_opened_at', 'opened_at']);
/** Tables Talk writes on every answer by design, whatever it changed: its own log and the talk kept. */
const OWN = new Set(['generations', 'talk_sessions']);

export type Snap = Record<string, Record<string, string>>;
export type Diff = Record<string, { added: string[]; removed: string[]; changed: string[] }>;

/** What changed between two snapshots, table by table, by row id. */
export function diff(a: Snap, b: Snap): Diff {
  const out: Diff = {};
  for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (OWN.has(t)) continue;
    const x = a[t] ?? {}, y = b[t] ?? {};
    const d = { added: Object.keys(y).filter((k) => !(k in x)), removed: Object.keys(x).filter((k) => !(k in y)),
      changed: Object.keys(y).filter((k) => k in x && x[k] !== y[k]) };
    if (d.added.length + d.removed.length + d.changed.length) out[t] = d;
  }
  return out;
}

/** A reply that says something was done, or is being done: the claim the cards must back. On Ornith
 *  (2026-11-04) the unbacked ones were "I will take it out of every passage" and "Starting the tale.
 *  The draft is now live", so the future and the progressive count too. */
const CLAIM = /\bI(?:'ve| have| will|'ll|'m| am)?\s+(?:now\s+)?(added|changed|updated|written|rewritten|renamed|removed|switched|hemmed|filed|made|set|taken|take|taking|remove|removing|rename|renaming|switch|switching|start|starting)\b|\bstarting the tale\b|\bis now live\b/i;

export type Step = { name: string; said: string; reply?: string; error?: string; setup?: boolean; expect?: string; directive?: string | null;
  cards: { op: string; title?: string; label?: string; words: string }[]; chalked: number; held?: number;
  notDone?: { said: string; why: string }[]; started?: boolean; undo?: boolean };

/** Every claim with no row, and every row with no card, for one step. */
export function audit(step: Step, d: Diff): string[] {
  const bad: string[] = [];
  const touched = new Set(Object.keys(d));
  for (const c of step.cards) {
    if (c.op === 'tale.start') continue;
    if (step.setup) continue;   // a draft change is the page's, and writes no row
    if (!tablesOf(c.op).some((t) => touched.has(t))) bad.push(`card with no row: ${c.words}`);
  }
  const covered = new Set(step.cards.flatMap((c) => tablesOf(c.op)));
  for (const t of touched) if (t !== 'proposals' && !(step.setup ? t === 'stories' && step.started : covered.has(t)))
    bad.push(`row with no card: ${t} ${JSON.stringify(d[t])}`);
  const offered = d.proposals?.added.length ?? 0;
  if (offered !== step.chalked) bad.push(`offers: ${step.chalked} chalked, ${offered} proposals added`);
  if (step.setup && !!step.started !== !!d.stories?.added.length) bad.push(`tale made: answer says ${!!step.started}, rows say ${!!d.stories?.added.length}`);
  if (!step.cards.length && !step.chalked && !step.started && CLAIM.test(step.reply ?? ''))
    bad.push(`claim in the reply with nothing behind it: ${(step.reply ?? '').match(CLAIM)![0]}`);
  // WHAT THE STEP ASKED FOR: done (a card of its kind, or an offer for a removal), said not done, or
  // neither, which is the writer asking and hearing nothing about it.
  if (step.expect) {
    const done = step.cards.some((c) => c.op === step.expect) || (step.expect === 'prose.remove' && step.chalked > 0);
    if (!done) bad.push((step.notDone ?? []).length ? `asked for ${step.expect}, not done: ${step.notDone!.map((x) => x.why).join('; ')}`
      : `asked for ${step.expect}: nothing done and nothing said not done`);
  }
  return bad;
}

/** A tale's change says its kind by its card (`cardOf` in src/changes.ts): the key, or Renamed. */
export const opOf = (card: any) => {
  const k = String(card?.key ?? '');
  return k === 'tale' ? 'tale.set' : k === 'model' ? 'model.set' : k.startsWith('hem:') ? 'hem.start' : k.startsWith('passage:') ? 'passage.set'
    : k.startsWith('scene:') ? 'scene.set' : k === 'strings' ? 'string.set' : k === 'rules' ? 'rule.set' : k === 'instructions' ? 'instruction.set'
    : card?.label === 'Renamed' ? 'thread.rename' : 'thread.set';
};

const mode = process.argv[2];
if (mode === 'check') {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };
  console.log('\n  talk-replay check — the detector answers both ways, before any model time is spent\n');
  const A: Snap = { addons: { a1: 'x' }, stories: { s: 'p' }, proposals: {}, generations: { g1: '1' } };
  const B: Snap = { addons: { a1: 'y', a2: 'z' }, stories: { s: 'p' }, proposals: { p1: 'q' }, generations: { g1: '1', g2: '2' } };
  const d = diff(A, B);
  ok('DIFF: a row added and a row changed are both seen, by table', d.addons.added[0] === 'a2' && d.addons.changed[0] === 'a1' && !d.stories);
  ok('DIFF-OWN: Talk\'s own log is not a change to the tale', !d.generations);
  const card = (op: string, words = op) => ({ op, words });
  ok('BACKED: a pocket card with its pocket written, and the offer chalked, is clean',
     audit({ name: 'x', said: '', cards: [card('thread.set')], chalked: 1 }, d).length === 0);
  ok('NO-ROW: a card whose rows did not change is a claim with no row',
     audit({ name: 'x', said: '', cards: [card('passage.set', 'Rewrote passage 3')], chalked: 1 }, d).some((m) => /card with no row: Rewrote passage 3/.test(m)));
  ok('NO-CARD: a row changed with no card is reported', audit({ name: 'x', said: '', cards: [], chalked: 1 }, d).some((m) => /row with no card: addons/.test(m)));
  ok('OFFERS: a chalked count the proposals do not match is reported',
     audit({ name: 'x', said: '', cards: [card('thread.set')], chalked: 2 }, d).some((m) => /2 chalked, 1 proposals added/.test(m)));
  ok('CLAIM: "I have added her voice" with nothing behind it is reported',
     audit({ name: 'x', said: '', reply: 'I have added her voice.', cards: [], chalked: 0 }, {}).some((m) => /claim in the reply/.test(m)));
  ok('CLAIM-NOT: a plain answer is not a claim', audit({ name: 'x', said: '', reply: 'She has a low voice.', cards: [], chalked: 0 }, {}).length === 0);
  ok('RENAME: a rename is backed by the prose it rewrote', audit({ name: 'x', said: '', cards: [card('thread.rename')], chalked: 0 },
     { passages: { added: [], removed: [], changed: ['p1'] } }).length === 0);
  const made = { stories: { added: ['s-new'], removed: [], changed: [] } };
  ok('SETUP-MADE: a tale made and said is clean, and said but not made is reported',
     audit({ name: 'x', said: '', setup: true, cards: [card('tale.start')], chalked: 0, started: true }, made).length === 0
     && audit({ name: 'x', said: '', setup: true, cards: [card('tale.start')], chalked: 0, started: true }, {}).some((m) => /tale made: answer says true, rows say false/.test(m)));
  ok('SETUP-UNSAID: a tale made that the answer does not name is reported',
     audit({ name: 'x', said: '', setup: true, cards: [], chalked: 0 }, made).some((m) => /row with no card: stories|rows say true/.test(m)));
  ok('SETUP-DRAFT: draft cards write no row and are not claims with no row',
     audit({ name: 'x', said: '', setup: true, cards: [card('thread.new'), card('string.set')], chalked: 0 }, {}).length === 0);
  ok('EXPECT: a step that got what it asked for is clean', audit({ name: 'x', said: '', expect: 'passage.set', cards: [card('passage.set')], chalked: 0 },
     { passages: { added: [], removed: [], changed: ['p1'] } }).length === 0);
  ok('EXPECT-SILENT: asked and neither done nor said not done is reported',
     audit({ name: 'x', said: '', expect: 'prose.remove', cards: [], chalked: 0 }, {}).some((m) => /nothing done and nothing said not done/.test(m)));
  ok('EXPECT-SAID: asked and said not done is reported with the reason',
     audit({ name: 'x', said: '', expect: 'thread.rename', cards: [], chalked: 0, notDone: [{ said: 'Rename', why: 'it gave no new name' }] }, {})
       .some((m) => /not done: it gave no new name/.test(m)));
  ok('CLAIM-FUTURE: "I will take it out" with nothing behind it is a claim', audit({ name: 'x', said: '', reply: 'I will take it out of every passage.', cards: [], chalked: 0 }, {}).length === 1);
  ok('OP-OF: each card says its kind as cardOf keys it', opOf({ key: 'tale' }) === 'tale.set' && opOf({ key: 'hem:c1' }) === 'hem.start'
     && opOf({ key: 'passage:p1' }) === 'passage.set' && opOf({ key: 'e-1', label: 'Renamed' }) === 'thread.rename' && opOf({ key: 'e-1', label: 'Voice' }) === 'thread.set');
  console.log(`\n  ${n} checks, all green`);
  process.exit(0);
}

type Row = Step & { rows: Diff; bad: string[]; s: number };
if (mode === 'report') {
  const rows = readFileSync(process.argv[3], 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
  for (const r of rows) {
    console.log(`\n  ${r.name}  (${r.s}s)  "${r.said}"`);
    if (r.error) { console.log(`    ERROR ${r.error}`); continue; }
    console.log(`    reply: ${String(r.reply ?? '').replace(/\s+/g, ' ').slice(0, 160)}`);
    for (const c of r.cards) console.log(`    card  ${c.op.padEnd(16)} ${c.words.slice(0, 110)}`);
    if (r.directive) console.log(`    directive: ${r.directive.slice(0, 140)}`);
    if (r.chalked) console.log(`    chalked ${r.chalked}`);
    if (r.held) console.log(`    offered in the draft ${r.held}`);
    for (const x of r.notDone ?? []) console.log(`    not done: ${x.said} (${x.why})`);
    console.log(`    rows: ${Object.entries(r.rows).map(([t, d]) => `${t} +${d.added.length} -${d.removed.length} ~${d.changed.length}`).join(', ') || 'none'}`);
    console.log(r.bad.length ? r.bad.map((b) => `    MISMATCH ${b}`).join('\n') : '    ok');
  }
  const bad = rows.reduce((k, r) => k + r.bad.length + (r.error ? 1 : 0), 0);
  console.log(`\n  ${rows.length} steps, ${bad} mismatches or errors\n`);
  process.exit(0);
}

if (mode !== 'run') { console.error('usage: check | run <scratch.db> <port> <out.jsonl> | report <out.jsonl>'); process.exit(2); }
const [DB, PORT, OUT] = process.argv.slice(3);
if (!DB || !PORT || !OUT) throw new Error('run <scratch.db> <port> <out.jsonl>');
// NEVER THE LIVE LIBRARY, by its real path, and never the live server's port.
const live = resolve(new URL('..', import.meta.url).pathname, 'anansi.db');
const liveMain = resolve(process.env.HOME ?? '', 'Documents/repositories/sonophage/anansi/anansi.db');
const real = realpathSync(DB);
if ([live, liveMain].some((p) => { try { return realpathSync(p) === real; } catch { return false; } }) || PORT === '5174')
  throw new Error('talk-replay runs on a scratch copy and a scratch port only, never the live library');
const BASE = `http://127.0.0.1:${PORT}`;
const { DatabaseSync } = await import('node:sqlite');

/** Every row of every table that belongs to a tale (and the owner's tales), fingerprinted without the
 *  columns that move on any write. */
function snap(): Snap {
  const d = new DatabaseSync(DB, { readOnly: true });
  try {
    const tables = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'fts_%'").all() as any[]).map((r) => r.name);
    const out: Snap = {};
    for (const t of tables) {
      const cols = (d.prepare(`PRAGMA table_info("${t}")`).all() as any[]).map((c) => c.name);
      const key = cols.includes('id') ? 'id' : 'rowid';
      const where = t === 'stories' ? '' : cols.includes('story_id') ? `WHERE story_id = '${TALE}'` : null;
      if (where === null) continue;
      out[t] = {};
      for (const r of d.prepare(`SELECT rowid AS rowid, * FROM "${t}" ${where}`).all() as any[]) {
        const keep = Object.fromEntries(Object.entries(r).filter(([k]) => !VOLATILE.has(k)));
        out[t][String(r[key])] = createHash('sha1').update(JSON.stringify(keep)).digest('hex').slice(0, 12);
      }
    }
    return out;
  } finally { d.close(); }
}
const j = async (u: string, b?: unknown) => (await fetch(BASE + u, b === undefined ? undefined
  : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json() as any;

// ---- pin the tale to Ornith and check it took, before anything is asked.
const pinned = await j('/api/story', { id: TALE, story: { model: MODEL } });
if (pinned.error) throw new Error(`pin: ${pinned.error}`);
const view = await j(`/api/story?story=${TALE}`);
if (view.model !== MODEL) throw new Error(`the tale is on ${view.model}, not ${MODEL}`);
console.log(`  ${view.story?.title ?? view.title} on ${view.model}, ${BASE}, ${DB}`);

writeFileSync(OUT, '');
let session: string | undefined;
const cardsOf = (r: any) => (r.changes ?? []).map((c: any) => ({ op: opOf(c.card), title: c.card?.title,
  label: c.card?.label, words: String(c.words ?? '') }));
async function step(name: string, said: string, run: () => Promise<any>, shape: (r: any) => Partial<Step>) {
  const t0 = Date.now(), before = snap();
  let r: any;
  try { r = await run(); } catch (e: any) { r = { error: String(e?.message ?? e) }; }
  const rows = diff(before, snap());
  const st: Step = r.error ? { name, said, error: String(r.error), cards: [], chalked: 0 } : { name, said, ...shape(r) } as Step;
  const row: Row = { ...st, rows, bad: st.error ? [] : audit(st, rows), s: Math.round((Date.now() - t0) / 1000) };
  appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(`  ${name}: ${row.error ? 'ERROR ' + row.error : row.bad.length ? row.bad.join(' | ') : 'ok'}`);
  return r;
}
const talk = (said: string) => async () => { const r = await j('/api/talk', { storyId: TALE, said, turns: [], sessionId: session }); session = r.sessionId ?? session; return r; };
const told = (r: any) => ({ reply: r.reply, cards: cardsOf(r), chalked: (r.chalked ?? []).length, notDone: r.notDone, directive: r.directive ?? null });
const asking = (expect: string) => (r: any) => ({ ...told(r), expect });

await step('advice', 'What should happen next?', talk('What should happen next?'), told);
await step('seraphine', 'Ok fill out the seraphine card and fill her pockets please', talk('Ok fill out the seraphine card and fill her pockets please'), asking('thread.set'));
await step('rename', 'Vel is called Vessa now. Rename her everywhere.', talk('Vel is called Vessa now. Rename her everywhere.'), asking('thread.rename'));
await step('passage', 'Rewrite passage 3 of this scene so it is colder.', talk('Rewrite passage 3 of this scene so it is colder.'), asking('passage.set'));
await step('lore', "The Choir of Saints doesn't exist any more. Take it out of the prose.", talk("The Choir of Saints doesn't exist any more. Take it out of the prose."), asking('prose.remove'));
// The model switched and switched back by its Undo, so the steps after run on Ornith again.
const sw = await step('model', 'Switch this tale to Qwen3.6.', talk('Switch this tale to Qwen3.6.'), asking('model.set'));
const back = (sw?.changes ?? []).find((c: any) => c.card?.key === 'model')?.undo;
if (back) await step('model-undo', '(Undo)', () => j('/api/talk/undo', { storyId: TALE, undo: back, sessionId: session }),
  (r) => ({ reply: r.ok ? 'undone' : String(r.error ?? ''), cards: r.error ? [] : [{ op: 'model.set', words: 'Undo of the switch' }], chalked: 0, undo: true }));
await step('hem', 'Hem this scene.', talk('Hem this scene.'), asking('hem.start'));
// The hem runs on after its answer; the next step waits for it, or its rows would be counted there.
for (let i = 0; i < 600; i++) {
  const d = new DatabaseSync(DB, { readOnly: true });
  const running = (d.prepare(`SELECT count(*) AS n FROM hems WHERE story_id = ? AND finished_at IS NULL`).get(TALE) as any).n;
  d.close();
  if (!running) break;
  await new Promise((r) => setTimeout(r, 2000));
}

// ---- NEW TALE, set up by talking: the draft is the page's, so only "set it up" may write a row.
const draft = { story: { title: 'The Toll Road', genre: 'folk horror', premise: 'A road where every traveller pays twice.',
  setting: 'A toll house on a moor', writingStyle: 'Spare, third person, past tense.' }, entries: [] as any[], strings: [] as any[] };
const setupAs = (said: string, more: any = {}) => async () =>
  j('/api/spark/talk', { draft, step: 'Begin: Start the tale', said, turns: [], ...more });
const setupTold = (r: any) => ({ setup: true, reply: r.reply, cards: (r.changes ?? []).map((c: any) => ({ op: String(c.change?.op), words: String(c.words) })),
  chalked: 0, held: (r.held ?? []).length, notDone: r.notDone, started: !!r.started?.id });
const added = await step('setup', 'Add the tollkeeper with his voice, and a promise about the second toll.',
  setupAs('Add the tollkeeper with his voice, and a promise about the second toll.'), (r) => ({ ...setupTold(r), expect: 'thread.new' }));
for (const c of added?.changes ?? []) {
  if (c.change?.op === 'thread.new') draft.entries.push({ ...c.change.thread, keep: true });
  if (c.change?.op === 'string.set') draft.strings.push({ title: c.change.title, line: c.change.text, kind: c.change.kind, keep: true });
}
await step('setup-start', 'Set it up.', setupAs('Set it up.', { start: { ...draft.story, pov: 'third limited, past tense', spice: 2,
  entries: draft.entries.map(({ keep: _k, ...e }) => e), strings: draft.strings, spark: true } }), (r) => ({ ...setupTold(r), expect: 'tale.start' }));
console.log('done ->', OUT);
