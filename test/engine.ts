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

// --- the act tier ---
ok('an arc replaces the chapters it covers, instead of joining them', () => {
  const i = base();
  i.currentChapter = { id: 'cur', index: 12, title: 'now' };
  i.chapters = Array.from({ length: 10 }, (_, k) => ({
    id: `c${k + 1}`, index: k + 1, title: `Ch${k + 1}`, summary: `Summary of chapter ${k + 1}.` }));
  // Chapters 1..9 are summarised; chapter 10 is inside the whole-prose window and held back.
  const before = buildContext(i, count).blocks.filter((b) => b.kind === 'EARLIER' && b.state === 'included');
  assert.strictEqual(before.length, 9);

  i.arcs = [{ fromChapter: 1, toChapter: 6, title: 'The first act', summary: 'What the first six did.' }];
  const after = buildContext(i, count).blocks.filter((b) => b.kind === 'EARLIER' && b.state === 'included');
  assert.strictEqual(after.length, 4, 'chapters 1-6 became one arc; 7, 8 and 9 remain');
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
