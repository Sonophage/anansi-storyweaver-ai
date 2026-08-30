// The unified surface, booted against a stub DOM and canned API responses that match the REAL
// shapes from src/story.ts and src/routes.ts. This exists because twenty-one field names in
// web/app.js were wrong on the first pass — guessed rather than read — and every one of them
// would have rendered the string "undefined" into the page instead of throwing.
import assert from 'node:assert';

let n = 0;
// `ok` here takes a MESSAGE ONLY — assertions run inline above it. `test/db.ts`, `test/engine.ts`
// and `test/stream.ts` take a callback and call it, so the same name means two things across the
// eleven suites. Passing a callback to this one counts a green check for a body that never ran,
// which is the "guarded assertion that stops running and still reports green" this project has
// already been bitten by four times. It was written that way once on 2026-08-28 and only the
// falsification pass caught it — three deliberate breakages of the code under test, all green.
// So it refuses a second argument now instead of swallowing it.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}". Its body would never run and the check would print green. `
    + `Put the assertions inline above the ok(), the way the rest of this file does.`);
  n++; console.log(`  ok  ${m}`);
};

// ---- the smallest DOM these render functions actually touch ----
const nodes = new Map<string, any>();
const el = (id: string) => {
  const o: any = {
    id, innerHTML: '', textContent: '', hidden: false, value: '', scrollTop: 0,
    scrollHeight: 0, clientHeight: 0, style: {}, dataset: {},
    // The reading pane toggles `scrolled` on itself so the running head can appear once the
    // chapter's band has gone by.
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    // Attributes are read back by the checks, so they are stored rather than swallowed: the
    // context meter carries its state on aria-expanded and data-ctxopen, and a stub that dropped
    // them would let a meter that never opens pass.
    attrs: {} as Record<string, string>,
    setAttribute(k: string, v: string) { o.attrs[k] = String(v); },
    getAttribute: (k: string) => o.attrs[k] ?? null,
    addEventListener() {}, focus() {}, closest: () => null,
    querySelectorAll: () => [], querySelector: () => null,
  };
  nodes.set(id, o); return o;
};
for (const id of ['rail', 'bar', 'appearance', 'read', 'col', 'page', 'dock', 'dockCol',
                  'side', 'sideHead', 'sideBody', 'toast', 'scrim', 'input', 'q', 'idea',
                  // The context meter, the reading it opens, and the speaker strip. All three sit
                  // OUTSIDE the two elements their draw functions used to write into.
                  'ctxbar', 'ctxread', 'asRow', 'runhead']) el(id);

const listeners: Record<string, Function[]> = {};
(globalThis as any).document = {
  // `style.setProperty` because applyLook writes every theme token onto <html> as a custom
  // property now — the nine themes are derived from a table rather than nine blocks of CSS.
  documentElement: { dataset: {}, style: { setProperty() {} } },
  getElementById: (id: string) => nodes.get(id) ?? el(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (k: string, f: Function) => { (listeners[k] ??= []).push(f); },
};
// A real one, because what the app CACHES is now part of what is being tested: the default, and
// never the look of whichever book happens to be open.
const stored = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => { stored.set(k, String(v)); },
};
(globalThis as any).matchMedia = () => ({ matches: false, addEventListener() {} });
(globalThis as any).window = { addEventListener() {} };
(globalThis as any).location = { hash: '', pathname: '/' };
(globalThis as any).history = { replaceState() {} };
// #17. The draw path keeps the bytes it fetched, so picking one costs no second request. Object
// URLs are the browser's, not node's — a counter is enough to tell one blob from another and to
// prove the revoke happens.
let objN = 0;
const LIVE_OBJ = new Set<string>();
(globalThis as any).URL.createObjectURL = (b: any) => {
  const u = `blob:anansi/${++objN}/${b?.from ?? ''}`; LIVE_OBJ.add(u); return u;
};
(globalThis as any).URL.revokeObjectURL = (u: string) => { LIVE_OBJ.delete(u); };

// ---- canned server, shaped exactly like the routes ----
const SLOT = { global: 100096, slots: 2, perSlot: 50048 };
// The slot list the server ships from `src/slots.ts`. Imported rather than retyped, because a
// second copy here would let the tray and the database disagree and the check would still pass.
const { SLOTS } = await import('../src/slots.ts');

