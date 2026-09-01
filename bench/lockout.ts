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
const TITLES = { A: 'LOCK control', B: 'LOCK on',
  // F51's pair, added 2026-08-31. Both have the lockout ON; they differ only in whether the WRITER
  // has already written him speaking and acting. Seth: "if the user does indeed write as their own
  // character the ai takes that as a soft permission and begins to start writing actions and
  // speech for that character."
  //
  // F28 could not see this. Its arms differ by the lockout itself and neither carries a line of his
  // in the prose, so the case Seth reported was outside the fixture.
  C: 'LOCK on, writer silent', D: 'LOCK on, writer speaks as him' };
const LOCKED = new Set(['B', 'C', 'D']);
// The one difference between C and D. Written through /api/write, so they are the writer's own
// passages in the recent-prose block, which is where in-context examples outweigh an instruction.
const WRITER_SPEAKS = new Set(['D']);
const HIS_OWN = [
  '"You can tell her I have eleven crowns," Aldis Fen said. "I do not have them today."',
  'Aldis Fen pushed off the post and stepped out into the rain to meet her, favouring the left knee.',
];

// ---- the detectors ----
//
// EVERY COUNTER IS ANCHORED ON THE NAME, NEVER ON A PRONOUN, AND THAT IS THE SECOND VERSION.
//
// The first version matched `(he|aldis|fen)` and it was wrong twice. First against a fixture with
// two men in it, where "He reached into his breast pocket" was the CALLER and scored as the
// protagonist acting. Then, after the fixture was rebuilt with one man in it and every other
// character written as a woman, it was wrong again: the model re-genders them. Sabel is "[Sabel:
// Marek's collector…, no weapon she shows]" in canon and came back as "the hem of HIS coat… He
// stopped inches from the awning's edge" — so the second man walked back into the scene and the
// pronoun was ambiguous again.
//
// A regex does not resolve a referent and no fixture can stop the model inventing one. So these
// count only what is unambiguous: his NAME as the subject. That UNDERCOUNTS — he is the
// point-of-view character and most references to him are pronouns — but it undercounts the same
// way in both arms, which leaves the comparison sound and makes every rate a floor rather than a
// rate. Say "under X%", never "X%".
const NAME = String.raw`(?:Aldis(?:\s+Fen)?|Fen)`;

/** Dialogue attributed to him. Runs on the WHOLE prose — quoted speech is the thing being counted,
 *  so this is the one check that must not strip it. */
const SPOKE = [
  new RegExp(String.raw`["“][^"”]{2,}["”][^.!?]{0,30}\b${NAME}\b[^.!?]{0,20}\b(said|asked|muttered|murmured|whispered|replied|answered|told|growled|added|managed|breathed)\b`, 'i'),
  new RegExp(String.raw`\b${NAME}\b[^.!?"“]{0,30}\b(said|asked|muttered|murmured|whispered|replied|answered|growled|added|managed|breathed)\b[^"“]{0,12}["“]`, 'i'),
];

/** The narrator stating his interior. F21's TOLD list, re-anchored on the name. */
const TOLD = new RegExp(String.raw`\b${NAME}\s+(?:had\s+|has\s+|would\s+have\s+|must\s+have\s+)?`
  + String.raw`(?:felt|knew|known|feared|hoped|wondered|realised|realized|remembered|understood|suspected|decided`
  + String.raw`|was\s+(?:certain|sure|afraid|ashamed|angry|calm|relieved))\b`, 'i');

/** Him as the subject of a physical action, in narration. A curated verb list rather than a
 *  past-tense rule: "he stopped" is an action and "he was stopped" is not, and no regex over
 *  \w+ed tells those apart. An action phrased with a verb not on this list is invisible to it —
 *  another reason these are floors. */
