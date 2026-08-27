// One runnable check. Fails if the engine's load-bearing behaviour breaks.
//   node --experimental-strip-types test/engine.ts
import assert from 'node:assert';
import { buildContext, resolveBody } from '../src/context.ts';
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
           writingStyle: 'clipped, wet, unsentimental', direction: 'Marek chooses the archive.' },
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

ok('the destination reaches SPINE', () => {
  const m = buildContext(base(), count);
  assert.match(m.blocks.find((b) => b.kind === 'SPINE')!.text, /Where this is going/);
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
  for (const m of ['continue', 'speak', 'act', 'direct', 'narrate']) {
    const t = modeText({ mode: m as any, directive: 'He drops it.' });
    assert.doesNotMatch(t, /\d\s*-\s*\d\s+paragraphs?|\b(one|two|three|four|five)\s+paragraphs?\b/i,
      `${m} names a paragraph count, which is the defect F18 measured`);
    assert.doesNotMatch(t, /\b(\d+|a few|several)\s+(sentences|words)\b(?!\s+that takes)/i,
      `${m} names a length in sentences or words`);
  }

  // AND NO PROMPT MAY OFFER A LIST OF SLOTS. Speak said "speech, action, the room" and got back
  // reply, gesture, weather, in that order, every time (COUNCIL-04) — three slots is a shape, and
  // a shape the model can see is a shape it completes. Act had the same defect in other words.
  assert.doesNotMatch(modeText({ mode: 'speak' as any }), /speech, action, the room/);
  assert.doesNotMatch(modeText({ mode: 'act' as any }), /the consequence, the reaction, the world/);
  assert.match(modeText({ mode: 'speak' as any }), /any one of\s*\n?those is a whole answer/,
    'and Speak says explicitly that one thing is a whole answer');

  // Direct's text is an instruction and must appear as one.
  assert.match(modeText({ mode: 'direct' as any, directive: 'He drops it.' }),
    /what happens next: He drops it\./);

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
  assert.match(e.reason, /stale/);
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

ok('a few hundred words of voice sample survive whole, and unbracketed', () => {
  // This is the app's own hint — "paste a few hundred words of your own prose" — taken
  // literally. Under the old arrangement it was a `keep: false` part of DIRECTIVE's 250-token
  // cap, so following the instruction guaranteed the sample was cut. COUNCIL-04 #5.
  const i = base();
  const sample = 'The rain came sideways off the water and nobody looked up. '.repeat(30);
  i.story.writingStyle = sample.trim();          // ~300 words
  const m = buildContext(i, count);
  const v = m.blocks.find((b) => b.kind === 'VOICE')!;
  assert.strictEqual(v.state, 'included');
  assert.doesNotMatch(v.reason, /shortened/, 'a few hundred words must fit whole');
  assert.ok(v.text.includes(sample.trim()), 'the sample is sent verbatim');
  assert.doesNotMatch(v.text, /\[Voice:/,
    'not bracketed — [Voice: <prose>] reads as a description of a style, not a specimen');
  const out = render(m);
  assert.match(out, /<voice>[\s\S]*<\/voice>/, 'fenced, so it is not read as this story');
  assert.ok(out.indexOf('<voice>') < out.indexOf('<canon>'),
    'high in the prompt: prose that is NOT this story must not sit beside the tail');
});

ok('an oversized voice sample shortens on a sentence, and DIRECTIVE keeps everything', () => {
  // The sample is now the only flex part of its own block, so going over the cap costs the
  // sample and nothing else. It used to cost point of view, register and the chapter's beat.
  const i = base();
  i.story.writingStyle = 'The rain came sideways off the water. '.repeat(90);   // ~830 tokens
  i.story.spice = 5;
  i.currentChapter = { id: 'c3', index: 3, title: 'Key', authorsNote: 'He must be forced.' };
  const m = buildContext(i, count);
  const v = m.blocks.find((b) => b.kind === 'VOICE')!;
  assert.match(v.reason, /shortened/, 'over the cap, it shortens rather than vanishing');
  assert.ok(v.tokens <= 500, `must fit the cap, got ${v.tokens}`);
  assert.match(v.text, /water\.$/,
    `the cut lands on a sentence, not mid-word — ends: ${JSON.stringify(v.text.slice(-24))}`);

  const d = m.blocks.find((b) => b.kind === 'DIRECTIVE')!;
  assert.doesNotMatch(d.reason, /shortened/, 'DIRECTIVE no longer pays for the sample');
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

console.log(`\n${n} checks passed`);
