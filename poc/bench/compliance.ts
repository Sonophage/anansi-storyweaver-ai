// How often does the model contradict canon it was given? This is the one promise,
// measured. Every check runs against NARRATION only — dialogue may lie.
const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const N = Number(process.argv[2] ?? 10);
const j = (u: string, b?: unknown) => fetch(B + u, b ? { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any);

const { stories } = await j('/api/stories');
const story = stories.find((s: any) => s.title === 'The Silver Key') ?? stories[0];
const tally: Record<string, number> = {};
let clean = 0, n = 0;

for (let i = 0; i < N; i++) {
  const r = await j('/api/generate', { storyId: story.id, mode: 'direct',
    directive: "Marek's man makes it clear the debt is due tonight, and Aldis reaches into his coat." });
  if (r.error) { console.log(`  ${i + 1}: ${r.error}`); continue; }
  n++;
  const narr = r.prose.replace(/["“][^"”]*["”]/g, ' ');
  const near = (w: string) => narr.split(/(?<=[.!?])\s+/)
    .some((s: string) => /\bkey\b/i.test(s) && new RegExp(`\\b${w}\\b`, 'i').test(s));
  const bad: string[] = [];
  if (/silver key|key of silver/i.test(narr)) bad.push('called the key silver');
  if (near('iron') || near('steel')) bad.push('called the key iron or steel');
  if (near('warm') || near('hot')) bad.push('called the key warm');
  if (/(brass, not silver|ex-watch sergeant|eleven crowns owed)/i.test(narr)) bad.push('restated canon verbatim');
  if (/\bI \b|\bmy \b/i.test(narr)) bad.push('broke third person');
  if (bad.length === 0) clean++;
  for (const b of bad) tally[b] = (tally[b] ?? 0) + 1;
  process.stdout.write(bad.length ? `  ${i + 1}: ${bad.join('; ')}\n` : `  ${i + 1}: clean\n`);
}
console.log(`\n${clean}/${n} passages contradicted nothing (${(clean / n * 100).toFixed(0)}%)`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(v).padStart(2)}× ${k}`);
