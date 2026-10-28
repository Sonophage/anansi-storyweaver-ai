// The forge: the prompts handed to a foreign model, and the paste that reads its answer back.
//
//   node --experimental-strip-types test/forge.ts
//
// NO MODEL AND NO FAKE SERVER. Nothing here calls one — the prompts are built from `src/slots.ts`
// and the paste is a parser — which is what makes this suite cheap enough to run before every
// commit. The measurement rule that matters here is the drift one: a prompt naming the rooms of a
// character is a COPY of the slot table, and the whole reason `src/slots.ts` exists is that copies
// of that list drifted. So the strongest check in this file is the one asserting every slot has a
// description, because that is the line a future room will fail on.
import assert from 'node:assert';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-forge.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { FORGE, ROOM_MEANING } = await import('../src/forge.ts');
const { SLOTS, ALL_SLOTS, slotsFor } = await import('../src/slots.ts');

const me = db.owner('forger');
const her = db.owner('second-writer');
const story = db.createStory(me, { title: 'The Salt Ledger', premise: 'A tide-clerk counts what the sea returns.' });

const ctx = (body: any, o = me, admin = true) => ({ body, query: new URLSearchParams(), owner: o,
  slot: { global: 8192, slots: 1, perSlot: 8192 }, gen: { max_tokens: 400 }, setGen: () => {},
  defaultModel: null, setDefaultModel: () => {}, admin }) as any;

