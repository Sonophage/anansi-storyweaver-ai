// RECENTLY DELETED (#169). A version of a passage the writer deleted while the passage kept
// another version waits seven days, listed in Account across every tale the writer writes.
// Every other delete — the last version, all versions, Delete after, a scene, a branch — keeps
// nothing, by Seth's call of 2026-11-06. Put back (#170) returns one behind its passage's pager.
//
// On the virtual clock, because the seven days and the half-hourly upkeep are both time.
// Ownership with two writers is in test/scope.ts, beside every other route's.
//
//   node --experimental-strip-types test/deleted.ts
import assert from 'node:assert';
import { mock } from 'node:test';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-deleted.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;
mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.UTC(2026, 10, 12, 12) });
const db = await import('../src/db.ts');
const { routes, OPEN_ROUTES } = await import('../src/routes.ts');
const { DatabaseSync } = await import('node:sqlite');

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };
const DAY = 864e5, HOUR = 36e5;
const alice = db.owner('alice');
const ctx = (owner: string, body: any = {}, query = '') => ({ body, query: new URLSearchParams(query), owner,
  slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: {}, setGen: () => {},
  defaultModel: null, setDefaultModel: () => {}, otherDefaults: () => [], admin: false }) as any;
const del = (storyId: string, id: string, allTakes = false) =>
  routes['DELETE /api/passage'](ctx(alice, { storyId, id, allTakes }));
const list = async (owner = alice) => ((await routes['GET /api/deleted'](ctx(owner))) as any).versions as any[];
const raw = new DatabaseSync(DB);
const binned = () => (raw.prepare('SELECT COUNT(*) c FROM deleted_versions').get() as any).c as number;

/** A tale with one passage of two versions: the first a directed Speak in a named voice. */
const twoTakes = (title: string) => {
  const s = db.createStory(alice, { title });
  const first = db.addPassage({ ...s, storyId: s.id, body: `${title}: the first version.`,
    mode: 'speak', directive: 'Keep it quiet.', speaker: 'Wren' });
  const second = db.addVariant(s.id, first, `${title}: the second version.`) as string;
  return { s, first, second };
};

assert.ok(OPEN_ROUTES.has('GET /api/deleted'), 'the list names no tale, so it is open and scopes itself');
ok('GET /api/deleted exists and is open: it names no tale');

// THE BIN KEEPS EVERY COLUMN OF A PASSAGE. Two things that must agree: what `passages` holds and
// what the copy keeps. A column added to passages and not to the bin is a version #170 cannot
// rebuild, so this fails the day they part.
{
  const cols = (t: string) => (raw.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => c.name);
  const missing = cols('passages').filter((c) => !cols('deleted_versions').includes(c));
  assert.deepStrictEqual(missing, [], `BIN-COLUMNS: deleted_versions keeps every column of passages (missing ${missing})`);
  assert.deepStrictEqual([...db.BINNED_COLS].sort(), cols('passages').sort(),
    'BIN-COLUMNS: and the copy names every one of them');
}
ok('the bin keeps every column a passage has, and the copy names each one');

