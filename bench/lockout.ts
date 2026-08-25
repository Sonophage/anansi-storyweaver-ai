// Does telling the model "this character belongs to the writer" actually stop it writing them?
//
// F21 measured the model narrating the protagonist's interior in 82.5% of generations with nothing
// in canon asking for it. The lockout is the first thing in the app that has ever aimed at that
// number, so it is the first thing that has to be measured against it.
//
//   node --experimental-strip-types bench/lockout.ts check          # the detectors, no model
//   node --experimental-strip-types bench/lockout.ts setup          # build the two stories
//   node --experimental-strip-types bench/lockout.ts A 40 &         # control
//   node --experimental-strip-types bench/lockout.ts B 40 &         # lockout on
//
// Run A and B AT THE SAME TIME, two processes against the one router. Nothing sets a seed, so arms
// run at different times are not controlled — that is the whole reason ab.ts exists.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { strip, verdict } from './interiority-verdict.ts';

const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const OUTDIR = process.env.ANANSI_OUT ?? '/tmp/anansi-lockout';
const WHO = 'Aldis Fen';
// Direct mode, and a directive that puts him in the room without telling the model what he does.
// A directive that said "Aldis reaches into his coat" would be the writer writing him, which is
// the case the lockout is FOR, and it would make the arms incomparable.
const DIRECTIVE = "Sabel crosses the bridge and stops in front of him.";
// EVERY OTHER CHARACTER IN THIS FIXTURE IS A WOMAN, AND THAT IS PART OF THE MEASUREMENT.
//
// The first run of this had Marek's MAN as the caller, and the first two samples of arm B read
// "He wore a heavy wool duster... He stopped under the awning... He reached into his breast
// pocket" — all of it the caller, all of it scored as the protagonist acting. Two men in a scene
// makes bare "he" ambiguous and no regex resolves it. Restricting the detector to the name instead
// would undercount by as much as it overcounts: he is the point-of-view character, so most
// references to him are pronouns.
//
// So the fixture is built so the pronoun cannot be ambiguous: one man in the story, and he is the
// locked one. Every "he", "him" and "his" in the output is Aldis Fen. The cost is that this
// measures a one-man scene, and prose with two men in it is not covered by it.
const TITLES = { A: 'LOCK control', B: 'LOCK on' };

// ---- the detectors ----
// `told` and `about` come from F21's classifier, unchanged, so the 82.5% is the same measurement.
// Two more are needed here, because the lockout forbids three things and interiority is only one.

/** Dialogue attributed to him. Runs on the WHOLE prose — quoted speech is the thing being counted,
 *  so this is the one check that must not strip it. */
