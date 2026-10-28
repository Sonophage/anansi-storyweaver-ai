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

ok('the change slice never reaches for the database itself', () => {
  const src = readFileSync(new URL('../src/changes.ts', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/db\.ts'/.test(src), 'src/changes.ts must not import db.ts');
  assert.ok(!/node:sqlite/.test(src), 'src/changes.ts must not open a database');
  assert.ok(!/\bMINE\s*\(/.test(src), 'nor define or call the ownership clause');
});

console.log(`\n${n} checks passed`);
