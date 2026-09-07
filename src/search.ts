/* SEARCH — the whole feature, in one file.
 *
 * A VERTICAL SLICE, and the first one cut deliberately. Search used to live in four places inside
 * `db.ts`: its schema at one end, its triggers beside that, its index backfill buried in migrate()
 * two hundred lines earlier, and its query and sanitiser fifteen hundred lines later. Changing how
 * search works meant finding all four. Everything knowable about it is here now.
 *
 * WHAT THIS FILE DOES NOT DO IS TALK TO THE DATABASE. It owns the knowledge — the schema, the
 * triggers, the emptiness probe, the query grammar, the SQL shape — and `db.ts` owns execution: it
 * supplies `q`, `MINE()` and `LIVE()` and runs what is built here.
 *
 * That split is the point, and it is what keeps the slice from costing what slices usually cost.
 * The alternative was exporting `q` (233 uses in db.ts) so this file could run its own SQL, which
 * widens the surface every module can reach, and passing the OWNERSHIP GATE around, which is the
 * one predicate in this app that must have exactly one definition. Neither happens. `MINE()` is
 * handed in as a string by the only module that owns it, so the gate is still written once.
 *
 * The test for whether a future slice is worth cutting is the same: can it own its knowledge
 * without owning the primitives? If it needs `q`, it is not a slice, it is a fragment.
 */

/** The FTS5 schema and its triggers, exec'd by `db.ts` as part of the one schema statement.
 *
 * NO BACKTICKS ANYWHERE IN THIS STRING OR ITS COMMENTS. It is a JS template literal, so one
 * backtick ends it and the file stops parsing — which happened on the first attempt at writing
 * this, and is the trap `.claude/CLAUDE.md` records for the schema block.
 *
 * fts_* AND NOT passages_fts, deliberately. The 2026-08-23 audit dropped a passages_fts that
 * nothing populated and nothing queried, and the teardown that removes it still runs in db.ts. A
 * new table under the old name would be dropped by that teardown on every boot, or -- worse -- an
 * old database still carrying the dead table would satisfy CREATE IF NOT EXISTS and be silently
 * kept with the wrong columns. A different name makes both impossible.
 *
 * WHY THIS EXISTS, and it is not speed. Measured on the live library 2026-09-06: the LIKE scan it
 * replaced answered in 0.5 ms over 1,025 passages and 341 KB of prose. Speed was never the problem.
 * PRECISION was: a LIKE on percent-art-percent matched heart, part and started, so "art" returned
 * 28 hits of which ZERO were the word art, and "ash" returned 11 of which zero were the word ash.
 * And two words could not be searched at all -- "rain water" wanted them adjacent.
 *
 * EXTERNAL CONTENT, so FTS5 stores an index and not a second copy of the prose. A copy can drift
 * from the book; an index cannot disagree about what the text says.
 *
 * THE TRIGGERS ARE THE WHOLE DESIGN. The previous attempt left population to application code and
 * application code forgets: six write paths reach entries alone, plus src/import.ts and a hand-run
 * UPDATE at the sqlite3 prompt, none of which would ever call a refresh function.
 *
 * AND THEY ARE NOT OPTIONAL. Deleting a trigger on purpose to falsify the tests did not produce a
 * wrong result -- it made SQLite raise "database disk image is malformed" on an ordinary passage
 * edit. A drifted external-content index is reported as CORRUPTION, and that message reads like a
 * lost novel when the only stale thing is a derived index. If it ever appears, rebuild before
 * believing anything about the book: everything here is derived from passages, entries and
 * chapters and can be thrown away.
 */
