// COUNCIL-06 §5 item 2 — ONE BASE-RATE RUN, NO PROMPT CHANGE. Four counters at once, on a scene
// with three characters in it.
//
// This measures HEADROOM, NOT EFFECT. Nothing is compared, nothing is changed, and no arm exists.
// The only question is how much room each counter has, so that a counter with under ~10 points of
// room is killed before anyone spends 100 generations per arm on it (COUNCIL-06 §5.3).
//
//   node --experimental-strip-types bench/council06.ts check      # the detectors, no model
//   node --experimental-strip-types bench/council06.ts falsify    # break each one on purpose
//   node --experimental-strip-types bench/council06.ts setup      # build the fixture story
//   node --experimental-strip-types bench/council06.ts run 60     # ONE REQUEST IN FLIGHT AT A TIME
//   node --experimental-strip-types bench/council06.ts report
//
// STRICTLY SEQUENTIAL, and that is not politeness. The router is `parallel = 2`, `kv_unified`, and
// oversubscribing the shared cache does not queue — both requests die with HTTP 500. One slot stays
// free for whoever is writing in the live app.
//
// NOTHING SETS A SEED. This is one arm run once; it is not reproducible and it is not controlled.
// Only arms run SIMULTANEOUSLY are (bench/ab.ts), and there is no second arm here.
//
// THE FIXTURE CARRIES NO `persona` AND NO `lockedCharacter`, AND THAT IS THE MEASUREMENT.
// `src/context.ts:902` (COUNCIL-06 ship 1, commit 3cb65c6) already puts the non-POV interiority
// firewall into DIRECTIVE for any first- or second-person book that names a teller:
//   "Never state what anyone but {teller} thinks, feels or intends; where {teller} can only guess,
//    write the guess as a guess."
// A fixture with a persona would therefore measure the rule WITH the firewall on, which is arm B,
// not a base rate. Verify before believing any number here:
//   node --experimental-strip-types bench/prompts.ts <story-id> --full | grep -i "thinks, feels"
// must print nothing.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { narrationOnly } from '../src/context.ts';

// 5240 AND NOT 5188. `test/scope.ts` boots throwaway servers on 5187, 5188, 5189, 5190, 5194 and
// 5195; a scratch server sitting on any of them answers one of its ownership assertions 200 where
// it expects 403, and the suite reports a false gate failure in whichever tree is running it.
// 5174 is the live server under systemd and 5179 is `test/ui/run.sh`. This is well clear of all of
// them. ponytail: A FIXED PORT, like every other harness here. Ceiling: two of these at once
// collide, exactly as this one collided with scope.ts. Upgrade path when that happens: bind 0 and
// print the port, which is a bigger change than any harness in bench/ has needed yet.
const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5240';
const OUTDIR = process.env.ANANSI_OUT ?? '/tmp/anansi-council06';
const TITLE = 'C06 base rate';

// The two non-POV characters. The viewpoint is second person — the shipped `DEFAULT_VOICE` is
// "Second person, present tense" (until 2026-10-27; since then the voice names no POV) and this story
// sets no `pov`, so `db.createStory` gives it second person. So "you" is the viewpoint and EVERY named character is non-POV by
// construction, which is why a name anchor works here where it could not in bench/lockout.ts.
const NPOV = String.raw`(?:Machek|Solveig)`;

// One beat, three mouths, and NOTHING about how the scene ends. Counter 3 counts closings the
// writer did not ask for, so a directive that said "nobody leaves" would be the writer asking.
const DIRECTIVE = 'Machek asks Solveig what she told the harbourmaster, and you cut in before she '
  + 'finishes. All three of you are talking.';

// ---------------------------------------------------------------------------------------------
// THE DETECTORS
//
// Held in one mutable table so `falsify` can blank each one on purpose and watch the specific
// assertion go red (CLAUDE.md: "break the code on purpose, or it is decorative").
// ---------------------------------------------------------------------------------------------

const AUX = String.raw`(?:had\s+|has\s+|have\s+|would\s+have\s+|must\s+have\s+|already\s+|still\s+|never\s+|does\s+not\s+|did\s+not\s+|doesn['’]t\s+|didn['’]t\s+)*`;
const INNER_VERB = ['felt', 'feels', 'knew', 'knows', 'known', 'feared', 'fears', 'hoped', 'hopes',
  'wondered', 'wonders', 'realised', 'realises', 'realized', 'realizes', 'remembered', 'remembers',
  'understood', 'understands', 'suspected', 'suspects', 'decided', 'decides', 'wanted', 'wants',
  'meant', 'means', 'believed', 'believes', 'regretted', 'regrets', 'resented', 'resents',
  'hated', 'hates', 'loved', 'loves', 'thought', 'thinks', 'doubted', 'doubts',
  'expected', 'expects', 'intended', 'intends'].join('|');
const INNER_ADJ = ['certain', 'sure', 'afraid', 'frightened', 'terrified', 'ashamed', 'angry',
  'furious', 'calm', 'relieved', 'glad', 'sorry', 'embarrassed', 'frustrated', 'uneasy',
  'grateful', 'jealous', 'guilty'].join('|');
const INNER_NOUN = ['fear', 'shame', 'certainty', 'doubt', 'dread', 'relief', 'anger', 'rage',
  'guilt', 'grief', 'hope', 'regret', 'resentment', 'contempt', 'panic', 'unease'].join('|');

