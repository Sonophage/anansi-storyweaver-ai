// Does the prose contract? Seth, 2026-08-27: "no ai ive used will use contractions in its writing
// even though its in the instructions for the voice."
//
//   node --experimental-strip-types bench/contractions.ts check      # the detector, no model
//   node --experimental-strip-types bench/contractions.ts run [n]    # measured prose, needs both
//
// TWO RULES OF THIS PROJECT SHAPE THE WHOLE FILE.
//
// The denominator is OPPORTUNITIES, not words (F10). "Three contractions in a passage" says
// nothing: a passage with no expandable pair in it could not have contracted and must not dilute
// the rate. So every count here is `contracted / (contracted + expanded)` over the same closed set
// of forms, and a passage with no opportunity is reported as such rather than scored.
//
// And the detector is checked before any number from it is believed (F17). The specific trap:
// a model writes the RIGHT apostrophe, U+2019, and a detector spelling it ' scores fluent prose at
// zero and sends you off to rewrite a prompt that was working. That is not hypothetical — the
// context tokeniser had exactly this bug this morning, where curly-quoted dialogue matched and
// straight-quoted did not. Both are in the cases below, and one of them fails if you drop it.

const APOS = "['’ʼ]";

// ONLY THE UNAMBIGUOUS FORMS, on both sides of the ratio.
//
// Left out on purpose, because counting them would make the number softer, not sharper:
//   's   — "the coat's hem" is a possessive, not "coat is".
//   'd   — "he'd gone" is had, "he'd go" is would; the expansions are two different words.
//   I've — "I have a coat" does not contract in English; only "I have seen" does, and telling
//          those apart needs a parser, not a regex.
// Whatever is excluded from the numerator is excluded from the denominator too, or the rate lies.
const CONTRACTED = new RegExp(
  `\\b\\w+n${APOS}t\\b`                                   // isn't, doesn't, won't, can't
  + `|\\b(?:you|we|they)${APOS}re\\b`                     // you're
  + `|\\bI${APOS}m\\b`                                    // I'm
  + `|\\b(?:I|you|he|she|it|we|they)${APOS}ll\\b`,        // I'll
  'gi');

const EXPANDED = new RegExp(
  `\\b(?:is|are|was|were|do|does|did|have|has|had|will|would|could|should|must|ca|can)\\s+not\\b`
  + `|\\bcannot\\b`
  + `|\\b(?:you|we|they)\\s+are\\b`
  + `|\\bI\\s+am\\b`
  + `|\\b(?:I|you|he|she|it|we|they)\\s+will\\b`,
  'gi');

const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/** Contracted over every place a contraction could have gone. `null` when nothing could have. */
export function rate(text: string): { used: number; missed: number; rate: number | null } {
  const used = count(CONTRACTED, text);
  const missed = count(EXPANDED, text);
  const n = used + missed;
  return { used, missed, rate: n ? used / n : null };
}

// ---- the cases, both directions ----
if (process.argv[2] === 'check') {
  let red = 0;
  const ok = (name: string, pass: boolean) => {
    if (!pass) red++;
    console.log(`  ${pass ? 'ok  ' : 'RED '}${name}`);
  };
  const r = (s: string) => rate(s).rate;

  ok('contracted prose scores 1', r("You aren't listening and I'm not going to say it twice.") === 1);
  ok('expanded prose scores 0', r('You are not listening and I am not going to say it twice.') === 0);
  ok('half and half scores between', (r("It isn't cold. You are not dressed for it.") ?? -1) === 0.5);

  // The trap this file exists to avoid.
  ok('a curly apostrophe counts as a contraction',
     r('You’re early and it doesn’t matter.') === 1);
  ok('and straight and curly score the same',
     r("You're early and it doesn't matter.") === r('You’re early and it doesn’t matter.'));

  // Excluded forms must move NEITHER half of the ratio.
  ok('a possessive is not a contraction', rate("The coat's hem was wet.").used === 0);
  ok('and does not become an opportunity either', rate("The coat's hem was wet.").missed === 0);
  ok("a bare 'd is left alone", rate("He'd gone by then.").used === 0);
  ok('"I have a coat" is not a missed contraction', rate('I have a coat.').missed === 0);

  // No opportunity is not the same as a failure. F12: a zero is not an absence.
  ok('prose with no opportunity reports null, not zero', rate('The room was cold.').rate === null);

  // Every form in the numerator has a partner in the denominator, or the rate is not a rate.
  ok('cannot is an opportunity', rate('She cannot swim.').missed === 1);
  ok('will not is an opportunity', rate('He will not come.').missed === 1);
  ok('"they will" is an opportunity', rate('They will come.').missed === 1);
  ok("won't is a contraction", rate("He won't come.").used === 1);

  console.log(red ? `\n  ${red} RED` : '\n  all green');
  process.exit(red ? 1 : 0);
}

if (process.argv[2] === 'run') {
  const { narrationOnly } = await import('../src/context.ts');
  const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
  const N = Number(process.argv[3] ?? 6);
  const j = (u: string, b?: unknown) => fetch(B + u, b ? { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any);

  const { stories } = await j('/api/stories');
  const story = stories[0];
  if (!story) { console.log('no story to write in'); process.exit(1); }
  console.log(`  ${N} passages in "${story.title}"\n`);

  // Narration and dialogue are counted apart. They are different claims: a model that contracts
  // freely inside quotation marks and never outside them has a NARRATOR that will not contract,
  // which is a voice problem; one that does neither is not following the instruction at all. A
  // single blended number cannot tell those two apart and would send the fix to the wrong place.
  let nUsed = 0, nMissed = 0, dUsed = 0, dMissed = 0, wrote = 0, hadChance = 0;

  for (let i = 0; i < N; i++) {
    const r = await j('/api/generate', { storyId: story.id, mode: 'direct',
      directive: 'Continue the scene.' });
    if (r.error) { console.log(`  ${i + 1}: ${r.error}`); continue; }
    // The route answers with `prose`. Guessing `passage.body` scored six real passages as
    // empty and reported "no opportunity" — which is why every skipped trial is printed rather
    // than folded into a denominator: a silent zero here would have read as a finding.
    const body = String(r.prose ?? '');
    if (!body.trim()) { console.log(`  ${i + 1}: empty`); continue; }
    wrote++;
    const narr = narrationOnly(body);
    // Everything the narration stripper removed is the spoken half.
    const spoken = body.length > narr.length ? body : '';
    const n = rate(narr);
    const d = rate(spoken ? body : '');
    nUsed += n.used; nMissed += n.missed;
    dUsed += Math.max(0, d.used - n.used); dMissed += Math.max(0, d.missed - n.missed);
    if (n.rate !== null) hadChance++;
    console.log(`  ${i + 1}: narration ${n.used}/${n.used + n.missed}`
      + `${n.rate === null ? ' (no opportunity)' : ` = ${(n.rate * 100).toFixed(0)}%`}`);
  }

  const say = (label: string, used: number, missed: number) => {
    const tot = used + missed;
    console.log(tot
      ? `  ${label}: ${used}/${tot} = ${((used / tot) * 100).toFixed(1)}%`
      : `  ${label}: no opportunity in any passage — nothing to report`);
  };
  console.log(`\n  ${wrote} passages written, ${hadChance} of them with a place a contraction could go`);
  say('narration', nUsed, nMissed);
  say('dialogue ', dUsed, dMissed);
}
