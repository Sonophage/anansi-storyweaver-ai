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
// The slot names live in one module because `entries.field_editors` keys provenance by them and
// the partial unique index below names them as a literal. Three copies of one list is the drift
// `src/blocks.ts` exists to stop for the block order; this is the same rule for slots.
import { ALL_SLOTS, EXCLUSIVE_SLOTS } from './slots.ts';

// ponytail: SQLite, not Postgres. PLAN-02 §3 locked Postgres for pgvector (unscheduled) and RLS
// (needs a second tenant); neither is live, and Docker was not running. The schema is the target
// shape so the port is mechanical.
//
// THE TRIGGER WAS REWRITTEN ON 2026-08-29 because it read as already fired and was not. It said
// "port when the second writer arrives", and a second writer HAS been writing over the tailnet for
// some time. Seth, asked directly: that was never her. A trusted person on your own tailnet is not
// what RLS defends against. Port when a second TENANT arrives — somebody whose rows must be
// invisible to you at the DATABASE level rather than at the route gate — or when vectors are
// wanted for memory recall (PLAN-02 P5). Neither is true, and a trigger that looks overdue every
// time it is read teaches the next reader to skim past all of them.
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
  /** The other direction, and it needs one because deleting a column from the CREATE above does
   *  NOT delete it from a database that already exists — SQLite has no implicit drop and nothing
   *  here ever did it explicitly.
   *
   *  COUNCIL-05 seat 2: a database built from this file and Seth's live one were diffed on
   *  2026-08-28 and differed by exactly two columns, both cut from the source by the ponytail
   *  audit of 2026-08-23 and both still on disk fifteen weeks later. `exportStory` copies the
   *  file and deletes the other stories, so every standalone database handed to anyone carried
   *  them forward into a file this schema would never have created.
   *
   *  Backs up ONCE before the first real drop, and only then: this rewrites a table in the file
   *  somebody's novel is in, and the boot snapshot in `serve.ts` does not run until after this. */
  let backedUp = false;
  const drop = (table: string, col: string, why: string) => {
    if (!has(table, col)) return;
    if (!backedUp) { backedUp = true; try { backup(); } catch { /* keep going; the drop is safe */ } }
    try { db.exec(`ALTER TABLE ${table} DROP COLUMN ${col}`); console.log(`  dropped ${table}.${col} — ${why}`); }
    // A refusal is not a reason to stop opening the database. SQLite refuses a column an index,
    // view or trigger names; neither of these is named by one, checked in sqlite_master.
    catch (e: any) { console.log(`  could NOT drop ${table}.${col}: ${e?.message}`); }
  };
  // PLAN-08. Copy, never move: every outfit becomes an addon in the `outfit` slot and the row it
  // came from stays exactly where it is. Keyed on the outfit's own id so running twice inserts
  // nothing the second time, and so the two rows can still be matched up if this has to be undone.
  try {
    db.exec(`INSERT INTO addons (id, story_id, entry_id, slot, name, body, keys, active, created_at)
             SELECT o.id, o.story_id, o.entry_id, 'outfit', o.name, o.body, '[]', o.active, o.created_at
               FROM outfits o WHERE NOT EXISTS (SELECT 1 FROM addons a WHERE a.id = o.id)`);
  } catch { /* neither table exists yet on a fresh database; the CREATEs above cover it */ }
  // PLAN-08 Phase 2. A thread can be finished: a dead character, a burned building, a rule that
  // stopped applying. Without it the ledger's precision decays as the book grows, which is exactly
  // when it is needed most, and "everything in here is still true" stays an assumption.
  add('entries', 'retired_at_chapter', 'INTEGER');
  // A proposal can aim at one room of a card rather than a whole new body, and can carry the
  // activation the model was asked for. PLAN-06 2e's "honour a model's explicit activation" had
  // nowhere to land until this column existed.
  add('proposals', 'field', 'TEXT');
  add('proposals', 'activation', 'TEXT');
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
  // Whether the chapter's band stays at the top while you read past it. Per STORY at Seth's
  // direction — a book that opens each chapter on a picture wants it, and one that does not may
  // not. Off by default, because a strip that follows you down the page is a choice.
  // Whether the cover stays put behind the prose while you read, rather than scrolling away with
  // the top of the chapter. Added 2026-08-27 as a sticky HEADING — a strip that followed you down
  // the page — and repurposed the same day, at Seth's direction, for the treatment that replaced
  // it: the picture stays and the prose moves over it. Same column, same meaning at the level that
  // matters (does the chapter's head stay on screen), so no second flag and nothing dead left
  // behind. Nothing had set it yet.
  add('stories', 'chapter_sticky', 'INTEGER DEFAULT 0');
  // How much of the cover shows through behind the prose, 0 to 100. A picture at full strength
  // under text is unreadable and one at nothing is not there, so this is the control that makes
  // the treatment usable at all rather than a nice idea. 30 is a default that reads as atmosphere.
  add('stories', 'cover_opacity', 'INTEGER DEFAULT 30');
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
  // Removed from the schema by the ponytail audit of 2026-08-23 as columns nothing reads. Both
  // were P1 stubs: `system_block_override` for a per-story SYSTEM replacement, `token_counts` for
  // SPEC §7.5's tokenizer-keyed map. Neither feature is built and both remain in the plan — this
  // drops the stubs, not the plan. Verified unreferenced across src, web, test and bench before
  // the drop, and named by no index, view or trigger.
  drop('stories', 'system_block_override', 'a P1 stub for a per-story SYSTEM, never read');
  drop('passages', 'token_counts', 'a P1 stub for SPEC §7.5 tokenizer-keyed counts, never read');

  // PLAN-08, the last step of the wardrobe move. The copy above has run on every boot since Phase 2
  // and is idempotent, so by the time this line is reached every outfit is an addon in the `outfit`
  // slot. Nothing writes `outfits` any more — `upsertOutfit` and friends are one-line shims over
  // the addon writers, the three HTTP routes are deleted, and `src/import.ts` reads addons with a
  // fallback to this table for export files written before the move.
  //
  // ORDER IS EVERYTHING HERE and it is why this sits below the copy rather than beside it: drop
  // first and the wardrobe is gone from every book that had not booted since Phase 2. Backed up
  // before the first drop by the same guard the column drops use — this rewrites the file
  // somebody's novel is in, which is the whole reason that guard exists.
  if ((db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'table' AND name = 'outfits'")
    .get() as any).n) {
    const left = (db.prepare(`SELECT COUNT(*) n FROM outfits o
      WHERE NOT EXISTS (SELECT 1 FROM addons a WHERE a.id = o.id)`).get() as any).n;
    // A REFUSAL, NOT A LOSS. If anything is still only in the old table the copy above did not
    // reach it, and dropping would take it with us — say so and leave the table alone.
    if (left) console.log(`  keeping outfits: ${left} row(s) never made it into addons`);
    else {
      if (!backedUp) { backedUp = true; try { backup(); } catch { /* keep going; the drop is safe */ } }
      try { db.exec('DROP TABLE outfits'); console.log('  dropped table outfits — the wardrobe is an addon'); }
      catch (e: any) { console.log(`  could NOT drop outfits: ${e?.message}`); }
    }
  }

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
-- "outfits" WAS HERE and it is not coming back. The wardrobe is an addon in the "outfit" slot:
-- one table, one firing path, one way in. Leaving the CREATE behind would have rebuilt the table
-- empty on every boot immediately before the migration dropped it again, which is a table that
-- exists for a fraction of a second and a log line every start.
-- The drop is in migrate() and it refuses to run while any row is still only in the old table.