// NOTE WHAT IS NOT IN THE VERB LIST: `seems`, `seemed`, `looks`, `looked`, `appears`.
// "She looked like a woman who had rehearsed this" and "Machek seems certain" are what the rule
// PERMITS — the guess written as a guess. A detector that flagged those would make the rule
// unmeasurable, because its entire permission set is the guess (COUNCIL-06 §6). Excluding them
// also means an asserted interior dressed as an observation is invisible here, so counter 1 is a
// FLOOR twice over.
const T = {
  // Anchored on the NAME. Unambiguous, and it undercounts — the model refers to these two by
  // pronoun most of the time — so every rate off this is a FLOOR. Say "under X%", never "X%".
  toldNamed: [
    new RegExp(String.raw`\b${NPOV}\s+${AUX}(?:${INNER_VERB})\b`, 'i'),
    new RegExp(String.raw`\b${NPOV}\s+${AUX}(?:is|was)\s+${AUX}(?:${INNER_ADJ})\b`, 'i'),
    new RegExp(String.raw`\b${NPOV}['’]s\s+(?:own\s+)?(?:${INNER_NOUN})\b`, 'i'),
  ],
  // The same shapes on a third-person pronoun. In SECOND PERSON these cannot be the viewpoint —
  // "you" is — so `he|she|they|his|her|their` can only be a non-POV character. That holds only
  // while the narration really is second person, which is why `povDrift` below is counted rather
  // than assumed.
  toldPron: [
    new RegExp(String.raw`\b(?:he|she|they)\s+${AUX}(?:${INNER_VERB})\b`, 'i'),
    new RegExp(String.raw`\b(?:he|she|they)\s+${AUX}(?:is|was|are|were)\s+${AUX}(?:${INNER_ADJ})\b`, 'i'),
    new RegExp(String.raw`\b(?:his|her|their)\s+(?:own\s+)?(?:${INNER_NOUN})\b`, 'i'),
  ],

  // Counter 3, in two scopes. A door can shut in the second-to-last sentence; a cadence line is
  // the LAST one by definition, and scoping it to the paragraph flagged "The room is quiet, and
  // then Machek starts again" — an open ending, not a closed one.
  closePara: [
    /\bdoor\b[^.!?]{0,40}\b(?:clos\w+|shut\w*|latch\w*|swings? to|behind (?:him|her|them|you))\b/i,
    /\b(?:clos\w+|shut\w*|pulls?|pulled|pushes?|pushed)\b[^.!?]{0,20}\bdoor\b/i,
    /\b(?:walks?|walked|steps?|stepped|goes|went|heads?|headed)\s+(?:out|away)\b/i,
    // A PERSON gone, not a thing. Bare "is gone" flagged run #18's "the matchbox is gone" as a
    // scene closing, which is the object counter's business and not this one. Found by reading
    // all three of the live flags rather than by adding a case, which is why they were read.
    new RegExp(String.raw`\b(?:he|she|they|${NPOV})\s+(?:is|are|was|were)\s+gone\b`, 'i'),
    /\b(?:leaves?|left)\s+the room\b/i,
    /\bfootsteps?\b[^.!?]{0,30}\b(?:fade\w*|recede\w*|gone)\b/i,
    /\b(?:the\s+)?(?:light|lamp|lantern)s?\b[^.!?]{0,20}\b(?:goes?|go|went|gutters?|guttered)\s+out\b/i,
  ],
  // ANCHORED AT THE END OF THE SENTENCE, not merely inside it. Unanchored, "The room is quiet, and
  // then Machek starts again" flagged — an open ending read as a closed one. A cadence line is the
  // last thing in the sentence or it is not a cadence line.
  closeSent: [
    String.raw`nothing (?:more|else) (?:is|was) said`,
    String.raw`(?:nobody|no one|no-one)\s+(?:says?|said|speaks?|spoke)\s+(?:anything\s+)?(?:else|again|more)`,
    String.raw`that (?:is|was) that`,
    String.raw`the room\b[^.!?]{0,20}\b(?:is|was|goes|went|falls?|fell)\s+(?:very\s+)?(?:quiet|still|silent)`,
    String.raw`and (?:then )?(?:there )?(?:is|was)\s+(?:only\s+)?silence`,
  ].map((x) => new RegExp(String.raw`\b` + x + String.raw`[^.!?]{0,12}[.!?\u2026]?["\u201d)]?\s*$`, 'i')),
  // A chapter ending in the middle of a chapter. Anywhere in the prose, not just the tail.
  chapter: [
    /(?:^|\n)\s*(?:\*\s*\*\s*\*|#{1,4}\s|- - -|—\s*—\s*—)/,
    // A LINE OF ITS OWN. Unanchored, `\bthe end\b` flagged "to bite the end off" and "the end of
    // her sentence" — two of the three live flags on this counter were this one pattern.
    /(?:^|\n)\s*(?:the end|end of chapter)\b[^\n]{0,24}$/i,
    /(?:^|\n)\s*chapter\s+(?:\w+)\b/i,
  ],

  // Counter 2. RAW, never through `narrationOnly` — the strip eats the quoted span and leaves the
  // tag behind, which is the thing being counted (COUNCIL-06 §6).
  // `says?` and not `says`: the shipped DEFAULT_VOICE is PRESENT TENSE, so the said-tag in this
  // book is "you say" as often as "she said". A past-tense-only tag list would have scored the
  // second-person present-tense lines as untagged and reported a said-share that is not the book's.
  speech: new RegExp(String.raw`\b(?:said|says?|asks?|asked|replies|replied|answers?|answered|tells?`
    + String.raw`|told|adds?|added|murmurs?|murmured|mutters?|muttered|whispers?|whispered|snaps?`
    + String.raw`|snapped|offers?|offered|breathes?|breathed|growls?|growled|cuts? in|cut in`
    + String.raw`|puts? in|put in|calls?|called|repeats?|repeated|insists?|insisted`
    // WIDENED DELIBERATELY, AND IT MOVES THE ANSWER THE UNCOMFORTABLE WAY. `said` is on this list
    // by construction, so every utterance verb missing from it inflates `said / every tag` — which
    // is the direction that would make counter 2 look dead when it is not. These are the tags this
    // model actually reaches for instead of `said`.
    + String.raw`|begins|began|continues|continued|goes on|went on|admits|admitted|agrees|agreed`
    + String.raw`|warns|warned|snorts|snorted|sighs|sighed|laughs|laughed|hisses|hissed|barks`
    + String.raw`|barked|interrupts|interrupted|counters|countered|corrects|corrected)\b`, 'i'),
  saidTag: /\b(?:said|says?)\b/i,
  speaker: new RegExp(String.raw`\b(Machek|Solveig|you)\b`, 'i'),

  // Counter 4. Each object has a RIGHT ANSWER in canon or in the writer's own last passage, the
  // same shape bench/quality-fixture.ts uses — a rubric asking "is this continuous?" scores the
  // judge; asking "canon says the ledger is in the harbourmaster's safe, is it on the table?"
  // scores the model. `ok` rescues a mention that names the constraint, so acknowledging the
  // absence is never a failure.
  obj: {
    // TELEPORT. Locked in a safe nobody in the room can open.
    ledger: {
      seen: /\bledger\b/i,
      bad: [
        /\b(?:opens?|opened|pushes?|pushed|slides?|slid|sets?|set|puts?|put|picks?\s+up|picked\s+up|takes?|took|holds?|held|thumbs?|thumbed|flips?|flipped|drops?|dropped|hands?|handed|lifts?|lifted|pulls?|pulled)\b[^.!?]{0,30}\bledger\b/i,
        /\bledger\b[^.!?]{0,40}\b(?:on the table|open on|between (?:you|us|them)|in (?:his|her|your|their) hands?|across the table|out of (?:his|her|your|their) (?:coat|bag|case))\b/i,
      ],
      // The rescue reads BOTH WAYS and 80 characters back, because the constraint is as often
      // named before the object as after it. At 40 it missed run #12's "expecting the harbourmaster
      // to burst through it, soaked and furious, carrying the ledger in his hands" by thirteen
      // characters and scored a hypothetical about the man who HAS the ledger as a teleport.
      ok: /\bledger\b[^.!?]{0,60}\b(?:safe|locked|harbourmaster|gone|not here|still in|away|since tuesday)\b|\b(?:safe|locked|harbourmaster|as if|expecting)\b[^.!?]{0,80}\bledger\b/i,
    },
    // TELEPORT, the writer's own last passage: the coat is on the hook by the door.
    coat: {
      seen: /\b(?:his|machek['’]s)\s+coat\b|\bthe coat\b/i,
      bad: [
        /\b(?:his|machek['’]s|the)\s+coat\b[^.!?]{0,25}\b(?:pocket|sleeve|collar|lapel|lining)\b/i,
        /\b(?:reaches?|reached|digs?|dug|feels?|felt|shrugs?|shrugged|pulls?|pulled|buttons?|buttoned|straightens?|straightened|shakes?|shook)\b[^.!?]{0,25}\b(?:his|machek['’]s|the)\s+coat\b/i,
        /\b(?:wears?|wearing|wore|in)\s+(?:his|machek['’]s)\s+coat\b/i,
      ],
      ok: /\bcoat\b[^.!?]{0,45}\b(?:hook|by the door|hanging|hangs|hung|on the wall|where it hangs)\b|\b(?:hook|hanging|hangs|hung)\b[^.!?]{0,25}\bcoat\b/i,
    },
    // VANISHED, and reintroduced by inventory: gone through the grating on the quay.
    lighter: {
      seen: /\blighter\b/i,
      bad: [
        /\b(?:lights?|lit|flicks?|flicked|thumbs?|thumbed|snaps?|snapped|strikes?|struck|holds?|held|produces?|produced|takes?|took|pulls?|pulled|offers?|offered)\b[^.!?]{0,25}\blighter\b/i,
        /\blighter\b[^.!?]{0,30}\b(?:flares?|flared|catches|caught|sparks?|sparked|in (?:his|her|your|their) hand|from (?:his|her) pocket)\b/i,
      ],
      // Both ways, for the same reason: run #41's "the metallic scent of the grating that took his
      // lighter" names the loss BEFORE the object, and a forward-only rescue read it as the lighter
      // being taken out and used.
      ok: /\blighter\b[^.!?]{0,55}\b(?:gone|lost|dropped|grating|quay|no lighter|hasn['’]t|has not|does not have|doesn['’]t have|borrow\w*|match\w*)\b|\b(?:gone|lost|dropped|grating|quay|empty|missing|used to be|borrow\w*)\b[^.!?]{0,60}\blighter\b|\b(?:no|without a)\s+lighter\b/i,
    },
  } as Record<string, { seen: RegExp; bad: RegExp[]; ok: RegExp }>,

  // THE CEILING GUARD (COUNCIL-06 §6, trap 1). `narrationOnly` strips only `"` and U+201C/U+201D.
  // ponytail: THE FIXTURE IS SCOPED TO DOUBLE-QUOTED DIALOGUE RATHER THAN THE STRIP BEING TAUGHT
  // A SECOND GRAMMAR. Ceiling: a book written with `'…'` or em-dash dialogue is not covered by any
  // number here, and single-quote stripping is not a small change — `'` is also the apostrophe, so
  // a greedy pair eats the narration between two contractions. TRIGGER: this guard reporting a
  // non-zero count, or a live book using either grammar. Upgrade path when it fires: pair `'` only
  // where the opener is preceded by whitespace and followed by a capital, and score em-dash books
  // line-wise instead of span-wise.
  // A book whose dialogue is single-quoted or em-dash-led survives the strip whole and every such
  // line then reads as narration. The fixture is SCOPED — its prose and its seed passages use
  // double quotes — so rather than teaching the strip a second grammar, this counts how many runs
  // came back in a grammar the strip cannot see. That count IS the ceiling, and it is reported.
  odd: [/(?:^|\n)\s*[‘'][A-Z]/, /(?:^|\n)\s*(?:—|--)\s*[A-Z]/],
};

const lastPara = (p: string) => {
  const parts = String(p ?? '').trim().split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  return parts.at(-1) ?? '';
};
const lastSent = (p: string) => {
  const parts = lastPara(p).split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
  return parts.at(-1) ?? '';
};

/** Counter 2, on the RAW text.
 *
 *  TAGS ARE COUNTED, NEVER ASSIGNED TO A LINE. The share the counter asks for is a ratio of tags,
 *  and deciding which line owns *"Machek laughs, a dry rattling sound."* is a problem this does
 *  not have to solve. The first version tried: it split the gap between two lines at the first
 *  full stop and handed the halves to either side, which put an action beat on the wrong line and
 *  dropped the tag. Counting the gaps instead has no assignment to get wrong. */
function crowd(raw: string) {
  const s = String(raw ?? '');
  const spans = [...s.matchAll(/["“][^"”]{2,}["”]/g)];
  const n = spans.length;
  // The n+1 stretches of text BETWEEN the quoted lines. Every tag lives in one of them, and no
  // dialogue does — which is what "score crowd attribution RAW" means in practice (COUNCIL-06 §6):
  // `narrationOnly` would eat the span and leave the tag, and here the span is what is dropped.
  const gaps: string[] = [];
  let prev = 0;
  for (const m of spans) { gaps.push(s.slice(prev, m.index!)); prev = m.index! + m[0].length; }
  gaps.push(s.slice(prev));

  const g = (r: RegExp) => new RegExp(r.source, 'gi');   // built from T so `falsify` still bites
  const all = gaps.join('\n');
  const tags = (all.match(g(T.speech)) ?? []).length;
  const saidTags = (all.match(g(T.saidTag)) ?? []).length;

  // A NAME IS A SPEAKER ONLY WHERE A SPEECH VERB SITS IN THE SAME GAP. Counting every name in
  // narration would have made "you" a speaker in every second-person run and the gate meaningless.
  // This undercounts a crowd whose third voice is never tagged, so the DENOMINATOR IS A FLOOR too.
  const tagged = gaps.map((x) => T.speech.test(x));
  const speakers = new Set<string>();
  gaps.forEach((x, i) => { if (tagged[i]) for (const m of x.matchAll(g(T.speaker))) speakers.add(m[0].toLowerCase()); });

  // A line is bare when NEITHER the gap before it nor the gap after it carries a tag. One tag may
  // serve both its neighbours, which undercounts bare lines — again the conservative direction.
  let run = 0, maxBare = 0;
  for (let i = 0; i < n; i++) {
    if (tagged[i] || tagged[i + 1]) run = 0; else { run++; maxBare = Math.max(maxBare, run); }
  }
  return {
    lines: n, tags, saidTags,
    // The informative denominator (F10). The counter is "the `said`-tagged share WHEN THREE OR MORE
    // SPEAKERS ARE ACTIVE" — a run with two speakers could not have failed it and must not sit in
    // the denominator as a pass. Speakers are counted only where a name or "you" sits beside the
    // line, so this is a floor too: a run whose third speaker is only ever "he" is excluded.
    speakers: speakers.size,
    three: speakers.size >= 3,
    // COUNCIL-06 §2 kept the crowd rule as a floor rather than a ban: never two consecutive
    // unattributed lines when three or more are speaking. That is the rule an A/B would test, so
    // it is counted here alongside the share the brief asked for.
    twoBare: maxBare >= 2,
  };
}

export function score(prose: string) {
  const raw = String(prose ?? '');
  const narr = narrationOnly(raw);
  const para = lastPara(raw), sent = lastSent(raw);
  const objs: Record<string, { seen: boolean; bad: boolean }> = {};
  for (const [k, o] of Object.entries(T.obj))
    objs[k] = { seen: o.seen.test(narr), bad: o.bad.some((r) => r.test(narr)) && !o.ok.test(narr) };
  // THE GUESS FRAME IS THE RULE'S ENTIRE PERMISSION SET (COUNCIL-06 §6), so it is removed before
  // the told tests run rather than hoped against. Excluding `seems` and `looked` from the verb
  // lists was not enough: run #17 of the base rate flagged on "as if she is reading a line from a
  // script she hates", where `she hates` sits INSIDE the guess. The clause is cut at the sentence
  // end, so an assertion in the next sentence still counts.
  const guessless = narr.replace(/\b(?:as if|as though|like (?:a|an|the|someone|somebody))\b[^.!?]*/gi, ' ');
  const named = T.toldNamed.some((r) => r.test(guessless));
  return {
    // Counter 1's informative denominator: a run that never NAMES a non-POV character in narration
    // could not have been counted by the name anchor.
    about: new RegExp(NPOV, 'i').test(narr),
    toldNamed: named,
    toldPron: named || T.toldPron.some((r) => r.test(guessless)),
    // The guard on `toldPron`, asserted rather than assumed: if the narration is not second person
    // then he/she/his/her may be the viewpoint and the pronoun-inclusive count is inflated.
    povDrift: !/\byou\b/i.test(narr),
    ...crowd(raw),
    closed: T.closePara.some((r) => r.test(para)) || T.closeSent.some((r) => r.test(sent))
      || T.chapter.some((r) => r.test(raw)),
    obj: objs,
    objSeen: Object.values(objs).some((o) => o.seen),
    objBad: Object.values(objs).some((o) => o.bad),
    // The ceiling on `narrationOnly` (trap 1), counted per run rather than argued about.
    oddDialogue: T.odd.some((r) => r.test(raw)),
    // THE SECOND HOLE IN `narrationOnly`, AND COUNCIL-06 §6 DOES NOT NAME THIS ONE.
    // A generation that hits the token ceiling stops mid-line, leaving an opening quote with no
    // partner. `narrationOnly` pairs greedily from the left, so from that quote to the end of the
    // passage EVERY WORD OF DIALOGUE READS AS NARRATION. Run #2 of this very run scored a non-POV
    // interiority hit on `"He knows we haven't signed the last three entries` — a line one
    // character says to another. Counted, not argued about; every narration-only counter here is a
    // CEILING on these runs, and the report prints counter 1 with them and without them.
    unclosed: ((raw.match(/["“”]/g) ?? []).length % 2) === 1,
    chars: narr.trim().length,
  };
}

// ---------------------------------------------------------------------------------------------
// THE DETECTORS ARE VALIDATED BEFORE ANY RESULT IS BELIEVED (CLAUDE.md, F17)
//
// BOTH DIRECTIONS. A check that never fires reports perfection; one that always fires reports
// disaster. The awkward cases are the point of the list, and four of them are COUNCIL-06 §6's
// named traps written out as assertions.
// ---------------------------------------------------------------------------------------------
type Want = Partial<Omit<ReturnType<typeof score>, 'obj'>> & { objBadKey?: string };
const CASES: [string, Want, string][] = [
  // ---- counter 1: non-POV interiority ----
  ['Machek knows what she means.', { toldNamed: true, about: true }, 'plainest non-POV told'],
  ['Machek had decided hours ago.', { toldNamed: true },
   'AUXILIARY MUST FLAG — F21 missed exactly this shape until a case caught it (COUNCIL-06 §6)'],
  ['Solveig has known since Tuesday.', { toldNamed: true }, 'present-perfect auxiliary'],
  ['Solveig is certain the harbourmaster already has it.', { toldNamed: true }, 'an interior adjective'],
  ['Machek\'s contempt sits on the table between you.', { toldNamed: true }, 'a named interior noun'],
  ['She looked like a woman who had rehearsed this.',
   { toldNamed: false, toldPron: false },
   'THE GUESS FRAME MUST NOT FLAG (COUNCIL-06 §6) — this is what the rule PERMITS, and a detector '
   + 'that flags it makes the rule unmeasurable, because its whole permission set is the guess'],
  ['Machek seems certain, and you have been wrong about him before.',
   { toldNamed: false }, 'a hedge is an observation, not an assertion — and this is why counter 1 is a floor'],
  ['Machek looks like a man who has already decided.',
   { toldNamed: false }, 'the guess frame again, with the verb the rule is about inside it'],
  ['Her voice is flat, stripped of inflection, as if she is reading a line from a script she hates.',
   { toldPron: false },
   'AN "AS IF" CLAUSE IS A GUESS, whatever sits inside it. This flagged on run #17 of the base rate '
   + 'and only the audit said so — the verb-list exclusions alone were not enough'],
  ['She hates the room. She looks at you as if she is bored.',
   { toldPron: true },
   'and the guess cut must stop at the sentence end, or an assertion beside a guess goes invisible'],
  ['She had decided hours ago.',
   { toldNamed: false, toldPron: true },
   'A PRONOUN IS NOT NAMED. This is the gap between the floor and the pronoun-inclusive count, '
   + 'stated as a case so nobody reads the floor as a rate'],
  ['His fear is a thing you can smell.', { toldNamed: false, toldPron: true },
   'a possessive interior noun — in SECOND person it cannot be the viewpoint'],
  ['"I knew it was you," Machek says.', { toldNamed: false, toldPron: false },
   'the same interior SPOKEN is the scene working, not the narrator telling'],
  ['Machek puts the cup down and does not look up.',
   { toldNamed: false, toldPron: false, about: true }, 'action only — the good case'],
  ['The rain has not stopped for three days.',
   { about: false, toldNamed: false, toldPron: false }, 'nothing about anyone'],
  ['You know the answer already.', { toldNamed: false, toldPron: false, povDrift: false },
   'THE VIEWPOINT\'S OWN INTERIOR IS NOT COUNTED — second person narration is the viewpoint\'s by construction'],
  ['You know what she means.', { toldNamed: false, toldPron: true },
   'the pronoun count also catches a non-POV interior buried in a subordinate clause. Real, and it '
   + 'is why toldPron is an UPPER figure and toldNamed is the FLOOR — the truth sits between them'],
  ['Machek shrugs. He is angry.', { povDrift: true },
   'the drift guard itself: no "you" in the narration, so the pronoun count cannot be trusted here'],

  // ---- counter 2: said-tagged share at 3+ speakers, scored RAW ----
  ['"Tuesday," Machek says. "Only Tuesday," Solveig answers. "Neither," you say.',
   { lines: 3, tags: 3, saidTags: 2, speakers: 3, three: true, twoBare: false },
   'three speakers, three tags, two of them said — and the third ("answers") is the headroom'],
  ['"Tuesday," Machek said. "Only Tuesday," Solveig said. "Neither," you said.',
   { tags: 3, saidTags: 3, three: true }, 'all three tagged with said — the top of the range'],
  ['"Tuesday," Machek says. "Only Tuesday," Solveig murmurs. "Neither," you offer.',
   { tags: 3, saidTags: 1, three: true },
   'the bottom of the range — a detector that could not report a LOW said-share would report the '
   + 'ban COUNCIL-06 refused as already in force'],
  ['"Tuesday." "Only Tuesday." "Neither."',
   { lines: 3, tags: 0, saidTags: 0, speakers: 0, three: false, twoBare: true },
   'THE GUARD ITSELF: no tag means no speaker found, so `three` is FALSE and this run is out of '
   + 'counter 2\'s denominator — asserted rather than left to a silent if'],
  ['"Tuesday," Machek says. "Only Tuesday," Solveig answers.',
   { speakers: 2, three: false }, 'two speakers is not a crowd — out of the denominator'],
  ['Machek says, "Tuesday." "Only Tuesday," Solveig answers. You add, "Neither."',
   { tags: 3, speakers: 3, three: true }, 'a tag before the line counts the same as one after it'],
  ['"Tuesday," Machek says. "Only Tuesday." "Neither." "Not that either."',
   { tags: 1, twoBare: true }, 'two consecutive bare lines — the rule COUNCIL-06 kept as a floor'],
  ['"Tuesday," Machek says. "Only Tuesday." "Neither." Solveig looks at the window.',
   { tags: 1, speakers: 1, twoBare: false },
   'THE UNDERCOUNT, WRITTEN DOWN: Solveig never sits beside a tag so she is not a speaker, and one '
   + 'tag is allowed to serve the line on either side of it. Both push the same way — fewer '
   + 'speakers, fewer bare runs — so counter 2 reads conservatively, never generously'],
  ['Machek says nothing at all.', { lines: 0, three: false },
   'no dialogue — the empty case, because a detector that cannot report zero reports perfection'],

  // ---- counter 3: an unasked-for closing ----
  ['Machek stands. The door closes behind him.', { closed: true }, 'a door, at the end'],
  ['Solveig walks out and does not look back.', { closed: true }, 'a departure'],
  ['Nothing more is said.', { closed: true }, 'a last line with cadence'],
  ['You wait. The room goes quiet.', { closed: true }, 'the cadence form, as the last sentence'],
  ['The door closes behind him.\n\nMachek is still talking.\n\nSolveig puts her hand flat on the table and waits.',
   { closed: false }, 'a door in the FIRST paragraph is not a closing — the scene runs on'],
  ['The room is quiet, and then Machek starts again.', { closed: false },
   'the cadence phrase mid-sentence is not a cadence line — this is why closeSent is scoped to the last sentence'],
  ['Machek says it again, louder, and Solveig does not answer yet.', { closed: false },
   'the good case — the beat is still open'],
  ['You put your hand on the table.\n\n* * *\n\nThe next morning is colder.', { closed: true },
   'a chapter break in the middle of a chapter'],
  ['Machek is gone.', { closed: true }, 'a person gone IS a closing'],
  ['He shakes the box. The lighter is gone.', { closed: false },
   'A THING gone is not a closing — it is the object counter\'s business. Bare "is gone" flagged '
   + 'run #18\'s matchbox, and that is one of the three live flags this counter reported'],
  ['She brings it to her lips, not to smoke, but to bite the end off.', { closed: false },
   'and this is the other two: an unanchored "the end" flagged "the end off" and "the end of her '
   + 'sentence". All three flags on counter 3 were false, and only reading them said so'],
  ['You put your hand on the table.\n\nTHE END', { closed: true },
   'the real marker, on a line of its own'],

  // ---- counter 4: object continuity ----
  ['Machek opens the ledger on the table between you.', { objSeen: true, objBad: true, objBadKey: 'ledger' },
   'the ledger canon locked in the harbourmaster\'s safe, teleported onto the table'],
  ['The ledger is still in the harbourmaster\'s safe, and all three of you know it.',
   { objSeen: true, objBad: false }, 'naming the constraint is not a failure — the rescue'],
  ['Machek reaches into his coat and finds nothing.', { objSeen: true, objBad: true, objBadKey: 'coat' },
   'the coat is on the hook by the door, so his hand cannot be in it'],
  ['His coat is still on the hook by the door.', { objSeen: true, objBad: false }, 'the coat, where it is'],
  ['Machek thumbs his lighter and the flame does not catch.',
   { objSeen: true, objBad: true, objBadKey: 'lighter' },
   'a lighter that went through the grating on the quay, reintroduced by inventory'],
  ['Machek has no lighter any more and says so.', { objSeen: true, objBad: false },
   'the absence, acknowledged'],
  ['She looks at the door, as if expecting the harbourmaster to burst through it, soaked and furious, carrying the ledger in his hands.',
   { objSeen: true, objBad: false },
   'A HYPOTHETICAL ABOUT THE MAN WHO HAS IT IS NOT A TELEPORT. Run #12 of the base rate scored this '
   + 'as a failure because the rescue only looked forty characters back'],
  ['He smells of old paper and the specific, metallic scent of the grating that took his lighter.',
   { objSeen: true, objBad: false },
   'the loss named BEFORE the object. Run #41 scored this as the lighter being produced and used'],
  ['You watch the water move under the window.', { objSeen: false, objBad: false },
   'no tracked object — out of counter 4\'s denominator'],

  // ---- the narrationOnly ceiling (COUNCIL-06 §6, trap 1) ----
  ["'Tuesday,' Machek says. 'Only Tuesday.'", { oddDialogue: true },
   'SINGLE-QUOTED DIALOGUE SURVIVES `narrationOnly` WHOLE. The fixture is scoped to double quotes; '
   + 'this guard counts the runs where that scoping failed, and that count is the ceiling'],
  ['— Tuesday, Machek says.', { oddDialogue: true }, 'em-dash dialogue, same hole'],
  ['"Tuesday," Machek says. He does not sit down.', { oddDialogue: false, unclosed: false },
   'the scoped case — double quotes, which the strip can see'],
  ['"Tuesday," Machek says. "He knows we have not signed the last three',
   { unclosed: true, toldPron: false },
   'THE SECOND HOLE, CLOSED — and this case is now the guard that it STAYS closed. It was written '
   + 'asserting toldPron TRUE, recording the defect as it stood: a passage cut off at the token '
   + 'ceiling leaves an opening quote unpaired, `narrationOnly` handed the rest back as narration, '
   + 'and a line of DIALOGUE then scored as the narrator asserting a non-POV interior. It happened '
   + 'on run #2 of the base rate. `QUOTED` in context.ts now closes an unterminated span at end of '
   + 'input — the `(?:["”]|$)` alternative — so the narration here is ` Machek says. ` and '
   + 'FALSE is the right answer. Measured, not reasoned: narrationOnly returns exactly that. '
   + 'It can still fail — drop the `|$` alternative and the dialogue leaks back in and this goes '
   + 'true. `unclosed` stays TRUE because counting truncated passages is still worth doing. '
   + 'The expectation was stale rather than the code, which is only visible because this check was '
   + 'finally run: it is one of sixteen `check` modes under bench/ and fifteen of them run nowhere.'],
];

function runCases(): string[] {
  const red: string[] = [];
  for (const [text, want, why] of CASES) {
    const got: any = score(text);
    for (const [k, v] of Object.entries(want)) {
      const have = k === 'objBadKey' ? (got.obj[v as string]?.bad ?? false) : got[k];
      const wantV = k === 'objBadKey' ? true : v;
      if (have !== wantV) red.push(`${k}=${JSON.stringify(have)}, wanted ${JSON.stringify(wantV)} — ${why}\n       ${JSON.stringify(text)}`);
    }
  }
  return red;
}

if (process.argv[2] === 'check') {
  const red = runCases();
  for (const r of red) console.log(`  RED  ${r}`);
  const flags = CASES.filter((c) => Object.entries(c[1]).some(([k, v]) => v === true || (k === 'objBadKey'))).length;
  console.log(red.length
    ? `\n  ${red.length} RED — do not believe a result from this`
    : `\n  ${CASES.length} cases, all green — ${flags} must flag, ${CASES.length - flags} must not`);
  process.exit(red.length ? 1 : 0);
}

// FALSIFY THE CHECK, NOT JUST THE CODE (CLAUDE.md). Each table is blanked in turn and the cases
// must go red. A table whose removal changes nothing was never firing, and a green suite built on
// it is decorative.
if (process.argv[2] === 'falsify') {
  if (runCases().length) { console.log('  cases are not green to begin with — fix `check` first'); process.exit(1); }
  const NEVER = /(?!)/;
  let bad = 0;
  const keys = ['toldNamed', 'toldPron', 'closePara', 'closeSent', 'chapter', 'speech', 'saidTag',
    'speaker', 'odd', 'obj'] as const;
  for (const k of keys) {
    const keep = (T as any)[k];
    (T as any)[k] = k === 'obj'
      ? Object.fromEntries(Object.keys(T.obj).map((o) => [o, { seen: NEVER, bad: [NEVER], ok: NEVER }]))
      : Array.isArray(keep) ? [] : NEVER;
    const red = runCases().length;
    (T as any)[k] = keep;
    if (!red) { bad++; console.log(`  DECORATIVE  blanking ${k} broke nothing — no case can see it`); }
    else console.log(`  ok  blanking ${k} turns ${red} assertion${red === 1 ? '' : 's'} red`);
  }
  console.log(bad ? `\n  ${bad} table(s) no case can see` : `\n  every table is load-bearing`);
  process.exit(bad ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------
const j = (u: string, b?: unknown, m = 'POST') => fetch(B + u, b
  ? { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }
  : {}).then((r) => r.json() as any);

if (process.argv[2] === 'setup') {
  const { stories } = await j('/api/stories', undefined, 'GET');
  const old = stories.find((s: any) => s.title === TITLE);
  if (old) await j('/api/stories', { id: old.id }, 'DELETE');
  // NO `writingStyle` — so `story.ts:266` falls through to the writer's default and then to the
  // shipped DEFAULT_VOICE, which names no POV since 2026-10-27. NO `pov` — so `db.createStory`
  // supplies its own default, second person, present tense. NO `persona` and NO `lockedCharacter` — see the header:
  // either one would put the interiority firewall in DIRECTIVE and this would stop being a base rate.
  const made = await j('/api/stories', {
    title: TITLE, genre: 'crime',
    premise: 'Three people in a customs office decide what to tell the harbourmaster, and only one '
      + 'of them has already told him something.',
    setting: 'A customs office over a wet dock, after closing, in the third week of rain',
    spice: 2,
  });
  for (const [title, body] of [
    ['Teodor Machek', '[Teodor Machek: forty, weighs everything twice, speaks in questions. Signs '
      + 'the manifests. His lighter went through the grating on the quay last week and is gone; he '
      + 'has been borrowing matches since]'],
    ['Solveig Rask', '[Solveig Rask: the clerk. Fast, flat, keeps a cigarette unlit for hours. Went '
      + 'to the harbourmaster on Tuesday and has not said what she told him]'],
    ['The ledger', '[the ledger: the customs book for the whole quarter. Locked in the '
      + 'harbourmaster\'s safe since Tuesday. Nobody in this office has a key to it]'],
  ]) await j('/api/entry', { storyId: made.id, entry: { id: '', entryType: title === 'The ledger' ? 'item' : 'character',
    activation: 'always_on', keys: [], lastEditor: 'human', title, body } });
  // The writer's own last passages. DOUBLE-QUOTED DIALOGUE, deliberately — the fixture is scoped
  // to the grammar `narrationOnly` can see, and `oddDialogue` counts the runs that leave it.
  // The coat on the hook is the second object's right answer, written by the writer rather than
  // by canon, because a teleport is a failure against the page as much as against the ledger.
  for (const body of [
    'The rain has not stopped for three days. You come up the back stairs into the customs office '
      + 'and Machek is already there, his coat on the hook by the door, the room\'s one chair '
      + 'under it.',
    'Solveig taps a cigarette on the back of her hand and does not light it. "You went on Tuesday," '
      + 'Machek says. It is not a question, which for him is unusual.',
  ]) await j('/api/write', { storyId: made.id, body });
  const back = await j(`/api/story?story=${made.id}`, undefined, 'GET');
  console.log(`  ${TITLE} — ${made.id}`);
  console.log(`  pov=${JSON.stringify(back.story?.pov)}  writingStyle=${JSON.stringify(back.story?.writingStyle)}`);
  console.log(`  persona=${JSON.stringify(back.story?.persona ?? null)}  locked=${JSON.stringify(back.story?.lockedCharacter ?? null)}`);
  console.log('\n  VERIFY THE PROMPT CARRIES NO FIREWALL before running — this must print nothing:');
  console.log(`    node --experimental-strip-types bench/prompts.ts ${made.id} --full | grep -i "thinks, feels"`);
  process.exit(0);
}

if (process.argv[2] === 'report') {
  // RE-SCORED FROM THE STORED PROSE, never from the fields written at generation time. Every
  // detector in this project has been wrong at least once after a run; a report that trusted the
  // stored verdict would go on printing the wrong number from the right prose with no sign of it.
  const rows = readFileSync(`${OUTDIR}/base.jsonl`, 'utf8').trim().split('\n')
    .map((l) => JSON.parse(l)).filter((r) => !r.error)
    .map((r) => ({ ...r, ...score(String(r.prose ?? '')) }));
  const errs = readFileSync(`${OUTDIR}/base.jsonl`, 'utf8').trim().split('\n')
    .map((l) => JSON.parse(l)).filter((r) => r.error).length;
  // "A zero is not an absence" (F12). Zero in n bounds the rate under roughly 3/n — the rule of
  // three — and nothing more. Printed that way so nobody has to remember to say it.
  const pc = (k: number, n: number) => !n ? 'n/a — nothing could have failed'
    : k === 0 ? `0/${n} — under ${(300 / n).toFixed(1)}%, NOT none`
    : `${(k / n * 100).toFixed(1)}% (${k}/${n})`;

  console.log(`\n  ${TITLE}: ${rows.length} usable of ${rows.length + errs} (${errs} errors)`);
  console.log(`  median narration ${[...rows.map((r: any) => r.chars)].sort((a, b) => a - b)[Math.floor(rows.length / 2)]} chars`);
  console.log(`  narrationOnly ceiling A: ${rows.filter((r: any) => r.oddDialogue).length}/${rows.length} runs came back in a dialogue grammar the strip cannot see`);
  console.log(`  narrationOnly ceiling B: ${rows.filter((r: any) => r.unclosed).length}/${rows.length} runs stop mid-line, leaving dialogue that the strip hands back AS narration`);
  console.log(`  POV drift: ${rows.filter((r: any) => r.povDrift).length}/${rows.length} runs carry no "you" in narration`);

  const about = rows.filter((r: any) => r.about);
  const shut = about.filter((r: any) => !r.unclosed);
  console.log('\n  1 · NON-POV INTERIORITY ASSERTED BY THE NARRATOR');
  console.log(`      denominator: ${about.length}/${rows.length} runs NAME a non-POV character in narration`);
  console.log(`      named anchor (THE FLOOR — say "under X%")  ${pc(about.filter((r: any) => r.toldNamed).length, about.length)}`);
  console.log(`      + third-person pronouns                    ${pc(about.filter((r: any) => r.toldPron).length, about.length)}`);
  console.log(`      + pronouns, closed-quote runs only         ${pc(shut.filter((r: any) => r.toldPron).length, shut.length)}`);

  const three = rows.filter((r: any) => r.three);
  const sum = (f: (r: any) => number) => three.reduce((a, r) => a + f(r), 0);
  console.log('\n  2 · `said`-TAGGED SHARE OF DIALOGUE AT THREE OR MORE SPEAKERS  (scored RAW)');
  console.log(`      denominator: ${three.length}/${rows.length} runs have three or more attributed speakers`);
  if (three.length) {
    console.log(`      dialogue lines ${sum((r) => r.lines)}, speech tags ${sum((r) => r.tags)}, of which said ${sum((r) => r.saidTags)}`);
    console.log(`      said / every tag   ${pc(sum((r) => r.saidTags), sum((r) => r.tags))}`);
    console.log(`      said / every line  ${pc(sum((r) => r.saidTags), sum((r) => r.lines))}`);
    console.log(`      runs with two consecutive UNattributed lines  ${pc(three.filter((r: any) => r.twoBare).length, three.length)}`);
  } else console.log('      nothing could have failed — the fixture did not produce crowds');

  console.log('\n  3 · A SCENE-CLOSING BEAT THE WRITER DID NOT ASK FOR');
  console.log(`      denominator: ${rows.length}/${rows.length} — every run ends somewhere, and the directive asks for no ending`);
  console.log(`      closed  ${pc(rows.filter((r: any) => r.closed).length, rows.length)}`);

  const objSeen = rows.filter((r: any) => r.objSeen);
  console.log('\n  4 · OBJECT CONTINUITY');
  console.log(`      denominator: ${objSeen.length}/${rows.length} runs mention a tracked object in narration`);
  console.log(`      any failure  ${pc(objSeen.filter((r: any) => r.objBad).length, objSeen.length)}`);
  for (const k of Object.keys(T.obj)) {
    const seen = rows.filter((r: any) => r.obj[k].seen);
    console.log(`        ${k.padEnd(8)} seen in ${seen.length}/${rows.length}   ${pc(seen.filter((r: any) => r.obj[k].bad).length, seen.length)}`);
  }
  console.log('');
  process.exit(0);
}

// ---- the run. ONE REQUEST IN FLIGHT AT A TIME. ----
//
// GATED ON BEING THE ENTRY POINT. `score` is exported, and importing this file for it used to fall
// straight through into the loop and start generating against the router — which is how a stray
// `node -e "await import(...)"` spent four generations and wrote a partial base.jsonl over the real
// one. bench/interiority-verdict.ts gates its self-check the same way.
if (import.meta.filename === process.argv[1]) {
  const n = Number(process.argv[3] ?? 60);
  mkdirSync(OUTDIR, { recursive: true });
  const OUT = `${OUTDIR}/base.jsonl`;
  const { stories } = await j('/api/stories', undefined, 'GET');
  const story = stories.find((s: any) => s.title === TITLE);
  if (!story) { console.error(`no story "${TITLE}" — run the setup step first`); process.exit(1); }

  for (let i = 0; i < n; i++) {
    let row: Record<string, unknown>;
    try {
      // `direct`, one beat, the same directive every time. Awaited, so there is never a second
      // request in flight: the router has two slots and the other belongs to whoever is writing.
      const r = await j('/api/generate', { storyId: story.id, mode: 'direct', directive: DIRECTIVE });
      row = r.error ? { i, error: String(r.error) }
                    : { i, seconds: r.seconds, ...score(r.prose), prose: r.prose };
    } catch (e: any) {
      // A dead server must not end the run — whoever is watching decides whether to stop.
      row = { i, error: `${e?.name ?? 'error'}: ${e?.message ?? e}` };
    }
    appendFileSync(OUT, JSON.stringify(row) + '\n');
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${n}`);
  }
  console.log(`  ${n} done -> ${OUT}`);
}
