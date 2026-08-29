// Rooms: when a chapter changes somebody, does the change land in the RIGHT room of their card —
// or does all of it go into `facts`, the one room that is supposed to hold what never changes?
//
// #13. This exists because of a measured failure, not a suspicion. The first real chapter end in
// the live library (Test, chapter 2, 2026-08-29) produced three `changed` proposals and all three
// came back with `field: "facts"` and a body carrying several rooms at once —
// `appearance: … interiority: …`. Three for three, in the same shape. A fourth character who
// merely walked through the lobby and said nothing was proposed as changed as well.
//
//   node --experimental-strip-types bench/rooms.ts check     # the graders, no model, no database
//   node --experimental-strip-types bench/rooms.ts [runs]    # both arms, interleaved
//
// NO DATABASE. It drives MEMORY/MEMORY_SCHEMA from `src/prompts.ts` and `roomPieces` from
// `src/routes.ts` — the same three the chapter close uses, never a copy.
//
// BOTH ARMS INTERLEAVED, because nothing here sets a seed and sequential blocks drift with whatever
// the router is doing. One arm applies `roomPieces` to the answer and the other does not; they
// alternate call by call, against the same prompt.
//
// THE DENOMINATOR IS PROPOSALS, NOT CHARACTERS. A pass that proposes nothing scores no wrong rooms
// and would read as perfect, so placement is reported over the proposals actually made and the
// count of those is printed beside it. F10 is the precedent: a probe whose denominator included
// runs that could never have failed could not decide anything.

import { MEMORY, MEMORY_SCHEMA } from '../src/prompts.ts';
import { roomPieces } from '../src/routes.ts';

const SLOTS = [{ name: 'appearance' }, { name: 'facts' }, { name: 'history' }, { name: 'interiority' },
               { name: 'relationships' }, { name: 'role' }, { name: 'voice' }];

// One chapter, four people, and what each one's change actually is. `rooms: []` means the chapter
// did not change them at all — they are the control, and proposing them is the false positive.
// THE CARDS ARE IN THE SHAPE THE LIVE ONES ARE IN, and that is not cosmetic. The first version of
// this fixture used bare one-line descriptions and scored a 4% rewrite rate against the 100% the
// live library produced — so it could not have measured a fix to the thing it was built for. Real
// cards are dense bracketed records several facts long, which is what `cardText` hands the pass.
// A fixture that does not reproduce the failure is a fixture that reports it as absent.
const CAST = [
  { name: 'Ilse',  rooms: ['appearance'],
    card: '[Ilse: 44, harbourmaster at Cordray nine years. Black hair cropped short, a scar through one '
        + 'eyebrow from a winch cable. Keeps the tide book in a canvas satchel, never on the office shelf. '
        + 'Was a bar pilot before the post and does not mention it. Signs her name with one initial.]' },
  { name: 'Marek', rooms: ['interiority'],
    card: '[Marek: 19, her deputy, two winters in the post. Reads the tide book on his own time and has '
        + 'memorised it as far as the spring. Believes the harbour is the safest place on the coast. '
        + 'Sleeps in the office loft because the lodging house is dearer. Calls her ma’am and means it.]' },
  { name: 'Voss',  rooms: ['appearance', 'relationships'],
    card: '[Voss: 51, the pilot who takes ships over the bar. Heavy-set, red-bearded, a drinker at the '
        + 'Anchor and never before a run. Has never lost a hull in twenty years and says so. Ilse trusts '
        + 'him further than she trusts the tide book. Keeps a dog aboard that answers to nobody else.]' },
  { name: 'Tam',   rooms: [],
    card: '[Tam: 13, runs messages between the harbour office and the town for a penny a turn. Faster on '
        + 'the sea wall than on the road and has been told twice not to use it. Cannot read the tide book '
        + 'and pretends otherwise. His mother keeps the laundry on Cross Street.]' },
];

const CHAPTER = `The fire took the east side of the harbour office before anyone reached it with a hose.
Ilse went back in for the tide book and came out with her hands burned to the wrist, and they are
burned still; the surgeon says the scarring will not fade. She did not put them in water. She stood
in the yard holding the book against her chest and would not let anybody look at them.

Marek watched the roof come down and understood, standing there, that the harbour is not safe and
never has been. He has not said so out loud. He has stopped sleeping in the office loft.

Voss came up from the Anchor with his beard singed off on one side and his face raw where the heat
had found it. He told Ilse the fire had started in the tide-book cupboard, which was a lie, and she
knew it was a lie while he was saying it. She has not spoken to him since. Whatever the two of them
were to each other before that night, they are not that now.

Tam ran messages all evening and was sent home at eleven.`;