let n = 0;
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run.`);
  n++; console.log(`  ok  ${m}`);
};

// ---- 1. the prompts are built from the slot table, and cannot drift from it ----

// THE ANTI-DRIFT CHECK, and the reason this file exists. Adding a room to `src/slots.ts` without
// saying what it is for would put a bare column name in a prompt sent to a stranger's model, which
// is the least useful possible instruction. This is the line that goes red on that day.
{
  const undescribed = ALL_SLOTS.filter((s) => !String(ROOM_MEANING[s] ?? '').trim());
  assert.deepStrictEqual(undescribed, [],
    'every slot in src/slots.ts needs a line in ROOM_MEANING, or the forge prompt names a room it '
    + 'cannot explain');
  // And the other direction, or the map becomes a graveyard of rooms that no longer exist.
  const orphans = Object.keys(ROOM_MEANING).filter((s) => !ALL_SLOTS.includes(s));
  assert.deepStrictEqual(orphans, [], 'ROOM_MEANING describes rooms that are not in SLOTS');
  ok(`all ${ALL_SLOTS.length} rooms are described, and nothing describes a room that is gone`);
}

// The character prompt has to NAME the character rooms and must not offer a place's. A prompt that
// listed every slot would have a foreign model writing `atmosphere` onto a person, and the paste
// route would then drop it — a round trip that loses work and says nothing about why.
{
  const ch = FORGE.find((f) => f.key === 'character')!.prompt;
  const lo = FORGE.find((f) => f.key === 'location')!.prompt;
  for (const s of slotsFor('character')) assert.ok(ch.includes(`"${s.name}"`), `character prompt names ${s.name}`);
  for (const s of slotsFor('lore')) assert.ok(lo.includes(`"${s.name}"`), `place prompt names ${s.name}`);
  assert.ok(!ch.includes('"atmosphere"'), 'the character prompt must not offer a place\'s rooms');
  assert.ok(!lo.includes('"interiority"'), 'the place prompt must not offer a person\'s rooms');
  ok('each card prompt names its own kind\'s rooms and no other kind\'s');
}

// The register is QUOTED from prompts.ts, not restated. F36: a finished English sentence in a
// prompt comes back verbatim in the book, so a forged card is held to the rule a written one is.
{
  const { LEDGER_REGISTER } = await import('../src/prompts.ts');
  for (const k of ['character', 'location']) {
    assert.ok(FORGE.find((f) => f.key === k)!.prompt.includes(LEDGER_REGISTER),
      `the ${k} prompt must carry LEDGER_REGISTER itself, not a paraphrase of it`);
  }
  ok('both card prompts carry the app\'s own ledger register, from the same string');
}

// The voice prompt is the one place F37's finding is spent, so it has to carry the finding and not
// a summary of it: one rule per line, and a register line that names narration with the forms out.
{
  const v = FORGE.find((f) => f.key === 'voice')!.prompt;
  assert.match(v, /ONE RULE PER LINE/, 'the voice prompt must carry the per-line rule');
  assert.match(v, /NAME NARRATION/i, 'and the one about naming narration');
  // Not "the word JSON is absent" — both text prompts say "No JSON", and a check that forbade the
  // word would forbid the instruction that makes them work. What must be absent is the SHAPE.
  assert.match(v, /plain text/i, 'the voice prompt asks for text');
  assert.ok(!v.includes('"rooms"') && !v.includes('"kind":'),
    'and never hands over the card skeleton, which would get it answered as a card');
  const p = FORGE.find((f) => f.key === 'premise')!.prompt;
  assert.match(p, /TITLE:[\s\S]*GENRE:[\s\S]*PREMISE:/, 'the premise prompt states its three lines');
  ok('the text prompts ask for text, in a shape with named lines');
}

// ---- 2. the route answers everyone, with the same six prompts ----
{
  const mine: any = routes['GET /api/forge'](ctx({}, me, true));
  // The KEYS, not the count. A count passes when a prompt is replaced by a different one, and the
  // set is what the page and the paste both depend on.
  assert.deepStrictEqual(mine.prompts.map((p: any) => p.key),
    ['book', 'character', 'location', 'premise', 'voice', 'image'],
    'the six prompts, book first — it is the one that does everything at once');
  const hers: any = routes['GET /api/forge'](ctx({}, her, false));
  // NOT REFUSED, since 2026-08-31. It was the admin's workbench from 2026-08-30 until Seth tested
  // it as the second writer and reversed the call: "allow this to not only be for the admin. i
  // tested it. it can go to everyone." Asserted as the SAME prompts rather than merely as no
  // error, because a route that answered her an empty list would satisfy "no error" and still give
  // her a page with nothing on it.
  assert.ok(!hers.error, `the second writer is answered, not refused (${hers.error})`);
  assert.deepStrictEqual(hers.prompts.map((p: any) => p.key), mine.prompts.map((p: any) => p.key),
    'and gets the same six prompts the admin does — the list is static and names no story');
  ok('The Web answers every writer with the same six prompts');
}

// The whole-book prompt has to carry BOTH halves, or "one command" is a half command: every story
// field the wizard will fill, and the card shape for the cast. It is the only prompt that names the
// rooms of all four kinds, because the cast it asks for can be any of them.
{
  const b = FORGE.find((f) => f.key === 'book')!.prompt;
  for (const f of ['title', 'genre', 'premise', 'setting', 'pov', 'spice', 'persona',
                   'lockedCharacter', 'writingStyle', 'styleNote'])
    assert.ok(b.includes(`"${f}"`), `the book prompt names the ${f} field`);
  for (const k of ['character', 'lore', 'item', 'rule'])
    for (const sl of slotsFor(k)) assert.ok(b.includes(`"${sl.name}"`), `and ${k}'s ${sl.name} room`);
  assert.match(b, /ONE RULE PER LINE/, 'and carries F37 into the voice field it asks for');
  assert.ok(b.includes('"story"') && b.includes('"entries"'), 'and asks for both halves at once');
  ok('the whole-book prompt asks for every story field and every kind\'s rooms');
}

// ---- 3. the paste writes a card AND its rooms, which no other import path does ----
const paste = (text: string, o = me) => routes['POST /api/thread/paste'](ctx({ storyId: story.id, text }, o)) as any;

