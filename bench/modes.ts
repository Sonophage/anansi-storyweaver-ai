// The mode prompts, re-cut: did taking the numbers and the lists out change what comes back?
//
// Two claims, and they are different questions.
//
//   LENGTH   Three prompts named a paragraph count. F18 says a named length is a length the model
//            fills. If that is true here, taking the number out should move the length AND widen
//            its spread — a passage that stops when the beat is done is not the same size twice.
//   SLOTS    Speak said "speech, action, the room" and COUNCIL-04 got back reply, gesture, weather
//            every time. Three slots is a shape. The counter is how often all three are present.
//
// The arms are two SERVERS, one running the old prompts and one the new, against the one router,
// at the same time — the only controlled comparison here, since nothing sets a seed.
//
//   node --experimental-strip-types bench/modes.ts check              # the detector, no model
//   node --experimental-strip-types bench/modes.ts setup              # build the story
//   ANANSI_URL=http://127.0.0.1:5183 ... bench/modes.ts old 20 &      # old prompts
//   ANANSI_URL=http://127.0.0.1:5184 ... bench/modes.ts new 20 &      # new prompts
//   node --experimental-strip-types bench/modes.ts report
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';

const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const OUTDIR = process.env.ANANSI_OUT ?? '/tmp/anansi-modes';
const TITLE = 'MODES fixture';
const WHO = 'Aldis Fen';
const SAID = '"Eleven crowns," Aldis said. "I have not got eleven crowns."';

