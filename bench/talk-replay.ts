// Talk replay (#159): walk the whole new Talk on a real model and check every card against the rows.
//
// Spec #150 asked for one replay that does, on Ornith, what a writer does with Talk: Seraphine's card
// (the #144 replay), a rename, a passage edit, a lore removal offer, advice, a model switch and its
// Undo, a hem, and a tale set up from scratch in New tale. After each step it compares what the answer
// SAYS was done (its cards, its chalked offers, its reply) with the rows that CHANGED in the library,
// and reports any claim with no row, any row with no card, and any request neither done nor refused.
//
//   node --experimental-strip-types bench/talk-replay.ts check
//   node --experimental-strip-types bench/talk-replay.ts run <scratch.db> <port> <out.jsonl>
//   node --experimental-strip-types bench/talk-replay.ts report <out.jsonl>
//
// `check` plants answers and row changes in both directions and needs no model and no library.
// `run` talks to a scratch server over HTTP and reads the same scratch library read-only to see what
// changed. Before it writes anything it asks the system which library the server on that port has
// open, and refuses unless it is the scratch copy named here and not the live one:
//   ANANSI_DB=<copy> ANANSI_PORT=5301 ANANSI_USER=sonophage ANANSI_MODEL=Ornith-1.0-RPNTH-35B \
//     node --experimental-strip-types serve.ts
//
// ponytail: cards are matched to rows by TABLE, not by row: a rename's card excuses any write in the
// five tables a rename touches, and two cards on one changed row both read as backed. Ceiling: a stray
// write beside an asked one is not caught. Trigger: a replay that has to count rows per card; then
// carry each card's row ids out of the route (the Undo already holds most of them) and diff by id.
import { appendFileSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const MODEL = 'Ornith-1.0-RPNTH-35B';
/** The tale walked: Seth's, with Seraphine, Vel, the Choir of Saints and one open scene of prose. */
const TALE = 's-82316b27';

/** The tables that BACK each kind of card: one of them must change in the card's step. */
const TABLES: Record<string, string[]> = {
  thread: ['entries', 'addons', 'entry_events', 'entry_states'], tale: ['stories', 'entries', 'addons'], scene: ['chapters'],
  string: ['addons', 'entries'], rule: ['addons', 'entries'], instruction: ['addons', 'entries'],
  // A hem closes the scene, opens the next, and writes the break between them into the prose.
  passage: ['passages'], model: ['stories'], hem: ['chapters', 'hems', 'passages'],
};
/** A rename writes its new name everywhere it is written. */
const RENAME = ['entries', 'addons', 'passages', 'chapters', 'stories'];
/** Tables a change also writes beside its own, as a record of it: they are covered by the card, never
 *  proof of it. A passage edit's revision row is written even when the new text is the old text. */
const SIDE: Record<string, string[]> = { passage: ['passage_revisions'], thread: ['entry_revisions'], tale: ['entry_revisions'],
  string: ['entry_revisions'], rule: ['entry_revisions'], instruction: ['entry_revisions'], model: ['users'] };
const kindOf = (op: string) => op.split('.')[0];
const tablesOf = (op: string) => op === 'thread.rename' ? RENAME : TABLES[kindOf(op)] ?? [];
const sideOf = (op: string) => op === 'thread.rename' ? ['entry_revisions', 'passage_revisions'] : SIDE[kindOf(op)] ?? [];

/** Columns that move on every write and say nothing about what was changed. */
const VOLATILE = new Set(['updated_at', 'last_opened_at', 'opened_at']);
/** Tables Talk writes on every answer by design, whatever it changed: its own log and the talk kept. */
const OWN = new Set(['generations', 'talk_sessions']);

type Snap = Record<string, Record<string, string>>;
type Diff = Record<string, { added: string[]; removed: string[]; changed: string[] }>;

/** What changed between two snapshots, table by table, by row id. */
function diff(a: Snap, b: Snap): Diff {
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

/** A reply that says something was done, or is being done: the claim the cards must back. Written
 *  against the planted replies in `check`, then tried on both Ornith runs (2026-11-04), whose unbacked
 *  claims were "I will take it out", "I'll take", "Starting the tale. The draft is now live" and
 *  "Making the tale from the draft now"; straight and curly apostrophes alike. */
const CLAIM = /\bI(?:['’]ve| have| will|['’]ll|['’]m| am)?\s+(?:now\s+)?(added|changed|updated|written|rewritten|renamed|removed|switched|hemmed|filed|made|set|taken|take|taking|remove|removing|rename|renaming|switch|switching|start|starting)\b|\b(starting|making) the tale\b|\bis now live\b/i;

type Step = { name: string; said: string; reply?: string; error?: string; setup?: boolean; expect?: string; directive?: string | null;
  cards: { op: string; words: string }[]; chalked: number; held?: number; notDone?: { said: string; why: string }[]; started?: boolean };

/** Every claim with no row, every row with no card, and every request neither done nor refused. */
function audit(step: Step, d: Diff): string[] {
  const bad: string[] = [];
  const touched = new Set(Object.keys(d));
  // A STEP THAT ERRORED still owns what it wrote: any row it changed is reported.
  if (step.error) return touched.size ? [`rows changed by a step that errored: ${[...touched].join(', ')}`] : [];
  // A draft change is the page's and writes no row; the tale made is the one setup card that must.
  for (const c of step.cards) if (step.setup ? c.op === 'tale.start' && !d.stories?.added.length : !tablesOf(c.op).some((t) => touched.has(t)))
    bad.push(`card with no row: ${c.words}`);
  const covered = new Set(step.cards.flatMap((c) => [...tablesOf(c.op), ...sideOf(c.op)]));
  for (const t of touched) if (t !== 'proposals' && !(step.setup ? t === 'stories' && step.started : covered.has(t)))
    bad.push(`row with no card: ${t} ${JSON.stringify(d[t])}`);
  const offered = d.proposals?.added.length ?? 0;
  if (offered !== step.chalked) bad.push(`offers: ${step.chalked} chalked, ${offered} proposals added`);
  if (step.setup && !!step.started !== !!d.stories?.added.length) bad.push(`tale made: answer says ${!!step.started}, rows say ${!!d.stories?.added.length}`);
  // A claim with nothing behind it, unless the answer already says what was not done: one event, one line.
  if (!step.cards.length && !step.chalked && !step.started && !(step.notDone ?? []).length && CLAIM.test(step.reply ?? ''))
    bad.push(`claim in the reply with nothing behind it: ${(step.reply ?? '').match(CLAIM)![0]}`);
  // WHAT THE STEP ASKED FOR: done (a card of its kind, or an offer for a removal, or the tale made),
  // said not done, or neither, which is the writer asking and hearing nothing about it.
  if (step.expect) {
    const done = step.expect === 'tale.start' ? !!step.started
      : step.cards.some((c) => c.op === step.expect) || (step.expect === 'prose.remove' && step.chalked > 0);
    if (!done) bad.push((step.notDone ?? []).length ? `asked for ${step.expect}, not done: ${step.notDone!.map((x) => x.why).join('; ')}`
      : `asked for ${step.expect}: nothing done and nothing said not done`);
  }
  return bad;
}

/** A tale's change says its kind by its card (`cardOf` in src/changes.ts): the key, or the label a
 *  thread's card carries. `cardOf`'s own fallback ("other") is a kind the bench does not know. */
const opOf = (card: any) => {
  const k = String(card?.key ?? '');
  return k === 'tale' ? 'tale.set' : k === 'model' ? 'model.set' : k.startsWith('hem:') ? 'hem.start' : k.startsWith('passage:') ? 'passage.set'
    : k.startsWith('scene:') ? 'scene.set' : k === 'strings' ? 'string.set' : k === 'rules' ? 'rule.set' : k === 'instructions' ? 'instruction.set'
    : k === 'other' || !k ? 'unknown' : card?.label === 'Renamed' ? 'thread.rename' : 'thread.set';
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
  const rows = (t: string) => ({ [t]: { added: [], removed: [], changed: ['r1'] } });
  const st = (o: Partial<Step>): Step => ({ name: 'x', said: '', cards: [], chalked: 0, ...o });
  const card = (op: string, words = op) => ({ op, words });
  ok('DIFF: a row added and a row changed are both seen, by table', d.addons.added[0] === 'a2' && d.addons.changed[0] === 'a1' && !d.stories);
  ok('DIFF-OWN: Talk\'s own log is not a change to the tale', !d.generations);
  ok('BACKED: a pocket card with its pocket written, and the offer chalked, is clean', audit(st({ cards: [card('thread.set')], chalked: 1 }), d).length === 0);
  ok('NO-ROW: a card whose rows did not change is a claim with no row',
     audit(st({ cards: [card('passage.set', 'Rewrote passage 3')], chalked: 1 }), d).some((m) => /card with no row: Rewrote passage 3/.test(m)));
  ok('SIDE-NOT-PROOF: a passage card with only its revision row written is a claim with no row, and the revision is not a row with no card',
     audit(st({ cards: [card('passage.set', 'Rewrote passage 3')] }), rows('passage_revisions')).join() === 'card with no row: Rewrote passage 3');
  ok('NO-CARD: a row changed with no card is reported', audit(st({ chalked: 1 }), d).some((m) => /row with no card: addons/.test(m)));
  ok('OFFERS: a chalked count the proposals do not match is reported', audit(st({ cards: [card('thread.set')], chalked: 2 }), d).some((m) => /2 chalked, 1 proposals added/.test(m)));
  ok('CLAIM: "I have added her voice" with nothing behind it is reported', audit(st({ reply: 'I have added her voice.' }), {}).some((m) => /claim in the reply/.test(m)));
  for (const c of ['I will take it out of every passage.', 'I’ll take it out.', 'Making the tale from the draft now.', 'Starting the tale.'])
    ok(`CLAIM-WORDS: "${c}" is a claim`, audit(st({ reply: c }), {}).length === 1);
  for (const c of ['She has a low voice.', 'I think he has been there a while.', 'I’d keep the second toll quiet.', 'The story does not say.'])
    ok(`CLAIM-NOT: "${c}" is not`, audit(st({ reply: c }), {}).length === 0);
  ok('CLAIM-SAID-NOT-DONE: a claim beside the app\'s own not-done line is that line, not a second mismatch',
     audit(st({ reply: 'Nothing was changed. I\'ll take it out.', notDone: [{ said: 'Take it out', why: 'no passage mentions it' }] }), {}).length === 0);
  ok('RENAME: a rename is backed by the prose it rewrote', audit(st({ cards: [card('thread.rename')] }), rows('passages')).length === 0);
  const made = { stories: { added: ['s-new'], removed: [], changed: [] } };
  ok('SETUP-MADE: a tale made and said is clean', audit(st({ setup: true, cards: [card('tale.start')], started: true, expect: 'tale.start' }), made).length === 0);
  ok('SETUP-CARD-NO-TALE: a "tale made" card with no tale is a card with no row, and not what was asked',
     audit(st({ setup: true, cards: [card('tale.start', 'Made the tale')], expect: 'tale.start' }), {}).some((m) => /card with no row: Made the tale/.test(m))
     && audit(st({ setup: true, cards: [card('tale.start')], expect: 'tale.start' }), {}).some((m) => /asked for tale.start/.test(m)));
  ok('SETUP-UNSAID: a tale made that the answer does not name is reported', audit(st({ setup: true }), made).some((m) => /row with no card: stories|rows say true/.test(m)));
  ok('SETUP-DRAFT: draft cards write no row and are not claims with no row', audit(st({ setup: true, cards: [card('thread.new'), card('string.set')] }), {}).length === 0);
  ok('ERROR-ROWS: a step that errored and still wrote is reported', audit(st({ error: 'boom' }), rows('addons')).some((m) => /errored: addons/.test(m))
     && audit(st({ error: 'boom' }), {}).length === 0);
  ok('EXPECT: a step that got what it asked for is clean', audit(st({ expect: 'passage.set', cards: [card('passage.set')] }), rows('passages')).length === 0);
  ok('EXPECT-SILENT: asked and neither done nor said not done is reported',
     audit(st({ expect: 'prose.remove' }), {}).some((m) => /nothing done and nothing said not done/.test(m)));
  ok('EXPECT-SAID: asked and said not done is reported with the reason',
     audit(st({ expect: 'thread.rename', notDone: [{ said: 'Rename', why: 'it gave no new name' }] }), {}).some((m) => /not done: it gave no new name/.test(m)));
  ok('OP-OF: each card says its kind as cardOf keys it, and an unknown kind is not a thread', opOf({ key: 'tale' }) === 'tale.set' && opOf({ key: 'hem:c1' }) === 'hem.start'
     && opOf({ key: 'passage:p1' }) === 'passage.set' && opOf({ key: 'e-1', label: 'Renamed' }) === 'thread.rename' && opOf({ key: 'e-1', label: 'Voice' }) === 'thread.set'
     && opOf({ key: 'other' }) === 'unknown');
  console.log(`\n  ${n} checks, all green`);
  process.exit(0);
}

type Row = Step & { rows: Diff; bad: string[]; s: number };
if (mode === 'report') {
  const rows = readFileSync(process.argv[3], 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
  for (const r of rows) {
    console.log(`\n  ${r.name}  (${r.s}s)  "${r.said}"`);
    if (r.error) console.log(`    ERROR ${r.error}`);
    else {
      console.log(`    reply: ${String(r.reply ?? '').replace(/\s+/g, ' ').slice(0, 160)}`);
      for (const c of r.cards) console.log(`    card  ${c.op.padEnd(16)} ${c.words.slice(0, 110)}`);
      if (r.directive) console.log(`    directive: ${r.directive.slice(0, 140)}`);
      if (r.chalked) console.log(`    chalked ${r.chalked}`);
      if (r.held) console.log(`    offered in the draft ${r.held}`);
      for (const x of r.notDone ?? []) console.log(`    not done: ${x.said} (${x.why})`);
    }
    console.log(`    rows: ${Object.entries(r.rows).map(([t, d]) => `${t} +${d.added.length} -${d.removed.length} ~${d.changed.length}`).join(', ') || 'none'}`);
    console.log(r.bad.length ? r.bad.map((b) => `    MISMATCH ${b}`).join('\n') : r.error ? '' : '    ok');
  }
  const bad = rows.reduce((k, r) => k + r.bad.length + (r.error ? 1 : 0), 0);
  console.log(`\n  ${rows.length} steps, ${bad} mismatches or errors\n`);
  process.exit(0);
}

if (mode !== 'run') { console.error('usage: check | run <scratch.db> <port> <out.jsonl> | report <out.jsonl>'); process.exit(2); }
const [DB, PORT, OUT] = process.argv.slice(3);
if (!DB || !PORT || !OUT) throw new Error('run <scratch.db> <port> <out.jsonl>');
// NEVER THE LIVE LIBRARY. Not the file named here, and not the one the server on PORT has open: the
// bench writes through the server, so a server started without ANANSI_DB (the live library by default)
// would take every write. The system says which process listens on the port and which library it has
// open; anything but the scratch copy named here is refused before the first write.
const real = realpathSync(DB);
const isLive = (p: string) => { try { return realpathSync(p) === real; } catch { return false; } };
if ([resolve(new URL('..', import.meta.url).pathname, 'anansi.db'), resolve(process.env.HOME ?? '', 'Documents/repositories/sonophage/anansi/anansi.db')].some(isLive)
    || Number(PORT) === 5174) throw new Error('talk-replay runs on a scratch copy and a scratch port only, never the live library');
const listening = execFileSync('ss', ['-ltnpH'], { encoding: 'utf8' }).split('\n').find((l) => new RegExp(`:${Number(PORT)}\\s`).test(l)) ?? '';
const pid = /pid=(\d+)/.exec(listening)?.[1];
const opened = pid ? readdirSync(`/proc/${pid}/fd`).map((f) => { try { return readlinkSync(`/proc/${pid}/fd/${f}`); } catch { return ''; } }) : [];
if (!opened.includes(real)) throw new Error(`the server on ${PORT} (pid ${pid ?? 'none'}) does not have ${real} open; refusing to write through it`);
const BASE = `http://127.0.0.1:${Number(PORT)}`;
const { DatabaseSync } = await import('node:sqlite');

/** Every row that belongs to the tale, fingerprinted without the columns that move on any write: the
 *  tables with a story_id (and every story, so a tale made shows), the revisions and states of its
 *  passages and threads by their parent, and its writer's row (the model for new tales). */
function snap(): Snap {
  const d = new DatabaseSync(DB, { readOnly: true });
  try {
    const tables = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'fts_%'").all() as any[]).map((r) => r.name);
    const out: Snap = {};
    for (const t of tables) {
      const cols = (d.prepare(`PRAGMA table_info("${t}")`).all() as any[]).map((c) => c.name);
      const key = cols.includes('id') ? 'id' : 'rowid';
      const where = t === 'stories' ? '' : cols.includes('story_id') ? 'WHERE story_id = :tale'
        : cols.includes('passage_id') ? 'WHERE passage_id IN (SELECT id FROM passages WHERE story_id = :tale)'
        : cols.includes('entry_id') ? 'WHERE entry_id IN (SELECT id FROM entries WHERE story_id = :tale)'
        : t === 'users' ? 'WHERE id = (SELECT owner_id FROM stories WHERE id = :tale)' : null;
      if (where === null) continue;
      out[t] = {};
      const stmt = d.prepare(`SELECT rowid AS rowid, * FROM "${t}" ${where}`);
      for (const r of (where.includes(':tale') ? stmt.all({ tale: TALE }) : stmt.all()) as any[]) {
        const keep = Object.fromEntries(Object.entries(r).filter(([k]) => !VOLATILE.has(k)));
        out[t][String(r[key])] = createHash('sha1').update(JSON.stringify(keep)).digest('hex').slice(0, 12);
      }
    }
    return out;
  } finally { d.close(); }
}
const j = async (u: string, b?: unknown) => (await fetch(BASE + u, b === undefined ? undefined
  : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json() as any;
const running = () => { const d = new DatabaseSync(DB, { readOnly: true });
  try { return (d.prepare('SELECT count(*) AS n FROM hems WHERE story_id = ? AND finished_at IS NULL').get(TALE) as any).n as number; } finally { d.close(); } };

// ---- pin the tale to Ornith and check it took, before anything is asked.
const pinned = await j('/api/story', { id: TALE, story: { model: MODEL } });
if (pinned.error) throw new Error(`pin: ${pinned.error}`);
const view = await j(`/api/story?story=${TALE}`);
if (view.model !== MODEL) throw new Error(`the tale is on ${view.model}, not ${MODEL}`);
console.log(`  ${view.story?.title ?? view.title} on ${view.model}, ${BASE}, ${DB}`);

writeFileSync(OUT, '');
let session: string | undefined;
/** One step: snapshot, run, `settle` (what must finish before its rows are counted), snapshot, audit. */
async function step(name: string, said: string, run: () => Promise<any>, shape: (r: any) => Partial<Step>, settle?: () => Promise<string | null>) {
  const t0 = Date.now(), before = snap();
  let r: any;
  try { r = await run(); } catch (e: any) { r = { error: String(e?.message ?? e) }; }
  const late = settle ? await settle() : null;
  const rows = diff(before, snap());
  const err = r.error ?? late;
  const st: Step = err ? { name, said, error: String(err), cards: [], chalked: 0 } : { name, said, ...shape(r) } as Step;
  const row: Row = { ...st, rows, bad: audit(st, rows), s: Math.round((Date.now() - t0) / 1000) };
  appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(`  ${name}: ${row.error ? 'ERROR ' + row.error : ''}${row.bad.length ? row.bad.join(' | ') : row.error ? '' : 'ok'}`);
  return r;
}
const talk = (said: string) => async () => { const r = await j('/api/talk', { storyId: TALE, said, turns: [], sessionId: session }); session = r.sessionId ?? session; return r; };
const told = (r: any) => ({ reply: r.reply, cards: (r.changes ?? []).map((c: any) => ({ op: opOf(c.card), words: String(c.words ?? '') })),
  chalked: (r.chalked ?? []).length, notDone: r.notDone, directive: r.directive ?? null });
const ask = (name: string, said: string, expect?: string, settle?: () => Promise<string | null>) =>
  step(name, said, talk(said), (r) => ({ ...told(r), ...(expect ? { expect } : {}) }), settle);

await ask('advice', 'What should happen next?');
await ask('seraphine', 'Ok fill out the seraphine card and fill her pockets please', 'thread.set');
await ask('rename', 'Vel is called Vessa now. Rename her everywhere.', 'thread.rename');
await ask('passage', 'Rewrite passage 3 of this scene so it is colder.', 'passage.set');
await ask('lore', "The Choir of Saints doesn't exist any more. Take it out of the prose.", 'prose.remove');
// The model switched and switched back by its Undo, so the steps after run on Ornith again. With no
// Undo on the switch, the step is still written down, as an error.
const sw = await ask('model', 'Switch this tale to Qwen3.6.', 'model.set');
const back = (sw?.changes ?? []).find((c: any) => c.card?.key === 'model')?.undo;
await step('model-undo', '(Undo)', async () => back ? j('/api/talk/undo', { storyId: TALE, undo: back, sessionId: session }) : { error: 'the switch had no Undo to press' },
  (r) => ({ reply: 'undone', cards: [{ op: 'model.set', words: 'Undo of the switch' }], chalked: 0 }));
// The hem runs on after its answer: its rows are counted in its own step, once it has finished.
await ask('hem', 'Hem this scene.', 'hem.start', async () => {
  for (let i = 0; i < 600; i++) { if (!running()) return null; await new Promise((r) => setTimeout(r, 2000)); }
  return 'the hem was still running after 20 minutes';
});

// ---- NEW TALE, set up by talking: the draft is the page's, so only "set it up" may write a row.
// ponytail: the new tale's own threads and strings are not snapshotted (only its stories row is), so
// a tale made with fewer threads than its draft reads as clean. Trigger: a replay that has to check
// what Start carried over; then snapshot the rows of any story added in the step.
const draft = { story: { title: 'The Toll Road', genre: 'folk horror', premise: 'A road where every traveller pays twice.',
  setting: 'A toll house on a moor', writingStyle: 'Spare, third person, past tense.' }, entries: [] as any[], strings: [] as any[] };
const setupAs = (said: string, expect: string, more: any = {}) => step(`setup: ${said.slice(0, 24)}`, said,
  () => j('/api/spark/talk', { draft, step: 'Begin: Start the tale', said, turns: [], ...more }),
  (r) => ({ setup: true, expect, reply: r.reply, cards: (r.changes ?? []).map((c: any) => ({ op: String(c.change?.op), words: String(c.words) })),
    chalked: 0, held: (r.held ?? []).length, notDone: r.notDone, started: !!r.started?.id }));
const added = await setupAs('Add the tollkeeper with his voice, and a promise about the second toll.', 'thread.new');
for (const c of added?.changes ?? []) {
  if (c.change?.op === 'thread.new') draft.entries.push({ ...c.change.thread, keep: true });
  if (c.change?.op === 'string.set') draft.strings.push({ title: c.change.title, line: c.change.text, kind: c.change.kind, keep: true });
}
await setupAs('Set it up.', 'tale.start', { start: { ...draft.story, pov: 'third limited, past tense', spice: 2,
  entries: draft.entries.map(({ keep: _k, ...e }) => e), strings: draft.strings, spark: true } });
console.log('done ->', OUT);
