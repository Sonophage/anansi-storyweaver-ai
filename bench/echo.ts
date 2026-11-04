// The echo detector, in one place: bench/repetition.ts reads a take against the book before it, and
// bench/reroll-echo.ts reads a reroll against the take it replaced, from history; bench/reroll-away.ts
// does the same for rerolls it asks for. Benches that must agree on what an echoed phrase is, so none
// keeps its own copy. Importing this runs nothing.
import { narrationWords, openingOf } from '../src/context.ts';

/** Phrase length in words. Five: long enough that ordinary phrases ("she looked at the") rarely
 *  match by chance, short enough that a carried phrase ("the bitter taste a familiar") is seen. */
const ECHO_N = 5;

/** A text's five-word phrases: narration only, words only, lower case. Dialogue is left out: a
 *  character may repeat a line; only the narrator's echo is the complaint. */
export const grams = (s: string) => {
  const w = narrationWords(s);
  const out: string[] = [];
  for (let i = 0; i + ECHO_N <= w.length; i++) out.push(w.slice(i, i + ECHO_N).join(' '));
  return out;
};

/** What a take copies from the text before it: the share of its five-word phrases that already
 *  stand in `before`. A share, not a count, because a shorter take would otherwise read as cleaner
 *  by length alone (F62). */
export function echo(text: string, before: string[]) {
  const prior = new Set(before.flatMap(grams));
  const mine = grams(text);
  const shared = mine.filter((g) => prior.has(g)).length;
  return { echoShare: mine.length ? +(shared / mine.length).toFixed(3) : 0, echoed: shared };
}

/** REJECTED and SCENE for one take. Shares of the take's own phrases, three decimals. `shared` is
 *  the repeated phrases themselves, for `show`. */
export function rerollEcho(take: string, replaced: string, scene: string[]) {
  const sceneGrams = new Set(scene.flatMap(grams));
  const theirs = grams(replaced);
  const old = new Set(theirs.filter((g) => !sceneGrams.has(g)));
  const mine = grams(take);
  const hits = mine.filter((g) => old.has(g));
  // OPENING: the take starts with the rejected take's first five narration words. Every flagged pair
  // read on 2026-11-04 did this: the reroll copied the opening, then went somewhere else.
  return { rejected: mine.length ? +(hits.length / mine.length).toFixed(3) : 0, repeated: hits.length,
           shared: [...new Set(hits)], sameOpening: !!openingOf(replaced) && openingOf(take) === openingOf(replaced),
           sceneShare: echo(take, scene).echoShare, phrases: mine.length };
}
