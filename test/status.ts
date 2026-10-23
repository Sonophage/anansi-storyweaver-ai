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

console.log(`\n${n} checks passed`);
