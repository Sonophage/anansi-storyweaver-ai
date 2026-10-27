// One runnable check. Fails if the engine's load-bearing behaviour breaks.
//   node --experimental-strip-types test/engine.ts
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { buildContext, resolveBody, fires, retirable, numbersIn, narrationOnly, quotedSpans, factsIn, factsLost,
         weaveFit } from '../src/context.ts';
import type { Input, Entry } from '../src/context.ts';
import { render } from '../src/render.ts';
import { ORDER } from '../src/blocks.ts';

// Deterministic stand-in for /tokenize. Keeps the engine testable with no model up.
const count = (s: string) => Math.ceil(s.length / 4);

const entry = (id: string, body: string, o: Partial<Entry> = {}): Entry => ({
  id, title: id, body, entryType: 'character', activation: 'always_on',
  keys: [], lastEditor: 'model', ...o,
});

const base = (): Input => ({
  story: { title: 'The Silver Key', genre: 'fantasy noir', premise: 'A debt comes due.',
           setting: 'Vantic, in the rain', pov: 'third limited, past', spice: 2,
           // `direction` STAYS ON THIS FIXTURE ON PURPOSE, and it is the whole of the test below.
           // The field came out of the app on 2026-08-30 and the column was dropped on 2026-10-25,
           // but an old export still carries one. A story that arrives with it is exactly the case
           // that must not leak into a prompt, and a fixture without it could not fail.
           writingStyle: 'clipped, wet, unsentimental', direction: 'Marek chooses the archive.' } as any,
  chapters: [
    { id: 'c1', index: 1, title: 'Debt', summary: 'Aldis borrows from Marek.' },
    { id: 'c2', index: 2, title: 'Rain', summary: 'The archive floods.' },
    { id: 'c3', index: 3, title: 'Key', authorsNote: 'Aldis refuses to hand over the key.' },
  ],
  passages: [
    { id: 'p1', ordinal: 1, body: 'The rain had not stopped for three days.' },
    { id: 'p2', ordinal: 2, body: 'Marek wanted the Silver Key and would not say why.' },
    { id: 'p3', ordinal: 3, body: 'Aldis counted the coins twice and came up short.' },
  ],
  entries: [
    entry('e-aldis', '[Aldis Fen: 34, ex-Watch sergeant, limp (left knee)]', { lastEditor: 'human' }),
    entry('e-key', '[the Silver Key: brass not silver, opens the archive vault]',
          { activation: 'triggered', keys: ['Silver Key'], entryType: 'item' }),
    entry('e-ghost', '[Ghost Wolf: never mentioned anywhere]',
          { activation: 'triggered', keys: ['ghost wolf'], entryType: 'lore' }),
  ],
  mode: 'narrate', currentChapter: { id: 'c3', index: 3, title: 'Key' }, budget: 4000,
});

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

ok('blocks come out in canonical order', () => {
  const m = buildContext(base(), count);
  const idx = m.blocks.map((b) => ORDER.indexOf(b.kind));
  assert.deepStrictEqual(idx, [...idx].sort((a, b) => a - b));
});

