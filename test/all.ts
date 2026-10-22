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
 * They cost 228 ms wall clock, all sixteen, because they run in parallel with everything else here.
 * The note's other instruction — one at a time, each with its own commit — is superseded rather than
 * ignored: its purpose was to keep unknown reds from landing on the next person, and running them
 * first is a stronger version of the same care.
 */
const suites = ['engine.ts', 'db.ts', 'scope.ts', 'import.ts', 'stream.ts', 'check.ts', 'memory.ts', 'report.ts', 'talk.ts', 'forge.ts', 'web.ts', 'app.ts', 'remote.ts',
                ...['order', 'contractions', 'lockout', 'quote', 'ledger-audit', 'modes', 'drift',
                    'rooms', 'fires', 'retire', 'reroll', 'cast', 'voice', 'utilisation', 'weight',
                    'council06', 'lockout-book'].map((b) => `../bench/${b}.ts check`)];
const started = Date.now();

/* EVERY BENCH ENTRY GETS ITS OWN DATABASE, and this is not tidiness.
 *
 * The twelve suites above each set `process.env.ANANSI_DB` at the top of their own file, before
 * db.ts is imported. Nothing under bench/ does — those files are written to be run by hand, where
 * pointing at the live library is the POINT.
 *
 * Probed on 2026-09-06 rather than assumed: of the sixteen check modes, fifteen touch no database
 * and `bench/rooms.ts check` opens one. Run from here with ANANSI_DB unset it would have opened
 * Seth's live anansi.db READ-WRITE and run migrate() against it, in the middle of a test run,
 * while he might be writing. `bench/order.ts` says the same thing about itself in its own header:
 * "it is a second writer on the book, so do not describe it as harmless."
 *
 * So the guard is on the SPAWN and not on the one file that needs it today. A check added next
 * month that opens a database is covered without anybody remembering this. */
const runs = suites.map((s) => new Promise<{ s: string; out: string; ok: boolean }>((done) => {
  const bench = s.startsWith('../bench/');
  const env = bench
    ? { ...process.env, ANANSI_DB: `/tmp/anansi-bench-${s.split('/')[2].split('.')[0]}.db` }
    : process.env;
  execFile(process.execPath, ['--experimental-strip-types', ...s.split(' ')],
    { cwd: import.meta.dirname, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env },
    (err, stdout, stderr) => done({ s, out: (stdout ?? '') + (stderr ?? ''), ok: !err }));
}));

// NAME THE ONES THAT FAILED. The summary counted them and stopped there, so a run whose tail read
// "1 suite(s) FAILED" gave no way to tell which — and the eleven suites each pass when run alone,
// which is exactly the shape of failure where the name is the whole of the information. Twice on
// 2026-08-29 this cost a diagnosis; the output was above, but nothing pointed at it.
const bad: string[] = [];
for (const r of await Promise.all(runs)) {
  process.stdout.write(`\n── ${r.s} ${'─'.repeat(46 - r.s.length)}\n`);
  process.stdout.write(r.out);
  if (!r.ok) bad.push(r.s);
}
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(bad.length ? `\n${bad.length} suite(s) FAILED: ${bad.join(', ')}  ·  ${secs}s`
                       : `\nall suites passed  ·  ${secs}s`);
process.exit(bad.length ? 1 : 0);