const SPOKE = [
  /["“][^"”]{2,}["”][^.!?]{0,30}\b(he|aldis|fen)\b[^.!?]{0,20}\b(said|asked|muttered|murmured|whispered|replied|answered|told|growled|added|managed|breathed)\b/i,
  /\b(he|aldis|fen)\b[^.!?"“]{0,30}\b(said|asked|muttered|murmured|whispered|replied|answered|growled|added|managed|breathed)\b[^"“]{0,12}["“]/i,
  /["“][^"”]{2,}["”]\s*[—-]\s*(he|aldis)\b/i,
];

/** Him as the subject of a physical action, in narration. A curated verb list rather than a
 *  past-tense rule: "he stopped" is an action and "he was stopped" is not, and no regex over
 *  \w+ed tells those apart. The cost is that an action phrased with a verb not on this list is
 *  invisible to it — which is stated in the finding rather than hidden. */
const ACTED = new RegExp(String.raw`\b(he|aldis|fen)\s+(had\s+|then\s+|slowly\s+|just\s+)?(`
  + ['reached', 'turned', 'stood', 'stepped', 'walked', 'took', 'drew', 'put', 'pulled', 'pushed',
     'opened', 'closed', 'moved', 'ran', 'lifted', 'set', 'crossed', 'raised', 'looked', 'watched',
     'nodded', 'shook', 'gripped', 'held', 'struck', 'hit', 'fired', 'sat', 'rose', 'leaned',
     'knelt', 'waited', 'stopped', 'started', 'went', 'came', 'gave', 'let', 'made',
     'counted', 'shifted', 'straightened', 'spat', 'swallowed', 'blinked', 'breathed'].join('|')
  + String.raw`)\b`, 'i');

export const score = (prose: string) => {
  const narr = strip(prose);
  const v = verdict(prose);
  return { about: v.about, told: v.told, spoke: SPOKE.some((r) => r.test(String(prose))),
           acted: ACTED.test(narr), chars: narr.trim().length };
};

// ---- the detectors are validated before any result is believed (CLAUDE.md) ----
// A check that never fires reports perfection; one that always fires reports disaster. Both
// directions, and the awkward cases are the point of the list.
const CASES: [string, Partial<ReturnType<typeof score>>, string][] = [
  ['"Eleven crowns," he said. "By Thursday."', { spoke: true }, 'plainest attribution'],
  ['He said, "Eleven crowns."', { spoke: true }, 'attribution first'],
  ['Aldis muttered something about the rain.', { spoke: false }, 'reported, not quoted — not dialogue'],
  ['"Eleven crowns," Marek said, and waited.', { spoke: false }, 'somebody else speaking'],
  ['Marek said, "He told me eleven." ', { spoke: false },
   'his words inside another character\'s mouth are not him speaking'],
  ['He reached into his coat.', { acted: true, spoke: false }, 'an action'],
  ['"Eleven," he said.', { spoke: true, acted: false },
   'speaking is counted once, as speech — the three counters measure three different things'],
  ['Aldis stood in the rain and counted.', { acted: true }, 'two actions, one hit is enough'],
  ['The rain had not stopped for three days.', { acted: false, about: false }, 'nothing about him'],
  ['He was certain the key was a forgery.', { told: true, acted: false }, 'interior, not action'],
  ['"I reached for it," Marek said.', { acted: false, spoke: false },
   'an action inside dialogue is not narration — this is the false positive that cost F17 a week'],
  ['Marek reached for the door.', { acted: false }, 'somebody else acting, by name'],
  ['She reached for the door.', { acted: false, about: false },
   'somebody else acting, by pronoun — sound ONLY because the fixture has one man in it'],
  ['He was pushed against the wall.', { acted: false },
   'passive: it happens TO him, which is exactly what the lockout wants instead'],
  ['The room waited. Nobody moved.', { acted: false, spoke: false, told: false },
   'the good case — the world answering, and him not in it'],
];

if (process.argv[2] === 'check') {
  let bad = 0;
  for (const [text, want, why] of CASES) {
    const got: any = score(text);
    for (const [k, v] of Object.entries(want))
      if (got[k] !== v) { bad++; console.log(`  RED  ${k}=${got[k]}, wanted ${v} — ${why}\n       ${JSON.stringify(text)}`); }
  }
  console.log(bad ? `\n  ${bad} RED — do not believe a result from this` : `\n  ${CASES.length} cases, all green`);
  process.exit(bad ? 1 : 0);
}

const j = (u: string, b?: unknown, m = 'POST') => fetch(B + u, b
  ? { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }
  : {}).then((r) => r.json() as any);

const arm = process.argv[2] ?? 'A';
const n = Number(process.argv[3] ?? 20);

// ---- setup: two stories identical except for one setting ----
if (arm === 'setup') {
  const { stories } = await j('/api/stories', undefined, 'GET');
  for (const [k, title] of Object.entries(TITLES)) {
    const old = stories.find((s: any) => s.title === title);
    if (old) await j('/api/stories', { id: old.id }, 'DELETE');
    const made = await j('/api/stories', {
      title, genre: 'fantasy noir',
      premise: 'A broke ex-sergeant owes a moneylender more than he can pay.',
      setting: 'Vantic, a canal city, in the third week of rain',
      pov: 'third limited, past tense',
      writingStyle: 'clipped and wet. Short sentences. Weather does the feeling. No adverbs on dialogue tags.',
      spice: 2,
    });
    await j('/api/entry', { storyId: made.id, entry: { id: '', entryType: 'character',
      activation: 'always_on', keys: [], lastEditor: 'human', title: WHO,
      body: '[Aldis Fen: 34, ex-Watch sergeant, limp in the left knee from a fall he lies about, '
        + 'owes Marek eleven crowns]' } });
    await j('/api/entry', { storyId: made.id, entry: { id: '', entryType: 'character',
      activation: 'always_on', keys: [], lastEditor: 'human', title: 'Marek Vale',
      body: '[Marek Vale: moneylender, patient, never raises her voice, sends people rather than come]' } });
    await j('/api/entry', { storyId: made.id, entry: { id: '', entryType: 'character',
      activation: 'always_on', keys: [], lastEditor: 'human', title: 'Sabel',
      body: "[Sabel: Marek's collector, broad, unhurried, says little, carries no weapon she shows]" } });
    for (const body of [
      'The rain had not stopped for three days. Aldis Fen stood under the fishmonger\'s awning and watched Sabel cross the bridge, unhurried, the way collectors walk when they know where you sleep.',
      'He had counted the coins twice that morning. He counted them again now, in his pocket, by feel. The number did not improve.',
    ]) await j('/api/write', { storyId: made.id, body });
    // The one difference. Arm A leaves it null, which is every story in the app today.
    if (k === "B") await j("/api/story", { id: made.id, story: { lockedCharacter: WHO } });
    const back = await j(`/api/story?story=${made.id}`, undefined, 'GET');
    console.log(`  ${k}: ${title} — ${made.id}  locked=${JSON.stringify(back.story?.lockedCharacter ?? null)}`);
  }
  console.log('\n  now run both arms AT THE SAME TIME:');
  console.log('    node --experimental-strip-types bench/lockout.ts A 40 &');
  console.log('    node --experimental-strip-types bench/lockout.ts B 40 &');
  process.exit(0);
}

if (arm === 'report') {
  for (const k of ['A', 'B']) {
    const rows = readFileSync(`${OUTDIR}/${k}.jsonl`, 'utf8').trim().split('\n')
      .map((l) => JSON.parse(l)).filter((r) => !r.error);
    // The informative denominator (F10): a run that never mentions him could not have written him.
    const about = rows.filter((r) => r.about);
    const pc = (f: (r: any) => boolean) => about.length
      ? `${(about.filter(f).length / about.length * 100).toFixed(1)}% (${about.filter(f).length}/${about.length})`
      : 'n/a';
    console.log(`  ${TITLES[k as 'A' | 'B']}: ${rows.length} usable, ${about.length} mention him`);
    console.log(`    told   ${pc((r) => r.told)}`);
    console.log(`    spoke  ${pc((r) => r.spoke)}`);
    console.log(`    acted  ${pc((r) => r.acted)}`);
    console.log(`    any    ${pc((r) => r.told || r.spoke || r.acted)}`);
    console.log(`    chars  median ${[...rows.map((r: any) => r.chars)].sort((a, b) => a - b)[Math.floor(rows.length / 2)]}`);
  }
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
                  : { i, arm, seconds: r.seconds, ...score(r.prose), prose: r.prose };
  } catch (e: any) {
    row = { i, arm, error: `${e?.name ?? 'error'}: ${e?.message ?? e}` };
  }
  appendFileSync(OUT, JSON.stringify(row) + '\n');
}
console.log(`  ${arm}: ${n} done -> ${OUT}`);