const STORY = {
  id: 's-1', model: 'write-nt-qwen36-h', slot: SLOT, slots: SLOTS,
  gen: { temperature: 0.85, top_p: 0.95, max_tokens: 900 },
  // This book has a look of its own, and only a THEME. The rest has to come from the writer's
  // default — a book that pinned all four would pass a check that a book that pins one would not.
  look: { theme: 'ink' },
  story: { title: 'The Ashfall Concordat', genre: 'political fantasy', premise: 'Six houses.',
           setting: 'Ashfall Hall', pov: 'third limited, past tense', persona: 'Ilva Marren',
           writingStyle: 'Cold, spare.', direction: 'She signs, or she burns the hall.',
           spice: 3, status: 'in_progress', 
           // This book asks for its cover at the head of each chapter, which is what makes the
           // plate render at all. Off is the default everywhere else, so the check below is
           // testing the switch rather than the absence of one.
           chapterHero: true },
  // The moment the cover was set, which is the cache key the immutable URL is built on. Never the
  // bytes: the shelf and the plate are both told only when it changed.
  cover: 1756300000,
  chapters: [{ id: 'c-1', index: 1, title: 'Ashfall', summary: 'Ilva arrives.', authorsNote: 'Tense.',
               status: 'closed', coversThrough: 4, summaryStale: false, keepWhole: false },
             { id: 'c-2', index: 2, title: 'The Envoy', summary: null, authorsNote: null,
               status: 'open', coversThrough: null, summaryStale: false, keepWhole: false }],
  currentChapter: { id: 'c-2', index: 2, title: 'The Envoy', summary: null, authorsNote: null,
                    status: 'open', coversThrough: null, summaryStale: false, keepWhole: false },
  branchId: 'b-1',
  branches: [{ id: 'b-1', name: 'main', parentId: null, forkOrdinal: null, isPrimary: true, active: true }],
  passages: [
    { id: 'p-1', ordinal: 1, body: 'The hall smells of cold iron.', author: 'model', speaker: null,
      isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-1', selected: true }] },
    { id: 'p-2', ordinal: 2, body: '"You came alone."', author: 'model', speaker: 'Envoy Sereth',
      isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-2', selected: true }] },
    { id: 'p-3', ordinal: 3, body: '"I came alone because."', author: 'human', speaker: null,
      isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-3', selected: true }] },
    // Narrate: the writer's OWN prose. A human passage that is not a line of dialogue.
    { id: 'p-4', ordinal: 4, body: 'The rain had stopped, and she counted the bells.', author: 'human',
      speaker: null, isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-4', selected: true }] },
    // Speak as someone other than the persona — the case the `speaker` column exists for.
    { id: 'p-5', ordinal: 5, body: 'Get out of the doorway.', author: 'human', speaker: 'Envoy Sereth',
      isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-5', selected: true }] },
  ],
  // #22 §6 and §8. TWO ROOMS, ONE ON AND ONE OFF, and a finished card — the three states the
  // face has to tell apart. A fixture where every room is on cannot see the split, and one with
  // no finished card cannot see where the marker and the control ended up.
  entries: [{ id: 'e-1', title: 'Envoy Sereth', body: '[speaks for Kesh]', entryType: 'character',
              activation: 'always_on', keys: [], lastEditor: 'human', states: [], notes: '',
              addons: [
                { id: 'a-on', slot: 'voice', name: 'How she sounds', body: 'Flat, unhurried.',
                  keys: [], active: true },
                { id: 'a-off', slot: 'interiority', name: 'What she wants', body: 'To go home.',
                  keys: ['home'], active: false }] },
            { id: 'e-done', title: 'Coyle', body: '[a runner, dead]', entryType: 'character',
              activation: 'triggered', keys: ['Coyle'], lastEditor: 'human', states: [], notes: '',
              retiredAtChapter: 2, addons: [] }],
  pins: [], arcs: [],
  // What the engine computes in story.ts: the counts the shelf reads, and the stale summaries,
  // which are the part that can be waved away. The panel gates on this being present at all.
  waiting: { proposals: 2, strings: 1, flags: 1,
             stale: [{ id: 'c-1', index: 1, title: 'Ashfall', ref: 'hash-1' }] },
  violations: [{ id: 'v-1', passageId: 'p-2', entryId: 'e-1', quote: 'x', reason: 'gloves', confidence: 0.8 }],
  strings: [{ id: 'st-1', title: 'The letter he has not opened', body: 'Sent by his brother',
              fromChapter: 1, owedBy: 4, status: 'open', summoned: false }],
  proposals: [{ id: 'pr-2', entryId: null, title: 'The debt nobody has called in',
                body: 'Marek has not asked yet.', entryType: 'string', keys: ['2'], kind: 'new',
                delta: 'A promise, unpaid', chapterId: 'c-2' },
              { id: 'pr-1', entryId: null, title: 'Witness rite', body: 'A signature is void.',
                entryType: 'lore', keys: [], kind: 'new', delta: 'New fact.', chapterId: 'c-2' },
              // One of each other kind, so the chips have something to separate and Add all has
              // something it must NOT offer to.
              { id: 'pr-3', entryId: 'e-1', title: 'Aldis', body: 'She is thinner now.',
                entryType: 'character', keys: [], kind: 'changed', field: 'appearance',
                target: 'ad-9', delta: 'thinner', chapterId: 'c-2' },
              { id: 'pr-4', entryId: 'e-2', title: 'The stair', body: 'It is boarded over.',
                entryType: 'lore', keys: [], kind: 'conflict', delta: 'boarded', chapterId: 'c-2' },
              // TWO new ones, because Add all is not offered over a single card — one card is a
              // press either way and a button that says "Add all 1" is a button that lies slightly.
              { id: 'pr-5', entryId: null, title: 'The lamplighter', body: 'He comes at six.',
                entryType: 'character', keys: [], kind: 'new', delta: 'New face.', chapterId: 'c-2' }],
};
const MANIFEST = { manifest: { blocks: [
  { kind: 'SPINE', id: 'spine', text: '', tokens: 392, state: 'included', reason: 'capped' },
  { kind: 'CANON-ALWAYS', id: 'e-1', text: '', tokens: 5480, state: 'included', reason: 'always_on', firedBy: ['always_on'] },
  { kind: 'EARLIER', id: 'c-1', text: '', tokens: 1920, state: 'omitted', reason: 'stale summary' },
  // A dropped ARC takes its whole range with it, which is what makes the count chapters rather
  // than blocks — one omitted block here is nine forgotten chapters.
  { kind: 'EARLIER', id: 'arc-3-11', text: '', tokens: 900, state: 'omitted', reason: 'EARLIER 25% ceiling' },
  // Three of one reason, because that is the shape a long book makes: at 358 passages the panel
  // grew ninety-six identical PROSE lines under the rows that say something.
  { kind: 'PROSE', id: 'p-9', text: '', tokens: 100, state: 'omitted', reason: 'prose 60% ceiling' },
  { kind: 'PROSE', id: 'p-8', text: '', tokens: 200, state: 'omitted', reason: 'prose 60% ceiling' },
  { kind: 'PROSE', id: 'p-7', text: '', tokens: 300, state: 'omitted', reason: 'prose 60% ceiling' },
// `used` and `exact` DIFFER on purpose, and by roughly the 1.28x bench/drift.ts measured. They
// were the same number until 2026-08-28, which meant the checks below could not tell which one
// the surface was reading — and the surface was reading the wrong one: /api/manifest has returned
// the tokenizer's `exact` since the route was written and app.js drew the bar from the estimate.
// A fixture whose two candidate answers are identical is the tag-splitting fixture with no comma
// in it, arriving again.
], totals: { budget: 46146, used: 27401, unallocated: 0 }, byKind: {}, overflowed: false }, prompt: '', exact: 21401 };

const POSTED: any[] = [];
// WHAT WAS ASKED FOR, AND HOW MANY AT ONCE. The second half is the point: the first version of the
// draw tray rendered four <img> tags and let the browser load them in parallel, and the free tier
// answers `429 Queue full for IP: 1 requests already queued (max: 1)` — one picture and three
// blank squares, which is exactly what Seth got. A count of requests would have passed. Only a
// count of CONCURRENT requests can fail.
const DRAWN: string[] = [];
let inFlight = 0, peakFlight = 0;
// Set by a test to make the Nth drawn request come back 429, so the refusal tile can be checked.
let refuseNth = 0;
(globalThis as any).fetch = async (url: string, init?: any) => {
  if (init?.body) { try { POSTED.push({ url, body: JSON.parse(init.body) }); } catch { /* not JSON */ } }
  if (url.startsWith('https://image.pollinations.ai/')) {
    DRAWN.push(url);
    peakFlight = Math.max(peakFlight, ++inFlight);
    // A real turn of the loop, so two overlapping calls would actually overlap here.
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    if (DRAWN.length === refuseNth) return { ok: false, status: 429 } as any;
    return { ok: true, status: 200, blob: async () => ({ from: `seed${url.split('seed=')[1]}` }) } as any;
  }
  // The bytes kept from a draw, read back when one is pressed. No network in it at all.
  if (url.startsWith('blob:')) return { ok: true, blob: async () => ({ from: url }) } as any;
  // Three books, not one, and the two extras exist only so the shelf's ORDER can be wrong. With a
  // single story there is no grid to come after the New story button, so an assertion about where
  // that button sits is true wherever the button is put.
  const body = url.startsWith('/api/stories') ? { stories: [{ id: 's-1', title: 'The Ashfall Concordat', status: 'in_progress', updatedAt: Date.now(), words: 9140, last: 'She left.' },
      // Two of the three are owed something, and between them five separate things — so a shelf that
      // listed items would show five chips where it must show two.
      // #18 §5. One book pinned to a model the router no longer serves — the 2026-08-27 rename is
      // exactly this shape — and one pinned to a model it does, so the mark can be wrong in both
      // directions rather than only missing.
      { id: 's-2', title: 'The Salt Ledger', status: 'in_progress', updatedAt: 2, words: 400, last: 'He paid.',
        proposed: 3, unpaid: 1, flags: 0, model: 'write-nt-qwen36-h' },
      { id: 's-3', title: 'Sutera', status: 'draft', updatedAt: 1, words: 0, last: null,
        proposed: 0, unpaid: 0, flags: 2, model: 'Qwen3.6-WNTH-35B-A3B-NN' }], model: 'write-nt-qwen36-h', slot: SLOT, gen: STORY.gen,
      // The writer's default look rides the library call, which is the first thing asked for.
      look: { theme: 'parchment', font: 'garamond', size: 'l', scale: '110' } }
    : url.startsWith('/api/story') ? STORY
    // The chapter naming its own next chapter. Answered properly rather than with {}, because an
    // empty answer is a different case and it has its own guard.
    : url.startsWith('/api/chapter/propose') ? { chapterId: 'c-2', title: 'The Rust Year',
        note: 'By the end the debt has to be called in, and Marek has to be in the room for it.' }
    // #22. TWO BOOKS, because the page's whole job is grouping and collapsing — with one book
    // "exactly one open" is true however the collapse is written.
    : url.startsWith('/api/ledger') ? { slots: SLOTS, entries: [
        { id: 'e-1', story: 's-1', storyTitle: 'The Ashfall Concordat', title: 'Halsey',
          body: 'A fence with a good coat and a better memory.', entryType: 'character',
          activation: 'always_on', keys: [], addons: [], outfits: [] },
        { id: 'e-2', story: 's-2', storyTitle: 'The Salt Ledger', title: 'the Ambersand',
          body: 'A house that lends at ruin.', entryType: 'lore',
          activation: 'triggered', keys: ['Ambersand'], addons: [], outfits: [] }] }
    // #25. The three-source shape `GET /api/models` actually returns: the router's status, the
    // preset file's context, and this database's measured speed. The third row is deliberately a
    // model the preset file does not mention and nobody has written with — the panel has to say
    // WHICH source is silent rather than print a dash, and a fixture where every field is filled
    // cannot see that at all. `active` stays the old alias so the rail's own assertions above
    // keep testing what they were written for.
    : url.startsWith('/api/models') ? { active: 'write-nt-qwen36-h', allow: [], models: [
        { id: 'Qwen3.6-WNTH-35B-A3B-NN', status: 'loaded',
          ctxSize: 100096, parallel: 2, perSlot: 50048, tps: 58.4, runs: 58 },
        { id: 'Wayfarer-2-RPNT-12B', status: 'unloaded',
          ctxSize: 32768, parallel: 2, perSlot: 16384, tps: 41.2, runs: 3 },
        { id: 'Sorcerer-9-WNT-70B', status: 'unloaded' }] }
    // #21. A skeleton, not a created story — which is the whole reason it lands on the page to be
    // edited before anything is written.
    : url.startsWith('/api/style') ? { style: 'Wet streets and short sentences.' }
    : url.startsWith('/api/spark') ? { story: { title: 'The Winter Signature', genre: 'political fantasy',
        premise: 'Six houses have one winter to sign a peace none of them wants.',
        setting: 'Ashfall Hall', pov: 'third limited, past tense', spice: 2,
        writingStyle: 'Cold, spare.', persona: 'Ilva Marren' },
        entries: [{ title: 'Ilva Marren', entryType: 'character', body: 'A envoy with nothing to trade.' }] }
    : url.startsWith('/api/manifest') ? MANIFEST
    : url.startsWith('/api/activity') ? { runs: [{ id: 'g-1', role: 'prose', at: 1, error: null, promptTokens: 18904, completionTokens: 420, seconds: 5.9, prefillSeconds: 1.4, prefillRate: 38 }], worstPrefillSeconds: 2.8, failures: 0 }
    : {};
  return { ok: true, json: async () => body };
};

await import('../web/app.js');
await new Promise((r) => setTimeout(r, 30));   // let the boot IIFE settle

const html = (id: string) => String(nodes.get(id).innerHTML);

// Nothing may render the literal word "undefined" — that is what a wrong field name looks like
// on screen, and it is invisible to a syntax check.
for (const id of ['rail', 'bar', 'page']) {
  assert.ok(!/\bundefined\b/.test(html(id)), `#${id} rendered "undefined": ${html(id).match(/.{0,60}undefined.{0,40}/)?.[0]}`);
}
ok('the workspace boots with no undefined fields');

assert.match(html('rail'), /My stories/);
// The id is what the router answers to and what ANANSI_MODEL takes, so it stays — in the title,
// where it is one hover away instead of the first thing the rail says.
assert.match(html('rail'), /Write \u00b7 Qwen3\.6/, 'the rail names the model in words');
assert.match(html('rail'), /title="write-nt-qwen36-h"/, 'and keeps the id, one hover away');
{
  const { modelName } = await import('../web/model.js');
  // Thinking on this model means 900 tokens of reasoning and no prose at all — three runs of four.
  // A label that drops it is a label that hides the one setting that decides whether prose arrives.
  assert.match(modelName('write-nt-qwen36-h').detail, /no thinking/);
  assert.match(modelName('agentic-t-qwen38-h').detail, /(?<!no )thinking/, 't must read as thinking');
  // Two of the router's presets are the same repo at different quants, so the name alone cannot
  // tell them apart and the detail is not decoration.
  const a = modelName('HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF:32K');
  const b = modelName('HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF:Q8_K_P');
  assert.strictEqual(a.name, b.name, 'same repo, same name');
  assert.notStrictEqual(a.detail, b.detail, 'and the quant is what distinguishes them');
  // Not anchored: the org is repeated INSIDE the repo name too, and once is enough.
  assert.doesNotMatch(a.name, /GGUF/i, 'the file format is not part of a name');
  assert.doesNotMatch(a.name, /HauhauCS/i, 'and neither is the org, twice');
  assert.strictEqual(modelName('').name, 'no model', 'and no model says so');

  // THE 2026-08-27 CONVENTION. Before #25 an id in it fell through to the Hugging-Face branch and
  // came out "Qwen3.6 WNTH 35B A3B NN" — every fact still encoded in the id, none of it read.
  const q = modelName('Qwen3.6-WNTH-35B-A3B-NN');
  assert.strictEqual(q.name, 'Qwen3.6', 'the family is the name; the code and the size are not');
  // BITS ARE THE BADGES, AND THE SIZE IS NOT ONE. Three surfaces put these beside a name in a
  // strip that is already nowrap with an ellipsis on it, and the size is the longest of them and
  // the least of what was asked for there. It stays in `detail`, which is what builds the
  // Storyteller's options, and it gets its own chip on the panel where there is room.
  assert.deepStrictEqual(q.bits, ['Write', 'uncensored', 'novel tier'],
    'purpose, decensoring and the novel tier are the badges');
  assert.strictEqual(q.size, '35B-A3B', 'and the size is its own field, not a badge');
  assert.strictEqual(q.detail, 'Write · uncensored · 35B-A3B · novel tier',
    'while the one-line detail puts the size back, before the tier the id spells last');
  // ASYMMETRIC ON PURPOSE, and this is the half that must not go. "no thinking" was dropped on
  // 2026-08-29 at Seth's word: it rode on eight of the ten presets and said nothing, because the
  // transport pins enable_thinking:false on every call and not thinking is the normal case. A `T`
  // model is the other thing entirely — thinking left on returned no prose at all on three runs of
  // four — so silence means "nothing to watch" and the word means "watch this one".
  assert.ok(modelName('GLM-4.7-Flash-RPTH-30B').bits.includes('thinking'),
    'a T model must say so on every surface that shows the badges');
  assert.doesNotMatch(q.detail, /thinking/,
    'and an NT model says nothing about it rather than saying the boring half out loud');
  // H ABSENT IS NOT CENSORED. presets.ini is explicit that Wayfarer-2 and Muse were trained open
  // and never censored, which is a different claim from refusing — and the surface must not turn
  // the one into the other.
  assert.match(modelName('Wayfarer-2-RPNT-12B').detail, /trained open/);
  assert.doesNotMatch(modelName('Wayfarer-2-RPNT-12B').detail, /censored/,
    'a model with no H says what it is, never what it is not');
  // A Hugging-Face path must not be read as the convention: it is full of capitalised segments and
  // any of them could be mistaken for a CODE. This one carries MTP, GGUF and a quant.
  const hf = modelName('HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF:Q8_K_P');
  assert.deepStrictEqual(hf.bits, ['Q8_K_P'], 'a repo path decodes as a repo path, not as a preset');
}
ok('a preset id in the 2026-08-27 convention decodes to purpose, thinking, decensoring and tier');

// THE BLURB MAP IS HAND-WRITTEN, AND THE LAST RENAME EMPTIED EVERY MAP LIKE IT SILENTLY. Keyed by
// the family `modelName` decodes, so this walks the current preset list both ways: a blurb whose
// key no longer decodes out of any id is dead, and a preset with nothing written about it shows
// the decode alone. The id list below is /data/models/presets.ini as of 2026-08-29 — when the
// router's stanzas change, this is the check that says so instead of a panel quietly going blank.
{
  const { modelName, BLURB } = await import('../web/model.js');
  const LIVE = ['Ornith-1.0-RPNTH-35B', 'Qwen3.6-WNTH-35B-A3B-NN', 'Huihui-ThinkingCap-ATH-27B',
    'Qwen3.8-ATH-27B', 'Gemma-4-WNTH-31B-NN', 'Artemis-1.1-RPNTH-31B-NN', 'GLM-4.7-Flash-RPTH-30B',
    'Harbinger-RPNTH-24B', 'Wayfarer-2-RPNT-12B', 'Muse-RPNT-12B'];
  const families = LIVE.map((id) => modelName(id).name);
  assert.deepStrictEqual(Object.keys(BLURB).filter((k) => !families.includes(k)), [],
    'these blurbs are keyed to a family no preset decodes to any more');
  assert.deepStrictEqual(families.filter((f) => !BLURB[f]), [],
    'these presets are on the box with nothing written down about them');
  // And the blurbs are quoted from the stanza comments, so they carry the numbers those comments
  // carry. A blurb that said nothing measurable would be a vibe about a model.
  assert.match(BLURB['GLM 4.7 Flash'], /enable_thinking/,
    'the one fact about this model that decides whether prose arrives at all');
}
ok('every preset on the box has a blurb, and every blurb still belongs to a preset');

// The writing head is a run of glyphs APPENDED after the prose, never a scramble of the prose
// itself. The first version rewrote the last sixteen characters of the text on every delta: the
// prose moved after it had settled, and the effect ran at the model's token rate, which is uneven.
{
  const { glyphRun, HEAD, GLYPHS } = await import('../web/model.js');
  for (let i = 0; i < 200; i++) {
    const run = glyphRun();
    assert.strictEqual(run.length, HEAD, 'the head is one fixed-width block, not a gradient');
    for (const ch of run) assert.ok(GLYPHS.includes(ch), 'and every character comes from the set');
  }
  assert.strictEqual(glyphRun(3).length, 3, 'and its width is the caller\'s');
  // Rolled again, it is a different run — a head that never changed would just be nine letters
  // sitting at the end of the passage.
  const rolls = new Set(Array.from({ length: 40 }, () => glyphRun()));
  assert.ok(rolls.size > 1, 'consecutive rolls must differ');
  // The prose is not an argument here, and that IS the fix: nothing in this module can touch it.
  assert.ok(!String(glyphRun).includes('text'), 'the head takes no prose, so it cannot rewrite any');
  ok('the writing head is a run of glyphs and the prose is never an input to it');
}
assert.match(html('rail'), /slot 50,048/);
ok('the rail shows the workspace nav, the model and the real slot size');

assert.match(html('page'), /The Ashfall Concordat/);
// ONE New story button, and it is the rail's — #19. It was on the page too, between the hero and
// the grid, and before that a dashed cell inside the grid taking a column from a book that exists.
// The page copy existed for one reason: the bar pill carried `deskonly` and a phone saw neither.
// Removing the page button alone would have shipped a phone with no way to start a book, so the
// pill lost `deskonly` in the same change and this asserts BOTH halves — the shelf has none, and
// the one that remains is not hidden on a narrow screen.
{
  const shelf = html('page');
  assert.ok(shelf.indexOf('storycard hero') >= 0, 'the newest book is the hero');
  assert.doesNotMatch(shelf, /data-open="new"/,
    'the shelf itself offers no New story button — the rail is the one door');
  assert.match(html('bar'), /<button class="pill" data-open="new"/,
    'and the bar pill is not deskonly, or a phone has no door at all');
}
ok('one New story button, on the bar, and the shelf does not repeat it');

// ---- now open the story, which is where the field names bit ----
const click = (dataset: any) => listeners.click?.[0]?.({ target: { closest: () => ({ dataset }) } });
// Typing into a box the app watches by id. Two of them redraw only their own list rather than the
// page — the ledger's search and #20's thread picker — and that is the behaviour being checked.
const typeIn = (id: string, value: string) => listeners.input?.[0]?.({ target: { id, value } });
click({ open: 's-1' });
await new Promise((r) => setTimeout(r, 40));

for (const id of ['rail', 'bar', 'col', 'dockCol', 'sideBody']) {
  assert.ok(!/\bundefined\b/.test(html(id)), `#${id} rendered "undefined": ${html(id).match(/.{0,60}undefined.{0,40}/)?.[0]}`);
}
ok('the story surface renders with no undefined fields');

assert.match(html('rail'), /Context/, 'the rail must switch to the story nav');
assert.match(html('rail'), /The Envoy/, 'and list chapters by title');
assert.ok(!/My stories/.test(html('rail')), 'and drop the workspace nav');
ok('the rail swaps navigation when a story opens');

// TWO menus, one rail, and which one is showing is no longer decided by where you are — the menu
// button asks for the workspace one from inside a story, the story's own name asks for the story
// one. Both directions asserted from inside an OPEN story, because that is the only place the two
// can disagree: outside one they are the same answer and a broken split still passes.
click({ railview: 'workspace' });
assert.match(html('rail'), /My stories/,
  'the menu button must reach the workspace menu without leaving the story');
assert.ok(!/list chapters|Chapters/.test(html('rail')),
  'and the chapter list goes with it — it named a book you are no longer looking at');
click({ railview: 'story' });
assert.match(html('rail'), /Context/, "the story's name must bring its own menu back");
assert.match(html('rail'), /Anansi<\/span>/, 'which is where Anansi lives');
ok('the menu and the story name are two doors onto one rail');

// Three layers of look, and the one that must never happen is a book's theme becoming yours.
{
  const root = (globalThis as any).document.documentElement;
  assert.strictEqual(root.dataset.uiTheme, 'ink', "the open book's own theme must be applied");
  // The book names ONLY a theme, so everything else has to come from the writer's default. A
  // book that pinned all four would pass this whatever the layering did.
  assert.strictEqual(root.dataset.uiFont, 'garamond', "and the writer's font underneath it");
  assert.strictEqual(root.dataset.uiSize, 'l', 'and their prose size');
  assert.strictEqual(root.dataset.uiScale, '110', 'and their UI scale');
  // The cache is of YOUR default, never of what is on screen. Caching the effective look is how
  // opening one green book makes every book green the next time the app starts.
  const cached = JSON.parse(stored.get('anansi.look') ?? '{}');
  assert.strictEqual(cached.theme, 'parchment',
    `the browser cached "${cached.theme}" — that is the book's look, not the writer's default`);
}
ok("a book's look sits over the writer's, and never becomes it");

// The cover at the head of a chapter, when the book asks for it. Both states, because a plate that
// renders whatever the switch says is a switch that does nothing.
{
  const withPlate = html('col');
  assert.match(withPlate, /class="plate"/, 'the book asks for it, so the chapter carries the plate');
  assert.match(withPlate, /api\/cover\?story=s-1/, 'and the plate is the STORY cover, not a second image');
  // The title moves INTO the plate rather than being printed twice.
  const bandTitles = (withPlate.match(/class="serif band-title"/g) ?? []).length;
  assert.strictEqual(bandTitles, 0,
    'the chapter title belongs to the plate when there is one — printed in both is the same name twice');
  assert.match(withPlate, /class="serif plate-title"/, 'and it is on the plate');
}
ok('a chapter wears the book cover as its plate, and the title moves onto it');

// Or keeps it BEHIND the prose, which replaced the sticky heading. Drawn outside the scroller,
// because a sticky element cannot leave its own parent — inside #col it would scroll away with the
// chapter it exists not to scroll away with.
{
  STORY.story.chapterSticky = true;
  STORY.story.coverOpacity = 45;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  const back = html('backdrop');
  assert.ok(!nodes.get('backdrop').hidden, 'the backdrop shows when the book asks for it');
  assert.match(back, /api\/cover\?story=s-1/, 'and it is the story cover');
  assert.match(back, /opacity:0\.45/, "at the story's own strength, not a constant");
  // The plate and the backdrop are two treatments of one picture and must never both be on: the
  // cover would appear twice, once scrolling and once not.
  assert.doesNotMatch(html('col'), /class="plate"/,
    'and the plate steps aside — one picture, one treatment');

  // THE CHROME STAYS ON TOP. The backdrop is a later sibling than the header, so at the same
  // layer it painted straight over the book's name, the three controls and the context bar.
  {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    const rule = css.match(/#doc\.behind #bar[^}]*\}/)?.[0] ?? '';
    assert.ok(rule, 'the chrome needs a rule lifting it over the backdrop');
    for (const id of ['#ctxbar', '#ctxread', '#appearance'])
      assert.ok(rule.includes(id), `${id} must be lifted with the header, or it goes under the picture`);
    assert.match(rule, /z-index:2/,
      'above the prose as well as the picture — the chrome is the frame, and a frame the picture '
      + 'can cover is not a frame');
  }

  STORY.story.chapterSticky = false;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(nodes.get('backdrop').hidden, 'off again, the backdrop goes');
  assert.match(html('col'), /class="plate"/, 'and the plate comes back');
}
ok('a book can keep its cover behind the prose instead, at a strength it chooses');

// WAITING IS WHERE YOU ACT. It listed counts and sent you elsewhere, which is four journeys to
// answer "does anything want me" — the thing the panel exists to end. Every decision is taken in
// place now, using the SAME renderer as the panel each item came from.
{
  // `openStory` paints twice — it awaits the story, then the activity — so a panel chosen between
  // the two is repainted over by the second. Let it settle before choosing, and again before
  // reading, or this reads whichever panel that second paint left behind.
  await new Promise((r) => setTimeout(r, 60));
  click({ panel: 'waiting' });
  await new Promise((r) => setTimeout(r, 20));
  const w = html('sideBody');
  // Proposals: the card carries the editable box, because POST /api/proposal reads the BOX and not
  // the model's wording — a copy without it would quietly accept something else.
  assert.match(w, /data-decide="accept"/, 'a proposal is accepted here');
  assert.match(w, /data-decide="reject"/, 'or refused here');
  assert.match(w, /data-pbody=/, 'and what lands is the box, which is why the box has to be here');
  // Strings and flags, each with the action that belongs to them.
  assert.match(w, /data-summon=/, 'a promise is summoned here');
  assert.match(w, /data-dropflag=/, 'a contradiction is dismissed here');
  assert.match(w, /data-goflag=/, 'or followed to the passage it is about');
  // And it no longer sends you away to do any of it.
  assert.ok(!/data-panel="(chapter|strings|context)"/.test(w),
    'and nothing here is a link to somewhere else to do it');
}
ok('everything Waiting lists can be decided in Waiting');

// Leaving takes the book's look off with it, or the shelf wears whichever book you opened last.
click({ leave: '1' });
await new Promise((r) => setTimeout(r, 40));
{
  const root = (globalThis as any).document.documentElement;
  assert.strictEqual(root.dataset.uiTheme, 'parchment', 'the shelf is back to the writer default');
  assert.strictEqual(root.dataset.uiFont, 'garamond', 'with the rest of it unchanged');
}
ok('leaving a book takes its look with it');

// Back into the story, because everything below this reads the story surface.
click({ open: 's-1' });
await new Promise((r) => setTimeout(r, 40));

assert.match(html('col'), /The hall smells of cold iron/);
assert.match(html('col'), /Envoy Sereth/, 'a speaker label must render');
assert.match(html('col'), /You · Ilva Marren/, 'a human passage must be attributed to the persona');
assert.match(html('col'), /class="block speak"/, 'quoted prose is a speech block');
// Regenerate and Continue live at the END of the page now, on the passage they act on. The count
// is the assertion that matters: `newest` is passed per passage, so a renderer that stopped
// distinguishing them would put a pair of buttons under every paragraph and still "have" them.
{
  // The ⋯ handle is gone; a double click is the only way into the tray now.
  assert.doesNotMatch(html('col'), /class="more"|data-more/,
    'the three-dot handle must be gone — a double tap opens the tray and has since F34');
  assert.match(html('col'), /class="acts"/, 'but the tray itself is still rendered');
  // Reading mode keeps the tray and loses everything in it that writes. The marker is what CSS
  // hides, so it is asserted here rather than left to a stylesheet nobody reads.
  const tray = html('col').match(/<div class="acts">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(tray, /class="wr" data-ed/, 'Edit is marked as writing, so reading mode drops it');
  assert.match(tray, /data-fork/, 'Branch is not, so reading mode keeps it');
  assert.match(tray, /class="readonly" *|data-chapters/, 'and the chapter list is reading-mode only');

  const carries = html('col').match(/class="carry"/g) ?? [];
  assert.strictEqual(carries.length, 1,
    `Regenerate and Continue belong to the last passage only — found ${carries.length} rows`);
  const carry = html('col').match(/<div class="carry">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(carry, /data-re="p-5"/, 'and Regenerate must name the LAST passage, not the first');
  assert.match(carry, /data-continue="1"/, 'and Continue must be there beside it');
}
ok('Regenerate and Continue sit under the last passage, once');
assert.match(html('col'), /class="block you"/, 'the writer\'s own line is a you block');
assert.match(html('col'), /Contradiction · Envoy Sereth/, 'a violation must surface on its passage');
// Act and Narrate write HUMAN passages that are narration, not dialogue. Before the mode set,
// author === 'human' was a safe proxy for "this is a line of speech", because Speak was the only
// way to write one — so the renderer keyed off authorship. It is not a proxy any more, and
// rendering a paragraph of your own narration as dialogue under a "You ·" chip is the opposite
// of what Narrate is for.
assert.match(html('col'), /class="narr"[^>]*data-edit="p-4"/,
  'a human passage that is not dialogue must render as narration, not as your speech');
assert.ok(!/You · Ilva Marren<\/div>\s*<div class="said" contenteditable="plaintext-only" data-edit="p-4"/.test(html('col')),
  'and must carry no "You ·" chip');
// Speaking AS someone else labels it with their name, not with yours.
assert.match(html('col'), /Envoy Sereth<\/div>\s*<div class="said"[^>]*data-edit="p-5"/,
  'a human line spoken as another character is labelled with that character');
ok('prose renders as narration, speech, the writer\'s own line, and a flag');

for (const label of ['Speak', 'Act', 'Direct', 'Narrate']) {
  assert.match(html('dockCol'), new RegExp(`>${label}<`), `the composer must offer ${label}`);
}
// SEND STAYS SEND. It carried two jobs for as long as Stop had nowhere else to be. Stop lives on
// the veil now — which covers the whole screen and is the only thing visible while she writes — so
// the composer's button no longer changes identity underneath the writer. Disabled while busy
// rather than repurposed: a control that cannot act should say so, not become a different control.
{
  const idle = html('dockCol');
  assert.match(idle, /data-send="1"/, 'idle, the button sends');
  assert.doesNotMatch(idle, /data-stop/,
    'the composer must not carry a Stop. It is on the veil, which is the only thing on the screen '
    + 'while the model writes — two Stops is one of them being wrong about whether it can act.');
}
ok('the composer sends when the model is idle');

// Continue LEFT the composer on 2026-08-27. It is an action on the passage it carries on from,
// at the end of the page, and both halves of that are asserted — that it is gone from here, and
// that it is there — because only the pair can fail when it is put back in one place and not
// removed from the other.
assert.doesNotMatch(html('dockCol'), /data-continue/,
  'Continue is no longer a chip in the mode row — it belongs to the last passage');
assert.doesNotMatch(html('dockCol'), /data-mode="continue"/, 'and it was never a selectable mode');
assert.match(html('dockCol'), /Say it as Ilva Marren/, 'the placeholder follows the mode and the persona');
// Speak happens as someone, and the default is the point-of-view character. It moved OUT of the
// mode rail on 2026-08-27 — it read as a fifth mode there and ran out of room on a long name — so
// both halves are asserted: gone from the rail, present on its own full-width strip above it.
assert.match(html('asRow'), /id="asWhom"/, 'Speak must offer who you are speaking as');
assert.match(html('asRow'), /Ilva Marren/, 'defaulting to the point-of-view character');
assert.doesNotMatch(html('dockCol'), /asWhom/,
  'and it must not be back in the mode rail, which is capped at the column width');
// Direct and Narrate have no speaker: an instruction is not spoken by anyone, and Narrate is your
// own prose. The strip must be EMPTIED for them, not merely hidden — a select left in the DOM is
// one a presence check finds and a keyboard reaches.
click({ mode: 'direct' });
assert.strictEqual(html('asRow'), '', 'Direct must carry no speaker control at all');
click({ mode: 'narrate' });
assert.strictEqual(html('asRow'), '', 'nor Narrate');
click({ mode: 'speak' });
assert.match(html('asRow'), /id="asWhom"/, 'and Speak brings it back');
// The tint follows the mode, and it follows it on the ROOT — which means the attribute has to be
// rewritten by the thing that draws the row. Written in applyLook it went stale the moment you
// pressed a different mode, and Act kept its tinted, rounded background after you had left it.
{
  const rootEl = (globalThis as any).document.documentElement;
  assert.strictEqual(rootEl.dataset.uiMode, 'speak', 'the root carries the mode being drawn');
  click({ mode: 'act' });
  assert.strictEqual(rootEl.dataset.uiMode, 'act', 'and it changes with it');
  click({ mode: 'direct' });
  assert.strictEqual(rootEl.dataset.uiMode, 'direct',
    'including to a mode with no tint at all — otherwise the last tinted button keeps its lift');
  click({ mode: 'speak' });
}
// And no mode button carries a background of its own. Tinting the selected one to match the strip
// gave one of four a filled pill the other three do not have, which reads as a different KIND of
// control rather than as the selected one. The underline is how a selected mode says so, and it
// says it for all four.
{
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  assert.ok(!/#modes button\[data-mode="(speak|act)"\][^{]*\{[^}]*background:/.test(css),
    'no mode button may be given a background — the underline is the selection, for all four');
  // AND NEITHER DOES THE ROW, since 2026-08-27. The pair was mixed 88% toward the paper: Speak's
  // was invisible and Act's, off the accent, was not — so one mode had a filled bar and the other
  // had nothing, which reads as a fault rather than as a distinction. The label already says which
  // mode you are in; it does not need a colour to say it twice, badly.
  assert.ok(!/#asRow > \.inner \{ background:/.test(css),
    'the speaker row carries no background — one of a pair being visible is not a pair');
  assert.ok(!/-tint\b/.test(css), 'and the tokens went with it rather than being left unused');
}
// The label names the mode that summoned it. "speaking as" over Act is the row describing a mode
// you are not in.
assert.match(html('asRow'), /speaking as/, 'Speak says speaking');
click({ mode: 'act' });
assert.match(html('asRow'), /acting as/, 'and Act says acting');
click({ mode: 'speak' });
// The two that are not modes sit to the right of the four that are, pushed there by the margin
// on the first of them. Order matters: asserting only that they exist would pass with them
// scattered back among Speak and Act, which is the arrangement being fixed.
const modeRow = html('dockCol').match(/<div id="modes">[\s\S]*?<\/div>/)?.[0] ?? '';
assert.ok(modeRow, 'the mode row must exist');
// It was `+ Thread` here until 2026-08-28 and is the door to the whole list now — the tray it used
// to open has its own button inside that list. The POSITION is what this block is about and that
// has not moved: two things that are not modes, to the right of the four that are.
assert.ok(modeRow.indexOf('data-mode="narrate"') < modeRow.indexOf('data-goblock="threads:"'),
  'Threads comes after the last mode');
assert.ok(modeRow.indexOf('data-goblock="threads:"') < modeRow.indexOf('data-panel="anansi"'),
  'and Anansi after it');
assert.match(modeRow, /data-goblock="threads:"[^>]*margin-left:auto/,
  'and the gap that separates them from the modes is on Threads, or they are not right-aligned');
// THREE BUTTONS NOW, and the order is the sentence: this book's threads, then writing one down,
// then Anansi. `+ Thread` came back beside the list on 2026-08-28 — they are different jobs and the
// list had been standing where both of them needed to fit.
assert.ok(modeRow.indexOf('data-goblock="threads:"') < modeRow.indexOf('data-newlore'),
  '+ Thread comes after the list it adds to');
assert.ok(modeRow.indexOf('data-newlore') < modeRow.indexOf('data-panel="anansi"'),
  'and Anansi is last, which is where Seth asked for + Thread to sit beside it');
ok('the composer offers the four modes, with Threads, + Thread and Anansi pushed right');

assert.match(html('bar'), /Chapter|The Envoy/, 'the header names the book');
// The percentage LEFT the header on 2026-08-27 — Seth wanted one bar across the window and the
// numbers behind a press. It is asserted below, where it went.
ok('the header names the book, and carries no reading of its own');

// Asserted as a WIDTH against the manifest arithmetic rather than as "a bar is there": a
// meter that renders at a fixed width is the shape that reports a full context as an empty one.
{
  // 21401 is `exact`, not the 27401 of `totals.used`. If the surface goes back to the estimate
  // this is 59% and every assertion in this block goes red at once.
  const pct = Math.round(21401 / 46146 * 100);
  assert.notStrictEqual(21401, MANIFEST.manifest.totals.used,
    'the fixture must keep the estimate and the exact count apart, or nothing below can see '
    + 'which one the bar used');
  // The meter is its own strip under the header now, not a 74px rule inside a running head that
  // does not exist until you scroll. Asserted as a WIDTH against the manifest's own arithmetic:
  // a meter that renders at a constant is the shape that reports a full context as an empty one.
  const meter = html('ctxbar');
  assert.match(meter, new RegExp(`width:${pct}%`),
    `the meter must fill to the manifest's own ${pct}%, not to a constant`);
  assert.ok(!nodes.get('ctxbar').hidden, 'and it is shown while a story is open');
  // Shut until pressed. Everything in it used to be in the header beside the story title.
  assert.ok(nodes.get('ctxread').hidden, 'the reading is shut until the bar is pressed');
  assert.ok(!/\d+ words|context \d+%/.test(html('bar')),
    'and the header carries neither the word count nor the percentage any more');

  click({ ctxopen: '1' });
  const read = html('ctxread');
  assert.ok(!nodes.get('ctxread').hidden, 'pressing the bar opens the reading');
  assert.match(read, /chapter 2 of 2/, 'which says which chapter you are on');
  assert.match(read, /words/, 'and how many words are in it');
  assert.match(read, new RegExp(`context ${pct}%`), 'and what the context costs');
  assert.match(read, /data-panel="context"/, 'with the way through to the blocks behind it');
  click({ ctxopen: '0' });
  assert.ok(nodes.get('ctxread').hidden, 'and pressing it again shuts it');

  // NO ROOM IS NOT NO BAR. A budget of zero — llama-server unreachable so the slot is unknown, or
  // a prompt that will not fit — makes the percentage null, and the first version hid the meter
  // for it. That took the bar away at the moment it says the most, and it hid it through a whole
  // browser scenario because the test server has no model to size a slot with.
  const realBudget = MANIFEST.manifest.totals.budget;
  MANIFEST.manifest.totals.budget = 0;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(!nodes.get('ctxbar').hidden, 'the bar stays when there is no room — that is when it matters');
  assert.match(html('ctxbar'), /width:100%/, 'full');
  click({ ctxopen: '1' });
  assert.match(html('ctxread'), /no room/, 'and the reading says so in words');
  click({ ctxopen: '0' });
  MANIFEST.manifest.totals.budget = realBudget;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
}
ok('the context bar fills to the manifest, and the reading is behind a press');

assert.match(html('sideBody'), /21,401 \/ 46,146/,
  'the inspector shows the TOKENIZER\'s count, not the estimate — /api/manifest already paid for '
  + 'a /tokenize round trip and returned it, and PLAN-06 2a and 2d are both errors in the number '
  + 'it replaces (measured together at 1.28x).');
assert.ok(!/27,401/.test(html('sideBody')),
  'and the estimate must not be on screen anywhere beside it');
// The segments are per-block estimates and there is no per-block exact number to have, so they
// are scaled to the total printed above them. Unscaled they overshoot it by the same 1.28x and
// the bar reads as broken against its own caption.
{
  // Scoped to the meter's own element: `sideBody` holds other percentage widths and summing the
  // lot gave 246.4%, which is a check measuring the whole panel rather than the bar.
  const bar = html('sideBody').match(/<div class="meter">([\s\S]*?)<\/div>/);
  assert.ok(bar, 'the inspector must draw a meter for this to say anything');
  const widths = [...bar[1].matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.ok(widths.length >= 2, `only ${widths.length} segments — a one-piece bar cannot show a mix`);
  const filled = widths.reduce((n, w) => n + w, 0);
  assert.ok(Math.abs(filled - 21401 / 46146 * 100) < 0.5,
    `the meter's pieces sum to ${filled.toFixed(1)}% of the budget; the number above them says `
    + `${(21401 / 46146 * 100).toFixed(1)}%. A breakdown that does not add up to its own total is `
    + 'the shape a reader reads as broken.');
}
assert.match(html('sideBody'), /stale summary/, 'an omitted block must say why');
// AND THE OTHER BRANCH. `exact` is null whenever the router is asleep — the route swallows the
// /tokenize failure on purpose so the panel still renders — and then the estimate is all there is.
// It is 59% high (PLAN-06 2a), so presenting it in the same typeface as a measurement is the
// surface stating a guess as a fact. This is the state a writer is in every time llama-server is
// down, which in this repo's own history is often.
{
  const realExact = (MANIFEST as any).exact;
  (MANIFEST as any).exact = null;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'context' });
  const asleep = html('sideBody');
  assert.match(asleep, /27,401 \/ 46,146/,
    'with no tokenizer answer the estimate is what there is, and it is shown');
  assert.match(asleep, /\(est\.\)/,
    'and it is MARKED. An estimate that looks like a measurement is the surface telling the '
    + 'writer something it does not know, and 2a is exactly how wrong it can be.');
  (MANIFEST as any).exact = realExact;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'context' });
  assert.ok(!/\(est\.\)/.test(html('sideBody')),
    'and the mark goes when the tokenizer answers again — a label that never clears is noise');
}
ok('an estimate is labelled as one, and the label clears when the tokenizer answers');

ok('the inspector renders the real manifest, including what was dropped');

// A row is a door. It used to be labelled in the engine's words — CANON-ALWAYS — and open a panel
// headed Threads, so arriving meant hunting for what you had just clicked. The label now comes
// from the destination, and both come from one table.
const { BLOCK_ORIGIN } = await import('../web/model.js');
const { modelOptions } = await import('../web/model.js');
const { ORDER } = await import('../src/blocks.ts');
for (const kind of ORDER)
  assert.ok(BLOCK_ORIGIN[kind], `${kind} has no name in BLOCK_ORIGIN — the row would say ${kind}`);
assert.match(html('sideBody'), /Threads, always on/, 'the canon row is named for where it lands');
assert.doesNotMatch(html('sideBody'), /CANON-ALWAYS|>SPINE</, 'no engine kind reaches the panel');
// The destinations the goblock handler actually knows. 'story' typo'd to 'stroy' would render a
// row that silently closes the panel instead of opening anything.
const dests = new Set(['story', 'traj', 'doc', 'canon', 'strings']);
for (const [kind, [label, dest]] of Object.entries(BLOCK_ORIGIN)) {
  assert.ok(dests.has(dest), `${kind} points at ${dest}, which no panel answers to`);
  assert.ok(label && !/^[A-Z-]+$/.test(label), `${kind}'s label is still engine-speak: ${label}`);
}
ok('every context row is named for the panel it opens');

// Ninety-six rows saying the same thing is a panel you scroll past its own answer to reach the end
// of. One row per reason, with the count and what it cost.
const dropped = html('sideBody').match(/prose 60% ceiling/g) ?? [];
assert.strictEqual(dropped.length, 1, `three dropped passages must be one row, not ${dropped.length}`);
assert.match(html('sideBody'), /&times;&thinsp;3/, 'and the row says how many there were');
assert.match(html('sideBody'), /600/, 'and what they would have cost, added up');
assert.match(html('sideBody'), /stale summary/, 'a lone omission still says its own reason');
assert.doesNotMatch(html('sideBody'), /stale summary<\/span>\s*<span[^>]*>&times;/,
  'and is not given a count of one');
ok('what came off collapses to one row per reason, with a count');

// A long book stops reaching part of itself and the app knew without saying. The bar says it now,
// so a writer who never opens the Context panel still finds out.
assert.match(html('bar'), /10 chapters not sent/,
  'the bar names how many chapters the model can no longer read (1 plus the arc\'s nine)');
assert.match(html('sideBody'), /Chapters 1&ndash;11 are past the horizon/,
  'and the panel names which — the range, not the block count');
assert.match(html('sideBody'), /Acts<\/strong> collapses/, 'and what to do about it');
ok('a book past its horizon says so on the bar, not only in a dimmed row');

// Two kinds of offer, two places to answer them. A promise Anansi noticed belongs beside the
// promises you already know about; the chapter queue stays about facts.
{
// A chapter names itself when it opens, and "opens" is the part that was wrong. `endChapter`
// creates the next chapter titled `Chapter N` (db.ts:933), so "both boxes empty" was never true
// and the autofill never fired once — the driver saw "Chapter 4" in the title box, called it
// filled, and reported the note empty. A title that is exactly this chapter's own number is the
// placeholder, not a name.
{
  const asked = () => POSTED.filter((p: any) => p.url.includes('/api/chapter/propose')).length;

  // c-2 is 'The Envoy' — a title a writer chose. Nothing may be proposed over it.
  const before = asked();
  click({ panel: 'setup' });
  assert.strictEqual(asked(), before,
    'a chapter a writer has named must not have a name proposed over it');
  assert.match(html('sideBody'), /Have Anansi suggest another/,
    'and the button offers another rather than a first');

  // The same chapter, holding the placeholder `endChapter` gives it. The panel reads
  // `currentChapter`, which is its own object in this response and not `chapters[1]`.
  STORY.currentChapter.title = 'Chapter 2';
  // Re-open the book so the surface re-reads the canned response rather than the copy it holds.
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'setup' });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(asked(), before + 1,
    'a chapter still holding the title endChapter gave it has not been named, and must be');
  STORY.currentChapter.title = 'The Envoy';
}
ok('a chapter names itself when it opens, and a placeholder title is not a name');

  click({ panel: 'strings' });
  await new Promise((r) => setTimeout(r, 30));
  const strings = html('sideBody');
  assert.match(strings, /Anansi noticed/, 'a proposed string waits under Strings');
  assert.match(strings, /The debt nobody has called in/);
  assert.match(strings, /set up in chapter 2/, 'with the chapter it came from');
  assert.match(strings, /The letter he has not opened/, 'beside the ones already tied');
  assert.doesNotMatch(strings, /Witness rite/, 'and not the thread proposals');

  click({ panel: 'chapter' });
  await new Promise((r) => setTimeout(r, 30));
  const chapter = html('sideBody');
  assert.match(chapter, /Witness rite/, 'the chapter queue keeps the thread proposals');
  assert.doesNotMatch(chapter, /The debt nobody has called in/,
    'and does not also show the string, which would be two places to answer one offer');
  assert.match(chapter, /1 string proposed &mdash; they wait under Strings/,
    'it says where the string went rather than silently dropping it from the count');
  ok('a proposed string waits under Strings, and the chapter queue says so');

  // THE THREE KINDS ARE THREE DECISIONS. `new` adds a card that does not exist, `conflict` updates
  // one that does, `changed` edits one room of one. They were in a single stack, so a chapter's
  // worth arrived as one undifferentiated list. Seth: "maybe we should have em split by that filter
  // and an accept all."
  assert.match(chapter, /data-pkind="new"/, 'the queue is filterable by kind');
  assert.match(chapter, /data-pkind="conflict"/);
  assert.match(chapter, /data-pkind="changed"/);
  // The count is on the chip: a filter that does not say how many is a filter you have to press to
  // find out whether it was worth pressing.
  // ONE, not two: the string proposal is answered under Strings and the chapter queue excludes it,
  // so the chip counts what is actually on this screen rather than what the chapter produced.
  assert.match(chapter, /New 2/, 'and each chip carries its count, of what this screen shows');
  assert.match(chapter, /Everything 4/, 'the Everything chip counts the queue without the string');
  // ADD ALL IS NOT OFFERED ON `all`. That is the whole safety property: it appears only once the
  // writer has narrowed to the additive kind.
  assert.doesNotMatch(chapter, /data-acceptall/,
    'Add all is not offered over a mixed queue, where it would accept conflicts and room edits too');

  click({ pkind: 'conflict' });
  await new Promise((r) => setTimeout(r, 30));
  const onlyConflict = html('sideBody');
  assert.match(onlyConflict, /The stair/, 'a chip narrows the queue to its kind');
  assert.doesNotMatch(onlyConflict, /Witness rite/, 'and drops the others');
  assert.doesNotMatch(onlyConflict, /data-acceptall/,
    'and Add all is still not offered — a conflict is sometimes the model being wrong');

  click({ pkind: 'new' });
  await new Promise((r) => setTimeout(r, 30));
  const onlyNew = html('sideBody');
  assert.match(onlyNew, /data-acceptall="new"/, 'Add all appears on new, which is the additive kind');
  assert.doesNotMatch(onlyNew, /The stair/);
  ok('the queue splits by kind, and Add all is offered on new alone');

  // WHERE IT LANDS IS ABOVE THE WORDS, not under them. It sat below the textarea, so the
  // destination of a change was read after the change and on a long body was off the card entirely.
  // Asserted by POSITION, because "the text is present somewhere" was already true before.
  click({ pkind: 'changed' });
  await new Promise((r) => setTimeout(r, 30));
  const onlyChanged = html('sideBody');
  const landsAt = onlyChanged.indexOf('Lands in appearance');
  const bodyAt = onlyChanged.indexOf('data-pbody');
  assert.ok(landsAt > -1 && bodyAt > -1, 'the card says where it lands and offers the body');
  assert.ok(landsAt < bodyAt, 'and says where it lands BEFORE the words that will land there');
  // The room is a chip on the title row, so a queue can be read without opening anything.
  assert.match(onlyChanged, /class="tag"[^>]*>appearance</, 'the room is a chip on the card');
  // Spoken, not stored: `who_is_here` is a column name. Proved on a slot that has underscores.
  const spoken = html('sideBody');
  assert.doesNotMatch(spoken, /who_is_here/, 'no room name is shown with its underscores');
  ok('a proposal says where it lands before it says what lands, and wears the room as a chip');

// #25. Three sources merge into one row and each may be missing. Checked here rather than by
// driving the rail, which is why it lives in web/model.js at all.
{
  const { modelFacts } = await import('../web/model.js');
  // PER-SLOT, not the whole window: ctx-size is divided across slots, so a model with 100,000 and
  // two writers gives each of them 50k. Showing the window would overstate the budget by double.
  assert.strictEqual(modelFacts({ perSlot: 50000, tps: 58.4, runs: 58 }), '50k each · 58.4 tok/s');
  // Under five calls the count rides along, because 63 tok/s off two calls is a different claim.
  assert.strictEqual(modelFacts({ perSlot: 65536, tps: 5.8, runs: 2 }), '66k each · 5.8 tok/s (2)');
  // A model nobody has written with says nothing about speed rather than guessing a number.
  assert.strictEqual(modelFacts({ perSlot: 16384 }), '16k each');
  // And one the presets file does not mention still lists, with less to say.
  assert.strictEqual(modelFacts({ tps: 39, runs: 45 }), '39 tok/s');
  assert.strictEqual(modelFacts({}), '', 'a model with neither says nothing at all');
  ok('a model row says its per-slot context and what it has actually measured');
}
  click({ pkind: 'all' });
  await new Promise((r) => setTimeout(r, 30));

// Editing a proposal before it lands. The route has honoured an incoming body since it was
// written and the surface never sent one, so what the model wrote was what entered canon even
// after the writer had changed it on screen. The panel also showed `delta || body` — for a
// conflict or an update that meant the text about to become canon was never displayed at all.
{
  const chapter = html('sideBody');   // the chapter panel, from the block above
  assert.match(chapter, /data-pbody="pr-1"/, 'a thread proposal offers a box, not a paragraph');
  assert.match(chapter, /A signature is void\./, 'holding what will be written');
  assert.match(chapter, /New fact\./, 'with the delta still shown beside it');

  click({ panel: 'strings' });
  await new Promise((r) => setTimeout(r, 30));
  assert.match(html('sideBody'), /data-pbody="pr-2"/, 'and so does a proposed string');

  // The box lives in the DOM, so the handler has to read it. Only this selector answers.
  const doc = (globalThis as any).document;
  const wasQS = doc.querySelector;
  doc.querySelector = (sel: string) =>
    sel === '[data-pbody="pr-1"]' ? { value: 'Rewritten by hand.' } : null;
  try {
    POSTED.length = 0;
    click({ decide: 'accept', id: 'pr-1' });
    await new Promise((r) => setTimeout(r, 60));
    const sent = POSTED.find((x) => String(x.url).startsWith('/api/proposal'));
    assert.ok(sent, 'accepting a proposal posts to the route');
    assert.strictEqual(sent.body.accept, true);
    assert.strictEqual(sent.body.body, 'Rewritten by hand.',
      'and carries what is in the box, not what the model said');

    // Rejecting must not carry one: the route ignores it, and sending it would claim the wording
    // of something thrown away mattered.
    POSTED.length = 0;
    click({ decide: 'reject', id: 'pr-1' });
    await new Promise((r) => setTimeout(r, 60));
    const dropped = POSTED.find((x) => String(x.url).startsWith('/api/proposal'));
    assert.ok(dropped, 'rejecting posts too');
    assert.strictEqual(dropped.body.accept, false);
    assert.strictEqual(dropped.body.body, undefined, 'and carries no body');
  } finally { doc.querySelector = wasQS; }
  ok('a proposal shows what it will write, and an edit is what gets sent');
}

// Nine themes, each one row, every token derived from it. Three hand-written CSS blocks is why
// there were three: a new theme meant restating the greys, the gold and the chrome by hand, and
// the light one that forgot rendered dark text on cream.
{
  const { THEMES, themeVars } = await import('../web/model.js');
  assert.strictEqual(Object.keys(THEMES).length, 9);

  // Named explicitly, not read off one theme and compared to the others: deriving the expected
  // set from obsidian meant a token deleted from ALL nine still matched, which is what happened
  // when I first wrote this and deleted one to watch it go red.
  const NEEDED = ['--doc-bg', '--doc-wash', '--rail', '--sheet', '--body', '--ink', '--ink-bright',
    '--narr', '--label', '--mute', '--dim', '--faint', '--ink-ghost', '--rule', '--line', '--edge',
    '--edge-lit', '--chip', '--field', '--gold', '--gold-dim', '--gold-lit', '--on-gold', '--bad',
    '--good', '--warn', '--you-rule', '--speak-rule', '--head', '--dock', '--chrome',
    '--chrome-ink', '--chrome-dim', '--chrome-line', '--panel-line'];
  for (const name of Object.keys(THEMES)) {
    const v: any = themeVars(name);
    for (const k of NEEDED)
      assert.ok(v[k] && String(v[k]).trim(), `${name} leaves ${k} unset — a theme that omits a `
        + 'token inherits whatever the last one set, which is how a half-applied theme looks fine '
        + 'until you switch to it');
  }

  // The claim the design makes for its own derivation: a hint clears 4.5:1 "by construction
  // rather than by inspection". Checked on every theme, against that theme's own paper.
  const rgb = (c: string) => {
    const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c);
    if (m) return [+m[1], +m[2], +m[3]];
    const h = /^#?([0-9a-f]{6})$/i.exec(c.trim());
    return h ? [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)) : null;
  };
  const rel = (c: number[]) => {
    const f = c.map((x) => { const s2 = x / 255; return s2 <= 0.03928 ? s2 / 12.92 : ((s2 + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a: string, b: string) => {
    const x = rgb(a), y = rgb(b);
    if (!x || !y) return NaN;
    const l1 = rel(x), l2 = rel(y);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  for (const [name, spec] of Object.entries(THEMES)) {
    const v: any = themeVars(name);
    const r = ratio(v['--label'], (spec as any).paper);
    assert.ok(r >= 4.5, `${name}: a hint sentence is ${r.toFixed(2)}:1 against its own paper, `
      + 'and the derivation exists to make that 4.5 without anyone checking by eye');
  }
  ok('nine themes, every token derived from one row each, every hint above 4.5:1');
}
}

// Archiving is a status, and the whole of what it does is "not first, and last". The hero of the
// shelf is [0] of shelfOrder, so an archived book taking the hero slot is the failure to catch.
{
  const { shelfOrder } = await import('../web/model.js');
  const shelf = [{ id: 'a', status: 'archived' }, { id: 'b', status: 'in_progress' },
                 { id: 'c', status: 'archived' }, { id: 'd', status: 'finished' }];
  const out = shelfOrder(shelf).map((s: any) => s.id);
  assert.deepStrictEqual(out, ['b', 'd', 'a', 'c'],
    'archived sink to the end; the rest keep the order the server sent');
  assert.notStrictEqual(shelfOrder(shelf)[0].status, 'archived',
    'so an archived book can never take the hero slot');
  assert.deepStrictEqual(shelfOrder([]).length, 0, 'and an empty shelf does not throw');
  ok('archived books sort last and never become the hero of the shelf');
}

// The strip above the hero: what is waiting, across every book. Pure, so it is tested here rather
// than driven through a browser.
{
  const { waiting } = await import('../web/model.js');
  const shelf: any[] = [
    { id: 's-1', title: 'Sutera', status: 'in_progress', proposed: 1, unpaid: 2, flags: 0 },
    { id: 's-2', title: 'The Salt Ledger', status: 'in_progress', proposed: 4, unpaid: 0, flags: 1 },
    { id: 's-3', title: 'Put Away', status: 'archived', proposed: 9, unpaid: 9, flags: 9 },
  ];
  const w = waiting(shelf);
  assert.deepStrictEqual(w.map((x: any) => x.label),
    ['5 threads proposed', '2 promises unpaid', '1 flag'],
    'it counts across books, and says one thread rather than one threads');

  // One press has to go where the work is. Sending you to a list of places the work might be is
  // the thing this replaces.
  assert.strictEqual(w[0].storyTitle, 'The Salt Ledger', 'the book with the most of them wins the link');
  assert.strictEqual(w[1].storyTitle, 'Sutera', 'and each kind is judged on its own count');

  // Archiving is the act that means stop showing me this. A strip that then nags about its unpaid
  // promises has not listened — nine of each are in the archived book and none of them are counted.
  assert.ok(!w.some((x: any) => x.total > 5), 'an archived book is not counted at all');

  assert.deepStrictEqual(waiting([]), [], 'an empty shelf owes nothing');
  assert.deepStrictEqual(waiting([{ id: 's', title: 'x', proposed: 0, unpaid: 0, flags: 0 }] as any), [],
    'and a shelf with nothing outstanding shows no strip rather than three zeroes');
  ok('the shelf says what is waiting, per kind, in the book it is waiting in');

// And the SHELF renders it by book rather than by item. `waiting()` still returns one row per
// waiting thing — that is what the story's own Waiting panel is written against — but a shelf of
// four books listing every item is a wall of chips saying the same three words. Seth: "just bring
// up the titles of the stories that have notifications".
{
  click({ leave: '1' });
  await new Promise((r) => setTimeout(r, 40));
  const page = html('page');
  const chips = page.match(/data-owed="/g) ?? [];
  // Two books are owed something, between them three kinds of thing. By ITEM that is three chips
  // and by BOOK it is two, so the count is what tells the two renderings apart.
  assert.strictEqual(chips.length, 2,
    `the shelf must group by book: two books are owed something, and it drew ${chips.length} chips`);
  assert.match(page, /data-owedpanel="waiting"/,
    'and each one opens that book\'s Waiting panel, which is where the detail lives');
  assert.match(page, /The Salt Ledger/, 'named by the book, not by the kind of thing waiting');
  assert.ok(!/threads proposed/.test(page),
    'and the kinds stay in the panel — the shelf says which book, not what kind');
}
ok('the shelf groups what is waiting by book, and opens the book that is waiting');
}

// The webs and their prose, kept in step. This is the check that fails when somebody adds a help
// icon and forgets to write the text, or renames a control and orphans its entry — which is the
// only way this stays true, because nothing else about it can be verified by reading the code.
{
  const { HELP } = await import('../web/help.js');
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  const used = new Set([...src.matchAll(/help(?:Mark|Body)?\('([a-z]+)'\)/g)].map((m) => m[1]));
  // PANEL_HELP names its slugs as values rather than in a call, so they are read separately.
  for (const m of src.matchAll(/const PANEL_HELP = \{([^}]*)\}/g))
    for (const v of m[1].matchAll(/'([a-z]+)'/g)) used.add(v[1]);

  assert.ok(used.size > 0, 'the source really does use the help helper — the regex is not silently empty');
  for (const slug of used)
    assert.ok(HELP[slug], `web/app.js opens a web for "${slug}" and web/help.js has no entry for it`);
  for (const slug of Object.keys(HELP))
    assert.ok(used.has(slug), `web/help.js explains "${slug}" and nothing in the app opens it`);

  // Definitions, not facts. A number or a list in here is something that will be wrong in a
  // fortnight, which is the whole reason this file is only the evergreen half.
  for (const [slug, h] of Object.entries(HELP) as any) {
    assert.ok(h.title && h.body, `${slug} has both a title and a body`);
    assert.doesNotMatch(h.body, /\b\d{3,}\b/,
      `${slug} quotes a number — help that carries counts or sizes goes stale and this file must not`);
  }
  ok(`every web opens prose, and every prose has a web (${used.size} of them)`);
}

// The three rules down the left margin, and the box on the last one.
{
  const html = String(nodes.get('col').innerHTML);
  assert.ok(!/block[^"']*\byou\b[^"']*"[^>]*text-align:right/.test(html),
    'your own lines are not mirrored to the right edge any more');
  assert.match(html, /class="block[^"]*\bnewest\b/, 'the last passage on the page is marked');
  ok('the writer\'s own lines sit on the same left edge as the prose');
}

// Set like a book: dialogue breaks out into its own paragraph, and a quote inside a sentence does
// not. Pure, so it is tested here rather than through a browser.
{
  const { bookParagraphs } = await import('../web/model.js');
  assert.deepStrictEqual(
    bookParagraphs('She crossed the room. "You came," he said. The rain kept on.'),
    ['She crossed the room.', '"You came," he said. The rain kept on.'],
    'speech that opens a sentence starts its own paragraph');
  // The case that makes a naive rule useless: a quotation inside a sentence is not a new paragraph,
  // and a formatter that breaks there mangles ordinary narration.
  assert.deepStrictEqual(bookParagraphs('The sign said "closed", so she left.'),
    ['The sign said "closed", so she left.'],
    'a quote inside a sentence is left alone');
  assert.deepStrictEqual(bookParagraphs('One.\n\nTwo.'), ['One.', 'Two.'],
    "the model's own paragraph breaks survive");
  assert.deepStrictEqual(bookParagraphs('  '), [], 'nothing in, nothing out');
  // Curly quotes are what the model actually writes.
  assert.strictEqual(bookParagraphs('He waited. \u201cWell?\u201d she said.').length, 2,
    'and curly quotes count, which is what the model actually produces');
  ok('a passage is set like a book, with speech in its own paragraph');
}


// The one control that clears a story's model pin could not clear the only pin that has ever
// needed clearing. `The Shadow's Debt` is pinned to `rp-t-glm47flash-h`; the router's preset list
// was rewritten on 2026-08-27 and that name stopped existing, so the story has answered
// `400 model not found` since. With no option carrying its value, NOTHING in the select was
// selected, the browser fell back to showing the first option — "Default" — and choosing Default
// fired no `change` event because the value had not changed. The hint underneath went on saying
// the story was pinned, disagreeing with the control directly above it.
//
// `test/ui/panels.js` §15 drives this select and could not see it: it pins a model the router DOES
// offer, which is the one case that always worked. The state cannot be reached through the API
// either — `POST /api/story` refuses a model the router does not serve — so the only way in is to
// have been pinned before a rename. Which is why this is a unit check on the pure function.
{
  const live = [{ id: 'write-nt-qwen36-h', status: 'loaded' }, { id: 'rp-nt-ornith-h', status: 'idle' }];

  const orphaned = modelOptions(live, 'rp-t-glm47flash-h');
  const chosen = orphaned.filter((o: any) => o.selected);
  assert.strictEqual(chosen.length, 1,
    `${chosen.length} options selected. Zero is the bug: the browser then shows the FIRST option, `
    + 'which is Default, so the control says "not pinned" while the story is pinned — and picking '
    + 'Default fires no change event, so the pin cannot be cleared from the only control for it.');
  assert.strictEqual(chosen[0].value, 'rp-t-glm47flash-h',
    'and the selected one is what the story is actually set to');
  assert.ok(chosen[0].gone, 'marked as gone, so the option can say why it is not in the list');
  assert.strictEqual(orphaned[0].value, '',
    'Default stays first — leaving the pin is the thing this writer came here to do');
  assert.ok(orphaned.some((o: any) => o.value === 'rp-nt-ornith-h' && !o.gone),
    'and every model the router does offer is still on the list');

  // The ordinary case must not grow a phantom row. A duplicate option for a pin that IS on offer
  // would give the select two entries with the same value, one of them marked unavailable.
  const normal = modelOptions(live, 'rp-nt-ornith-h');
  assert.strictEqual(normal.length, live.length + 1, 'no extra option when the pin is on offer');
  assert.ok(!normal.some((o: any) => o.gone), 'and nothing is marked gone');
  assert.deepStrictEqual(normal.filter((o: any) => o.selected).map((o: any) => o.value), ['rp-nt-ornith-h']);

  assert.deepStrictEqual(modelOptions(live, null).filter((o: any) => o.selected).map((o: any) => o.value), [''],
    'a story that names no model follows Preferences, and the control says so');
  assert.deepStrictEqual(modelOptions([], 'rp-t-glm47flash-h').filter((o: any) => o.selected)
    .map((o: any) => o.value), ['rp-t-glm47flash-h'],
    'even with no models to list, the pin is still what this story is set to');
}
ok('a story pinned to a model the router dropped still shows that pin, and can leave it');

// #23. Preferences was a settings screen carrying an operator's console. What is left is a
// writing record, and these assert the removal rather than trusting it — a page that quietly kept
// one of the three would look right and be wrong.
{
  click({ nav: 'prefs' });
  await new Promise((r) => setTimeout(r, 40));   // the page paints after its stats call is queued
  const page = html('page');
  assert.doesNotMatch(page, /llama-server/, 'the server address is gone');
  assert.doesNotMatch(page, /data-router=/, 'and the restart and stop controls with it');
  assert.doesNotMatch(page, /data-pickmodel=/,
    'and the second copy of the model list — the rail footer has the one that stays');
  assert.match(page, /What you have written/, 'the writing record is what the page is now');
  assert.match(page, /data-backup=|data-exportdb=|Backups/i, 'and the backups door stays');
  ok('Preferences is a writing record: the operator console is gone, the stats and backups stay');
}

// #27. The add-a-thread tray offered four kinds and ONE room — the outfit — and every other room
// existed only after the card did, from the edit form. They are all addons with a slot.
{
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'threads' }); click({ newlore: '1' });
  // TWO STEPS. Fourteen chips at once was every room of every kind in one row, most of them
  // meaningless for what you were about to write — a place has no voice, a rule has no wardrobe.
  const first = html('sideBody');
  for (const k of ['character', 'lore', 'item', 'rule']) {
    assert.match(first, new RegExp(`data-lorekind="${k}"`), `the kinds are offered first (${k})`);
  }
  assert.doesNotMatch(first, /data-lorekind="(interiority|voice|outfit)"/,
    'and no rooms until a kind is picked');

  click({ lorekind: 'character' });
  const second = html('sideBody');
  for (const slot of ['facts', 'role', 'interiority', 'relationships', 'voice', 'history', 'outfit']) {
    assert.match(second, new RegExp(`data-lorekind="${slot}"`), `a character's rooms follow (${slot})`);
  }
  // ONLY THAT KIND'S. `who_is_here` is a place's room and must not be offered for a person, or the
  // writer types one and the database refuses it after the fact.
  assert.doesNotMatch(second, /data-lorekind="(who_is_here|scope|provenance)"/,
    "and only the ones that kind can have");
  // Read as words, not as column names.
  assert.doesNotMatch(second, /"[^"]*">[A-Za-z ]*_/, 'labelled without underscores');
  ok('the tray offers the four kinds, then that kind\'s own rooms, labelled as words');
}

// #22. The cross-shelf Threads page: one book open, the rest collapsed, and cards that do not
// stretch their row. `db.ledgerOf` already orders by `s.updated_at DESC`, so [0] is the book you
// were last writing in — the ordering was never the problem, the twelve grids at once were.
{
  // Back to the workspace first: `data-nav` is the workspace rail, and the block above this one
  // opened a story, where the rail is `data-panel` instead. A nav click inside a story does nothing
  // and the page stays whatever it was — which is how this read as a rendering bug for a minute.
  click({ railview: 'workspace' });
  await new Promise((r) => setTimeout(r, 40));
  click({ nav: 'canon' });
  // The page paints "Reading the threads…" first and fetches; loadLedger repaints when it lands.
  for (let i = 0; i < 20 && !/data-lbook=/.test(html('page')); i++) await new Promise((r) => setTimeout(r, 25));
  const page = html('page');
  assert.match(page, /data-lbook=/, 'every book is a heading you can press');
  assert.match(page, /class="clamp3"/,
    'and a long thread does not stretch its row — the body is clamped in the selectable view');

  // #22 §3. ONE TOGGLE FOR THE WHOLE PANEL, and it opens on the book you were last writing in.
  // The page used to span the shelf whatever you wanted, which is the wall this issue is about.
  assert.strictEqual((page.match(/data-lbook=/g) ?? []).length, 1,
    'it opens on ONE book — the one you were last writing in');
  assert.match(page, /data-lookall="1"/, 'with the shelf one press away');
  assert.match(page, /All 2 books/, 'and the press says how many books that is');

  click({ lookall: '1' });
  const shelf = html('page');
  assert.ok((shelf.match(/data-lbook=/g) ?? []).length > 1, 'pressing it spans the shelf');
  assert.match(shelf, /aria-expanded="true"/, 'the one you were last in is open');
  assert.match(shelf, /aria-expanded="false"/, 'and the rest are not');
  assert.strictEqual((shelf.match(/aria-expanded="true"/g) ?? []).length, 1,
    'exactly one open, or the page is the wall of grids this replaced');
  assert.match(shelf, /data-lookall="0"/, 'and the way back names the book it would go back to');

  // #22 §4. THE ROOMS OF THE PICKED KIND, AND NOTHING UNTIL ONE IS PICKED. Fourteen chips at once
  // is every room of every kind in one row, most of them meaningless for what you are looking at.
  assert.doesNotMatch(shelf, /data-lslot=/, 'no room chips while the row says Everything');
  click({ lkind: 'character' });
  const chars = html('page');
  for (const slot of ['interiority', 'relationships', 'voice']) {
    assert.match(chars, new RegExp(`data-lslot="${slot}"`), `a character's rooms appear (${slot})`);
  }
  // ONLY THAT KIND'S. A place has no wardrobe and a rule has no voice.
  assert.doesNotMatch(chars, /data-lslot="(who_is_here|scope|provenance)"/,
    'and only the ones that kind can have');
  assert.match(chars, /data-lslot=""/, 'with a way back to every room of that kind');

  // A room left on from a kind you are no longer looking at is a page that shows nothing for no
  // visible reason.
  // Asserted on which chip is SELECTED, not on which chips are drawn. `voice` is not among a
  // rule's rooms either way, so a check for its absence here passes whether or not the filter was
  // actually cleared — it would be testing the chip list and reporting on the state.
  const picked = (h: string) => (h.match(/data-lslot="([^"]*)"[^>]*gold-lit/) ?? [])[1];
  click({ lslot: 'voice' });
  assert.strictEqual(picked(html('page')), 'voice', 'the room chip takes the selection');
  click({ lkind: 'rule' });
  const rules = html('page');
  assert.strictEqual(picked(rules), '',
    'and changing kind puts it back on Any room — a filter left on from a kind you are no longer '
    + 'looking at is a page that shows nothing for no visible reason');
  assert.match(rules, /data-lslot="scope"/, 'while the new kind offers its own rooms');
  click({ lkind: 'all' });
  ok('the cross-shelf page opens on one book, spans the shelf on a press, and filters by room');
}

// #25 · THE MODEL PANEL. The block above leaves the app on the workspace with no story open, which
// is exactly the case this panel has to survive: it is the only panel about the BOX rather than
// about a book, the rail footer that opens it is on screen out here too, and `drawSide` was gated
// on `S.place === 'story'` for every other one of them.
{
  const side = () => (globalThis as any).document.getElementById('side');
  click({ modelinfo: 'Qwen3.6-WNTH-35B-A3B-NN' });
  // The panel can be the first thing on screen, so it asks the router itself; that is a fetch.
  for (let i = 0; i < 20 && !/tok\/s/.test(html('sideBody')); i++) await new Promise((r) => setTimeout(r, 25));

  assert.strictEqual(side().hidden, false, 'the model panel opens with no story open');
  const panel = html('sideBody');
  assert.match(panel, /Qwen3\.6/, 'named by its family, not by the whole id');
  assert.match(panel, /Qwen3\.6-WNTH-35B-A3B-NN/, 'and the raw id is on the panel, because that is '
    + 'what the router answers to and what ANANSI_MODEL takes');
  // PER SLOT, NEVER THE WHOLE WINDOW. checks.md called it "context window divided by half":
  // 100,096 is what the model is loaded with and 50,048 is what a writer actually gets, and the
  // panel showing the first would overstate the budget by double.
  assert.match(panel, /50,048 tokens/, 'the budget one writer gets');
  assert.doesNotMatch(panel, /100,096 tokens/, 'never the whole window as if it were the budget');
  // `esc` turns the apostrophe in "router's" into an entity, hence the class rather than the
  // character — a regex written with the literal apostrophe cannot match the rendered panel.
  assert.match(panel, /100,096 cut across 2 slots in the router.{0,6}s preset file/,
    'with which of the four sources it came from beside it');
  assert.match(panel, /58\.4 tok\/s/, 'measured here, not claimed');
  assert.match(panel, /median of 58 calls/);
  assert.doesNotMatch(panel, /too few to lean on/, 'fifty-eight calls is not a thin sample');
  assert.match(panel, /twelve times the speed/, 'the hand-written blurb, quoted from presets.ini');
  assert.match(panel, /data-pickmodel="Qwen3\.6-WNTH-35B-A3B-NN"/,
    'and the switch is on the panel, which is the whole of what checks.md asked for');

  // THE LOADED MODEL'S NUMBER COMES FROM THE RUNNING SERVER, NOT FROM THE FILE. presets.ini says
  // 100000 over two slots; llama-server rounds its own allocation and reports 50,048, and that is
  // what the rail footer directly under this panel already shows. The file is the plan and the
  // server is the truth, so for the one that is loaded the server wins — otherwise two surfaces an
  // inch apart give two answers to one question, which is this repo's own recurring failure.
  click({ modelinfo: 'write-nt-qwen36-h' });
  const loaded = html('sideBody');
  assert.match(loaded, /50,048 tokens/, 'the running server\'s own figure, not the file\'s 50,000');
  assert.match(loaded, /100,096 across the 2 slots the running server opened/, 'and it says so');
  assert.match(loaded, /writing now/, 'and this is the one writing');
  assert.doesNotMatch(loaded, /data-pickmodel=/, 'so there is nothing to switch to');

  // The exception is an exception. A panel about a BOOK still has nothing to say with no book open.
  click({ panel: 'story' });
  assert.strictEqual(side().hidden, true, 'every other panel is still gated on a story being open');

  // A THIN SAMPLE SAYS SO. 41.2 tok/s off three calls and off two hundred are different claims.
  click({ modelinfo: 'Wayfarer-2-RPNT-12B' });
  const thin = html('sideBody');
  assert.match(thin, /median of 3 calls in this library, which is too few to lean on/);
  assert.match(thin, /trained open/, 'and no H does not read as censored');

  // THE SOURCE THAT IS SILENT IS NAMED. A model the preset file does not carry and nobody has
  // written with must say which of those two is true — "not known" twice with no reason is a
  // panel that cannot be acted on, and only one of the two is worth fixing.
  click({ modelinfo: 'Sorcerer-9-WNT-70B' });
  const bare = html('sideBody');
  assert.match(bare, /preset file does not mention this one/);
  assert.match(bare, /nothing has been written with it here yet/);
  assert.match(bare, /Nothing is written down about this one/, 'and no blurb is invented for it');
  assert.match(bare, /Write/, 'while what the id itself encodes is still read');
}
ok('the model panel reads the router, the preset file, this database and the id, and names each');

// THE SAME DECODE ON EVERY SURFACE THAT NAMES A MODEL. Seth, 2026-08-29: "we need the uncensored
// writing roleplay and the nn label on all three panels." Before this only the panel decoded the
// id: the rail's label said "Qwen3.6", its list said "Qwen3.6", and the Storyteller's hint said
// "Qwen3.6" — a family name that says nothing about whether the thing writes or roleplays, whether
// it refuses, or whether it is one of the three that scored write 8/10 in the bakeoff. Every one of
// those four facts was already in the id and none of them was on screen.
//
// Driven with a NEW-CONVENTION model pinned, because the rest of this file runs against the old
// alias — and an alias decodes to two badges, so a fixture that only used one could not tell a
// surface that reads `bits` from a surface that reads nothing.
{
  const wasModel = STORY.model;
  STORY.model = 'Qwen3.6-WNTH-35B-A3B-NN';
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));

  // COMMENTS ARE NOT SURFACE. The first version of this asserted /uncensored/ against the whole
  // rail and stayed GREEN with the badges deleted, because the comment above them quotes the
  // sentence that asked for them. That is the same decorative match test/web.ts already documents,
  // found the same way — by breaking the code on purpose and watching the check not care.
  const visible = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
  const BADGES = /Write · uncensored · novel tier/;

  // 1 · THE RAIL'S LABEL — what is writing right now. Read with the list SHUT, so the only place
  // this string can come from is the label itself.
  const label = visible(html('rail'));
  assert.doesNotMatch(label, /data-modelinfo=/, 'the list is shut, so this is the label alone');
  assert.match(label, BADGES, 'the label says what it is, not only what it is called');

  // 2 · THE RAIL'S LIST. Sliced from the first row, so an assertion here cannot be satisfied by
  // the label above it — the two render the same badge string for the same model, and a check
  // that cannot tell them apart proves nothing about the one it names.
  click({ modelmenu: '1' });
  for (let i = 0; i < 20 && !/tok\/s/.test(html('rail')); i++) await new Promise((r) => setTimeout(r, 25));
  const rail = visible(html('rail'));
  const list = rail.slice(rail.indexOf('data-modelinfo='));
  assert.ok(list.length > 200, 'the list must actually be open');
  assert.match(list, BADGES, 'every row says what it is for, whether it thinks, and its tier');
  assert.match(list, /Roleplay · trained open/,
    'and a model with no H reads as trained open, never as censored');
  // Not the size, on this one: the strip is nowrap with an ellipsis, the size is the longest badge
  // and the least of what was asked for here, and it is one press away on the panel. Anchored to
  // the badge line — the raw id is in each row's own attribute and carries the size with it, so a
  // bare /35B-A3B/ could never fail.
  assert.doesNotMatch(list, /uncensored · 35B-A3B/, 'the size must not be in the badge line here');
  click({ modelmenu: '1' });

  // 3 · THE STORYTELLER, which is where a book pins its own.
  click({ panel: 'teller' });
  await new Promise((r) => setTimeout(r, 30));
  const teller = visible(html('sideBody'));
  assert.match(teller, /<span class="tag">Write<\/span>/, 'the badges are chips here, where there is room');
  assert.match(teller, /<span class="tag">uncensored<\/span>/);
  assert.match(teller, /<span class="tag">novel tier<\/span>/);
  assert.match(teller, /<span class="tag">35B-A3B<\/span>/, 'and the size fits on this one');
  assert.match(teller, /data-modelinfo="Qwen3\.6-WNTH-35B-A3B-NN"/,
    'with a door to the panel that holds the blurb, the speed and the context');
  // The option text in the select is built from `detail` — the badges with the size put back in,
  // one decode rather than a second list that drifts away from it.
  assert.match(teller, /<option[^>]*>Qwen3\.6 — Write · uncensored · 35B-A3B · novel tier/,
    'and the select carries the same decode, size included');

  STORY.model = wasModel;
}
ok('the rail label, the rail list and the Storyteller all read the id the panel reads');

// #17 · HAVE A COVER DRAWN. Seth asked for Pinterest; Pinterest's own API cannot search Pinterest
// — /v5/search/pins reads only pins you have already saved — so this is the free, keyless thing
// that does what was actually wanted. Verified against the live endpoint on 2026-08-29 before a
// line of it was written: open CORS (so no server route), no key, seeds really do vary the image,
// and the anonymous tier answers `sana` at 665x886 whatever size is asked for.
{
  const { coverPrompt } = await import('../web/model.js');

  // THE PREMISE MUST NOT LEAVE THE MACHINE. This string goes into a URL on somebody else's server.
  // A genre and a place are what a cover says out loud anyway; the premise is the book, and it is
  // the one field on this panel that has no business in a third party's logs. Only the FIRST
  // sentence of the setting, which is four to eight sentences by its own prompt.
  // The premise and the second sentence of the setting share NO words on purpose. They did at
  // first — both said "six houses" — and the falsification pass showed what that costs: sending
  // the whole setting tripped the PREMISE assertion, so the check went red for the wrong reason
  // and would have sent the next reader looking in the wrong field.
  const p = coverPrompt({ genre: 'political fantasy', premise: 'A signature, or the hall burns.',
    setting: 'Ashfall Hall, a basalt keep above a dead caldera. Six houses meet there once a year.' });
  assert.doesNotMatch(p, /signature|burns/, 'the premise never reaches the prompt');
  assert.doesNotMatch(p, /Six houses|once a year/, 'and neither does the rest of the setting');
  assert.match(p, /Ashfall Hall/, 'the place does');
  assert.match(p, /political fantasy/, 'and the genre does');
  assert.doesNotMatch(p, /\.\./, 'and the sentence stop is not doubled by the join');
  assert.strictEqual(coverPrompt({ genre: '', setting: '' }), '',
    'a book with neither field gets no prompt rather than one made only of boilerplate');
  assert.ok(coverPrompt({ genre: 'x', setting: 'y '.repeat(400) }).length <= 300, 'and it is capped');

  // The tray is SHUT until asked for — it is the only control in the app that sends any of the
  // book off the machine, so it does not sit open beside a Save button.
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'story' });
  await new Promise((r) => setTimeout(r, 30));
  const shut = html('sideBody');
  assert.match(shut, /data-drawcover="open"/, 'there is a door');
  assert.doesNotMatch(shut, /data-drawprompt/, 'and it is shut');
  assert.doesNotMatch(shut, /pollinations\.ai\/prompt/, 'and nothing has been requested');

  click({ drawcover: 'open' });
  const open = html('sideBody');
  assert.match(open, /data-drawprompt/, 'the box opens');
  assert.match(open, /Ashfall Hall/, 'prefilled from the book, by code rather than by a model call');
  assert.match(open, /pollinations\.ai<\/code>/, 'and it says where the words go before they go');
  // Not /<img/ — the panel already shows the cover this book has. The candidates are what must
  // not be there, and they are the things a press would set.
  assert.doesNotMatch(open, /data-usecover=/, 'but draws nothing until asked');

  // The handler reads the BOX, not the state it was seeded with: the writer may have rewritten it
  // and not left the field, and drawing the stale copy would draw something other than what is on
  // screen. Same trap the proposal queue has, and the same fix.
  const doc = (globalThis as any).document;
  const wasQS = doc.querySelector;
  doc.querySelector = (sel: string) =>
    sel === '[data-drawprompt]' ? { value: '  a drowned lighthouse  ' } : null;
  try {
    DRAWN.length = 0; peakFlight = 0; inFlight = 0;
    // A shot is SETTLED when it is on screen, which is what the guard actually watches. Waiting on
    // DRAWN alone waits for the request to be SENT — the stub records it before it resolves — so a
    // press timed against that would still land mid-draw and be dropped, and the check would be
    // testing the wait rather than the guard.
    const settled = () => [...html('sideBody').matchAll(/data-usecover=|did not arrive/g)].length;
    const until = async (n: number) => {
      for (let i = 0; i < 80 && settled() < n; i++) await new Promise((r) => setTimeout(r, 15));
    };
    // ONE PER PRESS. Measured against the live endpoint: the first draw lands in 2.6s and every one
    // after it in about 45s, so a batch of four is two and a half minutes of blank grid before
    // anything is choosable. The writer asks for the next one, and stops paying the moment one is
    // good enough.
    click({ drawcover: 'go' }); await until(1);
    assert.strictEqual(DRAWN.length, 1, 'one press, one request');

    // A SECOND PRESS WHILE ONE IS IN FLIGHT MUST DO NOTHING. This is the bug as it was reported,
    // in the only form that survives: the free tier answers
    // `429 Queue full for IP: 1 requests already queued (max: 1)`, so a second concurrent request
    // is a refusal rather than a picture. A count of requests passes either way — only the PEAK
    // can fail, which is why it is what is asserted.
    click({ drawcover: 'go' });
    click({ drawcover: 'go' });
    await until(2);
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(peakFlight, 1,
      'the free tier holds one request per address, so two can never be in flight at once');
    assert.strictEqual(DRAWN.length, 2, 'the press that arrived mid-draw was dropped, not queued');

    click({ drawcover: 'go' }); await until(3);
    assert.strictEqual(new Set(DRAWN).size, 3,
      'each draw has its own seed, or it is one image three times — the response is immutable and '
      + 'keyed on prompt and seed');
    assert.ok(DRAWN.every((u) => u.includes('a%20drowned%20lighthouse')),
      'what was typed is what is drawn');
    assert.ok(DRAWN.every((u) => !u.includes('Ashfall')), 'and not what the box was seeded with');
    assert.ok(DRAWN.every((u) => u.startsWith('https://image.pollinations.ai/prompt/')));
    assert.ok(DRAWN.every((u) => u.includes('nologo=true')), 'and no watermark on a book cover');
    // Verified against the live endpoint 2026-08-29: the anonymous tier answers `sana` at 665x886
    // whatever is asked for. A parameter it ignores would read as a control that does something.
    assert.ok(DRAWN.every((u) => !/width=|height=|model=/.test(u)),
      'nothing is sent that the anonymous tier ignores');

    // THE BYTES ARE KEPT. Each tile points at a local blob, so pressing one costs no second
    // request — the first version re-fetched the remote URL on the press, which is one more
    // chance to be told 429 at the moment the writer has decided.
    const tiles = [...html('sideBody').matchAll(/data-usecover="([^"]+)"/g)].map((m) => m[1]);
    assert.strictEqual(tiles.length, 3, 'the candidates pile up rather than replacing each other');
    assert.ok(tiles.every((u) => u.startsWith('blob:')),
      'and each points at the bytes already in hand, not back at pollinations');

    // A REFUSAL IS A TILE, NOT A GAP. A blank square is the bug as it was reported, and a grid that
    // silently comes up short says nothing about why.
    refuseNth = DRAWN.length + 1;
    click({ drawcover: 'go' }); await until(4);
    const mixed = html('sideBody');
    assert.match(mixed, /did not arrive &mdash; the queue was busy/, 'a 429 says so in its own square');
    assert.strictEqual([...mixed.matchAll(/data-usecover="/g)].length, 3,
      'and the three that did arrive are still pressable');
  } finally { doc.querySelector = wasQS; refuseNth = 0; }

  // The blobs do not outlive the panel that showed them.
  const before = LIVE_OBJ.size;
  assert.ok(before > 0, 'there are object urls to let go of');
  click({ drawcover: 'shut' });
  assert.strictEqual(LIVE_OBJ.size, 0, 'shutting the tray revokes every blob it was holding');
  assert.doesNotMatch(html('sideBody'), /data-drawprompt/, 'and it shuts again');
}
ok('a cover can be drawn: the book seeds the words, the writer owns them, and the premise stays home');

// #21 · ONCE IT HAS SPARKED, THE WIZARD IS THE WHOLE SCREEN. checks.md: "The screen after you click
// Spark a Selection shares the original input to start a story and the panel that guides you
// through it. it should only be the panel and nothing else. It is to busy otherwise."
//
// The left column was rendered whatever the state and only the aside swapped, so the idea box
// stayed beside the wizard — and `#idea` has no state binding, so every repaint brought it back
// EMPTY. A blank second textarea beside the thing it just produced reads as a control that lost
// your words, and on a phone `.split` stacks, which put it ABOVE the wizard.
{
  const doc = (globalThis as any).document;
  const wasQS = doc.querySelector;
  click({ railview: 'workspace' });
  await new Promise((r) => setTimeout(r, 40));
  click({ nav: 'create' });
  await new Promise((r) => setTimeout(r, 30));

  const before = html('page');
  assert.match(before, /id="idea"/, 'before it sparks, the idea box is the screen');
  assert.match(before, /data-spark="1"/, 'with the button that sends it');

  // The handler reads the box out of the DOM, so the stub has to answer for it.
  doc.getElementById = (id: string) =>
    id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
  try {
    click({ spark: '1' });
    for (let i = 0; i < 40 && !/data-sp=/.test(html('page')); i++) await new Promise((r) => setTimeout(r, 25));
  } finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }

  const after = html('page');
  assert.match(after, /data-sp="title"/, 'the wizard is on screen');
  assert.match(after, /The Winter Signature/, 'holding what came back');
  // THE POINT OF THE CHANGE. Not /idea/ — the word appears in the prose of the page either way;
  // the ELEMENT is what must be gone, and it is the element that came back empty every repaint.
  assert.doesNotMatch(after, /id="idea"/, 'and the idea box is gone, not merely beside it');
  assert.doesNotMatch(after, /data-spark="1"/, 'along with the button that has nothing left to send');
  assert.doesNotMatch(after, /class="split"/,
    'and the two-column layout with it — on a phone that stacks, which put the dead box on top');
  // (A "rendered exactly once" assertion stood here and was DELETED. Falsifying it — putting
  // `S.spark ? sparkReview() : ''` back into the aside — left the suite green, because the early
  // return means the aside is never reached while S.spark is set. It could not fail while the
  // check above it passes, which is what a redundant guard looks like.)
}
ok('sparking replaces the screen with the wizard rather than sitting it beside an empty box');

// #24 · WHAT CHANGED IS A FILE NOW. Seth, 2026-08-29: "lets just have it show case from one file we
// serve that we update after each commit and we remove the need for a local model to do it."
//
// It was a model call per new commit over up to 26,000 characters of git log, cached per HEAD, and
// it bought both complaints in checks.md. SLOW was the design — the first view after any commit is
// a cold call. NOTHING was three failures wearing one face: not a git checkout, no commits since
// the last batch, and an unusable answer, each returning the stale batch with an error the panel
// could not tell apart.
{
  const { parseNews, news } = await import('../src/news.ts');

  const rel = parseNews([
    '# What changed',
    'Preamble above the first release, which belongs to nobody.',
    '',
    '## 2026-08-29 · Covers can be drawn',
    '### A cover can be drawn',
    'Type what you want and press it.',
    'The second line of the same paragraph.',
    '',
    '### The model row opens a panel',
    'What it is for, how fast it has written here.',
    '',
    '## 2026-08-28 — Threads get rooms',
    '### Rooms',
    'One per part of a card.',
    '',
    '## A release with no date at all',
  ].join('\n'));

  assert.strictEqual(rel.length, 3, 'one release per ##, and the preamble is not one of them');
  assert.strictEqual(rel[0].headline, 'Covers can be drawn');
  assert.strictEqual(rel[0].entries.length, 2, 'one entry per ###');
  assert.strictEqual(rel[0].entries[0].title, 'A cover can be drawn');
  assert.strictEqual(rel[0].entries[0].body,
    'Type what you want and press it. The second line of the same paragraph.',
    'a body runs on across lines rather than keeping the hard wrap of the file');
  // NEWEST FIRST IS THE FILE'S ORDER, not a sort. The panel renders [0] largest, so a file written
  // oldest-first would put the oldest release at the top at the size of a headline.
  assert.strictEqual(rel[1].headline, 'Threads get rooms', 'an em dash separates as well as a middot');
  assert.strictEqual(rel[2].headline, 'A release with no date at all');
  assert.strictEqual(rel[2].at, null, 'and a heading with no date still parses, it just cannot date itself');
  assert.deepStrictEqual(rel[2].entries, [], 'a headline on its own is a legitimate release');

  // NOON, NOT MIDNIGHT. `Date.parse` on a bare ISO day is UTC midnight, which is the previous day
  // west of Greenwich — so every release would have read one day older than it is the moment it
  // was written, and `ago()` renders that as "yesterday".
  assert.strictEqual(new Date(rel[0].at!).toISOString().slice(0, 10), '2026-08-29');
  assert.ok(new Date(rel[0].at!).getDate() === 29,
    'and it is still the 29th in local time, which is what ago() reads');

  // Nothing throws on rubbish; the panel showing less beats the panel showing an error about a
  // file the writer cannot see.
  assert.deepStrictEqual(parseNews(''), []);
  assert.deepStrictEqual(parseNews('### an entry with no release above it\nbody'), []);

  // AND THE REAL FILE, because a parser that only ever sees its own fixture is a parser that has
  // not met the thing it parses. This is what the route actually serves.
  const live = news();
  assert.ok(live.length >= 5, `docs/WHATS-NEW.md must parse into releases (${live.length})`);
  assert.ok(live.every((r: any) => r.headline.trim()), 'every release says something');
  assert.ok(live.some((r: any) => r.entries.length), 'and at least one has entries under it');
}
ok('what changed is read from docs/WHATS-NEW.md, and the parser meets the real file');

// #22 §6 and §8 · WHAT THE FACE OF A CARD SAYS, AND IN WHAT ORDER.
//
// §6, Seth: "after the name comes the body, after the body comes what ever is turned on. all turned
// off option or non activated option live under a second section under all the activated ones."
// The face used to interleave them under one heading per room, so reading down it told you what a
// card HAS rather than what the model will actually be told — and those are different cards once
// half the rooms are off.
//
// §8: "once you click on a card the marked as finished should only show in the edit version."
{
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'threads' });
  click({ entry: 'e-1' });
  await new Promise((r) => setTimeout(r, 30));
  const face = html('sideBody');

  const onAt = face.indexOf('How she sounds');
  const offAt = face.indexOf('What she wants');
  const dividerAt = face.indexOf('Not turned on');
  assert.ok(onAt > 0 && offAt > 0 && dividerAt > 0, 'both rooms and the divider are on the face');
  assert.ok(onAt < dividerAt, 'what is turned on comes first');
  assert.ok(dividerAt < offAt, 'and what is not lives under its own heading, below all of them');
  // The body still comes before either — name, body, then the rooms.
  assert.ok(face.indexOf('speaks for Kesh') < onAt, 'the body comes before the rooms');
  // The jump link has to keep resolving for BOTH: a slot whose only room is off still needs an
  // anchor, or pressing its chip in the head scrolls to nothing.
  assert.match(face, /data-slotat="voice"/, 'the on room anchors its slot');
  assert.match(face, /data-slotat="interiority"/, 'and so does a slot whose only room is off');

  // §8 · READ SAYS WHAT IS TRUE; EDIT IS WHERE YOU CHANGE IT.
  click({ entry: 'e-done' });
  await new Promise((r) => setTimeout(r, 30));
  const done = html('sideBody');
  assert.match(done, /Finished from chapter 2/, 'the face marks a finished card');
  assert.doesNotMatch(done, /data-unretire=/, 'and offers no control — that is what the form is for');
  assert.doesNotMatch(done, /data-retire=/, 'in either direction');

  click({ cardview: 'form' });
  const form = html('sideBody');
  // A RETIRED CARD MUST BE BRINGABLE BACK FROM SOMEWHERE. Moving the way back off the face means
  // the form is now one of the two places that has it — the waiting panel is the other, and
  // test/web.ts asserts that one for the same reason: a wrong press is otherwise invisible AND
  // permanent.
  assert.match(form, /data-unretire="e-done"/, 'the form brings it back');
  assert.match(form, /Finished from chapter 2/, 'and says what it is bringing back from');

  click({ entry: 'e-1' });
  click({ cardview: 'form' });
  assert.match(html('sideBody'), /data-retire="e-1"/,
    'and a live card is finished from the same place, which is the asymmetry this fixed');
  click({ cardview: null });
}
ok('a card face reads body, then what is on, then what is not — and finishing lives in the form');

