// Do the people in a scene sound different from each other, and from the narrator?
//
// Seth, 2026-09-01: *"what i need it to do and do well is carry a few voices or characters per
// turn. how one character would respond to another in that characters voice with their mannerisms
// and have that split from narrator, and have them sound different."*
//
//   node --experimental-strip-types bench/cast.ts check        # the detector, no model, no db
//   node --experimental-strip-types bench/cast.ts run [n]      # score the live library, no model
//
// NO MODEL AND NO PORT. `run` reads passages straight out of the database read-only and scores
// prose that already exists, so it cannot collide with 5187-5195 or 5179 and cannot take a slot
// from a writer. There are 1,111 passages to score; generating more to answer "is this a problem"
// would be paying for an answer already sitting on disk.
//
// WHY THIS FILE HAS TO EXIST BEFORE ANY FIX DOES. Every quality check in this project strips
// quoted spans first — that is the rule that stopped a long run of false positives, and it is
// right. The consequence nobody had written down: dialogue voice is unmeasured BY CONSTRUCTION.
// `narrationOnly` throws away the exact thing under test here. So there was no detector for this
// class at all, and by F17 no result about it could be believed.
//
// WHAT IT DELIBERATELY DOES NOT DO: it never says "these voices are too similar". It reports a
// distance and the features behind it. A threshold would be a claim with no measurement behind
// it, and the checks below assert ORDERING — a distinct pair must score above an identical pair —
// which is falsifiable without inventing a cutoff.

import { quotedSpans } from '../src/context.ts';

// ---------------------------------------------------------------- attribution

/** The verbs that mark a line as spoken by somebody. A closed list, and short on purpose: every
 *  addition here is a chance to attribute a line to a character who did not say it, and a wrong
 *  attribution poisons two speakers' feature vectors at once rather than one.
 *
 *  PRESENT TENSE AS WELL AS PAST, and that was not defensive either. The list was past-tense only
 *  and missed `he says` and `I reply` — `DEFAULT_VOICE` asks for present tense, so the past forms
 *  are the ones the library mostly does NOT use. Every tense of every verb, or the number is a
 *  measurement of which tense a book is written in. */
const SAID = String.raw`sa(?:y|ys|id)|ask(?:s|ed)?|repl(?:y|ies|ied)|answer(?:s|ed)?|add(?:s|ed)?`
  + String.raw`|tell(?:s)?|told|call(?:s|ed)?|offer(?:s|ed)?|murmur(?:s|ed)?|mutter(?:s|ed)?`
  + String.raw`|whisper(?:s|ed)?|shout(?:s|ed)?|snap(?:s|ped)?|breathe(?:s|d)?|sigh(?:s|ed)?`
  + String.raw`|laugh(?:s|ed)?|repeat(?:s|ed)?|growl(?:s|ed)?|hiss(?:es|ed)?|admit(?:s|ted)?`;

/** A name is a capitalised word. Not a sentence-position test, because "Mira said" puts the name
 *  first as often as last, so position carries no information here. */
const NAME = String.raw`[A-Z][\w'’-]+`;

/** A PRONOUN IS A SPEAKER, and this is the correction that made the file work on the real library.
 *
 *  Scored on names alone, 96% of the 1,187 quoted spans in the library came back unattributed —
 *  which read as "this prose has no dialogue tags" and is false. The books are second person and
 *  mostly two-handers, so the tags are `he says`, `I reply`, `I ask`. Every one of them is a tag,
 *  and every one was invisible.
 *
 *  A pronoun is keyed as itself, so `he` and `I` are two speakers — which is exactly the question
 *  in a two-hander: does the other person sound like the narrator-who-also-speaks.
 *
 *  ponytail: two men in one scene are both `he` and their speech merges into one vector, so the
 *  distance between THEM is invisible and the pair reads as one speaker. The upgrade path is
 *  resolving a pronoun to the last named character of that gender, which needs the roster to carry
 *  gender — `SLOTS` has no such room, so it would be inferred, and a wrong inference here merges
 *  two voices silently rather than loudly. Left until a scene in the library actually needs it. */
