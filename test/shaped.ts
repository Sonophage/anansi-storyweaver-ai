// PLAIN TEXT IN, THE SCHEMA'S OBJECT OUT (Seth, 2026-10-30: "Let's use text during the hem and in the
// background we add it to the db after"). A remote model asked for JSON ran on inside it for minutes;
// asked for plain lines it stops. `textShape` says the shape a schema wants as lines, `fromText` reads
// the lines back into the object the JSON would have been. Pure, so this suite needs no model.
//
//   node --experimental-strip-types test/shaped.ts
import assert from 'node:assert';
process.env.ANANSI_DB ??= '/tmp/anansi-test-shaped.db';
const { textShape, fromText } = await import('../src/shaped.ts');
const { MEMORY_SCHEMA, EXTRACT_SCHEMA, retireSchema } = await import('../src/prompts.ts');

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };

// ---- the shape it asks for names every field, in the schema's order
{
  const shape = textShape(MEMORY_SCHEMA);
  assert.match(shape, /\[threads\]\nname: [\s\S]*stands: [\s\S]*label: [\s\S]*line: [\s\S]*always: [\s\S]*pockets: /,
    'SHAPE-FIELDS: a block per item, a line per field, in order');
  assert.match(shape, /overflow: /, 'SHAPE-LIST: a list of strings is one line');
  assert.doesNotMatch(shape, /\{|\}/, 'SHAPE-NO-JSON: no braces anywhere in what it asks for');
  ok('the shape names every field as a line, a block per item, and no JSON');
}

// ---- MEMORY read back
{
  const said = `[threads]
name: Envoy Sereth
stands: She has stopped waiting by the door.
label: stopped waiting
line: She did not look up when the bell rang.
always:
pockets: voice | How she sounds | Clipped now, every word counted.
pockets: appearance | As she is now | Gloves off.

[threads]
name: The stair
stands: Nobody climbs it.
label: abandoned
line: The stair stayed dark.
always: A stair with no landing.

overflow: Coyle; Vantic law`;
  const d = fromText(said, MEMORY_SCHEMA) as any;
  assert.strictEqual(d.threads.length, 2, 'MEMORY-ITEMS: two threads');
  assert.deepStrictEqual(d.threads[0], { name: 'Envoy Sereth', stands: 'She has stopped waiting by the door.',
    label: 'stopped waiting', line: 'She did not look up when the bell rang.', always: '',
    pockets: [{ slot: 'voice', name: 'How she sounds', body: 'Clipped now, every word counted.' },
      { slot: 'appearance', name: 'As she is now', body: 'Gloves off.' }] }, 'MEMORY-ITEM: every field, pockets as objects');
  assert.deepStrictEqual(d.threads[1].pockets, [], '  a thread with no pocket lines has none');
  assert.deepStrictEqual(d.overflow, ['Coyle', 'Vantic law'], 'MEMORY-LIST: a list line splits on ;');
  ok('a MEMORY answer in lines reads back as the object its JSON would have been');
}

// ---- EXTRACT, with an enum and a list
{
  const d = fromText(`[entries]
title: The bellringer
type: character
body: Rings the hour, never the alarm.
keys: bellringer; bell
activation: always_on
field: none
stands: On the tower stair.
pockets: voice | How he sounds | Hoarse.
[entries]
title: Bad kind
type: dragon
body: Not a kind.
keys:
activation: sometimes
field: none
stands:`, EXTRACT_SCHEMA) as any;
  assert.strictEqual(d.entries[0].type, 'character', 'EXTRACT-ENUM: an allowed value is kept');
  assert.deepStrictEqual(d.entries[0].keys, ['bellringer', 'bell'], '  a list too');
  assert.strictEqual(d.entries.length, 1, 'EXTRACT-ENUM-BAD: an item with a value its enum does not allow is dropped');
  ok('an EXTRACT answer reads back, and an item outside its enums is dropped');
}

// ---- RETIRE, enum built from the titles
{
  const d = fromText(`[finished]\ncard: The stair\nquote: Nobody climbed it again.`, retireSchema(['The stair', 'Coyle'])) as any;
  assert.deepStrictEqual(d.finished, [{ card: 'The stair', quote: 'Nobody climbed it again.' }], 'RETIRE: read back');
  ok('a RETIRE answer reads back against its titles');
}

// ---- what a model does instead
{
  const fenced = fromText('```\n[threads]\nname: A\nstands: B\nlabel: c\nline: d\nalways: e\n```\noverflow:', MEMORY_SCHEMA) as any;
  assert.strictEqual(fenced.threads.length, 1, 'TEXT-FENCE: a code fence around it is ignored');
  const cut = fromText('[threads]\nname: A\nstands: B\nlabel: c\nline: d\nalways: e\n\n[threads]\nname: Half', MEMORY_SCHEMA) as any;
  assert.strictEqual(cut.threads.length, 1, 'TEXT-CUT: an item cut off before its required fields is dropped, the whole ones kept');
  const caps = fromText('[Threads]\nName: A\nStands: B\nLabel: c\nLine: d\nAlways: e', MEMORY_SCHEMA) as any;
  assert.strictEqual(caps.threads[0]?.name, 'A', 'TEXT-CASE: a field name in another case still reads');
  const wrapped = fromText('[threads]\nname: A\nstands: She waits by the door,\n  gloved, and does not look up.\nlabel: c\nline: d\nalways: e', MEMORY_SCHEMA) as any;
  assert.strictEqual(wrapped.threads[0]?.stands, 'She waits by the door, gloved, and does not look up.', 'TEXT-WRAP: a value wrapped onto a second line is joined');
  const none = fromText('Nothing changed in this scene.', MEMORY_SCHEMA) as any;
  assert.deepStrictEqual(none, { threads: [], overflow: [] }, 'TEXT-NONE: no blocks reads as none, not as a failure');
  ok('a fence, a cut, a capital and an answer of no blocks all read sensibly');
}

console.log(`\n${n} checks passed`);
