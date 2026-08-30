// Anansi's structured routes against a fake llama-server: /api/talk, whose answer must not be cut
// off and whose promised room must be the room it is given, /api/invent, which must never write,
// and /api/spark, whose premise and prose voice have to come back big enough to write from.
//
// Driven against a FAKE llama-server, because both bugs are about numbers on the wire rather than
// about anything the real model would say. What the real model DID say is written down in
// P0-FINDINGS F25: the grammar closed the reply at exactly 1,400 characters, mid-word, with the
// JSON still valid — a truncated answer that arrives looking like a finished one.
//
//   node --experimental-strip-types test/talk.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-talk.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

// Longer than the cap that used to be on the field, and it must arrive whole.
const LONG = ('The story is about penance. ').repeat(110).trim();
// A spark's two long fields, at the length the prompt now asks for: a premise of four to six
// sentences and about a hundred words of prose voice. Both must survive the round trip whole.
const PREMISE = ('Aldis owes the moneylender more than he can pay. ').repeat(5).trim();
const VOICE = ('Short sentences, and the weather does the feeling. ').repeat(14).trim();
// A chapter's beat, at the length its prompt asks for: three to six sentences of instruction.
const NOTE = ('By the end the debt has to be called in. ').repeat(4).trim();

let calls: any[] = [];
let breakFirst = false;   // answer the first call with a truncated object, as running out of room does
const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    calls.push(b);
    const cut = breakFirst && calls.length === 1;
    // Answer by the shape of the schema asked for, the same way test/mend.ts does: an outfit wants
    // a name and a body, a ledger entry wants a title and keys, everything else is a reply.
    const props = b.response_format?.json_schema?.schema?.properties ?? {};
    // Keyed on the QUESTION, not on the schema: TALK_SCHEMA always carries `strings` now, so a
    // schema-shaped check made every answer the short one and broke the truncation assertions.
    const asksForStrings = /set up and not paid/.test(String(b.messages?.[1]?.content ?? ''));
    // "Remember this" wants the same SHAPE as an invented entry — title, body, keys — so the
    // schema cannot tell them apart. Keyed on the question, like the strings case above, and with
    // its own title: the proposals table dedupes on the subject, so two roles answering with one
    // name would make the second look like a refusal rather than a duplicate.
    const asksToRemember = /REMEMBER IT:/.test(String(b.messages?.[1]?.content ?? ''));
    const answer = props.premise ? { title: 'The Rust Year', premise: PREMISE, genre: 'noir, gothic',
        setting: 'Sutera', pov: 'third limited, past tense', spice: 2, writingStyle: VOICE,
        characters: [{ name: 'Vel', role: 'the Murmur', description: 'Speaks for the dead god.' },
                     { name: 'Aldis', role: 'a debtor', description: 'Owes more than he can pay.' }] }
      : asksForStrings ? { reply: 'Two things are owed.',
        strings: [{ title: 'The letter he has not opened', body: 'Sent by his brother', fromChapter: 6 }] }
      : props.title && props.note ? { title: 'The Rust Year', note: NOTE }
      : asksToRemember ? { title: 'The Broken Stair',
          body: '[the lower stair: tread gave under her weight, rail came away, unrepaired]',
          keys: ['stair', 'rail'] }
      // NAME BEFORE KEYS, and the order is load-bearing. An addon's schema is name + body + keys
      // (PLAN-08: a room fires on its own words, so the shape has to be able to carry them), and
      // a card's is title + body + keys. `props.keys` alone no longer tells them apart — checked
      // first, it answered every addon with a card and the wardrobe form filled with nothing.
      : props.name ? { name: 'Mourning grey', body: '[wearing: grey, unpinned, no scripture showing]',
                       keys: ['mourning', 'grey'] }
      : props.keys ? { title: 'The Rust Choir', body: '[The Rust Choir: a congregation]',
                                  keys: ['choir', 'rust'] }
      : { reply: LONG };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: cut
        ? JSON.stringify(answer).slice(0, 900)      // truncated mid-object, unparseable
        : JSON.stringify(answer) } }],
      usage: { prompt_tokens: 400, completion_tokens: 900 } }));
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { TALK_SCHEMA } = await import('../src/prompts.ts');

