/* What is TRUE right now, derived. Nothing in this file is typed by hand.
 *
 *   node --experimental-strip-types status.ts
 *
 * WHY THIS EXISTS. This project's own finding, from its sixth audit pass: "every count that is
 * DERIVED has stayed true, and every count that is TRANSCRIBED has drifted." That was written about
 * numbers and it is true of claims. On 2026-09-06 five separate statements in the documentation were
 * wrong in the same direction -- eviction called missing four days after it was built, a shipped
 * prompt flag called off, 66 routes when there were 98, two columns called present on disk when they
 * were gone, a backup directory called empty when it held 823 files. Every one had been read out of
 * a document instead of run.
 *
 * So: a document that wants a number carries the command. This IS the command.
 *
 * READ-ONLY, AND `test/status.ts` HOLDS IT THERE (#65). It opens the library with its own read-only
 * connection and never through `src/db.ts`, because db.ts opens the file read-write at module load
 * and runs migrate(), which runs `repairStrandedChapters()`. That is how a status run on 2026-10-18
 * 00:11 opened Chapter 7 of a book in the live library. db.ts is still imported, against an
 * in-memory database, for the two things only it knows: the schema the code would build, and the
 * stories-per-owner query. If the file's schema is older than the code, this says so and does not
 * migrate it; starting the server does that. It makes no model call, binds no port, and writes
 * nothing. Point ANANSI_DB elsewhere to ask about a different database.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('.', import.meta.url).pathname;
const sh = (cmd: string) => { try { return execFileSync('sh', ['-c', cmd], { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };
const n = (cmd: string) => Number(sh(cmd) || 0);
const row = (k: string, v: unknown) => console.log(`  ${k.padEnd(26)}${v}`);

console.log('\n  ANANSI — derived status, nothing transcribed\n');

// ---- the tree ----
row('commit', sh('git log -1 --format="%h  %cd  %s" --date=short') || '(not a git tree)');
row('working tree', sh('git status --porcelain | wc -l') === '0' ? 'clean' : `${sh('git status --porcelain | wc -l')} files modified`);
row('routes', n(`grep -oE "'(GET|POST|PUT|DELETE|PATCH) /[^']*'" src/routes.ts | sort -u | wc -l`));
row('debt markers', n('grep -rn "ponytail:" src web bench test *.ts *.html | wc -l'));
row('findings', n("grep -c '^## F' docs/findings/P0-FINDINGS.md"));
row('source lines', n('cat src/*.ts serve.ts run.ts | wc -l') + ' src, '
  + n('cat web/*.js app.html | wc -l') + ' web, '
  + n('cat test/*.ts test/ui/*.js bench/*.ts | wc -l') + ' test/bench');
row('dependencies', existsSync(root + 'package.json') ? 'A package.json EXISTS — the project has none by design' : 'none, and no build step');

// ---- the database ----
console.log('');
const FILE = process.env.ANANSI_DB ?? root + 'anansi.db';
let lib: DatabaseSync | null = null;
let code: any = null;
const was = process.env.ANANSI_DB;
try {
  lib = new DatabaseSync(FILE, { readOnly: true });
  // THE CODE'S SCHEMA, built where it can do no harm: db.ts reads ANANSI_DB when it loads, so it is
  // pointed at memory for the import and given back after.
  process.env.ANANSI_DB = ':memory:';
  code = await import('./src/db.ts');
} catch (e: any) { row('database', `could not open: ${e?.message}`); }
finally { if (was === undefined) delete process.env.ANANSI_DB; else process.env.ANANSI_DB = was; }
if (lib && code) {
  const all = (c: DatabaseSync, sql: string) => c.prepare(sql).all() as any[];
  const count = (sql: string) => { try { return String((lib!.prepare(sql).get() as any).n); } catch { return ''; } };
  row('database file', FILE);
  /* THE SCHEMA, compared and never repaired. Every table and column the code builds, against the
   * file. Migrating here would be the write this file exists not to make, so a file that is behind
   * is reported, and the server's own boot migrates it.
   * ponytail: tables and columns only, not indexes or triggers; compare sqlite_master.sql too if a
   * migration ever changes only an index. */
  const cols = (c: DatabaseSync) => new Set(all(c, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .flatMap((t) => [t.name, ...all(c, `PRAGMA table_info("${t.name}")`).map((k) => `${t.name}.${k.name}`)]));
  const want = cols(code.db), have = cols(lib);
  const missing = [...want].filter((k) => !have.has(k)), extra = [...have].filter((k) => !want.has(k));
  if (missing.length || extra.length)
    row('schema', `OLDER THAN THE CODE, not migrated by status · ${[...missing.map((k) => `missing ${k}`), ...extra.map((k) => `still has ${k}`)].join(', ')} · start the server once to migrate it`);
  try {
    const stories = all(lib, code.STORIES_PER_OWNER);
    row('library', `${stories.reduce((a, s) => a + s.n, 0)} stories · ${stories.map((s) => `${s.login} ${s.n}`).join(', ')}`);
  } catch (e: any) { row('library', `could not count: ${e?.message}`); }
  // Tables and columns come from the file itself, never from the CREATE statements in db.ts --
  // SQLite has no implicit drop, so the source and the disk can disagree and have.
  /* THE SHADOW TABLES ARE NOT TABLES, and the first version of this line counted them. It answered
   * 38 against a schema of 23, because each FTS5 virtual table brings four shadow tables of its own
   * (_data, _idx, _docsize, _config). A status line that inflates by 65% the day search shipped is
   * the same disease this file exists to cure, so it is split rather than filtered quietly. */
  const real = count("select count(*) n from sqlite_master where type='table' and name not like 'sqlite_%' and name not like 'fts_%';");
  const idx = count("select count(*) n from sqlite_master where type='table' and name like 'fts_%' and sql like 'CREATE VIRTUAL%';");
  row('tables on disk', `${real}${idx ? `  (+ ${idx} search indexes and their shadows)` : ''}`);

  /* THE SEARCH INDEX, and it is asked the way that actually works. COUNT(*) on an external-content
   * FTS5 table reads the CONTENT table, so it answers "full" on a completely empty index -- which is
   * exactly how the first cut of the search feature shipped returning nothing for every query. The
   * b-tree shadow is empty until the index is built; that is the honest question. */
  for (const [fts, src] of [['fts_passages', 'passages'], ['fts_entries', 'entries'], ['fts_chapters', 'chapters']]) {
    const idx = count(`select count(*) n from ${fts}_idx;`);
    const rows = count(`select count(*) n from ${src};`);
    row(`search index ${src}`, idx === '' ? 'no such index' : Number(idx) > 0 ? `built (${rows} rows indexed)` : `EMPTY — search returns nothing for ${rows} rows`);
  }
  lib.close();
}