export const SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS fts_passages USING fts5(
  body, content='passages', content_rowid='rowid', tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS fts_passages_ai AFTER INSERT ON passages BEGIN
  INSERT INTO fts_passages(rowid, body) VALUES (new.rowid, new.body);
END;
CREATE TRIGGER IF NOT EXISTS fts_passages_ad AFTER DELETE ON passages BEGIN
  INSERT INTO fts_passages(fts_passages, rowid, body) VALUES ('delete', old.rowid, old.body);
END;
CREATE TRIGGER IF NOT EXISTS fts_passages_au AFTER UPDATE ON passages BEGIN
  INSERT INTO fts_passages(fts_passages, rowid, body) VALUES ('delete', old.rowid, old.body);
  INSERT INTO fts_passages(rowid, body) VALUES (new.rowid, new.body);
END;

-- Two columns, because a card is found by its NAME at least as often as by its description.
CREATE VIRTUAL TABLE IF NOT EXISTS fts_entries USING fts5(
  title, body, content='entries', content_rowid='rowid', tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS fts_entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO fts_entries(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS fts_entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO fts_entries(fts_entries, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS fts_entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO fts_entries(fts_entries, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO fts_entries(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_chapters USING fts5(
  summary, content='chapters', content_rowid='rowid', tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS fts_chapters_ai AFTER INSERT ON chapters BEGIN
  INSERT INTO fts_chapters(rowid, summary) VALUES (new.rowid, new.summary);
END;
CREATE TRIGGER IF NOT EXISTS fts_chapters_ad AFTER DELETE ON chapters BEGIN
  INSERT INTO fts_chapters(fts_chapters, rowid, summary) VALUES ('delete', old.rowid, old.summary);
END;
CREATE TRIGGER IF NOT EXISTS fts_chapters_au AFTER UPDATE ON chapters BEGIN
  INSERT INTO fts_chapters(fts_chapters, rowid, summary) VALUES ('delete', old.rowid, old.summary);
  INSERT INTO fts_chapters(rowid, summary) VALUES (new.rowid, new.summary);
END;
`;

/** Which index is built from which table, and which column decides whether the source has content
 *  worth indexing. One list, so the schema above and the backfill below cannot disagree. */
export const INDEXES = [
  { fts: 'fts_passages', src: 'passages', col: 'body' },
  { fts: 'fts_entries', src: 'entries', col: 'title' },
  { fts: 'fts_chapters', src: 'chapters', col: 'summary' },
] as const;

/** Build any index that is empty, and keep being able to.
 *
 *  This is the step the 2026-08-23 attempt missed: it created the tables and never populated them,
 *  which is worse than having no search, because a search that quietly returns nothing looks like a
 *  book with nothing in it.
 *
 *  THE EMPTINESS PROBE READS THE SHADOW INDEX, NOT THE TABLE, and getting that wrong shipped the
 *  exact failure this function exists to prevent. `SELECT COUNT(*) FROM fts_passages` on an
 *  EXTERNAL-CONTENT table reads the CONTENT table: it answered 1074 against 1074 passages with an
 *  index containing nothing at all, so the rebuild never ran and every query returned zero rows. It
 *  was caught by searching for a word that was definitely in the book and getting nothing back.
 *  `fts_*_idx` is FTS5's b-tree shadow and is genuinely empty until a build — measured 0 before and
 *  66 after, on the live library.
 *
 *  IT HEALS RATHER THAN TRUSTING A MARKER. A version flag on disk covers the first boot and a fresh
 *  database, and misses the case that matters most: an index emptied or corrupted some other way.
 *  Both sides of the question are a COUNT over an index, so asking is cheap; only the answer is
 *  expensive, and only when it is wrong.
 *
 *  Takes its primitives rather than importing them, so this file never opens a database. */
export function ensureIndexes(
  count: (sql: string) => number,
  exec: (sql: string) => void,
  log: (line: string) => void = console.log,
) {
  for (const { fts, src, col } of INDEXES) {
    try {
      const built = count(`SELECT COUNT(*) AS n FROM ${fts}_idx`);
      const rows = count(`SELECT COUNT(*) AS n FROM ${src} WHERE ${col} IS NOT NULL`);
      if (built === 0 && rows > 0) {
        exec(`INSERT INTO ${fts}(${fts}) VALUES ('rebuild')`);
        log(`  search index  ${fts} built from ${rows} rows`);
      }
    } catch (e: any) {
      // Never fatal. A database that cannot index is still a database somebody's novel is in, and
      // search degrading is not a reason to refuse to open the book.
      log(`  could NOT build ${fts}: ${e?.message}`);
    }
  }
}

/** The search box's text, turned into an FTS5 query it cannot be hurt by.
 *
 *  RAW INPUT MUST NEVER REACH `MATCH`. FTS5 has its own grammar — `AND`, `OR`, `NOT`, `NEAR`, `*`,
 *  `^`, parentheses, quotes — so a writer searching for `don't` or `the key)` or a bare `*` gets a
 *  syntax error where they expected results, and one searching `rain OR canal` silently gets an
 *  operator instead of two words. Every token is extracted and re-quoted, so the only thing that
 *  survives from the input is the words.
 *
 *  UNICODE-AWARE (`\p{L}`), because this app has books with names like Solveig and Hao Shen and a
 *  `\w+` split would cut them. Apostrophes stay inside a word so `don't` is one token, which is what
 *  `unicode61` does to the prose on the way in.
 *
 *  THE LAST WORD GETS A PREFIX STAR, and that is a decision rather than a flourish. This replaced a
 *  substring scan where `bras` found `brass` while you were still typing; exact-word-only matching
 *  would return nothing until the word was finished and read as the box being broken. Only the
 *  LAST token, because the earlier ones are words the writer has finished typing.
 *
 *  The contract is therefore "no MID-word matches", not "no partial matches": `ash` reaches `Ashe`
 *  deliberately and must never reach `washed`.
 *
 *  Multiple tokens are implicitly AND in FTS5, which is the other half of what LIKE could not do. */
export const ftsQuery = (term: string): string | null => {
  const words = String(term ?? '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu);
  if (!words?.length) return null;
  return words.map((w, i) => {
    const safe = w.replace(/"/g, '');                    // a quote inside a quoted token ends it
    return i === words.length - 1 ? `"${safe}"*` : `"${safe}"`;
  }).join(' ');
};

// ponytail: three indexes, three bm25 scores, one ORDER BY. bm25 is normalised per index, so a
// prose hit and a card hit are not strictly comparable and the interleaving is approximate. It
// beats the arbitrary first-60 that came before, and the fix if it ever matters is to rank within
// each kind and merge by a fixed quota rather than to invent a cross-index score.
/** The three-way query, as a string. `mine` and `live` are supplied by `db.ts` — this file must not
 *  own the ownership gate, and there must be exactly one definition of it in the app.
 *
 *  THE MATCH IS IN A SUBQUERY, not joined as a table. FTS5 wants `fts MATCH ?` against the fts table
 *  alone; putting it in the outer WHERE beside the ownership predicates lets the planner reorder
 *  them and SQLite then refuses it as an unusable MATCH. The subquery also keeps the ownership gate
 *  exactly where it was — on the outer row — so a hit the writer may not see is filtered by the same
 *  `MINE()` as before, not by anything new.
 *
 *  `storyId` narrows it to one book. Searching inside a story returned hits from every other story
 *  by default, which is the wrong default in the one place you already know where you are — and it
 *  is how "add to the lore book" could put an entry in a different story's ledger. The owner filter
 *  is on EVERY branch regardless: each one needs its own, or a missing one leaks that kind only.
 *  `test/scope.ts` asserts all three. */
export const searchSQL = (mine: string, live: string, scoped: boolean) => {
  const scope = (alias: string) => (scoped ? `AND ${alias}.story_id = ?` : '');
  return `
    SELECT * FROM (
      SELECT 'Prose' AS kind, p.story_id AS story_id, s.title AS story_title,
             'ch ' || c.idx AS loc, p.body AS body, p.id AS id, f.rank AS rank
        FROM (SELECT rowid, bm25(fts_passages) AS rank FROM fts_passages WHERE fts_passages MATCH ?) f
        JOIN passages p ON p.rowid = f.rowid
        JOIN stories s ON s.id = p.story_id JOIN chapters c ON c.id = p.chapter_id
       WHERE ${mine} AND p.selected = 1 ${scope('p')}
      UNION ALL
      SELECT 'Entry', e.story_id, s.title, e.title, e.body, e.id, f.rank
        FROM (SELECT rowid, bm25(fts_entries) AS rank FROM fts_entries WHERE fts_entries MATCH ?) f
        JOIN entries e ON e.rowid = f.rowid
        JOIN stories s ON s.id = e.story_id
       WHERE ${mine} AND ${live} ${scope('e')}
      UNION ALL
      SELECT 'Summary', c.story_id, s.title, 'ch ' || c.idx, c.summary, c.id, f.rank
        FROM (SELECT rowid, bm25(fts_chapters) AS rank FROM fts_chapters WHERE fts_chapters MATCH ?) f
        JOIN chapters c ON c.rowid = f.rowid
        JOIN stories s ON s.id = c.story_id
       WHERE ${mine} AND c.summary IS NOT NULL ${scope('c')}
    ) ORDER BY rank LIMIT 60`;
};

/** The bound values, in the order `searchSQL` asks for them. Kept beside the SQL because the two
 *  must agree and a mismatch is a silent wrong-row bug rather than an error: three MATCH/owner
 *  triples, each optionally followed by the story id. */
export const searchArgs = (match: string, owner: string, storyId?: string) => {
  const args: any[] = [];
  for (let i = 0; i < 3; i++) {          // prose, entries, summaries — MINE names the owner twice
    args.push(match, owner, owner);
    if (storyId) args.push(storyId);
  }
  return args;
};