{
  const r = paste(JSON.stringify({
    kind: 'character', title: 'Ilva Marren',
    body: '[Ilva Marren: tide-clerk; counts what the sea returns; owes the Ambersand]',
    keys: ['Ilva', 'the clerk'], activation: 'triggered',
    rooms: {
      facts: { name: 'What is always true', body: '[thirty-one; left-handed; cannot swim]' },
      voice: { name: 'How she sounds', body: '[short sentences; answers a question with a question]' },
    },
  }));
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.made.length, 1);
  assert.strictEqual(r.made[0].rooms, 2, 'both rooms were written');
  const e: any = db.entriesOf(story.id).find((x: any) => x.title === 'Ilva Marren');
  assert.ok(e, 'the card is in the ledger');
  assert.strictEqual(e.activation, 'triggered', 'and it kept the activation it declared');
  assert.deepStrictEqual(JSON.parse(e.keys), ['Ilva', 'the clerk'], 'and its trigger words');
  const rooms = db.addonsOf(story.id).filter((a: any) => a.entry_id === e.id);
  assert.strictEqual(rooms.length, 2, 'the rooms hang on the card');
  assert.ok(rooms.some((a: any) => a.slot === 'voice' && /answers a question/.test(a.body)),
    'and carry what they said');
  ok('a pasted character lands with its rooms, its keys and its activation');
}

// A ROOM THAT KIND DOES NOT HAVE IS DROPPED AND NAMED, never coerced. Filing an invented room under
// `facts` would put text into every prompt about that card which the writer never agreed to.
{
  const r = paste(JSON.stringify({
    kind: 'item', title: 'the Silver Key',
    body: '[the Silver Key: brass, not silver; opens the lower archive vault]',
    rooms: { what_it_does: '[opens the lower archive vault and nothing else]',
             interiority: '[it dreams]' },
  }));
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.made[0].rooms, 1, 'only the room an item actually has');
  assert.ok(r.notes.some((x: string) => /interiority/.test(x) && /item/.test(x)),
    'and the one it does not is named in the notes rather than dropped in silence');
  const e: any = db.entriesOf(story.id).find((x: any) => x.title === 'the Silver Key');
  assert.ok(!db.addonsOf(story.id).some((a: any) => a.entry_id === e.id && a.slot === 'interiority'),
    'nothing was written under a room this kind does not have');
  ok('a room the kind does not have is dropped, and the writer is told which');
}

// A LIST, because forging a cast one card at a time is the chore this exists to remove. And a bare
// string room, because a model asked for {name, body} will hand back a string often enough.
{
  const r = paste(JSON.stringify([
    { kind: 'character', title: 'Kade Ashford', body: 'a creditor who is owed by everyone',
      rooms: { voice: '[short sentences]' } },
    { kind: 'lore', title: 'the Ambersand', body: '[the Ambersand: counting-house on the north bank]' },
  ]));
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.made.length, 2, 'both cards');
  const kade: any = db.entriesOf(story.id).find((x: any) => x.title === 'Kade Ashford');
  // #110 · A PLAIN DESCRIPTION (ADR 0008): a bare body is kept as it came, and is no longer wrapped.
  assert.strictEqual(kade.body, 'a creditor who is owed by everyone',
    'a bare body is kept plain, not wrapped into the bracket form');
  assert.ok(db.addonsOf(story.id).some((a: any) => a.entry_id === kade.id && a.slot === 'voice'),
    'and a room given as a bare string still lands');
  ok('a list of cards lands, and a loose shape is repaired rather than refused');
}

