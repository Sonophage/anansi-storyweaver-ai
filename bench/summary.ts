// F18, the summary half. Two prompts against the same chapters in one run, so the comparison is
// controlled — nothing here sets a seed, and arms measured minutes apart are not.
//
// The defect is not only length. The shipped prompt says "State facts flat" and returned
// "This action confirms his intent to leave permanently or for a significant duration" — the
// model explaining the chapter rather than recording it. EARLIER carries that into every later
// call, so an analytical summary is worse than a long one.
//
//   node --experimental-strip-types bench/summary.ts [runs-per-chapter]
import { chat } from '../src/llama.ts';
import * as db from '../src/db.ts';

const N = Number(process.argv[2] ?? 1);

// The shipped wording, and the candidate. One line differs plus the length ask.
const OLD = (w: number) =>
`Summarize this chapter for a story bible. ${w} words.

Record only what a later chapter must know: what changed, who decided what, what is now
true that was not before, and anything a reader would notice if it were contradicted.

Omit atmosphere and description. Present tense. State facts flat. No hedging.
Output the summary and nothing else.`;

const NEW = (w: number) =>
`Summarize this chapter for a story bible. Under ${w} words.

Record only what a later chapter must know: what changed, who decided what, what is now
true that was not before, and anything a reader would notice if it were contradicted.

Write what happened, not what it means. Do not interpret, explain, or say what something
indicates, suggests, confirms, establishes or implies. No sentence may begin with "This".
Omit atmosphere and description. Present tense. State facts flat. No hedging.
Output the summary and nothing else.`;

// The vocabulary of a model explaining rather than recording. Counted on the summary itself.
const TELLS = /\b(indicat\w+|suggest\w+|confirm\w+|establish\w+|impl\w+|signif\w+|demonstrat\w+|reveal\w+ that|this (action|chapter|scene|passage)|which (means|implies)|reinforc\w+|underscor\w+)\b/gi;

const owner = db.owner(process.env.ANANSI_USER ?? 'sonophage');
const story = db.listStories(owner).find((s: any) => s.title === 'The Silver Key') ?? db.listStories(owner)[0];
if (!story) { console.log('  no story to summarise'); process.exit(1); }

const chapters = db.chapters(story.id)
  .map((c: any) => ({ c, ps: db.passagesOfChapter(c.id).filter((p: any) => !p.is_break && p.body.trim()) }))
  .filter((x: any) => x.ps.length);

console.log(`  ${story.title}: ${chapters.length} chapters with prose, ${N} run(s) each\n`);

const rows: any[] = [];
for (const { c, ps } of chapters) {
  const input = ps.map((p: any) => p.body).join('\n\n');
  for (let i = 0; i < N; i++) {
    for (const [arm, prompt, maxTokens] of [['shipped', OLD(180), 400], ['candidate', NEW(180), 280]] as const) {
      const r = await chat(prompt, input,
        { temperature: 0.2, max_tokens: maxTokens, chat_template_kwargs: { enable_thinking: false } });
      const text = r.prose.trim();
      const words = (text.match(/\S+/g) ?? []).length;
      const tells = [...text.matchAll(TELLS)].map((m) => m[0].toLowerCase());
      rows.push({ arm, chapter: c.idx, chars: text.length, words, tells: tells.length, text });
      console.log(`  ch${c.idx} ${arm.padEnd(9)} ${String(text.length).padStart(5)} chars  ${
        String(words).padStart(4)} words  ${String(tells.length).padStart(2)} tells${
        tells.length ? `  (${[...new Set(tells)].slice(0, 4).join(', ')})` : ''}`);
    }
  }
}

const sum = (arm: string, k: string) => rows.filter((r) => r.arm === arm).reduce((n, r) => n + r[k], 0);
const n = (arm: string) => rows.filter((r) => r.arm === arm).length;
console.log('');
for (const arm of ['shipped', 'candidate']) {
  console.log(`  ${arm.padEnd(9)} mean ${Math.round(sum(arm, 'chars') / n(arm))} chars, ${
    Math.round(sum(arm, 'words') / n(arm))} words, ${(sum(arm, 'tells') / n(arm)).toFixed(1)} tells per summary`);
}
console.log(`\n  asked for: under 180 words`);
console.log(`  over the ask: shipped ${rows.filter((r) => r.arm === 'shipped' && r.words > 180).length}/${n('shipped')}` +
  `, candidate ${rows.filter((r) => r.arm === 'candidate' && r.words > 180).length}/${n('candidate')}`);

// One of each, so the difference can be read rather than only counted.
for (const arm of ['shipped', 'candidate']) {
  const r = rows.filter((x) => x.arm === arm).sort((a, b) => b.tells - a.tells)[0];
  if (r) console.log(`\n  worst ${arm} (ch${r.chapter}, ${r.tells} tells):\n    ${r.text.slice(0, 420)}`);
}
