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

// ---- 2. the route is the admin's, and says so rather than answering empty ----
{
  const mine: any = routes['GET /api/forge'](ctx({}, me, true));
  assert.strictEqual(mine.prompts.length, 5, 'five prompts');
  const hers: any = routes['GET /api/forge'](ctx({}, her, false));
  assert.ok(hers.error, 'the second writer is refused');
  assert.ok(!hers.prompts, 'and gets no prompts at all');
  // REFUSED, NOT EMPTIED. "You are not the admin" and "there is nothing here" are different answers
  // and a page that cannot tell them apart reports the feature as broken.
  ok('the forge answers the admin and refuses everyone else by name');
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
      rooms: { role: '[the one the debt is owed to]' } },
    { kind: 'lore', title: 'the Ambersand', body: '[the Ambersand: counting-house on the north bank]' },
  ]));
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.made.length, 2, 'both cards');
  const kade: any = db.entriesOf(story.id).find((x: any) => x.title === 'Kade Ashford');
  // The bracket form is the convention every card in this app carries, and a body that arrives as
  // plain prose is a formatting miss rather than a bad card — so it is wrapped, not refused.
  assert.match(kade.body, /^\[Kade Ashford: a creditor who is owed by everyone\]$/,
    'a bare body is wrapped into the bracket form rather than refused');
  assert.ok(db.addonsOf(story.id).some((a: any) => a.entry_id === kade.id && a.slot === 'role'),
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

console.log(`\n${n} checks passed`);