const ACTED = new RegExp(String.raw`\b${NAME}\s+(?:had\s+|then\s+|slowly\s+|just\s+)?(`
  + ['reached', 'turned', 'stood', 'stepped', 'walked', 'took', 'drew', 'put', 'pulled', 'pushed',
     'opened', 'closed', 'moved', 'ran', 'lifted', 'set', 'crossed', 'raised', 'looked', 'watched',
     'nodded', 'shook', 'gripped', 'held', 'struck', 'hit', 'fired', 'sat', 'rose', 'leaned',
     'knelt', 'waited', 'stopped', 'started', 'went', 'came', 'gave', 'let', 'made',
     'counted', 'shifted', 'straightened', 'spat', 'swallowed', 'blinked', 'breathed'].join('|')
  + String.raw`)\b`, 'i');

export const score = (prose: string) => {
  const narr = strip(prose);
  return {
    // The informative denominator (F10): a run that never NAMES him could not have been counted,
    // so it is not evidence either way and must not sit in the denominator as a pass.
    about: new RegExp(NAME, 'i').test(narr),
    told: TOLD.test(narr),
    spoke: SPOKE.some((r) => r.test(String(prose))),
    acted: ACTED.test(narr),
    chars: narr.trim().length,
  };
};

/** F52's metric: CONTINUOUS, and over every run rather than over the ones that name him.
 *
 *  F51 is the reason. Its binary rate sits on a denominator the treatment itself moves — the arm
 *  where the writer had spoken as him named him in 30.8% of passages against 55.4% — so a rate over
 *  "runs that name him" cannot be compared between arms at all. Density can: it asks how much of
 *  the output is him, and how much of it is him acting, per thousand words of narration.
 *
 *  Same regexes as `score`, made global. Sharing them is the point: two copies would drift and the
 *  binary and the density would stop describing the same thing.
 */
export const density = (prose: string) => {
  const narr = strip(prose);
  const words = (narr.match(/\w+/g) ?? []).length;
  const all = (r: RegExp) => (narr.match(new RegExp(r.source, r.flags.replace('g', '') + 'g')) ?? []).length;
  return {
    words,
    names: all(new RegExp(NAME, 'i')),
    acts: all(ACTED),
    // Pronouns are NOT attributed to him — the fixture cannot guarantee the referent and F51's own
    // note says the model re-genders the other characters. Reported so the ratio is visible, never
    // counted as his action.
    pronouns: all(/\b(he|him|his)\b/i),
  };
};

// ---- the detectors are validated before any result is believed (CLAUDE.md) ----
// A check that never fires reports perfection; one that always fires reports disaster. Both
// directions, and the awkward cases are the point of the list.
const CASES: [string, Partial<ReturnType<typeof score>>, string][] = [
  ['"Eleven crowns," Aldis said. "By Thursday."', { spoke: true, about: true }, 'plainest attribution'],
  ['Aldis said, "Eleven crowns."', { spoke: true }, 'attribution first'],
  ['Aldis muttered something about the rain.', { spoke: false }, 'reported, not quoted — not dialogue'],
  ['"Eleven crowns," Marek said, and waited.', { spoke: false, about: false }, 'somebody else speaking'],
  ['Marek said, "Aldis told me eleven."', { spoke: false },
   "his name inside another character's mouth is not him speaking"],
  ['Aldis reached into his coat.', { acted: true, spoke: false }, 'an action'],
  ['"Eleven," Aldis said.', { spoke: true, acted: false },
   'speaking is counted once, as speech — the three counters measure three different things'],
  ['Aldis stood in the rain and counted.', { acted: true }, 'two actions, one hit is enough'],
  ['The rain had not stopped for three days.', { acted: false, about: false }, 'nothing about him'],
  ['Aldis was certain the key was a forgery.', { told: true, acted: false }, 'interior, not action'],
  ['"I reached for it," Marek said.', { acted: false, spoke: false },
   'an action inside dialogue is not narration — the false positive class that cost F17 a week'],
  ['Marek reached for the door.', { acted: false, about: false }, 'somebody else acting, by name'],
  ['Aldis was pushed against the wall.', { acted: false },
   'passive: it happens TO him, which is exactly what the lockout wants instead'],
  ['He reached into his coat.', { acted: false, about: false },
   'A PRONOUN IS NOT COUNTED. This is the undercount, stated as a case so nobody reads a rate here '
   + 'as a rate — the model re-genders the other characters, so "he" cannot be resolved.'],
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
    // The writer's own lines for him, in arm D only. AFTER the two shared passages, so they are
    // the most recent prose in the window — which is the position that makes them examples.
    if (WRITER_SPEAKS.has(k)) for (const body of HIS_OWN) await j('/api/write', { storyId: made.id, body });
    // Arm A leaves the lockout null, which is every story in the app today. B, C and D set it.
    if (LOCKED.has(k)) await j("/api/story", { id: made.id, story: { lockedCharacter: WHO } });
    const back = await j(`/api/story?story=${made.id}`, undefined, 'GET');
    console.log(`  ${k}: ${title} — ${made.id}  locked=${JSON.stringify(back.story?.lockedCharacter ?? null)}`);
  }
  console.log('\n  now run both arms AT THE SAME TIME:');
  console.log('    node --experimental-strip-types bench/lockout.ts A 40 &');
  console.log('    node --experimental-strip-types bench/lockout.ts B 40 &');
  process.exit(0);
}

