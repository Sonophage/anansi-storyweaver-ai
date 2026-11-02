// The change grammar (#97): what Talk may change when the writer asks, checked against a tale.
//
// A pure slice, so it is checked directly: no database, no route, no model. The route half — a
// change applied, its Undo, the reply saying what was not done — is in test/talk.ts.
//
// Both directions, and against cases the grammar was not written for: a near name, a name that
// could be two threads, a room the thread's kind does not have, an operation that is not on the
// list, a thread the tale only follows, an Undo naming a thread from another tale.
//
//   node --experimental-strip-types test/changes.ts
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const ch = await import('../src/changes.ts');

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

const room = (id: string, slot: string, body: string, o: any = {}) =>
  ({ id, slot, name: o.name ?? slot, body, keys: o.keys ?? [], active: o.active ?? true });
const tale = {
  entries: [
    { id: 'e-talia', title: 'Talia Venn', entryType: 'character',
      addons: [room('a-tf', 'facts', 'Talia is twenty.'), room('a-tv', 'voice', 'Quick and dry.')] },
    { id: 'e-morgott', title: 'Morgott, the Omen King', entryType: 'character',
      addons: [room('a-mr1', 'relationships', 'Hates his brother.', { active: false }),
               room('a-mr2', 'relationships', 'Owes Talia.', { active: true })] },
    { id: 'e-ring', title: 'Ring Law', entryType: 'item', addons: [] },
    { id: 'e-tal', title: 'Tal Harrow', entryType: 'character', addons: [] },
    { id: 'e-tally', title: 'The Tally House', entryType: 'place', addons: [] },
    { id: 'e-world', title: 'The Erdtree', entryType: 'lore', sharedFrom: 'Lands Between',
      addons: [room('a-w', 'facts', 'It burns.')] },
  ],
};
const done = (r: any) => { assert.ok(r.ok, `refused: ${r.why}`); return r.change; };
const refused = (r: any, why: RegExp) => {
  assert.ok(!r.ok, `applied, and should not have been: ${JSON.stringify(r.change)}`);
  assert.match(r.why, why);
  assert.ok(r.said, 'a refusal still says what was asked, in words');
};

ok('CHANGE-SET-FACTS: Always true by the thread\'s exact name, and the old text is what Undo needs', () => {
  const c = done(ch.checkAsked({ op: 'thread.set', thread: 'Talia Venn', text: 'Talia is thirty.' }, tale));
  assert.strictEqual(c.thread, 'e-talia');
  assert.strictEqual(c.room, 'facts', 'no room named is the thread\'s Always true');
  assert.strictEqual(c.addon, 'a-tf');
  assert.strictEqual(c.before, 'Talia is twenty.');
  assert.match(ch.wordsFor(c), /Talia Venn.*Always true.*Talia is thirty\./);
  const undo = ch.undoFor(c, {});
  assert.deepStrictEqual(undo, { op: 'thread.set', thread: 'e-talia', room: 'facts', addon: 'a-tf',
    text: 'Talia is twenty.', wrote: 'Talia is thirty.' }, 'the Undo carries what Talk wrote, to check it is still there');
});

ok('CHANGE-NEAR-NAME: a name that is part of exactly one thread\'s name finds it', () => {
  assert.strictEqual(done(ch.checkAsked({ op: 'thread.set', thread: 'Morgott', room: 'voice',
    text: 'Slow, formal.' }, tale)).thread, 'e-morgott');
  assert.strictEqual(done(ch.checkAsked({ op: 'thread.set', thread: 'talia', text: 'x is y.' }, tale)).thread,
    'e-talia', 'case does not matter');
  assert.strictEqual(done(ch.checkAsked({ op: 'thread.set', thread: 'the Ring Law', text: 'No writ.' }, tale)).thread,
    'e-ring', 'nor a leading article');
});

ok('CHANGE-NO-THREAD: a name no thread has, or only part of a word of one, is refused', () => {
  refused(ch.checkAsked({ op: 'thread.set', thread: 'The ferryman', text: 'Old.' }, tale), /no thread called/i);
  // "Ta" is in Talia, Tal and Tally, as letters; it is no thread's name.
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Ta', text: 'Old.' }, tale), /no thread called/i);
});

ok('CHANGE-TWO-THREADS: a name that could be two threads is refused, and names both', () => {
  const two = { entries: [...tale.entries, { id: 'e-tv2', title: 'Talia the Younger', entryType: 'character', addons: [] }] };
  const r = ch.checkAsked({ op: 'thread.set', thread: 'Talia', text: 'Old.' }, two);
  refused(r, /Talia Venn/);
  assert.match(r.why, /Talia the Younger/);
});

ok('CHANGE-ROOM-KIND: a room the thread\'s kind does not have is refused; one it has is not', () => {
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Ring Law', room: 'voice', text: 'Loud.' }, tale),
    /an item has no voice/i);
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Talia', room: 'atmosphere', text: 'Damp.' }, tale),
    /a character has no atmosphere/i);
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Talia', room: 'mood', text: 'Damp.' }, tale),
    /no mood/i);
  const c = done(ch.checkAsked({ op: 'thread.set', thread: 'Ring Law', room: 'what_it_does', text: 'A fine.' }, tale));
  assert.strictEqual(c.room, 'what_it_does');
  assert.strictEqual(c.addon, null, 'a room the thread does not have yet is made');
  assert.strictEqual(c.before, null);
  assert.deepStrictEqual(ch.undoFor(c, { addon: 'a-new' }),
    { op: 'room.unmake', thread: 'e-ring', addon: 'a-new', text: 'A fine.' },
    'and undoing a room that was made takes it away');
});

ok('CHANGE-ROOM-WORDS: the room as a writer says it, Always true included', () => {
  for (const said of ['none', '', 'Always true', 'always_true', 'facts'])
    assert.strictEqual(done(ch.checkAsked({ op: 'thread.set', thread: 'Talia', room: said, text: 'x.' }, tale)).room,
      'facts', `"${said}" is Always true`);
  assert.strictEqual(done(ch.checkAsked({ op: 'thread.set', thread: 'Talia', room: 'Who is here', text: 'x.' },
    { entries: [{ id: 'p', title: 'Talia', entryType: 'place', addons: [] }] })).room, 'who_is_here');
});

ok('CHANGE-PLURAL-ROOM: a room a thread has several of changes the live one, else the newest', () => {
  const c = done(ch.checkAsked({ op: 'thread.set', thread: 'Morgott', room: 'relationships', text: 'Fears Talia.' }, tale));
  assert.strictEqual(c.addon, 'a-mr2', 'the live one');
  assert.strictEqual(c.before, 'Owes Talia.');
});

ok('CHANGE-EMPTY: a change with no text, or text the room already holds, is refused', () => {
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Talia', text: '  ' }, tale), /no text/i);
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Talia', text: 'Talia is twenty.' }, tale), /already says/i);
});

ok('CHANGE-WORLD: a thread the tale follows from its World is not changed from the tale', () => {
  refused(ch.checkAsked({ op: 'thread.set', thread: 'The Erdtree', text: 'It is ash.' }, tale), /Lands Between/);
});

ok('CHANGE-NEW: a new thread, with its kind, Always true and wake words', () => {
  const c = done(ch.checkAsked({ op: 'thread.new', title: 'The ferryman', type: 'character',
    text: 'Rows the dead across for a coin.', keys: ['ferryman'], activation: 'triggered' }, tale));
  assert.strictEqual(c.title, 'The ferryman');
  assert.strictEqual(c.type, 'character');
  assert.strictEqual(c.always, 'Rows the dead across for a coin.');
  assert.deepStrictEqual(c.keys, ['ferryman']);
  assert.strictEqual(c.activation, 'always_on', 'a character never lands on a word from a model\'s answer');
  assert.match(ch.wordsFor(c), /new thread.*The ferryman/i);
  assert.deepStrictEqual(ch.undoFor(c, { thread: 'e-new' }),
    { op: 'thread.unmake', thread: 'e-new', title: 'The ferryman', text: 'Rows the dead across for a coin.' });
  const place = done(ch.checkAsked({ op: 'thread.new', title: 'The Quay', type: 'place', text: 'Wet.',
    keys: ['quay'], activation: 'triggered' }, tale));
  assert.strictEqual(place.activation, 'triggered', 'a place may wait for its word');
  // ONE GOOD KEYWORD WHEN IT STARTS (Seth, 2026-11-01): one single word, its own name first, never
  // another thread's name.
  const one = done(ch.checkAsked({ op: 'thread.new', title: 'Old Tom', type: 'character', text: 'A boatman.',
    keys: ['Talia Venn', 'Talia', 'the ferryman', 'coin'] }, tale));
  assert.deepStrictEqual(one.keys, ['ferryman'], 'CHANGE-NEW-ONE-KEY: a new thread starts with one good single-word keyword');
});