-- PLAN-08 Phase 2. Addons: what an outfit already was, generalised to every room of a card.
-- Seth, 2026-08-28: "all these additions outside of the body should be the same class as outfits
-- are, i.e. addons, and several can be triggered on at a time for specific ones." A card does not
-- have ONE relationship; it has three, and each wants its own trigger words. A field held as one
-- blob can only arrive whole.
--
-- "outfits" is NOT dropped and NOT renamed. Rows are copied into here by the migration below and
-- the old table keeps working untouched, because this rewrites the file somebody's novel is in and
-- a migration that moves data is a migration that can lose it. The drop is a later, separate step
-- taken once reads have run off "addons" for a while.
--
-- entry_id is NULLABLE: an addon with no entry belongs to the STORY, which is where a string
-- lives. "strings.summoned" is already "active" under another name — "only a summoned string
-- reaches the prompt" — so an open promise reaches the model today only if the writer remembers it
-- by hand. As an addon it keeps that switch and gains trigger words.
--
-- "from_chapter" has no equivalent on "outfits" and is here on purpose: it is what makes an arc
-- survive. An exclusive slot plus a chapter is a timeline — appearance at 1, appearance at 9,
-- newest at or before the current chapter wins, which is "resolveBody"'s logic pointed at a slot.
CREATE TABLE IF NOT EXISTS addons (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  keys TEXT DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 0,
  from_chapter INTEGER,
  retired_at_chapter INTEGER,
  created_at INTEGER NOT NULL);