/* ---- WHAT THE MODEL IS ACTUALLY BEING TOLD ----
 *
 * Read from the RUNNING PROCESS, not from .env and not from the source defaults. Those three can
 * disagree and the only one that decides what reaches the model is the process. On 2026-09-06 the
 * build-state document said a prompt flag was off; it had shipped ON five days earlier, and the way
 * that was settled was reading /proc, then asking the live server for a real prompt. */
console.log('');
const pid = sh('systemctl --user show anansi.service -p MainPID --value');
if (pid && pid !== '0' && existsSync(`/proc/${pid}/environ`)) {
  const env = readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter((s) => s.startsWith('ANANSI_'));
  const get = (k: string) => env.find((e) => e.startsWith(k + '='))?.slice(k.length + 1);
  row('server', `pid ${pid}, up since ${sh(`ps -o lstart= -p ${pid}`)}`);
  row('prompt flags', [
    `prose-author ${get('ANANSI_PROSE_AUTHOR') === '0' ? 'OFF' : 'ON'}`,
    `lockout-named ${get('ANANSI_LOCKOUT_NAMED') === '1' ? 'ON' : 'off'}`,
    `lockout-clause ${get('ANANSI_LOCKOUT_CLAUSE') === '1' ? 'ON' : 'off'}`,
    `lockout-noun ${get('ANANSI_LOCKOUT_NOUN') === '1' ? 'ON' : 'off'}`,
  ].join(' · '));
  row('writers allowed', (get('ANANSI_ALLOW') ?? '(unset — loopback only)').split(',').length + ' in ANANSI_ALLOW');
} else {
  row('server', 'not running under systemd --user, so no live flags to read');
}

// ---- backups, which are only real if they are recent ----
console.log('');
for (const [label, dir, keep] of [['near backups', root + 'backups', 12],
                                  ['off-disk backups', process.env.ANANSI_BACKUP_DIR ?? '/data/anansi/backups', 14],
                                  ['book exports', process.env.ANANSI_EXPORT_DIR ?? '/data/anansi/books', 0]] as const) {
  if (!existsSync(dir)) { row(label, `${dir} — does not exist`); continue; }
  const fs = readdirSync(dir).filter((f) => f.endsWith('.db'));
  if (!fs.length) { row(label, `${dir} — EMPTY`); continue; }
  const newest = fs.map((f) => statSync(`${dir}/${f}`).mtimeMs).sort((a, b) => b - a)[0];
  const hrs = ((Date.now() - newest) / 3_600_000).toFixed(1);
  const mb = (fs.reduce((a, f) => a + statSync(`${dir}/${f}`).size, 0) / 1048576).toFixed(0);
  /* THE ROTATION APPLIES ONLY TO WHAT THE SCHEDULER WROTE, so "39 files, keeping 12" is not the
   * contradiction it reads as: `backup()` prunes by PREFIX and leaves hand-made snapshots alone,
   * deliberately, after twelve of them once filled every keep-slot and the real backups were eaten.
   * Counting them separately says that out loud instead of making the reader work it out. */
  const auto = fs.filter((f) => /^anansi-\d{4}-/.test(f)).length;
  const held = fs.length - auto;
  row(label, `${fs.length} files, ${mb} MB, newest ${hrs}h ago`
    + (keep ? ` · ${auto} rotating (keep ${keep})${held ? `, ${held} kept by hand` : ''}` : ''));
}

console.log('\n  Run the checks:  node --experimental-strip-types test/all.ts   ·   bash test/ui/run.sh\n');
