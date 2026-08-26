// Anansi's voice, measured rather than admired.
//
// F26 was four probes run by hand, and its two residuals — instructions leaking into the reply, and
// unasked proposals appearing on one run and not the next — are exactly what a personality change is
// most likely to make worse. So the change gets a probe, and the probe gets a detector that is
// checked before any result from it is believed.
//
//   node --experimental-strip-types bench/voice.ts check        # the detectors, no model
//   node --experimental-strip-types bench/voice.ts run [n]      # the four probes, needs the model
//
// The reported number is per probe, not a rate: four probes on one story is behaviour, not a
// frequency, and F26 says so about its own table.
const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';

/** Does the reply name what it drew on? A bare fact from nowhere is the one thing that makes Anansi
 *  no use — the prompt says so, and this is that clause made checkable.
 *
 *  Deliberately shallow: it looks for the shape of a citation ("from her entry", "chapter 4",
 *  "her entry says"), not for a correct one. A wrong citation is a different defect and needs the
 *  ledger to detect; this only catches assertion from nowhere. */
export const cites = (reply: string) =>
  /\b(from|in|per|according to)\s+(her|his|their|the|its)?\s*(entry|entries|summary|summaries|passage|chapter|ledger|canon)\b/i.test(reply)
  || /\b(entry|summary|passage|chapter \d+|canon)\b[^.?!]{0,24}\b(says|has|gives|puts|names|records)\b/i.test(reply)
  || /\bchapter \d+\b/i.test(reply);

/** An instruction to the writing model, sitting in the reply where the writer cannot use it.
 *  F26's first residual. "end with a gesture from Vel", "have her refuse". */
export const instructs = (reply: string) =>
  /\b(end|open|begin|close)\s+(the\s+\w+\s+)?with\b/i.test(reply)
  || /\b[Hh]ave\s+(her|him|them|[A-Z][a-z]+)\s+[a-z]+/.test(reply)
  || /\b(write|start|show|make)\s+(it|her|him|them|the scene)\b/i.test(reply);

/** Anansi offering work nobody asked for. A question wants an answer, not a queue.
 *  Counted from the API's own fields rather than sniffed out of the prose. */
export const unasked = (r: any, askedFor: boolean) =>
  askedFor ? 0 : ((r?.threads?.length ?? 0) + (r?.strings?.length ?? 0) + (r?.directive ? 1 : 0));

/** The register we chose: hands back a loose end. Present is good, present EVERY time is a tic.
 *  Not a pass/fail on one reply — the run reports how many of the probes did it. */
