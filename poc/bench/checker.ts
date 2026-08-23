// How good is the canon checker? A labelled fixture, precision and recall.
//
// This is the golden-fixture eval SPEC §15 gap 1 asked for: "roughly fifteen tuned constants
// are guesses that happen to be written down". Now at least the checker's own accuracy is
// measured rather than inherited from a published frontier-model figure.
//
//   node --experimental-strip-types poc/bench/checker.ts
const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const j = (u: string, b?: unknown, m = 'POST') => fetch(B + u, b ? { method: m,
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {})
  .then((r) => r.json() as any);

// Canon in the fixture: the key is brass not silver and cold even in summer; Aldis has a
// limp in the left knee and owes Marek eleven crowns; Marek is never seen out in the rain.
const CASES: { label: string; body: string; contradicts: boolean }[] = [
  { contradicts: true,  label: 'key called silver in narration',
    body: 'He drew out the key. Solid silver, and it caught what light there was.' },
  { contradicts: true,  label: 'key called warm',
    body: 'The key was warm in his fist, warm as a held coin, and he did not like it.' },
  { contradicts: true,  label: 'no limp',
    body: 'He took the stairs three at a time, both knees sound beneath him, and did not slow.' },
  { contradicts: true,  label: 'Marek out in the rain',
    body: 'Marek stood in the open yard with the rain running off his hat, counting on his fingers.' },
  { contradicts: true,  label: 'wrong debt',
    body: 'Two crowns. That was the whole of it, and he had two crowns in his coat already.' },
  { contradicts: false, label: 'clean, consistent',
    body: 'He drew out the key. The brass was cold against his palm. He went down slowly, favouring the left knee.' },
  { contradicts: false, label: 'mere omission',
    body: 'Rain moved across the rooftops in sheets. A shutter came loose and knocked against its frame.' },
  { contradicts: false, label: 'a character lies about canon',
    body: '"It is solid silver," Aldis said, and watched the man\'s eyes. A lie costs nothing on a staircase.' },
  { contradicts: false, label: 'a character is simply wrong',
    body: '"Marek never leaves that room," the boy said, though he had no way of knowing what Marek did.' },
  { contradicts: false, label: 'figurative language',
    body: 'The debt was a stone in his shoe. It had a weight and a temperature and it never once let him forget it.' },
  { contradicts: false, label: 'hope, not fact',
    body: 'Maybe the vault had flooded. Maybe the whole ledger had gone soft and unreadable in the water.' },
  { contradicts: false, label: 'new detail canon does not cover',
    body: 'The stair smelled of tallow and wet stone. Someone had chalked a number on the third landing.' },
];

const sid = (await j('/api/stories', undefined, 'GET')).stories[0].id;
let tp = 0, fp = 0, tn = 0, fn = 0;
for (const c of CASES) {
  const pid = (await j('/api/write', { storyId: sid, body: c.body })).passages.at(-1).id;
  const r = await j('/api/check', { storyId: sid, passageId: pid });
  const flagged = !r.error && (r.found ?? 0) > 0;
  if (c.contradicts && flagged) tp++;
  else if (c.contradicts) fn++;
  else if (flagged) fp++;
  else tn++;
  const mark = c.contradicts === flagged ? ' ok ' : 'MISS';
  const detail = flagged ? (r.violations ?? []).filter((v: any) => v.passageId === pid)
    .map((v: any) => `${v.quote?.slice(0, 34)} (${v.confidence})`).join('; ') : '';
  console.log(`  ${mark} ${c.contradicts ? 'contradicts' : 'clean      '} · ${c.label.padEnd(34)} ${detail}`);
  await j('/api/passage', { storyId: sid, id: pid }, 'DELETE');
}
const prec = tp / (tp + fp || 1), rec = tp / (tp + fn || 1);
console.log(`\n  caught ${tp}/${tp + fn} real contradictions   (recall    ${(rec * 100).toFixed(0)}%)`);
console.log(`  ${fp} false alarms on ${fp + tn} clean passages (precision ${(prec * 100).toFixed(0)}%)`);
console.log(`  F1 ${(2 * prec * rec / (prec + rec || 1)).toFixed(2)}`);
