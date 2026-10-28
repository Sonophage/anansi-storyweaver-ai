// `status.ts` reads the library and writes nothing to it. Runs against scratch copies, never the
// real one.
//
// WHY THIS EXISTS (#65). Status imported `src/db.ts`, which opens the file read-write and runs
// migrate() at module load, and migrate() runs `repairStrandedChapters()`. On 2026-10-18 00:11 a
// status run opened Chapter 7 of a book in the live library that way. A command that says it is
// derived status must leave the file exactly as it found it, so the check is on the BYTES of the
// file, and the fixture is the one state that made status write: a book with nowhere to write.
//
// ESM imports hoist, so the env var is set before db.ts is loaded, as test/db.ts does.
const DB = '/tmp/anansi-status.db';
process.env.ANANSI_DB = DB;
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }

const db = await import('../src/db.ts');
const o = db.owner('status-test');
const s = db.createStory(o, { title: 'Stranded', premise: 'p' }) as any;
const two = db.endChapter(s.id, s.branchId) as any;
db.rawCloseChapter(s.id, two.opened);
const shape = (c: DatabaseSync) => (c.prepare('SELECT idx, status FROM chapters WHERE story_id = ? ORDER BY idx')
  .all(s.id) as any[]).map((r) => [r.idx, r.status]);
assert.deepStrictEqual(shape(db.db), [[1, 'closed'], [2, 'closed']],
  'the fixture really is a book the repair would open a chapter for');