// #20 · STARTING A BOOK FROM THREADS YOU ALREADY HAVE, and the last place a point of view is
// picked without an example.
//
// checks.md: "the seed a story would be using threads from current stories in the users library to
// help seed or start a story without having to add them later. a jumping off point, or revisiting
// a location type of thing."
{
  const doc = (globalThis as any).document;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'story' });
  await new Promise((r) => setTimeout(r, 30));
  // §1 · THE THIRD PLACE. Blank-create and spark step 2 had the example; editing an existing book
  // did not, and it is the one you come back to.
  assert.match(html('sideBody'), /She came up the stair and the rain came with her/,
    'the Story panel shows a line of prose for the point of view it is set to');

  click({ railview: 'workspace' });
  await new Promise((r) => setTimeout(r, 30));
  click({ nav: 'create' });
  click({ blank: '1' });
  await new Promise((r) => setTimeout(r, 40));
  const form = html('page');
  assert.match(form, /id="seedq"/, 'the form offers the library');
  // Unsearched it shows what is picked and nothing else — the library is hundreds of cards, and a
  // list of all of them is one nobody reads.
  assert.doesNotMatch(form, /data-seedpick=/, 'and lists nothing until you look for something');

  // The box rewrites its own list and never the page: the form reads its fields off the DOM when
  // Create is pressed, so a repaint on a keystroke would throw away everything typed above it.
  const typed = 'A premise typed before the picker was touched.';
  const boxes: any = { premise: { value: typed }, title: { value: 'The Winter Signature' } };
  const wasQS = doc.querySelector;
  doc.querySelector = (sel: string) => {
    const m = /\[data-bf="(\w+)"\]/.exec(sel);
    return m ? (boxes[m[1]] ?? { value: '' }) : null;
  };
  try {
    typeIn('seedq', 'Halsey');
    const list = html('seeds');
    assert.match(list, /data-seedpick="e-1"/, 'searching finds a thread in another book');
    assert.match(list, /The Ashfall Concordat/, 'and says which book it lives in');
    assert.strictEqual(html('page'), form, 'while the form around it is untouched');

    click({ seedpick: 'e-1' });
    assert.match(html('seeds'), /1 chosen/, 'picking one counts it');
    assert.strictEqual(html('page'), form, 'and still does not repaint the form');

    POSTED.length = 0;
    click({ makeblank: '1' });
    await new Promise((r) => setTimeout(r, 60));
    const made = POSTED.find((x) => String(x.url) === '/api/stories');
    assert.ok(made, `the story is created (${POSTED.map((x) => x.url).join(', ')})`);
    assert.strictEqual(made.body.premise, typed,
      'carrying what was typed before the picker was touched — the picker must not cost the form');

    // COPIES, NEVER LINKS, and through the route a single card already uses: db.copyEntry refuses
    // unless BOTH books belong to the caller, and a second copy path would be a second place for
    // that check to be forgotten.
    const copied = POSTED.filter((x) => String(x.url).startsWith('/api/entry/copy'));
    assert.strictEqual(copied.length, 1, 'the chosen thread is copied into the new book');
    assert.strictEqual(copied[0].body.entryId, 'e-1');
    assert.strictEqual(copied[0].body.storyId, 's-1', 'from the book it actually lives in');
    assert.notStrictEqual(copied[0].body.into, 's-1', 'into the new one');
  } finally { doc.querySelector = wasQS; }
}
ok('a book can be started from threads already in the library, and they are copied rather than linked');