-- NO BACKTICKS IN HERE: this schema is a TypeScript template literal and one closes the string.
-- ONE AT A TIME, IN THE DATABASE. The slot list is a literal because a partial index cannot call
-- into TypeScript; "test/db.ts" asserts it against "EXCLUSIVE_SLOTS" so the two cannot drift, which
-- is the whole reason "src/slots.ts" exists. A screen that merely declines to offer a second one is
-- a habit, not a rule.
CREATE UNIQUE INDEX IF NOT EXISTS addons_one_active ON addons(entry_id, slot)
  WHERE active = 1 AND slot IN ('appearance','outfit','voice');
CREATE INDEX IF NOT EXISTS addons_story ON addons(story_id);
CREATE INDEX IF NOT EXISTS addons_entry ON addons(entry_id, slot);

-- PLAN-08 Phase 2. Connected threads, issue #5: "Something about a character can be connected to
-- that character thread. Connected threads should have a confidence score if it gets pulled by
-- it's parents but also triggerable by their own trigger word."
--
-- DIRECTED, and that is the whole design decision. Connection is not symmetric: her coat should
-- arrive when she does, and she must NOT arrive because somebody said "coat". Undirected edges
-- rebuild COUNCIL-04 #7's crowded scene -- 46 entries firing at once -- through the back door, and
-- the direction cannot be recovered once a book has two hundred edges. So: PARENT PULLS CHILD.
--
-- confidence is what an inherited pull is worth against a direct keyword hit. It is stored and not
-- yet read; Phase 3 spends it in the eviction order, which is the only place it can mean anything.
CREATE TABLE IF NOT EXISTS entry_edges (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 1.0,
  keys TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL);
-- One edge per direction per pair. Without this, pressing connect twice makes the child arrive
-- twice and count twice against the cap, which is a bug nobody would think to look for.
CREATE UNIQUE INDEX IF NOT EXISTS entry_edges_pair ON entry_edges(parent_id, child_id);
CREATE INDEX IF NOT EXISTS entry_edges_story ON entry_edges(story_id);

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

-- What changed, in the writer's words, keyed on the commit it was written from. Anansi writes it
-- once per commit and it is read from here after that: "every commit updates it" costs one model
-- call per commit rather than one per visit, and a checkout that has not moved cannot produce
-- different notes on two readings.
CREATE TABLE IF NOT EXISTS release_notes (
  head TEXT PRIMARY KEY,
  notes TEXT NOT NULL,
  built_at INTEGER NOT NULL);

-- What a writer has waved away. Proposals, strings and flags are ROWS and are dismissed by their
-- own status; these two are COMPUTED — a summary is stale because its prose moved, and the horizon
-- is the chapters that no longer fit — so there is nothing to mark and they would nag forever.
--
-- Keyed on ref, which carries the STATE that made it worth saying: the summary's hash, or the
-- last chapter of the range. So dismissing is not "never tell me again" — it is "not for this".
-- Edit that chapter and the summary is stale against a new hash; write past the horizon and the
-- range ends somewhere new; both come back, which is the difference between quiet and deaf.
--
-- A mute is the third, and it is here rather than on violations.status for the same reason: the
-- checker runs on EVERY new passage, so one entry that has drifted out of step with the prose is
-- raised again on the next passage, and the next. Dismissing rows one at a time never ends —
-- there is always another row coming. A mute is keyed on the CHAPTER, ref chapterId:entryId,
-- and check() drops those facts before it asks, so no tokens are spent and no row is written.
-- Chapter-scoped on purpose: canon and prose fall out of step while a chapter is moving and agree
-- again once it settles, so the mute ends where the drift does. Lift it and the flags come back.
CREATE TABLE IF NOT EXISTS dismissals (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,               -- stale | horizon | mute
  ref TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (story_id, kind, ref));

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