const me = db.owner('talker');
const story = db.createStory(me, { title: 'Sutera', premise: 'A city on a dead god.' });
db.upsertEntry(story.id, me, { title: 'Vel', body: 'Vel is the Murmur.', activation: 'always_on' });
db.addPassage({ ...story, storyId: story.id, body: 'The lower tiers still pulse.' });
// A passage with a line of dialogue in it, for "remember this": what the narrator commits is a
// fact, and what a character says is not — the rule extract and remember already follow.
const SPOKEN_LINE = 'I never went down there';
db.addPassage({ ...story, storyId: story.id,
  body: `The stair gave under her weight and the rail came away in her hand. "${SPOKEN_LINE}," she said.` });

const ask = async (perSlot: number) => {
  calls = [];
  return routes['POST /api/talk']({
    body: { storyId: story.id, said: 'What is this story about? The long answer, please.' },
    query: new URLSearchParams(), owner: me,
    slot: { global: perSlot * 2, slots: 2, perSlot },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {},
  } as any);
};

let n = 0;
// Message only — assertions run inline above. db.ts, engine.ts and stream.ts take a callback and
// call it; passing one to THIS `ok` would print a green check for a body that never ran. Refused
// rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

// ---- 1. the grammar no longer holds a bound on the answer
assert.ok(!('maxLength' in (TALK_SCHEMA.properties.reply as any)),
  'a maxLength on reply closes the string mid-word and the JSON stays valid — the answer arrives '
  + 'truncated and looking finished');
// The fields that ARE short keep their bounds: an unbounded string is where a reasoning model
// writes an essay (F18), and those are the fields where that is a defect rather than the answer.
assert.strictEqual((TALK_SCHEMA.properties.directive as any).maxLength, 400);
assert.strictEqual((TALK_SCHEMA.properties.entries as any).items.properties.body.maxLength, 600);
ok('the reply is unbounded and the fields that are not the answer still are not');

// ---- 2. a long answer arrives whole
const wide = await ask(50_048);
assert.ok(!wide.error, wide.error);
assert.strictEqual(wide.reply.length, LONG.length,
  `the whole answer, not the first ${wide.reply.length} characters of it`);
assert.match(wide.reply, /penance\.$/, 'and it ends where the model stopped, not where a cap did');
ok(`a ${LONG.length}-character answer is not truncated on the way through`);

// ---- 3. the room reserved is the room spent
// It assembled the prompt against 900 tokens of reserved output and then asked for 1,600. The
// prompt was budgeted for a smaller answer than the one requested, so on a long story the slot
// could be oversubscribed — and this server does not queue an overflow, both writers sharing the
// cache get a 500.
const wire = Number(calls[0].max_tokens);
assert.ok(wire > 900, `the call asks for ${wire} tokens, so 900 cannot be what was reserved`);
const P = wide.tokens;
// budgetFor: cap - max(600, reserved) - 6% of cap, and the guard refuses when the prompt exceeds it.
const budget = (cap: number, reserved: number) =>
  Math.max(0, cap - Math.max(600, reserved) - Math.floor(cap * 0.06));
// A slot with room for the prompt plus 900 of reply, but not the prompt plus what is really asked.
// Reserving 900 and spending `wire` looks fine here; reserving `wire` refuses, which is correct.
let cap = 0;
for (let c = P; c < P * 4 + 20_000; c++)
  if (budget(c, wire) < P && P <= budget(c, 900)) { cap = c; break; }
assert.ok(cap, `no slot size separates the two reservations at a ${P}-token prompt`);
const tight = await ask(cap);
assert.ok(tight.error, `a ${cap}-token slot has no room for a ${P}-token prompt plus ${wire} of reply, `
  + 'and must refuse rather than ask for it anyway');
assert.ok(!tight.reply, 'and nothing is said');
ok(`the prompt is budgeted against the ${wire} tokens the call actually asks for`);

