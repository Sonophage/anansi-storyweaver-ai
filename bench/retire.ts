// Retire: does the scan finish what a chapter finished, and — the number that decides everything —
// how often does it finish something that is merely offstage?
//
// PLAN-08 Phase 4. The write path, the screen and the way back all stand on their own; this is the
// gate on believing the MODEL half, and F27 is why it exists. F27 asked whether the keys the model
// invents are any good and the answer was that every one of them was the entry's own title repeated
// — not sometimes, all of them. A retirement is the same kind of judgement with a far worse failure:
// a card wrongly finished stops reaching the model for the rest of the book while its card goes on
// sitting on the Threads screen looking alive. Nothing on screen says the model has stopped being
// told about her. It reads as the model forgetting.
//
//   node --experimental-strip-types bench/retire.ts check   # the graders, no model, no database
//   node --experimental-strip-types bench/retire.ts [runs]  # the scan, model, still no database
//
// NO DATABASE AT ALL. It imports `retirable` from `src/context.ts` and `RETIRE`/`retireSchema` from
// `src/prompts.ts` — the same three the route uses, never a copy — and drives them directly. What a
// test can check deterministically (the proposal shape, the threshold, what accept writes) is
// checked in `test/memory.ts` against a fake server. This measures the one thing a test cannot: the
// model's judgement.
//
// THE ASYMMETRY IS THE WHOLE POINT, and it is why recall is the less interesting number. Missing a
// finished card costs one card firing a few chapters too long, which F39 priced at a rounding error
// against the ceiling. Finishing a live one removes a character from the book.
//
// A SCAN THAT FINISHES EVERYTHING SCORES PERFECT RECALL. That is the smoke alarm that never stops
// beeping: it detects every fire. So recall is never printed without the false-finish rate beside
// it, and `check` asserts that the two graders cannot be satisfied by the same answer.

import { retirable, type Entry } from '../src/context.ts';
import { RETIRE, retireSchema } from '../src/prompts.ts';

/** `changed` is the label Seth's rule of 2026-08-29 added: the chapter DID end this thing — the
 *  building burned, the object was destroyed — and it must still never be proposed as finished,
 *  because a place gets revisited and an object goes on being referred to. What happened to it
 *  belongs in its `history` or `provenance` room. It is scored as a card that must not be
 *  finished, and the gate should refuse it before the model ever sees it. */
type Label = 'finished' | 'offstage' | 'background' | 'changed';
interface Card { title: string; body: string; keys: string[]; kind: Entry['entryType']; label: Label }
interface Case { name: string; direction: string; chapter: string; cards: Card[] }

const entryOf = (c: Card): Entry => ({
  id: `e-${c.title}`, title: c.title, body: c.body, entryType: c.kind,
  activation: 'triggered', keys: c.keys, lastEditor: 'human',
});

/** The rule of three, on the denominator this probe actually has. A zero is not an absence: F12
 *  declared a defect gone on zero-in-sixty when the true rate was 4%.
 *
 *  ponytail: a third copy of the rule of three — `bench/ledger-audit.ts:86` and
 *  `bench/utilisation.ts:57` are the other two. Not imported, because importing either module runs
 *  its whole report at load: both open a database and print. Ceiling: three copies to keep in step.
 *  Upgrade path is a `bench/rate.ts` holding this one function, on the day a fourth wants it. */
const bound = (n: number) => n < 4
  ? `${n} chance${n === 1 ? '' : 's'} is too few to bound a rate`
  : `under ${(300 / n).toFixed(1)}%, not never`;