/** The notes written for this commit, or null. */
export const notesFor = (head: string): any => {
  const r = q('SELECT notes FROM release_notes WHERE head = ?').get(head) as any;
  try { return r ? JSON.parse(r.notes) : null; } catch { return null; }
};
/** The commit the newest notes were written for, or null. What the next batch reads FROM. */
/** The hash the summary was written against, which is what makes a dismissal specific: edit the
 *  chapter and the summary is stale against a NEW hash, so what was waved away comes back. */
export const summaryHashOf = (chapterId: string): string | null =>
  (q('SELECT summary_hash FROM chapters WHERE id = ?').get(chapterId) as any)?.summary_hash ?? null;

export const dismiss = (storyId: string, kind: string, ref: string) =>
  q(`INSERT INTO dismissals (story_id, kind, ref, at) VALUES (?,?,?,?)
     ON CONFLICT(story_id, kind, ref) DO NOTHING`).run(storyId, kind, String(ref), now());
/** Everything waved away for this story, as `kind:ref`. */
export const dismissed = (storyId: string): Set<string> =>
  new Set((q('SELECT kind, ref FROM dismissals WHERE story_id = ?').all(storyId) as any[])
    .map((r) => `${r.kind}:${r.ref}`));

/** Entry ids muted for one chapter. check() drops these facts before it asks the model, so a mute
 *  costs nothing and writes nothing — unlike a dismissal, which is a row that already exists. */
export const mutedIn = (storyId: string, chapterId: string): Set<string> =>
  new Set((q("SELECT ref FROM dismissals WHERE story_id = ? AND kind = 'mute'").all(storyId) as any[])
    .map((r) => String(r.ref).split(':'))
    .filter((parts) => parts[0] === chapterId)
    .map((parts) => parts.slice(1).join(':')));

/** The way back. A mute nobody can lift is deafness, not quiet. */
export const unmute = (storyId: string, kind: string, ref: string) =>
  q('DELETE FROM dismissals WHERE story_id = ? AND kind = ? AND ref = ?').run(storyId, kind, String(ref));

export const newestNoted = (): string | null =>
  (q('SELECT head FROM release_notes ORDER BY built_at DESC LIMIT 1').get() as any)?.head ?? null;

/** Every batch, newest first. The notes accumulate: a batch describes the commits since the batch
 *  before it, so the page is the whole history rather than only the latest run. */
export const allNotes = (): any[] =>
  (q('SELECT head, notes, built_at FROM release_notes ORDER BY built_at DESC LIMIT 40').all() as any[])
    .map((r) => { try { return { head: r.head, at: r.built_at, ...JSON.parse(r.notes) }; }
                  catch { return null; } })
    .filter(Boolean);

export function setNotes(head: string, notes: any) {
  q(`INSERT INTO release_notes (head, notes, built_at) VALUES (?,?,?)
     ON CONFLICT(head) DO UPDATE SET notes = excluded.notes, built_at = excluded.built_at`)
    .run(head, JSON.stringify(notes), now());
}

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

/** The one key parser. There were three — `import.ts` split on comma, `app.js` split on comma
 *  inline, and this write path did `Array.isArray(e.keys) ? … : []`, so a model or an API client
 *  that posted `"coat, iron bridge"` lost BOTH keys and the entry looked fine. Every route reaches
 *  `upsertEntry`, so the split belongs here, at the bottom, where nothing can go around it.
 *
 *  The 2-32 bound is SPEC §7.1 and is validation at a trust boundary, not a nicety: a one-character
 *  key fires on every passage forever, which is the same defect as an entry that never fires, on
 *  the other side. Out-of-range keys are DROPPED rather than clipped — a key cut mid-word at 32
 *  matches nothing, which would be silence dressed as a key.
 *
 *  `cap` is a parameter because SPEC allows ten and `import.ts` has always taken eight from an
 *  untrusted file. Both were correct for where they stood, and both were too low: a real AI
 *  Dungeon export on 2026-08-29 carried up to 14 keys on a card, and 58 of its 645 triggers were
 *  being dropped in silence. DIVERGES from SPEC §7.1, which says ten — the code wins and the spec
 *  is now wrong. Raised at Seth's direction; the cost is a wider trigger surface on 18 cards. */
