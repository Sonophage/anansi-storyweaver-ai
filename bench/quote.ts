// Does the prose quote the ledger, or write from it?
//
//   node --experimental-strip-types bench/quote.ts check      # the detector, no model
//   node --experimental-strip-types bench/quote.ts run [n]    # generate and measure, needs the model
//
// The failure this exists for: an always-on entry whose body reads as finished English is in EVERY
// prompt, so the model reaches for its phrasing when it needs a noun. See F36.
import { quoted, CANON, CASES } from './quote-detect.ts';

if (process.argv[2] === 'check') {
  let bad = 0;
  for (const [text, want, why] of CASES) {
    const got = quoted(text, CANON).runs > 0;
    if (got !== want) { bad++; console.log(`  RED  flagged=${got}, wanted ${want} — ${why}\n       ${JSON.stringify(text.slice(0, 70))}`); }
  }
  console.log(bad ? `\n  ${bad} RED — do not believe a result from this`
                  : `\n  ${CASES.length} cases, all green`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[2] !== 'run') {
  console.log('  usage: quote.ts check | quote.ts run [n]');
  process.exit(0);
}

const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const j = (u: string, b?: unknown, m = 'POST') => fetch(B + u, b
  ? { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }
  : {}).then((r) => r.json() as any);

const { stories } = await j('/api/stories', undefined, 'GET');
const story = stories?.[0];
if (!story) { console.log('  no story to write in'); process.exit(1); }
const v = await j(`/api/story?story=${story.id}`, undefined, 'GET');
// The bodies that actually reach a prompt, not every entry in the ledger.
const canon = (v.entries ?? []).map((e: any) => String(e.body ?? '')).filter(Boolean);
console.log(`  "${story.title}" — ${canon.length} canon bodies in play\n`);

const n = Number(process.argv[3] ?? 3);
let flagged = 0;
for (let i = 0; i < n; i++) {
  const r = await j('/api/generate', { storyId: story.id, mode: 'direct',
    directive: 'She waits by the window while the car idles below.' });
  if (r.error) { console.log(`  ${i + 1}: ${r.error}`); continue; }
  const q = quoted(String(r.prose ?? ''), canon);
  if (q.runs) flagged++;
  console.log(`  ${i + 1}: ${String(r.prose ?? '').length} ch  runs=${q.runs}`
    + (q.longest ? `  longest="${q.longest}"` : ''));
}
console.log(`\n  ${flagged}/${n} passages quoted the ledger`);
