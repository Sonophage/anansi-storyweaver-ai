// WHICH THREADS COME IN WHEN THE SCENE NAMES THEM, AND ON WHAT WORD (Seth, 2026-11-05: "all cards mention
// only by default, including current stories"). `mentionPlan` is the knowledge; it writes nothing. A
// thread on always goes on a word only when the tale's prose writes a word of it, or it would never reach
// the model again: bench/ledger-audit.ts found 734 threads whose keywords no passage writes.
import assert from 'node:assert';
import { mentionPlan } from '../src/mention.ts';

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };
const t = (id: string, title: string, keys: string[] = [], activation = 'always_on', entryType = 'character') =>
  ({ id, title, keys, activation, entryType });

const prose = 'Morgott knelt in Leyndell. Talia lit the lamp. "The Erdtree burns," she said. The Two Fingers watched.';
const story = { persona: 'Talia', lockedCharacter: 'Messmer', lockoutOn: true };
const plan = mentionPlan([
  t('a', 'Morgott the Grace-Given', ['Grace']),
  t('b', 'The Two Fingers', ['Two Fingers'], 'always_on', 'lore'),
  t('c', 'Rennala', ['Rennala']),
  t('d', 'Talia', ['Talia']),
  t('e', 'Messmer', ['Messmer']),
  t('f', 'The tale', [], 'always_on', 'tale'),
  t('g', 'Leyndell', ['capital'], 'triggered', 'place'),
  t('h', 'The Erdtree', ['Erdtree'], 'always_on', 'lore'),
], prose, story);
const flip = Object.fromEntries(plan.flip.map((f) => [f.id, f]));
const kept = Object.fromEntries(plan.kept.map((k) => [k.id, k.why]));

assert.deepStrictEqual(flip.b?.keys, ['Two Fingers'], 'MENTION-PLAN-OWN-KEY: a thread whose own word the prose writes flips on it');
assert.deepStrictEqual(flip.a?.keys, ['Grace', 'Morgott'], 'MENTION-PLAN-NAME: a word nobody writes gets the name the prose does');
// NOT NAMED YET, IT GOES ON ITS NAME TOO (Seth, 2026-11-05, "flip them too"): it comes in the first time a
// scene names it, and the plan says it has not been named so far.
assert.deepStrictEqual([flip.c?.keys, flip.c?.named], [['Rennala'], false], 'MENTION-PLAN-UNNAMED: a thread not named yet flips on its name, marked not named');
assert.strictEqual(flip.b?.named, true, '  and one the prose names is marked named');
assert.match(String(kept.d), /your character/, 'MENTION-PLAN-PERSONA: the writer\'s character stays on');
assert.match(String(kept.e), /Hands off/, 'MENTION-PLAN-HANDS-OFF: the Hands off character stays on');
assert.match(String(kept.f), /tale/, 'MENTION-PLAN-TALE: the tale\'s thread stays on');
assert.ok(!flip.g && !kept.g, 'MENTION-PLAN-ON-A-WORD: a thread already on a word is not touched');
// DIALOGUE COUNTS: a keyword fires on the whole window, quotes included, so a name said aloud wakes it.
assert.deepStrictEqual(flip.h?.keys, ['Erdtree'], 'MENTION-PLAN-DIALOGUE: a word said in dialogue counts, as it does when writing');
ok('the plan flips every always-on thread with a word to wake on, and keeps the rest on');

const off = mentionPlan([t('e', 'Messmer', ['Messmer'])], 'Messmer waited.', { ...story, lockoutOn: false });
assert.deepStrictEqual(off.flip.map((f) => f.id), ['e'], 'MENTION-PLAN-SWITCH: Hands off counts only while it is on');
ok('Hands off counts only while its switch is on');