// ---- the slot detector ----
// Narration only for the two that are narration; the quoted check needs the quotes, so it runs on
// the whole thing. `strip` first, exactly as every other check in this project does, because a
// gesture inside dialogue is a character describing one, not the narrator writing one.
const strip = (p: string) => String(p ?? '').replace(/["“][^"”]*["”]/g, ' ');
const QUOTED = /["“][^"”]{3,}["”]/;
const GESTURE = new RegExp(String.raw`\b(?:he|she|they|[A-Z][a-z]+)\s+(?:`
  + ['nodded', 'shrugged', 'shook', 'turned', 'stepped', 'reached', 'leaned', 'raised', 'lowered',
     'smiled', 'frowned', 'looked', 'glanced', 'stood', 'sat', 'moved', 'lifted', 'tilted',
     'crossed', 'folded', 'wiped', 'spat', 'blinked'].join('|') + String.raw`)\b`);
const ROOM = new RegExp(String.raw`\b(?:rain|wind|water|canal|air|light|dark(?:ness)?|silence|cold|`
  + String.raw`damp|smell|stone|street|room|awning|bridge|sky|thunder|mist|fog|shadows?)\b`, 'i');

export const slots = (prose: string) => {
  const narr = strip(prose);
  const said = QUOTED.test(String(prose));
  const gesture = GESTURE.test(narr);
  const room = ROOM.test(narr);
  return { said, gesture, room, all3: said && gesture && room,
           chars: String(prose ?? '').trim().length,
           paras: String(prose ?? '').trim().split(/\n{2,}/).filter((x) => x.trim()).length };
};

// ---- validated before any result is believed (CLAUDE.md) ----
const CASES: [string, Partial<ReturnType<typeof slots>>, string][] = [
  ['"Eleven crowns," she said. He nodded. The rain kept on.',
   { said: true, gesture: true, room: true, all3: true }, 'the exact shape COUNCIL-04 named'],
  ['"Eleven crowns," she said.', { said: true, gesture: false, room: false, all3: false },
   'a reply on its own is one slot, not three'],
  ['He nodded and put the paper away.', { said: false, gesture: true, all3: false }, 'gesture only'],
  ['The rain did not stop.', { said: false, gesture: false, room: true, all3: false }, 'room only'],
  ['"He nodded at the rain," she said.', { gesture: false, room: false, all3: false },
   'a gesture and a room INSIDE dialogue are a character describing them, not the narrator'],
  ['Nothing happened. Nobody answered.', { said: false, gesture: false, room: false, all3: false },
   'the empty case — a detector that cannot report zero reports perfection'],
];

if (process.argv[2] === 'check') {
  let bad = 0;
  for (const [text, want, why] of CASES) {
    const got: any = slots(text);
    for (const [k, v] of Object.entries(want))
      if (got[k] !== v) { bad++; console.log(`  RED  ${k}=${got[k]}, wanted ${v} — ${why}\n       ${JSON.stringify(text)}`); }
  }
  console.log(bad ? `\n  ${bad} RED — do not believe a result from this` : `\n  ${CASES.length} cases, all green`);
  process.exit(bad ? 1 : 0);
}

const j = (u: string, b?: unknown, m = 'POST') => fetch(B + u, b
  ? { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }
  : {}).then((r) => r.json() as any);

const arm = process.argv[2] ?? 'old';
const n = Number(process.argv[3] ?? 20);

if (arm === 'setup') {
  const { stories } = await j('/api/stories', undefined, 'GET');
  const old = stories.find((s: any) => s.title === TITLE);
  if (old) await j('/api/stories', { id: old.id }, 'DELETE');
  const made = await j('/api/stories', {
    title: TITLE, genre: 'fantasy noir',
    premise: 'A broke ex-sergeant owes a moneylender more than he can pay.',
    setting: 'Vantic, a canal city, in the third week of rain',
    pov: 'third limited, past tense',
    writingStyle: 'clipped and wet. Short sentences. Weather does the feeling. No adverbs on dialogue tags.',
    spice: 2, persona: WHO,
  });
  await j('/api/entry', { storyId: made.id, entry: { id: '', entryType: 'character',
    activation: 'always_on', keys: [], lastEditor: 'human', title: WHO,
    body: '[Aldis Fen: 34, ex-Watch sergeant, owes Marek eleven crowns]' } });
  await j('/api/entry', { storyId: made.id, entry: { id: '', entryType: 'character',
    activation: 'always_on', keys: [], lastEditor: 'human', title: 'Sabel',
    body: "[Sabel: Marek's collector, broad, unhurried, says little]" } });
  await j('/api/write', { storyId: made.id,
    body: 'The rain had not stopped for three days. Sabel found him under the fishmonger\'s awning.' });
  // Speak's fixture: the writer's own line is already the last passage, which is the whole premise
  // of the mode. Without it the model has nothing to answer and the arms measure something else.
  await j('/api/write', { storyId: made.id, body: SAID, speaker: WHO });
  console.log(`  ${TITLE} — ${made.id}`);
  process.exit(0);
}

if (arm === 'report') {
  const med = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;
  for (const k of ['old', 'new']) {
    let rows: any[];
    try { rows = readFileSync(`${OUTDIR}/${k}.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)); }
    catch { console.log(`  ${k}: no rows`); continue; }
    rows = rows.filter((r) => !r.error).map((r) => ({ ...r, ...slots(String(r.prose ?? '')) }));
    for (const mode of ['speak', 'continue']) {
      const m = rows.filter((r) => r.mode === mode);
      if (!m.length) continue;
      const chars = m.map((r) => r.chars).sort((a, b) => a - b);
      const pc = (f: (r: any) => boolean) => `${(m.filter(f).length / m.length * 100).toFixed(0)}% (${m.filter(f).length}/${m.length})`;
      console.log(`  ${k.padEnd(4)} ${mode.padEnd(9)} n=${m.length}`
        + `  chars med ${med(chars)} [${chars[0]}–${chars.at(-1)}]`
        + `  paras med ${med(m.map((r) => r.paras))}`
        + (mode === 'speak' ? `  all three slots ${pc((r) => r.all3)}` : ''));
    }
  }
  process.exit(0);
}

mkdirSync(OUTDIR, { recursive: true });
const OUT = `${OUTDIR}/${arm}.jsonl`;
const { stories } = await j('/api/stories', undefined, 'GET');
const story = stories.find((s: any) => s.title === TITLE);
if (!story) { console.error('run setup first'); process.exit(1); }

for (let i = 0; i < n; i++) {
  // Alternated rather than run in blocks: if the router slows down partway, a block design puts
  // all of one mode on the slow side of it.
  const mode = i % 2 ? 'continue' : 'speak';
  let row: Record<string, unknown>;
  try {
    const r = await j('/api/generate', { storyId: story.id, mode, speaker: mode === 'speak' ? WHO : undefined });
    row = r.error ? { i, arm, mode, error: String(r.error) } : { i, arm, mode, prose: r.prose };
  } catch (e: any) { row = { i, arm, mode, error: `${e?.name ?? 'error'}: ${e?.message ?? e}` }; }
  appendFileSync(OUT, JSON.stringify(row) + '\n');
}
console.log(`  ${arm}: ${n} done -> ${OUT}`);