// ---- 4. the retry asks for MORE room, never less
// The failure being retried is an object that ran out of room. structuredRetry used a flat 2,000,
// so a caller already asking for more than that was retried with LESS and the retry could only fail
// harder — which is exactly the caller this file is about, now that it asks for 2,400.
breakFirst = true;
const retried = await ask(50_048);
breakFirst = false;
assert.strictEqual(calls.length, 2, 'an unparseable object is retried once');
assert.ok(!retried.error, retried.error);
assert.ok(Number(calls[1].max_tokens) > Number(calls[0].max_tokens),
  `the retry asked for ${calls[1].max_tokens} against the first call's ${calls[0].max_tokens}`);
assert.strictEqual(retried.reply.length, LONG.length, 'and the second answer arrives whole');
ok(`the retry raises the budget (${calls[0].max_tokens} then ${calls[1].max_tokens}), it does not lower it`);

// ---- 5. invent hands back a draft and writes nothing to the ledger
const invent = (o: any) => { calls = []; return routes['POST /api/invent']({
  body: { storyId: story.id, ...o }, query: new URLSearchParams(), owner: me,
  slot: { global: 100_096, slots: 2, perSlot: 50_048 },
  gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any); };

const before = db.entriesOf(story.id).length;
const vel = db.entriesOf(story.id).find((e: any) => e.title === 'Vel');

const dressed: any = await invent({ kind: 'outfit', entryId: vel.id, direction: 'she is in mourning' });
assert.ok(!dressed.error, dressed.error);
assert.strictEqual(dressed.outfit.name, 'Mourning grey');
assert.match(dressed.outfit.body, /^\[wearing:/, 'a ledger entry, not prose');
assert.strictEqual(db.outfitsOf(story.id, vel.id).length, 0,
  'the outfit is a draft for the Wardrobe form — pressing Add is still the writer\'s');
// The writer's own line outranks the canon, so it has to actually reach the model.
assert.match(String(calls[0].messages[0].content), /she is in mourning/,
  'the direction is in the prompt, or the button did nothing with what they typed');
ok('an invented outfit comes back as two fields and nothing is worn');

// PLAN-08. Every slot invents the same way an outfit did, and an addon carries its own trigger
// words — a room the writer has to key by hand is a room that mostly never fires.
assert.strictEqual(dressed.addon.slot, 'outfit', 'the answer says which room it is for');
assert.deepStrictEqual(dressed.addon.keys, ['mourning', 'grey']);
const spoken: any = await invent({ kind: 'voice', entryId: vel.id, direction: 'she is short with people' });
assert.ok(!spoken.error, spoken.error);
assert.strictEqual(spoken.addon.slot, 'voice', 'a voice is invented the same way a coat is');
const nowhere: any = await invent({ kind: 'voice', direction: 'no card named' });
assert.match(String(nowhere.error), /needs a card to belong to/,
  'an addon with no card is refused — the model cannot write a voice for nobody');
ok('every slot invents the way an outfit does, and an addon comes back with its own keys');

const thread: any = await invent({ kind: 'lore', direction: 'a rival congregation' });
assert.ok(!thread.error, thread.error);
assert.strictEqual(thread.proposed, 1);
assert.strictEqual(thread.title, 'The Rust Choir');
assert.strictEqual(db.entriesOf(story.id).length, before,
  'an invented thread is a PROPOSAL — the ledger is untouched until it is accepted');
assert.ok(db.proposalsOf(story.id).some((p: any) => p.title === 'The Rust Choir'),
  'and it is in the queue with everything else Anansi offers');
ok('an invented thread lands in the proposals queue, not in the ledger');

// ---- 5b. an invented entry is a jumping-off point, and it has the room to be one
// Seth's spec, verbatim: "it doesnt have to be a single sentence, it also doesnt have to be three
// paragraphs. it should be written in a way where the ai can use it to write but not say things
// verbatim, a jumping off point for it." Two halves that regress independently — the prompt can go
// back to asking for forty words, or the ceiling can go back to the room forty words needed — so
// both are asserted, and the ceiling is read off THE WIRE rather than from the constant.
{
  const said = String(calls[0].messages[0].content);
  // The band the prompt asks for, read OUT of the prompt, and the room that band needs, read off
  // THE WIRE. Tying the two together is the point: the pair regresses independently, and asking
  // for more words inside a ceiling cut for fewer is how F25 happened — valid JSON, closed
  // mid-thought, looking finished.
  const band = said.match(/(?:a )?hundred and twenty to two hundred words/i)
    ?? said.match(/(\w+ )+to (\w+ )+words/i);
  assert.ok(band, 'the prompt must state a word band for the body, or the model decides for itself');
  assert.ok(Number(calls[0].max_tokens) >= 2000,
    `a 200-word body is asked for in ${calls[0].max_tokens} tokens. A body that runs out of room `
    + 'truncates the OBJECT rather than the string, so it does not parse, and the retry costs '
    + 'another whole call at ~7s. Raise the ceiling with the ask, in the same commit.');
  // The FLOOR, not the wording. This asserted the exact phrase "not one sentence, and not three
  // paragraphs" until 2026-08-27 and went red when the band was widened — the same way ritual.js
  // went red for wording that had been renamed under it. What must be true is that the prompt
  // refuses a one-liner, because a ceiling on its own is what made the bodies one line.
  assert.match(said, /not one sentence/i,
    'the prompt has to name the FLOOR as well as the ceiling — a ceiling on its own is what made '
    + 'the bodies one line');
  assert.match(said, /never say it back word for word/,
    'and it has to say the body is material to write from rather than a line to quote');
  // F27, still open and not to be made worse: the prompt forbids keys that repeat the title.
  assert.match(said, /Not the title again/,
    'the keys instruction that F27 says the model still sometimes ignores must not go missing '
    + 'while the body is being widened');
  ok('an invented entry is asked for as a jumping-off point, in the room one needs');
}

const junk: any = await invent({ kind: 'weapon' });
assert.match(junk.error ?? '', /nothing called/, 'and a kind nobody defined is refused by name');
ok('a kind that does not exist is refused rather than assembled');

// ---- 6. Anansi's strings ride the same queue as everything else it offers
{
  calls = [];
  const said: any = await routes['POST /api/talk']({
    body: { storyId: story.id, said: 'What has this story set up and not paid off?' },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
  assert.ok(!said.error, said.error);
  assert.strictEqual(said.proposed, 1, 'the string is proposed, not written');
  const p = db.proposalsOf(story.id).find((x: any) => x.entry_type === 'string');
  assert.ok(p, 'and it is in the SAME queue as every other offer — a second queue is a second '
    + 'place to forget to look');
  assert.strictEqual(db.stringsOf(story.id).length, 0, 'nothing is a string until it is accepted');

  // Accepting one makes a STRING, not an entry. They are different tables on purpose.
  const before = db.entriesOf(story.id).length;
  await routes['POST /api/proposal']({ body: { storyId: story.id, id: p.id, accept: true },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {} } as any);
  const made = db.stringsOf(story.id);
  assert.strictEqual(made.length, 1, 'accepting it ties the string');
  assert.strictEqual(made[0].title, 'The letter he has not opened');
  assert.strictEqual(made[0].from_chapter, 6, 'carrying the chapter it was set up in');
  assert.strictEqual(made[0].summoned, 0, 'and out of play, like every string');
  assert.strictEqual(db.entriesOf(story.id).length, before, 'and it is not an entry');
  ok("Anansi's strings go to the proposals queue, and accepting one ties a string not an entry");
}

// (6·0 was six assertions on the RELEASE prompt — what the release-notes writer had to leave out,
// and the ban on stating an outcome the commit log never stated. Removed 2026-08-29 with #24: the
// prompt is gone, because what changed is read from docs/WHATS-NEW.md rather than written by a
// model. `test/app.ts` checks the parser that replaced it.)

// ---- 6a. "remember this": a passage the writer points at, turned into a thread
//
// The writer's own recall. PLAN-06 argues against another retrieval tier and the argument is that
// a keyword or vector layer GUESSES — there is no guess here, the writer points. What is asserted
// is what the model is SHOWN, that it arrives as an instruction rather than as prose, and that it
// lands in the QUEUE with the chapter it came from rather than in canon.
{
  const { MEMO } = await import('../src/prompts.ts');
  calls = [];
  const memo = (passageId: string) => routes['POST /api/memo']({
    body: { storyId: story.id, passageId },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900 }, setGen: () => {}, defaultModel: null } as any) as any;

  const target = db.passagesOf(story.id).filter((p: any) => !p.is_break).at(-1) as any;
  const before = db.proposalsOf(story.id).length;
  const r = await memo(target.id);
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.proposed, 1, 'it proposes exactly one thread');

  // A PROPOSAL, carrying where it came from. Nothing is canon until it is accepted — the rule the
  // ledger queue has always had, and the reason this is safe to offer on any passage.
  const open = db.proposalsOf(story.id);
  assert.strictEqual(open.length, before + 1, 'and it goes in the queue');
  const made = open.find((x: any) => x.title === r.title) as any;
  assert.ok(made, 'the thread is in the queue by name');
  assert.ok(made.chapter_id, 'carrying the chapter it came from, which is what makes it auditable');
  assert.ok(!db.entriesOf(story.id).some((e: any) => e.title === r.title),
    'and nothing became canon');

  // AN INSTRUCTION, not prose. This is the whole reason it cannot be read as dialogue or as a
  // scene: Seth's "autoselecting the direct option", borrowed as a rule rather than as a mode.
  const shown = String(calls[0].messages[1].content);
  assert.match(shown, /REMEMBER IT:/, 'the passage arrives labelled as something to remember');
  assert.match(MEMO, /NOT a scene to continue/, 'and the role says it is not prose to carry on from');
  assert.match(MEMO, /NOT a line anybody is speaking/, 'nor a line somebody said');
  // F36, by construction: a passage IS finished English, so a role that let it through as-is would
  // be an F36 generator.
  assert.match(MEMO, /WRITE IT AS FACTS, NOT AS PROSE/,
    'and it must turn the passage into facts, or the prose goes back into the book word for word');
  // Narration only, like extract and remember: a character lying did not make it true.
  assert.ok(!shown.includes(SPOKEN_LINE),
    'a line of dialogue in the passage must not reach the ask');
  ok('a passage the writer points at becomes a thread in the queue, as facts and as an instruction');
}

// ---- 6b. a chapter names itself when it opens
//
// The last item from round four's list. A chapter opened on two blank fields, and the author's
// note is the one thing in this app that rides near the generation point on EVERY call — so an
// empty one is the strongest lever in the engine left unused. What is asserted here is what the
// model is SHOWN and what is done with what it says; whether the name is any good is not a
// question a fake can answer.
{
  const { CHAPTER } = await import('../src/prompts.ts');
  calls = [];
  const propose = () => routes['POST /api/chapter/propose']({
    body: { storyId: story.id, chapterId: db.chapters(story.id).at(-1)!.id },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900 }, setGen: () => {}, defaultModel: null } as any) as any;

  const r = await propose();
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.title, 'The Rust Year', 'the proposed name comes back');
  assert.strictEqual(r.note, NOTE, 'and the beat arrives whole, not clipped to a line');

  // PROPOSES, writes nothing. The rule the spark and the ledger queue already follow, and the
  // reason this is safe to fire on its own when a chapter opens.
  const ch = db.chapters(story.id).at(-1) as any;
  assert.ok(!ch.title || ch.title !== 'The Rust Year', 'proposing must not write the title');
  assert.ok(!ch.authors_note, 'and must not write the note');

  const shown = String(calls[0].messages[1].content);
  assert.match(shown, /NAME CHAPTER \d+/, 'the model is told which chapter it is naming — F33 is '
    + 'that it cannot work this out for itself');
  assert.match(shown, /THE BOOK:/, 'and given the book to name it out of');
  assert.match(CHAPTER, /has not been written yet/,
    'the prompt has to say the chapter is unwritten, or it summarises the one before it');
  assert.match(CHAPTER, /note   Three to six sentences/,
    'and name a length for the beat, or it comes back as a line — the whole failure being fixed');
  ok('a chapter proposes its own name and beat, and writes neither');
}