ok('CHANGE-NEW-REFUSED: no name, a kind nobody defined, or a name the tale already has', () => {
  refused(ch.checkAsked({ op: 'thread.new', title: ' ', type: 'character', text: 'x' }, tale), /no name/i);
  refused(ch.checkAsked({ op: 'thread.new', title: 'Blade', type: 'weapon', text: 'x' }, tale), /weapon/);
  refused(ch.checkAsked({ op: 'thread.new', title: 'talia venn', type: 'character', text: 'x' }, tale),
    /already a thread called Talia Venn/);
});

ok('CHANGE-NEW-NO-TEXT: a new thread with no Always true is not made, on a tale or on a draft', () => {
  // The route made the thread, wrote no Always true, and said "Made a new thread".
  for (const text of [undefined, '', '   ', 'https://myth.example/charon/1'])
    refused(ch.checkAsked({ op: 'thread.new', title: 'The ferryman', type: 'character', text }, tale), /no Always true/i);
  const draft = { story: { title: 'T' }, entries: [{ title: 'Ilva', entryType: 'character', body: '[Ilva: low.]' }] };
  for (const text of [undefined, '', '  '])
    refused(ch.checkDraft({ op: 'thread.new', title: 'The ferryman', type: 'character', text }, draft), /no Always true/i);
});

ok('CHANGE-CLOSED-LIST: no delete, no prose, and nothing an Undo alone may do', () => {
  for (const op of ['thread.delete', 'passage.set', 'prose.write', 'thread.unmake', 'room.unmake', '', undefined])
    refused(ch.checkAsked({ op, thread: 'Talia', text: 'x', addon: 'a-tf', title: 'Talia Venn' }, tale),
      /not something Talk can do/i);
  refused(ch.checkAsked(null, tale), /not something Talk can do/i);
});

ok('UNDO-SET: an Undo puts back the exact text, by id, and only on this tale\'s thread', () => {
  const c = done(ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'facts', addon: 'a-tf',
    text: 'Talia is twenty.', wrote: 'Talia is twenty.' }, tale));
  assert.strictEqual(c.before, 'Talia is twenty.', 'the text it puts back is what was there');
  assert.match(ch.wordsFor(c), /Put back Talia Venn's Always true/);
  // An Undo restoring an EMPTY Always true is exact too; a request with no text is not one.
  assert.ok(ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'facts', addon: 'a-tf', text: '',
    wrote: 'Talia is twenty.' }, tale).ok);
  // What Talk wrote is no longer there: the writer's later edit is not written over.
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'facts', addon: 'a-tf', text: 'x',
    wrote: 'Talia is thirty.' }, tale), /changed since/i);
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-alice', room: 'facts', addon: 'a-tf', text: 'x' }, tale),
    /no longer in this tale/i);
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'facts', addon: 'a-mr1', text: 'x' }, tale),
    /no longer in this tale/i, );
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-ring', room: 'voice', addon: null, text: 'x' }, tale),
    /an item has no voice/i);
});

ok('UNDO-UNMAKE: a thread or room Talk made is taken away only while it is as Talk made it', () => {
  const made = { entries: [...tale.entries,
    { id: 'e-new', title: 'The ferryman', entryType: 'character', addons: [room('a-nf', 'facts', 'Rows.')] }] };
  assert.ok(ch.checkUndo({ op: 'thread.unmake', thread: 'e-new', title: 'The ferryman', text: 'Rows.' }, made).ok);
  refused(ch.checkUndo({ op: 'thread.unmake', thread: 'e-new', title: 'The ferryman', text: 'Rows away.' }, made),
    /changed since/i);
  refused(ch.checkUndo({ op: 'thread.unmake', thread: 'e-new', title: 'The Ferryman of Styx', text: 'Rows.' }, made),
    /changed since/i);
  // The writer's own thread, under an Undo that claims Talk made it: its text is not the claim's.
  refused(ch.checkUndo({ op: 'thread.unmake', thread: 'e-talia', title: 'Talia Venn', text: 'made up' }, made),
    /changed since/i);
  assert.ok(ch.checkUndo({ op: 'room.unmake', thread: 'e-talia', addon: 'a-tv', text: 'Quick and dry.' }, made).ok);
  refused(ch.checkUndo({ op: 'room.unmake', thread: 'e-talia', addon: 'a-tv', text: 'Slow.' }, made), /changed since/i);
  refused(ch.checkUndo({ op: 'thread.delete', thread: 'e-talia' }, made), /not something Undo can do/i);
  refused(ch.checkUndo({ op: 'thread.new', title: 'X', type: 'lore', text: 'y' }, made), /not something Undo can do/i);
});

ok('UNDO-KEEPS-ALWAYS-TRUE: no Undo takes a thread\'s Always true away', () => {
  // A forged room.unmake that names the Always true and copies its text exactly. The other checks
  // all pass for it; only the rule that a thread keeps its Always true stops it.
  refused(ch.checkUndo({ op: 'room.unmake', thread: 'e-talia', addon: 'a-tf', text: 'Talia is twenty.' }, tale),
    /Always true/);
  // So the first Always true Talk writes on a thread that had none gets no Undo: one would always
  // be refused. Its other pockets still do.
  const bare = { entries: [{ id: 'e-bare', title: 'Bare', entryType: 'character', addons: [] }] };
  const first = done(ch.checkAsked({ op: 'thread.set', thread: 'Bare', text: 'Bare is old.' }, bare));
  assert.strictEqual(first.before, null);
  assert.strictEqual(ch.undoFor(first, { addon: 'a-new' }), null, 'no Undo is offered that would only be refused');
  const voice = done(ch.checkAsked({ op: 'thread.set', thread: 'Bare', room: 'voice', text: 'Slow.' }, bare));
  assert.strictEqual(ch.undoFor(voice, { addon: 'a-v' })!.op, 'room.unmake');
});

// ---- #98 · the rest of what Talk changes: the tale, a scene, Over time, wake words, retirement ----
//
// The tale as the route hands it over: its threads, its premise and setting, its scenes, and the
// scene the writer is in.
const whole = { ...tale, story: { premise: 'A river between the living and the dead.', setting: '' },
  chapters: [{ id: 'c-1', index: 1, title: 'The Bank', authorsNote: 'Toward the crossing.' },
             { id: 'c-2', index: 2, title: 'Mid-river', authorsNote: '' }],
  at: 2 };