export const keysOf = (k: unknown, cap = 14): string[] =>
  (Array.isArray(k) ? k : String(k ?? '').split(','))
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length >= 2 && x.length <= 32)
    .slice(0, cap);

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
    keys: keysOf(e.keys),
    lastEditor: e.lastEditor ?? 'human',
  };
  // Branch on whether the ROW exists, not on whether an id was passed. Seeding with a
  // known id previously took the UPDATE path against a row that was never inserted and
  // silently wrote nothing.
  const cur = e.id ? q('SELECT * FROM entries WHERE id = ? AND story_id = ?').get(e.id, storyId) as any : null;

  // PLAN-06 2e, the half the evidence supports. A `triggered` entry with no keys never reaches the
  // model again and looks perfect on the screen — the class named at `:881` — and until now the
  // rule that prevents it lived in `import.ts` alone, on one of six paths into this function. The
  // other five are the wizard, `POST /api/entry` (the app's own save and any API client), accept,
  // the other importer, and copy-to-another-book. So it belongs HERE, with `keysOf`, for the same
  // reason: this is the floor everything crosses, including the route nobody has written yet.
  //
  // TWO EXCEPTIONS, and both are deliberate rather than defensive:
  //
  //   `allowNoKeys` — the defect 2e names is SILENCE: an entry going dark with nobody choosing it.
  //   So the flag marks the writes where somebody did choose, and the app passes it on all three:
  //   the highlight-to-thread button, which wants dark on purpose (an always-on entry made from a
  //   highlight costs tokens on every call before anyone has looked at it); the activation chip;
  //   and the entry editor's Save. The chip one is not a nicety — the trigger-words field is
  //   DISABLED while an entry is always-on (`web/app.js:2233`), so switching to triggered and then
  //   typing keys is the only route there is, and a guard without this exemption bounces the
  //   switch back and makes a triggered entry impossible to create. `test/ui/handlers.js` caught
  //   exactly that, in a browser, after the unit suite was green.
  //
  //   What is left guarded is what 2e is actually about: accept, the wizard, both importers,
  //   copy-to-another-book, and any API client that did not say it meant it. It is a per-call
  //   permission and is never stored — nothing below binds it to a column.
  //
  //   A row ALREADY in that state is left alone. `bench/ledger-audit.ts` was run against the live
  //   library on 2026-08-28 before this was written: of the 7 entries the prose can answer for, 1
  //   would go dark outright and 2 more fired only in the past and not on the live window. So
  //   flipping what is already there is not supported by the evidence, and doing it on the next
  //   unrelated save would change what reaches the model without anyone asking. This guard stops
  //   NEW darkness; it does not migrate old.
  const wasDark = !!cur && cur.activation === 'triggered'
    && !(JSON.parse(cur.keys || '[]') as string[]).length;
  if (e.activation === 'triggered' && !e.keys.length && !e.allowNoKeys && !wasDark)
    e = { ...e, activation: 'always_on' };

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
 *  MEASURED 2026-08-29 — F44 — and the answer was not the one the question expected. Feeding the
 *  rejected take into DIRECTIVE was built as an ARM (`Input.rejected`, which nothing in the app
 *  sets) and run against a control: median word overlap between the reroll and the take it
 *  replaced was 0.15 told against 0.19 not told, at n=6. No difference worth the bracket.
 *
 *  The useful number is the CONTROL. 0.19 means a reroll already goes somewhere else on its own,
 *  so the complaint this feature exists for — "I pressed it again and got the same paragraph" —
 *  is not happening. There was nothing to fix, which is why saying more did not fix it.
 *
 *  ponytail: the arm and `bench/reroll.ts` are KEPT rather than deleted, and n=6 is why: it is
 *  thin, and throwing the apparatus away means rebuilding it to ask the same question properly.
 *  Nothing sets the field, so it costs nothing at runtime. Ceiling: a field with no caller is dead
 *  code with a bench attached. Upgrade path, and the trigger, is a writer actually reporting
 *  repeated rerolls — then re-run at n>=50 and either wire it up or delete both. */
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

