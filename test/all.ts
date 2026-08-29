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
const suites = ['engine.ts', 'db.ts', 'scope.ts', 'import.ts', 'stream.ts', 'mend.ts', 'memory.ts', 'report.ts', 'talk.ts', 'web.ts', 'app.ts'];
const started = Date.now();

const runs = suites.map((s) => new Promise<{ s: string; out: string; ok: boolean }>((done) => {
  execFile(process.execPath, ['--experimental-strip-types', s],
    { cwd: import.meta.dirname, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
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