const PRONOUN = String.raw`I|[Hh]e|[Ss]he|[Tt]hey|[Yy]ou|[Ww]e`;
const WHO = String.raw`${NAME}|${PRONOUN}`;
const PRONOUNS = new Set(['i', 'he', 'she', 'they', 'you', 'we']);

const AFTER = new RegExp(String.raw`^[\s,.!?—-]*(?:(${WHO})\s+(?:${SAID})|(?:${SAID})\s+(${WHO}))\b`);
const BEFORE = new RegExp(String.raw`\b(?:(${WHO})\s+(?:${SAID})|(?:${SAID})\s+(${WHO}))[\s,:—-]*$`);

/** THE ACTION BEAT, which is how this library actually attributes dialogue.
 *
 *  `"It's dark." I shrug again.` and `"…" He steps closer` — the beat carries the attribution and
 *  there is no speech verb anywhere. Sampled against the live prose, this is 955 of the 1,187
 *  quoted spans: measuring only tagged lines measures a corner of the library and calls it the
 *  library.
 *
 *  A WEAKER SIGNAL THAN A TAG, and kept apart from one for that reason rather than blended in.
 *  `"Get out." He left the room.` reads as him leaving after somebody else spoke. So the counts
 *  are reported separately and `run` prints both: if the beat-attributed number tracks the
 *  tag-attributed one, the inference is safe; if they disagree, that is visible instead of
 *  averaged away.
 *
 *  ONLY A PRONOUN OR A ROSTER NAME may open a beat. Any capitalised word would attribute
 *  `"…" The flickering lumens strip sputters` to a light fitting, which is in the live prose. */
const BEAT = new RegExp(String.raw`^[\s,.!?—-]*(${WHO})\s+[a-z]`);

export interface Attributed {
  /** Everything outside quotation marks. The narrator's half. */
  narration: string;
  /** Speaker name -> everything they say in this passage, joined. */
  bySpeaker: Record<string, string>;
  /** Quoted spans this could not put a name to. Reported, never guessed at and never dropped
   *  silently — if this is most of the passage, the numbers below rest on a handful of lines and
   *  the caller has to be able to see that. */
  unattributed: number;
  /** Every quoted span found, attributed or not. */
  spans: number;
  /** Spans attributed by an explicit speech tag, and by an action beat. Kept apart because the
   *  beat is the weaker inference — see BEAT. `byTag + byBeat + unattributed === spans`. */
  byTag: number;
  byBeat: number;
}

/** Split a passage into narration and per-speaker dialogue.
 *
 *  `quotedSpans` is reused rather than re-derived, and that is not tidiness: `src/context.ts`
 *  documents two ceilings on it — a stray quote mid-passage mispairs every quote after it, and
 *  single-quote and em-dash dialogue are invisible — and a second copy of that regex here would
 *  be a second set of ceilings for someone to discover separately. This inherits those two,
 *  knowingly.
 *
 *  `roster` is the story's character names. With it, attribution matches a known person and is
 *  reliable; without it, any capitalised word beside a speech verb will do, which will happily
 *  attribute a line to "Then". Pass the roster wherever you have one.
 *
 *  ponytail: tags and beats, no alternation inference. Real dialogue drops both after the first
 *  exchange and simply alternates, and roughly a third of the library's spans are still
 *  unattributed for that reason. The upgrade path is carrying the last two speakers forward and
 *  alternating between them — left out because a wrong inference here merges two voices into one
 *  vector silently, and a missing one only shrinks the denominator, which `run` prints. */
