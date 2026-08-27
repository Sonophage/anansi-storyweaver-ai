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
import { createHash, randomBytes } from 'node:crypto';
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
  // A spice LEVEL picks one of five fixed lines. This replaces the line outright when a
  // story needs something the five do not say.
  add('stories', 'spice_note', 'TEXT');
  // A take you regenerated away from. Recorded, not yet fed to the model — see the ponytail
  // marker on `rejectTake`.
  add('passages', 'rejected', 'INTEGER DEFAULT 0');
  // Which model writes this story. Null means the process default — most stories, most of the
  // time. The router runs --models-max 3 --models-autoload, so a story on a different model
  // usually costs nothing to switch to; one that is asleep costs a load on its first call.
  add('stories', 'model', 'TEXT');
  // A book's own look, layered OVER the writer's default rather than replacing it: a story that
  // names only a theme keeps your font, your size and your scale. Null on every existing row,
  // which reads as "follow the default" — so nothing on the shelf changes appearance.
  add('stories', 'look', 'TEXT');
  // Whether the cover is also the plate at the head of every chapter. OFF by default, including on
  // every book that already has a cover: a picture at the head of each chapter is a strong choice
  // about how a book reads, and turning it on for existing books without asking would be making
  // that choice for somebody. There is no second image — it is the cover or nothing, which is what
  // Seth asked for: "the chapter image would only pull from the hero so story and chapter share
  // the same image."
  add('stories', 'chapter_hero', 'INTEGER DEFAULT 0');
  // The character the model must not write: no dialogue, no action, no interior. Null on every
  // story until somebody names one, which keeps the behaviour of every existing book unchanged.
  // A NAME rather than an entry id, because it also has to work for a protagonist who has no
  // ledger entry — plenty of second-person books never gave "you" one.
  add('stories', 'locked_character', 'TEXT');
  // Whether the model writes the opening passage of a story and of every chapter after it, or
  // whether the writer does. ON by default, including for every book already on the shelf: a first
  // passage you did not want is one press to delete, and a blank page you expected to be filled is
  // a feature you never find. Per STORY rather than per writer, because "start me off" is a
  // decision about a book — some you want a way in to, some you have already heard the first line of.
  //
  // Nothing is generated server-side for it. The surface reads this and fires the Continue it
  // already has, so the opening streams through the one generate path with its budget check, its
  // contradiction repair and its writing head, rather than arriving whole from a second engine
  // that would need all three again.
  add('stories', 'auto_open', 'INTEGER DEFAULT 1');
  // Existing flags were all raised against canon that had fired — that was the only kind the
  // checker could see — so the default of 1 is true for every row already stored.
  add('violations', 'reached', 'INTEGER DEFAULT 1');
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
  locked_character TEXT,     -- the one the model never writes. See migrate().
  writing_style TEXT, direction TEXT, spice INTEGER DEFAULT 2,
 strip_patterns TEXT, max_context INTEGER,
  status TEXT DEFAULT 'in_progress',   -- in_progress | finished | draft
  active_branch TEXT,                  -- which path you are writing on
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS prompt_overrides (
  owner_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,                   -- a mode name: continue | speak | act | direct | narrate
  text TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, key));

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
 directive TEXT, created_at INTEGER NOT NULL);
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
  -- ponytail: priority is stored and ignored — it needs the budget engine to mean anything
  -- (SPEC §7.3/§7.5). sticky_for and proper_nouns ARE read: context.ts folds around
  -- properNouns and holds an entry open for stickyFor passages after it last fired. This
  -- comment claimed all three were dead until 2026-08-27; two of them had not been for weeks.
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

