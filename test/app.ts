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

// ---- canned server, shaped exactly like the routes ----
const SLOT = { global: 100096, slots: 2, perSlot: 50048 };
const STORY = {
  id: 's-1', model: 'write-nt-qwen36-h', slot: SLOT, gen: { temperature: 0.85, top_p: 0.95, max_tokens: 900 },
  // This book has a look of its own, and only a THEME. The rest has to come from the writer's
  // default — a book that pinned all four would pass a check that a book that pins one would not.
  look: { theme: 'ink' },
  story: { title: 'The Ashfall Concordat', genre: 'political fantasy', premise: 'Six houses.',
           setting: 'Ashfall Hall', pov: 'third limited', persona: 'Ilva Marren',
           writingStyle: 'Cold, spare.', direction: 'She signs, or she burns the hall.',
           spice: 3, status: 'in_progress', stripPatterns: null,
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
  entries: [{ id: 'e-1', title: 'Envoy Sereth', body: '[speaks for Kesh]', entryType: 'character',
              activation: 'always_on', keys: [], lastEditor: 'human', states: [], notes: '' }],
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
// `used` and `exact` DIFFER on purpose, and by roughly the 1.28x bench/drift.ts measured. They
// were the same number until 2026-08-28, which meant the checks below could not tell which one
// the surface was reading — and the surface was reading the wrong one: /api/manifest has returned
// the tokenizer's `exact` since the route was written and app.js drew the bar from the estimate.
// A fixture whose two candidate answers are identical is the tag-splitting fixture with no comma
// in it, arriving again.
], totals: { budget: 46146, used: 27401, unallocated: 0 }, byKind: {}, overflowed: false }, prompt: '', exact: 21401 };

const POSTED: any[] = [];
(globalThis as any).fetch = async (url: string, init?: any) => {
  if (init?.body) { try { POSTED.push({ url, body: JSON.parse(init.body) }); } catch { /* not JSON */ } }
  // Three books, not one, and the two extras exist only so the shelf's ORDER can be wrong. With a
  // single story there is no grid to come after the New story button, so an assertion about where
  // that button sits is true wherever the button is put.
  const body = url.startsWith('/api/stories') ? { stories: [{ id: 's-1', title: 'The Ashfall Concordat', status: 'in_progress', updatedAt: Date.now(), words: 9140, last: 'She left.' },
      // Two of the three are owed something, and between them five separate things — so a shelf that
      // listed items would show five chips where it must show two.
      { id: 's-2', title: 'The Salt Ledger', status: 'in_progress', updatedAt: 2, words: 400, last: 'He paid.',
        proposed: 3, unpaid: 1, flags: 0 },
      { id: 's-3', title: 'Sutera', status: 'draft', updatedAt: 1, words: 0, last: null,
        proposed: 0, unpaid: 0, flags: 2 }], model: 'write-nt-qwen36-h', slot: SLOT, gen: STORY.gen,
      // The writer's default look rides the library call, which is the first thing asked for.
      look: { theme: 'parchment', font: 'garamond', size: 'l', scale: '110' } }
    : url.startsWith('/api/story') ? STORY
    // The chapter naming its own next chapter. Answered properly rather than with {}, because an
    // empty answer is a different case and it has its own guard.
    : url.startsWith('/api/chapter/propose') ? { chapterId: 'c-2', title: 'The Rust Year',
        note: 'By the end the debt has to be called in, and Marek has to be in the room for it.' }
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

console.log(`\n${n} checks passed`);