export function attribute(text: string, roster: string[] = [], beats = true): Attributed {
  const s = String(text ?? '');
  const spans = quotedSpans(s);
  const known = new Set(roster.map((r) => r.trim().toLowerCase()).filter(Boolean));
  // A roster name may be "Halsey Jones"; the tag will say "Halsey". Match on the first word too.
  const first = new Map(roster.map((r) => [r.trim().split(/\s+/)[0]?.toLowerCase() ?? '', r.trim()]));

  const pick = (raw: string | undefined): string | null => {
    if (!raw) return null;
    const k = raw.toLowerCase();
    // A pronoun bypasses the roster: it is never in it, and refusing it would throw away 96% of
    // the tags in this library. Keyed lowercase so `He` and `he` are one speaker.
    if (PRONOUNS.has(k)) return k === 'i' ? 'I' : k;
    if (known.has(k)) return raw;
    if (first.has(k)) return first.get(k)!;
    // No roster to check against: take the capitalised word on trust. With a roster, refuse it —
    // the roster is the whole reason to have one.
    return roster.length ? null : raw;
  };

  const bySpeaker: Record<string, string> = {};
  let unattributed = 0, byTag = 0, byBeat = 0;
  let narration = '';
  let cursor = 0;

  for (const [start, end] of spans) {
    narration += s.slice(cursor, start) + ' ';
    cursor = end;
    const inner = s.slice(start, end).replace(/^["“]|["”]$/g, '').trim();
    const after = s.slice(end, end + 60);
    const a = AFTER.exec(after);
    const b = BEFORE.exec(s.slice(Math.max(0, start - 60), start));
    let who = pick(a?.[1] ?? a?.[2]) ?? pick(b?.[1] ?? b?.[2]);
    let tagged = !!who;
    if (!who && beats) {
      // A beat only counts for a pronoun or a known character. `pick` takes an unknown capitalised
      // word on trust when there is no roster, which is right for a tag and wrong here.
      const m = BEAT.exec(after)?.[1];
      if (m && (PRONOUNS.has(m.toLowerCase()) || known.has(m.toLowerCase()) || first.has(m.toLowerCase()))) {
        who = pick(m);
      }
    }
    if (!who) { unattributed++; continue; }
    if (tagged) byTag++; else byBeat++;
    bySpeaker[who] = (bySpeaker[who] ? bySpeaker[who] + ' ' : '') + inner;
  }
  narration += s.slice(cursor);

  return { narration: narration.replace(/[ \t]{2,}/g, ' ').trim(), bySpeaker, unattributed,
           spans: spans.length, byTag, byBeat };
}

// ------------------------------------------------------------------ features

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9'’\s-]/g, ' ').split(/\s+/).filter(Boolean);

/** Sentences, allowing for the way dialogue ends: a closing quote may sit after the stop, and a
 *  line that trails off has no stop at all. */
