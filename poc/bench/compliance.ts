// How often does the model contradict canon it was given? This is the one promise,
// measured. The classifier lives in verdict.ts so this and ab.ts cannot drift apart.
import { FIXTURE, DIRECTIVE, verdict } from './verdict.ts';

const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const N = Number(process.argv[2] ?? 10);
const j = (u: string, b?: unknown) => fetch(B + u, b ? { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any);

const { stories } = await j('/api/stories');
const story = stories.find((s: any) => s.title === FIXTURE) ?? stories[0];
// Two denominators. The overall rate counts every generation, and most passages never
// mention the key at all — so a title-vs-canon failure is diluted by trials that could
// never have shown one, which is why F10's n=20 could not decide anything.
// The targeted rate counts only passages whose NARRATION actually names the key.
const tally: Record<string, number> = {};
let clean = 0, n = 0, mentioned = 0, mentionedBad = 0;

for (let i = 0; i < N; i++) {
  const r = await j('/api/generate', { storyId: story.id, mode: 'direct', directive: DIRECTIVE });
  if (r.error) { console.log(`  ${i + 1}: ${r.error}`); continue; }
  n++;
  const { bad, mentioned: named } = verdict(r.prose);
  if (bad.length === 0) clean++;
  if (named) { mentioned++; if (bad.length) mentionedBad++; }
  for (const b of bad) tally[b] = (tally[b] ?? 0) + 1;
  process.stdout.write(bad.length ? `  ${i + 1}: ${bad.join('; ')}\n` : `  ${i + 1}: clean\n`);
}
console.log(`\n${clean}/${n} passages contradicted nothing (${(clean / n * 100).toFixed(0)}%)`);
console.log(`  of the ${mentioned} that actually named the key, ${mentioned - mentionedBad} were clean` +
  (mentioned ? ` (${((mentioned - mentionedBad) / mentioned * 100).toFixed(0)}%)` : ''));
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(v).padStart(2)}× ${k}`);
