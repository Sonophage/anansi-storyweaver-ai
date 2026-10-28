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
    { id: 'e-ring', title: 'Ring Law', entryType: 'rule', addons: [] },
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
    text: 'Talia is twenty.' });
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
    /a rule has no voice/i);
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Talia', room: 'atmosphere', text: 'Damp.' }, tale),
    /a character has no atmosphere/i);
  refused(ch.checkAsked({ op: 'thread.set', thread: 'Talia', room: 'mood', text: 'Damp.' }, tale),
    /no mood/i);
  const c = done(ch.checkAsked({ op: 'thread.set', thread: 'Ring Law', room: 'consequences', text: 'A fine.' }, tale));
  assert.strictEqual(c.room, 'consequences');
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
});

ok('CHANGE-NEW-REFUSED: no name, a kind nobody defined, or a name the tale already has', () => {
  refused(ch.checkAsked({ op: 'thread.new', title: ' ', type: 'character', text: 'x' }, tale), /no name/i);
  refused(ch.checkAsked({ op: 'thread.new', title: 'Blade', type: 'weapon', text: 'x' }, tale), /weapon/);
  refused(ch.checkAsked({ op: 'thread.new', title: 'talia venn', type: 'character', text: 'x' }, tale),
    /already a thread called Talia Venn/);
});

ok('CHANGE-CLOSED-LIST: no delete, no prose, and nothing an Undo alone may do', () => {
  for (const op of ['thread.delete', 'passage.set', 'prose.write', 'thread.unmake', 'room.unmake', '', undefined])
    refused(ch.checkAsked({ op, thread: 'Talia', text: 'x', addon: 'a-tf', title: 'Talia Venn' }, tale),
      /not something Talk can do/i);
  refused(ch.checkAsked(null, tale), /not something Talk can do/i);
});

ok('UNDO-SET: an Undo puts back the exact text, by id, and only on this tale\'s thread', () => {
  const c = done(ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'facts', addon: 'a-tf',
    text: 'Talia is twenty.' }, tale));
  assert.strictEqual(c.before, 'Talia is twenty.', 'the text it puts back is what was there');
  assert.match(ch.wordsFor(c), /Put back Talia Venn's Always true/);
  // An Undo restoring an EMPTY Always true is exact too; a request with no text is not one.
  assert.ok(ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'facts', addon: 'a-tf', text: '' }, tale).ok);
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-alice', room: 'facts', addon: 'a-tf', text: 'x' }, tale),
    /no longer in this tale/i);
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-talia', room: 'facts', addon: 'a-mr1', text: 'x' }, tale),
    /no longer in this tale/i, );
  refused(ch.checkUndo({ op: 'thread.set', thread: 'e-ring', room: 'voice', addon: null, text: 'x' }, tale),
    /a rule has no voice/i);
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
  assert.deepStrictEqual(ch.undoFor(c, {}), { op: 'tale.set', field: 'premise', text: 'A river between the living and the dead.' });
  // An empty setting is a setting not yet written; Undo puts the empty one back.
  const s = done(ch.checkAsked({ op: 'tale.set', field: 'Setting', text: 'A grey delta.' }, whole));
  assert.strictEqual(s.field, 'setting', 'the field as a writer says it');
  assert.strictEqual(ch.undoFor(s, {})!.text, '');
  const u = done(ch.checkUndo({ op: 'tale.set', field: 'setting', text: '' }, whole));
  assert.match(ch.wordsFor(u), /Put back the tale's setting/);
});

ok('TALE-SET-REFUSED: a field that is not the premise or setting, no text, or the same text', () => {
  refused(ch.checkAsked({ op: 'tale.set', field: 'title', text: 'The Crossing II' }, whole), /premise or its setting/i);
  refused(ch.checkAsked({ op: 'tale.set', field: 'genre', text: 'Horror' }, whole), /premise or its setting/i);
  refused(ch.checkAsked({ op: 'tale.set', field: 'premise', text: ' ' }, whole), /no text/i);
  refused(ch.checkAsked({ op: 'tale.set', field: 'premise', text: 'A river between the living and the dead.' }, whole),
    /already says/i);
  refused(ch.checkUndo({ op: 'tale.set', field: 'spice', text: '5' }, whole), /premise or its setting/i);
});

ok('SCENE-SET: a scene\'s title or where it heads, by its number, with the old text for Undo', () => {
  const c = done(ch.checkAsked({ op: 'scene.set', scene: 1, field: 'title', text: 'The Ford' }, whole));
  assert.strictEqual(c.chapter, 'c-1');
  assert.strictEqual(c.before, 'The Bank');
  assert.match(ch.wordsFor(c), /scene 1's title.*The Ford/);
  assert.deepStrictEqual(ch.undoFor(c, {}), { op: 'scene.set', chapter: 'c-1', field: 'title', text: 'The Bank' });
  const h = done(ch.checkAsked({ op: 'scene.set', scene: 2, field: 'Heads toward', text: 'The far bank, at dusk.' }, whole));
  assert.strictEqual(h.field, 'heads_toward', 'the field as a writer says it');
  assert.strictEqual(h.before, '', 'where it heads was empty, and Undo puts the empty one back');
  assert.match(ch.wordsFor(h), /where scene 2 heads.*far bank/);
  // No scene named is the scene the writer is in.
  assert.strictEqual(done(ch.checkAsked({ op: 'scene.set', field: 'title', text: 'Mid-stream' }, whole)).chapter, 'c-2');
  const u = done(ch.checkUndo({ op: 'scene.set', chapter: 'c-2', field: 'heads_toward', text: '' }, whole));
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
  assert.deepStrictEqual(ch.undoFor(c, {}), { op: 'thread.wake', thread: 'e-letter', activation: 'triggered', keys: ['letter'] });
  const w = done(ch.checkAsked({ op: 'thread.wake', thread: 'Vel', activation: 'triggered', keys: ['Vel', ' the blind one '] }, waking));
  assert.deepStrictEqual(w.keys, ['Vel', 'the blind one']);
  assert.strictEqual(w.activation, 'triggered', 'the writer asked, so a character may wait for its word');
  assert.match(ch.wordsFor(w), /Vel is On a word now: Vel, the blind one/);
  // New words for a thread already On a word.
  const k = done(ch.checkAsked({ op: 'thread.wake', thread: 'letter', activation: 'triggered', keys: ['envelope'] }, waking));
  assert.deepStrictEqual(ch.undoFor(k, {})!.keys, ['letter']);
  const u = done(ch.checkUndo({ op: 'thread.wake', thread: 'e-vel', activation: 'always_on', keys: [] }, waking));
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
    scene: 2, text: 'Vel is soaked.', label: 'Fell in', beforeMode: 'hint' });
  // No scene named is the scene the writer is in.
  assert.strictEqual(done(ch.checkAsked({ op: 'thread.overtime', thread: 'Vel', text: 'Vel is dry.' }, dated)).from, 2);
  const u = done(ch.checkUndo({ op: 'thread.overtime', thread: 'e-vel', state: 'st-2', scene: 2, text: 'Vel is soaked.',
    label: 'Fell in', beforeMode: 'hint' }, dated));
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

ok('the change slice never reaches for the database itself', () => {
  const src = readFileSync(new URL('../src/changes.ts', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/db\.ts'/.test(src), 'src/changes.ts must not import db.ts');
  assert.ok(!/node:sqlite/.test(src), 'src/changes.ts must not open a database');
  assert.ok(!/\bMINE\s*\(/.test(src), 'nor define or call the ownership clause');
});

console.log(`\n${n} checks passed`);
