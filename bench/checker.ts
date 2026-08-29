// How good is the canon checker? A labelled fixture, precision and recall.
//
// This is the golden-fixture eval SPEC §15 gap 1 asked for: "roughly fifteen tuned constants
// are guesses that happen to be written down". Now at least the checker's own accuracy is
// measured rather than inherited from a published frontier-model figure.
//
//   node --experimental-strip-types bench/checker.ts
const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const j = (u: string, b?: unknown, m = 'POST') => fetch(B + u, b ? { method: m,
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {})
  .then((r) => r.json() as any);

// Canon in the fixture: the key is brass not silver and cold even in summer; Aldis has a
// limp in the left knee and owes Marek eleven crowns; Marek is never seen out in the rain.
const CASES: { label: string; body: string; contradicts: boolean; numeric?: boolean }[] = [
  { contradicts: true,  label: 'key called silver in narration',
    body: 'He drew out the key. Solid silver, and it caught what light there was.' },
  { contradicts: true,  label: 'key called warm',
    body: 'The key was warm in his fist, warm as a held coin, and he did not like it.' },
  { contradicts: true,  label: 'no limp',
    body: 'He took the stairs three at a time, both knees sound beneath him, and did not slow.' },
  { contradicts: true,  label: 'Marek out in the rain',
    body: 'Marek stood in the open yard with the rain running off his hat, counting on his fingers.' },
  { contradicts: true,  numeric: true, label: 'wrong debt',
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

  // NUMBERS, AS A CLASS. F11 measured the checker missing numeric contradictions at one case in
  // twelve — and one case cannot measure a class, which is why "wrong debt" above sat alone and
  // the rate was really one case in one. Seth, 2026-08-29, asked whether numbers matter in a real
  // book: they do, counts especially. Six cases, and THREE of them are clean, because a rule that
  // flags every number scores perfect recall on this class and is worthless — the same shape the
  // retirement probe is built around.
  { contradicts: true,  numeric: true, label: 'debt understated',
    body: 'Three crowns stood between him and the door. He had counted them and counted again.' },
  { contradicts: true,  numeric: true, label: 'debt overstated',
    body: 'Twenty crowns, and the number sat in him like something swallowed whole.' },
  { contradicts: true,  numeric: true, label: 'debt as a digit',
    body: 'The ledger said 4 crowns against his name, in a hand he did not recognise.' },
  { contradicts: false, numeric: true, label: 'the right number, restated',
    body: 'Eleven crowns. He said it under his breath on the stair, the way you say a name.' },
  { contradicts: false, numeric: true, label: 'a number canon says nothing about',
    body: 'Nine steps up from the landing the boards changed, and the sound of him changed with them.' },
  { contradicts: false, numeric: true, label: 'a character guesses a number',
    body: '"Six crowns, maybe seven," the boy said, who had never seen the ledger in his life.' },
];

// ITS OWN BOOK, CREATED HERE. This used to take `stories[0]` — whatever story happened to be
// first on whatever server it was pointed at — and then WRITE PASSAGES INTO IT and delete them
// again. Against the desk's live instance that is somebody's actual novel. It also meant the canon
// this file documents in the comment above was a hope about the database rather than a fact, so a
// run against a book without a brass key measured nothing and said nothing.
const TITLE = 'Checker fixture — the Silver Key';
const existing = (await j('/api/stories', undefined, 'GET')).stories
  .find((x: any) => x.title === TITLE);
const sid = existing?.id ?? await (async () => {
  const made = await j('/api/stories', { title: TITLE, genre: 'noir',
    premise: 'A debt comes due.', setting: 'Vantic, in the rain',
    pov: 'third limited, past tense', writingStyle: 'Terse, wet, unsentimental.' });
  const id = made.id ?? made.storyId ?? made.stories?.at(-1)?.id;
  const entry = (title: string, body: string, o: any = {}) =>
    j('/api/entry', { storyId: id, entry: { title, body, entryType: 'character',
      activation: 'always_on', keys: [], lastEditor: 'human', ...o } });
  await entry('Aldis Fen', '[Aldis Fen: 34, ex-Watch sergeant, limp in the left knee from a fall '
    + 'he lies about, owes Marek eleven crowns]');
  await entry('the Silver Key', '[the Silver Key: brass, not silver, despite the name. Cold to the '
    + 'touch even in summer. Opens the lower archive vault]', { entryType: 'item' });
  await entry('Marek', '[Marek: keeps the archive. Never seen out in the rain]');
  return id;
})();
if (!sid) { console.log('  could not create the fixture book'); process.exit(1); }
// EACH CASE RAN ONCE UNTIL 2026-08-29, and a prompt edit swinging the numeric class 2/4 -> 0/4 is
// what exposed it: at one sample per case there is no way to tell a change from the weather. The
// model is sampled, so a case is a RATE and not a verdict. `--only numeric` narrows to the class
// under test so a comparison costs a minute rather than ten.
//   node --experimental-strip-types bench/checker.ts [repeats] [--only numeric]
const REPEATS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1);
const ONLY_NUM = process.argv.includes('--only') && process.argv.includes('numeric');
let tp = 0, fp = 0, tn = 0, fn = 0;
const hits = new Map<string, number>();
const seen = new Map<string, boolean>();
for (const c of (ONLY_NUM ? CASES.filter((x) => x.numeric) : CASES)) {
 let flaggedTimes = 0;
 for (let rep = 0; rep < REPEATS; rep++) {
  const pid = (await j('/api/write', { storyId: sid, body: c.body })).passages.at(-1).id;
  const r = await j('/api/check', { storyId: sid, passageId: pid });
  const flagged = !r.error && (r.found ?? 0) > 0;
  if (flagged) flaggedTimes++;
  seen.set(c.label, flagged);
  if (c.contradicts && flagged) tp++;
  else if (c.contradicts) fn++;
  else if (flagged) fp++;
  else tn++;
  const mark = c.contradicts === flagged ? ' ok ' : 'MISS';
  const detail = flagged ? (r.violations ?? []).filter((v: any) => v.passageId === pid)
    .map((v: any) => `${v.quote?.slice(0, 34)} (${v.confidence})`).join('; ') : '';
  if (REPEATS === 1) console.log(`  ${mark} ${c.contradicts ? 'contradicts' : 'clean      '} · ${c.label.padEnd(34)} ${detail}`);
  await j('/api/passage', { storyId: sid, id: pid }, 'DELETE');
 }
 hits.set(c.label, flaggedTimes);
 if (REPEATS > 1) console.log(`  ${c.contradicts ? 'contradicts' : 'clean      '} · `
   + `${c.label.padEnd(34)} flagged ${flaggedTimes}/${REPEATS}`);
}
// THE NUMERIC CLASS ON ITS OWN DENOMINATOR. Folded into the total it is six cases in eighteen and
// a change to it moves the headline by a third of what it really did — F10's rule, which is that a
// rate over the wrong denominator decides nothing.
const num = CASES.filter((c) => c.numeric);
const numTp = num.filter((c) => c.contradicts && seen.get(c.label)).length;
const numFn = num.filter((c) => c.contradicts && !seen.get(c.label)).length;
const numFp = num.filter((c) => !c.contradicts && seen.get(c.label)).length;
console.log(`\n  NUMBERS  caught ${numTp}/${numTp + numFn} wrong counts,`
  + ` ${numFp} false alarms on ${num.length - numTp - numFn} clean ones`);
console.log(`           a rule that flags every number would score ${numTp + numFn}/${numTp + numFn}`
  + ` here and ${num.length - numTp - numFn} false alarms — which is why the clean ones exist`);

const prec = tp / (tp + fp || 1), rec = tp / (tp + fn || 1);
console.log(`\n  caught ${tp}/${tp + fn} real contradictions   (recall    ${(rec * 100).toFixed(0)}%)`);
console.log(`  ${fp} false alarms on ${fp + tn} clean passages (precision ${(prec * 100).toFixed(0)}%)`);
console.log(`  F1 ${(2 * prec * rec / (prec + rec || 1)).toFixed(2)}`);