// ---- 7. the spark's premise and prose voice come back big enough to write from
// They were "two or three sentences" and "one sentence" — thinner than the manual form on the same
// screen asks for, so the skeleton had to be rewritten before the first passage. Three things can
// regress here on their own: the prompt asking for a line again, the room it is asked for in, and
// the retry that a longer answer makes worth having. All three are asserted.
{
  const { SPARK, SPARK_SCHEMA } = await import('../src/prompts.ts');
  calls = [];
  const spark = (idea: string) => routes['POST /api/spark']({
    body: { idea }, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any) as any;

  const skel = await spark('A broke ex-sergeant owes a moneylender more than he can pay.');
  assert.ok(!skel.error, skel.error);
  assert.strictEqual(skel.story.premise, PREMISE,
    'the premise arrives whole — a cap on the field would close it mid-word with the JSON still '
    + 'valid, which is F25 and would look like a finished answer');
  assert.strictEqual(skel.story.writingStyle, VOICE, 'and so does the voice of the weave');

  assert.ok(Number(calls[0].max_tokens) >= 3400,
    `the spark is asked for in ${calls[0].max_tokens} tokens. Since 2026-08-27 it asks for an `
    + 'eight-to-twelve-sentence premise, a four-to-eight-sentence setting, a hundred words of voice '
    + 'and up to five characters at forty to eighty words each — roughly 800 words, and JSON with '
    + 'escaping runs near two tokens a word. Raise the ceiling with the ask, in the same commit.');

  // EVERY field the writer starts from has to name a length, and the lengths are read out of the
  // prompt rather than pinned as phrases: this asserted "premise is four to six sentences"
  // verbatim and went red the moment Seth asked for more detail, which is wording rot, not a
  // regression. What must be true is that each of the four names a band at all — a field with no
  // length comes back as a line, which is the failure being fixed.
  for (const [what, re] of [
    ['the premise', /premise is \w+ to \w+ sentences/],
    ['the setting', /setting is \w+ to \w+ sentences/],
    ['each character', /description is \w+ to \w+ words/],
    ['the voice', /a hundred words or so, not a label/],
  ] as const) assert.match(SPARK, re,
    `${what} needs a length worth filling, or the model gives it a line`);
  // And a floor is only a floor if it is said to be one.
  assert.match(SPARK, /floor\s+as much as a ceiling/i,
    'the prompt has to say the bands are minimums too — every one of them was read as a ceiling '
    + 'and answered at the bottom of the range');
  for (const [what, re] of [
    ['a premise is not a blurb', /not a\s+blurb\.\s+No marketing language, no rhetorical questions/],
    ['the voice describes prose, not genre', /description of PROSE/],
    ['spice is inferred, 2 with no signal', /use 2 when there is no signal/],
    ['genre is two or three comma-separated tags', /comma-separated list of two or three tags/],
  ] as const) assert.match(SPARK, re, `${what} — kept from the version this replaced`);
  // tidyGenre already splits, trims and de-duplicates on the way in. The prompt must not pay for
  // that work twice; it says the shape it wants and stops.
  assert.doesNotMatch(SPARK, /lower ?case|de-?duplicat/i,
    'genre normalisation is db.tidyGenre\'s job and test/db.ts proves it');
  assert.ok(!('maxLength' in (SPARK_SCHEMA.properties.premise as any))
         && !('maxLength' in (SPARK_SCHEMA.properties.writingStyle as any)),
    'and neither long field may be capped in the grammar');
  ok('the spark asks for a premise and a voice worth writing from, in the room they need');

  // A longer answer is a likelier truncation, so this was the last caller still on `structured`
  // with no retry: an object that ran out of room came back as "the spark returned nothing usable".
  breakFirst = true; calls = [];
  const again = await spark('A broke ex-sergeant owes a moneylender more than he can pay.');
  breakFirst = false;
  assert.strictEqual(calls.length, 2, 'a truncated skeleton is retried once');
  assert.ok(!again.error, again.error);
  assert.strictEqual(again.story.premise, PREMISE, 'and the second answer arrives whole');
  ok('a spark that runs out of room is retried rather than handed back as nothing usable');
}

srv.close();
console.log(`\n${n} checks passed`);