const sentences = (s: string) =>
  s.split(/(?<=[.!?…])["”]?\s+|(?<=[—–-])\s*$/).map((x) => x.trim()).filter(Boolean);

export interface Features {
  words: number;      // not a feature — the guard that says whether the rest mean anything
  sentLen: number;    // mean words per sentence
  question: number;   // share of sentences that ask
  unfinished: number; // share that trail off on a dash or an ellipsis
  wordLen: number;    // mean characters per word
  variety: number;    // distinct words over total — how much the speaker repeats themselves
}

export function features(text: string): Features {
  const w = words(text);
  const ss = sentences(text);
  if (!w.length) return { words: 0, sentLen: 0, question: 0, unfinished: 0, wordLen: 0, variety: 0 };
  return {
    words: w.length,
    sentLen: ss.length ? w.length / ss.length : w.length,
    question: ss.length ? ss.filter((x) => /\?["”]?$/.test(x)).length / ss.length : 0,
    unfinished: ss.length ? ss.filter((x) => /[—–…]["”]?$|\.\.\.["”]?$/.test(x)).length / ss.length : 0,
    wordLen: w.join('').length / w.length,
    variety: new Set(w).size / w.length,
  };
}

/** How far apart two voices are, 0 (indistinguishable on these features) upward.
 *
 *  ponytail: five features with hand-chosen scales, and the scales are the soft part — 20 words is
 *  called a long line of dialogue and 8 characters a long word, both by eye rather than by
 *  measurement. That makes the ABSOLUTE number weak and the ORDERING sound, which is why nothing
 *  here thresholds and why the checks below only ever compare one distance against another. The
 *  upgrade path is normalising against the spread of the live library, which `run` prints. */
export function distance(a: Features, b: Features): number {
  const parts = [
    Math.abs(a.sentLen - b.sentLen) / 20,
    Math.abs(a.question - b.question),
    Math.abs(a.unfinished - b.unfinished),
    Math.abs(a.wordLen - b.wordLen) / 8,
    Math.abs(a.variety - b.variety),
  ];
  return parts.reduce((x, y) => x + y, 0) / parts.length;
}

/** Words one speaker uses that no other speaker in the same passage does.
 *
 *  The scalar distance cannot see "uses 'fuck' like punctuation" — that is a lexical habit, not a
 *  shape — and it is the first thing Seth named. Function words are not filtered out by a list;
 *  a word only counts as distinctive if nobody else in the scene used it, and "the" fails that
 *  test on its own without anyone having to enumerate it. */
export function distinctive(bySpeaker: Record<string, string>): Record<string, string[]> {
  const sets = Object.fromEntries(Object.entries(bySpeaker).map(([k, v]) => [k, new Set(words(v))]));
  const out: Record<string, string[]> = {};
  for (const [who, mine] of Object.entries(sets)) {
    const others = new Set<string>();
    for (const [other, theirs] of Object.entries(sets)) if (other !== who) for (const w of theirs) others.add(w);
    out[who] = [...mine].filter((w) => !others.has(w) && w.length > 2);
  }
  return out;
}

export interface Score {
  /** Mean pairwise distance between the speakers in this passage. */
  apart: number | null;
  /** Mean distance from each speaker to the narration. */
  fromNarrator: number | null;
  speakers: string[];
  /** Why there is no number, when there is none. */
  why?: string;
}

/** Score one passage.
 *
 *  `minWords` is the informative-denominator rule (F10) made mechanical: a speaker with four words
 *  cannot demonstrate a register, and letting them into the average would dilute every real
 *  measurement with noise. A passage that cannot show differentiation reports WHY rather than
 *  scoring zero — F12, a zero is not an absence. */
export function score(text: string, roster: string[] = [], minWords = 12, beats = true): Score {
  const at = attribute(text, roster, beats);
  const named = Object.keys(at.bySpeaker).length;
  const usable = Object.entries(at.bySpeaker).filter(([, v]) => words(v).length >= minWords);
  const speakers = usable.map(([k]) => k);
  if (usable.length < 2) {
    // Four reasons, kept apart because they send the fix to four different places: no dialogue is
    // a scene with none in it, all-unattributed is this detector's own ceiling, under-the-floor is
    // the word guard doing its job, and one speaker is a monologue. Collapsing them into one
    // "not scored" would hide the second, which is the only one that is a defect here.
    return { apart: null, fromNarrator: null, speakers,
             why: at.spans === 0 ? 'no dialogue'
                : named === 0 ? `${at.unattributed} span(s), none attributable to a named speaker`
                : usable.length === 0 ? 'no speaker reaches the word floor'
                : 'one speaker — nothing to compare' };
  }
  const f = usable.map(([, v]) => features(v));
  const pairs: number[] = [];
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) pairs.push(distance(f[i], f[j]));
  const narr = features(at.narration);
  const toNarr = narr.words >= minWords ? f.map((x) => distance(x, narr)) : [];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { apart: mean(pairs), fromNarrator: toNarr.length ? mean(toNarr) : null, speakers };
}

// ---------------------------------------------------------------- the cases

if (process.argv[2] === 'check') {
  let red = 0;
  const ok = (name: string, pass: boolean) => { if (!pass) red++; console.log(`  ${pass ? 'ok  ' : 'RED '}${name}`); };

  // --- attribution, both directions
  const tagAfter = attribute('"Get in the car," Mira said. She did not look up.', ['Mira']);
  ok('a tag after the line attributes it', tagAfter.bySpeaker.Mira === 'Get in the car,');
  ok('and the narration keeps the unquoted half', /She did not look up/.test(tagAfter.narration));
  ok('and the narration drops the spoken half', !/Get in the car/.test(tagAfter.narration));

  const tagBefore = attribute('Mira said, "Get in the car."', ['Mira']);
  ok('a tag before the line attributes it', tagBefore.bySpeaker.Mira === 'Get in the car.');

  const bare = attribute('"Get in the car." The engine was already running.', ['Mira']);
  ok('an untagged line is counted, not guessed', bare.unattributed === 1 && !Object.keys(bare.bySpeaker).length);

  // THE TRAP contractions.ts documents, in this file's own terms: a model writes U+201C/U+201D and
  // a detector spelling only " scores real dialogue as no dialogue at all.
  const curly = attribute('“Get in the car,” Mira said.', ['Mira']);
  ok('curly quotes are seen', curly.bySpeaker.Mira === 'Get in the car,');
  ok('and score the same as straight ones', curly.bySpeaker.Mira === tagAfter.bySpeaker.Mira);

  // THE TAG POSITION IS THE WHOLE TEST, not the presence of a name and a verb somewhere nearby.
  // "Fine." Then Marek said nothing. — Marek did NOT say "Fine", and a detector that reads any
  // said-verb in the vicinity as a tag would put that line in his mouth and flatten his vector
  // with somebody else's words. The anchor is what refuses it, with a roster and without one.
  ok('a name in narration after the line is not a tag',
     attribute('"Fine." Then Marek said nothing.', ['Marek']).unattributed === 1);
  ok('and is refused with no roster too',
     Object.keys(attribute('"Fine." Then Marek said nothing.', []).bySpeaker).length === 0);

  // The roster is the difference between attributing a line and attributing a word: in tag
  // position, an unknown capitalised word is taken on trust only when there is no roster to check.
  ok('without a roster a name in tag position is taken on trust',
     attribute('"Fine," Marek said.', []).bySpeaker.Marek === 'Fine,');
  ok('with a roster a non-character in tag position is refused',
     attribute('"Fine," Marek said.', ['Halsey']).unattributed === 1);

  // PRONOUN TAGS, which are 96% of the real library and were all invisible until they were added.
  // Taken verbatim in shape from the live prose: `"…," he says.` and `"…," I reply.`
  const twoHander = attribute('"You call me as if I am a familiar," he says. I look up. '
    + '"You assume that fear has anything to do with it," I reply.', ['Halsey']);
  ok('a pronoun tag attributes', twoHander.bySpeaker.he === 'You call me as if I am a familiar,');
  ok('and first person is its own speaker',
     twoHander.bySpeaker.I === 'You assume that fear has anything to do with it,');
  ok('so a two-hander has two speakers', Object.keys(twoHander.bySpeaker).length === 2);
  ok('a pronoun is not refused by a roster it can never be in', twoHander.unattributed === 0);
  // --- the action beat, the weaker tier
  const beat = attribute('"It\'s dark." I shrug again. "He steps closer." He tilts his head.', []);
  ok('an action beat attributes the line before it', beat.bySpeaker.I === "It's dark.");
  ok('and counts as a beat, not as a tag', beat.byBeat === 2 && beat.byTag === 0);
  ok('the three counts always sum to the spans',
     beat.byTag + beat.byBeat + beat.unattributed === beat.spans);
  ok('beats can be switched off to compare tiers',
     attribute('"It\'s dark." I shrug again.', [], false).unattributed === 1);
  // The case that justifies restricting a beat to pronouns and roster names. This line is from the
  // live prose; a bare capitalised-word rule attributes it to a light fitting.
  ok('a beat opening on a non-character is refused',
     attribute('"Nothing." The flickering lumens strip sputters.', ['Halsey']).unattributed === 1);
  ok('and is refused with no roster too, which a TAG would not be',
     attribute('"Nothing." The flickering lumens strip sputters.', []).unattributed === 1);

  ok('He and he are one speaker',
     Object.keys(attribute('"One," he said. "Two." He said.', []).bySpeaker).length === 1);
  // The ceiling, asserted rather than only described: two men merge into one vector.
  ok('two men in a scene merge, and that is the documented ceiling',
     Object.keys(attribute('"One," he said. "Two," he said.', []).bySpeaker).length === 1);

  // --- the ordering the whole file rests on
  const A = 'Mira'; const B = 'Halsey';
  const distinct = `"${'Why would I? You tell me. Is that what you want, or is it what he wants?'}" ${A} said. `
    + `"${'I walked the whole length of the northern gallery this morning and considered every single '
      + 'one of the arguments you made last night, and I find that I disagree with almost all of them.'}" ${B} said.`;
  const same = `"${'Why would I? You tell me. Is that what you want, or is it what he wants?'}" ${A} said. `
    + `"${'Why would he? You ask me. Is that what she wants, or is it what they want?'}" ${B} said.`;

  const dApart = score(distinct, [A, B]).apart ?? -1;
  const sApart = score(same, [A, B]).apart ?? -1;
  ok('two speakers found in each fixture',
     score(distinct, [A, B]).speakers.length === 2 && score(same, [A, B]).speakers.length === 2);
  ok('a genuinely distinct pair scores further apart than a matched pair', dApart > sApart);
  // The other direction, which is the half F17 says is usually missing: the detector must also
  // report SAMENESS when the voices are the same, or it flags everything and means nothing.
  ok('a matched pair scores near zero', sApart < 0.05);

  // --- no opportunity is not a failure
  ok('narration with no dialogue reports why, not zero', score('The room was cold. She waited.').apart === null);
  ok('and says so', score('The room was cold.').why === 'no dialogue');
  ok('a short line reports the floor, not zero', score('"Get in the car," Mira said.', ['Mira']).why
     === 'no speaker reaches the word floor');
  ok('a monologue over the floor reports one speaker, not zero',
     score('"I have been thinking about this for a very long time and I am not at all sure that '
       + 'you will like what I have concluded," Mira said.', ['Mira']).why
     === 'one speaker — nothing to compare');
  ok('dialogue nobody can be named for says so, not "no dialogue"',
     /none attributable/.test(score('"Get in the car." "I will not."').why ?? ''));
  ok('the empty case reports null', score('').apart === null);

  // A speaker under the floor must not be scored as if they had spoken.
  const tiny = score('"No," Mira said. "' + 'I have been thinking about this for a very long time and I '
    + 'am not at all sure that you are going to like what I have concluded.' + '" Halsey said.', ['Mira', 'Halsey']);
  ok('a four-word speaker does not reach the floor', tiny.apart === null && tiny.speakers.length === 1);

  // --- the lexical half
  const lex = distinctive({ Mira: 'fuck this fuck that fine', Halsey: 'the gallery was quiet and fine' });
  ok('a word only one speaker uses is distinctive', lex.Mira.includes('fuck'));
  ok('a word both use is not', !lex.Mira.includes('fine') && !lex.Halsey.includes('fine'));

  console.log(red ? `\n  ${red} RED` : '\n  all green');
  process.exit(red ? 1 : 0);
}

// ------------------------------------------------------------------- the run

if (process.argv[2] === 'run') {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(process.env.ANANSI_DB ?? 'anansi.db', { readOnly: true });
  const LIMIT = Number(process.argv[3] ?? 0);

  // SCORED PER CHAPTER, NOT PER PASSAGE, and that is a fact about how this app is written in
  // rather than a convenience. A passage is ONE speaker's turn: the model writes his reply, the
  // writer writes hers, and they are separate rows. Scored per passage, exactly one row in 1,060
  // put two speakers over the word floor — which measures the turn structure, not the voices.
  // A chapter is where two people are actually in the room together.
  //
  // Its ceiling: a chapter can hold more than one scene, so two different men across two scenes
  // both pool into `he`. Same ceiling the pronoun key already carries, one level larger.
  const stories = db.prepare('SELECT id, title FROM stories ORDER BY updated_at DESC').all() as any[];

  type Row = { story: string; chapter: string; who: 'model' | 'human' | 'both'; s: Score;
               tag: number; beat: number; un: number; spans: number; tagOnly: number | null };
  const rows: Row[] = [];

  for (const st of stories) {
    const roster = (db.prepare("SELECT title FROM entries WHERE story_id = ? AND entry_type = 'character'")
      .all(st.id) as any[]).map((r) => r.title);
    const chapters = db.prepare('SELECT id, idx AS ix FROM chapters WHERE story_id = ? ORDER BY idx')
      .all(st.id) as any[];
    for (const ch of chapters) {
      const ps = db.prepare('SELECT body, author FROM passages WHERE chapter_id = ? AND selected = 1 '
        + 'AND rejected = 0 ORDER BY ordinal').all(ch.id) as any[];
      if (!ps.length) continue;
      // Three pools: everything, and each author alone. The author split is the control — if the
      // model's dialogue separates its speakers less than the writer's own does in the same books,
      // that is the defect with a number on it rather than an impression.
      const pools: [Row['who'], any[]][] = [
        ['both', ps],
        ['model', ps.filter((p) => p.author === 'model')],
        ['human', ps.filter((p) => p.author !== 'model')],
      ];
      for (const [who, sub] of pools) {
        if (!sub.length) continue;
        const text = sub.map((p) => String(p.body ?? '')).join('\n\n');
        const at = attribute(text, roster);
        rows.push({ story: st.title, chapter: `${st.title} ch${ch.ix}`, who,
                    s: score(text, roster), tag: at.byTag, beat: at.byBeat,
                    un: at.unattributed, spans: at.spans,
                    tagOnly: score(text, roster, 12, false).apart });
      }
    }
  }

  const all = rows.filter((r) => r.who === 'both');
  const spans = all.reduce((a, r) => a + r.spans, 0);
  const tag = all.reduce((a, r) => a + r.tag, 0);
  const beat = all.reduce((a, r) => a + r.beat, 0);
  const un = all.reduce((a, r) => a + r.un, 0);
  const pc = (n: number) => (spans ? ((n / spans) * 100).toFixed(0) : '0') + '%';

  console.log(`\n  ${all.length} chapters with prose in them`);
  console.log(`  ${spans} quoted spans: ${tag} by a speech tag (${pc(tag)}), `
    + `${beat} by an action beat (${pc(beat)}), ${un} unattributed (${pc(un)})`);

  const scored = all.filter((r) => r.s.apart !== null);
  // F10: the number that decides anything is this one, not the chapter count.
  console.log(`  ${scored.length} of those chapters put two speakers over the word floor — `
    + 'that is the denominator for everything below');
  if (!scored.length) {
    console.log('\n  NOTHING TO REPORT, and that is a finding about the library rather than about '
      + 'voice: no chapter has two speakers this can name.');
    process.exit(0);
  }

  const say = (label: string, xs: number[]) => {
    if (!xs.length) return console.log(`  ${label}: none`);
    const s = [...xs].sort((a, b) => a - b);
    console.log(`  ${label}: n=${String(xs.length).padStart(3)}  median ${s[Math.floor(s.length / 2)].toFixed(3)}`
      + `  min ${s[0].toFixed(3)}  max ${s[s.length - 1].toFixed(3)}`);
  };
  const apart = (w: Row['who']) => rows.filter((r) => r.who === w && r.s.apart !== null).map((r) => r.s.apart!);
  const fromN = (w: Row['who']) => rows.filter((r) => r.who === w && r.s.fromNarrator !== null)
    .map((r) => r.s.fromNarrator!);

  console.log('\n  How far apart two speakers in a chapter sound:');
  say('  all prose          ', apart('both'));
  say('  the model\'s alone  ', apart('model'));
  say('  written by hand    ', apart('human'));

  console.log('\n  How far a speaker sounds from the narrator:');
  say('  all prose          ', fromN('both'));
  say('  the model\'s alone  ', fromN('model'));
  say('  written by hand    ', fromN('human'));

  // THE CHECK ON THE BEAT TIER. The same chapters scored with beats switched off: if the weaker
  // inference were adding noise, this median would part company with the one above. Printed side
  // by side rather than argued about, and nothing here claims they agree — read both numbers.
  console.log('\n  The same chapters, speech tags only (the beat tier switched off):');
  say('  all prose          ', all.map((r) => r.tagOnly).filter((x): x is number => x !== null));

  if (LIMIT) {
    console.log('\n  Chapters where two people sound most alike:');
    for (const r of rows.filter((x) => x.who === 'both' && x.s.apart !== null)
      .sort((a, b) => a.s.apart! - b.s.apart!).slice(0, LIMIT)) {
      console.log(`  ${r.s.apart!.toFixed(3)}  ${r.s.speakers.join(' / ').padEnd(24)}  ${r.chapter}`);
    }
  }
}