ok('TALE-SET: the premise or the setting, with the old one for Undo', () => {
  const c = done(ch.checkAsked({ op: 'tale.set', field: 'premise', text: 'A river nobody crosses twice.' }, whole));
  assert.strictEqual(c.field, 'premise');
  assert.strictEqual(c.before, 'A river between the living and the dead.');
  assert.match(ch.wordsFor(c), /tale's premise.*A river nobody crosses twice\./);
  assert.deepStrictEqual(ch.undoFor(c, {}), { op: 'tale.set', field: 'premise', text: 'A river between the living and the dead.',
    wrote: 'A river nobody crosses twice.' });
  // An empty setting is a setting not yet written; Undo puts the empty one back.
  const s = done(ch.checkAsked({ op: 'tale.set', field: 'Setting', text: 'A grey delta.' }, whole));
  assert.strictEqual(s.field, 'setting', 'the field as a writer says it');
  assert.strictEqual(ch.undoFor(s, {})!.text, '');
  const u = done(ch.checkUndo({ op: 'tale.set', field: 'setting', text: '', wrote: '' }, whole));
  refused(ch.checkUndo({ op: 'tale.set', field: 'setting', text: '', wrote: 'A grey delta.' }, whole), /changed since/i);
  assert.match(ch.wordsFor(u), /Put back the tale's setting/);
});

ok('TALE-SET-REFUSED: a field that is not one of the tale\'s own, no text, or the same text', () => {
  refused(ch.checkAsked({ op: 'tale.set', field: 'spice', text: '5' }, whole), /premise.*setting.*title.*genre.*voice.*style note/i);
  refused(ch.checkAsked({ op: 'tale.set', field: 'pov', text: 'first person' }, whole), /not its pov/i);
  refused(ch.checkAsked({ op: 'tale.set', field: 'premise', text: ' ' }, whole), /no text/i);
  refused(ch.checkAsked({ op: 'tale.set', field: 'premise', text: 'A river between the living and the dead.' }, whole),
    /already says/i);
  refused(ch.checkUndo({ op: 'tale.set', field: 'spice', text: '5' }, whole), /not its spice/i);
});

ok('SCENE-SET: a scene\'s title or where it heads, by its number, with the old text for Undo', () => {
  const c = done(ch.checkAsked({ op: 'scene.set', scene: 1, field: 'title', text: 'The Ford' }, whole));
  assert.strictEqual(c.chapter, 'c-1');
  assert.strictEqual(c.before, 'The Bank');
  assert.match(ch.wordsFor(c), /scene 1's title.*The Ford/);
  assert.deepStrictEqual(ch.undoFor(c, {}), { op: 'scene.set', chapter: 'c-1', field: 'title', text: 'The Bank', wrote: 'The Ford' });
  const h = done(ch.checkAsked({ op: 'scene.set', scene: 2, field: 'Heads toward', text: 'The far bank, at dusk.' }, whole));
  assert.strictEqual(h.field, 'heads_toward', 'the field as a writer says it');
  assert.strictEqual(h.before, '', 'where it heads was empty, and Undo puts the empty one back');
  assert.match(ch.wordsFor(h), /where scene 2 heads.*far bank/);
  // No scene named is the scene the writer is in.
  assert.strictEqual(done(ch.checkAsked({ op: 'scene.set', field: 'title', text: 'Mid-stream' }, whole)).chapter, 'c-2');
  const u = done(ch.checkUndo({ op: 'scene.set', chapter: 'c-2', field: 'heads_toward', text: '', wrote: '' }, whole));
  refused(ch.checkUndo({ op: 'scene.set', chapter: 'c-1', field: 'title', text: 'x', wrote: 'The Ford' }, whole), /changed since/i);
  assert.match(ch.wordsFor(u), /Put back where scene 2 heads/);
});

ok('SCENE-SET-REFUSED: a scene the tale does not have, another field, no text, or the same text', () => {
  refused(ch.checkAsked({ op: 'scene.set', scene: 7, field: 'title', text: 'Later' }, whole), /no scene 7/i);
  refused(ch.checkAsked({ op: 'scene.set', scene: 0, field: 'title', text: 'Before' }, whole), /no scene 0/i);
  refused(ch.checkAsked({ op: 'scene.set', scene: 1, field: 'opens_with', text: 'Fog.' }, whole), /title or where it heads/i);
  refused(ch.checkAsked({ op: 'scene.set', scene: 1, field: 'summary', text: 'Fog.' }, whole), /title or where it heads/i);
  refused(ch.checkAsked({ op: 'scene.set', scene: 1, field: 'title', text: '' }, whole), /no text/i);
  refused(ch.checkAsked({ op: 'scene.set', scene: 1, field: 'title', text: 'The Bank' }, whole),
    /already says/i);
  refused(ch.checkUndo({ op: 'scene.set', chapter: 'c-other', field: 'title', text: 'Mine' }, whole), /no longer in this tale/i);
});

const waking = { ...whole, entries: [...tale.entries,
  { id: 'e-letter', title: 'The letter', entryType: 'item', activation: 'triggered', keys: ['letter'], addons: [] },
  { id: 'e-vel', title: 'Vel', entryType: 'character', activation: 'always_on', keys: [], addons: [] }] };

ok('THREAD-WAKE: Always on, or On a word with its wake words, with the old ones for Undo', () => {
  const c = done(ch.checkAsked({ op: 'thread.wake', thread: 'the letter', activation: 'always_on' }, waking));
  assert.strictEqual(c.thread, 'e-letter');
  assert.strictEqual(c.activation, 'always_on');
  assert.deepStrictEqual(c.keys, ['letter'], 'Always on with no words given keeps the words it had');
  assert.match(ch.wordsFor(c), /The letter is Always on now/);
  assert.deepStrictEqual(ch.undoFor(c, {}), { op: 'thread.wake', thread: 'e-letter', activation: 'triggered', keys: ['letter'],
    wrote: { activation: 'always_on', keys: ['letter'] } });
  const w = done(ch.checkAsked({ op: 'thread.wake', thread: 'Vel', activation: 'triggered', keys: ['Vel', ' the blind one '] }, waking));
  assert.deepStrictEqual(w.keys, ['Vel', 'the blind one']);
  assert.strictEqual(w.activation, 'triggered', 'the writer asked, so a character may wait for its word');
  assert.match(ch.wordsFor(w), /Vel is On a word now: Vel, the blind one/);
  // New words for a thread already On a word.
  const k = done(ch.checkAsked({ op: 'thread.wake', thread: 'letter', activation: 'triggered', keys: ['envelope'] }, waking));
  assert.deepStrictEqual(ch.undoFor(k, {})!.keys, ['letter']);
  const u = done(ch.checkUndo({ op: 'thread.wake', thread: 'e-vel', activation: 'always_on', keys: [],
    wrote: { activation: 'always_on', keys: [] } }, waking));
  refused(ch.checkUndo({ op: 'thread.wake', thread: 'e-vel', activation: 'always_on', keys: [],
    wrote: { activation: 'triggered', keys: ['Vel'] } }, waking), /changed since/i);
  assert.match(ch.wordsFor(u), /Put back how Vel wakes/);
});

ok('THREAD-WAKE-REFUSED: On a word with no words, no change, a followed thread, or no such way to wake', () => {
  refused(ch.checkAsked({ op: 'thread.wake', thread: 'Vel', activation: 'triggered', keys: [] }, waking), /wake words/i);
  refused(ch.checkAsked({ op: 'thread.wake', thread: 'Vel', activation: 'always_on' }, waking), /already/i);
  refused(ch.checkAsked({ op: 'thread.wake', thread: 'letter', activation: 'triggered', keys: ['Letter'] }, waking), /already/i);
  refused(ch.checkAsked({ op: 'thread.wake', thread: 'The Erdtree', activation: 'triggered', keys: ['tree'] }, waking),
    /Lands Between/);
  refused(ch.checkAsked({ op: 'thread.wake', thread: 'Vel', activation: 'keyed', keys: ['x'] }, waking), /Always on or On a word/i);
  refused(ch.checkAsked({ op: 'thread.wake', thread: 'Nobody', activation: 'always_on' }, waking), /no thread called/i);
});

const dated = { ...whole, chapters: [...whole.chapters, { id: 'c-3', index: 3, title: 'Far bank', authorsNote: '' }],
  entries: [...tale.entries,
    { id: 'e-vel', title: 'Vel', entryType: 'character', addons: [],
      states: [{ id: 'st-2', fromChapter: 2, body: 'Vel is soaked.', label: 'Fell in', beforeMode: 'hint' }] }] };

ok('THREAD-OVERTIME: a dated entry from a scene; a new one is taken away by Undo, one written over is put back', () => {
  const c = done(ch.checkAsked({ op: 'thread.overtime', thread: 'Vel', scene: 3, text: 'Vel is blind in one eye.',
    label: 'Lost an eye' }, dated));
  assert.strictEqual(c.thread, 'e-vel');
  assert.strictEqual(c.from, 3);
  assert.strictEqual(c.state, null, 'nothing is dated from scene 3 yet');
  assert.match(ch.wordsFor(c), /Added to Vel's Over time from scene 3.*blind in one eye/);
  assert.deepStrictEqual(ch.undoFor(c, { state: 'st-new' }),
    { op: 'state.unmake', thread: 'e-vel', state: 'st-new', text: 'Vel is blind in one eye.' });
  // Scene 2 already has an entry: it is written over, and its Undo puts back all of it.
  const o = done(ch.checkAsked({ op: 'thread.overtime', thread: 'Vel', scene: 2, text: 'Vel is soaked and cold.' }, dated));
  assert.strictEqual(o.state, 'st-2');
  assert.match(ch.wordsFor(o), /Changed Vel's Over time from scene 2/);
  assert.deepStrictEqual(ch.undoFor(o, { state: 'st-2' }), { op: 'thread.overtime', thread: 'e-vel', state: 'st-2',
    scene: 2, text: 'Vel is soaked.', label: 'Fell in', beforeMode: 'hint',
    wrote: { body: 'Vel is soaked and cold.', label: 'Fell in' } });
  // No scene named is the scene the writer is in.
  assert.strictEqual(done(ch.checkAsked({ op: 'thread.overtime', thread: 'Vel', text: 'Vel is dry.' }, dated)).from, 2);
  const u = done(ch.checkUndo({ op: 'thread.overtime', thread: 'e-vel', state: 'st-2', scene: 2, text: 'Vel is soaked.',
    label: 'Fell in', beforeMode: 'hint', wrote: { body: 'Vel is soaked.', label: 'Fell in' } }, dated));
  refused(ch.checkUndo({ op: 'thread.overtime', thread: 'e-vel', state: 'st-2', scene: 2, text: 'x',
    wrote: { body: 'Vel is soaked and cold.', label: 'Fell in' } }, dated), /changed since/i);
  assert.match(ch.wordsFor(u), /Put back Vel's Over time from scene 2/);
  assert.match(ch.wordsFor(done(ch.checkUndo({ op: 'state.unmake', thread: 'e-vel', state: 'st-2', text: 'Vel is soaked.' }, dated))),
    /Took away Vel's Over time from scene 2/);
});

ok('THREAD-OVERTIME-REFUSED: a scene the tale does not have, scene 1, no text, the same text, a followed thread', () => {
  refused(ch.checkAsked({ op: 'thread.overtime', thread: 'Vel', scene: 4, text: 'Gone.' }, dated), /no scene 4/i);
  refused(ch.checkAsked({ op: 'thread.overtime', thread: 'Vel', scene: 1, text: 'Dry.' }, dated), /scene 1/i);
  refused(ch.checkAsked({ op: 'thread.overtime', thread: 'Vel', scene: 3, text: '' }, dated), /no text/i);
  refused(ch.checkAsked({ op: 'thread.overtime', thread: 'Vel', scene: 2, text: 'Vel is soaked.' }, dated), /already says/i);
  refused(ch.checkAsked({ op: 'thread.overtime', thread: 'The Erdtree', scene: 2, text: 'Ash.' }, dated), /Lands Between/);
  // Undo: an entry the writer has changed since Talk made it is theirs; another thread's entry is not this one's.
  refused(ch.checkUndo({ op: 'state.unmake', thread: 'e-vel', state: 'st-2', text: 'Vel is blind.' }, dated), /changed since/i);
  refused(ch.checkUndo({ op: 'state.unmake', thread: 'e-talia', state: 'st-2', text: 'Vel is soaked.' }, dated),
    /no longer in this tale/i);
  refused(ch.checkUndo({ op: 'thread.overtime', thread: 'e-vel', state: 'st-gone', scene: 2, text: 'x' }, dated),
    /no longer in this tale/i);
  refused(ch.checkAsked({ op: 'state.unmake', thread: 'Vel', state: 'st-2' }, dated), /not something Talk can do/i);
  // A thread Talk made, with an Over time entry since: taking it away would take the entry too.
  const madeDated = { entries: [{ id: 'e-new', title: 'The ferryman', entryType: 'character',
    addons: [room('a-nf', 'facts', 'Rows.')], states: [{ id: 'st-f', fromChapter: 2, body: 'Rows no more.' }] }] };
  refused(ch.checkUndo({ op: 'thread.unmake', thread: 'e-new', title: 'The ferryman', text: 'Rows.' }, madeDated),
    /changed since/i);
});

ok('UNDO-OVERTIME-SCENE: an Over time put-back restores the entry at its own scene, whatever scene the Undo names', () => {
  // A real Undo names the scene the entry already has. A forged one may name scene 1, or scene 3
  // where another entry could already stand; neither may move the entry, or two entries end up
  // dated from one scene.
  const wrote = { body: 'Vel is soaked.', label: 'Fell in' };
  for (const scene of [1, 3, 99, undefined]) {
    const u = done(ch.checkUndo({ op: 'thread.overtime', thread: 'e-vel', state: 'st-2', scene, text: 'Vel is wet.',
      label: 'Fell in', beforeMode: 'hint', wrote }, dated));
    assert.strictEqual(u.from, 2, `an Undo naming scene ${scene} still puts the entry back at scene 2`);
  }
});

const retiring = { ...whole, entries: [...tale.entries,
  { id: 'e-letter', title: 'The letter', entryType: 'item', addons: [], events: [] },
  { id: 'e-coin', title: 'The coin', entryType: 'item', addons: [],
    events: [{ id: 'ev-1', kind: 'retire', fromChapter: 1 }] },
  { id: 'e-old', title: 'The old way', entryType: 'lore', addons: [], retiredAtChapter: 1 }] };

ok('THREAD-RETIRE: retired from a scene, from the next one when none is named, and Undo brings it back', () => {
  const c = done(ch.checkAsked({ op: 'thread.retire', thread: 'the letter' }, retiring));
  assert.strictEqual(c.thread, 'e-letter');
  assert.strictEqual(c.from, 3, 'none named is the scene after the one the writer is in, as the hand press does');
  assert.match(ch.wordsFor(c), /Retired The letter from scene 3/);
  assert.deepStrictEqual(ch.undoFor(c, { event: 'ev-new' }), { op: 'retire.unmake', thread: 'e-letter', event: 'ev-new' });
  assert.strictEqual(done(ch.checkAsked({ op: 'thread.retire', thread: 'letter', scene: 1 }, retiring)).from, 1);
  const retired = { ...retiring, entries: [...retiring.entries.filter((e) => e.id !== 'e-letter'),
    { id: 'e-letter', title: 'The letter', entryType: 'item', addons: [], events: [{ id: 'ev-new', kind: 'retire', fromChapter: 3 }] }] };
  const u = done(ch.checkUndo({ op: 'retire.unmake', thread: 'e-letter', event: 'ev-new' }, retired));
  assert.match(ch.wordsFor(u), /Brought back The letter/);
});

ok('THREAD-RETIRE-REFUSED: a scene the tale does not have, a thread already retired, a followed thread, or a forged Undo', () => {
  refused(ch.checkAsked({ op: 'thread.retire', thread: 'letter', scene: 6 }, retiring), /no scene 6/i);
  refused(ch.checkAsked({ op: 'thread.retire', thread: 'coin', scene: 2 }, retiring), /already retired/i);
  refused(ch.checkAsked({ op: 'thread.retire', thread: 'the old way' }, retiring), /already retired/i);
  refused(ch.checkAsked({ op: 'thread.retire', thread: 'The Erdtree' }, retiring), /Lands Between/);
  // Only a retirement can be taken back this way, and only one of this thread's.
  refused(ch.checkUndo({ op: 'retire.unmake', thread: 'e-letter', event: 'ev-1' }, retiring), /no longer in this tale/i);
  const worn = { entries: [{ id: 'e-vel', title: 'Vel', entryType: 'character', addons: [],
    events: [{ id: 'ev-w', kind: 'wear', fromChapter: 2 }, { id: 'ev-r', kind: 'return', fromChapter: 2 }] }] };
  refused(ch.checkUndo({ op: 'retire.unmake', thread: 'e-vel', event: 'ev-w' }, worn), /no longer in this tale/i);
  refused(ch.checkUndo({ op: 'retire.unmake', thread: 'e-vel', event: 'ev-r' }, worn), /no longer in this tale/i);
  for (const op of ['thread.delete', 'thread.remove', 'retire.unmake'])
    refused(ch.checkAsked({ op, thread: 'letter', event: 'ev-1' }, retiring), /not something Talk can do/i);
});

ok('UNDO-FORGED: an Undo cannot make a pocket, or leave a thread On a word with no words', () => {
  // A put-back names the pocket it writes over. With none named it would make one, which is a
  // request's to do and is checked as one; an Undo that takes a pocket away is room.unmake.
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'appearance', addon: null, text: 'Tall.', wrote: '' }, tale),
    /names no pocket/i);
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'appearance', text: 'Tall.' }, tale), /names no pocket/i);
  // On a word with no words never reaches the model: a request is refused it, and so is an Undo.
  refused(ch.checkUndo({ op: 'thread.wake', thread: 'e-vel', activation: 'triggered', keys: [],
    wrote: { activation: 'always_on', keys: [] } }, waking), /wake words/i);
});

// ONE-SIDED PAIR. Every operation the model may ask for must have an Undo, and every operation that
// can be applied (asked, or an Undo's own) must be one the route's `applyChange` writes. A new
// operation added to the list without both lands with `undo: null`, or as "the tale refused it".
const OWN = {
  taleRules: [{ id: 'r-toll', name: 'The toll', body: 'Every crossing costs a coin.', keys: [], active: true },
              { id: 'r-dawn', name: 'Dawn law', body: 'Nobody crosses after dawn.', keys: ['dawn', 'sunrise'], active: false }],
  talePockets: [{ id: 'i-tense', name: 'Tense', body: 'Keep to the past tense.', active: true },
                { id: 'i-oaths', name: 'No oaths', body: 'Nobody swears in narration.', active: false }],
  strings: [{ id: 'st-letter', title: 'The letter he has not opened', kind: 'promise', status: 'open', summoned: true },
            { id: 'st-ring', title: 'Who took the ring', kind: 'question', status: 'paid', summoned: false },
            { id: 'st-debt', title: 'The debt', kind: 'promise', status: 'open', summoned: false }] };
const every = { ...dated, ...OWN, entries: [...dated.entries,
  { id: 'e-letter', title: 'The letter', entryType: 'item', activation: 'triggered', keys: ['letter'], addons: [], events: [] }] };
const ASKS: Record<string, any> = {
  'thread.new': { title: 'The ferryman', type: 'character', text: 'Rows.' },
  'thread.set': { thread: 'Talia Venn', text: 'Talia is thirty.' },
  'thread.overtime': { thread: 'Vel', scene: 3, text: 'Vel is blind.' },
  'thread.wake': { thread: 'the letter', activation: 'always_on' },
  'thread.retire': { thread: 'the letter' },
  'tale.set': { field: 'premise', text: 'A darker river.' },
  'scene.set': { scene: 1, field: 'title', text: 'The Ford' },
  'string.set': { kind: 'promise', title: 'The debt', text: 'Owed since spring.' },
  'string.stand': { title: 'the letter', stand: 'tied_off' },
  'rule.set': { title: 'The tide', text: 'The river runs backward at night.', keys: ['night'] },
  'rule.switch': { title: 'The toll', on: false },
  'instruction.set': { title: 'Weather', text: 'Let the weather carry the feeling.' },
  'instruction.switch': { title: 'Tense', on: false },
};

ok('ONE-SIDED-PAIR: every operation on the list has an Undo, and the Undo is one Undo can do', () => {
  assert.deepStrictEqual(Object.keys(ASKS).sort(), [...ch.ASKED].sort(),
    'every operation on the list has a case here: add one for a new operation');
  for (const op of ch.ASKED) {
    const c = done(ch.checkAsked({ op, ...ASKS[op] }, every));
    const u = ch.undoFor(c, { thread: 'e-new', addon: 'a-new', state: 'st-new', event: 'ev-new' });
    assert.ok(u, `${op} has no Undo`);
    const back = ch.checkUndo(u, every);
    assert.ok(back.ok || !/not something Undo can do/.test(back.why), `${op}'s Undo is ${u!.op}, which Undo cannot do`);
  }
});

ok('ONE-SIDED-PAIR: every operation that can be applied is one the route writes', () => {
  const src = readFileSync(new URL('../src/routes.ts', import.meta.url), 'utf8');
  const at = src.indexOf('function applyChange(');
  assert.ok(at > 0, 'applyChange is in src/routes.ts');
  const body = src.slice(at, src.indexOf('\n}\n', at));
  for (const op of [...ch.ASKED, ...ch.UNMAKE])
    assert.ok(body.includes(`ch.op === '${op}'`), `applyChange does not write ${op}`);
});

ok('POCKET-WORDS: what a writer reads says pocket, never room (GLOSSARY)', () => {
  const whys = [
    ch.checkAsked({ op: 'thread.set', thread: 'Talia Venn', room: 'nonsense', text: 'x' }, tale),
    ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'facts', addon: 'a-gone', text: 'x', wrote: 'x' }, tale),
    ch.checkUndo({ op: 'room.unmake', thread: 'e-talia', addon: 'a-gone', text: 'x' }, tale),
  ].map((r: any) => { assert.ok(!r.ok); return r.why; });
  for (const w of whys) {
    assert.doesNotMatch(w, /\brooms?\b/i, `a writer reads "room": ${w}`);
    assert.match(w, /pocket/i, `and it names the pocket: ${w}`);
  }
});

