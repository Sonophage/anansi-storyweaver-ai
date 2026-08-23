// Persistence. `node:sqlite` — built into Node, zero dependencies, one file on disk.
//
// DIVERGENCE from PLAN-02 §3, deliberate: that locked Postgres in Docker, and Docker is not
// running. COUNCIL-03's backend seat established the only two real arguments for Postgres are
// pgvector (unscheduled) and RLS (needs a second tenant). Neither is live yet. The schema below
// is the target shape, so the port is mechanical when either arrives.
//
// Council #3 S2 fixes applied: `branches` exists from the start (PLAN-02 put it a phase after the
// rows that reference it), and the ordinal index is PARTIAL — a full UNIQUE(branch_id, ordinal)
// makes regenerate fail on insert, because variants share an ordinal and differ by variant_index.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ponytail: SQLite, not Postgres. PLAN-02 §3 locked Postgres for pgvector (unscheduled) and RLS
// (needs a second tenant); neither is live, and Docker was not running. The schema is the target
// shape so the port is mechanical. Port when the second writer arrives or vectors are wanted.
export const FILE = process.env.ANANSI_DB ?? new URL('../anansi.db', import.meta.url).pathname;
export const db = new DatabaseSync(FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
// A second process on the same file gets SQLITE_BUSY immediately without this; bench scripts
// and the test suites all open the database alongside a running server.
db.exec('PRAGMA busy_timeout = 5000;');

// Migrations. `CREATE TABLE IF NOT EXISTS` cannot alter an existing table or replace an index,
// so anything that changes shape has to be stated here and be safe to run twice. Without this
// a fresh clone and a live database drift apart silently.
function migrate() {
  const has = (table: string, col: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some((c) => c.name === col);
  const add = (table: string, col: string, decl: string) => {
    try { if (!has(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`); }
    catch { /* table not created yet on a fresh database; the CREATE below covers it */ }
  };
  add('stories', 'active_branch', 'TEXT');
  add('chapters', 'keep_whole', 'INTEGER DEFAULT 0');
  add('entries', 'field_editors', "TEXT DEFAULT '{}'");
  // The dedupe index used to cover every row, so a subject once accepted or rejected could
  // never be proposed again. Scoped to open proposals now.
  try {
    const idx = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='proposals_dedupe'").get() as any;
    if (idx && !String(idx.sql).includes('WHERE')) db.exec('DROP INDEX proposals_dedupe');
    // Recreate here as well: the schema above uses IF NOT EXISTS, which does nothing when the
    // old index is still present, so dropping without rebuilding left no index at all.
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS proposals_dedupe
             ON proposals(story_id, content_hash) WHERE status = 'open'`);
  } catch { /* nothing to replace */ }
}
// An earlier revision created an FTS5 table that nothing ever populated or queried, while
// search ran a LIKE scan beside it. Dropping it rather than leaving a table that looks like
// a feature. Re-add it when a LIKE scan is actually too slow.
for (const t of ['passages_fts', 'passages_fts_data', 'passages_fts_idx',
                 'passages_fts_docsize', 'passages_fts_config'])
  try { db.exec(`DROP TABLE IF EXISTS ${t}`); } catch { /* fts5 drops its shadow tables */ }

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, name TEXT, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, genre TEXT, premise TEXT, setting TEXT, pov TEXT,
  persona TEXT,              -- who you are in it. The "You · Ilva Marren" byline.
  writing_style TEXT, direction TEXT, spice INTEGER DEFAULT 2,
  system_block_override TEXT, strip_patterns TEXT, max_context INTEGER,
  status TEXT DEFAULT 'in_progress',   -- in_progress | finished | draft
  active_branch TEXT,                  -- which path you are writing on
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  parent_id TEXT, name TEXT NOT NULL, fork_ordinal INTEGER, is_primary INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, title TEXT, authors_note TEXT,
  summary TEXT, summary_tokens TEXT, summary_covers_through INTEGER, summary_hash TEXT,
  status TEXT DEFAULT 'open',          -- open | closed
  -- Pull a compacted chapter's full prose back into context on demand. A summary is a record
  -- of what happened: it carries plot through compaction and throws tone away. Writing a
  -- callback to a scene twenty chapters back, you want the rain, not the minutes.
  keep_whole INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS chapters_idx ON chapters(story_id, branch_id, idx);
-- Parent keys for the composite foreign keys on chapter_pins.
CREATE UNIQUE INDEX IF NOT EXISTS chapters_scope ON chapters(id, story_id);

-- SPEC 8.3's act-level tier. Chapter summaries grow linearly, so EARLIER eventually crowds
-- out the prose it is meant to make room for: at chapter 50 the summaries alone are larger
-- than two chapters of writing. An arc collapses a run of chapters into one summary, and the
-- chapters it covers stop being sent individually.
CREATE TABLE IF NOT EXISTS arcs (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL, from_chapter INTEGER NOT NULL, to_chapter INTEGER NOT NULL,
  title TEXT, summary TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS arcs_story ON arcs(story_id, from_chapter);

CREATE TABLE IF NOT EXISTS passages (
  id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL, branch_id TEXT NOT NULL,
  slot_key REAL NOT NULL,              -- fractional: insert mid-chapter never renumbers
  ordinal INTEGER NOT NULL,            -- monotonic per branch; all engine counts use this
  variant_index INTEGER DEFAULT 0, selected INTEGER DEFAULT 1,
  author TEXT NOT NULL,                -- human | model
  speaker TEXT,                        -- null = narration. Set = a named voice.
  body TEXT NOT NULL, is_break INTEGER DEFAULT 0,
  token_counts TEXT, directive TEXT, created_at INTEGER NOT NULL);
-- PARTIAL, per Council #3 S2. A full unique here breaks regenerate.
CREATE UNIQUE INDEX IF NOT EXISTS passages_sel ON passages(branch_id, ordinal) WHERE selected = 1;
CREATE INDEX IF NOT EXISTS passages_ch ON passages(chapter_id, slot_key);
-- variantsBySlot runs inside view(), which runs on every mutation, and filtered on
-- (story_id, branch_id) with no index to serve it — a full scan of passages each time.
CREATE INDEX IF NOT EXISTS passages_branch ON passages(story_id, branch_id, slot_key);

CREATE TABLE IF NOT EXISTS passage_revisions (
  id TEXT PRIMARY KEY, passage_id TEXT NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
  body TEXT NOT NULL, replaced_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS passage_rev_p ON passage_revisions(passage_id, replaced_at);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, notes TEXT,
  entry_type TEXT DEFAULT 'character', activation TEXT DEFAULT 'always_on',
  -- ponytail: priority, sticky_for and proper_nouns are stored and ignored. The engine does
  -- plain whole-word matching only. priority needs the budget engine to mean anything (SPEC
  -- §7.3/§7.5); sticky_for and proper_nouns belong with the activation work (SPEC §7.4).
  keys TEXT DEFAULT '[]', priority INTEGER DEFAULT 0, sticky_for INTEGER DEFAULT 3,
  proper_nouns INTEGER DEFAULT 1, last_editor TEXT DEFAULT 'human',
  -- Who last wrote each field, as {field: 'human'|'model'}. last_editor alone is entry-level,
  -- and an entry-level freeze rots backwards: by chapter 30 the stale entries are exactly the
  -- protagonists you cared enough to touch. The freeze has to be per field to avoid that.
  field_editors TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

-- Canon over time (design screen 27). An entry has a base body plus later states, each
-- anchored to a chapter. The state in force is the last one at or before where you are
-- writing, so chapter 3 cannot leak what chapter 7 established. before_mode decides what
-- happens ahead of a state opening: hide it, or tell the model something exists it does
-- not yet know.
-- Parent key for the composite foreign key on chapter_pins. Without it SQLite accepts the
-- CREATE and then fails every insert with "SQL logic error", which is a confusing way to
-- learn that a composite FK needs a unique index on exactly those columns.
CREATE UNIQUE INDEX IF NOT EXISTS entries_scope ON entries(id, story_id);

CREATE TABLE IF NOT EXISTS entry_states (
  id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  from_chapter INTEGER NOT NULL, body TEXT NOT NULL,
  before_mode TEXT DEFAULT 'hide',        -- hide | hint
  label TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS entry_states_e ON entry_states(entry_id, from_chapter);
CREATE INDEX IF NOT EXISTS entries_story ON entries(story_id);
CREATE INDEX IF NOT EXISTS stories_owner ON stories(owner_id);

CREATE TABLE IF NOT EXISTS entry_revisions (
  id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  field TEXT NOT NULL, previous_value TEXT, replaced_at INTEGER NOT NULL, replaced_by TEXT);
CREATE INDEX IF NOT EXISTS entry_rev_e ON entry_revisions(entry_id, replaced_at);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  chapter_id TEXT, entry_id TEXT,          -- set when this proposes a change to an existing entry
  title TEXT NOT NULL, body TEXT NOT NULL, entry_type TEXT, keys TEXT DEFAULT '[]',
  kind TEXT NOT NULL,                      -- new | changed | conflict
  delta TEXT,                              -- one line: what this would change
  status TEXT DEFAULT 'open',              -- open | accepted | rejected
  content_hash TEXT,                       -- dedupe: re-running must not re-propose
  created_at INTEGER NOT NULL);
-- Dedupe only among OPEN proposals. A unique index over every row meant that once a subject
-- had been accepted or rejected it could never be proposed again — extraction went quietly
-- deaf around the chapter where you first said no, and reported "added 0" as if the chapter
-- held nothing new.
CREATE UNIQUE INDEX IF NOT EXISTS proposals_dedupe ON proposals(story_id, content_hash)
  WHERE status = 'open';

-- SPEC 7.1. Per-chapter overrides on the ledger: force a fact in for a scene where it
-- matters but nobody says its keyword, or force one out to keep a reveal sealed.
--
-- The scope rule cannot be a CHECK (it references another table), so it is a composite
-- foreign key against (id, story_id) on both sides. Without it a pin can point at another
-- story's entry, which is a cross-user leak rather than a coherence bug.
CREATE TABLE IF NOT EXISTS chapter_pins (
  chapter_id TEXT NOT NULL, entry_id TEXT NOT NULL, story_id TEXT NOT NULL,
  mode TEXT NOT NULL,                      -- force_in | force_out
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chapter_id, entry_id),
  FOREIGN KEY (chapter_id, story_id) REFERENCES chapters(id, story_id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id, story_id)   REFERENCES entries(id, story_id)  ON DELETE CASCADE);

-- SPEC 8.4. No shipping product checks its own output against the story bible; the input
-- list is already sitting in generations.context_manifest, so this costs one cheap call.
-- Flags only, never a rewrite: the model does not get to silently correct the book.
CREATE TABLE IF NOT EXISTS violations (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  passage_id TEXT NOT NULL, entry_id TEXT, quote TEXT, reason TEXT, confidence REAL,
  status TEXT DEFAULT 'open',              -- open | dismissed | fixed
  created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS violations_p ON violations(passage_id);
CREATE INDEX IF NOT EXISTS violations_s ON violations(story_id, status);

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY, story_id TEXT, chapter_id TEXT, passage_id TEXT,
  model TEXT, role TEXT, params TEXT, manifest TEXT,
  prompt_tokens INTEGER, completion_tokens INTEGER, timings TEXT,
  latency_ms INTEGER, error TEXT, created_at INTEGER NOT NULL);
-- generations is the fastest-growing table and recentGenerations sorts it by time.
CREATE INDEX IF NOT EXISTS generations_story ON generations(story_id, created_at);

`);

migrate();

const now = () => Date.now();
const uid = (p = '') => p + Math.random().toString(36).slice(2, 10);
const q = (sql: string) => db.prepare(sql);

export function owner(login = 'sonophage'): string {
  const row = q('SELECT id FROM users WHERE login = ?').get(login) as any;
  if (row) return row.id;
  const id = uid('u-');
  q('INSERT INTO users (id, login, name, created_at) VALUES (?,?,?,?)').run(id, login, login, now());
  return id;
}

export const listStories = (o: string) => q(`
  SELECT s.*, (SELECT COUNT(*) FROM passages p WHERE p.story_id = s.id AND p.selected = 1) AS passages,
         (SELECT COUNT(*) FROM chapters c WHERE c.story_id = s.id) AS chapters,
         (SELECT COUNT(*) FROM entries e WHERE e.story_id = s.id) AS entries
  FROM stories s WHERE s.owner_id = ? ORDER BY s.updated_at DESC`).all(o);

export function createStory(o: string, s: any) {
  const id = uid('s-'), b = uid('b-'), c = uid('c-'), t = now();
  q(`INSERT INTO stories (id,owner_id,title,genre,premise,setting,pov,persona,writing_style,
      direction,spice,max_context,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, o, s.title ?? 'Untitled', s.genre ?? '',
    s.premise ?? '', s.setting ?? '', s.pov ?? 'third limited, past tense', s.persona ?? null,
    s.writingStyle ?? '', s.direction ?? null, s.spice ?? 2, s.maxContext ?? null,
    s.status ?? 'in_progress', t, t);
  q('INSERT INTO branches (id,story_id,name,is_primary,created_at) VALUES (?,?,?,1,?)').run(b, id, 'main', t);
  q('INSERT INTO chapters (id,story_id,branch_id,idx,title,status,created_at) VALUES (?,?,?,1,?,?,?)')
    .run(c, id, b, s.chapterTitle ?? 'Chapter One', 'open', t);
  return { id, branchId: b, chapterId: c };
}

export const getStory = (id: string) => q('SELECT * FROM stories WHERE id = ?').get(id) as any;

/** The only ownership question, asked in one place. Postgres would do this with RLS;
 *  on SQLite it is a gate in the dispatcher plus the scoped writes below, because
 *  per-handler discipline is exactly the thing that gets forgotten. */
export const ownsStory = (storyId: string, ownerId: string) =>
  !!q('SELECT 1 FROM stories WHERE id = ? AND owner_id = ?').get(storyId, ownerId);
/** Reads follow the ACTIVE branch. Every one of these used to return rows from every branch
 *  at once, which is invisible while there is one branch and nonsense the moment there are two. */
export const activeBranchOf = (storyId: string): string => {
  const st = q('SELECT active_branch FROM stories WHERE id = ?').get(storyId) as any;
  if (st?.active_branch) return st.active_branch;
  const main = q('SELECT id FROM branches WHERE story_id = ? AND is_primary = 1').get(storyId) as any;
  return main?.id ?? '';
};
export const chapters = (id: string) => q(
  'SELECT * FROM chapters WHERE story_id = ? AND branch_id = ? ORDER BY idx')
  .all(id, activeBranchOf(id)) as any[];
const openChapterOf = (id: string) => q(
  'SELECT * FROM chapters WHERE story_id = ? AND branch_id = ? ORDER BY idx DESC LIMIT 1')
  .get(id, activeBranchOf(id)) as any;
export const passagesOf = (id: string) => q(
  'SELECT * FROM passages WHERE story_id = ? AND branch_id = ? AND selected = 1 ORDER BY ordinal')
  .all(id, activeBranchOf(id)) as any[];
export const entriesOf = (id: string) => q('SELECT * FROM entries WHERE story_id = ? ORDER BY rowid').all(id) as any[];
export const branchesOf = (id: string) => q('SELECT * FROM branches WHERE story_id = ? ORDER BY created_at').all(id) as any[];

export function addPassage(p: any) {
  const id = uid('p-');
  const last = q('SELECT MAX(ordinal) AS m, MAX(slot_key) AS s FROM passages WHERE branch_id = ?')
    .get(p.branchId) as any;
  q(`INSERT INTO passages (id,chapter_id,story_id,branch_id,slot_key,ordinal,author,speaker,body,
      is_break,directive,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, p.chapterId, p.storyId, p.branchId, (last?.s ?? 0) + 1, (last?.m ?? 0) + 1,
      p.author ?? 'model', p.speaker ?? null, p.body, p.isBreak ? 1 : 0, p.directive ?? null, now());
  touch(p.storyId);
  return id;
}

/** Regenerate writes a NEW variant into the same slot and deletes nothing (SPEC §9).
 *  Write order matters: unset the incumbent first, then insert. The partial unique index
 *  on (branch_id, ordinal) WHERE selected is not deferrable. */
export function addVariant(storyId: string, passageId: string, body: string, author = 'model') {
  const cur = q('SELECT * FROM passages WHERE id = ? AND story_id = ?').get(passageId, storyId) as any;
  if (!cur) return null;
  const n = (q('SELECT MAX(variant_index) AS m FROM passages WHERE chapter_id = ? AND slot_key = ?')
    .get(cur.chapter_id, cur.slot_key) as any)?.m ?? 0;
  const id = uid('p-');
  db.exec('BEGIN');
  try {
    q('UPDATE passages SET selected = 0 WHERE chapter_id = ? AND slot_key = ?').run(cur.chapter_id, cur.slot_key);
    q(`INSERT INTO passages (id,chapter_id,story_id,branch_id,slot_key,ordinal,variant_index,selected,
        author,speaker,body,is_break,created_at) VALUES (?,?,?,?,?,?,?,1,?,?,?,0,?)`)
      .run(id, cur.chapter_id, cur.story_id, cur.branch_id, cur.slot_key, cur.ordinal,
        n + 1, author, cur.speaker, body, now());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(cur.story_id);
  return id;
}

/** Every take in the story, grouped by slot. `view()` renders "2 of 3" on every passage and
 *  runs on every mutation; calling variantsOf() per passage was 2N+1 queries per keystroke. */
export function variantsBySlot(storyId: string) {
  const rows = q(`SELECT id, chapter_id, slot_key, variant_index, selected
                  FROM passages WHERE story_id = ? AND branch_id = ?
                  ORDER BY slot_key, variant_index`).all(storyId, activeBranchOf(storyId)) as any[];
  const map = new Map<string, { id: string; selected: boolean }[]>();
  for (const r of rows) {
    const k = `${r.chapter_id}:${r.slot_key}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push({ id: r.id, selected: !!r.selected });
  }
  return map;
}

/** Discarding the last selected variant is forbidden: a slot always has one (SPEC §6.1.5). */
export function selectVariant(storyId: string, passageId: string) {
  const cur = q('SELECT * FROM passages WHERE id = ? AND story_id = ?').get(passageId, storyId) as any;
  if (!cur) return;
  db.exec('BEGIN');
  try {
    q('UPDATE passages SET selected = 0 WHERE chapter_id = ? AND slot_key = ?').run(cur.chapter_id, cur.slot_key);
    q('UPDATE passages SET selected = 1 WHERE id = ?').run(passageId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(cur.story_id);
}

/** Hash of the prose a summary covers. Recomputed on read: if it no longer matches, the
 *  summary is stale and must not reach the prompt. SPEC §5 — a stale summary otherwise
 *  contradicts the prose in every later call, forever. */
export const proseHash = (bodies: string[]) =>
  createHash('sha256').update(bodies.join('\u0000')).digest('hex').slice(0, 32);

export const setSummary = (chapterId: string, summary: string, through: number, hash: string) =>
  q('UPDATE chapters SET summary=?, summary_covers_through=?, summary_hash=? WHERE id=?')
    .run(summary, through, hash, chapterId);

/** True when the covered prose has changed since the summary was written. */
export function summaryStale(chapter: any): boolean {
  if (!chapter.summary) return false;
  if (!chapter.summary_hash) return true;
  return proseHash(passagesOfChapter(chapter.id).map((p: any) => p.body)) !== chapter.summary_hash;
}

export const passagesOfChapter = (chapterId: string) =>
  q('SELECT * FROM passages WHERE chapter_id = ? AND selected = 1 ORDER BY ordinal').all(chapterId) as any[];

export function editPassage(storyId: string, id: string, body: string) {
  const cur = q('SELECT body, story_id FROM passages WHERE id = ? AND story_id = ?')
    .get(id, storyId) as any;
  if (!cur) return;
  q('INSERT INTO passage_revisions (id,passage_id,body,replaced_at) VALUES (?,?,?,?)')
    .run(uid('pr-'), id, cur.body, now());
  q('UPDATE passages SET body = ? WHERE id = ?').run(body, id);
  // Flags quote the old text. Once it is edited they describe prose that no longer exists,
  // so they go rather than linger as wrong answers.
  q('DELETE FROM violations WHERE passage_id = ?').run(id);
  touch(cur.story_id);
}
/** Flags belong to the passage. SQLite will not cascade here — violations.passage_id has no
 *  foreign key, because a flag can outlive the variant it was raised against — so the delete
 *  is explicit. Without it, deleting a passage left its flags on screen forever. */
export function delPassage(storyId: string, id: string) {
  q('DELETE FROM violations WHERE passage_id = ? AND story_id = ?').run(id, storyId);
  q('DELETE FROM passages WHERE id = ? AND story_id = ?').run(id, storyId);
}

/** Sweep flags whose passage is gone, or which no longer clear the confidence floor. */
export const pruneViolations = (floor = 0.6) => q(
  `DELETE FROM violations WHERE passage_id NOT IN (SELECT id FROM passages)
      OR confidence IS NULL OR confidence < ?`).run(floor).changes;

export function upsertEntry(storyId: string, o: string, e: any) {
  const t = now();
  // Defaults once, before either branch. The update path previously had none, so a partial
  // edit bound undefined and threw at the driver instead of failing usefully.
  e = {
    ...e,
    title: e.title ?? 'Untitled',
    body: e.body ?? '',
    entryType: e.entryType ?? 'character',
    activation: e.activation ?? 'always_on',
    keys: Array.isArray(e.keys) ? e.keys.filter(Boolean) : [],
    lastEditor: e.lastEditor ?? 'human',
  };
  // Branch on whether the ROW exists, not on whether an id was passed. Seeding with a
  // known id previously took the UPDATE path against a row that was never inserted and
  // silently wrote nothing.
  const cur = e.id ? q('SELECT * FROM entries WHERE id = ? AND story_id = ?').get(e.id, storyId) as any : null;
  if (cur) {
    // Per-field provenance, recorded per field rather than described in a comment.
    const editors = { ...JSON.parse(cur.field_editors || '{}') };
    for (const [col, val] of [['title', e.title], ['body', e.body], ['keys', JSON.stringify(e.keys)]]) {
      if (cur[col] === val) continue;
      q('INSERT INTO entry_revisions (id,entry_id,field,previous_value,replaced_at,replaced_by) VALUES (?,?,?,?,?,?)')
        .run(uid('er-'), e.id, col, cur[col], t, e.lastEditor);
      editors[col as string] = e.lastEditor;
    }
    q(`UPDATE entries SET title=?,body=?,notes=?,entry_type=?,activation=?,keys=?,last_editor=?,
       field_editors=?,updated_at=? WHERE id=? AND story_id=?`)
      .run(e.title, e.body, e.notes ?? cur.notes ?? null, e.entryType, e.activation,
        JSON.stringify(e.keys), e.lastEditor, JSON.stringify(editors), t, e.id, storyId);
    touch(storyId); return e.id;
  }
  // Reuse a supplied id only if it is actually free. Seeding with known ids is useful; an
  // id that belongs to ANOTHER story reaches here because the scoped lookup above correctly
  // did not find it, and inserting with it would either collide or hijack. Mint a new one.
  const taken = e.id ? q('SELECT 1 FROM entries WHERE id = ?').get(e.id) : null;
  const id = (e.id && !taken) ? e.id : uid('e-');
  const born = JSON.stringify({ title: e.lastEditor, body: e.lastEditor, keys: e.lastEditor });
  q(`INSERT INTO entries (id,story_id,owner_id,title,body,notes,entry_type,activation,keys,
      last_editor,field_editors,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, storyId, o, e.title, e.body, e.notes ?? null, e.entryType, e.activation,
      JSON.stringify(e.keys), e.lastEditor, born, t, t);
  touch(storyId); return id;
}
export const delEntry = (storyId: string, id: string) =>
  q('DELETE FROM entries WHERE id = ? AND story_id = ?').run(id, storyId);

/** Manual chapter end. Closes the open chapter and opens the next. */
export function endChapter(storyId: string, branchId: string, nextTitle?: string) {
  const cur = openChapterOf(storyId);
  const maxOrd = (q('SELECT MAX(ordinal) AS m FROM passages WHERE branch_id = ?').get(branchId) as any)?.m ?? 0;
  if (cur) q("UPDATE chapters SET status='closed', summary_covers_through=? WHERE id=?").run(maxOrd, cur.id);
  const id = uid('c-'), idx = (cur?.idx ?? 0) + 1;
  q('INSERT INTO chapters (id,story_id,branch_id,idx,title,status,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, storyId, branchId, idx, nextTitle ?? `Chapter ${idx}`, 'open', now());
  touch(storyId);
  return { closed: cur?.id, opened: id, idx };
}

export function updateStory(id: string, s: any) {
  q(`UPDATE stories SET title=?,genre=?,premise=?,setting=?,pov=?,persona=?,writing_style=?,
      direction=?,spice=?,max_context=?,status=?,strip_patterns=?,updated_at=? WHERE id=?`)
    .run(s.title, s.genre, s.premise, s.setting, s.pov, s.persona ?? null, s.writingStyle,
      s.direction ?? null, s.spice, s.maxContext ?? null, s.status ?? 'in_progress',
      s.stripPatterns ?? null, now(), id);
}
export const updateChapter = (storyId: string, id: string, c: any) =>
  q('UPDATE chapters SET title=?, authors_note=?, keep_whole=? WHERE id=? AND story_id=?')
    .run(c.title, c.authorsNote ?? null, c.keepWhole ? 1 : 0, id, storyId);
export const delStory = (id: string, ownerId?: string) => ownerId
  ? q('DELETE FROM stories WHERE id = ? AND owner_id = ?').run(id, ownerId)
  : q('DELETE FROM stories WHERE id = ?').run(id);
const touch = (id: string) => q('UPDATE stories SET updated_at = ? WHERE id = ?').run(now(), id);

// ponytail: LIKE scan over every selected passage. Fine at this size, linear at chapter 40.
// Upgrade to FTS5 when it is measurably slow — an earlier revision created the table and never
// populated it, which was worse than not having it.
export const search = (o: string, term: string) => q(`
  SELECT p.id, p.body, p.story_id, s.title AS story, c.idx AS chapter
  FROM passages p JOIN stories s ON s.id = p.story_id JOIN chapters c ON c.id = p.chapter_id
  WHERE s.owner_id = ? AND p.selected = 1 AND p.body LIKE ? ORDER BY p.ordinal LIMIT 40`)
  .all(o, `%${term}%`) as any[];

// ---- history & revert ----
export const passageHistory = (storyId: string, id: string) => q(
  `SELECT r.id, r.body, r.replaced_at FROM passage_revisions r JOIN passages p ON p.id = r.passage_id
   WHERE r.passage_id = ? AND p.story_id = ? ORDER BY r.replaced_at DESC`).all(id, storyId) as any[];
export const entryHistory = (storyId: string, id: string) => q(
  `SELECT r.id, r.field, r.previous_value, r.replaced_at, r.replaced_by
   FROM entry_revisions r JOIN entries e ON e.id = r.entry_id
   WHERE r.entry_id = ? AND e.story_id = ? ORDER BY r.replaced_at DESC`).all(id, storyId) as any[];

/** Restoring is an edit, so the current text is itself kept. Nothing is ever lost. */
export function revertPassage(storyId: string, passageId: string, revisionId: string) {
  const rev = q(`SELECT r.body FROM passage_revisions r JOIN passages p ON p.id = r.passage_id
                 WHERE r.id = ? AND r.passage_id = ? AND p.story_id = ?`)
    .get(revisionId, passageId, storyId) as any;
  if (!rev) return false;
  editPassage(storyId, passageId, rev.body);
  return true;
}
export function revertEntryField(storyId: string, entryId: string, revisionId: string) {
  // Was unscoped: holding your OWN story id was enough to rewrite another owner's entry,
  // because the gate checks the story in the body and this took neither.
  const rev = q(`SELECT r.field, r.previous_value FROM entry_revisions r
                 JOIN entries e ON e.id = r.entry_id
                 WHERE r.id = ? AND r.entry_id = ? AND e.story_id = ?`)
    .get(revisionId, entryId, storyId) as any;
  if (!rev) return false;
  const cur = q('SELECT * FROM entries WHERE id = ? AND story_id = ?').get(entryId, storyId) as any;
  if (!cur) return false;
  q('INSERT INTO entry_revisions (id,entry_id,field,previous_value,replaced_at,replaced_by) VALUES (?,?,?,?,?,?)')
    .run(uid('er-'), entryId, rev.field, cur[rev.field], now(), 'human');
  // The column name is interpolated, so it is whitelisted rather than trusted — the value
  // comes from our own rows today, but a column name can never be a bound parameter.
  if (!['title', 'body', 'keys', 'notes'].includes(rev.field)) return false;
  q(`UPDATE entries SET ${rev.field} = ?, updated_at = ? WHERE id = ? AND story_id = ?`)
    .run(rev.previous_value, now(), entryId, storyId);
  return true;
}

// ---- backup ----
/** VACUUM INTO writes a clean, consistent snapshot in one statement — no lock dance,
 *  no partial file. Keeps the newest `keep` and prunes the rest. */
export function backup(dir = join(dirname(FILE), 'backups'), keep = 12) {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(dir, `anansi-${stamp}.db`);
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  const old = readdirSync(dir).filter((f) => f.endsWith('.db')).sort().reverse().slice(keep);
  for (const f of old) { try { unlinkSync(join(dir, f)); } catch { /* already gone */ } }
  return { file: out, bytes: statSync(out).size, pruned: old.length };
}

/** One story as a standalone database, safe to hand to someone else.
 *
 *  Copies the whole file and then deletes everything that is not this story, rather than
 *  listing the fourteen tables to copy. The schema's own ON DELETE CASCADE does the pruning,
 *  so a table added later is handled without touching this function — and the three history
 *  tables carry no story_id, so a hand-written list would have been the thing that silently
 *  leaked them. Stories go before users: stories.owner_id has no CASCADE, so deleting the
 *  other users first would fail the constraint. */
export function exportStory(storyId: string, ownerId: string, dir = join(dirname(FILE), 'exports')) {
  if (!ownsStory(storyId, ownerId)) throw new Error('no such story');
  const story = q('SELECT title FROM stories WHERE id = ?').get(storyId) as any;
  mkdirSync(dir, { recursive: true });
  const slug = String(story.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'story';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(dir, `${slug}-${stamp}.db`);
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  const copy = new DatabaseSync(out);
  try {
    copy.exec('PRAGMA foreign_keys = ON;');
    copy.prepare('DELETE FROM stories WHERE id != ?').run(storyId);
    copy.prepare('DELETE FROM users WHERE id != ?').run(ownerId);
    copy.exec('VACUUM;');
  } finally { copy.close(); }
  return { file: out, bytes: statSync(out).size, title: story.title };
}

// ---- branches: copy-on-write ----
/** Fork the story at an ordinal.
 *
 *  SPEC §6.2: duplicate the rows rather than sharing them. `selected` is one boolean on a
 *  passage, so a shared row means regenerating inside a fork rewrites the parent — which is
 *  the incoherence COUNCIL-01's lens 4 broke revision 2 on. Duplication is a one-time cost at
 *  this scale and every read afterwards is WHERE branch_id = ?.
 *
 *  What is copied: chapters up to the fork, the SELECTED passage of each slot up to the fork,
 *  the pins on those chapters, and any arc wholly inside the range.
 *  What is not: canon (story-scoped, deliberately shared — a fact is true on every path),
 *  discarded variants, revision history, flags and generations. Those belong to the passages
 *  they were raised against, and the fork's passages are new rows.
 */
export function forkBranch(storyId: string, fromBranchId: string, atOrdinal: number, name: string) {
  const parent = q('SELECT * FROM branches WHERE id = ? AND story_id = ?')
    .get(fromBranchId, storyId) as any;
  if (!parent) return null;
  const id = uid('b-'), t = now();
  const chapterMap = new Map<string, string>();
  db.exec('BEGIN');
  try {
    q('INSERT INTO branches (id,story_id,parent_id,name,fork_ordinal,is_primary,created_at) VALUES (?,?,?,?,?,0,?)')
      .run(id, storyId, fromBranchId, name || 'a second path', atOrdinal, t);

    const chapters = q(`SELECT * FROM chapters WHERE story_id = ? AND branch_id = ?
                        ORDER BY idx`).all(storyId, fromBranchId) as any[];
    for (const ch of chapters) {
      const lowest = q(`SELECT MIN(ordinal) AS m FROM passages WHERE chapter_id = ? AND selected = 1`)
        .get(ch.id) as any;
      if (lowest?.m != null && lowest.m > atOrdinal) continue;   // chapter starts after the fork
      const nid = uid('c-');
      chapterMap.set(ch.id, nid);
      q(`INSERT INTO chapters (id,story_id,branch_id,idx,title,authors_note,summary,summary_tokens,
          summary_covers_through,summary_hash,status,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(nid, storyId, id, ch.idx, ch.title, ch.authors_note, ch.summary, ch.summary_tokens,
          ch.summary_covers_through, ch.summary_hash, 'open', t);
    }

    for (const p2 of q(`SELECT * FROM passages WHERE story_id = ? AND branch_id = ? AND selected = 1
                        AND ordinal <= ? ORDER BY ordinal`).all(storyId, fromBranchId, atOrdinal) as any[]) {
      const nch = chapterMap.get(p2.chapter_id);
      if (!nch) continue;
      q(`INSERT INTO passages (id,chapter_id,story_id,branch_id,slot_key,ordinal,variant_index,
          selected,author,speaker,body,is_break,directive,created_at)
         VALUES (?,?,?,?,?,?,0,1,?,?,?,?,?,?)`)
        .run(uid('p-'), nch, storyId, id, p2.slot_key, p2.ordinal, p2.author, p2.speaker,
          p2.body, p2.is_break, p2.directive, t);
    }

    for (const [oldCh, newCh] of chapterMap)
      for (const pin of q('SELECT * FROM chapter_pins WHERE chapter_id = ?').all(oldCh) as any[])
        q('INSERT INTO chapter_pins (chapter_id,entry_id,story_id,mode,created_at) VALUES (?,?,?,?,?)')
          .run(newCh, pin.entry_id, storyId, pin.mode, t);

    const maxIdx = Math.max(0, ...[...chapterMap.keys()]
      .map((k) => (chapters.find((c) => c.id === k)?.idx ?? 0)));
    for (const a of q('SELECT * FROM arcs WHERE story_id = ? AND branch_id = ?')
      .all(storyId, fromBranchId) as any[])
      if (a.to_chapter <= maxIdx)
        q(`INSERT INTO arcs (id,story_id,branch_id,from_chapter,to_chapter,title,summary,created_at)
           VALUES (?,?,?,?,?,?,?,?)`)
          .run(uid('a-'), storyId, id, a.from_chapter, a.to_chapter, a.title, a.summary, t);

    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(storyId);
  return id;
}

export function setActiveBranch(storyId: string, branchId: string) {
  const b = q('SELECT 1 FROM branches WHERE id = ? AND story_id = ?').get(branchId, storyId);
  if (!b) return false;
  q('UPDATE stories SET active_branch = ? WHERE id = ?').run(branchId, storyId);
  return true;
}
export function deleteBranch(storyId: string, branchId: string) {
  const b = q('SELECT * FROM branches WHERE id = ? AND story_id = ?').get(branchId, storyId) as any;
  if (!b || b.is_primary) return false;          // the trunk is not removable
  const st = q('SELECT active_branch FROM stories WHERE id = ?').get(storyId) as any;
  if (st?.active_branch === branchId) {
    const main = q('SELECT id FROM branches WHERE story_id = ? AND is_primary = 1').get(storyId) as any;
    q('UPDATE stories SET active_branch = ? WHERE id = ?').run(main?.id ?? null, storyId);
  }
  q('DELETE FROM branches WHERE id = ?').run(branchId);
  return true;
}

// ---- arcs: the act-level tier ----
export const arcsOf = (storyId: string) => q(
  'SELECT * FROM arcs WHERE story_id = ? AND branch_id = ? ORDER BY from_chapter')
  .all(storyId, activeBranchOf(storyId)) as any[];
export function addArc(storyId: string, a: any) {
  const id = uid('a-');
  q(`INSERT INTO arcs (id,story_id,branch_id,from_chapter,to_chapter,title,summary,created_at)
     VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, storyId, a.branchId, a.fromChapter, a.toChapter, a.title ?? null, a.summary, now());
  return id;
}
export const delArc = (storyId: string, id: string) =>
  q('DELETE FROM arcs WHERE id = ? AND story_id = ?').run(id, storyId);

// ---- chapter pins ----
export const pinsOf = (storyId: string) =>
  q('SELECT * FROM chapter_pins WHERE story_id = ?').all(storyId) as any[];
export function setPin(storyId: string, chapterId: string, entryId: string, mode: string | null) {
  if (!mode) {
    q(`DELETE FROM chapter_pins WHERE chapter_id = ? AND entry_id = ? AND story_id = ?`)
      .run(chapterId, entryId, storyId);
    return true;
  }
  // The composite FKs refuse a chapter or entry from another story. That is the intended
  // outcome, but a raw constraint error is not a useful answer to give a caller.
  try {
    q(`INSERT INTO chapter_pins (chapter_id,entry_id,story_id,mode,created_at) VALUES (?,?,?,?,?)
       ON CONFLICT(chapter_id,entry_id) DO UPDATE SET mode = excluded.mode`)
      .run(chapterId, entryId, storyId, mode, now());
    return true;
  } catch { return false; }
}

// ---- violations ----
export function addViolation(storyId: string, v: any) {
  q(`INSERT INTO violations (id,story_id,passage_id,entry_id,quote,reason,confidence,created_at)
     VALUES (?,?,?,?,?,?,?,?)`).run(uid('v-'), storyId, v.passageId, v.entryId ?? null,
    v.quote ?? null, v.reason ?? null, v.confidence ?? null, now());
}
export const violationsOf = (storyId: string) => q(
  "SELECT * FROM violations WHERE story_id = ? AND status = 'open' ORDER BY created_at DESC")
  .all(storyId) as any[];
export const clearViolations = (passageId: string) =>
  q('DELETE FROM violations WHERE passage_id = ?').run(passageId);
export const setViolationStatus = (storyId: string, id: string, status: string) =>
  q('UPDATE violations SET status = ? WHERE id = ? AND story_id = ?').run(status, id, storyId);

// ---- canon over time ----
export const statesForStory = (storyId: string) => {
  const rows = q(`SELECT s.* FROM entry_states s JOIN entries e ON e.id = s.entry_id
                  WHERE e.story_id = ? ORDER BY s.entry_id, s.from_chapter`).all(storyId) as any[];
  const map = new Map<string, any[]>();
  for (const r of rows) (map.get(r.entry_id) ?? map.set(r.entry_id, []).get(r.entry_id)!).push(r);
  return map;
};
export function upsertState(storyId: string, entryId: string, st: any) {
  // The entry must belong to this story, or a state can be hung off someone else's canon.
  if (!q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(entryId, storyId)) return null;
  if (st.id) {
    // The entry is scoped above; the STATE was not, so a foreign state id could be
    // overwritten while still attached to its owner's entry.
    q(`UPDATE entry_states SET from_chapter=?, body=?, before_mode=?, label=?
       WHERE id=? AND entry_id=?`)
      .run(st.fromChapter, st.body, st.beforeMode ?? 'hide', st.label ?? null, st.id, entryId);
    return st.id;
  }
  const id = uid('st-');
  q('INSERT INTO entry_states (id,entry_id,from_chapter,body,before_mode,label,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, entryId, st.fromChapter, st.body, st.beforeMode ?? 'hide', st.label ?? null, now());
  return id;
}
export const delState = (storyId: string, id: string) => q(
  `DELETE FROM entry_states WHERE id = ? AND entry_id IN (SELECT id FROM entries WHERE story_id = ?)`)
  .run(id, storyId);

// ---- extraction proposals ----
/** Nothing here is canon. Screen 28: "1 new · 2 changed · 1 conflict · nothing is canon yet."
 *  A conflict is specifically a model proposal against a body a human pinned — the arbitration
 *  rule keys on provenance, so those never auto-apply and never bulk-accept. */
export function addProposal(storyId: string, p: any) {
  // Hash the SUBJECT, not the wording. The model rewords the same fact on every run, so
  // hashing the body meant re-running always duplicated.
  const subject = String(p.title).toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(the|a|an) /, '');
  const hash = createHash('sha256')
    .update([subject, p.entry_id ?? ''].join('\u0000')).digest('hex').slice(0, 32);
  try {
    q(`INSERT INTO proposals (id,story_id,chapter_id,entry_id,title,body,entry_type,keys,kind,delta,
        content_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uid('pp-'), storyId, p.chapterId ?? null, p.entry_id ?? null, p.title, p.body,
        p.entryType ?? 'lore', JSON.stringify(p.keys ?? []), p.kind, p.delta ?? null, hash, now());
    return true;
  } catch { return false; }   // unique index: already proposed, not an error
}
export const proposalsOf = (storyId: string) => q(
  "SELECT * FROM proposals WHERE story_id = ? AND status = 'open' ORDER BY created_at").all(storyId) as any[];
export const proposal = (storyId: string, id: string) =>
  q('SELECT * FROM proposals WHERE id = ? AND story_id = ?').get(id, storyId) as any;
export const setProposalStatus = (storyId: string, id: string, status: string) =>
  q('UPDATE proposals SET status = ? WHERE id = ? AND story_id = ?').run(status, id, storyId);

/** What the model has actually been doing. PLAN-02 §7.2's budget-engine trigger is stated in
 *  terms of prefill time and prefix churn, and neither is knowable until something reads this. */
export const recentGenerations = (storyId: string, limit = 40) => q(
  `SELECT id, role, model, prompt_tokens, completion_tokens, latency_ms, timings, error, created_at
   FROM generations WHERE story_id = ? ORDER BY created_at DESC LIMIT ?`).all(storyId, limit) as any[];

export function logGeneration(g: any) {
  q(`INSERT INTO generations (id,story_id,chapter_id,passage_id,model,role,params,manifest,
      prompt_tokens,completion_tokens,timings,latency_ms,error,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uid('g-'), g.storyId ?? null, g.chapterId ?? null, g.passageId ?? null, g.model ?? null,
      g.role ?? 'prose', JSON.stringify(g.params ?? {}), JSON.stringify(g.manifest ?? {}),
      g.promptTokens ?? null, g.completionTokens ?? null, JSON.stringify(g.timings ?? {}),
      g.latencyMs ?? null, g.error ?? null, now());
  // SPEC §11 keeps the row and drops the manifest after 90 days. Same idea, simpler: the
  // manifest is only useful while debugging a recent call, so keep the newest 200 and null
  // the rest. Each manifest is ~3 KB, so unbounded is a slow leak, not a fast one.
  q(`UPDATE generations SET manifest = NULL WHERE id IN (
       SELECT id FROM generations WHERE manifest IS NOT NULL
       ORDER BY created_at DESC LIMIT -1 OFFSET 200)`).run();
}