// 1. ONE VERSION, OF A PASSAGE THAT KEEPS ANOTHER.
{
  assert.deepStrictEqual(await list(), [], 'nothing is waiting in a new library');
  const { s, first, second } = twoTakes('Lantern');
  const was = raw.prepare('SELECT * FROM passages WHERE id = ?').get(first) as any;
  const scene = db.chapters(s.id)[0] as any;
  await del(s.id, first);
  assert.strictEqual(binned(), 1, 'BIN-ONE: deleting one version of two keeps one row');
  const kept = raw.prepare('SELECT * FROM deleted_versions WHERE id = ?').get(first) as any;
  for (const c of db.BINNED_COLS)
    assert.deepStrictEqual(kept[c], was[c], `BIN-ONE: the kept row's ${c} is the deleted row's`);
  assert.strictEqual(kept.deleted_by, alice, 'BIN-ONE: and it says who deleted it');
  const [v, ...more] = await list();
  assert.strictEqual(more.length, 0, 'BIN-ONE: the list holds that one version');
  assert.deepStrictEqual([v.id, v.body, v.mode, v.directive, v.speaker],
    [first, 'Lantern: the first version.', 'speak', 'Keep it quiet.', 'Wren'],
    'BIN-ONE: with its text, its button, its direction and its voice');
  assert.deepStrictEqual([v.storyId, v.taleTitle, v.sceneIndex, v.sceneTitle, v.deletedAt],
    [s.id, 'Lantern', scene.idx, scene.title, Date.now()],
    'BIN-ONE: and its tale, its scene and when');
  // 2. The passage behaves as it always did: the version is gone, the survivor is the book.
  const takes = [...db.variantsBySlot(s.id).values()][0];
  assert.deepStrictEqual(takes.map((t: any) => [t.id, !!t.selected]), [[second, true]],
    'the slot keeps the other version, selected');
  // 1b. Deleting the selected version keeps it too, and promotes the survivor as before.
  const third = db.addVariant(s.id, second, 'Lantern: the third version.') as string;
  await del(s.id, third);
  assert.strictEqual(binned(), 2, 'BIN-SELECTED: the selected version is kept when it goes');
  assert.strictEqual((db.passagesOfChapter(s.chapterId)[0] as any).id, second,
    'and the newest survivor is the book again');
  raw.exec('DELETE FROM deleted_versions');
}
ok('deleting one version of a passage that keeps another lists it, with its tale, scene and when');

// 3. EVERY OTHER DELETE KEEPS NOTHING.
{
  // a. The last version.
  const a = db.createStory(alice, { title: 'Alone' });
  const only = db.addPassage({ ...a, storyId: a.id, body: 'The only version.' });
  await del(a.id, only);
  assert.strictEqual(binned(), 0, 'NOBIN-LAST: deleting a passage\'s last version keeps nothing');
  // b. All versions at once.
  const b = twoTakes('Every version');
  await del(b.s.id, b.first, true);
  assert.strictEqual(binned(), 0, 'NOBIN-ALL: deleting all versions keeps nothing');
  // c. Delete after, over a passage with two versions.
  const c = db.createStory(alice, { title: 'After' });
  const top = db.addPassage({ ...c, storyId: c.id, body: 'Stays.' });
  const below = db.addPassage({ ...c, storyId: c.id, body: 'Goes, version one.' });
  db.addVariant(c.id, below, 'Goes, version two.');
  await routes['DELETE /api/after'](ctx(alice, { storyId: c.id, id: top }));
  assert.strictEqual(db.passagesOfChapter(c.chapterId).length, 1, 'Delete after took the passage below');
  assert.strictEqual(binned(), 0, 'NOBIN-AFTER: Delete after keeps nothing');
  // d. A scene, holding a passage with two versions.
  const d = twoTakes('Scene goes');
  db.endChapter(d.s.id, d.s.branchId);
  const r: any = await routes['DELETE /api/chapter'](ctx(alice, { storyId: d.s.id, id: d.s.chapterId }));
  assert.ok(!r.error, `the scene went (${r.error})`);
  assert.strictEqual(binned(), 0, 'NOBIN-SCENE: deleting a scene keeps nothing');
  // e. A branch, holding a passage with two versions.
  const e = twoTakes('Branch goes');
  const fork = db.forkBranch(e.s.id, e.s.branchId, 1, 'Other way') as string;
  const forked = (raw.prepare('SELECT id FROM passages WHERE branch_id = ? LIMIT 1').get(fork) as any).id;
  db.addVariant(e.s.id, forked, 'Branch goes: another version on the fork.');
  const rb: any = await routes['POST /api/branch/delete'](ctx(alice, { storyId: e.s.id, id: fork }));
  assert.ok(!rb.error, `the branch went (${rb.error})`);
  assert.strictEqual(binned(), 0, 'NOBIN-BRANCH: deleting a branch keeps nothing');
  assert.deepStrictEqual(await list(), [], 'and the list is still empty');
}
ok('the last version, all versions, Delete after, a scene and a branch keep nothing');

// 4. NEWEST FIRST.
{
  const x = twoTakes('Older'), y = twoTakes('Newer');
  await del(x.s.id, x.first);
  mock.timers.tick(HOUR);
  await del(y.s.id, y.first);
  assert.deepStrictEqual((await list()).map((v) => v.taleTitle), ['Newer', 'Older'],
    'NEWEST-FIRST: the later deletion comes first');
  raw.exec('DELETE FROM deleted_versions');
}
ok('the list is newest first');