if (arm === 'density') {
  // F52's report. Continuous and over EVERY run, for the reason in `density` above: F51's binary
  // rate sits on a denominator the treatment moves, so only this can be compared between arms.
  for (const k of (process.env.ARMS ?? 'C,D').split(',')) {
    const rows = readFileSync(`${OUTDIR}/${k}.jsonl`, 'utf8').trim().split('\n')
      .map((l) => JSON.parse(l)).filter((r: any) => !r.error && r.prose);
    const t = rows.map((r: any) => density(String(r.prose)))
      .reduce((a, b) => ({ words: a.words + b.words, names: a.names + b.names,
                           acts: a.acts + b.acts, pronouns: a.pronouns + b.pronouns }),
              { words: 0, names: 0, acts: 0, pronouns: 0 });
    const per = (n: number) => (n / Math.max(t.words, 1) * 1000).toFixed(2);
    // The binary rate too, so this can be read against F51 rather than replacing it silently.
    const scored = rows.map((r: any) => score(String(r.prose)));
    const about = scored.filter((x) => x.about);
    console.log(`  ${k}: ${rows.length} runs, ${t.words} words of narration`);
    console.log(`    his action per 1,000 words   ${per(t.acts)}   (${t.acts} in all)`);
    console.log(`    his name per 1,000 words     ${per(t.names)}`);
    console.log(`    he/him/his per 1,000 words   ${per(t.pronouns)}  (not attributed — see density)`);
    console.log(`    binary, of runs naming him:  acted ${about.length
      ? (about.filter((x) => x.acted).length / about.length * 100).toFixed(1) + '%' : 'n/a'}`
      + ` (${about.filter((x) => x.acted).length}/${about.length} of ${rows.length})`);
  }
  process.exit(0);
}

if (arm === 'report') {
  for (const k of (process.env.ARMS ?? 'A,B').split(',')) {
    // RE-SCORED from the stored prose, never from the fields written at generation time. The
    // detectors were wrong twice and both fixes landed after the runs; a report that trusted the
    // stored verdict would have gone on printing the wrong numbers from the right prose, and
    // there would have been no sign of it.
    const rows = readFileSync(`${OUTDIR}/${k}.jsonl`, 'utf8').trim().split('\n')
      .map((l) => JSON.parse(l)).filter((r) => !r.error)
      .map((r) => ({ ...r, ...score(String(r.prose ?? '')) }));
    // The informative denominator (F10): a run that never mentions him could not have written him.
    const about = rows.filter((r) => r.about);
    const pc = (f: (r: any) => boolean) => about.length
      ? `${(about.filter(f).length / about.length * 100).toFixed(1)}% (${about.filter(f).length}/${about.length})`
      : 'n/a';
    console.log(`  ${TITLES[k as keyof typeof TITLES]}: ${rows.length} usable, ${about.length} NAME him in narration`);
    console.log('    (every rate below is a floor — pronouns are not counted. Say "under X%".)');
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