// #18 §5 · A BOOK PINNED TO A MODEL THAT IS GONE SAYS SO ON THE SHELF.
//
// The preset list was renamed on 2026-08-27 and the old ids answer `400 model not found`.
// `modelOptions` already synthesised a gone option for exactly this — but only inside the
// Storyteller panel, so a book stayed broken until somebody happened to open it and then happened
// to open that panel. The card is where you look before you press.
{
  click({ railview: 'workspace' });
  await new Promise((r) => setTimeout(r, 30));
  click({ nav: 'stories' });
  for (let i = 0; i < 40 && !/model missing/.test(html('page')); i++) await new Promise((r) => setTimeout(r, 25));
  const shelf = html('page');

  const card = (id: string) => {
    const at = shelf.indexOf(`data-open="${id}"`);
    return at < 0 ? '' : shelf.slice(at, shelf.indexOf('</button>', at));
  };
  assert.match(card('s-2'), /model missing/, 'the book pinned to a preset that is gone is marked');
  assert.match(card('s-2'), /write-nt-qwen36-h/, 'and the mark carries the id, which is what 400s');
  assert.doesNotMatch(card('s-3'), /model missing/, 'a book pinned to a model that IS served is not');
  assert.doesNotMatch(card('s-1'), /model missing/, 'and a book with no pin cannot be broken this way');
  assert.strictEqual((shelf.match(/model missing/g) ?? []).length, 1, 'exactly the one that is wrong');

  // THE CASE THAT MATTERS MOST CANNOT BE STAGED FROM OUT HERE. By the time the shelf renders in
  // this file the router has long since answered, so "not asked yet" is unreachable through the
  // page — and reading it as "not offered" would put a red mark on every book for the second
  // before the answer lands, which is the loudest possible way to be wrong. The rule is a pure
  // function in web/model.js for exactly that reason, and this is where it is driven.
  const { pinIsDead } = await import('../web/model.js');
  const live = [{ id: 'Qwen3.6-WNTH-35B-A3B-NN' }, { id: 'Muse-RPNT-12B' }];
  assert.strictEqual(pinIsDead('write-nt-qwen36-h', live), true, 'a pin nothing serves is dead');
  assert.strictEqual(pinIsDead('Muse-RPNT-12B', live), false, 'a pin something serves is not');
  assert.strictEqual(pinIsDead(null, live), false, 'and no pin cannot be dead');
  assert.strictEqual(pinIsDead('write-nt-qwen36-h', null), false,
    'NOT ASKED YET is not an answer — the list is null until something asks the router');
  assert.strictEqual(pinIsDead('write-nt-qwen36-h', []), false,
    'and an empty list is the router being down, or an allowlist matching nothing, which is not '
    + "this book's fault either");
}
ok('the shelf marks a book pinned to a model the router no longer serves');