// #110 · WHAT TALK WRITES IS A PLAIN DESCRIPTION (ADR 0008), checked, shown and kept for the Undo as
// it will be stored. `db.upsertAddon` takes the wrapper off by the same rule, so a change remembered
// with its brackets would never match the stored text, and its Undo would always be refused.
ok('TALK-PLAIN: Talk\'s text loses its bracket wrapper and name before it is checked and remembered', () => {
  const set = done(ch.checkAsked({ op: 'thread.set', thread: 'Talia Venn', text: '[Talia Venn: Talia is forty.]' }, tale));
  assert.strictEqual(set.text, 'Talia is forty.', 'TALK-PLAIN-SET: the Always true Talk writes is the description');
  assert.strictEqual(ch.undoFor(set, {})!.wrote, 'Talia is forty.', '  and its Undo checks for that text');
  const voice = done(ch.checkAsked({ op: 'thread.set', thread: 'Talia Venn', room: 'voice', text: '[voice: slow now]' }, tale));
  assert.strictEqual(voice.text, 'slow now', 'TALK-PLAIN-POCKET: and a pocket loses its kind in front');
  const made = done(ch.checkAsked({ op: 'thread.new', title: 'Vel', type: 'character', text: 'Vel: Vel: a ferry pilot' }, tale));
  assert.strictEqual(made.always, 'a ferry pilot', 'TALK-PLAIN-NEW: a new thread\'s Always true too');
  assert.strictEqual(ch.undoFor(made, { thread: 'e-vel' })!.text, 'a ferry pilot', '  which its Undo matches');
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Talia Venn', text: '[Talia Venn: Talia is twenty.]' }, tale),
    /already says/i);
  // THE SETUP DRAFT holds the description only: that is the box the writer reads before Start.
  const draft = { story: {}, entries: [{ title: 'The Ferryman', entryType: 'character', body: 'rows the dead' }] };
  const dnew = done(ch.checkDraft({ op: 'thread.new', title: 'Vel', type: 'character', text: '[Vel: a ferry pilot]' }, draft));
  assert.strictEqual(dnew.thread.body, 'a ferry pilot', 'DRAFT-PLAIN-NEW: a new draft thread holds the description, no brackets');
  const dset = done(ch.checkDraft({ op: 'thread.set', thread: 'The Ferryman', room: 'none', text: 'The Ferryman: rows twice' }, draft));
  assert.strictEqual(dset.body, 'rows twice', 'DRAFT-PLAIN-SET: and a changed Always true too');
  assert.strictEqual(dset.before, 'rows the dead', '  with the text it had, for its Undo');
  const dvoice = done(ch.checkDraft({ op: 'thread.set', thread: 'The Ferryman', room: 'voice', text: '[voice: never hurries]' }, draft));
  assert.strictEqual(dvoice.text, 'never hurries', 'DRAFT-PLAIN-POCKET: and a pocket');
});

