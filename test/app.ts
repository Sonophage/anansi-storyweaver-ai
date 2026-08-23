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
    addEventListener() {}, focus() {}, closest: () => null,
    querySelectorAll: () => [], querySelector: () => null,
  };
  nodes.set(id, o); return o;
};
for (const id of ['rail', 'bar', 'appearance', 'read', 'col', 'page', 'dock', 'dockCol',
                  'side', 'sideHead', 'sideBody', 'toast', 'scrim', 'input', 'q', 'idea']) el(id);

const listeners: Record<string, Function[]> = {};
(globalThis as any).document = {
  documentElement: { dataset: {} },
  getElementById: (id: string) => nodes.get(id) ?? el(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (k: string, f: Function) => { (listeners[k] ??= []).push(f); },
};
(globalThis as any).localStorage = { getItem: () => null, setItem() {} };
(globalThis as any).matchMedia = () => ({ matches: false, addEventListener() {} });
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
  ],
  entries: [{ id: 'e-1', title: 'Envoy Sereth', body: '[speaks for Kesh]', entryType: 'character',
              activation: 'always_on', keys: [], lastEditor: 'human', states: [], notes: '' }],
  pins: [], arcs: [],
  violations: [{ id: 'v-1', passageId: 'p-2', entryId: 'e-1', quote: 'x', reason: 'gloves', confidence: 0.8 }],
  proposals: [{ id: 'pr-1', entryId: null, title: 'Witness rite', body: 'A signature is void.',
                entryType: 'lore', keys: [], kind: 'new', delta: 'New fact.', chapterId: 'c-2' }],
};
const MANIFEST = { manifest: { blocks: [
  { kind: 'SPINE', id: 'spine', text: '', tokens: 392, state: 'included', reason: 'capped' },
  { kind: 'CANON-ALWAYS', id: 'e-1', text: '', tokens: 5480, state: 'included', reason: 'always_on', firedBy: ['always_on'] },
  { kind: 'EARLIER', id: 'c-1', text: '', tokens: 1920, state: 'omitted', reason: 'stale summary' },
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
assert.match(html('rail'), /write-nt-qwen36-h/);
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
ok('prose renders as narration, speech, the writer\'s own line, and a flag');

assert.match(html('dockCol'), /Speak/); assert.match(html('dockCol'), /New scene/);
assert.match(html('dockCol'), /Write as Ilva Marren/, 'the composer placeholder follows the mode and persona');
ok('the composer offers all four modes with the right placeholder');

assert.match(html('bar'), /Chapter|The Envoy/);
assert.match(html('bar'), /46%|4[0-9]%/, 'the header shows the real context percentage');
ok('the header reports the manifest percentage from the server');

assert.match(html('sideBody'), /21,401 \/ 46,146/, 'the inspector shows real totals');
assert.match(html('sideBody'), /CANON-ALWAYS/);
assert.match(html('sideBody'), /stale summary/, 'an omitted block must say why');
ok('the inspector renders the real manifest, including what was dropped');

console.log(`\n${n} checks passed`);
