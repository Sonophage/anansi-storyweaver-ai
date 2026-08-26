// The detectors for Anansi's voice, and the cases that check them.
//
// Their own file for the reason verdict.ts is its own file: a classifier with two callers drifts
// into two classifiers. bench/voice.ts runs the probes; anything scoring saved replies imports from
// here, and neither can quietly disagree with the other about what a citation is.
//
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


/** Does the reply name what it drew on? A bare fact from nowhere is the one thing that makes Anansi
 *  no use — the prompt says so, and this is that clause made checkable.
 *
 *  Deliberately shallow: it looks for the shape of a citation ("from her entry", "chapter 4",
 *  "her entry says"), not for a correct one. A wrong citation is a different defect and needs the
 *  ledger to detect; this only catches assertion from nowhere. */
export const cites = (reply: string) =>
  /\b(from|in|per|according to)\s+(her|his|their|the|its)?\s*(entry|entries|summary|summaries|passage|chapter|ledger|canon)\b/i.test(reply)
  || /\b(entry|summary|passage|chapter \d+|canon)\b[^.?!]{0,24}\b(says|has|gives|puts|names|records)\b/i.test(reply)
  || /\bchapter\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.test(reply)
  // "Her entry, chapter one" — a possessive or an article in front of the source is a citation, and
  // the shape the new voice actually writes. Found by reading a reply the detector scored as
  // uncited when it plainly cited: the first version wanted a digit.
  || /\b(her|his|their|its|the)\s+(entry|entries|summary|summaries|passage|ledger)\b/i.test(reply);

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
export type Case = [string, Partial<Record<'cites' | 'instructs' | 'looseEnd', boolean>>, string];
export const CASES: Case[] = [
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
  ['Green. Her entry, chapter one, and nothing has argued with it since.', { cites: true },
   'a citation written in words, which the first version of this detector could not see'],
  ['Green. Chapter two has her lying about it.', { cites: true }, 'and a spelled chapter number'],
  ['She is a difficult woman.', { cites: false },
   'and the empty case again, now that the citation shapes are looser'],
];

