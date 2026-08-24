// F21 — one arm of the interiority A/B. PLAN-04 put a character's inner state behind a
// measurement rather than building it, because the risk is not that the model ignores it but
// that it repeats it in the narrator's voice.
//
//   node --experimental-strip-types bench/interiority.ts setup     # build the two stories
//   node --experimental-strip-types bench/interiority.ts A 100     # control
//   node --experimental-strip-types bench/interiority.ts B 100     # with interiority in canon
//
// Run A and B AT THE SAME TIME, two processes against the one router. Nothing here sets a seed,
// so arms run at different times are not controlled — that is the whole reason ab.ts exists.
import { appendFileSync, mkdirSync } from 'node:fs';
import { INSIDE, verdict } from './interiority-verdict.ts';

const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const OUTDIR = process.env.ANANSI_OUT ?? '/tmp/anansi-f21';
const DIRECTIVE = "Marek's man makes it clear the debt is due tonight, and Aldis reaches into his coat.";
const TITLES = { A: 'F21 control', B: 'F21 interiority' };

const j = (u: string, b?: unknown, m = 'POST') => fetch(B + u, b
  ? { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }
  : {}).then((r) => r.json() as any);

const arm = process.argv[2] ?? 'A';
const n = Number(process.argv[3] ?? 20);

// ---- setup: two stories identical except for one line of canon ----
if (arm === 'setup') {
  const { stories } = await j('/api/stories', undefined, 'GET');
  for (const [k, title] of Object.entries(TITLES)) {
    const old = stories.find((s: any) => s.title === title);
    if (old) { await j('/api/stories', { id: old.id }, 'DELETE'); }
    const made = await j('/api/stories', {
      title, genre: 'fantasy noir',
      premise: 'A broke ex-sergeant owes a moneylender more than he can pay.',
      setting: 'Vantic, a canal city, in the third week of rain',
      pov: 'third limited, past tense',
      writingStyle: 'clipped and wet. Short sentences. Weather does the feeling. No adverbs on dialogue tags.',
      spice: 2,
    });
    // The protagonist. Arm B's entry carries one extra line and nothing else differs — if the
    // entries differed in length or shape the comparison would measure that instead.
    await j('/api/entry', { storyId: made.id, entry: { id: '', entryType: 'character',
      activation: 'always_on', keys: [], lastEditor: 'human', title: 'Aldis Fen',
      body: '[Aldis Fen: 34, ex-Watch sergeant, limp in the left knee from a fall he lies about, '
        + 'owes Marek eleven crowns]' + (k === 'B' ? `\n[Inside: ${INSIDE}]` : '') } });
    await j('/api/entry', { storyId: made.id, entry: { id: '', entryType: 'item',
      activation: 'triggered', keys: ['key', 'coat'], lastEditor: 'human', title: 'the Silver Key',
      body: '[the Silver Key: brass, not silver, despite the name. Cold to the touch even in summer. '
        + 'Opens the lower archive vault. Aldis carries it sewn into his coat lining]' } });
    for (const body of [
      'The rain had not stopped for three days. Aldis Fen stood under the fishmonger\'s awning and watched Marek\'s man cross the bridge, unhurried, the way men walk when they know where you sleep.',
      'He had counted the coins twice that morning. He counted them again now, in his pocket, by feel. The number did not improve.',
    ]) await j('/api/write', { storyId: made.id, body });
    console.log(`  ${k}: ${title} — ${made.id}${k === 'B' ? `  [Inside: ${INSIDE}]` : ''}`);
  }
  console.log('\n  now run both arms AT THE SAME TIME:');
  console.log('    node --experimental-strip-types bench/interiority.ts A 100 &');
  console.log('    node --experimental-strip-types bench/interiority.ts B 100 &');
  process.exit(0);
}

// ---- an arm ----
mkdirSync(OUTDIR, { recursive: true });
const OUT = `${OUTDIR}/${arm}.jsonl`;
const { stories } = await j('/api/stories', undefined, 'GET');
const story = stories.find((s: any) => s.title === (TITLES as any)[arm]);
if (!story) { console.error(`no story "${(TITLES as any)[arm]}" — run the setup step first`); process.exit(1); }

for (let i = 0; i < n; i++) {
  let row: Record<string, unknown>;
  try {
    const r = await j('/api/generate', { storyId: story.id, mode: 'direct', directive: DIRECTIVE });
    row = r.error ? { i, arm, error: String(r.error) }
                  : { i, arm, seconds: r.seconds, ...verdict(r.prose), prose: r.prose };
  } catch (e: any) {
    // A dead server must not end the arm — whoever is watching decides whether to stop.
    row = { i, arm, error: `${e?.name ?? 'error'}: ${e?.message ?? e}` };
  }
  appendFileSync(OUT, JSON.stringify(row) + '\n');
}
