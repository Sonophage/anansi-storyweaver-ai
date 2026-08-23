// The one-promise check, headless. Drives the running server rather than re-wiring the
// engine, which is what it used to do — same assertions, a third of the lines.
//   node --experimental-strip-types serve.ts &
//   node --experimental-strip-types run.ts
const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const j = (u: string, b?: unknown) => fetch(B + u, b ? { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {})
  .then((r) => r.json() as any);

const { stories, model } = await j('/api/stories');
const story = stories.find((s: any) => s.title === 'The Silver Key') ?? stories[0];
if (!story) { console.error('no stories in the library'); process.exit(1); }

console.log(`model  ${model}\nstory  ${story.title}\n`);
const r = await j('/api/generate', { storyId: story.id, mode: 'direct',
  directive: "Marek's man makes it clear the debt is due tonight, and Aldis reaches into his coat." });
if (r.error) { console.error('FAILED:', r.error); process.exit(1); }

const m = r.manifest;
for (const b of m.blocks) console.log(`  ${b.state === 'included' ? ' ' : 'x'} ${b.kind.padEnd(16)}` +
  `${String(b.tokens).padStart(5)}  ${b.id}${b.firedBy ? '  <- ' + b.firedBy.join(',') : ''}`);
console.log(`\n${m.totals.used} / ${m.totals.budget} tokens · ${r.seconds}s\n`);
console.log('-'.repeat(72)); console.log(r.prose); console.log('-'.repeat(72), '\n');

// Everything checked here is checked against NARRATION, not dialogue. A character may
// lie, be wrong, speak in first person, or call a thing by the wrong name — none of that
// is the narrator contradicting canon. Three checks in this file have been wrong about
// that already ("the Iron Bridge" as a place name, a keyword naming another character,
// and `"I have until dusk," Aldis said.` read as a POV break).
const narration = r.prose.replace(/["“][^"”]*["”]/g, ' ');
const out = narration.toLowerCase();
const near = (word: string) => narration.split(/(?<=[.!?])\s+/)
  .some((s: string) => /\bkey\b/i.test(s) && new RegExp(`\\b${word}\\b`, 'i').test(s));
const checks: [string, boolean][] = [
  ['prose is non-trivial',          r.prose.length > 200],
  ['a triggered entry reached it',  m.blocks.some((b: any) => b.kind === 'CANON-TRIGGERED' && b.state === 'included')],
  ['the key is not called silver',  !/silver key|key of silver/.test(out)],
  ['nor iron, nor steel',           !near('iron') && !near('steel')],
  ['nor warm',                      !near('warm')],
  ['no reasoning leaked',           !/<\/?think>|thinking process/i.test(r.prose)],
  ['canon not restated verbatim',   !/(brass, not silver|ex-watch sergeant)/i.test(narration)],
  ['third person past in narration', !/\bI \b|\bI'd\b|\bmy \b/i.test(narration)],
];
let bad = 0;
for (const [n, ok] of checks) { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}`); }
process.exit(bad ? 1 : 0);