// FOUND ON THE LIVE LIBRARY, NOT IN THIS FILE: the first cut gave "Bjorn the Fell-Handed" the word "the",
// and "Iron Warriors" and "Iron Hands" both "Iron". A word is the whole name the prose writes, or a word of
// a person's name nobody else's title has; an everyday word or one two threads share is never a key.
const live = mentionPlan([
  t('i', 'Bjorn the Fell-Handed', ['Fell-Handed']),
  t('j', 'Iron Warriors', [], 'always_on', 'lore'), t('k', 'Iron Hands', [], 'always_on', 'lore'),
  t('l', 'Gravesite Plain', ['plainsfolk'], 'always_on', 'place'),
  t('m', 'Living Jar', ['jar'], 'always_on', 'lore'),
], 'The iron gate shut. They crossed the Gravesite Plain at dusk. Bjorn laughed. The living wept.', story);
const lf = Object.fromEntries(live.flip.map((f) => [f.id, f.keys]));
assert.deepStrictEqual(lf.i, ['Fell-Handed', 'Bjorn'], 'MENTION-PLAN-NOT-THE: a person gains their name, never "the"');
assert.deepStrictEqual([lf.j, lf.k], [['Iron Warriors'], ['Iron Hands']], 'MENTION-PLAN-SHARED: each on its whole name, never both on "iron"');
assert.deepStrictEqual(lf.l, ['plainsfolk', 'Gravesite Plain'], 'MENTION-PLAN-WHOLE: the whole name, where the prose writes it');
// A ONE-WORD NAME THAT IS AN EVERYDAY WORD is not a key ("History" would wake on every "history").
const common = mentionPlan([t('n', 'History', ['annals'], 'always_on', 'lore'), t('z', 'Rules', [], 'always_on', 'lore')], 'Their history was long.', story);
assert.deepStrictEqual(common.flip.map((f) => f.keys), [['annals']], 'MENTION-PLAN-COMMON: an everyday word is not added as a key');
assert.match(String(common.kept.find((k) => k.id === 'z')?.why), /no word/, 'MENTION-PLAN-NO-WORD: a thread with no word to wake on stays on, and says why');
// A THING'S NAME BEFORE THE COMMA: "The Warp, the Empyrean" is the Warp.
const warp = mentionPlan([t('w', 'The Warp, the Empyrean', ['Empyrean Sea'], 'always_on', 'lore')], 'The warp shifted.', story);
assert.deepStrictEqual(warp.flip[0]?.keys, ['Empyrean Sea', 'Warp'], 'MENTION-PLAN-COMMA: a thing is named by what comes before the comma');
assert.deepStrictEqual(lf.m, ['jar', 'Living Jar'], 'MENTION-PLAN-EVERYDAY: a thing gains its whole name, never one everyday word of it ("living")');
// ANOTHER PERSON'S NAME IS THEIRS: "Ash Vane" does not wake when Ash, someone else, is in the scene.
const mara = mentionPlan([t('o', 'Ash Vane', ['Vane']), t('p', 'Ash', ['Ash'], 'triggered')], 'Ash smiled at the door.', story);
assert.deepStrictEqual(mara.flip.map((f) => f.keys), [['Vane']], 'MENTION-PLAN-OTHERS: a word of another person\'s name is theirs');
// AN EPITHET IS NOT A NAME (live library: "Magnus the Red" gained "Red", "Mortarion, The Pale King" "Pale").
const epi = mentionPlan([t('q', 'Magnus the Red', ['Crimson King']), t('r', 'Mortarion, The Pale King', ['Death Lord'])],
  'Red banners hung. The pale light failed. Mortarion coughed.', story);
const ef = Object.fromEntries(epi.flip.map((f) => [f.id, f.keys]));
assert.deepStrictEqual(ef.q, ['Crimson King', 'Magnus'], 'MENTION-PLAN-EPITHET: a person gains their given name, never a word of their epithet');
assert.deepStrictEqual(ef.r, ['Death Lord', 'Mortarion'], 'MENTION-PLAN-GIVEN-NAME: a person wakes on their given name');
// FOUND ON THE LIVE LIBRARY AGAIN: "Sir Gideon Ofnir" gained his whole name (an honorific is no name), and
// "Konrad Curze (Upbringing)" a key with its note in brackets, which no prose writes.
const more = mentionPlan([t('s', 'Sir Gideon Ofnir', ['Ofnir the Omniscient']), t('u', 'Konrad Curze (Upbringing)', [], 'always_on', 'lore')],
  'Gideon set down the cup. Konrad Curze was a boy then.', story);
const mf = Object.fromEntries(more.flip.map((f) => [f.id, f.keys]));
assert.deepStrictEqual(mf.s, ['Ofnir the Omniscient', 'Gideon'], 'MENTION-PLAN-HONORIFIC: a person wakes on the first word of their name that is a name');
assert.deepStrictEqual(mf.u, ['Konrad Curze'], 'MENTION-PLAN-BRACKETS: a note in brackets is not part of the name');
ok('a thread gains only its whole name or a person\'s given name, never an everyday, shared or epithet word');

const empty = mentionPlan([t('a', 'Morgott', ['Morgott'])], '', story);
assert.deepStrictEqual(empty.flip.map((f) => [f.keys, f.named]), [[['Morgott'], false]], 'MENTION-PLAN-NO-PROSE: a tale with no prose yet flips on names too');
ok('a tale with no prose yet flips on names too');

console.log(`\n${n} checks passed`);
