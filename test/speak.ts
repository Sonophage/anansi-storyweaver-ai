// SPEAK ENDS WHERE THE WRITER'S CHARACTER WOULD SPEAK AGAIN (Seth, 2026-11-05, after F73 and F74: Ornith
// gives the character the writer just spoke as a new line in about half of Speak answers, and no prompt
// sentence stopped it). `cutSpeaker` ends the answer just before that line. It never guesses: a pronoun
// two people in the scene share, "they", or a blank pronoun names nobody, and the line stays (a miss).
import assert from 'node:assert';
import { cutSpeaker } from '../src/speak.ts';

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };
const two = [{ name: 'Seth', pronoun: 'he' }, { name: 'Halsey', pronoun: 'she' }];

// FROM THE ORNITH RUN: the writer spoke as Halsey, and the answer gave Halsey a second line.
const encore = 'Seth doesn\'t blink. He steps closer.\n\nShe takes a step back, her hand on the painting. "And if I choose you?" she asks again, her voice trembling.\n\nSeth smiles.';
const a = cutSpeaker(encore, 'Halsey', two, "And if I don't?");
assert.strictEqual(a.text, 'Seth doesn\'t blink. He steps closer.\n\nShe takes a step back, her hand on the painting.', 'CUT-ENDS-BEFORE: the answer ends before her line, keeping the narration before it');
assert.strictEqual(a.cut, true, 'CUT-SAYS-SO: and says it cut');
const b = cutSpeaker('Seth looks at her. "Then stay," he says.', 'Halsey', two, "And if I don't?");
assert.deepStrictEqual([b.text, b.cut], ['Seth looks at her. "Then stay," he says.', false], 'CUT-NONE: an answer where someone else speaks is kept whole');
const c = cutSpeaker('Seth waits.\n\nHalsey laughs. "Fine."', 'Halsey', two, '');
assert.strictEqual(c.text, 'Seth waits.', 'CUT-BEAT: a beat that names her goes with her line');
ok('Speak ends before the writer\'s character speaks again, and keeps the rest');

// TWO MEN: "he says" could be either, so it stays; his name still settles it.
const men = [{ name: 'Seth', pronoun: 'he' }, { name: 'Marcus', pronoun: 'he' }, { name: 'Halsey', pronoun: 'she' }];
const d = cutSpeaker('Marcus crosses his arms.\n\n"Not tonight," he says.', 'Seth', men, '');
assert.deepStrictEqual([d.cut, d.unknown], [false, 1], 'CUT-SHARED: a pronoun two people share names nobody, and is counted');
const e = cutSpeaker('Marcus crosses his arms.\n\n"Not tonight," Seth says.', 'Seth', men, '');
assert.strictEqual(e.text, 'Marcus crosses his arms.', 'CUT-SHARED-NAME: a name settles it');
// TWO WOMEN, AND HE SPOKE AS SETH: a "she" line is not his, whichever woman says it.
const f = cutSpeaker('"Go home," she says.', 'Seth', [{ name: 'Seth', pronoun: 'he' }, { name: 'Halsey', pronoun: 'she' }, { name: 'Lisa', pronoun: 'she' }], '');
assert.deepStrictEqual([f.cut, f.unknown], [false, 0], 'CUT-NOT-THEIRS: a pronoun the speaker does not go by is someone else');
ok('two people sharing a pronoun is a miss, never a wrong cut');

// "THEY" NEVER CUTS ALONE: it is also a group. A blank pronoun names nobody.
const they = [{ name: 'Ash', pronoun: 'they' }, { name: 'Halsey', pronoun: 'she' }];
assert.strictEqual(cutSpeaker('"Fine," they say.', 'Ash', they, '').cut, false, 'CUT-THEY: "they" alone never cuts');
assert.strictEqual(cutSpeaker('"Fine," Ash says.', 'Ash', they, '').cut, true, '  but the name does');
const blank = [{ name: 'Seth', pronoun: null }, { name: 'Halsey', pronoun: 'she' }];
assert.deepStrictEqual(cutSpeaker('"Stay," he says.', 'Seth', blank, '').cut, false, 'CUT-BLANK: a blank pronoun names nobody');
ok('"they" and a blank pronoun cut only by name');

// THE WRITER'S OWN LINE SAID AGAIN is not this failure (Seth did not count it).
assert.strictEqual(cutSpeaker('"And if I don\'t?" she repeats.', 'Halsey', two, "And if I don't?").cut, false, 'CUT-ECHO: her own line said again stays');
ok('the writer\'s line said again is not cut');

console.log(`\n${n} checks passed`);