// ---- the fixture --------------------------------------------------------
//
// Hand-written, and every card is labelled by what the NARRATION commits about it. The labels are
// one reader's judgement of what "finished" means and that is a ceiling on every number below —
// printed at the end rather than buried here.
const CASES: Case[] = [
  {
    name: 'a death on the page',
    direction: 'The book ends at the Ambersand, with Wrenn holding the ledger.',
    chapter:
      'Kestrel went down on the stair and did not get up. The blood went into the grout and stayed '
      + 'there. Wrenn rode north before the bell and was not seen again that night. The Ambersand '
      + 'kept its doors shut. "He is fine," the porter said, "he is only winded."',
    cards: [
      { title: 'Kestrel', body: '[Kestrel: a fence, forty, bad knee]', keys: ['Kestrel'],
        kind: 'character', label: 'finished' },
      { title: 'Wrenn', body: '[Wrenn: keeps the ledger, owes nobody]', keys: ['Wrenn'],
        kind: 'character', label: 'offstage' },
      { title: 'the Ambersand', body: '[the Ambersand: a house that lends at ruin]',
        keys: ['Ambersand'], kind: 'lore', label: 'background' },
    ],
  },
  {
    name: 'a building burns, a law is repealed, and a man is only missing',
    direction: 'Halloway comes back in the last act with what he took.',
    chapter:
      'The Sallow Gate burned to the ground before morning and the stone went to lime. The Gate '
      + 'Toll was struck off the book the same day and nobody has paid it since. Nobody found '
      + 'Halloway in the fire, and nobody found him anywhere else either. The Long Market opened '
      + 'as it always opens.',
    cards: [
      // BURNED, AND STILL NOT FINISHED. The place gets walked through for the rest of the book and
      // the model needs to know it is a ruin now — which is its `history`, not its absence.
      { title: 'the Sallow Gate', body: '[the Sallow Gate: timber, four centuries, a toll]',
        keys: ['Sallow Gate'], kind: 'lore', label: 'changed' },
      { title: 'the Gate Toll', body: '[the Gate Toll: a coin to pass, paid at dawn]',
        keys: ['Gate Toll'], kind: 'rule', label: 'finished' },
      { title: 'Halloway', body: '[Halloway: took the seal and ran]', keys: ['Halloway'],
        kind: 'character', label: 'offstage' },
      { title: 'the Long Market', body: '[the Long Market: opens at dawn, closes at dusk]',
        keys: ['Long Market'], kind: 'lore', label: 'background' },
    ],
  },
  {
    name: 'nothing finished at all',
    direction: 'Ismene is the whole of the third act.',
    chapter:
      'Ismene Faal counted the coins twice and came up short both times. The rain did not stop. The '
      + 'Iron Bridge held, as it has held for two hundred years, and the Watch went home.',
    cards: [
      { title: 'Ismene Faal', body: '[Ismene Faal: counts what she is owed]', keys: ['Ismene'],
        kind: 'character', label: 'offstage' },
      { title: 'the Iron Bridge', body: '[the Iron Bridge: two hundred years, never repaired]',
        keys: ['Iron Bridge'], kind: 'lore', label: 'background' },
      { title: 'the Watch', body: '[the Watch: takes bribes, keeps order]', keys: ['Watch'],
        kind: 'rule', label: 'background' },
    ],
  },
  {
    // THE CASE THE DIRECTION CLAUSE EXISTS FOR, and the first run of this probe did not have it.
    // Every other case above is unambiguous from the prose alone, so both arms scored identically
    // and the comparison decided nothing — which reads as "the clause is decoration" and is not
    // the same statement. Here the chapter commits language that sounds final about two cards the
    // writer has said out loud are coming back. If the arms still match on THIS, the clause really
    // is buying nothing.
    name: 'the chapter reads final, and the writer says otherwise',
    direction: 'The Vestry reopens in the last act, and Cazalet is the one who opens it. Neither is '
      + 'done. The book cannot end without them.',
    chapter:
      'The Vestry closed its doors for the last time and the sign came down off the wall. Cazalet '
      + 'walked out through the yard and did not look back at any of it; whatever he had been to '
      + 'that place was over, and everyone standing there knew it. The Ferry ran on the hour, the '
      + 'way it always has.',
    cards: [
      { title: 'the Vestry', body: '[the Vestry: where the old debts are kept]', keys: ['Vestry'],
        kind: 'lore', label: 'offstage' },
      { title: 'Cazalet', body: '[Cazalet: kept the Vestry, keeps its keys]', keys: ['Cazalet'],
        kind: 'character', label: 'offstage' },
      { title: 'the Ferry', body: '[the Ferry: hourly, and never early]', keys: ['Ferry'],
        kind: 'lore', label: 'background' },
    ],
  },
];

// ---- the check. Nothing below the live-run line runs until this is green. ----