// A SCENE THAT IS GONE does not take its deleted version off the list (#170 says why it is gone).
{
  const g = twoTakes('Orphan');
  await del(g.s.id, g.first);
  db.endChapter(g.s.id, g.s.branchId);
  await routes['DELETE /api/chapter'](ctx(alice, { storyId: g.s.id, id: g.s.chapterId }));
  const [v] = await list();
  assert.deepStrictEqual([v?.id, v?.sceneIndex, v?.sceneTitle], [g.first, null, null],
    'ORPHAN: a version whose scene was deleted after it stays listed, with no scene');
  raw.exec('DELETE FROM deleted_versions');
}
ok('a version whose scene is gone stays listed');

// 6. SEVEN DAYS, on a list read.
{
  const old = twoTakes('Eight days'), young = twoTakes('Six days');
  await del(old.s.id, old.first);
  mock.timers.tick(2 * DAY);
  await del(young.s.id, young.first);
  mock.timers.tick(6 * DAY);
  assert.strictEqual(binned(), 2, 'both rows are on disk until something prunes');
  assert.deepStrictEqual((await list()).map((v) => v.taleTitle), ['Six days'],
    'PRUNE-READ: a list read drops the eight-day-old version and keeps the six-day-old one');
  assert.strictEqual(binned(), 1, 'PRUNE-READ: and the eight-day-old row is gone from disk');
  raw.exec('DELETE FROM deleted_versions');
}
ok('a list read removes what was deleted more than seven days ago, and keeps the rest');

// 6. SEVEN DAYS, on the half-hourly upkeep, with nobody reading the list.
{
  let backups = 0;
  const stop = db.halfHourly(() => { backups++; });
  assert.strictEqual(backups, 1, 'the upkeep runs once at start, as the boot snapshot did');
  const old = twoTakes('Timer eight'), young = twoTakes('Timer six');
  await del(old.s.id, old.first);
  mock.timers.tick(2 * DAY);
  await del(young.s.id, young.first);
  mock.timers.tick(6 * DAY);
  stop();
  assert.strictEqual(backups, 1 + 8 * 48, 'and once every half hour after it');
  const left = (raw.prepare('SELECT story_id FROM deleted_versions').all() as any[]).map((r) => r.story_id);
  assert.deepStrictEqual(left, [young.s.id],
    'PRUNE-TIMER: the half-hourly upkeep drops the eight-day-old row and keeps the six-day-old one');
}
ok('the half-hourly upkeep removes what was deleted more than seven days ago, and keeps the rest');

// The search index never reads the bin: a deleted version is not found by searching.
{
  const gone = (raw.prepare('SELECT id, story_id FROM deleted_versions').get() as any);
  const ids = (db.search(alice, 'Timer', gone.story_id) as any[]).map((h) => h.id);
  assert.ok(ids.length > 0, 'the detector: the version that stayed is found');
  assert.ok(!ids.includes(gone.id), 'NOT-SEARCHED: a deleted version is not a search result');
}
ok('a deleted version is not found by searching');

// ---- PUT BACK (#170) ----------------------------------------------------------------------------
const back = (storyId: string, id: string, owner = alice) =>
  routes['POST /api/deleted/putback'](ctx(owner, { storyId, id })) as any;
const row = (id: string) => raw.prepare('SELECT * FROM passages WHERE id = ?').get(id) as any;
const slotRows = (chapterId: string, slotKey: number) =>
  raw.prepare('SELECT * FROM passages WHERE chapter_id = ? AND slot_key = ? ORDER BY variant_index')
    .all(chapterId, slotKey) as any[];
const pager = (storyId: string, chapterId: string, slotKey: number) =>
  db.variantsBySlot(storyId).get(`${chapterId}:${slotKey}`)?.length ?? 0;
const counts = () => [(raw.prepare('SELECT COUNT(*) c FROM passages').get() as any).c, binned()];
raw.exec('DELETE FROM deleted_versions');

assert.ok(!OPEN_ROUTES.has('POST /api/deleted/putback'), 'PUTBACK-GATED: Put back names its tale and is not open');
ok('Put back names its tale, so the gate checks it');

