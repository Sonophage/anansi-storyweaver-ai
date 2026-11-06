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
assert.match(String(kept.c), /never named/, 'MENTION-PLAN-UNNAMED: a thread the prose never names stays on, and says why');
assert.match(String(kept.d), /your character/, 'MENTION-PLAN-PERSONA: the writer\'s character stays on');
assert.match(String(kept.e), /Hands off/, 'MENTION-PLAN-HANDS-OFF: the Hands off character stays on');
assert.match(String(kept.f), /tale/, 'MENTION-PLAN-TALE: the tale\'s thread stays on');
assert.ok(!flip.g && !kept.g, 'MENTION-PLAN-ON-A-WORD: a thread already on a word is not touched');
// DIALOGUE COUNTS: a keyword fires on the whole window, quotes included, so a name said aloud wakes it.
assert.deepStrictEqual(flip.h?.keys, ['Erdtree'], 'MENTION-PLAN-DIALOGUE: a word said in dialogue counts, as it does when writing');
ok('the plan flips what the prose names, on a word it writes, and keeps the rest on');

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
assert.ok(!lf.j && !lf.k, 'MENTION-PLAN-SHARED: a word two threads share is not a key; both stay on');
assert.deepStrictEqual(lf.l, ['plainsfolk', 'Gravesite Plain'], 'MENTION-PLAN-WHOLE: the whole name, where the prose writes it');
// A ONE-WORD NAME THAT IS AN EVERYDAY WORD is not a key ("History" would wake on every "history").
const common = mentionPlan([t('n', 'History', ['annals'], 'always_on', 'lore')], 'Their history was long.', story);
assert.deepStrictEqual(common.flip, [], 'MENTION-PLAN-COMMON: an everyday word is not a key');
// A THING'S NAME BEFORE THE COMMA: "The Warp, the Empyrean" is the Warp.
const warp = mentionPlan([t('w', 'The Warp, the Empyrean', ['Empyrean Sea'], 'always_on', 'lore')], 'The warp shifted.', story);
assert.deepStrictEqual(warp.flip[0]?.keys, ['Empyrean Sea', 'Warp'], 'MENTION-PLAN-COMMA: a thing is named by what comes before the comma');
assert.ok(!lf.m, 'MENTION-PLAN-EVERYDAY: a thing is not keyed on one everyday word of its name ("living")');
// ANOTHER PERSON'S NAME IS THEIRS: "Ash Vane" does not wake when Ash, someone else, is in the scene.
const mara = mentionPlan([t('o', 'Ash Vane', ['Vane']), t('p', 'Ash', ['Ash'], 'triggered')], 'Ash smiled at the door.', story);
assert.deepStrictEqual(mara.flip, [], 'MENTION-PLAN-OTHERS: a word of another person\'s name is theirs');
// AN EPITHET IS NOT A NAME (live library: "Magnus the Red" gained "Red", "Mortarion, The Pale King" "Pale").
const epi = mentionPlan([t('q', 'Magnus the Red', ['Crimson King']), t('r', 'Mortarion, The Pale King', ['Death Lord'])],
  'Red banners hung. The pale light failed. Mortarion coughed.', story);
const ef = Object.fromEntries(epi.flip.map((f) => [f.id, f.keys]));
assert.ok(!ef.q, 'MENTION-PLAN-EPITHET: a person does not wake on a word of their epithet');
assert.deepStrictEqual(ef.r, ['Death Lord', 'Mortarion'], 'MENTION-PLAN-GIVEN-NAME: a person wakes on their given name');
ok('a thread gains only its whole name or a person\'s own name, never an everyday or shared word');

const empty = mentionPlan([t('a', 'Morgott', ['Morgott'])], '', story);
assert.deepStrictEqual([empty.flip.length, empty.kept.length], [0, 1], 'MENTION-PLAN-NO-PROSE: a tale with no prose flips nothing');
ok('a tale with no prose flips nothing');

console.log(`\n${n} checks passed`);