/** THE WARDROBE IS AN ADDON IN THE `outfit` SLOT. PLAN-08 Phase 2 created `addons` as the class an
 *  outfit already was and copied every row across; the surface went on writing `outfits`, so there
 *  were two tables and two firing paths for one thing and `src/context.ts` had to skip the `outfit`
 *  slot to keep from sending the coat twice.
 *
 *  These four keep their names and write addons underneath. That is deliberate and it is the reason
 *  this was a small change rather than a hunt: `src/import.ts` and three suites call them, and a
 *  rename would have meant finding every caller and getting them all right in one pass. They are
 *  one line each now, and the behaviour they had — one worn at a time, cleared in a transaction —
 *  is `setAddonActive`'s, because `outfit` is an exclusive slot.
 *
 *  The `outfits` table was dropped the same day, after a backup and after checking every row had
 *  reached `addons` — see the migration at the top of this file, which refuses rather than loses.
 *  `src/import.ts` still reads the old table as a FALLBACK for export files written before the
 *  move, and that is the last thing in the tree that knows the name. */
export const outfitsOf = (storyId: string) =>
  q("SELECT * FROM addons WHERE story_id = ? AND slot = 'outfit' ORDER BY created_at").all(storyId) as any[];

export function upsertOutfit(storyId: string, entryId: string, o: any) {
  // Ownership, the exclusive-slot transaction and the unknown-slot refusal are all `upsertAddon`'s
  // now — it makes the same composite-lookup check this used to make for itself.
  return upsertAddon(storyId, entryId, { ...o, slot: 'outfit',
    name: o.name ?? 'Untitled', body: o.body ?? '' });
}

/** Wear one, or none. The unique index forbids two active on one character, so the unset has to
 *  happen first — the same write-order rule as selectVariant, and for the same reason: a partial
 *  unique index is not deferrable. Passing null takes everything off. */
// ---- addons (PLAN-08 Phase 2) ----

export const addonsOf = (storyId: string) =>
  q('SELECT * FROM addons WHERE story_id = ? ORDER BY slot, created_at').all(storyId) as any[];

export function upsertAddon(storyId: string, entryId: string | null, a: any) {
  const t = now();
  const slot = String(a.slot ?? '').trim();
  if (!ALL_SLOTS.includes(slot)) return null;
  // A story-level addon has no entry; an entry-level one must point at an entry in THIS story, or
  // a row can be hung off another writer's card. Same shape as `wearOutfit`'s ownership check.
  if (entryId && !q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(entryId, storyId)) return null;
  const keys = JSON.stringify(keysOf(a.keys));
  if (a.id && q('SELECT 1 FROM addons WHERE id = ? AND story_id = ?').get(a.id, storyId)) {
    // PRESENCE, NOT TRUTHINESS. These two were written as `?? null` unconditionally and the addon
    // editor sends neither, so every save of a room silently cleared its chapter anchors — which
    // made the room editor a de-facto un-retire button nobody knew was one, and quietly undid the
    // one thing `from_chapter` exists for, the arc. `undefined` now leaves the stored value alone
    // and an explicit `null` still clears it, which is `setPin`'s contract for the same job.
    const cur = q('SELECT from_chapter, retired_at_chapter FROM addons WHERE id = ? AND story_id = ?')
      .get(a.id, storyId) as any;
    const from = 'fromChapter' in a ? (a.fromChapter ?? null) : (cur?.from_chapter ?? null);
    const till = 'retiredAtChapter' in a ? (a.retiredAtChapter ?? null) : (cur?.retired_at_chapter ?? null);
    q(`UPDATE addons SET name = ?, body = ?, keys = ?, from_chapter = ?, retired_at_chapter = ?
       WHERE id = ? AND story_id = ?`)
      .run(a.name, a.body, keys, from, till, a.id, storyId);
    touch(storyId);
    return a.id;
  }
  const id = uid('ad-');
  q(`INSERT INTO addons (id,story_id,entry_id,slot,name,body,keys,active,from_chapter,retired_at_chapter,created_at)
     VALUES (?,?,?,?,?,?,?,0,?,?,?)`)
    .run(id, storyId, entryId, slot, a.name, a.body, keys, a.fromChapter ?? null, a.retiredAtChapter ?? null, t);
  touch(storyId);
  return id;
}

/** Switch one on or off. EXCLUSIVITY IS ENFORCED HERE AND BY `addons_one_active`, not by the
 *  screen: an exclusive slot clears its siblings on the same entry first, in a transaction, which
 *  is `wearOutfit` with `AND slot = ?` added. Doing it in two statements without the transaction is
 *  how a writer ends up with two appearances and a unique index refusing every later write. */