// ---------------------------------------------------------------------------------------------
// The graders. Each answers one question and they must not be satisfiable by the same answer.
// ---------------------------------------------------------------------------------------------
type Piece = { name: string; field: string | null; body: string };

/** Of the proposals made ABOUT SOMEBODY THE CHAPTER CHANGED, how many name the right room. */
const placement = (ps: Piece[]) => {
  const judged = ps.filter((p) => CAST.some((c) => c.name === p.name && c.rooms.length));
  const right = judged.filter((p) => CAST.find((c) => c.name === p.name)!.rooms.includes(p.field ?? ''));
  const facts = judged.filter((p) => p.field === 'facts');
  return { judged: judged.length, right: right.length, facts: facts.length };
};

/** Did Voss — the one the chapter changed in TWO rooms — come back as both? This is the case the
 *  old shape could not express: one entry per character, one field each. */
const bothRooms = (ps: Piece[]) => {
  const his = new Set(ps.filter((p) => p.name === 'Voss').map((p) => p.field));
  return his.has('appearance') && his.has('relationships');
};

/** IS THE BODY THE SIZE OF A ROOM, or the whole card again?
 *
 *  Measured on the second live chapter end (2026-08-29): the ROOM was right — Halloran to
 *  interiority, Wrenn to appearance, nothing in facts — and both bodies were the character's entire
 *  card restated, with the change folded in. "Halloran: 51, night porter at the Ambersand for nine
 *  years. Keeps the ledger in a hardback book…" under the label `interiority`. Accepting that with
 *  Replace writes the whole description into one room.
 *
 *  Placement could not see it, and would have scored both as successes. So this grades the other
 *  half: what fraction of the card's EXISTING sentences the proposal repeats. A room-sized edit
 *  says the new thing and nothing else; a rewrite carries the card along with it. */
const sentences = (t: string) => String(t).split(/[.;]\s+/)
  .map((x) => x.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim())
  .filter((x) => x.length >= 25);
const echo = (body: string, card: string) => {
  const had = sentences(card);
  if (!had.length) return 0;
  const flat = String(body).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
  return had.filter((x) => flat.includes(x)).length / had.length;
};
/** Over half the card repeated back is a rewrite wearing a room's label. */
const isRewrite = (body: string, card: string) => echo(body, card) > 0.5;

/** Somebody the chapter did not change, proposed anyway. Once per run, per such character. */
const intruders = (ps: Piece[]) =>
  [...new Set(ps.filter((p) => CAST.some((c) => c.name === p.name && !c.rooms.length)).map((p) => p.name))];

if (process.argv[2] === 'check') {
  const { strict: a } = await import('node:assert');
  // BOTH DIRECTIONS, or a grader that never fires reports perfection — F17's rule.
  const perfect: Piece[] = [{ name: 'Ilse', field: 'appearance' }, { name: 'Marek', field: 'interiority' },
                            { name: 'Voss', field: 'appearance' }, { name: 'Voss', field: 'relationships' }];
  const observed: Piece[] = [{ name: 'Ilse', field: 'facts' }, { name: 'Marek', field: 'facts' },
                             { name: 'Voss', field: 'facts' }, { name: 'Tam', field: 'facts' }];
  a.deepEqual(placement(perfect), { judged: 4, right: 4, facts: 0 }, 'a right answer scores right');
  a.deepEqual(placement(observed), { judged: 3, right: 0, facts: 3 },
    'the live failure scores zero placement, and Tam is not in the denominator — he had no room to get right');
  a.equal(bothRooms(perfect), true, 'both of Voss’s rooms counts');
  a.equal(bothRooms(observed), false, 'one entry for Voss does not');
  a.deepEqual(intruders(perfect), [], 'a clean run has no intruder');
  a.deepEqual(intruders(observed), ['Tam'], 'a character the chapter did not change is an intruder');
  // The two cannot be satisfied at once: naming everything wins nothing.
  const greedy: Piece[] = CAST.flatMap((c) => SLOTS.map((s) => ({ name: c.name, field: s.name })));
  a.ok(intruders(greedy).length > 0, 'proposing everybody is caught as intruding, not scored as recall');
  // THE BODY GRADER, BOTH WAYS. The rewrite is the real one Halloran got on 2026-08-29, shortened;
  // the good one says the new thing and nothing else. A grader that cannot tell them apart would
  // report the defect as fixed.
  const card = CAST[0]!.card;
  a.ok(isRewrite(card.replace(/[\[\]]/g, '') + ' Her hands are burned to the wrist now.', card),
    'a body that carries the whole card along with it is a rewrite');
  a.ok(!isRewrite('Her hands are burned to the wrist and the scarring will not fade.', card),
    'a body that says only the new thing is room-sized');
  a.ok(!isRewrite('', card), 'an empty body is not scored as a rewrite');
  console.log('\n  graders agree on a right answer, on the observed failure, and on a greedy one');
  console.log('  and the body grader tells a room-sized edit from the card repeated back\n');
  process.exit(0);
}

