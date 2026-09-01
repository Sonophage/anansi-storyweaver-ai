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
 *  so this is the one check that must not strip it.
 *
 *  THE GAP AFTER A CLOSING QUOTE IS PUNCTUATION AND WHITESPACE, NEVER WORDS, and that is the second
 *  version of this. The first allowed 30 free characters between the quote and his name, which let
 *  ANOTHER speaker's attribution sit in the gap:
 *
 *      "Eleven crowns," she said to Aldis Fen, who said nothing.     -> counted as him speaking
 *      "Eleven crowns," she told Aldis, and he said nothing at all.  -> counted as him speaking
 *
 *  Both are the opposite of him speaking, and both are inside the old window. Found on 2026-08-31
 *  while checking F53's one alarming number — speech going from 0 runs to 4 in the marked arm —
 *  before reporting it. The four real hits survive the fix; the point is that they no longer have to
 *  be taken on trust. Three cases in CASES hold this shut.
 *
 *  The cost is a tighter floor: `"Eleven crowns," a wet and furious Aldis said.` is now missed. That
 *  is the right trade — every rate here is already a floor, and a false POSITIVE on the speech
 *  counter is the one error that would invent a defect rather than undercount one.
 */
const ATTRIB = 'said|asked|muttered|murmured|whispered|replied|answered|growled|added|managed|breathed';
// Punctuation and space only. No \w, so no other character's attribution can hide in here.
const GAP = String.raw`["”][\s,;:—–-]{0,3}`;
const SPOKE = [
  // "Eleven crowns," Aldis said.
  new RegExp(String.raw`["“][^"”]{2,}${GAP}\b${NAME}\b[\s,]{0,3}(?:\w+\s){0,1}\b(${ATTRIB}|told)\b`, 'i'),
  // "Eleven crowns," said Aldis.
  new RegExp(String.raw`["“][^"”]{2,}${GAP}\b(?:${ATTRIB})\b\s+\b${NAME}\b`, 'i'),
  // Aldis said, "Eleven crowns."   — attribution before the quote, unchanged.
  new RegExp(String.raw`\b${NAME}\b[^.!?"“]{0,30}\b(${ATTRIB})\b[^"“]{0,12}["“]`, 'i'),
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

    /* ---- F53's exposure split. ADDED FIELDS, and `pronouns` above is deliberately left alone:
     * F52's `density` mode prints it and changing it would silently move a published number.
     *
     * WHY SPLIT AT ALL. Lumping he/him/his hides the thing that turned out to matter. "his knee"
     * and "she looked at him" put him on the page WITHOUT him doing anything; only the subject slot
     * — bare "he", or his name — can carry an action. So a treatment could halve his action count
     * two entirely different ways:
     *
     *   - he occupies the subject slot as often, and does fewer things in it. A behaviour change.
     *   - he occupies it half as often. The action count falls with the exposure, and the per-slot
     *     rate is flat.
     *
     * These are not the same claim and the aggregate cannot tell them apart. `subj` is the
     * denominator that can. */
    he: all(/\bhe\b/i),          // subject slot, pronoun
    him: all(/\bhim\b/i),        // object — present, not acting
    hisPoss: all(/\bhis\b/i),    // possessive — present, not acting
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
  // ---- F53. THE SHAPE THAT COULD HAVE FAKED F53'S ONE ALARMING NUMBER.
  //
  // F53 found speech going from 0 runs to 4 in the marked arm, which is the half of the defect Seth
  // reported and the half F51 could never resolve. Before believing 4, the question is whether SPOKE
  // can fire on somebody ELSE speaking while his name happens to sit between the quote and a second
  // `said` — "…," she said to Aldis Fen, who said nothing. Its first pattern allows 30 characters
  // between the closing quote and his name and 20 more before the verb, so this is not a paranoid
  // case, it is inside the window.
  //
  // The four real hits were read by eye and every one was a bare `Aldis said` directly after his own
  // line, so F53's number does not rest on this. These cases are here so the next run does not have
  // to take that on trust.
  ['"Eleven crowns," she said to Aldis Fen, who said nothing.', { spoke: false },
   'ANOTHER character speaking, with his name between the quote and a second `said`'],
  ['"Eleven crowns," Sabel said. Aldis said nothing.', { spoke: false },
   'his name beside `said nothing` is silence, not dialogue'],
  ['"Eleven crowns," she told Aldis, and he said nothing at all.', { spoke: false },
   'told AT him, not by him'],
  // AND THE POSITIVES FOR THE TIGHTENED PATTERNS, so the fix above is not just an exclusion. A
  // guard that only ever refuses is a counter that reports zero.
  ['"Eleven crowns," said Aldis Fen.', { spoke: true, about: true },
   'verb before the name — the inverted attribution the old pair could not see at all'],
  ['"Eleven crowns," Aldis quietly said.', { spoke: true },
   'one adverb between the name and the verb is still his line'],
  ['"Eleven crowns," Aldis Fen said.', { spoke: true }, 'full name, plainest form'],
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

/** F53. Two OUTDIRs rather than two arm letters, because both arms are the same story.
 *
 *  The treatment is a server flag — `ANANSI_PROSE_AUTHOR=1` marks the writer's own passages in the
 *  recent-prose block — so the arms cannot be told apart by which fixture they read. They are told
 *  apart by which server answered, which means each writes to its own directory:
 *
 *    ANANSI_URL=…:5301 ANANSI_OUT=/tmp/f53-ctl  node … bench/lockout.ts D 650 &   # flag off
 *    ANANSI_URL=…:5302 ANANSI_OUT=/tmp/f53-trt  node … bench/lockout.ts D 650 &   # flag on
 *    F53_CTL=/tmp/f53-ctl F53_TRT=/tmp/f53-trt  node … bench/lockout.ts f53
 *
 *  VERIFY THE TREATMENT THROUGH POST /api/manifest BEFORE GENERATING, the way F52 did — the whole
 *  comparison is void if both servers were sending the same prompt, and nothing downstream of here
 *  could tell.
 *
 *  Every p-value comes from `bench/stats.ts`, which takes COUNTS. F52's recorded error was a p
 *  computed from its own rounded printed densities: 0.047 rather than the true 0.072, either side
 *  of the line that decides what ships.
 */
if (arm === 'f53') {
  const { fisher, poisson, per1000 } = await import('./stats.ts');
  // LABELS FROM THE ENVIRONMENT, because this mode is not F53's alone. F54 compares the same story
  // under two WORDINGS of the lockout line ("their" against the name), and a report headed
  // "no marker / marked" would describe the wrong experiment while printing the right numbers —
  // which is the shape of every mislabelled finding this project has had to correct.
  const dirs: [string, string][] = [
    [process.env.ARM_A ?? 'no marker', process.env.F53_CTL ?? '/tmp/f53-ctl'],
    [process.env.ARM_B ?? 'marked', process.env.F53_TRT ?? '/tmp/f53-trt'],
  ];
  const arms = dirs.map(([label, dir]) => {
    const all = readFileSync(`${dir}/D.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    // RE-SCORED from the stored prose, never from the fields written at generation time — the same
    // rule `report` follows, and for the same reason: the detectors have been wrong twice and both
    // fixes landed after a run.
    const rows = all.filter((r: any) => !r.error && r.prose)
      .map((r: any) => ({ ...r, ...score(String(r.prose)), d: density(String(r.prose)) }));
    const t = rows.reduce((a: any, r: any) => ({
      words: a.words + r.d.words, names: a.names + r.d.names,
      acts: a.acts + r.d.acts, pronouns: a.pronouns + r.d.pronouns,
      he: a.he + r.d.he, him: a.him + r.d.him, hisPoss: a.hisPoss + r.d.hisPoss,
    }), { words: 0, names: 0, acts: 0, pronouns: 0, he: 0, him: 0, hisPoss: 0 });
    const about = rows.filter((r: any) => r.about);
    return { label, dir, errors: all.length - rows.length, n: all.length, rows, t, about,
             acted: about.filter((r: any) => r.acted).length,
             spoke: about.filter((r: any) => r.spoke).length,
             told: about.filter((r: any) => r.told).length };
  });
  const [c, m] = arms;

  console.log(`\n  ${process.env.ARM_TITLE ?? "F53 — does marking the writer's own passages stop the "
    + 'model writing the locked character?'}`);
  console.log(`  Arm D on both sides: the writer has already written him speaking and acting,`);
  console.log(`  which is F51's case.\n`);
  for (const a of arms) {
    console.log(`  ${a.label.padEnd(10)} ${a.rows.length} usable of ${a.n}`
      + `${a.errors ? ` (${a.errors} errored)` : ''}, ${a.t.words} words of narration`);
  }
  // THE INFORMATIVE DENOMINATOR IS NOT COMPARABLE HERE AND F51 IS WHY — the treatment can move how
  // often he is named at all, so the binary rate sits on a denominator the treatment shifts. It is
  // printed because F51 and F52 both print it; the density rows are what can be compared.
  console.log(`\n  DENSITY — per 1,000 words of narration. This is the comparable metric.`);
  const row = (what: string, k1: number, k2: number) => {
    const p = poisson(k1, c.t.words, k2, m.t.words);
    console.log(`    ${what.padEnd(14)} ${per1000(k1, c.t.words).padStart(6)} `
      + `-> ${per1000(k2, m.t.words).padStart(6)}   (${k1} vs ${k2} events)   p = ${p.toFixed(4)}`
      + `${p < 0.05 ? '  *' : ''}`);
  };
  row('his action', c.t.acts, m.t.acts);
  row('his name', c.t.names, m.t.names);
  row('he/him/his', c.t.pronouns, m.t.pronouns);

  /* AND THE ONE THAT SEPARATES TWO DIFFERENT WINS, which the three rows above cannot.
   *
   * Every counter here is anchored on his NAME (see the note on NAME: a pronoun's referent cannot
   * be resolved by a regex, and this model re-genders the other characters). So if a treatment
   * makes the model write his name less often, action-per-1,000-WORDS falls whether or not he acts
   * less — the detector had fewer places it could fire. That is F51's denominator problem arriving
   * inside the metric F52 introduced to escape it.
   *
   * Action per NAME MENTION is the discriminator:
   *   - it FALLS  -> when he is on the page, he acts less. The lockout got stronger.
   *   - it HOLDS  -> he simply gets named less. The defect is unchanged and the win is cosmetic;
   *                  worse, a flat pronoun density means he is just as present, only less nameable.
   * Read this row together with he/him/his. */
  console.log(`\n  WHERE HE SITS IN THE SENTENCE — the split that says which of two stories this is.`);
  row('subject "he"', c.t.he, m.t.he);
  row('object "him"', c.t.him, m.t.him);
  row('possessive', c.t.hisPoss, m.t.hisPoss);
  {
    // The subject slot is the only place an action can live, so name + bare "he" is the exposure
    // the action count should be read against — not total words, and not total pronouns.
    const cs = c.t.names + c.t.he, ms = m.t.names + m.t.he;
    row('SUBJECT SLOT', cs, ms);
    const p = poisson(c.t.acts, Math.max(cs, 1), m.t.acts, Math.max(ms, 1));
    const r = (k: number, d: number) => d ? (k / d * 100).toFixed(1) + '%' : 'n/a';
    console.log(`\n    his action per subject-slot mention  ${r(c.t.acts, cs).padStart(6)} `
      + `-> ${r(m.t.acts, ms).padStart(6)}   (${c.t.acts}/${cs} vs ${m.t.acts}/${ms})`
      + `   p = ${p.toFixed(4)}${p < 0.05 ? '  *' : ''}`);
    console.log(`    ^ FALLS  = when he is the subject, he does fewer things. A behaviour change.`);
    console.log(`      HOLDS  = he is the subject half as often, and does the same things in it.`);
    console.log(`               The action count still halves; the mechanism is agency, not verbs.`);
  }
  console.log(`\n  BINARY — of the runs that name him in narration. Denominator moves; read with care.`);
  const bin = (what: string, k1: number, k2: number) => {
    const p = fisher(k1, c.about.length - k1, k2, m.about.length - k2);
    const pc = (k: number, d: number) => d ? `${(k / d * 100).toFixed(1)}%` : 'n/a';
    console.log(`    ${what.padEnd(14)} ${pc(k1, c.about.length).padStart(6)} `
      + `-> ${pc(k2, m.about.length).padStart(6)}   (${k1}/${c.about.length} vs ${k2}/${m.about.length})`
      + `   p = ${p.toFixed(4)}${p < 0.05 ? '  *' : ''}`);
  };
  bin('acted', c.acted, m.acted);
  bin('spoke', c.spoke, m.spoke);
  bin('told', c.told, m.told);
  console.log(`\n    names him at all  ${c.about.length}/${c.rows.length} -> ${m.about.length}/${m.rows.length}`
    + `   p = ${fisher(c.about.length, c.rows.length - c.about.length,
                       m.about.length, m.rows.length - m.about.length).toFixed(4)}`);
  // A LEAK CHECK, and F35 is why it is here: give this model new vocabulary and it turns it into
  // section headers. The marker must never appear in the output it is meant to explain.
  const leak = (a: any) => a.rows.filter((r: any) => /writer's own|not yours/i.test(String(r.prose))).length;
  console.log(`\n  MARKER LEAK into the prose (F35's warning): `
    + `${leak(c)} of ${c.rows.length} unmarked, ${leak(m)} of ${m.rows.length} marked`);
  console.log(`\n  Every rate is a FLOOR — the counters are anchored on his name, never a pronoun,`);
  console.log(`  and they undercount equally in both arms. Say "under X%".\n`);
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
