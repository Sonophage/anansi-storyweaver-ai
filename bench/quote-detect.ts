// The verbatim-canon detector, and the cases that check it.
//
// Its own file for the reason voice-detect.ts and verdict.ts are: a classifier with two callers
// drifts into two classifiers. bench/quote.ts runs the generations; anything scoring saved prose
// imports from here.
//
//
//   node --experimental-strip-types bench/quote.ts check      # the detector, no model
//   node --experimental-strip-types bench/quote.ts run [n]    # generate and measure, needs the model
//
// The failure this exists for: an always-on entry whose body reads as finished English is in EVERY
// prompt, so the model reaches for its phrasing when it needs a noun. Measured on a real passage —
// "wearing a thrifted military jacket and carrying a weather-beaten Martin guitar" came back as
// "the thrifted military jacket swallowing her frame" and "pulls out a weather-beaten Martin guitar",
// the second jammed into a sentence built for a cigarette: "and taps one against the filter".
//
// A check against canon cannot see this class at all. Canon SAYS she carries that guitar, so a
// passage saying she carries it agrees with canon perfectly; the incoherence is internal.

/** Words to n-grams, punctuation and case thrown away. */
const grams = (text: string, n: number): string[] => {
  const w = String(text ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' '));
  return out;
};

/** A run has to carry weight, not just length. "she looks at the" is four words of nothing and
 *  appears in every book ever written; "weather beaten martin guitar" is four words of somebody's
 *  ledger. Three tokens over three characters is the line, and it is what stops this reporting
 *  every passage as a quote. */
const weighty = (g: string) => g.split(' ').filter((t) => t.length > 3).length >= 3;

/** The longest run of words the passage shares with any canon body, and how many runs there are.
 *
 *  N is 3, not 4, and that was measured rather than chosen: the second real lift — canon's "a
 *  thrifted military jacket" arriving as "the thrifted military jacket" — shares only three words,
 *  because the article changed. At 4 the detector reported that passage clean. What makes 3 safe is
 *  `weighty` and not the length. */
export function quoted(prose: string, canon: string[], n = 3) {
  const inCanon = new Set<string>();
  for (const c of canon) for (const g of grams(c, n)) inCanon.add(g);
  const hits = [...new Set(grams(prose, n).filter((g) => inCanon.has(g) && weighty(g)))];
  // Longest shared run, grown from the hits rather than searched for separately.
  let longest = '';
  for (const h of hits) {
    let run = h;
    for (let len = n + 1; len <= 14; len++) {
      const bigger = grams(prose, len).find((g) => g.startsWith(h) && canon.some((c) =>
        grams(c, len).includes(g)));
      if (!bigger) break;
      run = bigger;
    }
    if (run.length > longest.length) longest = run;
  }
  return { runs: hits.length, longest, hits };
}

export const CANON = [
  '[Halsey: The Musician. A biracial, bisexual, bipolar artist hiding behind a constructed name, '
  + 'wearing a thrifted military jacket and carrying a weather-beaten Martin guitar.]',
];

export const CASES: [string, boolean, string][] = [
  ['She reaches into her pocket, pulls out a weather-beaten Martin guitar, and taps one against the filter.',
   true, 'the real failure: four words of the ledger, verbatim, in a sentence built for something else'],
  ['the thrifted military jacket swallowing her frame', true, 'and the other lift from the same entry'],
  ['Her jacket was army surplus, two sizes too big, and the guitar case had been round the world twice.',
   false, 'the same FACTS in the writer’s own words are not a quote — this is what writing from canon looks like'],
  ['She looks at the window and then at the door.', false,
   'words shared with nothing: a detector that flags this flags every passage'],
  // The case that justifies `weighty`, and it was missing: this DOES share a three-word run with
  // canon — "hiding behind a" — and is plainly not a quote. Without the weight guard the detector
  // flags it, and every other passage containing three ordinary words in a row.
  ['She had been hiding behind a lamppost since the rain started.', false,
   'a three-word run of function words is not a quote — this is what the weight guard is for'],
  ['Halsey sets the case down.', false, 'a name is not a quote, or every passage naming a character flags'],
  ['', false, 'the empty case, because a detector that cannot report zero reports perfection'],
];