const RUNS = Number(process.argv[2] ?? 12);
const { structuredRetry } = await import('../src/llama.ts');
const inForce = CAST.map((c) => c.card).join('\n\n');

// TWO ARMS, one prompt. A third arm ran a REWORDED prompt on 2026-08-29 — "one entry per room",
// a narrowed `facts`, and a sharper merely-present clause — and it lost: placement 69% against the
// splitter's 95%, with `facts` dumping going 3% to 17%. It produced MORE proposals (54 against 38)
// and the extra ones were the bad ones. It was deleted rather than kept, on the precedent of the
// register clause in SYSTEM that measured 98.0 against 98.0. See F46.
const ARMS = [
  { key: 'A', label: 'without splitting', prompt: MEMORY, split: false },
  { key: 'B', label: 'with splitting   ', prompt: MEMORY, split: true },
] as const;
const tally: Record<string, any> = Object.fromEntries(
  ARMS.map((a) => [a.key, { judged: 0, right: 0, facts: 0, both: 0, intr: 0, empty: 0,
                            bodies: 0, rewrites: 0 }]));

for (let i = 0; i < RUNS; i++) {
  for (const { key: arm, prompt, split } of ARMS) {
    const r = await structuredRetry(prompt, `${CHAPTER}\n\n---\n\n${inForce}`, MEMORY_SCHEMA, { max_tokens: 700 });
    const raw: any[] = r.data?.characters ?? [];
    if (!raw.length) { tally[arm].empty++; continue; }
    // Arm B is the shipped path: the answer goes through roomPieces exactly as the route runs it.
    const ps: Piece[] = raw.flatMap((m: any) => {
      const declared = SLOTS.some((s) => s.name === m.field) ? m.field : null;
      const pieces = split ? roomPieces(declared, String(m.body ?? ''), SLOTS)
                           : [{ field: declared, body: String(m.body ?? '') }];
      return pieces.map((p) => ({ name: String(m.name ?? '').trim(), field: p.field, body: p.body }));
    });
    const ps2 = ps as { name: string; field: string | null; body: string }[];
    const pl = placement(ps);
    for (const p of ps2) {
      const c = CAST.find((x) => x.name === p.name);
      if (!c || !c.rooms.length) continue;
      tally[arm].bodies++;
      if (isRewrite(p.body, c.card)) tally[arm].rewrites++;
    }
    tally[arm].judged += pl.judged; tally[arm].right += pl.right; tally[arm].facts += pl.facts;
    if (bothRooms(ps)) tally[arm].both++;
    tally[arm].intr += intruders(ps).length;
  }
  process.stdout.write(`\r  run ${i + 1}/${RUNS}`);
}

const pc = (a: number, b: number) => b ? `${((a / b) * 100).toFixed(0)}%` : '—';
console.log('\n');
for (const { key: arm, label } of ARMS) {
  const t = tally[arm];
  console.log(`  ${label} placed right ${t.right}/${t.judged} (${pc(t.right, t.judged)})`
    + `   landed in facts ${t.facts}/${t.judged} (${pc(t.facts, t.judged)})`
    + `   both of Voss's rooms ${t.both}/${RUNS}`
    + `   proposed someone unchanged ${t.intr}/${RUNS}`
    + `\n                   WHOLE-CARD REWRITES ${t.rewrites}/${t.bodies} (${pc(t.rewrites, t.bodies)})`
    + (t.empty ? `   answered nothing ${t.empty}/${RUNS}` : ''));
}
console.log(`\n  Placement is over PROPOSALS MADE about a character the chapter changed, not over runs:`);
console.log(`  a pass that proposes nothing gets no room wrong. The counts are printed so a small`);
console.log(`  denominator cannot hide inside a percentage.\n`);