export const offersLooseEnd = (reply: string) =>
  /\b(nobody|no one|nothing|not once|never)\b[^.?!]{0,80}\b(asked|said|answered|opened|called|explained|argued)\b/i.test(reply)
  || /\byou (have|'ve) (not|never)\b/i.test(reply);

// ---- the detector, checked both ways. A detector that never fires reports perfection. ----
type Case = [string, Partial<Record<'cites' | 'instructs' | 'looseEnd', boolean>>, string];
const CASES: Case[] = [
  ['Green. From her entry, and unchanged since chapter one.',
   { cites: true, instructs: false }, 'the ordinary cited answer'],
  ['Green.', { cites: false }, 'a bare fact from nowhere is the failure F26 named'],
  ['Her entry says green.', { cites: true }, 'a citation without the preposition still counts'],
  ['The story does not say.', { cites: false, instructs: false },
   'a refusal cites nothing and must not read as an instruction'],
  ['Chapter 4 has her leaving before the bell.', { cites: true }, 'a chapter number is a citation'],
  ['End the passage with a gesture from Vel.', { instructs: true },
   'an instruction to the writing model, in the reply, where the writer cannot use it'],
  ['Have her refuse, and let Aldis notice.', { instructs: true }, 'the other shape of the same leak'],
  ['She refuses him twice in chapter 3.', { instructs: false, cites: true },
   'narration ABOUT a refusal is not an instruction to write one — the case that made the first '
   + 'version of this detector useless'],
  ['Green, from her entry. Nobody has asked her why she lies about it.',
   { looseEnd: true, cites: true }, 'the register we chose: answer, then the loose end'],
  ['Green, from her entry.', { looseEnd: false },
   'and the empty case, because a detector that cannot report zero reports perfection'],
  ['Green. You have not used it yet.', { looseEnd: true }, 'the other shape of the loose end'],
];

if (process.argv[2] === 'check') {
  let bad = 0;
  for (const [text, want, why] of CASES) {
    const got = { cites: cites(text), instructs: instructs(text), looseEnd: offersLooseEnd(text) };
    for (const [k, v] of Object.entries(want))
      if ((got as any)[k] !== v) {
        bad++;
        console.log(`  RED  ${k}=${(got as any)[k]}, wanted ${v} — ${why}\n       ${JSON.stringify(text)}`);
      }
  }
  console.log(bad ? `\n  ${bad} RED — do not believe a result from this`
                  : `\n  ${CASES.length} cases, all green`);
  process.exit(bad ? 1 : 0);
}

// ---- the live probes. F26's four, plus one that asks for nothing at all. ----
const j = (u: string, b?: unknown, m = 'POST') => fetch(B + u, b
  ? { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }
  : {}).then((r) => r.json() as any);

// [what to ask, was a directive asked for, could a citation have been possible]
//
// The third flag is F10's lesson: "who is <somebody not in this book>" answers "the story does not
// say", which cites nothing and is CORRECT to cite nothing. Counting it as uncited buries the real
// rate in trials that could never have passed. So the cited score is reported over the probes where
// a citation was possible, and the refusal probe is scored the other way round — it must NOT cite,
// and it must not grow a loose end either, because there is nothing to be loose.
const PROBES: [string, boolean, boolean][] = [
  ['what colour are her eyes', false, true],
  ['who is Vel', false, true],
  ['what is this story about', false, true],
  ['who is Ondrel Kesh', false, false],      // nobody. The refusal path.
  ['set up a scene', true, true],
];

const { stories } = await j('/api/stories', undefined, 'GET');
const story = stories?.[0];
if (!story) { console.log('  no story to probe'); process.exit(1); }
console.log(`  probing "${story.title}"\n`);

const rounds = Number(process.argv[3] ?? 1);
let looseEnds = 0, total = 0, couldCite = 0, didCite = 0, leaked = 0, unaskedTotal = 0, misplaced = 0;
const transcript: string[] = [];
for (let round = 0; round < rounds; round++) {
  for (const [ask, askedFor, citable] of PROBES) {
    const r = await j('/api/talk', { storyId: story.id, said: ask });
    if (r.error) { console.log(`  ${ask}: ${r.error}`); continue; }
    const reply = String(r.reply ?? '');
    total++;
    const loose = offersLooseEnd(reply);
    const cited = cites(reply);
    if (loose) looseEnds++;
    if (citable) { couldCite++; if (cited) didCite++; }
    if (instructs(reply)) leaked++;
    unaskedTotal += unasked(r, askedFor);
    // F26 measured this and it is the half the length columns cannot see: when a directive IS
    // asked for it must arrive in the FIELD, because an instruction sitting in the reply is one the
    // writer cannot press a button on. Reported separately from the leak count — that one is about
    // directives nobody asked for.
    if (askedFor) {
      const inField = !!String(r.directive ?? '').trim();
      if (!inField) misplaced++;
      console.log(`      directive: ${inField ? 'in the field' : 'MISSING from the field'}`
        + `  (${String(r.directive ?? '').length} ch)`);
    }
    transcript.push(`### ${ask}\n${reply}\n`);
    console.log(`  ${ask.padEnd(26)} ${String(reply.length).padStart(5)} ch`
      + `  cited=${citable ? (cited ? 'y' : 'N') : (cited ? 'Y?' : '-')}`
      + `  instructs=${instructs(reply) ? 'Y' : 'n'}`
      + `  unasked=${unasked(r, askedFor)}`
      + `  looseEnd=${loose ? 'y' : '-'}`);
  }
}
// The informative denominator, not the total: only the probes where a citation was possible.
console.log(`\n  cited ${didCite}/${couldCite} where a citation was possible`
  + `  ·  instructions leaked ${leaked}/${total}`
  + `  ·  unasked offers ${unaskedTotal}`
  + `  ·  directives not in the field ${misplaced}`);
// The register asked for a habit, not a tic. Every probe doing it is as wrong as none.
console.log(`  loose end offered on ${looseEnds}/${total} probes`
  + ` — a habit, not a tic: every one of them is as wrong as none.`);
if (process.env.VOICE_TRANSCRIPT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.VOICE_TRANSCRIPT, transcript.join('\n'));
  console.log(`  replies written to ${process.env.VOICE_TRANSCRIPT}`);
}
