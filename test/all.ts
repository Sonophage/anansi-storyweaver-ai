// Every suite, one command:  node --experimental-strip-types test/all.ts
//
// IN PARALLEL SINCE 2026-08-29 (#28). Seth: "test/all.ts is fucking me over by taking too long to
// get changes done." Nothing about the suites is order-dependent and none of them needs a model:
// each owns its own database under /tmp, and only `scope.ts` binds a port. Running them one at a
// time was costing the length of the slowest eleven times over for no isolation anybody needed.
//
// OUTPUT IS BUFFERED PER SUITE AND PRINTED IN THE ORIGINAL ORDER, so the report reads exactly as it
// did — interleaving eleven suites' lines as they arrive would be faster to produce and unreadable
// to use, and this file's whole job is to be read.
//
// Most changes need one or two suites, and a single suite has always run alone:
//   node --experimental-strip-types test/engine.ts
import { execFile } from 'node:child_process';
import { serialise } from './lock.ts';
// One run on the machine at a time; a second checkout waits its turn. See test/lock.ts.
serialise();
// An entry may carry arguments, so a harness whose self-check lives behind a subcommand can be
// listed here rather than being a check nobody runs. `bench/order.ts` justified a change to
// `src/blocks.ts` ORDER and then went red on the tree that shipped it, because nothing ran it.
//
/* ALL SIXTEEN BENCH CHECKS RUN HERE SINCE 2026-09-06, at Seth's word.
 *
 * This list carried one of them and a note saying the other fifteen were left off because turning
 * them on at once "would surface unknown reds that belong to whoever wrote them". That was the
 * right call while the reds were unknown. They are not any more: all sixteen were run on
 * 2026-09-06, fourteen were already green, and the one that was red — `council06` — was red because
 * its FIXTURE was stale rather than the code, asserting a truncation defect that `QUOTED` in
 * context.ts had since closed. It is now a guard that the hole stays shut.
 *
 * They cost 228 ms wall clock, all of them, because they run in parallel with everything else here.
 * The note's other instruction — one at a time, each with its own commit — is superseded rather than
 * ignored: its purpose was to keep unknown reds from landing on the next person, and running them
 * first is a stronger version of the same care.
 */
const suites = ['engine.ts', 'cards.ts', 'mention.ts', 'speak.ts', 'speakcut.ts', 'db.ts', 'scope.ts', 'import.ts', 'stream.ts', 'memory.ts', 'report.ts', 'talk.ts', 'changes.ts', 'diff.ts', 'forge.ts', 'web.ts', 'app.ts', 'remote.ts', 'keys.ts', 'account.ts', 'weave.ts', 'status.ts', 'shaped.ts', 'away.ts',
                ...['order', 'contractions', 'lockout', 'quote', 'ledger-audit', 'modes', 'drift',
                    'fires', 'retire', 'cast', 'voice', 'utilisation', 'weight',
                    'council06', 'lockout-book', 'weave-json', 'repetition', 'lockout-cheap', 'words', 'preview',
                    // Both green and both run by nobody until 2026-10-29. `stats.ts` runs its
                    // self-check when invoked directly, so it takes no subcommand.
                    'stale', 'reroll-echo', 'reroll-away', 'talk-replay', 'hem-audit', 'hem-ab', 'mention-flip', 'speak', 'modes-read', 'act-react', 'narrate-replay', 'direct-echo', 'scene', 'tidy-foreign'].map((b) => `../bench/${b}.ts check`), '../bench/stats.ts'];
const started = Date.now();

/* EVERY BENCH ENTRY GETS ITS OWN DATABASE, and this is not tidiness.
 *
 * The unit suites above each set `process.env.ANANSI_DB` at the top of their own file, before
 * db.ts is imported. Nothing under bench/ does — those files are written to be run by hand, where
 * pointing at the live library is the POINT.
 *
 * Probed on 2026-09-06 rather than assumed: of the sixteen check modes, fifteen touched no database
 * and `bench/rooms.ts check` opened one (it was retired on 2026-10-28; probed again that day, no
 * listed check opens the ANANSI_DB it is given). Run from here with ANANSI_DB unset it would have opened
 * Seth's live anansi.db READ-WRITE and run migrate() against it, in the middle of a test run,
 * while he might be writing. `bench/order.ts` says the same thing about itself in its own header:
 * "it is a second writer on the book, so do not describe it as harmless."
 *
 * So the guard is on the SPAWN and not on the one file that needs it today. A check added next
 * month that opens a database is covered without anybody remembering this. Under it is a floor in
 * `src/db.ts`: a `check` run with no ANANSI_DB is refused the default library outright. */
const runs = suites.map((s) => new Promise<{ s: string; out: string; ok: boolean; ms: number }>((done) => {
  const t0 = Date.now();
  const bench = s.startsWith('../bench/');
  /* AND NO SUITE EVER REACHES THE REAL FEATHERLESS. This machine has a real key at the default path,
   * so a suite that so much as names a remote id would otherwise spend plan units. A missing key
   * file and a port that refuses at once are the floor; test/remote.ts sets its own fake over it.
   * Hugging Face, which describes catalogue models, gets the same refusing port. */
  const offline = { ANANSI_FEATHERLESS_KEY_FILE: '/nonexistent/featherless.key',
                    ANANSI_FEATHERLESS_URL: 'http://127.0.0.1:9/v1', ANANSI_HF_URL: 'http://127.0.0.1:9' };
  const env = bench
    ? { ...process.env, ...offline, ANANSI_DB: `/tmp/anansi-bench-${s.split('/')[2].split('.')[0]}.db` }
    : { ...process.env, ...offline };
  execFile(process.execPath, ['--experimental-strip-types', ...s.split(' ')],
    { cwd: import.meta.dirname, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env },
    (err, stdout, stderr) => done({ s, out: (stdout ?? '') + (stderr ?? ''), ok: !err, ms: Date.now() - t0 }));
}));

// NAME THE ONES THAT FAILED. The summary counted them and stopped there, so a run whose tail read
// "1 suite(s) FAILED" gave no way to tell which — and the eleven suites each pass when run alone,
// which is exactly the shape of failure where the name is the whole of the information. Twice on
// 2026-08-29 this cost a diagnosis; the output was above, but nothing pointed at it.
const bad: string[] = [];
// EACH HEADER CARRIES ITS SUITE'S OWN WALL TIME. The total alone said the run took 45 s and not
// which suite took them; one suite was 44 of the 45, and finding that took a hand-timed loop.
for (const r of await Promise.all(runs)) {
  const t = `${(r.ms / 1000).toFixed(1)}s`;
  process.stdout.write(`\n── ${r.s} ${'─'.repeat(Math.max(1, 46 - r.s.length - t.length - 1))} ${t}\n`);
  process.stdout.write(r.out);
  if (!r.ok) bad.push(r.s);
}
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(bad.length ? `\n${bad.length} suite(s) FAILED: ${bad.join(', ')}  ·  ${secs}s`
                       : `\nall suites passed  ·  ${secs}s`);
// exitCode, NOT exit(). `process.exit()` ends the process before stdout has drained into a pipe,
// so `test/all.ts | tail -2` lost the very line above: it showed a suite's last check and no
// verdict. Setting the code lets node finish writing and then exit with it.
process.exitCode = bad.length ? 1 : 0;
