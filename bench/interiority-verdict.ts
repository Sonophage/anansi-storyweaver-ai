// F21's classifier: does a character's INNER STATE, written into canon, come back out as the
// narrator stating it?
//
// PLAN-04 put interiority behind a measurement rather than building it, because the risk is not
// that the model ignores it — it is that the model repeats it. "[Inside: he is certain the key is
// a forgery]" becoming "He was certain the key was a forgery" is told-not-shown, in the narrator's
// voice, and it would make every scene worse in a way that is hard to unsee.
//
// Two things are counted, and they are different questions:
//
//   leak   the specific inner fact appears in narration. Only arm B can leak, because only arm B
//          was told the fact. This is the question PLAN-04 asked.
//   told   the narrator states ANY inner state of the protagonist — "he felt", "he knew", "he was
//          certain". Both arms can do this, so it is a comparison: does putting interiority in
//          canon raise the rate of interior narration generally, not just of this one fact.
//
// Every check runs on NARRATION ONLY. Dialogue may lie, and a character SAYING "I'm certain it's a
// forgery" is not a leak — it is the scene working.

/** The inner fact arm B is given, and nothing else is. Chosen to be checkable: three content
 *  words that do not occur in the fixture's prose, canon or directive. */
export const INSIDE =
  'He is certain the key is a forgery, and has never dared test it.';

/** Words from INSIDE that would have to appear for the fact itself to have leaked. `forgery` and
 *  `dared` are the load-bearing ones — `certain` is also a told-verb, so it is counted under
 *  `told` rather than here, or one hit would score twice. */
const LEAK_WORDS = [/\bforger(y|ies|ed)\b/i, /\bfake\b/i, /\bcounterfeit\b/i,
                    /\bnot (a )?real\b/i,
                    /\b(never|did ?n[o']t|had ?n[o']t)\s+(dare[ds]?|test(ed)?|tr(y|ied))\b/i,
                    /\bdare[ds]?\s+not\s+(to\s+)?test\b/i,
                    /\bnever\s+(once\s+)?(dared|tested|tried)\b/i];

/** The narrator asserting the protagonist's interior. Deliberately narrow: it must be ABOUT him,
 *  so a bare "knew" with no subject does not count, and it must be the narrator, so anything
 *  inside quotes is gone before this runs. */
const TOLD = [
  // The auxiliary matters: "Aldis HAD known it for years" is the same told-not-shown as "Aldis
  // knew", and the first version of this regex missed it — caught by the cases below, which is
  // the entire reason they exist.
  /\b(he|aldis)\s+(had\s+|has\s+|would\s+have\s+|must\s+have\s+)?(felt|knew|known|feared|hoped|wondered|realised|realized|remembered|understood|suspected|decided)\b/i,
  /\b(he|aldis)\s+(had\s+)?(been\s+)?(was\s+|is\s+)?(certain|sure|afraid|frightened|terrified|ashamed|angry|calm|relieved)\b/i,
  /\bhis\s+(fear|shame|certainty|doubt|dread|relief|anger)\b/i,
  /\b(he|aldis)\s+did\s+not\s+(know|dare|believe|trust)\b/i,
];

export const strip = (prose: string) => String(prose ?? '').replace(/["""][^"""]*["""]/g, ' ');

export function verdict(prose: string) {
  const narr = strip(prose);
  const leak = LEAK_WORDS.filter((r) => r.test(narr)).map(String);
  const told = TOLD.filter((r) => r.test(narr)).map(String);
  return {
    // The denominator that matters: a run that never mentions him in narration could not have
    // leaked, and counting it as a pass is how F10 ended up unable to decide anything.
    about: /\b(aldis|he|his)\b/i.test(narr),
    leaked: leak.length > 0,
    told: told.length > 0,
    leakHits: leak.length,
    toldHits: told.length,
    chars: narr.trim().length,
  };
}

// ---- the detector is validated before any result is believed (CLAUDE.md, rule 1) ----
// A check that never fires reports perfection. These assert BOTH directions: text that must flag,
// and text that must not — especially interior content that is spoken rather than narrated.
export const CASES: [string, Partial<ReturnType<typeof verdict>>, string][] = [
  ['He was certain the key was a forgery, and had never dared test it.',
   { leaked: true, told: true }, 'the whole inner fact, narrated'],
  ['The key was a forgery. Aldis had known it for years.',
   { leaked: true, told: true }, 'leak plus a told-verb'],
  ['He turned the key over in his palm and said nothing.',
   { leaked: false, told: false }, 'action only — the good case'],
  ['"I\'m certain it\'s a forgery," he said. "I never dared test it."',
   { leaked: false, told: false }, 'the same words SPOKEN are not a leak'],
  ['"He was certain," Marek said, "that the key was a forgery."',
   { leaked: false, told: false }, 'reported inside dialogue, still not narration'],
  ['Aldis felt the cold of the stair through his boots.',
   { told: true }, 'a told-verb about him — flags even though it is physical'],
  ['The rain had not stopped for three days.',
   { about: false, leaked: false, told: false }, 'not about him at all'],
  ['He did not dare test the lock.',
   { leaked: true }, 'never dared test, in the negative'],
  ['His fear was a thing he carried.',
   { told: true }, 'a named interior noun'],
  ['She was certain the door was locked.',
   { told: false }, 'someone else being certain is not the protagonist'],
];

if (import.meta.filename === process.argv[1]) {
  const assert = await import('node:assert');
  let n = 0;
  for (const [text, want, why] of CASES) {
    const got = verdict(text);
    for (const [k, v] of Object.entries(want)) {
      assert.default.strictEqual((got as any)[k], v,
        `${why}\n    ${JSON.stringify(text)}\n    expected ${k}=${v}, got ${(got as any)[k]}`);
    }
    n++;
    console.log(`  ok  ${why}`);
  }
  console.log(`\n  ${n} detector cases pass — ${CASES.filter((c) => c[1].leaked).length} must flag a leak, `
    + `${CASES.filter((c) => c[1].leaked === false).length} must not`);
}