// 1, 2. A VERSION PUT BACK IS BEHIND THE PAGER, NOT SELECTED, AS IT WAS.
{
  const { s, first, second } = twoTakes('Returned');
  const was = row(first);
  const third = db.addVariant(s.id, second, 'Returned: the third version.') as string;
  await del(s.id, first);
  const before = pager(s.id, was.chapter_id, was.slot_key);
  const r = await back(s.id, first);
  assert.ok(!r.error, `PUTBACK-RESTORE: Put back succeeds (${r.error})`);
  const now = row(first);
  assert.ok(now, 'PUTBACK-RESTORE: the deleted id is a passage again');
  assert.deepStrictEqual([now.chapter_id, now.slot_key], [was.chapter_id, was.slot_key],
    'PUTBACK-RESTORE: in the same slot');
  assert.strictEqual(now.selected, 0, 'PUTBACK-RESTORE: not selected');
  const others = slotRows(was.chapter_id, was.slot_key).filter((p) => p.id !== first);
  assert.ok(others.every((p) => now.variant_index > p.variant_index),
    'PUTBACK-RESTORE: its version number is after every other version of the slot');
  for (const c of ['body', 'mode', 'directive', 'speaker', 'author', 'created_at'])
    assert.deepStrictEqual(now[c], was[c], `PUTBACK-RESTORE: its ${c} is the deleted row's`);
  const sel = slotRows(was.chapter_id, was.slot_key).filter((p) => p.selected);
  assert.deepStrictEqual(sel.map((p) => p.id), [third],
    'PUTBACK-RESTORE: the version selected before is still the one selected one');
  assert.ok(!(await list()).some((v) => v.id === first), 'PUTBACK-RESTORE: Recently deleted no longer lists it');
  assert.strictEqual(pager(s.id, was.chapter_id, was.slot_key), before + 1,
    'PUTBACK-PAGER: the passage\'s pager counts one more version');
  const view: any = await routes['GET /api/story'](ctx(alice, {}, `story=${s.id}`));
  const shown = view.passages.find((p: any) => p.chapterId === was.chapter_id && p.id === third);
  assert.strictEqual((shown?.variants ?? []).length, 3, 'PUTBACK-PAGER: and the story view shows three versions');
  // Search reads the version on the page, so the trigger path is proved by picking it in the pager.
  assert.ok(!(db.search(alice, 'first', s.id) as any[]).some((h) => h.id === first),
    'the detector: not selected, it is not a search hit');
  db.selectVariant(s.id, first);
  assert.ok((db.search(alice, 'first', s.id) as any[]).some((h) => h.id === first),
    'PUTBACK-SEARCH: picked in the pager, a version put back is found by searching again');
  db.selectVariant(s.id, third);
}
ok('Put back returns the version behind its passage\'s pager, not selected, with its own record');

// 3. THE ORDINAL STORED IN THE BIN CAN BE STALE: take the slot's.
{
  const s = db.createStory(alice, { title: 'Shifted' });
  db.addPassage({ ...s, storyId: s.id, body: 'Scene one, first passage.' });
  db.endChapter(s.id, s.branchId);
  const two = db.chapters(s.id).at(-1) as any;
  const p = db.addPassage({ ...s, chapterId: two.id, storyId: s.id, body: 'Shifted: version one.' });
  db.addVariant(s.id, p, 'Shifted: version two.');
  await del(s.id, p);
  const old = (raw.prepare('SELECT ordinal FROM deleted_versions WHERE id = ?').get(p) as any).ordinal;
  db.addPassage({ ...s, storyId: s.id, chapterId: s.chapterId, body: 'Scene one, written in above.' });
  const live = slotRows(two.id, row(db.passagesOfChapter(two.id)[0].id).slot_key)[0];
  assert.strictEqual(live.ordinal, old + 1, 'the detector: the passage above moved the slot down one');
  const r = await back(s.id, p);
  assert.ok(!r.error, `Put back succeeds (${r.error})`);
  assert.deepStrictEqual([row(p).ordinal, row(p).branch_id], [live.ordinal, live.branch_id],
    'PUTBACK-ORDINAL: the version put back takes the slot\'s ordinal and branch now, not the stored ones');
}
ok('a version put back after a passage was written above it takes the slot\'s place now');

