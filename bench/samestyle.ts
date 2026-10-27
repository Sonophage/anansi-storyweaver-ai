// Compare two ANANSI_STYLES dumps from test/ui/shots.js: every surface, element by element, box
// and property. Moving inline styles into classes must report 0 differing elements.
//
//   ANANSI_STYLES=/tmp/before bash test/ui/run.sh shots     # on the code before
//   ANANSI_STYLES=/tmp/after  bash test/ui/run.sh shots     # on the code after
//   node --experimental-strip-types bench/samestyle.ts /tmp/before /tmp/after
//
// Validated 2026-10-27: two runs of one tree differ in 0 elements of 120 surfaces; one gap changed
// by a pixel differs in 195. It sees only the surfaces shots.js visits.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const [a, b] = process.argv.slice(2);
const shots = readFileSync(new URL('../test/ui/shots.js', import.meta.url), 'utf8');
const names = ['tag', 'x', 'y', 'w', 'h', ...JSON.parse(shots.match(/const LONGHANDS = (\[[\s\S]*?\]);/)![1].replace(/'/g, '"'))];
let files = 0, diffs = 0;
for (const f of readdirSync(a).filter((x) => x.endsWith('.json')).sort()) {
  files++;
  if (!existsSync(`${b}/${f}`)) { console.log('MISSING', f); diffs++; continue; }
  const A = JSON.parse(readFileSync(`${a}/${f}`, 'utf8')), B = JSON.parse(readFileSync(`${b}/${f}`, 'utf8'));
  if (A.length !== B.length) { console.log(f, `element count ${A.length} vs ${B.length}`); diffs++; continue; }
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) {
    const x = A[i].split('|'), y = B[i].split('|');
    const what = x.map((v, k) => v !== y[k] ? `${names[k]}: ${v} -> ${y[k]}` : '').filter(Boolean);
    if (diffs < 60) console.log(f, '#' + i, x[0], what.join('; '));
    diffs++;
  }
}
console.log(`${files} surfaces, ${diffs} differing elements`);