if (process.argv[2] === 'check') {
  const { strict: assert } = await import('node:assert');
  let n = 0;
  const ok = (label: string, got: boolean) => { assert.equal(got, true, label); n++; console.log('  ok  ' + label); };

  console.log('\n  retire check — the graders and the gate, before anything they say is believed\n');

  // THE GATE FIRST, because folding it into the model's score is how a gate failure hides as a
  // model success: a `retirable` that admits nothing reports a perfect false-finish rate forever.
  for (const c of CASES) {
    const admitted = retirable(c.cards.map(entryOf), c.chapter).map((e) => e.title);
    ok(`${c.name}: the gate admits ${admitted.length} of ${c.cards.length} cards`,
       admitted.length > 0 && admitted.length <= c.cards.length);
    for (const f of c.cards.filter((x) => x.label === 'finished')) {
      ok(`  and the finished card "${f.title}" took the test rather than being dropped by the gate`,
         admitted.includes(f.title));
    }
    // AND THE RULE ITSELF, asserted at the gate rather than hoped for from the model: a place or an
    // object is never offered, so it cannot be finished however final the prose reads.
    for (const x of c.cards.filter((x) => x.kind === 'lore' || x.kind === 'item')) {
      ok(`  and "${x.title}" is never offered, because a ${x.kind === 'lore' ? 'place' : 'thing'} changes rather than ends`,
         !admitted.includes(x.title));
    }
  }

  // The two graders, and the assertion that they cannot both be satisfied by one answer. This is
  // the check that stops "it proposed everything" from reading as success.
  const score = (c: Case, named: string[]) => {
    const by = new Map(c.cards.map((x) => [x.title, x.label]));
    return {
      recall: named.filter((t) => by.get(t) === 'finished').length,
      wrong:  named.filter((t) => by.get(t) && by.get(t) !== 'finished').length,
    };
  };
  const one = CASES[0];
  ok('a proposal for a finished card scores recall and not a false finish',
     JSON.stringify(score(one, ['Kestrel'])) === JSON.stringify({ recall: 1, wrong: 0 }));
  ok('a proposal for a card that is merely offstage scores a false finish and not recall',
     JSON.stringify(score(one, ['Wrenn'])) === JSON.stringify({ recall: 0, wrong: 1 }));
  ok('a proposal for a card that is simply present scores a false finish too',
     JSON.stringify(score(one, ['the Ambersand'])) === JSON.stringify({ recall: 0, wrong: 1 }));
  ok('NAMING EVERYTHING SCORES FULL RECALL AND FULL DAMAGE — the two are never one number',
     JSON.stringify(score(one, one.cards.map((x) => x.title))) === JSON.stringify({ recall: 1, wrong: 2 }));
  ok('an empty answer is a miss and not a pass',
     JSON.stringify(score(one, [])) === JSON.stringify({ recall: 0, wrong: 0 }));

  // The direction arm has to be a real arm, or the with/without comparison compares one thing.
  ok('the direction reaches the prompt when there is one', RETIRE(one.direction).includes(one.direction));
  ok('  and the blank arm carries no trace of it', !RETIRE('').includes('WHERE THIS STORY IS GOING'));

  // A grammar, not a suggestion: the card names are an enum, which is why the report can score on
  // exact titles and the route needs no fuzzy matcher.
  ok('the schema constrains the answer to the cards that were offered',
     JSON.stringify((retireSchema(['A', 'B']) as any).properties.finished.items.properties.card.enum)
       === JSON.stringify(['A', 'B']));

  ok('a bound on one chance prints no percentage', !/%/.test(bound(1)));
  ok('  and a bound on sixty does', /%/.test(bound(60)));

  console.log(`\n  ${n} checks passed — the graders answer both ways, and the gate is measured first\n`);
  process.exit(0);
}

// ---- the report ---------------------------------------------------------

const { structured } = await import('../src/llama.ts');
const RUNS = Number(process.argv[2] ?? 3);

const pad = (s: any, n: number) => String(s).padEnd(n).slice(0, n);
let gateDropped = 0;
const arms: Record<string, { recall: number; recallOf: number; wrong: number; wrongOf: number }> = {
  'with the direction': { recall: 0, recallOf: 0, wrong: 0, wrongOf: 0 },
  'without it':         { recall: 0, recallOf: 0, wrong: 0, wrongOf: 0 },
};

console.log(`\n  RETIRE — ${RUNS} run${RUNS === 1 ? '' : 's'} per case per arm,`
  + ` ${CASES.length} cases, no database\n`);