export function setAddonActive(storyId: string, addonId: string, on: boolean) {
  const row = q('SELECT entry_id, slot FROM addons WHERE id = ? AND story_id = ?')
    .get(addonId, storyId) as any;
  if (!row) return null;
  db.exec('BEGIN');
  try {
    if (on && EXCLUSIVE_SLOTS.includes(row.slot) && row.entry_id)
      q('UPDATE addons SET active = 0 WHERE entry_id = ? AND slot = ? AND story_id = ?')
        .run(row.entry_id, row.slot, storyId);
    q('UPDATE addons SET active = ? WHERE id = ? AND story_id = ?').run(on ? 1 : 0, addonId, storyId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(storyId);
  return addonId;
}

// ---- connections (PLAN-08 Phase 2) ----

export const edgesOf = (storyId: string) =>
  q('SELECT * FROM entry_edges WHERE story_id = ? ORDER BY created_at').all(storyId) as any[];

/** Connect two cards, parent to child. Returns null rather than throwing on every refusal, the
 *  same shape as `upsertAddon`, because all three refusals are things a surface can ask for by
 *  accident and none of them is exceptional. */
export function linkEntries(storyId: string, parentId: string, childId: string, o: any = {}) {
  // A card pulling itself in is a loop with no purpose, and it would count twice against the cap.
  if (parentId === childId) return null;
  // BOTH ends checked against THIS story. One end checked is how an edge ends up pointing at
  // another writer's card, which is a leak rather than a coherence bug -- the same reasoning as
  // the composite foreign key on chapter_pins.
  const owns = (id: string) => q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(id, storyId);
  if (!owns(parentId) || !owns(childId)) return null;
  const id = uid('lk-');
  try {
    q('INSERT INTO entry_edges (id,story_id,parent_id,child_id,confidence,keys,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, storyId, parentId, childId, Number(o.confidence ?? 1), JSON.stringify(keysOf(o.keys)), now());
  } catch { return null; }   // unique index: already connected, not an error
  touch(storyId);
  return id;
}

export function unlinkEntries(storyId: string, id: string) {
  q('DELETE FROM entry_edges WHERE id = ? AND story_id = ?').run(id, storyId);
  touch(storyId);
}

export function delAddon(storyId: string, id: string) {
  q('DELETE FROM addons WHERE id = ? AND story_id = ?').run(id, storyId);
  touch(storyId);
}

export function wearOutfit(storyId: string, entryId: string, outfitId: string | null) {
  const owns = q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(entryId, storyId);
  if (!owns) return null;
  // ONE AT A TIME IS THE SLOT'S PROPERTY AND THE DATABASE'S JOB. `setAddonActive` clears the
  // siblings on this entry inside the same transaction because `outfit` is an exclusive slot, and
  // the partial unique index refuses a second one regardless. Null takes everything off, which is
  // what this has always meant, and is why the clear runs even when there is nothing to put on.
  for (const a of q("SELECT id FROM addons WHERE entry_id = ? AND story_id = ? AND slot = 'outfit' AND active = 1")
    .all(entryId, storyId) as any[]) setAddonActive(storyId, a.id, false);
  if (outfitId) setAddonActive(storyId, outfitId, true);
  return outfitId;
}

export const delOutfit = (storyId: string, id: string) => delAddon(storyId, id);

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
      locked_character=?,chapter_hero=?,chapter_sticky=?,cover_opacity=?,auto_open=?,updated_at=? WHERE id=?`)
    .run(p('title', 'title'), tidyGenre(p('genre', 'genre')), p('premise', 'premise'), p('setting', 'setting'),
      p('pov', 'pov'), p('persona', 'persona') ?? null, p('writingStyle', 'writing_style'),
      p('direction', 'direction') ?? null, p('spice', 'spice'), p('spiceNote', 'spice_note') ?? null,
      p('maxContext', 'max_context') ?? null, p('status', 'status') ?? 'in_progress',
      p('stripPatterns', 'strip_patterns') ?? null, p('model', 'model') ?? null,
      p('lockedCharacter', 'locked_character') ?? null,
      Number(p('chapterHero', 'chapter_hero') ? 1 : 0),
      Number(p('chapterSticky', 'chapter_sticky') ? 1 : 0),
      Math.max(0, Math.min(100, Number(p('coverOpacity', 'cover_opacity')) || 0)),
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
/** Every story and who owns it, for the scheduled export. Not `listStories`, which is per owner
 *  and shaped for the shelf — this is the whole library, across every writer on the box. */
export const allStoriesForExport = (): { id: string; ownerId: string; title: string }[] =>
  (q('SELECT id, owner_id, title FROM stories WHERE status IS NULL OR status != ?').all('deleted') as any[])
    .map((r) => ({ id: r.id, ownerId: r.owner_id, title: r.title }));

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

/** FINISHED, from a chapter onward. A dead character, a burned building, a rule that stopped
 *  applying — PLAN-08's "a thread can be finished", and the write half of a column that has had a
 *  reader since Phase 2 and no writer at all.
 *
 *  NULL BRINGS IT BACK, which is `setPin`'s contract above and the reason there is no second
 *  function: the way back has to exist the day the way out does, or the first wrong press is
 *  permanent. `src/context.ts` drops on `retiredAtChapter <= currentChapter.index`, so this is a
 *  THRESHOLD and never a delete — the card still reaches the model in every chapter before it, and
 *  going back to write chapter 6 still has the man who dies in chapter 12.
 *
 *  DELIBERATELY NOT PART OF `upsertEntry`, and the reason is not the column. That function writes
 *  `last_editor` and logs an `entry_revisions` row, and `last_editor` is what COUNCIL-03 S1's
 *  arbitration keys on — so bringing a character back through the entry save would quietly mark
 *  the card human-edited and change how every later proposal about them is judged. Retiring is not
 *  editing. Its own door, one column, no revision row: the undo IS the other direction. */
export function setRetired(storyId: string, id: string, at: number | null | undefined) {
  const r = q('UPDATE entries SET retired_at_chapter = ? WHERE id = ? AND story_id = ?')
    .run(at ?? null, id, storyId);
  if (r.changes) touch(storyId);
  return !!r.changes;
}

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
/** WHERE ACCEPTING THIS PROPOSAL WOULD WRITE. One definition, because two things need it and they
 *  must never disagree: the dedupe below, and the accept path in `src/routes.ts`, whose branches
 *  are in exactly this order.
 *
 *  This exists because "duplicate" used to mean SAME CARD, and at chapter end several passes each
 *  have something to say about one person — her description, a new fact about her, one of her
 *  rooms, that she is finished. Four different places, and the queue called three of them
 *  duplicates of the first and dropped them on a `false` nobody reads. Measured on 2026-08-28:
 *  `remember`'s state landed and `extract`'s rewrite of the same character was binned, on every
 *  chapter close where both spoke. Two ROOMS of one card did the same to each other.
 *
 *  Two proposals collide when accepting them would write over each other, and not before. `new` and
 *  `changed` still collide, correctly and for free: both write the body, and they are the same
 *  offer wearing two labels depending on whether `classify` recognised the card. */
export const proposalTarget = (p: any): string =>
  p.entry_type === 'state'  ? 'state'
  : p.entry_type === 'retire' ? 'retire'
  : p.entry_type === 'string' ? 'string'
  : (p.field && p.entry_id) ? `room:${p.field}`
  : 'body';

export function addProposal(storyId: string, p: any) {
  // Hash the SUBJECT, not the wording. The model rewords the same fact on every run, so
  // hashing the body meant re-running always duplicated.
  const subject = String(p.title).toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(the|a|an) /, '');
  // SAME PLACE, NOT SAME PERSON — see `proposalTarget` above for what this replaced and why. The
  // first version of this lane was `retire`-only, which fixed one case of a general defect and left
  // the rest of it standing.
  const hash = createHash('sha256')
    .update([subject, p.entry_id ?? '', proposalTarget({ ...p, entry_type: p.entryType ?? p.entry_type })]
      .join('\u0000')).digest('hex').slice(0, 32);
  try {
    q(`INSERT INTO proposals (id,story_id,chapter_id,entry_id,title,body,entry_type,keys,kind,delta,
        field,activation,content_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uid('pp-'), storyId, p.chapterId ?? null, p.entry_id ?? null, p.title, p.body,
        p.entryType ?? 'lore', JSON.stringify(p.keys ?? []), p.kind, p.delta ?? null,
        // A slot this proposal aims at, or null for the card's own body. Validated here rather
        // than at each caller, so a model inventing "Motivation" cannot reach the column.
        ALL_SLOTS.includes(String(p.field ?? '')) ? String(p.field) : null,
        p.activation === 'triggered' || p.activation === 'always_on' ? p.activation : null,
        hash, now());
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
