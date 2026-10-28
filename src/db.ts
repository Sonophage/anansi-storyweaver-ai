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
import * as live from './live.ts';
// The search slice: schema, triggers, index backfill, query grammar and SQL shape.
import { SCHEMA as SEARCH_SCHEMA, ensureIndexes, ftsQuery, searchSQL, searchArgs } from './search.ts';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, unlinkSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// The slot names live in one module because `entries.field_editors` keys provenance by them and
// the partial unique index below names them as a literal. Three copies of one list is the drift
// `src/blocks.ts` exists to stop for the block order; this is the same rule for slots.
import { ALL_SLOTS, EXCLUSIVE_SLOTS, FOLDED, TO_OVER_TIME, foldLine, plain, wrapperNames } from './slots.ts';
import { factsLost } from './context.ts';
import { isRemote } from './llama.ts';

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
/* A TEST NEVER OPENS THE DEFAULT LIBRARY BY FORGETTING. Six times a test, a bench or status opened
 * the live library read-write because one call site did not set ANANSI_DB, and each fix guarded
 * that one site; this is the floor under all of them. The process is named by its entry script:
 * anything under `test/`, a `bench/` script in its `check` mode, and `status.ts`. The live server
 * (`serve.ts`, run by anansi.service with no ANANSI_DB) and a bench run by hand, whose point is the
 * live library, are not refused. Naming the file in ANANSI_DB, the default path included, is always
 * allowed. `test/db.ts` runs every case against a copy of src/ under a scratch root.
 * ponytail: the entry script is the whole rule, so a test helper run from outside `test/` is not
 * covered; widen it (or add a marker env var) if one ever is. */