// 4. A SECOND PRESS DOES NOTHING.
{
  const { s, first } = twoTakes('Twice');
  await del(s.id, first);
  await back(s.id, first);
  const was = counts(), slot = JSON.stringify(slotRows(row(first).chapter_id, row(first).slot_key));
  const r = await back(s.id, first);
  assert.ok(r && typeof r.error === 'string' && /already put back|gone/i.test(r.error),
    `PUTBACK-TWICE: the second press says it was already put back or is gone (${r?.error})`);
  assert.deepStrictEqual(counts(), was, 'PUTBACK-TWICE: and writes no row anywhere');
  assert.strictEqual(JSON.stringify(slotRows(row(first).chapter_id, row(first).slot_key)), slot,
    'PUTBACK-TWICE: the slot is as it was');
}
ok('a second Put back of the same version changes nothing and says why');

// 5. THE PASSAGE IS GONE: by Delete after, and by deleting its scene.
{
  const a = db.createStory(alice, { title: 'Gone after' });
  const top = db.addPassage({ ...a, storyId: a.id, body: 'Stays.' });
  const below = db.addPassage({ ...a, storyId: a.id, body: 'Gone after: version one.' });
  db.addVariant(a.id, below, 'Gone after: version two.');
  await del(a.id, below);
  await routes['DELETE /api/after'](ctx(alice, { storyId: a.id, id: top }));
  const inScene = twoTakes('Gone scene');
  await del(inScene.s.id, inScene.first);
  db.endChapter(inScene.s.id, inScene.s.branchId);
  await routes['DELETE /api/chapter'](ctx(alice, { storyId: inScene.s.id, id: inScene.s.chapterId }));
  for (const [sid, id, how] of [[a.id, below, 'Delete after'], [inScene.s.id, inScene.first, 'its scene deleted']]) {
    const v = (await list()).find((x) => x.id === id);
    assert.strictEqual(!!v?.passageGone, true, `PUTBACK-GONE: listed as gone after ${how}`);
    const was = counts();
    const r = await back(sid, id);
    assert.ok(typeof r.error === 'string' && /passage is gone/i.test(r.error),
      `PUTBACK-GONE: Put back says the passage is gone after ${how} (${r.error})`);
    assert.deepStrictEqual(counts(), was, `PUTBACK-GONE: nothing is written after ${how}`);
    assert.ok((await list()).some((x) => x.id === id), `PUTBACK-GONE: it stays in Recently deleted after ${how}`);
  }
}
ok('a version whose passage is gone is refused with the reason, and stays listed');

// 7. AN ID THAT IS LIVE IN PASSAGES IS NEVER OVERWRITTEN.
{
  const { s, first } = twoTakes('Clash');
  await del(s.id, first);
  // Only a hand-made row can do this: the copy the bin holds, and a live passage with its id.
  raw.prepare(`INSERT INTO passages (id,chapter_id,story_id,branch_id,slot_key,ordinal,variant_index,selected,
      author,body,created_at) SELECT id,chapter_id,story_id,branch_id,slot_key + 100,ordinal + 100,0,1,author,
      'Clash: the live row.',created_at FROM deleted_versions WHERE id = ?`).run(first);
  const live = JSON.stringify(row(first)), was = counts();
  const r = await back(s.id, first);
  assert.ok(typeof r.error === 'string', `PUTBACK-CLASH: refused (${r.error})`);
  assert.strictEqual(JSON.stringify(row(first)), live, 'PUTBACK-CLASH: the live row is unchanged');
  assert.deepStrictEqual(counts(), was, 'PUTBACK-CLASH: and nothing is written');
}
ok('Put back refuses an id that is already a passage and leaves that passage alone');

// 8. THE LIST CARRIES NOTHING THE SCREEN DOES NOT READ.
{
  const { s, first } = twoTakes('Shape');
  await del(s.id, first);
  const v = (await list()).find((x) => x.id === first);
  assert.ok(v, 'the detector: the version is listed');
  assert.ok(!('author' in v) && !('deletedBy' in v), `LIST-SHAPE: a row carries no author or deletedBy (${Object.keys(v)})`);
}
ok('the list no longer carries who wrote or who deleted a version');

raw.close();
mock.timers.reset();
console.log(`\n${n} checks passed`);