// #101 · TALK AND AN IP. In a tale that follows a World, a change to the IP's canon goes to the
// World's thread, the writer's own version goes to the tale (a take-over when the tale only follows
// that thread), and a change the model did not say which of is a question, not a guess.
const ring = { id: 'w-ring', title: 'Elden Ring', entries: [
  { id: 'w-erd', title: 'The Erdtree', entryType: 'lore', addons: [room('wa-e', 'facts', 'It burns gold.')] },
  { id: 'w-morg', title: 'Morgott', entryType: 'character', addons: [room('wa-m', 'facts', 'The Omen King.')] }] };
const follows = { entries: [
  { id: 'w-erd', title: 'The Erdtree', entryType: 'lore', sharedFrom: 'Elden Ring', addons: [room('wa-e', 'facts', 'It burns gold.')] },
  { id: 't-morg', title: 'Morgott', entryType: 'character', originId: 'w-morg', addons: [room('ta-m', 'facts', 'The Omen King, wed.')] },
  { id: 't-vel', title: 'Vel', entryType: 'character', addons: [] }], chapters: [{ id: 'c1', index: 1 }, { id: 'c2', index: 2 }], at: 1 };
const aim = (raw: any, world: any = ring): any => ch.aimOf(raw, follows, world);

ok('IP-AIM-CANON: a change to canon goes to the World\'s thread, by the World\'s name for it', () => {
  const a = aim({ op: 'thread.set', thread: 'erdtree', text: 'It is ash.', to: 'world' });
  assert.strictEqual(a.to, 'world');
  assert.strictEqual(a.raw.thread, 'The Erdtree', 'the World\'s own name, so the World resolves it');
  assert.strictEqual(aim({ op: 'thread.set', thread: 'Morgott', room: 'voice', text: 'Slow.', to: 'world' }).to, 'world',
    'canon reaches the World through a thread the tale has taken over too');
  assert.strictEqual(aim({ op: 'thread.new', title: 'Malenia', type: 'character', text: 'Blade.', to: 'world' }).to, 'world',
    'a new thread of the canon is made in the World');
});

ok('IP-AIM-MINE: the writer\'s version goes to the tale, taking a followed thread over first', () => {
  const a = aim({ op: 'thread.set', thread: 'The Erdtree', text: 'It is ash.', to: 'tale' });
  assert.deepStrictEqual([a.to, a.origin], ['takeover', 'w-erd'], 'a thread the tale only follows is taken over');
  assert.strictEqual(aim({ op: 'thread.set', thread: 'Morgott', text: 'Wed.', to: 'tale' }).to, 'tale',
    'a thread the tale has its own version of is changed there');
  assert.strictEqual(aim({ op: 'thread.new', title: 'Sela', type: 'character', text: 'Mine.', to: 'tale' }).to, 'tale');
});

ok('IP-AIM-ASK: a change the model did not place is a question, for a World thread and a new one', () => {
  for (const raw of [{ op: 'thread.set', thread: 'The Erdtree', text: 'It is ash.' },
    { op: 'thread.set', thread: 'Morgott', text: 'Wed.' },
    { op: 'thread.wake', thread: 'The Erdtree', activation: 'always_on' },
    { op: 'thread.new', title: 'Malenia', type: 'character', text: 'Blade.' }])
    assert.ok(aim(raw).ask, `asked, not placed: ${JSON.stringify(raw)} -> ${JSON.stringify(aim(raw))}`);
  assert.strictEqual(aim({ op: 'thread.set', thread: 'Morgott', text: 'Wed.', to: 'ask' }).ask, 'Morgott');
});

ok('IP-AIM-PLAIN: what the World has nothing to do with is the tale\'s, whatever the model said', () => {
  assert.strictEqual(aim({ op: 'thread.set', thread: 'Vel', text: 'Old.' }).to, 'tale', 'a thread the World does not have');
  assert.strictEqual(aim({ op: 'tale.set', field: 'premise', text: 'Ash.', to: 'world' }).to, 'tale', 'the premise');
  assert.strictEqual(aim({ op: 'thread.set', thread: 'Nobody', text: 'Old.' }).to, 'tale', 'a name nothing has, for the check to refuse');
  assert.strictEqual(aim({ op: 'thread.set', thread: 'The Erdtree', text: 'Ash.' }, null).to, 'tale',
    'and with no World the writer owns, nothing is asked: the tale\'s own rule refuses a followed thread');
});

