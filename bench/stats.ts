// Exact two-tailed tests, so a finding's p-value stops being worked out by hand.
//
//   node --experimental-strip-types bench/stats.ts        # the self-check, no model
//
// WHY THIS EXISTS. F52 recorded the error it was written to prevent: "The first pass computed the
// name-mention p from the ROUNDED densities printed by the report and got 0.047, which reads as
// significant. Recounted exactly, it is 0.072. A number derived from a rounded number is not a
// measurement, and this one crossed the line that decides what gets shipped."
//
// So both functions here take COUNTS, never rates, and the caller cannot pass a rounded number
// without noticing. Two tests, because this project measures two shapes:
//
//   fisher    a 2x2 table — "of the runs that name him, how many acted" (F51's binary rate)
//   poisson   two event counts over two exposures — "his action per 1,000 words" (F52's density)
//
// Both are EXACT rather than normal approximations: the counts here run from single digits to a
// few hundred, which is exactly where a chi-square or a z-test on rates starts lying.

/** log(n!) via lgamma, so the factorials in the hypergeometric do not overflow at n in the
 *  thousands. Lanczos, 7 terms — good to ~15 significant figures over the range this sees. */
function lgamma(x: number): number {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
             -176.61502916214059, 12.507343278686905, -0.13857109526572012,
             9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < g.length; i++) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
const lnFact = (n: number) => lgamma(n + 1);
const lnChoose = (n: number, k: number) => lnFact(n) - lnFact(k) - lnFact(n - k);

/** Fisher's exact test on [[a,b],[c,d]], two-tailed.
 *
 *  Two-tailed BY SUMMING EVERY TABLE AT OR BELOW THE OBSERVED PROBABILITY, which is the
 *  conventional definition and not "double the one-tailed p" — the two disagree on an asymmetric
 *  table, and this project's tables are asymmetric whenever the treatment moves the denominator.
 */
export function fisher(a: number, b: number, c: number, d: number): number {
  for (const v of [a, b, c, d]) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`fisher takes non-negative integer COUNTS, got ${v}`);
  }
  const r1 = a + b, r2 = c + d, c1 = a + c, c2 = b + d, n = r1 + r2;
  if (!n || !r1 || !r2 || !c1 || !c2) return 1;
  const ln = (x: number) => lnChoose(r1, x) + lnChoose(r2, c1 - x) - lnChoose(n, c1);
  const obs = ln(a);
  let p = 0;
  const lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1);
  for (let x = lo; x <= hi; x++) {
    const l = ln(x);
    // 1e-7 of slack in log space: a table that is the mirror of the observed one differs only by
    // floating point, and dropping it would halve a symmetric p.
    if (l <= obs + 1e-7) p += Math.exp(l);
  }
  return Math.min(1, p);
}

/** Two Poisson rates compared, two-tailed, exact.
 *
 *  `k1` events over exposure `e1` against `k2` over `e2` — for this repo, events are hits and
 *  exposure is words of narration. Conditional on the total, k1 is Binomial(k1+k2, e1/(e1+e2)) if
 *  the rates are equal, so this is an exact binomial test and needs no rate as input. THAT is the
 *  point: pass counts and word totals, never "2.54 per 1,000".
 */
export function poisson(k1: number, e1: number, k2: number, e2: number): number {
  for (const v of [k1, k2]) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`poisson takes integer event COUNTS, got ${v}`);
  }
  if (e1 <= 0 || e2 <= 0) throw new Error('exposures must be positive');
  const n = k1 + k2;
  if (!n) return 1;
  const p = e1 / (e1 + e2);
  const ln = (x: number) => lnChoose(n, x) + x * Math.log(p) + (n - x) * Math.log1p(-p);
  const obs = ln(k1);
  let acc = 0;
  for (let x = 0; x <= n; x++) {
    const l = ln(x);
    if (l <= obs + 1e-7) acc += Math.exp(l);
  }
  return Math.min(1, acc);
}

/** A rate per 1,000 words, for PRINTING only. Never feed this back into a test — see the note at
 *  the top of this file, which is a finding, not a style preference. */
export const per1000 = (k: number, words: number) => (k / Math.max(words, 1) * 1000).toFixed(2);

// ---- the self-check. Every expected value below is from R's fisher.test / binom.test. ----
if (import.meta.filename === process.argv[1]) {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const close = (got: number, want: number, what: string, tol = 5e-4) => {
    n++;
    assert.ok(Math.abs(got - want) < tol,
      `${what}: got ${got.toFixed(6)}, expected ~${want}`);
    console.log(`  ok  ${what} = ${got.toFixed(4)}`);
  };

  // F51's own table, which is the reason this file's tolerance matters: the finding reports
  // p = 0.042 and p = 0.008, and those have to reproduce here or one of the two is wrong.
  close(fisher(8, 28, 10, 10), 0.0419, "F51 acted-of-those 8/36 vs 10/20");
  close(fisher(36, 29, 20, 45), 0.0077, "F51 names-him 36/65 vs 20/65");
  close(fisher(2, 34, 2, 18), 0.6112, "F51 spoke 2/36 vs 2/20");
  close(fisher(8, 57, 10, 55), 0.8001, "F51 acted-over-all 8/65 vs 10/65");

  // F52's correction, which is the whole reason this file exists.
  //
  // WEAKER THAN THE FOUR ABOVE, AND SAY SO. F51 publishes its 2x2 counts, so those rows are an
  // independent reproduction of its p-values. F52 publishes DENSITIES and event counts but not its
  // word totals, so the exposures here are back-derived from the printed 6.57 and 3.95 per 1,000.
  // That makes these two rows a consistency check — "counts of 31 and 21 at exposures matching the
  // printed densities give the corrected 0.072, not the rounded 0.047" — and not a check of the
  // original arithmetic. If the real word totals ever turn up, put them here.
  close(poisson(31, 4718, 21, 5316), 0.0719, "F52 name density 31 vs 21 (exposures derived)");
  close(poisson(12, 4718, 9, 5316), 0.3878, "F52 action density 12 vs 9 (exposures derived)");

  // The degenerate cases a real run hits: no events at all, and one arm empty.
  close(poisson(0, 1000, 0, 1000), 1, "no events anywhere is p = 1");
  close(fisher(0, 10, 0, 10), 1, "an empty 2x2 column is p = 1");
  // Symmetry: swapping the arms must not move the p-value.
  close(fisher(8, 28, 10, 10) - fisher(10, 10, 8, 28), 0, "fisher is symmetric under arm swap");
  close(poisson(31, 4718, 21, 5316) - poisson(21, 5316, 31, 4718), 0, "poisson is symmetric under arm swap");
  // A rate is a string for printing and must never be a test input.
  assert.strictEqual(per1000(31, 4718), '6.57', 'per1000 matches F52 printed density');
  n++;
  console.log('  ok  per1000 reproduces F52\'s printed 6.57');
  // COUNTS ONLY, enforced. A caller who passes 2.54 gets an error rather than a plausible number.
  assert.throws(() => poisson(2.54 as number, 1000, 1.69, 1000), /integer event COUNTS/,
    'a rounded rate must be refused, not silently floored');
  n++;
  console.log('  ok  a rate passed as a count is refused');

  console.log(`\n${n} checks passed`);
}