// WHAT IT WILL NOT DO. A kind that does not exist is refused outright — the four kinds are the
// database's, and inventing a fifth would write an entry_type nothing can render.
{
  const bad = paste(JSON.stringify({ kind: 'faction', title: 'The Quay Office' }));
  assert.ok(bad.error, 'an unknown kind is refused');
  assert.ok(!db.entriesOf(story.id).some((x: any) => x.title === 'The Quay Office'), 'and writes nothing');
  const notJson = paste('I would be delighted to help! Here is your character:');
  assert.match(notJson.error, /not JSON/, 'prose is refused as prose');
  const empty = paste('   ');
  assert.match(empty.error, /paste the JSON/, 'and an empty box says so');
  const noTitle = paste(JSON.stringify({ kind: 'character', body: '[: nobody]' }));
  assert.ok(noTitle.error, 'a card with no title is refused — the title IS the identity');
  ok('an unknown kind, prose, an empty box and a nameless card are all refused, and write nothing');
}

// A FENCE IS STRIPPED, because a model asked for bare JSON wraps it about a third of the time and
// re-prompting for a backtick is not a good use of anyone's evening.
{
  const r = paste('```json\n{"kind":"rule","title":"Vantic law","body":"[Vantic law: a debt survives the debtor]"}\n```');
  assert.ok(!r.error, r.error);
  assert.ok(db.entriesOf(story.id).some((x: any) => x.title === 'Vantic law'), 'the card landed');
  ok('a fenced answer is unwrapped rather than refused');
}

// THE PASTE IS NOT ADMIN-ONLY, and that is deliberate: the PAGE is a workbench, but a card in this
// shape is just a card. It is story-scoped, so the ordinary ownership gate is what protects it —
// asserted here from the far side, with the second writer's own book.
{
  const hers = db.createStory(her, { title: 'Her Book', premise: 'Hers.' });
  const r = routes['POST /api/thread/paste'](ctx(
    { storyId: hers.id, text: JSON.stringify({ kind: 'character', title: 'Someone' }) }, her, false)) as any;
  assert.ok(!r.error, 'the second writer may paste into her own book');
  assert.ok(db.entriesOf(hers.id).some((x: any) => x.title === 'Someone'), 'and it lands');
  ok('pasting is not a privilege — the format is open, the workbench is not');
}

// ---- 5. a whole book, pasted on the create page, keeps its cast's rooms ----
//
// The spark's own cast never carries rooms — the model that writes it is asked for a body and
// nothing else — so this path exists only for a book forged elsewhere. Dropping the rooms on the
// way in would make "one command" a half one, and nothing on screen would say so.
{
  const made: any = routes['POST /api/stories'](ctx({
    title: 'The Drowned Ledger', genre: 'noir', premise: 'A clerk counts what the sea returns.',
    writingStyle: 'Write the narration in past tense: she came up the stair.',
    persona: 'Sella Vane',
    entries: [{
      title: 'Sella Vane', entryType: 'character', activation: 'always_on',
      body: '[Sella Vane: tide-clerk; owes the Ambersand]', keys: ['Sella'],
      rooms: {
        facts: { name: 'What is always true', body: '[twenty-nine; cannot swim]' },
        voice: { name: 'How she sounds', body: '[short sentences; never explains twice]' },
        atmosphere: { name: 'Not her room', body: '[a person has no atmosphere]' },
      },
    }],
  }));
  assert.ok(made.id, 'the book was created');
  const e: any = db.entriesOf(made.id).find((x: any) => x.title === 'Sella Vane');
  assert.ok(e, 'and its cast with it');
  const rooms = db.addonsOf(made.id).filter((a: any) => a.entry_id === e.id).map((a: any) => a.slot).sort();
  assert.deepStrictEqual(rooms, ['facts', 'voice'], 'the rooms rode in with the cast');
  assert.ok((made.notes ?? []).some((x: string) => /atmosphere/.test(x)),
    'and the one a character has no business with was named, not coerced');
  // A pasted book's persona is the writer's — they chose to paste it — and nothing polices it.
  const st: any = db.getStory(made.id);
  assert.strictEqual(st.persona, 'Sella Vane', 'a pasted persona is the writer\'s and is not policed away');
  ok('a whole book pasted at once keeps its cast, their rooms, and its persona');
}

console.log(`\n${n} checks passed`);