ok('IP-AIM-REFUSED: what a World cannot take is refused, in words', () => {
  assert.match(aim({ op: 'thread.set', thread: 'Vel', text: 'Old.', to: 'world' }).refused?.why ?? '',
    /Elden Ring has no thread called Vel/);
  assert.match(aim({ op: 'thread.overtime', thread: 'Morgott', scene: 2, text: 'Blind.', to: 'world' }).refused?.why ?? '',
    /no scenes/);
  assert.match(aim({ op: 'thread.retire', thread: 'The Erdtree', to: 'world' }).refused?.why ?? '', /no scenes/);
});

ok('IP-ASK-LINE: the question is one line, naming each thread and the World', () => {
  const line = ch.askWhich(['Morgott', 'Malenia'], 'Elden Ring');
  assert.doesNotMatch(line, /\n/);
  for (const w of [/Morgott/, /Malenia/, /Elden Ring/, /this tale/]) assert.match(line, w);
});

ok('IP-TAKEOVER-UNDO: a take-over is handed back only while the copy is as Talk left it', () => {
  const t = follows.entries[1];
  const wrote = ch.fingerprint(t as any);
  const back = done(ch.checkUndo({ op: 'takeover.unmake', thread: 't-morg', wrote }, follows));
  assert.deepStrictEqual([back.op, back.thread, back.origin], ['takeover.unmake', 't-morg', 'w-morg']);
  assert.match(ch.wordsFor(back), /Morgott/);
  const since = { ...follows, entries: [{ ...t, addons: [room('ta-m', 'facts', 'The Omen King, widowed.')] }] };
  refused(ch.checkUndo({ op: 'takeover.unmake', thread: 't-morg', wrote }, since), /changed since/);
  refused(ch.checkUndo({ op: 'takeover.unmake', thread: 't-vel', wrote: ch.fingerprint(follows.entries[2] as any) }, follows),
    /not one this tale took over/);
});

