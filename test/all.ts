// Every suite, one command:  node --experimental-strip-types test/all.ts
import { execFileSync } from 'node:child_process';
const suites = ['engine.ts', 'db.ts', 'scope.ts', 'import.ts', 'web.ts', 'app.ts'];
let bad = 0;
for (const s of suites) {
  process.stdout.write(`\n── ${s} ${'─'.repeat(46 - s.length)}\n`);
  try {
    process.stdout.write(execFileSync(process.execPath, ['--experimental-strip-types', s],
      { cwd: import.meta.dirname, encoding: 'utf8' }));
  } catch (e: any) { bad++; process.stdout.write((e.stdout ?? '') + (e.stderr ?? '')); }
}
console.log(bad ? `\n${bad} suite(s) FAILED` : '\nall suites passed');
process.exit(bad ? 1 : 0);
