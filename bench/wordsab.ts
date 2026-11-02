// {{words}} A/B, F65 (2026-11-02). Two scratch servers on two copies of the library, one per arm, both on
// the local model, run SIMULTANEOUSLY (one generation per slot), so drift lands on both arms alike.
//   A: the writer's saved action prompts as they are; the app appends "Write no more than N words.
//      Stop sooner if the beat is done."
//   B: the same prompts with the length in their own words, "Write this in {{words}} words.", in place
//      of the stopping line (continue, narrate) or added at the end (speak, act, direct).
// Every arm's MODE block is read back through /api/manifest before anything is generated, and the run
// stops if either is not the intended treatment. Every generated passage is deleted after it is
// counted; setup passages after their action. Run it against SCRATCH copies only: it rewrites the
// writer's prompts, the slider and the tale's model pin on the arm it talks to.
//
//   ANANSI_DB=<copy A> ANANSI_PORT=5301 node --experimental-strip-types serve.ts   (and B on 5302)
//   node --experimental-strip-types bench/wordsab.ts <out.jsonl> [runs per action, default 8]
//
// The tale (WORDS_SID), the voice it is written as (WORDS_WHO) and the inputs below are ENCORE's;
// another tale needs its own. With 0 runs it only sets up and verifies, which spends no model time.
import { appendFileSync, writeFileSync } from 'node:fs';

const A = process.env.WORDS_A ?? 'http://127.0.0.1:5301', Bu = process.env.WORDS_B ?? 'http://127.0.0.1:5302';
const OUT = process.argv[2];
const N = Number(process.argv[3] ?? 8);
const TARGET = 300;
const MODEL = 'Qwen3.6-WNTH-35B-A3B-NN';
const SID = process.env.WORDS_SID ?? 's-7bb337a1';      // ENCORE
const WHO = process.env.WORDS_WHO ?? 'Seth';

const j = async (base: string, u: string, b?: unknown, m = 'POST') => {
  const r = await fetch(base + u, b === undefined ? undefined
    : { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return r.json() as any;
};

const SAVED = (await j(A, '/api/prompts', undefined)).yours ?? {};
const rewrite: Record<string, (t: string) => string> = {
  continue: (t) => t.replace('Stop when the beat lands, even if that is three sentences.', 'Write this beat in {{words}} words.'),
  narrate: (t) => t.replace('Stop at a natural beat, however few sentences that takes.', 'Write this in {{words}} words.'),
  speak: (t) => `${t.trimEnd()}\nWrite this in {{words}} words.`,
  act: (t) => `${t.trimEnd()}\nWrite this in {{words}} words.`,
  direct: (t) => `${t.trimEnd()}\nWrite this in {{words}} words.`,
};
const ACTIONS = ['continue', 'direct', 'speak', 'act', 'narrate'] as const;
const INPUT: Record<string, any> = {
  continue: {},
  direct: { directive: 'Halsey orders another drink and turns on her stool to face Seth.' },
  speak: { speaker: WHO, write: { body: '"So are you going to tell me what that text meant, or do I have to guess?"', mode: 'speak', speaker: WHO } },
  act: { speaker: WHO, write: { body: 'Seth sets his glass down on the bar and reaches for her hand.', mode: 'act', speaker: WHO } },
  narrate: { write: { body: 'The music downstairs drops to something slower, and the whole room seems to lean in with it.', mode: 'narrate' } },
};

// ---- setup, both arms
for (const base of [A, Bu]) {
  const s = await j(base, '/api/settings', { storyId: SID, target_words: TARGET });
  if (s.error) throw new Error(`settings on ${base}: ${s.error}`);
  const st = await j(base, '/api/story', { id: SID, story: { model: MODEL } });
  if (st.error) throw new Error(`pin on ${base}: ${st.error}`);
}
for (const k of ACTIONS) {
  if (!SAVED[k]) throw new Error(`Seth has no saved ${k} prompt on the copy`);
  const text = rewrite[k](SAVED[k]);
  if (text === SAVED[k] || !text.includes('{{words}}')) throw new Error(`the ${k} rewrite did not apply`);
  const r = await j(Bu, '/api/prompts', { key: k, text });
  if (r.error) throw new Error(`prompt ${k} on B: ${r.error}`);
}

// ---- verify the treatment through the manifest, before any generation
for (const k of ACTIONS) {
  const body = { storyId: SID, mode: k, directive: INPUT[k].directive, speaker: INPUT[k].speaker, count: false };
  const ma = (await j(A, '/api/manifest', body)).manifest?.blocks?.find((b: any) => b.kind === 'MODE')?.text ?? '';
  const mb = (await j(Bu, '/api/manifest', body)).manifest?.blocks?.find((b: any) => b.kind === 'MODE')?.text ?? '';
  const okA = ma.includes(`Write no more than ${TARGET} words.`) && !/ in \d+ words\./.test(ma);
  const okB = mb.includes(`in ${TARGET} words.`) && !mb.includes('Write no more than');
  console.log(`  verify ${k.padEnd(8)} A:${okA ? 'ok' : 'BAD'}  B:${okB ? 'ok' : 'BAD'}`);
  if (!okA || !okB) { console.log('--- A ---\n' + ma + '\n--- B ---\n' + mb); throw new Error(`treatment not as intended for ${k}`); }
}

// ---- run
writeFileSync(OUT, '');
const words = (s: string) => (String(s ?? '').match(/\S+/g) ?? []).length;
const newestHuman = (v: any) => [...(v.passages ?? [])].filter((p: any) => p.author === 'human')
  .sort((a: any, b: any) => b.ordinal - a.ordinal)[0]?.id;

async function one(base: string, arm: string, k: string, i: number) {
  const t0 = Date.now();
  try {
    const r = await j(base, '/api/generate', { storyId: SID, mode: k, directive: INPUT[k].directive, speaker: INPUT[k].speaker });
    if (r.error || !r.prose) return { arm, k, i, error: String(r.error ?? 'no prose') };
    if (r.passageId) await j(base, '/api/passage', { storyId: SID, id: r.passageId, allTakes: true }, 'DELETE');
    return { arm, k, i, words: words(r.prose), ratio: words(r.prose) / TARGET, s: Math.round((Date.now() - t0) / 1000) };
  } catch (e: any) { return { arm, k, i, error: String(e?.message ?? e) }; }
}

for (const k of ACTIONS) {
  const setup: Record<string, string | undefined> = {};
  if (INPUT[k].write) for (const [arm, base] of [['A', A], ['B', Bu]] as const) {
    const v = await j(base, '/api/write', { storyId: SID, ...INPUT[k].write });
    setup[arm] = newestHuman(v);
  }
  for (let i = 0; i < N; i++) {
    const rows = await Promise.all([one(A, 'A', k, i), one(Bu, 'B', k, i)]);
    for (const row of rows) { appendFileSync(OUT, JSON.stringify(row) + '\n'); console.log('  ' + JSON.stringify(row)); }
  }
  for (const [arm, base] of [['A', A], ['B', Bu]] as const)
    if (setup[arm]) await j(base, '/api/passage', { storyId: SID, id: setup[arm], allTakes: true }, 'DELETE');
}
console.log('done ->', OUT);