CREATE TABLE IF NOT EXISTS strings (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,                               -- what was promised, in the writer's words
  from_chapter INTEGER,                    -- where the promise was made
  owed_by INTEGER,                         -- the chapter it should be paid by, if there is one
  status TEXT DEFAULT 'open',              -- open | paid | dropped
  summoned INTEGER DEFAULT 0,              -- only a summoned string reaches the prompt
  created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS strings_s ON strings(story_id, status);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  chapter_id TEXT, entry_id TEXT,          -- set when this proposes a change to an existing entry
  title TEXT NOT NULL, body TEXT NOT NULL, entry_type TEXT, keys TEXT DEFAULT '[]',
  kind TEXT NOT NULL,                      -- new | changed | conflict | memory
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
  -- Whether the entry it contradicts actually REACHED the prompt for that passage. The two are
  -- different faults and want different fixes: 1 is the model contradicting what it was told,
  -- 0 is the engine never having told it. See check() in routes.ts.
  reached INTEGER DEFAULT 1,
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

-- Named outfits, switchable. PLAN-04 04 chose these over a single "right now" line. Deliberately
-- NOT entry_states: states are anchored to a chapter, which is the right axis for "the debt
-- transfers in chapter seven" and the wrong one for "she puts the plate on and takes it off".
-- Story-scoped so the ownership gate reaches it; the partial unique index is what enforces
-- exactly one worn at a time, in SQL rather than in application code that can be bypassed.
CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS outfits_one_active ON outfits(entry_id) WHERE active = 1;
CREATE INDEX IF NOT EXISTS outfits_story ON outfits(story_id);

-- The cover, in the database rather than on disk, because the nightly backup is one file and a
-- path would leave every cover out of it. A SIDE TABLE and not a column on stories, which is the
-- one place this departs from what was agreed: listStories selects s.*, so a blob in that row
-- would be read off disk and handed to JS for every card on the shelf, on every paint. Here the
-- shelf asks only when the cover was set, and the bytes move when the image is requested.
-- Still the same one file, so the backup argument holds.
-- What a writer's app looks like when no book has said otherwise: theme, font, prose size, UI
-- scale. Per WRITER rather than per browser, which is where it lived until now — a phone and the
-- desk are the same person and were two unrelated sets of preferences, and a cleared browser was
-- a lost one. localStorage is still written, but only as a cache so the first paint has something
-- before any fetch answers.
--
-- One column of JSON rather than four columns, because these are read and written as a set and
-- nothing queries on them. A fifth setting is then a change to one surface, not a migration.
CREATE TABLE IF NOT EXISTS writer_look (
  owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  look TEXT NOT NULL,
  updated_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS story_covers (
  story_id TEXT PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  jpeg BLOB NOT NULL,
  set_at INTEGER NOT NULL);

`);

migrate();

const now = () => Date.now();
const uid = (p = '') => p + randomBytes(4).toString('hex');

/** Genre, normalised to a comma-separated list.
 *
 *  The shelf splits this on commas and draws one pill per tag, so a genre that arrives as
 *  "noir / gothic and horror" became one long pill. Applied on the way IN — on create and on every
 *  save, so an old row is fixed the next time its story is touched — because normalising on the way
 *  out would mean every reader had to remember to do it.
 *
 *  Splits on commas, semicolons, slashes and a standalone "and". NOT on spaces: "dark fantasy" is
 *  one genre, and a space-splitter turns it into two. */
export const tidyGenre = (g?: string | null): string =>
  [...new Map(String(g ?? '').split(/[,;/]|\band\b/i).map((t) => t.trim()).filter(Boolean)
    .map((t) => [t.toLowerCase(), t])).values()].join(', ');
const q = (sql: string) => db.prepare(sql);

export function owner(login = 'sonophage'): string {
  const row = q('SELECT id FROM users WHERE login = ?').get(login) as any;
  if (row) return row.id;
  const id = uid('u-');
  q('INSERT INTO users (id, login, name, created_at) VALUES (?,?,?,?)').run(id, login, login, now());
  return id;
}

/** The account name behind an owner id. The reports and anything else that has to SAY who did
 *  something need the login rather than the id, which means nothing to a human reading it later. */
export const loginOf = (ownerId: string): string | null =>
  (q('SELECT login FROM users WHERE id = ?').get(ownerId) as any)?.login ?? null;

/** The shelf, and what is waiting in each book on it.
 *
 *  The three `waiting` counts are the reason this grew: everything a writer left half-done lives
 *  INSIDE a story — a proposal not accepted, a promise not paid, a flag not looked at — and from the
 *  shelf all of it was invisible. Counted per story rather than as one total, so the strip can send
 *  you to the book it is about rather than making you go and look.
 *
 *  ponytail: three correlated subqueries per row. At a shelf of a dozen books that is nothing; if
 *  this ever gets slow the fix is one grouped join per table rather than a cache. */
export const listStories = (o: string) => q(`
  SELECT s.*, (SELECT COUNT(*) FROM passages p WHERE p.story_id = s.id AND p.selected = 1) AS passages,
         (SELECT COUNT(*) FROM chapters c WHERE c.story_id = s.id) AS chapters,
         (SELECT COUNT(*) FROM entries e WHERE e.story_id = s.id) AS entries,
         (SELECT COUNT(*) FROM proposals pr WHERE pr.story_id = s.id AND pr.status = 'open') AS proposed,
         (SELECT COUNT(*) FROM strings st WHERE st.story_id = s.id AND st.status = 'open') AS unpaid,
         (SELECT COUNT(*) FROM violations v JOIN passages p ON p.id = v.passage_id
           WHERE v.story_id = s.id AND v.status = 'open' AND p.selected = 1) AS flags,
         (SELECT sc.set_at FROM story_covers sc WHERE sc.story_id = s.id) AS cover
  FROM stories s WHERE s.owner_id = ? ORDER BY s.updated_at DESC`).all(o);

export function createStory(o: string, s: any) {
  const id = uid('s-'), b = uid('b-'), c = uid('c-'), t = now();
  // spice_note, model and locked_character are here so that an imported story arrives whole.
  // Import reads them out of the export; without them on this INSERT they were read and then
  // dropped on the floor, which is a round trip that looks like it works.
  q(`INSERT INTO stories (id,owner_id,title,genre,premise,setting,pov,persona,writing_style,
      direction,spice,spice_note,max_context,model,locked_character,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, o, s.title ?? 'Untitled', tidyGenre(s.genre),
    s.premise ?? '', s.setting ?? '', s.pov ?? 'second person, present tense', s.persona ?? null,
    s.writingStyle ?? '', s.direction ?? null, s.spice ?? 2, s.spiceNote ?? null,
    s.maxContext ?? null, s.model ?? null, s.lockedCharacter ?? null,
    s.status ?? 'in_progress', t, t);
  q('INSERT INTO branches (id,story_id,name,is_primary,created_at) VALUES (?,?,?,1,?)').run(b, id, 'main', t);
  q('INSERT INTO chapters (id,story_id,branch_id,idx,title,status,created_at) VALUES (?,?,?,1,?,?,?)')
    .run(c, id, b, s.chapterTitle ?? 'Chapter One', 'open', t);
  return { id, branchId: b, chapterId: c };
}

export const getStory = (id: string) => q('SELECT * FROM stories WHERE id = ?').get(id) as any;

/** The cover. Ownership is the dispatcher's gate, not this function's: every route that reaches
 *  here names a story, so it is checked before the handler runs. */
export const getCover = (id: string) =>
  (q('SELECT jpeg FROM story_covers WHERE story_id = ?').get(id) as any)?.jpeg ?? null;
/** When the cover was set, or null. It is the cache key as well as the answer to "is there one":
 *  the surface asks for `/api/cover?story=…&v=<this>`, which is immutable for that value, so a
 *  cover is fetched once per change rather than once per paint of the shelf. */
export const coverAt = (id: string): number | null =>
  (q('SELECT set_at FROM story_covers WHERE story_id = ?').get(id) as any)?.set_at ?? null;
export function setCover(id: string, jpeg: Uint8Array) {
  q(`INSERT INTO story_covers (story_id, jpeg, set_at) VALUES (?,?,?)
     ON CONFLICT(story_id) DO UPDATE SET jpeg = excluded.jpeg, set_at = excluded.set_at`)
    .run(id, jpeg, now());
}
export const delCover = (id: string) => { q('DELETE FROM story_covers WHERE story_id = ?').run(id); };

/** The writer's default look, or null. */
/** How many books, ANY writer's, are pinned to this model. `modelFor` puts the story ahead of the
 *  writer's default, so a book naming a model is a book that will load it on its next call —
 *  releasing it out from under one is a cold load somebody did not ask for. */
export const storiesOnModel = (model: string): number =>
  (q('SELECT COUNT(*) AS c FROM stories WHERE model = ?').get(model) as any).c;

export const lookOf = (ownerId: string): any => {
  const r = q('SELECT look FROM writer_look WHERE owner_id = ?').get(ownerId) as any;
  try { return r ? JSON.parse(r.look) : null; } catch { return null; }
};
export function setLook(ownerId: string, look: any) {
  q(`INSERT INTO writer_look (owner_id, look, updated_at) VALUES (?,?,?)
     ON CONFLICT(owner_id) DO UPDATE SET look = excluded.look, updated_at = excluded.updated_at`)
    .run(ownerId, JSON.stringify(look ?? {}), now());
}
/** A story's own look, or null for "follow the writer's default". Null is a real answer and the
 *  way a book is put back to following it, so this takes null rather than needing a delete. */
export function setStoryLook(storyId: string, ownerId: string, look: any) {
  // Scoped write. `POST /api/look` is on the OPEN list, so the dispatcher's gate never runs for
  // it — belt to the handler's braces, and the pattern every open route here follows.
  q('UPDATE stories SET look = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .run(look == null ? null : JSON.stringify(look), now(), storyId, ownerId);
}

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

/** Every entry this owner has, with the story it belongs to. The Worlds page groups by story
 *  and searches across all of them — 'in case we forget what story a certain entry belongs to'. */
export const ledgerOf = (ownerId: string) => q(`
  SELECT e.*, s.title AS story_title, s.id AS story
  FROM entries e JOIN stories s ON s.id = e.story_id
  WHERE s.owner_id = ? ORDER BY s.updated_at DESC, e.rowid`).all(ownerId) as any[];
export const branchesOf = (id: string) => q('SELECT * FROM branches WHERE story_id = ? ORDER BY created_at').all(id) as any[];

/** Append a passage to the END OF ITS CHAPTER, not the end of the book.
 *
 *  Ordinals are per branch and were assigned from MAX(ordinal) over the whole branch. Writing into
 *  any chapter but the last therefore placed the new passage after every later chapter, and the
 *  document and the prompt then disagreed about the order of the book: `drawDoc` groups by chapter
 *  and showed it inside chapter one, while `passagesOf` orders by ordinal and the model read it
 *  after chapter two. Regeneration inherited the same fault, since `upTo` filters on ordinal.
 *
 *  Focusing an earlier chapter has always made it the chapter you write into — that is deliberate,
 *  it is how you revise chapter three with chapter three's context — so this was reachable before
 *  the document was paged. Paging made it one click away.
 *
 *  The shift is two statements because `passages_sel` is UNIQUE(branch_id, ordinal) WHERE selected
 *  and is not deferrable: incrementing in place collides with the row above. Everything after the
 *  insertion point moves out to a range nothing occupies, then comes back one higher. */
export function addPassage(p: any) {
  const id = uid('p-');
  const slot = q('SELECT MAX(slot_key) AS s FROM passages WHERE branch_id = ?').get(p.branchId) as any;
  const mine = q('SELECT MAX(ordinal) AS m FROM passages WHERE branch_id = ? AND chapter_id = ?')
    .get(p.branchId, p.chapterId) as any;
  const branch = q('SELECT MAX(ordinal) AS m FROM passages WHERE branch_id = ?').get(p.branchId) as any;
  // An empty chapter takes the ordinal after the last passage of the chapter before it, which is
  // the chapter's own position in the book — not 1, which would collide with the opening.
  const prior = mine?.m ?? (q(`SELECT MAX(p.ordinal) AS m FROM passages p JOIN chapters c ON c.id = p.chapter_id
                                WHERE p.branch_id = ? AND c.idx < (SELECT idx FROM chapters WHERE id = ?)`)
                             .get(p.branchId, p.chapterId) as any)?.m ?? 0;
  const at = prior + 1;
  const tail = (branch?.m ?? 0) >= at;
  if (tail) {
    db.exec('BEGIN');
    try {
      const PARK = 1_000_000;
      q('UPDATE passages SET ordinal = ordinal + ? WHERE branch_id = ? AND ordinal >= ?')
        .run(PARK, p.branchId, at);
      q('UPDATE passages SET ordinal = ordinal - ? WHERE branch_id = ? AND ordinal >= ?')
        .run(PARK - 1, p.branchId, PARK);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  q(`INSERT INTO passages (id,chapter_id,story_id,branch_id,slot_key,ordinal,author,speaker,body,
      is_break,directive,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, p.chapterId, p.storyId, p.branchId, (slot?.s ?? 0) + 1, at,
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
    // The directive rides along, for the reason `speaker` already did: a take is another answer to
    // the same question. It was not even in this INSERT, so every reroll of a directed passage
    // produced an undirected row — the margin mark vanished and a second reroll had nothing left
    // to inherit.
    q(`INSERT INTO passages (id,chapter_id,story_id,branch_id,slot_key,ordinal,variant_index,selected,
        author,speaker,body,is_break,directive,created_at) VALUES (?,?,?,?,?,?,?,1,?,?,?,0,?,?)`)
      .run(id, cur.chapter_id, cur.story_id, cur.branch_id, cur.slot_key, cur.ordinal,
        n + 1, author, cur.speaker, body, cur.directive ?? null, now());
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
  const cur = q('SELECT chapter_id, slot_key, selected FROM passages WHERE id = ? AND story_id = ?')
    .get(id, storyId) as any;
  if (!cur) return;
  db.exec('BEGIN');
  try {
    q('DELETE FROM violations WHERE passage_id = ? AND story_id = ?').run(id, storyId);
    q('DELETE FROM passages WHERE id = ? AND story_id = ?').run(id, storyId);
    // Deleting the SELECTED take left the slot with no selected row at all, and every read of the
    // book — passagesOfChapter, view(), the context window — filters on selected = 1. So the other
    // takes stayed in the database and disappeared from the story, unreachable by any screen: the
    // ‹ › pager they lived behind is drawn from the passage that had just gone. Promote the newest
    // survivor instead. SPEC §6.1.5: a slot always has one.
    if (cur.selected) {
      const next = q(`SELECT id FROM passages WHERE chapter_id = ? AND slot_key = ?
                      ORDER BY variant_index DESC LIMIT 1`).get(cur.chapter_id, cur.slot_key) as any;
      if (next) q('UPDATE passages SET selected = 1 WHERE id = ?').run(next.id);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(storyId);
}

/** Every take in one slot, gone together.
 *
 *  delPassage removes ONE take and promotes the newest survivor, which is right — a slot always has
 *  one (SPEC 6.1.5). The cost is that deleting a passage you have rerolled four times takes five
 *  presses and looks, four times over, like the delete did nothing: the block is still there
 *  holding different words. This is the other intent, said outright. */
export function delSlot(storyId: string, id: string) {
  const cur = q('SELECT chapter_id, slot_key FROM passages WHERE id = ? AND story_id = ?')
    .get(id, storyId) as any;
  if (!cur) return 0;
  db.exec('BEGIN');
  try {
    const ids = (q('SELECT id FROM passages WHERE chapter_id = ? AND slot_key = ? AND story_id = ?')
      .all(cur.chapter_id, cur.slot_key, storyId) as any[]).map((r) => r.id);
    for (const pid of ids) q('DELETE FROM violations WHERE passage_id = ? AND story_id = ?').run(pid, storyId);
    q('DELETE FROM passages WHERE chapter_id = ? AND slot_key = ? AND story_id = ?')
      .run(cur.chapter_id, cur.slot_key, storyId);
    db.exec('COMMIT');
    touch(storyId);
    return ids.length;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** The instruction a passage was written to, if it had one. Story-scoped like every other read
 *  here: the gate proves the story, and a passage id is not a story id. */
export const passageDirective = (storyId: string, id: string): string | null =>
  (q('SELECT directive FROM passages WHERE id = ? AND story_id = ?').get(id, storyId) as any)?.directive ?? null;

/** Sweep flags whose passage is gone, or which no longer clear the confidence floor. */
export const pruneViolations = (floor = 0.6) => q(
  `DELETE FROM violations WHERE passage_id NOT IN (SELECT id FROM passages)
      OR confidence IS NULL OR confidence < ?`).run(floor).changes;

/** The writer's own wording for a mode, replacing the shipped one outright.
 *
 *  Per OWNER and not per story, which is what Seth asked for: "this would be global with a button
 *  to set it back to default". An empty or blank override is DELETED rather than stored, so
 *  clearing the box is the reset — there is no third state where a mode is overridden with nothing.
 */
export function setPrompt(owner: string, key: string, text: string) {
  const t = String(text ?? '').trim();
  if (!t) { q('DELETE FROM prompt_overrides WHERE owner_id = ? AND key = ?').run(owner, key); return null; }
  q(`INSERT INTO prompt_overrides (owner_id,key,text,updated_at) VALUES (?,?,?,?)
     ON CONFLICT(owner_id,key) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`)
    .run(owner, key, t, now());
  return t;
}

/** Every override this owner has, as { mode: text }. Empty object is the normal case. */
export const promptsOf = (owner: string): Record<string, string> =>
  Object.fromEntries((q('SELECT key, text FROM prompt_overrides WHERE owner_id = ?').all(owner) as any[])
    .map((r) => [r.key, r.text]));

/** Strings: the promises a story has made and not paid.
 *
 *  Deliberately NOT an entry. An entry resolves by keyword and is sent as canon; a string's whole
 *  point is that it stays true while nobody says it — the letter nobody has mentioned for fourteen
 *  chapters is the one most worth remembering. Bolting it onto entries would drop a promise out of
 *  the book exactly when it had been forgotten longest, which is backwards.
 */
export function upsertString(storyId: string, v: any) {
  const id = v.id && (q('SELECT 1 FROM strings WHERE id = ? AND story_id = ?').get(v.id, storyId))
    ? v.id : null;
  if (id) {
    q(`UPDATE strings SET title=?, body=?, from_chapter=?, owed_by=?, status=?, summoned=?
       WHERE id=? AND story_id=?`)
      .run(v.title ?? 'Untitled', v.body ?? '', v.fromChapter ?? null, v.owedBy ?? null,
        v.status ?? 'open', v.summoned ? 1 : 0, id, storyId);
    touch(storyId);
    return id;
  }
  const made = uid('st-');
  q(`INSERT INTO strings (id,story_id,title,body,from_chapter,owed_by,status,summoned,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(made, storyId, v.title ?? 'Untitled', v.body ?? '', v.fromChapter ?? null,
      v.owedBy ?? null, v.status ?? 'open', v.summoned ? 1 : 0, now());
  touch(storyId);
  return made;
}

export const stringsOf = (storyId: string) => q(
  'SELECT * FROM strings WHERE story_id = ? ORDER BY status = \'open\' DESC, from_chapter, created_at')
  .all(storyId) as any[];

export const delString = (storyId: string, id: string) =>
  q('DELETE FROM strings WHERE id = ? AND story_id = ?').run(id, storyId);

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
    // A story names its persona and its locked character BY TITLE, so a rename used to leave both
    // pointing at nobody: the byline read "You · " and the lockout stopped locking anyone. Carried
    // here because upsertEntry is the one place an entry's title can change.
    //
    // ponytail: title, not id. Id columns would be the general fix and they are 37 call sites, a
    // migration, and a walk through the prompt path that F28's lockout depends on — plus import.ts
    // sets persona from an external card's NAME before any entry exists. The ceiling of doing it
    // this way is two entries sharing a title in one story, which would both match; title is the
    // identity everywhere else here (classify resolves on it, proposals hash it), so that is a
    // consistent limit rather than a new one.
    if (cur.title !== e.title) {
      for (const col of ['persona', 'locked_character'])
        q(`UPDATE stories SET ${col} = ? WHERE id = ? AND ${col} = ?`).run(e.title, storyId, cur.title);
    }
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
/** Mark a take as one the writer regenerated away from. Regenerating already keeps the old take;
 *  this records that it was not merely superseded but rejected, which is a different fact.
 *
 *  ponytail: recorded and shown, NOT sent to the model. The obvious next step — putting "not like
 *  this" and the rejected text into the prompt — is a prompt change, and this project measures
 *  those rather than assuming them: F20 spent 850 runs per arm proving that restating canon does
 *  nothing at all. Feeding a rejected take is the same shape of claim and deserves the same bar.
 *  Until then the flag is for the writer's eyes, and History says which takes were passed over. */
export const rejectTake = (storyId: string, id: string) =>
  q('UPDATE passages SET rejected = 1 WHERE id = ? AND story_id = ?').run(id, storyId);

/** Tie a take to the call that made it. The manifest is logged at generation time, when no
 *  passage exists yet — so `passage_id` was always null and nothing connected a take to the canon
 *  it was written against. Regenerating makes this matter: two takes in one slot were written
 *  against different prompts, and there was no way to see which. */
export const tieGeneration = (genId: string, passageId: string) =>
  q('UPDATE generations SET passage_id = ? WHERE id = ? AND passage_id IS NULL').run(passageId, genId);

/** What canon was in the prompt that produced this take, newest call wins. Reads the stored
 *  manifest rather than recomputing: the point is what WAS sent, not what would be sent now. */
export const canonBehind = (storyId: string, passageId: string): string[] => {
  const row = q(`SELECT manifest FROM generations WHERE passage_id = ? AND story_id = ?
                 ORDER BY created_at DESC LIMIT 1`).get(passageId, storyId) as any;
  if (!row?.manifest) return [];
  try {
    const m = JSON.parse(row.manifest);
    // Entry IDS, not titles: the client names them from its own ledger, so renaming an entry
    // does not leave an old name frozen in a log. Kinds are CANON-ALWAYS and CANON-TRIGGERED.
    return (m.blocks ?? [])
      .filter((b: any) => b.state === 'included' && String(b.kind).startsWith('CANON'))
      .map((b: any) => String(b.id ?? '').trim()).filter(Boolean);
  } catch { return []; }
};

// ---- outfits ----

export const outfitsOf = (storyId: string) =>
  q('SELECT * FROM outfits WHERE story_id = ? ORDER BY created_at').all(storyId) as any[];

export function upsertOutfit(storyId: string, entryId: string, o: any) {
  // The composite lookup is the ownership check: an entry id from another story does not resolve
  // here, so it cannot have an outfit hung off it. Same shape as upsertState.
  const owns = q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(entryId, storyId);
  if (!owns) return null;
  const id = o.id || uid('o-');
  if (o.id && q('SELECT 1 FROM outfits WHERE id = ? AND story_id = ?').get(o.id, storyId)) {
    q('UPDATE outfits SET name = ?, body = ? WHERE id = ? AND story_id = ?')
      .run(o.name ?? '', o.body ?? '', o.id, storyId);
  } else {
    q('INSERT INTO outfits (id,entry_id,story_id,name,body,active,created_at) VALUES (?,?,?,?,?,0,?)')
      .run(id, entryId, storyId, o.name ?? 'Untitled', o.body ?? '', now());
  }
  touch(storyId);
  return id;
}

/** Wear one, or none. The unique index forbids two active on one character, so the unset has to
 *  happen first — the same write-order rule as selectVariant, and for the same reason: a partial
 *  unique index is not deferrable. Passing null takes everything off. */
export function wearOutfit(storyId: string, entryId: string, outfitId: string | null) {
  const owns = q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(entryId, storyId);
  if (!owns) return null;
  db.exec('BEGIN');
  try {
    q('UPDATE outfits SET active = 0 WHERE entry_id = ? AND story_id = ?').run(entryId, storyId);
    if (outfitId) q('UPDATE outfits SET active = 1 WHERE id = ? AND entry_id = ? AND story_id = ?')
      .run(outfitId, entryId, storyId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(storyId);
  return outfitId;
}

export const delOutfit = (storyId: string, id: string) =>
  q('DELETE FROM outfits WHERE id = ? AND story_id = ?').run(id, storyId);

/** Drop a persona or a locked character that names nobody in this story.
 *
 *  The wizard's whole point is choosing who you play from a cast that has not been written yet, so
 *  the name arrives before the entry does and there is a window where it can be wrong: the spark
 *  proposes it, the writer edits the cast, and the character they were going to play is gone. The
 *  same window exists on import, where persona comes from a stranger's card by name.
 *
 *  Only names in `proposed` are policed, and that limit is the whole correctness of this. A persona
 *  is a NAME and not an entry id ON PURPOSE — see the locked_character migration above — because a
 *  protagonist need not have a ledger entry at all, and plenty of second-person books never give
 *  "you" one. The first version of this policed every persona and wiped exactly those, which
 *  test/ui/hostile.js caught by creating a story whose persona names nobody and expecting it to
 *  survive. What the model proposed is fair game; what the writer typed is not.
 *
 *  Returns what it cleared, so a caller can say so rather than silently disagreeing with the form
 *  the writer just filled in. */
export function pinCast(storyId: string, proposed: string[] = []): string[] {
  if (!proposed.length) return [];
  const fromModel = new Set(proposed.map((s) => String(s)));
  const titles = new Set((q('SELECT title FROM entries WHERE story_id = ?').all(storyId) as any[])
    .map((r) => r.title));
  const cur = q('SELECT persona, locked_character FROM stories WHERE id = ?').get(storyId) as any;
  if (!cur) return [];
  const cleared: string[] = [];
  for (const [col, val] of [['persona', cur.persona], ['locked_character', cur.locked_character]]) {
    if (val && fromModel.has(val) && !titles.has(val)) {
      q(`UPDATE stories SET ${col} = NULL WHERE id = ?`).run(storyId);
      cleared.push(String(val));
    }
  }
  return cleared;
}

/** Copy one entry into another of the writer's own books.
 *
 *  Both stories are checked here and not only at the gate. The gate resolves ONE story id per
 *  request and this route names two, so the source would otherwise arrive unchecked — and the
 *  composite (id, story_id) lookup below is the second half of that: an entry id belonging to a
 *  third story must not resolve through a source story the caller does happen to own. `entries_scope`
 *  is the unique index that makes (id, story_id) the way to name an entry, and this is exactly the
 *  kind of read it exists for.
 *
 *  What travels: the card. Title, body, notes, type, activation and its KEYS, which are the half a
 *  copy without them would silently drop — a triggered entry with no trigger words never reaches
 *  the model again and looks fine on the screen.
 *
 *  What does NOT travel, deliberately:
 *  - `entry_states`. A state is anchored to a chapter NUMBER, and chapter seven of the book it came
 *    from is not chapter seven of the book it is going to. Carrying them would put "the debt
 *    transfers" in force at an unrelated scene, silently, and resolveBody would report it as canon.
 *  - `entry_revisions`. The field history happened to the original; the copy has not been edited.
 *  - Outfits and pins, for the same reason — a wardrobe belongs to the character in the book she
 *    is in, and a pin names a chapter.
 *
 *  It copies rather than links. Two books that share a character diverge the moment either is
 *  edited, which is what reuse means and is the version that needs no machinery to stay true. */
export function copyEntry(fromStoryId: string, toStoryId: string, o: string, entryId: string) {
  if (!ownsStory(fromStoryId, o) || !ownsStory(toStoryId, o)) return null;
  const e = q('SELECT * FROM entries WHERE id = ? AND story_id = ?').get(entryId, fromStoryId) as any;
  if (!e) return null;
  return upsertEntry(toStoryId, o, {
    title: e.title, body: e.body, notes: e.notes, entryType: e.entry_type,
    activation: e.activation, keys: JSON.parse(e.keys || '[]'), lastEditor: 'human',
  });
}

export function delEntry(storyId: string, id: string) {
  // Read the title BEFORE the delete: after it there is nothing left to match the story's persona
  // against, and a persona pointing at a character who no longer exists is worse than an empty one
  // — the byline shows a name the ledger cannot explain.
  const cur = q('SELECT title FROM entries WHERE id = ? AND story_id = ?').get(id, storyId) as any;
  const r = q('DELETE FROM entries WHERE id = ? AND story_id = ?').run(id, storyId);
  if (cur) {
    for (const col of ['persona', 'locked_character'])
      q(`UPDATE stories SET ${col} = NULL WHERE id = ? AND ${col} = ?`).run(storyId, cur.title);
  }
  return r;
}

/** Manual chapter end. Closes the open chapter and opens the next. */
export function endChapter(storyId: string, branchId: string, nextTitle?: string) {
  const cur = openChapterOf(storyId);
  const maxOrd = (q('SELECT MAX(ordinal) AS m FROM passages WHERE branch_id = ?').get(branchId) as any)?.m ?? 0;
  const id = uid('c-'), idx = (cur?.idx ?? 0) + 1;
  // Both writes or neither. Closing the current chapter and opening the next were two statements
  // with nothing joining them, so an insert that tripped left a story whose only chapter was
  // closed — no open chapter to write into, and nothing on screen saying why.
  db.exec('BEGIN');
  try {
    if (cur) q("UPDATE chapters SET status='closed', summary_covers_through=? WHERE id=?").run(maxOrd, cur.id);
    q('INSERT INTO chapters (id,story_id,branch_id,idx,title,status,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, storyId, branchId, idx, nextTitle ?? `Chapter ${idx}`, 'open', now());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(storyId);
  return { closed: cur?.id, opened: id, idx };
}

/** PARTIAL by design. A panel that shows three fields sends three fields, which is what the
 *  client has always done — `savestory` collects the `[data-story]` elements that are on screen.
 *  This was a full-row UPDATE, so saving from a panel holding one field bound `undefined` to
 *  every other column and threw: the Trajectory panel's Save, whose only field is `direction`,
 *  answered 500. Absent keys now keep what is already stored; an explicit null still clears. */
export function updateStory(id: string, s: any) {
  const cur = getStory(id);
  if (!cur) return;
  const p = (k: string, col: string) => (s[k] !== undefined ? s[k] : cur[col]);
  q(`UPDATE stories SET title=?,genre=?,premise=?,setting=?,pov=?,persona=?,writing_style=?,
      direction=?,spice=?,spice_note=?,max_context=?,status=?,strip_patterns=?,model=?,
      locked_character=?,chapter_hero=?,auto_open=?,updated_at=? WHERE id=?`)
    .run(p('title', 'title'), tidyGenre(p('genre', 'genre')), p('premise', 'premise'), p('setting', 'setting'),
      p('pov', 'pov'), p('persona', 'persona') ?? null, p('writingStyle', 'writing_style'),
      p('direction', 'direction') ?? null, p('spice', 'spice'), p('spiceNote', 'spice_note') ?? null,
      p('maxContext', 'max_context') ?? null, p('status', 'status') ?? 'in_progress',
      p('stripPatterns', 'strip_patterns') ?? null, p('model', 'model') ?? null,
      p('lockedCharacter', 'locked_character') ?? null,
      Number(p('chapterHero', 'chapter_hero') ? 1 : 0),
      // A boolean over the wire, an integer in the column, and `undefined` means "leave it" —
      // p() already resolves that to the current value, so a partial save cannot switch it off.
      Number(p('autoOpen', 'auto_open') ? 1 : 0), now(), id);
}
/** Partial save. `undefined` means "leave it", which `updateStory` above has done since it was
 *  written and this did not: it wrote `c.keepWhole ? 1 : 0` unconditionally, and both callers send
 *  only `{title, authorsNote}` — so renaming a chapter switched OFF its pull-back. Latent while
 *  nothing could switch it on, and a live bug the moment the hatch had a door. Same helper, same
 *  reason. */
export function updateChapter(storyId: string, id: string, c: any) {
  const cur = q('SELECT * FROM chapters WHERE id = ? AND story_id = ?').get(id, storyId) as any;
  if (!cur) return;
  const p = (k: string, col: string) => (c[k] !== undefined ? c[k] : cur[col]);
  q('UPDATE chapters SET title=?, authors_note=?, keep_whole=? WHERE id=? AND story_id=?')
    .run(p('title', 'title'), p('authorsNote', 'authors_note') ?? null,
      p('keepWhole', 'keep_whole') ? 1 : 0, id, storyId);
}
export const delStory = (id: string, ownerId?: string) => ownerId
  ? q('DELETE FROM stories WHERE id = ? AND owner_id = ?').run(id, ownerId)
  : q('DELETE FROM stories WHERE id = ?').run(id);
const touch = (id: string) => q('UPDATE stories SET updated_at = ? WHERE id = ?').run(now(), id);

// ponytail: LIKE scan over every selected passage. Fine at this size, linear at chapter 40.
// Upgrade to FTS5 when it is measurably slow — an earlier revision created the table and never
// populated it, which was worse than not having it.
/** Prose, entries and chapter summaries. The surface said it searched all three and it searched
 *  passages only — and a result carried `story`, which is a TITLE, where the client wanted an id,
 *  so clicking a hit tried to open a story called "The Silver Key". Both fixed here: one shape,
 *  with the id and the title as separate columns that cannot be confused for each other. */
/** `storyId` narrows it to one book. Searching inside a story returned hits from every other
 *  story by default, which is the wrong default in the one place you already know where you are —
 *  and it is how "add to the lore book" could put an entry in a different story's ledger. The
 *  owner filter is on EVERY branch regardless: each one needs its own, or a missing one leaks
 *  that kind only. test/scope.ts asserts all three. */
export const search = (o: string, term: string, storyId?: string) => {
  const like = `%${term}%`;
  const scope = (alias: string) => (storyId ? `AND ${alias}.story_id = ?` : '');
  const args: any[] = [];
  const push = (...a: any[]) => { args.push(...a); if (storyId) args.push(storyId); };
  push(o, like);            // prose
  push(o, like, like);      // entries
  push(o, like);            // summaries
  return q(`
    SELECT 'Prose' AS kind, p.story_id AS story_id, s.title AS story_title,
           'ch ' || c.idx AS loc, p.body AS body, p.id AS id
      FROM passages p JOIN stories s ON s.id = p.story_id JOIN chapters c ON c.id = p.chapter_id
     WHERE s.owner_id = ? AND p.selected = 1 AND p.body LIKE ? ${scope('p')}
    UNION ALL
    SELECT 'Entry', e.story_id, s.title, e.title, e.body, e.id
      FROM entries e JOIN stories s ON s.id = e.story_id
     WHERE s.owner_id = ? AND (e.title LIKE ? OR e.body LIKE ?) ${scope('e')}
    UNION ALL
    SELECT 'Summary', c.story_id, s.title, 'ch ' || c.idx, c.summary, c.id
      FROM chapters c JOIN stories s ON s.id = c.story_id
     WHERE s.owner_id = ? AND c.summary IS NOT NULL AND c.summary LIKE ? ${scope('c')}
     LIMIT 60`).all(...args) as any[];
};

// ---- history & revert ----
export const passageHistory = (storyId: string, id: string) => q(
  `SELECT r.id, r.body, r.replaced_at FROM passage_revisions r JOIN passages p ON p.id = r.passage_id
   WHERE r.passage_id = ? AND p.story_id = ? ORDER BY r.replaced_at DESC`).all(id, storyId) as any[];
/** Every take in this passage's slot, newest last, with the text. Regenerating writes a NEW
 *  variant rather than a revision, so the History panel — which reads passage_revisions — showed
 *  "this passage has not been edited" for a passage that had been re-rolled five times. The takes
 *  were only ever reachable through a stepper in a hover tray. */
export const passageTakes = (storyId: string, id: string) => {
  const cur = q('SELECT chapter_id, slot_key FROM passages WHERE id = ? AND story_id = ?')
    .get(id, storyId) as any;
  if (!cur) return [];
  return q(`SELECT id, body, author, variant_index, selected, rejected, created_at
              FROM passages WHERE story_id = ? AND chapter_id = ? AND slot_key = ?
             ORDER BY variant_index`).all(storyId, cur.chapter_id, cur.slot_key) as any[];
};
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
/** A consistent copy of the whole database at one path.
 *
 *  **Never `cp` a database in WAL mode.** Recent writes live in the `-wal` file until a
 *  checkpoint, so copying the main file alone silently loses them — and silently is the problem.
 *  It cost an A/B run: one arm was seeded with prose while a server held the file open, the other
 *  arm was `cp`-ed from it, and that arm generated with no prose in context at all. The manifests
 *  differed by a whole block and it looked like an engine bug for twenty minutes.
 *
 *  VACUUM INTO writes the lot in one statement — no lock dance, no partial file. */
export function snapshot(path: string) {
  // VACUUM INTO refuses an existing target, which is a feature — it will not clobber a database.
  // Its own message is "output file already exists", which says nothing about which file.
  try { db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`); }
  catch (e: any) {
    throw new Error(/already exists/i.test(e?.message ?? '')
      ? `${path} already exists; VACUUM INTO will not overwrite a database. Delete it first.`
      : e?.message ?? String(e));
  }
  return { file: path, bytes: statSync(path).size };
}

/** A timestamped snapshot in `dir`, keeping the newest `keep` and pruning the rest. */
export function backup(dir = join(dirname(FILE), 'backups'), keep = 12) {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(dir, `anansi-${stamp}.db`);
  snapshot(out);
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
  snapshot(out);
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
  q(`INSERT INTO violations (id,story_id,passage_id,entry_id,quote,reason,confidence,reached,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`).run(uid('v-'), storyId, v.passageId, v.entryId ?? null,
    v.quote ?? null, v.reason ?? null, v.confidence ?? null, v.reached === false ? 0 : 1, now());
}
/** Open flags on passages that are actually on the page.
 *
 *  The `selected = 1` join is the fix for a flag you can see the count of and never the flag: rolling
 *  a passage again leaves the old take in the database unselected, and its flags stayed open on prose
 *  that is no longer in the book. The shelf counted one, the document rendered none, and there was
 *  nothing to press.
 *
 *  Filtered rather than deleted, deliberately. An unselected take is one you can switch back to, and
 *  if you do, its flag is true again — so this hides it rather than losing it. */
export const violationsOf = (storyId: string) => q(
  `SELECT v.* FROM violations v JOIN passages p ON p.id = v.passage_id
    WHERE v.story_id = ? AND v.status = 'open' AND p.selected = 1
    ORDER BY v.created_at DESC`).all(storyId) as any[];
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
  // Anchored to a chapter, so (entry, chapter) is the identity whether or not an id was passed.
  // Without this, accepting the same memory proposal twice — which the open-only dedupe index
  // deliberately allows after the first acceptance — left two states at one chapter and resolveBody
  // silently preferred whichever sorted last.
  const at = q('SELECT id FROM entry_states WHERE entry_id = ? AND from_chapter = ?')
    .get(entryId, st.fromChapter) as any;
  if (at) {
    q('UPDATE entry_states SET body=?, before_mode=?, label=? WHERE id=?')
      .run(st.body, st.beforeMode ?? 'hide', st.label ?? null, at.id);
    return at.id;
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
/** What this writer has actually done. Every number here was already in the database — the
 *  dashboard needed counting, not new bookkeeping. Words are counted in SQL over selected
 *  passages only, so unchosen takes are not credited as writing you did. */
export function writerStats(o: string) {
  const one = (sql: string, ...a: any[]) => (q(sql).get(o, ...a) as any) ?? {};
  const words = one(`SELECT COALESCE(SUM(LENGTH(p.body) - LENGTH(REPLACE(p.body,' ','')) + 1), 0) AS n
                       FROM passages p JOIN stories s ON s.id = p.story_id
                      WHERE s.owner_id = ? AND p.selected = 1 AND p.is_break = 0`).n;
  const byAuthor = q(`SELECT p.author, COUNT(*) AS n
                        FROM passages p JOIN stories s ON s.id = p.story_id
                       WHERE s.owner_id = ? AND p.selected = 1 AND p.is_break = 0
                       GROUP BY p.author`).all(o) as any[];
  const gen = one(`SELECT COUNT(*) AS calls,
                          COALESCE(SUM(g.completion_tokens),0) AS out,
                          COALESCE(SUM(g.latency_ms),0) AS ms,
                          COALESCE(SUM(CASE WHEN g.error IS NOT NULL THEN 1 ELSE 0 END),0) AS failed
                     FROM generations g JOIN stories s ON s.id = g.story_id WHERE s.owner_id = ?`);
  const days = q(`SELECT DATE(p.created_at/1000,'unixepoch') AS d, COUNT(*) AS n
                    FROM passages p JOIN stories s ON s.id = p.story_id
                   WHERE s.owner_id = ? AND p.selected = 1 AND p.is_break = 0
                   GROUP BY d ORDER BY d DESC LIMIT 30`).all(o) as any[];
  return {
    stories: one('SELECT COUNT(*) AS n FROM stories WHERE owner_id = ?').n,
    chapters: one(`SELECT COUNT(*) AS n FROM chapters c JOIN stories s ON s.id = c.story_id
                    WHERE s.owner_id = ?`).n,
    entries: one(`SELECT COUNT(*) AS n FROM entries e JOIN stories s ON s.id = e.story_id
                   WHERE s.owner_id = ?`).n,
    passages: byAuthor.reduce((n, r) => n + r.n, 0),
    words,
    yours: byAuthor.find((r) => r.author === 'human')?.n ?? 0,
    anansi: byAuthor.find((r) => r.author === 'model')?.n ?? 0,
    // Takes that were written and not chosen. The measure of how much re-rolling it took.
    unchosen: one(`SELECT COUNT(*) AS n FROM passages p JOIN stories s ON s.id = p.story_id
                    WHERE s.owner_id = ? AND p.selected = 0`).n,
    calls: gen.calls, tokensOut: gen.out, failed: gen.failed,
    minutes: Math.round(gen.ms / 60000),
    days: days.reverse(),
  };
}

export const recentGenerations = (storyId: string, limit = 40) => q(
  `SELECT id, role, model, prompt_tokens, completion_tokens, latency_ms, timings, error, created_at
   FROM generations WHERE story_id = ? ORDER BY created_at DESC LIMIT ?`).all(storyId, limit) as any[];

export function logGeneration(g: any) {
  const gid = uid('g-');
  q(`INSERT INTO generations (id,story_id,chapter_id,passage_id,model,role,params,manifest,
      prompt_tokens,completion_tokens,timings,latency_ms,error,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(gid, g.storyId ?? null, g.chapterId ?? null, g.passageId ?? null, g.model ?? null,
      g.role ?? 'prose', JSON.stringify(g.params ?? {}), JSON.stringify(g.manifest ?? {}),
      g.promptTokens ?? null, g.completionTokens ?? null, JSON.stringify(g.timings ?? {}),
      g.latencyMs ?? null, g.error ?? null, now());
  // SPEC §11 keeps the row and drops the manifest after 90 days. Same idea, simpler: the
  // manifest is only useful while debugging a recent call, so keep the newest 200 and null
  // the rest. Each manifest is ~3 KB, so unbounded is a slow leak, not a fast one.
  // (The id is returned below so the take this produced can be tied to it.)
  q(`UPDATE generations SET manifest = NULL WHERE id IN (
       SELECT id FROM generations WHERE manifest IS NOT NULL
       ORDER BY created_at DESC LIMIT -1 OFFSET 200)`).run();
  return gid;
}
