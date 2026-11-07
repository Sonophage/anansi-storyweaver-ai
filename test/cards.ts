// #142 · ONE CONTRACT FOR EVERY CARD THE AI WRITES. What a good thread or pocket is was written into
// each card-writing prompt in its own words: the one-keyword rule five times (and contradicted once,
// by Invent's pocket branch asking for "single words"), the kind-to-pocket table four times, and a
// card's length as 20–40, 60–140 or 120–200 words depending on the door. This holds the rule to one
// source: every card-writing prompt carries CARD_CONTRACT itself, and none re-states a rule it owns.
// Pure: it reads the prompt text only. No database, no model.
//
//   node --experimental-strip-types test/cards.ts
import assert from 'node:assert';
import * as P from '../src/prompts.ts';

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };
const p = P as any;

// Every prompt that writes or proposes a thread or a pocket, as each door calls it.
const CARD_PROMPTS: Record<string, string> = {
  MEMORY: p.MEMORY, EXTRACT: p.EXTRACT, RESTAND: p.RESTAND, TIDY: p.TIDY, MERGE: p.MERGE,
  REDO: p.REDO, MEMO: p.MEMO, CAST: p.CAST, REVIEW: p.REVIEW, TALK_CONTRACT: p.TALK_CONTRACT,
  TALK_SETUP: p.TALK_SETUP,
  'INVENT card': p.INVENT('a character', '', false, false),
  'INVENT room': p.INVENT('a character', '', false, true),
  'FROM_WEB': p.FROM_WEB('character', 'Someone', ['voice', 'outfit'], false),
};

assert.ok(typeof p.CARD_CONTRACT === 'string' && p.CARD_CONTRACT.length > 200, 'CARD-CONTRACT: the contract exists as one text');
for (const [name, text] of Object.entries(CARD_PROMPTS)) {
  assert.ok(typeof text === 'string' && text.length, `${name} is a prompt`);
  assert.ok(text.includes(p.CARD_CONTRACT), `CARD-CONTRACT-READ: ${name} carries CARD_CONTRACT itself, not a paraphrase of it`);
}
ok(`every card-writing prompt carries the contract (${Object.keys(CARD_PROMPTS).length} of them)`);

// ONE SOURCE: the rules the contract owns are written nowhere else in a card prompt. Each phrase is the
// tell of a copy the audit found; the contract's own text is taken out before looking.
const OWNED: [string, RegExp][] = [
  // The definition, not a mention: "and one keyword" asks for one; "ONE keyword that would really
  // appear" and "one keyword: a person's name" define it, and those are the copies.
  ['the one-keyword rule', /\bone keyword( that|:)|single words that would really appear/i],
  ['the pocket-name rule', /never the slot'?s word/i],
  ['the clothes rule', /CLOTHING IS ALWAYS|clothes go in an? outfit/i],
  ['the later-wins rule', /\bthe LATER and more specific\b|the more specific one is true/i],
  ['facts somebody could contradict', /facts? somebody could contradict/i],
];
for (const [name, text] of Object.entries(CARD_PROMPTS)) {
  // Whitespace folded: these prompts wrap mid-phrase ("never the\nslot's word"), and a pattern with
  // plain spaces could not see a copy split over two lines.
  const rest = text.split(p.CARD_CONTRACT).join('').replace(/\s+/g, ' ');
  for (const [rule, tell] of OWNED)
    assert.ok(!tell.test(rest), `CARD-ONE-SOURCE: ${name} re-states ${rule} outside the contract: "${rest.match(tell)?.[0]}"`);
}
ok('no card prompt re-states a rule the contract owns');

// "AS THE CARD RULES BELOW SAY" POINTS AT THEM. A prompt that defers to the contract says where it is;
// the web lookup said "below" with the contract above it. Whitespace folded, for the reason above.
let pointers = 0;
for (const [name, text] of Object.entries(CARD_PROMPTS)) {
  const t = text.replace(/\s+/g, ' '), at = t.indexOf(p.CARD_CONTRACT.replace(/\s+/g, ' '));
  for (const m of t.matchAll(/card rules (below|above)/g)) {
    pointers++;
    assert.strictEqual(m[1] === 'below', m.index! < at, `CARD-POINTER: ${name} says the card rules are ${m[1]}, and they are not`);
  }
}
assert.ok(pointers > 0, 'CARD-POINTER-SEEN: the check found the pointers it is checking');
ok(`every pointer to the card rules points the right way (${pointers})`);

// ONE TABLE OF LENGTHS, keyed by door, so two doors cannot contradict each other about one card.
const doors = Object.keys(p.CARD_LENGTH ?? {});
assert.ok(doors.length >= 4, `CARD-LENGTH: the lengths are one table (${doors.join(', ')})`);
for (const d of doors) assert.match(String(p.CARD_LENGTH[d]), /\d|twenty|forty|sixty|hundred/i, `  ${d} gives a number`);
ok(`card lengths come from one table, by door (${doors.join(', ')})`);

// F72 · WHERE IT STANDS SAYS WHAT WAS ASKED, A RELATIONSHIP NAMES ITS PERSON, THE TALE'S CARD IS THE STORY.
// Seth's read of three arms (B 3, A 2, contract C 0): the rules sit where each card is written, not in the
// contract, which lost every scene.
assert.match(String(p.STANDS_FORM), /what was asked, offered or decided in plain words/i, 'STANDS-SAY-IT: where it stands says what was asked');
assert.match(String(p.POCKET_FORM), /relationships[\s\S]*person named in the sentence/i, 'REL-NAMED: a relationships pocket names the person');
assert.match(String(p.TALE_STANDS), /not the\s+place/i, 'TALE-STORY: the tale\'s card keeps to the people');
assert.doesNotMatch(String(p.CARD_CONTRACT), /ultimatum|names both people/i, 'F72-NOT-CONTRACT: the contract placement measured last and is not used');
ok('where it stands says what was asked, relationships names the person, the tale card is the story (F72)');

console.log(`\n${n} checks passed`);
