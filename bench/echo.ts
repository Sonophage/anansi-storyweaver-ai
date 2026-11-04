// The echo detector, in one place: bench/repetition.ts reads a take against the book before it, and
// bench/reroll-echo.ts reads a reroll against the take it replaced. Two benches that must agree on
// what an echoed phrase is, so neither keeps its own copy. Importing this runs nothing.
import { narrationOnly } from '../src/context.ts';

/** Phrase length in words. Five: long enough that ordinary phrases ("she looked at the") rarely
 *  match by chance, short enough that a carried phrase ("the bitter taste a familiar") is seen. */
const ECHO_N = 5;

/** A text's five-word phrases: narration only, words only, lower case. Dialogue is left out: a
 *  character may repeat a line; only the narrator's echo is the complaint. */
export const grams = (s: string) => {
  const w = narrationOnly(s).toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? [];
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
