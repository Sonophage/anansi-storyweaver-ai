// The unified surface, booted against a stub DOM and canned API responses that match the REAL
// shapes from src/story.ts and src/routes.ts. This exists because twenty-one field names in
// web/app.js were wrong on the first pass — guessed rather than read — and every one of them
// would have rendered the string "undefined" into the page instead of throwing.
import assert from 'node:assert';

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };

// ---- the smallest DOM these render functions actually touch ----
const nodes = new Map<string, any>();
const el = (id: string) => {
  const o: any = {
    id, innerHTML: '', textContent: '', hidden: false, value: '', scrollTop: 0,
    scrollHeight: 0, clientHeight: 0, style: {}, dataset: {},
    // The reading pane toggles `scrolled` on itself so the running head can appear once the
    // chapter's band has gone by.
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener() {}, focus() {}, closest: () => null,
    querySelectorAll: () => [], querySelector: () => null,
  };
  nodes.set(id, o); return o;
};
for (const id of ['rail', 'bar', 'appearance', 'read', 'col', 'page', 'dock', 'dockCol',
                  'side', 'sideHead', 'sideBody', 'toast', 'scrim', 'input', 'q', 'idea']) el(id);

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
(globalThis as any).localStorage = { getItem: () => null, setItem() {} };
(globalThis as any).matchMedia = () => ({ matches: false, addEventListener() {} });
(globalThis as any).window = { addEventListener() {} };
(globalThis as any).location = { hash: '', pathname: '/' };
(globalThis as any).history = { replaceState() {} };

// ---- canned server, shaped exactly like the routes ----
const SLOT = { global: 100096, slots: 2, perSlot: 50048 };
const STORY = {
  id: 's-1', model: 'write-nt-qwen36-h', slot: SLOT, gen: { temperature: 0.85, top_p: 0.95, max_tokens: 900 },
  story: { title: 'The Ashfall Concordat', genre: 'political fantasy', premise: 'Six houses.',
           setting: 'Ashfall Hall', pov: 'third limited', persona: 'Ilva Marren',
           writingStyle: 'Cold, spare.', direction: 'She signs, or she burns the hall.',
           spice: 3, status: 'in_progress', stripPatterns: null },
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
  entries: [{ id: 'e-1', title: 'Envoy Sereth', body: '[speaks for Kesh]', entryType: 'character',
              activation: 'always_on', keys: [], lastEditor: 'human', states: [], notes: '' }],
  pins: [], arcs: [],
  violations: [{ id: 'v-1', passageId: 'p-2', entryId: 'e-1', quote: 'x', reason: 'gloves', confidence: 0.8 }],
  strings: [{ id: 'st-1', title: 'The letter he has not opened', body: 'Sent by his brother',
              fromChapter: 1, owedBy: 4, status: 'open', summoned: false }],
  proposals: [{ id: 'pr-2', entryId: null, title: 'The debt nobody has called in',
                body: 'Marek has not asked yet.', entryType: 'string', keys: ['2'], kind: 'new',
                delta: 'A promise, unpaid', chapterId: 'c-2' },
              { id: 'pr-1', entryId: null, title: 'Witness rite', body: 'A signature is void.',
                entryType: 'lore', keys: [], kind: 'new', delta: 'New fact.', chapterId: 'c-2' }],
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
], totals: { budget: 46146, used: 21401, unallocated: 0 }, byKind: {}, overflowed: false }, prompt: '', exact: 21401 };

(globalThis as any).fetch = async (url: string) => {
  const body = url.startsWith('/api/stories') ? { stories: [{ id: 's-1', title: 'The Ashfall Concordat', status: 'in_progress', updatedAt: Date.now(), words: 9140, last: 'She left.' }], model: 'write-nt-qwen36-h', slot: SLOT, gen: STORY.gen }
    : url.startsWith('/api/story') ? STORY
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
}

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
ok('the story list renders from the library response');

// ---- now open the story, which is where the field names bit ----
const click = (dataset: any) => listeners.click?.[0]?.({ target: { closest: () => ({ dataset }) } });
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

assert.match(html('col'), /The hall smells of cold iron/);
assert.match(html('col'), /Envoy Sereth/, 'a speaker label must render');
assert.match(html('col'), /You · Ilva Marren/, 'a human passage must be attributed to the persona');
assert.match(html('col'), /class="block speak"/, 'quoted prose is a speech block');
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

for (const label of ['Continue', 'Speak', 'Act', 'Direct', 'Narrate']) {
  assert.match(html('dockCol'), new RegExp(`>${label}<`), `the composer must offer ${label}`);
}
// Continue is a BUTTON, not a mode: it sends with nothing typed, so it must not be selectable
// and must not carry a placeholder of its own.
assert.match(html('dockCol'), /data-continue="1"/, 'Continue must act, not select');
assert.doesNotMatch(html('dockCol'), /data-mode="continue"/, 'Continue is not a selected mode');
assert.match(html('dockCol'), /Say it as Ilva Marren/, 'the placeholder follows the mode and the persona');
// Speak happens as someone, and the default is the point-of-view character.
assert.match(html('dockCol'), /id="asWhom"/, 'Speak must offer who you are speaking as');
ok('the composer offers all five modes, with Continue as an action');

assert.match(html('bar'), /Chapter|The Envoy/);
assert.match(html('bar'), /46%|4[0-9]%/, 'the header shows the real context percentage');
ok('the header reports the manifest percentage from the server');

assert.match(html('sideBody'), /21,401 \/ 46,146/, 'the inspector shows real totals');
assert.match(html('sideBody'), /stale summary/, 'an omitted block must say why');
ok('the inspector renders the real manifest, including what was dropped');

// A row is a door. It used to be labelled in the engine's words — CANON-ALWAYS — and open a panel
// headed Threads, so arriving meant hunting for what you had just clicked. The label now comes
// from the destination, and both come from one table.
const { BLOCK_ORIGIN } = await import('../web/model.js');
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
}

console.log(`\n${n} checks passed`);
