// Does the model notice a new place and a new person and propose them for the ledger?
// Objective: the fixture chapter introduces the Long Market, the Sallow Gate and Ismene Faal,
// and none of them are canon. Proposals are cleared between runs, because they accumulate and
// a second run would otherwise score the first run's work.
import { readFileSync, appendFileSync } from 'node:fs';
process.env.ANANSI_DB = process.env.ANANSI_DB ?? '/tmp/anansi-quality.db';
const db = await import('../src/db.ts');

const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5178';
const N = Number(process.argv[2] ?? 10);
const story = JSON.parse(readFileSync('/tmp/quality-stories.json', 'utf8')).extraction;
const TARGETS = [['Long Market', /long market/i], ['Sallow Gate', /sallow gate/i],
                 ['Ismene Faal', /ismene|faal/i]] as const;

const hit: Record<string, number> = { 'Long Market': 0, 'Sallow Gate': 0, 'Ismene Faal': 0 };
let runs = 0, noise = 0, errors = 0;

for (let i = 0; i < N; i++) {
  db.db.prepare('DELETE FROM proposals WHERE story_id = ?').run(story);
  const r = await fetch(`${B}/api/extract`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId: story }) })
    .then((x) => x.json() as any);
  if (r.error) { errors++; appendFileSync('/tmp/anansi-ab/extraction.jsonl', JSON.stringify({ i, error: r.error }) + '\n'); continue; }
  runs++;
  const titles = (r.proposals ?? []).map((p: any) => `${p.title} :: ${p.body}`);
  for (const [name, re] of TARGETS) if (titles.some((t: string) => re.test(t))) hit[name]++;
  // Anything proposed that matches none of the three is either a real fourth fact or padding.
  noise += titles.filter((t: string) => !TARGETS.some(([, re]) => re.test(t))).length;
  appendFileSync('/tmp/anansi-ab/extraction.jsonl',
    JSON.stringify({ i, added: r.added, titles: (r.proposals ?? []).map((p: any) => p.title) }) + '\n');
}

console.log(`\n  ${runs} extractions (${errors} failed)`);
for (const [name] of TARGETS)
  console.log(`    ${String(hit[name]).padStart(2)}/${runs}  proposed ${name}`);
console.log(`    ${(noise / (runs || 1)).toFixed(1)} other proposals per run (real fourth facts, or padding)`);