// Closing the last connection checkpoints the WAL into the file, so the bytes hashed below are the
// whole library and nothing is waiting in a side file to land later.
db.db.close();

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };
const hash = () => createHash('sha256').update(readFileSync(DB)).digest('hex');
const status = (file = DB) => execFileSync(process.execPath, ['--experimental-strip-types', 'status.ts'],
  { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', env: { ...process.env, ANANSI_DB: file } });

ok('status leaves a library with a stranded book byte-identical', () => {
  const before = hash();
  const out = status();
  assert.strictEqual(hash(), before, 'status changed the database file');
  const c = new DatabaseSync(DB, { readOnly: true });
  assert.deepStrictEqual(shape(c), [[1, 'closed'], [2, 'closed']], 'and opened no chapter');
  c.close();
  assert.doesNotMatch(out, /opened Chapter/, 'and says it repaired nothing, because it did not');
  // The rest of the report still reads the file: the counts come from this library, not another.
  assert.match(out, /library\s+1 stories · status-test 1/, 'the library line counts this file');
  assert.match(out, /tables on disk\s+\d+/, 'the tables line still reads the file');
  assert.match(out, /search index chapters\s+.*\b2 rows/, 'the search index line still reads the file');
});

/* A LIBRARY BEHIND THE CODE is reported, not migrated. Status used to bring the file up to date as a
 * side effect of reading it; now it says so plainly and leaves that to the server's boot. The column
 * is one migrate() adds (`shortlist.cost`, #51), dropped from a copy of the fixture. */
ok('a library whose schema is older than the code is named as older and left as it is', () => {
  const OLD = '/tmp/anansi-status-old.db';
  for (const f of ['', '-wal', '-shm']) { try { unlinkSync(OLD + f); } catch {} }
  copyFileSync(DB, OLD);
  const raw = new DatabaseSync(OLD);
  raw.exec('ALTER TABLE shortlist DROP COLUMN cost');
  raw.close();
  const before = createHash('sha256').update(readFileSync(OLD)).digest('hex');
  const out = status(OLD);
  assert.strictEqual(createHash('sha256').update(readFileSync(OLD)).digest('hex'), before,
    'status migrated the older file');
  assert.match(out, /schema\s+OLDER THAN THE CODE.*missing shortlist\.cost/, 'and says which column is missing');
  assert.doesNotMatch(status(), /schema\s+OLDER/, 'a library that matches the code gets no schema line');
});

/* #102. A KEY THAT CHANGED IS A SCHEMA THAT IS OLDER, though no column did. chapter_pins kept its
 * columns and changed what its thread is keyed to, so a comparison of columns alone called the old
 * library current. The copy is put back in the old shape: the thread keyed (entry_id, story_id). */
ok('a library whose pins are keyed the old way is named as older, by the key', () => {
  const OLD = '/tmp/anansi-status-pins.db';
  for (const f of ['', '-wal', '-shm']) { try { unlinkSync(OLD + f); } catch {} }
  copyFileSync(DB, OLD);
  const raw = new DatabaseSync(OLD);
  raw.exec(`DROP TABLE chapter_pins;
    CREATE TABLE chapter_pins (
      chapter_id TEXT NOT NULL, entry_id TEXT NOT NULL, story_id TEXT NOT NULL,
      mode TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY (chapter_id, entry_id),
      FOREIGN KEY (chapter_id, story_id) REFERENCES chapters(id, story_id) ON DELETE CASCADE,
      FOREIGN KEY (entry_id, story_id)   REFERENCES entries(id, story_id)  ON DELETE CASCADE);`);
  raw.close();
  const before = createHash('sha256').update(readFileSync(OLD)).digest('hex');
  const out = status(OLD);
  assert.strictEqual(createHash('sha256').update(readFileSync(OLD)).digest('hex'), before, 'status migrated the older file');
  assert.match(out, /schema\s+OLDER THAN THE CODE.*missing chapter_pins key \(entry_id\) → entries\(id\)/,
    'STATUS-KEY-MISSING: it names the key the code has and the file does not');
  assert.match(out, /schema\s+OLDER THAN THE CODE.*still has chapter_pins key \(entry_id, story_id\) → entries\(id, story_id\)/,
    'STATUS-KEY-EXTRA: and the old key the file still has');
});


/* A RECORDED CHECK THAT WRITES NOTHING IS NAMED, not read as clean. The canon check wrote 0 rows
 * over 627 generations for 52 days (#69), and nothing said so: a check that never runs and a check
 * that finds nothing look the same in the table. Status prints each recorded check's rows for the
 * last seven days beside the calls that should have produced them, and SILENT when there were more
 * than 20 calls and no rows. Both directions: silent, and then not. */
ok('a recorded check with no rows against many calls is named SILENT, and one with rows is not', () => {
  const LIVE = '/tmp/anansi-status-live.db';
  for (const f of ['', '-wal', '-shm']) { try { unlinkSync(LIVE + f); } catch {} }
  copyFileSync(DB, LIVE);
  const raw = new DatabaseSync(LIVE);
  const now = Date.now();
  const gen = raw.prepare('INSERT INTO generations (id, story_id, role, created_at, mend) VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < 21; i++) gen.run(`g-p${i}`, s.id, 'prose', now - i * 60_000, null);
  for (let i = 0; i < 21; i++) gen.run(`g-r${i}`, s.id, 'repair', now - i * 60_000, null);
  // Old rows are outside the window and must not count for it.
  raw.prepare("INSERT INTO violations (id, story_id, passage_id, created_at) VALUES ('v-old', ?, 'p', ?)")
    .run(s.id, now - 30 * 86_400_000);
  raw.close();
  const silent = status(LIVE);
  assert.match(silent, /canon check\s+SILENT\b.*21 prose/, 'SILENT-CANON: no flags against 21 prose calls is named');
  assert.match(silent, /repair record\s+SILENT\b.*21 repair/, 'SILENT-MEND: 21 repairs with no record is named');

  const w = new DatabaseSync(LIVE);
  w.prepare("INSERT INTO violations (id, story_id, passage_id, created_at) VALUES ('v-new', ?, 'p', ?)").run(s.id, now);
  w.prepare("UPDATE generations SET mend = '{}' WHERE id = 'g-r0'").run();
  w.close();
  const heard = status(LIVE);
  assert.match(heard, /canon check\s+1 flag.*21 prose/, 'and one flag in the window is counted, not called silent');
  assert.match(heard, /repair record\s+1 record.*21 repair/, 'and one repair record is counted');
  // A row's value starts at column 28. Matched there and not anywhere, because the commit line
  // prints the last commit's subject, which can say SILENT itself.
  const SILENT = /^ {2}.{26}SILENT/m;
  assert.doesNotMatch(heard, SILENT, 'with no SILENT row anywhere');
  // A quiet week is not a silent one: under the threshold, nothing is named.
  assert.doesNotMatch(status(), SILENT, 'a library with almost no calls is never called silent');
});

console.log(`\n${n} checks passed`);