if (process.env.ANANSI_DB === undefined) {
  let entry = process.argv[1] ?? '';
  try { entry = realpathSync(entry); } catch {}
  const at = relative(fileURLToPath(new URL('..', import.meta.url)), entry);
  if (at.startsWith('test/') || (at.startsWith('bench/') && process.argv[2] === 'check') || at === 'status.ts')
    throw new Error(`${at} would open the default library ${FILE}. Set ANANSI_DB to a scratch file `
      + '(or to that path, if it really is meant).');
}
export const db = new DatabaseSync(FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
// A second process on the same file gets SQLITE_BUSY immediately without this; bench scripts
// and the test suites all open the database alongside a running server.
db.exec('PRAGMA busy_timeout = 5000;');

/** A BOOK WITH NOWHERE TO WRITE, repaired. Run from `migrate`, and separately named so it can be
 *  tested — `migrate` runs once at module load, so a check cannot construct the broken state and
 *  then ask for the repair.
 *
 *  HOW A BOOK GOT HERE: `delChapter`'s guard counted chapters on the branch instead of checking that
 *  an OPEN one survived, so deleting the empty chapter a close had just opened was allowed and left
 *  a book whose only chapter was closed. Every screen reads the newest chapter as the current one,
 *  so there was nowhere to write and nothing saying why. Found in the live library on 2026-09-01:
 *  "The Transaction of Silence", chapter one closed with 22 passages and no chapter two.
 *
 *  The guard is fixed, so this cannot happen again — but the book it happened to cannot fix itself.
 *  One open chapter, numbered after the last, which is what `endChapter` would have left.
 *
 *  SCOPED TO A BRANCH WHOSE NEWEST CHAPTER IS CLOSED AND WHICH HAS NO OPEN CHAPTER AT ALL, so it
 *  writes nothing when the invariant holds — which is every book but the one. Returns what it did,
 *  so the caller can say so rather than repairing silently. */
export function repairStrandedChapters(): { storyId: string; idx: number }[] {
  const stranded = db.prepare(`
    SELECT c.story_id, c.branch_id, c.idx FROM chapters c
     WHERE c.status = 'closed'
       AND c.idx = (SELECT MAX(idx) FROM chapters WHERE story_id = c.story_id AND branch_id = c.branch_id)
       AND NOT EXISTS (SELECT 1 FROM chapters o WHERE o.story_id = c.story_id
                         AND o.branch_id = c.branch_id AND o.status = 'open')`).all() as any[];
  const done: { storyId: string; idx: number }[] = [];
  for (const r of stranded) {
    const idx = r.idx + 1;
    // ITS OWN ID AND CLOCK, not `uid` and `now`. `migrate()` is called at the foot of this module and
    // both of those consts are declared BELOW that call, so reaching for them from here throws
    // "Cannot access 'uid' before initialization" — which the suites could not see, because the only
    // database with a stranded book is the live one and a test database has nothing for the loop to
    // run over. It fired the first time this was imported against the real library. Same shape of id:
    // a prefix and eight hex characters.
    db.prepare(`INSERT INTO chapters (id,story_id,branch_id,idx,title,status,created_at)
                VALUES ('c-' || lower(hex(randomblob(4))), ?, ?, ?, ?, 'open', ?)`)
      .run(r.story_id, r.branch_id, idx, `Chapter ${idx}`, Date.now());
    console.log(`  opened Chapter ${idx} for a book whose last chapter was closed with none open`);
    done.push({ storyId: r.story_id, idx });
  }
  return done;
}

/** #77 · UPDATE DAY FOR ALWAYS TRUE (ADR 0005). A thread's Facts row is its Always true, which is
 *  always sent, so one that was switched off is switched on, and a second one is added to the first.
 *  Role, provenance and scope are appended to Always true, and history to the thread's own text (the
 *  start of Over time), each under its label, and they stop being pockets (`slots.FOLDED`). The
 *  tale's update report says, per thread, what moved — and, in the same run only, which threads have
 *  Always true and Info both written (check they agree; Halsey's say secretary and singer) and which
 *  have none.
 *
 *  ONCE BY ITS DATA: it acts only on rows still in the old shape, and `upsertAddon` writes Always true
 *  on and one per thread, so a later boot finds none and writes nothing. A backup comes first
 *  (`beforeRewrite`), and it is all one transaction.
 *  Its own statements and clock, like `repairStrandedChapters`: it runs inside `migrate()`. */
export function foldAlwaysTrue() {
  const P = (sql: string) => db.prepare(sql);
  const off = P(`SELECT * FROM addons WHERE slot = 'facts' AND active = 0 AND entry_id IS NOT NULL`).all() as any[];
  const folds = P(`SELECT * FROM addons WHERE slot IN (${FOLDED.map(() => '?').join(',')}) AND entry_id IS NOT NULL
    ORDER BY entry_id, created_at, rowid`).all(...FOLDED) as any[];
  if (!off.length && !folds.length) return;
  beforeRewrite();
  const factsOf = (entryId: string) => P(`SELECT * FROM addons WHERE entry_id = ? AND slot = 'facts'
    ORDER BY active DESC, created_at, rowid`).all(entryId) as any[];
  db.exec('BEGIN');
  try {
    // ON. Two facts rows on one thread (one on, one off) is a shape the old screens allowed; the
    // index allows only one switched on, so the second's text is appended to the first instead.
    for (const a of off) {
      const [keep] = factsOf(a.entry_id);
      if (keep.id === a.id) {
        P('UPDATE addons SET active = 1 WHERE id = ?').run(a.id);
        noteUpdate(a.story_id, 'Its Always true (shown as Facts until now) was switched off. Always true is sent every time, so it is sent now.', a.entry_id);
      } else {
        P('UPDATE addons SET body = ? WHERE id = ?').run(`${keep.body.trim()}\n${a.body.trim()}`, keep.id);
        P('DELETE FROM addons WHERE id = ?').run(a.id);
        noteUpdate(a.story_id, 'It had a second Facts, switched off. Its text was added to Always true, which is sent every time.', a.entry_id);
      }
    }
    // FOLDED, in the order they were written, under the thread's one Always true.
    const byEntry = new Map<string, any[]>();
    for (const a of folds) byEntry.set(a.entry_id, [...(byEntry.get(a.entry_id) ?? []), a]);
    for (const [entryId, rows] of byEntry) {
      const t = String((P('SELECT title FROM entries WHERE id = ?').get(entryId) as any)?.title ?? '');
      const always = rows.filter((a) => !TO_OVER_TIME.includes(a.slot));
      const later = rows.filter((a) => TO_OVER_TIME.includes(a.slot));
      if (always.length) {
        const lines = always.map((a) => foldLine(a.slot, a.name, a.body, t));
        const [have] = factsOf(entryId);
        if (have) P('UPDATE addons SET body = ? WHERE id = ?').run([have.body.trim(), ...lines].filter(Boolean).join('\n'), have.id);
        else P(`INSERT INTO addons (id,story_id,entry_id,slot,name,body,keys,active,created_at)
          VALUES (?,?,?,'facts','facts',?,'[]',1,?)`).run('ad-' + randomBytes(4).toString('hex'), rows[0].story_id, entryId,
            lines.join('\n'), Date.now());
        const names = lines.map((l) => l.slice(1, l.indexOf(':')));
        noteUpdate(rows[0].story_id, `${names.join(', ')} moved into Always true and ${names.length === 1 ? 'is' : 'are'} no longer a pocket. Always true is sent every time.`, entryId);
      }
      if (later.length) {
        const lines = later.map((a) => foldLine(a.slot, a.name, a.body, t));
        const body = String((P('SELECT body FROM entries WHERE id = ?').get(entryId) as any)?.body ?? '').trim();
        P('UPDATE entries SET body = ?, updated_at = ? WHERE id = ?').run([body, ...lines].filter(Boolean).join('\n'), Date.now(), entryId);
        const names = later.map((a, i) => { const l = lines[i].slice(1, lines[i].indexOf(':'));
          return l.toLowerCase() === a.slot ? l : `${a.slot[0].toUpperCase() + a.slot.slice(1)} (${l})`; });
        noteUpdate(rows[0].story_id, `${names.join(', ')} moved into Over time, where the thread stands from scene 1, and ${names.length === 1 ? 'is' : 'are'} no longer a pocket. It is sent every time.`, entryId);
      }
      for (const a of rows) P('DELETE FROM addons WHERE id = ?').run(a.id);
    }
    // WHAT TO CHECK, written in this run only: it is about the library as the update found it.
    // The threads with no Always true are ONE line per tale: a dry run on the live library found 253
    // of them, and a report of 253 identical lines is a report nobody reads.
    const none = new Map<string, string[]>();
    for (const e of P(`SELECT e.id, e.story_id, e.title, e.body, (SELECT body FROM addons a WHERE a.entry_id = e.id
        AND a.slot = 'facts' LIMIT 1) AS always FROM entries e ORDER BY e.title`).all() as any[]) {
      const always = String(e.always ?? '').trim(), info = String(e.body ?? '').trim();
      if (always && info) noteUpdate(e.story_id, 'Its Always true and where it stands (shown as Info until now) are both written. Check that they agree: the model is sent both.', e.id);
      else if (!always && info) none.set(e.story_id, [...(none.get(e.story_id) ?? []), e.title]);
    }
    for (const [story, names] of none) noteUpdate(story, `${names.length === 1 ? 'One thread has' : `${names.length} threads have`} `
      + `no Always true yet: ${names.slice(0, 30).join(', ')}${names.length > 30 ? `, and ${names.length - 30} more` : ''}. `
      + 'Who or what each one is can be written there.');
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}

/** SCENE PINS (SPEC 7.1), the one statement for the table, used by the schema below and by
 *  `pinsHoldFollowed` when it rebuilds an old library.
 *
 *  #102. THE THREAD IS KEYED BY ITS ID ALONE, so a pin can hold a thread of the World the tale
 *  follows as well as one of its own. The scene keeps its composite key: a pin can only name a scene
 *  of its own tale. Which threads a tale may pin is `PINNABLE`, checked by every insert, because a
 *  single-column key cannot say it; without that check a pin could point at another writer's
 *  thread, a cross-user leak. Deleting the thread, wherever it lives, or the scene takes the pin. */
const PINS_TABLE = `CREATE TABLE IF NOT EXISTS chapter_pins (
  chapter_id TEXT NOT NULL, entry_id TEXT NOT NULL, story_id TEXT NOT NULL,
  mode TEXT NOT NULL,                      -- force_in | force_out
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chapter_id, entry_id),
  FOREIGN KEY (chapter_id, story_id) REFERENCES chapters(id, story_id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id)             REFERENCES entries(id)            ON DELETE CASCADE);`;

/** #102. THE THREADS A TALE MAY PIN: its own, and those of the World it follows when that World has
 *  the same owner (the rule `entriesFor` reads by). Two placeholders: the tale, then the thread. */
const PINNABLE = `EXISTS (SELECT 1 FROM entries pe JOIN stories pt ON pt.id = ?
  WHERE pe.id = ? AND (pe.story_id = pt.id OR (pe.story_id = pt.lore_from
    AND EXISTS (SELECT 1 FROM stories pw WHERE pw.id = pt.lore_from AND pw.owner_id = pt.owner_id))))`;

/** #102 · PINS HOLD FOLLOWED THREADS. A library from before keys a pin's thread (entry_id, story_id),
 *  so it can hold only the tale's own thread. SQLite cannot change a foreign key in place, so the
 *  table is rebuilt into `PINS_TABLE` and every row is copied across as it is: each one satisfied
 *  the old key, so each satisfies the new one.
 *
 *  ONCE BY ITS SHAPE: it acts only while the old key is there, so a later boot does nothing. A backup
 *  comes first (`beforeRewrite`, which throws, so no backup means no rebuild), and it is all one
 *  transaction. Nothing a writer sees changes, so it writes no update line. Its own statements, like
 *  `foldAlwaysTrue`: it runs inside `migrate()`. Returns whether it rebuilt. */
export function pinsHoldFollowed() {
  const keys = db.prepare('PRAGMA foreign_key_list(chapter_pins)').all() as any[];
  if (!keys.some((k) => k.table === 'entries' && k.from === 'story_id')) return false;
  beforeRewrite();
  db.exec('BEGIN');
  try {
    db.exec('ALTER TABLE chapter_pins RENAME TO chapter_pins_old');
    db.exec(PINS_TABLE);
    db.exec(`INSERT INTO chapter_pins (chapter_id, entry_id, story_id, mode, created_at)
             SELECT chapter_id, entry_id, story_id, mode, created_at FROM chapter_pins_old`);
    db.exec('DROP TABLE chapter_pins_old');
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  console.log('  rebuilt chapter_pins — a pin can hold a thread of the World its tale follows');
  return true;
}

// Migrations. `CREATE TABLE IF NOT EXISTS` cannot alter an existing table or replace an index,
// so anything that changes shape has to be stated here and be safe to run twice. Without this
// a fresh clone and a live database drift apart silently.
/** #76. ONE BACKUP BEFORE A MIGRATION REWRITES A WRITER'S TEXT, at most once per boot, shared with
 *  the column drops below. It THROWS when the backup fails, so a rewrite can refuse to run with no
 *  way back; the drops catch it on purpose, because a dropped column loses no writing.
 *
 *  NOT IN THE ROTATING SET. `backup()` keeps the newest twelve `anansi-*` files and the server takes
 *  one every half hour, so a pre-update copy under that name was gone in six hours while the update
 *  report promised it for a week. `pre-update-*` is a name `backup()` never prunes, like every
 *  `pre-*` copy taken by hand. Above `migrate()` because it runs at load. */
let REWRITE: { file: string; at: number } | null = null;
export function beforeRewrite() {
  if (!REWRITE) {
    const dir = join(dirname(FILE), 'backups');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `pre-update-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    snapshot(file);
    REWRITE = { file, at: Date.now() };
  }
  return REWRITE;
}

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
  const drop = (table: string, col: string, why: string) => {
    if (!has(table, col)) return;
    try { beforeRewrite(); } catch { /* keep going; the drop is safe */ }
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
  // WHICH ROOM THIS WOULD REPLACE, or null for a new one. Seth, 2026-08-29: "rooms the ai should
  // not over write but offer to add the room, overwrite it. not just over write." A room proposal
  // for a card that already has that room is a CHOICE — another relationship beside the one she
  // has, or a correction of it — and the model is not the one who should make it.
  add('proposals', 'target', 'TEXT');
  /* WHERE A PROPOSAL CAME FROM, when it came from outside the book (2026-09-02). Newline-separated
   * URLs, and null for every proposal the model made out of the story itself — which is all of them
   * until now. A card pulled off the web is the first proposal in this app whose provenance is
   * outside the ledger, and Seth's "the ai needs to stay in cannon" is only checkable if he can see
   * what it read. `llama.ts` has claimed since it was written that "every proposal carries the URL
   * it came from"; until this column there was nowhere to put one, and the invent route says so in
   * as many words: "the results reach the model; the link does not reach the card."
   *
   * A MIGRATION AND NOT A COLUMN IN THE CREATE, which is where `field`, `activation` and `target`
   * also live: this table's CREATE stopped at `created_at` three columns ago and the pattern is
   * established. A fresh database gets it here, on the first load. */
  add('proposals', 'source', 'TEXT');
  /* THE ROOMS A PULLED CARD BRINGS WITH IT (2026-09-02), as JSON, and null for every other
   * proposal in the app. A room belongs to an entry, so a card that does not exist yet cannot
   * have its rooms proposed separately — accepting a room needs something to hang it on. They wait
   * here and are written in the same press that accepts the card. */
  add('proposals', 'rooms', 'TEXT');
  // #73. What a hem chalks for one thread is one Workbench card (`grp`), carrying the narration line
  // it came from (`line`, quoted or null), and a pocket's own name (`pocket`: "The grey coat").
  add('proposals', 'grp', 'TEXT');
  add('proposals', 'line', 'TEXT');
  add('proposals', 'pocket', 'TEXT');
  /* WHICH WORLD OR INTELLECTUAL PROPERTY A BOOK BELONGS TO, and what is true in it (2026-09-02).
   * Seth: "Is there a way in the story under the world tab I could add what world or ip it belongs
   * to? And have it hold some info about the world that way".
   *
   * NOT `lore_from`, which is the other answer to a nearby question: that follows another BOOK's
   * threads, live, and is the right tool when the world has a ledger of its own. This is the light
   * one — a name and a paragraph on the book itself — for "this is Warhammer 40,000" without
   * building a second book to say it. Both can be set; they are not alternatives. */
  add('stories', 'world', 'TEXT');
  add('stories', 'world_note', 'TEXT');
  // A book can follow another book's threads — a world bible, and the books set in it. One column
  // rather than a `worlds` table on purpose: a world here IS a book, one that happens to hold cards
  // and little prose, so it needs no new ownership scope. `test/scope.ts` exists because every
  // route being story-scoped is what keeps two writers apart, and a second scope beside it is the
  // thing most likely to open a hole nobody sees.
  add('stories', 'lore_from', 'TEXT');
  // #18. VOICE was describing its own contents wrongly: `src/context.ts` wraps whatever is in
  // `writing_style` as "a sample of the writer's own prose… never continue it, quote it, or take
  // facts from it" — while `DEFAULT_VOICE` is a page of INSTRUCTIONS, and F37 measured that the
  // instruction phrasing is what buys the 98%. Two different mechanisms were sharing one field and
  // the wrapper was lying about which one it held.
  //
  // ADDITIVE, AND NOTHING MOVES. `writing_style` keeps every story's existing text and IS the
  // instruction — which is what that text already is, in every story in the library. The sample
  // starts empty and is a second column. A migration that moved prose between columns is one that
  // can lose it, and there is nothing here that needs moving.
  // (`voice_sample` was added here. Dropped below on 2026-08-30 — COUNCIL-06 ship 4. The add and
  //  the drop must never both be live, or every boot adds the column, backs up, and drops it.)
  // And the book's own genre flavour, distinct from the universal register. Romance and science
  // fiction are not the same writing style, and neither is the voice.
  add('stories', 'style_note', 'TEXT');
  add('stories', 'active_branch', 'TEXT');
  add('chapters', 'keep_whole', 'INTEGER DEFAULT 0');
  // The other half of the chapter's brief — see the note in the CREATE above.
  add('chapters', 'opens_with', 'TEXT');
  // #43. Who wrote a chapter summary. Every summary before this column was the model's: there was
  // no way to write one by hand. Keyed on the null so a second run changes nothing.
  add('chapters', 'summary_author', 'TEXT');
  try {
    db.exec(`UPDATE chapters SET summary_author = 'model'
             WHERE summary IS NOT NULL AND summary_author IS NULL`);
  } catch { /* table not created yet on a fresh database */ }
  add('entries', 'field_editors', "TEXT DEFAULT '{}'");
  /* ISSUE #36 · A FOLLOWED CARD, PER CARD.
   *
   * `stories.lore_from` is one column and therefore one answer for a whole ledger: a book follows
   * another book's threads, all of them, live, and no card can be excepted. Seth's ask was per-card:
   * *"I should be able to delete it from the copied story without runing it for the current story
   * I.e. Unlinking it. I should aslo have an option to update the card bi drectionally or only one
   * way."* And his design for it, 2026-09-01: *"on unlink it would just make a copy of the card in
   * that state but keep the original id in case it gets reconnected and then resynced."*
   *
   * THREE STATES ON ONE COLUMN, and the shape of them is what keeps this small:
   *
   *   no row at all   the card is READ THROUGH from the book this one follows. There is one card,
   *                   so it cannot drift — "in sync always" by construction rather than by a
   *                   mirror that has to be maintained. Editing it from here now writes to where it
   *                   lives, which is the bidirectional half of the ask.
   *   sync = 'off'    a real row of this book's own, carrying `origin_id`: the copy taken at the
   *                   moment of unlinking. It diverges from here on, and the origin is remembered
   *                   so it can be reconnected.
   *   sync = 'dropped'  a tombstone. This book does not want that card. No content, never rendered,
   *                   never exported — it exists only to stop the read-through putting it back.
   *
   * NO MIRRORING AND NO CONFLICT RULE, deliberately. The obvious build of "bidirectional" is a copy
   * on each side kept equal by fanning every write out to the other, which needs a direction, a
   * last-write-wins rule, and the same fan-out again in `upsertAddon` for the rooms. Reading through
   * a single card needs none of those and cannot be out of step.
   */
  add('entries', 'origin_id', 'TEXT');
  add('entries', 'sync', 'TEXT');
  // A spice LEVEL picks one of five fixed lines. This replaces the line outright when a
  // story needs something the five do not say.
  add('stories', 'spice_note', 'TEXT');
  // A take you regenerated away from. Recorded, not yet fed to the model — see the ponytail
  // marker on `rejectTake`.
  add('passages', 'rejected', 'INTEGER DEFAULT 0');
  // #14. WHICH PRESS PRODUCED THIS PASSAGE, so the page can colour it by the action rather than by
  // guesswork. It could not be derived from what was already stored: Speak leaves a speaker and
  // Direct leaves a directive, but Act and Narrate both write a bare human row and 1,871 of the
  // library's 1,990 passages are that shape. Seth, asked: "old ones neutral is fine." So this is
  // null for everything written before today and the page draws those without an accent.
  add('passages', 'mode', 'TEXT');
  /* UNCLAIMED — written by the model and not yet stood behind by the writer.
   *
   * bugs.md #9: "i should be able to send and go elsewhere since the command already sent." The
   * generation is persisted by the SERVER at completion now, so a passage survives the browser
   * going away. That makes a state necessary: without it, every abandoned generation silently
   * becomes part of the book and a returning device cannot tell what arrived while it was gone.
   *
   * Seth's design, 2026-09-01: "unclaimed and offered, and only claimed after the next message my
   * thought being editing, regeneration or branching com into play." The row is REAL — it renders,
   * it reaches the prompt, History and branches and re-rolls all work on it — because those are
   * exactly the things a writer does to a passage before deciding about it. What the flag carries is
   * whether they have written PAST it yet.
   *
   * DEFAULT 1, so every passage that existed before this column is claimed. A migration that
   * defaulted to 0 would have offered the writer their whole back catalogue. */
  add('passages', 'claimed', 'INTEGER DEFAULT 1');
  // Which model writes this story. Null means the process default — most stories, most of the
  // time. The router runs --models-max 3 --models-autoload, so a story on a different model
  // usually costs nothing to switch to; one that is asleep costs a load on its first call.
  add('stories', 'model', 'TEXT');
  // A book's own look, layered OVER the writer's default rather than replacing it: a story that
  // names only a theme keeps your font, your size and your scale. Null on every existing row,
  // which reads as "follow the default" — so nothing on the shelf changes appearance.
  add('stories', 'look', 'TEXT');
  // WHOSE MOVE IT IS, in a book with two writers. Null on every existing row and on every book with
  // one writer, which reads as "anybody's" — so nothing about a book you write alone changes.
  add('stories', 'turn', 'TEXT');
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
  // Two more ways to set the cover behind the prose (Seth, 2026-10-27): how much it is blurred, in
  // pixels (0 is sharp, a slider since Seth asked for "how much blur"), and the picture whole down
  // the RIGHT side with the gradient running the other way. Both off on every tale until set.
  add('stories', 'cover_blur', 'INTEGER DEFAULT 0');
  add('stories', 'cover_flip', 'INTEGER DEFAULT 0');
  // Whether the page fades in over the cover at all (Seth, 2026-10-27: "it can be a mixture of that
  // gradient or blur or either"). On by default: it is what every tale has had.
  add('stories', 'cover_fade', 'INTEGER DEFAULT 1');
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
  // And the exclusivity index, for the same reason: CREATE IF NOT EXISTS does NOTHING when an index
  // of that name already exists, so adding an exclusive slot to `src/slots.ts` and to the literal in
  // the schema above would leave every existing database enforcing the OLD list — silently, because
  // the index is still there and still working, just for four slots instead of six. Compared against
  // EXCLUSIVE_SLOTS rather than a version number, so it self-heals whenever that list changes.
  try {
    const want = `'${[...EXCLUSIVE_SLOTS].sort().join("','")}'`;
    const idx = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='addons_one_active'").get() as any;
    if (idx && !String(idx.sql).includes(want)) {
      db.exec('DROP INDEX addons_one_active');
      db.exec(`CREATE UNIQUE INDEX addons_one_active ON addons(entry_id, slot)
               WHERE active = 1 AND slot IN (${want})`);
      console.log('  rebuilt addons_one_active for ' + EXCLUSIVE_SLOTS.join(', '));
    }
  } catch { /* the table does not exist yet on a fresh database */ }
  // Removed from the schema by the ponytail audit of 2026-08-23 as columns nothing reads. Both
  // were P1 stubs: `system_block_override` for a per-story SYSTEM replacement, `token_counts` for
  // SPEC §7.5's tokenizer-keyed map. Neither feature is built and both remain in the plan — this
  // drops the stubs, not the plan. Verified unreferenced across src, web, test and bench before
  // the drop, and named by no index, view or trigger.
  drop('stories', 'system_block_override', 'a P1 stub for a per-story SYSTEM, never read');
  drop('passages', 'token_counts', 'a P1 stub for SPEC §7.5 tokenizer-keyed counts, never read');
  drop('stories', 'strip_patterns', '#26: strip-from-output is ripped, feature and column');
  drop('stories', 'voice_sample',
       'COUNCIL-06 ship 4: F36 — a finished line in every prompt is lifted into the prose, and a '
       + 'whole paragraph of one is the largest version of that. Empty on all nine books');
  /* Two columns dropped 2026-09-06, at Seth's word, after measuring both in the CODE and in the
   * DATA rather than reading either off a document.
   *
   * `entries.priority` — two mentions in the entire tree, both the schema line itself, and all 256
   * rows in the live library sat at the default 0. It was for the budget engine's ordering, which
   * is the one part of that engine still unbuilt (reservation and the trim ladder are the others;
   * eviction has existed since 2026-08-29). Nothing was lost because nothing was ever written.
   *
   * `chapters.summary_tokens` — 17 chapters, zero non-null, three of them carrying a summary. It
   * was only ever set to NULL on a clear and copied on fork and export, so every standalone
   * database handed to anybody carried an always-empty column forward. That is the exact defect
   * the two drops above this were written for, arriving a third time.
   *
   * BOTH COME BACK BY DELETING THESE TWO LINES if the budget engine wants them — a dropped column
   * with no data in it costs one `add()` to restore, which is why measuring the data first is what
   * made this safe rather than brave. */
  drop('entries', 'priority', 'stored and ignored since it was written; 0 on every row');
  drop('stories', 'direction', 'the Where this is going box, out of the app since 2026-08-30 and '
    + 'empty on every tale when Seth called the drop on 2026-10-25');
  drop('chapters', 'summary_tokens', 'never populated on any chapter; NULL on all 17');

  // The search indexes, built if empty. The probe, the healing and the reasons live in
  // src/search.ts; this hands it the two primitives it needs and never lets it hold them.
  ensureIndexes(
    (sql) => (db.prepare(sql).get() as any).n as number,
    (sql) => db.exec(sql),
  );

  // #9. On a database that already exists the CREATE above does not add it.
  add('generations', 'mend', 'TEXT');
  // THE WRITER'S OWN MODEL, kept across restarts. It lived in a Map in serve.ts, so every restart
  // of the server put both writers back on the process default — and since 2026-08-31 it also
  // decides which model is woken when they open the app, which is a decision worth surviving a
  // reboot. A story that names its own model still wins over this; see `modelFor`.
  add('users', 'default_model', 'TEXT');
  // A WORLD BOOK IS A STORY YOU NEVER WRITE PROSE IN. Everything it needs already existed —
  // entries are story-scoped, `lore_from` already lets one book read another's cards, and
  // `entriesFor` already merges them with the follower winning a title collision. The only thing
  // missing was a way to say "this one is a bible, not a book", so it keeps off the shelf and
  // lives on the Threads page instead. Seth, 2026-08-31: "a way to create a world book. one that
  // is just the cards in that book ... better yet in threads with the same look as the stories."
  add('stories', 'is_world', 'INTEGER DEFAULT 0');
  // THE LOCKOUT'S OWN SWITCH. Until now the only way to let the model write your character for a
  // scene was to clear `locked_character` and remember to put it back. Seth, 2026-08-31: "we need
  // to add an on and off switch since sometimes i do want it to write for me." Defaults ON, so
  // every story that already names someone keeps the behaviour it has.
  add('stories', 'lockout_on', 'INTEGER DEFAULT 1');
  // #55. WEAVING, the book's own switch: the model plans unseen before it writes. Defaults OFF,
  // because a weaving passage measured 60 s against 7 s (F60) and no book should get that slower
  // without its writer asking.
  add('stories', 'weaving', 'INTEGER DEFAULT 0');
  // #24. A TABLE rather than a column, so it does not go through `drop` above. Its five batches
  // were written into docs/WHATS-NEW.md before this shipped; the file is the record now and the
  // model call that filled this is gone. Guarded on existence so the line is quiet on a database
  // that never had it, and so re-running is a no-op.
  try {
    if ((db.prepare("SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name='release_notes'")
           .get() as any).c) {
      try { beforeRewrite(); } catch { /* the drop is safe either way */ }
      db.exec('DROP TABLE release_notes');
      console.log('  dropped release_notes — #24: what changed is docs/WHATS-NEW.md now');
    }
  } catch (e: any) { console.log(`  could NOT drop release_notes: ${e?.message}`); }

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
  repairStrandedChapters();
  try { foldAlwaysTrue(); } catch (e: any) { console.log(`  Always true was NOT folded: ${e?.message}`); }
  try { pinsHoldFollowed(); } catch (e: any) { console.log(`  chapter_pins was NOT rebuilt: ${e?.message}`); }
  // #47. What each act was built from. Existing acts get their chapters as they are now; see
  // `backfillActPrints` for what that does and does not promise.
  add('arcs', 'summaries_hash', 'TEXT');
  // #51. What the probe on add found, and the plan units the model takes.
  add('shortlist', 'weaving', 'TEXT');
  add('shortlist', 'cost', 'INTEGER');
  // #61. Whether the model's chat template takes the weaving switch. NULL on rows added before the
  // probe asked, which were all added with the switch sent and answered, so NULL reads as yes.
  add('shortlist', 'takes_switch', 'INTEGER');
  // #90. The names of threads a hem's thread-change pass found changed past its cap of six.
  add('hems', 'overflow', 'TEXT');
  // The run that owns the row: a hem again or a try again takes the next number (see finishHem).
  add('hems', 'run', 'INTEGER DEFAULT 0');
  // Which pass a running hem is on and since when (2026-10-27): a slow remote model read as a hem
  // doing nothing. And the new threads past six, held whole until the writer asks for them.
  add('hems', 'pass', 'TEXT');
  add('hems', 'pass_at', 'INTEGER');
  add('hems', 'extra', 'TEXT');
  backfillActPrints();

  if ((db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'table' AND name = 'outfits'")
    .get() as any).n) {
    const left = (db.prepare(`SELECT COUNT(*) n FROM outfits o
      WHERE NOT EXISTS (SELECT 1 FROM addons a WHERE a.id = o.id)`).get() as any).n;
    // A REFUSAL, NOT A LOSS. If anything is still only in the old table the copy above did not
    // reach it, and dropping would take it with us — say so and leave the table alone.
    if (left) console.log(`  keeping outfits: ${left} row(s) never made it into addons`);
    else {
      try { beforeRewrite(); } catch { /* keep going; the drop is safe */ }
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

// #77. The exclusive-pocket index named `role`, which is not a pocket any more. CREATE IF NOT EXISTS
// cannot change an index that already exists, so an old one is dropped here, just before the schema
// below makes it again from its one statement. A fresh file has none and this does nothing.
if (String((db.prepare("SELECT sql FROM sqlite_master WHERE name = 'addons_one_active'").get() as any)?.sql ?? '')
  .includes("'role'")) db.exec('DROP INDEX addons_one_active');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, name TEXT, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, genre TEXT, premise TEXT, setting TEXT, pov TEXT,
  persona TEXT,              -- who you are in it. The "You · Ilva Marren" byline.
  locked_character TEXT,     -- the one the model never writes. See migrate().
  writing_style TEXT,
  spice INTEGER DEFAULT 2,
  max_context INTEGER,
  status TEXT DEFAULT 'in_progress',   -- in_progress | finished | draft
  active_branch TEXT,                  -- which path you are writing on
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS prompt_overrides (
  owner_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,                   -- a mode name: continue | speak | act | direct | narrate
  text TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, key));

-- One writer's own list of remote models (GLOSSARY: Shortlist). Per owner, and read by nobody
-- else: it is what lets a remote id stand as that writer's default or as a pin on their book.
-- The context is the catalogue's context_length when the model was added, and it is what a
-- remote call is budgeted against, so generating never has to fetch the catalogue.
CREATE TABLE IF NOT EXISTS shortlist (
  owner_id TEXT NOT NULL REFERENCES users(id),
  model TEXT NOT NULL,                 -- the remote id, prefix included
  context INTEGER NOT NULL,
  weaving TEXT,                        -- what the probe on add found, in the words the writer reads
  cost INTEGER,                        -- the catalogue's concurrency_cost at add time: plan units
  takes_switch INTEGER,                -- 0 when the chat template refuses the weaving switch
  added_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, model));

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  parent_id TEXT, name TEXT NOT NULL, fork_ordinal INTEGER, is_primary INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, title TEXT, authors_note TEXT,
  -- HOW THE CHAPTER STARTS, added 2026-09-02. The authors_note column above was one box called
  -- "This chapter must end with", and it rode near the generation point on EVERY call — Seth: "it
  -- tries to end the chapter early if it uses it that way". So the two halves are two columns and
  -- they reach the model differently: this one only while the chapter is still empty, that one as
  -- a direction. (No backticks in here: this is inside a template literal.)
  opens_with TEXT,
  summary TEXT, summary_covers_through INTEGER, summary_hash TEXT,
  -- WHO WROTE THE SUMMARY: human | model, the two values passages use. Null with no summary.
  summary_author TEXT,
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
  title TEXT, summary TEXT NOT NULL, created_at INTEGER NOT NULL,
  summaries_hash TEXT);                -- what it was built from: see actPrint
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
  mode TEXT,                           -- speak | act | direct | narrate. Null on anything written
                                       -- before 2026-08-29, which the page draws without an accent.
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
  -- (SPEC §7.3/§7.5). sticky_for and proper_nouns ARE read: context.ts folds around
  -- properNouns and holds an entry open for stickyFor passages after it last fired. This
  -- comment claimed all three were dead until 2026-08-27; two of them had not been for weeks.
  keys TEXT DEFAULT '[]', sticky_for INTEGER DEFAULT 3,
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
-- Parent key for the composite foreign key on entry_images (and on chapter_pins until #102).
-- Without it SQLite accepts the CREATE and then fails every insert with "SQL logic error", which
-- is a confusing way to learn that a composite FK needs a unique index on exactly those columns.
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

-- #79. THE DATED HALF OF OVER TIME THAT IS NOT TEXT: an outfit put on (wear) or taken off (unwear),
-- and the thread retired or brought back (return), each from a scene on. The engine reads them at
-- the scene being written (context.wornAt, context.retiredAt).
CREATE TABLE IF NOT EXISTS entry_events (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, addon_id TEXT, from_chapter INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS entry_events_e ON entry_events(entry_id, from_chapter);

-- #76. WHAT AN UPDATE MOVED, per tale, in the writer's words: one line per thing moved, naming the
-- thread it was about, and the backup taken before the rewrite that moved it. Written only by
-- migrations; read through the tale's view, so it sits behind the same ownership gate as the book.
-- A deleted thread keeps its line, without the link.
CREATE TABLE IF NOT EXISTS update_lines (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL,
  line TEXT NOT NULL, backup TEXT, backup_at INTEGER, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS update_lines_s ON update_lines(story_id, at);

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

-- #89. ONE ROW PER HEMMED SCENE, holding only what is stored nowhere else: when the hem started and
-- finished, the fingerprint of the scene's prose when it started (proseHash, the one summaryCover
-- uses), which pass did not run and why (#32, JSON), whether the writer's own summary was kept,
-- and the next-scene suggestion (JSON: title, note, opens). Running is finished_at NULL. Out of date
-- is derived on read and never stored. A hem again replaces the row. overflow (#90, JSON) holds
-- the names of threads that changed past the thread-change pass's cap of six. run counts the runs
-- begun on the row, so only the latest one marks it finished.
CREATE TABLE IF NOT EXISTS hems (
  chapter_id TEXT PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL, finished_at INTEGER,
  prose_hash TEXT NOT NULL,
  passes TEXT, kept INTEGER DEFAULT 0, suggestion TEXT, overflow TEXT, run INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS hems_story ON hems(story_id);

-- SPEC 7.1. Per-chapter overrides on the ledger: force a fact in for a scene where it
-- matters but nobody says its keyword, or force one out to keep a reveal sealed. The table is
-- PINS_TABLE, above migrate(), which also rebuilds an old library into it.
${PINS_TABLE}

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
  latency_ms INTEGER, error TEXT, created_at INTEGER NOT NULL,
  -- #9. What the contradiction repair did to this take, as JSON: how many the check found, how
  -- many were gone when the fixed prose was checked again, and how many survived. NULL is "the
  -- repair never ran", which is most calls and is not the same as zero — the whole point of
  -- recording it is that "it fires and it works" was believed for four days without a number
  -- anywhere to read it off.
  mend TEXT);
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
-- "outfits" IS DROPPED, and the paragraph here said the opposite until #18 §4 caught it. The move
-- was deliberately two steps: copy first and leave the old table working, because this rewrites the
-- file somebody's novel is in and a migration that moves data is a migration that can lose it. The
-- second step was taken on 2026-08-28 once reads had run off "addons" for a while, and it refuses
-- to drop while any row is still only in the old table. See migrate(), and the note where the
-- CREATE used to be, twenty lines above this one.
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
  WHERE active = 1 AND slot IN ('appearance','facts','outfit','voice');
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

-- FULL-TEXT SEARCH lives in src/search.ts, schema and triggers and all. It is spliced in here
-- because the schema is one exec and a virtual table cannot be created from another module
-- without opening the database twice. See that file for why it is a slice and what it may not
-- own: the ownership gate stays here, and this module keeps every primitive.
${SEARCH_SCHEMA}

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
-- A BOOK WITH MORE THAN ONE WRITER. Seth, 2026-09-03: "a shared book or books would be great. and
-- i can call her into a book if need be."
--
-- A TABLE RATHER THAN A SECOND COLUMN ON stories. stories.owner_id stays exactly what it is: who
-- made the book, and the only one who can delete it. This says who else may write in it. A
-- shared_with column would have meant "the other one", which is a shape that has to be undone the
-- first time a third person is invited.
--
-- THE GATE READS THIS. ownsStory is the one ownership question in the app and every route is
-- behind it; a row here is what makes a book answer for somebody who does not own it. That is the
-- whole of the risk in this table, which is why test/scope.ts asks it in both directions.
-- (No backticks in here: this whole schema is one template literal and one would end it. That is
--  a documented trap in this file and test/all.ts catches it, which is how this was caught.)
CREATE TABLE IF NOT EXISTS story_writers (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, owner_id));

CREATE TABLE IF NOT EXISTS writer_look (
  owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  look TEXT NOT NULL,
  updated_at INTEGER NOT NULL);

-- (release_notes lived here, keyed on the commit its batch was written from. Dropped 2026-08-29
-- with #24: what changed is read from docs/WHATS-NEW.md now rather than written by a model call
-- over the git log. The five batches it held were written into that file first — they are the
-- app's history and they were true when written.)

-- What a writer has waved away. Proposals, strings and flags are ROWS and are dismissed by their
-- own status; these two are COMPUTED — a summary is stale because its prose moved, and the horizon
-- is the chapters that no longer fit — so there is nothing to mark and they would nag forever.
--
-- Keyed on ref, which carries the STATE that made it worth saying: the summary's hash, or the
-- last chapter of the range. So dismissing is not "never tell me again" — it is "not for this".
-- Edit that chapter and the summary is stale against a new hash; write past the horizon and the
-- range ends somewhere new; both come back, which is the difference between quiet and deaf.
-- An out-of-date act (#47) is a third computed kind, keyed on the act and a hash of what its
-- chapters' summaries say now, so the next change to one of them brings it back.
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
  kind TEXT NOT NULL,               -- stale | horizon | act | mute
  ref TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (story_id, kind, ref));

-- A writer's own picture, for the Account page (2026-10-27). In the database like a cover, so the
-- nightly backup holds it.
CREATE TABLE IF NOT EXISTS user_images (
  owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  jpeg BLOB NOT NULL,
  set_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS story_covers (
  story_id TEXT PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  jpeg BLOB NOT NULL,
  set_at INTEGER NOT NULL);

-- A PICTURE ON A THREAD. Seth, 2026-09-01: "lets add an optional image field."
--
-- A SIDE TABLE AND NOT A COLUMN, for the reason story_covers is one: entriesOf and entriesFor
-- select e.*, so a BLOB on entries would ride in every view, every ledger page and every prompt
-- assembly whether or not anything drew it. The view is told the set_at only, which keys an
-- immutable URL the browser can cache.
--
-- (id, story_id) AND NOT id ALONE: a composite key is what closed SPEC 7.1's cross-story leak for
-- scene pins until #102 let a pin hold a followed World's thread (see PINNABLE). It closes
-- the same leak here. A picture on a thread must not be reachable through another book.
CREATE TABLE IF NOT EXISTS entry_images (
  entry_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  jpeg BLOB NOT NULL,
  set_at INTEGER NOT NULL,
  FOREIGN KEY (entry_id, story_id) REFERENCES entries(id, story_id) ON DELETE CASCADE);

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

/** The writer's fallback model, and the one woken when they open the app. Null means they have
 *  never chosen: the caller falls back to the process default rather than this deciding for them. */
export const defaultModelOf = (ownerId: string): string | null =>
  (q('SELECT default_model FROM users WHERE id = ?').get(ownerId) as any)?.default_model ?? null;

export const setDefaultModel = (ownerId: string, id: string | null) =>
  q('UPDATE users SET default_model = ? WHERE id = ?').run(id, ownerId);

/** THE SHORTLIST, always by owner. Every read and write names the owner, so one writer's list is
 *  unreachable from another's account by construction — the same shape as `promptsOf`. The one
 *  exception is `modelFact`, below, which says why, and which is the only reader of how Featherless
 *  serves a model: whether it takes the weaving switch, and whether it always weaves. This list
 *  carries the weaving label for the shortlist's own display, never for deciding a call. */
export const shortlistOf = (ownerId: string): { id: string; context: number; weaving: string | null;
  cost: number | null; addedAt: number }[] =>
  (q('SELECT model, context, weaving, cost, added_at FROM shortlist WHERE owner_id = ? ORDER BY added_at, model')
    .all(ownerId) as any[]).map((r) => ({ id: r.model, context: r.context, weaving: r.weaving,
      cost: r.cost, addedAt: r.added_at }));
/** #61 · HOW FEATHERLESS SERVES `id`: whether its chat template takes the weaving switch, and the
 *  weaving label its add recorded. For the Featherless adapter, which is handed a model id and
 *  nothing else (`takesSwitch`), and for `canWeave` and `alwaysWeaves` in routes.ts, so the book and
 *  the call read one fact. THE ONE SHORTLIST READ NOT BY OWNER, on purpose: this is a fact about the
 *  model, the same for every writer who adds it, and it never leaves the server. The entry added
 *  last wins: `addToShortlist` moves `added_at` on a re-add, because a re-add probes again. A model
 *  on nobody's list, and a local model, takes the switch, as every model did before the probe
 *  asked, and has no label. */
export const modelFact = (id: string): { takesSwitch: boolean; weaving: string | null } => {
  const r = q('SELECT takes_switch, weaving FROM shortlist WHERE model = ? ORDER BY added_at DESC LIMIT 1').get(id) as any;
  return { takesSwitch: r?.takes_switch !== 0, weaving: r?.weaving ?? null };
};
export const takesSwitch = (id: string): boolean => modelFact(id).takesSwitch;
/** The context `id` holds if it is on `ownerId`'s shortlist, else null. */
export const shortlisted = (ownerId: string, id: string): number | null =>
  (q('SELECT context FROM shortlist WHERE owner_id = ? AND model = ?').get(ownerId, id) as any)?.context ?? null;
export const addToShortlist = (ownerId: string, id: string, context: number,
  weaving: string | null = null, cost: number | null = null, takes = true) =>
  q(`INSERT INTO shortlist (owner_id, model, context, weaving, cost, takes_switch, added_at) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(owner_id, model) DO UPDATE SET context = excluded.context,
       weaving = excluded.weaving, cost = excluded.cost, takes_switch = excluded.takes_switch,
       added_at = excluded.added_at`)
    .run(ownerId, id, context, weaving, cost, takes ? 1 : 0, now());
export const removeFromShortlist = (ownerId: string, id: string) =>
  q('DELETE FROM shortlist WHERE owner_id = ? AND model = ?').run(ownerId, id);
/** Clear every pin to `id` on the books `ownerId` OWNS, and return their titles. Owned, not
 *  `MINE()`: a pin stands on the book owner's shortlist, so a book this writer was only called into
 *  never rested on theirs, and its pin is the owner's to keep. */
export const unpinModel = (ownerId: string, id: string): string[] => {
  const titles = (q('SELECT title FROM stories WHERE owner_id = ? AND model = ? ORDER BY title')
    .all(ownerId, id) as any[]).map((r) => r.title);
  if (titles.length) q('UPDATE stories SET model = NULL WHERE owner_id = ? AND model = ?').run(ownerId, id);
  return titles;
};

/** What the OTHER writers are set to. The release policy in routes.ts needs it — getting it wrong
 *  means taking a model out from under somebody mid-book — and it must read every account, not
 *  only the ones who have made a request since this process started. That was the bug in the Map:
 *  a writer who had not visited since the last restart looked like a writer with no model. */
export const otherDefaultModels = (ownerId: string): string[] =>
  (q('SELECT default_model FROM users WHERE id != ? AND default_model IS NOT NULL')
    .all(ownerId) as any[]).map((r) => r.default_model).filter(Boolean);

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
 *  THE RESUME FIELDS. The shelf's job is "back into the book I was in", and until this it could
 *  answer only with a cover and three counts — nothing that says where you stopped. `last_body` is
 *  the tail of the newest passage, `last_chapter_*` is where that passage sits, and the two word
 *  sums feed the band's chapter meter.
 *
 *  CURRENT BRANCH IS NOT A COLUMN. `stories.active_branch` is null on every book that has never
 *  been forked, and `activeBranchOf` falls back to the primary branch. The `cur` CTE does that
 *  fallback ONCE per row, so the four subqueries reading it cannot disagree about which branch
 *  they are on — a COALESCE repeated per subquery is four chances to get it wrong.
 *
 *  `is_break = 0` is load-bearing twice. A chapter break is a passage row, so without it the tail
 *  of a book that has just closed a chapter is the break rather than the last thing written, and
 *  the word sums count a row with no words in it.
 *
 *  NOTE the older `chapters` count is deliberately left cross-branch — it is what the card has
 *  always shown. `chapter_count` is the branch-scoped one the meter needs, and on a forked book
 *  the two are different numbers on purpose.
 *
 *  ponytail: eleven correlated subqueries and two CTEs per row now, where there were seven. At a
 *  shelf of a dozen books that is nothing; if this ever gets slow the fix is one grouped join per
 *  table rather than a cache. */
export const listStories = (o: string) => q(`
  WITH cur AS (
    SELECT s.id AS sid,
           COALESCE(s.active_branch,
             (SELECT b.id FROM branches b WHERE b.story_id = s.id AND b.is_primary = 1)) AS bid
      FROM stories s WHERE ${MINE()}),
  tip AS (
    SELECT cur.sid AS sid, p.chapter_id AS cid,
           -- The TAIL, marked when it is one. The client takes the last sentences off this,
           -- and the first of them is cut in half whenever the passage ran past 600 chars —
           -- so say so in the string itself rather than making the client guess from its
           -- length, which is wrong for a passage that happens to be exactly 600.
           CASE WHEN LENGTH(p.body) > 600 THEN char(8230) || substr(p.body, -600)
                ELSE p.body END AS body
      FROM cur JOIN passages p ON p.id = (
        SELECT p2.id FROM passages p2
          WHERE p2.story_id = cur.sid AND p2.branch_id = cur.bid
            AND p2.selected = 1 AND p2.is_break = 0
          ORDER BY p2.ordinal DESC LIMIT 1))
  SELECT s.*, (SELECT COUNT(*) FROM passages p WHERE p.story_id = s.id AND p.selected = 1) AS passages,
         (SELECT COUNT(*) FROM chapters c WHERE c.story_id = s.id) AS chapters,
         (SELECT COUNT(*) FROM entries e WHERE e.story_id = s.id AND ${LIVE('e.')}) AS entries,
         (SELECT COUNT(*) FROM proposals pr WHERE pr.story_id = s.id AND pr.status = 'open') AS proposed,
         (SELECT COUNT(*) FROM strings st WHERE st.story_id = s.id AND st.status = 'open') AS unpaid,
         (SELECT COUNT(*) FROM violations v JOIN passages p ON p.id = v.passage_id
           WHERE v.story_id = s.id AND v.status = 'open' AND p.selected = 1) AS flags,
         (SELECT sc.set_at FROM story_covers sc WHERE sc.story_id = s.id) AS cover,
         tip.body AS last_body, ch.idx AS last_chapter_idx, ch.title AS last_chapter_title,
         (SELECT COUNT(*) FROM chapters c
           WHERE c.story_id = s.id AND c.branch_id = cur.bid) AS chapter_count,
         (SELECT SUM(LENGTH(p.body) - LENGTH(REPLACE(p.body, ' ', '')) + 1) FROM passages p
           WHERE p.chapter_id = tip.cid AND p.selected = 1 AND p.is_break = 0) AS chapter_words,
         (SELECT SUM(LENGTH(p.body) - LENGTH(REPLACE(p.body, ' ', '')) + 1) FROM passages p
           WHERE p.story_id = s.id AND p.branch_id = cur.bid
             AND p.selected = 1 AND p.is_break = 0) AS words,
         (SELECT COUNT(*) FROM stories f WHERE f.lore_from = s.id) AS followers,
         -- Whose move it is, and how many write here. The shelf needs both: the light at the top
         -- asks "does anything want me", and a turn owed to somebody else is not a thing that
         -- wants you. One writer means no turn at all.
         (SELECT COUNT(*) + 1 FROM story_writers w WHERE w.story_id = s.id) AS writers
    FROM stories s JOIN cur ON cur.sid = s.id
    LEFT JOIN tip ON tip.sid = s.id
    LEFT JOIN chapters ch ON ch.id = tip.cid
   ORDER BY s.updated_at DESC`).all(o, o);

export function createStory(o: string, s: any) {
  const id = uid('s-'), b = uid('b-'), c = uid('c-'), t = now();
  // spice_note, model and locked_character are here so that an imported story arrives whole.
  // Import reads them out of the export; without them on this INSERT they were read and then
  // dropped on the floor, which is a round trip that looks like it works.
  // #18's columns are HERE and not only on the UPDATE. The comment above is about exactly this
  // shape of bug and it happened again the same day the columns were added: the create form sent
  // `voiceSample` and `styleNote`, this INSERT did not list them, and both were read off the form
  // and dropped on the floor. A book made from the blank form started with neither, however
  // carefully they had been typed, and nothing said so.
  // #40, 2026-09-01: `lockout_on` joins the list, because the wizard offers the switch now. It is
  // the third time this INSERT has dropped a field the form sent — see both comments above — so it
  // is worth saying what the shape of the bug is: the column defaults to 1, which is the right
  // answer for a new book, and that default is exactly what hides a missing column. Turning the
  // switch OFF in the wizard was the only case that could show it.
  q(`INSERT INTO stories (id,owner_id,title,genre,premise,setting,pov,persona,writing_style,
      style_note,
      spice,spice_note,max_context,model,locked_character,lockout_on,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, o, s.title ?? 'Untitled', tidyGenre(s.genre),
    s.premise ?? '', s.setting ?? '', s.pov ?? 'second person, present tense', s.persona ?? null,
    s.writingStyle ?? '', s.styleNote ?? null,
    s.spice ?? 2, s.spiceNote ?? null,
    s.maxContext ?? null, s.model ?? null, s.lockedCharacter ?? null,
    s.lockoutOn === false ? 0 : 1,
    s.status ?? 'in_progress', t, t);
  q('INSERT INTO branches (id,story_id,name,is_primary,created_at) VALUES (?,?,?,1,?)').run(b, id, 'main', t);
  q('INSERT INTO chapters (id,story_id,branch_id,idx,title,status,created_at) VALUES (?,?,?,1,?,?,?)')
    .run(c, id, b, s.chapterTitle ?? 'Scene 1', 'open', t);
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
/** THE ACCOUNT (2026-10-27): who a writer is to themselves. Owner-scoped by the key alone. */
export const accountOf = (ownerId: string) => {
  const u = q('SELECT login, name FROM users WHERE id = ?').get(ownerId) as any;
  const pic = q('SELECT set_at FROM user_images WHERE owner_id = ?').get(ownerId) as any;
  return { login: u?.login ?? null, name: u?.name || u?.login || null, avatar: pic?.set_at ?? null };
};
export const setName = (ownerId: string, name: string) => {
  q('UPDATE users SET name = ? WHERE id = ?').run(name, ownerId);
};
export function setAvatar(ownerId: string, jpeg: Uint8Array) {
  q(`INSERT INTO user_images (owner_id, jpeg, set_at) VALUES (?,?,?)
     ON CONFLICT(owner_id) DO UPDATE SET jpeg = excluded.jpeg, set_at = excluded.set_at`).run(ownerId, jpeg, now());
}
export const getAvatar = (ownerId: string): Uint8Array | null =>
  (q('SELECT jpeg FROM user_images WHERE owner_id = ?').get(ownerId) as any)?.jpeg ?? null;
export const delAvatar = (ownerId: string) => { q('DELETE FROM user_images WHERE owner_id = ?').run(ownerId); };

export function setCover(id: string, jpeg: Uint8Array) {
  q(`INSERT INTO story_covers (story_id, jpeg, set_at) VALUES (?,?,?)
     ON CONFLICT(story_id) DO UPDATE SET jpeg = excluded.jpeg, set_at = excluded.set_at`)
    .run(id, jpeg, now());
}
export const delCover = (id: string) => { q('DELETE FROM story_covers WHERE story_id = ?').run(id); };

/* A PICTURE ON A THREAD. The same three functions the cover has, and the same shape of answer: the
 * `set_at` is what a surface is told, because it keys a URL that never changes content. */
export const entryImageAt = (storyId: string, entryId: string): number | null =>
  (q('SELECT set_at FROM entry_images WHERE entry_id = ? AND story_id = ?')
    .get(entryId, storyId) as any)?.set_at ?? null;
/** Every thread in this book that has a picture, as id -> set_at. One query for the whole view
 *  rather than one per card: a book with sixty threads would otherwise pay sixty. */
export const entryImagesOf = (storyId: string): Record<string, number> =>
  Object.fromEntries((q('SELECT entry_id, set_at FROM entry_images WHERE story_id = ?')
    .all(storyId) as any[]).map((r) => [r.entry_id, r.set_at]));
/** WHICH THREADS HAVE A PICTURE, ACROSS EVERY BOOK THIS WRITER OWNS. Seth, 2026-09-01: *"in all
 *  thread views i should be able to see it in the top."*
 *
 *  The cross-story Threads page spans the shelf, so the per-story reader above cannot answer it, and
 *  a lookup per card is the shape that is fine at twelve books and quietly is not at fifty —
 *  `roomsOf` beside it exists for the same reason and says so.
 *
 *  Keyed by entry AND story, because `entry_images` is: a followed thread has a picture in the book
 *  it lives in, and the same id in the book that follows it does not.
 *
 *  THE OWNER FILTER IS DEFENCE IN DEPTH, not the thing that keeps writers apart — falsifying it on
 *  2026-09-01 left `test/scope.ts` green, and that is correct rather than a missing check. The caller
 *  looks a stamp up by the ids of entries it got from `ledgerOf`, which is already owner-scoped, so a
 *  foreign row could never be asked for. Kept because a reader of this function should not have to
 *  go and check that, and because the next caller might not have a scoped list in hand. */
export const imagesOf = (ownerId: string) => q(`
  SELECT i.entry_id, i.story_id, i.set_at FROM entry_images i
    JOIN stories s ON s.id = i.story_id
   WHERE ${MINE()}`).all(ownerId, ownerId) as any[];

export const entryImageBytes = (storyId: string, entryId: string): Uint8Array | null =>
  (q('SELECT jpeg FROM entry_images WHERE entry_id = ? AND story_id = ?')
    .get(entryId, storyId) as any)?.jpeg ?? null;
/** Refuses a thread that is not in this book rather than writing a row the FK would reject with a
 *  message about constraints. Same guard the pin writer uses, and for the same reason. */
export function setEntryImage(storyId: string, entryId: string, jpeg: Uint8Array): boolean {
  const own = q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(entryId, storyId);
  if (!own) return false;
  q(`INSERT INTO entry_images (entry_id, story_id, jpeg, set_at) VALUES (?,?,?,?)
     ON CONFLICT(entry_id) DO UPDATE SET jpeg = excluded.jpeg, set_at = excluded.set_at`)
    .run(entryId, storyId, jpeg, now());
  return true;
}
export const delEntryImage = (storyId: string, entryId: string) => {
  q('DELETE FROM entry_images WHERE entry_id = ? AND story_id = ?').run(entryId, storyId);
};

/** How many books, ANY writer's, are pinned to this model. `modelFor` puts the story ahead of the
 *  writer's default, so a book naming a model is a book that will load it on its next call —
 *  releasing it out from under one is a cold load somebody did not ask for. */
export const storiesOnModel = (model: string): number =>
  (q('SELECT COUNT(*) AS c FROM stories WHERE model = ?').get(model) as any).c;

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

// (`notesFor`, `newestNoted`, `allNotes` and `setNotes` lived here. Removed 2026-08-29 with #24 —
// see the note where the table was declared.)

/** The writer's default look, or null. */
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
/** BOOKS YOU MAY WRITE IN: yours, or one you were called into. One predicate, because there is one
 *  question — and every read that used to say `s.owner_id = ?` is a place a shared book would
 *  otherwise be invisible from. Takes the owner id TWICE, which is the cost of not having a view.
 *
 *  NOT for deleting. `deleteStory` stays `owner_id = ?`: being called in to write is not being
 *  handed the power to remove somebody's book. */
export const MINE = (a = 's.') => `(${a}owner_id = ? OR EXISTS (
  SELECT 1 FROM story_writers w WHERE w.story_id = ${a}id AND w.owner_id = ?))`;

/** The account that owns a book, or null. Not an ownership check: see ownsStory and MINE. */
export const storyOwner = (storyId: string): string | null =>
  (q('SELECT owner_id FROM stories WHERE id = ?').get(storyId) as any)?.owner_id ?? null;

export const ownsStory = (storyId: string, ownerId: string) =>
  !!q(`SELECT 1 FROM stories s WHERE s.id = ? AND ${MINE()}`).get(storyId, ownerId, ownerId);

/** Who writes in this book: the owner first, then anyone called in, as logins. */
export const writersOf = (storyId: string) => q(
  `SELECT u.id, u.login, (u.id = s.owner_id) AS owns FROM stories s
     JOIN users u ON u.id = s.owner_id OR u.id IN (
       SELECT w.owner_id FROM story_writers w WHERE w.story_id = s.id)
    WHERE s.id = ? ORDER BY owns DESC, u.login`).all(storyId) as any[];

/** Call someone into a book, or take them back out. Owner only — asserted by the caller, which is
 *  the route, because that is where `c.owner` is known to be the person asking. */
export const addWriter = (storyId: string, ownerId: string) => {
  const r = q('INSERT OR IGNORE INTO story_writers (story_id, owner_id, added_at) VALUES (?,?,?)')
    .run(storyId, ownerId, now());
  // Being called into a book is a change to somebody else's shelf, so it goes through `touch` —
  // that is what puts it on their screen without a refresh.
  touch(storyId);
  return r;
};
export const dropWriter = (storyId: string, ownerId: string) => {
  q('DELETE FROM story_writers WHERE story_id = ? AND owner_id = ?').run(storyId, ownerId);
  // A turn cannot be owed to somebody who is no longer in the book.
  q('UPDATE stories SET turn = NULL WHERE id = ? AND turn = ?').run(storyId, ownerId);
  touch(storyId);
};

/** HAND THE TURN OVER. Called when a co-op passage lands, and by nothing else: Seth, 2026-09-03,
 *  on calling the model for a beat when stuck — "it stays with me". Only writing your part in
 *  co-op passes the move; asking Anansi for a beat does not, because you have not written yet.
 *
 *  IT SAYS, IT DOES NOT BLOCK. Seth: "no it doesnt block writing just says whose move it is."
 *  Nothing reads this to refuse a write — a hard lock means one of two people is locked out at two
 *  in the morning for no reason.
 *
 *  Null when the book has one writer, so a book written alone never grows a turn. */
export function handOver(storyId: string, from: string) {
  const other = (writersOf(storyId) as any[]).map((w) => w.id).find((id) => id !== from);
  q('UPDATE stories SET turn = ? WHERE id = ?').run(other ?? null, storyId);
  /* THROUGH `touch`, and the check in test/scope.ts is what found this missing. A raw UPDATE moved
   * the turn without announcing it, so the light on the other writer's screen waited for their next
   * paint — which is exactly the half of "these need to be instant" that is about co-op rather than
   * about prose. The passage was live and the move was not. */
  touch(storyId);
  return other ?? null;
}
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
/** #36 · A TOMBSTONE IS NOT A CARD, said once in SQL so the next reader of `entries` inherits it.
 *
 *  A `dropped` row exists only to say "this book does not want the followed card with this origin".
 *  It keeps its TITLE — the screen has to be able to offer it back by name — and nothing else, so
 *  every query that means "cards" has to exclude it or it surfaces as an empty card with a name.
 *
 *  FOUR READERS WERE MISSED on the first pass and found by grepping `FROM entries` rather than by a
 *  check: the cross-story Threads page, the shelf's per-book card count, a persona check deleted with #84 (a
 *  dropped card's name would count as still in the cast) and SEARCH (a title hit with no body). That
 *  is why this is a shared fragment and not a condition written out four times: the fifth reader is
 *  the one nobody remembers.
 *
 *  Prefix it with the alias when the query has one — `LIVE('e.')`. */
const LIVE = (a = '') => `(${a}sync IS NULL OR ${a}sync != 'dropped')`;

/** Cards this book OWNS. Read by DELETE, copy, export and the ownership checks — see `entriesFor`
 *  for why that matters.
 *
 *  #36. A `dropped` row is a TOMBSTONE and not a card: it says only "this book does not want the
 *  followed card with this origin". Excluding it here is what keeps it out of the ledger screen, out
 *  of an export, out of a copy-to-another-book, and out of every prompt — everything that reads this
 *  function means cards, and a tombstone is not one. `droppedFollowed` is the one reader that wants
 *  them. */
export const entriesOf = (id: string) => q(
  `SELECT * FROM entries WHERE story_id = ? AND ${LIVE()} ORDER BY rowid`).all(id) as any[];

/** #36. The origins this book has taken over or thrown out: any local row that CLAIMS a followed
 *  card, whether it is a copy of it or a tombstone against it. `entriesFor` uses this to stop the
 *  read-through drawing a card twice, or drawing one the writer removed.
 *
 *  Tombstones are included, which is the whole reason this is separate from `entriesOf`. */
// Module-private: four callers, all in this file. It was exported and named nowhere outside, which
// is the over-export `bench/sweep.ts` reports and the same narrowing import.ts had on 2026-08-28.
const claimedOrigins = (id: string) => new Set(
  (q('SELECT origin_id FROM entries WHERE story_id = ? AND origin_id IS NOT NULL').all(id) as any[])
    .map((r) => String(r.origin_id)));

/** This book's cards AND the ones it follows, each foreign card carrying the book it lives in.
 *
 *  SEPARATE FROM `entriesOf` ON PURPOSE, and this is the load-bearing decision. `entriesOf` is what
 *  DELETE, copy, export and the ownership checks all read, and every one of them means "cards this
 *  book owns". Widening it would have let a follower delete its world's cards, export them as its
 *  own, and copy them twice into the same book — silently, because a followed card looks exactly
 *  like an owned one. So the widening happens here, and only the read paths that mean "what
 *  reaches the model and the screen" call it.
 *
 *  ONE LEVEL, NEVER A CHAIN. A follows B follows C does not give A C's cards, and that is not a
 *  limitation to fix later: a chain needs a cycle guard, a depth, and an answer for what happens
 *  when the middle book is deleted. One hop needs none of those and covers a world bible with
 *  books set in it, which is the thing that was asked for.
 *
 *  SAME OWNER, CHECKED HERE. Following is set on a story the owner controls, but the source could
 *  change hands or the column could be written by an import, and a card crossing owners through a
 *  read path is a leak rather than a coherence bug. */
export function entriesFor(id: string) {
  const own = entriesOf(id);
  const st = getStory(id) as any;
  const from = st?.lore_from;
  if (!from || from === id) return own;
  const src = getStory(from) as any;
  if (!src || src.owner_id !== st.owner_id) return own;
  // The follower's own card wins on a title collision: the book you are writing in is allowed to
  // say something different about a character from the bible, and losing that silently to a
  // world-level card would be the worst kind of surprise.
  const mine = new Set(own.map((e: any) => String(e.title).trim().toLowerCase()));
  // #36. A CARD THIS BOOK HAS CLAIMED IS NOT READ THROUGH AGAIN. Unlinking copies the card here and
  // records its origin, so without this the writer would see both — the copy they are editing and
  // the world's original beside it, same name, drifting. A tombstone claims an origin too, and
  // suppressing it is the whole of what a tombstone does.
  const claimed = claimedOrigins(id);
  const shared = entriesOf(from)
    .filter((e: any) => !claimed.has(String(e.id)))
    .filter((e: any) => !mine.has(String(e.title).trim().toLowerCase()))
    .map((e: any) => ({ ...e, shared_from: src.title, shared_from_id: from }));
  return [...own, ...shared];
}

/** Start a book from another book's threads: a new story that FOLLOWS it rather than copying.
 *
 *  Following, not copying, and that is the whole decision. A copy is a fork the moment either side
 *  is edited, and the point of a bible is that six books set in it say the same thing about the
 *  same character. `entriesFor` already merges the followed cards in and already lets this story's
 *  own card win a title collision, so a book can still disagree with the world where it means to.
 */
export function storyFollowing(ownerId: string, sourceId: string, title: string) {
  const w = getStory(sourceId) as any;
  if (!w || w.owner_id !== ownerId) return null;
  // ANY book you own, not only a world book. A world book is the case where the source happens to
  // hold no prose; `entriesFor` never cared which it was, and Seth asked for this beside every book
  // on the Threads page rather than only beside the bibles.
  if (sourceId === '' ) return null;
  const id = createStory(ownerId, {
    title,
    // The world's own premise and setting are the shared ground, so they seed the book rather than
    // leaving it blank. Everything here is editable the moment it opens.
    premise: w.premise ?? '', setting: w.setting ?? '', genre: w.genre ?? '',
    pov: w.pov ?? 'third', spice: w.spice, writingStyle: w.writing_style ?? '',
    styleNote: w.style_note ?? '',
  });
  // Through `updateStory`, never a bare UPDATE: `followPair` sets the World field with it (#103).
  updateStory(id.id, { loreFrom: sourceId });
  return id;
}

/** A world book: a story flagged as a bible, which keeps it off the shelf and puts it on Threads.
 *  Everything else about it is an ordinary story, deliberately — its cards are `entries` rows like
 *  any other, so every editor, the search, the export and the ownership gate already work on it. */
export function createWorld(ownerId: string, s: any) {
  const made = createStory(ownerId, { ...s, status: 'in_progress' });
  q('UPDATE stories SET is_world = 1 WHERE id = ?').run(made.id);
  return made;
}

/** #103 · THE WORLD THIS WRITER ALREADY HAS FOR AN IP, by its name: the title, trimmed, in any
 *  case. Only a World (`is_world`), never a tale of the same name, and only one the writer OWNS:
 *  not `MINE()`, because being called in to write in a book is not owning its World, and
 *  `entriesFor` reads a followed World only when the owners match. Writes nothing. With two of the
 *  same name, the one changed last. */
export function worldNamed(ownerId: string, name: string): { id: string; title: string } | null {
  const want = String(name ?? '').trim().toLowerCase();
  if (!want) return null;
  // Compared here and not with SQLite's lower(), which folds ASCII only: "POKÉMON" would miss
  // "Pokémon". A writer has a handful of Worlds, so reading their titles costs nothing.
  return (q(`SELECT id, title FROM stories WHERE owner_id = ? AND is_world = 1
    ORDER BY updated_at DESC`).all(ownerId) as any[])
    .find((w) => String(w.title ?? '').trim().toLowerCase() === want) ?? null;
}

/** The books that would lose cards if this one went. */
export const followersOf = (id: string) =>
  q('SELECT id, title FROM stories WHERE lore_from = ?').all(id) as any[];

/** Every entry this owner has, with the story it belongs to. The Worlds page groups by story
 *  and searches across all of them — 'in case we forget what story a certain entry belongs to'. */
export const ledgerOf = (ownerId: string) => q(`
  SELECT e.*, s.title AS story_title, s.id AS story
  FROM entries e JOIN stories s ON s.id = e.story_id
  WHERE ${MINE()} AND ${LIVE('e.')} ORDER BY s.updated_at DESC, e.rowid`).all(ownerId, ownerId) as any[];

/** Every ROOM this owner has, across every book. #22's blocker: the cross-story Threads page could
 *  not show a room or switch one on because `GET /api/ledger` had never sent one — a page that
 *  spans the shelf, describing cards that have had rooms since Phase 2, drawing none of them.
 *
 *  One query rather than a call per card. The page holds every card on the shelf, and a lookup per
 *  card is the shape that is fine at twelve books and quietly is not at fifty. */
export const roomsOf = (ownerId: string) => q(`
  SELECT a.* FROM addons a JOIN stories s ON s.id = a.story_id
  WHERE ${MINE()} AND a.entry_id IS NOT NULL ORDER BY a.slot, a.created_at`).all(ownerId, ownerId) as any[];
export const branchesOf = (id: string) => q('SELECT * FROM branches WHERE story_id = ? ORDER BY created_at').all(id) as any[];

/** The five presses, and the only values `passages.mode` may hold. An unknown one is stored as
 *  null rather than kept: the page turns this into a class name, and a column that accepts anything
 *  the client sends is a column that decides what CSS runs.
 *
 *  CONTINUE IS THE FIFTH, and it was missing here while the page had drawn an accent for it since
 *  2026-09-01. It is not a composer button, so a list written from the composer's four left the
 *  most common passage in any book storing `null` and reading back as an unmarked one: Seth,
 *  2026-09-02, on a passage Continue had just written — "this is missing the side accent bar that
 *  all the other ones have." Zero rows in the library carry `continue` because of this line. */
/*  CO-OP IS THE SIXTH, 2026-09-03. Same lesson as Continue above, and this list is exactly where it
 *  would have been missed: co-op is not a press that calls the model, so a whitelist written from
 *  "what generates" would drop it — and every passage the other writer wrote would come back
 *  unmarked, which is the one thing a shared book cannot afford to lose. test/db.ts reads the
 *  accents out of app.html and asks this column for each; that is what caught it. */
const MODES = ['speak', 'act', 'direct', 'narrate', 'continue', 'coop'];

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
      is_break,mode,directive,claimed,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, p.chapterId, p.storyId, p.branchId, (slot?.s ?? 0) + 1, at,
      p.author ?? 'model', p.speaker ?? null, p.body, p.isBreak ? 1 : 0,
      MODES.includes(p.mode) ? p.mode : null, p.directive ?? null,
      // CLAIMED UNLESS THE CALLER SAYS OTHERWISE. Only the server-side persist of a live generation
      // passes 0; the writer's own prose, a break, an import and every older caller are claimed by
      // construction — a writer typing a line has already stood behind it.
      p.claimed === false ? 0 : 1, now());
  touch(p.storyId);
  return id;
}

/** STAND BEHIND EVERYTHING UNCLAIMED IN A STORY, and answer how many that was.
 *
 *  Called by the acts that mean "I have read this and I am going on": writing a line, asking for the
 *  next passage, closing a chapter. Seth, 2026-09-01: "only claimed after the next message."
 *
 *  BY STORY AND NOT BY PASSAGE, deliberately. A writer who comes back to three passages and carries
 *  on has stood behind all three; making them claim each one is a chore invented by the data model.
 */
export function claimPassages(storyId: string): number {
  const r = q('UPDATE passages SET claimed = 1 WHERE story_id = ? AND claimed = 0').run(storyId);
  return Number(r.changes ?? 0);
}

/** What is waiting to be stood behind, oldest first. Ids only — the view already carries the prose. */
export const unclaimedOf = (storyId: string): string[] =>
  (q('SELECT id FROM passages WHERE story_id = ? AND claimed = 0 ORDER BY ordinal').all(storyId) as any[])
    .map((r) => r.id);

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
    // to inherit. `mode` (#14) is in the same position for the same reason: a reroll is not a
    // different press, and a take that lost its mode would lose its accent on the page.
    q(`INSERT INTO passages (id,chapter_id,story_id,branch_id,slot_key,ordinal,variant_index,selected,
        author,speaker,body,is_break,mode,directive,created_at) VALUES (?,?,?,?,?,?,?,1,?,?,?,0,?,?,?)`)
      .run(id, cur.chapter_id, cur.story_id, cur.branch_id, cur.slot_key, cur.ordinal,
        n + 1, author, cur.speaker, body, cur.mode ?? null, cur.directive ?? null, now());
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

export const setSummary = (chapterId: string, summary: string, through: number, hash: string,
    author: 'human' | 'model') =>
  q('UPDATE chapters SET summary=?, summary_covers_through=?, summary_hash=?, summary_author=? WHERE id=?')
    .run(summary, through, hash, author, chapterId);

/** THE ONE WAY A SUMMARY IS REMOVED: the text and everything that describes it go together, so a
 *  removed summary cannot leave an author or a fingerprint behind for the next one to inherit. */
const clearSummary = (storyId: string, chapterId: string) =>
  q(`UPDATE chapters SET summary = NULL, summary_covers_through = NULL, summary_hash = NULL,
       summary_author = NULL WHERE id = ? AND story_id = ?`).run(chapterId, storyId);

/** WHAT A SUMMARY WRITTEN NOW WOULD COVER: the passages with words in them, the last of them, and
 *  the fingerprint of the chapter's selected prose as it is. Null when the chapter has no prose.
 *  One function for the model's summary and the writer's, so the two cannot be checked against
 *  different prose; the model's is written from `passages`, so it is not filtered a second time. */
export function summaryCover(chapterId: string): { passages: any[]; through: number; hash: string } | null {
  const all = passagesOfChapter(chapterId);
  const ps = all.filter((p: any) => !p.is_break && p.body.trim());
  if (!ps.length) return null;
  return { passages: ps, through: ps.at(-1)!.ordinal, hash: proseHash(all.map((p: any) => p.body)) };
}

/** #89. The fingerprint a hem is checked against: the scene's selected prose, breaks included, hashed
 *  as `summaryStale` hashes it. An edit, a reweave or a delete in the scene changes it. */
const scenePrint = (chapterId: string) => proseHash(passagesOfChapter(chapterId).map((p: any) => p.body));

/** A hem row's JSON column, read: null when empty or unreadable, so a bad column never throws. */
const hemJSON = (t: string | null) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };

/** A hem starts: the row is written, or replaced by a hem again, before any pass runs. Returns the
 *  run's number, which `finishHem` is handed back. */
export function beginHem(storyId: string, chapterId: string): number {
  const run = ((q('SELECT run FROM hems WHERE chapter_id = ?').get(chapterId) as any)?.run ?? 0) + 1;
  q(`INSERT OR REPLACE INTO hems (chapter_id, story_id, started_at, finished_at, prose_hash, passes, kept, suggestion, run)
     VALUES (?, ?, ?, NULL, ?, NULL, 0, NULL, ?)`).run(chapterId, storyId, now(), scenePrint(chapterId), run);
  return run;
}

/** A hem ends, with its pass report and the next-scene suggestion (null when that pass gave none).
 *  #91. The report is MERGED into the one stored: a try-again of one pass hands in that pass's line
 *  only, and every other line stays. `beginHem` empties the report, so a full hem still replaces it.
 *  `kept` and `suggestion` left undefined keep what is stored: those passes did not run this time.
 *  ONLY THE LATEST RUN MARKS IT FINISHED. A hem again or a try again pressed while an earlier run is
 *  going begins a new run and waits in the queue; the earlier run still merges its report, but if it
 *  stamped the row finished the scene would read done while the newer run waits. */
export function finishHem(storyId: string, chapterId: string, run: number,
    r: { passes: Record<string, string | null>; kept?: boolean;
         suggestion?: { title: string; note: string; opens: string } | null }) {
  const was = q('SELECT passes, kept, suggestion FROM hems WHERE chapter_id = ? AND story_id = ?')
    .get(chapterId, storyId) as any;
  // A bad report is replaced whole.
  const before: Record<string, string | null> = hemJSON(was?.passes ?? null) ?? {};
  const kept = r.kept === undefined ? !!was?.kept : r.kept;
  const suggestion = r.suggestion === undefined ? (was?.suggestion ?? null)
    : r.suggestion ? JSON.stringify(r.suggestion) : null;
  q(`UPDATE hems SET finished_at = CASE WHEN run = ? THEN ? ELSE finished_at END, passes = ?, kept = ?,
       suggestion = ?, pass = CASE WHEN run = ? THEN NULL ELSE pass END WHERE chapter_id = ? AND story_id = ?`)
    .run(run, now(), JSON.stringify({ ...before, ...r.passes }), kept ? 1 : 0, suggestion, run, chapterId, storyId);
}

/** #91. HEM AGAIN drops what the last hem left chalked in the scene's group, and only that: a row
 *  sewn in or rejected is the writer's decision and stays. */
export const dropChalked = (storyId: string, grp: string) =>
  q("DELETE FROM proposals WHERE story_id = ? AND grp = ? AND status = 'open'").run(storyId, grp);

/** #91. A try-again starts: the hem shows running again, with its fingerprint and report as they
 *  were, and the try-again is the row's new run. Null when the scene has no hem in this story,
 *  which is the route's refusal. */
export function reopenHem(storyId: string, chapterId: string): number | null {
  if (!q('UPDATE hems SET finished_at = NULL, run = run + 1 WHERE chapter_id = ? AND story_id = ?')
    .run(chapterId, storyId).changes) return null;
  return (q('SELECT run FROM hems WHERE chapter_id = ?').get(chapterId) as any).run;
}

/** #90. The threads the thread-change pass found changed past its cap of six, by name, for the card.
 *  Written by that pass when a hem runs it; a hem again starts the row with none. */
/** The pass a hem's run has reached, and when; a stale run never overwrites a newer one's. */
export const hemAt = (storyId: string, chapterId: string, run: number, pass: string) =>
  q('UPDATE hems SET pass = ?, pass_at = ? WHERE chapter_id = ? AND story_id = ? AND run = ?')
    .run(pass, now(), chapterId, storyId, run);
/** The new threads a hem found past six, held whole (each a proposal as `addProposal` takes it). */
export const hemHold = (storyId: string, chapterId: string, held: any[]) =>
  q('UPDATE hems SET extra = ? WHERE chapter_id = ? AND story_id = ?')
    .run(held.length ? JSON.stringify(held) : null, chapterId, storyId);
/** Hand back the held ones and clear them: the writer asked for them. */
export function hemTakeHeld(storyId: string, chapterId: string): any[] {
  const h = q('SELECT extra FROM hems WHERE chapter_id = ? AND story_id = ?').get(chapterId, storyId) as any;
  q('UPDATE hems SET extra = NULL WHERE chapter_id = ? AND story_id = ?').run(chapterId, storyId);
  return hemJSON(h?.extra ?? null) ?? [];
}
export const hemOverflow = (storyId: string, chapterId: string, names: string[]) =>
  q('UPDATE hems SET overflow = ? WHERE chapter_id = ? AND story_id = ?')
    .run(JSON.stringify(names), chapterId, storyId);

/** A hem row as the story view shows it. `outOfDate` is derived here, on read: the scene's prose
 *  now against its fingerprint when the hem started. */
const hemView = (h: any) => ({
  state: h.finished_at == null ? 'running' : 'done',
  current: h.finished_at == null && h.pass ? { pass: h.pass, since: h.pass_at } : null,
  extra: (hemJSON(h.extra) ?? []).map((x: any) => String(x?.title ?? '')),
  startedAt: h.started_at, finishedAt: h.finished_at ?? null,
  passes: hemJSON(h.passes) ?? {}, keptSummary: !!h.kept, suggestion: hemJSON(h.suggestion),
  overflow: hemJSON(h.overflow) ?? [],
  outOfDate: scenePrint(h.chapter_id) !== h.prose_hash,
});

/** Every hemmed scene of a tale, by chapter id, as the story view shows it. */
export function hemsOf(storyId: string): Map<string, any> {
  const rows = q('SELECT * FROM hems WHERE story_id = ?').all(storyId) as any[];
  return new Map(rows.map((h) => [h.chapter_id, hemView(h)]));
}

/** One hemmed scene, as `hemsOf` shows it; null when the scene has no hem in this story. */
export function hemOf(storyId: string, chapterId: string) {
  const h = q('SELECT * FROM hems WHERE chapter_id = ? AND story_id = ?').get(chapterId, storyId);
  return h ? hemView(h) : null;
}

/** A SUMMARY SAVED BY HAND (#43). It is checked against the chapter's prose as it is now: the
 *  writer has vouched for it, so a stale summary fixed by hand is current again, and it is theirs
 *  even if one word of Anansi's changed. An empty save removes the summary. The chapter must be in
 *  this story: the dispatcher's gate resolves `storyId` only, never the chapter id. */
export function writeSummary(storyId: string, chapterId: string, text: string): { error?: string } {
  if (!q('SELECT 1 FROM chapters WHERE id = ? AND story_id = ?').get(chapterId, storyId))
    return { error: 'That chapter is not in this book.' };
  const summary = String(text ?? '').trim();
  if (!summary) { clearSummary(storyId, chapterId); touch(storyId); return {}; }
  const cover = summaryCover(chapterId);
  if (!cover) return { error: 'This chapter has no prose yet, so there is nothing to summarise.' };
  setSummary(chapterId, summary, cover.through, cover.hash, 'human');
  touch(storyId);
  return {};
}

/** A CARD EDIT CAN STALE A SUMMARY, and until 2026-08-30 it could not.
 *
 *  `summaryStale` below hashes the PASSAGES a summary covers, so it fires when the prose changes
 *  underneath a summary and never when the ledger does. Its own comment is the argument for this
 *  function: *"a stale summary otherwise contradicts the prose in every later call, forever."*
 *  A summary that says Halsey wears the Ashford coat goes on saying it after the card says
 *  otherwise, in every prompt, for the life of the book -- the same failure through a door
 *  nobody was watching.
 *
 *  THE RULE IS NARROW ON PURPOSE: a summary is stale only when a fact IT MENTIONS has LEFT the
 *  card and is not another card's name (see the filter below). Not when the card changed at all --
 *  that would stale half the book every time somebody fixed a comma, and a stale summary is
 *  DROPPED from the prompt until a writer re-runs it, so a false positive costs real context and
 *  a model call. Not two-way either; see the note above
 *  `factsLost` in context.ts for why a gained fact cannot be told from a capitalised verb.
 *
 *  IT MARKS STALE BY NULLING THE HASH, which is what `summaryStale` already treats as stale
 *  (`if (!chapter.summary_hash) return true`). No column, no migration, and one definition of
 *  stale rather than two that can disagree.
 *
 *  `bench/compact.ts` is the reason this is a fact rule rather than a text rule and it needs no
 *  exemption: it only ever applies rewrites that dropped no fact, so it stales nothing by
 *  construction. If it ever does drop one, staling the summary is the correct answer.
 *
 *  The writer sees it -- `web/app.js` renders "Stale — excluded from the prompt until it is
 *  re-run" on the chapter. This is not a silent removal. */
export function staleSummariesFor(storyId: string, before: string, after: string): number {
  let gone = factsLost(before, after);
  if (!gone.length) return 0;
  // A NAME THAT IS STILL A CARD HAS NOT LEFT THE BOOK, and this is the difference between a fact
  // leaving and a fact MOVING. 2026-09-18: a writer rewrote one character's card from a bracketed
  // state list into prose, which dropped the names of three other characters out of THAT card --
  // and every one of them has a card of their own, unchanged. Four of the five chapter summaries
  // in the book were nulled in one save and dropped out of the prompt, for summaries that were
  // not lying about anything. The comparison is per-card; what a summary draws on is the whole
  // ledger, and nothing bridged the two.
  //
  // TITLES ONLY, not every card's text. A mention elsewhere is weaker evidence than a card: it is
  // what a rename leaves behind, and a rename is the sharpest case this function has -- the
  // summary then names somebody the ledger has never heard of. Read AFTER the update by both
  // callers, so a renamed card's OLD name is already gone from this list and still stales.
  //
  // Numbers pass through it in practice and are meant to: an age or a debt is a property of one
  // card, so "40" surviving in some other card's title is not that fact surviving.
  const cards = (q('SELECT title FROM entries WHERE story_id = ?').all(storyId) as any[])
    .map((r) => String(r.title ?? '')).join('\n');
  gone = gone.filter((g) => !cards.includes(g));
  if (!gone.length) return 0;
  const rows = q(`SELECT id, summary FROM chapters
                  WHERE story_id = ? AND summary IS NOT NULL AND summary_hash IS NOT NULL`)
    .all(storyId) as any[];
  let n = 0;
  for (const r of rows) {
    if (!gone.some((g) => String(r.summary).includes(g))) continue;
    q('UPDATE chapters SET summary_hash = NULL WHERE id = ?').run(r.id);
    n++;
  }
  if (n) touch(storyId);
  return n;
}

/** True when the covered prose has changed since the summary was written. */
export function summaryStale(chapter: any): boolean {
  if (!chapter.summary) return false;
  if (!chapter.summary_hash) return true;
  return proseHash(passagesOfChapter(chapter.id).map((p: any) => p.body)) !== chapter.summary_hash;
}

/** WHAT AN ACT WAS BUILT FROM (#47): one short hash per covered chapter's summary, keyed by the
 *  chapter's number, as `3:hash 4:hash~`. Per chapter rather than one hash over all of them, so the
 *  check below can name WHICH chapter changed. A trailing `~` records that the chapter was already
 *  stale when the act was saved: the writer saw it and vouched for the act anyway. Taken at roll-up and at a hand save (`addArc`,
 *  `updateArc`), so either one makes the act current against its chapters as they are then.
 *  Function declarations, not consts: `backfillActPrints` runs inside `migrate()`, above the line
 *  where a const here would exist. */
export function actPrint(chapters: { index: number; summary?: string | null; summaryStale?: boolean }[]): string {
  return [...chapters].sort((a, b) => a.index - b.index)
    .map((c) => `${c.index}:${summaryPrint(c.summary)}${c.summaryStale ? '~' : ''}`).join(' ');
}
function summaryPrint(summary?: string | null) {
  return createHash('sha256').update(String(summary ?? '')).digest('hex').slice(0, 12);
}

/** IS AN ACT OUT OF DATE, and if so which chapter made it so. Computed on read, as stale is:
 *  nothing stores "out of date". Two causes, checked chapter by chapter from the first:
 *  - `changed`: the chapter's summary no longer matches what the act was built from (re-run,
 *    edited, or cleared);
 *  - `stale`: the chapter's summary no longer matches its prose, so the act describes prose that
 *    has moved.
 *  A hand save of the act ALWAYS clears it, Seth's call on 2026-10-14: a chapter that was already
 *  stale when the act was saved is recorded with `~` and does not count. A chapter that goes stale
 *  AFTER the save still does.
 *  An act with no fingerprint has nothing to compare, so only the stale cause applies. Out of date
 *  never excludes: the context engine still sends the act, because covered chapters send nothing. */
export function actOutOfDate(print: string | null | undefined,
  chapters: { index: number; summary?: string | null; summaryStale?: boolean }[],
): { chapter: number; why: 'changed' | 'stale' } | null {
  const was = new Map((print ?? '').split(' ').filter(Boolean).map((p) => {
    const at = p.indexOf(':');
    return [Number(p.slice(0, at)), p.slice(at + 1)] as [number, string];
  }));
  const vouched = (i: number) => was.get(i)?.endsWith('~') ?? false;
  const now = new Map(chapters.map((c) => [c.index, c]));
  const indices = [...new Set([...(print ? was.keys() : []), ...now.keys()])].sort((a, b) => a - b);
  for (const i of indices) {
    const c = now.get(i);
    if (print && was.get(i)?.replace(/~$/, '') !== summaryPrint(c?.summary)) return { chapter: i, why: 'changed' };
    if (c?.summaryStale && !vouched(i)) return { chapter: i, why: 'stale' };
  }
  return null;
}

/** The fingerprint of an act's chapters as they are now, read from its own branch. `withStale`
 *  marks the chapters already stale; off for the migration backfill, which runs inside `migrate()`
 *  before `summaryStale` can read passages. */
function actPrintAt(storyId: string, branchId: string, from: number, to: number, withStale = false): string {
  return actPrint((db.prepare(`SELECT id, idx, summary, summary_hash FROM chapters
      WHERE story_id = ? AND branch_id = ? AND idx BETWEEN ? AND ?`)
    .all(storyId, branchId, from, to) as any[])
    .map((c) => ({ index: c.idx, summary: c.summary, summaryStale: withStale && summaryStale(c) })));
}

/** ACTS MADE BEFORE #47 had no fingerprint. This gives each one the fingerprint of its chapters'
 *  summaries AS THEY ARE AT MIGRATION TIME, and that is all it promises: an act whose chapter was
 *  re-summarised before this ran is taken as matching, because nothing recorded what it was built
 *  from. The check is honest from the migration forward. Runs inside `migrate()` on every boot and
 *  touches only acts with no fingerprint, so a second run writes nothing. `db.prepare`, not `q`:
 *  `q` is declared below the `migrate()` call. */
export function backfillActPrints(): number {
  const rows = db.prepare('SELECT id, story_id, branch_id, from_chapter, to_chapter FROM arcs WHERE summaries_hash IS NULL')
    .all() as any[];
  for (const a of rows)
    db.prepare('UPDATE arcs SET summaries_hash = ? WHERE id = ?')
      .run(actPrintAt(a.story_id, a.branch_id, a.from_chapter, a.to_chapter), a.id);
  return rows.length;
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
/** DELETE A CHAPTER, AND EVERYTHING THAT WAS ONLY EVER ABOUT IT. Seth, 2026-08-30: "we also need
 *  a delete chapter", and "deletion is deletion".
 *
 *  The cascade does most of it: `passages.chapter_id` and `chapter_pins` both declare
 *  `ON DELETE CASCADE` against `chapters(id)`, and `passage_revisions` cascades from passages, so
 *  dropping the row takes the prose, its edit history and its pins. `PRAGMA foreign_keys = ON` is
 *  set at the top of this file, so that is real rather than decorative.
 *
 *  What does NOT cascade is what has to be written out: `violations.passage_id` and
 *  `proposals.chapter_id` carry no foreign key — deliberately, in both cases, because a flag can
 *  outlive the variant it was raised against and a proposal can outlive the chapter that proposed
 *  it. Neither survives the chapter itself being gone, so both are explicit here. `generations` is
 *  a log of what was asked of the model and is deliberately left: it is a record of the request,
 *  not of the book.
 *
 *  THE NUMBERS ARE NOT CLOSED UP, and that is the one decision in here worth arguing about.
 *  Deleting chapter 4 leaves 1, 2, 3, 5, 6. Renumbering would be tidier on screen and would
 *  silently move every timeline in the book: `entry_states.from_chapter`, `addons.from_chapter`
 *  and `entries.retired_at_chapter` all anchor to a chapter INDEX, so closing the gap would move
 *  a fact that opens at chapter 5 to a chapter 5 that is a different chapter. A visible hole is
 *  the honest result and `chapters_idx` is only unique, never contiguous.
 *
 *  Refuses the last chapter in the branch. A story with no chapter has nowhere to put the next
 *  passage, and every read here does `chapters.at(-1)` as its fallback. */
export function delChapter(storyId: string, chapterId: string): { deleted: number; reopened?: number; error?: string } {
  const ch = q('SELECT id, branch_id, idx FROM chapters WHERE id = ? AND story_id = ?')
    .get(chapterId, storyId) as any;
  if (!ch) return { deleted: 0, error: 'That chapter is gone already.' };
  /* AN OPEN CHAPTER HAS TO SURVIVE, and counting rows did not check that.
   *
   * The guard read `n <= 1` — one chapter on the branch — and the message said "there would be
   * nowhere to write", which is the right rule stated against the wrong condition. A book with
   * chapter one CLOSED and an empty chapter two open passed it: deleting chapter two left a story
   * whose only chapter was closed, so `view` reported that closed chapter as the current one and
   * there was nowhere to write with nothing on screen saying why.
   *
   * FOUND IN THE LIVE LIBRARY on 2026-09-01, not by a check: "The Transaction of Silence", chapter
   * one closed with 22 passages and no chapter two at all. Seth: "the chapter in the sidebar im on
   * chapter two and its not showing up." He had ended chapter one and then deleted the empty
   * chapter the close opened for him.
   *
   * `endChapter` has held this invariant since it became a transaction — its own comment is about
   * the same broken state arriving the other way. This is the second door into it. */
  const openLeft = (q(`SELECT COUNT(*) AS n FROM chapters
      WHERE story_id = ? AND branch_id = ? AND status = 'open' AND id != ?`)
    .get(storyId, ch.branch_id, chapterId) as any).n;
  /* AND NOW IT KEEPS ONE BY OPENING ONE, rather than refusing (Seth, 2026-10-27: "a simpler way of
   * deleting scenes so I don't have to ask you for the cleanup"). Deleting the only open scene while
   * others remain reopens the latest of them in the same transaction, so the invariant above holds
   * and the writer needs one press. Only the very last scene on the branch is still refused. */
  const reopen = openLeft ? null : q(`SELECT id, idx FROM chapters
      WHERE story_id = ? AND branch_id = ? AND id != ? ORDER BY idx DESC LIMIT 1`)
    .get(storyId, ch.branch_id, chapterId) as any;
  if (!openLeft && !reopen) return { deleted: 0,
    error: 'This is the only scene in the tale, so there would be nowhere left to write.' };
  db.exec('BEGIN');
  try {
    if (reopen) q("UPDATE chapters SET status = 'open' WHERE id = ? AND story_id = ?").run(reopen.id, storyId);
    q(`DELETE FROM violations WHERE story_id = ? AND passage_id IN
         (SELECT id FROM passages WHERE chapter_id = ?)`).run(storyId, chapterId);
    q('DELETE FROM proposals WHERE story_id = ? AND chapter_id = ?').run(storyId, chapterId);
    q('DELETE FROM chapters WHERE id = ? AND story_id = ?').run(chapterId, storyId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(storyId);
  return reopen ? { deleted: 1, reopened: reopen.idx } : { deleted: 1 };
}

/** DELETE EVERY PASSAGE BELOW THIS ONE. Seth, 2026-08-30: "a way to delete anything after a
 *  specific answer ... delete after deletes all prose below."
 *
 *  `ordinal` and not `slot_key`: slot keys are fractional and per chapter, so they say where a
 *  passage sits inside its chapter and nothing about the book. `ordinal` is monotonic per branch —
 *  the schema says so and every engine count already uses it — which makes "below" one comparison
 *  across every chapter rather than a walk through them.
 *
 *  EVERY TAKE, not the selected one. A rerolled passage below the cut has three rows at one
 *  ordinal; leaving the unselected two would leave prose in the database that no screen can reach
 *  and that `delSlot` could later promote back into the book.
 *
 *  SCOPED TO THE BRANCH the passage is on. Another branch's prose is a different line of the story
 *  and was not what the writer pointed at.
 *
 *  THE SUMMARIES OF WHAT IT CUT ARE CLEARED, which is not tidiness. A chapter summary rides in
 *  every prompt; one describing prose that no longer exists is the engine telling the model about
 *  a scene the book does not contain. Only chapters that actually lost a passage are touched.
 *
 *  AND THE CHAPTERS IT EMPTIES GO WITH IT. This was left as a `ponytail:` ceiling on 2026-08-30 —
 *  "an empty chapter at the end of a book is a heading with no prose under it" — and Seth asked for
 *  it finished the same day. Only chapters AFTER the cut and only ones now holding nothing: the
 *  chapter the cut lands in keeps everything at or above the passage pointed at, so it is never
 *  empty, and a chapter before the cut was never touched.
 *
 *  NEVER THE OPEN CHAPTER, empty or not, for the reason `delChapter` refuses to take it: there would
 *  be nowhere to write. Found in the live library on 2026-10-17, twice in "The Lands Between": a
 *  close, then delete-after on the closed chapter's last passage, cut the break and took the empty
 *  chapter the close had opened, which left every chapter in the book closed. */
export function delAfter(storyId: string, passageId: string):
    { deleted: number; emptied?: number; error?: string } {
  let emptied = 0;
  const cut = afterCut(storyId, passageId);
  if (!cut) return { deleted: 0, error: 'That passage is gone already.' };
  const { cur, doomed, chapters } = cut;
  if (!doomed.length) return { deleted: 0 };
  db.exec('BEGIN');
  try {
    q(`DELETE FROM violations WHERE story_id = ? AND passage_id IN
         (SELECT id FROM passages WHERE story_id = ? AND branch_id = ? AND ordinal > ?)`)
      .run(storyId, storyId, cur.branch_id, cur.ordinal);
    q('DELETE FROM passages WHERE story_id = ? AND branch_id = ? AND ordinal > ?')
      .run(storyId, cur.branch_id, cur.ordinal);
    for (const id of chapters) clearSummary(storyId, id);
    // The empty ones after the cut. `NOT EXISTS` rather than a count, and `idx > ?` rather than
    // "not the cut's own chapter": a chapter BEFORE the cut that happened to be empty already was
    // empty before this press and is not this press's business. Said once, because the count and
    // both deletes must pick the same chapters.
    const empty = `story_id = ? AND branch_id = ? AND idx > ? AND status != 'open'
                   AND NOT EXISTS (SELECT 1 FROM passages p WHERE p.chapter_id = chapters.id)`;
    emptied = (q(`SELECT COUNT(*) AS n FROM chapters WHERE ${empty}`)
      .get(storyId, cur.branch_id, cur.idx) as any).n;
    if (emptied) {
      q(`DELETE FROM proposals WHERE story_id = ? AND chapter_id IN (SELECT id FROM chapters WHERE ${empty})`)
        .run(storyId, storyId, cur.branch_id, cur.idx);
      q(`DELETE FROM chapters WHERE ${empty}`).run(storyId, cur.branch_id, cur.idx);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(storyId);
  return { deleted: doomed.length, emptied };
}

/** WHAT DELETE-AFTER CUTS: the passage pointed at, every row below it on its branch, and the
 *  chapters those rows are in. Null when the passage is not in this story. One function for the
 *  delete and for `yoursClearedBy`, so what the first press names and what the second press clears
 *  are decided by the same query. */
function afterCut(storyId: string, passageId: string) {
  const cur = q(`SELECT p.branch_id, p.ordinal, c.idx FROM passages p
                 JOIN chapters c ON c.id = p.chapter_id
                 WHERE p.id = ? AND p.story_id = ?`).get(passageId, storyId) as any;
  if (!cur) return null;
  const doomed = q(`SELECT id, chapter_id FROM passages
                    WHERE story_id = ? AND branch_id = ? AND ordinal > ?`)
    .all(storyId, cur.branch_id, cur.ordinal) as any[];
  return { cur, doomed, chapters: [...new Set(doomed.map((p) => p.chapter_id as string))] };
}

/** THE SUMMARIES OF YOURS DELETE-AFTER WOULD CLEAR (#46), in chapter order, for its first press to
 *  name. A summary that is Anansi's is not named: re-running it is one press. */
export function yoursClearedBy(storyId: string, passageId: string): { id: string; index: number; title: string | null }[] {
  const cut = afterCut(storyId, passageId);
  if (!cut?.chapters.length) return [];
  return q(`SELECT id, idx AS "index", title FROM chapters WHERE story_id = ? AND summary IS NOT NULL
               AND summary_author = 'human' AND id IN (${cut.chapters.map(() => '?').join(',')})
             ORDER BY idx`).all(storyId, ...cut.chapters) as any[];
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

/** WHAT THIS PASSAGE WAS ASKED FOR: the press, the voice and the instruction behind it. These are
 *  the three `addVariant` copies onto another take of the same slot, and `routes.inherit` re-runs
 *  a re-roll with them — a take is another answer to the same question, so the question has to
 *  come back whole. Story-scoped like every other read here: the gate proves the story, and a
 *  passage id is not a story id. */
export const passageAsked = (storyId: string, id: string):
  { mode: string | null; directive: string | null; speaker: string | null } | null =>
  (q('SELECT mode, directive, speaker FROM passages WHERE id = ? AND story_id = ?')
    .get(id, storyId) as any) ?? null;

/** Just the instruction, which is what the surface asks for. One row-reader, above. */
export const passageDirective = (storyId: string, id: string): string | null =>
  passageAsked(storyId, id)?.directive ?? null;

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
 *  NORMALISED, not stored as typed. A key is stored in the shape `fires` will look for, because
 *  `fires` tokenises the KEY as well as the window — so `High`, `(High`, `High.` and `"High` are
 *  four spellings of one trigger that all match identically. AI Dungeon writes them out by hand
 *  because its own matcher is exact-string; ours is not, and a real export on 2026-08-29 carried
 *  154 such duplicates across 644 keys. Left alone they fire redundantly and, worse, make the
 *  panel claim 644 triggers where 468 exist — a count nobody can act on.
 *
 *  Edge punctuation only. INTERIOR is left exactly as typed: a space is what makes `High Gothic`
 *  a two-part key, which `fires` walks as an ordered run, and that is the whole reason it does
 *  not fire on "high above". Stripping inside would collapse the fix into the bug.
 *
 *  NO CAP by default, at Seth's direction 2026-08-29. SPEC §7.1's ten was a guess and the code
 *  wins: after normalisation the widest card in a real 219-card export holds ten, so the cap only
 *  ever bit the duplicates. Callers reading an untrusted file still pass one — see `import.ts`. */
export const keysOf = (k: unknown, cap = Infinity): string[] => {
  const seen = new Set<string>();
  return (Array.isArray(k) ? k : String(k ?? '').split(','))
    .map((x) => String(x ?? '').trim()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((x) => x.length >= 2 && x.length <= 32)
    // Case-insensitively, keeping the FIRST spelling: the writer's capitalisation is the one
    // shown in the panel, and `fires` lowercases before it compares anything.
    .filter((x) => !seen.has(x.toLowerCase()) && (seen.add(x.toLowerCase()), true))
    .slice(0, cap);
};

/** The two ways a thread reaches the model. `entries.activation` is TEXT with no CHECK, so this
 *  list is the only thing that says so — see the floor at the top of `upsertEntry`. */
const ACTIVATIONS = ['always_on', 'triggered'] as const;

export function upsertEntry(storyId: string, o: string, e: any) {
  // THE ONE FLOOR FOR AN ACTIVATION (Seth, 2026-10-25: refuse anything else). The column stored
  // whatever it was handed — test/db.ts wrote 'keyed' for weeks, which the engine read as on a word
  // and the screen as neither. Every write of a thread crosses this function: the app's save, the
  // copy to another tale, both importers, the paste, the wizard, accept. So the refusal is here and
  // nowhere else. Left out (undefined or null) is the default below, which is how a partial edit
  // has always worked. Refused is null, the same answer as any other write that did not happen.
  if (e.activation != null && !(ACTIVATIONS as readonly unknown[]).includes(e.activation)) return null;
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

  /* #36 · EDITING A FOLLOWED CARD EDITS IT WHERE IT LIVES. This is the bidirectional half of the
   * issue, and it is a redirect rather than a mirror: there is one card, so it cannot drift.
   *
   * BEFORE THIS, THE SAME SAVE MINTED A DUPLICATE. The scoped lookup above correctly does not find
   * a followed card — it belongs to the other book — so the INSERT at the foot of this function ran
   * and this book got a second card with the same name. `web/app.js`'s own note called that "the
   * quiet kind of wrong: two cards with one name, drifting, and the writer believing they edited
   * the shared one", and drew a read-only face rather than risk it.
   *
   * THE OWNER CHECK IS THE WHOLE GUARD, and it is the same one `entriesFor` makes: following is set
   * on a book the owner controls, but `lore_from` could be written by an import or the source could
   * change hands, and a write crossing owners through here is a leak rather than a coherence bug.
   * The card must live in the book this one actually follows — not any book — so a stale or hostile
   * id resolves to nothing and falls through to minting a card here, which is the safe answer.
   *
   * An UNLINKED copy never reaches this: it is a row of this book's own, so `cur` is found above. */
  if (e.id && !cur) {
    const st = q('SELECT lore_from, owner_id FROM stories WHERE id = ?').get(storyId) as any;
    const from = st?.lore_from;
    const there = from ? q('SELECT story_id FROM entries WHERE id = ? AND story_id = ?')
      .get(e.id, from) as any : null;
    const src = there ? q('SELECT owner_id FROM stories WHERE id = ?').get(from) as any : null;
    // Not if this book has taken the card over or thrown it out — then the id is a card of another
    // book that this one has stopped following per-card, and writing to it would edit the world
    // through a door the writer closed.
    if (there && src?.owner_id === st.owner_id && !claimedOrigins(storyId).has(String(e.id)))
      return upsertEntry(from, o, e);
  }

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
    // THE TITLE IS PART OF THE COMPARISON. A rename leaves the old name standing in every summary
    // that used it -- the sharpest version of the failure, because the summary now names somebody
    // the ledger has never heard of.
    // `title: body` and not `title\nbody`, so the title lands where `labelOf` looks. Without the
    // colon a card with an empty body reduced to a bare word at index 0, which the positional rule
    // reads as a sentence opening and skips — and a rename is the sharpest case there is.
    staleSummariesFor(storyId, `${cur.title}: ${cur.body ?? ''}`, `${e.title}: ${e.body ?? ''}`);
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
 *  THE MODEL IS NOT TOLD, AND THAT WAS MEASURED (F44, 2026-08-29). Feeding the rejected take into
 *  DIRECTIVE was built as an arm and run against a control: median word overlap between the reroll
 *  and the take it replaced was 0.15 told against 0.19 not told, at n=6. 0.19 means a reroll
 *  already goes somewhere else on its own. The arm (`Input.rejected`) and its bench
 *  (`bench/reroll.ts`) were deleted on 2026-10-25 at Seth's call; both are in git history if a
 *  writer ever reports getting the same paragraph twice and the question needs asking at n>=50. */
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
  // #75. THE TALE'S OWN POCKETS hang off no thread and have one slot, `instruction`, which no
  // thread has: an instruction for telling the whole tale.
  if (slot === 'instruction' ? !!entryId : !ALL_SLOTS.includes(slot)) return null;
  // A story-level addon has no entry; an entry-level one must point at an entry in THIS story, or
  // a row can be hung off another writer's card. Same shape as `wearOutfit`'s ownership check.
  if (entryId && !q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(entryId, storyId)) return null;
  // #110 · A PLAIN DESCRIPTION, AND NOTHING ELSE (ADR 0008). Every writer of a pocket or an Always
  // true crosses here (the lookup, the cast, Talk, hemming, import, paste, the writer's own save), so
  // the wrapper and the name in front come off here, by the rule the prompt frames by (`slots.plain`).
  if (a.body != null) {
    const owner = entryId ?? (a.id ? (q('SELECT entry_id FROM addons WHERE id = ? AND story_id = ?').get(a.id, storyId) as any)?.entry_id : null);
    const title = owner ? String((q('SELECT title FROM entries WHERE id = ?').get(owner) as any)?.title ?? '') : '';
    a = { ...a, body: plain(a.body, wrapperNames(slot, title, String(a.name ?? ''))) };
  }
  const keys = JSON.stringify(keysOf(a.keys));
  // #77 · ONE ALWAYS TRUE PER THREAD, AND ON. Always true is stored as the `facts` addon and is not a
  // pocket: a second one is an edit of the first, and it is never written switched off. Here, where
  // every writer of a thread passes (the tray, a paste, the forge, a pulled card).
  if (slot === 'facts' && entryId && !a.id) {
    const have = q("SELECT id FROM addons WHERE entry_id = ? AND story_id = ? AND slot = 'facts' ORDER BY active DESC, created_at LIMIT 1")
      .get(entryId, storyId) as any;
    if (have) a = { ...a, id: have.id };
  }
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
    const wasBody = String((q('SELECT body FROM addons WHERE id = ?').get(a.id) as any)?.body ?? '');
    q(`UPDATE addons SET name = ?, body = ?, keys = ?, from_chapter = ?, retired_at_chapter = ?
       WHERE id = ? AND story_id = ?`)
      .run(a.name, a.body, keys, from, till, a.id, storyId);
    // Since the body moved into `facts` on 2026-08-29 the ROOMS are where a card's facts live, so
    // a room edit stales a summary on exactly the same rule as a body edit. Read before the write,
    // because after it the old text is gone -- addons have no revision table.
    staleSummariesFor(storyId, wasBody, String(a.body ?? ''));
    touch(storyId);
    return a.id;
  }
  const id = uid('ad-');
  q(`INSERT INTO addons (id,story_id,entry_id,slot,name,body,keys,active,from_chapter,retired_at_chapter,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, storyId, entryId, slot, a.name, a.body, keys, slot === 'facts' && entryId ? 1 : 0,
      a.fromChapter ?? null, a.retiredAtChapter ?? null, t);
  touch(storyId);
  return id;
}

/** Switch one on or off. EXCLUSIVITY IS ENFORCED HERE AND BY `addons_one_active`, not by the
 *  screen: an exclusive slot clears its siblings on the same entry first, in a transaction, which
 *  is `wearOutfit` with `AND slot = ?` added. Doing it in two statements without the transaction is
 *  how a writer ends up with two appearances and a unique index refusing every later write. */
export function setAddonActive(storyId: string, addonId: string, on: boolean, atChapter?: number) {
  const row = q('SELECT entry_id, slot FROM addons WHERE id = ? AND story_id = ?')
    .get(addonId, storyId) as any;
  if (!row) return null;
  db.exec('BEGIN');
  try {
    // #79. AN OUTFIT PUT ON OR TAKEN OFF AT A SCENE IS DATED, from that scene on. The switch below
    // stays what was last pressed, which is all a thread with no dated wardrobe reads.
    if (row.slot === 'outfit' && row.entry_id && Number.isInteger(atChapter) && atChapter! > 0) {
      firstDated(storyId, row.entry_id, ['wear', 'unwear']);
      addEvent(storyId, row.entry_id, on ? 'wear' : 'unwear', addonId, atChapter!);
    }
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
  // `PINNABLE` on chapter_pins.
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
/** THE WHOLE CARD, not its spine. This carried title, body, notes, type, activation and keys and
 *  nothing else until 2026-08-29 — so a card sent to another book arrived without her appearance,
 *  her voice, her relationships, her wardrobe or her chapter states. That is most of what a card
 *  IS since Phase 2, and the loss was silent: the copy looked complete because a card with no
 *  rooms looks exactly like a card whose rooms did not travel.
 *
 *  Edges are NOT here and cannot be: an edge names two cards, and this one knows about one. They
 *  are `copyLedger`'s, which copies a whole shelf at once and can map both ends. */
export function copyEntry(fromStoryId: string, toStoryId: string, o: string, entryId: string) {
  if (!ownsStory(fromStoryId, o) || !ownsStory(toStoryId, o)) return null;
  const e = q('SELECT * FROM entries WHERE id = ? AND story_id = ?').get(entryId, fromStoryId) as any;
  if (!e) return null;
  const made = upsertEntry(toStoryId, o, {
    title: e.title, body: e.body, notes: e.notes, entryType: e.entry_type,
    activation: e.activation, keys: JSON.parse(e.keys || '[]'), lastEditor: 'human',
  });
  if (!made) return null;
  // The rooms, the wardrobe among them — `outfit` is a slot like any other since the tables were
  // merged, so the coat travels for free rather than needing its own clause.
  for (const a of q('SELECT * FROM addons WHERE entry_id = ? AND story_id = ?')
    .all(entryId, fromStoryId) as any[]) {
    const id = upsertAddon(toStoryId, made, { slot: a.slot, name: a.name, body: a.body,
      keys: JSON.parse(a.keys || '[]'), fromChapter: a.from_chapter, retiredAtChapter: a.retired_at_chapter });
    // `upsertAddon` always inserts unworn, and an exclusive slot refuses a second one worn — so
    // the switch is thrown after, through the function that clears the siblings in a transaction.
    if (id && a.active) setAddonActive(toStoryId, id, true);
  }
  // THE TIMELINE DOES NOT TRAVEL, and that was already decided with a check behind it —
  // `test/scope.ts`: "a state is anchored to a chapter number, and chapter 7 there is not chapter 7
  // here, so copying it puts a fact in force at an unrelated scene." Written here because the
  // rooms above make it look like an oversight: they travel and states do not, and the difference
  // is that a room is true until it is retired while a state is true FROM A NUMBER that means
  // nothing in the book it lands in. Deleting this comment and adding the loop takes ten seconds
  // and puts her chapter-9 death into chapter 9 of a book she has not walked into yet.
  return made;
}

/** #36 · TAKE A FOLLOWED CARD OVER: copy it here, as it stands, and remember where it came from.
 *
 *  Seth's design, 2026-09-01: *"on unlink it would just make a copy of the card in that state but
 *  keep the original id in case it gets reconnected and then resynced."* `origin_id` is that id, and
 *  it is the whole mechanism — everything else about the row is an ordinary card of this book, so
 *  every existing path (edit, room, state, outfit, export, delete) works on it with no new code.
 *
 *  `copyEntry` is reused rather than reimplemented, so the rooms and the worn outfit travel and the
 *  timeline deliberately does not — read the note at the foot of it before changing that.
 *
 *  Refused if this book has already claimed that origin, whether by taking it over or by throwing
 *  it out: two rows claiming one card is two rows the read-through cannot choose between. */
export function unlinkEntry(storyId: string, o: string, originId: string) {
  const st = getStory(storyId) as any;
  const from = st?.lore_from;
  // `ownsStory(from, o)` is BELT TO `copyEntry`'S BRACES — it refuses unless both books are the
  // caller's, and falsifying this line on 2026-09-01 left the cross-owner check green because of
  // that. Kept anyway: this function reads `from` before handing it over, and a reader should not
  // have to open `copyEntry` to know the source is checked.
  if (!from || !ownsStory(storyId, o) || !ownsStory(from, o)) return null;
  if (claimedOrigins(storyId).has(String(originId))) return null;
  const made = copyEntry(from, storyId, o, originId);
  if (!made) return null;
  q("UPDATE entries SET origin_id = ?, sync = 'off' WHERE id = ? AND story_id = ?")
    .run(originId, made, storyId);
  return made;
}

/** #36 · HAND IT BACK. Reconnecting drops this book's row and lets the read-through return, so the
 *  world's card is the one card again — in sync always, because there is only one.
 *
 *  TWO DIRECTIONS, AND THE WRITER SAYS WHICH. `theirs` throws this book's version away and takes the
 *  world's. `mine` writes this book's version up into the world book FIRST, so every book following
 *  it gets what was written here — which is the "resynced" half of the ask.
 *
 *  It also un-drops a tombstone: the same press, because the row being removed is the same row.
 *  `keep: 'mine'` on a tombstone is refused below rather than pushing an emptied card up.
 *
 *  ponytail: `mine` pushes the CARD — title, body, keys, activation — and not its rooms. Replacing
 *  the origin's rooms would mean deleting rooms that every other follower of that book reads, from a
 *  press made inside one of them; adding them would leave two of each. The ceiling is that a room
 *  written after unlinking stays here. Copy the card to the world book instead if the rooms matter,
 *  which is what `POST /api/entry/copy` already does.
 *
 *  Refused when the origin is gone: reconnecting to nothing would delete the only copy left. */
export function relinkEntry(storyId: string, o: string, id: string, keep: 'mine' | 'theirs') {
  const cur = q('SELECT * FROM entries WHERE id = ? AND story_id = ?').get(id, storyId) as any;
  if (!cur?.origin_id || !ownsStory(storyId, o)) return null;
  const from = (getStory(storyId) as any)?.lore_from;
  if (!from || !ownsStory(from, o)) return null;
  if (!q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(cur.origin_id, from)) return null;
  if (keep === 'mine' && cur.sync !== 'dropped') {
    upsertEntry(from, o, { id: cur.origin_id, title: cur.title, body: cur.body, notes: cur.notes,
      entryType: cur.entry_type, activation: cur.activation, keys: JSON.parse(cur.keys || '[]'),
      lastEditor: 'human', allowNoKeys: true });
  }
  // A HARD delete, not `delEntry`: that one leaves a tombstone for exactly this kind of row, which
  // would suppress the card we are handing back and make reconnecting a no-op.
  q('DELETE FROM addons WHERE entry_id = ? AND story_id = ?').run(id, storyId);
  q('DELETE FROM entries WHERE id = ? AND story_id = ?').run(id, storyId);
  touch(storyId);
  return { origin: String(cur.origin_id), pushed: keep === 'mine' && cur.sync !== 'dropped' };
}

/** #36 · REMOVE A FOLLOWED CARD FROM THIS BOOK, without touching the book it lives in. The original
 *  ask, in Seth's words: *"I should be able to delete it from the copied story without runing it for
 *  the current story I.e. Unlinking it."*
 *
 *  A tombstone and not a delete, because there is nothing here to delete — the card belongs to the
 *  other book. The row carries the origin and no content; `entriesOf` keeps it out of every path
 *  that means "cards" and `claimedOrigins` keeps it in the one that means "what this book has
 *  decided". `relinkEntry` removes it and the card comes back.
 *
 *  Reached for a card that is still read through. An unlinked copy is a row of this book's own, so
 *  `delEntry` handles it and lands in the same state. */
export function dropFollowed(storyId: string, o: string, originId: string) {
  const from = (getStory(storyId) as any)?.lore_from;
  if (!from || !ownsStory(storyId, o) || !ownsStory(from, o)) return null;
  const e = q('SELECT * FROM entries WHERE id = ? AND story_id = ?').get(originId, from) as any;
  if (!e) return null;
  if (claimedOrigins(storyId).has(String(originId))) return null;
  const id = uid('e-');
  const t = now();
  // The TITLE is kept. A tombstone with no name cannot be listed as "removed from this book", and
  // the screen has to be able to offer it back by name.
  q(`INSERT INTO entries (id,story_id,owner_id,title,body,notes,entry_type,activation,keys,
      last_editor,field_editors,origin_id,sync,created_at,updated_at)
     VALUES (?,?,?,?,'',NULL,?,'triggered','[]','human','{}',?,'dropped',?,?)`)
    .run(id, storyId, o, e.title, e.entry_type, originId, t, t);
  touch(storyId);
  return id;
}

/** TEST SEAM, and it is here rather than in the suite because the suite cannot reach the column.
 *
 *  `relinkEntry`'s check on the SOURCE book's owner is only reachable from a state the ordinary
 *  doors refuse to create: a local copy whose `origin_id` now lives in somebody else's book. That
 *  state is real — a source can change hands, and an import can write `lore_from` — but nothing in
 *  the app produces it, so falsifying that check left it green until `test/scope.ts` could build it.
 *
 *  Scoped like every other write here, so it cannot reach across books even as a seam. */
export const rawSetOrigin = (storyId: string, id: string, originId: string | null) =>
  q('UPDATE entries SET origin_id = ? WHERE id = ? AND story_id = ?').run(originId, id, storyId);

/** TEST SEAM, beside `rawSetOrigin` and for the same reason: `repairStrandedChapters` fixes a state
 *  no door still opens, so a check cannot reach it through the app. Closing the newest chapter gets
 *  there without deleting anything — a branch whose every chapter is closed has nowhere to write,
 *  which is the invariant the repair restores.
 *
 *  Scoped by story like every other write here. */
export const rawCloseChapter = (storyId: string, id: string) =>
  q("UPDATE chapters SET status = 'closed' WHERE id = ? AND story_id = ?").run(id, storyId);
/** Its pair, for the out-of-order case: a newest chapter that is closed while an earlier one is
 *  open is NOT stranded, and no ordinary door builds that either. */
export const rawOpenChapter = (storyId: string, id: string) =>
  q("UPDATE chapters SET status = 'open' WHERE id = ? AND story_id = ?").run(id, storyId);

/** #36 · WHAT THIS BOOK HAS REMOVED, by name, so the screen can offer it back. */
export const droppedFollowed = (storyId: string) => q(
  "SELECT id, title, origin_id FROM entries WHERE story_id = ? AND sync = 'dropped' ORDER BY title")
  .all(storyId) as any[];

/** Every card in one book, copied into another, with the connections between them.
 *
 *  This exists for the day a book is deleted: the prose is the book and goes with it, but the
 *  ledger is work that outlives the story it was written for. Deleting used to take it — one
 *  `DELETE` and `ON DELETE CASCADE` did the rest — and the only way to save it was to open every
 *  card and send it on by hand, which is the sort of chore nobody does thirty times.
 *
 *  EDGES LAST, AND ONLY WHERE BOTH ENDS MADE THE TRIP. A connection pointing at a card that was
 *  not copied is worse than no connection: `buildContext` would look it up, find nothing, and
 *  quietly pull in nothing, which reads as the feature being broken rather than as a missing card. */
export function copyLedger(fromStoryId: string, toStoryId: string, o: string) {
  if (!ownsStory(fromStoryId, o) || !ownsStory(toStoryId, o)) return null;
  if (fromStoryId === toStoryId) return null;
  const map = new Map<string, string>();
  /* #36 · A CARD GOING HOME IS AN UPDATE, NOT A SECOND COPY.
   *
   * Seth, 2026-09-01: *"if a book is deleted. it can ask the question to merge those cards to the
   * original."* The world book this one follows is one of the destinations this offers, and it is the
   * obvious one — so the cards most likely to travel are exactly the ones this book TOOK OVER from
   * it. Copying those blind would put a second Vel in the bible beside the first, with one name and
   * two bodies, and the follower's own edits in the copy nothing reads.
   *
   * `origin_id` is what makes this answerable: the row already knows which card in the destination
   * it came from. So it lands ON that card. A card born in this book has no origin and is copied as
   * it always was.
   *
   * Only when the origin is still THERE. A card whose origin has since been deleted is a plain copy;
   * writing to a missing id would mint one anyway, but saying so here is cheaper than finding out. */
  for (const e of entriesOf(fromStoryId)) {
    const home = e.origin_id
      && q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(e.origin_id, toStoryId)
      ? String(e.origin_id) : null;
    if (home) {
      upsertEntry(toStoryId, o, { id: home, title: e.title, body: e.body, notes: e.notes,
        entryType: e.entry_type, activation: e.activation, keys: JSON.parse(e.keys || '[]'),
        lastEditor: 'human', allowNoKeys: true });
      map.set(e.id, home);
      continue;
    }
    const made = copyEntry(fromStoryId, toStoryId, o, e.id);
    if (made) map.set(e.id, made);
  }
  let edges = 0;
  for (const g of edgesOf(fromStoryId)) {
    const parent = map.get(g.parent_id), child = map.get(g.child_id);
    if (!parent || !child) continue;
    if (linkEntries(toStoryId, parent, child, { confidence: g.confidence, keys: JSON.parse(g.keys || '[]') })) edges++;
  }
  /* `map` IS RETURNED, AND IT IS NOT FOR THE WIRE. `duplicateStory` needs source card -> copied
   * card to carry the pins, the pictures and the timeline, none of which this function copies —
   * and rebuilding that mapping by matching titles is the fragile version of a thing that is
   * sitting right here. `ledgerInto` drops it before its two routes answer, so the JSON those
   * routes send is unchanged; a Map spread into an object literal would arrive as `{}`. */
  return { cards: map.size, edges, map };
}

export function delEntry(storyId: string, id: string) {
  // Read the title BEFORE the delete: after it there is nothing left to match the story's persona
  // against, and a persona pointing at a character who no longer exists is worse than an empty one
  // — the byline shows a name the ledger cannot explain.
  const cur = q('SELECT title, origin_id FROM entries WHERE id = ? AND story_id = ?')
    .get(id, storyId) as any;
  /* #36 · DELETING AN UNLINKED COPY LEAVES A TOMBSTONE, because a plain DELETE would not delete it.
   *
   * The row came from the book this one follows, so removing it hands the card straight back to the
   * read-through in `entriesFor` and it reappears — with the writer's own edits gone and the world's
   * wording back. That is the worst available outcome and it looks like the delete silently failed.
   *
   * So the row stays, emptied, marked `dropped`, still holding its origin. `entriesOf` excludes it
   * from every path that means "cards", and `claimedOrigins` keeps it in the one path that means
   * "what this book has decided about the world's cards". Reconnecting deletes the tombstone, and
   * then the card comes back on purpose.
   *
   * A card born in this book has no origin and is deleted outright, as it always was. */
  if (cur?.origin_id) {
    q(`UPDATE entries SET sync = 'dropped', body = '', notes = NULL, keys = '[]', updated_at = ?
       WHERE id = ? AND story_id = ?`).run(now(), id, storyId);
    q('DELETE FROM addons WHERE entry_id = ? AND story_id = ?').run(id, storyId);
    for (const col of ['persona', 'locked_character'])
      q(`UPDATE stories SET ${col} = NULL WHERE id = ? AND ${col} = ?`).run(storyId, cur.title);
    touch(storyId);
    return { changes: 1 };
  }
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
      .run(id, storyId, branchId, idx, nextTitle ?? `Scene ${idx}`, 'open', now());
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
/** The most the cover behind the prose can be blurred, in pixels. Past this it is a colour wash. */
export const MAX_COVER_BLUR = 24;
/** #103 · WHAT A TALE FOLLOWS AND ITS WORLD FIELD, DECIDED TOGETHER, and only here. Every write of
 *  `lore_from` goes through `updateStory`, which asks this: the wizard's Create, Tale settings,
 *  and "Start a book here" on Threads. (`duplicateStory` copies the pair as it stands, so it
 *  agrees already; import never writes `lore_from`.) The field rides in every call beside the genre and narrows
 *  a web search, so a tale following one World while its field names another would tell the model
 *  two settings. While the tale follows a World of the same owner, the field is that World's
 *  title, whatever was asked; following a tale that is not a World, or nothing, leaves the field
 *  as asked. Another writer's World never gives its name: the column can point at one (an import,
 *  a book changing hands), and `entriesFor` refuses to read it for the same reason.
 *
 *  A book cannot follow itself, and cannot follow a book that follows it: one hop means the pair is
 *  the only cycle possible, so refusing it here is cheaper than a walk. An explicit null clears it;
 *  an INVALID one leaves what is stored alone. Returning null on a refusal would have made "follow
 *  yourself" a way to silently unfollow the book you were actually following, which is a partial
 *  save destroying a setting it was not asked about. */
function followPair(cur: any, wanted: string | null, world: string | null) {
  const loreFrom = !wanted ? null
    : wanted === cur.id ? (cur.lore_from ?? null)
    : (() => { const other = getStory(wanted) as any;
        return other && other.lore_from !== cur.id ? wanted : (cur.lore_from ?? null); })();
  const src = loreFrom ? getStory(loreFrom) as any : null;
  return { loreFrom, world: src?.is_world && src.owner_id === cur.owner_id ? src.title : world };
}
export function updateStory(id: string, s: any) {
  const cur = getStory(id);
  if (!cur) return;
  const p = (k: string, col: string) => (s[k] !== undefined ? s[k] : cur[col]);
  const pair = followPair(cur, p('loreFrom', 'lore_from') || null, p('world', 'world') ?? null);
  q(`UPDATE stories SET title=?,genre=?,premise=?,setting=?,pov=?,persona=?,writing_style=?,
      spice=?,spice_note=?,max_context=?,status=?,model=?,
      locked_character=?,lockout_on=?,weaving=?,chapter_hero=?,chapter_sticky=?,cover_opacity=?,
      cover_blur=?,cover_flip=?,cover_fade=?,auto_open=?,
      lore_from=?,style_note=?,world=?,world_note=?,updated_at=? WHERE id=?`)
    .run(p('title', 'title'), tidyGenre(p('genre', 'genre')), p('premise', 'premise'), p('setting', 'setting'),
      p('pov', 'pov'), p('persona', 'persona') ?? null, p('writingStyle', 'writing_style'),
      p('spice', 'spice'), p('spiceNote', 'spice_note') ?? null,
      p('maxContext', 'max_context') ?? null, p('status', 'status') ?? 'in_progress',
      p('model', 'model') ?? null,
      p('lockedCharacter', 'locked_character') ?? null,
      // Same shape as autoOpen below: boolean over the wire, integer in the column, and `undefined`
      // means leave it — so a panel that does not show this switch cannot turn it off.
      Number(p('lockoutOn', 'lockout_on') ? 1 : 0),
      // The same shape again, in the column's own slot directly after the lockout's.
      Number(p('weaving', 'weaving') ? 1 : 0),
      Number(p('chapterHero', 'chapter_hero') ? 1 : 0),
      Number(p('chapterSticky', 'chapter_sticky') ? 1 : 0),
      Math.max(0, Math.min(100, Number(p('coverOpacity', 'cover_opacity')) || 0)),
      // Booleans over the wire, integers in the columns, in the columns' own slots.
      Math.max(0, Math.min(MAX_COVER_BLUR, Math.round(Number(p('coverBlur', 'cover_blur')) || 0))),
      Number(p('coverFlip', 'cover_flip') ? 1 : 0),
      Number((p('coverFade', 'cover_fade') ?? 1) ? 1 : 0),
      // A boolean over the wire, an integer in the column, and `undefined` means "leave it" —
      // p() already resolves that to the current value, so a partial save cannot switch it off.
      Number(p('autoOpen', 'auto_open') ? 1 : 0),
      // What it follows, decided with the World field by `followPair`. Placed to
      // match the COLUMN ORDER above — written two slots early once, every value after it shifted,
      // and `test/db.ts` caught it as an unrelated field refusing to save.
      pair.loreFrom,
      p('styleNote', 'style_note') ?? null,
      // The world this book belongs to, and what is true in it. Placed to MATCH THE COLUMN ORDER
      // above, which the note four lines up records getting wrong once — a value written two slots
      // early shifts every one after it, and test/db.ts caught that as an unrelated field refusing
      // to save.
      pair.world,
      p('worldNote', 'world_note') ?? null,
      now(), id);
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
  q('UPDATE chapters SET title=?, authors_note=?, opens_with=?, keep_whole=? WHERE id=? AND story_id=?')
    .run(p('title', 'title'), p('authorsNote', 'authors_note') ?? null,
      p('opensWith', 'opens_with') ?? null,
      p('keepWhole', 'keep_whole') ? 1 : 0, id, storyId);
}
export const delStory = (id: string, ownerId?: string) => ownerId
  ? q('DELETE FROM stories WHERE id = ? AND owner_id = ?').run(id, ownerId)
  : q('DELETE FROM stories WHERE id = ?').run(id);
/** THE ONE PLACE A BOOK IS MARKED AS MOVED, and now the one place that says so out loud. Twenty-five
 *  callers reach this — a passage, a thread, a chapter, a look, a turn — so a live channel hung here
 *  covers every change without a list of routes to keep in step. See src/live.ts. */
const touch = (id: string) => {
  const r = q('UPDATE stories SET updated_at = ? WHERE id = ?').run(now(), id);
  live.changed(id);
  return r;
};

/** Prose, entries and chapter summaries. The shape of this query, the FTS grammar and the
 *  sanitiser are all in src/search.ts — what stays here is EXECUTION and the ownership gate,
 *  which must have exactly one definition in the app and therefore cannot move.
 *
 *  A result used to carry `story`, which is a TITLE, where the client wanted an id, so clicking
 *  a hit tried to open a story called "The Silver Key". One shape now, with the id and the title
 *  as separate columns that cannot be confused for each other. */
export const search = (o: string, term: string, storyId?: string) => {
  const m = ftsQuery(term);
  // Nothing searchable in the box — punctuation, or empty. An empty result, never every row.
  if (!m) return [] as any[];
  return q(searchSQL(MINE(), LIVE('e.'), !!storyId)).all(...searchArgs(m, o, storyId)) as any[];
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
  // THE SEED THAT PRODUCED IT, so a take can be asked for again. Nothing set one until 2026-09-03,
  // which is why no generation in this app was ever reproducible. Read off the generation the
  // passage was tied to rather than stored twice; null for every take written before that day, and
  // for anything a writer typed themselves.
  //
  // AND WHETHER A REMOTE MODEL WROTE IT, off the same generation. Featherless does not reproduce a
  // take from its seed (measured 2026-10-21: the same seed twice gave two different passages), so
  // the History panel must not offer "the same roll again" on one — the seed is still shown.
  return (q(`SELECT p.id, p.body, p.author, p.variant_index, p.selected, p.rejected, p.created_at,
              (SELECT json_extract(g.params, '$.seed') FROM generations g
                WHERE g.passage_id = p.id ORDER BY g.created_at DESC LIMIT 1) AS seed,
              (SELECT g.model FROM generations g
                WHERE g.passage_id = p.id ORDER BY g.created_at DESC LIMIT 1) AS model
              FROM passages p WHERE p.story_id = ? AND p.chapter_id = ? AND p.slot_key = ?
             ORDER BY p.variant_index`).all(storyId, cur.chapter_id, cur.slot_key) as any[])
    .map(({ model, ...t }) => ({ ...t, remote: isRemote(model) }));
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
/** #77. Add to the end of a thread's own text: where it stands from scene 1, the start of Over time.
 *  A pasted or pulled card's history lands here (`slots.TO_OVER_TIME`). */
export function appendInfo(storyId: string, entryId: string, text: string) {
  const e = q('SELECT body FROM entries WHERE id = ? AND story_id = ?').get(entryId, storyId) as any;
  if (!e || !String(text ?? '').trim()) return;
  q('UPDATE entries SET body = ?, updated_at = ? WHERE id = ?')
    .run([String(e.body ?? '').trim(), String(text).trim()].filter(Boolean).join('\n'), now(), entryId);
  touch(storyId);
}

/** #76. A line on a tale's update report: what moved, and the thread it was about.
 *  ITS OWN STATEMENT, ID AND CLOCK, not `q`, `uid` and `now`: its callers are migrations, which run
 *  inside `migrate()` at load, and those three are declared below that call. Reaching for them from
 *  there throws "Cannot access before initialization" (`repairStrandedChapters` paid for it first). */
export function noteUpdate(storyId: string, line: string, entryId: string | null = null) {
  db.prepare('INSERT INTO update_lines (id, story_id, entry_id, line, backup, backup_at, at) VALUES (?,?,?,?,?,?,?)')
    .run('ul-' + randomBytes(4).toString('hex'), storyId, entryId, line, REWRITE?.file ?? null, REWRITE?.at ?? null, Date.now());
}

/** The tale's update report, newest first. Same-millisecond lines keep their order by rowid. */
export function updatesOf(storyId: string) {
  return q(`SELECT u.line, u.entry_id AS entryId, e.title AS entryTitle, u.backup, u.backup_at AS backupAt, u.at
      FROM update_lines u LEFT JOIN entries e ON e.id = u.entry_id
      WHERE u.story_id = ? ORDER BY u.at DESC, u.rowid DESC`).all(storyId) as any[];
}

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

/** A timestamped snapshot in `dir`, keeping the newest `keep` and pruning the rest.
 *
 *  IT PRUNES ONLY WHAT IT WROTE. The filter was `.endsWith('.db')` until 2026-08-30, which made
 *  every database in the directory a candidate — including snapshots taken by hand before a risky
 *  change, which is exactly the file nobody can regenerate.
 *
 *  It went wrong the way that kind of bug does. Names sort, and `pre-*` sorts above `anansi-*`, so
 *  twelve hand-made `pre-restart-*.db` files filled all twelve keep-slots and the snapshot this
 *  call had just written was the thirteenth: deleted, then `statSync`ed, and the server printed
 *  `backup failed: ENOENT` on every boot for twelve boots while the real backups were being eaten.
 *  `backups/pre-craft-backfill.db` — taken before rewriting seven live books' voices, and named in
 *  a handoff as the way back — was pruned this way before anyone read the error.
 *
 *  So: prefix, not extension. A file this function did not write is not its business. */
export function backup(dir = join(dirname(FILE), 'backups'), keep = 12) {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(dir, `anansi-${stamp}.db`);
  snapshot(out);
  const old = readdirSync(dir).filter((f) => f.startsWith('anansi-') && f.endsWith('.db'))
    .sort().reverse().slice(keep);
  for (const f of old) { try { unlinkSync(join(dir, f)); } catch { /* already gone */ } }
  return { file: out, bytes: statSync(out).size, pruned: old.length };
}

/** The whole box, one row per writer who has a book, biggest first.
 *
 *  The boot banner said `library 7 stories` off `listStories(owner(DESK))`, which is the DESK
 *  writer's shelf and not the library. There are nine on this box: seven of Seth's and two of
 *  Kia's. Nothing was wrong with the number — the word above it was wrong, and it read as a
 *  missing-rows bug for long enough to be written into a handoff as one.
 *
 *  Counted the same way `listStories` counts, deliberately: no status filter, so the two agree by
 *  construction and the banner cannot drift from the shelf it is summing. */
export const storiesPerOwner = (): { login: string; n: number }[] =>
  q(STORIES_PER_OWNER).all() as any[];
/** The query itself, exported for `status.ts`, which runs it on its own read-only connection to
 *  the file. One query, so the status line and the boot banner cannot count two different ways. */
export const STORIES_PER_OWNER = `SELECT u.login AS login, COUNT(s.id) AS n FROM users u
       JOIN stories s ON s.owner_id = u.id
      GROUP BY u.id ORDER BY n DESC, u.login`;

/** Every story and who owns it, for the scheduled export. Not `listStories`, which is per owner
 *  and shaped for the shelf — this is the whole library, across every writer on the box. */
export const allStoriesForExport = (): { id: string; ownerId: string; title: string }[] =>
  (q('SELECT id, owner_id, title FROM stories WHERE status IS NULL OR status != ?').all('deleted') as any[])
    .map((r) => ({ id: r.id, ownerId: r.owner_id, title: r.title }));

/** The stamp `exportStory` writes, and the pattern that recognises one. Anchored, because the
 *  prune below decides what to delete with it.
 *
 *  `2026-09-06T02-07-49-434Z` — an ISO string with `:` and `.` replaced by `-`. */
const STAMPED = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/;

/** One story as a standalone database, safe to hand to someone else.
 *
 *  Copies the whole file and then deletes everything that is not this story, rather than
 *  listing the fourteen tables to copy. The schema's own ON DELETE CASCADE does the pruning,
 *  so a table added later is handled without touching this function — and the three history
 *  tables carry no story_id, so a hand-written list would have been the thing that silently
 *  leaked them. Stories go before users: stories.owner_id has no CASCADE, so deleting the
 *  other users first would fail the constraint. */
export function exportStory(storyId: string, ownerId: string, dir = join(dirname(FILE), 'exports'),
                            keep = 0) {
  if (!ownsStory(storyId, ownerId)) throw new Error('no such story');
  const story = q('SELECT title FROM stories WHERE id = ?').get(storyId) as any;
  mkdirSync(dir, { recursive: true });
  const slug = String(story.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'story';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = join(dir, `${slug}-${stamp}.db`);
  snapshot(out);
  const copy = new DatabaseSync(out);
  /* A FAILED EXPORT DELETES ITS FILE. The snapshot is the WHOLE library, every writer's books, and
   * it is trimmed to one story only after it is written. Until 2026-10-24 a failure part-way left
   * that whole copy behind, named after this one book, in the export directory. */
  let ok = false;
  try {
    copy.exec('PRAGMA foreign_keys = ON;');
    copy.prepare('DELETE FROM stories WHERE id != ?').run(storyId);
    /* THE OTHER WRITERS' PROMPT OVERRIDES GO BEFORE THE WRITERS DO.
     *
     * `prompt_overrides.owner_id REFERENCES users(id)` with NO cascade, so deleting a user who has
     * one raises FOREIGN KEY constraint failed and takes the whole export with it. `writer_look`
     * cascades and needs no help; this is the only table that does.
     *
     * IT FAILED ASYMMETRICALLY, which is why nobody noticed. Exporting the DESK's own book deletes
     * the other writers, and they have no overrides — fine. Exporting THEIR book deletes the desk,
     * who does. So from the moment the desk saved its first override, every book it did not own
     * stopped being exported off-disk and the only sign was one line at boot naming the first
     * failure. Measured on the live library 2026-09-01: the override was saved 2026-08-31 21:09 and
     * four of nine books had failed silently since — including both of the second writer's, which
     * is the half that matters, because hers are the ones the desk cannot see.
     *
     * `!= ownerId` and not a blanket delete: the export keeps the owner's own overrides, which is
     * consistent with keeping their user row — how the book reads is part of the book.
     *
     * EVERY SUCH TABLE, read off the schema, not named by hand. `shortlist` (#48) was the second
     * one: from the day both writers had a shortlist, every book failed to export, and the only
     * sign was the same line at boot. A third table added the same way is covered here unchanged. */
    const held = copy.prepare(`SELECT m.name AS tbl, f."from" AS col FROM sqlite_master m,
      pragma_foreign_key_list(m.name) f WHERE m.type = 'table' AND m.name != 'stories'
      AND f."table" = 'users' AND f.on_delete != 'CASCADE'`).all() as { tbl: string; col: string }[];
    for (const { tbl, col } of held)
      copy.prepare(`DELETE FROM "${tbl}" WHERE "${col}" != ?`).run(ownerId);
    copy.prepare('DELETE FROM users WHERE id != ?').run(ownerId);
    copy.exec('VACUUM;');
    ok = true;
  } finally {
    copy.close();
    if (!ok) try { unlinkSync(out); } catch { /* never written */ }
  }

  /* PRUNE THIS BOOK'S OLD EXPORTS, and only this book's.
   *
   * `keep = 0` means never prune, which is what every caller got before 2026-09-06 and is still the
   * default: an export somebody asked for by hand must not delete anything. Only the scheduled
   * export in serve.ts passes a number.
   *
   * THE SLUG IS NOT A SAFE PREFIX ON ITS OWN, and this is the whole reason for `STAMPED`.
   * Book titles nest. Measured against the real /data/anansi-books on 2026-09-06, which held two
   * such pairs: `the-anagram` inside `the-anagram-of-ash`, and `test` inside `test-library`.
   * `f.startsWith('the-anagram-')` matches `the-anagram-of-ash-2026-…` — so pruning The Anagram
   * down to its newest fourteen would have deleted all 87 exports of The Anagram of Ash.
   *
   * So what follows the slug must be a STAMP and nothing else. That is the same lesson `backup()`
   * above records from the `pre-*` incident — prune only what this function wrote, and be able to
   * prove a candidate is one of yours — met here by a second, sharper filter, because a prefix
   * alone is not proof when the prefixes nest.
   *
   * Newest-first by NAME, which is sound only because the stamp is ISO and fixed width: it sorts
   * lexicographically in time order. That is a property of the format above, so the two must not
   * drift apart — `STAMPED` is anchored to exactly the shape `stamp` builds. */
  if (keep > 0) {
    /* NEVER THE FILE THIS CALL JUST WROTE, whatever the filter above decides.
     *
     * `backup()` learned this on 2026-08-30 the expensive way: its candidates outsorted the fresh
     * snapshot, so the snapshot was deleted and then `statSync`ed, and the server printed
     * `backup failed: ENOENT` on every boot for twelve boots while the real backups were eaten.
     *
     * Reproduced here on purpose while falsifying the check below — removing `STAMPED` from the
     * filter made this function delete its own output and crash on the `statSync` at the return,
     * the identical failure. A prune whose correctness depends on a pattern matching correctly is
     * one pattern bug away from destroying the thing it was called to create, so the freshly
     * written file is excluded structurally instead. */
    const just = out.slice(dir.length + 1);
    const mine = readdirSync(dir)
      .filter((f) => f !== just && f.startsWith(`${slug}-`) && STAMPED.test(f.slice(slug.length + 1)))
      .sort().reverse();
    for (const f of mine.slice(keep - 1)) { try { unlinkSync(join(dir, f)); } catch { /* already gone */ } }
  }
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
      q(`INSERT INTO chapters (id,story_id,branch_id,idx,title,authors_note,opens_with,summary,
          summary_covers_through,summary_hash,summary_author,status,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(nid, storyId, id, ch.idx, ch.title, ch.authors_note, ch.opens_with, ch.summary,
          ch.summary_covers_through, ch.summary_hash, ch.summary_author, 'open', t);
    }

    for (const p2 of q(`SELECT * FROM passages WHERE story_id = ? AND branch_id = ? AND selected = 1
                        AND ordinal <= ? ORDER BY ordinal`).all(storyId, fromBranchId, atOrdinal) as any[]) {
      const nch = chapterMap.get(p2.chapter_id);
      if (!nch) continue;
      // `mode` RIDES WITH `directive`, for the third time and the same reason: a copy of a passage
      // is the same passage, so a fork that dropped it turned every accent on the branched
      // timeline neutral — the failure `addVariant` names above, in a second INSERT that had not
      // been given the column. Found 2026-09-02 while backfilling Continue: seven copied rows,
      // across two forks, all reading as pressless.
      q(`INSERT INTO passages (id,chapter_id,story_id,branch_id,slot_key,ordinal,variant_index,
          selected,author,speaker,body,is_break,mode,directive,created_at)
         VALUES (?,?,?,?,?,?,0,1,?,?,?,?,?,?,?)`)
        .run(uid('p-'), nch, storyId, id, p2.slot_key, p2.ordinal, p2.author, p2.speaker,
          p2.body, p2.is_break, p2.mode ?? null, p2.directive ?? null, t);
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
        q(`INSERT INTO arcs (id,story_id,branch_id,from_chapter,to_chapter,title,summary,created_at,summaries_hash)
           VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(uid('a-'), storyId, id, a.from_chapter, a.to_chapter, a.title, a.summary, t, a.summaries_hash);

    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(storyId);
  return id;
}

/** THE WHOLE BOOK AGAIN, STANDING ON ITS OWN. Seth, 2026-09-11: *"copies threads independent of
 *  the original."*
 *
 *  WHY A BRANCH CANNOT DO THIS, which is the question this answers. `entries` and `strings` are
 *  keyed by story and have no branch column, so every branch of a book reads and writes ONE
 *  ledger — `forkBranch` copies chapters, passages, pins and arcs and deliberately shares canon,
 *  because a fact is true on every path. That is right for a fork and it is exactly what makes it
 *  useless here: you cannot change who somebody is on one branch without changing it on the other.
 *  A second book is the only shape in this schema where two ledgers exist.
 *
 *  And why it is not the button beside it. "Start a new book from these threads" is `copyLedger`
 *  alone: the cast travels and the prose does not. This is both halves.
 *
 *  THE CHAPTER NUMBERS MEAN WHAT THEY MEANT, and three things ride on that. Read the note at the
 *  foot of `copyEntry` first: it refuses to carry a card's timeline across because a state is
 *  anchored to a chapter NUMBER and chapter 7 there is not chapter 7 here. In a whole-book copy it
 *  is — every chapter arrives with its own `idx` — so `entry_states`, `strings` and
 *  `retired_at_chapter` travel here and must not be lifted out of this function into any path that
 *  copies between two different books.
 *
 *  WHAT DOES NOT COME, on purpose: passage revisions, generation logs, raised flags and open
 *  proposals — workbench state about how the original got written rather than the book — and
 *  `story_writers`, because a copy belongs to whoever pressed the button until they invite
 *  somebody into it.
 *
 *  TWO STEPS RATHER THAN ONE TRANSACTION. `copyLedger` reaches `setAddonActive`, which opens a
 *  transaction of its own, and SQLite has no nested ones. So the ledger lands first, by the same
 *  path the button beside it already uses, and the prose is the atomic half. */
export function duplicateStory(ownerId: string, storyId: string, title: string) {
  if (!ownsStory(storyId, ownerId)) return null;
  const src = getStory(storyId);
  if (!src) return null;

  const made = createStory(ownerId, {
    title: title || `${src.title} — a copy`,
    genre: src.genre, premise: src.premise, setting: src.setting, pov: src.pov,
    persona: src.persona, writingStyle: src.writing_style, styleNote: src.style_note,
    spice: src.spice, spiceNote: src.spice_note,
    maxContext: src.max_context, model: src.model, lockedCharacter: src.locked_character,
    lockoutOn: src.lockout_on !== 0,
    // AN ARCHIVED BOOK COPIES ONTO THE SHELF. Carrying `archived` would answer the press with a
    // book that is dimmed and last, which is indistinguishable from the press having done nothing.
    // Every other status means what it says and travels.
    status: src.status === 'archived' ? 'in_progress' : src.status,
  });
  /* The columns `createStory` does not take. `lore_from` is here and is NOT here in
   * `import.fromExport` — the difference is real rather than an inconsistency: an export lands
   * somewhere the world book does not exist, and this lands beside it. A copy of a book set in a
   * world is a book set in that world. */
  q(`UPDATE stories SET lore_from=?, is_world=?, world=?, world_note=?, auto_open=?, look=?,
       chapter_hero=?, chapter_sticky=?, cover_opacity=?, cover_blur=?, cover_flip=?, cover_fade=?, weaving=? WHERE id=?`)
    .run(src.lore_from ?? null, src.is_world ?? 0, src.world ?? null, src.world_note ?? null,
      src.auto_open, src.look ?? null, src.chapter_hero, src.chapter_sticky, src.cover_opacity,
      src.cover_blur ?? 0, src.cover_flip ?? 0, src.cover_fade ?? 1, src.weaving ?? 0, made.id);

  const ledger = copyLedger(storyId, made.id, ownerId);
  const cards = ledger?.map ?? new Map<string, string>();

  const t = now();
  const branchMap = new Map<string, string>();
  const chapterMap = new Map<string, string>();
  db.exec('BEGIN');
  try {
    /* WHAT `copyEntry` LEAVES BEHIND, put on here rather than by widening it. Four of these are
     * read: `sticky_for` and `proper_nouns` are how `buildContext` folds a card in and holds it
     * open, `retired_at_chapter` is how a finished thread stays finished, and `origin_id`/`sync`
     * are what a card taken over from a world book CLAIMS.
     *
     * The origin pair matters most and is the least obvious: this copy carries `lore_from`, so it
     * reads the same world through. A taken-over card arriving with no origin claims nothing, and
     * the world's version then shows up BESIDE the copy — one name, two cards, and the writer's own
     * wording in the one nothing reads.
     *
     * Widening `copyEntry` instead would change what a copy between two DIFFERENT books does, and
     * `retired_at_chapter` is a chapter number: over there it means nothing. Here it means what it
     * meant. */
    for (const [from, to] of cards) {
      const e = q(`SELECT sticky_for, proper_nouns, field_editors, retired_at_chapter, origin_id, sync
                     FROM entries WHERE id = ?`).get(from) as any;
      if (!e) continue;
      q(`UPDATE entries SET sticky_for=?, proper_nouns=?, field_editors=?, retired_at_chapter=?,
           origin_id=?, sync=? WHERE id=? AND story_id=?`)
        .run(e.sticky_for, e.proper_nouns, e.field_editors, e.retired_at_chapter,
          e.origin_id, e.sync, to, made.id);
    }
    /* AND THE TOMBSTONES, which `copyLedger` cannot see: `entriesOf` excludes them by design, since
     * every path that means "cards" should not show an emptied row. But a tombstone is this book's
     * decision ABOUT a world card — it is what keeps the read-through from handing it back. A copy
     * that follows the same world without them has every card the original threw out walking
     * straight back in. */
    for (const tomb of q("SELECT * FROM entries WHERE story_id = ? AND sync = 'dropped'")
      .all(storyId) as any[])
      q(`INSERT INTO entries (id,story_id,owner_id,title,body,notes,entry_type,activation,keys,
           sticky_for,proper_nouns,last_editor,field_editors,retired_at_chapter,origin_id,sync,
           created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(uid('e-'), made.id, ownerId, tomb.title, tomb.body, tomb.notes, tomb.entry_type,
          tomb.activation, tomb.keys, tomb.sticky_for, tomb.proper_nouns, tomb.last_editor,
          tomb.field_editors, tomb.retired_at_chapter, tomb.origin_id, tomb.sync,
          tomb.created_at, tomb.updated_at);

    // The empty branch `createStory` minted goes, and its Chapter One goes with it on the cascade.
    // Copying the source's branches ON TOP of it would leave a second trunk with nothing in it, and
    // two rows claiming `is_primary` is a shape `listStories` reads.
    q('DELETE FROM branches WHERE id = ?').run(made.branchId);

    for (const b of q('SELECT * FROM branches WHERE story_id = ? ORDER BY created_at')
      .all(storyId) as any[]) {
      const nid = uid('b-');
      branchMap.set(b.id, nid);
      q(`INSERT INTO branches (id,story_id,parent_id,name,fork_ordinal,is_primary,created_at)
         VALUES (?,?,NULL,?,?,?,?)`)
        .run(nid, made.id, b.name, b.fork_ordinal, b.is_primary, b.created_at);
    }
    // `parent_id` IN A SECOND PASS. A branch can be listed before the one it forked from — nothing
    // orders `created_at` against the fork — so remapping in the first loop writes the SOURCE's id
    // into this book for any child seen early, which is a row pointing across two stories.
    for (const b of q('SELECT id, parent_id FROM branches WHERE story_id = ?').all(storyId) as any[])
      if (b.parent_id && branchMap.has(b.parent_id))
        q('UPDATE branches SET parent_id = ? WHERE id = ?')
          .run(branchMap.get(b.parent_id), branchMap.get(b.id));

    for (const ch of q('SELECT * FROM chapters WHERE story_id = ? ORDER BY idx').all(storyId) as any[]) {
      const nb = branchMap.get(ch.branch_id);
      if (!nb) continue;
      const nid = uid('c-');
      chapterMap.set(ch.id, nid);
      // `status` IS COPIED, where `forkBranch` forces every chapter open. A fork is a place to
      // write and must have somewhere to write; this is the same book again, and a closed chapter
      // that reopened would put the next passage into a chapter the writer had finished.
      q(`INSERT INTO chapters (id,story_id,branch_id,idx,title,authors_note,opens_with,summary,
           summary_covers_through,summary_hash,summary_author,status,keep_whole,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(nid, made.id, nb, ch.idx, ch.title, ch.authors_note, ch.opens_with, ch.summary,
          ch.summary_covers_through, ch.summary_hash, ch.summary_author, ch.status, ch.keep_whole,
          ch.created_at);
    }

    // EVERY VARIANT, not only the selected one — the other difference from `forkBranch`, which
    // takes the selected passage of each slot because a fork is a new path. A duplicate that
    // dropped the takes would lose the re-rolls sitting behind every passage in the book.
    // `passages_sel` is partial on `selected = 1`, so the rows come across as they stand.
    for (const p2 of q(`SELECT * FROM passages WHERE story_id = ?
                        ORDER BY ordinal, variant_index`).all(storyId) as any[]) {
      const nch = chapterMap.get(p2.chapter_id), nb = branchMap.get(p2.branch_id);
      if (!nch || !nb) continue;
      q(`INSERT INTO passages (id,chapter_id,story_id,branch_id,slot_key,ordinal,variant_index,
           selected,author,speaker,body,is_break,mode,directive,rejected,claimed,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(uid('p-'), nch, made.id, nb, p2.slot_key, p2.ordinal, p2.variant_index, p2.selected,
          p2.author, p2.speaker, p2.body, p2.is_break, p2.mode, p2.directive, p2.rejected,
          p2.claimed, p2.created_at);
    }

    // Both ends remapped. A pin needs the chapter AND the card: the scene's composite key refuses a
    // chapter of another story, and `PINNABLE` a card the copy may not pin — which is the check
    // doing the work if one of these maps is ever wrong. #102: a card that is not in the map is a
    // thread of the World the tale follows, and the copy follows the same World, so it keeps its id.
    for (const pin of q('SELECT * FROM chapter_pins WHERE story_id = ?').all(storyId) as any[]) {
      const nch = chapterMap.get(pin.chapter_id), ne = cards.get(pin.entry_id) ?? pin.entry_id;
      if (!nch) continue;
      q(`INSERT INTO chapter_pins (chapter_id,entry_id,story_id,mode,created_at) SELECT ?,?,?,?,?
         WHERE ${PINNABLE}`).run(nch, ne, made.id, pin.mode, pin.created_at, made.id, ne);
    }

    for (const a of q('SELECT * FROM arcs WHERE story_id = ?').all(storyId) as any[]) {
      const nb = branchMap.get(a.branch_id);
      if (!nb) continue;
      q(`INSERT INTO arcs (id,story_id,branch_id,from_chapter,to_chapter,title,summary,created_at,summaries_hash)
         VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(uid('a-'), made.id, nb, a.from_chapter, a.to_chapter, a.title, a.summary, a.created_at, a.summaries_hash);
    }

    // What the book promised and has not paid. `import.fromExport` carries these for the reason
    // that applies twice over here: a book that comes back without its unpaid promises is a
    // different book, because the ledger says who everybody is and the strings are the only record
    // of what is still owed.
    for (const s2 of q('SELECT * FROM strings WHERE story_id = ?').all(storyId) as any[])
      q(`INSERT INTO strings (id,story_id,title,body,from_chapter,owed_by,status,summoned,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(uid('st-'), made.id, s2.title, s2.body, s2.from_chapter, s2.owed_by, s2.status,
          s2.summoned, s2.created_at);

    // Canon over time. See the header: the chapters kept their numbers, so these mean here what
    // they meant there — which is the one condition `copyEntry` says has to hold.
    for (const [from, to] of cards)
      for (const es of q('SELECT * FROM entry_states WHERE entry_id = ? ORDER BY from_chapter')
        .all(from) as any[])
        q(`INSERT INTO entry_states (id,entry_id,from_chapter,body,before_mode,label,created_at)
           VALUES (?,?,?,?,?,?,?)`)
          .run(uid('st-'), to, es.from_chapter, es.body, es.before_mode, es.label, es.created_at);

    /* THE ROOMS THAT HANG OFF NO CARD. `copyEntry` walks `addons` by `entry_id`, so a STORY-level
     * room — `upsertAddon` takes a null entry and every read allows it — is invisible to
     * `copyLedger` and would be dropped without a word. There are none in the live library today,
     * which is exactly why this is the sort of thing that gets found a year late. */
    for (const a of q('SELECT * FROM addons WHERE story_id = ? AND entry_id IS NULL')
      .all(storyId) as any[])
      q(`INSERT INTO addons (id,story_id,entry_id,slot,name,body,keys,active,from_chapter,
           retired_at_chapter,created_at) VALUES (?,?,NULL,?,?,?,?,?,?,?,?)`)
        // STAMPED NOW, not carried. Every other row here keeps the source's `created_at`, and this
        // one does not on purpose: the rooms that DO hang off a card come through `copyEntry` ->
        // `upsertAddon`, which stamps its own. Carrying it here would give one book two conventions
        // for the same column depending on whether the room has a card, which is the shape of
        // difference nobody looks for. `test/db.ts` compares the two halves and found this.
        .run(uid('ad-'), made.id, a.slot, a.name, a.body, a.keys, a.active, a.from_chapter,
          a.retired_at_chapter, t);

    // The pictures: the book's cover and the threads' own. Blobs, copied as blobs.
    const cover = q('SELECT jpeg, set_at FROM story_covers WHERE story_id = ?').get(storyId) as any;
    if (cover)
      q('INSERT INTO story_covers (story_id, jpeg, set_at) VALUES (?,?,?)')
        .run(made.id, cover.jpeg, cover.set_at);
    for (const [from, to] of cards) {
      const img = q('SELECT jpeg, set_at FROM entry_images WHERE entry_id = ? AND story_id = ?')
        .get(from, storyId) as any;
      if (img)
        q('INSERT INTO entry_images (entry_id, story_id, jpeg, set_at) VALUES (?,?,?,?)')
          .run(to, made.id, img.jpeg, img.set_at);
    }

    // Where the writer was standing. `listStories` and every read resolve the active branch or fall
    // back to the primary, so leaving this null would open the copy on main however far along
    // another path the original was.
    const active = src.active_branch && branchMap.get(src.active_branch);
    q('UPDATE stories SET active_branch = ?, updated_at = ? WHERE id = ?')
      .run(active ?? null, t, made.id);

    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  return { id: made.id, cards: ledger?.cards ?? 0, edges: ledger?.edges ?? 0,
    branches: branchMap.size, chapters: chapterMap.size,
    passages: (q('SELECT COUNT(*) AS n FROM passages WHERE story_id = ? AND selected = 1')
      .get(made.id) as any).n };
}

/** DELETE A BRANCH, AND EVERYTHING ON IT. Seth, 2026-10-26: "there's no way for me to delete
 *  branches."
 *
 *  Its chapters go, and the cascade takes their prose, every take, the edit history and the pins
 *  (`delChapter` says why each of those is a real cascade). Written out, as there: the flags on its
 *  passages and the proposals its chapters made, which carry no foreign key; and its acts, which
 *  hang off the branch. Canon stays: a thread is the tale's, on every path. `generations` stays: it
 *  is the log of what was asked, not the book.
 *
 *  NEVER THE ONE YOU ARE ON. Switch to another first; deleting the path the page is showing would
 *  leave the tale with nothing to show. A branch forked from this one keeps its prose and its place;
 *  it only loses the name of where it came from. If this was the main branch, the one you are on
 *  becomes the main one, so a tale always has one. */
export function delBranch(storyId: string, branchId: string): { deleted: number; error?: string } {
  const b = q('SELECT id, is_primary FROM branches WHERE id = ? AND story_id = ?').get(branchId, storyId) as any;
  if (!b) return { deleted: 0, error: 'That branch is gone already.' };
  const active = activeBranchOf(storyId);
  if (active === branchId) return { deleted: 0,
    error: 'This is the branch you are on. Switch to another branch first, then this one can go.' };
  db.exec('BEGIN');
  try {
    q(`DELETE FROM violations WHERE story_id = ? AND passage_id IN
         (SELECT id FROM passages WHERE branch_id = ?)`).run(storyId, branchId);
    q(`DELETE FROM proposals WHERE story_id = ? AND chapter_id IN
         (SELECT id FROM chapters WHERE branch_id = ?)`).run(storyId, branchId);
    q('DELETE FROM arcs WHERE story_id = ? AND branch_id = ?').run(storyId, branchId);
    q('DELETE FROM chapters WHERE story_id = ? AND branch_id = ?').run(storyId, branchId);
    q('DELETE FROM passages WHERE story_id = ? AND branch_id = ?').run(storyId, branchId);
    q('UPDATE branches SET parent_id = NULL WHERE story_id = ? AND parent_id = ?').run(storyId, branchId);
    q('DELETE FROM branches WHERE id = ? AND story_id = ?').run(branchId, storyId);
    if (b.is_primary) {
      q('UPDATE branches SET is_primary = 1 WHERE id = ? AND story_id = ?').run(active, storyId);
      q('UPDATE stories SET active_branch = ? WHERE id = ?').run(active, storyId);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  touch(storyId);
  return { deleted: 1 };
}

export function setActiveBranch(storyId: string, branchId: string) {
  const b = q('SELECT 1 FROM branches WHERE id = ? AND story_id = ?').get(branchId, storyId);
  if (!b) return false;
  q('UPDATE stories SET active_branch = ? WHERE id = ?').run(branchId, storyId);
  return true;
}

// ---- arcs: the act-level tier ----
export const arcsOf = (storyId: string) => q(
  'SELECT * FROM arcs WHERE story_id = ? AND branch_id = ? ORDER BY from_chapter')
  .all(storyId, activeBranchOf(storyId)) as any[];
export function addArc(storyId: string, a: any) {
  const id = uid('a-');
  // The fingerprint is taken HERE and in `updateArc`, not by their callers, so a roll-up and a hand
  // save cannot disagree about what "built from" means.
  q(`INSERT INTO arcs (id,story_id,branch_id,from_chapter,to_chapter,title,summary,created_at,summaries_hash)
     VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, storyId, a.branchId, a.fromChapter, a.toChapter, a.title ?? null, a.summary, now(),
      actPrintAt(storyId, a.branchId, a.fromChapter, a.toChapter, true));
  return id;
}
export const delArc = (storyId: string, id: string) =>
  q('DELETE FROM arcs WHERE id = ? AND story_id = ?').run(id, storyId);
/** An act edited by hand: its text and its title, and the fingerprint of its chapters as they are
 *  now — the writer has vouched for it against them, so it is no longer out of date (#47). Scoped
 *  by story like `delArc`, so an act id from another book changes nothing. Answers whether the act
 *  was found. */
export function updateArc(storyId: string, id: string, title: string | null, summary: string) {
  const a = q('SELECT branch_id, from_chapter, to_chapter FROM arcs WHERE id = ? AND story_id = ?')
    .get(id, storyId) as any;
  if (!a) return false;
  q('UPDATE arcs SET title = ?, summary = ?, summaries_hash = ? WHERE id = ? AND story_id = ?')
    .run(title, summary, actPrintAt(storyId, a.branch_id, a.from_chapter, a.to_chapter, true), id, storyId);
  return true;
}

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
export function setRetired(storyId: string, id: string, at: number | null | undefined, returnAt?: number) {
  if (!q('SELECT 1 FROM entries WHERE id = ? AND story_id = ?').get(id, storyId)) return false;
  // #79. DATED: retired from `at`, or brought back from `returnAt` (the scene the writer is in; the
  // newest scene when no caller says). The column keeps where the timeline ends up — the scene of a
  // retirement nothing later undoes, or null — which is what the lists that are not per scene read.
  firstDated(storyId, id, ['retire', 'return']);
  const newest = Number((q('SELECT MAX(idx) n FROM chapters WHERE story_id = ?').get(storyId) as any)?.n) || 1;
  // A RETIREMENT STILL AHEAD of where the writer is (retired at 12, brought back at 1) is lifted
  // where it starts: the return lands at its scene, not before it, so nothing later re-retires it.
  const ahead = retiredNow(id, Number.MAX_SAFE_INTEGER) ?? 0;
  addEvent(storyId, id, at != null ? 'retire' : 'return', null,
    at ?? Math.max(returnAt && returnAt > 0 ? returnAt : newest, ahead));
  const still = retiredNow(id, Number.MAX_SAFE_INTEGER);
  q('UPDATE entries SET retired_at_chapter = ? WHERE id = ? AND story_id = ?').run(still, id, storyId);
  touch(storyId);
  return true;
}

/** #79 · A thread's dated events, by entry, for the view. */
export const eventsForStory = (storyId: string) => {
  const map = new Map<string, any[]>();
  for (const r of q('SELECT * FROM entry_events WHERE story_id = ? ORDER BY created_at, rowid').all(storyId) as any[])
    (map.get(r.entry_id) ?? map.set(r.entry_id, []).get(r.entry_id)!).push(r);
  return map;
};
export const delEvent = (storyId: string, id: string) => {
  const ev = q('SELECT entry_id, kind FROM entry_events WHERE id = ? AND story_id = ?').get(id, storyId) as any;
  const r = q('DELETE FROM entry_events WHERE id = ? AND story_id = ?').run(id, storyId);
  // THE COLUMN FOLLOWS THE TIMELINE, as `setRetired` keeps it. A thread with no retire or return
  // events left is read off `retired_at_chapter` alone (`context.retiredAt`), so taking out its only
  // retirement used to leave the column saying retired, and the thread stayed out of the prompt with
  // nothing on its Over time to say why (#98 found it: Talk's Undo of a retirement goes through here).
  if (r.changes && (ev?.kind === 'retire' || ev?.kind === 'return'))
    q('UPDATE entries SET retired_at_chapter = ? WHERE id = ? AND story_id = ?')
      .run(retiredNow(ev.entry_id, Number.MAX_SAFE_INTEGER), ev.entry_id, storyId);
  if (r.changes) touch(storyId);
  return !!r.changes;
};
function addEvent(storyId: string, entryId: string, kind: string, addonId: string | null, from: number) {
  q('INSERT INTO entry_events (id, story_id, entry_id, kind, addon_id, from_chapter, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(uid('ev-'), storyId, entryId, kind, addonId, from, now());
}
/** THE FIRST DATED PRESS KEEPS WHAT WAS TRUE BEFORE IT. A thread with no events of these kinds reads
 *  its switch (`active`) or its column, at every scene; the first event would otherwise unwear its
 *  coat, or unretire it, at every scene before itself. So that state is written first, from scene 1
 *  for the coat and from the scene it was retired at for a retirement: every earlier scene reads as
 *  it did. One floor, here, for both writers. */
function firstDated(storyId: string, entryId: string, kinds: string[]) {
  if (q(`SELECT 1 FROM entry_events WHERE entry_id = ? AND kind IN (${kinds.map(() => '?').join(',')})`).get(entryId, ...kinds)) return;
  if (kinds.includes('wear')) {
    const worn = q("SELECT id FROM addons WHERE entry_id = ? AND story_id = ? AND slot = 'outfit' AND active = 1").get(entryId, storyId) as any;
    if (worn) addEvent(storyId, entryId, 'wear', worn.id, 1);
  } else {
    const was = (q('SELECT retired_at_chapter n FROM entries WHERE id = ?').get(entryId) as any)?.n;
    if (was != null) addEvent(storyId, entryId, 'retire', null, was);
  }
}
/** The retire event still in force at a scene, by the rule `context.retiredAt` reads with. */
function retiredNow(entryId: string, at: number): number | null {
  const last = (q(`SELECT kind, from_chapter FROM entry_events WHERE entry_id = ? AND kind IN ('retire','return')
    AND from_chapter <= ? ORDER BY from_chapter DESC, created_at DESC, rowid DESC LIMIT 1`).get(entryId, at)) as any;
  return last?.kind === 'retire' ? last.from_chapter : null;
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
  // A thread outside `PINNABLE` writes no row; the scene's composite key refuses a scene from
  // another tale. Both are the intended outcome, but a raw constraint error is not a useful answer.
  try {
    return q(`INSERT INTO chapter_pins (chapter_id,entry_id,story_id,mode,created_at)
       SELECT ?,?,?,?,? WHERE ${PINNABLE}
       ON CONFLICT(chapter_id,entry_id) DO UPDATE SET mode = excluded.mode`)
      .run(chapterId, entryId, storyId, mode, now(), storyId, entryId).changes > 0;
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
        field,activation,target,content_hash,source,rooms,grp,line,pocket,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uid('pp-'), storyId, p.chapterId ?? null, p.entry_id ?? null, p.title, p.body,
        p.entryType ?? 'lore', JSON.stringify(p.keys ?? []), p.kind, p.delta ?? null,
        // A slot this proposal aims at, or null for the card's own body. Validated here rather
        // than at each caller, so a model inventing "Motivation" cannot reach the column.
        ALL_SLOTS.includes(String(p.field ?? '')) ? String(p.field) : null,
        (ACTIVATIONS as readonly unknown[]).includes(p.activation) ? p.activation : null,
        p.target ?? null,
        hash,
        // Only http(s), and only what was handed in: a proposal's provenance must not become a
        // place for anything the surface would then offer to fetch.
        Array.isArray(p.source) && p.source.length
          ? p.source.filter((u: any) => /^https?:\/\//i.test(String(u))).join('\n') || null
          : null,
        p.rooms && typeof p.rooms === 'object' ? JSON.stringify(p.rooms) : null,
        p.grp ?? null, p.line ?? null, p.pocket ?? null,
        now());
    return true;
  } catch { return false; }   // unique index: already proposed, not an error
}
/** Nothing here is canon. Screen 28: "1 new · 2 changed · 1 conflict · nothing is canon yet."
 *  A conflict is specifically a model proposal against a body a human pinned — the arbitration
 *  rule keys on provenance, so those never auto-apply and never bulk-accept. */
export const proposalsOf = (storyId: string) => q(
  "SELECT * FROM proposals WHERE story_id = ? AND status = 'open' ORDER BY created_at").all(storyId) as any[];
export const proposal = (storyId: string, id: string) =>
  q('SELECT * FROM proposals WHERE id = ? AND story_id = ?').get(id, storyId) as any;
export const setProposalStatus = (storyId: string, id: string, status: string) =>
  q('UPDATE proposals SET status = ? WHERE id = ? AND story_id = ?').run(status, id, storyId);
/** #74 · Anansi's redo of one section of a Workbench card: its text, still chalked. */
export const setProposalBody = (storyId: string, id: string, body: string) =>
  q("UPDATE proposals SET body = ? WHERE id = ? AND story_id = ? AND status = 'open'").run(body, id, storyId).changes > 0;
/** #74 · UNDO A REJECT: a rejected proposal back on the Workbench. Only a reject: one sewn in has
 *  written the tale, and its undo is altering the thread. */
export const reopenProposal = (storyId: string, id: string) =>
  q("UPDATE proposals SET status = 'open' WHERE id = ? AND story_id = ? AND status = 'rejected'").run(id, storyId).changes > 0;

/** MOVE A PROPOSAL — which room it lands in, and the words that wake the card.
 *
 *  Both were read-only on screen until 2026-09-01: a proposal in the wrong room could only be
 *  rejected and the whole thing retyped by hand, which is what Seth hit when the chat kept padding
 *  cards into one place. `field` and `target` are set together on purpose — the room a change would
 *  stand in for is a property of the room CHOSEN, so writing one without the other leaves the
 *  Replace button offering to overwrite a room the proposal no longer points at.
 *
 *  Scoped by story like every other write here. The route validates the slot against the card's
 *  kind before calling: this function cannot know whose card it is. */
export const setProposalWhere = (storyId: string, id: string,
                                 w: { field: string | null; target: string | null; keys: string[];
                                      body: string }) =>
  q('UPDATE proposals SET field = ?, target = ?, keys = ?, body = ? WHERE id = ? AND story_id = ?')
    .run(w.field, w.target, JSON.stringify(w.keys), w.body, id, storyId);

/** HOW FAST EACH MODEL ACTUALLY WRITES, from what it has actually written. #25 asked for a speed
 *  field and `presets.ini` has none; hand-writing one is a number that goes stale the first time a
 *  quant changes and says nothing when it does.
 *
 *  MEDIAN, NOT MEAN. A cold load, a sleeping model waking, and a 500 from an oversubscribed cache
 *  all land in this table as one enormous latency, and three of those drag a mean anywhere. The
 *  median of twenty calls does not move.
 *
 *  Errored and zero-token rows are excluded, and the COUNT rides along with the number: "63 tok/s"
 *  off two calls and off two hundred are different claims and the screen should be able to say
 *  which it is holding. */
export const modelSpeeds = () => {
  // `timings.predicted_per_second` AND NOT completion_tokens/latency_ms. Latency is wall clock for
  // the whole request: waking a sleeping model, processing six thousand tokens of prompt, then
  // generating. Dividing tokens by that reported Artemis at 4.4 tok/s against the 5.8 the server
  // itself measured, and — worse — reported ONE model at two different speeds under its old and
  // new preset names, because the two names hold calls with different prompt sizes. llama.cpp
  // already separates prompt from prediction and this is the number it means by speed.
  const rows = q(`SELECT model, timings FROM generations
                  WHERE model IS NOT NULL AND error IS NULL AND timings IS NOT NULL
                  ORDER BY model`).all() as any[];
  const by = new Map<string, number[]>();
  for (const r of rows) {
    let tps: number | undefined;
    try { tps = JSON.parse(r.timings)?.predicted_per_second; } catch { /* not JSON; skip the row */ }
    if (!Number.isFinite(tps) || (tps as number) <= 0) continue;
    if (!by.has(r.model)) by.set(r.model, []);
    by.get(r.model)!.push(tps as number);
  }
  const out: Record<string, { tps: number; runs: number }> = {};
  for (const [m, xs] of by) {
    xs.sort((a, b) => a - b);
    out[m] = { tps: Math.round(xs[Math.floor(xs.length / 2)]! * 10) / 10, runs: xs.length };
  }
  return out;
};

/** What this writer has actually done. Every number here was already in the database — the
 *  dashboard needed counting, not new bookkeeping. Words are counted in SQL over selected
 *  passages only, so unchosen takes are not credited as writing you did. */
/* SHARED BOOKS ARE NOT COUNTED HERE, and that is a decision rather than an omission. This page is
 * "What you have written"; a book you were called into is mostly somebody else's words, and
 * crediting yourself with all of it would make the one honest number on the page a lie. Counting it
 * properly means counting by PASSAGE AUTHOR rather than by book, which is a different query and a
 * different page — the shelf is where a shared book shows up. */
/** `tzo` is the page's getTimezoneOffset(): minutes, positive WEST of UTC. Days are grouped on the
 *  writer's clock with it, so an evening's writing is not filed under tomorrow. */
export function writerStats(o: string, tzo = 0) {
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
  // WORDS PER DAY AS WELL AS PASSAGES. "Have I written this week" is a words question — a day
  // holding one 900-word passage and a day holding six one-liners are the same bar otherwise, which
  // is a chart that answers the wrong thing.
  const days = q(`SELECT DATE(p.created_at/1000 - ? * 60,'unixepoch') AS d, COUNT(*) AS n,
                         COALESCE(SUM(LENGTH(p.body) - LENGTH(REPLACE(p.body,' ','')) + 1), 0) AS w
                    FROM passages p JOIN stories s ON s.id = p.story_id
                   WHERE s.owner_id = ? AND p.selected = 1 AND p.is_break = 0
                   GROUP BY d ORDER BY d DESC LIMIT 30`).all(tzo, o) as any[];
  // The ledger by kind. One row per kind rather than four counting statements, and the same LIVE
  // filter the `entries` total uses — a tombstone is not a card, and the two counts disagreeing on
  // that would be a shelf that adds up to more than itself.
  const kinds = q(`SELECT e.entry_type AS k, COUNT(*) AS n
                     FROM entries e JOIN stories s ON s.id = e.story_id
                    WHERE s.owner_id = ? AND ${LIVE('e.')}
                    GROUP BY e.entry_type ORDER BY n DESC`).all(o) as any[];
  /* THE MIDDLE CALL, NOT THE MEAN ONE. Total time divided by calls is dragged by a cold model
   * reload and by the one prefill that ran long — F56 quotes medians for exactly that reason. This
   * is the median by LIMIT 1 OFFSET n/2, which SQLite has no function for; failures and rows with
   * no latency are excluded, because a call that died carries no duration to be the middle of.
   * Null when there is nothing to take the middle of, which is a different answer from zero. */
  const timed = `FROM generations g JOIN stories s ON s.id = g.story_id
                 WHERE s.owner_id = ? AND g.error IS NULL AND g.latency_ms IS NOT NULL`;
  const median = (q(`SELECT g.latency_ms AS ms ${timed} ORDER BY g.latency_ms
                      LIMIT 1 OFFSET (SELECT COUNT(*) / 2 ${timed})`).get(o, o) as any)?.ms ?? null;
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
    // Seconds, to one decimal, because the interesting range is 5-80s and whole minutes flatten it.
    medianSeconds: median == null ? null : Math.round(median / 100) / 10,
    kinds,
    days: days.reverse(),
  };
}

/** What the model has actually been doing. PLAN-02 §7.2's budget-engine trigger is stated in
 *  terms of prefill time and prefix churn, and neither is knowable until something reads this. */
export const recentGenerations = (storyId: string, limit = 40) => q(
  `SELECT id, role, model, prompt_tokens, completion_tokens, latency_ms, timings, error, created_at,
          mend
   FROM generations WHERE story_id = ? ORDER BY created_at DESC LIMIT ?`).all(storyId, limit) as any[];

/** #9. What the repair did, written onto the row the generation already has.
 *
 *  A second statement rather than an argument to `logGeneration`, because the log happens BEFORE
 *  the repair — the id has to exist so the take can be tied to it, and a generation that succeeded
 *  must stay logged even if the repair throws. */
/** WHAT A REPAIR DID, on the generation row that paid for it. Issue #9.
 *
 *  Restored 2026-09-01 with the repair button. The counts existed once and were returned to a
 *  browser that ignored them and written nowhere, so for four days nobody could say how often the
 *  repair fired or how often it worked while eighteen contradictions reached the flags table.
 *
 *  A CLEAN RUN RECORDS NOTHING AT ALL, not a zero: this is only called when something WAS wrong,
 *  which is the informative denominator. `mended` is `found - left`, so it goes NEGATIVE when the
 *  second look finds more than the first — 2 of the 12 rows in the live library do, which is the
 *  repair having introduced a contradiction. That is a fact worth keeping, not a number to clamp. */
export const noteMend = (id: string, m: unknown) =>
  q('UPDATE generations SET mend = ? WHERE id = ?').run(JSON.stringify(m), id);

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

// Re-exported so `db.ftsQuery(...)` keeps working: it is the search box's own grammar and the
// tests reach for it through this module, which is the only one anything else imports.
export { ftsQuery } from './search.ts';
