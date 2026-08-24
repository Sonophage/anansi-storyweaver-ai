// Every mode's instruction block, as the model actually receives it.
//
//   node --experimental-strip-types bench/prompts.ts              # against the test fixture
//   node --experimental-strip-types bench/prompts.ts <story-id>   # against one of your stories
//   node --experimental-strip-types bench/prompts.ts <story-id> --full   # the whole prompt too
//
// This calls buildContext, so it cannot drift from what is sent. docs/PROMPTS.md §5 describes the
// same five blocks in prose; when they disagree, this is the one that is true.
import { buildContext } from '../src/context.ts';
import { render } from '../src/render.ts';

const [arg, ...rest] = process.argv.slice(2);
const full = rest.includes('--full') || arg === '--full';
const storyId = arg && arg !== '--full' ? arg : null;

const MODES = [
  ['continue', undefined, undefined],
  ['speak', undefined, 'Aldis Fen'],
  ['act', undefined, 'Aldis Fen'],
  ['direct', 'He drops the key into the canal.', undefined],
  ['narrate', undefined, undefined],
] as const;

let input: any;
if (storyId) {
  const { view, assemble } = await import('../src/story.ts');
  const v = view(storyId);
  if (!v) { console.error(`no story ${storyId}`); process.exit(1); }
  console.log(`\n  ${v.story.title} — chapter ${v.currentChapter.index}, ${v.passages.length} passages\n`);
  for (const [mode, directive, speaker] of MODES) {
    const { manifest, prompt } = assemble(v, { perSlot: 50048 } as any, mode, directive, undefined, 900, speaker);
    const block = manifest.blocks.find((b: any) => b.kind === 'MODE');
    console.log(`  ── ${mode.toUpperCase()} ${'─'.repeat(Math.max(0, 60 - mode.length))}`);
    console.log((block?.text ?? '(no MODE block — omitted on an unfinished line)')
      .split('\n').map((l: string) => '     ' + l).join('\n'));
    console.log(`     · ${manifest.totals.used} of ${manifest.totals.budget} tokens`
      + (manifest.overflowed ? '  OVERFLOWED' : ''));
    if (full) console.log(prompt.split('\n').map((l: string) => '  | ' + l).join('\n'));
    console.log('');
  }
} else {
  const { input: fixture } = await import('../test/fixture.ts');
  input = fixture;
  const count = (t: string) => Math.ceil(t.length / 2.8);
  console.log('\n  the test fixture — no story named, so nothing of yours is read\n');
  for (const [mode, directive, speaker] of MODES) {
    const m = buildContext({ ...input, mode, directive, speaker } as any, count);
    const block = m.blocks.find((b: any) => b.kind === 'MODE');
    console.log(`  ── ${mode.toUpperCase()} ${'─'.repeat(Math.max(0, 60 - mode.length))}`);
    console.log((block?.text ?? '(no MODE block — omitted on an unfinished line)')
      .split('\n').map((l: string) => '     ' + l).join('\n'));
    if (full) console.log(render(m).split('\n').map((l: string) => '  | ' + l).join('\n'));
    console.log('');
  }
}