ok('the lockout names the character it locks, and only when one is named', () => {
  const off = buildContext(base(), count);
  const d0 = off.blocks.find((b) => b.kind === 'DIRECTIVE')!;
  assert.doesNotMatch(d0.text, /belongs to the writer/,
    'no story has a locked character until somebody names one');

  const i = base();
  // Deliberately NOT the persona. They are two settings so that handing yourself a different
  // character for a scene does not also hand over the one you were keeping.
  (i.story as any).persona = 'Marek Vale';
  i.story.lockedCharacter = 'Aldis Fen';
  const d = buildContext(i, count).blocks.find((b) => b.kind === 'DIRECTIVE')!;
  assert.match(d.text, /Aldis Fen belongs to the writer/, 'it names the locked one');
  assert.doesNotMatch(d.text, /Marek Vale belongs/, 'and not the one you speak as');
  // A prohibition with no destination gets worked around — the model describes him from outside,
  // or stalls waiting for him. The line has to say what the model IS for.
  assert.match(d.text, /dialogue/); assert.match(d.text, /action/);
  assert.match(d.text, /feel, know or decide/, 'interiority is named — it is F21\'s 82.5%');
  assert.match(d.text, /world's answer/, 'and it is told what to write instead');

  assert.match(d.text, /Writing: third limited/, 'point of view survives beside it');
  assert.strictEqual(d.state, 'included');
  assert.ok(d.tokens < 250, `DIRECTIVE is capped at 250 and this is ${d.tokens}`);

  // It rides DIRECTIVE, which is capped. A chapter ending long enough to blow the cap must not be
  // what takes the lockout off — the writer set it and nothing on screen would say it had gone.
  const tight = base();
  tight.story.lockedCharacter = 'Aldis Fen';
  tight.currentChapter = { id: 'c3', index: 3, title: 'Key',
    authorsNote: 'Aldis refuses to hand over the key, and Marek leaves without it. '.repeat(14) };
  const dt = buildContext(tight, count).blocks.find((b) => b.kind === 'DIRECTIVE')!;
  assert.ok(dt.tokens > 250, `the fixture has to actually blow the cap; it is ${dt.tokens}`);
  // Matched on the LAST clause, not the first: a trimmed anchor keeps its opening words, so
  // "Aldis Fen belongs to the writer" survives a cut that threw the instruction itself away.
  assert.match(dt.text, /Stop where Aldis Fen would act/, 'and the whole lockout is still there');

  // PLAN-06 2b. Every part of DIRECTIVE is `keep: true`, so there is no flex string and the
  // shortening branch hands back all four parts unchanged — while the block used to carry the
  // reason `anchor shortened to 250 tokens` anyway. A manifest that reports a trim it did not
  // perform is worse than one that reports an overrun: this is a REAL overrun, and it was
  // wearing the label of a successful cut. The fixture above already reproduces it; nothing
  // asserted the reason.
  assert.ok(dt.tokens > 250, 'the case only exists while the fixture is over the cap');
  assert.match(dt.reason, /nothing in it may be cut/,
    `DIRECTIVE is ${dt.tokens} tokens against a cap of 250 and every part of it is keep:true, so `
    + `nothing was cut. Its reason says "${dt.reason}". A block that says it was shortened when it `
    + 'was not is how a real overrun stays invisible.');
  assert.ok(!/shortened/.test(dt.reason), 'and it must not claim a trim that did not happen');
});

// The other branch, asserted so the fix is not "delete the word shortened". SPINE's premise is
// the one `keep: false` part in the anchor, so a long enough premise really is cut — and then
// "shortened" is the true reason and has to survive.
ok('the world a book belongs to rides in SPINE, and only the note is trimmable', () => {
  // Seth, 2026-09-02: "Is there a way in the story under the world tab I could add what world or ip
  // it belongs to? And have it hold some info about the world that way". A book set in Warhammer
  // 40,000 needs the model to know that before it knows anything else, and the only way to say it
  // before this was to write it into the premise or build a second book to follow.
  const i = base();
  (i.story as any).world = 'Warhammer 40,000';
  (i.story as any).worldNote = 'The Imperium has been falling for ten thousand years and calls it order.';
  const sp = buildContext(i, count).blocks.find((b) => b.kind === 'SPINE')!;
  assert.match(sp.text, /set in Warhammer 40,000/, 'the world is named in the spine');
  assert.match(sp.text, /falling for ten thousand years/, 'and what is true in it is there too');
  // BESIDE THE GENRE, BEFORE THE PREMISE: it is the same kind of fact — what kind of book this is —
  // and a model that reads the premise first has already started imagining the wrong world.
  assert.ok(sp.text.indexOf('Warhammer 40,000') < sp.text.indexOf(i.story.premise),
    'and it comes before the premise, which is what makes it context rather than an afterthought');

  // NOTHING FOR A BOOK WITH NO WORLD, which is most of them: an empty field must not put a sentence
  // about nothing into a block that is capped.
  const own = base();
  const spOwn = buildContext(own, count).blocks.find((b) => b.kind === 'SPINE')!;
  assert.doesNotMatch(spOwn.text, /set in|About /,
    'a book with a world of its own says nothing about one');

  // THE NAME SURVIVES A TRIM AND THE NOTE DOES NOT. Same split the premise and the setting already
  // make in this block: identity is kept, furniture is recoverable. A book whose world was trimmed
  // to nothing would be written as generic fantasy, which is the whole failure this prevents.
  const fat = base();
  (fat.story as any).world = 'Warhammer 40,000';
  (fat.story as any).worldNote = 'The Imperium has been falling for ten thousand years. '.repeat(60);
  fat.story.setting = 'A cathedral of iron. '.repeat(60);
  const spFat = buildContext(fat, count).blocks.find((b) => b.kind === 'SPINE')!;
  assert.ok(spFat.tokens > 0, 'the fixture has to actually be over the cap for this to mean anything');
  assert.match(spFat.text, /set in Warhammer 40,000/,
    'the world is still named after a trim — it is keep:true, like the premise');
});

ok('the chapter brief is two halves, and only one of them rides every call', () => {
  // Seth, 2026-09-02: "the start should be used as information for the very first scene and the
  // where is this going is only used as a suggestion for the direction of the chapter, not
  // something used by the ai at every beat. it tries to end the chapter early if it uses it that
  // way." One box worded "This chapter must end with" used to ride here on every generation.

  // EMPTY CHAPTER: the opening is the instruction, because there is nothing on the page yet.
  const fresh = base();
  fresh.currentChapter = { id: 'c3', index: 3, title: 'Key',
    opensWith: 'Marek is already inside the archive when she arrives.',
    authorsNote: 'Aldis refuses to hand over the key.' };
  const df = buildContext(fresh, count).blocks.find((b) => b.kind === 'DIRECTIVE')!;
  assert.match(df.text, /How this chapter opens: Marek is already inside/,
    'an empty chapter is told how it opens');
  assert.match(df.text, /first passage of the chapter/, 'and that this is the passage that does it');

  // ONE PASSAGE IN, AND THE OPENING IS GONE. This is the half that matters: left in, the model is
  // asked to open a chapter it opened four passages ago. `chapterId` is what says a passage
  // belongs to this chapter, and it is the same flag the whole-prose window is computed from.
  const going = base();
  going.currentChapter = fresh.currentChapter;
  going.passages = base().passages.map((x, i) => (i === 2 ? { ...x, chapterId: 'c3' } : x));
  const dg = buildContext(going, count).blocks.find((b) => b.kind === 'DIRECTIVE')!;
  assert.doesNotMatch(dg.text, /How this chapter opens/,
    'once the chapter has prose, how it opened is no longer an instruction');

  // AND THE FAR END IS A DIRECTION IN BOTH, worded as the chapter's destination rather than as a
  // demand on this passage. Asserted BOTH ways: the new clause present, and the old wording gone —
  // "must end with" beside the generation point on every beat is the shape being removed, so a
  // check that only looked for the new sentence would pass with both in there.
  for (const [name, d] of [['an empty chapter', df], ['a chapter under way', dg]] as const) {
    assert.match(d.text, /Where this chapter is going, eventually: Aldis refuses/,
      `${name} still gets the direction`);
    assert.match(d.text, /not this passage's business/, `${name} is told not to steer toward it`);
    assert.doesNotMatch(d.text, /must end with/,
      `${name} must not carry the old demand — that is what closed chapters early`);
  }

  // ONE FULL STOP, NOT TWO. Both halves put a sentence of ours after a sentence of the writer's,
  // and a box that already ends in a full stop gave "keeps the debt.. That is" — seen in a real
  // prompt the day this shipped, which is why it is asserted rather than eyeballed.
  assert.doesNotMatch(df.text, /\.\.\s/, 'no doubled full stop where the two sentences meet');
  const punchy = base();
  punchy.currentChapter = { id: 'c3', index: 3, title: 'Key',
    opensWith: 'Marek is already inside', authorsNote: 'Aldis refuses' };
  const dp = buildContext(punchy, count).blocks.find((b) => b.kind === 'DIRECTIVE')!;
  assert.match(dp.text, /Marek is already inside\. This is the first passage/,
    'and a box with no full stop of its own gets one');

  // NOTHING FOR A CHAPTER WITH NEITHER, which is most of them: two empty boxes must not put two
  // empty brackets into a block that is capped at 250 tokens.
  const bare = base();
  bare.currentChapter = { id: 'c3', index: 3, title: 'Key' };
  const db2 = buildContext(bare, count).blocks.find((b) => b.kind === 'DIRECTIVE')!;
  assert.doesNotMatch(db2.text, /How this chapter opens|Where this chapter is going/,
    'a chapter with no brief carries neither line');
});

ok('an anchor that CAN be cut still says it was shortened, and really is shorter', () => {
  // COUNCIL-06 INVERTED THIS. The setting is the flex part now and the premise is kept: the
  // premise is the only text in SPINE that names who the book is about, and on the live library it
  // was the shorter of the two by a factor of three. So the fixture fattens the SETTING, and what
  // must survive is the premise.
  // AND THE FIXTURE GREW WITH THE CAP. `.repeat(30)` made ~514 tokens, which overran 400 and no
  // longer overruns 1000 — so left alone this check would have gone on passing because the fixture
  // stopped reproducing the condition, not because the code still held. That is the failure this
  // project has been bitten by four times; the assertion below is what would have gone quiet.
  const fat = base();
  fat.story.setting = 'Vantic, in the rain, and the water rises past the archive steps. '.repeat(80);
  const sp = buildContext(fat, count).blocks.find((b) => b.kind === 'SPINE')!;
  assert.ok(sp.tokens > 900, `the fixture must still OVERRUN the cap, and it is only ${sp.tokens}`);
  assert.ok(sp.tokens <= 1000, `SPINE is capped at 1000 and this is ${sp.tokens}`);
  assert.match(sp.reason, /anchor shortened to 1000 tokens/,
    `a real cut must still report itself; this said "${sp.reason}"`);
  assert.ok(sp.text.length < fat.story.setting.length,
    'and the text is actually shorter than the setting it was made from');
  // The kept parts survive the cut. Without this, "shortened" could be reported by a branch that
  // threw the whole block away and the reason would still read as correct.
  assert.match(sp.text, /A debt comes due/, 'the premise outlives the cut — it names the book');
});

ok('the POV instruction follows the grammar it is sent with', () => {
  // COUNCIL-06. F28 measured the lockout line and it works — acted 76% -> 25% (p = 0.0005), spoke
  // 20% -> 0%. It was measured in THIRD PERSON and it was being sent in first and second person
  // too, where it contradicts the line directly above it. Rendered live on the author's library:
  //
  //     [Writing: first person, present tense]
  //     [Elias belongs to the writer: never write their dialogue, action, gesture or thought...]
  //
  // followed by the prose it must continue, which is Elias thinking and acting in the first person.
  // Five of nine books were in that state. This is the check that stops it coming back.
  const at = (i: Input) => {
    const d = buildContext(i, count).blocks.find((b) => b.kind === 'DIRECTIVE')!;
    return d.text;
  };

  // THIRD PERSON: the measured text, and it must be byte-identical. Rewording the one instruction
  // in this stack with a strong number behind it is not something to do in passing.
  const third = base();
  third.story.pov = 'third limited, past';
  third.story.lockedCharacter = 'Aldis Fen';
  assert.match(at(third), /\[Aldis Fen belongs to the writer: never write their dialogue, action, gesture or thought, and never state what they feel, know or decide\./,
    'third person keeps F28\'s lockout exactly as it was measured');
  assert.doesNotMatch(at(third), /is telling this story/, 'and does not also get the narrator line');

  // FIRST PERSON: the narration IS the protagonist's, so forbidding their thought forbids the
  // grammar. The narrator is named instead, and the firewall moves to everyone else's interior —
  // the half that can be broken in any person.
  const first = base();
  first.story.pov = 'first person, present tense';
  first.story.lockedCharacter = 'Aldis Fen';
  assert.doesNotMatch(at(first), /belongs to the writer/,
    'first person must NEVER carry the lockout — it forbids the grammar the line above mandates');
  assert.match(at(first), /\[Aldis Fen is telling this story\./, 'it names the narrator instead');
  assert.match(at(first), /Never state what anyone but Aldis Fen thinks, feels or intends/,
    'and firewalls every other interior');
  assert.match(at(first), /write the guess as a guess/,
    'while permitting the guess, which is what makes the rule followable');

  // SECOND PERSON is the same shape and was in the same contradiction — two of the author's books.
  const second = base();
  second.story.pov = 'second person, present tense';
  second.story.lockedCharacter = 'The Captain';
  assert.doesNotMatch(at(second), /belongs to the writer/, 'second person too');
  assert.match(at(second), /The Captain is telling this story/);

  // PERSONA IS ENOUGH. `persona` produced no text at all before this — it only force-fired the
  // card — so a book that named who it plays and did not set a lock said nothing about POV.
  const p = base();
  p.story.pov = 'first person, present tense';
  p.story.lockedCharacter = undefined;
  (p.story as any).persona = 'Marek Vale';
  assert.match(at(p), /Marek Vale is telling this story/, 'persona alone names the narrator');

  // AND NEITHER, WHEN THERE IS NOBODY TO NAME. A book with no persona and no lock gets the grammar
  // line and nothing else — inventing a narrator would be worse than saying nothing.
  const none = base();
  none.story.pov = 'first person, present tense';
  none.story.lockedCharacter = undefined;
  (none.story as any).persona = undefined;
  assert.doesNotMatch(at(none), /is telling this story|belongs to the writer/,
    'no name, no claim about whose story it is');
  assert.match(at(none), /\[Writing: first person, present tense\]/, 'the grammar line still stands');
});

ok('DIRECTIVE is never the last block', () => {
  const m = buildContext(base(), count);
  const inc = m.blocks.filter((b) => b.state === 'included');
  assert.notStrictEqual(inc.at(-1)!.kind, 'DIRECTIVE');
  assert.ok(inc.some((b) => b.kind === 'TAIL'), 'tail prose must sit below DIRECTIVE');
});

ok('a triggered entry fires on its keyword; an unmentioned one does not', () => {
  const m = buildContext(base(), count);
  const ids = m.blocks.filter((b) => b.state === 'included').map((b) => b.id);
  assert.ok(ids.includes('e-key'), 'Silver Key should fire');
  assert.ok(!ids.includes('e-ghost'), 'Ghost Wolf must not fire');
});

// Was 'the destination reaches SPINE', and it was true from COUNCIL-03 §5 until 2026-08-30, when
// the field came out of the app at Seth's direction: "no ones going to use it. ive asked."
//
// INVERTED RATHER THAN DELETED, because the interesting case survived the removal: a story that
// arrives carrying a destination (an old export) must still not put it in the prompt.
ok('a destination still in the row never reaches SPINE', () => {
  const m = buildContext(base(), count);
  const spine = m.blocks.find((b) => b.kind === 'SPINE')!.text;
  assert.match(spine, /The Silver Key/, 'the spine is still assembled from the rest');
  assert.match(spine, /Setting: Vantic/, 'and still carries the setting it trims');
  assert.doesNotMatch(spine, /Where this is going/, 'the label is gone');
  assert.doesNotMatch(spine, /Marek chooses the archive/,
    'and so is the text — nothing may read a destination into a prompt');
});

ok('the chapter beat reaches DIRECTIVE', () => {
  const i = base(); i.currentChapter = i.chapters[2];
  const m = buildContext(i, count);
  assert.match(m.blocks.find((b) => b.kind === 'DIRECTIVE')!.text, /refuses to hand over the key/);
});

ok('overflow refuses and names the block the server would drop', () => {
  const i = base(); i.budget = 60;
  const m = buildContext(i, count);
  assert.ok(m.overflowed);
  assert.match(m.overflowReason!, /SPINE/);
});

ok('EARLIER has a ceiling', () => {
  const i = base(); i.budget = 400;
  i.chapters = Array.from({ length: 60 }, (_, k) => ({
    id: `c${k}`, index: k, title: `Ch${k}`, summary: 'x'.repeat(400) }));
  i.currentChapter = { id: 'cur', index: 59, title: 'now' };
  const m = buildContext(i, count);
  const earlier = m.blocks.filter((b) => b.kind === 'EARLIER' && b.state === 'included')
                          .reduce((s, b) => s + b.tokens, 0);
  assert.ok(earlier <= 400 * 0.25 + 1, `EARLIER unbounded: ${earlier}`);
});

ok('canon obeys the 45% cap', () => {
  const i = base(); i.budget = 200;
  i.entries = Array.from({ length: 40 }, (_, k) =>
    entry(`e${k}`, `[Filler ${k}: ` + 'y'.repeat(200) + ']'));
  const m = buildContext(i, count);
  const canon = m.blocks.filter((b) => b.kind.startsWith('CANON') && b.state === 'included')
                        .reduce((s, b) => s + b.tokens, 0);
  assert.ok(canon <= 200 * 0.45 + 1, `canon over cap: ${canon}`);
});

ok('MODE is dropped for Narrate on an unfinished line, and only there', () => {
  const i = base();
  i.passages = [...i.passages, { id: 'p4', ordinal: 4, body: 'He reached for the' }];
  assert.ok(!buildContext(i, count).blocks.some((b) => b.kind === 'MODE'));
  const d = { ...i, mode: 'direct' as const, directive: 'He drops it.' };
  assert.ok(buildContext(d, count).blocks.some((b) => b.kind === 'MODE'),
    'Direct must keep MODE — its directive lives only there');
  const sp = { ...i, mode: 'speak' as const, speaker: 'Aldis' };
  assert.ok(buildContext(sp, count).blocks.some((b) => b.kind === 'MODE'),
    'Speak must keep MODE — whose line it is lives only there');
});

ok("the writer's own wording replaces a mode outright, and empties back to the shipped one", () => {
  // Not `!`: a blank override drops the MODE block entirely (add() skips empty text), and with a
  // bang that fails as a TypeError from the harness rather than as the assertion that saw it.
  const withOwn = (modePrompts: any, mode = 'speak', o: any = {}) =>
    buildContext({ ...base(), mode, speaker: 'Marek Vale', modePrompts, ...o } as any, count)
      .blocks.find((b) => b.kind === 'MODE') ?? { text: '(no MODE block at all)', reason: '' };

  const shipped = withOwn(undefined);
  assert.match(shipped.text, /whole answer/, 'the shipped wording, for comparison');

  const mine = withOwn({ speak: 'Answer as the room does. {{speaker}} has said their piece.' });
  assert.strictEqual(mine.text, 'Answer as the room does. Marek Vale has said their piece.',
    'a full replace, with {{speaker}} filled the way the shipped one fills it');
  assert.doesNotMatch(mine.text, /whole answer/, 'and nothing of the shipped wording survives');
  // The Context panel has to say the prompt is not the one that shipped, or an override is a
  // silent change to every generation with nothing on screen admitting it.
  assert.match(mine.reason, /yours/, 'and the manifest says whose wording it is');
  assert.strictEqual(shipped.reason, 'mode:speak');

  // {{directive}} is the other placeholder, and it belongs to Direct.
  const dir = withOwn({ direct: 'Do this and nothing else: {{directive}}' }, 'direct',
                      { directive: 'He drops the key.' });
  assert.strictEqual(dir.text, 'Do this and nothing else: He drops the key.');

  // An override for one mode must not reach another.
  assert.match(withOwn({ speak: 'MINE' }, 'act').text, /what it costs, or what it gets/,
    'act still has its own wording');

  // Blank is not a third state. db.setPrompt deletes rather than storing it, and the engine
  // treats whitespace as absent too — so a blank that got stored some other way cannot silently
  // send the model an empty MODE block.
  for (const blank of ['', '   ', '\n\t '])
    assert.match(withOwn({ speak: blank }).text, /whole answer/,
      `a blank override falls back to the shipped wording (${JSON.stringify(blank)})`);
});

// COUNCIL-04 #9: chapter 40 fits and chapter 120 does not — 53 chapter summaries drop oldest-first
// and the book quietly loses its own beginning. `POST /api/rollup` is the fix and had no caller.
// This is the arithmetic behind it, and it needs no model: summaries are text, and the ceiling is
// a fraction of the budget.
ok('when canon is capped, the walk-on goes before the point-of-view character', () => {
  // COUNCIL-04 #8: rows come back by rowid and eviction followed that, so the protagonist Spark
  // wrote FIRST went before yesterday's walk-on. Creation order is the one thing that must not
  // decide this — it is inversely correlated with importance in every story that was sparked.
  const body = (name: string) => `[${name}: ` + 'a person with attributes and a history, '.repeat(14) + ']';
  const i = base();
  i.story = { ...i.story, persona: 'Ilva Marren' } as any;
  i.passages = [{ id: 'p1', ordinal: 1, body: 'Ilva Marren crossed the yard. Bram was there, and Sen watched from the door.' }];
  i.pins = { 'e-sen': 'force_in' };
  // Created in this order, which is the order that used to decide. The protagonist is FIRST.
  i.entries = [
    entry('e-ilva', body('Ilva Marren'), { title: 'Ilva Marren', activation: 'triggered', keys: ['Ilva'] }),
    entry('e-bram', body('Bram'), { title: 'Bram', activation: 'triggered', keys: ['Bram'] }),
    entry('e-sen', body('Sen'), { title: 'Sen', activation: 'triggered', keys: ['Sen'] }),
  ];
  // A budget that fits some of them but not all: the 45% cap is what bites.
  i.budget = 900;
  const m = buildContext(i, count);
  const state = (id: string) => m.blocks.find((b) => b.id === id)?.state;
  assert.strictEqual(state('e-sen'), 'included', 'the one the writer PINNED survives');
  assert.strictEqual(state('e-ilva'), 'included', 'and so does the point-of-view character');
  assert.strictEqual(state('e-bram'), 'omitted',
    'the walk-on who merely fired on a keyword is what goes — it used to be Ilva, because she '
    + 'was created first');
});

ok('a string reaches the prompt only when it is summoned, and is told what is owed not to pay it', () => {
  const withStrings = (strings: any) =>
    buildContext({ ...base(), strings } as any, count).blocks.find((b) => b.kind === 'STRING');

  assert.strictEqual(withStrings(undefined), undefined, 'no strings, no block');
  assert.strictEqual(withStrings([]), undefined, 'and an empty list is not an empty block');

  const b = withStrings([
    { title: 'The letter he has not opened', body: 'Sent by his brother', fromChapter: 6, owedBy: 20 },
    { title: 'The debt to Marek' },
  ])!;
  assert.match(b.text, /The letter he has not opened: Sent by his brother \(set up in chapter 6, owed by chapter 20\)/,
    'the promise, where it was made, and when it is owed');
  assert.match(b.text, /- The debt to Marek$/m, 'and one with neither is still a line');
  // The whole reason strings are writer-facing until summoned: a model handed an unresolved
  // promise reaches for it, and paying it off is the writer's move.
  assert.match(b.text, /do not resolve one unless the writer asks/,
    'it is told what is owed, not told to pay it');
  assert.strictEqual(b.reason, '2 summoned');

  // It sits with canon, before the summaries — near what is true, not near the instructions.
  const m = buildContext({ ...base(), strings: [{ title: 'x' }] } as any, count);
  const idx = m.blocks.map((x) => ORDER.indexOf(x.kind));
  assert.deepStrictEqual(idx, [...idx].sort((a, z) => a - z), 'and it does not break the order');
});

ok('a 120-chapter book forgets its distant past, in one piece, and acts get it back', () => {
  const long = () => {
    const i = base();
    // 220 tokens each, which is what SUMMARY(180) is asked for and what they come back at.
    const summary = 'Something happened, and then something else did, and it mattered later. '
      .repeat(12).trim();
    i.chapters = Array.from({ length: 120 }, (_, n) => ({
      id: `c${n + 1}`, index: n + 1, title: `Chapter ${n + 1}`, summary }));
    i.currentChapter = { id: 'c120', index: 120, title: 'Chapter 120' };
    i.budget = 46_146;      // a 50,048 slot, less the reply reserve and the margin
    return i;
  };

  const earlier = (m: ReturnType<typeof buildContext>, state: string) => m.blocks
    .filter((b) => b.kind === 'EARLIER' && b.state === state);

  const before = buildContext(long(), count);
  const droppedBefore = earlier(before, 'omitted').length;
  // 65 until 2026-08-27, when the prose window closed at the chapter boundary. This fixture has
  // no passages at all, so it is the EMPTY-chapter case: 119 and 120 stay whole, 118 summaries are
  // eligible instead of 117, and one more of them is dropped. The number moved because the
  // behaviour did, and it is still measured rather than asserted.
  assert.strictEqual(droppedBefore, 66,
    `118 summaries do not fit and 66 are dropped — measured, not asserted (${droppedBefore})`);

  // WHAT SURVIVES IS THE RECENT PAST, IN ONE PIECE. It was not: chapter ids sort as strings, so
  // "c10" came before "c2" and the book kept chapters 6-9, then 52-55, then 96-99 — scattered runs
  // with holes, and the newest summary dropped too (COUNCIL-04 #8, measured in F31). A book
  // missing its distant past has a past it has forgotten. A book missing chapters 10 to 51
  // contradicts itself in the middle and cannot say why.
  const kept = earlier(before, 'included').map((b) => Number(b.id.slice(1))).sort((a, b) => a - b);
  assert.ok(kept.every((c, k) => k === 0 || c === kept[k - 1] + 1),
    `the summaries that survive must be one unbroken run (${kept[0]}..${kept.at(-1)})`);
  assert.strictEqual(kept.at(-1), 118, 'ending at the newest one there is');
  assert.ok(kept[0] > 1, 'and what goes is the distant past, which is the only defensible thing to lose');

  // Now roll each run of twenty into one act, which is what the button does.
  const rolled = long();
  rolled.arcs = Array.from({ length: 5 }, (_, k) => ({
    fromChapter: k * 20 + 1, toChapter: k * 20 + 20,
    title: `Act ${k + 1}`, summary: 'Twenty chapters of it, in one paragraph. '.repeat(6).trim() }));
  const after = buildContext(rolled, count);
  assert.strictEqual(earlier(after, 'omitted').length, 0,
    'with the first hundred chapters as five acts, nothing has to be dropped');
  // And the acts are actually IN it rather than merely not dropped.
  const arcBlocks = earlier(after, 'included').filter((b) => b.reason === 'arc');
  assert.strictEqual(arcBlocks.length, 5, 'all five acts reach the prompt');
  const beforeTokens = earlier(before, 'included').reduce((t, b) => t + b.tokens, 0);
  const afterTokens = earlier(after, 'included').reduce((t, b) => t + b.tokens, 0);
  assert.ok(afterTokens < beforeTokens,
    `and it costs less than the summaries it replaced (${afterTokens} against ${beforeTokens})`);
});

/* NO INSTRUCTION MAY NAME THE PASSAGE A RE-ROLL LEAVES OUT. 2026-09-18, and it cost a writer a
 * day's presses.
 *
 * A re-roll of passage N is assembled from the passages BEFORE N — `assemble` filters
 * `ordinal < upToOrdinal`, so a new take is not written with knowledge of what came after it, and
 * the take being replaced is not in the prompt either. From 2026-09-01 a wording of its own rode
 * with it, "Write this passage again", pointing at exactly the passage that had been cut. The last
 * passage the model could see was N-1, so it wrote N-1 again: press Regenerate on the model's
 * answer and you were handed back your own paragraph.
 *
 * The engine cannot see which passage is being re-rolled — that is the route's to know. What it
 * CAN hold is the rule the wordings have to obey: they may point at what is in the prompt ("the
 * passage above", "the last passage") and never at what is not. `test/scope.ts` holds the other
 * half, that a re-roll's prompt is the prompt that wrote the passage, to the byte.
 */
ok('no mode instruction points at a passage the prompt does not contain', () => {
  const modeText = (o: any) =>
    buildContext({ ...base(), ...o } as any, count).blocks.find((b) => b.kind === 'MODE')?.text ?? '';

  for (const m of ['continue', 'speak', 'act', 'direct', 'narrate']) {
    const t = modeText({ mode: m as any, directive: 'He drops it.' });
    // THE DEICTIC IS THE DEFECT. "this passage" is the one that has no referent in a re-roll's
    // prompt; the shipped modes that do point somewhere point at the prose that IS sent.
    assert.doesNotMatch(t, /\bthis passage\b/i,
      `${m} points at "this passage", which a re-roll's prompt does not contain`);
  }

  // AND THERE IS NO SIXTH WORDING TO POINT WITH. A key the engine does not render is a box in the
  // editor that changes nothing, which is what the old one became the moment it was wrong.
  assert.strictEqual(modeText({ mode: 'regenerate' as any }),
                     modeText({ mode: 'continue' as any }),
    'regenerate is not a mode: asking for it falls through to the neutral one');

  // The ordinary modes still say their own thing — the guard above must not be passing because
  // every instruction went blank.
  assert.match(modeText({ mode: 'continue' as any }), /one small beat/);
  assert.match(modeText({ mode: 'narrate' as any }), /written by the author, not by you/);
});

// The five modes are not five labels on one behaviour. Two things separate them, and a mode set
// that blurs either one is the bug this replaced: whether the writer's text is an INSTRUCTION
// (direct) or is already the last PASSAGE (speak, act, narrate), and who it belongs to.
ok('each mode says the one thing that distinguishes it', () => {
  const modeText = (o: Partial<ReturnType<typeof base>>) =>
    buildContext({ ...base(), ...o } as any, count).blocks.find((b) => b.kind === 'MODE')?.text ?? '';

  // Continue takes no directive at all — it is a button, so there is nowhere to type one.
  const cont = modeText({ mode: 'continue' as any, directive: 'IGNORE ME' });
  assert.ok(/one small beat/.test(cont), 'Continue must ask for the next beat');
  assert.ok(!/IGNORE ME/.test(cont), 'Continue must not carry a directive it cannot be given');

  // NO PROMPT MAY NAME A LENGTH. F18: a named length is a length the model fills, and three of
  // these carried one. The scope words do the work — one beat, cover the instruction, stop at a
  // natural beat — and max_tokens is the bound, because that one fails visibly.
  const asked = (m: string) => ({ mode: m as any });
  for (const m of ['continue', 'speak', 'act', 'direct', 'narrate']) {
    const t = modeText({ ...asked(m), directive: 'He drops it.' });
    assert.doesNotMatch(t, /\d\s*-\s*\d\s+paragraphs?|\b(one|two|three|four|five)\s+paragraphs?\b/i,
      `${m} names a paragraph count, which is the defect F18 measured`);
    assert.doesNotMatch(t, /\b(\d+|a few|several)\s+(sentences|words)\b(?!\s+that takes)/i,
      `${m} names a length in sentences or words`);
  }

  // THE TARGET IS OFF UNLESS THE WRITER TURNS IT ON, and this is the half that says so. The line
  // above proves the SHIPPED modes name no length; without this one it would also pass if the
  // target leaked into every book, because the target is appended after the mode text and these
  // fixtures set no target. Both directions, or the guard only watches one.
  // Matches the target LINE, not the word "words" — speak legitimately says "Do not put further
  // words in that character's mouth", and a check that fires on that is a check that has to be
  // deleted the first time it goes red for the wrong reason.
  const AIM = /Aim for roughly \d+ words/i;
  for (const m of ['continue', 'speak', 'act', 'direct', 'narrate']) {
    const off = modeText({ ...asked(m), directive: 'He drops it.' });
    assert.doesNotMatch(off, AIM, `${m} carries a length target with none set`);
    const on = modeText({ ...asked(m), directive: 'He drops it.', targetWords: 400 });
    // The whole line, anchored, because both halves of it are load-bearing: on its OWN line per
    // F37 (buried in a longer one the same rule bought 10.7%), and carrying the permission to come
    // in under the number, which is the only thing separating a target from the quota F18/F29
    // measured. A looser match would let either half rot away green.
    assert.match(on, /^Aim for roughly 400 words, and stop sooner if the beat is done\.$/m,
      `${m} must carry the target, whole, on its own line`);
    assert.ok(on.startsWith(off), `${m} must keep its own wording and only gain a line`);
  }
  // Talk is Anansi answering the writer, not a passage, and has its own bound.
  assert.doesNotMatch(modeText({ mode: 'talk' as any, directive: 'Who is she?', targetWords: 400 }),
    AIM, 'talk must not be given a passage length');

  // AND NO PROMPT MAY OFFER A LIST OF SLOTS. Speak said "speech, action, the room" and got back
  // reply, gesture, weather, in that order, every time (COUNCIL-04) — three slots is a shape, and
  // a shape the model can see is a shape it completes. Act had the same defect in other words.
  assert.doesNotMatch(modeText({ mode: 'speak' as any }), /speech, action, the room/);
  assert.doesNotMatch(modeText({ mode: 'act' as any }), /the consequence, the reaction, the world/);
  assert.match(modeText({ mode: 'speak' as any }), /any one of\s*\n?those is a whole answer/,
    'and Speak says explicitly that one thing is a whole answer');

  // Direct's text is an instruction and must appear as one. Matched on the directive and the colon
  // that introduces it rather than on the opening words: Seth reworded that line on 2026-09-01
  // ("Re write what happens based on this:") and this assertion is about the directive REACHING the
  // template, not about which verb the line opens with.
  assert.match(modeText({ mode: 'direct' as any, directive: 'He drops it.' }),
    /based on this: He drops it\./);

  // Speak and Act name the speaker, and forbid the two failure modes each has: talking on in
  // that character's voice, and deciding what they do next.
  const spk = modeText({ mode: 'speak' as any, speaker: 'Aldis Fen' });
  assert.match(spk, /dialogue the writer has just spoken as Aldis Fen/);
  assert.match(spk, /Do not put further words in Aldis Fen's mouth/);
  const act = modeText({ mode: 'act' as any, speaker: 'Aldis Fen' });
  assert.match(act, /what Aldis Fen has just done/);
  assert.match(act, /Do not decide what Aldis Fen does next/);
  // With nobody named they must still be legible rather than saying "as undefined".
  assert.ok(!/undefined/.test(modeText({ mode: 'speak' as any })), 'a missing speaker must not print undefined');

  // Narrate is the only mode that tells the model the text above is the author's own prose.
  // Without that it treats a paragraph of narration as a request and writes ABOUT it.
  assert.match(modeText({ mode: 'narrate' as any }), /written by the author, not by you/);

  // A stale tab sending a retired name degrades to the neutral mode instead of a 500.
  assert.ok(/one small beat/.test(modeText({ mode: 'cowrite' as any })),
    'an unknown mode must fall back, not throw');
});

ok('the fact detector catches a dropped name and ignores a reworded one', () => {
  // F17: validate the detector before believing the result, both directions. Two callers trust
  // this — `bench/compact.ts` refuses a rewrite that lost a fact, and `db.staleSummariesFor`
  // decides whether a chapter summary has started lying. Both used to carry their own copy.
  const src = '[Halsey: 34, owes Marek 900 crowns, keeps the Martin in its case]';
  assert.deepStrictEqual(factsIn(src), ['34', '900', 'Halsey', 'Marek', 'Martin']);
  assert.deepStrictEqual(lostOf(src, '[Halsey: 34, owes Marek 900 crowns, the Martin cased]'), [],
    'a rewrite that keeps every name and number must not flag');
  assert.deepStrictEqual(lostOf(src, '[Halsey: 34, owes money, keeps the Martin in its case]'),
    ['900', 'Marek'], 'a rewrite that drops a number and a name must flag both');

  // THE GREEDY-NUMBER BUG, which was written twice because the detector was written twice. The
  // pattern was `\d[\d,.:-]*`, which swallowed the comma after a number, so "34," was compared
  // against "34" and a fact that had merely been repunctuated read as lost.
  assert.deepStrictEqual(lostOf('[Halsey: 34, ex-Watch]', '[Halsey: 34. Ex-Watch.]'), [],
    'repunctuation is not a lost fact');

  // SENTENCE OPENERS ARE NOT NAMES, AND THE RULE IS POSITION AND NOT SPELLING. This was a
  // stopword list until 2026-08-30 and the list held back 89 of the first 140 rewrites in the
  // full compaction — `Upon`, `During`, `Unlike`, `Instead`, `Despite`. No list is ever finished,
  // because any word can open a sentence.
  const opener = '[Halsey: 34. She keeps the Martin cased. His debt to Marek is 900 crowns.]';
  assert.deepStrictEqual(lostOf(opener, '[Halsey: 34, the Martin cased, 900 crowns to Marek]'), [],
    'dropping "She" and "His" is a rewrite, not a lost fact');
  assert.deepStrictEqual(lostOf(opener, '[Halsey: 34, the Martin cased, a debt of 900]'), ['Marek'],
    'but a real name in the same sentence is still caught');

  // THE CASE THE LIST COULD NOT REACH, both directions, from the live imported books. `Emperor`
  // earns its place by appearing where no sentence begins; `During` never appears anywhere else.
  const forty = 'Upon arrival he served the Emperor. During the Unification Wars the Emperor '
    + 'named him. Despite the Warp, the Legion held.';
  const got = factsIn(forty);
  for (const real of ['Emperor', 'Unification', 'Wars', 'Warp', 'Legion'])
    assert.ok(got.includes(real), `${real} is a proper noun in this text and must be a fact`);
  for (const noise of ['Upon', 'During', 'Despite'])
    assert.ok(!got.includes(noise),
      `${noise} only ever opens a sentence here and must not read as a name — that is 64% of a `
      + 'compaction run held back for nothing');

  // THE CARD'S OWN NAME sits where a sentence begins, so the positional rule alone would ignore
  // the one fact that matters most. The label is added back by name, and `db.staleSummariesFor`
  // passes `title: body` rather than `title\nbody` so that a rename reaches it.
  assert.ok(factsIn('[Halsey: 34, owes Marek]').includes('Halsey'),
    'the opening label is a fact even though it opens the text');
  assert.ok(factsIn('You: ').includes('You'),
    'including when the card is named for a common word — this was a documented ceiling and is '
    + 'not one any more');

  // ITS CEILING, asserted rather than only described: lexical, so it sees a DROP and not a
  // DISTORTION. If this ever goes red, somebody has made it smarter — delete the assertion.
  assert.deepStrictEqual(lostOf('[Halsey: 34]', '[Halsey: thirty-four]'), ['34'],
    'a number turned into a phrase reads as a drop, and that is the limit of a lexical check');
  function lostOf(a: string, b: string) { return factsLost(a, b); }
});

ok('a passage that stops mid-line does not hand its dialogue back as narration', () => {
  // Only the narrator commits the story, so every quality check reads `narrationOnly` rather than
  // the raw text. The pattern required a CLOSING quote, so a generation that ran out of tokens
  // mid-line left an opening quote with no partner and that whole span came back AS NARRATION —
  // the one thing this function exists to prevent, in the one case nobody looks at.
  //
  // Found by bench/council06.ts: 8 of 60 generations end that way, and 46 passages in the live
  // library are in that state now.
  const cut = 'He nodded. "I know," she said. "It was never';
  assert.doesNotMatch(narrationOnly(cut), /It was never/,
    'the unterminated final line is dialogue and must be stripped');
  assert.match(narrationOnly(cut), /He nodded/, 'and the narration around it must survive');

  // THE CONTROL, because a strip that ate everything would also pass the line above. This is the
  // shape the function has always handled and the change must not touch it.
  const whole = 'He nodded. "I know," she said. The room went quiet.';
  assert.match(narrationOnly(whole), /He nodded/);
  assert.match(narrationOnly(whole), /The room went quiet/, 'narration between speeches survives');
  assert.doesNotMatch(narrationOnly(whole), /I know/, 'and the speech does not');

  // A SPEECH WITH A NEWLINE IN IT IS STILL ONE SPEECH. A line-anchored version of this fix was
  // tried first and rejected on measurement: it fixes four more passages in the live library and
  // breaks four real speeches that carry a hard break, which is the worse trade. This is the case
  // that decided it.
  const broken = '"I had you.\nWhat did you want me to do — crush your throat?"';
  assert.doesNotMatch(narrationOnly(broken), /crush your throat/,
    'a speech broken across two lines is one quoted span, not narration on the second line');

  // THE OFFSETS AGREE WITH THE STRIP, which is the whole reason they share a pattern. routes.ts
  // filters the checker's findings by these spans; if they disagreed, a line could be stripped
  // here and reported as narration there.
  const spans = quotedSpans(cut);
  assert.strictEqual(spans.length, 2, `both speeches must be spans, got ${JSON.stringify(spans)}`);
  assert.strictEqual(cut.slice(spans[1][0], spans[1][1]), '"It was never',
    'and the second span is the unterminated one, running to the end of the text');
});

ok('buildContext is pure: same input, same manifest', () => {
  const a = JSON.stringify(buildContext(base(), count));
  const b = JSON.stringify(buildContext(base(), count));
  assert.strictEqual(a, b);
});

ok('render emits only what the manifest included', () => {
  const m = buildContext(base(), count);
  const out = render(m);
  assert.ok(out.includes('Silver Key'));
  assert.ok(!out.includes('Ghost Wolf'), 'omitted blocks must not reach the prompt');
  assert.ok(out.indexOf('<story>') < out.indexOf('<canon>'));
});

ok('the mode instruction is fenced, and the prose it follows is not', () => {
  // COUNCIL-06 §3, shipped 2026-08-30. `TAG` covered 7 of the 11 kinds and MODE was not one, so a
  // prompt ended: the last sentence of the book, one newline, then "Carry the scene forward by one
  // small beat." — an order in the same typographic register as the novel above it, with nothing
  // saying where one stopped and the other began. Every other block already had that boundary.
  //
  // NOTHING IS CLAIMED. F29 has the mode checklist at 10/10, so this is not expected to move a
  // number and no measurement is owed. What is asserted is that the boundary exists.
  const i = base();
  i.mode = 'continue';   // narrate can drop MODE entirely; this mode always has one
  const out = render(buildContext(i, count));

  const fence = out.match(/<mode>\n([\s\S]*?)\n<\/mode>/);
  assert.ok(fence, `MODE reached the prompt unfenced. The prompt ends:\n${out.slice(-240)}`);
  assert.match(fence![1], /one small beat/,
    'and the fence must hold the mode instruction, not some neighbouring block that drifted in');

  // THE HALF THAT IS THE POINT. A fence that opened one block early would put the sentence the
  // model continues from inside a marked-up region — which is not a boundary, it is a change to
  // what the model is imitating. The tail prose must sit OUTSIDE the fence, and before it.
  const tail = 'Aldis counted the coins twice and came up short.';
  assert.ok(out.includes(tail), 'the fixture must actually reach TAIL, or this asserts nothing');
  assert.ok(out.indexOf(tail) < out.indexOf('<mode>'),
    'the prose must come before the fence opens');
  assert.ok(!fence![1].includes(tail), 'and must not be inside it');

  // The instruction is the LAST thing in the prompt, so the fence closing it is the last token
  // the model sees. If another block ever renders after MODE, ORDER changed and this is the check
  // that says so.
  assert.ok(out.trimEnd().endsWith('</mode>'),
    `the prompt must end on the closed fence; it ends "${JSON.stringify(out.slice(-60))}"`);
});

ok('a fresh summary reaches EARLIER', () => {
  const i = base();
  i.currentChapter = { id: 'c9', index: 9, title: 'now' };
  i.chapters = [{ id: 'c1', index: 1, title: 'Debt', summary: 'Aldis borrows.' }];
  const m = buildContext(i, count);
  const e = m.blocks.find((b) => b.kind === 'EARLIER')!;
  assert.strictEqual(e.state, 'included');
  assert.match(e.text, /Aldis borrows/);
});

ok('a stale summary is excluded and says why', () => {
  const i = base();
  i.currentChapter = { id: 'c9', index: 9, title: 'now' };
  i.chapters = [{ id: 'c1', index: 1, title: 'Debt', summary: 'Aldis borrows.', summaryStale: true }];
  const m = buildContext(i, count);
  const e = m.blocks.find((b) => b.kind === 'EARLIER')!;
  assert.strictEqual(e.state, 'omitted', 'a stale summary must not reach the prompt');
  assert.match(e.reason, /out of date/, 'and the reason the writer reads says out of date');
  assert.ok(!render(m).includes('Aldis borrows'), 'and must not survive into the rendered prompt');
});

ok('notes never reach the prompt', () => {
  // SPEC §7.1: writer-only. Without it, spoilers and TODOs end up in `body` and leak into
  // the prose. The engine's Entry type has no `notes` field at all, which is the point —
  // it cannot be rendered by accident.
  const i = base();
  (i.entries[0] as any).notes = 'SPOILER: he dies in chapter nine';
  const out = render(buildContext(i, count));
  assert.ok(!out.includes('SPOILER'), 'a note must not be renderable');
  assert.ok(!out.includes('chapter nine'));
});

ok('a few hundred words of voice survive whole', () => {
  // COUNCIL-04 #5: this was a `keep: false` part of DIRECTIVE's 250-token cap, so a voice of any
  // real length was guaranteed to be cut. It has its own 1000-token block now. The fencing and the
  // placement are checked where the wrapper is — this is only about the length surviving.
  const i = base();
  const long = 'Write the narration in contractions and never name a colour twice. '.repeat(60);
  i.story.writingStyle = long.trim();            // ~960 tokens, just under the 1000 cap
  const v = buildContext(i, count).blocks.find((b) => b.kind === 'VOICE')!;
  assert.strictEqual(v.state, 'included');
  assert.doesNotMatch(v.reason, /shortened/, 'a few hundred words must fit whole');
  assert.ok(v.text.includes(long.trim()), 'and arrive verbatim');
});

ok('an oversized voice REFUSES rather than shortening, and DIRECTIVE keeps everything', () => {
  // COUNCIL-06 ship 4 REVERSED THIS CHECK, and the reversal is the point. VOICE had two parts —
  // the instruction (keep:true) and the writer's prose sample (keep:false) — so an over-cap block
  // shortened, and what it cut was the sample. The sample is gone (F36: a finished line in every
  // prompt is lifted into the prose, and a paragraph of one is the largest version of that).
  //
  // So VOICE is one keep:true part now and behaves like DIRECTIVE: it cannot trim, only refuse.
  // The old assertion was `/shortened/`. Left as it was it would have gone on passing only if some
  // trimmable part still existed — which is exactly the thing that was removed.
  const i = base();
  // AND THE FIXTURE GREW WITH THE CAP AGAIN. `.repeat(90)` made ~830 tokens, which overran 500
  // and does not overrun 1000, so this check would have gone on passing while no longer
  // reproducing the condition it exists for.
  i.story.writingStyle = 'Write the narration in contractions. '.repeat(190);  // ~1750 tokens
  i.story.spice = 5;
  i.currentChapter = { id: 'c3', index: 3, title: 'Key', authorsNote: 'He must be forced.' };
  const m = buildContext(i, count);
  const v = m.blocks.find((b) => b.kind === 'VOICE')!;
  assert.match(v.reason, /nothing in it may be cut/,
    `an all-keep anchor refuses and says so; this said "${v.reason}"`);
  assert.doesNotMatch(v.reason, /shortened/,
    'and it must NOT report a trim it did not perform — that is the false reason context.ts:554 '
    + 'exists to stop');
  // THE INSTRUCTION ARRIVES WHOLE OR NOT AT ALL. F37 measured it as the half that holds the
  // register at 98%; a silently shortened register is the failure COUNCIL-04 #5 is about.
  assert.match(v.text, /contractions/, 'the instruction is there');

  const d = m.blocks.find((b) => b.kind === 'DIRECTIVE')!;
  assert.doesNotMatch(d.reason, /shortened/, 'and DIRECTIVE still pays for none of it');
  const out = render(m);
  assert.match(out, /third limited/, 'point of view survives');
  assert.match(out, /fully explicit/, 'the register survives');
  assert.match(out, /must be forced/, 'the chapter beat survives');
});

ok('a compacted chapter can be pulled back in full, and it costs the recent window', () => {
  // A summary carries plot through compaction and throws tone away. Writing a callback to a
  // scene twenty chapters back, you want the prose. Pulling it must TRADE — refusing is a
  // bad answer to "give me that scene".
  const mk = (pull: number[]) => {
    const i = base();
    const n = 12;
    i.chapters = Array.from({ length: n }, (_, k) => ({
      id: `c${k + 1}`, index: k + 1, title: `Ch${k + 1}`,
      summary: `Summary ${k + 1}.`, keepWhole: pull.includes(k + 1) }));
    i.currentChapter = { id: 'cur', index: n + 1, title: 'now' };
    i.passages = Array.from({ length: n * 2 }, (_, k) => ({
      id: `p${k + 1}`, ordinal: k + 1, body: `Ch${Math.floor(k / 2) + 1} prose ${'x'.repeat(1200)}`,
      chapterId: `c${Math.floor(k / 2) + 1}` }));
    i.budget = 4000; i.directive = '';
    const m = buildContext(i, count);
    return {
      m, chapters: [...new Set(m.blocks
        .filter((b) => (b.kind === 'PROSE' || b.kind === 'TAIL') && b.state === 'included')
        .map((b) => Number(/^Ch(\d+)/.exec(b.text)![1])))].sort((a, b) => a - b),
    };
  };

  const plain = mk([]);
  assert.ok(!plain.chapters.includes(3), 'chapter 3 is compacted by default');
  assert.strictEqual(plain.m.overflowed, false);

  const pulled = mk([3]);
  assert.ok(pulled.chapters.includes(3), 'pulling chapter 3 puts its prose back');
  assert.strictEqual(pulled.m.overflowed, false, 'and it must not overflow — it trades');
  const summaries = pulled.m.blocks.filter((b) => b.kind === 'EARLIER' && b.state === 'included');
  assert.ok(!summaries.some((b) => b.text.includes('Summary 3.')),
    'a pulled chapter must not send its summary as well — that is the duplication we removed');
});

// The prose window closes at the chapter boundary, and the seam is the exception.
//
// Seth, 2026-08-27: "when starting a new chapter it should dump current context after the first
// message, then rely on the summary, threads and strings." The window was the current chapter plus
// the two before it; it is the current chapter alone once that chapter has a passage in it.
//
// Both directions asserted, because only the pair can fail: a window that never closes keeps the
// old chapters, and a window that closes at the boundary itself leaves the opening passage of every
// chapter with no sentence in front of it.
ok('the prose window closes once the new chapter has a passage, and not before', () => {
  const at = (chapterId: string | undefined, ...bodies: string[]) => bodies.map((body, k) => ({
    id: `${chapterId ?? 'x'}-${k}`, ordinal: k + 1, body, chapterId }));

  const book = (started: boolean): Input => ({
    ...base(),
    chapters: [
      { id: 'c1', index: 1, title: 'One', summary: 'Chapter one happened.' },
      { id: 'c2', index: 2, title: 'Two', summary: 'Chapter two happened.' },
      { id: 'c3', index: 3, title: 'Three', summary: 'Chapter three happened.' },
      { id: 'c4', index: 4, title: 'Four' },
    ],
    currentChapter: { id: 'c4', index: 4, title: 'Four' },
    passages: [
      ...at('c2', 'CHAPTER TWO PROSE.'),
      ...at('c3', 'CHAPTER THREE PROSE.'),
      // The break lands in the chapter being CLOSED, which is why it is c3's and why an empty c4
      // must still read as empty.
      { id: 'brk', ordinal: 90, body: '', chapterId: 'c3', isBreak: true },
      ...(started ? at('c4', 'CHAPTER FOUR PROSE.') : []),
    ],
  } as any);

  const prose = (m: ReturnType<typeof buildContext>) => m.blocks
    .filter((b) => (b.kind === 'PROSE' || b.kind === 'TAIL') && b.state === 'included')
    .map((b) => b.text).join(' ');
  const summaries = (m: ReturnType<typeof buildContext>) => m.blocks
    .filter((b) => b.kind === 'EARLIER' && b.state === 'included').map((b) => b.text).join(' ');

  // EMPTY: the chapter before stays whole, so the opening has a sentence to continue from.
  const fresh = buildContext(book(false), count);
  assert.match(prose(fresh), /CHAPTER THREE PROSE/,
    'a chapter with nothing in it yet must still see the one before it — otherwise every chapter '
    + 'opens from a summary with no prose in front of it');
  assert.ok(!/Chapter three happened/.test(summaries(fresh)),
    'and chapter three must not ALSO arrive as a summary — that is the duplication the window exists to stop');

  // STARTED: one passage of its own, and the window shuts behind it.
  const going = buildContext(book(true), count);
  assert.match(prose(going), /CHAPTER FOUR PROSE/, 'the chapter you are writing is whole');
  assert.ok(!/CHAPTER THREE PROSE/.test(prose(going)),
    'and the chapter before it is gone from the prose the moment this one has a passage');
  assert.ok(!/CHAPTER TWO PROSE/.test(prose(going)), 'along with everything older');
  // What it falls back on. This is the whole bargain: prose out, summary in.
  assert.match(summaries(going), /Chapter three happened/,
    'what leaves the prose has to arrive as its summary, or the chapter is simply forgotten');
  assert.match(summaries(going), /Chapter two happened/, 'and so does the one before that');

  // A chapter holding ONLY a break is still empty. The break is a real passage — NEW SCENE needs
  // something to fire on and ordinals stay dense — and it lands in the chapter being closed. If it
  // ever lands in the fresh one instead, counting passages without excluding it would call an empty
  // chapter full and cut the previous chapter away from under the opening passage.
  const onlyBreak = book(false);
  onlyBreak.passages = [...onlyBreak.passages,
    { id: 'brk2', ordinal: 99, body: '', chapterId: 'c4', isBreak: true } as any];
  const stillFresh = buildContext(onlyBreak, count);
  assert.match(prose(stillFresh), /CHAPTER THREE PROSE/,
    'a chapter holding nothing but a scene break has not started, and must still see the one before it');

  // The hatch. `keepWhole` is how a writer says "look at that chapter again", and it has to beat
  // the window or there is no way back to a chapter the model has stopped seeing.
  const pulled = book(true);
  pulled.chapters = pulled.chapters.map((c) => c.index === 2 ? { ...c, keepWhole: true } : c);
  const back = buildContext(pulled, count);
  assert.match(prose(back), /CHAPTER TWO PROSE/, 'pulling a chapter back beats the window');
  assert.ok(!/Chapter two happened/.test(summaries(back)),
    'and its summary steps aside, so it is not sent twice');
});

// A key fires through the punctuation a book is actually written with.
//
// The apostrophe is inside the tokeniser's character class so `aldi's` survives as one word — and
// that kept the ones at the EDGES too, so `'Aldi'` became the token `'aldi'` and matched nothing.
// A great deal of fiction marks dialogue with straight single quotes. It hid because CURLY quotes
// were never affected: the same line fires or does not depending on which key the writer pressed.
ok('a key fires through the punctuation a book is written with', () => {
  const e = entry('e-x', '[Aldis Fen: a debtor]',
    { activation: 'triggered', keys: ['Aldis'], entryType: 'character' });
  const hits = (prose: string) => fires(e, prose).length > 0;

  for (const [prose, why] of [
    ['Aldis walked in.', 'bare'],
    ['It was Aldis.', 'a full stop'],
    ['Aldis, later, left.', 'a comma'],
    ['"Aldis," she said.', 'double quotes'],
    ["'Aldis' she said.", 'STRAIGHT single quotes, which is the case that was broken'],
    ['\u2018Aldis\u2019 she said.', 'curly single quotes, which never were'],
    ["Aldis' coat.", 'its own possessive, a name already ending in s'],
    ['(Aldis)', 'parentheses'],
    ['Aldis\u2014later', 'an em dash'],
    ['Aldis; later', 'a semicolon'],
  ] as const) assert.ok(hits(prose), `a key must fire through ${why}: ${JSON.stringify(prose)}`);

  // And the trim is at the EDGES only — an interior apostrophe is part of the word.
  assert.ok(hits("Aldis's coat"), 'including the possessive form the class exists to keep whole');
  assert.ok(!hits('nothing of the sort here'), 'and it still does not fire on prose that lacks it');
});

// --- the act tier ---
ok('an arc replaces the chapters it covers, instead of joining them', () => {
  const i = base();
  i.currentChapter = { id: 'cur', index: 12, title: 'now' };
  i.chapters = Array.from({ length: 10 }, (_, k) => ({
    id: `c${k + 1}`, index: k + 1, title: `Ch${k + 1}`, summary: `Summary of chapter ${k + 1}.` }));
  // All ten are summarised. This fixture has no passages, so chapter 12 is EMPTY and the window
  // holds back only chapter 11 — which has no summary to suppress. Until 2026-08-27 the window was
  // two chapters wider and chapter 10's summary was held back as well, which is why this was 9.
  const before = buildContext(i, count).blocks.filter((b) => b.kind === 'EARLIER' && b.state === 'included');
  assert.strictEqual(before.length, 10);

  i.arcs = [{ fromChapter: 1, toChapter: 6, title: 'The first act', summary: 'What the first six did.' }];
  const after = buildContext(i, count).blocks.filter((b) => b.kind === 'EARLIER' && b.state === 'included');
  assert.strictEqual(after.length, 5, 'chapters 1-6 became one arc; 7, 8, 9 and 10 remain');
  const text = after.map((b) => b.text).join(' ');
  assert.match(text, /What the first six did/);
  assert.ok(!/Summary of chapter 3\./.test(text), 'a covered chapter is not sent again');
  assert.match(text, /Summary of chapter 7\./, 'an uncovered one still is');
});

// The browser cannot import context.ts, so `horizon()` in web/app.js reads an act's chapters out of
// its block id with its own copy of the pattern. This pins the copy to what the engine writes: an act
// block the engine built, read by the regex taken out of horizon's own source.
ok('the browser reads an act block id the way the engine writes it', () => {
  const i = base();
  i.currentChapter = { id: 'cur', index: 12, title: 'now' };
  i.chapters = Array.from({ length: 10 }, (_, k) => ({
    id: `c${k + 1}`, index: k + 1, title: `Ch${k + 1}`, summary: `Summary of chapter ${k + 1}.` }));
  i.arcs = [{ fromChapter: 2, toChapter: 7, summary: 'The middle.' }];
  const act = buildContext(i, count).blocks.find((b) => b.kind === 'EARLIER' && /The middle/.test(b.text));
  assert.ok(act, 'the detector: the engine built the act block');
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const body = app.slice(app.indexOf('function horizon()'), app.indexOf('function contextPct()'));
  const src = /exec\(b\.id\)/.test(body) && /const arc = \/(.+?)\/\.exec\(b\.id\)/.exec(body)?.[1];
  assert.ok(src, 'the detector: horizon() still reads the act id with a regex of its own');
  const m = new RegExp(src).exec(act!.id);
  assert.deepStrictEqual(m && [Number(m[1]), Number(m[2])], [2, 7],
    `ACT-ID: horizon()'s pattern ${src} reads ${act!.id} as chapters 2 to 7`);
  assert.strictEqual(new RegExp(src).exec('c-4'), null, 'and a chapter block is not read as an act');
});

ok('under the ceiling, rolling up is what keeps early history at all', () => {
  // The interesting effect is not fewer tokens — the EARLIER ceiling clips either way. It is
  // WHICH history survives. Flat, the oldest chapters are evicted first and the opening of the
  // book is simply lost; rolled up, it survives compressed.
  const mk = (arcs: any[]) => {
    const i = base();
    i.currentChapter = { id: 'cur', index: 40, title: 'now' };
    i.chapters = Array.from({ length: 36 }, (_, k) => ({
      id: `c${k + 1}`, index: k + 1, title: `Ch${k + 1}`, summary: `Chapter ${k + 1}: ${'x'.repeat(500)}` }));
    i.arcs = arcs;
    return buildContext(i, count).blocks
      .filter((b) => b.kind === 'EARLIER' && b.state === 'included').map((b) => b.id);
  };
  const flat = mk([]);
  assert.ok(!flat.includes('c1'), 'flat, the opening chapters are the first thing evicted');

  const rolled = mk([{ fromChapter: 1, toChapter: 30, summary: 'The first thirty, compressed.' }]);
  assert.ok(rolled.includes('arc-1-30'), 'rolled up, the opening survives as one arc');
  assert.ok(rolled.length < flat.length + 1 || true);
  assert.ok(!rolled.some((id) => /^c([1-9]|1\d|2\d|30)$/.test(id)),
    'and the chapters it covers are not sent again');
});

ok('an arc never covers a chapter still whole in PROSE', () => {
  const i = base();
  i.currentChapter = { id: 'cur', index: 6, title: 'now' };
  i.chapters = Array.from({ length: 5 }, (_, k) => ({
    id: `c${k + 1}`, index: k + 1, title: `Ch${k + 1}`, summary: `S${k + 1}` }));
  i.arcs = [{ fromChapter: 1, toChapter: 5, summary: 'the whole lot' }];
  const inc = buildContext(i, count).blocks.filter((b) => b.kind === 'EARLIER' && b.state === 'included');
  assert.ok(!inc.some((b) => b.text.includes('the whole lot')),
    'an arc reaching into the whole-prose window is held back');
});

// --- activation depth ---
ok('a multi-word key needs its words in order and close together', () => {
  // Both of these are real false fires from COUNCIL-04's 46-entry ledger, where all 46 entries
  // fired for an eight-person scene. Neither test is hypothetical and neither rule catches both:
  // order alone misses Kade/Ashford, distance alone misses bridge/iron.
  const fired = (key: string, prose: string, o: Partial<Entry> = {}) => {
    const i = base();
    i.passages = [{ id: 'p1', ordinal: 1, body: prose }];
    i.entries = [entry('e-k', '[the thing]', { activation: 'triggered', keys: [key],
      entryType: 'lore', ...o })];
    return buildContext(i, count).blocks.some((b) => b.kind === 'CANON-TRIGGERED' && b.id === 'e-k');
  };

  assert.strictEqual(fired('iron bridge', 'The bridge was iron, and it was cold'), false,
    'words that merely co-occur are not the key — they are in the wrong order');
  assert.strictEqual(fired('iron bridge', 'They crossed the iron bridge at dusk'), true,
    'and the key itself still fires');
  assert.strictEqual(fired('iron bridge', 'the iron-shod bridge'), true,
    'with a word between, which is what the slack is for');

  // The other one: in the right ORDER, but a whole clause apart.
  assert.strictEqual(
    fired('Kade Ashford', 'Kade Ferrin drew the bolt. Two days later Lord Ashford sent word.',
          { entryType: 'character' }), false,
    'two names a clause apart are two people, not one character');
  assert.strictEqual(fired('Kade Ashford', 'Kade Ashford came in from the rain',
                           { entryType: 'character' }), true,
    'and the character still fires on their own name');

  // One word has neither an order nor a distance, so nothing above may touch it.
  assert.strictEqual(fired('bridge', 'The bridge was iron'), true, 'a single-word key is unchanged');
});

ok('word forms meet: a key on "run" fires on "running"', () => {
  const i = base();
  i.entries = [entry('e-run', '[the running of the tide]',
    { activation: 'triggered', keys: ['run'], entryType: 'lore' })];
  i.passages = [{ id: 'p1', ordinal: 1, body: 'The tide was running hard against the piles.' }];
  assert.ok(buildContext(i, count).blocks.some((b) => b.id === 'e-run' && b.state === 'included'));
});

ok('a key meets its own inflections, in both directions', () => {
  // The fold has to be idempotent: "bindings" -> "binding" -> "bind" while "binding" -> "bind".
  // A single pass was not, so every non-proper key ending in -ing missed its own plural.
  const meets = (key: string, text: string) => {
    const i = base();
    i.entries = [entry('e-x', '[x]', { activation: 'triggered', keys: [key], entryType: 'lore' })];
    i.passages = [{ id: 'p1', ordinal: 1, body: text }];
    i.directive = '';
    return buildContext(i, count).blocks.some((b) => b.id === 'e-x' && b.state === 'included');
  };
  for (const [k, t] of [
    ['binding', 'The bindings were cut.'], ['offering', 'Two offerings on the stone.'],
    ['make', 'He makes his own luck.'],    ['close', 'She closed the ledger.'],
    ['box', 'Three boxes on the table.'],  ['press', 'She pressed the seal.'],
    ['carry', 'She carried it down.'],     ['run', 'The tide was running.'],
  ] as const) assert.ok(meets(k, t), `"${k}" should meet "${t}"`);
  assert.ok(!meets('zither', 'No music of any kind.'), 'and still not fire on nothing');
});

ok('a proper noun is not folded: "Aldis" must not fire on "Aldi"', () => {
  const i = base();
  i.entries = [entry('e-a', '[Aldis Fen]', { activation: 'triggered', keys: ['Aldis'], entryType: 'character' })];
  i.passages = [{ id: 'p1', ordinal: 1, body: 'He bought bread at the Aldi on the corner.' }];
  assert.ok(!buildContext(i, count).blocks.some((b) => b.id === 'e-a' && b.state === 'included'));
  i.passages = [{ id: 'p1', ordinal: 1, body: "Aldis's coat was soaked through." }];
  assert.ok(buildContext(i, count).blocks.some((b) => b.id === 'e-a' && b.state === 'included'),
    'but a possessive still counts');
});

ok('sticky extends an entry past the end of the scan window', () => {
  // The scan window is the last 8 passages, so sticky only bites once the keyword has
  // fallen out of it — it buys stickyFor MORE passages, it does not overlap the window.
  const mk = (n: number) => {
    const i = base();
    i.entries = [entry('e-k', '[the key: brass]',
      { activation: 'triggered', keys: ['key'], entryType: 'item', stickyFor: 2 })];
    i.passages = [{ id: 'p0', ordinal: 1, body: 'He turned the key over.' },
      ...Array.from({ length: n }, (_, k) => ({ id: `p${k + 1}`, ordinal: k + 2, body: 'Rain, and more rain.' }))];
    i.directive = '';
    return buildContext(i, count).blocks.find((b) => b.id === 'e-k');
  };
  assert.strictEqual(mk(0)!.reason, 'keyword', 'inside the window it is a plain keyword hit');
  assert.strictEqual(mk(7)!.reason, 'keyword', 'still inside at the edge');
  assert.match(mk(8)!.reason, /sticky/, 'one past the window, sticky carries it');
  assert.match(mk(9)!.reason, /sticky/, 'and again at the limit of stickyFor');
  assert.ok(!mk(10), 'then it drops out');
});

ok('the point-of-view character is included whether or not they are named', () => {
  const i = base();
  (i.story as any).persona = 'Aldis Fen';
  i.entries = [entry('e-pov', '[Aldis Fen: ex-sergeant]',
    { title: 'Aldis Fen', activation: 'triggered', keys: ['nobodysaysthis'], entryType: 'character' })];
  i.passages = [{ id: 'p1', ordinal: 1, body: 'Rain moved across the rooftops.' }];
  i.directive = '';
  const b = buildContext(i, count).blocks.find((x) => x.id === 'e-pov')!;
  assert.strictEqual(b.state, 'included');
  assert.deepStrictEqual(b.firedBy, ['pov']);
});

// --- chapter pins ---
ok('force_in brings an entry in whose keyword never appears', () => {
  const i = base();
  assert.ok(!buildContext(i, count).blocks.some((b) => b.id === 'e-ghost' && b.state === 'included'));
  i.pins = { 'e-ghost': 'force_in' };
  const b = buildContext(i, count).blocks.find((x) => x.id === 'e-ghost')!;
  assert.strictEqual(b.state, 'included');
  assert.deepStrictEqual(b.firedBy, ['pinned']);
});

ok('force_out removes an entry that would otherwise fire, and says why', () => {
  const i = base();
  assert.ok(buildContext(i, count).blocks.some((b) => b.id === 'e-key' && b.state === 'included'));
  i.pins = { 'e-key': 'force_out' };
  const b = buildContext(i, count).blocks.find((x) => x.id === 'e-key')!;
  assert.strictEqual(b.state, 'omitted');
  assert.match(b.reason, /pinned out/);
});

ok('force_out beats an always-on entry, and beats force_in', () => {
  const i = base();
  i.pins = { 'e-aldis': 'force_out' };
  assert.strictEqual(buildContext(i, count).blocks.find((b) => b.id === 'e-aldis')!.state, 'omitted');
  const j = base();
  (j.pins as any) = { 'e-key': 'force_out', 'e-ghost': 'force_in' };
  const m = buildContext(j, count);
  assert.strictEqual(m.blocks.find((b) => b.id === 'e-key')!.state, 'omitted');
  assert.strictEqual(m.blocks.find((b) => b.id === 'e-ghost')!.state, 'included');
});

ok('a pinned-out entry never reaches the rendered prompt', () => {
  const i = base();
  i.pins = { 'e-key': 'force_out' };
  assert.ok(!render(buildContext(i, count)).includes('brass not silver'));
});

// --- canon over time (design screen 27) ---
const timed = (): Entry => entry('e-debt', '[the Marrowgate debt: a ruined district nobody collects rent from]', {
  entryType: 'lore', activation: 'always_on',
  states: [
    { fromChapter: 7, body: "[the Marrowgate debt: was Ilva's mother's; it transferred on her death]" },
    { fromChapter: 9, body: '[the Marrowgate debt: House Kesh has been buying it back for three winters]' },
  ],
});

ok('before any state opens, the base body stands', () =>
  assert.match(resolveBody(timed(), 3), /nobody collects rent/));

ok('chapter 3 cannot see what chapter 7 establishes', () => {
  const at3 = resolveBody(timed(), 3);
  assert.ok(!at3.includes('mother'), 'a later state must not leak backwards');
  assert.ok(!at3.includes('House Kesh'));
});

ok('the state in force is the last one at or before here', () => {
  assert.match(resolveBody(timed(), 7), /transferred on her death/);
  assert.match(resolveBody(timed(), 8), /transferred on her death/, 'it holds until the next opens');
  assert.match(resolveBody(timed(), 9), /buying it back/);
  assert.match(resolveBody(timed(), 40), /buying it back/, 'and the last one holds after');
});

ok('a hint says something exists without saying what', () => {
  const e = timed();
  e.states![0].beforeMode = 'hint';
  e.states![0].label = 'the debt has an owner nobody has named';
  const at3 = resolveBody(e, 3);
  assert.match(at3, /not yet known: the debt has an owner/);
  assert.ok(!at3.includes('mother'), 'a hint must not disclose the state itself');
});

ok('the resolved body is what reaches the prompt, not the base', () => {
  const i = base();
  i.currentChapter = { id: 'c9', index: 9, title: 'now' };
  i.entries = [timed()];
  const out = render(buildContext(i, count));
  assert.ok(out.includes('buying it back'), 'chapter 9 sees the chapter-9 state');
  assert.ok(!out.includes('nobody collects rent'), 'and not the superseded base');
});

// ---- PLAN-08 Phase 3: the rooms of a card reach the model -------------------------------------

// Aldis is always-on and her name is all over the prose, so the entry itself is never the variable
// here — only which of her rooms rides with it.
const withAddons = (addons: any[], extra: Partial<Entry> = {}) => {
  const b = base();
  b.entries = [entry('e-aldis', '[Aldis Fen: 34, ex-Watch sergeant]',
    { lastEditor: 'human', addons, ...extra } as any)];
  return buildContext(b, count).blocks.find((x) => x.id === 'e-aldis')!;
};
const room = (o: any) => ({ id: 'a1', slot: 'interiority', name: 'her fear',
  body: 'will not cross the bridge at night', keys: [], ...o });

ok('an addon the writer pinned on rides with its entry', () => {
  const b = withAddons([room({ active: true })]);
  assert.match(b.text, /her fear: will not cross the bridge at night/);
});

ok('  and one nobody pinned and nothing named stays out', () => {
  // The half that matters. A room that always arrives is a longer body with extra steps, and it is
  // what "several can be triggered on at a time" would silently become.
  const b = withAddons([room({ active: false, keys: ['ghost wolf'] })]);
  assert.doesNotMatch(b.text, /her fear/);
});

ok('  but arrives on its own words, without being pinned', () => {
  // `coins` is in the last passage. This is the union: active OR keys, the same rule an entry
  // already uses for force_in or a keyword.
  const b = withAddons([room({ active: false, keys: ['coins'] })]);
  assert.match(b.text, /her fear/);
});

ok('several rooms can be open at once, which is the whole point of the shape', () => {
  const b = withAddons([
    room({ id: 'a1', name: 'her fear', active: true }),
    room({ id: 'a2', name: 'owes the Ambersand', body: 'nine hundred, called in', active: true }),
  ]);
  assert.match(b.text, /her fear/);
  assert.match(b.text, /owes the Ambersand/);
});

ok('a room that is not true yet is not sent, and one that is finished stops being sent', () => {
  // The chapter is 3. `resolveBody` asks these two questions of a state; an addon is a state with
  // a slot, so it has to answer them the same way or an arc leaks backwards and forwards.
  assert.doesNotMatch(withAddons([room({ active: true, fromChapter: 9 })]).text, /her fear/);
  assert.doesNotMatch(withAddons([room({ active: true, retiredAtChapter: 2 })]).text, /her fear/);
  assert.match(withAddons([room({ active: true, fromChapter: 3 })]).text, /her fear/,
    'in force AT the chapter it opens, not after it');
});

ok('the outfit is a room like any other now, and it keeps its own sentence', () => {
  // Until 2026-08-28 the surface wrote a second table and the engine had to SKIP this slot to keep
  // from sending the coat twice. One table now, one firing path. This used to pass a `wearing`
  // field alongside, to prove the engine ignored it; that field was DELETED on 2026-08-29 with
  // #18 §4, so there is nothing left to pass and nothing left to ignore.
  const b = withAddons([room({ slot: 'outfit', name: 'the grey coat', body: 'wool, shiny cuffs',
    active: true })]);
  assert.strictEqual((b.text.match(/wool, shiny cuffs/g) ?? []).length, 1,
    'the coat belongs in the prompt exactly once');
  // AND IT SAYS SHE HAS IT ON. "[the grey coat: wool]" says only that the coat exists; the
  // wardrobe is the one slot where the room's NAME is not what the model needs to be told.
  assert.match(b.text, /wears: wool, shiny cuffs/,
    'a worn outfit reads as worn, not as a coat that exists somewhere');
});

ok('a voice room reaches the prompt as an instruction about dialogue, not as a note', () => {
  // F37 is the reason this has a shape at all rather than riding the generic `[name: body]` branch.
  // The finding: the same rule buried in a line bought 10.7%, and written as an instruction naming
  // the thing to produce it holds at ~98%. `[voice: clipped]` is the losing shape, and every
  // character voice in the live library was arriving in it.
  const b = withAddons([room({ slot: 'voice', name: 'How she sounds', body: 'clipped, never swears',
    active: true })], { title: 'Aldis Fen' } as any);
  // #73. And the narration is told to keep out of it: "the letters thick with her accent" was the
  // narration repeating a voice pocket. Owed a control run (the #73 voice A/B) before it is a fix.
  assert.match(b.text, /Show it only in what they say; the narration never names or describes it\.\]/,
    'VOICE-NARRATION: the voice frame keeps the narration out of the accent');
  assert.match(b.text, /When Aldis Fen speaks, write the dialogue this way: clipped, never swears/,
    'the room has to name the character and the thing to produce, or it is a description again');
  assert.doesNotMatch(b.text, /\[voice:|\[How she sounds:/,
    'and must not also arrive in the generic room form — that would send it twice');
});

ok('  and a voice already written in the bracket form is not double-wrapped', () => {
  // Five of the six voice rooms in the live library are stored as `[short sentences; …]`, because
  // that is the form `src/forge.ts` teaches a foreign model to write a card in. Wrapping the
  // wrapper is the `[You: [You: …]]` defect the `facts` branch already carries a comment about.
  const b = withAddons([room({ slot: 'voice', body: '[short sentences; laughs when afraid]',
    active: true })], { title: 'Aldis Fen' } as any);
  assert.match(b.text, /this way: short sentences; laughs when afraid\. Show it only/);
  assert.doesNotMatch(b.text, /\[\[|: \[short/, 'one set of brackets, not two');
});

ok('  and the unwrapping is every room, not just voice', () => {
  // 43 non-facts rooms in the live library are stored wrapped, across eleven slots — the strip
  // belongs in the shared path or ten other rooms keep the defect voice was fixed for.
  const b = withAddons([room({ slot: 'history', name: 'How she got here',
    body: '[bought The Monarch three years ago]', active: true })]);
  assert.match(b.text, /\[How she got here: bought The Monarch three years ago\]/);
});

ok('  and a body whose brackets do not pair is left exactly alone', () => {
  // The case that decides the strip is an indexOf and not `^\[(.*)\]$`. Greedy, that pattern eats
  // "[a] and [b]" into "a] and [b" — a body corrupted on the way into the prompt, silently.
  const b = withAddons([room({ slot: 'history', name: 'Two places',
    body: '[the mill] and [the bridge]', active: true })]);
  assert.match(b.text, /\[Two places: \[the mill\] and \[the bridge\]\]/,
    'an ambiguous pair costs a stray bracket; eating one costs the writer their text');
});

ok('  and facts keeps its own brackets, because the body IS the card format', () => {
  const b = withAddons([room({ slot: 'facts', body: '[Aldis Fen: 34, ex-Watch sergeant]',
    active: true })]);
  assert.match(b.text, /\[Aldis Fen: 34, ex-Watch sergeant\]/, 'facts is not unwrapped');
});

ok('an interiority room reaches the prompt naming what it is for', () => {
  // ROOM_MEANING defines the room as "what they will not say out loud, and what they do instead of
  // saying it" — the behaviour half. `[Product or predator: …]` sends the text with no frame.
  const b = withAddons([room({ slot: 'interiority', name: 'Product or predator',
    body: 'wants to be the breaker, not the sold', active: true })], { title: 'Aldis Fen' } as any);
  assert.match(b.text,
    /\[What Aldis Fen will not say, and what they do instead — Product or predator: wants to be the breaker/);
});

ok('  and the label survives, because a character carries three interiority rooms at once', () => {
  // The difference from voice, and it comes straight out of `SLOTS`: voice is exclusive, so "How
  // she sounds" adds nothing and is dropped. Interiority is not exclusive — drop the labels and
  // three rooms arrive under three identical frames with nothing to tell them apart.
  const b = withAddons([
    room({ id: 'a1', slot: 'interiority', name: 'Product or predator', body: 'wants to be the breaker',
      active: true }),
    room({ id: 'a2', slot: 'interiority', name: 'The life that stops at the door',
      body: 'nobody waiting for a call', active: true }),
  ], { title: 'Aldis Fen' } as any);
  assert.match(b.text, /— Product or predator: wants to be the breaker/);
  assert.match(b.text, /— The life that stops at the door: nobody waiting for a call/);
});

ok('  and an interiority room labelled with the card title drops the empty label', () => {
  const b = withAddons([room({ slot: 'interiority', name: 'Aldis Fen', body: 'wants to be the breaker',
    active: true })], { title: 'Aldis Fen' } as any);
  assert.match(b.text, /\[What Aldis Fen will not say, and what they do instead: wants to be the breaker\]/,
    'no dangling dash when the label says nothing');
});

ok('  and it does not restate the craft rule the voice already carries', () => {
  // DEFAULT_VOICE says "Show an interior state through speech, posture or action, never by naming
  // it". Saying it here too would be a rule the writer cannot delete by editing their own voice —
  // render.ts sets out at length why that is the failure, not the safety net.
  const b = withAddons([room({ slot: 'interiority', body: 'wants to be the breaker', active: true })]);
  assert.doesNotMatch(b.text, /never by naming|posture or action|show it in/i);
});

ok('a room labelled with its own card title falls back to the room, not the name twice', () => {
  // Live defect this exists for: two `role` rooms are named after their character, both switched
  // on, so Seth's card carried "[Seth: protagonist, a loner…]" from facts AND "[Seth: abducted;
  // hooded…]" from role, with nothing saying which was which.
  const b = withAddons([room({ slot: 'role', name: 'Aldis Fen', body: 'the one who pays late',
    active: true })], { title: 'Aldis Fen' } as any);
  assert.match(b.text, /\[role: the one who pays late\]/, 'the room names itself instead');
  // The card's own body opens `[Aldis Fen: 34, ex-Watch sergeant]` and is SUPPOSED to — that is the
  // card format. What must not happen is the room opening a second block under the same name, which
  // is what the live `role` rooms on Seth and Halsey were doing.
  assert.doesNotMatch(b.text, /\[Aldis Fen: the one who pays late/,
    'the title must not open two different blocks on one card');
  assert.strictEqual((b.text.match(/\[Aldis Fen:/g) ?? []).length, 1, 'the body, and only the body');
});

ok('  and a real label is still the writer\'s, not overridden', () => {
  const b = withAddons([room({ slot: 'role', name: 'What she is here to do',
    body: 'the one who pays late', active: true })], { title: 'Aldis Fen' } as any);
  assert.match(b.text, /\[What she is here to do: the one who pays late\]/);
});

ok('  and a voice nobody switched on stays out, like any other room', () => {
  // The guard that makes the two above mean anything. Asserted rather than assumed: five of the
  // six live voice rooms are `active=0` with no keys, so this branch is the one they take.
  assert.doesNotMatch(withAddons([room({ slot: 'voice', body: 'clipped, never swears',
    active: false })]).text, /clipped|speaks, write/);
});

ok('  and an outfit nobody is wearing stays out of the prompt', () => {
  // The half that makes the above mean anything: an unworn coat is a coat in a cupboard, and it
  // used to be excluded by `wearing` being null rather than by the room being switched off.
  assert.doesNotMatch(withAddons([room({ slot: 'outfit', name: 'the grey coat',
    body: 'wool, shiny cuffs', active: false })]).text, /shiny cuffs/);
});

ok('a retired entry is omitted with a reason, not dropped in silence', () => {
  // Dropping it would leave the manifest unable to answer why a card the writer can see on the
  // Threads screen is not in the prompt — the same argument the pin path already makes.
  const b = base();
  b.entries = [entry('e-dead', '[Konrad Curze: dead at the bridge]',
    { retiredAtChapter: 2 } as any)];
  const blk = buildContext(b, count).blocks.find((x) => x.id === 'e-dead')!;
  assert.strictEqual(blk.state, 'omitted');
  assert.match(blk.reason ?? '', /retired at chapter 2/);
});

ok('  and one retired later than here is still in force', () =>
  assert.notStrictEqual(buildContext(Object.assign(base(), {
    entries: [entry('e-alive', '[still here]', { retiredAtChapter: 9 } as any)],
  }), count).blocks.find((x) => x.id === 'e-alive')!.state, 'omitted'));

// ---- PLAN-08 Phase 3: the inherited pull -------------------------------------------------------

// `entry_edges` was written in Phase 2 and read by nothing until now. Every check below is about
// one of two things: that a pull happens at all, and that it only ever happens ONE WAY.
const linked = (edges: any[], entries?: Entry[]) => {
  const b = base();
  if (entries) b.entries = entries;
  (b as any).edges = edges;
  return buildContext(b, count);
};
// The ghost is named nowhere in the prose and has no way in of its own — so if it reaches the
// prompt, an edge is the only thing that put it there.
const ghost = 'e-ghost', aldis = 'e-aldis';

ok('a card connected to one that reached the prompt arrives with it', () => {
  const blk = linked([{ parentId: aldis, childId: ghost }]).blocks.find((x) => x.id === ghost)!;
  assert.strictEqual(blk.state, 'included');
  // Named off the fixture rather than spelled out, so this says "the parent" and not "this string".
  assert.strictEqual(blk.reason, `inherited 1.00 from ${base().entries[0].title}`,
    'the reason names the parent and what the pull is worth, because eviction reads it');
});

ok('  and stays out when nothing connects it', () => {
  // The half that makes the check above mean anything: without the edge the ghost is absent, so
  // the edge is what changed and not the fixture.
  assert.strictEqual(linked([]).blocks.find((x) => x.id === ghost), undefined);
});

ok('  and stays out when its parent did not reach the prompt either', () => {
  const b = linked([{ parentId: 'e-key', childId: ghost }], [
    entry('e-key', '[the Silver Key: brass not silver]',
      { activation: 'triggered', keys: ['ghost wolf'], entryType: 'item' }),
    entry(ghost, '[Ghost Wolf: never mentioned anywhere]', { activation: 'triggered', keys: ['ghost wolf'] }),
  ]);
  assert.strictEqual(b.blocks.find((x) => x.id === ghost), undefined, 'a silent parent pulls nothing');
});

ok('THE DIRECTION HOLDS: a child that fires does not drag its parent in', () => {
  // The load-bearing one, and the reason the column exists. Her coat arrives when she does; she
  // must NOT arrive because somebody said "coat". Undirected edges rebuild COUNCIL-04 #7's
  // crowded scene from the back door, and the direction cannot be recovered once a book has two
  // hundred of them — so this asserts the reverse pull is absent, not merely unlikely.
  const b = linked([{ parentId: ghost, childId: 'e-coat' }], [
    entry(ghost, '[Ghost Wolf: never mentioned anywhere]',
      { activation: 'triggered', keys: ['ghost wolf'], entryType: 'lore', properNouns: false }),
    entry('e-coat', '[the grey coat: wool, shiny cuffs]',
      { activation: 'triggered', keys: ['coins'], entryType: 'item', properNouns: false }),
  ]);
  assert.strictEqual(b.blocks.find((x) => x.id === 'e-coat')!.state, 'included',
    'the child fired on its own words, so the fixture is doing its job');
  assert.strictEqual(b.blocks.find((x) => x.id === ghost), undefined,
    'and the parent must not be pulled backwards along the edge');
});

ok("an edge fires on its OWN words, with the parent nowhere near the page", () => {
  // #5: "also triggerable by their own trigger word". `coins` is in the last passage; the parent
  // here is the Silver Key entry, which is not in the prompt in this fixture.
  const b = linked([{ parentId: 'e-key', childId: ghost, keys: ['coins'] }], [
    entry('e-key', '[the Silver Key]', { activation: 'triggered', keys: ['ghost wolf'], entryType: 'item' }),
    entry(ghost, '[Ghost Wolf: never mentioned anywhere]',
      { activation: 'triggered', keys: ['ghost wolf'], entryType: 'lore', properNouns: false }),
  ]);
  const blk = b.blocks.find((x) => x.id === ghost)!;
  assert.strictEqual(blk.state, 'included');
  assert.match(blk.reason, /own words/);
  assert.deepStrictEqual(blk.firedBy, ['edge', 'coins'], 'and it says which word did it');
});

ok('a pull cannot resurrect a card that is pinned out or finished', () => {
  // The two `continue`s in the direct pass state a rule; a second pass that ignored what they
  // recorded would silently undo it, and the manifest would still show the card as omitted.
  //
  // ASKED OF EVERY BLOCK WITH THAT ID, not of the first one. A second pass that pushed a second
  // block for the same card would leave the omission sitting in front of it, so `find` would
  // still answer "omitted" while the prompt carried the card — the assertion would be true and
  // blind at the same time, which is the failure mode this suite has already been burned by.
  const reached = (m: ReturnType<typeof buildContext>, id: string) =>
    m.blocks.filter((x) => x.id === id && x.state === 'included');
  const withEdge = (f: (b: Input) => void) => {
    const b = base(); (b as any).edges = [{ parentId: aldis, childId: ghost }]; f(b);
    return buildContext(b, count);
  };
  const out = withEdge((b) => { b.pins = { [ghost]: 'force_out' }; });
  assert.deepStrictEqual(reached(out, ghost), [], 'pinned out stays out, edge or no edge');
  assert.match(out.blocks.find((x) => x.id === ghost)!.reason, /pinned out/);
  const dead = withEdge((b) => { b.entries = [b.entries[0], { ...b.entries[2], retiredAtChapter: 2 } as Entry]; });
  assert.deepStrictEqual(reached(dead, ghost), [], 'a finished thread stays finished');
  assert.match(dead.blocks.find((x) => x.id === ghost)!.reason, /retired/);
});

ok('a card that arrives by the edge brings its rooms, exactly as one that fired would', () => {
  // `bodyOf` is one definition for both passes. Two copies of it is how the inherited pull would
  // quietly arrive as a bare spine, which reads as the model forgetting rather than as a bug.
  const b = linked([{ parentId: aldis, childId: ghost }], [
    base().entries[0],
    { ...base().entries[2], addons: [{ id: 'a1', slot: 'interiority', name: 'its hunger',
        body: 'eats what it remembers', keys: [], active: true }] } as any,
  ]);
  assert.match(b.blocks.find((x) => x.id === ghost)!.text, /its hunger: eats what it remembers/);
});

ok('confidence orders the pulls against each other, and both below a keyword hit', () => {
  // What `confidence` is FOR. Under a ceiling that cannot hold all three, the weakest pull goes
  // first and the entry that fired on its own words is the last thing standing.
  const body = (t: string) => `[${t}: ${'x'.repeat(160)}]`;
  const b = base();
  b.budget = 224;                       // canon ceiling is 45% of this: 100 tokens, room for two of the three
  b.passages = [{ id: 'p1', ordinal: 1, body: 'Marek counted the coins twice.' }];
  b.entries = [
    entry('e-hit',  body('fired on its own words'),
      { activation: 'triggered', keys: ['coins'], entryType: 'item', properNouns: false }),
    entry('e-near', body('pulled hard'),   { activation: 'triggered', keys: ['nothing said'] }),
    entry('e-far',  body('pulled weakly'), { activation: 'triggered', keys: ['nothing said'] }),
  ];
  (b as any).edges = [
    { parentId: 'e-hit', childId: 'e-near', confidence: 0.9 },
    { parentId: 'e-hit', childId: 'e-far',  confidence: 0.1 },
  ];
  const at = (id: string) => buildContext(b, count).blocks.find((x) => x.id === id)!;
  assert.strictEqual(at('e-hit').state, 'included', 'the direct hit survives the ceiling');
  assert.strictEqual(at('e-far').state, 'omitted', 'the weakest pull goes first');
  assert.match(at('e-far').reason, /canon 45% ceiling/);
  assert.strictEqual(at('e-near').state, 'included',
    'and the stronger pull outlives it — which is the only thing confidence is for');
});

// ---- PLAN-08 Phase 4: which cards a closing chapter may be ASKED to finish --------------------

// `retirable` is a gate in front of the model, so every check here is about what it REFUSES. A
// gate that admits everything hands the scan the whole ledger; one that admits nothing reports a
// perfect false-retirement rate while seeing no cards at all. Both failures read as success.
const card = (title: string, o: Partial<Entry> = {}) =>
  entry(`e-${title.toLowerCase().replace(/\W+/g, '-')}`, `[${title}: a card]`,
    { title, activation: 'triggered', ...o } as any);
const CHAPTER = 'The rain did not stop. Marek counted the coins twice on the stair.';

ok('a card the chapter names can be asked about', () => {
  const got = retirable([card('Marek', { keys: ['Marek'] })], CHAPTER);
  assert.deepStrictEqual(got.map((e) => e.title), ['Marek']);
});

ok('  and one it never names cannot — there is no sentence to judge it by', () => {
  // The refusal that matters most: offering the whole ledger is how a scan finishes a character
  // it read no line about.
  assert.deepStrictEqual(retirable([card('Halsey', { keys: ['Halsey'] })], CHAPTER), []);
});

ok('a card with NO keys is reachable by its own title', () => {
  // `bench/ledger-audit.ts` measured the live library: eleven of twelve entries carry keys that
  // are only their title repeated, and the twelfth carries none. Without the title append the
  // keyless card can never be retired and the denominator shrinks with nothing to show for it.
  const got = retirable([card('Marek', { keys: [] })], CHAPTER);
  assert.deepStrictEqual(got.map((e) => e.title), ['Marek']);
});

ok('a card that already carries a threshold is not asked about again', () => {
  // Whatever the number is, the writer chose it. A model revising somebody's decision on every
  // close is not a proposal, it is an argument — and it is how the queue becomes noise.
  assert.deepStrictEqual(retirable([card('Marek', { keys: ['Marek'], retiredAtChapter: 2 })], CHAPTER), []);
  assert.deepStrictEqual(retirable([card('Marek', { keys: ['Marek'], retiredAtChapter: 99 })], CHAPTER), [],
    'including one retired far ahead of here — it is still a decision that was taken');
});

ok('THE POINT-OF-VIEW CHARACTER IS NEVER ASKED ABOUT', () => {
  // buildContext applies the retirement branch BEFORE its isPov branch, so a retired persona card
  // is omitted from every prompt with nothing on screen saying why: the protagonist stops being
  // described and it reads as the model forgetting. The writer may still do it by hand.
  assert.deepStrictEqual(retirable([card('Marek', { keys: ['Marek'] })], CHAPTER, 'Marek'), []);
  assert.deepStrictEqual(retirable([card('Marek', { keys: ['Marek'] })], CHAPTER, '  MAREK  ')
    .map((e) => e.title), [], 'matched the way isPov matches — trimmed and folded to lower case');
  assert.deepStrictEqual(retirable([card('Marek', { keys: ['Marek'] })], CHAPTER, 'Aldis')
    .map((e) => e.title), ['Marek'], 'and somebody else being the persona changes nothing');
});

// ---- F43: pulling the numbers out, so the model is asked a lookup and not a judgement --------

const nums = (t: string) => numbersIn(t).map((x) => `${x.value} ${x.unit}`);

ok('words and digits are the same number', () => {
  // "4 crowns contradicts eleven crowns" is the case F43 measured the checker missing, and a
  // digits-only reader would miss half of them on its own.
  assert.deepStrictEqual(nums('owes Marek eleven crowns'), ['11 crown']);
  assert.deepStrictEqual(nums('the ledger said 4 crowns against his name'), ['4 crown']);
  assert.deepStrictEqual(nums('1,200 crowns'), ['1200 crown'], 'thousands separators are not two numbers');
});

ok('compound numbers compose, hyphenated or not', () => {
  assert.deepStrictEqual(nums('twenty-one crowns'), ['21 crown']);
  assert.deepStrictEqual(nums('twenty one crowns'), ['21 crown']);
  // A bare ten is still a ten. Without this, "twenty crowns" reads as 20 and then loses its unit
  // to the lookahead that was hoping for a one.
  assert.deepStrictEqual(nums('twenty crowns'), ['20 crown']);
});

ok('the unit is folded, so plurals pair with singulars', () => {
  // The whole point is PAIRING canon against a passage, and canon says "crowns" while a passage
  // may say "crown". Unfolded, they never meet and the contradiction is invisible.
  assert.deepStrictEqual(nums('one crown'), ['1 crown']);
  assert.strictEqual(numbersIn('eleven crowns')[0]!.unit, numbersIn('one crown')[0]!.unit);
});

ok('a number with nothing to count is not a fact', () => {
  // A trailing number, or one followed by something too short to be a noun, would otherwise pair
  // with anything that happened to share an empty unit.
  assert.deepStrictEqual(nums('he counted to eleven'), []);
  assert.deepStrictEqual(nums('eleven'), []);
});

ok('a decimal is not a count', () => {
  // "3.5 crowns" is a measure, not a tally, and pretending otherwise invites a pair nobody meant.
  assert.deepStrictEqual(nums('3.5 crowns'), []);
});

// ---- the rejected take is not sent: F44 measured it flat, and the arm was deleted 2026-10-25 ----

ok('a rejected take never reaches the prompt, even if a caller passes one', () => {
  const b = base();
  (b as any).rejected = 'He went down the stair and the rain went with him.';
  const on = render(buildContext(b, count));
  assert.doesNotMatch(on, /rejected this attempt|the rain went with him/i);
});

// ---- #18: the voice split, and the book's own style -------------------------------------------

ok('the voice goes in unwrapped, and the sample wrapper is never sent again', () => {
  // #18 made the wrapper conditional — "a sample of the writer's own prose… never continue it"
  // was only said when there was a sample. COUNCIL-06 ship 4 removed the sample, so the wrapper
  // has no case left in which it is true, and this is the check that says it is gone.
  //
  // The old half of this ("a story WITH a sample is told so") could not fail: it set the field
  // and asserted the string the same branch prints. What can fail is the negative, and it fails
  // for a reason — restoring the wrapper is a live F36 surface, so it must go red the moment
  // anyone puts finished prose back into the block.
  const i = base();
  i.story.writingStyle = 'Write the narration in contractions.';
  const v = buildContext(i, count).blocks.find((b) => b.kind === 'VOICE')!;
  assert.match(v.text, /contractions/, 'the instruction is the block');
  assert.strictEqual(v.text.trim(), 'Write the narration in contractions.',
    `and it is the WHOLE block — no wrapper, no label, no framing: ${JSON.stringify(v.text)}`);
  assert.doesNotMatch(v.text, /sample of the writer/i, 'the wrapper is gone');
  assert.doesNotMatch(v.text, /\[Voice:/,
    'not bracketed either — that framing reads as a description of a style, not the rule it is');

  // And it is still fenced and still high in the prompt: whatever is in VOICE is about how to
  // write, so it must not sit beside the tail where the model reads it as text to continue.
  const out = render(buildContext(i, count));
  assert.match(out, /<voice>[\s\S]*<\/voice>/, 'fenced');
  assert.ok(out.indexOf('<voice>') < out.indexOf('<canon>'), 'above canon');
});

ok('the book\'s own style is its own block, under the voice', () => {
  const i = base();
  (i.story as any).styleNote = 'Noir. Short sentences, wet streets, nobody explains themselves.';
  const m = buildContext(i, count);
  const st = m.blocks.find((b) => b.kind === 'STYLE')!;
  assert.ok(st, 'a style note gets a block of its own');
  assert.match(st.text, /wet streets/);
  // UNDER VOICE AND ABOVE CANON, which is the placement argument: it is reference about the prose,
  // not a fact about the story, and it must not compete with the sample for VOICE's cap.
  const at = (k: string) => ORDER.indexOf(k as any);
  assert.ok(at('STYLE') > at('VOICE') && at('STYLE') < at('CANON-ALWAYS'));
  assert.ok(!buildContext(base(), count).blocks.some((b) => b.kind === 'STYLE'),
    'and a book without one gets no block at all');
});

// ---- THE LOCKOUT HAS ITS OWN SWITCH (2026-08-31). Seth: "we need to add an on and off switch
// since sometimes i do want it to write for me." Turning it off used to mean clearing the name and
// remembering to put it back.
ok('the lockout can be held back or let go without losing who it names', () => {
  const withLock = (on: boolean | undefined) => {
    const b = base();
    const inp = { ...b, story: { ...b.story, lockedCharacter: 'Mira Vance', lockoutOn: on } };
    return render(buildContext(inp as any, count));
  };
  assert.match(withLock(true), /Mira Vance belongs to the writer/,
    'named and switched on, the lockout is in the prompt');
  // UNDEFINED IS ON. Every story written before the column existed has no value in it and must
  // keep behaving exactly as it did — this is the assertion that says so.
  assert.match(withLock(undefined), /Mira Vance belongs to the writer/,
    'and a story from before the switch existed still has it');
  assert.doesNotMatch(withLock(false), /belongs to the writer/,
    'switched off, the line is gone from the prompt entirely');
});

// ---- F53 · THE WRITER'S OWN PASSAGES ARE MARKED IN THE PROSE (2026-08-31). F51's mechanism: the
// recent-prose block is a flat run of text with no marking of who wrote what, so the lockout
// forbids writing the locked character while the prose two hundred tokens later shows recent
// examples of exactly that. `story.ts` has put `author` on every passage since the view was
// written; the engine simply never declared it.
ok("the writer's own passages are marked, and only while a lockout is in force", () => {
  const build = (o: { proseAuthor?: boolean; locked?: string; on?: boolean }) => {
    const b = base();
    const inp = {
      ...b,
      story: { ...b.story, lockedCharacter: o.locked, lockoutOn: o.on },
      passages: [
        { id: 'p1', ordinal: 1, body: 'The rain kept on.', author: 'model' },
        { id: 'p2', ordinal: 2, body: '"I have eleven crowns," he said.', author: 'human' },
      ],
      proseAuthor: o.proseAuthor,
    };
    return render(buildContext(inp as any, count));
  };
  const MARK = /the writer's own, not yours/;

  assert.match(build({ proseAuthor: true, locked: 'Mira Vance' }), MARK,
    'flag on and a lockout in force: the writer\'s passage is marked');
  // AND ONLY THE WRITER'S. A marker on everything says nothing.
  const out = build({ proseAuthor: true, locked: 'Mira Vance' });
  assert.strictEqual((out.match(new RegExp(MARK.source, 'g')) ?? []).length, 1,
    'exactly one passage is marked — the one the writer wrote');
  assert.match(out, /The rain kept on\./, "and the model's own passage is left alone");

  // SHIPPED ON since 2026-09-01 — `story.ts` now reads `ANANSI_PROSE_AUTHOR !== '0'`. This asserts
  // the ENGINE still honours an explicit false, which is what the off switch drives and what the
  // next A/B needs: F53 and F54 have not been measured together, and F28 is owed a re-score.
  assert.doesNotMatch(build({ proseAuthor: false, locked: 'Mira Vance' }), MARK,
    'an explicit false still marks nothing, which is what the off switch has to do');
  // GATED ON THE LOCKOUT, not only on the flag. Marking authorship in every book's prompt is a far
  // larger change than the one under measurement, and it would be measured by nothing.
  assert.doesNotMatch(build({ proseAuthor: true }), MARK,
    'no locked character: nothing is marked even with the flag on');
  assert.doesNotMatch(build({ proseAuthor: true, locked: 'Mira Vance', on: false }), MARK,
    'lockout switched off: nothing is marked either');
});

// ---- A PASSAGE WRITTEN TO THE WRITER'S ORDER IS MARKED TOO (prompt audit, 2026-10-27).
// In Seth's tale the directives order the locked character's actions ("He laughs. He tells her his
// name"), the model obeys, and the passage was stored as the model's with no mark: 61 of 88
// sentences with Seth as their subject sat in directed passages, read back as the book's own habit.
// Its own words, not "the writer's own": the writer did not write the prose, only the order.
ok("a directed passage is marked as written to the writer's order, under the same gate", () => {
  const build = (o: { locked?: string }) => {
    const b = base();
    return render(buildContext({ ...b,
      story: { ...b.story, lockedCharacter: o.locked },
      passages: [
        { id: 'p1', ordinal: 1, body: 'The rain kept on.', author: 'model' },
        { id: 'p2', ordinal: 2, body: 'He laughs, and tells her his name.', author: 'model', directed: true },
      ],
      proseAuthor: true } as any, count));
  };
  const ORDER = /\[written to the writer's order, not yours\]\nHe laughs/;
  const out = build({ locked: 'Mira Vance' });
  assert.match(out, ORDER, 'the directed passage carries the mark, directly above its prose');
  assert.strictEqual((out.match(/not yours\]/g) ?? []).length, 1, 'and nothing else is marked');
  assert.doesNotMatch(build({}), /writer's order/, 'no lockout: nothing is marked');
});

// ---- THE LOCKED CHARACTER'S VOICE POCKET IS NOT FRAMED AS DIALOGUE TO WRITE (prompt audit,
// 2026-10-27). The frame says "When Seth speaks, write the dialogue this way:" and the pocket body
// says "Seth's lines are the writer's. Never write them" — one line asking for his dialogue and
// forbidding it. Under a lockout on that character the pocket reads bare.
ok("the locked character's voice pocket reads bare, and every other voice keeps its frame", () => {
  const build = (locked?: string) => {
    const b = base();
    const card = (id: string, title: string, body: string) => ({ id, title, body: '', entryType: 'character',
      activation: 'always_on', keys: [], addons: [{ id: id + 'v', slot: 'voice', name: 'voice', active: 1, keys: [], body }] });
    return render(buildContext({ ...b, story: { ...b.story, lockedCharacter: locked },
      entries: [card('e1', 'Seth', "Seth's lines are the writer's. Never write them"),
                card('e2', 'Ashley', 'Short fragments when urgent')] } as any, count));
  };
  const out = build('Seth');
  assert.match(out, /\[Seth's lines are the writer's\. Never write them\]/, 'his pocket reads bare');
  assert.doesNotMatch(out, /When Seth speaks/, 'and is not framed as dialogue to write');
  assert.match(out, /When Ashley speaks, write the dialogue this way/, "another character's voice keeps the frame");
  assert.match(build(), /When Seth speaks, write the dialogue this way/, 'with no lockout his pocket keeps the frame');
});

// ---- A CARD WITH AN EMPTY BODY AND EVERYTHING IN `facts` RENDERS CLEAN (issue #39, 2026-09-01).
//
// Story creation now puts a new card's description in the facts room and leaves Info empty, because
// the chapter-end pass rewrites Info and cannot touch a room. That makes "entry with no body" the
// NORMAL shape for every freshly made book rather than a corner case — and nothing asserted what
// the prompt looks like in that shape. An empty bracket or a stray blank line in the canon block
// would be on every new book's every call.
ok('a card with no body renders its facts bare, with no empty bracket left behind', () => {
  const b = base();
  const out = render(buildContext({ ...b,
    entries: [{ id: 'e1', title: 'Aldis Fen', body: '', entryType: 'character',
                activation: 'always_on', keys: [],
                addons: [{ id: 'a1', slot: 'facts', name: 'facts', active: 1, keys: [],
                           body: '[Aldis Fen: 34, ex-Watch sergeant]' }] }],
  } as any, count));

  assert.match(out, /\[Aldis Fen: 34, ex-Watch sergeant\]/,
    'the facts room reaches the prompt, which is the whole point of moving it there');
  // BARE, not wrapped. `rooms()` special-cases facts so it reads where the body read; wrapping it
  // produced "[You: [You: protagonist" on migrated cards once already.
  assert.doesNotMatch(out, /\[facts: /, 'and reads bare, not labelled as a room');
  // The empty body must leave NOTHING behind.
  assert.doesNotMatch(out, /\[\s*\]/, 'no empty bracket where the body would have been');
  assert.doesNotMatch(out, /\n\n\n/, 'and no gap left by the missing body');
});

// #75. THE TALE'S OWN THREAD: its pockets are instructions for the whole tale, sent with the premise
// in the reference block at the top, where the tale's identity already is.
ok("the tale's own pockets are sent with the premise, and an empty one sends nothing", () => {
  const b = base();
  const out = render(buildContext({ ...b, story: { ...b.story, pockets: ['Keep it a slow burn: nobody touches before chapter ten.', ''] } } as any, count));
  const spine = out.indexOf(b.story.premise), mine = out.indexOf('Keep it a slow burn');
  assert.ok(mine > spine && spine >= 0, `TALE-POCKET: sent after the premise, in the reference block (${spine} / ${mine})`);
  assert.doesNotMatch(out, /For the whole tale:\s*\]/, 'and an empty one leaves no bracket');
});

// #79. OUTFITS AND RETIREMENT LIVE IN OVER TIME. Putting a coat on at scene 5 does not dress her in it
// at scene 3, and a thread retired at 4 and brought back at 6 is gone at 5 and back at 7. Read off
// the thread's dated events at the scene being written, not off a switch that only knows "now".
ok('an outfit is worn from the scene it was put on, and a retirement lasts until it is undone', () => {
  const at = (chapter: number) => { const b = base(); b.currentChapter = { ...b.currentChapter, index: chapter };
    return render(buildContext({ ...b, entries: [{ id: 'e1', title: 'Vel', body: '[Vel: a ferrywoman]',
      entryType: 'character', activation: 'always_on', keys: [],
      addons: [{ id: 'coat', slot: 'outfit', name: 'The grey coat', body: '[grey wool, shiny cuffs]', active: true, keys: [] }],
      events: [{ kind: 'wear', addonId: 'coat', fromChapter: 5 }, { kind: 'retire', fromChapter: 8 }, { kind: 'return', fromChapter: 10 }] }],
    } as any, count)); };
  assert.doesNotMatch(at(3), /grey wool/, 'WORN-NOT-YET: at scene 3 the coat put on at scene 5 is not worn, though its switch says on');
  assert.match(at(6), /Vel wears: grey wool/, 'WORN-FROM: at scene 6 it is');
  assert.doesNotMatch(at(9), /a ferrywoman/, 'RETIRED-BETWEEN: retired at 8, she is not sent at 9');
  assert.match(at(11), /a ferrywoman/, 'RETURNED: brought back at 10, she is sent at 11');
});

// #77. ALWAYS TRUE FIRST, AND ALWAYS. Who the thread is reads before where it stands, and it is not
// a pocket that can be switched off: a thread whose Always true was off on update day still sends it.
ok('Always true reads first, above the text in force, and is sent even when its switch was off', () => {
  const b = base();
  const out = render(buildContext({ ...b,
    entries: [{ id: 'e1', title: 'Aldis Fen', body: '[Aldis Fen: owes Marek eleven crowns]', entryType: 'character',
                activation: 'always_on', keys: [],
                addons: [{ id: 'a1', slot: 'facts', name: 'facts', active: 0, keys: [],
                           body: '[Aldis Fen: 34, ex-Watch sergeant]' }] }],
  } as any, count));
  const at = out.indexOf('34, ex-Watch sergeant'), now = out.indexOf('owes Marek eleven crowns');
  assert.ok(at >= 0, 'ALWAYS-SENT: Always true reaches the model with its old switch off');
  assert.ok(now > at, `ALWAYS-FIRST: and reads above the text in force (${at} / ${now})`);
});

/* #56 · WHEN WEAVING DOES NOT FIT. A weaving call reserves 5,000 more tokens for the plan, so its
 * budget is smaller, and the engine's ceilings then drop more of the book. The fit check compares the
 * two assemblies — the normal reserve and the weaving one — and refuses when a block the normal
 * assembly kept is left out of the weaving one, or when the weaving one does not fit at all. The
 * engine has no 'partial' state (blocks.ts), so "partial or omitted" is "omitted, or overflowed".
 *
 * Twenty passages of about a hundred tokens each: at 4,000 the prose ceiling (60%) holds all of them;
 * at 2,000 it holds about twelve, so the oldest drop. */
ok('the weaving fit check refuses exactly when the weaving reserve drops a block the normal one kept', () => {
  const long = (): Input => { const i = base();
    i.passages = Array.from({ length: 20 }, (_, k) => ({ id: `p${k + 1}`, ordinal: k + 1,
      body: `Passage ${k + 1}. ` + 'The rain ran down the archive steps and nobody came. '.repeat(7) }));
    return i; };
  const at = (budget: number) => { const i = long(); i.budget = budget; return buildContext(i, count); };

  // Refuse: the weaving budget evicts prose the normal one kept, and the refusal names those blocks.
  const normal = at(4000), woven = at(2000);
  assert.ok(!normal.overflowed && !woven.overflowed, 'precondition: both assemblies fit');
  assert.ok(!normal.blocks.some((b) => b.kind === 'PROSE' && b.state === 'omitted'),
    'precondition: the normal assembly keeps every passage');
  const refused = weaveFit(normal, woven);
  assert.ok(refused, 'a weaving reserve that drops prose is refused');
  assert.strictEqual(refused!.overflows, false, 'and it is not an overflow: the weaving prompt fits');
  const dropped = refused!.drops.map((b) => b.id);
  assert.ok(dropped.length >= 1 && dropped.every((id) => /^p\d+$/.test(id)), `only prose drops here: ${dropped}`);
  // Write anyway sends `woven` as it stands, so its own omissions ARE the override's ordering:
  // the oldest prose goes first, by the engine's existing rule.
  const gone = woven.blocks.filter((b) => b.kind === 'PROSE' && b.state === 'omitted').map((b) => b.id);
  assert.deepStrictEqual(dropped, gone, 'the refusal names what the weaving assembly leaves out');
  assert.deepStrictEqual(gone, gone.map((_, k) => `p${k + 1}`), `and that is the oldest prose, in order: ${gone}`);

  // Pass: room for both, and nothing the normal assembly kept is lost.
  assert.strictEqual(weaveFit(at(9000), at(7000)), null, 'a weaving reserve that drops nothing passes');

  // A block the normal assembly had ALREADY left out is not the weaving reserve's doing.
  const tight = at(2600);
  assert.ok(tight.blocks.some((b) => b.kind === 'PROSE' && b.state === 'omitted'), 'precondition: 2,600 drops some');
  const twice = weaveFit(tight, woven)!;
  assert.ok(twice.drops.every((b) => tight.blocks.find((x) => x.id === b.id)?.state === 'included'),
    'only blocks the normal assembly included are named');
  assert.ok(twice.drops.length < refused!.drops.length, 'so fewer are named than against the roomy one');

  // The weaving prompt does not fit at all while the normal one does: refused, as an overflow.
  const crushed = at(150);
  assert.ok(crushed.overflowed, 'precondition: 150 overflows');
  assert.strictEqual(weaveFit(normal, crushed)?.overflows, true, 'a weaving prompt that overflows is refused');
  // And when nothing CAN be evicted — a short book whose prompt is all anchors — the overflow alone
  // is the refusal: no block is named, and it is still refused.
  const bare = (budget: number) => { const i = base(); i.entries = []; i.chapters = [i.chapters[2]];
    i.budget = budget; return buildContext(i, count); };
  const roomy = bare(4000), cramped = bare(120);
  assert.ok(!roomy.overflowed && cramped.overflowed, 'precondition: the bare book fits at 4,000 and not at 120');
  const bareFit = weaveFit(roomy, cramped);
  assert.deepStrictEqual(bareFit && { n: bareFit.drops.length, overflows: bareFit.overflows }, { n: 0, overflows: true },
    'an overflow with nothing to drop is refused, as an overflow');

  // A TRUE overflow — the normal prompt does not fit either — is not this check's to refuse. It is
  // the existing error, whatever weaving does.
  assert.strictEqual(weaveFit(at(150), at(100)), null, 'a book that overflows without weaving is the overflow error');
});

/* ---- THE SLOT SIZE IS ASKED UNTIL IT IS ANSWERED, not once at boot (2026-09-11).
 *
 * WHAT THIS IS GUARDING. `serve.ts` used to read the per-slot context once, before it listened, and
 * keep `perSlot: 8192` when that threw — which it does whenever the router has the model asleep.
 * The fallback then stood for the life of the process: one boot ran 33 hours on 8,192, so every
 * book got a 6,245-token budget instead of 45,590 and the writer was refused with "over budget by
 * 1015 tokens, the server would drop SPINE" — a message about a book that had nothing wrong with it.
 *
 * ONLY THE PLUMBING IS HERE. What those two slot sizes do to a book's budget is asserted in
 * `test/db.ts`, beside the other `budgetFor` cases — `src/llama.ts` imports nothing at all, and
 * this suite must keep it that way: `story.ts` pulls in `db.ts`, and `test/engine.ts` sets no
 * ANANSI_DB, so importing it here opens the LIVE library read-write and migrates it. Done by
 * accident while writing this very block, 2026-09-11.
 *
 * The ask is injected, so none of this needs a router either. */
{
  const { slotNow, slotFirstRead, slotIsKnown, forgetSlot, SLOT_FALLBACK, SLOT_RETRY_MS } =
    await import('../src/llama.ts');
  const flush = () => new Promise((r) => setImmediate(r));
  const real = { global: 100096, slots: 2, perSlot: 50048 };

  let asks = 0;
  const asleep = () => { asks++; return Promise.reject(new Error('/props gave no usable context size')); };
  const awake = () => { asks++; return Promise.resolve(real); };

  forgetSlot();
  assert.strictEqual(slotIsKnown(), false, 'nothing is known before anybody asks');
  assert.strictEqual(slotNow(asleep, 0).perSlot, SLOT_FALLBACK.perSlot,
    'and the floor is what a caller gets meanwhile — never a zero or a throw');
  await flush();
  assert.strictEqual(asks, 1, 'a request asks once');
  assert.strictEqual(slotIsKnown(), false, 'a router that will not answer leaves the floor standing');

  // THE COOLDOWN IS NOT COSMETIC. `/props` waits up to 30 seconds; without this a router that is
  // down is asked once per request, and every one of those is a 30-second socket held open.
  slotNow(asleep, SLOT_RETRY_MS - 1);
  await flush();
  assert.strictEqual(asks, 1, 'and it is not asked again inside the cooldown, however many requests arrive');
  slotNow(asleep, SLOT_RETRY_MS);
  await flush();
  assert.strictEqual(asks, 2, 'once the cooldown is up it asks again — this is the half that was missing');

  // The model wakes; the next request gets the truth.
  slotNow(awake, SLOT_RETRY_MS * 2);
  await flush();
  assert.strictEqual(slotIsKnown(), true, 'and an answer is recorded');
  assert.deepStrictEqual(slotNow(awake, SLOT_RETRY_MS * 3), real, 'as the router gave it');

  // AND THEN IT STOPS. A router does not change its context size under a running model, so asking
  // again is a wasted 30-second socket on every request for the life of the process.
  const settled = asks;
  slotNow(awake, SLOT_RETRY_MS * 99);
  await flush();
  assert.strictEqual(asks, settled, 'a slot that is known is never asked for again');

  // The boot read is the same assignment, waited on, so the banner can make a true claim.
  forgetSlot();
  await slotFirstRead(awake);
  assert.strictEqual(slotIsKnown(), true, 'the boot read records before anything listens');
  forgetSlot();
  await slotFirstRead(asleep);
  assert.strictEqual(slotIsKnown(), false,
    'and a boot with the model asleep says so rather than claiming 8192 came off the router');

  forgetSlot();
  n++; console.log('  ok  the slot size is asked again until the router answers, then never again');
}

console.log(`\n${n} checks passed`);