ok('the change slice never reaches for the database itself', () => {
  const src = readFileSync(new URL('../src/changes.ts', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/db\.ts'/.test(src), 'src/changes.ts must not import db.ts');
  assert.ok(!/node:sqlite/.test(src), 'src/changes.ts must not open a database');
  assert.ok(!/\bMINE\s*\(/.test(src), 'nor define or call the ownership clause');
});

// #122 · WHAT A CHANGE LINE DIFFS: the text before and after, for the changes that replace text,
// and nothing for the ones that do not (a new thread has no before; a retirement replaces no text).
ok('CHANGE-TEXTS: before and after for what a change rewrote, none where it rewrote nothing', () => {
  const set = done(ch.checkAsked({ op: 'thread.set', thread: 'Talia Venn', text: 'Talia is thirty.' }, tale));
  assert.deepStrictEqual(ch.textsOf(set), { before: 'Talia is twenty.', after: 'Talia is thirty.' });
  const fresh = done(ch.checkAsked({ op: 'thread.set', thread: 'Ring Law', room: 'what_it_does', text: 'A fine.' }, tale));
  assert.deepStrictEqual(ch.textsOf(fresh), { before: '', after: 'A fine.' }, 'a pocket it made had nothing before it');
  assert.deepStrictEqual(ch.textsOf({ op: 'tale.set', field: 'premise', text: 'A debt.', before: 'A loan.' }),
    { before: 'A loan.', after: 'A debt.' });
  assert.deepStrictEqual(ch.textsOf({ op: 'scene.set', chapter: 'c', index: 2, field: 'title', text: 'Rust', before: 'Scene 2' }),
    { before: 'Scene 2', after: 'Rust' });
  assert.deepStrictEqual(ch.textsOf({ op: 'thread.overtime', thread: 'e', title: 'T', from: 3, text: 'Gone.', label: null,
    beforeMode: 'hide', state: 's', before: { body: 'Here.', label: null, beforeMode: 'hide' } }), { before: 'Here.', after: 'Gone.' });
  assert.deepStrictEqual(ch.textsOf({ op: 'thread.overtime', thread: 'e', title: 'T', from: 3, text: 'Gone.', label: null,
    beforeMode: 'hide', state: null, before: null }), { before: '', after: 'Gone.' });
  assert.deepStrictEqual(ch.textsOf({ op: 'thread.wake', thread: 'e', title: 'T', activation: 'triggered', keys: ['bell', 'tower'],
    before: { activation: 'triggered', keys: ['bell'] } }), { before: 'On a word: bell', after: 'On a word: bell, tower' });
  for (const c of [{ op: 'thread.new', title: 'X', type: 'character', always: 'x', keys: [], activation: 'always_on' },
    { op: 'thread.retire', thread: 'e', title: 'T', from: 2 }, { op: 'thread.unmake', thread: 'e', title: 'T' }])
    assert.strictEqual(ch.textsOf(c), null, `${c.op} rewrote no text`);
  // An Undo's `before` is the text being put back, so its line is not drawn as a diff the wrong way round.
  assert.strictEqual(ch.textsOf({ op: 'tale.set', field: 'premise', text: 'A loan.', before: 'A loan.', undo: true }), null);
});

// ---- #128 · A STRING, ASKED FOR IN TALK: a pocket of the tale's thread (ADR 0011), added or changed
// through the one operation on the list that reaches that thread. The tale's thread is not a thread of
// the cast, so `thread.set` cannot find it by name, and an Undo reaches it only for a string.
const LETTER = room('st-letter', 'promise', 'Sent by his brother.', { name: 'The letter he has not opened' });
const strung = { ...whole, taleThread: { id: 'e-tale', title: 'The tale', entryType: 'tale',
  addons: [room('tf', 'facts', 'A port town.'), LETTER, room('st-ring', 'question', 'Nobody says.', { name: 'Who took the ring' })] } };

ok('STRING-NEW: a string with a new name is added to the tale\'s thread, and Undo takes it away', () => {
  const c = done(ch.checkAsked({ op: 'string.set', kind: 'question', title: 'Who sent the letter', text: 'It came with no name.' }, strung));
  assert.strictEqual(c.thread, 'e-tale', "on the tale's thread");
  assert.strictEqual(c.addon, null, 'a new pocket');
  assert.strictEqual(c.kind, 'question');
  assert.strictEqual(c.name, 'Who sent the letter');
  assert.strictEqual(c.before, null);
  assert.strictEqual(c.from, 2, 'set up in the scene the writer is in');
  assert.match(ch.wordsFor(c), /open question.*Who sent the letter/i);
  assert.deepStrictEqual(ch.textsOf(c), { before: '', after: 'It came with no name.' });
  const undo = ch.undoFor(c, { thread: 'e-tale', addon: 'st-new' });
  assert.deepStrictEqual(undo, { op: 'room.unmake', thread: 'e-tale', addon: 'st-new', text: 'It came with no name.' });
  const after = { ...strung, taleThread: { ...strung.taleThread, addons: [...strung.taleThread.addons,
    room('st-new', 'question', 'It came with no name.', { name: 'Who sent the letter' })] } };
  assert.ok(ch.checkUndo(undo, after).ok, 'STRING-UNDO-NEW: the Undo can take it away');
  // A tale with no thread of its own yet: the route makes it, so the change names none.
  const bare = done(ch.checkAsked({ op: 'string.set', kind: 'promise', title: 'The debt', text: 'Owed since spring.' }, whole));
  assert.strictEqual(bare.thread, null, 'no tale thread yet: the route makes one');
});

ok('STRING-CHANGE: a string the tale has, by its name, is rewritten, and Undo puts it back', () => {
  const c = done(ch.checkAsked({ op: 'string.set', title: 'the letter', text: 'Sealed, and still unopened.' }, strung));
  assert.strictEqual(c.addon, 'st-letter', 'a near name finds it, as a thread is found');
  assert.strictEqual(c.kind, 'promise', 'no kind given keeps its own');
  assert.strictEqual(c.before, 'Sent by his brother.');
  const undo = ch.undoFor(c, {});
  assert.deepStrictEqual(undo, { op: 'thread.set', thread: 'e-tale', room: 'promise', addon: 'st-letter',
    text: 'Sent by his brother.', wrote: 'Sealed, and still unopened.' });
  const after = { ...strung, taleThread: { ...strung.taleThread, addons: [strung.taleThread.addons[0],
    { ...LETTER, body: 'Sealed, and still unopened.' }, strung.taleThread.addons[2]] } };
  const back = done(ch.checkUndo(undo, after));
  assert.match(ch.wordsFor(back), /Put back the promise The letter he has not opened/);
});

ok('STRING-REFUSED: not a kind of string, no name, no text, or the same text and kind', () => {
  refused(ch.checkAsked({ op: 'string.set', kind: 'voice', title: 'X', text: 'y' }, strung), /promise or an open question/i);
  refused(ch.checkAsked({ op: 'string.set', kind: 'promise', text: 'y' }, strung), /no name/i);
  refused(ch.checkAsked({ op: 'string.set', kind: 'promise', title: 'The debt', text: '  ' }, strung), /no text/i);
  refused(ch.checkAsked({ op: 'string.set', title: 'Who took the ring', text: 'Nobody says.' }, strung), /already says/i);
  refused(ch.checkAsked({ op: 'string.set', kind: 'promise', title: 'the letter', text: 'Sent by his brother.' }, strung),
    /already says/i);
});

// Seth, 2026-10-28: "I can't change a string's status or what it's for, like a promise." Asked for in so
// many words, Talk changes a string's kind; the text may be left out, and the string keeps its own.
ok('STRING-KIND: a string the tale has is made the other kind, and Undo puts the old kind back', () => {
  const c = done(ch.checkAsked({ op: 'string.set', kind: 'question', title: 'the letter' }, strung));
  assert.deepStrictEqual([c.addon, c.kind, (c as any).wasKind, c.text, c.before],
    ['st-letter', 'question', 'promise', 'Sent by his brother.', 'Sent by his brother.'],
    'STRING-KIND-ASKED: the same string, an open question now, its text as it was');
  assert.strictEqual(ch.wordsFor(c), 'Made The letter he has not opened an open question.');
  assert.strictEqual(ch.textsOf(c), null, 'STRING-KIND-NO-DIFF: its text did not change, so the line has no diff');
  const undo = ch.undoFor(c, {});
  assert.deepStrictEqual(undo, { op: 'thread.set', thread: 'e-tale', room: 'promise', addon: 'st-letter',
    text: 'Sent by his brother.', wrote: 'Sent by his brother.', wroteKind: 'question' },
    'STRING-KIND-UNDO: the Undo names the old kind, and the kind Talk left');
  const turned = { ...strung, taleThread: { ...strung.taleThread, addons: [strung.taleThread.addons[0],
    { ...LETTER, slot: 'question' }, strung.taleThread.addons[2]] } };
  const back = done(ch.checkUndo(undo, turned));
  assert.deepStrictEqual([back.room, back.addon], ['promise', 'st-letter'], 'STRING-KIND-UNDO: it puts the promise back');
  refused(ch.checkUndo(undo, strung), /changed since/i);
  // Both at once, in the other direction.
  const both = done(ch.checkAsked({ op: 'string.set', kind: 'promise', title: 'Who took the ring', text: 'The ring is owed back.' }, strung));
  assert.deepStrictEqual([both.kind, (both as any).wasKind, both.text], ['promise', 'question', 'The ring is owed back.']);
  assert.match(ch.wordsFor(both), /^Made Who took the ring a promise: “The ring is owed back\.”$/);
});

ok('STRING-ONLY: the tale\'s thread is reached by string.set alone, and an Undo touches only its strings', () => {
  refused(ch.checkAsked({ op: 'thread.set', thread: 'The tale', room: 'promise', text: 'x' }, strung), /no thread called/i);
  refused(ch.checkUndo({ op: 'thread.unmake', thread: 'e-tale', title: 'The tale', text: 'A port town.' }, strung),
    /no longer in this tale/i);
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-tale', room: 'facts', addon: 'tf', text: 'x', wrote: 'A port town.' }, strung),
    /no longer in this tale/i);
  refused(ch.checkUndo({ op: 'room.unmake', thread: 'e-tale', addon: 'tf', text: 'A port town.' }, strung), /no longer in this tale/i);
  // And a string's kind is never a pocket of anyone else's thread.
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Talia Venn', room: 'promise', text: 'x' }, strung), /no promise/i);
});

// ---- THE TALE'S OWN POCKETS IN TALK: its rules (ADR 0005), its own instructions, and where each
// string stands (ADR 0011). Each found by its name, as a thread is; each with an Undo by id.
const owned = { ...whole, ...OWN };
const withRule = (r: any) => ({ ...owned, taleRules: [...owned.taleRules.filter((x) => x.id !== r.id), r] });

ok('RULE-NEW: a rule with a new name is added on, with its wake words, and Undo takes it away', () => {
  const c = done(ch.checkAsked({ op: 'rule.set', title: 'The tide', text: '[The tide: The river runs backward at night.]',
    keys: ['night', ' dark '] }, owned));
  assert.deepStrictEqual([c.addon, c.name, c.text, c.keys, c.before], [null, 'The tide', 'The river runs backward at night.',
    ['night', 'dark'], null], 'RULE-NEW-ASKED: a new pocket, its text plain, its words trimmed');
  assert.strictEqual(ch.wordsFor(c), 'Added a rule to the tale, on: The tide, on a word: night, dark.');
  assert.deepStrictEqual(ch.textsOf(c), { before: '', after: 'The river runs backward at night.' });
  const undo = ch.undoFor(c, { addon: 'r-new' });
  assert.deepStrictEqual(undo, { op: 'pocket.unmake', slot: 'rule', addon: 'r-new', text: 'The river runs backward at night.' });
  const after = withRule({ id: 'r-new', name: 'The tide', body: 'The river runs backward at night.', keys: ['night', 'dark'], active: true });
  const gone = done(ch.checkUndo(undo, after));
  assert.strictEqual(ch.wordsFor(gone), 'Took away the rule The tide.', 'RULE-NEW-UNDO: the Undo takes it away');
  refused(ch.checkUndo(undo, withRule({ id: 'r-new', name: 'The tide', body: 'Edited by hand.', keys: [], active: true })),
    /changed since Talk made it/i);
  // Always on when no words are given.
  assert.deepStrictEqual(done(ch.checkAsked({ op: 'rule.set', title: 'Coins', text: 'A coin is a life.' }, owned)).keys, []);
});

ok('RULE-CHANGE: a rule the tale has, by its name, gets new text or new wake words, and Undo puts both back', () => {
  const c = done(ch.checkAsked({ op: 'rule.set', title: 'the toll', text: 'Every crossing costs two coins.' }, owned));
  assert.deepStrictEqual([c.addon, c.name, c.keys, c.before], ['r-toll', 'The toll', [],
    { text: 'Every crossing costs a coin.', keys: [] }], 'RULE-CHANGE-ASKED: a near name finds it; no words given keeps its own');
  assert.match(ch.wordsFor(c), /^Changed the rule The toll: “Every crossing costs two coins\.”$/);
  const undo = ch.undoFor(c, {});
  assert.deepStrictEqual(undo, { op: 'rule.set', addon: 'r-toll', text: 'Every crossing costs a coin.', keys: [],
    wrote: { text: 'Every crossing costs two coins.', keys: [] } });
  const after = withRule({ ...owned.taleRules[0], body: 'Every crossing costs two coins.' });
  const back = done(ch.checkUndo(undo, after));
  assert.deepStrictEqual([back.text, back.undo], ['Every crossing costs a coin.', true]);
  assert.strictEqual(ch.wordsFor(back), 'Put back the rule The toll.');
  refused(ch.checkUndo(undo, owned), /changed since/i);
  // Wake words alone: its text is kept, and the diff is of the words.
  const w = done(ch.checkAsked({ op: 'rule.set', title: 'Dawn law', keys: ['first light'] }, owned));
  assert.deepStrictEqual([w.text, w.keys], ['Nobody crosses after dawn.', ['first light']], 'RULE-WAKE: new words, the same text');
  assert.deepStrictEqual(ch.textsOf(w), { before: 'On a word: dawn, sunrise', after: 'On a word: first light' });
  assert.match(ch.wordsFor(w), /^Dawn law is On a word now: first light\.$/);
  const always = done(ch.checkAsked({ op: 'rule.set', title: 'Dawn law', activation: 'always_on' }, owned));
  assert.deepStrictEqual(always.keys, [], 'RULE-WAKE-ALWAYS: Always on takes its words away');
});

ok('RULE-REFUSED: no name, a new rule with no text, the same text and words, words asked for and none given', () => {
  refused(ch.checkAsked({ op: 'rule.set', text: 'x' }, owned), /no name/i);
  refused(ch.checkAsked({ op: 'rule.set', title: 'The tide' }, owned), /no text/i);
  refused(ch.checkAsked({ op: 'rule.set', title: 'The toll', text: 'Every crossing costs a coin.' }, owned), /already/i);
  refused(ch.checkAsked({ op: 'rule.set', title: 'The toll', activation: 'triggered' }, owned), /wake words/i);
  const two = { ...owned, taleRules: [{ id: 'r-f', name: 'Toll of the ferry', body: 'A coin.', keys: [], active: true },
    { id: 'r-b', name: 'Toll of the bridge', body: 'A song.', keys: [], active: true }] };
  refused(ch.checkAsked({ op: 'rule.set', title: 'toll', text: 'x' }, two), /more than one rule.*Toll of the ferry.*Toll of the bridge/i);
});

ok('RULE-SWITCH: a rule switched on or off by its name, and Undo puts the switch back', () => {
  const c = done(ch.checkAsked({ op: 'rule.switch', title: 'The toll', on: false }, owned));
  assert.deepStrictEqual([c.addon, c.on], ['r-toll', false]);
  assert.strictEqual(ch.wordsFor(c), 'Switched the rule The toll off.');
  assert.strictEqual(ch.textsOf(c), null, 'a switch rewrites no text');
  const undo = ch.undoFor(c, {});
  assert.deepStrictEqual(undo, { op: 'rule.switch', addon: 'r-toll', on: true, wrote: false });
  const back = done(ch.checkUndo(undo, withRule({ ...owned.taleRules[0], active: false })));
  assert.strictEqual(ch.wordsFor(back), 'Put back the rule The toll: on.');
  refused(ch.checkUndo(undo, owned), /changed since/i);
  refused(ch.checkAsked({ op: 'rule.switch', title: 'The toll', on: true }, owned), /already on/i);
  refused(ch.checkAsked({ op: 'rule.switch', title: 'The toll' }, owned), /on or off/i);
  refused(ch.checkAsked({ op: 'rule.switch', title: 'The ferry', on: true }, owned), /no rule called "The ferry"/i);
});

ok('INSTRUCTION: one of the writer\'s own, added on, changed, or switched, each with its Undo', () => {
  const c = done(ch.checkAsked({ op: 'instruction.set', title: 'Weather', text: 'Let the weather carry the feeling.' }, owned));
  assert.deepStrictEqual([c.addon, c.name, c.before], [null, 'Weather', null]);
  assert.strictEqual(ch.wordsFor(c), 'Added an instruction of your own to the tale, on: Weather.');
  assert.deepStrictEqual(ch.undoFor(c, { addon: 'i-new' }), { op: 'pocket.unmake', slot: 'instruction', addon: 'i-new',
    text: 'Let the weather carry the feeling.' });
  const e = done(ch.checkAsked({ op: 'instruction.set', title: 'tense', text: 'Keep to the present tense.' }, owned));
  assert.deepStrictEqual([e.addon, e.before.text], ['i-tense', 'Keep to the past tense.']);
  assert.match(ch.wordsFor(e), /^Changed your instruction Tense: “Keep to the present tense\.”$/);
  const undo = ch.undoFor(e, {});
  assert.strictEqual(undo!.op, 'instruction.set');
  const after = { ...owned, talePockets: [{ ...owned.talePockets[0], body: 'Keep to the present tense.' }, owned.talePockets[1]] };
  assert.strictEqual(done(ch.checkUndo(undo, after)).text, 'Keep to the past tense.');
  const on = done(ch.checkAsked({ op: 'instruction.switch', title: 'No oaths', on: true }, owned));
  assert.strictEqual(ch.wordsFor(on), 'Switched your instruction No oaths on.');
  refused(ch.checkAsked({ op: 'instruction.switch', title: 'The toll', on: true }, owned), /no instruction of yours called/i);
  // A rule's Undo cannot reach an instruction, nor the other way: each looks in its own list.
  refused(ch.checkUndo({ op: 'rule.switch', addon: 'i-tense', on: false, wrote: true }, owned), /no longer in this tale/i);
  refused(ch.checkUndo({ op: 'pocket.unmake', slot: 'rule', addon: 'i-tense', text: 'Keep to the past tense.' }, owned),
    /no longer in this tale/i);
  // Nor a thread's pocket, by its id.
  refused(ch.checkUndo({ op: 'pocket.unmake', slot: 'rule', addon: 'a-tv', text: 'Quick and dry.' }, owned), /no longer in this tale/i);
});

ok('STRING-STAND: a string put in play, set aside, tied off or let go by its name, and Undo puts it back', () => {
  const c = done(ch.checkAsked({ op: 'string.stand', title: 'the letter', stand: 'tied_off' }, owned));
  assert.deepStrictEqual([c.addon, c.stand, c.was], ['st-letter', 'tied_off', 'in_play']);
  assert.strictEqual(ch.wordsFor(c), 'Tied off the promise The letter he has not opened.');
  assert.strictEqual(ch.textsOf(c), null);
  const undo = ch.undoFor(c, {});
  assert.deepStrictEqual(undo, { op: 'string.stand', addon: 'st-letter', stand: 'in_play', wrote: 'tied_off' });
  const tied = { ...owned, strings: [{ ...owned.strings[0], status: 'paid', summoned: false }, ...owned.strings.slice(1)] };
  const back = done(ch.checkUndo(undo, tied));
  assert.strictEqual(ch.wordsFor(back), 'Put back where the promise The letter he has not opened stood: in play.');
  refused(ch.checkUndo(undo, owned), /changed since/i);
  const re = done(ch.checkAsked({ op: 'string.stand', title: 'Who took the ring', stand: 'in_play' }, owned));
  assert.strictEqual(ch.wordsFor(re), 'Reopened the open question Who took the ring: it is in play.', 'STRING-REOPEN');
  assert.strictEqual(ch.wordsFor(done(ch.checkAsked({ op: 'string.stand', title: 'The debt', stand: 'let_go' }, owned))),
    'Let go of the promise The debt.');
  refused(ch.checkAsked({ op: 'string.stand', title: 'The debt', stand: 'set_aside' }, owned), /already set aside/i);
  refused(ch.checkAsked({ op: 'string.stand', title: 'The debt', stand: 'paid' }, owned), /in play, set aside, tied off or let go/i);
  refused(ch.checkAsked({ op: 'string.stand', title: 'The oath', stand: 'let_go' }, owned), /no string called "The oath"/i);
});

ok('TALE-SET-MORE: the tale\'s title, genre, voice and style note, beside its premise and setting', () => {
  const st = { ...whole, story: { ...whole.story, title: 'The Crossing', genre: 'noir', writingStyle: 'Short sentences.', styleNote: '' } };
  const t = done(ch.checkAsked({ op: 'tale.set', field: 'title', text: 'The Far Bank' }, st));
  assert.deepStrictEqual([t.key, t.before], ['title', 'The Crossing']);
  const g = done(ch.checkAsked({ op: 'tale.set', field: 'genre', text: 'noir / gothic and horror' }, st));
  assert.strictEqual(g.text, 'noir, gothic, horror', 'TALE-SET-GENRE: tidied as every save tidies it, so its Undo matches');
  assert.strictEqual(ch.undoFor(g, {})!.wrote, 'noir, gothic, horror');
  refused(ch.checkAsked({ op: 'tale.set', field: 'genre', text: ' Noir ' }, { ...st, story: { ...st.story, genre: 'Noir' } }), /already/i);
  const v = done(ch.checkAsked({ op: 'tale.set', field: 'voice', text: 'Long sentences.' }, st));
  assert.deepStrictEqual([v.key, v.before], ['writingStyle', 'Short sentences.'], 'TALE-SET-VOICE: the story\'s writingStyle');
  assert.strictEqual(ch.wordsFor(v), 'Changed the tale\'s voice: “Long sentences.”');
  const n = done(ch.checkAsked({ op: 'tale.set', field: 'style note', text: 'Rain in every scene.' }, st));
  assert.deepStrictEqual([n.field, n.key, n.before], ['style_note', 'styleNote', '']);
  assert.match(ch.wordsFor(n), /tale's style note/);
  const u = done(ch.checkUndo({ op: 'tale.set', field: 'voice', text: 'Short sentences.', wrote: 'Long sentences.' },
    { ...st, story: { ...st.story, writingStyle: 'Long sentences.' } }));
  assert.deepStrictEqual([u.key, u.text], ['writingStyle', 'Short sentences.']);
});

ok('TALK-SEES-OWN: Talk is shown the tale\'s rules, instructions and strings by name, with where each stands', () => {
  const lines = ch.talesOwn(owned);
  assert.match(lines, /Rules:.*The toll \(on, always\)/s, 'TALK-SEES-RULE');
  assert.match(lines, /Dawn law \(off, on a word: dawn, sunrise\)/);
  assert.match(lines, /instructions.*Tense \(on\).*No oaths \(off\)/s, 'TALK-SEES-INSTRUCTION');
  assert.match(lines, /Strings:.*The letter he has not opened \(a promise, in play\).*Who took the ring \(an open question, tied off\).*The debt \(a promise, set aside\)/s,
    'TALK-SEES-STRING');
  assert.strictEqual(ch.talesOwn(whole), '', 'nothing to show is no line');
});

// ONE-SIDED PAIR, the model's half. An operation on the list that the contract never describes is
// one the model is allowed to send and never told how: it is on the wire and never used.
const { TALK_CONTRACT } = await import('../src/prompts.ts');
ok('CONTRACT-EVERY-OP: TALK_CONTRACT describes every operation the model may ask for', () => {
  for (const op of ch.ASKED) assert.ok(TALK_CONTRACT.includes(`- ${op}:`), `CONTRACT-EVERY-OP: TALK_CONTRACT does not describe ${op}`);
});

console.log(`\n${n} checks passed`);