for (const c of CASES) {
  const cards = c.cards.map(entryOf);
  const cands = retirable(cards, c.chapter);
  const titles = cands.map((e) => e.title);
  const by = new Map(c.cards.map((x) => [x.title, x.label]));
  const admittedFinished = titles.filter((t) => by.get(t) === 'finished');
  const admittedLive = titles.filter((t) => by.get(t) && by.get(t) !== 'finished');
  const dropped = c.cards.filter((x) => x.label === 'finished' && !titles.includes(x.title));
  gateDropped += dropped.length;

  console.log(`  ${c.name}`);
  console.log(`    gate: ${titles.length} of ${c.cards.length} cards admitted`
    + ` — ${admittedFinished.length} finished, ${admittedLive.length} live`
    + (dropped.length ? `  GATE DROPPED A FINISHED CARD: ${dropped.map((d) => d.title).join(', ')}` : ''));

  for (const [arm, dir] of [['with the direction', c.direction], ['without it', '']] as const) {
    let recall = 0, wrong = 0, invalid = 0;
    // WHICH card, not just how many. "It finished one live card" and "it finished a different one
    // every run" are different defects with different fixes, and a rate cannot tell them apart.
    const culprits = new Map<string, number>();
    for (let i = 0; i < RUNS; i++) {
      const inForce = cands.map((e) => `${e.title}: ${e.body}`).join('\n\n');
      const r = await structured(RETIRE(dir), `${c.chapter}\n\n---\n\n${inForce}`,
        retireSchema(titles), { max_tokens: 400 });
      const named: string[] = (r.data?.finished ?? []).map((f: any) => String(f?.card ?? ''));
      // A name that was never offered means the sampler is not honouring the enum, and then every
      // number in this run is suspect. Loud, never folded into a rate.
      invalid += named.filter((t) => !titles.includes(t)).length;
      recall += named.filter((t) => by.get(t) === 'finished').length;
      for (const t of named.filter((x) => by.get(x) && by.get(x) !== 'finished'))
        culprits.set(t, (culprits.get(t) ?? 0) + 1);
      wrong  += named.filter((t) => by.get(t) && by.get(t) !== 'finished').length;
    }
    const a = arms[arm]!;
    a.recall += recall; a.recallOf += RUNS * admittedFinished.length;
    a.wrong  += wrong;  a.wrongOf  += RUNS * admittedLive.length;
    console.log(`    ${pad(arm, 20)} finished ${recall}/${RUNS * admittedFinished.length}`
      + `   WRONGLY FINISHED ${wrong}/${RUNS * admittedLive.length}`
      + (invalid ? `   ${invalid} NAMES THAT WERE NEVER OFFERED` : '')
      + (culprits.size ? `\n      wrongly finished: ${[...culprits].map(([t, k]) => `${t} (${k})`).join(', ')}` : ''));
  }
}

console.log('');
for (const [arm, a] of Object.entries(arms)) {
  const pct = (x: number, y: number) => (y ? `${(100 * x / y).toFixed(0)}%` : '—');
  console.log(`  ${pad(arm, 20)} recall ${a.recall}/${a.recallOf} (${pct(a.recall, a.recallOf)})`
    + `   false finishes ${a.wrong}/${a.wrongOf} (${pct(a.wrong, a.wrongOf)})`
    + (a.wrong === 0 ? `  — ${bound(a.wrongOf)}` : ''));
}
console.log(`\n  the gate dropped ${gateDropped} finished card(s) before the model ever saw them`);
console.log(`\n  THE FALSE-FINISH NUMBER IS THE ONE THAT DECIDES THIS, not recall. A scan that names`);
console.log(`  everything scores full recall. Missing a finished card costs one card firing a few`);
console.log(`  chapters too long; finishing a live one removes a character from the book with the`);
console.log(`  card still on screen looking alive.`);
console.log(`\n  If the two arms match, the direction clause in RETIRE is decoration and the honest`);
console.log(`  move is to delete it — F20 is the precedent, and it deleted a whole block.`);
console.log(`\n  Ceilings: the fixture is not this writer's prose; the labels are one reader's`);
console.log(`  judgement of what "finished" means; and the gate is per chapter, so a card the`);
console.log(`  closing chapter never names is out of scope for this feature entirely.\n`);