// #18 §2 · THE HOUSE STYLE HAS A RE-ROLL, and it fills the box rather than saving it.
{
  const doc = (globalThis as any).document;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'story' });
  await new Promise((r) => setTimeout(r, 30));
  const panel = html('sideBody');
  assert.match(panel, /data-restyle="1"/, 'the style field has a re-roll');
  // ONE FIELD, NOT ALL OF THEM. Voice is yours and a premise cannot guess it; the house style is
  // what a book of this genre does on the page, which the genre and the premise between them say.
  assert.strictEqual((panel.match(/data-restyle=/g) ?? []).length, 1,
    'and it is the only field with one');

  const box: any = { value: 'typed by hand' };
  const wasQS = doc.querySelector;
  doc.querySelector = (sel: string) => (sel === '[data-story="styleNote"]' ? box : null);
  try {
    POSTED.length = 0;
    click({ restyle: '1' });
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(POSTED.some((x) => String(x.url) === '/api/style'), 'it asks the route');
    assert.strictEqual(box.value, 'Wet streets and short sentences.',
      'and writes what came back into the box');
    // PROPOSES, NEVER SAVES. A re-roll that wrote to the story would overwrite something typed by
    // hand with something nobody had read yet — the same bargain every other thing Anansi offers.
    // Asserted as "one request, and it was that one": naming the save route by URL was the first
    // version, and it could not fail — a falsification that called a method which does not exist
    // threw inside the unawaited handler, the box was still filled, and the check stayed green.
    assert.deepStrictEqual(POSTED.map((x) => String(x.url)), ['/api/style'],
      'one request, and saving is not among them');
  } finally { doc.querySelector = wasQS; }
}
ok('the house style can be re-rolled, into the box and not into the story');

console.log(`\n${n} checks passed`);
